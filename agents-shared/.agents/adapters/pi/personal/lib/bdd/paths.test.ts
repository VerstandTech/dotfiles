import { describe, expect, test } from "bun:test";
import { defaultConfig } from "./config.ts";
import { classifyPath, evaluatePathGate, globToRegExp, matchesPattern } from "./paths.ts";

const config = defaultConfig();

describe("globToRegExp / matchesPattern", () => {
	test("matches **/*.test.ts", () => {
		expect(matchesPattern("packages/foo/bar.test.ts", "**/*.test.ts")).toBe(true);
		expect(matchesPattern("packages/foo/bar.ts", "**/*.test.ts")).toBe(false);
	});

	test("matches directory prefix", () => {
		expect(matchesPattern("src/domain/user.ts", "src/")).toBe(true);
		expect(matchesPattern("tests/unit/a.ts", "src/")).toBe(false);
	});

	test("matches basename docs", () => {
		expect(matchesPattern("AGENTS.md", "AGENTS.md")).toBe(true);
		expect(matchesPattern("docs/bdd/example-mapping.md", "**/docs/**")).toBe(true);
	});

	test("glob anchors full path", () => {
		const re = globToRegExp("**/features/**");
		expect(re.test("tests/features/profile/a.feature")).toBe(true);
	});
});

describe("classifyPath", () => {
	test("feature files, not feature-sliced app code", () => {
		expect(classifyPath("tests/features/x.feature", config)).toBe("feature");
		expect(classifyPath("src/features/checkout/ui.ts", config)).toBe("impl");
		expect(classifyPath("app/features/billing/service.ts", config)).toBe("impl");
	});

	test("unit tests", () => {
		expect(classifyPath("tests/unit/foo.test.ts", config)).toBe("test");
		expect(classifyPath("src/foo.test.ts", config)).toBe("test");
	});

	test("implementation", () => {
		expect(classifyPath("src/domain/user.ts", config)).toBe("impl");
		expect(classifyPath("app/api/route.ts", config)).toBe("impl");
	});

	test("config bdd.json", () => {
		expect(classifyPath(".pi/bdd.json", config)).toBe("config");
	});
});

describe("evaluatePathGate", () => {
	test("off allows impl", () => {
		const r = evaluatePathGate({
			path: "src/x.ts",
			phase: "off",
			config,
			enabled: true,
		});
		expect(r.allowed).toBe(true);
	});

	test("disabled allows impl", () => {
		const r = evaluatePathGate({
			path: "src/x.ts",
			phase: "red",
			config,
			enabled: false,
		});
		expect(r.allowed).toBe(true);
	});

	test("discovery blocks impl and tests", () => {
		expect(
			evaluatePathGate({
				path: "src/x.ts",
				phase: "discovery",
				config,
				enabled: true,
			}).allowed,
		).toBe(false);
		expect(
			evaluatePathGate({
				path: "tests/unit/a.test.ts",
				phase: "discovery",
				config,
				enabled: true,
			}).allowed,
		).toBe(false);
		expect(
			evaluatePathGate({
				path: "docs/bdd/map.md",
				phase: "discovery",
				config,
				enabled: true,
			}).allowed,
		).toBe(true);
	});

	test("red allows tests, blocks impl", () => {
		expect(
			evaluatePathGate({
				path: "tests/unit/a.test.ts",
				phase: "red",
				config,
				enabled: true,
			}).allowed,
		).toBe(true);
		expect(
			evaluatePathGate({
				path: "src/a.ts",
				phase: "red",
				config,
				enabled: true,
			}).allowed,
		).toBe(false);
	});

	test("green blocks impl and other without red evidence", () => {
		const blocked = evaluatePathGate({
			path: "src/a.ts",
			phase: "green",
			config,
			enabled: true,
			hasRedEvidence: false,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.reason).toMatch(/red evidence/i);

		const otherBlocked = evaluatePathGate({
			path: "main.go",
			phase: "green",
			config,
			enabled: true,
			hasRedEvidence: false,
		});
		expect(otherBlocked.allowed).toBe(false);

		const ok = evaluatePathGate({
			path: "src/a.ts",
			phase: "green",
			config,
			enabled: true,
			hasRedEvidence: true,
		});
		expect(ok.allowed).toBe(true);
	});

	test("red blocks feature-sliced impl under features/", () => {
		expect(
			evaluatePathGate({
				path: "src/features/checkout/ui.ts",
				phase: "red",
				config,
				enabled: true,
			}).allowed,
		).toBe(false);
	});

	test("bypass allows anything", () => {
		expect(
			evaluatePathGate({
				path: "src/a.ts",
				phase: "red",
				config,
				enabled: true,
				bypass: true,
			}).allowed,
		).toBe(true);
	});

	test("alwaysAllowPathPatterns", () => {
		const cfg = defaultConfig({ alwaysAllowPathPatterns: ["**/generated/**"] });
		expect(
			evaluatePathGate({
				path: "src/generated/types.ts",
				phase: "discovery",
				config: cfg,
				enabled: true,
			}).allowed,
		).toBe(true);
	});
});
