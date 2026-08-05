/**
 * Detect turns that should steer toward fleet_dispatch (tight heuristics).
 */

const FLEET_VERBS =
	/\b(dispatch|spawn|launch|fan\s*out|fanout)\b/i;
const FLEET_NOUNS =
	/\b(sub[-\s]?agents?|fleet|swarm|personas?|researchers?|reviewers?)\b/i;
const COUNT =
	/\b(\d+|ten|dozen|many|multiple)\b/i;
const OPT_OUT =
	/\b(do\s+not|don't|dont|never|without|no)\b.{0,40}\b(dispatch|spawn|launch|fan\s*out|sub[-\s]?agents?|fleet)\b/i;

const REMINDER =
	"[Required] Prefer fleet_dispatch (or /fleet) to launch multi-agent swarms with distinct personas. " +
	"Do not manually craft N near-duplicate subagent tasks when fleet_dispatch can expand personas/models.";

export function detectFleetIntent(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed || trimmed.startsWith("/")) return false;
	if (OPT_OUT.test(trimmed)) return false;
	// Require verb + (fleet noun OR researchers/reviewers) + count signal
	if (!FLEET_VERBS.test(trimmed)) return false;
	if (!COUNT.test(trimmed)) return false;
	// Avoid bare "agents" product language — need sub-agents / fleet / researchers / reviewers
	if (!FLEET_NOUNS.test(trimmed)) return false;
	// Extra guard: bare "agents portal" style
	if (/\bagents?\s+portal\b/i.test(trimmed)) return false;
	if (/\bagent\s+tests?\b/i.test(trimmed)) return false;
	return true;
}

export function maybeTransformForFleet(text: string): { matched: boolean; text: string } {
	if (!detectFleetIntent(text)) return { matched: false, text };
	if (text.includes("Prefer fleet_dispatch")) return { matched: true, text };
	return { matched: true, text: `${text.replace(/\s+$/u, "")}\n\n${REMINDER}` };
}
