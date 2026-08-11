/**
 * ISO-01 CAID lifecycle pure helpers.
 *
 * plan → acquire/release → heartbeat → collision → cleanup readiness → board IO.
 * Injected clock/realpath/lock/board facts only — no ambient authority, no deletes.
 */

import { resolve } from "node:path";
import {
	caidBranchName,
	caidCardId,
	caidWorktreePath,
	defaultIsolationForRole,
	isCaidRole,
	type CaidBoardFile,
	type CaidIsolation,
	type CaidRole,
} from "./caid.ts";
import { assertPathUnderRepo } from "./new-worktree.ts";
import type { WorktreeBoardState, WorktreeBusyState, WorktreeCard } from "./types.ts";

// ── frozen result helpers ───────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	if (Array.isArray(value)) {
		for (const item of value) deepFreeze(item);
		return value;
	}
	for (const child of Object.values(value as object)) deepFreeze(child);
	return value;
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function freezeOk<T extends Record<string, unknown>>(value: T): T & { ok: true } {
	return deepFreeze({ ok: true as const, ...cloneJson(value) });
}

function freezeErr<T extends Record<string, unknown>>(
	code: string,
	extra?: T,
): { ok: false; code: string } & T {
	return deepFreeze({ ok: false as const, code, ...(extra ? cloneJson(extra) : {}) }) as {
		ok: false;
		code: string;
	} & T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ── planCaidLifecycleV1 ─────────────────────────────────────────────────────

export interface PlanCaidLifecycleInput {
	repoRoot: string;
	taskId: string;
	role: string;
	goal: string;
	isolation?: CaidIsolation;
	branch?: string;
	path?: string;
	now?: string;
	/** Must never be invoked — plan is side-effect free. */
	createWorktree?: () => void;
	writeBoard?: () => void;
}

export function planCaidLifecycleV1(input: PlanCaidLifecycleInput) {
	if (!input || typeof input.repoRoot !== "string" || !input.repoRoot.trim()) {
		return freezeErr("invalid-path");
	}
	if (typeof input.taskId !== "string" || !input.taskId.trim()) {
		return freezeErr("invalid-path");
	}
	if (typeof input.role !== "string" || !isCaidRole(input.role)) {
		return freezeErr("invalid-role");
	}
	const role = input.role as CaidRole;
	const isolation = input.isolation ?? defaultIsolationForRole(role);
	const branch = input.branch ?? caidBranchName(input.taskId, role);
	let path: string;
	try {
		path =
			input.path != null
				? assertPathUnderRepo(input.repoRoot, input.path)
				: isolation === "shared"
					? resolve(input.repoRoot)
					: caidWorktreePath(input.repoRoot, input.taskId, role);
	} catch {
		return freezeErr("invalid-path");
	}
	const cardId = caidCardId(input.taskId, role);
	const createdAt = input.now; // only when injected — no ambient Date.now

	const plan: Record<string, unknown> = {
		taskId: input.taskId,
		role,
		isolation,
		branch,
		path,
		cardId,
		goal: typeof input.goal === "string" ? input.goal : "",
	};
	if (createdAt != null) {
		plan.createdAt = createdAt;
		plan.plannedAt = createdAt;
		plan.now = createdAt;
	}

	// Intentionally ignore createWorktree / writeBoard — never call them.
	return freezeOk({ plan });
}

// ── evaluatePathCollisionV1 ─────────────────────────────────────────────────

export interface PathCollisionWriter {
	path: string;
	role?: string;
	cardId?: string;
	status?: string;
}

export interface EvaluatePathCollisionInput {
	exclusiveWriters: PathCollisionWriter[];
	realpathOf: (path: string) => string | undefined;
	repoRootRealpath?: string;
	strict?: boolean;
}

function isActiveStatus(status: string | undefined): boolean {
	if (status == null) return true;
	return status !== "done" && status !== "failed";
}

function isNestedRealpath(child: string, parent: string): boolean {
	if (child === parent) return false;
	const prefix = parent.endsWith("/") ? parent : `${parent}/`;
	return child.startsWith(prefix);
}

function underRoot(resolved: string, root: string): boolean {
	const r = resolve(root);
	const p = resolve(resolved);
	return p === r || p.startsWith(`${r}/`);
}

export function evaluatePathCollisionV1(input: EvaluatePathCollisionInput) {
	const writers = (input.exclusiveWriters ?? []).filter((w) => isActiveStatus(w.status));
	const resolved: Array<{ writer: PathCollisionWriter; realpath: string }> = [];

	for (const w of writers) {
		if (typeof w.path !== "string" || !w.path.trim()) {
			return freezeErr("invalid-path");
		}
		if (!w.path.startsWith("/")) {
			return freezeErr("invalid-path");
		}
		if (w.path.includes("..")) {
			return freezeErr("invalid-path");
		}
		const rp = input.realpathOf(w.path);
		if (rp == null || rp === "") {
			if (input.strict) return freezeErr("unavailable");
			return freezeErr("unavailable");
		}
		if (input.repoRootRealpath != null && !underRoot(rp, input.repoRootRealpath)) {
			return freezeErr("path-escape");
		}
		resolved.push({ writer: w, realpath: resolve(rp) });
	}

	// Alias collision: same realpath, different lexical paths / cards
	const byReal = new Map<string, typeof resolved>();
	for (const entry of resolved) {
		const list = byReal.get(entry.realpath) ?? [];
		list.push(entry);
		byReal.set(entry.realpath, list);
	}
	for (const list of byReal.values()) {
		if (list.length >= 2) return freezeErr("collision");
	}

	// Nested path collision among exclusive writers
	for (let i = 0; i < resolved.length; i++) {
		for (let j = 0; j < resolved.length; j++) {
			if (i === j) continue;
			if (isNestedRealpath(resolved[i]!.realpath, resolved[j]!.realpath)) {
				return freezeErr("collision");
			}
		}
	}

	return freezeOk({ free: true as const });
}

// ── evaluateHeartbeatV1 ─────────────────────────────────────────────────────

export interface LifecycleLease {
	parentToken: string;
	sessionId: string;
	paneId: string;
	realpath: string;
	lastHeartbeatAt: string;
	busy: WorktreeBusyState;
	agentStatus?: string;
}

export interface EvaluateHeartbeatInput {
	lease: LifecycleLease;
	heartbeat?: {
		parentToken: string;
		sessionId: string;
		paneId: string;
		realpath: string;
	};
	mode?: "classify" | "update";
	now: string;
	ttlMs: number;
}

function cloneLease(lease: LifecycleLease): LifecycleLease {
	return cloneJson(lease);
}

export function evaluateHeartbeatV1(input: EvaluateHeartbeatInput) {
	const lease = cloneLease(input.lease);
	const autoReleased = false as const;

	if (input.mode === "classify" || input.heartbeat == null) {
		const last = Date.parse(lease.lastHeartbeatAt);
		const now = Date.parse(input.now);
		const age = Number.isFinite(last) && Number.isFinite(now) ? now - last : Number.POSITIVE_INFINITY;
		const stale = age > input.ttlMs;
		return freezeOk({
			classification: stale ? ("stale" as const) : ("fresh" as const),
			autoReleased,
			lease,
		});
	}

	const hb = input.heartbeat;
	if (hb.parentToken !== lease.parentToken) {
		return freezeErr("token-mismatch", { autoReleased, lease });
	}
	if (hb.sessionId !== lease.sessionId) {
		return freezeErr("session-mismatch", { autoReleased, lease });
	}
	if (hb.paneId !== lease.paneId) {
		return freezeErr("pane-mismatch", { autoReleased, lease });
	}
	if (hb.realpath !== lease.realpath) {
		return freezeErr("realpath-mismatch", { autoReleased, lease });
	}

	// Monotonic update: only advance timestamp
	const prev = Date.parse(lease.lastHeartbeatAt);
	const next = Date.parse(input.now);
	const nextAt =
		Number.isFinite(prev) && Number.isFinite(next) && next < prev
			? lease.lastHeartbeatAt
			: input.now;
	lease.lastHeartbeatAt = nextAt;
	// never auto-release
	return freezeOk({
		classification: "updated" as const,
		autoReleased,
		lease,
	});
}

// ── evaluateCleanupReadinessV1 ──────────────────────────────────────────────

export interface CleanupCard {
	id: string;
	path: string;
	branch?: string;
	head?: string;
	busy: WorktreeBusyState | string;
	updatedAt?: string;
}

export interface CleanupFacts {
	dirty?: boolean;
	agentStatus?: string;
	expectedHeadSha?: string;
	observedHeadSha?: string;
	isMain?: boolean;
	heartbeatClassification?: "fresh" | "stale" | string;
}

export interface EvaluateCleanupReadinessInput {
	card: CleanupCard;
	facts: CleanupFacts;
	/** Hooks must never be invoked — planner only. */
	deleteWorktree?: () => void;
	removeWorktree?: () => void;
	rm?: () => void;
	rmSync?: () => void;
	exec?: () => void;
}

export function evaluateCleanupReadinessV1(input: EvaluateCleanupReadinessInput) {
	// Never call any delete hooks — intentionally unread beyond presence.
	const card = input.card;
	const facts = input.facts ?? {};

	const deny = (code: string) => freezeOk({ allow: false as const, code });

	// Order matters for multi-condition cards (stale+busy → leased before busy alone).
	if (facts.isMain === true || card.id === "main") {
		return deny("main");
	}
	if (facts.dirty === true) {
		return deny("dirty");
	}
	if (card.busy === "busy" && facts.heartbeatClassification === "stale") {
		return deny("leased");
	}
	if (card.busy === "busy") {
		return deny("busy");
	}
	if (facts.agentStatus === "unknown") {
		return deny("unknown-status");
	}
	if (facts.agentStatus === "blocked") {
		return deny("blocked");
	}
	if (facts.agentStatus === "working") {
		// working is not auto-cleanable — treat as busy-like deny
		return deny("busy");
	}
	if (
		facts.expectedHeadSha != null &&
		facts.observedHeadSha != null &&
		facts.expectedHeadSha !== facts.observedHeadSha
	) {
		return deny("sha-mismatch");
	}

	const candidates = deepFreeze([
		cloneJson({
			id: card.id,
			path: card.path,
			branch: card.branch,
			head: card.head ?? facts.observedHeadSha,
		}),
	]);

	return freezeOk({ allow: true as const, candidates });
}

// ── board ↔ CAID agreement ──────────────────────────────────────────────────

function cardMatchesAssignment(
	card: { id: string; path: string },
	assignment: { cardId: string; path: string },
): boolean {
	if (card.id === assignment.cardId) return true;
	return resolve(card.path) === resolve(assignment.path);
}

export function evaluateBoardCaidAgreementV1(input: {
	board: WorktreeBoardState | { cards: Array<{ id: string; path: string; busy?: string }> };
	caid: CaidBoardFile | { assignments: Array<{ cardId: string; path: string; status?: string }> };
	cardId?: string;
	path?: string;
}) {
	const cards = input.board.cards ?? [];
	const assignments = (input.caid.assignments ?? []).filter((a) => isActiveStatus(a.status));

	if (input.cardId != null) {
		const assignment = assignments.find((a) => a.cardId === input.cardId);
		if (!assignment) {
			// CAID missing for requested card — if board also lacks it, still mismatch when
			// caller is checking a CAID-side id.
			const boardCard = cards.find((c) => c.id === input.cardId);
			if (!boardCard) return freezeErr("board-caid-mismatch");
			return freezeErr("board-caid-mismatch");
		}
		const boardCard = cards.find((c) => cardMatchesAssignment(c, assignment));
		if (!boardCard) return freezeErr("board-caid-mismatch");
		return freezeOk({});
	}

	if (input.path != null) {
		const assignment = assignments.find((a) => resolve(a.path) === resolve(input.path!));
		const boardCard = cards.find((c) => resolve(c.path) === resolve(input.path!));
		if (!assignment || !boardCard) return freezeErr("board-caid-mismatch");
		return freezeOk({});
	}

	// Full scan: every active CAID assignment must appear on the board.
	for (const a of assignments) {
		const boardCard = cards.find((c) => cardMatchesAssignment(c, a));
		if (!boardCard) return freezeErr("board-caid-mismatch");
	}
	return freezeOk({});
}

// ── acquire / release ───────────────────────────────────────────────────────

function cloneBoard(board: WorktreeBoardState): WorktreeBoardState {
	return cloneJson(board);
}

export function acquireLifecycleWriterV1(input: {
	board: WorktreeBoardState;
	caid: CaidBoardFile | { assignments: Array<{ cardId: string; path: string; status?: string; role?: string }> };
	cardId: string;
	identity?: { sessionId?: string; agentRunId?: string };
	now?: string;
	realpathOf?: (path: string) => string | undefined;
}) {
	const board = cloneBoard(input.board);
	const cardId = typeof input.cardId === "string" ? input.cardId.trim() : "";
	if (!cardId) return freezeErr("not-found");

	const agreement = evaluateBoardCaidAgreementV1({
		board,
		caid: input.caid as CaidBoardFile,
		cardId,
	});
	if (!agreement.ok) {
		return freezeErr("board-caid-mismatch");
	}

	const card = board.cards.find((c) => c.id === cardId);
	if (!card) return freezeErr("not-found");

	// Optional collision check against other busy exclusive writers
	if (typeof input.realpathOf === "function") {
		const exclusive = board.cards
			.filter((c) => c.busy === "busy" || c.id === cardId)
			.map((c) => ({ path: c.path, cardId: c.id, status: "active" as const }));
		const collision = evaluatePathCollisionV1({
			exclusiveWriters: exclusive,
			realpathOf: input.realpathOf,
			strict: true,
		});
		if (!collision.ok && collision.code === "collision") {
			return freezeErr("collision");
		}
	}

	if (card.busy === "busy") {
		// Idempotent hold — does not consume an extra cap slot
		return freezeOk({
			code: "lease-held" as const,
			board,
		});
	}

	const busyCount = board.cards.filter((c) => c.busy === "busy").length;
	const cap = board.maxBusyWriters;
	if (busyCount >= cap) {
		return freezeErr("cap-exceeded");
	}

	const updatedAt = input.now ?? card.updatedAt;
	const nextCard: WorktreeCard = {
		...card,
		busy: "busy",
		updatedAt,
		agentRunId: input.identity?.agentRunId ?? card.agentRunId,
		sessionId: input.identity?.sessionId ?? card.sessionId,
	};
	board.cards = board.cards.map((c) => (c.id === cardId ? nextCard : c));
	return freezeOk({ board });
}

export function releaseLifecycleWriterV1(input: {
	board: WorktreeBoardState;
	cardId: string;
	now?: string;
}) {
	const board = cloneBoard(input.board);
	const cardId = typeof input.cardId === "string" ? input.cardId.trim() : "";
	if (!cardId) return freezeErr("not-found", { board });

	const idx = board.cards.findIndex((c) => c.id === cardId);
	if (idx < 0) return freezeErr("not-found", { board });

	const card = board.cards[idx]!;
	const released: WorktreeCard = {
		...card,
		busy: "idle",
		updatedAt: input.now ?? card.updatedAt,
	};
	// Clear run bindings explicitly
	delete released.agentRunId;
	delete released.sessionId;
	board.cards = board.cards.map((c, i) => (i === idx ? released : c));
	return freezeOk({ board });
}

// ── validateBoardV1 ─────────────────────────────────────────────────────────

const BOARD_ROOT_KEYS = new Set([
	"version",
	"repoRoot",
	"maxBusyWriters",
	"focusedId",
	"cards",
	// registry-file shape also accepted
	"entries",
]);

const CARD_KEYS = new Set([
	"id",
	"path",
	"branch",
	"head",
	"detached",
	"bare",
	"label",
	"busy",
	"agentRunId",
	"sessionId",
	"bddPhase",
	"dirty",
	"updatedAt",
]);

function hasAccessorTrap(value: unknown): boolean {
	if (value === null || typeof value !== "object") return false;
	try {
		const desc = Object.getOwnPropertyDescriptors(value);
		for (const d of Object.values(desc)) {
			if (d && (typeof d.get === "function" || typeof d.set === "function")) return true;
		}
	} catch {
		return true;
	}
	return false;
}

export function validateBoardV1(input: unknown) {
	if (!isPlainObject(input) || hasAccessorTrap(input)) {
		return freezeErr("invalid-busy");
	}
	const version = input.version;
	if (version !== 1) {
		return freezeErr("unsupported-version");
	}
	for (const key of Object.keys(input)) {
		if (!BOARD_ROOT_KEYS.has(key)) {
			return freezeErr("unknown-field");
		}
	}

	const cardsRaw = input.cards ?? input.entries;
	if (cardsRaw != null && !Array.isArray(cardsRaw)) {
		return freezeErr("invalid-busy");
	}

	const cards: WorktreeCard[] = [];
	for (const raw of (cardsRaw as unknown[]) ?? []) {
		if (!isPlainObject(raw) || hasAccessorTrap(raw)) {
			return freezeErr("invalid-busy");
		}
		for (const key of Object.keys(raw)) {
			if (!CARD_KEYS.has(key)) {
				return freezeErr("unknown-field");
			}
		}
		if (typeof raw.path !== "string" || !raw.path.trim()) {
			return freezeErr("invalid-path");
		}
		if (raw.busy != null && raw.busy !== "idle" && raw.busy !== "busy") {
			return freezeErr("invalid-busy");
		}
		const id =
			typeof raw.id === "string" && raw.id.trim()
				? raw.id
				: raw.path.split("/").filter(Boolean).pop() || "card";
		cards.push({
			id,
			path: raw.path,
			branch: typeof raw.branch === "string" ? raw.branch : undefined,
			head: typeof raw.head === "string" ? raw.head : undefined,
			detached: raw.detached === true ? true : undefined,
			bare: raw.bare === true ? true : undefined,
			label: typeof raw.label === "string" ? raw.label : undefined,
			busy: raw.busy === "busy" ? "busy" : "idle",
			agentRunId: typeof raw.agentRunId === "string" ? raw.agentRunId : undefined,
			sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
			bddPhase: typeof raw.bddPhase === "string" ? raw.bddPhase : undefined,
			dirty: raw.dirty === true ? true : undefined,
			updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
		});
	}

	const board = {
		version: 1 as const,
		repoRoot: typeof input.repoRoot === "string" ? input.repoRoot : "",
		maxBusyWriters:
			typeof input.maxBusyWriters === "number" && Number.isFinite(input.maxBusyWriters)
				? Math.floor(input.maxBusyWriters)
				: 2,
		focusedId: typeof input.focusedId === "string" ? input.focusedId : undefined,
		cards,
	};

	return freezeOk({ board });
}

// ── saveBoardAtomicV1 ───────────────────────────────────────────────────────

export function saveBoardAtomicV1(input: {
	path: string;
	next: unknown;
	priorBytes: string;
	lock: { tryAcquire: () => boolean; release: () => void };
	writeAtomic: (path: string, body: string) => void;
}) {
	const priorBytes = input.priorBytes;
	let acquired = false;
	try {
		acquired = input.lock.tryAcquire() === true;
		if (!acquired) {
			return freezeErr("lock-unavailable", { priorBytes });
		}
		const body = `${JSON.stringify(input.next, null, 2)}\n`;
		input.writeAtomic(input.path, body);
		return freezeOk({ bytes: body });
	} catch {
		return freezeErr("io-failed", { priorBytes });
	} finally {
		if (acquired) {
			try {
				input.lock.release();
			} catch {
				// ignore release errors
			}
		}
	}
}

// ── history + handoff ───────────────────────────────────────────────────────

export function appendAssignmentHistoryV1(input: {
	assignment: Record<string, unknown>;
	history: unknown[];
	event: unknown;
	limit?: number;
}) {
	const limit = typeof input.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : 64;
	const history = Array.isArray(input.history) ? input.history : [];
	const assignment = cloneJson(input.assignment);

	if (history.length >= limit) {
		return freezeErr("history-limit", { assignment });
	}

	const nextHistory = [...history.map((e) => cloneJson(e)), cloneJson(input.event)];
	return freezeOk({ assignment, history: nextHistory });
}

export function formatLifecycleHandoffV1(input: {
	assignment: {
		taskId?: string;
		role: string;
		cardId?: string;
		path: string;
		isolation?: string;
		branch?: string;
	};
	headSha: string;
	leaseId: string;
}) {
	const handoff = {
		path: input.assignment.path,
		role: input.assignment.role,
		leaseId: input.leaseId,
		head: input.headSha,
		cardId: input.assignment.cardId,
		taskId: input.assignment.taskId,
		branch: input.assignment.branch,
		isolation: input.assignment.isolation,
		// Observational only — never grants writer authority
		nextWriterBusy: false as const,
	};
	return freezeOk({
		handoff,
		grantsWriterAuthority: false as const,
	});
}
