// CMP-01 — Herdr 0.8 compatibility matrix and observation checks.
// Acceptance: docs/plans/work-packages/CMP-01.feature
// Traces: docs/plans/work-packages/CMP-01-example-map.md R1–R7, E1–E4, E9, E12–E16
//
// Supported runtime is Herdr 0.8.x (protocol 19, schema version 1).
// Legacy 0.7.5 envelopes remain parser fixtures only — not runtime support.
// CMP-01 never installs integrations or upgrades packages (HOST-01 owns install).

/** Observed stack locked from the approved integration worktree (2026-08-10). */
export const HERDR_COMPAT_MATRIX = {
  herdrRuntime: "0.8.x",
  herdrTestedVersion: "0.8.0",
  protocol: 19,
  schemaVersion: 1,
  pi: "0.84.1",
  piSubagents: "0.45.2",
  contextMode: "1.0.169",
  rulesync: "16.9.1",
  /** Observed status only — CMP-01 does not install the Pi integration. */
  piIntegration: "absent",
} as const;

export type HerdrCompatObservation = {
  version?: string | null;
  protocol?: number | null;
  schemaVersion?: number | null;
};

export type HerdrCompatStatus = "compatible" | "incompatible" | "unknown";

export type HerdrCompatResult = {
  status: HerdrCompatStatus;
  message: string;
  observed: Record<string, unknown>;
  expected: {
    runtime: string;
    protocol: number;
    schemaVersion: number;
  };
};

const EXPECTED = {
  runtime: HERDR_COMPAT_MATRIX.herdrRuntime,
  protocol: HERDR_COMPAT_MATRIX.protocol,
  schemaVersion: HERDR_COMPAT_MATRIX.schemaVersion,
} as const;

function isPresentNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Accepted forms locked by E15: optional `v` + major.minor.patch (e.g. 0.8.0, v0.8.0). */
const HERDR_VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/i;

type ParsedHerdVersion =
  | { kind: "missing" }
  | { kind: "malformed"; raw: string }
  | { kind: "ok"; raw: string; major: number; minor: number; patch: number };

