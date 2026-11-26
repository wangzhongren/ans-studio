import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DurableResult } from "../../src/model/durable-workflow.ts";
import { acceptanceDependencyParent } from "./workflow-git.ts";

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
  if (!stat.isDirectory() || path.relative(directory, await fs.realpath(directory))) throw new Error("应用安装目录无法核验。");
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
      if (++entries > 100_000) throw new Error("依赖输出超过可核对范围。");
      const entry = path.join(directory, info.name);
      if (info.isDirectory()) {
        if (path.relative(entry, await fs.realpath(entry))) throw new Error("安装目录含重解析跳转。");
        directories.push(entry);
      } else if (info.isSymbolicLink() && path.basename(directory) === ".bin") {
        const relative = path.relative(root, await fs.realpath(entry));
        if (path.isAbsolute(await fs.readlink(entry)) || !relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
          throw new Error("本地 npm 执行入口指向安装目录外。");
        }
      } else if (!info.isFile()) {
        throw new Error("安装目录含不可发布的链接或特殊文件。");
      }
    }
  }
}

/** Reviewed npm is executed on verified inputs in isolation; only its local install tree is eligible for publication. */
export async function prepareAcceptanceNpm(projectRoot: string, manifest: Buffer, lock?: Buffer): Promise<DurableResult<PreparedAcceptanceNpm>> {
  if (!await npmAvailable()) return lockFailure("workflow-environment-npm-unavailable", `应用缺少固定版本的 npm ${npmVersion}。`);
  let root: string | undefined;
  try {
    const state = path.join(projectRoot, ".ans");
    if (!(await fs.lstat(state)).isDirectory() || path.relative(state, await fs.realpath(state))) {
      return lockFailure("workflow-environment-npm-isolation-failed", "应用运行态目录无法核对为当前项目的普通目录。");
    }
    root = await fs.mkdtemp(path.join(state, "acceptance-npm-"));
    const identity = await fs.lstat(root);
    if (!identity.isDirectory() || path.relative(root, await fs.realpath(root))) throw new Error("安装隔离目录路径已变化。");
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
        if (!successful) throw new Error("npm 安装未成功。");
        const installed = path.join(cwd, "node_modules");
        const destination = target.directory;
        const parent = target.privateTaskId ? acceptanceDependencyParent(projectRoot, target.privateTaskId) : projectRoot;
        if (!parent || path.join(parent, "node_modules") !== destination || (target.privateTaskId !== undefined) !== (target.parentIdentity !== undefined)) {
          throw new Error("安装发布地址未绑定当前任务。");
        }
        await installDirectoryIdentity(installed);
        const originalParent = await installDirectoryIdentity(parent);
        if (target.parentIdentity && !sameIdentity(target.parentIdentity, originalParent)) throw new Error("专用安装目录在审批后已变化。");
        await verifyInstallTree(installed);
        if (!canPublish()) throw new Error("安装发布需要原审批回合仍生效。");
        // Exclusive mkdir reserves the name without deleting or replacing a pre-existing installation.
        await fs.mkdir(destination);
        const published = await installDirectoryIdentity(destination);
        const verifyPublication = async () => {
          if (!stillBound() || !sameIdentity(originalParent, await installDirectoryIdentity(parent))
            || !sameIdentity(published, await installDirectoryIdentity(destination))) throw new Error("安装发布目录或原任务已变化。");
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
          throw new Error("安装隔离目录权属已经变化。");
        }
        await fs.rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
      },
    } };
  } catch {
    if (root) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }).catch(() => undefined);
    return lockFailure("workflow-environment-npm-isolation-failed", "无法准备应用隔离 npm 工作目录。");
  }
}

/** Runs npm only on the effective tool's sanitized manifest. The actual project is not passed to this runner. */
export async function generateDesktopPackageLock(manifest: Buffer, signal?: AbortSignal): Promise<DurableResult<Buffer>> {
  if (signal?.aborted) return lockFailure("package-lock-cancelled", "锁文件生成任务已取消。");
  if (!await npmAvailable()) return lockFailure("package-lock-runner-unavailable", `应用缺少固定版本的 npm ${npmVersion}。`);
  try {
    const root = await fs.mkdtemp(path.join(tmpdir(), "ans-npm-lock-"));
    try {
      await writeNpmInputs(root, manifest);
      const generated = await runBundledNpm(root, isolatedNpmArgv(root, ["install", "--package-lock-only", "--lockfile-version=3"]), signal);
      switch (generated.status) {
        case "cancelled": return lockFailure("package-lock-cancelled", "锁文件生成任务已取消。");
        case "timed-out": return lockFailure("package-lock-timeout", "在时限内未能完成依赖解析。");
        case "output-limit": return lockFailure("package-lock-output-limit", "npm 的输出超出执行上限。");
        case "unavailable": return lockFailure("package-lock-runner-unavailable", "应用内 npm 无法启动。");
      }
      if (generated.exitCode !== 0) return lockFailure("package-lock-resolution-failed", `公共 registry 依赖解析失败（npm 退出状态 ${generated.exitCode ?? "未正常退出"}）。`);
      const lock = path.join(root, "package-lock.json");
      const size = await fs.lstat(lock).catch(() => undefined);
      if (!size?.isFile() || size.size === 0 || size.size > maxLockBytes) {
        return lockFailure("package-lock-output-invalid", "应用内 npm 未生成可读取的锁文件。");
      }
      return { ok: true, value: await fs.readFile(lock) };
    } finally {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
    }
  } catch {
    return lockFailure("package-lock-isolation-failed", "无法完成锁文件隔离运行或清理临时目录。");
  }
}
