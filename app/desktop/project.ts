// app/desktop/project.ts
// 桌面应用的「项目/角色」装配辅助（纯逻辑，不依赖 electron，可在 node 下单测）。
//
// 职责：
//  - 由门禁引擎的 listProject 结果构造会话所需的 ProjectConfig（角色清单来自枚举，不另写解析）；
//  - 读取某角色的变更记录与 docs 目录索引（展示用，非边界判定）。
//
// 边界纪律：本文件**不**做任何"路径能不能写"的判断——那永远是门禁引擎 resolveWrite 的事。

import path from "node:path";
import { lstat, readdir, readFile, stat } from "node:fs/promises";

import type { Acceptance, PinEntry, PinEvidenceFile, PinEvidenceResult } from "../../src/model/boundary.ts";
import type { ProjectConfig, RoleLocation } from "../../src/model/role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { ROLE_ROOT_DOC_FILENAMES, type RoleRootDocName } from "../../src/model/project-document.ts";
// 只读 pin 证据检查：**唯一实现**在门禁引擎私有 `src/common/门禁引擎/pin-evidence.ts`，跨角色只可经
// Service 公开出口 `src/service/boundary/resolve-boundary.ts` 消费（PM 评审 §5.1/§7）。
import { inspectPinnedBoundaries } from "../../src/service/boundary/resolve-boundary.ts";
// 共享载入器**只读导入的类型**（值不在此导入——载入器的**唯一实现**在 `src/common/shared/config-loader.ts`）。
import type { LoadConfigOptions, LoadedConfig } from "../../src/common/shared/config-loader.ts";
// 跨角色共享运行时原语（**单一来源**，pm 属主 `src/common/shared/`）：仅取 `resolveSkillRoot`。
import { resolveSkillRoot } from "../../src/common/shared/runtime-shared.ts";
// 跨角色共享路径原语（**单一来源**，pm 属主 `src/common/shared/`）：仅取 `toPosix`/词法校验原语。
import { isAbsoluteAny, normalizeLexical, toPosix } from "../../src/common/shared/path-primitives.ts";
// 共享诊断 logger（**单一来源**，pm 属主 `src/common/shared/`）：未配置时为空操作；只记元数据。
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import { mainT } from "./i18n.ts";

const docsDiagnostic = createDiagnosticLogger({ component: "desktop.project" });

/**
 * 技能根解析：优先 ANS_SKILL_ROOT，否则默认技能目录 `~/.claude/skills/ans-governed-construction`。
 *
 * T22：**单一来源**已就位（pm 的 `src/common/shared/runtime-shared.ts`）。此处**删去本地逐字副本**、
 * 改从共享模块**只读导入**并**原样转出**——公开面 `resolveSkillRoot` 不变、行为逐字不变（配置取值，非判定逻辑）。
 */
export { resolveSkillRoot };

/**
 * 将路径统一为正斜杠形式（项目内相对路径一律用 /）。
 *
 * T22（补）：**单一来源**为 pm 的 `src/common/shared/path-primitives.ts`。此处**删去本地逐字副本**
 * （原 `p.replace(/\\/g, "/")`）、改从共享模块**只读导入**并**原样转出**——公开面 `toPosix` 不变、
 * 行为逐字不变（纯词法原语，非判定逻辑）。本模块内 `posixDirname` 的调用点不变。
 */
export { toPosix };

/** 某个项目相对路径的 POSIX 目录名。 */
export function posixDirname(rel: string): string {
  const q = toPosix(rel);
  const idx = q.lastIndexOf("/");
  return idx < 0 ? "" : q.slice(0, idx);
}

