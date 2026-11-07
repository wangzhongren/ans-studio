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

## 2026-10-26 需求变更申请能力透传（`request_requirement_change`，报告员/统筹）+ judge 指引

来源：客户 2026-10-26 要求 + 同日纠正/补充。Draft / 报告员需要新授权/范围（联网、外部目录/仓库、范围、
验收/技术标准、成本）时，不得写进提案卡「顺带获批」；应发 `request_requirement_change`。需求变更审批卡由
统筹（Convener）或提案角色（Rapporteur）发起（decision 卡，发起方不得自批）；审批人只有独立判断 agent
（勾选「替我决策」时按唯一推荐项代批）或客户（未勾选时手选）；主理不审批，只在批准后执行意图变更。
**申请 ≠ 客户批准，也不代表意图已变更**；判断 agent 不能在提案卡上代批任何新授权。

### 公开面（`src/pipeline/orchestration/run-role.ts`）

```ts
// 契约家（src/model/runtime.ts；本角色只读导入，不复制第二份）
export interface RequestRequirementChangeInput {
  flowId?: string; intentId?: string;
  changeKind: "scope" | "authorization" | "constraint" | "cost" | "other";
  summary: string; rationale: string; impact?: string; proposedIntentPatch?: string;
}
export interface RequestRequirementChangeResult {
  ok: boolean;
  code: "dispatched" | "already-dispatched" | "invalid" | "intent-not-found" | "flow-not-found" | "unavailable" | "rejected";
  message: string; flowId?: string; intentId?: string; requestId?: string;
}
export type RequestRequirementChangeFn = (input: RequestRequirementChangeInput) => Promise<RequestRequirementChangeResult>;

// 编排
export interface AdapterCapabilities {
  ...
  requestRequirementChange?: RequestRequirementChangeFn;
}

openRoleSession(input: {
  roleId: string;
  ...
  /** 需求变更申请（request_requirement_change「注入才注册」）；只给报告员/统筹（trio rapporteur/convener）。 */
  requestRequirementChange?: RequestRequirementChangeFn;
}, deps?: RoleSessionDeps): Promise<RoleSessionHandle>;
```

- **注入矩阵**：仅 `isTrio && (trioSpec?.id === "rapporteur" || trioSpec?.id === "convener")` 注入
  （2026-10-26 客户纠正/补充：需求变更审批卡这两类角色都可发起；发起方不得自批）；其他内置治理角色
  （liaison/nominator/verifier、single 模型的旧 su）与项目角色即便调用方误给也不注入。未提供 ⇒ 不注入
  ⇒ 运行时核心不注册工具（能力缺席＝结构性 fail-closed）。
- **透传**：`capabilities.requestRequirementChange` → `createRuntimeAdapterFactory` 显式同名透传 →
  Service `...options` → `buildGovernedTools` 注册 `request_requirement_change`。编排**纯透传**，不做
  意图校验/去重/派发/账本/系统行。**不改变**其他能力位（含 `requestClarification`/`handOffIntent`/
  `viewImage`）的注入矩阵。
- **一次性 `ans role run`** 不涉及（不传 capabilities）。

### 判断 agent 指引（`src/common/编排/`）

- `governance-judge-facts.ts::GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE`（文案单一来源，不参与裁决）：
  提案卡含未获意图授权的新联网/外部目录访问/范围扩张/成本授权 ⇒ 不得 approve；decision 组不能 deny
  ⇒ manual/intent-drift（approval 组夹带 ⇒ deny）；reason 必须写明「Draft 应先发
  request_requirement_change；需求变更审批卡由统筹（Convener）或提案角色（Rapporteur）发起，发起方不得自批；
  审批由独立判断 agent（替我决策时按唯一推荐项代批）或客户（未勾选时手选）完成；主理不审批，只在批准后
  执行意图变更；不得通过在提案卡上代批或将需求删掉绕过」。
- `governance-judge-prompt.ts` 系统提示逐字引用该常量（proposal rubric + 排除项例外）；decision rubric
  同步为「统筹/Steward 发起；报告员 Rapporteur 仅可为需求变更审批发起，发起方不得自批」；**机械权限零变化**：
  decision 组仍不得 deny、approval 组 deny 规则不变、`governance-judge-verdict.ts` 判定未改、未新增
  cardKind/FlowStepKind、`GovernanceJudgeFacts` 无新字段。
- `decision-card.ts`：`DECISION_CARD_ALLOWED_ROLES = ["convener", "rapporteur"]`——报告员仅限需求变更审批
  （运行时契约无用途字段，机械上限只到角色；用途由 judge 指引/角色纪律约束）；Lead/Crew/Proof/single/项目
  角色仍 `role-not-allowed`（不弹卡、不写账本）。

### 证据（2026-10-26，win32 / Node v24.22.1）

- 新增 `test/编排/request-requirement-change.test.ts` **5/5**（rapporteur 同引用+工具注册+载荷原样；
  convener 同样注入；未提供零注册；项目角色/旧 su/liaison/nominator/verifier 不注入；不隐含/不改既有矩阵）。
- 新增 `test/编排/requirement-change-judge-guidance.test.ts` **3/3**（指引文案；系统提示引用且机械权限
  表述不变；无新 cardKind、facts 键集不变）。
- `test/编排/decision-card.test.ts` 增报告员正向 1 例，拒绝集合改为 Lead/Crew/Proof，共享校验增
  rapporteur 正向与 Crew/Proof 反向（原有断言未弱化）。
- `node --test "test/编排/**/*.test.ts"` → **1016 tests / 1014 pass / 1 fail / 1 skip**（唯一红＝既有
  Windows symlink `shell-authorized-routine.test.ts:103` EPERM 基线）。
- `npm run typecheck` → **exit 0**。
- 未做：桌面注入扩展到统筹与 decision 卡审批通道端到端、主理执行意图变更链路、跨角色 e2e、真实 Electron、
  独立验收、commit/push。

## 2026-10-26 意图交接流程骨架（`ensureFlowSkeleton`，应用侧）

**来源**：客户反馈「意图确认/交接后、提案/团队计划前 `flow_get` 报 not-found」。应用在意图交接成功后、
报告员开始前按 intent 的 flowId 创建 `docs/flows/<flowId>.yaml` 通用骨架（顶层 `status: skeleton`）。
**应用专用，不是角色工具**。

### 公共出口（`src/pipeline/orchestration/govern-session.ts` 薄再导出）

```ts
export { ensureFlowSkeleton, FLOW_SKELETON_STATUS } from "../../common/编排/flow-service.ts";
export type { EnsureFlowSkeletonInput, EnsureFlowSkeletonResult } from "../../common/编排/flow-service.ts";
// W6-A 块补：export { parseIntentFrontmatter }（桌面从意图 frontmatter 取 flowId/qualityTier）

// 输入 / 输出（与桌面 session.ts::ensureIntentFlowSkeleton 的调用契约稳定）
interface EnsureFlowSkeletonInput { projectRoot: string; flowId: string; qualityTier: "prototype" | "production" }
interface EnsureFlowSkeletonResult {
  ok: boolean;
  created: boolean;      // true = 本次新建；false = 已存在（不覆盖）
  revision?: string;     // 仅 created:true：文件字节 sha256（与 flow-service revision 同口径）
  error?: string;        // ok:false 时可读原因（不抛）
}
```

### 骨架（`buildFlowSkeletonSteps()`，不经公共出口）

八步全部 `pending`；`kind` 只取既有 `FlowStepKind`（**不新增枚举**）；owner 仅为内置治理角色 id 或
`app`；不含项目角色 / `delivery-*` / gate / `build-scaffold`：

| stepId | kind | owner | dependsOn |
| --- | --- | --- | --- |
| contract-freeze | artifact | rapporteur | — |
| team-plan | artifact | convener | contract-freeze |
| appointment | customer-decision | convener | team-plan |
| role-cards | dispatch | nominator | appointment |
| role-readiness | artifact | convener | role-cards |
| acceptance-criteria | artifact | verifier | role-readiness |
| change-package | artifact | convener | acceptance-criteria |
| verification | acceptance（保留 id） | app | — |

`role-cards` 取 `dispatch`（与 `flow-state.ts` 步骤约定及桌面任命后写
`dispatch.accepted{stepId:"role-cards"}` 一致；`completeRoleCardsStep` 同时支持 `artifact`，替换时由团队
计划决定）。顶层 `status` 仅供人读/桌面识别，不参与机器判定。

### 语义（钉死）

- **已存在任何文件（骨架 / 完整流程 / 非法 YAML）⇒ `{ok:true, created:false}`，绝不覆盖**；存在性
  检查在 **per-project 串行队列**（与 `createFlowService` / 应用专用收口同一 `serialize` 队列）内执
  行，同进程并发恰一个 `created:true`。
- 不存在 ⇒ 生成骨架、`serializeFlow` 后用 `parseFlowStateYaml` 复核、`mkdir -p docs/flows`、共享
  `atomicWrite`（tmp + fsync + rename；失败不触碰目标）；读取失败非 ENOENT（目标被目录占用/无权限）
  或写盘失败 ⇒ `{ok:false, created:false, error}`，不抛。
- 输入 fail-closed：空 `projectRoot` / 不匹配 `GOVERNANCE_SLUG_PATTERN` 的 `flowId` / 非法
  `qualityTier` ⇒ `ok:false` 且零落盘。
- **零副作用**：不写治理账本、不写客户决定、不写 `.ans`。
- 残余：存在性检查与 rename 之间为 check-then-rename——同进程已串行化；跨进程同窗口创建同一 flow
  时仍可能被覆盖（应用是骨架唯一写者，正常路径不触发；绝对保证需 `src/common/shared/` no-clobber 原语）。

### 证据（2026-10-26，win32 / Node v24.22.1）

- `test/编排/flow-service.test.ts` 新增骨架 **5 例**（形状/revision=文件 sha256/不含 delivery-/gate；
  骨架、完整流程、非法 YAML 均不覆盖；非法输入零落盘；目录占用或 `docs/flows` 为文件时失败不破坏现场；
  并发恰一个 `created`）。
- `node --test "test/编排/flow-service.test.ts" "test/编排/flow-state.test.ts"` → **153 / 152 pass /
  1 skip**；`test/编排/**` → **1021 / 1019 pass / 1 fail / 1 skip**（唯一红＝既有 Windows symlink EPERM）。
- `npm run typecheck` → **exit 0**。
- 未做：桌面字面量收敛（`interface.ts` 仍写 `"skeleton"`，建议导入常量）、跨角色 e2e、独立验收、commit/push。

## 2026-10-27 验收标准产物汇报能力透传（`report_artifact_ready`，编排侧）

来源：客户 2026-10-27 新设计——验收标准由质检写完后**只向应用汇报**（`report_artifact_ready`），由应用
校验并决定是否收口；质检不再盯文件自动勾卡、不得自批 flow 状态。运行时核心已交付冻结契约与工具
（`src/model/runtime.ts`、`src/provider/runtime/tools.ts`；本角色只读消费，不复制第二份形状），门禁引擎
同批只改 verifier 卡文本（未新增能力位）。本批只接线编排注入端。

### 公开面（`src/pipeline/orchestration/run-role.ts`）

```ts
// 契约家（src/model/runtime.ts；本角色只读导入）
export interface ReportArtifactInput {
  flowId: string; stepId: string; path: string;
  summary?: string; sha256?: string;
}
export interface ReportArtifactReceipt { ok: boolean; accepted?: boolean; message?: string }
export type ReportArtifactFn = (input: ReportArtifactInput) => Promise<ReportArtifactReceipt>;

// 编排
export interface AdapterCapabilities {
  ...
  reportArtifact?: ReportArtifactFn;
}

openRoleSession(input: {
  roleId: string;
  ...
  /** 验收标准产物汇报（report_artifact_ready「注入才注册」）；只给质检/Proof（trio verifier）。 */
  reportArtifact?: ReportArtifactFn;
}, deps?: RoleSessionDeps): Promise<RoleSessionHandle>;
```

- **注入矩阵**：仅 `builtInGovernance && trioSpec?.id === "verifier"` 注入；其他内置治理角色
  （liaison/rapporteur/nominator/convener）、single 模型的旧 `su` 与项目角色即便调用方误给也不注入。
  未提供 ⇒ 字段缺席 ⇒ 运行时核心不注册工具（能力缺席＝结构性 fail-closed）。
- **透传**：`capabilities.reportArtifact` → `createRuntimeAdapterFactory` 同名能力位 → Service
  `...options`（`RuntimeSessionOptions` 经 `Omit<GovernedToolsOptions,…>` 继承）→
  `buildGovernedTools` 注册 `report_artifact_ready`。编排**纯透传**：同一引用、不包装、不预调用、
  不写盘、不写 flow、不伪造接受或决定；**汇报成功 ≠ 自动完成**（`accepted:true` 只表示应用已接受该
  产物，是否收口/推进 flow 由应用决定并写入）。
- **一次性 `ans role run`** 不涉及（不传 capabilities）。
- **不改变** `requestAcceptance`/`requestGateReview`/`requestBoundaryChange`/
  `requestRequirementChange`/`viewImage`/`dispatchTask` 等既有能力矩阵。

### 证据（2026-10-27，win32 / Node v24.22.1）

- 新增 `test/编排/report-artifact.test.ts` **3/3**：verifier 同引用透传 + `report_artifact_ready`
  注册 + 载荷原样路由 + 回执原样转达（含「不等于自动完成」「不要自行修改 flow 状态」）+
  打开/开轮/settle 零 `docs/flows`/零治理账本写入；`deps.runtimeOptions` 残留同名能力也不能旁路给
  非 verifier；verifier 未提供、liaison/convener/旧 su/项目角色误给 ⇒ 能力缺席、工具不注册。
- `node --test "test/编排/**/*.test.ts"` → **1024 计/1022 过/1 红/1 skip**（唯一红＝既有 Windows
  symlink EPERM）。
- `npm run typecheck` → **exit 0**（桌面属主并发补齐 `SessionManagerDeps.reportArtifact` 后全仓零错；
  本批编排文件始终零类型错误）。
- 未做：桌面应用侧校验/收口实现与注入、真实 Electron/模型端到端、跨角色 e2e、独立验收、commit/push。

### A1：派发硬授权 + advisory 纯逻辑（2026-11-02，dispatch-guardrail-relax）

**公开契约（`src/common/编排/workflow-preconditions.ts`）**：

```ts
type DispatchAuthorizationInput = Pick<
  DispatchPreflightInput,
  "fromRoleId" | "targetRoleId" | "targetBuiltIn" | "chiefRoleId" | "convenerRoleId"
> & { targetExists: boolean };

type DispatchAuthorizationFailure = { ok: false; code: string; message: string; rejection: MechanicalRejection };
type DispatchAuthorizationResult = { ok: true } | DispatchAuthorizationFailure;
type DispatchPreflightResult = { ok: true; advisories: DispatchAdvisory[] } | DispatchAuthorizationFailure;

function evaluateDispatchAuthorization(input: DispatchAuthorizationInput): DispatchAuthorizationResult;
function evaluateDispatchPreflight(input: DispatchPreflightInput): DispatchPreflightResult;
```

- `DispatchPreflightInput`：`targetExists?: boolean`（复合输入兼容窗口，窄输入必填；私有唯一 `resolveTargetExists = targetExists ?? targetCardFound`，fail-closed；B1 必须显式传 boolean）、`chiefRoleId: string | null`、可选 `runFacts?`/`versionedDocBaselineViolations?`/`run.modules?`；`targetCardFound` 保留为兼容字段。
- 硬授权顺序：自派 → 来源（幕僚/运营）→ 幕僚目标类型/显式 allowlist（product/rapporteur/nominator/convener/verifier）→ 运营目标类型/`targetExists`。幕僚→未知非内置走 `chief-to-project-forbidden`（类型优先）；幕僚→`su`/其它非 allowlist 内置走 `target-card-missing`；运营→不存在项目 worker 走 `target-card-missing`。
- `evaluateDispatchPreflight` 保留为唯一复合入口，内部复用 `evaluateDispatchAuthorization` 后调用 `collectDispatchAdvisories`；无第二份授权判定。

**advisory（`src/common/编排/dispatch-advisories.ts`）**：

- `DispatchAdvisoryCode`（23 个）与 `DispatchAdvisory { code; message }`；`collectDispatchAdvisories(input: DispatchPreflightInput): DispatchAdvisory[]`。
- 纯函数、不读盘/写盘、永不 `ok:false`；链级只报首个未满足项；latest 用于链级，run 专属 `run-role-missing`/`module-missing` 用 `run.roles`/`run.modules`（pinned）；`run.roles`/`run.modules === undefined` 按无事实处理（不产 code、不锚定该 pinned run）；legacy 仅 advisory 事实；`run-pin-failed` + `run-pin-required` 可组合且顺序固定；全部 code 只由本模块产出。
- 调用方（B1）顺序：硬授权 → 事实收集 → run 只读/记账（含 handoff pin）→ `verifyVersionedDocBaselines` → collector → `task.created` → 投递/回执。

**证据（2026-11-02，win32 / Node v24.22.1）**：`test/编排/{workflow-preconditions,dispatch-advisories}.test.ts` **34/34**；补充 `test/编排/{task-state,appointment-roster}.test.ts` **21/21**；`npm run typecheck` exit 0；候选树 `a593ddcb4ae60f468d1a5919722a4fa23ee9b71e`。见[实施记录](docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation.md)。

## 2026-11-03 客户授权平面 B1：客户指令 Pipeline 公共句柄（冻结 v1）

`src/pipeline/orchestration/customer-directive.ts`（B-2 新单文件；C1/C2 只读消费，B1 冻结）：

- `createCustomerDirectiveRuntime({projectRoot,sessionId,present,now?,store?}) => CustomerDirectiveRuntime`。
- `submitFromInput(SubmitFromInput) => Promise<SubmitResult>`；`approvalFacts()/decisionFacts()` target-scoped 快照（`ledgerErrors>0 ⇒ active=[]`）；`takeDirective(req,intent?)`；`applyDecisionDirective(card,hooks?)`（`DecisionHooks.emitResult` 唯一可见行钩子；抛错/拒绝/无钩子 ⇒ 不消费、返回 undefined）；`revoke(id,target)`；`list()`。
- `SubmitFromInput.decisionGroupEnabled: boolean` 必填；`DecisionApplyResult = selected|rejected|conflict|no-match`；`DirectiveErrorCode` 见类型；`DirectiveStore.relPath` 必须 = A1 `CUSTOMER_DIRECTIVES_REL`。
- 账本 `.ans/state/customer-directives.jsonl`（A1 常量）；Provider/Service 在 `src/provider/directive/`、`src/service/directive/`；轮转/串行追加/旧→新读取/坏行复用 A2 `jsonl-ledger`（不写第二份）。
- shell 闸：`CreateShellGateOptions.takeDirective?`（readonly 构造期拒绝）；顺序 preblock→write-guard→classify→**指令 deny**→c=deny→c=allow→script→takeGrant→**指令 allow**→既有链；审计 `directive:{id,scope}`、`by:"directive:<id>"`（与 judge/customerGrant 互斥）。
- Q9：`request.resolved.by`/`version.decision.decidedBy`/run manifest `decidedBy` 加 `"directive"` + `directiveId`。
- 状态 `implemented-unverified`；证据见 [B1 实施记录](docs/change/2026-11-03_customer-authorization-plane-B1-implementation.md) 与 `docs/change/2026-11-03_customer-authorization-plane-B1-evidence/`。冻结声明 `10-freeze-statement.txt`。

## 2026-11-04 下载文件申请 B1：下载 Provider/Service/Pipeline + 指令/判断集成（冻结 v1）

状态：`implemented-unverified`（HEAD `f0adb49`；未 commit/push；B1 层验证见 [实施记录](docs/change/2026-11-04_download-requests-B1-implementation.md) 与 `docs/change/2026-11-04_download-requests-B1-evidence/`）。

- **Provider** `src/provider/download/`：`createNodeHostResolver()`（全量 DNS/10s 超时）、`createNodeDownloadTransportProduction()`（钉扎 lookup/`remoteAddress` 复核/逐跳重定向/连接-空闲-总超时/仅 200 写盘/TLS 固定校验）、`createDownloadLedger(projectRoot,ledgerLimits?)`（`.ans/state/downloads.jsonl`，复用 `jsonl-ledger`）、`createDownloadConsumerEpochStore(projectRoot)`（`.ans/state/download-consumer.json`，`{version:1,enabledAt,appVersion}`；missing/ready/unreadable，不可读不重写）。生产工厂**无** resolver/address/TLS/agent 测试缝；测试缝只在 `impl` 与 `createDownloadRequestRuntimeForTest`。
- **Service** `src/service/download/`：`createDownloadPolicy({env?})`；`checkUrl`/`classifyIp`（IPv4 拒绝清单 + IPv6 `2000::/3` 正向 + Teredo/6to4/ORCHID/文档段排除）/`isSameHostForRedirect`（端口不参与，https→http 降级拒绝）/`suggestCardFilename`（卡片阶段无 Content-Disposition）/`resolveExecutionFilename`（执行阶段 filename* 优先）/`sanitizeFilename`/`boundJudgeFacts`（≤2KiB，只截断 url/purpose）/`resolveConfig`（`ANS_DOWNLOAD_*`，非法回退+诊断）。
- **Pipeline** `src/pipeline/orchestration/download-request.ts`：`createDownloadRequestRuntime(DownloadRequestOptions)`（每会话绑定 `projectRoot/roleId/runtime/appVersion/present/takeDownloadDirective`）；`ready()/consumerEpoch()/download(input)/dispose()`；B1 生成 `downloadId=dl-<uuid>`；`DownloadApprovalPresenter.present(request,hooks)` + `onPresented({requestId})`；`DownloadApprovalRequest` 含 `factsAvailable/governanceFacts/downloadFacts/attribution`；`DownloadRunInput` 含 `attribution?`、无 downloadId/requestId；每项目执行并发 ≤2（模块级 Map）；预授权路径零 `request.*`。
- **指令消费者**：`CustomerDirectiveRuntime.takeDownloadDirective({host,enabledAt,toolCallId?})`（`enabledAt` 必填；deny 优先/allow 补足/`once` durable 消费失败回落；同快照/`ledgerErrors>0 ⇒ 无指令`）；`list()` G8 A epoch 投影（旧 domain ⇒ `consumer:"none"`，新 domain ⇒ `"download"`）；`consumerOf` domain ⇒ `"download"`。
- **判断/机械**：W-6 `requiredArtifactPaths("download")={paths:[],missing:false}`；W-7 download rubric + `request.download` 渲染 + 合成 `flowId:"download"` 标注；`governance-judge-verdict.ts` `case "download"`（confirm+`confirmed:true`，无 paths/pathDecisions）+ `SAFE_MANUAL_REASON_CODES` 加 `download-facts-missing`；`RejectionOwner:"requester"` + 17 个 `download-*` RULES + `download-facts-missing` 入 UNVERIFIABLE。
- **能力位**：`AdapterCapabilities.requestDownload` + `openRoleSession` 输入/`createRuntimeAdapterFactory` 透传；`CARD_KIND_ROUTE_HINTS.download`（F6）；CLI/判断会话结构缺席。
- **冻结**：上述 Provider/Service 公共入口、Pipeline 句柄/presenter/结果形状、`takeDownloadDirective`/`list()` 投影、`consumerOf("download")`、W-6/W-7、错误码/owner、`downloads.jsonl`/`download-consumer.json`、并发 ≤2；C1/C2/D1 只消费，变更回 B1 重跑证据。

