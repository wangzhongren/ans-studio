---
id: core-g2-status-tools-recovery
type: fix
title: "G-2/R1+R2：看护只读工具 role_status / session_tail 与恢复提议 propose_recovery（工具层与能力位）"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [role-watchdog-and-closure, kanban-fixes-pm-review]
---

# G-2/R1+R2：看护三工具（运行时核心实施记录）

**状态：已实施待验证（未部署）。** 依据：客户 2026-10-16 按推荐批准 G-2 实施（9 个待裁点全部采纳；PM 评审记录见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-2 客户批准与派发」——工具名采纳 `role_status` / `session_tail` / `propose_recovery`；V1a+V1b 同轮）；设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`（§四 只读工具设计、§六 恢复提议设计、§十 归属表 R1/R2）。**本记录只覆盖派发给运行时核心的 R1/R2**（schema＋handler＋能力位）；桌面窗口 W1-W5、编排 O1（透传）、门禁引擎 G（su 卡文本）、桌面UI U1 由其属主各自实施。

## 改动文件清单（全部在本角色 boundary.yaml Section 1 内）

| 文件 | 实施内容 |
|---|---|
| `src/model/runtime.ts` | 新增中立类型（**承载契约单一来源**）：`RoleStatusPayload` / `RoleStatusFn`、`SessionTailPayload` / `SessionTailFn`、`WatchdogToolResult`、`RecoveryAction` / `ProposeRecoveryPayload` / `RecoveryOutcome` / `RecoveryReceipt` / `ProposeRecoveryFn`；`GovernedToolsOptions` 增三能力位 `roleStatus?` / `sessionTail?` / `proposeRecovery?`（全可选，旧调用方逐字兼容） |
| `src/provider/runtime/tools.ts` | 新增工具名常量（`ROLE_STATUS_TOOL_NAME` / `SESSION_TAIL_TOOL_NAME` / `PROPOSE_RECOVERY_TOOL_NAME`）、三个 maker（`makeRoleStatusTool` / `makeSessionTailTool` / `makeProposeRecoveryTool`）、读类回执归一（`watchdogResultOf`/`watchdogFailureMessage`）与按字节截断工具函数 `truncateUtf8`；`buildGovernedTools` 增三处「注入才注册」（未注入 ⇒ 工具不存在）；`abortedToolResult` 增 `propose_recovery` 中止文案 |
| `src/provider/runtime/schema.ts` | `describeTool` 增 `role_status` / `session_tail` / `propose_recovery` 三块 parameters/description/promptGuidelines（只写语义；无执行/判定/权限动作） |
| `test/runtime-core/tools.test.ts` | 「注入才注册」全量注入用例扩到 12 工具（9→12；新三能力加入注入面） |
| `test/runtime-core/watchdog-tools.test.ts` | 新增 8 用例：能力位/形状、三工具文案钉住、两只读工具纯读接口断言（含 8 KiB 字节截断边界、回执归一与契约外 fail-closed）、propose_recovery 回执四值/校验/中止、metadata 与活动闸 |
| 本记录 + `changelog.md` + `memo.md` + `feature-map.md` + `api-spec.md` | dated 记录与导航 |

## 形状摘录（对外契约；测试逐条钉住）

**能力位（只 su 由注入端决定；未注入 ⇒ 工具不注册——沿 run_shell/dispatch_task 先例）**

```ts
// GovernedToolsOptions 新增（全部可选；RuntimeSessionOptions 经 Omit 继承自动透传至 buildGovernedTools）
roleStatus?: RoleStatusFn;           // (query: RoleStatusPayload, metadata?) => WatchdogToolResult|null|undefined|void|Promise<…>
sessionTail?: SessionTailFn;         // (query: SessionTailPayload, metadata?) => 同上
proposeRecovery?: ProposeRecoveryFn; // (payload: ProposeRecoveryPayload, metadata?) => RecoveryReceipt|null|undefined|void|Promise<…>
// WatchdogToolResult = { ok: boolean; text?: string; message?: string }（ok:true 走 text；ok:false 走如实 message）
// RecoveryReceipt = { outcome: RecoveryOutcome; message?; operatorId?; at? };
// RecoveryOutcome = "executed" | "declined" | "unsupported" | "error"（恰 executed 为已执行）
```

**role_status（G-2 §4.1）**：`role_status(roleId?, includeDiagnostics?)`
- 查询归一：`roleId` 缺省/空串＝全项目概览、给出＝单角色详情；给了 `roleId` 键但**非字符串 → 拒绝**（不静默退化为概览）；`includeDiagnostics` 非布尔视作未提供（沿 request_choice `multiple` 先例）。
- 回执归一：`WatchdogToolResult{ok:true,text}` → 转达 text（≤ **8 KiB**；按 UTF-8 字节截断、不劈码点/代理对，超限追加 `[truncated：状态输出超过 8 KiB 上限，已按 UTF-8 字节截断]`；恰 8192 字节不截/8193 截，测试钉住）；`{ok:false,message}` → `ok:false` 原样转达（如「诊断不可用：lastError=…」——数据层如实文本）；**契约外**（null/非对象/ok 非布尔/`{ok:true}` 无 text）→ `ok:false`「未返回明确结果/未返回文本」。
- 失败如实：数据源抛错 → `ok:false`「读取**未完成**（原因）+ 不要推断项目状态」——**不编造**。

**session_tail（G-2 §4.2）**：`session_tail(roleId, lines?)`
- 行数归一：缺省 **40**、上限 **200**（超上限按上限取并前缀如实标注 `[已按上限取尾：请求 N 行 → 取 200 行]`）；非法（0/负数/非整数/字符串）→ 拒绝且**不触达数据源**；缺空 roleId → 拒绝。
- 数据源返回 `{ok:true,text}` 原样转达（头部「来源文件/总行数/跳过坏行数」与逐行规范化由数据源侧按受保护投影产出——接口契约写明）；`{ok:false,message}`（如「无会话历史」）原样转达为失败；契约外 fail-honest。

**propose_recovery（G-2 §6）**：`propose_recovery(roleId, action, evidence, reason?, itemId?)`
- 本层校验（非法 → 拒绝且**不调用能力**）：`roleId` 非空、`action` 恰为三值 `{abort-turn, rebuild-session, redeliver}`、`evidence` 非空；其余语义校验（角色在本项目）在能力侧（沿 dispatch_task 先例）。
- 只提交载荷、**如实转达回执**（`RecoveryOutcome` 恰四值、后三值一律未执行）：
  - `executed` → `ok:true`「客户已确认（操作者：…），恢复动作已执行：<action> → 角色「<id>」」——**唯一**可称已执行的路径；
  - `declined` → `ok:false`「**未获执行**（取消/关闭/通道不可用，fail-closed，零执行）…不要当它已执行」；
  - `unsupported` → `ok:false`「恢复动作**未执行**——当前运行时**不支持**（unsupported）…不要当它已执行」；
  - `error` → `ok:false`「恢复动作**未执行**——执行失败或前提不满足（error，原因随回执）…不要当它已执行」；
  - 契约外回执（null/undefined/未知 outcome）→ `ok:false`「未获明确结果」——fail-closed，**绝不当已执行**（运行期防御面，测试经 cast 覆盖）。
- 等待客户确认期间挂**活动闸**（`interactionGate.begin/end`，G-1 语义适用、§6.2）：su 的等待轮次不吃整轮硬超时；`finally` 收口（能力抛错路径也恰好 end 一次）。
- 会话中止（`raceAbort`）→ `ok:false`「本次提议**未获结果**（原因）——**不要假设已执行**」；预中止时**不调用能力**。**工具层不执行任何动作、不放行任何命令、不改变任何权限/写权、不得承诺。**

**文案纪律（schema.ts，测试逐条钉住）**：只读/纯读；8 KiB 截断如实标注 `truncated`；失败「不可用＋原因」绝不编造；受保护投影与脱敏管线 + 「可能含此前会话原文要点」隐私边界；「不抛、不猜、不编造」；「**提议 ≠ 执行**」「无客户确认＝零执行」「不执行任何动作、不放行任何命令、不改变任何权限或写权」「不得承诺」「evidence 必填」「未获执行不得当成功」；负向断言（`已获授权|已放行写盘|授予写权|授权写盘|代为授权成功` 不得出现）——**不扩权限、fail-closed 不放松**。

## 跨上下文对齐（本批并行实施的接口收敛，落盘后核对）

本批 O1（编排）与桌面窗口（W1/W5）由独立上下文并行实施，**承载契约形状经历了多轮对表**（各自先立本地形状 → 编排改为**从 `model/runtime.ts` 单一来源转发**——其 `common/编排/watchdog.ts` 现 re-export 本模块同名符号、不另立第二份形状）。**最终收敛形状＝本记录上节**（与编排现文件逐名字对齐：`RoleStatusPayload`/`SessionTailPayload`/`WatchdogToolResult`/`RecoveryAction`/`RecoveryOutcome`/`RecoveryReceipt`；编排 `OUTCOME_LABELS: Record<RecoveryOutcome, string>` 四值标签与其 `renderRecoveryReceipt` 金文本测试 272/275 行已用 `unsupported`/`error`）。本层对齐要点：

1. **编排 `withWatchdogCapabilities` 把能力并入 `createRuntimeAdapter` 选项**——`RuntimeSessionOptions` 经 `Omit<GovernedToolsOptions,…>` 继承 + `...options` 透传自动进 `buildGovernedTools`（本层**无需**再改 service/session.ts；已验证）。
2. **typecheck 兜底假设不成立于本路径（如实记录）**：编排 O1 文档曾写「形状不兼容在各自 typecheck 当场报错（好事）」——实测**不成立**：`withWatchdogCapabilities` 返回 `T & WatchdogCapabilitySlots`，交集类型对 `RuntimeSessionOptions.roleStatus`（本层 Fn 类型）**可赋值**（交集可赋给每个成员），故两侧形状漂移**静默通过 typecheck**，只会在运行期表现为「工具全部 fail-closed（数据源形状不符）」。本批靠**逐字对表＋独立验证**收敛；后续跨角色承载契约建议一律「模型单一来源＋直接赋值（不经交集合并）」再吃 typecheck 兜底。
3. **未落地面**：桌面窗口的三能力实现（`SessionManager` 方法 → `openRoleSession` 注入）本轮在途（`app/desktop/session.ts` 等仍在改，其本地类型将在其自身 typecheck 中与契约对表）；端到端可用性待其收口 + 独立验证/真机 E2E。

## 给桌面窗口（W1/W4/W5）与编排（O1）的接口点（跨边界，供接线）

1. **中性类型已就位**（`src/model/runtime.ts`，单一来源）：桌面实现三能力时直接引用 `RoleStatusFn` / `SessionTailFn` / `ProposeRecoveryFn` 及载荷/回执类型（编排已 re-export 同名符号，两处同源、形状一致）。
2. **桌面窗口 W1**：实现 `RoleStatusFn(query, metadata?)` → `WatchdogToolResult`——按同源快照（SessionManager busy/queue/`lastTurn`/待确认/看护状态）渲染设计 §4.1 的结构化文本（`{ok:true,text}`）；**纯读**；数据层失败以 `{ok:false,message}` 如实表达（「不可用＋lastError」），**不要抛**；8 KiB 截断由工具层做。
3. **桌面窗口 W5**：实现 `SessionTailFn(query, metadata?)` → `WatchdogToolResult`——经**受保护投影管线**（`runtime-history.ts::getSessionHistory` 同路径，凭据清洗/display 保护在链上）产出规范化行；**不得**直读裸 JSONL；行格式 `<at> [user|assistant|tool] 一行文本（≤200 字/行、截断标注）`，头部如实给来源文件/总行数/跳过坏行数；无历史/读坏以 `{ok:false,message}` 如实表达，不抛、不猜。
4. **桌面窗口 W4/W5**：实现 `ProposeRecoveryFn(payload, metadata?)` → `RecoveryReceipt`——校验（角色在本项目）→ 恢复确认卡（pending/replay/expire 与 shell 卡共享机制；窗关 `rejectAllPending`＝未获执行→`declined`）→ **恰 `allow:true` 才**执行（复用 `manager.abort` / 新公共重建入口 / drain 重试）→ 四值回执（`executed`/`declined`/`unsupported`/`error`）；**须 resolve（不悬挂）**：su 侧等待被中止后仍要最终裁决时，按设计 §6.2 以 `kind:"system"` 把执行回执投递回 su（`renderRecoveryReceiptDelivery`，O1 已就位）。**未获确认＝declined，不得执行**。
5. **编排 O1 透传**（判据沿 `suppressHandback`，即 `dispatch_task` 处）：`AdapterCapabilities`（+`openRoleSession` 输入）增同名三字段；注入端 `const roleStatus = suppressHandback ? input.roleStatus : undefined;` 等三行；`createRuntimeAdapterFactory` 经 `withWatchdogCapabilities` 并入（**已落**）。
6. **桌面窗口注入点**（沿 `dispatchTask` 先例）：`role.builtIn === true ? … : undefined`，仅在 `openRoleSession` 传参处注入。
7. **「只 su」的结构性保证**：工具层按「注入才注册」执行——未注入 ⇒ 工具不在集合里（模型无法请求）；su 限定判据在**两个注入端**（编排 run-role 的 `suppressHandback`、桌面 `role.builtIn`），与本层测试面一致。

## 测试与实测（2026-10-16，Node v24.14.0 / macOS arm64）

- `node --test 'test/runtime-core/**/*.test.ts'`：**104 用例 / 104 通过 / 0 失败**（基线 96 + 本任务新增 8；其中既有「注入才注册」用例扩为 12 工具全注入）。
- `npm run typecheck`（全仓）：本角色改动 **0 错**（`src/model`、`src/provider/runtime`、`test/runtime-core` 均无错）；**观察**：本批其他上下文在途文件有若干 TS 错（桌面窗口的 `app/desktop/{session,interface,operator-channel}.ts` 与其镜像测试、门禁引擎/桌面UI 并行面）——非本角色边界文件、非本层改动所致，属其属主收口面（本层只报告、不触碰，见 §如实标注）。
- 消费方回归：`node --test 'test/pi-adapter/**/*.test.ts'` **232/232**；`test/claude-adapter` + `test/codex-adapter` 合计 **54/54**——既有 `describeTool` 断言与注入面不回归（未改其文件，只读验证）；编排侧 `test/编排/watchdog.test.ts`（其属主文件）在契约收敛后其既有断言（`{ok:true,text}` 桩、四值 `unsupported`/`error` 金文本）与本层形状逐名字对齐（落盘后只读核对）。
- 全量 `node --test 'test/**/*.test.ts'`：**1579 计 / 1569 过 / 9 红 / 1 跳过**——**9 红全部位于 `test/桌面应用/*`**（桌面窗口/桌面UI 并行在途面：operator-channel 恢复卡重构、renderer/tool-rows 在途改动等；同刻其 `app/desktop/*` 自身 typecheck 亦未收口，属其属主施工中状态），**本层 runtime-core 与 pi-adapter/编排面零红**（与上列 104/104、232/232、54/54 一致）。
- 未 git 提交；未部署；未触碰 kanban-live-3 轮目录、`/private/tmp`、测试证据目录；未改边界外任何文件。

## 新增断言清单（test/runtime-core/watchdog-tools.test.ts）

1. **能力位/形状**：`required` 形状（`[]` / `["roleId"]` / `["roleId","action","evidence"]`）、`action.enum` 恰三值、三工具均不设 `executionMode`；缺省不注册、各自注入才注册自己。
2. **role_status 文案**：只读/纯读/不写盘/不改变任何权限/8 KiB/truncated/「不可用＋原因」/绝不编造状态/概览与诊断节口径/`[系统·看护]` 联动/「确认卡死时提议恢复」+客户一键确认；正负双面。
3. **session_tail 文案**：只读/纯读/不写盘不改任何状态不扩大任何写权/受保护投影与脱敏管线/隐私边界句/来源文件·总行数·跳过坏行数/不抛不猜不编造/缺省 40 上限 200。
4. **propose_recovery 文案**：提议 ≠ 执行/只能提议/无客户确认＝零执行/客户一键确认卡/由应用执行/回执如实四值（executed / declined / unsupported / error、后三值一律未执行）/不执行任何动作·不放行任何命令·不改变任何权限或写权/不得承诺/evidence 必填/未获执行不得当成功/动作语义三值（停止本轮、在跑轮次不打断）。
5. **role_status 纯读接口**：只调注入数据源（其余能力注入哨兵——被触碰即抛）；查询归一（缺省/空串/非布尔/非法非字符串 roleId 拒绝且不触达数据源）；`{ok:true,text}` 原样转达、`{ok:false,message}`（诊断不可用）如实转达；8 KiB 字节截断边界（8192 不截/8193 截、不劈多字节、前缀保留）；抛错/契约外（undefined/null/旧字符串形状/无 text）fail-honest；预中止不调数据源；metadata 透传。
6. **session_tail 纯读接口**：缺省 40/显式/超上限 200 归一且如实标注；非法参数（0/负/小数/字符串/缺 roleId）拒绝且不触达数据源；原样转达；抛错/`{ok:false,message}`「无会话历史」如实/契约外结果不明。
7. **propose_recovery 回执**：executed（唯一可称已执行；操作者标识、动作→角色、detail 透传）；declined（未获执行、不称已执行）；unsupported（未执行、不称已执行）；error（未执行、不称已执行）；契约外回执（undefined/未知/null）→ 未获明确结果；参数校验失败不调用能力；抛错「未获结果」；预中止不调用能力、不称已执行。
8. **metadata 与活动闸**：入口捕获 `{turnId, roleId, runtime}`（无轮次单参兼容）；等待期间 begin 态、结算后恰好 end 一次；能力抛错路径 finally 同样收口。

断言按实文案/实行为钉住，未为变绿放松（初稿两处断言失败均按「文字本应如此」修正文案或断言，见 §实施过程更正）。

## 实施过程更正（如实记录）

1. session_tail 负向断言初稿误把「它不重放、不恢复」等**否定句**当命中（`/重放|恢复会话/` 匹配到了「不重放」）——收窄为与 dispatch_task 同款的授权类负向面（`已获授权|已放行写盘|授予写权|授权写盘|代为授权成功`）。
2. propose_recovery 中文描述初稿未列动作集语义——补「`action` 恰为三值：abort-turn（＝UI「停止本轮」）/ rebuild-session（在跑轮次不打断、会被拒绝）/ redeliver（可用 itemId 指单条）」（与设计 §6.3 同口径）。
3. executed 文案初稿带「（恰一次）」——「恰一次」是 W5 通道的幂等契约、本层不可观测，删除（本层只如实转达回执，不加超出回执的断言）。
4. **承载契约形状多轮对表**（见 §跨上下文对齐）：本层曾先后落过「三值回执/字符串返回」与「四值回执/WatchdogToolResult」两版中性类型；与并行的编排上下文双向追改后**最终定格为四值＋WatchdogToolResult 版**（其文件现 re-export 本模块符号；设计 §6.3/§九 的 success/unsupported/error 与 declined 合成四值，口径更全）。

## 如实标注

1. **跨边界发现（typecheck 交集掩蔽）**：见 §跨上下文对齐 2——`T & WatchdogCapabilitySlots` 使不兼容形状**静默通过** typecheck（与编排文档「形状不兼容会当场报错」的预期相反）；本批已按要求对表收敛，并把该结论留档供后续独立验证与跨角色契约实践参考（只报告，不去改编排文件）。
2. **端到端可用性依赖本批其他上下文**：运行时核心只交付「工具层＋能力位」（设计 §十 R1/R2 归属）。**当前工作树仍在并行施工**：编排 O1 已落（re-export＋透传＋`withWatchdogCapabilities`）；桌面窗口 W1/W4/W5 的三能力实现与其镜像类型仍在其在途编辑中（`npm run typecheck` 观察到的 `app/desktop/*` 与其测试错误、以及全量套件的 9 红——全部在 `test/桌面应用/*`——均属其未收口状态；本层 runtime-core/pi-adapter/编排面无红）。在桌面注入完成前，三工具**不注册**＝现状行为（fail-safe toward 现状）；最终「端到端可观测（卡住有告警、su 能自查、完成会收束、恢复走确认）」以独立验证＋真机 E2E 为准。
3. **数据源行为不在本层测试面**：role_status 快照内容（同源快照渲染、`lastTurn` 小状态、按角色待确认数）与 session_tail 的受保护投影/行规范化（含 ≤200 字/行截断、坏行跳过计数）由桌面窗口实现与测试；本层只保证接口契约（纯读、`WatchdogToolResult` 归一、失败如实、不扩敏）与包装语义（8 KiB 截断、行数归一、回执四值如实）。接口契约逐条写进了 `src/model/runtime.ts` 的类型注释（W1/W5 实现依据）。
4. **suppressHandback 判据沿用**：本层未新造任何角色判定；「只 su」判据保持单一来源（编排 `suppressHandback`、桌面 `role.builtIn`）——沿 dispatch_task 先例，未扩权。
5. 设计 §十二 待裁点中工具命名已由客户采纳（`role_status`/`session_tail`/`propose_recovery`，见 PM 评审 §G-2 批准）；本记录沿用，未自创别名（别名仅参数键容错：`roleId`/`role_id`/`role`、`itemId`/`item_id`，沿既有 readStringArg 先例）。
6. 编排承载模块 `common/编排/watchdog.ts` 现从 `model/runtime.ts` re-export 同一符号（**单一来源已收口**，非两处并存）；本记录 §跨上下文对齐 1 的自动透传路径（`Omit` 继承 + `...options`）亦为其接线事实的一部分，供独立验证核对。
