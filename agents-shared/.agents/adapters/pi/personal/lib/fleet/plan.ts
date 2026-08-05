/**
 * Build parallel subagent task plans for large fleets.
 */

import {
	preferNativeModels,
	type ModelResolveContext,
} from "./model-resolve.ts";
import { expandPersonas, type FleetKind, type FleetPersona } from "./personas.ts";

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

export interface FleetPlan {
	kind: FleetKind;
	topic: string;
	count: number;
	concurrency: number;
	context: "fresh" | "fork";
	async: boolean;
	tasks: FleetTask[];
	subagentParams: {
		tasks: Array<{
			agent: string;
			task: string;
			model?: string;
			output?: string;
		}>;
		concurrency: number;
		context: "fresh" | "fork";
		async: true;
	};
	warnings: string[];
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
	if (!Number.isInteger(n) || n < 1) return fallback;
	return n;
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
	const outputDir = (input.outputDir ?? ".pi/fleet-runs").replace(/\/+$/, "");

	const modelOpts = {
		preferNativeProviders: input.preferNativeProviders !== false,
		modelResolveContext: input.modelResolveContext,
	};

	const tasks: FleetTask[] = personas.map((persona, index) => {
		const agent = input.agent?.trim() || persona.agent;
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
		// Unique path even if persona ids collide
		const output = `${outputDir}/${input.kind}-${String(index + 1).padStart(2, "0")}-${persona.id}.md`;
		return {
			agent,
			task,
			model,
			output,
			label: persona.label,
			personaId: persona.id,
		};
	});

	const subagentParams = {
		tasks: tasks.map((t) => ({
			agent: t.agent,
			task: t.task,
			...(t.model ? { model: t.model } : {}),
			output: t.output,
		})),
		concurrency,
		context,
		async: true as const,
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
		`2. Launch with the \`subagent\` tool using the tasks payload (or \`fleet_dispatch\` / \`/fleet\`).`,
		`3. When complete, synthesize: **Agreements / Disagreements / Blockers / Actions / Residual risks**.`,
		`4. Inspect live fleet: \`/subagents-fleet\` or Ctrl+Alt+F.`,
	);
	return lines.join("\n");
}
