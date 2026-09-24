#!/usr/bin/env python3
"""Materialize the browser-facing experiment tree from the tracked archive."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "expt_data.zip"
DATA_DIR = ROOT / "expt_data"
MANIFEST = DATA_DIR / "manifest.json"


def _safe_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    members = []
    for info in archive.infolist():
        path = PurePosixPath(info.filename)
        if path.is_absolute() or ".." in path.parts:
            raise RuntimeError(f"unsafe archive member: {info.filename}")
        if not path.parts or path.parts[0] != "expt_data":
            raise RuntimeError(f"unexpected archive member: {info.filename}")
        members.append(info)
    return members


def ensure_experiment_data() -> Path:
    if MANIFEST.is_file():
        return MANIFEST
    if not ARCHIVE.is_file():
        raise RuntimeError(f"missing experiment archive: {ARCHIVE}")
    if DATA_DIR.exists():
        raise RuntimeError(
            f"{DATA_DIR} exists without a manifest; move it aside and run again"
        )

    temp_root = Path(tempfile.mkdtemp(prefix=".expt-data-", dir=ROOT))
    try:
        with zipfile.ZipFile(ARCHIVE) as archive:
            members = _safe_members(archive)
            archive.extractall(temp_root, members)

        staged = temp_root / "expt_data"
        staged_manifest = staged / "manifest.json"
        if not staged_manifest.is_file():
            raise RuntimeError("experiment archive has no manifest")
        manifest = json.loads(staged_manifest.read_text(encoding="utf-8"))
        if manifest.get("n_leaves") != len(manifest.get("leaves", [])):
            raise RuntimeError("experiment manifest leaf count is inconsistent")
        os.replace(staged, DATA_DIR)
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
    return MANIFEST


def main() -> int:
    manifest = ensure_experiment_data()
    print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