## 2026-11-05 治理权力矩阵 C3：Pipeline 取数 / 幕僚提示块 / 六角色工具门控（implemented-unverified）

状态：已实现、`test/编排` 925/924/1（唯一失败=既有 Windows symlink EPERM）、`npm run typecheck` exit 0；**未验收、未 commit/push**。证据见 [实施记录](docs/change/2026-11-05_governance-authority-matrix-orchestration-implementation.md)。

- `src/pipeline/orchestration/run-role.ts`（C3，唯一源码写集）：
  - `openRoleSession` 在 `trio + built-in-governance + 六个内置角色之一` 时启用矩阵：chief 在能力组装前计算**一次**快照并经 `AdapterCapabilities.contextSections`（单段、非空）交给 C2；六个内置角色注入 `AdapterCapabilities.governanceMatrix`（注入才注册；五个非幕僚启动不计算；工具调用每次重新取数 + C1b `buildGovernanceMatrix`/`renderGovernanceMatrix`）。
  - 取数：`listProject` 一次（worker `filter(!builtIn)`、`issues`/`warnings`/`roleDirectories` 透传；枚举失败唯一载体 `roleDirectories.error`）；acceptance 仅对可解析角色（内置六角色或 `project.roles[roleId]` 存在）经 Service 公开出口 `resolveBoundary(...).acceptance`；worker 只消费 listing 声明 `boundary.entries` 与 `cardSections`（`displayName ← cardSections.title`）；`cardKindsByRole` 为 `TRIO_CARD_KINDS` 按 `GOVERNANCE_CONFIRM_CARD_KINDS` 的拆分快照；`initiationByRole` 由既有门控谓词派生；会话标志取真实注入状态。
  - 上限常量：`GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`/`GOVERNANCE_MATRIX_TOOL_MAX_CHARS`/`GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS` 均从 C1b `src/service/governance-matrix/public.ts` 导入；`run-role.ts` 不写字面量。
  - 诊断（不含卡面全文/敏感信息）：`governance.matrix.build`（trigger/tool、status、roles、warnings、truncated）、`governance.matrix.unavailable`、`governance.matrix.listing.failed`、`governance.matrix.contract-violation`、`governance.matrix.acceptance.failed`。
  - 不注入：worker、`su`/single、判断会话（不经 `openRoleSession`）、`runRole` 一次性 CLI（`createAdapter(gate)` 无 capabilities）。`createRuntimeAdapterFactory` 对 `contextSections`/`governanceMatrix` 纯透传。
- 消费契约（只读）：C1a `src/model/governance-matrix.ts`（`GovernanceMatrixFn`/`GovernanceMatrixInput`/`MatrixRoleDirectories.error`/`WorkerRoleInput.displayName`）；C1a `ProjectListing.issues/roleDirectories`、`ProjectRoleSummary.cardSections.title`；C1b `src/service/governance-matrix/public.ts`；C2 `GovernedToolsOptions.governanceMatrix`、`RuntimeProviderOptions.contextSections`、`RuntimeSessionOptions.contextSections`。
- 冻结：本文件列出的 `openRoleSession` 矩阵注入行为与工具门控（对外表现）；C3 完成即冻结，变更回编排并重跑受影响证据。

## 2026-11-05 S1：角色直接能力存储/Service（在实施）

- Provider入口 `src/provider/trunk/public/trunk-store.ts`，`createFsTrunkStore(root):TrunkStore` 的加法能力（仅旧替身可缺省；直接Service缺一必拒绝）：
  - `prepareSnapshot(snapshot:CompleteSnapshot):Promise<StoreRead<SnapshotRef>>`
  - `captureSnapshot({snapshotId,createdAt,files:[{path,sha256}],baseSnapshotRef?}):Promise<StoreRead<SnapshotRef>>`；未改ref从旧不可变字节继承，changed读取真实项目字节并核hash/realpath。
  - `readSnapshot(ref):Promise<StoreRead<CompleteSnapshot>>`；逐字节hash＋完整摘要复核，ID不可覆盖。
  - `compareAndSwapManifest(expected:TrunkCommitRef|null,next:TrunkManifest,snapshot:SnapshotRef):Promise<StoreWrite|{ok:false,code:"conflict",message:string}>`；同项目R9锁、重读version/digest/flow、完整refs闭包、一次manifest替换为提交点。新manifest不可走旧writeManifest。
  - `readFrozenRoleEvidence(evidence:FrozenRoleEvidence):Promise<StoreRead<CompleteSnapshot>>`；全部8refs同snapshot且字节闭合，旧缺证不读live。
  - `readOperation(operationId):Promise<StoreRead<TrunkApplyJournal>>` / `writeOperation(journal):Promise<StoreWrite>`；每op独立日志，不用单journal保存并发操作。
  - `readManifestAt({version,digest}):Promise<StoreRead<TrunkManifest>>`；当前或不可变history，按内容证明已提交。
  - `readProjectFile(rel):Promise<StoreRead<{bytesBase64,sha256}>>`；真实路径限项目，Service不自行读fs。
- version-change Provider public现承载 `refreshVersionedDocFreezeSnapshot(root,{migrationCompleted?,now?}) -> Promise<VersionedDocFreezeSnapshot>`、`appendDocFreezeRecords` / `appendDocDraftMarkerRecords`、原R9 `acquireVersionLock/ownsVersionLock/releaseVersionLock`、`scanVersionedDocuments`。返回普通数据，不安装G内存状态/不回调G。
- Service入口 `src/service/trunk/public/trunk-service.ts`：`createTrunkService(deps):DirectTrunkService`（兼容旧TrunkService），新增 `executeDirect(TrunkDirectApplyInput):Promise<DirectActionReceipt>` / `recoverDirect(operationId):Promise<DirectActionReceipt>` / `readEffectiveSnapshot():Promise<TrunkServiceResult<{manifest,snapshot}>>`。
- Direct输入由可信宿主填actorRoleId、kind、operationId、applicationId、flowId、baseTrunk、target整单、expectedFrom逐changed目标的旧有效ref hash；另可给preparedSnapshotRef和roleDocumentChecks。模型不接受host结果。输入完整类型在abstract中；role checks单一DTO引用Model `RoleDocumentCheck`，Pipeline组合G验证，O只核同snapshot摘要及三文件hash。
- 来源为真实role-direct；不经过客户approved、不填decisionId、不重pin旧run。提交前失败拒绝且旧有效指针；提交后元数据失败明确committed-pending-recovery；按manifest+snapshot+op journal恢复，不按phase猜提交。
- 当前真实验证：证据目录03 Provider18/18；06 Provider＋direct22/22；08相关Service47/47。仍在补首建null-CAS及VCA metadata定向，以上不是最终冻结/整链验收。

### S1最终checkpoint与chief公开入口

- S1+chief窄节点33源测聚合 `21E75C1D2DE58A70B44963632B42FE64811B6EDD5C7355E0863697866129AE77`，逐文件见 `docs/change/2026-11-05_direct-role-capabilities-evidence/28-S1-freeze-hashes.json`；26最终定向106/106；主TS27仅未放O1/Q已列workflow4条，renderer25 exit0。后继O1改依赖后按影响重核。
- `createTrunkService({projectRoot})` 可由Service自己从Provider public局部构造存储；原完整deps仍兼容。新增`prepareDecisionEvidence(DecisionEvidenceInput)`/`checkDecisionEvidence(DecisionEvidenceVerification)`，返回普通证据/核验结果，不返回Provider对象。
- `run-role.ts::prepareChiefDecisionEvidence({projectRoot,originRoleId,request,metadata?})` 返回 `Promise<{baseDigest,evidenceRefs,context,isCurrent():Promise<boolean>}>`。有task核实际created→run；pinned只读其snapshot/八ref；draft只读绑定hash资料；无run读真实同flow目标，普通工具没有artifacts时从实际规范版本资料发现最新版。旧pin不混新trunk；isCurrent真实核相应run、相关task、target hash及规范资料发现清单。正文/文件数有界，secret/非文本/超限/缺证拒绝。
- `openRoleSession` 宿主可传 `chiefDecisionContext?:ChiefDecisionExecutionContext`、`decidePendingRequest?:DecidePendingRequestFn`；仅解析后的built-in trio chief能用，能力面只decide＋context、persistSession:false，gate拒全部写、关闭自动repin。没有主chief队列复用。
- `task-state.ts` 新chief呈现/结算来源结构核验与真实request绑定；旧合法chief source重放不查当前开关。Model `RoleDocumentCheck`/`isValidDocFreezeRecord`单源消费。
- 原始首红19揭示CAS try内未await写导致finally早释锁；已await原子写完成再释锁＋写前fencing，20和26独立进程竞争/锁持有者真实退出恢复通过。00/02沙箱temp限制与03正常环境对照均保留；未改共享atomicWrite或放宽断言。

### O1 checkpoint — real direct submission / pinned readers / planning parser (2026-11-05)
- `createVersionChangeRuntime(...).submitDirect(input,trustedActorRoleId)` commits through the real complete-snapshot CAS, then finalises direct metadata and writes source-bound task audit. `notifyDirect({key,recipientRoleId,message,source})` must be idempotent for the fixed operation/digest/event/recipient key. Missing or failed post-commit effects return `committed-pending-recovery`; ordinary submit/present no longer create customer approval cards.
- `createDirectRoleRuntime({projectRoot,actorRoleId}).selectRunChange(input,signal?)`: continue-frozen registers the actual run/pin/target with byte CAS and operation replay. Stop/restart are explicitly blocked until the lifecycle owner can prove quiescence; no replacement run is claimed.
- `readRunRoleContext({projectRoot,runId,roleId})` returns the ordinary G `documentContext` from the real immutable run closure. Missing workflow, roster mismatch or any missing same-pin evidence rejects; no live fallback.
- `prepareCreatedTaskClose({projectRoot,actorRoleId,taskId})` returns actual task/run/basis/reportRef/reportStatus/reportSummary/taskDigest after checking the real creator and latest assigned-role report. The report reference is generated from the exact actual report ledger line and run bytes. The close mutation and dependency-release integration remain pending.
- Provider additions in the existing trunk public contract: `readRunRecord(runId)` returns opaque JSON plus exact byte SHA; `compareAndSwapRunRecord(runId,expectedSha256|null,value)` uses the existing project lock/fencing and awaits the atomic write. `readManifestVersion(version)` validates actual current/history bytes and their complete snapshot closure. `readOperationEvents(root)` returns actual ledger lines and parsed objects; no business policy is installed by Provider.
- `parseTeamPlan(text,{flowId,version,modules,roster,rosterFacts})` is pure O parsing of C0 §7. Required frontmatter: schema/flowId/version/modules/roster/roleRows; each roleRow has roleId/modules/writesets/dependsOn. Ownership remains the real roster, paths narrow actual module roots, and explicit dependencies must be a DAG. Schema-only history is read-only. Plan formation grants no D3 or execution authority and does not constrain a future valid proposal to old active permissions.
- Historical supersession is not inferred from metadata status. Service scans actual current/history and application journal proof; already committed or unknown/corrupt evidence rejects replacement. An explicit link only preserves a truly uncommitted old request; the original record bytes remain unchanged.
- Current evidence: `40-O1-plan-parser-proof.txt` 54/54; `41-O1-supersede-commit-proof.txt` 50/50 (includes actual commit with metadata still submitted); bridge `31` 8/8. Main TS `39` has only the two pre-existing Q optional-workflow fixture errors; no O diagnostic at that checkpoint. Old cancelled-card suite red `30` remains retained and requires contract-aligned test replacement, not reopening customer cards.

### O1 actual checkpoint (2026-11-05)
`createDirectRoleRuntime({projectRoot,actorRoleId})` now returns four host-bound methods: `completeTeamPlan`, `activateRoleDocuments`, `selectRunChange`, `closeCreatedTask`. Open-role-session forwards their exact Model signatures only to the trusted trio action owner. Plan completion publishes only the real execution.teamPlan ref through complete-snapshot document CAS (`source:team-plan`), without D3 or repin, and returns real plan/roster/module refs. Nominator activation prepares the real completed-plan operation + latest actual D3 + three draft byte hashes, composes G public pure validation in Pipeline, then publishes only activeRevision/activeDigest/activeRoles under both CAS dimensions. It creates no run or fake pin. Same-content activation is no-op; old active bytes/history remain independent from document snapshots.

Provider `readSnapshotArtifact` resolves a real artifact from a byte-verified immutable snapshot. Active CAS archives only the previously visible active revision; `readActiveRolesAt` proves a commit using current/history content, not the operation phase. Document CAS requires the expected active identity once it exists, merges from locked current state, and preserves active pointers. Historical document archives ignore independent active-only changes and never rewrite existing bytes.

`recordTaskObservation({projectRoot,event})` is a host-only Pipeline command through Service and a single Provider project-lock ledger writer. It rejects task.closed; worker creation requires its real complete run closure while built-in planning coordination may use a real draft. `prepareCreatedTaskClose` gives the actual creator a real latest-report snapshot reference. `closeCreatedTask` atomically checks task-row digest plus real run record hash, writes actual creator/source/operation/event ids, and returns the real closed result. A competing new report and old-report close cannot both commit. W must still migrate its real production task writers from old common I/O before the production CAS chain is claimed.

Retained intent-confirm in openRoleSession now prepares the actual product intent bytes before presenting the card, appends its snapshot/path/hash marker to the actual question and full text to preview, and freezes only those exact bytes after verifying the actual persisted confirmation. It does not add intent to VCA targets or retroactively freeze a later document. The exact real-tool test uses the existing desktop initialization, product write_file, chief request_choice/customer UI boundary, automatic R9 intent-confirmed, rapporteur proposal write_file and product submit_version_change to create t1. G's lawful public refresh/install is still required to replace old private cache calls and immediately synchronize the post-confirmation guard snapshot.

Evidence: main TS `59-O1-current-typecheck.txt` is exit 0. Exact 13 affected O test files `60-O1-stable-subchains-targeted.txt`: 153/153. Earlier true reds 19 CAS, 30 cancelled-card contract, 37 invalid test enum, 55/56/57 initial tool fixture/cache are retained. This proves these subchains, not a completed whole project: new-run full freeze production, nominator draft write_file gate, full stop/restart lifecycle, G legal refresh/active consumers, W notification/dependency/real-ledger integration and full Interface acceptance remain open. Original legacy import debt is not declared clean.

### O1 checkpoint-2 — safe phase release (2026-11-05)
- `prepareRoleDispatch({projectRoot,fromRoleId,targetRoleId,flowId,runId?,moduleId?})` is the formal Pipeline preflight. Chief→convener planning reads the real proposal/modules/roster chain and does not require future D3/workflow/activation. Convener→worker uses only the actual full pinned run, module writeset intersection and frozen documentContext. Dependency rows inspect the same run's latest dependency role/module task and require its creator's source-bound accepted close; reports alone do not release dependencies (multi-role dependency branch still awaits its dedicated integration case).
- `freezeExecutionRun({projectRoot,runId,flowId,operationId})` composes Service preparation, G public three-document checks and Provider run/document/active CAS. It creates one immutable complete run snapshot with each role's eight refs pointing into that same snapshot and the actual runId/pinDigest. Existing pins reopen their own bytes. Missing old evidence or real workflow refuses; no live refill or automatic re-pin.
- `prepareRoleDraftScope({flowId?,taskId?})` reads the actual completed-plan operation/current roster/modules/latest D3 and returns ordinary canonical three-file paths. Nominator gate refreshes before send and after real D3, rejects before selection, permits separate draft write_file/edit_file operations and keeps activation separate. Shell cannot use this draft grant. The prior stable approval/mini-repin post-write route is bypassed only for those proven draft paths. Actual shared runtime tools now cover D3→first file→missing-pair refusal→remaining files→activate.
- The retained intent-confirm hook now awaits G `refreshAndInstallVersionedDocFreezeSnapshot` after actual R9 confirmation. The real tool case proves a subsequent write_file cannot overwrite the confirmed v1.
- Initial late workflow uses only the existing stable Service chain on a complete planning trunk with no workflow and no pinned run. Real written record + consumed matching permit + approved exact bytes are captured together, then CAS adds workflow without changing document version/digest, active roles or runs. Original document snapshots remain in immutable history; `readManifestAt(ref,expectedSnapshot?)` verifies the original commit. Document CAS adds fifth `expectedSnapshot` to fence same-digest initial attachments. Subsequent document publication and original operation recovery are covered. The actual workflow write in this specific Service-layer case is a fixture write after real request/approval, not a claim of the complete SDK stable-write UI chain.
- Final verification: `71-O1-final-affected-tests.txt` exact 13 files 154/154; `72-O1-final-main-typecheck.txt` exit 0. Earlier raw failures remain. Source/API/doc hash manifest is `73-O1-phase-release-hashes.json`.
- Remaining work is explicit: full stop/restart shared-handle lifecycle (currently blocked), planning-draft creator-close basis (current close query requires pinned execution closure), four-Fn notification sink integration, W production worker/frozen-context/dependency consumer migration, dedicated multi-role dependency case and full Interface/adapter acceptance. This checkpoint does not claim complete four end-to-end loops or all repository layer debt resolved. No Git migration/commit/push.

