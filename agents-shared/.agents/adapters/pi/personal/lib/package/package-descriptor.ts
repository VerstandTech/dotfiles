const DESCRIPTORS = new WeakSet<object>();

function hex(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function path(value: unknown): value is string { if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || /[\u0000-\u001f\u007f]/.test(value) || value.includes("\\") || value.includes("//")) return false; const parts = value.split("/"); return parts.every((part) => part.length > 0 && part !== "." && part !== ".."); }

export function createPackageDescriptorV1(input: Readonly<Record<string, unknown>>) {
  if (!hex(input.manifestFingerprint) || !hex(input.resourceFingerprint) || !Array.isArray(input.targets) || input.targets.length === 0 || input.targets.some((value) => !path(value)) || new Set(input.targets).size !== input.targets.length) throw new Error("invalid-package-descriptor");
  const descriptor = Object.freeze({ manifestFingerprint: input.manifestFingerprint, resourceFingerprint: input.resourceFingerprint, targets: Object.freeze([...input.targets].sort()) });
  DESCRIPTORS.add(descriptor);
  return descriptor;
}

export function isPackageDescriptorV1(value: unknown): boolean { return !!value && typeof value === "object" && DESCRIPTORS.has(value as object); }
