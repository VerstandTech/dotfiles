import { describe, expect, test } from "bun:test";

import { prepareSecurityToolResultV1 } from "./trust-policy";

const SAFE_CONTENT = [{ type: "text", text: "tests: 12 passed, 0 failed" }];
const SYNTHETIC_SECRET = "secux_test_token_7Kp9vQ2mNx4rTb8cLd6fHg3jWs5yZa1u";

describe("SEC-UX-01 precise security tool results", () => {
  test("SECUX01_ABSENT_DETAILS_FALSE_REFUSAL: undefined optional details do not hide safe content", () => {
    const result = prepareSecurityToolResultV1({
      isError: false,
      toolName: "bdd_status",
      result: { content: SAFE_CONTENT, details: undefined },
    });

    expect(result).toMatchObject({
      ok: true,
      isError: false,
      toolName: "bdd_status",
      value: { content: SAFE_CONTENT },
    });
    expect(JSON.stringify(result)).not.toContain("redaction-refused");
  });

  test("SECUX01_DETAILS_ISOLATION: hostile details do not hide safe primary diagnostics", () => {
    const details: Record<string, unknown> = { summary: "auxiliary" };
    details.self = details;

    const result = prepareSecurityToolResultV1({
      isError: false,
      toolName: "bash",
      result: { content: SAFE_CONTENT, details },
    });

    expect(result).toMatchObject({
      ok: true,
      isError: false,
      value: {
        content: SAFE_CONTENT,
        details: {
          securityPolicy: { ok: false, code: "details-redaction-refused" },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("auxiliary");
  });

  test("SECUX01_CONTENT_FAIL_CLOSED: hostile primary content never falls back to raw bytes", () => {
    const content: Record<string, unknown> = { value: SYNTHETIC_SECRET };
    content.self = content;

    const result = prepareSecurityToolResultV1({
      isError: false,
      toolName: "read",
      result: { content, details: { count: 1 } },
    });

    expect(result).toEqual({ ok: false, code: "content-redaction-refused" });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
  });

  test("SECUX01_SECRET_REGRESSION: present channels still use RED-01", () => {
    const result = prepareSecurityToolResultV1({
      isError: true,
      toolName: "future-safe-tool",
      result: {
        content: [{ type: "text", text: `Authorization: Bearer ${SYNTHETIC_SECRET}` }],
      },
    });

    expect(result).toMatchObject({ ok: true, isError: true, toolName: "future-safe-tool" });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
  });

  test("SECUX01_FROZEN: composed success and fallback metadata are deeply frozen", () => {
    const details: Record<string, unknown> = {};
    details.self = details;
    const result = prepareSecurityToolResultV1({
      isError: false,
      toolName: "ctx_execute",
      result: { content: SAFE_CONTENT, details },
    }) as Record<string, unknown>;

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    const value = result.value as Record<string, unknown>;
    expect(Object.isFrozen(value.details)).toBe(true);
  });

  test("SECUX01_DETAILS_SHAPES: binary, oversized, and proxy details preserve safe content", () => {
    const hostileDetails = [
      new Uint8Array([1, 2, 3]),
      "x".repeat(70_000),
      new Proxy({}, { ownKeys() { throw new Error("provider detail"); } }),
    ];
    for (const details of hostileDetails) {
      const result = prepareSecurityToolResultV1({
        isError: true,
        toolName: "bash",
        result: { content: SAFE_CONTENT, details },
      });
      expect(result).toMatchObject({
        ok: true,
        isError: true,
        value: {
          content: SAFE_CONTENT,
          details: { securityPolicy: { ok: false, code: "details-redaction-refused" } },
        },
      });
      expect(JSON.stringify(result)).not.toContain("provider detail");
    }
  });

  test("SECUX01_EMPTY_CHANNELS: no optional channels produces deterministic empty value", () => {
    expect(prepareSecurityToolResultV1({
      isError: false,
      toolName: "read",
      result: {},
    })).toEqual({
      ok: true,
      isError: false,
      toolName: "read",
      value: {},
      detailsRefused: false,
    });
  });

  test("SECUX01_MIXED_ENVELOPE: channel and legacy keys cannot be combined", () => {
    expect(prepareSecurityToolResultV1({
      isError: false,
      toolName: "read",
      result: { content: SAFE_CONTENT, output: "ambiguous" },
    })).toEqual({ ok: false, code: "redaction-refused" });
  });

  test("SECUX01_BOTH_CHANNELS_UNSAFE: unsafe primary content keeps whole result non-passing", () => {
    const content: Record<string, unknown> = {};
    content.self = content;
    const details: Record<string, unknown> = {};
    details.self = details;
    expect(prepareSecurityToolResultV1({
      isError: false,
      toolName: "read",
      result: { content, details },
    })).toEqual({ ok: false, code: "content-redaction-refused" });
  });
});
