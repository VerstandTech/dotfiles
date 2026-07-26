/**
 * Load / infer per-project BDD config. Works across repos without hardcoding
 * olhaminha.bio paths — projects opt in with `.pi/bdd.json` or get sensible defaults.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectProjectProfile } from "./project-profile.ts";
import type {
	AssuranceConfig,
	BddCommands,
	BddConfig,
	QualityGateKind,
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

function parseAssurance(raw: unknown): AssuranceConfig | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const value = raw as Record<string, unknown>;
	const kinds = new Set<string>(QUALITY_GATE_KINDS);
	const kindList = (input: unknown): QualityGateKind[] | undefined =>
		Array.isArray(input)
			? input.filter((item): item is QualityGateKind => typeof item === "string" && kinds.has(item))
			: undefined;
	const commandsIn =
		value.commands && typeof value.commands === "object"
			? (value.commands as Record<string, unknown>)
			: {};
	const commands: Partial<Record<QualityGateKind, string>> = {};
	for (const kind of QUALITY_GATE_KINDS) {
		if (typeof commandsIn[kind] === "string" && String(commandsIn[kind]).trim()) {
			commands[kind] = String(commandsIn[kind]);
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
	return {
		enabled: value.enabled === true,
		requiredGateKinds: kindList(value.requiredGateKinds),
		advisoryGateKinds: kindList(value.advisoryGateKinds),
		commands: Object.keys(commands).length ? commands : undefined,
		coverageThreshold: number("coverageThreshold"),
		mutationThreshold: number("mutationThreshold"),
		doctorThreshold: number("doctorThreshold"),
		defaultTimeoutMs: number("defaultTimeoutMs"),
		gateTimeoutMs: Object.keys(gateTimeoutMs).length ? gateTimeoutMs : undefined,
	};
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
			requiredGateKinds: ["unit"],
			advisoryGateKinds: ["format", "static", "types", "coverage", "mutation", "doctor", "security"],
			coverageThreshold: 95,
			mutationThreshold: 80,
			doctorThreshold: 90,
		},
	});
	return `${JSON.stringify(cfg, null, 2)}\n`;
}
