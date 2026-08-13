import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isLoadedExtensionV1 } from "./extension-discovery.ts";

export { isLoadedExtensionV1 };

const PATH_FAILURE = 'The "path" argument must be of type string';
const EXTENSION_FAILURE = "Failed to load extension";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ADVISORY_FLAGS = new Set(["-ne", "--no-extensions"]);

export type LiveChildCodeV1 =
  | "child-started"
  | "child-startup-unavailable"
  | "operator-approval-required";

export type LiveChildEvidenceV1 = Readonly<{
  command?: readonly string[];
  status?: number;
  output?: string;
  loadedPersonalPackage?: boolean;
  childIdentity?: string;
  requestedOperation?: string;
  transport?: "pi-subagents";
}>;

export type LiveChildResultV1 = Readonly<{
  ok: boolean;
  status: "started" | "blocked";
  code: LiveChildCodeV1;
  advisoryOnly: boolean;
  executes: false;
  spawnCapsRaised: false;
  productFleetLaunched: false;
  loadedPersonalPackage?: boolean;
  childIdentity?: string;
  output?: string;
}>;

export type LiveChildProbeInputV1 = Readonly<{
  repo: string;
  raiseSpawnCaps?: boolean;
  launchProductFleet?: boolean;
}>;

function freezeResult(result: LiveChildResultV1): LiveChildResultV1 {
  return Object.freeze(result);
}

function unavailable(over: Partial<LiveChildResultV1> = {}): LiveChildResultV1 {
  return freezeResult({
    ok: false,
    status: "blocked",
    code: over.code === "operator-approval-required" ? "operator-approval-required" : "child-startup-unavailable",
    advisoryOnly: over.advisoryOnly === true,
    executes: false,
    spawnCapsRaised: false,
    productFleetLaunched: false,
    loadedPersonalPackage: over.loadedPersonalPackage,
    childIdentity: over.childIdentity,
    output: over.output,
  });
}

function commandList(command: readonly string[] | undefined): readonly string[] {
  return Array.isArray(command) ? command : [];
}

function isAdvisoryCommand(command: readonly string[]): boolean {
  return command.some((part) => ADVISORY_FLAGS.has(part));
}

function isDiscoveryOnlyCommand(command: readonly string[]): boolean {
  return command.includes("--list-models");
}

function outputText(output: string | undefined): string {
  return typeof output === "string" ? output : "";
}

function hasStartupFailure(output: string): boolean {
  return output.includes(PATH_FAILURE) || output.includes(EXTENSION_FAILURE);
}

export function classifyLiveChildEvidenceV1(input: LiveChildEvidenceV1 = {}): LiveChildResultV1 {
  if (input.requestedOperation === "product-fleet") {
    return unavailable({ code: "operator-approval-required" });
  }

  const command = commandList(input.command);
  const output = outputText(input.output);
  const advisoryOnly = isAdvisoryCommand(command);
  const identity = typeof input.childIdentity === "string" && SAFE_ID.test(input.childIdentity)
    ? input.childIdentity
    : undefined;
  const started = input.transport === "pi-subagents"
    && input.status === 0
    && input.loadedPersonalPackage === true
    && !advisoryOnly
    && !isDiscoveryOnlyCommand(command)
    && !hasStartupFailure(output)
    && Boolean(identity);

  if (!started) {
    return unavailable({
      advisoryOnly,
      loadedPersonalPackage: input.loadedPersonalPackage === true,
      output,
    });
  }

  return freezeResult({
    ok: true,
    status: "started",
    code: "child-started",
    advisoryOnly: false,
    executes: false,
    spawnCapsRaised: false,
    productFleetLaunched: false,
    loadedPersonalPackage: true,
    childIdentity: identity,
    output,
  });
}

function combinedOutput(result: { stdout?: string | null; stderr?: string | null; error?: Error }): string {
  return [result.stdout ?? "", result.stderr ?? "", result.error?.message ?? ""].filter(Boolean).join("\n");
}

