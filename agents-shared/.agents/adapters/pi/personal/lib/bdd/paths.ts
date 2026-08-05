/**
 * Path classification and phase-based write gates.
 * Patterns are intentionally simple: `**` / `*` globs, prefix dirs, or substrings.
 */

import type { BddConfig, BddPhase, PathClass, PathGateResult } from "./types.ts";

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Convert a simple glob to a RegExp. Supports `**`, `*`, and trailing `/`. */
export function globToRegExp(pattern: string): RegExp {
	const normalized = normalizePath(pattern.trim());
	let i = 0;
	let out = "^";
	while (i < normalized.length) {
		const ch = normalized[i]!;
		if (ch === "*" && normalized[i + 1] === "*") {
			// ** optionally followed by /
			if (normalized[i + 2] === "/") {
				out += "(?:.*/)?";
				i += 3;
			} else {
				out += ".*";
				i += 2;
			}
			continue;
		}
		if (ch === "*") {
			out += "[^/]*";
			i += 1;
			continue;
		}
		if (ch === "?") {
			out += "[^/]";
			i += 1;
			continue;
		}
		if ("+.^${}()|[]\\".includes(ch)) {
			out += `\\${ch}`;
			i += 1;
			continue;
		}
		out += ch;
		i += 1;
	}
	out += "$";
	return new RegExp(out, "i");
}

export function matchesPattern(path: string, pattern: string): boolean {
	const p = normalizePath(path);
	const pat = normalizePath(pattern);
	if (!pat) return false;
	// Directory prefix: "src/" or "tests/unit/"
	if (pat.endsWith("/") && !pat.includes("*")) {
		return p === pat.slice(0, -1) || p.startsWith(pat);
	}
	if (pat.includes("*") || pat.includes("?")) {
		return globToRegExp(pat).test(p);
	}
	// Exact or path segment contains
	if (p === pat) return true;
	if (p.endsWith(`/${pat}`)) return true;
	if (p.includes(`/${pat}/`)) return true;
	// basename match for files like AGENTS.md
	const base = p.split("/").pop() ?? p;
	if (base.toLowerCase() === pat.toLowerCase()) return true;
	return false;
}

export function matchesAny(path: string, patterns: string[] | undefined): boolean {
	if (!patterns?.length) return false;
	return patterns.some((pat) => matchesPattern(path, pat));
}

/**
 * Classify a path. Order matters: feature > test > config > docs > impl > other.
 * Config is checked before docs so bdd.json is editable as config.
 */
export function classifyPath(path: string, config: BddConfig): PathClass {
	const p = normalizePath(path);
	if (matchesAny(p, config.featurePathPatterns)) return "feature";
	if (matchesAny(p, config.testPathPatterns)) return "test";
	if (matchesAny(p, config.configPathPatterns)) return "config";
	if (matchesAny(p, config.docsPathPatterns)) return "docs";
	if (matchesAny(p, config.implementationPathPatterns)) return "impl";
	return "other";
}

const PHASE_ALLOW: Record<Exclude<BddPhase, "off">, ReadonlySet<PathClass>> = {
	discovery: new Set(["docs", "config"]),
	formulation: new Set(["docs", "config", "feature", "test"]),
	red: new Set(["docs", "config", "feature", "test"]),
	green: new Set(["docs", "config", "feature", "test", "impl", "other"]),
	refactor: new Set(["docs", "config", "feature", "test", "impl", "other"]),
	verify: new Set(["docs", "config", "feature", "test", "impl", "other"]),
};

/** Path classes that count as production implementation for red-before-green. */
const IMPL_LIKE: ReadonlySet<PathClass> = new Set(["impl", "other"]);

/**
 * Decide whether edit/write to `path` is allowed in `phase`.
 * When phase is `off` or gates bypassed, everything is allowed.
 */
export function evaluatePathGate(options: {
	path: string;
	phase: BddPhase;
	config: BddConfig;
	enabled: boolean;
	bypass?: boolean;
	hasRedEvidence?: boolean;
}): PathGateResult {
	const path = normalizePath(options.path);
	const pathClass = classifyPath(path, options.config);

	if (!options.enabled || options.phase === "off" || options.bypass) {
		return { allowed: true, pathClass };
	}

	if (matchesAny(path, options.config.alwaysAllowPathPatterns)) {
		return { allowed: true, pathClass };
	}

	const allow = PHASE_ALLOW[options.phase];
	if (!allow.has(pathClass)) {
		return {
			allowed: false,
			pathClass,
			reason:
				`BDD ${options.phase}: writes to ${pathClass} paths are blocked (${path}). ` +
				`Allowed classes: ${[...allow].join(", ")}. ` +
				`Advance phase with /bdd <phase> or bdd_set_phase, or /bdd bypass <reason>.`,
		};
	}

	// Hard TDD rule: no implementation-like writes until a failing test is recorded
	if (
		(options.phase === "green" || options.phase === "refactor" || options.phase === "verify") &&
		IMPL_LIKE.has(pathClass) &&
		!options.hasRedEvidence
	) {
		return {
			allowed: false,
			pathClass,
			reason:
				`BDD ${options.phase}: implementation writes require recorded red evidence first. ` +
				`Write/run a failing test and call bdd_assert_red (or /bdd red + assert). Path: ${path}`,
		};
	}

	// In red/discovery/formulation, block impl-like paths even if misclassified as other
	if (
		(options.phase === "red" || options.phase === "discovery" || options.phase === "formulation") &&
		pathClass === "impl"
	) {
		return {
			allowed: false,
			pathClass,
			reason: `BDD ${options.phase}: do not implement yet (${path}). Keep the test failing, then /bdd green.`,
		};
	}

	return { allowed: true, pathClass };
}
