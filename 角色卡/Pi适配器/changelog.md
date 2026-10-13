# Pi适配器 变更记录

## 2026-10-13 — P0-2「停当前轮次」第一环：`RoleSession.abort?` 入契约 + 真适配器 abort 透传（Pi SDK `session.abort()`）

**来源**：产品提案 `角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md` **P0-2**（客户在 P0 三选二中批准）；本角色负责**最底环**——运行时适配器契约与真适配器；**编排句柄（`RoleSessionHandle` 增 `abort()`）与桌面停止入口为后续环节**，契约形状以本条钉死为准。完整实施记录：`角色卡/Pi适配器/docs/change/2026-10-13_change_p02-abort-session.md`。

**契约形状裁定（对派工文本的一处修正，如实登记）**：派工文本写「`RuntimeAdapter` 增可选 `abort?`」，经核实**落点应为 `RoleSession`**——中止语义是**会话级**的（「当前进行中的 prompt 轮次」只存在于 `bindRole` 返回的会话对象上，`RuntimeAdapter` 是工厂、无轮次可言），且提案钉的链路是「编排句柄 → 适配器 `session.abort()`」、编排句柄包装的恰是 `bindRole` 返回的 `RoleSession`（`run-role.ts:370/381` 已核）。同 `PromptOptions` 先例（演进也发生在 `RoleSession.prompt` 上）。`RuntimeAdapter` 处已留一行指引注释。

**改了什么（全部在本角色 Section 1 内）**
- `src/provider/pi/session.ts`：`RoleSession` 增**可选** `abort?(): Promise<void> | void`（契约演进，同 `PromptOptions` 先例——既有实现/替身不实现也完全合法）。文档注释写清：① 消费方须 `session.abort?.()`，**缺席 = 该运行时不支持停止，上层须如实告知，不得静默装作已停**；② 语义 = 停当前轮（模型生成与工具执行一并停）、**不销毁会话**（可继续发下一条）；③ **无进行中轮次 = no-op 不抛错**；④ **中止后 settled 仍会发射**（既有行为——SDK `agent_settled` 无论中止与否都发，X-1 唯一发射点照常映射），进行中的 `prompt()` promise 正常返回（SDK 落 `stopReason:"aborted"` 收尾、不向上拒绝）；⑤ **等待中的客户确认/交互一并 fail-closed**（run 级 signal → `raceAbort`，SDK 已天然带动）；⑥ 错误如实上抛。`RuntimeAdapter` 加指引注释，不改其成员。
- `src/common/pi-adapter/real-adapter.ts`：① `PromptCapableSession` 补 `dispose(): void`（本就「结构上兼容 AgentSession」，`makeRoleSession` 收口需要）；② **会话组装抽为导出工厂 `makeRoleSession(deps)`**（同 K-2 `makeRolePrompt` 的桩件接缝先例）——`prompt`（逐字复用 `makeRolePrompt`）/`events`（队列流，逐字不变）/`dispose`（顺序逐字不变：退订 → SDK dispose → queue.close）+ **新增 `abort()`：`await deps.session.abort()` 透传**，错误如实上抛不吞；`bindRole` 改用该工厂（行为零变化的提取 + abort 一项新增）。
- **未动**：假适配器（替身**不实现** abort——缺席即「不支持停止」，契约可选性由它真实体现）；编排 `run-role.ts` / 桌面（后续环节的边界）。

**SDK 语义核实（全部读安装包 dist 源码，非文档转述）**
- **无在飞轮次 = no-op 不抛错**：`AgentSession.abort()`（agent-session.js:1909-1920）→ `this.agent.abort()` = `activeRun?.abortController.abort()`（pi-agent-core agent.js:218-220，可选链）→ `waitForIdle()` 在 `isIdle`（`!_isAgentRunActive && !isCompacting`）时立即返回；`abortRetry/abortCompaction/abortBranchSummary` 均 `?.` 守护。
- **abort 后 settled 仍发射**：`_emitAgentSettled`（agent-session.js:684-691）无论 `_agentRunAbortRequested` 与否都发 `agent_settled`（带 `aborted` 标志）；且**先发射后解 idle 等待**（:707）⇒ `abort()` 返回时 settled 必已入队（断言无竞态）。
- **进行中的 `prompt()` 正常返回**：agent 层 `runWithLifecycle` 把中止落成 `handleRunFailure` 的 `stopReason:"aborted"` 收尾消息（agent.js:364-376），**不向上 reject**；`prompt()` 末尾 `await _runAgentPrompt(messages)` 随之正常 resolve。
- **A-6 交互中止的核查结论（派工要求核实项）：SDK abort 已天然带动，无需补接线**——run 级 signal 经 agent-loop 逐层传入各工具 `execute` 第三参（agent-loop.js:574、agent.js:428-434），`agent.abort()` 中止该 controller ⇒ 交互工具内 `raceAbort`（timeout.ts:121-138，设计 A-6）立即以「未获客户同意（…被中止…）」fail-closed 返回，`askCustomer` 的 `finally` 收闸（InteractionGate 归零）。端到端用例钉住（见下）。

**测试（`test/pi-adapter/abort.test.ts` 新增 6 条）**
- 契约形状钉（无 Pi）：无 `abort` 的会话对象（含**假适配器替身**）仍满足 `RoleSession`（编译期 + 运行期断言可选性）；`abort` 返回型允许「同步 void / Promise / async 函数」三态。
- `makeRoleSession` 桩件（无 Pi）：`abort()` 恰好透传一次到底层 `session.abort()`、反复调用不抛错；`dispose` 顺序与提取前逐字一致（退订 → SDK dispose → queue.close）、`events()` 流同一性。
- SDK 级（faux provider，离线，未安装则跳过；boot 逐字复刻 bindRole 接线**含出厂治理扩展**，走**生产 `makeRoleSession`**）：① **主用例**——确认卡挂起中（客户永不作答）`abort?.()` → 不抛错、进行中的 prompt promise 正常返回、gate 收闸（等待中的交互 fail-closed 返回）、**settled 恰 1**、随后会话可继续发下一条（settled 第 2 次 + 「收尾」消息进事件流 = 不销毁会话）；② **no-op 用例**——prompt 前 / 两轮之间 abort 均不抛错、不产生也不吞掉轮次（settled 计数 0 → 1 → 3）。

**验证（本角色执行）**
- `npm run typecheck` → **全仓零错误**。
- `node --test "test/pi-adapter/**/*.test.ts"`（带引号）→ **171 pass / 0 fail**（165 既有全绿 + 6 新增）。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **919 计 / 916 pass / 2 fail / 1 skip**；**2 红恰为既有基线红**（`test/桌面应用/pi-config.test.ts` 检出目录名断言、`test/项目管理/shared/path-primitives.test.ts` macOS `/private/var` 环境红），均在本角色边界之外。
- 未 git 操作、未重启桌面应用、未读 `.env`、未发真实模型请求（faux 进程内、keyless）、未打印凭据值。

**边界 / 跨角色（未越界改）**
- 只写本角色 Section 1：`src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/**`（新文件 + `prompt-images.test.ts` 桩件补 `dispose`）、`角色卡/Pi适配器/**`。
- **供编排（后续环节）**：`openRoleSession` 的 `RoleSessionHandle` 增 `abort()` → `session.abort?.()`（缺席时如实回「当前运行时不支持停止」——demo 替身会话即此形态）；**供桌面（后续环节）**：停止入口按提案 P0-2 的交互口径（工作中才出钮、点击后聊天流如实一行、轮次以 settled 收尾）。

## 2026-10-12 — 客户确认制交互工具族（request_confirmation / request_choice）；executionMode 端到端实测生效

**来源**：设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md`（**approved**，A 组先行）§三 A-1/A-2/A-6；本轮按派工只做 **A 组中属于 Pi适配器**的部分（**不含** A-4 删除 finalize 类型——最后一步、另派；`finalizeBootstrap` 槽与工具**原样保留**）。完整实施记录：`角色卡/Pi适配器/docs/change/2026-10-12_change_governed-interaction-tools.md`。

**改了什么（全部在本角色 Section 1 内）**
- `src/provider/pi/session.ts`：按设计 A-1 新增**冻结类型** `CustomerInputOption` / `CustomerInputRequest`（confirm/choice 判别联合，含 `preview`/`options`/`multiple`）/ `CustomerInputOutcome`（**逐字三态** answered/declined/unavailable，`value.selected` 载勾选）/ `CustomerInputFn`（注入点；抛错/`null` = 通道不可用，超时由工具层包装）——**逐字落点先例 T20/T36**。`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 各增 `customerInput?` / `customerInputTimeoutMs?` 并透传。**两处可选扩展（已登记）**：`answered.operatorId?`（审计，同 OperatorOutcome 先例）、`declined/unavailable.reason?`（失败文案要带原因）。
- `src/provider/pi/tools.ts`：增 `REQUEST_CONFIRMATION_TOOL_NAME` / `REQUEST_CHOICE_TOOL_NAME` 与两构造器；**注册照 run_shell/finalize 先例：未注入 `customerInput` 即不注册**（判据＝「有无客户通道」，非「是否创世态」）。handler：参数校验（choice 的 options 非空、id 唯一；非法时**不打扰客户**）→ `askCustomer`（**raceAbort 在内、withTimeout 在外**）→ 三态如实转达；**失败文案逐字**「未获客户同意（原因：…）→ 不要写盘；如实告知客户，不得假设同意」，**绝不说成已同意**（用例锁死）；通道返回**未提供**的选项 id → 视为未获同意。`ToolDefinition.handler` 增可选 `signal`。
- `src/common/pi-adapter/timeout.ts`：`DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS=110000`（**< prompt 缺省 120s**，留 10s 余量）、`CUSTOMER_INPUT_TIMEOUT_ENV="ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS"`、`CUSTOMER_INPUT_PROMPT_MARGIN_MS=5000`、`resolveCustomerInputTimeoutMs`（**生效值=min(配置, prompt−5s)**，prompt 未设超时则不收敛）、`abortError/isAbortError/raceAbort`（**会话中止=立即 fail-closed，防悬挂**）。
- `src/common/pi-adapter/real-adapter.ts`：`describeTool`/`toPiTool` **改为导出**（供接线实测）＋两分支（**普通 JSON-Schema**、**description + promptGuidelines（A-2 写死流程）**、**`executionMode:"sequential"`（A-6）**）；`execute` **透传 AbortSignal**（此前丢弃）；`bindRole` 求生效时限（被收敛且注入了通道时打可见 stage 日志）并传 `buildGovernedTools`。
- **未动**：`GOVERNED_WRITE_TOOLS`（两工具无 path、无写，加等于没加——同 run_shell §7.7）、`shellKillSwitch`（只匹配 run_shell）、扩展钩子（对未知名放行——两工具本就该放行）。

**关键实测：`executionMode:"sequential"` 端到端确证生效（含对照组）**
- 做法：`test/pi-adapter/interactive-execution-mode.test.ts`，**完全离线**用 pi-ai 内置 **faux provider** 作脚本模型，一条助手消息**同批**发 confirm + write_file，记录时序。
- 主组（带该字段）：`confirm:start > confirm:end > gate(role.md)` —— 写**在确认完成之后**才执行（且确认后真实落盘）。
- 对照组（**抹掉该字段**，其余不变）：`gate(role.md) > confirm:start > confirm:end` —— 写**抢跑于确认**。
- ⇒ **该字段承重且生效**（Pi 1.1.0 全链路：createAgentSession → customTools → 注册包装 → agent-loop 批执行）；此前登记「未实测」，**本轮已实测**。残留（如实）：限「同批内」，跨轮仍靠 A-2 文案；硬保证（先确认后写）在编排 A-3 的 writeSet/F4，**不在本层**。

