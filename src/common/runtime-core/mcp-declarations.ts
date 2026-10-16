// 运行时核心主属：外来 MCP 声明（`docs/mcp/<name>.md`）的**读取/解析单一来源**（G-4 V2 wave A）。
//
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝V2（外来 MCP 按角色安装）分批实施；产品提案
// revision 2 §5.1/§5.2（`角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`）
// 与运行时核心评估（`角色卡/运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md` §5.2/§6）。
// 本模块＝声明的**冻结读取器**（两处消费：① 桌面安装 handler 的存在性/含角色/撤销校验——
// `readMcpDeclaration`；② Service `providerFor` 按角色装配注入——`listInstalledMcpServers` →
// `RuntimeProviderOptions.installedMcpServers`）。配置侧**不得**复制解析逻辑（单一解析来源
// `loadDeclaration`；判据与原因码两函数同口径，测试双向钉住）。
//
// 声明文件格式（本项目冻结；su 经 `write_file` 落盘，模板沿产品提案 §5.1）：
//
//   # MCP 声明：<name>                    ← 标题行（非权威；名字以**文件名**为准，标题不解析）
//   - 用途：<一句话>
//   - 启动：<command>                     ← 单行、非空；按 argv 直接 spawn（不经 shell）
//   - 参数：<arg1> ｜ <arg2> …            ← 可选；`｜`/`|` 分隔、各项 trim、空项丢弃；不做引号解包
//   - 环境：NAME=env:REF；NAME2=字面量     ← 可选；`；`/`;` 分隔；值只收**字面量**或 `env:NAME` **引用**
//   - 适用角色：<roleId>、<roleId>
//   - 状态：installed                     （installed｜uninstalled；其余值＝坏件）
//   - 安装日期：2026-10-16
//
// 关键纪律（钉死）：
// · **坏件/缺失/名非法/与内置 server 重名（`ans`/`ans_codex`）⇒ `undefined`／跳过**——两个公开
//   函数**绝不抛错**（绝因产物问题开不了角色会话；沿 installed-skills 防御先例）；坏件在列表函数
//   里＋写诊断（内部诊断记录＋可选 `onDiagnostic` 回调）；`uninstalled`／角色不命中属**正常过滤**
//   （静默跳过、不算坏件、不产诊断）。
// · **只读**：不写盘、**绝不建目录**；`docs/mcp` 不存在＝正常「未安装任何 MCP」态。
// · **零凭据面**：env 值只存声明**原文**（字面量或 `env:NAME` 引用——真值由各适配器自持展开自
//   进程环境，**绝不落声明文件**；裁定⑨：凭据值不入声明文件/对话/诊断）；`!` 开头值＝坏件
//   （Pi `!command` 形态会在建连前执行命令——评估 §6.2，拒命令引用）。
// · 校验面（评估 §5.1 严格面）：名字符集 `[A-Za-z0-9_-]`（特殊字符＝坏件——裁定②）；`command`
//   非空且无控制字符；`args` 为字符串数组（解析即数组）；env 名 `[A-Za-z_][A-Za-z0-9_]*`、值非空、
//   非 `!` 开头、`env:` 引用名合法、不重复。**不做**名清洗碰撞拒绝（`a-b` vs `a_b` 等）——那是
//   平台侧装配残余（§5.3 残余 2，P2/P3 配置侧拒绝），本读取器不做。
// · 生效语义＝**下次开会话**（读取点＝Service providerFor，随会话冻结；在跑会话不受影响——产品口径）。
// · 冻结签名（对桌面 handler 与 Service 的落盘契约）：
//   · `readMcpDeclaration(projectRoot: string, name: string): McpDeclarationView | undefined`（**两参调用必须可用**）
//   · `listInstalledMcpServers(projectRoot: string, roleId: string): readonly InstalledMcpServerV1[]`
//     （第三参为可选诊断回调——两参调用逐字不变）。
// · 「哈希只能由代码算」（finalize.ts 先例）：清单不产出 digest；安装回执的 digest＝能力侧对
//   声明文件当刻字节算的 sha256（契约 `InstallMcpReceipt.digest`——本读取器不代算、不缓存）。