/**
 * 由 listProject 的枚举结果构造 ProjectConfig。
 *
 * acceptance 由调用方（界面确认流程）提供：
 *  - accepted=true 时，resolveBoundarySection 会采用该角色自己的项目边界文件（loc.boundary）；
 *  - accepted=false 时（含缺来源），门禁引擎 fail-closed，拒绝一切写入——与 CLI 同一条路径，不更松。
 *
 * acceptance 的来源之一是**桌面运行期同意**——设计 §3.3「终态规则」**登记的两个非-pin 例外之一**
 * （另一个是 CLI 演示内嵌 `DEMO_ACCEPTANCE`，归装配）。该来源**没有 pin，且不该有**：pin 的语义是对
 * **预先钉住的产物**做篡改检测，而桌面是**运行期实时人授权**（客户已定「导入项目 = 授权、无弹窗」）——
 * 授权由人在导入这一刻当场作出，没有可预先钉住的固定产物；硬加 hash 是**假证据**（既不表达「谁在何时
 * 授权了什么」，也检测不到任何篡改）。故它是**结构上不同于 pin 的授权来源**，不是「漏写 pin」。
 * （具体构造见 `app/desktop/session.ts`，经参数传入本函数。）
 *
 * governanceBoundary.path：**采纳载入器给出的项目治理边界路径**（见 `buildEffectiveProjectConfig`）——
 * 非空时 `resolveBoundarySection` 走「**治理边界覆盖**」分支，**内置治理角色（su）**改由项目的治理边界文档治理
 * （`已 bootstrap 的项目里 su 按项目治理边界工作`）；**无 `.ans` / 无治理边界路径时传空串**，走原有回退
 * （`src/**` 拒绝判定不受影响）。
 *
 * builtInRoles：由枚举结果里 builtIn===true 的角色 id 填充，供**会话式入口**（openRoleSession / 桌面聊天）
 * 开启内置治理角色。这些角色无角色目录、不进 roles 映射；缺省为空集——不额外允许任何内置角色。
 *
 * genesisBootstrap（设计 §10.1 / §12.2，任务 T30）：**未 bootstrap 的项目**（`hasRoles === false`）时
 * 显式设置，把「**操作者导入空文件夹并开启内置治理角色对话**」这一授权事实交给门禁引擎——见下方注释。
 */
export function buildProjectConfig(
  listing: ProjectListing,
  acceptance: Acceptance,
  env: Record<string, string | undefined> = process.env,
  governanceBoundaryPath: string = "",
): ProjectConfig {
  const roles: Record<string, RoleLocation> = {};
  const builtInRoles: string[] = [];
  for (const r of listing.roles) {
    // 内置治理角色（su）没有角色目录；不进 roles 映射——门禁引擎据此把它下沉为 built-in-governance，
    // 并回退到内置边界。若强行登记，resolveRole 会去读一个空路径的角色卡而报错。
    if (r.builtIn) {
      // 但登记进 builtInRoles：本配置允许**会话式入口**（openRoleSession / 桌面聊天）开启它。
      // 数据直接来自门禁引擎的枚举结果（builtIn===true），桌面应用不自行发明角色 id。
      builtInRoles.push(r.roleId);
      continue;
    }
    roles[r.roleId] = { card: r.cardPath, boundary: r.boundaryPath };
  }
  // ——— 冷启动「有界创世例外」的触发（设计 §10.1 / §12.2，任务 T30）———
  //
  // 未 bootstrap 的项目（`hasRoles === false`：尚无任何**项目角色**）上，「**操作者导入空文件夹并开启
  // 内置治理角色对话**」这一刻本身，就是一次**操作者发起的 bootstrap**——故此处**显式**设 `genesisBootstrap`，
  // 把该授权来源如实交给门禁引擎：`resolveBoundarySection` 据此对**内置治理角色**返回「**项目根**」治理
  // 种子边界（**普通目录** `角色卡/`、`docs/`、`.ans/`；`scope: undefined` 下命中即放行，**无需 scope/slug**），
  // acceptance = 下面的 `source`。
  //
  // **这不是 blanket**：种子条目**仅此三处治理产物**（**不含 `src/`、不含项目内任意文件**），且**仅在
  // `!hasRoles` 时设**——「有界性不变」的实质在门禁引擎 `governance-seed.ts`，此处只负责**何时**设。
  //
  // **切换条件（§12.2，双保险之一）**：项目**一有角色**（`hasRoles === true`）就**不再设**本字段——su 随即
  // 改由**项目边界**治理（`resolveBoundarySection` 的**项目覆盖**分支），回到普通聊天。**另一重保险是门禁
  // 引擎的结构性自终止**：项目自己的治理边界文档一经写出并被接受（`governanceBoundary.path` 非空），
  // **项目覆盖分支先于创世分支求值**，创世授权随之失效——**即便本字段残留也不再生效**（不依赖调用方清除它）。
  //
  // `source` 如实记录该授权来源（供 F6 与审计）——**用枚举给出的 `primaryRoleId`，不硬编码 "su"**
  // （本项目既有纪律：入口/角色以数据表达）。
  const genesisBootstrap =
    listing.hasRoles === false
      ? {
          source: `desktop-app:操作者导入空文件夹并开启 ${listing.primaryRoleId} 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）`,
        }
      : undefined;

  return {
    projectRoot: listing.projectRoot,
    skillRoot: resolveSkillRoot(env),
    roles,
    builtInRoles,
    // 治理模型（评审 §5.4）：门禁引擎枚举给出（single/trio）；缺省按 single（旧行为逐字不变）。
    // 会话/边界解析按它决定内置角色集与能力——**不得**让 `resolveBoundarySection` 掉回默认 single。
    governanceModel: listing.governanceModel ?? "single",
    governanceBoundary: { path: governanceBoundaryPath, acceptance },
    // 仅在未 bootstrap 时附带（有角色即不带——见上方切换条件注释）。
    ...(genesisBootstrap ? { genesisBootstrap } : {}),
  };
}

