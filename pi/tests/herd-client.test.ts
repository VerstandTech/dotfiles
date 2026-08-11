// Acceptance: docs/plans/work-packages/HDR-01.feature
// Traces: HDR-01 R1-R12 / E1-E82 / Q1-Q20
import { describe, expect, test } from "bun:test";

const CLIENT_MODULE = "../.pi/agent/personal/lib/herdr/client.ts";

type ExecutorReport = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
};

type ExecutorCall = {
  argv: readonly string[];
  timeoutMs: number;
  signal?: AbortSignal;
};

type Executor = (call: ExecutorCall) => Promise<unknown>;

type ClientApi = {
  HERDR_CLIENT_LIMITS_V1: {
    maxSchemaBytes: number;
    maxOutputBytes: number;
    maxArgvBytes: number;
    maxReadLines: number;
    maxTimeoutMs: number;
  };
  createHerdrClientV1: (input: unknown, executor: Executor, signal?: AbortSignal) => Promise<any>;
  buildHerdrOperationV1: (client: unknown, request: unknown) => any;
  executeHerdrOperationV1: (
    client: unknown,
    request: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<any>;
};

async function loadClientApi(): Promise<ClientApi> {
  try {
    const loaded = (await import(CLIENT_MODULE)) as Partial<ClientApi>;
    if (
      typeof loaded.createHerdrClientV1 !== "function" ||
      typeof loaded.buildHerdrOperationV1 !== "function" ||
      typeof loaded.executeHerdrOperationV1 !== "function"
    ) {
      throw new Error("HDR01_TYPED_HERDR_CLIENT_API_MISSING");
    }
    return loaded as ClientApi;
  } catch (error) {
    if (error instanceof Error && error.message === "HDR01_TYPED_HERDR_CLIENT_API_MISSING") {
      throw error;
    }
    throw new Error("HDR01_TYPED_HERDR_CLIENT_MODULE_MISSING");
  }
}

function report(
  stdout = "",
  options: Partial<ExecutorReport> = {},
): ExecutorReport {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
    timedOut: false,
    aborted: false,
    ...options,
  };
}

const versionReport = () => report("herdr 0.8.0\n");
const schemaReport = (protocol = 19, schemaVersion = 1) =>
  report(JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    protocol,
    schema_version: schemaVersion,
    schemas: {},
    title: "Herdr API protocol schema",
  }));

function queueExecutor(reports: unknown[]) {
  const calls: ExecutorCall[] = [];
  let index = 0;
  const execute: Executor = async (call) => {
    calls.push(call);
    if (index >= reports.length) throw new Error("unexpected executor call");
    const next = reports[index++];
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, execute };
}

async function compatibleClient(operationReports: unknown[] = []) {
  const api = await loadClientApi();
  const queued = queueExecutor([versionReport(), schemaReport(), ...operationReports]);
  const created = await api.createHerdrClientV1({ HERDR_ENV: "1" }, queued.execute);
  expect(created.kind).toBe("completed");
  expect(created.operation).toBe("doctor");
  expect(created.compatibility).toEqual({
    runtime: "0.8.x",
    observedVersion: "0.8.0",
    protocol: 19,
    schemaVersion: 1,
  });
  return { api, client: created.client, calls: queued.calls, execute: queued.execute };
}

function agentInfo(
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    agent: "pi",
    agent_status: status,
    cwd: "/repo",
    focused: false,
    name: "worker",
    pane_id: "w1:p1",
    revision: 7,
    state_change_seq: 9,
    tab_id: "w1:t1",
    terminal_id: "term_1",
    workspace_id: "w1",
    ...overrides,
  };
}

function envelope(id: string, result: unknown) {
  return JSON.stringify({ id, result });
}

