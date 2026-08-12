# OPS-01 Example Map — Bounded notifications, recovery, and conservative cleanup

## Story
As a local operator supervising Pi agents through Herdr, I want bounded notifications and explicit recovery/cleanup plans so timeouts, partial launches, and stale resources remain visible without being mistaken for success or destroyed automatically.

## Personas
- Leo — local operator retaining approval, cleanup, PR, and merge authority.
- Maya — platform approver needing exact current evidence before destructive action.
- Nikhil — security reviewer requiring stable non-echoing failures and no ambient authority.
- Sofia — engineer recovering from a partial task launch without losing useful work.
- André — adapter maintainer preserving Herdr protocol and extension ownership boundaries.

## Rules and examples

### R1 — Notifications are bounded state transitions
- E1: idle to working emits one started notification.
- E2: working to idle emits one completed notification.
- E3: working to needs-attention emits one attention notification.
- E4: repeated identical snapshots emit nothing.
- E5: initial discovery snapshot emits no historical spam.
- E6: unknown state emits no success notification.

### R2 — Notification identity is exact
- E7: notification binds agent name, pane id, state-change sequence, and generation.
- E8: stale sequence is ignored.
- E9: same sequence with contradictory state is refused.
- E10: reused agent name on a new pane is a new identity.
- E11: reused pane with new generation is a new identity.
- E12: malformed identity is non-passing.

### R3 — Notification content is closed and non-echoing
- E13: content contains only stable icon, bounded agent label, and closed state.
- E14: terminal output is never included.
- E15: prompts, diffs, tool results, and provider messages are never included.
- E16: malformed agent label uses a stable replacement.
- E17: unknown errors use a stable code.
- E18: outputs are detached and deeply frozen.

### R4 — Rate limits prevent notification spam
- E19: one identity has a bounded transition window.
- E20: excess transitions produce one suppressed count.
- E21: suppression never becomes success.
- E22: a new generation resets only its own window.
- E23: no timer is required; explicit observations advance windows.
- E24: limits never auto-increase.

### R5 — Timeout is unknown, never success
- E25: bounded wait timeout returns unknown.
- E26: missing completion evidence returns unknown.
- E27: unavailable Herdr returns unavailable.
- E28: malformed Herdr envelope returns invalid.
- E29: later explicit observation may resolve unknown.
- E30: timeout never emits completed notification.

### R6 — Recovery planning is pure and explicit
- E31: partial create with pane only plans inspect-pane and cleanup-required.
- E32: worktree only plans inspect-worktree and cleanup-required.
- E33: agent started but registration unknown plans bounded status check.
- E34: all facts current plans resume.
- E35: contradictory facts plan manual intervention.
- E36: recovery planner executes nothing.

### R7 — Cleanup is conservative planner-only authority
- E37: clean merged worktree with exact identities may be cleanup-ready.
- E38: dirty worktree is blocked.
- E39: unmerged candidate is blocked.
- E40: missing merge evidence is unknown.
- E41: mismatched candidate SHA is blocked.
- E42: active writer lease is blocked.

### R8 — Cleanup cannot release adjacent authority
- E43: planner cannot remove a worktree.
- E44: planner cannot delete local or remote branches.
- E45: planner cannot close panes.
- E46: planner cannot clear leases.
- E47: planner cannot merge or create PRs.
- E48: only human-approved external executors may perform planned actions.

### R9 — Cleanup requires current scoped evidence
- E49: exact repository, worktree realpath, branch, candidate SHA, merge SHA, pane, and lease facts bind the plan.
- E50: changed worktree path invalidates readiness.
- E51: changed branch invalidates readiness.
- E52: changed candidate or merge SHA invalidates readiness.
- E53: changed pane identity invalidates readiness.
- E54: expired approval invalidates execution eligibility.

### R10 — Cleanup order is deterministic
- E55: stop/release agent authority precedes pane close.
- E56: pane close precedes worktree removal.
- E57: worktree removal precedes local branch deletion.
- E58: local deletion precedes conditional remote deletion.
- E59: board clearing occurs only for exact owned entry.
- E60: verification follows every externally executed step.

### R11 — Failures stop later cleanup steps
- E61: pane close failure blocks worktree removal.
- E62: worktree removal failure blocks branch deletion.
- E63: local branch mismatch blocks remote deletion.
- E64: board mismatch blocks board mutation.
- E65: verification uncertainty retains cleanup-required.
- E66: no silent retry occurs.

