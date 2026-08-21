#!/usr/bin/env python3
"""Validate the canonical ~/.agents resource layout and vendor adapters."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

NAME_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
VENDOR_SKILL_PATHS = (
    "~/.claude/skills",
    "~/.codex/skills",
    "~/.config/opencode/skills",
    "~/.grok/skills",
)
SAFE_ALLOW_PREFIXES = {
    ("git", "fetch"),
    ("gh", "pr", "view"),
    ("git", "ls-remote"),
    ("/usr/bin/awk", "{print $1}"),
    ("ps",),
}

EXPECTED_LINKS = {
    "claude/.claude/agents": "agents-shared/.agents/adapters/claude/agents",
    "claude/.claude/CLAUDE.md": "agents-shared/.agents/adapters/claude/CLAUDE.md",
    "claude/.claude/RTK.md": "agents-shared/.agents/adapters/claude/RTK.md",
    "codex/.codex/rules": "agents-shared/.agents/adapters/codex/rules",
    "codex/.codex/AGENTS.md": "agents-shared/.agents/adapters/codex/AGENTS.md",
    "codex/.codex/RTK.md": "agents-shared/.agents/adapters/codex/RTK.md",
    "pi/.pi/agent/personal": "agents-shared/.agents/adapters/pi/personal",
}

ABSENT_REPO_PATHS = (
    "agents-shared/.agents/agents",
    "agents-shared/.agents/rules",
    "claude/.claude/skills",
    "codex/.codex/skills",
    "grok/.grok/skills",
    "opencode/.config/opencode/skills",
)

ABSENT_DEPLOYED_PATHS = (
    ".agents/agents",
    ".agents/rules",
)

DEPLOYED_LINKS = {
    ".claude/agents": "agents-shared/.agents/adapters/claude/agents",
    ".claude/CLAUDE.md": "agents-shared/.agents/adapters/claude/CLAUDE.md",
    ".claude/RTK.md": "agents-shared/.agents/adapters/claude/RTK.md",
    ".codex/rules": "agents-shared/.agents/adapters/codex/rules",
    ".codex/AGENTS.md": "agents-shared/.agents/adapters/codex/AGENTS.md",
    ".codex/RTK.md": "agents-shared/.agents/adapters/codex/RTK.md",
    ".grok/config.toml": "grok/.grok/config.toml",
    ".pi/agent/personal": "agents-shared/.agents/adapters/pi/personal",
    ".pi/agent/settings.json": "pi/.pi/agent/settings.json",
}


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def symlink_points_within(entry: Path, root: Path) -> bool:
    if not entry.is_symlink():
        return False
    lexical_target = Path(
        os.path.abspath(os.path.join(entry.parent, os.readlink(entry)))
    )
    return is_within(lexical_target, root.absolute())


def is_generated_claude_skill_link(entry: Path, deployed_skills: Path) -> bool:
    return symlink_points_within(entry, deployed_skills)


def is_dotfiles_managed_skill(entry: Path, canonical_skills: Path) -> bool:
    if entry.is_symlink():
        return symlink_points_within(entry, canonical_skills)
    if not entry.is_dir():
        return False

    found_managed_link = False
    for child in entry.rglob("*"):
        if child.is_symlink():
            if not symlink_points_within(child, canonical_skills):
                return False
            found_managed_link = True
        elif child.is_file():
            return False
    return found_managed_link


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("missing opening YAML frontmatter delimiter")

    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError("missing closing YAML frontmatter delimiter") from exc

    raw = lines[1:end]
    metadata: dict[str, str] = {}
    index = 0
    while index < len(raw):
        line = raw[index]
        if not line or line[0].isspace() or ":" not in line:
            index += 1
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value in {">", ">-", "|", "|-"}:
            continuation: list[str] = []
            index += 1
            while index < len(raw):
                candidate = raw[index]
                if candidate and not candidate[0].isspace():
                    break
                if candidate.strip():
                    continuation.append(candidate.strip())
                index += 1
            metadata[key] = " ".join(continuation)
            continue

        if (
            key == "description"
            and value
            and value[0] not in {'"', "'"}
            and re.search(r":\s", value)
        ):
            raise ValueError(
                "description plain YAML scalar contains ': '; quote or fold it"
            )

        metadata[key] = value.strip("\"'")
        index += 1

    body = "\n".join(lines[end + 1 :]).strip()
    return metadata, body


def validate_skills(repo: Path, errors: list[str]) -> int:
    root = repo / "agents-shared/.agents/skills"
    if not root.is_dir():
        errors.append(f"missing canonical skills directory: {root}")
        return 0

    names: dict[str, Path] = {}
    count = 0
    for directory in sorted(path for path in root.iterdir() if path.is_dir()):
        count += 1
        skill_file = directory / "SKILL.md"
        if not skill_file.is_file():
            errors.append(f"{directory}: missing SKILL.md")
            continue

        try:
            metadata, _ = parse_frontmatter(skill_file)
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append(f"{skill_file}: {exc}")
            continue

        name = metadata.get("name", "")
        description = metadata.get("description", "").strip()
        if not name:
            errors.append(f"{skill_file}: missing name")
        elif not NAME_PATTERN.fullmatch(name) or len(name) > 64:
            errors.append(f"{skill_file}: invalid Agent Skills name {name!r}")
        elif name != directory.name:
            errors.append(
                f"{skill_file}: name {name!r} does not match directory {directory.name!r}"
            )
        elif name in names:
            errors.append(f"{skill_file}: duplicate skill name also used by {names[name]}")
        else:
            names[name] = skill_file

        if not description:
            errors.append(f"{skill_file}: missing description")
        elif len(description) > 1024:
            errors.append(f"{skill_file}: description exceeds 1024 characters")

        for resource in directory.rglob("*"):
            if not resource.is_file() or resource.is_symlink():
                continue
            try:
                text = resource.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for vendor_path in VENDOR_SKILL_PATHS:
                if vendor_path in text:
                    errors.append(
                        f"{resource}: hardcodes vendor skill path {vendor_path}; use the canonical skill path or a relative script path"
                    )

    return count


def validate_claude_agents(repo: Path, errors: list[str]) -> int:
    root = repo / "agents-shared/.agents/adapters/claude/agents"
    if not root.is_dir():
        errors.append(f"missing Claude agents adapter directory: {root}")
        return 0

    names: set[str] = set()
    count = 0
    for agent_file in sorted(root.glob("*.md")):
        count += 1
        try:
            metadata, body = parse_frontmatter(agent_file)
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append(f"{agent_file}: {exc}")
            continue

        name = metadata.get("name", "")
        description = metadata.get("description", "").strip()
        if not name or not NAME_PATTERN.fullmatch(name):
            errors.append(f"{agent_file}: missing or invalid name")
        elif name != agent_file.stem:
            errors.append(f"{agent_file}: name {name!r} must match filename")
        elif name in names:
            errors.append(f"{agent_file}: duplicate agent name {name!r}")
        else:
            names.add(name)

        if not description:
            errors.append(f"{agent_file}: missing description")
        if not metadata.get("tools"):
            errors.append(f"{agent_file}: tools must be explicitly scoped")
        if metadata.get("permissionMode") != "plan":
            errors.append(f"{agent_file}: permissionMode must be plan")
        if not body:
            errors.append(f"{agent_file}: empty agent prompt body")

    return count


def validate_rules(repo: Path, errors: list[str]) -> None:
    path = repo / "agents-shared/.agents/adapters/codex/rules/default.rules"
    if not path.is_file():
        errors.append(f"missing Codex rules adapter: {path}")
        return

    pattern_re = re.compile(r"pattern=\[(.*?)\]")
    quoted_re = re.compile(r'"([^"]+)"')
    decision_re = re.compile(r'decision="([^"]+)"')
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        pattern_match = pattern_re.search(line)
        decision_match = decision_re.search(line)
        if not pattern_match or not decision_match:
            continue
        prefix = tuple(quoted_re.findall(pattern_match.group(1)))
        if decision_match.group(1) == "allow" and prefix not in SAFE_ALLOW_PREFIXES:
            errors.append(
                f"{path}:{line_number}: prefix {prefix!r} is not approved for auto-allow"
            )


def validate_grok_config(repo: Path, errors: list[str]) -> None:
    path = repo / "grok/.grok/config.toml"
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"{path}: missing or unreadable Grok config: {exc}")
        return
    if not re.search(r"(?m)^\[skills\]\s*$", text):
        errors.append(f"{path}: missing [skills] section")
    if "~/.agents/skills" not in text:
        errors.append(f"{path}: [skills] paths must include ~/.agents/skills")
    if re.search(r'(?m)^\s*yolo\s*=\s*true\s*$', text):
        errors.append(f"{path}: yolo must not be enabled in shared config")
    if re.search(r'(?m)^\s*permission_mode\s*=\s*"always-approve"\s*$', text):
        errors.append(f"{path}: permission_mode must not auto-approve every tool call")
    if re.search(
        r'(?m)^\s*official_marketplace_auto_installed\s*=\s*true\s*$', text
    ):
        errors.append(f"{path}: marketplace auto-install must be disabled")


def validate_manifest(repo: Path, errors: list[str]) -> None:
    from package_evidence import package_manifest_fingerprint, resource_fingerprint
    path = repo / "agents-shared/.agents/manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"{path}: invalid or missing manifest: {exc}")
        return

    if not isinstance(manifest, dict):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-manifest")
        return
    if manifest.get("version") != 1:
        errors.append(f"{path}: expected manifest version 1")
    if manifest.get("canonicalSkills") != "skills":
        errors.append(f"{path}: canonicalSkills must be 'skills'")

    expected_pins = {
        "pi": "0.84.2",
        "pi-subagents": "0.45.2",
        "context-mode": "1.0.169",
        "rulesync": "16.9.1",
    }
    packages = manifest.get("packages")
    if not isinstance(packages, dict):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-manifest")
        return
    package = packages.get("piPersonal")
    if not isinstance(package, dict):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: missing-package")
        return
    package_relative = package.get("path")
    canonical_relative = "agents-shared/.agents/adapters/pi/personal"
    if package_relative != canonical_relative:
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: unsafe-path")
        return
    try:
        package_root = (repo / canonical_relative).resolve(strict=True)
        package_root.relative_to(repo.resolve(strict=True))
    except (OSError, RuntimeError, ValueError):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: unsafe-path")
        return
    if package.get("compatibility") != expected_pins:
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: pin-mismatch")
        return
    if package.get("version") != "0.7.4":
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: version-mismatch")
        return
    required_package_keys = {
        "path", "version", "compatibility", "runtimePackages", "targets", "resourceRoots",
        "resourceFingerprint", "manifestFingerprint",
    }
    if set(package) != required_package_keys:
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-manifest")
        return
    if package.get("targets") != [".pi/agent/personal", ".pi/agent/settings.json"]:
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-manifest")
        return
    expected_runtime_packages = [
        "npm:pi-subagents@0.45.2",
        "npm:context-mode@1.0.169",
        "npm:pi-markdown-preview@0.13.1",
        "npm:pi-cursor-sdk@0.3.6",
        "./personal",
        "npm:pi-web-access@0.13.0",
        "npm:pi-graphiti@0.6.0",
        "npm:pi-ponytail",
    ]
    if package.get("runtimePackages") != expected_runtime_packages:
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: pin-mismatch")
        return
    try:
        settings = json.loads((repo / "pi/.pi/agent/settings.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-package")
        return
    if not isinstance(settings, dict) or settings.get("packages") != expected_runtime_packages:
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: pin-mismatch")
        return
    try:
        if package.get("manifestFingerprint") != package_manifest_fingerprint(package):
            errors.append("PKG01_PACKAGE_MANIFEST_MISSING: fingerprint-mismatch")
            return
        roots = package.get("resourceRoots")
        if not isinstance(roots, list) or package.get("resourceFingerprint") != resource_fingerprint(repo, roots):
            errors.append("PKG01_PACKAGE_MANIFEST_MISSING: resource-mismatch")
            return
    except (OSError, RuntimeError, ValueError, TypeError):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: resource-mismatch")
        return
    try:
        package_json = json.loads(
            (package_root / "package.json").read_text(encoding="utf-8")
        )
    except (OSError, UnicodeError, json.JSONDecodeError):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-package")
        return
    if not isinstance(package_json, dict):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: invalid-package")
        return
    if package_json.get("version") != package.get("version"):
        errors.append("PKG01_PACKAGE_MANIFEST_MISSING: version-mismatch")


def validate_repo_links(repo: Path, errors: list[str]) -> int:
    count = 0
    for relative, expected_relative in EXPECTED_LINKS.items():
        link = repo / relative
        expected = repo / expected_relative
        if not link.is_symlink():
            errors.append(f"{link}: expected a symlink")
            continue
        count += 1
        try:
            resolved = link.resolve(strict=True)
            expected_resolved = expected.resolve(strict=True)
        except FileNotFoundError:
            errors.append(f"{link}: dangling symlink -> {os.readlink(link)}")
            continue
        if resolved != expected_resolved:
            errors.append(f"{link}: resolves to {resolved}, expected {expected_resolved}")

    for relative in ABSENT_REPO_PATHS:
        path = repo / relative
        if path.exists() or path.is_symlink():
            errors.append(f"{path}: superseded resource path must be absent")

    for package in ("claude", "codex", "grok", "opencode", "pi"):
        package_root = repo / package
        for path in package_root.rglob("*"):
            if not path.is_symlink():
                continue
            count += 1
            try:
                resolved = path.resolve(strict=True)
            except FileNotFoundError:
                errors.append(f"{path}: dangling symlink -> {os.readlink(path)}")
                continue
            if not is_within(resolved, repo):
                errors.append(f"{path}: symlink escapes repository -> {resolved}")

    return count


def unexpected_deployed_skill_names(
    canonical_skills: Path, deployed_skills: Path
) -> list[str]:
    canonical_names = {
        path.name for path in canonical_skills.iterdir() if path.is_dir()
    }
    return sorted(
        path.name
        for path in deployed_skills.iterdir()
        if path.name not in canonical_names
        and is_dotfiles_managed_skill(path, canonical_skills)
    )


def validate_deployed(repo: Path, home: Path, errors: list[str]) -> None:
    for relative in ABSENT_DEPLOYED_PATHS:
        path = home / relative
        if path.exists() or path.is_symlink():
            errors.append(f"{path}: superseded deployed resource path must be absent")

    for relative, expected_relative in DEPLOYED_LINKS.items():
        deployed = home / relative
        expected = repo / expected_relative
        try:
            resolved = deployed.resolve(strict=True)
            expected_resolved = expected.resolve(strict=True)
        except FileNotFoundError:
            errors.append(f"{deployed}: missing or dangling deployed resource")
            continue
        if resolved != expected_resolved:
            errors.append(f"{deployed}: resolves to {resolved}, expected {expected_resolved}")

    # With stow --no-folding, ~/.agents/skills is a real directory whose files
    # are links into the canonical package. Validate every skill entrypoint.
    deployed_skills = home / ".agents/skills"
    canonical_skills = repo / "agents-shared/.agents/skills"
    if not deployed_skills.is_dir():
        errors.append(f"{deployed_skills}: missing canonical deployed skills directory")
        return
    canonical_names = {
        path.name for path in canonical_skills.iterdir() if path.is_dir()
    }
    for name in unexpected_deployed_skill_names(canonical_skills, deployed_skills):
        errors.append(
            f"{deployed_skills / name}: deployed skill is absent from the canonical repository"
        )

    claude_skills = home / ".claude/skills"
    for entry in claude_skills.iterdir() if claude_skills.is_dir() else ():
        if not entry.is_symlink():
            continue
        if (
            is_generated_claude_skill_link(entry, deployed_skills)
            and entry.name not in canonical_names
        ):
            errors.append(f"{entry}: stale generated Claude skill link")

    for skill_dir in sorted(path for path in canonical_skills.iterdir() if path.is_dir()):
        expected_skill = skill_dir / "SKILL.md"
        for deployed_root in (deployed_skills, claude_skills):
            deployed_skill = deployed_root / skill_dir.name / "SKILL.md"
            try:
                resolved = deployed_skill.resolve(strict=True)
            except FileNotFoundError:
                errors.append(f"{deployed_skill}: missing or dangling deployed skill")
                continue
            if resolved != expected_skill.resolve(strict=True):
                errors.append(
                    f"{deployed_skill}: resolves to {resolved}, expected {expected_skill.resolve(strict=True)}"
                )


def main() -> int:
    default_repo = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=default_repo)
    parser.add_argument("--home", type=Path)
    args = parser.parse_args()

    repo = args.repo.expanduser().resolve()
    errors: list[str] = []

    skill_count = validate_skills(repo, errors)
    agent_count = validate_claude_agents(repo, errors)
    validate_rules(repo, errors)
    validate_grok_config(repo, errors)
    validate_manifest(repo, errors)
    link_count = validate_repo_links(repo, errors)
    if args.home:
        validate_deployed(repo, args.home.expanduser().resolve(), errors)

    if errors:
        print(f"AI resource validation failed ({len(errors)} issue(s)):", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    deployed = " + deployed home" if args.home else ""
    print(
        f"AI resources OK: {skill_count} skills, {agent_count} Claude agents, "
        f"{link_count} repository symlinks{deployed}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
