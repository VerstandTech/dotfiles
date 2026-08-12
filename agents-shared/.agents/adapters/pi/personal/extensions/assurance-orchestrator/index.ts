import {
	assurance_plan_role,
	assurance_record_handoff,
	assurance_request_approval,
	assurance_spawn_role,
	assurance_status,
	assurance_wait_role,
} from "../../lib/orchestrator/index.ts";

const RESULT_CHANNEL = "assurance:orchestrator:result";
const PING_CHANNEL = "assurance:orchestrator:ping";
const LIFECYCLE_CHANNEL = "assurance:orchestrator:lifecycle";
const SPAWN_ENTRY = "assurance:spawn:v1";

type PlainRecord = Record<string, unknown>;
type SessionResource = { close: () => unknown | Promise<unknown> };
type PiLike = {
	registerTool: (tool: PlainRecord) => void;
	on: (event: string, handler: (event: unknown, context?: unknown) => unknown) => unknown;
	appendEntry: (customType: string, data?: unknown) => void;
	events: {
		on: (channel: string, handler: (data: unknown) => void) => () => void;
		emit: (channel: string, data: unknown) => void;
	};
};

export type AssuranceOrchestratorExtensionOptionsV1 = Readonly<{
	spawnAdapter?: unknown;
	waitAdapter?: unknown;
	approvalGateway?: unknown;
	openSessionResource?: (context: unknown) => SessionResource | undefined | Promise<SessionResource | undefined>;
}>;

function own(value: unknown, key: string): unknown {
	if (!value || typeof value !== "object") return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

function inactive() {
	return Object.freeze({
		schemaVersion: 1,
		primitive: "assurance-orchestrator",
		ok: false,
		outcome: "unavailable",
		code: "ORC01_SESSION_INACTIVE",
	});
}

function internalFailure(primitive: string) {
	return Object.freeze({
		schemaVersion: 1,
		primitive,
		ok: false,
		outcome: "unavailable",
		code: "ORC01_INTERNAL_UNAVAILABLE",
	});
}

function appendUnknown(primitive: string) {
	return Object.freeze({
		schemaVersion: 1,
		primitive,
		ok: false,
		outcome: "unknown",
		code: "ORC01_APPEND_UNKNOWN",
		spawned: true,
	});
}

function summary(primitive: string, value: unknown) {
	const ok = own(value, "ok");
	const outcome = own(value, "outcome");
	const code = own(value, "code");
	return Object.freeze({
		schemaVersion: 1,
		primitive,
		ok: ok === true,
		outcome: typeof outcome === "string" ? outcome : "unavailable",
		code: typeof code === "string" && /^ORC01_[A-Z0-9_]{1,63}$/.test(code)
			? code
			: "ORC01_INTERNAL_UNAVAILABLE",
	});
}

function toolResult(value: unknown) {
	const code = own(value, "code");
	return {
		content: [{ type: "text" as const, text: typeof code === "string" ? code : "ORC01_INTERNAL_UNAVAILABLE" }],
		details: value,
	};
}

function planIdOf(value: unknown): string {
	const plan = own(value, "plan");
	const planId = own(plan, "planId");
	return typeof planId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,110}$/.test(planId)
		? planId
		: "unknown-plan";
}

function objectSchema(required: readonly string[], properties: PlainRecord): PlainRecord {
	return Object.freeze({
		type: "object",
		additionalProperties: false,
		required: [...required],
		properties,
		"~kind": "Object",
	});
}

const versionProperty = Object.freeze({ type: "number", const: 1, "~kind": "Literal" });
const anyProperty = Object.freeze({ "~kind": "Any" });
const stringProperty = Object.freeze({ type: "string", "~kind": "String" });
const statusParameters = objectSchema(["schemaVersion", "facts"], {
	schemaVersion: versionProperty,
	facts: anyProperty,
});
const planParameters = objectSchema(["schemaVersion", "repoRoot", "request"], {
	schemaVersion: versionProperty,
	repoRoot: stringProperty,
	request: anyProperty,
});
const spawnParameters = objectSchema(["schemaVersion", "plan", "candidateSha", "facts"], {
	schemaVersion: versionProperty,
	plan: anyProperty,
	candidateSha: stringProperty,
	facts: anyProperty,
});
const waitParameters = objectSchema(["schemaVersion", "roleRef", "bounds"], {
	schemaVersion: versionProperty,
	roleRef: anyProperty,
	bounds: anyProperty,
});
const handoffParameters = objectSchema(["schemaVersion", "plan", "result", "current"], {
	schemaVersion: versionProperty,
	plan: anyProperty,
	result: anyProperty,
	current: anyProperty,
});
const approvalParameters = objectSchema(["schemaVersion", "request"], {
	schemaVersion: versionProperty,
	request: anyProperty,
});

