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
// 退出码约定（见 ../../common/编排/exit-codes.ts）：0 = 成功，非 0 = 失败。runRole 以码返回失败；
// openRoleSession 无退出码，失败即**抛错**给调用方。
//
// scope 可选（客户端裁决）：scope === undefined 表示"没有预先存在的任务"（chat / 一次性无收窄），
// 此时**不做任务级收窄**，只用角色边界；编排把 undefined 原样传给 resolveWrite，绝不伪造全量 writeSet。

import type { ProjectConfig, ResolvedRole } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";
import { resolveRole } from "../../service/role/resolve-role.ts";
import { resolveBoundary } from "../../service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
  ShellGate,
  OperatorChannelFn,
} from "../../provider/pi/session.ts";
import { createPiRuntimeAdapter } from "../../provider/pi/session.ts";
import { formatEvent } from "../../common/编排/output.ts";
import { withHandback, type OrchestrationEvent } from "../../common/编排/handback.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../common/编排/exit-codes.ts";
import {
  createSessionFinalizer,
  repinIfBootstrapped,
  DEFAULT_GOVERNANCE_BOUNDARY_REL,
  type FinalizeResult,
  type SessionFinalizer,
} from "../../common/编排/finalize.ts";
import type { RuntimeKind } from "../../common/编排/args.ts";

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
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
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
  /**
   * **收口能力（可选扩展，T36/T37）**：仅当 `openRoleSession` 以 `genesisFinalize: true` 开启时存在。
   *
   * 由来：桌面实际走**本入口**（`openRoleSession`），而 finalize 此前只挂在治理会话句柄
   * （`GovernanceSessionHandle`）上 ⇒ 桌面够不着 ⇒「导入空文件夹 → su 建角色」走完后**无 pin**。
   * 本字段令**同一条桌面路径**可达收口。实现**唯一**（`src/common/编排/finalize.ts::createSessionFinalizer`，
   * 与治理会话**共用同一份**，不 fork）。**不破坏既有冻结契约**：纯可选成员，未开启时句柄形状与行为逐字不变。
   *
   * **触发时机 = 显式（manual）**：由「su 提议收口 / 消费者显式触发」调，**不在 settle 时自动跑**。
   *
   * **T37 语义**：调它 **≠ 立即完成**——它**提议收口、挂起等客户确认**（经注入的 `operatorChannel`，
   * 复用 shell 闸 (a) 通道）；确认不可用/超时/拒绝 → **不完成**（fail-closed）。`settled` 与 `finalize`
   * 同时存在；会话未 settle 时 `finalize()` 拒绝。
   */
  readonly settled?: boolean;
  /**
   * **提议收口 → 挂起等客户确认 → 确认通过才落盘**（写入同样经 `resolveWrite`）。**未 settle → 拒绝**。
   * 仅当以 `genesisFinalize: true` 开启时存在。**手动语义**——见上方 `settled` 注释。
   */
  finalize?(opts?: { acceptanceSource?: string; now?: () => Date }): Promise<FinalizeResult>;
}

