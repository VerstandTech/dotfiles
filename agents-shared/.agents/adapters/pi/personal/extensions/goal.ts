/**
 * /goal — Claude Code-style completion condition loop for Pi.
 *
 * Sets a session-scoped condition. After each agent run settles, a small/fast
 * evaluator model judges the transcript. If unmet, Pi auto-continues with the
 * evaluator reason as guidance. Clears automatically when met.
 *
 * Fail-closed: refuses to start without an evaluator; stops the goal if the
 * evaluator is unavailable or errors (does not burn agent turns blindly).
 *
 * Usage:
 *   /goal all tests in test/auth pass and git status is clean
 *   /goal                  # status
 *   /goal clear            # stop (aliases: stop, off, reset, none, cancel)
 *
 * Env:
 *   PI_GOAL_MODEL          preferred evaluator (provider/id or id substring)
 *   PI_GOAL_MAX_TURNS      hard cap (default 40; condition "stop after N turns" wins)
 *   PI_GOAL_EVAL_TIMEOUT_MS  evaluator deadline (default 45000)
 */
import { uuidv7 } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	GOAL_STATE_TYPE,
	GOAL_STATUS_KEY,
	MAX_CONDITION_CHARS,
	buildAchievedMessage,
	buildContinueMessage,
	buildEvaluatorSystemPrompt,
	buildEvaluatorUserPrompt,
	buildKickoffMessage,
	buildMaxTurnsMessage,
	buildStatusReport,
	buildTranscript,
	createActiveGoal,
	decideGoalSettle,
	footerStatusText,
	isClearArg,
	loadLatestGoalState,
	markCleared,
	parseEvaluationResponse,
	pickEvaluatorModel,
	resolveMaxTurns,
	restoreActiveGoalOnResume,
	usageTotalTokens,
	type GoalEvalOutcome,
	type GoalState,
	type ModelRef,
} from "../lib/goal/goal.ts";

type Ctx = ExtensionContext;

const DEFAULT_EVAL_TIMEOUT_MS = 45_000;
const EVAL_MAX_TOKENS = 512;

function evalTimeoutMs(): number {
	const n = Number(process.env.PI_GOAL_EVAL_TIMEOUT_MS);
	if (Number.isFinite(n) && n >= 5_000) return Math.min(Math.floor(n), 180_000);
	return DEFAULT_EVAL_TIMEOUT_MS;
}

function sessionTokenEstimate(ctx: Ctx): number | undefined {
	try {
		const usage = ctx.getContextUsage?.();
		if (usage && typeof usage.tokens === "number") return usage.tokens;
	} catch {
		/* optional API */
	}
	return undefined;
}

function persist(pi: ExtensionAPI, state: GoalState | null): void {
	if (!state) return;
	pi.appendEntry(GOAL_STATE_TYPE, state);
}

function updateFooter(ctx: Ctx, state: GoalState | null): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(GOAL_STATUS_KEY, state ? footerStatusText(state) : undefined);
}

function notify(
	ctx: Ctx,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

function resolveEvaluator(
	ctx: Ctx,
): { model: NonNullable<ReturnType<Ctx["modelRegistry"]["find"]>>; ref: ModelRef } | null {
	const available = ctx.modelRegistry.getAvailable().map((m) => ({
		provider: m.provider,
		id: m.id,
	}));
	const sessionModel = ctx.model
		? { provider: ctx.model.provider, id: ctx.model.id }
		: undefined;
	const ref = pickEvaluatorModel(available, {
		preferred: process.env.PI_GOAL_MODEL,
		sessionModel,
		hasAuth: (r) => {
			const model = ctx.modelRegistry.find(r.provider, r.id);
			return !!model && ctx.modelRegistry.hasConfiguredAuth(model);
		},
	});
	if (!ref) return null;
	const model = ctx.modelRegistry.find(ref.provider, ref.id);
	if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) return null;
	return { model, ref };
}

