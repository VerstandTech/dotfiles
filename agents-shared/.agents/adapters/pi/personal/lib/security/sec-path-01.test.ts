import { describe, expect, test } from "bun:test";

import {
	captureOperatorRequestedPathsV1,
	createSandboxCapabilityV1,
	evaluateSecurityPolicyV1,
	prepareSecurityToolResultV1,
} from "./trust-policy.ts";

const POLICY_FINGERPRINT = "a".repeat(64);
const CANDIDATE_SHA = "c".repeat(64);
const WORKTREE = "/workspace/project";
const SESSION_TEMP = "/tmp/pi-sec01/session-001";
const HOME = "/Users/operator";
const OPERATOR_PLAN = `${HOME}/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md`;
const UNSOLICITED_PLAN = `${HOME}/Downloads/other-plan.md`;
const SECRET_LEAF = `${HOME}/Downloads/credentials.json`;
const PLAN_TEXT = "Graphiti memory plan: keep FalkorDB local and fail closed.";
const SYNTHETIC_SECRET = "SYNTHETIC_SECRET_VALUE_NOT_REAL";

function observation(over: Record<string, unknown> = {}) {
	return {
		provider: "sandbox-runtime",
		platform: "darwin",
		sessionId: "session-001",
		policyFingerprint: POLICY_FINGERPRINT,
		worktreeRoot: WORKTREE,
		sessionTempRoot: SESSION_TEMP,
		homeRoot: HOME,
		initialized: true,
		active: true,
		features: {
			processTree: true,
			denyRead: true,
			allowWrite: true,
			denyNetwork: true,
			redirectRecheck: true,
			dnsRebindingDefense: true,
			lifecycleReset: true,
			workspaceMountPolicy: true,
		},
		allowedCommands: [["git", "status", "--short"]],
		allowedDomains: ["api.x.ai"],
		allowedPorts: [443],
		...over,
	};
}

function capability() {
	const result = createSandboxCapabilityV1(observation());
	expect(result).toMatchObject({ ok: true });
	if (!("capability" in result)) throw new Error("SEC_PATH_01_CAPABILITY_MISSING");
	return result.capability;
}

function pathFacts(over: Record<string, unknown> = {}): Record<string, unknown> {
	const requestedPath = String(over.requestedPath ?? `${WORKTREE}/src/index.ts`);
	const resolvedPath = String(over.resolvedPath ?? requestedPath);
	return {
		requestedPath,
		resolvedPath,
		resolvedParentPath: over.resolvedParentPath ?? (resolvedPath.slice(0, resolvedPath.lastIndexOf("/")) || "/"),
		fileKind: "regular",
		linkCount: 1,
		symlink: false,
		factsCurrent: true,
		...over,
	};
}

function request(
	cap: unknown,
	action: Record<string, unknown>,
	over: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		profile: "strict",
		runtime: { kind: "gate-command" },
		policyFingerprint: POLICY_FINGERPRINT,
		candidateSha: CANDIDATE_SHA,
		sandboxCapability: cap,
		action,
		...over,
	};
}

function expectRefusal(result: unknown, code: string): void {
	expect(result).toEqual(expect.objectContaining({ ok: false, code }));
	expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
	expect(JSON.stringify(result)).not.toContain(PLAN_TEXT);
}

