// pi extension entry: herd widget (DESIGN.md §7.7).
// Thin adapter — all behavior lives in the unit-tested herd-source/herd-status.
// Manual verification: run pi inside a herdr pane; widget appears above the
// editor when sibling agents exist, hides itself outside herdr (R5-E2/E3).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { claimPoller, createHerdSource, type ExecFn } from "./herd-source.ts";
import { herdLines, sameLines } from "./herd-status.ts";

// Timeout < poll interval (R7-E2): a slow CLI call (measured 157–362ms) must
// never overlap the next tick.
const exec: ExecFn = (argv) =>
  new Promise((resolve, reject) => {
    execFile(argv[0]!, argv.slice(1), { timeout: 1500 }, (err, stdout, stderr) =>
      err ? reject(err) : resolve({ stdout, stderr }),
    );
  });

const POLL_MS = 2500;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const source = createHerdSource({ exec, env: process.env });
    let lastLines: string[] | null | undefined; // undefined = never published
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return; // serialized polls (R7-E2): never pile up
      inFlight = true;
      try {
        const lines = herdLines(await source.getView());
        // Publish only on change (R7-E2): setWidget triggers a TUI re-layout,
        // so an unchanged poll must cost nothing. undefined clears (hides).
        if (lastLines === undefined || !sameLines(lastLines, lines)) {
          if (!lines) {
            ctx.ui.setWidget("herd", undefined);
          } else {
            // gh-dash density: summary accent, rows dim meta — theme-colored at publish time.
            const th = ctx.ui.theme;
            const styled = lines.map((line, i) => {
              if (i === 0) return th.fg("accent", line);
              if (line.startsWith("⚠")) return th.fg("warning", line);
              if (line.startsWith("●")) return th.fg("accent", line);
              if (line.startsWith("✓")) return th.fg("success", line);
              return th.fg("dim", line);
            });
            ctx.ui.setWidget("herd", styled);
          }
          lastLines = lines;
        }
      } finally {
        inFlight = false;
      }
    };

    await refresh();
    // R7-E3: pi fires session_shutdown (never session_end) on reload/quit/
    // session switch; claimPoller additionally guarantees no stacked pollers
    // even if a previous instance's cleanup never ran.
    const dispose = claimPoller("herd:widget", () => void refresh(), POLL_MS);
    pi.on("session_shutdown", () => dispose());
  });
}
