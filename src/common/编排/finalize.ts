// src/common/编排/finalize.ts
// **创世自动收尾**（设计 §12.5/§13 经 2026-10-12 A-4 改造）：su（模型）**不会算 hash**，故 pin
// **只能由代码在 su 写完「之后」**算。本模块即那台「事后」机器——**不再有任何人工确认步骤**。
//
// ── A-4（2026-10-12）：删「提议 + 确认」，保留「自动收尾」─────────────────────────────
// 客户裁定：「客户确定了才加，不要有个收口，收口去掉」。故：
//   · **删**：`createSessionFinalizer`/`createFinalizeProposer`（su 提议 → 挂起等客户确认 → 才落盘）
//     整段，以及 CLI 的 `finalizeBootstrap` arm——「同意才落盘」的客户确认改由 **A-1 交互工具族**
//     （`request_confirmation`/`request_choice`，见 `src/common/编排/confirmed-writes.ts` 的 writeSet 发行）
//     承担，确认发生在**写入之前**、由门禁 F4 兜硬底。
//   · **留**：**写入本体**（`finalizeBootstrap`）与**自动触发**——`repinIfBootstrapped` 扩为**含首次**：
//     每轮 su settle 后由编排自动调用；创世态（无 `.ans`）= **首次收尾**（写 `.ans`(pin) +
//     `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md`），非创世态 = 重扫并更新 pin。
//     ⇒ 客户**同意并写入之后**，项目由代码自动收尾、进入正式态——不再需要客户按任何「完成」。
//   · **为何保留自动收尾**：① pin 与「项目正式态」的既有语义（`config-loader` 终态规则、桌面
//     `hasRoles` 过渡）不破；② **创世授权自终止**仍成立（治理边界文档写出 ⇒ `.ans` 的 `gov.path`
//     非空 ⇒ `resolveBoundarySection` 的项目/治理覆盖分支先于创世分支求值）。
//
// ── 守卫（pin 的「半成品」防线保留）───────────────────────────────────────────────
//   · **无可 pin 之物 → 拒绝写**（`precheck`）：既无角色 boundary.yaml、也无既存治理边界文档时，
//     不凭空写出 `.ans`——**零副作用**（正因如此，su 没写任何东西的 settle 不会把项目转正）。
//   · **每一笔写都先经 `resolveWrite`**（与 su 的写走**同一个门**）——命中即拒则整批中止、**零副作用**；
//     负例已测（拿掉授权 → 被拒且不产生任何文件/目录）。**不因是「收尾」而绕门**。
//
// ── pin 的更新时机（§13.3）──────────────────────────────────────────────────────
//   · **首次**：首个「有物可 pin」的 su settle 后自动写 `.ans`（上一条的守卫保证不会被凭空触发）。
//   · **其后**：每轮 su settle 后自动重扫 `角色卡/*/boundary.yaml` + 治理边界 → 更新 `.ans` 的 pin
//     + manifest ⇒ **客户加一个角色，pin 不会过时**。
//   · **如实标注的取舍（篡改检测窗口）**：pin **自动刷新** ⇒「上一轮结束时的盘面即被接受」。对**外部
//     （非经 su 会话）**的边界改动，**下一次 su settle 会把它吸收进 pin**——故 **tamper 检测窗口 =
//     到下一次 su settle 为止**。**这不是一个「钉死不动的篡改检测」**：它钉的是「每轮结束时的边界面」。
//
// ── 治理边界文档（§13.2，自终止松绑）─────────────────────────────────────────────
// **首次收尾**写出 **`角色卡/governance-boundary.yaml`**（`GOVERNANCE_BOUNDARY_REL`）——`.ans` 的
// `governanceBoundary.path` 指向它。此后 `resolveBoundarySection` 走**项目覆盖**分支 ⇒ su 的边界 =
// **这份文档**（创世分支不再求值；自终止仍是结构性的，但**不再是终点**——su 之后可继续增改角色）。
// 条目为三个**普通目录**（`角色卡/`、`docs/`、`.ans/`，root project、无 slug）——以便 su **随时**增改。
// **为何不是 blanket**：写集有界（只这三个目录，**绝不含 `src/`、不含项目内任意文件**），且是**项目工件**
// （一份具体文档、经 pin）。
//
// ── 自动重 pin 不重写治理边界文档 ────────────────────────────────────────────────
// 非创世态的重 pin 只更新 `.ans`+manifest（`writeGovernanceBoundaryDoc:false`）——**不覆盖** su
// 对治理边界文档的增改。只有**首次收尾**才写出该文档。
//
// ── 为什么这**不是「凭代码身份绕门」**────────────────────────────────────────────
// finalize **不直接** `fs.writeFile` 而不判定：它对**每一个待写路径**都先经**同一个** `resolveWrite`
// （targetPath, boundary, scope, ctx）求值——**命中即拒则整批中止、零副作用**（所有待写路径**全部前置求值**，
// 全放行才逐笔落盘）。即 finalize 的写与 su 的写走**同一个门**（`resolveWrite`）——门禁引擎把
// 「判定」与「落盘」分开，本模块只提供「判定通过才落盘」的那半。**若把授权拿掉**（边界不含 `.ans/`
// 且无相应条件、或边界未接受），finalize 立即被拒且**不产生任何文件/目录**（负例已测）。
//
// ── 已有角色但无治理记录：显式「建立治理记录」（I3，2026-10-17）────────────────────
// 适用态 S1：项目已枚举到项目角色（`listProject().hasRoles === true`），但 `.ans/project.json` 不存在。
// `previewGovernanceRecord` 只读展示；`establishGovernanceRecord` 由**操作者显式动作**触发（桌面确认按钮；
// IPC 的 importedProjectRoot / confirm 校验归桌面窗口）。两者**共用** `finalizeRelPaths` / `scanRoles` /
// `precheck` 与同一份目标构建代码；建立时**重新求值**，不信任预览快照。
//   · 一次性边界＝`buildGovernanceSeedBoundary(<操作者动作来源常量>)`，**只在本次调用栈内存在**——
//     不写 ProjectConfig、不缓存、不跨会话复用。`.ans` 持久化的是 finalize 写出的治理边界文档的
//     pin-backed acceptance（source 如实记操作者动作），**不是**这次的一次性种子边界。
//   · 守卫顺序（PM 评审 §4.6；本函数负责 3–7）：进程内同项目互斥 → `.ans` 必须不存在（有效/损坏均不覆盖）
//     → `hasRoles === true` → 既有治理边界文档可解析且条目非空（通过则 `writeGovernanceBoundaryDoc:false`
//     采纳、不覆盖）→ finalize。guard/precheck 拒绝**零写入**；写入阶段抛错**如实**返回 `phase:"write"`
//     （可能已写部分文件），**不自动重试、不清理已写产物**。
//   · 跨进程**无全局锁**（两个桌面实例/CLI 并发）——如实登记：最坏双方写出同构产物，不产生额外权限。

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BoundarySection1, PinEntry, PinEvidenceFile, PinEvidenceResult } from "../../model/boundary.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { GovernanceModel, ProjectConfig } from "../../model/role.ts";
import type { FinalizeStatus, FinalizeResult } from "../../model/runtime.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
import {
  buildGovernanceSeedBoundary,
  inspectPinnedBoundaries,
  resolveBoundary,
} from "../../service/boundary/resolve-boundary.ts";
import { listProject } from "../../service/role/resolve-role.ts";
import { toPosix } from "../shared/path-primitives.ts";
import {
  ANS_DIR_NAME,
  ANS_PROJECT_FILE_NAME,
  ansProjectPath,
  loadEffectiveConfig,
  readGovernanceModel,
} from "../shared/config-loader.ts";
import { resolveSkillRoot } from "../shared/runtime-shared.ts";
import { appendGovernanceLedger } from "./governance-ledger.ts";
import {
  isGovernanceRecordBusy,
  releaseGovernanceRecordLock,
  tryAcquireGovernanceRecordLock,
} from "./governance-record-lock.ts";

/** 项目角色目录名（与 `listProject` 口径一致）。 */
const ROLE_DIR_NAME = "角色卡";
/** 角色卡文件名（`listProject` 同口径）。 */
const CARD_NAMES = ["role-card.md"];
/** 角色边界文件名（`listProject` 同口径：.yaml/.yml/.md）。 */
const BOUNDARY_NAMES = ["boundary.yaml", "boundary.yml", "boundary.md"];
/** 项目治理边界的项目相对路径（= 门禁引擎 `governance-seed.ts::GOVERNANCE_BOUNDARY_REL` 同值）。
 *  它是种子边界的 `boundarySource`（诊断标签），也是 bootstrap 写出项目边界文档的落点。
 *  门禁引擎的该常量属其私有 `common/`（§6 禁止跨角色导入），故此处以**常量**记录（值相同）。 */
export const DEFAULT_GOVERNANCE_BOUNDARY_REL = "角色卡/governance-boundary.yaml";
/** 创世留痕文件的项目相对路径（逐路径留痕，设计 §10.4/§12.5）。 */
export const BOOTSTRAP_MANIFEST_REL = "docs/bootstrap-manifest.md";

/**
 * 项目治理边界文档内容（§13.2）：三个**普通目录**（root project、无 slug）——以便 su **随时**增改角色。
 * **写出的就是这份文档**（**首次自动收尾**写出）；此后 su 的边界 = 它（项目覆盖分支）。
 */
export function renderGovernanceBoundaryDoc(): string {
  const lines = [
    "role: 治理边界",
    "entries:",
    "  - kind: directory",
    "    path: 角色卡/",
    "    root: project",
    "    purpose: 角色目录：新建/修改角色（role-card/boundary/memo/docs）与治理边界文档自身",
    "  - kind: directory",
    "    path: docs/",
    "    root: project",
    "    purpose: 项目文档",
    "  - kind: directory",
    "    path: .ans/",
    "    root: project",
    "    purpose: .ans/project.json（acceptance/pin 更新）",
    "",
  ];
  return lines.join("\n");
}

