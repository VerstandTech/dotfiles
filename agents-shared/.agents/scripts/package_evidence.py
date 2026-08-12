#!/usr/bin/env python3
"""Deterministic PKG-01 manifest and resource fingerprint helpers."""

from __future__ import annotations

import hashlib
import json
import os
import stat
from pathlib import Path
from typing import Any

MAX_RESOURCE_FILES = 4096
MAX_RESOURCE_BYTES = 32 * 1024 * 1024
CANONICAL_RESOURCE_ROOTS = [
    "agents-shared/.agents/adapters/claude",
    "agents-shared/.agents/adapters/codex",
    "agents-shared/.agents/adapters/pi/personal",
    "agents-shared/.agents/skills",
    "grok/.grok/config.toml",
    "pi/.pi/agent/settings.json",
]


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def package_manifest_fingerprint(package: dict[str, Any]) -> str:
    normalized = dict(package)
    normalized.pop("manifestFingerprint", None)
    return sha256_json(normalized)


def _entry(root: Path, path: Path, repo: Path) -> tuple[dict[str, Any], int]:
    relative = path.relative_to(repo).as_posix()
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode):
        raise ValueError("unsafe-symlink")
    if stat.S_ISDIR(metadata.st_mode):
        return ({"path": relative, "kind": "directory"}, 0)
    if stat.S_ISREG(metadata.st_mode):
        if metadata.st_nlink != 1:
            raise ValueError("unsafe-hardlink")
        data = path.read_bytes()
        return ({"path": relative, "kind": "file", "sha256": hashlib.sha256(data).hexdigest()}, len(data))
    raise ValueError("unsafe-file-kind")


def resource_fingerprint(repo: Path, roots: list[str]) -> str:
    repo = repo.resolve(strict=True)
    if roots != CANONICAL_RESOURCE_ROOTS:
        raise ValueError("invalid-resource-roots")
    entries: list[dict[str, Any]] = []
    total_bytes = 0
    for relative in roots:
        candidate = repo / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts:
            raise ValueError("unsafe-resource-root")
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(repo)
        paths = [candidate]
        if candidate.is_dir():
            paths.extend(sorted(candidate.rglob("*"), key=lambda item: item.relative_to(repo).as_posix()))
        for path in paths:
            item, size = _entry(candidate, path, repo)
            entries.append(item)
            total_bytes += size
            if len(entries) > MAX_RESOURCE_FILES or total_bytes > MAX_RESOURCE_BYTES:
                raise ValueError("resource-bound-exceeded")
    return sha256_json({"schemaVersion": 1, "entries": entries})
