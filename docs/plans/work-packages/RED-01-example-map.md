# RED-01 Example Map — Single pre-persistence redaction authority

**Work package:** RED-01

**Dependency:** CON-01 field model merged in `923ff8483b13045335d60faad4b68915afee451b`

**Base:** `c10b68f42a1b7a10b0813d1aea79cd12f553b1ed`

**Owned implementation:** `agents-shared/.agents/adapters/pi/personal/lib/security/redact.ts` plus focused security fixtures/tests

**Locked focused command (after formulation):** `cd agents-shared/.agents/adapters/pi/personal && bun test lib/security/redact.test.ts`

## Outcome

Provide one pure, deterministic, fail-closed authority that converts an untrusted in-memory value into bounded, canonical, secret-safe JSON **before** a future trajectory or handoff sink may persist it. A sink may write only the success payload returned by RED-01. Refusal disables that persistence attempt; there is no unsafe fallback.

## Rules and examples

### R1 — Every persistence candidate crosses one fail-closed authority

The public API is `redactForPersistence(input: unknown)`. It returns either a success containing a detached, deeply frozen JSON value, canonical JSON bytes, and a redaction count, or a typed refusal containing only a stable code. It performs no file, environment, network, clock, or process access.

- **R1-E1:** A safe nested event returns `{ ok: true }`; its canonical JSON can be written without consulting the original object.
- **R1-E2:** A refused event returns no partial value, bytes, offending key, offending value, preview, or exception text copied from the input.
- **R1-E3:** A consumer that receives refusal must skip/disable persistence; RED-01 exposes no `unsafe`, `force`, detector-disable, or raw-fallback option.
- **R1-E4:** Mutating the original object after success cannot change the detached safe value or canonical bytes.

### R2 — Sensitive field semantics redact values without destroying safe contract structure

Field classification is case-insensitive and separator/camel-case aware, but semantic: it recognizes terminal credential concepts and known pairs rather than arbitrary substring matches. Sensitive containers apply a child policy.

- **R2-E1:** Values under `password`, `passphrase`, `apiKey`, `clientSecret`, `accessToken`, `refresh_token`, `privateKey`, `authorization`, `proxy-authorization`, `cookie`, and `setCookie` become fixed markers.
- **R2-E2:** Every leaf value under an `env` or `environment` object is redacted while non-secret environment variable names may remain for diagnosis.
- **R2-E3:** In a `headers` object, `authorization`, `proxy-authorization`, `cookie`, and `set-cookie` values are redacted; safe headers such as `content-type` remain.
- **R2-E4:** Safe fields such as `maxTokens`, `tokenBudget`, `secretScanPassed`, `secretPathPolicy`, `authMode`, and `passwordRuleMatched` remain because their terminal semantics are not credentials.
- **R2-E5:** If an object key itself contains a token/private-key fixture, RED-01 replaces that key deterministically and resolves marker collisions without emitting the original key bytes.

### R3 — Known secret values and credential-bearing text are removed wherever they occur

String inspection is independent of field names. It replaces a secret-bearing token or block with a fixed marker while preserving bounded safe context where possible; when safe segmentation is uncertain it redacts the whole string.

- **R3-E1:** Bearer/Basic authorization values and assignment forms such as `API_KEY=<synthetic>` or JSON-like `"password":"<synthetic>"` cannot survive in free text, command summaries, previews, or nested arrays.
- **R3-E2:** Recognized synthetic provider-token shapes (GitHub, GitLab, npm, Slack, AWS access keys, Google API keys, JWTs, and common `sk-` keys) are removed without tests containing live credentials.
- **R3-E3:** A PEM private-key block, including headers, body, and footer, is replaced as one secret marker.
- **R3-E4:** URI userinfo such as `scheme://user:<synthetic>@host` is redacted while a URL without userinfo remains readable.
- **R3-E5:** Credential paths such as `.ssh/id_*`, `.aws/credentials`, `.npmrc`, `.netrc`, `.env*`, kubeconfig, and service-account key files are redacted even inside otherwise free text.
- **R3-E6:** The same raw synthetic fixture repeated at multiple depths is removed at every occurrence and increments the redaction count deterministically.

### R4 — Unknown token-like values use conservative deterministic entropy detection

Unknown token candidates are contiguous, whitespace-free runs of at least 24 characters. RED-01 combines character-class evidence with Shannon entropy (at least 4.2 bits/character) and never relies on entropy alone for ordinary prose.

