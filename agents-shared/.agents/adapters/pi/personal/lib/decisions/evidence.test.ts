import { describe, expect, test } from "bun:test";

const STORE_SOURCE = "docs/decisions/decisions.json";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const DECISION_EVIDENCE_MISSING = "DEC01_TRUSTED_SNAPSHOT_API_MISSING";

type EvidenceApi = Record<string, any>;

async function loadApi(): Promise<EvidenceApi> {
	return (await import("./store.ts")) as EvidenceApi;
}

function decision(over: Record<string, unknown> = {}): Record<string, unknown> {
	const result: Record<string, unknown> = {
		id: "DEC-001",
		kind: "constraint",
		status: "accepted",
		title: "Protect raw database access",
		context: "The UI boundary must remain data-source agnostic.",
		decision: "Keep database internals behind the service boundary.",
		humanReview: "approved",
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		enforcement: {
			effect: "forbid",
			actionIds: ["database.raw-sql.expose"],
		},
		...over,
	};
	for (const [key, value] of Object.entries(result)) {
		if (value === undefined) delete result[key];
	}
	return result;
}

function store(decisions: unknown[] = [decision()]): Record<string, unknown> {
	return { version: 1, project: "delta-tools", decisions };
}

function authority(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		sourcePath: STORE_SOURCE,
		writableByAgent: false,
		...over,
	};
}

