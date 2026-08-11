import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const REDACT_MODULE_URL = new URL("./redact.ts", import.meta.url).href;
const CONTRACT_LIMITS = {
	maxSerializedBytes: 65_536,
	maxNestingDepth: 16,
	maxStringLength: 4_096,
	maxArrayLength: 256,
	maxObjectKeys: 256,
} as const;

type RedactModule = {
	redactForPersistence: (input: unknown) => unknown;
	REDACTION_LIMITS_V1: Record<string, number>;
	REDACTION_MARKERS_V1: {
		secret: string;
		encoded: string;
		path: string;
		keyPrefix: string;
	};
};

type Success = {
	ok: true;
	value: unknown;
	json: string;
	redactionCount: number;
};

type Refusal = {
	ok: false;
	code: string;
};

let loadedModule: Promise<RedactModule> | undefined;

async function loadRedactor(): Promise<RedactModule> {
	loadedModule ??= import(REDACT_MODULE_URL)
		.then((module) => module as unknown as RedactModule)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			if (/cannot find|module not found|resolve/i.test(message)) {
				throw new Error("RED01_REDACTION_AUTHORITY_MISSING");
			}
			throw error;
		});
	return loadedModule;
}

async function redact(input: unknown): Promise<Success | Refusal> {
	const module = await loadRedactor();
	return module.redactForPersistence(input) as Success | Refusal;
}

function requireSuccess(result: Success | Refusal): Success {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(`expected success, received ${result.code}`);
	expect(Object.keys(result).sort()).toEqual([
		"json",
		"ok",
		"redactionCount",
		"value",
	]);
	return result;
}

function requireRefusal(result: Success | Refusal, code: string): Refusal {
	expect(result).toEqual({ ok: false, code });
	if (result.ok) throw new Error(`expected ${code} refusal`);
	return result;
}

function expectDeepFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	if (Array.isArray(value)) {
		for (const item of value) expectDeepFrozen(item);
		return;
	}
	for (const item of Object.values(value as Record<string, unknown>)) {
		expectDeepFrozen(item);
	}
}

function expectAbsent(haystack: string, needles: readonly string[]): void {
	for (const needle of needles) {
		expect(needle.length).toBeGreaterThan(0);
		expect(haystack).not.toContain(needle);
	}
}

function tokenBody(length: number): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	return Array.from({ length }, (_, index) => alphabet[index % alphabet.length]).join("");
}

function knownSyntheticSecrets(): string[] {
	return [
		`ghp_${tokenBody(36)}`,
		`github_pat_${tokenBody(48)}`,
		`glpat-${tokenBody(32)}`,
		`npm_${tokenBody(36)}`,
		`xoxb-${tokenBody(32)}`,
		`AKIA${"A1B2C3D4E5F6G7H8"}`,
		`AIza${tokenBody(35)}`,
		`sk-${tokenBody(40)}`,
		`${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
			'{"sub":"synthetic"}',
		).toString("base64url")}.${tokenBody(43)}`,
	];
}

function nestedArray(depth: number): unknown {
	let value: unknown = "safe";
	for (let index = 0; index < depth; index += 1) value = [value];
	return value;
}

function nestedObject(depth: number): unknown {
	let value: unknown = "safe";
	for (let index = 0; index < depth; index += 1) value = { value };
	return value;
}

