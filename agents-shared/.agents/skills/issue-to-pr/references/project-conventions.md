# Project Conventions (lookmybio.com / repo: olhaminha.bio)

Exact commands, URLs, and gotchas. Verify a command still exists (`package.json` scripts) if one errors — this file mirrors the repo but the repo wins.

## Runtime & commands

Runtime is **Bun** (not npm/yarn).

| Purpose | Command |
|---|---|
| Gherkin generate (committed artifacts) | `bun run gherkin:generate` |
| Unit + all suites | `bun test <path>` |
| Integration only | `bun run test:integration` (preloads Mongo harness) |
| E2E / Playwright | `bun run test:playwright` (or `:headed`, `:ui`, `:debug`) |
| Typecheck | `bun run typecheck` (`tsc --build`) |
| Lint | `bun run lint` (biome) |

Integration tests need Mongo — some are gated behind `RUN_MONGO_TESTS`; standalone Mongo has no transactions. If a repo test silently passes without connecting, check the harness is actually initializing the DB.

## Issue sources

- **System of record: GitHub Issues** via `gh`.
  - View: `gh issue view <n> --comments`
  - Claim: `gh issue edit <n> --add-assignee @me` (optional `in-progress` label)
  - Close: PR body `Closes #<n>` (or `gh issue close` with reason)
- Legacy beads ids (`olhaminha.bio-*`) may still appear in old text — resolve to the linked GitHub issue; do not use `bd` as the tracker for new work.
- Labels often used: `bug`, `feature`, `frontend`, `backend`, `socials`, `ai`, `testing`, `story`, `Social & Content`.

## Git / worktree / branch / PR

- **All work branches off `develop`; PRs target `develop`.** `main` only receives merges from `develop` via staging. Never commit directly to `develop`/`main`.
- **Always use a git worktree per issue** (issue-to-pr Step 0). If already in a linked worktree (`git rev-parse --git-dir` ≠ `--git-common-dir`, and not a submodule), skip creating another and continue.
- Worktree path: `.worktrees/<type>/<issue-number>-<kebab-slug>` under the main repo (directory must be gitignored — prefer existing `.worktrees/` ignore).
- **Branch name must include the GitHub issue number:**

  ```text
  <feat|fix|hotfix|chore>/<issue-number>-<kebab-slug>
  ```

  Example: `feat/2444-single-scrollport-layout` for issue #2444.  
  Do not use `#` in the branch name. Complete the GitHub link with `Closes #2444` in the PR body and `#2444` in commit subjects.

- Create:

  ```bash
  git fetch origin develop
  git worktree add -b "feat/2444-single-scrollport-layout" \
    ".worktrees/feat/2444-single-scrollport-layout" origin/develop
  cd ".worktrees/feat/2444-single-scrollport-layout"
  ```

- Reuse: if `git worktree list` or `git branch --list '*/2444-*'` already has this issue, `cd` there instead of creating a duplicate.
- **Never `git add -A`** — it sweeps the user's uncommitted WIP into your commit. Stage named files.
- After push, **verify it landed**: `git ls-remote origin <branch>` — a backgrounded push with a verbose pre-push hook can exit 0 without pushing.
- **Never write local filesystem paths** (`/Users/...`) into commits, PR bodies, or generated files. Use repo-relative paths.
- PR: `gh pr create --base develop --head <branch>` (confirm base with the user first); body must include `Closes #<n>`.

## Personas & product truth (Gherkin)

- Audience segments: `marketing/reference/audiences.md` (B solopreneur + E Brazil MEI are defaults).
- Method for confusion-driven scenarios: skill `references/persona-gherkin.md`.
- Never assert unshipped capabilities: `marketing/reference/product-truth.md`.

## Local environment (browser / E2E)

- **Base URL is `megazord.olhaminha.bio`** (a tunnel) — **never `localhost:3000`**. If the tunnel is down, wait and retry.
- Test credentials (skip Google OAuth): `test@e2e.example.com` / `test-password-dev-123`. Password is in `apps/web/.env.local` as `TEST_USER_PASSWORD` (skill defaults may be stale — prefer env).
- **Do not kill/restart the user's dev server** — they run it behind the tunnel. If a restart is needed, ask them.
- Turbopack can serve stale SSR after editing client components; the fix (kill server + `rm -rf apps/web/.next` + restart) is the **user's** to run — ask.
- **Tunnel failure (HTTP 530 / cloudflared Unauthorized):** do not invent a tunnel token. Ask the user to restore `cloudflared tunnel run`. Temporary visual fallback: localhost + `NEXTAUTH_URL=http://localhost:3000` only if megazord is dead and the user agrees; call that out in the handoff.
- **Auth API sign-in** (when UI login is flaky): `GET /api/auth/csrf` then `POST /api/auth/callback/test-credentials` with form body; inject `authjs.session-token` cookie into the browser session.

