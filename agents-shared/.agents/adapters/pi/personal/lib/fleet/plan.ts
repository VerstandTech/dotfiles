/**
 * Build parallel subagent task plans for large fleets.
 */

import {
	CANONICAL_FLEET_AGENTS,
} from "./child-policy.ts";
import {
	preferNativeModels,
	type ModelResolveContext,
} from "./model-resolve.ts";
import { expandPersonas, type FleetKind, type FleetPersona } from "./personas.ts";

const CANONICAL_AGENT_SET = new Set<string>(CANONICAL_FLEET_AGENTS);

function assertCanonicalFleetAgent(agent: string): void {
	const name = agent.trim();
	if (!CANONICAL_AGENT_SET.has(name)) {
		throw new Error(
			`uncontained-agent: ${name || agent} is not a canonical fleet role (scout/worker/reviewer overrides rejected)`,
		);
	}
}

export interface FleetModelPolicy {
	/**
	 * Exclusive single model for all children when set via tool override.
	 * Precedence is handled by resolveModelPool — not merged with pool.
	 */
	model?: string;
	/** Exclusive rotate list when set via tool override */
	models?: string[];
	/** Per-kind defaults (exclusive for that kind when no explicit model/models) */
	byKind?: Partial<Record<FleetKind, string | string[]>>;
	/** Fallback pool when kind has no pin */
	pool?: string[];
	/** Ultimate fallback single model */
	defaultModel?: string;
	/**
	 * When true, `model` / `models` are exclusive overrides (tool args).
	 * When false/undefined, treat as config-level fields with kind > pool > default.
	 */
	explicitOverride?: boolean;
}

export interface FleetPlanInput {
	kind: FleetKind;
	topic: string;
	count: number;
	personas?: Array<Pick<FleetPersona, "id" | "label" | "angle" | "agent">>;
	agent?: string;
	modelPolicy?: FleetModelPolicy;
	concurrency?: number;
	/** Host parallel.concurrency cap (warn + clamp) */
	maxConcurrency?: number;
	maxTasks?: number;
	/** Always forced true for RPC-safe plans */
	async?: boolean;
	context?: "fresh" | "fork";
	extraInstructions?: string;
	scope?: string;
	/** Output directory prefix relative to cwd (default .pi/fleet-runs) */
	outputDir?: string;
	/** Prefer first-party providers over OpenRouter (default true) */
	preferNativeProviders?: boolean;
	/** Auth + registry context for native-first resolution */
	modelResolveContext?: ModelResolveContext;
}

export interface FleetTask {
	agent: string;
	task: string;
	model?: string;
	output?: string;
	label: string;
	personaId: string;
}

/** Public pi-subagents 0.45.2 execution shape (WorkflowScript-only). */
export interface FleetSubagentParams {
	/** Statement body executed as `async (runs) => { ... }` */
	workflowScript: string;
	context: "fresh" | "fork";
	async: true;
	/**
	 * SEC-00: bind discovery to user/package agents so project checkouts cannot
	 * shadow reviewed fleet-researcher / fleet-reviewer / fleet-ux definitions.
	 */
	agentScope: "user";
}

export interface FleetPlan {
	kind: FleetKind;
	topic: string;
	count: number;
	concurrency: number;
	context: "fresh" | "fork";
	async: boolean;
	/** Internal display/persona model — not the public RPC spawn shape. */
	tasks: FleetTask[];
	subagentParams: FleetSubagentParams;
	warnings: string[];
}

/** pi-subagents stable-key contract for runs.run / runs.all. */
const RUN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type WorkflowChild = {
	key: string;
	agent: string;
	task: string;
	model?: string;
	output?: string;
};

/**
 * Deterministic unique key independent of persona ids (which may collide).
 * Matches /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.
 */
export function fleetChildKey(index: number): string {
	const key = `m${String(index + 1).padStart(2, "0")}`;
	if (!RUN_KEY_PATTERN.test(key)) {
		throw new Error(`generated fleet child key is invalid: ${key}`);
	}
	return key;
}

/**
 * Build a WorkflowScript body that:
 * - embeds children as JSON data (no string interpolation of prompts),
 * - batches with sequential `runs.all` calls of size `concurrency`,
 * - returns all results in original persona order.
 */
