import { createHash } from "node:crypto";
import { planSpawnBudgetGateV1 } from "../fleet/budget.ts";
import { planCleanupV1 } from "../operator/operator-control.ts";
import { redactForPersistence } from "../security/redact.ts";
import { evaluateTrajectory } from "../trajectory/evaluate.ts";
import { evaluateSecurityGateSlotsV1 } from "../security/trust-policy.ts";
import { requestApprovalV1 } from "../approvals/authority.ts";
import { runQualityGatePlan, type QualityGatePlan } from "../bdd/quality-gates.ts";
import { evaluateDecisionHandoffV1, evaluateDecisionPreActionV1, loadDecisionStoreSnapshotV1 } from "../decisions/evidence.ts";

const INPUT_KEYS = ["componentInputs", "fixture"];
const ROOT_KEYS = ["approval", "blockers", "budget", "candidateFingerprint", "gates", "green", "phases", "red", "requestedOperations", "review", "roles", "schemaVersion", "security", "startup", "storyId", "trajectory"];
const PHASES = ["discovery", "formulation", "causal-red", "covering-green", "verify"];
const REQUIRED_GATES = ["bdd", "budget", "decision", "integration", "security", "trajectory", "unit"];
const LIVE_OPERATIONS = new Set(["file-sink", "live-fleet", "network-access", "overnight-run", "package-install", "purge", "real-cleanup", "strict-profile"]);
const HEX = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain };
type BlockCode =
  | "approval-evidence-invalid" | "authority-escalation-refused" | "blocker-present"
  | "budget-evidence-invalid" | "candidate-fingerprint-mismatch" | "causal-red-invalid"
  | "child-startup-unavailable" | "cleanup-refused" | "component-evidence-invalid" | "covering-green-invalid"
  | "fitness-evidence-invalid" | "fixture-invalid" | "operator-approval-required"
  | "phase-order-invalid" | "review-evidence-invalid" | "role-isolation-invalid"
  | "security-evidence-invalid" | "trajectory-invalid" | "worktree-isolation-invalid";

const blocked = (code: BlockCode) => Object.freeze({ ok: false as const, status: "blocked" as const, code, executes: false as const });

function snapshot(value: unknown, seen = new WeakSet<object>(), depth = 0): Plain | undefined {
  if (depth > 12) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === "string") return value.length <= 1024 && !CONTROL.test(value) ? value : undefined;
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) return undefined;
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)))) return undefined;
      const result: Plain[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) return undefined;
        const item = snapshot(descriptor.value, seen, depth + 1);
        if (item === undefined) return undefined;
        result.push(item);
      }
      return result;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const result: { [key: string]: Plain } = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !SAFE_ID.test(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return undefined;
      const item = snapshot(descriptor.value, seen, depth + 1);
      if (item === undefined) return undefined;
      result[key] = item;
    }
    return result;
  } catch {
    return undefined;
  } finally {
    seen.delete(value);
  }
}

function object(value: Plain | undefined): value is { [key: string]: Plain } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(value: Plain | undefined, keys: readonly string[]): value is { [key: string]: Plain } {
  return object(value) && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}