function parseHerdVersion(version: string | null | undefined): ParsedHerdVersion {
  if (version == null) return { kind: "missing" };
  const raw = String(version).trim();
  if (raw === "") return { kind: "missing" };
  const match = HERDR_VERSION_RE.exec(raw);
  if (!match) return { kind: "malformed", raw };
  return {
    kind: "ok",
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isSupportedRuntimeVersion(parsed: {
  major: number;
  minor: number;
}): boolean {
  // Supported runtime band is exactly 0.8.x (patch any).
  return parsed.major === 0 && parsed.minor === 8;
}

/**
 * Compare an observed Herdr runtime against the locked 0.8 compatibility matrix.
 * Missing protocol/schema/version → unknown (never silently compatible).
 * Non-0.8 runtime or protocol/schema drift → incompatible with actionable doctor guidance.
 */
export function checkHerdrCompatibility(
  obs: HerdrCompatObservation,
): HerdrCompatResult {
  const observed: Record<string, unknown> = {
    version: obs.version ?? null,
    protocol: obs.protocol ?? null,
    schemaVersion: obs.schemaVersion ?? null,
  };

  const protocolMissing = !isPresentNumber(obs.protocol);
  const schemaMissing = !isPresentNumber(obs.schemaVersion);

  if (protocolMissing || schemaMissing) {
    const missing = [
      protocolMissing ? "protocol" : null,
      schemaMissing ? "schema version" : null,
    ]
      .filter(Boolean)
      .join(" and ");
    return {
      status: "unknown",
      message:
        `Herdr compatibility unknown: missing ${missing}. ` +
        `Expected runtime ${EXPECTED.runtime} (tested ${HERDR_COMPAT_MATRIX.herdrTestedVersion}), ` +
        `protocol ${EXPECTED.protocol}, schema version ${EXPECTED.schemaVersion}. ` +
        `Run the compatibility doctor to inspect the installed Herdr interfaces.`,
      observed,
      expected: { ...EXPECTED },
    };
  }

  const parsedVersion = parseHerdVersion(obs.version);
  if (parsedVersion.kind === "missing" || parsedVersion.kind === "malformed") {
    const detail =
      parsedVersion.kind === "missing"
        ? "missing version"
        : `malformed version ${JSON.stringify(parsedVersion.raw)}`;
    return {
      status: "unknown",
      message:
        `Herdr compatibility unknown: ${detail}. ` +
        `Expected runtime ${EXPECTED.runtime} (tested ${HERDR_COMPAT_MATRIX.herdrTestedVersion}), ` +
        `protocol ${EXPECTED.protocol}, schema version ${EXPECTED.schemaVersion}. ` +
        `Run the compatibility doctor to inspect the installed Herdr interfaces.`,
      observed,
      expected: { ...EXPECTED },
    };
  }

  if (!isSupportedRuntimeVersion(parsedVersion)) {
    return {
      status: "incompatible",
      message:
        `Herdr incompatible with supported matrix ${EXPECTED.runtime} ` +
        `(protocol ${EXPECTED.protocol}, schema version ${EXPECTED.schemaVersion}): ` +
        `observed version ${parsedVersion.raw}, expected runtime ${EXPECTED.runtime}. ` +
        `Run the compatibility doctor before relying on herd commands.`,
      observed,
      expected: { ...EXPECTED },
    };
  }

  const protocolOk = obs.protocol === EXPECTED.protocol;
  const schemaOk = obs.schemaVersion === EXPECTED.schemaVersion;

  if (!protocolOk || !schemaOk) {
    const parts: string[] = [];
    if (!protocolOk) {
      parts.push(
        `observed protocol ${obs.protocol}, expected protocol ${EXPECTED.protocol}`,
      );
    }
    if (!schemaOk) {
      parts.push(
        `observed schema version ${obs.schemaVersion}, expected schema version ${EXPECTED.schemaVersion}`,
      );
    }
    return {
      status: "incompatible",
      message:
        `Herdr incompatible with supported matrix ${EXPECTED.runtime} ` +
        `(protocol ${EXPECTED.protocol}, schema version ${EXPECTED.schemaVersion}): ` +
        `${parts.join("; ")}. ` +
        `Run the compatibility doctor before relying on herd commands.`,
      observed,
      expected: { ...EXPECTED },
    };
  }

  return {
    status: "compatible",
    message:
      `Herdr compatible with tested matrix ${HERDR_COMPAT_MATRIX.herdrTestedVersion} ` +
      `(runtime ${EXPECTED.runtime}, protocol ${EXPECTED.protocol}, schema version ${EXPECTED.schemaVersion}).`,
    observed,
    expected: { ...EXPECTED },
  };
}

export type PiIntegrationStatus = {
  installed: boolean;
  message: string;
};

/**
 * Interpret `herdr integration status` text for the Pi hook.
 * Only the selected `pi:` line is authoritative — sibling integrations never
 * determine Pi state. Documents absence only; never installs (HOST-01).
 */
export function interpretPiIntegrationStatus(text: string): PiIntegrationStatus {
  // Match lines like "pi: not installed (...)" / "pi: current (v7) (...)" only.
  const piLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^pi\s*:/i.test(l));

  if (!piLine) {
    return {
      installed: false,
      message:
        "Pi integration status is unclear or missing; treating as absent. " +
        "CMP-01 does not install hooks or packages.",
    };
  }

  // Interpret ONLY the Pi line. Whole-text / sibling wording must not poison state.
  const line = piLine.toLowerCase();
  const absent =
    /\bnot installed\b/.test(line) ||
    /\babsent\b/.test(line) ||
    /\bmissing\b/.test(line);

  if (absent) {
    return {
      installed: false,
      message:
        "Pi integration is not installed (absent). " +
        "CMP-01 records this status only; HOST-01 owns idempotent install.",
    };
  }

  if (/\bcurrent\b/.test(line) || /(?<!not\s)\binstalled\b/.test(line)) {
    return {
      installed: true,
      message: "Pi integration appears installed according to herdr integration status.",
    };
  }

  return {
    installed: false,
    message:
      "Pi integration status is unclear or missing; treating as absent. " +
      "CMP-01 does not install hooks or packages.",
  };
}
