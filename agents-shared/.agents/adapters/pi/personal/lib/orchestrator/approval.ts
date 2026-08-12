import {
	checkApprovalPairV1,
	parseApprovalDecisionV1,
	parseApprovalRequestV1,
} from "../contracts/index.ts";
import {
	exactKeys,
	publicError,
	result,
	safeAdapterRecord,
	safeInput,
	validVersion,
} from "./internal.ts";

const PRIMITIVE = "assurance_request_approval" as const;

type ApprovalGateway = (request: unknown) => unknown;

export async function requestApproval(input: unknown, gateway?: unknown) {
	const normalized = safeInput(input);
	if (!normalized.ok) return publicError(PRIMITIVE, normalized.code);
	const value = normalized.value;
	if (!exactKeys(value, ["schemaVersion", "request"])) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	if (!validVersion(value.schemaVersion)) return publicError(PRIMITIVE, "ORC01_UNSUPPORTED_VERSION");
	const request = parseApprovalRequestV1(value.request);
	if (!request.ok) return publicError(PRIMITIVE, "ORC01_APPROVAL_REQUEST_INVALID");
	if (typeof gateway !== "function") {
		return publicError(PRIMITIVE, "ORC01_APPROVAL_GATEWAY_UNAVAILABLE", "unavailable");
	}
	let raw: unknown;
	try {
		raw = await (gateway as ApprovalGateway)(request.value);
	} catch {
		return publicError(PRIMITIVE, "ORC01_APPROVAL_GATEWAY_UNAVAILABLE", "unavailable");
	}
	const response = safeAdapterRecord(raw);
	if (
		!response || !exactKeys(response, ["ok", "authority", "durable", "decision"]) ||
		response.ok !== true || response.authority !== "apr-01" || response.durable !== true
	) return publicError(PRIMITIVE, "ORC01_APPROVAL_GATEWAY_UNAVAILABLE", "unavailable");
	const decision = parseApprovalDecisionV1(response.decision);
	if (!decision.ok || !checkApprovalPairV1(request.value, decision.value).ok) {
		return publicError(PRIMITIVE, "ORC01_APPROVAL_GATEWAY_UNAVAILABLE", "unavailable");
	}
	if (decision.value.decision === "approved") {
		return result(PRIMITIVE, true, "approved", "ORC01_APPROVED", {
			requestId: decision.value.requestId,
		});
	}
	return result(PRIMITIVE, false, "rejected", "ORC01_REJECTED", {
		requestId: decision.value.requestId,
	});
}
