/**
 * Ensure pi-subagents parallel caps support agentic-heavy fleets.
 * Writes are best-effort and never destructive on parse failure.
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface FleetDesiredCaps {
	maxTasks: number;
	concurrency: number;
	globalConcurrencyLimit: number;
	/** 0 = unlimited — we never auto-clear a positive user cap to 0 */
	maxSubagentSpawnsPerSession: number;
}

export const DEFAULT_FLEET_CAPS: FleetDesiredCaps = {
	maxTasks: 48,
	concurrency: 16,
	globalConcurrencyLimit: 48,
	maxSubagentSpawnsPerSession: 0,
};

export interface FleetUserConfig {
	caps?: Partial<FleetDesiredCaps>;
	models?: {
		default?: string;
		research?: string | string[];
		review?: string | string[];
		ux?: string | string[];
		pool?: string[];
	};
	defaultConcurrency?: number;
	asyncByDefault?: boolean;
	/** When true, allow ensureSubagentCaps to write config (default false — warn only) */
	autoRaiseCaps?: boolean;
	/** Default N for verify review fleets (default 3) */
	defaultVerifyCount?: number;
}

export interface LoadFleetUserConfigResult {
	config: FleetUserConfig;
	path?: string;
	parseError?: string;
}

export function subagentConfigPath(agentDir = join(homedir(), ".pi", "agent")): string {
	return join(agentDir, "extensions", "subagent", "config.json");
}

export function fleetUserConfigPath(agentDir = join(homedir(), ".pi", "agent")): string {
	return join(agentDir, "fleet.json");
}

function readJsonObject(
	path: string,
	read: (p: string) => string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
	try {
		const raw = JSON.parse(read(path)) as unknown;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			return { ok: false, error: `${path}: not a JSON object` };
		}
		return { ok: true, value: raw as Record<string, unknown> };
	} catch (err) {
		return { ok: false, error: `${path}: ${err instanceof Error ? err.message : String(err)}` };
	}
}

/** Shallow merge; nested models/caps objects are merged one level. Project may only narrow later. */
export function mergeFleetConfigs(
	base: FleetUserConfig,
	overlay: FleetUserConfig,
): FleetUserConfig {
	return {
		...base,
		...overlay,
		caps: { ...base.caps, ...overlay.caps },
		models: { ...base.models, ...overlay.models },
		defaultConcurrency: overlay.defaultConcurrency ?? base.defaultConcurrency,
		asyncByDefault: overlay.asyncByDefault ?? base.asyncByDefault,
		autoRaiseCaps: overlay.autoRaiseCaps ?? base.autoRaiseCaps,
		defaultVerifyCount: overlay.defaultVerifyCount ?? base.defaultVerifyCount,
	};
}

export function loadFleetUserConfigDetailed(
	path = fleetUserConfigPath(),
	io: { exists?: (p: string) => boolean; read?: (p: string) => string; cwd?: string } = {},
): LoadFleetUserConfigResult {
	const exists = io.exists ?? existsSync;
	const read = io.read ?? ((p: string) => readFileSync(p, "utf8"));
	const candidates = [path];
	if (!exists(path)) {
		candidates.push(join(homedir(), "dotfiles", "pi", ".pi", "agent", "fleet.json"));
	}
	let config: FleetUserConfig = {};
	let loadedPath: string | undefined;
	let lastParseError: string | undefined;
	for (const candidate of candidates) {
		if (!exists(candidate)) continue;
		const parsed = readJsonObject(candidate, read);
		if (!parsed.ok) {
			lastParseError = parsed.error;
			continue;
		}
		config = parsed.value as FleetUserConfig;
		loadedPath = candidate;
		break;
	}

	// Project overlay: cwd/.pi/fleet.json (additive; does not replace user file path reporting)
	const cwd = io.cwd ?? process.cwd();
	const projectPath = join(cwd, ".pi", "fleet.json");
	if (exists(projectPath)) {
		const proj = readJsonObject(projectPath, read);
		if (proj.ok) {
			config = mergeFleetConfigs(config, proj.value as FleetUserConfig);
			loadedPath = loadedPath ? `${loadedPath} + ${projectPath}` : projectPath;
		} else {
			lastParseError = proj.error;
		}
	}

	return { config, path: loadedPath, parseError: lastParseError };
}