describe("RED-01 pre-persistence redaction authority", () => {
	test("exposes the locked bounded API", async () => {
		const module = await loadRedactor();
		expect(typeof module.redactForPersistence).toBe("function");
		expect(module.redactForPersistence.length).toBe(1);
		expect(module.REDACTION_LIMITS_V1).toMatchObject(CONTRACT_LIMITS);
		expect(module.REDACTION_MARKERS_V1).toEqual({
			secret: "[REDACTED]",
			encoded: "[REDACTED:encoded]",
			path: "[REDACTED:path]",
			keyPrefix: "[REDACTED_KEY_",
		});
	});

	test("returns detached deeply frozen canonical JSON deterministically", async () => {
		const firstInput = {
			z: true,
			nested: { beta: 2, alpha: "safe" },
			array: [3, "two", false],
		};
		const secondInput = {
			array: [3, "two", false],
			nested: { alpha: "safe", beta: 2 },
			z: true,
		};
		const first = requireSuccess(await redact(firstInput));
		const second = requireSuccess(await redact(secondInput));
		expect(first.redactionCount).toBe(0);
		expect(first.json).toBe(second.json);
		expect(first.json).toBe(
			'{"array":[3,"two",false],"nested":{"alpha":"safe","beta":2},"z":true}',
		);
		expectDeepFrozen(first.value);
		firstInput.nested.alpha = "changed-after-redaction";
		expect(first.json).not.toContain("changed-after-redaction");
		expect((first.value as typeof firstInput).nested.alpha).toBe("safe");
	});

	test("redacts semantic credential fields without substring false positives", async () => {
		const raw = tokenBody(40);
		const lowEntropyFixture = ["low", "entropy", "value"].join("");
		const result = requireSuccess(
			await redact({
				password: raw,
				pass_phrase: raw,
				apiKey: raw,
				CLIENT_SECRET: raw,
				accessToken: raw,
				refresh_token: raw,
				privateKey: raw,
				secretKey: lowEntropyFixture,
				secret_key: lowEntropyFixture,
				secretAccessKey: lowEntropyFixture,
				awsSecretAccessKey: lowEntropyFixture,
				credentials: lowEntropyFixture,
				apikey: lowEntropyFixture,
				objectPassword: { nested: raw },
				listAccessToken: [raw],
				numericPrivateKey: 7,
				authorization: `Bearer ${raw}`,
				cookie: `session=${raw}`,
				maxTokens: 12_000,
				tokenBudget: 4_000,
				secretScanPassed: true,
				secretPathPolicy: "strict",
				authMode: "local",
				passwordRuleMatched: true,
			}),
		);
		const value = result.value as Record<string, unknown>;
		for (const key of [
			"password",
			"pass_phrase",
			"apiKey",
			"CLIENT_SECRET",
			"accessToken",
			"refresh_token",
			"privateKey",
			"secretKey",
			"secret_key",
			"secretAccessKey",
			"awsSecretAccessKey",
			"credentials",
			"apikey",
			"objectPassword",
			"listAccessToken",
			"numericPrivateKey",
			"authorization",
			"cookie",
		]) {
			expect(value[key]).toBe("[REDACTED]");
		}
		expect(value).toMatchObject({
			maxTokens: 12_000,
			tokenBudget: 4_000,
			secretScanPassed: true,
			secretPathPolicy: "strict",
			authMode: "local",
			passwordRuleMatched: true,
		});
		expectAbsent(result.json, [raw]);
	});

	test("redacts environment leaves and sensitive headers but retains safe names", async () => {
		const first = tokenBody(38);
		const second = tokenBody(39);
		const result = requireSuccess(
			await redact({
				env: { SERVICE_TOKEN: first, SAFE_NAME: "diagnostic-name" },
				environment: { DATABASE_URL: second },
				headers: {
					authorization: `Basic ${first}`,
					"proxy-authorization": second,
					cookie: `sid=${first}`,
					"set-cookie": `sid=${second}`,
					"content-type": "application/json",
				},
			}),
		);
		const value = result.value as Record<string, any>;
		expect(value.env).toEqual({ SAFE_NAME: "[REDACTED]", SERVICE_TOKEN: "[REDACTED]" });
		expect(value.environment).toEqual({ DATABASE_URL: "[REDACTED]" });
		expect(value.headers["content-type"]).toBe("application/json");
		for (const key of ["authorization", "proxy-authorization", "cookie", "set-cookie"]) {
			expect(value.headers[key]).toBe("[REDACTED]");
		}
		expectAbsent(result.json, [first, second]);
	});

	test("removes known token families from untyped text and nested values", async () => {
		const secrets = knownSyntheticSecrets();
		const quotedFixture = ["low", "entropy", "synthetic", "value"].join("-");
		const quotedAssignment = JSON.stringify({ password: quotedFixture });
		const assignmentValue = ["low", "entropy", "value", "99"].join("");
		const assignmentFixtures = [
			`${["secret", "Key"].join("")}=${assignmentValue}`,
			`${["secret", "key"].join("_")}=${assignmentValue}`,
			`${["aws", "Secret", "Access", "Key"].join("")}=${assignmentValue}`,
			`${["secret", "access", "key"].join("_")}=${assignmentValue}`,
			`password${String.fromCodePoint(0xff1d)}${assignmentValue}`,
		];
		const result = requireSuccess(
			await redact({
				preview: `${secrets.map((secret, index) => `item-${index}: ${secret}`).join("\n")}\n${quotedAssignment}\n${assignmentFixtures.join("\n")}`,
				commandSummary: `tool --token ${secrets[0]}`,
				nested: [secrets[1], { note: `credential=${secrets[2]}` }],
			}),
		);
		expectAbsent(result.json, [
			...secrets,
			quotedFixture,
			assignmentValue,
			...assignmentFixtures,
		]);
		expect(result.redactionCount).toBeGreaterThanOrEqual(secrets.length);
		expect(result.json).toContain("[REDACTED]");
	});

	test("removes private keys URI userinfo and credential paths while keeping safe URLs", async () => {
		const keyBody = tokenBody(64);
		const privateKey = [
			["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" "),
			keyBody,
			["-----END", "OPENSSH", "PRIVATE", "KEY-----"].join(" "),
		].join("\n");
		const uriPassword = tokenBody(28);
		const emptyUserFixture = ["short", "password"].join("-");
		const credentialPaths = [
			".ssh/id_ed25519",
			".aws/credentials",
			".npmrc",
			".netrc",
			".env.production",
			".kube/config",
			"config/service-account-key.json",
		];
		const result = requireSuccess(
			await redact({
				preview: `${privateKey}\npostgres://user:${uriPassword}@localhost/db\nhttps://:${emptyUserFixture}@example.test/db`,
				note: `${credentialPaths.join(" ")} id_ed25519`,
				authPreview: "Basic abc",
				assignmentPreview: "password=x",
				publicUrl: "https://example.test/docs?mode=safe",
			}),
		);
		expectAbsent(result.json, [
			privateKey,
			keyBody,
			uriPassword,
			emptyUserFixture,
			"id_ed25519",
			"Basic abc",
			"password=x",
			...credentialPaths,
		]);
		expect(result.json).toContain("https://example.test/docs?mode=safe");
	});

	test("redacts unknown high-entropy tokens but preserves typed UUID SHA and digest fields", async () => {
		const unknownToken = tokenBody(48);
		const uuid = "123e4567-e89b-42d3-a456-426614174000";
		const headSha = "0123456789abcdef0123456789abcdef01234567";
		const digest = "0123456789abcdef".repeat(4);
		const result = requireSuccess(
			await redact({
				preview: `opaque=${unknownToken}`,
				taskId: uuid,
				headSha,
				sha256: digest,
				message: "ordinary prose remains readable for the operator",
			}),
		);
		expect(result.json).not.toContain(unknownToken);
		expect(result.value).toMatchObject({
			taskId: uuid,
			headSha,
			sha256: digest,
			message: "ordinary prose remains readable for the operator",
		});
	});

	test("is mutation-sensitive to bounded percent base64 and base64url secret previews", async () => {
		const rawSecret = `API_KEY=sk-${tokenBody(36)}`;
		const percent = encodeURIComponent(rawSecret);
		const percentTwice = encodeURIComponent(percent);
		const base64 = Buffer.from(rawSecret).toString("base64");
		const base64url = Buffer.from(rawSecret).toString("base64url");
		const safeEncodedProse = Buffer.from("hello hello hello").toString("base64");
		const result = requireSuccess(
			await redact({ percent, percentTwice, base64, base64url, safeEncodedProse }),
		);
		expectAbsent(result.json, [rawSecret, percent, percentTwice, base64, base64url]);
		expect((result.value as Record<string, unknown>).safeEncodedProse).toBe(safeEncodedProse);
		expect(result.json).toContain("[REDACTED:encoded]");
		expect(result.redactionCount).toBe(4);
	});

	test("redacts over-limit percent wrapped-base64 and independently high-entropy encodings", async () => {
		const rawSecret = `password=sk-${tokenBody(32)}`;
		const triplePercent = encodeURIComponent(encodeURIComponent(encodeURIComponent(rawSecret)));
		const base64 = Buffer.from(rawSecret).toString("base64");
		const wrappedBase64 = base64.match(/.{1,16}/g)?.join(" ") ?? base64;
		const highEntropySafeDecode = Buffer.from(
			"The quick brown fox jumps over 13 lazy dogs.",
		).toString("base64");
		const result = requireSuccess(
			await redact({ triplePercent, wrappedBase64, highEntropySafeDecode }),
		);
		expectAbsent(result.json, [rawSecret, triplePercent, wrappedBase64, highEntropySafeDecode]);
		expect(result.redactionCount).toBe(3);
	});

	test("does not allow known or encoded secrets through safe path fields", async () => {
		const known = `ghp_${tokenBody(36)}`;
		const encoded = encodeURIComponent(`API_KEY=sk-${tokenBody(32)}`);
		const randomArtifactPath = `artifacts/${tokenBody(48)}.json`;
		const result = requireSuccess(
			await redact({
				path: `artifacts/${known}`,
				artifactPath: `artifacts/${encoded}`,
				evidenceRef: randomArtifactPath,
			}),
		);
		expectAbsent(result.json, [known, encoded]);
		expect((result.value as Record<string, unknown>).evidenceRef).toBe(randomArtifactPath);
	});

	test("redacts untyped long hex while preserving typed hashes and hash-named artifact paths", async () => {
		const longHex = ["deadbeef", "cafebabe", "01234567", "89abcdef"].join("").repeat(2);
		const artifactPath = `artifacts/${longHex}.json`;
		const result = requireSuccess(
			await redact({ preview: longHex, sha256: longHex, artifactPath }),
		);
		expect((result.value as Record<string, unknown>).preview).toBe("[REDACTED]");
		expect((result.value as Record<string, unknown>).sha256).toBe(longHex);
		expect((result.value as Record<string, unknown>).artifactPath).toBe(artifactPath);
	});

	test("avoids path and JWT false positives while redacting isolated SSH key names", async () => {
		const dottedVersion = "1234567890.1234567890.12345678901234567890";
		const result = requireSuccess(
			await redact({
				footpath: "ordinary-value",
				path: "config/my.npmrc",
				preview: dottedVersion,
				sshPreview: "copy id_ed25519 before rotation",
			}),
		);
		expect(result.value).toMatchObject({
			footpath: "ordinary-value",
			path: "config/my.npmrc",
			preview: dottedVersion,
		});
		expect(result.json).not.toContain("id_ed25519");
	});

	test("removes secret-bearing object keys with deterministic collision-safe markers", async () => {
		const secret = `sk-${tokenBody(36)}`;
		const input: Record<string, unknown> = {
			a: secret,
			b: [secret, { c: secret }],
			"[REDACTED_KEY_1]": "existing-safe-value",
		};
		input[secret] = "safe-value-under-secret-key";
		const result = requireSuccess(await redact(input));
		const value = result.value as Record<string, unknown>;
		expectAbsent(result.json, [secret]);
		expect(value["[REDACTED_KEY_1]"]).toBe("existing-safe-value");
		expect(value["[REDACTED_KEY_2]"]).toBe("safe-value-under-secret-key");
		expect(result.redactionCount).toBe(4);
		expect(input[secret]).toBe("safe-value-under-secret-key");
	});

	test("refuses cycles without echoing input", async () => {
		const raw = tokenBody(44);
		const input: Record<string, unknown> = { raw };
		input.self = input;
		requireRefusal(await redact(input), "cycle");
	});

	test("refuses accessors without invoking them", async () => {
		let invoked = 0;
		const raw = tokenBody(44);
		const input: Record<string, unknown> = {};
		Object.defineProperty(input, raw, {
			enumerable: true,
			get() {
				invoked += 1;
				throw new Error(raw);
			},
		});
		const result = await redact(input);
		requireRefusal(result, "accessor");
		expect(invoked).toBe(0);
		expect(JSON.stringify(result)).not.toContain(raw);
	});

	for (const [name, value] of [
		["function", () => undefined],
		["symbol", Symbol("synthetic")],
		["bigint", 1n],
		["date", new Date(0)],
		["map", new Map()],
		["set", new Set()],
		["regexp", /safe/],
		["error", new Error("synthetic")],
		["class instance", new (class Synthetic {})()],
		["positive infinity", Number.POSITIVE_INFINITY],
		["NaN", Number.NaN],
	] as const) {
		test(`refuses unsupported ${name} values`, async () => {
			requireRefusal(await redact({ value }), "unsupported-type");
		});
	}

	test("refuses prototype-pollution data keys", async () => {
		for (const key of ["__proto__", "prototype", "constructor"]) {
			const input: Record<string, unknown> = {};
			Object.defineProperty(input, key, { value: "synthetic", enumerable: true });
			requireRefusal(await redact(input), "unsafe-key");
		}
	});

	test("converts hostile proxy failures into non-echoing refusals", async () => {
		const raw = tokenBody(44);
		const input = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error(raw);
			},
			},
		);
		const result = await redact(input);
		requireRefusal(result, "hostile-object");
		expect(JSON.stringify(result)).not.toContain(raw);
	});

	test("refuses binary values and array subclasses without previews", async () => {
		class SyntheticArray extends Array<unknown> {}
		requireRefusal(await redact(new SyntheticArray("safe")), "unsupported-type");
		const binaries: unknown[] = [
			Buffer.from("synthetic"),
			new ArrayBuffer(4),
			new DataView(new ArrayBuffer(4)),
			new Uint8Array([1, 2, 3]),
		];
		if (typeof SharedArrayBuffer !== "undefined") binaries.push(new SharedArrayBuffer(4));
		for (const binary of binaries) requireRefusal(await redact({ binary }), "binary");
	});

	test("accepts exact structural boundaries and rejects boundary plus one", async () => {
		requireSuccess(await redact({ value: "x".repeat(CONTRACT_LIMITS.maxStringLength) }));
		requireRefusal(
			await redact({ value: "x".repeat(CONTRACT_LIMITS.maxStringLength + 1) }),
			"max-string",
		);
		requireSuccess(await redact(nestedArray(CONTRACT_LIMITS.maxNestingDepth)));
		requireRefusal(
			await redact(nestedArray(CONTRACT_LIMITS.maxNestingDepth + 1)),
			"max-depth",
		);
		requireSuccess(await redact(nestedObject(CONTRACT_LIMITS.maxNestingDepth)));
		requireRefusal(
			await redact(nestedObject(CONTRACT_LIMITS.maxNestingDepth + 1)),
			"max-depth",
		);
		requireSuccess(await redact(Array(CONTRACT_LIMITS.maxArrayLength).fill(null)));
		requireRefusal(
			await redact(Array(CONTRACT_LIMITS.maxArrayLength + 1).fill(null)),
			"max-array",
		);
		const exactObject = Object.fromEntries(
			Array.from({ length: CONTRACT_LIMITS.maxObjectKeys }, (_, index) => [`k${index}`, null]),
		);
		const oversizedObject = { ...exactObject, overflow: null };
		requireSuccess(await redact(exactObject));
		requireRefusal(await redact(oversizedObject), "max-object-keys");
	});

	test("distinguishes total input and canonical output byte refusals", async () => {
		const outputOnly = Object.fromEntries(
			Array.from({ length: 256 }, (_, index) => [
				`k${index.toString().padStart(3, "0")}`,
				"z".repeat(250),
			]),
		);
		const inputTooLarge = Object.fromEntries(
			Array.from({ length: 256 }, (_, index) => [
				`k${index.toString().padStart(3, "0")}`,
				"z".repeat(255),
			]),
		);
		requireRefusal(await redact(outputOnly), "max-output-bytes");
		requireRefusal(await redact(inputTooLarge), "max-input-bytes");
	});

	test("preserves safe path and hash references while replacing unsafe paths", async () => {
		const headSha = "0123456789abcdef0123456789abcdef01234567";
		const digest = "0123456789abcdef".repeat(4);
		const unsafePaths = {
			absolutePath: "/Users/synthetic/.config/tool/config.json",
			homePath: "~/.config/tool/config.json",
			traversalPath: "../outside.json",
			globPath: "artifacts/**/*.json",
			nulPath: "artifacts/safe\0secret.json",
			credentialPath: ".ssh/id_ed25519",
		};
		const result = requireSuccess(
			await redact({
				path: "docs/report.json",
				artifactPath: "artifacts/run-1/result.json",
				evidenceRef: "artifacts/run-1/evidence.json",
				headSha,
				sha256: digest,
				...unsafePaths,
			}),
		);
		const value = result.value as Record<string, unknown>;
		expect(value).toMatchObject({
			path: "docs/report.json",
			artifactPath: "artifacts/run-1/result.json",
			evidenceRef: "artifacts/run-1/evidence.json",
			headSha,
			sha256: digest,
		});
		for (const key of Object.keys(unsafePaths)) expect(value[key]).toBe("[REDACTED:path]");
		expectAbsent(result.json, Object.values(unsafePaths));
	});

	test("never exposes bytes for refused candidates or unsafe fallback exports", async () => {
		const module = await loadRedactor();
		const refusal = await redact({ binary: new Uint8Array([1]) });
		requireRefusal(refusal, "binary");
		for (const name of Object.keys(module)) {
			expect(name).not.toMatch(/unsafe|force|rawFallback|disableRedaction/i);
		}
	});

	test("contains no persistence or ambient-authority sink", () => {
		const source = readFileSync(new URL("./redact.ts", import.meta.url), "utf8");
		expect(source).not.toMatch(/\b(?:appendFile|writeFile|createWriteStream|process\.env|fetch\s*\(|spawn\s*\(|exec\s*\()/);
		expect(source).not.toMatch(/\b(?:Date\.now|new\s+Date)\b/);
	});
});
