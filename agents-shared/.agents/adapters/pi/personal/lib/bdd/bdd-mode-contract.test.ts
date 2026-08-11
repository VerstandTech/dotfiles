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

	// E38 — assurance bdd_assert_green must refuse legacy/non-causal red (stable source contract)
	test("bdd_assert_green refuses legacy non-causal red under assurance before unlocking green", () => {
		const source = extensionSource();
		const greenIdx = source.indexOf('name: "bdd_assert_green"');
		expect(greenIdx).toBeGreaterThanOrEqual(0);
		const nextTool = source.indexOf('name: "bdd_record_evidence"', greenIdx);
		const region = source.slice(greenIdx, nextTool > 0 ? nextTool : greenIdx + 6_000);

		// Must consult assurance/causal eligibility — not only "has some red exit".
		expect(region).toMatch(/assuranceEnabled|assurance\.enabled|config\.assurance/);
		expect(region).toMatch(/assuranceEligible/);
		// Refusal path must exist (return ok:false / reject) when red is non-causal under assurance.
		expect(region).toMatch(
			/non-causal|legacy|assurance-eligible|causal expected-red|Cannot record green|refuses? green|No causal/i,
		);
		expect(region).toMatch(/ok:\s*false/);
	});

	// E39 — mutation matched is true only for assurance-eligible expected assertion
	test("mutation matched is true only when fail leg is assurance-eligible expected assertion", () => {
		const source = extensionSource();
		const mutIdx = source.indexOf('name: "bdd_assert_mutation"');
		expect(mutIdx).toBeGreaterThanOrEqual(0);
		const region = source.slice(mutIdx, mutIdx + 6_000);

		// Must record matched from assuranceEligible (or equivalent strict gate), not bare failCheck.ok.
		expect(region).toMatch(/matched\s*:/);
		expect(region).toMatch(/assuranceEligible\s*===\s*true/);
		// Forbid the legacy/unrelated loophole: matched: failCheck.ok or || failCheck.ok
		expect(region).not.toMatch(/matched\s*:\s*failCheck\.ok\b/);
		expect(region).not.toMatch(/assuranceEligible\s*===\s*true\s*\|\|\s*failCheck\.ok/);
	});
});

describe("bdd-mode FIT-01 thin integration contract", () => {
	test("requests typed internal evidence synchronously without a model-supplied pass parameter", () => {
		const source = extensionSource();
		const runIdx = source.indexOf('name: "bdd_run_quality_gates"');
		expect(runIdx).toBeGreaterThanOrEqual(0);
		const region = source.slice(runIdx, runIdx + 8_000);
		expect(region).toContain("assurance:gate-evidence-request");
		expect(region).toContain("planFingerprint");
		expect(region).toContain("profileFingerprint");
		expect(region).toMatch(/internalEvidence/);
		expect(region).not.toMatch(/Type\.(?:Any|Unknown).*internalEvidence|internalEvidence.*Type\.(?:Any|Unknown)/);
		expect(region).not.toMatch(/setTimeout|setInterval/);
	});

	test("uses exact FIT-01 handoff gaps and canonical result rendering", () => {
		const source = extensionSource();
		expect(source).toContain("requireResultsFingerprint");
		expect(source).toContain("formatAssuranceHandoff");
		const toolIdx = source.indexOf('name: "bdd_handoff"');
		const commandIdx = source.indexOf('if (cmd === "handoff")');
		expect(source.slice(toolIdx, toolIdx + 4_000)).toMatch(/formatAssuranceHandoff/);
		expect(source.slice(commandIdx, commandIdx + 3_000)).toMatch(/formatAssuranceHandoff/);
	});
});
