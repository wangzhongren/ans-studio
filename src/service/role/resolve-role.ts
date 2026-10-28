// Service：双来源角色解析 + 项目角色枚举（供桌面应用）
// 冻结契约 §3：resolveRole(roleId, project): Promise<ResolvedRole>
// 路径取自 project.roles[roleId]（F8）；未在配置中的角色视为内置治理角色。
// listProject 为桌面应用枚举一个项目根下的全部角色，复用本文件与 boundary-core 的解析。
// 归档约定（客户 2026-10-14）：角色边界 YAML 顶层 `archived: true` ⇒ 冻结归档角色——resolveRole
// 拒绝开启（「角色 X 已归档，不可开启」）、listProject 静默跳过（不枚举、不产生任何警告）。
//
// 治理三权分立 V1（客户 2026-10-17 拍板；PM 评审 §5.1/§5.3/§5.4）：
//  - `governanceModel`（缺省 `"single"`，旧行为逐字不变）决定内置角色集与主入口：
//      single → `su`；trio → `chief` / `product` / `rapporteur` / `nominator` / `convener` / `verifier`
//      （此顺序，`primaryRoleId="chief"`；2026-10-28 批次 A「幕僚 + 最小系统」：liaison 退休，
//      只保留编译期只读别名，不进入列表）。
//  - 六人的卡文本/Section 1 来自内置注册表；旧 `su` 迁移后隐藏且不可开启；
//    内置治理 id 是**保留 id**：项目里的同名角色目录被跳过并警告，`roles` 映射不得遮蔽它们。
//  - `listProject` 的模型来源：共享载入器 `readGovernanceModel`（PM 属主，只读消费）；
//    无显式值且项目既无 `.ans/project.json`、也无任何项目角色目录 ⇒ 新空项目按 `trio`。
//  - 旧 trio 项目（`.ans` 已写 `governanceModel:"trio"`）升级后角色列表/主入口变为六角色 + chief：
//    不迁移、不重写 `.ans`/pin/manifest；single/su 逐字不变；旧 liaison 按只读别名可寻址（D 删除）。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type {
  GovernanceFunction,
  GovernanceModel,
  ProjectConfig,
  ResolvedRole,
  RoleKind,
  RoleLocation,
  RoleGroupMetadata,
} from "../../model/role.ts";
import {
  BUILT_IN_GOVERNANCE_ROLE_ID,
  BUILT_IN_ROLE_CARD_TEXT,
  builtInBoundarySection,
  loadBoundaryFile,
  resolveBoundarySection,
} from "../../common/门禁引擎/boundary-core.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceRoleOf,
  isBuiltInGovernanceRoleId,
  trioGovernanceSource,
} from "../../common/门禁引擎/governance-roles.ts";
import { ansProjectPath, readGovernanceModel } from "../../common/shared/config-loader.ts";
import { joinRoot, readTextFile } from "../../common/门禁引擎/io.ts";
import { parseRoleGroupMetadata } from "../../common/门禁引擎/role-card-metadata.ts";
import { readdir, stat } from "node:fs/promises";