export function loadFleetUserConfig(
	path = fleetUserConfigPath(),
	io: { exists?: (p: string) => boolean; read?: (p: string) => string; cwd?: string } = {},
): FleetUserConfig {
	return loadFleetUserConfigDetailed(path, io).config;
}

export function resolveCaps(user?: FleetUserConfig): FleetDesiredCaps {
	return {
		maxTasks: user?.caps?.maxTasks ?? DEFAULT_FLEET_CAPS.maxTasks,
		concurrency: user?.caps?.concurrency ?? DEFAULT_FLEET_CAPS.concurrency,
		globalConcurrencyLimit:
			user?.caps?.globalConcurrencyLimit ?? DEFAULT_FLEET_CAPS.globalConcurrencyLimit,
		maxSubagentSpawnsPerSession:
			user?.caps?.maxSubagentSpawnsPerSession ?? DEFAULT_FLEET_CAPS.maxSubagentSpawnsPerSession,
	};
}

export interface EnsureCapsResult {
	wrote: boolean;
	config: Record<string, unknown>;
	path: string;
	error?: string;
	/** Effective runtime maxTasks (from file before write, or after if wrote) */
	effectiveMaxTasks: number;
	effectiveConcurrency: number;
	/** True when file needs raise but write was skipped (warn-only mode or symlink/error) */
	needsRaise?: boolean;
	skippedWriteReason?: string;
}

/**
 * Merge desired parallel caps into subagent config.json.
 * - Never lowers existing higher values
 * - Never overwrites unparsable files
 * - Never auto-clears positive spawn caps to 0
 * - Does not force asyncWidget
 * - write=false by default via options.allowWrite
 */
