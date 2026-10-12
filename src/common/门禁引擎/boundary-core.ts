// 门禁引擎私有辅助：边界解析核心（双来源：项目覆盖 / 内置）
// resolve-boundary 与 resolve-role 共用此核心，避免 Service 之间相互调用。
// 格式：.yaml/.yml 走严格 YAML（boundary-yaml.ts）；其他（如技能内置 references/built-in-boundary.md）
// 走 legacy Markdown 表格解析（boundary-parse.ts，仅为技能内置边界保留，技能安装目录不可改）。

import { readFileSync, statSync } from "node:fs";
import type { Acceptance, BoundaryEntry, BoundarySection1, PinEntry, Root } from "../../model/boundary.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { parseBoundarySection1 } from "./boundary-parse.ts";
import { parseBoundaryYaml } from "./boundary-yaml.ts";
import { joinRoot, readTextFile, sha256File } from "./io.ts";
import { absRel, compareKey, normalizeLexical } from "./paths.ts";
// 冷启动「有界创世例外」（设计 §10.1 / §12.2）：治理种子边界的构造（`governanceBoundaryEntries` /
// `buildGovernanceSeedBoundaryForGate`）**已迁入本角色**（`./governance-seed.ts`，§12.4）。
// 此前 `boundary-core` 从编排私有 `../编排/bootstrap.ts` 导入它——**§6 违规**（跨角色导入私有
// `common/` ＋ Service 反向依赖 Pipeline）。T31 搬迁即修复：改从本角色内导入（搬迁非 fork）。
import { buildGovernanceSeedBoundaryForGate } from "./governance-seed.ts";

export const BUILT_IN_SOURCE = "<built-in:ans-governed-construction SKILL boundary>";

/**
 * 内置治理角色的唯一 id（SKILL.md「Built-in Role: ANS Governance」）。
 * 它没有角色目录，故不参与目录枚举，但在引擎里可寻址（resolveRole 下沉为 built-in-governance）。
 */
export const BUILT_IN_GOVERNANCE_ROLE_ID = "su";

/**
 * 内置治理角色的角色说明（无 role-card.md 文件，定义在 SKILL.md §Built-in Role: ANS Governance）。
 * 供 resolveRole 与 listProject 共用，避免界面侧另写一份描述。
 * 「边界文件格式」一段为客户 2026-10-12 裁定 C（从源头防）：真机端到端测试抓到 su 给新角色写
 * **散文式 boundary.md** ⇒ 加载器静默解析出 0 条、该角色一切写入被拒（见 loadBoundaryFile 的 A 修复）。
 * 此处写死格式要求与最小可抄示例，防止再写出读不懂的边界文件。
 * 「temp 暂存区」一段为派工 T-1（客户 2026-10-12 裁定）：每角色一个 `<项目>/temp/<角色>/`——
 * 「未通过产物」暂存区；被门禁拒绝的写入内容**不入 temp**（拒绝=零副作用）。详细格式恒以本段为
 * 单一来源，`governance-seed.ts` 只作交叉提示、不复制。
 * 「落盘后自动开工」一段为派工 J-1（客户原话「这个确认了，写盘之后，要自动启动开发啊」）：
 * 客户确认落盘 + 自动收尾后，su **立刻**用 `dispatch_task` 派发第一项开发任务（派发 ≠ 授权——
 * 措辞与 H-1 的语义硬约束逐字一致，见 `src/provider/pi/session.ts` 派发能力头注）。
 * 「文档面固定清单 + 交付纪律」一段为客户派工（原话「各个角色的工作流有问题，为啥不写文档呢」）：
 * 真机根因——su 建出的角色边界只授代码路径、一条文档路径都没有 ⇒ 门禁拒掉一切文档写入，角色
 * **不能**维护自己的文档。故建/改角色时文档面（五文件 + 四目录 + 测试目录）须随边界一并授予，
 * 且**代码与文档同批交回**。
 */
