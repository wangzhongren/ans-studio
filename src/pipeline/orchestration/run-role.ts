// src/pipeline/orchestration/run-role.ts
// 编排层：角色会话的编排。
//
// 两条路径：
//  1) runRole —— **一次性**路径：解析 → 建 gate → 建 adapter → bindRole → prompt 一轮 → 收事件。
//     CLI `ans role run` 用它。
//  2) openRoleSession —— **会话句柄式**多轮路径：底层只建**一个** RoleSession，send() 可反复调，
//     事件流持续，生命周期由调用方 dispose() 收口。桌面应用的聊天栏用它。
//
// 分工（契约 §5，F9）：本层只做编排——角色解析、边界解析、路径判定全部经门禁引擎导出的函数；
// 运行时工具与 SDK 调用经 Service 的中立 RuntimeAdapter 接线。
//
// ── 客户确认制收窄（A-3，2026-10-12 设计 A 组）────────────────────────────────────
// `openRoleSession` 收到 `customerInput`（前端给的客户通道）时，本会话进入**确认制**：
//   · 客户被 `request_confirmation` 预览并确认后，编排把「**已预览且校验在会话边界内**的具体路径」
//     发行进本会话的 writeSet（`common/编排/confirmed-writes.ts`）；
//   · 写入照旧经 gate——**F4 拒掉一切未确认路径**（writeSet 外 = 拒）。
//   · 通道**不可用/拒绝/未确认** → 不发行 → 该路径写入被拒（fail-closed）。
//   · **例外（客户裁定 2026-10-16）**：内置治理角色（su）的**初始** writeSet 恒含 `docs/su/**`、
//     `docs/contracts/**`、`docs/skills/**` 与 `docs/mcp/**`（预授权写目录，不经发行器、随会话初始化
//     计算；见 scopeWithBuiltInPreauthorization）——对其余一切路径以上四条逐字适用。
// 【已登记的残余漏洞：内容漂移】本机制只保证「**路径**已预览且已确认」；「预览内容 ≠ 写出内容」
// 关不住（O-A1 内容比对经客户 2026-10-12 裁定不采纳——如实登记，不实现）。
// 未给 `customerInput` 的会话（无客户通道）保持旧语义：scope 原样传递（可为 undefined = 不收窄）。
//
// ── A-4（同日晚）：收口删除 ─────────────────────────────────────────────────────
// `genesisFinalize`/`operatorChannel`/句柄 `finalize()` 已删——「提议+确认」不再存在；写出的产物由
// **自动收尾**（每轮 su settle 后 `repinIfBootstrapped`，含首次）完成，确认发生在写入**之前**（上节）。
//
// 退出码约定（见 ../../common/编排/exit-codes.ts）：0 = 成功，非 0 = 失败。runRole 以码返回失败；
// openRoleSession 无退出码，失败即**抛错**给调用方。
//
// scope 可选（客户端裁决）：scope === undefined 表示"没有预先存在的任务"（chat / 一次性无收窄），
// 此时**不做任务级收窄**，只用角色边界；编排把 undefined 原样传给 resolveWrite，绝不伪造全量 writeSet。
// （确认制会话例外：其 writeSet 由发行器动态持有，见上。）

import type { GovernanceFunction, ProjectConfig, ResolvedRole } from "../../model/role.ts";
import type { TaskScope, WriteDecision } from "../../model/decision.ts";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveRole } from "../../service/role/resolve-role.ts";
import { resolveBoundary } from "../../service/boundary/resolve-boundary.ts";
import {
  LEGACY_SU_PREAUTHORIZED_DIRS,
  appGovernanceBoundary,
  governanceCapabilitiesOf,
  governanceRoleOf,
  type BuiltInGovernanceRoleSpec,
} from "../../service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
import type {
  RuntimeReplayEntry,
  RuntimeSessionRecord,
  RuntimeContextSource,
  RuntimeKind,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
  ShellGate,
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceCardKind,
  DispatchTaskFn,
  DispatchTaskPayload,
  HandOffIntentFn,
  RequestClarificationFn,
  RoleStatusFn,
  SessionTailFn,
  ProposeRecoveryFn,
  InstallSkillFn,
  UninstallSkillFn,
  InstallMcpFn,
  UninstallMcpFn,
  OperatorChannelFn,
  PromptOptions,
  PromptTurnStartedMetadata,
  ReportHandbackFn,
  ReportHandbackMetadata,
  ReportHandbackReceipt,
  ReportSaveResultV1,
  ReportSaveStateV1,
  DeliverySaveResultV1,
  DeliveryReceiptQueryV1,
  RuntimePersistenceChangeV1,
  RuntimeLiveReportDraftV1,
  RuntimeLegacyHistoryEntryV1,
  RuntimeLegacyHistoryProjectionV1,
  ShellJudgeToolOptions,
} from "../../model/runtime.ts";
import { createRuntimeAdapter, projectRuntimeLiveHandback, projectRuntimeLegacyHistory, type RuntimeSessionOptions } from "../../service/runtime/session.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import {
  assembleProjectShellGate,
  assembleReadonlyShellGate,
  assembleOperatorShellGate,
  type AssembleShellGateOptions,
  type AssembleReadonlyShellGateOptions,
  type AssembleOperatorShellGateOptions,
  type RoutineShellPolicy,
} from "./shell-arming.ts";
import { formatEvent } from "../../common/编排/output.ts";
import { withHandback, type OrchestrationEvent, type TaskReport, type HandbackIntent, type HandbackEvent, normalizeTaskReport } from "../../common/编排/handback.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../common/编排/exit-codes.ts";
import type { ShellVerdictFn } from "../../common/编排/shell-gate.ts";
import { repinIfBootstrapped, DEFAULT_GOVERNANCE_BOUNDARY_REL } from "../../common/编排/finalize.ts";
import { conditionSlugsOf, createConfirmedWriteIssuer } from "../../common/编排/confirmed-writes.ts";
import {
  appendGovernanceLedger,
  readGovernanceLedger,
  type GovernanceDecisionKind,
  type GovernanceLedgerEntry,
  type GovernanceLedgerSnapshot,
} from "../../common/编排/governance-ledger.ts";
import { evaluateGovernanceGate, type GovernanceGateAction } from "../../common/编排/governance-gate.ts";
import {
  CLARIFICATION_MAX_ROUNDS,
  countClarificationRounds,
  validateIntentHandoff,
} from "../../common/编排/governance-handoff.ts";
import { CLI_POSITIONING } from "../../common/编排/cli-positioning.ts";
import { createDiagnosticLogger } from "../../common/shared/diagnostics.ts";
// 跨角色共享路径原语（**单一来源** = pm 属主 `src/common/shared/path-primitives.ts`；工程法案 §一.5
// 消费方名单已含编排；同 `confirmed-writes.ts` 先例）——用于 su 预授权目录的**词法**归属判定：
// 与 resolveWrite 同源取值规则，不从门禁引擎私有 common 另行导入/复制。
import { absRel, isAbsoluteAny, isUnderOrEqual, normalizeLexical } from "../../common/shared/path-primitives.ts";

/**
 * **适配器能力面**：编排构造、随 `deps.createAdapter(gate, capabilities)` 交给适配器工厂——
 * 适配器把其中的能力注册为对应工具（「注入才注册」先例），或按其选项接线。三项：
 * · `customerInput`（A-3 客户确认制交互；未注入 ⇒ `request_confirmation`/`request_choice` 不注册）。
 * · `reportHandback`（C-1 交报告；未注入 ⇒ `submit_report` 不注册）——**只给项目角色会话**注入
 *   （治理角色 su 不自我回交，不注入）。能力形状 = `submit_report{ status, summary, evidence? }`
 *   的载荷（结构对齐，见 `common/编排/handback.ts::TaskReport`）。
 * · `sessionDir`（D-1 重启恢复）：本会话的**会话自持目录**，约定路径
 *   `<projectRoot>/.ans/sessions/<roleId>/<runtime>/`（带尾分隔符；旧未显式 runtime 的替身保留旧路径）。**编排只算路径、不预建目录**——
 *   **目录的创建归适配器**（在其真正落盘 SessionManager.create/open 时做）：① 保「不预建 `.ans`」
 *   的既有语义/断言（每次 `ans govern` 都预建 `.ans/sessions/` 会打破它）；② 谁落盘谁建目录，
 *   避免「编排建了目录但会话从未写」的空目录；③ 恢复 `open(path)` 不需要预建。
 *   projectRoot 为空 / roleId 不安全（空、含路径分隔符或 `..`）→ **不传**（旧行为，无持久化）。
 *   注：一次性路径 `runRole`（`ans role run`）不传（一局即止，无需恢复）。
 * · `dispatchTask`（H-1 su 派发任务；未注入 ⇒ `dispatch_task` 不注册）——**只给治理角色 su**注入
 *   （项目角色不给）。形状 = 契约家 `DispatchTaskFn`（前端路由：开/排队/去重/失败保留归前端；
 *   **派发 ≠ 授权**——能力实现方不得据此授予任何写权）。
 * · `handOffIntent` / `requestClarification`（W6-A 意图交接/澄清；未注入 ⇒ 对应工具不注册）——
 *   **只给** Liaison / Rapporteur（能力矩阵 `handOffIntent`/`requestClarification`）。编排先做文件/
 *   去重/每轮一次/两轮澄清上限与账本；能力实现方只负责投递/呈现。**交接 ≠ 客户批准；澄清 ≠ 客户已回答**。
 * · `shellGate`（I-1 开放 shell + su 审批档/只读档；未注入 ⇒ `run_shell` 不注册）——**项目角色**经三层链注入
 *   （`openRoleSession` 收到 `shellOperatorChannel` 时经 `assembleProjectShellGate` 装配）；**su** 经
 *   **审批档**（`shellOperatorOnly`，客户裁定 2026-10-17：只读白名单免审批、其余含 deny 逐条客户批准；
 *   经 `assembleOperatorShellGate` 装配）或**只读档**（`shellReadonly`，旧路径）注入。
 *   比工厂第二参优先（`capabilities?.shellGate ?? shellGate`）。
 * · `shellVerdict`（R-1 shell 审读结论工具；未注入 ⇒ `report_shell_verdict` 不注册）——**审读会话专用**
 *   （由 `pm-reviewer` 注入；形状单一来源 `common/编排/shell-gate.ts`）。
 * · `roleStatus` / `sessionTail` / `proposeRecovery`（G-2 看护三工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用内置治理角色先例 `suppressHandback`，同 `dispatchTask`）。
 *   载荷/回执形状的单一来源＝契约家 `model/runtime.ts`（R1/R2 属主，同 `DispatchTaskFn` 先例；
 *   文案契约在 `common/编排/watchdog.ts`）。**提议 ≠ 执行**：三能力不得授予或改变任何写权；
 *   `role_status`/`session_tail` 纯读。
 * · `installSkill` / `uninstallSkill`（G-4 I1/I2 技能安装两工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用 `suppressHandback`，同 `dispatchTask`/看护三能力）。
 *   形状单一来源＝契约家 `model/runtime.ts`（`InstallSkillFn`/`UninstallSkillFn`/`InstallSkillReceipt`）。
 *   **安装 ≠ 授权**：工具自己不写盘，能力只做校验/激活/回执；不得据此授予或改变任何写权。
 * · `installMcp` / `uninstallMcp`（G-4 V2 MCP 安装两工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用 `suppressHandback`，同技能两能力）。
 *   形状单一来源＝契约家 `model/runtime.ts`（`InstallMcpFn`/`UninstallMcpFn`/`InstallMcpReceipt`）。
 *   **能力级授予诚实面**：外来 MCP 工具在 ANS 门禁之外执行——回执/文案不得宣称逐调用受审；
 *   **安装 ≠ 授权**：工具自己不写盘，能力只做校验/激活/回执；不得据此授予或改变任何写权。
 */
export interface AdapterCapabilities {
  customerInput?: CustomerInputFn;
  reportHandback?: ReportHandbackFn;
  sessionDir?: string;
  runtime?: RuntimeKind;
  persistSession?: boolean;
  dispatchTask?: DispatchTaskFn;
  /**
   * W6-A：`hand_off_intent` 能力（四角色评审 §5.1/§5.2）。**只给联络官 Liaison**（能力矩阵
   * `handOffIntent`）；本编排层已在校验/去重/每轮一次/账本成功后才调到这里——本字段是**投递端**
   * （桌面窗口：后台开 Rapporteur、`sendBackground`、系统行；`dispatch.accepted{trigger:"intent-handoff"}`
   * 由投递端写）。未注入 ⇒ 工具不注册（结构性 fail-closed）。**交接 ≠ 客户批准**。
   */
  handOffIntent?: HandOffIntentFn;
  /**
   * W6-A：`request_clarification` 能力（四角色评审 §5.4）。**只给报告员 Rapporteur**（能力矩阵
   * `requestClarification`）；本编排层已做两轮上限判定并写 `clarification.requested`，本字段负责把
   * 问题送到主入口（桌面窗口：系统行；若其实现经客户通道发问，答案可随回执 message 返回）。
   * 未注入 ⇒ 工具不注册（结构性 fail-closed）。**澄清 ≠ 客户已回答，不弹决定卡**。
   */
  requestClarification?: RequestClarificationFn;
  shellGate?: ShellGate;
  shellVerdict?: ShellVerdictFn;
  roleStatus?: RoleStatusFn;
  sessionTail?: SessionTailFn;
  proposeRecovery?: ProposeRecoveryFn;
  installSkill?: InstallSkillFn;
  uninstallSkill?: UninstallSkillFn;
  installMcp?: InstallMcpFn;
  uninstallMcp?: UninstallMcpFn;
  /**
   * 判断 agent（「替我审」）只读能力（2026-10-17 PM 评审 §6.1/§6.3）。**能力注入，不是工具注入**：
   * 给出时运行时核心走 `buildShellJudgeTools`（恰 `judge_read_file`/`judge_list_dir`/
   * `report_shell_judgement`），**不得**走 `buildGovernedTools`；`judgeMode:true` 与
   * `installedMcpServers:[]` 由 Service 自动置位。形状单一来源＝`model/runtime.ts`。
   * 只由编排的 `createShellJudge` 经 `createAdapter(gate, {persistSession:false, shellJudge})` 注入；
   * 普通角色会话不传（未注入 ⇒ 工具不注册）。
   */
  shellJudge?: ShellJudgeToolOptions;
}

