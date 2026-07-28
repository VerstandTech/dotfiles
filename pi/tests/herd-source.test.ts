// Acceptance: docs/pi-herdr-acceptance.md — Slice 4 (widget source)
// Traces: R5-E3, R5-E4, R5-E5, R2-E3 (docs/pi-herdr-example-map.md)
import { describe, expect, test } from "bun:test";
import { createHerdSource, type ExecFn } from "../.pi/agent/personal/extensions/herd/herd-source";

const GOOD = JSON.stringify({
  agents: [
    { name: "api", state: "blocked", meta: "story-123" },
    { name: "web", state: "working" },
  ],
});

function execReturning(stdout: string): { exec: ExecFn; calls: string[][] } {
  const calls: string[][] = [];
  const exec: ExecFn = async (argv) => {
    calls.push(argv);
    return { stdout, stderr: "" };
  };
  return { exec, calls };
}

describe("createHerdSource", () => {
  test("R5-E3: inert outside herdr — no exec, returns null", async () => {
    const { exec, calls } = execReturning(GOOD);
    const source = createHerdSource({ exec, env: {} });
    expect(await source.getView()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("R2-E3: inside herdr, execs `herdr agent list --json` and parses via formatHerdRows", async () => {
    const { exec, calls } = execReturning(GOOD);
    const source = createHerdSource({ exec, env: { HERDR_ENV: "1" } });
    const view = await source.getView();
    expect(calls).toEqual([["herdr", "agent", "list", "--json"]]);
    expect(view).not.toBeNull();
    expect(view!.summary).toContain("⚠ 1 blocked (api)");
  });

  test("R5-E4: TTL cache — second call within window reuses, after window re-execs", async () => {
    let t = 1_000;
    const { exec, calls } = execReturning(GOOD);
    const source = createHerdSource({
      exec,
      env: { HERDR_ENV: "1" },
      now: () => t,
      ttlMs: 2000,
    });
    await source.getView(); // exec #1
    t += 1000;
    await source.getView(); // cache hit
    expect(calls).toHaveLength(1);
    t += 1500; // t = 3500, past ttl
    await source.getView(); // exec #2
    expect(calls).toHaveLength(2);
  });

  test("R5-E5: exec failure → null, and failure does not poison the cache", async () => {
    let t = 0;
    let fail = true;
    const calls: string[][] = [];
    const exec: ExecFn = async (argv) => {
      calls.push(argv);
      if (fail) throw new Error("socket missing");
      return { stdout: GOOD, stderr: "" };
    };
    const source = createHerdSource({
      exec,
      env: { HERDR_ENV: "1" },
      now: () => t,
      ttlMs: 60_000,
    });
    expect(await source.getView()).toBeNull(); // fails
    fail = false;
    expect(await source.getView()).not.toBeNull(); // retries immediately, not cached-null
    expect(calls).toHaveLength(2);
  });

  test("R5-E5: garbage stdout → null", async () => {
    const { exec } = execReturning("not json at all");
    const source = createHerdSource({ exec, env: { HERDR_ENV: "1" } });
    expect(await source.getView()).toBeNull();
  });
});
