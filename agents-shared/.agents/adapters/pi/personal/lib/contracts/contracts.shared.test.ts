/**
 * CON-01 shared test harness + synthetic fixtures.
 * Test-only. Production lib/contracts remains unimplemented until Implementer green.
 */
import { expect, test } from "bun:test";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";

/** Locked ValidationContractV1 / primary oracle identity (exact test title). */
export const CON01_P0_TEST_ID =
	"CON-01 P0 > rejects unsupported versions and unsafe artifact paths" as const;

/** Locked expected failure signature (matchMode: signature). */
export const CON01_P0_FAILURE_SIGNATURE =
	"invalid version/path/red-cause fixture validates or valid V1 fixture fails" as const;

export const CONTRACTS_DIR = import.meta.dir;
export const CONTRACTS_INDEX = join(CONTRACTS_DIR, "index.ts");
export const CONTRACTS_MODULE_URL = pathToFileURL(CONTRACTS_INDEX).href;
export const PACKAGE_ROOT = join(CONTRACTS_DIR, "../..");
export const LIB_ROOT = join(CONTRACTS_DIR, "..");

/**
 * Published V1 bounds the Implementer must export.
 * Every key has exact-limit accept + limit+1 reject oracles in the suite.
 * (maxMapKeys removed — V1 closed envelopes have no free-form maps.)
 */
export const EXPECTED_LIMITS_V1 = {
	maxSerializedBytes: 65_536,
	maxNestingDepth: 16,
	maxStringLength: 4_096,
	maxPathLength: 512,
	maxCommandLength: 2_048,
	maxCommandSummaryLength: 512,
	maxArrayLength: 256,
	maxRenderedMarkdownBytes: 32_768,
	maxIssues: 64,
} as const;

export const ASSURANCE_ROLES_V1 = [
	"specifier",
	"test-designer",
	"implementer",
	"breaker",
	"fitness-guardian",
	"refactorer",
	"qa",
] as const;

export type AssuranceRoleV1 = (typeof ASSURANCE_ROLES_V1)[number];
export type WriteScopeV1 = "none" | "tests" | "production";

/** Mirrors lib/bdd/assurance-cycle.ts role/write-scope matrix (structural only). */
export const ROLE_WRITE_SCOPE_MATRIX: Record<
	AssuranceRoleV1,
	{ writeScope: WriteScopeV1; allowedPhases: string[]; tools: string[] }
> = {
	specifier: {
		writeScope: "none",
		allowedPhases: ["discovery"],
		tools: ["read", "grep", "find", "ls"],
	},
	"test-designer": {
		writeScope: "tests",
		allowedPhases: ["formulation", "red"],
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	},
	implementer: {
		writeScope: "production",
		allowedPhases: ["green"],
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	},
	breaker: {
		writeScope: "none",
		allowedPhases: ["verify"],
		tools: ["read", "grep", "find", "ls"],
	},
	"fitness-guardian": {
		writeScope: "none",
		allowedPhases: ["verify"],
		tools: ["read", "grep", "find", "ls", "bash"],
	},
	refactorer: {
		writeScope: "production",
		allowedPhases: ["refactor"],
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	},
	qa: {
		writeScope: "none",
		allowedPhases: ["verify"],
		tools: ["read", "grep", "find", "ls"],
	},
};

export const CONTRACT_KINDS_V1 = [
	"role-request",
	"role-result",
	"approval-request",
	"approval-decision",
	"validation-contract",
] as const;

