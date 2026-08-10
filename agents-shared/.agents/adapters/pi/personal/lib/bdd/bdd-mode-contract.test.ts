import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const packageRoot = join(import.meta.dir, "../..");
const extensionSource = () => readFileSync(join(packageRoot, "extensions/bdd-mode.ts"), "utf8");

/**
 * Minimal extension wiring contract for BDD-01 (R4/R10).
 * Intentionally checks semantic parameter/evidence field names rather than
 * brittle incidental formatting or exact whitespace.
 */
describe("bdd-mode expected-red contract wiring (BDD-01 R4/R10)", () => {
	test("bdd_assert_red accepts expectedTestId, expectedFailureSignature, and matchMode", () => {
		const source = extensionSource();
		// Locate the assert-red tool definition block without depending on exact layout.
		const redToolIdx = source.indexOf('name: "bdd_assert_red"');
		expect(redToolIdx).toBeGreaterThanOrEqual(0);
		const redRegion = source.slice(redToolIdx, redToolIdx + 4_000);

		for (const field of ["expectedTestId", "expectedFailureSignature", "matchMode"]) {
			expect(redRegion).toContain(field);
		}
		// Parameters must be part of the tool schema, not only comments.
		expect(redRegion).toMatch(/expectedTestId[\s\S]{0,200}Type\.(Optional\()?Type\.String/);
		expect(redRegion).toMatch(/matchMode/);
	});

	test("recorded red evidence includes contract, cause, eligibility, trust, and config fingerprint", () => {
		const source = extensionSource();
		const redToolIdx = source.indexOf('name: "bdd_assert_red"');
		expect(redToolIdx).toBeGreaterThanOrEqual(0);
		// Evidence assignment region after the tool name through the next major tool.
		const nextTool = source.indexOf('name: "bdd_assert_green"', redToolIdx);
		const region = source.slice(redToolIdx, nextTool > 0 ? nextTool : redToolIdx + 8_000);

		for (const field of [
			"expectedTestId",
			"expectedFailureSignature",
			"matchMode",
			"assuranceEligible",
			"configFingerprint",
		]) {
			expect(region).toContain(field);
		}
		// Cause / reason-code recording (name may be cause, reasonCode, or redCause).
		expect(region).toMatch(/cause|reasonCode|redCause/);
		expect(region).toMatch(/trustTier|trust_tier|interactive_untrusted/);
		// Must actually call the classifier with the contract, not only store raw exit codes.
		expect(region).toMatch(/validateRedResult\s*\(/);
	});

	test("mutation fail leg reuses expected-red contract fields", () => {
		const source = extensionSource();
		const mutIdx = source.indexOf('name: "bdd_assert_mutation"');
		expect(mutIdx).toBeGreaterThanOrEqual(0);
		const region = source.slice(mutIdx, mutIdx + 5_000);
		expect(region).toMatch(/expectedTestId|expectedFailureSignature|matchMode/);
		expect(region).toMatch(/validateRedResult\s*\(/);
	});
});
