/**
 * Pure helpers for Pi `/goal` (Claude Code-style completion condition loop).
 *
 * The evaluator judges the conversation transcript only — it does not run
 * tools — so conditions must be demonstrable from agent output (tests, builds,
 * git status, etc.).
 */

export const GOAL_STATE_TYPE = "goal-state";
export const GOAL_STATUS_KEY = "goal";
export const DEFAULT_MAX_TURNS = 40;
export const MAX_CONDITION_CHARS = 4000;
/** Keep evaluator prompts bounded even on long sessions. */
export const MAX_TRANSCRIPT_CHARS = 48_000;

export type GoalStatus = "active" | "achieved" | "cleared";

export type GoalState = {
	status: GoalStatus;
	condition: string;
	/** Wall-clock start of the current active run (resets on resume). */
	startedAt: number;
	turnsEvaluated: number;
	lastReason?: string;
	maxTurns: number;
	/** Baseline session tokens when goal was set (if known). */
	tokenBaseline?: number;
	/** Tokens spent by evaluator calls during this goal run. */
	evaluatorTokens: number;
	/** Model used for the last evaluation (provider/id). */
	evaluatorModel?: string;
	clearedAt?: number;
	achievedAt?: number;
};

export type ModelRef = {
	provider: string;
	id: string;
};

export type EvalResult = {
	met: boolean;
	reason: string;
	raw: string;
};

const CLEAR_ALIASES = new Set(["clear", "stop", "off", "reset", "none", "cancel"]);

/** True when `/goal <arg>` should clear rather than set a condition. */
export function isClearArg(arg: string): boolean {
	return CLEAR_ALIASES.has(arg.trim().toLowerCase());
}

/**
 * Parse optional hard turn bound from the condition text, e.g.
 * "… or stop after 20 turns".
 */
export function parseStopAfterTurns(condition: string): number | undefined {
	const m = condition.match(
		/\b(?:stop|halt|quit|end)\s+after\s+(\d+)\s+turns?\b/i,
	);
	if (!m) return undefined;
	const n = Number(m[1]);
	if (!Number.isFinite(n) || n < 1) return undefined;
	return Math.min(Math.floor(n), 500);
}

export function resolveMaxTurns(
	condition: string,
	envMax?: string | undefined,
	fallback = DEFAULT_MAX_TURNS,
): number {
	const fromCondition = parseStopAfterTurns(condition);
	if (fromCondition !== undefined) return fromCondition;
	if (envMax) {
		const n = Number(envMax);
		if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 500);
	}
	return fallback;
}

export function createActiveGoal(
	condition: string,
	opts?: {
		now?: number;
		maxTurns?: number;
		tokenBaseline?: number;
	},
): GoalState {
	const trimmed = condition.trim();
	return {
		status: "active",
		condition: trimmed,
		startedAt: opts?.now ?? Date.now(),
		turnsEvaluated: 0,
		maxTurns: opts?.maxTurns ?? resolveMaxTurns(trimmed),
		tokenBaseline: opts?.tokenBaseline,
		evaluatorTokens: 0,
	};
}

/** On resume: keep condition, reset timer/turns/spend baseline. */
export function restoreActiveGoalOnResume(
	previous: GoalState,
	opts?: { now?: number; tokenBaseline?: number },
): GoalState {
	return {
		status: "active",
		condition: previous.condition,
		startedAt: opts?.now ?? Date.now(),
		turnsEvaluated: 0,
		lastReason: undefined,
		maxTurns: previous.maxTurns,
		tokenBaseline: opts?.tokenBaseline,
		evaluatorTokens: 0,
		evaluatorModel: previous.evaluatorModel,
	};
}

export function markAchieved(state: GoalState, reason: string, now = Date.now()): GoalState {
	return {
		...state,
		status: "achieved",
		lastReason: reason,
		achievedAt: now,
		clearedAt: undefined,
	};
}

