import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as configModule from "./config.ts";
import {
	UNCONFIGURED_UNIT_TEST,
	configTemplate,
	defaultConfig,
	inferCommandsFromPackage,
	loadConfigFromCwd,
	parseConfigJson,
} from "./config.ts";

describe("parseConfigJson", () => {
	test("applies defaults for missing fields", () => {
		const cfg = parseConfigJson({ version: 1, commands: { unitTest: "npm test" } });
		expect(cfg.commands.unitTest).toBe("npm test");
		expect(cfg.testPathPatterns.length).toBeGreaterThan(0);
		expect(cfg.version).toBe(1);
	});

	test("rejects non-objects", () => {
		expect(() => parseConfigJson(null)).toThrow();
	});

	test("parses high-assurance gate policy and command overrides", () => {
		const cfg = parseConfigJson({
			version: 1,
			commands: { unitTest: "bun test", coverage: "bun run coverage" },
			assurance: {
				enabled: true,
				requiredGateKinds: ["unit", "coverage"],
				commands: { doctor: "bun run doctor:ci" },
				coverageThreshold: 95,
			},
		});
		expect(cfg.commands.coverage).toBe("bun run coverage");
		expect(cfg.assurance).toMatchObject({
			enabled: true,
			requiredGateKinds: ["unit", "coverage"],
			commands: { doctor: "bun run doctor:ci" },
			coverageThreshold: 95,
		});
	});
});

describe("inferCommandsFromPackage", () => {
	test("detects gherkin scripts with bun", () => {
		const c = inferCommandsFromPackage({
			packageManager: "bun@1.3.9",
			scripts: {
				test: "bun test",
				"gherkin:test": "bun run scripts/gherkin-run.ts",
				"gherkin:generate": "bun run scripts/gherkin-compile.ts",
				typecheck: "tsc -p .",
			},
		});
		expect(c.unitTest).toBe("bun test");
		expect(c.acceptanceTest).toBe("bun run gherkin:test");
		expect(c.acceptanceGenerate).toBe("bun run gherkin:generate");
		expect(c.typecheck).toBe("bun run typecheck");
	});

	test("npm fallback", () => {
		const c = inferCommandsFromPackage({
			packageManager: "npm@10",
			scripts: { test: "jest", "test:e2e": "playwright test" },
		});
		expect(c.unitTest).toBe("npm test --");
		expect(c.acceptanceTest).toBe("npm run test:e2e");
	});
});

describe("loadConfigFromCwd", () => {
	test("loads file config", () => {
		const files: Record<string, string> = {
			"/proj/.pi/bdd.json": JSON.stringify({
				version: 1,
				projectLabel: "demo",
				commands: { unitTest: "bun test path" },
			}),
		};
		const result = loadConfigFromCwd("/proj", {
			exists: (p) => p in files,
			read: (p) => files[p]!,
		});
		expect(result.source).toBe("file");
		expect(result.config.projectLabel).toBe("demo");
		expect(result.config.commands.unitTest).toBe("bun test path");
	});

	test("infers from package.json when no bdd.json", () => {
		const files: Record<string, string> = {
			"/proj/package.json": JSON.stringify({
				packageManager: "bun@1",
				scripts: { test: "bun test", "gherkin:test": "x" },
			}),
		};
		const result = loadConfigFromCwd("/proj", {
			exists: (p) => p in files,
			read: (p) => files[p]!,
		});
		expect(result.source).toBe("inferred");
		expect(result.config.commands.acceptanceTest).toBe("bun run gherkin:test");
	});

	test("fills commands omitted by a partial file config from detected project scripts", () => {
		const root = mkdtempSync(join(tmpdir(), "bdd-partial-config-"));
		mkdirSync(join(root, ".pi"), { recursive: true });
		writeFileSync(
			join(root, ".pi", "bdd.json"),
			JSON.stringify({ version: 1, assurance: { enabled: true } }),
		);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ packageManager: "bun@1", scripts: { test: "bun test", typecheck: "tsc --noEmit" } }),
		);
		const result = loadConfigFromCwd(root);
		expect(result.source).toBe("file");
		expect(result.config.commands.unitTest).toBe("bun test");
		expect(result.config.commands.typecheck).toBe("bun run typecheck");
	});

	test("detects a non-JavaScript stack when no bdd config exists", () => {
		const root = mkdtempSync(join(tmpdir(), "bdd-rust-config-"));
		writeFileSync(join(root, "Cargo.toml"), "[package]\nname='demo'\nversion='0.1.0'\n");
		const result = loadConfigFromCwd(root);
		expect(result.source).toBe("inferred");
		expect(result.path).toBe(join(root, "Cargo.toml"));
		expect(result.config.commands.unitTest).toBe("cargo test");
		expect(result.config.commands.staticAnalysis).toContain("cargo clippy");
	});

	test("defaults safely when the tree has no detectable runner", () => {
		const root = mkdtempSync(join(tmpdir(), "bdd-empty-config-"));
		mkdirSync(root, { recursive: true });
		const result = loadConfigFromCwd(root);
		expect(result.source).toBe("default");
		expect(result.config.commands.unitTest).toBe(UNCONFIGURED_UNIT_TEST);
	});
});

describe("configTemplate", () => {
	test("is valid json and opts generated configs into assurance", () => {
		const t = configTemplate({ unitTest: "pnpm test" });
		const parsed = JSON.parse(t);
		expect(parsed.commands.unitTest).toBe("pnpm test");
		expect(parsed.assurance).toMatchObject({ enabled: true, requiredGateKinds: ["unit"] });
		expect(defaultConfig().version).toBe(1);
	});
});