/** finalize 的输入。 */
export interface FinalizeInput {
  /** 目标项目根（绝对路径；`.ans/project.json`、`角色卡/`、`docs/` 相对它解析）。 */
  projectRoot: string;
  /** 技能根（写入 `.ans` 的 `skillRoot` 字段，与载入器一致）。 */
  skillRoot: string;
  /** **授权边界**（创世种子边界 / 项目治理边界）——finalize 的写经 `resolveWrite` 对它求值。 */
  boundary: BoundarySection1;
  /** 项目治理边界文档的项目相对路径（pin 的对象之一）；缺省 `角色卡/governance-boundary.yaml`。 */
  governanceBoundaryPath?: string;
  /** 覆盖写入 `.ans` 的 `acceptance.source`；缺省取 `boundary.acceptance.source`。 */
  acceptanceSource?: string;
  /**
   * 治理模型（评审 §5.5）。**仅当给出**才在 `.ans` 写入 `governanceModel`：
   * trio 新项目/创世由调用方传 `"trio"`；single/su 不传——旧 `.ans` 形状逐字不变。
   * 显式传 `"single"` 会如实写出该字段（调用方负责只在确有必要时传）。
   */
  governanceModel?: GovernanceModel;
  /** 可注入时钟（测试用）；缺省 `new Date()`。 */
  now?: () => Date;
  /**
   * 是否写出项目治理边界文档（§13.2）。**首次自动收尾** 为 `true`（缺省）；
   * **非创世态的重 pin** 为 `false`——**不覆盖** su 对治理边界文档的增改（见文件头）。
   */
  writeGovernanceBoundaryDoc?: boolean;
}

// —————————————— 收口形状的来源（A-4 后的历史注记） ——————————————
//
// `FinalizeStatus` / `FinalizeResult` 两型的**唯一来源**是 §4 冻结契约家 `src/model/runtime.ts`
// （Pi适配器 T36 逐字落于彼处；本模块**按需导入**使用——见文件顶部 import）。
// **历史**：T36/T37 时期本模块曾按 T20→T21 的「导入 + 再导出」收敛法，**再导出**
// `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn` 三型（维持消费方零改动）。A-4
// （2026-10-12）删「提议 + 确认」后：`FinalizeBootstrapFn`（收口能力形状）与 `finalize_bootstrap`
// 工具由 Pi适配器随设计稿「**最后一步**」一并删除 ⇒ 本模块**不再引用它，再导出整段亦删除**
// （消费方已无一处使用：`run-role.ts` 只用 `repinIfBootstrapped`/`DEFAULT_GOVERNANCE_BOUNDARY_REL`，
// 测试只用 `finalizeBootstrap`/`isGenesisState`）。**保留的**：写入本体 `finalizeBootstrap`
// （`FinalizeInput` 为本模块自有输入形状）——供 `repinIfBootstrapped`（每轮 su settle 的自动收尾/
// 重 pin）使用；**只此一处，不再留三型**。

/** 三个相关路径（供收尾与句柄半成品守卫复用，避免两处各拼一遍）。 */
export function finalizeRelPaths(
  projectRoot: string,
  governanceBoundaryPath?: string,
): { projectJsonRel: string; manifestRel: string; governanceBoundaryRel: string } {
  const govAbs = path.resolve(projectRoot, governanceBoundaryPath ?? DEFAULT_GOVERNANCE_BOUNDARY_REL);
  return {
    projectJsonRel: toPosix(path.relative(projectRoot, ansProjectPath(projectRoot))),
    manifestRel: BOOTSTRAP_MANIFEST_REL,
    governanceBoundaryRel: toPosix(path.relative(projectRoot, govAbs)),
  };
}

/**
 * **创世态判定**（A-4 后语义）：项目**尚未 bootstrap**（无 `.ans/project.json`）。
 * 首个「有物可 pin」的 su settle 由**自动收尾**（`repinIfBootstrapped`）写出 `.ans` 后即**进入正式态**。
 */
export async function isGenesisState(projectRoot: string): Promise<boolean> {
  return !(await isFile(ansProjectPath(projectRoot)));
}

// —————————————————————— 前置预检（无可 pin / 门禁拒） ——————————————————————

type PrecheckOk = {
  ok: true;
  gate: (p: string) => WriteDecision;
  pinTargets: { rel: string; abs: string }[];
  roleIds: string[];
  pinCount: number;
  /** 本次将写的项目相对路径，**按实际写入顺序**（I3 预览与 finalize 共用同一份目标构建）。 */
  writePaths: string[];
  /** pin 目标中仍是 legacy `boundary.md` 的角色 id（只提示、不迁移；I3 预览用）。 */
  legacyBoundaryRoleIds: string[];
};
type PrecheckFail = { ok: false; status: FinalizeStatus; message: string; roleIds: string[] };

/** 预检：扫角色 + 定 pin 目标 + 门禁前置求值（全部待写路径）。**不做任何写入**。 */
async function precheck(
  input: Pick<FinalizeInput, "projectRoot" | "skillRoot" | "boundary" | "governanceBoundaryPath">,
  writeGovernanceBoundaryDoc: boolean,
): Promise<PrecheckOk | PrecheckFail> {
  const { projectRoot } = input;
  const { projectJsonRel, manifestRel, governanceBoundaryRel } = finalizeRelPaths(
    projectRoot,
    input.governanceBoundaryPath,
  );
  const govAbs = path.resolve(projectRoot, governanceBoundaryRel);

  const scanned = await scanRoles(projectRoot);
  const roleTargets = scanned.map((r) => ({ rel: r.boundaryRel, abs: r.boundaryAbs }));
  const roleIds = scanned.map((r) => r.id);
  const govExists = await isFile(govAbs);

  // 守卫：**无任何「su 已产出之物」**（既无角色 boundary.yaml、也无既存治理边界文档）→ 无可 pin 之物、拒。
  // （治理边界文档若将由本次 finalize 写出，**不算**作「su 已产出」——否则空项目也会被凭空收口。）
  if (roleTargets.length === 0 && !govExists) {
    return {
      ok: false,
      status: "nothing-to-pin",
      message:
        "无可 pin 的边界文件（su 尚未写出角色 boundary.yaml 与项目治理边界文档）——拒绝写出 .ans（fail-closed）",
      roleIds,
    };
  }

  // 实际 pin 目标：本次将写出的治理边界文档（或既存的）+ 每个角色的 boundary.yaml。
  const pinTargets: { rel: string; abs: string }[] = [];
  if (writeGovernanceBoundaryDoc || govExists) pinTargets.push({ rel: governanceBoundaryRel, abs: govAbs });
  for (const t of roleTargets) pinTargets.push(t);

  const gate = (p: string): WriteDecision =>
    resolveWrite(p, input.boundary, undefined, { skillRoot: input.skillRoot, projectRoot });
  // 写入顺序＝治理边界文档（若本次写出）→ `.ans` → manifest（与 finalizeBootstrap 的落盘顺序一致）。
  const writePaths = [
    ...(writeGovernanceBoundaryDoc ? [governanceBoundaryRel] : []),
    projectJsonRel,
    manifestRel,
  ];
  for (const p of writePaths) {
    const decision = gate(p);
    if (!decision.allowed) {
      return {
        ok: false,
        status: "blocked",
        message: `finalize 写入被门禁拒绝（未绕门）：${p} —— ${decision.reason}`,
        roleIds,
      };
    }
  }
  return {
    ok: true,
    gate,
    pinTargets,
    roleIds,
    pinCount: pinTargets.length,
    writePaths,
    legacyBoundaryRoleIds: scanned.filter((r) => r.boundaryRel.endsWith(".md")).map((r) => r.id),
  };
}

// —————————————————————— 核心落盘（首次确认 / 自动重 pin 共用） ——————————————————————

interface ScannedRole {
  id: string;
  cardRel: string;
  boundaryRel: string;
  boundaryAbs: string;
}

/**
 * **创世 finalize 的落盘核心**：扫角色边界 + 治理边界 → 算 SHA-256 → 写 `.ans/project.json`（pin）
 * + `docs/bootstrap-manifest.md`（逐路径留痕）；`writeGovernanceBoundaryDoc` 为真时**同时写出**
 * 项目治理边界文档（§13.2）。**所有待写路径全部先经 `resolveWrite`**；任一被拒 → 整批中止、**零副作用**。
 * 失败以 `{ok:false, status, message}` 如实返回（不抛错——调用方按结果处理）。
 */