async function approvedSnapshot(input = store(), writableByAgent = false) {
	const api = await loadApi();
	const first = api.loadDecisionStoreSnapshotV1(input, authority({ writableByAgent }));
	expect(first.ok).toBe(true);
	if (!first.ok) throw new Error(`unexpected snapshot refusal: ${first.code}`);
	const approved = api.loadDecisionStoreSnapshotV1(
		input,
		authority({ writableByAgent, approvedFingerprint: first.snapshot.fingerprint }),
	);
	expect(approved.ok).toBe(true);
	if (!approved.ok) throw new Error(`unexpected approved snapshot refusal: ${approved.code}`);
	return { api, snapshot: approved.snapshot };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
	if (value === null || typeof value !== "object" || seen.has(value)) return;
	seen.add(value);
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

function expectNoPolicyProse(value: unknown): void {
	const json = JSON.stringify(value);
	expect(json).not.toContain("Protect raw database access");
	expect(json).not.toContain("data-source agnostic");
	expect(json).not.toContain("database internals behind");
}

function preActionInput(snapshot: unknown, over: Record<string, unknown> = {}) {
	return {
		snapshot,
		actionId: "database.raw-sql.expose",
		paths: ["src/ui/debug.ts"],
		...over,
	};
}

describe("DEC-01 trusted decision evidence", () => {
	test("loads a valid store as a detached immutable snapshot", async () => {
		const api = await loadApi();
		expect(
			typeof api.loadDecisionStoreSnapshotV1,
			DECISION_EVIDENCE_MISSING,
		).toBe("function");
		if (typeof api.loadDecisionStoreSnapshotV1 !== "function") return;
		const input = store();
		const result = api.loadDecisionStoreSnapshotV1(input, authority());
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.snapshot.version).toBe(1);
		expect(result.snapshot.sourcePath).toBe(STORE_SOURCE);
		expect(result.snapshot.approvalStatus).toBe("missing");
		expect(result.snapshot.fingerprint).toMatch(/^[0-9a-f]{64}$/);
		expect(result.snapshot.canonicalJson).toBe(JSON.stringify(result.snapshot.store));
		expectDeepFrozen(result);

		const callerDecision = (input.decisions as Array<Record<string, unknown>>)[0]!;
		callerDecision.title = "mutated after load";
		(input.decisions as unknown[]).push(decision({ id: "DEC-999" }));
		expect(result.snapshot.canonicalJson).not.toContain("mutated after load");
		expect(result.snapshot.store.decisions).toHaveLength(1);
	});

	test("normalizes semantic sets and record ordering before fingerprinting", async () => {
		const api = await loadApi();
		const left = store([
			decision({
				id: "DEC-002",
				tags: ["security", "bdd", "security"],
				scopePaths: ["src/ui", "src/services/**", "src/ui"],
				relatedIds: ["DEC-010", "DEC-003", "DEC-010"],
				enforcement: {
					effect: "forbid",
					actionIds: ["git.merge", "database.raw-sql.expose", "git.merge"],
				},
			}),
			decision({ id: "DEC-001", enforcement: undefined }),
		]);
		const right = {
			decisions: [
				decision({ id: "DEC-001", enforcement: undefined }),
				{
					...decision({ id: "DEC-002" }),
					relatedIds: ["DEC-003", "DEC-010"],
					scopePaths: ["src/services/**", "src/ui"],
					tags: ["bdd", "security"],
					enforcement: {
						actionIds: ["database.raw-sql.expose", "git.merge"],
						effect: "forbid",
					},
				},
			],
			project: "delta-tools",
			version: 1,
		};
		const a = api.loadDecisionStoreSnapshotV1(left, authority());
		const b = api.loadDecisionStoreSnapshotV1(right, authority({ writableByAgent: true }));
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.snapshot.canonicalJson).toBe(b.snapshot.canonicalJson);
		expect(a.snapshot.fingerprint).toBe(b.snapshot.fingerprint);
		expect(a.snapshot.store.decisions.map((item) => item.id)).toEqual(["DEC-001", "DEC-002"]);
	});

	test("changes the fingerprint for every semantic policy mutation", async () => {
		const api = await loadApi();
		const baseline = api.loadDecisionStoreSnapshotV1(store(), authority());
		expect(baseline.ok).toBe(true);
		if (!baseline.ok) return;
		const mutations = [
			{ status: "rejected" },
			{ humanReview: "pending" },
			{ decision: "Different semantic decision" },
			{ updatedAt: "2026-08-02T00:00:00.000Z" },
			{ alternatives: ["A", "B"] },
			{ scopePaths: ["src/services"] },
			{ enforcement: { effect: "forbid", actionIds: ["git.merge"] } },
		];
		for (const mutation of mutations) {
			const changed = api.loadDecisionStoreSnapshotV1(store([decision(mutation)]), authority());
			expect(changed.ok).toBe(true);
			if (changed.ok) expect(changed.snapshot.fingerprint).not.toBe(baseline.snapshot.fingerprint);
		}
	});

	test("rejects duplicate ids and malformed schemas with stable non-echoing codes", async () => {
		const api = await loadApi();
		const cases: Array<[unknown, string]> = [
			[{ ...store(), version: 2 }, "invalid-store"],
			[store([decision(), decision()]), "duplicate-id"],
			[store([decision({ id: "bad id" })]), "invalid-store"],
			[store([decision({ kind: "unknown" })]), "invalid-store"],
			[store([decision({ status: "unknown" })]), "invalid-store"],
			[store([decision({ unknown: "private policy payload" })]), "invalid-store"],
			[store([decision({ enforcement: { effect: "allow", actionIds: ["git.merge"] } })]), "invalid-store"],
			[store([decision({ enforcement: { effect: "forbid", actionIds: ["Bad Action"] } })]), "invalid-store"],
		];
		for (const [input, code] of cases) {
			const result = api.loadDecisionStoreSnapshotV1(input, authority());
			expect(result).toEqual({ ok: false, code });
			expectDeepFrozen(result);
			expect(JSON.stringify(result)).not.toContain("private policy payload");
		}
	});

	test("refuses hostile object graphs without invoking accessors", async () => {
		const api = await loadApi();
		let invoked = false;
		const accessor = store();
		Object.defineProperty((accessor.decisions as unknown[])[0]!, "title", {
			enumerable: true,
			get() {
				invoked = true;
				throw new Error("input-derived-error");
			},
		});
		const cyclic = store();
		(cyclic.decisions as unknown[]).push(cyclic);
		const symbolKey = store();
		Object.defineProperty(symbolKey, Symbol("hidden"), { enumerable: true, value: "hidden" });
		const hostile = new Proxy(store(), {
			ownKeys() {
				throw new Error("proxy-derived-error");
			},
		});
		for (const input of [accessor, cyclic, symbolKey, hostile, new Date(), new Uint8Array([1]), 1n]) {
			const result = api.loadDecisionStoreSnapshotV1(input, authority());
			expect(result).toEqual({ ok: false, code: "invalid-store" });
		}
		expect(invoked).toBe(false);
	});

	test("enforces CON-01-derived bounds with exact positive controls", async () => {
		const api = await loadApi();
		const exact = "x".repeat(api.DECISION_EVIDENCE_LIMITS_V1.maxStringLength);
		const exactResult = api.loadDecisionStoreSnapshotV1(
			store([decision({ consequences: exact })]),
			authority(),
		);
		expect(exactResult.ok).toBe(true);
		const overString = api.loadDecisionStoreSnapshotV1(
			store([decision({ consequences: `${exact}x` })]),
			authority(),
		);
		expect(overString).toEqual({ ok: false, code: "bounds" });
		const overArray = api.loadDecisionStoreSnapshotV1(
			store(
				Array.from({ length: api.DECISION_EVIDENCE_LIMITS_V1.maxArrayLength + 1 }, (_, index) =>
					decision({ id: `DEC-${String(index + 1).padStart(3, "0")}` }),
				),
			),
			authority(),
		);
		expect(overArray).toEqual({ ok: false, code: "bounds" });
	});

	test("rejects empty optional strings and empty scope lists", async () => {
		const api = await loadApi();
		for (const input of [
			{ ...store(), project: "" },
			store([decision({ author: "" })]),
			store([decision({ consequences: "" })]),
			store([decision({ scopePaths: [] })]),
		]) {
			expect(api.loadDecisionStoreSnapshotV1(input, authority())).toEqual({
				ok: false,
				code: "invalid-store",
			});
		}
	});

	test("rejects unsafe source and decision scope paths", async () => {
		const api = await loadApi();
		for (const sourcePath of [
			"/tmp/decisions.json",
			"~/decisions.json",
			"../decisions.json",
			"docs/**/decisions.json",
			".env",
			"auth.json",
			"docs/decisions\0.json",
		]) {
			const result = api.loadDecisionStoreSnapshotV1(store(), authority({ sourcePath }));
			expect(result).toEqual({ ok: false, code: "unsafe-source-path" });
		}
		for (const scope of ["/src/ui", "../src/ui", "src/*/ui", ".env", "src/../ui"]) {
			const result = api.loadDecisionStoreSnapshotV1(
				store([decision({ scopePaths: [scope] })]),
				authority(),
			);
			expect(result).toEqual({ ok: false, code: "unsafe-scope-path" });
		}
	});

	test("classifies missing, stale, and current approval without changing store fingerprints", async () => {
		const api = await loadApi();
		const first = api.loadDecisionStoreSnapshotV1(store(), authority());
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const missing = first.snapshot;
		const staleHuman = api.loadDecisionStoreSnapshotV1(store(), authority({ approvedFingerprint: SHA_A }));
		const staleAgent = api.loadDecisionStoreSnapshotV1(
			store(),
			authority({ writableByAgent: true, approvedFingerprint: SHA_A }),
		);
		const currentAgent = api.loadDecisionStoreSnapshotV1(
			store(),
			authority({ writableByAgent: true, approvedFingerprint: first.snapshot.fingerprint }),
		);
		expect(staleHuman.ok && staleHuman.snapshot.approvalStatus).toBe("stale");
		expect(staleAgent.ok && staleAgent.snapshot.approvalStatus).toBe("agent-mutation-detected");
		expect(currentAgent.ok && currentAgent.snapshot.approvalStatus).toBe("current");
		if (!staleHuman.ok || !staleAgent.ok || !currentAgent.ok) return;
		expect(missing.fingerprint).toBe(staleHuman.snapshot.fingerprint);
		expect(missing.fingerprint).toBe(staleAgent.snapshot.fingerprint);
		expect(missing.fingerprint).toBe(currentAgent.snapshot.fingerprint);
	});

	test("fails closed on malformed source authority", async () => {
		const api = await loadApi();
		for (const value of [
			null,
			{},
			{ sourcePath: STORE_SOURCE, writableByAgent: "yes" },
			{ sourcePath: STORE_SOURCE, writableByAgent: false, approvedFingerprint: "abc" },
			{ sourcePath: STORE_SOURCE, writableByAgent: false, unknown: true },
		]) {
			const result = api.loadDecisionStoreSnapshotV1(store(), value);
			expect(result).toEqual({ ok: false, code: "invalid-authority" });
		}
	});

	test("blocks exact structured forbidden actions without prose or substring authority", async () => {
		const { api, snapshot } = await approvedSnapshot(
			store([
				decision({ scopePaths: ["src/ui"] }),
				decision({
					id: "DEC-002",
					title: "No release deletion",
					decision: "Never delete releases",
					enforcement: undefined,
				}),
			]),
		);
		const blocked = api.evaluateDecisionPreActionV1(preActionInput(snapshot));
		expect(blocked.ok).toBe(true);
		if (!blocked.ok) return;
		expect(blocked.evidence.status).toBe("failed");
		expect(blocked.evidence.reasonCodes).toEqual(["constraint-conflict"]);
		expect(blocked.evidence.matchedIds).toEqual(["DEC-001"]);
		expectNoPolicyProse(blocked.evidence);

		const substring = api.evaluateDecisionPreActionV1(
			preActionInput(snapshot, { actionId: "database.raw-sql.expose-debug" }),
		);
		expect(substring.ok && substring.evidence.status).toBe("passed");
		const prose = api.evaluateDecisionPreActionV1(
			preActionInput(snapshot, { actionId: "release.delete" }),
		);
		expect(prose.ok && prose.evidence.status).toBe("passed");
	});

	test("matches decision scopes by repository path segment", async () => {
		const api = await loadApi();
		const cases: Array<[string, string[], boolean]> = [
			["src/ui", ["src/ui"], true],
			["src/ui", ["src/ui/debug.ts"], true],
			["src/ui", ["src/uis/debug.ts"], false],
			["src/services/**", ["src/services/billing/index.ts"], true],
			["src/services/**", [], false],
			["**", [], true],
			["**", ["docs/plans/work-packages/DEC-01.feature"], true],
		];
		for (const [scope, paths, blocked] of cases) {
			const initial = api.loadDecisionStoreSnapshotV1(
				store([decision({ scopePaths: [scope] })]),
				authority(),
			);
			expect(initial.ok).toBe(true);
			if (!initial.ok) continue;
			const approved = api.loadDecisionStoreSnapshotV1(
				store([decision({ scopePaths: [scope] })]),
				authority({ approvedFingerprint: initial.snapshot.fingerprint }),
			);
			expect(approved.ok).toBe(true);
			if (!approved.ok) continue;
			const result = api.evaluateDecisionPreActionV1(preActionInput(approved.snapshot, { paths }));
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.evidence.status).toBe(blocked ? "failed" : "passed");
		}
	});

	test("refuses unsafe concrete action paths before matching", async () => {
		const { api, snapshot } = await approvedSnapshot();
		for (const path of [
			"/tmp/outside",
			"~/outside",
			"../escape",
			"src/**",
			".env",
			"bad\0path",
			"docs/cafe\u0301.md",
		]) {
			const result = api.evaluateDecisionPreActionV1(preActionInput(snapshot, { paths: [path] }));
			expect(result).toEqual({ ok: false, code: "unsafe-action-path" });
		}
	});

	test("treats rejected superseded deprecated and proposed decisions as inactive", async () => {
		const api = await loadApi();
		for (const status of ["rejected", "superseded", "deprecated", "proposed"]) {
			const input = store([decision({ status })]);
			const first = api.loadDecisionStoreSnapshotV1(input, authority());
			expect(first.ok).toBe(true);
			if (!first.ok) continue;
			const approved = api.loadDecisionStoreSnapshotV1(
				input,
				authority({ approvedFingerprint: first.snapshot.fingerprint }),
			);
			expect(approved.ok).toBe(true);
			if (!approved.ok) continue;
			const result = api.evaluateDecisionPreActionV1(preActionInput(approved.snapshot));
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			expect(result.evidence.status).toBe("passed");
			expect(result.evidence.inactiveIds).toEqual(["DEC-001"]);
			expect(result.evidence.matchedIds).toEqual([]);
		}
	});

	test("requires individual review for an accepted matching decision", async () => {
		const api = await loadApi();
		for (const humanReview of [undefined, "pending", "rejected"]) {
			const input = store([decision({ humanReview })]);
			const first = api.loadDecisionStoreSnapshotV1(input, authority());
			expect(first.ok).toBe(true);
			if (!first.ok) continue;
			const approved = api.loadDecisionStoreSnapshotV1(
				input,
				authority({ approvedFingerprint: first.snapshot.fingerprint }),
			);
			expect(approved.ok).toBe(true);
			if (!approved.ok) continue;
			const result = api.evaluateDecisionPreActionV1(preActionInput(approved.snapshot));
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			expect(result.evidence.status).toBe("failed");
			expect(result.evidence.reasonCodes).toEqual(["decision-review-required"]);
			expect(result.evidence.matchedIds).toEqual([]);
		}
	});

	test("lets an approved replacement govern while its predecessor remains inactive", async () => {
		const input = store([
			decision({ id: "DEC-001", status: "superseded" }),
			decision({ id: "DEC-002", supersedes: "DEC-001" }),
		]);
		const { api, snapshot } = await approvedSnapshot(input);
		const result = api.evaluateDecisionPreActionV1(preActionInput(snapshot));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.evidence.status).toBe("failed");
		expect(result.evidence.matchedIds).toEqual(["DEC-002"]);
		expect(result.evidence.inactiveIds).toEqual(["DEC-001"]);
	});

	test("emits deterministic trusted internal pre-action evidence without policy prose", async () => {
		const { api, snapshot } = await approvedSnapshot(store([decision({ scopePaths: ["src/ui"] })]));
		const a = api.evaluateDecisionPreActionV1(preActionInput(snapshot));
		const b = api.evaluateDecisionPreActionV1(preActionInput(snapshot));
		expect(a).toEqual(b);
		expect(a.ok).toBe(true);
		if (!a.ok) return;
		expect(a.evidence).toMatchObject({
			version: 1,
			executorKind: "internal",
			trustTier: "trusted",
			required: true,
			actionId: "database.raw-sql.expose",
			storeFingerprint: snapshot.fingerprint,
		});
		expectDeepFrozen(a);
		expectNoPolicyProse(a);
		expect(Object.keys(a.evidence).sort()).toEqual([
			"actionId",
			"advisoryIds",
			"approvalFingerprint",
			"executorKind",
			"inactiveIds",
			"matchedIds",
			"paths",
			"reasonCodes",
			"required",
			"status",
			"storeFingerprint",
			"trustTier",
			"version",
		].sort());
	});

	test("blocks missing and stale store approval before policy matching", async () => {
		const api = await loadApi();
		const initial = api.loadDecisionStoreSnapshotV1(store(), authority());
		const stale = api.loadDecisionStoreSnapshotV1(
			store(),
			authority({ approvedFingerprint: SHA_A }),
		);
		const mutated = api.loadDecisionStoreSnapshotV1(
			store(),
			authority({ approvedFingerprint: SHA_A, writableByAgent: true }),
		);
		expect(initial.ok && stale.ok && mutated.ok).toBe(true);
		if (!initial.ok || !stale.ok || !mutated.ok) return;
		const missingResult = api.evaluateDecisionPreActionV1(preActionInput(initial.snapshot));
		const staleResult = api.evaluateDecisionPreActionV1(preActionInput(stale.snapshot));
		const mutatedResult = api.evaluateDecisionPreActionV1(preActionInput(mutated.snapshot));
		expect(missingResult.ok && missingResult.evidence.reasonCodes).toEqual([
			"human-review-required",
		]);
		expect(staleResult.ok && staleResult.evidence.reasonCodes).toEqual([
			"human-review-required",
			"stale-approval",
		]);
		expect(mutatedResult.ok && mutatedResult.evidence.reasonCodes).toEqual([
			"agent-mutation-detected",
			"human-review-required",
		]);
		for (const result of [missingResult, staleResult, mutatedResult]) {
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.evidence.status).toBe("failed");
				expect(result.evidence.matchedIds).toEqual([]);
			}
		}
	});

	test("refuses exotic or hostile action-path arrays", async () => {
		const { api, snapshot } = await approvedSnapshot();
		const extra = ["src/ui/debug.ts"] as unknown[] & { extra?: string };
		extra.extra = "unexpected";
		const symbolKey = ["src/ui/debug.ts"];
		Object.defineProperty(symbolKey, Symbol("hidden"), { value: "unexpected" });
		class PathList extends Array<string> {}
		const hostile = new Proxy(["src/ui/debug.ts"], {
			ownKeys() {
				throw new Error("input-derived-error");
			},
		});
		for (const paths of [extra, symbolKey, new PathList("src/ui/debug.ts"), hostile]) {
			expect(api.evaluateDecisionPreActionV1(preActionInput(snapshot, { paths }))).toEqual({
				ok: false,
				code: "invalid-action",
			});
		}
	});

	test("refuses malformed action requests with stable codes", async () => {
		const { api, snapshot } = await approvedSnapshot();
		for (const actionId of ["", "Bad Action", "UPPER", "a".repeat(130)]) {
			expect(api.evaluateDecisionPreActionV1(preActionInput(snapshot, { actionId }))).toEqual({
				ok: false,
				code: "invalid-action",
			});
		}
		expect(
			api.evaluateDecisionPreActionV1(preActionInput(snapshot, { paths: "src/ui" })),
		).toEqual({ ok: false, code: "invalid-action" });
	});

	test("creates current handoff evidence from unique passing actions", async () => {
		const { api, snapshot } = await approvedSnapshot(
			store([decision({ enforcement: undefined })]),
		);
		const first = api.evaluateDecisionPreActionV1(
			preActionInput(snapshot, { actionId: "tests.run", paths: ["src/ui"] }),
		);
		const second = api.evaluateDecisionPreActionV1(
			preActionInput(snapshot, { actionId: "docs.update", paths: ["docs/README.md"] }),
		);
		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		const result = api.evaluateDecisionHandoffV1({
			snapshot,
			expectedFingerprint: snapshot.fingerprint,
			actions: [first.evidence, second.evidence],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.evidence).toMatchObject({
			version: 1,
			status: "passed",
			executorKind: "internal",
			trustTier: "trusted",
			storeFingerprint: snapshot.fingerprint,
			actionIds: ["docs.update", "tests.run"],
			reasonCodes: [],
		});
		expectDeepFrozen(result);
		expectNoPolicyProse(result);
	});

	test("fails handoff for stale store action or failed evidence", async () => {
		const oldInput = store([decision({ enforcement: undefined })]);
		const { api, snapshot: oldSnapshot } = await approvedSnapshot(oldInput);
		const passed = api.evaluateDecisionPreActionV1(
			preActionInput(oldSnapshot, { actionId: "tests.run" }),
		);
		expect(passed.ok).toBe(true);
		if (!passed.ok) return;
		const staleStore = api.evaluateDecisionHandoffV1({
			snapshot: oldSnapshot,
			expectedFingerprint: SHA_B,
			actions: [passed.evidence],
		});
		expect(staleStore.ok && staleStore.evidence.reasonCodes).toEqual([
			"stale-store-fingerprint",
		]);

		const changedInput = store([
			decision({ enforcement: undefined, consequences: "new approved semantics" }),
		]);
		const changedInitial = api.loadDecisionStoreSnapshotV1(changedInput, authority());
		expect(changedInitial.ok).toBe(true);
		if (!changedInitial.ok) return;
		const changedApproved = api.loadDecisionStoreSnapshotV1(
			changedInput,
			authority({ approvedFingerprint: changedInitial.snapshot.fingerprint }),
		);
		expect(changedApproved.ok).toBe(true);
		if (!changedApproved.ok) return;
		const staleAction = api.evaluateDecisionHandoffV1({
			snapshot: changedApproved.snapshot,
			expectedFingerprint: changedApproved.snapshot.fingerprint,
			actions: [passed.evidence],
		});
		expect(staleAction.ok && staleAction.evidence.reasonCodes).toEqual([
			"stale-action-evidence",
		]);

		const blockedSnapshot = await approvedSnapshot();
		const failedAction = api.evaluateDecisionPreActionV1(
			preActionInput(blockedSnapshot.snapshot),
		);
		expect(failedAction.ok).toBe(true);
		if (!failedAction.ok) return;
		const failed = api.evaluateDecisionHandoffV1({
			snapshot: blockedSnapshot.snapshot,
			expectedFingerprint: blockedSnapshot.snapshot.fingerprint,
			actions: [failedAction.evidence],
		});
		expect(failed.ok && failed.evidence.reasonCodes).toEqual(["pre-action-failed"]);
	});

	test("does not create a vacuous passing handoff with no actions", async () => {
		const { api, snapshot } = await approvedSnapshot(
			store([decision({ enforcement: undefined })]),
		);
		const result = api.evaluateDecisionHandoffV1({
			snapshot,
			expectedFingerprint: snapshot.fingerprint,
			actions: [],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.evidence.status).toBe("failed");
		expect(result.evidence.reasonCodes).toEqual(["pre-action-failed"]);
	});

	test("fails handoff when current approval is missing or stale", async () => {
		const api = await loadApi();
		const missing = api.loadDecisionStoreSnapshotV1(store(), authority());
		const stale = api.loadDecisionStoreSnapshotV1(
			store(),
			authority({ writableByAgent: true, approvedFingerprint: SHA_A }),
		);
		expect(missing.ok && stale.ok).toBe(true);
		if (!missing.ok || !stale.ok) return;
		for (const snapshot of [missing.snapshot, stale.snapshot]) {
			const result = api.evaluateDecisionHandoffV1({
				snapshot,
				expectedFingerprint: snapshot.fingerprint,
				actions: [],
			});
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.evidence.reasonCodes).toContain("human-review-required");
		}
	});

	test("rejects duplicate and over-bound handoff actions", async () => {
		const { api, snapshot } = await approvedSnapshot(
			store([decision({ enforcement: undefined })]),
		);
		const action = api.evaluateDecisionPreActionV1(
			preActionInput(snapshot, { actionId: "tests.run" }),
		);
		expect(action.ok).toBe(true);
		if (!action.ok) return;
		const duplicate = api.evaluateDecisionHandoffV1({
			snapshot,
			expectedFingerprint: snapshot.fingerprint,
			actions: [action.evidence, action.evidence],
		});
		expect(duplicate.ok && duplicate.evidence.reasonCodes).toEqual(["duplicate-action"]);
		const over = api.evaluateDecisionHandoffV1({
			snapshot,
			expectedFingerprint: snapshot.fingerprint,
			actions: Array.from(
				{ length: api.DECISION_EVIDENCE_LIMITS_V1.maxArrayLength + 1 },
				(_, index) => ({ ...action.evidence, actionId: `tests.run-${index}` }),
			),
		});
		expect(over).toEqual({ ok: false, code: "bounds" });
	});

	test("rejects forged legacy malformed sparse or subclassed handoff evidence", async () => {
		const { api, snapshot } = await approvedSnapshot(
			store([decision({ enforcement: undefined })]),
		);
		const real = api.evaluateDecisionPreActionV1(
			preActionInput(snapshot, { actionId: "tests.run" }),
		);
		expect(real.ok).toBe(true);
		if (!real.ok) return;
		for (const evidence of [
			{ ok: true, blockers: [], warnings: [], matchedIds: [] },
			{ executorKind: "shell", trustTier: "trusted", status: "passed" },
			{ version: 1, executorKind: "internal", trustTier: "trusted", status: "passed" },
			{ ...real.evidence },
		]) {
			const result = api.evaluateDecisionHandoffV1({
				snapshot,
				expectedFingerprint: snapshot.fingerprint,
				actions: [evidence],
			});
			expect(result).toEqual({ ok: false, code: "invalid-action-evidence" });
		}
		const sparse: unknown[] = [];
		sparse.length = 1;
		expect(
			api.evaluateDecisionHandoffV1({
				snapshot,
				expectedFingerprint: snapshot.fingerprint,
				actions: sparse,
			}),
		).toEqual({ ok: false, code: "invalid-action-evidence" });
		class ActionList extends Array<unknown> {}
		expect(
			api.evaluateDecisionHandoffV1({
				snapshot,
				expectedFingerprint: snapshot.fingerprint,
				actions: new ActionList(real.evidence),
			}),
		).toEqual({ ok: false, code: "invalid-action-evidence" });
	});

	test("is mutation-sensitive to agent-writable stale approval and exact prohibition", async () => {
		const api = await loadApi();
		const unapproved = api.loadDecisionStoreSnapshotV1(store(), authority());
		expect(unapproved.ok).toBe(true);
		if (!unapproved.ok) return;
		const mutated = api.loadDecisionStoreSnapshotV1(
			store([decision({ consequences: "semantic mutation" })]),
			authority({
				writableByAgent: true,
				approvedFingerprint: unapproved.snapshot.fingerprint,
			}),
		);
		expect(mutated.ok).toBe(true);
		if (!mutated.ok) return;
		const staleResult = api.evaluateDecisionPreActionV1(preActionInput(mutated.snapshot));
		expect(staleResult.ok).toBe(true);
		if (!staleResult.ok) return;
		expect(staleResult.evidence.status).toBe("failed");
		expect(staleResult.evidence.reasonCodes).toEqual([
			"agent-mutation-detected",
			"human-review-required",
		]);
		expect(staleResult.evidence.matchedIds).toEqual([]);

		const approved = api.loadDecisionStoreSnapshotV1(
			store(),
			authority({ approvedFingerprint: unapproved.snapshot.fingerprint }),
		);
		expect(approved.ok).toBe(true);
		if (!approved.ok) return;
		const forbidden = api.evaluateDecisionPreActionV1(preActionInput(approved.snapshot));
		expect(forbidden.ok).toBe(true);
		if (!forbidden.ok) return;
		expect(forbidden.evidence.status).toBe("failed");
		expect(forbidden.evidence.reasonCodes).toEqual(["constraint-conflict"]);
		expect(forbidden.evidence.matchedIds).toEqual(["DEC-001"]);
	});

	test("keeps the new authority pure and out of shared integration entrypoints", async () => {
		await loadApi();
		const source = await Bun.file(new URL("./evidence.ts", import.meta.url)).text();
		for (const forbidden of [
			"node:fs",
			"readFile",
			"writeFile",
			"process.env",
			"Date.now",
			"new Date",
			"setTimeout",
			"setInterval",
			"fetch(",
			"child_process",
		]) {
			expect(source).not.toContain(forbidden);
		}
		expect(source).not.toContain("QUALITY_GATE_KINDS");
		expect(source).not.toContain("bdd-mode");
	});
});
