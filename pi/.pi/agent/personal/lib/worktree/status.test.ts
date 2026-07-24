import { describe, expect, test } from "bun:test";
import { isWorktreeDirty, readBddPhase, enrichCard } from "./status.ts";
import type { WorktreeCard } from "./types.ts";

const base: WorktreeCard = {
	id: "feat-a",
	path: "/repo/.worktrees/feat-a",
	busy: "idle",
	updatedAt: "t",
};

describe("isWorktreeDirty", () => {
	test("empty porcelain => clean", () => {
		expect(isWorktreeDirty("/x", () => "")).toBe(false);
	});
	test("non-empty => dirty", () => {
		expect(isWorktreeDirty("/x", () => " M file.ts\n")).toBe(true);
	});
});

describe("readBddPhase", () => {
	test("reads stamp file when present", () => {
		const phase = readBddPhase("/repo/wt", {
			exists: (p) => p.endsWith("bdd-phase"),
			read: () => "green\n",
		});
		expect(phase).toBe("green");
	});
});

describe("enrichCard", () => {
	test("applies dirty and phase", () => {
		const c = enrichCard(base, { dirty: true, bddPhase: "red" });
		expect(c.dirty).toBe(true);
		expect(c.bddPhase).toBe("red");
	});
});
