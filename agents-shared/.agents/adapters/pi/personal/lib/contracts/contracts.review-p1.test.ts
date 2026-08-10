/**
 * CON-01 independent-review P1 regressions (test-only).
 * Locks the six accepted blockers from CON-01-review-test-designer-contract.md.
 * Must fail on production HEAD until Implementer remediates — no production edits here.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CONTRACTS_DIR,
	loadContractsModule,
	minimalApprovalDecision,
	minimalApprovalRequest,
	minimalRoleRequest,
	minimalRoleResult,
	minimalValidationContract,
	allMinimalFixtures,
	requireContracts,
	requireExport,
	requireFn,
	type ContractsModule,
	type ParseResult,
} from "./contracts.shared.test.ts";

/** Locked review-regression failure signature (matchMode: signature). */
export const CON01_REVIEW_P1_FAILURE_SIGNATURE =
	"review regression accepted unsafe glob, permissive timestamp, unbounded object, or drifted descriptor/type contract" as const;

export const CON01_REVIEW_P1_PRIMARY_TEST_ID =
	"CON-01 review P1 > separates concrete references from validation-only trailing globs" as const;

function sig(detail: string): string {
	return `${CON01_REVIEW_P1_FAILURE_SIGNATURE}: ${detail}`;
}

function issueBlob(result: ParseResult<unknown>): string {
	if (result.ok) return "(accepted)";
	return result.issues.map((i) => `${i.code} ${i.path} ${i.message}`).join(" | ");
}

function expectReject(
	result: ParseResult<unknown>,
	detail: string,
	hint?: RegExp,
): void {
	expect(result.ok, sig(`${detail}: expected rejection, got accept`)).toBe(false);
	if (result.ok) return;
	expect(
		Array.isArray(result.issues) && result.issues.length > 0,
		sig(`${detail}: empty issues`),
	).toBe(true);
	if (hint) {
		const blob = issueBlob(result);
		expect(hint.test(blob), sig(`${detail}: expected ${hint}, got ${blob}`)).toBe(true);
	}
}

function expectAccept(result: ParseResult<unknown>, detail: string): void {
	if (!result.ok) {
		expect(false, sig(`${detail}: expected accept, got ${issueBlob(result)}`)).toBe(true);
	}
}

/** Resolve the separate validation-only glob export (name locked for Implementer). */
function requireValidationGlobFn(mod: ContractsModule): (path: unknown) => boolean {
	const record = mod as Record<string, unknown>;
	const fn = record.isSafeValidationGlobPath;
	expect(
		typeof fn === "function",
		sig(
			"missing exported isSafeValidationGlobPath (validation-only trailing /**; concrete refs must stay glob-free)",
		),
	).toBe(true);
	return fn as (path: unknown) => boolean;
}

/** Optional direct preflight export; otherwise exercise via parseContractV1. */
function runPreflight(
	mod: ContractsModule,
	input: unknown,
): ParseResult<unknown> {
	const record = mod as Record<string, unknown>;
	const pre = record.preflightUntrustedGraph;
	if (typeof pre === "function") {
		return (pre as (v: unknown) => ParseResult<unknown>)(input);
	}
	const parse = requireFn(mod, "parseContractV1", "parseContractV1 for preflight surface");
	return parse(input);
}

// ─── Test-only bounded JSON-Schema subset checker (descriptor parity) ───────

type Schema = Record<string, unknown>;

const SCHEMA_CHECK_MAX_NODES = 4_096;

