type PlainRecord = Record<string, unknown>;

type Refusal = Readonly<{ ok: false; code: "invalid-operator-input" }>;

const STATES = new Set(["starting", "working", "idle", "needs-attention", "failed", "unknown"]);
const NOTIFICATIONS: Readonly<Record<string, "started" | "completed" | "attention">> = Object.freeze({
  "idle:working": "started",
  "working:idle": "completed",
  "working:needs-attention": "attention",
});

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) freeze(descriptor.value);
  }
  return value;
}

function record(value: unknown, allowed: readonly string[]): PlainRecord | undefined {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const result: PlainRecord = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.includes(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function read(root: PlainRecord, key: string): unknown {
  return Object.getOwnPropertyDescriptor(root, key)?.value;
}

function refusal(): Refusal {
  return freeze({ ok: false, code: "invalid-operator-input" });
}

function safeId(value: unknown, max = 64): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9._:/-]+$/.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function stateSnapshot(value: unknown): Readonly<{ state: string; sequence: number }> | undefined {
  const root = record(value, ["state", "sequence"]);
  const state = root && read(root, "state");
  const sequence = root && read(root, "sequence");
  if (!root || typeof state !== "string" || !STATES.has(state) || !positiveInteger(sequence)) return undefined;
  return freeze({ state, sequence });
}

export function planNotificationV1(input: unknown): Readonly<PlainRecord> | Refusal {
  const root = record(input, ["identity", "previous", "current", "emittedSequences", "transitionCount", "maxTransitions"]);
  if (!root) return refusal();
  const identity = record(read(root, "identity"), ["agentName", "paneId", "generation", "sequence"]);
  const current = stateSnapshot(read(root, "current"));
  const previousValue = read(root, "previous");
  const previous = previousValue === null ? null : stateSnapshot(previousValue);
  const emitted = read(root, "emittedSequences");
  const count = read(root, "transitionCount");
  const max = read(root, "maxTransitions");
  if (!identity || !current || (previousValue !== null && !previous) || !Array.isArray(emitted) || emitted.length > 256 || !positiveInteger(count) || !positiveInteger(max) || max < 1 || max > 64) return refusal();
  const agentName = read(identity, "agentName");
  const paneId = read(identity, "paneId");
  const generation = read(identity, "generation");
  const identitySequence = read(identity, "sequence");
  if (!safeId(agentName, 32) || !safeId(paneId) || !positiveInteger(generation) || !positiveInteger(identitySequence) || identitySequence !== current.sequence) return refusal();
  if (!emitted.every(positiveInteger)) return refusal();
  if (previous === null) return freeze({ ok: true, status: "quiet" });
  if (current.sequence < previous.sequence || emitted.includes(current.sequence)) return freeze({ ok: false, code: "stale-transition" });
  if (current.sequence === previous.sequence && current.state !== previous.state) return freeze({ ok: false, code: "contradictory-transition" });
  if (current.sequence === previous.sequence || current.state === previous.state) return freeze({ ok: true, status: "quiet" });
  if (count >= max) return freeze({ ok: true, status: "suppressed", suppressed: 1 });
  const kind = NOTIFICATIONS[`${previous.state}:${current.state}`];
  if (!kind) return freeze({ ok: true, status: "quiet" });
  return freeze({
    ok: true,
    status: "notify",
    notification: { kind, agentName, paneId, generation, sequence: current.sequence },
  });
}

export function resolveWaitOutcomeV1(input: unknown): Readonly<PlainRecord> | Refusal {
  const root = record(input, ["kind", "state", "current"]);
  if (!root) return refusal();
  const kind = read(root, "kind");
  if (kind === "timeout") return freeze({ ok: true, status: "unknown" });
  if (kind === "unavailable") return freeze({ ok: true, status: "unavailable" });
  if (kind === "invalid") return freeze({ ok: true, status: "invalid" });
  if (kind !== "observation" || read(root, "current") !== true) return refusal();
  const state = read(root, "state");
  if (state === "idle") return freeze({ ok: true, status: "completed" });
  if (state === "failed" || state === "needs-attention") return freeze({ ok: true, status: "failed" });
  if (state === "working" || state === "starting") return freeze({ ok: true, status: "pending" });
  return freeze({ ok: true, status: "unknown" });
}

export function planRecoveryV1(input: unknown): Readonly<PlainRecord> | Refusal {
  const root = record(input, ["paneId", "worktreePath", "agentStatus"]);
  if (!root) return refusal();
  const pane = read(root, "paneId");
  const worktree = read(root, "worktreePath");
  const status = read(root, "agentStatus");
  if (pane !== null && !safeId(pane)) return refusal();
  if (worktree !== null && !safeId(worktree, 512)) return refusal();
  if (typeof status !== "string" || !["unknown", "started", "current", "failed"].includes(status)) return refusal();
  if (pane && !worktree) return freeze({ ok: true, status: "cleanup-required", steps: [{ kind: "inspect-pane", target: pane, requiresHuman: true }] });
  if (worktree && !pane) return freeze({ ok: true, status: "cleanup-required", steps: [{ kind: "inspect-worktree", target: worktree, requiresHuman: true }] });
  if (pane && worktree && status === "unknown") return freeze({ ok: true, status: "inspect-required", steps: [{ kind: "inspect-agent", target: pane, requiresHuman: true }] });
  if (pane && worktree && status === "current") return freeze({ ok: true, status: "resumable", steps: [] });
  return freeze({ ok: true, status: "manual-intervention", steps: [] });
}

function sha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function absoluteScopedPath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 1
    && value.length <= 512
    && value.startsWith("/")
    && !value.split("/").includes("..")
    && !value.includes("//");
}

