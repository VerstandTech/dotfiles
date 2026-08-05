import type { WebSearchSource, WebSearchSuccess, XaiResponsesPayload } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function extractOutputText(payload: XaiResponsesPayload): string {
	const chunks: string[] = [];
	const output = payload.output;
	if (Array.isArray(output)) {
		for (const item of output) {
			const rec = asRecord(item);
			if (!rec) continue;
			if (rec.type !== "message") continue;
			const content = rec.content;
			if (!Array.isArray(content)) continue;
			for (const part of content) {
				const p = asRecord(part);
				if (!p) continue;
				const text = p.text ?? p.output_text;
				if (typeof text === "string" && text.trim()) chunks.push(text);
			}
		}
	}
	return chunks.join("\n\n").trim();
}

export function extractSources(payload: XaiResponsesPayload): WebSearchSource[] {
	const byUrl = new Map<string, WebSearchSource>();

	const add = (url: unknown, title?: unknown) => {
		if (typeof url !== "string" || !url.trim()) return;
		const cleaned = url.trim();
		if (!byUrl.has(cleaned)) {
			byUrl.set(cleaned, {
				url: cleaned,
				title: typeof title === "string" && title.trim() ? title.trim() : undefined,
			});
		} else if (typeof title === "string" && title.trim()) {
			const prev = byUrl.get(cleaned)!;
			if (!prev.title) prev.title = title.trim();
		}
	};

	const walk = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		const rec = asRecord(node);
		if (!rec) return;

		if (rec.type === "url_citation" || rec.type === "url") {
			add(rec.url, rec.title);
		}
		if (Array.isArray(rec.sources)) {
			for (const src of rec.sources) {
				const s = asRecord(src);
				if (s) add(s.url, s.title);
				else if (typeof src === "string") add(src);
			}
		}
		if (Array.isArray(rec.annotations)) walk(rec.annotations);
		if (rec.action) walk(rec.action);
		if (Array.isArray(rec.content)) walk(rec.content);
		if (Array.isArray(rec.output)) walk(rec.output);

		// generic shallow scan of nested objects
		for (const [k, v] of Object.entries(rec)) {
			if (k === "sources" || k === "annotations" || k === "action" || k === "content" || k === "output") {
				continue;
			}
			if (v && typeof v === "object") walk(v);
		}
	};

	walk(payload.output);
	return [...byUrl.values()];
}

export function extractWebSearchCallCount(payload: XaiResponsesPayload): number {
	const details = payload.usage?.server_side_tool_usage_details?.web_search_calls;
	if (typeof details === "number") return details;
	let count = 0;
	const output = payload.output;
	if (Array.isArray(output)) {
		for (const item of output) {
			const rec = asRecord(item);
			if (rec?.type === "web_search_call") count += 1;
		}
	}
	return count;
}

export function formatSearchReport(result: WebSearchSuccess): string {
	const lines: string[] = [];
	lines.push(`## Web search result`);
	lines.push(`- backend: ${result.backend}`);
	if (result.model) lines.push(`- model: ${result.model}`);
	if (result.authSource) lines.push(`- auth: ${result.authSource}`);
	lines.push(`- web_search_calls: ${result.webSearchCalls}`);
	lines.push("");
	lines.push(result.text || "(empty model text)");
	if (result.sources.length > 0) {
		lines.push("");
		lines.push("## Sources");
		for (const [i, src] of result.sources.entries()) {
			const label = src.title ? `${src.title} — ${src.url}` : src.url;
			lines.push(`${i + 1}. ${label}`);
		}
	}
	return lines.join("\n");
}
