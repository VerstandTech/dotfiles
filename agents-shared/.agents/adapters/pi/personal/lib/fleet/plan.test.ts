import { describe, expect, test } from "bun:test";
import { buildFleetPlan, pickModel, resolveModelPool } from "./plan.ts";

/** pi-subagents 0.45.2 stable-key contract for runs.run / runs.all. */
const RUN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const FORBIDDEN_PUBLIC_KEYS = [
	"action",
	"tasks",
	"chain",
	"parallel",
	"concurrency",
	"chainDir",
	"agent",
	"task",
	"step",
] as const;

const PUBLIC_CUTOVER_MESSAGE =
	"Legacy top-level chain and parallel inputs were removed; use workflowScript.";

type PublicParams = Record<string, unknown>;

/** Test-local mirror of pi-subagents 0.45.2 public-execution cutover. */
function normalizePublicSubagentExecutionMirror(
	params: PublicParams,
): { ok: true; params: PublicParams } | { ok: false; error: string } {
	const action = params.action;
	if (action !== undefined && (typeof action !== "string" || !action.trim())) {
		return {
			ok: false,
			error:
				"action must be a non-empty management/control action, or omit action and use workflowScript.",
		};
	}
	const normalizedAction = typeof action === "string" ? action.trim() : undefined;
	const hasLegacyOrchestration =
		params.tasks !== undefined ||
		params.chain !== undefined ||
		params.parallel !== undefined ||
		params.concurrency !== undefined ||
		params.chainDir !== undefined;
	if (hasLegacyOrchestration) {
		return { ok: false, error: PUBLIC_CUTOVER_MESSAGE };
	}
	if (normalizedAction !== undefined) {
		return {
			ok: false,
			error: "workflowScript execution must omit action; only schedule.create accepts action with workflowScript.",
		};
	}
	if (params.agent !== undefined || params.task !== undefined || params.step !== undefined) {
		return {
			ok: false,
			error: 'Direct execution was removed. Use workflowScript: "return runs.run(\'main\', { agent, task })".',
		};
	}
	if (typeof params.workflowScript !== "string" || !params.workflowScript.trim()) {
		return {
			ok: false,
			error:
				'Execution requires a non-empty workflowScript. Direct execution was removed; use workflowScript: "return runs.run(\'main\', { agent, task })".',
		};
	}
	return { ok: true, params };
}

function asPublicParams(plan: ReturnType<typeof buildFleetPlan>): PublicParams {
	return plan.subagentParams as unknown as PublicParams;
}

function assertNoLegacyPublicPayload(params: PublicParams): void {
	// Causal red signature required by CMP-02 ValidationContractV1.
	if (Object.prototype.hasOwnProperty.call(params, "tasks") || params.tasks !== undefined) {
		throw new Error("legacy top-level tasks payload is still emitted");
	}
	for (const key of FORBIDDEN_PUBLIC_KEYS) {
		expect(params[key], `public params must omit ${key}`).toBeUndefined();
	}
}

type MockChild = {
	key: string;
	agent?: string;
	task?: string;
	model?: string;
	output?: string;
	[k: string]: unknown;
};

type MockRunResult = {
	key: string;
	output: string;
	success: boolean;
	agent?: string;
	task?: string;
	model?: string;
	outputPath?: string;
};

function createMockRuns() {
	const batches: MockChild[][] = [];
	const runs = {
		all: async (items: MockChild[]) => {
			if (!Array.isArray(items)) throw new Error("runs.all requires an array");
			batches.push(items.map((item) => ({ ...item })));
			return items.map(
				(item): MockRunResult => ({
					key: String(item.key),
					output: `result:${item.key}`,
					success: true,
					agent: typeof item.agent === "string" ? item.agent : undefined,
					task: typeof item.task === "string" ? item.task : undefined,
					model: typeof item.model === "string" ? item.model : undefined,
					outputPath: typeof item.output === "string" ? item.output : undefined,
				}),
			);
		},
		run: async (key: string, params: Record<string, unknown>) => {
			batches.push([{ key, ...params }]);
			return {
				key,
				output: `result:${key}`,
				success: true,
				agent: typeof params.agent === "string" ? params.agent : undefined,
				task: typeof params.task === "string" ? params.task : undefined,
				model: typeof params.model === "string" ? params.model : undefined,
				outputPath: typeof params.output === "string" ? params.output : undefined,
			} satisfies MockRunResult;
		},
	};
	return { runs, batches };
}

