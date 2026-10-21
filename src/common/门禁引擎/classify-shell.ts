// 门禁引擎：V3 shell 命令级闸 (c) —— 确定性规则/白名单引擎（纯函数，无副作用）
//
// 冻结契约（设计 §7.2/§7.4/§14）：`classifyShell(argv, rules) => "allow" | "deny" | "risky" | "review"`。
// 判据是「这条命令是否被允许执行」，**不是**「路径是否在边界内」——shell 里的 `echo x > 路径`
// 不经过 resolveWrite（§7.1），故这道闸的判据与路径判定正交。
//
// 四态（§7.3 → §14.1 重定）：白名单命中 → allow；硬拒命中 → deny（绝对否决，不可被 (b)/(a) 翻案）；
//   命中「危险但有正当用途」→ risky（**必过 (b)；(b) 放行后仍须过 (a)**，§14.2）；都不命中 → review
//   （交 (b)；b 明确即终结，b 拿不准/不可用才升 (a)）。
//
// fail-closed（§7.5 第一条）——结构上不可能退化：
//   * classifyShell **要求显式传入 rules**（无默认参数、无 rules 可选重载）；
//   * rules 缺失/非对象/版本未知/形状非法 → 返回 "deny"（视为硬拒）；
//   * argv 缺失/为空/含非字符串元素 → 返回 "deny"；
//   * 唯一通向 "allow" 的分支是「命中一条已通过校验的白名单条目」——没有规则 ⇒ 结构上到不了 allow。
//
// —— 执行模型前提（§7.10，T8a 重述）——
// Pi适配器执行 `spawn(argv[0], argv.slice(1), { shell:false })`——**命令不经 shell 解释**。
// 因此本规则集**按「程序 + argv」分类**：argv[0] 程序黑/白名单、危险 flag、写目标参数；
// **不按 shell 元字符**。`> | & ; $( ` <<` 换行 在这个模型下**只是普通参数字节**，永不以「被解释」的
// 形式出现：把它们当硬拒项扫是**空转的**，更糟——给人「拦住了重定向」的**假安全感**，还误杀
// `grep 'a|b'` 一类的正常参数。故本引擎**仅在 `rules.executionModel !== "argv-noshell"` 时**才扫
// `denyTokens`（见 classifyShellDetailed 第 6 步与 rules.executionModel 的类型注释）。
//
//   ★★ 耦合（必须记牢）★★：上面的「不扫元字符」前提**绑定 `shell:false`**。一旦执行层改回
//   **原始命令串 / `shell:true`**，**元字符规则必须恢复**——把 `rules.executionModel` 改为
//   `"shell-string"`（或删掉该字段，缺省即最保守地恢复扫描），否则 `> /path`、`$(...)`、管道到 shell
//   之类会被**漏掉**，出现「以为拦了、其实没拦」的洞。规则集里**保留 `denyTokens` 数据**正是为此：
//   它是**待恢复**的元字符集合，不是当前生效的判据。
//
// 关于 argv（§7.2/§7.10）：接口收的是 `argv: string[]`（程序 + 参数），不是原始命令串。
//   * `argv[0]` 含空白（说明塞进来的是**整条命令串**而非程序名）→ deny（无法可靠解析，fail-closed）；
//   * `sh -c "…"` 把真实命令藏在参数里、无法可靠反推：**外壳/解释器本身就在硬拒名单**
//     （sh/bash/cmd/pwsh/…），故这一类「在参数里重新引入 shell」的形态仍被守住。
//
// —— risky 的判据与前提（§14.2/§14.3-B，T40）——
// 危险命令**不再一概终结**（客户 2026-10-11 推翻 §7.3「危险即硬拒」）：`rm` 不是永远错的
//   （删自己刚生成的临时文件合理）——一概硬拒即「过宽则天天误杀」。故新增第四档 `risky`：
//   **危险但有正当用途**的命令 → 过 (b) pm 审读，(b) 判放行后**仍须过 (a) 客户看原文确认**。
//   **但**：`risky` 只给「**程序名在 argv 里以可读元素出现、语义可判**」的形态——因为 (a) 是**客户看命令原文**，
//   得看得懂（`rm -rf build/` 看得懂）。**re-shell / 内联求值**（`sh -c "…"`/`eval`/`node -e`/`awk`…）**不在此列、
//   仍硬拒终结**：它们 `argv` 里**没有可读的程序名**（真命令是那段 string，其影响发生在子进程内、**完全不经过
//   `resolveWrite`**），放行 = 整体绕过写边界（§14.4）。**「argv 里看得见」是 (a) 能兜住 risky 的前提。**

import type {
  ShellClass,
  ShellExecutionModel,
  ShellHardDenyRule,
  ShellReadOnlyRule,
  ShellRiskyRule,
  ShellRules,
} from "../../model/decision.ts";

