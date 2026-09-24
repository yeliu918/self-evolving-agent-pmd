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
import re
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DATA = ROOT / "expt_data"
DEFAULT_OUTPUT = ROOT / "playground_data" / "v1"
EXPECTED_ROWS = {
    ("alfworld", "valid_seen"): 140,
    ("alfworld", "test"): 134,
    ("enterpriseops", "train"): 66,
    ("enterpriseops", "test"): 36,
    ("tau2-airline", "train"): 30,
    ("tau2-airline", "test"): 20,
    ("tau2-banking_knowledge", "train"): 63,
    ("tau2-banking_knowledge", "test"): 34,
    ("tau2-retail", "train"): 74,
    ("tau2-retail", "test"): 40,
    ("tau2-telecom", "train"): 74,
    ("tau2-telecom", "test"): 40,
    ("tau2-telecom-workflow", "train"): 74,
    ("tau2-telecom-workflow", "test"): 40,
}
NON_PRODUCTION = re.compile(
    r"(^|[/_.-])(smoke|debug|dry[-_]?run|incomplete|partial|tmp)([/_.-]|$)",
    re.IGNORECASE,
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


def read_results(path: Path) -> list[dict[str, object]]:
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"{path}: invalid JSON on line {line_number}: {error}") from error
        if not isinstance(row, dict) or not row.get("id"):
            raise ValueError(f"{path}: line {line_number} has no episode id")
        rows.append(row)
    return rows


def benchmark_key(leaf: str, source: dict[str, object]) -> str:
    benchmark = str(source.get("benchmark") or "")
    pair = leaf.split("/")[1]
    if benchmark == "tau2" or pair.startswith("tau2-"):
        return pair
    if benchmark == "enterpriseops" or pair.startswith("enterpriseops-"):
        return "enterpriseops"
    if benchmark == "bird" or pair.startswith("bird-"):
        return "bird"
    return "alfworld"


def validate_leaves(data_dir: Path) -> list[tuple[Path, str, list[dict[str, object]]]]:
    validated = []
    epoch_groups: dict[tuple[str, str, str, str], set[str]] = defaultdict(set)
    for results_path in sorted(data_dir.glob("**/results.jsonl")):
        leaf_dir = results_path.parent
        leaf = leaf_dir.relative_to(data_dir).as_posix()
        parts = leaf.split("/")
        if len(parts) != 5:
            raise ValueError(f"{leaf}: expected mechanism/pair/epoch/trial/split layout")
        source_path = leaf_dir / "source.json"
        source = json.loads(source_path.read_text(encoding="utf-8")) if source_path.exists() else {}
        source_name = str(source.get("source") or "")
        if NON_PRODUCTION.search(leaf) or NON_PRODUCTION.search(source_name):
            print(f"Excluded non-production leaf: {leaf}")
            continue
        if source.get("complete") is False:
            print(f"Excluded incomplete leaf: {leaf}")
            continue

        rows = read_results(results_path)
        ids = [str(row["id"]) for row in rows]
        if len(ids) != len(set(ids)):
            raise ValueError(f"{leaf}: duplicate episode ids")
        expected = EXPECTED_ROWS.get((benchmark_key(leaf, source), parts[4]))
        if expected is None:
            raise ValueError(f"{leaf}: expected row count is not configured")
        if len(rows) != expected:
            raise ValueError(f"{leaf}: incomplete results ({len(rows)} rows; expected {expected})")

        prediction_dir = leaf_dir / "predictions"
        conversation_ids = (
            {path.parent.name for path in prediction_dir.glob("*/conversation.json")}
            if prediction_dir.is_dir()
            else set()
        )
        if conversation_ids and conversation_ids != set(ids):
            missing = len(set(ids) - conversation_ids)
            extra = len(conversation_ids - set(ids))
            raise ValueError(f"{leaf}: partial trajectory set ({missing} missing, {extra} extra)")

        if parts[2].startswith("epoch_"):
            epoch_groups[(parts[0], parts[1], parts[3], parts[4])].add(parts[2])
        validated.append((results_path, leaf, rows))

    expected_epochs = {"epoch_001", "epoch_002", "epoch_003"}
    for group, epochs in epoch_groups.items():
        if epochs != expected_epochs:
            raise ValueError(f"{group}: incomplete epoch series {sorted(epochs)}")
    return validated


def build(data_dir: Path, output_dir: Path, shard_size: int) -> tuple[int, int]:
    leaves: list[str] = []
    leaf_metadata: dict[str, dict[str, int]] = {}
    trajectory_count = 0
    validated = validate_leaves(data_dir)
    for results_path, leaf, rows in validated:
        leaf_dir = results_path.parent
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
            "episodes": len(rows),
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
