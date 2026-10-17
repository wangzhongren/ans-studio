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