export interface RunRoleInput {
  roleId: string;
  runtime?: RuntimeKind;
  taskId: string;
  project: ProjectConfig;
  scope?: TaskScope;
}

export interface RunRoleResult {
  code: number;
  transcript: SessionEvent[];
}

export async function runRole(
  input: RunRoleInput,
  deps: RoleSessionDeps = {}
): Promise<RunRoleResult> {
  const transcript: SessionEvent[] = [];
  const record = (ev: SessionEvent): void => {
    transcript.push(ev);
    console.log(formatEvent(ev));
  };
  // 失败路径统一出口：写 stderr（可读原因）+ 记入 transcript，返回非 0 码。
  // 注：SessionEvent.kind 是契约 §4 冻结联合（无 "error"），故 transcript 里用 "message" 承载失败说明。
  const fail = (code: number, reason: string): RunRoleResult => {
    process.stderr.write(`ans role run 失败：${reason}\n`);
    transcript.push({ kind: "message", summary: `失败：${reason}` });
    return { code, transcript };
  };

  // 角色/边界解析（未知角色、parseError 等失败由 setupRole 归类）。
  // 一次性 CLI 路径：**不允许**内置治理角色——只接受 project.roles 登记的项目角色。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: false });
  if (!setup.ok) return fail(setup.code, setup.reason);
  const role = setup.role;

  // gate：照抄契约 §5 的构造，绑定 resolveWrite；scope 可能为 undefined（无任务收窄）。
  const gate = buildGate(role, input.project, input.scope);

  record({
    kind: "message",
    summary: `已解析角色 ${role.id}（kind=${role.kind}），角色卡：${role.location.card}`,
  });
  record({
    kind: "message",
    summary: `已解析边界，来源：${role.boundary.boundarySource}；acceptance=${
      role.boundary.acceptance.accepted ? "accepted" : "rejected"
    }（来源：${role.boundary.acceptance.source || "缺"}）`,
  });
  record({
    kind: "message",
    summary:
      `受治理工具集已建立：write_file / edit_file 在写入前经 gate 校验；任务 ${input.taskId} ` +
      (input.scope ? `写集 ${input.scope.writeSet.length} 项` : "未声明 scope（仅按角色边界，不做任务收窄）"),
  });
  // P1-4 产品定位指路（桌面体验提案，2026-10-13 客户批准）：一次性 CLI 会话启动时如实告知能力面——
  // 轻量一行、每次会话至多一次；不改变任何能力与判定（shell 本就不 arm、会话本就不持久）。
  // 句子的单一来源见 common/编排/cli-positioning.ts（帮助输出共用同一句，防漂移）。
  record({ kind: "message", summary: CLI_POSITIONING });

  let code: number = EXIT_OK;
  let session: RoleSession | undefined;
  try {
    const createAdapter = deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "demo", deps.runtimeOptions);
    const adapter = createAdapter(gate);
    session = await adapter.bindRole(role);
    await session.prompt(buildTaskPrompt(input.taskId, input.scope));
    // 事件流以 "settled" 为**终止信号**：见到即停并退出循环。
    // 关键：真实 Pi 适配器的 events() 只有在 dispose() 时才 close 队列；若在此等到流自然结束，
    // 会与随后的 dispose() 互等（死锁）——那样 main() 永不 resolve（顶层 await 不收敛）。
    for await (const ev of session.events()) {
      record(ev);
      if (ev.kind === "settled") {
        if (isFailedSettlement(ev)) code = EXIT_FAILURE;
        break;
      }
    }
  } catch (err) {
    // 会话建立（bindRole）或会话中途出错 → 非 0。
    code = EXIT_FAILURE;
    process.stderr.write(`ans role run 会话失败：${errText(err)}\n`);
    transcript.push({ kind: "message", summary: `会话异常：${errText(err)}` });
  } finally {
    // 无论成功、失败还是异常，都必须释放会话（try/finally 保证）。
    if (session) {
      try {
        await session.dispose();
      } catch (err) {
        // dispose 出错**如实报**，但不掩盖原始结果：仅在原本成功时把结果翻成失败。
        process.stderr.write(`ans role run 释放会话失败：${errText(err)}\n`);
        transcript.push({ kind: "message", summary: `释放会话失败：${errText(err)}` });
        if (code === EXIT_OK) code = EXIT_FAILURE;
      }
    }
  }

  return { code, transcript };
}

// —————————————————————— 会话句柄式（多轮）接口 ——————————————————————
// 冻结签名（桌面应用照此编写）。

/**
 * `RoleSessionHandle.abort()` 的结果（产品提案 P0-2「停当前轮次」，2026-10-13 客户批准）。
 * 三态**语义钉死**：
 * - `{ ok:true, supported:true }` —— 已向底层会话请求停止当前轮次（轮次以 `settled` 正常收尾）；
 * - `{ ok:false, supported:false, error }` —— 底层会话**不带 abort**（如 demo 替身/假适配器）：
 *   **该运行时不支持停止**，`error` 承载如实文案「当前运行时不支持停止」——绝不假装已停；
 * - `{ ok:false, supported:true, error }` —— 底层会话有 abort 但 SDK 报错：错误原文（`errText`）
 *   如实放入 `error`，不吞、不谎报已停。
 * `error` 统一承载 `ok:false` 时给人看的如实原因；`supported` 告知「该运行时有没有停止能力」。
 */
export interface RoleSessionAbortResult {
  ok: boolean;
  supported: boolean;
  error?: string;
}

/**
 * **F-5-opt1 推荐注记文案**（2026-10-16 客户批准；会话因边界更新重建后写权清零的**如实告知**，
 * **单一来源**）——由重建路径（桌面窗口 O-1）经 `RoleSessionHandle.queueModelNotice` 排入模型可见输入。
 * 措辞要点：如实说明「重建」与「写权不自动保留」，指向**可行恢复路径**（`request_confirmation`）；
 * **不夹带任何授权语义**（不是授权、不承诺放行——写入仍须逐条确认后发行）。
 */
export const REBUILT_SESSION_WRITE_PERMITS_NOTICE =
  "会话已因边界更新重建；此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。";

/** Pipeline-only prompt intent; never forwarded as a Runtime option or write authorization. */
export interface RoleSessionSendOptions extends PromptOptions {
  handback?: HandbackIntent;
}

export interface RoleSessionHandle {
  readonly persistenceMode?: "enabled" | "disabled" | "unknown-live";
  retryReportPersistence?(reportId: string): Promise<ReportSaveResultV1>;
  getReportPersistence?(reportId: string): Promise<ReportSaveStateV1>;
  retryDeliveryHistoryPersistence?(attemptId: string): Promise<DeliverySaveResultV1>;
  getDeliveryReceipt?(attemptId: string): Promise<DeliveryReceiptQueryV1>;
  onPersistenceChange?(listener: (change: RuntimePersistenceChangeV1) => void): () => void;
  readonly runtime?: RuntimeKind;
  readonly roleId?: string;
  readonly contextSource?: RuntimeContextSource;
  readonly nativeSessionId?: string;
  readonly contextWarning?: string;
  /**
   * 发送一轮输入；可反复调用（底层同一会话，不重建）。
   * handback.required:true 标明任务，false 标明聊天并覆盖会话 taskId；缺省沿用明确的会话 taskId。
   * 真实运行时通过 Core 同步开轮 ACK 绑定本轮来源，组合并恰一次转达调用方的 ACK 回调。
   * handback 只由编排消费，不传给 Runtime；images 数组保持原引用。
   * 未标记且没有 ACK 的旧替身保留原 options 引用与单参数调用路径。
   */
  send(text: string, opts?: RoleSessionSendOptions): Promise<void>;
  /**
   * **停当前轮次（产品提案 P0-2「跑飞轮次的停」，2026-10-13 客户批准）**：向底层会话请求**中止当前
   * 进行中的 prompt 轮次**（模型生成与工具执行一并停）。契约来源 = `RoleSession.abort?`
   * （`src/model/runtime.ts`，**可选方法**；真适配器实现 = Pi SDK `session.abort()`，
   * 见 `src/common/pi-adapter/real-adapter.ts` 的 `makeRoleSession`）。
   *
   * **语义（钉死）**：
   * - **不销毁会话**——abort 后本句柄仍可继续 `send`（历史与模型上下文保留）；与 `dispose`（收口整只
   *   会话）不同；
   * - **无在飞轮次 = no-op**（底层不抛错、无副作用）；
   * - **中止后 `settled` 仍发射**——轮次以 `settled` 正常收尾，消费方不会挂起；
   * - **等待中的客户确认一并 fail-closed**（中止该轮 run 的 AbortSignal，交互工具按「未获同意」返回）；
   * - **三态如实返回**（形状见 `RoleSessionAbortResult`）：会话**不带 abort**（如 demo 替身）⇒
   *   `{ ok:false, supported:false, error:"当前运行时不支持停止" }`——**绝不假装已停**；SDK 报错 ⇒
   *   `{ ok:false, supported:true, error:<错误原文> }`——如实上抛为结果，不吞。
   * 桌面「停止」入口（何时出现按钮、点击后聊天流的如实一行）为**后环**（桌面环节）。
   *
   * **可选方法（契约演进，同契约 `RoleSession.abort?` 的「PromptOptions 先例」）**：既有替身
   * **不实现它也完全合法**；消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回
   * `supported:false` 同一处理：如实告知「当前运行时不支持停止」，绝不假装已停。
   * **`openRoleSession` 返回的句柄恒实现本方法**（三态结果即真实回答，缺席只出现在替身）。
   */
  abort?(): Promise<RoleSessionAbortResult>;
  /**
   * **F-5-opt1（编排侧）：向模型注入一行「如实注记」**（2026-10-16 客户批准；kanban-live D1——
   * 会话因边界更新**重建**后写权（已发行 writeSet）静默清零，模型上下文却被完整恢复 ⇒ 认知分叉）。
   * 语义**钉死**：
   * - 注记**排入下一次 `send()` 的输入前缀**（一行加换行分隔），**送达一次即消费**——不是用户消息、
   *   **不单独开轮**、不触任何工具与任何判定（判定与写权不受影响，纯粹是给模型的如实输入）；
   * - 该轮 `prompt` 失败且**未开轮（无 ACK）**时注记保留（下一轮重试仍带上）；开轮后失败则消费
   *   （输入已送出，重排会重复）；
   * - 推荐文本用 `REBUILT_SESSION_WRITE_PERMITS_NOTICE`（单一来源，防各写一份）。
   * **可选方法**（同 `abort?` 先例）：旧替身不实现亦完全合法；由宿主（桌面窗口 O-1 重建路径）在
   * 重建后对本会话句柄调用。**`openRoleSession` 返回的句柄恒实现本方法**。
   */
  queueModelNotice?(text: string): void;
  /**
   * 持续的事件流；跨多轮累积。产出 `OrchestrationEvent`（既有 `SessionEvent` + 编排在 `settled` 时
   * 追加的 `handback` 回交事件，设计 §10.8）——**治理角色（su）不自我回交**，故其会话只产出 SessionEvent。
   */
  events(): AsyncIterable<OrchestrationEvent>;
  /** 收口：释放底层会话。可重复调用（幂等）；出错如实抛出，不吞。 */
  dispose(): Promise<void>;
}

