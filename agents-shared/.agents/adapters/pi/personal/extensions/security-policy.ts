import {
	captureOperatorRequestedPathsV1,
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

type EventFieldV1 =
	| Readonly<{ state: "absent" }>
	| Readonly<{ state: "present"; value: unknown }>
	| Readonly<{ state: "invalid" }>;

function readEventFieldV1(event: unknown, key: string): EventFieldV1 {
	try {
		if (!event || typeof event !== "object" || Array.isArray(event)) return Object.freeze({ state: "invalid" });
		const descriptor = Object.getOwnPropertyDescriptor(event, key);
		if (!descriptor) return Object.freeze({ state: "absent" });
		if (!("value" in descriptor) || !descriptor.enumerable) return Object.freeze({ state: "invalid" });
		if (descriptor.value === undefined) return Object.freeze({ state: "absent" });
		return Object.freeze({ state: "present", value: descriptor.value });
	} catch {
		return Object.freeze({ state: "invalid" });
	}
}

function safeToolName(event: unknown): string | undefined {
	const primary = readEventFieldV1(event, "toolName");
	const legacy = primary.state === "absent" ? readEventFieldV1(event, "tool_name") : primary;
	if (legacy.state !== "present") return undefined;
	const candidate = legacy.value;
	if (typeof candidate === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(candidate)) return candidate;
	return undefined;
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
	const safeContent = content === undefined
		? [{ type: "text", text: "" }]
		: Array.isArray(content)
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
	if (!safeDetails.securityPolicy) safeDetails.securityPolicy = { ok: true, toolName };
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

		pi.on("input", (event: unknown) => {
			const text = eventData(event, "text");
			if (state.sandboxCapability !== undefined && typeof text === "string") {
				captureOperatorRequestedPathsV1(state.sandboxCapability, text);
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
			const errorField = readEventFieldV1(event, "isError");
			const contentField = readEventFieldV1(event, "content");
			const detailsField = readEventFieldV1(event, "details");
			const toolName = safeToolName(event);
			if (errorField.state !== "present" || typeof errorField.value !== "boolean" || !toolName) {
				return deepFreezeResult({
					isError: true,
					content: [{ type: "text", text: "security-policy: redaction-refused" }],
					details: { securityPolicy: { ok: false, code: "redaction-refused" } },
				});
			}
			const isError = errorField.value;
			if (contentField.state === "invalid") {
				return deepFreezeResult({
					isError: true,
					content: [{ type: "text", text: "security-policy: content-redaction-refused" }],
					details: { securityPolicy: { ok: false, code: "content-redaction-refused" } },
				});
			}
			const normalizedResult: PlainRecord = {};
			if (contentField.state === "present") normalizedResult.content = contentField.value;
			if (detailsField.state === "present") normalizedResult.details = detailsField.value;
			else if (detailsField.state === "invalid") {
				const detailsRefusal: PlainRecord = {};
				Object.defineProperty(detailsRefusal, "details", { enumerable: true, get() { return undefined; } });
				normalizedResult.details = detailsRefusal;
			}
			const result = prepareSecurityToolResultV1({
				isError,
				toolName,
				result: normalizedResult,
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
