import type { ApprovalCoreAdaptersV1, ApprovalRequestInputV1 } from "../approvals/types.ts";
import { checkApprovalAuthorityV1 } from "../approvals/authority.ts";
import { isCanonicalInstallPlanV1 } from "./canonical-plan.ts";

const APR_CAPABILITY = Symbol("pkg01-apr-authority");
const AUTHORIZED = new WeakSet<object>();


function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

export async function authorizeInstallPlanV1(
  input: Readonly<{ request: ApprovalRequestInputV1; plan: Readonly<Record<string, unknown>> }>,
  adapters: ApprovalCoreAdaptersV1,
): Promise<Readonly<Record<string, unknown>>> {
  if (!isCanonicalInstallPlanV1(input.plan)) return Object.freeze({ ok: false, status: "blocked", code: "plan-authority-required" });
  const installPlanFingerprint = input.plan.installPlanFingerprint;
  if (installPlanFingerprint !== input.request.planFingerprint) {
    return Object.freeze({ ok: false, status: "blocked", code: "plan-mismatch" });
  }
  const expectedPaths = [...new Set(input.plan.targets as readonly any[])].map((target: any) => target.path).sort();
  const requestPaths = [...new Set(input.request.paths)].sort();
  if (input.request.approvalKind !== "risky-action"
    || input.request.action !== "apply-pkg01-install-plan"
    || input.request.risk !== "home-link-mutation"
    || input.request.effect !== "authorize-exact-install-plan"
    || JSON.stringify(expectedPaths) !== JSON.stringify(requestPaths)) {
    return Object.freeze({ ok: false, status: "blocked", code: "approval-scope-mismatch" });
  }
  let result: unknown;
  try {
    result = await checkApprovalAuthorityV1(input.request, adapters);
  } catch {
    return Object.freeze({ ok: false, status: "blocked", code: "approval-required" });
  }
  if (own(result, "authority") !== "apr-01"
    || own(result, "authorityScope") !== "approval-only"
    || own(result, "ok") !== true
    || own(result, "outcome") !== "approved"
    || own(result, "current") !== true
    || own(result, "requestId") !== input.request.requestId
    || own(result, "approvalKind") !== input.request.approvalKind
    || own(result, "headSha") !== input.request.headSha
    || own(result, "sessionId") !== input.request.sessionId
    || own(result, "generation") !== input.request.generation
    || own(result, "expiresAt") !== input.request.expiresAt) {
    return Object.freeze({ ok: false, status: "blocked", code: "approval-required" });
  }
  const approved = {
    ok: true,
    status: "approved",
    authority: "apr-01",
    authorityScope: "approval-only",
    current: true,
    requestId: input.request.requestId,
    planFingerprint: installPlanFingerprint,
    [APR_CAPABILITY]: true,
  };
  AUTHORIZED.add(approved);
  return Object.freeze(approved);
}

export function isAuthorizedInstallApprovalV1(value: unknown): boolean {
  return !!value && typeof value === "object" && AUTHORIZED.has(value as object);
}