export async function resolveRole(roleId: string, project: ProjectConfig): Promise<ResolvedRole> {
  const model = project.governanceModel ?? "single";

  // trio 迁移后 su 归档：隐藏、不可开启、历史只读（客户 2026-10-17 拍板；评审 §二-13/§5.3）。
  // 历史会话/历史记录仍可按 roleId 读取——本拒绝只挡「按 id 解析/开启」的入口。
  if (model === "trio" && roleId === BUILT_IN_GOVERNANCE_ROLE_ID) {
    throw new Error(`角色 ${roleId} 已归档（当前为三权治理模型），不可开启`);
  }

  // 保留 id：三权角色与 su 一律不采用项目 `roles` 映射（防项目角色遮蔽治理角色；评审 §5.4）。
  const reserved = isBuiltInGovernanceRoleId(roleId);
  const loc = !reserved && project.roles ? project.roles[roleId] : undefined;

  // 归档角色 fail-closed 拒绝（客户 2026-10-14 约定）：角色边界文件顶层 `archived: true` ⇒ 该角色为
  // 冻结归档（拆分/退役的角色原位留档），任何按 id 解析/开启入口（CLI `ans role run`、桌面开启会话，
  // 皆经本函数）一律拒绝。探测用**中性读取**（accepted:false、无 pin）：归档判定不依赖接受/pin 状态——
  // pin 失效或治理接受证据缺失时照常先看到归档标记，不给绕过口。调用方（setupRole）会再包一层
  // 「角色/边界解析失败：」前缀，错误主体如实为「角色 X 已归档，不可开启」。
  if (loc && loc.boundary !== "") {
    const probe = await loadBoundaryFile(
      loc.boundary,
      joinRoot(project.projectRoot, loc.boundary),
      project.projectRoot,
      project.skillRoot,
      { accepted: false, source: "" },
    );
    if (probe.archived === true) {
      throw new Error(`角色 ${roleId} 已归档，不可开启`);
    }
  }

  const kind: RoleKind = loc ? "project" : "built-in-governance";
  const spec = governanceRoleOf(roleId);

  let cardText = "";
  let groupMetadata: RoleGroupMetadata = {};
  let location: RoleLocation;
  if (loc) {
    location = loc;
    cardText = await readTextFile(joinRoot(project.projectRoot, loc.card));
    groupMetadata = parseRoleGroupMetadata(cardText);
  } else {
    location = {
      card: "",
      // 三权角色的边界是**内置代码**（注册表条目），不指向项目治理边界文档；
      // su（single）保持既有语义（治理边界文档路径，供展示/诊断）。
      boundary: spec === undefined && project.governanceBoundary ? project.governanceBoundary.path : "",
    };
    // 内置治理角色无角色卡文件——卡文本来自单一来源：su 在 boundary-core，trio 五人在注册表。
    if (roleId === BUILT_IN_GOVERNANCE_ROLE_ID) cardText = BUILT_IN_ROLE_CARD_TEXT;
    else if (spec !== undefined) cardText = spec.cardText;
  }

  const boundary = await resolveBoundarySection(roleId, project);
  return {
    id: roleId,
    kind,
    cardText,
    boundary,
    boundarySource: boundary.boundarySource,
    location,
    ...(spec !== undefined ? { governanceFunction: spec.function } : {}),
    ...groupMetadata,
  };
}

// ---- 项目角色枚举（桌面应用）----

export interface ProjectRoleSummary extends RoleGroupMetadata {
  roleId: string;
  /** 内置治理角色的统一显示名（来自注册表，如 `幕僚`）；项目角色不填（无统一显示名）。 */
  displayName?: string;
  cardPath: string; // 项目相对路径（内置角色为空串：没有角色卡文件）
  boundaryPath: string; // 项目相对路径（内置角色为空串：用内置边界）
  cardText: string; // role-card.md 正文
  boundary: BoundarySection1;
  /** 内置治理角色（无角色目录，由引擎合成；不参与 roles 映射，故解析时下沉为 built-in-governance）。 */
  builtIn?: boolean;
  /** 仅 trio 的内置治理角色携带；旧 `liaison` 只读别名不进入列表；`su` 与项目角色不出现。 */
  governanceFunction?: GovernanceFunction;
}

export interface ProjectListing {
  projectRoot: string;
  roles: ProjectRoleSummary[];
  warnings: string[]; // 仅记真异常：某角色目录缺文件、边界解析失败、角色重复等（空项目是正常态，不报警）
  /** 是否枚举到**项目角色**（`角色卡/`、`role-cards/` 下至少一个可用角色）。
   *  空项目（尚无 bootstrap）为 false——此时 `roles` 只含内置治理角色；
   *  界面据此显示「项目尚未 bootstrap」并引导与主入口角色对话（§10.3）。 */
  hasRoles: boolean;
  /** **主入口角色 id**：single → `su`；trio → `chief`（2026-10-28 批次 A 六角色；liaison 退休）。
   *  由门禁引擎给、**单一来源**；桌面渲染侧据此设主位/默认选中，**不得硬编码角色 id**。 */
  primaryRoleId: string;
  /** 治理模型（评审 §5.4/§5.5）：`listProject` **恒返回**该字段；类型上可选只为让其他角色
   *  在 W3 前构造的测试夹具保持可编译——消费方读取时 `?? "single"` 即旧行为。 */
  governanceModel?: GovernanceModel;
}

