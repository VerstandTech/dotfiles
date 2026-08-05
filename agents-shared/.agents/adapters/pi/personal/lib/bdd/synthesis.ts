import { lstatSync } from "node:fs";
import { join, resolve } from "node:path";

export function isValidFleetRunId(runId: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId);
}

function safeStat(path: string) {
	try {
		return lstatSync(path);
	} catch {
		return undefined;
	}
}

export function validateFleetSynthesisEvidence(input: {
	cwd: string;
	runId: string;
	synthesisPath: string;
}): { ok: boolean; reason?: string } {
	if (!isValidFleetRunId(input.runId)) {
		return { ok: false, reason: "Fleet run id must be a safe single path segment." };
	}
	const cwd = resolve(input.cwd);
	const piDir = join(cwd, ".pi");
	const runsDir = join(piDir, "fleet-runs");
	const runDir = join(runsDir, input.runId);
	const expected = join(runDir, "synthesis.md");
	if (resolve(cwd, input.synthesisPath) !== expected) {
		return {
			ok: false,
			reason: `Fleet synthesis must be the exact file .pi/fleet-runs/${input.runId}/synthesis.md.`,
		};
	}
	for (const directory of [piDir, runsDir, runDir]) {
		const stat = safeStat(directory);
		if (!stat?.isDirectory() || stat.isSymbolicLink()) {
			return { ok: false, reason: "Fleet synthesis directory is missing, not a directory, or symlinked." };
		}
	}
	const file = safeStat(expected);
	if (!file?.isFile() || file.isSymbolicLink()) {
		return { ok: false, reason: "Fleet synthesis.md is missing, not a regular file, or symlinked." };
	}
	return { ok: true };
}
