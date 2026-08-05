---
name: local-visual-test
description: >
  Merged local visual QA skill: Docker/Redis/dev-server/tunnel preflight,
  Turbopack + browser HTTP-cache stale-UI diagnosis, hard-reload fix ladder,
  and real-browser feature verification (dev-browser / Playwright / agent-browser).
  Use when the user asks to "test it visually", "test feature", "test the
  feature", "verify in the browser", "visual smoke test", "check the change
  in the app", "megazord test", "local visual QA", "check it visually", or after
  shipping user-visible UI/AI features that need a real browser pass. Also use
  when a visual run fails with 500s, stuck spinners, missing buttons after
  renames, Redis reconnect storms, tunnel timeouts, or "code changed but UI
  didn't". Slash: /local-visual-test (alias: /test-feature).
---

# Local Visual Test (merged)

Prove a change works in a **real browser** against the **local** stack
(Docker + dev server + optional tunnel). This skill merges the old
`local-visual-test` playbook and `test-feature` automation workflow into one
global procedure.

Product-specific login/generation details stay in **project** skills
(e.g. olhaminha.bio `visual-app-verify`, `dev-browser-visual-testing`) — run
**this** skill's preflight + cache ladder first, then the project overlay.

## Non-negotiables

1. **Separate “env broken” from “feature broken.”** Preflight first.
2. **Never claim a visual pass you did not observe** in the browser.
3. **Do not kill/restart the user’s dev server** unless they ask. Env/DI changes
   that need a restart → **ask the user**. Soft HMR is not a restart.
4. Prefer the project’s **tunnel origin** when callbacks/providers/cookies
   matter (olhaminha.bio default: `https://megazord.olhaminha.bio` — not
   localhost alone for webhook/AI completion paths).
5. Prefer `data-testid` / `page.evaluate` over brittle accessibility-tree refs.
6. **After client renames or dialog/dynamic-import edits, assume stale client
   until proven otherwise.** Soft navigation is not proof the new code is running.

## Mental model (four layers + two caches)

| Layer | Role | Failure looks like |
|-------|------|--------------------|
| Docker (Mongo/Redis) | Data + cache/queues | 500, `ECONNREFUSED :27017`, Redis reconnect loops, hung API |
| Next/Turbopack dev server | UI + API + webhooks | Missing UI after rename, wrong i18n, DI not picking env |
| Tunnel | Public origin for webhooks/OAuth | Provider “done” but UI spins forever; 524s |
| Browser session | Auth + profile + clicks | Not logged in, no profile, cookie wall |
| **Browser HTTP cache** | Reuses old `/_next` chunks | Source correct, UI still old labels/handlers |
| **Turbopack module graph** | Partial HMR | Parent has new props, child still old; mid-HMR `MISSING_MESSAGE` |

The tunnel is **usually not** a CDN-style asset cache. For “UI didn’t update,”
fix **browser cache + HMR/Turbopack** before blaming cloudflared.

---

## Phase A — Preflight (every session)

```text
[ ] Docker Desktop running
[ ] App Mongo + Redis containers up and healthy
[ ] Redis PING → PONG
[ ] Dev server listening (do not restart unless needed)
[ ] Tunnel up if feature needs public callbacks (curl origin → 200)
[ ] Correct env flags for this test (mock vs real AI, test auth, BASE_PATH)
[ ] Browser context will run with **cache disabled** when verifying client edits
```

Quick commands (adapt names to the project):

```bash
docker ps --filter name=lookmybio --format '{{.Names}} {{.Status}}'
docker exec lookmybio-redis redis-cli ping
curl -s -o /dev/null -w "%{http_code}\n" -m 15 https://megazord.olhaminha.bio/
curl -s -o /dev/null -w "%{http_code}\n" -m 5 http://127.0.0.1:3000/
pgrep -f "cloudflared tunnel" >/dev/null && echo "TUNNEL RUNNING" || echo "TUNNEL NOT RUNNING"
pgrep -f "next dev" >/dev/null && echo "DEV SERVER RUNNING" || echo "DEV SERVER NOT RUNNING"
```

If Docker died mid-session: start Docker → start mongo/redis → wait until Redis
reconnect storms stop in server logs → then retest.

**Env flags that only apply after a user-owned restart** (HMR will not pick these up):

- `DISABLE_IMAGE_GENERATION_MOCK`, `ENABLE_TEST_AUTH` / `TEST_MODE`
- `NEXT_PUBLIC_BASE_PATH` / `NEXTAUTH_URL`
- DI container wiring / new injected services