/** 治理会话角色解析结果（评审 §5.4 公共出口，`openGovernanceSession`/CLI `ans govern`/测试共用）。 */
export interface ResolvedGovernanceRole {
  roleId: string;
  /** single/su 为 null。 */
  function: GovernanceFunction | null;
  model: GovernanceModel;
}

/**
 * 解析治理会话应开启的角色（评审 §5.4；四角色评审 §4.5）：single → `su`；trio → 按显式
 * `roleId`，否则按 `function`（缺省 `proposal` → rapporteur）。非法组合抛错（明确文案），调用方
 * 不得自行枚举 `builtIn`（避免各自写一份判定）。
 *
 * **缺省职能仍是 `proposal`（共享解析器语义不变）**：CLI `ans govern` 走本出口，而 V1 的 CLI
 * 不提供主入口会话（没有跨会话后台交接能力，半可用的主入口比不提供更危险，四角色评审 §4.6）。
 * 桌面主入口的 `chief` 来自 `listProject().primaryRoleId`，不经本函数的缺省路径。
 * 旧 `liaison` 仍可按显式 roleId 解析（批次 A 只读别名，D 删除）。
 */
export function resolveGovernanceRole(
  listing: ProjectListing,
  opts: { function?: GovernanceFunction; roleId?: string } = {},
): ResolvedGovernanceRole {
  const model = listing.governanceModel ?? "single";
  const explicitId = opts.roleId;
  const explicitFunction = opts.function;

  if (model === "single") {
    if (explicitFunction !== undefined) {
      throw new Error(
        `旧治理模型（single）只有 su，不接受治理职能选择（${explicitFunction}）；请升级为三权模型后再用`,
      );
    }
    if (explicitId !== undefined && explicitId !== BUILT_IN_GOVERNANCE_ROLE_ID) {
      throw new Error(`旧治理模型（single）只能开启 ${BUILT_IN_GOVERNANCE_ROLE_ID}，角色 ${explicitId} 不可用`);
    }
    return { roleId: BUILT_IN_GOVERNANCE_ROLE_ID, function: null, model };
  }

  // trio
  const trioRoleList = BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id).join("/");
  if (explicitId !== undefined) {
    if (explicitId === BUILT_IN_GOVERNANCE_ROLE_ID) {
      throw new Error(
        `su 已归档（当前为三权治理模型），不可开启；请选择 ${trioRoleList}`,
      );
    }
    const spec = governanceRoleOf(explicitId);
    if (spec === undefined) {
      throw new Error(
        `三权治理模型下角色 ${explicitId} 不是内置治理角色；可用：${trioRoleList}`,
      );
    }
    if (explicitFunction !== undefined && explicitFunction !== spec.function) {
      throw new Error(
        `角色 ${explicitId} 的治理职能是 ${spec.function}，与请求的 ${explicitFunction} 不一致`,
      );
    }
    return { roleId: spec.id, function: spec.function, model };
  }

  const fn: GovernanceFunction = explicitFunction ?? "proposal";
  const spec = BUILT_IN_GOVERNANCE_ROLES.find((s) => s.function === fn);
  if (spec === undefined) {
    throw new Error(`未知治理职能：${fn}（可用：${BUILT_IN_GOVERNANCE_ROLES.map((s) => s.function).join("/")}）`);
  }
  return { roleId: spec.id, function: spec.function, model };
}

const ROLE_DIR_NAMES = ["角色卡", "role-cards"]; // 中文 / 英文项目角色目录名
const CARD_NAMES = ["role-card.md"];
const BOUNDARY_NAMES = ["boundary.yaml", "boundary.yml", "boundary.md"];
/** B 批任务主干路径（与编排 `TASKS_STATE_REL` 同一约定；门禁引擎不反向依赖编排，故本地声明）。 */
const TASKS_STATE_REL = ".ans/state/tasks.jsonl";

async function statKind(p: string): Promise<"dir" | "file" | "other" | "none"> {
  try {
    const s = await stat(p);
    if (s.isDirectory()) return "dir";
    if (s.isFile()) return "file";
    return "other";
  } catch {
    return "none";
  }
}

async function firstExistingFile(dirAbs: string, names: string[]): Promise<string | null> {
  for (const n of names) {
    if ((await statKind(joinRoot(dirAbs, n))) === "file") return n;
  }
  return null;
}

