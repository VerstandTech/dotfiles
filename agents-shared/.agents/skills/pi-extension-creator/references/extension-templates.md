# Extension templates

Copy one of these into `~/dotfiles/agents-shared/.agents/adapters/pi/personal/extensions/<name>.ts` (or project `.pi/extensions/`). Prefer the scaffold script; these are the canonical bodies.

Official examples live in the Pi install under `examples/extensions/`.

## Minimal

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ping", {
    description: "Notify that the extension loaded",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pong", "info");
    },
  });
}
```

## Tool (`defineTool`)

```ts
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const helloTool = defineTool({
  name: "hello",
  label: "Hello",
  description: "A simple greeting tool",
  parameters: Type.Object({
    name: Type.String({ description: "Name to greet" }),
  }),
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: { greeted: params.name },
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(helloTool);
}
```

## Command

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ship-check", {
    description: "Remind about pre-push checks",
    handler: async (args, ctx) => {
      const focus = args.trim() || "tests + typecheck";
      ctx.ui.notify(`Before shipping, run: ${focus}`, "info");
    },
  });
}
```

## Hook — dangerous bash gate

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const dangerous = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");
    if (!dangerous.some((re) => re.test(command))) return;

    if (!ctx.hasUI) {
      return { block: true, reason: "Dangerous command blocked (no UI)" };
    }

    const choice = await ctx.ui.select(`Dangerous command:\n\n${command}\n\nAllow?`, [
      "Yes",
      "No",
    ]);
    if (choice !== "Yes") {
      return { block: true, reason: "Blocked by user" };
    }
  });
}
```

## Hook — protect paths from write/edit

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const protectedPaths = [".env", ".git/", "node_modules/"];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const path = String(event.input.path ?? "");
    if (!protectedPaths.some((p) => path.includes(p))) return;

    if (ctx.hasUI) ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
    return { block: true, reason: `Path "${path}" is protected` };
  });
}
```

## Inline tool (no `defineTool`)

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "echo_text",
    label: "Echo",
    description: "Echo text back",
    parameters: Type.Object({
      text: Type.String({ description: "Text to echo" }),
    }),
    execute: async (_id, params) => ({
      content: [{ type: "text", text: String(params.text) }],
      details: {},
    }),
  });
}
```

## With npm dependency

Put deps on the **personal package** root (`~/dotfiles/agents-shared/.agents/adapters/pi/personal/package.json`) or beside a standalone package:

```bash
cd ~/dotfiles/agents-shared/.agents/adapters/pi/personal
npm install ms
```

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import ms from "ms";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "parse_duration",
    label: "Parse Duration",
    description: "Parse a human duration to milliseconds",
    parameters: Type.Object({
      duration: Type.String({ description: "e.g. 2 days, 1h, 5m" }),
    }),
    execute: async (_id, params) => {
      const result = ms(params.duration as ms.StringValue);
      if (result === undefined) throw new Error(`Invalid duration: ${params.duration}`);
      return {
        content: [{ type: "text", text: `${params.duration} = ${result} ms` }],
        details: { ms: result },
      };
    },
  });
}
```

Runtime deps must be in `dependencies` (Pi package installs omit devDeps by default for distributed packages).

## Async factory + shutdown

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const timer = setInterval(() => {}, 60_000);

  pi.on("session_shutdown", () => {
    clearInterval(timer);
  });
}
```

## Notes

- Built-in tool overrides must preserve result shapes (`details` types). See `examples/extensions/tool-override.ts`.
- Prefer small composable extensions over one mega-file.
- Name tools/commands uniquely; collisions override or confuse the model.