import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import type { InstalledMcpServerV1 } from "../../model/runtime.ts";

/** MCP 声明树（项目根相对，posix）：`docs/mcp/<name>.md`（与 `docs/contracts/`、`docs/skills/` 同级项目文档面）。 */
const MCP_REL = "docs/mcp";
/** 声明文件扩展名（名字＝文件名去此后缀；其余文件/目录/符号链接**静默忽略**——不是声明条目）。 */
const DECLARATION_EXT = ".md";
/** 内置 server 保留名（与 ANS 自身注入面重名——读取器拒；评估 §5.1「与内置 server 重名」）。 */
const RESERVED_NAMES: readonly string[] = ["ans", "ans_codex"];
/** name 字符集（G-4 V2 裁定②：仅 `[A-Za-z0-9_-]`；特殊字符/点/空格/控制字符＝坏件）。 */
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
/** env 变量名（POSIX 常规；字面量侧与 `env:` 引用侧同判）。 */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** 控制字符（含 DEL）——command/参数/env 名值出现即坏件（纵深防御；行式解析已保证无换行）。 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 坏件跳过原因码（诊断面——内部诊断记录与可选 `onDiagnostic` 回调同用这些值）。
 * · `mcp-root-unreadable`：`docs/mcp` 存在但不可读/不是目录——整体零清单（防御；不是坏条目）。
 * · `name-invalid`：名字符集非法（仅 `[A-Za-z0-9_-]`；注入/装配前防御）——该条跳过。
 * · `reserved-name`：与内置 server 重名（`ans`/`ans_codex`）——该条跳过。
 * · `declaration-missing`：`docs/mcp/<name>.md` 不存在（ENOENT）——该条跳过。
 * · `declaration-parse-failed`：读取失败（非 ENOENT）/字段缺失或非法/状态值未知——该条跳过。
 */
export type McpDeclarationDiagnosticReason =
  | "mcp-root-unreadable"
  | "name-invalid"
  | "reserved-name"
  | "declaration-missing"
  | "declaration-parse-failed";

/** 坏件跳过事件（供可选回调/测试断言；`path` 为项目相对 posix 路径，指向坏在哪件文件）。 */
export interface McpDeclarationDiagnostic {
  path: string;
  reason: McpDeclarationDiagnosticReason;
  /** 细节（底层错误 message 等；可缺）。 */
  detail?: string;
}

/** 声明解析结果（七字段；必填键任一缺失即解析失败——缺不缺由 parseDeclaration 抛错表达）。 */
interface McpDeclarationFields {
  purpose: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  roles: string[];
  status: string;
  date: string;
}

/**
 * 声明**公开视图**（`readMcpDeclaration` 返回此型）＝`InstalledMcpServerV1`＋安装面五字段。
 * 桌面 handler 的校正面：`roles`（含/不含目标角色）、`status`（installed 撤销判读）、`path`（回执呈现）；
 * `env` 值为声明**原文**（字面量或 `env:NAME` 引用，**未展开**——展开归各平台适配器自持）。
 */
export interface McpDeclarationView extends InstalledMcpServerV1 {
  /** 一句话用途（`用途：…`）。 */
  purpose: string;
  /** 适用角色 id 列表（`、`/`，`/`,` 分隔、trim、去反引号包裹；命中判据见 `listInstalledMcpServers`）。 */
  roles: string[];
  /** 状态原文（`installed`／`uninstalled` 为已知态；其余值＝坏件——两函数同判 undefined/跳过）。 */
  status: string;
  /** 安装日期（取行内首个 `YYYY-MM-DD`；无则原文照录）。 */
  date: string;
  /** 项目相对 posix 路径（`docs/mcp/<name>.md`——回执与诊断同一路径口径）。 */
  path: string;
}

/**
 * 解析声明文本（格式见文件头；宽容但有界，沿 skills 登记解析先例）：
 * · 行式解析：`- 用途：…` 式的键行——显式七键（用途/启动/参数/环境/适用角色/状态/安装日期），
 *   行首 `-`/`*` 可省，全角/半角冒号均可；同键**首现为准**；其余行（标题、注释、其它键）忽略。
 * · **必填**：用途/启动/适用角色/状态/安装日期——任一缺失或为空 ⇒ 抛错（调用侧按解析失败跳过——绝不猜补）。
 * · **可选**：参数（缺省 `[]`）、环境（缺省无——不产出 `env` 键）。
 * · BOM 剥离；CRLF 兼容；command/参数/env 名值拒控制字符；env 值拒 `!` 开头（命令引用形态）。
 */