/**
 * 枚举一个项目根下的全部角色。
 * - 复用 resolveRole/boundary-core 的解析，界面侧不得另写一份判定；
 * - 单个角色目录的问题（缺 role-card.md / boundary.yaml、边界解析失败）→ 记入 warnings，不抛出；
 *   边界**文件存在但 Section 1 解析出 0 条**（如散文式 Markdown `boundary.md`）经 `loadBoundaryFile`
 *   记为 parseError 并落到下方 warning（客户 2026-10-12 裁定 A：响亮失败，不再静默空集）；
 * - **无角色目录**（尚无 `角色卡/`、`role-cards/`）→ **不抛错、不报警**（§10.2）：这是「项目尚未
 *   bootstrap」的**正常初始态**；但内置角色集按治理模型决定（见下），warnings 为空；
 * - **归档目录**（边界顶层 `archived: true`，客户 2026-10-14 约定）→ **静默跳过**：不枚举、不产生
 *   任何警告（归档对枚举不可见，替代「缺少 boundary.yaml」类告警路径；禁止改名绕过——归档角色用
 *   原名 boundary.yaml + 该标记留档；resolveRole 对同一标记 fail-closed 拒绝开启）；
 * - **保留 id**（客户 2026-10-17 拍板的 trio V1，评审 §5.4；2026-10-28 批次 A 六角色）：
 *   `su`/`chief`/`product`/`rapporteur`/`nominator`/`convener`/`verifier`（旧 `liaison` 仍按 retired
 *   内置 id 保留，避免项目目录遮蔽与历史冲突）是内置治理角色 id；项目里的同名目录
 *   **跳过并警告**（「与内置治理角色 id 冲突，已跳过」），绝不枚举为项目角色、不遮蔽内置角色；
 * - **项目级真错误**（项目根不存在/不是目录、角色目录路径是文件、无读权限）→ 抛出明确错误。
 * - listProject 无接受证据入参，故所列 boundary 的 acceptance 一律为未接受（仅用于展示）。
 * - **治理模型**（评审 §5.4/§5.5）：显式 `readGovernanceModel` 优先；`.ans` 不可读/不可解析 →
 *   single（行为不变）；无显式值且既无 `.ans/project.json` 也无任何角色目录 → 新空项目 trio；
 *   其余（旧项目）→ single，**但 `.ans/state/tasks.jsonl` 存在 ⇒ trio**。任务主干是确定事实
 *   （B 批星形任务只在 trio 流程中产生，single 不建任务状态文件），用于封住「首个项目角色已落盘但
 *   `.ans` 尚未写出」的模型翻转窗口（真机缺陷 2026-10-18：Nominator 写出 builder 后 Convener 的
 *   `dispatch_task` 被误判为 single→su 而拒绝，左树/主入口短暂回退）。任务状态只 stat 文件、不读内容；
 *   不存在/不可读 ⇒ 按旧规则。不按 `docs/proposals|nominations|flows` 等产物猜模型。
 * - 结果含 `primaryRoleId` 与 `governanceModel`：桌面据此设主入口/模型提示，**渲染侧不硬编码 id**。
 */
