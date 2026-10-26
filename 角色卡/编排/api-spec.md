# 编排公开接口（ANS-RUNTIME-V2 revision 1 / O1）

状态：接线已实现；本角色 238/238 回归、严格 scoped tsc exit 0。默认适配器、根入口与桌面整体验证仍待各属主。唯一 runtime 类型入口 `src/model/runtime.ts`；枚举只读引用 `src/common/shared/runtime-shared.ts`，编排 args 旧出口仅兼容转出。

Pipeline 公开入口 `src/pipeline/orchestration/run-role.ts`：

- `createRuntimeAdapterFactory(project, runtime, options?) => RuntimeAdapterFactory`。`RuntimeAdapterFactory=(gate, capabilities?)=>RuntimeAdapter`；`RuntimeAdapterFactoryOptions=Omit<RuntimeSessionOptions, "runtime"|"gate"|"projectRoot"|"skillRoot">`。支持 Service 现有 modelId/baseUrl/providerId/apiKeyEnvVar/promptTimeoutMs/constructTimeoutMs/providerFactories/persistSession/script 等选项。实际引擎 writeRoot/readRoot/shellCwd 固定项目根；demo 缺省只判定不落盘。SDK 加载/工具构造/存储均属 Service/Provider。
- `createPiAdapterFactory(project,shellGate?)` 是兼容 alias，固定 Pi，经 Service。
- `selectAdapterFactory(runtime,project,deps?)` 支持既有 createAdapter（demo）、piFactory、shellGate，以及 runtimeFactory/runtimeOptions。runtimeFactory 为 `(project,runtime,options?)=>RuntimeAdapterFactory`；四引擎均可用无网络 providerFactories 对接真实 Service。未知值抛错，绝不降级。
- `RoleSessionDeps={createAdapter?,runtimeOptions?}`。runRole/openRoleSession 输入可带 `runtime`；无 createAdapter 时由 Pipeline 建立默认选定 Service 工厂。runRole 缺省 demo；openRoleSession 缺省 Pi。显式自定义工厂保留原注入语义。
- `RoleSessionHandle` 可选只读 `runtime/roleId/contextSource/nativeSessionId/contextWarning` 为实际 session 动态 getter，send 后再次读取可得实际恢复结果。核心 resumed=原生恢复成功；recovered=恢复失败重建并有 warning。Desktop 原词汇需显式转换。
- `readRoleSessionHistory({projectRoot,roleId,runtime}) => Promise<{record?,entries}>` 经 Service 公共操作读取 ANS 回放，不证明模型上下文恢复。
- `AdapterCapabilities` 保留 customerInput/reportHandback/sessionDir/dispatchTask/shellGate/shellVerdict，新增可选 runtime/persistSession。已知 runtime 时 sessionDir 为 `.ans/sessions/<role>/<runtime>/`；旧未显式 runtime 的注入替身继续旧路径。实际 store 恒按所选 runtime 隔离。多轮缺省持久化，persistSession=false 不注入 store；一次性角色路径缺省不持久。

治理 Pipeline 的 GovernSessionInput 支持 runtime/persistSession，默认 Pi。GovernanceSessionHandle 继承 RoleSessionHandle 并保留 governanceRoleId/boundarySource/acceptance/scope/targetDir；context 为动态属性。shell 审读传源 runtime 与同一工厂，固定 persistSession=false。

CLI 内部接口：`runRoleCommand(argv, deps)` 与 `governCommand(argv, deps?)` 都支持 `--runtime demo|pi|codex|claude`；argv 优先于 deps.runtime。装配只需传 project/scope/runtime/runtimeOptions（以及已有 demo createAdapter），无需在根入口创建 Provider/Pipeline。govern 缺省 Pi，明确注入 createAdapter 且未带选择扩展时继续测试/自定义工厂语义。确认 callback 接受 Model `CustomerInputMetadata`，编排原样传到前端；issuer 必须核对原 signal 已中止则不发行。

Service 历史操作已由核心 C1H 补齐，O1 实际存储/公开回放消费测试通过。默认 Pi、新 SDK 依赖及 Claude 原生兼容测试完成前，不声称整个用户入口已验收。


## 2026-10-14 普通聊天回交修复（chat-handback-scope revision 2）

`RoleSessionSendOptions extends PromptOptions` 从 run-role.ts 公开，附 `handback?: {required:boolean;taskId?:string}`。`RoleSessionHandle.send(text, opts?:RoleSessionSendOptions)` 消费来源：true为正式任务、false为普通聊天并清掉旧会话 taskId；未标记且 input.taskId 非空仍默认任务，其余默认聊天。专用字段剥离后才传 Runtime；真实 runtime 组合 Core onTurnStarted，把来源绑定到其真实 turnId 并恰一次转调已有 callback，images 数组引用保留。旧未标记、无 ACK 替身保持 options 同引用/单参兼容路径。

普通聊天无合法报告不生成 handback，失败/中止事件照常透传；合法主动报告仍生成并受真实终态覆盖。每轮不论是否生成都清理报告/来源/证据并防重复迟到。未知真实 turnId 不借 legacy 来源。withHandback 内部 opts.intent 查询本轮 HandbackIntent；不提供查询的旧直接辅助调用保留任务默认。

桌面窗口必须按实际投递条目 dispatch=true、message/handback=false，包括队列重试，不能用正文猜测或会话固定值。Model/Core/Provider 无变更，原单次 runRole 不新增回交。编排247/247通过；全仓typecheck最终通过，真桌面由测试角色复验。记录见 [修复方案及证据](docs/fix/2026-10-14_fix_chat-handback-scope.md)。


## ORCHESTRATION-C-1（2026-10-15，A4/C2.tp1 consumer2）

生产三文件已接Core实际公开API：`RoleSessionHandle.persistenceMode`只读实际bound capability的enabled/disabled，缺能力unknown-live。`retryReportPersistence/getReportPersistence/retryDeliveryHistoryPersistence/getDeliveryReceipt/onPersistenceChange`直接引用Model原union并透明转发；disposed返回expired，缺能力UNSUPPORTED，GovernanceSessionHandle同方法/同RoleSessionSendOptions透传。Pipeline不enqueue、不dispatch、不另建恢复仓或timer。

withHandback在终局确定origin与最终status、清理后yield。Pipeline外层调用session.persistence.recordFinalReport，源enabled失败发真实live事实/failed保存态并继续settled，Window暂不投；disabled/unknown保原live兼容。HandbackEvent保留`handback`作为可信主进程内部模型render原对象；UI仅消费`report?:RuntimeReportSnapshotV1`、`liveReport?:RuntimeLiveReportViewV1`与`reportPersistence:{state,reportId?,code?,retryAvailable}`及安全summary。所有原对象/原text不得IPC侧车。Window是唯一归并与enqueue者。source保存成功后可首次继续原投递，target补存绝不prompt。

`send`将inputProvenance/inputPresentation/onDeliveryProgress交Core真实验证，Pipeline专用handback剥离；Core在SDK前剥metadata，图片原引用/原模型text保留。实际新增C用户/输入事件/summary仅安全显示副本，flags保真，完整模型输入不另保存；typed错误receipt不包装丢失。

`readRoleSessionHistory(scope,context?:{credentialEnvNames?:readonly string[]})`透传Core安全history含reports/reportErrors；新增同步纯`projectRoleLegacyHistory({projectRoot,roleId,runtime:'pi',readOk,entries:RuntimeLegacyHistoryEntryV1[],source?,error?,skipped},context?) => RuntimeLegacyHistoryProjectionV1`只转Model值到Service、不读FS/SDK。context由可信宿主当前runtime配置提供明确键名，不从renderer取得或读取.env补历史；缺profile仅当前公共值与格式保护，不保证旧轮换secret。

A4新display写入证据只接受accepted/result/oktrue/已知写工具/完整未redacted未truncated path，不退rawalias绕保护；旧无display的真实path保兼容，新phase摘要不反解。编排256/256、typecheck0，证据见[实施记录](docs/change/2026-10-15_change-report-provenance-consumer.md)。当前不包含Window/UI/真实SDK联合验收。


## G-1 / A1（2026-10-16）：派发「必读（按序）」块单一来源（`handback.ts`）

`src/common/编排/handback.ts`（E-1/H-1 同址模块）新增/扩展的公开面——**三件纯函数（不算哈希、不触盘；哈希由投递侧代码在投递时算）**：

- `renderDispatchPrompt(req: DispatchTaskPayload, opts?: DispatchPromptOptions): string`——扩展；`opts` 可选（缺省=旧 3 行逐字）。`DispatchPromptOptions={ references?: readonly DispatchReadRef[]; workflowMissing?: boolean }`。有引用时渲染「必读（按序）」块（`  1. <path>（sha256:<64hex>）`；`任务：` 前缀；完成句仅在引用含 `docs/workflow.md` 时切「完成口令见 workflow.md 第 2 节」变体）；`workflowMissing` 仅在 references 无同路径时生效（引用为准）。
- `extractDispatchReadPaths(task: string): string[]`——固定提取：只认 `docs/workflow.md` 与 `docs/contracts/**.md`（长度守卫拒名空）；复用 `confirmed-writes.ts::extractPathCandidates` 剥离 token；workflow 置首（阅读序）、契约首现序、去重；产物路径不捕获。
- `planDispatchDelivery(req: DispatchTaskPayload, probes: ReadonlyMap<string, string | undefined>): DispatchDeliveryPlan`——fail-closed 判据单一来源。`DispatchDeliveryPlan = {action:"reject"; message; systemRow} | {action:"deliver"; text}`；**reject 结构上无 text**。契约探测值非 64 位小写 hex/缺失 → 拒投（回执「派发未受理：引用的契约 <path> 不存在——未投递。」+ 系统行；多缺报首现序第一个）；workflow 缺失 → 降级放行（块内标注 `（本项目未提供 workflow.md）`）；放行 `text` 出自同一 `renderDispatchPrompt`。

消费方（桌面窗口 A2 接线）：`extractDispatchReadPaths` → `filePrint` 逐个探测（`<missing>` 原样传入）→ `planDispatchDelivery`；**判据先于去重登记**（拒投不登记、不入队）；拒投 `fail(plan.message, plan.systemRow)`；删除 `renderDispatchPromptLocal`。测试 `test/编排/dispatch-reads.test.ts` 14 例；`test/编排/` 288/288、typecheck 全仓 0 错。见[实施记录](docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md)。

## I3（2026-10-17）：已有角色但无治理记录——预览 / 显式建立

**Pipeline 公共出口**（桌面只依赖此处，不直接导入 `src/common/编排/` 私有模块）：

```ts
// src/pipeline/orchestration/govern-session.ts（薄再导出；openGovernanceSession 行为不变）
export {
  previewGovernanceRecord,
  establishGovernanceRecord,
  GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernancePreview, GovernancePreviewResult, GovernancePreviewErrorCode,
  EstablishGovernanceResult, GovernanceRecordInput,
} from "../../common/编排/finalize.ts";
```

**机制公开面**（`src/common/编排/finalize.ts`）：

```ts
export const GOVERNANCE_RECORD_ACCEPTANCE_SOURCE =
  "desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）";

export interface GovernanceRecordInput { projectRoot: string; skillRoot?: string }

export interface GovernancePreview {
  projectRoot: string;
  governanceBoundaryRel: string;   // "角色卡/governance-boundary.yaml"
  writePaths: string[];            // 写入顺序：治理文档（若写）→ .ans/project.json → docs/bootstrap-manifest.md
  pinPaths: string[];              // 治理文档 + 可 pin 的角色边界（与 finalize 的 scanRoles 同口径）
  roleIds: string[];               // 将纳入 .ans roles 映射（缺件角色不在此列）
  adoptExistingGovernanceDoc: boolean;
  acceptanceSource: string;        // 逐字＝GOVERNANCE_RECORD_ACCEPTANCE_SOURCE
  legacyBoundaryRoleIds: string[]; // pin 目标中仍是 boundary.md 的角色（只提示、不迁移）
}
export type GovernancePreviewResult =
  | { ok: true; preview: GovernancePreview }
  | { ok: false; code: GovernancePreviewErrorCode; message: string };
export type GovernancePreviewErrorCode =
  | "invalid-request" | "already-established" | "invalid-record" | "no-roles"
  | "nothing-to-pin" | "unparseable-governance-doc" | "blocked" | "busy";

export interface EstablishGovernanceResult {
  ok: boolean;                          // 与 finalize.ok 同值
  phase: "guard" | "precheck" | "write";// UI 判断「是否零副作用」的唯一依据
  code?: GovernancePreviewErrorCode;    // guard 分支原因
  finalize: FinalizeResult;             // 逐字嵌套（message/status/wrote/pins/roles 不改写）
}

export function previewGovernanceRecord(input: GovernanceRecordInput): Promise<GovernancePreviewResult>;
export function establishGovernanceRecord(input: GovernanceRecordInput): Promise<EstablishGovernanceResult>;
```