describe("HDR-01 typed Herdr client", () => {
  test("creates a process-local client from compatible live observations", async () => {
    const api = await loadClientApi();
    const queued = queueExecutor([versionReport(), schemaReport()]);

    const result = await api.createHerdrClientV1({ HERDR_ENV: "1" }, queued.execute);

    expect(result.kind).toBe("completed");
    expect(result.operation).toBe("doctor");
    expect(result.compatibility).toEqual({
      runtime: "0.8.x",
      observedVersion: "0.8.0",
      protocol: 19,
      schemaVersion: 1,
    });
    expect(queued.calls.map((call) => call.argv)).toEqual([
      ["herdr", "--version"],
      ["herdr", "api", "schema", "--json"],
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.client)).toBe(true);
    expect("executor" in result.client).toBe(false);
  });

  test("denies absent or non-exact HERDR_ENV before invoking the executor", async () => {
    const api = await loadClientApi();
    for (const environment of [{}, { HERDR_ENV: "0" }, { HERDR_ENV: "true" }, { HERDR_ENV: " 1 " }]) {
      const queued = queueExecutor([]);
      const result = await api.createHerdrClientV1(environment, queued.execute);
      expect(result).toMatchObject({
        version: 1,
        kind: "unavailable",
        operation: "doctor",
        code: "outside-herdr",
      });
      expect(queued.calls).toHaveLength(0);
    }
  });

  test("refuses hostile environment reflection without invoking accessors", async () => {
    const api = await loadClientApi();
    let getterCalls = 0;
    const environment = {};
    Object.defineProperty(environment, "HERDR_ENV", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "1";
      },
    });
    const queued = queueExecutor([]);

    const result = await api.createHerdrClientV1(environment, queued.execute);

    expect(result).toMatchObject({ kind: "refused", code: "invalid-environment" });
    expect(getterCalls).toBe(0);
    expect(queued.calls).toHaveLength(0);
  });

  test("classifies runtime protocol and schema drift without a partial client", async () => {
    const api = await loadClientApi();
    const cases = [
      ["herdr 0.7.5\n", 19, 1, "incompatible-runtime"],
      ["herdr 0.9.0\n", 19, 1, "incompatible-runtime"],
      ["herdr 0.8.0\n", 18, 1, "incompatible-protocol"],
      ["herdr 0.8.0\n", 20, 1, "incompatible-protocol"],
      ["herdr 0.8.0\n", 19, 2, "incompatible-schema"],
    ] as const;
    for (const [version, protocol, schema, code] of cases) {
      const queued = queueExecutor([report(version), schemaReport(protocol, schema)]);
      const result = await api.createHerdrClientV1({ HERDR_ENV: "1" }, queued.execute);
      expect(result).toMatchObject({ kind: "unavailable", operation: "doctor", code });
      expect("client" in result).toBe(false);
    }
  });

  test("accepts supported 0.8 patch releases and rejects missing observations", async () => {
    const api = await loadClientApi();
    const supported = queueExecutor([report("herdr 0.8.9\n"), schemaReport()]);
    expect((await api.createHerdrClientV1({ HERDR_ENV: "1" }, supported.execute)).kind).toBe("completed");

    for (const reports of [
      [report("unexpected\n"), schemaReport()],
      [versionReport(), report(JSON.stringify({ protocol: null, schema_version: null }))],
      [versionReport(), report("not-json")],
    ]) {
      const queued = queueExecutor(reports);
      const result = await api.createHerdrClientV1({ HERDR_ENV: "1" }, queued.execute);
      expect(result).toMatchObject({ kind: "unavailable", code: "compatibility-unknown" });
      expect("client" in result).toBe(false);
    }
  });

  test("keeps doctor timeout abort executor failure and output bounds distinct", async () => {
    const api = await loadClientApi();
    const cases: Array<[unknown[], string, string?]> = [
      [[report("", { exitCode: null, timedOut: true })], "timeout"],
      [[versionReport(), report("", { exitCode: null, aborted: true })], "aborted"],
      [[new Error("hostile launch detail")], "unavailable", "executor-failed"],
      [[report("x".repeat(4_097))], "refused", "bounds"],
      [[versionReport(), report("x".repeat(512 * 1024 + 1))], "refused", "bounds"],
    ];
    for (const [reports, kind, code] of cases) {
      const queued = queueExecutor(reports);
      const result = await api.createHerdrClientV1({ HERDR_ENV: "1" }, queued.execute);
      expect(result.kind).toBe(kind);
      if (code) expect(result.code).toBe(code);
      expect("client" in result).toBe(false);
    }
  });

  test("publishes the locked bounds", async () => {
    const api = await loadClientApi();
    expect(api.HERDR_CLIENT_LIMITS_V1).toEqual({
      maxSchemaBytes: 512 * 1024,
      maxOutputBytes: 65_536,
      maxArgvBytes: 16_384,
      maxReadLines: 500,
      maxTimeoutMs: 300_000,
    });
    expect(Object.isFrozen(api.HERDR_CLIENT_LIMITS_V1)).toBe(true);
  });

  test("builds exact deterministic argv for all supported operations", async () => {
    const { api, client } = await compatibleClient();
    const cases: Array<[unknown, string[]]> = [
      [{ kind: "agent-list" }, ["herdr", "agent", "list"]],
      [{ kind: "agent-get", target: "w1:p1" }, ["herdr", "agent", "get", "w1:p1"]],
      [
        { kind: "agent-read", target: "w1:p1", source: "recent-unwrapped", lines: 120, format: "text" },
        ["herdr", "agent", "read", "w1:p1", "--source", "recent-unwrapped", "--lines", "120", "--format", "text"],
      ],
      [
        { kind: "agent-wait", target: "w1:p1", until: ["done", "blocked"], timeoutMs: 5_000 },
        ["herdr", "agent", "wait", "w1:p1", "--until", "blocked", "--until", "done", "--timeout", "5000"],
      ],
      [
        { kind: "worktree-create", cwd: "/repo", branch: "story-123", base: "main", path: "/repo-story-123", label: "story-123" },
        ["herdr", "worktree", "create", "--cwd", "/repo", "--branch", "story-123", "--base", "main", "--path", "/repo-story-123", "--label", "story-123", "--no-focus"],
      ],
      [
        { kind: "agent-start", name: "worker", paneId: "w1:p2", agentKind: "pi", timeoutMs: 30_000, nativeArgs: ["--model", "xai/grok-4.5:high"] },
        ["herdr", "agent", "start", "worker", "--kind", "pi", "--pane", "w1:p2", "--timeout", "30000", "--", "--model", "xai/grok-4.5:high"],
      ],
      [
        { kind: "agent-prompt", target: "worker", prompt: "Review; do not shell", wait: true, until: ["blocked"], timeoutMs: 10_000 },
        ["herdr", "agent", "prompt", "worker", "Review; do not shell", "--wait", "--until", "blocked", "--timeout", "10000"],
      ],
      [
        { kind: "notification-show", title: "Need input", body: "Review required", position: "top-right", sound: "request" },
        ["herdr", "notification", "show", "Need input", "--body", "Review required", "--position", "top-right", "--sound", "request"],
      ],
    ];

    for (const [request, expected] of cases) {
      const first = api.buildHerdrOperationV1(client, request);
      const second = api.buildHerdrOperationV1(client, structuredClone(request));
      expect(first.kind).toBe("completed");
      expect(first.value.argv).toEqual(expected);
      expect(second.value.argv).toEqual(expected);
      expect(Object.isFrozen(first.value.argv)).toBe(true);
      expect(first.value.argv.join("\0")).not.toContain("\0sh\0");
      expect(first.value.argv).not.toContain("--focus");
      expect(first.value.argv).not.toContain("--json");
    }
  });

  test("keeps shell metacharacters inert and native args after a literal separator", async () => {
    const { api, client } = await compatibleClient();
    const prompt = "review; echo $(touch /tmp/hdr01) | false";
    const prompted = api.buildHerdrOperationV1(client, {
      kind: "agent-prompt",
      target: "worker",
      prompt,
      wait: true,
      timeoutMs: 1_000,
    });
    expect(prompted.value.argv).toContain(prompt);
    expect(prompted.value.argv.filter((value: string) => value === prompt)).toHaveLength(1);

    const started = api.buildHerdrOperationV1(client, {
      kind: "agent-start",
      name: "worker",
      paneId: "w1:p2",
      agentKind: "pi",
      timeoutMs: 1_000,
      nativeArgs: ["--model", "model;still-data"],
    });
    const separator = started.value.argv.indexOf("--");
    expect(separator).toBeGreaterThan(0);
    expect(started.value.argv.slice(separator + 1)).toEqual(["--model", "model;still-data"]);
    expect(started.value.argv).not.toContain("sh");
    expect(started.value.argv).not.toContain("bash");
    expect(started.value.argv).not.toContain("-c");
  });

  test("refuses invalid names targets paths lines timeouts and aggregate bounds", async () => {
    const { api, client } = await compatibleClient();
    const cases: Array<[unknown, string]> = [
      [{ kind: "agent-start", name: "Worker", paneId: "w1:p1", agentKind: "pi", timeoutMs: 1_000 }, "invalid-agent-name"],
      [{ kind: "agent-get", target: "-focused" }, "invalid-target"],
      [{ kind: "worktree-create", cwd: "../repo", branch: "story" }, "invalid-path"],
      [{ kind: "agent-read", target: "w1:p1", lines: 0 }, "invalid-lines"],
      [{ kind: "agent-read", target: "w1:p1", lines: 501 }, "invalid-lines"],
      [{ kind: "agent-wait", target: "w1:p1", timeoutMs: 0 }, "invalid-timeout"],
      [{ kind: "agent-wait", target: "w1:p1", timeoutMs: 300_001 }, "invalid-timeout"],
      [{ kind: "agent-prompt", target: "worker", prompt: "x".repeat(4_097), timeoutMs: 1_000 }, "bounds"],
      [{ kind: "notification-show", title: "x".repeat(257) }, "bounds"],
      [{ kind: "agent-start", name: "worker", paneId: "w1:p1", agentKind: "pi", timeoutMs: 1_000, nativeArgs: ["x".repeat(16_385)] }, "bounds"],
    ];
    for (const [request, code] of cases) {
      expect(api.buildHerdrOperationV1(client, request)).toMatchObject({ kind: "refused", code });
    }
  });

  test("refuses sparse accessor subclass symbol-keyed and hostile native-argument arrays", async () => {
    const { api, client } = await compatibleClient();
    class ExoticArray extends Array<string> {}
    const sparse = new Array(1);
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, "0", { enumerable: true, get: () => "--model" });
    Object.defineProperty(accessor, "length", { value: 1 });
    const symbolKeyed = ["--model"];
    Object.defineProperty(symbolKeyed, Symbol("hidden"), { value: "x" });
    const hostile = new Proxy(["--model"], { ownKeys() { throw new Error("hostile reflective detail"); } });

    for (const nativeArgs of [sparse, accessor, new ExoticArray("--model"), symbolKeyed, hostile]) {
      const result = api.buildHerdrOperationV1(client, {
        kind: "agent-start",
        name: "worker",
        paneId: "w1:p1",
        agentKind: "pi",
        timeoutMs: 1_000,
        nativeArgs,
      });
      expect(result).toMatchObject({ kind: "refused", code: "invalid-native-args" });
      expect(JSON.stringify(result)).not.toContain("hostile reflective detail");
    }
  });

  test("does not execute an operation when the caller signal is already aborted", async () => {
    const { api, client, calls } = await compatibleClient();
    const controller = new AbortController();
    controller.abort();

    const result = await api.executeHerdrOperationV1(client, { kind: "agent-list" }, { signal: controller.signal });

    expect(result).toMatchObject({ kind: "aborted", operation: "agent-list" });
    expect(calls).toHaveLength(2);
  });

  test("refuses hostile options and signal accessors without throwing or executing", async () => {
    const fixture = await compatibleClient();
    const optionsAccessor = {};
    Object.defineProperty(optionsAccessor, "signal", {
      enumerable: true,
      get() { throw new Error("hostile signal accessor detail"); },
    });
    const abortedAccessor = {};
    Object.defineProperty(abortedAccessor, "aborted", {
      enumerable: true,
      get() { throw new Error("hostile aborted accessor detail"); },
    });

    for (const options of [null, optionsAccessor, { signal: abortedAccessor }]) {
      const result = await fixture.api.executeHerdrOperationV1(
        fixture.client,
        { kind: "agent-list" },
        options as any,
      );
      expect(result).toMatchObject({ kind: "refused", code: "invalid-operation" });
      expect(JSON.stringify(result)).not.toContain("hostile");
      expect(fixture.calls).toHaveLength(2);
    }

    const doctor = queueExecutor([]);
    const doctorResult = await fixture.api.createHerdrClientV1(
      { HERDR_ENV: "1" },
      doctor.execute,
      abortedAccessor as any,
    );
    expect(doctorResult).toMatchObject({ kind: "refused", code: "invalid-operation" });
    expect(doctor.calls).toHaveLength(0);
  });

  test("rejects duck-typed signals but accepts a real AbortSignal", async () => {
    const fakeFixture = await compatibleClient();
    const fakeResult = await fakeFixture.api.executeHerdrOperationV1(
      fakeFixture.client,
      { kind: "agent-list" },
      { signal: { aborted: false } as any },
    );
    expect(fakeResult).toMatchObject({ kind: "refused", code: "invalid-operation" });
    expect(fakeFixture.calls).toHaveLength(2);

    const realController = new AbortController();
    realController.abort();
    const realFixture = await compatibleClient();
    expect(await realFixture.api.executeHerdrOperationV1(
      realFixture.client,
      { kind: "agent-list" },
      { signal: realController.signal },
    )).toMatchObject({ kind: "aborted" });
    expect(realFixture.calls).toHaveLength(2);
  });

  test("refuses conflicting timeout and abort executor facts", async () => {
    const operation = report("", { exitCode: null, timedOut: true, aborted: true });
    const { api, client } = await compatibleClient([operation]);

    const result = await api.executeHerdrOperationV1(client, { kind: "agent-list" });

    expect(result).toMatchObject({ kind: "refused", code: "invalid-executor-report" });
  });

  test("refuses a null exit code without explicit timeout or abort", async () => {
    const { api, client } = await compatibleClient([
      report("", { exitCode: null }),
    ]);
    expect(await api.executeHerdrOperationV1(
      client,
      { kind: "agent-list" },
    )).toMatchObject({ kind: "refused", code: "invalid-executor-report" });
  });

  test("keeps executor timeout abort and validated Herdr timeout errors distinct", async () => {
    const cases = [
      [report("", { exitCode: null, timedOut: true }), "timeout"],
      [report("", { exitCode: null, aborted: true }), "aborted"],
      [report("", { exitCode: 1, stderr: JSON.stringify({ id: "cli:agent:list", error: { code: "timeout", message: "ignore" } }) }), "timeout"],
    ] as const;
    for (const [operationReport, kind] of cases) {
      const { api, client } = await compatibleClient([operationReport]);
      const result = await api.executeHerdrOperationV1(client, { kind: "agent-list" });
      expect(result.kind).toBe(kind);
      expect(result.kind).not.toBe("completed");
      expect("value" in result).toBe(false);
    }
  });

  test("refuses simultaneous meaningful stdout and stderr", async () => {
    const success = envelope("cli:agent:list", { type: "agent_list", agents: [] });
    const timeoutError = JSON.stringify({
      id: "cli:agent:list",
      error: { code: "timeout", message: "arbitrary detail" },
    });
    for (const stderr of [timeoutError, "plain error text"]) {
      const fixture = await compatibleClient([
        report(success, { exitCode: 1, stderr }),
      ]);
      expect(await fixture.api.executeHerdrOperationV1(
        fixture.client,
        { kind: "agent-list" },
      )).toMatchObject({ kind: "refused", code: "inconsistent-executor-report" });
    }
  });

  test("refuses error envelopes bound to another command id", async () => {
    const fixture = await compatibleClient([
      report("", {
        exitCode: 1,
        stderr: JSON.stringify({
          id: "cli:agent:get",
          error: { code: "timeout", message: "arbitrary detail" },
        }),
      }),
    ]);
    expect(await fixture.api.executeHerdrOperationV1(
      fixture.client,
      { kind: "agent-list" },
    )).toMatchObject({ kind: "refused", code: "mismatched-envelope" });
  });

  test("refuses malformed mismatched and inconsistent envelopes", async () => {
    const cases: Array<[ExecutorReport, string]> = [
      [report("not-json"), "malformed-envelope"],
      [report("42"), "malformed-envelope"],
      [report(envelope("cli:agent:get", { type: "agent_list", agents: [] })), "mismatched-envelope"],
      [report(JSON.stringify({ id: "cli:agent:get", error: { code: "agent_not_found", message: "x" } })), "inconsistent-executor-report"],
      [report(envelope("cli:agent:get", { type: "agent_info", agent: agentInfo("idle") }), { exitCode: 1 }), "inconsistent-executor-report"],
      [report(envelope("cli:agent:get", { type: "agent_info", agent: agentInfo("idle") }), { stderr: "unexpected" }), "inconsistent-executor-report"],
    ];
    for (const [operationReport, code] of cases) {
      const { api, client } = await compatibleClient([operationReport]);
      const result = await api.executeHerdrOperationV1(client, { kind: "agent-get", target: "worker" });
      expect(result).toMatchObject({ kind: "refused", code });
      expect("value" in result).toBe(false);
    }
  });

  test("classifies idle done working blocked unknown and future states without conflation", async () => {
    const cases = [
      ["idle", "completed"],
      ["done", "completed"],
      ["working", "working"],
      ["blocked", "blocked"],
      ["unknown", "unknown"],
      ["future-state", "unknown"],
    ] as const;
    for (const [status, kind] of cases) {
      const operation = report(envelope("cli:agent:get", { type: "agent_info", agent: agentInfo(status) }));
      const { api, client } = await compatibleClient([operation]);
      const result = await api.executeHerdrOperationV1(client, { kind: "agent-get", target: "worker" });
      expect(result.kind).toBe(kind);
      expect(result.value.agentStatus).toBe(status === "future-state" ? "unknown" : status);
      expect(Object.isFrozen(result.value)).toBe(true);
      if (status === "done") expect(result.value.agentStatus).not.toBe("idle");
    }
  });

  test("rejects duplicate pane ids and bounded agent-list overflow", async () => {
    const duplicate = envelope("cli:agent:list", {
      type: "agent_list",
      agents: [agentInfo("idle"), agentInfo("working", { name: "other" })],
    });
    const overflow = envelope("cli:agent:list", {
      type: "agent_list",
      agents: Array.from({ length: 257 }, (_, index) => agentInfo("idle", { pane_id: `w1:p${index}`, name: `worker-${index}` })),
    });
    for (const [payload, code] of [[duplicate, "duplicate-pane-id"], [overflow, "bounds"]] as const) {
      const { api, client } = await compatibleClient([report(payload)]);
      const result = await api.executeHerdrOperationV1(client, { kind: "agent-list" });
      expect(result).toMatchObject({ kind: "refused", code });
    }
  });

  test("requires agent-read identity source format and text bounds", async () => {
    const validRead = {
      type: "pane_read",
      read: {
        pane_id: "w1:p1",
        workspace_id: "w1",
        tab_id: "w1:t1",
        source: "recent-unwrapped",
        format: "text",
        text: "bounded output",
        revision: 4,
        truncated: false,
      },
    };
    const { api, client } = await compatibleClient([
      report(envelope("cli:agent:read", validRead)),
    ]);
    const completed = await api.executeHerdrOperationV1(client, {
      kind: "agent-read",
      target: "w1:p1",
      source: "recent-unwrapped",
      lines: 20,
      format: "text",
    });
    expect(completed).toMatchObject({ kind: "completed", value: { paneId: "w1:p1", text: "bounded output", truncated: false } });

    for (const read of [
      { ...validRead.read, pane_id: "w1:p9" },
      { ...validRead.read, source: "visible" },
      { ...validRead.read, format: "ansi" },
    ]) {
      const fixture = await compatibleClient([report(envelope("cli:agent:read", { type: "pane_read", read }))]);
      expect(await fixture.api.executeHerdrOperationV1(fixture.client, {
        kind: "agent-read", target: "w1:p1", source: "recent-unwrapped", lines: 20, format: "text",
      })).toMatchObject({ kind: "refused", code: "mismatched-target" });
    }
  });

  test("requires schema-one root_pane id and rejects legacy worktree fallbacks", async () => {
    const valid = envelope("cli:worktree:create", {
      type: "worktree_created",
      root_pane: agentInfo("unknown", { pane_id: "w1:p2" }),
      workspace: { workspace_id: "w1" },
      tab: { tab_id: "w1:t1" },
      worktree: { path: "/repo-story", branch: "story" },
    });
    const created = await compatibleClient([report(valid)]);
    expect(await created.api.executeHerdrOperationV1(created.client, {
      kind: "worktree-create", cwd: "/repo", branch: "story",
    })).toMatchObject({ kind: "completed", value: { paneId: "w1:p2" } });

    for (const legacy of [
      { type: "worktree_created", pane: { pane_id: "w1:p2" } },
      { type: "worktree_created", worktree: { pane_id: "w1:p2" } },
    ]) {
      const fixture = await compatibleClient([report(envelope("cli:worktree:create", legacy))]);
      expect(await fixture.api.executeHerdrOperationV1(fixture.client, {
        kind: "worktree-create", cwd: "/repo", branch: "story",
      })).toMatchObject({ kind: "refused", code: "missing-pane-id" });
    }
  });

  test("preserves notification delivery reasons without inventing failure", async () => {
    for (const reason of ["shown", "disabled", "rate_limited", "no_foreground_client", "busy"] as const) {
      const fixture = await compatibleClient([report(envelope("cli:notification:show", {
        type: "notification_show",
        shown: reason === "shown",
        reason,
      }))]);
      const result = await fixture.api.executeHerdrOperationV1(fixture.client, {
        kind: "notification-show", title: "Need input", sound: "request",
      });
      expect(result).toMatchObject({ kind: "completed", value: { shown: reason === "shown", reason } });
    }
  });

  test("maps CLI errors to stable non-echoing outcomes", async () => {
    const cases = [
      [JSON.stringify({ id: "cli:agent:get", error: { code: "agent_not_found", message: "hostile arbitrary detail" } }), "unavailable", "not-found"],
      [JSON.stringify({ id: "cli:agent:get", error: { code: "timeout", message: "hostile arbitrary detail" } }), "timeout", undefined],
      [JSON.stringify({ id: "cli:agent:get", error: { code: "future_code", message: "hostile arbitrary detail" } }), "unavailable", "cli-error"],
      ["timed out in untrusted prose", "unavailable", "cli-error"],
      ["", "unavailable", "cli-error"],
    ] as const;
    for (const [stderr, kind, code] of cases) {
      const fixture = await compatibleClient([report("", { exitCode: 1, stderr })]);
      const result = await fixture.api.executeHerdrOperationV1(fixture.client, { kind: "agent-get", target: "worker" });
      expect(result.kind).toBe(kind);
      if (code) expect(result.code).toBe(code);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("hostile arbitrary detail");
      expect(serialized).not.toContain("partial");
      expect("value" in result).toBe(false);
    }
  });

  test("does not freeze caller-owned request objects", async () => {
    const { api, client } = await compatibleClient();
    const request = {
      kind: "agent-wait",
      target: "w1:p1",
      until: ["blocked", "done"],
      timeoutMs: 1_000,
    };
    const built = api.buildHerdrOperationV1(client, request);
    expect(built.kind).toBe("completed");
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(request.until)).toBe(false);
    request.target = "w1:p9";
    request.until.push("idle");
    expect(built.value.argv).toEqual([
      "herdr", "agent", "wait", "w1:p1", "--until", "blocked", "--until", "done", "--timeout", "1000",
    ]);
  });

  test("enforces object-key and nesting-depth bounds before projection", async () => {
    const manyKeys = agentInfo("idle") as Record<string, unknown>;
    for (let index = 0; index < 260; index += 1) manyKeys[`extra_${index}`] = index;
    let nested: Record<string, unknown> = { leaf: true };
    for (let depth = 0; depth < 18; depth += 1) nested = { nested };

    for (const agent of [manyKeys, { ...agentInfo("idle"), additive: nested }]) {
      const fixture = await compatibleClient([
        report(envelope("cli:agent:list", { type: "agent_list", agents: [agent] })),
      ]);
      expect(await fixture.api.executeHerdrOperationV1(
        fixture.client,
        { kind: "agent-list" },
      )).toMatchObject({ kind: "refused", code: "bounds" });
    }
  });

  test("detaches and freezes accepted values from mutable executor input", async () => {
    const payload = { id: "cli:agent:list", result: { type: "agent_list", agents: [agentInfo("idle")] } };
    const fixture = await compatibleClient([report(JSON.stringify(payload))]);
    const result = await fixture.api.executeHerdrOperationV1(fixture.client, { kind: "agent-list" });
    payload.result.agents[0].name = "mutated";

    expect(result.value.agents[0].name).toBe("worker");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value.agents)).toBe(true);
    expect(Object.isFrozen(result.value.agents[0])).toBe(true);
  });

  test("rejects copied reconstructed and serialized client-shaped values", async () => {
    const { api, client, calls } = await compatibleClient();
    const copies = [
      { ...client },
      JSON.parse(JSON.stringify(client)),
      { version: 1, kind: "herdr-client", compatibility: client.compatibility },
    ];
    for (const copy of copies) {
      expect(api.buildHerdrOperationV1(copy, { kind: "agent-list" })).toMatchObject({ kind: "refused", code: "invalid-client" });
      expect(await api.executeHerdrOperationV1(copy, { kind: "agent-list" })).toMatchObject({ kind: "refused", code: "invalid-client" });
    }
    expect(calls).toHaveLength(2);
  });

  test("is mutation-sensitive to timeout classification and shell-free argv", async () => {
    const timeoutFixture = await compatibleClient([report("", { exitCode: null, timedOut: true })]);
    const timedOut = await timeoutFixture.api.executeHerdrOperationV1(timeoutFixture.client, { kind: "agent-list" });
    expect(timedOut).toMatchObject({ version: 1, kind: "timeout", operation: "agent-list" });
    expect(timedOut.kind).not.toBe("completed");
    expect(timedOut.kind).not.toBe("unavailable");

    const built = timeoutFixture.api.buildHerdrOperationV1(timeoutFixture.client, {
      kind: "agent-prompt", target: "worker", prompt: "echo safe", wait: true, timeoutMs: 1_000,
    });
    expect(built.value.argv.slice(0, 3)).toEqual(["herdr", "agent", "prompt"]);
    expect(built.value.argv).not.toContain("sh");
    expect(built.value.argv).not.toContain("bash");
    expect(built.value.argv).not.toContain("-c");
  });
});
