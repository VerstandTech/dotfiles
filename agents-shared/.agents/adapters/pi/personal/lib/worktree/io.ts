/**
 * Load/save project worktree board registry.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BoardRegistryFile } from "./types.ts";

export function registryPath(repoRoot: string): string {
	return join(resolve(repoRoot), ".pi", "worktree-board.json");
}

export function loadRegistry(
	repoRoot: string,
	io: { exists?: (p: string) => boolean; read?: (p: string) => string } = {},
): BoardRegistryFile {
	const exists = io.exists ?? existsSync;
	const read = io.read ?? ((p: string) => readFileSync(p, "utf8"));
	const path = registryPath(repoRoot);
	if (!exists(path)) return { version: 1, entries: [] };
	try {
		const raw = JSON.parse(read(path)) as BoardRegistryFile;
		if (!raw || raw.version !== 1) return { version: 1, entries: [] };
		const maxBusyWriters = clampMaxBusy(raw.maxBusyWriters);
		const entries = (raw.entries ?? [])
			.filter((e) => e && typeof e.path === "string" && e.path.trim().length > 0)
			.map((e) => ({
				path: e.path,
				id: typeof e.id === "string" ? e.id : undefined,
				label: typeof e.label === "string" ? e.label : undefined,
				busy: e.busy === "busy" ? ("busy" as const) : ("idle" as const),
				agentRunId: typeof e.agentRunId === "string" ? e.agentRunId : undefined,
				sessionId: typeof e.sessionId === "string" ? e.sessionId : undefined,
				bddPhase: typeof e.bddPhase === "string" ? e.bddPhase : undefined,
			}));
		return {
			version: 1,
			maxBusyWriters,
			focusedId: typeof raw.focusedId === "string" ? raw.focusedId : undefined,
			entries,
		};
	} catch {
		return { version: 1, entries: [] };
	}
}

/** Keep writer cap in a sane band (D2 safety). */
export function clampMaxBusy(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	const n = Math.floor(value);
	if (n < 1) return 1;
	if (n > 8) return 8;
	return n;
}

export function saveRegistry(
	repoRoot: string,
	registry: BoardRegistryFile,
	io: {
		mkdir?: (p: string) => void;
		write?: (p: string, body: string) => void;
	} = {},
): string {
	const path = registryPath(repoRoot);
	const mkdir = io.mkdir ?? ((p: string) => mkdirSync(p, { recursive: true }));
	const write = io.write ?? ((p: string, b: string) => writeFileSync(p, b, "utf8"));
	mkdir(dirname(path));
	const body = JSON.stringify({ ...registry, version: 1 } satisfies BoardRegistryFile, null, 2) + "\n";
	write(path, body);
	return path;
}