**守卫与副作用语义**：`invalid-request`（projectRoot 缺失/不可访问；importedProjectRoot 与 `confirm === true` 归桌面 IPC）→ `busy`（进程内同项目互斥；跨进程无全局锁）→ `.ans` 不存在（可用→`already-established`／损坏→`invalid-record`，guard/not-genesis，不覆盖）→ `no-roles`（`listProject().hasRoles === false`）→ 既有治理文档用 `resolveBoundary` + 探测 `ProjectConfig`（同路径、accepted:true、无 pin）校验，parseError 或条目为空→`unparseable-governance-doc`（零写入），通过→`writeGovernanceBoundaryDoc:false` 采纳/不覆盖 → `precheck`（`nothing-to-pin`/`blocked`，零写入）→ finalize。写入阶段抛错→`phase:"write"`、`ok:false`、message「写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。」；**不自动重试、不清理已写产物、不承诺可重试**。一次性种子边界每次调用新建、不缓存、不入配置（其上传记来源字符串会写入 `.ans` 的 `acceptance.source`）；`.ans` 无「创世种子」标记。

**测试** `test/编排/governance-record.test.ts` 17 例（预览七态＋并发＋建立成功/采纳重跑/五类零写入/写入阶段注入错误）。

## su shell 审批档（2026-10-17）

**来源**：PM 评审 `2026-10-17_design_su-shell-approval-review.md`（approved）。客户裁定：只读白名单免审批，其余（含原硬拒 deny）逐条客户批准。

> **2026-10-19 起适用范围扩大**：客户新规则要求所有角色都可运行 shell（含读写与任意命令）但一律提交审批。五个内置治理角色（`liaison`/`rapporteur`/`nominator`/`convener`/`verifier`）与 `su` 的能力位统一为 `shell: "operator-approve"`，均由本档装配（能力位驱动，不按角色 id）。接口形状不变；`SU_APPROVAL_REASON_PREFIX = "su-审批档"` 与 `by` 后缀 `（su 审批档）` 为历史命名，现也用于其余四个角色。详见 [变更记录](docs/change/2026-10-19_change_all-roles-shell-approval-sync.md)。

**`src/common/编排/shell-gate.ts` 公开面**：

```ts
export const BRANCH_C_RISKY = "c-risky";
export const BRANCH_C_REVIEW = "c-review";
export const SU_APPROVAL_REASON_PREFIX = "su-审批档";
export type SuApprovalTier = "risky" | "review" | "deny";
export function renderSuApprovalReason(tier: SuApprovalTier, detail?: string): string;
// CreateShellGateOptions / ShellGateBuildDeps 新增：
//   operatorOnly?: boolean;   // 缺省 false；不接 (b)，allow 直放，risky/review/deny 交 (a)
//   approveDeny?: boolean;    // 缺省 false；仅 operatorOnly=true 有效；true ⇒ deny 也交 (a)
```

- **构造守卫（抛错 ⇒ 不 arm）**：`readonlyOnly && operatorOnly` 互斥；`approveDeny && !operatorOnly`；`operatorOnly` 缺 `operatorChannel`；`operatorOnly` 带 `pmAsk`/`routineShellPolicy`。
- **判定映射**：`allow`→`c-allow`（0 卡）；`risky`→`c-risky→a-*`；`review`→`c-review→a-*`；`deny`+`approveDeny`→`c-deny→a-*`；`deny` 无 `approveDeny`→既有硬拒 `c-deny`。`by` 后缀 `（su 审批档）`；批准后 `... → operator:<标识>`。卡片 reason 由 `renderSuApprovalReason` 生成（含档位/命中原因/写边界警告）。
- 审计/落盘、fail-closed 退路、`readonlyOnly` 与项目三层链行为**逐字不变**。

**Pipeline 公共出口 `src/pipeline/orchestration/shell-arming.ts`**：

```ts
export interface AssembleOperatorShellGateOptions {
  project: ProjectConfig;
  operatorChannel: OperatorChannelFn; // 必填
  classifyShell?: ClassifyShellFn;
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
  timeoutMs?: number; operatorTimeoutMs?: number;
  now?: () => Date; env?: Record<string, string | undefined>;
  auditSink?: ShellAuditSink;
  // 无 pmAsk / pmRoleId / openSession / sessionDeps / routineShellPolicy（type 层面保证）
}
export async function assembleOperatorShellGate(opts: AssembleOperatorShellGateOptions): Promise<ShellGate>;
export { SU_APPROVAL_REASON_PREFIX, renderSuApprovalReason } from "../../common/编排/shell-gate.ts";
export type { SuApprovalTier } from "../../common/编排/shell-gate.ts";
```

**`openRoleSession` 输入**：`shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions,"project">`。优先级 `shellOperatorOnly`（su-only：仅 `suppressHandback===true`）→ `shellReadonly` → 项目角色三层链；项目角色误传或与 `shellReadonly` 同时给出 ⇒ **不 arm**（诊断）。装配失败 ⇒ 不 arm（`run_shell` 不注册）。

**测试** `test/编排/shell-operator-only.test.ts` 11 例；`test/编排/` 348 计/347 过/1 红（既有 Windows symlink EPERM）。

## 看护信号 `turn-deadline`：轮次到点检查（2026-10-17）

**来源**：PM 评审 `2026-10-17_design_turn-watch-and-recover-review.md`（approved）。整轮不设超时：到点由看护通知 su 检查，未卡死不动作；1 小时为最后兜底。

`src/common/编排/watchdog.ts`（`WatchdogSignalKind` / `renderWatchdogAlert` / `renderWatchdogRecovery` 形状不变）：

- `SIGNAL_LABELS["turn-deadline"] = "轮次到点检查"`（原「轮次逼近超时」）。
- `SIGNAL_SUGGESTIONS["turn-deadline"] = "到点检查不中止本轮；请用 role_status 核对是否卡死；仍在推进则不动作；只有卡死才 propose_recovery（客户确认后应用执行）；1 小时为最后兜底。"`
- 信号 kind 仍 `turn-deadline`（契约不变）；恢复行随 label 自动变化；不放宽任何判定。
- 文案禁止出现「逼近超时 / 已超时 / 硬超时 / 剩余量」；阈值/事实行/每轮一次/解除与适配器 1 小时兜底属桌面窗口与运行时核心。

**测试** `test/编排/watchdog.test.ts` 13 例（含新增的金文本与反向断言）。

## B1+B2（2026-10-17）：治理记录 pin 不符——重新接受（预览 / 写入）

**来源**：PM 评审 `2026-10-17_design_governance-pin-recovery-review.md`（approved）§5.2 / §5.5 / §六 / §七。

**Pipeline 公共出口**（桌面只依赖此处；薄再导出，`openGovernanceSession` 行为不变）：

```ts
// src/pipeline/orchestration/govern-session.ts
export {
  previewGovernanceReacceptance,
  reacceptGovernancePins,
  GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernanceReacceptInput, GovernanceReacceptWriteInput, GovernanceReacceptPreview,
  GovernanceReacceptPreviewResult, GovernanceReacceptPreviewFailure, GovernanceReacceptBlocker,
  GovernanceReacceptStatus, ReacceptGovernancePinsResult,
} from "../../common/编排/finalize.ts";
```

**机制公开面**（`src/common/编排/finalize.ts`）：

```ts
export const GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE =
  "desktop-app:操作者为治理记录 pin 不符显式重新接受（操作者点击确认）";
// 仅作一次性种子边界的授权来源，不写入 .ans（acceptance.source 保持最初授权来源）。

export interface GovernanceReacceptInput { projectRoot: string; skillRoot?: string }
export interface GovernanceReacceptWriteInput extends GovernanceReacceptInput {
  confirm: true;
  previewDigest: string; // 预览返回的 64 hex
}
export type GovernanceReacceptStatus =
  | "completed" | "write-failed" | "blocked" | "not-needed" | "no-record" | "invalid-record"
  | "missing-file" | "unreadable-file" | "unparseable-boundary" | "preview-stale" | "busy"
  | "invalid-request";
export interface GovernanceReacceptBlocker {
  code: "missing-file" | "unreadable-file" | "unparseable-boundary";
  paths: string[]; message: string;
}
export interface GovernanceReacceptPreview {
  projectRoot: string;
  writePaths: string[];   // 固定 [".ans/project.json", "docs/bootstrap-manifest.md"]
  pinPaths: string[]; pinCount: number;
  changed: PinEvidenceFile[];       // 仅 modified/missing/unreadable
  canConfirm: boolean; blockers: GovernanceReacceptBlocker[];
  previewDigest: string;            // PinEvidenceResult.digest
}
export type GovernanceReacceptPreviewFailure =
  | "invalid-request" | "busy" | "no-record" | "invalid-record" | "not-needed" | "blocked";
export type GovernanceReacceptPreviewResult =
  | { ok: true; preview: GovernanceReacceptPreview }
  | { ok: false; status: GovernanceReacceptPreviewFailure; message: string };
export interface ReacceptGovernancePinsResult {
  ok: boolean; status: GovernanceReacceptStatus;
  phase: "guard" | "precheck" | "write";   // 零副作用的唯一依据
  message: string; wrote: string[];
  pins?: PinEntry[]; changed?: PinEvidenceFile[];
}

export function previewGovernanceReacceptance(input): Promise<GovernanceReacceptPreviewResult>;
export function reacceptGovernancePins(input): Promise<ReacceptGovernancePinsResult>;
```

- **共用求值**：内部 `evaluateGovernanceReaccept` 读 `.ans` 原文、pin 列表、`inspectPinnedBoundaries({requiredPath: gov.path})` 证据与 blockers；预览/写入共用，写入不复用预览快照（除 digest 比对）。
- **守卫顺序（§5.2 表 1–11）**：projectRoot → 与 `establishGovernanceRecord` **共用** `governanceEstablishInFlight`（key=`path.resolve(projectRoot)`）→ `.ans` 存在 → 原始记录/acceptance/pin 形状/路径安全 → 证据（`ok`=`not-needed`、`invalid`=`invalid-record`、`mismatch` 继续）→ G5 缺失优先/不可读（precheck）→ G4 digest 形状/不等（`invalid-request`/`preview-stale`）→ G6 每个 pin 目标 `resolveBoundary` 探测（parseError 或 `entries.length===0` → `unparseable-boundary`）→ G3 一次性种子边界逐条 `resolveWrite`（`blocked`）→ G8 `.ans` 先、manifest 后经 `gatedAtomicWrite`（异常=`write-failed`/`write`，message 明示可能部分落盘）→ `finally` 释放互斥。
- **`.ans` 重写**：保留全部既有字段（roles、source、accepted、未知字段），只替换 `governanceBoundary.acceptance.pin`；条目数/路径/顺序不变；`JSON.stringify(doc,null,2)+"\n"`。证据只暴露非一致项的 `actual`，一致项判定为 `ok` 即与当刻字节相等，故沿用旧 pin 值。
- **manifest**：既有全文逐字节保留；存在 `## 重新接受记录（治理记录 pin 刷新）` 则节末追加、否则文末新增；不存在则新建最小头部；条目含 ISO 时间、变更文件数、pin 总数与逐文件旧/新完整 64 位哈希。存在但不可读 → `blocked`/`precheck`，零写入。
- **不做**：不改边界文件内容、不增删 pin、不改 `roles`/`acceptance.source`、不接受调用方传入写路径、不自动重试、不清理已写产物；跨进程无全局锁（如实登记）。

**测试** `test/编排/governance-reaccept.test.ts` 20 例：预览形状/blockers、正常写入、`.ans` 只改 pin、manifest 追加/保留/新建、G1–G8 每个守卫（G3 为正向过门；固定三目录下 G3 的拒绝无法由公共 API 构造）、写入失败注入、并发 busy、`preview-stale`、坏 YAML/空 Section 1、缺失/不可读、invalid-request。


