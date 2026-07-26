/**
 * Format BDD/TDD handoff as GitHub PR body markdown (P1).
 */

import type { BddEvidence, BddPhase } from "./types.ts";
import {
	formatHandoff,
	handoffComplete,
	phaseLabel,
	type HandoffPolicy,
} from "./phases.ts";

export function formatPrBody(input: {
	title?: string;
	phase: BddPhase;
	evidence: BddEvidence;
	extraNotes?: string;
	handoffPolicy?: HandoffPolicy;
}): string {
	const { ok, missing } = handoffComplete(input.evidence, input.handoffPolicy);
	const title = input.title?.trim() || "BDD/TDD change";
	const lines = [
		`## Summary`,
		``,
		title,
		``,
		formatHandoff(input.evidence, input.phase).trim(),
		``,
		`### Checklist`,
		``,
		`- [${input.evidence.exampleMap ? "x" : " "}] Example Map recorded`,
		`- [${input.evidence.red && input.evidence.red.exitCode !== 0 ? "x" : " "}] Red (failing test)`,
		`- [${input.evidence.green && input.evidence.green.exitCode === 0 ? "x" : " "}] Green (passing test)`,
		`- [${input.evidence.acceptance ? "x" : " "}] Acceptance path or N/A`,
		`- [${input.evidence.mutation?.proven ? "x" : " "}] Mutation check`,
		`- [${(input.evidence.fleetRuns ?? []).every((r) => r.kind === "research" || r.synthesisPath) ? "x" : " "}] Fleet synthesis (if review fleet ran)`,
		`- [${input.evidence.assurance?.ok ? "x" : " "}] Deterministic assurance gates (when enabled)`,
		``,
		ok
			? `**Handoff status:** complete`
			: `**Handoff status:** incomplete — ${missing.filter((m) => !m.startsWith("(soft)")).join("; ")}`,
	];
	if (input.extraNotes?.trim()) {
		lines.push(``, `## Notes`, ``, input.extraNotes.trim());
	}
	lines.push(``, `---`, ``, `_Generated from Pi BDD phase: ${phaseLabel(input.phase)}_`, ``);
	return lines.join("\n");
}
