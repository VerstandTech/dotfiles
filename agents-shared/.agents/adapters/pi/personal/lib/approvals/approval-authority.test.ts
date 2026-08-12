import { describe, expect, test } from "bun:test";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const PLAN = "1".repeat(64);
const ACTION = "2".repeat(64);
const NOW = "2026-08-11T20:10:00.000Z";
const CREATED = "2026-08-11T20:00:00.000Z";
const EXPIRES = "2026-08-11T21:00:00.000Z";
const SECRET = "APR01_SYNTHETIC_SECRET_DO_NOT_ECHO";

async function loadApi(): Promise<any> {
	try {
		return await import("./index.ts");
	} catch {
		throw new Error("APR01_APPROVAL_AUTHORITY_MISSING");
	}
}

function request(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		kind: "approval-request",
		requestId: "apr-01-request-1",
		approvalKind: "diff",
		action: "review-candidate",
		risk: "production-write",
		effect: "authorize-review-only",
		paths: ["src/b.ts", "src/a.ts", "src/a.ts"],
		headSha: SHA_A,
		planFingerprint: PLAN,
		actionFingerprint: ACTION,
		sessionId: "session-apr-01",
		generation: 1,
		createdAt: CREATED,
		expiresAt: EXPIRES,
		...over,
	};
}

function facts(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		storePath: "/Users/operator/.pi/authority/approvals.json",
		storeRealPath: "/Users/operator/.pi/authority/approvals.json",
		projectRoot: "/workspace/project",
		projectRealPath: "/workspace/project",
		exists: true,
		mode: 0o600,
		regularFile: true,
		symbolicLink: false,
		hardLinkCount: 1,
		noFollow: true,
		atomicReplace: true,
		parentDirectorySafe: true,
		machineLocal: true,
		...over,
	};
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function fakeStore(options: {
	facts?: Record<string, unknown>;
	value?: unknown;
	readError?: unknown;
	commitError?: unknown;
	commitResult?: unknown;
} = {}) {
	let value = options.value ?? { schemaVersion: 1, records: [] };
	let revision = "revision-0";
	let reads = 0;
	let commits = 0;
	let lastCommit: any;
	return {
		store: {
			read: async () => {
				reads += 1;
				if (options.readError) throw options.readError;
				return {
					ok: true,
					revision,
					facts: facts(options.facts),
					value: clone(value),
				};
			},
			commit: async (input: any) => {
				commits += 1;
				lastCommit = input;
				if (options.commitError) throw options.commitError;
				if (options.commitResult) return options.commitResult;
				value = clone(input.value);
				revision = `revision-${commits}`;
				return {
					ok: true,
					revision,
					facts: facts(options.facts),
				};
			},
		},
		get reads() { return reads; },
		get commits() { return commits; },
		get value() { return clone(value); },
		get lastCommit() { return lastCommit; },
	};
}

function adapters(store: any, over: Record<string, unknown> = {}) {
	return {
		clock: () => NOW,
		lifecycle: { active: true, sessionId: "session-apr-01", generation: 1 },
		store,
		ui: {
			decide: async () => ({ decision: "approved", method: "pi-tui-confirm-select" }),
		},
		...over,
	};
}

async function persistDecision(
	api: any,
	decision: "approved" | "denied",
	req: Record<string, unknown> = request(),
) {
	const state = fakeStore();
	let prompts = 0;
	const result = await api.requestApprovalV1(req, adapters(state.store, {
		ui: {
			decide: async () => {
				prompts += 1;
				return { decision, method: "pi-tui-confirm-select" };
			},
		},
	}));
	return { state, result, get prompts() { return prompts; } };
}

