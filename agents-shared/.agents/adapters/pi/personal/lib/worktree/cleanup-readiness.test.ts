/**
 * ISO-01 causal red — evaluateCleanupReadinessV1 never deletes; deny unsafe states.
 */
import { describe, expect, test } from "bun:test";

const MODULE_URL = new URL("./caid-lifecycle.ts", import.meta.url).href;
const ISO01_LIFECYCLE_MISSING = "ISO01_LIFECYCLE_MISSING";
const ISO01_CLEANUP_API_MISSING = "ISO01_CLEANUP_API_MISSING";

type CleanupApi = {
	evaluateCleanupReadinessV1: (...args: any[]) => any;
};

let loadedApi: Promise<CleanupApi> | undefined;

async function loadApi(): Promise<CleanupApi> {
	loadedApi ??= import(MODULE_URL)
		.then((module) => {
			if (typeof (module as CleanupApi).evaluateCleanupReadinessV1 !== "function") {
				throw new Error(ISO01_CLEANUP_API_MISSING);
			}
			return module as CleanupApi;
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message === ISO01_CLEANUP_API_MISSING ||
				message === ISO01_LIFECYCLE_MISSING ||
				/cannot find|module not found|resolve/i.test(message)
			) {
				throw new Error(ISO01_LIFECYCLE_MISSING);
			}
			throw error;
		});
	return loadedApi;
}

function baseCard(over: Record<string, unknown> = {}) {
	return {
		id: "feat-a--implementer",
		path: "/repo/.worktrees/caid/feat-a/implementer",
		branch: "caid/feat-a/implementer",
		head: "bbb222",
		busy: "idle",
		updatedAt: "2026-08-11T00:00:00.000Z",
		...over,
	};
}

function baseFacts(over: Record<string, unknown> = {}) {
	return {
		dirty: false,
		agentStatus: "idle" as const,
		expectedHeadSha: "bbb222",
		observedHeadSha: "bbb222",
		isMain: false,
		heartbeatClassification: "fresh" as const,
		...over,
	};
}

describe("evaluateCleanupReadinessV1 — deny unsafe (R8)", () => {
	const denials: Array<{ name: string; code: string; facts: Record<string, unknown>; card?: Record<string, unknown> }> =
		[
			{ name: "ISO01_CLEANUP_denies_dirty", code: "dirty", facts: { dirty: true } },
			{
				name: "ISO01_CLEANUP_denies_busy",
				code: "busy",
				facts: {},
				card: { busy: "busy" },
			},
			{
				name: "ISO01_CLEANUP_denies_stale_but_leased",
				code: "leased",
				facts: { heartbeatClassification: "stale" },
				card: { busy: "busy" },
			},
			{
				name: "ISO01_CLEANUP_denies_unknown_status",
				code: "unknown-status",
				facts: { agentStatus: "unknown" },
			},
			{
				name: "ISO01_CLEANUP_denies_blocked",
				code: "blocked",
				facts: { agentStatus: "blocked" },
			},
			{
				name: "ISO01_CLEANUP_denies_sha_mismatch",
				code: "sha-mismatch",
				facts: { expectedHeadSha: "bbb222", observedHeadSha: "deadbeef" },
			},
			{
				name: "ISO01_CLEANUP_denies_main_by_default",
				code: "main",
				facts: { isMain: true },
				card: {
					id: "main",
					path: "/repo",
					branch: "main",
					head: "aaa111",
					busy: "idle",
				},
			},
		];

	for (const row of denials) {
		test(row.name, async () => {
			const api = await loadApi();
			let deleted = 0;
			const result = api.evaluateCleanupReadinessV1({
				card: baseCard(row.card ?? {}),
				facts: baseFacts(row.facts),
				deleteWorktree: () => {
					deleted += 1;
				},
				removeWorktree: () => {
					deleted += 1;
				},
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.allow).toBe(false);
			expect(result.code).toBe(row.code);
			expect(deleted).toBe(0);
			expect(Object.isFrozen(result)).toBe(true);
		});
	}

	test("ISO01_CLEANUP_allows_clean_idle_matching_sha_without_delete", async () => {
		const api = await loadApi();
		let deleted = 0;
		const result = api.evaluateCleanupReadinessV1({
			card: baseCard({ busy: "idle" }),
			facts: baseFacts({
				dirty: false,
				agentStatus: "idle",
				expectedHeadSha: "bbb222",
				observedHeadSha: "bbb222",
				isMain: false,
				heartbeatClassification: "fresh",
			}),
			deleteWorktree: () => {
				deleted += 1;
			},
			rm: () => {
				deleted += 1;
			},
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.allow).toBe(true);
		expect(Array.isArray(result.candidates)).toBe(true);
		expect(result.candidates.length).toBeGreaterThan(0);
		expect(
			result.candidates.some(
				(c: { id?: string; path?: string }) =>
					c.id === "feat-a--implementer" ||
					c.path === "/repo/.worktrees/caid/feat-a/implementer",
			),
		).toBe(true);
		expect(deleted).toBe(0);
		expect(result).not.toHaveProperty("deleted");
		expect(Object.isFrozen(result)).toBe(true);
	});

	test("ISO01_CLEANUP_never_invokes_filesystem_delete_hooks", async () => {
		const api = await loadApi();
		const calls: string[] = [];
		const hooks = {
			deleteWorktree: () => calls.push("deleteWorktree"),
			removeWorktree: () => calls.push("removeWorktree"),
			rm: () => calls.push("rm"),
			rmSync: () => calls.push("rmSync"),
			exec: () => calls.push("exec"),
		};
		// Exercise both allow and deny paths.
		for (const facts of [baseFacts(), baseFacts({ dirty: true })]) {
			api.evaluateCleanupReadinessV1({
				card: baseCard(),
				facts,
				...hooks,
			});
		}
		expect(calls).toEqual([]);
	});
});
