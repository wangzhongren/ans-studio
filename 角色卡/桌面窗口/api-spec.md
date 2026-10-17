# 桌面窗口 API 规格

实现契约 **ANS-RUNTIME-V2 revision 1 / D1 + D1R + D1R2**。主进程 `app/main.ts`、受限桥 `app/preload.cjs`、纯逻辑 `app/desktop/`。当前行为见[功能说明](docs/feature/multi-runtime-desktop.md)，证据见[实施记录](docs/change/2026-10-14_change_multi-runtime-window.md)。窗口不调用 SDK；生产创建与历史经编排公开入口，工具与存储归核心。Model 类型入口为 `src/model/runtime.ts`。

## 运行时与设置

`RuntimeKind=demo|pi|codex|claude`。设置字段/必填/秘密/help/fallbackKeys 单一来源为共享 `RUNTIME_SETTINGS`，窗口不维护第二份。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getRuntimeConfig(runtime) | runtime-config:get `{runtime}` | RuntimeConfigView |
| saveRuntimeConfig(input) | runtime-config:save `{runtime,updates}` | RuntimeConfigSaveResult |
| getPiConfig() | pi-config:get | 兼容 path/fields；实际新视图可含附加字段 |
| savePiConfig(updates) | pi-config:save `{updates}` | 兼容 ok/appliedKeys/error；遵守 busy Pi 安全应用点 |

`RuntimeConfigView={runtime,label,path,fields,missingKeys,revision,application}`。field 含共享 metadata 及 `{value,isSet,source,fallbackKey?}`，source 为 file/environment/fallback/default/unset。所有共享 secret 键 value 恒空串；fallbackKey 只键名；URL 中的 userinfo 不回显。空白必填值为 unset，缺 key fallback 仅按适配器真实约定。

`RuntimeConfigSaveResult={ok,runtime,appliedKeys,revision,application,error?}`。updates 仅采纳所选引擎白名单字符串；非字符串拒绝；URL 须为不含 userinfo 的 http/https。共享 `saveEnvFile` 逐行保留其他键并原子覆盖；错误不含提交值。成功且写键非空才 revision+1。application 为 current/next-session/after-active-turn；保存本身不证明引擎/账号可连接。

**封闭值域与整数约束（共享元数据，2026-10-17）**：`saveRuntimeConfig` 的 `choices` 分支——校验仍以 raw `choices` 值为准；非法值的可接受值改用 `choiceLabels`（**仅当与 `choices` 等长**；Pi 档位显示「32k / 64k / 128k / 256k / 500k / 1M」「1 分钟 / 2 分钟 / 5 分钟 / …」），无标签或长度不匹配时回退 raw `choices`（行为不变）；文案仍 `` `${field.label}取值无效：仅接受 ${labels.join(" / ")}（或留空维持平台默认）。` ``，**不回显提交值**、不落盘。`integer` 分支保留给**无 choices** 的整数自由输入字段：trim 后空＝清除；否则 `/^\d+$/`＋`Number.isSafeInteger`＋`[min,max]`；非法 ⇒ `ok:false`、错误 `` `${label}必须是${min !== undefined ? ` ≥ ${min} 的` : ""}正整数。` ``、不落盘。现行 Pi：`ANS_PI_CONTEXT_WINDOW` 与 `ANS_PI_PROMPT_TIMEOUT_MS` 均已带 `choices`＋`choiceLabels`＋`control:"range"`＋`integer`（走 choices 分支；空串＝系统默认档）。URL/其他字段行为不变；`getRuntimeConfig` 原样透传 `choices/choiceLabels/control/integer` 元数据（控件属桌面UI）。旧面板白名单 `PI_PANEL_KEYS`（`app/desktop/pi-config.ts`，兼容路径）与 `RUNTIME_SETTINGS.pi` **逐键对齐**：2026-10-17 起为 6 键（新增 `ANS_PI_PROMPT_TIMEOUT_MS`），漂移守卫在 `test/桌面应用/pi-config.test.ts` 强制显式评审。

Pi 保存不重载忙轮次凭据；下一输入或重开在所有旧 Pi 轮次空闲后应用所选字段并重建。各项目等待此安全点的 Pi 队列会被最后一个旧轮次结束唤醒。旧单独 `pi-config.ts` 函数仍兼容既有调用；生产 IPC 使用上述新逻辑。

## 会话、历史与状态

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| openSession(input) | session:open `{projectRoot,roleId,runtime}` | OpenResult |
| sendSession(text,images?,target?,metadata?) | session:send `{text,images,target?,metadata?}`，target 为三元身份 | SendResult |
| stopSession(target?) | session:stop，旧 roleId/null 或 `{projectRoot,roleId,runtime}` | StopResult |
| abortSession(target) | session:abort，旧 roleId 或三元对象 | RoleSessionAbortResult |
| withdrawQueued(target,id) | session:withdraw，旧 roleId 或三元对象加 id | WithdrawResult |
| listLiveSessions() | session:live | 兼容唯一 roleId[] |
| listLiveSessionViews() | session:live-views | `{projectRoot,roleId,runtime,profileRevision}[]` |
| getSessionHistory(input) | session:history-get 三元身份 | SessionHistoryView |

`OpenResult` 延续 ok/error/note/config/resumed/contextSource/contextWarning，并增 runtime/projectRoot/profileRevision。缓存与重建链使用项目×角色×runtime；每活句柄保存其创建 profile revision。旧字符串目标优先活动同名句柄；不存在且多实例时拒绝模糊目标，三元对象精确寻址。新 UI 应总传三元对象。

桌面 `resumed` 表示活句柄复用；核心 native resumed → 桌面 recovered（真实已恢复）；核心 native recovered → 桌面 fresh + warning（恢复失败后重建）。未确认时不从索引或文件推断恢复成功。状态在轮次后重新读取 handle 动态 getters。