async function executeWorkflowScript(
	script: string,
	runs: ReturnType<typeof createMockRuns>["runs"],
): Promise<unknown> {
	const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
		...args: string[]
	) => (...args: unknown[]) => Promise<unknown>;
	const fn = new AsyncFunction("runs", script);
	return await fn(runs);
}

describe("resolveModelPool / pickModel exclusive precedence", () => {
	test("explicit model alone pins all indices", () => {
		const policy = { model: "only-me", explicitOverride: true, pool: ["a", "b"] };
		expect(resolveModelPool("review", policy)).toEqual(["only-me"]);
		expect(pickModel(0, "review", policy)).toBe("only-me");
		expect(pickModel(1, "review", policy)).toBe("only-me");
	});

	test("explicit models[] exclusive rotate", () => {
		const policy = {
			models: ["m1", "m2"],
			explicitOverride: true,
			byKind: { review: "kind-model" },
			pool: ["pool"],
		};
		expect(pickModel(0, "review", policy)).toBe("m1");
		expect(pickModel(1, "review", policy)).toBe("m2");
		expect(pickModel(2, "review", policy)).toBe("m1");
	});

	test("explicit models[] preserves duplicate weights (2+2+6)", () => {
		const models = [
			"claude",
			"claude",
			"gpt",
			"gpt",
			"grok",
			"grok",
			"grok",
			"grok",
			"grok",
			"grok",
		];
		const policy = { models, explicitOverride: true, pool: ["nope"] };
		const assigned = models.map((_, i) => pickModel(i, "review", policy));
		expect(assigned.filter((m) => m === "claude")).toHaveLength(2);
		expect(assigned.filter((m) => m === "gpt")).toHaveLength(2);
		expect(assigned.filter((m) => m === "grok")).toHaveLength(6);
	});

	test("native providers preferred over openrouter when context provided", () => {
		const policy = {
			models: [
				"openrouter/anthropic/claude-fable-5",
				"openrouter/openai/gpt-5.6-sol:high",
				"openrouter/x-ai/grok-4.5",
			],
			explicitOverride: true,
		};
		const ctx = {
			authenticatedProviders: new Set(["anthropic", "openai-codex", "xai", "openrouter"]),
			knownModels: new Set<string>(),
		};
		expect(pickModel(0, "review", policy, { modelResolveContext: ctx })).toBe(
			"anthropic/claude-fable-5",
		);
		expect(pickModel(1, "review", policy, { modelResolveContext: ctx })).toBe(
			"openai-codex/gpt-5.6-sol:high",
		);
		expect(pickModel(2, "review", policy, { modelResolveContext: ctx })).toBe("xai/grok-4.5");
	});

	test("byKind exclusive when no tool override", () => {
		const policy = {
			byKind: { review: "xai/review-only" },
			pool: ["xai/pool-a", "xai/pool-b"],
			defaultModel: "xai/default",
		};
		expect(resolveModelPool("review", policy)).toEqual(["xai/review-only"]);
		expect(pickModel(0, "review", policy)).toBe("xai/review-only");
		expect(pickModel(5, "review", policy)).toBe("xai/review-only");
	});

	test("pool used when kind unset", () => {
		const policy = { pool: ["a", "b"], defaultModel: "d" };
		expect(pickModel(0, "research", policy)).toBe("a");
		expect(pickModel(1, "research", policy)).toBe("b");
	});
});