export async function openRoleSession(
  input: {
    roleId: string;
    runtime?: RuntimeKind;
    project: ProjectConfig;
    taskId?: string;
    scope?: TaskScope;
    /** 宿主按客户委托注入的本项目常规检查政策；项目角色三层链专用。 */
    routineShellPolicy?: RoutineShellPolicy;
    /**
     * **客户确认制交互通道（A-1/A-3）**：前端给的原始客户通道（CLI 终端 / 桌面交互卡）。
     * **给出** ⇒ 本会话进入**确认制收窄**：编排在此之上包一层「确认 → 发行 writeSet」的发行器
     * （`common/编排/confirmed-writes.ts`），并经 `deps.createAdapter(gate, {customerInput})` 注入适配器
     * ——`request_confirmation`/`request_choice` 两工具据此注册（「注入才注册」）。
     * **缺省** ⇒ 无客户通道：工具不注册、scope 原样传递（旧语义，逐字不变）。
     */
    customerInput?: CustomerInputFn;
    /**
     * **自动收尾 + 自动重 pin（§13.3 经 A-4 扩为含首次）**：每轮会话 settle 后自动调用
     * `repinIfBootstrapped`——创世态 = 首次收尾（写 `.ans` + 治理边界文档 + manifest；无可 pin 之物则
     * 零副作用）；非创世态 = 重扫并更新 `.ans` 的 pin + manifest。缺省：**内置治理角色（su）会话为
     * `true`，其余为 `false`**——收尾/重 pin 是 su 的固有职责，普通角色会话不做。
     */
    autoRepin?: boolean;
    /**
     * **su 派发任务的路由能力（H-1）**：前端提供的路由实现（把派发转成目标角色会话的一条输入；
     * 开/排队/去重/失败保留归前端）。**只对治理角色会话（su）转交**——项目角色会话即便给了也不注入
     * （`dispatch_task` 只给 su）；CLI 一次性前端无同等路由（设计已登记），不传即可（工具不注册）。
     * 校验（roleId 非本项目角色 / 指向 su 自身 → 如实回错）由该能力的实现方做，判定口径用
     * `common/编排/handback.ts::isDispatchableRoleId`（单一来源）；**派发 ≠ 授权**。
     */
    dispatchTask?: DispatchTaskFn;
    /**
     * **W6-A 意图交接的投递能力（`hand_off_intent`「注入才注册」）**：前端（桌面窗口）提供的实现——
     * 校验通过后把**一条**任务投给 Rapporteur（后台开/发、不打开/不切换、系统行、写
     * `dispatch.accepted{trigger:"intent-handoff"}`）。**只对联络官 Liaison 注入**（能力矩阵
     * `handOffIntent`；其余角色即使误给也不注入）；编排在此之上先做文件/去重/每轮一次校验并写
     * `intent.handed-off`。未给出 ⇒ 工具不注册。**交接不是客户批准**。
     */
    handOffIntent?: HandOffIntentFn;
    /**
     * **W6-A 澄清请求的送达能力（`request_clarification`「注入才注册」）**：前端（桌面窗口）提供的
     * 实现——把报告员的问题送到主入口（系统行；若其实现经客户通道发问，答案可随回执 message 返回）。
     * **只对报告员 Rapporteur 注入**（能力矩阵 `requestClarification`）；编排先读账本判两轮上限并写
     * `clarification.requested`。未给出 ⇒ 工具不注册。**澄清不弹决定卡、不改变任何权力/写权**。
     */
    requestClarification?: RequestClarificationFn;
    /**
     * **G-2 看护自查能力（R1；`role_status`「注入才注册」）**：前端提供的实现（主进程读同源快照＋
     * 诊断尾部 → 结构化文本）。**只对治理角色会话（su）转交**（判据同 `dispatchTask`）；形状单一来源
     * ＝契约家 `model/runtime.ts`（R1 属主；文案契约在 `common/编排/watchdog.ts`）。**纯读**：不写盘、
     * 不入队、不改 busy、不动任何判定链；不扩大任何写权。
     */
    roleStatus?: RoleStatusFn;
    /**
     * **G-2 会话巡检能力（R1；`session_tail`「注入才注册」）**——**只给 su**（同上一判据）。
     * 复用受保护投影管线返回尾部规范化行（凭据清洗/display 保护已在链上）；失败如实（不抛、不猜）。
     */
    sessionTail?: SessionTailFn;
    /**
     * **G-2 恢复提议能力（R2；`propose_recovery`「注入才注册」）**——**只给 su**（同上一判据）。
     * 前端路由：校验（角色/枚举/证据非空）→ 客户一键确认卡 →（**恰 allow:true 才**）执行既有动作
     * → 回执四值如实（executed/declined/unsupported/error；恰 executed 为已执行）。**su 只能提议**：
     * 无确认 ＝ 不执行；能力实现方不得据此授予任何写权。
     */
    proposeRecovery?: ProposeRecoveryFn;
    /**
     * **G-4 技能安装能力（I1/I2 工具 `install_skill`「注入才注册」）**——**只对治理角色会话（su）
     * 转交**（判据复用 `suppressHandback`，同 `dispatchTask`/看护三能力）；项目角色会话即便调用方
     * 误给也不注入（工具不注册）。形状单一来源＝契约家 `model/runtime.ts`（`InstallSkillFn`/
     * `InstallSkillReceipt`）。**工具自己不写盘**：能力只做校验（角色/登记/含角色）→ 激活（重建；
     * 在跑不打断 ⇒ `next-session`）→ 三态回执。**安装 ≠ 授权**：不得据此授予任何写权（技能是必读
     * 资料，不是边界；安装不改变任何角色的边界与写权）。
     */
    installSkill?: InstallSkillFn;
    /**
     * **G-4 技能卸载能力（I1/I2 工具 `uninstall_skill`「注入才注册」）**——**只给 su**（同上一判据）。
     * 先改登记再卸载（能力须校验登记确已撤销，未撤销如实拒绝）；**文件保留**——「效果已撤」与
     * 「字节已清」二分陈述；同不改变任何写权。
     */
    uninstallSkill?: UninstallSkillFn;
    /**
     * **G-4 V2 MCP 安装能力（工具 `install_mcp`「注入才注册」）**——**只对治理角色会话（su）
     * 转交**（判据复用 `suppressHandback`，同技能两能力）；项目角色会话即便调用方误给也不注入
     * （工具不注册）。形状单一来源＝契约家 `model/runtime.ts`（`InstallMcpFn`/`InstallMcpReceipt`）。
     * **工具自己不写盘**：能力只做校验（角色/声明/含角色；护栏：仅客户消息发起的轮次）→ 激活
     * （重建；在跑不打断 ⇒ `next-session`）→ 回执。**能力级授予诚实面**：外来 MCP 在 ANS 门禁之外
     * 执行——不得宣称逐调用受审；**安装不改变任何角色的写边界**（写权仍只来自角色边界与确认发行）。
     */
    installMcp?: InstallMcpFn;
    /**
     * **G-4 V2 MCP 卸载能力（工具 `uninstall_mcp`「注入才注册」）**——**只给 su**（同上一判据）。
     * 先改声明再卸载（能力须校验声明确已撤销，未撤销以 `registration-unchanged` 如实拒绝）；
     * **下次会话摘除**（在跑不打断）、**已发生副作用不可撤**（如实二分陈述）；同不改变任何写权。
     */
    uninstallMcp?: UninstallMcpFn;
    /**
     * **I-1 开放 shell —— (a) 前端操作者确认通道（兼 arm 开关语义）**：给出 ⇒ 本会话（**仅项目角色**；
     * su 自身不接三层链——su 的 `run_shell` 走只读档 `shellReadonly`）由编排装配三层链（(c) 确定性硬地板
     * → (b) su 模型审读 → (a) 本通道；关窗/不答/超时 = **不放行**）并注入 `ShellGate` ⇒ `run_shell` 注册
     * （「注入才注册」语义未改）。不给 ⇒ 不 arm（`run_shell` 不存在）。CLI 一次性前端无确认框 ⇒ 不接。
     */
    shellOperatorChannel?: OperatorChannelFn;
    /**
     * **高级注入（透传 `assembleProjectShellGate`；测试/装配用）**：(c) `classifyShell`/`rules`、
     * (b) 审读角色 id / `openSession` / 超时、`auditSink` 等。生产调用（桌面）通常只给
     * `shellOperatorChannel`——（c) 的合法注入源（门禁引擎经 service 的公开出口）就绪后在此传入。
     */
    shellArming?: Omit<AssembleShellGateOptions, "project" | "operatorChannel" | "sessionDeps" | "runtime">;
    /**
     * **su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）**：给出 ⇒ 本会话装配**只读档**
     * `ShellGate`（`assembleReadonlyShellGate`——只接 (c)：命中只读白名单放行；`risky`/`review`/`deny`
     * 一律拒；**不接 (b) su 模型审读**——su 自己就是审读者，不自审；**不接 (a) 客户确认**——只读外的
     * 命令直接拒，不打扰客户、不弹任何对话框）并注入 `capabilities.shellGate` ⇒ `run_shell` 注册
     * （「注入才注册」语义未改）。设计指向的用途是**内置治理角色 su**（su 自身不接三层链）；对项目角色
     * 给出时按**更严的一档**处理（只读档执行集严格 ⊆ 三层链执行集）。与 `shellOperatorChannel`/
     * `shellArming` 同时出现时 **readonly 优先**（见下方 arm 块注释）。装配失败 ⇒ **不 arm**
     * （`run_shell` 不注册，fail-closed 不变）。**不得为此弹任何对话框**（选项面没有 (a) 通道即是结构保证）。
     */
    shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    /**
     * **su 审批档（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）**：
     * 给出 ⇒ 内置治理角色 su 装配 `assembleOperatorShellGate`（只接 (c)+(a)：allow 直放 0 卡；
     * risky/review/deny 一律交客户逐条批准；**不接 (b)**——su 不自审）。选项面没有 pmAsk/
     * routineShellPolicy（type 层面保证）。
     * **su-only 守卫**：仅 `suppressHandback === true`（内置治理角色）时生效；项目角色误传 ⇒ **不 arm**
     * 并记录诊断（防止三层链被绕过）。**与 `shellReadonly` 同时给出 ⇒ 不 arm**（诊断记录，不择一静默生效）。
     * 装配失败/缺件 ⇒ 不 arm（`run_shell` 不注册，fail-closed）。优先级：operatorOnly → readonly → 三层链。
     */
    shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">;
    /**
     * **R-1：审读结论工具的能力**（`report_shell_verdict`「注入才注册」）——审读会话专用，由
     * `pm-reviewer` 注入；一般调用方不传。
     */
    shellVerdict?: ShellVerdictFn;
    /**
     * **D-1 覆盖位**：`false` ⇒ 本会话**不持久化**（不传 `sessionDir`，适配器走 in-memory）。
     * 审读会话固定用 `false`（不恢复用户 su 会话的可能损坏历史、不污染其聊天记录）；缺省/`true` 行为不变。
     */
    persistSession?: boolean;
  },
  deps: RoleSessionDeps = {}
): Promise<RoleSessionHandle> {
  const log = createDiagnosticLogger({ component: "orchestration.session", projectRoot: input.project.projectRoot, roleId: input.roleId });
  log.record("session.open.start");
  // 角色/边界解析：失败即抛错（句柄式接口无退出码）。
  // 会话式入口：**允许** project.builtInRoles 声明的内置治理角色（桌面聊天）。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: true });
  if (!setup.ok) {
    log.error("session.open.failed", new Error(setup.reason));
    throw new Error(setup.reason);
  }

  // 底层只建**一个**会话：多轮 send 复用同一 RoleSession，绝不每轮重建。
  //
  // 能力来源（评审 §5.6「单点」）：内置治理角色一律读门禁引擎注册表
  // `governanceCapabilitiesOf`；`su` 得到 `LEGACY_SU_CAPABILITIES`（single 旧行为逐字不变）；
  // 项目角色没有治理能力（`undefined`），保持既有「只给内置治理角色」的注入纪律。
  const builtInGovernance = setup.role.kind === "built-in-governance";
  const trioSpec: BuiltInGovernanceRoleSpec | undefined = governanceRoleOf(setup.role.id);
  const isTrio = trioSpec !== undefined;
  const governanceModel = input.project.governanceModel ?? "single";
  // 评审 §5.3：trio 下自动收尾/重 pin 的写权来自**应用专用边界**——三人的 Section 1 不含
  // `.ans/**`/`docs/bootstrap-manifest.md`，若沿用角色边界，收尾会 fail-closed、`.ans` 永不落盘。
  // single/su 逐字沿用会话边界（旧行为不变）。
  const repinBoundary =
    isTrio || governanceModel === "trio"
      ? appGovernanceBoundary(setup.role.boundary.acceptance)
      : setup.role.boundary;
  const cap = builtInGovernance ? governanceCapabilitiesOf(setup.role.id) : undefined;
  // 预授权目录（评审 §5.6）：trio 按注册表；su 用既有四棵；项目角色没有预授权。
  const preauthorizedDirs: readonly string[] = builtInGovernance
    ? trioSpec?.preauthorizedDirs ??
      (setup.role.id === "su" ? LEGACY_SU_PREAUTHORIZED_DIRS : [])
    : [];

  // gate（A-3）：有 `customerInput` ⇒ 确认制动态 writeSet（发行器追加；内置治理角色的初始集额外含
  // 预授权写目录）；无 ⇒ 原样传 input.scope（可为 undefined = 不收窄，旧语义逐字不变）。
  // W6-A（四角色评审 §4.4）：**能力矩阵收窄**——Liaison 的 `customerInput=false`，即便调用方误给
  // 通道也不进入确认制（`request_confirmation`/`request_choice` 结构性不注册；走静态边界/预授权）。
  // 项目角色（cap undefined）与 su/其余 trio 角色（cap.customerInput=true）行为逐字不变。
  const confirmationMode =
    input.customerInput !== undefined && (cap === undefined || cap.customerInput);
  const issued = new Set<string>();
  const conditions = conditionSlugsOf(setup.role.boundary);
  const gateCtx = { skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot };
  const staticScope = input.scope;

  // 账本快照（评审 §5.7）：open 时读一次；每次 send 前刷新；客户决定后**同步更新内存快照**并异步落盘。
  // `local` 保存本会话已作出但可能尚未落盘的决定，刷新时按签名去重合并——避免「刷新读到旧盘面」把
  // 刚作出的决定丢掉。
  const ledgerState: { snapshot: GovernanceLedgerSnapshot; local: GovernanceLedgerEntry[] } = {
    snapshot: { entries: [], errors: [] },
    local: [],
  };
  let currentFlowId: string | undefined;
  let boundSessionForEvidence: RoleSession | undefined;
  const refreshLedger = async (): Promise<void> => {
    const disk = await readGovernanceLedger(input.project.projectRoot);
    const missingLocal = ledgerState.local.filter(
      (local) => !disk.entries.some((entry) => sameLedgerEntry(entry, local)),
    );
    ledgerState.snapshot = { entries: [...disk.entries, ...missingLocal], errors: disk.errors };
  };
  if (isTrio) await refreshLedger();

  const baseGate: WriteGate = confirmationMode
    ? (p) =>
        resolveWrite(
          p,
          setup.role.boundary,
          preauthorizedDirs.length > 0
            ? scopeWithBuiltInPreauthorization(
                { writeSet: [...issued], conditions },
                p,
                input.project.projectRoot,
                preauthorizedDirs,
              )
            : { writeSet: [...issued], conditions },
          gateCtx,
        )
    : preauthorizedDirs.length > 0 && staticScope !== undefined
      ? (p) =>
          resolveWrite(
            p,
            setup.role.boundary,
            scopeWithBuiltInPreauthorization(staticScope, p, input.project.projectRoot, preauthorizedDirs),
            gateCtx,
          )
      : buildGate(setup.role, input.project, input.scope);

  // trio gate 包装（评审 §5.2/§5.6）：先判 `forbiddenWritePaths`（应用治理记录/其他治理角色资料，
  // 任何角色不可写），再按路径分派三道门禁（write-flow / write-nomination / write-role-card），
  // 最后才走既有 resolveWrite。门禁只读账本快照，不读 Markdown status。
  const gate: WriteGate = isTrio
    ? (p) => {
        const rel = projectRelativeLexical(p, input.project.projectRoot);
        const forbidden = forbiddenWriteDecision(trioSpec!, rel);
        if (forbidden !== undefined) {
          log.record("governance.write.forbidden", { path: rel ?? p });
          return forbidden;
        }
        const routed = governanceActionForPath(rel);
        if (routed !== undefined) {
          const decision = evaluateGovernanceGate(
            {
              projectRoot: input.project.projectRoot,
              model: governanceModel,
              roleId: setup.role.id,
              action: routed.action,
              flowId: routed.flowId ?? currentFlowId,
              targetRoleId: routed.targetRoleId,
              path: rel ?? undefined,
            },
            ledgerState.snapshot,
          );
          if (!decision.allowed) {
            log.record("governance.gate.rejected", {
              action: routed.action,
              path: rel ?? p,
              code: decision.code,
            });
            return { allowed: false, reason: decision.message, allowedByRoot: { skill: [], project: [] } };
          }
        }
        return baseGate(p);
      }
    : baseGate;

  // 客户通道包装（A-3）：客户确认后，把「已预览且校验在边界内的具体路径」发行进 writeSet。
  // trio 追加（评审 §5.7/§5.8）：
  //   · 按角色校验 cardKind 白名单——越权**不弹卡**，直接返回 declined（fail-closed）；
  //   · 客户作出决定后，按 cardKind + 选项 id 写 `customer.decision`（同步更新内存快照并异步落盘）；
  //   · 账本只记 `CustomerInputOutcome` 与工具调用证据，不采信角色自述；unavailable 不写（无决定）。
  const governedInput: CustomerInputFn | undefined = confirmationMode
    ? (() => {
        const issue = createConfirmedWriteIssuer({
          boundary: setup.role.boundary,
          conditions,
          ctx: { skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot },
          issued,
        });
        const raw = input.customerInput!;
        return async (req, metadata) => {
          const originalMetadata = metadata === undefined ? undefined : { ...metadata };
          const cardKind = req.cardKind ?? originalMetadata?.cardKind;
          if (isTrio) {
            const allowed = TRIO_CARD_KINDS[trioSpec!.id];
            if (cardKind !== undefined && !allowed.includes(cardKind)) {
              log.record("governance.cardKind.rejected", {
                roleId: setup.role.id,
                cardKind,
                allowed: [...allowed],
              });
              return {
                outcome: "declined",
                reason:
                  `治理角色 ${setup.role.id} 不允许 cardKind=${cardKind}；` +
                  `允许：${allowed.join(" / ")}。本次未向客户发卡。`,
              };
            }
            const flowId = req.flowId ?? originalMetadata?.flowId;
            if (isGovernanceFlowId(flowId)) currentFlowId = flowId;
          }
          const out = await raw(req, metadata);
          const issuedPaths = issue(req, out ?? null, originalMetadata);
          if (isTrio) {
            recordCustomerDecision({
              state: ledgerState,
              projectRoot: input.project.projectRoot,
              roleId: setup.role.id,
              function: trioSpec!.function,
              req,
              metadata: originalMetadata,
              out,
              issuedPaths,
              sessionId: boundSessionForEvidence?.nativeSessionId,
              runtime: input.runtime ?? boundSessionForEvidence?.runtime,
              log,
            });
          }
          return out;
        };
      })()
    : undefined;

  // 回交（设计 §10.8）：角色会话 settle → 编排发 `handback` 事件，交回治理角色。
  // **内置治理角色自身不回交**（回交的主体是**其他角色**）——`suppressHandback` 仅用于本语义。
  const suppressHandback = builtInGovernance;

  // 交报告（C-1）：**只给回交主体（非 su）**注入 `reportHandback`——模型经 `submit_report` 交的报告
  // （`summary`/`evidence`/`status`）正常终局优先取报告值；su 不注入。无合法报告明确未报告。
  // 报告按运行时轮次保存，终局消费。无 metadata 的旧替身仅保留单轮兼容值。
  const taskReports = new Map<string, TaskReport>();
  const completedTurns = new Set<string>();
  let legacyReport: TaskReport | undefined;
  const turnIntents = new Map<string, HandbackIntent>();
  let legacyIntent: HandbackIntent | undefined;
  const reportHandback = suppressHandback
    ? undefined
    : (report: TaskReport, metadata?: ReportHandbackMetadata): ReportHandbackReceipt => {
        const turnId = metadata?.turnId;
        const normalized = normalizeTaskReport(report);
        const invalidMetadata = metadata !== undefined && (typeof turnId !== "string" || turnId === "");
        if (normalized === undefined || invalidMetadata || (turnId !== undefined && completedTurns.has(turnId))) {
          log.record("report.ignored", { turnId, reasonCode: normalized === undefined ? "invalid-report" : invalidMetadata ? "invalid-turn" : "closed-turn" });
          return { ok: false, message: "报告无效或所属轮次已关闭，未接收。" };
        }
        if (turnId !== undefined) taskReports.set(turnId, normalized);
        else legacyReport = normalized;
        log.record("report.received", { turnId, state: normalized.status, reportSource: "submit_report", count: normalized.evidence?.length ?? 0 });
        return { ok: true, state: "accepted-memory" };
      };

  // D-1：能力面携带所选角色/runtime 的路径；实际 store 由 Service 按所选 runtime 建立。
  // 编排只**算路径**、**不预建目录**（创建归适配器在真正落盘时做——理由见 AdapterCapabilities.sessionDir）。
  // projectRoot 为空 / roleId 不安全 / **`persistSession:false`（R-1 审读会话）** → 不传（in-memory）。
  const sessionDir =
    input.persistSession === false ? undefined : sessionDirFor(input.project.projectRoot, setup.role.id, input.runtime);

  // H-1 派发任务（评审 §5.6）：能力矩阵驱动——仅 `capabilities.dispatchTask`（trio=Convener；su 旧行为）。
  // trio 下再包一层**派发范围门**（评审 §6.2 五条）：门禁拒绝即 `{ok:false}` 如实回执，不进入前端路由。
  const dispatchTask: DispatchTaskFn | undefined =
    cap?.dispatchTask === true && input.dispatchTask !== undefined
      ? isTrio
        ? async (dispatch, metadata) => {
            const decision = evaluateGovernanceGate(
              {
                projectRoot: input.project.projectRoot,
                model: governanceModel,
                roleId: setup.role.id,
                action: "dispatch",
                flowId: dispatch.flowId,
                stepId: dispatch.stepId,
                targetRoleId: dispatch.roleId,
              },
              ledgerState.snapshot,
            );
            if (!decision.allowed) {
              log.record("governance.dispatch.rejected", {
                flowId: dispatch.flowId,
                stepId: dispatch.stepId,
                targetRoleId: dispatch.roleId,
                code: decision.code,
              });
              return { ok: false, message: `派发被治理门禁拒绝：${decision.message}` };
            }
            return input.dispatchTask!(dispatch as DispatchTaskPayload, metadata);
          }
        : input.dispatchTask
      : undefined;

  // W6-A 意图交接（四角色评审 §5.1/§5.2）：能力矩阵驱动——仅 `capabilities.handOffIntent`（trio=Liaison）。
  // 编排侧先做机械校验（意图文件权威、slug、四要素、去重、initial 一次性、每轮一次、账本可读），
  // 通过后调用前端投递能力；**先投递成功、后写账本**；投递失败如实回执、不重试、不写成功账本。
  // 交接不是客户批准：本包装器不产生任何 customer.decision，也不解锁任何门禁。
  const successfulHandoffTurns = new Set<string>();
  // 同一会话的交接/澄清串行链：即便模型在同一轮并行发起两次调用，第二个也等第一个落盘后再校验
  // （「每轮一次」「两轮上限」才是机械成立的，而不是赌工具调用顺序）。
  const handoffSerial: { chain: Promise<void> } = { chain: Promise.resolve() };
  const clarificationSerial: { chain: Promise<void> } = { chain: Promise.resolve() };
  const handOffIntent: HandOffIntentFn | undefined =
    isTrio && cap?.handOffIntent === true && input.handOffIntent !== undefined
      ? (payload, metadata) =>
          serializeGovernanceTask(handoffSerial, async () => {
          const turnId = metadata?.turnId;
          if (turnId !== undefined && successfulHandoffTurns.has(turnId)) {
            return { ok: false, message: "同一轮已交接过一次意图（每轮至多一次）；未交接；请在本轮结束后再交接。" };
          }
          const validation = await validateIntentHandoff(
            { projectRoot: input.project.projectRoot, ...payload },
            {
              governanceModel,
              governanceFunction: trioSpec!.function,
              roleId: setup.role.id,
              ...(turnId !== undefined ? { turnId } : {}),
              ...(boundSessionForEvidence?.nativeSessionId !== undefined
                ? { sessionId: boundSessionForEvidence.nativeSessionId }
                : {}),
            },
          );
          if (!validation.ok) {
            log.record("governance.handoff.rejected", { code: validation.code, intentId: payload.intentId });
            return { ok: false, message: validation.message };
          }
          for (const warning of validation.warnings ?? []) {
            log.record("governance.handoff.warning", { message: warning });
          }
          let receipt;
          try {
            receipt = await input.handOffIntent!(payload, metadata);
          } catch (err) {
            log.error("governance.handoff.delivery.failed", err, { intentId: payload.intentId });
            return { ok: false, message: `应用无法把意图交给报告员：${errText(err)}；未重试。` };
          }
          if (receipt?.ok !== true) {
            const reason = receipt?.message ?? "投递端未确认";
            log.record("governance.handoff.delivery.rejected", { intentId: payload.intentId, reason });
            return { ok: false, message: `应用无法把意图交给报告员：${reason}；未重试。` };
          }
          if (turnId !== undefined) successfulHandoffTurns.add(turnId);
          // 先投递成功、后写账本；账本失败只记诊断，不翻转投递结果、不重试（评审 §7.2）。
          const entryRuntime = input.runtime ?? boundSessionForEvidence?.runtime;
          const entry: GovernanceLedgerEntry = {
            at: new Date().toISOString(),
            kind: "intent.handed-off",
            actorRoleId: setup.role.id,
            power: "liaison",
            intentId: payload.intentId,
            handoffKind: payload.handoffKind,
            targetRoleId: "rapporteur",
            ...(validation.flowId !== undefined ? { flowId: validation.flowId } : {}),
            artifactPath: validation.artifactPath,
            artifactSha256: validation.artifactSha256,
            messageSummary: truncateText(payload.summary, 200),
            ...(turnId !== undefined ? { turnId } : {}),
            ...(boundSessionForEvidence?.nativeSessionId !== undefined
              ? { sessionId: boundSessionForEvidence.nativeSessionId }
              : {}),
            ...(entryRuntime !== undefined ? { runtime: entryRuntime } : {}),
          };
          const appended = await appendGovernanceLedger(input.project.projectRoot, entry);
          if (!appended.ok) log.record("governance.handoff.append.failed", { message: appended.message });
          return {
            ok: true,
            message: `已把意图「${payload.intentId}」交给报告员（handoffKind=${payload.handoffKind}）——交接 ≠ 客户批准。`,
          };
        })
      : undefined;

  // W6-A 澄清请求（四角色评审 §5.4）：能力矩阵驱动——仅 `capabilities.requestClarification`（trio=Rapporteur）。
  // 编排侧先读账本判两轮上限（同一 flowId，无则同一 intentId）；通过后把问题交给前端送达主入口，
  // 再写 `clarification.requested`（actor=rapporteur, power=proposal）。失败如实回执、不重试、不写账本。
  // 澄清不弹决定卡、不占「一项目一卡」、不改变任何权力或写权。
  const requestClarification: RequestClarificationFn | undefined =
    isTrio && cap?.requestClarification === true && input.requestClarification !== undefined
      ? (payload, metadata) =>
          serializeGovernanceTask(clarificationSerial, async () => {
          const rounds = await countClarificationRounds(input.project.projectRoot, payload);
          if (!rounds.ok) return { ok: false, message: rounds.message };
          if (rounds.rounds >= CLARIFICATION_MAX_ROUNDS) {
            return {
              ok: false,
              message:
                `同一${rounds.scope === "flow" ? "流程" : "意图"}已有 ${rounds.rounds} 轮澄清` +
                `（上限 ${CLARIFICATION_MAX_ROUNDS} 轮）：请在提案卡上请客户决定（带假设/备选），未提交。`,
            };
          }
          let receipt;
          try {
            receipt = await input.requestClarification!(payload, metadata);
          } catch (err) {
            log.error("governance.clarification.submit.failed", err, {
              flowId: payload.flowId,
              intentId: payload.intentId,
            });
            return { ok: false, message: `澄清请求未能提交：${errText(err)}；未重试。` };
          }
          if (receipt?.ok !== true) {
            return { ok: false, message: `澄清请求未能提交：${receipt?.message ?? "送达端未确认"}；未重试。` };
          }
          const entryRuntime = input.runtime ?? boundSessionForEvidence?.runtime;
          const entry: GovernanceLedgerEntry = {
            at: new Date().toISOString(),
            kind: "clarification.requested",
            actorRoleId: setup.role.id,
            power: "proposal",
            ...(payload.flowId !== undefined ? { flowId: payload.flowId } : {}),
            ...(payload.intentId !== undefined ? { intentId: payload.intentId } : {}),
            messageSummary: truncateText(payload.summary ?? payload.question, 200),
            ...(metadata?.turnId !== undefined ? { turnId: metadata.turnId } : {}),
            ...(boundSessionForEvidence?.nativeSessionId !== undefined
              ? { sessionId: boundSessionForEvidence.nativeSessionId }
              : {}),
            ...(entryRuntime !== undefined ? { runtime: entryRuntime } : {}),
          };
          const appended = await appendGovernanceLedger(input.project.projectRoot, entry);
          if (!appended.ok) log.record("governance.clarification.append.failed", { message: appended.message });
          const detail = receipt.message !== undefined ? ` ${receipt.message}` : "";
          return {
            ok: true,
            message:
              `澄清请求已记录（第 ${rounds.rounds + 1} 轮）——不弹决定卡、不改变任何权力/写权；` +
              `应用已在主入口显示。${detail}`,
          };
        })
      : undefined;

  // G-2 看护三能力（R1/R2）：能力矩阵驱动——仅 `capabilities.roleStatus/sessionTail/proposeRecovery`
  // （trio=Convener；su 旧行为）。未注入 ⇒ 不注入（能力缺席 = 最强 fail-closed）。
  // 承载契约（字段名/形状）单一来源：`common/编排/watchdog.ts`。
  const roleStatus = cap?.roleStatus === true ? input.roleStatus : undefined;
  const sessionTail = cap?.sessionTail === true ? input.sessionTail : undefined;
  const proposeRecovery = cap?.proposeRecovery === true ? input.proposeRecovery : undefined;

  // G-4 技能安装/卸载两能力（I1/I2）：能力矩阵驱动——仅 `capabilities.installSkill`
  // （trio=Nominator；su 旧行为）。字段名**逐字**＝契约家能力名（错一名 ⇒ 工具静默零注册）。
  const installSkill = cap?.installSkill === true ? input.installSkill : undefined;
  const uninstallSkill = cap?.installSkill === true ? input.uninstallSkill : undefined;

  // G-4 V2 MCP 安装/卸载两能力：能力矩阵驱动——仅 `capabilities.installMcp`
  // （trio=Nominator；su 旧行为）。**安装不改变任何角色的写边界**。
  const installMcp = cap?.installMcp === true ? input.installMcp : undefined;
  const uninstallMcp = cap?.installMcp === true ? input.uninstallMcp : undefined;

  // I-1 开放 shell（项目角色三层链）+ 审批档/只读档——共用同一个 `shellGate` 能力位
  // （「注入才注册」：注入了 ⇒ 适配器注册 `run_shell`；未注入/装配失败 ⇒ **不 arm**，fail-closed）。
  // 能力矩阵（评审 §5.6）：
  //   · `shell: "none"`（trio Rapporteur/Nominator）→ 不 arm（即使调用方误传选项也拒绝并记诊断）；
  //   · `shell: "readonly"`（trio Convener）→ 仅只读档；
  //   · `shell: "operator-approve"`（su single）→ 审批档；保留旧 `shellReadonly` 注入作为 su 的
  //     兼容路径（桌面自 2026-10-17 起用审批档，但旧调用方/测试仍可使用；两档同时给出 ⇒ 不 arm）；
  //   · 项目角色（cap undefined）→ 既有三层链/只读路径**逐字不变**。
  let shellGate: ShellGate | undefined;
  if (input.shellOperatorOnly !== undefined) {
    if (input.shellReadonly !== undefined) {
      // 互斥：不择一静默生效（PM 评审 §3.4）。
      log.record("shell.operatorOnly.rejected", { mode: "shellOperatorOnly", outcome: "not-armed", reasonCode: "conflicts-with-shellReadonly" });
    } else if (cap?.shell !== "operator-approve") {
      // 审批档只属于 single/su（能力矩阵）；项目角色/trio 误传不得把三层链绕成「客户全权审批」。
      log.record("shell.operatorOnly.rejected", { mode: "shellOperatorOnly", outcome: "not-armed", reasonCode: "capability-denied" });
    } else {
      try {
        shellGate = await assembleOperatorShellGate({ project: input.project, ...input.shellOperatorOnly });
      } catch (err) {
        log.error("shell.arming.failed", err);
        shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
      }
    }
  } else if (input.shellReadonly !== undefined) {
    if (cap !== undefined && cap.shell === "none") {
      // trio Rapporteur/Nominator：没有 shell 面（评审 §5.6）。
      log.record("shell.readonly.rejected", { outcome: "not-armed", reasonCode: "capability-denied" });
    } else {
      try {
        shellGate = await assembleReadonlyShellGate({ project: input.project, ...input.shellReadonly });
      } catch (err) {
        log.error("shell.arming.failed", err);
        shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
      }
    }
  } else if (!builtInGovernance && input.shellOperatorChannel !== undefined) {
    try {
      shellGate = await assembleProjectShellGate({
        project: input.project,
        operatorChannel: input.shellOperatorChannel,
        sessionDeps: { ...deps, createAdapter: deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "pi", deps.runtimeOptions) },
        ...(input.shellArming ?? {}),
        runtime: input.runtime,
        ...(input.routineShellPolicy !== undefined ? { routineShellPolicy: input.routineShellPolicy } : {}),
      });
    } catch (err) {
      log.error("shell.arming.failed", err);
      shellGate = undefined;
    }
  }

  const capabilities: AdapterCapabilities = {
    ...(governedInput !== undefined ? { customerInput: governedInput } : {}),
    ...(reportHandback !== undefined ? { reportHandback } : {}),
    ...(sessionDir !== undefined ? { sessionDir } : {}),
    ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
    ...(input.persistSession !== undefined ? { persistSession: input.persistSession } : {}),
    ...(dispatchTask !== undefined ? { dispatchTask } : {}),
    ...(handOffIntent !== undefined ? { handOffIntent } : {}),
    ...(requestClarification !== undefined ? { requestClarification } : {}),
    ...(roleStatus !== undefined ? { roleStatus } : {}),
    ...(sessionTail !== undefined ? { sessionTail } : {}),
    ...(proposeRecovery !== undefined ? { proposeRecovery } : {}),
    ...(installSkill !== undefined ? { installSkill } : {}),
    ...(uninstallSkill !== undefined ? { uninstallSkill } : {}),
    ...(installMcp !== undefined ? { installMcp } : {}),
    ...(uninstallMcp !== undefined ? { uninstallMcp } : {}),
    ...(shellGate !== undefined ? { shellGate } : {}),
    ...(input.shellVerdict !== undefined ? { shellVerdict: input.shellVerdict } : {}),
  };
  const createAdapter = deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "pi", deps.runtimeOptions);
  const adapter = createAdapter(
    gate,
    Object.keys(capabilities).length > 0 ? capabilities : undefined,
  );
  let session: RoleSession;
  try {
    session = await adapter.bindRole(setup.role);
  } catch (err) {
    log.error("session.open.failed", err);
    throw err;
  }
  boundSessionForEvidence = session;
  log.record("session.open.ready");

  // §5.7 `artifact.observed`：trio 内置角色在会话 open 时扫一次预授权目录作为基线（只记哈希、不写账本），
  // 每轮 settle 后只对「新增/变更」的 `.md` 追加 `artifact.observed`。su（single）不参与治理账本——旧项目
  // 行为逐字不变（不因开会话/每轮 settle 凭空写 `.ans`）。
  const artifactHashes = new Map<string, string>();
  const artifactScanEnabled = isTrio && preauthorizedDirs.length > 0;
  if (artifactScanEnabled) {
    try {
      for (const artifact of await scanPreauthorizedArtifacts(input.project.projectRoot, preauthorizedDirs)) {
        artifactHashes.set(artifact.relPath, artifact.sha256);
      }
    } catch (err) {
      log.error("governance.artifact.baseline.failed", err);
    }
  }

  // 自动收尾的授权边界 = **本会话解析出的边界**（创世态下即治理种子边界；普通角色下即其项目
  // 边界）——与 su 同一授权。治理边界文档落点：项目未声明（如桌面创世 `path` 为空串）时用默认约定路径。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;

  // 自动收尾 + 自动重 pin（A-4 / §13.3）：缺省仅**内置治理角色（su）会话**开启。
  // `repinIfBootstrapped`：创世态 = **首次收尾**（无可 pin 之物 → 零副作用）；非创世态 = 重扫更新 pin。
  const autoRepinEnabled = input.autoRepin ?? setup.role.kind === "built-in-governance";

  let disposed = false;
  // F-5-opt1：排入的模型可见注记（下一次 send 的输入前缀；送达一次即消费——见 queueModelNotice 文档）。
  let pendingModelNotice: string | undefined;
  const persistenceSubscriptions = new Set<() => void>();
  const boundRoleId = setup.role.id;
  const protectionContext = { credentialEnvNames: trustedCredentialNames(deps.runtimeOptions) };

  async function recordFinalHandback(event: HandbackEvent): Promise<HandbackEvent> {
    const handback = event.handback;
    const draft: RuntimeLiveReportDraftV1 = {
      source: { roleId: boundRoleId },
      taskId: handback.taskId ?? null,
      origin: handback.origin,
      status: handback.status,
      summary: handback.summary,
      evidence: handback.evidence,
      at: handback.at,
    };
    if (handback.runtime !== undefined) draft.source.runtime = handback.runtime;
    if (handback.turnId !== undefined) draft.source.turnId = handback.turnId;
    let liveReport;
    try {
      liveReport = projectRuntimeLiveHandback(draft, protectionContext);
    } catch {
      log.record("report.projection.failed", { errorCode: "INVALID" });
      return { kind: "handback", summary: "报告安全显示内容生成失败。", handback,
        reportPersistence: { state: "failed", code: "INVALID", retryAvailable: false } };
    }
    const safe: HandbackEvent = { ...event, summary: `回交 su：${liveReport.summary.text}`, liveReport };
    const persistence = session.persistence;
    if (persistence === undefined || handback.turnId === undefined) {
      safe.reportPersistence = { state: "unknown-live", retryAvailable: false };
      return safe;
    }
    if (persistence.mode === "disabled") {
      safe.reportPersistence = { state: "disabled", code: "PERSISTENCE_DISABLED", retryAvailable: false };
      return safe;
    }
    // Core owns the actual bound scope, ended-turn validation, safe snapshot and retries.
    let result: ReportSaveResultV1;
    try {
      result = await persistence.recordFinalReport({
        ...draft,
        source: { roleId: boundRoleId, runtime: persistence.scope.runtime, turnId: handback.turnId },
        origin: handback.origin ?? "terminal-fallback",
      });
    } catch {
      log.record("report.persistence.failed", { turnId: handback.turnId, errorCode: "PERSIST_FAILED" });
      safe.reportPersistence = { state: "failed", code: "PERSIST_FAILED", retryAvailable: false };
      return safe;
    }
    if (result.report !== undefined) {
      safe.report = result.report;
      safe.liveReport = { source: result.report.source, taskId: result.report.taskId, origin: result.report.origin,
        status: result.report.status, summary: result.report.summary, evidence: result.report.evidence,
        evidenceOmitted: result.report.evidenceOmitted, at: result.report.at };
      safe.summary = `回交 su：${result.report.summary.text}`;
    }
    if (result.ok) {
      safe.reportPersistence = { state: "saved", reportId: result.report.reportId, retryAvailable: false };
    } else {
      let state: NonNullable<HandbackEvent["reportPersistence"]>["state"] = "failed";
      if (result.state === "expired") state = "expired";
      safe.reportPersistence = { state, reportId: result.reportId, code: result.code, retryAvailable: result.retryAvailable };
    }
    return safe;
  }
  const base: RoleSessionHandle = {
    get persistenceMode() {
      if (session.persistence !== undefined) return session.persistence.mode;
      return "unknown-live";
    },
    async retryReportPersistence(reportId) {
      if (disposed) return { ok: false, state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false, message: "原会话已关闭。" };
      if (session.persistence) return session.persistence.retryReportPersistence(reportId);
      return { ok: false, state: "unsupported", code: "UNSUPPORTED", retryAvailable: false, message: "当前会话不支持报告保存。" };
    },
    async getReportPersistence(reportId) {
      if (disposed) return { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false };
      if (session.persistence) return session.persistence.getReportPersistence(reportId);
      return { state: "unsupported", code: "UNSUPPORTED", retryAvailable: false };
    },
    async retryDeliveryHistoryPersistence(attemptId) {
      if (disposed) return { ok: false, state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false, message: "原会话已关闭。" };
      if (session.persistence) return session.persistence.retryDeliveryHistoryPersistence(attemptId);
      return { ok: false, state: "unsupported", code: "UNSUPPORTED", retryAvailable: false, message: "当前会话不支持历史补保存。" };
    },
    async getDeliveryReceipt(attemptId) {
      if (disposed) return { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false };
      if (session.persistence) return session.persistence.getDeliveryReceipt(attemptId);
      return { state: "unsupported", code: "UNSUPPORTED", retryAvailable: false };
    },
    onPersistenceChange(listener) {
      if (disposed || session.persistence === undefined) return () => {};
      const unsubscribeCore = session.persistence.onPersistenceChange(change => {
        if (!disposed) listener(change);
      });
      const unsubscribe = () => {
        persistenceSubscriptions.delete(unsubscribe);
        unsubscribeCore();
      };
      persistenceSubscriptions.add(unsubscribe);
      return unsubscribe;
    },
    get runtime() { return session.runtime ?? input.runtime; },
    get roleId() { return session.roleId ?? setup.role.id; },
    get contextSource() { return session.contextSource; },
    get nativeSessionId() { return session.nativeSessionId; },
    get contextWarning() { return session.contextWarning; },
    async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
      legacyReport = undefined;
      // 账本快照刷新（评审 §5.7 时序边界）：每次 send 开始时重读盘面——跨会话的新客户决定在此生效；
      // 未含决定则门禁拒，绝不猜。读取失败 → 快照 errors 非空 → 门禁 fail-closed。
      if (isTrio) await refreshLedger();
      // F-5-opt1：排入的模型可见注记作为**本轮输入前缀**送出（不单独开轮、不改判定；送达一次即消费）。
      const notice = pendingModelNotice;
      const outbound = notice !== undefined && notice !== "" ? `${notice}\n\n${text}` : text;
      let intent: HandbackIntent;
      if (opts?.handback !== undefined) {
        intent = { required: opts.handback.required };
        if (opts.handback.required && opts.handback.taskId) intent.taskId = opts.handback.taskId;
      } else {
        intent = { required: typeof input.taskId === "string" && input.taskId !== "" };
        if (intent.required) intent.taskId = input.taskId;
      }
      legacyIntent = intent;
      let acknowledged = false;
      let promptOptions: PromptOptions | undefined = opts;
      // Unmarked legacy doubles retain their old exact-reference/single-argument path.
      // Real runtimes and explicit Pipeline intent use the Core's synchronous opening ack.
      if (session.runtime !== undefined || opts?.handback !== undefined || opts?.onTurnStarted !== undefined) {
        const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
          if (acknowledged || disposed || metadata.roleId !== setup.role.id
            || (session.runtime !== undefined && metadata.runtime !== session.runtime)
            || typeof metadata.turnId !== "string" || metadata.turnId === ""
            || completedTurns.has(metadata.turnId)) return;
          acknowledged = true;
          turnIntents.set(metadata.turnId, intent);
          if (legacyIntent === intent) legacyIntent = undefined;
          opts?.onTurnStarted?.(metadata);
        };
        const { handback: _pipelineIntent, ...runtimeOptions } = opts ?? {};
        promptOptions = { ...runtimeOptions, onTurnStarted };
      }
      log.record("session.send.start");
      try {
      // 图片原引用保留；真实开轮绑定路径组合 ACK，并剥离 Pipeline 专用来源字段。
        if (promptOptions === undefined) {
          await session.prompt(outbound);
        } else {
          await session.prompt(outbound, promptOptions);
        }
        log.record("session.send.end");
        // F-5-opt1：注记已随本轮输入送出 → 消费（期间若又排入新注记则保留新的那份）。
        if (pendingModelNotice === notice) pendingModelNotice = undefined;
      } catch (err) {
        // F-5-opt1：未开轮（无 ACK）→ 注记保留（输入未送达模型，下一轮重试仍带上）；开轮后失败 → 消费（避免重复投递）。
        if (acknowledged && pendingModelNotice === notice) pendingModelNotice = undefined;
        if (!acknowledged && legacyIntent === intent) legacyIntent = undefined;
        log.error("session.send.failed", err);
        throw err;
      }
    },
    // P0-2 停当前轮次：三态如实返回（形状与语义见 RoleSessionAbortResult 的文档注释）。
    // 消费规则 = 契约 `RoleSession.abort?`：可选方法，缺席 = 该运行时不支持停止，必须如实告知。
    async abort(): Promise<RoleSessionAbortResult> {
      log.record("session.abort.requested");
      if (session.abort === undefined) {
        return { ok: false, supported: false, error: "当前运行时不支持停止" };
      }
      try {
        await session.abort();
        return { ok: true, supported: true };
      } catch (err) {
        log.error("session.abort.failed", err);
        // SDK 报错如实转达（错误原文进 error），不吞、不谎报已停；不销毁会话。
        return { ok: false, supported: true, error: errText(err) };
      }
    },
    // F-5-opt1：排入一行**模型可见注记**（下一次 send 的输入前缀；送达一次即消费）。
    // 空串/非字符串忽略（不做一半的事）；语义与推荐文案见接口与 REBUILT_SESSION_WRITE_PERMITS_NOTICE。
    queueModelNotice(text: string): void {
      if (typeof text !== "string" || text.trim() === "") return;
      pendingModelNotice = text;
      log.record("session.notice.queued");
    },
    events(): AsyncIterable<OrchestrationEvent> {
      const stream = session.events();
      const wrapped = suppressHandback
        ? stream
        : withHandback(stream, { roleId: setup.role.id, taskId: input.taskId }, {
            projectRoot: input.project.projectRoot,
            report: (turnId) => turnId !== undefined ? taskReports.get(turnId) : legacyReport,
            intent: (turnId) => {
              if (turnId !== undefined) return turnIntents.get(turnId);
              if (session.runtime === undefined) return legacyIntent;
              return undefined;
            },
            completed: (turnId) => {
              if (turnId !== undefined) {
                completedTurns.add(turnId);
                taskReports.delete(turnId);
                turnIntents.delete(turnId);
              } else {
                legacyReport = undefined;
                legacyIntent = undefined;
              }
            },
          });
      // 每轮 settle 后**自动收尾 / 自动重 pin**：创世态首次写出 `.ans`（+治理边界文档+manifest），
      // 非创世态重扫并更新 pin。best-effort：失败（如门禁拒）**不打断事件流**，如实走完本轮
      // （判定/落盘本体在 finalize.ts；失败结果由下次 settle 重试）。
      return (async function* () {
        for await (const ev of wrapped) {
          if (ev.kind === "handback") {
            yield await recordFinalHandback(ev);
            continue;
          }
          if (ev.kind === "settled") {
            if (autoRepinEnabled) {
              try {
                await repinIfBootstrapped({
                  projectRoot: input.project.projectRoot,
                  skillRoot: input.project.skillRoot,
                  boundary: repinBoundary,
                  governanceBoundaryPath: govPath,
                  // 评审 §5.5：创世态由调用方传当前模型；single 不传，旧 `.ans` 形状逐字不变。
                  ...(governanceModel === "trio" ? { governanceModel: "trio" as const } : {}),
                });
              } catch (err) {
                log.error("session.repin.failed", err);
                /* 自动收尾/重 pin 是 best-effort；失败不打断会话事件流 */
              }
            }
            // §5.7 `artifact.observed`（仅 trio 内置角色、仅预授权目录、仅新增/变更的 `.md`）：
            // 应用算 sha256；账本失败只记诊断，不打断事件流、不回滚角色产物。
            if (artifactScanEnabled) {
              try {
                const artifacts = await scanPreauthorizedArtifacts(input.project.projectRoot, preauthorizedDirs);
                for (const artifact of artifacts) {
                  if (artifactHashes.get(artifact.relPath) === artifact.sha256) continue;
                  artifactHashes.set(artifact.relPath, artifact.sha256);
                  const entry: GovernanceLedgerEntry = {
                    at: new Date().toISOString(),
                    kind: "artifact.observed",
                    actorRoleId: setup.role.id,
                    power: trioSpec!.function,
                    artifactPath: artifact.relPath,
                    artifactSha256: artifact.sha256,
                    ...artifactFlowMetadata(artifact.relPath),
                  };
                  const result = await appendGovernanceLedger(input.project.projectRoot, entry);
                  if (!result.ok) log.record("governance.artifact.append.failed", { message: result.message });
                }
              } catch (err) {
                log.error("governance.artifact.scan.failed", err);
              }
            }
          }
          yield ev;
        }
      })();
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of [...persistenceSubscriptions]) unsubscribe();
      taskReports.clear();
      completedTurns.clear();
      legacyReport = undefined;
      turnIntents.clear();
      legacyIntent = undefined;
      log.record("session.dispose");
      await session.dispose(); // 出错如实抛出（调用方在 finally 收口）
    },
  };
  return base;
}