`SessionHistoryView={projectRoot,roleId,runtime,rows,error,skipped}`。rows 的旧 ReplayRow 四种 kind 保留，新增可选顶层 turnId/eventKind：user 只取 entry.turnId且无eventKind；event取 entry.turnId ?? event.turnId 与原 event.kind。工具 activity.turnId 使用相同有效ID，交互 anchorKey/requestId/anchor 保留。mapper 逐事件保留原次序和delta片段，不压缩不同turn的同文；旧Pi缺字段时不推造 metadata。ANS 回放由 Pipeline `readRoleSessionHistory` 提供。只有 Pi 无 ANS 行时读取旧角色目录 JSONL 作展示 fallback；不用于模型恢复证明。

| 订阅 | 主→渲通道与 payload |
| --- | --- |
| onSessionEvent(cb) | session:event 单信封 / session:events 同序信封数组；`{projectRoot,roleId,runtime,event,clientMessageId?}` |
| onRoleState(cb) | session:role-state；`{projectRoot,roleId,runtime,profileRevision,contextSource?,contextWarning?,busy,summaries,queue,running}` |
| onSessionHistory(cb) | session:history，SessionHistoryView |
| onProjectChanged(cb) | project:changed，既有可能变更信号 |

queue/running 延续 kind/sourceRoleId/summary/at/id/full 并增加 runtime。状态去抖按 projectRoot/roleId/runtime 合并。停止/释放不删除未投的待办；投递失败恢复队首并保留新到消息。派发和回交固定 source 引擎，不依当前选择。

## 确认与取消

`onOperatorRequest` / session:operator-request：`{id,roleId,projectRoot?,runtime?,request,anchorKey}`。`operatorRespond({id,decision})` / session:operator-response 延续 confirm/choice 请求快照校验；非法决定可重试，旧 id 返回 expired。

**一项目一卡（三权 §6.1 硬约束 / §九-10，2026-10-17）**：`createCustomerInputChannel` 按 `projectRoot` 串行——同项目同一时刻只呈现一张待客户决定卡；后续请求**入队、不调用 presenter**（`queuedCount()` 可见），状态经 `onQueued(payload, waitingFor)` 外推，主进程推 `session:operator-queued`（载荷 `{...OperatorRequestPayload, waitingFor}`，preload `onOperatorQueued(cb)`）让 UI 显示「等待前一个决定」。第一张 resolve/取消/超时/会话失效后按到达序呈现下一张；排队项随 `signal` 中止出队（`unavailable`）、`rejectAllPending`/窗关时与活动卡一并 `declined` 清空（fail-closed）。**不自动合并、不自动批准**；排队中的 id 不可作答（`expired:true`）。`pendingCount()`/`pendingRoles()` **同时计入已呈现与排队中的请求**（排队中的角色同样在「正确等待客户」，看护 #1 不误报）；`queuedCount()` 单列排队数；`replayPending()` 重推已呈现卡与排队状态行（不呈现排队卡）。适用范围＝本通道全部请求：仅内置治理角色（trio 三人与 su）会注入该通道，项目角色从不经过；single/su 语义不变（仅有并发卡时串行化）。

`onShellConfirm` / shell:confirm-request 保留 `{id,command,summary,reasonPlain,reasonRaw,argvLines,cwd}`，新增可选 roleId/projectRoot/runtime；生产 Window 绑定 exact handle 时提供。**2026-10-17 增** `tier: "risky"|"review"|"deny"|null` 与 `policy: "su-approval"|"project"`（桌面自有类型，不改契约家 `OperatorPrompt`）：从 `display.reason` **行首**匹配 `su-审批档[tier]`（前缀经编排 `shell-arming.ts` 公共再导出；先匹配前缀，避免既有 `/risky/` 泛匹配）。`policy=su-approval` 时 `reasonPlain` 含「逐条客户批准」「拒绝/超时/通道不可用 = 拒绝」「批准后可能绕过 ANS 文件写边界」；deny 用「硬拒类（deny）」、risky/review 各用其档位名。项目角色三层链恒 `tier:null`/`policy:"project"`，原文映射逐字不变。shellConfirmRespond 仍仅恰 allow:true 才接受。

**su 审批档注入（客户裁定 2026-10-17；三权 W3 起收窄为 single）**：`SessionManager` 对 **single 模型下的内置治理角色（su）** 把 `deps.shellArming`（(c) 实件）＋ `deps.shellOperatorChannel`（(a) 通道，**su 也构造**，绑定 roleId/projectRoot/runtime/signal）经 `openRoleSession({shellOperatorOnly})` 交给编排 `assembleOperatorShellGate`：只读白名单直放（0 卡），`risky`/`review`/`deny` 一律客户逐条批准（deny 也可批准）；**不接 (b)**（su 不自审）；缺件 ⇒ 不传 ⇒ 不 arm。**trio 三人一律不接审批档**（评审 §5.6）；Convener 仅经 `shellReadonly` 收同一份 (c) 实件（`(c)=allow` 直接执行，risky/review/deny 一律拒绝、0 卡、不带 operator channel），Rapporteur/Nominator 无 shell。项目角色仍走 `shellArming` + `shellOperatorChannel` 三层链。

新增 `onOperatorExpired(cb)` / session:operator-expired：`{id,roleId,projectRoot?,runtime?,reason}`，同时覆盖 customer confirm/choice 与 shell，id 分别为 op-* / sc-*。UI 按身份定格旧卡。

Customer callback 第二参保留 O1 的原 CustomerInputMetadata.signal；session lifetime 信号为本地补充。Shell 公共 OperatorChannelFn 没有原 signal，Window 只向自己的 presenter 传本地精确句柄轮次 metadata；abort、dispose、settled、send 拒绝、presenter 时限都清理旧 pending。内部 signal 不进入 IPC。旧句柄流不能使新卡失效。发行和 shell 执行前原 signal 检查仍由编排/核心实施。

## 「替我审」自动判断（P4，2026-10-17；PM 评审 §5.2/§6.5/§6.6）