export async function finalizeBootstrap(input: FinalizeInput): Promise<FinalizeResult> {
  const { projectRoot } = input;
  const { projectJsonRel, manifestRel, governanceBoundaryRel } = finalizeRelPaths(
    projectRoot,
    input.governanceBoundaryPath,
  );
  const writeGovDoc = input.writeGovernanceBoundaryDoc !== false;
  const mkResult = (status: FinalizeStatus, message: string, extra?: Partial<Pick<FinalizeResult, "wrote" | "pins" | "roles">>): FinalizeResult => ({
    ok: status === "completed",
    status,
    message,
    reason: status === "completed" ? undefined : message,
    wrote: extra?.wrote ?? [],
    pins: extra?.pins ?? [],
    roles: extra?.roles ?? [],
    projectJsonRel,
    manifestRel,
  });

  const pre = await precheck(input, writeGovDoc);
  if (!pre.ok) return mkResult(pre.status, pre.message, { roles: pre.roleIds });
  const { gate, pinTargets, roleIds } = pre;

  // 1) 写出项目治理边界文档（§13.2）——**首笔**（它是 pin 对象之一，须先落盘再算 hash）。
  //    此前的门禁前置求值已确认三条待写路径全放行，故此处不会产生「写了 gov doc 又被后续拒」的半副作用。
  if (writeGovDoc) {
    await gatedAtomicWrite(gate, governanceBoundaryRel, renderGovernanceBoundaryDoc(), projectRoot);
  }

  // 2) 逐文件算 SHA-256（对**落盘后的实际字节**，与门禁引擎 io.ts::sha256File 同算法）。
  const pins: PinEntry[] = [];
  for (const t of pinTargets) pins.push({ path: t.rel, sha256: await sha256File(t.abs) });

  // 3) 组装 `.ans/project.json`（形状对齐装配载入器 `src/common/shared/config-loader.ts`）。
  const acceptanceSource = input.acceptanceSource ?? (input.boundary.acceptance.source || "");
  const rolesMap: Record<string, { card: string; boundary: string }> = {};
  for (const r of (await scanRoles(projectRoot))) rolesMap[r.id] = { card: r.cardRel, boundary: r.boundaryRel };
  const ansProject = {
    projectRoot: toPosix(projectRoot),
    skillRoot: toPosix(input.skillRoot),
    // 评审 §5.5：仅当调用方给出模型才写该字段；single/旧项目不传 ⇒ `.ans` 形状不变。
    ...(input.governanceModel !== undefined ? { governanceModel: input.governanceModel } : {}),
    roles: rolesMap,
    governanceBoundary: {
      path: governanceBoundaryRel,
      acceptance: { accepted: true, source: acceptanceSource, pin: pins },
    },
  };

  // 4) 组装留痕（逐路径：列出 `角色卡/`、`docs/` 下**实际创建**的文件 + 本 finalize 写出的产物）。
  const createdPaths = (await listFilesUnder(projectRoot, [ROLE_DIR_NAME, "docs"])).filter(
    (p) => p !== manifestRel && p !== projectJsonRel,
  );
  const at = (input.now ?? (() => new Date()))().toISOString();
  const wroteGovDocRel = writeGovDoc ? [governanceBoundaryRel] : [];
  const manifest = renderManifest({
    at,
    projectRoot,
    acceptanceSource,
    roleIds,
    pins,
    createdPaths,
    projectJsonRel,
    manifestRel,
    governanceBoundaryRel: writeGovDoc ? governanceBoundaryRel : undefined,
  });

  // 5) 全放行才逐笔落盘（写前在 gatedAtomicWrite 内**再求一次**，纵深防御）。
  await gatedAtomicWrite(gate, projectJsonRel, JSON.stringify(ansProject, null, 2) + "\n", projectRoot);
  await gatedAtomicWrite(gate, manifestRel, manifest, projectRoot);

  const wrote = [...wroteGovDocRel, projectJsonRel, manifestRel];
  return mkResult(
    "completed",
    `已收口：写出 ${wrote.join("、")}（pin ${pins.length} 条，角色 ${roleIds.length}）`,
    { wrote, pins, roles: roleIds },
  );
}

/**
 * **自动收尾 + 自动重 pin**（A-4 / §13.3）：每轮 su settle 后由编排自动调用——
 *   · **创世态**（无 `.ans`）= **首次收尾**：扫角色边界 + 治理边界 → 写 `.ans`(pin) +
 *     **`角色卡/governance-boundary.yaml`** + `docs/bootstrap-manifest.md`。
 *     幂等安全：**无可 pin 之物 → `nothing-to-pin`、零副作用**（su 本轮什么都没写时不会把项目转正）。
 *   · **非创世态**：重扫并更新 `.ans` 的 pin + manifest；**不重写治理边界文档**
 *     （`writeGovernanceBoundaryDoc:false`——不覆盖 su 的增改）。
 * 两态都不含任何人工确认步骤（确认在**写入之前**由 A-1 交互工具 + F4 完成，见文件头）。
 */
export async function repinIfBootstrapped(
  input: Omit<FinalizeInput, "writeGovernanceBoundaryDoc">,
): Promise<FinalizeResult | undefined> {
  if (await isGenesisState(input.projectRoot)) {
    // 创世态：模型由**调用方**按当前模型传入（trio 传 "trio"；single 不传，旧 `.ans` 形状不变）。
    return finalizeBootstrap({ ...input, writeGovernanceBoundaryDoc: true }); // 首次收尾（守卫：无可 pin → 零副作用）
  }
  // 非创世态：本函数会**重建** `.ans`（roles/pin/acceptance 重算）。若不带上既有模型，
  // trio 项目会在任一轮 settle 后被写成「无 governanceModel」⇒ 共享载入器按 single 读取（模型降级）。
  // 故调用方未显式给出时，从当刻 `.ans` 读取并原样保留；字段缺失/非法/不可读 ⇒ 不写（旧形状不变）。
  const governanceModel = input.governanceModel ?? (await existingGovernanceModel(input.projectRoot));
  return finalizeBootstrap({ ...input, governanceModel, writeGovernanceBoundaryDoc: false });
}

/** 读取既有 `.ans` 的显式模型（只读；缺失/非法/不可读 → `undefined`，不猜测）。 */
async function existingGovernanceModel(projectRoot: string): Promise<GovernanceModel | undefined> {
  const read = await readGovernanceModel(projectRoot);
  return read.state === "explicit" ? read.model : undefined;
}

// —————————————— 已有角色但无治理记录：预览 / 显式建立（I3，2026-10-17） ——————————————
//
// 契约形状逐字按 PM 评审 §4.3 / §4.4。**机制不接受调用方提供的边界/授权来源/写路径**——一次性种子
// 边界在本模块内构造，来源是固定的操作者动作常量。

/**
 * 一次性治理种子边界的 `acceptance.source`（**操作者动作**，逐字展示）。
 * 该字符串本身会经 `finalizeBootstrap` 写入 `.ans` 的 `acceptance.source`（如实记录发起动作）；
 * **一次性/不持久化的是种子边界对象**（entries/accepted），它只存在于本次调用栈内——
 * 不写入 ProjectConfig、不缓存、不跨会话复用。
 */
export const GOVERNANCE_RECORD_ACCEPTANCE_SOURCE =
  "desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）";

/** 预览形状（PM 评审 §4.3，逐字）。 */
export interface GovernancePreview {
  projectRoot: string;
  /** 预期治理边界文档的项目相对路径（缺省 `角色卡/governance-boundary.yaml`）。 */
  governanceBoundaryRel: string;
  /** 本次将写的项目相对路径（**写入顺序**）。 */
  writePaths: string[];
  /** 本次将 pin 的项目相对路径（治理文档 + 可 pin 的角色边界）。 */
  pinPaths: string[];
  /** 将纳入 `.ans` roles 映射的角色 id（缺件角色不在此列）。 */
  roleIds: string[];
  /** true＝采纳既有治理边界文档，不覆盖。 */
  adoptExistingGovernanceDoc: boolean;
  /** 将写入 `.ans` 的操作者动作来源（逐字展示）。 */
  acceptanceSource: string;
  /**
   * 本次将写入 `.ans` 的治理模型（评审 §5.5「预览必须显示将写入的治理模型」）。
   * `single` 时**不新增** `governanceModel` 字段（旧 `.ans` 形状不变）；`trio` 时写出该字段。
   */
  governanceModel: GovernanceModel;
  /** pin 目标中仍是 legacy `boundary.md` 的角色（只提示，不迁移）。 */
  legacyBoundaryRoleIds: string[];
}

export type GovernancePreviewErrorCode =
  | "invalid-request" // projectRoot 缺失/不可访问（importedProjectRoot 校验归桌面 IPC）
  | "already-established" // .ans 已存在且可用
  | "invalid-record" // .ans 存在但不可用（V1 不修复）
  | "no-roles" // hasRoles === false
  | "nothing-to-pin" // 无任何可 pin 之物（precheck 原样）
  | "unparseable-governance-doc" // 既有治理边界文档不可解析或条目为空
  | "blocked" // precheck 门禁拒绝（原样 message）
  | "busy"; // 同项目有进行中的建立

export type GovernancePreviewResult =
  | { ok: true; preview: GovernancePreview }
  | { ok: false; code: GovernancePreviewErrorCode; message: string };

/** 建立结果（PM 评审 §4.4）：`FinalizeResult` **逐字**嵌套，不改写 message/status/wrote/pins/roles。 */
export interface EstablishGovernanceResult {
  ok: boolean; // 与 finalize.ok 同值
  phase: "guard" | "precheck" | "write"; // guard=未进 finalize；precheck=零写入拒绝；write=已进入写入阶段
  code?: GovernancePreviewErrorCode; // guard 分支的机器可读原因
  finalize: FinalizeResult;
}

/**
 * 预览/建立的输入。**不包含**边界、授权来源或写路径——这些由机制内部构造。
 * `skillRoot` 可选（缺省 `resolveSkillRoot()`，与装配/桌面同源），仅用于写 `.ans` 的 `skillRoot`
 * 与门禁路径求值，不参与授权判定。
 */
export interface GovernanceRecordInput {
  projectRoot: string;
  skillRoot?: string;
  /**
   * 治理模型（评审 §8.3 S1 预览的模型选择；V1b 迁移批次落 `.ans`）。**缺省 `single`**：
   * 旧项目建立治理记录的行为逐字不变（不新增 `.ans/governance/ledger.jsonl`）；
   * 只有显式 `trio` 才写 `governance.established`（评审 §5.7 的治理账本属三权模型）。
   */
  governanceModel?: GovernanceModel;
  /**
   * 可选预览摘要（评审 §5.7：`governance.established` 的 `decisionEvidence.previewDigest`）。
   * 本模块不校验它（治理记录的建立预览当前不带 digest）；给出即原样写入账本供审计。
   */
  previewDigest?: string;
}

// —————————————— 进程内同项目互斥（I3，PM 评审 §4.6-3；V1b 迁移共用） ——————————————
// 集合已提为 `governance-record-lock.ts`——establish / reaccept / migrate 三者同一份锁，不造第二份。
// 跨进程无全局锁——如实登记（见文件头）。

type NormalizedGovernanceInput = { projectRoot: string; skillRoot: string };

function normalizeGovernanceInput(input: GovernanceRecordInput): NormalizedGovernanceInput | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const rawRoot = input.projectRoot;
  if (typeof rawRoot !== "string" || rawRoot.trim() === "") return undefined;
  const projectRoot = path.resolve(rawRoot);
  const rawSkillRoot = input.skillRoot;
  const skillRoot =
    typeof rawSkillRoot === "string" && rawSkillRoot.trim() !== ""
      ? path.resolve(rawSkillRoot)
      : resolveSkillRoot();
  return { projectRoot, skillRoot };
}

