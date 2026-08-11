# SEC-01 security policy V1

SEC-01 publishes deterministic trust-profile and security preflight contracts. It does not claim that a prompt, project file, or typed object is an operating-system sandbox.

## Profiles

- `interactive` preserves human-driven compatibility and is always reported as `interactive-untrusted` when no active sandbox capability exists. It cannot satisfy strict, overnight, or required security evidence.
- `strict` requires a current process-local sandbox capability for command/process actions and applies environment, secret-read, write-authority, command, and egress policy.
- `overnight` includes every strict requirement and also requires current successful `secret`, `sast`, `sca`, and `license` slot evidence.

A project may request a stricter mode but cannot weaken machine/session authority or enable overnight by itself. There is no `force`, `unsafe`, `allowAll`, or raw-result fallback.

## Backend boundary

The preferred V1 capability shape follows `@anthropic-ai/sandbox-runtime`. A Gondolin host adapter may satisfy the same capability only after proving equivalent process-tree, filesystem, network, workspace-mount, and lifecycle controls.

SEC-01 does not install or pin either package. CMP-01 and PKG-01 retain dependency inventory and packaging authority. Missing support, unsupported platforms, incomplete features, and initialization failure are non-passing. In particular, `sandbox-initialization-failed` blocks strict and overnight execution instead of notifying and continuing.

A capability is process-local and bound to its policy/worktree/session observation. Copying, serializing, reconstructing, disposing, or reloading it removes authority.

## Filesystem and environment

Pure policy code receives explicit host observations; it does not read files, environment, clocks, processes, sockets, or network state.

Strict/overnight reads deny repository environment files, credential leaves, private keys, home secret roots, symlink aliases, and multi-link regular files before content access. Writes require current resolved facts inside one canonical worktree or an exact task-specific session-temp root. The whole global temporary directory is never writable authority.

Strict/overnight launch environments use a fixed minimal name allowlist. Removed values do not enter decisions, refusal messages, fingerprints, or audit metadata.

## Commands and egress

Required actions use exact bounded argv. Shell command strings, inline interpreters, nested command launchers, raw downloader execution, project-owned gates, and unknown wrappers are denied in strict/overnight mode.

Network policy is deny-by-default. Fleet researchers and web tools may use only canonical provider operations with trusted exact-domain/port policy. Redirect targets require re-evaluation. Hostname classification alone is not DNS or socket containment; the backend must prove those features.

## Tool results and gates

All security telemetry passes through RED-01 before a model-visible or later persistent boundary. Redaction refusal replaces the entire result with stable code `redaction-refused`; there is no raw fallback, preview, partial value, or hash oracle.

Security slots reuse the existing canonical `security` gate kind:

1. `secret`
2. `sast`
3. `sca`
4. `license`

Missing tools remain `unknown`; SEC-01 never installs a replacement. Shell/project executors remain untrusted. FIT-01 later owns canonical quality-gate integration.

## G7 and rollout

G7 remains unavailable until all of the following describe the same current candidate:

- deterministic cross-runtime secret, mutation, gate, and egress fixtures pass;
- the implementation is merged, stowed, and reloaded by Pi;
- an active compatible sandbox capability is observed;
- required security slots are current and successful;
- separately approved non-destructive operator acceptance passes.

Until then, product-code fleets and unattended/overnight execution remain blocked. Disabling strict may restore explicit interactive use, but it never creates strict evidence or overnight availability.

## Stable recovery

Blocked output is bounded, plain text, and non-echoing. Recovery is one of: initialize a supported sandbox, refresh trusted host facts, choose explicit interactive mode when human-driven work is acceptable, or ask the responsible human. Bypass is not presented as recovery.