### R12 — Notifications integrate without a second poller
- E67: existing Herdr source remains observation owner.
- E68: OPS consumes explicit snapshots/transitions.
- E69: OPS introduces no additional interval.
- E70: reload does not duplicate subscriptions.
- E71: shutdown releases process-local notification state.
- E72: status rendering remains independent.

### R13 — Herdr protocol remains authoritative
- E73: only validated Herdr 0.8/protocol 19/schema 1 observations are accepted.
- E74: no pane id is predicted.
- E75: no terminal title is identity authority.
- E76: no shell parsing substitutes for JSON envelopes.
- E77: missing doctor-created client is unavailable.
- E78: provider/OS messages are not forwarded.

### R14 — Recovery procedures are human-readable and machine-checkable
- E79: each step has closed kind, target, prerequisite, and expected evidence.
- E80: rendered guidance derives only from the typed plan.
- E81: guidance distinguishes blocked, unknown, and ready.
- E82: unsafe plan has no runnable argv.
- E83: human refusal leaves state unchanged.
- E84: resumed recovery requires fresh facts.

### R15 — Existing launch behavior stops leaking raw errors
- E85: invalid name returns stable invalid-name code.
- E86: create failure returns stable create-failed code.
- E87: invalid create JSON returns missing-pane code.
- E88: agent start failure returns stable start-failed code.
- E89: no arbitrary exception string is embedded.
- E90: partial resource identity is retained safely for recovery.

### R16 — UI notification configuration remains conservative
- E91: Herdr delivery remains explicit.
- E92: sound remains disabled unless human configures it.
- E93: delay remains bounded.
- E94: project files cannot raise notification rate.
- E95: headless mode records closed events without desktop side effects.
- E96: unavailable UI is not an operation failure.

### R17 — Pure operator core has no ambient authority
- E97: no files, environment, network, clocks, processes, or sockets are read.
- E98: current facts and logical observation time are injected.
- E99: equal input yields equal canonical output.
- E100: hostile getters/proxies return stable refusals.
- E101: collections and strings are bounded.
- E102: outputs are deeply frozen.

### R18 — Acceptance is mutation-sensitive
- E103: timeout-to-success mutation fails.
- E104: dirty-worktree cleanup-ready mutation fails.
- E105: stale-sequence notification mutation fails.
- E106: raw-error forwarding mutation fails.
- E107: auto-execute cleanup mutation fails.
- E108: duplicate-poller mutation fails.

## Resolved questions
- Q1: Does OPS execute cleanup? No; it only plans and renders.
- Q2: Who owns actual cleanup? Existing human-controlled post-merge workflow under its lock driver.
- Q3: Does OPS add a poller? No; it consumes existing validated observations.
- Q4: Does timeout mean failure? It means unknown unless explicit failure evidence exists.
- Q5: Can unknown become success later? Only through a fresh explicit observation.
- Q6: Are initial states notified? No, preventing startup spam.
- Q7: Can terminal output enter notifications? No.
- Q8: Can project configuration raise limits? No.
- Q9: Can cleanup proceed with dirty files? No.
- Q10: Can stale resources auto-release? No.
- Q11: Is pane title identity? No.
- Q12: Are raw exception messages useful diagnostics? Not at this boundary; stable codes only.
- Q13: What owns Herdr compatibility? HDR-01; OPS consumes its validated API.
- Q14: What owns approval? APR-01; OPS cannot approve itself.
- Q15: What owns fitness? FIT-01; OPS cannot manufacture gate pass.
- Q16: What owns leases? ISO-01; OPS only checks typed facts.
- Q17: Can notifications claim completion after timeout? No.
- Q18: Are sound notifications enabled? No by default.
- Q19: Can headless operation fail because UI is absent? No; UI delivery is observational.
- Q20: Can cleanup skip failed steps? No.
- Q21: Can a local branch mismatch still delete remote? No.
- Q22: Is recovery state persisted by the pure core? No.
- Q23: What is causal red? `OPS01_OPERATOR_CONTROL_MISSING`.
- Q24: Required mutations? Timeout-to-success, dirty cleanup-ready, raw error forwarding, and duplicate notification.

## Out of scope
- Performing merges, PR creation, worktree removal, branch deletion, pane closure, or lease release.
- Replacing HDR-01, ISO-01, APR-01, FIT-01, OBS-01, or HOST-01 authority.
- Adding dependencies, network calls, filesystem state, background timers, or a second status poller.
