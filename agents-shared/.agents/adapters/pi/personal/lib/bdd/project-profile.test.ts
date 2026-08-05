import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProjectProfile } from "./project-profile.ts";

function project(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "bdd-profile-"));
	for (const [relative, content] of Object.entries(files)) {
		const path = join(root, relative);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, content);
	}
	return root;
}

describe("detectProjectProfile", () => {
	// R1-E1, R2-E1
	test("detects Bun, TypeScript, React, and Vite while preferring project scripts", () => {
		const root = project({
			"package.json": JSON.stringify({
				packageManager: "bun@1.3.0",
				scripts: {
					test: "vitest run",
					typecheck: "tsc --noEmit",
					coverage: "vitest run --coverage",
				},
				dependencies: { react: "19.0.0", vite: "7.0.0" },
				devDependencies: { typescript: "5.9.0", vitest: "3.0.0" },
			}),
			"bun.lock": "",
			"tsconfig.json": "{}",
			"vite.config.ts": "export default {}",
		});

		const profile = detectProjectProfile(root);
		expect(profile.stacks).toEqual(["javascript", "typescript"]);
		expect(profile.packageManagers).toEqual(["bun"]);
		expect(profile.frameworks).toEqual(["react", "vite", "vitest"]);
		expect(profile.commands.unitTest).toBe("bun test");
		expect(profile.commands.typecheck).toBe("bun run typecheck");
		expect(profile.commands.coverage).toBe("bun run coverage");
		expect(profile.confidence).toBe("high");
	});

	// R1-E2
	test("detects Rust without silently falling back to Bun", () => {
		const root = project({
			"Cargo.toml": "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n",
			"Cargo.lock": "",
		});
		const profile = detectProjectProfile(root);
		expect(profile.stacks).toEqual(["rust"]);
		expect(profile.packageManagers).toEqual(["cargo"]);
		expect(profile.commands.unitTest).toBe("cargo test");
		expect(profile.commands.typecheck).toBe("cargo check --all-targets --all-features");
		expect(profile.commands.staticAnalysis).toContain("cargo clippy");
		expect(profile.commands.unitTest).not.toContain("bun");
	});

	// R1-E3
	test("returns stable sorted polyglot profiles and fingerprints", () => {
		const root = project({
			"go.mod": "module example.com/demo\n\ngo 1.24\n",
			"Cargo.toml": "[workspace]\nmembers = []\n",
			"package.json": JSON.stringify({ packageManager: "pnpm@10", scripts: { test: "vitest run" } }),
			"pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
		});
		const first = detectProjectProfile(root);
		const second = detectProjectProfile(root);
		expect(first.stacks).toEqual(["go", "javascript", "rust"]);
		expect(first.packageManagers).toEqual(["cargo", "go", "pnpm"]);
		expect(second).toEqual(first);
		expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	test("detects uv/pytest Python projects", () => {
		const root = project({
			"pyproject.toml": "[project]\nname='demo'\n[tool.pytest.ini_options]\naddopts='-q'\n[tool.ruff]\nline-length=100\n",
			"uv.lock": "version = 1\n",
		});
		const profile = detectProjectProfile(root);
		expect(profile.stacks).toEqual(["python"]);
		expect(profile.packageManagers).toEqual(["uv"]);
		expect(profile.commands.unitTest).toBe("uv run pytest");
		expect(profile.commands.staticAnalysis).toBe("uv run ruff check .");
	});

	test("detects TypeScript source in a manifest-only local Pi package", () => {
		const root = project({
			"package.json": JSON.stringify({ name: "local-extension", scripts: { test: "bun test" } }),
			"extensions/example.ts": "export default function example() {}\n",
		});
		const profile = detectProjectProfile(root);
		expect(profile.stacks).toEqual(["javascript", "typescript"]);
		expect(profile.signals).toContain("source:typescript");
	});

	test("empty projects are explicit low-confidence profiles with no fake runner", () => {
		const root = project({});
		const profile = detectProjectProfile(root);
		expect(profile.confidence).toBe("low");
		expect(profile.stacks).toEqual([]);
		expect(profile.commands.unitTest).toBeUndefined();
	});
});
