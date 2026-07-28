// pi extension entry: herd widget (DESIGN.md §7.7).
// Thin adapter — all behavior lives in the unit-tested herd-source/herd-status.
// Manual verification: run pi inside a herdr pane; widget appears above the
// editor when sibling agents exist, hides itself outside herdr (R5-E2/E3).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { createHerdSource, type ExecFn } from "./herd-source.ts";

const exec: ExecFn = (argv) =>
  new Promise((resolve, reject) => {
    execFile(argv[0]!, argv.slice(1), { timeout: 5000 }, (err, stdout, stderr) =>
      err ? reject(err) : resolve({ stdout, stderr }),
    );
  });

const POLL_MS = 2500;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const source = createHerdSource({ exec, env: process.env });

    const refresh = async () => {
      const view = await source.getView();
      // setWidget takes string[] synchronously; undefined clears (hides) it.
      ctx.ui.setWidget("herd", view ? [view.summary, ...view.rows] : undefined);
    };

    await refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    pi.on("session_end", () => clearInterval(timer));
  });
}
