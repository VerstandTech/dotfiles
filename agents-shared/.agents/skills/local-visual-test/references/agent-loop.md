# Agent loop, proof lanes, findings

Product overlays (leases, Megazord, login) stay in the project skill.
This file is the global browser-agent contract.

## Observation loop

1. Interactive/scoped accessibility snapshot (`agent-browser snapshot -i` or MCP snapshot).
2. Act with **fresh** refs from that snapshot, or `getByRole` / `data-testid` when the tree is thrashing.
3. Re-snapshot after navigation, cookie/dev-tools dismiss, tab change, mock swap, dialog, or any DOM mutation. Never hardcode `e5` / `@e3`.
4. Screenshot only for visual rows. Inspect the PNG. No coordinate clicking when a ref exists. No hover-only completion.
5. `eval` returns one JSON-safe primitive or a tiny POJO. Never return `document`, a Node, or full `innerText`. `Object reference chain is too long` is CDP serialization, not an `--stdin` bug.

Dismiss cookie banners and overlay chrome, then re-snapshot before the real target.

## Proof lanes

| Lane | Allowed claim |
| --- | --- |
| Live / unmocked network | Backend, DI, cache, real payload |
| `network route --body` / `page.route` | UI/client rendering only |

Label screenshots `live-` or `mock-`. Mock green cannot satisfy a backend/DI claim.

## Touch

`set device` / iPhone UA is not a tap. Require `hasTouch: true`, `maxTouchPoints > 0`, and `tap()`. Otherwise mark the touch row blocked.

## Product-state matrix

Cover every applicable row; N/A needs a feature-specific reason:

happy · sad/recoverable · partial · empty vs all-failed · malformed fallback · desktop + ~375px · keyboard + real touch

Inspect every screenshot. Optional scoped `toMatchAriaSnapshot` (partial/`contain`) is a structural check, not pixel proof and not a substitute for the matrix.

Do **not** replace project Playwright e2e/CI with MCP or agent-browser. agent-browser is Chromium-only.

## File findings as GitHub issues

A pass that only narrates defects is unfinished.

1. `gh issue list --state all --search '<surface> <symptom>'`
2. Skip exact duplicates; comment SHA/evidence on the existing issue.
3. One issue per finding (`type:bug` + `priority:P0`–`P4`).
4. Body: SHA/PR, repro, actual vs expected, checkbox AC, screenshot path.
5. Link issues from the report. If none: write `no visual findings filed`.
6. Do not absorb out-of-scope polish into the current PR unless the user expands scope.