export function buildFleetWorkflowScript(
	tasks: FleetTask[],
	concurrency: number,
): string {
	// Finite positive integer only — NaN/±Infinity/0/negative/fractional must not serialize as null
	// or drive a non-advancing `for` loop step.
	const batchSize = normalizeConcurrency(concurrency, 1);
	const children: WorkflowChild[] = tasks.map((t, index) => {
		const child: WorkflowChild = {
			key: fleetChildKey(index),
			agent: t.agent,
			task: t.task,
			output: t.output,
		};
		if (t.model) child.model = t.model;
		return child;
	});

	// JSON.stringify keeps backticks / ${} / quotes / Unicode inert data.
	const childrenJson = JSON.stringify(children);
	const batchJson = JSON.stringify(batchSize);

	return [
		`const __children = ${childrenJson};`,
		`const __batchSize = ${batchJson};`,
		`const __results = [];`,
		`for (let __i = 0; __i < __children.length; __i += __batchSize) {`,
		`  const __batch = __children.slice(__i, __i + __batchSize);`,
		`  const __batchResults = await runs.all(__batch);`,
		`  __results.push(...__batchResults);`,
		`}`,
		`return __results;`,
	].join("\n");
}

const DEFAULT_MAX_TASKS = 48;
const DEFAULT_CONCURRENCY = 10;

function asModelList(value: string | string[] | undefined): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.map((m) => m.trim()).filter(Boolean);
	const t = value.trim();
	return t ? [t] : [];
}

/**
 * Exclusive precedence:
 * 1) explicit tool `models[]`
 * 2) explicit tool `model`
 * 3) byKind[kind]
 * 4) pool
 * 5) defaultModel
 */
export function resolveModelPool(
	kind: FleetKind,
	policy?: FleetModelPolicy,
	options?: {
		preferNativeProviders?: boolean;
		modelResolveContext?: ModelResolveContext;
	},
): string[] {
	if (!policy) return [];

	let pool: string[] = [];
	if (policy.explicitOverride) {
		// Preserve duplicates so callers can pin e.g. 2×A + 2×B + 6×C by listing 10 entries
		if (policy.models?.length) {
			pool = asModelList(policy.models);
		} else if (policy.model?.trim()) {
			pool = [policy.model.trim()];
		}
	} else {
		const kindList = asModelList(policy.byKind?.[kind]);
		if (kindList.length) pool = [...new Set(kindList)];
		else {
			const p = asModelList(policy.pool ?? policy.models);
			if (p.length) pool = [...new Set(p)];
			else if (policy.model?.trim()) pool = [policy.model.trim()];
			else if (policy.defaultModel?.trim()) pool = [policy.defaultModel.trim()];
		}
	}

	if (
		pool.length > 0 &&
		options?.preferNativeProviders !== false &&
		options?.modelResolveContext
	) {
		pool = preferNativeModels(pool, options.modelResolveContext);
	}
	return pool;
}

export function pickModel(
	index: number,
	kind: FleetKind,
	policy?: FleetModelPolicy,
	options?: {
		preferNativeProviders?: boolean;
		modelResolveContext?: ModelResolveContext;
	},
): string | undefined {
	const pool = resolveModelPool(kind, policy, options);
	if (pool.length === 0) return undefined;
	return pool[index % pool.length];
}

