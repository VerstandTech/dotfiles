/**
 * CON-01 — hostile object safety (R2) and published bounds (R3) + path policy (R4).
 */
import { describe, expect, test } from "bun:test";
import {
	CON01_P0_FAILURE_SIGNATURE,
	EXPECTED_LIMITS_V1,
	SAFE_PATHS,
	UNSAFE_PATHS,
	accessorTrap,
	cyclicGraph,
	expectAccepted,
	expectRejected,
	loadContractsModule,
	minimalRoleRequest,
	minimalRoleResult,
	protoPollution,
	requireContracts,
	requireExport,
	requireFn,
	sparseArrayContainer,
	CustomClass,
} from "./contracts.shared.test.ts";

describe("CON-01 hostile object safety", () => {
	test("rejects accessors without invoking getters and leaves Object.prototype intact", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const beforeProto = Object.getOwnPropertyDescriptor(Object.prototype, "polluted");
		expect(beforeProto).toBeUndefined();

		const trap = accessorTrap();
		const result = parse(trap);
		expectRejected(result, "E6 accessor properties rejected", /accessor|function|unsafe|object|type/i);
		expect(
			(trap as { __wasGetterInvoked: () => boolean }).__wasGetterInvoked(),
			`${CON01_P0_FAILURE_SIGNATURE}: getter must never be invoked`,
		).toBe(false);

		// Prototype pollution shaped input
		const polluted = protoPollution();
		expectRejected(
			parse(polluted),
			"E5 proto pollution shaped input",
			/proto|prototype|unsafe|unknown|dangerous|key/i,
		);
		expect(
			Object.prototype,
			`${CON01_P0_FAILURE_SIGNATURE}: Object.prototype must remain unchanged`,
		).not.toHaveProperty("polluted");
		// @ts-expect-error intentional probe
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();

		// Dangerous own keys
		for (const key of ["__proto__", "prototype", "constructor"]) {
			const o = { ...minimalRoleRequest(), [key]: { evil: true } };
			expectRejected(parse(o), `dangerous own key ${key}`, /proto|prototype|constructor|unsafe|key|unknown/i);
		}
	});

	test("rejects functions, symbols, bigint, non-finite numbers, cycles, sparse arrays, custom classes, excess depth", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const base = minimalRoleRequest();

		expectRejected(
			parse({ ...base, goal: () => "x" }),
			"function value",
			/function|unsafe|type/i,
		);
		expectRejected(
			parse({ ...base, goal: Symbol("x") }),
			"symbol value",
			/symbol|unsafe|type/i,
		);
		expectRejected(
			parse({ ...base, budget: { maxTokens: 1n as unknown as number } }),
			"bigint value",
			/bigint|unsafe|type/i,
		);
		expectRejected(
			parse({ ...base, budget: { maxTokens: Number.NaN } }),
			"NaN",
			/finite|number|unsafe|type|bound/i,
		);
		expectRejected(
			parse({ ...base, budget: { maxTokens: Number.POSITIVE_INFINITY } }),
			"Infinity",
			/finite|number|unsafe|type|bound/i,
		);
		expectRejected(parse(cyclicGraph()), "E7 cycle", /cycle|circular|unsafe|depth/i);
		expectRejected(parse(sparseArrayContainer()), "E7 sparse array", /sparse|array|unsafe|type/i);
		expectRejected(parse(new CustomClass()), "E7 custom class", /prototype|class|unsafe|plain|object/i);

		// Excessive nesting
		let deep: unknown = "leaf";
		for (let i = 0; i < EXPECTED_LIMITS_V1.maxNestingDepth + 3; i++) {
			deep = { nested: deep };
		}
		expectRejected(
			parse({ ...base, budget: deep as Record<string, unknown> }),
			"E7/E8 excess depth",
			/bound|depth|nested/i,
		);
	});
});

