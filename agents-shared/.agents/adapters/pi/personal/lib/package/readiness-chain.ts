import { isAuthorizedInstallApprovalV1 } from "./install-authority.ts";
import { isCanonicalInstallPlanV1 } from "./canonical-plan.ts";

const READY = new WeakSet<object>();

function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  try { const d = Object.getOwnPropertyDescriptor(value, key); return d && "value" in d ? d.value : undefined; }
  catch { return undefined; }
}

export function authorizeVerifiedInstallReadinessV1(input: unknown): Readonly<Record<string, unknown>> {
  const plan = own(input, "plan");
  const staged = own(input, "staged");
  const approval = own(input, "approval");
  if (!plan || typeof plan !== "object" || !isCanonicalInstallPlanV1(plan)) return Object.freeze({ ok: false, status: "blocked", code: "invalid-install-plan" });
  if (own(staged, "manifestFingerprint") !== own(plan, "manifestFingerprint") || own(staged, "resourceFingerprint") !== own(plan, "resourceFingerprint")) return Object.freeze({ ok: false, status: "blocked", code: "staging-required" });
  if (!isAuthorizedInstallApprovalV1(approval) || own(approval, "planFingerprint") !== own(plan, "installPlanFingerprint")) return Object.freeze({ ok: false, status: "blocked", code: "approval-required" });
  const ready = Object.freeze({ ok: true, status: "ready", authority: "apr-01", manifestFingerprint: own(plan, "manifestFingerprint"), resourceFingerprint: own(plan, "resourceFingerprint"), installPlanFingerprint: own(plan, "installPlanFingerprint"), actions: own(plan, "actions"), executes: false });
  READY.add(ready);
  return ready;
}

export function isAuthorizedInstallReadinessV1(value: unknown): boolean { return !!value && typeof value === "object" && READY.has(value as object); }
