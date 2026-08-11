/**
 * CON-01 — Approval envelopes (R7) and ValidationContractV1 + BDD bridge (R8).
 */
import { describe, expect, test } from "bun:test";
import {
	APPROVAL_DECIDED_AT_AFTER_EXPIRY,
	APPROVAL_DECIDED_AT_VALID,
	APPROVAL_EXPIRES_AT,
	CON01_P0_FAILURE_SIGNATURE,
	CON01_P0_TEST_ID,
	expectAccepted,
	expectProducerRefuses,
	expectRejected,
	loadContractsModule,
	minimalApprovalDecision,
	minimalApprovalRequest,
	minimalValidationContract,
	requireContracts,
	requireExport,
	requireFn,
} from "./contracts.shared.test.ts";

describe("CON-01 approval envelopes", () => {
	test("structurally valid request and matching human-provenance decision validate as data", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parseReq = requireFn(mod, "parseApprovalRequestV1", "parseApprovalRequestV1");
		const parseDec = requireFn(mod, "parseApprovalDecisionV1", "parseApprovalDecisionV1");
		const checkPair = requireFn(mod, "checkApprovalPairV1", "checkApprovalPairV1");
		const notice = requireExport(
			mod,
			"APPROVAL_AUTHORITY_NOTICE",
			"APPROVAL_AUTHORITY_NOTICE",
		);

		const req = minimalApprovalRequest();
		const dec = minimalApprovalDecision();
		expect(req.expiresAt).toBe(APPROVAL_EXPIRES_AT);
		expect(dec.decidedAt).toBe(APPROVAL_DECIDED_AT_VALID);
		// decidedAt must be strictly before expiresAt (deterministic far-future pair).
		expect(Date.parse(String(dec.decidedAt)) < Date.parse(String(req.expiresAt))).toBe(true);

		expectAccepted(parseReq(req), "E18 request");
		expectAccepted(parseDec(dec), "E18 decision");

		const pair = checkPair(req, dec);
		expectAccepted(pair, "E18 matching pair with decidedAt < expiresAt");
		const pv = pair.value as Record<string, unknown>;
		// Structural bind only — APR-01 owns authority
		expect(
			String(notice).toLowerCase(),
			"explicit non-authority marker naming APR-01",
		).toMatch(/apr-01/);
		expect(
			JSON.stringify(pv).toLowerCase(),
			"pair result must not claim machine authority",
		).not.toMatch(/authorityGranted|fullyAuthorized|machineAuthority/i);
		if ("authority" in pv) {
			expect(String(pv.authority)).toMatch(/apr-01|required|not-granted/i);
		}
	});

	test("approved decision missing human provenance fails; drift and decidedAt vs expiresAt fail closed", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parseDec = requireFn(mod, "parseApprovalDecisionV1", "parseApprovalDecisionV1");
		const checkPair = requireFn(mod, "checkApprovalPairV1", "checkApprovalPairV1");

		const noProv = minimalApprovalDecision();
		delete noProv.humanProvenance;
		expectRejected(parseDec(noProv), "E19 approved without human provenance", /human|provenance|required/i);

		const emptyProv = minimalApprovalDecision({
			humanProvenance: { actorId: "", method: "" },
		});
		expectRejected(parseDec(emptyProv), "E19 empty provenance", /human|provenance|actor|method/i);

		// Rejected decisions may omit provenance (must not look approved).
		const rejectedOmit = minimalApprovalDecision({ decision: "rejected" });
		delete rejectedOmit.humanProvenance;
		const rejectedResult = parseDec(rejectedOmit);
		expectAccepted(rejectedResult, "rejected without provenance");
		expect((rejectedResult.value as { decision: string }).decision).toBe("rejected");

		const req = minimalApprovalRequest();
		expectRejected(
			checkPair(req, minimalApprovalDecision({ requestId: "other-id" })),
			"E20 requestId drift",
			/requestId|bind|mismatch|drift/i,
		);
		expectRejected(
			checkPair(req, minimalApprovalDecision({ action: "delete-prod" })),
			"E20 action drift",
			/action|bind|mismatch|drift/i,
		);
		expectRejected(
			checkPair(req, minimalApprovalDecision({ risk: "low" })),
			"E20 risk drift",
			/risk|bind|mismatch|drift/i,
		);
		expectRejected(
			checkPair(req, minimalApprovalDecision({ candidateSha: "e".repeat(40) })),
			"E20 sha drift",
			/sha|bind|mismatch|drift/i,
		);
		expectRejected(
			checkPair(req, minimalApprovalDecision({ fingerprint: "other-fp" })),
			"E20 fingerprint drift",
			/fingerprint|bind|mismatch|drift/i,
		);
		expectRejected(
			checkPair(req, minimalApprovalDecision({ scopedPaths: ["docs/other.md"] })),
			"E20 path drift",
			/path|bind|mismatch|drift/i,
		);

		// decidedAt after expiresAt — bind expiry closed (far-future deterministic, not wall-clock).
		expect(
			Date.parse(APPROVAL_DECIDED_AT_AFTER_EXPIRY) > Date.parse(APPROVAL_EXPIRES_AT),
		).toBe(true);
		expectRejected(
			checkPair(
				minimalApprovalRequest({ expiresAt: APPROVAL_EXPIRES_AT }),
				minimalApprovalDecision({ decidedAt: APPROVAL_DECIDED_AT_AFTER_EXPIRY }),
			),
			"E20 decidedAt after expiresAt",
			/expir|time|bind|decided/i,
		);
		expectRejected(
			checkPair(
				minimalApprovalRequest({ expiresAt: "not-a-date" }),
				minimalApprovalDecision(),
			),
			"E20 malformed timestamp",
			/time|date|invalid|expir/i,
		);
	});
});

