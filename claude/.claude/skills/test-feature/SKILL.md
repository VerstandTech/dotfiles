---
name: test-feature
description: >
  Alias for local-visual-test. Use when the user says "test feature", "test the
  feature", "test it in the browser", "check it visually", or wants to manually
  verify recently implemented changes in the local dev environment. Immediately
  load and follow the global local-visual-test skill (merged visual QA +
  Turbopack/browser-cache ladder + dev-browser recipes). Slash: /test-feature.
---

# Test Feature (alias)

**This skill is a redirect.** All content lives in **`local-visual-test`**.

1. Open and follow `local-visual-test` end-to-end (preflight → Turbopack/cache
   ladder → auth → exercise → assert → report).
2. If the repo has a product overlay (`visual-app-verify`,
   `dev-browser-visual-testing`), run that **after** the global preflight.

Do not maintain a separate procedure here — edit `local-visual-test` only.