**开关（主进程权威）**：`createShellJudgeSwitch()`（`app/desktop/interface.ts`，纯内存）——默认 `false`；`main.ts` 在 `loadInterface()` **开始前** `reset()`（启动/渲染重载复位）；不写 localStorage/`.env`/项目文件。`main.ts` 与 Interface 共持**同一实例**：通道在**调用当刻**读 `isEnabled()`，所以切换**只影响之后新到的 `(a)` 请求**，已挂起卡不受影响。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getShellJudgeState() | shell:judge-get（无参） | `{version:1, ok:true, enabled}` |
| setShellJudgeEnabled(enabled) | shell:judge-set `{enabled:boolean}`（桥内强制布尔） | `{version:1, ok:true, enabled}` \| `{ok:false, error}`（**失败不改状态**） |
| onShellJudgeState(cb) | 订阅 shell:judge-state（主→渲） | `{version:1, enabled}`——开关变化/重载复位/初次加载后推送 |
| onShellJudgeResult(cb) | 订阅 shell:judge-result（主→渲） | `ShellJudgeResultPayload` |

两个入站 handler 在 `main.ts` 内**各自**校验 `event.sender === win.webContents`（`isShellJudgeIpcSender` 纯同一性谓词）；不依赖通用 registrar。诊断：`shell-judge.toggled`（enabled/source/at）、`shell-judge.set.rejected`（reason）、`shell-judge.row.failed`（requestId/toolCallId/verdict）。

**通道三态（`app/desktop/operator-channel.ts`）**：`CreateOperatorChannelOptions` 增 `judge?: {isEnabled, timeoutMs?}`（缺省 15000ms，独立于确认卡超时）与 `emitJudgeResult?`。开关关 / 无 `metadata.judge` / `metadata.signal.aborted` ⇒ **原 `present` 路径逐字不变**。开启后：

- `allow`：**先发结果行**（`ShellJudgeResultPayload`；投达失败或缺 `emitJudgeResult` ⇒ `manual/row-failed` → 原卡）→ `{outcome:"allow", operatorId:"judge:<engine>", judge}`。
- `deny`：格式化 §8.4 文本（说明/原因/替代方案/出路）→ 发结果行（失败**只记诊断**）→ `{outcome:"deny", operatorId:"judge:<engine>", reason, judge}`；**不调 presenter、0 卡**。
- `manual`：写 `display.judgeNotice`（按 reasonCode 人话；`row-failed` 专用文案）→ 原 `present`；审计归人工（**不写 `judge`**）。
- **deny 档（客户 D1）**：judge `allow` **照常放行**，只按 `request.tier === "deny"` 置 `hardDenyOverride:true` 与 `label:"deny 档 · judge 放行"`；**无 hard-floor 转换/拦截/弹卡**。

判断请求由会话闭包给出：`roleId/projectRoot/runtime/turnText/judge`；`policy/tier` 由 `OperatorPrompt.reason` 行首 `su-审批档[tier]` 解析（否则 `project`/`null`）。`ShellCommandDisplay`/`ShellConfirmRequest` 增可选 `judgeNotice`（`buildShellConfirmRequest` **原样拷贝**，不进入 `reasonRaw`）。

**会话装配（`app/desktop/session.ts`）**：每会话用**同一份** `runtimeOptions` 与已构造的 `createAdapter` 工厂经编排 `createShellJudge` 生成闭包（`SessionManagerDeps.createShellJudge`；Interface 缺省注入真实实现，经 `govern-session.ts` 薄再导出，**不直接导入私有 `common/编排/`**）；构造失败 ⇒ 不注入（回原 present）。`LiveSession.lastUserText` 在**真实投递**（直发/出队/派发/回交）时写入，UTF-8 ≤4096 字节（超出截断、不据此 manual）；`metadata` 在调用当刻从活会话读取 `turnText`/`judge`；会话 `dispose` 即清两项。三人（su/项目角色）共用；不改既有 shell 审批档/三层链。

## 其他能力与装配

项目 pickProject/listProject；listProject roles 原样转可选 readonly group/groupDuty，窗口不解析组别。外开、选图/附件、诊断/显式恢复、窗口控制保留已有白名单方法。`app:recovery-state` 增 runtime。所有订阅均返回取消订阅函数；preload 不暴露 Node 能力。未改动通道的完整历史表见[冻结归档](../桌面应用/api-spec.md)。

## I1 治理记录状态（existing-project-compat V1，2026-10-17）

`ListProjectResult` 新增 `governanceRecord: GovernanceRecordStatus`（`{state: "present" | "missing" | "invalid" | "pin-mismatch"; reason?: string; pinFiles?: PinEvidenceFile[]; pinCount?: number}`；`GovernanceRecordState`/`GovernanceRecordStatus` 定义于 `app/desktop/project.ts`，`interface.ts` 原样再导出）。`listProject` 在枚举后经**既有单一授权链** `buildEffectiveProjectConfig` 读取 `.ans`（无则回退运行期同意；不可用则 fail-closed），由纯函数 `deriveGovernanceRecord` 用载入器事实 `source.kind`/`source.acceptance.accepted`/`source.downgradeReason` 与 `project.governanceBoundary.path` 派生，再由 `deriveGovernanceRecordWithPins` 在 `present` 上合入门禁引擎的只读 pin 证据（2026-10-17 C1）：

| state | 判据 | 含义 |
| --- | --- | --- |
| `present` | `kind === "ans"` 且 `accepted === true` 且治理边界路径 trim 非空，且全部 pin 目标哈希一致 | 记录存在且与盘上边界一致；**不新增字段** |
| `missing` | `kind === "builtin-fallback"` | 无 `.ans/project.json`；即便 fallback 是运行期同意（accepted:true）也是 missing |
| `invalid` | `ans-invalid`，或 `ans` 但未接受，或治理边界路径为空；或 pin 缺失/空/形状非法/检查异常 | 记录不可用；`reason` 只取载入器降级原文（缺失时给等价原因）或证据检查原因 |
| `pin-mismatch` | 记录结构可用，但至少一条 pin 目标缺失、不可读或 SHA-256 不符 | 带 `pinFiles`（仅不一致项，`path/pinned/actual/status`，按 pin 原顺序）与 `pinCount`（含一致项）；未确认前会话不可开、写入被拒 |