export const BUILT_IN_ROLE_CARD_TEXT = [
  "# 角色：ANS Governance（su）",
  "",
  "唯一的内置角色，定义在 SKILL.md，无需单独的角色卡或边界文档。",
  "",
  "职责：创建项目角色（含编排角色）、维护边界文档、走治理变更流程；",
  "新目录权限、角色归属调整一类改动必须由它更新 Section 1 并经客户确认。",
  "",
  "建角色时，边界文件必须写 `角色卡/<角色 id>/boundary.yaml`（YAML，不是 .md）：",
  "顶层 `role: <角色 id>` + `entries:` 列表，每条含 kind（file|directory）、path、purpose。",
  "最小可抄示例（照抄、改路径即可）：",
  "",
  "```yaml",
  "role: 实现者",
  "entries:",
  "  - kind: directory",
  "    path: src/",
  "    purpose: 该角色负责的源码目录",
  "```",
  "",
  "写 Markdown 散文/表格不会被解析（加载器只读 YAML 的 role + entries 结构）——",
  "那会让该角色被判「Section 1 为空」并拒绝它的一切写入。",
  "",
  "建/改**每个项目角色**的边界时，Section 1 应包含 `temp/<角色 id>/`",
  "（kind: directory，purpose「未通过/返工产物暂存，供审核对照」）。",
  "",
  "退回/返工流程（建角色时一并写进该角色的 role-card.md）：被验收退回或要求返工的产物，",
  "先存档进 `temp/<角色 id>/`（带日期与版本，如 `2026-10-12_草案-v2.md`），并写一份",
  "`temp/<角色 id>/REVIEW.md` 记「谁退的 / 为什么 / 要求什么」；然后才改主交付物。",
  "",
  "红线：不得把「被门禁拒绝的写入内容」存进 temp——拒绝即零副作用，被拒的写入根本没有产物可存。",
  "temp 属**草稿区**：不是交付物、不参与 pin；项目角色建 `.gitignore` 时应忽略 `temp/`。",
  "",
  "建/改每个项目角色时，**边界须一并授予该角色的文档面**（固定清单，逐项标 kind；不给 ⇒ 角色写不了自己的文档）：",
  "文件（kind: file）——`角色卡/<角色 id>/feature-map.md`、`角色卡/<角色 id>/memo.md`、",
  "`角色卡/<角色 id>/changelog.md`、`角色卡/<角色 id>/functional-description.md`、`角色卡/<角色 id>/api-spec.md`；",
  "目录（kind: directory）——`角色卡/<角色 id>/docs/design/`、`角色卡/<角色 id>/docs/feature/`、",
  "`角色卡/<角色 id>/docs/change/`、`角色卡/<角色 id>/docs/fix/`；另加该角色自己的测试目录",
  "（如 `test/<角色 id>/`，仅当该角色承担测试；`temp/<角色 id>/` 按上段 T-1 一并授予）。",
  "",
  "交付纪律：每次交付都要同步自己的文档（功能说明/流程、变更记录、memo、api-spec），",
  "**代码与文档同批交回**；文档缺口不得靠「下次补」。",
  "",
  "落盘后自动开工（J-1）：角色与治理产物落盘（客户经 request_confirmation 确认、写入完成、",
  "自动收尾）之后，**立刻**用 `dispatch_task` 把第一项开发任务派发给对应角色——roleId 用刚建出的",
  "角色，task 文本**自足**（做什么 / 依据哪份文档或契约 / 完成标准）——**不等客户手动转达**。",
  "",
  "派发 ≠ 授权：目标角色的写权仍只来自它自己的 Section 1 与 `request_confirmation` 的 confirmed:true；",
  "不得在任务文本里代授权限（如「已获准写 src/**」）。",
  "",
  "派发失败/被拒（回执「未能派发」）→ 如实告知客户原因，**不得假设已开工**；",
  "若没有可派发的角色，如实说明并停在「待客户指示」。",
  "",
  "边界：内置治理边界（skill 根）。本版 fail-closed——acceptance 未接受，",
  "故治理会话的一切写入都会被门禁在写之前拒绝（契约 §0：v1 治理会话不允许写盘）。",
].join("\n");