export function markCleared(state: GoalState, now = Date.now()): GoalState {
	return {
		...state,
		status: "cleared",
		clearedAt: now,
		achievedAt: undefined,
	};
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "0s";
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

export function formatTokenCount(n: number | undefined): string {
	if (n === undefined || !Number.isFinite(n)) return "—";
	if (n < 1000) return String(Math.round(n));
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	return `${Math.round(n / 1000)}k`;
}

export function footerStatusText(
	state: GoalState,
	now = Date.now(),
): string | undefined {
	if (state.status !== "active") return undefined;
	const dur = formatDuration(now - state.startedAt);
	const turns =
		state.turnsEvaluated > 0 ? ` · ${state.turnsEvaluated}t` : "";
	return `◎ /goal ${dur}${turns}`;
}

export function buildStatusReport(
	state: GoalState | null,
	opts?: { now?: number; sessionTokens?: number },
): string {
	const now = opts?.now ?? Date.now();
	if (!state) {
		return "No goal set.";
	}

	const lines: string[] = [];
	if (state.status === "active") {
		lines.push("**Goal active**");
	} else if (state.status === "achieved") {
		lines.push("**Goal achieved** (earlier this session)");
	} else {
		lines.push("**Goal cleared** (earlier this session)");
	}

	lines.push("", `Condition: ${state.condition}`, "");
	lines.push(`- Duration: ${formatDuration(now - state.startedAt)}`);
	lines.push(`- Turns evaluated: ${state.turnsEvaluated}`);
	lines.push(`- Max turns: ${state.maxTurns}`);

	const sessionDelta =
		opts?.sessionTokens !== undefined && state.tokenBaseline !== undefined
			? Math.max(0, opts.sessionTokens - state.tokenBaseline)
			: undefined;
	const spend =
		(sessionDelta ?? 0) + (state.evaluatorTokens > 0 ? state.evaluatorTokens : 0);
	if (sessionDelta !== undefined || state.evaluatorTokens > 0) {
		lines.push(
			`- Token spend (approx): ${formatTokenCount(spend)}` +
				(state.evaluatorTokens > 0
					? ` (evaluator ${formatTokenCount(state.evaluatorTokens)})`
					: ""),
		);
	}
	if (state.evaluatorModel) {
		lines.push(`- Evaluator: \`${state.evaluatorModel}\``);
	}
	if (state.lastReason) {
		lines.push("", `Last reason: ${state.lastReason}`);
	}
	return lines.join("\n");
}

export function buildKickoffMessage(condition: string): string {
	return [
		"Work until this goal condition holds, then stop.",
		"",
		"Goal condition:",
		condition,
		"",
		"Rules:",
		"- Prove the condition with tools and leave evidence in the transcript (test/build output, git status, file contents, etc.).",
		"- Do not claim the goal is done without that evidence.",
		"- Prefer the smallest sequence of steps that makes the condition true.",
		"- If blocked, explain the blocker clearly and what would unblock it.",
	].join("\n");
}

export function buildContinueMessage(
	condition: string,
	reason: string,
	turnsEvaluated: number,
	maxTurns: number,
): string {
	return [
		`[goal] Condition not yet met (${turnsEvaluated}/${maxTurns} evaluations).`,
		`Reason: ${reason}`,
		"",
		"Continue working toward the goal. Leave fresh evidence in the transcript.",
		"",
		`Goal condition: ${condition}`,
	].join("\n");
}

export function buildAchievedMessage(condition: string, reason: string): string {
	return [
		"**Goal achieved**",
		"",
		`Condition: ${condition}`,
		`Reason: ${reason}`,
	].join("\n");
}

export function buildMaxTurnsMessage(
	condition: string,
	maxTurns: number,
	lastReason?: string,
): string {
	return [
		`**Goal stopped** — reached max evaluations (${maxTurns}).`,
		"",
		`Condition: ${condition}`,
		lastReason ? `Last reason: ${lastReason}` : "",
		"",
		"Clear with `/goal clear` or set a new condition with `/goal …`.",
	]
		.filter(Boolean)
		.join("\n");
}

const EVAL_SYSTEM = `You are a strict goal-completion evaluator for a coding agent session.
You judge ONLY the conversation transcript. You cannot run tools or read files.

Decide whether the GOAL CONDITION is demonstrably satisfied by evidence already present in the transcript (commands run, their exit codes/output, file contents shown, test results, etc.).

Rules:
- Answer YES only if the transcript clearly proves the condition holds right now.
- If the agent claims success without evidence, answer NO.
- If work is still in progress, blocked, or only partially done, answer NO.
- If the condition includes a turn/time bound that has been reached, answer YES only if that stop clause is the condition's exit (treat "stop after N turns" as met when N evaluations would have completed — the harness enforces hard caps separately).
- Be concise.

Output format (exactly):
VERDICT: YES|NO
REASON: <one or two short sentences>`;

export function buildEvaluatorSystemPrompt(): string {
	return EVAL_SYSTEM;
}

export function buildEvaluatorUserPrompt(
	condition: string,
	transcript: string,
	meta?: { turnsEvaluated?: number; maxTurns?: number },
): string {
	const turns =
		meta?.turnsEvaluated !== undefined && meta?.maxTurns !== undefined
			? `\nEvaluations so far: ${meta.turnsEvaluated}/${meta.maxTurns}\n`
			: "";
	return [
		`GOAL CONDITION:\n${condition}`,
		turns,
		"TRANSCRIPT (most recent last):",
		transcript || "(empty)",
		"",
		"Respond with VERDICT and REASON only.",
	].join("\n");
}

/**
 * Parse evaluator model output. Fail-closed to NO when unclear.
 */
export function parseEvaluationResponse(raw: string): EvalResult {
	const text = (raw ?? "").trim();
	if (!text) {
		return { met: false, reason: "Empty evaluator response", raw: text };
	}

	const verdictLine = text.match(/^\s*VERDICT\s*:\s*(YES|NO)\b/im);
	const reasonLine = text.match(/^\s*REASON\s*:\s*(.+)$/im);

	let met: boolean | undefined;
	if (verdictLine) {
		met = verdictLine[1].toUpperCase() === "YES";
	} else {
		// Fallback: leading YES/NO
		const lead = text.match(/^\s*(YES|NO)\b/i);
		if (lead) met = lead[1].toUpperCase() === "YES";
	}

	let reason = reasonLine?.[1]?.trim();
	if (!reason) {
		// Strip a leading verdict line if present
		reason = text
			.replace(/^\s*VERDICT\s*:\s*(YES|NO)\s*/i, "")
			.replace(/^\s*(YES|NO)\b[:\s-]*/i, "")
			.replace(/^\s*REASON\s*:\s*/i, "")
			.trim()
			.split("\n")[0]
			?.trim();
	}
	if (!reason) reason = "No reason provided";

	if (met === undefined) {
		return {
			met: false,
			reason: `Unparseable evaluator verdict; treating as NO. ${reason}`,
			raw: text,
		};
	}

	return { met, reason, raw: text };
}

export type TranscriptMessage = {
	role?: string;
	content?: unknown;
	stopReason?: string;
};

export type TranscriptEntry = {
	type: string;
	message?: TranscriptMessage;
	customType?: string;
	data?: unknown;
};

function clipMessageText(text: string, max = 4000): string {
	if (text.length <= max) return text;
	return `${text.slice(0, Math.floor(max * 0.5))}\n…\n${text.slice(-(max - Math.floor(max * 0.5) - 2))}`;
}

function extractContentText(
	content: unknown,
	opts?: { includeToolCalls?: boolean },
): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as { type?: string; text?: string; name?: string };
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		} else if (
			opts?.includeToolCalls &&
			block.type === "toolCall" &&
			typeof block.name === "string"
		) {
			parts.push(`[toolCall ${block.name}]`);
		}
	}
	return parts.join("\n");
}

