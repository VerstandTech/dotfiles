import { createHash } from "node:crypto";
import { isPackageDescriptorV1 } from "./package-descriptor.ts";
const CANONICAL_PLANS = new WeakSet<object>();

function hex(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }

function targetRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const allowed = ["path", "state", "resolvedWithinRoot", "ancestorsWithinRoot", "factsCurrent"];
  const result: Record<string, unknown> = {};
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.includes(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return undefined;
      result[key] = descriptor.value;
    }
  } catch { return undefined; }
  return Object.freeze(result);
}

export function planCanonicalInstallV1(input: any) {
  const descriptor = input?.descriptor;
  const staged = input?.staged;
  if (!Array.isArray(input?.targets)) throw new Error("invalid-canonical-plan");
  const targets = input.targets.map(targetRecord);
  if (targets.some((target: unknown) => !target)) throw new Error("invalid-canonical-plan");
  if (!isPackageDescriptorV1(descriptor) || !staged || !Array.isArray(staged.targets) || !Array.isArray(targets) || staged.manifestFingerprint !== descriptor.manifestFingerprint || staged.resourceFingerprint !== descriptor.resourceFingerprint || staged.status !== "verified" || staged.verifier !== "verify-ai-resources-v1") throw new Error("invalid-canonical-plan");
  const observedPaths = targets.map((x: any) => x.path).sort();
  const stagedPaths = [...staged.targets].sort();
  if (observedPaths.length !== descriptor.targets.length
    || stagedPaths.length !== descriptor.targets.length
    || observedPaths.some((path: string, index: number) => path !== descriptor.targets[index])
    || stagedPaths.some((path: string, index: number) => path !== descriptor.targets[index])
    || targets.some((x: any) => x.ancestorsWithinRoot !== true || x.factsCurrent !== true)) throw new Error("invalid-canonical-plan");
  const actions = targets.map((x: any) => {
    if (x.state === "absent" && x.resolvedWithinRoot === true) return Object.freeze({ kind: "create-managed-link", path: x.path });
    if (x.state === "managed-link" && x.resolvedWithinRoot === true) return Object.freeze({ kind: "retain", path: x.path });
    if (x.state === "stale-managed-link" && x.resolvedWithinRoot === true) return Object.freeze({ kind: "replace-managed-link", path: x.path });
    if (["user-file", "foreign-file", "foreign-link"].includes(x.state)) return Object.freeze({ kind: "backup-required", path: x.path });
    throw new Error("invalid-canonical-plan");
  });
  const frozenTargets = Object.freeze(structuredClone(targets).map((target: any) => Object.freeze(target)));
  const installPlanFingerprint = createHash("sha256").update(JSON.stringify({ manifestFingerprint: staged.manifestFingerprint, resourceFingerprint: staged.resourceFingerprint, targets: frozenTargets, actions })).digest("hex");
  const plan = Object.freeze({ ok: true, status: "blocked", code: "approval-required", executes: false, manifestFingerprint: staged.manifestFingerprint, resourceFingerprint: staged.resourceFingerprint, installPlanFingerprint, targets: frozenTargets, actions: Object.freeze(actions) });
  CANONICAL_PLANS.add(plan);
  return plan;
}

export function isCanonicalInstallPlanV1(value: unknown): boolean { return !!value && typeof value === "object" && CANONICAL_PLANS.has(value as object); }

export function createInstalledTransactionFromReadyV1(_ready: unknown, _transactionId: string) {
  throw new Error("apply-evidence-required");
}

function planInstalledTransaction(_value: unknown) {
  return Object.freeze({ ok: false, status: "blocked", code: "apply-evidence-required" });
}

export function planAuthorizedDisableV1(value: unknown) { return planInstalledTransaction(value); }
function planAuthorizedTransactionReversalV1(value: unknown) { return planInstalledTransaction(value); }
export { planAuthorizedTransactionReversalV1 as planAuthorizedRollbackV1 };
