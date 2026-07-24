import { describe, expect, test } from "bun:test";
import { loadRegistry, saveRegistry, registryPath } from "./io.ts";

describe("io registry", () => {
	test("load missing returns empty", () => {
		const r = loadRegistry("/repo", { exists: () => false });
		expect(r.entries).toEqual([]);
	});

	test("save then path under .pi", () => {
		const files: Record<string, string> = {};
		const path = saveRegistry(
			"/repo",
			{ version: 1, focusedId: "main", entries: [] },
			{
				mkdir: () => {},
				write: (p, b) => {
					files[p] = b;
				},
			},
		);
		expect(path).toBe(registryPath("/repo"));
		expect(files[path]).toContain("focusedId");
	});
});
