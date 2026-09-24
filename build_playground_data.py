#!/usr/bin/env python3
"""Build the versioned Hugging Face payload used by the playground.

The browser needs result rows and the rendered trajectory fields. It does not
fetch source metadata, evaluation summaries, or duplicated skill-repository
snapshots. Conversations are compacted into bounded shards within each run
leaf, keeping additions incremental and browser downloads small.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DATA = ROOT / "expt_data"
DEFAULT_OUTPUT = ROOT / "playground_data" / "v1"
RUN_ROOTS = (
    "skillos/luna-luna",
    "skillos/luna-sol",
    "skillos/sol-luna",
    "skillos/sol-sol",
    "no-skill/none",
)
STEP_FIELDS = (
    "step",
    "action",
    "reasoning",
    "think",
    "env_feedback",
    "observation",
    "reward",
    "done",
    "role",
    "content",
    "tool_calls",
)


def compact_steps(payload: object) -> list[dict[str, object]]:
    if isinstance(payload, list):
        steps = payload
    elif isinstance(payload, dict) and isinstance(payload.get("steps"), list):
        steps = payload["steps"]
    else:
        return []
    return [
        {key: step[key] for key in STEP_FIELDS if key in step}
        for step in steps
        if isinstance(step, dict)
    ]


def write_json(path: Path, payload: object, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
        ) + ("\n" if pretty else ""),
        encoding="utf-8",
    )


def build(data_dir: Path, output_dir: Path, shard_size: int) -> tuple[int, int]:
    leaves: list[str] = []
    leaf_metadata: dict[str, dict[str, int]] = {}
    trajectory_count = 0
    for run_root in RUN_ROOTS:
        root = data_dir / run_root
        for results_path in sorted(root.glob("**/results.jsonl")):
            leaf_dir = results_path.parent
            leaf = leaf_dir.relative_to(data_dir).as_posix()
            output_leaf = output_dir / leaf
            output_leaf.mkdir(parents=True, exist_ok=True)
            shutil.copy2(results_path, output_leaf / "results.jsonl")
            trajectories: list[tuple[str, list[dict[str, object]]]] = []
            prediction_dir = leaf_dir / "predictions"
            if prediction_dir.is_dir():
                for conversation_path in sorted(prediction_dir.glob("*/conversation.json")):
                    trajectory_id = conversation_path.parent.name
                    with conversation_path.open(encoding="utf-8") as stream:
                        trajectories.append((trajectory_id, compact_steps(json.load(stream))))

            trajectory_index: dict[str, str] = {}
            shard_count = 0
            for offset in range(0, len(trajectories), shard_size):
                shard = dict(trajectories[offset:offset + shard_size])
                shard_path = f"trajectories/part-{shard_count:04d}.json"
                write_json(output_leaf / shard_path, shard)
                trajectory_index.update({trajectory_id: shard_path for trajectory_id in shard})
                shard_count += 1
            write_json(output_leaf / "trajectory-index.json", trajectory_index)
            leaves.append(leaf)
            trajectory_count += len(trajectories)
            leaf_metadata[leaf] = {
                "trajectories": len(trajectories),
                "trajectory_shards": shard_count,
            }

    manifest = {
        "schema_version": 1,
        "layout": "mechanism / model-pair / epoch / trial / split",
        "trajectory_shard_size": shard_size,
        "n_leaves": len(leaves),
        "leaves": leaves,
        "leaf_metadata": leaf_metadata,
    }
    write_json(output_dir / "manifest.json", manifest, pretty=True)
    return len(leaves), trajectory_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--shard-size", type=int, default=50)
    args = parser.parse_args()
    if args.shard_size < 1:
        parser.error("--shard-size must be positive")
    leaf_count, trajectory_count = build(
        args.data_dir.resolve(), args.output_dir.resolve(), args.shard_size
    )
    print(f"Built {leaf_count} leaves with {trajectory_count} trajectories")