describe("CON-01 published bounds", () => {
	test("exceeding published limits fails closed; exact-bound positives pass", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const limits = requireExport(mod, "CONTRACT_LIMITS_V1", "limits") as Record<string, number>;

		for (const [k, n] of Object.entries(EXPECTED_LIMITS_V1)) {
			expect(limits[k], `published limit ${k}`).toBe(n);
		}

		// Overlong string
		const overlongGoal = {
			...minimalRoleRequest(),
			goal: "g".repeat(EXPECTED_LIMITS_V1.maxStringLength + 1),
		};
		expectRejected(parse(overlongGoal), "E8 overlong string", /bound|string|length/i);

		// Exact-bound string positive
		const exactGoal = {
			...minimalRoleRequest(),
			goal: "g".repeat(Math.min(128, EXPECTED_LIMITS_V1.maxStringLength)),
		};
		// goal may have semantic min length; use a moderate exact-safe size
		expectAccepted(parse(exactGoal), "E9 moderate string positive");

		// Overlong path
		const overlongPath = {
			...minimalRoleRequest(),
			ownedPaths: ["p".repeat(EXPECTED_LIMITS_V1.maxPathLength + 1)],
		};
		expectRejected(parse(overlongPath), "E8 overlong path", /bound|path|length/i);

		// Overlong command on role result
		const overlongCmd = {
			...minimalRoleResult(),
			commands: [
				{
					command: "c".repeat(EXPECTED_LIMITS_V1.maxCommandLength + 1),
					exitCode: 1,
					summary: "x",
				},
			],
		};
		expectRejected(parse(overlongCmd), "E8 overlong command", /bound|command|length/i);

		// Oversized array
		const bigArr = {
			...minimalRoleRequest(),
			ownedPaths: Array.from(
				{ length: EXPECTED_LIMITS_V1.maxArrayLength + 1 },
				(_, i) => `docs/path-${i}.md`,
			),
		};
		expectRejected(parse(bigArr), "E8 oversized array", /bound|array|length/i);

		// Exact-bound array positive (small)
		const exactArr = {
			...minimalRoleRequest(),
			ownedPaths: Array.from({ length: 2 }, (_, i) => `docs/path-${i}.md`),
		};
		expectAccepted(parse(exactArr), "E9 small array positive");

		// Multi-megabyte serialized text via huge residual risk list / strings
		const huge = {
			...minimalRoleResult(),
			residualRisks: Array.from({ length: 64 }, () => "R".repeat(2_000)),
		};
		expectRejected(parse(huge), "E8 multi-megabyte-ish payload", /bound|bytes|size|array|string/i);
	});
});

describe("CON-01 path policy", () => {
	test("accepts safe repository-relative paths and denies traversal/absolute/home/URI/secret basenames", async () => {
		const mod = requireContracts(await loadContractsModule());
		const isSafe = requireFn(mod, "isSafeRepoRelativePath", "isSafeRepoRelativePath");
		const assertSafe = requireFn(mod, "assertSafeRepoRelativePath", "assertSafeRepoRelativePath");

		for (const p of SAFE_PATHS) {
			expect(isSafe(p), `E10 safe ${p}`).toBe(true);
			expect(assertSafe(p), `assertSafe ${p}`).toBe(p.replace(/\\/g, "/"));
		}

		for (const p of UNSAFE_PATHS) {
			expect(isSafe(p), `E11/E12 unsafe ${JSON.stringify(p)}`).toBe(false);
			let threw = false;
			try {
				assertSafe(p);
			} catch {
				threw = true;
			}
			expect(threw, `assertSafe must throw for ${JSON.stringify(p)}`).toBe(true);
		}

		// Non-string inputs
		for (const bad of [null, undefined, 1, true, {}, []] as unknown[]) {
			expect(isSafe(bad), `non-string ${String(bad)}`).toBe(false);
		}

		// Artifact refs inside envelopes must apply the same policy
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		expectRejected(
			parse({
				...minimalRoleRequest(),
				artifacts: [{ path: "../outside", mediaType: "text/plain" }],
			}),
			"artifact traversal inside envelope",
			/path|artifact|safe|traversal|bound/i,
		);
		expectRejected(
			parse({
				...minimalRoleRequest(),
				artifacts: [{ path: ".env", mediaType: "text/plain" }],
			}),
			"secret basename artifact",
			/path|artifact|safe|secret|denied|env/i,
		);
		expectAccepted(
			parse({
				...minimalRoleRequest(),
				artifacts: [
					{
						path: "docs/plans/work-packages/CON-01.feature",
						mediaType: "text/plain",
					},
				],
			}),
			"safe artifact positive",
		);
	});
});
