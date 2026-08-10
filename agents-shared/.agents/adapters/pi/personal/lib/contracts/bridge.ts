/**
 * CON-01 → BDD-01 ExpectedRedContract field bridge (no classifier / trust logic).
 */

import { parseValidationContractV1 } from "./validate.ts";

export type ExpectedRedBridge = {
	expectedTestId?: string;
	expectedFailureSignature?: string;
	matchMode?: "identity" | "signature";
};

/**
 * Map a validated ValidationContractV1 to BDD-01 ExpectedRedContract fields only.
 * Refuses unvalidated / legacy / missing-test-id input (throws).
 */
export function toExpectedRedContract(value: unknown): ExpectedRedBridge {
	const parsed = parseValidationContractV1(value);
	if (!parsed.ok) {
		throw new Error("toExpectedRedContract: invalid or unvalidated input refused");
	}
	const v = parsed.value as Record<string, unknown>;
	const expectedTestId = v.expectedTestId;
	if (typeof expectedTestId !== "string" || expectedTestId.length === 0) {
		throw new Error("toExpectedRedContract: missing expectedTestId");
	}
	const matchMode = v.matchMode;
	if (matchMode !== "identity" && matchMode !== "signature") {
		throw new Error("toExpectedRedContract: invalid matchMode");
	}

	const out: ExpectedRedBridge = {
		expectedTestId,
		matchMode,
	};
	if (typeof v.expectedFailureSignature === "string") {
		out.expectedFailureSignature = v.expectedFailureSignature;
	}
	return out;
}