/** 内置治理边界（源自技能 references/built-in-boundary.md），skill 根；condition 为固定 slug */
function builtInEntries(): BoundaryEntry[] {
  return [
    { root: "skill", path: "SKILL.md", kind: "file", purpose: "治理规则、不变量、检查点" },
    { root: "skill", path: "SKILL.zh.md", kind: "file", purpose: "治理规则（中文）" },
    {
      root: "skill",
      path: "references",
      kind: "conditional-directory",
      condition: "reference-maintenance",
      purpose: "角色卡与边界文档格式的参考文档",
    },
    {
      root: "skill",
      path: "docs",
      kind: "conditional-directory",
      condition: "docs-bootstrap",
      purpose: "design/feature/change/fix 文档脚手架",
    },
    {
      root: "skill",
      path: "角色卡",
      kind: "conditional-directory",
      condition: "role-restructuring",
      purpose: "角色目录（role-card.md / boundary.md / changelog.md）",
    },
  ];
}

/**
 * 内置治理角色的边界（Section 1）。fail-closed：acceptance 恒为未接受，
 * 故 resolveWrite 对其拒绝一切写入——治理会话在 v1 不允许写盘（契约 §0）。
 * 由 resolveBoundarySection 与 listProject 共用，避免两份实现。
 */
export function builtInBoundarySection(): BoundarySection1 {
  return {
    entries: builtInEntries(),
    boundarySource: BUILT_IN_SOURCE,
    acceptance: { accepted: false, source: "" },
  };
}

/** 判断边界文件属于哪个根：先项目根，再技能根，默认项目根 */
function rootOfFile(fileAbs: string, projectRootAbs: string, skillRootAbs: string): Root {
  if (absRel(fileAbs, projectRootAbs) !== null) return "project";
  if (absRel(fileAbs, skillRootAbs) !== null) return "skill";
  return "project";
}

/** 是否为 YAML 边界文件 */
function isYamlPath(p: string): boolean {
  const q = p.toLowerCase();
  return q.endsWith(".yaml") || q.endsWith(".yml");
}

/** 按格式解析条目：YAML 严格；其他走 legacy Markdown */
function parseEntries(text: string, sourcePath: string, defaultRoot: Root): BoundaryEntry[] {
  if (isYamlPath(sourcePath)) return parseBoundaryYaml(text);
  return parseBoundarySection1(text, defaultRoot);
}

/** 统一的"未接受"结果：清空条目、accepted=false、原因写入 parseError（resolveWrite 据此拒一切写）。 */
function unaccepted(boundarySource: string, parseError: string): BoundarySection1 {
  return { entries: [], boundarySource, acceptance: { accepted: false, source: "" }, parseError };
}

/** 校验 pin 形状；非法返回错误说明（非空字符串），合法返回 null。 */
function pinShapeError(pin: unknown): string | null {
  if (!Array.isArray(pin)) return "pin 必须是数组";
  if (pin.length === 0) return "pin 为空数组（accepted=true 需要至少一条可验证证据）";
  for (let i = 0; i < pin.length; i++) {
    const p = pin[i] as Record<string, unknown>;
    if (typeof p !== "object" || p === null) return `pin[${i}] 不是对象`;
    if (typeof p.path !== "string" || p.path.trim() === "") return `pin[${i}] 缺少 path`;
    if (typeof p.sha256 !== "string" || p.sha256.trim() === "") return `pin[${i}] 缺少 sha256`;
  }
  return null;
}

/**
 * SHA-256 pin 校验（F6 升级：把「配置自称 accepted」升级为「可验证证据」）。
 * 仅当 acceptance.pin 存在时启用；缺省则沿用旧的 source 自称来源（向后兼容）。
 * 规则（全 fail-closed）：
 *  - 每条 pin 指向的文件都必须可读，且其 SHA-256（十六进制，大小写不敏感）与声明一致；
 *    **读取失败视为不匹配**（文件不存在/不可读同样 fail-closed）。
 *  - 正在加载的边界文件必须被至少一条 pin 覆盖——否则该边界没有证据，不得凭无关 pin 认可。
 * 通过返回 null；否则返回失败原因，调用方据此返回未接受 + parseError。
 */