/** `.ans/project.json` 的状态（I3 守卫/预览共用；与桌面窗口的 S1/S3 判据同源）。 */
type GovernanceRecordInspection =
  | { state: "absent" }
  | { state: "usable" }
  | { state: "invalid"; reason: string };

async function inspectGovernanceRecord(input: NormalizedGovernanceInput): Promise<GovernanceRecordInspection> {
  if (!(await isFile(ansProjectPath(input.projectRoot)))) return { state: "absent" };
  const fallback: ProjectConfig = {
    projectRoot: input.projectRoot,
    skillRoot: input.skillRoot,
    roles: {},
  };
  // 只读载入（与桌面/CLI 同一共享载入器）；**不写、不修复、不补 pin**。
  const loaded = await loadEffectiveConfig({
    projectRoot: input.projectRoot,
    skillRoot: input.skillRoot,
    fallback,
  });
  if (loaded.source.kind !== "ans") {
    return {
      state: "invalid",
      reason: loaded.source.downgradeReason ?? ".ans/project.json 不可解析或不可用",
    };
  }
  const accepted = loaded.source.acceptance.accepted === true;
  const govPath = loaded.project.governanceBoundary?.path ?? "";
  if (!accepted || govPath.trim() === "") {
    return {
      state: "invalid",
      reason: loaded.source.downgradeReason ?? "治理记录未被接受或缺少治理边界路径",
    };
  }
  return { state: "usable" };
}

/** 探测用 roleId：确保 `resolveBoundarySection` 不命中 per-role 分支（roles 映射为空），直走治理文档分支。 */
const GOVERNANCE_DOC_PROBE_ROLE_ID = "__ans-governance-record-probe__";

/**
 * 校验既有治理边界文档：用门禁引擎公开的 `resolveBoundary` + **探测用** `ProjectConfig`
 * （同路径、`accepted:true`、**无 pin**——本步只校验「可解析且条目非空」，不做 pin 校验）。
 * 文档不存在＝无需校验（本次将写出）。
 */
async function inspectExistingGovernanceDoc(
  input: NormalizedGovernanceInput,
  governanceBoundaryRel: string,
): Promise<{ exists: boolean; ok: boolean; reason?: string }> {
  const abs = path.resolve(input.projectRoot, governanceBoundaryRel);
  if (!(await isFile(abs))) return { exists: false, ok: true };
  const probeProject: ProjectConfig = {
    projectRoot: input.projectRoot,
    skillRoot: input.skillRoot,
    roles: {},
    governanceBoundary: {
      path: governanceBoundaryRel,
      acceptance: { accepted: true, source: GOVERNANCE_RECORD_ACCEPTANCE_SOURCE },
    },
  };
  const section = await resolveBoundary(GOVERNANCE_DOC_PROBE_ROLE_ID, probeProject);
  if (typeof section.parseError === "string" && section.parseError !== "") {
    return { exists: true, ok: false, reason: section.parseError };
  }
  if (section.entries.length === 0) {
    return { exists: true, ok: false, reason: `治理边界文档没有任何条目：${governanceBoundaryRel}` };
  }
  return { exists: true, ok: true };
}

type GovernanceTargetEvaluation =
  | {
      ok: true;
      /** 一次性种子边界（**只在本次调用栈内使用**，不得持久化/缓存）。 */
      boundary: BoundarySection1;
      governanceBoundaryRel: string;
      writePaths: string[];
      pinPaths: string[];
      roleIds: string[];
      legacyBoundaryRoleIds: string[];
      adoptExistingGovernanceDoc: boolean;
    }
  | { ok: false; code: "nothing-to-pin" | "blocked"; message: string };

/**
 * 预览与建立**共用的前置求值与目标构建**：`finalizeRelPaths` + `precheck`（内部含 `scanRoles` 与门禁求值）。
 * 一次性边界在此构造（每次调用**新建**，无模块级缓存）。
 */
async function evaluateGovernanceTarget(
  input: NormalizedGovernanceInput,
  adoptExistingGovernanceDoc: boolean,
): Promise<GovernanceTargetEvaluation> {
  const boundary = buildGovernanceSeedBoundary(GOVERNANCE_RECORD_ACCEPTANCE_SOURCE);
  const { governanceBoundaryRel } = finalizeRelPaths(input.projectRoot);
  const pre = await precheck(
    { projectRoot: input.projectRoot, skillRoot: input.skillRoot, boundary },
    !adoptExistingGovernanceDoc,
  );
  if (!pre.ok) {
    return {
      ok: false,
      code: pre.status === "nothing-to-pin" ? "nothing-to-pin" : "blocked",
      message: pre.message,
    };
  }
  return {
    ok: true,
    boundary,
    governanceBoundaryRel,
    writePaths: pre.writePaths,
    pinPaths: pre.pinTargets.map((t) => t.rel),
    roleIds: pre.roleIds,
    legacyBoundaryRoleIds: pre.legacyBoundaryRoleIds,
    adoptExistingGovernanceDoc,
  };
}

/** `hasRoles` 复核：用既有 `listProject` 枚举（与桌面 S1 判据同源；pin 目标仍由 finalize 的 `scanRoles` 决定）。 */
async function projectHasRoles(projectRoot: string): Promise<boolean> {
  const listing = await listProject(projectRoot);
  return listing.hasRoles;
}

function governanceErrText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function synthesizeGuardFinalize(
  projectRoot: string | undefined,
  status: FinalizeStatus,
  message: string,
): FinalizeResult {
  const rels =
    projectRoot !== undefined
      ? finalizeRelPaths(projectRoot)
      : {
          projectJsonRel: `${ANS_DIR_NAME}/${ANS_PROJECT_FILE_NAME}`,
          manifestRel: BOOTSTRAP_MANIFEST_REL,
        };
  return {
    ok: false,
    status,
    message,
    reason: message,
    wrote: [],
    pins: [],
    roles: [],
    projectJsonRel: rels.projectJsonRel,
    manifestRel: rels.manifestRel,
  };
}

function guardResult(
  projectRoot: string | undefined,
  code: GovernancePreviewErrorCode,
  status: FinalizeStatus,
  message: string,
): EstablishGovernanceResult {
  return { ok: false, phase: "guard", code, finalize: synthesizeGuardFinalize(projectRoot, status, message) };
}

/**
 * 预览「建立治理记录」（I3，只读）。守卫顺序：invalid-request → busy → `.ans` 状态 → `hasRoles` →
 * 既有治理边界文档 → `precheck`。**零写入**；不信任任何缓存快照。
 */
export async function previewGovernanceRecord(input: GovernanceRecordInput): Promise<GovernancePreviewResult> {
  const normalized = normalizeGovernanceInput(input);
  if (normalized === undefined) {
    return { ok: false, code: "invalid-request", message: "projectRoot 缺失或不可访问；本次未写入任何文件。" };
  }
  if (isGovernanceRecordBusy(normalized.projectRoot)) {
    return { ok: false, code: "busy", message: "上一次建立仍在进行中；本次未写入任何文件。" };
  }

  const record = await inspectGovernanceRecord(normalized);
  if (record.state === "usable") {
    return { ok: false, code: "already-established", message: "治理记录已存在；本次未写入任何文件。" };
  }
  if (record.state === "invalid") {
    return {
      ok: false,
      code: "invalid-record",
      message: `治理记录不可用：${record.reason}；本版不自动覆盖，修复路径待后续版本。`,
    };
  }

  let hasRoles: boolean;
  try {
    hasRoles = await projectHasRoles(normalized.projectRoot);
  } catch (err) {
    return {
      ok: false,
      code: "invalid-request",
      message: `projectRoot 不可访问：${governanceErrText(err)}；本次未写入任何文件。`,
    };
  }
  if (!hasRoles) {
    return {
      ok: false,
      code: "no-roles",
      message: "项目没有可用角色（hasRoles=false）；本次未写入任何文件。",
    };
  }

  const { governanceBoundaryRel } = finalizeRelPaths(normalized.projectRoot);
  let doc: { exists: boolean; ok: boolean; reason?: string };
  try {
    doc = await inspectExistingGovernanceDoc(normalized, governanceBoundaryRel);
  } catch (err) {
    return {
      ok: false,
      code: "unparseable-governance-doc",
      message: `既有治理边界文档校验失败：${governanceErrText(err)}；本次未写入任何文件。`,
    };
  }
  if (!doc.ok) {
    return {
      ok: false,
      code: "unparseable-governance-doc",
      message: `既有治理边界文档不可解析或条目为空：${doc.reason}；本次未写入任何文件。`,
    };
  }

  const target = await evaluateGovernanceTarget(normalized, doc.exists);
  if (!target.ok) {
    return { ok: false, code: target.code, message: target.message };
  }

  return {
    ok: true,
    preview: {
      projectRoot: normalized.projectRoot,
      governanceBoundaryRel: target.governanceBoundaryRel,
      writePaths: target.writePaths,
      pinPaths: target.pinPaths,
      roleIds: target.roleIds,
      adoptExistingGovernanceDoc: target.adoptExistingGovernanceDoc,
      acceptanceSource: GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
      governanceModel: input.governanceModel ?? "single",
      legacyBoundaryRoleIds: target.legacyBoundaryRoleIds,
    },
  };
}

/**
 * 显式「建立治理记录」（I3）。守卫按 PM 评审 §4.6（本机制负责 3–7；importedProjectRoot 与 confirm
 * 的校验归桌面 IPC）：互斥 → `.ans` 不存在 → `hasRoles` → 既有治理边界文档可解析且条目非空 →
 * finalize（一次性种子边界 + `writeGovernanceBoundaryDoc`）。写入阶段抛错**捕获并如实返回**
 * `phase:"write"`，**不自动重试、不清理已写产物**。
 */
