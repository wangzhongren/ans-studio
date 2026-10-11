// src/pipeline/orchestration/govern-session.ts
// 编排层：**唯一的治理会话引擎**（设计 §10.5：CLI `ans govern` 与桌面 su 收敛到同一入口）。
//
// ── 一个引擎，两个前端（§10.5，项目硬规矩「杜绝两份实现」）──────────────────────
// 客户只废 `ans init`，**未动 `ans govern`**。裁决：**保留 `ans govern`**，并明确它与**桌面 su 聊天**
// **是同一个治理会话机制的两个前端**——
//   · **一个引擎**：`openGovernanceSession`（本文件）——CLI 与桌面**都调它**；
//   · **两个前端**：CLI `ans govern`（终端，经 `runGovernSession` 一次性驱动）；桌面 su 聊天（UI，
//     直接持有 `GovernanceSessionHandle` 多轮 send）。
// 二者 gate 与写集**同源**（治理边界 / 冷启动创世授权），**无第二份装配实现**。
//
// ── 会话主体与边界 ─────────────────────────────────────────────────────────
//  1) 会话主体是**内置治理角色**（su）——其 id 由门禁引擎的 `listProject` **枚举**得到
//     （`builtIn===true`），编排**不硬编码** `"su"`（权限以数据表达）；经**会话式入口**
//     `openRoleSession` 开启（runRole 的 CLI 一次性路径结构性拒绝内置角色）。
//  2) 其 gate 求值的边界是**项目治理边界**（`resolveBoundarySection` 对「不在 `project.roles` 的
//     角色」解析得到），判定**唯一复用** `resolveWrite`（编排不另写判定）。
//  3) `scope` 按治理边界的**条件目录**给出（`conditions` = 所有条件目录 slug；`writeSet` = 目标角色
//     在 `角色卡/<id>/` 下的**精确文件**——F4 是精确匹配，放目录不覆盖子路径）。
//
// ── 不再预建骨架（T32，设计 §12.4/§12.7）─────────────────────────────────────
// 客户「不预建，全由 su 对话决定」直接否定了固定的 `SCAFFOLD_ROLES`/`writeGovernanceSkeleton` 骨架。
// 故本引擎**不再**在开会话前落盘任何骨架（原 `bootstrap` 选项已退役）：角色由 su 在会话里**用工具
// 按对话决定逐个写出**，门禁只在旁约束「允许写什么」。引擎自身只负责「发现治理角色 → 解析治理边界
// → 造 scope → 打开内置治理角色会话」。
//
// ── 创世 finalize（T33，设计 §12.5）──────────────────────────────────────────
// su 不会算 hash，故 pin 只能在 su 写完**之后**由代码算。句柄上提供**显式**的 `finalize()`：
// 扫目标项目角色边界 + 项目治理边界 → 算 SHA-256 → 写 `.ans/project.json`（pin）+ 逐路径留痕
// （`docs/bootstrap-manifest.md`）。finalize 的写**同样经 `resolveWrite`**（复用 su 的创世授权），
// 见 `src/common/编排/finalize.ts`。**不在每次 settle 自动跑**（防 pin 半成品）——见句柄注释。

import type { ProjectConfig } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";
import type { Acceptance, BoundarySection1 } from "../../model/boundary.ts";
import type { OperatorChannelFn, RuntimeAdapter, SessionEvent, WriteGate } from "../../provider/pi/session.ts";
import { openRoleSession } from "./run-role.ts";
import { listProject, resolveRole } from "../../service/role/resolve-role.ts";
import { formatEvent } from "../../common/编排/output.ts";
import type { OrchestrationEvent } from "../../common/编排/handback.ts";
import { EXIT_FAILURE, EXIT_OK } from "../../common/编排/exit-codes.ts";
import { createCliOperatorChannel } from "../../common/编排/operator-channel.ts";
import {
  createSessionFinalizer,
  DEFAULT_GOVERNANCE_BOUNDARY_REL,
  repinIfBootstrapped,
  type FinalizeResult,
} from "../../common/编排/finalize.ts";

