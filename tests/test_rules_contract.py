from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "rulesync.jsonc"
SOURCE = ROOT / ".rulesync/rules/overview.md"
GENERATED = ROOT / "AGENTS.md"
PACKAGE = ROOT / "package.json"
BINARY = ROOT / "node_modules/.bin/rulesync"
BDD_CONFIG = ROOT / ".pi/bdd.json"
GENERATE_SCRIPT = ROOT / "scripts/generate-rules.sh"
CHECK_SCRIPT = ROOT / "scripts/check-rulesync-drift.sh"
ROOT_TEST_SCRIPT = ROOT / "scripts/test-root.sh"
README = ROOT / "README.md"
EXPECTED_VERSION = "16.9.1"

# Causal red order: first missing production path must surface as the GOV-01 signature.
REQUIRED_PATHS = (
    (CONFIG, "rulesync.jsonc is missing"),
    (SOURCE, ".rulesync/rules/overview.md is missing"),
    (GENERATED, "generated AGENTS.md is missing"),
    (PACKAGE, "root package.json is missing"),
    (BDD_CONFIG, "root .pi/bdd.json is missing"),
    (GENERATE_SCRIPT, "scripts/generate-rules.sh is missing"),
    (CHECK_SCRIPT, "scripts/check-rulesync-drift.sh is missing"),
    (ROOT_TEST_SCRIPT, "scripts/test-root.sh is missing"),
)