async function verifyPins(fileAbs: string, projectRootAbs: string, pins: PinEntry[]): Promise<string | null> {
  const loadedKey = compareKey(normalizeLexical(fileAbs));
  let covered = false;
  for (const p of pins) {
    const targetAbs = joinRoot(projectRootAbs, p.path);
    if (compareKey(normalizeLexical(targetAbs)) === loadedKey) covered = true;
    let actual: string;
    try {
      actual = await sha256File(targetAbs);
    } catch (err) {
      return `pin 指向的文件不可读：${p.path}（${(err as Error).message}）`;
    }
    if (actual !== p.sha256.trim().toLowerCase()) {
      return `边界文件的 SHA-256 与 pin 不符：${p.path}`;
    }
  }
  if (!covered) {
    return `当前边界文件未被任何 pin 覆盖：${fileAbs}`;
  }
  return null;
}

/** 读取并解析一个边界文件；失败（读取、解析或 pin 校验）返回"未接受 + parseError"的边界。
 *  导出供 listProject 复用，避免另写一份解析。 */
export async function loadBoundaryFile(
  boundarySource: string,
  fileAbs: string,
  projectRootAbs: string,
  skillRootAbs: string,
  acceptance: Acceptance,
): Promise<BoundarySection1> {
  let text: string;
  try {
    text = await readTextFile(fileAbs);
  } catch (err) {
    return unaccepted(boundarySource, `读取边界文件失败：${(err as Error).message}`);
  }
  let entries: BoundaryEntry[];
  try {
    entries = parseEntries(text, boundarySource, rootOfFile(fileAbs, projectRootAbs, skillRootAbs));
  } catch (err) {
    return unaccepted(boundarySource, (err as Error).message);
  }

  // A（客户 2026-10-12 裁定）：边界文件**存在且被读到**，但 Section 1 解析出 **0 条** → **响亮失败**
  // （记为 parseError），不得静默成空集。真机实测缺陷：su 给新角色写了散文式 Markdown `boundary.md`
  // （「## 允许写入（白名单，仅此）」+ 反引号路径列表），legacy 表格解析器静默产出 0 条、`parseError`
  // 为空 ⇒ 该角色一切写入被拒，而拒写信息只说「未匹配任何边界条目…允许路径：（无）」，完全不提示
  // 「边界文件读不懂」。文案让模型与客户都看懂原因与出路。
  //
  // 边界（合法空集不误伤，测试钉于 `test/门禁引擎/boundary-empty-and-builtin.test.ts`）：
  //  · 仅针对**文件解析路径**（本函数）；**代码合成**的边界（内置 `builtInBoundarySection()`、治理种子
  //    `buildGovernanceSeedBoundaryForGate()`、未接受段 `unaccepted()`）不经此处，天然不受影响。
  //  · YAML（.yaml/.yml）：结构违规在 `parseBoundaryYaml` 一律抛错；能走到这里且 0 条 = 文件**显式**
  //    写了 `entries: []`（按声明格式明确表达空集）→ 保持现状、不算解析失败（客户 2026-10-12 裁定的
  //    O1 角落依赖其仍可枚举，见 `test/测试/cli-genesis-boundary.test.ts`）。
  //  · 其他（.md 等，legacy Markdown 表格解析）：散文/无表格/表格全无效行 → 0 条 = 文件**没有**按
  //    加载器认得的格式表达 → 正是上述缺陷现场 → parseError。
  if (entries.length === 0 && !isYamlPath(boundarySource)) {
    return unaccepted(
      boundarySource,
      `边界文件存在但 Section 1 为空或无法解析：${boundarySource}（本加载器按 YAML 的 role + entries 结构解析边界；Markdown 散文/表格不会被解析——请把该文件改写为 boundary.yaml）`,
    );
  }

  // F6 升级：只在"声称已接受且给出了 pin"时校验可验证证据——在认可 accepted 之前先比对 SHA-256。
  // 不制造中间态：任何一步不过 → 整条边界回落为 accepted=false（下游只看 accepted 真假）。
  if (acceptance && acceptance.accepted === true && acceptance.pin !== undefined) {
    const shapeErr = pinShapeError(acceptance.pin);
    if (shapeErr !== null) return unaccepted(boundarySource, `pin 非法：${shapeErr}`);
    const pinErr = await verifyPins(fileAbs, projectRootAbs, acceptance.pin);
    if (pinErr !== null) return unaccepted(boundarySource, `边界未通过 SHA-256 pin 校验：${pinErr}`);
  }

  return { entries, boundarySource, acceptance };
}

