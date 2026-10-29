// src/common/编排/shell-approval-context.ts
// 2026-10-29（客户 Q1/Q2 口径修正 + 复核 R2/R3）：
// **脚本内容进入审查**——对 `node <script>`、`bash/sh <script>`、`python <script>`、`npm run <script>`、
// `node --test <file>`、`node -e "<code>"`、构建/包脚本，以及写目标无法静态解析的命令，审批上下文必须包含
// 命令行、脚本路径与**脚本内容**（有界）；内容不可读/超限 ⇒ **fail-closed 拒绝**（不弹客户卡、不交 judge）。
//
// 边界（R2）：单文件 ≤64KB 且 ≤2000 行；累计 ≤3 个文件、≤128KB；每个脚本记录 sha256。
// `npm run` 展开 package.json scripts 中引用的项目内文件；构建工具读取其项目配置文件（不能只给 note）。
// 本项目只做**有界读取**；是否越出角色写区/破坏性/越权由判断 agent 结合内容决定（提示词声明内容为数据）。

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ShellApprovalContext, ShellApprovalScript, ShellReviewRequest } from "../../model/runtime.ts";

/** 单文件内容上限（字节）。 */
export const SHELL_SCRIPT_MAX_BYTES = 64 * 1024;
/** 单文件行数上限。 */
export const SHELL_SCRIPT_MAX_LINES = 2000;
/** 累计文件数上限。 */
export const SHELL_CONTEXT_MAX_FILES = 3;
/** 累计内容字节上限。 */
export const SHELL_CONTEXT_MAX_BYTES = 128 * 1024;
/** package.json 读取上限。 */
export const SHELL_PACKAGE_JSON_MAX_BYTES = 256 * 1024;

