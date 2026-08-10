/**
 * Load / infer per-project BDD config. Works across repos without hardcoding
 * olhaminha.bio paths — projects opt in with `.pi/bdd.json` or get sensible defaults.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectProjectProfile } from "./project-profile.ts";
import type {
	AssuranceConfig,
	BddCommands,
	BddConfig,
	GateExecutorSpec,
	QualityGateKind,
	TrustProfile,
	TrustTier,
} from "./types.ts";
import {
	DEFAULT_CONFIG_PATTERNS,
	DEFAULT_DOCS_PATTERNS,
	DEFAULT_FEATURE_PATTERNS,
	DEFAULT_IMPL_PATTERNS,
	DEFAULT_TEST_PATTERNS,
	QUALITY_GATE_KINDS,
} from "./types.ts";

export const CONFIG_CANDIDATES = [".pi/bdd.json", "bdd.json", ".bdd-tdd.json"] as const;
export const UNCONFIGURED_UNIT_TEST =
	"printf 'No unit test command detected. Configure .pi/bdd.json.\\n' >&2; exit 127";

export function defaultConfig(partial?: Partial<BddConfig> & { commands?: Partial<BddCommands> }): BddConfig {
	return {
		version: 1,
		enabledByDefault: partial?.enabledByDefault ?? false,
		strictGreenCoversRed: partial?.strictGreenCoversRed ?? true,
		featurePathPatterns: partial?.featurePathPatterns ?? [...DEFAULT_FEATURE_PATTERNS],
		testPathPatterns: partial?.testPathPatterns ?? [...DEFAULT_TEST_PATTERNS],
		implementationPathPatterns: partial?.implementationPathPatterns ?? [...DEFAULT_IMPL_PATTERNS],
		docsPathPatterns: partial?.docsPathPatterns ?? [...DEFAULT_DOCS_PATTERNS],
		configPathPatterns: partial?.configPathPatterns ?? [...DEFAULT_CONFIG_PATTERNS],
		alwaysAllowPathPatterns: partial?.alwaysAllowPathPatterns,
		projectLabel: partial?.projectLabel,
		assurance: partial?.assurance,
		commands: {
			unitTest: partial?.commands?.unitTest ?? UNCONFIGURED_UNIT_TEST,
			acceptanceTest: partial?.commands?.acceptanceTest,
			acceptanceGenerate: partial?.commands?.acceptanceGenerate,
			format: partial?.commands?.format,
			staticAnalysis: partial?.commands?.staticAnalysis,
			typecheck: partial?.commands?.typecheck,
			propertyTest: partial?.commands?.propertyTest,
			coverage: partial?.commands?.coverage,
			mutation: partial?.commands?.mutation,
			architecture: partial?.commands?.architecture,
			doctor: partial?.commands?.doctor,
			security: partial?.commands?.security,
			performance: partial?.commands?.performance,
		},
	};
}

export function parseConfigJson(raw: unknown): BddConfig {
	if (!raw || typeof raw !== "object") {
		throw new Error("bdd config must be a JSON object");
	}
	const o = raw as Record<string, unknown>;
	const commandsIn =
		o.commands && typeof o.commands === "object"
			? (o.commands as Record<string, unknown>)
			: {};

	const strArr = (v: unknown, fallback: string[]): string[] =>
		Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : fallback;

	const command = (name: string): string | undefined =>
		typeof commandsIn[name] === "string" && String(commandsIn[name]).trim()
			? String(commandsIn[name])
			: undefined;
	const commands: BddCommands = {
		unitTest: command("unitTest") ?? UNCONFIGURED_UNIT_TEST,
		acceptanceTest: command("acceptanceTest"),
		acceptanceGenerate: command("acceptanceGenerate"),
		format: command("format"),
		staticAnalysis: command("staticAnalysis"),
		typecheck: command("typecheck"),
		propertyTest: command("propertyTest"),
		coverage: command("coverage"),
		mutation: command("mutation"),
		architecture: command("architecture"),
		doctor: command("doctor"),
		security: command("security"),
		performance: command("performance"),
	};
	const assurance = parseAssurance(o.assurance);

	return defaultConfig({
		enabledByDefault: o.enabledByDefault === true,
		strictGreenCoversRed: o.strictGreenCoversRed === false ? false : true,
		featurePathPatterns: strArr(o.featurePathPatterns, DEFAULT_FEATURE_PATTERNS),
		testPathPatterns: strArr(o.testPathPatterns, DEFAULT_TEST_PATTERNS),
		implementationPathPatterns: strArr(o.implementationPathPatterns, DEFAULT_IMPL_PATTERNS),
		docsPathPatterns: strArr(o.docsPathPatterns, DEFAULT_DOCS_PATTERNS),
		configPathPatterns: strArr(o.configPathPatterns, DEFAULT_CONFIG_PATTERNS),
		alwaysAllowPathPatterns: Array.isArray(o.alwaysAllowPathPatterns)
			? strArr(o.alwaysAllowPathPatterns, [])
			: undefined,
		projectLabel: typeof o.projectLabel === "string" ? o.projectLabel : undefined,
		commands,
		assurance,
	});
}

function isTrustProfile(value: unknown): value is TrustProfile {
	return value === "interactive" || value === "strict" || value === "overnight";
}

function parseExecutorSpec(raw: unknown, kindKey: string): GateExecutorSpec {
	if (!raw || typeof raw !== "object") {
		throw new Error(`malformed command executor for ${kindKey}: expected object (integrity)`);
	}
	const spec = raw as Record<string, unknown>;
	const kind = spec.kind;

	if (kind === "internal") {
		if (typeof spec.id !== "string" || !spec.id.trim()) {
			throw new Error(`malformed internal command for ${kindKey}: id required (integrity)`);
		}
		return { kind: "internal", id: String(spec.id) };
	}

	if (kind === "shell") {
		if (typeof spec.command !== "string" || !spec.command.trim()) {
			throw new Error(`malformed shell command for ${kindKey}: command required (integrity)`);
		}
		return {
			kind: "shell",
			command: String(spec.command),
			trustTier:
				typeof spec.trustTier === "string" ? (spec.trustTier as TrustTier) : "interactive_untrusted",
		};
	}

	// argv (explicit kind or versioned argv shape)
	if (kind === "argv" || kind === undefined || spec.version === 1 || "file" in spec) {
		const file = typeof spec.file === "string" ? spec.file : "";
		if (!file.trim()) {
			throw new Error(`malformed argv command for ${kindKey}: file required (invalid integrity)`);
		}
		if (!Array.isArray(spec.args) || !spec.args.every((a) => typeof a === "string")) {
			throw new Error(
				`malformed argv command for ${kindKey}: args must be string[] (invalid integrity)`,
			);
		}
		const argv: GateExecutorSpec = {
			kind: "argv",
			version: 1,
			file,
			args: spec.args as string[],
		};
		if (typeof spec.cwd === "string") argv.cwd = spec.cwd;
		if (typeof spec.timeoutMs === "number" && Number.isFinite(spec.timeoutMs)) {
			argv.timeoutMs = Number(spec.timeoutMs);
		}
		if (typeof spec.maxOutputBytes === "number" && Number.isFinite(spec.maxOutputBytes)) {
			argv.maxOutputBytes = Number(spec.maxOutputBytes);
		}
		return argv;
	}

	throw new Error(`malformed command executor for ${kindKey}: unknown kind ${String(kind)} (integrity)`);
}

function parseAssurance(raw: unknown): AssuranceConfig | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const value = raw as Record<string, unknown>;
	const kinds = new Set<string>(QUALITY_GATE_KINDS);

	let trustProfile: TrustProfile | undefined;
	if (value.trustProfile !== undefined) {
		if (!isTrustProfile(value.trustProfile)) {
			throw new Error(`invalid trust profile: ${String(value.trustProfile)} (integrity)`);
		}
		trustProfile = value.trustProfile;
	}
	const effectiveProfile: TrustProfile = trustProfile ?? "interactive";
	const strictish = effectiveProfile === "strict" || effectiveProfile === "overnight";

	const kindList = (input: unknown, field: string): QualityGateKind[] | undefined => {
		if (!Array.isArray(input)) return undefined;
		const out: QualityGateKind[] = [];
		for (const item of input) {
			if (typeof item !== "string") {
				if (strictish) throw new Error(`invalid gate kind in ${field} (integrity)`);
				continue;
			}
			if (!kinds.has(item)) {
				if (strictish) {
					throw new Error(`unknown gate kind: ${item} (integrity)`);
				}
				continue;
			}
			out.push(item as QualityGateKind);
		}
		return out;
	};

	const commandsIn =
		value.commands && typeof value.commands === "object"
			? (value.commands as Record<string, unknown>)
			: {};
	const commands: Partial<Record<QualityGateKind, string>> = {};
	for (const kind of QUALITY_GATE_KINDS) {
		if (typeof commandsIn[kind] === "string" && String(commandsIn[kind]).trim()) {
			commands[kind] = String(commandsIn[kind]);
		} else if (commandsIn[kind] !== undefined && strictish) {
			// Non-string command entries under strict must not be silently ignored.
			if (typeof commandsIn[kind] === "object" && commandsIn[kind] !== null) {
				// allow object forms via executors only
			}
		}
	}

	const executors: Partial<Record<QualityGateKind, GateExecutorSpec>> = {};
	const executorsIn =
		value.executors && typeof value.executors === "object"
			? (value.executors as Record<string, unknown>)
			: undefined;
	if (executorsIn) {
		for (const [key, spec] of Object.entries(executorsIn)) {
			if (!kinds.has(key)) {
				if (strictish) throw new Error(`unknown gate kind in executors: ${key} (integrity)`);
				continue;
			}
			executors[key as QualityGateKind] = parseExecutorSpec(spec, key);
		}
	}

	// Visible migration label for legacy shell command strings (E33).
	const commandTrust: Partial<Record<QualityGateKind, TrustTier>> = {};
	for (const kind of Object.keys(commands) as QualityGateKind[]) {
		const exec = executors[kind];
		if (exec?.kind === "argv" || exec?.kind === "internal") continue;
		commandTrust[kind] = "interactive_untrusted";
		if (!exec) {
			executors[kind] = {
				kind: "shell",
				command: commands[kind]!,
				trustTier: "interactive_untrusted",
			};
		}
	}

	const number = (name: string): number | undefined =>
		typeof value[name] === "number" && Number.isFinite(value[name])
			? Number(value[name])
			: undefined;
	const timeoutInput =
		value.gateTimeoutMs && typeof value.gateTimeoutMs === "object"
			? (value.gateTimeoutMs as Record<string, unknown>)
			: {};
	const gateTimeoutMs: Partial<Record<QualityGateKind, number>> = {};
	for (const kind of QUALITY_GATE_KINDS) {
		if (typeof timeoutInput[kind] === "number" && Number.isFinite(timeoutInput[kind])) {
			gateTimeoutMs[kind] = Number(timeoutInput[kind]);
		}
	}

	const result: AssuranceConfig = {
		enabled: value.enabled === true,
		trustProfile: effectiveProfile,
		requiredGateKinds: kindList(value.requiredGateKinds, "requiredGateKinds"),
		advisoryGateKinds: kindList(value.advisoryGateKinds, "advisoryGateKinds"),
		commands: Object.keys(commands).length ? commands : undefined,
		executors: Object.keys(executors).length ? executors : undefined,
		commandTrust: Object.keys(commandTrust).length ? commandTrust : undefined,
		coverageThreshold: number("coverageThreshold"),
		mutationThreshold: number("mutationThreshold"),
		doctorThreshold: number("doctorThreshold"),
		defaultTimeoutMs: number("defaultTimeoutMs"),
		gateTimeoutMs: Object.keys(gateTimeoutMs).length ? gateTimeoutMs : undefined,
	};
	return result;
}

/**
 * Deterministic fingerprint over trust-sensitive config fields (R8).
 * Covers version, green-coverage policy, commands, assurance trust/profile/kinds/executors/thresholds/timeouts.
 */
