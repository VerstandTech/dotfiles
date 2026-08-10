import { describe, expect, test } from "bun:test";
import { basename, isAbsolute, normalize as normalizePath, sep as pathSep } from "node:path";
import {
	FORBIDDEN_PUBLIC_EXECUTION_KEYS,
	normalizePublicSubagentExecutionFixture,
	PI_SUBAGENTS_VERSION_PIN,
	PUBLIC_CUTOVER_MESSAGE,
	tryLoadRealNormalizePublicSubagentExecution,
} from "./public-execution-0.45.2.fixture.ts";
import { buildFleetPlan, buildFleetWorkflowScript, pickModel, resolveModelPool, type FleetTask } from "./plan.ts";

/** pi-subagents 0.45.2 stable-key contract for runs.run / runs.all. */
const RUN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type PublicParams = Record<string, unknown>;

function asPublicParams(plan: ReturnType<typeof buildFleetPlan>): PublicParams {
	return plan.subagentParams as unknown as PublicParams;
}

function assertNoLegacyPublicPayload(params: PublicParams): void {
	// Causal red signature required by CMP-02 ValidationContractV1.
	if (Object.prototype.hasOwnProperty.call(params, "tasks") || params.tasks !== undefined) {
		throw new Error("legacy top-level tasks payload is still emitted");
	}
	for (const key of FORBIDDEN_PUBLIC_EXECUTION_KEYS) {
		expect(params[key], `public params must omit ${key}`).toBeUndefined();
	}
}

/** Filename segment must not itself encode path escape. */
function assertSafeOutputPath(output: string, outputDir: string): void {
	expect(output.startsWith(`${outputDir}/`), `output must stay under ${outputDir}: ${output}`).toBe(
		true,
	);
	expect(isAbsolute(output), `output must not be absolute: ${output}`).toBe(false);
	const normalized = normalizePath(output);
	expect(normalized.startsWith(".."), `output must not traverse up: ${output}`).toBe(false);
	expect(normalized.includes(`${pathSep}..${pathSep}`) || normalized.endsWith(`${pathSep}..`)).toBe(
		false,
	);
	const file = basename(output);
	expect(file.length).toBeGreaterThan(0);
	expect(file.includes("/") || file.includes("\\")).toBe(false);
	expect(file.includes("\0")).toBe(false);
	expect(file === "." || file === "..").toBe(false);
	// Single path segment after outputDir (no nested escape via persona id).
	const rest = output.slice(outputDir.length + 1);
	expect(rest.includes("/") || rest.includes("\\"), `filename must be one segment: ${output}`).toBe(
		false,
	);
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
	ok?: boolean;
	error?: unknown;
	agent?: string;
	task?: string;
	model?: string;
	outputPath?: string;
};

