// pi extension entry: /footer toggle for the herd footer (DESIGN.md §7.1).
// Thin adapter over the unit-tested renderHerdFooter; structure mirrors pi's
// custom-footer example (footerData.getGitBranch, dispose on invalidate).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { renderHerdFooter } from "./herd-footer.ts";
import { createHerdSource, type ExecFn } from "./herd-source.ts";

const exec: ExecFn = (argv) =>
  new Promise((resolve, reject) => {
    execFile(argv[0]!, argv.slice(1), { timeout: 5000 }, (err, stdout, stderr) =>
      err ? reject(err) : resolve({ stdout, stderr }),
    );
  });

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let thinking = "";

  pi.on("thinking_level_select", async (event, ctx) => {
    thinking = event.level;
    if (enabled) ctx.ui.setStatus("herd-footer-thinking", `thinking: ${event.level}`);
  });

  pi.registerCommand("footer", {
    description: "Toggle the herd footer (hints + herd/model/thinking status)",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      if (!enabled) {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Default footer restored", "info");
        return;
      }

      const source = createHerdSource({ exec, env: process.env });

      ctx.ui.setFooter((tui, theme, footerData) => {
        const unsub = footerData.onBranchChange(() => tui.requestRender());
        return {
          dispose: unsub,
          invalidate() {},
          render(width: number): string[] {
            // Synchronous render: footer paints last-polled herd view;
            // the poll loop below refreshes and requests re-render.
            const herd = lastView;
            const lines = renderHerdFooter({
              model: ctx.model?.id,
              thinking: thinking || undefined,
              branch: footerData.getGitBranch(),
              herd,
              width,
            });
            // Adapter-only styling: hints dim; thinking via ramp token (R6).
            return [
              theme.fg("dim", lines[0]!),
              lines[1]!,
            ];
          },
        };
      });

      let lastView = await source.getView();
      const timer = setInterval(async () => {
        if (!enabled) return;
        lastView = await source.getView();
      }, 2500);
      pi.on("session_end", () => clearInterval(timer));

      ctx.ui.notify("Herd footer enabled", "info");
    },
  });
}

// Module-level mutable for the adapter's poll cache (kept out of the pure core).
let lastView: Awaited<ReturnType<ReturnType<typeof createHerdSource>["getView"]>> = null;
