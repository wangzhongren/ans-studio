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
// Pi 调用全部经 Pi 适配器的 RuntimeAdapter。
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
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
  ShellGate,
  CustomerInputFn,
  DispatchTaskFn,
  OperatorChannelFn,
} from "../../provider/pi/session.ts";
import { createPiRuntimeAdapter } from "../../provider/pi/session.ts";
import { assembleProjectShellGate, type AssembleShellGateOptions } from "./shell-arming.ts";
import { formatEvent } from "../../common/编排/output.ts";
import { withHandback, type OrchestrationEvent, type TaskReport, normalizeTaskReport } from "../../common/编排/handback.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../common/编排/exit-codes.ts";
import { repinIfBootstrapped, DEFAULT_GOVERNANCE_BOUNDARY_REL } from "../../common/编排/finalize.ts";
import { conditionSlugsOf, createConfirmedWriteIssuer } from "../../common/编排/confirmed-writes.ts";
import type { RuntimeKind } from "../../common/编排/args.ts";

/**
 * **适配器能力面**：编排构造、随 `deps.createAdapter(gate, capabilities)` 交给适配器工厂——
 * 适配器把其中的能力注册为对应工具（「注入才注册」先例），或按其选项接线。三项：
 * · `customerInput`（A-3 客户确认制交互；未注入 ⇒ `request_confirmation`/`request_choice` 不注册）。
 * · `reportHandback`（C-1 交报告；未注入 ⇒ `submit_report` 不注册）——**只给项目角色会话**注入
 *   （治理角色 su 不自我回交，不注入）。能力形状 = `submit_report{ status, summary, evidence? }`
 *   的载荷（结构对齐，见 `common/编排/handback.ts::TaskReport`）。
 * · `sessionDir`（D-1 重启恢复）：本会话的**会话自持目录**，约定路径
 *   `<projectRoot>/.ans/sessions/<roleId>/`（带尾分隔符）。**编排只算路径、不预建目录**——
 *   **目录的创建归适配器**（在其真正落盘 SessionManager.create/open 时做）：① 保「不预建 `.ans`」
 *   的既有语义/断言（每次 `ans govern` 都预建 `.ans/sessions/` 会打破它）；② 谁落盘谁建目录，
 *   避免「编排建了目录但会话从未写」的空目录；③ 恢复 `open(path)` 不需要预建。
 *   projectRoot 为空 / roleId 不安全（空、含路径分隔符或 `..`）→ **不传**（旧行为，无持久化）。
 *   注：一次性路径 `runRole`（`ans role run`）不传（一局即止，无需恢复）。
 * · `dispatchTask`（H-1 su 派发任务；未注入 ⇒ `dispatch_task` 不注册）——**只给治理角色 su**注入
 *   （项目角色不给）。形状 = 契约家 `DispatchTaskFn`（前端路由：开/排队/去重/失败保留归前端；
 *   **派发 ≠ 授权**——能力实现方不得据此授予任何写权）。
 * · `shellGate`（I-1 开放 shell；未注入 ⇒ `run_shell` 不注册）——**只对项目角色**注入（su 自身不 arm；
 *   由 `openRoleSession` 在收到 `shellOperatorChannel` 时经 `assembleProjectShellGate` 装配）。
 *   比工厂第二参优先（`capabilities?.shellGate ?? shellGate`）。
 */
export interface AdapterCapabilities {
  customerInput?: CustomerInputFn;
  reportHandback?: (report: TaskReport) => void | Promise<void>;
  sessionDir?: string;
  dispatchTask?: DispatchTaskFn;
  shellGate?: ShellGate;
}

export interface RunRoleInput {
  roleId: string;
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
  deps: { createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter }
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