async function evaluateGoal(ctx: Ctx, state: GoalState): Promise<GoalEvalOutcome> {
	const picked = resolveEvaluator(ctx);
	if (!picked) {
		return {
			kind: "unavailable",
			reason:
				"No authenticated evaluator model available (set PI_GOAL_MODEL or configure auth)",
		};
	}

	const branch = ctx.sessionManager.getBranch() as Parameters<typeof buildTranscript>[0];
	const transcript = buildTranscript(branch);
	const userText = buildEvaluatorUserPrompt(state.condition, transcript, {
		turnsEvaluated: state.turnsEvaluated,
		maxTurns: state.maxTurns,
	});

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), evalTimeoutMs());
	try {
		const response = await ctx.modelRegistry.complete(
			picked.model,
			{
				systemPrompt: buildEvaluatorSystemPrompt(),
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: userText }],
						timestamp: Date.now(),
					},
				],
			},
			{
				cacheRetention: "none",
				sessionId: uuidv7(),
				signal: controller.signal,
				maxTokens: EVAL_MAX_TOKENS,
			},
		);

		const stop = response.stopReason;
		if (stop === "error" || stop === "aborted") {
			const detail =
				(response as { errorMessage?: string }).errorMessage || stop;
			return {
				kind: "error",
				reason: `Evaluator ${stop}: ${detail}`,
			};
		}

		const raw = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		const parsed = parseEvaluationResponse(raw);
		return {
			kind: "verdict",
			met: parsed.met,
			reason: parsed.reason,
			tokens: usageTotalTokens(response.usage),
			evaluatorModel: `${picked.ref.provider}/${picked.ref.id}`,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const aborted = controller.signal.aborted || /abort/i.test(msg);
		return {
			kind: "error",
			reason: aborted ? `Evaluator timed out after ${evalTimeoutMs()}ms` : msg,
		};
	} finally {
		clearTimeout(timer);
	}
}

