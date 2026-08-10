/**
 * CON-01 P0 — primary causal-red oracle.
 * Locked test id + failure signature for ValidationContractV1 / BDD-01 bridge.
 */
import { describe, expect, test } from "bun:test";
import {
	CON01_P0_FAILURE_SIGNATURE,
	CON01_P0_TEST_ID,
	EXPECTED_LIMITS_V1,
	SAFE_PATHS,
	UNSAFE_PATHS,
	allMinimalFixtures,
	expectAccepted,
	expectRejected,
	loadContractsModule,
	minimalRoleRequest,
	minimalValidationContract,
	requireContracts,
	requireExport,
	requireFn,
} from "./contracts.shared.test.ts";

describe("CON-01 P0", () => {
	test("rejects unsupported versions and unsafe artifact paths", async () => {
		// Title MUST remain exactly CON01_P0_TEST_ID for signature/identity oracles.
		expect(
			"CON-01 P0 > rejects unsupported versions and unsafe artifact paths",
		).toBe(CON01_P0_TEST_ID);

		const loaded = await loadContractsModule();
		const mod = requireContracts(loaded);

		const parseContract = requireFn(mod, "parseContractV1", "parseContractV1 required");
		const parseValidation = requireFn(
			mod,
			"parseValidationContractV1",
			"parseValidationContractV1 required",
		);
		const isSafe = requireFn(
			mod,
			"isSafeRepoRelativePath",
			"isSafeRepoRelativePath required",
		);
		const limits = requireExport(
			mod,
			"CONTRACT_LIMITS_V1",
			"CONTRACT_LIMITS_V1 required",
		) as Record<string, number>;

		// Positive control: minimal valid V1 fixtures must validate (reject-all cannot pass).
		for (const [kind, fixture] of Object.entries(allMinimalFixtures())) {
			const result = parseContract(structuredClone(fixture));
			expectAccepted(
				result,
				`valid minimal ${kind} fixture must validate (positive control)`,
			);
		}

		// Positive path controls.
		for (const p of SAFE_PATHS) {
			expect(
				isSafe(p),
				`${CON01_P0_FAILURE_SIGNATURE}: safe path must pass: ${p}`,
			).toBe(true);
		}

		// Unsupported versions must fail closed (no silent upgrade/downgrade).
		const versionCases: unknown[] = [
			{ ...minimalRoleRequest(), schemaVersion: 0 },
			{ ...minimalRoleRequest(), schemaVersion: 2 },
			{ ...minimalRoleRequest(), schemaVersion: "1" },
			{ ...minimalRoleRequest(), schemaVersion: 1.0 },
			{ ...minimalRoleRequest(), schemaVersion: true },
			{ ...minimalRoleRequest(), schemaVersion: null },
			(() => {
				const f = minimalRoleRequest();
				delete f.schemaVersion;
				return f;
			})(),
			{ ...minimalRoleRequest(), kind: "role-request-v2" },
			{ ...minimalRoleRequest(), kind: "unknown-kind" },
		];
		for (const bad of versionCases) {
			const result = parseContract(bad);
			expectRejected(
				result,
				"unsupported version/kind must reject",
				/version|kind|schema|unsupported|unknown/i,
			);
		}

		// Unsafe artifact / repo-relative paths must reject.
		for (const p of UNSAFE_PATHS) {
			expect(
				isSafe(p),
				`${CON01_P0_FAILURE_SIGNATURE}: unsafe path must fail: ${JSON.stringify(p)}`,
			).toBe(false);
		}

		// Red-cause / ValidationContract causal binding must reject legacy + missing signature.
		const legacyMode = minimalValidationContract({ matchMode: "legacy" });
		expectRejected(
			parseValidation(legacyMode),
			"legacy matchMode forbidden on ValidationContractV1",
			/legacy|match|mode/i,
		);

		const signatureWithoutSig = minimalValidationContract();
		delete signatureWithoutSig.expectedFailureSignature;
		expectRejected(
			parseValidation(signatureWithoutSig),
			"signature mode without failure signature must reject",
			/signature|expectedFailureSignature/i,
		);

		const missingTestId = minimalValidationContract();
		delete missingTestId.expectedTestId;
		expectRejected(
			parseValidation(missingTestId),
			"missing expectedTestId must reject",
			/testId|expectedTestId|required/i,
		);

		// Valid red-cause ValidationContract must accept and preserve oracle fields.
		const vc = parseValidation(minimalValidationContract());
		expectAccepted(vc, "valid ValidationContractV1 (red-cause oracle)");
		const value = vc.value as Record<string, unknown>;
		expect(
			value.expectedTestId,
			`${CON01_P0_FAILURE_SIGNATURE}: expectedTestId drift`,
		).toBe(CON01_P0_TEST_ID);
		expect(
			value.expectedFailureSignature,
			`${CON01_P0_FAILURE_SIGNATURE}: expectedFailureSignature drift`,
		).toBe(CON01_P0_FAILURE_SIGNATURE);
		expect(value.matchMode).toBe("signature");

		// Bounds table must be published exactly (prevents unbounded silent accept).
		for (const [key, n] of Object.entries(EXPECTED_LIMITS_V1)) {
			expect(
				limits[key],
				`${CON01_P0_FAILURE_SIGNATURE}: limit ${key} must equal ${n}`,
			).toBe(n);
		}

		// Final signature anchor: if we reached here with module present, the suite
		// still uses the locked phrase in every rejection path above. Keep a live
		// expect that names it so signature-mode scanners always observe it on fail.
		expect(
			CON01_P0_FAILURE_SIGNATURE.includes("invalid version/path/red-cause"),
			CON01_P0_FAILURE_SIGNATURE,
		).toBe(true);
	});
});
