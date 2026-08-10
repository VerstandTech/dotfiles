/**
 * CON-01 safe repository-relative path policy (structural only).
 * Filesystem realpath / symlink authority remains SEC-00 / ISO-01.
 */

import { CONTRACT_LIMITS_V1 } from "./limits.ts";

/** Basenames structurally denied as credential/secret-shaped references. */
const SECRET_BASENAME_EXACT = new Set([
	".env",
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

const SECRET_BASENAME_RE =
	/^(?:.*\.)?(?:pem|key|p12|pfx|jks)$|^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\..+)?$|^\.env(\..+)?$|^(?:credentials|secrets?|auth|service-account)(?:\.[a-z0-9]+)?$/i;

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

function isSecretBasename(name: string): boolean {
	if (!name) return false;
	if (SECRET_BASENAME_EXACT.has(name)) return true;
	if (SECRET_BASENAME_RE.test(name)) return true;
	// Nested secret-shaped leaf e.g. secrets/private.pem
	return false;
}

/**
 * Structural path policy for authoritative artifact/owned/changed refs.
 * Allows a single trailing `/**` glob segment used by ValidationContract forbidden paths.
 */
export function isSafeRepoRelativePath(path: unknown): boolean {
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

	let sawGlobStar = false;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]!;
		if (seg === "." || seg === "..") return false;
		if (seg === "**") {
			// Only allow a single trailing `**` for forbidden-path globs
			if (i !== segments.length - 1) return false;
			if (sawGlobStar) return false;
			sawGlobStar = true;
			continue;
		}
		// No glob wildcards elsewhere
		if (seg.includes("*") || seg.includes("?") || seg.includes("[")) return false;
	}

	const base = basenameOf(path);
	// When path ends with /**, check the parent basename for secrets is N/A;
	// still deny secret basenames on concrete leaves.
	if (base !== "**" && isSecretBasename(base)) return false;
	// Also deny if any path segment is a secret basename (e.g. secrets/private.pem handled by base)
	for (const seg of segments) {
		if (seg !== "**" && isSecretBasename(seg)) return false;
	}

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