function parseDeclaration(text: string): McpDeclarationFields {
  const fields = new Map<string, string>();
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = rawLine.trim().match(/^(?:[-*]\s*)?(用途|启动|参数|环境|适用角色|状态|安装日期)\s*[：:]\s*(.*)$/);
    if (m === null || m[1] === undefined || m[2] === undefined) continue;
    if (!fields.has(m[1])) fields.set(m[1], m[2].trim());
  }
  const purpose = fields.get("用途") ?? "";
  const command = fields.get("启动") ?? "";
  const rolesRaw = fields.get("适用角色") ?? "";
  const status = fields.get("状态") ?? "";
  const dateRaw = fields.get("安装日期") ?? "";
  if (purpose === "" || command === "" || rolesRaw === "" || status === "" || dateRaw === "") {
    throw new Error("声明字段缺失：需齐备 用途/启动/适用角色/状态/安装日期");
  }
  if (CONTROL_CHARS.test(command)) throw new Error("启动命令含控制字符");
  // 参数（可选）：`｜`（全角）/`|`（半角）分隔、各项 trim、空项丢弃；不展开引号/转义（原样一项）。
  const args = (fields.get("参数") ?? "").split(/[｜|]/).map((s) => s.trim()).filter((s) => s !== "");
  for (const arg of args) {
    if (CONTROL_CHARS.test(arg)) throw new Error("参数含控制字符");
  }
  // 环境（可选）：`；`/`;` 分隔的 NAME=值；值＝字面量或 `env:NAME` 引用（拒 `!` 开头命令引用）。
  const envRaw = fields.get("环境") ?? "";
  let env: Record<string, string> | undefined;
  if (envRaw !== "") {
    const table: Record<string, string> = {};
    for (const item of envRaw.split(/[；;]/).map((s) => s.trim()).filter((s) => s !== "")) {
      const eq = item.indexOf("=");
      if (eq <= 0) throw new Error(`环境项缺少 NAME=值 形态：${item}`);
      const name = item.slice(0, eq).trim();
      const value = item.slice(eq + 1).trim();
      if (!ENV_NAME_PATTERN.test(name)) throw new Error(`环境变量名非法：${name}`);
      if (Object.hasOwn(table, name)) throw new Error(`环境变量重复：${name}`);
      if (value === "") throw new Error(`环境变量值为空：${name}`);
      if (value.startsWith("!")) throw new Error(`环境值不得以 ! 开头（命令引用形态被拒）：${name}`);
      if (CONTROL_CHARS.test(value)) throw new Error(`环境变量值含控制字符：${name}`);
      if (value.startsWith("env:")) {
        const ref = value.slice(4).trim();
        if (!ENV_NAME_PATTERN.test(ref)) throw new Error(`env 引用名非法：${name}=${value}`);
        table[name] = `env:${ref}`; // 引用**原文**保存；真值展开归各平台适配器（绝不落声明文件）。
      } else {
        table[name] = value; // 字面量。
      }
    }
    if (Object.keys(table).length > 0) env = table;
  }
  const roles = rolesRaw.split(/[、，,]/).map((s) => s.trim().replace(/^`+|`+$/g, "")).filter((s) => s !== "");
  if (roles.length === 0) throw new Error("适用角色为空");
  const date = dateRaw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? dateRaw;
  return { purpose, command, args, roles, status, date, ...(env !== undefined ? { env } : {}) };
}

/**
 * 读取器与列表函数**共用**的加载判据（单一解析来源）——读 `docs/mcp/<name>.md` 并解析；
 * 坏件/缺失以 `reason` 回报（**绝不抛错**）。判据与原因码同诊断面（见 `McpDeclarationDiagnosticReason`）：
 * · `name-invalid`（名空/名字符集非法——含控制字符、点、空格、路径分隔符）；`reserved-name`
 *   （`ans`/`ans_codex`）；`declaration-missing`（ENOENT）；`declaration-parse-failed`（读取失败
 *   〔非 ENOENT〕/必填字段缺失或非法/env 值非法/状态值未知）。`ok` 仅两种已知状态（installed 与
 *   uninstalled——后者不是坏件，过滤归调用方）。
 */
