// 门禁引擎：V3 shell 命令级闸 (c) —— 确定性规则/白名单引擎（纯函数，无副作用）
//
// 冻结契约（设计 §7.2/§7.4）：`classifyShell(argv, rules) => "allow" | "deny" | "review"`。
// 判据是「这条命令是否被允许执行」，**不是**「路径是否在边界内」——shell 里的 `echo x > 路径`
// 不经过 resolveWrite（§7.1），故这道闸的判据与路径判定正交。
//
// 三态（§7.3）：白名单命中 → allow；硬拒命中 → deny（绝对否决，不可被 (b)/(a) 翻案）；
//             都不命中 → review（交 (b) pm 审读 → (a) 操作者）。
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

import type {
  ShellClass,
  ShellExecutionModel,
  ShellHardDenyRule,
  ShellReadOnlyRule,
  ShellRules,
} from "../../model/decision.ts";

/** 引擎已知的规则集版本；rules.version 与之不符 → 硬拒（版本未知，fail-closed）。
 *  "2"：T8a 起规则集按「程序 + argv」重述、元字符仅在 `executionModel` 会经 shell 解释时生效（§7.10）。 */
export const SHELL_RULES_VERSION = "2";

/** 带原因的判定结果；classifyShell 只取其中的 decision（冻结契约是三态字符串）。 */
export interface ShellVerdict {
  decision: ShellClass;
  reason: string;
  ruleId: string; // deny:rules-invalid / deny:argv-invalid / deny:opaque-command / deny:program:<id> / deny:token:<t> / allow:readonly:<id> / review
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

/**
 * 带原因的判定。参数取 unknown 是为了**强制走运行时校验**——任何调用方传错形状都得到 deny，
 * 而不会因为 TS 类型擦除而静默退化。classifyShell（冻结契约）只是它的三态封装。
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

  // 7) 白名单（只读命令）→ allow（唯一通向 allow 的分支）
  const ro = matchReadOnly(args, program, R.readOnly);
  if (ro !== null) {
    return { decision: "allow", reason: `命中只读白名单：${ro}`, ruleId: `allow:readonly:${ro}` };
  }

  // 8) 都不命中 → review（交 (b)/(a)；在 (b)/(a) 未接时由装配方默认拒绝）
  return { decision: "review", reason: "未命中白名单，也未命中硬拒——交下一闸", ruleId: "review" };
}

/**
 * 冻结契约入口：`classifyShell(argv, rules) => "allow" | "deny" | "review"`（§7.4）。
 * rules 必填；缺失/非法/版本未知 → "deny"（fail-closed）。此函数不吞错误、无默认放行分支。
 */
export function classifyShell(argv: string[], rules: ShellRules): ShellClass {
  return classifyShellDetailed(argv, rules).decision;
}

// ---------------------------------------------------------------------------
// 默认规则集（可被装配方替换/覆盖；数据驱动，便于审计与 pin）。
// 取舍见本文件与 changelog 的说明：这是**硬地板**，取「已知危险就拒、只读就放、其余交 (b)/(a)」；
// 不追求完备（间接执行类无法穷尽），未命中者一律 review（由 (b)/(a) 兜底，未接时由装配方默认拒绝）。
//
// ★ 规则集**按「程序 + argv」分类**（§7.10）：argv[0] 程序黑/白名单、危险 flag、写目标参数。
//   **不因「无 shell」就认为安全**——`tee`/`dd of=`/`cp`/`mv`/`node -e`/`git checkout` 等**程序自身**照样能写，
//   故它们按**程序语义**判（在 hardDenyPrograms / git-write 里），而非看有没有 `>`。
//   `denyTokens` 保留但**在本默认模型（argv-noshell）下不生效**——它是「一旦改回 shell 解释就恢复」的集合。
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
    // 外壳/解释器外壳：`sh -c "…"` 把真实命令藏在参数里，无法可靠反推 → 直接拒
    {
      id: "shell",
      programs: [
        "sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish", "busybox",
        "cmd", "powershell", "pwsh", "wsl", "winpty", "script", "expect",
      ],
    },
    // 破坏性文件系统操作
    {
      id: "destructive-fs",
      programs: ["rm", "rmdir", "del", "erase", "rd", "shred", "truncate", "dd", "mkfs", "format", "diskpart", "fdisk", "wipefs", "srm"],
    },
    // 写入/创建/权限类
    {
      id: "fs-write",
      programs: [
        "touch", "mkdir", "md", "cp", "copy", "mv", "move", "rename", "ren", "ln", "link", "mklink",
        "install", "tee", "patch", "chmod", "chown", "chgrp", "attrib", "icacls", "takeown", "cacls",
        "setfacl", "mkfifo", "mknod", "mount", "umount", "sync",
      ],
    },
    // 交互式编辑器（可写）
    { id: "editors", programs: ["vi", "vim", "nvim", "nano", "emacs", "ed", "ex", "notepad"] },
    // 进程/系统状态变更
    {
      id: "process-system",
      programs: ["kill", "killall", "taskkill", "shutdown", "reboot", "halt", "poweroff", "systemctl", "service", "sc", "net", "reg", "regedit", "schtasks", "at", "crontab", "launchctl"],
    },
    // 网络抓取/远程执行
    {
      id: "network-fetch",
      programs: ["curl", "wget", "fetch", "aria2c", "scp", "sftp", "ftp", "rsync", "telnet", "nc", "ncat", "netcat", "ssh", "psexec"],
    },
    // 执行包装器：接受一个命令并运行它 ⇒ 等价于任意执行
    {
      id: "exec-wrapper",
      programs: ["xargs", "env", "nohup", "nice", "ionice", "timeout", "stdbuf", "watch", "sudo", "doas", "su", "runas", "pkexec", "start", "eval", "exec", "source", "command"],
    },
    // 解释器「内联求值」形态：node -e / python -c / perl -e / ruby -e / php -r …（其余形态见已知缺口）
    {
      id: "interpreter-inline",
      programs: ["node", "python", "python2", "python3", "perl", "ruby", "php", "lua", "rscript", "deno", "bun", "ts-node"],
      onlyWithFlag: ["-e", "--eval", "-p", "--print", "-c", "-r", "--require"],
    },
    // 原地改写
    { id: "in-place-edit", programs: ["sed", "perl", "ruby"], onlyWithFlag: ["-i", "--in-place"] },
    // awk 程序可 system()/重定向 → 拒（代价：普通文本处理也走 review）
    { id: "awk-exec", programs: ["awk", "gawk", "mawk", "nawk"] },
    // Windows LOLBins（可下载/执行）
    {
      id: "lolbin",
      programs: ["osascript", "wscript", "cscript", "mshta", "rundll32", "regsvr32", "msiexec", "installutil", "regasm", "regsvcs", "javaws", "msdt", "forfiles", "certutil", "bitsadmin"],
    },
    // 构建/任务运行器：目标是执行任意程序（Makefile/构建脚本）
    {
      id: "build-task-runner",
      programs: ["make", "gmake", "just", "rake", "gradle", "gradlew", "mvn", "mvnw", "ant", "msbuild", "dotnet", "cargo", "go"],
    },
    // 包管理器的「运行脚本/安装（含生命周期脚本）」形态：npm install 会跑 postinstall
    {
      id: "pkg-run",
      programs: ["npm", "yarn", "pnpm"],
      onlyWithSubcommand: [
        "run", "exec", "test", "start", "stop", "restart", "ci", "install", "i", "add",
        "remove", "rm", "uninstall", "publish", "pack", "link", "update", "upgrade", "init",
        "create", "prune", "dedupe", "rebuild", "build", "prepare", "postinstall",
      ],
    },
    // npx/corepack：接受任意包名并执行它 ⇒ 恒等同于任意执行，故无子命令例外
    { id: "npx-exec", programs: ["npx", "corepack"] },
    // git 的「危险 flag」写开关：`--output`/`--output=<file>` 会把结果写盘（§7.10「危险 flag」）。
    // 置于 git-write 之前：只带 --output 的只读子命令（如 `git log --output=x`）也据此硬拒，
    // 而不再落 review。（readonly:git 的 blockedFlags 保留作纵深冗余。）
    { id: "git-output-write", programs: ["git"], onlyWithFlag: ["--output"] },
    // git 的写子命令（与 readonly:git 互补：这里列出会改盘/改历史的子命令）
    {
      id: "git-write",
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
    id: "ans-default-v2", // 规则集 id（审计 / §7.6 归属；装配方可取它，不必另传 rulesId）
    // 执行模型（§7.10）：本规则集按「程序 + argv」分类，绑定 `spawn(shell:false)`。
    // ★ 若执行层改回 shell 字符串 / shell:true，必须改为 "shell-string"（或删字段），否则元字符规则空转。
    executionModel: "argv-noshell",
    readOnly: defaultReadOnly(),
    hardDenyPrograms: defaultHardDeny(),
    denyTokens: defaultDenyTokens(),
  };
}
