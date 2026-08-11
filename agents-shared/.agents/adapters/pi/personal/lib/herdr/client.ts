import { checkHerdrCompatibility } from "../../extensions/herd/herd-compat.ts";
import { CONTRACT_LIMITS_V1 } from "../contracts/limits.ts";

export const HERDR_CLIENT_LIMITS_V1 = Object.freeze({
	maxSchemaBytes: 512 * 1024,
	maxOutputBytes: CONTRACT_LIMITS_V1.maxSerializedBytes,
	maxArgvBytes: 16_384,
	maxReadLines: 500,
	maxTimeoutMs: 300_000,
});

const MAX_VERSION_BYTES = 4_096;
const MAX_TARGET_LENGTH = 128;
const MAX_NATIVE_ARGS = 64;
const MAX_TITLE_LENGTH = 256;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const STATES = ["idle", "working", "blocked", "done", "unknown"] as const;
const STATE_SET = new Set<string>(STATES);
const SOURCES = new Set(["visible", "recent", "recent-unwrapped", "detection"]);
const FORMATS = new Set(["text", "ansi"]);
const POSITIONS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const SOUNDS = new Set(["none", "done", "request"]);
const NOTIFICATION_REASONS = new Set([
	"shown",
	"disabled",
	"rate_limited",
	"no_foreground_client",
	"busy",
]);

export type HerdrExecutorReportV1 = {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	aborted: boolean;
};

export type HerdrExecutorCallV1 = {
	argv: readonly string[];
	timeoutMs: number;
	signal?: AbortSignal;
};

export type HerdrArgvExecutorV1 = (
	call: HerdrExecutorCallV1,
) => Promise<unknown>;

export type HerdrClientV1 = Readonly<{
	version: 1;
	kind: "herdr-client";
	compatibility: Readonly<{
		runtime: "0.8.x";
		observedVersion: string;
		protocol: 19;
		schemaVersion: 1;
	}>;
}>;

type PlainRecord = Record<string, unknown>;
type StableCode =
	| "outside-herdr"
	| "invalid-environment"
	| "invalid-executor"
	| "executor-failed"
	| "incompatible-runtime"
	| "incompatible-protocol"
	| "incompatible-schema"
	| "compatibility-unknown"
	| "bounds"
	| "invalid-client"
	| "invalid-operation"
	| "invalid-agent-name"
	| "invalid-target"
	| "invalid-path"
	| "invalid-lines"
	| "invalid-timeout"
	| "invalid-native-args"
	| "invalid-executor-report"
	| "malformed-envelope"
	| "mismatched-envelope"
	| "inconsistent-executor-report"
	| "duplicate-pane-id"
	| "mismatched-target"
	| "missing-pane-id"
	| "not-found"
	| "cli-error";

type RequestKind =
	| "agent-list"
	| "agent-get"
	| "agent-read"
	| "agent-wait"
	| "worktree-create"
	| "agent-start"
	| "agent-prompt"
	| "notification-show";

type OperationKind = "doctor" | "build" | RequestKind | "unknown";

type Refusal = { readonly code: StableCode };

const EXECUTORS = new WeakMap<object, HerdrArgvExecutorV1>();

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (typeof value !== "object" || value === null || seen.has(value)) return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
	}
	return Object.freeze(value);
}

function outcome(
	kind: "timeout" | "aborted" | "unavailable" | "refused",
	operation: OperationKind,
	code?: StableCode,
) {
	return deepFreeze({
		version: 1 as const,
		kind,
		operation,
		...(code === undefined ? {} : { code }),
	});
}

function completed(operation: OperationKind, value: unknown) {
	return deepFreeze({ version: 1 as const, kind: "completed" as const, operation, value });
}

function lifecycle(
	kind: "completed" | "working" | "blocked" | "unknown",
	operation: OperationKind,
	value: unknown,
) {
	return deepFreeze({ version: 1 as const, kind, operation, value });
}

function getPrototype(value: object): object | null | Refusal {
	try {
		return Object.getPrototypeOf(value);
	} catch {
		return { code: "invalid-operation" };
	}
}

function plainObject(value: unknown): value is PlainRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = getPrototype(value);
	return prototype === Object.prototype;
}

function ownData(
	record: PlainRecord,
	key: string,
): { present: false } | { present: true; value: unknown } | Refusal {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(record, key);
		if (!descriptor) return { present: false };
		if (!("value" in descriptor) || !descriptor.enumerable) return { code: "invalid-operation" };
		return { present: true, value: descriptor.value };
	} catch {
		return { code: "invalid-operation" };
	}
}

