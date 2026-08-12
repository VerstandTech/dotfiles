import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const EXTENSION_URL = new URL("../../extensions/security-policy.ts", import.meta.url).href;
const EXTENSION_SOURCE = new URL("../../extensions/security-policy.ts", import.meta.url);
const CORE_URL = new URL("./trust-policy.ts", import.meta.url).href;
const POLICY_FINGERPRINT = "a".repeat(64);
const CANDIDATE_SHA = "c".repeat(64);
const WORKTREE = "/workspace/project";
const SESSION_TEMP = "/tmp/pi-sec01/session-001";
const HOME = "/Users/operator";
const SYNTHETIC_SECRET = "sec01-extension-secret-DO-NOT-ECHO";

type Handler = (event: any, context?: any) => unknown;
type ExtensionApi = {
	securityPolicyExtension: (pi: FakePi) => void;
	createSecurityPolicyExtensionV1: (options: Record<string, unknown>) => (pi: FakePi) => void;
};
type FakePi = {
	on: (event: string, handler: Handler) => void;
};

async function loadExtension(): Promise<ExtensionApi> {
	try {
		const module = await import(EXTENSION_URL) as Record<string, unknown>;
		if (
			typeof module.securityPolicyExtension !== "function" ||
			typeof module.createSecurityPolicyExtensionV1 !== "function"
		) throw new Error("SEC01_SECURITY_EXTENSION_API_MISSING");
		return module as unknown as ExtensionApi;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/cannot find|module not found|resolve/i.test(message)) {
			throw new Error("SEC01_SECURITY_EXTENSION_MODULE_MISSING");
		}
		throw error;
	}
}

async function loadCore(): Promise<Record<string, any>> {
	try {
		return await import(CORE_URL) as Record<string, any>;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/cannot find|module not found|resolve/i.test(message)) {
			throw new Error("SEC01_TRUST_POLICY_MODULE_MISSING");
		}
		throw error;
	}
}

function observation(over: Record<string, unknown> = {}) {
	return {
		provider: "sandbox-runtime",
		platform: "darwin",
		sessionId: "session-001",
		policyFingerprint: POLICY_FINGERPRINT,
		worktreeRoot: WORKTREE,
		sessionTempRoot: SESSION_TEMP,
		homeRoot: HOME,
		initialized: true,
		active: true,
		features: {
			processTree: true,
			denyRead: true,
			allowWrite: true,
			denyNetwork: true,
			redirectRecheck: true,
			dnsRebindingDefense: true,
			lifecycleReset: true,
			workspaceMountPolicy: true,
		},
		allowedCommands: [["git", "status", "--short"]],
		allowedDomains: ["api.x.ai"],
		allowedPorts: [443],
		...over,
	};
}

function fakePi() {
	const handlers = new Map<string, Handler[]>();
	const pi: FakePi = {
		on(event, handler) {
			const current = handlers.get(event) ?? [];
			current.push(handler);
			handlers.set(event, current);
		},
	};
	return {
		pi,
		handlers,
		async emit(event: string, payload: unknown = {}, context: unknown = {}) {
			let result: unknown;
			for (const handler of handlers.get(event) ?? []) result = await handler(payload, context);
			return result;
		},
	};
}

function context() {
	const statuses: Array<[string, string | undefined]> = [];
	const notifications: Array<[string, string | undefined]> = [];
	return {
		statuses,
		notifications,
		ctx: {
			cwd: WORKTREE,
			ui: {
				setStatus(key: string, value: string | undefined) {
					statuses.push([key, value]);
				},
				notify(message: string, level?: string) {
					notifications.push([message, level]);
				},
			},
		},
	};
}

function safeReadRequest(state: any, requestedPath = `${WORKTREE}/src/index.ts`) {
	return {
		profile: state.profile,
		runtime: { kind: "fleet-child", role: "fleet-reviewer" },
		policyFingerprint: POLICY_FINGERPRINT,
		candidateSha: CANDIDATE_SHA,
		sandboxCapability: state.sandboxCapability,
		action: {
			kind: "read",
			facts: {
				requestedPath,
				resolvedPath: requestedPath,
				resolvedParentPath: requestedPath.replace(/\/[^/]+$/, ""),
				fileKind: "regular",
				linkCount: 1,
				symlink: false,
				factsCurrent: true,
			},
		},
	};
}