/**
 * 桌面「导入即授权」的**运行期同意**（设计 §3.3「终态规则」**明确登记的两个非-pin 例外之一**——
 * 另一个是 CLI 演示内嵌 `DEMO_ACCEPTANCE`，归装配）。它**没有、也不该有 pin**：
 *  - pin 的语义是对**预先钉住的产物**做**篡改检测**；
 *  - 桌面的信任模型是**运行期实时的人授权**：客户已定「导入项目 = 授权、无弹窗」，授权由**人**在导入
 *    这一刻当场作出，不存在「先于授权而存在的固定产物」可供比对；
 *  - 给一个当场作出的授权硬加 hash 是**假证据**（既不表达「谁在何时授权了什么」，也检测不到篡改）。
 * 故它是**结构上不同于 pin 的授权来源**，不是「漏写 pin」。
 */
export const DESKTOP_RUNTIME_CONSENT: Acceptance = {
  accepted: true,
  source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）",
};

export interface EffectiveProjectConfigDeps {
  /** 构造 ProjectConfig（**真实实现** `buildProjectConfig`；注入以便单测）。 */
  buildProjectConfig: (
    listing: ProjectListing,
    acceptance: Acceptance,
    env?: Record<string, string | undefined>,
    governanceBoundaryPath?: string,
  ) => ProjectConfig;
  /** 载入有效配置（`.ans` 优先）——**共享载入器**（`src/common/shared/config-loader.ts`，只读导入、不复制）。 */
  loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
}

/**
 * 桌面**授权链的唯一实现**（会话开会话与界面只读判定**共用同一份**，杜绝两处漂移）：
 *
 *  1. `fallback` = **运行期同意**（无 `.ans` 时，载入器原样返回它——既有「导入即授权」行为不放松）；
 *  2. **共享载入器**（`.ans` 优先）：有可用 `.ans` → 用其 **pin-backed acceptance**；无 → fallback；
 *     有但不可用 → fail-closed 未接受（**不回退**运行期同意）；
 *  3. **采纳载入器给出的项目治理边界路径**（`loaded.project.governanceBoundary.path`）并传给
 *     `buildProjectConfig`（→ `ProjectConfig.governanceBoundary.path`）。
 *
 * ⚠️ 第 3 步是**此前缺失的一环**：桌面曾**丢弃**该路径（恒空串）⇒ `resolveBoundarySection` 的
 * 「**治理边界覆盖**」分支被跳过 ⇒ **已 bootstrap 项目里的内置治理角色（su）掉回内置未接受、拒一切写**，
 * 且界面据此**误标「只读」**——bootstrap 建出的治理结构在桌面上成了空的。本函数即该缺口的修复：
 * 治理边界路径**如实取自** `.ans`（`src/model/role.ts` 注释早已写明的前提「`governanceBoundary.path` 非空
 * ⇒ 项目覆盖接管、创世自终止」，此前从未被满足）。
 */
