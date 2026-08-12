export function isLoadedExtensionV1(file: string, globs: readonly string[]): boolean {
  if (typeof file !== "string" || file.includes("..") || file.startsWith("/")) return false;
  if (file.endsWith(".test.ts")) return false;
  const excluded = globs.some((glob) => glob.startsWith("!") && (glob.includes("*.test.ts") || glob.endsWith(".test.ts")));
  if (excluded && file.endsWith(".test.ts")) return false;
  return globs.some((glob) => !glob.startsWith("!") && glob.includes("extensions/") && file.startsWith("extensions/") && file.endsWith(".ts"));
}