function entryToSection(entry: TranscriptEntry): string | null {
	if (entry.type !== "message" || !entry.message?.role) return null;
	const role = entry.message.role;
	if (role === "user" || role === "assistant") {
		const text = clipMessageText(
			extractContentText(entry.message.content, { includeToolCalls: true }).trim(),
		);
		if (!text) return null;
		return `${role.toUpperCase()}:\n${text}`;
	}
	if (role === "toolResult" || role === "tool") {
		const text = clipMessageText(
			extractContentText(entry.message.content).trim(),
		);
		if (!text) return null;
		return `TOOL_RESULT:\n${text}`;
	}
	return null;
}

/**
 * Build a compact transcript from session branch entries for the evaluator.
 * Prefers recent messages: walks newest-first until the char budget is filled.
 */
export function buildTranscript(
	entries: TranscriptEntry[],
	maxChars = MAX_TRANSCRIPT_CHARS,
): string {
	const sections: string[] = [];
	let used = 0;

	for (let i = entries.length - 1; i >= 0; i--) {
		const section = entryToSection(entries[i]!);
		if (!section) continue;
		const add = section.length + (sections.length > 0 ? 2 : 0);
		if (used + add > maxChars && sections.length > 0) {
			sections.push("…[transcript truncated]…");
			break;
		}
		if (used + add > maxChars && sections.length === 0) {
			// Single oversized section — keep its tail
			sections.push(section.slice(-(maxChars - 24)));
			sections.push("…[transcript truncated]…");
			break;
		}
		sections.push(section);
		used += add;
	}

	sections.reverse();
	return sections.join("\n\n");
}

