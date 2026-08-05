# Turbopack + browser HTTP cache (visual QA)

Lessons from real local sessions: “I changed the code but the browser still
shows the old UI” is almost never mysterious product logic on the first hit —
it is layered caching and partial hot reload.

## Stack of staleness

```
┌─────────────────────────────────────────────┐
│  Browser HTTP cache (JS/CSS/RSC payloads)   │  ← most common culprit
├─────────────────────────────────────────────┤
│  In-memory SPA / React tree (partial HMR)   │  ← mixed parent/child props
├─────────────────────────────────────────────┤
│  Turbopack emitted chunks under .next/dev   │  ← not rebuilt yet / cold
├─────────────────────────────────────────────┤
│  Source files on disk                       │  ← ground truth
└─────────────────────────────────────────────┘
```

Cloudflare tunnel (megazord) sits in front of localhost but **does not** act like
a long-lived CDN for `/_next` during local dev. Do not “restart the tunnel” as
step 1 for rename bugs.

## Hard reload is not soft reload

| Action | Cache | Module remount | Enough after rename? |
|--------|-------|----------------|----------------------|
| SPA navigate (Link / router) | often kept | partial | **No** |
| F5 / `location.reload()` with cache on | may reuse chunks | full page | **Often no** |
| Hard reload + **Network.setCacheDisabled** | forced re-fetch | full page | **Usually yes** |
| Off-route + back, cache still off | forced re-fetch | full remount | Yes if still mixed |
| `rm -rf .next` + server restart | n/a | clean graph | Last resort |

## Automation snippets

### Playwright / CDP (canonical)

```js
async function hardReloadNoCache(page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.reload({ waitUntil: 'commit', timeout: 60000 })
}
```

Leave cache disabled for the rest of the visual session when validating client edits.

### Cache-bust navigation (fallback)

```js
async function gotoBusted(page, href) {
  const u = new URL(href, page.url())
  u.searchParams.set('v', String(Date.now()))
  await page.goto(u.toString(), { waitUntil: 'commit', timeout: 60000 })
}
```

Note: query-bust helps HTML document requests; chunk URLs are content-hashed by
Next, so **CDP cache-disable is still stronger** when the *hash* is stale in
the document’s import graph.

### Prove the layer

```bash
# 1) Source
rg -n "dialog-upscale-button|onUpscale" apps/web/src packages/ui/src

# 2) Emitted chunks (Next 15+ Turbopack path)
rg -n "dialog-upscale-button|onUpscale" apps/web/.next/dev/static/chunks --glob '*.js' | head

# 3) Runtime (in browser)
# Walk fiber nodes for the element; inspect memoizedProps / memoizedState
```

Interpretation table lives in the main `SKILL.md` (Phase B).

## Partial HMR failure modes we have hit

- **Prop rename**: parent wired `onUpscale`, child still closed over `onAutoScale`.
- **i18n key rename**: source and messages updated; client still throws
  `MISSING_MESSAGE` until hard reload.
- **Dynamic import / dialog**: shell updated, lazy chunk still old until cache-off reload.
- **Token/class rename**: screenshot looks “almost right” but handlers/testids missing.

## Cold compile vs hang

- First navigation to a large route after restart: **20–60s** compile is normal.
- Use `waitUntil: 'commit'` + long timeout; wait for a known `data-testid`.
- `networkidle` on Next apps is flaky (HMR websockets, analytics) — avoid as pass criteria.

## When to wipe `.next` (ask user to restart)

Only if:

1. Cache-disabled hard reload failed twice, and
2. Source has the symbol, and
3. `rg` in `.next/dev/static/chunks` does **not**, after a save + wait, or fiber
   still shows the old tree after remount.

```bash
rm -rf apps/web/.next
# user: bun run dev
```

Never kill the user’s `next dev` process without explicit permission.

## What not to do

- Edit product code to “fix” a missing control before proving the client is live.
- Restart Docker for a rename bug.
- Restart cloudflared for a rename bug.
- Trust unit tests as visual proof of client bundle state.
