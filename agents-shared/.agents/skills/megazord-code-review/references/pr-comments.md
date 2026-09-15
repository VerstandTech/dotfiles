# PR inline comments

Post only after findings are independently verified. One GitHub review, several inline notes. Chat can keep P0–P3; GitHub comments should not.

## When

- Target is a live pull request and posting is not explicitly declined.
- Comment only on lines that exist in the current head diff (`RIGHT` side, current head SHA).
- One comment per root cause. Prefer P0–P2. Skip P3 unless the fix is obvious and cheap.
- Do not restate an open thread that already covers the same line and claim.
- Use `event: COMMENT`. Do not `REQUEST_CHANGES` or approve unless the user asked.

## Voice

Write as a teammate talking to the author. Short, specific, readable.

Each comment is 2–4 short paragraphs:

1. What is wrong, in plain language, at this line.
2. What happens for a user, admin, or API caller.
3. What to change.

Do not use severity tags, lens names, “Megazord”, file:line (GitHub already pins it), or evidence dumps. No “we should consider” or “nit:”. No stacked bullets of every related file.

## Shape

```text
<What this line does that is wrong.>

<Concrete consequence.>

<The fix, in one or two sentences.>
```

## Good

> This is a public endpoint (`createApiProcedure`). Anyone can send `x-session-id` / `x-forwarded-for` / `x-device-name` and create a Device plus `device_linked` / IP-change / `sign_in` rows on the default account’s team.
>
> Don’t treat client headers as session truth. Bind devices to a server-issued session, and only audit after a real principal is resolved.

> This is a copy of `sharingLinksEnabled`. The setting in the UI is “Who can access links by default”, not “whether members can share links outside the team”.
>
> The Activity column uses the catalog label for `eventType`, so admins will read the wrong change. Give `defaultLinkAccess` its own event type and summary.

## Bad

> **P1 — Unauthenticated team audit + device writes.** Triggering path: `POST /2/auth/token/from_oauth1` via `createApiProcedure`. Impact: audit integrity. Evidence: `auth.ts:62-141`. Correction direction: …

> Nit: this might be worth extracting for cleanliness.

## Review body

2–4 sentences: what you looked at, the main themes, and that details are inline. Mention merge conflicts or SHA only if they change how the author should read the notes.

## How to post

Verify each path+line is in `git diff <base>...<head>`. Then one review:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews --input payload.json
```

Payload: `commit_id` = current head SHA, `event` = `COMMENT`, `body` = short summary, `comments[]` = `{path, line, side: "RIGHT", body}`.

If a line is not part of the diff, move the comment to the nearest added or changed line that still carries the root cause. If none exists, keep the finding in chat only.

After posting, give the review URL and a one-line list of where comments landed.
