/**
 * CON-01 — closed V1 envelopes, unknown fields, canonical round-trip (R1, R9).
 */
import { describe, expect, test } from "bun:test";
import {
	CON01_P0_FAILURE_SIGNATURE,
	allMinimalFixtures,
	expectAccepted,
	expectRejected,
	loadContractsModule,
	minimalApprovalDecision,
	minimalApprovalRequest,
	minimalRoleRequest,
	minimalRoleResult,
	minimalValidationContract,
	requireContracts,
	requireFn,
} from "./contracts.shared.test.ts";

describe("CON-01 envelopes", () => {
	test("minimal valid fixtures for every V1 kind validate and retain authoritative fields", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const fixtures = allMinimalFixtures();

		for (const [kind, fixture] of Object.entries(fixtures)) {
			const result = parse(structuredClone(fixture));
			expectAccepted(result, `E1 minimal ${kind}`);
			const v = result.value as Record<string, unknown>;
			expect(v.schemaVersion, `${kind} schemaVersion`).toBe(1);
			expect(v.kind, `${kind} kind`).toBe(kind);
		}

		// Specific parsers must agree with the discriminated union parser.
		const parseRole = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");
		const parseResult = requireFn(mod, "parseRoleResultV1", "parseRoleResultV1");
		const parseAprReq = requireFn(mod, "parseApprovalRequestV1", "parseApprovalRequestV1");
		const parseAprDec = requireFn(mod, "parseApprovalDecisionV1", "parseApprovalDecisionV1");
		const parseVal = requireFn(mod, "parseValidationContractV1", "parseValidationContractV1");

		expectAccepted(parseRole(minimalRoleRequest()), "parseRoleRequestV1 positive");
		expectAccepted(parseResult(minimalRoleResult()), "parseRoleResultV1 positive");
		expectAccepted(parseAprReq(minimalApprovalRequest()), "parseApprovalRequestV1 positive");
		expectAccepted(parseAprDec(minimalApprovalDecision()), "parseApprovalDecisionV1 positive");
		expectAccepted(parseVal(minimalValidationContract()), "parseValidationContractV1 positive");
	});

	test("missing required fields, wrong types, null, and substitutions fail with stable issues", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const cases: Array<{ label: string; value: unknown }> = [
			{ label: "null root", value: null },
			{ label: "array root", value: [] },
			{ label: "string root", value: "nope" },
			{ label: "number root", value: 1 },
			{
				label: "missing goal",
				value: (() => {
					const f = minimalRoleRequest();
					delete f.goal;
					return f;
				})(),
			},
			{
				label: "null goal",
				value: { ...minimalRoleRequest(), goal: null },
			},
			{
				label: "number goal",
				value: { ...minimalRoleRequest(), goal: 12 },
			},
			{
				label: "array goal",
				value: { ...minimalRoleRequest(), goal: ["x"] },
			},
			{
				label: "missing taskId",
				value: (() => {
					const f = minimalRoleRequest();
					delete f.taskId;
					return f;
				})(),
			},
			{
				label: "wrong tools type",
				value: { ...minimalRoleRequest(), tools: "read" },
			},
			{
				label: "missing status on result",
				value: (() => {
					const f = minimalRoleResult();
					delete f.status;
					return f;
				})(),
			},
			{
				label: "missing requestId on approval",
				value: (() => {
					const f = minimalApprovalRequest();
					delete f.requestId;
					return f;
				})(),
			},
			{
				label: "missing focusedCommand",
				value: (() => {
					const f = minimalValidationContract();
					delete f.focusedCommand;
					return f;
				})(),
			},
		];

		for (const c of cases) {
			expectRejected(parse(c.value), `E2 ${c.label}`, /required|type|null|invalid|kind|schema/i);
		}
	});

	test("unknown root or nested fields fail rather than strip or smuggle", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const unknownRoot = { ...minimalRoleRequest(), extraField: "smuggle" };
		expectRejected(parse(unknownRoot), "E3 unknown root field", /unknown|additional|extra|closed/i);

		const unknownNested = {
			...minimalRoleRequest(),
			budget: { maxTokens: 1, unexpected: true },
		};
		expectRejected(parse(unknownNested), "E3 unknown nested field", /unknown|additional|extra|closed/i);

		const unknownRedCause = {
			...minimalRoleResult(),
			redCause: {
				expectedTestId: "x",
				matchMode: "identity",
				trustClaim: "forged",
			},
		};
		expectRejected(
			parse(unknownRedCause),
			"E3 unknown redCause field must not smuggle trust",
			/unknown|additional|extra|closed/i,
		);
	});

	test("canonical JSON is deterministic, ordered, and round-trippable", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const canon = requireFn(mod, "canonicalizeContractV1", "canonicalizeContractV1");

		for (const [kind, fixture] of Object.entries(allMinimalFixtures())) {
			const a = parse(structuredClone(fixture));
			expectAccepted(a, `canon parse ${kind}`);
			const bytes1 = canon(a.value);
			expect(typeof bytes1, `${kind} canonical type`).toBe("string");
			expect(bytes1.length, `${kind} canonical non-empty`).toBeGreaterThan(2);

			// Re-parse canonical bytes
			const reparsed = parse(JSON.parse(bytes1));
			expectAccepted(reparsed, `canon reparse ${kind}`);
			const bytes2 = canon(reparsed.value);
			expect(bytes2, `E24 idempotent canonical bytes for ${kind}`).toBe(bytes1);

			// Different insertion order → identical bytes
			const shuffled = JSON.parse(bytes1) as Record<string, unknown>;
			const keys = Object.keys(shuffled).reverse();
			const reordered: Record<string, unknown> = {};
			for (const k of keys) reordered[k] = shuffled[k];
			const b = parse(reordered);
			expectAccepted(b, `reordered ${kind}`);
			expect(canon(b.value), `E25 order-independent canon for ${kind}`).toBe(bytes1);
		}

		// Invalid values cannot reach authoritative canonical serializer
		let threw = false;
		try {
			canon({ schemaVersion: 2, kind: "role-request" });
		} catch {
			threw = true;
		}
		const maybeResult = (() => {
			try {
				return canon({ not: "a contract" });
			} catch {
				threw = true;
				return null;
			}
		})();
		expect(
			threw || maybeResult === null || maybeResult === "",
			`${CON01_P0_FAILURE_SIGNATURE}: E26 untrusted value must not canonicalize authoritatively`,
		).toBe(true);
	});
});
