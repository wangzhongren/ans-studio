// src/common/编排/shell-command-guard.ts
// shell 命令的**确定性前置封堵**（编排私有 common；纯函数，不读盘、不调模型、不碰客户通道）。
//
// 客户反馈（2026-10-19 原话）：「grep/长内联命令 这个应该让判断AI 做好封堵。」
// 真机：test-engineer 用超长内联 `node -e` 脚本 ⇒ `manual/context-too-large`；前端又因大目录/挂住的
// grep 卡了 17 分钟。客户要求判断 agent **直接封堵**这类命令，而不是靠任务文本叮嘱或客户手批。
//
// 本模块提供**两层确定性拒绝**（先于 (c) 分类/模型判断/客户通道执行）：
//   1. `inline-too-large`：长内联命令（`node -e`、`python -c`、`bash -c`、`perl -e` 等）。
//      判据（任一命中）：
//        · 命令字节长度 > 2048B；
//        · 内联代码 > 10 行；
//        · 内联代码任一行 > 1024B（单行超长）。
//      短内联（如 `bash -c "echo ok"`）**不拦**——只拦无法安全审查的长代码。
//   2. `unbounded-search`：无界/递归搜索。
//        · `grep -r/-R/--recursive` 未给具体文件/受限目录（无路径、`.`/`./`/项目根/`/`/`~`/顶层 `*`）；
//        · `rg`/`ripgrep` 未给具体路径（默认全项目扫描；被管道喂入 stdin 时不算）；
//        · `find` 的起始路径是宽范围（`/`、`~`、`.`、项目根等；`-maxdepth` 有界则放行）。
//      限定到具体文件/小目录且有界的 grep（如 `grep -rn pattern src/specific-dir`）**不拦**。
//
// 设计取舍：
//   · **fail-closed 方向**：识别不确定时宁可拒绝（拒绝是安全方向），但绝不一刀切禁 grep/find；
//   · **不是 shell 解析器**：只做保守的简单命令切分（引号/转义/管道/`&&`/`;`/命令替换）与常见
//     包装器剥离（sudo/env/timeout/xargs/…），覆盖真机命令形态即可；绕过形态（变量间接、别名、
//     更深层求值）由判断 agent 的 rubric 兜底；
//   · 结果只含 `deny` 的 reasonCode 与人话 reason；消费方（shell-gate/shell-judge）负责落审计/诊断。

import path from "node:path";
import os from "node:os";
import { normalizeArgv } from "../shared/argv-primitives.ts";

/** 命令字节阈值（超过即视为「长内联命令」；客户建议 2048B）。 */
export const SHELL_GUARD_INLINE_MAX_COMMAND_BYTES = 2048;
/** 内联代码行数阈值（>10 行即拒绝）。 */
export const SHELL_GUARD_INLINE_MAX_LINES = 10;
/** 内联代码单行字节阈值（单行超长即拒绝）。 */
export const SHELL_GUARD_INLINE_MAX_LINE_BYTES = 1024;

/** `inline-too-large` 的人话理由（客户要求：先说拒绝，再给落盘脚本出路）。 */
export const INLINE_TOO_LARGE_REASON =
  "长内联命令无法安全审查，已拒绝；请把代码写入落盘脚本，自行管理启停、显式超时退出后重试。";
/** `unbounded-search` 的人话理由。 */
export const UNBOUNDED_SEARCH_REASON =
  "无界递归搜索可能挂起，已拒绝；请限定具体文件/目录、加超时，或改用落盘脚本。";

export type ShellCommandGuardReasonCode = "inline-too-large" | "unbounded-search";

export type ShellCommandGuardResult =
  | { verdict: "allow" }
  | { verdict: "deny"; reasonCode: ShellCommandGuardReasonCode; reason: string };

export interface ShellCommandGuardInput {
  /** 命令原文（逐字；不可信数据）。 */
  command: string;
  /** 规范化 argv（可选；命令原文缺失时作为回退，且用于识别命令原文里难以看见的内联参数）。 */
  argv?: unknown;
  /** 会话工作目录（用于判定「项目根」等宽范围路径）。 */
  cwd?: string;
  /** 项目根（用于判定宽范围路径）。 */
  projectRoot?: string;
}

