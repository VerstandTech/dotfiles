import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dir, "../..");
const installPath = resolve(root, "install.sh");
const brewfilePath = resolve(root, "Brewfile");
const configPath = resolve(root, "herdr/.config/herdr/config.toml");
const docsPath = resolve(root, "docs/herdr.md");
const installSource = readFileSync(installPath, "utf8");
const tempRoots: string[] = [];

interface BootstrapFixture {
  dir: string;
  binary: string;
  calls: string;
  configPaths: string;
  current: string;
}

interface RunOptions {
  os?: "Darwin" | "Linux" | "Plan9";
  version?: string;
  versionRc?: number;
  configRc?: number;
  initialCurrent?: boolean;
  status?: string;
  installRc?: number;
  installEffective?: boolean;
  runs?: number;
  binary?: string;
}

function createFixture(): BootstrapFixture {
  const dir = mkdtempSync(resolve(tmpdir(), "host01-herdr-"));
  tempRoots.push(dir);
  const binary = resolve(dir, "herdr");
  const calls = resolve(dir, "calls.log");
  const configPaths = resolve(dir, "config-paths.log");
  const current = resolve(dir, "pi-current");
  writeFileSync(
    binary,
    `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >>"$HERDR_TEST_CALLS"
case "\${1:-}" in
  --version)
    printf '%s\\n' "\${HERDR_TEST_VERSION:-herdr 0.8.0}"
    exit "\${HERDR_TEST_VERSION_RC:-0}"
    ;;
  config)
    [ "\${2:-}" = check ] || exit 64
    printf '%s\\n' "\${HERDR_CONFIG_PATH:-unset}" >>"$HERDR_TEST_CONFIG_PATHS"
    printf 'config: ok\\n'
    exit "\${HERDR_TEST_CONFIG_RC:-0}"
    ;;
  integration)
    case "\${2:-}" in
      status)
        if [ -f "$HERDR_TEST_CURRENT" ]; then
          printf 'pi: current (v7) (/fixture/herdr-agent-state.ts)\\n'
        else
          printf '%s\\n' "\${HERDR_TEST_STATUS:-pi: not installed (/fixture/herdr-agent-state.ts)}"
        fi
        exit 0
        ;;
      install)
        [ "\${3:-}" = pi ] || exit 64
        rc="\${HERDR_TEST_INSTALL_RC:-0}"
        if [ "$rc" -eq 0 ] && [ "\${HERDR_TEST_INSTALL_EFFECTIVE:-1}" = 1 ]; then
          : >"$HERDR_TEST_CURRENT"
        fi
        exit "$rc"
        ;;
    esac
    ;;
esac
exit 64
`,
  );
  chmodSync(binary, 0o755);
  return { dir, binary, calls, configPaths, current };
}

function hasHermeticSurface(): boolean {
  return (
    installSource.includes("ensure_herdr_available()") &&
    installSource.includes("configure_herdr_pi()")
  );
}