export type ContractIssue = {
	code: string;
	path: string;
	message: string;
};

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; issues: ContractIssue[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type ExpectedRedBridge = {
	expectedTestId?: string;
	expectedFailureSignature?: string;
	matchMode?: "identity" | "signature";
};

export type ContractsModule = {
	CONTRACT_LIMITS_V1?: typeof EXPECTED_LIMITS_V1 | Record<string, number>;
	CONTRACT_KINDS_V1?: readonly string[];
	ASSURANCE_ROLES_V1?: readonly string[];
	SCHEMA_VERSION_V1?: 1;
	APPROVAL_AUTHORITY_NOTICE?: string;
	CONTRACT_DESCRIPTORS_V1?: Record<string, unknown>;

	parseContractV1?: (input: unknown) => ParseResult<unknown>;
	parseRoleRequestV1?: (input: unknown) => ParseResult<unknown>;
	parseRoleResultV1?: (input: unknown) => ParseResult<unknown>;
	parseApprovalRequestV1?: (input: unknown) => ParseResult<unknown>;
	parseApprovalDecisionV1?: (input: unknown) => ParseResult<unknown>;
	parseValidationContractV1?: (input: unknown) => ParseResult<unknown>;

	isSafeRepoRelativePath?: (path: unknown) => boolean;
	assertSafeRepoRelativePath?: (path: unknown) => string;

	canonicalizeContractV1?: (value: unknown) => string;
	renderContractMarkdownV1?: (value: unknown) => string;
	renderRoleResultMarkdownV1?: (value: unknown) => string;
	renderApprovalMarkdownV1?: (value: unknown) => string;

	toExpectedRedContract?: (value: unknown) => ExpectedRedBridge;
	checkApprovalPairV1?: (
		request: unknown,
		decision: unknown,
	) => ParseResult<{ bound: true; authority: "apr-01-required" } | unknown>;

	parseLegacyMarkdownHandoff?: (input: unknown) => ParseResult<unknown>;
};

export type LoadResult =
	| { ok: true; mod: ContractsModule }
	| { ok: false; error: unknown; reason: "module_absent_or_unloadable" };

/** Guarded dynamic import — never throws into the Bun harness as setup failure. */
export async function loadContractsModule(): Promise<LoadResult> {
	try {
		const mod = (await import(CONTRACTS_MODULE_URL)) as ContractsModule;
		return { ok: true, mod };
	} catch (error) {
		return { ok: false, error, reason: "module_absent_or_unloadable" };
	}
}

/**
 * Require production module. Absence fails with the locked P0 signature so the
 * oracle stays behavioral (not bare module-not-found / setup noise).
 */
export function requireContracts(loaded: LoadResult): ContractsModule {
	if (!loaded.ok) {
		expect(
			false,
			`${CON01_P0_FAILURE_SIGNATURE}: production lib/contracts absent or unloadable`,
		).toBe(true);
		throw new Error("unreachable: contracts module missing after assertion");
	}
	return loaded.mod;
}

export function requireFn<K extends keyof ContractsModule>(
	mod: ContractsModule,
	name: K,
	why: string,
): NonNullable<ContractsModule[K]> {
	const value = mod[name];
	expect(
		typeof value === "function",
		`${CON01_P0_FAILURE_SIGNATURE}: ${why} (missing export ${String(name)})`,
	).toBe(true);
	return value as NonNullable<ContractsModule[K]>;
}

export function requireExport<K extends keyof ContractsModule>(
	mod: ContractsModule,
	name: K,
	why: string,
): NonNullable<ContractsModule[K]> {
	const value = mod[name];
	expect(
		value !== undefined && value !== null,
		`${CON01_P0_FAILURE_SIGNATURE}: ${why} (missing export ${String(name)})`,
	).toBe(true);
	return value as NonNullable<ContractsModule[K]>;
}

export function expectRejected(
	result: ParseResult<unknown>,
	detail: string,
	codeHint?: RegExp | string,
): asserts result is ParseErr {
	expect(result.ok, `${CON01_P0_FAILURE_SIGNATURE}: ${detail}: expected rejection`).toBe(
		false,
	);
	if (result.ok) return;
	expect(
		Array.isArray(result.issues) && result.issues.length > 0,
		`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: empty issues`,
	).toBe(true);
	expect(
		result.issues.length <= EXPECTED_LIMITS_V1.maxIssues,
		`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: issues unbounded`,
	).toBe(true);
	if (codeHint) {
		const blob = result.issues.map((i) => `${i.code} ${i.message} ${i.path}`).join(" | ");
		const hit =
			typeof codeHint === "string" ? blob.includes(codeHint) : codeHint.test(blob);
		expect(
			hit,
			`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: expected issue ${codeHint}, got ${blob}`,
		).toBe(true);
	}
}

export function expectAccepted<T>(
	result: ParseResult<T>,
	detail: string,
): asserts result is ParseOk<T> {
	if (!result.ok) {
		const codes =
			result.issues?.map((i) => `${i.code}@${i.path}`).join("; ") ?? "no-issues";
		expect(
			false,
			`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: expected accept, got issues: ${codes}`,
		).toBe(true);
	}
}

/**
 * Assert a producer (canon/render/bridge) refuses invalid input:
 * throw, Result.ok=false, empty string, or non-string — never authoritative output.
 */
export function expectProducerRefuses(
	produce: (input: unknown) => unknown,
	input: unknown,
	detail: string,
	opts?: { allowEmptyString?: boolean },
): void {
	let produced: unknown = undefined;
	let threw = false;
	try {
		produced = produce(input);
	} catch {
		threw = true;
	}
	if (threw) return;

	if (
		produced !== null &&
		typeof produced === "object" &&
		"ok" in (produced as object) &&
		(produced as ParseErr).ok === false
	) {
		return;
	}

	if (typeof produced === "string") {
		expect(
			produced.length === 0 && (opts?.allowEmptyString ?? true),
			`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: must not return non-empty authoritative string`,
		).toBe(true);
		return;
	}

	// Non-string success-shaped bridge/object counts as a leak unless Result-like refuse.
	expect(
		false,
		`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: must refuse invalid input (threw, err result, or empty)`,
	).toBe(true);
}

// ─── Minimal valid fixtures (positive controls) ─────────────────────────────

const SHA40 = "a".repeat(40);
const SHA64 = "b".repeat(64);

/** Far-future deterministic timestamps — pair binding must not depend on wall clock. */
export const APPROVAL_REQUESTED_AT = "2099-01-01T12:00:00.000Z";
export const APPROVAL_EXPIRES_AT = "2099-01-01T18:00:00.000Z";
export const APPROVAL_DECIDED_AT_VALID = "2099-01-01T13:00:00.000Z";
export const APPROVAL_DECIDED_AT_AFTER_EXPIRY = "2099-01-01T19:00:00.000Z";

export function minimalRoleRequest(
	roleOrOverrides: AssuranceRoleV1 | Record<string, unknown> = "test-designer",
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	// Prefer minimalRoleRequest(role, overrides). If a plain object is passed as the
	// first argument, treat it as overrides-only (avoids TypeError on matrix lookup).
	let role: AssuranceRoleV1 = "test-designer";
	let ov = overrides;
	if (typeof roleOrOverrides === "string") {
		role = roleOrOverrides;
	} else if (roleOrOverrides && typeof roleOrOverrides === "object") {
		ov = roleOrOverrides;
	}
	const matrix = ROLE_WRITE_SCOPE_MATRIX[role];
	return {
		schemaVersion: 1,
		kind: "role-request",
		taskId: "CON-01",
		role,
		phase: matrix.allowedPhases[0],
		goal: "Lock versioned contract public behavior with failing tests.",
		writeScope: matrix.writeScope,
		ownedPaths: ["agents-shared/.agents/adapters/pi/personal/lib/contracts"],
		forbiddenPaths: ["agents-shared/.agents/adapters/pi/personal/lib/bdd"],
		tools: [...matrix.tools],
		model: "test-model",
		thinking: "low",
		budget: { maxTokens: 8_000, maxCostUsd: 1, maxDurationMs: 60_000 },
		artifacts: [
			{
				path: "docs/plans/work-packages/CON-01.feature",
				mediaType: "text/plain",
			},
		],
		...ov,
	};
}

export function minimalRoleResult(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		schemaVersion: 1,
		kind: "role-result",
		taskId: "CON-01",
		role: "test-designer",
		status: "completed",
		headSha: SHA40,
		dirty: false,
		changedPaths: [
			"agents-shared/.agents/adapters/pi/personal/lib/contracts/contracts.p0.test.ts",
		],
		commands: [
			{
				command: "bun test lib/contracts",
				exitCode: 1,
				summary: "focused red",
			},
		],
		evidenceRefs: ["docs/plans/work-packages/CON-01.feature"],
		artifactRefs: ["docs/plans/work-packages/CON-01-example-map.md"],
		blockers: [],
		residualRisks: ["Implementer must not weaken path policy"],
		usage: { inputTokens: 10, outputTokens: 20 },
		redCause: {
			expectedTestId: CON01_P0_TEST_ID,
			expectedFailureSignature: CON01_P0_FAILURE_SIGNATURE,
			matchMode: "signature",
			reasonCode: "expected_assertion",
			cause: "missing production validators",
		},
		...overrides,
	};
}

