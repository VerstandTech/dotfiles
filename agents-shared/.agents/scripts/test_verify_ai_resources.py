#!/usr/bin/env python3

import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("verify-ai-resources.py")
SPEC = importlib.util.spec_from_file_location("verify_ai_resources", MODULE_PATH)
assert SPEC and SPEC.loader
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class FrontmatterTests(unittest.TestCase):
    def test_parses_folded_description_and_body(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "SKILL.md"
            path.write_text(
                "---\n"
                "name: sample-skill\n"
                "description: >\n"
                "  First line.\n"
                "  Second line.\n"
                "---\n\n"
                "# Body\n",
                encoding="utf-8",
            )
            metadata, body = VERIFY.parse_frontmatter(path)

        self.assertEqual(metadata["name"], "sample-skill")
        self.assertEqual(metadata["description"], "First line. Second line.")
        self.assertEqual(body, "# Body")

    def test_rejects_missing_frontmatter(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "agent.md"
            path.write_text("# Agent\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "opening YAML"):
                VERIFY.parse_frontmatter(path)


class PolicyTests(unittest.TestCase):
    def test_generated_claude_link_detects_dangling_canonical_target(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            deployed = home / ".agents/skills"
            claude = home / ".claude/skills"
            deployed.mkdir(parents=True)
            claude.mkdir(parents=True)
            generated = claude / "removed-skill"
            generated.symlink_to("../../.agents/skills/removed-skill")
            foreign = claude / "foreign"
            foreign.symlink_to("/tmp/foreign-skill")

            self.assertTrue(
                VERIFY.is_generated_claude_skill_link(generated, deployed)
            )
            self.assertFalse(VERIFY.is_generated_claude_skill_link(foreign, deployed))

    def test_only_explicitly_safe_codex_rules_may_auto_allow(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            rules = repo / "agents-shared/.agents/adapters/codex/rules/default.rules"
            rules.parent.mkdir(parents=True)
            rules.write_text(
                'prefix_rule(pattern=["rm"], decision="allow")\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            VERIFY.validate_rules(repo, errors)
            self.assertEqual(len(errors), 1)

            rules.write_text(
                'prefix_rule(pattern=["git", "ls-remote"], decision="allow")\n'
                'prefix_rule(pattern=["rm"], decision="prompt")\n',
                encoding="utf-8",
            )
            errors.clear()
            VERIFY.validate_rules(repo, errors)
            self.assertEqual(errors, [])

    def test_grok_config_rejects_auto_approval(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            config = repo / "grok/.grok/config.toml"
            config.parent.mkdir(parents=True)
            config.write_text(
                '[ui]\npermission_mode = "always-approve"\n\n'
                '[skills]\npaths = ["~/.agents/skills"]\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            VERIFY.validate_grok_config(repo, errors)
            self.assertEqual(len(errors), 1)

            config.write_text(
                '[ui]\npermission_mode = "ask"\n\n'
                '[skills]\npaths = ["~/.agents/skills"]\n',
                encoding="utf-8",
            )
            errors.clear()
            VERIFY.validate_grok_config(repo, errors)
            self.assertEqual(errors, [])

    def test_skill_rejects_vendor_specific_runtime_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            skill = repo / "agents-shared/.agents/skills/demo-skill/SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text(
                "---\n"
                "name: demo-skill\n"
                "description: Demonstrates validation.\n"
                "---\n\n"
                "Run ~/.grok/skills/demo-skill/script.sh.\n",
                encoding="utf-8",
            )
            errors: list[str] = []
            count = VERIFY.validate_skills(repo, errors)

        self.assertEqual(count, 1)
        self.assertEqual(len(errors), 1)
        self.assertIn("hardcodes vendor skill path", errors[0])


if __name__ == "__main__":
    unittest.main()