See also: [references/preflight-and-failures.md](references/preflight-and-failures.md).

---

## Phase B — Turbopack + browser cache (when UI ≠ source)

### Why your change is invisible

Three independent mechanisms stack:

1. **Browser HTTP cache** — Chromium reuses old `/_next/static/chunks/*` (and
   sometimes RSC payloads) after soft reload or SPA navigation.
2. **Partial Turbopack HMR** — only some modules hot-swap. Classic failure:
   parent receives `onUpscale`, child still renders `onAutoScale`.
3. **Stale `.next` graph** — rare; survives hard reload until wipe + restart.

Cold Turbopack compile of a large route can take **20–60s** — that is not a
product bug. Retry with a longer timeout; do not restart the server for that alone.

### Fix ladder (stop when UI matches source)

Do **in order**. Escalate only after the previous step fails twice.

#### 1. Disable HTTP cache + hard reload (fixes most “missing button” cases)

**Playwright / Playwright MCP (preferred):**

```js
// On the existing page/context before asserting UI:
const client = await page.context().newCDPSession(page)
await client.send('Network.setCacheDisabled', { cacheDisabled: true })
await page.reload({ waitUntil: 'commit', timeout: 60000 })
```

If the tool cannot open a CDP session, navigate with a cache-bust query and
avoid `networkidle` on heavy Next apps:

```js
const url = new URL(page.url())
url.searchParams.set('v', String(Date.now()))
await page.goto(url.toString(), { waitUntil: 'commit', timeout: 60000 })
```

**dev-browser:**

```bash
dev-browser --timeout 60 <<'SCRIPT'
const page = await browser.getPage("visual");
// Prefer CDP when the installed dev-browser exposes it; else cache-bust:
const u = new URL(page.url() || "https://megazord.olhaminha.bio/");
u.searchParams.set("v", String(Date.now()));
await page.goto(u.toString(), { waitUntil: "commit", timeout: 60000 });
console.log(JSON.stringify({ url: page.url() }));
SCRIPT
```

**Manual Chrome:** DevTools → Network → **Disable cache** (keep DevTools open) →
Cmd+Shift+R (hard reload).

Soft F5 / in-app client navigation is **not** a hard reload.

#### 2. Full remount

Navigate to a different route (e.g. `/dashboard`), then back to the feature URL
with cache still disabled. Forces React tree remount if HMR left mixed modules.

#### 3. Prove which layer is stale (do not guess)

```text
1. Source on disk:     rg 'newSymbol' apps/web/src/...
2. Compiled chunk:     rg 'newSymbol' apps/web/.next/dev/static/chunks --glob '*.js'
3. Runtime React:      evaluate __reactFiber* → memoizedProps on the control
```

| Source | Chunk | Fiber | Meaning |
|--------|-------|-------|---------|
| yes | no | — | Turbopack has not emitted the module yet (wait cold compile / rebuild) |
| yes | yes | no/old | **Browser cache or partial HMR** — stay on step 1–2; then nuclear |
| yes | yes | yes | Code is live — bug is product/logic, not cache |

#### 4. Service workers (if any)

```js
await page.evaluate(async () => {
  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []
  await Promise.all(regs.map(r => r.unregister()))
  if (window.caches?.keys) {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
  }
  return { unregistered: regs.length }
})
```

Then hard reload again with cache disabled.

#### 5. Nuclear — **ask the user** (never kill their server yourself)

```bash
rm -rf apps/web/.next
# Ask user to restart: bun run dev  (or their usual command)
```

Only after two failed hard reloads with cache disabled **and** chunk proof shows
source not in `.next`, or fiber still stale after remount.

Full diagnostic detail: [references/turbopack-and-browser-cache.md](references/turbopack-and-browser-cache.md).

---

## Phase C — Authenticate and exercise

### Auth

- Prefer project test-credentials / documented local auth (no Google OAuth when available).
- Dismiss cookie banners.
- Select a **profile** if the product is profile-scoped (e.g. AI Studio).
- Prefer tunnel origin for cookie/webhook parity when the project requires it.

Project overlays own the exact login snippets (credentials from local env — never invent secrets).

### Exercise the real user path

Same clicks a user would make. Prefer `data-testid`. After any client edit in the
same session, re-run **Phase B step 1** before declaring a control missing.

### Assert at the right depth

| Feature type | Minimum pass |
|--------------|--------------|
| Pure UI | Control visible, interaction works, no breaking console/runtime error |
| Client state (zoom, toggles) | DOM/`data-*` state + screenshot if useful |
| CRUD / API | UI result **and** list refresh or network success |
| Async jobs / AI | UI terminal state **and** server log or DB status (not stuck PROCESSING) |
| Provider webhooks | Tunnel up; callback hit local server; terminal task/media state |