function loadDeclaration(projectRoot: string, name: string): {
  ok: true;
  declaration: McpDeclarationView;
} | {
  ok: false;
  path: string;
  reason: McpDeclarationDiagnosticReason;
  detail?: string;
} {
  const declarationRel = `${MCP_REL}/${name}${DECLARATION_EXT}`;
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
    return { ok: false, path: declarationRel, reason: "name-invalid", detail: "名字符集非法（仅 [A-Za-z0-9_-]）" };
  }
  if (RESERVED_NAMES.includes(name)) {
    return { ok: false, path: declarationRel, reason: "reserved-name", detail: "与内置 server 重名（ans/ans_codex）" };
  }
  let declarationText: string;
  try {
    declarationText = readFileSync(path.join(projectRoot, "docs", "mcp", `${name}${DECLARATION_EXT}`), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: false, path: declarationRel, reason: "declaration-missing" };
    return { ok: false, path: declarationRel, reason: "declaration-parse-failed", detail: (err as Error).message };
  }
  let fields: McpDeclarationFields;
  try {
    fields = parseDeclaration(declarationText);
  } catch (err) {
    return { ok: false, path: declarationRel, reason: "declaration-parse-failed", detail: (err as Error).message };
  }
  if (fields.status !== "installed" && fields.status !== "uninstalled") {
    // 未知状态值：状态不明不猜（列表据此跳过；诊断可见，防「拼错状态 ⇒ 静默不生效」）。
    return { ok: false, path: declarationRel, reason: "declaration-parse-failed", detail: `未知状态值：${fields.status}` };
  }
  return {
    ok: true,
    declaration: {
      name,
      command: fields.command,
      args: fields.args,
      ...(fields.env !== undefined ? { env: fields.env } : {}),
      purpose: fields.purpose,
      roles: fields.roles,
      status: fields.status,
      date: fields.date,
      path: declarationRel,
    },
  };
}

/**
 * **读取并解析一条 MCP 声明**（G-4 V2 wave A）——桌面安装 handler 的「声明存在/含角色/已撤销」
 * 校验面。`parseDeclaration` 的公开视图，**单一解析来源**：与列表函数共用 `loadDeclaration` 判据，
 * 逐字同口径；配置侧**不得复制解析逻辑**。
 *
 * 与列表函数的判据对照（测试双向钉住）：
 * · **坏件/缺失**（名非法/保留名/声明缺失/解析失败/状态值未知）⇒ `undefined`——与列表函数「该条
 *   跳过＋诊断」的**坏件集完全相同**（列表函数对坏件额外写诊断；本读取器**不写诊断、不触发任何
 *   回调**、纯读取）。
 * · **非坏件**：`uninstalled` 与「角色不命中」⇒ **原样返回视图**（角色判读归调用方：handler 自行
 *   判「声明含/不含角色」、自行看 `status`；列表函数对二者则静默过滤）。
 *
 * 防御（入口 sanity，先于读盘）：`projectRoot` 空/空白、`name` 非字符串 / 空 / `.` / `..` /
 * 含路径分隔符（工具入参防穿越——列表侧名字来自目录枚举、结构性不含这些，故判据无差）⇒
 * `undefined`；读盘异常一律 `undefined`，**绝不抛错**。
 */
export function readMcpDeclaration(projectRoot: string, name: string): McpDeclarationView | undefined {
  const root = typeof projectRoot === "string" ? projectRoot : "";
  if (root.trim() === "") return undefined;
  if (typeof name !== "string" || name === "" || name === "." || name === ".."
    || name.includes("/") || name.includes("\\")) return undefined;
  const loaded = loadDeclaration(root, name);
  return loaded.ok ? loaded.declaration : undefined;
}

