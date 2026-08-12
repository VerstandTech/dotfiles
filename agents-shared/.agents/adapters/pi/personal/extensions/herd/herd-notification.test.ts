import { describe, expect, test } from "bun:test";

import { createHerdNotificationObserverV1 } from "./herd-notification";

const agent = (sequence: number, state: "working" | "idle" | "needs-attention" | "unknown") => ({
  name: "worker-1",
  paneId: "w1:p2",
  generation: 1,
  sequence,
  state,
});

describe("OPS-01 notification observer integrity", () => {
  test("OPS01_HISTORY_INTEGRITY: stale observation cannot corrupt current history", () => {
    const notifications: unknown[] = [];
    const observer = createHerdNotificationObserverV1({ notify: (value) => notifications.push(value) });
    observer.observe([agent(5, "working")]);
    observer.observe([agent(4, "idle")]);
    observer.observe([agent(6, "idle")]);
    expect(notifications).toEqual([{
      kind: "completed",
      agentName: "worker-1",
      paneId: "w1:p2",
      generation: 1,
      sequence: 6,
    }]);
  });

  test("OPS01_CONTRADICTORY_HISTORY: same-sequence contradiction cannot replace history", () => {
    const notifications: unknown[] = [];
    const observer = createHerdNotificationObserverV1({ notify: (value) => notifications.push(value) });
    observer.observe([agent(5, "working")]);
    observer.observe([agent(5, "idle")]);
    observer.observe([agent(6, "idle")]);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ kind: "completed", sequence: 6 });
  });

  test("OPS01_OBSERVER_HOSTILE_BOUNDARY: malformed batches do not throw or notify", () => {
    const notifications: unknown[] = [];
    const observer = createHerdNotificationObserverV1({ notify: (value) => notifications.push(value) });
    expect(() => observer.observe([null as never, new Proxy({}, { get() { throw new Error("raw"); } }) as never])).not.toThrow();
    expect(notifications).toEqual([]);
  });
});
