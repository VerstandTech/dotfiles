/**
 * Detect bash commands that likely mutate the filesystem during gated BDD phases.
 */

const MUTATING_PATTERNS: RegExp[] = [
	/\b(rm|mv|cp|install|unlink|rmdir)\b/i,
	/\b(sed|perl|ruby|python3?)\b[^\n]*\s-i\b/i,
	/\btee\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bgit\s+(add|commit|checkout|restore|reset|rebase|merge|cherry-pick|stash\s+pop|apply|am)\b/i,
	/\bnpm\s+install\b/i,
	/\bpnpm\s+add\b/i,
	/\byarn\s+add\b/i,
	/\bbun\s+add\b/i,
	// redirections that write files
	/(^|[^0-9])>{1,2}\s*["']?[\w./~-]/,
	/\bcat\s*>\s*/i,
	/\becho\s+.*>\s*/i,
	/\bprintf\s+.*>\s*/i,
	/\bdd\s+if=/i,
	/\btouch\b/i,
	/\bmkdir\b/i,
	/\btruncate\b/i,
];

const READ_ONLY_ALLOW: RegExp[] = [
	/^\s*(ls|pwd|whoami|date|uname|env|printenv|which|type|true|false|echo|printf)\b/i,
	/^\s*(cat|head|tail|less|more|wc|file|stat|du|df)\b/i,
	/^\s*(rg|grep|find|fd|ag|ack)\b/i,
	/^\s*(git\s+(status|diff|log|show|blame|branch|rev-parse|ls-files|remote))\b/i,
	/^\s*(bun\s+test|npm\s+test|pnpm\s+test|yarn\s+test|go\s+test|pytest|cargo\s+test)\b/i,
	/^\s*(bun\s+run\s+gherkin:|npm\s+run\s+gherkin:|pnpm\s+run\s+gherkin:)\b/i,
	/^\s*(bun\s+run\s+typecheck|tsc\b)/i,
];

export function isLikelyMutatingBash(command: string): boolean {
	const cmd = command.trim();
	if (!cmd) return false;
	// Multi-command: if any segment mutates, block
	const parts = cmd.split(/(?:&&|\|\||;|\n)/);
	for (const part of parts) {
		const p = part.trim();
		if (!p) continue;
		if (READ_ONLY_ALLOW.some((re) => re.test(p)) && !MUTATING_PATTERNS.some((re) => re.test(p))) {
			continue;
		}
		if (MUTATING_PATTERNS.some((re) => re.test(p))) return true;
		// bare unknown — allow (could be test runner); only block known mutators
	}
	return false;
}