export async function buildEffectiveProjectConfig(
  listing: ProjectListing,
  deps: EffectiveProjectConfigDeps,
): Promise<{ project: ProjectConfig; source: LoadedConfig["source"] }> {
  const fallback = deps.buildProjectConfig(listing, DESKTOP_RUNTIME_CONSENT);
  const loaded = await deps.loadEffectiveConfig({
    projectRoot: listing.projectRoot,
    skillRoot: fallback.skillRoot,
    fallback,
  });
  const governanceBoundaryPath = loaded.project.governanceBoundary?.path ?? "";
  const project = deps.buildProjectConfig(listing, loaded.source.acceptance, undefined, governanceBoundaryPath);
  // 治理模型（评审 §5.4）：载入器显式给出（`.ans` 的 governanceModel）时以它为准；缺失才回退枚举推断
  // （listing.governanceModel——`buildProjectConfig` 已写入）。否则 `resolveBoundarySection` 会按默认
  // single 解析，三权角色全部不可写。
  const governanceModel = loaded.project.governanceModel ?? listing.governanceModel;
  return {
    project: governanceModel !== undefined ? { ...project, governanceModel } : project,
    source: loaded.source,
  };
}

// —————————————————————— 治理记录状态（I1，PM 评审 §四.1）——————————————————————
//
// **事实来源**：共享载入器 `loadEffectiveConfig` 经 `buildEffectiveProjectConfig` 返回的
// `source.kind` / `source.acceptance.accepted` / `source.downgradeReason`，以及采纳后的
// `project.governanceBoundary.path`。本函数**只做纯派生**——不读文件、不校验 pin 逐文件哈希、
// 不写任何东西（`listProject` 的只读约束由调用方承担）。pin 逐文件证据由同文件的
// `deriveGovernanceRecordWithPins` 在本函数结果之上合入（状态新增 `pin-mismatch`）。
//
// V1 契约（PM 评审 §四.1 表；pin 证据见 `2026-10-17_design_governance-pin-recovery-review` §5.3）：
//  - present：`kind === "ans"` 且 `accepted === true` 且治理边界路径 trim 后非空。
//    本函数**不声明 pin 逐文件匹配**——逐文件证据合入后，不符会改判 `pin-mismatch`。
//  - missing：`kind === "builtin-fallback"`（无 `.ans/project.json`）。即便 fallback 的
//    acceptance 是运行期同意（accepted:true），也仍是 missing——治理记录是否存在与写入授权是两件事。
//  - invalid：`ans-invalid`，或 `ans` 但 accepted 不为 true，或治理边界路径为空。
//    `reason` 只取载入器 `downgradeReason`，缺失时给等价原因（不猜测、不补写）。

export type GovernanceRecordState = "present" | "missing" | "invalid" | "pin-mismatch";

export interface GovernanceRecordStatus {
  state: GovernanceRecordState;
  /** 仅 state === "invalid" 时给出：载入器降级/不可解析原因原文（不含凭据）。 */
  reason?: string;
  /** 仅 pin-mismatch：不一致条目（来自 PinEvidenceResult.files，按 pin 原顺序）。 */
  pinFiles?: PinEvidenceFile[];
  /** 仅 pin-mismatch：pin 总条数（含一致项）。 */
  pinCount?: number;
}

/** `ans-invalid` 且载入器未给降级原因时的等价原因（载入器实际恒给，纯函数仍显式兜底）。 */
function governanceInvalidReason(): string {
  return mainT("main.project.governanceInvalid");
}
/** `ans` 且 accepted 不为 true、载入器未给降级原因时的等价原因。 */
function governanceUnacceptedReason(): string {
  return mainT("main.project.governanceUnaccepted");
}
/** `ans` 且 accepted 但治理边界路径为空时的等价原因。 */
function governancePathEmptyReason(): string {
  return mainT("main.project.governancePathEmpty");
}

