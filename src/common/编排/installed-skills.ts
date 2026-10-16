// 编排主属：G-4「已安装技能」会话开局注入节的**渲染单一来源**（三适配器不得各写一份）。
//
// 背景（产品提案 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §4.1/§4.2；
// 客户 2026-10-16 批准 G-4 V1 实施，十项裁定全采纳）：「安装到角色」＝角色的**能力面**——技能落在
// 目标项目内 `docs/skills/<name>/`（`install.md` 登记 + `SKILL.md` 内容），生效方式＝**会话开局注入**
// 指针节（路径＋**运行期算的** digest＋一句话用途；正文仍在文件、读不受边界约束）。本模块是这一段
// 系统提示文本的**唯一来源**：读登记、算 digest、渲染（含坏件跳过）都在此；三处系统提示拼装
// （Claude/Codex/Pi 适配器；假适配器同步）只做一件事——非空则拼接一行，**不得各写一份**。
//
// 关键纪律（钉死）：
// · **哈希只能由代码算**（`finalize.ts` 先例；su 与项目角色都不会算 hash）——digest＝运行期对
//   `docs/skills/<name>/SKILL.md` 的**当刻字节**算 sha256（64 位小写 hex，与 `finalize.ts::sha256File`
//   同算法：原始字节、不经 UTF-8 解码、不剥 BOM）。
// · **坏件跳过、绝不拒开会话**（沿角色枚举防御先例 `resolve-role.ts` 工具坏件警告跳过）：登记缺失 /
//   解析失败 / SKILL.md 缺失 ⇒ 该条**不注入**＋写诊断（内部诊断记录＋可选 `onDiagnostic` 回调）；
//   会话照常开启（技能是资料不是判定链）。role 不命中 / 状态 `uninstalled` 属**正常过滤**——静默跳过，
//   不算坏件、不产诊断。
// · **零技能 ⇒ 返回空串**（调用侧零渲染）；多技能按 name（目录名）排序、编号自 1 递增。
// · 本模块**只读**、纯渲染：不写盘、不改任何边界/写权、不碰滚动重建语义（激活＝重建归桌面/适配器侧）。
// · 冻结签名（对三适配器的落盘契约）：`renderInstalledSkillsSection(projectRoot, roleId): string`
//   ——同步返回、两参调用必须可用；第三参为可选诊断回调（默认调用不受影响）。
// · I3 前置（PM 小扩展派发，2026-10-16）：另导出**登记读取器** `readSkillRegistration(projectRoot, name)`
//   （返回 `SkillRegistrationView | undefined`）——桌面安装 handler 的「登记含/不含角色」校验面；
//   与渲染器**共用同一加载判据**（`loadRegistration`，单一解析来源，配置侧不得复制解析逻辑）；
//   坏件/缺失 ⇒ `undefined`（与渲染器坏件集逐字同口径）；`uninstalled`/角色不命中非坏件、原样返回视图。
//
// 与 G-1 的关系：同属「指针＋运行期哈希」家族——G-1 是**派发时**哈希（必读块，handback.ts），
// 本模块是**开局时**哈希（注入节）；两处渲染各自单一来源、互不代写。

import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";

/** 技能树（项目根相对，posix）：`docs/skills/<name>/`（与 G-1 `docs/contracts/` 同级项目文档面）。 */
const SKILLS_REL = "docs/skills";
/** 登记文件名（su 写、系统读；§4.1 两文件形态之一）。 */
const REGISTRATION_FILE = "install.md";
/** 技能内容文件名（角色读这个；digest 对它算）。 */
const CONTENT_FILE = "SKILL.md";

/**
 * 冻结文案（逐字；产品提案 §4.2 注入节草案——三适配器拼接同一来源，不得改写/增删）。
 * 零技能时以上内容整体不渲染（返回空串）。
 */
const SECTION_HEADER = "## 本角色已安装技能（动手前先读，按序）";
const SECTION_FOOTER = "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。";

