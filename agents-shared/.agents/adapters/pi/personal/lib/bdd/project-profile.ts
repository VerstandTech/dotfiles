import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

export type ProjectStack =
	| "go"
	| "javascript"
	| "python"
	| "rust"
	| "swift"
	| "typescript";

export type ProjectPackageManager =
	| "bun"
	| "cargo"
	| "go"
	| "npm"
	| "pnpm"
	| "poetry"
	| "swiftpm"
	| "uv"
	| "yarn";

export interface ProjectCommands {
	format?: string;
	staticAnalysis?: string;
	typecheck?: string;
	unitTest?: string;
	acceptanceTest?: string;
	propertyTest?: string;
	coverage?: string;
	mutation?: string;
	architecture?: string;
	doctor?: string;
	security?: string;
	performance?: string;
}

export interface ProjectProfile {
	version: 1;
	root: string;
	stacks: ProjectStack[];
	packageManagers: ProjectPackageManager[];
	frameworks: string[];
	signals: string[];
	commands: ProjectCommands;
	confidence: "high" | "medium" | "low";
	fingerprint: string;
}

interface Signal {
	path: string;
	content: string;
}

const SOURCE_MARKERS: Array<{ signal: string; extensions: string[] }> = [
	{ signal: "source:typescript", extensions: [".ts", ".tsx", ".mts", ".cts"] },
	{ signal: "source:javascript", extensions: [".js", ".jsx", ".mjs", ".cjs"] },
	{ signal: "source:rust", extensions: [".rs"] },
	{ signal: "source:go", extensions: [".go"] },
	{ signal: "source:python", extensions: [".py"] },
	{ signal: "source:swift", extensions: [".swift"] },
];

const IGNORED_SOURCE_DIRS = new Set([
	".git",
	".pi",
	".venv",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"target",
	"vendor",
]);

const KNOWN_FILES = [
	"package.json",
	"bun.lock",
	"bun.lockb",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"tsconfig.json",
	"vite.config.ts",
	"vite.config.js",
	"next.config.ts",
	"next.config.js",
	"svelte.config.js",
	"playwright.config.ts",
	"playwright.config.js",
	"vitest.config.ts",
	"vitest.config.js",
	"jest.config.ts",
	"jest.config.js",
	"Cargo.toml",
	"Cargo.lock",
	"go.mod",
	"go.sum",
	"pyproject.toml",
	"pytest.ini",
	"uv.lock",
	"poetry.lock",
	"requirements.txt",
	"Package.swift",
] as const;

function hasSourceExtension(root: string, extensions: string[], maxDepth = 3): boolean {
	const pending: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
	let inspected = 0;
	while (pending.length && inspected < 4_000) {
		const current = pending.shift()!;
		let entries;
		try {
			entries = readdirSync(current.dir, { withFileTypes: true })
				.sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			continue;
		}
		for (const entry of entries) {
			inspected += 1;
			if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) return true;
			if (
				entry.isDirectory() &&
				current.depth < maxDepth &&
				!IGNORED_SOURCE_DIRS.has(entry.name)
			) {
				pending.push({ dir: resolve(current.dir, entry.name), depth: current.depth + 1 });
			}
		}
	}
	return false;
}

function readSignals(root: string): Signal[] {
	const signals = KNOWN_FILES.flatMap((relative) => {
		const path = resolve(root, relative);
		if (!existsSync(path)) return [];
		try {
			return [{ path: relative, content: readFileSync(path, "utf8") }];
		} catch {
			return [{ path: relative, content: "" }];
		}
	});
	const reactDoctor = resolve(root, "node_modules", ".bin", "react-doctor");
	if (existsSync(reactDoctor)) {
		signals.push({ path: "node_modules/.bin/react-doctor", content: "present" });
	}
	for (const marker of SOURCE_MARKERS) {
		if (hasSourceExtension(root, marker.extensions)) {
			signals.push({ path: marker.signal, content: "present" });
		}
	}
	try {
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name.endsWith(".xcodeproj")) {
				signals.push({ path: entry.name, content: "directory" });
			}
		}
	} catch {
		// An unreadable directory becomes an empty, low-confidence profile.
	}
	return signals.sort((a, b) => a.path.localeCompare(b.path));
}

function signalContent(signals: Signal[], path: string): string | undefined {
	return signals.find((signal) => signal.path === path)?.content;
}

function hasSignal(signals: Signal[], path: string): boolean {
	return signals.some((signal) => signal.path === path);
}

function packageManager(pkg: Record<string, unknown>, signals: Signal[]): ProjectPackageManager {
	const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
	if (declared === "bun" || declared === "npm" || declared === "pnpm" || declared === "yarn") {
		return declared;
	}
	if (hasSignal(signals, "bun.lock") || hasSignal(signals, "bun.lockb")) return "bun";
	if (hasSignal(signals, "pnpm-lock.yaml")) return "pnpm";
	if (hasSignal(signals, "yarn.lock")) return "yarn";
	return "npm";
}