### O2 public delta — planning close / direct notifications (2026-11-05)
- `createDirectRoleRuntime({projectRoot,actorRoleId,notifyDirect?:DirectNotificationSink})` exports the same four host-bound methods. `DirectNotificationSink` is `(input:{key:string;recipientRoleId:string;message:string;source:Extract<DirectActionSource,{kind:"role-direct"}>})=>Promise<void>`; VCA consumes that same type. Complete-plan Pipeline returns the existing `CompletedTeamPlanReceipt` with real plan/roster/modules refs, structurally compatible with Model CompleteTeamPlanFn.
- Key is `${operationId}:${targetDigest}:${source.action}:${recipientRoleId}`. Unique chief/convener/actor recipients acknowledge durable idempotent enqueue. Pipeline composes Service `directDeliveryRecorded/recordDirectDelivery`, which use the existing Provider delivery markers. Missing/throwing sink after real commit returns committed-pending-recovery with the actual journal/event/run-change record; replay does not reapply state. Continue-frozen recovery reference points to its persisted run manifest directRunChanges entry. No Interface callback enters Service.
- `prepareCreatedTaskClose` keeps its prior input and Model reportRef output. For a true existing `ans-run/v1` draft, only actual built-in planning assignments are eligible. Actual created/run flow must match; latest assigned report must explicitly reference bounded relative docs/*.md, or actual run.documents refs supply them. Actual frontmatter.flowId, bytes, optional run SHA, secret/path and byte budgets are checked. Report text itself grants no authority. Missing material/run refuses; no latest scan, D3/active/workflow/pin fabrication. The report snapshot includes exact created/report lines, run bytes and planning material bytes.
- Draft basisDigest binds true run raw SHA and material path/hash list. `CreatedTaskCloseBasis.materialRefs?` is ordinary trusted host/Service data; Model Close input is unchanged. Existing Provider `appendTaskLedgerEvent` adds optional `expectedFiles:readonly {path,sha256}[]`, re-reading safe actual bytes under its existing ledger/run lock before append. Same-task latest report, run and material CAS must all match. Worker close still requires its actual complete eight-ref frozen execution evidence. Only the actual creator command writes source-bound TaskClosedEvent; report alone never frees dependencies.
- O2 exact source delta: apply-journal.ts, abstract/public trunk-service.ts, trunk-runtime.ts, version-change-runtime.ts, guard-freeze-registry.ts; exact test direct-role-capabilities.test.ts. O1 evidence is superseded only for these affected seams. Final exact four-file verification `80-O2-final-affected-tests.txt`: 62/62; main TS `82-O2-final-typecheck.txt`: 0. Original O2 failures 74/75/76/81 remain. TEMP/TMP point to the existing isolated evidence/temp, Node checks use the previously authorized escalated environment.
- W integration of the optional sink and actual draft report evidence remains its own next consumer node. No new stop/restart, adapter, Git migration/commit or full Interface acceptance claim is made here.

## O3 Git foundation checkpoint (2026-11-05)
- Provider public `initializeGitRepository(root,format?)` uses fixed Git with an empty app template, only in a host-allocated authorized project/fixture. `createGitQueryPort(root,hostBudgets?)` returns `inspect()`, `plan(GitQueryRequest)->{identity,argv}` and `query(request,signal?)->GitProcessFacts`. No arbitrary argv/env/config API. Identity binds canonical root/gitdir/common-dir/object format and physical directory identity; supported form is an ordinary independent repository. Gitfile/shared common-dir/alternates/metadata links/submodules/symbolic app refs and unsupported local config refuse. This is deliberately not general linked-worktree support.
- Fixed executable is C:/Program Files/Git/cmd/git.exe on Windows (/usr/bin/git on Linux). Actual environment is rebuilt without inherited GIT_*; config whitelist precedes Git; fixed prefix disables optional locks/pagers/fsmonitor/hooks/filters/external diff/textconv/network/maintenance paths. Ten read templates have literal paths/full OIDs and bounded output/time. plan argv and actual argv are checked equal. Query itself does not write Git metadata, index, refs or process evidence, verified by complete before/after metadata hashes.
- `createGitCandidateStore(root)` exposes `prepare({operationId,base,files:[{path,bytesBase64|null,executable?}],message})`, `readCommit`, `listTree`, `readBlob`, `readRef`. Raw object plumbing preserves arbitrary bytes/unchanged complete-tree entries, refuses unsupported modes, uses an application-owned candidate ref and never consumes a user index/checkout. Candidate preparation is infrastructure, not activation or publication authority. Merge/revert/worktree/index-owned production workflows are not implemented at this checkpoint.
- `createGitRefStore(root)` exposes `publish({operationId,repoId,ref,oldOid,newOid,tree,parents,requestDigest},signal?)`, `readJournal`, `listJournals`. Fixed app ref + actual full commit/tree/parents + expected-old update-ref is the sole Git commit point. Journal is existing namespace operations/<operationHash>/git.json, media git-ref/v1. Actual ref and settled process prove commit; phase is only a hint. Same-id/different content refuses; unknown successors never roll back. A first CAS loser is conflict, postcommit metadata uncertainty pending-recovery.
- The existing fs Provider adds `listStorageOperations()` to discover fs and Git-ref media on restart; same-id publication is mutually excluded under the existing project lock, and each reader refuses the wrong media. Legacy-only listOperationRecords refuses when Git operations exist rather than silently skipping them. This is discovery/recovery infrastructure, not a production storage-mode switch. Existing fs snapshots/old journals remain their original proof.
- Mutating infrastructure persists processId/operationId/repoId/startedAt/actual argv and terminal facts in .git/ans/processes (initial init evidence is .ans/git-init-process.json). Unknown is recorded before spawn and survives restart; missing pid/old clock does not release it. Root close after kill/timeout/truncation remains unknown. Read queries stay available without releasing that fence. These are owned process facts, not a permission ledger or OS confinement claim.
- Service public `createGitCapabilityService({projectRoot})`: `prepareQuery(request,GitQueryContext)` and `executeQuery(prepared,{allowed,inputDigest,code?},signal?)`; candidate/publish currently return blocked/git-protection-closure-unproven. QueryContext is trusted host `{actorRoleId,taskId?,runId?,readPaths,authorizationRevision?}`, never schema/model input. A real supplied task/run/flow/active identity/current visible app OIDs and ledger schema are re-read and hashed; global read can omit task without manufacturing one. read scopes originate in trusted role resolution; preparation never claims a new grant. Historical Git pin OID resolution is pending the adapter.
- Pipeline `createGitRoleRuntime({projectRoot,context})` returns R7 gitQuery/gitCandidate/gitPublish. It composes public G checkGitPolicy/computeGitPolicyDigest with O Service, with no Service peer call. openRoleSession forwards the three optional trusted Fns; independent bounded chief retains its separate decide-only branch. Real normal git_query tool -> Pipeline -> G -> Service -> Git is covered with only inference replaced.
- Production mutations remain blocked: no actual whole-team registry/lifecycle/file protection and authorization-serialization closure is installed. Raw infrastructure fixture success is not six-role ACL or four-loop success. The five-parameter compareAndSwapManifest/two-parameter readManifestAt Git adapter, fs-to-Git migration/production selection, old Git run pin, merge/revert/integration and real delivery chains remain next nodes. No change to the development checkout's Git history or remote occurred.
- Evidence directory docs/change/2026-11-05_git-role-permissions-evidence/: 12 six exact files 57/57 and 13 main TS0 before final schema/truncation guard; final confirmation is 14/15. Raw 02 same-operation catch defect, 05 missing legacy fixture before field, 07 closure narrowing type error and 08/09 invalid report fixture enum are retained. All real Git writes occurred only in isolated TEMP fixtures using previously authorized normal-environment Node tests.

### O3 final evidence correction
`14-release-affected-tests.txt` is 57/57. `15-release-typecheck.txt` is exit 1 with one external in-flight R producer error only: service/runtime/session.ts:474 lacks newly required RuntimeSessionToolSurfaceFacts.factoryProvenance. Earlier 11/13 were genuinely TS0 before R8 Model changed. O Git sources have no diagnostic at this checkpoint. The Scheduler explicitly requested phase release with that limitation; 15 is not reported as green. The next R/Codex producer node owns it. Hash manifest 16 records the actual O files and current dependency hashes.

## O4 production reader / source checkpoint (2026-11-05)

- Provider public `createProjectTrunkStore(projectRoot):TrunkStore` is the production selector used by trunk Service, version-change integration/quality and the G reader dependency. A verified Git ref/operation record selects Git; its manifest, complete snapshots, independent active snapshots and history come from the actual commit tree. Git mode without an effective ref is corrupt, never legacy-missing/live fallback. Raw FS manifest is not Git authority. `createGitTrunkStore(root,{readOnly?,migrationOperationId?})` is the infrastructure adapter; production selection currently always uses readOnly. No production mutation permit is implied by selecting storage.
- Adapter retains `compareAndSwapManifest(expectedDoc,next,snapshot,expectedActive,expectedSnapshot)` and `readManifestAt(commitRef,expectedSnapshot?)`. Complete commit tree and expected-old app ref CAS bind both document and active identities; same-version workflow changes are fenced by snapshot identity. `compareAndSwapRunRecord` verifies the actual Git basis under the existing project lock. Old immutable FS run/snapshot bytes remain readable as their original proof, without live refill.
- `GitOperationRecord` is either prepared business metadata or an actual `GitRefJournal` in operations/<original-operation-hash>/git.json, explicit media git-ref/v1 and optional original businessJournal. One original id cannot bind both media. `readOperationCommit(journal)` proves the operation in its original physical media: later identical Git bytes do not turn an uncommitted old FS operation into a commit. Actual settled process/ref/tree/parents determine Git commit, not phase. `migrateLegacyTrunkToGit(root,{operationId,expected})` is an authorized infrastructure primitive; it rechecks the original complete FS basis under the publication lock and fences further FS publication. Production migration/init effects remain blocked.
- Provider public `readGitProtectionFacts(root)` returns actual canonical metadata/other-worktree roots, identity, basisDigest and complete/unknown discovery coverage. This is root discovery, not filesystem confinement. `openRoleSession` passes derived protectedGitRoots to G and the actual Core file guard. It exposes optional actual sessionId/inspectLifecycle/inspectToolSurface/stopAndInspect proxies with copied ordinary facts, never raw native capability. A private registry recognizes only actual Core handles and official Pipeline-created adapter factories; arbitrary factory wrappers cannot assert default provenance.
- Pipeline `recordGitHostInventory`, `beginGitHostAction`, `endGitHostAction`, `inspectGitHostCoordinator` accept ordinary inventory and serialize host changes by root. Action kinds are session-open/session-dispose/arm/dispatch/authorization-change/git-mutation. Busy or wrong revision/token rejects; there is no clock expiry. Inventory coverage remains unknown and these calls do not mint a mutation permit. W6 consumes the source-selection/child-append subset; all lifecycle/authorization actors are not yet closed under this coordinator.
- `prepareRoleDispatch` accepts host-only RepositoryInitializationContext containing actual native directory selection/matching listing plus the current accepted chief Core customer turn. Pipeline privately checks the actual current default Core handle before and after Service awaits. Provider real root/ancestor/link/content facts must match. A truly new root may dispatch infrastructure convener before future proposal/modules/roster/D3; FS emptiness alone grants nothing. The immutable repository-work-source/v1 record is stored through `writeInitializationSource(sourceId,bytesBase64)` / `readInitializationSource(sourceId)` and binds root/flow/selection/turn. Only R's explicit TaskCreatedEvent.workSourceRef four-field shape carries its real path/SHA; requestedEvidence is never authority. Service rechecks source bytes in the real child append CAS. After child creation, parent natural completion and UI focus changes do not revoke the child source.
- `inspectAssignedTask({projectRoot,taskId,actorRoleId})` returns actual open assigned child/run/basis/kind and optional verified workSourceRef. It is a fresh read, not an atomic enqueue authorization. `prepareAssignedTaskWriteScope` and openRoleSession taskId derive and recheck real module/plan/frozen/current-active directory intersections; directory paths are not put into the old exact-file TaskScope.writeSet.
- Production `git_candidate` action init with base refs/ans/trunk:null now verifies actual convener child, typed source SHA/flow/root and real draft run. It then returns blocked/git-protection-closure-unproven: whole-team effect inventory/current authorization/lifecycle coordination is not fully installed, and no production init effect branch is enabled. Old direct/plan/active/stable Git writes likewise cannot bypass the read-only selector. First init, merge/revert, delivery, complete Git OID run evidence and four full workflows remain unverified/unimplemented as applicable.
- Current O evidence: 29 six exact test files 62/62; 30 main TypeScript exit 0. 21 adapter 1/1, 27 migration/media 14/14 and 28 actual worker scope 2/2 are earlier bounded subchecks; 24 invalid bootstrap fixture first red is retained. G5 active/oldpin 16/16, W6 source race 23/23 and Q3 actual default HTTP route/child-source success followed by init blocked are separate owner evidence, not added to O's test count. Current hashes are in 31-O4-checkpoint-hashes.json.

## O5 init/admission handoff (2026-11-05)

- The single host coordinator now lives in existing Provider git-command; Pipeline keeps its same public names. Provider public exports beginGitHostAction/endGitHostAction/recordGitHostInventory/recordGitHostInterruption/inspectGitHostCoordinator/checkGitHostAction and their ordinary DTOs. Successful begin/end advance the generation; interrupt invalidates the exact held lease without releasing it. Core R12 owns the single session-open lease at actual bind. W must remove its outer native-open lease, retaining creation inventory/source/dispatch/dispose coordination. No kind-based re-entry or callback to Pipeline is accepted.
- `readGitHostProtectionRequirement({projectRoot})` asynchronously returns required/unmanaged/unknown, independent protection revision and reasons, derived from canonical root/control paths and actual immutable source/init/media/app-ref evidence. A previously observed required scope cannot be cleared by deleting evidence. Unknown association is never called unmanaged. This is a constraint derived from storage, not a model or host configurable safe flag. R12 consumes it before factories/binds.
- openRoleSession and one-shot runRole prefer actual Core prepareRole/bindPreparedRole opaque tokens; genuinely unmanaged legacy can remain unknown. Private Pipeline construction history includes unidentified/custom factories; the mutation path also freshly reads the authoritative Service inspectRuntimeCoreRegistry across all roots and judge instances. Other-root unknown writers are retained. Disposed requires actual quiescence, never an empty manager table. Caller inventory alone cannot mint permission.
- `GitCapabilityService.prepareInitialization(initRequest)` returns a same-instance immutable preparation bound to actual child/source/parent Core id/flow/run/root/file hashes. `executeInitialization(prepared,hostLeaseId,signal?)` checks that object and the actual held mutation token. It holds one real R9 lock through final source/run/ledger/root validation, physical init, candidate and journal writes. Provider init/journal can consume that already-held fencing token; each plumbing mutation also checks the host token. Unknown prior init process cannot be overwritten even when .git remains absent.
- Initialization uses explicit git-initialization/v1 init.json under the original operation-hash namespace; readGitInitializationRecord/writeGitInitializationRecord and listStorageOperations preserve original request/source/process/repository/candidate evidence and exclude fs/ref same-id reuse. A real incomplete effect returns pending-recovery against the actual journal, not a fabricated id or rollback. Successful storage-layer replay returns the original actual candidate without reinit or document publication.
- Provider `planGitRepositoryInitialization` is an exact read-only init argv/root/template plan. `planEmptyGitCandidate({operationId,message,timestamp:actualTask.at,objectFormat})` calculates complete empty-tree/commit bytes and OIDs without claiming objects already exist. Actual Git uses the same fixed UTC timestamp and readback must match. SHA1/SHA256 comparisons passed. Both plans explicitly use worksite raw-object-plumbing/index:not-used/checkout:not-used; no invented index/worktree id.
- Pipeline now composes two actual G policy calls (init and first empty candidate), with explicit initializationBasis `{kind:'uninitialized-root',projectRoot,qualificationDigest,operationId,requestDigest,sourceId,sourceSha256}`. The pre-init repoId sentinel is uninitialized and is not a claimed existing repository id. G still requires the original owner's narrow no-repo/no-index branch; existing repo identity checks must remain strict. The current code correctly refuses those policy gaps, rather than fabricate identity or permission.
- Supported closure checks use actual native factory-plan binding, current registry/handler facts, R9 canonical-root/nlink guards and all known actors, not a filesystemConfinement safe flag. The first-init tool surface is a finite known Core/serialized-operation list; download/install/MCP or any future unproved callback remains unknown when actually registered. No registered tool is removed to manufacture success. Current-process observation does not claim control of external user programs or unproved old app programs.
- Evidence: 44 six O files 69/69; latest 46 main TS0, with a focused final guard confirmation in 47. Earlier first reds 32/33/35 remain. 40 validates real object plans; 42 validates source-derived scope requirements. These prove O storage/Service/negative admission subchains, not public production init success. N3 producer, W unique-bind/admission consumer and G narrow init identity/worksite consumer remain necessary before Q's fresh-root public chain. Post-init document null-CAS/old-capability mutation admission, delivery/merge/revert and complete workflow acceptance remain later scoped work. Hash manifest: 48-O5-checkpoint-hashes.json.

## O6 first document publication / initialization creator-close checkpoint

- `createTrunkService` now provides `prepareDirectCommit(input)`, `prepareDirectAuthority(prepared,taskId)` and `commitPreparedDirect(prepared,{hostLeaseId,taskId,candidateVerdict,publicationVerdict})`. The preparation is an unchanged, per-Service-instance nonce. Actual assigned task/run/target bytes and authorization digest are reread; neither Model input nor copied preparations provide authority.
- Provider `planDocumentCommit` returns the actual complete raw-object plan (`baseTree`, candidate/tree/parents, exact commands), original base manifest bytes, all generated file bytes/classifications and the final publication command. `createGitDocumentMutationStore` binds one journal/manifest/snapshot/base/active fence and actual host lease. Final Git objects/ref and authoritative file hashes are checked under R9. The ordinary production selector remains read-only; active/stable/other business operations do not inherit this capability.
- Pipeline `executeGitDocumentPublication({projectRoot,applyInput})` composes actual all-Core/host protection, live submitting actor/task, current Service authority and public G candidate/publication verdicts. Formal `submitDirect` selects this restricted path for actual Git storage. The null-base branch requires actual completed initialization journal/candidate and absence of an effective ref, rather than live fallback or fabricated initial refs.
- Initialization reports can produce the existing creator-close basis from actual same-task/source/init-process/journal/commit/ref proof without future planning Markdown. Closing still checks original creator, latest assigned report, actual run/source and accepted state. Provider rechecks Git proof and appends the existing task ledger in the same R9 transaction (`appendTaskLedgerEvent.heldLockToken` accepts only the actual owned token).
- `bindPreparedRuntimeRole` pre-rejects actual planned `run_shell`/`start_background_task` in required Git scope. The original Core owner must apply the same pre-effect check to every direct Core/judge entry: actual native appTools + current scopeProtection revision, zero construction on refusal. This Pipeline guard is not an OS confinement claim or completed script workflow.
- Evidence: 49 init-close layer 7/7; 50 storage publication layer 7/7; 51/53 original G manifest-binding reds retained; 52 complete ordinary facts; 54 actual G + Service publication 7/7; 55 final six affected files 69/69. 56 latest main TypeScript has two external Q test diagnostics (git-role-workflows-e2e.test.ts:154/161 DirectActionSource.targetDigest narrowing), O sources have none. These runs are overlapping, not additive.
- Separate production observations: Q6 actual initialization report/creator-close applied. Q7 actual public product submit_version_change applied: ref 911f7bd09b7d75a33c462545824513e3e5d40622, manifest t1 with six documents and no workflow/fabricated D3/activation. Q evidence remains its owner's evidence. Raw candidate/publish/integrate/revert, remaining plan/activation/stable scoped Git writers, historical-root adoption and full four-workflow acceptance remain follow-up work. Hash manifest 57 records this checkpoint.

## O7 complete-team-plan Git publication (same approved contract)

- Service adds host-only `PreparedTeamPlanCommit` with preparationKind team-plan-commit and actual CompleteTeamPlanInput/convener identity, original document/active/snapshot basis, complete bytes, journal and raw Git plan. `prepareTeamPlanCommit(input,actor)` reuses the authoritative structured-plan/roster/modules/writeSet/protected-path/dependency parser. It does not require future D3, role activation, workflow or execution readiness. No VCA/product type is fabricated.
- `prepareDirectAuthority(prepared,taskId)` now accepts either the existing direct document preparation or this separate plan preparation. It derives the actual unique open assigned convener task and real same-flow run, exact plan bytes, ledger/run hashes and current authorization digest. `commitPreparedTeamPlan` accepts only this Service instance's unchanged preparation plus two current content-bound policy verdicts and the genuine git-mutation lease; it reuses the exact existing bounded Provider transaction/R9/CAS. Copied preparation, wrong task and a report arriving after policy preparation reject before commit.
- Pipeline public `executeGitTeamPlanPublication({projectRoot,request,actorRoleId})` and formal createDirectRoleRuntime.completeTeamPlan select this path only for actual Git storage. Both document and plan paths share the fresh all-root Core/host protection and actual active tool/assigned-task proof. The exact complete_team_plan invocation is required; another role/idle session cannot substitute. The ordinary storage selector remains read-only.
- Provider DTO/schema unchanged. Business publication is honestly direct-document-publication/action complete-team-plan/actor convener. The full snapshot includes the exact canonical team-plan-completion/v1 marker at .ans/trunk/plan-completions/<directHash(operationId)>.json. It binds actual plan/modules/roster and source operation. G9 consumes the same full-tree/base/journal/byte/command facts and permits only this narrow plan change; unchanged document refs/workflow/active/frozen/D3/roles remain bound. Real change increments trunkVersion; same-plan no-op leaves the actual manifest/ref unchanged.
- Evidence: 58 first type red (overbroad local failure generic), 59 invalid fixture sideEffect, 61 incomplete path declaration, 62 genuine G business-source refusal all retained. 63/65 types0; 64 existing direct31/31; 66 Git Service8/8 (including the new case after G landed), 68 focused plan1/1, 69 final types0. Results overlap, not additive. The real Git test verifies planning-only publication without future role files/workflow, wrong actor/task/copied nonce, newer-report stale verdict, refresh, true t2, same-operation replay and same-plan no-op. Public Q plan chain is still its owner's next check, not inferred from layer tests. Hash manifest70.
- Follow-up sequence remains scoped: activateRoleDocuments needs active-only bounded/G publication preserving doc version; stable-snapshot/refreeze needs same-version snapshot fence plus original stable permit/source; run pin uses existing Git-basis run CAS but must be checked with the full true execution closure; continue-frozen uses run CAS, while stop/restart still explicitly requires real lifecycle facts. No other Git writer is unlocked by this change.

## O8 independent active-only Git publication / trusted role-capability callbacks

- Provider public `planActiveCommit({manifest,journal,expectedBase,expectedActive,targetRoleId})` returns `GitActiveCommitPlan`. Its publication kind is honestly role-activation-publication/action activate-role-documents/actor nominator. It binds the independent activation snapshot, unchanged documentSnapshot, target role/evidence, expectedActive and complete targetActive. The full raw object/base tree/original manifest bytes/exact commands and file hashes remain the same precise storage proof. Top-level document source/actionSource/version/digest/snapshot/refs/updatedAt are unchanged; activation source belongs to its own original-operation journal.
- `createGitActiveMutationStore` binds one unchanged prepared manifest/journal/full Git plan to the genuine host mutation lease. Its only pointer write is independent `compareAndSwapActiveRoles`: under the original R9 lock it rereads actual ref/repo identity/config, ledger/run/draft hashes, document basis and expected active revision, and verifies the exact actual prepared commit before the sole app-ref CAS. It cannot perform document CAS. Active-only materialization includes original document bytes, all doc/active/frozen snapshot JSONs and the six actual current-role card/md/yaml/D3/activation/authorization files; old plan/roster bytes remain immutable inside their own snapshots. It adds no history-vN projection and does not rewrite old run snapshots.
- Service `prepareActivationCommit(activation,checks,boundaryEntries,actor)` independently rederives the actual latest D3/committed plan/roster and three draft bytes; it stores a per-instance unchanged preparation. `prepareDirectAuthority` accepts this separate type, derives the real current assigned nominator task/run and frozen evidence hashes, and revalidates current activation facts even when a pending journal exists. `commitPreparedActivation` requires both current content-bound G verdicts and the real lease; it reuses original three-document/scope validation and actual active-only store. Missing a document, bad quality, copied preparation, changed D3/task/draft/basis or concurrent active revision cannot enable the role. Completed replay and a true no-op read actual active evidence and never advance document or active pointers again.
- Pipeline public `executeGitActiveRolePublication` is wired from the existing formal activate_role_documents Fn. It requires the actual active Core tool invocation, the host's real assigned task, fresh all-root Core/host inventory and current metadata roots, G10 full active-only policy and the same coordinator lease. The eight ActiveRoleEvidence refs are rosterRef/planRef/d3Ref/activationRef/cardRef/boundaryMdRef/boundaryYamlRef/authorizationRef. They contain actual plan/D3/three-doc/authorization bytes, no fabricated future workflow/runId/pinDigest. The ordinary production selector remains read-only elsewhere.
- Fresh Pipeline ordinary port `readRoleCapabilityProtectionScope({projectRoot})->{state:required|unmanaged|unknown,revision}` delegates to actual Provider scope, not repo-name/env/model input. Before Core option assembly, required/unknown replaces only previously injected installSkill/uninstallSkill/installMcp/uninstallMcp callbacks with R15's actual zero-argument no-effect factory functions. Tool registration is retained; genuinely unmanaged keeps original callbacks. The all-actor closure accepts those four effects only from actual Core registry roleCapabilityGuards bound to current session/role/runtime/Core plan/native plan/config/current registry digest, exact actual guarded tool coverage and empty unguarded/reasons. No four-name whitelist or Interface receipt grants safety. W10 consumes the scope as ordinary facts only.
- Evidence: 71/75 original interface/type and 72 missing-selector-planner failures retained; 73/79 complete actual policy facts; 74 genuine pre-G10 source refusal retained; 76 original direct31/31; 77/87 TS0; 78 printed the active assertion pass but its owned Node runner failed to exit and was precisely stopped (83), so it is not a green completion. Debugger activation was rejected by auto-review and not executed. Source-only bounded resource diagnostic 85 naturally exited 1/1; its temporary instrumentation was then removed. 80/81 fixture mistakes and 82 deep-TEMP Filename-too-long remain; short isolated TEMP84 actual Pipeline defaultCore/defaultChat localHTTP1/1 proves four registered blocked callbacks with zero old effects and unmanaged originals preserved. Final normal six-file88 naturally exited71/71; final89 mainTS0. Counts overlap, not additive. No claim is made that the earlier non-exit root cause was established.
- Ready for Q's real existing plan/D3/three-draft activation replay. This layer's Git/storage fixture and localHTTP callback proof do not replace Q's production source/task chain or independent acceptance. Stable same-version workflow publication, remaining raw Git writers and full run/stop/restart/four-workflow completion remain later scoped nodes. No new production/test file, dependency, permission, development Git commit or remote action. Hash manifest90.

## O9 activation-report creator-close checkpoint; initial workflow remains staged

- Existing `CreatedTaskCloseBasis` now optionally carries `activationCommit:GitActiveCompletionBasis` with kind current-active-completion. It is explicitly current verified成果, not a claim that this task created an older activation operation. A real open chief-created draft nominator task needs its latest real assigned report naming each complete canonical card/md/yaml set. Service binds those paths to current ActiveRoleEvidence, the still-applicable committed plan/roster and actual current D3 scope; arbitrary Markdown or a textual operation claim grants nothing. No future workflow/run pin is required.
- Provider public `readGitActiveCompletionBasis(root,{flowId,roles:[{roleId,operationId}]})` reads the actual effective Git ref/manifest/current active basis, immutable eight-ref snapshot bytes and original activation journal. It checks real settled process/tree/parents and ancestry from the actual app ref, and live reported three-document hashes. Service derives each original operation from the actual activationRef bytes, not report text or a guessed latest operation.
- The ordinary reportRef snapshot contains the true report/created/run bytes plus complete active evidence and journal proof. Only actual live three-document refs are passed as file-CAS targets; Git authority is rechecked from Git, never from its raw FS projection. `appendGitActiveCompletionTaskEvent` holds the original R9 lock across actual ref/active/evidence/journal/object readback and the existing ledger append with its real held token, expected latest task digest and run SHA. Wrong creator, stale report/ref/basis, drifted documents, changed current active or non-done accepted report rejects. Only the real accepted closed event releases task dependencies; a report alone does not.
- Evidence92 exact Git layer naturally1/1, including actual activation→three-path report→chief real basis/accepted close/replay, wrong creator, newer report and live-card drift negatives. Evidence94 three affected original files naturally47/47;95 final mainTS0. Counts overlap. 91 original source-read DTO missing-path diagnostic is retained and fixed by returning the actual bounded relative path without a cast.
- Public App's existing prepareCreatedTaskClose/closeCreatedTask calls automatically consume this typed branch; no W/Model/schema field or second task ledger was introduced. Q9's true activation success and subsequent missing close-basis failure remain its independent unchanged evidence; the new public close chain still requires Q replay.
- Initial workflow is not enabled at this checkpoint. Only same-file Provider ordinary foundation is staged: GitInitialWorkflowSource, GitInitialWorkflowCommitPlan, planInitialWorkflowCommit and immutable per-operation stable-source.json helpers plus an exact workflow mutation-store constructor. It is not an authority receipt, no existing production selector became writable, and no runtime caller uses it yet. Remaining original O9 work is Service validation/source binding of the real approved request tool/task before it returns, actual written/consumed record/permit revalidation, current all-actor/host/R9 coordination, G's exact stable-initial-workflow-publication policy, and the stable-write-runtime post-completion composition. No stable workflow/run/stop/raw Git writer is claimed complete. Hash96.

## O10 initial workflow production checkpoint

- Real `request_stable_write` keeps its public requested receipt; that status grants nothing. Before the actual protected Core tool returns, Pipeline validates its private managed Core/tool identity and the current exact Core-ID→Desktop delivery task binding (non-Desktop uses its explicit trusted host task only). `bindInitialWorkflowSource` rereads the real assigned chief→convener task/draft run, still-approved matching record/permit and planning document basis, then freezes stable-initial-workflow-source/v1 bytes at operations/<SHA256(operationId)>/stable-source.json under the real arm lease/R9. Target SHA comes from the actual approved content; no future file/hash/task or customer decision is invented.
- Source-only operation directories are now precisely identified by file/schema/hash/nlink and do not pretend to have a Git commit journal. A bad existing git.json is never skipped. A later journal/ref publication must bind that same immutable source bytes/request, preventing same-id reuse across requests/media.
- Service `prepareInitialWorkflowCommit`, shared current-task authority and `commitPreparedInitialWorkflow` use a per-instance unchanged nonce, actual written record+consumed permit+workflow bytes, immutable source and full current snapshot. The stable-initial-workflow-publication policy DTO carries the real source/record/permit; journal.message is canonical stable-initial-workflow/v1 and actionSource is deliberately absent, not a forged role action. Operation time is the actual record.writtenAt, so a later host retry time cannot change the candidate/journal. Current task/run/ledger/source/table/workflow hashes and complete actual ref/repo/active/snapshot basis are rechecked under R9; non-draft, pinned or unknown execution records refuse.
- Pipeline `executeGitInitialWorkflowPublication` composes the genuine source Core (a naturally settled/disposed actor needs real retained quiescence), all-root actor/guard facts, current host lease, public G11 full-tree verdicts and the bound Service commit. `stable-write-runtime.completeWrite` now uses the original injected trunkRuntime.completeStableWrite post-consumption fallback when the initial workflow is still pending. The event is emitted once through the branch that actually applied it. Selector permissions remain unchanged for every other writer.
- Sole pointer update is a same-flow expected-old Git ref CAS with a complete new snapshot/workflow ref. Document version/digest/source/actionSource/other refs, active state and old-run bytes remain unchanged. Only a missing derived history/manifest-vN is added from the actual old manifest blob bytes; an existing archive is never rewritten. After-pointer metadata failure is explicitly applied/pendingReattach with committed-pending-recovery; no second ref/version is manufactured. Ordinary recovery rechecks actual attached bytes and does not re-pin a run.
- R16 first-write real SHA and private path-bound edit-read protocol are consumed without weakening hashless/opaque refusal. A verified actual edit-read probe gets only the original base path/task authorization; final edited bytes still need the strict stable permit/hash and final link/canonical-root guard. Host context/hash/phase stay outside tool schema.
- Evidence: 98 original source-only enumeration failure;102–105 bounded original-fixture diagnostics and typed-reference correction;107–110 fixture run/schema/receipt mismatches retained. Actual111 source-only defaultCore/Chat1/1;112 actual approved source-before-file→strict-gate write_file→written/consumed1/1;113 full Git same-version layer1/1;115 seven affected files naturally77/77;117 final writtenAt retry/candidate+journal identity and full Git layer naturally1/1;118 final mainTS0. Runs overlap. G11 actual pure policy evidence remains its owner's evidence. Q's real full native-selection/dispatch/approval/workflow-ref chain is still independent and not inferred from storage/localHTTP fixtures.
- Initial workflow public path is ready for Q. Typed freeform-workflow report completion, new execution pin/worker/stop-restart/raw Git workflows remain later nodes; no full four-workflow acceptance is claimed. Hash manifest119 records the current29 owned files and relevant dependency hashes. No new source/test file, dependency, permission, development Git commit or remote action.

## O11 actual App workflow pending diagnosis
Q11's genuine same-operation stable-source exists with exact decision-only authority, task/run/Core/flow and target bytes. Its document basis and sole unpinned draft are readable; an initial-workflow staging snapshot also exists. W traced the unchanged actual App factories and proved the fallback calls the injected trunk port. No missing injection/FS-selector shortcut was found. The prior generic notification did not record the internal result, so the original refusal code cannot be reconstructed as an observed fact.

`TrunkStableRepinResult` now retains optional errorCode/message. Each initial-workflow preparation refusal supplies a concrete code. `StableWriteRuntime.completeWrite.value.publicationError?:{code,message?}` preserves an actual pending result after real written/consumed completion, catches thrown publication errors as initial-workflow-publication-exception, and sends the same reason in the existing written notification. Successful file writing remains separate from successful Git publication; it never emits a false trunk.state or relaxes global actor checks. App need not change its caller for the existing notification to carry the diagnostic.

124 is a bounded read-only projection of Q11's actual source and before/after global Core evidence: a retained old chief is disposed with unknown lifecycle/core-turn-not-drained; additional failed/prepared actors lack terminal proof. Those entries remain authoritative unresolved facts for original R owner, including other roles/roots; O neither removes them nor calls a receipt quiescent. The unrecorded original internal return is still unknown. 125 affected three files17/17 natural exit (includes122 six/6),123 mainTS0;120 initial test-ID mismatch and121 temporary type diagnostics are retained. Workflow publication is not claimed fixed or publicly successful. Next Q trace can obtain the real refusal directly; lifecycle producer correction is a separate original-owner dependency.

## O12 same-attempt failed-open evidence
Pipeline `inspectRoleSessionOpenFailure({error,hostHandleId}):Promise<GitHostOpenFailureRef|undefined>` claims only an actual official open catch's error-object identity. `GitHostOpenFailureRef={source:'pipeline-role-open-failure',failureId}` is ordinary inventory data. A private record binds root/role/runtime, R's genuine error-bound construction reference and the first hostHandleId; new errors, another host, reused ambiguous errors and invented ids cannot obtain equivalent evidence. Actual prepared bind failure or O's own plan rejection discards that exact preparation through R's private identity port before rethrowing; this revokes unused tokens without asserting an effect never happened.

`recheckRoleSessionOpenFailure` and the production inventory checker reread current private R construction/registry facts. Sealed official zero-factory/zero-native-bind/pending0/all-tokens-revoked preparation can account for its failed/prepared row. An instance-bound failed/disposed actor additionally needs matching sessionId and genuine quiescent/finished/complete/no-active-tool/verified-exited-process facts. Copies across host handles, duplicate rows or one entry covering another controller reject. Global all-root Core checks retain every unknown actor; no state name, timestamp or ordinary host flag establishes safety. No current active idle instance is treated as terminated.

W's sole required follow-up is its existing openObservedRoleSession catch: await inspectRoleSessionOpenFailure({error,hostHandleId}), and retain any returned value as fact.openFailureRef. Keep open-failed/errors/history intact. Until that production binding is installed, Q12's failed rows remain blocked. Final133 two affected files14/14 natural exit,134 mainTS0;128/129/132 exact genuine preparation/admission-busy/binding and custom-effect negatives overlap. No Q fixture was changed. R17 frozen producer is a dependency, not O evidence or a claim of public workflow success.

## O13 typed approved-workflow creator close
Original Provider public `readGitStableCompletionBasis(root,{flowId,taskId,runId,operationId})` returns a stable-workflow-completion basis, actual original Git snapshot/business journal, frozen proof files and distinct live file CAS refs. It reads the settled same-operation journal/request digest, real commit tree/parents, reachability from the effective app ref, immutable source bytes and the exact approved workflow in its original published snapshot. Current workflow/source/journal/stable table hashes remain bound. `appendGitStableCompletionTaskEvent` holds original R9 across fresh proof/ref/object/source/bytes readback and the original expected-task/run/file ledger append. Immutable Git snapshot JSON is verified from Git, never mistaken for its differently serialized staging projection.

Existing `CreatedTaskCloseBasis.stableCommit?` is O-local, not a new Model/schema field. The Service typed branch requires an actual open creator→convener draft task and latest assigned workflow report, one original same-task/run/flow stable source, real written record/consumed permit/authority matching both journal and published snapshot, and bounded nonsecret workflow bytes. It does not require frontmatter or future execution pin, does not attribute another task's historical workflow to this task, and does not construct late Core/task approval facts. Existing reportRef binds true report/created/run and proof bytes; real creator close still checks latest report/status and appends the ordinary role-direct accepted event. Replays do not publish or re-pin anything. Existing initialization/active/execution branches retain their behavior.

Touched existing Provider abstract/public/git-trunk-store, Service abstract/apply-journal/stable-snapshot (component-private validator export only), original git-capabilities test and own documents. No W/G/R/new-source/Model/permission change. 137 first actual layer failed task-file-cas-conflict because a Git blob snapshot was incorrectly included among live CAS files; fixed by explicit proof/live separation, retaining actual Git readback and all assertions. 139 full existing storage-layer workflow+typed close/negative chain naturally1/1,141 original pinned-run/creator-close1/1;142 final mainTS0. Original type/fixture reds retained. Q13's genuine App published-workflow proof is independent; this new App report→basis→creator-close still needs Q replay. Hash143 binds current source and R17 dependency bytes.

## O15 real assigned-parent source and R9 child creation
Public Pipeline `prepareParentTaskRef({projectRoot,actorRoleId:'convener',taskId,flowId,runId})` calls the existing Trunk Service and returns `{ok:true,parentTaskRef}` or `{ok:false,code,message}`. It reads the actual open assignment/run/flow and exact parent ledger rows, using R18's single strict `TaskParentRef` guard. It neither accepts a model-produced receipt nor borrows sourceTaskId/workSourceRef semantics. New convener project children persist the genuine parentTaskRef in the original TaskCreatedEvent; the pure common parser only validates Model shape.

The original Provider appendTaskLedgerEvent now takes ordinary expectedParentTask `{taskId,digest,flowId,runId,to:'convener'}`. Under the same R9 lock as child append it rereads actual rows, requires one parent creation with matching assignment/flow/run and no close, compares exact ledger digest, and binds the child persisted reference/from/flow/run. A parent report/close racing after Service validation leaves no child row. Parent references do not require a naturally settled prompt to remain active after a child was legitimately created. Existing byte-exact child replay returns success with replay:true as registration evidence only; it cannot reopen a closed/cancelled task. W must retain actual child/run/current-authorization checks before admission or delivery.

Owner-approved independent scanner gap is limited to strict?:true: only ENOENT can be skipped; real ENOTDIR/EACCES/EIO propagate, while unmodified best-effort callers retain compatibility. G13's new Service uses strict:true; O did not migrate its old callers or claim the IO debt resolved.

Evidence: 153 records O151's four stages/1pass output but missing final wrapper exit code, without backfilling zero;146/149 native CleanupQueue assertion failures and152 old running observation remain. New evidence wrapper158 records actual child PID/start/exit/close/signal/budget and before/after hashes. Final164 parent/locked-race/close/strictscan five tests naturally EXIT0/CLOSE0;163 original task-state18/18 EXIT0/CLOSE0;165 mainTS0. Runs156/159/164 overlap. 161 actual existing Git chain including real assigned parent, complete same-run first pin/eight refs/module preflight/worker registration naturally1/1 EXIT0/CLOSE0 in77.27s. A subsequent helper-only Model-shape rejection guard is covered by164; valid positive references already pass the identical guard at child parsing, so161 is reused for that unchanged valid path. Public W parent consumer and Q first worker remain independent, not inferred from these storage tests. No new production/test path, Model, permissions, ledger, real model call or development Git action. Current source/dependencies and exact limits are in166.

O15 authorization clarification: preparing a parent reference authorizes no target and does not classify a request as planning. The existing formal preflight's no-freeze branch is chief→convener planning/initialization; convener execution dispatch still requires its actual complete run, target frozen evidence, plan/module/dependency validation. No built-in name, verifier label, sideEffect or model text may bypass that closure. The planning ledger fixture tests source/CAS only, not public star-route permission.

## O16 read-only Q16 handback and existing-child boundary
1. The accompanying frozen-roster message is prepareCreatedTaskClose's pinned-run branch (apply-journal.ts:1537–1540), invoked by the App's handback attachment (session.ts:7929) for chief closing convener parent t-mw47o4ua-7ab99165. Actual run run-20261106-q2-new-115eef17 has roles/frozenRoles only impl; this condition concerns created.to=convener, not impl child admission. The actual parent report at00:03:21.669Z is blocked/no submitted report/no output. withHandback/buildTaskHandback creates the terminal fallback; report rendering maps unreported to blocked. QA's first failure is its missing chief:24 script step, not this accompanying note.
2. Q16's00:03:21.919Z task observation retains child t-mw47o6wh-fab70353 with its true parentTaskRef, reports[] and no closed field/event. At00:03:24.057Z the producer still reports that same impl/Core893d8e58-3b97-4f81-b585-1a1e9dc82e23 live, stopRequested=false, native prompt not-started. This proves no automatic child revocation by that observed point after the parent fallback. Queue-release timing and why no prompt was delivered remain unproven; HTTP0 is not a cause or a permission finding.
3. Existing-child inspectAssignedTask checks unique actual child/to/open/run; worker scope then checks the frozen run/plan/module/dependency and current active authorization intersection. It does not recompute historical parent digest on each open. Parent digest/CAS belongs to new-child registration; replay:true only acknowledges existing registration, and current closed/cancelled child/run or withdrawn active scope still refuses admission. No evidence here shows O rechecking a changed parent digest to stop this child. No source/test changes, test/app/model/Git execution or Q-root mutation were performed; only this API note and memo changed. Public Q17 evidence remains independent.
Read-only anchors: q16-pin-and-chief-fixture-gap SHA7748C05846571C7EB414D8EED899BD98D3211AC3383F7E8C2CE24CFB90696BD4; worker-open-producer-facts SHA3470411EA63DD1386E9525DD11E70110B599DE7FFDE0888D84D0DA48A4881AB0. Actual source read apply-journal SHA A66AAA31D2B4E93EEE211F429927FA27D54BAB5E01EBEB6E8D12183C3F0FC5E6; no code fix is proposed during the Q17 freeze.

## O17 production file-gate consumer (partial IO migration)
`openRoleSession` and the one-shot `runRole` now explicitly enable `host-facts-v1` for required/unknown protection scopes and forward actual projectRoot/skillRoot plus the entire issued Git protection observation. Every synchronous stage first calls R's private `inspectRuntimeFileGateContext`; only then does O check its original Provider-issued protection observation and call G15's pure read-preflight/final predicate. Clones, opaque calls, wrong stages/targets, missing/unknown protection, and changed config/topology fail closed. The same cloned boundary and actual task/preauthorized-write intersection apply at all stages, including existing trio forbidden paths and real D3 HR draft scope. Read stages never authorize a stable write. Final stable decisions use R current-file/final-content facts, and missing permit lookup in a managed session is not a legacy/bootstrap exemption. The final versioned-document check uses R currentFile and the already-installed freeze cache; it does not call versionedDocExists or reload live boundary/content on cache miss.

Provider `checkGitProtectionFactsCurrent(actualFacts):boolean` is a synchronous storage-freshness predicate, not a permission ticket. A private WeakMap only recognizes the actual complete readGitProtectionFacts result; it compares the complete returned observation, canonical root/Gitdir identity, bounded config bytes and unsupported-topology sentinels. Signing also checks the observed repoId/config and a second topology read. Copy/unknown/config drift/added worktrees reject. Coverage remains limited to the existing supported ordinary-repository surface; linked/shared layouts remain unknown. This is neither OS confinement nor a claim to defeat concurrent external writers.

Pipeline `registerVersionedDocumentAfterWrite({projectRoot,absPath,recordedBy?}):Promise<boolean|undefined>` composes the existing G13 registerVersionedDocument Service. The default Runtime factory consumes it; host-supplied after-write callbacks remain their owner's actual caller. Exact remaining migration points: W app/desktop/session.ts's registerVersionedDocAfterWrite callback must use this Pipeline port; common/编排/shell-post-audit.ts:416 must receive G13 baseline data from its upper caller rather than call baselineShaFor; Provider version-change/impl/fs-version-change-store.ts:18,369–381 still installs permit snapshots upward and needs a separately assigned exact-file change. Those paths were not silently rewritten or declared migrated here.

B actual limits: prepareCreatedTaskClose's pinned branch still requires frozenRoles[created.to], while prepareRoleDispatch's execution branch requires frozenRoles[targetRoleId]. Both therefore lack the narrow controller/Verifier task basis path; simply removing them would grant summary-only acceptance. Existing task events have actual assignment/parent/report evidence strings but no host-bound final delivery candidate/criteria/quality receipt. CriteriaRef exists in customer/evidence metadata, not this task assignment; GitCandidateStore's readCommit/listTree validates objects but does not establish the current final delivery candidate. No new builtin privilege, fake active/frozen evidence, task schema or controller completion was introduced. A real final-candidate producer and criteria/quality binding remain prerequisites for that subsequent narrow path; missing evidence remains blocked/needs revision, not accepted.

Evidence:170 is an invocation mistake (nonexistent tsx path, MODULE_NOT_FOUND), preserved with EXIT/CLOSE1 and no business execution.171 new exact two tests2/2;172 affected four4/4;173 original run-role-submit file12/12;174 git-command file11/11.176 rechecks final observation-signing fence2/2.178 final two affected files23/23 natural EXIT/CLOSE0/signalnull (overlap, not summed), including actual default Core/default Chat/local HTTP write/edit, UTF8 bytes, host-argument forgery/scope/Git metadata/absent stable lookup/config drift negatives and real stable approval/source before write.179 final main TypeScript natural EXIT/CLOSE0. The final one-shot no-permit guard and public after-write wrapper are type checked; no separate one-shot stable business test is claimed. Wrapper168 records start/PIDs/exit/close/signal/180s observation budget/source hashes. No owned test remains; no real model, production App, external network or development Git write occurred. Q20 concurrent CPU evidence is exploratory against its own recorded source window, not a frozen acceptance result for these changed files.

## O18 real run code basis and worker candidate; integration handoff
New Git run pins capture actual refs/ans/trunk via Provider readCodeBasis against the same complete document/active/snapshot. codeBasis is included in the new pin digest and final R9 CAS additionally fences the actual OID and same-version snapshot. Existing pins are not filled from HEAD/log/latest. Query observed results return ordinary basis and assigned-run basisSource (runId/pinDigest/runRecordSha256), using freshly re-read data; requests gain no host field. Worker commit requires its actual open parent-bound module assignment, original run codeBasis/eight refs, current Active∩frozen scope and selected real file bytes. The legal Pipeline checks the actual git_candidate Core invocation and all-root protection/admission closure; Service checks its private preparation identity, complete G verdict and fresh authority/bytes under R9. Objects-only preparation precedes one candidate-ref CAS in the original git.json, with typed actual task/run/module/source and settled process proof. No document/delivery ref is published.

Git Service exposes prepareIntegration(request), sharing PreparedGitWorkerCommit plan/policy/source ordinary data and executeWorkerCommit. Integration requires the actual assigned convener/run, each frozen roster module's real child done report and original creator accepted close, matching settled worker candidate journal/ref/objects/parents, and current Active∩frozen ownership. It combines only recorded committed file bytes; conflicting overlap rejects. Provider GitCandidateInput.parents is optional; actual integration parents are [original base,...worker heads]. GitIntegrationSource records original contributors, close operation/event and report hashes in the same candidate journal. Pipeline additionally validates its private managed roleKind=built-in-governance for the actual controller Core; a role name is insufficient. Current G raw branch still requires its narrow integrate/parents/integrationGrants update; no bypass or commit-template impersonation was added. This integration path is type checked, not yet behavior-verified. The final merge/criteria/Verifier/overall-parent close and delivery remain incomplete; criteria must be checked against actual approved/pinned document bytes rather than inferred absent merely because the run has six documents.

Evidence186: existing complete Git chain plus real new run basis/query and worker candidate/source/journal/replay/clone/wrong-base/outside-scope/late-byte negatives, 1/1 natural EXIT/CLOSE0/signalnull, 91.66s (wrapper17228→child23412,180s observation budget). This is storage/Service evidence, not whole production closure. Subsequent changes added the same-version snapshot fence, multi-parent integration and private controller kind; those new branches have not received a behavior test.189 current main type naturally EXIT/CLOSE0, diffcheck0.182–184/187 original in-flight type reds retained.188 also type0; counts overlap. No owned process remains. Q23 concurrent source-window results are exploratory and independently recorded. continue-frozen after document/active updates has not received its dedicated new assertion; code reads the original immutable run codeBasis, not latest refs. Old IO caller migrations and tool-midflight task/authority source CAS remain explicit subsequent work.

## O19 accepted-child integration fixture and actual criteria source
The existing Git capability fixture now exercises worker candidate→real done report→original convener accepted close→prepareIntegration/G16→multi-parent object/ref/journal readback, byte/mode preservation for every unchanged base entry, replay, no-accepted-child and duplicate-head rejection. The single owned run193 used --test-isolation=none and the recorded180s observation budget, wrapper3656→child23856. It naturally terminated EXIT/CLOSE134/signalnull with Node CleanupQueue::Add insertion_info.second native assertion (destroyTracking/promiseInitHook/lstat/noLinks); stdout contains no new stage/assertion reach. The original stderr and metadata remain. This is not an attributed product noLinks defect or an integration pass. No force exit, safety weakening or duplicate blind run was performed; no owned process remains. G16's independent actual Provider SHA1/256 complete-plan/parents tests27/27 and source78B8EFF376FE4F60C65DEFF749C922596DC44CECE79177D7D6E95C0D10DA1DE3 are separate evidence. Public integration still needs Q's actual route.

The immutable Q23 run snapshot's actual proposal docs/proposals/q2-new-proposal-v1.md has sha2562d3ea855d3b20ad050e6f2c77dfbfbb82e9459d998cee20a57172ae8484f53dc, schema project-proposal/v2/flow q2-new/version1, and explicitly requires src/impl/result.txt, evidence preservation and creator closure. This existing approved/frozen material can supply a criteria GitEvidenceRef from original run codeBasis/blob plus exact run document path/hash/version. It contains no FSM transition specification, and a ref's existence is not a quality pass. No standalone criteria document, approval or Q-root byte was fabricated.

Proposed minimal Model handoff (not written by O): TaskReviewBasisRef={kind:'git-candidate-review';candidateOperationId:string;candidate:GitOid;criteria:GitEvidenceRef[]} as host-only TaskCreatedEvent.reviewBasisRef. DispatchTaskPayload.reviewTarget?:{operationId:string;candidate:GitOid} is an ordinary proposed expected read target; it is not a host receipt. O's subsequent producer must verify the actual integration journal/ref/process/parents/source/accepted child set and actual current assigned parent/run, then bind only real frozen/approved criteria blobs. No trusted-verdict field is requested on reports; verifier evidence must address the exact candidate/criteria and actual required checks, with unavailable execution remaining blocked. Overall-parent close/delivery must not precede that final proof. Local child closure is independently proved by Q23 and never waits for future final quality.

## O20 host-bound final review, text quality and delivery preparation
`prepareRoleDispatch` now accepts only ordinary expected `reviewTarget` plus the actual host parent task. The Service verifies the same assigned controller/run, real settled integrated candidate/ref/process, accepted worker children and original frozen proposal blob before issuing `TaskReviewBasisRef`. Original R9 child append binds the actual parent/run/candidate/criteria and ledger; model fields cannot create that reference. `openRoleSession(taskId)` and every send re-read the assigned Verifier context. Exact-review Git query targets are restricted to the host-bound final candidate and criterion commits. The canonical Verifier boundary permits its quality documents and rejects implementation writes. W17 consumes the new review/task ports and Pipeline after-write/baseline advisory ports; no Interface-to-Service capability is passed.

The current bounded quality format is `docs/quality/<flow>-report-vN.md`, YAML `schema:git-quality-report/v1`, version, actual taskId/runId/flowId/candidateOperationId, exact candidate GitOid, exact host criteria refs, and checks `[{artifact:{oid,path,sha256},assertion:'nonempty-utf8'}]`. No passed/approved/verdict field is evidence. The Service mechanically covers only the actual approved literal requirement `Produce <path>.txt, preserve evidence and use creator closure.` by re-reading exact Git blobs/hashes/UTF8 and genuine accepted-child receipts. Different or executable requirements remain `review-quality-execution-unproven` until their actual checks exist. Verifier creator close rechecks candidate/ref/criteria, quality bytes, current report/run/task and entire existing ledger under R9. Overall controller acceptance remains `controller-delivery-unpublished` after independent quality, preserving the still-live controller's authority to publish first.

Delivery groundwork (not yet an executable public publish path): Provider `planGitRefPublication(root,ref,oldOid,candidate)` returns `GitRefPublicationPlan` with actual complete baseTree/candidateTree, existing commit, complete diff, `{kind:'ref-only',index:'not-used',checkout:'not-used'}` and the exact fixed single update-ref CAS argv. `GitDeliverySource` is an ordinary optional same-operation journal DTO. Internal Service `prepareVerifiedDelivery` validates the live same-controller integration and the verifier child's real original creator acceptance, exact quality/criteria/artifact proofs and current ledger. It does not grant publication by itself. The Pipeline publish method remains the old blocked stub; G's ref-only policy and actual nonce/hostlease/R9 execution, then delivery-backed overall close, remain necessary. creatorCloseOperationId will bind the actual quality child close, never require the controller already closed. No new authority ledger or role privilege was introduced.

Evidence201: three narrow actual query/review negatives naturally EXIT/CLOSE0; 204 same original task-state file19/19 naturally EXIT/CLOSE0 under normal approved execution (202 default-sandbox18/19 preserved, no root-cause attribution). 207/208/209 main TypeScript naturally EXIT/CLOSE0/signalnull, counts overlap. The new quality positive and delivery plan are not behavior-verified here. Q25's actual first error is earlier `git-integration-request-invalid`: W currentGitRuntime reads only origins.running.taskId and then its real ledger runId; its private current value was not captured. Q25 did not reach independent Verifier/quality. No task/root/role guess or model host field was added to repair it. Old193 native abort, continue-frozen dedicated assertion, task-midflight cancellation CAS and the remaining Provider permit/shell-post-audit IO callers remain explicit unfinished evidence/work. Whole-worktree diffcheck additionally observes another owner's existing trailing blank line, not silently repaired.

## O21 fresh delivery assignment facts
Pipeline `resolveDeliveryAssignment({projectRoot,recipientRoleId,source:{kind:'assigned-task',taskId}|{kind:'child-report',childTaskId,childRoleId},expectedFlowId?,expectedRunId?})` returns `{ok:true,value:{taskId,actorRoleId,flowId,runId?}}` or `{ok:false,code,message}`. Service holds the existing R9 boundary while reading actual Provider ledger/run data. Assigned lookup uses only the exact host-bound task ID. Child-report lookup requires one actual creation, its latest persisted report from its actual role, strict stored parentTaskRef, original creator=recipient, same flow/run and one open parent assigned to that recipient. An accepted/closed child preserves its historical report relationship; it is never returned as a reopened child assignment. Closed parents, cancelled/closed or unreadable runs, malformed ledger, wrong report role/recipient, cross-flow/run and missing exact IDs reject. Legitimate missing run stays absent; lookup does not invent a run or execution permission. The returned ordinary provenance is not an admission/mutation permit and does not extend authority to a new chief customer message. The W host owns choosing actual dispatch, bounded continuation or child-report source and rechecking delivery lifecycle.

216 extends the original parent-CAS fixture with actual dispatch→child report→creator accepted child→parent lookup and true run cancellation. It naturally reports1/1, EXIT/CLOSE0/signalnull, 0.87s, wrapper8716→child4164. 214 was the same overlapping fixture before the final cancellation assertion; not a second independent pass. 217 final main type naturally EXIT/CLOSE0; five touched production/test files diffcheck0. 212 original local compile reds retained, corrected by actual typed task-event array and narrowed child ID. No owned command remains. W has not yet consumed this new resolver in production, so Q25's observed missing host assignment is not claimed fixed end-to-end. G17's exact raw-commit-byte publication contract was received; Provider raw three-commit production and actual publish execution remain subsequent work, with controller-delivery-unpublished retained.

## O22 real delivery publication and final process boundary
The existing Pipeline `createGitRoleRuntime(...).gitPublish` now handles `target:'delivery'` through `GitCapabilityService.prepareDelivery` / `executeDelivery`. Model `criteria` and `evidence` are ordinary expected refs: they must exactly match the frozen proposal criteria and actual final Git artifact refs independently derived from the host-bound accepted Verifier child. `creatorCloseOperationId` names that Verifier child's original convener acceptance. The controller must still be the actual open assigned task; publication precedes its final report/chief overall acceptance. The Pipeline checks the actual private built-in convener Core and active git_publish invocation, all registered actors across roots, current native/file/effect proof, G17 complete ref-only policy and the same host lease. Service uses a private preparation WeakMap and recomputes current task/run/ledger/quality/Active∩frozen authority under the existing R9 lock. Provider performs one journalled expected-old delivery ref CAS. No document/active ref or historical run pin is rewritten.

Provider `GitCandidateStore.readCommitBytes(oid)` reads actual bounded cat-file commit bytes and recomputes their complete Git object OID. `GitRefPublicationPlan` now contains actual candidate and previous-delivery commitBytesBase64/oldCommitBytesBase64; first-null has null old bytes. The policy's separate deliveryBasis supplies the original run code base/tree, actual integration source/candidateOperationId and actual baseCommitBytesBase64. CAS old delivery and code authorization base remain separate. G recomputes all three commit identities, both full tree differences, inherited metadata/modes and exact single update-ref command; no fake index/worktree or metadata write exception is used. Existing delivery values require their original settled same-flow operation proof, not merely a matching ref string. The original same-operation git.json carries ordinary verified-run-delivery source and real process facts.

Overall parent close only removes controller-delivery-unpublished after actual delivery ref/journal/object/process and same candidate/criteria/quality creator receipt match. The final original ledger append rechecks actual delivery ref/journal under R9 in addition to candidate/criteria, current report/run/task, quality bytes and existing ledger digest. Independent quality alone cannot close the controller as accepted.

The same existing coordinator Map now excludes any root admission/action while another root holds a Git mutation, and excludes a mutation while any other root action holds its lease. Actual inventory changes or emergency facts invalidate held mutation proof across roots without releasing anyone else's lease; emergency stop still runs. This is process-owned admission serialization, not OS confinement or a new authority ledger. Git command execution rechecks the actual lease synchronously immediately before spawn, after its final asynchronous process-record write. `launch:'pending'` remains unknown after a crash; only the actual cancellation-before-spawn branch persists `launch:'cancelled-before-spawn'`, no PID and null exit code. It does not invent exit0. Known cancellation records can safely permit a later actual retry; a possibly started process remains fenced. Revocation permits only private settlement of an already-bound operation using the actual executeGit return and an exactly matching persisted process record, with immutable binding and R9 retained. It cannot launch a new effect or replace another request.

Actual evidence:222 real SHA1/256 bytes/null+existing refCAS2/2;225 final review/delivery authority/cross-root negatives4/4;227 original bounded query/revision/init3/3.228 first real pending-file cancellation1/1.229 exposed the real revoked-lease journal-settlement error and is retained;230 local declaration-order type errors retained.231 final same-operation cancellation/ref settlement and genuine retry1/1.232 final affected Git command file12/12,233 final main type0,234 final relevant two-file subset7/7 (including raw delivery bytes, independent-Node CAS winner, unknown-process fence, original initialization, delivery authority and global admission) all naturally EXIT/CLOSE0/signalnull; counts overlap and are not summed.234 took10.95s; wrappers retain real start/child PID/exit/close/budget/beforeafter hashes. No forced exit or old193 heavy-prefix retry occurred. These are infrastructure/negative and existing affected checks, not a claimed positive Service quality/delivery production chain; Q has not reached that branch yet. Own scoped diffcheck0; no owned process remains.

Known unsupported entries remain explicit: Pipeline candidate init/commit/integrate and delivery publication are connected; candidate revert still reaches the fail-closed Service fallback. Direct Service candidate/publish do not bypass Pipeline protection. GitPublish target documents lacks a bounded document-business context and remains blocked; actual document version submission, team-plan, activation and initial workflow use their separate already-bound transaction ports. Run continue-frozen has an existing decision CAS; stop and stop-and-restart remain run-stop-unverified until genuine lifecycle stop evidence is connected. Remaining IO permit-upcall/shell-post-audit migration, dedicated document-update/continue-frozen assertion and mid-tool task revocation CAS are not declared complete.

Future code inheritance risk, deliberately not changed for this first NEW path: readCodeBasis/planDocumentCommit still source refs/ans/trunk while delivered code is refs/ans/delivery/<flow>. A subsequent changed/bug run must prove the latest authentic delivery/journal and preserve unchanged code, separately bind its current frozen document criterion Git source, and retain old pins. Current readReviewMaterial reads proposal bytes from run.codeBasis and also checks the final candidate; that coupling must be revisited when newer document snapshots and delivered code differ. No two refs were silently synchronized, no historical pin was refilled, and no new frozen source was guessed here.

## O23 independent run Git sources and exact closed-task notices
New Git run pins carry `codeBasis`, `documentGitBasis`, and `codeBasisSource`, all included in their original pin digest. `RunGitBases`/`isRunGitBases` are ordinary pure stored-shape definitions in the existing run-manifest module. Document source is `{kind:'document-ref',operationId,journalBindingSha256,sourceFlowId}`; the binding hash canonically excludes mutable journal phase/ack fields while retaining immutable request/object/process data. Delivery source is `{kind:'delivery-ref',operationId,journalSha256,sourceFlowId,sourceRunId,controllerTaskId}`. These values are observations, not a model approval or a replacement for frozen task/module/Active authority.

Provider `readExecutionBases(expectedDocumentActiveSnapshot)` reads the actual document app ref and all application delivery refs, authenticates their original settled operation/ref/object/journal data and chooses only an actual unique maximum head under bounded Git parent ancestry. No delivery preserves the first-NEW document-ref source. A unique delivered source may come from another actual flow in the same repository; differing unrelated heads remain git-delivery-code-heads-ambiguous, with no time-based latest guess. `verifyExecutionBases` checks the pin's own original object/op/hash without requiring current refs to stay at old OIDs. A later doc/active/ref advance does not refill or replace a historical pin. Final run CAS rechecks both independently captured Git sources against the same actual document/active/snapshot and original accepted controller rows under R9.

Service additionally requires the delivered source's real prior controller done report and original chief accepted close, bound to the actual quality creator receipt and actual delivery operation. There is no fabricated accepted event in the storage fixture. The current run still needs the genuine plan/D3/three-document activation/eight-ref closure. The Verifier criterion source now comes from the independently frozen document Git OID, checked against that run's exact proposal snapshot bytes. A newer criterion is not read from an older delivered code tree or a current live file. Existing original trunk-based historical pins retain their original blob proof; pins with missing/inconsistent new provenance are rejected, not backfilled. Worker/integration code bases remain the actual immutable run code basis. Publication additionally checks actual merge-base ancestry: a later expected delivery head cannot be rolled back by an older frozen baseline merely because its CAS old value matches.

Document publication itself continues its existing bounded document-ref transaction; it does not grant a document role permission to copy or change implementation code or synchronize two refs. Existing application-managed repositories need authentic app-ref/journal provenance. An arbitrary existing user repository with no authentic application baseline still fails closed (existing initialization without its original operation remains git-initialization-root-changed); this work does not invent HEAD/log as an import source or claim that unsupported import is complete. G17's delivery pure policy still hardcodes source.base.ref=refs/ans/trunk. A precise existing application delivery-ref literal allowance is handed to original G for G18; no G/R source was changed. First-NEW trunk-based publication remains compatible. Delivery-backed later publication awaits that narrow G consumer and real business positive coverage.

Pipeline `classifyClosedTaskNotice({projectRoot,recipientRoleId,boundTaskId,operationId,source:DirectActionSource})` returns `ok/value:{kind:'information-only',taskId,recipientRoleId,operationId}` only when the original R9 ledger contains one actual task assigned to that recipient and its original creator's exact closed actionSource, matching every source/op/run/actor field. Unknown/mismatched source, open/another task, wrong actor/op or read failure remains closed-task-notice-unproven. This is a readonly host receipt fact, never an assigned-task reopen or execution permit; it does not classify unrelated publication notices merely by text, same role or same flow. W receives only this Pipeline ordinary input/output and owns its enqueue-time host snapshot and information-only consumption.

Evidence239 source storage1/1 naturally EXIT/CLOSE0/19.6s.243 final storage source inheritance plus original five-argument CAS2/2 naturally EXIT/CLOSE0/25.14s: actual code/doc OID separation, unchanged binary bytes, real ancestor selection across stored flow refs, unrelated-head rejection, old-source/ref advancement, stale CAS and journal hash drift, and real business phase acknowledgement not invalidating the document binding. These are storage facts from actual temp Git objects/refs/operation DTOs, not a fabricated accepted ledger or a positive execution pin.246 original parent fixture1/1 naturally EXIT/CLOSE0: real creator close receipt/serialized copy classify as information-only; altered digest/op/recipient/open/another closed task reject; ledger bytes unchanged and closed task remains non-assigned.245/248 main type naturally EXIT/CLOSE0;247 saw only W's in-flight roleId diagnostics and is preserved,244 local import/discriminant compile reds preserved. Own scoped diffcheck0; no owned process remains. Q26 started against archived O22 bytes and is an independent exploratory window, not positive coverage of these new source branches. Original193 native abort and remaining IO/run-mode/import/revert/mid-tool authority work remain explicit; no heavy prefix was rerun here.

## O24 per-turn task identity versus report duty
`RoleSessionHandle.send(text,{handback:{required,taskId?}})` now retains a host-verified taskId independently of required. An actual informational callback may pass required:false plus its fresh assigned taskId: no automatic missing-report fallback is produced, while an explicit submit_report (including blocked) still binds that exact task/turn. Actual dispatch/work continuation remains required:true. An explicit new-chat intent `{required:false}` without taskId clears the constructor's old reporting identity. This field stays host-only and is stripped before native prompt options; it changes no write scope, task authorization, role or Model schema. Existing common handback logic remains unchanged: skip only when no explicit report and report duty is false, and always preserve actual explicit reports.

252 real default Core/default Chat/local HTTP6turn/9request test naturally1/1.254 final original submit-capability file13/13 naturally EXIT/CLOSE0/signalnull/4.83s (overlap, not14 tests): pure bound info ACK produces no handback; optional explicit blocked preserves actual taskId; required work without a report produces terminal fallback; a later real turn cannot reuse an old report; explicit new-chat report has no old taskId. Actual tasks are created through the existing application observation API and resolved by the exact public assignment resolver; only inference responses are substituted. This layer evidence does not claim a complete worker workflow. Test cleanup closes the real local HTTP server/restores test environment even when assertions fail.256 final main TypeScript naturally0, own diffcheck0, owned0.253/255 W in-flight test diagnostics are retained and not attributed to O.

Readonly module-extraction advice was sent to the scheduler for Planning: existing W queue/handle delivery, O per-turn intent/report orchestration, R report persistence, Service task/creator state and Provider R9 ledger remain distinct. Existing private functions can be collected first without new contracts. Any future task-handoff-runtime/task-delivery module files require their explicit scope review; none is added here. G18 literal/code-source business loops, revert, actual stop/restart, remaining IO/UI/T3 and mid-tool authority CAS remain subsequent work.

## O25 immutable review intent evidence
The existing Pipeline prepareRoleDispatch({projectRoot,fromRoleId:"convener",targetRoleId:"verifier",flowId,runId,parentTaskId,reviewTarget:{operationId,candidate}}) remains the only review route. It checks the current actual built-in controller dispatch and returns kind:"review" plus exact parentTaskRef/reviewBasisRef. Six document slots are legitimate; intent confirmation is a distinct approved input, not a fabricated seventh slot. Generic legacy verifyPinnedRun is unchanged.

Private Service verifyReviewIntent follows only the run's original documentGitBasis (or its own original trunk code basis for historical pins): actual Git history manifests and their digest/byte-checked complete snapshots must contain the roster/proposal's exact intent and original versions freeze. The original approval snapshot and the exact real intent-confirm request/resolution must agree on snapshot/path/hash/version/flow/customer or delegated source. No live file, latest-role lookup or pin backfill is used. Missing/conflicting evidence rejects. ReviewMaterial.relatedLedgerDigest is ordinary internal preparation data; final review-child append passes it to the existing Provider expectedLedgerDigest under R9, alongside exact run/parent/candidate/criterion checks. It is not a Model authority field.

263/265 readonly calls against Q28's existing immutable objects prepared the real cf4830a9 candidate review with its actual frozen criterion. Wrong flow/candidate/parent and an injected missing original approval-snapshot read all reject. All 353 existing root files have identical before/after SHA256; no task/create/append/freeze/model was invoked. This proves Service material preparation, not W dispatch/persistence/open or quality success. 262 probe import mistake and 259 local compile errors remain preserved. 266 original three-case regression failed at first sandbox AC/Temp init-evidence rename EPERM before business assertions; 267 the identical command/assertions in the authorized host environment passed 3/3 with natural EXIT/CLOSE0/signalnull. 264 main type0; current first-NEW public review is for Q29 to verify through W22's mandatory preflight. G18/source loops/revert/stop/remaining IO are not claimed complete.

## O26 readonly run-mode consumption contract (not implemented)
1. Current Pipeline `createDirectRoleRuntime(...).selectRunChange` (trunk-runtime.ts:389) only delegates; Service `selectRunChange` (apply-journal.ts:1336) validates rapporteur/actual pin/target and CASes continue-frozen. Stop/restart remains run-stop-unverified; no receipt proves them yet.
2. Existing `RoleSessionHandle.stopAndInspect({expectedSessionId,expectedTurnId?,timeoutMs},signal)` (run-role.ts:567/2042) reaches actual Core and native stop/drain (runtime/session.ts:810). Core seals later prompts; a timeout/unknown/unsupported native remains blocked. No new R stop API or Model safe boolean is needed.
3. Existing `inspectManagedRoleSessionEvidence({projectRoot,sessionId})` plus `inspectRuntimeCoreRegistry()` provide fresh actual same-instance facts; lifecycle alone is not a model-installable authorization ticket. Require exact Core/native IDs, quiescent/providerFinished, empty activeTools, complete owned-process coverage and real process/transport terminal facts.
4. W owns the missing run-to-host provenance: `executionInventoryFacts` derives taskId from actual running delivery and observed handle, plus constructor runId, pending opens, queues and active deliveries. Join these exact task IDs to actual ledger/run; no latest role, cwd, absent PID, empty manager table or manifest.closed inference. Other app-owned unknown actors remain relevant to mutation admission.
5. W `SessionManager.abort` (session.ts:4631) currently only requests handle.abort and resets delivery bookkeeping. It is not a drain receipt and cannot be reused as run stopped. W must fence the exact old-run pending/open/delivery producers and publish their real revisions before lifecycle collection; emergency abort stays available without releasing another action's lease.
6. Minimum O consumer can privately use its own managedCoreHandles actual stopAndInspect methods in run-role, then return ordinary instance observations to trunk-runtime. Do not expose handles to Model/Service, add a Provider-to-Pipeline callback, or trust caller-copied stop facts. W only supplies its actual inventory/queue facts via the existing coordinator publisher.
7. Before a restart stops old execution, prepare the exact requested target using existing Service `prepareExecutionRun({runId,flowId,operationId})` and boundary snapshot validation without pinning it; require its expectedTrunk equals the requested targetTrunk, since this existing preparer reads the effective document source. Restart needs a distinct actual draft-run identity from the host; existing SelectRunChangeInput has no replacementRunId input, while its result already permits replacementRunId. Reuse the exact prepared target/source, never silently select current live later. Plain stop validates its actual source/decision and does not require a fabricated replacement run.
8. A requester inside the old-run stop set must not await its own tool/prompt/persistence terminal while that tool is still returning. Record only an honest blocked/deferred observation, return the tool, and let a host continuation after its actual turn settles recheck the same operation/task authorization before drain and commit. No requester-role exemption or early applied result.
9. Final O/Service/Provider commit must bind old run record/pin, exact target prepared snapshot, actual stop-set instance receipts, current host revisions and cancellation state under the existing coordinator/R9 CAS. Only then record stop or stop-and-restart and the true replacement run; old frozen bytes/pin remain immutable. Failed target validation leaves old run running; failed drain never starts replacement.
10. Default Codex Chat has an actual abort/drain producer; this readonly review ran no new lifecycle test and grants no new evidence. Pi/Claude/unknown/custom coverage stays unknown unless their real producer independently proves the same facts. Continue-frozen remains its existing no-stop CAS and must retain its original code/document pin.
11. This node changes documentation only; no production/test source, Model, Q32 root, runner or process was changed/started. The host queue fence/source join and final stop/restart transaction are the concrete remaining O/W implementation, not completed behavior.

## Readonly candidate.revert preparation (Q33 source window; not implemented)
1. Existing runtime.ts GitCandidateRequest already has action:revert, base, commit, optional mainline, message and operationId; tools.ts4217 limits non-commit actions to convener. No new request/Model field is identified.
2. Pipeline trunk-runtime.ts gitCandidate handles commit/integrate, then routes revert to Service candidate; git-capabilities.ts460/466 returns git-protection-closure-unproven. That is an actual unimplemented effect, not a successful rollback.
3. Reuse actual GitCandidateStore readCommit/readCommitBytes/listTree/readBlob and its complete plan/prepareObjects, followed by the existing app-owned candidate ref/journal CAS. Compute an inverse of the selected commit-versus-real-parent tree against the actual supplied base; additions/deletions/binary bytes/modes and all unchanged files remain explicit. Divergent overlapping base changes reject rather than overwrite; no reset/shared index/checkout is proposed.
4. A merge needs its actual bounded 1-based mainline selecting a real parent; missing/invalid/ambiguous selection rejects. A non-merge/root case must use the actual parent/empty-tree semantics, not a guessed latest commit. Validate the original target source/relationship and current assigned controller/run authority under the approved P2 contract.
5. Reuse actual controller Core invocation, current Active-intersect-frozen module authority, original owner/source grants, all-root actor closure, host mutation lease, G verdict/input digest and final R9 base/source/task CAS. Revert produces only a new candidate; it does not update document/delivery refs, declare quality passed or bypass independent review/creator close.
6. Current G rawObjectPolicyError accepts commit/publish-documents/integrate only. Original G must consume ordinary actual target commit, selected-parent/base complete trees and the full inverse candidate plan; never disguise revert as a worker commit or reuse integration grants as a generic convener write set.
7. Exact O implementation files remain original Service git-capabilities/abstract/public, Pipeline trunk-runtime and Provider trunk abstract/impl/public; original git-command/git-trunk-store/git-capabilities tests suffice. Current Provider candidateSource union has assigned-run-task/run-integration only: a distinct actual run-revert source must be defined there by O before implementation, not faked as integration; no new ledger/file/Model permission ticket is proposed.
8. Future minimal actual-Git fixtures should cover ordinary inverse, binary/add/delete and unchanged-tree preservation; real merge mainline; divergent conflict; foreign task/run/source or revoked scope; copied preparation; candidate-ref CAS conflict; no document/delivery publication. No fixture/source/test was changed or run in this readonly node, and no rollback success is claimed.

## O29 closed-source notification versus retired recipient assignment
The existing classifyClosedTaskNotice signature is unchanged. Under the original Provider/R9 lock, source.operationId uniquely identifies the real closed source task and its exact original creator/actionSource. boundTaskId separately identifies a genuinely closed recipient assignment in the same original flow/run; it need not be the task described by the notice. Only the existing chief/convener/source-actor notification recipients are recognized. Success is information-only and taskId names the source closed task, never a reopened recipient assignment.
A still-open recipient remains on normal delivery; wrong/missing source, ambiguous/unclosed operation, wrong recipient, unrelated flow/run and non-close business actions remain unproven. W calls this only for actual host-notification system entries; dispatch/child-report/current assignment checks are unchanged. No generic queue clearing or version/plan/active classification was added.
276 final original parent fixture1/1 naturally CLOSE0 includes real chief-product cross-recipient and convener-child close facts, exact source identity, unchanged ledger, still-closed/rejected assignment checks, valid still-open recipient refusal, and a genuinely reported/closed distinct-run refusal. Earlier273/275 overlap, not extra tests.277 final main type0/diff0/owned0;272 local fixture type error preserved. Q33 actual captured queue had two q6-close-product-draft entries (chief unbound and convener old closed init); no subsequent source-family behavior was inferred. W actual queue/receiver regression and Q34 public drain remain independent evidence.

## O31 concrete run-stop assembly against W27 (readonly, not implemented)
1. W27 session.ts SHA6D288372…6695AB produces `desktopProjectExecutionInventory(root).deliveryQueuePersistence[]`: actual enqueuedSeq/completedSeq/committedSeq/pending/armed/path/errors and manager-wide knownProducers(openChains/deliveryClaims/handbackCommits). `stopSession`/manager.stop returns a captured targetSeq plus the settled/committed outcome. It proves only that finite cutoff, never no future producers.
2. O already receives W inventory through W inventoryChanged→Pipeline recordGitHostInventory→Provider same coordinator Map; consume it via existing inspectGitHostCoordinator. Original Provider abstract GitHostInventory needs the precise optional persistence DTO and typed existing queue/active fields (currently unknown[]), not a Model safe flag or Pipeline import of app/desktop. W must publish a fresh revision at the stop fence and after its barrier; current persistence completion alone does not publish one.
3. Exact old-run members come from public inventory sessions(hostHandleId/coreSessionId/taskId/runId), queued taskId/systemAssignmentTaskId and active taskId, joined by O Service to that run's actual assigned ledger. W must bind pending opens/claims to their actual task/run and fence only that exact stopped set, retaining unknown identities as blocked. A manager-wide zero/count or constructor runId alone cannot establish membership. If multiple managers contribute cutoffs, add one ordinary stable actual manager identity to their publisher/StopResult for exact matching, not array-position/path guessing.
4. The existing W-injected rapporteur selectRunChange wrapper can legally orchestrate W→new Pipeline preparation in existing trunk-runtime→W own exact-handle stop/fence→Pipeline finalization. Do not inject a W effect callback into Service/Provider or have Pipeline call Interface. Continue-frozen keeps its existing no-stop Service selectRunChange CAS.
5. Preparation in original Service apply-journal must bind actual rapporteur assigned task/invocation, request/op, old recordSha/pin and the exact target. For restart use existing prepareExecutionRun plus validateRoleDocumentsSnapshot on a distinct real host draft and require expectedTrunk equals requested targetTrunk before stopping old execution. Store only its real prepared source; do not pin/start the new run yet. Plain stop creates no replacement.
6. W owns its exact observed handles and calls the already-public `RoleSessionHandle.stopAndInspect({expectedSessionId,expectedTurnId?,timeoutMs},signal)`. O run-role can independently fresh-check its own managedCoreHandles plus R inspectRuntimeCoreRegistry/inspectManagedRoleSessionEvidence; require same Core/native instance, real quiescence/providerFinished, empty tools, complete process/transport terminal proof. Default Chat is the supported actual producer; Pi/Claude/custom/unknown stays blocked absent proof.
7. If the actual requester belongs to that stop set, return an honest blocked/deferred result from its current tool first. W's existing same-turn settlement/delivery owner then continues the exact held operation/source after that real turn settles; fresh task/cancellation/target checks still apply. Never await one's own active tool inside stopAndInspect, mark applied early, exempt the caller by role, or auto-recover an unbound deferred operation after restart.
8. Final Pipeline preparation identity/current host revision/cutoff/instance checks feed original Service and Provider same R9 old-run/target CAS; persist real stopped status and (restart only) the actual replacement run result in the existing run record. The cutoff must match current published enqueued/completed/committed facts after the execution producer fence; late/unknown producers invalidate proof. No manifest.closed substitute and no mutation of the old frozen source/pin.
9. Exact next writes are original O trunk-runtime/run-role, Trunk Service abstract/public/apply-journal, Provider trunk abstract/coordinator/run CAS; original W session.ts wrapper, exact membership fence and fresh publication. Existing R stop methods/types suffice; no new R field or source path is currently needed. This node changes only this API/memo, starts no test/process and does not claim stop/restart complete. Q38 production source remains frozen.

## O32 implemented host run-transition ports — staged checkpoint, not three-mode acceptance
Pipeline `prepareRunChange({projectRoot,request:SelectRunChangeInput,requesterTaskId,replacementRunId?})` returns ok/value RunChangeHostPlan or code/message. The plan contains planId/operationId/projectRoot/runId/flowId/requestDigest, actual requester task/Core/turn, deferred, exact taskIds and handles(hostHandleId/coreSessionId/nativeInstanceId/roleId/taskId), optional replacementRunId. Private storage binds the actual Service preparation; copies/model arguments cannot create one. Actual registered rapporteur select_run_change invocation, immutable old pin/current assignment, target/source and whole-app Core/native protection are checked before W may stop anything.
Pipeline `finalizeRunChange({projectRoot,planId,requestDigest},signal?)` returns SelectRunChangeResult. It reads W's actual published manager persistence/runStops facts and O's private constructed instance registry, not caller-supplied lifecycle booleans. W needs stable managerId in deliveryQueuePersistence and runStops{managerId,operationId,runId,requestDigest,generation,state:fenced,hostHandleIds,targetSeq}; publish a fresh revision after exact producer fence/drain/cutoff. Every current enqueued/completed/committed seq must equal cutoff, pending/producers zero, exact handles covered once, actual Core/native instances sealed/quiescent. Existing global Git mutation lease closes final admission before Service/Provider R9 source/ledger/run/target CAS. Missing W producer facts remain blocked; no empty placeholders are installed.
Service private createRunChangePort checks exact open requester creation and task set. A natural deferred turn may save its own report; this does not replace/close the actual source task. Final fresh ledger CAS rejects cancellation, changed creation or changed old-run membership. Existing continue-frozen path is unchanged; old selectRunChange remains failclosed for stop/restart until W actually consumes the host wrapper. Same-caller deferred means return the current tool honestly first, then W's real same-turn host continuation stops/drains and finalizes the same retained operation.
Provider commitRunTransition writes the stopped old run as cancelled with a pending recovery receipt before any replacement pin; final receipt is acknowledged only after the replacement write. The immutable old document/code/pin fields stay unchanged. Multi-file failure/recovery, operation replay, final receipt error projection and positive real-W/native integration have not been behavior-verified at this checkpoint; no cross-file filesystem atomicity or complete three-mode recovery is claimed.
Actual remaining restart producer: existing common ensureDraftRun returns the already-active pinned same-flow run. It cannot produce the distinct draft required by this new preparation. Unknown/made-up replacement IDs are rejected. Original O Service/Provider must supply a real request/op-bound replacement preparation before old execution stops; W must not invent an ID or cancel old execution first. No new R field/path is needed, but this source producer is not completed in this frozen Q39 window.
279 Service/Provider type0;280 two local missing projectRoot diagnostics retained;281/283 final main type naturally0.282 original selected three cases naturally3/3/CLOSE0/signalnull; new missing pin/target/actual actor and forged private-reference cases reject, with old run bytes unchanged. These are refusal/regression evidence, not a positive stop/drain/restart proof. No actual W run-stop publisher exists yet; wrong-instance/process-unknown/cancellation races and full three-mode positives remain necessary. Production source has stayed frozen since281 for Q39. Original Windows native/test shutdown failures remain unrelated and unresolved.

## O33 explicit published-history query provenance
Original Provider public `readGitPublishedReadEvidence(projectRoot,target:GitOid)` returns only read provenance from the actual repository/object format/object bytes, original settled application ref journal/process, unchanged original journal file and a bounded real ancestor chain to that ref's currently proven application publication. Historical document objects additionally require their actual manifest and immutable complete snapshot; modern businessJournal is not fabricated for valid older document publications. Current delivery is revalidated by the existing readGitDeliveryEvidence. At most256 matching publications and512 visited ancestor commits; unavailable/corrupt/unreachable sources fail closed.
Service prepareQuery uses this port only for explicit target/other OIDs absent from the existing readable set and only outside assigned-review reads. It supplements facts.readableOids for G's existing strict OID predicate; G and request schema are unchanged. Default/frozen result basis, assigned-run basisSource, run pin and write grants are not replaced by a read target. Existing review still requires the exact bound final candidate/frozen criterion. No delivery source is inferred from task.flowId or a target string alone. Fixed command/path/resource/secret policy remains in its existing layers.
290 original storage fixture1/1 naturally CLOSE0/27.69s: real settled current/historical delivery and historical document queries by chief with no assigned task reach actual log, preserve default basis metadata/no invented basisSource, reject existing-unpublished/foreign/mismatched-format OIDs, and leave the earlier frozen source tuple valid. These are storage/read-policy facts from real local Git with ordinary stored source DTOs, not fabricated business task acceptance.293 relevant existing cases3/3 naturally CLOSE0 cover review refusal/read scope and successful real read followed by exact null-execution-basis mutation refusal; HEAD/ref/process evidence remains unchanged.294 final main type0/diff0/owned0.286/287 local narrowing reds,289 historical legacy-document red and292 pre-O18 stale stub assertion are retained.292's mutation expectation was narrowed to the actual git-worker-request-invalid precondition rather than generalized to any failure.
O production source has stayed unchanged since291. Q41 must still validate the real existing-project CHANGE entry; no full CHANGE success is claimed. Separately observed original worker prepare predicate still requires base.ref=refs/ans/trunk; delivery-backed write compatibility is a later exact authorization task, not broadened by this read-only fix. O32 replacement producer/recovery/replay and W lifecycle positives remain incomplete.

## O34 customer document-preparation checkpoint
Existing prepareRoleDispatch supports chief→product/rapporteur with the original hostInitialization registration/current accepted customer Core turn. It verifies the actual built-in target and returns planning/purpose:document-preparation/flowId/basisDigest, sourceRef in initializationSource, and a real source-bound run-docs-* draft. The draft has empty document slots/null teamPlan/flow and no pin/Active/D3/workflow; no old run or active pointer is changed. Existing findActiveRun still prefers the old actual pinned execution. The ordinary documentPreparationSource metadata binds this host operation/source ID; it grants no execution permission.
The source stores purpose/targetRole/planningRunId/exact document baseline. Service task creation and inspection require that purpose/role/draft relationship; Provider appendGitDocumentPreparationTaskEvent holds the original R9 lock and rechecks the exact effective document version/digest/snapshot, immutable source bytes/hash and actual draft record before task append. Existing draft report/creator-close paths consume this real planning draft rather than borrowing a previous execution pin. A missing actual manifest can support legal initial drafting under the verified root/source; no future proposal is manufactured. Wrong/corrupt baseline remains rejected.
297/299 main type naturally0;298 two original route/review cases naturally2/2/CLOSE0: no source or copied model-shaped host fields cannot create source/run records, Git or execution evidence. Actual current chief positive is for W29/Q; it is not fabricated in this layer fixture. Original NEW legal draft route remains while creator-report handoff needs honest R kind extension and O actual child/report/creator proof; it must never masquerade as customer-turn. Current replacement producer, delivery-backed worker predicate and transition failure/recovery/replay are unchanged unfinished follow-ups, not completed by this document branch.

## O35 creator-report document source — staged public handoff
Existing `prepareRoleDispatch.hostInitialization` accepts optional `creatorReports:readonly {taskId,roleId,reportId,turnId}[]`; preserve the real current chief parent.kind rather than relabel a handback as customer message. Pipeline matches every identity to its private actual managed Core current-turn handback provenance; Service checks the original chief-created same-flow child and latest actual report/raw ledger SHA. The immutable source keeps purpose document-preparation and returns initializationSource.kind=chief-creator-report, using R23's exact existing four-field work-source reference. Final task append uses the original R9 source/draft/document baseline and whole-ledger CAS. Inspection of an already-created child checks the persisted historical report hash, so natural parent-turn completion does not revoke that established source.
A genuine initialized empty repository without an effective document ref is accepted only through successful original readInitialGitPublicationBasis and exact initialization operation recheck under R9; unrelated read errors do not become absence. Source-bound planning drafts never replace old active execution/pins or grant worker rights.
303 selected source-kind/initialization cases: 2/2, natural EXIT/CLOSE0, signal null (PID18152, 07:29:07.059Z–07:29:10.502Z).304 main type/diff: natural0 (PID10164, 07:32:13.028Z–07:32:14.478Z). Actual current-chief creator-report positive remains W30/Q responsibility; these negatives do not establish the full CHANGE path.
Q43 confirmation diagnostic is read-only: finalizeIntentConfirmation currently searches any path-matching intent-confirmed record without prepared.version, and can return Existing confirmed intent bytes conflict before append when old v1 bytes differ. The actual Q43 internal return was not captured, so this is a precise candidate branch, not a backfilled runtime cause. Distinct replacement producer, delivery-backed worker authorization, and run-transition failure/recovery/replay remain unfinished.

## O36 retained choice and migrated intent confirmation
The retained customer choice remains a choice fact. Actual domain application is separately observed through intent.confirmation.freeze-start/committed/pending, using existing admitted diagnostic fields phase/errorCode/errorMessage/contextSource for only the exact flow/version/path/SHA/snapshot/decision/turn/tool metadata; no document contents or new global logger whitelist. A failed finalization does not issue a write permit and keeps the pending model notice. A future R-owned optional typed outcome field is still needed for a single tool receipt to carry both choice and domain-apply status; O has not changed the Model or claimed raw answered means committed.
The existing Provider append path now permits only an additive confirmation over a same-version/path/SHA migrated-legacy/application migration receipt. Inside the original R9 lock it validates the unique actual chief intent-confirm request and resolved confirmation, exact flow/source/decision/application/frozenAt, retained marker and immutable complete snapshot bytes. Old migration history remains; no migration is treated as approval. Missing/forged request, different decision, unpresented snapshot or different bytes still fail closed. Other frozen conflicts and immutable content rules remain. Q43's original internal append code was not captured; W30-07 isolated the real cold-reopen migration difference, while O's fixture directly observed conflict/frozen-conflict for the unapproved shape before the actual decision and hash-mismatch for wrong bytes. No old Q return is backfilled.
308 initial actual migration/card fixture1/1 naturally0;312 final selected two actual tool/regression cases2/2 naturally0, including bad source/snapshot/hash and idempotent finalization.313 final main type0, own diff0, owned0.306 W-only two union diagnostics and310 wrong expectation for the earlier HEAD validator remain preserved;311 corrected exact refusal-layer worker case1/1 naturally0.
Worker preparation no longer requires the literal trunk ref before reading the run. Any non-trunk base must equal that actual pinned run.codeBasis, have isRunGitBases delivery-ref provenance, and pass fresh readRunEvidence with the same run-record SHA. The original current-Active/frozen/module scope, full-tree/metadata checks and final reprepare remain. Only refusal behavior was verified here; actual delivery-backed positive, distinct execution/replacement production, and run transition failure/recovery/replay remain unfinished.

## O37 M0 qualification for professional document preparation
Rapporteur document preparation now requires an exact selected confirmed intent; work-source provenance itself is never confirmation. With an actual product handback, select only one literal same-flow intent-vN path in that verified latest raw report's evidence. Without product report selection, use only matching proposal.intent/roster.intent references in the actual effective complete snapshot. No project-wide latest scan, version fallback, migration approval or inference from role/message text. Product's first intent draft remains available. Missing/ambiguous exact intent fails before issuing a document work-source or task.
Provider public readConfirmedIntentEvidence(projectRoot,exactVersionedPath) returns an ordinary storage stamp(path/version/sha256/confirmationDigest/ledgerDigest) only from the actual frozen intent-confirmed record, unchanged physical bytes, unique real chief request/resolved decision and retained marker/source/original complete snapshot. Work-source persists the intent stamp. Service prepare/record/assigned inspection validate it; original appendGitDocumentPreparationTaskEvent repeats the exact proof inside R9 and joins its current ledger digest with the existing source/run/document CAS. No Interface ledger access, new Model field, approval boolean, execution pin or extra ledger is introduced.
R24 answered.intentConfirmation is consumed in original run-role: actual failed finalize returns the retained raw choice plus pending-recovery/code/message; actual successful freeze and snapshot installation return committed. Pending returns before write-permit issuance. This is a domain result, never downstream work authority.
316/319 main type naturally0;318 actual migrated-confirmation/exact-source plus original first-publication cases2/2 naturally0;320 only affected strengthened byte-drift case1/1 naturally0, not an added independent proof count. The source fixture proves migration alone/wrong version/decision/snapshot/SHA refuse, real chosen source survives an unrelated pending draft, and post-confirmation changed bytes refuse.317 wrong fixture tried other-v3 without its preceding versions and failed ENOENT; preserved, then corrected to legal other-v1 through the real product tool without weakening assertions. Actual private-Chief M0 missing/confirmed routing is for W's affected production-case rechecks; source compilation and storage tests are not substituted for those results. Distinct replacement/BUG execution, actual delivery-backed worker positive and transition recovery remain separate unfinished work.

## O38 closed professional draft notice across transport run boundaries
classifyClosedTaskNotice keeps its existing signature and information-only result. The source task's unique actual close/creator/full actionSource remains distinct from the recipient's old bound task. Same-run rules are unchanged. A cross-run source is recognized only when its chief-created product/rapporteur task retains the exact hash-bound original document-preparation source: same canonical project/flow/target/planningRunId, real source-bound draft and original chief creator. Historical creator-report tuples/raw report hashes are rechecked when present. The old recipient task must genuinely be closed with matching role-direct close operation/creator/run; still-open, missing, unknown or different-flow bindings remain refused. This creates no assignment, write scope, pin, execution authorization or task replay.
326 original parent fixture naturally1/1/CLOSE0: real Service work-source/draft→task→report→creator-close→information classification across a different closed transport run; wrong source/hash/project/open recipient and existing unrelated execution-run negatives remain refused. Ledger bytes are unchanged by classification. This Service-layer fixture uses an explicit trusted upstream host DTO; it does not claim a native picker/private Core or W public positive.323 local unknown narrowing red retained,324/325/327 type naturally0 and final own diff0. W33's first prefix was refused before classifier by root/selection guard, so it supplies no classifier result. The original Service failure now includes the exact three contemporaneous root/selected/registered paths/states/parents/reasons without changing any root guard; late readback is not substituted for the first rejection.

## O39 published team-planning source
Existing prepareRoleDispatch now returns chief→convener published coordination as {kind:planning,purpose:team-planning,flowId,runId:run-plan-*,basisDigest,initializationSource:{sourceId,path,sha256,kind}}. The host input remains actual registration/current chief parent with optional creatorReports. Pipeline checks actual built-in convener and private current accepted Core dispatch/handback identities, before and after preparation. A handback is not relabelled as a customer message. Repository initialization remains only actual customer-message source when no real publication exists; creator reports cannot initialize a repository.
Service requires actual complete published proposal/modules/roster, consistent parsed ownership, existing planning-only version chain and the exact confirmed intent from that publication. It creates only a source-bound real planning draft with empty document slots/null execution, retaining existing active run/pins and granting no execution. The original immutable work-source namespace and two existing TaskWorkSourceRef kinds persist the actual source; no new Model field or authority flag. Original record/inspect and Provider R9 append validate the professional purpose/target/run/source/current document/intent/ledger together. Product/rapporteur document preparation and M0 remain strict. Once this same coordination run legitimately pins, actual complete readRunEvidence allows the still-open built-in controller assignment to continue; no convener project-frozen evidence is fabricated.
330/334 main type naturally0;332 original source/review/write-authority cases3/3 naturally0;333 original team-plan/activation/first-pin cases2/2 naturally0. An earlier snapshot-only planning success expectation was replaced by the new exact no-current-host-source refusal while all following material/activation/pin assertions remain.331 old earlier-refusal wording mismatch is preserved and corrected to the actual source gate. These are affected refusal/regression checks; actual private-Chief published coordination positive remains W34/Q46, not inferred from fixture metadata. Original replacement/run-transition recovery/delivery-backed worker positive/revert remain unfinished.

## O40 typed team-plan task completion — compiled, new production positive pending
Draft close now reads the actual work-source purpose: a team-planning convener report uses typed plan completion; only original purpose-absent initialization uses initialization output. Unknown convener purposes refuse. The typed plan requires the exact latest report's sole plan document, same-task/run/source hash, real published current application operation/ref/process, immutable plan marker/snapshot/hash, original creator and final R9 ledger/run/material CAS. Real workflow completion retains its existing actual stable-source branch and cannot be certified merely by a team plan. Future integration/quality/D3 are not prerequisites for this planning close.
Necessary persisted provenance gap: old plan markers/journals did not identify the actual publication task. New GitRefJournal.publicationTask={taskId,runId,ledgerSha256} is emitted only from the real Service authority into the existing operation journal. Original Provider mutation scope rechecks its bound ledger bytes/open convener task under R9 before publication. No second ledger, new Model field, report self-approval or backfilled old task identity. Exact pure shape is checked by the existing journal reader. Old operations without this provenance remain unproved.
New original Provider public readGitPlanCompletionBasis/appendGitPlanCompletionTaskEvent and Service CreatedTaskCloseBasis.planCommit carry the ordinary verified binding. Final append rereads the actual current plan basis inside the same R9 lock before the existing ledger append.337/338/340 type naturally0,339 selected three refusal regressions naturally3/3/CLOSE0; own diff0/owned0. A genuinely new plan→typed basis→close positive has not yet run: Q47's fresh real producer/caller is the required production positive. No fake legacy receipt/fixture approval was added. Production source is frozen after340 until Q47's bounded natural edge; remaining fresh execution/replacement/revert/transition recovery are not completed by this port.

## O41 fresh execution / replacement implementation key (read-only Q47 window)
1. Existing fresh producer: Chief actual new work source→prepareRoleDispatch(team-planning)→distinct run-plan draft, with W34 preserving its actual run anchor. This can prepare a new execution against unchanged approved requirements/team; no new intent/recruitment is inherently required. Its actual BUG/refactor execution and delivery-code inheritance have not been tested.
2. Existing ensureDraftRun still returns an old pinned same-flow run; it is not a replacement producer. prepareExecutionRun on that pin intentionally returns historical alreadyPinned material. Never mutate/repin it to obtain a fresh code base.
3. Next exact write is original Service createRunChangePort.prepareRunChange: derive a distinct run-restart ID from actual old run/op/current requester creation and requestDigest, persist an idempotent ordinary source-bound draft, then call existing prepareExecutionRun/role boundary checks. Return a host plan only after targetTrunk/Active/D3/eight refs/workflow/current authorization and actual delivery-controller ancestry are proved. No stop/cancel occurs during this preparation.
4. Existing Provider compareAndSwapRunRecord already holds R9 and checks target document/Active/snapshot/Git bases plus sourceTask, but sourceTask presently means the prior delivered-controller lineage. It does not atomically join a separate old-run SHA/current requester. Minimal next ordinary Provider option is runChangeSource{oldRunId,oldSha256,requesterTaskId,requesterDigest,requestDigest}, recorded inside the existing draft source and checked under that lock, not a Model approval or second ledger. Same operation/source replays the same draft; changed request rejects.
5. Existing Service requester check requires task.runId===old run. A real rapporteur in a new document-preparation task is therefore blocked even for the same flow. Any next narrow control path must verify its real source purpose/M0/current assignment and actual private select_run_change invocation; role name/Model fields alone do not authorize another run. Old task cancellation and target drift invalidate preparation.
6. Existing W handle wrapper calls prepareRunChange(projectRoot,request,actual origin.taskId) without replacementRunId. Let Service generate the real replacement; W never invents it. Reuse returned exact handles/fence/native stopAndInspect/finite manager cutoff and finalizeRunChange of the original operation. A requester inside the old stop set must first return deferred and continue only after its actual turn settles; unknown SDK/instance/process/producers remain blocked.
7. Existing readExecutionBases freezes actual delivery code and current document Git source independently, and expectedCodeSourceTask preserves true accepted delivery lineage. Current worker commit already accepts only the exact pinned delivery-ref source with fresh immutable proof/current module intersection. Neither path may refill an old pin from later live documents or silently switch its code basis.
8. Necessary tests remain in original Git/direct files: actual new approved-source BUG context reuses eight refs and inherited unchanged code; restart missing target stops nothing; real DefaultChat deferred stop/drain/fence/cutoff→same-op commit; cancellation/target or instance drift rejects; injected cross-file failure stays pending and same-op recovery never fabricates applied; unknown engine/process stays blocked. Use genuine production source/approval/ref producers, not seeded receipts or prepared IDs.
9. This checkpoint changes only this API/memo. Production/tests unchanged, no test/Node process started, owned0. O40 Q47 source freeze remains intact. No new R field/source file/interface permission is required for this preparation; actual implementation waits for Scheduler to release the Q window or prioritize its next real gap.


## O43 Chief final-review and controller-resume compiled port
- Ordinary Chief five-builtin dispatch/report-only close stays separate from effect authority. Existing completed operations keep their real creator. Real pinned execution controllers and explicit final review cannot degrade to report-only.
- `Pipeline.prepareRoleDispatch({projectRoot,fromRoleId:"chief",targetRoleId:"verifier",flowId,reviewTarget,hostInitialization})` first verifies the private current Chief dispatch/registered builtin. Service resolves the actual integration journal/controller, open assigned task, frozen run, original accepted implementation results and actual frozen proposal Git blob. Returns `kind:"review",purpose:"builtin-preparation",hubRouting:"chief-hub-v1",flowId,runId,initializationSource,reviewBasisRef,reviewControllerRef`; no worker `parentTaskRef` or module grant. Review uses the real controller pin, not a fabricated new execution draft.
- `recordTaskObservation` compares both refs with the immutable Chief source, rederives real material, then original Provider candidate append rechecks actual journal/criteria/source file, complete ledger digest and run SHA under R9. `inspectAssignedTask` / `readAssignedReviewContext` recognize Chief final review and keep legacy creator/parent reads. Closed review history is separately revalidated for delivery; it never reopens the review task.
- `Pipeline.prepareControllerResume({projectRoot,resumeController,hostInitialization})` consumes R25 exact expected `{taskId,flowId,runId,reviewTaskId,reviewCloseOperationId}`. Returns ordinary `ok.value={taskId,actorRoleId:"convener",flowId,runId,reviewTaskId,reviewCloseOperationId,resumeKey,basisDigest}` or failure. Actual current Chief source, Chief-created quality task, mechanical quality evidence, exact Chief accepted close and still-open original controller/pin are required. Final R9 read checks complete ledger/run/material/journal freshness. W must fresh-check before exact existing-task enqueue and prove real ACK/dedup; this method creates/closes no task.
- Accepted-quality resume is final-delivery continuation only. Failed/blocked review returns Chief for real rework; it does not need an accepted-review ticket to request ordinary legitimate repair.
- Delivery and overall controller close now match the actual Chief review's independent controller reference and original Chief close, while unmarked historical Convener-child creator facts remain unchanged. Publish still requires current Active/frozen module authority, real host lease/G/ref CAS. Overall controller acceptance still requires actual delivery journal/ref, not quality alone.
- No new R/G/W source, external schema, file, permission or approval ledger. R25 fields suffice. Production consumer/W final review/resume and full NEW positive remain pending.
- Evidence: 356/358/361 main type natural CLOSE0. 360 three review/delivery refusal cases natural3/3; 362 final new refusal case natural1/1 after final guard patch (not additive). 359 sandbox temp atomic-rename EPERM original preserved. 349 report-only Service positive, 354 actual default Chat draft/late Git drift and 355 original Provider freshness remain component evidence. Tiny conservative bare-association absence probe followed by 363 relevant Provider case natural1/1. No complete Chief review/resume/publish E2E is claimed.


## O44 delayed controller-resume freshness
`Pipeline.inspectQueuedControllerResume({projectRoot,resumeController:R25ExactFive,resumeKey,basisDigest})` returns the same factual ControllerResumePreparation or failure. Initial `prepareControllerResume` still requires the actual current Chief dispatch; only its successful, post-await private recheck registers root/canonical exact tuple/receipt in this Pipeline process. A copied expected tuple/hash without that actual acceptance fails. The delayed inspector does not require Chief turn liveness. Process restart without an admitted source fails closed; no queue ledger or Model permission token is added.
Service repeats actual open controller/run/pin, Chief-created review/controller relation, exact actual accepted review close, frozen criteria and mechanical quality bytes. The current final integration must be unique for this controller; the set and selected journal are read again under R9, so an obsolete CID cannot silently continue. Current Active/frozen module/path permission intersection and authorization bytes are rechecked, then complete ledger/run/current manifest/material bytes are compared at the same lock boundary.
The receipt basis omits unrelated global ledger/task-progress digests but retains exact quality/CID/pin/source bytes; fresh ledger/run checks still occur each inspection. Chief prompt natural completion alone does not revoke accepted work; closed/cancelled controller or changed real quality/source/current permissions refuses. W owns host queue item provenance, duplicate suppression, final dequeue inspection and real ACK; this API neither sends nor reopens a task. Busy/late positive, old-CID/cancellation full production races remain for W/Q actual integration; they are not proved by the rejection fixture.
Evidence366 type0;367 and369 same expanded refusal fixture1/1 naturally EXIT/CLOSE0 (not additive).368 original external QA strict-null diagnostic preserved, O source0 diagnostics;370 final main type naturally0. No new R field or W source write.


## O45 task lifecycle receipt is not document-effect fanout
Q50 actual source bytes/hash identify a closed Chief-created Product builtin-preparation draft distinct from its transport's old closed Init Convener assignment. Static and runtime evidence agree the generic DirectRoleRuntime.notify unconditionally broadcast every close to Chief/Convener/actor as an application document update. A report-only task close changes task state, not document or execution permission; the actual creator already receives the real tool receipt, and durable task.closed/source remains visible through existing UI ledger reads.
`createDirectRoleRuntime.closeCreatedTask` now returns the actual Service receipt directly and does not call the generic model-notification sink. No task, creator, report, source, run or queue is rewritten. CompleteTeamPlan/activation/run-change and actual version/document/permission effect notification code is unchanged. No W field/API or transport-source override is added. The tentative new hub-purpose classifier exception was removed; the existing classifier implementation exactly retains pre-O45 Service SHA D7C3CB4D…84264E4 and unknown/history refusals. Q50 remains its original failed evidence.
375 real Service/Provider lifecycle and Pipeline receipt regressions4/4 natural CLOSE0, including all five ordinary builtin reports, both original creators, stale material/CAS and existing notice/source/open-bound negatives.376 existing real version-publication and lost notification ACK cases2/2 natural CLOSE0 prove real effect fanout and recovery remain.377 current main type natural0; owned0. The new production prefix must be checked by Q51; no old failure is relabeled green.


## O46 committed effect information versus closed transport assignment
Activation keeps real effect fanout. The actual Service direct authority task/run and exact ledger-file SHA now use existing GitRefJournal.publicationTask, committed by original Active mutation R9 after verifying the same open publisher task/actor/flow and expected ledger bytes. No new Model field/ledger is introduced; old Q51 history is not backfilled.
The original classifier input/output is unchanged. For activation and team-plan only, the new reader requires one settled published Git journal/process exit0, exact full role-direct source/app/journal/op/target, ancestry-backed immutable original manifest/snapshot, exact activation8refs/active target or plan target, real publication task and original append-only ledger prefix SHA, actual builtin source/hash/root/run where marked, and an actually closed same-flow recipient transport task with original creator receipt. The source task may be open or later closed; it never becomes the recipient's assignment. Output information-only only retires this host effect fact; no task/delivery/tool or execution authority is created. Missing historical binding, changed source/digest, unknown/business reports fail closed. W existing host-source system branch consumes the same ordinary result; no W source change.
No-op already-active/unchanged operations return truthful receipts and do not fan out a new permission change; original committed-operation replay retains keyed dedup.
Current source-family mapping: (1) task.close lifecycle has no model broadcast (O45); legacy already queued close facts keep old strict classifier. (2) actual activation uses new task-bound Git/8ref/active receipt. (3) actual team-plan uses its existing task-bound Git full snapshot/ref receipt. (4) actual document/version fanout remains untouched; this new effect reader does not claim its distinct VCA source is supported. (5) run-change fanout remains untouched; actual stop/native/queue receipt still governs the effect, and unsupported effect-notice sources fail closed rather than being relabeled activation/close.
380/382 main type naturally0;381 relevant plan/activation/noop + original parent/classifier/unknown-source + version lost-ACK regression3/3 natural CLOSE0. This is component regression, not proof of the new Git activation publicationTask→cross-run information positive; Q52 must run the actual fresh public producer.379 initial local compile diagnostic was corrected at its exact source; Q51 original failure/root remains untouched.


## O47 actual run schema envelope production
Q52 persisted hub run is actual pinned ans-run/v1 with six frozen documents/eight role refs/Git code-document sources, but lacked `schemas`. The unchanged pure validateRunManifest requires this object; W had only the aggregate worker-freeze-return-invalid and private frozen.run was not sampled, so the persisted observation is not backfilled as a private trace. Public freezeExecutionRun returns pinExecutionRun→readRunEvidence.run without projection.
Original schemas is a declaration map and is only structurally checked here; it is not approval or permission. New hub/document-preparation drafts now declare `{run:"ans-run/v1"}` for their own actual envelope. A first new pin preserves real existing string declarations and declares `schemas.run=raw.schema`, after that actual schema was checked. Malformed existing declarations refuse. No future document schema, flow, D3, Active, workflow, Git basis or authority is invented. The old already-pinned branch does not fill or rewrite missing schemas. Original common validator, Model and return signature unchanged.
385 genuine original component2/2 natural CLOSE0: actual new hub draft passes unchanged validator; original real plan/activation/workflow/new-pin public return passes full validator and equals persisted bytes/value, missing declarations/wrong run schema refuse, existing eight-ref/frozen/current permissions/worker-parent checks remain.386 current main type natural0; owned0/diff0. Actual full Desktop first worker remains Q53's fresh entry positive, not replaced by these component checks.


## O48 current I5 follow-up key — read-only Q53 window
1. New Chief-issued `run-hub` plus actual `schemas.run` can now become a real new execution pin; Q53 reportedly crossed worker creation. This supplies neither restart nor a stop receipt; ordinary fresh-run success is not three-mode acceptance.
2. Next actual writer remains `apply-journal.ts:createRunChangePort.prepareRunChange` (1385): it still requires an externally supplied distinct replacementRunId (1401) and requester.runId===old run (1397). A real new Hub Rapporteur task is a different draft and currently cannot request that old-run transition.
3. Original Provider abstract `compareAndSwapRunRecord.expectedBasis` has only document/Active/snapshot/Git/code-source-task facts; the required separate `runChangeSource{oldRunId,oldSha256,requesterTaskId,requesterDigest,requestDigest}` join is still absent. Existing sourceTask means prior delivered-controller lineage and must not be repurposed.
4. Derive replacement from actual oldrun/op/current requester/source/request digest, idempotently persist a distinct source-bound draft with its true run envelope, then original prepareExecutionRun verifies target eight refs/D3/Active/workflow/current grants and independent delivery-code/document bases before old actors are stopped. Old pin is never widened or refilled.
5. New Hub requester qualification must verify actual Chief source/current assigned task/same flow/applicable requested target/effect authority; generic builtin routing is not M0 or run-stop authority. The former documentPreparation-only shortcut is insufficient for I5 builtinPreparation sources.
6. Existing prepareRunChange/finalizeRunChange/W host fence, exact handles, real stopAndInspect and finite persistence cutoff remain reusable; self-caller defers until its real tool/turn settles and resumes the same operation. DefaultChat actual terminal/drain and failure/recovery/replay/cancel races still require production tests; unknown SDK remains blocked.
7. candidate.revert still reaches `GitCapabilityService.candidate` generic `git-protection-closure-unproven` at git-capabilities.ts481; Pipeline has prepared paths for init/commit/integrate, not a prepared revert mutation. Existing request already supplies base/commit/mainline/message; no new R request field is presently needed.
8. Reuse original git-candidate-store readCommit/listTree/readBlob/plan/prepareObjects and original git-ref publish CAS/journal: compute selected commit versus exact chosen parent inverse changes, apply to the actual pinned current basis, preserve every unchanged tree entry, and produce a new owned candidate without an index or delivery publication.
9. Merge needs a valid explicit existing mainline parent; invalid parent/format/object, missing original bytes, inverse conflict against changed current content, ambiguous mode/rename, metadata or cross-owner changes refuse. Expected base must equal actual pinned run codeBasis with current Active/frozen module grants; ordinary read OID membership is never mutation authority.
10. G has legacy revert template/argv rules, but this does not prove a new raw planned inverse-tree consumer is supported; any exact ordinary raw-plan delta belongs to original G before mutation can be admitted. Actual local candidate/ref CAS and same-op replay/process proof are still required.
11. Narrow IO residual: fs-version-change-store.ts380/409 still installs the G stable permit snapshot; stable-write-service.ts121 invokes that Provider effect. Original permits.list data should move to an upper Pipeline install consumer, without Provider callbacks.
12. shell-post-audit.ts416 still calls effectful baselineShaFor; actual reads belong in original shell-arming/run-role Pipeline via existing G13 Service facts, common audit pure input. run-role.ts1173/1618 still has legacy versionedDocExists calls; staged managed final facts already avoid the first call when present. No broader cleanup is included.
13. This update is API/memo only: production/test execution sources0 edits, no tests/Node processes started, owned0. Q53 freeze remains until Scheduler actual RELEASE; any new real first gap takes priority.


## O49 verified final-review work-source result
`inspectAssignedTask` successful final-review result now includes its actual TaskCreated.workSourceRef after readAssignedReviewContext has validated immutable source bytes/hash/root/flow, reviewBasisRef and independent reviewControllerRef/controller material. Previously this branch returned no workSourceRef, while W preenqueue correctly compared expected actual sourceId/SHA. Q53 actual persisted source/refs plus W postrun readback(ok:true/kindreview/no ref) identify this return-contract omission; neither postrun observation fills the unsampled private original return.
No creator/parent/route/authority/fresh check changes. Historical legacy review without workSourceRef keeps absence; no synthetic reference.388 current main type natural0;389 original actual missing-proof/review/source/queue refusal tests2/2 natural CLOSE0. Full fresh positive remains Q54 actual public entry; optional W post-fix readback is separate component evidence. Q53 failure/root preserved.


## O50 resume proof media correction
The former R9 loop combined physical quality/Chief-source files with authorization files read from actual Active snapshots, then required all paths through readProjectFile. That method reads physical worktree files even for Git media; `.ans/role-evidence/authorization-impl.json` need not be projected there.396 records Q54 postrun read-only facts: actual quality and Chief-source hashes equal their references; activation journal references authorization SHA20255f5f…70c8ac9 in its real snapshot, while that physical path is absent. This is not an original private-loop trace, and no Q history is rewritten.
Resume now separates origins: live quality/source files retain physical hash checks; current manifest/Active identity and frozen grant intersection retain checks, and inside the same R9 it rereads Active evidence via Provider readActiveRoleEvidence, checks the exact reference and authorization blob SHA plus recomputed bytes hash. Missing/changed snapshot/ref/authorization still refuses. No path-prefix skipping, new worktree copy, stamp refresh or Model authority is introduced. Live-file failures now include bounded category/path/expected/actual SHA or read reason; snapshot failures similarly identify the real source without artifact content.
393 real activation/pin component1/1 natural0 proves valid immutable authorization has no physical projection and wrong authorization SHA is rejected;394 original missing-quality/resume proofs2/2 natural0;395 main type0. Full actual Chief accepted review→prepare→busy/idle resume positive and real concurrent quality/current-Active drift remain Q55 fresh producer coverage, not claimed by the component fixture.


## O51 owned lease/open admission checkpoint
1. Runtime Service withCoreOpenLease(session.ts223) begins an actual session-open lease and fails busy before its native factory/bind callback if any owner lease remains. O does not allow nested dispatch leases or clear unknown open-failure inventory.
2. W resume holds dispatch lease around fresh prepare/enqueue, ends it in finally and starts drain afterwards. Provider endGitHostAction records the supplied inventory first; same-revision content conflict returns without releasing that actual lease. stableInventory excludes only observedAt, so queue/persistence facts all participate. Ignoring the result can therefore leave a real owner fence. Q55's original leaseId/end result was not sampled; this is a source-backed mechanism, not a reconstructed private trace.
3. R bindPreparedRole consumes the real preparation token then enters the open lease. Failure revokes the same provider and binds the same actual error; O catches/discards actual preparation and preserves private same-error/same-host evidence. Only genuine never-started or same-instance terminal facts satisfy O's existing checker; busy/error text or absent PID cannot upgrade unknown factory effects.
4.398 actual Provider test allocates an owner lease, submits changed same-rev inventory, observes exact revision-conflict and retained lease/next-open busy, then releases only with the original owner and fresh revision.1/1 natural CLOSE0;399 main type0; diff0/owned0. No production change, Model delta or new authorization port.
5. W42 owns Desktop revision/producer/enqueue/end-result proof and necessary caller correction; actual Desktop repro/source may still be in flight. This Provider test is not Q55's first-error proof, nor a complete resume or cleanup success. No generic lease retry/release or failed-controller inventory retirement was added.


## O52 post-NEW Hub run-change implementation key (read-only CHANGE seed window)
1. Next writer remains original `createRunChangePort.prepareRunChange`(1385): actual I5 Chief-created Rapporteur builtinPreparation task must select a same-flow old delivered execution run using real source/current assignment/effect evidence, but current1397 requires requester.runId===oldrun and rejects the real fresh DocRun. No role-name or generic hub-route exemption.
2. Actual restart still requires caller replacementRunId1401; W selectRunChangeForHandle1420 supplies only request+actual origin.taskId. Service must derive the same distinct replacement from oldrun/op/requester/source/requestDigest, persist an actual schema-declared draft and prepare its full target before any old stop. Return existing PreparedRunChange/RunChangeHostPlan, not an invented run ID or preparation stamp.
3. Original O Provider expectedBasis still needs the independent ordinary `runChangeSource{oldRunId,oldSha256,requesterTaskId,requesterDigest,requestDigest}` join under R9. Existing sourceTask means verified delivery lineage; it is not the requester. Old pin/ref/source/complete unchanged tree remain immutable; target uses actual independent delivered-code and current frozen-document sources.
4. Continue-frozen currently follows original selectRunChange→same-old-run CAS/history and does not repin; stop/restart use W real handles/fence/native stopAndInspect/finite queue cutoff→same-op final R9. NEW fresh worker/publish success proves none of these stop/restart or partial-recovery races.
5. Necessary original Git/direct test cases: real new Hub Rapporteur references oldrun without oldrun task spoofing; missing target stops nothing; same request reuses one real replacement; changed requester/target/old SHA/cancel rejects; all target8refs/Active/D3/workflow/current grants checked before stop; real host drain permits only same-op finalization; partial cross-file outcome stays pending and verified replay does not invent applied. No test source/execution was added in this preparation.
6. Revert remains generic candidate fallback git-capabilities.ts481; existing Model base/commit/mainline/message and original Provider readCommit/tree/blob/plan/prepareObjects/refCAS are available, actual inverse/conflict/owner/current-grant/raw-plan consumer remains unimplemented. Narrow IO remains original fs-version-change-store380/409 permit installation→stable-write-service121 and common shell-post-audit416 baseline IO/run-role legacy versionedDocExists; do not expand those while CHANGE first gap is pending.
7. Production/tests0 edits, no tests/Node started, owned0. Service A6E450A8…1C3BD unchanged. Q56 NEW/strict drain reportedly passed; its original evidence is not relabeled three-mode/revert proof. Current CHANGE seed source matching preserved pending S actual release/first gap.


## O53 source-bound restart target producer
- Original Pipeline `prepareRunChange({projectRoot,request,requesterTaskId,replacementRunId?})` input and W host plan remain. Service now recognizes a different actual Chief-created Rapporteur Hub draft through inspectAssignedTask/source bytes/same-flow identity; the exact selected target proposal/roster must resolve a genuinely confirmed intent. Generic hub routing is not effect approval; unrelated draft selection/latest/title/sideEffect does not grant it. Same-old-run legacy requester retains its real original identity.
- Service derives `run-restart-<SHA(oldRun,operation,requester)>`, persists a real schema-declared draft with runChangeOperationId and `runChangeSource`, then original prepareExecutionRun verifies real target workflow/plan/Active/D3/eight refs/current authorization and independent code/document Git bases. No caller invented ID is accepted. Same operation/source/request reuses that exact draft; changed request/source conflicts. If preparation fails, old run is untouched and no stop is issued. An unused unpinned draft may remain as actual preparation state, never claimed ready/applied.
- Existing Provider public ordinary `RunChangeSource={oldRunId,oldSha256,requesterTaskId,requesterDigest,requestDigest}` is carried in original expectedBasis and commitRunTransition. requesterDigest hashes the unique actual task.created bytes; natural subsequent reports are not cancellation. FS/Git CAS under original R9 checks old record SHA/state/flow and requester open creation/source/current requester run. Changed/closed requester or source/hash refuses. Existing sourceTask remains delivered-controller lineage, separate from requester provenance.
- Before returning private PreparedRunChange, Service reacquires R9 and compares actual old bytes/whole ledger/source file/executable target manifest/Active/snapshot. Ordinary freeze refuses to pin a run-change target before actual old stop. Existing W handles/fence/Core-native drain/finite persistence cutoff and original same-op finalize are still required; Provider transition checks requester/source again at each fenced write boundary. No new Model field, permission token, ledger, source file or Provider upward call.
- Final411 main type0 and412 original two actual plan/activation/workflow/pin components2/2 naturally CLOSE0. They exercise distinct real restart draft, same-op replay, changed request/false caller-ID refusal, missing target/new-plan-without-activation no-stop, premature-pin refusal, a real distinct Hub requester reaching missing-M0 effect refusal, Provider independent Hub/old-run CAS success and real Chief-close invalidation. Component source hashes now include newly touched FS Provider. These are not true native stop/final-transition or Git-delivery-backed complete CHANGE positives; those remain Q57 production evidence.
- 402 initial expected-positive red was a genuinely unactivated next-plan target and correctly refused; fixture now explicitly tests that refusal and separately its actual existing-workflow target.404 initial demo open was correctly rejected after a real managed Hub source was issued; existing unmanaged demo assertions now run before the managed source stage. Original logs retained; no gate/approval weakened. Cross-file partial recovery, restart after process restart/unknown SDK and four-route end-to-end remain unfinished. Revert and reserved IO migration remain unchanged.


## O54 publishing-task process source versus repository init history
Actual Q58 init record points to Chief05720b4c…acd3; actual Product task/source points to Chiefa5e8e896…e39d. The prior common executeGitBusinessPublication producer read only readGitInitializationTaskBasis(flow) and used that historical parent for every direct/plan/activation mutation's current-process check. The current Product source being present could not satisfy that different comparison. Private original prepared context was not sampled; no old-process termination is inferred.
PreparedDirectAuthority now returns ordinary `processSource:{parentCoreSessionId,workSourceRef}` from the actual unique open publishing task, owner/action/flow/run and its original immutable Chief input source. Root, source kind/hash, target role/run/purpose and Hub run binding must match; missing source refuses instead of borrowing latest/init. The actual source file joins expectedFiles/authorizationDigest so original fresh prepare, G policy binding and Provider R9 recheck its exact bytes along with task/run/current permission facts.
Common direct/plan/activation Pipeline retains settled repo-init proof as repository history, then obtains this current-action authority before mutation admission and uses its source parent for original all-app Core/native/inventory/failed-attempt/root closure. No condition claiming old init actors are stopped is introduced; unknown current app-owned actors and unsupported programs still refuse. No W/R field/API or Model permission token.
416 existing real Git storage fixture1/1 naturally0 verifies distinct current parent versus init parent, actual source/hash output, wrong task/missing source/parent-byte drift and stale content-bound verdict rejection, then fresh actual G/R9 publication. It is a Service/Provider storage component, not actual private Chief or all historical-process termination proof.417 current main type0;414 external QA redispatch type red and415 stale-verdict fixture red remain preserved with exact correction.
Known separate callers still explicitly use original initialization parent: worker/integration candidate, delivery, stable initial-workflow and run-change protection contexts. They were not silently generalized or claimed fixed by this current common-business publication patch; each requires its real action-source binding in follow-up. Q59 Product branch is the necessary public entry positive.

## O55 current-action provenance / O56 committed replacement selection
- Existing Service `readTaskProcessSource({taskId,actorRoleId,flowId,runId})` returns ordinary actual-task provenance `{taskId,sourceAssignmentTaskId,parentCoreSessionId,workSourceRef,expectedFiles}`. The source assignment is that actual Chief-created task; a worker follows only its real persisted parentTaskRef to the open same-flow/same-run Convener. This does not reuse Model sourceTaskId or confer a permission. Exact source/root/role/run/kind/hash and Hub source association must match. No-repository root facts may describe provenance but cannot supply initialization/mutation authority.
- Stable initial-workflow now gets original private DirectAuthority before admission and uses its current task processSource. Worker/integration/delivery preparations include real processSource in authorization revision/request digest and reprepare inside the original R9 before effects. Run-change preparations retain the real requester source separately from selected old execution; Pipeline refuses absent source and final Service rechecks immutable requester identity/ref/parent. Settled repository initialization remains historical proof, never the default current-action parent. Original whole-app registry/native/unknown/metadata/lease checks remain; a missing historical parent is not evidence that its programs stopped.
- Chief Hub dispatch stays ordinary planning for a customer turn or report with no actual mode result. Only the current real Rapporteur report may select its own unique actually committed stop-and-restart. Service reads original requester creation/report hash, cancelled old run and applied receipt/source/op/target, replacement runChangeSource, complete pinned replacement/code/document/eight refs and current target/Active. No latest-run choice, report summary parse, Model replacement id or caller receipt grants this selection.
- Original prepareRoleDispatch then returns `kind:'execution',purpose:'builtin-preparation',hubRouting:'chief-hub-v1',flowId,runId:actualReplacement,basisDigest,initializationSource`. Its immutable source contains exact executionRunSelection. The replacement pin is not rewritten to attach a new Chief/source marker. W accepts this only for actual Chief→Convener creator-report and creates pinned Task identity; initial/final fresh result must agree. New customer input alone does not silently select an old replacement; cross-turn explicit selection remains unsupported by this ordinary schema.
- Record/inspect/process provenance recheck that immutable selection. Original Provider R9 task append additionally checks old/new run bytes, ledger, actual document target and Active; future reads preserve already-selected frozen documents while still checking real current action permission at effect gates. Closed/cancelled target or source mutation refuses. Actual live controller/worker closure, independent quality and accepted-review/publish ordering remain unchanged.
- 421 current-source storage1/1, then latest426 affected five components5/5 naturally CLOSE0; latest425 main type0. Components prove exact provenance/rejection and ordinary-report-no-execution behavior, not a fabricated committed restart. Full same-owned-child native stop→actual mode receipt→replacement dispatch/worker remains Q61 necessary positive; ambiguous committed operations/actual competing target mutation are not claimed covered. Old420 QA two unknown-union diagnostics retained, fixed by original QA owner before425. No new Model field, source path, ledger or role.

## O57 committed publication after same-byte migration
Q61 actual refs/ans/trunk79142296…932a8c/t3 was committed; six exact v2 documents already had application/migration freezes. This was not a version-key collision. Original metadata appender correctly refused a different receipt until it had actual committed evidence; the M0-confirmation exception did not cover published effects. Actual Q61 private first-path was not sampled; the stored target and records retain the exact tuples.
Trunk Provider `readCommittedFreezeBasis(journal)` now performs original native effective-ref ancestry/manifest/snapshot verification under R9 and returns ordinary canonical-root/operation-file hash/source/snapshot/actual commit OID+raw bytes. Service passes that result through the original Registry append optional evidence parameter. Registry reacquires R9, verifies protected journal/snapshot paths including symlink/hardlink refusal, exact bytes/hash, published/process0/source/target and commit object hash/tree, and exact path/version/SHA. Only retained application/migration at the exact same tuple may gain a real role-direct-applied history row; no Model input, general overwrite, M0 approval or modified old row.
`finalizeCommittedMetadata(journal,proof)` is a separate bounded Provider settlement: actual native commit/source/operation bytes and formal effect-freeze rows must still match. Only phase/result/updatedAt may advance on the existing operation. It never grants readOnly writeOperation/ref/manifest/object/task mutation. Service uses it to settle verified Git recovery; FS and unsupported proof paths retain existing behavior. Wrong proof/source/tuple or missing formal freeze remains pending, not applied.
436 four real Git/FS recovery components naturally4/4; 438 final type0/diff0. Tests use actual app initializer migration and real Git commit; injected omission of committed proof first preserves pending, wrong operation/root/source/snapshot/hash/commit bytes/tuple and hardlink refuse without changing migration history, real recovery appends one true effect row and settles idempotently with refs and old run unchanged. 431/432/434 failures retained: 432 isolated the existing readOnly settlement seam; 434 found missing await before R9 release, corrected before435/436. The last malformed-proof input guard after436 is compiled by438; full same-child NEW→CHANGE publication remains Q62 independent evidence, not relabeled green.

## O59 phase 1 raw Git type consumption
Provider existing public names GitTreeEntry/GitStoredCommit/GitCandidateInput/GitCandidatePlan are aliases of Model GitRawTreeEntry/GitRawStoredCommit/GitRawObjectInput/GitRawObjectPlan. Public old-name exports remain; nullable raw old/new OIDs, R/C/T diffs, string mode observations and optional revertBasis are no longer redeclared inconsistently. No request schema, field issuer, operational permission or business mutation changes. listTree retains the existing explicit unsupported-mode throw, not a partial tree advertised complete; removing its obsolete literal type cast changes no parsing. candidate.revert remains blocked pending real producer/policy implementation.440 main type0/diff0;441 original real SHA1/256 candidate complete-tree/index-isolation components2/2 natural CLOSE0. This is type-consumer alignment, not revert acceptance or special-mode effect support.


## Revert stage 2 — current candidate, review and delivery consumer checkpoint
Original Provider planRevert reads real target/selected parent/current code raw commits and full trees, computes exact inverse paths, preserves unrelated current code and rejects current-entry or file/directory conflicts. Service prepareRevert binds a real open Chief-created Convener/controller to its original pinned codeBasis, actual target ancestry, and current Active intersected with frozen module ownership. ownerGrants are canonical sorted real owner/path/evidence DTOs; scopeDigest=canonicalSHA(ownerGrants). No worker contributor/accepted receipt is invented.
Original Pipeline gitCandidate(revert) can prepare/freeze an actual assigned Convener draft after registered live Core/tool identity, complete workflow/8refs/D3/Active and G role-document checks, and exact expected codeBasis, before candidate effects. It never dispatches a dummy worker. Draft Convener queries return the actual prospective code basis as ordinary read data without fabricated assigned-run pinDigest; after real pin, assigned-run query facts become available. Target must be a real same-repository ancestor of the immutable code basis, not a log string permission.
Original readReviewMaterial/Chief final review, bounded text-quality digest, verified delivery, accepted review resume/queued recheck, controller overall close and later code-source inheritance each distinguish run-integration from real run-revert. Revert reproduces native inverse candidate from original task time/actual commit message, three raw object/tree facts, source.files SHA/null and actual scope digest. Current owner grants are rechecked at review/resume/delivery; integration retains its actual accepted-worker loop. G delivery uses real ref-only plan and the same source union, single parent=currentbase and exact ownerGrants-to-integrationGrants(target). Quality remains actual CID/frozen criteria/blob/evidence/Chief acceptance; unsupported criteria remain blocked.
458/459/462 full types naturally0;460 four Service/Pipeline authority refusal cases4/4;461 SHA1/256 real native candidate/collision components2/2;463 actual read-only Hub/legacy provenance2/2, natural EXIT/CLOSE0, no owned process. These are not a real Service revert candidate/final-quality/publish positive; that remains the real Q entry. Current source/hash record:464-O-revert-review-delivery-checkpoint.json.
Reserved narrow IO: Provider StableWritePermitStore still owns an upward Gate install callback. The required legitimate next mouth is Gate Service installStableWritePermitSnapshot(root, ordinary permits), Service readPermitSnapshot(list data), Pipeline install after approve/consume/fail and host initialization. Common shell-post-audit still has legacy FS and baseline effects; do not declare it pure merely by switching one baseline reader. No IO source was changed in this checkpoint.


## Permit IO narrow handoff — 470 actual frozen
Provider stable permit store now exposes list/upsert/readRaw only: old Gate private import and installation callback/options are removed. Service readPermitSnapshot returns ordinary cloned currently applicable permits joined to actual approved request/permit identity, role/path/kind/base/target and TTL, with permitId deduplication. It performs no Gate installation. The production integration passes its real storage root as ordinary Service data, not a permission.
Pipeline refreshStableWritePermitSnapshot({projectRoot,now?}):Promise<StableWritePermit[]> creates the real root-bound Service, checks its root against the installation root and calls Gate Service public installStableWritePermitSnapshot. Read/root failures clear that project's old snapshot and surface the failure. stable-write-runtime finally refreshes after approve/reject/consume/fail, including failed/early-return outcomes; its existing candidate lookup is only a projection. Optional explicit projectRoot is preferred; prior production callers may use actual Service.projectRoot during host migration. W initializes/rebuilds via public Pipeline and keeps only the returned applicable-permit lookup.
468 original three files26/26 natural EXIT/CLOSE0, 469 main type0/scoped diffcheck0/owned0. Tests cover real approval Gate allow then consumption deny, failure invalidation, ordinary-list cloning/filtering/TTL, actual cross-project binding refusal and persistence with no Provider callback.467 old exact-method whitelist red remains; only newly legitimate readPermitSnapshot was added to that assertion. The optional deprecated Service-port installSnapshot signature is retained solely to type the existing read-only fixture; it is never invoked and is absent from the production Provider. No fixture helper was changed.
470-O-permit-io-frozen-source.json records actual current sources/hashes and bounded command metadata. Source is ACTUAL FROZEN pending S single GO Q73 and remains frozen until actual EXIT/CLOSE plus explicit RELEASE. Revert full Service/Chief quality/resume/delivery positive still awaits Q; shell-post-audit baseline/current-file and other legacy audit IO are unchanged remaining work.


## Controller stop minimal compiled handoff — 472
Pipeline prepareControllerStop({projectRoot,taskId,chiefCoreSessionId,chiefTurnId}) checks actual current private managed Chief terminate invocation and maps Service exact open Chief-created Convener task/run/source expectations onto actual task-bound Core/native handles. ControllerStopHostPlan is ordinary expected data, with deterministic operation/request digest and original inventory revision; no authority map or new ledger. Missing/unknown task/source/defaultCore/native identity refuses.
Service prepareControllerStop/confirmControllerStop are public through original Trunk service; confirm reacquires R9 and compares actual task/report/whole-ledger/run/source against the original scope. Drift requires an explicit fresh prepare; it never updates stamps, fabricates role reports, closes tasks or cancels/pins a run.
Pipeline finalizeControllerStop({projectRoot,plan,hostLeaseId},signal?) requires real session-dispose lease, same current Chief invocation, fresh host inventory.controllerStops exact task/operation/request/handles with generation and target-only known producer counts, current committed queue cutoff and original Core/native sealed complete quiescent/process-terminal facts. It then performs Service R9 source confirmation and final caller/coordinator/lease freshness observation. This does not claim whole-run stop. W alone performs real handle stop/drain/fence/cutoff and publishes these ordinary facts; it must not synthesize a Convener failed report.
471 main type naturally EXIT/CLOSE0 (wrapper21964/child21052,180s untriggered), scoped diffcheck0/owned0. No behavioral stop positive or W producer proved; exact source/late-report/cancel/wrong-instance/unknown/fence tests and actual W composite remain required. Original pending shell-audit Provider is not created. Source/hash is frozen at472-O-controller-stop-compiled-frozen.json for original W owner handoff; no test/source work proceeds until explicit followup.


## O477 original workflow/stable pending test maintenance — 483
Two authorized existing test files only; production unchanged.477 captured current real default Core callback calls=1, original model taskId spoof refusal and actual request accepted, followed by stable-write-invalid because the old direct Service approval fixture never installed the new Pipeline-owned permit snapshot. This does not explain or overwrite Q97 prior calls=0 without tool reply.479 then passes after original approval calls public refreshStableWritePermitSnapshot; actual source precedes guarded write, one physical workflow write and real consumption/empty refreshed snapshot remain asserted. Failed callback-count assertion now permanently includes real safe tool replies/task/run/Core fields; optional separate evidence output preserves raw replies for this diagnostic.
trunk-runtime expected pending result now keeps actual stable-manifest-unavailable/missing diagnostic fields; original mini-repin/no version bump/no spurious event assertions remain.478 single1/1, then480 and final482 complete two-file20/20 natural EXIT/CLOSE0, scoped diffcheck0/owned0; no behavior assertion removed.481 only external W52 ProcessEnv typing red retained, later fixed and type0 reported by original W owner/S; no cross-write or repeated global polling. W52 test in flight is a nondependency change, so this is not global freeze/T3 acceptance.483-O-workflow-test-maintenance-frozen.json records exact two-file SHA, command metadata and unchanged tracked production. Pending G-T1.3 Provider remains uncreated.
