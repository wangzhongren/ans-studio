import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DurableResult } from "../../src/model/durable-workflow.ts";
import { acceptanceDependencyParent } from "./workflow-git.ts";
import roleText from "./durable-workflow-role-text.json" with { type: "json" };

const npmVersion = "11.19.1";
const npmRoot = fileURLToPath(new URL("../../node_modules/npm/", import.meta.url));
const npmEntry = path.join(npmRoot, "bin", "npm-cli.js");
const maxLockBytes = 4 * 1024 * 1024;
const npmDeadlineMs = 55_000;

function lockFailure(code: string, message: string): DurableResult<never> {
  return { ok: false, code, message };
}

async function npmAvailable(): Promise<boolean> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(npmRoot, "package.json"), "utf8"));
    return manifest.name === "npm" && manifest.version === npmVersion && (await fs.lstat(npmEntry)).isFile();
  } catch {
    return false;
  }
}

function npmEnvironment(root: string): NodeJS.ProcessEnv {
  return {
    HOME: root, XDG_CONFIG_HOME: root, APPDATA: root, LOCALAPPDATA: root, USERPROFILE: root,
    TEMP: root, TMP: root, TMPDIR: root,
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } : {}),
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
  };
}

function isolatedNpmArgv(root: string, args: readonly string[]): readonly string[] {
  return Object.freeze(["npm", ...args, "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier",
    "--workspaces=false", "--allow-directory=none", "--allow-file=none", "--allow-git=none", "--allow-remote=none",
    "--registry=https://registry.npmjs.org/", "--fetch-retries=1", "--fetch-retry-mintimeout=1000", "--fetch-timeout=20000",
    "--logs-max=0", "--color=false", "--progress=false", `--prefix=${root}`, `--userconfig=${path.join(root, "user.npmrc")}`,
    `--globalconfig=${path.join(root, "global.npmrc")}`, `--cache=${path.join(root, "cache")}`]);
}

interface IsolatedNpmOutcome {
  pid?: number;
  exitCode: number | null;
  status: "exited" | "unavailable" | "timed-out" | "cancelled" | "output-limit";
  outputDigest: string;
  npmErrorCode?: string;
  transientNetworkFailure: boolean;
}

function runBundledNpm(root: string, argv: readonly string[], signal?: AbortSignal): Promise<IsolatedNpmOutcome> {
  return new Promise(resolve => {
    const output = createHash("sha256");
    if (signal?.aborted) {
      resolve({ exitCode: null, status: "cancelled", outputDigest: output.digest("hex"), transientNetworkFailure: false });
      return;
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [npmEntry, ...argv.slice(1)], { cwd: root, env: npmEnvironment(root), shell: false, windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      resolve({ exitCode: null, status: "unavailable", outputDigest: output.digest("hex"), transientNetworkFailure: false });
      return;
    }
    let spawnFailed = false;
    let timedOut = false;
    let outputLimit = false;
    let stderrBytes = 0;
    let diagnostic = "";
    const cancel = () => { child.kill(); };
    const timer = setTimeout(() => { timedOut = true; cancel(); }, npmDeadlineMs);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= 64 * 1024) {
        output.update(chunk);
        diagnostic += chunk.toString("utf8");
      }
      if (stderrBytes > 64 * 1024 && !outputLimit) {
        outputLimit = true;
        cancel();
      }
    });
    child.once("error", () => { spawnFailed = true; });
    child.once("close", code => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      const status = signal?.aborted ? "cancelled" : timedOut ? "timed-out" : outputLimit ? "output-limit" : spawnFailed ? "unavailable" : "exited";
      const npmErrorCode = /^(?:npm (?:err!|error) )code ([A-Z][A-Z0-9_]{0,29})\s*$/m.exec(diagnostic)?.[1];
      resolve({ pid: child.pid, exitCode: code, status, outputDigest: output.digest("hex"), npmErrorCode,
        transientNetworkFailure: status === "exited" && code !== 0 && /^(?:EAI_AGAIN|ETIMEDOUT|ECONNRESET|E429|E50[234])$/.test(npmErrorCode ?? "") });
    });
  });
}