export function planCleanupV1(input: unknown): Readonly<PlainRecord> | Refusal {
  const root = record(input, ["repository", "worktreePath", "branch", "candidateSha", "observedCandidateSha", "mergeSha", "merged", "clean", "writerLeaseActive", "paneId", "paneCurrent"]);
  if (!root) return refusal();
  const repository = read(root, "repository");
  const worktreePath = read(root, "worktreePath");
  const branch = read(root, "branch");
  const candidateSha = read(root, "candidateSha");
  const observedCandidateSha = read(root, "observedCandidateSha");
  const mergeSha = read(root, "mergeSha");
  const paneId = read(root, "paneId");
  if (!safeId(repository, 128) || !absoluteScopedPath(worktreePath) || !safeId(branch, 128) || !sha(candidateSha) || !sha(observedCandidateSha) || !safeId(paneId)) return refusal();
  if (mergeSha === null && read(root, "merged") === null) return freeze({ ok: true, status: "unknown", executes: false, steps: [] });
  if (!sha(mergeSha)) return refusal();
  const booleans = ["merged", "clean", "writerLeaseActive", "paneCurrent"] as const;
  if (!booleans.every((key) => typeof read(root, key) === "boolean")) return refusal();
  const blocked = read(root, "merged") !== true || read(root, "clean") !== true || read(root, "writerLeaseActive") === true || read(root, "paneCurrent") !== true || candidateSha !== observedCandidateSha;
  if (blocked) return freeze({ ok: true, status: "blocked", executes: false, steps: [] });
  return freeze({
    ok: true,
    status: "ready",
    executes: false,
    scope: { repository, worktreePath, branch, candidateSha, mergeSha, paneId },
    steps: [
      { kind: "release-agent", target: paneId, requiresHuman: true, requiresPreviousSuccess: true },
      { kind: "close-pane", target: paneId, requiresHuman: true, requiresPreviousSuccess: true },
      { kind: "remove-worktree", target: worktreePath, requiresHuman: true, requiresPreviousSuccess: true },
      { kind: "delete-local-branch", target: branch, requiresHuman: true, requiresPreviousSuccess: true },
      { kind: "delete-remote-branch-if-exact", target: branch, requiresHuman: true, requiresPreviousSuccess: true },
      { kind: "clear-exact-lease", target: worktreePath, requiresHuman: true, requiresPreviousSuccess: true },
      { kind: "verify-cleanup", target: repository, requiresHuman: true, requiresPreviousSuccess: true },
    ],
  });
}