export function minimalApprovalRequest(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		schemaVersion: 1,
		kind: "approval-request",
		requestId: "apr-con01-001",
		action: "merge-pr",
		risk: "high",
		scopedPaths: ["agents-shared/.agents/adapters/pi/personal/lib/contracts"],
		candidateSha: SHA40,
		fingerprint: "fp-con01-001",
		requestedAt: APPROVAL_REQUESTED_AT,
		expiresAt: APPROVAL_EXPIRES_AT,
		...overrides,
	};
}

export function minimalApprovalDecision(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		schemaVersion: 1,
		kind: "approval-decision",
		requestId: "apr-con01-001",
		decision: "approved",
		action: "merge-pr",
		risk: "high",
		scopedPaths: ["agents-shared/.agents/adapters/pi/personal/lib/contracts"],
		candidateSha: SHA40,
		fingerprint: "fp-con01-001",
		decidedAt: APPROVAL_DECIDED_AT_VALID,
		humanProvenance: {
			actorId: "human-operator",
			method: "local-interactive",
			evidenceRef: "docs/plans/work-packages/CON-01.feature",
		},
		...overrides,
	};
}

export function minimalValidationContract(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		schemaVersion: 1,
		kind: "validation-contract",
		packageId: "CON-01",
		focusedCommand:
			"cd /Users/leonardoribeiro/worktrees/dotfiles-con01-tests/agents-shared/.agents/adapters/pi/personal && bun test lib/contracts",
		expectedTestId: CON01_P0_TEST_ID,
		expectedFailureSignature: CON01_P0_FAILURE_SIGNATURE,
		matchMode: "signature",
		coveringGreen: {
			relation: "exact-focused",
			command:
				"cd /Users/leonardoribeiro/worktrees/dotfiles-con01-tests/agents-shared/.agents/adapters/pi/personal && bun test lib/contracts",
		},
		forbiddenProductionPathsBeforeRed: [
			"agents-shared/.agents/adapters/pi/personal/lib/contracts/**",
			"agents-shared/.agents/adapters/pi/personal/lib/bdd/**",
			"agents-shared/.agents/adapters/pi/personal/lib/security/**",
			"agents-shared/.agents/adapters/pi/personal/extensions/**",
		],
		sensitivity: {
			description:
				"Weaken exact-version, unknown-field, path traversal, causal test-ID/signature, or validated-render checks",
			weakenChecks: [
				"exact-version",
				"unknown-field",
				"path-traversal",
				"causal-binding",
				"validated-render",
			],
		},
		...overrides,
	};
}