class RulesContractTests(unittest.TestCase):
    """GOV-01 contract: Rulesync governance + root assurance adapter."""

    def require_green_files(self) -> None:
        missing = [message for path, message in REQUIRED_PATHS if not path.is_file()]
        if missing:
            self.skipTest("blocked by causal GOV-01 red: " + "; ".join(missing))

    def test_canonical_rules_contract_exists(self) -> None:
        # E1 / Scenario: Missing canonical rule source is a causal red
        for path, message in REQUIRED_PATHS:
            self.assertTrue(path.is_file(), message)

    def test_rulesync_version_and_target_map_are_exact(self) -> None:
        # R2, R3 — exact 16.9.1 and agentsmd + rules only
        self.require_green_files()
        package = json.loads(PACKAGE.read_text(encoding="utf-8"))
        self.assertEqual(package["devDependencies"]["rulesync"], EXPECTED_VERSION)

        config_text = CONFIG.read_text(encoding="utf-8")
        # rulesync.jsonc may be pure JSON; strip // line comments if present
        stripped_lines = []
        for line in config_text.splitlines():
            stripped_lines.append(line.split("//", 1)[0])
        config = json.loads("\n".join(stripped_lines))

        self.assertEqual(config["targets"], ["agentsmd"])
        self.assertEqual(config["features"], ["rules"])
        self.assertNotIn("commands", config.get("features", []))
        self.assertNotIn("subagents", config.get("features", []))
        # Root emission only — no vendor stow package outputs
        serialized = json.dumps(config)
        for forbidden in (".codex", ".claude", ".grok", ".opencode", ".cursor"):
            self.assertNotIn(forbidden, serialized)
        self.assertIn(f"/v{EXPECTED_VERSION}/", config.get("$schema", ""))

    def test_wrappers_refuse_missing_or_wrong_local_dependency(self) -> None:
        # R3 / E4 / E5 — no install, exit 127 when binary absent, refuse wrong version
        self.require_green_files()
        for source in (GENERATE_SCRIPT, CHECK_SCRIPT):
            with self.subTest(script=source.name), tempfile.TemporaryDirectory() as directory:
                sandbox = Path(directory)
                script = sandbox / "scripts" / source.name
                script.parent.mkdir(parents=True)
                shutil.copy2(source, script)
                script.chmod(0o755)
                result = subprocess.run(
                    [str(script)],
                    cwd=sandbox,
                    text=True,
                    capture_output=True,
                    check=False,
                    env={
                        "PATH": "/usr/bin:/bin",
                        "HOME": str(sandbox / "home"),
                    },
                )
                self.assertEqual(result.returncode, 127, result.stderr or result.stdout)
                combined = (result.stderr or "") + (result.stdout or "")
                self.assertIn("bun install --frozen-lockfile", combined)
                self.assertNotIn("npm install", combined.lower())
                self.assertNotIn("curl ", combined.lower())
                self.assertFalse((sandbox / "node_modules").exists())

        with tempfile.TemporaryDirectory() as directory:
            sandbox = Path(directory)
            script = sandbox / "scripts" / "generate-rules.sh"
            script.parent.mkdir(parents=True)
            shutil.copy2(GENERATE_SCRIPT, script)
            script.chmod(0o755)
            fake = sandbox / "node_modules" / ".bin" / "rulesync"
            fake.parent.mkdir(parents=True)
            fake.write_text(
                "#!/usr/bin/env sh\nprintf '0.0.0\\n'\n",
                encoding="utf-8",
            )
            fake.chmod(0o755)
            result = subprocess.run(
                [str(script)],
                cwd=sandbox,
                text=True,
                capture_output=True,
                check=False,
                env={"PATH": "/usr/bin:/bin", "HOME": str(sandbox / "home")},
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotEqual(result.returncode, 127)
            combined = (result.stderr or "") + (result.stdout or "")
            self.assertIn(f"expected {EXPECTED_VERSION}", combined)
            # Must fail before generation side effects
            self.assertFalse((sandbox / "AGENTS.md").exists())

    def test_generation_is_deterministic_and_drift_sensitive(self) -> None:
        # R4 / E2 / E3 / E8 — temp-repo only; identical bytes; drift fails; agentsmd only
        self.require_green_files()
        self.assertTrue(
            BINARY.is_file() or BINARY.is_symlink(),
            "local Rulesync binary missing",
        )

        with tempfile.TemporaryDirectory() as directory:
            sandbox = Path(directory)
            shutil.copy2(CONFIG, sandbox / CONFIG.name)
            shutil.copytree(ROOT / ".rulesync", sandbox / ".rulesync")

            first = subprocess.run(
                [str(BINARY), "generate"],
                cwd=sandbox,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(first.returncode, 0, first.stderr or first.stdout)
            output = sandbox / "AGENTS.md"
            self.assertTrue(output.is_file(), "AGENTS.md was not generated")
            first_bytes = output.read_bytes()

            # Only AGENTS.md outside .rulesync/**
            generated_outside = sorted(
                p.relative_to(sandbox)
                for p in sandbox.rglob("*")
                if p.is_file()
                and not str(p.relative_to(sandbox)).startswith(".rulesync/")
                and p.name != "rulesync.jsonc"
            )
            self.assertEqual(generated_outside, [Path("AGENTS.md")])
            for vendor in (".codex", ".claude", ".grok", ".opencode", ".cursor", ".pi"):
                self.assertFalse(
                    (sandbox / vendor).exists(),
                    f"unexpected vendor output {vendor}",
                )

            second = subprocess.run(
                [str(BINARY), "generate"],
                cwd=sandbox,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(second.returncode, 0, second.stderr or second.stdout)
            self.assertEqual(output.read_bytes(), first_bytes)

            clean = subprocess.run(
                [str(BINARY), "generate", "--check"],
                cwd=sandbox,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(clean.returncode, 0, clean.stderr or clean.stdout)

            output.write_text(
                output.read_text(encoding="utf-8") + "\nDirect edit.\n",
                encoding="utf-8",
            )
            drift = subprocess.run(
                [str(BINARY), "generate", "--check"],
                cwd=sandbox,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(drift.returncode, 0)
            drift_text = ((drift.stderr or "") + (drift.stdout or "")).lower()
            self.assertTrue(
                "drift" in drift_text
                or "agents.md" in drift_text
                or "differ" in drift_text
                or "mismatch" in drift_text,
                msg=f"drift failure should name drift/output, got: {drift_text!r}",
            )

    def test_checked_in_generated_rule_is_current_and_declares_ownership(self) -> None:
        # R1 / R6 — tracked AGENTS.md matches canonical input and states ownership split
        self.require_green_files()
        check = subprocess.run(
            [str(CHECK_SCRIPT)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(check.returncode, 0, check.stderr or check.stdout)
        text = GENERATED.read_text(encoding="utf-8")
        self.assertIn("rulesync.jsonc", text)
        self.assertIn(".rulesync", text)
        self.assertIn("agents-shared/.agents", text)
        self.assertRegex(
            text,
            r"(?i)do not (manually )?edit generated",
        )

    def test_root_bdd_command_is_real_and_composed(self) -> None:
        # R5 / E6 / E7 / E9 — real unit command, fail-fast composition, repo-only verify
        self.require_green_files()
        config = json.loads(BDD_CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["commands"]["unitTest"], "bash scripts/test-root.sh")
        # Must not be the inferred missing-command default
        self.assertNotEqual(config["commands"]["unitTest"], "exit 127")

        script = ROOT_TEST_SCRIPT.read_text(encoding="utf-8")
        normalized = script.replace("'", '"')
        self.assertIn("set -euo pipefail", script)
        self.assertIn("python3 -m unittest", script)
        self.assertIn("verify-ai-resources.py", script)
        self.assertIn("--repo", script)
        self.assertNotIn("--home", script)
        self.assertIn('cd "$ROOT/pi"', normalized)
        self.assertIn("bun test", script)
        self.assertIn(
            'cd "$ROOT/agents-shared/.agents/adapters/pi/personal"',
            normalized,
        )
        # Fail-fast: no masking of child failures
        self.assertNotIn("|| true", script)
        self.assertNotIn("||:", script)

        # Composed fail-fast behavior: set -euo pipefail must stop after a failing child
        with tempfile.TemporaryDirectory() as directory:
            sandbox = Path(directory)
            probe = sandbox / "probe-fail.sh"
            probe.write_text(
                "#!/usr/bin/env bash\nset -euo pipefail\nfalse\necho should-not-run\n",
                encoding="utf-8",
            )
            probe.chmod(0o755)
            result = subprocess.run(
                ["bash", str(probe)],
                cwd=sandbox,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("should-not-run", result.stdout)

    def test_readme_documents_generation_and_ownership(self) -> None:
        # README governance documents Rulesync ownership and operator commands
        self.require_green_files()
        readme = README.read_text(encoding="utf-8")
        self.assertRegex(readme, r"(?i)AI rule governance|Rulesync|rulesync")
        self.assertIn("agents-shared/.agents", readme)
        self.assertTrue(
            "bun run rules:check" in readme
            or "scripts/check-rulesync-drift.sh" in readme
            or "rules:check" in readme,
            "README must document the drift-check operator command",
        )
        self.assertTrue(
            "bun run rules:generate" in readme
            or "scripts/generate-rules.sh" in readme
            or "rules:generate" in readme,
            "README must document the generate operator command",
        )


if __name__ == "__main__":
    unittest.main()
