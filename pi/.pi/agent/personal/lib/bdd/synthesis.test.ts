import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFleetSynthesisEvidence } from "./synthesis.ts";

function fixture(runId = "run-123"): { cwd: string; runId: string; synthesisPath: string } {
	const cwd = mkdtempSync(join(tmpdir(), "bdd-synthesis-"));
	const runDir = join(cwd, ".pi", "fleet-runs", runId);
	mkdirSync(runDir, { recursive: true });
	const synthesisPath = join(runDir, "synthesis.md");
	writeFileSync(synthesisPath, "# Synthesis\n\n## Blockers\nNone.\n");
	return { cwd, runId, synthesisPath };
}

describe("validateFleetSynthesisEvidence", () => {
	test("accepts the exact regular synthesis.md under the matching safe run id", () => {
		const value = fixture();
		expect(validateFleetSynthesisEvidence(value)).toEqual({ ok: true });
	});

	test("rejects traversal and path separators in run ids", () => {
		const cwd = mkdtempSync(join(tmpdir(), "bdd-synthesis-traversal-"));
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		const outside = join(cwd, ".pi", "synthesis.md");
		writeFileSync(outside, "spoof");
		for (const runId of ["..", "../..", "a/b", "a\\b", "."]) {
			const result = validateFleetSynthesisEvidence({ cwd, runId, synthesisPath: outside });
			expect(result.ok).toBe(false);
			expect(result.reason).toMatch(/run id/i);
		}
	});

	test("rejects arbitrary files even inside the matching run directory", () => {
		const value = fixture();
		const other = join(value.cwd, ".pi", "fleet-runs", value.runId, "notes.md");
		writeFileSync(other, "not synthesis");
		const result = validateFleetSynthesisEvidence({ ...value, synthesisPath: other });
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/synthesis\.md/i);
	});

	test("rejects symlinked synthesis files and run directories", () => {
		const value = fixture("real-run");
		const externalFile = join(value.cwd, "external-synthesis.md");
		writeFileSync(externalFile, "spoof");
		unlinkSync(value.synthesisPath);
		symlinkSync(externalFile, value.synthesisPath);
		expect(validateFleetSynthesisEvidence(value).ok).toBe(false);

		const externalDir = join(value.cwd, "external-run");
		mkdirSync(externalDir, { recursive: true });
		writeFileSync(join(externalDir, "synthesis.md"), "spoof");
		const linkedRun = "linked-run";
		symlinkSync(externalDir, join(value.cwd, ".pi", "fleet-runs", linkedRun));
		expect(
			validateFleetSynthesisEvidence({
				cwd: value.cwd,
				runId: linkedRun,
				synthesisPath: join(value.cwd, ".pi", "fleet-runs", linkedRun, "synthesis.md"),
			}).ok,
		).toBe(false);
	});
});
