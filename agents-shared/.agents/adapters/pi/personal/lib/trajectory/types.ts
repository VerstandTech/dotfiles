/**
 * Trajectory / process-supervision types for high-assurance multi-agent runs.
 * Score the *path* agents take, not only final artifacts.
 */

export const TRAJECTORY_EVENT_KINDS = [
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
] as const;

export type TrajectoryEventKind = (typeof TRAJECTORY_EVENT_KINDS)[number];

export interface TrajectoryHashRef {
	/** Lowercase SHA-256 of RED-01 canonical success bytes */
	sha256: string;
	/** Closed digest purpose */
	purpose?: "raw-projection" | "preview" | "event";
}

export interface TrajectoryEvent {
	/** Monotonic sequence within a run */
	seq: number;
	at: string;
	kind: TrajectoryEventKind;
	/** Role or agent id when known */
	agent?: string;
	/** Tool name for tool_call / tool_result */
	tool?: string;
	/** Tool call correlation id when known */
	toolCallId?: string;
	/** Structured payload (args summary, status, etc.) — never secrets */
	data?: Record<string, unknown>;
	/** Optional redacted preview string for golden matching */
	preview?: string;
	/** Safe repository-relative artifact refs */
	artifactRefs?: string[];
	/** Digests of RED-01 success bytes only */
	hashRefs?: TrajectoryHashRef[];
	/** Recorder schema version when produced by OBS-01 */
	schemaVersion?: 1;
}

export interface TrajectoryRun {
	version: 1;
	runId: string;
	taskId: string;
	/** Goal / prompt fingerprint or short description */
	goal: string;
	startedAt: string;
	completedAt?: string;
	/** Outcome labels */
	outcome?: "success" | "failure" | "aborted" | "budget_exceeded";
	events: TrajectoryEvent[];
	/** Optional tags for golden suite indexing */
	tags?: string[];
	/** Cost / step metadata */
	metrics?: TrajectoryMetrics;
}

export interface TrajectoryMetrics {
	toolCalls: number;
	errors: number;
	phaseChanges: number;
	gateFailures: number;
	/** Wall clock ms if known */
	durationMs?: number;
	/** Token / spend estimates when recorded */
	estimatedTokens?: number;
	estimatedCostUsd?: number;
}

export type TrajectoryMatchMode = "strict" | "unordered" | "subset" | "superset";

export interface TrajectoryAssertion {
	id: string;
	description: string;
	/** Required tool names in order (strict) or set membership */
	requiredTools?: string[];
	forbiddenTools?: string[];
	/** Required event kinds present */
	requiredKinds?: TrajectoryEventKind[];
	/** Must not claim success after failed required gate */
	forbidSuccessAfterFailedGate?: boolean;
	/** Max tool calls (efficiency bound) */
	maxToolCalls?: number;
	/** Max errors before recovery required */
	maxErrors?: number;
	matchMode?: TrajectoryMatchMode;
}

export interface TrajectoryAssertionResult {
	id: string;
	ok: boolean;
	summary: string;
}

export type TrajectoryEvaluationStatus = "pass" | "fail" | "invalid" | "unavailable";

export interface TrajectoryEvaluation {
	runId: string;
	ok: boolean;
	status?: TrajectoryEvaluationStatus;
	results: TrajectoryAssertionResult[];
	metrics: TrajectoryMetrics;
	antiPatterns: string[];
}

export interface GoldenTrajectoryEntry {
	id: string;
	/** Short description of the golden task */
	description: string;
	/** Path relative to package or project for the recorded run JSON */
	runPath: string;
	/** Assertions that must pass against the golden (and regressions) */
	assertions: TrajectoryAssertion[];
	tags?: string[];
	/** Expected evaluation.ok; default true for backward compatibility */
	expectedOk?: boolean;
	/** Required error-level anti-pattern codes when expectedOk is false */
	requiredAntiPatterns?: string[];
}

export interface GoldenTrajectorySuite {
	version: 1;
	name: string;
	entries: GoldenTrajectoryEntry[];
}