- **R4-E1:** A generated high-entropy alphanumeric/base64url token that has no known prefix is redacted.
- **R4-E2:** Ordinary prose, short identifiers, timestamps, costs, booleans, and bounded command summaries remain.
- **R4-E3:** UUIDs and Git SHAs remain only in recognized identifier fields such as `headSha`, `commitSha`, `sha`, or `taskId`; an equivalent token in an untyped preview is still inspected conservatively.
- **R4-E4:** A 64-hex digest remains only in recognized `sha256`, `digest`, or hash-reference fields; RED-01 never creates or persists a raw-secret hash.
- **R4-E5:** A long safe repository-relative path in a recognized path field is evaluated by the path rule before generic entropy detection, preventing random-looking artifact names from being destroyed.

### R5 — Encoded previews receive bounded decode-and-inspect handling

RED-01 checks percent encoding, standard base64, and unpadded base64url candidates without storing decoded material. Decoding is bounded to two percent passes and one base64/base64url pass; malformed candidates are handled as ordinary strings.

- **R5-E1:** A percent-encoded authorization assignment is replaced before canonical bytes are returned.
- **R5-E2:** Standard base64 and base64url encodings of a synthetic API-key assignment are replaced as whole encoded candidates.
- **R5-E3:** Safe encoded prose remains unchanged when bounded decoding reveals no secret and the encoded token is not independently high entropy under R4.
- **R5-E4:** Nested compression, encryption, arbitrary codecs, data fetching, and unbounded recursive decoding are outside RED-01; suspicious or over-limit encoded candidates are redacted/refused rather than deeply decoded.

### R6 — Recursive traversal is detached, canonical, and hostile-input safe

Only JSON primitives, arrays, ordinary own-enumerable data properties, and null-prototype records are accepted. Object keys are sorted for canonical bytes; array order is preserved. RED-01 does not invoke accessors or `toJSON`.

- **R6-E1:** Secrets in nested objects and arrays are removed without mutating the caller input.
- **R6-E2:** Circular references return a typed `cycle` refusal with no input-derived message.
- **R6-E3:** Enumerable getters/setters return an `accessor` refusal and are never invoked.
- **R6-E4:** Functions, symbols, bigint, non-finite numbers, Date, Map, Set, RegExp, Error, class instances, and hostile prototypes return stable typed refusals.
- **R6-E5:** `__proto__`, `prototype`, and `constructor` data keys are refused so output construction cannot create prototype pollution.
- **R6-E6:** Proxy/own-key/descriptor failures are caught and converted into a non-echoing `hostile-object` refusal.

### R7 — CON-01-aligned bounds and binary refusal prevent resource abuse

RED-01 aligns with the existing field model: 65,536 serialized bytes, nesting depth 16, string length 4,096, array length 256, and own keys per object 256. Input and output accounting uses UTF-8 bytes where applicable.

- **R7-E1:** A string, array, object, depth, total-input, or canonical-output limit breach refuses the entire payload with a stable bound-specific code.
- **R7-E2:** `Buffer`, `ArrayBuffer`, `SharedArrayBuffer`, `DataView`, and typed-array values return `binary` refusal; no lossy preview is produced.
- **R7-E3:** A boundary-equal payload succeeds while boundary-plus-one refuses, using deterministic fixtures rather than timing/memory assertions.
- **R7-E4:** Refusal happens before a sink receives bytes and never truncates a secret-bearing value into an apparently safe preview.
- **R7-E5:** Bounds apply to keys as well as values, preventing a secret-bearing oversized key from appearing in an error or output.

### R8 — Path and hash references are preserved only when structurally safe

RED-01 reuses CON-01 concrete path policy for recognized path fields. It accepts only safe repository-relative, glob-free, non-credential paths. It validates caller-supplied identifiers but does not read files or compute hashes from potentially secret content.

- **R8-E1:** `docs/report.json` and `artifacts/run-1/result.json` remain in `path`, `artifactPath`, or `evidenceRef` fields.
- **R8-E2:** Absolute, home-relative, traversal, NUL-bearing, glob, and credential-leaf paths become a path marker rather than raw bytes.
- **R8-E3:** A caller-supplied lowercase 64-hex `sha256` reference and recognized Git SHA remain unchanged.
- **R8-E4:** A malformed digest is treated as an ordinary string and can be redacted by value rules; it is never relabeled as trusted evidence.
- **R8-E5:** RED-01 never hashes a detected credential, because deterministic hashes can disclose low-entropy secrets through offline guessing.

