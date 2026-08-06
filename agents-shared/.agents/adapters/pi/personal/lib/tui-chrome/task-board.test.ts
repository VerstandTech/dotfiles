import { describe, expect, test } from "bun:test";
import { miniBar, renderTaskBoard, type BoardTask } from "./task-board.ts";
import { visibleLength } from "./working-row.ts";

const NOW = 1_000_000;
const tasks: BoardTask[] = [
	{ id: "a", label: "Better location? Check src/app", startedAt: NOW - 12_000 },
	{ id: "b", label: "4. The `Oracle` model loop", startedAt: NOW - 3_000 },
];

describe("task-board", () => {
	test("miniBar: fixed cells, brackets, dotted fill", () => {
		const bar = miniBar(0, 0, 10);
		const plain = bar.replace(/\x1b\[[0-9;]*m/g, "");
		expect(plain.startsWith("[")).toBe(true);
		expect(plain.endsWith("]")).toBe(true);
		expect(plain.length).toBe(12);
	});

	test("miniBar animates: head position shifts with frame", () => {
		expect(miniBar(0)).not.toBe(miniBar(3));
	});

	test("rows: 3-digit index, label, dim age", () => {
		const lines = renderTaskBoard(tasks, { width: 100, frame: 0, now: NOW });
		expect(lines).toHaveLength(2);
		const p0 = lines[0]!.replace(/\x1b\[[0-9;]*m/g, "");
		expect(p0).toContain("001");
		expect(p0).toContain("Better location");
		expect(p0).toContain("12s");
		const p1 = lines[1]!.replace(/\x1b\[[0-9;]*m/g, "");
		expect(p1).toContain("002");
		expect(p1).toContain("3s");
	});

	test("overflow shows +N more", () => {
		const many: BoardTask[] = Array.from({ length: 9 }, (_, i) => ({
			id: `t${i}`,
			label: `task ${i}`,
			startedAt: NOW,
		}));
		const lines = renderTaskBoard(many, { width: 100, frame: 0, now: NOW, maxRows: 6 });
		expect(lines).toHaveLength(7);
		expect(lines[6]).toContain("+3 more");
	});

	test("empty input → no lines; narrow width never throws", () => {
		expect(renderTaskBoard([], { width: 80, frame: 0 })).toEqual([]);
		for (const w of [0, 5, 20]) {
			const lines = renderTaskBoard(tasks, { width: w, frame: 1, now: NOW });
			for (const l of lines) expect(visibleLength(l)).toBeLessThanOrEqual(Math.max(w, 0) || 0);
		}
	});
});