## 「替我审」判断 agent 驱动（`createShellJudge`，2026-10-17）

**公开入口**（桌面只从此取，不跨角色导入私有 common）：

```ts
// src/pipeline/orchestration/govern-session.ts（薄再导出）
export { createShellJudge, SHELL_JUDGE_SUPPORTED_RUNTIMES } from "../../common/编排/shell-judge.ts";
export type { CreateShellJudgeOptions, ShellJudgeFn, ShellJudgeOutcome } from "../../common/编排/shell-judge.ts";
```

**驱动面**（`src/common/编排/shell-judge.ts`）：

```ts
export const SHELL_JUDGE_SUPPORTED_RUNTIMES: ReadonlySet<RuntimeKind>; // {claude, pi, codex}
export const SHELL_JUDGE_DENY_TIER_LABEL = "deny 档 · judge 放行";
export const SHELL_JUDGE_ROLE_ID = "shell-judge";
export const DEFAULT_SHELL_JUDGE_TIMEOUT_MS = 15_000;
export const DEFAULT_SHELL_JUDGE_MAX_DENY_PER_COMMAND = 2;

export interface CreateShellJudgeOptions {
  project: ProjectConfig;
  runtime: RuntimeKind;                       // 请求会话引擎；不跨引擎
  runtimeOptions?: RuntimeAdapterFactoryOptions; // 与请求会话同一份（D4）
  createAdapter?: RuntimeAdapterFactory;      // 测试注入；缺省 createRuntimeAdapterFactory(...)
  now?: () => number;
  timeoutMs?: number;                         // 缺省 15000
  maxDenyPerCommand?: number;                 // 缺省 2
  logger?: DiagnosticLog;
}

export interface ShellJudgeOutcome extends CoreShellJudgeOutcome {
  hardDenyOverride?: true;                    // 客户 D1：deny 档被 judge 放行
  label?: "deny 档 · judge 放行";
}
export type ShellJudgeFn = (input: ShellJudgeRequest, signal?: AbortSignal) => Promise<ShellJudgeOutcome>;

export function createShellJudge(opts: CreateShellJudgeOptions): ShellJudgeFn;
export function shellJudgeAuditOf(request: ShellJudgeRequest, outcome: ShellJudgeOutcome): ShellJudgeAuditWithLabel | undefined;
```

**行为口径**

| 情形 | 返回 |
| --- | --- |
| 模型 `allow` + 无损 | `{verdict:"allow", reasonCode:"necessary"}`；`request.tier==="deny"` 时另带 `hardDenyOverride:true` + `label` |
| 模型 `deny` 有替代 | `{verdict:"deny", reasonCode:"safer-alternative", alternative}` |
| 模型 `deny` 无替代 | `{verdict:"deny", reasonCode:"no-alternative", customerMessage(+标准出路), customerMessageSynthesized?}` |
| 模型 `manual` | `{verdict:"manual", reasonCode:"model-manual"}` |
| 读取损伤（denied/budget/truncated）后的 `allow` | `manual`（`read-denied`/`budget`/`read-truncated`）；`deny` 不受影响 |
| 不支持引擎 / 上下文缺失 / 超限 / 不可用 / 超时 / 中止 / 解析失败 / 防循环 / busy | `manual`（`unsupported-engine`/`context-missing`/`context-too-large`/`unavailable`/`timeout`/`aborted`/`parse-failed`/`retry-capped`） |

- 读取损伤判定顺序（钉死）：`budgetExceeded` → `budget`，其次 `truncatedReads` → `read-truncated`，最后 `deniedReads` → `read-denied`。预算耗尽时运行时核心会同时把该次读取计入 `deniedReads`，故**以 `budgetExceeded` 为准**，不得误报「文件不可读」。
- `persistSession:false`；判断会话只注册 `judge_read_file`/`judge_list_dir`/`report_shell_judgement`（由运行时核心 `buildShellJudgeTools` 按注入的 `shellJudge` 能力装配），写门禁 deny-all。
- 超时/中止会 `abort()` + `dispose()`；**超时前已捕获的合法结论仍然生效**；迟到 `bindRole` 返回的会话立即 `dispose()`。
- 防循环键＝命令 trim + 连续空白折叠；`deny` 递增、`allow` 清零、`manual` 不递增；达到上限不再调用模型。
- 本函数**不抛错**——所有失败归 `manual`（调用方交给桌面通道原卡呈现）。

**裁决辅助面**（`src/common/编排/shell-judge-verdict.ts`）：`normalizeShellJudgeVerdict`、`synthesizeCustomerMessage`、`redactJudgeText`、`redactJudgeVerdict`、`boundedJudgeText`、`hasInternalJargon`、`SHELL_JUDGE_EXIT_LINE`。
**提示词面**（`src/common/编排/shell-judge-prompt.ts`）：`buildShellJudgeSystemPrompt`、`buildShellJudgePrompt`、三档上限常量。

**审计透传**：`shell-gate.ts` 的 `runA` 把 `OperatorOutcome.allow/deny.judge` 写进审计记录可选 `judge`（`ShellAuditRecord.judge`，含 `tier`/`hardDenyOverride`/`model`/`reasonCode`/`reason`/`customerMessage`/`alternative`/`customerMessageSynthesized`）。人工手批（`manual` 后）**不写** `judge`。`by` 由桌面传入的 `operatorId = "judge:<引擎>"` 经既有 `operatorBy` 形成为 `operator:judge:<引擎>`。

**测试**：`test/编排/shell-judge.test.ts` 27 例（离线桩，不调真实模型/不读 `.env`/不跑凭据）。

## W2（2026-10-17）：治理三权在编排层的接线（账本 / 门禁 / 能力矩阵）

**依据**：PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.6/§5.7/§6.2/§十一 W2。本批只改编排自有路径：`src/common/编排/`、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`src/interface/cli/govern.ts`、`test/编排/`、本角色文档。

### 治理账本（`src/common/编排/governance-ledger.ts`）

```ts
export const GOVERNANCE_LEDGER_REL = ".ans/governance/ledger.jsonl";
export type GovernancePower = "proposal" | "nomination" | "schedule" | "acceptance" | "app" | "customer";
export type GovernanceDecisionKind =
  | "proposal-accept" | "proposal-accept-quick" | "proposal-revise" | "proposal-reject"
  | "appointment" | "appointment-write" | "schedule-write" | "acceptance"
  | "migration" | "unclassified";
export interface GovernanceLedgerEntry { at; kind; flowId?; stepId?; actorRoleId; power; decisionKind?;
  artifactPath?; artifactVersion?; artifactSha256?; paths?; targetRoleId?; targetRoleIds?;
  customerDecision?; decisionEvidence?; messageSummary?; runtime?; sessionId? }
export interface GovernanceLedgerSnapshot { entries: readonly GovernanceLedgerEntry[]; errors: readonly string[] }

export function appendGovernanceLedger(projectRoot, entry): Promise<{ok:true}|{ok:false;message:string}>;
export function readGovernanceLedger(projectRoot): Promise<{entries;errors}>;
export function refreshGovernanceLedgerSnapshot(projectRoot): Promise<GovernanceLedgerSnapshot>;
export function flushGovernanceLedger(projectRoot): Promise<void>; // 测试/宿主等待在飞追加
export function governanceLedgerPath(projectRoot): string;
```

- append-only、UTF-8、一行一条 JSON；进程内按 `projectRoot` 串行（promise 链）；`mkdir -p` → 追加 → `fsync`。
- 失败**不回滚、不抛给角色**：只记诊断并如实返回 `{ok:false}`（「账本失败不翻转」，评审 §九-16）。
- 读取：文件不存在 → 空账本无错误；坏行/不可读 → `errors`（坏行跳过），门禁见 `errors` 非空即 fail-closed。
- **角色不可写**：`.ans/**` 在三人 `forbiddenWritePaths` 内；编排 gate 在 `resolveWrite` 之前拒绝。

### 三道门禁（`src/common/编排/governance-gate.ts`）

```ts
export interface GovernanceGateInput {
  projectRoot: string; model: GovernanceModel; roleId: string;
  action: "write-flow" | "write-nomination" | "write-role-card" | "dispatch";
  flowId?: string; stepId?: string; targetRoleId?: string; targetRoleIds?: string[]; path?: string;
}
export type GovernanceGateDecision = {allowed:true} | {allowed:false; code:string; message:string};
export function evaluateGovernanceGate(input, snapshot): GovernanceGateDecision;
export function parseFlowStepIds(text: string): string[];
```

- **提案接受门**（write-flow/write-nomination）：该 flow 最新提案类决定必须是 `proposal-accept`/`proposal-accept-quick`；`revise`/`reject`/`unclassified` 拒。普通写盘确认（无 `decisionKind`）不覆盖此前接受决定。
- **任命写入门**（write-role-card）：该 flow 最新任命决定（`decisionKind="appointment"`）的 `targetRoleIds` 必须含目标角色；`flowId` 缺省时在全部 flow 的最新任命中查找（写卡路径无 flow 上下文）。
- **派发范围门**（dispatch）五条：① 目标不是内置治理角色（三人与 su）；② 提案已接受；③ 目标在任命名单内**或** `accept-quick` 且目标是既有项目角色；④ `flowId`/`stepId` 必填且流程文件 `docs/flows/<flowId>.md` 存在对应步骤（只判存在、不读 status）；⑤ 同一 `flowId+stepId` 未派发过。
- 防御性来源校验：write-flow/dispatch 必须 Convener；write-nomination/write-role-card 必须 Nominator。
- `model !== "trio"` → `{allowed:true}`（旧 single 不分流三权门禁）；快照 `errors` 非空 → 拒一切动作（`ledger-corrupt`，文案指 `ledger.jsonl`）。

### 治理会话（`govern-session.ts`）

- `GovernSessionInput` 增 `governanceFunction?: GovernanceFunction`；解析顺序：显式 `governanceRoleId` → `governanceFunction` 对应 id → trio 缺省 rapporteur / single 缺省 su（统一走 Service `resolveGovernanceRole`；非法组合抛明确文案）。`ProjectConfig.governanceModel` 显式时优先于磁盘枚举。
- `GovernanceSessionHandle.governanceFunction?: GovernanceFunction` 如实带出；`withGovernanceRole` 只并入**选中**的 id。
- 默认提示词：trio 按 function 追加提案/提名/编排纪律（不写「已批准/已授权」，只说等待客户决定）；single/su 文案逐字保留。
- 薄再导出（桌面只依赖此公共出口）：账本五函数/四型、`evaluateGovernanceGate`/`parseFlowStepIds` 及三型。

### 能力矩阵与写门禁（`run-role.ts`）

- 能力唯一来源 `governanceCapabilitiesOf(roleId)`（su 返回 `LEGACY_SU_CAPABILITIES`）：dispatchTask / roleStatus / sessionTail / proposeRecovery / installSkill(含 uninstall) / installMcp(含 uninstall) 按 `cap.*` 注入；项目角色无治理能力。
- 预授权目录 `scopeWithBuiltInPreauthorization`：trio 按注册表 `preauthorizedDirs`；su 用 `LEGACY_SU_PREAUTHORIZED_DIRS` 四棵；项目角色无预授权。
- trio gate 包装顺序：`forbiddenWritePaths`（拒 `.ans/**`、其他治理角色资料等）→ 路径分派 `write-flow`/`write-nomination`/`write-role-card` → 既有 `resolveWrite`。
- `customerInput` 包装：按角色 `cardKind` 白名单（Rapporteur: proposal/acceptance/write；Nominator: appointment/appointment-write/write；Convener: schedule-write/write）——越权**不弹卡**、返回 declined；客户决定后写 `customer.decision`（同步更新内存快照、异步落盘），字段含 `power`/`decisionKind`/`customerDecision`/`targetRoleIds`/`paths`/`decisionEvidence{toolCallId,turnId,sessionId}`/`messageSummary`；`unavailable` 不写。
- 会话 `open`/`send` 开始刷新账本快照；trio 内置角色 settle 后扫预授权目录的 `.md`，新增/变更写 `artifact.observed`（应用算 sha256）。
- 三人不自我回交；`dispatchTask` 仅 Convener（trio）注入，并包一道派发门禁，拒投返回 `{ok:false}`。

### finalize（`finalize.ts`）