describe("buildFleetPlan", () => {
	test("builds 10 distinct research tasks with exclusive models", () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "Pi subagents fanout",
			count: 10,
			modelPolicy: {
				models: ["xai/grok-4.5", "xai/grok-4-1-fast"],
				explicitOverride: true,
			},
		});
		expect(plan.tasks).toHaveLength(10);
		expect(plan.async).toBe(true);
		expect(plan.subagentParams.async).toBe(true);
		expect(plan.tasks[0]!.model).toBe("xai/grok-4.5");
		expect(plan.tasks[1]!.model).toBe("xai/grok-4-1-fast");
		expect(plan.tasks[0]!.output).toMatch(/^\.pi\/fleet-runs\//);
	});

	test("clamps to maxTasks with warning", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "diff",
			count: 20,
			maxTasks: 5,
		});
		expect(plan.count).toBe(5);
		expect(plan.warnings[0]).toMatch(/clamping/i);
	});

	test("clamps concurrency to maxConcurrency", () => {
		const plan = buildFleetPlan({
			kind: "ux",
			topic: "flow",
			count: 20,
			concurrency: 100,
			maxConcurrency: 8,
			maxTasks: 48,
		});
		expect(plan.concurrency).toBe(8);
		expect(plan.warnings.some((w) => /concurrency/i.test(w))).toBe(true);
	});

	test("forces async true with warning when async false requested", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "x",
			count: 2,
			async: false,
		});
		expect(plan.async).toBe(true);
		expect(plan.subagentParams.async).toBe(true);
		expect(plan.warnings.some((w) => /async/i.test(w))).toBe(true);
	});

	test("invalid concurrency falls back", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "x",
			count: 3,
			concurrency: 0 as unknown as number,
		});
		expect(plan.concurrency).toBeGreaterThanOrEqual(1);
		expect(plan.concurrency).toBeLessThanOrEqual(3);
	});

	test("scope and extra instructions appear", () => {
		const plan = buildFleetPlan({
			kind: "ux",
			topic: "checkout flow",
			count: 2,
			scope: "app/checkout/page.tsx",
			extraInstructions: "Ignore pricing page",
		});
		expect(plan.tasks[0]!.task).toContain("app/checkout/page.tsx");
		expect(plan.tasks[0]!.task).toContain("Ignore pricing page");
		expect(plan.tasks[0]!.agent).toBe("fleet-ux");
	});
});