/** Outcome of one goal evaluation attempt (not the condition verdict alone). */
export type GoalEvalOutcome =
	| {
			kind: "verdict";
			met: boolean;
			reason: string;
			tokens: number;
			evaluatorModel: string;
	  }
	| { kind: "unavailable"; reason: string }
	| { kind: "error"; reason: string };

export type GoalSettleDecision =
	| { action: "skip" }
	| { action: "stop-max"; state: GoalState; reason: string }
	| { action: "stop-eval-failed"; state: GoalState; reason: string }
	| { action: "achieved"; state: GoalState; reason: string }
	| { action: "continue"; state: GoalState; reason: string };

/**
 * Pure decision for one settle cycle after an evaluation outcome is known
 * (or max-turns hit before eval). Used by the extension and unit-tested.
 */
export function decideGoalSettle(
	goal: GoalState,
	outcome: GoalEvalOutcome | { kind: "pre-max" },
): GoalSettleDecision {
	if (goal.status !== "active") return { action: "skip" };

	if (outcome.kind === "pre-max" || goal.turnsEvaluated >= goal.maxTurns) {
		const reason =
			goal.lastReason ?? `Reached max evaluations (${goal.maxTurns})`;
		const stopped = markCleared({ ...goal, lastReason: reason });
		return { action: "stop-max", state: stopped, reason };
	}

	if (outcome.kind === "unavailable" || outcome.kind === "error") {
		const next: GoalState = {
			...goal,
			turnsEvaluated: goal.turnsEvaluated + 1,
			lastReason: outcome.reason,
		};
		const stopped = markCleared(next);
		return {
			action: "stop-eval-failed",
			state: stopped,
			reason: outcome.reason,
		};
	}

	// verdict
	const next: GoalState = {
		...goal,
		turnsEvaluated: goal.turnsEvaluated + 1,
		lastReason: outcome.reason,
		evaluatorTokens: goal.evaluatorTokens + outcome.tokens,
		evaluatorModel: outcome.evaluatorModel,
	};

	if (outcome.met) {
		return {
			action: "achieved",
			state: markAchieved(next, outcome.reason),
			reason: outcome.reason,
		};
	}

	if (next.turnsEvaluated >= next.maxTurns) {
		const stopped = markCleared(next);
		return {
			action: "stop-max",
			state: stopped,
			reason: next.lastReason ?? `Reached max evaluations (${next.maxTurns})`,
		};
	}

	return { action: "continue", state: next, reason: outcome.reason };
}

