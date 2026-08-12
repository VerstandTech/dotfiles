import { requestApproval } from "./approval.ts";
import { recordHandoff } from "./handoff.ts";
import { planRole } from "./plan.ts";
import { spawnRole } from "./spawn.ts";
import { status } from "./status.ts";
import { waitRole } from "./wait.ts";

/** Read-only reconciliation of explicit authority facts. */
export function assurance_status(input: unknown) {
	return status(input);
}

/** Validate one RoleRequestV1 and return one deterministic CAID plan. */
export function assurance_plan_role(input: unknown) {
	return planRole(input);
}

/** Run one preflighted, compensated, injected spawn transaction. */
export function assurance_spawn_role(input: unknown, adapters: unknown) {
	return spawnRole(input, adapters);
}

/** Run one injected bounded wait → get → read sequence. */
export function assurance_wait_role(input: unknown, adapters: unknown) {
	return waitRole(input, adapters);
}

/** Validate, RED-01-project, and append one current role handoff. */
export function assurance_record_handoff(input: unknown, adapter: unknown) {
	return recordHandoff(input, adapter);
}

/** Request one durable human decision through an injected APR gateway. */
export function assurance_request_approval(input: unknown, gateway?: unknown) {
	return requestApproval(input, gateway);
}
