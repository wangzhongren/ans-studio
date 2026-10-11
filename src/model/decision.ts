// Model 层：写入判定结果的共享类型
// 冻结契约：角色卡/项目管理/docs/design/2026-10-11_design_ans-cli-v1-prototype.md §2
// 只用可擦除语法。

import type { BoundaryEntry } from "./boundary.ts";

// F10：按根分组，拒绝信息无歧义
export interface AllowedPathsByRoot {
  skill: string[];
  project: string[];
}

export type WriteDecision =
  | { allowed: true; matchedEntry: BoundaryEntry }
  | { allowed: false; reason: string; allowedByRoot: AllowedPathsByRoot };

// F4：任务级收窄
export interface TaskScope {
  writeSet: string[]; // 本项目相对路径的精确集合，必须是角色边界的子集
  conditions: string[]; // 本次任务声明满足的条件 slug（由角色在组任务时填写），用于放开 conditional-directory
}

// ---------------------------------------------------------------------------
// V3 shell 命令级闸 (c)：确定性规则/白名单引擎的共享类型
// 冻结契约：设计 §7.2/§7.4/§14 —— 纯函数 classifyShell(argv, rules) => "allow" | "deny" | "risky" | "review"。
// 判据与路径判定（resolveWrite）**不同**：shell 问的是「这条命令是否被允许执行」，而不是
// 「这个路径是否在边界内」——因为 `echo x > 路径` 这类写入根本不经过 resolveWrite（§7.1）。
//
// 四态语义（§7.3 → §14.1 重定，客户 2026-10-11）：
//   * 命中白名单（只读命令）        → "allow"（不再经 (b)/(a)）；
//   * 命中硬拒（无可正当用途 / 放行即绕过门禁）→ "deny"（**绝对否决**，不可被 (b)/(a) 翻案）；
//   * 命中「危险但有正当用途」      → "risky"（**必过 (b) pm 审读；(b) 判放行后仍须过 (a) 客户**，§14.2）；
//   * 都不命中                     → "review"（交 (b)；b 明确即终结，b 拿不准/不可用才升 (a)）。
// fail-closed（§7.5 第一条）：规则集/白名单加载失败、解析报错、版本未知 → 一律视为硬拒 "deny"，
//   绝不「规则没了就当没有、一律放行」。故 rules **必须显式传入**（见 classify-shell.ts）。
//
// 规则集是**数据**（不是硬编码 if），便于：① 由装配方注入（可与配置/pin 同源）；② 把「命中的规则 id」
// 逐条记入审计（§7.6）。
// ---------------------------------------------------------------------------

/** 命令级判定结果（四态，§7.3 → §14.1） */
export type ShellClass = "allow" | "deny" | "risky" | "review";

/** 白名单条目：只读、且不能用来执行任意程序的命令 */
export interface ShellReadOnlyRule {
  id: string; // 规则 id（审计用），如 "readonly:git"
  program: string; // 程序名（argv[0] 的 basename，小写比较）
  subcommands?: string[]; // 若给出：argv[1]（小写）须命中其中之一才算只读（如 git 只放 status/log/diff…）
  blockedFlags?: string[]; // 出现任一（精确匹配或 `flag=` 前缀）即不算只读（如 git log 的 --output 会写文件）
}

/** 硬拒条目：危险程序 */
export interface ShellHardDenyRule {
  id: string; // 规则 id（审计用），如 "deny:shell"
  programs: string[]; // 程序名（basename，小写）列表
  onlyWithFlag?: string[]; // 若给出：argv 中须出现其中之一才判 deny（如 sed 仅 -i/--in-place 时才是改写）
  onlyWithSubcommand?: string[]; // 若给出：argv[1]（小写）须命中其中之一才判 deny（如 npm 仅 run/install… 才间接执行）
}