/** 角色目录名（与 `listProject` 口径一致：项目角色的目录 `角色卡/<id>/`）。 */
const ROLE_CARD_DIR = "角色卡";

/**
 * 治理会话创建角色时写入的标准文件（role-card / boundary / memo）。
 * 它们的父目录是 `角色卡/<id>/`——即治理边界 `角色卡/`（condition `role-restructuring`）之内。
 * 注：文件**内容**由 su 在会话里按对话决定（不再有固定模板骨架，设计 §12.4）。
 */
export const ROLE_SCAFFOLD_FILES: readonly string[] = ["role-card.md", "boundary.yaml", "memo.md"];

export interface GovernSessionInput {
  taskId: string;
  /** 装配注入的 project（配置单一来源在装配，契约 §6）。 */
  project: ProjectConfig;
  /** 本次治理会话要创建/重构的角色 id 列表（给出可写集）；缺省 = 无可写文件（仅按边界只读）。 */
  targetRoleIds?: string[];
  /** 覆盖内置治理角色 id；缺省经 `listProject` 枚举 `builtIn` 得到（不硬编码）。 */
  governanceRoleId?: string;
  /** 覆盖默认任务提示（测试/自定义用）。 */
  prompt?: string;
  /** 目标项目目录（设计 §12.3，`ans govern <目录>`）：**诊断/透传**用——真正的 `projectRoot` 由**装配**
   *  据它设入 `project.projectRoot`（T34）；此处仅原样带出，供前端如实呈现与后续 finalize（T33）取用。 */
  targetDir?: string;
  /** **创世 finalize（T33/T37）**：CLI 一次性前端（`runGovernSession`）在其单轮 settle 之后是否
   *  **显式提议收口**（调 `handle.finalize()`）。缺省 `false`——仅当「本次 `ans govern` 的单位就是一次
   *  有界 bootstrap」时由调用方显式置真。**T37 起 `finalize()` 的语义 = 提议收口、挂起等客户确认**——
   *  确认通道不可用/超时/拒绝则**不完成**（fail-closed，见 `finalize.ts`）。多轮消费者（桌面 su 聊天）
   *  应直接调 `handle.finalize()`。 */
  finalizeBootstrap?: boolean;
  /**
   * **客户确认通道（T37）**：finalize 提议收口时，经它挂起问客户。**复用 shell 闸 (a) 的
   * `OperatorChannelFn` 形状、不造第二套**。缺省：CLI 前端用 `createCliOperatorChannel()`（终端读一行）；
   * 桌面由桌面应用注入对话框通道。缺省且无人值守（stdin EOF）→ `unavailable` → **不完成**。
   */
  operatorChannel?: OperatorChannelFn;
  /** 客户确认硬超时（毫秒）；缺省 120000。**超时 = 不完成**。 */
  confirmTimeoutMs?: number;
  /**
   * **自动重 pin（T37，§13.3）**：每轮 su 会话 settle 后，若项目处于**非创世态**（`.ans/project.json`
   * 已存在），自动重扫边界 → 更新 `.ans` 的 pin + manifest（**不重写治理边界文档**）。缺省 `true`
   * ——本引擎即 su 治理会话引擎，重 pin 是其固有职责。创世态为 **no-op**（首次 pin 只在客户确认时写）。
   */
  autoRepin?: boolean;
}