describe("APR-01 pure human approval authority", () => {
	test("causal RED names missing approval authority before production", async () => {
		const api = await loadApi();
		expect(typeof api.requestApprovalV1).toBe("function");
		expect(typeof api.checkApprovalAuthorityV1).toBe("function");
		expect(typeof api.normalizeApprovalRequestV1).toBe("function");
	});

	test("human approves an exact diff and the persisted approval is current without another prompt", async () => {
		const api = await loadApi();
		const saved = await persistDecision(api, "approved");
		expect(saved.result).toMatchObject({
			ok: true,
			outcome: "approved",
			code: "APR01_APPROVED",
			current: true,
			recorded: true,
			requestId: "apr-01-request-1",
			approvalKind: "diff",
		});
		expect(saved.prompts).toBe(1);
		expect(saved.state.commits).toBe(1);

		let unexpectedPrompts = 0;
		const current = await api.requestApprovalV1(request(), adapters(saved.state.store, {
			ui: { decide: async () => { unexpectedPrompts += 1; return { decision: "denied" }; } },
		}));
		expect(current).toMatchObject({ ok: true, outcome: "approved", current: true, recorded: false });
		expect(unexpectedPrompts).toBe(0);
		expect(saved.state.commits).toBe(1);
	});

	test("paths are normalized sorted and detached before scope fingerprinting", async () => {
		const api = await loadApi();
		const input = request();
		const normalized = api.normalizeApprovalRequestV1(input);
		expect(normalized.ok).toBe(true);
		expect(normalized.request.paths).toEqual(["src/a.ts", "src/b.ts"]);
		expect(normalized.request.scopeFingerprint).toMatch(/^[a-f0-9]{64}$/);
		(input.paths as string[]).push("src/c.ts");
		expect(normalized.request.paths).toEqual(["src/a.ts", "src/b.ts"]);
		expect(Object.isFrozen(normalized)).toBe(true);
		expect(Object.isFrozen(normalized.request)).toBe(true);
		expect(Object.isFrozen(normalized.request.paths)).toBe(true);

		const reordered = api.normalizeApprovalRequestV1(request({ paths: ["src/a.ts", "src/b.ts"] }));
		expect(reordered.request.scopeFingerprint).toBe(normalized.request.scopeFingerprint);
	});

	test("model confirmed:true is blocked and cannot invoke UI or persistence", async () => {
		const api = await loadApi();
		const state = fakeStore();
		let prompts = 0;
		const result = await api.requestApprovalV1(
			request({ confirmed: true }),
			adapters(state.store, { ui: { decide: async () => { prompts += 1; return { decision: "approved" }; } } }),
		);
		expect(result).toEqual(expect.objectContaining({ ok: false, code: "APR01_INVALID_REQUEST" }));
		expect(prompts).toBe(0);
		expect(state.reads).toBe(0);
		expect(state.commits).toBe(0);
	});

	test("APR01_CREDENTIAL_LEAF: direct authority rejects shared credential families and allows ordinary source leaves", async () => {
		const api = await loadApi();
		const denied = [
			"config/.env.staging",
			"config/.env.local.bak",
			"config/credentials.yaml",
			"config/credentials.yaml.enc",
			"config/auth.json.bak",
			"config/secrets.toml",
			"config/service-account.yml.gpg",
			"keys/id_ed25519.bak",
			"keys/private.pem.enc",
		];
		for (const [index, path] of denied.entries()) {
			const state = fakeStore();
			const result = await api.requestApprovalV1(
				request({ requestId: `credential-denied-${index}`, paths: [path] }),
				adapters(state.store),
			);
			expect(result).toMatchObject({ ok: false, code: "APR01_CREDENTIAL_LEAF" });
			expect(state.reads).toBe(0);
			expect(state.commits).toBe(0);
		}

		for (const [index, path] of [
			"src/auth.module.ts",
			"src/credentials.client.ts",
			"src/secrets.service.ts",
		].entries()) {
			const state = fakeStore();
			const result = await api.requestApprovalV1(
				request({ requestId: `credential-allowed-${index}`, paths: [path] }),
				adapters(state.store),
			);
			expect(result).toMatchObject({ ok: true, code: "APR01_APPROVED" });
		}
	});

	test("APR01_COMMIT_AFTER_DISPOSE: live generation is checked immediately before commit", async () => {
		const api = await loadApi();
		const state = fakeStore();
		let current = true;
		const result = await api.requestApprovalV1(request(), adapters(state.store, {
			isCurrent: () => current,
			ui: {
				decide: async () => {
					current = false;
					return { decision: "approved", method: "pi-tui-confirm-select" };
				},
			},
		}));
		expect(result).toMatchObject({ ok: false, code: "APR01_SESSION_INACTIVE" });
		expect(state.commits).toBe(0);
		expect((state.value as any).records).toHaveLength(0);
	});

	test.each([
		["changed SHA", { headSha: SHA_B }],
		["changed path", { paths: ["src/a.ts", "src/c.ts"] }],
		["changed risk", { risk: "destructive-write" }],
		["changed plan", { planFingerprint: "3".repeat(64) }],
		["changed action fingerprint", { actionFingerprint: "4".repeat(64) }],
	] as const)("same record under %s is stale and never re-prompted", async (_name, change) => {
		const api = await loadApi();
		const saved = await persistDecision(api, "approved");
		let prompts = 0;
		const result = await api.requestApprovalV1(request(change), adapters(saved.state.store, {
			ui: { decide: async () => { prompts += 1; return { decision: "approved" }; } },
		}));
		expect(result).toMatchObject({ ok: false, outcome: "stale", code: "APR01_SCOPE_STALE" });
		expect(prompts).toBe(0);
		expect(saved.state.commits).toBe(1);
	});

	test.each(["plan", "findings", "risky-action", "diff"])("supports exact %s kind", async (approvalKind) => {
		const api = await loadApi();
		const headSha = approvalKind === "plan" || approvalKind === "findings" ? null : SHA_A;
		const state = fakeStore();
		const result = await api.requestApprovalV1(
			request({ requestId: `apr-${approvalKind}`, approvalKind, headSha }),
			adapters(state.store),
		);
		expect(result).toMatchObject({ ok: true, outcome: "approved", approvalKind });
	});

	test("unknown kinds and missing applicable SHA fail closed", async () => {
		const api = await loadApi();
		for (const input of [
			request({ approvalKind: "merge" }),
			request({ approvalKind: "diff", headSha: null }),
			request({ approvalKind: "risky-action", headSha: null }),
		]) {
			expect(api.normalizeApprovalRequestV1(input)).toMatchObject({ ok: false, code: "APR01_INVALID_REQUEST" });
		}
	});

	test("expired approval is non-passing and is not silently refreshed", async () => {
		const api = await loadApi();
		const saved = await persistDecision(api, "approved");
		let prompts = 0;
		const result = await api.requestApprovalV1(request(), adapters(saved.state.store, {
			clock: () => EXPIRES,
			ui: { decide: async () => { prompts += 1; return { decision: "approved" }; } },
		}));
		expect(result).toMatchObject({ ok: false, outcome: "expired", code: "APR01_APPROVAL_EXPIRED" });
		expect(prompts).toBe(0);
	});

	test("exact denial is durable while a changed scope requires a new request and UI", async () => {
		const api = await loadApi();
		const denied = await persistDecision(api, "denied");
		expect(denied.result).toMatchObject({ ok: false, outcome: "denied", code: "APR01_DENIED", recorded: true });

		let exactPrompts = 0;
		const exact = await api.requestApprovalV1(request(), adapters(denied.state.store, {
			ui: { decide: async () => { exactPrompts += 1; return { decision: "approved" }; } },
		}));
		expect(exact).toMatchObject({ ok: false, outcome: "denied", code: "APR01_DENIED", recorded: false });
		expect(exactPrompts).toBe(0);

		const stale = await api.requestApprovalV1(request({ headSha: SHA_B }), adapters(denied.state.store));
		expect(stale).toMatchObject({ ok: false, outcome: "stale", code: "APR01_SCOPE_STALE" });

		let changedPrompts = 0;
		const changed = await api.requestApprovalV1(
			request({ requestId: "apr-01-request-2", headSha: SHA_B }),
			adapters(denied.state.store, {
				ui: { decide: async () => { changedPrompts += 1; return { decision: "approved", method: "pi-tui-confirm-select" }; } },
			}),
		);
		expect(changed).toMatchObject({ ok: true, outcome: "approved", recorded: true });
		expect(changedPrompts).toBe(1);
		expect((denied.state.value as any).records).toHaveLength(2);
	});

	test("cancel blocks without manufacturing a denial", async () => {
		const api = await loadApi();
		const state = fakeStore();
		const result = await api.requestApprovalV1(request(), adapters(state.store, {
			ui: { decide: async () => ({ decision: "cancelled", method: "pi-tui-confirm-select" }) },
		}));
		expect(result).toMatchObject({ ok: false, outcome: "blocked", code: "APR01_UI_CANCELLED" });
		expect(state.commits).toBe(0);
	});

	test.each([
		["mode", { mode: 0o644 }],
		["symlink", { symbolicLink: true }],
		["hardlink", { hardLinkCount: 2 }],
		["nonregular", { regularFile: false }],
		["project path", {
			storePath: "/workspace/project/.pi/approval.json",
			storeRealPath: "/workspace/project/.pi/approval.json",
		}],
		["real path escape", { storeRealPath: "/workspace/project/.pi/approval.json" }],
		["lexical escape", {
			storePath: "/workspace/project/../project/.pi/approval.json",
			storeRealPath: "/workspace/project/.pi/approval.json",
		}],
		["not machine local", { machineLocal: false }],
		["followed", { noFollow: false }],
		["non-atomic", { atomicReplace: false }],
		["unsafe parent", { parentDirectorySafe: false }],
	] as const)("unsafe store %s refuses authority", async (_name, unsafeFacts) => {
		const api = await loadApi();
		const state = fakeStore({ facts: unsafeFacts });
		const result = await api.requestApprovalV1(request(), adapters(state.store));
		expect(result).toMatchObject({ ok: false, outcome: "unavailable", code: "APR01_STORE_UNSAFE" });
		expect(state.commits).toBe(0);
	});

	test("commit is compare-and-commit with frozen bounded value and safe requirements", async () => {
		const api = await loadApi();
		const state = fakeStore();
		const result = await api.requestApprovalV1(request(), adapters(state.store));
		expect(result.ok).toBe(true);
		expect(state.lastCommit.expectedRevision).toBe("revision-0");
		expect(state.lastCommit.requirements).toEqual({
			mode: 0o600,
			noFollow: true,
			atomicReplace: true,
			regularFile: true,
			hardLinkCount: 1,
		});
		expect(Object.isFrozen(state.lastCommit)).toBe(true);
		expect(Object.isFrozen(state.lastCommit.value)).toBe(true);
		expect(Object.isFrozen(state.lastCommit.value.records)).toBe(true);
	});

	test("commit refusal malformed output or thrown callbacks never approve or echo", async () => {
		const api = await loadApi();
		for (const state of [
			fakeStore({ commitError: new Error(SECRET) }),
			fakeStore({ commitResult: { ok: false, error: SECRET } }),
			fakeStore({ commitResult: { ok: true, revision: SECRET } }),
		]) {
			const result = await api.requestApprovalV1(request(), adapters(state.store));
			expect(result.ok).toBe(false);
			expect(result.outcome).toBe("unavailable");
			expect(JSON.stringify(result)).not.toContain(SECRET);
		}
	});

	test("trajectory receives closed metadata only and trajectory errors are non-echoing", async () => {
		const api = await loadApi();
		const state = fakeStore();
		let observed: any;
		const result = await api.requestApprovalV1(request(), adapters(state.store, {
			trajectory: async (metadata: unknown) => { observed = metadata; },
		}));
		expect(result.ok).toBe(true);
		expect(Object.keys(observed).sort()).toEqual([
			"approvalKind", "code", "decidedAt", "decision", "event", "expiresAt", "generation",
			"headSha", "requestId", "schemaVersion", "scopeFingerprint", "sessionId",
		].sort());
		expect(JSON.stringify(observed)).not.toContain("review-candidate");
		expect(JSON.stringify(observed)).not.toContain("production-write");
		expect(JSON.stringify(observed)).not.toContain("src/a.ts");
		expect(Object.isFrozen(observed)).toBe(true);

		const failed = await api.requestApprovalV1(
			request({ requestId: "apr-trajectory-failure" }),
			adapters(state.store, { trajectory: async () => { throw new Error(SECRET); } }),
		);
		expect(failed).toMatchObject({ ok: false, outcome: "unavailable", code: "APR01_TRAJECTORY_UNAVAILABLE" });
		expect(JSON.stringify(failed)).not.toContain(SECRET);
	});

	test("hostile getters are not invoked and failures are deeply frozen", async () => {
		const api = await loadApi();
		let invoked = 0;
		const hostile = request();
		Object.defineProperty(hostile, "confirmed", {
			enumerable: true,
			get() { invoked += 1; throw new Error(SECRET); },
		});
		const result = api.normalizeApprovalRequestV1(hostile);
		expect(result).toMatchObject({ ok: false, code: "APR01_INVALID_REQUEST" });
		expect(invoked).toBe(0);
		expect(Object.isFrozen(result)).toBe(true);
		expect(JSON.stringify(result)).not.toContain(SECRET);
	});

	test("missing approval authority is non-passing", async () => {
		const api = await loadApi();
		const state = fakeStore();
		const checked = await api.checkApprovalAuthorityV1(request(), {
			clock: () => NOW,
			lifecycle: { active: true, sessionId: "session-apr-01", generation: 1 },
			store: state.store,
		});
		expect(checked).toMatchObject({
			ok: false,
			outcome: "unavailable",
			code: "APR01_APPROVAL_AUTHORITY_MISSING",
		});
	});

	test("public approval metadata grants approval-only and exposes no adjacent authority", async () => {
		const api = await loadApi();
		const saved = await persistDecision(api, "approved");
		expect(saved.result.authority).toBe("apr-01");
		expect(saved.result.authorityScope).toBe("approval-only");
		expect(saved.result).not.toHaveProperty("merge");
		expect(saved.result).not.toHaveProperty("worktree");
		expect(saved.result).not.toHaveProperty("bdd");
		expect(saved.result).not.toHaveProperty("security");
		expect(saved.result).not.toHaveProperty("execute");
		expect(Object.isFrozen(saved.result)).toBe(true);
	});
});