function schemaIssues(
	schema: unknown,
	value: unknown,
	path: string,
	acc: string[],
	nodes: { n: number },
): void {
	if (acc.length >= 32 || nodes.n >= SCHEMA_CHECK_MAX_NODES) return;
	nodes.n++;
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		acc.push(`${path}: invalid schema node`);
		return;
	}
	const s = schema as Schema;

	if ("const" in s) {
		if (value !== s.const) acc.push(`${path}: const mismatch`);
		return;
	}
	if (Array.isArray(s.enum)) {
		if (!s.enum.includes(value as never)) acc.push(`${path}: enum mismatch`);
		return;
	}

	const t = s.type;
	if (t === "string") {
		if (typeof value !== "string") acc.push(`${path}: expected string`);
		else if (typeof s.minLength === "number" && value.length < s.minLength) {
			acc.push(`${path}: minLength`);
		}
		return;
	}
	if (t === "number") {
		if (typeof value !== "number" || !Number.isFinite(value)) acc.push(`${path}: expected number`);
		return;
	}
	if (t === "boolean") {
		if (typeof value !== "boolean") acc.push(`${path}: expected boolean`);
		return;
	}
	if (t === "array") {
		if (!Array.isArray(value)) {
			acc.push(`${path}: expected array`);
			return;
		}
		if (s.items) {
			for (let i = 0; i < value.length; i++) {
				schemaIssues(s.items, value[i], `${path}[${i}]`, acc, nodes);
			}
		}
		return;
	}
	if (t === "object" || s.properties || s.required || "additionalProperties" in s) {
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			acc.push(`${path}: expected object`);
			return;
		}
		const obj = value as Record<string, unknown>;
		const props = (s.properties ?? {}) as Record<string, unknown>;
		const required = Array.isArray(s.required) ? (s.required as string[]) : [];
		for (const r of required) {
			if (!(r in obj)) acc.push(`${path}.${r}: missing required`);
		}
		for (const key of Object.keys(obj)) {
			if (key in props) {
				schemaIssues(props[key], obj[key], path ? `${path}.${key}` : key, acc, nodes);
			} else if (s.additionalProperties === false) {
				acc.push(`${path}.${key}: additionalProperties false`);
			} else if (s.additionalProperties && typeof s.additionalProperties === "object") {
				schemaIssues(
					s.additionalProperties,
					obj[key],
					path ? `${path}.${key}` : key,
					acc,
					nodes,
				);
			}
		}
		return;
	}
	// Empty schema {} accepts anything — parity tests forbid this on nested objects.
}

function validateAgainstDescriptor(schema: unknown, value: unknown): string[] {
	const acc: string[] = [];
	schemaIssues(schema, value, "$", acc, { n: 0 });
	return acc;
}

/** Nested object schemas that validators close must be closed + property-complete in descriptors. */
function assertDescriptorObjectClosed(
	schema: unknown,
	label: string,
	requiredProps: readonly string[],
): void {
	expect(
		schema !== null && typeof schema === "object" && !Array.isArray(schema),
		sig(`descriptor ${label} missing object schema`),
	).toBe(true);
	const s = schema as Schema;
	expect(
		s.additionalProperties === false,
		sig(`descriptor ${label} must set additionalProperties:false (closed nested object)`),
	).toBe(true);
	expect(
		s.properties !== null && typeof s.properties === "object" && !Array.isArray(s.properties),
		sig(`descriptor ${label} must declare properties`),
	).toBe(true);
	const props = s.properties as Record<string, unknown>;
	for (const p of requiredProps) {
		expect(
			p in props,
			sig(`descriptor ${label} missing property "${p}" (validator/descriptor drift)`),
		).toBe(true);
	}
	if (Array.isArray(s.required)) {
		for (const r of requiredProps) {
			expect(
				(s.required as string[]).includes(r),
				sig(`descriptor ${label} required[] missing "${r}"`),
			).toBe(true);
		}
	}
}

function readProductionSources(): { name: string; src: string }[] {
	const names = readdirSync(CONTRACTS_DIR).filter(
		(n) => n.endsWith(".ts") && !n.endsWith(".test.ts"),
	);
	return names.map((name) => ({
		name,
		src: readFileSync(join(CONTRACTS_DIR, name), "utf8"),
	}));
}

function combinedProductionSource(): string {
	return readProductionSources()
		.map((f) => `// ---- ${f.name} ----\n${f.src}`)
		.join("\n");
}

// ─── 1. Concrete path vs validation-only trailing glob ──────────────────────

