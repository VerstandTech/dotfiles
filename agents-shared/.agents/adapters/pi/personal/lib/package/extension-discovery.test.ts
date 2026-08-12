import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, "../../package.json"), "utf8")) as { pi?: { extensions?: string[] } };

describe("CLOSE-01 personal package extension discovery", () => {
  test("CLOSE01_TEST_EXTENSIONS_EXCLUDED: package globs do not load test files as extensions", () => {
    const globs = pkg.pi?.extensions ?? [];
    expect(globs).toContain("./extensions/*.ts");
    expect(globs.some((glob) => glob.includes("!*.test.ts") || glob.includes("!**/*.test.ts"))).toBe(true);
  });

  test("CLOSE01_TEST_FILE_NOT_LOADED: approval-seams tests are classified as non-extensions", async () => {
    let classify: ((file: string, globs: string[]) => boolean) | undefined;
    try {
      ({ isLoadedExtensionV1: classify } = await import("./extension-discovery"));
    } catch {
      classify = () => { throw new Error("CLOSE01_TEST_FILE_NOT_LOADED"); };
    }
    expect(classify("extensions/agentic-fleet.ts", pkg.pi?.extensions ?? [])).toBe(true);
    expect(classify("extensions/approval-seams.test.ts", pkg.pi?.extensions ?? [])).toBe(false);
  });
});
