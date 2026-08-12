import { createHash } from "node:crypto";

type PlainRecord = Record<string, unknown>;
type RefusalCode = "invalid-package-input" | "pin-mismatch" | "unsafe-link";
type Refusal = Readonly<{ ok: false; code: RefusalCode }>;

const TARGET_STATES = new Set(["absent", "managed-link", "stale-managed-link", "user-file", "foreign-file", "foreign-link", "unknown"]);

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) freeze(descriptor.value);
  }
  return value;
}

function refusal(code: RefusalCode): Refusal {
  return freeze({ ok: false, code });
}

function record(value: unknown, allowed: readonly string[]): PlainRecord | undefined {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const result: PlainRecord = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.includes(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function read(root: PlainRecord, key: string): unknown {
  return Object.getOwnPropertyDescriptor(root, key)?.value;
}

function relativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) return false;
  if (value === "." || value.startsWith("/") || value.includes("\\") || value.includes("//") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function identifier(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9._-]+$/.test(value);
}

function pins(value: unknown): Readonly<Record<string, string>> | undefined {
  try {
    if (!value || typeof value !== "object") return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length < 1 || keys.length > 64 || keys.some((key) => typeof key !== "string")) return undefined;
    const root = record(value, keys as string[]);
    if (!root) return undefined;
    const result: Record<string, string> = {};
    let bytes = 0;
    for (const key of Object.keys(root).sort()) {
      const version = read(root, key);
      if (!identifier(key) || typeof version !== "string" || version.length > 64 || !/^[0-9A-Za-z.+-]+$/.test(version)) return undefined;
      bytes += key.length + version.length;
      if (bytes > 8192) return undefined;
      result[key] = version;
    }
    return freeze(result);
  } catch {
    return undefined;
  }
}

function samePins(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resources(value: unknown): readonly Readonly<PlainRecord>[] | undefined {
  try {
    if (!Array.isArray(value) || value.length === 0 || value.length > 256) return undefined;
    const result: PlainRecord[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) return undefined;
      const root = record(descriptor.value, ["source", "target", "hash"]);
      if (!root) return undefined;
      const source = read(root, "source");
      const target = read(root, "target");
      const hash = read(root, "hash");
      if (!relativePath(source) || !relativePath(target) || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return undefined;
      if (result.some((item) => pathsOverlap(String(item.target), target))) return undefined;
      result.push({ source, target, hash });
    }
    return freeze(result.sort((a, b) => String(a.target).localeCompare(String(b.target))));
  } catch {
    return undefined;
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function planPackageV1(input: unknown): Readonly<PlainRecord> | Refusal {
  let root: PlainRecord | undefined;
  try {
    root = record(input, ["schemaVersion", "packageVersion", "approvedPins", "observedPins", "resources"]);
  } catch {
    root = undefined;
  }
  if (!root || read(root, "schemaVersion") !== 1 || !identifier(read(root, "packageVersion"), 64)) return refusal("invalid-package-input");
  const approvedPins = pins(read(root, "approvedPins"));
  const observedPins = pins(read(root, "observedPins"));
  const normalizedResources = resources(read(root, "resources"));
  if (!approvedPins || !observedPins || !normalizedResources) return refusal("invalid-package-input");
  if (!samePins(approvedPins, observedPins)) return refusal("pin-mismatch");
  const base = {
    schemaVersion: 1,
    packageVersion: read(root, "packageVersion"),
    pins: approvedPins,
    resources: normalizedResources,
  };
  const manifest = freeze({ ...base, fingerprint: fingerprint(base) });
  return freeze({ ok: true, status: "valid", manifest });
}