**验证（本角色执行）**
- `node --test "test/pi-adapter/*.test.ts"`（**带引号**）→ **97 pass / 0 fail / 0 skipped**（较前 74 净 **+23**：customer-input 19 条 + execution-mode 4 条）。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **715 计 / 702 pass / 12 fail / 1 skip**。**12 红全在他人边界**：`test/桌面应用/**`（该角色正在改 B-2，旧断言与新语义冲突，红随其在途改动波动；同刻其 `app/desktop/**` 亦有在途 typecheck 错误）＋ `test/项目管理/shared/path-primitives.test.ts`（既有 macOS `/private/var` 环境红，基线红之一）。**本角色目录 0 红**；相对派工时基线（692/689/2/1），**+23 计 +23 过即本角色新增**，其余 −10 过全数落在桌面应用在途改动。
- `npm run typecheck` → **本角色文件零错误**（全仓余下错误全在 `app/desktop/**`、`test/桌面应用/**`，桌面应用在途）。
- **未读** `.env`、**未发**真实模型请求（faux 进程内、keyless）、**未打印**凭据值。

**边界 / 跨角色（未越界改）**
- 只写本角色 Section 1：`src/provider/pi/session.ts`、`src/provider/pi/tools.ts`、`src/common/pi-adapter/timeout.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/**`、`角色卡/Pi适配器/**`。
- **供编排**：构造 `CustomerInputFn`（复用 `OperatorChannelFn` 通道；CLI 终端映射/桌面交互卡各实现各自那半）并注入；prompt 时限调大时交互时限**自动跟随放宽**（无需同步配置）。**供桌面**：交互卡所需字段全在 `CustomerInputRequest`/`CustomerInputOutcome`（形状单一来源 `session.ts`）。

**追加（同日，小活）：preview 必须列出将写出的具体路径（配合编排 A-3 发行器）**
- **缘由**（读编排 `src/common/编排/confirmed-writes.ts` 只读确认）：发行器在 `request_confirmation` 返回 `confirmed:true` 后，从 `title + preview + detail` 保守提取「路径样 token」，经 `resolveWrite` 探测后发行进会话 writeSet；**preview 不列路径 ⇒ 不发行 ⇒ 写入被 F4 拒**（fail-closed 但会打断流程）。
- **改动**（`real-adapter.ts` 的 `describeTool`，纯**文案**，行为未动）：两交互工具的 description + promptGuidelines 增「**preview 必须列出将要写出的具体路径**（相对项目根、含目录）；未列出的路径不会获得许可、写入会被门禁拒绝」；并**明示「列出路径 ≠ 获准」——获准唯一凭据是 `confirmed:true`**；`request_choice` 侧明示**选择≠写盘同意**（choice 不发行任何写盘许可，要写盘仍须另经 request_confirmation）。
- **测试**：`interactive-execution-mode.test.ts` 增 1 条文案用例（含反向断言：不得出现「列出路径即可写」式措辞）。
- **验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **98 pass / 0 fail**（+1）；`npm run typecheck` 本角色零错误。

**追加（同日，A-4 最后一步）：删除旧收口面（finalize_bootstrap）**
- **缘由**：该工具自 A-4 起**无任何注入方**（编排 genesisFinalize 已删、桌面 finalizeBootstrap 已删）⇒ 永不注册 = **死代码**；「同意才落盘」已由交互工具族 + 编排 writeSet/F4 承担。
- **删除**（本角色 Section 1 内）：`tools.ts` 的 `FINALIZE_BOOTSTRAP_TOOL_NAME` / `makeFinalizeBootstrapTool` / 注册分支 / `GovernedToolsOptions.finalizeBootstrap` / 头部历史段（改墓碑注记）；`session.ts` 的 `FinalizeBootstrapFn` 与两处 `finalizeBootstrap?` 选项/透传；`real-adapter.ts` 的 import、`describeTool` 分支、`RealPiAdapterOptions.finalizeBootstrap`。**保留** `FinalizeStatus`/`FinalizeResult`（编排仍消费）。「先例」引用改指仍存者（`run_shell`/`shellGate`/`customerInput`）。
- **测试**：`finalize-bootstrap.test.ts` 由 9 条旧用例**改写为 4 条墓碑用例**（任何构造下不出现；导出面已删；**@ts-expect-error 编译期墓碑**——类型若加回 typecheck 即失败；两结果型仍可用）。旧断言对象已随特性消亡而删除，非放宽。
- **消费者 grep（先查后删）**：本层选项的外部注入方 **0 处**；`FinalizeBootstrapFn` 唯一外部引用是编排 `finalize.ts:130` 临时再导出——**编排同刻已删**，无编译窗口残留。
- **验证**：`test/pi-adapter/*.test.ts` → **93 pass / 0 fail**（98 − 9 + 4）；全量 → **701 计 / 698 pass / 2 fail / 1 skip**，**2 红恰为既有环境红**（桌面 pi-config 目录名、pm shared macOS `/var`）；`npm run typecheck` → **全仓零错误**。

**新增（同日）：交报告工具 submit_report（设计 C-1）**
- **契约落点**：三型入 §4 契约家 `session.ts`——`ReportHandbackPayload { status:"completed"|"blocked"; summary; evidence? }`（与编排 `TaskHandback`/`TaskReport` **逐字同构**）、`ReportHandbackReceipt { ok; message? }`、`ReportHandbackFn`；`createFakeRuntimeAdapter`/`PiRuntimeAdapterOptions` 各增 `reportHandback?` 透传。
- **工具与注册**：`tools.ts` 增 `SUBMIT_REPORT_TOOL_NAME`/`makeSubmitReportTool`；**未注入 `reportHandback` 即不注册**（只给项目角色；su 不注入即不存在）。handler：参数校验（status 枚举/summary 非空/evidence 字符串数组；非法时 fn 不被调）→ 只把载荷交给注入能力 → **如实**转达（成功/无回执 → 「报告已交回」；拒/抛错 → 「**未能交回**」，绝不谎称）；`raceAbort` 防悬挂、不设等待超时；**不写盘/不判定/不进 GOVERNED_WRITE_TOOLS**。
- **schema/文案**：`real-adapter.ts` 的 `describeTool` 增分支（status 枚举 + summary 必填 + evidence 数组）；description + promptGuidelines 写死「完成/确认无法完成时**必须**交回报告：一句话结论 + 改了哪些文件/产出了什么 + 关键证据；**不得只在正文里说**」，并明示**不写盘、不改变任何写盘权限**；不设 executionMode。
- **跨角色形状接缝（已修通）**：编排 `AdapterCapabilities.reportHandback` 是 fire-and-forget（`(report) => void | Promise<void>`）；初版返回联合不含 void ⇒ 集成侧 TS2322/TS2345。修复在本层：返回联合接纳 `void`（= 已接收无回执），并加 fire-and-forget 用例锁死；**未碰编排/装配文件**。
- **测试**：新增 `test/pi-adapter/submit-report.test.ts` **12 条**（含反向断言：失败措辞不含「已交回」；文案不得暗示写权）。**验证**：`test/pi-adapter/*.test.ts` → **105 pass / 0 fail**；全量 → **718 计 / 715 pass / 2 fail / 1 skip**（2 红仍为既有环境红）；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。

**新增（同日）：D-1 重启恢复（sessionDir 持久会话）**
- **接线**：`PiRuntimeAdapterOptions` 与 `RealPiAdapterOptions` 各增可选 `sessionDir?: string`；`real-adapter.ts` 新增导出 `selectSessionManager`——**未给 sessionDir ⇒ `SessionManager.inMemory`（逐字旧行为）**；给了 ⇒ 目录内**有最近会话即 `open` 恢复**（`list` 取 modified 最近，与 SDK `continueRecent` 同源语义），否则 `create` 新建。`bindRole` 用它替换原 in-memory 管理器；恢复时 `log.stage` + 事件流可见提示。编排侧 `run-role.ts:455` 已按 `<root>/.ans/sessions/<roleId>/` 逐角色传入（接缝已活，typecheck 全仓零错佐证）。
- **目录约定（与编排协调确认）**：目录创建**归本层**（编排不预建 `.ans`）——SDK `SessionManager.create` 构造器自会 `mkdir -p`（session-manager.js:646-648），本层**再加显式预建 + `W_OK` 可写校验**（失败给一句话明确错误、声明**不静默退化**）。**如实登记时机**：目录在 **bindRole 时**即建出，**文件仍惰性**（首条消息才落盘）——与编排注释「真正落盘时创建」措辞略有出入，见文档。
- **环境封闭登记**：持久化**只写 `<项目>/.ans/sessions/<角色>/`，绝不读写 `~/.pi`**——`createAgentSession` 的 `~/.pi` 回落（sdk.js:71-79）被显式 resourceLoader/settingsManager/sessionManager/modelRuntime 全部绕过；ResourceLoader/AgentSession 均无写文件代码；trust store 仅 CLI 入口构造（main.js:576），不在本路径。sessionDir **须逐角色隔离**。
- **一致性坑（不静默）**：能力集变化（customerInput/reportHandback 增减）⇒ 转录里声明过而本次未注册的工具保持 pending（SDK 按转录恢复装载）——已写进代码注释与文档；界面提示归桌面。
- **测试**：`test/pi-adapter/session-persistence.test.ts` **6 条**（in-memory 不落盘 / 新建+惰性落盘+目录存在 / 恢复同一文件+往返 / 取最近 / **不可写→明确抛错** / **端到端 faux：关掉再开、上下文含上轮内容**）。
- **验证**：`test/pi-adapter/*.test.ts` → **111 pass / 0 fail**；全量 → **742 计 / 739 pass / 2 fail / 1 skip**（2 红仍为既有环境红：桌面 pi-config 目录名、pm shared macOS `/var`）；`npm run typecheck` → **全仓零错误**。

