// pi × herdr orchestration extension (DESIGN.md §7.7/7.8/7.1).
// One extension composing the three entries; behavior lives in the
// unit-tested cores (herd-status, herd-source, herd-task, herd-task-handler,
// herd-footer) — see tests/ at the dotfiles pi package root.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import herdWidget from "./herd-widget.ts";
import herdTaskCommand from "./herd-task-command.ts";
import herdFooterCommand from "./herd-footer-command.ts";

export default function (pi: ExtensionAPI) {
  herdWidget(pi);
  herdTaskCommand(pi);
  herdFooterCommand(pi);
}