`governanceRecord` 与 `hasRoles` **相互独立**；`missing` 的动作可见谓词固定为 `hasRoles === true && governanceRecord.state === "missing"`，`pin-mismatch` 的动作由桌面UI 的单一谓词 `governanceActionFor` 给出。本层**只读**：不写文件、不建目录、不触发 finalize。`DesktopDeps.loadEffectiveConfig` 可注入（缺省＝共享载入器 `src/common/shared/config-loader.ts::loadEffectiveConfig`，只读导入、不复制），并透传给 `SessionManager`，保证界面派生与会话授权链同源。`DesktopDeps.inspectPinnedBoundariesFn` 可注入（缺省＝Service 公开出口 `src/service/boundary/resolve-boundary.ts::inspectPinnedBoundaries`，门禁引擎唯一哈希实现）；检查异常一律降级 `invalid`（`pin 证据检查失败：<message>`），**绝不让 `listProject` 崩**。

测试注入面新增 `createRuntimeAdapterFactoryFn`、`runtimeOptions`；默认全部引擎走 Pipeline 工厂。旧显式 createPiAdapterFactoryFn/createDemoAdapterFn 保留原测试接缝及真实 boundary，未选择它们时不绕行到 demo。envFilePath/piConfigEnv 可注入；开发测试只用临时假 env。

已知原有直接 public 门禁枚举/规则导入与 legacy demo/request-anchor 的 Provider 常量/工具导入延续本次前已批准结构；新引擎工厂和历史均通过 Pipeline，不增加 Provider/SDK 跨层调用。真实窗口交互由 U1/T1 提供独立证据。

## I2 治理记录预览/建立接线（existing-project-compat V1，2026-10-17）

| 层 | 名称 | 请求 | 返回 |
| --- | --- | --- | --- |
| IPC | `project:governance-preview` | `{projectRoot, governanceModel?: "single"\|"trio"}` | `GovernancePreviewResult` |
| IPC | `project:governance-establish` | `{projectRoot, confirm: true, governanceModel?: "single"\|"trio"}` | `EstablishGovernanceResult` |
| preload | `previewGovernanceRecord(projectRoot, governanceModel?)` | 同上 | 同上 |
| preload | `establishGovernanceRecord(projectRoot, governanceModel?)` | 桥内固定 `{projectRoot, confirm: true, governanceModel?}`（仅接受合法值） | 同上 |

`DesktopInterface.previewGovernanceRecord({projectRoot})` / `establishGovernanceRecord({projectRoot, confirm:true})` 经编排 Pipeline 公共出口 `src/pipeline/orchestration/govern-session.ts`（B2 薄再导出）调用机制——**不**直接导入 `src/common/编排/finalize.ts`。机制输入只有 `projectRoot`（边界、授权来源、写路径均由机制内部构造）。

守卫（PM 评审 §4.6，本层负责 1–3）：① `projectRoot` 非空且等于当前导入项目 `importedProjectRoot`，否则合成 `invalid-request`；② establish 必须 `confirm === true`，否则 `invalid-request`；③ 同项目在途互斥由**机制内部**负责（并发第二次得到 `busy`），本层不造第二份（渲染侧重复点击由 UI 禁用）。guard 拒绝时**不调用机制**、零写入；establish 的 guard 回执固定 `phase:"guard"`、`status:"blocked"`，`projectJsonRel`/`manifestRel` 为固定相对路径（`.ans/project.json` / `docs/bootstrap-manifest.md`，与 `finalizeRelPaths` 输出同值）。

成功判据＝`ok && phase === "write" && finalize.status === "completed"`。成功后的收尾（顺序固定）：① 调用**既有** `SessionManager.refreshStaleBoundaries()`（O-1 陈旧边界刷新入口；在跑轮次跳过、逐会话失败隔离）——**先于清缓存**，因为重建路径经 `getListing` 取角色表；② `listingCache.delete(projectRoot)`；③ 复用**既有** `DesktopDeps.emitProjectChanged`（main.ts 推 `project:changed`），渲染侧按既有消费面重新 `listProject`（状态随 `.ans` 变 `present`、动作隐藏）。

机制错误（`busy` / `already-established` / `invalid-record` / `no-roles` / `nothing-to-pin` / `unparseable-governance-doc` / `blocked`）原样透传，不重写 `code`/`message`。`DesktopDeps.previewGovernanceRecordFn` / `establishGovernanceRecordFn` 可注入（缺省＝真实机制）。

## C1–C3 治理记录 pin 不符的重新接受恢复（2026-10-17，PM 评审 §5.3）

`app/desktop/project.ts` 新增（纯映射 + 只读派生，`app/desktop/interface.ts` 消费）：

```ts
export function applyPinEvidence(record, evidence): GovernanceRecordStatus;
export async function deriveGovernanceRecordWithPins(input: {
  projectRoot: string;
  record: GovernanceRecordStatus;
  pins: PinEntry[] | undefined;
  governanceBoundaryPath?: string;
  inspectPinnedBoundariesFn?: typeof inspectPinnedBoundaries;
}): Promise<GovernanceRecordStatus>;
```

映射（逐字按评审 §5.3）：`record.state !== "present"` → 原样返回、**不做任何哈希**；`pins` 缺失/空 → `invalid` +「治理记录未提供可验证 pin」；evidence `invalid` → `invalid` + reason；`ok` → 原 `present`（**不新增字段**）；`mismatch` → `pin-mismatch` + `pinFiles` + `pinCount`；任何异常 → `invalid` +「pin 证据检查失败：<message>」，**永不抛错**。治理边界路径非空时作为 `requiredPath` 传给证据检查（治理边界必须被至少一条 pin 覆盖）。

