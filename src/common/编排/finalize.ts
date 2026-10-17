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

import type { BoundarySection1, PinEntry } from "../../model/boundary.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { ProjectConfig } from "../../model/role.ts";
import type { FinalizeStatus, FinalizeResult } from "../../model/runtime.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
import { buildGovernanceSeedBoundary, resolveBoundary } from "../../service/boundary/resolve-boundary.ts";
import { listProject } from "../../service/role/resolve-role.ts";
import { toPosix } from "../shared/path-primitives.ts";
import { ANS_DIR_NAME, ANS_PROJECT_FILE_NAME, ansProjectPath, loadEffectiveConfig } from "../shared/config-loader.ts";
import { resolveSkillRoot } from "../shared/runtime-shared.ts";

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
    return finalizeBootstrap({ ...input, writeGovernanceBoundaryDoc: true }); // 首次收尾（守卫：无可 pin → 零副作用）
  }
  return finalizeBootstrap({ ...input, writeGovernanceBoundaryDoc: false });
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
}

/** 进程内**同项目**建立互斥（I3，PM 评审 §4.6-3）。跨进程无全局锁——如实登记（见文件头）。 */
const governanceEstablishInFlight = new Set<string>();

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
  if (governanceEstablishInFlight.has(normalized.projectRoot)) {
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

  // 3) 进程内同项目互斥：**在首次 await 之前**占位（并发调用可确定性得到 busy）。
  if (governanceEstablishInFlight.has(projectRoot)) {
    return guardResult(projectRoot, "busy", "blocked", "上一次建立仍在进行中；本次未写入任何文件。");
  }
  governanceEstablishInFlight.add(projectRoot);
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
    return finalize.ok
      ? { ok: true, phase: "write", finalize }
      : { ok: false, phase: "precheck", finalize };
  } finally {
    governanceEstablishInFlight.delete(projectRoot);
  }
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