export function allMinimalFixtures(): Record<string, Record<string, unknown>> {
	return {
		"role-request": minimalRoleRequest(),
		"role-result": minimalRoleResult(),
		"approval-request": minimalApprovalRequest(),
		"approval-decision": minimalApprovalDecision(),
		"validation-contract": minimalValidationContract(),
	};
}

export const SAFE_PATHS = [
	"docs/plans/work-packages/CON-01.feature",
	"agents-shared/.agents/adapters/pi/personal/lib/contracts/index.ts",
	"agents-shared/.agents/adapters/pi/personal/lib/contracts/x",
] as const;

export const UNSAFE_PATHS = [
	"../outside",
	"a/../../outside",
	"/tmp/outside",
	"C:\\outside",
	"C:/outside",
	"c:/outside",
	"c:\\outside",
	"\\\\server\\share\\x",
	"//server/share/x",
	"\\\\?\\C:\\outside",
	"~/outside",
	"file:///tmp/outside",
	"https://example.invalid/a",
	"a\\b",
	".",
	"..",
	"",
	"a//b",
	"a/./b",
	"a/\0b",
	"a/\nb",
	".env",
	".env.local",
	"auth.json",
	".npmrc",
	"id_rsa",
	"credentials.json",
	"service-account.json",
	"secrets/private.pem",
] as const;

/** Safe repo-relative path of exact character length (for bound oracles). */
export function exactLengthSafePath(length: number): string {
	const prefix = "docs/";
	if (length < prefix.length + 1) {
		return `${prefix}${"a".repeat(Math.max(1, length - prefix.length))}`.slice(0, length);
	}
	return `${prefix}${"a".repeat(length - prefix.length)}`;
}

/** Plain nested object of exact depth (root depth = 1 for `{v: null}` style leaf chain). */
export function plainNestingDepth(depth: number): unknown {
	if (depth < 1) return null;
	let node: unknown = null;
	for (let i = 0; i < depth; i++) {
		node = { v: node };
	}
	return node;
}

/**
 * Accessor trap built from a complete valid fixture — getters must never run.
 */