function scriptCommand(pm: ProjectPackageManager, script: string): string {
	if (pm === "bun") return script === "test" ? "bun test" : `bun run ${script}`;
	if (pm === "pnpm") return script === "test" ? "pnpm test" : `pnpm run ${script}`;
	if (pm === "yarn") return script === "test" ? "yarn test" : `yarn ${script}`;
	return script === "test" ? "npm test --" : `npm run ${script}`;
}

function firstScript(
	scripts: Record<string, string>,
	pm: ProjectPackageManager,
	names: string[],
): string | undefined {
	const found = names.find((name) => typeof scripts[name] === "string" && scripts[name]!.trim());
	return found ? scriptCommand(pm, found) : undefined;
}

function detectJavaScript(signals: Signal[]): {
	stacks: ProjectStack[];
	managers: ProjectPackageManager[];
	frameworks: string[];
	commands: ProjectCommands;
} {
	const raw = signalContent(signals, "package.json");
	if (raw === undefined) return { stacks: [], managers: [], frameworks: [], commands: {} };
	let pkg: Record<string, unknown> = {};
	try {
		pkg = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		// Keep the manifest as a signal; malformed JSON cannot safely infer commands.
	}
	const pm = packageManager(pkg, signals);
	const scripts =
		pkg.scripts && typeof pkg.scripts === "object"
			? (pkg.scripts as Record<string, string>)
			: {};
	const deps = {
		...((pkg.dependencies as Record<string, string> | undefined) ?? {}),
		...((pkg.devDependencies as Record<string, string> | undefined) ?? {}),
	};
	const frameworks = [
		"react" in deps ? "react" : undefined,
		("vite" in deps || hasSignal(signals, "vite.config.ts") || hasSignal(signals, "vite.config.js")) ? "vite" : undefined,
		("next" in deps || hasSignal(signals, "next.config.ts") || hasSignal(signals, "next.config.js")) ? "next" : undefined,
		("svelte" in deps || hasSignal(signals, "svelte.config.js")) ? "svelte" : undefined,
		("vitest" in deps || hasSignal(signals, "vitest.config.ts") || hasSignal(signals, "vitest.config.js")) ? "vitest" : undefined,
		("jest" in deps || hasSignal(signals, "jest.config.ts") || hasSignal(signals, "jest.config.js")) ? "jest" : undefined,
		("@playwright/test" in deps || hasSignal(signals, "playwright.config.ts") || hasSignal(signals, "playwright.config.js")) ? "playwright" : undefined,
	].filter((value): value is string => Boolean(value));
	const isTypeScript = "typescript" in deps || hasSignal(signals, "tsconfig.json");
	const commands: ProjectCommands = {
		format: firstScript(scripts, pm, ["format:check", "format:ci"]),
		staticAnalysis: firstScript(scripts, pm, ["lint", "lint:ci"]),
		typecheck: firstScript(scripts, pm, ["typecheck", "tsc", "check:types"]),
		unitTest: firstScript(scripts, pm, ["test", "test:unit"]),
		acceptanceTest: firstScript(scripts, pm, ["gherkin:test", "test:acceptance", "test:e2e"]),
		propertyTest: firstScript(scripts, pm, ["test:property", "property"]),
		coverage: firstScript(scripts, pm, ["coverage", "test:coverage", "coverage:ci"]),
		mutation: firstScript(scripts, pm, ["mutation", "test:mutation", "stryker"]),
		architecture: firstScript(scripts, pm, ["architecture", "test:architecture", "arch:test"]),
		doctor: firstScript(scripts, pm, ["doctor", "react-doctor"]),
		security: firstScript(scripts, pm, ["security", "audit:security"]),
		performance: firstScript(scripts, pm, ["test:performance", "benchmark", "perf"]),
	};
	if (!commands.doctor && hasSignal(signals, "node_modules/.bin/react-doctor") && frameworks.includes("react")) {
		commands.doctor = "./node_modules/.bin/react-doctor --diff";
	}
	return {
		stacks: isTypeScript ? ["javascript", "typescript"] : ["javascript"],
		managers: [pm],
		frameworks,
		commands,
	};
}

function mergeCommands(parts: ProjectCommands[]): ProjectCommands {
	const keys = [
		"format",
		"staticAnalysis",
		"typecheck",
		"unitTest",
		"acceptanceTest",
		"propertyTest",
		"coverage",
		"mutation",
		"architecture",
		"doctor",
		"security",
		"performance",
	] as const;
	const result: ProjectCommands = {};
	for (const key of keys) {
		const commands = parts.map((part) => part[key]).filter((value): value is string => Boolean(value));
		if (commands.length) result[key] = [...new Set(commands)].join(" && ");
	}
	return result;
}