| 层 | 名称 | 请求 | 返回 |
| --- | --- | --- | --- |
| IPC | `project:governance-reaccept-preview` | `{projectRoot}` | `GovernanceReacceptPreviewResult` |
| IPC | `project:governance-reaccept` | `{projectRoot, confirm: true, previewDigest}` | `ReacceptGovernancePinsResult` |
| preload | `previewGovernanceReacceptance(projectRoot)` | 同上 | 同上 |
| preload | `reacceptGovernancePins(projectRoot, previewDigest)` | 桥内固定 `{projectRoot, confirm: true, previewDigest}` | 同上 |

`DesktopInterface.previewGovernanceReacceptance` / `reacceptGovernancePins` 经编排 Pipeline 公共出口 `src/pipeline/orchestration/govern-session.ts`（B2 薄再导出）调用机制——**不**直接导入 `src/common/编排/finalize.ts`。机制输入只有三个钉死字段（项目根、确认、预览摘要）；边界、授权来源、pin 列表与写路径均由机制内部构造/重算。

本层守卫只做评审 §5.3 的 1–3：① `projectRoot` 非空且**严格等于** `importedProjectRoot`，否则合成 `invalid-request`（preview 回 `{ok:false,status:"invalid-request",message}`；reaccept 回 `{ok:false,status:"invalid-request",phase:"guard",wrote:[],message}`）；② `confirm === true`；③ `previewDigest` 为非空 64 位十六进制（严格 `/^[0-9a-fA-F]{64}$/`）。guard 拒绝**不调用机制**、零写入，`message` 均含「本次未写入任何文件。」。机制结果（preview 的 busy/no-record/invalid-record/not-needed/blocked；reaccept 的 completed/write-failed/blocked/not-needed/no-record/invalid-record/missing-file/unreadable-file/unparseable-boundary/preview-stale/busy）原样透传。

收尾：`status === "completed"` **或** `"write-failed"`（已进入写入阶段、可能部分落盘）后，顺序固定——① `await manager.refreshStaleBoundaries()`（失败吞掉，不影响回执）；② `listingCache.delete(projectRoot)`；③ `deps.emitProjectChanged?.()` 让渲染侧重新 `listProject`。**不自动打开会话**（不调用 `openSession`）。`DesktopDeps.previewGovernanceReacceptanceFn` / `reacceptGovernancePinsFn` / `inspectPinnedBoundariesFn` 可注入（缺省＝真实实现）。

## D1R 当前证据

历史轮次字段的必要修复见[独立修复记录](docs/fix/2026-10-14_fix_history-turn-metadata.md)：受影响 Window 37/37（其中 multi-runtime 17/17，新增两项）、strict tsc 与scope diff exit0。原D1 171项保持历史，未冒充修复后全组复跑。UI历史/live合并与真实Electron重复保护由U1/T1另交证据。

## D1R2 原客户投递显示关联

第四参metadata可含 `{clientMessageId?:string}`，仅采纳非空字符串作为原输入气泡的opaque显示标识。直接/排队客户输入固定此值，匿名派发/回交也各自建立原prompt来源。没有字段时保持旧调用兼容。

生产Window通过原prompt invocation callback闭包消费Model `PromptOptions.onTurnStarted(PromptTurnStartedMetadata)`：只有Core实际创建turn后的同步只读ack能注册actualturn→原record。metadata包含真实readonly turnId/roleId/runtime；clientMessageId不进入Model、Core、store或工具授权。Window精确身份验证callback，并保留原images数组/图片内容；无runtime标识、无客户端关联的旧替身沿用原单参/整包路径。

`SessionEventEnvelope.clientMessageId`只在原event.turnId命中已ack原record时增加；缺ack的旧提供方、无turn/未知/已清理ID都不绑定。匿名记录没有客户端ID；不使用首次事件、FIFO、最新选择或文本猜测。事件原对象不变。settled清busy/drain之前捕获来源与ID；已ack失败/aborted record保留原ID供延后terminal，前置拒绝未ack record不借下一turn。迟到旧terminal/旧send拒绝不清新轮busy或中止新确认。终结记录有界保留128条，dispose清精确句柄映射。

[当前原实现/101项受影响gate与SHA-256](docs/fix/2026-10-14_fix_client-message-origin.md)。D1/D1R1此前证据仍为历史；真实user气泡/history合并由U1/T1另验。

## 本轮回交来源（chat-handback-scope revision 2）

实现[编排规范](../编排/docs/fix/2026-10-14_fix_chat-handback-scope.md)：Window 每次实际 send 都传 Pipeline 的 RoleSessionSendOptions.handback。只有队列 kind=dispatch 为 required:true；即时客户消息、排队 message、回交消费（含合批）为 required:false，覆盖旧会话 taskId。重试由保留条目的 kind 决定，不解析正文。图片数组原引用与原 onTurnStarted 回调保留，clientMessageId 仍只经真实 ACK 关联。新字段不进入 IPC，不改变历史解析；聊天主动 submit_report 仍由编排产出并按既有路径投递。验证见[修复记录](docs/fix/2026-10-14_fix_chat-handback-origin.md)。

## 重复显示身份（2026-10-15 revision 2）

ANS历史 ReplayRow 增可选 `input?:PromptInputEventDetail`。仅 source=prompt-input 的 message 规范为输入行，原text/imageCount与actualturn保留；同请求project/role/runtime及非空turn的persisted user与typed echo返回单输入，保persisted正文/at，原审计不改。未知旧消息不解析前缀或猜重。live事件原样传送，由UI按同契约呈现。

session:operator-request 的 OperatorRequestPayload 增可选turnId/toolCallId，来自原CustomerInputMetadata非空字段；已有id仍是答复pending键，不冒充模型callId。原signal、scope、请求快照、取消及过期机制不变。main/preload通道透明转发，无新增IPC。恢复提示没有本批新增生命周期字段。证据见[窗口修复](docs/fix/2026-10-15_fix_duplicate-display-identity.md)。