export async function establishGovernanceRecord(
  input: GovernanceRecordInput,
): Promise<EstablishGovernanceResult> {
  const normalized = normalizeGovernanceInput(input);
  if (normalized === undefined) {
    return guardResult(undefined, "invalid-request", "blocked", "projectRoot 缺失或不可访问；本次未写入任何文件。");
  }
  const { projectRoot, skillRoot } = normalized;

  // 3) 进程内同项目互斥：**在首次 await 之前**占位（并发调用可确定性得到 busy；与 migrate 共用锁）。
  if (!tryAcquireGovernanceRecordLock(projectRoot)) {
    return guardResult(projectRoot, "busy", "blocked", "上一次建立仍在进行中；本次未写入任何文件。");
  }
  try {
    // 4) `.ans/project.json` 必须不存在；存在即拒（无论有效/损坏，均不覆盖——修复属 V2）。
    const record = await inspectGovernanceRecord(normalized);
    if (record.state === "usable") {
      return guardResult(projectRoot, "already-established", "not-genesis", "治理记录已存在；本次未写入任何文件。");
    }
    if (record.state === "invalid") {
      return guardResult(
        projectRoot,
        "invalid-record",
        "not-genesis",
        `治理记录不可用：${record.reason}；本版不自动覆盖，修复路径待后续版本。`,
      );
    }

    // 5) `hasRoles` 复核（重新枚举，不信任预览快照）。
    let hasRoles: boolean;
    try {
      hasRoles = await projectHasRoles(projectRoot);
    } catch (err) {
      return guardResult(
        projectRoot,
        "invalid-request",
        "blocked",
        `projectRoot 不可访问：${governanceErrText(err)}；本次未写入任何文件。`,
      );
    }
    if (!hasRoles) {
      return guardResult(projectRoot, "no-roles", "blocked", "项目没有可用角色（hasRoles=false）；本次未写入任何文件。");
    }

    // 6) 既有治理边界文档：先校验可解析且条目非空；通过则采纳（writeGovernanceBoundaryDoc:false），坏文档零写入。
    const { governanceBoundaryRel } = finalizeRelPaths(projectRoot);
    let doc: { exists: boolean; ok: boolean; reason?: string };
    try {
      doc = await inspectExistingGovernanceDoc(normalized, governanceBoundaryRel);
    } catch (err) {
      return guardResult(
        projectRoot,
        "unparseable-governance-doc",
        "blocked",
        `既有治理边界文档校验失败：${governanceErrText(err)}；本次未写入任何文件。`,
      );
    }
    if (!doc.ok) {
      return guardResult(
        projectRoot,
        "unparseable-governance-doc",
        "blocked",
        `既有治理边界文档不可解析或条目为空：${doc.reason}；本次未写入任何文件。`,
      );
    }

    // 7) 一次性种子边界（本次调用内新建）→ finalizeBootstrap（内部会重新 precheck）。
    const target = await evaluateGovernanceTarget(normalized, doc.exists);
    if (!target.ok) {
      return {
        ok: false,
        phase: "precheck",
        finalize: synthesizeGuardFinalize(
          projectRoot,
          target.code === "nothing-to-pin" ? "nothing-to-pin" : "blocked",
          target.message,
        ),
      };
    }

    let finalize: FinalizeResult;
    try {
      finalize = await finalizeBootstrap({
        projectRoot,
        skillRoot,
        boundary: target.boundary,
        writeGovernanceBoundaryDoc: !doc.exists,
        // 评审 §5.5：trio 由调用方显式给出；single/旧项目不给（保持旧 `.ans` 形状）。
        ...(input.governanceModel !== undefined ? { governanceModel: input.governanceModel } : {}),
      });
    } catch (err) {
      // 写入阶段抛错：可能已落盘部分文件（治理文档/.ans/manifest 之一）——**如实**返回，不重试、不清理。
      // **不承诺可重试**：若 `.ans` 已落盘，重新执行会得到 already-established（V1 不覆盖）。
      const message =
        `写入中断：${governanceErrText(err)}；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），` +
        "请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。";
      return {
        ok: false,
        phase: "write",
        finalize: synthesizeGuardFinalize(projectRoot, "blocked", message),
      };
    }

    // finalizeBootstrap 的失败只来自 precheck（零写入）；成功即已进入写入阶段并完成。
    if (finalize.ok) {
      // §5.7：trio 项目 establish 成功后写 `governance.established`（应用动作；失败只诊断，不翻转结果）。
      // single 旧项目保持零新增副作用（不建治理账本目录；任务书「旧 single 行为逐字不变」）。
      if ((input.governanceModel ?? "single") === "trio") {
        await appendGovernanceRecordLedgerEvent(projectRoot, {
          kind: "governance.established",
          action: "establish",
          ...(typeof input.previewDigest === "string" && input.previewDigest.trim() !== ""
            ? { previewDigest: input.previewDigest }
            : {}),
        });
      }
      return { ok: true, phase: "write", finalize };
    }
    return { ok: false, phase: "precheck", finalize };
  } finally {
    releaseGovernanceRecordLock(projectRoot);
  }
}

// —————————————— 治理记录 pin 不符：预览 / 显式重新接受（B1，2026-10-17） ——————————————
//
// 契约逐字按 PM 评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.2（approved）。
// **恢复只做两件事**：把现有 pin 列表整表重算后写回 `.ans/project.json`，并向
// `docs/bootstrap-manifest.md` 追加一条「重新接受记录」。**不修改任何边界文件内容、不增删 pin 条目、
// 不改 `.ans roles` 映射、不改 `acceptance.source`、不自动开会话、不自动接受**。
//
// 与 `establishGovernanceRecord` 的关系：
//   · **共用**同一进程内互斥集合（`governance-record-lock.ts`；establish/reaccept/migrate 三者
//     key 统一 `path.resolve(projectRoot)`，不另建第二份）与同一落盘原语 `gatedAtomicWrite`、
//     同一一次性种子边界工厂 `buildGovernanceSeedBoundary`、同一共享载入器/公共出口；
//   · **不复用** `finalizeBootstrap` 本体——它会按 `scanRoles` 重建 pin 目标集与 `.ans roles`，
//     违反「只刷新现有 pin」。`.ans` 与 manifest 的构建走本节的重新接受专用路径。
//
// 预览与写入共用 `evaluateGovernanceReaccept`（读 `.ans` 原文、pin 列表、pin 证据、blockers）；
// 写入**不复用预览快照**（除 `previewDigest` 比对外）——所有守卫在写入时重新求值。

/**
 * 一次性治理种子边界的 `acceptance.source`（**操作者动作**，逐字展示）。
 * **仅用作本次重新接受写入的一次性种子边界的授权来源，不写入 `.ans`**——`.ans` 的
 * `acceptance.source` 保持最初授权来源不变（PM 评审开放问题 7）。
 */
export const GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE =
  "desktop-app:操作者为治理记录 pin 不符显式重新接受（操作者点击确认）";

export interface GovernanceReacceptInput {
  projectRoot: string;
  skillRoot?: string;
  /**
   * 治理模型（显式覆盖；缺省读 `.ans/project.json` 的 `governanceModel`，无则 `single`）。
   * 仅 `trio` 写 `governance.reaccepted` 账本事件——single 旧项目保持零新增副作用。
   */
  governanceModel?: GovernanceModel;
}

export interface GovernanceReacceptWriteInput extends GovernanceReacceptInput {
  confirm: true;
  previewDigest: string; // 预览返回的 64 hex
}

export type GovernanceReacceptStatus =
  | "completed" // 写入成功
  | "write-failed" // 已进入写入阶段但中断，可能部分落盘
  | "blocked" // 门禁前置拒绝
  | "not-needed" // 全部 pin 一致，无需操作
  | "no-record" // .ans/project.json 不存在
  | "invalid-record" // .ans 不可解析/未接受/pin 形状非法/治理边界未被覆盖
  | "missing-file" // 有 pin 目标缺失（G5）
  | "unreadable-file" // 有 pin 目标不可读（G5）
  | "unparseable-boundary" // 有 pin 目标坏 YAML / Section 1 为空（G6）
  | "preview-stale" // 预览后盘面变化（G4）
  | "busy" // 同项目有进行中的治理记录动作（G7）
  | "invalid-request"; // projectRoot / confirm / previewDigest 形状非法

export interface GovernanceReacceptBlocker {
  code: "missing-file" | "unreadable-file" | "unparseable-boundary";
  paths: string[];
  message: string;
}

export interface GovernanceReacceptPreview {
  projectRoot: string;
  /** 固定 [".ans/project.json", "docs/bootstrap-manifest.md"]（写入顺序）。 */
  writePaths: string[];
  /** 现有 pin 列表，原顺序、原路径。 */
  pinPaths: string[];
  pinCount: number;
  /** 仅 modified / missing / unreadable 条目（来自 PinEvidenceResult.files）。 */
  changed: PinEvidenceFile[];
  /** false = 有 blockers，确认按钮必须禁用。 */
  canConfirm: boolean;
  blockers: GovernanceReacceptBlocker[];
  /** PinEvidenceResult.digest；确认写入时原样回传。 */
  previewDigest: string;
}

export type GovernanceReacceptPreviewFailure =
  | "invalid-request"
  | "busy"
  | "no-record"
  | "invalid-record"
  | "not-needed"
  | "blocked";

export type GovernanceReacceptPreviewResult =
  | { ok: true; preview: GovernanceReacceptPreview }
  | { ok: false; status: GovernanceReacceptPreviewFailure; message: string };

export interface ReacceptGovernancePinsResult {
  /** status === "completed" 时为 true。 */
  ok: boolean;
  status: GovernanceReacceptStatus;
  /** 「是否零副作用」的唯一依据：guard/precheck 为零写入；write 可能已部分落盘。 */
  phase: "guard" | "precheck" | "write";
  message: string;
  /** 已尝试写入的项目相对路径（completed=两项；write-failed=可能的部分路径；其余=[]）。 */
  wrote: string[];
  /** completed 时写回 .ans 的新 pin 列表；路径与顺序必须与旧列表完全一致。 */
  pins?: PinEntry[];
  /** 观察到的不一致条目（预览/写入共用）。 */
  changed?: PinEvidenceFile[];
}

