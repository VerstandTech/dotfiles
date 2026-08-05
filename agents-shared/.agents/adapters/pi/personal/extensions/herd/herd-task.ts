// Pure argv builder for the worktree-first task launcher (DESIGN.md §7.8).
// The extension adapter executes this argv and parses IDs from the JSON output.
// Traces: docs/pi-herdr-example-map.md R3, R7 · docs/pi-herdr-acceptance.md Slice 2

const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** herdr's own agent-name rule: [a-z][a-z0-9_-]{0,31} */
export function isValidAgentName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export interface TaskLaunchOptions {
  name: string;
  cwd: string;
  base?: string;
}

/**
 * Build argv for `herdr worktree create` (R3): one worktree per task,
 * labeled 1:1 with the agent name. Detach-safe by default (R7): herdr 0.7.5
 * create never steals focus unless `--focus` is passed, so we simply omit it;
 * stdout is a JSON envelope by default (there is no --json flag), and the
 * pane id is parsed from `result.root_pane.pane_id` — never derived.
 * Generic for any project: when `base` is omitted, no --base flag is
 * emitted — herdr/git resolve the repo's own default branch.
 * Throws on invalid names before producing any argv.
 */
export function buildTaskLaunch(opts: TaskLaunchOptions): string[] {
  if (!isValidAgentName(opts.name)) {
    throw new Error(
      `invalid agent name ${JSON.stringify(opts.name)}: must match [a-z][a-z0-9_-]{0,31}`,
    );
  }
  const argv = [
    "herdr", "worktree", "create",
    "--cwd", opts.cwd,
    "--branch", opts.name,
  ];
  if (opts.base !== undefined) {
    argv.push("--base", opts.base);
  }
  argv.push("--label", opts.name);
  return argv;
}
