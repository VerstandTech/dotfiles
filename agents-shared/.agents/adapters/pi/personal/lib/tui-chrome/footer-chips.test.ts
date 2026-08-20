import { describe, expect, test } from "bun:test";
import { renderFooterChips, thinkingColor, visibleLength } from "./footer-chips.ts";

describe("footer-chips", () => {
	test("target-like layout: mode + agent + model + thinking + path", () => {
		const line = renderFooterChips({
			width: 80,
			mode: "yolo",
			agent: "swarm",
			model: "K3",
			thinking: "high",
			path: ".../production-",
		});
		expect(line).toContain("yolo");
		expect(line).toContain("swarm");
		expect(line).toContain("K3");
		expect(line).toContain("thinking: high");
		expect(line).toContain("production");
		expect(visibleLength(line)).toBeLessThanOrEqual(80);
	});

	test("chips are left-clustered — path trails, never right-flushed", () => {
		const line = renderFooterChips({
			width: 80,
			mode: "yolo",
			agent: "swarm",
			model: "K3",
			thinking: "high",
			path: ".../production-",
		});
		const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
		expect(plain).toBe("yolo swarm K3 thinking: high  .../production-");
	});

	test("tight width drops path before chips", () => {
		const line = renderFooterChips({
			width: 28,
			mode: "bash",
			agent: "herd",
			model: "grok-4.5",
			thinking: "high",
			path: "~/very/long/path/to/repo",
		});
		expect(line).toContain("bash");
		expect(visibleLength(line)).toBeLessThanOrEqual(28);
	});

	test("thinkingColor ramp is stable", () => {
		expect(thinkingColor("high")).toBe("#74bcbc");
		expect(thinkingColor("max")).toBe("#dca84c");
		expect(thinkingColor("off")).toBe("#888888");
	});

	test("empty input yields empty line", () => {
		expect(renderFooterChips({ width: 40 })).toBe("");
	});

	test("priority chip trails thinking", () => {
		const line = renderFooterChips({
			width: 80,
			model: "grok-4.5",
			thinking: "xhigh",
			priority: "priority",
		});
		const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
		expect(plain).toBe("grok-4.5 thinking: xhigh priority");
	});
});
