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
// ── 客户确认制（A-3，2026-10-12）与创世自动收尾（A-4）────────────────────────────
// A-3：`GovernSessionInput.customerInput` 给出时，会话进入**确认制收窄**（见 `run-role.ts`）——
//   写盘前 su 必须先用 `request_confirmation` 把预览摆给客户；客户确认后**编排**把「已预览且校验在
//   边界内的具体路径」发行进 writeSet，F4 拒掉一切未确认路径。CLI 缺省补终端通道
//   （`createCliCustomerInput`：确认 y/n、勾选数字序号）。
// A-4：**「提议 + 确认」的收口已删**（客户：「客户确定了才加，不要有个收口，收口去掉」）——
//   `finalizeBootstrap`/`operatorChannel`/句柄 `finalize()` 均不存在。写出 `.ans`(pin) +
//   `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md` 的**自动收尾**由
//   `openRoleSession` 在每轮 su settle 后自动执行（`repinIfBootstrapped` 含首次），
//   仍**逐笔先经 `resolveWrite`**，见 `src/common/编排/finalize.ts`。

import type { ProjectConfig } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";
import type { Acceptance, BoundarySection1 } from "../../model/boundary.ts";
import type {
  RuntimeKind,
  CustomerInputFn,
  SessionEvent,
} from "../../model/runtime.ts";
import { openRoleSession, isFailedSettlement, type RoleSessionDeps, type RoleSessionHandle, type RoleSessionSendOptions } from "./run-role.ts";
import { listProject, resolveRole } from "../../service/role/resolve-role.ts";
import { formatEvent } from "../../common/编排/output.ts";
import type { OrchestrationEvent } from "../../common/编排/handback.ts";
import { EXIT_FAILURE, EXIT_OK } from "../../common/编排/exit-codes.ts";
import { createCliCustomerInput } from "../../common/编排/operator-channel.ts";

// ── B2（2026-10-17）：I3「建立治理记录」的 Pipeline 公共出口 ─────────────────────────────
// 桌面只依赖 Pipeline 公共出口，**不直接导入** `src/common/编排/` 私有模块（PM 评审 §五.1 边界纪律）。
// 薄再导出：不改变 `openGovernanceSession` 任何既有行为。
export {
  previewGovernanceRecord,
  establishGovernanceRecord,
  GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernancePreview,
  GovernancePreviewResult,
  GovernancePreviewErrorCode,
  EstablishGovernanceResult,
  GovernanceRecordInput,
} from "../../common/编排/finalize.ts";

// ── B2（2026-10-17）：治理记录 pin 不符「重新接受」的 Pipeline 公共出口 ─────────────────────
// 契约见 PM 评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.2。桌面只依赖 Pipeline
// 公共出口，不直接导入 `src/common/编排/` 私有模块；薄再导出不改变 `openGovernanceSession` 行为。
export {
  previewGovernanceReacceptance,
  reacceptGovernancePins,
  GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernanceReacceptInput,
  GovernanceReacceptWriteInput,
  GovernanceReacceptPreview,
  GovernanceReacceptPreviewResult,
  GovernanceReacceptPreviewFailure,
  GovernanceReacceptBlocker,
  GovernanceReacceptStatus,
  ReacceptGovernancePinsResult,
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
  runtime?: RuntimeKind;
  persistSession?: boolean;
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
  /**
   * **客户确认制交互通道（A-1/A-3）**：前端给的原始客户通道（CLI 终端 / 桌面交互卡），原样透传给
   * `openRoleSession`——**给出** ⇒ 会话进入确认制收窄（`request_confirmation`/`request_choice` 注册；
   * 未确认路径被 F4 拒）；**缺省** ⇒ `runGovernSession`（CLI 前端）自动补 `createCliCustomerInput()`；
   * 直调本引擎时缺省 = 无客户通道（工具不注册、旧语义）。无人值守（stdin EOF）→ `unavailable` → 未获同意。
   */
  customerInput?: CustomerInputFn;
  /**
   * **自动重 pin（T37，§13.3）**：每轮 su 会话 settle 后，若项目处于**非创世态**（`.ans/project.json`
   * 已存在），自动重扫边界 → 更新 `.ans` 的 pin + manifest（**不重写治理边界文档**）。缺省 `true`
   * ——本引擎即 su 治理会话引擎，重 pin 是其固有职责。创世态为 **no-op**（首次 pin 只在客户确认时写）。
   */
  autoRepin?: boolean;
}

