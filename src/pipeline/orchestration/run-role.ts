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

import type { ProjectConfig, ResolvedRole } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";
import path from "node:path";
import { resolveRole } from "../../service/role/resolve-role.ts";
import { resolveBoundary } from "../../service/boundary/resolve-boundary.ts";
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
  DispatchTaskFn,
  OperatorChannelFn,
  PromptOptions,
  ReportHandbackFn,
  ReportHandbackMetadata,
} from "../../model/runtime.ts";
import { createRuntimeAdapter, type RuntimeSessionOptions } from "../../service/runtime/session.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import {
  assembleProjectShellGate,
  assembleReadonlyShellGate,
  type AssembleShellGateOptions,
  type AssembleReadonlyShellGateOptions,
  type RoutineShellPolicy,
} from "./shell-arming.ts";
import { formatEvent } from "../../common/编排/output.ts";
import { withHandback, type OrchestrationEvent, type TaskReport, normalizeTaskReport } from "../../common/编排/handback.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../common/编排/exit-codes.ts";
import type { ShellVerdictFn } from "../../common/编排/shell-gate.ts";
import { repinIfBootstrapped, DEFAULT_GOVERNANCE_BOUNDARY_REL } from "../../common/编排/finalize.ts";
import { conditionSlugsOf, createConfirmedWriteIssuer } from "../../common/编排/confirmed-writes.ts";
import { CLI_POSITIONING } from "../../common/编排/cli-positioning.ts";
import { createDiagnosticLogger } from "../../common/shared/diagnostics.ts";

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
 * · `shellGate`（I-1 开放 shell + su 只读档；未注入 ⇒ `run_shell` 不注册）——**项目角色**经三层链注入
 *   （`openRoleSession` 收到 `shellOperatorChannel` 时经 `assembleProjectShellGate` 装配）；**su** 经
 *   **只读档**注入（收到 `shellReadonly` 时经 `assembleReadonlyShellGate` 装配——客户裁定 2026-10-12：
 *   「su 也要有 shell，但是只读」）。比工厂第二参优先（`capabilities?.shellGate ?? shellGate`）。
 * · `shellVerdict`（R-1 shell 审读结论工具；未注入 ⇒ `report_shell_verdict` 不注册）——**审读会话专用**
 *   （由 `pm-reviewer` 注入；形状单一来源 `common/编排/shell-gate.ts`）。
 */
export interface AdapterCapabilities {
  customerInput?: CustomerInputFn;
  reportHandback?: ReportHandbackFn;
  sessionDir?: string;
  runtime?: RuntimeKind;
  persistSession?: boolean;
  dispatchTask?: DispatchTaskFn;
  shellGate?: ShellGate;
  shellVerdict?: ShellVerdictFn;
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

export interface RoleSessionHandle {
  readonly runtime?: RuntimeKind;
  readonly roleId?: string;
  readonly contextSource?: RuntimeContextSource;
  readonly nativeSessionId?: string;
  readonly contextWarning?: string;
  /**
   * 发送一轮输入；可反复调用（底层同一会话，不重建）。
   * **P0-1 图片接线（2026-10-13 客户批准）**：`opts` 为**可选**图片载荷——整包**原样透传**给底层会话的
   * `prompt(text, opts)`（契约单一来源 `PromptOptions`，从 `src/model/runtime.ts` 只读导入，
   * **不复制形状**；`images` 为契约 `PromptImage` 块，**空数组 = 无图**，同样原样透传）。
   * **不传 `opts` 时行为逐字不变**（纯文本，调用形态也与旧版逐字一致）。多模态与否不由本层猜测；
   * 队列入队定格与桌面接线为**后环**（桌面环节），本层只保证句柄层透传保真。
   */
  send(text: string, opts?: PromptOptions): Promise<void>;
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
  // gate（A-3）：有 `customerInput` ⇒ 确认制动态 writeSet（初始为空，发行器追加）；
  // 无 ⇒ 原样传 input.scope（可为 undefined = 不收窄，旧语义逐字不变）。
  const confirmationMode = input.customerInput !== undefined;
  const issued = new Set<string>();
  const conditions = conditionSlugsOf(setup.role.boundary);
  const gate: WriteGate = confirmationMode
    ? (p) =>
        resolveWrite(p, setup.role.boundary, { writeSet: [...issued], conditions }, {
          skillRoot: input.project.skillRoot,
          projectRoot: input.project.projectRoot,
        })
    : buildGate(setup.role, input.project, input.scope);

