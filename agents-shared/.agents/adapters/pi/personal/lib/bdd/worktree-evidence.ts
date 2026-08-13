import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ClosedCommandEvidence = {
	command: string;
	exitCode: number;
	summary: string;
};

export type WorktreeBoundEvidence = {
	red?: ClosedCommandEvidence;
	green?: ClosedCommandEvidence;
};

const STORES = new Map<string, WorktreeBoundEvidence>();

function path(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.startsWith("/") &&
		!value.includes("\\") &&
		!value.split("/").includes("..")
	);
}

function closedCommand(value: unknown): ClosedCommandEvidence | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	if (typeof record.command !== "string" || !record.command.trim()) return undefined;
	if (typeof record.exitCode !== "number" || !Number.isFinite(record.exitCode)) return undefined;
	if (typeof record.summary !== "string") return undefined;
	return {
		command: record.command,
		exitCode: record.exitCode,
		summary: record.summary,
	};
}

function closedEvidence(value: unknown): WorktreeBoundEvidence {
	if (!value || typeof value !== "object") return {};
	const record = value as Record<string, unknown>;
	const evidence: WorktreeBoundEvidence = {};
	const red = closedCommand(record.red);
	const green = closedCommand(record.green);
	if (red) evidence.red = red;
	if (green) evidence.green = green;
	return evidence;
}

export function resolveRecordingWorktreeV1(
	input: Readonly<{ cwd: string; parentPath: string }>,
) {
	if (!path(input.cwd) || !path(input.parentPath) || input.cwd === input.parentPath) {
		return Object.freeze({ ok: false as const, code: "unknown" as const });
	}
	return Object.freeze({
		ok: true as const,
		worktreePath: input.cwd,
		parentPath: input.parentPath,
	});
}

export function bindWorktreeEvidenceV1(
	input: Readonly<{
		worktreePath: string;
		parentPath: string;
		evidence: WorktreeBoundEvidence;
	}>,
) {
	if (!path(input.worktreePath) || !path(input.parentPath) || input.worktreePath === input.parentPath) {
		return Object.freeze({ ok: false as const, code: "unknown" as const });
	}
	const evidence = structuredClone(closedEvidence(input.evidence));
	STORES.set(input.worktreePath, evidence);
	const storePath = join(input.worktreePath, ".pi", "bdd-evidence.json");
	mkdirSync(join(input.worktreePath, ".pi"), { recursive: true });
	writeFileSync(storePath, `${JSON.stringify(evidence)}\n`);
	return Object.freeze({ ok: true as const, worktreePath: input.worktreePath, storePath });
}

export function readWorktreeEvidenceV1(input: Readonly<{ worktreePath: string }>) {
	if (!path(input.worktreePath)) return Object.freeze({ ok: false as const, code: "unknown" as const });
	if (STORES.has(input.worktreePath)) {
		return Object.freeze({ ok: true as const, evidence: structuredClone(STORES.get(input.worktreePath)) });
	}
	try {
		const stored = JSON.parse(readFileSync(join(input.worktreePath, ".pi", "bdd-evidence.json"), "utf8"));
		return Object.freeze({ ok: true as const, evidence: closedEvidence(stored) });
	} catch {
		return Object.freeze({ ok: false as const, code: "unknown" as const });
	}
}

export function handoffWorktreeEvidenceV1(
	input: Readonly<{
		cwd: string;
		parentPath: string;
		sessionEvidence?: WorktreeBoundEvidence;
	}>,
) {
	const identity = resolveRecordingWorktreeV1({ cwd: input.cwd, parentPath: input.parentPath });
	if (!identity.ok) {
		return Object.freeze({
			ok: false as const,
			code: "unknown" as const,
			missing: Object.freeze(["unknown"]),
		});
	}
	const stored = readWorktreeEvidenceV1({ worktreePath: identity.worktreePath });
	if (!stored.ok) {
		return Object.freeze({
			ok: false as const,
			code: "unknown" as const,
			missing: Object.freeze(["missing"]),
		});
	}
	const evidence = stored.evidence ?? {};
	if (!evidence.red || !evidence.green) {
		return Object.freeze({
			ok: false as const,
			code: "missing" as const,
			missing: Object.freeze(["missing"]),
			evidence,
		});
	}
	return Object.freeze({ ok: true as const, evidence });
}
