import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const repoRoot = resolve(import.meta.dir, "../..");
const weztermConfigPath = resolve(repoRoot, "wezterm/.config/wezterm/wezterm.lua");
const tabbarPath = resolve(repoRoot, "wezterm/.config/wezterm/tabbar.lua");
const operatorDocPath = resolve(repoRoot, "docs/wezterm-herdr.md");

const weztermConfig = readFileSync(weztermConfigPath, "utf8");
const tabbar = readFileSync(tabbarPath, "utf8");

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bindingLine(key: string, mods: string): string | undefined {
  const luaKey = key.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const pattern = new RegExp(
    `^\\s*\\{\\s*key\\s*=\\s*"${escapeRegex(luaKey)}",\\s*mods\\s*=\\s*"${escapeRegex(mods)}",\\s*action\\s*=.*$`,
    "m",
  );
  return weztermConfig.match(pattern)?.[0];
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

const baselineBindings: Array<[key: string, mods: string, action: string]> = [
  ["Enter", "SHIFT", "SendString"],
  ["mapped:|", "LEADER", "SplitHorizontal"],
  ["mapped:|", "LEADER|SHIFT", "SplitHorizontal"],
  ["mapped:|", "LEADER|ALT", "SplitHorizontal"],
  ["mapped:|", "LEADER|SHIFT|ALT", "SplitHorizontal"],
  ["-", "LEADER", "SplitVertical"],
  ["\\", "LEADER", "SplitHorizontal"],
  ["\\", "LEADER|SHIFT", "SplitHorizontal"],
  ["d", "CMD", "SplitHorizontal"],
  ["d", "CMD|SHIFT", "SplitVertical"],
  ["h", "LEADER", 'ActivatePaneDirection("Left")'],
  ["j", "LEADER", 'ActivatePaneDirection("Down")'],
  ["k", "LEADER", 'ActivatePaneDirection("Up")'],
  ["l", "LEADER", 'ActivatePaneDirection("Right")'],
  ["LeftArrow", "CMD|ALT", 'ActivatePaneDirection("Left")'],
  ["RightArrow", "CMD|ALT", 'ActivatePaneDirection("Right")'],
  ["UpArrow", "CMD|ALT", 'ActivatePaneDirection("Up")'],
  ["DownArrow", "CMD|ALT", 'ActivatePaneDirection("Down")'],
  ["z", "LEADER", "TogglePaneZoomState"],
  ["x", "LEADER", "CloseCurrentPane"],
  ["w", "CMD", "CloseCurrentPane"],
  ["s", "LEADER", "ActivateKeyTable"],
  ["c", "LEADER", "SpawnTab"],
  ["t", "CMD", "SpawnTab"],
  ["[", "CMD|SHIFT", "ActivateTabRelative(-1)"],
  ["]", "CMD|SHIFT", "ActivateTabRelative(1)"],
  ["p", "LEADER", "ActivateTabRelative(-1)"],
  ["n", "LEADER", "ActivateTabRelative(1)"],
  ["[", "LEADER", "ActivateCopyMode"],
  ["f", "CMD", "Search"],
  ["k", "CMD", "ClearScrollback"],
  ["r", "LEADER", "ReloadConfiguration"],
  ["Enter", "CMD", "ToggleFullScreen"],
  ["=", "CMD", "IncreaseFontSize"],
  ["-", "CMD", "DecreaseFontSize"],
  ["0", "CMD", "ResetFontSize"],
  ["P", "CMD|SHIFT", "ActivateCommandPalette"],
];

describe("HOST-02 WezTerm and Herdr contract", () => {
  test("adds one explicit shell-free LEADER+a Herdr action", () => {
    const attachBinding = bindingLine("a", "LEADER");
    expect(
      attachBinding !== undefined,
      "LEADER+a must be the explicit local Herdr attach action",
    ).toBe(true);
    expect(
      attachBinding?.includes('act.SpawnCommandInNewTab({ args = { "herdr" } })') ?? false,
      "attach must use SpawnCommandInNewTab with exact argv { herdr }",
    ).toBe(true);
    expect(
      countMatches(weztermConfig, /key\s*=\s*"a"\s*,\s*mods\s*=\s*"LEADER"/g),
      "LEADER+a must be unique",
    ).toBe(1);
    expect(/(?:sh|bash)\s+-c|\/bin\/(?:sh|bash)/.test(attachBinding ?? "")).toBe(false);
    expect(
      countMatches(weztermConfig, /["']herdr["']/g),
      "the only executable Herdr token in wezterm.lua must be the explicit argv action",
    ).toBe(1);
  });

  test("preserves the leader and baseline key-action tuples", () => {
    expect(
      weztermConfig.includes(
        'config.leader = { key = "phys:Space", mods = "CTRL", timeout_milliseconds = 2000 }',
      ),
      "CTRL+SPACE leader contract drifted",
    ).toBe(true);
    for (const [key, mods, action] of baselineBindings) {
      const line = bindingLine(key, mods);
      expect(line !== undefined, `missing baseline binding ${mods}+${key}`).toBe(true);
      expect(
        line?.includes(action) ?? false,
        `baseline action drifted for ${mods}+${key}: expected ${action}`,
      ).toBe(true);
    }
  });

  test("has no duplicate key tuples", () => {
    const tuples = [
      ...weztermConfig.matchAll(
        /^\s*\{\s*key\s*=\s*"([^"]+)",\s*mods\s*=\s*"([^"]+)"/gm,
      ),
    ].map((match) => `${match[2]}+${match[1]}`);
    const duplicates = tuples.filter((tuple, index) => tuples.indexOf(tuple) !== index);
    expect(duplicates).toEqual([]);
  });

  test("maps the Herdr process to a static icon while retaining title text", () => {
    expect(
      tabbar.includes('["herdr"] = wezterm.nerdfonts.md_view_dashboard'),
      "tabbar must declare the static Herdr process icon",
    ).toBe(true);
    expect(
      tabbar.includes('title = proc ~= "" and proc or "shell"'),
      "process-name title fallback must remain readable",
    ).toBe(true);
    expect(
      tabbar.includes('return string.format(" %s  %s ", icon, title)'),
      "tab title must retain icon and text",
    ).toBe(true);
    expect(
      tabbar.includes("process_icons[proc] or wezterm.nerdfonts.cod_terminal"),
      "unknown process fallback must remain unchanged",
    ).toBe(true);
    expect(
      countMatches(tabbar, /["']herdr["']/g),
      "the static process icon must be the only Herdr token in tabbar.lua",
    ).toBe(1);
  });

  test("forbids hot-path Herdr spawning and duplicate mux ownership", () => {
    const combined = `${weztermConfig}\n${tabbar}`;
    expect(
      /run_child_process\s*\(\s*\{[^}]*["']herdr["']/s.test(combined),
      "render/status callbacks must not execute herdr",
    ).toBe(false);
    expect(
      /(?:format-tab-title|update-status)[\s\S]{0,2000}SpawnCommandInNewTab[\s\S]{0,300}["']herdr["']/m.test(
        combined,
      ),
      "hot callbacks must not attach or focus Herdr",
    ).toBe(false);
    for (const forbidden of [
      "ssh_domains",
      "unix_domains",
      "default_domain",
      "ConnectToUnixDomain",
      "ConnectToSshDomain",
    ]) {
      expect(
        combined.includes(forbidden),
        `HOST-02 must not duplicate durable mux ownership with ${forbidden}`,
      ).toBe(false);
    }
  });

  test("documents prefix ownership, local attach, remote flow, and narrow rollback", () => {
    expect(existsSync(operatorDocPath), "HOST-02 operator guide must exist").toBe(true);
    const operatorDoc = existsSync(operatorDocPath) ? readFileSync(operatorDocPath, "utf8") : "";
    for (const phrase of [
      "CTRL+SPACE",
      "LEADER+a",
      "outer shell",
      "durable runtime",
      "herdr --remote user@host",
      "Rollback",
    ]) {
      expect(
        operatorDoc.includes(phrase),
        `operator guide must contain ${JSON.stringify(phrase)}`,
      ).toBe(true);
    }
    expect(operatorDoc).not.toContain("/Users/leonardoribeiro");
    expect(operatorDoc).not.toMatch(/(?:token|password|api[_-]?key)\s*[:=]/i);
  });

  const weztermBinary = Bun.which("wezterm");
  test.skipIf(!weztermBinary)("loads in WezTerm and exposes the attach action", () => {
    const result = spawnSync(
      weztermBinary!,
      ["--config-file", weztermConfigPath, "show-keys", "--lua"],
      {
        encoding: "utf8",
        timeout: 15_000,
        env: { ...process.env, HOME: process.env.HOME ?? "/tmp" },
      },
    );
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr.slice(-2_000)).toBe(0);
    expect(
      /key\s*=\s*['"]a['"],\s*mods\s*=\s*['"]LEADER['"]/.test(result.stdout),
      "evaluated WezTerm key list must contain LEADER+a",
    ).toBe(true);
    expect(
      /SpawnCommandInNewTab[\s\S]{0,300}['"]herdr['"]/.test(result.stdout),
      "evaluated action must retain exact Herdr argv",
    ).toBe(true);
  });
});