// —————————————————————— 公共入口 ——————————————————————

/**
 * 判定一条 shell 命令是否命中确定性前置封堵。
 * **纯函数**：不读盘、不抛错；无法解析的部分按「未命中」处理（避免因解析缺陷误杀普通命令）。
 */
export function guardShellCommand(input: ShellCommandGuardInput): ShellCommandGuardResult {
  const command = typeof input.command === "string" ? input.command : "";
  const argv = normalizeArgv(input.argv);
  const text = command.trim() !== "" ? command : argv.join(" ");
  if (text.trim() === "") return { verdict: "allow" };
  const ctx = guardContext(input);

  // —— 1) 长内联命令 ——
  const snippets = collectInlineSnippets(text, 0);
  // 命令原文可能被上游裁剪/与 argv 不同；argv 里能直接看到的内联参数也纳入判定。
  const fromArgv = inlineSnippetOf(unwrapWords(argv));
  if (fromArgv !== undefined) snippets.push(fromArgv);
  if (snippets.length > 0) {
    const size = Math.max(byteLength(text), byteLength(argv.join(" ")));
    for (const snippet of snippets) {
      if (inlineTooLarge(size, snippet.code)) {
        return { verdict: "deny", reasonCode: "inline-too-large", reason: INLINE_TOO_LARGE_REASON };
      }
    }
  }

  // —— 2) 无界/递归搜索 ——
  if (detectUnboundedSearch(text, ctx, 0)) {
    return { verdict: "deny", reasonCode: "unbounded-search", reason: UNBOUNDED_SEARCH_REASON };
  }
  return { verdict: "allow" };
}

// —————————————————————— 长内联判定 ——————————————————————

interface InlineSnippet {
  program: string;
  code: string;
}

interface InlineFlagSpec {
  /** 触发内联代码的短选项字符（`-e` / `-c` …）。 */
  chars: string[];
  /** 触发内联代码的长选项（大小写不敏感）。 */
  long: string[];
  /** 短选项是否允许字符簇（如 `perl -ne`、`bash -lc`）。 */
  cluster: boolean;
}

const INLINE_SPECS: Readonly<Record<string, InlineFlagSpec>> = {
  node: { chars: ["e", "p"], long: ["--eval", "--print"], cluster: false },
  nodejs: { chars: ["e", "p"], long: ["--eval", "--print"], cluster: false },
  bun: { chars: ["e"], long: ["--eval"], cluster: false },
  tsx: { chars: ["e"], long: ["--eval"], cluster: false },
  deno: { chars: ["e"], long: ["--eval"], cluster: false },
  python: { chars: ["c"], long: [], cluster: false },
  python3: { chars: ["c"], long: [], cluster: false },
  pypy: { chars: ["c"], long: [], cluster: false },
  pypy3: { chars: ["c"], long: [], cluster: false },
  bash: { chars: ["c"], long: [], cluster: true },
  sh: { chars: ["c"], long: [], cluster: true },
  zsh: { chars: ["c"], long: [], cluster: true },
  dash: { chars: ["c"], long: [], cluster: true },
  ksh: { chars: ["c"], long: [], cluster: true },
  fish: { chars: ["c"], long: ["--command"], cluster: true },
  perl: { chars: ["e", "E"], long: [], cluster: true },
  ruby: { chars: ["e"], long: [], cluster: true },
  php: { chars: ["r"], long: [], cluster: false },
  osascript: { chars: ["e"], long: [], cluster: false },
  lua: { chars: ["e"], long: [], cluster: false },
  luajit: { chars: ["e"], long: [], cluster: false },
  rscript: { chars: ["e"], long: [], cluster: false },
  pwsh: { chars: ["c"], long: ["--command", "--encodedcommand", "-command", "-encodedcommand"], cluster: false },
  powershell: { chars: ["c"], long: ["--command", "--encodedcommand", "-command", "-encodedcommand"], cluster: false },
};

