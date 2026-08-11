/**
 * CON-01 safe repository-relative path policy (structural only).
 * Filesystem realpath / symlink authority remains SEC-00 / ISO-01.
 *
 * Concrete refs (artifacts/owned/changed/evidence/scoped) use isSafeRepoRelativePath
 * and reject every glob. ValidationContract.forbiddenProductionPathsBeforeRed uses
 * isSafeValidationGlobPath (exactly one non-bare trailing double-star segment only).
 */

import { CONTRACT_LIMITS_V1 } from "./limits.ts";

/** Exact secret-shaped basenames denied as credential leaves. */
const SECRET_BASENAME_EXACT = new Set([
	".env",
	".envrc",
	".env.local",
	".env.development",
	".env.production",
	".env.test",
	".npmrc",
	".netrc",
	"auth.json",
	"credentials.json",
	"service-account.json",
	"id_rsa",
	"id_dsa",
	"id_ecdsa",
	"id_ed25519",
	"private.pem",
	"private.key",
	"secret.key",
]);

/**
 * Secret leaf policy (basename only):
 * - deny exact credential basenames
 * - deny .env / .env.* / .envrc leaves
 * - deny credential-stem + recognized secret extension (+ optional further suffixes)
 *   e.g. auth.json, auth.json.bak, credentials.yaml.enc, service-account.json
 * - deny private/secret key and id_* key leaves (+ optional suffixes)
 * - do NOT blanket-deny multi-dot source leaves (auth.module.ts, credentials.client.ts,
 *   secrets.service.ts, auth.config.ts) — only a recognized secret ext after the stem counts
 * - do NOT deny directory segments named auth/secrets or ordinary auth.ts / auth-model.md
 */
function isSecretLeafBasename(name: string): boolean {
	if (!name) return false;
	if (SECRET_BASENAME_EXACT.has(name)) return true;

	// .env family including .envrc and .env.<anything>
	if (name === ".envrc" || name === ".env" || name.startsWith(".env.")) return true;

	// id_* private key leaves (+ optional suffix)
	if (/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..+)?$/i.test(name)) return true;

	// private/secret key material leaves (+ optional extra extensions)
	if (/^(?:private|secret)\.(?:pem|key)(?:\..+)?$/i.test(name)) return true;
	if (/\.(?:pem|key|p12|pfx|jks)(?:\..+)?$/i.test(name) && /(?:private|secret|id_)/i.test(name)) {
		return true;
	}

	// Credential stem + recognized secret/config extension immediately after the stem.
	// Optional further suffixes allowed (auth.json.bak, credentials.yaml.enc).
	// Ordinary multi-dot source leaves (auth.module.ts, auth.config.ts, credentials.client.ts)
	// do not match — "config" / "module" / "client" / "service" are not secret exts.
	// Use a regex literal (not template new RegExp) so "\." stays a literal dot.
	if (
		/^(?:auth|credentials|secrets?|service-account)\.(?:json|ya?ml|toml|ini|conf|cfg|env|pem|key|p12|pfx|jks)(?:\..+)?$/i.test(
			name,
		)
	) {
		return true;
	}

	return false;
}

function hasControlOrNul(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c === 0 || c < 0x20 || c === 0x7f) return true;
	}
	return false;
}

function basenameOf(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1] ?? path;
}

/**
 * Shared structural checks for repo-relative paths (no glob handling).
 * Returns false if fundamentally unsafe; does not inspect secret leaves or globs.
 */
function baseRepoRelativeOk(path: unknown): path is string {
	if (typeof path !== "string") return false;
	if (path.length === 0) return false;
	if (path.length > CONTRACT_LIMITS_V1.maxPathLength) return false;
	if (hasControlOrNul(path)) return false;

	// Backslash / Windows separators / ambiguity
	if (path.includes("\\")) return false;

	// Home expansion
	if (path.startsWith("~")) return false;

	// URI / scheme forms
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false;

	// Absolute POSIX
	if (path.startsWith("/")) return false;

	// UNC //server/share
	if (path.startsWith("//")) return false;

	// Windows drive (C:/ or c:)
	if (/^[a-zA-Z]:/.test(path)) return false;

	// NFC normalization — reject if not already NFC (no silent rewrite of authoritative refs)
	let nfc: string;
	try {
		nfc = path.normalize("NFC");
	} catch {
		return false;
	}
	if (nfc !== path) return false;

	// Exact `.` / `..`
	if (path === "." || path === "..") return false;

	const segments = path.split("/");
	// Empty segments (leading/trailing/duplicate slashes) — reject
	if (segments.some((s) => s.length === 0)) return false;

	for (const seg of segments) {
		if (seg === "." || seg === "..") return false;
	}

	return true;
}

function hasAnyGlobMeta(path: string): boolean {
	return path.includes("*") || path.includes("?") || path.includes("[");
}

/**
 * Structural path policy for authoritative artifact/owned/changed/evidence/scoped refs.
 * Glob-free: rejects every `*`, `?`, `[`, and `**`.
 * Secret policy applies to the leaf basename only (directories like auth/secrets are allowed).
 */
export function isSafeRepoRelativePath(path: unknown): boolean {
	if (!baseRepoRelativeOk(path)) return false;
	if (hasAnyGlobMeta(path)) return false;

	const base = basenameOf(path);
	if (isSecretLeafBasename(base)) return false;

	return true;
}

/**
 * Validation-only glob path for ValidationContractV1.forbiddenProductionPathsBeforeRed.
 * Allows exactly one non-bare trailing double-star segment (e.g. docs/**, not bare **).
 * Still enforces structural safety and secret leaf denial on the concrete prefix leaf.
 */
export function isSafeValidationGlobPath(path: unknown): boolean {
	if (!baseRepoRelativeOk(path)) return false;

	const segments = path.split("/");

	// Exactly one trailing `**`, and it must not be the only segment (non-bare).
	if (segments.length < 2) return false;
	if (segments[segments.length - 1] !== "**") return false;

	// Prefix segments: no glob meta at all.
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i]!;
		if (seg.includes("*") || seg.includes("?") || seg.includes("[")) return false;
		if (seg === "**") return false;
	}

	// No extra `**` or other glob forms after the trailing rule.
	// (Already enforced: only last segment is ** and prefix has no *.)

	// Secret leaf on the last concrete segment of the prefix (e.g. secrets/ + ** is ok as a dir;
	// .env/ + ** or auth.json/ + ** would be secret-shaped leaves used as dirs — still deny).
	const leaf = segments[segments.length - 2]!;
	if (isSecretLeafBasename(leaf)) return false;

	return true;
}

export function assertSafeRepoRelativePath(path: unknown): string {
	if (!isSafeRepoRelativePath(path)) {
		throw new Error(
			`unsafe repository-relative path: ${typeof path === "string" ? JSON.stringify(path) : typeof path}`,
		);
	}
	return path as string;
}