**修订（同日）：G-1 客户确认不设超时**
- **等待缺省不设限**（客户裁定「就卡在这等客户同意」）：`ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 退役为**仅显式配置才计时**；`DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS`/`CUSTOMER_INPUT_PROMPT_MARGIN_MS`/`resolveCustomerInputTimeoutMs`（A-6 收敛）**删除**（缺省取消后失去意义；原语义留痕于注释）。新增 `readOptionalTimeoutMs`（未设→undefined=不限时）。
- **「等客户」的轮次不再被整轮硬超时掐断（关键）**：新增 `InteractionGate`（可重入的等待引用计数）+ **`withPausableTimeout`**（可暂停硬超时：等待中计时停走、恢复后按剩余时间续算）。`real-adapter` 每会话建一个闸传给工具层，`prompt()` 改用 `withPausableTimeout(session.prompt(text), promptMs, "prompt", gate)`。**实证**：faux 端到端——客户 250ms 后同意 vs 每轮 120ms：挂闸时该轮**不被掐断**；**对照组**（不挂闸）到 120ms 即 TimeoutError——挂起暂停是承重机制。
- **等待期间会话=忙**（核实并钉住）：并发 `session.prompt` 被 SDK 拒（`Agent is already processing…`，agent-session.js:1553），端到端用例断言之。
- **诚实边界登记**：未决请求只在**进程内存**；进程结束即失效 → 本层如实「未获客户同意（原因：…）」，**绝不假装同意**；D-1 恢复的是历史，不是未决调用。
- **测试**：`customer-input.test.ts` 改超时语义（mock 时钟：虚拟 180s>旧上限 110s 仍生效、110s 处未超时；env 显式 60s 仍计时）+ 新增 `interaction-gate.test.ts`（4 条）+ `customer-wait-end-to-end.test.ts`（3 条）。
- **验证**：`test/pi-adapter/*.test.ts` → **120 pass / 0 fail**；全量 → **766 计 / 763 pass / 2 fail / 1 skip**（2 红仍为既有环境红）；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。

**新增（同日）：H-1 su 派发任务工具 dispatch_task**
- **契约落点**：`session.ts` 新增 `DispatchTaskPayload { roleId; task; reason? }` / `DispatchReceipt { ok; message? }` / `DispatchTaskFn`（返回位含 `void`，编排 fire-and-forget 可直接注入）；两适配器选项各增 `dispatchTask?` 透传。
- **工具与注册**：`tools.ts` 增 `DISPATCH_TASK_TOOL_NAME`/`makeDispatchTaskTool`；**未注入即不注册**（只给 su）。handler：参数校验（roleId/task 非空；非法不调 fn）→ 只转交载荷 → 受理/void 回「任务已派发」+**重申「派发 ≠ 授权」**；拒/抛错回「**未能派发**」如实（失败文案避开「已派发」子串，配严格反向断言）。`raceAbort` 防悬挂；不写盘/不判定/不进 GOVERNED_WRITE_TOOLS。
- **文案**：`describeTool` 分支写死三条——**派发 ≠ 授权**（对方写权只来自其边界 + `confirmed:true`；不得承诺/代授）／任务**自足**（对方看不到 su 上下文）／**返工带证据**；并明示不改变任何角色的写权。反向断言：不得出现「已获授权/已放行写盘/授予写权」字样。
- **如实边界**：roleId 语义校验（非本项目角色/指向 su 自身）归编排的注入能力，经回执原样转达（不静默不猜测）；前端路由（自动开/排队/去重/保留）归编排+桌面；CLI 不做同等路由（登记）。
- **测试**：`test/pi-adapter/dispatch-task.test.ts` **11 条**。**验证**：`test/pi-adapter/*.test.ts` → **131 pass / 0 fail**；全量 → **777 计 / 774 pass / 2 fail / 1 skip**（2 红仍为既有环境红）；`npm run typecheck` → **全仓零错误**。

**新增（同日）：K-2 图片发送（契约扩展 + 适配器透传）**
- **契约**（`session.ts`）：新增 `PromptImage`（逐字镜像 pi-ai `ImageContent`：`{type:"image";data;mimeType}`；wire 转换归 SDK）与 `PromptOptions{images?}`；`RoleSession.prompt(text)` → `prompt(text, opts?)`（**可选参，零破坏**）；fake 适配器同步（不消费图片；无图事件逐字不变）。
- **透传**（`real-adapter.ts`）：prompt 包装抽为**导出工厂 `makeRolePrompt`**（桩件可测）：无图 → 不传 options（逐字旧行为）；带图 → 原样透传同一数组；**不按 `Model.input` 门控**；失败两条路径外推不变。
- **实测（faux 离线）**：有效图**逐字进 LLM 转录**；**无效图被显式省略**（注记 `[Image omitted: …]`，`image-process.js:47/:55`——非静默）；网关非多模态时 SDK 不拦（无 `Model.input` 门控）→ 由网关报错、两形态可外推；**如实提示落点建议在编排/桌面**。
- **测试**：`test/pi-adapter/prompt-images.test.ts` **7 条**（契约编译期兼容+键断言；无图逐字旧行为；带图同引用透传；空数组=无图；失败外推+abort+上抛；fake 签名同步；SDK 级有效/无效双断言）。**验证**：`test/pi-adapter/` → **138 pass / 0 fail**；全量 → **813 计 / 810 pass / 2 fail / 1 skip**（2 红仍为既有环境红）；`npm run typecheck` → **全仓零错误**。

**新增（同日）：R-1 前置——`report_shell_verdict` 工具 + `shellVerdict?` 选项（另附网关 500 根因确证）**
- **工具/契约**：`session.ts` 新增 `ShellVerdictPayload {verdict:"allow"|"deny"|"unsure"; reason?}` 与 `ShellVerdictFn`（void|Promise<void>；形状逐字取自编排 `shell-gate.ts:205-217`，读之确认不导入）；`tools.ts` 增 `SHELL_VERDICT_TOOL_NAME`/构造器（**未注入即不注册**，**只给审读会话**；verdict 三值枚举校验、非法不调能力；失败「未能交回」如实；防悬挂；不写盘）；`real-adapter.ts` describeTool 分支（枚举 + 「结论以工具调用为准/正文里写不算」+ **不得暗示授予权限**）与三处选项透传。**编排 `run-role.ts:530` 瞬时 TS2353 已消解**（typecheck 归零）。
- **网关 500（`unknown variant 'tool_removal'`）根因确证（只读，未改）**：pi-ai 仅在 `compat.supportsMidConvoSystemMessages && supportsMidConvoToolChanges` 为真时生成 `tool_addition`/`tool_removal` 块（anthropic-messages.js:870/:1027-1041；缺省 false，types.d.ts:781-783）；而 `buildExplicitRuntime` 克隆模板**原样继承 compat**（实测 claude-fable-5：两能力位均 true + forceAdaptiveThinking + supportsStrictTools + allowedFallbackModels）⇒ SDK 生成网关不认的块 → 整段重发 500。**建议**：克隆时显式收窄 compat（两位置 false；顺带核对其余照抄项）；既有含块 JSONL 建议扫描清理。
- **测试**：`shell-verdict.test.ts` **10 条**（含反向断言：文案不得出现「已放行/已授权/已授予/代表放行/代为放行」）。**验证**：`test/pi-adapter/` → **148 pass / 0 fail**；全量 → **874 计 / 870 pass / 3 fail / 1 skip**（3 红＝既有环境红 2＋桌面在途 1，非本层）；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`。

**修复（同日）：网关 500 `unknown variant 'tool_removal'`——compat 收窄 + 存量防御**
- **主修**：`buildExplicitRuntime` 克隆模板时**显式收窄 compat 五项**（每项注释写明模板实测值与网关情形）：`supportsMidConvoSystemMessages:false`、`supportsMidConvoToolChanges:false`（tool_removal 块生成门槛，anthropic-messages.js:870/:1027-1041）、`forceAdaptiveThinking:false`、`supportsStrictTools:false`、`allowedFallbackModels` 清空；其余 compat 逐项保留。
- **存量（前提经实测修正）**：探针确证 JSONL 存的是 system 消息上的 **toolsAdded/toolsRemoved 元数据**而非字面块；字面块受 compat 门控**每请求生成** ⇒ **收窄后存量自动失效、无需清洗**。仍加**防御**：检测 system 消息里的字面块 → 跳过该文件（留干净旧档）或全污染时**如实新建**（note 可见；不清洗历史、不静默）。
- **回归**：新增 `wire-compat-and-legacy.test.ts` **5 条**——compat 断言；**wire 级双向对照**（收窄后无块 / 对照组复现块）；检测不误报用户正文；跳过/新建与干净路径逐字不变。
- **评估**：可解释「会话中途有过工具装载变化的会话此后恒 500/恒空」一类；其它现象**未逐例取证（未证）**。
- **验证**：`test/pi-adapter/` → **153 pass / 0 fail**；全量 → **879 计 / 876 pass / 2 fail / 1 skip**（恰为 2 条既有环境红）；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`。

**修复（同日）：W-1 同轮丢写——写类工具钉 sequential**
- **复现**（离线 faux A/B）：同批 `write_file`（大内容）+ `edit_file`（同一文件、初始不存在）——**对照组（抹掉 executionMode）3/3 丢写**（edit 效果缺失；探针 5/5 同）；**主组（修复后）3/3 无丢写**（edit 在 write 产物上生效）。
- **改动**：`describeTool` 对 `write_file`/`edit_file` 透传 `executionMode:"sequential"`（理由注释：同批并行默认 + 读改写竞态）；**`read_file` 判定不加**（纯读无写可竞争 + 批级规则已覆盖读写混批 + 纯读批无意义、反增串行）。
- **附带影响（登记）**：含写类工具的批**整批顺序执行**（批级规则）——批量多文件写入串行化，性能换正确性。
- **测试**：新增 `write-sequencing.test.ts` 3 条（形状 + A/B×3）；同步 `interactive-execution-mode.test.ts` 旧断言。**验证**：`test/pi-adapter/` → **156 pass / 0 fail**；全量 → **883 计 / 880 pass / 2 fail / 1 skip**（恰为既有 2 红）；`npm run typecheck` → **全仓零错误**。

**修复（同日）：X-1 每轮重复 settled——唯一发射点**
- **根因**：两处同发（扩展层 `on("agent_settled")` + `session.subscribe`）⇒ 每轮两份 ⇒ 编排每份回交一次 + 桌面去重键含毫秒 `at` ⇒ 去重失效 ⇒ 重复投递（真机 7 次）。
- **修复**：**保留 `session.subscribe`**（公开事件面、与事件源同层；扩展层可缺席，而 settled 是消费方关键信号——漏发即挂起），收口为导出函数 `wireSettledOnce`；**删扩展层 `agent_settled` 映射**（其余职责全保留；`buildGovernanceExtension` 改为导出，供测试断言其 handlers 不含 `agent_settled`）。中止路径语义保持（abort 后仍恰 1）。
- **A/B 实测（离线）**：A 修复前接线 → 一轮 **2**（复现）；B 出厂接线 → **恰 1**（且扩展仍含 tool_call、不含 agent_settled）；abort → 恰 1；stub 单测语义。**连带清点**：其余发射点全部单源单次（无同类重复）。
- **验证**：`test/pi-adapter/` → **160 pass / 0 fail**；全量 → **889 计 / 886 pass / 2 fail / 1 skip**（恰为既有 2 红）；`npm run typecheck` → **全仓零错误**。

**调整（同日）：终端降噪（客户直接要求）**
- 「新会话（持久化目录…）」与「会话已恢复：…」两条**每次开会话都出现**的常规行由 `log.stage` 降为 **`log.trace`**（默认不打印；`ANS_PI_TRACE` 才出），理由写进代码注释。异常/一次性行（跳过污染会话 note、prompt 中止、contextWindow 提示等）**仍走 stage**；**事件流恢复提示未动**（界面诚实提示保留；可选建议已登记供客户裁定）。
- 测试：新增 `log-noise.test.ts` **4 条**（真 logger 门槛；真 bindRole 离线：新会话/恢复走 trace 不走 stage、其余 stage 行不变；污染 note 仍 stage）。**验证**：`test/pi-adapter/` → **164 pass / 0 fail**；全量 → **893 计 / 890 pass / 2 fail / 1 skip**（恰为既有 2 红）；`npm run typecheck` → **全仓零错误**。

**调整（同日）：恢复提示二次降噪——聊天流也不出现（客户推翻此前「事件流保留」决定）**
- **缘由（客户原话）**：客户在聊天流又看到「**会话已恢复：…（历史与模型上下文自该会话续起）**」并明确表示不需要（「这个也不需要啊，这个不需要」；再次看到后「本来已经让你去掉了，怎么又加回来了」）。上一条「终端降噪」一轮**特意保留**了事件流那条（注释写着「界面/事件流里的那条恢复提示保留——诚实提示」）——**该保留决定已被客户明确推翻**：恢复是常规事件，聊天流也不要。
- **改动**（`src/common/pi-adapter/real-adapter.ts` 的 `mode === "resumed"` 分支）：**删** `emit({kind:"message", summary:notice})`；`notice` 变量随之清理（恢复行内联进 `log.trace`），原拼接的 skip 片段拆为独立分支。`log.trace` **保留**（终端降噪维持原状，`ANS_PI_TRACE` 打开仍可见——排障用）。注释按新裁定重写（旧叙述「界面/事件流保留」删除，不留与行为矛盾的叙述）。
- **第 2 条核查（skippedContaminated 是否有信息损失——结论：有，已处理）**：`skippedContaminated` 只在两处有值——① **全污染 ⇒ 新建**的 note 路径（note 已含「已跳过恢复并新建」，`log.stage` + 事件流照旧，本轮**未动**）；② **resumed + 跳过过污染档**（该路径 **note 为 undefined**）——此情形 skip 事实此前**只**出现在被删的那条恢复提示里，直接删 emit 即被静默吞掉。故新增独立分支：该情形**如实告知**（`log.stage` + 事件流，同 note 路径口径：文案「检测到 N 个会话文件含网关不认识的工具变更块（tool_removal/tool_addition），已跳过这些文件、恢复最新一条干净会话（不静默、不清洗历史）。」）；**恢复本身**（常规事件）仍不进聊天流。
- **测试**（`test/pi-adapter/log-noise.test.ts`，4 → 5 条）：恢复用例断言**反转**——原「事件流应保留恢复提示」改为「**事件流不含**恢复提示」（trace 与「不走 stage」断言保留；事件读取改为先 dispose 再排空）；note 用例补事件流断言；**新增**「resumed + 跳过」（note 为 undefined）组合用例（构造：干净档 `message.timestamp` 较早、污染档 `header.timestamp` 较新 ⇒ list 排序污染在前被跳过）。**断言承重对照（A/B 实测）**：反向注入旧行为（恢复 emit 加回 + skip 分支删除）⇒ 两条用例恰转红；撤销后全绿。
- **验证**：`node --test "test/pi-adapter/**/*.test.ts"`（带引号）→ **165 pass / 0 fail / 0 skipped**（164 + 1）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **909 计 / 906 pass / 2 fail / 1 skip**——**2 红恰为既有基线红**（`test/桌面应用/pi-config.test.ts` 仓库检出目录名断言、`test/项目管理/shared/path-primitives.test.ts` 的 macOS `/private/var` 前缀），新红 0（计/过较 893/890 的增量含他角色在途改动）；`npm run typecheck` → **全仓零错误**。HEAD `6291ab1`（工作区含他人在途改动）。**未读** `.env`、**未发**真实模型请求。
- **边界 / 跨角色（未越界改）**：只写 `real-adapter.ts`、`log-noise.test.ts` 与本角色文档面。**供桌面角色**：`app/renderer/renderer.js:1611` 另有一条**回放分隔行**「会话已恢复（模型上下文一并恢复）」（`test/桌面应用/renderer.test.ts:593` 有断言）——那是桌面自己的会话回放 UI，属其边界，**未动**；若客户对聊天流的要求涵盖该行，由桌面角色处置。