describe("CON-01 ValidationContractV1 and BDD bridge", () => {
	test("valid contract maps byte-for-byte to ExpectedRedContract fields without trust claims", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseValidationContractV1", "parseValidationContractV1");
		const bridge = requireFn(mod, "toExpectedRedContract", "toExpectedRedContract");

		const parsed = parse(minimalValidationContract());
		expectAccepted(parsed, "E21 valid validation contract");
		const bridged = bridge(parsed.value);

		expect(bridged.expectedTestId, "E23 expectedTestId byte-for-byte").toBe(CON01_P0_TEST_ID);
		expect(bridged.expectedFailureSignature, "E23 signature byte-for-byte").toBe(
			CON01_P0_FAILURE_SIGNATURE,
		);
		expect(bridged.matchMode, "E23 matchMode").toBe("signature");

		// Bridge must not add trust / assurance / classifier fields
		const keys = Object.keys(bridged).sort();
		for (const k of keys) {
			expect(
				["expectedTestId", "expectedFailureSignature", "matchMode"].includes(k),
				`${CON01_P0_FAILURE_SIGNATURE}: bridge must not add trust field ${k}`,
			).toBe(true);
		}
		expect(bridged).not.toHaveProperty("assuranceEligible");
		expect(bridged).not.toHaveProperty("trustTier");
		expect(bridged).not.toHaveProperty("reasonCode");
		expect(bridged).not.toHaveProperty("cause");
	});

	test("toExpectedRedContract refuses unvalidated, legacy, or missing-test-id input", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseValidationContractV1", "parseValidationContractV1");
		const bridge = requireFn(mod, "toExpectedRedContract", "toExpectedRedContract");

		// Unvalidated junk (not a ValidationContract shape)
		for (const bad of [null, undefined, "x", 1, [], { kind: "nope" }, { foo: true }]) {
			expectProducerRefuses(bridge, bad, `bridge refuses unvalidated ${JSON.stringify(bad)}`);
		}

		// Legacy matchMode refused (bridge must not emit legacy ExpectedRedContract)
		expectProducerRefuses(
			bridge,
			minimalValidationContract({ matchMode: "legacy" }),
			"bridge refuses legacy matchMode input",
		);

		// Missing / empty test id
		const missingId = minimalValidationContract();
		delete missingId.expectedTestId;
		expectProducerRefuses(bridge, missingId, "bridge refuses missing expectedTestId");
		expectProducerRefuses(
			bridge,
			minimalValidationContract({ expectedTestId: "" }),
			"bridge refuses empty expectedTestId",
		);

		// Positive: validated value bridges; re-validating plain valid shape is also OK
		const ok = parse(minimalValidationContract());
		expectAccepted(ok, "bridge positive setup parse");
		const bridged = bridge(ok.value);
		expect(bridged.expectedTestId).toBe(CON01_P0_TEST_ID);
		expect(bridged.matchMode).not.toBe("legacy" as unknown as "signature");
	});

	test("forbids legacy mode, missing sensitivity, signature-without-signature, unsafe paths, bad green relation", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseValidationContractV1", "parseValidationContractV1");

		expectRejected(
			parse(minimalValidationContract({ matchMode: "legacy" })),
			"E22 legacy forbidden",
			/legacy|match|mode/i,
		);

		const noSens = minimalValidationContract();
		delete noSens.sensitivity;
		expectRejected(parse(noSens), "E22 missing sensitivity", /sensitivity|required/i);

		const emptySens = minimalValidationContract({
			sensitivity: { description: "" },
		});
		expectRejected(parse(emptySens), "E22 empty sensitivity", /sensitivity|description|empty/i);

		const sigNoSig = minimalValidationContract({ matchMode: "signature" });
		delete sigNoSig.expectedFailureSignature;
		expectRejected(parse(sigNoSig), "E22 signature mode without signature", /signature/i);

		expectRejected(
			parse(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["../outside"],
				}),
			),
			"E22 unsafe forbidden path",
			/path|safe|forbidden/i,
		);

		expectRejected(
			parse(
				minimalValidationContract({
					coveringGreen: { relation: "unrelated-command", command: "true" },
				}),
			),
			"E22 contradictory green relation",
			/green|relation|cover|invalid/i,
		);

		const noCmd = minimalValidationContract();
		delete noCmd.focusedCommand;
		expectRejected(parse(noCmd), "E22 missing focused command", /command|focused|required/i);

		// identity mode may omit signature
		const identity = minimalValidationContract({ matchMode: "identity" });
		delete identity.expectedFailureSignature;
		expectAccepted(parse(identity), "identity mode omit signature");
	});
});