function stageHome(repo: string, home: string) {
  return spawnSync("python3", [join(repo, "scripts/stage-ai-resources.py"), "--repo", repo, "--home", home, "--host", "macos"], {
    encoding: "utf8",
    env: { ...process.env, HOME: repo },
    timeout: 60_000,
  });
}

function runPi(home: string, repo: string, args: readonly string[]) {
  return spawnSync("pi", [...args], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PI_CODING_AGENT_DIR: join(home, ".pi/agent"),
      PI_OFFLINE: "1",
    },
    timeout: 60_000,
  });
}

function resolveStagedFleetPath(home: string): string {
  return join(home, ".pi/agent/personal/extensions/agentic-fleet.ts");
}

function reproducePriorFailures(home: string, listedOutput: string): string {
  const notes: string[] = [];
  try {
    const dir = dirname(fileURLToPath(`file://${resolveStagedFleetPath(home)}`));
    if (!dir) notes.push(PATH_FAILURE);
  } catch {
    notes.push(PATH_FAILURE);
  }
  if (listedOutput.includes("approval-seams.test.ts") || listedOutput.includes(EXTENSION_FAILURE)) {
    notes.push(EXTENSION_FAILURE);
  }
  return notes.join("\n");
}

/**
 * Bounded live probe through the loaded personal package.
 * A live child requires a pi-subagents spawn with a child identity.
 * Packaged discovery and `pi -ne` remain advisory and cannot become child-started.
 */
export async function probeLiveChildDelegationV1(input: LiveChildProbeInputV1): Promise<LiveChildResultV1> {
  if (input.launchProductFleet === true) {
    return unavailable({ code: "operator-approval-required" });
  }
  if (input.raiseSpawnCaps === true) {
    return unavailable({ output: "spawn-cap-raise-refused" });
  }

  const repo = resolve(input.repo);
  const home = mkdtempSync(join(tmpdir(), "issue25-child-home-"));
  try {
    const staged = stageHome(repo, home);
    if (staged.status !== 0) {
      return unavailable({ output: combinedOutput(staged) });
    }

    const listed = runPi(home, repo, ["list", "--no-approve"]);
    const listedOutput = combinedOutput(listed);
    const loadedPersonalPackage = listed.status === 0
      && listedOutput.includes("./personal")
      && listedOutput.includes("npm:pi-subagents@0.45.2")
      && !hasStartupFailure(listedOutput);

    const prior = reproducePriorFailures(home, listedOutput);
    if (!loadedPersonalPackage || prior.includes(PATH_FAILURE) || prior.includes(EXTENSION_FAILURE)) {
      return classifyLiveChildEvidenceV1({
        command: ["pi", "list", "--no-approve"],
        status: listed.status ?? 1,
        output: [listedOutput, prior].filter(Boolean).join("\n"),
        loadedPersonalPackage: false,
      });
    }

    const discovery = runPi(home, repo, [
      "--offline",
      "--no-session",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-tools",
      "--list-models",
    ]);
    const discoveryOutput = combinedOutput(discovery);
    if (discovery.status !== 0 || hasStartupFailure(discoveryOutput)) {
      return classifyLiveChildEvidenceV1({
        command: ["pi", "--offline", "--no-session", "--list-models"],
        status: discovery.status ?? 1,
        output: discoveryOutput,
        loadedPersonalPackage,
      });
    }

    // A parent pi-subagents RPC bus is not present in this hermetic process.
    // Do not treat packaged discovery as a started child.
    return classifyLiveChildEvidenceV1({
      command: ["pi", "--offline", "--no-session"],
      status: 1,
      output: [
        discoveryOutput,
        "child-startup-unavailable: no parent pi-subagents RPC bus in hermetic probe",
      ].join("\n"),
      loadedPersonalPackage,
    });
  } catch (error) {
    return unavailable({
      output: error instanceof Error ? error.message : "child-startup-unavailable",
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