/** 引擎已知的规则集版本；rules.version 与之不符 → 硬拒（版本未知，fail-closed）。
 *  "2"：T8a 起规则集按「程序 + argv」重述、元字符仅在 `executionModel` 会经 shell 解释时生效（§7.10）。
 *  "3"：T40 起 `ShellClass` 增第四档 `risky`（§14）；硬拒名单重划（re-shell/内联求值/提权/系统破坏/LOLBin
 *       仍硬拒；删除/原地改写/编辑器/进程服务/网络/间接执行器/构建/包管理/git 写 → risky）；规则集新增
 *       `riskyPrograms` 段。旧 "2" 规则集因版本不符一律被拒（fail-closed）。 */
export const SHELL_RULES_VERSION = "3";

/** 带原因的判定结果；classifyShell 只取其中的 decision（冻结契约是四态字符串）。 */
export interface ShellVerdict {
  decision: ShellClass;
  reason: string;
  ruleId: string; // deny:rules-invalid / deny:argv-invalid / deny:opaque-command / deny:program:<id> / deny:token:<t> / risky:program:<id> / allow:readonly:<id> / review
}

const EXE_SUFFIX = /\.(exe|cmd|bat|ps1|com)$/i;

/** 去掉一层成对引号（"…" 或 '…'） */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1);
  }
  return s;
}

/** argv[0] → 程序名（basename，去 exe/cmd/bat/ps1/com 后缀，小写比较） */
function programName(raw: string): string {
  const q = stripQuotes(raw.trim());
  const segs = q.split(/[\\/]/).filter((s) => s !== "");
  const base = segs.length > 0 ? segs[segs.length - 1] : q;
  return base.replace(EXE_SUFFIX, "").toLowerCase();
}

/** argv 中是否出现任一 flag（精确匹配，或 `flag=…` 前缀形式，如 --output=/tmp/x） */
function hasFlag(args: string[], flags: string[]): boolean {
  for (const a of args) {
    for (const f of flags) {
      if (f === "") continue;
      if (a === f || a.startsWith(f + "=")) return true;
    }
  }
  return false;
}

/** 校验规则集形状与版本；合法返回 null，非法返回原因（调用方据此 fail-closed 硬拒）。 */
function validateRules(rules: unknown): string | null {
  if (typeof rules !== "object" || rules === null || Array.isArray(rules)) return "规则集缺失或非对象";
  const r = rules as Record<string, unknown>;
  if (r.version !== SHELL_RULES_VERSION) {
    return `规则集版本未知或缺失：${String(r.version)}（引擎期望 ${SHELL_RULES_VERSION}）`;
  }
  // 规则集 id 可选；若给出须为非空字符串（审计归属用，§7.6）。
  if (r.id !== undefined && (typeof r.id !== "string" || r.id === "")) {
    return "id 若存在必须是非空字符串";
  }
  // 命令解释模型可选；若给出须为已知取值（未知模型 → 硬拒，fail-closed；§7.10）。
  if (
    r.executionModel !== undefined &&
    r.executionModel !== "argv-noshell" &&
    r.executionModel !== "shell-string"
  ) {
    return `executionModel 未知：${String(r.executionModel)}（须为 "argv-noshell" | "shell-string"）`;
  }
  const isStrArr = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!isStrArr(r.denyTokens)) return "denyTokens 必须是字符串数组";
  if (!Array.isArray(r.readOnly)) return "readOnly 必须是数组";
  if (!Array.isArray(r.hardDenyPrograms)) return "hardDenyPrograms 必须是数组";
  // riskyPrograms 为 v3 必需项：缺失/非数组 → 硬拒（fail-closed，§7.5）。
  // 否则「危险但有正当用途」的命令会静默降级为 review（只过 (b)、不强制 (a)），即门禁被削弱。
  if (!Array.isArray(r.riskyPrograms)) return "riskyPrograms 必须是数组（v3 必需；缺失即 fail-closed 硬拒）";

  const ro = r.readOnly as unknown[];
  for (let i = 0; i < ro.length; i++) {
    const e = ro[i];
    if (typeof e !== "object" || e === null) return `readOnly[${i}] 非对象`;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") return `readOnly[${i}] 缺少 id`;
    if (typeof o.program !== "string" || o.program === "") return `readOnly[${i}] 缺少 program`;
    if (o.subcommands !== undefined && !isStrArr(o.subcommands)) return `readOnly[${i}] 的 subcommands 非法`;
    if (o.blockedFlags !== undefined && !isStrArr(o.blockedFlags)) return `readOnly[${i}] 的 blockedFlags 非法`;
  }
  const hd = r.hardDenyPrograms as unknown[];
  for (let i = 0; i < hd.length; i++) {
    const e = hd[i];
    if (typeof e !== "object" || e === null) return `hardDenyPrograms[${i}] 非对象`;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") return `hardDenyPrograms[${i}] 缺少 id`;
    if (!isStrArr(o.programs) || o.programs.length === 0) return `hardDenyPrograms[${i}] 的 programs 非法`;
    if (o.onlyWithFlag !== undefined && !isStrArr(o.onlyWithFlag)) return `hardDenyPrograms[${i}] 的 onlyWithFlag 非法`;
    if (o.onlyWithSubcommand !== undefined && !isStrArr(o.onlyWithSubcommand)) {
      return `hardDenyPrograms[${i}] 的 onlyWithSubcommand 非法`;
    }
  }
  const rk = r.riskyPrograms as unknown[];
  for (let i = 0; i < rk.length; i++) {
    const e = rk[i];
    if (typeof e !== "object" || e === null) return `riskyPrograms[${i}] 非对象`;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") return `riskyPrograms[${i}] 缺少 id`;
    if (!isStrArr(o.programs) || o.programs.length === 0) return `riskyPrograms[${i}] 的 programs 非法`;
    if (o.onlyWithFlag !== undefined && !isStrArr(o.onlyWithFlag)) return `riskyPrograms[${i}] 的 onlyWithFlag 非法`;
    if (o.onlyWithSubcommand !== undefined && !isStrArr(o.onlyWithSubcommand)) {
      return `riskyPrograms[${i}] 的 onlyWithSubcommand 非法`;
    }
  }
  return null;
}