export async function openRoleSession(
  input: {
    roleId: string;
    project: ProjectConfig;
    taskId?: string;
    scope?: TaskScope;
    /**
     * **收口开关（可选，T36/T37）**：置真时，返回的句柄附带 `settled` + `finalize()`。
     * 授权边界取**本会话解析出的边界**（创世态下即治理种子边界）——与 su 同一授权；写入同样经
     * `resolveWrite`（收口不绕门，被拒即零副作用）。**不自动跑**：仅**暴露能力**，时机由调用方定。
     * **T37**：`finalize()` = **提议收口、挂起等客户确认**（经 `operatorChannel`）。
     */
    genesisFinalize?: boolean;
    /**
     * **客户确认通道（T37）**：提议收口时经它挂起问客户（**复用 shell 闸 (a) 通道、不造第二套**）。
     * 缺省/不可用/超时/拒绝 → **不完成**（fail-closed）。桌面由桌面应用注入对话框通道。
     */
    operatorChannel?: OperatorChannelFn;
    /** 客户确认硬超时（毫秒）；缺省 120000。**超时 = 不完成**。 */
    confirmTimeoutMs?: number;
    /**
     * **自动重 pin（T37，§13.3）**：每轮会话 settle 后，若项目**已 bootstrap**（非创世态、`.ans` 已存在），
     * 自动重扫边界 → 更新 `.ans` 的 pin + manifest。缺省：**内置治理角色（su）会话来会话为 `true`，其余为 `false`**
     * ——重 pin 是 su 的固有职责（§13.3「每轮 su settle」），普通角色会话不自动重 pin。
     */
    autoRepin?: boolean;
  },
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
): Promise<RoleSessionHandle> {
  // 角色/边界解析：失败即抛错（句柄式接口无退出码）。
  // 会话式入口：**允许** project.builtInRoles 声明的内置治理角色（桌面聊天）。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: true });
  if (!setup.ok) throw new Error(setup.reason);

  // 底层只建**一个**会话：多轮 send 复用同一 RoleSession，绝不每轮重建。
  const gate = buildGate(setup.role, input.project, input.scope);
  const adapter = deps.createAdapter(gate);
  const session = await adapter.bindRole(setup.role);

  // 回交（设计 §10.8）：角色会话 settle → 编排发 `handback` 事件，交回 su。**内置治理角色（su）自身
  // 不回交**（回交的主体是**其他角色**，目的地才是 su）——故对 built-in-governance 角色**不挂**回交。
  const suppressHandback = setup.role.kind === "built-in-governance";

  // settle 追踪（收口的「半成品」守卫据它判「su 是否已完成至少一轮」）。
  let settledOnce = false;

  // 收口 + 自动重 pin 的授权边界 = **本会话解析出的边界**（创世态下即治理种子边界；普通角色下即其项目
  // 边界）——与 su 同一授权。治理边界文档落点：项目未声明（如桌面创世 `path` 为空串）时用默认约定路径。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;

  // 收口能力（可选，T36/T37）：实现复用 `createSessionFinalizer`（**唯一实现**）。
  // T37：`finalize()` = **提议收口 → 挂起等客户确认 → 通过才落盘**（经注入的 `operatorChannel`）。
  const finalizer: SessionFinalizer | undefined = input.genesisFinalize
    ? createSessionFinalizer({
        input: {
          projectRoot: input.project.projectRoot,
          skillRoot: input.project.skillRoot,
          boundary: setup.role.boundary,
          governanceBoundaryPath: govPath,
        },
        isSettled: () => settledOnce,
        operatorChannel: input.operatorChannel,
        confirmTimeoutMs: input.confirmTimeoutMs,
      })
    : undefined;

  // 自动重 pin（T37，§13.3）：缺省仅**内置治理角色（su）会话**开启。`repinIfBootstrapped` 自身在**创世态
  // （`.ans` 不存在）为 no-op**——故首次 pin 仍只在客户确认时写，自动刷新只发生在**已 bootstrap**之后。
  const autoRepinEnabled = input.autoRepin ?? setup.role.kind === "built-in-governance";

  let disposed = false;
  const base: RoleSessionHandle = {
    async send(text: string): Promise<void> {
      await session.prompt(text);
    },
    events(): AsyncIterable<OrchestrationEvent> {
      const stream = session.events();
      const wrapped = suppressHandback ? stream : withHandback(stream, { roleId: setup.role.id, taskId: input.taskId });
      // 透传并在见到 `settled` 时记录（守卫数据源）；对有无收口能力都无害。
      // 每轮 settle 后（仅在已 bootstrap / 非创世态）**自动重 pin**：重扫边界 → 更新 `.ans` 的 pin + manifest。
      // best-effort：重 pin 失败（如门禁拒）**不打断事件流**，如实走完本轮（判定/落盘本体在 finalize.ts）。
      return (async function* () {
        for await (const ev of wrapped) {
          if (ev.kind === "settled") {
            settledOnce = true;
            if (autoRepinEnabled) {
              try {
                await repinIfBootstrapped({
                  projectRoot: input.project.projectRoot,
                  skillRoot: input.project.skillRoot,
                  boundary: setup.role.boundary,
                  governanceBoundaryPath: govPath,
                });
              } catch {
                /* 自动重 pin 是 best-effort；失败不打断会话事件流 */
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
  if (!finalizer) return base;
  return {
    ...base,
    get settled(): boolean {
      return finalizer.settled;
    },
    finalize: (opts) => finalizer.finalize(opts),
  };
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

// 由 project 构造 adapter 工厂（(gate) => adapter）的**构造器**；可注入替换（测试探针 / 自定义运行时）。
// shellGate（可选）：命令级闸，由编排经 `buildShellGate(...)`（src/common/编排/shell-gate.ts）构造后注入；
// 缺席 ⇒ Pi 适配器**不注册 run_shell**（§7.5.1 能力缺席即最强 fail-closed）。第二个参数加在末尾，不破坏既有
// 单参实现（TS 中少参函数可赋给多参类型）。
export type AdapterFactoryBuilder = (
  project: ProjectConfig,
  shellGate?: ShellGate,
) => (gate: WriteGate) => RuntimeAdapter;

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
    createAdapter: (gate: WriteGate) => RuntimeAdapter;
    piFactory?: AdapterFactoryBuilder;
    shellGate?: ShellGate;
  }
): (gate: WriteGate) => RuntimeAdapter {
  if (runtime === "pi") return (deps.piFactory ?? createPiAdapterFactory)(project, deps.shellGate);
  return deps.createAdapter;
}

// 供 Interface/装配构造默认真实适配器：编排（Pipeline）经 Pi 适配器导出的工厂接线。
// 契约 §5：编排只经 Pi 适配器导出的函数与类型调用 Pi，不导入其 impl 内部。
// shellGate 原样转发给 Pi 适配器（工具层据「是否注入」决定 run_shell 是否注册）。
export function createPiAdapterFactory(
  project: ProjectConfig,
  shellGate?: ShellGate
): (gate: WriteGate) => RuntimeAdapter {
  return (gate) =>
    createPiRuntimeAdapter({
      gate,
      projectRoot: project.projectRoot,
      skillRoot: project.skillRoot,
      shellGate,
    });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