/**
 * 由载入器结果事实派生 `governanceRecord` 状态（纯函数，便于单测）。
 *
 * @param input.source 载入器 `source`（只取 kind/acceptance/downgradeReason 三项事实）
 * @param input.governanceBoundaryPath `project.governanceBoundary?.path`（缺省按空串处理）
 */
export function deriveGovernanceRecord(input: {
  source: Pick<LoadedConfig["source"], "kind" | "acceptance" | "downgradeReason">;
  governanceBoundaryPath?: string;
}): GovernanceRecordStatus {
  const { source } = input;
  const governanceBoundaryPath = input.governanceBoundaryPath ?? "";

  // 无 `.ans/project.json`：missing（不看 fallback acceptance——运行期同意不是治理记录）。
  if (source.kind === "builtin-fallback") {
    return { state: "missing" };
  }

  // `.ans` 存在但不可解析/不可用：invalid，原因如实取载入器降级文本。
  if (source.kind === "ans-invalid") {
    return { state: "invalid", reason: source.downgradeReason ?? governanceInvalidReason() };
  }

  // kind === "ans"：记录在盘上，但结构可用性还要看 accepted 与治理边界路径。
  if (source.acceptance.accepted !== true) {
    return { state: "invalid", reason: source.downgradeReason ?? governanceUnacceptedReason() };
  }
  if (governanceBoundaryPath.trim() === "") {
    return { state: "invalid", reason: governancePathEmptyReason() };
  }
  return { state: "present" };
}

// —————————————————————— pin 证据合入（C1，PM 评审 §5.3）——————————————————————
//
// 纯映射：把门禁引擎只读 pin 证据合入 `deriveGovernanceRecord` 的派生结果。
//  · 仅 `present` 会被改判——`missing`/`invalid` 的既有形状与文案逐字不变；
//  · `ok` → 原样返回 `present`（**不新增字段**，保持既有测试与消费方形状）；
//  · `mismatch` → `pin-mismatch` + 逐文件明细 + pin 总条数；
//  · `invalid` → `invalid` + 原因（证据检查本身失败同样归 invalid，fail-closed）。
// 本函数不读盘、不写盘，便于单测。
export function applyPinEvidence(
  record: GovernanceRecordStatus,
  evidence: PinEvidenceResult,
): GovernanceRecordStatus {
  if (record.state !== "present") return record;
  if (evidence.state === "invalid") {
    return { state: "invalid", reason: evidence.reason ?? mainT("main.project.pinCheckFailed") };
  }
  if (evidence.state === "mismatch") {
    return { state: "pin-mismatch", pinFiles: evidence.files, pinCount: evidence.checked };
  }
  return record;
}

/**
 * 只读派生：在 `deriveGovernanceRecord` 之后，对 `present` 记录逐条检查 pin 与盘上文件哈希。
 *
 *  · `record.state !== "present"` → **原样返回，不做任何哈希**（missing/invalid 行为逐字不变）；
 *  · `pins` 缺失/空 → `invalid` +「治理记录未提供可验证 pin」（fail-closed；载入器正常已降级）；
 *  · 其它情况交给门禁引擎 `inspectPinnedBoundaries`（**唯一哈希来源**），由 `applyPinEvidence` 映射；
 *  · **永不抛错**：任何意外异常都归为 `invalid` +「pin 证据检查失败：<message>」——调用方
 *    （`listProject`）不得因 pin 检查失败而崩。
 *
 * `governanceBoundaryPath` 非空时作为 `requiredPath` 传给证据检查：治理边界文件必须被至少一条 pin
 * 覆盖，否则即便其余 pin 全一致，su 仍不可用（§5.1 覆盖规则）。
 */