describe("buildFleetPlan current RPC payload", () => {
	test("emits WorkflowScript-only public spawn params", async () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "CMP-02 workflowScript cutover",
			count: 5,
			concurrency: 2,
			context: "fresh",
			modelPolicy: {
				models: ["xai/grok-4.5", "xai/grok-4-1-fast"],
				explicitOverride: true,
			},
		});

		const params = asPublicParams(plan);
		assertNoLegacyPublicPayload(params);

		expect(typeof params.workflowScript).toBe("string");
		expect(String(params.workflowScript).trim().length).toBeGreaterThan(0);
		expect(params.async).toBe(true);
		expect(params.context).toBe("fresh");

		const mirror = normalizePublicSubagentExecutionMirror(params);
		expect(mirror.ok).toBe(true);

		const { runs, batches } = createMockRuns();
		const result = await executeWorkflowScript(String(params.workflowScript), runs);
		expect(Array.isArray(result)).toBe(true);
		const results = result as MockRunResult[];
		expect(results).toHaveLength(5);

		const flat = batches.flat();
		expect(flat).toHaveLength(5);
		expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);

		const keys = flat.map((c) => c.key);
		expect(new Set(keys).size).toBe(5);
		for (const key of keys) {
			expect(RUN_KEY_PATTERN.test(key)).toBe(true);
		}

		for (let i = 0; i < plan.tasks.length; i++) {
			const task = plan.tasks[i]!;
			const child = flat[i]!;
			expect(child.agent).toBe(task.agent);
			expect(child.task).toBe(task.task);
			expect(child.model).toBe(task.model);
			expect(child.output).toBe(task.output);
			expect(child).not.toHaveProperty("concurrency");
			expect(results[i]!.key).toBe(child.key);
			expect(results[i]!.output).toBe(`result:${child.key}`);
		}

		expect(plan.tasks[0]!.model).toBe("xai/grok-4.5");
		expect(plan.tasks[1]!.model).toBe("xai/grok-4-1-fast");
		expect(flat[0]!.model).toBe("xai/grok-4.5");
		expect(flat[1]!.model).toBe("xai/grok-4-1-fast");
	});

	test("serializes dangerous task text as inert JSON data", async () => {
		const poison =
			'outer `ticks` and ${(() => { throw new Error("INJECTED") })()} and "dq" and \'sq\' and \\slash and 日本語🚀 and\nline-two';
		const plan = buildFleetPlan({
			kind: "research",
			topic: poison,
			count: 2,
			concurrency: 2,
			scope: poison,
			extraInstructions: poison,
			modelPolicy: { model: "xai/grok-4.5", explicitOverride: true },
		});
		const params = asPublicParams(plan);
		assertNoLegacyPublicPayload(params);

		const script = String(params.workflowScript);
		const { runs, batches } = createMockRuns();
		// Must compile/execute without evaluating poison as JavaScript.
		const result = await executeWorkflowScript(script, runs);
		expect(Array.isArray(result)).toBe(true);
		const flat = batches.flat();
		expect(flat).toHaveLength(2);
		for (let i = 0; i < 2; i++) {
			expect(flat[i]!.task).toBe(plan.tasks[i]!.task);
			expect(String(flat[i]!.task)).toContain("${(() => { throw new Error(\"INJECTED\") })()}");
			expect(String(flat[i]!.task)).toContain("日本語🚀");
			expect(String(flat[i]!.task)).toContain("\n");
		}
	});

	test("duplicate persona ids keep unique keys and outputs", async () => {
		const plan = buildFleetPlan({
			kind: "custom",
			topic: "dup-ids",
			count: 3,
			concurrency: 2,
			personas: [
				{ id: "same", label: "One", angle: "a1", agent: "fleet-researcher" },
				{ id: "same", label: "Two", angle: "a2", agent: "fleet-researcher" },
				{ id: "same", label: "Three", angle: "a3", agent: "fleet-researcher" },
			],
		});
		expect(plan.tasks.map((t) => t.personaId)).toEqual(["same", "same", "same"]);
		expect(new Set(plan.tasks.map((t) => t.output)).size).toBe(3);

		const params = asPublicParams(plan);
		assertNoLegacyPublicPayload(params);
		const { runs, batches } = createMockRuns();
		const result = await executeWorkflowScript(String(params.workflowScript), runs);
		expect(Array.isArray(result)).toBe(true);
		const flat = batches.flat();
		const keys = flat.map((c) => c.key);
		expect(new Set(keys).size).toBe(3);
		expect(new Set(flat.map((c) => c.output)).size).toBe(3);
		for (const key of keys) {
			expect(RUN_KEY_PATTERN.test(key)).toBe(true);
		}
	});

	test("async false still warns and forces true on public params", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "async-policy",
			count: 2,
			async: false,
		});
		expect(plan.async).toBe(true);
		expect(plan.warnings.some((w) => /async/i.test(w))).toBe(true);
		const params = asPublicParams(plan);
		assertNoLegacyPublicPayload(params);
		expect(params.async).toBe(true);
	});

	test("context fork survives on public params", () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "fork-context",
			count: 2,
			context: "fork",
		});
		expect(plan.context).toBe("fork");
		const params = asPublicParams(plan);
		assertNoLegacyPublicPayload(params);
		expect(params.context).toBe("fork");
	});

	test("cutover mirror rejects legacy tasks and accepts WorkflowScript params", () => {
		const legacy = {
			tasks: [{ agent: "fleet-researcher", task: "x" }],
			concurrency: 2,
			context: "fresh",
			async: true as const,
		};
		const current = {
			workflowScript: "return [];",
			context: "fresh",
			async: true as const,
		};

		const legacyResult = normalizePublicSubagentExecutionMirror(legacy);
		expect(legacyResult.ok).toBe(false);
		if (!legacyResult.ok) {
			expect(legacyResult.error).toBe(PUBLIC_CUTOVER_MESSAGE);
		}

		const currentResult = normalizePublicSubagentExecutionMirror(current);
		expect(currentResult.ok).toBe(true);

		const plan = buildFleetPlan({
			kind: "research",
			topic: "mirror-gate",
			count: 3,
			concurrency: 2,
		});
		const production = normalizePublicSubagentExecutionMirror(asPublicParams(plan));
		expect(production.ok).toBe(true);
	});

	test("does not launch a live fleet during contract validation", () => {
		// Contract-only: buildFleetPlan is pure. No event bus, network, or RPC spawn.
		const plan = buildFleetPlan({
			kind: "research",
			topic: "no-live-dispatch",
			count: 5,
			concurrency: 2,
		});
		expect(plan.tasks).toHaveLength(5);
		expect(typeof (globalThis as { fetch?: unknown }).fetch).not.toBe("undefined");
		// Presence of fetch must not be used; we simply never call dispatch APIs here.
		expect(plan.topic).toBe("no-live-dispatch");
	});
});
