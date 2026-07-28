// Acceptance: docs/pi-herdr-acceptance.md — Slice 4 (widget source)
// Traces: R5-E3, R5-E4, R5-E5, R2-E3 (docs/pi-herdr-example-map.md)
import { describe, expect, test } from "bun:test";
import {
  claimPoller,
  createHerdSource,
  type ExecFn,
} from "../.pi/agent/personal/extensions/herd/herd-source";

// Real herdr 0.7.5 envelope: `herdr agent list` emits this JSON by default.
const GOOD = JSON.stringify({
  id: "cli:agent:list",
  result: {
    type: "agent_list",
    agents: [
      { name: "api", agent: "pi", agent_status: "blocked", pane_id: "w1:p3" },
      { name: "web", agent: "pi", agent_status: "working", pane_id: "w1:p2" },
    ],
  },
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

  test("R2-E3: inside herdr, execs `herdr agent list` (JSON is the default output) and parses via formatHerdRows", async () => {
    const { exec, calls } = execReturning(GOOD);
    const source = createHerdSource({ exec, env: { HERDR_ENV: "1" } });
    const view = await source.getView();
    expect(calls).toEqual([["herdr", "agent", "list"]]);
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

  test("R5-E5: after a success, transient failure returns the last good view (stale-while-revalidate)", async () => {
    let t = 0;
    let fail = false;
    const calls: string[][] = [];
    const exec: ExecFn = async (argv) => {
      calls.push(argv);
      if (fail) throw new Error("socket hiccup");
      return { stdout: GOOD, stderr: "" };
    };
    const source = createHerdSource({
      exec,
      env: { HERDR_ENV: "1" },
      now: () => t,
      ttlMs: 1000,
    });
    const good = await source.getView(); // success
    expect(good).not.toBeNull();
    t += 2000; // past TTL → re-exec
    fail = true;
    expect(await source.getView()).toEqual(good); // stale view, NOT null — no hide/show flicker
    expect(await source.getView()).toEqual(good); // failure not cached → retried again
    expect(calls).toHaveLength(3);
  });

  const SELF_AND_SIBLING = JSON.stringify({
    id: "cli:agent:list",
    result: {
      type: "agent_list",
      agents: [
        { agent: "pi", agent_status: "idle", pane_id: "w1:p1" }, // self — status flaps
        { name: "api", agent: "pi", agent_status: "blocked", pane_id: "w1:p2" },
      ],
    },
  });

  test("R5-E6: self-filter — the caller's own pane (HERDR_PANE_ID) never renders; siblings do", async () => {
    const { exec } = execReturning(SELF_AND_SIBLING);
    const source = createHerdSource({
      exec,
      env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1" },
    });
    const view = await source.getView();
    expect(view).not.toBeNull();
    expect(view!.rows.join("\n")).not.toContain("w1:p1");
    expect(view!.rows.join("\n")).toContain("api");
    expect(view!.summary).toBe("⚠ 1 blocked (api)");
  });

  test("R5-E6: alone (only self) → null, and the empty outcome IS cached at TTL rate", async () => {
    const SELF_ONLY = JSON.stringify({
      id: "cli:agent:list",
      result: {
        type: "agent_list",
        agents: [{ agent: "pi", agent_status: "working", pane_id: "w1:p1" }],
      },
    });
    let t = 0;
    const { exec, calls } = execReturning(SELF_ONLY);
    const source = createHerdSource({
      exec,
      env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1" },
      now: () => t,
      ttlMs: 2000,
    });
    expect(await source.getView()).toBeNull();
    t += 1000; // within TTL
    expect(await source.getView()).toBeNull();
    expect(calls).toHaveLength(1); // empty outcome cached — no per-tick respawn
  });
});

describe("claimPoller (R7-E3)", () => {
  function fakeTimers() {
    const cleared: unknown[] = [];
    const created: object[] = [];
    const setIntervalFn = ((_fn: () => void, _ms: number) => {
      const handle = {};
      created.push(handle);
      return handle;
    }) as never;
    const clearIntervalFn = ((h: unknown) => {
      cleared.push(h);
    }) as never;
    return { cleared, created, setIntervalFn, clearIntervalFn };
  }

  test("a new claim under the same key clears the previous timer — pollers never stack across module instances", () => {
    const host: Record<string, unknown> = {}; // stands in for globalThis, shared across "reloads"
    const t = fakeTimers();
    claimPoller("herd:widget", () => {}, 2500, { host, ...t });
    claimPoller("herd:widget", () => {}, 2500, { host, ...t });
    expect(t.created).toHaveLength(2);
    expect(t.cleared).toEqual([t.created[0]]);
  });

  test("distinct keys coexist — widget and footer pollers run side by side", () => {
    const host: Record<string, unknown> = {};
    const t = fakeTimers();
    claimPoller("herd:widget", () => {}, 2500, { host, ...t });
    claimPoller("herd:footer", () => {}, 2500, { host, ...t });
    expect(t.cleared).toHaveLength(0);
  });

  test("dispose clears only its own registration — a stale dispose must not kill a newer claim", () => {
    const host: Record<string, unknown> = {};
    const t = fakeTimers();
    const disposeA = claimPoller("herd:widget", () => {}, 2500, { host, ...t });
    const disposeB = claimPoller("herd:widget", () => {}, 2500, { host, ...t });
    expect(t.cleared).toEqual([t.created[0]]); // B's claim already cleared A
    disposeA(); // stale — A was cleared by B's claim; must not touch B
    expect(t.cleared).toEqual([t.created[0]]);
    disposeB();
    expect(t.cleared).toEqual([t.created[0], t.created[1]]);
  });
});
