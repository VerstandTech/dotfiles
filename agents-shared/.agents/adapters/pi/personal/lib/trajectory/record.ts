/**
 * OBS-01 — Pure redacted trajectory recorder, buffer, sequence restore, and retention planner.
 *
 * No ambient filesystem, network, clock, env, process, or package side effects.
 * Callers inject now/sinks. RED-01 must succeed before every sink and digest.
 */

import { createHash } from "node:crypto";
import { isSafeRepoRelativePath } from "../contracts/path.ts";
import { redactForPersistence } from "../security/redact.ts";
import type { TrajectoryEvent, TrajectoryEventKind, TrajectoryHashRef } from "./types.ts";

export const TRAJECTORY_CUSTOM_ENTRY_TYPE_V1 = "assurance-trajectory-event-v1" as const;
export const TRAJECTORY_EVENT_BUS_CHANNEL_V1 = "assurance:trajectory" as const;

export const TRAJECTORY_LIMITS_V1 = Object.freeze({
	maxPreviewLength: 512,
	maxToolNameLength: 64,
	maxActorLength: 64,
	maxToolCallIdLength: 128,
	maxArtifactRefs: 32,
	maxDataKeys: 32,
	maxSerializedCandidateBytes: 16_384,
	maxLineBytes: 8_192,
	defaultMaxSessionEntries: 4_096,
	defaultMaxBufferedEvents: 32,
	defaultMaxBufferedBytes: 32_768,
});

export type TrajectoryRefusalCodeV1 =
	| "unsupported-version"
	| "invalid-event"
	| "invalid-event-kind"
	| "unknown-field"
	| "unsafe-accessor"
	| "unsafe-key"
	| "unsafe-shape"
	| "unsupported-type"
	| "bound-exceeded"
	| "unsafe-path"
	| "redaction-refused"
	| "sequence-invalid"
	| "invalid-prior-entry"
	| "retention-limit"
	| "retention-unavailable"
	| "invalid-inventory"
	| "sink-unavailable"
	| "writer-closed"
	| "project-untrusted"
	| "invalid-session-id"
	| "unsafe-file-target"
	| "unsafe-file-kind";

type SinkStatus = "persisted" | "failed" | "skipped";

export type TrajectoryRecordResultV1 =
	| Readonly<{
			ok: true;
			event: TrajectoryEvent;
			line: string;
			sinks: Readonly<{ session?: SinkStatus; file?: SinkStatus }>;
	  }>
	| Readonly<{
			ok: false;
			code: TrajectoryRefusalCodeV1;
			sinks?: Readonly<{ session?: SinkStatus; file?: SinkStatus }>;
	  }>;

export type TrajectoryWriterResultV1 =
	| Readonly<{ ok: true }>
	| Readonly<{ ok: false; code: TrajectoryRefusalCodeV1 }>;

export type TrajectoryBufferedWriterV1 = {
	enqueue: (input: { seq: number; line: string }) => Promise<TrajectoryWriterResultV1>;
	flush: () => Promise<TrajectoryWriterResultV1>;
	close: () => Promise<TrajectoryWriterResultV1>;
};

export type TrajectoryRecorderV1 = {
	record: (candidate: unknown) => Promise<TrajectoryRecordResultV1>;
	close: () => Promise<TrajectoryWriterResultV1>;
};

const ALLOWED_EVENT_KEYS = new Set([
	"schemaVersion",
	"kind",
	"actor",
	"agent",
	"tool",
	"toolCallId",
	"preview",
	"data",
	"raw",
	"artifactRefs",
	"hashRefs",
]);

const EVENT_KINDS = new Set<string>([
	"message",
	"tool_call",
	"tool_result",
	"session",
	"phase_change",
	"gate_result",
	"decision",
	"handoff",
	"error",
	"budget",
	"human_approval",
	"herdr_state",
]);