/**
 * 坏件跳过原因码（诊断面——内部诊断记录与可选 `onDiagnostic` 回调同用这些值）。
 * · `skills-root-unreadable`：`docs/skills` 存在但不可读/不是目录——整体零渲染（防御；不是坏条目）。
 * · `name-invalid`：目录名含控制字符（注入文本会被破坏）——该条跳过。
 * · `registration-missing`：`install.md` 不存在（ENOENT）——该条跳过。
 * · `registration-parse-failed`：`install.md` 读取失败（非 ENOENT）/字段缺失或非法/状态值未知——该条跳过。
 * · `skill-file-missing`：`SKILL.md` 不存在/不可读（含 EISDIR）——该条跳过。
 */
export type InstalledSkillsDiagnosticReason =
  | "skills-root-unreadable"
  | "name-invalid"
  | "registration-missing"
  | "registration-parse-failed"
  | "skill-file-missing";

/** 坏件跳过事件（供可选回调/测试断言；`path` 为项目相对 posix 路径，指向坏在哪件文件）。 */
export interface InstalledSkillsDiagnostic {
  path: string;
  reason: InstalledSkillsDiagnosticReason;
  /** 细节（底层错误 message 等；可缺）。 */
  detail?: string;
}

/** 登记解析结果（§4.1 四字段；全部齐备才产出——缺任一即解析失败，该条跳过）。
 * **公开视图**（G-4 I3：桌面安装 handler 的登记校验面——`readSkillRegistration` 返回此型；
 * 配置侧不得复制解析逻辑，逐字同口径、单一解析来源）。 */
export interface SkillRegistrationView {
  /** 一句话用途（渲染进注入行；`用途：…`）。 */
  purpose: string;
  /** 适用角色 id 列表（`、`/`，`/`,` 分隔、trim、去反引号包裹；命中判据见 `renderInstalledSkillsSection`）。 */
  roles: string[];
  /** 状态原文（`installed`／`uninstalled` 为已知态；其余值＝坏件——读取器与渲染器同判 undefined/跳过）。 */
  status: string;
  /** 安装日期（取行内首个 `YYYY-MM-DD`；无则原文照录）。 */
  date: string;
}

/**
 * 解析 `install.md` 登记（§4.1 模板；宽容但有界）：
 * · 行式解析：`- 用途：…` 式的键行——显式四个键（用途/适用角色/状态/安装日期），行首 `-`/`*` 可省，
 *   全角/半角冒号均可；同键**首现为准**；其余行（标题、注释、其它键）忽略。
 * · 四字段**任一缺失或为空** ⇒ 抛错（调用侧按解析失败跳过——绝不猜补）。
 * · BOM 剥离；CRLF 兼容。
 */
function parseRegistration(text: string): SkillRegistrationView {
  const fields = new Map<string, string>();
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = rawLine.trim().match(/^(?:[-*]\s*)?(用途|适用角色|状态|安装日期)\s*[：:]\s*(.*)$/);
    if (m === null || m[1] === undefined || m[2] === undefined) continue;
    if (!fields.has(m[1])) fields.set(m[1], m[2].trim());
  }
  const purpose = fields.get("用途") ?? "";
  const rolesRaw = fields.get("适用角色") ?? "";
  const status = fields.get("状态") ?? "";
  const dateRaw = fields.get("安装日期") ?? "";
  if (purpose === "" || rolesRaw === "" || status === "" || dateRaw === "") {
    throw new Error("登记字段缺失：需齐备 用途/适用角色/状态/安装日期");
  }
  const roles = rolesRaw.split(/[、，,]/).map((s) => s.trim().replace(/^`+|`+$/g, "")).filter((s) => s !== "");
  if (roles.length === 0) throw new Error("适用角色为空");
  const date = dateRaw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? dateRaw;
  return { purpose, roles, status, date };
}

/**
 * 渲染器与读取器**共用**的加载判据（单一解析来源）——读 `docs/skills/<name>/install.md` 并解析；
 * 坏件/缺失以 `reason` 回报（**绝不抛错**）。判据与原因码同渲染器诊断面（见 `InstalledSkillsDiagnosticReason`）：
 * · `name-invalid`（名空/含控制字符）；`registration-missing`（ENOENT）；`registration-parse-failed`
 *   （读取失败〔非 ENOENT〕/四字段缺失或非法/状态值未知）；`ok` 仅两种已知状态（installed 与
 *   uninstalled——后者不是坏件，过滤归调用方）。**不检查 `SKILL.md`**（那是渲染面的事）。
 */
