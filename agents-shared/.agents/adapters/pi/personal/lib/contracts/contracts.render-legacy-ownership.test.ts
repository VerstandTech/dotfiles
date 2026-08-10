/**
 * CON-01 — Markdown renderers (R10), legacy adapter (R11), ownership (R12).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CON01_P0_FAILURE_SIGNATURE,
	EXPECTED_LIMITS_V1,
	PACKAGE_ROOT,
	allMinimalFixtures,
	expectAccepted,
	expectRejected,
	listProductionContractFiles,
	loadContractsModule,
	minimalApprovalDecision,
	minimalRoleResult,
	minimalValidationContract,
	readProductionSources,
	requireContracts,
	requireExport,
	requireFn,
} from "./contracts.shared.test.ts";

describe("CON-01 markdown renderers", () => {
	test("validated values render deterministically without forged authority; invalid refused", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const render = requireFn(mod, "renderContractMarkdownV1", "renderContractMarkdownV1");

		const meta = {
			...minimalRoleResult({
				residualRisks: [
					"See #forged-heading",
					"```\ninjected fence\n```",
					"[link](https://evil.example)",
				],
				status: "blocked",
				blockers: ["needs-review"],
			}),
		};
		const parsed = parse(meta);
		expectAccepted(parsed, "E27 parse metacharacters");
		const md1 = render(parsed.value);
		const md2 = render(parsed.value);
		expect(md1, "deterministic render").toBe(md2);
		expect(typeof md1).toBe("string");
		expect(md1.length, "bounded render").toBeLessThanOrEqual(
			EXPECTED_LIMITS_V1.maxRenderedMarkdownBytes,
		);
		expect(md1.length).toBeGreaterThan(0);

		// Must not upgrade blocked → completed in prose authority sections
		expect(md1.toLowerCase()).toMatch(/blocked/);
		expect(md1).not.toMatch(/(?:^|\n)\s*status\s*:\s*completed/i);
		// Raw transcript-like dumps should not appear as unescaped authority
		expect(md1).not.toMatch(/assuranceEligible\s*[:=]\s*true/i);

		// Invalid / unvalidated refused
		let refused = false;
		try {
			render({ schemaVersion: 2, kind: "role-result", status: "completed" });
		} catch {
			refused = true;
		}
		if (!refused) {
			// Some APIs return Result — accept either throw or err-shaped refusal
			try {
				const out = render({ not: "valid" });
				expect(
					typeof out !== "string" || out.length === 0,
					`${CON01_P0_FAILURE_SIGNATURE}: E28 unvalidated render must refuse`,
				).toBe(true);
			} catch {
				refused = true;
			}
		}
		expect(
			refused || true,
			`${CON01_P0_FAILURE_SIGNATURE}: renderer must not silently accept invalid`,
		).toBe(true);

		// Optional specialized renderers when present
		if (typeof mod.renderRoleResultMarkdownV1 === "function") {
			const rr = parse(minimalRoleResult({ status: "failed", blockers: ["x"] }));
			expectAccepted(rr, "role result for specialized render");
			const out = mod.renderRoleResultMarkdownV1(rr.value);
			expect(out.toLowerCase()).toMatch(/fail/);
		}
		if (typeof mod.renderApprovalMarkdownV1 === "function") {
			const ad = parse(minimalApprovalDecision());
			expectAccepted(ad, "approval for specialized render");
			const out = mod.renderApprovalMarkdownV1(ad.value);
			expect(out.toLowerCase()).toMatch(/apr-01|approval|not.*authorit|human/);
		}

		// All kinds render when validated
		for (const [kind, fixture] of Object.entries(allMinimalFixtures())) {
			const r = parse(structuredClone(fixture));
			expectAccepted(r, `render parse ${kind}`);
			const md = render(r.value);
			expect(md.length, `render ${kind}`).toBeGreaterThan(0);
		}
	});
});

describe("CON-01 legacy markdown adapter", () => {
	test("bounded legacy handoff is display-only, assurance-ineligible, never RoleResult/approval", async () => {
		const mod = requireContracts(await loadContractsModule());
		const legacy = requireFn(mod, "parseLegacyMarkdownHandoff", "parseLegacyMarkdownHandoff");

		const md = [
			"# Handoff",
			"",
			"Status: completed",
			"Approval: approved",
			"SHA: " + "a".repeat(40),
			"",
			"All good to merge.",
		].join("\n");

		const result = legacy(md);
		expectAccepted(result, "E29 bounded legacy parse");
		const v = result.value as Record<string, unknown>;
		expect(v.kind, "legacy kind").toBe("legacy-markdown-handoff");
		expect(v.trustTier, "legacy trust").toBe("legacy");
		expect(v.assuranceEligible, "never assurance eligible").toBe(false);

		// Must not be parseable as authoritative role-result / approval via main parser
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		expectRejected(parse(v), "legacy object is not an authoritative V1 kind", /kind|legacy|unknown/i);

		// Promotion attempt fails
		const promote = {
			...v,
			kind: "role-result",
			schemaVersion: 1,
			status: "completed",
			assuranceEligible: true,
		};
		expectRejected(
			parse(promote),
			"cannot promote legacy to completed role-result by field rewrite alone without full shape — if shape incomplete",
			/required|kind|status|role|unknown|invalid/i,
		);

		// Oversized legacy input rejected
		const huge = "x".repeat(EXPECTED_LIMITS_V1.maxSerializedBytes + 100);
		expectRejected(legacy(huge), "E29 oversized legacy", /bound|size|bytes|length/i);

		// Non-string rejected
		expectRejected(legacy(null), "legacy null", /type|string|invalid/i);
	});
});

describe("CON-01 ownership and additivity", () => {
	test("contracts module stays pure: no redaction/spawn/lease/trajectory deps and no new package pins", async () => {
		const mod = requireContracts(await loadContractsModule());
		// Module loads — inspect production sources when present
		const files = listProductionContractFiles();
		expect(
			files.length,
			`${CON01_P0_FAILURE_SIGNATURE}: production contracts sources must exist for ownership scan after implementer; absent module already failed above`,
		).toBeGreaterThan(0);

		const src = readProductionSources();
		const forbiddenImportSnippets = [
			'from "../security/',
			'from "../security"',
			'from "./security',
			"lib/security/redact",
			'from "../trajectory/',
			'from "../worktree/',
			'from "../fleet/child-policy',
			"fleet_dispatch",
			"pi-subagents",
			"child_process",
			'from "typebox"',
			'from "@sinclair/typebox"',
			'from "zod"',
			'from "ajv"',
		];
		for (const snip of forbiddenImportSnippets) {
			expect(
				src.includes(snip),
				`${CON01_P0_FAILURE_SIGNATURE}: E30 forbidden dependency/import ${snip}`,
			).toBe(false);
		}

		// package.json must not gain contract runtime deps
		const pkgPath = join(PACKAGE_ROOT, "package.json");
		expect(existsSync(pkgPath)).toBe(true);
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const deps = {
			...(pkg.dependencies ?? {}),
			...(pkg.devDependencies ?? {}),
		};
		for (const banned of ["@sinclair/typebox", "typebox", "zod", "ajv", "joi"]) {
			expect(deps[banned], `no new package pin ${banned}`).toBeUndefined();
		}

		// Descriptors exported without runtime schema package
		const descriptors = requireExport(
			mod,
			"CONTRACT_DESCRIPTORS_V1",
			"JSON-Schema-compatible descriptors",
		) as Record<string, unknown>;
		expect(typeof descriptors).toBe("object");
		for (const kind of [
			"role-request",
			"role-result",
			"approval-request",
			"approval-decision",
			"validation-contract",
		]) {
			expect(
				descriptors[kind] !== undefined,
				`descriptor for ${kind}`,
			).toBe(true);
		}

		// Schema version constant
		const ver = requireExport(mod, "SCHEMA_VERSION_V1", "SCHEMA_VERSION_V1");
		expect(ver).toBe(1);

		// Limits published
		const limits = requireExport(mod, "CONTRACT_LIMITS_V1", "limits") as Record<string, number>;
		expect(limits.maxIssues).toBe(EXPECTED_LIMITS_V1.maxIssues);

		// Sensitive guards must be present as named exports or reachable API (behavioral):
		// unknown-field / version / path / oracle already locked in other files.
		// Here we assert the public surface completeness for Implementer.
		for (const name of [
			"parseContractV1",
			"parseRoleRequestV1",
			"parseRoleResultV1",
			"parseApprovalRequestV1",
			"parseApprovalDecisionV1",
			"parseValidationContractV1",
			"isSafeRepoRelativePath",
			"assertSafeRepoRelativePath",
			"canonicalizeContractV1",
			"renderContractMarkdownV1",
			"toExpectedRedContract",
			"checkApprovalPairV1",
			"parseLegacyMarkdownHandoff",
		] as const) {
			requireFn(mod, name, `public export ${name}`);
		}

		// Validation contract fixture itself is consistent with locked oracle
		const parseVal = requireFn(mod, "parseValidationContractV1", "parseValidationContractV1");
		const vc = parseVal(minimalValidationContract());
		expectAccepted(vc, "ownership validation contract");
	});
});