async function writeNpmInputs(root: string, manifest: Buffer, lock?: Buffer): Promise<void> {
  const newFile = { mode: 0o600, flag: "wx" } as const;
  await Promise.all([fs.writeFile(path.join(root, "package.json"), manifest, newFile),
    fs.writeFile(path.join(root, "user.npmrc"), "", newFile), fs.writeFile(path.join(root, "global.npmrc"), "", newFile),
    ...(lock ? [fs.writeFile(path.join(root, "package-lock.json"), lock, newFile)] : [])]);
}

export interface PreparedAcceptanceNpm {
  readonly argv: readonly string[];
  readonly cwd: string;
  execute(signal?: AbortSignal): Promise<IsolatedNpmOutcome>;
  publish(target: { directory: string; privateTaskId?: string; parentIdentity?: DirectoryIdentity },
    canPublish: () => boolean, stillBound: () => boolean): Promise<DirectoryIdentity>;
  dispose(): Promise<void>;
}

type DirectoryIdentity = { dev: string; ino: string };

async function installDirectoryIdentity(directory: string): Promise<DirectoryIdentity> {
  const stat = await fs.lstat(directory, { bigint: true });
  if (!stat.isDirectory() || path.relative(directory, await fs.realpath(directory))) throw new Error(roleText.packageLock.installDirectoryUnverified);
  return { dev: stat.dev.toString(), ino: stat.ino.toString() };
}

function sameIdentity(first: DirectoryIdentity, second: DirectoryIdentity): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

async function verifyInstallTree(root: string): Promise<void> {
  const directories = [root];
  let entries = 0;
  for (const directory of directories) {
    for (const info of await fs.readdir(directory, { withFileTypes: true })) {
      if (++entries > 100_000) throw new Error(roleText.packageLock.dependencyOutputLimit);
      const entry = path.join(directory, info.name);
      if (info.isDirectory()) {
        if (path.relative(entry, await fs.realpath(entry))) throw new Error(roleText.packageLock.installDirectoryRedirected);
        directories.push(entry);
      } else if (info.isSymbolicLink() && path.basename(directory) === ".bin") {
        const relative = path.relative(root, await fs.realpath(entry));
        if (path.isAbsolute(await fs.readlink(entry)) || !relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
          throw new Error(roleText.packageLock.localNpmEntryOutsideInstallation);
        }
      } else if (!info.isFile()) {
        throw new Error(roleText.packageLock.unsupportedInstallFile);
      }
    }
  }
}

