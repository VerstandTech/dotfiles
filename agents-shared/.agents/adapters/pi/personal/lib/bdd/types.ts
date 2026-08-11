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

/** Trust profile controlling shell vs argv gate policy. Default: interactive. */
export type TrustProfile = "interactive" | "strict" | "overnight";

/** Machine-visible trust tier on evidence and gate results. */
export type TrustTier =
	| "trusted"
	| "interactive_untrusted"
	| "legacy"
	| "policy_rejected";

export type ExecutorKind = "shell" | "argv" | "internal";

/** Expected-red match mode for causal red classification. */
export type RedMatchMode = "identity" | "signature" | "legacy";

/** Deterministic reason codes for red classification (R2). */
export type RedReasonCode =
	| "timeout"
	| "spawn"
	| "infra_126"
	| "infra_127"
	| "pass"
	| "setup_import"
	| "missing_identity"
	| "unrelated_identity"
	| "signature_mismatch"
	| "expected_assertion"
	| "legacy_interactive"
	| "contract_required"
	| "policy_rejected"
	| "unknown";

/** Additive expected-red contract supplied to validateRedResult / bdd_assert_red. */
export interface ExpectedRedContract {
	expectedTestId?: string;
	expectedFailureSignature?: string;
	matchMode?: RedMatchMode;
	assuranceEnabled?: boolean;
	trustProfile?: TrustProfile;
}

/** Trusted argv command (shell:false). */
export interface ArgvCommandSpec {
	kind?: "argv";
	version: 1;
	file: string;
	args: string[];
	cwd?: string;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

/** Explicit shell command spec (interactive-untrusted). */
export interface ShellCommandSpec {
	kind: "shell";
	command: string;
	trustTier?: TrustTier;
}

/** Internal check id — unknown ids fail closed until FIT-01 adapters exist. */
export interface InternalCommandSpec {
	kind: "internal";
	id: string;
}

export type GateExecutorSpec = ArgvCommandSpec | ShellCommandSpec | InternalCommandSpec;

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
	/** Trust profile: interactive (default), strict, overnight. */
	trustProfile?: TrustProfile;
	requiredGateKinds?: QualityGateKind[];
	advisoryGateKinds?: QualityGateKind[];
	/** Exact command overrides keyed by gate kind (legacy shell strings). */
	commands?: Partial<Record<QualityGateKind, string>>;
	/** Canonical executors (shell / argv / internal) keyed by gate kind. */
	executors?: Partial<Record<QualityGateKind, GateExecutorSpec>>;
	/** Machine-visible trust labels for legacy shell command strings. */
	commandTrust?: Partial<Record<QualityGateKind, TrustTier>>;
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
	/** shell | argv | internal */
	executorKind?: ExecutorKind;
	/** trusted | interactive_untrusted | … */
	trustTier?: TrustTier | string;
	/** True when policy rejected before spawn. */
	policyRejected?: boolean;
}

export interface AssuranceEvidence {
	profileFingerprint: string;
	planFingerprint: string;
	/** Binds assurance evidence to the BDD config fingerprint (R8). */
	configFingerprint?: string;
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
	/** Expected-red contract fields (BDD-01). */
	expectedTestId?: string;
	expectedFailureSignature?: string;
	matchMode?: RedMatchMode | string;
	assuranceEligible?: boolean;
	trustTier?: TrustTier | string;
	cause?: string;
	reasonCode?: RedReasonCode | string;
	configFingerprint?: string;
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
		/** Expected-red contract reused on the fail leg (BDD-01). */
		expectedTestId?: string;
		expectedFailureSignature?: string;
		matchMode?: RedMatchMode | string;
		matched?: boolean;
		cause?: string;
		reasonCode?: RedReasonCode | string;
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