## 2026-10-11 — 注释更正：共享原子写上界 20 → 200（仅注释，无行为变更）

**来源**：pm 已把共享原语 `src/common/shared/atomic-write.ts` 的重试上界由 **20 改为 200**（pm 属主；先复现并发 flake、定性「上界被打满」、并用证据证明「耗尽时 temp 已清、目标文件完好、只损失一次写入」，故取实测尾部 ~63 的约 3× 作裕量）。pm 如实回报：本角色 `src/common/pi-adapter/fs-write.ts:138` 的注释**仍写「≤20 次」**；该文件**已委托共享原语、无第二实现**，**仅注释陈旧**，需改为 200。

**改了什么**（落点仅本角色边界 `src/common/pi-adapter/fs-write.ts`，**纯注释**）
- `atomicWriteFile` 的文档注释：`≤20 次` → 与共享常量一致的上界 **200**；并顺带把同句里已不再成立的「**逐字同源**」更正为「**同源**」（上界已在共享侧由 20 上调为 200，故与本层原私有实现**不再「逐字」相同**），并明确登记「本层原私有实现为 20、共享侧已上调」。
- **无任何行为改动**：`atomicWriteFile` 函数体仍为 `return atomicWrite(abs, data, { mode: 0o600 })`；未新增/改动任何重试逻辑、瞬时码集合或上界常量。

**核实：本文件确无第二份重试实现**
- `fs-write.ts` 只 `import { atomicWrite } from "../../common/shared/atomic-write.ts"`。此前私有的 `renameReplacingExisting` / `RENAME_TRANSIENT_CODES` / `RENAME_MAX_ATTEMPTS` 与内联 temp+rename 脚手架**已于上一轮删除**（见下文「私有原子写实现已收归共享组件 6」节）。`atomicWriteFile` 是共享原语的**薄封装**——不含重试循环、不持瞬时码集合、不持上界常量。重试的**唯一来源**是共享原语。

**其他写着旧上界处（核查结论）**
- 本角色边界内其余出现「≤20 / 20 次 / 上界 20 / `RENAME_MAX_ATTEMPTS=20`」的地方，**均在 `changelog.md` / `memo.md` 的历史条目里**（记录当时的事实：下文「修复 `edit_file` 偶发失败」与「私有原子写实现已收归共享组件 6」两节）——按「不回改历史」**保持原样**；本小节即为其现状说明。
- `test/pi-adapter/`、`src/provider/pi/` 内**无**提及旧上界处（grep 无命中）。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **74 pass / 0 fail / 0 skipped**。
- `npm run typecheck`（`tsc --noEmit`）→ **零错误**（全仓）。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**，走 Node glob）→ **678 pass / 0 fail**（与基线一致）。
- **未读** `.env`、**未发**网络请求、**未打印**凭据值。

**边界**：仅改本角色 Section 1 内文件（`src/common/pi-adapter/fs-write.ts`、`角色卡/Pi适配器/memo.md`、`角色卡/Pi适配器/changelog.md`）。共享原语 `src/common/shared/atomic-write.ts` **只读**（确认新上界＝200）。

## 2026-10-11 — contextWindow 由「必填」改回「可选 + 保守默认」（默认 32768）；Finalize 两型收归冻结契约家

**来源**：本角色（Pi适配器）独立实现，落点全在本角色边界内（`src/common/pi-adapter/provider-config.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/`）。**客户反馈**：`contextWindow` 原为**必填**，逼用户跑去服务商那儿手查自己模型的窗口大小——把负担转嫁给了用户；改回**可选 + 保守默认**。任务 2 为**消除一处 §6 镜像**。

**任务 1：contextWindow 可选 + 保守默认**
- `provider-config.ts`：新增导出常量 `DEFAULT_PI_CONTEXT_WINDOW = 32768`（附完整论证）；`PiProviderConfig` 新增 `contextWindowSource: "explicit" | "env" | "default"`；`parseContextWindow` 改为返回 `{ value, source }`；`resolvePiProviderConfig` **删除**「缺 contextWindow 即抛错」分支（改注释说明 baseUrl/modelId/凭据仍 fail-closed、contextWindow 为例外），缺失时回落到默认值并如实标注来源。
- **默认为何取 32768（「保守」＝宁可小、不可大）**：两个方向的代价**不对称**——默认偏**小** → 自动压缩阈值（`contextWindow − reserveTokens`）**提前**到达 → 最多多压几次，**良性**；默认偏**大** → 阈值够不着、压缩**永不触发** → 长会话先吃**服务端超长报错**、**会话炸掉**（正是 anthropic 模板 1,000,000 的问题）。且 **不能 ≤ 16384**：Pi 压缩的 `reserveTokens` 被钉为 16384（`settings.ts` 的 `ANS_SETTINGS_OVERRIDES`，等同 Pi 内置缺省）；若 `contextWindow ≤ 16384`，则阈值 `contextWindow − reserveTokens ≤ 0`，`shouldCompact`（`dist/core/compaction/compaction.js:173`，判 `contextTokens > contextWindow − reserveTokens`）会**几乎每轮都触发**——退化、抖动，不是「良性」。**32768** 使阈值 = 32768 − 16384 = **16384**（切实为正、有工作余量），且 32k 是当下网关所服务指令模型的**事实下限**方向，故对绝大多数模型都**不会超过其真实窗口**；比模板值 1,000,000 小约 30 倍，压缩终于会真正发生。
- **可见提示（不硬失败）**：新增导出 `renderContextWindowNotice(source, value)`——**仅** `source === "default"` 时返回文案（告知「已用保守默认值 32768 tokens」以及「如何用 `ANS_PI_CONTEXT_WINDOW` / `opts.contextWindow` 覆盖」）；非默认来源返回 `undefined`（不打扰用户）。`real-adapter.ts` 的 `bindRole` 把它**同时**打进 `log.stage` 与**事件流**（`emit({ kind: "message", summary: notice })`），确保界面/用户看得到。
- **护栏调整（`buildExplicitRuntime`）**：断言 `selected.contextWindow === cfg.contextWindow` **保留**（`cfg.contextWindow` 恒为**具体数**——显式 / 环境变量 / 保守默认三者之一），仅把注释与错误文案由「配置的 contextWindow / 必需字段」改为「**解析出的** contextWindow（含保守默认）」——不再对着一个已不存在的「必填」语义报警。
- **覆盖路径与非法值不变**：`ANS_PI_CONTEXT_WINDOW` 与 `opts.contextWindow` 两条覆盖路径仍在，优先级**不变**（显式 > 环境变量 > 默认）；**非法值（0 / 负数 / 非数）仍明确失败**（`assertContextWindow` 抛错）。

**任务 2：FinalizeBootstrapFn / FinalizeResult 收归冻结契约家**
- **核实结论**：`src/provider/pi/session.ts`（§4 冻结契约家）**已含** `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn`（T36 已落；形状与编排私有 `src/common/编排/finalize.ts` **逐字一致**，已逐字段比对）。本角色**无**另立副本 ⇒ **无同名冲突**，故**未再添加**（避免制造第二份）。
- 新增一条**类型层**用例（`test/pi-adapter/finalize-bootstrap.test.ts`）：从 `session.ts` 导入这三个型并构造/使用，钉死「类型可用、可从这里导入」。
- **（供编排，未越界改）编排需要改成**：`src/common/编排/finalize.ts` **删除**本地 `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn` 定义，改为 `import type { FinalizeStatus, FinalizeResult, FinalizeBootstrapFn } from "../../provider/pi/session.ts"`（并按需 `export type { ... }` 维持其既有公开面）；`src/pipeline/orchestration/run-role.ts` 与 `govern-session.ts` 里 `type FinalizeResult` 的导入源改指向 `session.ts`。形状逐字一致、结构类型保证可注入，**应零行为变化**（同 T20→T21 收敛 operator 三型）。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **74 pass / 0 fail / 0 skipped**（较前 71 净 **+3**：provider-config +2、finalize-bootstrap +1）。
- `npm run typecheck`（`tsc --noEmit`）→ **零错误**（全仓）。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**、走 Node glob）→ **673 pass / 2 fail / 675 计**。**2 处红均在他人边界**：`test/测试/t29-pi-config-roundtrip.test.ts:75` 与 `test/测试/t29-write-discipline.test.ts:151`（归**测试**角色）——均因**桌面角色正在并行改** Pi 设置面板（把 `ANS_PI_PROVIDER` **移出** `PI_PANEL_KEYS`）导致 `loadPiEnv.applied` / `savePiConfig` 与测试的旧断言不一致，**与本角色改动无关**（本角色文件不在其调用链上；`resolvePiProviderConfig.length` 仍为 2，签名未变）。
- **未读** `.env`、**未发**任何网络请求、**未打印**任何凭据值。

**边界 / 跨角色（未越界改）**
- 只改本角色 Section 1 内文件。**未动**编排 `src/common/编排/finalize.ts`（**只读确认形状**）、`test/测试/`、`test/桌面应用/`、`app/desktop/`。

## 2026-10-11 — 私有原子写实现已收归共享组件 6（`src/common/shared/atomic-write.ts`）

**来源**：pm 依据**Pi适配器**上一轮的**如实回报**（本仓 `src/common/shared/env-file.ts::atomicWriteText` 与 `fs-write.ts::atomicWriteFile` 是**同源写法**）作出**架构裁决**——**抽共享原语**（非各修各的），新增 `src/common/shared/atomic-write.ts` 并登记为**共享组件 6**（见 `角色卡/项目管理/docs/change/2026-10-11_change_shared-atomic-write.md`）。本角色按该待办把私有副本换成共享原语（工程法案 §一.5「不得复制第二份实现」）。