export function fingerprintConfig(config: BddConfig | unknown): string {
	const cfg = config as BddConfig;
	const assurance = cfg.assurance;
	const sorted = <T,>(obj: Record<string, T> | undefined | null): Record<string, T> => {
		if (!obj) return {};
		return Object.fromEntries(
			Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
		) as Record<string, T>;
	};
	const payload = {
		version: cfg.version ?? 1,
		strictGreenCoversRed: cfg.strictGreenCoversRed !== false,
		commands: sorted({ ...(cfg.commands ?? {}) } as Record<string, string | undefined>),
		assurance: assurance
			? {
					enabled: assurance.enabled === true,
					trustProfile: assurance.trustProfile ?? "interactive",
					requiredGateKinds: [...(assurance.requiredGateKinds ?? [])].sort(),
					advisoryGateKinds: [...(assurance.advisoryGateKinds ?? [])].sort(),
					commands: sorted(assurance.commands as Record<string, string> | undefined),
					executors: sorted(
						assurance.executors as Record<string, GateExecutorSpec> | undefined,
					),
					commandTrust: sorted(
						assurance.commandTrust as Record<string, string> | undefined,
					),
					coverageThreshold: assurance.coverageThreshold ?? null,
					mutationThreshold: assurance.mutationThreshold ?? null,
					doctorThreshold: assurance.doctorThreshold ?? null,
					defaultTimeoutMs: assurance.defaultTimeoutMs ?? null,
					gateTimeoutMs: sorted(
						assurance.gateTimeoutMs as Record<string, number> | undefined,
					),
				}
			: null,
	};
	return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export interface PackageScripts {
	scripts?: Record<string, string>;
	packageManager?: string;
}

/** Infer runner commands from package.json scripts when no bdd.json exists. */
export function inferCommandsFromPackage(pkg: PackageScripts | null | undefined): BddCommands {
	const scripts = pkg?.scripts ?? {};
	const has = (name: string) => typeof scripts[name] === "string";

	let unitTest = "bun test";
	if (has("test")) {
		// Prefer package manager from packageManager field
		const pm = pkg?.packageManager?.split("@")[0];
		if (pm === "bun") unitTest = "bun test";
		else if (pm === "pnpm") unitTest = "pnpm test";
		else if (pm === "yarn") unitTest = "yarn test";
		else if (pm === "npm") unitTest = "npm test --";
		else if (existsOnPathHint("bun")) unitTest = "bun test";
		else unitTest = "npm test --";
	}

	const acceptanceTest = has("gherkin:test")
		? scriptRun(pkg, "gherkin:test")
		: has("test:acceptance")
			? scriptRun(pkg, "test:acceptance")
			: has("test:e2e")
				? scriptRun(pkg, "test:e2e")
				: undefined;

	const acceptanceGenerate = has("gherkin:generate")
		? scriptRun(pkg, "gherkin:generate")
		: has("gherkin:check")
			? scriptRun(pkg, "gherkin:check")
			: undefined;

	const typecheck = has("typecheck")
		? scriptRun(pkg, "typecheck")
		: has("tsc")
			? scriptRun(pkg, "tsc")
			: undefined;
	const first = (...names: string[]): string | undefined => {
		const found = names.find(has);
		return found ? scriptRun(pkg, found) : undefined;
	};

	return {
		unitTest,
		acceptanceTest,
		acceptanceGenerate,
		typecheck,
		format: first("format:check", "format:ci"),
		staticAnalysis: first("lint", "lint:ci"),
		propertyTest: first("test:property", "property"),
		coverage: first("coverage", "test:coverage", "coverage:ci"),
		mutation: first("mutation", "test:mutation", "stryker"),
		architecture: first("architecture", "test:architecture", "arch:test"),
		doctor: first("doctor", "react-doctor"),
		security: first("security", "audit:security"),
		performance: first("test:performance", "benchmark", "perf"),
	};
}

function scriptRun(pkg: PackageScripts | null | undefined, script: string): string {
	const pm = pkg?.packageManager?.split("@")[0];
	if (pm === "bun") return `bun run ${script}`;
	if (pm === "pnpm") return `pnpm run ${script}`;
	if (pm === "yarn") return `yarn ${script}`;
	return `npm run ${script}`;
}

function existsOnPathHint(_bin: string): boolean {
	// Pure default — actual PATH checks happen at runtime in the extension if needed.
	return true;
}

export interface LoadConfigResult {
	config: BddConfig;
	source: "default" | "file" | "inferred";
	path?: string;
}

export function loadConfigFromCwd(
	cwd: string,
	io: {
		exists?: (p: string) => boolean;
		read?: (p: string) => string;
	} = {},
): LoadConfigResult {
	const exists = io.exists ?? existsSync;
	const read = io.read ?? ((p: string) => readFileSync(p, "utf8"));

	for (const rel of CONFIG_CANDIDATES) {
		const full = join(cwd, rel);
		if (!exists(full)) continue;
		try {
			const raw = JSON.parse(read(full)) as unknown;
			const config = parseConfigJson(raw);
			const rawCommands =
				raw && typeof raw === "object" &&
				(raw as Record<string, unknown>).commands &&
				typeof (raw as Record<string, unknown>).commands === "object"
					? ((raw as Record<string, unknown>).commands as Record<string, unknown>)
					: {};
			const profile = detectProjectProfile(cwd);
			let packageCommands: BddCommands | undefined;
			const packagePath = join(cwd, "package.json");
			if (exists(packagePath)) {
				try {
					packageCommands = inferCommandsFromPackage(JSON.parse(read(packagePath)) as PackageScripts);
				} catch {
					// Profile signals still provide conservative non-package fallbacks.
				}
			}
			const detected: Partial<BddCommands> = {
				unitTest: profile.commands.unitTest ?? packageCommands?.unitTest,
				acceptanceTest: profile.commands.acceptanceTest ?? packageCommands?.acceptanceTest,
				acceptanceGenerate: packageCommands?.acceptanceGenerate,
				format: profile.commands.format ?? packageCommands?.format,
				staticAnalysis: profile.commands.staticAnalysis ?? packageCommands?.staticAnalysis,
				typecheck: profile.commands.typecheck ?? packageCommands?.typecheck,
				propertyTest: profile.commands.propertyTest ?? packageCommands?.propertyTest,
				coverage: profile.commands.coverage ?? packageCommands?.coverage,
				mutation: profile.commands.mutation ?? packageCommands?.mutation,
				architecture: profile.commands.architecture ?? packageCommands?.architecture,
				doctor: profile.commands.doctor ?? packageCommands?.doctor,
				security: profile.commands.security ?? packageCommands?.security,
				performance: profile.commands.performance ?? packageCommands?.performance,
			};
			for (const key of Object.keys(detected) as Array<keyof BddCommands>) {
				if (!(key in rawCommands) && detected[key]) {
					Object.assign(config.commands, { [key]: detected[key] });
				}
			}
			return { config, source: "file", path: full };
		} catch (err) {
			throw new Error(
				`Failed to parse BDD config at ${full}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	// Infer from package scripts plus deterministic multi-stack repository signals.
	const pkgPath = join(cwd, "package.json");
	let packageCommands: BddCommands | undefined;
	if (exists(pkgPath)) {
		try {
			const pkg = JSON.parse(read(pkgPath)) as PackageScripts;
			packageCommands = inferCommandsFromPackage(pkg);
		} catch {
			// Project profile below still reports the malformed manifest signal.
		}
	}
	const profile = detectProjectProfile(cwd);
	if (profile.stacks.length > 0 || packageCommands) {
		const commands: BddCommands = {
			unitTest: profile.commands.unitTest ?? packageCommands?.unitTest ?? UNCONFIGURED_UNIT_TEST,
			acceptanceTest: profile.commands.acceptanceTest ?? packageCommands?.acceptanceTest,
			acceptanceGenerate: packageCommands?.acceptanceGenerate,
			format: profile.commands.format ?? packageCommands?.format,
			staticAnalysis: profile.commands.staticAnalysis ?? packageCommands?.staticAnalysis,
			typecheck: profile.commands.typecheck ?? packageCommands?.typecheck,
			propertyTest: profile.commands.propertyTest ?? packageCommands?.propertyTest,
			coverage: profile.commands.coverage ?? packageCommands?.coverage,
			mutation: profile.commands.mutation ?? packageCommands?.mutation,
			architecture: profile.commands.architecture ?? packageCommands?.architecture,
			doctor: profile.commands.doctor ?? packageCommands?.doctor,
			security: profile.commands.security ?? packageCommands?.security,
			performance: profile.commands.performance ?? packageCommands?.performance,
		};
		const primarySignal = ["package.json", "Cargo.toml", "go.mod", "pyproject.toml", "Package.swift"]
			.find((signal) => profile.signals.includes(signal));
		return {
			config: defaultConfig({ commands }),
			source: "inferred",
			path: primarySignal ? join(cwd, primarySignal) : undefined,
		};
	}

	return { config: defaultConfig(), source: "default" };
}

/** Template written by `/bdd init`. */
export function configTemplate(overrides?: Partial<BddCommands>): string {
	const cfg = defaultConfig({
		enabledByDefault: false,
		commands: {
			unitTest: overrides?.unitTest ?? UNCONFIGURED_UNIT_TEST,
			acceptanceTest: overrides?.acceptanceTest,
			acceptanceGenerate: overrides?.acceptanceGenerate,
			format: overrides?.format,
			staticAnalysis: overrides?.staticAnalysis,
			typecheck: overrides?.typecheck,
			propertyTest: overrides?.propertyTest,
			coverage: overrides?.coverage,
			mutation: overrides?.mutation,
			architecture: overrides?.architecture,
			doctor: overrides?.doctor,
			security: overrides?.security,
			performance: overrides?.performance,
		},
		projectLabel: undefined,
		assurance: {
			enabled: true,
			trustProfile: "interactive",
			requiredGateKinds: ["unit"],
			advisoryGateKinds: ["format", "static", "types", "coverage", "mutation", "doctor", "security"],
			coverageThreshold: 95,
			mutationThreshold: 80,
			doctorThreshold: 90,
		},
	});
	return `${JSON.stringify(cfg, null, 2)}\n`;
}
