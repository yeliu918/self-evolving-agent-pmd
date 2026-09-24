#!/usr/bin/env python3
"""Audit the experiment bundle consumed by the playground and its plots."""

from __future__ import annotations

import json
import sys
import zipfile
from collections import Counter
from pathlib import Path

from prepare_expt_data import ARCHIVE, DATA_DIR, ensure_experiment_data


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def main() -> int:
    manifest_path = ensure_experiment_data()
    manifest = load_json(manifest_path)
    leaves = manifest.get("leaves", [])
    errors: list[str] = []
    totals = Counter()

    if manifest.get("n_leaves") != len(leaves):
        errors.append("manifest n_leaves does not match leaves")
    if len(leaves) != len(set(leaves)):
        errors.append("manifest contains duplicate leaves")
    canonical_epoch_zero = "no-skill/none/n-a/trial1/test"
    if canonical_epoch_zero not in leaves:
        errors.append("canonical no-skill epoch-0 unseen baseline is missing")

    with zipfile.ZipFile(ARCHIVE) as archive:
        bad_member = archive.testzip()
        if bad_member:
            errors.append(f"archive CRC failure: {bad_member}")
        archived_manifest = json.loads(archive.read("expt_data/manifest.json"))
        if archived_manifest.get("leaves") != leaves:
            errors.append("archive and extracted manifests differ")

    for leaf in leaves:
        parts = leaf.split("/")
        if len(parts) != 5:
            errors.append(f"invalid leaf path: {leaf}")
            continue
        mechanism, pair, epoch, trial, split = parts
        base = DATA_DIR / leaf
        required = [base / "source.json", base / "results.jsonl", base / "eval_summary.json"]
        for path in required:
            if not path.is_file():
                errors.append(f"missing {path.relative_to(DATA_DIR)}")
        if any(not path.is_file() for path in required):
            continue

        source = load_json(base / "source.json")
        benchmark = str(source.get("benchmark") or "alfworld")
        summary = load_json(base / "eval_summary.json")
        rows = load_jsonl(base / "results.jsonl")
        totals["leaves"] += 1
        totals["rows"] += len(rows)

        if source.get("split") != split or source.get("trial") != trial:
            errors.append(f"source metadata does not match path: {leaf}")
        if epoch != "n-a" and source.get("epoch") != epoch:
            errors.append(f"source epoch does not match path: {leaf}")
        if pair != "none" and benchmark not in {"tau2", "enterpriseops", "bird"}:
            curator, judge = pair.split("-", 1)
            source_name = str(source.get("source", ""))
            pair_matches = (
                f"_cur-{curator}_judge-{judge}" in source_name
                or f"_{pair}_" in source_name
                or f"-{pair}_" in source_name
            )
            if not pair_matches:
                errors.append(f"model pair does not match source run: {leaf}")
        if summary.get("n_items") != len(rows):
            errors.append(f"summary n_items does not match results: {leaf}")
        max_turns = summary.get("max_turns")
        expected_max_turns = {"tau2": 200, "enterpriseops": 50, "bird": 1}.get(benchmark, 30)
        if max_turns is not None and max_turns != expected_max_turns:
            errors.append(f"unexpected interaction budget in {leaf}: {max_turns}")

        ids = [str(row.get("id", "")) for row in rows]
        if len(ids) != len(set(ids)) or any(not item for item in ids):
            errors.append(f"missing or duplicate result ids: {leaf}")
        for row in rows:
            # Older no-skill baselines predate the explicit env_success field;
            # their `hard` value is the environment outcome.
            env_success = row.get("env_success", row.get("hard"))
            if env_success not in (0, 1, False, True):
                errors.append(f"missing environment outcome in {leaf}: {row.get('id')}")
                break
            totals["env_success"] += int(bool(env_success))
            if not row.get("task_type"):
                errors.append(f"missing task_type in {leaf}: {row.get('id')}")
                break

        if split == "valid_seen":
            before = "bank_size_before" if mechanism.startswith("memcurator") else "repo_size_before"
            after = "bank_size_after" if mechanism.startswith("memcurator") else "repo_size_after"
            if mechanism != "no-skill" and rows and (before not in rows[0] or after not in rows[-1]):
                errors.append(f"missing memory-size plot inputs: {leaf}")

        prediction_dir = base / "predictions"
        if prediction_dir.is_dir():
            missing_predictions = [item for item in ids if not (prediction_dir / item / "conversation.json").is_file()]
            if missing_predictions:
                errors.append(f"{leaf} is missing {len(missing_predictions)} trajectory files")

    if errors:
        print("Experiment data audit failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Validated {totals['leaves']} leaves, {totals['rows']} results, "
        f"and {totals['env_success']} environment successes."
    )
    print("Plot inputs, checkpoint files, trajectory links, and archive manifest are consistent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
