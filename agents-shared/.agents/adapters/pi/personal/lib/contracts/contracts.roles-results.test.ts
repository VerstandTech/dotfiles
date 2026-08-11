/**
 * CON-01 — RoleRequestV1 matrix (R5) and RoleResultV1 honesty (R6).
 */
import { describe, expect, test } from "bun:test";
import {
	ASSURANCE_ROLES_V1,
	CON01_P0_FAILURE_SIGNATURE,
	CON01_P0_TEST_ID,
	ROLE_WRITE_SCOPE_MATRIX,
	expectAccepted,
	expectRejected,
	loadContractsModule,
	minimalRoleRequest,
	minimalRoleResult,
	requireContracts,
	requireFn,
	type AssuranceRoleV1,
} from "./contracts.shared.test.ts";

describe("CON-01 role requests", () => {
	test("valid requests for every assurance role and every allowed phase round-trip", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");

		for (const role of ASSURANCE_ROLES_V1) {
			const matrix = ROLE_WRITE_SCOPE_MATRIX[role];
			for (const phase of matrix.allowedPhases) {
				const fixture = minimalRoleRequest(role, { phase });
				const result = parse(fixture);
				expectAccepted(result, `E13 role ${role} phase ${phase}`);
				const v = result.value as Record<string, unknown>;
				expect(v.role).toBe(role);
				expect(v.writeScope).toBe(matrix.writeScope);
				expect(v.phase).toBe(phase);
				// No embedded authority fields
				expect(v).not.toHaveProperty("paneId");
				expect(v).not.toHaveProperty("writerToken");
				expect(v).not.toHaveProperty("leaseGrant");
				expect(v).not.toHaveProperty("approvalToken");
			}
		}
	});

	test("unknown roles, invalid phases, empty goals, overlapping paths, bad tools, scope mismatch fail", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");

		expectRejected(
			parse(minimalRoleRequest("implementer", { role: "overlord" })),
			"unknown role",
			/role|unknown|invalid/i,
		);
		expectRejected(
			parse(minimalRoleRequest("implementer", { phase: "discovery" })),
			"phase not allowed for implementer",
			/phase|role|scope|allowed/i,
		);
		expectRejected(
			parse(minimalRoleRequest("test-designer", { writeScope: "production" })),
			"E14 write-scope mismatch",
			/scope|writeScope|role|mismatch/i,
		);
		expectRejected(
			parse(minimalRoleRequest("specifier", { goal: "" })),
			"empty goal",
			/goal|empty|required/i,
		);
		expectRejected(
			parse(minimalRoleRequest("specifier", { taskId: "" })),
			"empty taskId",
			/taskId|empty|required/i,
		);
		expectRejected(
			parse(
				minimalRoleRequest("test-designer", {
					ownedPaths: ["docs/a.md"],
					forbiddenPaths: ["docs/a.md"],
				}),
			),
			"overlapping owned/forbidden",
			/overlap|owned|forbidden|path/i,
		);
		expectRejected(
			parse(minimalRoleRequest("specifier", { tools: ["READ"] })),
			"noncanonical tool case",
			/tool|canonical|unknown|invalid/i,
		);
		expectRejected(
			parse(minimalRoleRequest("specifier", { tools: ["subagent"] })),
			"tool outside role matrix",
			/tool|allowed|unknown|invalid/i,
		);
		expectRejected(
			parse(
				minimalRoleRequest("specifier", {
					ownedPaths: ["../escape"],
				}),
			),
			"unsafe owned path",
			/path|safe|owned|traversal/i,
		);

		// Explicit authority-shaped fields must not be accepted as unknown smuggle
		expectRejected(
			parse(minimalRoleRequest("implementer", { paneId: "pane-1" })),
			"paneId must not embed authority",
			/unknown|pane|authority|additional|closed/i,
		);
	});
});