/** shell 解释器（其 `-c` 代码还能再嵌套命令，需要递归检查）。 */
const SHELL_PROGRAMS: ReadonlySet<string> = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);

function inlineTooLarge(commandBytes: number, code: string): boolean {
  if (commandBytes > SHELL_GUARD_INLINE_MAX_COMMAND_BYTES) return true;
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > SHELL_GUARD_INLINE_MAX_LINES) return true;
  return lines.some((line) => byteLength(line) > SHELL_GUARD_INLINE_MAX_LINE_BYTES);
}

/** 从一条已剥离包装器的简单命令里提取内联代码片段（识别不到返回 undefined）。 */
function inlineSnippetOf(words: string[]): InlineSnippet | undefined {
  if (words.length === 0) return undefined;
  const program = commandName(words);
  const args = words.slice(1);

  // deno eval <code>（子命令形态，不走 -e）。
  if (program === "deno") {
    const evalIndex = args.indexOf("eval");
    if (evalIndex >= 0 && args[evalIndex + 1] !== undefined) {
      return { program, code: args[evalIndex + 1]! };
    }
  }

  const spec = INLINE_SPECS[program];
  if (spec === undefined) return undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--") return undefined;
    if (!token.startsWith("-") || token === "-") continue;

    // 长选项：--eval / --eval=code / -Command value（PowerShell 单破折号长选项）。
    if (spec.long.length > 0) {
      const eq = token.indexOf("=");
      const name = (eq >= 0 ? token.slice(0, eq) : token).toLowerCase();
      if (spec.long.includes(name)) {
        if (eq >= 0) return { program, code: token.slice(eq + 1) };
        const code = args[index + 1];
        return code !== undefined ? { program, code } : undefined;
      }
      if (token.startsWith("--")) continue;
    }

    const body = token.slice(1);
    if (body === "") continue;
    if (spec.cluster) {
      // 字符簇：`-lc` / `-ne` / `-ecode`（附着代码）。
      for (const ch of spec.chars) {
        const at = body.indexOf(ch);
        if (at < 0) continue;
        // 触发字符夹在中间（如 `perl -Mfeature`）⇒ 更可能是模块名/普通短选项簇，不是内联标志。
        if (at > 0 && at < body.length - 1) continue;
        const attached = body.slice(at + 1);
        if (attached !== "") {
          const next = args[index + 1];
          // `bash -ce 'code'`：附着的只是另一个短选项字母，真正的代码在下个 token。
          if (next !== undefined && !next.startsWith("-") && /^[A-Za-z]$/.test(attached)) {
            return { program, code: next };
          }
          return { program, code: attached };
        }
        const code = args[index + 1];
        return code !== undefined ? { program, code } : undefined;
      }
      continue;
    }
    // 非簇：`-c` / `-ccode`；`-e` / `-eprint(1)`。
    for (const ch of spec.chars) {
      if (body === ch) {
        const code = args[index + 1];
        return code !== undefined ? { program, code } : undefined;
      }
      if (body.startsWith(ch)) return { program, code: body.slice(1) };
    }
  }
  return undefined;
}

/** 递归收集命令里的内联片段（含 `bash -c '…'` 套 `node -e '…'` 与 `$()`/反引号替换）。 */
function collectInlineSnippets(text: string, depth: number): InlineSnippet[] {
  const snippets: InlineSnippet[] = [];
  const { outer, inner } = extractSubstitutions(text);
  if (depth < 3) {
    for (const sub of inner) snippets.push(...collectInlineSnippets(sub, depth + 1));
  }
  for (const segment of splitSimpleCommands(outer)) {
    const words = unwrapWords(segment.words);
    const snippet = inlineSnippetOf(words);
    if (snippet === undefined) continue;
    snippets.push(snippet);
    if (depth < 3 && SHELL_PROGRAMS.has(commandName(words))) {
      snippets.push(...collectInlineSnippets(snippet.code, depth + 1));
    }
  }
  return snippets;
}