/** G2：只写两个路径——内部硬编码，不接受调用方传入。 */
const REACCEPT_WRITE_PATHS: readonly string[] = [`.ans/${ANS_PROJECT_FILE_NAME}`, BOOTSTRAP_MANIFEST_REL];
/** 探测用 roleId：roles 映射为空，确保 `resolveBoundarySection` 直走治理文档分支。 */
const REACCEPT_PROBE_ROLE_ID = "__ans-governance-reaccept-probe__";
const SHA256_HEX_64 = /^[0-9a-fA-F]{64}$/;
const REACCEPT_MANIFEST_HEADING = "## 重新接受记录（治理记录 pin 刷新）";

type NormalizedReacceptInput = { projectRoot: string; skillRoot: string };

function normalizeReacceptInput(input: unknown): NormalizedReacceptInput | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const rawRoot = record.projectRoot;
  if (typeof rawRoot !== "string" || rawRoot.trim() === "") return undefined;
  const projectRoot = path.resolve(rawRoot);
  const rawSkillRoot = record.skillRoot;
  const skillRoot =
    typeof rawSkillRoot === "string" && rawSkillRoot.trim() !== ""
      ? path.resolve(rawSkillRoot)
      : resolveSkillRoot();
  return { projectRoot, skillRoot };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reacceptErrText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function reacceptFailure(
  status: GovernanceReacceptStatus,
  phase: "guard" | "precheck" | "write",
  message: string,
  extra?: Partial<Pick<ReacceptGovernancePinsResult, "wrote" | "pins" | "changed">>,
): ReacceptGovernancePinsResult {
  return {
    ok: false,
    status,
    phase,
    message,
    wrote: extra?.wrote ?? [],
    pins: extra?.pins,
    changed: extra?.changed,
  };
}

/** 读取 `.ans` 的 pin 列表（形状非法 → invalid-record 原因；64 hex / 路径安全由门禁证据出口再判）。 */
function readReacceptPins(raw: unknown): { ok: true; pins: PinEntry[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: "governanceBoundary.acceptance.pin 必须是数组" };
  if (raw.length === 0) {
    return { ok: false, reason: "governanceBoundary.acceptance.pin 为空（至少需要一条 pin）" };
  }
  const pins: PinEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isPlainObject(item)) return { ok: false, reason: `pin[${i}] 不是对象` };
    if (typeof item.path !== "string" || item.path.trim() === "") {
      return { ok: false, reason: `pin[${i}] 的 path 必须是非空字符串` };
    }
    if (typeof item.sha256 !== "string") {
      return { ok: false, reason: `pin[${i}] 的 sha256 必须是字符串` };
    }
    pins.push({ path: item.path, sha256: item.sha256 });
  }
  return { ok: true, pins };
}

type ReacceptEvaluationFailure = {
  ok: false;
  status: "no-record" | "invalid-record" | "not-needed";
  phase: "guard";
  message: string;
};

type ReacceptEvaluation = {
  ok: true;
  projectRoot: string;
  skillRoot: string;
  doc: Record<string, unknown>;
  pins: PinEntry[];
  governanceBoundaryPath: string;
  evidence: PinEvidenceResult;
  blockers: GovernanceReacceptBlocker[];
  /** 一次性种子边界（**只在本次调用栈内使用**，不持久化/不缓存）。 */
  seedBoundary: BoundarySection1;
  gate: (rel: string) => WriteDecision;
  /** G3 门禁前置拒绝原因（有 blockers 时由调用方按守卫顺序决定优先级）。 */
  gateFailure?: string;
  /** manifest 既存全文；null = 不存在。 */
  manifestText: string | null;
  /** manifest 存在但不可读（blocked / precheck）。 */
  manifestFailure?: string;
} | ReacceptEvaluationFailure;

/** 读取 manifest：不存在（ENOENT/ENOTDIR）→ null；存在但不是普通文件或读失败 → 不可读原因。 */
async function readReacceptManifest(
  projectRoot: string,
): Promise<{ ok: true; text: string | null } | { ok: false; reason: string }> {
  const abs = path.resolve(projectRoot, BOOTSTRAP_MANIFEST_REL);
  let st;
  try {
    st = await stat(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true, text: null };
    return { ok: false, reason: reacceptErrText(err) };
  }
  if (!st.isFile()) return { ok: false, reason: "不是普通文件" };
  try {
    return { ok: true, text: await readFile(abs, "utf8") };
  } catch (err) {
    return { ok: false, reason: reacceptErrText(err) };
  }
}

/**
 * 预览与写入**共用**的重新接受求值（只读）：`.ans` 原文/解析、pin 列表、pin 证据、blockers、
 * G6 内容可解析预检、G3 一次性种子边界门禁前置、manifest 可读性。
 * 守卫 1（projectRoot）与 2（互斥）由调用方在**首次 await 之前**处理。
 */
async function evaluateGovernanceReaccept(input: NormalizedReacceptInput): Promise<ReacceptEvaluation> {
  const { projectRoot, skillRoot } = input;
  const ansAbs = ansProjectPath(projectRoot);

  // 3) `.ans/project.json` 存在。
  if (!(await isFile(ansAbs))) {
    return {
      ok: false,
      status: "no-record",
      phase: "guard",
      message: "没有治理记录（.ans/project.json 不存在）；本次未写入任何文件。",
    };
  }

  // 4) 原始 `.ans` 可解析、accepted、治理边界路径非空、pin 形状合法且非空。
  let rawText: string;
  try {
    rawText = await readFile(ansAbs, "utf8");
  } catch (err) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: `治理记录不可读：${reacceptErrText(err)}；本次未写入任何文件。`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: `治理记录不可解析：${reacceptErrText(err)}；本次未写入任何文件。`,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: "治理记录顶层不是对象；本次未写入任何文件。",
    };
  }
  const doc = parsed;
  const govRaw = doc.governanceBoundary;
  if (!isPlainObject(govRaw)) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: "治理记录缺少 governanceBoundary；本次未写入任何文件。",
    };
  }
  const govPath = govRaw.path;
  if (typeof govPath !== "string" || govPath.trim() === "") {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: "治理记录的 governanceBoundary.path 为空；本次未写入任何文件。",
    };
  }
  const acceptanceRaw = govRaw.acceptance;
  if (!isPlainObject(acceptanceRaw)) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: "治理记录缺少 governanceBoundary.acceptance；本次未写入任何文件。",
    };
  }
  if (acceptanceRaw.accepted !== true) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: "治理记录未被接受（accepted !== true）；本次未写入任何文件。",
    };
  }
  const pinRead = readReacceptPins(acceptanceRaw.pin);
  if (!pinRead.ok) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: `治理记录的 pin 形状非法：${pinRead.reason}；本次未写入任何文件。`,
    };
  }
  const pins = pinRead.pins;

  // 5) 门禁公共证据出口：形状/路径安全/治理边界覆盖 + 逐文件哈希（唯一哈希来源）。
  let evidence: PinEvidenceResult;
  try {
    evidence = await inspectPinnedBoundaries({ projectRoot, pins, requiredPath: govPath });
  } catch (err) {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: `pin 证据检查失败：${reacceptErrText(err)}；本次未写入任何文件。`,
    };
  }
  if (evidence.state === "invalid") {
    return {
      ok: false,
      status: "invalid-record",
      phase: "guard",
      message: `治理记录的 pin 不可用：${evidence.reason ?? "pin 证据检查失败"}；本次未写入任何文件。`,
    };
  }
  if (evidence.state === "ok") {
    return {
      ok: false,
      status: "not-needed",
      phase: "guard",
      message: "边界与治理记录一致，无需重新接受；本次未写入任何文件。",
    };
  }

  // 6) G5 缺失/不可读（写侧按 missing 优先；预览侧合并展示）。
  const missingPaths = evidence.files.filter((f) => f.status === "missing").map((f) => f.path);
  const unreadablePaths = evidence.files.filter((f) => f.status === "unreadable").map((f) => f.path);
  const blockers: GovernanceReacceptBlocker[] = [];
  if (missingPaths.length > 0) {
    blockers.push({
      code: "missing-file",
      paths: missingPaths,
      message: `有 pin 目标缺失，无法重新 pin：${missingPaths.join("、")}；本次未写入任何文件。`,
    });
  }
  if (unreadablePaths.length > 0) {
    blockers.push({
      code: "unreadable-file",
      paths: unreadablePaths,
      message: `有 pin 目标不可读，无法重新 pin：${unreadablePaths.join("、")}；本次未写入任何文件。`,
    });
  }

  // 8) G6 内容可解析预检：每个 pin 目标用门禁公共解析入口（探测配置只读：同路径、accepted:true、无 pin）。
  //    缺失/不可读目标已由 G5 阻断，不再重复标记为「不可解析」。
  const skipParse = new Set([...missingPaths, ...unreadablePaths]);
  const unparseablePaths: string[] = [];
  for (const pin of pins) {
    if (skipParse.has(pin.path)) continue;
    const probeProject: ProjectConfig = {
      projectRoot,
      skillRoot,
      roles: {},
      governanceBoundary: {
        path: pin.path,
        acceptance: { accepted: true, source: GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE },
      },
    };
    try {
      const section = await resolveBoundary(REACCEPT_PROBE_ROLE_ID, probeProject);
      const parseError = section.parseError;
      if ((typeof parseError === "string" && parseError !== "") || section.entries.length === 0) {
        unparseablePaths.push(pin.path);
      }
    } catch {
      unparseablePaths.push(pin.path);
    }
  }
  if (unparseablePaths.length > 0) {
    blockers.push({
      code: "unparseable-boundary",
      paths: unparseablePaths,
      message: `边界文件无法解析或 Section 1 为空：${unparseablePaths.join("、")}；本次未写入任何文件。`,
    });
  }

  // 9) G3 门禁前置：一次性种子边界（三个普通目录）+ 两个待写路径逐条 resolveWrite。
  const seedBoundary = buildGovernanceSeedBoundary(GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE);
  const gate = (rel: string): WriteDecision =>
    resolveWrite(rel, seedBoundary, undefined, { skillRoot, projectRoot });
  let gateFailure: string | undefined;
  for (const rel of REACCEPT_WRITE_PATHS) {
    const decision = gate(rel);
    if (!decision.allowed) {
      gateFailure = `重新接受写入被门禁拒绝（未绕门）：${rel} —— ${decision.reason ?? ""}；本次未写入任何文件。`;
      break;
    }
  }

  // manifest：存在则逐字节保留；读失败 → blocked / precheck，零写入。
  const manifest = await readReacceptManifest(projectRoot);
  const manifestFailure = manifest.ok
    ? undefined
    : `无法读取 ${BOOTSTRAP_MANIFEST_REL}：${manifest.reason}；本次未写入任何文件。`;

  return {
    ok: true,
    projectRoot,
    skillRoot,
    doc,
    pins,
    governanceBoundaryPath: govPath,
    evidence,
    blockers,
    seedBoundary,
    gate,
    gateFailure,
    manifestText: manifest.ok ? manifest.text : null,
    manifestFailure,
  };
}

