/**
 * CON-01 — hostile object safety (R2) and published bounds (R3) + path policy (R4).
 */
import { describe, expect, test } from "bun:test";
import {
	CON01_P0_FAILURE_SIGNATURE,
	CustomClassFromValid,
	EXPECTED_LIMITS_V1,
	SAFE_PATHS,
	UNSAFE_PATHS,
	accessorTrapFromValid,
	bigintFieldFromValid,
	countDistinctInvalidPathsInOverProduction,
	cyclicGraphFromValid,
	depthExactLimitGraph,
	depthExceedingGraph,
	exactLengthSafePath,
	expectAccepted,
	expectRejected,
	functionFieldFromValid,
	loadContractsModule,
	minimalRoleRequest,
	minimalRoleResult,
	nonFiniteFromValid,
	overProductionInvalidFixture,
	protoPollutionFromValid,
	requireContracts,
	requireExport,
	requireFn,
	roleResultParseOkRenderOversize,
	roleResultWithExactSerializedSize,
	sparseArrayFromValid,
	symbolFieldFromValid,
} from "./contracts.shared.test.ts";

describe("CON-01 hostile object safety", () => {
	test("rejects accessors without invoking getters and leaves Object.prototype intact", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const beforeProto = Object.getOwnPropertyDescriptor(Object.prototype, "polluted");
		expect(beforeProto).toBeUndefined();

		const trap = accessorTrapFromValid();
		const result = parse(trap.obj);
		expectRejected(result, "E6 accessor properties rejected", /accessor|function|unsafe|object|type/i);
		expect(
			trap.wasGetterInvoked(),
			`${CON01_P0_FAILURE_SIGNATURE}: getter must never be invoked`,
		).toBe(false);

		// P0-R1: real own enumerable __proto__ data property on complete fixture
		const polluted = protoPollutionFromValid();
		expect(
			Object.prototype.hasOwnProperty.call(polluted, "__proto__"),
			`${CON01_P0_FAILURE_SIGNATURE}: __proto__ must be own key`,
		).toBe(true);
		const ownProto = Object.getOwnPropertyDescriptor(polluted, "__proto__");
		expect(ownProto?.enumerable, "__proto__ enumerable data").toBe(true);
		expect(ownProto && "value" in ownProto, "__proto__ data property").toBe(true);
		expect(ownProto?.value).toEqual({ polluted: true });
		expect(Object.getPrototypeOf(polluted)).toBe(Object.prototype);
		expect(Object.getOwnPropertyDescriptor(Object.prototype, "polluted")).toBeUndefined();

		expectRejected(
			parse(polluted),
			"E5 proto pollution shaped input with own __proto__",
			/proto|prototype|unsafe|unknown|dangerous|key/i,
		);

		// After parse: prototype chain and Object.prototype remain clean
		expect(Object.getPrototypeOf(polluted)).toBe(Object.prototype);
		expect(Object.getOwnPropertyDescriptor(Object.prototype, "polluted")).toBeUndefined();
		expect(
			Object.prototype,
			`${CON01_P0_FAILURE_SIGNATURE}: Object.prototype must remain unchanged after parse`,
		).not.toHaveProperty("polluted");
		// @ts-expect-error intentional probe
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();

		// Dangerous own keys on complete fixtures (defineProperty for __proto__)
		for (const key of ["__proto__", "prototype", "constructor"] as const) {
			const o = minimalRoleRequest();
			Object.defineProperty(o, key, {
				value: { evil: true },
				enumerable: true,
				configurable: true,
				writable: true,
			});
			expect(Object.prototype.hasOwnProperty.call(o, key), `own key ${key}`).toBe(true);
			expectRejected(
				parse(o),
				`dangerous own key ${key}`,
				/proto|prototype|constructor|unsafe|key|unknown/i,
			);
			expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
			expect(Object.getOwnPropertyDescriptor(Object.prototype, "evil")).toBeUndefined();
		}
	});

	test("rejects functions, symbols, bigint, non-finite, cycles, sparse, custom classes from complete fixtures", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		expectRejected(parse(functionFieldFromValid()), "function value", /function|unsafe|type/i);
		expectRejected(parse(symbolFieldFromValid()), "symbol value", /symbol|unsafe|type/i);
		expectRejected(parse(bigintFieldFromValid()), "bigint value", /bigint|unsafe|type/i);
		expectRejected(
			parse(nonFiniteFromValid("nan")),
			"NaN on complete fixture",
			/finite|number|unsafe|type|bound/i,
		);
		expectRejected(
			parse(nonFiniteFromValid("infinity")),
			"Infinity on complete fixture",
			/finite|number|unsafe|type|bound/i,
		);
		expectRejected(parse(cyclicGraphFromValid()), "E7 cycle from valid", /cycle|circular|unsafe|depth/i);
		expectRejected(
			parse(sparseArrayFromValid()),
			"E7 sparse array from valid",
			/sparse|array|unsafe|type/i,
		);
		expectRejected(
			parse(new CustomClassFromValid()),
			"E7 custom class from valid",
			/prototype|class|unsafe|plain|object/i,
		);
	});

	test("maxNestingDepth+1 fails with stable bound issue; exact depth does not use bound shortcut", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		// Over limit: pure nesting graph — must report a bound issue (not merely unknown-field).
		const over = depthExceedingGraph(1);
		const overResult = parse(over);
		expectRejected(overResult, "E8/E11 maxNestingDepth+1", /bound/i);
		const overBlob = overResult.issues.map((i) => `${i.code} ${i.message}`).join(" ");
		expect(
			/bound/i.test(overBlob),
			`${CON01_P0_FAILURE_SIGNATURE}: depth+1 must be bound_exceeded-class, got ${overBlob}`,
		).toBe(true);
		// Must not be ONLY an unknown-field rejection without bound.
		expect(
			/bound/i.test(overBlob),
			"depth oracle requires bound code present",
		).toBe(true);

		// Exact limit depth: may fail as invalid contract/kind, but NOT for exceeding depth bound.
		const at = depthExactLimitGraph();
		const atResult = parse(at);
		expect(atResult.ok, "exact depth pure nest is not a valid contract").toBe(false);
		if (!atResult.ok) {
			const atBlob = atResult.issues.map((i) => `${i.code} ${i.message}`).join(" ");
			expect(
				/bound_exceeded|exceed.*depth|depth.*exceed|maxNestingDepth/i.test(atBlob),
				`${CON01_P0_FAILURE_SIGNATURE}: exact maxNestingDepth must not fail for depth exceed; got ${atBlob}`,
			).toBe(false);
		}

		// Positive under-limit control: minimal valid fixture depth << max.
		expectAccepted(parse(minimalRoleRequest()), "valid fixture within nesting depth");
	});
});