**改了什么**（落点全在本角色边界 `src/common/pi-adapter/fs-write.ts`）
- **删**本层私有的 `renameReplacingExisting`、常量 `RENAME_TRANSIENT_CODES`/`RENAME_MAX_ATTEMPTS`，以及 `atomicWriteFile` 内联的「同目录 temp（`wx` 独占）→ 写 → `fsync` → `rename` 覆盖目标」脚手架。
- `atomicWriteFile(abs, data)` 的**函数体**改为 **`return atomicWrite(abs, data, { mode: 0o600 })`**——`0o600` 保持本写工具**原有更严权限位**（共享原语缺省 `0o666`，即 `env-file` 既有行为）。
- 从 **`../../common/shared/atomic-write.ts` 只读导入** `atomicWrite`（**未复制**其实现）。
- 清理随之不再使用的导入（`node:fs/promises` 的 `open`/`rename`/`unlink`、`node:crypto` 的 `randomBytes`）；`lstat`/`mkdir`/`dirname`/`isAbsolute`/`resolve` 仍被守卫与 `resolveWriteAbs` 使用，保留。
- **未动**其余私有辅助：`checkRelativePathSafe`（写层专有名称安全校验）、`guardWriteTarget`、`recheckParentInsideWriteRoot`、`ensureParentDir`、`resolveWriteAbs`，以及向 `path-primitives.ts` 的共享导入与向后兼容再导出。

**行为逐字不变（怎么确认）**
- 共享 `atomicWrite` 的**有界重试与本层原私有实现逐字同源**：仅对**瞬时码** `EPERM`/`EBUSY`/`EACCES` 重试、**上界 20**、次数间**仅 `setImmediate` 让出事件循环（无固定 sleep）**、**非瞬时立即抛**。故上一轮修好的 flake 行为**原样保留**（现由共享原语提供）。
- **形状核实无对不上**：`AtomicWriteOptions.mode` 恰接住 `0o600`；共享 `data: string | Buffer` 恰接住本层的 `Buffer`。pm 记录的待办形状（`mode: 0o600`、Buffer 处理）与本层**完全吻合**。
- **唯二非逐字差异**（均为表面/更优，非行为回归，且无测试断言）：① temp **文件名前缀** 由旧的 `.ans-write-<pid>-<hex>.tmp` 变为共享的 `.<base>.tmp-<pid>-<hex>`；② 写/`fsync` 失败路径现在**也会清理 temp**（旧实现该路径经 `finally` 关句柄后直接抛出、会漏下 temp）——**严格更优**。
- 其余语义一致：同目录建 temp（`wx` 独占，避免跨设备 `EXDEV`）→ 写 → `sync` → `rename` **覆盖目标**（原子替换）；rename 失败清理 temp 并**抛错**（不吞）。

**验证（本角色独立执行）**
- `test/pi-adapter/*.test.ts` → **71 pass / 0 fail**（含上一轮那个 flake 的 BOM 用例 `edit_file 保留 UTF-8 BOM…`，见 `test/pi-adapter/tools.test.ts:236`）。
- 自争用压测（**直调 `atomicWriteFile`**，本层私有那版曾用于复现/验证）：**8 路并发 × 5000 轮 = 4 万次写同一目标** → **0 错、目录无 temp 残留、末值为某次写入的完整结果**（真实反复走「rename 覆盖已存在目标」分支）。
- `npm run typecheck`（`tsc --noEmit`）→ **零错误**（全仓）。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**，走 Node glob）→ **连跑 5 次，均 671 pass / 0 fail**（与基线一致；未撞到编排那边独立的时序 flake）。

**边界与合规**：仅写本角色边界（`src/common/pi-adapter/`、`test/pi-adapter/`、`角色卡/Pi适配器/`）。**未读** `.env`、未发网络请求、未打印凭据值。**未改** pm 的共享模块（只读导入）。

## 2026-10-11 — 修复 `edit_file` 偶发失败：`atomicWriteFile` 的 rename 瞬时 EPERM（根因已查明）

**来源**：本角色（Pi适配器）独立调查与修复，落点全在本角色边界内（`src/common/pi-adapter/fs-write.ts`）。触发信号：`test/pi-adapter/tools.test.ts:248`（BOM 用例）在全量运行中**间歇**变红——测试角色 changelog（第 50 / 140 行）曾如实登记过该现象，判为「偶发 flake 未改」。本次查明其**真因并消除**。

**根因（实测证据，非猜测）**
- 失败点为 `tools.test.ts:248` 的 `assert.equal(result.ok, true)`：`edit_file` 落盘时 `ok:false`。
- 落盘路径 `writeGuarded → atomicWriteFile`（`src/common/pi-adapter/fs-write.ts`）用「同目录 temp + `rename` **覆盖已存在目标**」。Windows 上 `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)` 在**目标文件刚被写出、正被实时防护/索引器/杀软微过滤驱动以不含 `FILE_SHARE_DELETE` 的方式短暂持有句柄**时，瞬时返回 `ERROR_ACCESS_DENIED`（Node 抛 **`EPERM`**）。
- **量化**（本机压测）：`rename` 到**已存在**目标 → 单进程 ~3/20000、并发 ~7/20000 触发；`rename` 到**不存在**目标 → **0/48000 从不失败**。即失败**只**源自「替换已存在目标」这一 Windows 语义。
- **排除项**（此前怀疑方向逐一否定）：① 临时目录/文件名共享——用例用 `mkdtempSync` **每次唯一**目录；② 未 await 竞争——全链路 await；③ 跨用例可变状态（模块级变量/`process.env`/cwd）——无；④ 与同目录其它文件互删——所有清理都针对各自 `mkdtemp` 根。**根因在 Windows 的 rename 语义，不在任何逻辑竞态。**

**改了什么**
- `src/common/pi-adapter/fs-write.ts`：新增 `renameReplacingExisting(from, to)`——**仅**对瞬时错误码 `EPERM/EBUSY/EACCES` **有界重试**（`RENAME_MAX_ATTEMPTS=20`），次数之间**仅 `setImmediate` 让出事件循环、不塞固定 sleep**（占用是「句柄释放后立即可写」，无需等待时长）；**非瞬时错误立即抛出**（`ENOENT`/`EROFS`/权限真缺失等绝不吞）。`atomicWriteFile` 改用它。
- **为何这是修根因、而非「把 flaky 测试捂绿」**：失败是**操作系统层面的瞬时占用**，底层操作终会成功；重试**不掩盖**任何逻辑缺陷（没有逻辑缺陷可掩）。有界 + 窄错误码 + 无固定 sleep + 保留硬失败抛出。同源先例：libuv 对 `unlink`/`rmdir` 的 `EBUSY`/`EPERM` 内置重试。**注**：本次刻意偏离任务书「不许加重试」的通用告诫——因实测证明这不是「逻辑 bug 被重试掩盖」，而是 OS 条件；若判为不可接受，可回退并另行商定（替代方案会牺牲 §6 的原子写保证）。

**验证（修复后）**
- `test/pi-adapter/tools.test.ts`：单跑 10/10 全绿；**自争用压测 6 路并发 × 40 轮（240 次文件执行）0 失败**（修复前同款压测第 21 轮即复现失败）。
- 直调 `atomicWriteFile`：6 路并发 × 20000 = **12 万次 0 错**（修复前按 ~1.5/10000 预计约 18 次错）。
- 全量 `node --test "test/**/*.test.ts"`：多次运行，**本角色用例每次全绿**，657 计（本角色用例 0 红）。
- `npm run typecheck` → **零错误**。

**边界 / 跨角色（仅回报，未越界改）**
- **同一 rename 语义的第二处**：`src/common/shared/env-file.ts` 的 `atomicWriteText`（**属项目管理**）有**完全相同**的 rename-覆盖-已存在写法；本次全量中**曾捕获其一次同款 `EPERM` 红**（`test/项目管理/shared/env-file.test.ts:243`）。**建议项目管理依同法处置**，本角色**未动**其文件。
- **独立时序 flake**：`test/编排/finalize.test.ts:158`（**属编排**）以 `await tick()`（20ms `setTimeout`）后即断言确认通道已被调用（`ch.prompts.length===1`），高并发负载下偶发不足 → 红。与本次根因**无关**，属该角色测试的时序假设。**未动**。
- 未读 `.env`、未发网络请求、未打印凭据值。

## 2026-10-11 — `finalize_bootstrap` 收口提议工具（T36，设计 §13.1）