/**
 * risky 条目（§14.2/§14.3-B）：**危险但有正当用途**的程序 —— 必须过 (b) pm 审读；(b) 判「放行」后
 * **仍须过 (a) 客户**（pm 不是终审，客户才是）。
 *
 * ★ 只收「**程序名在 argv 里以可读元素出现、语义可判**」的形态（`rm`/`sed -i`/`dd`/`git commit`/`xargs rm`…）：
 *   (a) 是**客户看命令原文**，得看得懂 —— `rm -rf build/` 看得懂；`sh -c "…"`（真命令藏在 string 里）**看不懂**，
 *   那类（re-shell / 内联求值）**不进本表、仍硬拒**（§14.4）。**「argv 里看得见」正是 (a) 能兜住 risky 的前提**：
 *   一旦把「命令藏在 string 里」的形态也放进 risky，(a) 人看原文也看不出它会写什么，client 那层就形同虚设。
 */
export interface ShellRiskyRule {
  id: string; // 规则 id（审计用），如 "risky:delete"
  programs: string[]; // 程序名（basename，小写）列表
  onlyWithFlag?: string[]; // 若给出：argv 中须出现其中之一才判 risky（如 sed 仅 -i/--in-place 才是原地改写）
  onlyWithSubcommand?: string[]; // 若给出：argv[1]（小写）须命中其中之一才判 risky（如 git 写子命令）
}

/**
 * 命令解释模型（设计 §7.10）——决定 (c) 规则集里「shell 元字符」是否作为**硬拒项**生效。
 * - `"argv-noshell"`：执行层 `spawn(argv[0], argv.slice(1), { shell:false })`，命令**不经 shell 解释**——
 *   `>` `|` `&` `;` `$(` 反引号 `<<` 换行 只是**普通参数字节**，不会被解释。此模型下 `denyTokens` **不生效**
 *   （扫它是空转，且会误杀 `grep 'a|b'` 一类的正常正则参数、制造「拦住了重定向」的假安全感）。
 * - `"shell-string"`：命令以**原始字符串**交给 shell（`shell:true`）——元字符会被解释，`denyTokens` **恢复生效**。
 *
 * 省略该字段时按**最保守**处理：假定 shell 可能解释元字符 ⇒ `denyTokens` 生效（fail-closed 缺省）。
 * **强耦合（§7.10，务必记牢）**：默认规则集绑定 `"argv-noshell"`；一旦执行层改回原始命令串 / `shell:true`，
 * **必须**把本字段改为 `"shell-string"`（或删除），否则 `> /path`、`$(...)` 之类会被**漏掉**——「以为拦了、其实没拦」。
 */
export type ShellExecutionModel = "argv-noshell" | "shell-string";

/** 确定性规则集（§7.3 (c)）。必须显式传入；缺失/非法/版本未知 → 硬拒 deny（fail-closed，§7.5）。 */
export interface ShellRules {
  version: string; // 规则集版本；与引擎已知版本不符 → 硬拒（防「未来格式被旧引擎误判」）
  // 规则集 id（审计 / §7.6 归属用）：记录「判决出自哪一套规则集」。可选；若给出须为非空字符串。
  // 有此字段后，装配方（编排 ShellGate）可取 rules.id 作审计归属，不必再另传 rulesId。
  id?: string;
  executionModel?: ShellExecutionModel; // 命令解释模型（§7.10）；省略 ⇒ 保守假定 shell 解释元字符（denyTokens 生效）
  readOnly: ShellReadOnlyRule[]; // 白名单
  hardDenyPrograms: ShellHardDenyRule[]; // 硬拒程序
  // 危险但有正当用途的程序（§14.3-B）→ 判 "risky"（必过 (b)；(b) 放行后仍须过 (a)）。
  // ★ 类型上标记为可选以兼容尚未迁移的规则集字面量；但引擎**在运行时要求它存在**：缺失/非数组 → 硬拒
  //   "deny"（fail-closed，§7.5）——否则「有正当用途的危险命令」会静默降级为 review（只过 (b)、不强制 (a)）。
  riskyPrograms?: ShellRiskyRule[];
  denyTokens: string[]; // 危险 shell 记号（子串匹配；**仅当 executionModel 会经 shell 解释时**生效，见 §7.10）
}