export async function deriveGovernanceRecordWithPins(input: {
  projectRoot: string;
  record: GovernanceRecordStatus;
  pins: PinEntry[] | undefined;
  governanceBoundaryPath?: string;
  inspectPinnedBoundariesFn?: typeof inspectPinnedBoundaries;
}): Promise<GovernanceRecordStatus> {
  if (input.record.state !== "present") return input.record;
  try {
    if (!Array.isArray(input.pins) || input.pins.length === 0) {
      return { state: "invalid", reason: mainT("main.project.pinMissing") };
    }
    const inspect = input.inspectPinnedBoundariesFn ?? inspectPinnedBoundaries;
    const governanceBoundaryPath = input.governanceBoundaryPath ?? "";
    const evidence = await inspect({
      projectRoot: input.projectRoot,
      pins: input.pins,
      ...(governanceBoundaryPath.trim() !== "" ? { requiredPath: governanceBoundaryPath } : {}),
    });
    return applyPinEvidence(input.record, evidence);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: "invalid", reason: mainT("main.interface.pinCheckFailed", { detail: message }) };
  }
}

// —————————————————————— 文档/变更记录索引（展示用）————————————————————
export interface DocsIndexEntry {
  path: string; // 相对角色目录，如 docs/design/x.md
  kind: "file" | "directory";
}

/** 角色根目录下的白名单文档条目（仅元数据；正文只经受限文档 Service/Provider 读取）。 */
export interface RoleRootDocEntry {
  /** 规范文件名，来自 Model 唯一白名单 `ROLE_ROOT_DOC_FILENAMES`。 */
  name: RoleRootDocName;
  /** 项目相对路径（如 `角色卡/编排/feature-map.md`），用于与 opaque ref.relativePath 精确匹配。 */
  path: string;
  kind: "file";
}

export interface RoleDocsIndex {
  /** 变更记录：changelog.md 是否存在及正文（不存在为 null）。 */
  changelog: { path: string; text: string } | null;
  /** docs/ 目录索引（相对角色目录的路径 + 类型）。 */
  docs: DocsIndexEntry[];
  /** 角色根文档：固定白名单顺序，仅实际存在的直接普通文件；永不包含 memo.md。 */
  rootDocs: RoleRootDocEntry[];
}

const MAX_DOC_ENTRIES = 500;

/** 递归列目录（相对路径，正斜杠），跳过隐藏文件；有界以防异常目录结构。 */
async function walkDir(absDir: string, relPrefix: string, out: DocsIndexEntry[]): Promise<void> {
  if (out.length >= MAX_DOC_ENTRIES) return;
  let dirents;
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  dirents.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  for (const d of dirents) {
    if (out.length >= MAX_DOC_ENTRIES) return;
    if (d.name.startsWith(".")) continue;
    const rel = relPrefix ? `${relPrefix}/${d.name}` : d.name;
    if (d.isDirectory()) {
      out.push({ path: rel, kind: "directory" });
      await walkDir(path.join(absDir, d.name), rel, out);
    } else if (d.isFile()) {
      out.push({ path: rel, kind: "file" });
    }
  }
}

/**
 * 读取某角色的变更记录、docs/ 目录索引与角色根文档元数据。
 * 输入 cardPathRel 为角色卡项目相对路径（如 角色卡/编排/role-card.md）；角色目录取其父目录。
 *
 * 根文档只按 Model 白名单逐个 `lstat` 三个精确文件名，不扫描角色根目录、不读取正文、不触碰 memo.md；
 * 角色目录非法/非目录/符号链接时返回空索引。`docs/` 与 `changelog` 的既有读取逻辑保持不变。
 */