function string(value: Plain | undefined): value is string { return typeof value === "string"; }
function bool(value: Plain | undefined): value is boolean { return typeof value === "boolean"; }
function strings(value: Plain | undefined): value is string[] { return Array.isArray(value) && value.every(string); }
function sameStrings(actual: string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function unique(values: string[]): boolean { return new Set(values).size === values.length; }
function pathSegmentsSafe(value: string): boolean {
  return !value.includes("\\") && !value.includes("//") && value.split("/").every((part, index) => (index === 0 && part === "") || (part.length > 0 && part !== "." && part !== ".."));
}
function absoluteSafePath(value: Plain | undefined): value is string {
  return string(value) && value.startsWith("/") && pathSegmentsSafe(value);
}
function relativeSafePath(value: Plain | undefined): value is string {
  return string(value) && !value.startsWith("/") && pathSegmentsSafe(value);
}

function validShape(root: Plain | undefined): root is { [key: string]: Plain } {
  if (!exact(root, ROOT_KEYS) || root.schemaVersion !== 1 || !string(root.storyId) || !SAFE_ID.test(root.storyId) || !HEX.test(String(root.candidateFingerprint))) return false;
  if (!strings(root.phases) || !Array.isArray(root.blockers) || !strings(root.blockers) || !Array.isArray(root.requestedOperations) || !strings(root.requestedOperations) || !Array.isArray(root.gates)) return false;
  if (!exact(root.roles, ["designer", "implementer", "reviewer"]) || !object(root.roles)) return false;
  const designer = root.roles.designer, implementer = root.roles.implementer, reviewer = root.roles.reviewer;
  if (!exact(designer, ["contextId", "roleId", "worktree"]) || !exact(implementer, ["contextId", "roleId", "worktree"]) || !exact(reviewer, ["contextId", "roleId"])) return false;
  if (![designer.roleId, designer.contextId, implementer.roleId, implementer.contextId, reviewer.roleId, reviewer.contextId].every((value) => string(value) && SAFE_ID.test(value)) || !absoluteSafePath(designer.worktree) || !absoluteSafePath(implementer.worktree)) return false;
  if (!exact(root.red, ["failureSignature", "testId"]) || !exact(root.green, ["coversRed", "testId"])) return false;
  if (![root.red.testId, root.red.failureSignature, root.green.testId].every(string) || !bool(root.green.coversRed)) return false;
  if (!exact(root.security, ["fingerprint", "rawSecretPresent", "status"]) || !exact(root.trajectory, ["antiPatternHits", "contiguous", "fingerprint", "status"])) return false;
  if (!string(root.security.status) || !string(root.security.fingerprint) || !bool(root.security.rawSecretPresent) || !string(root.trajectory.status) || !string(root.trajectory.fingerprint) || !bool(root.trajectory.contiguous) || !strings(root.trajectory.antiPatternHits)) return false;
  if (!exact(root.budget, ["confirmationRequired", "factsCurrent", "fingerprint", "hardExceeded", "postConfirmationRefreshed", "status", "usage"])) return false;
  if (![root.budget.status, root.budget.fingerprint, root.budget.usage].every(string) || ![root.budget.confirmationRequired, root.budget.factsCurrent, root.budget.hardExceeded, root.budget.postConfirmationRefreshed].every(bool)) return false;
  if (!exact(root.review, ["blockerCount", "fingerprint", "reviewerRoleId", "status", "undispositionedCount"]) || ![root.review.status, root.review.fingerprint, root.review.reviewerRoleId].every(string) || !Number.isSafeInteger(root.review.blockerCount) || !Number.isSafeInteger(root.review.undispositionedCount)) return false;
  if (!exact(root.approval, ["action", "current", "effect", "fingerprint", "paths", "risk", "source", "status"]) || ![root.approval.action, root.approval.effect, root.approval.fingerprint, root.approval.risk, root.approval.source, root.approval.status].every(string) || !bool(root.approval.current) || !strings(root.approval.paths) || root.approval.paths.length === 0 || !unique(root.approval.paths)) return false;
  if (!exact(root.startup, ["advisoryOnly", "status"]) || !string(root.startup.status) || !bool(root.startup.advisoryOnly)) return false;
  return root.gates.every((gate) => exact(gate, ["current", "fingerprint", "gate", "status"]) && string(gate.gate) && string(gate.status) && string(gate.fingerprint) && bool(gate.current));
}

function evaluateComponentInputs(value: Plain | undefined): { code?: BlockCode; proofs?: Plain } {
  if (!exact(value, ["budget", "cleanup", "security", "trajectory"])) return { code: "component-evidence-invalid" };
  const budgetInput = value.budget, cleanupInput = value.cleanup, securityInput = value.security, trajectoryInput = value.trajectory;
  if (!exact(budgetInput, ["childCount", "policy", "usage"]) || !exact(trajectoryInput, ["assertions", "run"]) || !exact(cleanupInput, ["postMerge", "preMerge"])) return { code: "component-evidence-invalid" };
  const budget = planSpawnBudgetGateV1(budgetInput as any);
  const observations = object(securityInput) && Array.isArray(securityInput.observations) ? securityInput.observations : [];
  const securityPayload = object(securityInput) ? Object.fromEntries(Object.entries(securityInput).filter(([key]) => key !== "observations")) : securityInput;
  const security = redactForPersistence(securityPayload);
  const firstObservation = observations[0];
  const candidateSha = object(firstObservation) ? firstObservation.candidateSha : undefined;
  const inventoryFingerprint = object(firstObservation) ? firstObservation.inventoryFingerprint : undefined;
  const securitySlots = evaluateSecurityGateSlotsV1({ candidateSha, inventoryFingerprint, requiredSlots: ["secret", "sast", "sca", "license"], observations });
  const trajectory = evaluateTrajectory(trajectoryInput.run as any, trajectoryInput.assertions as any);
  const preMergeCleanup = planCleanupV1(cleanupInput.preMerge);
  const postMergeCleanup = planCleanupV1(cleanupInput.postMerge);
  const redEvent = object(trajectoryInput.run) && Array.isArray(trajectoryInput.run.events) ? trajectoryInput.run.events.find((event) => object(event) && event.kind === "phase_change" && object(event.data) && event.data.phase === "red") : undefined;
  if (!object(redEvent) || !object(redEvent.data) || redEvent.data.testId !== "E2E01_HARMLESS_BEHAVIOR" || redEvent.data.failureSignature !== "expected blocked, received ready") return { code: "causal-red-invalid" };
  if (!object(budget as any) || (budget as any).ok !== true || (budget as any).decision !== "allow") return { code: "budget-evidence-invalid" };
  if ((security as any).ok !== true || (security as any).redactionCount !== 0 || !object(securitySlots as any) || (securitySlots as any).ok !== true || (securitySlots as any).available !== true || !(securitySlots as any).evidence) return { code: "security-evidence-invalid" };
  if (trajectory.ok !== true || trajectory.status !== "pass" || trajectory.antiPatterns.length !== 0) return { code: "trajectory-invalid" };
  if (!object(preMergeCleanup as any) || (preMergeCleanup as any).ok !== true || (preMergeCleanup as any).status !== "unknown" || (preMergeCleanup as any).executes !== false || !Array.isArray((preMergeCleanup as any).steps) || (preMergeCleanup as any).steps.length !== 0) return { code: "cleanup-refused" };
  if (!object(postMergeCleanup as any) || (postMergeCleanup as any).ok !== true || (postMergeCleanup as any).status !== "ready" || (postMergeCleanup as any).executes !== false || !Array.isArray((postMergeCleanup as any).steps) || (postMergeCleanup as any).steps.length === 0 || !(postMergeCleanup as any).steps.every((step: any) => step.requiresHuman === true && step.requiresPreviousSuccess === true)) return { code: "cleanup-refused" };
  return { proofs: JSON.parse(JSON.stringify({ budget, security, securitySlots, trajectory, cleanup: { preMerge: preMergeCleanup, postMerge: postMergeCleanup } })) as Plain };
}

async function evaluateAprAndFitness(root: { [key: string]: Plain }, componentProofs: Plain): Promise<{ code?: BlockCode; proofs?: Plain; fitnessEvidence?: Plain }> {
  const fingerprint = root.candidateFingerprint as string;
  const approval = root.approval as { [key: string]: Plain };
  let envelope: unknown = { schemaVersion: 1, records: [] };
  let revision = "revision-0";
  const store = {
    read: async () => ({ ok: true, revision, facts: { schemaVersion: 1, storePath: "/operator/.pi/approvals.json", storeRealPath: "/operator/.pi/approvals.json", projectRoot: "/workspace/e2e01", projectRealPath: "/workspace/e2e01", exists: true, mode: 0o600, regularFile: true, symbolicLink: false, hardLinkCount: 1, noFollow: true, atomicReplace: true, parentDirectorySafe: true, machineLocal: true }, value: structuredClone(envelope) }),
    commit: async (input: any) => { envelope = structuredClone(input.value); revision = "revision-1"; return { ok: true, revision, facts: { schemaVersion: 1, storePath: "/operator/.pi/approvals.json", storeRealPath: "/operator/.pi/approvals.json", projectRoot: "/workspace/e2e01", projectRealPath: "/workspace/e2e01", exists: true, mode: 0o600, regularFile: true, symbolicLink: false, hardLinkCount: 1, noFollow: true, atomicReplace: true, parentDirectorySafe: true, machineLocal: true } }; },
  };
  const approvalResult = await requestApprovalV1({ schemaVersion: 1, kind: "approval-request", requestId: "e2e01-diff", approvalKind: "diff", action: approval.action, risk: approval.risk, effect: approval.effect, paths: approval.paths, headSha: "a".repeat(40), planFingerprint: fingerprint, actionFingerprint: fingerprint, sessionId: "e2e01-session", generation: 1, createdAt: "2026-08-12T00:00:00.000Z", expiresAt: "2026-08-12T01:00:00.000Z" }, { clock: () => "2026-08-12T00:10:00.000Z", lifecycle: { active: true, sessionId: "e2e01-session", generation: 1 }, store, ui: { decide: async () => ({ decision: approval.status === "approved" ? "approved" : "denied", method: "pi-tui-confirm-select" }) } });
  if (!(approvalResult as any).ok || (approvalResult as any).outcome !== "approved" || (approvalResult as any).authority !== "apr-01") return { code: "approval-evidence-invalid" };

  const decisionStore = { version: 1, project: "e2e01", decisions: [{ id: "DEC-001", kind: "constraint", status: "accepted", title: "Require exact human diff approval", context: "Golden handoff is human controlled.", decision: "Stop at ready-for-human-merge.", humanReview: "approved", createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", enforcement: { effect: "forbid", actionIds: ["handoff.auto-merge"] } }] };
  const initialDecision = loadDecisionStoreSnapshotV1(decisionStore, { sourcePath: "docs/decisions/e2e01.json", writableByAgent: false });
  if (!(initialDecision as any).ok) return { code: "fitness-evidence-invalid" };
  const decisionSnapshot = loadDecisionStoreSnapshotV1(decisionStore, { sourcePath: "docs/decisions/e2e01.json", writableByAgent: false, approvedFingerprint: (initialDecision as any).snapshot.fingerprint });
  if (!(decisionSnapshot as any).ok) return { code: "fitness-evidence-invalid" };
  const preAction = evaluateDecisionPreActionV1({ snapshot: (decisionSnapshot as any).snapshot, actionId: "handoff.ready", paths: approval.paths });
  if (!(preAction as any).ok) return { code: "fitness-evidence-invalid" };
  const decision = evaluateDecisionHandoffV1({ snapshot: (decisionSnapshot as any).snapshot, expectedFingerprint: (decisionSnapshot as any).snapshot.fingerprint, actions: [(preAction as any).evidence] });
  if (!(decision as any).ok || (decision as any).evidence.status !== "passed") return { code: "fitness-evidence-invalid" };

  const gates = root.gates as { [key: string]: Plain }[];
  const internalIds: Record<string, string> = { trajectory: "fit.trajectory.v1", decision: "fit.decision.v1", budget: "fit.budget.v1", security: "fit.security.v1" };
  const plan: QualityGatePlan = { version: 1, profileFingerprint: fingerprint, fingerprint, trustProfile: "strict", gates: gates.map((gate) => internalIds[String(gate.gate)] ? ({ id: `e2e:${gate.gate}`, kind: gate.gate as any, source: "config", required: true, availability: "ready", timeoutMs: 1000, executorKind: "internal", trustTier: "trusted", executor: { kind: "internal", id: internalIds[String(gate.gate)] }, command: `internal:${internalIds[String(gate.gate)]}` }) : ({ id: `e2e:${gate.gate}`, kind: gate.gate as any, source: "config", required: true, availability: "ready", timeoutMs: 1000, executorKind: "argv", trustTier: "trusted", executor: { kind: "argv", file: "e2e-gate", args: [String(gate.gate)] }, command: `e2e-gate ${gate.gate}` })) };
  const components = componentProofs as any;
  const baseEvidence = { version: 1, planFingerprint: fingerprint, profileFingerprint: fingerprint, observedAt: "2026-08-12T00:19:00.000Z" };
  const securitySlots = components.securitySlots;
  const internalEvidence: any = {
    "fit.trajectory.v1": { ...baseEvidence, adapter: "trajectory", expectedRunId: components.trajectory.runId, result: components.trajectory },
    "fit.decision.v1": { ...baseEvidence, adapter: "decision", expectedStoreFingerprint: (decision as any).evidence.storeFingerprint, expectedApprovalFingerprint: (decision as any).evidence.approvalFingerprint, result: decision },
    "fit.budget.v1": { ...baseEvidence, adapter: "budget", result: components.budget.budget },
    "fit.security.v1": { ...baseEvidence, adapter: "security", candidateSha: fingerprint, expectedCandidateSha: fingerprint, inventoryFingerprint: fingerprint, expectedInventoryFingerprint: fingerprint, requiredSlots: ["secret", "sast", "sca", "license"], result: securitySlots },
  };
  const fitness = await runQualityGatePlan({ cwd: "/workspace/e2e01", plan, internalEvidence, now: () => "2026-08-12T00:20:00.000Z", execute: async ({ command }) => { const gate = gates.find((item) => command.endsWith(String(item.gate))); return { command, exitCode: gate?.status === "passed" ? 0 : 1, summary: gate?.status === "passed" ? "PASS" : "FAIL" }; } });
  if (!fitness.ok || !fitness.resultsFingerprint || fitness.results.some((gate) => gate.required && gate.status !== "passed")) return { code: "fitness-evidence-invalid" };
  return { proofs: JSON.parse(JSON.stringify({ components, approval: approvalResult, decision, fitness })) as Plain, fitnessEvidence: Object.freeze({ internalAdapters: Object.freeze(["budget", "decision", "security", "trajectory"]), resultsFingerprint: fitness.resultsFingerprint }) as unknown as Plain };
}

/** Pure relative to injected in-memory fixtures; it never executes external effects. */
export async function evaluateGoldenWorkflowV1(input: unknown) {
  const envelope = snapshot(input);
  if (!exact(envelope, INPUT_KEYS) || !exact(envelope.componentInputs, ["budget", "cleanup", "security", "trajectory"])) return blocked("fixture-invalid");
  const components = evaluateComponentInputs(envelope.componentInputs);
  if (components.code) return blocked(components.code);
  const root = envelope.fixture;
  if (!validShape(root)) return blocked("fixture-invalid");
  const fingerprint = root.candidateFingerprint as string;
  const securityProof = object(components.proofs) ? components.proofs.securitySlots : undefined;
  const securityInput = object(envelope.componentInputs) ? envelope.componentInputs.security : undefined;
  const observations = object(securityInput) && Array.isArray(securityInput.observations) ? securityInput.observations : [];
  if (!object(securityProof) || observations.length === 0 || observations.some((observation) => !object(observation) || observation.candidateSha !== fingerprint || observation.inventoryFingerprint !== fingerprint)) return blocked("candidate-fingerprint-mismatch");
  if (!sameStrings(root.phases as string[], PHASES)) return blocked("phase-order-invalid");
  if ((root.blockers as string[]).length > 0) return blocked("blocker-present");

  const roles = root.roles as { [key: string]: { [key: string]: Plain } };
  const roleIds = [roles.designer.roleId, roles.implementer.roleId, roles.reviewer.roleId] as string[];
  const contextIds = [roles.designer.contextId, roles.implementer.contextId, roles.reviewer.contextId] as string[];
  if (!unique(roleIds) || !unique(contextIds)) return blocked("role-isolation-invalid");
  if (roles.designer.worktree === roles.implementer.worktree) return blocked("worktree-isolation-invalid");

  const red = root.red as { [key: string]: Plain }, green = root.green as { [key: string]: Plain };
  if (red.testId !== "E2E01_HARMLESS_BEHAVIOR" || !(red.failureSignature as string).includes("expected blocked, received ready")) return blocked("causal-red-invalid");
  if (green.coversRed !== true || green.testId !== red.testId) return blocked("covering-green-invalid");

  const approvalFingerprint = (root.approval as { [key: string]: Plain }).fingerprint;
  if (approvalFingerprint !== fingerprint) return blocked("approval-evidence-invalid");
  const evidence = [root.security, root.budget, root.trajectory, root.review, ...(root.gates as Plain[])] as { [key: string]: Plain }[];
  if (evidence.some((item) => item.fingerprint !== fingerprint)) return blocked("candidate-fingerprint-mismatch");

  const security = root.security as { [key: string]: Plain };
  if (security.status !== "passed" || security.rawSecretPresent !== false) return blocked("security-evidence-invalid");
  const budget = root.budget as { [key: string]: Plain };
  if (budget.status !== "passed" || budget.usage !== "known" || budget.factsCurrent !== true || budget.hardExceeded !== false || (budget.confirmationRequired === true && budget.postConfirmationRefreshed !== true)) return blocked("budget-evidence-invalid");

  const gates = root.gates as { [key: string]: Plain }[];
  const gateNames = gates.map((gate) => gate.gate as string).sort();
  if (!sameStrings(gateNames, REQUIRED_GATES) || gates.some((gate) => gate.status !== "passed" || gate.current !== true)) return blocked("fitness-evidence-invalid");
  const trajectory = root.trajectory as { [key: string]: Plain };
  if (trajectory.status !== "passed" || trajectory.contiguous !== true || (trajectory.antiPatternHits as string[]).length > 0) return blocked("trajectory-invalid");
  const review = root.review as { [key: string]: Plain };
  if (review.status !== "passed" || review.reviewerRoleId !== roles.reviewer.roleId || review.blockerCount !== 0 || review.undispositionedCount !== 0) return blocked("review-evidence-invalid");
  const approval = root.approval as { [key: string]: Plain };
  if (approval.source !== "human-tui" || approval.current !== true || approval.action !== "approve-exact-diff" || approval.risk !== "project-file-mutation" || approval.effect !== "ready-for-human-merge" || !(approval.paths as string[]).every(relativeSafePath)) return blocked("approval-evidence-invalid");

  const startup = root.startup as { [key: string]: Plain };
  if (startup.status !== "available" || startup.advisoryOnly !== false) return blocked("child-startup-unavailable");
  if ((root.requestedOperations as string[]).some((operation) => LIVE_OPERATIONS.has(operation))) return blocked("operator-approval-required");
  if ((root.requestedOperations as string[]).length > 0) return blocked("authority-escalation-refused");

  const authority = await evaluateAprAndFitness(root, components.proofs as Plain);
  if (authority.code) return blocked(authority.code);
  const resultFingerprint = createHash("sha256").update(JSON.stringify({ fixture: root, componentInputs: envelope.componentInputs, proofs: authority.proofs })).digest("hex");
  const componentEvidence = Object.freeze({ security: "RED-01", budget: "BUD-01", trajectory: "OBS-01", decision: "DEC-01", fitness: "FIT-01", approval: "APR-01", cleanup: "OPS-01" });
  return Object.freeze({ ok: true as const, status: "ready-for-human-merge" as const, executes: false as const, candidateFingerprint: fingerprint, resultFingerprint, componentEvidence, fitnessEvidence: authority.fitnessEvidence });
}