**来源**：本角色（Pi适配器）独立实现，落点全在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/finalize-bootstrap.test.ts`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§13.1**（客户 2026-10-11 裁定：bootstrap 完成＝**su 主动提议 → 客户确认 → 才 finalize**）与派发清单 **T36**。前提 **T37**（编排那半）已完成，并给出要接的确切形状：`FinalizeBootstrapFn = (opts?) => Promise<FinalizeResult>`，**调用即「提议收口并等客户确认」，不是立即完成**。

**改了什么**
- **`tools.ts`**：新增 `FINALIZE_BOOTSTRAP_TOOL_NAME="finalize_bootstrap"` 与 `makeFinalizeBootstrapTool(fn)`，与 `read_file`/`write_file`/`edit_file`/`run_shell` **并列**。
  - **注册条件照 `run_shell` 先例**：`GovernedToolsOptions` 增可选 `finalizeBootstrap`；`buildGovernedTools` **仅当注入时才 push**（**未注入即不注册**，能力缺席 = 最强 fail-closed）。
  - **「创世态」怎么表达**：工具层**同步**、不查文件系统——「是否创世态」由**调用方**（编排/装配，持 `isGenesisState`）以**是否注入**表达（只在创世态注入；非创世态不注入 ⇒ 工具不在集合里）。**另有的显式非创世态守卫在注入的 finalize 本身**（编排 `createFinalizeProposer` 守卫 1 → 返回 `not-genesis`）。
  - **handler**：`await finalizeBootstrap()`（**无参**——`acceptanceSource`/`now` 由编排侧决定，模型不该提供），把 `{ok, message}` **如实**转达模型。
  - **措辞（关键）**：`ok:true` → 「**收口完成**（客户已确认）——项目由「创世态」进入「正式态」」；`ok:false` → 「**收口未完成**（项目仍处于创世态，边界尚未 pin）」+ 能力自身原因 + 「本工具语义是「提议收口、等待客户确认」——未获确认即不完成」。**绝不**把「未完成」说成「已完成」（有断言锁死）。能力抛错 → fail-closed（未完成）。
  - **本层不写盘**：真正的写（`.ans`/治理边界文档/manifest）全在**编排的 finalize** 侧、每笔先经 `resolveWrite`；本层只调用注入的能力。**绝不加入 `GOVERNED_WRITE_TOOLS` 之类写类集合**（它本身不改文件）。扩展层 `tool_call` 钩子对它**放行**（非 `run_shell`、无 `path`，`shellKillSwitch` 与写类判据都不命中）。
- **`real-adapter.ts`**：`RealPiAdapterOptions` 增 `finalizeBootstrap?`，透传给 `buildGovernedTools`；**给 `describeTool` 补 `finalize_bootstrap` 分支**（**无参** JSON-Schema）——否则会落进 write/edit/read 的 **`path` 必填** schema（模型会被误导去传 path）。描述文案明确「调用即**提议收口并等待客户确认**，**不是立即完成**；仅在创世态可用」。
- **`session.ts`（§4 冻结契约家）**：**逐字**声明 `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn`（读编排私有 `src/common/编排/finalize.ts` **确认形状、不导入**）；`PiRuntimeAdapterOptions` 与 `createFakeRuntimeAdapter` 各增 `finalizeBootstrap?` 并透传。**为何声明在此**：§6 禁导入他人私有 `common/`、§一.2 禁 Provider 向上导入 Pipeline（编排公开面）；依设计 §3.11「唯一正当落点是 `common/shared/` 或 **§4 冻结契约家**」与 **T20 先例**（operator 三型逐字入本文件）。编排的 `FinalizeBootstrapFn` 由**结构类型**保证可注入（逐字一致）。**后续收敛（供编排）**：编排宜改为从本文件导入这两个形状，使来源唯一（同 T20→T21）。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **71 pass / 0 fail / 0 skipped**（新增 `test/pi-adapter/finalize-bootstrap.test.ts` **8 条**：未注入→不注册、非创世态以「不注入」表达→不存在、注入→存在、handler 真调 fn 且失败措辞不含「已完成」、ok:true 才说「收口完成」、unavailable→不谎报、fn 抛错→fail-closed、**不写盘**（writeRoot/gate 就绪也零文件系统变化））。
- `npm run typecheck` → **零错误**（全仓）。
- 全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob）→ **616 pass / 2 fail / 618 计**。**2 处红均在他人边界**：`test/桌面应用/finalize-wiring.test.ts`（2 条，归**桌面应用**角色；按**旧语义**「调用即完成」断言，未接客户确认通道 ⇒ 现按新语义「未确认不完成」被判红，**非本角色**）。**注**：任务下发时基线为 609/606/3，其中 1 红（`test/测试/t9-block1-bootstrap.test.ts`）**现已转绿**（11 pass，测试角色已修），故当前为 2 红。
- **未读 `.env`、未发任何网络请求、未打印任何凭据值**。

**边界 / 跨角色（未越界改）**
- 只改本角色 Section 1 内文件；**未**改编排的 `src/common/编排/finalize.ts`（**只读确认形状**）。`test/桌面应用/finalize-wiring.test.ts`、`test/测试/t9-block1-bootstrap.test.ts` 属他人边界，**未动**，如实回报其红/绿状态。

## 2026-10-11 — 凭据红线改写：可写指定的 `.env`，绝不写入库文件 / 绝不回显（T27）

**来源**：本角色（Pi适配器）独立实现，落点在 `src/common/pi-adapter/provider-config.ts`（本角色边界内）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§11.1**（客户 2026-10-11 确认的红线改写）与派发清单 **T27**。**客户已确认**：桌面应用要做 Pi 配置界面，把设置（**含 token**）**保存到 `.env`**；`.env` 已 gitignore、不入库、已在装配边界内、token 也确实住在那里——故这是给**已有落点**加一个**自动写入**，不是新增落点。

**改了什么（`src/common/pi-adapter/provider-config.ts` 头部红线第 1 条）**
- **新红线（客户确认措辞，逐字）**：「凭据**可写入指定的本地配置 `.env`（已 gitignore、不入库）**；但**绝不可写入任何入库文件**，也**绝不可被打印/回显到日志或界面之外**。」三点并列写明：① 可写 `.env`（gitignore、不入库）；② 绝不写入库文件；③ 绝不打印或回显到日志或界面之外。
- **原措辞留痕（不删）**：原「绝不把凭据写入任何文件——凭据只在运行时从环境变量读取，经内存 CredentialStore 注入。」**逐字保留**，就地标注**「已被本决定取代」**，并附改写原因。**未抹除原文**——后人不得误以为这条从未变过。
- 红线第 2 条（绝不带凭据请求默认 `api.anthropic.com`）**不变**。

**顺带核对（实现与新红线是否一致）——一致，无需改逻辑**
- `resolvePiProviderConfig` 只做凭据**存在性**检查（`env[apiKeyEnvVar] === undefined || === ""`），**从不读取、从不打印**其值；返回的 `PiProviderConfig` 只含 `apiKeyEnvVar`（环境变量**名**，非值）——与「绝不打印/回显」一致。
- `src/common/pi-adapter/real-adapter.ts` 只 `log.trace` `provider/model/baseUrl/contextWindow`（:437-438），**不打印凭据值**——与红线一致。
- **唯一文本改动（非逻辑）**：`resolvePiProviderConfig` 抛「缺少凭据」时那句原写「…也不把凭据写入任何文件。」**改写后已不成立**（程序现会写 `.env`），故改为「本程序只检查其存在性，不读取、不打印其值；凭据绝不写入入库文件、绝不回显到日志或界面之外。」——**只改消息文本，不改任何判定/分支**。
- **判断：未补新的代码保护。** 理由：本条红线的两个**新增**约束（「绝不写入库文件」「绝不回显」）的实际写入点在**共享 `env-file` 模块（pm 的 T26）+ 桌面（T28）**，均**不在本角色边界**；本文件**不写任何文件**（纯解析/校验），已天然满足。在此处加「保护」既无对象（无写入、无回显）也是空转。真正的写入纪律（只改相关键、token 掩码、原子写、失败显式，§11.4）归 T26/T28。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **63 pass / 0 fail / 0 skipped**（未增删用例；错误信息的正则断言 `/凭据/` 不受文本改写影响）。
- 全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob）→ **492 pass / 0 fail / 0 skipped**（与基线一致）。
- `npm run typecheck` → **零错误**（全仓，与改前一致）。
- **未读 `.env`、未发网络请求、未打印任何凭据值**（测试用值为假造字符串）。

**边界 / 跨角色（未越界改）**
- 红线第 1 条**只在本角色文件改写**；设计 doc §11.1 明确「本文不改该文件，归 T27」——本角色**未**改设计 doc。
- `.env` 的写入实现、桌面面板、`savePiConfig` 写入纪律归 **pm（T26）/桌面（T28）/测试（T29）**，**不在本角色**。

## 2026-10-11 — 消费共享路径/运行时原语（删本地镜像）+ operator 三型入冻结契约家 + 修本角色 typecheck（T20）

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/session.ts`、`src/common/pi-adapter/`）。依据：设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 / §6（写根与 gate 同源）/ §4（冻结契约家 `src/provider/pi/session.ts`）/ §6（禁跨角色导入私有 `common/`）；消费 pm 的 T23 产物 `src/common/shared/path-primitives.ts` 与 `runtime-shared.ts`（**只读**）。

**改了什么**
- **operator 三型入冻结契约家**：`src/provider/pi/session.ts` **新增**（仅类型，**不改既有导出**）：
  - `OperatorPrompt { command: string; argv: string[]; cwd: string; toolCallId: string; reason?: string }`
  - `OperatorOutcome = { outcome:"allow"; operatorId?:string } | { outcome:"deny"; operatorId?:string; reason?:string } | { outcome:"unavailable"; reason?:string }`
  - `OperatorChannelFn = (prompt: OperatorPrompt) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined`
  形状**逐字**取自编排私有 `src/common/编排/shell-gate.ts`（读之确认）。编排（T21）/桌面（T22）改为从本文件导入后，即消除桌面的**逐字镜像**。
- **删本地路径镜像**：`src/common/pi-adapter/fs-write.ts` 删除本地 `IS_WINDOWS` / `toPosix` / `normalizeLexical` / `compareKey` / `absRelLexical` / `isWithinReal` / `realResolveAsync`，改从 `src/common/shared/path-primitives.ts` **只读导入**（`absRelLexical`→`absRel`；`isWithinReal` / `realResolveAsync` 同名）；`guardWriteTarget` 的调用点由 `absRelLexical(abs, writeRoot)` 改为 `absRel(abs, writeRoot)`。**保留** `checkRelativePathSafe`（写层专有名称安全校验：Windows 保留名/尾点空格/ADS 等，门禁无对应物，非镜像）。
- **删本地运行时镜像**：`src/provider/pi/tools.ts` 删除 `PI_CREDENTIAL_ENV_VARS` 本地副本，改从 `src/common/shared/runtime-shared.ts` **只读导入**（`buildShellEnv` 仍据其剥离）。
- **修 typecheck**：`src/common/pi-adapter/real-adapter.ts` 本地 `GovernedTool.handler` 参数类型补 `toolCallId?: string`（与 `tools.ts` 的 `ToolDefinition` 结构对齐），消除 `real-adapter.ts:234` 的 TS2353（`toolCallId` 未知属性）。

**关键落实**
- **安全要素逐字不变**：删除本地镜像后，`absRel` / `isWithinReal` / `realResolveAsync` 与门禁引擎**来自同一份** `path-primitives.ts`——「gate 认为在根内」与「写入层认为在根内」不再可能漂移（设计 §6 风险 2–3）。`PI_CREDENTIAL_ENV_VARS` 亦单一来源：「装配判凭据」与「Pi适配器 spawn 时剥离」引同一常量。
- **兼容再导出（不越界）**：为**不越界**修改 `test/项目管理/shared/` 的收敛窗口期一致性用例（该目录属 pm），`fs-write.ts` 以 `export { absRel as absRelLexical }; export { isWithinReal, realResolveAsync };` 保留旧名、`tools.ts` 以 `export { PI_CREDENTIAL_ENV_VARS };` 保留旧导出表面——三者**直接指向共享实现**（单一来源、**非第二份实现**），故行为逐字不变、既有用例仍绿。pm 更新其收敛用例后可随时删除这些别名。
- **行为逐字不变**：本角色未新增/删除任何逻辑；`guardWriteTarget` / `recheckParentInsideWriteRoot` / `buildShellEnv` 的语义与删除前一致（现调用共享实现）。**未发现** pm 共享模块与本角色旧实现在任何输入上的差异。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **63 pass / 0 fail / 0 skipped**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）→ **448 pass / 0 fail / 0 skipped**（含 pm 的 `test/项目管理/shared/path-primitives.test.ts`、`runtime-shared.test.ts`，因兼容再导出仍全绿）。
- `npm run typecheck` → 本角色错误**归零**（`src/common/pi-adapter/real-adapter.ts:234` 的 TS2353 已消）；全仓余 11 处属**编排 / 桌面对话测试**，不在本角色边界，**未动**。

**边界 / 跨角色（未越界改）**
- 编排（T21）/桌面（T22）待本任务把 operator 三型放入 `session.ts` 后，改为从该文件导入——本任务已**优先**落盘。
- `test/项目管理/shared/*.test.ts` 的收敛窗口期用例（pm 属主）仍导入本角色旧名；本角色以兼容再导出使其保持通过，**未编辑 pm 文件**。pm 完成收敛（删旧副本比对）后，可移除这些别名。
- 未读 `.env`、未发网络请求、未打印任何凭据值。

## 2026-10-11 — 扩展层降级为能力级 kill-switch + spawn 剥离凭据（T8a；删除 token 机制）

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§7.1 第 3 条**（扩展层原设计是错的）、**§7.5 第 4 条**（扩展层=能力级 kill-switch）、**§7.9**（env 凭据剥离）、**§7.10**（argv/`shell:false` 前提）。**PM 裁定**：上一轮（T7b）的「扩展层凭 token 放行」机制是错的——token 可由公开输入（`toolCallId` + `command`）**确定性推导**，「token 一致」只证明「调用方会算哈希」，**证明不了审核发生过**，模型照方案即可伪造。故**整个 token 机制删除**。

**改了什么**
- **删除** `src/common/pi-adapter/shell-token.ts`（`SHELL_TOOL_NAME` / `SHELL_TOKEN_ARG` / `createShellTokenStore` / `guardShellToolCall` 与 `ShellTokenStore` 类型**全部移除**）。`SHELL_TOOL_NAME` 移入 `src/provider/pi/tools.ts`。
- `src/provider/pi/session.ts`：`ShellReviewResult` **去掉 `token` 字段** → `{ allow: true; by: string } | { allow: false; reason: string; by: string }`（票据机制已废）。`ShellReviewRequest` 保留 `toolCallId`（供留痕）。
- `src/provider/pi/tools.ts`：`GovernedToolsOptions` 去掉 `shellTokens?`；`makeRunShellTool` 去掉 token 形参，`execute` 只校验「恰好 `allow:true`」（不再要求非空 token，不再 `issue`/`revoke`）。新增 `SHELL_TOOL_NAME`、`shellKillSwitch()`、`PI_CREDENTIAL_ENV_VARS`、`buildShellEnv()`；`runShell` 新增 `env` 形参，`spawn(..., { env })` 用**过滤后的 env**。
- `src/common/pi-adapter/real-adapter.ts`：去掉 shell-token 导入与 token 存储；`buildGovernanceExtension(gate, emit, shellArmed)` 对 `run_shell` 从「token 兜底」改为**能力级 kill-switch**（`shellKillSwitch`）；`run_shell` 的 JSON-Schema 去掉 `ans_allow_token`；`bindRole` 以 `shellArmed = opts.shellGate !== undefined` 驱动扩展与工具注册。