/** 治理会话句柄（**唯一引擎**的产物；两前端只驱动它，不各自实现装配）。 */
export interface GovernanceSessionHandle {
  /** 治理角色 id（经 `listProject` 枚举，非硬编码）。 */
  governanceRoleId: string;
  /** 边界来源（项目治理边界，或冷启动创世种子）。 */
  boundarySource: string;
  /** 生效的 acceptance 证据（供前端如实呈现）。 */
  acceptance: Acceptance;
  /** 本次会话的 scope（按治理边界条件目录给出）；**创世（普通目录边界）无目标角色时为 `undefined`**
   *  （设计 §12.2：普通聊天，不做 F4 收窄——否则空 writeSet 的既有语义是「拒一切」）。 */
  scope: TaskScope | undefined;
  /** 目标项目目录（透传自输入；缺省 undefined = 装配默认 ans-cli 自身）。 */
  targetDir?: string;
  /** 会话是否已 settle 过**至少一轮**（su 已完成至少一轮）。`finalize()` 的前置守卫据它判定
   *  「su 是否已经写过东西」，避免 pin 半成品。 */
  readonly settled: boolean;
  /** 发送一轮输入；可反复调用（同一会话，不重建）。 */
  send(text: string): Promise<void>;
  /** 持续的事件流（含 settle 时的 handback 事件）；跨多轮累积。消费到 `settled` 会置 `settled=true`。 */
  events(): AsyncIterable<OrchestrationEvent>;
  /**
   * **收口（T37，设计 §13.1）**：**提议收口 → 挂起等客户确认 → 确认通过才落盘**（**不再「被调用即完成」**）。
   *   · 守卫：**非创世态**（`.ans` 已存在）→ 拒绝；会话**尚未 settle** → 拒绝（防 pin 半成品）；
   *     **无可 pin 之物** / 门禁拒 → 拒绝（零副作用）。
   *   · 确认通道：**复用 shell 闸 (a) 的 `OperatorChannelFn`**（不造第二套）；不可用/超时/拒绝 → **不完成**。
   *   · 确认通过 → 写 **`角色卡/governance-boundary.yaml`（三普通目录）** + `.ans`（pin+acceptance）+ manifest；
   *     写入**同样经 `resolveWrite`**（见 finalize.ts），被拒则整批中止、零副作用——**不是凭代码身份绕门**。
   * 返回 `FinalizeResult`（`status`/`message` 如实反馈；`ok===status==="completed"`）。
   */
  finalize(opts?: { acceptanceSource?: string; now?: () => Date }): Promise<FinalizeResult>;
  /** 收口：释放底层会话（幂等）；出错如实抛出。 */
  dispose(): Promise<void>;
}

export interface GovernSessionResult {
  code: number;
  transcript: SessionEvent[];
  /** 目标项目目录（透传；供 CLI 前端/测试如实观察「目标目录经 deps 传递」）。 */
  targetDir?: string;
  /** 创世 finalize 的结果（仅当 `GovernSessionInput.finalizeBootstrap===true` 时存在）。 */
  finalize?: FinalizeResult;
}

/**
 * **唯一的治理会话引擎**（设计 §10.5）：CLI 与桌面**都经此**开启治理会话。失败即**抛错**
 * （句柄式接口无退出码）——CLI 前端（`runGovernSession`）捕获后以非 0 码返回。
 */
