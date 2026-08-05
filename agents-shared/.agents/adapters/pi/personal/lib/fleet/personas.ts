/**
 * Persona / angle libraries for large multi-agent fleets.
 * Pure data + expansion helpers — no Pi imports.
 */

export type FleetKind = "research" | "review" | "ux" | "custom";

export interface FleetPersona {
	/** Short stable id used in labels and output filenames */
	id: string;
	/** Human label */
	label: string;
	/** Angle injected into the child task */
	angle: string;
	/** Preferred builtin/custom agent role */
	agent: string;
}

/** Web / domain research angles (cycle if count > length). */
export const RESEARCH_PERSONAS: FleetPersona[] = [
	{
		id: "primary-sources",
		label: "Primary sources",
		agent: "fleet-researcher",
		angle:
			"Prioritize official docs, specs, RFCs, and primary sources. Cite URLs. Flag secondary commentary.",
	},
	{
		id: "recent-developments",
		label: "Recent developments",
		agent: "fleet-researcher",
		angle:
			"Focus on 2025–2026 changes, release notes, deprecations, and breaking changes. Prefer dated sources.",
	},
	{
		id: "practitioners",
		label: "Practitioner experience",
		agent: "fleet-researcher",
		angle:
			"Find real-world adoption notes, war stories, benchmarks, and production gotchas from practitioners.",
	},
	{
		id: "competitors",
		label: "Competitive landscape",
		agent: "fleet-researcher",
		angle:
			"Compare competing tools/approaches. Tabulate strengths, weaknesses, pricing signals, and lock-in.",
	},
	{
		id: "risks",
		label: "Risks & failure modes",
		agent: "fleet-researcher",
		angle:
			"Catalog risks, failure modes, security concerns, and known limitations with evidence.",
	},
	{
		id: "howto",
		label: "How-to & recipes",
		agent: "fleet-researcher",
		angle:
			"Collect concrete how-tos, minimal working examples, and step-by-step recipes.",
	},
	{
		id: "performance",
		label: "Performance & cost",
		agent: "fleet-researcher",
		angle:
			"Research latency, throughput, cost, quota, and scaling characteristics with numbers when available.",
	},
	{
		id: "ecosystem",
		label: "Ecosystem & integrations",
		agent: "fleet-researcher",
		angle:
			"Map ecosystem plugins, SDKs, community tools, and integration patterns.",
	},
	{
		id: "contrarian",
		label: "Contrarian view",
		agent: "fleet-researcher",
		angle:
			"Steelman the case against the popular approach. Find credible critiques and when NOT to use it.",
	},
	{
		id: "decision",
		label: "Decision criteria",
		agent: "fleet-researcher",
		angle:
			"Propose decision criteria and a recommendation framework grounded in evidence, not vibes.",
	},
	{
		id: "local-scout",
		label: "Local codebase scout",
		agent: "scout",
		angle:
			"Inspect this repository for existing patterns, constraints, and files relevant to the topic. Cite paths.",
	},
	{
		id: "standards",
		label: "Standards & compliance",
		agent: "fleet-researcher",
		angle:
			"Find applicable standards, accessibility/security baselines, and compliance implications.",
	},
];

/** Code-review lenses (adversarial, read-only). */
export const REVIEW_PERSONAS: FleetPersona[] = [
	{
		id: "correctness",
		label: "Correctness",
		agent: "fleet-reviewer",
		angle:
			"Verify behavior matches intent. Hunt logic bugs, race conditions, off-by-ones, and broken invariants. Cite file:line.",
	},
	{
		id: "tests",
		label: "Tests & validation",
		agent: "fleet-reviewer",
		angle:
			"Assess test quality, missing cases, weak assertions, and whether verification commands prove the claim.",
	},
	{
		id: "security",
		label: "Security",
		agent: "fleet-reviewer",
		angle:
			"Authz/authn boundaries, injection, secret leakage, SSRF, unsafe deserialization, multi-tenant isolation.",
	},
	{
		id: "simplicity",
		label: "Simplicity",
		agent: "fleet-reviewer",
		angle:
			"Flag unnecessary abstraction, duplication, dead code, and complexity that does not earn its keep.",
	},
	{
		id: "api-contracts",
		label: "API & contracts",
		agent: "fleet-reviewer",
		angle:
			"Public API stability, schema validation, error shapes, backward compatibility, and type honesty.",
	},
	{
		id: "performance",
		label: "Performance",
		agent: "fleet-reviewer",
		angle:
			"N+1 queries, unbounded work, bundle weight, unnecessary re-renders, missing indexes, hot-path waste.",
	},
	{
		id: "concurrency",
		label: "Concurrency & state",
		agent: "fleet-reviewer",
		angle:
			"Shared mutable state, locking, idempotency, retry storms, queue/at-least-once hazards.",
	},
	{
		id: "error-handling",
		label: "Errors & resilience",
		agent: "fleet-reviewer",
		angle:
			"Swallowed errors, missing timeouts, partial failure, observability gaps, user-visible failure modes.",
	},
	{
		id: "accessibility-a11y",
		label: "Accessibility",
		agent: "fleet-reviewer",
		angle:
			"If UI-touched: keyboard, semantics, labels, contrast, focus traps. Otherwise note N/A with reason.",
	},
	{
		id: "dx-maintainability",
		label: "Maintainability",
		agent: "fleet-reviewer",
		angle:
			"Naming, module boundaries, testability, coupling, and whether a future reader can change this safely.",
	},
	{
		id: "data-migrations",
		label: "Data & migrations",
		agent: "fleet-reviewer",
		angle:
			"Schema/data migrations, backfill risk, nullability, index changes, dual-write windows.",
	},
	{
		id: "adversarial",
		label: "Adversarial skeptic",
		agent: "fleet-reviewer",
		angle:
			"Assume the change is wrong until proven. Look for the highest-severity issue others might miss.",
	},
];

