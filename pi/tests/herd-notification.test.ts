import { describe, expect, test } from "bun:test";

import { planNotificationV1 } from "../.pi/agent/personal/lib/operator/operator-control";

const base = {
  identity: { agentName: "worker-1", paneId: "w1:p2", generation: 1, sequence: 2 },
  previous: { state: "working", sequence: 1 },
  current: { state: "idle", sequence: 2 },
  emittedSequences: [] as number[],
  transitionCount: 0,
  maxTransitions: 4,
};

describe("OPS-01 bounded notifications", () => {
  test("current completion emits closed identity metadata only", () => {
    expect(planNotificationV1(base)).toEqual({
      ok: true,
      status: "notify",
      notification: {
        kind: "completed",
        agentName: "worker-1",
        paneId: "w1:p2",
        generation: 1,
        sequence: 2,
      },
    });
  });

  test("stale duplicate and initial snapshots do not notify", () => {
    expect(planNotificationV1({ ...base, emittedSequences: [2] })).toMatchObject({ ok: false, code: "stale-transition" });
    expect(planNotificationV1({ ...base, previous: null })).toMatchObject({ ok: true, status: "quiet" });
  });

  test("rate bound suppresses without timer or retry authority", () => {
    expect(planNotificationV1({ ...base, transitionCount: 4 })).toEqual({
      ok: true,
      status: "suppressed",
      suppressed: 1,
    });
  });

  test("hostile labels refuse without echo", () => {
    const result = planNotificationV1({
      ...base,
      identity: { ...base.identity, agentName: "x".repeat(100) },
    });
    expect(result).toEqual({ ok: false, code: "invalid-operator-input" });
    expect(JSON.stringify(result)).not.toContain("x".repeat(100));
  });
});