function strictRecord(
	value: unknown,
	allowed: readonly string[],
): PlainRecord | Refusal {
	if (!plainObject(value)) return { code: "invalid-operation" };
	let keys: (string | symbol)[];
	try {
		keys = Reflect.ownKeys(value);
	} catch {
		return { code: "invalid-operation" };
	}
	const allowedSet = new Set(allowed);
	for (const key of keys) {
		if (typeof key !== "string" || !allowedSet.has(key)) return { code: "invalid-operation" };
		const descriptor = ownData(value, key);
		if ("code" in descriptor) return descriptor;
	}
	return value;
}

function readValue(record: PlainRecord, key: string): unknown {
	const descriptor = ownData(record, key);
	if ("code" in descriptor || !descriptor.present) return undefined;
	return descriptor.value;
}

function isRefusal(value: unknown): value is Refusal {
	return plainObject(value) && typeof readValue(value, "code") === "string";
}

type ValidatedSignal = { signal?: AbortSignal; aborted: boolean };

function validateSignal(value: unknown): ValidatedSignal | Refusal {
	if (value === undefined) return { aborted: false };
	try {
		if (
			typeof AbortSignal === "undefined" ||
			!(value instanceof AbortSignal) ||
			Object.getPrototypeOf(value) !== AbortSignal.prototype
		) return { code: "invalid-operation" };
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted");
		if (!descriptor?.get) return { code: "invalid-operation" };
		const aborted = descriptor.get.call(value);
		if (typeof aborted !== "boolean") return { code: "invalid-operation" };
		return { signal: value, aborted };
	} catch {
		return { code: "invalid-operation" };
	}
}

function validateExecutionOptions(value: unknown): ValidatedSignal | Refusal {
	if (value === undefined) return { aborted: false };
	const record = strictRecord(value, ["signal"]);
	if ("code" in record) return { code: "invalid-operation" };
	return validateSignal(readValue(record, "signal"));
}

function validBoundedString(
	value: unknown,
	maxLength: number,
	options: { leadingHyphen?: boolean; empty?: boolean; controls?: boolean } = {},
): value is string {
	if (typeof value !== "string") return false;
	if (!options.empty && value.length === 0) return false;
	if (value.length > maxLength) return false;
	if (!options.controls && CONTROL.test(value)) return false;
	if (!options.leadingHyphen && value.startsWith("-")) return false;
	try {
		if (value.normalize("NFC") !== value) return false;
	} catch {
		return false;
	}
	return true;
}

function validTarget(value: unknown): value is string {
	return validBoundedString(value, MAX_TARGET_LENGTH);
}

function validAgentName(value: unknown): value is string {
	return typeof value === "string" && AGENT_NAME.test(value);
}

