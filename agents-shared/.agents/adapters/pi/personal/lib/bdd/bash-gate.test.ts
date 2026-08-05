import { describe, expect, test } from "bun:test";
import { isLikelyMutatingBash } from "./bash-gate.ts";

describe("isLikelyMutatingBash", () => {
	test("allows read-only inspection", () => {
		expect(isLikelyMutatingBash("git status")).toBe(false);
		expect(isLikelyMutatingBash("git diff HEAD")).toBe(false);
		expect(isLikelyMutatingBash("bun test lib/foo")).toBe(false);
		expect(isLikelyMutatingBash("rg TODO src")).toBe(false);
		expect(isLikelyMutatingBash("ls -la")).toBe(false);
	});

	test("blocks redirects and mutators", () => {
		expect(isLikelyMutatingBash("cat > src/x.ts")).toBe(true);
		expect(isLikelyMutatingBash("echo hi > file.txt")).toBe(true);
		expect(isLikelyMutatingBash("rm -rf dist")).toBe(true);
		expect(isLikelyMutatingBash("sed -i 's/a/b/' x.ts")).toBe(true);
		expect(isLikelyMutatingBash("git add -A")).toBe(true);
		expect(isLikelyMutatingBash("git commit -m x")).toBe(true);
		expect(isLikelyMutatingBash("tee out.md")).toBe(true);
	});
});
