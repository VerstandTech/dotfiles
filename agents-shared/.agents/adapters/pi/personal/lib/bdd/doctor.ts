/**
 * Read-only diagnostics for BDD + fleet + pi-subagents runtime (P0.6).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfigFromCwd } from "./config.ts";
import { detectProjectProfile } from "./project-profile.ts";
import { buildQualityGatePlan } from "./quality-gates.ts";
import { loadFleetUserConfigDetailed, resolveCaps, subagentConfigPath } from "../fleet/config.ts";
import { loadModelResolveContext } from "../fleet/model-resolve.ts";

export type DoctorLevel = "pass" | "warn" | "fail";

export interface DoctorCheck {
	id: string;
	level: DoctorLevel;
	title: string;
	detail: string;
}

export interface DoctorReport {
	checks: DoctorCheck[];
	pass: number;
	warn: number;
	fail: number;
	ok: boolean;
}

function check(
	id: string,
	level: DoctorLevel,
	title: string,
	detail: string,
): DoctorCheck {
	return { id, level, title, detail };
}

export async function runAgenticDoctor(input: {
	cwd: string;
	/** Optional RPC ping: returns true if pi-subagents responds */
	rpcPing?: () => Promise<boolean>;
	agentDir?: string;
}): Promise<DoctorReport> {
	const agentDir = input.agentDir ?? join(homedir(), ".pi", "agent");
	const checks: DoctorCheck[] = [];

	// BDD config
	try {
		const bdd = loadConfigFromCwd(input.cwd);
		checks.push(
			check(
				"bdd-config",
				"pass",
				"BDD config",
				`source=${bdd.source}${bdd.path ? ` path=${bdd.path}` : ""} unitTest=${bdd.config.commands.unitTest}` +
					` strictGreen=${bdd.config.strictGreenCoversRed !== false}`,
			),
		);
		const detected = detectProjectProfile(input.cwd);
		const profile = {
			...detected,
			commands: {
				...detected.commands,
				unitTest: bdd.config.commands.unitTest,
				typecheck: bdd.config.commands.typecheck ?? detected.commands.typecheck,
				staticAnalysis: bdd.config.commands.staticAnalysis ?? detected.commands.staticAnalysis,
				coverage: bdd.config.commands.coverage ?? detected.commands.coverage,
				mutation: bdd.config.commands.mutation ?? detected.commands.mutation,
				doctor: bdd.config.commands.doctor ?? detected.commands.doctor,
			},
		};
		const plan = buildQualityGatePlan({ profile, assurance: bdd.config.assurance });
		checks.push(
			check(
				"project-profile",
				detected.confidence === "low" ? "warn" : "pass",
				"Deterministic project profile",
				`confidence=${detected.confidence} stacks=${detected.stacks.join(",") || "none"} fingerprint=${detected.fingerprint.slice(0, 12)}`,
			),
		);
		const missingRequired = plan.gates.filter((gate) => gate.required && gate.availability === "unavailable");
		checks.push(
			check(
				"assurance-plan",
				bdd.config.assurance?.enabled && missingRequired.length ? "fail" : "pass",
				"Assurance gate plan",
				`enabled=${bdd.config.assurance?.enabled === true} gates=${plan.gates.length} requiredUnavailable=${missingRequired.map((gate) => gate.kind).join(",") || "none"} plan=${plan.fingerprint.slice(0, 12)}`,
			),
		);
		const unenforcedTargets = plan.gates.filter(
			(gate) => gate.threshold != null && gate.availability === "unavailable",
		);
		if (unenforcedTargets.length) {
			checks.push(
				check(
					"assurance-thresholds",
					"warn",
					"Assurance threshold targets",
					`No command enforces configured targets for: ${unenforcedTargets.map((gate) => `${gate.kind}=${gate.threshold}`).join(", ")}`,
				),
			);
		}
	} catch (err) {
		checks.push(
			check(
				"bdd-config",
				"fail",
				"BDD config",
				err instanceof Error ? err.message : String(err),
			),
		);
	}

	// Fleet config (user + project overlay)
	const fleet = loadFleetUserConfigDetailed();
	if (fleet.parseError) {
		checks.push(check("fleet-config", "warn", "Fleet user config", fleet.parseError));
	} else {
		checks.push(
			check(
				"fleet-config",
				"pass",
				"Fleet user config",
				fleet.path ? `loaded ${fleet.path}` : "defaults (no fleet.json)",
			),
		);
	}
	const projectFleet = join(input.cwd, ".pi", "fleet.json");
	checks.push(
		existsSync(projectFleet)
			? check("fleet-project", "pass", "Project fleet overlay", projectFleet)
			: check("fleet-project", "warn", "Project fleet overlay", "no .pi/fleet.json (optional)"),
	);

	// Caps
	const caps = resolveCaps(fleet.config);
	const capPath = subagentConfigPath(agentDir);
	let diskMax = 0;
	let diskConc = 0;
	if (existsSync(capPath)) {
		try {
			const raw = JSON.parse(readFileSync(capPath, "utf8")) as {
				parallel?: { maxTasks?: number; concurrency?: number };
			};
			diskMax = raw.parallel?.maxTasks ?? 0;
			diskConc = raw.parallel?.concurrency ?? 0;
		} catch {
			checks.push(check("caps", "warn", "Subagent caps file", `unreadable ${capPath}`));
		}
	}
	checks.push(
		check(
			"caps",
			diskMax > 0 ? "pass" : "warn",
			"Subagent parallel caps",
			`desired maxTasks=${caps.maxTasks} concurrency=${caps.concurrency}; on-disk maxTasks=${diskMax || "?"} concurrency=${diskConc || "?"} (${capPath}). /reload after changes.`,
		),
	);

	// Auth / native providers
	const models = loadModelResolveContext(agentDir);
	const auth = [...models.authenticatedProviders].sort().join(", ") || "(none)";
	checks.push(
		models.authenticatedProviders.size > 0
			? check("auth", "pass", "Auth providers", auth)
			: check("auth", "fail", "Auth providers", "No providers in auth.json — /login"),
	);

	// typebox peer for pi-subagents children
	try {
		const req = createRequire(join(agentDir, "npm", "package.json"));
		req.resolve("typebox");
		checks.push(check("typebox", "pass", "typebox module", "resolvable from ~/.pi/agent/npm"));
	} catch {
		checks.push(
			check(
				"typebox",
				"fail",
				"typebox module",
				"Missing — run: cd ~/.pi/agent/npm && npm install typebox@1.1.38",
			),
		);
	}

	// Fleet agents
	const agentsDir = join(agentDir, "personal", "agents");
	for (const name of ["fleet-researcher.md", "fleet-reviewer.md", "fleet-ux.md"]) {
		const p = join(agentsDir, name);
		checks.push(
			existsSync(p)
				? check(`agent-${name}`, "pass", `Agent ${name}`, p)
				: check(`agent-${name}`, "fail", `Agent ${name}`, `missing ${p}`),
		);
	}

	// xai web search extension path
	const xaiPath = join(agentDir, "personal", "extensions", "xai-web-search.ts");
	checks.push(
		existsSync(xaiPath)
			? check("xai-ext", "pass", "xai_web_search extension", xaiPath)
			: check("xai-ext", "fail", "xai_web_search extension", `missing ${xaiPath}`),
	);

	// RPC ping
	if (input.rpcPing) {
		try {
			const ok = await input.rpcPing();
			checks.push(
				ok
					? check("rpc", "pass", "pi-subagents RPC", "ping ok")
					: check("rpc", "fail", "pi-subagents RPC", "ping failed — is npm:pi-subagents loaded?"),
			);
		} catch (err) {
			checks.push(
				check(
					"rpc",
					"fail",
					"pi-subagents RPC",
					err instanceof Error ? err.message : String(err),
				),
			);
		}
	} else {
		checks.push(
			check("rpc", "warn", "pi-subagents RPC", "ping not run (call /agentic doctor inside Pi)"),
		);
	}

	const pass = checks.filter((c) => c.level === "pass").length;
	const warn = checks.filter((c) => c.level === "warn").length;
	const fail = checks.filter((c) => c.level === "fail").length;
	return { checks, pass, warn, fail, ok: fail === 0 };
}

export function formatDoctorReport(report: DoctorReport): string {
	const glyph = (l: DoctorLevel) => (l === "pass" ? "✅" : l === "warn" ? "⚠️" : "❌");
	const lines = [
		`# Agentic doctor`,
		``,
		`**${report.pass} pass · ${report.warn} warn · ${report.fail} fail**`,
		``,
		...report.checks.map((c) => `${glyph(c.level)} **${c.title}** — ${c.detail}`),
		``,
		report.ok
			? `Overall: **OK** (warnings allowed).`
			: `Overall: **issues found** — fix fails before heavy fleets.`,
		``,
		`Also: \`/subagents-doctor\` for pi-subagents deep diagnostics.`,
	];
	return lines.join("\n");
}
