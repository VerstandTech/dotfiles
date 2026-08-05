import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFleetRun, formatCollectReport } from "./collect.ts";

describe("collectFleetRun", () => {
	test("snapshots status and output logs", () => {
		const root = mkdtempSync(join(tmpdir(), "fleet-collect-"));
		const asyncDir = join(root, "async");
		mkdirSync(asyncDir);
		writeFileSync(
			join(asyncDir, "status.json"),
			JSON.stringify({
				runId: "run-x",
				results: [{ status: "complete" }, { status: "failed", error: "No API key" }],
			}),
		);
		writeFileSync(join(asyncDir, "output-0.log"), "# Review — ok\n## Blockers\n");
		writeFileSync(join(asyncDir, "output-1.log"), "No API key found for xai\n");

		const result = collectFleetRun({
			cwd: root,
			runId: "run-x",
			asyncDir,
		});
		expect(result.completeCount).toBeGreaterThanOrEqual(1);
		expect(result.failedCount).toBeGreaterThanOrEqual(1);
		expect(result.membersDir).toContain("members");
		const report = formatCollectReport(result);
		expect(report).toContain("synthesis.md");
		expect(report).toContain("run-x");
	});
});