export async function readRoleDocsIndex(
  projectRoot: string,
  cardPathRel: string,
): Promise<RoleDocsIndex> {
  const empty = (): RoleDocsIndex => ({ changelog: null, docs: [], rootDocs: [] });
  const roleDirRel = posixDirname(cardPathRel);
  // 与 Service/设计 §5.3.1 同口径的词法校验：空、绝对路径、反斜杠、盘符/冒号、空段、`.`/`..` 一律拒绝。
  // 注意：`posixDirname` 会先经 `toPosix` 归一化反斜杠，故原始 cardPath 的反斜杠/NUL 必须单独拒绝。
  const roleDirValid =
    !!roleDirRel &&
    !cardPathRel.includes("\\") &&
    !cardPathRel.includes("\0") &&
    !isAbsoluteAny(roleDirRel) &&
    !roleDirRel.includes("\\") &&
    !roleDirRel.includes(":") &&
    !roleDirRel.includes("\0") &&
    normalizeLexical(roleDirRel) === roleDirRel &&
    roleDirRel.split("/").every((part) => !!part && part !== "." && part !== "..");
  if (!roleDirValid) {
    docsDiagnostic.record("role-docs.index.skipped", { reasonCode: "invalid-card-path" });
    return empty();
  }
  const roleDirAbs = path.join(projectRoot, ...roleDirRel.split("/"));

  // 角色目录本身：只接受非符号链接的目录；否则不越界、不读取、不伪造。
  try {
    const s = await lstat(roleDirAbs);
    if (!s.isDirectory() || s.isSymbolicLink()) {
      docsDiagnostic.record("role-docs.index.skipped", {
        reasonCode: s.isSymbolicLink() ? "role-dir-symlink" : "role-dir-not-directory",
      });
      return empty();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    docsDiagnostic.record("role-docs.index.skipped", { reasonCode: code === "ENOENT" ? "role-dir-missing" : "role-dir-inspect-failed" });
    return empty();
  }

  // 角色根文档：只 lstat 白名单三个精确文件名，不 readdir 根目录、不读正文、不 lstat memo.md。
  // 三个检查与既有 changelog/docs 读取并行启动（顺序由 Promise.all 保持），避免给 listProject 增加串行延迟。
  const rootChecks = ROLE_ROOT_DOC_FILENAMES.map(async (name): Promise<RoleRootDocEntry | null> => {
    try {
      const s = await lstat(path.join(roleDirAbs, name));
      if (s.isFile() && !s.isSymbolicLink()) {
        return { name, path: `${roleDirRel}/${name}`, kind: "file" };
      }
      docsDiagnostic.record("role-docs.root.skipped", {
        reasonCode: s.isSymbolicLink() ? "symlink" : "not-regular-file",
        path: name,
      });
      return null;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        docsDiagnostic.record("role-docs.root.inspect-failed", { reasonCode: "inspect-failed", path: name });
      }
      return null;
    }
  });

  // changelog.md（既有逻辑保持：存在则读正文）
  let changelog: RoleDocsIndex["changelog"] = null;
  const changelogRel = `${roleDirRel}/changelog.md`;
  try {
    const s = await stat(path.join(projectRoot, ...changelogRel.split("/").filter(Boolean)));
    if (s.isFile()) {
      const text = await readFile(path.join(projectRoot, ...changelogRel.split("/").filter(Boolean)), "utf8");
      changelog = { path: changelogRel, text };
    }
  } catch {
    changelog = null;
  }

  // docs/ 目录索引（既有遍历/排序/上限/隐藏文件跳过不变）
  const docs: DocsIndexEntry[] = [];
  const docsAbs = path.join(roleDirAbs, "docs");
  try {
    const s = await stat(docsAbs);
    if (s.isDirectory()) await walkDir(docsAbs, "docs", docs);
  } catch {
    // 无 docs 目录：返回空索引。
  }

  const rootDocs = (await Promise.all(rootChecks)).filter((d): d is RoleRootDocEntry => d !== null);
  docsDiagnostic.record("role-docs.index", { count: rootDocs.length, ok: true });
  return { changelog, docs, rootDocs };
}


/** Converts the existing trusted listing only; renderer paths/evidence are never document candidates. */
export function projectDocumentCandidates(role: {
  roleId: string; builtIn: boolean; cardPath: string;
  changelog: { path: string; text: string } | null; docs: DocsIndexEntry[];
  rootDocs?: readonly RoleRootDocEntry[];
}): import("../../src/model/project-document.ts").ProjectDocumentRoleCandidates {
  return { roleId: role.roleId, builtIn: role.builtIn, cardPath: role.cardPath,
    ...(role.changelog ? { changelogPath: role.changelog.path } : {}), docs: role.docs,
    ...(role.rootDocs ? { rootDocs: role.rootDocs.map((d) => ({ path: d.path, kind: d.kind })) } : {}) };
}
