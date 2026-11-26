import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";

const manifestLimit = 256 * 1024;
const lockLimit = 4 * 1024 * 1024;
const registry = "registry.npmjs.org";
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const registrySelector = /^(?:[a-zA-Z][a-zA-Z0-9_.-]*|[~^<>=vVxX*0-9][a-zA-Z0-9.~^<>=*+| -]*)$/;
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
const rootFields = ["name", "version", "license", "private", "engines", "os", "cpu", "libc", "peerDependenciesMeta", ...dependencyFields];

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid JSON object");
  return value as JsonObject;
}

function jsonObject(bytes: Buffer, limit: number): JsonObject {
  if (bytes.length === 0 || bytes.length > limit) throw new Error("invalid JSON size");
  return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

function validName(name: string): boolean {
  return name.length <= 214 && packageName.test(name) && name !== "node_modules";
}

function dependencies(value: unknown): [string, string][] {
  if (value === undefined) return [];
  return Object.entries(object(value)).map(([name, selector]) => {
    if (!validName(name) || typeof selector !== "string" || selector.length > 256 || !registrySelector.test(selector.trim())) {
      throw new Error("dependency must use a public registry package name and version or tag");
    }
    return [name, selector];
  });
}

/** Bounded read of a single project-root regular file, refusing symbolic and hard links. */
export async function readPackageManifest(root: string): Promise<Buffer> {
  const path = join(root, "package.json");
  const before = await lstat(path);
  if (!before.isFile() || before.nlink !== 1 || before.size > manifestLimit) throw new Error("invalid package.json file");
  const file = await open(path, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW));
  try {
    const matches = (entry: typeof before) => entry.isFile() && entry.nlink === 1 && entry.dev === before.dev && entry.ino === before.ino
      && entry.size === before.size && entry.mtimeMs === before.mtimeMs && entry.ctimeMs === before.ctimeMs;
    if (!matches(await file.stat()) || !matches(await lstat(path))) throw new Error("package.json changed before reading");
    const bytes = Buffer.alloc(before.size + 1);
    let read = 0;
    while (read < bytes.length) {
      const { bytesRead } = await file.read(bytes, read, bytes.length - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    if (read !== before.size || !matches(await file.stat()) || !matches(await lstat(path))) throw new Error("package.json changed while reading");
    return bytes.subarray(0, read);
  } finally {
    await file.close();
  }
}

/** Supply only dependency-resolution metadata to npm; project scripts and config stay in the worktree. */
export function isolatePackageManifest(bytes: Buffer): Buffer {
  const manifest = jsonObject(bytes, manifestLimit);
  for (const key of ["workspaces", "overrides", "bundledDependencies", "bundleDependencies"]) {
    if (Object.hasOwn(manifest, key)) throw new Error("package.json uses unsupported workspace, override, or bundled dependencies");
  }
  if (manifest.name !== undefined && (typeof manifest.name !== "string" || !validName(manifest.name))) throw new Error("invalid package name");
  if (manifest.version !== undefined && (typeof manifest.version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.+-]+)?$/.test(manifest.version))) {
    throw new Error("invalid package version");
  }
  for (const field of dependencyFields) dependencies(manifest[field]);
  return Buffer.from(JSON.stringify(Object.fromEntries(rootFields.filter(key => Object.hasOwn(manifest, key)).map(key => [key, manifest[key]]))));
}

function resolveDependency(packages: JsonObject, from: string, name: string): boolean {
  let at = from;
  while (at) {
    if (Object.hasOwn(packages, `${at}/node_modules/${name}`)) return true;
    const boundary = at.lastIndexOf("/node_modules/");
    at = boundary === -1 ? "" : at.slice(0, boundary);
  }
  return Object.hasOwn(packages, `node_modules/${name}`);
}

function verifyRegistryArtifact(entry: JsonObject): void {
  if (entry.link || entry.inBundle || typeof entry.resolved !== "string" || typeof entry.integrity !== "string"
    || !/^sha(?:1|256|384|512)-[a-zA-Z0-9+/]+={0,2}$/.test(entry.integrity)) {
    throw new Error("lockfile contains an unverified dependency artifact");
  }
  const url = new URL(entry.resolved);
  if (url.protocol !== "https:" || url.host !== registry || url.username || url.password) {
    throw new Error("lockfile refers to a non-registry artifact");
  }
}

export function verifyPackageLock(lock: Buffer, isolatedManifest: Buffer): void {
  const manifest = jsonObject(isolatedManifest, manifestLimit);
  const document = jsonObject(lock, lockLimit);
  if (document.lockfileVersion !== 3) throw new Error("expected npm lockfile version 3");
  const packages = object(document.packages);
  const root = object(packages[""] ?? {});
  // npm can use the temporary working directory's name at the document level if the manifest omits it.
  if (root.name !== manifest.name || root.version !== manifest.version || document.version !== manifest.version
    || (manifest.name === undefined ? typeof document.name !== "string" || !validName(document.name.toLowerCase()) : document.name !== manifest.name)) {
    throw new Error("lockfile manifest identity mismatch");
  }
  for (const field of dependencyFields) {
    const expected = object(manifest[field] ?? {});
    const actual = object(root[field] ?? {});
    if (Object.keys(expected).length !== Object.keys(actual).length || Object.entries(expected).some(([key, value]) => !Object.hasOwn(actual, key) || actual[key] !== value)) {
      throw new Error("lockfile root dependencies differ from package.json");
    }
  }
  for (const [path, value] of Object.entries(packages)) {
    const entry = object(value);
    if (path) {
      if (!path.startsWith("node_modules/") || path.slice("node_modules/".length).split("/node_modules/").some(name => !validName(name))) {
        throw new Error("lockfile contains an invalid package path");
      }
      verifyRegistryArtifact(entry);
    }
    for (const field of dependencyFields) {
      for (const [name] of dependencies(entry[field])) {
        if (field === "peerDependencies" && object(object(entry.peerDependenciesMeta ?? {})[name] ?? {}).optional === true) continue;
        if (!resolveDependency(packages, path, name)) throw new Error("lockfile dependency graph is incomplete");
      }
    }
  }
}
