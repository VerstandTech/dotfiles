/**
 * CON-01 explicit legacy Markdown handoff adapter — always assurance-ineligible.
 */

import { CONTRACT_LIMITS_V1, type ParseResult } from "./limits.ts";

export type LegacyMarkdownHandoff = {
	kind: "legacy-markdown-handoff";
	trustTier: "legacy";
	assuranceEligible: false;
	schemaVersion: 1;
	rawMarkdown: string;
	displaySummary: string;
};

/**
 * Bounded legacy Markdown adapter. Never produces RoleResultV1 or approval by inference.
 */
export function parseLegacyMarkdownHandoff(input: unknown): ParseResult<LegacyMarkdownHandoff> {
	if (typeof input !== "string") {
		return {
			ok: false,
			issues: [
				{
					code: "invalid_type",
					path: "$",
					message: "legacy handoff input must be string",
				},
			],
		};
	}
	if (input.length > CONTRACT_LIMITS_V1.maxSerializedBytes) {
		return {
			ok: false,
			issues: [
				{
					code: "bound_exceeded",
					path: "$",
					message: `legacy markdown size ${input.length} exceeds maxSerializedBytes ${CONTRACT_LIMITS_V1.maxSerializedBytes}`,
				},
			],
		};
	}

	const summary = input
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, 8)
		.join(" | ")
		.slice(0, CONTRACT_LIMITS_V1.maxStringLength);

	return {
		ok: true,
		value: {
			kind: "legacy-markdown-handoff",
			trustTier: "legacy",
			assuranceEligible: false,
			schemaVersion: 1,
			rawMarkdown: input,
			displaySummary: summary || "(empty)",
		},
	};
}
