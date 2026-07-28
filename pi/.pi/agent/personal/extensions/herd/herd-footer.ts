// Pure renderer for the herd footer (DESIGN.md §7.1).
// Two-line contract: keybinding hints (dim) + herd-left/model-right status.
// Traces: docs/pi-herdr-acceptance.md Slice 5 · docs/pi-herdr-example-map.md R6

import type { HerdView } from "./herd-status.ts";

export interface FooterInput {
  model?: string;
  thinking?: string;
  branch?: string | null;
  herd?: HerdView | null;
  width: number;
}

const HINTS = "enter send · esc interrupt · ctrl+p model · ctrl+o tools · / commands · ! bash";

/** ANSI-safe visible length (SGR sequences only). */
function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Truncate by visible columns, preserving leading content (middle-first: tail cut). */
function truncateVisible(s: string, width: number): string {
  if (width < 1) return "";
  if (visibleLength(s) <= width) return s;
  // eslint-disable-next-line no-control-regex
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  return plain.slice(0, width);
}

/**
 * Render the footer. Always exactly 2 lines (F-1), each ≤ width visible
 * columns (F-3). Missing data is omitted, never placeholder'd (F-2).
 * Thinking level appears as text — color is the adapter's job (R6-E3).
 */
export function renderHerdFooter(input: FooterInput): string[] {
  const hints = truncateVisible(HINTS, input.width);

  const left = input.herd ? input.herd.summary : "";
  const modelParts: string[] = [];
  if (input.model) modelParts.push(input.model);
  if (input.thinking) modelParts.push(`thinking ${input.thinking}`);
  const right = modelParts.length
    ? modelParts.join(" · ") + (input.branch ? ` (${input.branch})` : "")
    : input.branch
      ? `(${input.branch})`
      : "";

  let status: string;
  if (left && right) {
    const gap = input.width - visibleLength(left) - visibleLength(right);
    if (gap >= 2) {
      status = left + " ".repeat(gap) + right;
    } else {
      // Tight fit: right (model/thinking/branch) wins; truncate the left
      // herd summary so right-aligned state survives intact (F-1/F-3).
      const leftBudget = input.width - visibleLength(right) - 2;
      status = leftBudget >= 1
        ? truncateVisible(left, leftBudget) + "  " + right
        : truncateVisible(right, input.width);
    }
  } else {
    status = truncateVisible(left || right, input.width);
  }

  return [hints, truncateVisible(status, input.width)];
}
