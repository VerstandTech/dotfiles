#!/usr/bin/env python3
"""Contract tests for the portable Graphiti setup script."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "setup-graphiti.sh"
COMPOSE = ROOT / "docs" / "graphiti" / "docker-compose-falkordb.yml"
CONFIG = ROOT / "docs" / "graphiti" / "config-docker-falkordb.yaml"
README = ROOT / "docs" / "graphiti" / "README.md"


class SetupGraphitiTests(unittest.TestCase):
    def test_script_exists_and_is_executable(self) -> None:
        self.assertTrue(SCRIPT.is_file())
        self.assertTrue(SCRIPT.stat().st_mode & 0o111)

    def test_script_uses_remapped_ports_and_no_hardcoded_secrets(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("3001", text)
        self.assertIn("8000", text)
        self.assertIn("host.docker.internal:11434/v1", text)
        self.assertIn("nomic-embed-text", text)
        self.assertNotIn("sk-", text)
        self.assertNotIn("xai-", text)
        self.assertIn("startedBySetup", text)
        self.assertIn("projectScoping", text)

    def test_compose_keeps_host_3000_free(self) -> None:
        text = COMPOSE.read_text(encoding="utf-8")
        self.assertIn("3001:3000", text)
        self.assertNotIn('"3000:3000"', text)
        self.assertIn("8000:8000", text)
        self.assertTrue(CONFIG.is_file())
        self.assertIn("setup-graphiti.sh", README.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