export function ensureSubagentCaps(
	desired: FleetDesiredCaps,
	path = subagentConfigPath(),
	io: {
		exists?: (p: string) => boolean;
		read?: (p: string) => string;
		write?: (p: string, body: string) => void;
		mkdir?: (p: string) => void;
		isSymlink?: (p: string) => boolean;
	} = {},
	options: { allowWrite?: boolean } = {},
): EnsureCapsResult {
	const exists = io.exists ?? existsSync;
	const read = io.read ?? ((p: string) => readFileSync(p, "utf8"));
	const write =
		io.write ??
		((p: string, body: string) => {
			writeFileSync(p, body, "utf8");
		});
	const mkdir =
		io.mkdir ??
		((p: string) => {
			mkdirSync(p, { recursive: true });
		});
	const isSymlink =
		io.isSymlink ??
		((p: string) => {
			try {
				return lstatSync(p).isSymbolicLink();
			} catch {
				return false;
			}
		});

	let current: Record<string, unknown> = {};
	let parseFailed = false;
	if (exists(path)) {
		try {
			const parsed = JSON.parse(read(path)) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				current = parsed as Record<string, unknown>;
			} else {
				parseFailed = true;
			}
		} catch (err) {
			return {
				wrote: false,
				config: {},
				path,
				error: `Refusing to write corrupt config at ${path}: ${err instanceof Error ? err.message : String(err)}`,
				effectiveMaxTasks: desired.maxTasks,
				effectiveConcurrency: desired.concurrency,
				needsRaise: true,
				skippedWriteReason: "parse_error",
			};
		}
	}
	if (parseFailed) {
		return {
			wrote: false,
			config: current,
			path,
			error: `Refusing to write: ${path} is not a JSON object`,
			effectiveMaxTasks: desired.maxTasks,
			effectiveConcurrency: desired.concurrency,
			needsRaise: true,
			skippedWriteReason: "parse_error",
		};
	}

	const parallelIn =
		current.parallel && typeof current.parallel === "object" && !Array.isArray(current.parallel)
			? { ...(current.parallel as Record<string, unknown>) }
			: {};

	const prevMax = typeof parallelIn.maxTasks === "number" ? parallelIn.maxTasks : 0;
	const prevConc = typeof parallelIn.concurrency === "number" ? parallelIn.concurrency : 0;
	const prevGlobal =
		typeof current.globalConcurrencyLimit === "number" ? current.globalConcurrencyLimit : 0;

	const nextMax = Math.max(prevMax || 0, desired.maxTasks);
	const nextConc = Math.max(prevConc || 0, desired.concurrency);
	const nextGlobal = Math.max(prevGlobal || 0, desired.globalConcurrencyLimit);

	// Runtime-effective = what is already on disk (pi-subagents loads at startup)
	const effectiveMaxTasks = prevMax > 0 ? prevMax : desired.maxTasks;
	const effectiveConcurrency = prevConc > 0 ? prevConc : desired.concurrency;

	let changed = false;
	if (parallelIn.maxTasks !== nextMax) {
		parallelIn.maxTasks = nextMax;
		changed = true;
	}
	if (parallelIn.concurrency !== nextConc) {
		parallelIn.concurrency = nextConc;
		changed = true;
	}
	if (current.globalConcurrencyLimit !== nextGlobal) {
		current.globalConcurrencyLimit = nextGlobal;
		changed = true;
	}

	// Only raise positive spawn caps — never clear a limit to unlimited automatically
	const prevSpawns =
		typeof current.maxSubagentSpawnsPerSession === "number"
			? current.maxSubagentSpawnsPerSession
			: undefined;
	if (
		desired.maxSubagentSpawnsPerSession > 0 &&
		prevSpawns !== 0 &&
		(prevSpawns === undefined || prevSpawns < desired.maxSubagentSpawnsPerSession)
	) {
		current.maxSubagentSpawnsPerSession = Math.max(
			prevSpawns ?? 0,
			desired.maxSubagentSpawnsPerSession,
		);
		changed = true;
	}

	current.parallel = parallelIn;

	if (!changed) {
		return {
			wrote: false,
			config: current,
			path,
			effectiveMaxTasks: prevMax > 0 ? prevMax : nextMax,
			effectiveConcurrency: prevConc > 0 ? prevConc : nextConc,
		};
	}

	const allowWrite = options.allowWrite === true;
	if (!allowWrite) {
		return {
			wrote: false,
			config: current,
			path,
			effectiveMaxTasks,
			effectiveConcurrency,
			needsRaise: true,
			skippedWriteReason: "allowWrite=false (set fleet.json autoRaiseCaps:true or /fleet init-caps)",
		};
	}

	if (exists(path) && isSymlink(path)) {
		return {
			wrote: false,
			config: current,
			path,
			effectiveMaxTasks,
			effectiveConcurrency,
			needsRaise: true,
			skippedWriteReason: "config is a symlink into a git tree; write skipped to avoid dirtying the repo",
			error: `Skipped write to symlinked ${path}`,
		};
	}

	try {
		mkdir(dirname(path));
		write(path, `${JSON.stringify(current, null, "\t")}\n`);
		return {
			wrote: true,
			config: current,
			path,
			effectiveMaxTasks: nextMax,
			effectiveConcurrency: nextConc,
			needsRaise: true, // still needs /reload for live pi-subagents
			skippedWriteReason: "wrote; /reload required for pi-subagents to pick up new caps",
		};
	} catch (err) {
		return {
			wrote: false,
			config: current,
			path,
			error: err instanceof Error ? err.message : String(err),
			effectiveMaxTasks,
			effectiveConcurrency,
			needsRaise: true,
			skippedWriteReason: "write_failed",
		};
	}
}