const CLOSED_STATUS: Record<string, ReadonlySet<string>> = {
	session: new Set(["startup", "reload", "resume", "fork", "shutdown", "new", "quit"]),
	phase_change: new Set(["discovery", "formulation", "red", "green", "refactor", "verify", "off"]),
	gate_result: new Set(["passed", "failed", "unavailable", "timeout", "unknown"]),
	decision: new Set(["accepted", "rejected", "superseded", "stale", "invalid"]),
	handoff: new Set(["completed", "blocked", "failed", "unknown"]),
	budget: new Set(["ok", "warning", "exceeded", "unknown"]),
	human_approval: new Set(["approved", "rejected", "expired", "stale", "unknown"]),
	herdr_state: new Set(["working", "blocked", "idle", "done", "unknown", "unavailable"]),
};

function freezeDeep<T>(value: T): T {
	if (value === null || typeof value !== "object") return value;
	if (Object.isFrozen(value)) return value;
	if (Array.isArray(value)) {
		for (const child of value) freezeDeep(child);
		return Object.freeze(value);
	}
	for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
	return Object.freeze(value);
}

function refuse(code: TrajectoryRefusalCodeV1): TrajectoryRecordResultV1 {
	return Object.freeze({ ok: false, code });
}

function writerRefuse(code: TrajectoryRefusalCodeV1): TrajectoryWriterResultV1 {
	return Object.freeze({ ok: false, code });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function ownDataKeys(value: object): string[] {
	const keys: string[] = [];
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") throw Object.assign(new Error("unsafe-key"), { code: "unsafe-key" as const });
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !descriptor.enumerable) continue;
		if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
			throw Object.assign(new Error("unsafe-accessor"), { code: "unsafe-accessor" as const });
		}
		keys.push(key);
	}
	return keys;
}

function readPlain(value: unknown): Record<string, unknown> {
	if (!isPlainObject(value)) throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
	const out: Record<string, unknown> = {};
	for (const key of ownDataKeys(value)) out[key] = (value as Record<string, unknown>)[key];
	return out;
}

function boundedString(value: unknown, max: number, code: TrajectoryRefusalCodeV1 = "bound-exceeded"): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw Object.assign(new Error(code), { code });
	if (value.length > max) throw Object.assign(new Error(code), { code });
	return value;
}

function sha256Hex(bytes: string): string {
	return createHash("sha256").update(bytes, "utf8").digest("hex");
}

function validateClosedData(kind: string, data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (data === undefined) return undefined;
	if (!isPlainObject(data)) throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
	const keys = ownDataKeys(data);
	if (keys.length > TRAJECTORY_LIMITS_V1.maxDataKeys) {
		throw Object.assign(new Error("bound-exceeded"), { code: "bound-exceeded" as const });
	}
	const copy: Record<string, unknown> = {};
	for (const key of keys) copy[key] = data[key];

	const statuses = CLOSED_STATUS[kind];
	if (statuses && copy.status !== undefined) {
		if (typeof copy.status !== "string" || !statuses.has(copy.status)) {
			throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
		}
	}
	if (kind === "phase_change" && copy.phase !== undefined) {
		const phases = CLOSED_STATUS.phase_change!;
		if (typeof copy.phase !== "string" || !phases.has(copy.phase)) {
			throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
		}
	}
	if (kind === "gate_result") {
		if (copy.status !== undefined) {
			const statusesGate = CLOSED_STATUS.gate_result!;
			if (typeof copy.status !== "string" || !statusesGate.has(copy.status)) {
				throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
			}
		}
		if (copy.required !== undefined && typeof copy.required !== "boolean") {
			throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
		}
	}
	if (kind === "error" && copy.code !== undefined && typeof copy.code !== "string") {
		throw Object.assign(new Error("invalid-event"), { code: "invalid-event" as const });
	}
	return copy;
}

