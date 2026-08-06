import { describe, expect, test } from "bun:test";
import { moonFrame, progressBar, renderWorkingRow, visibleLength } from "./working-row.ts";

describe("working-row", () => {
	test("moonFrame cycles four phases with truecolor", () => {
		const a = moonFrame(0);
		const b = moonFrame(4);
		expect(a).toBe(b);
		expect(a).toContain("\x1b[38;2;");
		expect(["◐", "◓", "◑", "◒"].some((m) => a.includes(m))).toBe(true);
	});

	test("progressBar fills exact width", () => {
		const bar = progressBar(20, 3);
		expect(visibleLength(bar)).toBe(20);
	});

	test("progressBar is a solid ━ line (target style), gradient animates", () => {
		const a = progressBar(16, 0);
		const b = progressBar(16, 7);
		// Every visible glyph is the heavy rule — no track/head character mix.
		const plain = a.replace(/\x1b\[[0-9;]*m/g, "");
		expect(plain).toBe("━".repeat(16));
		// Same glyph layout, different colors over time (traveling gradient).
		expect(a).not.toBe(b);
	});

	test("renderWorkingRow fits width and includes label + bar", () => {
		const line = renderWorkingRow({ width: 60, frame: 2, label: "Working..." });
		expect(visibleLength(line)).toBeLessThanOrEqual(60);
		expect(line).toContain("Working...");
		expect(line).toContain("\x1b[38;2;");
	});

	test("renderWorkingRow shows elapsed when >= 1s", () => {
		const line = renderWorkingRow({ width: 80, frame: 0, elapsedSec: 12 });
		expect(line).toContain("12s");
	});

	test("renderWorkingRow never throws on tiny widths", () => {
		for (const w of [0, 1, 5, 10]) {
			const line = renderWorkingRow({ width: w, frame: 1 });
			expect(visibleLength(line)).toBeLessThanOrEqual(w === 0 ? 0 : w);
		}
	});
});