export function accessorTrapFromValid(): {
	obj: Record<string, unknown>;
	wasGetterInvoked: () => boolean;
} {
	const obj = minimalRoleRequest();
	let invoked = false;
	const originalGoal = obj.goal;
	delete obj.goal;
	Object.defineProperty(obj, "goal", {
		enumerable: true,
		configurable: true,
		get() {
			invoked = true;
			return originalGoal;
		},
	});
	return { obj, wasGetterInvoked: () => invoked };
}

/**
 * Complete valid RoleRequest plus a real own enumerable data property named `__proto__`.
 * Must NOT use JSON.stringify/parse (that drops the key) and must NOT mutate Object.prototype.
 */
export function protoPollutionFromValid(): Record<string, unknown> {
	const obj = minimalRoleRequest();
	Object.defineProperty(obj, "__proto__", {
		value: { polluted: true },
		enumerable: true,
		configurable: true,
		writable: true,
	});
	return obj;
}

/**
 * Structurally valid blocked RoleResult that MUST parse (serialized size ≤ maxSerializedBytes)
 * but whose residualRisks content alone exceeds maxRenderedMarkdownBytes so render fails closed.
 * Parse-time rejection does NOT satisfy the render-bound oracle.
 */
export function roleResultParseOkRenderOversize(): Record<string, unknown> {
	const maxRender = EXPECTED_LIMITS_V1.maxRenderedMarkdownBytes;
	const maxSer = EXPECTED_LIMITS_V1.maxSerializedBytes;
	const maxStr = EXPECTED_LIMITS_V1.maxStringLength;
	// Content strictly above render bound; keep JSON under serialized bound.
	const need = maxRender + 1;
	const chunk = Math.min(maxStr, 2_048);
	const risks: string[] = [];
	let filled = 0;
	while (filled < need && risks.length < EXPECTED_LIMITS_V1.maxArrayLength) {
		const n = Math.min(chunk, need - filled);
		risks.push("R".repeat(n));
		filled += n;
	}
	const fixture = minimalRoleResult({
		status: "blocked",
		blockers: ["render-bound"],
		residualRisks: risks,
		commands: [{ command: "t", exitCode: 1, summary: "t" }],
		changedPaths: [],
		evidenceRefs: [],
		artifactRefs: [],
		usage: "unknown",
	});
	delete fixture.redCause;
	const ser = JSON.stringify(fixture).length;
	if (ser > maxSer) {
		// Trim last risk until under serialized bound while keeping content > render bound.
		while (risks.length > 0 && JSON.stringify({ ...fixture, residualRisks: risks }).length > maxSer) {
			const last = risks[risks.length - 1]!;
			if (last.length <= 1) {
				risks.pop();
			} else {
				risks[risks.length - 1] = last.slice(0, Math.floor(last.length / 2));
			}
			fixture.residualRisks = [...risks];
		}
	}
	const contentLen = risks.join("").length;
	const finalSer = JSON.stringify(fixture).length;
	if (contentLen <= maxRender || finalSer > maxSer) {
		throw new Error(
			`roleResultParseOkRenderOversize unreachable: content=${contentLen} ser=${finalSer} renderMax=${maxRender} serMax=${maxSer}`,
		);
	}
	return fixture;
}

/** More than maxIssues distinct unknown keys + bad required fields for issue-cap oracle. */
export function overProductionInvalidFixture(): Record<string, unknown> {
	const bad: Record<string, unknown> = {
		schemaVersion: "nope",
		kind: 123,
		taskId: null,
		role: false,
		phase: 9,
		goal: 1,
		writeScope: {},
		ownedPaths: "nope",
		forbiddenPaths: 1,
		tools: null,
		model: 1,
		thinking: false,
		budget: "nope",
		artifacts: "nope",
	};
	const extras = EXPECTED_LIMITS_V1.maxIssues + 32;
	for (let i = 0; i < extras; i++) {
		bad[`extraField_${i}`] = `smuggle-${i}`;
	}
	return bad;
}

export function countDistinctInvalidPathsInOverProduction(): number {
	// Known-bad required/typed fields (14) + extras beyond maxIssues.
	return 14 + EXPECTED_LIMITS_V1.maxIssues + 32;
}

export function cyclicGraphFromValid(): Record<string, unknown> {
	const o = minimalRoleRequest();
	(o as { self?: unknown }).self = o;
	return o;
}