/**
 * **同步重读**盘上边界文件的条目（异步加载的对照版）——仅用于 `resolveWrite` 的「旧快照」线索做
 * **盘上对照**（真机现象：su 已改好盘上边界，但活会话持有开会话时解析的旧快照 ⇒ 写入被拒且不提示）。
 * 不做接受 / pin 校验——对照只看**条目**（条目含不含目标路径与接受证据无关）。
 *
 * **可判定才返回条目**：非文件路径（内置 `<built-in:…>` 标签 / 空串）/ 读取失败 / 解析报错 → `null`。
 * 调用方（`resolve-write.ts`）对 `null` **保持原文案、不得猜测**；线索只是提示，**判定仍是拒绝**。
 *
 * **性能（客户派工：拒写路径的同步读盘加缓存）**：本函数落在「每次落入未匹配分支的写尝试」上——
 * 一轮数百次写尝试时，读取+解析会是主进程的同步阻塞源。故加**模块级缓存**，按 `mtimeMs`+`size`
 * 短路：文件未变 → 只做一次 `stat`，**跳过读取与解析**；变了才重读（内容变更必须仍被检出）。
 * 判定限制（如实）：`mtime+size` 检不出「同尺寸且 mtime 未变」的改动——真实写入都会更新 mtime，
 * 此类碰撞仅可能出现在粗时间粒度的文件系统上；且即便漏检，影响的只是**提示句**（可能未显示/多显示
 * 一次旧快照线索），**判定结果（allowed）从不依赖盘面**。读取失败（stat 成功但读不到）不写缓存，
 * 下次重新判定。缓存条目**只读**（调用方不得改动返回数组），容量有上限（超限整体清空，进程内
 * 边界文件数量级本就很小）。
 */
interface StaleProbeCacheEntry {
  mtimeMs: number;
  size: number;
  /** null = 该内容下不可判定（解析失败），按 mtime+size 记忆，避免对坏文件反复解析。 */
  entries: BoundaryEntry[] | null;
}

/** 测试可注入的盘面读原语（计数桩用；生产恒用真实 node:fs）。 */
export interface StaleBoundaryProbeIo {
  stat: (absPath: string) => { mtimeMs: number; size: number };
  read: (absPath: string) => string;
}

const STALE_PROBE_IO: StaleBoundaryProbeIo = {
  stat: (absPath) => {
    const s = statSync(absPath);
    return { mtimeMs: s.mtimeMs, size: s.size };
  },
  read: (absPath) => readFileSync(absPath, "utf8"),
};

const STALE_PROBE_CACHE_CAP = 256;
const staleProbeCache = new Map<string, StaleProbeCacheEntry>();