describe("CON-01 published bounds", () => {
	test("every advertised limit has exact-limit accept and limit+1 reject", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const render = requireFn(mod, "renderContractMarkdownV1", "renderContractMarkdownV1");
		const limits = requireExport(mod, "CONTRACT_LIMITS_V1", "limits") as Record<string, number>;

		for (const [k, n] of Object.entries(EXPECTED_LIMITS_V1)) {
			expect(limits[k], `published limit ${k}`).toBe(n);
		}

		// ── maxStringLength ─────────────────────────────────────────────
		const exactStr = {
			...minimalRoleRequest(),
			goal: "g".repeat(EXPECTED_LIMITS_V1.maxStringLength),
		};
		expectAccepted(parse(exactStr), "exact maxStringLength accept");
		expectRejected(
			parse({
				...minimalRoleRequest(),
				goal: "g".repeat(EXPECTED_LIMITS_V1.maxStringLength + 1),
			}),
			"maxStringLength+1 reject",
			/bound|string|length/i,
		);

		// ── maxPathLength ───────────────────────────────────────────────
		const exactPath = exactLengthSafePath(EXPECTED_LIMITS_V1.maxPathLength);
		expect(exactPath.length).toBe(EXPECTED_LIMITS_V1.maxPathLength);
		expectAccepted(
			parse({ ...minimalRoleRequest(), ownedPaths: [exactPath], forbiddenPaths: [] }),
			"exact maxPathLength accept",
		);
		expectRejected(
			parse({
				...minimalRoleRequest(),
				ownedPaths: [exactLengthSafePath(EXPECTED_LIMITS_V1.maxPathLength + 1)],
				forbiddenPaths: [],
			}),
			"maxPathLength+1 reject",
			/bound|path|length/i,
		);

		// ── maxCommandLength ────────────────────────────────────────────
		expectAccepted(
			parse(
				minimalRoleResult({
					commands: [
						{
							command: "c".repeat(EXPECTED_LIMITS_V1.maxCommandLength),
							exitCode: 1,
							summary: "ok",
						},
					],
				}),
			),
			"exact maxCommandLength accept",
		);
		expectRejected(
			parse(
				minimalRoleResult({
					commands: [
						{
							command: "c".repeat(EXPECTED_LIMITS_V1.maxCommandLength + 1),
							exitCode: 1,
							summary: "ok",
						},
					],
				}),
			),
			"maxCommandLength+1 reject",
			/bound|command|length/i,
		);

		// ── maxCommandSummaryLength ─────────────────────────────────────
		expectAccepted(
			parse(
				minimalRoleResult({
					commands: [
						{
							command: "bun test",
							exitCode: 1,
							summary: "s".repeat(EXPECTED_LIMITS_V1.maxCommandSummaryLength),
						},
					],
				}),
			),
			"exact maxCommandSummaryLength accept",
		);
		expectRejected(
			parse(
				minimalRoleResult({
					commands: [
						{
							command: "bun test",
							exitCode: 1,
							summary: "s".repeat(EXPECTED_LIMITS_V1.maxCommandSummaryLength + 1),
						},
					],
				}),
			),
			"maxCommandSummaryLength+1 reject",
			/bound|summary|string|length|command/i,
		);

		// ── maxArrayLength ──────────────────────────────────────────────
		const exactArr = Array.from(
			{ length: EXPECTED_LIMITS_V1.maxArrayLength },
			(_, i) => `docs/p-${i}.md`,
		);
		expectAccepted(
			parse({
				...minimalRoleRequest(),
				ownedPaths: exactArr,
				forbiddenPaths: [],
			}),
			"exact maxArrayLength accept",
		);
		expectRejected(
			parse({
				...minimalRoleRequest(),
				ownedPaths: Array.from(
					{ length: EXPECTED_LIMITS_V1.maxArrayLength + 1 },
					(_, i) => `docs/p-${i}.md`,
				),
				forbiddenPaths: [],
			}),
			"maxArrayLength+1 reject",
			/bound|array|length/i,
		);

		// ── maxSerializedBytes ──────────────────────────────────────────
		// Pad residualRisks on a valid blocked result to exact serialized size.
		const exactSer = roleResultWithExactSerializedSize(EXPECTED_LIMITS_V1.maxSerializedBytes);
		expect(
			exactSer !== null,
			`${CON01_P0_FAILURE_SIGNATURE}: must construct exact maxSerializedBytes fixture`,
		).toBe(true);
		expect(JSON.stringify(exactSer!).length).toBe(EXPECTED_LIMITS_V1.maxSerializedBytes);
		expectAccepted(parse(exactSer!), "exact maxSerializedBytes accept");
		const overSer = roleResultWithExactSerializedSize(EXPECTED_LIMITS_V1.maxSerializedBytes + 1);
		if (overSer) {
			expect(JSON.stringify(overSer).length).toBe(EXPECTED_LIMITS_V1.maxSerializedBytes + 1);
			expectRejected(parse(overSer), "maxSerializedBytes+1 reject", /bound|bytes|size|serial/i);
		} else {
			// Fallback: take exact fixture and append one residual char via an extra risk byte.
			const risks = [...((exactSer!.residualRisks as string[]) ?? [])];
			if (risks.length === 0) risks.push("x");
			else risks[risks.length - 1] = `${risks[risks.length - 1]}x`;
			const bumped = { ...exactSer!, residualRisks: risks };
			expect(JSON.stringify(bumped).length).toBeGreaterThan(EXPECTED_LIMITS_V1.maxSerializedBytes);
			expectRejected(parse(bumped), "maxSerializedBytes+ reject", /bound|bytes|size|serial/i);
		}

		// ── maxNestingDepth (see dedicated test; re-assert bound class here) ─
		expectRejected(parse(depthExceedingGraph(1)), "maxNestingDepth+1 bound", /bound/i);
		expectAccepted(parse(minimalRoleRequest()), "nesting under limit accept");

		// ── maxIssues: over-production (> maxIssues distinct invalid paths) ─
		const potentialIssues = countDistinctInvalidPathsInOverProduction();
		expect(potentialIssues).toBeGreaterThan(EXPECTED_LIMITS_V1.maxIssues);
		const manyBad = overProductionInvalidFixture();
		// Prove fixture carries more than maxIssues distinct unknown keys alone.
		const extraKeys = Object.keys(manyBad).filter((k) => k.startsWith("extraField_"));
		expect(extraKeys.length).toBeGreaterThan(EXPECTED_LIMITS_V1.maxIssues);
		const manyResult = parse(manyBad);
		expectRejected(
			manyResult,
			"maxIssues over-production capped with bound/cap issue",
			/bound|cap|issues|maxIssues|too many/i,
		);
		expect(manyResult.issues.length).toBeGreaterThan(0);
		expect(
			manyResult.issues.length,
			`${CON01_P0_FAILURE_SIGNATURE}: issues must never exceed maxIssues (no unbounded dump)`,
		).toBeLessThanOrEqual(EXPECTED_LIMITS_V1.maxIssues);
		// Stable bound/cap signal required — silent truncation without bound issue is forbidden.
		const issueBlob = manyResult.issues.map((i) => `${i.code} ${i.message}`).join(" | ");
		expect(
			/bound|cap|issues|maxIssues|too many/i.test(issueBlob),
			`${CON01_P0_FAILURE_SIGNATURE}: over-production must report bound/cap issue, got ${issueBlob}`,
		).toBe(true);

		// ── maxRenderedMarkdownBytes ────────────────────────────────────
		// Accept: normal validated render under limit.
		const okParsed = parse(minimalRoleResult({ status: "blocked", blockers: ["x"] }));
		expectAccepted(okParsed, "render bound under-limit fixture");
		const mdOk = render(okParsed.value);
		expect(typeof mdOk).toBe("string");
		expect(mdOk.length).toBeGreaterThan(0);
		expect(mdOk.length).toBeLessThanOrEqual(EXPECTED_LIMITS_V1.maxRenderedMarkdownBytes);

		// P1-R1: dedicated parse-accepted fixture; render must refuse oversize (not parse-time).
		const renderOverFixture = roleResultParseOkRenderOversize();
		const contentLen = (renderOverFixture.residualRisks as string[]).join("").length;
		const serLen = JSON.stringify(renderOverFixture).length;
		expect(contentLen).toBeGreaterThan(EXPECTED_LIMITS_V1.maxRenderedMarkdownBytes);
		expect(serLen).toBeLessThanOrEqual(EXPECTED_LIMITS_V1.maxSerializedBytes);

		const overParsed = parse(renderOverFixture);
		expectAccepted(
			overParsed,
			`${CON01_P0_FAILURE_SIGNATURE}: P1-R1 fixture must parse (render-bound oracle; parse reject does not count)`,
		);

		let renderRefused = false;
		let emitted: string | undefined;
		try {
			const out = render(overParsed.value);
			if (
				out !== null &&
				typeof out === "object" &&
				"ok" in (out as object) &&
				(out as { ok: boolean }).ok === false
			) {
				renderRefused = true;
				const issues = (out as { issues?: Array<{ code: string; message: string }> }).issues ?? [];
				const blob = issues.map((i) => `${i.code} ${i.message}`).join(" | ");
				expect(
					/bound|render|markdown|size|bytes/i.test(blob),
					`${CON01_P0_FAILURE_SIGNATURE}: render Result refuse must carry bound issue, got ${blob}`,
				).toBe(true);
			} else if (typeof out === "string") {
				emitted = out;
			}
		} catch {
			renderRefused = true; // throw at render = refuse
		}
		if (emitted !== undefined) {
			expect(
				false,
				`${CON01_P0_FAILURE_SIGNATURE}: P1-R1 render must refuse oversize markdown, emitted len=${emitted.length}`,
			).toBe(true);
		}
		expect(
			renderRefused,
			`${CON01_P0_FAILURE_SIGNATURE}: P1-R1 validated render over maxRenderedMarkdownBytes must fail at render`,
		).toBe(true);
	});
});

describe("CON-01 path policy", () => {
	test("accepts safe repository-relative paths and denies traversal/absolute/drive/UNC/secret basenames", async () => {
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

		// Explicit drive / UNC matrix (critic P0/P1).
		for (const p of ["C:/outside", "c:/outside", "C:\\outside", "c:\\outside", "\\\\server\\share", "//host/share/x"]) {
			expect(isSafe(p), `drive/UNC deny ${p}`).toBe(false);
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
				artifacts: [{ path: "C:/secret", mediaType: "text/plain" }],
			}),
			"artifact Windows drive",
			/path|artifact|safe|drive|absolute/i,
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