/**
 * 按角色列出**可装配的外来 MCP 声明**（G-4 V2；Service `providerFor` 唯一调用面——纯读、绝不建目录）。
 * 冻结签名：`listInstalledMcpServers(projectRoot, roleId)`——**两参调用必须可用**；第三参为可选诊断
 * 回调（坏件观察面；抛错被吞，不得影响会话开启）。
 *
 * 判据链（每步坏即跳该条；`docs/mcp` 不存在＝正常「未安装任何 MCP」态，返回空数组）：
 * 1. 扫 `docs/mcp/` **普通文件**（`*.md`；名字＝文件名去 `.md`；子目录/符号链接/其它扩展名静默忽略）；
 * 2. `loadDeclaration`（名非法/保留名/缺失/解析失败/状态未知 ⇒ 坏件，跳＋诊断）；
 * 3. 过滤：状态 `uninstalled` 静默跳过；状态 `installed` 且 `roleId` 在适用角色列表中才收录
 *    （角色不命中的条目**不**收录——声明为别角色坏掉不该扰乱本角色会话）；
 * 4. 收录 **`InstalledMcpServerV1`**（name/command/args/env——不带 purpose/roles/status/date 等安装面字段），
 *    按 name（字典序）排序；零命中返回空数组。
 *
 * 本函数**绝不抛错**：坏件/IO 异常一律降级为「该条跳过＋诊断」（外来 MCP 是能力装配面不是判定链，
 * 永不因它拒开会话——server 起不来也只「会话照开、工具缺席」）；可选 `onDiagnostic` 回调抛错同样
 * 被吞（回调只是观察面，不得影响会话开启）。
 */
export function listInstalledMcpServers(
  projectRoot: string,
  roleId: string,
  onDiagnostic?: (diagnostic: McpDeclarationDiagnostic) => void,
): readonly InstalledMcpServerV1[] {
  const root = typeof projectRoot === "string" ? projectRoot : "";
  if (root.trim() === "" || typeof roleId !== "string" || roleId === "") return [];
  const log = createDiagnosticLogger({ component: "runtime-core.mcp-declarations", projectRoot: root, roleId });
  const report = (diagnostic: McpDeclarationDiagnostic): void => {
    log.record("mcp-declaration.skip", { path: diagnostic.path, reasonCode: diagnostic.reason });
    try {
      onDiagnostic?.(diagnostic);
    } catch {
      // 观察面回调不得影响会话开启。
    }
  };

  const mcpRootAbs = path.join(root, "docs", "mcp");
  let entries: Dirent[];
  try {
    entries = readdirSync(mcpRootAbs, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // 目录不存在＝正常「未安装」态——静默空数组；其余（EACCES/ENOTDIR…）＝防御面诊断。
    if (code !== "ENOENT") {
      report({ path: MCP_REL, reason: "mcp-root-unreadable", detail: (err as Error).message });
    }
    return [];
  }
  // 扫描序确定化（纯代码单元序）——readdir 的返回序依文件系统；诊断事件依赖它，先钉死。
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const servers: InstalledMcpServerV1[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue; // 子目录/符号链接等非普通文件不是声明条目
    if (!entry.name.endsWith(DECLARATION_EXT)) continue; // 非 `.md` 文件静默忽略
    const name = entry.name.slice(0, -DECLARATION_EXT.length);
    // 声明读取与解析：与读取器共用同一判据（loadDeclaration——单一解析来源，坏件 reason 同口径）。
    const loaded = loadDeclaration(root, name);
    if (!loaded.ok) {
      report(loaded.detail !== undefined
        ? { path: loaded.path, reason: loaded.reason, detail: loaded.detail }
        : { path: loaded.path, reason: loaded.reason });
      continue;
    }
    const declaration = loaded.declaration;
    if (declaration.status === "uninstalled") continue; // 已知的「未安装」态（卸载＝改声明）——正常过滤
    if (!declaration.roles.includes(roleId)) continue; // 非本角色——正常过滤
    servers.push({
      name: declaration.name,
      command: declaration.command,
      args: declaration.args,
      ...(declaration.env !== undefined ? { env: declaration.env } : {}),
    });
  }
  // 按 name（字典序）排序——纯代码单元序，跨环境确定（name 为稳定短 slug）。
  servers.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return servers;
}
