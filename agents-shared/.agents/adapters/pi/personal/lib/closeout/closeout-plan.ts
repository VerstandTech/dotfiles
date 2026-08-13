const LIVE_OPERATIONS = new Set(["second-machine-install", "product-repo-adoption", "live-disable", "live-rollback", "live-restow"]);

export function planOpsEvidenceV1(input: Readonly<{ packageId: string; merged: boolean; rootGreen: boolean; historicalRedGreenAvailable: boolean; acceptanceRef: string }>) {
  if (input.packageId !== "OPS-01" || input.merged !== true || input.rootGreen !== true || typeof input.acceptanceRef !== "string" || !input.acceptanceRef.endsWith("OPS-01.feature")) {
    return Object.freeze({ ok: false as const, status: "blocked" as const, code: "ops-evidence-invalid" as const });
  }
  return Object.freeze({
    ok: true as const,
    status: "recorded" as const,
    red: "missing" as const,
    green: "missing" as const,
    historicalRedGreen: "unknown" as const,
    acceptanceRef: input.acceptanceRef,
    executes: false as const,
  });
}

function namedId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9:_-]{2,127}$/.test(value);
}

export function planLivePackageAcceptanceV1(input: Readonly<{ operation: string; approvedTarget?: string; approvalId?: string }>) {
  if (!LIVE_OPERATIONS.has(input.operation) || !namedId(input.approvedTarget) || !namedId(input.approvalId)) {
    return Object.freeze({ ok: false as const, status: "blocked" as const, code: "operator-approval-required" as const, executes: false as const });
  }
  return Object.freeze({ ok: true as const, status: "ready" as const, executes: false as const, operation: input.operation, target: input.approvedTarget });
}

export function planReviewFleetV1(input: Readonly<{ operatorApproved: boolean; backendEvidenceCurrent: boolean; approvalId?: string; backendEvidenceRef?: string }>) {
  if (input.operatorApproved !== true || input.backendEvidenceCurrent !== true || !namedId(input.approvalId) || !namedId(input.backendEvidenceRef)) {
    return Object.freeze({ ok: false as const, status: "blocked" as const, code: "operator-approval-required" as const, executes: false as const });
  }
  return Object.freeze({ ok: true as const, status: "ready" as const, executes: false as const, lenses: Object.freeze(["architecture", "security", "operator"]) });
}

export function refuseInventedAuthorityV1(input: Readonly<{ claim: string }>) {
  return Object.freeze({ ok: false as const, status: "blocked" as const, code: "authority-escalation-refused" as const, executes: false as const, claim: input.claim });
}