function runBootstrap(options: RunOptions = {}) {
  const fixture = createFixture();
  if (options.initialCurrent) writeFileSync(fixture.current, "");
  const binary = options.binary ?? fixture.binary;
  const runs = options.runs ?? 1;
  const command = [
    "set -euo pipefail",
    `source ${JSON.stringify(installPath)}`,
    ...Array.from(
      { length: runs },
      () => 'ensure_herdr_available "$HERDR_BIN" "$DOTFILES_OS" && configure_herdr_pi "$HERDR_BIN"',
    ),
  ].join("; ");
  const result = hasHermeticSurface()
    ? spawnSync("bash", ["-c", command], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: resolve(fixture.dir, "home"),
          HERDR_CONFIG_PATH: "/hostile/inherited/config.toml",
          DOTFILES_OS: options.os ?? "Linux",
          HERDR_BIN: binary,
          HERDR_TEST_CALLS: fixture.calls,
          HERDR_TEST_CONFIG_PATHS: fixture.configPaths,
          HERDR_TEST_CURRENT: fixture.current,
          HERDR_TEST_VERSION: options.version ?? "herdr 0.8.0",
          HERDR_TEST_VERSION_RC: String(options.versionRc ?? 0),
          HERDR_TEST_CONFIG_RC: String(options.configRc ?? 0),
          HERDR_TEST_STATUS:
            options.status ?? "pi: not installed (/fixture/herdr-agent-state.ts)",
          HERDR_TEST_INSTALL_RC: String(options.installRc ?? 0),
          HERDR_TEST_INSTALL_EFFECTIVE: options.installEffective === false ? "0" : "1",
        },
      })
    : {
        status: 99,
        stdout: "",
        stderr: "HOST-01 production contract not implemented",
      };
  const calls = existsSync(fixture.calls)
    ? readFileSync(fixture.calls, "utf8").trim().split("\n").filter(Boolean)
    : [];
  const configPaths = existsSync(fixture.configPaths)
    ? readFileSync(fixture.configPaths, "utf8").trim().split("\n").filter(Boolean)
    : [];
  return {
    ...result,
    calls,
    configPaths,
    expectedConfigPath: resolve(fixture.dir, "home/.config/herdr/config.toml"),
  };
}

function parseSimpleToml(path: string): Record<string, string | number | boolean> {
  const parsed = Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const ui = parsed.ui as Record<string, any>;
  const session = parsed.session as Record<string, any>;
  return {
    onboarding: parsed.onboarding as boolean,
    sidebar_width: ui.sidebar_width,
    sidebar_min_width: ui.sidebar_min_width,
    sidebar_max_width: ui.sidebar_max_width,
    sidebar_start_collapsed: ui.sidebar_start_collapsed,
    sidebar_collapsed_mode: ui.sidebar_collapsed_mode,
    redraw_on_focus_gained: ui.redraw_on_focus_gained,
    toast_delivery: ui.toast.delivery,
    toast_delay_seconds: ui.toast.delay_seconds,
    sound_enabled: ui.sound.enabled,
    resume_agents_on_restore: session.resume_agents_on_restore,
  };
}