// —————————————————————— 无界搜索判定 ——————————————————————

interface GuardContext {
  /** 相对路径的解析基准（cwd 优先，其次项目根，最后进程 cwd）。 */
  base: string;
  /** 「宽范围」比较根（cwd / 项目根 / home；解析结果等于或为其祖先即视为宽范围）。 */
  roots: string[];
  home: string;
}

function guardContext(input: ShellCommandGuardInput): GuardContext {
  const cwd = typeof input.cwd === "string" ? input.cwd.trim() : "";
  const projectRoot = typeof input.projectRoot === "string" ? input.projectRoot.trim() : "";
  let fallback = ".";
  try {
    fallback = process.cwd();
  } catch {
    // cwd 被删除等异常：保持 "."（相对路径仍可解析，且不向外抛）。
  }
  const base = cwd !== "" ? cwd : projectRoot !== "" ? projectRoot : fallback;
  const roots: string[] = [];
  for (const root of [cwd, projectRoot]) {
    if (root !== "") roots.push(root);
  }
  let home = "";
  try {
    home = os.homedir();
  } catch {
    home = "";
  }
  return { base, roots, home };
}

/** 命令是否含**无界/递归搜索**（含嵌套 shell 代码与命令替换）。 */
function detectUnboundedSearch(text: string, ctx: GuardContext, depth: number): boolean {
  if (depth > 3) return false;
  const { outer, inner } = extractSubstitutions(text);
  if (inner.some((sub) => detectUnboundedSearch(sub, ctx, depth + 1))) return true;

  for (const segment of splitSimpleCommands(outer)) {
    const words = unwrapWords(segment.words);
    if (words.length === 0) continue;
    const program = commandName(words);
    const args = words.slice(1);

    if (SHELL_PROGRAMS.has(program)) {
      const snippet = inlineSnippetOf(words);
      if (snippet !== undefined && detectUnboundedSearch(snippet.code, ctx, depth + 1)) return true;
      continue;
    }
    if (program === "grep" || program === "egrep" || program === "fgrep" || program === "rgrep") {
      if (grepIsUnbounded(program, args, ctx)) return true;
      continue;
    }
    if (program === "rg" || program === "ripgrep") {
      if (rgIsUnbounded(args, ctx, segment.fedByPipe)) return true;
      continue;
    }
    if (program === "find") {
      if (findIsUnbounded(args, ctx)) return true;
    }
  }
  return false;
}

/** 带值的短选项（消费下一个 token）；grep 用。 */
const GREP_SHORT_VALUE: ReadonlySet<string> = new Set(["e", "f", "m", "A", "B", "C", "d", "D"]);
/** 带值的长选项；grep 用。 */
const GREP_LONG_VALUE: ReadonlySet<string> = new Set([
  "--regexp", "--file", "--max-count", "--after-context", "--before-context", "--context",
  "--include", "--exclude", "--exclude-from", "--exclude-dir", "--include-dir", "--label",
  "--binary-files", "--devices", "--directories", "--group-separator", "--color", "--colour",
]);

/**
 * grep 族：仅当**递归**且路径为空/含宽范围路径时判无界。
 * 非递归 grep 不在此规则内（短文件/管道是正常用法）；有界递归 grep 放行。
 */
function grepIsUnbounded(program: string, args: string[], ctx: GuardContext): boolean {
  let recursive = program === "rgrep";
  let patternFromOption = false;
  const operands: string[] = [];
  let afterDoubleDash = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (afterDoubleDash) {
      operands.push(token);
      continue;
    }
    if (token === "--") {
      afterDoubleDash = true;
      continue;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = (eq >= 0 ? token.slice(0, eq) : token).toLowerCase();
      if (name === "--recursive" || name === "--dereference-recursive") recursive = true;
      if (name === "--regexp" || name === "--file") {
        patternFromOption = true;
        if (eq < 0) index += 1;
        continue;
      }
      if (GREP_LONG_VALUE.has(name) && eq < 0) index += 1;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const body = token.slice(1);
      if (/[rR]/.test(body)) recursive = true;
      if (body.startsWith("e") || body.startsWith("f")) {
        patternFromOption = true;
        if (body.length === 1) index += 1;
        continue;
      }
      if (GREP_SHORT_VALUE.has(body[0]!) && body.length === 1) index += 1;
      continue;
    }
    operands.push(token);
  }

  if (!recursive) return false;
  const paths = patternFromOption ? operands : operands.slice(1);
  if (paths.length === 0) return true;
  return paths.some((item) => isWidePath(item, ctx));
}