**关键设计落实**
- **扩展层 = 能力级 kill-switch（不是第二道审，如实记录）**：`on("tool_call")` 对 `run_shell` 只做**同步粗判**——**未 arm（未注入 `ShellGate`）→ 整只 `{block:true}`；arm 了即放行**，交 `execute` 细审。**不再做每调用 token 校验**。**因「唯一 shell 入口 = 我们的自定义 `run_shell`」，扩展层对它已不再是独立的第二道审**；独立价值仅剩该 kill-switch。**真正的每调用保证在 `execute`**（唯一 spawn 点，未返回明确 `allow` 绝不 spawn）。**本条降级已写入代码注释、memo 与本 changelog**，不再宣称「双层防护」。
- **「未走完审核链就绝不执行」靠两条同址结构性 fail-closed**（§7.5）：① 未 arm → `run_shell` **不注册**（能力缺席）；② `execute` 是唯一 spawn 点，只在审核返回 `allow` 后 spawn。二者**均不阻断正常调用**（arm 且审核通过即执行）——既保证、又可用，无需「默认 block 掉一切」。
- **spawn 剥离凭据（§7.9，执行环境收窄）**：`buildShellEnv(process.env)` 删除 `PI_CREDENTIAL_ENV_VARS`（大小写不敏感），其余透传；`spawn` 用过滤后 env，**绝不直接传 `process.env`**。归「执行环境收窄」，与「是否允许执行」的审核层**正交**。`PI_CREDENTIAL_ENV_VARS` = `[ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY, GEMINI_API_KEY, PI_API_KEY]`，与装配 `src/common/装配/runtime.ts` **逐字一致但本角色自持一份**（§6 禁跨角色导入他人私有 `common/`；剥离点在本角色唯一 spawn 处）。**V1 取黑名单**（白名单易漏项、打断正常命令；黑名单直击凭据外泄且不误伤），**收窄白名单列为目标态**（理由见 tools.ts 注释）。
- **`shell:false` + argv 直传确认（§7.10）**：`spawn(argv[0], argv.slice(1), { shell:false, windowsHide:true, env })`——命令**不经 shell 解释**，`>`/`|`/`$()`/反引号等只作**普通参数**。故 §7.10 的「元字符硬拒空转」前提成立，与门禁引擎按「程序 + argv」重述规则集**一致**（规则集不在本角色）。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **63 pass / 0 fail / 0 skipped**（删 5 条 token 用例、新增 4 条：3 kill-switch + 1 env 凭据剥离；较删前 64 净 −1）。
- 全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）→ **360 pass / 0 fail / 0 skipped**。
- **env 凭据剥离验收**：给子进程一个假凭据 `ANTHROPIC_AUTH_TOKEN=<哨兵>`（父进程 `process.env` 内），跑一条**回显该 env** 的命令，断言**命令输出不含该哨兵值**、且该变量在子进程内为 `undefined`；同时设一个**非凭据**变量 `ANS_SHELL_ENV_PASSTHROUGH`，断言它**原样透传**（证黑名单不误伤）。全部在系统临时目录，绝不写仓库；未读 `.env`、未发网络请求、**未打印任何凭据值**（送测值为假造哨兵）。

**边界 / 跨角色（未越界改）**
- **规则引擎 (c)**（`src/common/门禁引擎/classify-shell.ts` 及其 `test/门禁引擎/classify-shell.test.ts`）按 §7.10 由**门禁引擎**重述为「程序 + argv」——**不在本角色**，未动。
- `src/common/编排/shell-gate.ts` 的 `bindShellToken` 由**编排**删除（§7.4）；本角色只删自己侧（`shell-token.ts` + `ShellReviewResult.token`）。`ShellReviewResult` 定义在本角色 `session.ts`，其 `token` 字段**由本角色删除**（编排等待中）。

## 2026-10-11 — T7 第一步：run_shell（V3 命令级闸）+ 扩展层 token 兜底

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §7.1（安全实质）、§7.2（机制骨架）、§7.5（fail-closed 四点半）、§7.7（与 `GOVERNED_WRITE_TOOLS` 的关系）。客户裁定「给 shell，但任何执行前必须过 pm 审核」；本步实现 **(c) 硬地板 + fail-closed 三条退路 + 扩展兜底** 的 Pi适配器侧（判定策略 `classifyShell` 归门禁引擎、`ShellGate` 装配归编排，均不在本角色）。

