// 门禁引擎私有辅助：边界解析核心（双来源：项目覆盖 / 内置）
// resolve-boundary 与 resolve-role 共用此核心，避免 Service 之间相互调用。
// 格式：.yaml/.yml 走严格 YAML（boundary-yaml.ts）；其他（如技能内置 references/built-in-boundary.md）
// 走 legacy Markdown 表格解析（boundary-parse.ts，仅为技能内置边界保留，技能安装目录不可改）。

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
 */
export const BUILT_IN_ROLE_CARD_TEXT = [
  "# 角色：ANS Governance（su）",
  "",
  "唯一的内置角色，定义在 SKILL.md，无需单独的角色卡或边界文档。",
  "",
  "职责：创建项目角色（含编排角色）、维护边界文档、走治理变更流程；",
  "新目录权限、角色归属调整一类改动必须由它更新 Section 1 并经客户确认。",
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