- `GovernanceRecordInput` / `GovernanceReacceptInput` 增可选 `governanceModel`（缺省 single）；仅 **trio** 在 establish/reaccept 成功后写 `governance.established`/`governance.reaccepted`（`actorRoleId="app"`、`power="app"`、`decisionEvidence.action` 与 `previewDigest` 如有）。single 旧项目保持零新增副作用。
- 迁移 `governance.migrated` 留到 V1b（本版不实现）。

### CLI（`govern.ts` / `args.ts`）

- 新增 `--function proposal|nomination|schedule`（trio 缺省 proposal；single 传 → 引擎明确拒绝）。
- `--role`：单个内置治理角色 id（su/rapporteur/nominator/convener）⇒ 选择会话角色；其余值沿用旧语义（目标角色）；混用 → 用法错误。trio/single 合法性由 `resolveGovernanceRole` 统一校验。

## V1b（2026-10-17）：治理模型 `su → trio` 显式迁移

**依据**：PM 评审 `2026-10-17_design_governance-trio-review.md` §3.2（V1b）/§5.5/§5.7/§九-12/§十一 V1b。本批只改编排边界：`src/common/编排/`、`src/pipeline/orchestration/govern-session.ts`、`test/编排/`、本角色文档；未碰门禁引擎/运行时核心/桌面/UI。

**Pipeline 公共出口**（桌面只依赖此处，不直接导入 `src/common/编排/` 私有模块）：

```ts
// src/pipeline/orchestration/govern-session.ts（薄再导出；openGovernanceSession 行为不变）
export {
  previewGovernanceMigration, migrateGovernanceModel,
  GOVERNANCE_MIGRATION_ACCEPTANCE_SOURCE, GOVERNANCE_MIGRATION_MANIFEST_HEADING,
  GOVERNANCE_MIGRATION_TARGET_MODEL, GOVERNANCE_MIGRATION_WRITE_PATHS,
};
export type {
  GovernanceMigrationPreview, GovernanceMigrationPreviewResult, GovernanceMigrationPreviewFailure,
  GovernanceMigrationResult, GovernanceMigrationStatus, GovernanceMigrationWriteInput,
  GovernanceMigrationPinChange,
};
```

### `previewGovernanceMigration({projectRoot})`——零写入

```ts
preview: {
  model: "single"; targetModel: "trio";
  writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"];
  modelField: "single" | "trio" | null; // `.ans` 原始字段快照；null=字段缺失（旧 single 形状）
  manifestLine: "治理模型升级（su → trio）";
  pinChanges: [];                        // V1b 不重算 pin
  retainedFiles: string[];               // 角色卡/边界/治理文档/旧 docs/su（只列确实存在的）
  snapshotDigest: string;                // `.ans` 原始字节 + manifest 内容/缺失；确认时原样回传
}
```

守卫：`invalid-request`（projectRoot）→ `busy`（与 establish/reaccept 共用 `governance-record-lock.ts`）→ `no-record` → `already-trio` → `invalid-record`（`.ans` 不可解析）→ `blocked`（manifest 不可读 / 门禁前置拒）。预览**不建目录、不写任何文件**。

### `migrateGovernanceModel({projectRoot, confirm:true, previewDigest})`

守卫顺序：`invalid-request`（projectRoot / confirm / previewDigest 64 hex）→ `busy`（首次 await 前占位）→ `no-record` → `already-trio` → `blocked`（记录不可解析/manifest 不可读/门禁前置拒）→ `preview-stale`（摘要不等）→ 写入 → `write-failed`。

- 只改 `.ans` 的 `governanceModel:"trio"`：在内存构造 `{...doc, governanceModel:"trio"}`，**保留全部既有/未知字段**（roles/source/pin/projectRoot/skillRoot/自定义字段）；`.ans` 先、manifest 后，均原子写。
- manifest 追加「治理模型升级（su → trio）」：时间（ISO）、旧模型 `single`、新模型 `trio`、变更文件、`.ans` 旧/新 SHA-256、客户确认证据；既有全文逐字节保留。
- 账本 best-effort 写 `governance.migrated`（`actorRoleId="app"`、`power="app"`、`decisionEvidence.action="migrate"`、`previewDigest`）；失败只诊断、不翻转迁移结果。
- **不重写角色卡/边界/pin、不删历史、不建 `角色卡/su/`**；旧 `docs/su/**` 保留只读。
- 成功返回 `{ok:true, phase:"write", status:"completed", model:"trio", message}`；guard 拒绝零写入；`write-failed` 如实回 `phase:"write"`（不重试、不清理）。

### 首次收尾 / 建立治理记录带模型

- `FinalizeInput.governanceModel?: "single"|"trio"`：`finalizeBootstrap` **仅当给出**才在 `.ans` 写 `governanceModel`；不传保持旧 `.ans` 形状。
- `repinIfBootstrapped`：创世态由调用方传当前模型（trio 传 `"trio"`；single 不传）；非创世态若调用方未传，则从当刻 `.ans` 读取并**保留**既有模型，避免重 pin 把 trio 降级为 single。
- `run-role.ts` 自动收尾调用点（V1b 接线）：trio 下传 `governanceModel:"trio"`（single 不传，旧形状不变），并把收尾边界换成 `appGovernanceBoundary(会话边界的 acceptance)`——三人 Section 1 不含 `.ans/**`/`docs/bootstrap-manifest.md`，沿用角色边界会让收尾 fail-closed、`.ans` 永不落盘。single/su 仍用会话边界（旧行为不变）。
- `GovernanceRecordInput.governanceModel`：`GovernancePreview.governanceModel` 显示「将写入的治理模型」（缺省 `single`），`establishGovernanceRecord` 把它交给 `finalizeBootstrap`；仅 trio 写 `governance.established` 账本（旧 single 零新增副作用）。
- `GovernanceRecordInput.previewDigest`（W2 已落）：原样写入 `governance.established` 供审计；本模块不校验它。

## W6-A（2026-10-18）治理四角色编排接线：意图交接 / 澄清 / 账本

依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md` §5.1/§5.2/§5.4/§7（status approved；治理模型仍 `trio`，四角色 `liaison → rapporteur → nominator → convener`）。本批只改编排边界；桌面 W6-B、UI W6-C 待各属主。

### 公开输入（`openRoleSession` / `AdapterCapabilities`）

- `handOffIntent?: HandOffIntentFn`：**只给 Liaison**（注册表 `capabilities.handOffIntent`）。编排先机械校验意图文件/去重/`initial` 一次性/每轮一次/账本可读，**投递成功后才**写 `intent.handed-off`；投递回调（桌面 W6-B：后台开/发 Rapporteur、系统行、`dispatch.accepted{trigger:"intent-handoff"}`）失败如实回执、不重试、不写成功账本。
- `requestClarification?: RequestClarificationFn`：**只给 Rapporteur**（`capabilities.requestClarification`）。编排按账本判同一 `flowId`（无则同一 `intentId`）已有 2 轮 `clarification.requested` → 拒绝并提示在提案卡上请客户决定（带假设/备选）；送达成功后写账本；不弹决定卡、不占「一项目一卡」、不改变任何权力/写权。
- 两能力均「注入才注册」：`undefined` ⇒ 对应工具在会话里不存在（结构性 fail-closed）。`RuntimeSessionOptions` 经 `GovernedToolsOptions` 同名位透传，Service/Provider 无需改。
- `confirmationMode` 收窄（W6-A）：`input.customerInput !== undefined && (cap === undefined || cap.customerInput)`——Liaison 的 `customerInput=false`，**不注册** `request_confirmation`/`request_choice`，走静态边界 + 预授权（`docs/intents/`）；其余角色与项目角色行为逐字不变。

### 意图交接机械校验（`src/common/编排/governance-handoff.ts`）

- `validateIntentHandoff(input, context?) => Promise<IntentHandoffValidation>`：模型/角色防御性校验（trio + liaison）→ slug（**2026-10-22 收紧**：`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`——2–64 位、首尾小写字母/数字、禁止首/尾连字符；正则由 Model `GOVERNANCE_SLUG_PATTERN` 构造，导出形状仍是 `RegExp`；文件 frontmatter 的**非空非法** `flowId` 显式返回 `invalid-flow-id`，不得静默当作缺席）→ 四要素非空、`summary` 1..200 字（超长拒绝不截断）→ `docs/intents/<intentId>.md` 存在可读、frontmatter 以 `---` 开头并闭合、顶层 `key: value` 可解析、文件 `intentId` 与入参一致、`goal/scope/acceptance` **入参与文件逐项相等**（文件是权威）、文件 `handoffKind`/`flowId` 若给出须一致 → 账本可读（坏行/不可读 fail-closed）→ 去重（`intentId+handoffKind+sha256(原始字节)`）→ `initial` 每个 `intentId` 仅一次 → `clarification`/`revision` 必须已有同 `intentId` 成功交接 → 每轮一次（账本同 `turnId`；缺 `turnId` 降级并返回 `warnings`）。
- `intentHandoffDedupeKey({intentId,handoffKind,sha256})`：去重键单一来源。
- `countClarificationRounds(projectRoot, {flowId?, intentId?})`：账本坏 → `ok:false`；`CLARIFICATION_MAX_ROUNDS = 2`。
- 以上三件 + 常量/类型经 `govern-session.ts` 薄再导出（桌面不直接导入私有 `common/`）。

### 账本（`governance-ledger.ts`）

- `GovernancePower` 增 `"liaison"`（Liaison 沟通权；四角色评审 §7.1/AC 口径）；`GovernanceLedgerEntry.kind` 增 `"intent.handed-off"` / `"clarification.requested"`；条目增 `intentId?` / `handoffKind?` / `trigger?("customer-decision"|"intent-handoff"|"settle")` / `turnId?`。
- 写入点（编排）：`intent.handed-off{actorRoleId:"liaison", power:"liaison", targetRoleId:"rapporteur", intentId, handoffKind, flowId?, artifactPath, artifactSha256, messageSummary, turnId?, sessionId?, runtime?}`；`clarification.requested{actorRoleId:"rapporteur", power:"proposal", flowId?, intentId?, messageSummary, turnId?, sessionId?, runtime?}`。
- 两者都**不是客户批准**：不写 `customerDecision`/`decisionEvidence`，任何门禁不读；账本失败只诊断、不翻转投递结果。
- `artifact.observed` 对 Liaison 写 `power:"liaison"`（`GovernanceFunction` 直接可赋值给 `GovernancePower`）。

### CLI / 函数路由

- **CLI 收窄（AC21）**：`parseGovernArgs` 的 `--function` 仍只接受 `proposal|nomination|schedule`；`--function liaison` 显式拒绝（「联络官（liaison）仅桌面主入口提供；CLI 请用 --function proposal|nomination|schedule」）；`--role liaison` 在 `governCommand` 显式拒绝（EXIT_USAGE）。**缺省仍是 `proposal`→rapporteur**（主入口由 `listProject` 的 `primaryRoleId=liaison` 表达）。
- 引擎层 `openGovernanceSession` 的 `governanceFunction` 类型仍含 `liaison`（桌面/测试前端按评审 §4.5 可路由）；single 下由 `resolveGovernanceRole` 明确拒绝。
- `govern-session.ts` 的职能纪律提示词改为**注册表驱动**（`spec.displayName`），Liaison 段写 `docs/intents/`、`hand_off_intent`、**交接 ≠ 客户批准**；`runGovernSession` 的确认制说明行同样按 `capabilities.customerInput` 判定（Liaison 不再误报确认制）。

### W6-A 补丁：trio 的 shell 审计边界（2026-10-18）

门禁引擎已把 `docs/audit/` 加入 `appGovernanceEntries()`（shell 审计由应用写）。编排 `shell-arming.ts` 新增私有 `auditBoundaryOf(project, govBoundary, roleId?)`：

- **trio**（`project.governanceModel === "trio"`，或模型缺省且首个内置角色为 trio 角色）：`assembleProjectShellGate` / `assembleReadonlyShellGate` / `assembleOperatorShellGate` 及其 F-6-1 `auditBoundaryRefresh` 的审计边界改用 `appGovernanceBoundary(govBoundary.acceptance)`（经 `src/service/boundary/resolve-boundary.ts` 公共出口，不复制实现）。审计真落 `docs/audit/shell-gate.jsonl`。
- **single/su**：原样返回既有治理角色边界（`docs/audit/` 条件目录 + `shell-gate` 条件），逐字不变。
- `buildShellAuditGate` 仍固定声明 `conditions:["shell-gate"]`（额外条件对非条件条目无影响，语义保留）；应用专用边界不注入任何角色会话，角色仍不可写 `docs/audit/`；任何命令判定不变。

## 2026-10-18 P2：治理卡判断 agent（「替我审批」/「替我决策」）

依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md` §五–§七/§十/§十二（status approved；P1 运行时核心契约已冻结）。本批只改编排边界；桌面 P4 状态机/结果行、适配器 P3 归各属主。