describe("CON-01 review P1", () => {
	test("separates concrete references from validation-only trailing globs", async () => {
		const mod = requireContracts(await loadContractsModule());
		const isSafe = requireFn(mod, "isSafeRepoRelativePath", "isSafeRepoRelativePath");
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const parseRole = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");
		const parseResult = requireFn(mod, "parseRoleResultV1", "parseRoleResultV1");
		const parseApproval = requireFn(mod, "parseApprovalRequestV1", "parseApprovalRequestV1");
		const parseValidation = requireFn(
			mod,
			"parseValidationContractV1",
			"parseValidationContractV1",
		);

		const concreteGlobs = [
			"**",
			"docs/**",
			"lib/contracts/**",
			"*",
			"docs/*",
			"a?",
			"docs/a?",
			"docs/[a-z].ts",
			"**/secrets",
			"docs/**/x",
			"docs/**/**",
		] as const;

		// Concrete path helper rejects every glob form.
		const concreteGlobLeaks = concreteGlobs.filter((g) => isSafe(g));

		// Envelope field probes (artifact/owned/forbidden/changed/evidence/scoped).
		const fieldProbes: Array<{ label: string; result: ParseResult<unknown> }> = [
			{
				label: "artifact",
				result: parseRole({
					...minimalRoleRequest(),
					artifacts: [{ path: "docs/**", mediaType: "text/plain" }],
				}),
			},
			{
				label: "ownedPaths",
				result: parseRole({
					...minimalRoleRequest(),
					ownedPaths: ["lib/contracts/**"],
					forbiddenPaths: [],
				}),
			},
			{
				label: "role.forbiddenPaths",
				result: parseRole({
					...minimalRoleRequest(),
					ownedPaths: ["docs/a.ts"],
					forbiddenPaths: ["lib/bdd/**"],
				}),
			},
			{
				label: "changedPaths",
				result: parseResult({
					...minimalRoleResult(),
					changedPaths: ["agents-shared/**"],
				}),
			},
			{
				label: "evidenceRefs",
				result: (() => {
					const blocked = minimalRoleResult({
						status: "blocked",
						blockers: ["x"],
						evidenceRefs: ["docs/**"],
						artifactRefs: [],
					});
					delete blocked.redCause;
					return parseResult(blocked);
				})(),
			},
			{
				label: "scopedPaths",
				result: parseApproval({
					...minimalApprovalRequest(),
					scopedPaths: ["lib/**"],
				}),
			},
		];
		const fieldLeaks = fieldProbes.filter((p) => p.result.ok).map((p) => p.label);

		const globExportPresent =
			typeof (mod as Record<string, unknown>).isSafeValidationGlobPath === "function";

		expect(
			{
				concreteGlobLeaks,
				fieldLeaks,
				globExportPresent,
			},
			sig(
				`concrete refs must deny globs and export isSafeValidationGlobPath; concreteGlobLeaks=${JSON.stringify(concreteGlobLeaks)} fieldLeaks=${JSON.stringify(fieldLeaks)} globExportPresent=${globExportPresent}`,
			),
		).toEqual({
			concreteGlobLeaks: [],
			fieldLeaks: [],
			globExportPresent: true,
		});

		// Separate validation-only glob export (required after concrete denial is locked).
		const isGlob = requireValidationGlobFn(mod);

		// Validation-only glob helper: exactly one non-bare trailing /**
		expect(
			isGlob("agents-shared/.agents/adapters/pi/personal/lib/contracts/**"),
			sig("validation glob must allow single non-bare trailing /**"),
		).toBe(true);
		expect(isGlob("docs/**"), sig("validation glob allows docs/**")).toBe(true);
		expect(isGlob("lib/bdd/**"), sig("validation glob allows lib/bdd/**")).toBe(true);

		// Bare ** and non-trailing / multi / wildcard forms stay denied on glob helper.
		for (const bad of [
			"**",
			"**/x",
			"docs/**/x",
			"docs/**/**",
			"docs/*",
			"*",
			"a?",
			"docs/[a-z]",
			"../x/**",
			"/tmp/**",
			"C:/x/**",
		] as const) {
			expect(
				isGlob(bad),
				sig(`validation glob must reject ${JSON.stringify(bad)}`),
			).toBe(false);
		}

		// ValidationContractV1.forbiddenProductionPathsBeforeRed uses validation-only globs.
		const vc = minimalValidationContract({
			forbiddenProductionPathsBeforeRed: [
				"agents-shared/.agents/adapters/pi/personal/lib/contracts/**",
				"agents-shared/.agents/adapters/pi/personal/lib/bdd/**",
			],
		});
		expectAccept(
			parseValidation(vc),
			"ValidationContractV1 must accept single trailing /** on forbiddenProductionPathsBeforeRed",
		);
		expectAccept(parse(vc), "parseContractV1 validation-contract trailing globs");

		// Still reject bare ** and mid-path globs on the validation contract field.
		expectReject(
			parseValidation(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["**"],
				}),
			),
			"forbiddenProductionPathsBeforeRed rejects bare **",
			/unsafe_path|glob|path/i,
		);
		expectReject(
			parseValidation(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["docs/**/nested"],
				}),
			),
			"forbiddenProductionPathsBeforeRed rejects non-trailing **",
			/unsafe_path|glob|path/i,
		);
		expectReject(
			parseValidation(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["docs/*"],
				}),
			),
			"forbiddenProductionPathsBeforeRed rejects single-star wildcards",
			/unsafe_path|glob|path/i,
		);
	});

	// ─── 2. Auth-path positive controls + secret leaf negatives ────────────

	test("accepts auth-path positives and denies secret-bearing leaves", async () => {
		const mod = requireContracts(await loadContractsModule());
		const isSafe = requireFn(mod, "isSafeRepoRelativePath", "isSafeRepoRelativePath");
		const parse = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");

		const positives = [
			"lib/auth/index.ts",
			"lib/xai-web-search/auth.ts",
			"docs/auth-model.md",
			"docs/secrets/readme.md",
		] as const;
		const secretLeaves = [
			".envrc",
			".env.local",
			".npmrc",
			"auth.json",
			"auth.json.bak",
			"credentials.json.enc",
			"service-account.json",
			"id_rsa",
			"private.pem",
			"private.pem.bak",
			"docs/.envrc",
			"config/auth.json.bak",
			"keys/private.pem.bak",
			"ops/credentials.json.enc",
		] as const;

		const overDenied = positives.filter((p) => !isSafe(p));
		const underDenied = secretLeaves.filter((p) => isSafe(p));
		expect(
			{ overDenied, underDenied },
			sig(
				`auth-path positive / secret-leaf negative matrix; overDenied=${JSON.stringify(overDenied)} underDenied=${JSON.stringify(underDenied)}`,
			),
		).toEqual({ overDenied: [], underDenied: [] });

		for (const p of positives) {
			if (!isSafe(p)) continue;
			expectAccept(
				parse({
					...minimalRoleRequest(),
					ownedPaths: [p],
					forbiddenPaths: [],
					artifacts: [{ path: p, mediaType: "text/plain" }],
				}),
				`envelope accepts legitimate path ${p}`,
			);
		}
		for (const p of secretLeaves) {
			expectReject(
				parse({
					...minimalRoleRequest(),
					artifacts: [{ path: p, mediaType: "text/plain" }],
				}),
				`artifact secret leaf ${p}`,
				/unsafe_path|secret|path/i,
			);
		}
	});

	// ─── 3. Strict Z-only RFC3339 + pair ordering ──────────────────────────

	test("enforces strict Z RFC3339 timestamps and requestedAt<=decidedAt<expiresAt", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parseReq = requireFn(mod, "parseApprovalRequestV1", "parseApprovalRequestV1");
		const parseDec = requireFn(mod, "parseApprovalDecisionV1", "parseApprovalDecisionV1");
		const checkPair = requireFn(mod, "checkApprovalPairV1", "checkApprovalPairV1");

		// Positive control — deterministic Z with millisecond precision.
		expectAccept(
			parseReq(
				minimalApprovalRequest({
					requestedAt: "2099-01-01T12:00:00.000Z",
					expiresAt: "2099-01-01T18:00:00.000Z",
				}),
			),
			"Z millisecond timestamp accept",
		);
		expectAccept(
			parseReq(
				minimalApprovalRequest({
					requestedAt: "2099-01-01T12:00:00Z",
					expiresAt: "2099-01-01T18:00:00Z",
				}),
			),
			"Z whole-second timestamp accept",
		);

		const permissive = [
			"2099-01-01", // date-only
			"2099-01-01T12:00:00+00:00", // offset
			"2099-01-01T12:00:00-05:00",
			"2099-01-01T12:00:00.123456789Z", // excessive fractional precision
			"Jan 1, 2099", // locale
			"01/01/2099",
			"2099-01-01 12:00:00Z", // space separator
			"2099-02-30T12:00:00.000Z", // invalid calendar (Date.parse rolls over)
			"2099-13-01T12:00:00.000Z",
			"not-a-timestamp",
			"",
		] as const;

		const acceptedPermissive: string[] = [];
		for (const bad of permissive) {
			const reqR = parseReq(
				minimalApprovalRequest({
					requestedAt: bad,
					expiresAt: "2099-01-01T18:00:00.000Z",
				}),
			);
			if (reqR.ok) acceptedPermissive.push(`requestedAt=${JSON.stringify(bad)}`);
			const decR = parseDec(
				minimalApprovalDecision({
					decidedAt: bad,
				}),
			);
			if (decR.ok) acceptedPermissive.push(`decidedAt=${JSON.stringify(bad)}`);
		}
		// Pair ordering: requestedAt <= decidedAt < expiresAt
		const req = minimalApprovalRequest({
			requestedAt: "2099-01-01T12:00:00.000Z",
			expiresAt: "2099-01-01T18:00:00.000Z",
		});
		const pairLeaks: string[] = [];
		// decidedAt before requestedAt must fail even if decidedAt < expiresAt.
		if (
			checkPair(
				req,
				minimalApprovalDecision({ decidedAt: "2099-01-01T11:00:00.000Z" }),
			).ok
		) {
			pairLeaks.push("decidedAt<requestedAt accepted");
		}
		if (
			checkPair(
				req,
				minimalApprovalDecision({ decidedAt: "2099-01-01T18:00:00.000Z" }),
			).ok
		) {
			pairLeaks.push("decidedAt==expiresAt accepted");
		}
		if (
			checkPair(
				req,
				minimalApprovalDecision({ decidedAt: "2099-01-01T19:00:00.000Z" }),
			).ok
		) {
			pairLeaks.push("decidedAt>expiresAt accepted");
		}

		expect(
			{ acceptedPermissive, pairLeaks },
			sig(
				`strict Z RFC3339 + pair order requestedAt<=decidedAt<expiresAt; acceptedPermissive=${JSON.stringify(acceptedPermissive)} pairLeaks=${JSON.stringify(pairLeaks)}`,
			),
		).toEqual({ acceptedPermissive: [], pairLeaks: [] });

		// Spot-check issue class on one representative permissive form.
		expectReject(
			parseReq(
				minimalApprovalRequest({
					requestedAt: "2099-01-01",
					expiresAt: "2099-01-01T18:00:00.000Z",
				}),
			),
			"date-only requestedAt issue class",
			/invalid_time|timestamp|time|rfc|format/i,
		);

		// Happy path ordering (only reached when strict stamps + pair gates hold).
		expectAccept(
			checkPair(
				req,
				minimalApprovalDecision({
					decidedAt: "2099-01-01T12:00:00.000Z", // equal requestedAt OK
				}),
			),
			"requestedAt == decidedAt < expiresAt accept",
		);
		expectAccept(
			checkPair(
				req,
				minimalApprovalDecision({
					decidedAt: "2099-01-01T15:00:00.000Z",
				}),
			),
			"requestedAt < decidedAt < expiresAt accept",
		);
	});

	// ─── 4. Preflight maxObjectKeys + ownKeys proxy ────────────────────────

	test("enforces maxObjectKeys before clone and returns issues on ownKeys failure", async () => {
		const mod = requireContracts(await loadContractsModule());
		const limits = requireExport(mod, "CONTRACT_LIMITS_V1", "CONTRACT_LIMITS_V1") as Record<
			string,
			number
		>;

		// Proxy ownKeys throw must become a validation issue, not an escaped exception.
		const ownKeysProxy = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error("ownKeys boom");
				},
				getOwnPropertyDescriptor() {
					return { enumerable: true, configurable: true, value: 1 };
				},
				get() {
					return 1;
				},
			},
		);
		let ownKeysThrew: unknown = undefined;
		let proxyResult: ParseResult<unknown> | undefined;
		try {
			proxyResult = runPreflight(mod, ownKeysProxy);
		} catch (e) {
			ownKeysThrew = e;
		}

		const maxKeysPublished =
			typeof limits.maxObjectKeys === "number" &&
			Number.isInteger(limits.maxObjectKeys) &&
			limits.maxObjectKeys > 0;

		let maxKeysPlusOneBound = false;
		let atLimitOkRegardingKeys = true;
		if (maxKeysPublished) {
			const maxKeys = limits.maxObjectKeys;
			const atLimit: Record<string, unknown> = {
				schemaVersion: 1,
				kind: "role-request",
			};
			let i = 0;
			while (Object.keys(atLimit).length < maxKeys) {
				atLimit[`pad_${i++}`] = true;
			}
			const atResult = runPreflight(mod, atLimit);
			if (!atResult.ok && /maxObjectKeys/i.test(issueBlob(atResult))) {
				atLimitOkRegardingKeys = false;
			}
			const over: Record<string, unknown> = { ...atLimit, extra_over_key: true };
			const overResult = runPreflight(mod, over);
			maxKeysPlusOneBound =
				!overResult.ok && /bound_exceeded/i.test(issueBlob(overResult));
		}

		expect(
			{
				maxKeysPublished,
				maxKeysPlusOneBound,
				atLimitOkRegardingKeys,
				ownKeysThrew: ownKeysThrew !== undefined,
				ownKeysIssue:
					proxyResult !== undefined &&
					!proxyResult.ok &&
					proxyResult.issues.length > 0,
			},
			sig(
				`maxObjectKeys before clone + ownKeys proxy must return issues; maxKeysPublished=${maxKeysPublished} maxKeysPlusOneBound=${maxKeysPlusOneBound} ownKeysThrew=${ownKeysThrew !== undefined} ownKeysIssue=${proxyResult !== undefined && !proxyResult.ok}`,
			),
		).toEqual({
			maxKeysPublished: true,
			maxKeysPlusOneBound: true,
			atLimitOkRegardingKeys: true,
			ownKeysThrew: false,
			ownKeysIssue: true,
		});

		// Detailed issue-class locks once the bound exists.
		if (maxKeysPublished) {
			const maxKeys = limits.maxObjectKeys;
			const over: Record<string, unknown> = { schemaVersion: 1, kind: "role-request" };
			for (let i = 0; Object.keys(over).length < maxKeys + 1; i++) {
				over[`pad_${i}`] = true;
			}
			expectReject(
				runPreflight(mod, over),
				"maxObjectKeys+1 must fail closed",
				/bound_exceeded|maxObjectKeys|object keys/i,
			);
		}
		if (proxyResult && ownKeysThrew === undefined) {
			expectReject(
				proxyResult,
				"ownKeys proxy failure returns validation issue",
				/unsafe|ownKeys|proxy|enumerat|object/i,
			);
		}
	});

	// ─── 5. Descriptor / validator parity ──────────────────────────────────

	test("keeps descriptors closed and field-aligned with validators", async () => {
		const mod = requireContracts(await loadContractsModule());
		const descriptors = requireExport(
			mod,
			"CONTRACT_DESCRIPTORS_V1",
			"CONTRACT_DESCRIPTORS_V1",
		) as Record<string, unknown>;
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const kinds = [
			"role-request",
			"role-result",
			"approval-request",
			"approval-decision",
			"validation-contract",
		] as const;

		for (const kind of kinds) {
			expect(
				kind in descriptors,
				sig(`missing descriptor for ${kind}`),
			).toBe(true);
			const d = descriptors[kind] as Schema;
			expect(
				d.additionalProperties === false,
				sig(`root descriptor ${kind} must be closed`),
			).toBe(true);
			expect(
				Array.isArray(d.required) && d.required.length > 0,
				sig(`root descriptor ${kind} must list required`),
			).toBe(true);
		}

		// Nested closed objects — field-for-field alignment with validators.
		const roleReq = descriptors["role-request"] as Schema;
		const roleReqProps = roleReq.properties as Record<string, Schema>;
		assertDescriptorObjectClosed(roleReqProps.budget, "role-request.budget", [
			"maxTokens",
			"maxCostUsd",
			"maxDurationMs",
		]);
		const artifactsSchema = roleReqProps.artifacts as Schema;
		expect(artifactsSchema?.type === "array", sig("artifacts must be array schema")).toBe(true);
		assertDescriptorObjectClosed(artifactsSchema.items, "role-request.artifacts.items", [
			"path",
			"mediaType",
		]);

		const roleRes = descriptors["role-result"] as Schema;
		const roleResProps = roleRes.properties as Record<string, Schema>;
		// role enum closed on result
		expect(
			Array.isArray((roleResProps.role as Schema | undefined)?.enum) ||
				(roleResProps.role as Schema | undefined)?.type === "string",
			sig("role-result.role must be typed"),
		).toBe(true);
		assertDescriptorObjectClosed(roleResProps.redCause, "role-result.redCause", [
			"expectedTestId",
			"expectedFailureSignature",
			"matchMode",
			"reasonCode",
			"cause",
		]);

		const approvalDec = descriptors["approval-decision"] as Schema;
		const approvalDecProps = approvalDec.properties as Record<string, Schema>;
		assertDescriptorObjectClosed(approvalDecProps.humanProvenance, "approval-decision.humanProvenance", [
			"actorId",
			"method",
		]);
		expect(
			Array.isArray((approvalDecProps.decision as Schema | undefined)?.enum),
			sig("approval-decision.decision must be enum"),
		).toBe(true);

		const vc = descriptors["validation-contract"] as Schema;
		const vcProps = vc.properties as Record<string, Schema>;
		assertDescriptorObjectClosed(vcProps.coveringGreen, "validation-contract.coveringGreen", [
			"relation",
			"command",
		]);
		assertDescriptorObjectClosed(vcProps.sensitivity, "validation-contract.sensitivity", [
			"description",
		]);
		expect(
			Array.isArray((vcProps.matchMode as Schema | undefined)?.enum),
			sig("matchMode enum required on descriptor"),
		).toBe(true);
		const matchEnum = (vcProps.matchMode as Schema).enum as string[];
		expect(matchEnum.includes("legacy"), sig("legacy must not be in matchMode enum")).toBe(
			false,
		);

		// Every minimal valid fixture must satisfy its descriptor (parity with validator accept).
		const fixtures = allMinimalFixtures();
		for (const kind of kinds) {
			const fixture = fixtures[kind]!;
			const parsed = parse(fixture);
			expectAccept(parsed, `validator accepts minimal ${kind}`);
			const descIssues = validateAgainstDescriptor(descriptors[kind], fixture);
			expect(
				descIssues,
				sig(
					`minimal ${kind} must validate against descriptor; drift: ${descIssues.join("; ")}`,
				),
			).toEqual([]);
		}

		// Representative unknown / nested-invalid fixtures fail both validator and descriptor.
		const unknownRoot = { ...minimalRoleRequest(), unexpectedSmuggle: true };
		expectReject(parse(unknownRoot), "unknown root field", /unknown_field/i);
		const unknownDesc = validateAgainstDescriptor(descriptors["role-request"], unknownRoot);
		expect(
			unknownDesc.some((x) => /additionalProperties|unexpectedSmuggle/i.test(x)),
			sig(`descriptor must reject unknown field, got ${unknownDesc.join("; ")}`),
		).toBe(true);

		const nestedInvalid = {
			...minimalRoleRequest(),
			budget: { maxTokens: 1, maxCostUsd: 1, maxDurationMs: 1, extraBudget: 9 },
		};
		expectReject(parse(nestedInvalid), "unknown nested budget field", /unknown_field|budget/i);
		const nestedDesc = validateAgainstDescriptor(descriptors["role-request"], nestedInvalid);
		expect(
			nestedDesc.some((x) => /budget|additionalProperties|extraBudget/i.test(x)),
			sig(`descriptor must reject nested unknown, got ${nestedDesc.join("; ")}`),
		).toBe(true);
	});

	// ─── 6. Typed public surface via narrow source declaration assertions ──

	test("exports closed V1 interfaces, ContractIssueCode, and typed parser signatures", async () => {
		// Runtime module load proves the package still evaluates; types are declaration-locked.
		requireContracts(await loadContractsModule());

		const src = combinedProductionSource();
		const indexSrc = readFileSync(join(CONTRACTS_DIR, "index.ts"), "utf8");

		const requiredTypes = [
			"RoleRequestV1",
			"RoleResultV1",
			"ApprovalRequestV1",
			"ApprovalDecisionV1",
			"ValidationContractV1",
			"ContractIssueCode",
		] as const;

		for (const name of requiredTypes) {
			const decl = new RegExp(
				String.raw`export\s+(?:type|interface)\s+${name}\b`,
			);
			expect(
				decl.test(src),
				sig(`missing exported type/interface declaration ${name}`),
			).toBe(true);
			// Public surface re-export from index (type-only export counts).
			const reExport = new RegExp(
				String.raw`\b${name}\b`,
			);
			expect(
				reExport.test(indexSrc),
				sig(`index.ts must re-export ${name} on the public surface`),
			).toBe(true);
		}

		// Nested supporting types used by the closed envelopes.
		const supporting = [
			"ArtifactRefV1",
			"BudgetV1",
			"HumanProvenanceV1",
			"CoveringGreenV1",
			"SensitivityV1",
			"RedCauseV1",
			"CommandClaimV1",
		] as const;
		for (const name of supporting) {
			expect(
				new RegExp(String.raw`export\s+(?:type|interface)\s+${name}\b`).test(src),
				sig(`missing nested supporting type ${name}`),
			).toBe(true);
		}

		// ContractIssueCode must be a closed string-union style declaration (not bare string alias only).
		expect(
			/export\s+type\s+ContractIssueCode\s*=/.test(src),
			sig("ContractIssueCode must be an exported type alias"),
		).toBe(true);
		expect(
			/ContractIssueCode\s*=\s*[\s\S]*?\|/.test(src) ||
				/ContractIssueCode\s*=\s*[^;]*"unknown_field"/.test(src),
			sig("ContractIssueCode must be a closed union of issue code literals"),
		).toBe(true);

		// ContractIssue.code should be typed as ContractIssueCode.
		expect(
			/code\s*:\s*ContractIssueCode/.test(src),
			sig("ContractIssue.code must be typed as ContractIssueCode"),
		).toBe(true);

		// Typed parser signatures: ParseResult<T> for each closed envelope.
		const parsers: Array<[string, string]> = [
			["parseRoleRequestV1", "RoleRequestV1"],
			["parseRoleResultV1", "RoleResultV1"],
			["parseApprovalRequestV1", "ApprovalRequestV1"],
			["parseApprovalDecisionV1", "ApprovalDecisionV1"],
			["parseValidationContractV1", "ValidationContractV1"],
		];
		for (const [fn, t] of parsers) {
			const typed = new RegExp(
				String.raw`export\s+function\s+${fn}\s*\(\s*input:\s*unknown\s*\)\s*:\s*ParseResult<\s*${t}\s*>`,
			);
			expect(
				typed.test(src),
				sig(
					`${fn} must be declared as (input: unknown) => ParseResult<${t}> (not ParseResult<unknown>)`,
				),
			).toBe(true);
		}

		// ParseResult / ParseOk / ParseErr remain exported generics.
		expect(
			/export\s+type\s+ParseResult\s*<\s*T\s*>/.test(src),
			sig("ParseResult<T> generic must remain exported"),
		).toBe(true);
	});
});

// Meta: lock oracle identity strings for ValidationContract wiring.
test("CON-01 review harness > locks primary test id and failure signature", () => {
	expect(CON01_REVIEW_P1_PRIMARY_TEST_ID).toBe(
		"CON-01 review P1 > separates concrete references from validation-only trailing globs",
	);
	expect(CON01_REVIEW_P1_FAILURE_SIGNATURE).toBe(
		"review regression accepted unsafe glob, permissive timestamp, unbounded object, or drifted descriptor/type contract",
	);
});