function createMockRuns(options?: {
	/** 1-based member indices that should fail (ok:false). */
	failMembers?: number[];
}) {
	const failSet = new Set(options?.failMembers ?? []);
	const batches: MockChild[][] = [];
	let memberOrdinal = 0;
	const runs = {
		all: async (items: MockChild[]) => {
			if (!Array.isArray(items)) throw new Error("runs.all requires an array");
			batches.push(items.map((item) => ({ ...item })));
			return items.map((item): MockRunResult => {
				memberOrdinal += 1;
				const index = memberOrdinal;
				const failed = failSet.has(index);
				if (failed) {
					return {
						key: String(item.key),
						output: "",
						success: false,
						ok: false,
						error: { code: "child_failed", message: `member ${index} failed`, member: index },
						agent: typeof item.agent === "string" ? item.agent : undefined,
						task: typeof item.task === "string" ? item.task : undefined,
						model: typeof item.model === "string" ? item.model : undefined,
						outputPath: typeof item.output === "string" ? item.output : undefined,
					};
				}
				return {
					key: String(item.key),
					output: `result:${item.key}`,
					success: true,
					ok: true,
					agent: typeof item.agent === "string" ? item.agent : undefined,
					task: typeof item.task === "string" ? item.task : undefined,
					model: typeof item.model === "string" ? item.model : undefined,
					outputPath: typeof item.output === "string" ? item.output : undefined,
				};
			});
		},
		run: async (key: string, params: Record<string, unknown>) => {
			batches.push([{ key, ...params }]);
			return {
				key,
				output: `result:${key}`,
				success: true,
				ok: true,
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

/** Bounded execution so NaN/Infinity batch loops cannot hang the suite. */
async function executeWorkflowScriptBounded(
	script: string,
	runs: ReturnType<typeof createMockRuns>["runs"],
	timeoutMs = 400,
): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			executeWorkflowScript(script, runs),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					reject(
						new Error(
							`workflow script exceeded bounded timeout ${timeoutMs}ms (possible infinite loop from non-finite batch size)`,
						),
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function sampleTasks(count: number): FleetTask[] {
	return Array.from({ length: count }, (_, i) => ({
		agent: "fleet-researcher",
		task: `task-${i + 1}`,
		model: "xai/grok-4.5",
		output: `.pi/fleet-runs/research-${String(i + 1).padStart(2, "0")}-sample.md`,
		label: `Sample ${i + 1}`,
		personaId: `sample-${i + 1}`,
	}));
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

		const mirror = normalizePublicSubagentExecutionFixture(params);
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

	test("shared 0.45.2 fixture rejects legacy tasks and accepts WorkflowScript params", async () => {
		expect(PI_SUBAGENTS_VERSION_PIN).toBe("0.45.2");

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
		const direct = {
			agent: "fleet-researcher",
			task: "solo",
		};
		const management = {
			action: "status",
		};
		const scheduleOk = {
			action: "schedule.create",
			workflowScript: "return [];",
		};

		const legacyResult = normalizePublicSubagentExecutionFixture(legacy);
		expect(legacyResult.ok).toBe(false);
		if (!legacyResult.ok) {
			expect(legacyResult.error).toBe(PUBLIC_CUTOVER_MESSAGE);
		}

		const currentResult = normalizePublicSubagentExecutionFixture(current);
		expect(currentResult.ok).toBe(true);

		const directResult = normalizePublicSubagentExecutionFixture(direct);
		expect(directResult.ok).toBe(false);

		const managementResult = normalizePublicSubagentExecutionFixture(management);
		expect(managementResult.ok).toBe(true);

		const scheduleResult = normalizePublicSubagentExecutionFixture(scheduleOk);
		expect(scheduleResult.ok).toBe(true);

		const plan = buildFleetPlan({
			kind: "research",
			topic: "mirror-gate",
			count: 3,
			concurrency: 2,
		});
		const production = normalizePublicSubagentExecutionFixture(asPublicParams(plan));
		expect(production.ok).toBe(true);

		// Optional real-validator integration when the pinned package is installed locally.
		const real = await tryLoadRealNormalizePublicSubagentExecution();
		if (real) {
			const realLegacy = real(legacy);
			expect(realLegacy.ok).toBe(false);
			if (!realLegacy.ok) {
				expect(realLegacy.error).toBe(PUBLIC_CUTOVER_MESSAGE);
			}
			expect(real(current).ok).toBe(true);
			expect(real(asPublicParams(plan)).ok).toBe(true);
			expect(real(direct).ok).toBe(false);
			expect(real(management).ok).toBe(true);
		}
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

describe("buildFleetPlan outputDir and persona path contract (R11)", () => {
	test("accepts .pi/fleet-runs and safe nested relative dirs", () => {
		for (const outputDir of [".pi/fleet-runs", ".pi/fleet-runs/nested", "artifacts/fleet"]) {
			const plan = buildFleetPlan({
				kind: "research",
				topic: "safe-output-dir",
				count: 2,
				outputDir,
			});
			const normalizedRoot = outputDir.replace(/\/+$/, "");
			for (const task of plan.tasks) {
				expect(task.output).toBeDefined();
				assertSafeOutputPath(String(task.output), normalizedRoot);
			}
		}
	});

	test("rejects empty, absolute, traversal, and NUL outputDir before spawn", () => {
		const rejected = [
			"",
			"   ",
			"/tmp/abs",
			"/var/fleet",
			"C:\\Windows\\Temp",
			"C:/Windows/Temp",
			".",
			"..",
			"../outside",
			"foo/../bar",
			"foo/../../etc",
			"foo\\..\\bar",
			".pi/fleet-runs/../secret",
			".pi/fleet-runs\0evil",
			"foo\0bar",
		];

		for (const outputDir of rejected) {
			let threw = false;
			try {
				buildFleetPlan({
					kind: "research",
					topic: "bad-output-dir",
					count: 1,
					outputDir,
				});
			} catch {
				threw = true;
			}
			expect(threw, `outputDir must be rejected before spawn: ${JSON.stringify(outputDir)}`).toBe(
				true,
			);
		}
	});

	test("malicious persona ids keep identity but emit safe unique filename segments", () => {
		const maliciousIds = [
			"../../etc/passwd",
			"..\\..\\windows\\system32",
			"/absolute/look",
			"C:\\abs\\look",
			"seg/with/slashes",
			"seg\\with\\backslashes",
			"weird id 🚀 <script>|?*\"",
			"日本語-and-punctuation!@#",
		];
		const outputDir = ".pi/fleet-runs";
		const plan = buildFleetPlan({
			kind: "custom",
			topic: "malicious-persona-ids",
			count: maliciousIds.length,
			outputDir,
			personas: maliciousIds.map((id, i) => ({
				id,
				label: `Mal ${i + 1}`,
				angle: `angle-${i + 1}`,
				agent: "fleet-researcher",
			})),
		});

		expect(plan.tasks).toHaveLength(maliciousIds.length);
		const outputs = plan.tasks.map((t) => t.output);
		expect(new Set(outputs).size).toBe(maliciousIds.length);

		for (let i = 0; i < maliciousIds.length; i++) {
			const task = plan.tasks[i]!;
			// Internal persona identity retained for display/ledger.
			expect(task.personaId).toBe(maliciousIds[i]);
			assertSafeOutputPath(String(task.output), outputDir);
			// Member index participates in uniqueness even when ids collide after sanitize.
			expect(String(task.output)).toContain(String(i + 1).padStart(2, "0"));
		}
	});
});

describe("buildFleetWorkflowScript batch size contract (R12)", () => {
	test("NaN, Infinity, zero, negative, and fractional concurrency stay finite positive integers", async () => {
		const tasks = sampleTasks(5);
		const cases: Array<{ label: string; concurrency: number }> = [
			{ label: "NaN", concurrency: Number.NaN },
			{ label: "+Infinity", concurrency: Number.POSITIVE_INFINITY },
			{ label: "-Infinity", concurrency: Number.NEGATIVE_INFINITY },
			{ label: "0", concurrency: 0 },
			{ label: "negative", concurrency: -3 },
			{ label: "fractional", concurrency: 2.7 },
		];

		for (const c of cases) {
			const script = buildFleetWorkflowScript(tasks, c.concurrency);
			// Embedded batch size must serialize to a finite positive integer, never null/NaN.
			const batchLine = script
				.split("\n")
				.find((line) => line.includes("__batchSize"));
			expect(batchLine, `${c.label}: missing __batchSize`).toBeDefined();
			const match = batchLine!.match(/__batchSize\s*=\s*([0-9eE+.-]+|null|undefined)/);
			expect(match, `${c.label}: unparseable batch line ${batchLine}`).toBeTruthy();
			const raw = match![1]!;
			expect(raw === "null" || raw === "undefined", `${c.label}: batch serialized as ${raw}`).toBe(
				false,
			);
			const batchSize = Number(raw);
			expect(Number.isFinite(batchSize), `${c.label}: non-finite batch ${raw}`).toBe(true);
			expect(Number.isInteger(batchSize), `${c.label}: non-integer batch ${raw}`).toBe(true);
			expect(batchSize, `${c.label}: batch must be >= 1`).toBeGreaterThanOrEqual(1);

			const { runs, batches } = createMockRuns();
			const result = await executeWorkflowScriptBounded(script, runs, 400);
			expect(Array.isArray(result), `${c.label}: result array`).toBe(true);
			expect((result as MockRunResult[]).length, `${c.label}: all results`).toBe(5);
			expect(batches.flat().length, `${c.label}: all children launched`).toBe(5);
			for (const batch of batches) {
				expect(batch.length, `${c.label}: empty batch`).toBeGreaterThanOrEqual(1);
				expect(batch.length, `${c.label}: batch exceeds integer size`).toBeLessThanOrEqual(batchSize);
			}
		}
	});
});

describe("buildFleetWorkflowScript partial child failures (R14)", () => {
	test("members 2 and 4 fail but all five results and batches 2,2,1 are retained", async () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "partial-failures",
			count: 5,
			concurrency: 2,
		});
		const params = asPublicParams(plan);
		assertNoLegacyPublicPayload(params);

		const { runs, batches } = createMockRuns({ failMembers: [2, 4] });
		const result = await executeWorkflowScript(String(params.workflowScript), runs);
		expect(Array.isArray(result)).toBe(true);
		const results = result as MockRunResult[];

		expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
		expect(results).toHaveLength(5);

		// Order preserved; failures observable; successes still present.
		expect(results[0]!.ok).toBe(true);
		expect(results[0]!.success).toBe(true);
		expect(results[1]!.ok).toBe(false);
		expect(results[1]!.success).toBe(false);
		expect(results[1]!.error).toBeDefined();
		expect((results[1]!.error as { member?: number }).member).toBe(2);
		expect(results[2]!.ok).toBe(true);
		expect(results[3]!.ok).toBe(false);
		expect(results[3]!.success).toBe(false);
		expect(results[3]!.error).toBeDefined();
		expect((results[3]!.error as { member?: number }).member).toBe(4);
		expect(results[4]!.ok).toBe(true);

		for (let i = 0; i < 5; i++) {
			expect(results[i]!.key).toBe(batches.flat()[i]!.key);
		}
	});
});
