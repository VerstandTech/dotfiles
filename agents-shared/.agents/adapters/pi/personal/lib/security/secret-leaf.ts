const SECRET_BASENAME_EXACT = new Set([
	".env",
	".envrc",
	".env.local",
	".env.development",
	".env.production",
	".env.test",
	".npmrc",
	".yarnrc",
	".yarnrc.yml",
	".pypirc",
	".netrc",
	"auth.json",
	"credentials",
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
 * Shared CON-01-aligned secret leaf matcher for SEC-00 and SEC-01.
 *
 * It denies credential stores and their backup/encoded suffixes without
 * blanket-denying ordinary source leaves such as auth.module.ts or
 * credentials.client.ts.
 */
export function isSecretLeafBasenameV1(input: unknown): boolean {
	if (typeof input !== "string" || input.length === 0 || input.length > 255) return false;
	const name = input.toLowerCase();
	if (SECRET_BASENAME_EXACT.has(name)) return true;
	if (name === ".envrc" || name === ".env" || name.startsWith(".env.")) return true;
	if (/^id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?(?:\..+)?$/i.test(name)) return true;
	if (/\.(?:pem|key)(?:\..+)?$/i.test(name)) return true;
	if (/\.(?:p12|pfx|jks)(?:\..+)?$/i.test(name) && /(?:private|secret|id_)/i.test(name)) return true;
	return /^(?:auth|credentials|secrets?|service-account)\.(?:json|ya?ml|toml|ini|conf|cfg|env|pem|key|p12|pfx|jks)(?:\..+)?$/i.test(name);
}