/**
 * 预览「重新接受治理记录 pin」（只读）。
 * 只要 `.ans` 可解析、accepted、pin 形状合法且非空、治理边界被覆盖、且至少一项不一致 → `ok:true`；
 * 缺失/不可读/坏内容**不吞掉预览**，放进 `changed` + `blockers`，`canConfirm:false`。
 * 零写入；写入时不复用本快照（除 `previewDigest` 比对外）。
 */
export async function previewGovernanceReacceptance(
  input: GovernanceReacceptInput,
): Promise<GovernanceReacceptPreviewResult> {
  const normalized = normalizeReacceptInput(input);
  if (normalized === undefined) {
    return { ok: false, status: "invalid-request", message: "projectRoot 缺失或不可访问；本次未写入任何文件。" };
  }
  if (isGovernanceRecordBusy(normalized.projectRoot)) {
    return { ok: false, status: "busy", message: "上一次治理记录操作仍在进行中；本次未写入任何文件。" };
  }

  let evaluation: ReacceptEvaluation;
  try {
    evaluation = await evaluateGovernanceReaccept(normalized);
  } catch (err) {
    return {
      ok: false,
      status: "invalid-record",
      message: `治理记录求值失败：${reacceptErrText(err)}；本次未写入任何文件。`,
    };
  }
  if (!evaluation.ok) {
    return { ok: false, status: evaluation.status, message: evaluation.message };
  }

  if (evaluation.manifestFailure !== undefined) {
    return { ok: false, status: "blocked", message: evaluation.manifestFailure };
  }
  if (evaluation.blockers.length > 0) {
    // 有明细可展示：确认被禁用，但不是「没有可展示的预览」。
    return {
      ok: true,
      preview: {
        projectRoot: evaluation.projectRoot,
        writePaths: [...REACCEPT_WRITE_PATHS],
        pinPaths: evaluation.pins.map((p) => p.path),
        pinCount: evaluation.pins.length,
        changed: evaluation.evidence.files,
        canConfirm: false,
        blockers: evaluation.blockers,
        previewDigest: evaluation.evidence.digest,
      },
    };
  }
  if (evaluation.gateFailure !== undefined) {
    return { ok: false, status: "blocked", message: evaluation.gateFailure };
  }
  return {
    ok: true,
    preview: {
      projectRoot: evaluation.projectRoot,
      writePaths: [...REACCEPT_WRITE_PATHS],
      pinPaths: evaluation.pins.map((p) => p.path),
      pinCount: evaluation.pins.length,
      changed: evaluation.evidence.files,
      canConfirm: true,
      blockers: [],
      previewDigest: evaluation.evidence.digest,
    },
  };
}

/** 重新接受记录条目（完整 64 位哈希；UI 可截断，manifest 不截断）。 */
function renderReacceptManifestEntry(
  at: string,
  changed: PinEvidenceFile[],
  pinCount: number,
): string {
  const lines = [
    `- ${at}：操作者在桌面应用确认重新接受；变更 ${changed.length} 个边界文件（本次刷新 ${pinCount} 条 pin）`,
  ];
  for (const f of changed) {
    lines.push(`  - ${f.path}（旧 pin ${f.pinned} → 新 pin ${f.actual ?? f.pinned}）`);
  }
  return lines.join("\n");
}

/** 追加「重新接受记录」：既有全文逐字节保留；节存在则在节末追加，否则文末新增该节。 */
function appendReacceptManifestRecord(existing: string | null, entry: string): string {
  const section = `${REACCEPT_MANIFEST_HEADING}\n\n${entry}\n`;
  if (existing === null) {
    return [
      "# Bootstrap 留痕（创世 finalize）",
      "",
      "此前的 manifest 不存在；以下为重新接受记录。",
      "",
      section,
    ].join("\n");
  }
  const heading = /^## 重新接受记录（治理记录 pin 刷新）[ \t]*$/m.exec(existing);
  if (heading === null) {
    const lead = existing.endsWith("\n") ? "\n" : "\n\n";
    return existing + lead + section;
  }
  const headingEnd = heading.index + heading[0].length;
  const rest = existing.slice(headingEnd);
  const next = /\n## [^\n]*/.exec(rest);
  const insertAt = next === null ? existing.length : headingEnd + next.index;
  const before = existing.slice(0, insertAt);
  const after = existing.slice(insertAt);
  const lead = before.endsWith("\n") ? "" : "\n";
  return before + lead + entry + "\n" + after;
}

/**
 * 显式「重新接受治理记录 pin」（写入）。守卫顺序严格按 PM 评审 §5.2 表 1–11：
 * projectRoot → 互斥（与 establish 共用集合）→ `.ans` 存在 → 原始记录/形状 → pin 证据
 * （ok→not-needed；invalid→invalid-record；mismatch→继续）→ G5 → G4 digest → G6 解析预检 →
 * G3 门禁前置 → G8 写入（`.ans` 先、manifest 后）→ finally 释放互斥。
 * guard/precheck 拒绝**零写入**；写入阶段抛错如实返回 `phase:"write"`（可能已部分落盘），
 * **不自动重试、不清理已写产物**。
 */
export async function reacceptGovernancePins(
  input: GovernanceReacceptWriteInput,
): Promise<ReacceptGovernancePinsResult> {
  const normalized = normalizeReacceptInput(input);
  if (normalized === undefined) {
    return reacceptFailure("invalid-request", "guard", "projectRoot 缺失或不可访问；本次未写入任何文件。");
  }
  if ((input as { confirm?: unknown }).confirm !== true) {
    return reacceptFailure("invalid-request", "guard", "confirm 必须为 true；本次未写入任何文件。");
  }
  const { projectRoot } = normalized;

  // 2) 进程内同项目互斥：**在首次 await 之前**占位（与 establish/migrate 共用同一份锁）。
  if (!tryAcquireGovernanceRecordLock(projectRoot)) {
    return reacceptFailure("busy", "guard", "上一次治理记录操作仍在进行中；本次未写入任何文件。");
  }
  try {
    let evaluation: ReacceptEvaluation;
    try {
      evaluation = await evaluateGovernanceReaccept(normalized);
    } catch (err) {
      return reacceptFailure(
        "invalid-record",
        "guard",
        `治理记录求值失败：${reacceptErrText(err)}；本次未写入任何文件。`,
      );
    }
    if (!evaluation.ok) {
      return reacceptFailure(evaluation.status, evaluation.phase, evaluation.message);
    }

    // 6) G5：缺失优先，其次不可读；均零写入。
    const missing = evaluation.blockers.find((b) => b.code === "missing-file");
    if (missing !== undefined) {
      return reacceptFailure("missing-file", "precheck", missing.message, {
        changed: evaluation.evidence.files,
      });
    }
    const unreadable = evaluation.blockers.find((b) => b.code === "unreadable-file");
    if (unreadable !== undefined) {
      return reacceptFailure("unreadable-file", "precheck", unreadable.message, {
        changed: evaluation.evidence.files,
      });
    }

    // 7) G4 摘要比对：形状非法 → invalid-request / guard；与重算 digest 不等 → preview-stale / precheck。
    const previewDigest = (input as { previewDigest?: unknown }).previewDigest;
    if (typeof previewDigest !== "string" || !SHA256_HEX_64.test(previewDigest.trim())) {
      return reacceptFailure(
        "invalid-request",
        "guard",
        "previewDigest 不是 64 位十六进制；本次未写入任何文件。",
        { changed: evaluation.evidence.files },
      );
    }
    if (previewDigest.trim().toLowerCase() !== evaluation.evidence.digest) {
      return reacceptFailure(
        "preview-stale",
        "precheck",
        "预览后边界文件又有变化，已取消本次写入；请重新检查。本次未写入任何文件。",
        { changed: evaluation.evidence.files },
      );
    }

    // 8) G6 内容可解析预检（evaluator 已算出；按守卫顺序在此拦截）。
    const unparseable = evaluation.blockers.find((b) => b.code === "unparseable-boundary");
    if (unparseable !== undefined) {
      return reacceptFailure("unparseable-boundary", "precheck", unparseable.message, {
        changed: evaluation.evidence.files,
      });
    }

    // 9) G3 门禁前置 / manifest 可读性。
    if (evaluation.gateFailure !== undefined) {
      return reacceptFailure("blocked", "precheck", evaluation.gateFailure, {
        changed: evaluation.evidence.files,
      });
    }
    if (evaluation.manifestFailure !== undefined) {
      return reacceptFailure("blocked", "precheck", evaluation.manifestFailure, {
        changed: evaluation.evidence.files,
      });
    }

    // `.ans` 重写：保留全部既有字段（roles/source/未知字段），**只替换** pin；条目数/路径/顺序不变。
    // 证据只返回非一致项的 actual；一致项的旧 pin 与当刻 actual 相等（证据 `ok` 判据），故沿用旧值。
    const changedByPath = new Map<string, PinEvidenceFile>();
    for (const f of evaluation.evidence.files) {
      if (f.status === "modified") changedByPath.set(f.path, f);
    }
    const newPins: PinEntry[] = evaluation.pins.map((oldPin) => {
      const changed = changedByPath.get(oldPin.path);
      return { path: oldPin.path, sha256: changed?.actual ?? oldPin.sha256 };
    });
    inPlaceReplaceReacceptPins(evaluation.doc, newPins);
    const ansContent = JSON.stringify(evaluation.doc, null, 2) + "\n";

    const modified = evaluation.evidence.files.filter((f) => f.status === "modified");
    const manifestContent = appendReacceptManifestRecord(
      evaluation.manifestText,
      renderReacceptManifestEntry(new Date().toISOString(), modified, evaluation.pins.length),
    );

    // 10) G8：`.ans` 先写、manifest 后写；均经既有 gatedAtomicWrite（写前再求一次门禁）。
    const wrote: string[] = [];
    try {
      wrote.push(REACCEPT_WRITE_PATHS[0]);
      await gatedAtomicWrite(evaluation.gate, REACCEPT_WRITE_PATHS[0], ansContent, projectRoot);
      wrote.push(REACCEPT_WRITE_PATHS[1]);
      await gatedAtomicWrite(evaluation.gate, REACCEPT_WRITE_PATHS[1], manifestContent, projectRoot);
    } catch (err) {
      return reacceptFailure(
        "write-failed",
        "write",
        `写入中断：${reacceptErrText(err)}；可能已写入部分文件（.ans/project.json 与 docs/bootstrap-manifest.md 不保证齐全），请核对现场。`,
        { wrote, changed: evaluation.evidence.files },
      );
    }

    // §5.7：trio 项目 reaccept 成功后写 `governance.reaccepted`（带 action + previewDigest；
    // 失败只诊断，不翻转结果）。single 旧项目保持零新增副作用。
    const reacceptModel: GovernanceModel =
      input.governanceModel ?? (evaluation.doc.governanceModel === "trio" ? "trio" : "single");
    if (reacceptModel === "trio") {
      await appendGovernanceRecordLedgerEvent(projectRoot, {
        kind: "governance.reaccepted",
        action: "reaccept",
        previewDigest: previewDigest.trim().toLowerCase(),
      });
    }

    return {
      ok: true,
      status: "completed",
      phase: "write",
      message: `已重新接受：更新 ${modified.length} 条 pin（共 ${evaluation.pins.length} 条），写入 ${REACCEPT_WRITE_PATHS.join(" 与 ")}。`,
      wrote,
      pins: newPins,
      changed: evaluation.evidence.files,
    };
  } finally {
    // 11) 释放互斥。
    releaseGovernanceRecordLock(projectRoot);
  }
}

