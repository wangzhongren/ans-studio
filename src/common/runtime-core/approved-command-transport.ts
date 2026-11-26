import { lstat, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type Transport = { argv: string[]; env: Record<string, string> } | { error: string };
interface ImplementationSelfTestBinding { cwd: string; isCurrent(): boolean }

const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const npmCli = join("node_modules", "npm", "bin", "npm-cli.js");
const nodeShim = join("src", "common", "runtime-core", "portable-node", "node.cmd");
const bundledNodeExeVar = "ANS_APPROVED_NPM_NODE_EXE";

async function findPackagedFile(path: string): Promise<string> {
  const root = await realpath(appRoot);
  const entry = join(root, path);
  if (!(await lstat(entry)).isFile() || relative(root, await realpath(entry)) !== path) {
    throw new Error("应用资源不是固定位置的普通文件");
  }
  return entry;
}

async function findBundledNpm(): Promise<string> {
  return await findPackagedFile(npmCli);
}

function literalNodeSelfTestFiles(argv: string[]): string[] | undefined {
  if (argv[0] !== "node" || (argv[1] !== "--check" && argv[1] !== "--test") || argv.length < 3 || argv.length > 32
    || (argv[1] === "--check" && argv.length !== 3)) return undefined;
  const files = argv.slice(2).map(arg => arg.replaceAll("\\", "/").replace(/^\.\//, ""));
  if (!files.every(file => file.split("/").every(part => part !== "." && part !== ".."
    && /^[\p{L}\p{N}._@+ -]+$/u.test(part) && !part.startsWith("-") && !/[. ]$/.test(part)))) return undefined;
  return files;
}

async function regularProjectFiles(cwd: string, files: string[]): Promise<boolean> {
  if (!isAbsolute(cwd)) return false;
  try {
    const root = await realpath(cwd);
    for (const path of files) {
      const file = join(root, path);
      if (!(await lstat(file)).isFile() || relative(root, await realpath(file)) !== relative(root, file)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Resolve only an already approved foreground command. The approval and audit retain the original argv. */
export async function resolveApprovedCommandTransport(
  argv: string[],
  env: Record<string, string>,
  findNpm = findBundledNpm,
  selfTest?: ImplementationSelfTestBinding,
): Promise<Transport> {
  if (process.platform !== "win32") return { argv, env };
  if (argv[0] !== "npm") {
    const files = process.versions.electron && selfTest ? literalNodeSelfTestFiles(argv) : undefined;
    if (!selfTest || !files) return { argv, env };
    const verified = selfTest.isCurrent() && await regularProjectFiles(selfTest.cwd, files);
    if (!selfTest.isCurrent()) return { error: "A11 自测的原任务回合已失效（implementation-self-test-stale）" };
    if (!verified) return { argv, env };
    const childEnv = Object.fromEntries(Object.entries(env)
      .filter(([name]) => !["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"].includes(name.toUpperCase())));
    childEnv.ELECTRON_RUN_AS_NODE = "1";
    return { argv: [process.execPath, ...argv.slice(1)], env: childEnv };
  }

  let entry: string;
  try {
    entry = await findNpm();
    if (!isAbsolute(entry)) throw new Error("应用内 npm CLI 路径不是绝对路径");
  } catch {
    return { error: "应用内 npm CLI 不可用（bundled-npm-unavailable）" };
  }
  const npmArgv = [process.execPath, entry, ...argv.slice(1)];
  if (!process.versions.electron) return { argv: npmArgv, env };

  try {
    const shimDir = dirname(await findPackagedFile(nodeShim));
    if (shimDir.includes(delimiter)) throw new Error("随包 Node 路径不能作为 Windows PATH 条目");
    const childEnv = { ...env };
    // Windows uses the first case-insensitive match in lexicographic order when spawning.
    const pathName = Object.keys(childEnv).sort().find(name => name.toUpperCase() === "PATH");
    const originalPath = pathName === undefined ? undefined : childEnv[pathName];
    for (const name of Object.keys(childEnv)) {
      const key = name.toUpperCase();
      if (key === "PATH" || key === "ELECTRON_RUN_AS_NODE" || key === bundledNodeExeVar) delete childEnv[name];
    }
    childEnv.PATH = originalPath ? shimDir + delimiter + originalPath : shimDir;
    childEnv.ELECTRON_RUN_AS_NODE = "1";
    childEnv[bundledNodeExeVar] = process.execPath;
    return { argv: npmArgv, env: childEnv };
  } catch {
    return { error: "应用内 Node 命令入口不可用（bundled-node-unavailable）" };
  }
}
