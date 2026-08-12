import {
	createSandboxCapabilityV1,
	disposeSandboxCapabilityV1,
	evaluateSecurityPolicyV1,
	prepareSecurityToolResultV1,
	resolveEffectiveTrustProfileV1,
} from "../lib/security/trust-policy.ts";

type PlainRecord = Record<string, unknown>;
type ExtensionState = {
	profile: "interactive" | "strict" | "overnight";
	sandboxCapability?: unknown;
	initializationCode?: string;
};

type SecurityPolicyExtensionOptions = {
	profileInput?: unknown;
	initializeSandbox?: (context: unknown, profile: string) => unknown | Promise<unknown>;
	disposeSandbox?: (capability: unknown) => unknown | Promise<unknown>;
	buildPolicyRequest?: (
		event: unknown,
		context: unknown,
		state: Readonly<ExtensionState>,
	) => unknown;
};

type PiLike = {
	on: (event: string, handler: (event: unknown, context?: unknown) => unknown) => unknown;
};

function safeCode(value: unknown, fallback: string): string {
	if (value && typeof value === "object") {
		try {
			const descriptor = Object.getOwnPropertyDescriptor(value, "code");
			if (descriptor && "value" in descriptor && typeof descriptor.value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(descriptor.value)) {
				return descriptor.value;
			}
		} catch {
			return fallback;
		}
	}
	return fallback;
}

function eventData(value: unknown, key: string): unknown {
	if (!value || typeof value !== "object") return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

function setStatus(context: unknown, value: string | undefined): void {
	if (!context || typeof context !== "object") return;
	try {
		const ui = eventData(context, "ui");
		const setStatusValue = eventData(ui, "setStatus");
		if (typeof setStatusValue === "function") {
			setStatusValue.call(ui, "security-policy", value);
		}
	} catch {
		// Status is advisory; enforcement state remains fail-closed.
	}
}

function safeToolName(event: unknown): string {
	const candidate = eventData(event, "toolName") ?? eventData(event, "tool_name") ?? "unknown-tool";
	if (typeof candidate === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(candidate)) return candidate;
	return "unknown-tool";
}

function deepFreezeResult<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && "value" in descriptor) deepFreezeResult(descriptor.value);
	}
	return value;
}

function safeText(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "null";
	} catch {
		return "security-policy: redaction-refused";
	}
}

function safeToolResultParts(value: unknown, toolName: string): { content: unknown[]; details: PlainRecord } {
	const content = eventData(value, "content");
	const details = eventData(value, "details");
	const safeContent = Array.isArray(content)
		? content
		: [{ type: "text", text: safeText(content) }];
	const safeDetails: PlainRecord = {};
	if (details && typeof details === "object" && !Array.isArray(details)) {
		try {
			if (Object.getPrototypeOf(details) === Object.prototype) {
				for (const key of Reflect.ownKeys(details)) {
					if (typeof key !== "string") continue;
					const descriptor = Object.getOwnPropertyDescriptor(details, key);
					if (descriptor && "value" in descriptor && descriptor.enumerable) safeDetails[key] = descriptor.value;
				}
			}
		} catch {
			// RED-01 returned safe data; an unexpected shape is omitted, never echoed.
		}
	}
	safeDetails.securityPolicy = { ok: true, toolName };
	return { content: safeContent, details: safeDetails };
}

function bindPolicyRequest(value: unknown, state: ExtensionState): PlainRecord | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	try {
		if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
		const result: PlainRecord = {};
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") return undefined;
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
			result[key] = descriptor.value;
		}
		result.profile = state.profile;
		if (state.sandboxCapability === undefined) delete result.sandboxCapability;
		else result.sandboxCapability = state.sandboxCapability;
		return result;
	} catch {
		return undefined;
	}
}

