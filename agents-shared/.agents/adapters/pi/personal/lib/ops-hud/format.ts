export type HudActivity =
	| {
			kind: "web_search";
			id: string;
			query: string;
			startedAt: number;
	  }
	| {
			kind: "subagent";
			id: string;
			label: string;
			detail?: string;
			startedAt: number;
	  }
	| {
			kind: "tool";
			id: string;
			name: string;
			detail?: string;
			startedAt: number;
	  };

export type HudSnapshot = {
	activities: HudActivity[];
	webSearchCount: number;
	subagentCount: number;
	otherToolCount: number;
};

export function classifyTool(toolName: string): "web_search" | "subagent" | "other" {
	const name = toolName.toLowerCase();
	if (
		name === "xai_web_search" ||
		name === "web_search" ||
		name.includes("web_search") ||
		name.includes("websearch")
	) {
		return "web_search";
	}
	if (name === "subagent" || name.startsWith("subagent_") || name.includes("subagent")) {
		return "subagent";
	}
	return "other";
}

export function summarizeToolArgs(toolName: string, args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const rec = args as Record<string, unknown>;
	if (classifyTool(toolName) === "web_search") {
		const q = rec.query ?? rec.q ?? rec.search;
		if (typeof q === "string" && q.trim()) return truncate(q.trim(), 64);
	}
	if (classifyTool(toolName) === "subagent") {
		const agent = rec.agent ?? rec.name;
		const task = rec.task;
		const parts: string[] = [];
		if (typeof agent === "string" && agent.trim()) parts.push(agent.trim());
		if (Array.isArray(rec.tasks)) parts.push(`${rec.tasks.length} parallel`);
		if (Array.isArray(rec.chain)) parts.push(`chain×${rec.chain.length}`);
		if (typeof task === "string" && task.trim()) parts.push(truncate(task.trim(), 48));
		return parts.join(" · ");
	}
	const maybe =
		(typeof rec.path === "string" && rec.path) ||
		(typeof rec.command === "string" && rec.command) ||
		(typeof rec.pattern === "string" && rec.pattern) ||
		"";
	return typeof maybe === "string" ? truncate(maybe, 48) : "";
}

export function buildHudSnapshot(activities: Iterable<HudActivity>): HudSnapshot {
	const list = [...activities].sort((a, b) => a.startedAt - b.startedAt);
	return {
		activities: list,
		webSearchCount: list.filter((a) => a.kind === "web_search").length,
		subagentCount: list.filter((a) => a.kind === "subagent").length,
		otherToolCount: list.filter((a) => a.kind === "tool").length,
	};
}

export function formatStatusLine(snapshot: HudSnapshot, now = Date.now()): string | undefined {
	if (snapshot.activities.length === 0) return undefined;
	const chips: string[] = [];
	if (snapshot.webSearchCount > 0) {
		chips.push(`🌐×${snapshot.webSearchCount}`);
	}
	if (snapshot.subagentCount > 0) {
		chips.push(`🤖×${snapshot.subagentCount}`);
	}
	if (snapshot.otherToolCount > 0) {
		chips.push(`🔧×${snapshot.otherToolCount}`);
	}
	const top = snapshot.activities[snapshot.activities.length - 1]!;
	const ageSec = Math.max(0, Math.floor((now - top.startedAt) / 1000));
	const detail =
		top.kind === "web_search"
			? truncate(top.query, 40)
			: top.kind === "subagent"
				? top.label
				: top.name;
	return `${chips.join(" ")} · ${detail} · ${ageSec}s`;
}

export function formatWidgetLines(snapshot: HudSnapshot, now = Date.now()): string[] {
	if (snapshot.activities.length === 0) return [];
	const headerParts = [
		snapshot.webSearchCount > 0 ? `${snapshot.webSearchCount} web` : "",
		snapshot.subagentCount > 0 ? `${snapshot.subagentCount} agents` : "",
		snapshot.otherToolCount > 0 ? `${snapshot.otherToolCount} tools` : "",
	].filter(Boolean);
	const lines = [`◉ Live ops · ${headerParts.join(" · ")}`];
	const max = 6;
	const items = snapshot.activities.slice(-max);
	for (let i = 0; i < items.length; i++) {
		const a = items[i]!;
		const last = i === items.length - 1;
		const branch = last ? "└─" : "├─";
		const age = Math.max(0, Math.floor((now - a.startedAt) / 1000));
		if (a.kind === "web_search") {
			lines.push(`${branch} 🌐 search  ${truncate(a.query, 56)}  (${age}s)`);
		} else if (a.kind === "subagent") {
			const detail = a.detail ? ` · ${truncate(a.detail, 40)}` : "";
			lines.push(`${branch} 🤖 ${a.label}${detail}  (${age}s)`);
		} else {
			const detail = a.detail ? ` · ${truncate(a.detail, 40)}` : "";
			lines.push(`${branch} 🔧 ${a.name}${detail}  (${age}s)`);
		}
	}
	if (snapshot.activities.length > max) {
		lines.push(`   +${snapshot.activities.length - max} more`);
	}
	lines.push("   tip: /subagents-fleet · Ctrl+Alt+F");
	return lines;
}

export function formatWorkingMessage(snapshot: HudSnapshot): string | undefined {
	if (snapshot.activities.length === 0) return undefined;
	if (snapshot.webSearchCount > 0 && snapshot.subagentCount > 0) {
		return `Researching the web (${snapshot.webSearchCount}) + running agents (${snapshot.subagentCount})…`;
	}
	if (snapshot.webSearchCount > 1) {
		return `Researching ${snapshot.webSearchCount} web queries in parallel…`;
	}
	if (snapshot.webSearchCount === 1) {
		const q = snapshot.activities.find((a) => a.kind === "web_search");
		return q && q.kind === "web_search"
			? `Searching the web: ${truncate(q.query, 48)}…`
			: "Searching the web…";
	}
	if (snapshot.subagentCount > 1) {
		return `Running ${snapshot.subagentCount} sub-agents…`;
	}
	if (snapshot.subagentCount === 1) {
		const s = snapshot.activities.find((a) => a.kind === "subagent");
		return s && s.kind === "subagent" ? `Sub-agent: ${s.label}…` : "Running sub-agent…";
	}
	return "Working…";
}

function truncate(text: string, max: number): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	if (cleaned.length <= max) return cleaned;
	return `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}