  let code: number = EXIT_OK;
  let session: RoleSession | undefined;
  try {
    const adapter = deps.createAdapter(gate);
    session = await adapter.bindRole(role);
    await session.prompt(buildTaskPrompt(input.taskId, input.scope));
    // 事件流以 "settled" 为**终止信号**：见到即停并退出循环。
    // 关键：真实 Pi 适配器的 events() 只有在 dispose() 时才 close 队列；若在此等到流自然结束，
    // 会与随后的 dispose() 互等（死锁）——那样 main() 永不 resolve（顶层 await 不收敛）。
    for await (const ev of session.events()) {
      record(ev);
      if (ev.kind === "settled") break;
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

export interface RoleSessionHandle {
  /** 发送一轮输入；可反复调用（底层同一会话，不重建）。 */
  send(text: string): Promise<void>;
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
    project: ProjectConfig;
    taskId?: string;
    scope?: TaskScope;
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
     * su 自身不 arm）由编排装配三层链（(c) 确定性硬地板 → (b) su 模型审读 → (a) 本通道；
     * 关窗/不答/超时 = **不放行**）并注入 `ShellGate` ⇒ `run_shell` 注册（「注入才注册」语义未改）。
     * 不给 ⇒ 不 arm（`run_shell` 不存在）。CLI 一次性前端无确认框 ⇒ 不接。
     */
    shellOperatorChannel?: OperatorChannelFn;
    /**
     * **高级注入（透传 `assembleProjectShellGate`；测试/装配用）**：(c) `classifyShell`/`rules`、
     * (b) 审读角色 id / `openSession` / 超时、`auditSink` 等。生产调用（桌面）通常只给
     * `shellOperatorChannel`——（c) 的合法注入源（门禁引擎经 service 的公开出口）就绪后在此传入。
     */
    shellArming?: Omit<AssembleShellGateOptions, "project" | "operatorChannel" | "sessionDeps">;
  },
  deps: { createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter }
): Promise<RoleSessionHandle> {
  // 角色/边界解析：失败即抛错（句柄式接口无退出码）。
  // 会话式入口：**允许** project.builtInRoles 声明的内置治理角色（桌面聊天）。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: true });
  if (!setup.ok) throw new Error(setup.reason);

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
        return async (req) => {
          const out = await raw(req);
          issue(req, out ?? null);
          return out;
        };
      })()
    : undefined;

  // 回交（设计 §10.8）：角色会话 settle → 编排发 `handback` 事件，交回 su。**内置治理角色（su）自身
  // 不回交**（回交的主体是**其他角色**，目的地才是 su）——故对 built-in-governance 角色**不挂**回交。
  const suppressHandback = setup.role.kind === "built-in-governance";

  // 交报告（C-1）：**只给回交主体（非 su）**注入 `reportHandback`——模型经 `submit_report` 交的报告
  // （`summary`/`evidence`/`status`）即回交事件内容；su 不注入（不自我回交）。未交 / 形状非法 →
  // `withHandback` 回退既有推导（不硬失败）。报告暂存于本会话闭包，settle 取用。
  let taskReport: TaskReport | undefined;
  const reportHandback = suppressHandback
    ? undefined
    : (report: TaskReport): void => {
        taskReport = normalizeTaskReport(report);
      };

  // D-1 重启恢复：本会话的**会话自持目录**（约定 `<projectRoot>/.ans/sessions/<roleId>/`）。
  // 编排只**算路径**、**不预建目录**（创建归适配器在真正落盘时做——理由见 AdapterCapabilities.sessionDir）。
  // projectRoot 为空 / roleId 不安全 → 不传（旧行为）。
  const sessionDir = sessionDirFor(input.project.projectRoot, setup.role.id);

  // H-1 派发任务：**只给治理角色（su）**转交前端路由能力——项目角色会话不注入（`dispatch_task` 只给 su）。
  const dispatchTask = suppressHandback ? input.dispatchTask : undefined;

  // I-1 开放 shell：**只对项目角色 arm**（su 自身不 arm）。前端给出 (a) 操作者确认通道 ⇒ 装配三层链
  // （(c) 确定性硬地板 → (b) su 模型审读 → (a) 本通道）并注入 ShellGate ⇒ run_shell 注册
  // （「注入才注册」语义未改）。装配失败 ⇒ **不 arm**（能力缺席 = fail-closed，run_shell 不注册）。
  let shellGate: ShellGate | undefined;
  if (!suppressHandback && input.shellOperatorChannel !== undefined) {
    try {
      shellGate = await assembleProjectShellGate({
        project: input.project,
        operatorChannel: input.shellOperatorChannel,
        sessionDeps: deps,
        ...(input.shellArming ?? {}),
      });
    } catch {
      shellGate = undefined;
    }
  }

  const capabilities: AdapterCapabilities = {
    ...(governedInput !== undefined ? { customerInput: governedInput } : {}),
    ...(reportHandback !== undefined ? { reportHandback } : {}),
    ...(sessionDir !== undefined ? { sessionDir } : {}),
    ...(dispatchTask !== undefined ? { dispatchTask } : {}),
    ...(shellGate !== undefined ? { shellGate } : {}),
  };
  const adapter = deps.createAdapter(
    gate,
    Object.keys(capabilities).length > 0 ? capabilities : undefined,
  );
  const session = await adapter.bindRole(setup.role);

  // 自动收尾的授权边界 = **本会话解析出的边界**（创世态下即治理种子边界；普通角色下即其项目
  // 边界）——与 su 同一授权。治理边界文档落点：项目未声明（如桌面创世 `path` 为空串）时用默认约定路径。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;

