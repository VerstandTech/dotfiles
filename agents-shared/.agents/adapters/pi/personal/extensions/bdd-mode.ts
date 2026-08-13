/**
 * BDD/TDD mode for Pi — cross-project.
 *
 * Enforces Example Map → Gherkin/scenarios → red → green → refactor → verify
 * with path gates and recorded red/green evidence.
 *
 * Per-project config (optional): `.pi/bdd.json`, `bdd.json`, or `.bdd-tdd.json`
 * When missing, commands are inferred from package.json scripts.
 *
 * Commands: /bdd …
 * Tools: bdd_status, bdd_playbook, bdd_project_profile, bdd_assurance_plan,
 *        bdd_set_phase, bdd_assert_red, bdd_assert_green,
 *        bdd_run_quality_gates, bdd_delegate_role, bdd_record_evidence,
 *        bdd_handoff
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { configTemplate, fingerprintConfig, loadConfigFromCwd } from "../lib/bdd/config.ts";
import {
	HIGH_ASSURANCE_PLAYBOOK,
	formatHighAssurancePlaybookReference,
} from "../lib/bdd/playbook.ts";
import {
	isValidFleetRunId,
	validateFleetSynthesisEvidence,
} from "../lib/bdd/synthesis.ts";
import {
	ASSURANCE_ROLES,
	assertAssuranceAction,
	buildAssuranceBlueprint,
	roleContract,
	type AssuranceRole,
} from "../lib/bdd/assurance-cycle.ts";
import {
	detectProjectProfile,
	formatProjectProfile,
	type ProjectProfile,
} from "../lib/bdd/project-profile.ts";
import {
	buildQualityGatePlan,
	formatAssuranceHandoff,
	formatQualityGatePlan,
	formatQualityGateRun,
	runQualityGatePlan,
	type QualityGatePlan,
} from "../lib/bdd/quality-gates.ts";
import {
	BDD_PROMPT_SNIPPET,
	buildGuidelines,
	buildPhaseMessage,
	statusText,
} from "../lib/bdd/guidelines.ts";
import { maybeTransformForBdd } from "../lib/bdd/intent.ts";
import { isLikelyMutatingBash } from "../lib/bdd/bash-gate.ts";
import {
	assertFleetAllowed,
	assertSubagentLaunchAllowed,
	normalizeFleetKind,
} from "../lib/bdd/fleet-gate.ts";
import { evaluatePathGate } from "../lib/bdd/paths.ts";
import { BDD_STATE_CUSTOM_TYPE } from "../lib/bdd/session-state.ts";
import {
	collectFleetRunsFromBranch,
	mergeEvidenceFleetRuns,
	mergeFleetRuns,
} from "../lib/fleet/run-ledger.ts";
import {
	canTransition,
	clearCycleEvidence,
	formatHandoff,
	greenIsStale,
	handoffComplete,
	parsePhase,
	phaseLabel,
	suggestedNextPhase,
} from "../lib/bdd/phases.ts";
import { formatDoctorReport, runAgenticDoctor } from "../lib/bdd/doctor.ts";
import { formatPrBody } from "../lib/bdd/pr-handoff.ts";
import {
	bindWorktreeEvidenceV1,
	handoffWorktreeEvidenceV1,
	readWorktreeEvidenceV1,
	resolveRecordingWorktreeV1,
} from "../lib/bdd/worktree-evidence.ts";
import {
	greenCoversRed,
	runCommand,
	validateGreenResult,
	validateRedResult,
} from "../lib/bdd/run-command.ts";
import { callSubagentRpc } from "../lib/fleet/rpc.ts";
import type {
	BddConfig,
	BddEvidence,
	BddPhase,
	BddState,
	InternalGateEvidence,
} from "../lib/bdd/types.ts";

const CUSTOM_TYPE = BDD_STATE_CUSTOM_TYPE;
const CONTEXT_TYPE = "bdd-mode-context";

function nowIso(): string {
	return new Date().toISOString();
}

function cwdOf(ctx?: ExtensionContext): string {
	return ctx?.cwd ?? process.cwd();
}

function gitPath(cwd: string, flag: "--show-toplevel" | "--git-common-dir"): string | undefined {
	try {
		const value = execFileSync("git", ["rev-parse", flag], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return value ? resolve(cwd, value) : undefined;
	} catch {
		return undefined;
	}
}

function recordingWorktreeOf(cwd: string) {
	const worktreePath = gitPath(cwd, "--show-toplevel");
	const commonDir = gitPath(cwd, "--git-common-dir");
	const parentPath = commonDir ? resolve(commonDir, "..") : undefined;
	if (!worktreePath || !parentPath) {
		return resolveRecordingWorktreeV1({ cwd, parentPath: cwd });
	}
	return resolveRecordingWorktreeV1({ cwd: worktreePath, parentPath });
}

function hasRedEvidence(evidence: BddEvidence): boolean {
	return Boolean(evidence.red && evidence.red.exitCode !== 0);
}

function initialState(): BddState {
	return {
		enabled: false,
		phase: "off",
		evidence: {},
		source: "default",
	};
}

export default function bddModeExtension(pi: ExtensionAPI): void {
	let state: BddState = initialState();
	let config: BddConfig = loadConfigFromCwd(process.cwd()).config;

	function reloadConfig(cwd: string): void {
		try {
			const loaded = loadConfigFromCwd(cwd);
			config = loaded.config;
			state.configPath = loaded.path;
			state.source = loaded.source;
		} catch (err) {
			// keep previous config; surface later via status
			state.configPath = `error: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	function currentAssurance(cwd: string): {
		profile: ProjectProfile;
		plan: QualityGatePlan;
	} {
		const detected = detectProjectProfile(cwd);
		const profile: ProjectProfile = {
			...detected,
			commands: {
				...detected.commands,
				format: config.commands.format ?? detected.commands.format,
				staticAnalysis: config.commands.staticAnalysis ?? detected.commands.staticAnalysis,
				typecheck: config.commands.typecheck ?? detected.commands.typecheck,
				unitTest: config.commands.unitTest ?? detected.commands.unitTest,
				acceptanceTest: config.commands.acceptanceTest ?? detected.commands.acceptanceTest,
				propertyTest: config.commands.propertyTest ?? detected.commands.propertyTest,
				coverage: config.commands.coverage ?? detected.commands.coverage,
				mutation: config.commands.mutation ?? detected.commands.mutation,
				architecture: config.commands.architecture ?? detected.commands.architecture,
				doctor: config.commands.doctor ?? detected.commands.doctor,
				security: config.commands.security ?? detected.commands.security,
				performance: config.commands.performance ?? detected.commands.performance,
			},
		};
		const configuredGateCommands = state.source === "file"
			? {
				format: config.commands.format,
				static: config.commands.staticAnalysis,
				types: config.commands.typecheck,
				unit: config.commands.unitTest,
				acceptance: config.commands.acceptanceTest,
				property: config.commands.propertyTest,
				coverage: config.commands.coverage,
				mutation: config.commands.mutation,
				architecture: config.commands.architecture,
				doctor: config.commands.doctor,
				security: config.commands.security,
				performance: config.commands.performance,
			}
			: {};
		return {
			profile,
			plan: buildQualityGatePlan({
				profile,
				assurance: {
					...config.assurance,
					commands: { ...configuredGateCommands, ...config.assurance?.commands },
				},
			}),
		};
	}

	function synthesisExists(cwd: string, path: string, runId: string): boolean {
		return validateFleetSynthesisEvidence({ cwd, synthesisPath: path, runId }).ok;
	}

	function collectInternalGateEvidence(plan: QualityGatePlan): Readonly<Record<string, InternalGateEvidence>> {
		const collected: Record<string, InternalGateEvidence> = {};
		const provide = (id: string, evidence: InternalGateEvidence): void => {
			if (typeof id !== "string" || !id || Object.hasOwn(collected, id)) return;
			collected[id] = evidence;
		};
		try {
			pi.events.emit("assurance:gate-evidence-request", {
				version: 1,
				planFingerprint: plan.fingerprint,
				profileFingerprint: plan.profileFingerprint,
				provide,
			});
		} catch {
			// A missing/failed provider stays absent and therefore fails closed.
		}
		return Object.freeze({ ...collected });
	}

	function handoffPolicy(cwd: string) {
		const { plan } = currentAssurance(cwd);
		const highAssurance = config.assurance?.enabled === true;
		return {
			assuranceEnabled: highAssurance,
			expectedPlanFingerprint: highAssurance ? plan.fingerprint : undefined,
			expectedProfileFingerprint: highAssurance ? plan.profileFingerprint : undefined,
			expectedConfigFingerprint: highAssurance ? fingerprintConfig(config) : undefined,
			expectedRequiredGateKinds: highAssurance
				? plan.gates.filter((gate) => gate.required).map((gate) => gate.kind)
				: undefined,
			requireCausalRed: highAssurance,
			requireCommandBackedMutation: highAssurance,
			requireCommandBackedMatchedMutation: highAssurance,
			requireResultsFingerprint: highAssurance,
			requireFleetDisposition: highAssurance,
			synthesisExists: highAssurance
				? (path: string, runId: string) => synthesisExists(cwd, path, runId)
				: undefined,
		};
	}

	function completeHandoff(cwd: string): { ok: boolean; missing: string[] } {
		return handoffComplete(state.evidence, handoffPolicy(cwd));
	}

	function formatExactHandoff(): string {
		return `${formatHandoff(state.evidence, state.phase)}\n${formatAssuranceHandoff(state.evidence.assurance)}\n`;
	}

	function persist(ctx?: ExtensionContext): void {
		const cwd = cwdOf(ctx);
		const identity = recordingWorktreeOf(cwd);
		if (identity.ok) {
			const closed: { red?: { command: string; exitCode: number; summary: string }; green?: { command: string; exitCode: number; summary: string } } = {};
			if (state.evidence.red) {
				closed.red = {
					command: state.evidence.red.command,
					exitCode: state.evidence.red.exitCode,
					summary: state.evidence.red.summary,
				};
			}
			if (state.evidence.green) {
				closed.green = {
					command: state.evidence.green.command,
					exitCode: state.evidence.green.exitCode,
					summary: state.evidence.green.summary,
				};
			}
			bindWorktreeEvidenceV1({
				worktreePath: identity.worktreePath,
				parentPath: identity.parentPath,
				evidence: closed,
			});
		}
		pi.appendEntry(CUSTOM_TYPE, { ...state });
	}

	function syncWorktreeEvidence(cwd: string): void {
		const identity = recordingWorktreeOf(cwd);
		if (!identity.ok) return;
		const stored = readWorktreeEvidenceV1({ worktreePath: identity.worktreePath });
		if (!stored.ok || !stored.evidence) return;
		if (stored.evidence.red) {
			state.evidence.red = {
				...(state.evidence.red ?? { at: nowIso() }),
				...stored.evidence.red,
			};
		}
		if (stored.evidence.green) {
			state.evidence.green = {
				...(state.evidence.green ?? { at: nowIso() }),
				...stored.evidence.green,
			};
		}
	}

	function syncFleetRunsFromBranch(ctx: ExtensionContext): void {
		try {
			const branch = ctx.sessionManager.getBranch() as Array<{
				type?: string;
				customType?: string;
				data?: unknown;
			}>;
			const fromLedger = collectFleetRunsFromBranch(branch);
			state.evidence.fleetRuns = mergeEvidenceFleetRuns(state.evidence.fleetRuns, fromLedger);
		} catch {
			// ignore
		}
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		reloadConfig(cwdOf(ctx));
		const branch = ctx.sessionManager.getBranch();
		let restored: BddState | undefined;
		for (const entry of branch) {
			if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
				restored = entry.data as BddState;
			}
		}
		if (restored) {
			state = {
				...initialState(),
				...restored,
				evidence: { ...restored.evidence },
			};
		} else if (config.enabledByDefault && state.source === "file") {
			state.enabled = true;
			state.phase = "discovery";
		}
		syncFleetRunsFromBranch(ctx);
		syncWorktreeEvidence(cwdOf(ctx));
		updateStatus(ctx);
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!state.enabled || state.phase === "off") {
			ctx.ui.setStatus("bdd-mode", undefined);
			ctx.ui.setWidget("bdd-evidence", undefined);
			return;
		}
		const glyph =
			state.phase === "red"
				? "🔴"
				: state.phase === "green"
					? "🟢"
					: state.phase === "verify"
						? "✅"
						: state.phase === "discovery"
							? "🗺️"
							: state.phase === "formulation"
								? "📝"
								: "🧪";
		const bypass = state.bypassUntilPhaseChange ? "!" : "";
		ctx.ui.setStatus(
			"bdd-mode",
			ctx.ui.theme.fg("accent", `${glyph} bdd:${state.phase}${bypass}`),
		);

		const ev = state.evidence;
		const lines = [
			ctx.ui.theme.fg("muted", `phase ${phaseLabel(state.phase)}`),
			ev.focus ? `focus: ${ev.focus}` : undefined,
			ev.red ? `red: exit ${ev.red.exitCode}` : "red: —",
			ev.green ? `green: exit ${ev.green.exitCode}` : "green: —",
			ev.acceptance ? `acc: ${ev.acceptance.ref}` : "acc: —",
		].filter(Boolean) as string[];
		ctx.ui.setWidget("bdd-evidence", lines);
	}

	function setEnabled(ctx: ExtensionContext, enabled: boolean, phase?: BddPhase): void {
		reloadConfig(cwdOf(ctx));
		state.enabled = enabled;
		if (!enabled) {
			state.phase = "off";
			state.bypassUntilPhaseChange = false;
			state.fleetBypassUntilPhaseChange = false;
		} else {
			state.phase = phase ?? (state.phase === "off" ? "discovery" : state.phase);
		}
		persist();
		updateStatus(ctx);
	}

	function trySetPhase(
		ctx: ExtensionContext,
		phase: BddPhase,
		opts?: { focus?: string },
	): { ok: boolean; message: string } {
		reloadConfig(cwdOf(ctx));
		if (phase === "off") {
			setEnabled(ctx, false);
			return { ok: true, message: "BDD mode disabled." };
		}
		const gate = canTransition(state.enabled ? state.phase : "off", phase, state.evidence, {
			assuranceEnabled: config.assurance?.enabled === true,
		});
		if (!gate.ok) {
			return { ok: false, message: gate.reason ?? "Transition blocked" };
		}
		const prev = state.phase;
		const prevFocus = state.evidence.focus;
		state.enabled = true;
		state.phase = phase;
		if (opts?.focus !== undefined) {
			const nextFocus = opts.focus.trim();
			if (nextFocus && prevFocus && nextFocus !== prevFocus) {
				state.evidence = clearCycleEvidence({ ...state.evidence, focus: nextFocus });
			} else if (nextFocus) {
				state.evidence.focus = nextFocus;
			}
		}
		// New discovery cycle clears red/green so handoffs can't reuse prior story evidence
		if (phase === "discovery" && prev !== "discovery" && prev !== "off") {
			state.evidence = clearCycleEvidence(state.evidence);
		}
		if (prev !== phase) {
			state.bypassUntilPhaseChange = false;
			state.fleetBypassUntilPhaseChange = false;
		}
		persist();
		updateStatus(ctx);
		const next = suggestedNextPhase(phase);
		return {
			ok: true,
			message: `BDD phase → ${phaseLabel(phase)}${next ? ` (next: ${next})` : ""}`,
		};
	}

	// --- tools ---

	const statusTool = defineTool({
		name: "bdd_status",
		label: "BDD Status",
		description:
			"Show BDD/TDD mode phase, path-gate rules, project commands, and recorded red/green/acceptance evidence.",
		promptSnippet: BDD_PROMPT_SNIPPET,
		promptGuidelines: buildGuidelines(state),
		parameters: Type.Object({}),
		renderCall(_args, theme) {
			return new Text(`${theme.fg("accent", "🧪")} ${theme.bold("BDD status")}`, 0, 0);
		},
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			reloadConfig(cwdOf(ctx as ExtensionContext));
			const text = statusText(state, config);
			return {
				content: [{ type: "text", text }],
				details: { phase: state.phase, enabled: state.enabled },
			};
		},
	});

	const setPhaseTool = defineTool({
		name: "bdd_set_phase",
		label: "BDD Set Phase",
		description:
			"Enable BDD mode and set phase: discovery | formulation | red | green | refactor | verify | off. " +
			"Forward transitions to green/verify require recorded evidence.",
		parameters: Type.Object({
			phase: Type.String({
				description: "Target phase (discovery, formulation, red, green, refactor, verify, off)",
			}),
			focus: Type.Optional(
				Type.String({ description: "Optional story/issue focus label" }),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const phase = parsePhase(String(params.phase ?? ""));
			if (!phase) {
				return {
					content: [
						{
							type: "text",
							text: `Unknown phase "${params.phase}". Use discovery|formulation|red|green|refactor|verify|off`,
						},
					],
					details: { ok: false },
				};
			}
			const result = trySetPhase(ctx as ExtensionContext, phase, {
				focus: params.focus ? String(params.focus) : undefined,
			});
			return {
				content: [{ type: "text", text: result.message }],
				details: { ok: result.ok, phase: state.phase },
			};
		},
	});

	const assertRedTool = defineTool({
		name: "bdd_assert_red",
		label: "BDD Assert Red",
		description:
			"Run a test command that MUST fail (non-zero exit) and record it as red evidence. " +
			"Required before implementation (green). Default command comes from project bdd config / package.json.",
		parameters: Type.Object({
			command: Type.Optional(
				Type.String({
					description: "Test command to run (default: project unitTest command, optionally with path args)",
				}),
			),
			append: Type.Optional(
				Type.String({
					description: "Extra args appended to the default unitTest command (e.g. a file path)",
				}),
			),
			expectedTestId: Type.Optional(Type.String({
				description:
					"Expected failing test id for causal/assurance red (identity or signature match)",
			})),
			expectedFailureSignature: Type.Optional(Type.String({
				description: "Optional failure signature required when matchMode is signature",
			})),
			matchMode: Type.Optional(Type.String({
				description: 'Red match mode: "identity" | "signature" | "legacy"',
			})),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			reloadConfig(cwdOf(extCtx));
			const base = String(params.command ?? config.commands.unitTest);
			const command = params.append ? `${base} ${params.append}` : base;
			const result = await runCommand({ cwd: cwdOf(extCtx), command });
			const expectedTestId =
				typeof params.expectedTestId === "string" && params.expectedTestId.trim()
					? String(params.expectedTestId).trim()
					: undefined;
			const expectedFailureSignature =
				typeof params.expectedFailureSignature === "string" && params.expectedFailureSignature.trim()
					? String(params.expectedFailureSignature).trim()
					: undefined;
			const matchModeRaw =
				typeof params.matchMode === "string" && params.matchMode.trim()
					? String(params.matchMode).trim()
					: undefined;
			const matchMode =
				matchModeRaw === "identity" || matchModeRaw === "signature" || matchModeRaw === "legacy"
					? matchModeRaw
					: undefined;
			const redContract = {
				expectedTestId,
				expectedFailureSignature,
				matchMode,
				assuranceEnabled: config.assurance?.enabled === true,
				trustProfile: config.assurance?.trustProfile,
			};
			const check = validateRedResult(result, redContract);
			if (!check.ok) {
				return {
					content: [{ type: "text", text: check.reason }],
					details: {
						ok: false,
						exitCode: result.exitCode,
						command,
						reasonCode: check.reasonCode,
						cause: check.cause,
					},
				};
			}
			// Only advance phase after successful red
			state.enabled = true;
			state.phase = "red";
			// New red invalidates prior green
			delete state.evidence.green;
			const configFp = fingerprintConfig(config);
			state.evidence.red = {
				command,
				exitCode: result.exitCode,
				summary: result.summary,
				at: nowIso(),
				failedTestHints: result.failedTestHints,
				expectedTestId,
				expectedFailureSignature,
				matchMode: check.matchMode ?? matchMode,
				assuranceEligible: check.assuranceEligible === true,
				trustTier: check.trustTier,
				cause: check.cause,
				reasonCode: check.reasonCode,
				configFingerprint: configFp,
			};
			const hints =
				result.failedTestHints?.length
					? `\nHints: ${result.failedTestHints.slice(0, 5).join(" | ")}`
					: "";
			const eligibility =
				check.assuranceEligible === true
					? "assurance-eligible"
					: "legacy/non-assurance";
			syncWorktreeEvidence(cwdOf(extCtx));
			persist(extCtx);
			updateStatus(extCtx);
			return {
				content: [
					{
						type: "text",
						text:
							`Red evidence recorded (${eligibility}).\nCommand: ${command}\n${result.summary}${hints}\n` +
							`cause=${check.cause ?? "n/a"} matchMode=${check.matchMode ?? "n/a"} configFingerprint=${configFp.slice(0, 12)}…\n` +
							`You may /bdd green and implement the minimum fix.`,
					},
				],
				details: {
					ok: true,
					exitCode: result.exitCode,
					command,
					summary: result.summary,
					failedTestHints: result.failedTestHints,
					expectedTestId,
					expectedFailureSignature,
					matchMode: check.matchMode,
					assuranceEligible: check.assuranceEligible,
					trustTier: check.trustTier,
					cause: check.cause,
					reasonCode: check.reasonCode,
					configFingerprint: configFp,
				},
			};
		},
	});

	const assertGreenTool = defineTool({
		name: "bdd_assert_green",
		label: "BDD Assert Green",
		description:
			"Run a test command that MUST pass (exit 0) and record it as green evidence. " +
			"Use after minimum implementation.",
		parameters: Type.Object({
			command: Type.Optional(
				Type.String({ description: "Test command (default: project unitTest)" }),
			),
			append: Type.Optional(
				Type.String({ description: "Extra args appended to default unitTest command" }),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			reloadConfig(cwdOf(extCtx));
			if (!hasRedEvidence(state.evidence)) {
				return {
					content: [
						{
							type: "text",
							text: "No red evidence yet. Run bdd_assert_red on a failing test before claiming green.",
						},
					],
					details: { ok: false },
				};
			}
			// E38 / R4 — direct bdd_assert_green under assurance requires causal red first.
			const assuranceEnabled = config.assurance?.enabled === true;
			if (assuranceEnabled && state.evidence.red?.assuranceEligible !== true) {
				return {
					content: [
						{
							type: "text",
							text:
								"Cannot record green under assurance without causal expected-red evidence " +
								"(red.assuranceEligible === true). Legacy/non-causal red is non-assurance; " +
								"refuses green and does not unlock implementation paths.",
						},
					],
					details: {
						ok: false,
						assuranceEnabled: true,
						assuranceEligible: state.evidence.red?.assuranceEligible ?? false,
					},
				};
			}
			const base = String(params.command ?? state.evidence.red?.command ?? config.commands.unitTest);
			const command = params.append ? `${base} ${params.append}` : base;
			const result = await runCommand({ cwd: cwdOf(extCtx), command });
			const check = validateGreenResult(result);
			if (!check.ok) {
				return {
					content: [{ type: "text", text: check.reason }],
					details: { ok: false, exitCode: result.exitCode, command },
				};
			}
			const redCmd = state.evidence.red?.command ?? "";
			const covers = greenCoversRed(redCmd, command);
			const strict = config.strictGreenCoversRed !== false;
			if (strict && !covers) {
				return {
					content: [
						{
							type: "text",
							text:
								`Green rejected: command does not cover red under strictGreenCoversRed.\n` +
								`Red:  \`${redCmd}\`\n` +
								`Green: \`${command}\`\n` +
								`Use the same failing command, a broader suite of the same runner, or set strictGreenCoversRed:false in .pi/bdd.json.`,
						},
					],
					details: { ok: false, coversRed: false, command },
				};
			}
			const staleNote = greenIsStale(state.evidence)
				? "\nWarning: prior green was older than red — replaced."
				: "";
			const coverNote = covers
				? ""
				: `\nWarning: green command differs from red (\`${redCmd}\`).`;
			const configFp = fingerprintConfig(config);
			state.evidence.green = {
				command,
				exitCode: result.exitCode,
				summary: result.summary,
				at: nowIso(),
				configFingerprint: configFp,
			};
			// Any implementation change makes prior structural/quality evidence stale.
			delete state.evidence.assurance;
			state.phase = "green";
			state.enabled = true;
			syncWorktreeEvidence(cwdOf(extCtx));
			persist(extCtx);
			updateStatus(extCtx);
			return {
				content: [
					{
						type: "text",
						text: `Green evidence recorded.\nCommand: ${command}\n${result.summary}${coverNote}${staleNote}\nNext: refactor (optional) → verify + bdd_handoff.`,
					},
				],
				details: { ok: true, exitCode: result.exitCode, command, summary: result.summary, coversRed: covers },
			};
		},
	});

	const recordEvidenceTool = defineTool({
		name: "bdd_record_evidence",
		label: "BDD Record Evidence",
		description:
			"Record Example Map, acceptance coverage, mutation check, or CRAP notes without running tests.",
		parameters: Type.Object({
			focus: Type.Optional(Type.String()),
			exampleMapRef: Type.Optional(
				Type.String({ description: "Issue number/URL or path to example map" }),
			),
			exampleMapRules: Type.Optional(Type.Number()),
			exampleMapExamples: Type.Optional(Type.Number()),
			exampleMapQuestions: Type.Optional(Type.Number()),
			acceptanceRef: Type.Optional(
				Type.String({ description: "Feature path or the literal N/A" }),
			),
			acceptanceReason: Type.Optional(
				Type.String({ description: "Required when acceptanceRef is N/A" }),
			),
			mutationProven: Type.Optional(Type.Boolean()),
			mutationNote: Type.Optional(Type.String()),
			crap: Type.Optional(Type.String({ description: "CRAP-risk mitigation notes" })),
			fleetRunId: Type.Optional(
				Type.String({ description: "Fleet runId to attach synthesis path (from dispatch ledger)" }),
			),
			fleetSynthesisPath: Type.Optional(
				Type.String({
					description:
						"Path to synthesis.md for that run (required before handoff after review/ux fleets)",
				}),
			),
			fleetNoBlockers: Type.Optional(
				Type.Boolean({ description: "Explicit attestation that the independent review found no blockers" }),
			),
			fleetBlockersAccepted: Type.Optional(
				Type.Array(Type.String(), { description: "Blocker ids/titles accepted for immediate fixing" }),
			),
			fleetDeferred: Type.Optional(
				Type.Array(
					Type.Object({ id: Type.String(), reason: Type.String() }),
					{ description: "Deferred findings with mandatory reasons" },
				),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			syncFleetRunsFromBranch(extCtx);
			if (params.focus) state.evidence.focus = String(params.focus);
			if (params.exampleMapRef) {
				state.evidence.exampleMap = {
					ref: String(params.exampleMapRef),
					rules: Number(params.exampleMapRules ?? 0),
					examples: Number(params.exampleMapExamples ?? 0),
					questions:
						params.exampleMapQuestions != null
							? Number(params.exampleMapQuestions)
							: undefined,
					at: nowIso(),
				};
			}
			if (params.acceptanceRef) {
				const ref = String(params.acceptanceRef);
				if (ref.toUpperCase() === "N/A" && !params.acceptanceReason) {
					return {
						content: [
							{
								type: "text",
								text: "acceptanceRef N/A requires acceptanceReason explaining why acceptance tests are not applicable.",
							},
						],
						details: { ok: false },
					};
				}
				state.evidence.acceptance = {
					ref,
					reason: params.acceptanceReason ? String(params.acceptanceReason) : undefined,
					at: nowIso(),
				};
			}
			if (params.mutationProven != null || params.mutationNote) {
				state.evidence.mutation = {
					proven: Boolean(params.mutationProven),
					note: String(params.mutationNote ?? ""),
					at: nowIso(),
				};
			}
			if (params.crap) state.evidence.crap = String(params.crap);
			if (params.fleetRunId) {
				const runId = String(params.fleetRunId);
				if (!isValidFleetRunId(runId)) {
					return {
						content: [{ type: "text", text: "fleetRunId must be a safe single path segment." }],
						details: { ok: false },
					};
				}
				const base = (state.evidence.fleetRuns ?? []).find((r) => r.runId === runId) ?? {
					runId,
					kind: "review",
					expectedCount: 0,
					at: nowIso(),
				};
				state.evidence.fleetRuns = mergeFleetRuns(state.evidence.fleetRuns, {
					...base,
					synthesisPath: params.fleetSynthesisPath
						? String(params.fleetSynthesisPath)
						: base.synthesisPath,
					noBlockers:
						params.fleetNoBlockers != null ? Boolean(params.fleetNoBlockers) : base.noBlockers,
					blockersAccepted: Array.isArray(params.fleetBlockersAccepted)
						? params.fleetBlockersAccepted.map(String)
						: base.blockersAccepted,
					deferred: Array.isArray(params.fleetDeferred)
						? params.fleetDeferred.map((item) => ({ id: String(item.id), reason: String(item.reason) }))
						: base.deferred,
				});
			}
			persist();
			updateStatus(extCtx);
			return {
				content: [{ type: "text", text: formatHandoff(state.evidence, state.phase) }],
				details: { ok: true, evidence: state.evidence },
			};
		},
	});

	const handoffTool = defineTool({
		name: "bdd_handoff",
		label: "BDD Handoff",
		description:
			"Produce the required BDD/TDD handoff evidence block (red/green/acceptance/mutation/CRAP/fleet). " +
			"Reports missing fields. Review fleets require synthesisPath per runId. Use asPr for PR body.",
		parameters: Type.Object({
			asPr: Type.Optional(
				Type.Boolean({ description: "If true, also emit GitHub PR body markdown" }),
			),
			title: Type.Optional(Type.String({ description: "PR title/summary line" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			reloadConfig(cwdOf(extCtx));
			syncFleetRunsFromBranch(extCtx);
			const cwd = cwdOf(extCtx);
			const identity = recordingWorktreeOf(cwd);
			const worktreeHandoff = handoffWorktreeEvidenceV1({
				cwd: identity.ok ? identity.worktreePath : cwd,
				parentPath: identity.ok ? identity.parentPath : cwd,
				sessionEvidence: state.evidence,
			});
			if (worktreeHandoff.ok && worktreeHandoff.evidence) {
				if (worktreeHandoff.evidence.red) {
					state.evidence.red = {
						...(state.evidence.red ?? { at: nowIso() }),
						...worktreeHandoff.evidence.red,
					};
				}
				if (worktreeHandoff.evidence.green) {
					state.evidence.green = {
						...(state.evidence.green ?? { at: nowIso() }),
						...worktreeHandoff.evidence.green,
					};
				}
			} else if (!identity.ok && !state.evidence.red && !state.evidence.green) {
				const { ok, missing } = {
					ok: false,
					missing: ["unknown", ...(worktreeHandoff.missing ?? ["missing"])],
				};
				const body = formatExactHandoff();
				return {
					content: [{ type: "text", text: `${body}\n**Missing:** ${missing.join(", ")}\n` }],
					details: { ok, missing, evidence: state.evidence, code: "unknown" },
				};
			}
			const { ok, missing } = completeHandoff(cwd);
			const body = formatExactHandoff(); // includes formatAssuranceHandoff exact results
			const fleetLines =
				(state.evidence.fleetRuns ?? [])
					.map(
						(r) =>
							`- fleet ${r.kind} \`${r.runId}\` synthesis=${r.synthesisPath ?? "(missing)"}`,
					)
					.join("\n") || "- (no fleet runs)";
			let text = ok
				? `${body}\n### Fleet runs\n${fleetLines}\n`
				: `${body}\n### Fleet runs\n${fleetLines}\n\n**Missing:** ${missing.join(", ")}\n`;
			if (params.asPr) {
				text +=
					`\n---\n\n` +
					formatPrBody({
						phase: state.phase,
						evidence: state.evidence,
						title: params.title ? String(params.title) : state.evidence.focus,
						handoffPolicy: handoffPolicy(cwdOf(extCtx)),
					});
			}
			return {
				content: [{ type: "text", text }],
				details: { ok, missing, evidence: state.evidence },
			};
		},
	});

	const assertMutationTool = defineTool({
		name: "bdd_assert_mutation",
		label: "BDD Assert Mutation",
		description:
			"Command-backed mutation check: run failCommand (must fail), then passCommand (must pass). " +
			"Parent must apply/restore the break — this tool only runs commands and records evidence.",
		parameters: Type.Object({
			failCommand: Type.String({
				description: "Command that must fail after the deliberate break",
			}),
			passCommand: Type.Optional(
				Type.String({
					description: "Command that must pass after restore (default: last green or red command)",
				}),
			),
			note: Type.Optional(Type.String({ description: "What was broken and restored" })),
			expectedTestId: Type.Optional(Type.String({
				description: "Expected-red test id reused for the mutation fail leg",
			})),
			expectedFailureSignature: Type.Optional(Type.String({
				description: "Optional failure signature for the mutation fail leg",
			})),
			matchMode: Type.Optional(Type.String({
				description: 'Fail-leg match mode: "identity" | "signature" | "legacy"',
			})),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			reloadConfig(cwdOf(extCtx));
			const failCommand = String(params.failCommand);
			const passCommand = String(
				params.passCommand ??
					state.evidence.green?.command ??
					state.evidence.red?.command ??
					config.commands.unitTest,
			);
			const expectedTestId =
				typeof params.expectedTestId === "string" && params.expectedTestId.trim()
					? String(params.expectedTestId).trim()
					: state.evidence.red?.expectedTestId;
			const expectedFailureSignature =
				typeof params.expectedFailureSignature === "string" && params.expectedFailureSignature.trim()
					? String(params.expectedFailureSignature).trim()
					: state.evidence.red?.expectedFailureSignature;
			const matchModeRaw =
				typeof params.matchMode === "string" && params.matchMode.trim()
					? String(params.matchMode).trim()
					: state.evidence.red?.matchMode;
			const matchMode =
				matchModeRaw === "identity" || matchModeRaw === "signature" || matchModeRaw === "legacy"
					? matchModeRaw
					: undefined;
			const redContract = {
				expectedTestId,
				expectedFailureSignature,
				matchMode,
				assuranceEnabled: config.assurance?.enabled === true,
				trustProfile: config.assurance?.trustProfile,
			};
			const failRun = await runCommand({ cwd: cwdOf(extCtx), command: failCommand });
			const failCheck = validateRedResult(failRun, redContract);
			if (!failCheck.ok) {
				return {
					content: [
						{
							type: "text",
							text: `Mutation fail-step did not fail as required.\n${failCheck.reason}`,
						},
					],
					details: {
						ok: false,
						step: "fail",
						reasonCode: failCheck.reasonCode,
						cause: failCheck.cause,
					},
				};
			}
			// E39 — under assurance, legacy/unrelated fail-leg is refused even if ok:true.
			const mutationAssuranceEnabled = config.assurance?.enabled === true;
			if (mutationAssuranceEnabled && failCheck.assuranceEligible !== true) {
				return {
					content: [
						{
							type: "text",
							text:
								`Mutation fail-leg refused under assurance: expected assurance-eligible assertion, ` +
								`got legacy/non-causal red (matched=false).\n${failCheck.reason}`,
						},
					],
					details: {
						ok: false,
						step: "fail",
						matched: false,
						assuranceEligible: false,
						reasonCode: failCheck.reasonCode,
						cause: failCheck.cause,
					},
				};
			}
			const passRun = await runCommand({ cwd: cwdOf(extCtx), command: passCommand });
			const passCheck = validateGreenResult(passRun);
			if (!passCheck.ok) {
				return {
					content: [
						{
							type: "text",
							text:
								`Mutation pass-step failed after restore — tree may still be broken.\n${passCheck.reason}`,
						},
					],
					details: { ok: false, step: "pass" },
				};
			}
			state.evidence.mutation = {
				proven: true,
				note: String(params.note ?? "command-backed mutation"),
				at: nowIso(),
				failCommand,
				passCommand,
				failSummary: failRun.summary,
				passSummary: passRun.summary,
				expectedTestId,
				expectedFailureSignature,
				matchMode: failCheck.matchMode ?? matchMode,
				// E39 — matched is true only for assurance-eligible expected assertion.
				matched: failCheck.assuranceEligible === true,
				cause: failCheck.cause,
				reasonCode: failCheck.reasonCode,
			};
			persist();
			updateStatus(extCtx);
			return {
				content: [
					{
						type: "text",
						text: `Mutation proven.\nFail: ${failCommand} → ${failRun.summary}\nPass: ${passCommand} → ${passRun.summary}`,
					},
				],
				details: { ok: true, mutation: state.evidence.mutation },
			};
		},
	});

	const doctorTool = defineTool({
		name: "agentic_doctor",
		label: "Agentic Doctor",
		description:
			"Read-only diagnostics for BDD config, fleet setup, auth, typebox, caps, and pi-subagents RPC.",
		parameters: Type.Object({}),
		async execute(_id, _p, _s, _u, ctx) {
			const cwd = cwdOf(ctx as ExtensionContext);
			const report = await runAgenticDoctor({
				cwd,
				rpcPing: async () => {
					const reply = await callSubagentRpc(pi.events, "ping", {}, { timeoutMs: 3000 });
					return reply.success;
				},
			});
			return {
				content: [{ type: "text", text: formatDoctorReport(report) }],
				details: { ok: report.ok, report },
			};
		},
	});

	const playbookTool = defineTool({
		name: "bdd_playbook",
		label: "BDD High-Assurance Playbook",
		description:
			"Return the canonical high-assurance multi-agent playbook version, package-relative paths, implementation profile, and deterministic no-auto-install policy.",
		parameters: Type.Object({}),
		async execute() {
			return {
				content: [{ type: "text", text: formatHighAssurancePlaybookReference() }],
				details: { ok: true, playbook: HIGH_ASSURANCE_PLAYBOOK },
			};
		},
	});

	const projectProfileTool = defineTool({
		name: "bdd_project_profile",
		label: "BDD Project Profile",
		description:
			"Deterministically detect the current project's local tech stack, package managers, frameworks, commands, and fingerprint. Never installs tools or calls the network.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			const cwd = cwdOf(extCtx);
			reloadConfig(cwd);
			const { profile, plan } = currentAssurance(cwd);
			return {
				content: [{ type: "text", text: `${formatProjectProfile(profile)}\n\n${formatQualityGatePlan(plan)}` }],
				details: { ok: profile.confidence !== "low", profile, plan },
			};
		},
	});

	const assurancePlanTool = defineTool({
		name: "bdd_assurance_plan",
		label: "BDD Assurance Plan",
		description:
			"Compile a deterministic, stack-aware quality-gate plan and bounded multi-agent blueprint. Read-only; does not launch agents or execute gates.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			const cwd = cwdOf(extCtx);
			reloadConfig(cwd);
			const { profile, plan } = currentAssurance(cwd);
			const blueprint = buildAssuranceBlueprint(profile, plan);
			return {
				content: [
					{
						type: "text",
						text: `${formatQualityGatePlan(plan)}\n\n## Bounded role stages\n${blueprint.stages
							.map((stage) => `- **${stage.id}**${stage.parallel ? " (parallel read-only)" : ""}: ${stage.roles.join(", ") || "human gate"} — ${stage.gate}`)
							.join("\n")}`,
					},
				],
				details: { ok: true, profile, plan, blueprint },
			};
		},
	});

	const runGatesTool = defineTool({
		name: "bdd_run_quality_gates",
		label: "BDD Run Quality Gates",
		description:
			"Run the deterministic stack-aware gate plan sequentially. Required gates fail closed and stop later execution. Real execution is allowed only in verify and requires explicit workspace confirmation; dryRun only prints the plan.",
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "Print the gate plan without executing commands" })),
			workspaceConfirmed: Type.Optional(
				Type.Boolean({ description: "Human explicitly confirmed branch/worktree and one-writer ownership" }),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			const cwd = cwdOf(extCtx);
			reloadConfig(cwd);
			const { profile, plan } = currentAssurance(cwd);
			if (params.dryRun) {
				return {
					content: [{ type: "text", text: formatQualityGatePlan(plan) }],
					details: { ok: true, dryRun: true, profile, plan },
				};
			}
			const gate = assertAssuranceAction(
				{
					workspaceConfirmed: params.workspaceConfirmed === true,
					phase: state.phase,
					evidence: state.evidence,
					plan,
				},
				{ type: "run-gates" },
			);
			if (!gate.ok) {
				return {
					content: [{ type: "text", text: gate.reason ?? "Quality-gate execution blocked" }],
					details: { ok: false, blocked: true, profile, plan },
				};
			}
			// Synchronous process-local seam: assurance:gate-evidence-request (no timers/polling).
			const internalEvidence = collectInternalGateEvidence(plan);
			const run = await runQualityGatePlan({ cwd, plan, internalEvidence });
			run.configFingerprint = fingerprintConfig(config);
			state.evidence.assurance = run;
			persist();
			updateStatus(extCtx);
			pi.appendEntry("bdd-assurance-event", {
				type: "quality-gates",
				at: nowIso(),
				profileFingerprint: profile.fingerprint,
				planFingerprint: plan.fingerprint,
				configFingerprint: run.configFingerprint,
				resultsFingerprint: run.resultsFingerprint,
				ok: run.ok,
			});
			return {
				content: [{ type: "text", text: formatQualityGateRun(run) }],
				details: { ok: run.ok, profile, plan, run },
			};
		},
	});

	const delegateRoleTool = defineTool({
		name: "bdd_delegate_role",
		label: "BDD Delegate Bounded Role",
		description:
			"Validate a high-assurance role against the deterministic BDD phase contract, then launch exactly one isolated pi-subagent asynchronously. Never launches parallel writers.",
		parameters: Type.Object({
			role: StringEnum(ASSURANCE_ROLES, { description: "Bounded specialist role" }),
			task: Type.String({ description: "Narrow task with locked inputs, success criteria, and expected handoff" }),
			workspaceConfirmed: Type.Boolean({ description: "Human explicitly confirmed branch/worktree and one-writer ownership" }),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const extCtx = ctx as ExtensionContext;
			const cwd = cwdOf(extCtx);
			reloadConfig(cwd);
			const { plan } = currentAssurance(cwd);
			const role = String(params.role) as AssuranceRole;
			const contract = roleContract(role);
			const gate = assertAssuranceAction(
				{
					workspaceConfirmed: params.workspaceConfirmed === true,
					phase: state.phase,
					evidence: state.evidence,
					plan,
				},
				{ type: "delegate", role },
			);
			if (!gate.ok) {
				return {
					content: [{ type: "text", text: gate.reason ?? `Role ${role} blocked` }],
					details: { ok: false, blocked: true, role, contract },
				};
			}
			const reply = await callSubagentRpc(
				pi.events,
				"spawn",
				{
					agent: `bdd-${role}`,
					task: String(params.task),
					cwd,
					async: true,
					context: "fresh",
					acceptance: contract.writeScope === "none" ? "attested" : "checked",
				},
				{ timeoutMs: 60_000, source: "bdd-assurance" },
			);
			pi.appendEntry("bdd-assurance-event", {
				type: "delegate",
				at: nowIso(),
				role,
				phase: state.phase,
				success: reply.success,
				data: reply.data,
				error: reply.error,
			});
			const text = reply.success
				? `Launched isolated role \`bdd-${role}\` asynchronously.\n\n${JSON.stringify(reply.data, null, 2)}`
				: `Role launch failed: ${reply.error?.message ?? "pi-subagents RPC unavailable"}`;
			return {
				content: [{ type: "text", text }],
				details: { ok: reply.success, role, contract, rpc: reply },
			};
		},
	});

	pi.registerTool(statusTool);
	pi.registerTool(setPhaseTool);
	pi.registerTool(assertRedTool);
	pi.registerTool(assertGreenTool);
	pi.registerTool(assertMutationTool);
	pi.registerTool(recordEvidenceTool);
	pi.registerTool(handoffTool);
	pi.registerTool(doctorTool);
	pi.registerTool(playbookTool);
	pi.registerTool(projectProfileTool);
	pi.registerTool(assurancePlanTool);
	pi.registerTool(runGatesTool);
	pi.registerTool(delegateRoleTool);

	// Keep tools active
	pi.on("session_start", async (_e, ctx) => {
		restoreFromBranch(ctx);
		const active = new Set(pi.getActiveTools());
		for (const name of [
			"bdd_status",
			"bdd_set_phase",
			"bdd_assert_red",
			"bdd_assert_green",
			"bdd_assert_mutation",
			"bdd_record_evidence",
			"bdd_handoff",
			"agentic_doctor",
			"bdd_playbook",
			"bdd_project_profile",
			"bdd_assurance_plan",
			"bdd_run_quality_gates",
			"bdd_delegate_role",
		]) {
			active.add(name);
		}
		pi.setActiveTools([...active]);
	});

	pi.on("session_shutdown", () => {
		persist();
	});

	// Path gates + fleet/subagent phase gates
	pi.on("tool_call", async (event, ctx) => {
		if (!state.enabled || state.phase === "off") return;

		// --- Fleet launch gates (independent of path bypass) ---
		if (event.toolName === "fleet_dispatch") {
			const kind = normalizeFleetKind((event.input as { kind?: string }).kind);
			const gate = assertFleetAllowed({
				phase: state.phase,
				enabled: state.enabled,
				kind,
				fleetBypass: state.fleetBypassUntilPhaseChange,
				planningOnly: false,
			});
			if (!gate.allowed) {
				if (ctx.hasUI) ctx.ui.notify(gate.reason ?? "Fleet blocked", "warning");
				return { block: true, reason: gate.reason ?? "Fleet blocked by BDD phase" };
			}
			return;
		}

		if (event.toolName === "subagent") {
			const gate = assertSubagentLaunchAllowed({
				phase: state.phase,
				enabled: state.enabled,
				fleetBypass: state.fleetBypassUntilPhaseChange,
				params: event.input,
			});
			if (!gate.allowed) {
				if (ctx.hasUI) ctx.ui.notify(gate.reason ?? "Subagent fanout blocked", "warning");
				return { block: true, reason: gate.reason ?? "Subagent fanout blocked by BDD phase" };
			}
			return;
		}

		// Path/bash gates honor path bypass only
		if (state.bypassUntilPhaseChange) return;

		if (event.toolName === "bash") {
			const command = String((event.input as { command?: string }).command ?? "");
			if (
				(state.phase === "discovery" ||
					state.phase === "formulation" ||
					state.phase === "red") &&
				isLikelyMutatingBash(command)
			) {
				const reason =
					`BDD ${state.phase}: mutating bash blocked. Use edit/write only on allowed test/docs paths, or /bdd bypass <reason>.\nCommand: ${command}`;
				if (ctx.hasUI) ctx.ui.notify(reason, "warning");
				return { block: true, reason };
			}
			return;
		}

		if (event.toolName !== "write" && event.toolName !== "edit") return;

		const path = String((event.input as { path?: string }).path ?? "");
		if (!path) return;

		const gate = evaluatePathGate({
			path,
			phase: state.phase,
			config,
			enabled: state.enabled,
			bypass: state.bypassUntilPhaseChange,
			hasRedEvidence: hasRedEvidence(state.evidence),
		});

		if (gate.allowed) return;

		if (ctx.hasUI) {
			ctx.ui.notify(gate.reason ?? "BDD path blocked", "warning");
		}
		return { block: true, reason: gate.reason ?? "BDD path blocked" };
	});

	// Inject phase contract
	pi.on("before_agent_start", async () => {
		const message = buildPhaseMessage(state, config);
		if (!message) return;
		return {
			message: {
				customType: CONTEXT_TYPE,
				content: message,
				display: false,
			},
		};
	});

	// Drop stale context when off
	pi.on("context", async (event) => {
		if (state.enabled && state.phase !== "off") return;
		return {
			messages: event.messages.filter((m) => {
				const msg = m as { customType?: string };
				return msg.customType !== CONTEXT_TYPE;
			}),
		};
	});

	// Auto-remind on BDD intent (Pi requires action:"transform")
	pi.on("input", async (event) => {
		if (typeof event.text !== "string") return;
		const { matched, text } = maybeTransformForBdd(event.text);
		if (!matched) return;
		return { action: "transform" as const, text };
	});

	const runDoctorCommand = async (ctx: ExtensionContext) => {
		const report = await runAgenticDoctor({
			cwd: cwdOf(ctx),
			rpcPing: async () => {
				const reply = await callSubagentRpc(pi.events, "ping", {}, { timeoutMs: 3000 });
				return reply.success;
			},
		});
		const text = formatDoctorReport(report);
		if (ctx.hasUI) {
			ctx.ui.notify(
				report.ok ? `Doctor OK (${report.pass} pass, ${report.warn} warn)` : `Doctor: ${report.fail} fail`,
				report.ok ? "info" : "warning",
			);
		}
		pi.sendMessage(
			{ customType: "agentic-doctor", content: text, display: true },
			{ triggerTurn: false },
		);
	};

	// Top-level /agentic doctor (roadmap P0.6)
	pi.registerCommand("agentic", {
		description: "Agentic tooling: doctor | ship",
		getArgumentCompletions: (prefix) =>
			["doctor", "ship"]
				.filter((o) => o.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const cmd = (args.trim().split(/\s+/)[0] || "doctor").toLowerCase();
			if (cmd === "doctor" || cmd === "") {
				await runDoctorCommand(ctx);
				return;
			}
			if (cmd === "ship") {
				pi.sendMessage(
					{
						customType: "agentic-ship",
						content:
							"Load skill **ship** (or `/ship <focus>`).\n\n" +
							"**Step 0 — workspace (STOP):** show git branch/cwd/status, then ask the user to pick:\n" +
							"- **A** new branch in this checkout\n" +
							"- **B** new git worktree + branch (continue ship in that cwd)\n" +
							"- **C** stay on current branch/worktree\n" +
							"Do not create branch/worktree or start discovery until they answer.\n\n" +
							"Then: discovery → formulation → red → green → verify → fleet review (N=3) → collect → synthesis → handoff.",
						display: true,
					},
					{ triggerTurn: true },
				);
				return;
			}
			ctx.ui.notify("Usage: /agentic doctor | /agentic ship", "warning");
		},
	});

	// /bdd command
	pi.registerCommand("bdd", {
		description:
			"BDD/TDD mode: status|playbook|profile|gates|on|off|discovery|formulation|red|green|refactor|verify|handoff|init|bypass|doctor",
		getArgumentCompletions: (prefix) => {
			const opts = [
				"status",
				"playbook",
				"profile",
				"gates",
				"on",
				"off",
				"discovery",
				"formulation",
				"red",
				"green",
				"refactor",
				"verify",
				"handoff",
				"init",
				"bypass",
				"fleet-bypass",
				"doctor",
				"next",
			];
			return opts
				.filter((o) => o.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const raw = args.trim();
			const [head, ...rest] = raw.split(/\s+/);
			const cmd = (head || "status").toLowerCase();
			const tail = rest.join(" ").trim();

			if (cmd === "status" || cmd === "") {
				reloadConfig(cwdOf(ctx));
				const text = statusText(state, config);
				if (ctx.hasUI) ctx.ui.notify(text.slice(0, 500), "info");
				pi.sendMessage(
					{ customType: "bdd-status", content: text, display: true },
					{ triggerTurn: false },
				);
				return;
			}

			if (cmd === "on") {
				const r = trySetPhase(ctx, state.phase === "off" ? "discovery" : state.phase);
				ctx.ui.notify(r.message, r.ok ? "info" : "warning");
				return;
			}

			if (cmd === "off") {
				setEnabled(ctx, false);
				ctx.ui.notify("BDD mode off", "info");
				return;
			}

			if (cmd === "next") {
				// From off, first step is discovery (not formulation)
				const next =
					state.phase === "off" || !state.enabled
						? "discovery"
						: suggestedNextPhase(state.phase);
				if (!next) {
					ctx.ui.notify("No next phase", "info");
					return;
				}
				const r = trySetPhase(ctx, next);
				ctx.ui.notify(r.message, r.ok ? "info" : "warning");
				return;
			}

			if (cmd === "playbook") {
				pi.sendMessage(
					{
						customType: "bdd-playbook",
						content: formatHighAssurancePlaybookReference(),
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			if (cmd === "profile" || cmd === "gates") {
				const cwd = cwdOf(ctx);
				reloadConfig(cwd);
				const { profile, plan } = currentAssurance(cwd);
				const text = cmd === "profile"
					? `${formatProjectProfile(profile)}\n\n${formatQualityGatePlan(plan)}`
					: formatQualityGatePlan(plan);
				pi.sendMessage(
					{ customType: `bdd-${cmd}`, content: text, display: true },
					{ triggerTurn: false },
				);
				return;
			}

			if (cmd === "doctor") {
				await runDoctorCommand(ctx);
				return;
			}

			if (cmd === "handoff") {
				reloadConfig(cwdOf(ctx));
				syncFleetRunsFromBranch(ctx);
				const { ok, missing } = completeHandoff(cwdOf(ctx));
				const body = formatExactHandoff(); // includes formatAssuranceHandoff exact results
				const asPr = /\bpr\b/i.test(tail);
				let text = ok ? body : `${body}\nMissing: ${missing.join(", ")}`;
				if (asPr) {
					text +=
						`\n---\n\n` +
						formatPrBody({
							phase: state.phase,
							evidence: state.evidence,
							title: state.evidence.focus,
							handoffPolicy: handoffPolicy(cwdOf(ctx)),
						});
				}
				pi.sendMessage(
					{ customType: "bdd-handoff", content: text, display: true },
					{ triggerTurn: false },
				);
				return;
			}

			if (cmd === "init") {
				const cwd = cwdOf(ctx);
				reloadConfig(cwd);
				const target = join(cwd, ".pi", "bdd.json");
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(
					target,
					configTemplate({
						unitTest: config.commands.unitTest,
						acceptanceTest: config.commands.acceptanceTest,
						acceptanceGenerate: config.commands.acceptanceGenerate,
						format: config.commands.format,
						staticAnalysis: config.commands.staticAnalysis,
						typecheck: config.commands.typecheck,
						propertyTest: config.commands.propertyTest,
						coverage: config.commands.coverage,
						mutation: config.commands.mutation,
						architecture: config.commands.architecture,
						doctor: config.commands.doctor,
						security: config.commands.security,
						performance: config.commands.performance,
					}),
					"utf8",
				);
				reloadConfig(cwd);
				ctx.ui.notify(`Wrote ${target}`, "info");
				pi.sendMessage(
					{
						customType: "bdd-init",
						content: `Created \`${target}\`. Edit path patterns/commands for this repo, then \`/bdd on\`.`,
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			if (cmd === "bypass") {
				if (!tail) {
					ctx.ui.notify("Usage: /bdd bypass <reason>  (path/bash only; fleets: /bdd fleet-bypass)", "warning");
					return;
				}
				state.enabled = true;
				if (state.phase === "off") state.phase = "discovery";
				state.bypassUntilPhaseChange = true;
				state.evidence.bypass = { reason: tail, at: nowIso() };
				persist();
				updateStatus(ctx);
				ctx.ui.notify(`BDD path/bash gates bypassed: ${tail}`, "warning");
				return;
			}

			if (cmd === "fleet-bypass") {
				if (!tail) {
					ctx.ui.notify("Usage: /bdd fleet-bypass <reason>", "warning");
					return;
				}
				state.enabled = true;
				if (state.phase === "off") state.phase = "discovery";
				state.fleetBypassUntilPhaseChange = true;
				state.evidence.fleetBypass = { reason: tail, at: nowIso() };
				persist();
				updateStatus(ctx);
				ctx.ui.notify(`BDD fleet launch gates bypassed: ${tail}`, "warning");
				return;
			}

			const phase = parsePhase(cmd);
			if (phase) {
				const r = trySetPhase(ctx, phase, { focus: tail || undefined });
				ctx.ui.notify(r.message, r.ok ? "info" : "warning");
				if (!r.ok) {
					pi.sendMessage(
						{ customType: "bdd-gate", content: r.message, display: true },
						{ triggerTurn: false },
					);
				}
				return;
			}

			ctx.ui.notify(
				`Unknown /bdd args. Try: status|playbook|profile|gates|on|off|discovery|formulation|red|green|refactor|verify|handoff|init|bypass`,
				"warning",
			);
		},
	});
}
