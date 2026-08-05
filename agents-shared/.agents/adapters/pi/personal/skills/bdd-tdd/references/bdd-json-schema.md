# `.pi/bdd.json` schema

Place at the project root (preferred: `.pi/bdd.json`). Also accepted: `bdd.json`, `.bdd-tdd.json`.

Prefer `/bdd profile` then `/bdd init`: initialization uses deterministic local stack detection and never installs tools.

```json
{
  "version": 1,
  "enabledByDefault": false,
  "projectLabel": "my-app",
  "strictGreenCoversRed": true,
  "featurePathPatterns": ["**/*.feature", "**/tests/features/**"],
  "testPathPatterns": ["**/*.test.ts", "**/tests/unit/**", "**/tests/integration/**"],
  "implementationPathPatterns": ["**/src/**", "**/app/**", "**/lib/**"],
  "docsPathPatterns": ["**/docs/**", "**/AGENTS.md", "**/*example*map*"],
  "configPathPatterns": ["**/.pi/bdd.json", "**/package.json", "**/Cargo.toml"],
  "alwaysAllowPathPatterns": ["**/generated/**"],
  "commands": {
    "unitTest": "bun test",
    "acceptanceTest": "bun run gherkin:test",
    "acceptanceGenerate": "bun run gherkin:generate",
    "format": "bun run format:check",
    "staticAnalysis": "bun run lint",
    "typecheck": "bun run typecheck",
    "propertyTest": "bun run test:property",
    "coverage": "bun run coverage",
    "mutation": "bun run mutation",
    "architecture": "bun run architecture",
    "doctor": "bun run doctor",
    "security": "bun run security",
    "performance": "bun run test:performance"
  },
  "assurance": {
    "enabled": true,
    "requiredGateKinds": ["unit", "types", "coverage"],
    "advisoryGateKinds": ["format", "static", "mutation", "architecture", "doctor", "security", "performance"],
    "commands": {
      "doctor": "bun run doctor:ci"
    },
    "coverageThreshold": 95,
    "mutationThreshold": 80,
    "doctorThreshold": 90,
    "defaultTimeoutMs": 120000,
    "gateTimeoutMs": {
      "mutation": 600000
    }
  }
}
```

## Assurance behavior

Gate kinds execute in deterministic order:

`format → static → types → unit → acceptance → property → coverage → mutation → architecture → doctor → security → performance`

- Explicit `assurance.commands` overrides win.
- `commands` and project scripts are next.
- Conservative local ecosystem defaults are last.
- Detection never runs `npm install`, `npx ...@latest`, or network discovery.
- A required gate with no local command is `unavailable` and blocks the run.
- Advisory unavailable/failing gates are visible but do not turn required green into failure.
- Commands must enforce their own numeric threshold and exit non-zero on violation; threshold fields are recorded targets, not permission to accept a weak command.
- Passing evidence is stale when it predates the latest green run or its plan fingerprint changes.

## Core fields

| Field | Meaning |
|---|---|
| `enabledByDefault` | Start in discovery when this file exists |
| `strictGreenCoversRed` | Require green command to cover the recorded red command; defaults true |
| `*PathPatterns` | Glob-ish patterns used by write gates |
| `commands.unitTest` | Default red/green runner |
| `commands.*` | Locally executable deterministic gate commands |
| `assurance.enabled` | Require a current passing hard-gate run at handoff |
| `assurance.requiredGateKinds` | Missing/failing gates block and fail closed |
| `assurance.advisoryGateKinds` | Visible signals that do not block required green |
| `alwaysAllowPathPatterns` | Explicit generated/config escape paths |

Unknown gate kinds and malformed command values are ignored rather than executed. Review the generated file before enabling default-on BDD.
