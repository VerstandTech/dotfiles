#!/usr/bin/env python3
"""Stage the closed AI resource package into an explicit empty temporary HOME."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agents-shared/.agents/scripts"))
from package_evidence import package_manifest_fingerprint, resource_fingerprint  # noqa: E402

VERIFIER_PATH = Path(__file__).resolve().parents[1] / "agents-shared/.agents/scripts/verify-ai-resources.py"

DEPLOYED_LINKS = {
    ".claude/agents": "agents-shared/.agents/adapters/claude/agents",
    ".claude/CLAUDE.md": "agents-shared/.agents/adapters/claude/CLAUDE.md",
    ".claude/RTK.md": "agents-shared/.agents/adapters/claude/RTK.md",
    ".codex/rules": "agents-shared/.agents/adapters/codex/rules",
    ".codex/AGENTS.md": "agents-shared/.agents/adapters/codex/AGENTS.md",
    ".codex/RTK.md": "agents-shared/.agents/adapters/codex/RTK.md",
    ".grok/config.toml": "grok/.grok/config.toml",
    ".pi/agent/personal": "agents-shared/.agents/adapters/pi/personal",
}


def refuse(code: str) -> int:
    print(f"PKG-01 staging blocked: {code}", file=sys.stderr)
    return 2


def stage(repo: Path, home: Path, host: str) -> int:
    try:
        repo = repo.expanduser().resolve(strict=True)
        home = home.expanduser().resolve(strict=True)
    except (OSError, RuntimeError):
        return refuse("invalid-path")

    if host not in {"macos", "ubuntu"}:
        return refuse("unsupported-host")

    process_home = os.environ.get("HOME")
    if process_home:
        try:
            if home == Path(process_home).expanduser().resolve(strict=True):
                return refuse("real-home-refused")
        except (OSError, RuntimeError):
            return refuse("invalid-path")
    try:
        if not home.is_dir() or any(home.iterdir()):
            return refuse("home-not-empty")
    except OSError:
        return refuse("invalid-path")

    try:
        canonical_skills_path = repo / "agents-shared/.agents/skills"
        if not canonical_skills_path.exists() and not canonical_skills_path.is_symlink():
            return refuse("missing-resources")
        canonical_skills = canonical_skills_path.resolve(strict=True)
        if not canonical_skills.is_dir() or not canonical_skills.is_relative_to(repo):
            return refuse("unsafe-source")
        for source_relative in DEPLOYED_LINKS.values():
            unresolved = repo / source_relative
            if not unresolved.exists() and not unresolved.is_symlink():
                return refuse("missing-resources")
            source = unresolved.resolve(strict=True)
            if not source.is_relative_to(repo):
                return refuse("unsafe-source")
            for descendant in source.rglob("*") if source.is_dir() else ():
                if descendant.is_symlink() and not descendant.resolve(strict=True).is_relative_to(repo):
                    return refuse("unsafe-source")
        for skill in sorted(path for path in canonical_skills.iterdir() if path.is_dir()):
            resolved_skill = skill.resolve(strict=True)
            if not resolved_skill.is_relative_to(repo):
                return refuse("unsafe-source")
            for descendant in resolved_skill.rglob("*"):
                if descendant.is_symlink() and not descendant.resolve(strict=True).is_relative_to(repo):
                    return refuse("unsafe-source")
        manifest = json.loads((repo / "agents-shared/.agents/manifest.json").read_text(encoding="utf-8"))
        package_manifest = manifest["packages"]["piPersonal"]
        manifest_fingerprint = package_manifest["manifestFingerprint"]
        roots = package_manifest["resourceRoots"]
        targets = package_manifest["targets"]
        expected_resources = package_manifest["resourceFingerprint"]
        if (
            not isinstance(manifest_fingerprint, str)
            or manifest_fingerprint != package_manifest_fingerprint(package_manifest)
            or not isinstance(roots, list)
            or expected_resources != resource_fingerprint(repo, roots)
        ):
            return refuse("invalid-manifest")
        package_sources: list[tuple[str, Path]] = []
        for deployed_relative, source_relative in DEPLOYED_LINKS.items():
            unresolved = repo / source_relative
            if not unresolved.exists() and not unresolved.is_symlink():
                return refuse("missing-resources")
            source = unresolved.resolve(strict=True)
            if not source.is_relative_to(repo):
                return refuse("unsafe-source")
            for descendant in source.rglob("*") if source.is_dir() else ():
                if descendant.is_symlink():
                    resolved_descendant = descendant.resolve(strict=True)
                    if not resolved_descendant.is_relative_to(repo):
                        return refuse("unsafe-source")
            package_sources.append((deployed_relative, source))
        skill_sources: list[tuple[str, Path]] = []
        for skill in sorted(path for path in canonical_skills.iterdir() if path.is_dir()):
            resolved_skill = skill.resolve(strict=True)
            if not resolved_skill.is_relative_to(repo):
                return refuse("unsafe-source")
            for descendant in resolved_skill.rglob("*"):
                if descendant.is_symlink():
                    resolved_descendant = descendant.resolve(strict=True)
                    if not resolved_descendant.is_relative_to(repo):
                        return refuse("unsafe-source")
            skill_sources.append((skill.name, resolved_skill))

        settings_source = (repo / "pi/.pi/agent/settings.json").resolve(strict=True)
        if not settings_source.is_relative_to(repo):
            return refuse("unsafe-source")
        package_sources.append((".pi/agent/settings.json", settings_source))

        for deployed_relative, source in package_sources:
            destination = home / deployed_relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.symlink_to(source)

        deployed_skills = home / ".agents/skills"
        claude_skills = home / ".claude/skills"
        deployed_skills.mkdir(parents=True, exist_ok=True)
        claude_skills.mkdir(parents=True, exist_ok=True)
        for skill_name, resolved_skill in skill_sources:
            deployed = deployed_skills / skill_name
            deployed.symlink_to(resolved_skill)
            (claude_skills / skill_name).symlink_to(deployed)
    except (OSError, RuntimeError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return refuse("staging-failed")

    verification = subprocess.run(
        [sys.executable, str(VERIFIER_PATH), "--repo", str(repo), "--home", str(home)],
        env={**os.environ, "HOME": str(repo)},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if verification.returncode != 0:
        return refuse("verification-failed")

    print(json.dumps({
        "schemaVersion": 1,
        "status": "verified",
        "verifier": "verify-ai-resources-v1",
        "host": host,
        "manifestFingerprint": manifest_fingerprint,
        "resourceFingerprint": expected_resources,
        "targets": targets,
        "stagingRoot": str(home),
    }, sort_keys=True, separators=(",", ":")))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--host", required=True)
    args = parser.parse_args()
    return stage(args.repo, args.home, args.host)


if __name__ == "__main__":
    raise SystemExit(main())
