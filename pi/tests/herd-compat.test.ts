// CMP-01 — Herdr 0.8 compatibility matrix + dual-era fixtures
// Acceptance: docs/plans/work-packages/CMP-01.feature
// Traces: docs/plans/work-packages/CMP-01-example-map.md R1–R7, E1–E12
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatHerdRows } from "../.pi/agent/personal/extensions/herd/herd-status";
import { extractPaneId } from "../.pi/agent/personal/extensions/herd/herd-task-handler";
import { buildTaskLaunch } from "../.pi/agent/personal/extensions/herd/herd-task";

const root = join(import.meta.dir, "..");
const fixturesDir = join(import.meta.dir, "fixtures/herdr");
const compatPath = join(
  root,
  ".pi/agent/personal/extensions/herd/herd-compat.ts",
);
const skillPath = join(root, ".pi/agent/personal/skills/herdr/SKILL.md");
const exampleMapPath = join(root, "docs/pi-herdr-example-map.md");
const acceptancePath = join(root, "docs/pi-herdr-acceptance.md");

type CompatModule = {
  HERDR_COMPAT_MATRIX: {
    herdrRuntime: string;
    herdrTestedVersion: string;
    protocol: number;
    schemaVersion: number;
    pi: string;
    piSubagents: string;
    contextMode: string;
    rulesync: string;
    piIntegration?: string;
  };
  checkHerdrCompatibility: (obs: {
    version?: string | null;
    protocol?: number | null;
    schemaVersion?: number | null;
  }) => {
    status: "compatible" | "incompatible" | "unknown";
    message: string;
    observed: Record<string, unknown>;
    expected: {
      runtime: string;
      protocol: number;
      schemaVersion: number;
    };
  };
  interpretPiIntegrationStatus: (text: string) => {
    installed: boolean;
    message: string;
  };
};

function loadFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