function loadRegistration(projectRoot: string, name: string): {
  ok: true;
  registration: SkillRegistrationView;
} | {
  ok: false;
  path: string;
  reason: InstalledSkillsDiagnosticReason;
  detail?: string;
} {
  const registrationRel = `${SKILLS_REL}/${name}/${REGISTRATION_FILE}`;
  if (name === "" || /[\u0000-\u001f]/.test(name)) {
    return { ok: false, path: registrationRel, reason: "name-invalid", detail: "目录名含控制字符" };
  }
  let registrationText: string;
  try {
    registrationText = readFileSync(path.join(projectRoot, "docs", "skills", name, REGISTRATION_FILE), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: false, path: registrationRel, reason: "registration-missing" };
    return { ok: false, path: registrationRel, reason: "registration-parse-failed", detail: (err as Error).message };
  }
  let registration: SkillRegistrationView;
  try {
    registration = parseRegistration(registrationText);
  } catch (err) {
    return { ok: false, path: registrationRel, reason: "registration-parse-failed", detail: (err as Error).message };
  }
  if (registration.status !== "installed" && registration.status !== "uninstalled") {
    // 未知状态值：状态不明不猜（渲染器据此不注入；诊断可见，防「拼错状态 ⇒ 静默不生效」）。
    return { ok: false, path: registrationRel, reason: "registration-parse-failed", detail: `未知状态值：${registration.status}` };
  }
  return { ok: true, registration };
}

/**
 * **读取并解析一条技能登记**（G-4 I3 前置；PM 派发 2026-10-16）——桌面安装 handler 的
 * 「登记含/不含角色」校验面。`parseRegistration` 的公开视图，**单一解析来源**：与渲染器共用
 * `loadRegistration` 判据，逐字同口径；配置侧**不得复制解析逻辑**。
 *
 * 与渲染器的判据对照（测试双向钉住）：
 * · **坏件/缺失**（名非法/登记缺失/解析失败/状态值未知）⇒ `undefined`——与渲染器「该条跳过＋诊断」的
 *   **坏件集完全相同**（渲染器对坏件额外写诊断；本读取器**不写诊断、不触发任何回调**、纯读取）。
 * · **非坏件**：`uninstalled` 与「角色不命中」⇒ **原样返回视图**（角色判读归调用方：handler 自行
 *   判「登记含/不含角色」、自行看 `status`）；渲染器对二者则静默过滤不注入。
 * · 本函数**不检查** `SKILL.md`（存在性与 digest 属渲染面；安装回执 digest 以工具回执为准）。
 *
 * 防御（入口 sanity，先于读盘）：`projectRoot` 空/空白、`name` 空 / `.` / `..` / 含路径分隔符
 * （工具入参防穿越——渲染器侧名字来自目录枚举、结构性不含这些，故判据无差）⇒ `undefined`；
 * 读盘异常一律 `undefined`，**绝不抛错**。
 */
export function readSkillRegistration(projectRoot: string, name: string): SkillRegistrationView | undefined {
  const root = typeof projectRoot === "string" ? projectRoot : "";
  if (root.trim() === "") return undefined;
  if (typeof name !== "string" || name === "" || name === "." || name === ".."
    || name.includes("/") || name.includes("\\")) return undefined;
  const loaded = loadRegistration(root, name);
  return loaded.ok ? loaded.registration : undefined;
}