export async function openGovernanceSession(
  input: GovernSessionInput,
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
): Promise<GovernanceSessionHandle> {
  // 1) 发现内置治理角色：数据驱动（同桌面应用），**不硬编码** "su"。
  const govId = input.governanceRoleId ?? (await discoverGovernanceRoleId(input.project));

  // 2) 解析**项目治理边界**（对不在 project.roles 的治理角色，resolveBoundarySection 走 gov.path）。
  const resolved = await resolveRole(govId, input.project);
  const boundary: BoundarySection1 = resolved.boundary;
  // 边界解析失败 / pin 失配（parseError 非空）→ 整体失败（对齐 §5.2「改边界致 pin 失配 → 拒一切写」）。
  if (typeof boundary.parseError === "string" && boundary.parseError !== "") {
    throw new Error(`治理边界解析失败：${boundary.parseError}`);
  }

  // 3) scope：按治理边界的条件目录给出可写集（见文件头「为何给精确文件」）。
  const roleIds = input.targetRoleIds ?? [];
  const scope = buildGovernScope(boundary, roleIds);
  // §12.2：**普通目录边界（创世种子）在无目标角色时，scope 应为 `undefined`**（普通聊天、不做 F4 收窄）。
  // 若照旧传 `{writeSet:[], conditions:[]}`，F4 会「空 writeSet = 拒一切」→ su 一个字也写不了
  // （与 §12.2「su 的 scope 保持 undefined」相悖）。此收窄**只**在 `conditions` 与 `writeSet` 均空时生效，
  // 不会放宽任何既有 project-mode（含条件目录 / 有目标角色）的判定。
  const effectiveScope: TaskScope | undefined =
    scope.conditions.length === 0 && scope.writeSet.length === 0 ? undefined : scope;

  // 4) 经会话式入口开启内置治理角色（builtInRoles 数据来自枚举；不硬编码 id）。
  //    `autoRepin`（T37，§13.3）：透传给会话式入口——**每轮 su settle 后**若项目已 bootstrap（非创世态）
  //    则自动重 pin（判据/写入都在 `openRoleSession` 一处，两前端共用；未显式给则按其缺省 = su 会话开启）。
  const sessionProject = withGovernanceRole(input.project, govId);
  const handle = await openRoleSession(
    {
      roleId: govId,
      project: sessionProject,
      taskId: input.taskId,
      scope: effectiveScope,
      autoRepin: input.autoRepin,
    },
    deps,
  );

  // settle 追踪（finalize 前置守卫据它判「su 是否已完成至少一轮」）。
  let settledOnce = false;

  // finalize 的授权边界 = 本次会话解析出的边界（创世种子 / 项目治理边界）——与 su 同一授权。
  // 治理边界文档落点：项目未声明（`path` 为空串，如桌面创世项目）时用默认约定路径（`||` 而非 `??`——
  // 空串在此无意义，会把落点错误解析为项目根，导致漏 pin 治理边界文档）。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;
  // 会话侧 finalize 能力（**唯一实现**：`createSessionFinalizer`）——与桌面路径 `openRoleSession` 共用同一份。
  // T37：`finalize()` = **提议收口 → 挂起等客户确认 → 通过才落盘**；确认经注入的 `operatorChannel`（复用
  // shell 闸 (a) 通道）。缺省通道由前端（`runGovernSession`）补 CLI 实现；不可用/超时/拒绝 → 不完成。
  const finalizer = createSessionFinalizer({
    input: {
      projectRoot: input.project.projectRoot,
      skillRoot: input.project.skillRoot,
      boundary,
      governanceBoundaryPath: govPath,
    },
    isSettled: () => settledOnce,
    operatorChannel: input.operatorChannel,
    confirmTimeoutMs: input.confirmTimeoutMs,
  });

  return {
    governanceRoleId: govId,
    boundarySource: resolved.boundarySource,
    acceptance: boundary.acceptance,
    scope: effectiveScope,
    targetDir: input.targetDir,
    get settled(): boolean {
      return finalizer.settled;
    },
    send: (text) => handle.send(text),
    events(): AsyncIterable<OrchestrationEvent> {
      const inner = handle.events();
      return (async function* () {
        for await (const ev of inner) {
          if (ev.kind === "settled") settledOnce = true;
          yield ev;
        }
      })();
    },
    finalize: (opts) => finalizer.finalize(opts),
    dispose: () => handle.dispose(),
  };
}

/** 发现内置治理角色 id：经门禁引擎 `listProject` 枚举，非硬编码。 */
async function discoverGovernanceRoleId(project: ProjectConfig): Promise<string> {
  const listing = await listProject(project.projectRoot);
  const gov = listing.roles.find((r) => r.builtIn === true);
  if (!gov) {
    throw new Error(`未发现内置治理角色（listProject 未枚举到 builtIn 角色）；项目根：${project.projectRoot}`);
  }
  return gov.roleId;
}