/** 治理会话句柄（**唯一引擎**的产物；两前端只驱动它，不各自实现装配）。 */
export interface GovernanceSessionHandle extends RoleSessionHandle {
  /** 治理角色 id（经 `listProject` 枚举，非硬编码）。 */
  governanceRoleId: string;
  /** 边界来源（项目治理边界，或冷启动创世种子）。 */
  boundarySource: string;
  /** 生效的 acceptance 证据（供前端如实呈现）。 */
  acceptance: Acceptance;
  /** 本次会话的**静态** scope（按治理边界与目标角色给出，供呈现）；**创世（普通目录边界）无目标角色时为
   *  `undefined`**（设计 §12.2）。注：A-3 起，带 `customerInput` 的会话在 gate 层走**确认制动态 writeSet**
   *  （初始为空、经确认发行）——本字段只是呈现用的静态口径，不再是该会话的可写上界。 */
  scope: TaskScope | undefined;
  /** 目标项目目录（透传自输入；缺省 undefined = 装配默认 ans-cli 自身）。 */
  targetDir?: string;
  /** 发送一轮输入；可反复调用（同一会话，不重建）。 */
  send(text: string, opts?: RoleSessionSendOptions): Promise<void>;
  /** 持续的事件流（含 settle 时的 handback 事件）；跨多轮累积。 */
  events(): AsyncIterable<OrchestrationEvent>;
  /** 收口：释放底层会话（幂等）；出错如实抛出。 */
  dispose(): Promise<void>;
}

export interface GovernSessionResult {
  code: number;
  transcript: SessionEvent[];
  /** 目标项目目录（透传；供 CLI 前端/测试如实观察「目标目录经 deps 传递」）。 */
  targetDir?: string;
}

/**
 * **唯一的治理会话引擎**（设计 §10.5）：CLI 与桌面**都经此**开启治理会话。失败即**抛错**
 * （句柄式接口无退出码）——CLI 前端（`runGovernSession`）捕获后以非 0 码返回。
 */