工具历史 activity.phase 可含 call/start/blocked/result。显式 canonical detail.phase 三值优先；无显式值时按原eventKind映射tool_call→start、accepted→result、denied→blocked。legacy native toolResult仍result，同call blocked与failed result不得互吞，原日志不改。

## B2 受限文档只读（WINDOW-B-1）

`listProject`兼容增加documentScope?与documentReadUnavailable?，每role增加documents?。主进程原生pick成功建立当前窗口grant，renderer直接listProject不授权；同窗口重载保grant，关闭清空。新`desktop.readProjectDocument({version:1,projectViewId,documentId})`→`project:document-read`，返回Model唯一ReadProjectDocumentResult，无root/path/URL入参。PROJECT_NOT_GRANTED是未原生选择的原因细分，不扩大读权。`disposeProjectDocuments`仅main内部关窗调用，preload不暴露。

公开类型`src/model/project-document.ts`，分层入口`createProjectDocumentReader`。cardPath/changelogPath为项目相对，候选docs.path是角色卡目录相对（docs/x.md）；对UI已发ref.relativePath为项目相对，仅展示，读取只用opaque ID。支持范围md/txt UTF8≤262144原始字节、NUL/超限/不合法编码失败无partialtext，平台/句柄与scope失效按完整error union消费。现只窗口接口实现，UI静态阅读后接，验证见[实施记录](docs/change/2026-10-15_change_restricted-document-read.md)。

B导入提交时机修复（WINDOW-B-FIX-1）：原生选择和beginListing为pending，成功updateListing才提交active scope/refs。选择后枚举失败或取消保留原项目阅读；成功导入未授权项目也撤旧scope并报PROJECT_NOT_GRANTED。Pipeline内部cancelNativeSelection只清待选授权与迟到token，不新增renderer IPC。详见docs/fix/2026-10-15_fix_document-scope-import-commit.md。

## A4 / C2 text_policy_revision 1（WINDOW-A/C-1实际接口）

SessionEventEnvelope.event为DesktopOrchestrationEvent：工具SessionEvent已经上游保护；源handback只`summary/report?/liveReport?/reportPersistence?`，无rawhandback。raw业务对象/原模型交接不进IPC；新C输入/交接详情只Core安全copy，标签“交接内容（安全显示副本）”，flags为Model RuntimeInputTextProjectionV1，modelInputRecorded:false不等于完整native转录。回交queue.full/running.full仅safe copy或等待占位。

历史activity.display为Model ToolDisplayV1；ReplayRow兼容新增inputProvenance/inputPresentation/inputTextProjection、deliveryReceipt/deliveryBoundary，SessionHistoryView可含reports/reportErrors/projection。目标继承取安全display.target，确认卡可信turn/call可直接给request/conclusion；旧Pi native-only经现parser中立转换→Pipeline纯保护，raw rows/source/error不侧带IPC。哈希helper两端统一legacy-anchor-v1:SHA256，不改真实call/turn。

| preload方法 | IPC | ID字段 |
| --- | --- | --- |
| retryReportSave | report:retry-save | reportId |
| getReportSaveState | report:get-save-state | reportId |
| retryDeliveryHistorySave | delivery:retry-history-save | attemptId |
| getDeliveryReceipt | delivery:get-receipt | attemptId |
| getSessionPersistence | session:get-persistence | 无 |

每请求含version:1/projectRoot/roleId/runtime及表中ID，不接正文/路径/持久布尔；实际当前导入scope、原绑定handle和已登记ID核对。返回PersistenceReply<T>外层ok只说明受限调用完成，value为Core对应ReportSaveResultV1/ReportSaveStateV1/DeliverySaveResultV1/DeliveryReceiptQueryV1或能力快照；value自己的ok/state仍须判定。mode unknown-live即使proxy方法存在也reportSaveSupported/deliveryHistorySaveSupported/querySupported全false。disabled能力入口可存在，具体retryAvailable以Core ID状态为准。

onReportPersistenceUpdated/onDeliveryHistoryUpdated订阅report-persistence-updated/delivery-history-updated并返回取消函数；payload{version:1,scope:{projectRoot,roleId,runtime},change:Core RuntimePersistenceChangeV1相应分支}。原handle闭包守卫与dispose退订；状态只更新原卡，Window唯一同步归并器负责首次saved业务一次入队，Pipeline没有另一条enqueue。查询不写入不prompt；保存同ID单在途无timer，target补存绝不Provider，source仅保存成功可首次继续回交。最终receipt缺失不得推saved；过期/未知/可能开始禁止自动重投。精确证据见[实施记录](docs/change/2026-10-15_change_complete-flow-window-ac.md)。

A4 legacy provenance窄修：protected工具t.statusSource/target.source分别原样输出legacyStatusSource/legacyTargetSource，缺失不猜；每protected row.metadataOmissions透传为ReplayRow.metadataOmissions，类型直接引用Model RuntimeProtectedLegacyHistoryEntryV1[metadataOmissions]，允许timestamp/anchor-token/oversize-identity。UI可标真实来源/省略原因，不从原文推导。模板target/process仍不恢复。证据见docs/fix/2026-10-15_fix_legacy-projection-provenance.md。

## 停止轮次的SendResult事实快照（WINDOW-STOP-TERMINAL-FIX-1）

既有sendSession透明返回兼容可选turnId/clientMessageId/inputAccepted:true/outcome/sessionCurrent。turnId仅原调用ACK，inputAccepted仅同actualturn typed prompt-input已观察，outcome仅公开settled.detail.outcome首有效enum；无证据缺席。不解析错误文案、不等终态、不新IPC/Model。sessionCurrent是返回时原entry仍当前，不代表provider清理完成；false不等于没有新的当前会话。先拒后终态时UI经现session:event按actualturn+clientID合并，返回快照不被迟到事件修改；同client异turn不能互借。真正failed/timed_out与未接受输入的错误/草稿处理仍由真实事实决定，不将stop请求当完成。证据见[停止收口修复](docs/fix/2026-10-15_fix_stop-terminal-send-facts.md)。