export function sparseArrayFromValid(): Record<string, unknown> {
	const o = minimalRoleRequest();
	const arr: unknown[] = [];
	arr[5] = "docs/gap.md";
	o.ownedPaths = arr;
	return o;
}

export function nonFiniteFromValid(
	which: "nan" | "infinity" = "nan",
): Record<string, unknown> {
	const o = minimalRoleRequest();
	o.budget = {
		maxTokens: which === "nan" ? Number.NaN : Number.POSITIVE_INFINITY,
		maxCostUsd: 1,
		maxDurationMs: 60_000,
	};
	return o;
}

export function functionFieldFromValid(): Record<string, unknown> {
	return { ...minimalRoleRequest(), goal: () => "x" };
}

export function symbolFieldFromValid(): Record<string, unknown> {
	return { ...minimalRoleRequest(), goal: Symbol("x") };
}

export function bigintFieldFromValid(): Record<string, unknown> {
	return {
		...minimalRoleRequest(),
		budget: { maxTokens: 1n as unknown as number, maxCostUsd: 1, maxDurationMs: 1 },
	};
}

export class CustomClassFromValid {
	constructor() {
		Object.assign(this, minimalRoleRequest());
	}
}

/**
 * Depth-exceeding graph: complete valid fixture fields at the leaves are not used;
 * pure nesting beyond maxNestingDepth must fail with a bound issue (pre-field walk).
 */
export function depthExceedingGraph(overBy = 1): unknown {
	return plainNestingDepth(EXPECTED_LIMITS_V1.maxNestingDepth + overBy);
}

/** Depth exactly at the published limit — must not fail for bound_exceeded. */
export function depthExactLimitGraph(): unknown {
	return plainNestingDepth(EXPECTED_LIMITS_V1.maxNestingDepth);
}

/** Collect production .ts files under lib/contracts excluding *.test.ts */
export function listProductionContractFiles(): string[] {
	if (!existsSync(CONTRACTS_DIR)) return [];
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			const st = statSync(p);
			if (st.isDirectory()) {
				if (name === "fixtures" || name === "node_modules") continue;
				walk(p);
				continue;
			}
			if (!name.endsWith(".ts")) continue;
			if (name.endsWith(".test.ts")) continue;
			out.push(p);
		}
	};
	walk(CONTRACTS_DIR);
	return out;
}

export function readProductionSources(): string {
	return listProductionContractFiles()
		.map((p) => readFileSync(p, "utf8"))
		.join("\n");
}

/**
 * Build a structurally valid blocked RoleResult whose JSON.stringify length is exactly `target`.
 * Pads residualRisks within maxStringLength / maxArrayLength. Returns null if unreachable.
 */
export function roleResultWithExactSerializedSize(
	target: number,
): Record<string, unknown> | null {
	const base = minimalRoleResult({
		status: "blocked",
		blockers: ["pad"],
		residualRisks: [],
		commands: [{ command: "t", exitCode: 1, summary: "t" }],
		changedPaths: [],
		evidenceRefs: [],
		artifactRefs: [],
		usage: "unknown",
	});
	delete base.redCause;
	const baseLen = JSON.stringify(base).length;
	if (baseLen > target) return null;
	let remaining = target - baseLen;
	const risks: string[] = [];
	// Each new risk adds: `,"..."` or for first element inside array `"..."` — measure incrementally.
	while (remaining > 0 && risks.length < EXPECTED_LIMITS_V1.maxArrayLength) {
		const trialLen = Math.min(
			remaining,
			EXPECTED_LIMITS_V1.maxStringLength,
			4096,
		);
		// probe chunk sizes downward to hit exact remaining after JSON escaping (no escapes for 'r')
		let placed = false;
		for (let n = trialLen; n >= 1; n--) {
			const candidate = [...risks, "r".repeat(n)];
			const trial = { ...base, residualRisks: candidate };
			const size = JSON.stringify(trial).length;
			if (size === target) {
				return trial;
			}
			if (size < target) {
				risks.push("r".repeat(n));
				remaining = target - size;
				placed = true;
				break;
			}
		}
		if (!placed) {
			// Cannot place a smaller chunk that fits — try single-char growth on last risk
			break;
		}
	}
	const final = { ...base, residualRisks: risks };
	if (JSON.stringify(final).length === target) return final;
	// Fine-tune last risk upward if short
	while (risks.length > 0) {
		const last = risks[risks.length - 1]!;
		if (last.length >= EXPECTED_LIMITS_V1.maxStringLength) break;
		risks[risks.length - 1] = last + "r";
		const trial = { ...base, residualRisks: [...risks] };
		const size = JSON.stringify(trial).length;
		if (size === target) return trial;
		if (size > target) {
			risks[risks.length - 1] = last;
			break;
		}
	}
	const out = { ...base, residualRisks: risks };
	return JSON.stringify(out).length === target ? out : null;
}