function readText(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

/** Dynamic import only after the production file exists (no module-not-found crash). */
async function loadCompat(): Promise<CompatModule | null> {
  if (!existsSync(compatPath)) return null;
  return (await import(compatPath)) as CompatModule;
}

describe("Herdr compatibility matrix", () => {
  test("declares the current compatibility contract", async () => {
    const mod = await loadCompat();
    if (mod === null) {
      throw new Error("Herdr 0.8 compatibility contract is missing");
    }

    const matrix = mod.HERDR_COMPAT_MATRIX;
    expect(matrix.herdrRuntime).toBe("0.8.x");
    expect(matrix.herdrTestedVersion).toBe("0.8.0");
    expect(matrix.protocol).toBe(19);
    expect(matrix.schemaVersion).toBe(1);
    expect(matrix.pi).toBe("0.84.1");
    expect(matrix.piSubagents).toBe("0.45.2");
    expect(matrix.contextMode).toBe("1.0.169");
    expect(matrix.rulesync).toBe("16.9.1");
    expect(typeof mod.checkHerdrCompatibility).toBe("function");
    expect(typeof mod.interpretPiIntegrationStatus).toBe("function");
  });

  test("E1: 0.8.0 / protocol 19 / schema 1 is compatible and names the matrix", async () => {
    const mod = await loadCompat();
    if (mod === null) return;

    const result = mod.checkHerdrCompatibility({
      version: "0.8.0",
      protocol: 19,
      schemaVersion: 1,
    });
    expect(result.status).toBe("compatible");
    expect(result.expected).toEqual({
      runtime: "0.8.x",
      protocol: 19,
      schemaVersion: 1,
    });
    expect(result.message.toLowerCase()).toContain("0.8");
    expect(result.message).toMatch(/protocol\s*19/i);
    expect(result.message).toMatch(/schema(?:\s*version)?\s*1/i);
  });

  test("E2: protocol 18 or 20 is incompatible with expected 19", async () => {
    const mod = await loadCompat();
    if (mod === null) return;

    for (const protocol of [18, 20]) {
      const result = mod.checkHerdrCompatibility({
        version: "0.8.0",
        protocol,
        schemaVersion: 1,
      });
      expect(result.status).toBe("incompatible");
      expect(result.message).toContain(String(protocol));
      expect(result.message).toMatch(/19/);
      expect(result.message.toLowerCase()).toMatch(/doctor|compatibility/);
    }
  });

  test("E3: schema version 2 is incompatible with expected 1", async () => {
    const mod = await loadCompat();
    if (mod === null) return;

    const result = mod.checkHerdrCompatibility({
      version: "0.8.0",
      protocol: 19,
      schemaVersion: 2,
    });
    expect(result.status).toBe("incompatible");
    expect(result.message).toMatch(/2/);
    expect(result.message).toMatch(/1/);
    expect(result.message.toLowerCase()).toMatch(/doctor|compatibility/);
  });

  test("E4: missing protocol or schema is unknown, never compatible", async () => {
    const mod = await loadCompat();
    if (mod === null) return;

    const missingProtocol = mod.checkHerdrCompatibility({
      version: "0.8.0",
      schemaVersion: 1,
    });
    const missingSchema = mod.checkHerdrCompatibility({
      version: "0.8.0",
      protocol: 19,
    });
    const missingBoth = mod.checkHerdrCompatibility({ version: "0.8.0" });

    for (const result of [missingProtocol, missingSchema, missingBoth]) {
      expect(result.status).toBe("unknown");
      expect(result.status).not.toBe("compatible");
    }
  });

  test("E9: Pi integration absence is documented and never installs", async () => {
    const mod = await loadCompat();
    if (mod === null) return;

    const text = readText("integration-status-pi-absent.txt");
    const result = mod.interpretPiIntegrationStatus(text);
    expect(result.installed).toBe(false);
    expect(result.message.toLowerCase()).toMatch(/not installed|absent|missing/);
    // CMP-01 must not claim installation happened.
    expect(result.message.toLowerCase()).not.toMatch(/\binstalled hooks\b/);
  });

  test("E12: support claims stay coupled to protocol/schema fixtures", async () => {
    const mod = await loadCompat();
    if (mod === null) return;

    const meta = loadFixture<{ protocol: number; schema_version: number }>(
      "schema-meta-0.8.0.json",
    );
    expect(mod.HERDR_COMPAT_MATRIX.protocol).toBe(meta.protocol);
    expect(mod.HERDR_COMPAT_MATRIX.schemaVersion).toBe(meta.schema_version);
    expect(mod.HERDR_COMPAT_MATRIX.protocol).toBe(19);
    expect(mod.HERDR_COMPAT_MATRIX.schemaVersion).toBe(1);
  });
});

describe("Legacy and current Herdr envelopes (parser fixtures)", () => {
  test("E5: normalized 0.7.5 agent-list still renders", () => {
    const payload = loadFixture("agent-list-0.7.5.json");
    const view = formatHerdRows(payload);
    expect(view).not.toBeNull();
    expect(view!.summary).toContain("blocked");
    expect(view!.rows.some((r) => r.includes("api"))).toBe(true);
    expect(view!.rows.some((r) => r.includes("web"))).toBe(true);
  });

  test("E6: normalized 0.8.0 agent-list with extras renders and ignores unknown fields", () => {
    const payload = loadFixture("agent-list-0.8.0.json");
    const view = formatHerdRows(payload);
    expect(view).not.toBeNull();
    expect(view!.summary).toContain("⚠ 1 blocked (api)");
    expect(view!.rows[0]).toContain("api");
    expect(view!.rows.some((r) => r.includes("web"))).toBe(true);
    // Extra 0.8 fields must not leak into rendered text.
    expect(view!.rows.join("\n")).not.toContain("ignored-by-parser");
    expect(view!.rows.join("\n")).not.toContain("term_synthetic");
  });

  test("E7: 0.8 worktree-created pane extraction prefers root_pane.pane_id", () => {
    const legacy = loadFixture("worktree-created-0.7.5.json");
    const current = loadFixture("worktree-created-0.8.0.json");
    expect(extractPaneId(legacy)).toBe("wS:p9");
    expect(extractPaneId(current)).toBe("wS:p9");

    // Opaque id comes from the envelope, not display order / path basenames.
    expect(extractPaneId(current)).not.toBe("story-alpha");
    expect(extractPaneId({
      result: {
        type: "worktree_created",
        pane: { pane_id: "wS:p1" },
        root_pane: { pane_id: "wS:p9" },
        worktree: { pane_id: "wS:p2", path: "/tmp/herdr-fixtures/other" },
      },
    })).toBe("wS:p9");
  });
});

describe("Herdr 0.8 task launch expectations", () => {
  test("E8: buildTaskLaunch emits --no-focus and never --focus/--json", () => {
    const argv = buildTaskLaunch({
      name: "story-alpha",
      cwd: "/tmp/herdr-fixtures/repo-main",
      base: "develop",
    });
    expect(argv).toContain("--no-focus");
    expect(argv).not.toContain("--focus");
    expect(argv).not.toContain("--json");
    expect(argv[0]).toBe("herdr");
    expect(argv).toContain("worktree");
    expect(argv).toContain("create");
  });
});

describe("Compatibility docs and vendored skill (E10/E11)", () => {
  test("E10: docs mark 0.7.5 as legacy and 0.8 as current runtime", () => {
    const exampleMap = readFileSync(exampleMapPath, "utf8");
    const acceptance = readFileSync(acceptancePath, "utf8");
    const corpus = `${exampleMap}\n${acceptance}`;

    // Must acknowledge 0.8 as the supported/current runtime baseline.
    expect(corpus).toMatch(/0\.8\.0/);
    expect(corpus.toLowerCase()).toMatch(/legacy[\s\S]{0,40}0\.7\.5|0\.7\.5[\s\S]{0,40}legacy/);

    // Stale "current is 0.7.5" claims are forbidden once rebaselined.
    expect(corpus).not.toMatch(/herdr\s+0\.7\.5\s+installed/i);
    expect(corpus).not.toMatch(/verified `herdr 0\.7\.5`/i);
    expect(corpus).not.toMatch(/there is no `--no-focus` flag/i);
  });

  test("E11: vendored skill keeps --kind pi and records 0.8.0 in the footer", () => {
    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain("--kind pi");
    expect(skill).toMatch(/0\.8\.0/);
    // Footer / vendoring stamp must not still claim 0.7.5 as the vendored version.
    expect(skill).not.toMatch(/\(herdr 0\.7\.5,/i);
  });
});