/**
 * CLI 一次性前端（保留既有形状）：开启治理会话 → 记录元信息 → 发一轮 → 以 `settled` 收口 → dispose。
 * **装配/驱动逻辑全部在 `openGovernanceSession`**；本函数只是它之上的一层「跑一轮」的壳。
 */
export async function runGovernSession(
  input: GovernSessionInput,
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
): Promise<GovernSessionResult> {
  const transcript: SessionEvent[] = [];
  const record = (ev: OrchestrationEvent): void => {
    // 治理角色（su）不自我回交（回交主体是**其他角色**）；防御性忽略。
    if (ev.kind === "handback") return;
    transcript.push(ev);
    console.log(formatEvent(ev));
  };
  const fail = (code: number, reason: string): GovernSessionResult => {
    process.stderr.write(`ans govern 失败：${reason}\n`);
    transcript.push({ kind: "message", summary: `失败：${reason}` });
    return { code, transcript, targetDir: input.targetDir };
  };

  // CLI 端默认客户确认通道（T37）：终端打印「su 提议收口」并读一行 y/n。**仅在未注入时**补——桌面/测试
  // 注入自己的通道。惰性 attach stdin（仅真被调用时）；无人值守（EOF）→ unavailable → 不完成（fail-closed）。
  const effectiveInput: GovernSessionInput =
    input.operatorChannel !== undefined ? input : { ...input, operatorChannel: createCliOperatorChannel() };

  // 开启引擎（发现治理角色 / 解析边界，失败即抛错 → 非 0）。
  let handle: GovernanceSessionHandle;
  try {
    handle = await openGovernanceSession(effectiveInput, deps);
  } catch (err) {
    return fail(EXIT_FAILURE, errText(err));
  }

  // 元信息（成功开启后如实记录）。targetDir 给出时如实标注目标项目目录（设计 §12.3）。
  record({
    kind: "message",
    summary:
      `治理会话：内置治理角色 ${handle.governanceRoleId}，边界来源 ${handle.boundarySource}；acceptance=${
        handle.acceptance.accepted ? "accepted" : "rejected"
      }（来源：${handle.acceptance.source || "缺"}）` +
      (handle.targetDir ? `；目标目录 ${handle.targetDir}` : ""),
  });
  const roleIds = input.targetRoleIds ?? [];
  record({
    kind: "message",
    summary: handle.scope
      ? `治理边界条件目录已声明：conditions=[${handle.scope.conditions.join(", ")}]；` +
        `可写集 ${handle.scope.writeSet.length} 项` +
        (roleIds.length > 0 ? `（目标角色：${roleIds.join("、")}）` : "（未指定 --role：无可写文件，仅按边界只读）")
      : "未声明 scope（创世/普通目录边界：仅按边界，不做任务收窄）",
  });

  let code: number = EXIT_OK;
  let finalizeResult: FinalizeResult | undefined;
  try {
    await handle.send(input.prompt ?? buildGovernPrompt(input.taskId, roleIds, handle.scope === undefined));
    for await (const ev of handle.events()) {
      record(ev);
      if (ev.kind === "settled") break; // settled 为终止信号（避免与随后 dispose 互等）
    }
    // 收口（T37）：**仅当显式开启**（`finalizeBootstrap`）——本前端的单位是「一次有界治理任务」，单轮
    // settle 即其完成点。**T37 起 `finalize()` = 提议收口、挂起等客户确认**（经 CLI 确认通道读一行）；
    // 确认未通过（拒绝/超时/通道不可用）→ **不完成**（fail-closed），如实记录原因、以非 0 收口。
    if (input.finalizeBootstrap) {
      finalizeResult = await handle.finalize();
      const feedback = finalizeResult.message ?? finalizeResult.reason ?? "未知原因";
      record({
        kind: "message",
        summary: finalizeResult.ok
          ? `收口完成：写出 ${finalizeResult.wrote.join("、")}（pin ${finalizeResult.pins.length} 条，角色 ${finalizeResult.roles.length}）`
          : `收口未完成（${finalizeResult.status ?? "unknown"}）：${feedback}`,
      });
      if (!finalizeResult.ok) {
        process.stderr.write(`ans govern · 收口未完成：${feedback}\n`);
        code = EXIT_FAILURE;
      }
    }
  } catch (err) {
    code = EXIT_FAILURE;
    process.stderr.write(`ans govern 会话失败：${errText(err)}\n`);
    transcript.push({ kind: "message", summary: `会话异常：${errText(err)}` });
  } finally {
    try {
      await handle.dispose();
    } catch (err) {
      process.stderr.write(`ans govern 释放会话失败：${errText(err)}\n`);
      transcript.push({ kind: "message", summary: `释放会话失败：${errText(err)}` });
      if (code === EXIT_OK) code = EXIT_FAILURE;
    }
  }

  return { code, transcript, targetDir: handle.targetDir, finalize: finalizeResult };
}