describe("SEC-PATH-01 operator-requested local paths", () => {
	test("SECPATH01_OPERATOR_REQUESTED_READ: exact current-turn Downloads path is readable", () => {
		const cap = capability();
		const captured = captureOperatorRequestedPathsV1(cap, `Please read ${OPERATOR_PLAN}`);
		expect(captured).toMatchObject({ ok: true, count: 1 });
		const result = evaluateSecurityPolicyV1(request(cap, {
			kind: "read",
			facts: pathFacts({
				requestedPath: OPERATOR_PLAN,
				resolvedPath: OPERATOR_PLAN,
			}),
		}));

		expect(result).toEqual(expect.objectContaining({ ok: true, action: "read" }));
		expect(result).not.toEqual(expect.objectContaining({ code: "read-outside-authority" }));
		expect(JSON.stringify(result)).not.toContain(OPERATOR_PLAN);
	});

	test("SECPATH01_UNSOLICITED_OUTSIDE_DENIED: unsolicited home path remains blocked", () => {
		const cap = capability();
		expectRefusal(
			evaluateSecurityPolicyV1(request(cap, {
				kind: "read",
				facts: pathFacts({ requestedPath: UNSOLICITED_PLAN, resolvedPath: UNSOLICITED_PLAN }),
			})),
			"read-outside-authority",
		);
	});

	test("SECPATH01_SECRET_STILL_REFUSED: credential leaf still refuses", () => {
		const cap = capability();
		expect(captureOperatorRequestedPathsV1(cap, SECRET_LEAF)).toMatchObject({ ok: true, count: 1 });
		expectRefusal(
			evaluateSecurityPolicyV1(request(cap, {
				kind: "read",
				facts: pathFacts({ requestedPath: SECRET_LEAF, resolvedPath: SECRET_LEAF }),
			})),
			"secret-read-denied",
		);
	});

	test("SECPATH01_HOSTILE_STILL_REFUSED: accessor primary content still refuses", () => {
		const content: Record<string, unknown> = { value: PLAN_TEXT };
		content.self = content;

		const result = prepareSecurityToolResultV1({
			isError: false,
			toolName: "read",
			result: { content, details: { count: 1 } },
		});

		expect(result).toEqual({ ok: false, code: "content-redaction-refused" });
		expect(JSON.stringify(result)).not.toContain(PLAN_TEXT);
	});

	test("SECPATH01_OVERSIZED_DETAILS_DEGRADE: oversized details do not hide requested primary content", () => {
		const result = prepareSecurityToolResultV1({
			isError: false,
			toolName: "read",
			result: {
				content: [{ type: "text", text: PLAN_TEXT }],
				details: { blob: "x".repeat(70_000) },
			},
		});

		expect(result).toMatchObject({
			ok: true,
			isError: false,
			value: {
				content: [{ type: "text", text: PLAN_TEXT }],
				details: {
					securityPolicy: { ok: false, code: "details-redaction-refused" },
				},
			},
		});
		expect(JSON.stringify(result)).toContain(PLAN_TEXT);
		expect(JSON.stringify(result)).not.toContain("x".repeat(32));
	});

	test("SECPATH01_DIRECTORY_AND_SIBLING_DENIED: directory text and siblings stay blocked", () => {
		const cap = capability();
		expect(captureOperatorRequestedPathsV1(cap, `${HOME}/Downloads`)).toMatchObject({ ok: true, count: 1 });
		expectRefusal(
			evaluateSecurityPolicyV1(request(cap, {
				kind: "read",
				facts: pathFacts({ requestedPath: OPERATOR_PLAN, resolvedPath: OPERATOR_PLAN }),
			})),
			"read-outside-authority",
		);
		expect(captureOperatorRequestedPathsV1(cap, OPERATOR_PLAN)).toMatchObject({ ok: true, count: 1 });
		expectRefusal(
			evaluateSecurityPolicyV1(request(cap, {
				kind: "read",
				facts: pathFacts({ requestedPath: UNSOLICITED_PLAN, resolvedPath: UNSOLICITED_PLAN }),
			})),
			"read-outside-authority",
		);
	});

	test("SECPATH01_WRITE_UNCHANGED: operator-requested home path is not writable", () => {
		const cap = capability();
		expect(captureOperatorRequestedPathsV1(cap, OPERATOR_PLAN)).toMatchObject({ ok: true, count: 1 });
		expectRefusal(
			evaluateSecurityPolicyV1(request(cap, {
				kind: "write",
				facts: pathFacts({
					requestedPath: OPERATOR_PLAN,
					resolvedPath: OPERATOR_PLAN,
					fileKind: "absent",
					linkCount: 0,
				}),
			})),
			"write-outside-authority",
		);
	});

	test("SECPATH01_TILDE_CURRENT_TURN: tilde form expands against capability homeRoot", () => {
		const cap = capability();
		expect(captureOperatorRequestedPathsV1(cap, "read ~/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md")).toMatchObject({ ok: true, count: 1 });
		const result = evaluateSecurityPolicyV1(request(cap, {
			kind: "read",
			facts: pathFacts({ requestedPath: OPERATOR_PLAN, resolvedPath: OPERATOR_PLAN }),
		}));
		expect(result).toEqual(expect.objectContaining({ ok: true, action: "read" }));
	});

	test("SECPATH01_PRIOR_TURN_CLEARED: a later turn without the path revokes approval", () => {
		const cap = capability();
		expect(captureOperatorRequestedPathsV1(cap, OPERATOR_PLAN)).toMatchObject({ ok: true, count: 1 });
		expect(evaluateSecurityPolicyV1(request(cap, {
			kind: "read",
			facts: pathFacts({ requestedPath: OPERATOR_PLAN, resolvedPath: OPERATOR_PLAN }),
		}))).toEqual(expect.objectContaining({ ok: true, action: "read" }));
		expect(captureOperatorRequestedPathsV1(cap, "continue without naming a file")).toMatchObject({ ok: true, count: 0 });
		expectRefusal(
			evaluateSecurityPolicyV1(request(cap, {
				kind: "read",
				facts: pathFacts({ requestedPath: OPERATOR_PLAN, resolvedPath: OPERATOR_PLAN }),
			})),
			"read-outside-authority",
		);
	});
});