export function reloadBoundaryEntriesSync(
  boundarySource: string,
  projectRootAbs: string,
  skillRootAbs: string,
  io: StaleBoundaryProbeIo = STALE_PROBE_IO,
): BoundaryEntry[] | null {
  if (typeof boundarySource !== "string" || boundarySource.trim() === "" || boundarySource.startsWith("<")) {
    return null; // 内置标签 / 空串：不是盘上文件，无法判定（无 I/O）
  }
  const fileAbs = joinRoot(projectRootAbs, boundarySource);
  let st: { mtimeMs: number; size: number };
  try {
    st = io.stat(fileAbs);
  } catch {
    return null; // 读盘失败：无法判定（不猜测）。stat 廉价，不缓存失败——文件可能随时出现
  }
  const hit = staleProbeCache.get(fileAbs);
  if (hit !== undefined && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.entries; // 文件未变：跳过读取与解析（缓存命中即本函数的常规路径）
  }
  let text: string;
  try {
    text = io.read(fileAbs);
  } catch {
    return null; // stat 成功但读取失败（竞态/权限）：本次不可判定，不写缓存（下次重新判定）
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let entries: BoundaryEntry[] | null;
  try {
    entries = parseEntries(text, boundarySource, rootOfFile(fileAbs, projectRootAbs, skillRootAbs));
  } catch {
    entries = null; // 新解析报错：对照不可信，无法判定（不猜测）；按 mtime+size 记忆
  }
  if (staleProbeCache.size >= STALE_PROBE_CACHE_CAP) staleProbeCache.clear();
  staleProbeCache.set(fileAbs, { mtimeMs: st.mtimeMs, size: st.size, entries });
  return entries;
}

/**
 * 双来源边界解析（+ 冷启动创世例外）：
 * 1) 项目覆盖（若已接受优先）：项目配置了该角色边界文件，且项目级接受证据已接受；
 * 2) 治理边界覆盖：项目提供了治理边界文档（针对内置治理角色）；
 * 3) **冷启动「有界创世例外」**（设计 §10.1 / §12.2）：空项目（尚无治理边界文档）上，若调用方
 *    显式声明了**操作者发起的 bootstrap**（`project.genesisBootstrap`），对**内置治理角色**返回
 *    「项目根」治理种子边界（**普通目录** `角色卡/`、`docs/`、`.ans/`——`scope: undefined` 下命中即
 *    放行，无需 scope/slug），acceptance = 该操作者指令；
 * 4) 内置：回退内置治理边界，且标记为未接受（resolveWrite 将据此拒绝一切写入）。
 *
 * ⚠️ 「导入即授权」有**两义**，本函数按来源区分，**两者都不是空白支票**：
 *  · **已有角色的项目**：导入 = 授权**每个角色按其自身边界**工作（第 1 步，per-role-boundary，非 blanket）；
 *  · **空项目**：导入并开启内置治理角色 = **有界创世**（第 3 步，仅治理产物）。
 *
 * ⚠️ 第 3 步置于第 2 步**之后** = **自终止**：项目治理边界文档一经写出并经 pin 接受，
 *    `governanceBoundary.path` 非空 ⇒ 第 2 步先命中、第 3 步永不求值——创世授权随之失效
 *    （即便 `genesisBootstrap` 残留亦然；自终止是结构性的，不依赖调用方清除该字段）。
 */
export async function resolveBoundarySection(
  roleId: string,
  project: ProjectConfig,
): Promise<BoundarySection1> {
  const projectRootAbs = project.projectRoot;
  const skillRootAbs = project.skillRoot;
  const gov = project.governanceBoundary;
  const loc = project.roles ? project.roles[roleId] : undefined;

  // 1) 项目覆盖（若已接受）
  if (gov && gov.acceptance && gov.acceptance.accepted === true && loc && loc.boundary) {
    return loadBoundaryFile(loc.boundary, joinRoot(projectRootAbs, loc.boundary), projectRootAbs, skillRootAbs, gov.acceptance);
  }

  // 2) 治理边界覆盖
  if (gov && gov.path) {
    return loadBoundaryFile(gov.path, joinRoot(projectRootAbs, gov.path), projectRootAbs, skillRootAbs, gov.acceptance);
  }

  // 3) 冷启动「有界创世例外」（§10.1 / §12.2）：仅对**内置治理角色**、且仅当调用方显式声明操作者 bootstrap 时生效。
  //    种子条目（普通目录 角色卡//docs//.ans/）来自本角色的 governance-seed.ts（单一来源，见文件头 import 注释）。
  //    source 为空串时 F6（resolveWrite）仍会拒绝一切写入——不因「声称创世」而放行无证据的写入（fail-closed）。
  if (
    roleId === BUILT_IN_GOVERNANCE_ROLE_ID &&
    project.genesisBootstrap &&
    typeof project.genesisBootstrap.source === "string"
  ) {
    return buildGovernanceSeedBoundaryForGate(project.genesisBootstrap.source);
  }

  // 4) 内置（未接受）
  return builtInBoundarySection();
}
