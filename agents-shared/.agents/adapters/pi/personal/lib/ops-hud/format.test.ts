import { describe, expect, test } from "bun:test";
import {
	buildHudSnapshot,
	classifyTool,
	formatStatusLine,
	formatWidgetLines,
	formatWorkingMessage,
	summarizeToolArgs,
	type HudActivity,
} from "./format.ts";

describe("classifyTool", () => {
	test("detects web and subagent tools", () => {
		expect(classifyTool("xai_web_search")).toBe("web_search");
		expect(classifyTool("subagent")).toBe("subagent");
		expect(classifyTool("subagent_wait")).toBe("subagent");
		expect(classifyTool("bash")).toBe("other");
	});
});

describe("summarizeToolArgs", () => {
	test("summarizes web query and subagent task", () => {
		expect(summarizeToolArgs("xai_web_search", { query: "Linktree Pro pricing" })).toContain(
			"Linktree",
		);
		expect(
			summarizeToolArgs("subagent", {
				agent: "researcher",
				task: "Find competitor pricing pages",
			}),
		).toContain("researcher");
	});
});

describe("hud formatting", () => {
	const now = 1_000_000;
	const activities: HudActivity[] = [
		{
			kind: "web_search",
			id: "1",
			query: "Linktree Pro pricing",
			startedAt: now - 5000,
		},
		{
			kind: "subagent",
			id: "2",
			label: "researcher",
			detail: "competitors",
			startedAt: now - 2000,
		},
		{
			kind: "web_search",
			id: "3",
			query: "Beacons pricing",
			startedAt: now - 1000,
		},
	];

	test("status line shows counts", () => {
		const snap = buildHudSnapshot(activities);
		const line = formatStatusLine(snap, now);
		expect(line).toContain("🌐×2");
		expect(line).toContain("🤖×1");
		expect(line).toContain("Beacons");
	});

	test("widget lists parallel ops", () => {
		const lines = formatWidgetLines(buildHudSnapshot(activities), now);
		expect(lines[0]).toContain("Live ops");
		expect(lines.some((l) => l.includes("search"))).toBe(true);
		expect(lines.some((l) => l.includes("researcher"))).toBe(true);
		expect(lines.some((l) => l.includes("subagents-fleet"))).toBe(true);
	});

	test("working message for mixed load", () => {
		const msg = formatWorkingMessage(buildHudSnapshot(activities));
		expect(msg).toContain("Researching the web");
		expect(msg).toContain("agents");
	});
});