function stableFingerprint(input: Omit<ProjectProfile, "root" | "fingerprint">, signals: Signal[]): string {
	const signalHashes = signals.map((signal) => ({
		path: signal.path,
		digest: createHash("sha256").update(signal.content).digest("hex"),
	}));
	return createHash("sha256")
		.update(JSON.stringify({ ...input, signalHashes }))
		.digest("hex");
}

export function detectProjectProfile(cwd: string): ProjectProfile {
	const root = resolve(cwd);
	const signals = readSignals(root);
	const javascript = detectJavaScript(signals);
	const stacks = new Set<ProjectStack>(javascript.stacks);
	const managers = new Set<ProjectPackageManager>(javascript.managers);
	const commandParts: ProjectCommands[] = [javascript.commands];
	if (hasSignal(signals, "source:typescript")) {
		stacks.add("javascript");
		stacks.add("typescript");
	} else if (hasSignal(signals, "source:javascript")) {
		stacks.add("javascript");
	}
	if (hasSignal(signals, "source:rust")) stacks.add("rust");
	if (hasSignal(signals, "source:go")) stacks.add("go");
	if (hasSignal(signals, "source:python")) stacks.add("python");
	if (hasSignal(signals, "source:swift")) stacks.add("swift");

	if (hasSignal(signals, "Cargo.toml")) {
		stacks.add("rust");
		managers.add("cargo");
		commandParts.push({
			format: "cargo fmt --all -- --check",
			staticAnalysis: "cargo clippy --all-targets --all-features -- -D warnings",
			typecheck: "cargo check --all-targets --all-features",
			unitTest: "cargo test",
		});
	}
	if (hasSignal(signals, "go.mod")) {
		stacks.add("go");
		managers.add("go");
		commandParts.push({
			format: "test -z \"$(find . -name '*.go' -not -path './vendor/*' -print0 | xargs -0 gofmt -l)\"",
			staticAnalysis: "go vet ./...",
			typecheck: "go test -run '^$' ./...",
			unitTest: "go test ./...",
			performance: "go test -race ./...",
		});
	}
	const pyproject = signalContent(signals, "pyproject.toml");
	if (pyproject !== undefined || hasSignal(signals, "pytest.ini") || hasSignal(signals, "requirements.txt")) {
		stacks.add("python");
		const pythonPrefix = hasSignal(signals, "uv.lock")
			? (managers.add("uv"), "uv run")
			: hasSignal(signals, "poetry.lock")
				? (managers.add("poetry"), "poetry run")
				: "python -m";
		commandParts.push({
			unitTest: `${pythonPrefix} pytest`,
			staticAnalysis: pyproject?.includes("[tool.ruff]") ? `${pythonPrefix} ruff check .` : undefined,
			typecheck: pyproject?.includes("[tool.mypy]") ? `${pythonPrefix} mypy .` : undefined,
			coverage: pyproject?.includes("pytest-cov") ? `${pythonPrefix} pytest --cov` : undefined,
		});
	}
	if (hasSignal(signals, "Package.swift") || signals.some((signal) => signal.path.endsWith(".xcodeproj"))) {
		stacks.add("swift");
		managers.add("swiftpm");
		commandParts.push({ unitTest: hasSignal(signals, "Package.swift") ? "swift test" : undefined });
	}

	const base = {
		version: 1 as const,
		stacks: [...stacks].sort(),
		packageManagers: [...managers].sort(),
		frameworks: [...new Set(javascript.frameworks)].sort(),
		signals: signals.map((signal) => signal.path).sort(),
		commands: mergeCommands(commandParts),
		confidence: (stacks.size > 0 ? "high" : signals.length > 0 ? "medium" : "low") as ProjectProfile["confidence"],
	};
	return {
		...base,
		root,
		fingerprint: stableFingerprint(base, signals),
	};
}

export function formatProjectProfile(profile: ProjectProfile): string {
	return [
		`# Project profile — ${basename(profile.root)}`,
		``,
		`- confidence: **${profile.confidence}**`,
		`- stacks: ${profile.stacks.join(", ") || "(none)"}`,
		`- package managers: ${profile.packageManagers.join(", ") || "(none)"}`,
		`- frameworks: ${profile.frameworks.join(", ") || "(none)"}`,
		`- signals: ${profile.signals.join(", ") || "(none)"}`,
		`- fingerprint: \`${profile.fingerprint}\``,
		``,
		`## Detected commands`,
		...Object.entries(profile.commands).map(([key, command]) => `- ${key}: \`${command}\``),
	].join("\n");
}