describe("CON-01 role results", () => {
	test("completed clean result with valid SHA and evidence validates", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseRoleResultV1", "parseRoleResultV1");

		const sha40 = minimalRoleResult({ headSha: "c".repeat(40) });
		expectAccepted(parse(sha40), "E15 sha40");

		const sha64 = minimalRoleResult({ headSha: "d".repeat(64) });
		expectAccepted(parse(sha64), "E15 sha64");
	});

	test("blocked, failed, unknown, dirty, missing-usage, and nonempty blockers preserve uncertainty", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseRoleResultV1", "parseRoleResultV1");

		for (const status of ["blocked", "failed", "unknown"] as const) {
			const fixture = minimalRoleResult({
				status,
				blockers: ["waiting-on-human"],
				dirty: true,
				usage: "unknown",
			});
			const result = parse(fixture);
			expectAccepted(result, `E16 status ${status} with nonempty blockers`);
			const v = result.value as Record<string, unknown>;
			expect(v.status, `preserve ${status}`).toBe(status);
			expect(v.dirty).toBe(true);
			expect(v.usage, "missing usage is unknown never zero").toBe("unknown");
			expect(Array.isArray(v.blockers) && (v.blockers as string[]).length).toBeGreaterThan(0);
		}

		// Explicit null/omitted usage → unknown representation (not zero)
		const omitted = minimalRoleResult();
		delete omitted.usage;
		const omittedResult = parse(omitted);
		expectAccepted(omittedResult, "omitted usage");
		const ov = omittedResult.value as Record<string, unknown>;
		expect(
			ov.usage === "unknown" || ov.usage === undefined || ov.usage === null,
			`${CON01_P0_FAILURE_SIGNATURE}: usage must not coerce to zero`,
		).toBe(true);
		if (ov.usage && typeof ov.usage === "object") {
			const u = ov.usage as Record<string, unknown>;
			expect(u.inputTokens === 0 && u.outputTokens === 0).toBe(false);
		}

		// dirty clean completed
		expectAccepted(
			parse(minimalRoleResult({ dirty: false, status: "completed", blockers: [] })),
			"clean completed",
		);
		expectAccepted(
			parse(minimalRoleResult({ dirty: true, status: "blocked", blockers: ["dirty-tree"] })),
			"dirty blocked with nonempty blockers",
		);
		expectAccepted(
			parse(
				minimalRoleResult({
					status: "failed",
					blockers: ["unit-red", "path-policy"],
					dirty: false,
				}),
			),
			"failed with multiple nonempty blockers",
		);
	});

	test("malformed SHA, unsafe paths, transcripts, completed-with-blockers, contradictions fail", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseRoleResultV1", "parseRoleResultV1");

		expectRejected(
			parse(minimalRoleResult({ headSha: "not-a-sha" })),
			"malformed SHA",
			/sha|hex|invalid/i,
		);
		expectRejected(
			parse(minimalRoleResult({ headSha: "abc" })),
			"short SHA",
			/sha|hex|invalid|length/i,
		);
		expectRejected(
			parse(minimalRoleResult({ changedPaths: ["../outside"] })),
			"unsafe changed path",
			/path|safe|changed/i,
		);
		expectRejected(
			parse(minimalRoleResult({ artifactRefs: ["/tmp/x"] })),
			"unsafe artifact ref",
			/path|safe|artifact/i,
		);
		expectRejected(
			parse(
				minimalRoleResult({
					status: "completed",
					blockers: ["still-blocked"],
				}),
			),
			"E17 completed-with-blockers",
			/blocker|completed|contradiction|status/i,
		);
		expectRejected(
			parse(
				minimalRoleResult({
					transcript: "raw model dump",
				}),
			),
			"raw transcript field forbidden",
			/transcript|unknown|additional|closed|raw/i,
		);
		expectRejected(
			parse(
				minimalRoleResult({
					status: "completed",
					dirty: "yes",
				}),
			),
			"non-boolean dirty",
			/dirty|type|boolean/i,
		);

		// Red-cause projection must stay closed and signature-compatible
		expectRejected(
			parse(
				minimalRoleResult({
					redCause: {
						expectedTestId: CON01_P0_TEST_ID,
						expectedFailureSignature: CON01_P0_FAILURE_SIGNATURE,
						matchMode: "legacy",
					},
				}),
			),
			"redCause legacy mode forbidden",
			/legacy|match|mode/i,
		);
	});
});

// Keep type-only import live for role iteration clarity.
void (null as unknown as AssuranceRoleV1);
