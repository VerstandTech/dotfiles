/**
 * Detect turns that should steer the agent into BDD/TDD mode.
 */

const BDD_PATTERNS: RegExp[] = [
	/\bexample\s*map(?:ping)?\b/i,
	/\bBDD\b/,
	/\bTDD\b/,
	/\bred\s*[- ]\s*green\s*[- ]\s*refactor\b/i,
	/\bwrite\s+(?:the\s+)?(?:failing\s+)?tests?\s+first\b/i,
	/\bGherkin\b/i,
	/\bacceptance\s+(?:test|scenario|criteria)s?\b/i,
	/\bbehavior[- ]driven\b/i,
	/\btest[- ]driven\b/i,
	/\bformulate\s+(?:the\s+)?(?:scenarios?|features?)\b/i,
	/\bmutation\s+check\b/i,
];

const OPT_OUT =
	/\b(?:no\s+bdd|without\s+bdd|skip\s+bdd|don'?t\s+use\s+bdd|bdd\s+off|do\s+not\s+use\s+bdd)\b/i;

const REMINDER =
	"[Required] Follow the BDD/TDD workflow: load the bdd-tdd skill, check bdd_status, " +
	"and use bdd-mode phases (discovery → formulation → red → green → verify). " +
	"Do not implement production code before bdd_assert_red.";

export function detectBddIntent(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith("/")) return false;
	if (OPT_OUT.test(trimmed)) return false;
	return BDD_PATTERNS.some((re) => re.test(trimmed));
}

export function withBddReminder(text: string): string {
	const trimmed = text.replace(/\s+$/u, "");
	if (trimmed.includes("Follow the BDD/TDD workflow")) return text;
	return `${trimmed}\n\n${REMINDER}`;
}

export function maybeTransformForBdd(text: string): { matched: boolean; text: string } {
	if (!detectBddIntent(text)) return { matched: false, text };
	return { matched: true, text: withBddReminder(text) };
}
