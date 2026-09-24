#!/usr/bin/env python3
"""Build the compact, browser-facing summary used by the Overview panel."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "expt_data" / "manifest.json"
OUTPUT = ROOT / "data" / "overview.json"
TAU2_DOMAIN_ORDER = [
    "airline",
    "retail",
    "telecom",
    "telecom-workflow",
    "banking_knowledge",
]
DATASET_BENCHMARKS = {"tau2", "enterpriseops", "bird"}
BENCHMARK_ORDER = ["alfworld", "tau2", "enterpriseops", "bird"]


def succeeded(row: dict) -> bool:
    """Environment success is authoritative; hard is legacy fallback only."""
    if row.get("env_success") is not None:
        return int(row["env_success"]) == 1
    return int(row.get("hard", 0)) == 1


def summarize(path: Path) -> dict:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    types: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        task_type = str(row.get("task_type") or row.get("instruction_type") or "unknown")
        types[task_type].append(int(succeeded(row)))

    values = [int(succeeded(row)) for row in rows]
    return {
        "ok": sum(values),
        "n": len(values),
        "pct": round(100 * sum(values) / len(values), 2) if values else None,
        "by_type": {
            key: {
                "ok": sum(group),
                "n": len(group),
                "pct": round(100 * sum(group) / len(group), 2) if group else None,
            }
            for key, group in sorted(types.items())
        },
    }


def merge_summary(left: dict | None, right: dict) -> dict:
    """Combine disjoint result summaries without re-reading browser data."""
    if left is None:
        return right
    by_type: dict[str, dict] = {}
    for task_type in set(left["by_type"]) | set(right["by_type"]):
        lhs = left["by_type"].get(task_type, {"ok": 0, "n": 0})
        rhs = right["by_type"].get(task_type, {"ok": 0, "n": 0})
        ok = lhs["ok"] + rhs["ok"]
        n = lhs["n"] + rhs["n"]
        by_type[task_type] = {
            "ok": ok,
            "n": n,
            "pct": round(100 * ok / n, 2) if n else None,
        }
    ok = left["ok"] + right["ok"]
    n = left["n"] + right["n"]
    return {
        "ok": ok,
        "n": n,
        "pct": round(100 * ok / n, 2) if n else None,
        "by_type": dict(sorted(by_type.items())),
    }


def label(mechanism: str, pair: str, trial: str) -> str:
    names = {
        "no-skill": "No-skill",
        "skillos": "SkillOS",
        "memcurator": "JitMem",
        "memcurator-success-only": "JitMem · successful",
        "memcurator-latest": "JitMem · latest",
        "memcurator-success-latest": "JitMem · successful + latest",
    }
    suffix = f" · {trial.replace('trial', 'trial ')}"
    if mechanism == "no-skill":
        return names[mechanism] + suffix
    models = pair.replace("-", "/")
    return f"{names[mechanism]} · {models}{suffix}"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    experiments: dict[str, dict] = {}
    task_types_by_benchmark: dict[str, set[str]] = defaultdict(set)

    for leaf in manifest.get("leaves", []):
        mechanism, pair, epoch_name, trial, split = leaf.split("/")
        source_path = ROOT / "expt_data" / leaf / "source.json"
        source = json.loads(source_path.read_text()) if source_path.is_file() else {}
        benchmark = source.get("benchmark", "alfworld")
        # Legacy no-skill trials 2/3 used a different interaction budget and lack
        # held-out data, so trial 1 is the canonical epoch-0 baseline.
        if mechanism == "no-skill" and trial != "trial1":
            continue
        results_path = ROOT / "expt_data" / leaf / "results.jsonl"
        if not results_path.exists():
            continue
        match = re.search(r"(\d+)$", epoch_name)
        epoch = int(match.group(1)) if match else 0
        if benchmark in DATASET_BENCHMARKS:
            # Dataset-style benchmarks use official train/test leaves. Their
            # shards are aggregated into one series while remaining selectable
            # through by_type for per-dataset and macro-average views.
            pair = f"{benchmark}-all"
            if mechanism == "no-skill":
                epoch = 0
            split = "valid_seen" if split == "train" else split
        key = "/".join((benchmark, mechanism, pair, trial))
        experiment = experiments.setdefault(
            key,
            {
                "id": key,
                "benchmark": benchmark,
                "mechanism": mechanism,
                "pair": pair,
                "trial": trial,
                "label": (
                    f"{benchmark} · {'No-memory' if mechanism == 'no-skill' else label(mechanism, pair, trial)}"
                    if benchmark in DATASET_BENCHMARKS
                    else label(mechanism, pair, trial)
                ),
                "epochs": {},
            },
        )
        summary = summarize(results_path)
        task_types_by_benchmark[benchmark].update(summary["by_type"])
        epoch_splits = experiment["epochs"].setdefault(str(epoch), {})
        epoch_splits[split] = merge_summary(epoch_splits.get(split), summary)

    mechanism_order = {
        "no-skill": 0,
        "skillos": 1,
        "memcurator": 2,
        "memcurator-success-only": 3,
        "memcurator-latest": 4,
        "memcurator-success-latest": 5,
    }
    ordered = sorted(
        experiments.values(),
        key=lambda item: (
            item["benchmark"],
            mechanism_order.get(item["mechanism"], 99),
            item["pair"],
            item["trial"],
        ),
    )
    payload = {
        "metric": "environment success",
        "epoch0_baseline": "alfworld/no-skill/none/trial1",
        "task_types": sorted(task_types_by_benchmark["alfworld"]),
        "task_types_by_benchmark": {
            benchmark: (
                [domain for domain in TAU2_DOMAIN_ORDER if domain in types]
                if benchmark == "tau2"
                else sorted(types)
            )
            for benchmark, types in (
                (benchmark, task_types_by_benchmark.get(benchmark, set()))
                for benchmark in BENCHMARK_ORDER
            )
        },
        "experiments": ordered,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(ordered)} experiment series")


if __name__ == "__main__":
    main()
