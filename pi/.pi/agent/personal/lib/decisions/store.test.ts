import { describe, expect, test } from "bun:test";
import {
	acceptedDecisions,
	checkDecisionGate,
	createDecision,
	emptyDecisionStore,
	queryDecisions,
	supersedeDecision,
	upsertDecision,
} from "./store.ts";
import type { DecisionRecord } from "./types.ts";

const base = (over: Partial<DecisionRecord> & Pick<DecisionRecord, "id" | "title" | "decision">): DecisionRecord => ({
	kind: "constraint",
	status: "accepted",
	context: "ctx",
	createdAt: "2026-08-01T00:00:00.000Z",
	updatedAt: "2026-08-01T00:00:00.000Z",
	...over,
});

describe("decision store", () => {
	test("upsert and query by status/kind", () => {
		let store = emptyDecisionStore("demo");
		store = upsertDecision(
			store,
			base({ id: "DEC-001", title: "No shared DB", decision: "Services must not share a database" }),
		);
		store = upsertDecision(
			store,
			base({
				id: "DEC-002",
				kind: "architecture",
				status: "proposed",
				title: "Use event bus",
				decision: "Prefer async events",
			}),
		);
		expect(acceptedDecisions(store)).toHaveLength(1);
		expect(queryDecisions(store, { kind: "architecture" })).toHaveLength(1);
		expect(queryDecisions(store, { text: "database" })[0]?.id).toBe("DEC-001");
	});

	test("createDecision allocates sequential ids", () => {
		let store = emptyDecisionStore();
		const a = createDecision({
			store,
			kind: "requirement",
			title: "Login",
			context: "users need login",
			decision: "support email login",
		});
		expect(a.record.id).toBe("DEC-001");
		const b = createDecision({
			store: a.store,
			kind: "requirement",
			title: "MFA",
			context: "security",
			decision: "require MFA",
		});
		expect(b.record.id).toBe("DEC-002");
	});

	test("supersedeDecision marks old and links new", () => {
		let store = emptyDecisionStore();
		store = upsertDecision(
			store,
			base({ id: "DEC-001", title: "REST only", decision: "Use REST" }),
		);
		store = supersedeDecision(
			store,
			"DEC-001",
			base({
				id: "DEC-003",
				title: "REST + GraphQL",
				decision: "Use REST for public, GraphQL for BFF",
				status: "accepted",
			}),
		);
		expect(store.decisions.find((d) => d.id === "DEC-001")?.status).toBe("superseded");
		expect(store.decisions.find((d) => d.id === "DEC-003")?.supersedes).toBe("DEC-001");
	});

	test("checkDecisionGate blocks must-not actions", () => {
		const store = upsertDecision(
			emptyDecisionStore(),
			base({
				id: "DEC-010",
				title: "No raw SQL in UI",
				decision: "Services must not expose raw SQL to the UI layer",
				scopePaths: ["src/ui"],
			}),
		);
		const result = checkDecisionGate({
			store,
			action: "expose raw SQL helpers to the UI layer for debugging",
			paths: ["src/ui/debug.ts"],
		});
		expect(result.ok).toBe(false);
		expect(result.blockers.some((b) => b.includes("DEC-010"))).toBe(true);
	});

	test("checkDecisionGate allows unrelated actions", () => {
		const store = upsertDecision(
			emptyDecisionStore(),
			base({
				id: "DEC-010",
				title: "No raw SQL in UI",
				decision: "Services must not expose raw SQL to the UI layer",
			}),
		);
		const result = checkDecisionGate({
			store,
			action: "add unit tests for invoice rounding",
			paths: ["src/billing/round.test.ts"],
		});
		expect(result.ok).toBe(true);
	});
});