### R9 — The no-raw-secret invariant covers every returned and persisted byte

Focused tests use unique synthetic fixtures and derive their percent/base64/base64url encodings at runtime. They inspect both the returned safe value and exact canonical JSON.

- **R9-E1:** None of the raw fixture, private-key body, credential path, encoded fixture, or secret-bearing object key appears in canonical output bytes.
- **R9-E2:** Refusal objects and thrown/caught hostile-object paths contain only stable codes and counts, never raw values or raw keys.
- **R9-E3:** Canonical output is byte-identical across equivalent objects with different insertion order.
- **R9-E4:** The safe value is deeply frozen, contains only null/boolean/finite-number/string/array/plain-record values, and contains no reference to the input graph.
- **R9-E5:** A mutation that disables sensitive-key, inline-token, private-key, entropy, credential-path, or encoded-preview handling makes the focused suite fail on the corresponding fixture.

### R10 — RED-01 owns the library; future sinks must integrate it explicitly

This package creates the authority and proves its contract. OBS-01 and future handoff/trajectory sinks may persist only RED-01 success bytes. Existing SEC-00 blocked-attempt audit behavior is not widened in this package.

- **R10-E1:** `redact.ts` imports only pure standard/runtime helpers and CON-01 limits/path policy; it contains no append/write sink.
- **R10-E2:** The focused suite is causal-red before `redact.ts` exists and covers success, refusal, bounds, hostile objects, encoded previews, references, determinism, and byte absence.
- **R10-E3:** Full root regression remains green, including SEC-00 child-policy tests and CON-01 contracts.
- **R10-E4:** Rollback is to leave persistence disabled; no consumer may bypass RED-01 merely to retain logging.

## Questions and locked answers

1. **Q1 — Should RED-01 throw or return partial sanitized data on unsupported/oversized input?**

   **Locked:** neither. Return a typed, non-echoing whole-payload refusal and expose no bytes/value.
2. **Q2 — May callers weaken detectors or raise limits?**

   **Locked:** no. V1 has no unsafe/force/disable options. A later caller may choose stricter limits only through a separately reviewed contract.
3. **Q3 — Which encoded forms are required?**

   **Locked:** percent encoding (maximum two passes), standard base64, and unpadded base64url (one pass). No decompression, encryption, network lookup, or arbitrary codec recursion.
4. **Q4 — Can RED-01 hash a raw secret for correlation?**

   **Locked:** no. It preserves validated caller-supplied hash references only; it never computes a deterministic secret hash.
5. **Q5 — How are false positives bounded?**

   **Locked:** semantic field segmentation, token-like contiguous candidates, length/class/entropy conjunction, recognized identifier/hash contexts, and safe-path-first handling. Ordinary prose fixtures must remain.
6. **Q6 — Are absolute host/worktree paths safe evidence references?**

   **Locked:** no. Persist concrete repository-relative references; redact absolute/home/traversal/glob/credential paths.
7. **Q7 — Does RED-01 rewrite the SEC-00 child-policy audit sink?**

   **Locked:** no. RED-01 owns the new mandatory authority for upcoming trajectory/handoff sinks; SEC-00 behavior stays regression-locked. A later explicitly scoped security package may consolidate that sink.
8. **Q8 — What happens to binary values?**

   **Locked:** typed `binary` refusal. RED-01 never creates a text preview of binary bytes.
9. **Q9 — May a getter or `toJSON` help convert a value?**

   **Locked:** no. Accessors and non-plain instances are refused without invoking user code.
10. **Q10 — Which limits govern V1?**

    **Locked:** reuse `CONTRACT_LIMITS_V1` for serialized bytes, depth, strings, arrays, and object keys; security-specific decode/candidate work is additionally bounded.
11. **Q11 — What is the mutation target?**

    **Locked:** prefer disabling encoded-preview inspection because it proves the less-obvious pre-persistence path; sensitive-key mutation is the fallback.
12. **Q12 — Is live persistence acceptance part of RED-01?**

    **Locked:** no sink is enabled in this package. Acceptance is deterministic in-memory candidate → redacted canonical bytes/refusal. OBS-01 owns live file persistence after RED-01 is merged.

## Scope guard

- No trajectory logger, handoff writer, approval store, Herdr polling, or file-retention implementation.
- No integration into live/stowed Pi until a later sink package imports the merged authority.
- No real credential fixtures, no secret hashes, and no network-dependent tests.
- No production edit before the locked focused command records a causal red.