function validateArtifactRefs(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > TRAJECTORY_LIMITS_V1.maxArtifactRefs) {
		throw Object.assign(new Error("bound-exceeded"), { code: "bound-exceeded" as const });
	}
	const refs: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !isSafeRepoRelativePath(item)) {
			throw Object.assign(new Error("unsafe-path"), { code: "unsafe-path" as const });
		}
		refs.push(item);
	}
	return refs;
}

function projectCandidate(input: unknown): {
	kind: TrajectoryEventKind;
	actor?: string;
	tool?: string;
	toolCallId?: string;
	preview?: string;
	data?: Record<string, unknown>;
	raw?: unknown;
	artifactRefs?: string[];
} {
	const plain = readPlain(input);
	for (const key of Object.keys(plain)) {
		if (!ALLOWED_EVENT_KEYS.has(key)) {
			throw Object.assign(new Error("unknown-field"), { code: "unknown-field" as const });
		}
	}
	if (plain.schemaVersion !== 1) {
		throw Object.assign(new Error("unsupported-version"), { code: "unsupported-version" as const });
	}
	if (typeof plain.kind !== "string" || !EVENT_KINDS.has(plain.kind)) {
		throw Object.assign(new Error("invalid-event-kind"), { code: "invalid-event-kind" as const });
	}
	const kind = plain.kind as TrajectoryEventKind;
	const actor = boundedString(plain.actor ?? plain.agent, TRAJECTORY_LIMITS_V1.maxActorLength);
	const tool = boundedString(plain.tool, TRAJECTORY_LIMITS_V1.maxToolNameLength);
	const toolCallId = boundedString(plain.toolCallId, TRAJECTORY_LIMITS_V1.maxToolCallIdLength);
	const preview = boundedString(plain.preview, TRAJECTORY_LIMITS_V1.maxPreviewLength);
	const data = validateClosedData(kind, plain.data as Record<string, unknown> | undefined);
	const artifactRefs = validateArtifactRefs(plain.artifactRefs);
	return {
		kind,
		actor,
		tool,
		toolCallId,
		preview,
		data,
		raw: plain.raw,
		artifactRefs,
	};
}

function redactValue(value: unknown): { ok: true; value: unknown; json: string } | { ok: false; code: TrajectoryRefusalCodeV1 } {
	const result = redactForPersistence(value);
	if (!result.ok) return { ok: false, code: "redaction-refused" };
	return { ok: true, value: result.value, json: result.json };
}

export function restoreTrajectorySequenceV1(
	entries: unknown,
): Readonly<{ ok: true; nextSequence: number; count: number }> | Readonly<{ ok: false; code: TrajectoryRefusalCodeV1 }> {
	if (!Array.isArray(entries)) return Object.freeze({ ok: false, code: "invalid-prior-entry" });
	let expected = 1;
	let count = 0;
	for (const entry of entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const row = entry as Record<string, unknown>;
		if (row.type !== "custom" || row.customType !== TRAJECTORY_CUSTOM_ENTRY_TYPE_V1) continue;
		const data = row.data;
		if (!isPlainObject(data)) return Object.freeze({ ok: false, code: "invalid-prior-entry" });
		try {
			ownDataKeys(data);
		} catch (error) {
			const code = (error as { code?: TrajectoryRefusalCodeV1 }).code ?? "invalid-prior-entry";
			return Object.freeze({ ok: false, code });
		}
		const seq = data.seq;
		if (!Number.isSafeInteger(seq) || (seq as number) !== expected) {
			return Object.freeze({ ok: false, code: "sequence-invalid" });
		}
		if (data.schemaVersion !== 1 || typeof data.kind !== "string" || typeof data.at !== "string") {
			return Object.freeze({ ok: false, code: "invalid-prior-entry" });
		}
		expected += 1;
		count += 1;
	}
	return Object.freeze({ ok: true, nextSequence: expected, count });
}