### Pipeline 公共出口（`govern-session.ts` 薄再导出）

```ts
export { createGovernanceJudge, GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES } from "../../common/编排/governance-judge.ts";
export type { CreateGovernanceJudgeOptions } from "../../common/编排/governance-judge.ts";
```

- `CreateGovernanceJudgeOptions = { project; runtime; runtimeOptions?; createAdapter?; now?; timeoutMs?; logger? }`。
- `createGovernanceJudge(opts) => GovernanceJudgeFn`：返回函数**不抛错**；三引擎支持矩阵 `{claude, pi, codex}`，demo/未配置 → `manual/unsupported-engine`。合成角色 `governance-judge`（空边界）、`persistSession:false`、deny-all 写门禁、`governanceJudge` 只读能力注入、15s 硬超时（`AbortSignal.any`）、中止/迟到 bindRole dispose、每闭包 `busy`（第二张 `manual/unavailable`）、无防循环计数。
- `governanceJudgeAuditOf(outcome)`：approve → 有界 `GovernanceJudgeAudit`（reason ≤1KB、evidence ≤10、pathDecisions ≤50）。
- **acceptance 机械门槛（P6）**：提示前读 `docs/flows/<flowId>.md` + `.ans/governance/ledger.jsonl`；所有步骤 `done`、每步都有 `dispatch.accepted`、无 `unclassified`/`none` 未结算决定、无未闭环澄清、账本可读；任一不满足 ⇒ `manual`（`insufficient-evidence`/`artifact-missing`/`ledger-unavailable`），不靠模型自报。
- 双开关后 shell 出路句统一为 `如需执行，请关闭「替我审批」后重试。`（`SHELL_JUDGE_EXIT_LINE`/校验/提示/测试）。
- 支持内部模块：`governance-judge-prompt.ts`（稳定系统提示 + 本次请求提示）、`governance-judge-verdict.ts`（唯一规范化点）、`governance-judge-facts.ts`（有界账本事实/规范物证/推荐集解析）。桌面不得直接导入私有 `common/编排/`。

### `run-role.ts`

- `AdapterCapabilities` 增 `governanceJudge?: GovernanceJudgeToolOptions`；`createRuntimeAdapterFactory` 逐名透传（仅 judge 会话使用；普通角色会话不注入）。
- `openRoleSession` 的 `governedInput` 是 `CustomerInputMetadata.judgeContext` 的**唯一计算点**（评审 §5.2）：
  - 仅 `isTrio` + `TRIO_CARD_KINDS[role]` 允许的 cardKind + 合法 flowId 时计算；先 `refreshLedger()`。
  - `paths`/`pathProbes`：confirm 卡从 title/preview/detail 用 `extractPathCandidates` 提取候选，再用与 issuer 同一份 `resolveWrite`（`writeSet:[candidate]` + 会话 conditions）探测；`allowedPathRoots` 取角色边界 project 条目；`forbiddenPaths` 取 trio 注册表；`artifacts` 按 cardKind/来源角色（`latestVersionedArtifact` + `docs/flows/<id>.md`）；`recommendedRoleIds` 解析最新提名文件；`facts` 由账本快照提炼。
  - 计算失败 → `unavailableReason` + `facts.ledgerErrors:1`；`recordCustomerDecision` 仍用 `originalMetadata` 的 toolCallId/turnId。
- `recordCustomerDecision`：`answered && out.judge` → `decisionEvidence.kind:"judge"` + 有界 `judge`；`actorRoleId`/`power` 不变；`judge.group` 与 `governanceCardGroup(cardKind)` 不符只记 `governance-judge.group.mismatch`、不翻转决定；账本失败另记 `governance-judge.audit.failed`。
- `recordCustomerDecision`（2026-10-25 写入预授权）：`operatorId` 以 `system:` 开头（桌面 `system:write-preauthorization`）走独立分支——接受写 `decisionEvidence.kind:"system-preauthorization"` + `operatorId`，**不写** `decisionKind`/`targetRoleIds`，`customerDecision` 只记 `accepted`；拒绝**不写** `customer.decision`（无 unclassified/none 污染），只记诊断 `governance.preauthorization.declined`。真实客户与 `judge:` 路径逐字不变。系统预授权条目对 `latestAcceptanceDecision`/`evaluateFlowCompletion` 不可见。
- single/su/项目角色：不计算 `judgeContext`、不注入 `governanceJudge`，能力矩阵逐字不变。

### 账本（`governance-ledger.ts`）

- `decisionEvidence.kind` 增 `"judge"`；`decisionEvidence.judge?: GovernanceJudgeAudit`（有界）。旧读者忽略；门禁只读 `decisionKind/customerDecision`（已核对不读 `decisionEvidence`）。
- `decisionEvidence.kind` 增 `"system-preauthorization"`（2026-10-25 写入预授权）+ `decisionEvidence.operatorId?: string`（`system:` 前缀）。写入/读取校验：该 kind 必须带 system: operatorId、**禁止** `decisionKind`、`customerDecision` 必须为 `accepted`、禁止 `judge`——收口门不可能把系统预授权读成客户决定/未结算决定。

### 交互工具回执（`provider/runtime/tools.ts`）

- `request_confirmation`/`request_choice` 在 `out.judge` 时：
  `「<工具>：客户委托的判断 agent（替我审批/替我决策）已代批（代审批/代决策；operator:judge:<engine>）：<结论>。这不是客户本人点击，请在向客户汇报时说明是判断 agent 代批。」`
- 客户手批文案逐字不变。

### 验收证据

- **物证命名（P6 真机修复）**：`<flowId>-vN.md` 与 `<flowId>.proposal-vN.md` / `<flowId>.nomination-vN.md` 均解析，取最大版本；找不到才 `artifact-missing`。
- **pathProbes（P6 真机修复）**：`computeJudgeContext` **优先用 `request_confirmation` 的显式 `req.paths`**（非空时；空数组视为未给），否则回退 preview 的「一行一个路径」声明（关键词后可直接跟路径、冒号前允许修饰词、列表符/`路径：`/反引号容忍）；**不扫描散文**；`createConfirmedWriteIssuer` 同样优先显式 `paths` 发行写集；越界声明路径仍生成 `allowed:false` probe 并整卡回落。
- **schedule-write 新文件（P6 真机修复）**：目标 `docs/flows/<flow>.md` 不存在时不要求旧物证，改由 preview 正文核对（空 preview ⇒ manual）；文件已存在仍要求读取旧版；`appointment-write` 的 nomination 要求不变。
- **boundary.yaml 写前内容校验（P6 真机修复）**：`write_file`/`edit_file` 目标匹配 `角色卡/<id>/boundary.yaml` 时，用门禁引擎 Service 公共出口 `validateBoundaryYamlText` 校验最终内容；非法 ⇒ 拒绝写入、零文件副作用，回执「boundary.yaml 格式非法：<原因>；顶层只允许 role / entries / archived，请按模板重写」；`role-card.md` 与其他路径不校验内容。
- **advisory 规则集（2026-10-18 客户新裁定）**：`createShellGate` / `buildShellGate` / `assembleProjectShellGate` 支持 `advisoryRuleset`（项目角色装配默认 `true`，`run-role` 经 `shellArming` 透传/可显式关闭）。`(c)=allow` → `c-allow` 0 卡；`risky/review/deny` **跳过 (b)** 直接交 (a)（`c-risky→a-*` / `c-review→a-*` / `c-deny→a-*`），规则判定与命中原因写入 `OperatorPrompt.reason`。构造守卫：与 `readonlyOnly`/`operatorOnly` 互斥、必须有 `operatorChannel`；`false` 保留旧硬拒回归。
- **shell judge 超时（P6 真机修复）**：默认 `120_000ms`；`ANS_SHELL_JUDGE_TIMEOUT_MS`（正整数，非法回默认）可覆盖；文案带时长（如「判断超时（>120s）」）；shell 执行时限不变。**跨角色**：桌面 (a) 通道 `DEFAULT_SHELL_JUDGE_CHANNEL_TIMEOUT_MS` 仍 15s，须由桌面角色同步 ≥120s。
- **超时（P6 真机修复）**：治理 judge 默认 `120_000ms`；`ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`（正整数，非法回默认）可覆盖；计时只从模型判断开始（不含排队/等卡），文案带时长（如「判断超时（>120s）」）；shell judge 默认 120s。测试：judge **41/41**、shell **29/29**、advisory **7/7**、boundary 校验 **4/4**、e2e 1a **2/2**、`test/编排` **527 计/526 过**（symlink 环境红）、typecheck 0。
- **write 新文件（P6 真机修复）**：`write` 卡 artifacts/required-read 只收**已存在**的相关物证；新建目标文件不进入 required-read，改由 `preview` 正文核对；`preview` 为空 ⇒ `manual/insufficient-evidence`。`appointment-write`/`schedule-write` 的 nomination/flow 要求不变。
- 新增 `test/编排/governance-judge.test.ts` **32/32**：六卡种正反例、required-read/物证缺失、逐路径复核（probes/写根/禁写/来源/pathDecisions 覆盖）、accept-quick 不代批、任命推荐集、读取损伤、支持矩阵/超时/中止/busy、事实/推荐集解析、trio judgeContext 与 single/su/项目角色对照、账本 judge 字段与 group 交叉校验、两工具回执、审计有界、**acceptance 流程完成度机械门槛**、**write 新文件 preview/旧版物证**。
- 相关既有套件 74/74、P6 套件 42/42；`npm run typecheck` 0 错；全量三层 glob `node --test "test/**/*.test.ts"` 2900 计/2881 过/16 红/3 skipped，16 红均他域/环境既有（明细见 changelog）。

## 2026-10-22 治理分工第 1/3/5 项（governance-split-1-3-5，编排阶段 C）

