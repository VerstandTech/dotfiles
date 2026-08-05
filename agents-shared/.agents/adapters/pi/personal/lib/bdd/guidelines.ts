/**
 * Phase-specific system guidelines injected into the agent context.
 */

import { formatHandoff, phaseLabel } from "./phases.ts";
import type { BddConfig, BddEvidence, BddPhase, BddState } from "./types.ts";

export const BDD_PROMPT_SNIPPET =
	"BDD/TDD workflow gates (Example Map → Gherkin → red → green → refactor → verify)";

export function buildPhaseMessage(state: BddState, config: BddConfig): string {
	if (!state.enabled || state.phase === "off") {
		return "";
	}

	const focus = state.evidence.focus ? `Focus: ${state.evidence.focus}\n` : "";
	const bypass = state.bypassUntilPhaseChange
		? "PATH GATES BYPASSED for this phase (bypass active).\n"
		: "";
	const cmds = [
		`- unit: \`${config.commands.unitTest}\``,
		config.commands.acceptanceTest
			? `- acceptance: \`${config.commands.acceptanceTest}\``
			: undefined,
		config.commands.acceptanceGenerate
			? `- generate: \`${config.commands.acceptanceGenerate}\``
			: undefined,
		config.commands.typecheck ? `- types: \`${config.commands.typecheck}\`` : undefined,
		config.commands.coverage ? `- coverage: \`${config.commands.coverage}\`` : undefined,
		config.commands.mutation ? `- mutation: \`${config.commands.mutation}\`` : undefined,
		config.commands.doctor ? `- doctor: \`${config.commands.doctor}\`` : undefined,
	]
		.filter(Boolean)
		.join("\n");

	const phaseHelp = phaseInstructions(state.phase);
	const evidence = summarizeEvidence(state.evidence);

	return `[BDD MODE ACTIVE — ${phaseLabel(state.phase)}]
${focus}${bypass}
You are following a strict BDD → TDD workflow enforced by the bdd-mode extension.

${phaseHelp}

Project commands:
${cmds}

Tools: bdd_status, bdd_project_profile, bdd_assurance_plan, bdd_set_phase, bdd_assert_red, bdd_assert_green, bdd_run_quality_gates, bdd_delegate_role, bdd_record_evidence, bdd_handoff.
Commands: /bdd status|profile|gates|on|off|discovery|formulation|red|green|refactor|verify|handoff|init|bypass.

Evidence so far:
${evidence}

Hard rules:
1. Do NOT implement production code before a proven failing test (bdd_assert_red).
2. edit/write to disallowed path classes for this phase are blocked.
3. Record acceptance coverage (feature path or N/A + reason) before claiming done.
4. Prefer mutation/sensitivity check on new acceptance scenarios.
5. In verify, run bdd_run_quality_gates when assurance is enabled; required gates fail closed.
6. Use bdd_delegate_role only for the role allowed by the current phase and keep one writer.
`;
}

function phaseInstructions(phase: BddPhase): string {
	switch (phase) {
		case "discovery":
			return `Phase: DISCOVERY
- Build an Example Map (Rules / Examples / Questions) before scenarios or code.
- Write only docs/example-map artifacts (or update the tracking issue).
- Do not write production code or tests yet.
- When the map is solid, record it via bdd_record_evidence (exampleMap) and move to formulation.`;
		case "formulation":
			return `Phase: FORMULATION
- Convert mapped examples into Gherkin \`.feature\` files and/or acceptance scenarios.
- Follow project Gherkin conventions when present (docs/bdd/, *.feature layout).
- You may add failing unit/integration test skeletons.
- Do not implement production behavior yet.
- Move to red when scenarios/tests are ready to fail for the right reason.`;
		case "red":
			return `Phase: RED
- Write or finish failing tests (unit, integration, acceptance).
- Run them and call bdd_assert_red with the command (must exit non-zero).
- Production/implementation paths are blocked until you advance to green after red evidence.`;
		case "green":
			return `Phase: GREEN
- Implement the minimum code to make the recorded failing tests pass.
- Call bdd_assert_green (must exit 0) on the same or broader suite.
- No drive-by refactors or scope expansion.`;
		case "refactor":
			return `Phase: REFACTOR
- Clean up with tests staying green; re-run assert_green if structure changes.
- Keep behavior identical.`;
		case "verify":
			return `Phase: VERIFY
- Run acceptance + unit regression.
- Complete mutation check if acceptance scenarios changed.
- Call bdd_handoff and fill any missing evidence fields.`;
		default:
			return "";
	}
}

function summarizeEvidence(evidence: BddEvidence): string {
	const bits: string[] = [];
	bits.push(evidence.exampleMap ? `exampleMap=${evidence.exampleMap.ref}` : "exampleMap=∅");
	bits.push(
		evidence.red
			? `red=exit ${evidence.red.exitCode} (${truncate(evidence.red.summary, 60)})`
			: "red=∅",
	);
	bits.push(
		evidence.green
			? `green=exit ${evidence.green.exitCode} (${truncate(evidence.green.summary, 60)})`
			: "green=∅",
	);
	bits.push(evidence.acceptance ? `acceptance=${evidence.acceptance.ref}` : "acceptance=∅");
	bits.push(
		evidence.mutation
			? `mutation=${evidence.mutation.proven ? "ok" : "no"}`
			: "mutation=∅",
	);
	bits.push(evidence.assurance ? `assurance=${evidence.assurance.ok ? "ok" : "fail"}` : "assurance=∅");
	return bits.join(" | ");
}

function truncate(s: string, n: number): string {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export function buildGuidelines(state: BddState): string[] {
	if (!state.enabled || state.phase === "off") {
		return [
			"When the user asks to follow BDD/TDD, Example Mapping, red-green-refactor, or Gherkin-first work, enable bdd-mode (/bdd on or bdd_set_phase) and load the bdd-tdd skill.",
		];
	}
	return [
		`BDD mode is active in phase "${state.phase}". Obey path gates and call bdd_assert_red before implementation.`,
		"Use bdd_status to see phase/evidence; use bdd_handoff before claiming the work is done.",
		"Do not bypass gates without an explicit user request and bdd bypass reason.",
	];
}

export function statusText(state: BddState, config: BddConfig): string {
	if (!state.enabled || state.phase === "off") {
		return "BDD mode: off (enable with /bdd on)";
	}
	const label = config.projectLabel ? ` · ${config.projectLabel}` : "";
	const by = state.bypassUntilPhaseChange ? " · bypass" : "";
	const src = state.source !== "default" ? ` · cfg:${state.source}` : "";
	return [
		`BDD: ${phaseLabel(state.phase)}${label}${by}${src}`,
		formatHandoff(state.evidence, state.phase).trim(),
		"",
		`Config: ${state.configPath ?? "(defaults)"}`,
		`unitTest: ${config.commands.unitTest}`,
		config.commands.acceptanceTest
			? `acceptanceTest: ${config.commands.acceptanceTest}`
			: "acceptanceTest: (none)",
		`assurance: ${config.assurance?.enabled ? "enabled" : "optional"}`,
		state.evidence.assurance
			? `assuranceRun: ${state.evidence.assurance.ok ? "PASS" : "FAIL"} plan=${state.evidence.assurance.planFingerprint}`
			: "assuranceRun: (none)",
	].join("\n");
}