export function createBufferedTrajectoryWriterV1(options: {
	append: (bytes: string) => Promise<void> | void;
	maxBufferedEvents?: number;
	maxBufferedBytes?: number;
	maxLineBytes?: number;
}): TrajectoryBufferedWriterV1 {
	const maxEvents = options.maxBufferedEvents ?? TRAJECTORY_LIMITS_V1.defaultMaxBufferedEvents;
	const maxBytes = options.maxBufferedBytes ?? TRAJECTORY_LIMITS_V1.defaultMaxBufferedBytes;
	const maxLineBytes = options.maxLineBytes ?? TRAJECTORY_LIMITS_V1.maxLineBytes;
	const buffer: string[] = [];
	let bufferedBytes = 0;
	let nextSeq: number | undefined;
	let closed = false;
	let failed = false;
	let chain: Promise<unknown> = Promise.resolve();

	const run = async <T>(fn: () => Promise<T>): Promise<T> => {
		const next = chain.then(fn, fn);
		chain = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	};

	const flushLocked = async (): Promise<TrajectoryWriterResultV1> => {
		if (failed) return writerRefuse("sink-unavailable");
		if (closed && buffer.length === 0) return Object.freeze({ ok: true });
		if (buffer.length === 0) return Object.freeze({ ok: true });
		const payload = `${buffer.join("\n")}\n`;
		buffer.length = 0;
		bufferedBytes = 0;
		try {
			await options.append(payload);
			return Object.freeze({ ok: true });
		} catch {
			failed = true;
			return writerRefuse("sink-unavailable");
		}
	};

	return {
		enqueue(input) {
			return run(async () => {
				if (closed) return writerRefuse("writer-closed");
				if (failed) return writerRefuse("sink-unavailable");
				if (!input || typeof input.line !== "string" || !Number.isSafeInteger(input.seq) || input.seq < 1) {
					return writerRefuse("invalid-event");
				}
				if (nextSeq === undefined) nextSeq = input.seq;
				if (input.seq !== nextSeq) return writerRefuse("sequence-invalid");
				const lineBytes = Buffer.byteLength(input.line, "utf8");
				if (lineBytes > maxLineBytes || lineBytes + 1 > maxBytes) return writerRefuse("bound-exceeded");
				if (buffer.length >= maxEvents || bufferedBytes + lineBytes + 1 > maxBytes) {
					const flushed = await flushLocked();
					if (!flushed.ok) return flushed;
				}
				if (buffer.length >= maxEvents || bufferedBytes + lineBytes + 1 > maxBytes) {
					return writerRefuse("bound-exceeded");
				}
				buffer.push(input.line);
				bufferedBytes += lineBytes + 1;
				nextSeq += 1;
				if (buffer.length >= maxEvents || bufferedBytes >= maxBytes) {
					return flushLocked();
				}
				return Object.freeze({ ok: true });
			});
		},
		flush() {
			return run(async () => flushLocked());
		},
		close() {
			return run(async () => {
				if (closed) return Object.freeze({ ok: true });
				const flushed = await flushLocked();
				closed = true;
				return flushed.ok ? Object.freeze({ ok: true }) : flushed;
			});
		},
	};
}