依据：客户确认的策划方案 v1 `docs/planning/2026-10-22_design_governance-split-1-3-5.md` §5.3/§5.4/§7/§8.2/§8.6/§10.1、实施前标准 `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（P2/P3/P5/P9/P10/P11/P12/P15）、团队计划 §4.2（编排）与 §11.7。阶段 B 冻结契约（`src/model/runtime.ts` 的 `teamPlanPath`/`acceptanceCriteriaPath`/`acceptanceReportPath`/`changePackagePath`/`riskTier`/`teamPlanConfirmed`）只读消费。状态：**implemented-unverified**。

### 门禁与写路径路由

- `governance-gate.ts::GovernanceGateAction` 新增 `"write-team-plan"`（`ACTION_ROLE` → `convener`，复用提案接受门）；旧 `"write-nomination"` → `nominator` 保留为 legacy。`write-role-card` 仍 → `nominator`。
- **O2 实施派发前置门槛**：`evaluateDispatchGate` 对已有 appointment 决定的 flow，要求 `docs/acceptance/<flowId>-criteria-v1.md` 存在且结构合格（`validateAcceptanceCriteriaText`：flowId 可核对、验收表含 ID 列、风险档位 T0–T3、pass/fail/insufficient evidence、证据计划、版本/冻结）；缺失 → `acceptance-criteria-missing`，不合格 → `acceptance-criteria-invalid`。最新提案为 `proposal-accept-quick` 或旧流程（无 appointment）显式豁免。
- `run-role.ts::governanceActionForPath`：`docs/scheduling/<flowId>-team-vN.md` → `write-team-plan`（flowId 非法时不带 flowId，门禁 fail-closed）；`docs/nominations/**` 保留 legacy 路由。`governanceWriteOwnerHint` 文案同步为 Steward/Crew/Proof 分工。
- `governance-ledger.ts`：**不新增** `GovernancePower`/`GovernanceDecisionKind`；appointment 决定的 `power` 由发起角色职能决定（Convener → `schedule`，legacy Nominator 存量 → `nomination`），团队计划/readiness/标准/报告/变更包走 `artifact.observed`。

### 卡前守卫与卡种

- `TRIO_CARD_KINDS`：`nominator` 移除 `appointment`（保留 `appointment-write`/`write`）；`convener` 增加 `appointment`。
- `defaultGovernanceChoiceCardKind`：Convener 对 appointment 形状（非空选项且不含 accept/accept-quick/revise/reject/confirm）默认 `appointment`；Nominator 不再默认 appointment。
- **Convener appointment 卡前守卫**（`validateConvenerAppointmentCard`，触达客户前）：flowId 合法；最新团队计划 `docs/scheduling/<flowId>-team-vN.md` 存在可读；frontmatter `flowId` 一致；`recommended` 非空/无重复/不含内置治理角色（复用 `parseRecommendedRoleIds`，空集不静默接受）；卡选项覆盖推荐集且不含内置角色；计划角色表含每个推荐角色的职责目标/能力要求/写集/依赖且非空。失败 → `declined + notPresented:true`，不调客户通道、不计算 judgeContext、不镜像、不写账本、不占 pending。
- `judgeArtifactsForCard`：appointment → `teamPlanPath`（legacy 提名回落）；appointment-write → teamPlan+flow；acceptance → proposal+flow+criteria/report/change package；Convener/Verifier 的 `write` 可选带 teamPlan/标准/变更包。`latestVersionedArtifact` 扩展 `-team-vN.md`/`-criteria-vN.md`/`-report-vN.md`/`-change-vN.md` 版本扫描。
- `findDecisionArtifact`：appointment 绑定最新 `docs/scheduling/<flowId>-team-vN.md`（无则 legacy 提名，O4）；`recordCustomerDecision` 的 appointment `power` 由 Convener 职能为 `schedule`。
- `computeJudgeContext`：推荐集从团队计划解析（legacy 提名回落）；acceptance 读取变更包 frontmatter 并写入 `facts.riskTier`。

### 判断物证 / verdict / prompt

- `governance-judge-facts.ts::requiredArtifactPaths`：appointment 用 `teamPlanPath`；appointment-write 用 teamPlan+flow；acceptance 增加 criteria/report/change package；缺省约定路径分别为 `docs/scheduling/<flowId>-team-v1.md`、`docs/acceptance/<flowId>-criteria-v1.md`、`docs/acceptance/<flowId>-report-v1.md`、`docs/scheduling/<flowId>-change-v1.md`。`buildGovernanceJudgeFacts` 增 `teamPlanConfirmed`（最新 appointment 决定是否绑定 `-team-vN.md`）。
- `governance-judge-evidence.ts`：新增物证种类 `team-plan`/`acceptance-criteria`/`acceptance-report`/`change-package` 及确定性摘录；推荐集解析来源改为团队计划（legacy 提名回落）；错误文案「提名文件」→「团队计划」。
- `governance-judge.ts::verifyAcceptanceMechanics`：在流程收尾门之外要求标准存在/flowId 一致、报告存在且**首行五项**（风险档位/判定依据/选定检查/复用证据/全量回归）、变更包 frontmatter `riskTier` 存在、报告档位不低于变更包档位；缺失/不一致 → `insufficient-evidence`/manual，不 auto-approve。
- `governance-judge-verdict.ts::SOURCE_WRITE_ROOTS`：convener +`docs/scheduling/`；verifier +`docs/acceptance/`；nominator −`docs/nominations/`。appointment 文案改团队计划。
- `governance-judge-prompt.ts`：更新 convener/verifier 写区、团队计划/验收标准/档位提示与 appointment 推荐集来源。

### 流程/服务与会话提示

- `flow-state.ts`：`FLOW_STEP_KINDS` 枚举不变；注释登记新 step id 约定（`team-plan`/`appointment`/`role-cards`/`role-readiness`/`acceptance-criteria`/`change-package`）。旧版 Markdown 词形映射的**实件**在 `app/desktop/governance-advance.ts::flowStepEvidenceKind`（阶段 D/桌面窗口），本阶段只登记约定：`team-plan*`→artifact、旧 `nomination*`→decision 保留。
- `flow-service.ts`：`artifactPowerOf`/`observeFlowArtifacts` 行为不变；团队计划/readiness/标准/变更包作为普通项目相对路径可观察，`角色卡/` 仍不观察（新增专项测试）。
- `govern-session.ts`：标准工作流提示改为「意图确认 → 提案与契约 → 团队计划与客户任命 → Crew 写卡与就绪 → 流程与派发 → 独立验收」；Crew 纪律改为只读团队计划按名单写卡；Steward 纪律增加团队计划/readiness/变更包；Proof 纪律增加实施前标准、首行五项报告路径 `docs/acceptance/<flowId>-report-v1.md`、T0–T3 档位与证据复用。

### 验收证据

- 定向测试：`governance-gate` **20/20**、`governance-judge` **81/81**、`flow-state` **35/35**、`flow-service` **22/22**、`governance-session` **30/30**、`governance-ledger`+`decision-evidence-packet`+`decision-intent-drift` **32/32**；`node --test "test/编排/**/*.test.ts"` **735 计/734 过/1 红**（唯一红＝既有 Windows symlink EPERM `shell-authorized-routine.test.ts:103`，基线与任务书一致）；`npm run typecheck` **exit 0**。环境：Node v24.22.1 / npm 11.19.1 / Windows 11 / Git Bash。
- 新增/更新负例：团队计划卡前守卫六类失败（缺失/flowId 不符/推荐集空/含内置角色/选项不一致/角色行缺项）、推荐集内联数组解析与团队计划优先/legacy 回落、`latestVersionedArtifact` 扫描 `-team-vN.md`、`write-team-plan` 门禁正反例、appointment `power=schedule`、acceptance 标准/报告/首行五项/档位门槛、`team-plan` 步骤模板与枚举不变、`observeFlowArtifacts` 新 artifact 观察。
- **契约偏差/未做**：旧版 Markdown 映射 `team-plan*`→artifact 的可执行实件属桌面窗口（阶段 D），本阶段未改 `app/**`；`test/测试/` 跨角色 e2e 与全量 T3 回归归阶段 E 测试角色；appointment→Crew 桌面派发回路属阶段 D。文档状态 `implemented-unverified`，未提交/暂存/推送。

## 2026-10-22 角色粒度（bounded context）与 MapReduce 并行（Map B）

状态：**implemented-unverified**（定向检查通过，未经独立验收）。

### 单一团队计划解析器（`src/common/编排/team-plan.ts`，Q9 A）

Pipeline 公共出口 `src/pipeline/orchestration/run-role.ts` 再导出（桌面 Map C 经此消费，不直接 import 私有 common）：

- `parseTeamPlan(text, {flowId?}) => TeamPlanParseResult`：v2（`teamPlanSchema: 2`）跑 V1–V10；缺省/`teamPlanSchema: 1` 走 legacy（既有 v1 表格检查，不强制新字段）。
- `TeamPlanParseResult = { ok; legacy; teamPlanSchema: 1|2; flowId?; version?; riskTier?; recommended: string[]; modules: string[]; moduleList: TeamPlanModule[]; roleRows: TeamPlanRoleRow[]; issues: TeamPlanIssue[] }`。
- `TeamPlanIssue = { code: "V1".."V11"; severity: "error"|"warning"|"exception-review"; message; path?; roleId?; module? }`；`teamPlanIssueMessages(result, severity="error")` 取可读消息。
- `TeamPlanRoleRow`：`roleId/roleType/module/modules/primaryModule/duty/ability/writeset/writesets/contracts/testSurface/deps/dependsOnRaw/dependsOn/parallelGroup/group/apiSpec/apiSpecStatus/apiSpecReason/granularityRationale/isMap/isReduce`。
- 写集原语（V12 复用）：`parseWritesetCell(raw) => {entries, issues}`、`writesetsOverlap(a,b)`、`isGovernanceWritesetPath(value)`；`WritesetEntry = {raw,path,directory}`。
- `validateTeamPlanFlowConsistency(plan, flow) => TeamPlanIssue[]`：V11（Map 交付 `delivery-<主模块>`、owner、parallelGroup、dependsOn 精确 `{contract-freeze} ∪ 依赖角色 delivery-*`、Reduce 覆盖全部 Map、contract-freeze 存在）。
- `legacyTeamPlanRoleRowIssues(text, recommended)`：v1 表格检查（保留既有文案）。
- 不新增 cardKind / FlowStepKind / artifact kind；不调用 LLM 做粒度语义判断（语义仍归 Convener readiness）。

### flow 可选字段（方案 A）

- `FlowStateStep` 新增可选 `parallelGroup?: string`（`map-<slug>`/`reduce`）与 `dependsOn?: string[]`；`STEP_KEYS` 严格（未知字段仍拒绝）；`FLOW_STEP_KINDS` 不变。
- `parseFlowStateYaml` 静态校验：parallelGroup 语法、dependsOn 目标存在/无自依赖/重复/环、同 `map-*` 组无依赖路径、每个 reduce 步骤（dispatch/artifact，验收除外）覆盖全部 `map-*` dispatch、Map 不依赖 Reduce、Map dispatch 依赖 `contract-freeze`；`superseded` 步骤不参与 Map/Reduce 调度语义。旧 flow 无字段 ⇒ 零新增检查。
- `flow-service`：`viewOf`/`serializeFlow`/`supersede` 携带字段；旧 flow 序列化逐字不变；supersede 幂等比较含两字段。
- `governance-gate::evaluateDispatchGate`：步骤声明 `dependsOn` 时全部前置必须 `status: done`，否则 `dependencies-not-done`；不改变派发权，旧步骤无 `dependsOn` 不新增检查。

### 卡前守卫 / facts / 提示

- `run-role.ts::validateConvenerAppointmentCard`：v2 调 `parseTeamPlan` 跑 V1–V10；`docs/flows/<flowId>.yaml` 已写时跑 V11；失败不弹卡、不写账本。
- `computeJudgeContext`（appointment）：`facts.teamPlanSchema` + 有界 `facts.teamPlanModules`（≤20 项、每项 ≤64B）；`artifacts.teamPlanPath` 不变，不新增 artifact kind。
- `govern-session.ts`：标准工作流/Convener/Crew 提示同步 v2 字段、模块清单、Map/Reduce flow 可选字段、readiness 例外、测试分片与 manifest；不改变派发权/客户入口。

### 验收证据（Map B）

- `node --test "test/编排/**/*.test.ts"`：**769 tests / 768 pass / 1 fail / 0 skip**（唯一红＝既有 Windows symlink EPERM `shell-authorized-routine.test.ts:103`；基线 735/734/1，零新增红）；`npm run typecheck` exit 0。
- 定向：`team-plan` 17/17、`flow-state` 44/44、`flow-service` 24/24、`governance-gate` 22/22、`governance-session` 34/34；只读 `test/测试/governance-e2e-auto/**` 68/68（legacy 团队计划不回退）。
- **已知限制**：`flow_step_supersede` 工具不转发两字段、`flow_get` 文本投影不渲染（§11.6 已接受；服务层已支持，初始 YAML 可携带）；未改 `src/model/runtime.ts`、`src/provider/runtime/**`、`src/common/门禁引擎/**`、`app/**`、`test/测试/**`。
- 未做：Map C（桌面 v2 解析/V12）、Reduce 终验/全量 T3 回归、提交/推送/合并/发布。

## 2026-10-23 目录级授权与目录规范（teamPlanSchema v3，编排 D4）

状态：**implemented-unverified**（定向检查通过；未经独立验收）。

### 单一解析器（`src/common/编排/team-plan.ts`）v3 公共契约

Pipeline 公共出口 `src/pipeline/orchestration/run-role.ts` 再导出（桌面/测试经此消费，不复制解析）：

