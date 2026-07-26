/**
 * Cross-project BDD/TDD types for the Pi bdd-mode extension.
 */

export const BDD_PHASES = [
	"off",
	"discovery",
	"formulation",
	"red",
	"green",
	"refactor",
	"verify",
] as const;

export type BddPhase = (typeof BDD_PHASES)[number];

export type PathClass = "feature" | "test" | "docs" | "impl" | "other" | "config";

export const QUALITY_GATE_KINDS = [
	"format",
	"static",
	"types",
	"unit",
	"acceptance",
	"property",
	"coverage",
	"mutation",
	"architecture",
	"doctor",
	"security",
	"performance",
] as const;

export type QualityGateKind = (typeof QUALITY_GATE_KINDS)[number];

export interface BddCommands {
	/** Focused/unit test runner, e.g. `bun test` or `npm test --` */
	unitTest: string;
	/** Acceptance / Gherkin suite, e.g. `bun run gherkin:test` */
	acceptanceTest?: string;
	/** Regenerate acceptance artifacts if the project has a compiler */
	acceptanceGenerate?: string;
	/** Optional deterministic quality commands. Project scripts/config always win. */
	format?: string;
	staticAnalysis?: string;
	typecheck?: string;
	propertyTest?: string;
	coverage?: string;
	mutation?: string;
	architecture?: string;
	doctor?: string;
	security?: string;
	performance?: string;
}

export interface AssuranceConfig {
	/** Require a current passing assurance run before BDD handoff. */
	enabled?: boolean;
	requiredGateKinds?: QualityGateKind[];
	advisoryGateKinds?: QualityGateKind[];
	/** Exact command overrides keyed by gate kind. */
	commands?: Partial<Record<QualityGateKind, string>>;
	coverageThreshold?: number;
	mutationThreshold?: number;
	doctorThreshold?: number;
	defaultTimeoutMs?: number;
	gateTimeoutMs?: Partial<Record<QualityGateKind, number>>;
}

export interface AssuranceGateResult {
	id: string;
	kind: QualityGateKind;
	required: boolean;
	status: "passed" | "failed" | "unavailable" | "skipped";
	command?: string;
	exitCode?: number;
	summary: string;
	startedAt?: string;
	completedAt?: string;
}

export interface AssuranceEvidence {
	profileFingerprint: string;
	planFingerprint: string;
	startedAt: string;
	completedAt: string;
	ok: boolean;
	results: AssuranceGateResult[];
}

export interface BddConfig {
	version: 1;
	/**
	 * When true, bdd-mode starts enabled in `discovery` on session start
	 * if a project config file is present.
	 */
	enabledByDefault?: boolean;
	/**
	 * When true (default), bdd_assert_green rejects green commands that do not cover red.
	 * Opt out in `.pi/bdd.json` with `"strictGreenCoversRed": false`.
	 */
	strictGreenCoversRed?: boolean;
	/** Glob-ish patterns for acceptance feature files */
	featurePathPatterns: string[];
	/** Glob-ish patterns for unit/integration/e2e test files */
	testPathPatterns: string[];
	/** Glob-ish patterns for production/implementation code */
	implementationPathPatterns: string[];
	/** Docs, example maps, ADRs, AGENTS.md, etc. */
	docsPathPatterns: string[];
	/** Project config the agent may edit in any phase (bdd.json, package.json scripts, etc.) */
	configPathPatterns: string[];
	commands: BddCommands;
	/** Stack-aware deterministic hard-gate policy. */
	assurance?: AssuranceConfig;
	/**
	 * Paths that are always writable even in gated phases (escape for lockfiles etc.).
	 * Matched with the same glob-ish rules.
	 */
	alwaysAllowPathPatterns?: string[];
	/** Optional human label for status UI */
	projectLabel?: string;
}

export interface CommandEvidence {
	command: string;
	exitCode: number;
	summary: string;
	at: string;
	/** Best-effort failed test names/hints parsed from output */
	failedTestHints?: string[];
}