describe("SEC-01 security-policy extension", () => {
	test("exports one thin lifecycle adapter without embedding or installing a sandbox backend", async () => {
		const api = await loadExtension();
		expect(typeof api.securityPolicyExtension).toBe("function");
		expect(typeof api.createSecurityPolicyExtensionV1).toBe("function");
		const source = readFileSync(EXTENSION_SOURCE, "utf8");
		for (const forbidden of [
			"@anthropic-ai/sandbox-runtime",
			"@earendil-works/gondolin",
			"bun add",
			"npm install",
			"@latest",
			"child_process",
			"Bun.spawn",
			"process.env",
		]) expect(source).not.toContain(forbidden);
	});

	test("registers one start shutdown tool-call and tool-result hook without timers or writers", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "interactive" },
			buildPolicyRequest: () => undefined,
		})(harness.pi);
		expect([...harness.handlers.keys()].sort()).toEqual([
			"session_shutdown",
			"session_start",
			"tool_call",
			"tool_result",
		]);
		for (const handlers of harness.handlers.values()) expect(handlers).toHaveLength(1);
	});

	test("strict initialization failure blocks protected tool calls instead of warning and continuing", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict" },
			initializeSandbox: async () => { throw new Error(SYNTHETIC_SECRET); },
			buildPolicyRequest: (_event: unknown, _ctx: unknown, state: unknown) => safeReadRequest(state),
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		const result = await harness.emit("tool_call", { toolName: "read", input: { path: `${WORKTREE}/src/index.ts` } }, view.ctx);
		expect(result).toEqual({ block: true, reason: "sandbox-initialization-failed" });
		expect(JSON.stringify({ result, statuses: view.statuses, notifications: view.notifications })).not.toContain(SYNTHETIC_SECRET);
	});

	test("invalid profile authority blocks instead of silently falling back to interactive", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		let built = 0;
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict", force: true },
			buildPolicyRequest: () => { built += 1; return undefined; },
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		expect(await harness.emit("tool_call", { toolName: "read" }, view.ctx)).toEqual({ block: true, reason: "invalid-profile-authority" });
		expect(built).toBe(0);
	});

	test("strict active capability blocks a secret alias and permits a safe observed read", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		let requestedPath = `${WORKTREE}/.env`;
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict" },
			initializeSandbox: async () => observation(),
			buildPolicyRequest: (_event: unknown, _ctx: unknown, state: unknown) => safeReadRequest(state, requestedPath),
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		expect(await harness.emit("tool_call", { toolName: "read", input: { path: requestedPath } }, view.ctx)).toEqual({ block: true, reason: "secret-read-denied" });
		requestedPath = `${WORKTREE}/src/index.ts`;
		expect(await harness.emit("tool_call", { toolName: "read", input: { path: requestedPath } }, view.ctx)).toBeUndefined();
	});

	test("strict extension binds its own profile and capability over a downgraded builder request", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict" },
			initializeSandbox: async () => observation(),
			buildPolicyRequest: () => safeReadRequest({ profile: "interactive", sandboxCapability: undefined }, `${WORKTREE}/.env`),
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		expect(await harness.emit("tool_call", { toolName: "read" }, view.ctx)).toEqual({ block: true, reason: "secret-read-denied" });
	});

	test("strict without a request builder remains fail-closed after successful initialization", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict" },
			initializeSandbox: async () => observation(),
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		expect(await harness.emit("tool_call", { toolName: "bash" }, view.ctx)).toEqual({ block: true, reason: "invalid-policy-input" });
	});

	test("adapter propagates strict command and egress denials end to end", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		let action: Record<string, unknown> = { kind: "command", argv: ["bash", "-lc", "id"] };
		let runtime: Record<string, unknown> = { kind: "gate-command" };
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict" },
			initializeSandbox: async () => observation({ allowedCommands: [["bash", "-lc", "id"]] }),
			buildPolicyRequest: (_event: unknown, _ctx: unknown, state: any) => ({
				profile: "interactive",
				runtime,
				policyFingerprint: POLICY_FINGERPRINT,
				candidateSha: CANDIDATE_SHA,
				sandboxCapability: state.sandboxCapability,
				action,
			}),
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		expect(await harness.emit("tool_call", { toolName: "bash" }, view.ctx)).toEqual({ block: true, reason: "shell-denied" });
		runtime = { kind: "fleet-child", role: "fleet-reviewer" };
		action = { kind: "egress", tool: "xai_web_search", scheme: "https", hostname: "api.x.ai", port: 443, redirects: [] };
		expect(await harness.emit("tool_call", { toolName: "xai_web_search" }, view.ctx)).toEqual({ block: true, reason: "egress-denied" });
	});

	test("overnight rejects missing or forged security gate evidence through the adapter", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "overnight" },
			initializeSandbox: async () => observation(),
			buildPolicyRequest: (_event: unknown, _ctx: unknown, state: any) => ({
				profile: "interactive",
				runtime: { kind: "gate-command" },
				policyFingerprint: POLICY_FINGERPRINT,
				candidateSha: CANDIDATE_SHA,
				sandboxCapability: state.sandboxCapability,
				securityInventoryFingerprint: "b".repeat(64),
				securityGateEvidence: {},
				action: { kind: "command", argv: ["git", "status", "--short"] },
			}),
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		expect(await harness.emit("tool_call", { toolName: "bash" }, view.ctx)).toEqual({ block: true, reason: "required-security-gate-unavailable" });
	});

	test("tool-result interception replaces raw success and failure output with RED-01-safe content", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "interactive" },
			buildPolicyRequest: () => undefined,
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		for (const isError of [false, true]) {
			const result = await harness.emit("tool_result", {
				toolName: "synthetic-tool",
				isError,
				content: [{ type: "text", text: `Authorization: Bearer ${SYNTHETIC_SECRET}` }],
				details: { password: SYNTHETIC_SECRET },
			}, view.ctx);
			expect(result).toEqual(expect.objectContaining({
				isError,
				content: [expect.objectContaining({ type: "text", text: expect.any(String) })],
				details: expect.objectContaining({ securityPolicy: { ok: true, toolName: "synthetic-tool" } }),
			}));
			expect(result.content[0].text).not.toStartWith("{\"content\":");
			expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
		}
	});

	test("SECUX01_ADAPTER_ABSENT_DETAILS: safe content remains visible without optional details", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "interactive" },
			buildPolicyRequest: () => undefined,
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		const result = await harness.emit("tool_result", {
			toolName: "bdd_status",
			isError: false,
			content: [{ type: "text", text: "BDD: verify" }],
		}, view.ctx);
		expect(result).toEqual({
			isError: false,
			content: [{ type: "text", text: "BDD: verify" }],
			details: { securityPolicy: { ok: true, toolName: "bdd_status" } },
		});
	});

	test("SECUX01_ADAPTER_DETAILS_ISOLATION: hostile details do not hide safe content", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "interactive" },
			buildPolicyRequest: () => undefined,
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		const details: Record<string, unknown> = { value: SYNTHETIC_SECRET };
		details.self = details;
		const result = await harness.emit("tool_result", {
			toolName: "bash",
			isError: false,
			content: [{ type: "text", text: "12 tests passed" }],
			details,
		}, view.ctx);
		expect(result).toEqual({
			isError: false,
			content: [{ type: "text", text: "12 tests passed" }],
			details: { securityPolicy: { ok: false, code: "details-redaction-refused" } },
		});
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.content)).toBe(true);
		expect(Object.isFrozen(result.details)).toBe(true);
		expect(Object.isFrozen(result.details.securityPolicy)).toBe(true);
		expect(() => {
			(result.details.securityPolicy as { ok: boolean }).ok = true;
		}).toThrow();
	});

	test("SECUX01_ADAPTER_ACCESSOR: optional getters are never invoked", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "interactive" },
			buildPolicyRequest: () => undefined,
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		let reads = 0;
		const event: Record<string, unknown> = { toolName: "read", isError: false };
		Object.defineProperty(event, "details", { enumerable: true, get() { reads += 1; return SYNTHETIC_SECRET; } });
		const result = await harness.emit("tool_result", event, view.ctx);
		expect(reads).toBe(0);
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
	});

	test("content redaction refusal replaces primary output with one non-echoing stable failure", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "interactive" },
			buildPolicyRequest: () => undefined,
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		const cyclic: Record<string, unknown> = { value: SYNTHETIC_SECRET };
		cyclic.self = cyclic;
		const result = await harness.emit("tool_result", {
			toolName: "synthetic-tool",
			isError: true,
			content: cyclic,
		}, view.ctx);
		expect(result).toEqual({
			isError: true,
			content: [{ type: "text", text: "security-policy: content-redaction-refused" }],
			details: { securityPolicy: { ok: false, code: "content-redaction-refused" } },
		});
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
	});

	test("repeated start and shutdown dispose each capability internally exactly once", async () => {
		const api = await loadExtension();
		const core = await loadCore();
		const harness = fakePi();
		const view = context();
		let initialized = 0;
		let disposed = 0;
		let observedCapability: unknown;
		api.createSecurityPolicyExtensionV1({
			profileInput: { machineProfile: "strict" },
			initializeSandbox: async () => observation({ sessionId: `session-${++initialized}` }),
			disposeSandbox: () => { disposed += 1; },
			buildPolicyRequest: (_event: unknown, _ctx: unknown, state: any) => {
				observedCapability = state.sandboxCapability;
				return safeReadRequest(state);
			},
		})(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		await harness.emit("session_start", {}, view.ctx);
		expect(initialized).toBe(2);
		expect(disposed).toBe(1);
		await harness.emit("tool_call", { toolName: "read" }, view.ctx);
		const lastCapability = observedCapability;
		await harness.emit("session_shutdown", {}, view.ctx);
		await harness.emit("session_shutdown", {}, view.ctx);
		expect(disposed).toBe(2);
		expect(core.evaluateSecurityPolicyV1(safeReadRequest({ profile: "strict", sandboxCapability: lastCapability }))).toEqual({ ok: false, code: "sandbox-capability-stale" });
		await harness.emit("session_start", {}, view.ctx);
		expect(initialized).toBe(3);
		expect(await harness.emit("tool_call", { toolName: "read" }, view.ctx)).toBeUndefined();
	});

	test("publishes a dependency-neutral V1 security template and fail-closed operator guidance", () => {
		const template = JSON.parse(readFileSync(new URL("../../templates/security-policy.v1.json", import.meta.url), "utf8"));
		expect(template).toEqual(expect.objectContaining({
			schemaVersion: 1,
			defaultProfile: "interactive",
			backend: expect.objectContaining({ provider: "sandbox-runtime" }),
			securityGates: { requiredOvernight: ["secret", "sast", "sca", "license"] },
		}));
		expect(template.backend).not.toHaveProperty("packageVersion");
		expect(template).not.toHaveProperty("unsafe");
		expect(template).not.toHaveProperty("force");
		const guide = readFileSync(new URL("../../docs/security-policy.md", import.meta.url), "utf8");
		expect(guide).toContain("G7 remains unavailable");
		expect(guide).toContain("does not install or pin");
		expect(guide).toContain("interactive-untrusted");
		expect(guide).toContain("sandbox-initialization-failed");
		expect(guide).not.toContain(SYNTHETIC_SECRET);
	});

	test("default installation remains explicit interactive compatibility and owns no adjacent action", async () => {
		const api = await loadExtension();
		const harness = fakePi();
		const view = context();
		api.securityPolicyExtension(harness.pi);
		await harness.emit("session_start", {}, view.ctx);
		const statusText = JSON.stringify(view.statuses);
		expect(statusText).toContain("interactive-untrusted");
		for (const event of ["worktree_create", "approval", "fleet_dispatch", "merge", "package_install", "notification", "persistence"]) {
			expect(harness.handlers.has(event)).toBe(false);
		}
	});
});