// —————————————————————— 共用辅助 ——————————————————————

// 角色/边界解析结果：失败带退出码（Usage=未知/缺失角色；Failure=解析异常/parseError）。
type RoleSetup = { ok: true; role: ResolvedRole } | { ok: false; code: number; reason: string };

async function setupRole(
  roleId: string,
  project: ProjectConfig,
  policy: { allowBuiltInRoles: boolean }
): Promise<RoleSetup> {
  // 未知/缺失角色判定（入口意图 + 配置声明，双约束）：
  //  - runRole（CLI `ans role run`，一次性路径）：只接受 project.roles 登记的项目角色（严格）。
  //  - openRoleSession（桌面聊天，会话式入口）：额外接受 project.builtInRoles 声明的内置治理角色。
  // 注意：门禁引擎把**未登记**角色当下沉为内置治理角色（kind=built-in-governance）——那是
  // ans govern 的语义；本层用「入口意图 + 配置声明」双重约束自行判定，**绝不因配置而放宽 CLI**：
  // 内置角色仅当本次入口允许（policy.allowBuiltInRoles）且配置显式声明（project.builtInRoles）时放行。
  const registered = project.roles ? project.roles[roleId] !== undefined : false;
  const declaredBuiltIn =
    policy.allowBuiltInRoles && (project.builtInRoles?.includes(roleId) === true);
  // 未登记且不在（本次入口允许的）内置角色清单 → 用法错误。
  if (!registered && !declaredBuiltIn) {
    return { ok: false, code: EXIT_USAGE, reason: `未知角色：${roleId || "(空)"}（未登记在 project.roles）` };
  }
  try {
    const resolved = await resolveRole(roleId, project);
    const role = resolved.boundary
      ? resolved
      : { ...resolved, boundary: await resolveBoundary(roleId, project) };
    // 边界解析失败（门禁引擎以 parseError 上报）：这是配置/环境错误，命令整体失败。
    if (typeof role.boundary.parseError === "string" && role.boundary.parseError !== "") {
      return { ok: false, code: EXIT_FAILURE, reason: `边界解析失败：${role.boundary.parseError}` };
    }
    return { ok: true, role };
  } catch (err) {
    return { ok: false, code: EXIT_FAILURE, reason: `角色/边界解析失败：${errText(err)}` };
  }
}