/** 带值的短选项（消费下一个 token）；rg 用。 */
const RG_SHORT_VALUE: ReadonlySet<string> = new Set([
  "e", "f", "g", "t", "T", "A", "B", "C", "m", "j", "M", "r", "E", "d", "p",
]);
/** 带值的长选项；rg 用。 */
const RG_LONG_VALUE: ReadonlySet<string> = new Set([
  "--regexp", "--file", "--glob", "--type", "--type-not", "--after-context", "--before-context",
  "--context", "--max-count", "--threads", "--max-columns", "--replace", "--encoding", "--sort",
  "--sortr", "--pre", "--pre-glob", "--ignore-file", "--type-add", "--type-clear", "--colors",
  "--color", "--engine", "--dfa-size-limit", "--regex-size-limit", "--path-separator",
  "--field-match-separator", "--field-context-separator", "--field-separator", "--max-filesize",
  "--max-depth", "--hostname-bin", "--hyperlink-format",
]);

/** rg：默认递归扫描 cwd；无路径（且非管道喂入）或含宽范围路径即无界。 */
function rgIsUnbounded(args: string[], ctx: GuardContext, fedByPipe: boolean): boolean {
  let patternFromOption = false;
  let noPatternMode = false;
  let noScan = false;
  let boundedDepth = false;
  const operands: string[] = [];
  let afterDoubleDash = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (afterDoubleDash) {
      operands.push(token);
      continue;
    }
    if (token === "--") {
      afterDoubleDash = true;
      continue;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = (eq >= 0 ? token.slice(0, eq) : token).toLowerCase();
      if (name === "--regexp" || name === "--file") {
        patternFromOption = true;
        if (eq < 0) index += 1;
        continue;
      }
      if (name === "--files") {
        noPatternMode = true;
        continue;
      }
      if (name === "--version" || name === "--help" || name === "--type-list") {
        noScan = true;
        continue;
      }
      if (name === "--max-depth") {
        boundedDepth = true;
        if (eq < 0) index += 1;
        continue;
      }
      if (RG_LONG_VALUE.has(name) && eq < 0) index += 1;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const body = token.slice(1);
      if (body === "V" || body === "h") {
        noScan = true;
        continue;
      }
      if (RG_SHORT_VALUE.has(body[0]!) && body.length === 1) index += 1;
      continue;
    }
    operands.push(token);
  }

  if (noScan) return false;
  const paths = patternFromOption || noPatternMode ? operands : operands.slice(1);
  if (paths.length === 0) {
    if (boundedDepth) return false;
    // `cat x | rg foo`：stdin 有界，不是全项目扫描。
    return !fedByPipe;
  }
  return paths.some((item) => isWidePath(item, ctx));
}

/** find：起始路径含宽范围即无界；显式 `-maxdepth` 视为有界，放行。 */
function findIsUnbounded(args: string[], ctx: GuardContext): boolean {
  let index = 0;
  while (index < args.length) {
    const token = args[index]!;
    if (token === "-L" || token === "-H" || token === "-P") {
      index += 1;
      continue;
    }
    if (token === "-D") {
      index += 2;
      continue;
    }
    if (/^-O\d*$/.test(token)) {
      index += 1;
      continue;
    }
    if (token === "--") index += 1;
    break;
  }

  const paths: string[] = [];
  while (index < args.length) {
    const token = args[index]!;
    if (token.startsWith("-") || token === "(" || token === ")" || token === "!" || token === ",") break;
    paths.push(token);
    index += 1;
  }
  if (paths.length === 0) return false;
  if (!paths.some((item) => isWidePath(item, ctx))) return false;
  return findMaxDepth(args) === undefined;
}

