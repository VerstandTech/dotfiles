# Preflight commands & failure patterns (local visual)

Portable notes distilled from real visual sessions. Adapt container names and
origins to the current project.

## Preflight script (olhaminha.bio / lookmybio defaults)

```bash
# Containers
docker ps --filter name=lookmybio --format '{{.Names}}\t{{.Status}}'
# If missing:
#   open -a Docker && sleep until docker info works
#   docker start lookmybio-mongodb lookmybio-redis

docker exec lookmybio-redis redis-cli ping   # expect PONG

# Origins
curl -s -o /dev/null -w "local %{http_code} t=%{time_total}\n" -m 10 http://127.0.0.1:3000/
curl -s -o /dev/null -w "tunnel %{http_code} t=%{time_total}\n" -m 15 https://megazord.olhaminha.bio/

# Processes (do not kill user's next without asking)
pgrep -fl 'next dev|cloudflared|megazord' | head -20
```

### Env flags that only apply after restart

Changing these requires a **user-owned** dev-server restart:

- `DISABLE_IMAGE_GENERATION_MOCK` (real vs mock AI)
- `ENABLE_TEST_AUTH` / `TEST_MODE`
- `NEXT_PUBLIC_BASE_PATH` / `NEXTAUTH_URL`
- DI container wiring / new injected services

HMR will **not** rebuild the DI graph.

## Login path (olhaminha megazord + test auth)

1. `https://megazord.olhaminha.bio`
2. Prefer NextAuth `test-credentials` via CSRF + form POST using
   `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` from `apps/web/.env.local`
   (never invent or commit secrets).
3. Dismiss cookie consent if present.
4. Click `[data-testid="profile-card"]` before AI Studio.
5. Go to feature URL (e.g. `/dashboard/ai`).

## Stale client diagnosis

When source has new names but UI does not — full ladder in
`turbopack-and-browser-cache.md`. Short form:

```text
1. Network.setCacheDisabled + hard reload (or cache-bust + remount)
2. rg newSymbol apps/web/src/...
3. rg newSymbol apps/web/.next/dev/static/chunks --glob '*.js'
4. In browser: walk __reactFiber* for memoizedProps
5. Only then: ask user for rm -rf apps/web/.next + restart
```

Classic failure: parent receives `onUpscale`, child still renders `onAutoScale`
after rename — **partial HMR**. Fix: hard reload + cache disabled; full login
round-trip if needed.

## Async AI / webhook evidence

Do not stop at “spinner gone.”

- Server logs: submit succeeded, webhook received, `SAVED` / fail reason
- Mongo (example): task `status`, `prompt`, `result.url`
- Browser: gallery card R2 URL, natural dimensions, credits delta if billed

Stuck `COMPLETED` without gallery asset = incomplete pipeline, not “slow UI.”

## Assertion depth by feature class

| Class | UI | Extra |
|-------|----|--------|
| Labels / layout | Screenshot + text | Console not breaking render |
| Interactive control | Click/state `data-*` | Keyboard/a11y if required |
| Form save | Success toast + re-open | Network 200 or list update |
| Generation job | Terminal card/dialog | Log + DB status |
| Zoom/pan | eligible/zoomed attrs | Visible exit control if mode is sticky |

## Timeouts

- Prefer `waitUntil: 'commit'` over `networkidle` on heavy Next pages.
- After Docker recovery, first authenticated page can be slow; wait for a known
  `data-testid`, not wall-clock alone.
- Cold Turbopack compile of a large route can take 20–60s — retry, don’t restart.

## Session close

Before declaring visual done:

- Preflight was green at time of observation
- Cache-disabled hard reload used after client renames
- Evidence list written (what URL, what clicked, what passed)
- Remaining risk listed (mocked path, skipped mobile, etc.)