function buildTaskPrompt(options: {
	kind: FleetKind;
	topic: string;
	persona: FleetPersona;
	scope?: string;
	extra?: string;
	index: number;
	total: number;
}): string {
	const { kind, topic, persona, scope, extra, index, total } = options;
	const lines: string[] = [
		`You are fleet member ${index + 1}/${total}: **${persona.label}** (id: ${persona.id}).`,
		``,
		`## Subject`,
		topic.trim(),
	];
	if (scope?.trim()) {
		lines.push(``, `## Scope`, scope.trim());
	}
	lines.push(``, `## Your unique angle`, persona.angle);
	lines.push(
		``,
		`## Rules`,
		`- Stay inside your angle; do not try to cover every perspective.`,
		`- Be evidence-backed (file:line for code, URLs for research).`,
		`- No file edits unless the parent explicitly requested a writer fleet.`,
		`- Do not use bash to modify the repository.`,
		`- Return a structured brief the parent can synthesize.`,
		``,
		`## Required output shape`,
	);

	if (kind === "research") {
		lines.push(
			`# Research — ${persona.label}`,
			`## Summary (3-5 sentences)`,
			`## Findings (numbered, with sources)`,
			`## Confidence & gaps`,
			`## Implications for the parent decision`,
		);
	} else if (kind === "review") {
		lines.push(
			`# Review — ${persona.label}`,
			`## Blockers (must fix)`,
			`## Important (should fix)`,
			`## Nits / optional`,
			`## What looks solid`,
			`Each finding: severity, evidence (path:line), why it matters, suggested fix.`,
		);
	} else if (kind === "ux") {
		lines.push(
			`# UX review — ${persona.label}`,
			`## Persona reaction (1 paragraph)`,
			`## Friction points (ordered by severity)`,
			`## Opportunities`,
			`## Concrete UI/copy recommendations`,
		);
	} else {
		lines.push(
			`# Report — ${persona.label}`,
			`## Findings`,
			`## Evidence`,
			`## Recommendations`,
		);
	}

	if (extra?.trim()) {
		lines.push(``, `## Extra instructions`, extra.trim());
	}
	return lines.join("\n");
}

function normalizeConcurrency(value: unknown, fallback: number): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback;
	return n;
}

/**
 * Repository-relative outputDir contract (enforced before task build).
 * Rejects empty, absolute POSIX/Windows, NUL, `.`/`..`, and traversal segments.
 */
export function assertSafeOutputDir(raw: string | undefined): string {
	const fallback = ".pi/fleet-runs";
	if (raw === undefined) return fallback;
	if (typeof raw !== "string") {
		throw new Error("outputDir must be a repository-relative path string");
	}
	if (raw.includes("\0")) {
		throw new Error("outputDir must not contain NUL bytes");
	}
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new Error("outputDir must not be empty");
	}
	const noTrail = trimmed.replace(/[/\\]+$/, "");
	if (!noTrail || noTrail === "." || noTrail === "..") {
		throw new Error(`outputDir is not a safe repository-relative path: ${JSON.stringify(raw)}`);
	}
	// Absolute POSIX or root-ish backslash
	if (noTrail.startsWith("/") || noTrail.startsWith("\\")) {
		throw new Error(`outputDir must be repository-relative (got absolute): ${JSON.stringify(raw)}`);
	}
	// Absolute Windows drive (C:\... or C:/...)
	if (/^[A-Za-z]:([/\\]|$)/.test(noTrail)) {
		throw new Error(`outputDir must be repository-relative (got Windows absolute): ${JSON.stringify(raw)}`);
	}
	const segments = noTrail.split(/[/\\]+/);
	for (const seg of segments) {
		if (!seg || seg === "." || seg === "..") {
			throw new Error(
				`outputDir must not contain empty or traversal segments: ${JSON.stringify(raw)}`,
			);
		}
		if (seg.includes("\0")) {
			throw new Error("outputDir must not contain NUL bytes");
		}
	}
	return segments.join("/");
}

/**
 * Deterministic single filename segment from a persona id.
 * Preserves enough identity for humans; index already supplies uniqueness.
 * Never emits separators, NUL, or `.` / `..` traversal.
 */
export function safeOutputFilenameSegment(raw: string): string {
	const cleaned = String(raw ?? "")
		.replace(/\0/g, "")
		.replace(/[/\\]+/g, "-")
		.replace(/[\p{Cc}\p{Cf}]+/gu, "")
		.replace(/[^\p{L}\p{N}._-]+/gu, "-")
		.replace(/-+/g, "-")
		.replace(/^[.-]+/, "")
		.replace(/[.-]+$/, "")
		.slice(0, 80);
	if (!cleaned || cleaned === "." || cleaned === "..") {
		return "persona";
	}
	// Guard residual dot-only / traversal after slice
	if (/^\.+$/.test(cleaned)) return "persona";
	return cleaned;
}