  // 客户通道包装（A-3）：客户确认后，把「已预览且校验在边界内的具体路径」发行进 writeSet。
  // 只做「确认 → 发行」；裁决结果原样返回（不改答案、不写盘、不成败判定都在别处）。
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
          const out = await raw(req, metadata);
          issue(req, out ?? null, originalMetadata);
          return out;
        };
      })()
    : undefined;

  // 回交（设计 §10.8）：角色会话 settle → 编排发 `handback` 事件，交回 su。**内置治理角色（su）自身
  // 不回交**（回交的主体是**其他角色**，目的地才是 su）——故对 built-in-governance 角色**不挂**回交。
  const suppressHandback = setup.role.kind === "built-in-governance";

  // 交报告（C-1）：**只给回交主体（非 su）**注入 `reportHandback`——模型经 `submit_report` 交的报告
  // （`summary`/`evidence`/`status`）正常终局优先取报告值；su 不注入。无合法报告明确未报告。
  // 报告按运行时轮次保存，终局消费。无 metadata 的旧替身仅保留单轮兼容值。
  const taskReports = new Map<string, TaskReport>();
  const completedTurns = new Set<string>();
  let legacyReport: TaskReport | undefined;
  const reportHandback = suppressHandback
    ? undefined
    : (report: TaskReport, metadata?: ReportHandbackMetadata): void => {
        const turnId = metadata?.turnId;
        const normalized = normalizeTaskReport(report);
        const invalidMetadata = metadata !== undefined && (typeof turnId !== "string" || turnId === "");
        if (normalized === undefined || invalidMetadata || (turnId !== undefined && completedTurns.has(turnId))) {
          log.record("report.ignored", { turnId, reasonCode: normalized === undefined ? "invalid-report" : invalidMetadata ? "invalid-turn" : "closed-turn" });
          return;
        }
        if (turnId !== undefined) taskReports.set(turnId, normalized);
        else legacyReport = normalized;
        log.record("report.received", { turnId, state: normalized.status, reportSource: "submit_report", count: normalized.evidence?.length ?? 0 });
      };

  // D-1：能力面携带所选角色/runtime 的路径；实际 store 由 Service 按所选 runtime 建立。
  // 编排只**算路径**、**不预建目录**（创建归适配器在真正落盘时做——理由见 AdapterCapabilities.sessionDir）。
  // projectRoot 为空 / roleId 不安全 / **`persistSession:false`（R-1 审读会话）** → 不传（in-memory）。
  const sessionDir =
    input.persistSession === false ? undefined : sessionDirFor(input.project.projectRoot, setup.role.id, input.runtime);

  // H-1 派发任务：**只给治理角色（su）**转交前端路由能力——项目角色会话不注入（`dispatch_task` 只给 su）。
  const dispatchTask = suppressHandback ? input.dispatchTask : undefined;

  // I-1 开放 shell（项目角色三层链）+ **su 只读档**（客户裁定 2026-10-12）——两档共用同一个
  // `shellGate` 能力位（「注入才注册」：注入了 ⇒ Pi 适配器注册 `run_shell`；未注入/装配失败 ⇒
  // **不 arm**，能力缺席 = fail-closed，绝不放宽）。
  // 优先级（确定行为，写明）：**`shellReadonly` 优先**——给出即按只读档装配。对 **su** 这是设计指向的
  // 用途（「su 也要有 shell，但是只读」；三层链恒不对 su arm，故只读档不能再加 `!suppressHandback`
  // 前缀，否则 su 永远 arm 不上）；对**项目角色**给出时按更严的一档处理（只读档执行集严格 ⊆ 三层链）。
  // 仅当未给 `shellReadonly` 时，才走既有 `shellOperatorChannel`/`shellArming` 三层链（项目角色，逐字不变）。
  let shellGate: ShellGate | undefined;
  if (input.shellReadonly !== undefined) {
    try {
      shellGate = await assembleReadonlyShellGate({ project: input.project, ...input.shellReadonly });
    } catch (err) {
      log.error("shell.arming.failed", err);
      shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
    }
  } else if (!suppressHandback && input.shellOperatorChannel !== undefined) {
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
  log.record("session.open.ready");

  // 自动收尾的授权边界 = **本会话解析出的边界**（创世态下即治理种子边界；普通角色下即其项目
  // 边界）——与 su 同一授权。治理边界文档落点：项目未声明（如桌面创世 `path` 为空串）时用默认约定路径。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;

  // 自动收尾 + 自动重 pin（A-4 / §13.3）：缺省仅**内置治理角色（su）会话**开启。
  // `repinIfBootstrapped`：创世态 = **首次收尾**（无可 pin 之物 → 零副作用）；非创世态 = 重扫更新 pin。
  const autoRepinEnabled = input.autoRepin ?? setup.role.kind === "built-in-governance";

  let disposed = false;
  const base: RoleSessionHandle = {
    get runtime() { return session.runtime ?? input.runtime; },
    get roleId() { return session.roleId ?? setup.role.id; },
    get contextSource() { return session.contextSource; },
    get nativeSessionId() { return session.nativeSessionId; },
    get contextWarning() { return session.contextWarning; },
    async send(text: string, opts?: PromptOptions): Promise<void> {
      legacyReport = undefined;
      log.record("session.send.start");
      try {
      // P0-1：opts **原样透传**（同一引用，不克隆不筛选——空数组=无图也原样交给会话）；
      // 不传 opts 时调用形态与旧版逐字一致（单参），行为逐字不变。
        if (opts === undefined) {
          await session.prompt(text);
        } else {
          await session.prompt(text, opts);
        }
        log.record("session.send.end");
      } catch (err) {
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
    events(): AsyncIterable<OrchestrationEvent> {
      const stream = session.events();
      const wrapped = suppressHandback
        ? stream
        : withHandback(stream, { roleId: setup.role.id, taskId: input.taskId }, {
            projectRoot: input.project.projectRoot,
            report: (turnId) => turnId !== undefined ? taskReports.get(turnId) : legacyReport,
            completed: (turnId) => {
              if (turnId !== undefined) {
                completedTurns.add(turnId);
                taskReports.delete(turnId);
              } else legacyReport = undefined;
            },
          });
      // 每轮 settle 后**自动收尾 / 自动重 pin**：创世态首次写出 `.ans`（+治理边界文档+manifest），
      // 非创世态重扫并更新 pin。best-effort：失败（如门禁拒）**不打断事件流**，如实走完本轮
      // （判定/落盘本体在 finalize.ts；失败结果由下次 settle 重试）。
      return (async function* () {
        for await (const ev of wrapped) {
          if (ev.kind === "settled") {
            if (autoRepinEnabled) {
              try {
                await repinIfBootstrapped({
                  projectRoot: input.project.projectRoot,
                  skillRoot: input.project.skillRoot,
                  boundary: setup.role.boundary,
                  governanceBoundaryPath: govPath,
                });
              } catch (err) {
                log.error("session.repin.failed", err);
                /* 自动收尾/重 pin 是 best-effort；失败不打断会话事件流 */
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
      taskReports.clear();
      completedTurns.clear();
      legacyReport = undefined;
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
export async function readRoleSessionHistory(options: { projectRoot: string; roleId: string; runtime: RuntimeKind }): Promise<{ record?: RuntimeSessionRecord; entries: RuntimeReplayEntry[] }> {
  const service = await import("../../service/runtime/session.ts");
  return service.readRuntimeSessionHistory(options);
}

export function isFailedSettlement(event: SessionEvent): boolean {
  if (event.kind !== "settled") return false;
  const outcome = (event.detail as { outcome?: unknown } | undefined)?.outcome;
  return outcome === "failed" || outcome === "aborted" || outcome === "timed_out";
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
