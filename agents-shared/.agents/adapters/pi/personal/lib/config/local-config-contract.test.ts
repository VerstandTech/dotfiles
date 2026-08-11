import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../../../../..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

const codex = Bun.TOML.parse(text("codex/.codex/config.toml")) as Record<string, any>;
const pi = JSON.parse(text("pi/.pi/agent/settings.json")) as Record<string, unknown>;
const zsh = text("zsh/.zshrc");

const stablePlugins = [
  "agent-sdk-dev@claude-plugins-official",
  "code-review@claude-plugins-official",
  "code-simplifier@claude-plugins-official",
  "figma@claude-plugins-official",
  "frontend-design@claude-plugins-official",
  "google-calendar@openai-curated",
  "playwright@claude-plugins-official",
  "pr-review-toolkit@claude-plugins-official",
  "rust-analyzer-lsp@claude-plugins-official",
  "sentry@claude-plugins-official",
  "serena@claude-plugins-official",
  "sites@openai-bundled",
  "slack@claude-plugins-official",
  "superpowers@claude-plugins-official",
  "typescript-lsp@claude-plugins-official",
  "vercel@claude-plugins-official",
  "visualize@openai-bundled",
] as const;

const incidentalTrustPaths = [
  "/Users/leonardoribeiro/Documents/Codex/2026-07-14/create-a-scheduled-task-called-weekday",
  "/Users/leonardoribeiro/Documents/Codex/2026-07-14/linear-plugin-linear-claude-plugins-official",
  "/Users/leonardoribeiro/Documents/Codex/2026-07-14/new-chat",
  "/Users/leonardoribeiro/Documents/Codex/2026-07-29/can-you-please-check-wezterm-to",
  "/Users/leonardoribeiro/Downloads/harbor-qc-main",
  "/Users/leonardoribeiro/workspace/g2i/gheeggle",
  "/Users/leonardoribeiro/workspace/g2i/sentinel",
] as const;

describe("LOCAL-CONFIG-01 curated configuration contract", () => {
  test("keeps stable Codex preferences and the installed ChatGPT runtime", () => {
    expect(codex.model_reasoning_effort).toBe("xhigh");
    expect(codex.features?.hooks).toBe(true);
    expect(codex.desktop?.followUpQueueMode).toBe("queue");
    expect(codex.mcp_servers?.node_repl?.command).toBe(
      "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl",
    );
    expect(codex.mcp_servers?.node_repl?.env?.CODEX_CLI_PATH).toBe(
      "/Applications/ChatGPT.app/Contents/Resources/codex",
    );
    for (const plugin of stablePlugins) {
      expect(codex.plugins?.[plugin]?.enabled, plugin).toBe(true);
    }
  });

  test("excludes newly observed authority and volatile hook state", () => {
    for (const path of incidentalTrustPaths) {
      expect(codex.projects?.[path], path).toBeUndefined();
    }
    expect(codex.hooks?.state).toBeUndefined();
    expect(codex.shell_environment_policy).toBeUndefined();
    expect(codex.mcp_servers?.["computer-use"]).toBeUndefined();
  });

  test("keeps the deliberate Pi preference without changelog drift", () => {
    expect(pi.defaultThinkingLevel).toBe("medium");
    expect(pi.lastChangelogVersion).toBe("0.84.0");
  });

  test("keeps deterministic Python and lazy Node without token aliases", () => {
    expect(zsh).toContain('/opt/homebrew/opt/python@3.12/libexec/bin');
    expect(zsh).toContain("nvm() {");
    expect(zsh).not.toContain("nvm use --silent default");
    expect(zsh).not.toContain("cloudflared tunnel token");
  });
});
