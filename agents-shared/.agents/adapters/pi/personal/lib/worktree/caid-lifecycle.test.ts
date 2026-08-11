/**
 * ISO-01 causal red — CAID lifecycle, leases, collisions, heartbeat, board IO.
 * Production green must satisfy these contracts without weakening existing helpers.
 */
import { describe, expect, test } from "bun:test";

const MODULE_URL = new URL("./caid-lifecycle.ts", import.meta.url).href;
const ISO01_LIFECYCLE_MISSING = "ISO01_LIFECYCLE_MISSING";
const ISO01_LIFECYCLE_API_MISSING = "ISO01_LIFECYCLE_API_MISSING";
const SYNTHETIC_SECRET = "iso01-synthetic-secret-DO-NOT-ECHO";

const REQUIRED_API = [
	"planCaidLifecycleV1",
	"evaluatePathCollisionV1",
	"evaluateHeartbeatV1",
	"evaluateCleanupReadinessV1",
	"acquireLifecycleWriterV1",
	"releaseLifecycleWriterV1",
	"evaluateBoardCaidAgreementV1",
	"validateBoardV1",
	"saveBoardAtomicV1",
	"appendAssignmentHistoryV1",
	"formatLifecycleHandoffV1",
] as const;

type LifecycleApi = Record<(typeof REQUIRED_API)[number], (...args: any[]) => any> &
	Record<string, unknown>;

let loadedApi: Promise<LifecycleApi> | undefined;

async function loadApi(): Promise<LifecycleApi> {
	loadedApi ??= import(MODULE_URL)
		.then((module) => {
			for (const name of REQUIRED_API) {
				if (typeof (module as Record<string, unknown>)[name] !== "function") {
					throw new Error(ISO01_LIFECYCLE_API_MISSING);
				}
			}
			return module as LifecycleApi;
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message === ISO01_LIFECYCLE_API_MISSING ||
				message === ISO01_LIFECYCLE_MISSING ||
				/cannot find|module not found|resolve/i.test(message)
			) {
				throw new Error(ISO01_LIFECYCLE_MISSING);
			}
			throw error;
		});
	return loadedApi;
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
	if (value === null || typeof value !== "object" || seen.has(value)) return;
	seen.add(value);
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value as object)) expectDeepFrozen(child, seen);
}

function expectNoSecretEcho(value: unknown): void {
	expect(JSON.stringify(value)).not.toContain(SYNTHETIC_SECRET);
}

function board(over: Record<string, unknown> = {}) {
	return {
		repoRoot: "/repo",
		maxBusyWriters: 1,
		cards: [
			{
				id: "main",
				path: "/repo",
				branch: "main",
				head: "aaa111",
				busy: "idle",
				updatedAt: "2026-08-11T00:00:00.000Z",
			},
			{
				id: "feat-a--implementer",
				path: "/repo/.worktrees/caid/feat-a/implementer",
				branch: "caid/feat-a/implementer",
				head: "bbb222",
				busy: "idle",
				updatedAt: "2026-08-11T00:00:00.000Z",
			},
		],
		...over,
	};
}

function caidBoard(over: Record<string, unknown> = {}) {
	return {
		version: 1 as const,
		repoRoot: "/repo",
		assignments: [
			{
				taskId: "feat-a",
				role: "implementer",
				isolation: "worktree",
				path: "/repo/.worktrees/caid/feat-a/implementer",
				branch: "caid/feat-a/implementer",
				cardId: "feat-a--implementer",
				status: "active",
				updatedAt: "2026-08-11T00:00:00.000Z",
			},
		],
		...over,
	};
}

function realpathTable(map: Record<string, string>) {
	return (path: string): string | undefined => map[path];
}

describe("ISO-01 lifecycle API surface", () => {
	test("ISO01_LIFECYCLE_API_exports_required_v1_helpers", async () => {
		const api = await loadApi();
		for (const name of REQUIRED_API) {
			expect(typeof api[name], `${name} must be a function`).toBe("function");
		}
		// Causal-red stub must be removed once green lands.
		if (api.ISO01_LIFECYCLE_STUB === true) {
			throw new Error(ISO01_LIFECYCLE_MISSING);
		}
	});
});