/**
 * 由治理边界与目标角色构造 scope：
 *  - conditions = 边界里所有 conditional-directory 的 slug（激活治理区域；缺 slug 的条目跳过，fail-closed）；
 *  - writeSet   = 每个目标角色在 `角色卡/<id>/` 下的标准文件（F4 为精确匹配，故须枚举具体文件）。
 */
export function buildGovernScope(boundary: BoundarySection1, roleIds: string[]): TaskScope {
  const conditions = boundary.entries
    .filter((e) => e.kind === "conditional-directory" && typeof e.condition === "string")
    .map((e) => e.condition as string);
  const writeSet = roleIds.flatMap((id) => ROLE_SCAFFOLD_FILES.map((f) => `${ROLE_CARD_DIR}/${id}/${f}`));
  return { writeSet, conditions };
}

/** 派生配置：把治理角色 id 并入 builtInRoles（会话式入口据此允许开启它；id 来自枚举，非硬编码）。 */
function withGovernanceRole(project: ProjectConfig, govId: string): ProjectConfig {
  const builtInRoles = [...new Set([...(project.builtInRoles ?? []), govId])];
  return { ...project, builtInRoles };
}

/** 默认任务提示：给出明确、可判定的变更要求（在治理边界内创建目标角色）。
 *  `canWrite`：本次会话是否**真能写**（`scope` 未声明 = 创世/普通目录边界，命中治理产物目录即放行）。
 *  创世下 su 需**据对话决定**建哪些角色，故给出「可直接写治理产物」的指引——**不**误报「不写盘」。 */
function buildGovernPrompt(taskId: string, roleIds: string[], canWrite: boolean): string {
  const head =
    `任务 ${taskId}：以治理身份在**项目治理边界**内工作。` +
    "越出治理边界（`角色卡/`、`docs/`、`.ans/` 之外，如项目的 `src/`，或项目根以外）的写入会在写入之前被门禁拒绝。";
  if (roleIds.length === 0) {
    return canWrite
      ? head +
          "\n未指定目标角色：请**据对话决定要建哪些角色**，并**直接用 write_file 写出**治理产物——" +
          "`角色卡/<角色>/role-card.md`、`角色卡/<角色>/boundary.yaml`、`角色卡/<角色>/memo.md`，" +
          "以及项目治理边界文档 `角色卡/governance-boundary.yaml`。这些路径均在治理边界内、可直接写；越界写会被拒。"
      : head + "\n本次未指定目标角色（--role）：可写集为空，会话只做调查/规划，不写盘。";
  }
  const targets = roleIds.map((id) => `角色卡/${id}/（role-card.md / boundary.yaml / memo.md）`).join("；");
  return (
    `${head}\n具体改动要求：请为角色 ${roleIds.join("、")} 用 write_file 建出标准骨架文件：${targets}。` +
    "（这些路径在治理边界内且已列入可写集；越界或可写集外的写入会被拒。）"
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