export interface BddEvidence {
	focus?: string;
	exampleMap?: {
		/** Issue URL/number or file path */
		ref: string;
		rules: number;
		examples: number;
		questions?: number;
		at: string;
	};
	red?: CommandEvidence;
	green?: CommandEvidence;
	mutation?: {
		proven: boolean;
		note: string;
		at: string;
		failCommand?: string;
		passCommand?: string;
		failSummary?: string;
		passSummary?: string;
	};
	acceptance?: {
		/** Feature path(s) or explicit N/A */
		ref: string;
		reason?: string;
		at: string;
	};
	crap?: string;
	/** Last path/bash bypass reason when user/agent skipped path gates */
	bypass?: {
		reason: string;
		at: string;
	};
	/** Fleet-specific bypass (does not imply path bypass) */
	fleetBypass?: {
		reason: string;
		at: string;
	};
	/** Review/research fleets auto-recorded at dispatch (P0.2+) */
	fleetRuns?: FleetRunRecord[];
	/** Latest deterministic stack-aware quality-gate run. */
	assurance?: AssuranceEvidence;
}

export interface FleetRunRecord {
	runId: string;
	asyncDir?: string;
	kind: string;
	expectedCount: number;
	at: string;
	synthesisPath?: string;
	/** Explicit attestation that the independent review found no blockers. */
	noBlockers?: boolean;
	blockersAccepted?: string[];
	deferred?: Array<{ id: string; reason: string }>;
}

export interface BddState {
	enabled: boolean;
	phase: BddPhase;
	evidence: BddEvidence;
	/** When set, path/bash gates are suspended until cleared or phase change */
	bypassUntilPhaseChange?: boolean;
	/** When set, fleet launch gates are suspended until cleared or phase change */
	fleetBypassUntilPhaseChange?: boolean;
	configPath?: string;
	source: "default" | "file" | "inferred";
}

export interface PathGateResult {
	allowed: boolean;
	reason?: string;
	pathClass: PathClass;
}

export interface PhaseTransitionResult {
	ok: boolean;
	reason?: string;
}

export const DEFAULT_FEATURE_PATTERNS = [
	"**/*.feature",
	"**/tests/features/**",
	"**/features/**/*.feature",
];

export const DEFAULT_TEST_PATTERNS = [
	"**/*.test.ts",
	"**/*.test.tsx",
	"**/*.test.js",
	"**/*.test.jsx",
	"**/*.spec.ts",
	"**/*.spec.tsx",
	"**/*.spec.js",
	"**/tests/unit/**",
	"**/tests/integration/**",
	"**/tests/e2e/**",
	"**/__tests__/**",
	"**/e2e/**",
];

export const DEFAULT_IMPL_PATTERNS = [
	"**/src/**",
	"**/app/**",
	"**/lib/**",
	"**/packages/**/src/**",
	"**/server/**",
	"**/services/**",
	"**/domain/**",
	"**/application/**",
	"**/infrastructure/**",
	"**/components/**",
	"**/hooks/**",
	"**/pages/**",
	"**/cmd/**",
	"**/internal/**",
	"**/pkg/**",
	// Feature-sliced app code (NOT Gherkin — those match *.feature above)
	"**/features/**/*.ts",
	"**/features/**/*.tsx",
	"**/features/**/*.js",
	"**/features/**/*.jsx",
	"**/features/**/*.go",
	"**/features/**/*.py",
];

export const DEFAULT_DOCS_PATTERNS = [
	"**/docs/**",
	"**/README*",
	"**/AGENTS.md",
	"**/CLAUDE.md",
	"**/docs/**/*example*map*",
	"**/EXAMPLE_MAP*",
	"**/example-mapping.md",
	"**/TARGET_PUBLIC.md",
];

export const DEFAULT_CONFIG_PATTERNS = [
	"**/.pi/bdd.json",
	"**/bdd.json",
	"**/.bdd-tdd.json",
	"**/package.json",
	"**/tsconfig*.json",
	"**/.pi/settings.json",
	"**/pyproject.toml",
	"**/Cargo.toml",
	"**/go.mod",
	"**/Makefile",
	"**/.github/workflows/**",
	"**/vitest.config.*",
	"**/jest.config.*",
	"**/playwright.config.*",
];