/**
 * G-4「已安装技能（先读）」注入节的**渲染单一来源**（冻结签名——三适配器按此路径/签名接线）。
 *
 * 判据链（每步坏即跳该条；`docs/skills` 不存在＝正常零技能态，返回空串）：
 * 1. 扫 `docs/skills/` 子目录（`<name>`＝稳定短 slug、与目录名一致）；文件条目忽略；
 * 2. 读 `docs/skills/<name>/install.md`（缺失/读取失败/解析失败/名非法/状态值未知 ⇒ 坏件，跳＋诊断）；
 * 3. 过滤：状态 `uninstalled` 静默跳过；状态 `installed` 且 `roleId` 在适用角色列表中才继续
 *    （role 不命中的条目**不**读 SKILL.md——登记为别角色坏掉不该扰乱本角色会话）；
 * 4. 对命中条目读 `docs/skills/<name>/SKILL.md` 并算 sha256（缺失/不可读 ⇒ 坏件，跳＋诊断）；
 * 5. 全部命中的按 name 排序、编号自 1 递增渲染；零命中返回 `""`。
 *
 * 本函数**绝不抛错**：坏件/IO 异常一律降级为「该条跳过＋诊断」（技能是资料不是判定链，永不因它
 * 拒开会话）；可选 `onDiagnostic` 回调抛错同样被吞（回调只是观察面，不得影响会话开启）。
 */
export function renderInstalledSkillsSection(
  projectRoot: string,
  roleId: string,
  onDiagnostic?: (diagnostic: InstalledSkillsDiagnostic) => void,
): string {
  const root = typeof projectRoot === "string" ? projectRoot : "";
  if (root.trim() === "") return "";
  const log = createDiagnosticLogger({ component: "orchestration.installed-skills", projectRoot: root, roleId });
  const report = (diagnostic: InstalledSkillsDiagnostic): void => {
    log.record("installed-skills.skip", { path: diagnostic.path, reasonCode: diagnostic.reason });
    try {
      onDiagnostic?.(diagnostic);
    } catch {
      // 观察面回调不得影响会话开启。
    }
  };

  const skillsRootAbs = path.join(root, "docs", "skills");
  let entries: Dirent[];
  try {
    entries = readdirSync(skillsRootAbs, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // 目录不存在＝正常零技能态（项目从未装过技能）——静默空串；其余（EACCES/ENOTDIR…）＝防御面诊断。
    if (code !== "ENOENT") {
      report({ path: SKILLS_REL, reason: "skills-root-unreadable", detail: (err as Error).message });
    }
    return "";
  }
  // 扫描序确定化（纯代码单元序）——readdir 的返回序依文件系统；诊断事件依赖它，先钉死（渲染序下方另按 name 排）。
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const rendered: { name: string; purpose: string; sha256: string; date: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue; // docs/skills 下直接放的文件不是技能条目（`<name>/` 目录才是）
    const name = entry.name;
    // 登记读取与解析：与读取器共用同一判据（loadRegistration——单一解析来源，坏件 reason 同口径）。
    const loaded = loadRegistration(root, name);
    if (!loaded.ok) {
      report(loaded.detail !== undefined
        ? { path: loaded.path, reason: loaded.reason, detail: loaded.detail }
        : { path: loaded.path, reason: loaded.reason });
      continue;
    }
    const registration = loaded.registration;
    if (registration.status === "uninstalled") continue; // 已知的「未安装」态（V1 卸载＝停用）——正常过滤
    if (!registration.roles.includes(roleId)) continue; // 非本角色——正常过滤（静默；不读 SKILL.md）

    const contentRel = `${SKILLS_REL}/${name}/${CONTENT_FILE}`;
    let digest: string;
    try {
      // digest＝**当刻字节** sha256（同一实现处理「存在性校验」：读不到＝缺失）——「哈希只能由代码算」。
      digest = createHash("sha256").update(readFileSync(path.join(skillsRootAbs, name, CONTENT_FILE))).digest("hex");
    } catch (err) {
      report({ path: contentRel, reason: "skill-file-missing", detail: (err as Error).message });
      continue;
    }
    rendered.push({ name, purpose: registration.purpose, sha256: digest, date: registration.date });
  }

  if (rendered.length === 0) return ""; // 零技能 ⇒ 空串（调用侧零渲染）
  // 按 name（目录名）排序——纯代码单元序，跨环境确定（name 为稳定短 slug）；编号自 1 递增。
  rendered.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const lines = [SECTION_HEADER];
  rendered.forEach((r, i) => {
    lines.push(`${i + 1}. ${SKILLS_REL}/${r.name}/${CONTENT_FILE}（用途：${r.purpose}；sha256:${r.sha256}；安装于 ${r.date}）`);
  });
  lines.push(SECTION_FOOTER);
  return lines.join("\n");
}