/** Quote-agnostic forbidden import / dependency patterns (E30). */
export const FORBIDDEN_SOURCE_PATTERNS: RegExp[] = [
	/\bfrom\s+['"][^'"]*security(\/|['"])/i,
	/\bfrom\s+['"][^'"]*\/redact['"]/i,
	/\bfrom\s+['"][^'"]*trajectory(\/|['"])/i,
	/\bfrom\s+['"][^'"]*worktree(\/|['"])/i,
	/\bfrom\s+['"][^'"]*child-policy['"]/i,
	/\bfrom\s+['"]typebox['"]/i,
	/\bfrom\s+['"]@sinclair\/typebox['"]/i,
	/\bfrom\s+['"]zod['"]/i,
	/\bfrom\s+['"]ajv['"]/i,
	/\bfrom\s+['"]joi['"]/i,
	/\brequire\s*\(\s*['"]child_process['"]\s*\)/,
	/\bfrom\s+['"]node:child_process['"]/,
	/\bfleet_dispatch\b/,
	/\bpi-subagents\b/,
	/lib\/security\/redact/,
];

// Meta: ensure this harness file is collected by bun test without acting as a silent pass suite.
test("CON-01 harness > exports locked oracle identity constants", () => {
	expect(CON01_P0_TEST_ID).toBe(
		"CON-01 P0 > rejects unsupported versions and unsafe artifact paths",
	);
	expect(CON01_P0_FAILURE_SIGNATURE).toBe(
		"invalid version/path/red-cause fixture validates or valid V1 fixture fails",
	);
	expect(SHA64).toHaveLength(64);
	expect(dirname(CONTRACTS_INDEX).endsWith("contracts")).toBe(true);
	expect(exactLengthSafePath(EXPECTED_LIMITS_V1.maxPathLength)).toHaveLength(
		EXPECTED_LIMITS_V1.maxPathLength,
	);
	// Fixture builders used by bound oracles must be exact (independent of production).
	const exact = roleResultWithExactSerializedSize(EXPECTED_LIMITS_V1.maxSerializedBytes);
	expect(exact, "exact serialized fixture constructible").not.toBeNull();
	expect(JSON.stringify(exact!).length).toBe(EXPECTED_LIMITS_V1.maxSerializedBytes);
	const over = roleResultWithExactSerializedSize(EXPECTED_LIMITS_V1.maxSerializedBytes + 1);
	if (over) {
		expect(JSON.stringify(over).length).toBe(EXPECTED_LIMITS_V1.maxSerializedBytes + 1);
	}

	// P0-R1: __proto__ must be a real own enumerable data property (not lost to JSON).
	const protoFix = protoPollutionFromValid();
	expect(Object.prototype.hasOwnProperty.call(protoFix, "__proto__")).toBe(true);
	const protoDesc = Object.getOwnPropertyDescriptor(protoFix, "__proto__");
	expect(protoDesc?.enumerable).toBe(true);
	expect(protoDesc && "get" in protoDesc ? protoDesc.get : undefined).toBeUndefined();
	expect(protoDesc?.value).toEqual({ polluted: true });
	expect(Object.getPrototypeOf(protoFix)).toBe(Object.prototype);
	expect(Object.getOwnPropertyDescriptor(Object.prototype, "polluted")).toBeUndefined();

	// P1-R1: parse-ok / render-oversize fixture invariants (builder-only).
	const renderOver = roleResultParseOkRenderOversize();
	const renderContent = (renderOver.residualRisks as string[]).join("").length;
	expect(renderContent).toBeGreaterThan(EXPECTED_LIMITS_V1.maxRenderedMarkdownBytes);
	expect(JSON.stringify(renderOver).length).toBeLessThanOrEqual(
		EXPECTED_LIMITS_V1.maxSerializedBytes,
	);
	expect(countDistinctInvalidPathsInOverProduction()).toBeGreaterThan(
		EXPECTED_LIMITS_V1.maxIssues,
	);
});
