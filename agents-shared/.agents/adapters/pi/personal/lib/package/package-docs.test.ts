import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../../../../../..");
const guide = join(repo, "docs/pi-assurance-package.md");
const readme = join(repo, "README.md");

describe("PKG-01 operator package guide", () => {
  test("PKG01_OPERATOR_GUIDE_MISSING: documents staged verification migration disable and rollback", () => {
    if (!existsSync(guide)) throw new Error("PKG01_OPERATOR_GUIDE_MISSING");
    const text = readFileSync(guide, "utf8");
    for (const heading of [
      "## Frozen compatibility pins",
      "## Temporary-HOME validation",
      "## Existing-machine migration",
      "## Disable",
      "## Rollback",
      "## Stable failure codes",
    ]) expect(text).toContain(heading);
    expect(text).toContain("scripts/stage-ai-resources.py");
    expect(text).toContain("verify-ai-resources.py");
    expect(text).toContain("never targets the process HOME");
    expect(text).toContain("does not uninstall");
    expect(text).toContain("legacy network bootstrap");
    expect(text).not.toContain("Run `./install.sh`");
  });

  test("README links the package and recovery guide", () => {
    expect(readFileSync(readme, "utf8")).toContain("docs/pi-assurance-package.md");
  });
});