export async function openGovernanceSession(
  input: GovernSessionInput,
  deps: RoleSessionDeps = {},
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
  //    注（A-3）：带 `customerInput` 的会话在 openRoleSession 内走**确认制动态 writeSet**（本处的静态
  //    scope 不参与 gate，仅随句柄呈现）；无通道的直调保持旧语义。
  const roleIds = input.targetRoleIds ?? [];
  const scope = buildGovernScope(boundary, roleIds);
  // §12.2：**普通目录边界（创世种子）在无目标角色时，scope 应为 `undefined`**（普通聊天、不做 F4 收窄）。
  // 若照旧传 `{writeSet:[], conditions:[]}`，F4 会「空 writeSet = 拒一切」→ su 一个字也写不了
  // （与 §12.2「su 的 scope 保持 undefined」相悖）。此收窄**只**在 `conditions` 与 `writeSet` 均空时生效，
  // 不会放宽任何既有 project-mode（含条件目录 / 有目标角色）的判定。
  const effectiveScope: TaskScope | undefined =
    scope.conditions.length === 0 && scope.writeSet.length === 0 ? undefined : scope;

  // 4) 经会话式入口开启内置治理角色（builtInRoles 数据来自枚举；不硬编码 id）。
  //    `customerInput`（A-3）：原样透传——有通道 ⇒ 确认制收窄（未确认路径被 F4 拒）；缺省 ⇒ 旧语义。
  //    `autoRepin`（A-4）：透传给会话式入口——**每轮 su settle 后**自动收尾/重 pin（判据/写入都在
  //    `openRoleSession` 一处，两前端共用；未显式给则按其缺省 = su 会话开启）。
  const sessionProject = withGovernanceRole(input.project, govId);
  const handle = await openRoleSession(
    {
      roleId: govId,
      runtime: input.runtime,
      persistSession: input.persistSession,
      project: sessionProject,
      taskId: input.taskId,
      scope: effectiveScope,
      customerInput: input.customerInput,
      autoRepin: input.autoRepin,
    },
    deps,
  );

  return {
    get runtime() { return handle.runtime; },
    get roleId() { return handle.roleId; },
    get contextSource() { return handle.contextSource; },
    get nativeSessionId() { return handle.nativeSessionId; },
    get contextWarning() { return handle.contextWarning; },
    get persistenceMode() { return handle.persistenceMode; },
    retryReportPersistence: (id) => handle.retryReportPersistence!(id),
    getReportPersistence: (id) => handle.getReportPersistence!(id),
    retryDeliveryHistoryPersistence: (id) => handle.retryDeliveryHistoryPersistence!(id),
    getDeliveryReceipt: (id) => handle.getDeliveryReceipt!(id),
    onPersistenceChange: (listener) => handle.onPersistenceChange!(listener),
    abort: () => handle.abort!(),
    governanceRoleId: govId,
    boundarySource: resolved.boundarySource,
    acceptance: boundary.acceptance,
    scope: effectiveScope,
    targetDir: input.targetDir,
    send: (text, opts) => handle.send(text, opts),
    events: () => handle.events(),
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
 * A-4 起**没有收口步骤**——su 经客户确认写出的产物，由每轮 settle 后的**自动收尾**写盘（见 run-role.ts）。
 */
export async function runGovernSession(
  input: GovernSessionInput,
  deps: RoleSessionDeps = {},
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

  // CLI 端默认客户通道（A-1/A-5）：确认 y/n、勾选数字序号（单选 `1`、多选 `1,3`）。**仅在未注入时**补——
  // 桌面/测试注入自己的通道。惰性 attach stdin（仅真被调用时）；无人值守（EOF）→ unavailable → 未获同意
  // （fail-closed：不发行 writeSet ⇒ 未确认路径的写入照旧被 F4 拒）。
  const effectiveInput: GovernSessionInput =
    input.customerInput !== undefined ? input : { ...input, customerInput: createCliCustomerInput() };

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
  const confirmationMode = effectiveInput.customerInput !== undefined;
  record({
    kind: "message",
    summary: confirmationMode
      ? "客户确认制：su 写盘前须先经 request_confirmation（预览）获客户确认；未确认路径的写入会被门禁在写入前拒绝" +
        "（预授权目录 docs/su/、docs/contracts/、docs/skills/、docs/mcp/ 除外——属初始写集、无需确认可直接写；客户裁定 2026-10-16）。" +
        (roleIds.length > 0 ? `（目标角色：${roleIds.join("、")}）` : "")
      : handle.scope
        ? `治理边界条件目录已声明：conditions=[${handle.scope.conditions.join(", ")}]；` +
          `可写集 ${handle.scope.writeSet.length} 项` +
          (roleIds.length > 0 ? `（目标角色：${roleIds.join("、")}）` : "（未指定 --role：无可写文件，仅按边界只读）")
        : "未声明 scope（创世/普通目录边界：仅按边界，不做任务收窄）",
  });

  let code: number = EXIT_OK;
  try {
    await handle.send(
      input.prompt ??
        buildGovernPrompt(input.taskId, roleIds, {
          canWrite: confirmationMode || handle.scope === undefined,
          confirmFirst: confirmationMode,
        }),
    );
    for await (const ev of handle.events()) {
      record(ev);
      if (ev.kind === "settled") {
        if (isFailedSettlement(ev)) code = EXIT_FAILURE;
        break;
      }
    }
    // A-4：不再有 finalize 步骤——su 在本轮经客户确认写出的产物，已由 settle 触发的**自动收尾**
    // （openRoleSession 内的 repinIfBootstrapped 含首次）写出 `.ans` + 治理边界文档 + manifest。
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

  return { code, transcript, targetDir: handle.targetDir };
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
 *  创世下 su 需**据对话决定**建哪些角色，故给出「可直接写治理产物」的指引——**不**误报「不写盘」。
 *  `confirmFirst`（A-3）：**客户确认制**会话——写明「先把预览（角色卡全文 + 边界摘要 + **将要写出的
 *  具体路径**）经 request_confirmation 请客户确认，拿到 confirmed:true 后才写；未确认路径会被门禁拒」。 */
function buildGovernPrompt(
  taskId: string,
  roleIds: string[],
  opts: { canWrite: boolean; confirmFirst: boolean },
): string {
  const confirmRule = opts.confirmFirst
    ? "\n**客户确认制**：写盘前必须先用 `request_confirmation` 把预览（角色卡全文 + 边界摘要，" +
      "**并列出将要写出的具体路径**——路径是发行凭据，没列出的路径写不进去）请客户确认；" +
      "拿到明确同意（confirmed:true）后才写；未获同意/通道不可用 → 不写盘、如实告知。" +
      "（例外：`docs/su/`、`docs/contracts/`、`docs/skills/`、`docs/mcp/` 为预授权目录——属初始写集，可直接写、无需确认。）"
    : "";
  const head =
    `任务 ${taskId}：以治理身份在**项目治理边界**内工作。` +
    "越出治理边界（`角色卡/`、`docs/`、`.ans/` 之外，如项目的 `src/`，或项目根以外）的写入会在写入之前被门禁拒绝。";
  if (roleIds.length === 0) {
    return opts.canWrite
      ? head + confirmRule +
          "\n未指定目标角色：请**据对话决定要建哪些角色**，逐一向客户确认后写出治理产物——" +
          "`角色卡/<角色>/role-card.md`、`角色卡/<角色>/boundary.yaml`、`角色卡/<角色>/memo.md`。" +
          "项目治理边界文档 `角色卡/governance-boundary.yaml` 由编排的自动收尾写出，无需你写。"
      : head + "\n本次未指定目标角色（--role）：可写集为空，会话只做调查/规划，不写盘。";
  }
  const targets = roleIds.map((id) => `角色卡/${id}/（role-card.md / boundary.yaml / memo.md）`).join("；");
  return (
    `${head}${confirmRule}\n具体改动要求：请为角色 ${roleIds.join("、")} 建出标准骨架文件：${targets}。` +
    (opts.confirmFirst
      ? "先经 request_confirmation 预览（含这些路径）获客户确认，再写；未确认路径会被拒。"
      : "用 write_file 写出上述文件（越界或可写集外的写入会被拒）。")
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
