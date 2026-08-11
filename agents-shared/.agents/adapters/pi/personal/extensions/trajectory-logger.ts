/**
 * OBS-01 thin Pi adapter: observe session/tool/event-bus lifecycle and record
 * redacted trajectory events. Observational only — never mutates tools/results.
 */
import {
	createTrajectoryRecorderV1,
	TRAJECTORY_CUSTOM_ENTRY_TYPE_V1,
	TRAJECTORY_EVENT_BUS_CHANNEL_V1,
	type TrajectoryBufferedWriterV1,
	type TrajectoryRecorderV1,
} from "../lib/trajectory/record.ts";

type PlainRecord = Record<string, unknown>;

type PiLike = {
	on: (event: string, handler: (event: unknown, context?: unknown) => unknown) => unknown;
	appendEntry: (customType: string, data?: unknown) => void;
	events: {
		on: (channel: string, handler: (data: unknown) => void) => () => void;
	};
	registerFlag?: (name: string, options: { description?: string; type: "boolean" | "string"; default?: boolean | string }) => void;
	getFlag?: (name: string) => boolean | string | undefined;
};

type ExtensionContextLike = {
	cwd?: string;
	isProjectTrusted?: () => boolean;
	sessionManager?: {
		getSessionId?: () => string | undefined;
		getEntries?: () => unknown[];
	};
	ui?: {
		setStatus?: (key: string, value: string | undefined) => void;
	};
};

export type TrajectoryLoggerExtensionOptionsV1 = {
	now?: () => string;
	createFileWriter?: (request: {
		projectRoot: string;
		sessionId: string;
	}) => Promise<TrajectoryBufferedWriterV1 | undefined> | TrajectoryBufferedWriterV1 | undefined;
};

const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
	const ui = eventData(context, "ui");
	const setStatusValue = eventData(ui, "setStatus");
	if (typeof setStatusValue === "function") {
		try {
			setStatusValue.call(ui, "trajectory-logger", value);
		} catch {
			// Status is advisory.
		}
	}
}

function safeToolName(event: unknown): string {
	const candidate = eventData(event, "toolName") ?? eventData(event, "tool_name");
	if (typeof candidate === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(candidate)) return candidate;
	return "unknown-tool";
}

function safeToolCallId(event: unknown): string | undefined {
	const candidate = eventData(event, "toolCallId") ?? eventData(event, "tool_call_id");
	if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= 128) return candidate;
	return undefined;
}

function isTrusted(context: unknown): boolean {
	const fn = eventData(context, "isProjectTrusted");
	if (typeof fn !== "function") return false;
	try {
		return fn.call(context) === true;
	} catch {
		return false;
	}
}

function sessionIdOf(context: unknown): string | undefined {
	const manager = eventData(context, "sessionManager");
	const getSessionId = eventData(manager, "getSessionId");
	if (typeof getSessionId !== "function") return undefined;
	try {
		const value = getSessionId.call(manager);
		return typeof value === "string" ? value : undefined;
	} catch {
		return undefined;
	}
}