/** 硬拒程序匹配：program 命中且（若设了约束）flag/子命令满足条件时返回规则 id，否则 null */
function matchHardDeny(args: string[], program: string, rules: ShellHardDenyRule[]): string | null {
  for (const r of rules) {
    if (!r.programs.map((p) => p.toLowerCase()).includes(program)) continue;
    if (r.onlyWithFlag !== undefined && !hasFlag(args, r.onlyWithFlag)) continue;
    if (r.onlyWithSubcommand !== undefined) {
      const sub = typeof args[1] === "string" ? args[1].toLowerCase() : "";
      if (!r.onlyWithSubcommand.map((s) => s.toLowerCase()).includes(sub)) continue;
    }
    return r.id;
  }
  return null;
}

/** risky 程序匹配（§14.3-B）：program 命中且（若设了约束）flag/子命令满足条件时返回规则 id，否则 null。
 *  ★ 只对「程序名在 argv 里可见」的形态生效；re-shell/内联求值**不经此路**（它们在 hardDenyPrograms，先被拦）。 */
function matchRisky(args: string[], program: string, rules: ShellRiskyRule[]): string | null {
  for (const r of rules) {
    if (!r.programs.map((p) => p.toLowerCase()).includes(program)) continue;
    if (r.onlyWithFlag !== undefined && !hasFlag(args, r.onlyWithFlag)) continue;
    if (r.onlyWithSubcommand !== undefined) {
      const sub = typeof args[1] === "string" ? args[1].toLowerCase() : "";
      if (!r.onlyWithSubcommand.map((s) => s.toLowerCase()).includes(sub)) continue;
    }
    return r.id;
  }
  return null;
}

// —————————————————————— 窄只读 re-shell 白名单（客户 2026-10-18 裁定）——————————————————————
// `cmd /c dir`、`powershell -Command "Test-Path '<字面路径>'"` 一类**只读探针**不应硬拒；
// 但 re-shell 把真命令藏在参数 string 里、可能带元字符/变量展开，故只开两个极窄形态，且**先于**
// hardDenyPrograms 的 reshell 规则判定。其余 cmd/powershell/sh -c/pwsh/绝对路径可执行文件仍 deny。
//
// 防绕过要点：
//  - argv[0] 必须是**裸程序名**（不含 / 或 \）——绝对路径可执行文件仍走 deny；
//  - 整个 argv 不得含元字符/变量展开：& | < > ^ % ! $ ` ; ( ) 与换行/回车（cmd 与 PowerShell 都会在
//    子进程内解释这些字符，argv-noshell 的前提在 re-shell 上不成立）；
//  - cmd：[/d] /c 后**恰为** dir 或 where（大小写不敏感），其后只读参数可带；
//  - powershell：恰为 -NoProfile -Command，命令**恰为** Test-Path '<路径>'（单/双引号，路径内不含
//    引号/元字符）；不接 `Get-Process`、脚本块、管道等其它形态。
const RESHELL_ALLOW_METACHARS = ["&", "|", "<", ">", "^", "%", "!", "$", "`", ";", "(", ")", "\n", "\r"];

function hasReshellAllowMetachar(s: string): boolean {
  return RESHELL_ALLOW_METACHARS.some((t) => s.includes(t));
}