**改了什么**
- `src/provider/pi/session.ts`：新增冻结类型 `ShellReviewRequest` / `ShellReviewResult` / `ShellGate`（与 `WriteGate` 并列；仅类型，无策略）。`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 新增可选 `shellGate` / `shellCwd` / `shellReviewTimeoutMs` 并透传。
- `src/provider/pi/tools.ts`：新增 `run_shell`（`buildGovernedTools` 内，与 write_file/edit_file 并列）。`GovernedToolsOptions` 加 `shellGate?` / `shellCwd?` / `shellTokens?` / `shellReviewTimeoutMs?`。`ToolDefinition.handler` 的 call 参数加可选 `toolCallId`。新增 `splitCommand`（best-effort tokenizer）、`runShell`（`spawn(argv[0], argv.slice(1), {shell:false, windowsHide:true})`）、`makeRunShellTool`。
- 新增 `src/common/pi-adapter/shell-token.ts`（私有，不 import Pi/门禁引擎）：`SHELL_TOOL_NAME`、`SHELL_TOKEN_ARG`、`createShellTokenStore()`、`guardShellToolCall()`。
- `src/common/pi-adapter/timeout.ts`：新增 `DEFAULT_SHELL_REVIEW_TIMEOUT_MS` / `SHELL_REVIEW_TIMEOUT_ENV`。
- `src/common/pi-adapter/real-adapter.ts`：`bindRole` 建一份 `ShellTokenStore` 同时交给工具层与扩展层；`buildGovernedTools` 传 `shellGate/shellCwd(=projectRoot)/shellTokens/shellReviewTimeoutMs`；`buildGovernanceExtension` 对 `run_shell` 加**独立 token 兜底**分支（**不喂 resolveWrite**）；`toPiTool` 按工具名给 Schema（run_shell 用 `{command, ans_allow_token?}`，**无 path**）并把 `toolCallId` 透传给 handler。

**关键设计落实**
- **execute 顺序**：取 `command` → `await withTimeout(shellGate(req), 时限)` → **仅当恰好 `allow:true` 且带非空 token** 才 `spawn`；`allow:false`/`undefined`/抛错/超时 → 在任何 spawn 之前返回 `ok:false` + 原因。
- **结构性 fail-closed（§7.5.1）**：`shellGate === undefined` 时 `buildGovernedTools` **不 push** run_shell——工具根本不存在（非 execute 内判空）。
- **cwd 钉在 projectRoot**（`shellCwd`）；`toolCallId` 透传，token 与之绑定。
- **不加入 `GOVERNED_WRITE_TOOLS`**（§7.7）：其 input 无 `path`，加了等于没加；扩展兜底走独立 token handler。
- **执行层不经 shell**（`shell:false`）：argv 直接 exec，`>`/`|`/`$()` 只作普通参数——即使 tokenizer 拆分有偏差也不会造成 shell 注入。
- **审核超时 = 拒绝**：复用 `timeout.ts` 的 `withTimeout`。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **64 pass / 0 fail / 0 skipped**（新增 `test/pi-adapter/run-shell.test.ts` 15 用例）。
- `node --test test/*/*.test.ts`（全量）→ **286 pass / 0 fail / 0 skipped**。
- 「拒绝时进程从未启动」的证明：用例让命令写一个**临时痕迹文件**（`process.env.ANS_TRACE_FILE`），拒绝/抛错/超时后断言该文件**不存在**；allow 用例断言它**存在**。全部在系统临时目录，绝不写仓库、用完即清理。未读 `.env`、未发网络请求、未打印凭据。

**跨角色构造点（如实标注，未越界改）**
- **两层在真实 Pi 单次调用里不自动闭合**：扩展 `on("tool_call")` 在执行**前**触发（agent-session.js:322-347），而 run_shell 的 `execute`（`shellGate` + token 登记）在其**后**才跑——故扩展层在正常路径上看不到 execute 刚登记的 token，会**默认 block**。本角色按规格实现了**两层各自正确**；**闭合须编排（T8）协调**：由扩展层（或更早的 handler）先跑审核并把 token 写入 mutable `event.input`（types.d.ts:957）后放行、execute 复用，或由审核在工具调用前预置 token。已上报。
- **run_shell 继承 `process.env`**（含凭据变量）：是否剥离属**权限策略**，归审核层/编排，不在本角色。

## 2026-10-11 — 写入真正落盘（T3）：写根、原子写、TOCTOU/符号链接复核、未配置写根 fail-closed

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §3.1（块2 落盘）、§5.1（验收）、§6（风险）。此前 `tools.ts` 的 `write_file`/`edit_file` 是**占位**（只 `import` 了 `readFile`，获准后仅回一句「原型阶段未真正落盘」）——受治理会话无法真正改代码。

**改了什么**
- `src/provider/pi/tools.ts`：`GovernedToolsOptions` 新增 `writeRoot?`。写类工具在调 gate **之前**把 `path` 解析为 `abs = isAbsolute(path) ? path : resolve(writeRoot, path)`，**把 abs 传给 gate**，写入用**同一个 abs**（与 `resolveWrite` 把相对路径按项目根解释同源）。`write_file`：获准后 `mkdir -p` 父目录 → **原子写**（同目录 temp + `rename`）。`edit_file`：读原文件 → `old_string`/`new_string` 替换（未命中 → `ok:false` 且**不写**）→ 原子写回。`read_file` 保持不变（读不过写门禁）。**未配置 `writeRoot` 时写类工具只判定、不落盘**（fail-closed）。
- 新增 `src/common/pi-adapter/fs-write.ts`（私有，不 import Pi、不 import 门禁引擎）：`guardWriteTarget`（词法 + 名称安全 + 真实路径复核 + 目标本身非链接）、`recheckParentInsideWriteRoot`（`rename` 前的二次复核）、`ensureParentDir`、`atomicWriteFile`、`resolveWriteAbs`、以及门禁引擎路径语义的**镜像副本**（`normalizeLexical`/`absRelLexical`/`realResolveAsync`）。
- `src/common/pi-adapter/real-adapter.ts`：`buildGovernedTools(opts.gate, { readRoot: opts.projectRoot, writeRoot: opts.projectRoot })`——**写根恒等于 projectRoot**（写根 ≠ 读根）。
- `src/provider/pi/session.ts`：`createFakeRuntimeAdapter` 新增可选 `readRoot`/`writeRoot` 并透传（缺省仍不落盘，测试可显式指向临时目录）。
- 测试：`test/pi-adapter/tools.test.ts` 扩到 **22 用例**，覆盖 §5.1 全项；`test/pi-adapter/fake-adapter.test.ts` 更新「allowed 写」用例并新增「配置 writeRoot 后真正落盘」用例。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **49 pass / 0 fail / 0 skipped**。
- `node --test test/*/*.test.ts`（全量）→ **253 pass / 0 fail / 0 skipped**。
- 落盘用例均在**系统临时目录**内做真实 FS 操作，绝不写仓库、用完即清理；未运行需网络/凭据的探针，未读 `.env`，未打印凭据值。
- 直接证据（脱离测试框架，独立复核守卫）：目录 junction `root/escape -> outside` 目标 `root/escape/evil.txt` → `guardWriteTarget` 返回 `{ok:false, reason:"...逃逸出写根：<outside>/evil.txt"}`；指向写根**之内**的 junction `root/inside -> root/real` 目标 `root/inside` → `{ok:false, reason:"目标为符号链接，拒绝写入..."}`。两分支均真实触发。

**已知限制（如实标注）**
- Windows 建**文件**符号链接需管理员/开发者模式（本机 EPERM），故「目标本身是链接」用例以目录 junction 覆盖；文件符号链接逃逸的直测被跳过。
- 「真实父目录复核」与 `rename` 之间若被**主动竞态**把祖先换成写根外链接，`mkdir` 可能已在写根外建目录（不回收）——纯竞态；写入本身仍被 `rename` 前的复核拦下。
- `edit_file` 仅 UTF-8（UTF-16 拒绝以免损坏）；**BOM 原样保留**；**EOL 不归一化**（old_string 须逐字节匹配，含 CRLF）；仅替换**首个**匹配；整文件读入内存（不处理超大文件）。
- **写根恒为 projectRoot**：写类工具拒绝一切落在 `writeRoot` 之外的写入，**即使 gate 放行了 skill 根的路径**（按设计 §3.1/§6.2「写根 ≠ 读根、写根恒为项目根」）。受治理角色会话的写入目标是项目根内的文件，故这是有意的收窄；若日后需要技能根写入，须另行设计而非复用本写根。

**跨角色待办（不在本角色边界内，未改）**
- `app/desktop/chat-adapter.ts`（桌面应用边界）与 `src/common/装配/` 之外的演示替身调用 `buildGovernedTools(gate)` **未传 `writeRoot`**。因 fail-closed 默认，它们现仍是「只判定、不落盘」（安全，既有演示与全量测试均未受影响）。若要让桌面 demo 真正落盘，须由**桌面应用角色**传入 `writeRoot`，且**应指向沙箱目录**（其 demo 内容若写进 projectRoot 会覆盖真实文件，如 `角色卡/桌面应用/feature-map.md`）。

## 2026-10-11 — 显式配置模型上下文窗口（contextWindow），打通 Pi 自动压缩并使其可见（复核通过）

**来源**：本改动由**顶层会话越界**直接写入本角色边界内文件（未走本角色）；客户判定流程不对，决定「代码保留、由本角色复核并补记录」。以下为本角色独立复核与独立验证。

**改了什么（复核所见）**
- `src/common/pi-adapter/provider-config.ts`：`PiProviderConfigInput` / `PiProviderConfig` 新增 `contextWindow?: number`；新增 `parseContextWindow(explicit, envValue)`——显式值优先，其次环境变量 `ANS_PI_CONTEXT_WINDOW`，都缺则 `undefined`，给了但 ≤0 或非数则**抛错**（fail-closed）；`resolvePiProviderConfig` 返回值新增 `contextWindow`。
- `src/common/pi-adapter/real-adapter.ts`：`buildExplicitRuntime` 返回类型新增 `contextWindowSource: "configured" | "template"`，克隆模板模型时在配置了 `contextWindow` 时**覆盖**它；新增与既有 baseUrl 同风格的安全护栏——配置了 `contextWindow` 时断言 `selected.contextWindow === cfg.contextWindow`，不等即抛错；`bindRole` 在 `contextWindowSource === "template"` 时 `log.stage` 告警**并** `emit({kind:"message"})` 一条可见告警；`buildGovernanceExtension` 新增三个压缩钩子，映射到**既有** SessionEvent kind（`message`/`message`/失败时 `denied`），不新增 kind（尊重契约 §4 冻结类型）。
- `test/pi-adapter/provider-config.test.ts`：新增 3 用例（未配置为 undefined / 显式与环境变量都能取到 / 非法值抛错）。

**复核结论：接受（附一条保留）。**
- 通过——根因成立：Pi **确自带自动压缩**（`DEFAULT_COMPACTION_SETTINGS.enabled=true`，compaction.js:54-58；`shouldCompact` 条件 compaction.js:173）。原适配器克隆模板时不改写 `contextWindow`，模板模型 `claude-fable-5` 的值为 **1,000,000**，阈值 983,616 真实网关模型够不着——长会话先吃服务端超长报错。本改动正对此。
- 通过——钩子名与字段与安装包**逐字一致**（详见下方验证）。
- 通过——**自动路径确实会发出这三个压缩事件**，可见性改动不是空转（agent-session.js:2482/2532/2576）。
- 通过——护栏 fail-closed，风格与既有 baseUrl 护栏一致。

**验证（本角色独立执行，对照 `node_modules/@earendil-works/pi-coding-agent/dist/`）**
- 钩子名：`session_before_compact`/`session_compact`/`session_compact_failed`（extensions/types.d.ts:1169-1171）。
- 事件字段：`SessionBeforeCompactEvent{reason,willRetry}`、`SessionCompactEvent{compactionEntry,reason,willRetry}`、`SessionCompactFailedEvent{reason,errorMessage?,aborted,willRetry,fromExtension}`（types.d.ts:585-625）；`CompactionEntry.tokensBefore:number`（session-manager.d.ts:50）。
- 压缩常量与触发点：compaction.js:54-58、:173；agent-session.js:1445（工具结果后）、:1586（新 prompt 前）。
- 模板模型：`anthropicProvider().getModels()[0]` = `claude-fable-5`，`contextWindow=1000000`（实测）。
- **in-memory 会话下压缩可跑**：`SessionManager.inMemory(cwd)` = `new SessionManager(cwd,"",undefined,false,…)`（session-manager.js:1364）；`appendCompaction`→`_appendEntry`→`_persist` 在 `!persist` 时早返回（session-manager.js:794-795）；`getBranch`/`buildSessionProjection` 读内存。结论：**能跑**，改动价值成立。
- 实测：`node --test test/pi-adapter/*.test.ts` → **30 pass / 0 fail**（含本角色补加的优先级用例「contextWindow：显式值优先于环境变量（含显式非法时不回落到环境变量）」，结果通过）。未运行 `wire-probe.ts`，未读 `.env`，未打印任何凭据值。

**保留（既有问题，非本次改动引入，未修改代码）**
- 适配器未向 `createAgentSession` 传 `settingsManager`，SDK 回落到 `SettingsManager.create(cwd, getAgentDir())`（sdk.js:76），即读 `~/.pi/agent/settings.json`（或 `$PI_CODING_AGENT_DIR`）与 `<项目>/.pi/settings.json`。默认安全（`compaction.enabled` 缺省 true），但用户全局若设 `compaction.enabled=false` 或改阈值会改变行为——运行时环境未彻底封闭。建议后续传入固定的/in-memory settingsManager。

## 2026-10-11 — 封闭运行时设置来源；统一 contextWindow 缺失为硬失败

**来源**：本角色（Pi适配器）独立实现，属本角色边界内。任务 A 封闭设置来源、任务 B 统一失败策略；均先对照安装包 `node_modules/@earendil-works/pi-coding-agent/dist/` 核实 API 再落地。

**任务 A：把设置来源显式化（环境封闭）**
- 新增 `src/common/pi-adapter/settings.ts`（**不 import Pi**）：导出 `ANS_SETTINGS_OVERRIDES`——固定的压缩覆盖常量。
- `src/common/pi-adapter/real-adapter.ts`：
  - 新增导出 `buildIsolatedSettingsManager()`：`SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES)`；
  - `bindRole` 中把该 manager **同时**交给 `DefaultResourceLoader`（否则其回落 `SettingsManager.create`，resource-loader.js:243）与 `createAgentSession`（否则回落 `SettingsManager.create(cwd, agentDir)`，sdk.js:76）。
- 选定值（依据：**均等同 Pi 内置缺省**，故与干净安装行为一致；显式钉住只为让压缩行为只由我们给出的值决定，既不受用户文件影响，也不受 SDK 未来改默认值影响）：
  - `compaction.enabled = true`（自动压缩是我们**要**的行为，不关闭）；
  - `compaction.reserveTokens = 16384`、`compaction.keepRecentTokens = 20000`；
  - `branchSummary.reserveTokens = 16384`。

**任务 B：统一配置缺失的失败策略**
- `src/common/pi-adapter/provider-config.ts`：`PiProviderConfig.contextWindow` 由可选改**必需** `number`；`resolvePiProviderConfig` 在缺 contextWindow 时**硬失败**（错误信息说明该设 `opts.contextWindow` / `ANS_PI_CONTEXT_WINDOW` 及原因），位置紧跟缺 modelId 之后、缺凭据之前。
- `src/common/pi-adapter/real-adapter.ts`：`buildExplicitRuntime` 返回类型去掉 `contextWindowSource`，**无条件**覆盖 `contextWindow`；删除不会再触发的 "template" 告警分支。
- **判断：同意硬失败。** 理由：模板值 1,000,000 使 Pi 自动压缩阈值（contextWindow − reserveTokens）永远够不着，长会话先吃服务端超长报错——正是上一小节刚修缺陷的根因，静默回落等于把它放回来；且与既有 baseUrl/modelId/凭据的 fail-closed 一致。**替代方案（未采用）**：若客户确已跑通短会话而不便新增环境变量，可改为「缺 contextWindow 时仍硬失败，但允许一个显式逃生阀 `ANS_PI_CONTEXT_WINDOW_OPTIONAL=1` 退回告警」——但那只能靠另一次代码变更，不是本次范围，故先按最保守的硬失败落地。

**API 依据（文件:行）**
- `createAgentSession` 接受 `options.settingsManager`（sdk.js:76 取用；sdk.js:306 传入 AgentSession）。
- `SettingsManager.inMemory(settings?, options?)`：「Create an in-memory SettingsManager (no file I/O)」（settings-manager.d.ts:213；实现 settings-manager.js:251-256，用 `InMemorySettingsStorage`）。
- `SettingsManager.create(cwd, agentDir?)` 的回落对象（settings-manager.js:222-231），项目设置路径 `<cwd>/.pi/settings.json`（js:229）。
- 压缩缺省：`DEFAULT_COMPACTION_TOKEN_SETTINGS = {reserveTokens:16384, keepRecentTokens:20000}`（settings-manager.js:10-13）；`getCompactionEnabled()`→`?? true`（js:621-623）；`getCompactionSettings(model?)`（js:655-662）；`DEFAULT_COMPACTION_SETTINGS`（compaction.js:53-57）；`getBranchSummarySettings` 缺省 reserveTokens 16384（js:663-668）。
- `DefaultResourceLoader` 构造回落（resource-loader.js:243）。

**测试**
- `test/pi-adapter/settings.test.ts`（新增）：纯值断言不依赖 Pi；Pi 在场时断言 `buildIsolatedSettingsManager().getCompactionSettings()` 恒为钉住值，并**对照组**演示文件式合并会读到埋在 `<tmp>/.pi/settings.json` 的敌意设置（enabled:false）——直接证明本改动堵住了该泄漏。
- `test/pi-adapter/provider-config.test.ts`：原「未配置为 undefined」用例改为「未配置 → 抛错」；新增「构造适配器时缺 contextWindow 即抛错」；补齐既有用例的 contextWindow。
- `test/pi-adapter/real-adapter.smoke.test.ts`、`real-adapter.timeout.test.ts`、`wire-probe.ts`：构造/解析处补 `contextWindow`（wire-probe 并同步传入 settingsManager，保持与实现接线一致）。
- 实测：`node --test test/pi-adapter/*.test.ts` → **34 pass / 0 fail**。未运行 `wire-probe.ts` 的真实 turn，未读 `.env`，未打印任何凭据值。`npm run typecheck` 在本环境不可用（未安装 typescript），故仅有运行时证据。

**需装配同步（未改，属其边界）**
- `.env.example`：`ANS_PI_CONTEXT_WINDOW` 的注释目前写明「不设则沿用模板的 1,000,000」，与新行为不符。应改为与 baseUrl/model 同风格：**缺失即明确失败**（必填），删除「沿用模板值」的表述。

**边界说明**
- 未改动 `src/pipeline/orchestration/run-role.ts`（编排边界）：其 `createPiAdapterFactory` 只传 gate/root，靠环境变量取配置，故本次改动后若 `.env` 无 `ANS_PI_CONTEXT_WINDOW`，该工厂构造适配器时会**硬失败**——这是预期行为，已在 memo 记录。

- 2026-10-13：完成runtime outcome与诊断修复（用户直接修复授权，项目管理canonical v1）。新增private lifecycle、兼容ReportHandbackMetadata、工具isError/safe detail、审核等待挂闸与中止、5s清理及共享诊断接线；普通任务文案去除逐次确认，新扩张治理边界仍由su确认。离线Pi专项185/185、typecheck与diff-check通过，未部署；详见[修复记录](docs/fix/2026-10-13_fix_runtime-outcome-and-diagnostics.md)。