/** `-maxdepth N` / `-maxdepth=N`：有界遍历（任意有限深度都不判无界）。 */
function findMaxDepth(args: string[]): number | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "-maxdepth") {
      const value = Number(args[index + 1]);
      if (Number.isInteger(value) && value >= 0) return value;
    }
    const attached = /^-maxdepth=(\d+)$/.exec(token);
    if (attached !== null) return Number(attached[1]);
  }
  return undefined;
}

/** 命令替换在「外层文本」里的占位符：保留「这里有一个动态值」这一事实（NUL 不可能出现在命令里）。 */
const SUBSTITUTION_MARKER = "\u0000";

/** 路径是否「宽范围」（扫描它等于/大于整个项目）：`.`、`./`、`..`、项目根/cwd（或其祖先）、
 * `/`、`~`、`$HOME`/`$PWD`、顶层 `*`。具体子目录/文件（`src/…`、`./src`、`/tmp/x`）不算。
 * 动态命令替换（`$(pwd)` 等）无法静态确认范围 ⇒ 按宽范围处理（fail-closed）。 */
function isWidePath(token: string, ctx: GuardContext): boolean {
  let value = token.trim();
  if (value === "") return false;
  if (value.includes(SUBSTITUTION_MARKER)) return true;

  if (value === "~" || value === "~/" || /^~[^/]*$/.test(value)) return true;
  if (value === "$HOME" || value === "${HOME}" || value === "$PWD" || value === "${PWD}") return true;
  // 只展开已知变量；未知变量保持原样（保守按窄路径，不误杀）。
  value = value
    .replace(/^\$\{PWD\}/, ctx.base)
    .replace(/^\$PWD/, ctx.base);
  if (ctx.home !== "") {
    value = value
      .replace(/^\$\{HOME\}/, ctx.home)
      .replace(/^\$HOME/, ctx.home);
    if (value.startsWith("~/")) value = `${ctx.home}${value.slice(1)}`;
  }

  if (value === "." || value === "./" || value === "./." || value === ".." || value === "../") return true;
  if (/^[A-Za-z]:[\\/]?$/.test(value)) return true;

  // 顶层通配（`*` / `**` / `*/…` / `**/…`）会展开成项目根全体。
  const withoutDot = value.startsWith("./") ? value.slice(2) : value;
  const firstSegment = withoutDot.split("/")[0] ?? "";
  if (firstSegment === "*" || firstSegment === "**") return true;

  let resolved: string;
  try {
    resolved = path.resolve(ctx.base, value);
  } catch {
    return false;
  }
  if (resolved === path.parse(resolved).root) return true;
  for (const root of [...ctx.roots, ...(ctx.home !== "" ? [ctx.home] : [])]) {
    let normalized: string;
    try {
      normalized = path.resolve(root);
    } catch {
      continue;
    }
    if (normalized === "") continue;
    if (resolved === normalized) return true;
    // resolved 是根的祖先（如 /Users 之于 /Users/me/project）⇒ 扫描范围比项目大。
    if (normalized.startsWith(resolved + path.sep)) return true;
  }
  return false;
}

// —————————————————————— 命令切分 / 包装器剥离 ——————————————————————

interface SimpleCommand {
  words: string[];
  /** 本段是否由管道喂入 stdin（`… | rg foo`）。 */
  fedByPipe: boolean;
}

