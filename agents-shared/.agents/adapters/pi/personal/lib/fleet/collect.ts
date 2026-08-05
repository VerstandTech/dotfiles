/**
 * P0.3 — Collect fleet member outputs from pi-subagents asyncDir into run ledger dir.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

export type FleetMemberState =
	| "running"
	| "complete"
	| "failed"
	| "paused"
	| "stopped"
	| "missing"
	| "unknown";

export interface CollectedMember {
	index: number;
	state: FleetMemberState;
	sourcePath?: string;
	snapshotPath?: string;
	errorSnippet?: string;
}

export interface CollectResult {
	runId: string;
	asyncDir?: string;
	runDir: string;
	membersDir: string;
	statusPath?: string;
	members: CollectedMember[];
	completeCount: number;
	failedCount: number;
	runningCount: number;
}

function readJson(path: string): Record<string, unknown> | undefined {
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (raw && typeof raw === "object" && !Array.isArray(raw)) {
			return raw as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return undefined;
}

function mapState(raw: unknown): FleetMemberState {
	const s = String(raw ?? "").toLowerCase();
	if (s.includes("fail") || s.includes("error") || s.includes("reject")) return "failed";
	if (s.includes("complete") || s.includes("done") || s === "success") return "complete";
	if (s.includes("pause")) return "paused";
	if (s.includes("stop")) return "stopped";
	if (s.includes("run") || s.includes("active") || s.includes("pending")) return "running";
	return "unknown";
}

/**
 * Snapshot status.json + member markdown/logs into `.pi/fleet-runs/<runId>/members/`.
 */
export function collectFleetRun(input: {
	cwd: string;
	runId: string;
	asyncDir?: string;
	/** Existing plan.json dir; default .pi/fleet-runs/<runId> */
	runDir?: string;
}): CollectResult {
	const safeId = input.runId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
	const runDir = input.runDir ?? join(input.cwd, ".pi", "fleet-runs", safeId);
	const membersDir = join(runDir, "members");
	mkdirSync(membersDir, { recursive: true });

	const members: CollectedMember[] = [];
	let statusPath: string | undefined;

	const asyncDir = input.asyncDir;
	if (asyncDir && existsSync(asyncDir)) {
		const statusFile = join(asyncDir, "status.json");
		if (existsSync(statusFile)) {
			statusPath = join(runDir, "status.json");
			try {
				copyFileSync(statusFile, statusPath);
			} catch {
				// ignore
			}
			const status = readJson(statusFile);
			const results = Array.isArray(status?.results) ? status!.results : [];
			results.forEach((r, index) => {
				const row = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
				const state = mapState(row.status ?? row.state ?? row.error);
				const errorSnippet =
					typeof row.error === "string"
						? row.error.slice(0, 300)
						: typeof row.message === "string"
							? row.message.slice(0, 300)
							: undefined;
				members.push({ index, state, errorSnippet });
			});
		}

		// Copy output-*.log tails as member notes
		try {
			const files = readdirSync(asyncDir).filter((f) => /^output-\d+\.log$/.test(f));
			for (const f of files) {
				const index = Number(f.match(/\d+/)?.[0] ?? 0);
				const src = join(asyncDir, f);
				const dest = join(membersDir, f);
				try {
					const st = statSync(src);
					// copy last ~200KB only via read slice for huge logs
					const buf = readFileSync(src);
					const slice = buf.length > 200_000 ? buf.subarray(buf.length - 200_000) : buf;
					writeFileSync(dest, slice);
					const existing = members.find((m) => m.index === index);
					if (existing) {
						existing.sourcePath = src;
						existing.snapshotPath = dest;
						if (existing.state === "unknown" || existing.state === "running") {
							// heuristic: acceptance-report or # Review means complete
							const text = slice.toString("utf8");
							if (/^# Review/m.test(text) || /acceptance-report/.test(text)) {
								existing.state = "complete";
							} else if (/No API key found|error:/i.test(text) && text.length < 2000) {
								existing.state = "failed";
							}
						}
					} else {
						const text = slice.toString("utf8");
						let state: FleetMemberState = "unknown";
						if (/^# Review/m.test(text) || /acceptance-report/.test(text)) state = "complete";
						else if (/No API key found/i.test(text)) state = "failed";
						members.push({
							index,
							state,
							sourcePath: src,
							snapshotPath: dest,
							errorSnippet: state === "failed" ? text.slice(0, 300) : undefined,
						});
					}
				} catch {
					// ignore per-file
				}
			}
		} catch {
			// ignore
		}
	}

	// Also pull any nested artifact markdown under pi-subagents outputs for this runId
	const artifactRoot = join(input.cwd, ".pi-subagents", "artifacts", "outputs", input.runId);
	if (existsSync(artifactRoot)) {
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const p = join(dir, name);
				try {
					const st = statSync(p);
					if (st.isDirectory()) walk(p);
					else if (name.endsWith(".md")) {
						const dest = join(membersDir, basename(p));
						copyFileSync(p, dest);
						members.push({
							index: members.length,
							state: "complete",
							sourcePath: p,
							snapshotPath: dest,
						});
					}
				} catch {
					// ignore
				}
			}
		};
		try {
			walk(artifactRoot);
		} catch {
			// ignore
		}
	}

	if (members.length === 0) {
		members.push({ index: 0, state: "missing" });
	}

	const summary = {
		runId: input.runId,
		asyncDir,
		collectedAt: new Date().toISOString(),
		members: members.map((m) => ({
			index: m.index,
			state: m.state,
			snapshotPath: m.snapshotPath,
			errorSnippet: m.errorSnippet,
		})),
	};
	writeFileSync(join(runDir, "collect.json"), `${JSON.stringify(summary, null, 2)}\n`);

	return {
		runId: input.runId,
		asyncDir,
		runDir,
		membersDir,
		statusPath,
		members,
		completeCount: members.filter((m) => m.state === "complete").length,
		failedCount: members.filter((m) => m.state === "failed").length,
		runningCount: members.filter((m) => m.state === "running").length,
	};
}

export function formatCollectReport(result: CollectResult): string {
	const lines = [
		`# Fleet collect — ${result.runId}`,
		``,
		`- complete: ${result.completeCount}`,
		`- failed: ${result.failedCount}`,
		`- running: ${result.runningCount}`,
		`- members dir: \`${result.membersDir}\``,
		result.statusPath ? `- status: \`${result.statusPath}\`` : undefined,
		``,
		`## Members`,
		...result.members.map(
			(m) =>
				`- #${m.index} **${m.state}**` +
				(m.snapshotPath ? ` → \`${m.snapshotPath}\`` : "") +
				(m.errorSnippet ? ` — ${m.errorSnippet.replace(/\s+/g, " ").slice(0, 120)}` : ""),
		),
		``,
		`Next: write \`${result.runDir}/synthesis.md\` then:`,
		`\`bdd_record_evidence fleetRunId=${result.runId} fleetSynthesisPath=${result.runDir}/synthesis.md\``,
	].filter(Boolean) as string[];
	return lines.join("\n");
}