  // 自动收尾 + 自动重 pin（A-4 / §13.3）：缺省仅**内置治理角色（su）会话**开启。
  // `repinIfBootstrapped`：创世态 = **首次收尾**（无可 pin 之物 → 零副作用）；非创世态 = 重扫更新 pin。
  const autoRepinEnabled = input.autoRepin ?? setup.role.kind === "built-in-governance";

  let disposed = false;
  const base: RoleSessionHandle = {
    async send(text: string): Promise<void> {
      await session.prompt(text);
    },
    events(): AsyncIterable<OrchestrationEvent> {
      const stream = session.events();
      const wrapped = suppressHandback
        ? stream
        : withHandback(stream, { roleId: setup.role.id, taskId: input.taskId }, { report: () => taskReport });
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
              } catch {
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
function sessionDirFor(projectRoot: string, roleId: string): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  if (roleId === "" || roleId.includes("/") || roleId.includes("\\") || roleId.includes("..")) return undefined;
  const dir = path.join(projectRoot, ".ans", "sessions", roleId);
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

// 由 project 构造 adapter 工厂（(gate, capabilities?) => adapter）的**构造器**；可注入替换（测试探针 / 自定义运行时）。
// shellGate（可选）：命令级闸，由编排经 `buildShellGate(...)`（src/common/编排/shell-gate.ts）构造后注入；
// 缺席 ⇒ Pi 适配器**不注册 run_shell**（§7.5.1 能力缺席即最强 fail-closed）。第二个参数加在末尾，不破坏既有
// 单参实现（TS 中少参函数可赋给多参类型）。A-3 起：工厂返回的函数额外收 `AdapterCapabilities`
// （`customerInput` 原样转发给 Pi 适配器——「注入才注册」）。
export type AdapterFactoryBuilder = (
  project: ProjectConfig,
  shellGate?: ShellGate,
) => (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;

// 运行时选择 adapter 工厂。约定（与装配对齐）：命令参数 `--runtime demo|pi`、环境变量 `ANS_RUNTIME`，
// 默认 `demo`；由装配解析并注入 runtime，编排据此选择：
//   - "pi"  → 真实 Pi 适配器，经注入的 piFactory（默认 createPiAdapterFactory）接线——**可达的真实路径**；
//   - "demo" → 入口注入的 createAdapter（装配的演示假 runtime）。
// 令真实 Pi 适配器可达，且不改变契约 §5 冻结签名（deps 以可选字段扩展）。
// deps.shellGate：编排构造的 ShellGate，经此转发给 Pi 适配器工厂（demo 工厂由装配自持，不经此处）。
export function selectAdapterFactory(
  runtime: RuntimeKind,
  project: ProjectConfig,
  deps: {
    createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
    piFactory?: AdapterFactoryBuilder;
    shellGate?: ShellGate;
  }
): (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter {
  if (runtime === "pi") return (deps.piFactory ?? createPiAdapterFactory)(project, deps.shellGate);
  return deps.createAdapter;
}

// 供 Interface/装配构造默认真实适配器：编排（Pipeline）经 Pi 适配器导出的工厂接线。
// 契约 §5：编排只经 Pi 适配器导出的函数与类型调用 Pi，不导入其 impl 内部。
// shellGate 原样转发给 Pi 适配器（工具层据「是否注入」决定 run_shell 是否注册）；
// A-3/C-1/D-1：工厂返回的函数收 `AdapterCapabilities`，把 `customerInput`（确认制发行器包装）、
// `reportHandback`（交报告，项目角色专用）与 `sessionDir`（会话自持目录，D-1）原样转发——Pi 适配器
// 据此注册 `request_confirmation`/`request_choice`/`submit_report`（均「注入才注册」），并按会话目录落盘。
export function createPiAdapterFactory(
  project: ProjectConfig,
  shellGate?: ShellGate
): (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter {
  return (gate, capabilities) =>
    createPiRuntimeAdapter({
      gate,
      projectRoot: project.projectRoot,
      skillRoot: project.skillRoot,
      // I-1：能力面给的闸（编排装配）优先；第二参保留兼容（前端自装配的旧路）。
      // cwd 钉根与凭据剥离均**既有**（核实：real-adapter.ts:755 已传 `shellCwd: opts.projectRoot`；
      // tools.ts `buildShellEnv` spawn 前剥离 `PI_CREDENTIAL_ENV_VARS`）——本工厂无需另传。
      shellGate: capabilities?.shellGate ?? shellGate,
      customerInput: capabilities?.customerInput,
      reportHandback: capabilities?.reportHandback,
      sessionDir: capabilities?.sessionDir,
      dispatchTask: capabilities?.dispatchTask,
    });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