安装包配置路径修复：main.whenReady后只解析一次resolveDesktopEnvPath({isPackaged,userDataPath})，packaged=userData/.env，dev仍repo.env；启动共享loader和DesktopInterface.envFilePath同值，不复制env实现/不拷贝凭据。受控host CLI --ans-packaged-smoke <absolute.json> --user-data-dir=<temp>验证真实DOM/preload/既有只读IPC和设置开闭，结果含isPackaged，开发不算通过；无新renderer IPC。证据见docs/fix/2026-10-15_fix_packaged-runtime-config.md。

## 三权治理 V1 桌面端（W3，2026-10-17；评审 §5.6/§6.2）

**Interface 透传**：`ListProjectResult` 增 `governanceModel: GovernanceModel`（原样转自门禁引擎 `listProject`，缺省 `"single"`）；`RoleView` 增可选 `governanceFunction?: GovernanceFunction`（仅 trio 的 rapporteur/nominator/convener 携带，原样透传、不硬编码 id）。`app/desktop/project.ts::buildProjectConfig` 把 `listing.governanceModel ?? "single"` 写进 `ProjectConfig.governanceModel`；`buildEffectiveProjectConfig` 优先采纳载入器 `.ans` 的显式模型，缺失才回退枚举结果——否则边界解析会掉回 single，三权角色全部不可写。

**能力路由（`SessionManager.open()`，唯一数据来源＝`role.governanceFunction`/`builtIn`，不硬编码 id）**：

| 能力 | rapporteur | nominator | convener | su（single） |
| --- | --- | --- | --- | --- |
| `customerInput`（客户确认制） | 是 | 是 | 是 | 是 |
| `dispatchTask` / `roleStatus` / `sessionTail` / `proposeRecovery` | 否 | 否 | **是** | 是（旧行为） |
| `installSkill` / `uninstallSkill` / `installMcp` / `uninstallMcp` | 否 | **是** | 否 | 是（旧行为） |
| `shellOperatorOnly`（su 审批档） | 否 | 否 | 否 | **是**（`governanceModel==="single"` 硬条件） |
| `shellReadonly`（只读档） | 否 | 否 | **是**（同一份 (c) 实件、无 operator channel） | 否 |
| `shellArming` + `shellOperatorChannel`（项目三层链） | 否（内置） | 否（内置） | 否（内置） | 否（内置） |

项目角色（`builtIn !== true`）三项 shell 字段逐字不变；`customerInput` 对全部内置角色注入（su 与三人）。old single 行为逐字不变（`legacyBuiltIn = builtIn && governanceFunction===undefined && model==="single"` 管住全部旧能力）。

**派发（`routeDispatch`）**：① 来源防御性校验——trio 必须是 Convener（`governanceFunction==="schedule"`），single 必须是主入口（su）；不符即如实拒投 + 系统行。② 目标 `builtIn === true` 或保留 id 一律拒。③ 调编排 Pipeline 公共出口 `evaluateGovernanceGate({action:"dispatch", flowId, stepId, targetRoleId})`（trio 读 `.ans/governance/ledger.jsonl` 快照：提案接受/任命名单/快捷路径/流程步骤/`flowId+stepId` 未派发；single 不分流三权门禁）。④ 去重键在 `roleId\0task\0reason` 之外增 `flowId\0stepId`。⑤ **成功入队后**写 `dispatch.accepted`（`actorRoleId=Convener`、`power:"schedule"`、`flowId/stepId/targetRoleId`、`messageSummary` ≤200 字、`runtime`）；失败/被拒**不写**。账本失败只记诊断，不翻转派发、不放宽门禁。single 旧项目**不创建** `.ans/governance`。

**回交 / 看护路由**：`handbackOwnerRoleId(projectRoot)`——trio 找 `governanceFunction==="schedule"`（Convener），single 用 `primaryRoleId`（su）。回交、看护系统消息、恢复回执、投递失败系统行全部改用它；`primaryRoleId` 只用于主入口/客户镜像。`WatchdogProjectSnapshot.suRoleId` 更名 `governanceRoleId`（值=回交主人），`app/desktop/watchdog.ts` 消费方同步（`role_status` 主人行亦数据驱动，single 仍显示 `su：`）。项目角色回交只进 Convener；Rapporteur 不接投递（镜像由渲染侧负责）。内置治理角色（三人+su）不自我回交（防御性拒绝）。`lastSuRuntime` → `lastGovernanceRuntime`（只记回交主人的 runtime）。`applySkillChange`/`applyMcpChange`/`proposeRecovery` 的目标守卫统一为「任一内置治理角色」。

**V1b 迁移接线（编排侧已就绪）**：`project:governance-migrate-preview` / `project:governance-migrate` 与 preload `previewGovernanceMigration(projectRoot)` / `migrateGovernanceModel(projectRoot, previewDigest)`。`DesktopInterface.previewGovernanceMigration` 守卫当前导入项目后**只透传 `{projectRoot}`**；`migrateGovernanceModel` 守卫「当前导入项目、`confirm===true`、`previewDigest` 64 hex」后透传 `{projectRoot, confirm:true, previewDigest}`——路径/模型/写路径均由机制内部构造，**不接受调用方提供**。`completed`/`write-failed`（已进入写入阶段）后：**先** `refreshStaleBoundaries()`（重建路径要经 `getListing` 取角色表，缓存先删会失败——沿用既有教训）→ 清列举缓存 → `emitProjectChanged`；失败（busy/preview-stale/blocked/…）**不清缓存**。**不自动打开会话**。机制结果（preview 的 model/targetModel/writePaths/modelField/manifestLine/pinChanges/retainedFiles/snapshotDigest；migrate 的 phase/status/model/message）原样透传。`DesktopDeps.previewGovernanceMigrationFn` / `migrateGovernanceModelFn` 可注入（缺省＝编排 Pipeline 公共出口）。