export function createTrajectoryRecorderV1(options: {
	now: () => string;
	priorEntries?: unknown[];
	maxSessionEntries?: number;
	appendSessionEntry?: (type: string, value: unknown) => void | Promise<void>;
	fileWriter?: TrajectoryBufferedWriterV1;
} = { now: () => new Date().toISOString() }): TrajectoryRecorderV1 {
	const restored = restoreTrajectorySequenceV1(options.priorEntries ?? []);
	if (!restored.ok) {
		// Fail closed for the whole recorder lifecycle when history is invalid.
		let closed = true;
		return {
			async record() {
				return refuse(restored.code);
			},
			async close() {
				return Object.freeze({ ok: true });
			},
		};
	}

	let nextSequence = restored.nextSequence;
	let sessionCount = restored.count;
	let closed = false;
	let chain: Promise<unknown> = Promise.resolve();
	const maxSessionEntries = options.maxSessionEntries ?? TRAJECTORY_LIMITS_V1.defaultMaxSessionEntries;

	const run = async <T>(fn: () => Promise<T>): Promise<T> => {
		const next = chain.then(fn, fn);
		chain = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	};

	return {
		record(candidate) {
			return run(async () => {
				if (closed) return refuse("writer-closed");
				let projected: ReturnType<typeof projectCandidate>;
				try {
					projected = projectCandidate(candidate);
				} catch (error) {
					const code = (error as { code?: TrajectoryRefusalCodeV1 }).code ?? "invalid-event";
					return refuse(code);
				}

				const hashRefs: TrajectoryHashRef[] = [];
				if (projected.raw !== undefined) {
					const redactedRaw = redactValue(projected.raw);
					if (!redactedRaw.ok) return refuse(redactedRaw.code);
					hashRefs.push({ sha256: sha256Hex(redactedRaw.json), purpose: "raw-projection" });
				}

				const eventCandidate: Record<string, unknown> = {
					schemaVersion: 1,
					seq: nextSequence,
					at: options.now(),
					kind: projected.kind,
				};
				if (projected.actor !== undefined) eventCandidate.agent = projected.actor;
				if (projected.tool !== undefined) eventCandidate.tool = projected.tool;
				if (projected.toolCallId !== undefined) eventCandidate.toolCallId = projected.toolCallId;
				if (projected.preview !== undefined) eventCandidate.preview = projected.preview;
				if (projected.data !== undefined) eventCandidate.data = projected.data;
				if (projected.artifactRefs !== undefined) eventCandidate.artifactRefs = projected.artifactRefs;
				if (hashRefs.length > 0) eventCandidate.hashRefs = hashRefs;

				const redactedEvent = redactValue(eventCandidate);
				if (!redactedEvent.ok) return refuse(redactedEvent.code);
				const event = freezeDeep(redactedEvent.value as TrajectoryEvent);
				const line = redactedEvent.json;
				if (Buffer.byteLength(line, "utf8") > TRAJECTORY_LIMITS_V1.maxLineBytes) {
					return refuse("bound-exceeded");
				}

				const sinks: { session?: SinkStatus; file?: SinkStatus } = {};

				if (options.appendSessionEntry) {
					if (sessionCount >= maxSessionEntries) return refuse("retention-limit");
					try {
						await options.appendSessionEntry(TRAJECTORY_CUSTOM_ENTRY_TYPE_V1, event);
						sinks.session = "persisted";
						sessionCount += 1;
					} catch {
						sinks.session = "failed";
						return Object.freeze({ ok: false, code: "sink-unavailable" as const, sinks: Object.freeze(sinks) });
					}
				} else {
					sinks.session = "skipped";
				}

				if (options.fileWriter) {
					const fileResult = await options.fileWriter.enqueue({ seq: event.seq, line });
					if (!fileResult.ok) {
						sinks.file = "failed";
						// Sequence is consumed once session succeeded; report partial failure honestly.
						nextSequence += 1;
						return Object.freeze({ ok: false, code: fileResult.code, sinks: Object.freeze(sinks) });
					}
					sinks.file = "persisted";
				} else {
					sinks.file = "skipped";
				}

				nextSequence += 1;
				return Object.freeze({
					ok: true,
					event,
					line,
					sinks: Object.freeze(sinks),
				});
			});
		},
		close() {
			return run(async () => {
				if (closed) return Object.freeze({ ok: true });
				closed = true;
				if (options.fileWriter) return options.fileWriter.close();
				return Object.freeze({ ok: true });
			});
		},
	};
}

export type TrajectoryRetentionPolicyV1 = Readonly<{
	maxLineBytes: number;
	maxBufferedBytes: number;
	maxSegmentBytes: number;
	maxTotalBytes: number;
	maxSegments: number;
	maxSessionEntries: number;
}>;