- `TEAM_PLAN_SCHEMA_V3 = 3`；`parseTeamPlan(text, {flowId?, projectRoot?}) => TeamPlanParseResult`：缺省/`1` legacy、`2` v2（V1–V11 逐字不变）、`3` = v2 字段 + V-D1–V-D9；未知 schema V1 error。
- `TeamPlanParseResult = { ok; legacy; teamPlanSchema: 1|2|3; flowId?; version?; riskTier?; recommended; modules; moduleList; roleRows; directories: string[]; directorySpecs: DirectorySpec[]; issues }`；v1/v2 的 `directories`/`directorySpecs` 为空数组。
- `DirectorySpec = { dir; owner; kind: "implementation"|"tests"|"docs"|"evidence"|"shared"; purpose; naming; subdirs: string[]|"*"|"**"|"—"; extensions: string[]; contract; testSurface: string[]; dependencies: string[]; forbidden: string[]; shared: "none"|"read-only"|"split" }`。
- `TeamPlanModule.implementationDir?: string`（v3 每个 module 必填非空）；`TeamPlanRoleRow` 新增 `authorizedDirsRaw/authorizedDirs/preciseWritesetRaw/preciseWritesets/authorizedDirIssues/preciseWritesetIssues`；v3 中 `writeset(s)` = `精确写集`。
- v3 角色表：`授权目录` + `精确写集`；`唯一写集` 为兼容别名（warning）；`边界` 列名 error；模块清单 `实现目录` 必填；治理关键路径只能精确文件。
- 规则 ID：V-D1 frontmatter 目录；V-D2 规范覆盖/owner/必填/枚举；V-D3 角色引用/孤儿/文件例外；V-D4 目录/写集不重叠；V-D5 规范语法/依赖 DAG/split；V-D6 模块实现目录/整层黑名单/单文件 warning；V-D7 治理关键路径；V-D8 共享策略；V-D9 路径逃逸/大小写/realpath（给出 `projectRoot` 时）。
- V11 `validateTeamPlanFlowConsistency` 不变；v3 不改变 flow schema。

### 布局核对纯函数（新增 `src/common/编排/directory-conformance.ts`）

- `checkDirectoryLayout({changedPaths, specs, roleDirs, projectRoot?, roleId?}) => {rows: LayoutCheckRow[], ok}`；`layoutCheckPassed(result|rows)`。
- `LayoutCheckRow = { path; owner?; dir?; checks: {type,subdir,naming,forbidden,pathSafe}; result: "pass"|"fail"; reason?; skipped?; deleted? }`；`LayoutCheckInput.roleId?`/`projectRoot?` 为可选扩展。
- 跳过 `docs/communication|planning|scheduling|acceptance` 与 `角色卡/<roleId>/...`；最长前缀 owner；无/多 owner fail；扩展名/子目录/命名/禁写区/路径安全逐项；删除按原路径、重命名按新路径；复用 `path-primitives`；不读 git、不写报告。

### 卡前守卫/提示

- `validateConvenerAppointmentCard`：v3 发卡前跑 V-D1–V-D9（含 realpath）；error 不弹卡/不写账本/不占 pending；warning/exception-review 不阻断；返回 `teamPlanSchema: 1|2|3`。
- `computeJudgeContext`：`facts.teamPlanSchema` 可为 3，新增有界 `teamPlanDirectories`（≤20×96B）；无新增 artifact kind。
- `govern-session.ts`：标准工作流/Convener/Crew 提示同步 v3；v2 兼容说明保留。

### 验收证据（编排）

- `node --test "test/编排/**/*.test.ts"`：796 tests / 795 pass / 1 fail（既有 Windows symlink EPERM `shell-authorized-routine.test.ts:103`，基线一致）；`npm run typecheck` exit 1，唯一错误 `app/desktop/interface.ts(1125,5)`（并行桌面窗口 D5 待消费 `1|2|3`）。
- 定向：`team-plan` 29/29、`directory-conformance` 15/15。
- 已知限制：V12/e2e/全量 T3 回归归 D5/D6/D7；不做任务级 `writeDirs`；Reduce 豁免模块实现目录归属；单文件目录为启发式 warning；realpath 仅在给出 `projectRoot` 时核对。文档状态 `implemented-unverified`，未提交/暂存/推送。

## 2026-10-25 独立复核能力透传与验收标准步骤收口（编排 A/B 面）

状态：**implemented-unverified**（编排定向测试与 typecheck 通过；桌面接线、e2e、独立验收未做）。

### A. `request_acceptance` 能力透传

- `AdapterCapabilities.requestAcceptance?: RequestAcceptanceFn`；`openRoleSession` 输入同名可选字段。
  **只在内置治理角色会话**并入 capabilities（`builtInGovernance`；项目角色即便误给也不注入）；未提供 ⇒ 缺席。
- `createRuntimeAdapterFactory` 把 `capabilities.requestAcceptance` 并入运行时选项（与 `flowGet`/`flowStepUpdate` 同形）；
  运行时核心据此注册 `request_acceptance`，缺席则不注册（结构性 fail-closed）。
- 类型单一来源 `src/model/runtime.ts`：`RequestAcceptanceInput` / `RequestAcceptanceResult`（code 冻结枚举）/
  `RequestAcceptanceFn`。编排只透传，不写 flow/账本、不做治理判定；**请求复核 ≠ 客户批准**。

### B. `completeAcceptanceCriteriaStep`（公共出口 `src/pipeline/orchestration/flow-state.ts`）

```ts
completeAcceptanceCriteriaStep(input: { projectRoot: string; flowId: string }):
  Promise<CompleteAcceptanceCriteriaStepResult>;

interface CompleteAcceptanceCriteriaStepResult extends FlowToolResult {
  evidence?: { kind: "artifact"; ref: string };
  criteriaPath?: string;
  alreadyDone?: boolean;
}
```

- 只处理精确 id `acceptance-criteria`；缺步骤 `acceptance-criteria-step-missing`；kind 非 artifact
  `acceptance-criteria-kind-unsupported`；已 done ⇒ `ok/idempotent/alreadyDone/code:"already-done"`（不写盘）；
  仅 `pending`/`dispatched` 可收口，其它状态 `acceptance-criteria-step-terminal`。
- 标准：复用 `latestAcceptanceCriteriaRelPath`（`docs/acceptance/<flowId>-criteria-vN.md` 最高 N）；
  缺失/不可读 `acceptance-criteria-missing`；不可安全观察 `acceptance-criteria-unobservable`。
- 账本：补 `artifact.observed{actorRoleId:"app",power:"app",artifactPath,artifactSha256,flowId}`（同 path+sha 不重复）；
  不写 `customer.decision`。错误码 `ledger-unavailable` / `ledger-write-failed` / `insufficient-evidence` / `write-failed`。
- 候选 YAML 复核 + `validateFlowEvidence` 沿用 flow-service 内部同一套（只过滤目标 stepId issue）；
  per-project 串行队列 + 原子写；事件 `flow.acceptance-criteria.completed`，view actor `app/app`。
- 不新增 `FlowStepKind`、不改步骤权限规则、不注册为角色工具、不改其它步骤/owner/kind。

### 证据（2026-10-25，win32 / Node v24.22.1）

- `npm run typecheck` → exit 0。
- `node --test "test/编排/**/*.test.ts"` → 908 tests / 906 pass / 1 fail / 1 skip；唯一红＝既有 Windows
  symlink `shell-authorized-routine.test.ts` 创建链接 `EPERM`（基线一致，本批未触碰）。
- 定向：`flow-service.test.ts` 84（83 pass + 1 既有 skip；含新增 7 例）、`request-acceptance.test.ts` 2/2。
- 桌面消费：`app/desktop/interface.ts` 从本公共出口 import；本角色未改 `app/**`、未 commit/push。

## 2026-10-26 gate 复核编排/Flow 核心

状态：**implemented-unverified**（编排定向测试与 typecheck 通过；桌面接线、跨角色 e2e、独立验收未做）。
设计：`角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` §4/§8/§9/§10/§12（方案 C）。

### Flow 契约（`src/common/编排/flow-state.ts`）

```ts
FLOW_GATE_KINDS = ["vertical-slice", "visual-baseline", "integration-performance"] as const;
type FlowGateKind = (typeof FLOW_GATE_KINDS)[number];
FLOW_GATE_STEP_ID_PATTERN = "^gate-[a-z0-9]+(?:-[a-z0-9]+)*$";
isFlowGateKind(value: unknown): value is FlowGateKind;
isFlowGateStepId(value: unknown): boolean;
```

- `FlowStateStep.gateKind?: FlowGateKind`（可选；**不是**新的 `FlowStepKind`）。只允许 `kind: artifact`；
  id 匹配 `gate-<slug>`；`owner` 必须是 `verifier`；`evidence` 必须存在且 `kind: artifact`；未知值/未知字段
  fail-closed。旧 flow 不含该字段 ⇒ 解析/序列化/ready/收尾门/证据对账逐字不变。
- `listReadyFlowSteps` 新增 skip 原因 `awaiting-gate`（gate 步骤永不进入 ready）。

### Gate 报告路径/版本（`src/common/编排/governance-gate.ts`）

```ts
gateReviewReportRelPath(flowId, gateId, version = 1): string; // docs/acceptance/<flowId>-<gateId>-report-vN.md
latestGateReviewReport(projectRoot, flowId, gateId): { relPath: string; version: number } | undefined;
latestGateReviewReportRelPath(projectRoot, flowId, gateId): string | undefined;
```

版本化不覆盖；只认 `.md` 与正整数版本；与最终验收报告 `<flowId>-report-vN.md` 命名不冲突。

### 应用专用 `completeGateStep`（公共出口 `src/pipeline/orchestration/flow-state.ts`）

```ts
completeGateStep(input: { projectRoot: string; flowId: string; gateId: string }):
  Promise<CompleteGateStepResult>;

interface CompleteGateStepResult extends FlowToolResult {
  evidence?: { kind: "artifact"; ref: string };
  reportPath?: string;
  reportVersion?: number;
  reportSha256?: string;
  alreadyDone?: boolean;
  gateKind?: FlowGateKind;
  verdict?: "pass";
  severityCounts?: { blocker: number; major: number; minor: number; nit: number };
  itemCount?: number;
}

classifyGateReviewTriage(triage: AcceptanceTriageSection): GateReviewVerdict;
gateReportSeverityCounts(items: readonly AcceptanceTriageItem[]): GateReportSeverityCounts;
```

- 只收口含 `gateKind` 的 artifact 步骤；已 done 幂等；`pending`/`dispatched`/`delivered` 可收口，其它状态
  `gate-step-terminal`。缺失步骤 `gate-step-missing`；非 gate 步骤 `gate-step-kind-unsupported`；
  非法 gateId `invalid-gate-id`。
- 报告复用 `acceptance-triage/v1`：缺/坏/矛盾 ⇒ `gate-report-invalid`；缺报告 `gate-report-missing`；
  不可安全观察 `gate-report-unobservable`。
- **防吹毛求疵**：fail/conditional 含至少一个 blocker/major ⇒ `gate-report-failed`（不标 done）；
  只有 minor/nit ⇒ `gate-report-nonblocking-fail`（按结构不符退回 Proof，不触发返工）；pass 可带
  minor/nit 备注并收口（补 app/app `artifact.observed` + gate 步骤 done）。
- 不写 `customer.decision`、不写 `gate.review`、不覆盖终态、不改其它步骤/owner/kind/gateKind。

### 角色工具面（`src/common/编排/flow-service.ts` / `src/pipeline/orchestration/run-role.ts`）

- `flow_step_update(status:"done")` 对含 `gateKind` 的步骤 ⇒ 新 code `gate-review-required`（manager/owner
  均不能代标；检查先于 revision 冲突）。
- `observeFlowArtifacts` 跳过含 `gateKind` 的步骤（失败/坏结构报告不得被观测成 done 证据）。
- `flow_step_supersede`：新 id 为 `gate-<slug>` 且 `kind: artifact` 时继承旧 gate 的 `gateKind`，并按约定
  派生新 gate v1 报告 evidence（工具载荷无这两个字段）；非 gate 形态新 id 不继承。
- `AdapterCapabilities.requestGateReview?: RequestGateReviewFn`、`openRoleSession` 同名可选输入；
  **只对内置治理角色中的统筹/Steward（trio convener）注入**；其他内置角色/项目角色即便误给也不注入；
  未提供 ⇒ 工具结构性不注册。类型单一来源 `src/model/runtime.ts`；本层纯透传。

### 账本 `gate.review`（`src/common/编排/governance-ledger.ts`）

- `GovernanceLedgerEntry.kind` 增 `"gate.review"`；可选 `gateReview`（`gate-review-decision/v1`）：
  `gateId` / `gateKind` / `reportPath` / `reportVersion` / `reportSha256` / `conclusion` /
  `severityCounts{blocker,major,minor,nit}` / `itemCount` / `requestId` / `flowRevision` / `decidedAt`。
- 写入校验：只允许 app 记录（`actorRoleId`/`power` 均 `app`）；枚举/版本/sha/时间严格；不得携带
  `decisionKind`/`customerDecision`/`acceptanceTriage`；fail/conditional 必须至少一个 blocker/major，
  pass 不得带 blocker/major（通过只允许 minor/nit 备注）。