**S1 建立治理记录的模型选择（W4）**：`previewGovernanceRecord({projectRoot, governanceModel?})` 与 `establishGovernanceRecord({projectRoot, confirm:true, governanceModel?})`——`governanceModel` 只接受 `"single"|"trio"`；非法值 **invalid-request** 且不调用机制；缺省不传（旧行为逐字不变），显式 `trio` 才由机制写入 `.ans`。



## G-2 看护与恢复（W1-W5，2026-10-16 客户批准；G-2 revision 1）

模块：`app/desktop/watchdog.ts`（看护器——纯逻辑＋注入时钟/快照/投递端）、`app/desktop/confirm-card.ts`（确认卡 pending/replay/expire 通用件——shell 卡与恢复卡共享）、`app/desktop/recovery-channel.ts`（恢复确认卡呈现端）。文案与三能力形状的单一来源为编排 `src/common/编排/watchdog.ts` / 契约家 `src/model/runtime.ts`——本角色只读导入。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| onRecoveryConfirm(cb) | 订阅 recovery:confirm-request（主→渲） | `{id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId?}`——evidence 逐字；恰 `{allow:true}` 才作为执行请求 |
| recoveryConfirmRespond({id,allow}) | recovery:confirm-response | `{ok:true}` \| `{ok:false, expired:true}`（失效/旧回包——未获执行）\| `{ok:false, error}`（非法回包不受理） |

桥与执行（`SessionManager` 公共/注入面）：`proposeRecovery` 能力（trio 仅 Convener（`governanceFunction==="schedule"`）；single 仅 su——经 `openRoleSession({proposeRecovery})` 注入；`ProposeRecoveryFn` 契约——返回 `RecoveryReceipt{outcome: executed|declined|unsupported|error, message?, operatorId?, at?}`，恰 executed 为已执行）；`rebuildSession(target)`（新公共入口；busy 拒绝；F-5-opt1 注记适用）；`redeliverNudge(target, itemId?)`；`abort` 复用既有。回执三路：工具返回＋UI 系统行＋经投递机投回**回交主人**（trio=Convener / single=su；`kind:"system"`）。

只读数据源（同判据：trio 仅 Convener、single 仅 su 注入）：`roleStatus`（`RoleStatusPayload{roleId?,includeDiagnostics?}`→`WatchdogToolResult`——结构化文本；8KiB 截断在工具层）与 `sessionTail`（`SessionTailPayload{roleId,lines?}`→`WatchdogToolResult`——**受保护投影管线**产出，行数工具层归一、本层防御夹取）。两工具**纯读**（调用前后快照逐字段一致，有测试钉）。

### role_status 呈现消歧（2026-10-17 实机反馈）

`busy=true` 时「当前轮」与「上一轮终局」**分行呈现、语义互斥**：

- `  当前轮：进行中（已耗 X / 看护检查时限 Y；turnId=…；1 小时最后兜底）`——仅在快照有 `turnStartedAt` 时给出；X/Y 经 `formatDurationMs`，时限求值与看护/会话运行时同一来源 `resolveRuntimeTimeouts`（`promptTimeoutMs`＝**到点检查时限、不中止本轮**，缺省 **300000ms（5 分钟）**；`turnLastResortMs`＝1 小时最后兜底）；turnId 缺失时显示 `—`；**不再使用「硬超时」**。
- `  上一轮终局：<outcome> @ <at>（不表示当前轮；该角色近 15 分钟 failed/timed_out 计 N）`——历史终局显式标注，不得读成当前轮。
- `busy=false` 时保持原样 `  最近一轮：<outcome> @ <at>（该角色近 15 分钟 failed/timed_out 计 N）`。
- 历史统计（近 15 分钟 failed/timed_out 计数）保留，语义仍是历史统计。

看护 #1 `turn-deadline`（客户裁定 2026-10-17）：阈值为 `TURN_DEADLINE_RATIO = 1.0`（**到点检查**，非 90% 预警）；事实行给出「看护检查时限 Yms；到点仅检查、不中止本轮」＋「用 role_status / session_tail 核对是否卡死；仍在推进则不动作；卡死才 propose_recovery」＋「整轮最后兜底 1 小时（到点才自动中止）」；summary 与文首为「轮次到点检查」。**不得**再出现「逼近超时/已超时/尚未超时/硬超时/剩余约」等旧话术；挂起确认卡/su 忙排除、每轮一次不变。**解除（轮次结束）时不投「看护恢复」行**（到点检查不是故障，恢复行会误导）——只复位活跃期并留 `watchdog.recovery` 诊断；正常完成/空闲不再产生任何会话消息。

`system` 第四类投递：`DeliveryItem.kind` 增 `"system"`（看护告警/收束/恢复回执）；来源标注恒空、正文文首定格 `[系统·<子类>] `（U1 tool-rows.js 归类判据）；**不可撤回**；去重键看护自持命名空间（`watchdog\0…`）；失败保留待重试＋如实系统行。队列快照 `queue` 条目类型补 `id/full`（如实对齐运行时输出）。

看护器：tick 默认 30s（`ANS_DESKTOP_WATCHDOG_TICK_MS`）、静默默认 30s（`ANS_DESKTOP_WATCHDOG_SILENCE_MS`）——**仅 env 可调**；信号 #1-#4（#1 `turn-deadline`＝**到点检查** `TURN_DEADLINE_RATIO=1.0`，只提示不中止；整轮最后兜底 1 小时；其余阈值＝设计 §3.2 默认）；去重/冷却/风暴护栏（15min≤5＋通告＋`watchdog.suppressed`）；`watchdog.failed`／`watchdog.alert`／`watchdog.recovery`／`watchdog.closure` 诊断；`DesktopInterface.startWatchdog()/stopWatchdog()`（窗口注册后启动、窗关停止；看护缺席 ⇒ 一切照旧）。新增 deps：`recoveryConfirm`、`watchdogObserver`、`watchdogPendingConfirmations`、`watchdogStats`、`now`（注入时钟）。