// 构造 gate：把 scope（可能为 undefined）原样传给 resolveWrite——无 scope 即不做任务收窄。
function buildGate(
  role: ResolvedRole,
  project: ProjectConfig,
  scope: TaskScope | undefined
): WriteGate {
  return (p) =>
    resolveWrite(p, role.boundary, scope, {
      skillRoot: project.skillRoot,
      projectRoot: project.projectRoot,
    });
}

/**
 * **内置角色预授权写目录**（评审 §5.2/§5.6）——会话**初始 writeSet 恒含**的「项目根相对、含子路径」
 * 目录树：
 *   · trio：注册表 `preauthorizedDirs`（Rapporteur `docs/proposals|contracts|governance/rapporteur`；
 *     Nominator `docs/nominations|skills|mcp|governance/nominator`；Convener `docs/flows|governance/convener`）；
 *   · su（single）：既有四棵 `docs/su`、`docs/contracts`、`docs/skills`、`docs/mcp`（客户裁定 2026-10-16；
 *     单一来源改为门禁引擎 `LEGACY_SU_PREAUTHORIZED_DIRS`，本文件不再另写一份）；
 *   · 项目角色：无预授权。
 *
 * 语义与边界（钉死）：
 * - 它是**初始集合的一部分**——不依赖确认发行器；每次开会话/会话重建都生效。
 * - 实现口径（F4 为**精确匹配**）：求值时把「目标路径本身」的项目根相对词法路径并入本次 writeSet
 *   ——等价于该路径初始就在已发行集中。判定链其余环节（F6 接受门、F7 真实路径逃逸复核、边界条目
 *   匹配、条件激活）**逐字不变**：不在边界内/未接受/逃逸的路径照拒，fail-closed 不放松。
 * - 其余一切路径照旧只认已发行集：未确认 = F4 拒。
 * 背景：`角色卡/编排/docs/fix/2026-10-16_fix_su-notes-preauth.md` 与 G-4 两批变更记录。
 */

