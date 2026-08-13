import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMPOSE = resolve(import.meta.dir, "../../../../../../../docs/graphiti/docker-compose-falkordb.yml");

describe("SEC-PATH-adjacent Graphiti compose contract", () => {
	test("GRAPHITI30_COMPOSE_PORTS: host 3000 stays free; MCP is 8000", () => {
		const text = readFileSync(COMPOSE, "utf8");
		expect(text).toContain("3001:3000");
		expect(text).toContain("8000:8000");
		expect(text).toContain("6379:6379");
		expect(text).not.toMatch(/["']3000:3000["']/);
		expect(text).not.toContain("8431");
		expect(text).toContain("falkordb/falkordb");
		expect(text).toContain("zepai/knowledge-graph-mcp:standalone");
	});

	test("GRAPHITI30_NO_SECRETS_IN_COMPOSE: compose does not embed credential values", () => {
		const text = readFileSync(COMPOSE, "utf8");
		expect(text).not.toMatch(/sk-[A-Za-z0-9]/);
		expect(text).not.toMatch(/xai-[A-Za-z0-9]/);
		expect(text).toContain("${OPENAI_API_KEY:-}");
		expect(text).toContain("host.docker.internal:host-gateway");
		expect(text).toContain("config-docker-falkordb.yaml");
	});
});