/** 提取 `$(…)` 与反引号命令替换，返回外层文本与内层命令（单引号内不展开）。 */
function extractSubstitutions(command: string): { outer: string; inner: string[] } {
  const inner: string[] = [];
  let outer = "";
  let index = 0;
  let inSingle = false;

  while (index < command.length) {
    const ch = command[index]!;
    if (inSingle) {
      outer += ch;
      if (ch === "'") inSingle = false;
      index += 1;
      continue;
    }
    if (ch === "\\") {
      outer += ch;
      if (index + 1 < command.length) outer += command[index + 1];
      index += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      outer += ch;
      index += 1;
      continue;
    }
    if (ch === "$" && command[index + 1] === "(") {
      let depth = 0;
      let quote: "'" | "\"" | null = null;
      let cursor = index + 1;
      for (; cursor < command.length; cursor += 1) {
        const current = command[cursor]!;
        if (quote === "'") {
          if (current === "'") quote = null;
          continue;
        }
        if (quote === "\"") {
          if (current === "\\") {
            cursor += 1;
            continue;
          }
          if (current === "\"") quote = null;
          continue;
        }
        if (current === "'") {
          quote = "'";
          continue;
        }
        if (current === "\"") {
          quote = "\"";
          continue;
        }
        if (current === "\\") {
          cursor += 1;
          continue;
        }
        if (current === "(") depth += 1;
        else if (current === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (cursor < command.length) {
        inner.push(command.slice(index + 2, cursor));
        outer += SUBSTITUTION_MARKER;
        index = cursor + 1;
        continue;
      }
      outer += ch;
      index += 1;
      continue;
    }
    if (ch === "`") {
      let cursor = index + 1;
      let buffer = "";
      let closed = false;
      while (cursor < command.length) {
        const current = command[cursor]!;
        if (current === "\\" && cursor + 1 < command.length) {
          buffer += command[cursor + 1];
          cursor += 2;
          continue;
        }
        if (current === "`") {
          closed = true;
          break;
        }
        buffer += current;
        cursor += 1;
      }
      if (closed) {
        inner.push(buffer);
        outer += SUBSTITUTION_MARKER;
        index = cursor + 1;
        continue;
      }
    }
    outer += ch;
    index += 1;
  }
  return { outer, inner };
}

/** 按未引用的 `|`/`||`/`&&`/`;`/换行/括号切分简单命令（保留管道喂入标记）。 */
function splitSimpleCommands(text: string): SimpleCommand[] {
  const segments: SimpleCommand[] = [];
  let words: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: "'" | "\"" | null = null;
  let fedByPipe = false;

  const endWord = (): void => {
    if (!hasToken) return;
    words.push(current);
    current = "";
    hasToken = false;
  };
  const endSegment = (nextFedByPipe: boolean): void => {
    endWord();
    if (words.length > 0) segments.push({ words, fedByPipe });
    words = [];
    fedByPipe = nextFedByPipe;
  };

  let index = 0;
  while (index < text.length) {
    const ch = text[index]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
      index += 1;
      continue;
    }
    if (quote === "\"") {
      if (ch === "\"") {
        quote = null;
        index += 1;
        continue;
      }
      if (ch === "\\" && index + 1 < text.length) {
        const next = text[index + 1]!;
        if (next !== "\n") current += next;
        index += 2;
        continue;
      }
      current += ch;
      index += 1;
      continue;
    }
    if (ch === "\\") {
      if (index + 1 < text.length) {
        const next = text[index + 1]!;
        if (next !== "\n") current += next;
        index += 2;
      } else {
        index += 1;
      }
      hasToken = true;
      continue;
    }
    if (ch === "'") {
      quote = "'";
      hasToken = true;
      index += 1;
      continue;
    }
    if (ch === "\"") {
      quote = "\"";
      hasToken = true;
      index += 1;
      continue;
    }
    if (ch === "$" && (text[index + 1] === "'" || text[index + 1] === "\"")) {
      quote = text[index + 1] as "'" | "\"";
      hasToken = true;
      index += 2;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      endWord();
      index += 1;
      continue;
    }
    if (ch === "\n") {
      endSegment(false);
      index += 1;
      continue;
    }
    if (ch === "|") {
      if (text[index + 1] === "|") {
        endSegment(false);
        index += 2;
      } else if (text[index + 1] === "&") {
        endSegment(true);
        index += 2;
      } else {
        endSegment(true);
        index += 1;
      }
      continue;
    }
    if (ch === "&") {
      endSegment(false);
      index += text[index + 1] === "&" ? 2 : 1;
      continue;
    }
    if (ch === ";" || ch === "(" || ch === ")") {
      // 注意：`{`/`}` 不切开——`${VAR}` 与花括号展开都属于词的一部分，切开会破坏变量路径判定。
      endSegment(false);
      index += 1;
      continue;
    }
    current += ch;
    hasToken = true;
    index += 1;
  }
  endSegment(false);
  return segments;
}

/** 包装器（前缀程序）：剥离后按真实程序判定。 */
const WRAPPER_PROGRAMS: ReadonlySet<string> = new Set([
  "sudo", "doas", "env", "command", "builtin", "exec", "time", "nohup", "nice", "ionice",
  "stdbuf", "timeout", "xargs", "setsid", "unbuffer",
]);

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** 剥离环境赋值与常见包装器（`sudo -u x env A=1 timeout 5 grep …` → `grep …`）。 */
function unwrapWords(words: string[]): string[] {
  let index = 0;
  const skipAssignments = (): void => {
    while (index < words.length && ASSIGNMENT_RE.test(words[index]!)) index += 1;
  };
  skipAssignments();
  for (let guard = 0; guard < 8; guard += 1) {
    const program = programName(words[index] ?? "");
    if (!WRAPPER_PROGRAMS.has(program)) break;
    index += 1;
    if (program === "timeout") {
      index = skipFlags(words, index, new Set(["-s", "--signal", "-k", "--kill-after"]));
      if (index < words.length) index += 1; // duration
    } else if (program === "nice") {
      index = skipFlags(words, index, new Set(["-n", "--adjustment"]));
      if (index < words.length && /^[-+]?\d+$/.test(words[index]!)) index += 1;
    } else if (program === "ionice") {
      index = skipFlags(words, index, new Set(["-c", "-n", "-p", "-P", "-u"]));
    } else if (program === "xargs") {
      index = skipFlags(words, index, new Set([
        "-I", "-n", "-P", "-L", "-s", "-d", "-E", "-a", "-e", "--delimiter", "--max-args",
        "--max-procs", "--max-lines", "--max-chars", "--arg-file", "--eof", "--replace",
      ]));
    } else if (program === "env") {
      while (index < words.length && (words[index]!.startsWith("-") || ASSIGNMENT_RE.test(words[index]!))) {
        const token = words[index]!;
        if (token === "-u" || token === "--unset") index += 2;
        else index += 1;
      }
    } else if (program === "sudo" || program === "doas") {
      index = skipFlags(words, index, new Set([
        "-u", "-g", "-p", "-C", "-h", "-U", "-r", "-t", "-D", "--user", "--group",
        "--prompt", "--close-from", "--host", "--other-user", "--role", "--type", "--chdir",
      ]));
    } else if (program === "stdbuf") {
      index = skipFlags(words, index, new Set(["-i", "-o", "-e"]));
    } else {
      // command/builtin/exec/time/nohup/setsid/unbuffer：只剥选项。
      index = skipFlags(words, index, new Set());
    }
    skipAssignments();
  }
  return words.slice(index);
}

/** 跳过选项；`valueOptions` 里的选项**精确出现**时还要消费一个值。 */
function skipFlags(words: string[], start: number, valueOptions: ReadonlySet<string>): number {
  let index = start;
  while (index < words.length && words[index]!.startsWith("-") && words[index] !== "-") {
    const token = words[index]!;
    if (valueOptions.has(token)) index += 2;
    else index += 1;
  }
  return index;
}

function commandName(words: string[]): string {
  return programName(words[0] ?? "");
}

/** 程序名（去路径、去 `.exe`、小写）。 */
function programName(word: string): string {
  const base = word.split(/[\\/]/).pop() ?? word;
  return base.replace(/\.exe$/i, "").toLowerCase();
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