Discoverability counts: if exit is only “click again / Esc”, call it out.

---

## Phase D — Browser automation recipes

Use whichever tool the environment has. Prefer the project’s stated default
(Playwright MCP vs `dev-browser` vs `agent-browser`).

### Process checks (start missing pieces only)

```bash
pgrep -f "cloudflared tunnel" >/dev/null || (tunnel >/dev/null 2>&1 &)
# Do NOT start/restart next dev if the user already has one — ask first.
pgrep -f "next dev" >/dev/null && echo "DEV SERVER RUNNING" || echo "DEV SERVER NOT RUNNING — ask user to start"
```

### dev-browser: login shell (adapt selectors to the project)

```bash
dev-browser --timeout 60 <<'SCRIPT'
const page = await browser.getPage("visual");
await page.goto("https://megazord.olhaminha.bio/dashboard", {
  waitUntil: "commit",
  timeout: 45000
});
if (page.url().includes("/dashboard")) {
  console.log(JSON.stringify({ status: "already-authenticated", url: page.url() }));
} else {
  // Prefer project-documented test login (test-credentials API or test form).
  // Do not hardcode production passwords into commits.
  console.log(JSON.stringify({ status: "needs-login", url: page.url() }));
}
SCRIPT
```

### Screenshot + structure

```bash
dev-browser --timeout 30 <<'SCRIPT'
const page = await browser.getPage("visual");
const snap = await page.snapshotForAI();
const buf = await page.screenshot();
const path = await saveScreenshot(buf, "visual-test.png");
console.log(JSON.stringify({ url: page.url(), screenshot: path, snap: snap.full?.slice?.(0, 2000) }));
SCRIPT
```

Read screenshots with the image/read tool. After interactions, screenshot again.

Common actions: `page.click`, `page.fill`, `page.getByRole`, `page.waitForSelector`,
`page.evaluate`. Prefer `waitUntil: 'commit'` over `networkidle` on heavy Next pages.

Tool stubs: global `dev-browser` and `agent-browser` skills for install/CLI details.

---

## Phase E — Report honestly

- What was confirmed (URL, status, dims, task status, screenshot paths).
- What was **not** exercised (mocked generation, tunnel down, skipped mobile).
- Env incidents fixed along the way (Docker restart, cache-disabled hard reload,
  `.next` wipe) so the pass is trusted against a healthy stack.
- If UI still diverges from source after the full cache ladder, say so explicitly.

---

## Symptom → response

| Symptom | Default response |
|---------|------------------|
| Dashboard 500 + Mongo ECONNREFUSED | Start Docker + mongo/redis; reload |
| Redis reconnect attempt N / hung requests | Restart redis; wait for quiet logs |
| Tunnel 524 / goto timeout | Check tunnel + Redis; longer timeout / `waitUntil: 'commit'`; retry |
| Missing control after rename / “code is right” | **Phase B** cache-off hard reload → fiber vs chunk |
| `MISSING_MESSAGE` for renamed keys | Stale client mid-HMR — Phase B |
| Spinner forever after provider done | Logs + DB status; webhook/persist path; tunnel |
| Login ok but empty AI/dashboard | Select profile |
| Localhost works, tunnel fails | Fix tunnel / `NEXT_PUBLIC_BASE_PATH`; retest on tunnel |
| First load of large route times out | Cold Turbopack — retry 20–60s; don’t restart |
| UI fixed only after DevTools open | You were hitting browser cache — keep cache disabled in automation |

---

## Anti-patterns

- Claiming visual pass from unit tests only.
- Restarting the user’s server without asking.
- Using localhost for webhook/AI completion flows when tunnel is required.
- Declaring “missing UI” after soft navigate only.
- Changing product code while Docker is down.
- One timed-out `goto` as proof of feature failure.
- Blaming the Cloudflare tunnel for rename/stale-prop bugs before disabling cache.
- Hardcoding shared test passwords into skills or commits.

---

## Project overlays

If the repo has a product-specific visual skill:

1. Run **this** skill through Phase B (preflight + fresh client).
2. Then follow the project skill for login, mock flags, and feature steps.

Examples: olhaminha.bio `visual-app-verify`, `dev-browser-visual-testing`.

## Aliases

- `/local-visual-test` — this skill (canonical).
- `/test-feature` — thin alias that loads this skill (kept for muscle memory).
