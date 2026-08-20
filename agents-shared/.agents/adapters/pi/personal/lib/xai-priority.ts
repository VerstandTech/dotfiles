export type ServiceTier = "priority" | "default";

export function isXaiModel(model: { provider?: string; baseUrl?: string } | undefined): boolean {
	if (!model) return false;
	if (model.provider === "xai") return true;
	return typeof model.baseUrl === "string" && model.baseUrl.includes("api.x.ai");
}

export function applyServiceTier(payload: unknown, tier: ServiceTier): unknown {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	return { ...payload, service_tier: tier };
}

/** Empty / unknown args toggle. `on`/`priority` → true; `off`/`default`/`std` → false. */
export function parsePriorityArgs(args: string, current: boolean): boolean {
	const a = args.trim().toLowerCase();
	if (a === "on" || a === "priority") return true;
	if (a === "off" || a === "default" || a === "std") return false;
	return !current;
}

export function statusLabel(on: boolean): string {
	return on ? "priority" : "std";
}