/** argv[0] 是否为裸程序名（无路径分隔符；引号先去一层）。 */
function isBareProgramName(raw: string): boolean {
  const q = stripQuotes(raw.trim());
  return !q.includes("/") && !q.includes("\\");
}

/** 只读 re-shell 白名单：命中返回规则 id（readonly-reshell），否则 null。 */
function matchReadonlyReshell(argv: string[], program: string): string | null {
  if (!isBareProgramName(argv[0])) return null;
  if (argv.some(hasReshellAllowMetachar)) return null;
  const args = argv.slice(1);
  if (program === "cmd") {
    let i = 0;
    if (args[i]?.toLowerCase() === "/d") i += 1;
    if (args[i]?.toLowerCase() !== "/c") return null;
    i += 1;
    const sub = args[i]?.toLowerCase();
    if (sub !== "dir" && sub !== "where") return null;
    return "readonly-reshell";
  }
  if (program === "powershell") {
    if (args.length !== 3) return null;
    if (args[0]?.toLowerCase() !== "-noprofile") return null;
    if (args[1]?.toLowerCase() !== "-command") return null;
    const command = args[2];
    if (typeof command !== "string") return null;
    // splitCommand 会剥掉外层引号、保留内层引号：`-Command "Test-Path 'C:\x'"` → `Test-Path 'C:\x'`。
    if (!/^test-path\s+(['"])([^'"]+)\1$/i.test(command.trim())) return null;
    return "readonly-reshell";
  }
  return null;
}

/** 白名单匹配：program 命中且子命令/禁用 flag 条件满足时返回规则 id，否则 null */
function matchReadOnly(args: string[], program: string, rules: ShellReadOnlyRule[]): string | null {
  for (const r of rules) {
    if (r.program.toLowerCase() !== program) continue;
    if (r.blockedFlags !== undefined && hasFlag(args, r.blockedFlags)) continue;
    if (r.subcommands !== undefined) {
      const sub = typeof args[1] === "string" ? args[1].toLowerCase() : "";
      if (!r.subcommands.map((s) => s.toLowerCase()).includes(sub)) continue;
    }
    return r.id;
  }
  return null;
}

// rg 的带值选项仅用于跳过参数值（例如 -e --pre 是模式），不是新的安全白名单。
// D3 只识别显式 --pre；隐藏配置、其他间接执行能力沿用已接受的风险取舍。
const RG_VALUE_OPTIONS = new Set([
  "--regexp", "--file", "--pre-glob", "--dfa-size-limit", "--encoding", "--engine",
  "--max-count", "--regex-size-limit", "--threads", "--glob", "--iglob", "--ignore-file",
  "--max-depth", "--max-filesize", "--type", "--type-not", "--type-add", "--type-clear",
  "--after-context", "--before-context", "--color", "--colors", "--context",
  "--context-separator", "--field-context-separator", "--field-match-separator",
  "--hostname-bin", "--hyperlink-format", "--max-columns", "--path-separator", "--replace",
  "--sort", "--sortr", "--generate",
]);
const RG_SHORT_VALUE_OPTIONS = new Set("efEmjgdtTABCMr".split(""));

/** 只看选项位置；选项可出现在位置参数后，直到 --。短选项组合的首个带值项吃掉余部或下一项。 */
function hasRgPreprocessor(args: string[]): boolean {
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (arg === "--pre" || arg.startsWith("--pre=")) return true;
    if (RG_VALUE_OPTIONS.has(arg)) {
      i += 1;
    } else if (arg.startsWith("-") && !arg.startsWith("--")) {
      for (let j = 1; j < arg.length; j++) {
        if (!RG_SHORT_VALUE_OPTIONS.has(arg[j])) continue;
        if (j === arg.length - 1) i += 1;
        break;
      }
    }
  }
  return false;
}

/** 只在原 allow 出口调用：不改变既有 deny/risky，也不引入文件系统身份核验。 */
function reviewExplicitExecution(args: string[], program: string): ShellVerdict | null {
  const token = stripQuotes(args[0].trim());
  if (/[\\/]/.test(token) || /^[a-z]:/i.test(token) || /\.(cmd|bat|ps1)$/i.test(token)) {
    return {
      decision: "review",
      reason: "显式程序路径或脚本包装不能仅凭 basename 获得只读免审批资格，交既有审批",
      ruleId: "review:explicit-program",
    };
  }
  if (program === "rg" && hasRgPreprocessor(args)) {
    return {
      decision: "review",
      reason: "rg --pre 预处理参数可启动外部程序，交既有审批",
      ruleId: "review:rg-preprocessor",
    };
  }
  return null;
}

/**
 * 带原因的判定。参数取 unknown 是为了**强制走运行时校验**——任何调用方传错形状都得到 deny，
 * 而不会因为 TS 类型擦除而静默退化。classifyShell（冻结契约）只是它的四态封装。
 */
export function classifyShellDetailed(argv: unknown, rules: unknown): ShellVerdict {
  // 1) 规则集：缺失/非法/版本未知 → 硬拒（fail-closed，§7.5 第一条）
  const rulesErr = validateRules(rules);
  if (rulesErr !== null) {
    return { decision: "deny", reason: `规则集不可用（fail-closed）：${rulesErr}`, ruleId: "deny:rules-invalid" };
  }
  const R = rules as ShellRules;

  // 执行模型（§7.10）：仅在「命令会经 shell 解释」时才扫元字符。
  //   executionModel === "argv-noshell" → 元字符是普通参数字节，**不**扫（避免空转 + 假安全感 + 误杀）；
  //   "shell-string" 或缺省 → 保守假定 shell 会解释 ⇒ 扫（fail-closed 缺省，兼容旧规则集）。
  const metacharsEnforced = (R.executionModel as ShellExecutionModel | undefined) !== "argv-noshell";

  // 2) argv：必须是「非空、全字符串」的数组
  if (!Array.isArray(argv) || argv.length === 0) {
    return { decision: "deny", reason: "argv 缺失或为空（fail-closed）", ruleId: "deny:argv-invalid" };
  }
  if (!argv.every((a) => typeof a === "string")) {
    return { decision: "deny", reason: "argv 含非字符串元素（fail-closed）", ruleId: "deny:argv-invalid" };
  }
  const args = argv as string[];

  // 3) 结构性硬拒：换行/回车（多命令拼接）——**仅当执行模型会经 shell 解释时**成立（§7.10）。
  //    shell:false 下 argv 元素里的换行只是普通字节、不产生第二条命令，故不拒（否则误杀多行参数）。
  if (metacharsEnforced) {
    for (const a of args) {
      if (a.includes("\n") || a.includes("\r")) {
        return { decision: "deny", reason: "命令含换行/回车（多命令拼接）", ruleId: "deny:structural:newline" };
      }
    }
  }

  // 4) argv[0] 必须是程序名：空、或含空白（疑似塞进来整条命令串，如 "sh -c '…'"）→ 拒
  //    （此判据与执行模型无关，恒拒：整条命令串不是合法程序名，fail-closed。）
  const prog0 = args[0];
  if (prog0.trim() === "") {
    return { decision: "deny", reason: "argv[0] 为空", ruleId: "deny:argv-invalid" };
  }
  if (/\s/.test(prog0)) {
    return {
      decision: "deny",
      reason: `argv[0] 含空白，疑似整条命令串而非程序名（无法可靠解析）：${JSON.stringify(prog0)}`,
      ruleId: "deny:opaque-command",
    };
  }
  const program = programName(prog0);

  // 4.5) 窄只读 re-shell 白名单（客户 2026-10-18 裁定）——**先于** reshell 硬拒：
  //   只放 `cmd [/d] /c dir|where` 与 `powershell -NoProfile -Command "Test-Path '<字面路径>'"`；
  //   其余 re-shell 形态（sh -c/pwsh/cmd /c del/绝对路径可执行文件…）仍在第 5 步 deny。
  const roReshell = matchReadonlyReshell(args, program);
  if (roReshell !== null) {
    const review = reviewExplicitExecution(args, program);
    if (review !== null) return review;
    return {
      decision: "allow",
      reason: `命中窄只读 re-shell 白名单：${roReshell}`,
      ruleId: `allow:readonly:${roReshell}`,
    };
  }

  // 5) 硬拒程序（外壳/破坏性/执行包装器/间接执行器）——先于白名单，握绝对否决
  const denyProg = matchHardDeny(args, program, R.hardDenyPrograms);
  if (denyProg !== null) {
    return { decision: "deny", reason: `命中硬拒程序规则：${denyProg}`, ruleId: `deny:program:${denyProg}` };
  }

  // 6) 危险 shell 记号（逐元素子串扫描）——**仅当执行模型会经 shell 解释时**生效（§7.10）。
  //    shell:false 下 `> | & ; $( ` <<` 只是普通参数：扫它既是空转、又会误杀正常参数（如 `grep 'a|b'`）。
  //    ★ 耦合：若执行层改回 shell 字符串 / shell:true，务必令 executionModel !== "argv-noshell"
  //      （或删字段走缺省），否则这一段被跳过 ⇒ 漏掉真重定向/管道/命令替换。
  if (metacharsEnforced) {
    for (const a of args) {
      for (const t of R.denyTokens) {
        if (t === "") continue;
        if (a.includes(t)) {
          return {
            decision: "deny",
            reason: `命中危险 shell 记号 ${JSON.stringify(t)}：${JSON.stringify(a)}`,
            ruleId: `deny:token:${t}`,
          };
        }
      }
    }
  }

  // 7) risky 程序（危险但有正当用途）→ "risky"（§14.2：交 (b) pm 审读；(b) 判放行后**仍须**过 (a) 客户）。
  //    只在「程序名在 argv 里可见、语义可判」时命中——re-shell/内联求值在第 5 步已硬拒，到不了这里。
  const riskyProg = matchRisky(args, program, R.riskyPrograms ?? []);
  if (riskyProg !== null) {
    return {
      decision: "risky",
      reason: `命中「危险但有正当用途」程序规则：${riskyProg}（须过 (b) 且必过 (a)）`,
      ruleId: `risky:program:${riskyProg}`,
    };
  }

  // 8) 白名单（只读命令）→ allow（唯一通向 allow 的分支）
  const ro = matchReadOnly(args, program, R.readOnly);
  if (ro !== null) {
    const review = reviewExplicitExecution(args, program);
    if (review !== null) return review;
    return { decision: "allow", reason: `命中只读白名单：${ro}`, ruleId: `allow:readonly:${ro}` };
  }

  // 9) 都不命中 → review（交 (b)；b 明确即终结，b 拿不准/不可用才升 (a)；未接时由装配方默认拒绝）
  return { decision: "review", reason: "未命中白名单，也未命中硬拒或 risky——交下一闸", ruleId: "review" };
}

/**
 * 冻结契约入口：`classifyShell(argv, rules) => "allow" | "deny" | "risky" | "review"`（§7.4/§14.1）。
 * rules 必填；缺失/非法/版本未知 → "deny"（fail-closed）。此函数不吞错误、无默认放行分支。
 */
export function classifyShell(argv: string[], rules: ShellRules): ShellClass {
  return classifyShellDetailed(argv, rules).decision;
}

// ---------------------------------------------------------------------------
// 默认规则集（可被装配方替换/覆盖；数据驱动，便于审计与 pin）。
// 取舍见本文件与 changelog 的说明：这是**硬地板**，取「无正当用途/绕过门禁的就拒、只读就放、
// 危险但有正当用途的交 (b)+(a)、其余交 (b)」；不追求完备（间接执行类无法穷尽），未命中者一律 review。
//
// ★ 规则集**按「程序 + argv」分类**（§7.10）：argv[0] 程序黑/白名单、危险 flag、写目标参数。
//   **不因「无 shell」就认为安全**——`tee`/`dd of=`/`cp`/`mv`/`node -e`/`git checkout` 等**程序自身**照样能写，
//   故它们按**程序语义**判（在 hardDenyPrograms / riskyPrograms 里），而非看有没有 `>`。
//   `denyTokens` 保留但**在本默认模型（argv-noshell）下不生效**——它是「一旦改回 shell 解释就恢复」的集合。
//
// ★ 三段（§14.3）：`hardDenyPrograms`（deny，终结）/ `riskyPrograms`（risky，过 b 且必过 a）/ `readOnly`（allow）。
//   划名原则：**只拒「没有任何正当用途」或「放行即绕过门禁」的**——`rm` 有正当用途（删临时文件）故入 risky；
//   `sh -c` 放行即绕过门禁（§14.4）故仍硬拒。
// ---------------------------------------------------------------------------

const BACKTICK = "`";

function defaultReadOnly(): ShellReadOnlyRule[] {
  return [
    { id: "ls", program: "ls" },
    { id: "pwd", program: "pwd" },
    { id: "cat", program: "cat" },
    { id: "head", program: "head" },
    { id: "tail", program: "tail" },
    { id: "wc", program: "wc" },
    { id: "grep", program: "grep" },
    { id: "rg", program: "rg" },
    { id: "findstr", program: "findstr" },
    { id: "diff", program: "diff" },
    { id: "echo", program: "echo" },
    { id: "date", program: "date" },
    { id: "whoami", program: "whoami" },
    { id: "hostname", program: "hostname" },
    { id: "uname", program: "uname" },
    { id: "which", program: "which" },
    { id: "where", program: "where" },
    { id: "printenv", program: "printenv" },
    { id: "stat", program: "stat" },
    { id: "readlink", program: "readlink" },
    { id: "basename", program: "basename" },
    { id: "dirname", program: "dirname" },
    // git：仅明确只读的子命令；--output/-o 会写文件，故列入 blockedFlags
    {
      id: "git",
      program: "git",
      subcommands: [
        "status", "log", "diff", "show", "blame", "ls-files", "ls-tree", "shortlog",
        "whatchanged", "describe", "rev-parse", "rev-list", "merge-base", "cat-file",
        "grep", "show-ref", "name-rev", "for-each-ref", "var", "count-objects", "fsck",
      ],
      blockedFlags: ["--output", "-o"],
    },
    // 解释器仅放「打印版本」这一确定只读形态（其余形态见硬拒/已知缺口）
    { id: "node-version", program: "node", subcommands: ["--version", "-v"] },
    {
      id: "npm-read",
      program: "npm",
      subcommands: ["--version", "-v", "ls", "list", "view", "outdated", "root", "prefix"],
    },
  ];
}

function defaultHardDeny(): ShellHardDenyRule[] {
  return [
    // ── A-1 re-shell：外壳/解释器外壳把**真命令藏在参数 string 里**，argv 无可读程序名，(c) 无法分类 ──
    // `sh -c "…"` 里的 `sh` 自己会解释那段 string ⇒ 其一切影响（含写入）发生在子进程内、**完全不经过
    // `resolveWrite`**；放行 = 整体绕过写边界（§14.4）。故这一类**仍硬拒终结、不改判 risky**。
    {
      id: "reshell",
      programs: [
        "sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish", "busybox",
        "cmd", "powershell", "pwsh", "wsl", "winpty", "script", "expect",
      ],
    },
    // ── A-1 求值内建/包装：把一段 string/命令当代码求值 ⇒ 同上「任意代码」，非「有界危险命令」──
    { id: "inline-eval", programs: ["eval", "exec", "source", "command", "."] },
    // ── A-1 解释器「内联求值」形态：node -e / python -c / perl -e / ruby -e / php -r …（其余形态见已知缺口）──
    {
      id: "interpreter-inline",
      programs: ["node", "python", "python2", "python3", "perl", "ruby", "php", "lua", "rscript", "deno", "bun", "ts-node"],
      onlyWithFlag: ["-e", "--eval", "-p", "--print", "-c", "-r", "--require"],
    },
    // ── A-1 deno 的 `deno eval <code>` 子命令形态（等价于内联求值）──
    { id: "deno-eval", programs: ["deno"], onlyWithSubcommand: ["eval"] },
    // ── A-1 awk 程序可 system()/重定向 ⇒ 等价任意代码（代价：普通文本处理也走 review 以上的硬拒）──
    { id: "awk-exec", programs: ["awk", "gawk", "mawk", "nawk"] },
    // ── A-2 提权：受治理会话里无正当用途 ──
    { id: "privilege", programs: ["sudo", "doas", "su", "runas", "pkexec"] },
    // ── A-2 系统级破坏/控制：无正当用途 ──
    {
      id: "system-destroy",
      programs: ["mkfs", "format", "diskpart", "wipefs", "fdisk", "shutdown", "reboot", "halt", "poweroff"],
    },
    // ── A-2 Windows 脚本宿主/LOLBin（可下载并执行/绕过策略）：无正当用途 ──
    {
      id: "lolbin",
      programs: ["osascript", "wscript", "cscript", "mshta", "rundll32", "regsvr32", "msiexec", "installutil", "regasm", "regsvcs", "javaws", "msdt", "forfiles", "certutil", "bitsadmin"],
    },
  ];
}

/**
 * 默认 risky 规则（§14.3-B）：**危险但有正当用途**的单程序命令 → 判 "risky"（过 (b) pm 审读；b 判放行后**仍须过 (a)**）。
 * ★ 判据：**程序名在 argv 里以可读元素出现、语义可判**——(a) 客户看命令原文能看懂它的效果（`rm -rf build/` 看得懂）。
 *   这正是 (a) 能兜住 risky 的前提；「命令藏在 string 里」的 re-shell/内联求值**不进本表**（它们在 hardDenyPrograms）。
 *   风险交给 (b) 审读 + (a) 人看原文兜。**写目标是否逃出受治理根不由 (c) 判**——(c) 不解析路径（§7.7/§14.3）；
 *   路径由 resolveWrite 在其自身范围判。但 shell 介导的写不经 resolveWrite（§7.1），故对 shell 写「逃出根」在门禁侧
 *   无强制——由 (b)+(a) 兜（这也是本档**必须打扰人**的原因）。
 */
function defaultRisky(): ShellRiskyRule[] {
  return [
    // 删除/截断（删自己刚生成的临时文件等**正当**用途）
    { id: "risky:delete", programs: ["rm", "rmdir", "del", "erase", "rd", "shred", "srm", "truncate", "dd"] },
    // 原地改写
    { id: "risky:in-place-edit", programs: ["sed", "perl", "ruby"], onlyWithFlag: ["-i", "--in-place"] },
    // 交互式编辑器（可写）
    { id: "risky:editors", programs: ["vi", "vim", "nvim", "nano", "emacs", "ed", "ex", "notepad"] },
    // 进程/服务/系统状态变更
    {
      id: "risky:process-service",
      programs: ["kill", "killall", "taskkill", "systemctl", "service", "sc", "net", "reg", "regedit", "schtasks", "at", "crontab", "launchctl"],
    },
    // 网络抓取/远程执行
    {
      id: "risky:network",
      programs: ["curl", "wget", "fetch", "aria2c", "scp", "sftp", "ftp", "rsync", "telnet", "nc", "ncat", "netcat", "ssh", "psexec"],
    },
    // 间接执行器：被执行的**程序名以可读 argv 元素出现**（区别于 A-1「藏进 string」）⇒ 人能在原文里看懂
    { id: "risky:indirect-exec", programs: ["xargs", "env", "nohup", "nice", "ionice", "timeout", "stdbuf", "watch", "start"] },
    // 构建/任务运行器：目标是执行构建脚本（Makefile/…）
    {
      id: "risky:build",
      programs: ["make", "gmake", "just", "rake", "gradle", "gradlew", "mvn", "mvnw", "ant", "msbuild", "dotnet", "cargo", "go"],
    },
    // 包管理器的「运行脚本/安装（含生命周期脚本）」形态：npm install 会跑 postinstall
    {
      id: "risky:pkg-run",
      programs: ["npm", "yarn", "pnpm"],
      onlyWithSubcommand: [
        "run", "exec", "test", "start", "stop", "restart", "ci", "install", "i", "add",
        "remove", "rm", "uninstall", "publish", "pack", "link", "update", "upgrade", "init",
        "create", "prune", "dedupe", "rebuild", "build", "prepare", "postinstall",
      ],
    },
    // npx/corepack：接受包名并执行它（§14.3-B 明列 risky）
    { id: "risky:npx", programs: ["npx", "corepack"] },
    // 文件写入/创建/权限/挂载：开发里**正当**写盘操作，程序名可见
    {
      id: "risky:fs-write",
      programs: [
        "touch", "mkdir", "md", "cp", "copy", "mv", "move", "rename", "ren", "ln", "link", "mklink",
        "install", "tee", "patch", "chmod", "chown", "chgrp", "attrib", "icacls", "takeown", "cacls",
        "setfacl", "mkfifo", "mknod", "mount", "umount", "sync",
      ],
    },
    // git 的「危险 flag」写开关：`--output`/`--output=<file>` 会把结果写盘（§7.10「危险 flag」）。
    // 置于 git 写子命令之前：只带 --output 的只读子命令（如 `git log --output=x`）也据此判 risky。
    // （readonly:git 的 blockedFlags 保留作纵深冗余。）
    { id: "risky:git-output-write", programs: ["git"], onlyWithFlag: ["--output"] },
    // git 的写子命令（与 readonly:git 互补：这里列出会改盘/改历史的子命令）
    {
      id: "risky:git-write",
      programs: ["git"],
      onlyWithSubcommand: [
        "commit", "push", "pull", "fetch", "clone", "checkout", "switch", "restore", "reset",
        "clean", "merge", "rebase", "cherry-pick", "revert", "am", "apply", "stash", "add",
        "rm", "mv", "tag", "branch", "config", "init", "gc", "filter-branch", "filter-repo",
        "submodule", "worktree", "update-index", "update-ref", "symbolic-ref", "notes",
        "replace", "prune", "repack", "remote", "sparse-checkout", "maintenance",
      ],
    },
  ];
}

/**
 * 危险 shell 记号（子串匹配）。`>` 覆盖 `>>`/`2>`；`&` 覆盖 `&&`/`&>`；`|` 覆盖 `||`/`|&`。
 *
 * ★ 本默认规则集的 `executionModel` 是 `"argv-noshell"`（`spawn(shell:false)`），**这些记号不生效**——
 *   它们是**待恢复**集合：一旦执行层改回原始命令串 / `shell:true`（把 `executionModel` 改为 `"shell-string"`
 *   或删字段），这些记号立即恢复拦截，否则 `> /path`、`$(...)`、`cmd | sh` 会被漏掉（§7.10 耦合）。
 */
function defaultDenyTokens(): string[] {
  return [">", "|", "&", ";", "$(", BACKTICK, "<<"];
}

/** 返回一份**全新**的默认规则集（无共享可变状态）。 */
export function defaultShellRules(): ShellRules {
  return {
    version: SHELL_RULES_VERSION,
    id: "ans-default-v3", // 规则集 id（审计 / §7.6 归属；装配方可取它，不必另传 rulesId）
    // 执行模型（§7.10）：本规则集按「程序 + argv」分类，绑定 `spawn(shell:false)`。
    // ★ 若执行层改回 shell 字符串 / shell:true，必须改为 "shell-string"（或删字段），否则元字符规则空转。
    executionModel: "argv-noshell",
    readOnly: defaultReadOnly(),
    hardDenyPrograms: defaultHardDeny(),
    riskyPrograms: defaultRisky(),
    denyTokens: defaultDenyTokens(),
  };
}
