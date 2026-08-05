// pi extension entry: /herd-task command (DESIGN.md §7.8).
// Thin adapter — orchestration lives in the unit-tested herd-task-handler.
// Usage: /herd-task <name> [--base <ref>]  — must run inside a herdr pane.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { runHerdTask } from "./herd-task-handler.ts";
import type { ExecFn } from "./herd-source.ts";

const exec: ExecFn = (argv) =>
  new Promise((resolve, reject) => {
    execFile(argv[0]!, argv.slice(1), { timeout: 90_000 }, (err, stdout, stderr) =>
      err ? reject(err) : resolve({ stdout, stderr }),
    );
  });

export default function (pi: ExtensionAPI) {
  pi.registerCommand("herd-task", {
    description: "Worktree-first task launch: herdr worktree + sibling pi agent (usage: /herd-task <name> [--base <ref>])",
    handler: async (args, ctx) => {
      if (process.env.HERDR_ENV !== "1") {
        ctx.ui.notify("⚠ /herd-task only works inside a herdr pane (HERDR_ENV≠1)", "warning");
        return;
      }

      const parts = args.trim().split(/\s+/).filter(Boolean);
      const baseIdx = parts.indexOf("--base");
      const base = baseIdx >= 0 ? parts[baseIdx + 1] : undefined;
      const name = parts.find((p, i) => !p.startsWith("--") && i !== baseIdx + 1);

      if (!name) {
        ctx.ui.notify("⚠ usage: /herd-task <name> [--base <ref>]", "warning");
        return;
      }

      const result = await runHerdTask(name, { cwd: process.cwd(), exec, base });
      ctx.ui.notify(result.message, result.ok ? "info" : "warning");
    },
  });
}
