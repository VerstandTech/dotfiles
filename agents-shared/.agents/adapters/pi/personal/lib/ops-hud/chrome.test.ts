import { describe, expect, test } from "bun:test";
import {
	amberGradient,
	blendHex,
	fgHex,
	opsIndicatorFrames,
	skyTealGradient,
	statusDim,
	statusDotFrame,
	workingIndicatorFrames,
} from "./chrome.ts";

describe("chrome gradients", () => {
	test("blendHex midpoint between blue and teal", () => {
		const mid = blendHex("#66a6f8", "#74bcbc", 0.5);
		expect(mid).toMatch(/^#[0-9a-f]{6}$/);
		// Should sit between the two channels.
		const r = Number.parseInt(mid.slice(1, 3), 16);
		expect(r).toBeGreaterThan(0x66);
		expect(r).toBeLessThanOrEqual(0x74);
	});

	test("skyTealGradient returns requested step count of hex colors", () => {
		const g = skyTealGradient(12);
		expect(g).toHaveLength(12);
		for (const c of g) expect(c).toMatch(/^#[0-9a-f]{6}$/);
	});

	test("amberGradient stays warm (high R, mid G, low B)", () => {
		for (const c of amberGradient(6)) {
			const r = Number.parseInt(c.slice(1, 3), 16);
			const b = Number.parseInt(c.slice(5, 7), 16);
			expect(r).toBeGreaterThan(0xa0);
			expect(b).toBeLessThan(0xa0);
		}
	});

	test("workingIndicatorFrames: moon glyphs + truecolor + calm interval", () => {
		const { frames, intervalMs } = workingIndicatorFrames();
		expect(frames.length).toBeGreaterThanOrEqual(4);
		expect(intervalMs).toBeGreaterThanOrEqual(80);
		expect(intervalMs).toBeLessThanOrEqual(160);
		expect(frames.some((f) => f.includes("◐") || f.includes("◑"))).toBe(true);
		expect(frames.every((f) => f.includes("\x1b[38;2;"))).toBe(true);
	});

	test("opsIndicatorFrames: braille + sky/teal truecolor", () => {
		const { frames, intervalMs } = opsIndicatorFrames();
		expect(frames).toHaveLength(10);
		expect(intervalMs).toBe(80);
		expect(frames[0]).toContain("⠋");
		expect(frames.every((f) => f.includes("\x1b[38;2;"))).toBe(true);
	});

	test("statusDotFrame cycles deterministically", () => {
		const a = statusDotFrame(0);
		const b = statusDotFrame(16); // full cycle of 16
		expect(a).toBe(b);
		expect(a).toContain("●");
		expect(statusDim(" hello")).toContain("hello");
	});

	test("fgHex is a no-op on bad hex", () => {
		expect(fgHex("nope", "x")).toBe("x");
	});
});
