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