describe("dual command config, trust profiles, and fingerprints (BDD-01 R8)", () => {
	function fingerprintConfig(config: unknown): string {
		const fn = (configModule as Record<string, unknown>).fingerprintConfig;
		expect(typeof fn).toBe("function");
		return (fn as (c: unknown) => string)(config);
	}

	// E33 — legacy shell strings remain parseable and visibly non-assurance
	test("parses legacy shell command strings as interactive untrusted migration", () => {
		const cfg = parseConfigJson({
			version: 1,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "interactive",
				requiredGateKinds: ["unit"],
				commands: { unit: "bun test" },
			},
		}) as unknown as {
			commands: { unitTest: string };
			assurance?: {
				trustProfile?: string;
				commandTrust?: Record<string, string>;
				executors?: Record<string, { kind?: string; trustTier?: string; command?: string }>;
				commands?: Record<string, unknown>;
			};
		};
		// Shell string must not be dropped.
		expect(cfg.commands.unitTest).toBe("bun test");
		expect(cfg.assurance?.commands?.unit).toBe("bun test");
		// Trust profile and explicit untrusted labeling must be machine-visible (not inferred by the test).
		expect(cfg.assurance?.trustProfile).toBe("interactive");
		const labeled =
			cfg.assurance?.commandTrust?.unit ??
			cfg.assurance?.executors?.unit?.trustTier ??
			null;
		expect(labeled).toMatch(/interactive_untrusted/i);
	});

	// E34 — argv/internal command object round-trip
	test("round-trips argv and internal command objects", () => {
		const cfg = parseConfigJson({
			version: 1,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "strict",
				requiredGateKinds: ["unit", "doctor"],
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"], timeoutMs: 60_000 },
					doctor: { kind: "internal", id: "fit01.unknown-check" },
				},
			},
		}) as unknown as {
			assurance?: {
				trustProfile?: string;
				executors?: Record<string, Record<string, unknown>>;
			};
		};
		expect(cfg.assurance?.trustProfile).toBe("strict");
		expect(cfg.assurance?.executors?.unit).toMatchObject({
			kind: "argv",
			version: 1,
			file: "bun",
			args: ["test"],
		});
		expect(cfg.assurance?.executors?.doctor).toMatchObject({
			kind: "internal",
			id: "fit01.unknown-check",
		});
	});

	// E35 — malformed / unknown strict kinds are explicit errors
	test("rejects malformed command objects and unknown strict gate kinds explicitly", () => {
		expect(() =>
			parseConfigJson({
				version: 1,
				commands: { unitTest: "bun test" },
				assurance: {
					enabled: true,
					trustProfile: "strict",
					executors: {
						unit: { kind: "argv", file: "", args: "not-an-array" },
					},
				},
			}),
		).toThrow(/argv|command|integrity|malformed|invalid/i);

		expect(() =>
			parseConfigJson({
				version: 1,
				commands: { unitTest: "bun test" },
				assurance: {
					enabled: true,
					trustProfile: "strict",
					requiredGateKinds: ["not-a-real-gate"],
				},
			}),
		).toThrow(/unknown|gate kind|integrity|invalid/i);
	});

	// E25 / E26 — deterministic sensitive config fingerprints
	test("fingerprintConfig is deterministic and changes with trust-sensitive fields", () => {
		const base = parseConfigJson({
			version: 1,
			strictGreenCoversRed: true,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "strict",
				requiredGateKinds: ["unit"],
				coverageThreshold: 95,
				defaultTimeoutMs: 120_000,
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
				},
			},
		});
		const again = parseConfigJson({
			version: 1,
			strictGreenCoversRed: true,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "strict",
				requiredGateKinds: ["unit"],
				coverageThreshold: 95,
				defaultTimeoutMs: 120_000,
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
				},
			},
		});
		const fp1 = fingerprintConfig(base);
		const fp2 = fingerprintConfig(again);
		expect(fp1).toMatch(/^[a-f0-9]{64}$/);
		expect(fp2).toBe(fp1);

		const trustChanged = parseConfigJson({
			version: 1,
			strictGreenCoversRed: true,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "overnight",
				requiredGateKinds: ["unit"],
				coverageThreshold: 95,
				defaultTimeoutMs: 120_000,
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
				},
			},
		});
		const thresholdChanged = parseConfigJson({
			version: 1,
			strictGreenCoversRed: true,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "strict",
				requiredGateKinds: ["unit"],
				coverageThreshold: 99,
				defaultTimeoutMs: 120_000,
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
				},
			},
		});
		const timeoutChanged = parseConfigJson({
			version: 1,
			strictGreenCoversRed: true,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "strict",
				requiredGateKinds: ["unit"],
				coverageThreshold: 95,
				defaultTimeoutMs: 30_000,
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
				},
			},
		});
		const commandChanged = parseConfigJson({
			version: 1,
			strictGreenCoversRed: true,
			commands: { unitTest: "bun test" },
			assurance: {
				enabled: true,
				trustProfile: "strict",
				requiredGateKinds: ["unit"],
				coverageThreshold: 95,
				defaultTimeoutMs: 120_000,
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test", "lib"] },
				},
			},
		});
		expect(fingerprintConfig(trustChanged)).not.toBe(fp1);
		expect(fingerprintConfig(thresholdChanged)).not.toBe(fp1);
		expect(fingerprintConfig(timeoutChanged)).not.toBe(fp1);
		expect(fingerprintConfig(commandChanged)).not.toBe(fp1);
	});
});