export default function (pi: ExtensionAPI) {
	let goal: GoalState | null = null;
	let lastTerminal: GoalState | null = null;
	let evaluating = false;
	let footerTimer: ReturnType<typeof setInterval> | undefined;

	const stopFooterTimer = () => {
		if (footerTimer) {
			clearInterval(footerTimer);
			footerTimer = undefined;
		}
	};

	const startFooterTimer = (ctx: Ctx) => {
		stopFooterTimer();
		if (!ctx.hasUI) return;
		footerTimer = setInterval(() => {
			if (goal?.status === "active") updateFooter(ctx, goal);
		}, 15_000);
		footerTimer.unref?.();
	};

	const setActive = (ctx: Ctx, next: GoalState) => {
		goal = next;
		lastTerminal = null;
		persist(pi, goal);
		updateFooter(ctx, goal);
		startFooterTimer(ctx);
	};

	const finish = (ctx: Ctx, next: GoalState) => {
		goal = null;
		lastTerminal = next;
		persist(pi, next);
		updateFooter(ctx, null);
		stopFooterTimer();
	};

	const restoreActive = (
		ctx: Ctx,
		stored: GoalState,
		opts: { announce: boolean },
	) => {
		const restored = restoreActiveGoalOnResume(stored, {
			tokenBaseline: sessionTokenEstimate(ctx),
		});
		goal = restored;
		lastTerminal = null;
		persist(pi, goal);
		updateFooter(ctx, goal);
		startFooterTimer(ctx);
		if (opts.announce) {
			notify(
				ctx,
				`Restored goal (${restored.condition.slice(0, 80)}${restored.condition.length > 80 ? "…" : ""})`,
				"info",
			);
		}
	};

	const emitStopMax = (ctx: Ctx, state: GoalState, reason: string) => {
		finish(ctx, state);
		pi.sendMessage(
			{
				customType: "goal-max-turns",
				content: buildMaxTurnsMessage(state.condition, state.maxTurns, reason),
				display: true,
			},
			{ triggerTurn: false },
		);
		notify(ctx, `Goal stopped at max turns (${state.maxTurns})`, "warning");
	};

	const emitEvalFailed = (ctx: Ctx, state: GoalState, reason: string) => {
		finish(ctx, state);
		pi.sendMessage(
			{
				customType: "goal-eval-failed",
				content: [
					"**Goal stopped** — evaluator failed (fail-closed).",
					"",
					`Condition: ${state.condition}`,
					`Reason: ${reason}`,
					"",
					"Fix auth/model (`PI_GOAL_MODEL`) and run `/goal …` again.",
				].join("\n"),
				display: true,
			},
			{ triggerTurn: false },
		);
		notify(ctx, "Goal stopped: evaluator failed", "error");
	};

	pi.on("session_start", (event, ctx) => {
		const entries = ctx.sessionManager.getEntries() as Parameters<
			typeof loadLatestGoalState
		>[0];
		const stored = loadLatestGoalState(entries);

		if (
			stored?.status === "active" &&
			(event.reason === "resume" || event.reason === "startup")
		) {
			restoreActive(ctx, stored, { announce: event.reason === "resume" });
			// Do not auto-kick on resume/startup.
			return;
		}

		if (stored && stored.status !== "active") {
			lastTerminal = stored;
		}
		goal = null;
		updateFooter(ctx, null);
	});

	pi.on("session_shutdown", () => {
		stopFooterTimer();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!goal || goal.status !== "active") return;
		if (evaluating) return;
		if (!ctx.isIdle()) return;

		evaluating = true;
		try {
			if (!goal || goal.status !== "active") return;

			if (goal.turnsEvaluated >= goal.maxTurns) {
				const d = decideGoalSettle(goal, { kind: "pre-max" });
				if (d.action === "stop-max") emitStopMax(ctx, d.state, d.reason);
				return;
			}

			notify(ctx, "Evaluating goal…", "info");
			updateFooter(ctx, goal);

			const outcome = await evaluateGoal(ctx, goal);
			if (!goal || goal.status !== "active") return;

			const decision = decideGoalSettle(goal, outcome);
			if (decision.action === "skip") return;

			if (decision.action === "stop-max") {
				emitStopMax(ctx, decision.state, decision.reason);
				return;
			}

			if (decision.action === "stop-eval-failed") {
				emitEvalFailed(ctx, decision.state, decision.reason);
				return;
			}

			// achieved | continue — keep state
			goal = decision.state;
			persist(pi, goal);
			updateFooter(ctx, goal);

			if (outcome.kind === "verdict") {
				pi.sendMessage(
					{
						customType: "goal-eval",
						content: outcome.met
							? `◎ goal evaluator: **YES** — ${outcome.reason}`
							: `◎ goal evaluator: **NO** — ${outcome.reason}`,
						display: true,
					},
					{ triggerTurn: false },
				);
			}

			if (decision.action === "achieved") {
				finish(ctx, decision.state);
				pi.sendMessage(
					{
						customType: "goal-achieved",
						content: buildAchievedMessage(decision.state.condition, decision.reason),
						display: true,
					},
					{ triggerTurn: false },
				);
				notify(ctx, "Goal achieved", "info");
				return;
			}

			// continue
			if (!ctx.isIdle()) {
				notify(
					ctx,
					"Goal: agent busy after eval — continue skipped (will retry next settle)",
					"warning",
				);
				return;
			}

			pi.sendUserMessage(
				buildContinueMessage(
					goal.condition,
					decision.reason,
					goal.turnsEvaluated,
					goal.maxTurns,
				),
			);
		} finally {
			evaluating = false;
		}
	});

	pi.registerCommand("goal", {
		description:
			"Set/check/clear a completion condition; auto-continues until met (Claude Code-style)",
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();

			if (!raw) {
				const report = buildStatusReport(goal ?? lastTerminal, {
					sessionTokens: sessionTokenEstimate(ctx),
				});
				pi.sendMessage(
					{ customType: "goal-status", content: report, display: true },
					{ triggerTurn: false },
				);
				notify(
					ctx,
					goal ? "Goal active" : lastTerminal ? "No active goal" : "No goal set",
				);
				return;
			}

			if (isClearArg(raw)) {
				if (!goal || goal.status !== "active") {
					pi.sendMessage(
						{ customType: "goal-status", content: "No goal set", display: true },
						{ triggerTurn: false },
					);
					notify(ctx, "No goal set");
					return;
				}
				const cleared = markCleared(goal);
				const condition = cleared.condition;
				finish(ctx, cleared);
				pi.sendMessage(
					{
						customType: "goal-cleared",
						content: `Goal cleared: ${condition}`,
						display: true,
					},
					{ triggerTurn: false },
				);
				notify(ctx, "Goal cleared");
				return;
			}

			if (raw.length > MAX_CONDITION_CHARS) {
				notify(
					ctx,
					`Condition too long (${raw.length} > ${MAX_CONDITION_CHARS} chars)`,
					"error",
				);
				return;
			}

			if (!ctx.isIdle()) {
				notify(
					ctx,
					"Agent is busy — wait for idle (or interrupt) before setting a goal",
					"warning",
				);
				return;
			}

			const picked = resolveEvaluator(ctx);
			if (!picked) {
				notify(
					ctx,
					"Cannot start /goal: no authenticated evaluator model (set PI_GOAL_MODEL or /login)",
					"error",
				);
				pi.sendMessage(
					{
						customType: "goal-error",
						content:
							"**Goal not started** — no authenticated evaluator model.\n\n" +
							"Configure auth for a cheap model or set `PI_GOAL_MODEL=provider/id`.",
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			const maxTurns = resolveMaxTurns(raw, process.env.PI_GOAL_MAX_TURNS);
			const next = createActiveGoal(raw, {
				maxTurns,
				tokenBaseline: sessionTokenEstimate(ctx),
			});
			setActive(ctx, next);

			const evalLabel = `${picked.ref.provider}/${picked.ref.id}`;
			pi.sendMessage(
				{
					customType: "goal-set",
					content: [
						"**Goal set**",
						"",
						`Condition: ${raw}`,
						`- Max evaluations: ${maxTurns}`,
						`- Evaluator: \`${evalLabel}\``,
						`- Eval timeout: ${evalTimeoutMs()}ms`,
						"",
						"Auto-continues after each turn until the condition holds. `/goal clear` to stop.",
						"Stops fail-closed if the evaluator is unavailable or errors.",
					].join("\n"),
					display: true,
				},
				{ triggerTurn: false },
			);

			pi.sendUserMessage(buildKickoffMessage(raw));
			notify(ctx, "Goal active — working…");
		},
	});
}
