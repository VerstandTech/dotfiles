export const HIGH_ASSURANCE_PLAYBOOK = Object.freeze({
	version: "1.0",
	published: "July 2026",
	canonicalPath: "docs/high-assurance-playbook.md",
	implementationPath: "docs/high-assurance-pi-implementation.md",
});

export function formatHighAssurancePlaybookReference(): string {
	return [
		`# High-Assurance Multi-Agent Software Development Playbook v${HIGH_ASSURANCE_PLAYBOOK.version}`,
		`Published: ${HIGH_ASSURANCE_PLAYBOOK.published}`,
		`Canonical playbook: \`${HIGH_ASSURANCE_PLAYBOOK.canonicalPath}\``,
		`Pi implementation profile: \`${HIGH_ASSURANCE_PLAYBOOK.implementationPath}\``,
		"",
		"The playbook is the normative process target. The implementation profile distinguishes controls enforced now, controls available through configured local commands, and roadmap work.",
		"bdd-mode never installs tools, performs network discovery, or synthesizes unpinned commands. Named doctor, coverage, formal, replay, security, chaos, and similar tools run only through explicit or safely detected configured local commands.",
	].join("\n");
}