afterEach(() => {
  for (const path of tempRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("HOST-01 hermetic Herdr bootstrap", () => {
  test("exposes hermetic bootstrap functions without executing installer main", () => {
    expect(
      hasHermeticSurface(),
      "HOST-01 must expose source-safe Herdr functions",
    ).toBe(true);
  });

  test("uses source identity instead of a bypass environment flag", () => {
    expect(
      /BASH_SOURCE\[0\].*==?.*\$0/.test(installSource),
      "installer must run main only when executed directly",
    ).toBe(true);
    expect(
      installSource.includes("DOTFILES_INSTALL_LIB_ONLY"),
      "an inherited environment variable must not turn a real install into false success",
    ).toBe(false);
  });

  test("keeps fixture overrides out of direct installer environment authority", () => {
    expect(/^HERDR_BIN=/m.test(installSource)).toBe(false);
    expect(/^DOTFILES_OS=/m.test(installSource)).toBe(false);
    expect(
      installSource.includes('local herdr_bin="${1:-herdr}"'),
      "Herdr fixture binary must be a function argument with a fixed production default",
    ).toBe(true);
    expect(
      installSource.includes('local host_os="${2:-$(uname -s)}"'),
      "fixture OS must be a function argument with a real-host production default",
    ).toBe(true);
  });

  test("declares the Herdr Stow package and Homebrew dependency", () => {
    expect(
      /PACKAGES=\([^\n]*\bherdr\b/.test(installSource),
      "installer package list must contain herdr",
    ).toBe(true);
    expect(/^brew "herdr"$/m.test(readFileSync(brewfilePath, "utf8"))).toBe(true);
  });

  test("wires preflight and post-Stow Pi repair into installer main", () => {
    const mainStart = installSource.indexOf("\nmain() {");
    const mainEnd = installSource.indexOf('\nif [[ "${BASH_SOURCE[0]}"', mainStart);
    expect(mainStart).toBeGreaterThanOrEqual(0);
    expect(mainEnd).toBeGreaterThan(mainStart);
    const mainBody = installSource.slice(mainStart, mainEnd);
    const orderedTokens = [
      "ensure_herdr_available",
      'for pkg in "${PACKAGES[@]}"',
      "ensure_pi_personal_link",
      "configure_herdr_pi",
      "verify-ai-resources.py",
    ];
    let previous = -1;
    for (const token of orderedTokens) {
      const index = mainBody.indexOf(token);
      expect(index, `missing or misordered main token: ${token}`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  test("fails absent Linux and unsupported platforms with an exact action", () => {
    const missing = runBootstrap({ binary: "/definitely/missing/herdr", os: "Linux" });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("curl -fsSL https://herdr.dev/install.sh | sh");
    expect(missing.calls).toEqual([]);

    const unsupported = runBootstrap({ binary: "/definitely/missing/herdr", os: "Plan9" });
    expect(unsupported.status).not.toBe(0);
    expect(unsupported.stderr).toMatch(/unsupported.*Plan9/i);
  });

  test.each([
    ["herdr 0.8.0", 0],
    ["herdr 0.8.9", 0],
    ["herdr 0.7.5", 1],
    ["herdr 0.9.0", 1],
    ["malformed", 1],
  ])("enforces CMP-01 version policy for %s", (version, expectedFailure) => {
    const result = runBootstrap({ version, initialCurrent: true });
    expect(result.status === 0 ? 0 : 1).toBe(expectedFailure);
    if (expectedFailure) expect(result.calls).toEqual(["--version"]);
  });

  test("keeps a conservative tracked config with no runtime state", () => {
    expect(existsSync(configPath)).toBe(true);
    expect(parseSimpleToml(configPath)).toEqual({
      onboarding: false,
      sidebar_width: 26,
      sidebar_min_width: 18,
      sidebar_max_width: 36,
      sidebar_start_collapsed: false,
      sidebar_collapsed_mode: "compact",
      redraw_on_focus_gained: true,
      toast_delivery: "herdr",
      toast_delay_seconds: 1,
      sound_enabled: false,
      resume_agents_on_restore: false,
    });
    expect(readFileSync(configPath, "utf8")).not.toMatch(
      /token|secret|password|session\.json|\.sock|herdr-server\.log/i,
    );
  });

  test("validates the stowed config instead of an inherited config override", () => {
    const result = runBootstrap({ initialCurrent: true });
    expect(result.status).toBe(0);
    expect(result.configPaths).toEqual([result.expectedConfigPath]);
  });

  test("does not reinstall a current Pi integration across repeated runs", () => {
    const result = runBootstrap({ initialCurrent: true, runs: 2 });
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      "--version",
      "config check",
      "integration status",
      "--version",
      "config check",
      "integration status",
    ]);
  });

  test("installs missing Pi integration once and revalidates exact current status", () => {
    const result = runBootstrap();
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      "--version",
      "config check",
      "integration status",
      "integration install pi",
      "integration status",
    ]);
  });

  test("fails closed when integration install fails or remains ineffective", () => {
    const failed = runBootstrap({ installRc: 7 });
    expect(failed.status).not.toBe(0);
    expect(failed.calls).toEqual([
      "--version",
      "config check",
      "integration status",
      "integration install pi",
    ]);

    const ineffective = runBootstrap({ installEffective: false });
    expect(ineffective.status).not.toBe(0);
    expect(ineffective.calls).toEqual([
      "--version",
      "config check",
      "integration status",
      "integration install pi",
      "integration status",
    ]);
  });

  test("documents rollback without automating Pi integration uninstall", () => {
    expect(existsSync(docsPath)).toBe(true);
    const docs = readFileSync(docsPath, "utf8");
    expect(docs).toContain("herdr integration uninstall pi");
    expect(docs).toMatch(/human confirmation/i);
    expect(
      installSource.includes("integration uninstall pi"),
      "installer must never automate Pi integration uninstall",
    ).toBe(false);
  });
});