const INTERPRETERS = new Set([
  "node", "python", "python2", "python3", "perl", "ruby", "php", "lua", "rscript", "deno", "bun", "ts-node",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish"]);
const INLINE_FLAGS: Record<string, readonly string[]> = {
  node: ["-e", "--eval", "-p", "--print"],
  python: ["-c"],
  python2: ["-c"],
  python3: ["-c"],
  perl: ["-e", "-E"],
  ruby: ["-e"],
  php: ["-r"],
  deno: ["eval"],
  bun: ["-e", "--eval"],
  "ts-node": ["-e", "--eval"],
  sh: ["-c"],
  bash: ["-c"],
  zsh: ["-c"],
  dash: ["-c"],
  ash: ["-c"],
  ksh: ["-c"],
  csh: ["-c"],
  tcsh: ["-c"],
  fish: ["-c"],
};
const VALUE_OPTIONS: Record<string, readonly string[]> = {
  node: ["-r", "--require", "--loader", "--import", "--experimental-loader", "-C", "--conditions"],
  python: ["-W", "-X", "-m"],
  python2: ["-W", "-X", "-m"],
  python3: ["-W", "-X", "-m"],
  perl: ["-I", "-M", "-m", "-x"],
  deno: ["--config", "-c", "--import-map", "--reload", "--cert", "--location"],
  bun: ["--config"],
  "ts-node": ["-P", "--project", "-r", "--require", "-O", "--compiler-options", "--compiler"],
};

/** 构建/包工具的项目配置文件候选（按顺序读取存在的项，最多 3 个）。 */
const BUILD_CONFIG_CANDIDATES: Record<string, readonly string[]> = {
  make: ["Makefile", "makefile", "GNUmakefile"],
  gmake: ["Makefile", "makefile", "GNUmakefile"],
  cmake: ["CMakeLists.txt"],
  gradle: ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"],
  gradlew: ["build.gradle", "build.gradle.kts"],
  mvn: ["pom.xml"],
  mvnw: ["pom.xml"],
  dotnet: ["global.json"],
  cargo: ["Cargo.toml", "build.rs"],
  go: ["go.mod", "go.sum"],
  tsc: ["tsconfig.json"],
  vite: ["vite.config.ts", "vite.config.js", "vite.config.mjs", "package.json"],
  webpack: ["webpack.config.ts", "webpack.config.js", "webpack.config.mjs"],
  rollup: ["rollup.config.ts", "rollup.config.js", "rollup.config.mjs"],
  esbuild: ["package.json"],
  gulp: ["gulpfile.js", "gulpfile.ts"],
  grunt: ["Gruntfile.js"],
  bazel: ["BUILD", "BUILD.bazel", "WORKSPACE", "WORKSPACE.bazel"],
  bazelisk: ["BUILD", "BUILD.bazel", "WORKSPACE", "WORKSPACE.bazel"],
  ant: ["build.xml"],
  msbuild: [],
  ninja: ["build.ninja"],
};

function baseName(raw: string): string {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  const segments = value.split(/[\\/]/).filter((segment) => segment !== "");
  const base = segments.length > 0 ? segments[segments.length - 1]! : value;
  return base.replace(/\.(exe|cmd|bat|ps1|com)$/i, "").toLowerCase();
}

function relativeInside(projectRoot: string, abs: string): string | undefined {
  const rel = path.relative(path.resolve(projectRoot), path.resolve(abs));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return rel.replace(/\\/g, "/");
}

export interface BuildShellApprovalContextInput {
  request: Pick<ShellReviewRequest, "command" | "argv" | "cwd" | "toolCallId">;
  projectRoot: string;
  /** 与写区同一判定（同一 resolveWrite 闭包）；用于标注脚本路径是否在写区内。 */
  checkWrite?: (relPath: string) => { allowed: boolean; reason?: string };
  readFileFn?: typeof fs.readFile;
  statFn?: typeof fs.stat;
}

export type BuildShellApprovalContextResult =
  | { ok: true; context: ShellApprovalContext }
  | { ok: false; reason: string };

function fail(reason: string): BuildShellApprovalContextResult {
  return { ok: false, reason };
}

function inlineCodeOf(program: string, args: readonly string[]): string | undefined {
  const flags = INLINE_FLAGS[program];
  if (flags === undefined) return undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    for (const flag of flags) {
      if (arg === flag) return args[i + 1];
      if (flag.startsWith("--") && arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

function scriptPathOf(program: string, args: readonly string[]): string | undefined {
  const valueOptions = new Set(VALUE_OPTIONS[program] ?? []);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--") return args[i + 1];
    if (arg.startsWith("-")) {
      if (valueOptions.has(arg)) i += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

function boundedContent(label: string, content: string): ShellApprovalScript | { error: string } {
  const bytes = Buffer.byteLength(content, "utf8");
  const lines = content.split(/\r?\n/).length;
  if (content.includes("\u0000")) return { error: `脚本 ${label} 含二进制内容，无法审查（fail-closed）` };
  if (bytes > SHELL_SCRIPT_MAX_BYTES) {
    return { error: `脚本 ${label} 超过单文件审查上限（${SHELL_SCRIPT_MAX_BYTES} 字节），按 fail-closed 拒绝` };
  }
  if (lines > SHELL_SCRIPT_MAX_LINES) {
    return { error: `脚本 ${label} 超过单文件行数上限（${SHELL_SCRIPT_MAX_LINES} 行），按 fail-closed 拒绝` };
  }
  return {
    label,
    content,
    bytes,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}

/** 从 npm 脚本文本中提取项目内文件引用（相对路径样式；用于展开被引用脚本/配置）。 */
function extractReferencedPaths(scriptText: string): string[] {
  const out = new Set<string>();
  const pattern = /(?:^|[\s"'`])([.\w/-]+\.(?:mjs|cjs|js|ts|tsx|jsx|json|sh|bash|py|rb|yml|yaml|toml|conf|config\.[a-z]+))(?=$|[\s"'`])/g;
  for (const match of scriptText.matchAll(pattern)) {
    const candidate = match[1]!;
    if (candidate.startsWith(".") && candidate.includes("..")) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) continue;
    out.add(candidate.replace(/^\.\//, ""));
  }
  return [...out];
}

/**
 * 构造脚本审查上下文。任何“本应是脚本但读不到/超限/在项目外”的情况都返回 `ok:false`（fail-closed）。
 * 非脚本的不透明写命令返回 `note`（judge 据命令行与只读工具判断）。
 */
export async function buildShellApprovalContext(
  input: BuildShellApprovalContextInput,
): Promise<BuildShellApprovalContextResult> {
  const readFileFn = input.readFileFn ?? fs.readFile;
  const statFn = input.statFn ?? fs.stat;
  const argv = Array.isArray(input.request.argv) ? input.request.argv.map(String) : [];
  if (argv.length === 0) return fail("缺少命令 argv，无法构造审查上下文（fail-closed）");
  const program = baseName(argv[0]!);
  const args = argv.slice(1);
  const cwd = typeof input.request.cwd === "string" && input.request.cwd !== "" ? input.request.cwd : input.projectRoot;
  const scripts: ShellApprovalScript[] = [];
  const scriptPaths: string[] = [];
  let totalBytes = 0;

  const pushScript = (script: ShellApprovalScript): string | undefined => {
    if (scripts.length >= SHELL_CONTEXT_MAX_FILES) {
      return `脚本文件数量超过审查上限（${SHELL_CONTEXT_MAX_FILES} 个），按 fail-closed 拒绝`;
    }
    if (totalBytes + script.bytes > SHELL_CONTEXT_MAX_BYTES) {
      return `脚本内容累计超过审查上限（${SHELL_CONTEXT_MAX_BYTES} 字节），按 fail-closed 拒绝`;
    }
    totalBytes += script.bytes;
    scripts.push(script);
    return undefined;
  };

  /** 读取项目内文件（有界）。`required=true` 时读不到 ⇒ fail-closed。 */
  const addFile = async (rawPath: string, label: string, required: boolean): Promise<BuildShellApprovalContextResult | undefined> => {
    const abs = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(cwd, rawPath);
    const rel = relativeInside(input.projectRoot, abs);
    if (rel === undefined) {
      return required
        ? fail(`脚本路径在项目根之外（静态可证明越界）：${rawPath}——按 fail-closed 拒绝`)
        : undefined;
    }
    let size: number;
    try {
      size = (await statFn(abs)).size;
    } catch {
      return required ? fail(`脚本不可读：${rel}（审查需要脚本内容，fail-closed）`) : undefined;
    }
    if (size > SHELL_SCRIPT_MAX_BYTES) {
      return fail(`脚本 ${rel} 超过单文件审查上限（${SHELL_SCRIPT_MAX_BYTES} 字节），按 fail-closed 拒绝`);
    }
    let content: string;
    try {
      content = await readFileFn(abs, "utf8");
    } catch {
      return required ? fail(`脚本不可读：${rel}（审查需要脚本内容，fail-closed）`) : undefined;
    }
    const bounded = boundedContent(rel, content);
    if ("error" in bounded) return fail(bounded.error);
    const allowed = input.checkWrite?.(rel).allowed === true;
    const overflow = pushScript({ ...bounded, path: rel, ...(input.checkWrite !== undefined ? { inWriteArea: allowed } : {}) });
    if (overflow !== undefined) return fail(overflow);
    if (!scriptPaths.includes(rel)) scriptPaths.push(rel);
    return undefined;
  };

  // 1) 解释器/壳：内联代码优先；否则脚本文件。
  if (INTERPRETERS.has(program) || SHELLS.has(program)) {
    // node --test <file...>：内容为测试文件（可多个，最多 3 个）。
    if (program === "node" && args.some((arg) => arg === "--test" || arg === "--test-only")) {
      const files = args.filter((arg) => arg !== "--test" && arg !== "--test-only" && !arg.startsWith("-"));
      if (files.length === 0) {
        return {
          ok: true,
          context: { note: "node --test 未指定测试文件；请按命令行与只读工具判断（无法证明安全时 manual）。" },
        };
      }
      for (const file of files) {
        const rejected = await addFile(file, "node --test 测试文件", true);
        if (rejected !== undefined) return rejected;
      }
      return {
        ok: true,
        context: {
          scripts,
          scriptPaths,
          note: "node --test 测试文件内容已随上下文提供（有界）。",
        },
      };
    }
    const inline = inlineCodeOf(program, args);
    if (inline !== undefined) {
      const bounded = boundedContent(`${program} 内联代码`, inline);
      if ("error" in bounded) return fail(bounded.error);
      const overflow = pushScript(bounded);
      if (overflow !== undefined) return fail(overflow);
      return {
        ok: true,
        context: {
          scripts,
          note: `${program} 内联代码已随审查上下文提供（有界），请核对是否越出角色写区/破坏性/越权。`,
        },
      };
    }
    const scriptPath = scriptPathOf(program, args);
    if (scriptPath !== undefined) {
      const rejected = await addFile(scriptPath, `${program} 脚本`, true);
      if (rejected !== undefined) return rejected;
      return {
        ok: true,
        context: {
          scripts,
          scriptPaths,
          note: `${program} 执行脚本文件：内容已随上下文提供（有界）。`,
        },
      };
    }
    return {
      ok: true,
      context: { note: `${program} 未见脚本文件参数（可能为交互式/模块入口）；请按命令行与任务上下文判断。` },
    };
  }

  // 2) npm/yarn/pnpm：package.json#scripts[name] 内容 + 展开其中引用的项目内文件。
  if (program === "npm" || program === "pnpm" || program === "yarn") {
    const nonOptions = args.filter((arg) => !arg.startsWith("-"));
    const sub = nonOptions[0]?.toLowerCase();
    const isInstall = sub !== undefined && ["install", "i", "ci", "it", "add"].includes(sub);
    const scriptName =
      sub === "run" || sub === "run-script"
        ? nonOptions[1]
        : sub === "test" || sub === "t" || sub === "tst"
          ? "test"
          : sub;
    const packageJsonAbs = path.join(input.projectRoot, "package.json");
    let raw: string;
    try {
      raw = await readFileFn(packageJsonAbs, "utf8");
    } catch {
      return fail(`package.json 不可读：${program} ${scriptName ?? ""} 的脚本内容无法审查（fail-closed）`);
    }
    if (Buffer.byteLength(raw, "utf8") > SHELL_PACKAGE_JSON_MAX_BYTES) {
      return fail("package.json 超过审查上限，按 fail-closed 拒绝");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail("package.json 不是合法 JSON，脚本内容无法审查（fail-closed）");
    }
    if (isInstall) {
      // 安装类：payload 为 package.json（依赖/脚本声明）与锁定文件；内容进入审查（有界）。
      const rejected = await addFile("package.json", `${program} ${sub} package.json`, true);
      if (rejected !== undefined) return rejected;
      const lockFile = program === "npm" ? "package-lock.json" : program === "pnpm" ? "pnpm-lock.yaml" : "yarn.lock";
      await addFile(lockFile, `${program} 锁定文件`, false);
      return {
        ok: true,
        context: {
          scripts,
          scriptPaths,
          note: `${program} ${sub} 的 package.json 与锁定文件内容已随上下文提供（有界）；安装脚本可能执行任意 life-cycle 脚本（若存在）.`,
        },
      };
    }
    const scriptsField =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).scripts
        : undefined;
    const scriptText =
      scriptName !== undefined && scriptsField !== null && typeof scriptsField === "object" && !Array.isArray(scriptsField)
        ? (scriptsField as Record<string, unknown>)[scriptName]
        : undefined;
    if (typeof scriptText !== "string" || scriptText.trim() === "") {
      return {
        ok: true,
        context: {
          ...(scriptName !== undefined ? { npmScriptName: scriptName } : {}),
          note: `${program}${scriptName !== undefined ? ` ${scriptName}` : ""} 未在 package.json#scripts 找到可读内容；请按命令行与只读工具判断（无法证明安全时 manual）。`,
        },
      };
    }
    const bounded = boundedContent(`package.json#scripts.${scriptName ?? ""}`, scriptText);
    if ("error" in bounded) return fail(bounded.error);
    const overflow = pushScript({ ...bounded, path: "package.json" });
    if (overflow !== undefined) return fail(overflow);
    if (!scriptPaths.includes("package.json")) scriptPaths.push("package.json");
    // 展开脚本中引用的项目内文件（深度 ≤2；有界）。引用文件超限/不可读不单列 fail（可选引用），
    // 但直达脚本本身不可读/超限已在上面 fail-closed。
    const seenRefs = new Set<string>();
    const queue: Array<{ text: string; depth: number }> = [{ text: scriptText, depth: 1 }];
    while (queue.length > 0) {
      const item = queue.shift()!;
      for (const referenced of extractReferencedPaths(item.text)) {
        if (seenRefs.has(referenced)) continue;
        seenRefs.add(referenced);
        // 只有“存在且可读”的引用才占文件额度；一旦超出累计文件上限 ⇒ fail-closed（不静默截断）。
        try {
          await statFn(path.resolve(cwd, referenced));
        } catch {
          continue;
        }
        if (scripts.length >= SHELL_CONTEXT_MAX_FILES) {
          return fail(`npm 脚本引用的项目内文件超过审查上限（${SHELL_CONTEXT_MAX_FILES} 个），按 fail-closed 拒绝`);
        }
        const rejected = await addFile(referenced, `npm 脚本引用文件：${referenced}`, false);
        if (rejected !== undefined) return rejected;
        if (item.depth < 2) {
          try {
            const abs = path.resolve(cwd, referenced);
            const content = await readFileFn(abs, "utf8");
            queue.push({ text: content, depth: item.depth + 1 });
          } catch {
            /* 可选引用读不到：不展开 */
          }
        }
      }
    }
    return {
      ok: true,
      context: {
        scripts,
        scriptPaths,
        ...(scriptName !== undefined ? { npmScriptName: scriptName } : {}),
        note: "包脚本内容取自 package.json#scripts，并已展开其中引用的项目内文件（深度 ≤2、有界）；可能仍有运行时动态加载，可用只读工具继续核对。",
      },
    };
  }

  if (program === "npx" || program === "corepack") {
    return {
      ok: true,
      context: { note: `${program} 可能下载并执行外部包/脚本（内容不可静态取得）；请按命令行判断，无法证明安全时 manual。` },
    };
  }

  // 3) 构建/任务工具：读取项目配置文件内容（不能只给 note）。
  const candidates = BUILD_CONFIG_CANDIDATES[program];
  if (candidates !== undefined) {
    for (const candidate of candidates) {
      if (scripts.length >= SHELL_CONTEXT_MAX_FILES) break;
      await addFile(candidate, `${program} 配置/脚本：${candidate}`, false);
    }
    if (scripts.length === 0) {
      // 复验 F3：构建工具无法识别内容 ⇒ 开关开启时 fail-closed（不交 judge 代批）；关闭时客户卡。
      return {
        ok: true,
        context: {
          failClosed: true,
          failClosedReason: `${program} 未找到可读的项目脚本/配置文件，无法核对写区与破坏性（fail-closed）`,
          note: `${program} 未找到可读的项目配置文件；按 fail-closed 处理（开关开启时拒绝，关闭时客户确认）。`,
        },
      };
    }
    return {
      ok: true,
      context: {
        scripts,
        scriptPaths,
        note: `${program} 的项目配置/脚本内容已随上下文提供（有界）；请核对是否会越出角色写区/破坏性。`,
      },
    };
  }

  // 4) 其它不透明写能力命令：命令行即审查材料。
  return {
    ok: true,
    context: {
      note:
        "该命令写目标无法静态解析或会执行内部脚本（复制/同步/查找删除/Git 写操作等）；应用未提供脚本正文。" +
        "请按命令行、argv、任务上下文与只读工具判断是否越出角色写区/破坏性/越权；无法证明安全时 manual。",
    },
  };
}