export function buildFleetPlan(input: FleetPlanInput): FleetPlan {
	const maxTasks = input.maxTasks ?? DEFAULT_MAX_TASKS;
	const maxConcurrency = input.maxConcurrency ?? maxTasks;
	const warnings: string[] = [];
	let count = input.count;
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`count must be a positive integer (got ${input.count})`);
	}
	if (count > maxTasks) {
		warnings.push(
			`Requested ${count} agents but maxTasks=${maxTasks}; clamping to ${maxTasks}. Raise pi-subagents parallel.maxTasks (and /reload) to go higher.`,
		);
		count = maxTasks;
	}

	const personas = expandPersonas(input.kind, count, input.personas);
	const requested = normalizeConcurrency(input.concurrency, DEFAULT_CONCURRENCY);
	const concurrency = Math.min(requested, count, maxConcurrency, maxTasks);
	// Warn when caps (not just member count) reduced concurrency
	if (concurrency < requested && (concurrency < count || maxConcurrency < requested)) {
		warnings.push(
			`Requested concurrency ${requested} clamped to ${concurrency} (caps: maxConcurrency=${maxConcurrency}, maxTasks=${maxTasks}, count=${count}).`,
		);
	}

	const context = input.context ?? "fresh";
	// RPC spawn is async-only; never emit async:false
	if (input.async === false) {
		warnings.push("async:false is not supported by pi-subagents RPC spawn; forcing async:true.");
	}
	// Enforce outputDir contract before building tasks / public spawn payload.
	const outputDir = assertSafeOutputDir(input.outputDir);

	const modelOpts = {
		preferNativeProviders: input.preferNativeProviders !== false,
		modelResolveContext: input.modelResolveContext,
	};

	// Reject uncontained agent overrides before any WorkflowScript is generated.
	const overrideAgent = input.agent?.trim();
	if (overrideAgent) assertCanonicalFleetAgent(overrideAgent);
	for (const persona of personas) {
		assertCanonicalFleetAgent(overrideAgent || persona.agent);
	}

	const tasks: FleetTask[] = personas.map((persona, index) => {
		const agent = overrideAgent || persona.agent;
		assertCanonicalFleetAgent(agent);
		const model = pickModel(index, input.kind, input.modelPolicy, modelOpts);
		const task = buildTaskPrompt({
			kind: input.kind,
			topic: input.topic,
			persona,
			scope: input.scope,
			extra: input.extraInstructions,
			index,
			total: personas.length,
		});
		// Unique path even if persona ids collide; filename segment is sanitized (identity kept on personaId).
		const fileSeg = safeOutputFilenameSegment(persona.id);
		const output = `${outputDir}/${input.kind}-${String(index + 1).padStart(2, "0")}-${fileSeg}.md`;
		return {
			agent,
			task,
			model,
			output,
			label: persona.label,
			personaId: persona.id,
		};
	});

	const subagentParams: FleetSubagentParams = {
		workflowScript: buildFleetWorkflowScript(tasks, concurrency),
		context,
		async: true,
		agentScope: "user",
	};

	return {
		kind: input.kind,
		topic: input.topic,
		count: tasks.length,
		concurrency,
		context,
		async: true,
		tasks,
		subagentParams,
		warnings,
	};
}

export function formatPlanSummary(plan: FleetPlan): string {
	const lines: string[] = [
		`# Fleet plan — ${plan.kind} × ${plan.count}`,
		``,
		`**Topic:** ${plan.topic}`,
		`**Concurrency:** ${plan.concurrency}`,
		`**Context:** ${plan.context}`,
		`**Async:** ${plan.async}`,
		``,
		`## Members`,
	];
	for (const [i, t] of plan.tasks.entries()) {
		lines.push(
			`${i + 1}. **${t.label}** (\`${t.personaId}\`) → agent=\`${t.agent}\`${t.model ? ` model=\`${t.model}\`` : ""} → \`${t.output}\``,
		);
	}
	if (plan.warnings.length) {
		lines.push(``, `## Warnings`, ...plan.warnings.map((w) => `- ${w}`));
	}
	lines.push(
		``,
		`## Next`,
		`1. Ensure agents exist (\`fleet-researcher\`, \`fleet-reviewer\`, \`fleet-ux\`, or overrides).`,
		`2. Launch with the \`subagent\` tool using the WorkflowScript payload (or \`fleet_dispatch\` / \`/fleet\`).`,
		`3. When complete, synthesize: **Agreements / Disagreements / Blockers / Actions / Residual risks**.`,
		`4. Inspect live fleet: \`/subagents-fleet\` or Ctrl+Alt+F.`,
		`5. Do not claim live dispatch success until SEC-00 containment is green.`,
	);
	return lines.join("\n");
}