/** Preferred cheap/fast evaluator models (provider, id substring match). */
const PREFERRED_EVALUATORS: Array<{ provider?: string; idIncludes: string[] }> = [
	{ provider: "anthropic", idIncludes: ["haiku"] },
	{ provider: "google", idIncludes: ["flash-lite", "flash"] },
	{ provider: "openai", idIncludes: ["mini", "nano"] },
	{ provider: "xai", idIncludes: ["fast", "mini"] },
	{ provider: "groq", idIncludes: ["instant", "mini", "8b", "70b"] },
	{ idIncludes: ["haiku", "flash-lite", "flash", "mini", "fast", "nano"] },
];

/**
 * Pick a small/fast evaluator model from available models.
 * `preferred` accepts "provider/id" or bare "id".
 */
export function pickEvaluatorModel(
	available: ModelRef[],
	opts?: {
		preferred?: string;
		sessionModel?: ModelRef;
		hasAuth?: (m: ModelRef) => boolean;
	},
): ModelRef | undefined {
	const auth = opts?.hasAuth ?? (() => true);
	const usable = available.filter((m) => auth(m));
	if (usable.length === 0) return undefined;

	const preferred = opts?.preferred?.trim();
	if (preferred) {
		const slash = preferred.indexOf("/");
		if (slash > 0) {
			const provider = preferred.slice(0, slash);
			const id = preferred.slice(slash + 1);
			const hit = usable.find(
				(m) => m.provider === provider && (m.id === id || m.id.includes(id)),
			);
			if (hit) return hit;
		} else {
			const hit = usable.find((m) => m.id === preferred || m.id.includes(preferred));
			if (hit) return hit;
		}
	}

	for (const pref of PREFERRED_EVALUATORS) {
		const hit = usable.find((m) => {
			if (pref.provider && m.provider !== pref.provider) return false;
			const idLower = m.id.toLowerCase();
			return pref.idIncludes.some((s) => idLower.includes(s));
		});
		if (hit) return hit;
	}

	if (opts?.sessionModel) {
		const sess = usable.find(
			(m) =>
				m.provider === opts.sessionModel!.provider && m.id === opts.sessionModel!.id,
		);
		if (sess) return sess;
	}

	return usable[0];
}

/** Find the latest goal-state custom entry data from session entries. */
export function loadLatestGoalState(entries: TranscriptEntry[]): GoalState | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i];
		if (e.type === "custom" && e.customType === GOAL_STATE_TYPE && e.data) {
			const d = e.data as Partial<GoalState>;
			if (typeof d.condition === "string" && d.condition.trim()) {
				return {
					status: (d.status as GoalStatus) ?? "active",
					condition: d.condition,
					startedAt: typeof d.startedAt === "number" ? d.startedAt : Date.now(),
					turnsEvaluated:
						typeof d.turnsEvaluated === "number" ? d.turnsEvaluated : 0,
					lastReason: typeof d.lastReason === "string" ? d.lastReason : undefined,
					maxTurns:
						typeof d.maxTurns === "number" && d.maxTurns >= 1
							? d.maxTurns
							: DEFAULT_MAX_TURNS,
					tokenBaseline:
						typeof d.tokenBaseline === "number" ? d.tokenBaseline : undefined,
					evaluatorTokens:
						typeof d.evaluatorTokens === "number" ? d.evaluatorTokens : 0,
					evaluatorModel:
						typeof d.evaluatorModel === "string" ? d.evaluatorModel : undefined,
					clearedAt: typeof d.clearedAt === "number" ? d.clearedAt : undefined,
					achievedAt: typeof d.achievedAt === "number" ? d.achievedAt : undefined,
				};
			}
		}
	}
	return null;
}

export function usageTotalTokens(usage: {
	input?: number;
	output?: number;
	totalTokens?: number;
	inputTokens?: number;
	outputTokens?: number;
} | null | undefined): number {
	if (!usage) return 0;
	if (typeof usage.totalTokens === "number") return usage.totalTokens;
	const input = usage.input ?? usage.inputTokens ?? 0;
	const output = usage.output ?? usage.outputTokens ?? 0;
	return input + output;
}
