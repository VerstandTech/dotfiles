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

/** Published V1 bounds the Implementer must export (exact-bound positives lock these). */
export const EXPECTED_LIMITS_V1 = {
	maxSerializedBytes: 65_536,
	maxNestingDepth: 16,
	maxStringLength: 4_096,
	maxPathLength: 512,
	maxCommandLength: 2_048,
	maxArrayLength: 256,
	maxMapKeys: 128,
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
		tools: ["read", "grep", "find", "ls", "bash"],
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
		tools: ["read", "grep", "find", "ls", "bash"],
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
		const codes = result.issues.map((i) => i.code).join(",");
		const hit =
			typeof codeHint === "string" ? codes.includes(codeHint) : codeHint.test(codes);
		expect(
			hit,
			`${CON01_P0_FAILURE_SIGNATURE}: ${detail}: expected issue code ${codeHint}, got ${codes}`,
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

// ─── Minimal valid fixtures (positive controls) ─────────────────────────────

const SHA40 = "a".repeat(40);
const SHA64 = "b".repeat(64);

export function minimalRoleRequest(
	role: AssuranceRoleV1 = "test-designer",
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
		...overrides,
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
		requestedAt: "2026-08-10T12:00:00.000Z",
		expiresAt: "2026-08-10T18:00:00.000Z",
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
		decidedAt: "2026-08-10T13:00:00.000Z",
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

/** Hostile object factories — getters must never be invoked. */
export function accessorTrap(): Record<string, unknown> {
	let invoked = false;
	const obj: Record<string, unknown> = {
		schemaVersion: 1,
		kind: "role-request",
	};
	Object.defineProperty(obj, "goal", {
		enumerable: true,
		configurable: true,
		get() {
			invoked = true;
			return "should-not-run";
		},
	});
	return Object.assign(obj, {
		__wasGetterInvoked: () => invoked,
	});
}

export function protoPollution(): Record<string, unknown> {
	return JSON.parse('{"schemaVersion":1,"kind":"role-request","__proto__":{"polluted":true}}');
}

export function cyclicGraph(): Record<string, unknown> {
	const o: Record<string, unknown> = {
		schemaVersion: 1,
		kind: "role-request",
		taskId: "t",
		role: "specifier",
		phase: "discovery",
		goal: "g",
		writeScope: "none",
		ownedPaths: [],
		forbiddenPaths: [],
		tools: ["read"],
	};
	o.self = o;
	return o;
}

export function sparseArrayContainer(): Record<string, unknown> {
	const arr: unknown[] = [];
	arr[5] = "gap";
	return {
		schemaVersion: 1,
		kind: "role-request",
		taskId: "t",
		role: "specifier",
		phase: "discovery",
		goal: "g",
		writeScope: "none",
		ownedPaths: arr,
		forbiddenPaths: [],
		tools: ["read"],
	};
}

export class CustomClass {
	schemaVersion = 1;
	kind = "role-request";
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
});