/** Reviewed npm is executed on verified inputs in isolation; only its local install tree is eligible for publication. */
export async function prepareAcceptanceNpm(projectRoot: string, manifest: Buffer, lock?: Buffer): Promise<DurableResult<PreparedAcceptanceNpm>> {
  if (!await npmAvailable()) return lockFailure("workflow-environment-npm-unavailable", `${roleText.packageLock.bundledNpmUnavailable[0]}${npmVersion}${roleText.packageLock.bundledNpmUnavailable[1]}`);
  let root: string | undefined;
  try {
    const state = path.join(projectRoot, ".ans");
    if (!(await fs.lstat(state)).isDirectory() || path.relative(state, await fs.realpath(state))) {
      return lockFailure("workflow-environment-npm-isolation-failed", roleText.packageLock.projectStateDirectoryUnverified);
    }
    root = await fs.mkdtemp(path.join(state, "acceptance-npm-"));
    const identity = await fs.lstat(root);
    if (!identity.isDirectory() || path.relative(root, await fs.realpath(root))) throw new Error(roleText.packageLock.isolatedInstallPathChanged);
    await writeNpmInputs(root, manifest, lock);
    const cwd = root;
    const argv = isolatedNpmArgv(cwd, [...(lock ? ["ci"] : ["install", "--no-package-lock"]), "--include=dev", "--include=optional"]);
    let successful = false;
    return { ok: true, value: {
      argv, cwd,
      async execute(signal) {
        const result = await runBundledNpm(cwd, argv, signal);
        successful = result.status === "exited" && result.exitCode === 0;
        return result;
      },
      async publish(target, canPublish, stillBound) {
        if (!successful) throw new Error(roleText.packageLock.installFailed);
        const installed = path.join(cwd, "node_modules");
        const destination = target.directory;
        const parent = target.privateTaskId ? acceptanceDependencyParent(projectRoot, target.privateTaskId) : projectRoot;
        if (!parent || path.join(parent, "node_modules") !== destination || (target.privateTaskId !== undefined) !== (target.parentIdentity !== undefined)) {
          throw new Error(roleText.packageLock.publishTargetUnbound);
        }
        await installDirectoryIdentity(installed);
        const originalParent = await installDirectoryIdentity(parent);
        if (target.parentIdentity && !sameIdentity(target.parentIdentity, originalParent)) throw new Error(roleText.packageLock.privateInstallDirectoryChanged);
        await verifyInstallTree(installed);
        if (!canPublish()) throw new Error(roleText.packageLock.approvalTurnRequired);
        // Exclusive mkdir reserves the name without deleting or replacing a pre-existing installation.
        await fs.mkdir(destination);
        const published = await installDirectoryIdentity(destination);
        const verifyPublication = async () => {
          if (!stillBound() || !sameIdentity(originalParent, await installDirectoryIdentity(parent))
            || !sameIdentity(published, await installDirectoryIdentity(destination))) throw new Error(roleText.packageLock.publicationOrTaskChanged);
        };
        for (const name of await fs.readdir(installed)) {
          await verifyPublication();
          await fs.cp(path.join(installed, name), path.join(destination, name),
            { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
        }
        await verifyPublication();
        await verifyInstallTree(destination);
        return published;
      },
      async dispose() {
        const current = await fs.lstat(cwd).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
        if (!current) return;
        if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino || path.relative(cwd, await fs.realpath(cwd))) {
          throw new Error(roleText.packageLock.isolatedInstallOwnershipChanged);
        }
        await fs.rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
      },
    } };
  } catch {
    if (root) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }).catch(() => undefined);
    return lockFailure("workflow-environment-npm-isolation-failed", roleText.packageLock.isolatedNpmPreparationFailed);
  }
}

/** Runs npm only on the effective tool's sanitized manifest. The actual project is not passed to this runner. */
export async function generateDesktopPackageLock(manifest: Buffer, signal?: AbortSignal): Promise<DurableResult<Buffer>> {
  if (signal?.aborted) return lockFailure("package-lock-cancelled", roleText.packageLock.lockTaskCancelled);
  if (!await npmAvailable()) return lockFailure("package-lock-runner-unavailable", `${roleText.packageLock.bundledNpmUnavailable[0]}${npmVersion}${roleText.packageLock.bundledNpmUnavailable[1]}`);
  try {
    const root = await fs.mkdtemp(path.join(tmpdir(), "ans-npm-lock-"));
    try {
      await writeNpmInputs(root, manifest);
      const generated = await runBundledNpm(root, isolatedNpmArgv(root, ["install", "--package-lock-only", "--lockfile-version=3"]), signal);
      switch (generated.status) {
        case "cancelled": return lockFailure("package-lock-cancelled", roleText.packageLock.lockTaskCancelled);
        case "timed-out": return lockFailure("package-lock-timeout", roleText.packageLock.resolutionTimedOut);
        case "output-limit": return lockFailure("package-lock-output-limit", roleText.packageLock.npmOutputLimit);
        case "unavailable": return lockFailure("package-lock-runner-unavailable", roleText.packageLock.bundledNpmStartFailed);
      }
      if (generated.exitCode !== 0) return lockFailure("package-lock-resolution-failed", `${roleText.packageLock.publicRegistryResolutionFailed[0]}${generated.exitCode ?? roleText.packageLock.npmDidNotExitNormally}${roleText.packageLock.publicRegistryResolutionFailed[1]}`);
      const lock = path.join(root, "package-lock.json");
      const size = await fs.lstat(lock).catch(() => undefined);
      if (!size?.isFile() || size.size === 0 || size.size > maxLockBytes) {
        return lockFailure("package-lock-output-invalid", roleText.packageLock.lockOutputUnreadable);
      }
      return { ok: true, value: await fs.readFile(lock) };
    } finally {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
    }
  } catch {
    return lockFailure("package-lock-isolation-failed", roleText.packageLock.isolatedLockCleanupFailed);
  }
}