export async function listProject(projectRoot: string): Promise<ProjectListing> {
  const projAbs = projectRoot;

  // 项目根：存在性、类型、可读性
  const rootKind = await statKind(projAbs);
  if (rootKind === "none") {
    throw new Error(`项目根不存在或不可访问：${projectRoot}`);
  }
  if (rootKind !== "dir") {
    throw new Error(`项目根不是目录：${projectRoot}`);
  }

  // 角色目录（中文 角色卡/ 与英文 role-cards/ 都认）
  const foundRoots: { name: string; abs: string }[] = [];
  for (const name of ROLE_DIR_NAMES) {
    const abs = joinRoot(projAbs, name);
    const kind = await statKind(abs);
    if (kind === "dir") foundRoots.push({ name, abs });
    else if (kind !== "none") throw new Error(`角色目录路径存在但不是目录：${name}`);
  }

  const warnings: string[] = [];
  // 无角色目录**是正常状态**（§10.2）：这是「项目尚未 bootstrap」的初始态，客户为「空文件夹 →
  // 与内置治理角色对话 → 建角色」专门设计了整套流程，故**既不抛错、也不报警**——hasRoles:false 与界面
  // 「项目尚未 bootstrap」提示已把它说清楚，再画一条红字反而是噪声。warnings 只留给真异常
  // （缺 role-card.md / boundary.yaml、边界解析失败、角色重复、保留 id 冲突）；仅「项目根不存在 /
  // 不是目录」（上面已判）才是真错误。

  const projectRoles: ProjectRoleSummary[] = [];
  const seen = new Set<string>();
  // 归档计数（客户 2026-10-14 约定）：全部子目录均为归档静默跳过时，**不补**「未枚举到有效角色」汇总
  // （归档对枚举不可见：不产生任何警告）；只要存在活目录（无论成败），汇总照发——与归档机制引入前一致。
  let totalRoleDirs = 0;
  let archivedSkips = 0;

  for (const root of foundRoots) {
    let dirents;
    try {
      dirents = await readdir(root.abs, { withFileTypes: true });
    } catch (err) {
      throw new Error(`无法读取角色目录：${root.name}（${(err as Error).message}）`);
    }
    const roleIds = dirents
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

    for (const roleId of roleIds) {
      totalRoleDirs += 1;
      const relDir = `${root.name}/${roleId}`;

      // 保留 id（评审 §5.4）：内置治理角色 id 不得被项目角色目录遮蔽。跳过并警告——
      // 警告文案是跨角色可断言契约的一部分（不静默丢弃）。`liaison` 是批次 D 退休的旧内置 id：
      // 不再是内置角色/别名，但其历史目录仍按保留 id 跳过，避免旧目录被误枚举为项目角色。
      if (isBuiltInGovernanceRoleId(roleId) || roleId === "liaison") {
        warnings.push(`${relDir}：与内置治理角色 id 冲突，已跳过`);
        continue;
      }
      if (seen.has(roleId)) {
        warnings.push(`${root.name}/${roleId}：角色重复，已在其它角色目录优先采用，跳过`);
        continue;
      }

      // 归档探测（客户 2026-10-14 约定）：「角色目录的边界解析出 archived: true」⇒ 该目录为**冻结归档**，
      // **静默跳过**——不枚举、不产生任何警告（替代「缺少 boundary.yaml / 解析失败」等逐条告警路径）。
      // 探测先于 role-card 检查：归档目录即便缺 role-card.md 也不告警（归档=对枚举不可见）。
      // 边界为中性读取（accepted:false、无 pin）：归档判定不依赖接受/pin 状态。
      const boundaryName = await firstExistingFile(joinRoot(projAbs, relDir), BOUNDARY_NAMES);
      let boundary: BoundarySection1 | undefined;
      if (boundaryName !== null) {
        const boundaryPath = `${relDir}/${boundaryName}`;
        boundary = await loadBoundaryFile(boundaryPath, joinRoot(projAbs, boundaryPath), projAbs, projAbs, {
          accepted: false,
          source: "",
        });
        if (boundary.archived === true) {
          archivedSkips += 1;
          continue;
        }
      }

      const cardName = await firstExistingFile(joinRoot(projAbs, relDir), CARD_NAMES);
      if (!cardName) {
        warnings.push(`${relDir}：缺少 role-card.md，已跳过`);
        continue;
      }
      if (boundaryName === null || boundary === undefined) {
        warnings.push(`${relDir}：缺少 boundary.yaml，已跳过`);
        continue;
      }

      const cardPath = `${relDir}/${cardName}`;
      const boundaryPath = `${relDir}/${boundaryName}`;

      let cardText: string;
      try {
        cardText = await readTextFile(joinRoot(projAbs, cardPath));
      } catch (err) {
        warnings.push(`${relDir}：读取 role-card.md 失败（${(err as Error).message}），已跳过`);
        continue;
      }

      // 边界解析失败（复用上方探测时的解析结果，与 resolveRole 同源）
      if (boundary.parseError) {
        warnings.push(`${relDir}：边界解析失败：${boundary.parseError}，已跳过`);
        continue;
      }

      seen.add(roleId);
      projectRoles.push({ roleId, cardPath, boundaryPath, cardText, boundary, ...parseRoleGroupMetadata(cardText) });
    }
  }

  projectRoles.sort((a, b) => a.roleId.localeCompare(b.roleId, "zh-Hans-CN"));

  // 治理模型（评审 §5.4）：显式值优先；`.ans` 不可读 → single；无显式值且**既无 `.ans/project.json`
  // 也无任何角色目录** → 新空项目 trio；其余旧项目 single（不按产物目录猜模型）。
  const read = await readGovernanceModel(projAbs);
  let governanceModel: GovernanceModel;
  if (read.state === "explicit") {
    governanceModel = read.model;
  } else if (read.state === "unreadable") {
    governanceModel = "single";
  } else {
    const ansRecordExists = (await statKind(ansProjectPath(projAbs))) === "file";
    if (!ansRecordExists && totalRoleDirs === 0) {
      governanceModel = "trio";
    } else {
      // 确定事实：B 批星形任务只在 trio 流程中产生（single 不建任务状态）。用于封住
      // 「首个项目角色已落盘但 `.ans` 尚未写出」的模型翻转窗口（真机缺陷 2026-10-18：builder
      // 落盘后本行曾翻成 single，Convener 派发被误判为「来源角色不是派发主人 su」而拒绝）。
      // 只 stat 文件、不读内容；不存在/不可读（含路径不是文件）⇒ 按旧规则 single。
      const tasksExist = (await statKind(joinRoot(projAbs, TASKS_STATE_REL))) === "file";
      governanceModel = tasksExist ? "trio" : "single";
    }
  }

  // 内置角色前置（顺序即枚举顺序；评审 §5.4；2026-10-28 批次 A 六角色）：
  //  single → su（既有行为逐字不变）；trio → chief / product / rapporteur / nominator / convener / verifier
  //  （chief 首位 = 默认主入口；旧 liaison 不枚举，仅按只读别名可寻址，D 删除）。
  const builtIns: ProjectRoleSummary[] =
    governanceModel === "trio"
      ? BUILT_IN_GOVERNANCE_ROLES.map((spec) => ({
          roleId: spec.id,
          displayName: spec.displayName,
          cardPath: "",
          boundaryPath: "",
          cardText: spec.cardText,
          // 展示用边界（未接受；实际写权由 resolveBoundarySection 按项目接受证据解析）。
          boundary: {
            entries: spec.entries.map((e) => ({ ...e })),
            boundarySource: trioGovernanceSource(spec.id),
            acceptance: { accepted: false, source: "" },
          },
          builtIn: true,
          governanceFunction: spec.function,
        }))
      : [
          {
            roleId: BUILT_IN_GOVERNANCE_ROLE_ID,
            cardPath: "",
            boundaryPath: "",
            cardText: BUILT_IN_ROLE_CARD_TEXT,
            boundary: builtInBoundarySection(),
            builtIn: true,
          },
        ];

  const roles: ProjectRoleSummary[] = [...builtIns, ...projectRoles];
  const primaryRoleId = governanceModel === "trio" ? "chief" : BUILT_IN_GOVERNANCE_ROLE_ID;

  // hasRoles：是否枚举到**项目角色**（非内置）。内置角色恒在 roles 里，故不能只看 roles.length。
  const hasRoles = projectRoles.length > 0;
  // 有角色目录但一个有效角色都没枚举到（全都缺文件/解析失败）→ 仍补一条汇总提示：**有目录却无
  // 有效角色**是真异常（每个失败角色的具体原因已在上面逐条记入 warnings）。注意这与「无角色目录」
  // 不同——后者是「尚未 bootstrap」的正常初始态、不再报警（见函数首部注释）。
  // 例外（客户 2026-10-14 归档约定）：若目录下的子目录**全部**为归档静默跳过，归档对枚举不可见——
  // 不补本汇总（归档不产生任何警告）；只要存在活目录（无论成败），汇总照发，行为与归档机制引入前一致。
  const allDirsArchived = totalRoleDirs > 0 && archivedSkips === totalRoleDirs;
  if (!hasRoles && foundRoots.length > 0 && !allDirsArchived) {
    const builtInIds = builtIns.map((r) => r.roleId).join("/");
    warnings.push(
      `项目根下未枚举到有效角色；仅内置治理角色 ${builtInIds} 可用（可发起 bootstrap）`,
    );
  }

  return { projectRoot, roles, warnings, hasRoles, primaryRoleId, governanceModel };
}
