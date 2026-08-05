import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatDoctorReport, runAgenticDoctor } from "./doctor.ts";

describe("runAgenticDoctor", () => {
	test("reports structure and rpc ping", async () => {
		const root = mkdtempSync(join(tmpdir(), "agentic-doctor-"));
		mkdirSync(join(root, ".pi"), { recursive: true });
		writeFileSync(
			join(root, ".pi", "bdd.json"),
			JSON.stringify({ version: 1, commands: { unitTest: "bun test" } }),
		);
		const agentDir = join(root, "agent");
		mkdirSync(join(agentDir, "personal", "agents"), { recursive: true });
		mkdirSync(join(agentDir, "personal", "extensions"), { recursive: true });
		mkdirSync(join(agentDir, "npm"), { recursive: true });
		writeFileSync(join(agentDir, "npm", "package.json"), JSON.stringify({ name: "x" }));
		writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ xai: { key: "k" } }));
		for (const a of ["fleet-researcher.md", "fleet-reviewer.md", "fleet-ux.md"]) {
			writeFileSync(join(agentDir, "personal", "agents", a), "---\nname: x\n---\n");
		}
		writeFileSync(join(agentDir, "personal", "extensions", "xai-web-search.ts"), "//");

		const report = await runAgenticDoctor({
			cwd: root,
			agentDir,
			rpcPing: async () => true,
		});
		expect(report.checks.length).toBeGreaterThan(5);
		expect(report.fail).toBeGreaterThanOrEqual(0);
		const text = formatDoctorReport(report);
		expect(text).toContain("Agentic doctor");
		expect(text).toMatch(/pass|fail|warn/i);
	});
});