function priorEntriesOf(context: unknown): unknown[] {
	const manager = eventData(context, "sessionManager");
	const getEntries = eventData(manager, "getEntries");
	if (typeof getEntries !== "function") return [];
	try {
		const value = getEntries.call(manager);
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

function projectRootOf(context: unknown): string {
	const cwd = eventData(context, "cwd");
	return typeof cwd === "string" && cwd.length > 0 ? cwd : ".";
}

export function createTrajectoryLoggerExtensionV1(options: TrajectoryLoggerExtensionOptionsV1 = {}) {
	return (pi: PiLike): void => {
		if (typeof pi.registerFlag === "function") {
			pi.registerFlag("trajectory-file", {
				description: "Enable optional OBS-01 append-only trajectory file persistence in trusted projects",
				type: "boolean",
				default: false,
			});
		}

		let generation = 0;
		let recorder: TrajectoryRecorderV1 | undefined;
		let fileWriter: TrajectoryBufferedWriterV1 | undefined;
		let unsubscribeBus: (() => void) | undefined;
		let activeGeneration = 0;

		const dispose = async (): Promise<void> => {
			const current = activeGeneration;
			activeGeneration = 0;
			const currentUnsubscribe = unsubscribeBus;
			unsubscribeBus = undefined;
			const currentRecorder = recorder;
			recorder = undefined;
			fileWriter = undefined;
			if (currentUnsubscribe) {
				try {
					currentUnsubscribe();
				} catch {
					// Unsubscribe is best-effort and must remain idempotent.
				}
			}
			if (currentRecorder) {
				try {
					await currentRecorder.close();
				} catch {
					// Close failures are non-throwing for lifecycle teardown.
				}
			}
			void current;
		};

		const recordSafe = async (candidate: PlainRecord, context: unknown): Promise<void> => {
			if (!recorder) return;
			try {
				const result = await recorder.record(candidate);
				if (!result.ok) {
					setStatus(context, `trajectory-logger: ${result.code}`);
				}
			} catch {
				setStatus(context, "trajectory-logger: sink-unavailable");
			}
		};

		pi.on("session_start", async (event: unknown, context: unknown) => {
			await dispose();
			generation += 1;
			activeGeneration = generation;
			const gen = activeGeneration;
			const reason = eventData(event, "reason");
			const fileEnabled = pi.getFlag?.("trajectory-file") === true;
			fileWriter = undefined;

			if (fileEnabled) {
				if (!isTrusted(context)) {
					setStatus(context, "trajectory-logger: project-untrusted");
				} else {
					const sessionId = sessionIdOf(context);
					if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
						setStatus(context, "trajectory-logger: invalid-session-id");
					} else if (typeof options.createFileWriter === "function") {
						try {
							fileWriter = await options.createFileWriter({
								projectRoot: projectRootOf(context),
								sessionId,
							});
						} catch {
							setStatus(context, "trajectory-logger: sink-unavailable");
						}
					}
				}
			}

			if (gen !== activeGeneration) return;

			recorder = createTrajectoryRecorderV1({
				now: options.now ?? (() => new Date().toISOString()),
				priorEntries: priorEntriesOf(context),
				appendSessionEntry: (type, value) => {
					pi.appendEntry(type, value);
				},
				fileWriter,
			});

			unsubscribeBus = pi.events.on(TRAJECTORY_EVENT_BUS_CHANNEL_V1, (data) => {
				if (gen !== activeGeneration || !recorder) return;
				void (async () => {
					if (!data || typeof data !== "object" || Array.isArray(data)) {
						setStatus(context, "trajectory-logger: invalid-event");
						return;
					}
					const kind = eventData(data, "kind");
					if (typeof kind !== "string") {
						setStatus(context, "trajectory-logger: invalid-event");
						return;
					}
					// Unknown kinds are refused by the recorder; do not invent a message event.
					await recordSafe(
						{
							schemaVersion: 1,
							kind,
							preview: eventData(data, "preview"),
							data: eventData(data, "data"),
							actor: eventData(data, "actor") ?? eventData(data, "agent"),
							tool: eventData(data, "tool"),
							toolCallId: eventData(data, "toolCallId"),
							artifactRefs: eventData(data, "artifactRefs"),
							raw: eventData(data, "raw"),
						},
						context,
					);
				})();
			});

			const status =
				typeof reason === "string" && ["startup", "reload", "resume", "fork", "new"].includes(reason)
					? reason
					: "startup";
			await recordSafe(
				{
					schemaVersion: 1,
					kind: "session",
					data: { status },
				},
				context,
			);
			if (!fileEnabled) setStatus(context, "trajectory-logger: session-only");
		});

		pi.on("tool_call", async (event: unknown, context: unknown) => {
			if (!recorder) return undefined;
			await recordSafe(
				{
					schemaVersion: 1,
					kind: "tool_call",
					tool: safeToolName(event),
					toolCallId: safeToolCallId(event),
					raw: eventData(event, "input"),
				},
				context,
			);
			return undefined;
		});

		pi.on("tool_result", async (event: unknown, context: unknown) => {
			if (!recorder) return undefined;
			await recordSafe(
				{
					schemaVersion: 1,
					kind: "tool_result",
					tool: safeToolName(event),
					toolCallId: safeToolCallId(event),
					data: {
						status: eventData(event, "isError") === true ? "failed" : "passed",
					},
					raw: {
						content: eventData(event, "content"),
						details: eventData(event, "details"),
						input: eventData(event, "input"),
					},
				},
				context,
			);
			return undefined;
		});

		pi.on("session_shutdown", async (_event: unknown, context: unknown) => {
			await dispose();
			setStatus(context, undefined);
		});
	};
}

export const trajectoryLoggerExtension = createTrajectoryLoggerExtensionV1();
export default trajectoryLoggerExtension;

// Keep the custom entry type discoverable for tests/docs without a second export surface.
void TRAJECTORY_CUSTOM_ENTRY_TYPE_V1;