## Testing rules (CLAUDE.md gates)

- **Order:** persona Gherkin → red tests (all applicable layers) → implement → green.
- Behavior change ⇒ **failing test first**, confirmed failing for the right reason (assertion, not import/setup error), before implementing.
- User-visible behavior ⇒ Gherkin acceptance in `tests/features/**` unless there's a stated N/A reason. New/changed features need a **mutation/sensitivity check** (prove the scenario fails against missing/wrong behavior).
- **Test matrix (write reds for each that applies):**

  | Layer | Command sketch |
  |-------|----------------|
  | Unit | `bun test <path>` |
  | Integration | `bun run test:integration` / `RUN_MONGO_TESTS=1 bun test <path>` |
  | Acceptance | `bun run gherkin:generate` then `bun run gherkin:test` (or tag filter) |
  | Regression | Re-run adjacent suites + `tests/unit/app/dashboard/_architectural/` when dashboard UI |
  | E2E | `bun run test:playwright` (base URL **megazord**, not localhost) |

- Keep **CRAP risk** low: every new branch, error path, permission check, validator boundary, queue/retry state needs a direct test — or simplify the code.
- `tests/features/_generated/**` **is committed** (regression/PR-review artifact), not gitignored.
- **`bun run gherkin:generate` rewrites imports across a scope** (e.g. all `bio-page` generated tests pick up every steps file). Treat that as blast radius: pre-push may re-run unrelated acceptance suites. After generate, if pre-push fails on an untouched feature, fix the stale expectation or re-run only the failing file before claiming “unrelated flake.”

## Acceptance harnesses (use-case steps)

When steps construct use cases with `new SomeUseCase(...)` (not DI):

1. **Open the real constructor** after every rebase/merge onto `develop`. Arity and arg order change (e.g. new repo dependency) will green-pass on macOS until CI, or fail with `is not a function`.
2. Match production collaborator wiring: same repos, same side-effect scheduler overrides, same date-window policy documented in the feature header.
3. Prefer asserting **observable DTOs** (primaryKind, hero totalClicks) over reimplementing rollup math in the harness store unless you must simulate the repo interface.

## Dashboard UI tokens (hard fail in unit suite)

Architectural guards under `tests/unit/app/dashboard/_architectural/**` fail CI if you introduce:

- `rounded-lg` / bare `rounded` / `rounded-xs|3xl` → use `rounded-md` / `rounded-xl` / approved `2xl` shells only
- `duration-200|250|700|1000` → use `duration-150|300|500` only
- bare `focus:` → `focus-visible:`
- `transition-all` → explicit `transition-colors|transform|opacity|shadow`

Run the architectural suite after any dashboard TSX edit:

```bash
bun test tests/unit/app/dashboard/_architectural/
```

## Cross-platform test gotchas (Bun: Linux CI vs macOS)

- `mock.module` with `@/` aliases **fails silently on Linux Bun** — mock never applies. Mock package names, or mock in `test-setup.ts` preload.
- `globalThis` and module-level vars are **not shared across modules** on Linux Bun.
- **Free identifiers `localStorage` / `sessionStorage` do not bind to preload globals on Linux Bun** even when `globalThis.localStorage` is set in `test-setup.ts`. Always access via `globalThis.localStorage` / `globalThis.sessionStorage` (or a helper that reads `globalThis`), never bare identifiers. Classic symptom: **pass locally, CI `ReferenceError: sessionStorage is not defined`**.
- For mocking a browser API inside a React hook under `renderHook` on Linux Bun — use **E2E instead**, unit mocking won't hold.
- `bun install --frozen-lockfile` fails CI on lockfile drift unrelated to your change; if CI dies at install, run `bun install` and commit the `bun.lock` diff.

## Pre-push / delivery order

1. Rebase onto latest `origin/develop` **before** first push when the branch is behind.
2. Logically group commits (acceptance / implementation / review fixes).
3. Stage **named files only** — never commit `tmp/` visual screenshots unless the issue asks for fixtures.
4. Push → **`git ls-remote origin <branch>`** must match local `HEAD`.
5. Open PR only after push verify.

## Session-close protocol

Before declaring done: `git status` → stage named files → commit → push → verify push landed (`git ls-remote`). Comment progress on the GitHub issue if useful. Work isn't done until pushed.

## Architecture quick facts

- DDD layers: **Domain → Application → Infrastructure → UI**. Workers (`apps/workers/`) **cannot import from `apps/web/`** (compile-time + CI enforced). Use constructor `@inject` via DI tokens, never `container.resolve()`.
- Shared services live in `packages/services`; domain in `packages/domain` (`@olhaminha/domain`); shared DI tokens in `packages/di-tokens` (`@olhaminha/di-tokens`).