/** 只替换 `governanceBoundary.acceptance.pin`，不触碰其余字段（含未知字段/roles/source/accepted）。 */
function inPlaceReplaceReacceptPins(doc: Record<string, unknown>, pins: PinEntry[]): void {
  const gov = doc.governanceBoundary as Record<string, unknown>;
  const acceptance = gov.acceptance as Record<string, unknown>;
  acceptance.pin = pins;
}

// —————————————————————— 内部辅助 ——————————————————————

/** 扫描项目角色：有 role-card.md + boundary.yaml 的角色目录（与 listProject 同口径，按名排序）。 */
async function scanRoles(projectRoot: string): Promise<ScannedRole[]> {
  const rolesAbs = path.join(projectRoot, ROLE_DIR_NAME);
  let dirents;
  try {
    dirents = await readdir(rolesAbs, { withFileTypes: true });
  } catch {
    return []; // 无角色目录 → 无角色（不是错误）
  }
  const ids = dirents
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  const out: ScannedRole[] = [];
  for (const id of ids) {
    const dirAbs = path.join(rolesAbs, id);
    const cardName = await firstExistingFile(dirAbs, CARD_NAMES);
    if (cardName === null) continue; // 缺 role-card.md → 跳过（不凭空造角色）
    const boundaryName = await firstExistingFile(dirAbs, BOUNDARY_NAMES);
    if (boundaryName === null) continue; // 缺边界文件 → 不可 pin → 跳过
    const dirRel = toPosix(path.join(ROLE_DIR_NAME, id));
    out.push({
      id,
      cardRel: `${dirRel}/${cardName}`,
      boundaryRel: `${dirRel}/${boundaryName}`,
      boundaryAbs: path.join(dirAbs, boundaryName),
    });
  }
  return out;
}

/** 递归列出一个目录下（相对 projectRoot）的全部**文件**路径（posix、排序）；目录不存在 → 空。 */
async function listFilesUnder(projectRoot: string, dirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const d of dirs) {
    await walkFiles(path.join(projectRoot, d), d, out);
  }
  out.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  return out;
}

async function walkFiles(absDir: string, relDir: string, out: string[]): Promise<void> {
  let dirents;
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return; // 目录不存在/不可读 → 无内容
  }
  dirents.sort((a, b) => a.name.localeCompare(b.name));
  for (const d of dirents) {
    const rel = `${relDir}/${d.name}`;
    if (d.isDirectory()) {
      await walkFiles(path.join(absDir, d.name), rel, out);
    } else if (d.isFile()) {
      out.push(rel);
    }
  }
}

/**
 * 经门禁放行后**原子落盘**（写前**再求一次** `resolveWrite`，纵深防御）：同目录临时文件 + `rename`。
 * 未放行即抛错（调用方已在前置求值阶段拦下；此处是写前最后一次保险）。
 */
async function gatedAtomicWrite(
  gate: (p: string) => { allowed: boolean; reason?: string },
  rel: string,
  content: string,
  projectRoot: string,
): Promise<void> {
  const decision = gate(rel);
  if (!decision.allowed) {
    throw new Error(`finalize 写入被门禁拒绝：${rel} —— ${decision.reason ?? ""}`);
  }
  const abs = path.resolve(projectRoot, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${randomUUID()}`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, abs);
}

/** 渲染 `docs/bootstrap-manifest.md`（逐路径留痕）。 */
function renderManifest(args: {
  at: string;
  projectRoot: string;
  acceptanceSource: string;
  roleIds: string[];
  pins: PinEntry[];
  createdPaths: string[];
  projectJsonRel: string;
  manifestRel: string;
  governanceBoundaryRel?: string;
}): string {
  const lines: string[] = [];
  lines.push("# Bootstrap 留痕（创世 finalize）", "");
  lines.push(
    "> 本文件由**代码**在 su 的治理会话 settle **之后**生成（su 不会算 hash，故 pin 只能事后算）。",
    "> **pin 每轮 su settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——",
    "> 对**外部**（非经 su 会话）的边界改动，**下一次 su settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。",
    "",
  );
  lines.push(`- 生成时间：${args.at}`);
  lines.push(`- 目标项目：${toPosix(args.projectRoot)}`);
  lines.push(`- 授权来源：${args.acceptanceSource || "（缺）"}`);
  lines.push(`- 角色（${args.roleIds.length}）：${args.roleIds.join("、") || "（无）"}`);
  lines.push("");
  lines.push("## Pin 的边界文件（SHA-256）", "");
  lines.push("| 路径 | SHA-256 |");
  lines.push("| --- | --- |");
  for (const p of args.pins) lines.push(`| ${p.path} | ${p.sha256} |`);
  lines.push("");
  lines.push("## 实际创建路径（逐条留痕）", "");
  for (const p of args.createdPaths) lines.push(`- ${p}`);
  if (args.governanceBoundaryRel !== undefined) {
    lines.push(`- ${args.governanceBoundaryRel}（本 finalize 写出：项目治理边界文档）`);
  }
  lines.push(`- ${args.projectJsonRel}（本 finalize 写出）`);
  lines.push(`- ${args.manifestRel}（本 finalize 写出）`);
  lines.push("");
  return lines.join("\n");
}

async function isFile(absPath: string): Promise<boolean> {
  try {
    return (await stat(absPath)).isFile();
  } catch {
    return false;
  }
}

async function firstExistingFile(dirAbs: string, names: string[]): Promise<string | null> {
  for (const n of names) {
    if (await isFile(path.join(dirAbs, n))) return n;
  }
  return null;
}

/**
 * 文件内容的 SHA-256（小写十六进制）。
 * **对原始字节求哈希**（不经 UTF-8 解码、不剥 BOM）——与门禁引擎 `io.ts::sha256File`（verifyPins 用）
 * **逐字同算法**（同一 `node:crypto`、同一 `readFile` 字节流）。pin 生成与校验必须同算法。
 */
async function sha256File(absPath: string): Promise<string> {
  const bytes = await readFile(absPath);
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 治理记录事件落账本（评审 §5.7）：`governance.established` / `governance.reaccepted`。
 * **best-effort**：`appendGovernanceLedger` 自身只诊断不抛；这里再兜一层，任何失败都不改变
 * establish/reaccept 的结果（账本失败不翻转，§九-16）。
 * `governance.migrated` 由 V1b 迁移模块 `governance-migration.ts` 写入（本函数只负责
 * establish/reaccept 两类事件）。
 */
async function appendGovernanceRecordLedgerEvent(
  projectRoot: string,
  event: {
    kind: "governance.established" | "governance.reaccepted";
    action: "establish" | "reaccept";
    previewDigest?: string;
  },
): Promise<void> {
  try {
    await appendGovernanceLedger(projectRoot, {
      at: new Date().toISOString(),
      kind: event.kind,
      actorRoleId: "app",
      power: "app",
      decisionEvidence: {
        kind: "desktop-governance-record",
        action: event.action,
        ...(event.previewDigest !== undefined ? { previewDigest: event.previewDigest } : {}),
      },
    });
  } catch {
    /* 见上：账本失败不翻转治理记录动作 */
  }
}