- `latestAcceptanceDecision`、`evaluateFlowCompletion`、分诊/最终验收**不读**它；gate 完成事实以 flow 步骤
  `done` + `artifact.observed` 为准。

### 证据（2026-10-26，win32 / Node v24.22.1）

- `npm run typecheck` → exit 0。
- `node --test "test/编排/**/*.test.ts"` → 985 tests / 983 pass / 1 fail / 1 skip；唯一红＝既有 Windows
  symlink `shell-authorized-routine.test.ts:103` EPERM（基线一致）。
- 定向：`flow-gate.test.ts` 13/13、`request-gate-review.test.ts` 2/2、`governance-gate.test.ts` 28/28
  （含新增 gate 依赖硬拦 1 例）。
- 未做：桌面 `requestGateReviewForProject`/gate 记录/返工路由/重启恢复/系统行、`app/**`、`src/model/**`、
  `src/provider/**`、门禁角色卡/i18n、跨角色 e2e、真实界面 gate 复核、独立验收、commit/push。

## 2026-10-26 decision 卡（material-choice）编排分类与账本

来源：客户 2026-10-26 规则（PM 设计登记 `2026-10-26_design_decision-card.md`）+ 运行时核心已交付
`GovernanceChoiceCardKind."decision"` / `GOVERNANCE_CARD_GROUP.decision` / `CustomerInputOption.recommended`。
公开面仍是 `openRoleSession`（`src/pipeline/orchestration/run-role.ts`）与账本类型；**未新增冻结契约**。

### 编排分类（`src/pipeline/orchestration/run-role.ts`）

- `TRIO_CARD_KINDS.convener = ["appointment", "decision", "schedule-write", "write"]`；其余角色不含
  `"decision"`（liaison 仍只有 `intent-confirm`）。越权卡在触达客户通道前 `declined`，不弹卡/不写账本。
- `classifyCustomerDecision(cardKind, out, optionIds?)`（私有）：`case "decision"`——
  `answered` 且 `selected` 恰好一个**本卡选项 id** ⇒
  `{ decisionKind: "material-choice", customerDecision: "accepted", selectedOptions: [id] }`；
  多选/空选/未知选项 ⇒ `{ decisionKind: "unclassified", customerDecision: "none" }`。
  不产生 `targetRoleIds`，不进入 proposal/appointment/acceptance 语义。
- 账本条目（仅 flowId 合法时）：`kind:"customer.decision"`、`actorRoleId` = 发起角色（convener）、
  `power` = 发起角色职能（convener → `"schedule"`）、`decisionEvidence.kind:"customer-input"`、
  `messageSummary` = 卡标题；`selectedOptions` 见下。
- `judgeArtifactsForCard("decision")` ⇒ `{}`（decision 卡不挂 proposal/团队计划/flow 物证）。
- **默认兜底安全守卫**：choice 卡出现任一 `recommended:true` 时**不进入** choice 默认逻辑（Convener 的
  appointment 默认会把非保留选项 id 的卡当任命卡）；缺 `cardKind` ⇒ `declined + notPresented`
  （`governance.card.rejected{reasonCode:"missing-card-kind"}`），不触达客户/不写账本；与桌面
  `evaluateDecisionCardRequest` 的 `missing-card-kind` 同向。无 recommended 的 appointment 默认零回归。

### 账本（`src/common/编排/governance-ledger.ts`）

```ts
type GovernanceDecisionKind = ... | "material-choice" | "unclassified";

interface GovernanceLedgerEntry {
  ...
  /**
   * 仅 customer.decision{decisionKind:"material-choice"}：客户恰好选中的一个选项 id（审计）。
   * 不是 targetRoleIds（不伪装任命），不是写盘 paths；任何门禁/验收/收口判定都不读。可选、向后兼容。
   */
  selectedOptions?: string[];
}
```

- `material-choice` **不满足任何 gate/验收门**：`PROPOSAL_DECISION_KINDS`/`ACCEPTED_DECISION_KINDS` 不含它；
  `latestAcceptanceDecision` 只认 `"acceptance"`；`flow-state` 的 `CUSTOMER_DECISION_KIND_REFS` 不接受它
  作为 flow 的 `customer-decision` 证据；`hasUnresolvedDecision` 只把 `unclassified/none` 视为未结算。
- 写入校验不新增 `decisionKind` 值域校验（现状无枚举校验）；未知字段原样保留的兼容性不变。

### 判断 agent（「替我决策」）

- `evaluateGovernanceJudgeVerdict`（`governance-judge-verdict.ts`）approve 门槛新增 `case "decision"`：
  choice 卡 + **恰一个** `recommended:true` 选项 + `selected` 恰为该推荐项 ⇒ approve（`value.selected`）；
  其余 ⇒ `manual`（`insufficient-evidence`/`not-recommended`，可操作返工）；decision 组 `deny` 仍转
  `manual`。审计沿用 `governanceJudgeAuditFromOutcome`（group/cardKind/selected/reasonCode）。
- `requiredArtifactPaths`（`governance-judge-facts.ts`）：`case "decision"` ⇒ `{ paths: [], missing: false }`
  （不要求意图/提案/流程等规范物证）。
- 证据包（`governance-judge-evidence.ts`）：`requesterStatement.options` 透传
  `recommended?: boolean`（仅 true 时出现；旧卡种包体逐字不变）；新 decision 卡不读意图文件
  （`isDecisionCardKind` 仍只覆盖 proposal/appointment/acceptance）。
- 判断提示（`governance-judge-prompt.ts`）：卡片 options 透传 `recommended`；系统提示新增 decision rubric
  （只能按唯一推荐项代批、不得发明/改选；独立于意图/gate/验收）。推荐项的**默认执行**归桌面策略
  （`tryAutoSelectDecision`），编排不补默认值。

### 独立验收修复（F1/F2）

- **F1（账本）**：`recordCustomerDecision` 对 `outcome:"declined"` 且 `notPresented === true` **不写账本**
  （「无呈现 = 无决定」；与 judge 退回、system 预授权拒绝同口径）。避免 `unclassified/none` 成为
  `hasUnresolvedDecision` 的未结算决定、永久挡住 flow 收尾/最终验收。该早退位于 **`system:` 预授权分支
  之后**：`operatorId="system:write-preauthorization"` 的拒绝仍先记 `governance.preauthorization.declined`
  诊断（账本/行为不变）。
- **F2（共享结构校验）**，实现于 `src/common/编排/decision-card.ts`，经 `run-role.ts` 公共出口再导出：

```ts
export const DECISION_CARD_MIN_OPTIONS = 2;

export type DecisionCardRejectReason =
  | "role-not-allowed" | "not-choice" | "missing-flow-id" | "not-enough-options"
  | "invalid-option-id" | "duplicate-option-id" | "recommended-count";

export type DecisionCardValidation =
  | { ok: true; applicable: boolean; flowId?: string; recommendedOptionId?: string }
  | { ok: false; reasonCode: DecisionCardRejectReason; detail: string };

export function validateDecisionCardRequest(input: {
  request: CustomerInputRequest;
  roleId: string;
  governanceModel: "single" | "trio";
  metadata?: Pick<CustomerInputMetadata, "cardKind" | "flowId">;
}): DecisionCardValidation;
```

- 校验顺序：卡种解析（`request.cardKind ?? metadata.cardKind`；非 decision ⇒ `applicable:false`）→
  **仅 trio convener** → choice → 合法 flowId → ≥2 选项 → id 非空唯一 → **恰一个** `recommended:true`。
- `run-role.ts::governedInput` 在触达 raw 客户通道**之前**调用；失败 ⇒ `declined + notPresented:true`
  （不调 raw、不写账本、不带 operatorId）。覆盖 CLI/single/su/项目角色（它们没有桌面卡校验）。
  桌面窗口后续应从 `src/pipeline/orchestration/run-role.ts` 导入本函数/类型，不复制第二份。

### 证据（2026-10-26，win32 / Node v24.22.1）

- 新增 `test/编排/decision-card.test.ts` **19/19**。
- `node --test "test/编排/**/*.test.ts"` → **1004 tests / 1002 pass / 1 fail / 1 skip**（唯一红＝既有
  Windows symlink `shell-authorized-routine.test.ts:103` EPERM）。
- 定向桌面只读：`test/桌面应用/operator-wiring.test.ts` → **73/73**。
- `npm run typecheck` → **exit 0**（本批期间桌面角色并行编辑的临时错误随其收口消失；本批未改 `app/**`）。
- 未做：桌面卡面/默认推荐/系统行、桌面改用共享 `validateDecisionCardRequest`、跨角色 e2e、真实
  Electron、修复后的再次独立验收、commit/push。字面偏差（设计原文「不写 customer.decision」）见
  [变更记录](docs/change/2026-10-26_change_decision-card-orchestration.md) §七。

## 2026-10-26 图片查看能力透传（`view_image`，编排侧）

来源：客户 2026-10-26 要求（角色可查看项目内图片证据）；运行时核心已交付 `view_image` 工具与冻结契约
（两轮附件：工具本轮只回「已排队」，图片在**同一角色下一轮用户提示**以附件提供）。编排只做能力透传，
不读文件、不校验图片、不改任何写权。

### 公开面（`src/pipeline/orchestration/run-role.ts`）

```ts
// 契约家（src/model/runtime.ts；本角色只读导入，不复制第二份）
export interface ViewImageInput { path: string; image: PromptImage; }
export type ViewImageFn = (input: ViewImageInput) => Promise<{ ok: boolean; message?: string }>;

// 编排
export interface AdapterCapabilities {
  ...
  viewImage?: ViewImageFn;
}

openRoleSession(input: {
  roleId: string;
  ...
  /** 图片查看（view_image「注入才注册」）；通用只读能力，项目角色与内置治理角色都转交。 */
  viewImage?: ViewImageFn;
}, deps?: RoleSessionDeps): Promise<RoleSessionHandle>;
```

- **注入才注册**：`viewImage` 给出 ⇒ 并入 capabilities ⇒ `createRuntimeAdapterFactory` 同名透传 ⇒
  Service `...options` ⇒ `buildGovernedTools` 注册 `view_image`；未给出 ⇒ 字段缺席、工具不注册
  （结构性 fail-closed，沿 `dispatch_task` 先例）。`createRuntimeAdapterFactory` 显式写
  `viewImage: capabilities?.viewImage`，工厂 options 里即便误带同名字段也不会在能力缺席时注册。
- **通用只读**：不按角色收窄——项目角色与内置治理角色在调用方提供时都可用；与只给 su/统筹的
  `dispatchTask`/`requestAcceptance`/`requestGateReview` 等**不同**。本批**不改变**这些能力的注入矩阵。
- **两轮附件**：工具层校验项目相对路径、扩展名（png/jpg/jpeg/webp/gif）、≤10 MB、realpath 根内；
  通过后调用能力把 `PromptImage`（base64+MIME）排队为下一轮用户提示附件；工具本轮只返回文本
  「已读取并排队…本轮不要假装已看到」。能力 `ok:false`/抛错/契约外回执 ⇒ 工具按「未排队」如实转达。
- 本能力不写盘、不联网、不改变任何写权；一次性 `ans role run` 路径不涉及（不传 capabilities）。

### 证据（2026-10-26，win32 / Node v24.22.1）

- 新增 `test/编排/view-image.test.ts` **3/3**：项目角色能力同引用 + 工具注册 + handler 读取临时
  1×1 PNG 并把 `path`/`PromptImage` 原样交给能力；su 同样可用、未提供 ⇒ 零注册；与
  `requestAcceptance` 互不隐含/同给各自同引用/项目角色矩阵不变。
- `node --test "test/编排/**/*.test.ts"` → **1007 tests / 1005 pass / 1 fail / 1 skip**（唯一红＝既有
  Windows symlink `shell-authorized-routine.test.ts:103` EPERM）。
- `npm run typecheck` → **本批文件零错**；全仓 12 红均在桌面窗口属主文件（`app/desktop/interface.ts` 1、
  `test/桌面应用/*` 5、`test/测试/*` 6），根因＝桌面 `app/desktop/view-image.ts` 仍用临时本地
  `ViewImageFn`（`{path, images[]}`）与契约家 `ViewImageInput {path, image}` 不兼容；待桌面窗口收敛
  （其文件注释已登记「契约落树后改从契约家只读导入」）。本角色边界不允许改 `app/**`。
- 未做：桌面类型收敛/投递端到端、真实模型两轮附件、跨角色 e2e、独立验收、commit/push。