export type TrajectorySegmentFactV1 = Readonly<{
	path: string;
	segment: number;
	sizeBytes: number;
	order: number;
	kind: string;
	links: number;
	symlink: boolean;
}>;

export function planTrajectoryRetentionV1(input: {
	policy: TrajectoryRetentionPolicyV1;
	inventory: unknown;
	nextLineBytes: number;
}): Readonly<
	| { ok: true; action: "append" | "new-segment"; segment: number }
	| { ok: false; code: TrajectoryRefusalCodeV1; purgeCandidates?: string[] }
> {
	const { policy, nextLineBytes } = input;
	if (!Number.isFinite(nextLineBytes) || nextLineBytes < 0 || nextLineBytes > policy.maxLineBytes) {
		return Object.freeze({ ok: false, code: "bound-exceeded" });
	}
	if (input.inventory === undefined) return Object.freeze({ ok: false, code: "retention-unavailable" });
	if (!Array.isArray(input.inventory)) return Object.freeze({ ok: false, code: "invalid-inventory" });

	const seenPaths = new Set<string>();
	const seenSegments = new Set<number>();
	const segments: TrajectorySegmentFactV1[] = [];
	for (const item of input.inventory) {
		if (!isPlainObject(item)) return Object.freeze({ ok: false, code: "invalid-inventory" });
		try {
			ownDataKeys(item);
		} catch {
			return Object.freeze({ ok: false, code: "invalid-inventory" });
		}
		const path = item.path;
		const segment = item.segment;
		const sizeBytes = item.sizeBytes;
		const order = item.order;
		const kind = item.kind;
		const links = item.links;
		const symlink = item.symlink;
		if (typeof path !== "string" || !isSafeRepoRelativePath(path)) {
			return Object.freeze({ ok: false, code: "invalid-inventory" });
		}
		if (!Number.isSafeInteger(segment) || segment < 0) return Object.freeze({ ok: false, code: "invalid-inventory" });
		if (!Number.isFinite(sizeBytes) || (sizeBytes as number) < 0) return Object.freeze({ ok: false, code: "invalid-inventory" });
		if (!Number.isSafeInteger(order)) return Object.freeze({ ok: false, code: "invalid-inventory" });
		if (kind !== "file") return Object.freeze({ ok: false, code: "invalid-inventory" });
		if (links !== 1) return Object.freeze({ ok: false, code: "invalid-inventory" });
		if (symlink !== false) return Object.freeze({ ok: false, code: "invalid-inventory" });
		if (seenPaths.has(path) || seenSegments.has(segment as number)) {
			return Object.freeze({ ok: false, code: "invalid-inventory" });
		}
		seenPaths.add(path);
		seenSegments.add(segment as number);
		segments.push({
			path,
			segment: segment as number,
			sizeBytes: sizeBytes as number,
			order: order as number,
			kind: "file",
			links: 1,
			symlink: false,
		});
	}

	segments.sort((a, b) => a.order - b.order || a.segment - b.segment);
	const total = segments.reduce((sum, item) => sum + item.sizeBytes, 0);
	if (segments.length === 0) {
		return Object.freeze({ ok: true, action: "append", segment: 0 });
	}
	const current = segments[segments.length - 1]!;
	if (current.sizeBytes + nextLineBytes <= policy.maxSegmentBytes && total + nextLineBytes <= policy.maxTotalBytes) {
		return Object.freeze({ ok: true, action: "append", segment: current.segment });
	}
	if (segments.length + 1 <= policy.maxSegments && total + nextLineBytes <= policy.maxTotalBytes) {
		return Object.freeze({ ok: true, action: "new-segment", segment: current.segment + 1 });
	}
	const purgeCandidates = segments
		.slice()
		.sort((a, b) => a.order - b.order || a.segment - b.segment)
		.map((item) => item.path)
		.slice(0, 1);
	return Object.freeze({ ok: false, code: "retention-limit", purgeCandidates: Object.freeze(purgeCandidates) });
}
