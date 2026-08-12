import { planNotificationV1 } from "../../lib/operator/operator-control.ts";

export interface NotificationAgentV1 {
  name: string;
  paneId: string;
  generation: number;
  sequence: number;
  state: "starting" | "working" | "idle" | "needs-attention" | "failed" | "unknown";
}

export interface NotificationSinkV1 {
  notify(notification: Readonly<Record<string, unknown>>): void;
}

export function createHerdNotificationObserverV1(sink: NotificationSinkV1, maxTransitions = 8) {
  const histories = new Map<string, { state: string; sequence: number; emitted: number[]; count: number }>();
  let active = true;

  return Object.freeze({
    observe(agents: readonly NotificationAgentV1[]): void {
      if (!active || agents.length > 256) return;
      for (const agent of agents) {
        const key = `${agent.paneId}:${agent.generation}`;
        const previous = histories.get(key) ?? null;
        const result = planNotificationV1({
          identity: {
            agentName: agent.name,
            paneId: agent.paneId,
            generation: agent.generation,
            sequence: agent.sequence,
          },
          previous: previous ? { state: previous.state, sequence: previous.sequence } : null,
          current: { state: agent.state, sequence: agent.sequence },
          emittedSequences: previous?.emitted ?? [],
          transitionCount: previous?.count ?? 0,
          maxTransitions,
        }) as Record<string, unknown>;
        const status = result.status;
        const notification = result.notification as Readonly<Record<string, unknown>> | undefined;
        if (status === "notify" && notification) sink.notify(notification);
        histories.set(key, {
          state: agent.state,
          sequence: agent.sequence,
          emitted: status === "notify" ? [...(previous?.emitted ?? []), agent.sequence].slice(-64) : previous?.emitted ?? [],
          count: (previous?.count ?? 0) + (status === "notify" ? 1 : 0),
        });
      }
    },
    dispose(): void {
      if (!active) return;
      active = false;
      histories.clear();
    },
  });
}