/** 目标路径 → **项目根相对词法路径**（取值规则与 resolveWrite 同源）；空/根外 → undefined。 */
function projectRelativeLexical(targetPath: string, projectRoot: string): string | undefined {
  const raw = typeof targetPath === "string" ? targetPath.trim() : "";
  if (raw === "") return undefined;
  const rel = isAbsoluteAny(raw) ? absRel(normalizeLexical(raw), projectRoot) : normalizeLexical(raw);
  if (rel === null || rel === "") return undefined;
  return rel;
}

/**
 * 目标路径落在预授权目录树内 → 返回其项目根相对词法路径；否则 `undefined`。
 * `isUnderOrEqual` 按**段**比较（`docs/mcp2` 不被 `docs/mcp` 覆盖），大小写口径沿用共享原语。
 */
function preauthorizedRelOf(
  targetPath: string,
  projectRoot: string,
  dirs: readonly string[],
): string | undefined {
  const rel = projectRelativeLexical(targetPath, projectRoot);
  if (rel === undefined) return undefined;
  return dirs.some((dir) => isUnderOrEqual(rel, dir)) ? rel : undefined;
}

/**
 * 内置角色会话 gate 求值入口：目标在预授权树内 ⇒ 把其项目根相对路径**并入本次 writeSet**（不经发行器）；
 * 其余 ⇒ **原样返回 base**（零行为变化）。base 由调用方保证非 undefined（确认制动态集或静态 scope）；
 * `scope === undefined` 的「不做任务收窄」会话**不经过本函数**。
 */