/** UX / product review personas. */
export const UX_PERSONAS: FleetPersona[] = [
	{
		id: "first-time-user",
		label: "First-time user",
		agent: "fleet-ux",
		angle:
			"You have never used this product. Is the flow obvious? Where do you get stuck or confused?",
	},
	{
		id: "power-user",
		label: "Power user",
		agent: "fleet-ux",
		angle:
			"Optimize for speed and density. Keyboard paths, batch actions, information scent for experts.",
	},
	{
		id: "mobile-thumb",
		label: "Mobile / thumb zone",
		agent: "fleet-ux",
		angle:
			"Small screens, touch targets, scroll cost, bottom nav, fat-finger errors.",
	},
	{
		id: "accessibility",
		label: "Accessibility specialist",
		agent: "fleet-ux",
		angle:
			"WCAG-minded review: semantics, focus order, contrast, reduced motion, screen reader flow.",
	},
	{
		id: "skeptical-buyer",
		label: "Skeptical buyer",
		agent: "fleet-ux",
		angle:
			"Marketing honesty, trust, pricing clarity, empty states that convert without dark patterns.",
	},
	{
		id: "anxious-user",
		label: "Anxious / error-prone user",
		agent: "fleet-ux",
		angle:
			"Destructive actions, undo, confirmation copy, recovery from mistakes, calm error messages.",
	},
	{
		id: "international",
		label: "International / i18n",
		agent: "fleet-ux",
		angle:
			"Copy length, RTL readiness, locale formats, cultural assumptions in icons/metaphors.",
	},
	{
		id: "visual-craft",
		label: "Visual craft",
		agent: "fleet-ux",
		angle:
			"Hierarchy, spacing rhythm, alignment, contrast, consistency with design system.",
	},
	{
		id: "content-design",
		label: "Content design",
		agent: "fleet-ux",
		angle:
			"Microcopy clarity, CTA verbs, empty states, progressive disclosure, jargon.",
	},
	{
		id: "performance-feel",
		label: "Perceived performance",
		agent: "fleet-ux",
		angle:
			"Loading skeletons, optimistic UI, jank, time-to-interactive feel, feedback on slow ops.",
	},
	{
		id: "trust-privacy",
		label: "Trust & privacy",
		agent: "fleet-ux",
		angle:
			"What data is collected, permission prompts, scary defaults, transparency of AI actions.",
	},
	{
		id: "competitive-ux",
		label: "Competitive UX bar",
		agent: "fleet-ux",
		angle:
			"Compare to best-in-class products in the category. What feels dated or missing?",
	},
];

export function personasForKind(kind: FleetKind): FleetPersona[] {
	switch (kind) {
		case "research":
			return RESEARCH_PERSONAS;
		case "review":
			return REVIEW_PERSONAS;
		case "ux":
			return UX_PERSONAS;
		case "custom":
			return [];
	}
}

/**
 * Expand to exactly `count` personas. Cycles the library and suffixes
 * variant numbers when count exceeds the library size.
 */
export function expandPersonas(
	kind: FleetKind,
	count: number,
	custom?: Array<Pick<FleetPersona, "id" | "label" | "angle" | "agent">>,
): FleetPersona[] {
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`count must be a positive integer (got ${count})`);
	}
	const base =
		kind === "custom"
			? (custom ?? []).map((p) => ({
					id: p.id,
					label: p.label,
					angle: p.angle,
					agent: p.agent || "reviewer",
				}))
			: [...personasForKind(kind), ...(custom ?? [])];

	if (base.length === 0) {
		// Fallback generic slots
		return Array.from({ length: count }, (_, i) => ({
			id: `agent-${i + 1}`,
			label: `Agent ${i + 1}`,
			agent: defaultAgentForKind(kind),
			angle: `Independent perspective #${i + 1}. Be specific and evidence-backed. Do not duplicate generic advice.`,
		}));
	}

	const out: FleetPersona[] = [];
	for (let i = 0; i < count; i++) {
		const src = base[i % base.length]!;
		const cycle = Math.floor(i / base.length);
		out.push({
			...src,
			id: cycle === 0 ? src.id : `${src.id}-v${cycle + 1}`,
			label: cycle === 0 ? src.label : `${src.label} (v${cycle + 1})`,
			angle:
				cycle === 0
					? src.angle
					: `${src.angle} Variant ${cycle + 1}: deliberately seek findings the base angle might miss; avoid repeating prior generic points.`,
		});
	}
	return out;
}

export function defaultAgentForKind(kind: FleetKind): string {
	switch (kind) {
		case "research":
			return "fleet-researcher";
		case "review":
			return "fleet-reviewer";
		case "ux":
			return "fleet-ux";
		case "custom":
			return "reviewer";
	}
}
