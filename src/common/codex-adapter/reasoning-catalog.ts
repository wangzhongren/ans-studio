import { createRequire } from "node:module";
import { open, readFile, realpath, mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";

// This is a version-bound reader of the installed CLI's embedded metadata, not a model database.
export const REASONING_CATALOG_VERSION = "0.162.1";
export const MAX_REASONING_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_NATIVE_BYTES = 512 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;
const MARKER = Buffer.from('{\n  "models": [');
const fail = () => new Error("Codex installed model metadata version/format is not supported for effort compatibility");
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Pure bounded decoder, shared with tests. Production bytes come only from the installed binary. */
export function decodeEmbeddedReasoningCatalog(bytes: Uint8Array): unknown {
  if (bytes.length > MAX_REASONING_CATALOG_BYTES || !Buffer.from(bytes.subarray(0, MARKER.length)).equals(MARKER)) throw fail();
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (byte === 92) escaped = true;
      else if (byte === 34) quoted = false;
    } else if (byte === 34) quoted = true;
    else if (byte === 123 || byte === 91) depth++;
    else if (byte === 125 || byte === 93) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, index + 1))); }
        catch { throw fail(); }
      }
      if (depth < 0) throw fail();
    }
  }
  throw fail();
}

/** Select exactly one current model, changing only the four approved native metadata fields. */
export function compatibilityReasoningCatalog(catalog: unknown, model: string, version: string): Record<string, unknown> | undefined {
  if (version !== REASONING_CATALOG_VERSION || !record(catalog) || !Array.isArray(catalog.models)) throw fail();
  if (catalog.models.some(item => !record(item) || typeof item.slug !== "string")) throw fail();
  const matches = catalog.models.filter(item => (item as Record<string, unknown>).slug === model) as Record<string, unknown>[];
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) throw fail();
  const original = matches[0];
  if ((original.default_reasoning_level !== null && typeof original.default_reasoning_level !== "string")
      || typeof original.default_reasoning_summary !== "string"
      || typeof original.supports_reasoning_summary_parameter !== "boolean" || typeof original.supports_reasoning_summaries !== "boolean"
      || !Array.isArray(original.supported_reasoning_levels) || !record(original.model_messages)
      || typeof original.context_window !== "number" || typeof original.display_name !== "string") throw fail();
  if (original.default_reasoning_level === null) return undefined;
  return { ...catalog, models: [{ ...original, default_reasoning_level: null, default_reasoning_summary: "none", supports_reasoning_summary_parameter: false, supports_reasoning_summaries: false }] };
}

const targets: Record<string, string> = {
  "darwin-arm64": "aarch64-apple-darwin", "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-musl", "linux-x64": "x86_64-unknown-linux-musl",
  "win32-arm64": "aarch64-pc-windows-msvc", "win32-x64": "x86_64-pc-windows-msvc",
};
async function manifest(file: string): Promise<Record<string, unknown>> {
  if ((await stat(file)).size > 65536) throw fail();
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!record(value)) throw fail();
  return value;
}

/** No caller-provided source path: neither project files nor config/env can supply trusted metadata. */
export async function readInstalledReasoningCatalog(): Promise<unknown> {
  const require = createRequire(import.meta.url);
  const cli = await manifest(require.resolve("@openai/codex/package.json"));
  const platform = `${process.platform}-${process.arch}`;
  const target = targets[platform];
  if (cli.name !== "@openai/codex" || cli.version !== REASONING_CATALOG_VERSION || !target) throw fail();
  const platformManifest = require.resolve(`@openai/codex-${platform}/package.json`);
  const native = await manifest(platformManifest);
  if (native.name !== "@openai/codex" || native.version !== `${REASONING_CATALOG_VERSION}-${platform}`) throw fail();
  const root = await realpath(path.dirname(platformManifest));
  const binary = await realpath(path.join(root, "vendor", target, "bin", process.platform === "win32" ? "codex.exe" : "codex"));
  const relative = path.relative(root, binary);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw fail();
  const file = await open(binary, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < MARKER.length || info.size > MAX_NATIVE_BYTES) throw fail();
    const buffer = Buffer.alloc(CHUNK_BYTES);
    let overlap = Buffer.alloc(0);
    for (let offset = 0; offset < info.size;) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(CHUNK_BYTES, info.size - offset), offset);
      if (!bytesRead) throw fail();
      const scan = Buffer.concat([overlap, buffer.subarray(0, bytesRead)]);
      const marker = scan.indexOf(MARKER);
      if (marker !== -1) {
        const start = offset - overlap.length + marker;
        const bytes = Buffer.alloc(Math.min(MAX_REASONING_CATALOG_BYTES, info.size - start));
        let read = 0;
        while (read < bytes.length) {
          const part = await file.read(bytes, read, bytes.length - read, start + read);
          if (!part.bytesRead) break;
          read += part.bytesRead;
        }
        return decodeEmbeddedReasoningCatalog(bytes.subarray(0, read));
      }
      overlap = Buffer.from(scan.subarray(Math.max(0, scan.length - MARKER.length + 1)));
      offset += bytesRead;
    }
    throw fail();
  } finally { await file.close(); }
}

export interface TemporaryReasoningCatalog { path: string; directory: string; }
/** The caller supplies its owned disposable workRoot, never a catalog source. */
export async function prepareReasoningCatalog(workRoot: string, model: string): Promise<TemporaryReasoningCatalog | undefined> {
  const compatible = compatibilityReasoningCatalog(await readInstalledReasoningCatalog(), model, REASONING_CATALOG_VERSION);
  if (!compatible) return undefined;
  const directory = await mkdtemp(path.join(workRoot, "reasoning-catalog-"));
  const file = path.join(directory, "model.json");
  try {
    await writeFile(file, JSON.stringify(compatible), { encoding: "utf8", mode: 0o600, flag: "wx" });
    return { path: file, directory };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