function scopeWithBuiltInPreauthorization(
  base: TaskScope,
  targetPath: string,
  projectRoot: string,
  dirs: readonly string[],
): TaskScope {
  const rel = preauthorizedRelOf(targetPath, projectRoot, dirs);
  if (rel === undefined) return base;
  return { writeSet: [...base.writeSet, rel], conditions: base.conditions };
}

/**
 * 越界写入的**归属指引**（与门禁引擎 AC3 的 Liaison 归属文案同口径；2026-10-18 协调口径）。
 * 只影响**拒绝文案**，不改变 `forbiddenWritePaths` 的放行/拒绝判定。
 * 顺序敏感：应用独占路径先于「角色卡/」等宽前缀匹配。
 */
function governanceWriteOwnerHint(rel: string): string {
  const hints: ReadonlyArray<{ prefixes: readonly string[]; guidance: string }> = [
    {
      prefixes: [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
      guidance: "该路径只能由应用写（治理记录/账本/边界文档/manifest），任何角色都不可写。",
    },
    {
      prefixes: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
      guidance: "该路径属报告员 Rapporteur 的写区（提案/契约）；请把客户意图交给报告员，由报告员形成提案。",
    },
    {
      prefixes: [
        "角色卡/",
        "docs/nominations/",
        "docs/skills/",
        "docs/mcp/",
        "docs/governance/nominator/",
      ],
      guidance: "该路径属提名官 Nominator 的写区（角色/提名/技能/MCP）；请交给提名官。",
    },
    {
      prefixes: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
      guidance: "该路径属召集人 Convener 的写区（流程/编排）；请交给召集人。",
    },
  ];
  for (const hint of hints) {
    const hit = hint.prefixes.some((prefix) => {
      const relLower = rel.toLowerCase();
      const prefixLower = prefix.toLowerCase();
      return prefix.endsWith("/") ? relLower.startsWith(prefixLower) : relLower === prefixLower;
    });
    if (hit) return hint.guidance;
  }
  return "该路径属应用治理记录或其他治理角色，当前角色不可写。";
}

/**
 * trio 门禁包装的**第一道**：`forbiddenWritePaths`（应用独占 + 其他治理角色资料）。
 * 命中即拒（先于三道门禁与 `resolveWrite`）；文案指回归属（AC3 口径）。
 */
function forbiddenWriteDecision(
  spec: BuiltInGovernanceRoleSpec,
  rel: string | undefined,
): WriteDecision | undefined {
  if (rel === undefined) return undefined;
  const hit = spec.forbiddenWritePaths.some((prefix) => isUnderOrEqual(rel, prefix));
  if (!hit) return undefined;
  return {
    allowed: false,
    reason: `拒绝写入 ${rel}：${governanceWriteOwnerHint(rel)}`,
    allowedByRoot: { skill: [], project: [] },
  };
}

/** 路径 → 三道门禁动作（只认固定形状；写流程/提名的非标准文件名 → 无 flowId，门禁 fail-closed）。 */
interface RoutedGovernanceAction {
  action: GovernanceGateAction;
  flowId?: string;
  targetRoleId?: string;
}

function governanceActionForPath(rel: string | undefined): RoutedGovernanceAction | undefined {
  if (rel === undefined) return undefined;
  const parts = rel.split("/");
  if (parts[0] === "docs" && parts[1] === "flows") {
    if (parts.length === 3 && parts[2].endsWith(".md")) {
      const flowId = parts[2].slice(0, -".md".length);
      return { action: "write-flow", ...(isGovernanceFlowId(flowId) ? { flowId } : {}) };
    }
    if (parts.length > 3) return { action: "write-flow" }; // 非标准子路径：无 flowId → 拒
    return undefined;
  }
  if (parts[0] === "docs" && parts[1] === "nominations") {
    if (parts.length === 3 && parts[2].endsWith(".md")) {
      const match = /^(.+)-v\d+\.md$/.exec(parts[2]);
      return {
        action: "write-nomination",
        ...(match !== null && isGovernanceFlowId(match[1]) ? { flowId: match[1] } : {}),
      };
    }
    if (parts.length > 3) return { action: "write-nomination" };
    return undefined;
  }
  if (parts[0] === "角色卡" && parts.length >= 3) {
    return { action: "write-role-card", targetRoleId: parts[1] };
  }
  return undefined;
}

/** 治理 flowId 形状（与运行时核心 `GOVERNANCE_SLUG_PATTERN` 同值；本地再判一次，不导入运行时实现）。 */
const GOVERNANCE_FLOW_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function isGovernanceFlowId(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_FLOW_ID_RE.test(value);
}

/**
 * 同一会话内的治理操作串行链（W6-A）：交接「每轮一次/去重」与澄清「两轮上限」的机械判定依赖
 * 「前一次已落账」；模型可能同轮并行发起多次工具调用，故按会话串行执行（前一条失败不影响后一条）。
 */
function serializeGovernanceTask<T>(
  state: { chain: Promise<void> },
  task: () => Promise<T>,
): Promise<T> {
  const run = state.chain.then(task, task);
  state.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 每角色允许的 `cardKind` 白名单（评审 §5.8 表；越权不弹卡，由 customerInput 包装器直接拒绝）。 */
const TRIO_CARD_KINDS: Record<BuiltInGovernanceRoleSpec["id"], readonly GovernanceCardKind[]> = {
  // W6-A：Liaison 的 `customerInput=false`（只用聊天与 hand_off_intent）——空白名单是结构性兜底：
  // 即便调用方误给客户通道，任何治理卡也会被包装器拒绝。
  liaison: [],
  rapporteur: ["proposal", "acceptance", "write"],
  nominator: ["appointment", "appointment-write", "write"],
  convener: ["schedule-write", "write"],
};

/** 账本条目签名（本会话内存合并去重用；只比较能唯一识别一次决定/事件的字段）。 */
function ledgerEntrySignature(entry: GovernanceLedgerEntry): string {
  return [
    entry.at,
    entry.kind,
    entry.actorRoleId,
    entry.flowId ?? "",
    entry.decisionKind ?? "",
    entry.artifactPath ?? "",
    (entry.targetRoleIds ?? []).join(","),
    entry.customerDecision ?? "",
  ].join("\u0000");
}

function sameLedgerEntry(a: GovernanceLedgerEntry, b: GovernanceLedgerEntry): boolean {
  return ledgerEntrySignature(a) === ledgerEntrySignature(b);
}

type CustomerDecisionClassification = {
  decisionKind?: GovernanceDecisionKind;
  customerDecision?: GovernanceLedgerEntry["customerDecision"];
  targetRoleIds?: string[];
};

/**
 * 按 `cardKind` + 客户**实际返回**（`CustomerInputOutcome`）分类；**不采信角色自述**：
 *   · `unavailable`/null → `undefined`（没有客户决定，不写账本）；
 *   · `declined` → `unclassified`（fail-closed：后续依赖该 flow 决定的门禁拒，直至客户重新决定）；
 *   · `answered` + 标准选项 id → 评审 §5.8 映射；非标准/多选冲突 → `unclassified`。
 */
function classifyCustomerDecision(
  cardKind: GovernanceCardKind | undefined,
  out: CustomerInputOutcome | null | undefined,
): CustomerDecisionClassification | undefined {
  if (out === null || out === undefined) return undefined;
  if (out.outcome === "unavailable") return undefined;
  if (out.outcome === "declined") return { decisionKind: "unclassified", customerDecision: "none" };

  const selected = Array.isArray(out.value.selected) ? out.value.selected : [];
  switch (cardKind) {
    case "proposal": {
      const recognized = selected.filter((id) =>
        ["accept", "accept-quick", "revise", "reject"].includes(id),
      );
      if (recognized.length !== 1) return { decisionKind: "unclassified", customerDecision: "none" };
      switch (recognized[0]) {
        case "accept":
          return { decisionKind: "proposal-accept", customerDecision: "accepted" };
        case "accept-quick":
          return { decisionKind: "proposal-accept-quick", customerDecision: "accepted-quick" };
        case "revise":
          return { decisionKind: "proposal-revise", customerDecision: "changes-requested" };
        default:
          return { decisionKind: "proposal-reject", customerDecision: "rejected" };
      }
    }
    case "appointment":
      return selected.length > 0
        ? { decisionKind: "appointment", customerDecision: "appointed", targetRoleIds: [...selected] }
        : { decisionKind: "unclassified", customerDecision: "none" };
    case "acceptance": {
      if (selected.length !== 1 || !["accept", "reject"].includes(selected[0])) {
        return { decisionKind: "unclassified", customerDecision: "none" };
      }
      return {
        decisionKind: "acceptance",
        customerDecision: selected[0] === "accept" ? "accepted" : "rejected",
      };
    }
    case "appointment-write":
    case "schedule-write":
      return {
        decisionKind: cardKind,
        customerDecision: out.value.confirmed === true ? "accepted" : "rejected",
      };
    case "write":
      // 普通写盘确认：不解锁任何治理门禁（无 decisionKind）；仍留痕客户是否同意。
      return { customerDecision: out.value.confirmed === true ? "accepted" : "rejected" };
    default:
      return { decisionKind: "unclassified", customerDecision: "none" };
  }
}

/**
 * `customer.decision` 写入（评审 §5.7/§5.8）：仅 trio 内置角色、仅带合法 `flowId` 的卡。
 * 同步更新内存快照（本会话后续写入立即受该决定约束），异步补 artifact 哈希并落盘；
 * 账本失败只记诊断，**不改变客户决定、不放宽门禁、不阻断写盘**（§九-16）。
 */
function recordCustomerDecision(args: {
  state: { snapshot: GovernanceLedgerSnapshot; local: GovernanceLedgerEntry[] };
  projectRoot: string;
  roleId: string;
  function: GovernanceFunction;
  req: CustomerInputRequest;
  metadata?: CustomerInputMetadata;
  out: CustomerInputOutcome | null | undefined;
  issuedPaths: string[];
  sessionId?: string;
  runtime?: RuntimeKind;
  log: ReturnType<typeof createDiagnosticLogger>;
}): void {
  const flowId = args.req.flowId ?? args.metadata?.flowId;
  if (!isGovernanceFlowId(flowId)) return; // 无治理流程上下文的普通交互：不写账本
  const cardKind = args.req.cardKind ?? args.metadata?.cardKind;
  const classification = classifyCustomerDecision(cardKind, args.out);
  if (classification === undefined) return;

  const stepId = args.req.stepId ?? args.metadata?.stepId;
  const evidence: GovernanceLedgerEntry["decisionEvidence"] = {
    kind: "customer-input",
    ...(typeof args.metadata?.toolCallId === "string" && args.metadata.toolCallId !== ""
      ? { toolCallId: args.metadata.toolCallId }
      : {}),
    ...(typeof args.metadata?.turnId === "string" && args.metadata.turnId !== ""
      ? { turnId: args.metadata.turnId }
      : {}),
    ...(typeof args.sessionId === "string" && args.sessionId !== ""
      ? { sessionId: args.sessionId }
      : {}),
  };
  const entry: GovernanceLedgerEntry = {
    at: new Date().toISOString(),
    kind: "customer.decision",
    flowId,
    ...(isGovernanceFlowId(stepId) ? { stepId } : {}),
    actorRoleId: args.roleId,
    power: cardKind === "acceptance" ? "acceptance" : args.function,
    ...(classification.decisionKind !== undefined
      ? { decisionKind: classification.decisionKind }
      : {}),
    ...(classification.targetRoleIds !== undefined
      ? { targetRoleIds: classification.targetRoleIds }
      : {}),
    ...(classification.customerDecision !== undefined
      ? { customerDecision: classification.customerDecision }
      : {}),
    ...(args.issuedPaths.length > 0 ? { paths: [...args.issuedPaths] } : {}),
    decisionEvidence: evidence,
    messageSummary: truncateText(args.req.title, 200),
    ...(args.runtime !== undefined ? { runtime: args.runtime } : {}),
  };

  // 同步快照：客户决定即刻生效（本会话后续写盘不再等磁盘）。
  args.state.local.push(entry);
  args.state.snapshot = {
    entries: [...args.state.snapshot.entries, entry],
    errors: args.state.snapshot.errors,
  };

  void (async () => {
    try {
      const artifact = await findDecisionArtifact(args.projectRoot, entry, args.issuedPaths);
      if (artifact !== undefined) Object.assign(entry, artifact);
      const result = await appendGovernanceLedger(args.projectRoot, entry);
      if (!result.ok) args.log.record("governance.decision.append.failed", { message: result.message });
    } catch (err) {
      args.log.error("governance.decision.append.failed", err);
    }
  })();
}

function truncateText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * 为客户决定补 `artifactPath`/`artifactVersion`/`artifactSha256`（应用算；评审 §5.7）。
 * 找不到对应候选物（如尚未写出的 flow 文件）→ 不补，不阻断、不猜。
 */
async function findDecisionArtifact(
  projectRoot: string,
  entry: GovernanceLedgerEntry,
  issuedPaths: string[],
): Promise<Pick<GovernanceLedgerEntry, "artifactPath" | "artifactVersion" | "artifactSha256"> | undefined> {
  let candidate: string | undefined;
  let version: number | undefined;

  if (entry.decisionKind === "appointment") {
    const latest = await latestVersionedArtifact(projectRoot, "docs/nominations", entry.flowId);
    candidate = latest?.relPath;
    version = latest?.version;
  } else if (entry.decisionKind === "schedule-write") {
    candidate = entry.flowId !== undefined ? `docs/flows/${entry.flowId}.md` : undefined;
  } else if (entry.decisionKind === "appointment-write" || entry.decisionKind === undefined) {
    candidate = issuedPaths.find((p) => p.endsWith(".md")) ?? issuedPaths[0];
  } else if (
    entry.decisionKind === "proposal-accept" ||
    entry.decisionKind === "proposal-accept-quick" ||
    entry.decisionKind === "proposal-revise" ||
    entry.decisionKind === "proposal-reject" ||
    entry.decisionKind === "acceptance"
  ) {
    const latest = await latestVersionedArtifact(projectRoot, "docs/proposals", entry.flowId);
    candidate = latest?.relPath;
    version = latest?.version;
  }

  if (candidate === undefined) return undefined;
  try {
    const data = await readFile(path.join(projectRoot, candidate));
    return {
      artifactPath: candidate,
      ...(version !== undefined ? { artifactVersion: version } : {}),
      artifactSha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch {
    return undefined;
  }
}

/** 在 `docs/proposals|nominations` 中找 `<flowId>-v<N>.md` 的最高版本。 */
async function latestVersionedArtifact(
  projectRoot: string,
  dirRel: string,
  flowId: string | undefined,
): Promise<{ relPath: string; version: number } | undefined> {
  if (!isGovernanceFlowId(flowId)) return undefined;
  let names: string[];
  try {
    names = await readdir(path.join(projectRoot, dirRel));
  } catch {
    return undefined;
  }
  const pattern = new RegExp(`^${flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-v(\\d+)\\.md$`);
  let best: { name: string; version: number } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (best === undefined || version > best.version) best = { name, version };
  }
  return best === undefined ? undefined : { relPath: `${dirRel}/${best.name}`, version: best.version };
}

/** 预授权目录下 `.md` 的递归扫描结果（项目相对 posix 路径 + 应用算的 sha256）。 */
interface ObservedArtifact {
  relPath: string;
  sha256: string;
}

/**
 * 扫描预授权目录内的 `.md`（评审 §5.7：`artifact.observed` 只扫角色预授权目录，不扫 `角色卡/` 全树）。
 * 跳过符号链接（防经链接逃逸），按路径排序保证顺序稳定。
 */
async function scanPreauthorizedArtifacts(
  projectRoot: string,
  dirs: readonly string[],
): Promise<ObservedArtifact[]> {
  const out: ObservedArtifact[] = [];
  const seen = new Set<string>();
  const walk = async (absDir: string, relDir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path.join(absDir, entry.name), rel);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      try {
        const data = await readFile(path.join(projectRoot, ...rel.split("/")));
        out.push({ relPath: rel, sha256: createHash("sha256").update(data).digest("hex") });
      } catch {
        /* 读失败：跳过本次观察（下次 settle 再试） */
      }
    }
  };
  for (const dir of dirs) {
    const relDir = dir.replace(/\\/g, "/").replace(/\/+$/, "");
    if (relDir === "") continue;
    const abs = path.join(projectRoot, ...relDir.split("/"));
    try {
      const info = await stat(abs);
      if (!info.isDirectory()) continue;
    } catch {
      continue;
    }
    await walk(abs, relDir);
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** 从候选物路径推导报告用的 flowId / 版本（只用于账本留痕；不做任何门禁判定）。 */
function artifactFlowMetadata(relPath: string): Pick<GovernanceLedgerEntry, "flowId" | "artifactVersion"> {
  const proposal = /^docs\/(?:proposals|nominations)\/(.+)-v(\d+)\.md$/.exec(relPath);
  if (proposal !== null && isGovernanceFlowId(proposal[1])) {
    return { flowId: proposal[1], artifactVersion: Number(proposal[2]) };
  }
  const flow = /^docs\/flows\/(.+)\.md$/.exec(relPath);
  if (flow !== null && isGovernanceFlowId(flow[1])) return { flowId: flow[1] };
  return {};
}

/**
 * D-1：会话自持目录的**约定路径**，`<projectRoot>/.ans/sessions/<roleId>/`（含尾分隔符）。
 * 不满足前置（projectRoot 为空 / roleId 为空、含路径分隔符或 `..`）→ `undefined`（不持久化，旧行为）。
 * **本函数只算路径**；目录的创建归适配器（见 `AdapterCapabilities.sessionDir` 注释）。
 */
function sessionDirFor(projectRoot: string, roleId: string, runtime?: RuntimeKind): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  if (roleId === "" || roleId.includes("/") || roleId.includes("\\") || roleId.includes("..")) return undefined;
  const dir = path.join(projectRoot, ".ans", "sessions", roleId, ...(runtime ? [runtime] : []));
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

// 构造传给会话的任务提示：含一个**具体、可判定**的改动要求，指向该角色边界与 writeSet 内
// 真实可写的文件——使（真实模型的）会话确实发起一次写入，从而验证扩展 on("tool_call") 在运行期
// 触发，而不是只回头索要需求。目标取 writeSet 首项（按定义是角色边界的真子集，故确可写）；
// 无 scope（chat）时不给具体文件，只给边界约束。
function buildTaskPrompt(taskId: string | undefined, scope: TaskScope | undefined): string {
  const idPart = taskId !== undefined && taskId !== "" ? `任务 ${taskId}：` : "";
  const target = scope && scope.writeSet.length > 0 ? scope.writeSet[0] : undefined;
  const head =
    idPart +
    (scope
      ? "请在批准的写集内工作；越界或写集外的写入会在写入之前被门禁拒绝。"
      : "请在角色的授权边界内工作；越界写入会在写入之前被门禁拒绝。");
  if (target === undefined) return head;
  return (
    `${head}\n` +
    `具体改动要求：请编辑文件 ${target}，在其顶部新增一行注释「// [${taskId}] 受治理会话运行时确认」，` +
    `并**用 write_file 或 edit_file 实际发起这次写入**（这是本任务可判定的验收点；不要只回答计划）。`
  );
}

/** Compatibility factory shape; capability injection still controls tool registration. */
export type RuntimeAdapterFactory = (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
export type AdapterFactoryBuilder = (project: ProjectConfig, shellGate?: ShellGate) => RuntimeAdapterFactory;
export type RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions, "runtime" | "gate" | "projectRoot" | "skillRoot">;
export type RuntimeAdapterFactoryBuilder = (project: ProjectConfig, runtime: RuntimeKind, options?: RuntimeAdapterFactoryOptions) => RuntimeAdapterFactory;
export interface RoleSessionDeps {
  createAdapter?: RuntimeAdapterFactory;
  runtimeOptions?: RuntimeAdapterFactoryOptions;
}

/** Fixed engine, shared governed tools, exact project roots; no fallback engine. */
export function createRuntimeAdapterFactory(
  project: ProjectConfig,
  runtime: RuntimeKind,
  options: RuntimeAdapterFactoryOptions = {},
): RuntimeAdapterFactory {
  if (!(RUNTIME_KINDS as readonly string[]).includes(runtime)) throw new Error(`未知运行时：${runtime}`);
  return (gate, capabilities) => createRuntimeAdapter({
    ...options,
    runtime, gate, projectRoot: project.projectRoot, skillRoot: project.skillRoot,
    readRoot: project.projectRoot,
    writeRoot: runtime === "demo" ? options.writeRoot : project.projectRoot,
    shellCwd: project.projectRoot,
    persistSession: capabilities?.persistSession ?? options.persistSession ?? (capabilities?.sessionDir !== undefined),
    customerInput: capabilities?.customerInput,
    reportHandback: capabilities?.reportHandback,
    dispatchTask: capabilities?.dispatchTask,
    // W6-A：意图交接/澄清两能力并入适配器选项——**契约字段名** `handOffIntent` /
    // `requestClarification`（运行时核心 `GovernedToolsOptions` 同名能力位，形状同源
    // `model/runtime.ts`）；`undefined` ⇒ 对应工具不注册（最弱接触面，同 dispatch_task 先例）。
    handOffIntent: capabilities?.handOffIntent,
    requestClarification: capabilities?.requestClarification,
    // G-2/R1-R2：看护三能力并入适配器选项——**契约字段名** `roleStatus` / `sessionTail` /
    // `proposeRecovery`（运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 dispatch_task 先例）。
    roleStatus: capabilities?.roleStatus,
    sessionTail: capabilities?.sessionTail,
    proposeRecovery: capabilities?.proposeRecovery,
    // G-4/I1-I2：技能安装/卸载两能力并入适配器选项——**契约字段名** `installSkill` / `uninstallSkill`
    // （运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 dispatch_task 先例）。
    installSkill: capabilities?.installSkill,
    uninstallSkill: capabilities?.uninstallSkill,
    // G-4/V2：MCP 安装/卸载两能力并入适配器选项——**契约字段名** `installMcp` / `uninstallMcp`
    // （运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 install_skill 先例）。
    installMcp: capabilities?.installMcp,
    uninstallMcp: capabilities?.uninstallMcp,
    // 「替我审」判断会话：只读能力注入（运行时核心 `GovernedToolsOptions.shellJudge` 同名能力位）。
    // 注入 ⇒ Service 走 `buildShellJudgeTools` + `judgeMode:true` + 外来 MCP 置空；
    // `undefined` ⇒ 普通会话（逐字现状）。
    shellJudge: capabilities?.shellJudge ?? options.shellJudge,
    shellGate: capabilities?.shellGate ?? options.shellGate,
    shellVerdict: capabilities?.shellVerdict,
  });
}

export function selectAdapterFactory(
  runtime: RuntimeKind,
  project: ProjectConfig,
  deps: {
    createAdapter?: RuntimeAdapterFactory;
    piFactory?: AdapterFactoryBuilder;
    shellGate?: ShellGate;
    runtimeFactory?: RuntimeAdapterFactoryBuilder;
    runtimeOptions?: RuntimeAdapterFactoryOptions;
  } = {},
): RuntimeAdapterFactory {
  if (!(RUNTIME_KINDS as readonly string[]).includes(runtime)) throw new Error(`未知运行时：${runtime}`);
  if (deps.runtimeFactory) return deps.runtimeFactory(project, runtime, { ...deps.runtimeOptions, ...(deps.shellGate !== undefined ? { shellGate: deps.shellGate } : {}) });
  if (runtime === "pi" && deps.piFactory) return deps.piFactory(project, deps.shellGate);
  if (runtime === "demo" && deps.createAdapter && !deps.runtimeOptions) return deps.createAdapter;
  return createRuntimeAdapterFactory(project, runtime, { ...deps.runtimeOptions, ...(deps.shellGate !== undefined ? { shellGate: deps.shellGate } : {}) });
}

/** Existing Pi public name now composes the neutral Service. */
export function createPiAdapterFactory(project: ProjectConfig, shellGate?: ShellGate): RuntimeAdapterFactory {
  return createRuntimeAdapterFactory(project, "pi", { shellGate });
}

/** ANS replay only; native resume is reported by the session's dynamic getters. */
export async function readRoleSessionHistory(
  options: { projectRoot: string; roleId: string; runtime: RuntimeKind },
  context?: { credentialEnvNames?: readonly string[] },
): ReturnType<typeof import("../../service/runtime/session.ts").readRuntimeSessionHistory> {
  const service = await import("../../service/runtime/session.ts");
  return service.readRuntimeSessionHistory({ ...options, credentialEnvNames: context?.credentialEnvNames });
}

/** Host-only context: renderer text/requests never choose credential names or history entries. */
export function projectRoleLegacyHistory(
  input: { projectRoot: string; roleId: string; runtime: "pi"; readOk: boolean;
    entries: readonly RuntimeLegacyHistoryEntryV1[]; source?: string; error?: string; skipped: number },
  context?: { credentialEnvNames?: readonly string[] },
): RuntimeLegacyHistoryProjectionV1 {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === ""
    || typeof input.roleId !== "string" || input.roleId.trim() === "" || input.runtime !== "pi") {
    return { ok: false, version: 1, code: "INVALID_INPUT", message: { text: "历史范围无效。", redacted: false, truncated: false }, entries: [] };
  }
  return projectRuntimeLegacyHistory({ scope: { roleId: input.roleId, runtime: input.runtime },
    readOk: input.readOk, entries: input.entries, source: input.source, error: input.error,
    skipped: input.skipped, credentialEnvNames: context?.credentialEnvNames });
}

function trustedCredentialNames(options?: RuntimeAdapterFactoryOptions): readonly string[] {
  const names = [...(options?.extraCredentialEnvVars ?? [])];
  if (options?.apiKeyEnvVar) names.push(options.apiKeyEnvVar);
  return [...new Set(names.filter(name => typeof name === "string" && name.trim() !== ""))];
}

export function isFailedSettlement(event: SessionEvent): boolean {
  if (event.kind !== "settled") return false;
  const outcome = (event.detail as { outcome?: unknown } | undefined)?.outcome;
  return outcome === "failed" || outcome === "aborted" || outcome === "timed_out";
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