describe("planCaidLifecycleV1 — side-effect free plan (R1-E1, R6-E1)", () => {
	test("ISO01_PLAN_returns_branch_path_role_isolation_cardId_without_io", async () => {
		const api = await loadApi();
		let created = 0;
		let written = 0;
		const result = api.planCaidLifecycleV1({
			repoRoot: "/repo",
			taskId: "billing-fix",
			role: "implementer",
			goal: "Implement invoice rounding",
			now: "2026-08-11T12:00:00.000Z",
			createWorktree: () => {
				created += 1;
			},
			writeBoard: () => {
				written += 1;
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.plan.branch).toMatch(/implementer/);
		expect(result.plan.path).toContain("/repo");
		expect(result.plan.role).toBe("implementer");
		expect(typeof result.plan.isolation).toBe("string");
		expect(typeof result.plan.cardId).toBe("string");
		expect(result.plan.cardId.length).toBeGreaterThan(0);
		expect(created).toBe(0);
		expect(written).toBe(0);
		expectDeepFrozen(result);
	});

	test("ISO01_PLAN_does_not_read_ambient_Date_now_when_now_injected", async () => {
		const api = await loadApi();
		const result = api.planCaidLifecycleV1({
			repoRoot: "/repo",
			taskId: "t",
			role: "test-designer",
			goal: "Write red tests",
			now: "2020-01-01T00:00:00.000Z",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// createdAt / plannedAt, if present, must honor injected clock.
		const stamp =
			result.plan.createdAt ?? result.plan.plannedAt ?? result.plan.now ?? null;
		if (stamp != null) expect(stamp).toBe("2020-01-01T00:00:00.000Z");
	});
});

describe("evaluatePathCollisionV1 — realpath alias + nest (R3)", () => {
	test("ISO01_COLLISION_alias_realpath_denies_exclusive_writers", async () => {
		const api = await loadApi();
		const result = api.evaluatePathCollisionV1({
			exclusiveWriters: [
				{
					path: "/repo/.worktrees/a",
					role: "test-designer",
					cardId: "a",
					status: "active",
				},
				{
					path: "/repo/.worktrees/b-link",
					role: "implementer",
					cardId: "b",
					status: "active",
				},
			],
			realpathOf: realpathTable({
				"/repo/.worktrees/a": "/repo/.worktrees/canonical",
				"/repo/.worktrees/b-link": "/repo/.worktrees/canonical",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("collision");
		expectNoSecretEcho(result);
		expectDeepFrozen(result);
	});

	test("ISO01_COLLISION_nested_path_refuses_strict_roles", async () => {
		const api = await loadApi();
		const result = api.evaluatePathCollisionV1({
			exclusiveWriters: [
				{
					path: "/repo/.worktrees/parent",
					role: "implementer",
					cardId: "parent",
					status: "active",
				},
				{
					path: "/repo/.worktrees/parent/nested",
					role: "test-designer",
					cardId: "child",
					status: "planned",
				},
			],
			realpathOf: realpathTable({
				"/repo/.worktrees/parent": "/repo/.worktrees/parent",
				"/repo/.worktrees/parent/nested": "/repo/.worktrees/parent/nested",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("collision");
	});

	test("ISO01_COLLISION_symlink_escape_refused", async () => {
		const api = await loadApi();
		const result = api.evaluatePathCollisionV1({
			exclusiveWriters: [
				{
					path: `/repo/.worktrees/${SYNTHETIC_SECRET}`,
					role: "implementer",
					cardId: "evil",
					status: "planned",
				},
			],
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				[`/repo/.worktrees/${SYNTHETIC_SECRET}`]: "/tmp/escaped",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(["path-escape", "invalid-path", "collision"]).toContain(result.code);
		expectNoSecretEcho(result);
	});

	test("ISO01_COLLISION_missing_realpath_fact_unavailable_in_strict_mode", async () => {
		const api = await loadApi();
		const result = api.evaluatePathCollisionV1({
			exclusiveWriters: [
				{
					path: "/repo/.worktrees/x",
					role: "implementer",
					cardId: "x",
					status: "active",
				},
			],
			strict: true,
			realpathOf: () => undefined,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(["unavailable", "invalid-path"]).toContain(result.code);
	});

	test("ISO01_COLLISION_free_distinct_realpaths_ok", async () => {
		const api = await loadApi();
		const result = api.evaluatePathCollisionV1({
			exclusiveWriters: [
				{
					path: "/repo/.worktrees/a",
					role: "test-designer",
					cardId: "a",
					status: "active",
				},
				{
					path: "/repo/.worktrees/b",
					role: "implementer",
					cardId: "b",
					status: "active",
				},
			],
			realpathOf: realpathTable({
				"/repo/.worktrees/a": "/repo/.worktrees/a",
				"/repo/.worktrees/b": "/repo/.worktrees/b",
			}),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.free).toBe(true);
	});
});

describe("evaluateHeartbeatV1 — parent token binding + stale observe (R5)", () => {
	const baseLease = {
		parentToken: "parent-token-abc",
		sessionId: "pi-session-1",
		paneId: "herdr-pane-9",
		realpath: "/repo/.worktrees/caid/feat-a/implementer",
		lastHeartbeatAt: "2026-08-11T12:00:00.000Z",
		busy: "busy" as const,
	};

	test("ISO01_HEARTBEAT_matching_identity_updates_monotonic_timestamp", async () => {
		const api = await loadApi();
		const result = api.evaluateHeartbeatV1({
			lease: baseLease,
			heartbeat: {
				parentToken: baseLease.parentToken,
				sessionId: baseLease.sessionId,
				paneId: baseLease.paneId,
				realpath: baseLease.realpath,
			},
			now: "2026-08-11T12:00:30.000Z",
			ttlMs: 60_000,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.autoReleased).toBe(false);
		expect(result.lease.busy).toBe("busy");
		expect(result.lease.lastHeartbeatAt).toBe("2026-08-11T12:00:30.000Z");
		expect(
			Date.parse(result.lease.lastHeartbeatAt) >= Date.parse(baseLease.lastHeartbeatAt),
		).toBe(true);
		expectDeepFrozen(result);
	});

	test("ISO01_HEARTBEAT_token_mismatch_refuses_without_update", async () => {
		const api = await loadApi();
		const result = api.evaluateHeartbeatV1({
			lease: baseLease,
			heartbeat: {
				parentToken: "forged-token",
				sessionId: baseLease.sessionId,
				paneId: baseLease.paneId,
				realpath: baseLease.realpath,
			},
			now: "2026-08-11T12:00:30.000Z",
			ttlMs: 60_000,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("token-mismatch");
		expect(result.autoReleased).toBe(false);
		expect(result.lease?.lastHeartbeatAt ?? baseLease.lastHeartbeatAt).toBe(
			baseLease.lastHeartbeatAt,
		);
	});

	test("ISO01_HEARTBEAT_pane_mismatch_refuses", async () => {
		const api = await loadApi();
		const result = api.evaluateHeartbeatV1({
			lease: baseLease,
			heartbeat: {
				parentToken: baseLease.parentToken,
				sessionId: baseLease.sessionId,
				paneId: "other-pane",
				realpath: baseLease.realpath,
			},
			now: "2026-08-11T12:00:30.000Z",
			ttlMs: 60_000,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("pane-mismatch");
		expect(result.autoReleased).toBe(false);
	});

	test("ISO01_HEARTBEAT_realpath_mismatch_refuses", async () => {
		const api = await loadApi();
		const result = api.evaluateHeartbeatV1({
			lease: baseLease,
			heartbeat: {
				parentToken: baseLease.parentToken,
				sessionId: baseLease.sessionId,
				paneId: baseLease.paneId,
				realpath: "/repo/.worktrees/other",
			},
			now: "2026-08-11T12:00:30.000Z",
			ttlMs: 60_000,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("realpath-mismatch");
		expect(result.autoReleased).toBe(false);
	});

	test("ISO01_HEARTBEAT_stale_classifies_without_auto_release", async () => {
		const api = await loadApi();
		const result = api.evaluateHeartbeatV1({
			lease: baseLease,
			// classification-only path: omit heartbeat payload or pass observe mode
			mode: "classify",
			now: "2026-08-11T12:10:00.000Z",
			ttlMs: 60_000,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.classification).toBe("stale");
		expect(result.autoReleased).toBe(false);
		expect(result.lease.busy).toBe("busy");
	});

	test("ISO01_HEARTBEAT_working_or_blocked_never_auto_releases", async () => {
		const api = await loadApi();
		for (const agentStatus of ["working", "blocked", "unknown"] as const) {
			const result = api.evaluateHeartbeatV1({
				lease: { ...baseLease, agentStatus },
				mode: "classify",
				now: "2026-08-11T12:10:00.000Z",
				ttlMs: 60_000,
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.autoReleased).toBe(false);
			expect(result.lease.busy).toBe("busy");
		}
	});
});

describe("acquire/release lifecycle + board-caid agreement (R4, R7)", () => {
	test("ISO01_ACQUIRE_cap_exceeded_when_maxBusyWriters_full", async () => {
		const api = await loadApi();
		const busyBoard = board({
			maxBusyWriters: 1,
			cards: [
				{
					id: "other--implementer",
					path: "/repo/.worktrees/caid/other/implementer",
					branch: "caid/other/implementer",
					head: "ccc333",
					busy: "busy",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
				{
					id: "feat-a--implementer",
					path: "/repo/.worktrees/caid/feat-a/implementer",
					branch: "caid/feat-a/implementer",
					head: "bbb222",
					busy: "idle",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
			],
		});
		const result = api.acquireLifecycleWriterV1({
			board: busyBoard,
			caid: caidBoard(),
			cardId: "feat-a--implementer",
			now: "2026-08-11T12:00:00.000Z",
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/other/implementer":
					"/repo/.worktrees/caid/other/implementer",
				"/repo/.worktrees/caid/feat-a/implementer":
					"/repo/.worktrees/caid/feat-a/implementer",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("cap-exceeded");
		expectDeepFrozen(result);
	});

	test("ISO01_ACQUIRE_idempotent_lease_held_for_same_card", async () => {
		const api = await loadApi();
		const held = board({
			maxBusyWriters: 1,
			cards: [
				{
					id: "feat-a--implementer",
					path: "/repo/.worktrees/caid/feat-a/implementer",
					branch: "caid/feat-a/implementer",
					head: "bbb222",
					busy: "busy",
					agentRunId: "run-1",
					sessionId: "sess-1",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
			],
		});
		const result = api.acquireLifecycleWriterV1({
			board: held,
			caid: caidBoard(),
			cardId: "feat-a--implementer",
			identity: { sessionId: "sess-1", agentRunId: "run-1" },
			now: "2026-08-11T12:00:00.000Z",
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/feat-a/implementer":
					"/repo/.worktrees/caid/feat-a/implementer",
			}),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toBe("lease-held");
		const busyCount = result.board.cards.filter((c: { busy: string }) => c.busy === "busy")
			.length;
		expect(busyCount).toBe(1);
	});

	test("ISO01_ACQUIRE_board_caid_mismatch_blocks", async () => {
		const api = await loadApi();
		const result = api.acquireLifecycleWriterV1({
			board: board({
				cards: [
					{
						id: "orphan",
						path: "/repo/.worktrees/orphan",
						busy: "idle",
						updatedAt: "2026-08-11T00:00:00.000Z",
					},
				],
			}),
			caid: caidBoard({
				assignments: [
					{
						taskId: "feat-a",
						role: "implementer",
						isolation: "worktree",
						path: "/repo/.worktrees/caid/feat-a/implementer",
						branch: "caid/feat-a/implementer",
						cardId: "feat-a--implementer",
						status: "active",
						updatedAt: "2026-08-11T00:00:00.000Z",
					},
				],
			}),
			cardId: "feat-a--implementer",
			now: "2026-08-11T12:00:00.000Z",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("board-caid-mismatch");
	});

	test("ISO01_AGREEMENT_helper_flags_missing_board_path", async () => {
		const api = await loadApi();
		const result = api.evaluateBoardCaidAgreementV1({
			board: board({ cards: [{ id: "main", path: "/repo", busy: "idle", updatedAt: "t" }] }),
			caid: caidBoard(),
			cardId: "feat-a--implementer",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("board-caid-mismatch");
	});

	test("ISO01_RELEASE_clears_busy_and_run_bindings", async () => {
		const api = await loadApi();
		const held = board({
			cards: [
				{
					id: "feat-a--implementer",
					path: "/repo/.worktrees/caid/feat-a/implementer",
					branch: "caid/feat-a/implementer",
					head: "bbb222",
					busy: "busy",
					agentRunId: "run-1",
					sessionId: "sess-1",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
			],
		});
		const result = api.releaseLifecycleWriterV1({
			board: held,
			cardId: "feat-a--implementer",
			now: "2026-08-11T13:00:00.000Z",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const card = result.board.cards.find((c: { id: string }) => c.id === "feat-a--implementer");
		expect(card?.busy).toBe("idle");
		expect(card?.agentRunId).toBeUndefined();
		expect(card?.sessionId).toBeUndefined();
		expectDeepFrozen(result);
	});

	test("ISO01_RELEASE_unknown_id_is_stable_not_found", async () => {
		const api = await loadApi();
		const before = board();
		const result = api.releaseLifecycleWriterV1({
			board: before,
			cardId: "missing-card",
			now: "2026-08-11T13:00:00.000Z",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("not-found");
		// Must not mutate other cards' busy state.
		const priorBusy = before.cards.map((c: { id: string; busy: string }) => [c.id, c.busy]);
		const nextBusy = (result.board ?? before).cards.map(
			(c: { id: string; busy: string }) => [c.id, c.busy],
		);
		expect(nextBusy).toEqual(priorBusy);
	});

	test("ISO01_ACQUIRE_succeeds_when_cap_allows_and_path_free", async () => {
		const api = await loadApi();
		const result = api.acquireLifecycleWriterV1({
			board: board({ maxBusyWriters: 1 }),
			caid: caidBoard(),
			cardId: "feat-a--implementer",
			identity: { sessionId: "sess-new", agentRunId: "run-new" },
			now: "2026-08-11T12:00:00.000Z",
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/feat-a/implementer":
					"/repo/.worktrees/caid/feat-a/implementer",
			}),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const card = result.board.cards.find((c: { id: string }) => c.id === "feat-a--implementer");
		expect(card?.busy).toBe("busy");
	});

	test("ISO01_ACQUIRE_missing_realpath_oracle_is_unavailable", async () => {
		const api = await loadApi();
		const result = api.acquireLifecycleWriterV1({
			board: board({ maxBusyWriters: 1 }),
			caid: caidBoard(),
			cardId: "feat-a--implementer",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("unavailable");
	});

	test("ISO01_ACQUIRE_busy_peer_missing_realpath_fails_closed", async () => {
		const api = await loadApi();
		const busyBoard = board({
			maxBusyWriters: 2,
			cards: [
				{
					id: "other--implementer",
					path: "/repo/.worktrees/caid/other/implementer",
					branch: "caid/other/implementer",
					head: "ccc333",
					busy: "busy",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
				{
					id: "feat-a--implementer",
					path: "/repo/.worktrees/caid/feat-a/implementer",
					branch: "caid/feat-a/implementer",
					head: "bbb222",
					busy: "idle",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
			],
		});
		const result = api.acquireLifecycleWriterV1({
			board: busyBoard,
			caid: caidBoard(),
			cardId: "feat-a--implementer",
			repoRootRealpath: "/repo",
			// only self resolves — peer missing realpath must not fail open
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/feat-a/implementer":
					"/repo/.worktrees/caid/feat-a/implementer",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("unavailable");
	});

	test("ISO01_ACQUIRE_symlink_escape_denies", async () => {
		const api = await loadApi();
		const result = api.acquireLifecycleWriterV1({
			board: board({ maxBusyWriters: 1 }),
			caid: caidBoard(),
			cardId: "feat-a--implementer",
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/feat-a/implementer": "/tmp/escaped",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("path-escape");
	});

	test("ISO01_ACQUIRE_idle_caid_peer_alias_collides", async () => {
		const api = await loadApi();
		const result = api.acquireLifecycleWriterV1({
			board: board({
				maxBusyWriters: 2,
				cards: [
					{
						id: "feat-a--implementer",
						path: "/repo/.worktrees/caid/feat-a/implementer",
						branch: "caid/feat-a/implementer",
						head: "bbb222",
						busy: "idle",
						updatedAt: "2026-08-11T00:00:00.000Z",
					},
				],
			}),
			caid: caidBoard({
				assignments: [
					{
						taskId: "feat-a",
						role: "implementer",
						isolation: "worktree",
						path: "/repo/.worktrees/caid/feat-a/implementer",
						branch: "caid/feat-a/implementer",
						cardId: "feat-a--implementer",
						status: "active",
						updatedAt: "2026-08-11T00:00:00.000Z",
					},
					{
						taskId: "feat-a",
						role: "test-designer",
						isolation: "worktree",
						path: "/repo/.worktrees/alias-td",
						branch: "caid/feat-a/test-designer",
						cardId: "feat-a--test-designer",
						status: "active",
						updatedAt: "2026-08-11T00:00:00.000Z",
					},
				],
			}),
			cardId: "feat-a--implementer",
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/feat-a/implementer": "/repo/shared-real",
				"/repo/.worktrees/alias-td": "/repo/shared-real",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("collision");
	});

	test("ISO01_ACQUIRE_identity_mismatch_refuses_lease_held", async () => {
		const api = await loadApi();
		const held = board({
			maxBusyWriters: 1,
			cards: [
				{
					id: "feat-a--implementer",
					path: "/repo/.worktrees/caid/feat-a/implementer",
					branch: "caid/feat-a/implementer",
					head: "bbb222",
					busy: "busy",
					agentRunId: "run-1",
					sessionId: "sess-1",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
			],
		});
		const result = api.acquireLifecycleWriterV1({
			board: held,
			caid: caidBoard(),
			cardId: "feat-a--implementer",
			identity: { sessionId: "forged", agentRunId: "run-1" },
			repoRootRealpath: "/repo",
			realpathOf: realpathTable({
				"/repo/.worktrees/caid/feat-a/implementer":
					"/repo/.worktrees/caid/feat-a/implementer",
			}),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("identity-mismatch");
	});
});

describe("validateBoardV1 + saveBoardAtomicV1 lock (R2, R9)", () => {
	test("ISO01_VALIDATE_BOARD_refuses_unsupported_version", async () => {
		const api = await loadApi();
		const result = api.validateBoardV1({ version: 99, cards: [] });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("unsupported-version");
		expectDeepFrozen(result);
	});

	test("ISO01_VALIDATE_BOARD_refuses_unknown_field", async () => {
		const api = await loadApi();
		const result = api.validateBoardV1({
			version: 1,
			repoRoot: "/repo",
			maxBusyWriters: 2,
			cards: [],
			hostileExtra: SYNTHETIC_SECRET,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("unknown-field");
		expectNoSecretEcho(result);
	});

	test("ISO01_VALIDATE_BOARD_success_is_detached_deep_frozen", async () => {
		const api = await loadApi();
		const input = {
			version: 1,
			repoRoot: "/repo",
			maxBusyWriters: 2,
			cards: [
				{
					id: "main",
					path: "/repo",
					busy: "idle",
					updatedAt: "2026-08-11T00:00:00.000Z",
				},
			],
		};
		const result = api.validateBoardV1(input);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		(input.cards[0] as { busy: string }).busy = "busy";
		expect(result.board.cards[0].busy).toBe("idle");
		expectDeepFrozen(result);
	});

	test("ISO01_SAVE_lock_unavailable_preserves_prior_board_bytes", async () => {
		const api = await loadApi();
		const priorBytes = JSON.stringify({ version: 1, prior: true, token: "keep-me" });
		let wrote: string | undefined;
		const result = api.saveBoardAtomicV1({
			path: "/repo/.pi/worktree-board.json",
			next: { version: 1, prior: false, cards: [] },
			priorBytes,
			lock: {
				tryAcquire: () => false,
				release: () => {},
			},
			writeAtomic: (_path: string, body: string) => {
				wrote = body;
			},
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("lock-unavailable");
		expect(result.priorBytes).toBe(priorBytes);
		expect(wrote).toBeUndefined();
		expectDeepFrozen(result);
	});

	test("ISO01_SAVE_under_lock_replaces_completely", async () => {
		const api = await loadApi();
		const priorBytes = JSON.stringify({ version: 1, generation: 1 });
		let wrote: string | undefined;
		const result = api.saveBoardAtomicV1({
			path: "/repo/.pi/worktree-board.json",
			next: { version: 1, generation: 2, maxBusyWriters: 2, cards: [] },
			priorBytes,
			lock: {
				tryAcquire: () => true,
				release: () => {},
			},
			writeAtomic: (_path: string, body: string) => {
				wrote = body;
			},
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(wrote).toBeDefined();
		expect(wrote).toContain('"generation": 2');
		expect(wrote).not.toContain('"generation": 1');
	});
});

describe("history + observational handoff (R6)", () => {
	test("ISO01_HISTORY_append_only_returns_history_limit_without_wiping_assignment", async () => {
		const api = await loadApi();
		const history = Array.from({ length: 64 }, (_, i) => ({
			at: `2026-08-11T00:00:${String(i).padStart(2, "0")}.000Z`,
			event: "heartbeat",
		}));
		const assignment = {
			taskId: "feat-a",
			role: "implementer",
			cardId: "feat-a--implementer",
			path: "/repo/.worktrees/caid/feat-a/implementer",
			status: "active",
		};
		const result = api.appendAssignmentHistoryV1({
			assignment,
			history,
			event: { at: "2026-08-11T01:00:00.000Z", event: "released" },
			limit: 64,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("history-limit");
		expect(result.assignment).toEqual(expect.objectContaining({ cardId: assignment.cardId }));
		expect(result.assignment.status).toBe("active");
	});

	test("ISO01_HANDOFF_is_observational_and_does_not_mark_next_writer_busy", async () => {
		const api = await loadApi();
		const result = api.formatLifecycleHandoffV1({
			assignment: {
				taskId: "feat-a",
				role: "implementer",
				cardId: "feat-a--implementer",
				path: "/repo/.worktrees/caid/feat-a/implementer",
				isolation: "worktree",
				branch: "caid/feat-a/implementer",
			},
			headSha: "bbb222",
			leaseId: "lease-9",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.handoff.path).toContain("implementer");
		expect(result.handoff.role).toBe("implementer");
		expect(result.handoff.leaseId).toBe("lease-9");
		expect(result.handoff.head).toBe("bbb222");
		expect(result.handoff.nextWriterBusy).not.toBe(true);
		expect(result.grantsWriterAuthority).not.toBe(true);
		expectDeepFrozen(result);
	});
});

describe("ISO-01 foreign authority boundaries (R1)", () => {
	test("ISO01_RESULTS_do_not_claim_bdd_fleet_merge_authority", async () => {
		const api = await loadApi();
		const plan = api.planCaidLifecycleV1({
			repoRoot: "/repo",
			taskId: "t",
			role: "implementer",
			goal: "g",
			now: "2026-08-11T12:00:00.000Z",
		});
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		const json = JSON.stringify(plan);
		expect(json).not.toMatch(/bddPhase|mergePullRequest|spawnFleet|approveAction/);
		expect(plan).not.toHaveProperty("bddPhaseChange");
		expect(plan).not.toHaveProperty("merge");
		expect(plan).not.toHaveProperty("spawn");
	});
});