export function createAssuranceOrchestratorExtensionV1(
	options: AssuranceOrchestratorExtensionOptionsV1 = {},
) {
	return (pi: PiLike): void => {
		let active = false;
		let generation = 0;
		let unsubscribe: (() => void) | undefined;
		let resource: SessionResource | undefined;

		const dispose = async (): Promise<void> => {
			active = false;
			const currentUnsubscribe = unsubscribe;
			const currentResource = resource;
			unsubscribe = undefined;
			resource = undefined;
			if (currentUnsubscribe) {
				try { currentUnsubscribe(); } catch { /* lifecycle teardown is fail-closed */ }
			}
			if (currentResource) {
				try { await currentResource.close(); } catch { /* stale resources remain inactive */ }
			}
		};

		const emitResult = (primitive: string, value: unknown): void => {
			pi.events.emit(RESULT_CHANNEL, summary(primitive, value));
		};

		const execute = async (
			primitive: string,
			operation: () => unknown | Promise<unknown>,
		): Promise<ReturnType<typeof toolResult>> => {
			if (!active) return toolResult(inactive());
			let value: unknown;
			try {
				value = await operation();
			} catch {
				value = internalFailure(primitive);
			}
			emitResult(primitive, value);
			return toolResult(value);
		};

		pi.registerTool({
			name: "assurance_status",
			label: "Assurance Status",
			description: "Reconcile explicit BDD, Herdr, worktree, fleet, trajectory, and budget facts without mutation.",
			parameters: statusParameters,
			execute: async (_id: unknown, params: unknown) => execute("assurance_status", () => assurance_status(params)),
		});

		pi.registerTool({
			name: "assurance_plan_role",
			label: "Assurance Plan Role",
			description: "Validate one RoleRequestV1 and return one deterministic CAID plan without mutation.",
			parameters: planParameters,
			execute: async (_id: unknown, params: unknown) => execute("assurance_plan_role", () => assurance_plan_role(params)),
		});

		pi.registerTool({
			name: "assurance_spawn_role",
			label: "Assurance Spawn Role",
			description: "Spawn exactly one preflighted role through injected worktree, registration, lease, and start adapters.",
			parameters: spawnParameters,
			execute: async (_id: unknown, params: unknown) => execute("assurance_spawn_role", async () => {
				const value = await assurance_spawn_role(params, options.spawnAdapter);
				if (own(value, "ok") === true && own(value, "outcome") === "spawned") {
					try {
						pi.appendEntry(SPAWN_ENTRY, {
							schemaVersion: 1,
							authority: false,
							ids: own(value, "ids"),
						});
					} catch {
						return appendUnknown("assurance_spawn_role");
					}
				}
				return value;
			}),
		});

		pi.registerTool({
			name: "assurance_wait_role",
			label: "Assurance Wait Role",
			description: "Run one explicitly bounded injected wait, get, and structured read sequence; timeout remains unknown.",
			parameters: waitParameters,
			execute: async (_id: unknown, params: unknown) => execute("assurance_wait_role", () => assurance_wait_role(params, options.waitAdapter)),
		});

		pi.registerTool({
			name: "assurance_record_handoff",
			label: "Assurance Record Handoff",
			description: "Validate current role evidence, apply RED-01, and persist only through the session append seam.",
			parameters: handoffParameters,
			execute: async (_id: unknown, params: unknown) => execute("assurance_record_handoff", () => assurance_record_handoff(params, {
				appendEntry: (customType: string, data: unknown) => {
					pi.appendEntry(customType, data);
					return { ok: true, entryId: `entry-${planIdOf(params)}` };
				},
			})),
		});

		pi.registerTool({
			name: "assurance_request_approval",
			label: "Assurance Request Approval",
			description: "Request one durable human decision from an injected APR gateway; unavailable by default.",
			parameters: approvalParameters,
			execute: async (_id: unknown, params: unknown) => execute("assurance_request_approval", () => assurance_request_approval(params, options.approvalGateway)),
		});

		pi.on("session_start", async (_event, context) => {
			await dispose();
			generation += 1;
			const current = generation;
			active = true;
			unsubscribe = pi.events.on(PING_CHANNEL, () => {
				if (!active || current !== generation) return;
				pi.events.emit(LIFECYCLE_CHANNEL, Object.freeze({ schemaVersion: 1, status: "active" }));
			});
			if (typeof options.openSessionResource === "function") {
				try {
					const opened = await options.openSessionResource(context);
					if (active && current === generation && opened && typeof opened.close === "function") resource = opened;
					else if (opened && typeof opened.close === "function") await opened.close();
				} catch {
					resource = undefined;
				}
			}
		});

		pi.on("session_shutdown", async () => {
			await dispose();
		});
	};
}

export const assuranceOrchestratorExtension = createAssuranceOrchestratorExtensionV1();
export default assuranceOrchestratorExtension;