export function createSecurityPolicyExtensionV1(options: SecurityPolicyExtensionOptions = {}) {
	return (pi: PiLike): void => {
		let state: ExtensionState = { profile: "interactive" };

		const releaseCapability = async (): Promise<void> => {
			const capability = state.sandboxCapability;
			if (capability === undefined) return;
			state.sandboxCapability = undefined;
			try {
				if (typeof options.disposeSandbox === "function") await options.disposeSandbox(capability);
			} catch {
				// The package-owned process-local capability is still invalidated below.
			} finally {
				disposeSandboxCapabilityV1(capability);
			}
		};

		pi.on("session_start", async (_event: unknown, context: unknown) => {
			await releaseCapability();
			const profileResult = resolveEffectiveTrustProfileV1(options.profileInput ?? { machineProfile: "interactive" });
			if (eventData(profileResult, "ok") !== true) {
				const code = safeCode(profileResult, "invalid-profile-authority");
				state = { profile: "interactive", initializationCode: code };
				setStatus(context, `security-policy: ${code}`);
				return;
			}
			const profileValue = eventData(profileResult, "profile");
			const profile = profileValue === "strict" || profileValue === "overnight" ? profileValue : "interactive";
			state = { profile };
			if (profile === "interactive") {
				setStatus(context, "security-policy: interactive-untrusted");
				return;
			}
			if (typeof options.initializeSandbox !== "function") {
				state.initializationCode = "sandbox-required";
				setStatus(context, "security-policy: sandbox-required");
				return;
			}
			try {
				const observation = await options.initializeSandbox(context, profile);
				const created = createSandboxCapabilityV1(observation);
				if (eventData(created, "ok") !== true) {
					const code = safeCode(created, "sandbox-initialization-failed");
					state.initializationCode = code;
					setStatus(context, `security-policy: ${code}`);
					return;
				}
				state.sandboxCapability = eventData(created, "capability");
				setStatus(context, `security-policy: ${profile}`);
			} catch {
				state.initializationCode = "sandbox-initialization-failed";
				setStatus(context, "security-policy: sandbox-initialization-failed");
			}
		});

		pi.on("tool_call", async (event: unknown, context: unknown) => {
			if (state.initializationCode) {
				return { block: true, reason: state.initializationCode };
			}
			if (typeof options.buildPolicyRequest !== "function") {
				return state.profile === "interactive" ? undefined : { block: true, reason: "invalid-policy-input" };
			}
			let request: unknown;
			try {
				request = await options.buildPolicyRequest(event, context, Object.freeze({ ...state }));
			} catch {
				return { block: true, reason: "invalid-policy-input" };
			}
			if (request === undefined) return state.profile === "interactive" ? undefined : { block: true, reason: "invalid-policy-input" };
			const boundRequest = bindPolicyRequest(request, state);
			if (!boundRequest) return { block: true, reason: "invalid-policy-input" };
			const decision = evaluateSecurityPolicyV1(boundRequest);
			if (eventData(decision, "ok") !== true) return { block: true, reason: safeCode(decision, "invalid-policy-input") };
			return undefined;
		});

		pi.on("tool_result", async (event: unknown) => {
			const isError = eventData(event, "isError") === true;
			const toolName = safeToolName(event);
			const result = prepareSecurityToolResultV1({
				isError,
				toolName,
				result: {
					content: eventData(event, "content"),
					details: eventData(event, "details"),
				},
			});
			if (eventData(result, "ok") !== true) {
				const code = eventData(result, "code") === "content-redaction-refused"
					? "content-redaction-refused"
					: "redaction-refused";
				return deepFreezeResult({
					isError: true,
					content: [{ type: "text", text: `security-policy: ${code}` }],
					details: { securityPolicy: { ok: false, code } },
				});
			}
			const safe = safeToolResultParts(eventData(result, "value"), toolName);
			if (eventData(result, "detailsRefused") === true) {
				safe.details = { securityPolicy: { ok: false, code: "details-redaction-refused" } };
			}
			return deepFreezeResult({
				isError,
				content: safe.content,
				details: safe.details,
			});
		});

		pi.on("session_shutdown", async (_event: unknown, context: unknown) => {
			await releaseCapability();
			state = { profile: "interactive" };
			setStatus(context, undefined);
		});
	};
}

export const securityPolicyExtension = createSecurityPolicyExtensionV1({
	profileInput: { machineProfile: "interactive" },
	buildPolicyRequest: () => undefined,
});

export default securityPolicyExtension;
