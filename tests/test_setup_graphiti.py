#!/usr/bin/env python3
"""Contract tests for the portable Graphiti setup script."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "setup-graphiti.sh"
COMPOSE = ROOT / "docs" / "graphiti" / "docker-compose-falkordb.yml"
CONFIG = ROOT / "docs" / "graphiti" / "config-docker-falkordb.yaml"
README = ROOT / "docs" / "graphiti" / "README.md"
SHARED_MCP = ROOT / "mcp" / ".config" / "mcp" / "mcp.json"
INSTALL = ROOT / "install.sh"
SETTINGS = ROOT / "pi" / ".pi" / "agent" / "settings.json"


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

    def test_shared_mcp_json_has_graphiti_and_mobbin(self) -> None:
        data = json.loads(SHARED_MCP.read_text(encoding="utf-8"))
        self.assertEqual(
            data["mcpServers"]["graphiti"]["url"],
            "http://localhost:8000/mcp/",
        )
        self.assertEqual(
            data["mcpServers"]["mobbin"]["url"],
            "https://api.mobbin.com/mcp",
        )
        self.assertEqual(list(data["mcpServers"]), ["graphiti", "mobbin"])
        raw = SHARED_MCP.read_text(encoding="utf-8")
        self.assertNotIn("sk-", raw)
        self.assertNotIn("github_pat_", raw)

    def test_codex_and_install_wire_mobbin(self) -> None:
        codex = (ROOT / "codex" / ".codex" / "config.toml").read_text(
            encoding="utf-8"
        )
        self.assertIn("[mcp_servers.mobbin]", codex)
        self.assertIn("https://api.mobbin.com/mcp", codex)
        install = INSTALL.read_text(encoding="utf-8")
        self.assertIn("ensure_mobbin_mcp", install)
        self.assertIn("$HOME/.cursor/mcp.json", install)
        self.assertIn("$HOME/.claude.json", install)

    def test_setup_merges_shared_and_cursor_mcp(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("merge_graphiti_mcp", text)
        self.assertIn("$HOME/.config/mcp/mcp.json", text)
        self.assertIn("$HOME/.cursor/mcp.json", text)

    def test_pi_mcp_adapter_and_stow_package_are_wired(self) -> None:
        settings = json.loads(SETTINGS.read_text(encoding="utf-8"))
        self.assertIn("npm:pi-mcp-adapter@2.28.0", settings["packages"])
        self.assertIn("npm:pi-graphiti@0.6.0", settings["packages"])
        install = INSTALL.read_text(encoding="utf-8")
        self.assertRegex(install, r"PACKAGES=\([^\n]*\bmcp\b")


if __name__ == "__main__":
    unittest.main()