function validAbsolutePath(value: unknown): value is string {
	if (!validBoundedString(value, CONTRACT_LIMITS_V1.maxPathLength)) return false;
	if (!value.startsWith("/") || value === "/" || value.startsWith("//")) return false;
	if (value.includes("\\") || value.endsWith("/")) return false;
	const segments = value.slice(1).split("/");
	return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validRef(value: unknown): value is string {
	if (!validBoundedString(value, MAX_TARGET_LENGTH)) return false;
	if (
		value.startsWith(".") ||
		value.endsWith(".") ||
		value.endsWith("/") ||
		value.includes("..") ||
		value.includes("@{") ||
		value.includes("//") ||
		/[ ~^:?*[\\]/.test(value)
	) return false;
	return value.split("/").every((part) => part.length > 0 && part !== "." && !part.endsWith(".lock"));
}

function integerIn(value: unknown, minimum: number, maximum: number): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function strictStringArray(
	value: unknown,
	options: { maxItems: number; itemMax: number; code: StableCode; allowed?: Set<string> },
): string[] | Refusal {
	if (!Array.isArray(value)) return { code: options.code };
	try {
		if (Object.getPrototypeOf(value) !== Array.prototype) return { code: options.code };
		const keys = Reflect.ownKeys(value);
		if (keys.some((key) => typeof key === "symbol")) return { code: options.code };
		if (value.length > options.maxItems) return { code: "bounds" };
		const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
		if (keys.some((key) => typeof key !== "string" || !expected.has(key))) return { code: options.code };
		const result: string[] = [];
		for (let index = 0; index < value.length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return { code: options.code };
			const item = descriptor.value;
			if (!validBoundedString(item, options.itemMax, { leadingHyphen: true })) {
				return { code: typeof item === "string" && item.length > options.itemMax ? "bounds" : options.code };
			}
			if (options.allowed && !options.allowed.has(item)) return { code: options.code };
			result.push(item);
		}
		return result;
	} catch {
		return { code: options.code };
	}
}

function detachRequest(record: PlainRecord): PlainRecord | Refusal {
	const detached: PlainRecord = {};
	try {
		for (const key of Reflect.ownKeys(record)) {
			if (typeof key !== "string") return { code: "invalid-operation" };
			const descriptor = Object.getOwnPropertyDescriptor(record, key);
			if (!descriptor || !("value" in descriptor)) return { code: "invalid-operation" };
			const value = descriptor.value;
			if (Array.isArray(value)) {
				if (Object.getPrototypeOf(value) !== Array.prototype) return { code: "invalid-operation" };
				const copy: unknown[] = [];
				for (let index = 0; index < value.length; index += 1) {
					const item = Object.getOwnPropertyDescriptor(value, String(index));
					if (!item || !("value" in item)) return { code: "invalid-operation" };
					copy.push(item.value);
				}
				detached[key] = copy;
			} else {
				detached[key] = value;
			}
		}
		return detached;
	} catch {
		return { code: "invalid-operation" };
	}
}

function operationName(value: unknown): RequestKind | "unknown" {
	if (!plainObject(value)) return "unknown";
	const kind = readValue(value, "kind");
	if (
		kind === "agent-list" || kind === "agent-get" || kind === "agent-read" ||
		kind === "agent-wait" || kind === "worktree-create" || kind === "agent-start" ||
		kind === "agent-prompt" || kind === "notification-show"
	) return kind;
	return "unknown";
}

function normalizeArgv(argv: string[]): readonly string[] | Refusal {
	if (byteLength(argv.join("\0")) > HERDR_CLIENT_LIMITS_V1.maxArgvBytes) return { code: "bounds" };
	return Object.freeze([...argv]);
}

type BuiltOperation = Readonly<{
	kind: RequestKind;
	argv: readonly string[];
	timeoutMs: number;
	request: PlainRecord;
}>;

function buildRequest(request: unknown): BuiltOperation | Refusal {
	const kind = operationName(request);
	if (kind === "unknown") return { code: "invalid-operation" };
	let record: PlainRecord | Refusal;
	let argv: string[];
	let timeoutMs = DEFAULT_TIMEOUT_MS;

	switch (kind) {
		case "agent-list": {
			record = strictRecord(request, ["kind"]);
			if (isRefusal(record)) return record;
			argv = ["herdr", "agent", "list"];
			break;
		}
		case "agent-get": {
			record = strictRecord(request, ["kind", "target"]);
			if (isRefusal(record)) return record;
			const target = readValue(record, "target");
			if (!validTarget(target)) return { code: "invalid-target" };
			argv = ["herdr", "agent", "get", target];
			break;
		}
		case "agent-read": {
			record = strictRecord(request, ["kind", "target", "source", "lines", "format"]);
			if (isRefusal(record)) return record;
			const target = readValue(record, "target");
			const source = readValue(record, "source") ?? "recent-unwrapped";
			const lines = readValue(record, "lines") ?? 120;
			const format = readValue(record, "format") ?? "text";
			if (!validTarget(target)) return { code: "invalid-target" };
			if (!SOURCES.has(String(source)) || !FORMATS.has(String(format))) return { code: "invalid-operation" };
			if (!integerIn(lines, 1, HERDR_CLIENT_LIMITS_V1.maxReadLines)) return { code: "invalid-lines" };
			argv = ["herdr", "agent", "read", target, "--source", String(source), "--lines", String(lines), "--format", String(format)];
			break;
		}
		case "agent-wait": {
			record = strictRecord(request, ["kind", "target", "until", "timeoutMs"]);
			if (isRefusal(record)) return record;
			const target = readValue(record, "target");
			const timeout = readValue(record, "timeoutMs") ?? DEFAULT_WAIT_TIMEOUT_MS;
			if (!validTarget(target)) return { code: "invalid-target" };
			if (!integerIn(timeout, 1, HERDR_CLIENT_LIMITS_V1.maxTimeoutMs)) return { code: "invalid-timeout" };
			timeoutMs = timeout;
			argv = ["herdr", "agent", "wait", target];
			const untilValue = readValue(record, "until");
			if (untilValue !== undefined) {
				const until = strictStringArray(untilValue, { maxItems: STATES.length, itemMax: 16, code: "invalid-operation", allowed: STATE_SET });
				if ("code" in until) return until;
				for (const state of [...new Set(until)].sort((a, b) => STATES.indexOf(a as never) - STATES.indexOf(b as never))) {
					argv.push("--until", state);
				}
			}
			argv.push("--timeout", String(timeout));
			break;
		}
		case "worktree-create": {
			record = strictRecord(request, ["kind", "cwd", "branch", "base", "path", "label"]);
			if (isRefusal(record)) return record;
			const cwd = readValue(record, "cwd");
			const branch = readValue(record, "branch");
			if (!validAbsolutePath(cwd)) return { code: "invalid-path" };
			if (!validRef(branch)) return { code: "invalid-operation" };
			argv = ["herdr", "worktree", "create", "--cwd", cwd, "--branch", branch];
			const base = readValue(record, "base");
			if (base !== undefined) {
				if (!validRef(base)) return { code: "invalid-operation" };
				argv.push("--base", base);
			}
			const path = readValue(record, "path");
			if (path !== undefined) {
				if (!validAbsolutePath(path)) return { code: "invalid-path" };
				argv.push("--path", path);
			}
			const label = readValue(record, "label");
			if (label !== undefined) {
				if (!validBoundedString(label, MAX_TITLE_LENGTH)) return { code: typeof label === "string" && label.length > MAX_TITLE_LENGTH ? "bounds" : "invalid-operation" };
				argv.push("--label", label);
			}
			argv.push("--no-focus");
			break;
		}
		case "agent-start": {
			record = strictRecord(request, ["kind", "name", "paneId", "agentKind", "timeoutMs", "nativeArgs"]);
			if (isRefusal(record)) return record;
			const name = readValue(record, "name");
			const paneId = readValue(record, "paneId");
			const agentKind = readValue(record, "agentKind") ?? "pi";
			const timeout = readValue(record, "timeoutMs") ?? DEFAULT_TIMEOUT_MS;
			if (!validAgentName(name)) return { code: "invalid-agent-name" };
			if (!validTarget(paneId)) return { code: "invalid-target" };
			if (agentKind !== "pi") return { code: "invalid-operation" };
			if (!integerIn(timeout, 1, HERDR_CLIENT_LIMITS_V1.maxTimeoutMs)) return { code: "invalid-timeout" };
			timeoutMs = timeout;
			argv = ["herdr", "agent", "start", name, "--kind", "pi", "--pane", paneId, "--timeout", String(timeout)];
			const nativeValue = readValue(record, "nativeArgs");
			if (nativeValue !== undefined) {
				const nativeArgs = strictStringArray(nativeValue, { maxItems: MAX_NATIVE_ARGS, itemMax: CONTRACT_LIMITS_V1.maxCommandLength, code: "invalid-native-args" });
				if ("code" in nativeArgs) return nativeArgs;
				if (nativeArgs.length > 0) argv.push("--", ...nativeArgs);
			}
			break;
		}
		case "agent-prompt": {
			record = strictRecord(request, ["kind", "target", "prompt", "wait", "until", "timeoutMs"]);
			if (isRefusal(record)) return record;
			const target = readValue(record, "target");
			const prompt = readValue(record, "prompt");
			const wait = readValue(record, "wait") ?? true;
			const timeout = readValue(record, "timeoutMs") ?? DEFAULT_WAIT_TIMEOUT_MS;
			if (!validTarget(target)) return { code: "invalid-target" };
			if (!validBoundedString(prompt, CONTRACT_LIMITS_V1.maxStringLength)) return { code: typeof prompt === "string" && prompt.length > CONTRACT_LIMITS_V1.maxStringLength ? "bounds" : "invalid-operation" };
			if (wait !== true) return { code: "invalid-operation" };
			if (!integerIn(timeout, 1, HERDR_CLIENT_LIMITS_V1.maxTimeoutMs)) return { code: "invalid-timeout" };
			timeoutMs = timeout;
			argv = ["herdr", "agent", "prompt", target, prompt, "--wait"];
			const untilValue = readValue(record, "until");
			if (untilValue !== undefined) {
				const until = strictStringArray(untilValue, { maxItems: STATES.length, itemMax: 16, code: "invalid-operation", allowed: STATE_SET });
				if ("code" in until) return until;
				for (const state of [...new Set(until)].sort((a, b) => STATES.indexOf(a as never) - STATES.indexOf(b as never))) {
					argv.push("--until", state);
				}
			}
			argv.push("--timeout", String(timeout));
			break;
		}
		case "notification-show": {
			record = strictRecord(request, ["kind", "title", "body", "position", "sound"]);
			if (isRefusal(record)) return record;
			const title = readValue(record, "title");
			if (!validBoundedString(title, MAX_TITLE_LENGTH)) return { code: typeof title === "string" && title.length > MAX_TITLE_LENGTH ? "bounds" : "invalid-operation" };
			argv = ["herdr", "notification", "show", title];
			const body = readValue(record, "body");
			if (body !== undefined) {
				if (!validBoundedString(body, CONTRACT_LIMITS_V1.maxStringLength)) return { code: typeof body === "string" && body.length > CONTRACT_LIMITS_V1.maxStringLength ? "bounds" : "invalid-operation" };
				argv.push("--body", body);
			}
			const position = readValue(record, "position");
			if (position !== undefined) {
				if (typeof position !== "string" || !POSITIONS.has(position)) return { code: "invalid-operation" };
				argv.push("--position", position);
			}
			const sound = readValue(record, "sound");
			if (sound !== undefined) {
				if (typeof sound !== "string" || !SOUNDS.has(sound)) return { code: "invalid-operation" };
				argv.push("--sound", sound);
			}
			break;
		}
	}

	const normalizedArgv = normalizeArgv(argv);
	if ("code" in normalizedArgv) return normalizedArgv;
	const detachedRequest = detachRequest(record);
	if (isRefusal(detachedRequest)) return detachedRequest;
	return deepFreeze({ kind, argv: normalizedArgv, timeoutMs, request: detachedRequest });
}

function normalizeReport(
	value: unknown,
	stdoutLimit: number,
): HerdrExecutorReportV1 | Refusal {
	const record = strictRecord(value, ["exitCode", "stdout", "stderr", "timedOut", "aborted"]);
	if ("code" in record) return { code: "invalid-executor-report" };
	const exitCode = readValue(record, "exitCode");
	const stdout = readValue(record, "stdout");
	const stderr = readValue(record, "stderr");
	const timedOut = readValue(record, "timedOut");
	const aborted = readValue(record, "aborted");
	if (
		!(exitCode === null || integerIn(exitCode, 0, 255)) ||
		typeof stdout !== "string" || typeof stderr !== "string" ||
		typeof timedOut !== "boolean" || typeof aborted !== "boolean"
	) return { code: "invalid-executor-report" };
	if (
		(timedOut && aborted) ||
		(exitCode === null && !timedOut && !aborted) ||
		(exitCode !== null && (timedOut || aborted))
	) return { code: "invalid-executor-report" };
	if (byteLength(stdout) > stdoutLimit || byteLength(stderr) > HERDR_CLIENT_LIMITS_V1.maxOutputBytes) {
		return { code: "bounds" };
	}
	return { exitCode, stdout, stderr, timedOut, aborted };
}

async function callExecutor(
	executor: HerdrArgvExecutorV1,
	argv: readonly string[],
	timeoutMs: number,
	signal: AbortSignal | undefined,
	stdoutLimit: number,
	operation: OperationKind,
) {
	const signalState = validateSignal(signal);
	if ("code" in signalState) return outcome("refused", operation, signalState.code);
	if (signalState.aborted) return outcome("aborted", operation);
	let raw: unknown;
	try {
		const call = Object.freeze({ argv, timeoutMs, ...(signal === undefined ? {} : { signal }) });
		raw = await executor(call);
	} catch {
		return outcome("unavailable", operation, "executor-failed");
	}
	const normalized = normalizeReport(raw, stdoutLimit);
	if ("code" in normalized) return outcome("refused", operation, normalized.code);
	if (normalized.aborted) return outcome("aborted", operation);
	if (normalized.timedOut) return outcome("timeout", operation);
	return normalized;
}

function isTerminalOutcome(value: unknown): boolean {
	return plainObject(value) && typeof readValue(value, "kind") === "string";
}

function parseJsonRecord(value: string): PlainRecord | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		return plainObject(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function jsonWithinBounds(value: unknown, depth = 0): boolean {
	if (depth > CONTRACT_LIMITS_V1.maxNestingDepth) return false;
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return true;
	}
	if (Array.isArray(value)) {
		if (value.length > CONTRACT_LIMITS_V1.maxArrayLength) return false;
		return value.every((item) => jsonWithinBounds(item, depth + 1));
	}
	if (!plainObject(value)) return false;
	const keys = Object.keys(value);
	if (keys.length > CONTRACT_LIMITS_V1.maxObjectKeys) return false;
	return keys.every((key) => jsonWithinBounds(value[key], depth + 1));
}

function parseVersion(stdout: string): string | undefined {
	const match = /^herdr (\d+\.\d+\.\d+)\s*$/.exec(stdout);
	return match?.[1];
}

function doctorError(report: HerdrExecutorReportV1, operation: OperationKind) {
	if (report.exitCode !== 0 || report.stderr.length > 0) return outcome("unavailable", operation, "executor-failed");
	return undefined;
}

export async function createHerdrClientV1(
	environment: unknown,
	executor: HerdrArgvExecutorV1,
	signal?: AbortSignal,
): Promise<unknown> {
	if (!plainObject(environment)) return outcome("refused", "doctor", "invalid-environment");
	const envDescriptor = ownData(environment, "HERDR_ENV");
	if ("code" in envDescriptor) return outcome("refused", "doctor", "invalid-environment");
	if (!envDescriptor.present) return outcome("unavailable", "doctor", "outside-herdr");
	if (typeof envDescriptor.value !== "string") return outcome("refused", "doctor", "invalid-environment");
	if (envDescriptor.value !== "1") return outcome("unavailable", "doctor", "outside-herdr");
	if (typeof executor !== "function") return outcome("refused", "doctor", "invalid-executor");
	const signalState = validateSignal(signal);
	if ("code" in signalState) return outcome("refused", "doctor", signalState.code);
	const validatedSignal = signalState.signal;

	const versionArgv = Object.freeze(["herdr", "--version"]);
	const versionResult = await callExecutor(executor, versionArgv, DEFAULT_TIMEOUT_MS, validatedSignal, MAX_VERSION_BYTES, "doctor");
	if (isTerminalOutcome(versionResult)) return versionResult;
	const versionReport = versionResult as HerdrExecutorReportV1;
	const versionFailure = doctorError(versionReport, "doctor");
	if (versionFailure) return versionFailure;
	const observedVersion = parseVersion(versionReport.stdout);
	if (!observedVersion) return outcome("unavailable", "doctor", "compatibility-unknown");

	const schemaArgv = Object.freeze(["herdr", "api", "schema", "--json"]);
	const schemaResult = await callExecutor(executor, schemaArgv, DEFAULT_TIMEOUT_MS, validatedSignal, HERDR_CLIENT_LIMITS_V1.maxSchemaBytes, "doctor");
	if (isTerminalOutcome(schemaResult)) return schemaResult;
	const schemaExecution = schemaResult as HerdrExecutorReportV1;
	const schemaFailure = doctorError(schemaExecution, "doctor");
	if (schemaFailure) return schemaFailure;
	const schema = parseJsonRecord(schemaExecution.stdout);
	if (!schema) return outcome("unavailable", "doctor", "compatibility-unknown");
	const protocol = readValue(schema, "protocol");
	const schemaVersion = readValue(schema, "schema_version");
	if (typeof protocol !== "number" || typeof schemaVersion !== "number") {
		return outcome("unavailable", "doctor", "compatibility-unknown");
	}

	const compatibility = checkHerdrCompatibility({
		version: observedVersion,
		protocol,
		schemaVersion,
	});
	if (compatibility.status !== "compatible") {
		if (!/^0\.8\.\d+$/.test(observedVersion)) return outcome("unavailable", "doctor", "incompatible-runtime");
		if (protocol !== 19) return outcome("unavailable", "doctor", "incompatible-protocol");
		if (schemaVersion !== 1) return outcome("unavailable", "doctor", "incompatible-schema");
		return outcome("unavailable", "doctor", "compatibility-unknown");
	}

	const compatibilityValue = deepFreeze({
		runtime: "0.8.x" as const,
		observedVersion,
		protocol: 19 as const,
		schemaVersion: 1 as const,
	});
	const client: HerdrClientV1 = deepFreeze({
		version: 1 as const,
		kind: "herdr-client" as const,
		compatibility: compatibilityValue,
	});
	EXECUTORS.set(client, executor);
	return deepFreeze({
		version: 1 as const,
		kind: "completed" as const,
		operation: "doctor" as const,
		compatibility: compatibilityValue,
		client,
	});
}

export function buildHerdrOperationV1(client: unknown, request: unknown): unknown {
	if (typeof client !== "object" || client === null || !EXECUTORS.has(client)) {
		return outcome("refused", "build", "invalid-client");
	}
	const built = buildRequest(request);
	if ("code" in built) return outcome("refused", operationName(request), built.code);
	return completed("build", {
		kind: built.kind,
		argv: built.argv,
		timeoutMs: built.timeoutMs,
	});
}

function expectedEnvelope(operation: BuiltOperation["kind"]): { id: string; type: string } {
	switch (operation) {
		case "agent-list": return { id: "cli:agent:list", type: "agent_list" };
		case "agent-get": return { id: "cli:agent:get", type: "agent_info" };
		case "agent-read": return { id: "cli:agent:read", type: "pane_read" };
		case "agent-wait": return { id: "cli:agent:wait", type: "agent_info" };
		case "worktree-create": return { id: "cli:worktree:create", type: "worktree_created" };
		case "agent-start": return { id: "cli:agent:start", type: "agent_started" };
		case "agent-prompt": return { id: "cli:agent:prompt", type: "agent_prompted" };
		case "notification-show": return { id: "cli:notification:show", type: "notification_show" };
	}
}

function errorFromReport(report: HerdrExecutorReportV1, built: BuiltOperation) {
	const parsed = parseJsonRecord(report.stderr);
	if (!parsed) return outcome("unavailable", built.kind, "cli-error");
	if (!jsonWithinBounds(parsed)) return outcome("refused", built.kind, "bounds");
	const responseId = readValue(parsed, "id");
	if (typeof responseId !== "string") return outcome("unavailable", built.kind, "cli-error");
	if (responseId !== expectedEnvelope(built.kind).id) return outcome("refused", built.kind, "mismatched-envelope");
	const errorValue = readValue(parsed, "error");
	if (!plainObject(errorValue)) return outcome("unavailable", built.kind, "cli-error");
	const code = readValue(errorValue, "code");
	const message = readValue(errorValue, "message");
	if (typeof code !== "string" || typeof message !== "string") return outcome("unavailable", built.kind, "cli-error");
	if (code === "timeout") return outcome("timeout", built.kind);
	if (code === "agent_not_found") return outcome("unavailable", built.kind, "not-found");
	return outcome("unavailable", built.kind, "cli-error");
}

function strictDecodedRecord(value: unknown): PlainRecord | undefined {
	return plainObject(value) ? value : undefined;
}

function projectAgent(value: unknown): PlainRecord | Refusal {
	const record = strictDecodedRecord(value);
	if (!record) return { code: "malformed-envelope" };
	const paneId = readValue(record, "pane_id");
	if (!validTarget(paneId)) return { code: "missing-pane-id" };
	const statusValue = readValue(record, "agent_status");
	if (typeof statusValue !== "string") return { code: "malformed-envelope" };
	const workspaceId = readValue(record, "workspace_id");
	const tabId = readValue(record, "tab_id");
	const terminalId = readValue(record, "terminal_id");
	const focused = readValue(record, "focused");
	const revision = readValue(record, "revision");
	if (
		!validTarget(workspaceId) || !validTarget(tabId) || !validTarget(terminalId) ||
		typeof focused !== "boolean" || !integerIn(revision, 0, Number.MAX_SAFE_INTEGER)
	) return { code: "malformed-envelope" };
	const name = readValue(record, "name");
	const agent = readValue(record, "agent");
	if (name !== undefined && !validTarget(name)) return { code: "malformed-envelope" };
	if (agent !== undefined && !validBoundedString(agent, 64, { leadingHyphen: true })) return { code: "malformed-envelope" };
	const agentStatus = STATE_SET.has(statusValue) ? statusValue : "unknown";
	return {
		agentStatus,
		paneId,
		workspaceId,
		tabId,
		terminalId,
		focused,
		revision,
		...(name === undefined ? {} : { name }),
		...(agent === undefined ? {} : { agent }),
	};
}

function targetMatches(target: unknown, agent: PlainRecord): boolean {
	if (typeof target !== "string") return false;
	if (target.includes(":")) return agent.paneId === target;
	return agent.name === target;
}

function lifecycleForAgent(operation: BuiltOperation["kind"], agent: PlainRecord) {
	const status = agent.agentStatus;
	if (status === "working") return lifecycle("working", operation, agent);
	if (status === "blocked") return lifecycle("blocked", operation, agent);
	if (status === "unknown") return lifecycle("unknown", operation, agent);
	return lifecycle("completed", operation, agent);
}

function parseSuccess(report: HerdrExecutorReportV1, built: BuiltOperation): unknown {
	if (report.stderr.length > 0) return outcome("refused", built.kind, "inconsistent-executor-report");
	const envelopeValue = parseJsonRecord(report.stdout);
	if (!envelopeValue) return outcome("refused", built.kind, "malformed-envelope");
	if (!jsonWithinBounds(envelopeValue)) return outcome("refused", built.kind, "bounds");
	if (readValue(envelopeValue, "error") !== undefined) {
		return outcome("refused", built.kind, "inconsistent-executor-report");
	}
	const expected = expectedEnvelope(built.kind);
	if (readValue(envelopeValue, "id") !== expected.id) return outcome("refused", built.kind, "mismatched-envelope");
	const result = readValue(envelopeValue, "result");
	if (!plainObject(result)) return outcome("refused", built.kind, "malformed-envelope");
	if (readValue(result, "type") !== expected.type) return outcome("refused", built.kind, "mismatched-envelope");

	switch (built.kind) {
		case "agent-list": {
			const agentsValue = readValue(result, "agents");
			if (!Array.isArray(agentsValue)) return outcome("refused", built.kind, "malformed-envelope");
			if (agentsValue.length > CONTRACT_LIMITS_V1.maxArrayLength) return outcome("refused", built.kind, "bounds");
			const agents: PlainRecord[] = [];
			const paneIds = new Set<string>();
			for (const candidate of agentsValue) {
				const agent = projectAgent(candidate);
				if (isRefusal(agent)) return outcome("refused", built.kind, agent.code);
				if (paneIds.has(agent.paneId as string)) return outcome("refused", built.kind, "duplicate-pane-id");
				paneIds.add(agent.paneId as string);
				agents.push(agent);
			}
			return completed(built.kind, { agents });
		}
		case "agent-get":
		case "agent-wait":
		case "agent-prompt": {
			const agent = projectAgent(readValue(result, "agent"));
			if (isRefusal(agent)) return outcome("refused", built.kind, agent.code);
			const target = readValue(built.request, "target");
			if (!targetMatches(target, agent)) return outcome("refused", built.kind, "mismatched-target");
			return lifecycleForAgent(built.kind, agent);
		}
		case "agent-read": {
			const read = readValue(result, "read");
			if (!plainObject(read)) return outcome("refused", built.kind, "malformed-envelope");
			const paneId = readValue(read, "pane_id");
			const source = readValue(read, "source");
			const format = readValue(read, "format");
			const text = readValue(read, "text");
			const truncated = readValue(read, "truncated");
			const target = readValue(built.request, "target");
			const expectedSource = readValue(built.request, "source") ?? "recent-unwrapped";
			const expectedFormat = readValue(built.request, "format") ?? "text";
			if (paneId !== target || source !== expectedSource || format !== expectedFormat) {
				return outcome("refused", built.kind, "mismatched-target");
			}
			if (typeof text !== "string" || typeof truncated !== "boolean") return outcome("refused", built.kind, "malformed-envelope");
			if (byteLength(text) > HERDR_CLIENT_LIMITS_V1.maxOutputBytes) return outcome("refused", built.kind, "bounds");
			return completed(built.kind, { paneId, source, format, text, truncated });
		}
		case "worktree-create": {
			const rootPane = readValue(result, "root_pane");
			if (!plainObject(rootPane)) return outcome("refused", built.kind, "missing-pane-id");
			const paneId = readValue(rootPane, "pane_id");
			if (!validTarget(paneId)) return outcome("refused", built.kind, "missing-pane-id");
			if (!plainObject(readValue(result, "workspace")) || !plainObject(readValue(result, "tab")) || !plainObject(readValue(result, "worktree"))) {
				return outcome("refused", built.kind, "malformed-envelope");
			}
			return completed(built.kind, { paneId });
		}
		case "agent-start": {
			const agent = projectAgent(readValue(result, "agent"));
			if (isRefusal(agent)) return outcome("refused", built.kind, agent.code);
			const name = readValue(built.request, "name");
			const paneId = readValue(built.request, "paneId");
			if (agent.name !== name || agent.paneId !== paneId) return outcome("refused", built.kind, "mismatched-target");
			const returnedArgv = readValue(result, "argv");
			const normalizedArgv = strictStringArray(returnedArgv, { maxItems: MAX_NATIVE_ARGS, itemMax: CONTRACT_LIMITS_V1.maxCommandLength, code: "malformed-envelope" });
			if ("code" in normalizedArgv) return outcome("refused", built.kind, normalizedArgv.code);
			return lifecycleForAgent(built.kind, { ...agent, argv: normalizedArgv });
		}
		case "notification-show": {
			const shown = readValue(result, "shown");
			const reason = readValue(result, "reason");
			if (typeof shown !== "boolean" || typeof reason !== "string" || !NOTIFICATION_REASONS.has(reason)) {
				return outcome("refused", built.kind, "malformed-envelope");
			}
			if ((reason === "shown") !== shown) return outcome("refused", built.kind, "malformed-envelope");
			return completed(built.kind, { shown, reason });
		}
	}
}

export async function executeHerdrOperationV1(
	client: unknown,
	request: unknown,
	options: unknown = {},
): Promise<unknown> {
	if (typeof client !== "object" || client === null || !EXECUTORS.has(client)) {
		return outcome("refused", operationName(request), "invalid-client");
	}
	const optionState = validateExecutionOptions(options);
	if ("code" in optionState) return outcome("refused", operationName(request), optionState.code);
	const built = buildRequest(request);
	if ("code" in built) return outcome("refused", operationName(request), built.code);
	if (optionState.aborted) return outcome("aborted", built.kind);
	const executor = EXECUTORS.get(client)!;
	const execution = await callExecutor(
		executor,
		built.argv,
		built.timeoutMs,
		optionState.signal,
		HERDR_CLIENT_LIMITS_V1.maxOutputBytes,
		built.kind,
	);
	if (isTerminalOutcome(execution)) return execution;
	const report = execution as HerdrExecutorReportV1;
	if (report.exitCode !== 0) {
		if (report.stdout.length > 0 && report.stderr.length > 0) {
			return outcome("refused", built.kind, "inconsistent-executor-report");
		}
		if (report.stderr.length === 0 && report.stdout.length > 0) {
			const contradictory = parseJsonRecord(report.stdout);
			if (contradictory && readValue(contradictory, "result") !== undefined) {
				return outcome("refused", built.kind, "inconsistent-executor-report");
			}
		}
		return errorFromReport(report, built);
	}
	return parseSuccess(report, built);
}
