---
id: change_governed-interaction-tools
type: change
title: 客户确认制交互工具族（request_confirmation / request_choice）：冻结类型、注入注册、超时/中止加固、executionMode 实测
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: implemented
role: Pi适配器
design: 角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md（status: approved，A 组先行）
scope: A-1 / A-2 / A-6 中属于 Pi适配器的部分（A-4 删类型不在本轮）
events:
  - date: "2026-10-12"
    kind: implemented
    summary: 两工具构造器 + 注入即注册 + 三态转达 + 超时/中止加固 + executionMode:"sequential" 端到端实测（faux provider 离线）；finalizeBootstrap 槽保留未动
  - date: "2026-10-12"
    kind: amended
    summary: 追加 A-3 配套文案——两交互工具的 description/promptGuidelines 写死「preview 必须列出将写出的具体路径」「列路径≠获准，获准只认 confirmed:true」（编排发行器从 preview 提取路径；未列 ⇒ 不发行 ⇒ F4 拒）
  - date: "2026-10-12"
    kind: removed
    summary: A-4 最后一步——删除本层已死的旧收口面（finalize_bootstrap 工具/注入槽/FinalizeBootstrapFn/describeTool 分支/RealPiAdapterOptions 项）；保留 FinalizeStatus/FinalizeResult（编排仍消费）；消费者 grep 全仓无外部注入方
  - date: "2026-10-12"
    kind: implemented
    summary: C-1 交报告工具 submit_report（注入才注册 reportHandback；冻结点 session.ts；先例同构）——含 void-返回能力可注入（修通与编排 AdapterCapabilities 的形状接缝）
  - date: "2026-10-12"
    kind: implemented
    summary: D-1 重启恢复——RealPiAdapterOptions.sessionDir；selectSessionManager（有最近即 open 恢复/否则 create 新建）；缺省逐字保留 in-memory；目录自建+可写校验（明确报错不静默退化）；环境封闭登记（只写 <项目>/.ans/sessions/，不碰 ~/.pi）
  - date: "2026-10-12"
    kind: amended
    summary: G-1 客户确认不设超时——交互等待缺省不设限（仅显式配置才计时）；新增 InteractionGate/withPausableTimeout，等待期间**暂停每轮硬超时**（对照实证）；退役 A-6 收敛（resolveCustomerInputTimeoutMs 删除）；等待期间会话=忙（SDK 拒并发，已钉住）；进程内存诚实边界登记
  - date: "2026-10-12"
    kind: implemented
    summary: H-1 su 派发任务工具 dispatch_task（注入才注册 dispatchTask；冻结点 session.ts；只给 su）——文案写死「派发 ≠ 授权 / 任务自足 / 返工带证据」+ 反向断言；参数校验/失败如实/防悬挂/不写盘
  - date: "2026-10-12"
    kind: implemented
    summary: K-2 图片发送——RoleSession.prompt 扩可选 {images}（PromptImage 逐字镜像 pi-ai ImageContent）；makeRolePrompt 抽出并透传（无图逐字旧行为）；SDK 图像管线实测（有效图逐字进转录；无效图显式省略非静默）
  - date: "2026-10-12"
    kind: implemented
    summary: R-1 前置——register report_shell_verdict 工具 + shellVerdict? 选项（注入才注册，只给审读会话；三值枚举校验/如实交回/防悬挂/不写盘）；**另确证网关 500 根因**：克隆模板时原样继承 Anthropic compat（supportsMidConvoToolChanges），SDK 据此生成 tool_removal 块被网关拒——建议收窄 compat（未改，仅报）
  - date: "2026-10-12"
    kind: fixed
    summary: 网关 500 根因修复落地——buildExplicitRuntime 克隆时显式收窄 compat（5 项，逐项依据注释）；存量会话防御（检测 system 消息里的字面 tool_removal/tool_addition 块 → 跳过/如实新建，不清洗）；wire 级双向回归 + 澄清：JSONL 实存元数据（探针确证），修复即覆盖存量
  - date: "2026-10-12"
    kind: fixed
    summary: W-1 同轮丢写——write_file/edit_file 钉 executionMode:"sequential"（read_file 判定不加，依据登记）；A/B 双向实测（对照组 3/3 丢写复现、主组 3/3 无丢写）
  - date: "2026-10-12"
    kind: fixed
    summary: X-1 每轮重复 settled——删扩展层 agent_settled 映射（保留 tool_call 等职责），settle 唯一发射点收口为导出函数 wireSettledOnce（session.subscribe）；A/B 实测（修前 2/轮、修后恰 1/轮、abort 路径仍恰 1）；全部发射点清点无其它重复
  - date: "2026-10-12"
    kind: amended
    summary: 终端降噪（客户直接要求）——「新会话（持久化目录…）」与「会话已恢复：…」两条常规行由 log.stage 降为 log.trace（默认不打印、ANS_PI_TRACE 才出）；异常/一次性行（跳过污染会话 note 等）仍走 stage；事件流恢复提示未动
  - date: "2026-10-12"
    kind: amended
    summary: 恢复提示二次降噪（客户推翻上一条「事件流保留」决定）——删 resumed 的 emit（恢复不进聊天流，仅 trace）；skippedContaminated 的「resumed+部分跳过」路径（note 为 undefined）拆为独立如实告知分支（stage+事件流，不静默）；log-noise 断言反转 + 新增组合用例（旧行为注入 A/B 恰两红，证明承重）
---

# 客户确认制交互工具族（Pi适配器实施记录）

**来源**：设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md`（**approved**，A 组先行）§三 A-1（工具族）/ A-2（模型行为文案）/ A-6（并发与超时）；本轮范围按派工＝**A 组中属于 Pi适配器的部分**，**不含**删除 finalize 类型（A-4 最后一步、另派）。

**环境**：Node v24.14.0 / darwin / HEAD `d933537`（工作区含他角色未提交改动，只读）。**未读 `.env`、未发真实模型请求、未打印凭据值**（离线实测用 pi-ai 内置 faux provider，keyless、进程内流式）。

## 改了什么（全部落在本角色 boundary.yaml Section 1 内）

### 1. 冻结类型入 §4 冻结契约家（`src/provider/pi/session.ts`）

按设计 A-1 的三态冻结形状，**逐字**新增（先例 T20 operator 三型 / T36 finalize 两型）：

- `CustomerInputOption { id; label; description? }`
- `CustomerInputRequest`（判别联合）：`{ kind:"confirm"; title; preview?; detail? } | { kind:"choice"; title; question?; options; multiple?; preview? }`
- `CustomerInputOutcome`（**逐字三态**）：`{ outcome:"answered"; value:{ confirmed?; selected? }; operatorId? } | { outcome:"declined"; operatorId?; reason? } | { outcome:"unavailable"; reason? }`
- `CustomerInputFn = (req) => Promise<Outcome | null | undefined> | Outcome | null | undefined`

**与设计稿的差异（如实登记，仅两处、均为可选字段扩展）**：`answered` 增可选 `operatorId`（审计用，取 `OperatorOutcome` 先例）；`declined`/`unavailable` 增可选 `reason`（失败文案要带原因：「未获客户同意（原因：…）」）。核心三态与 `value.confirmed/selected` 与设计稿逐字一致。

**为何另立三型不复用 OperatorPrompt/OperatorOutcome**：勾选结果 `selected: string[]` 装不进 `OperatorOutcome`（只有 allow/deny/unavailable）——设计 A-1 明言；「不造第二套确认机制」落在**注入点形状**（同为 `(req) => Promise<outcome>` 注入 fn + fail-closed 语义）。

**透传**：`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 各增 `customerInput?` / `customerInputTimeoutMs?` 并透传（`finalizeBootstrap` 槽**原样保留**——下游还在用，A-4 最后一步再删）。

### 2. 两工具构造器与「注入才注册」（`src/provider/pi/tools.ts`）

- 常量：`REQUEST_CONFIRMATION_TOOL_NAME="request_confirmation"`、`REQUEST_CHOICE_TOOL_NAME="request_choice"`。
- `GovernedToolsOptions` 增 `customerInput?` / `customerInputTimeoutMs?`；`buildGovernedTools` 中**仅当注入 `customerInput` 时** push 两工具——**未注入即不注册**（与 `shellGate`/`finalizeBootstrap` 逐字同构）。**判据是「有无客户通道」，不是「是否创世态」**：有客户可问的前端才注入；无人值守不注入 ⇒ 工具不存在 ⇒ 模型无从「假设同意」（能力缺席＝最强 fail-closed）。
- `makeRequestConfirmationTool` / `makeRequestChoiceTool`：handler 校验参数（title 非空；choice 的 `options` 非空、每项 id/label 非空且 **id 唯一**）→ 调 `askCustomer`（公共等待路径）→ 三态**如实**转达。
  - **参数非法时不打扰客户**：直接 `ok:false`，注入 fn 一次都不被调（有用例锁死）。
  - **勾选守卫**：通道返回**未提供过**的选项 id → 视为**未获同意**（宁拒勿猜；桌面侧另有子集校验，见设计 A-5）。
- **失败语义**（设计 A-1 逐字）：拒绝 / 明确选「否」/ `confirmed` 缺失（只认 `true`）/ 超时 / 通道不可用（`null`/`undefined`）/ 抛错 → `ok:false`，文案
  `「未获客户同意（原因：…）→ 不要写盘；如实告知客户，不得假设同意。」`——**绝不说成已同意**（有用例断言失败措辞不含「客户已确认」「已获明确同意」）。
- 成功文案带 `confirmed:true` 标记（与工具 description 里的流程词对应），并提示「写入须与向客户预览的内容一致」。
- `ToolDefinition.handler` 的 call 参数增可选 `signal?: AbortSignal`（其余工具不用它）。

### 3. 超时与中止加固（`src/common/pi-adapter/timeout.ts` 等）

- 新常量：`DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS = 110000`、`CUSTOMER_INPUT_TIMEOUT_ENV = "ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS"`、`CUSTOMER_INPUT_PROMPT_MARGIN_MS = 5000`。
- `resolveCustomerInputTimeoutMs(explicit, promptMs, env)`：生效值 = `min(配置值, promptMs − 5000)`（下限保底 1000ms）；`promptMs` 非正/非有限（该层未设整轮超时）→ **不收敛**；被收敛时返回 `cappedFrom` 供可见日志。
- `abortError` / `isAbortError` / `raceAbort(work, signal, label)`：**会话中止 = 立即 fail-closed 返回**，handler 不再悬挂（被放弃的底层等待不可取消，如实标注；中止后无监听者、无副作用）。
- `askCustomer` 组合顺序：`withTimeout(raceAbort(work, signal), …)`——**raceAbort 在内**（中止最先兑现，且中止一旦发生，外层 withTimeout 的定时器随 `finally` 清理——实测：修复该顺序前测试进程被未清理的 30s 定时器多拖 ~10s，修复后整套 1.5s）。

### 4. Pi 侧 schema / 文案 / 执行模式（`src/common/pi-adapter/real-adapter.ts`）

- `describeTool`（**新导出**，供接线实测）增两分支：**普通 JSON-Schema**（confirm：`title` 必填 + `preview`/`detail`；choice：`title`+`options` 必填 + `question`/`multiple`/`preview`）、**description + promptGuidelines（A-2 写死流程）**、**`executionMode:"sequential"`（A-6）**。其余工具不带 executionMode（不擅改）。
- `toPiTool`（**新导出**）：把 `promptGuidelines` / `executionMode` 逐工具透传；`execute(toolCallId, args, signal)` **透传 AbortSignal**（此前丢弃——设计 A-6 点名项）。
- `bindRole`：`resolveCustomerInputTimeoutMs(opts.customerInputTimeoutMs, promptMs, process.env)` 求生效时限；**被收敛且注入了客户通道时**打一条可见 stage 日志（告知调大 `ANS_PI_PROMPT_TIMEOUT_MS` 可放宽等待）；传给 `buildGovernedTools`。
- **未动**：`GOVERNED_WRITE_TOOLS`（两工具无 path、无写，加了等于没加——同 run_shell §7.7 理由）、`shellKillSwitch`（只按名匹配 run_shell）、扩展 `tool_call` 钩子（对未知名放行，两工具本就该放行——不写盘）。

## 关键实测：`executionMode:"sequential"` 端到端**确证生效**（本轮最重要的新事实）

**做法**（`test/pi-adapter/interactive-execution-mode.test.ts`，**完全离线**）：用 pi-ai 内置 **faux provider**（`providers/faux.ts`，keyless）作脚本化模型——**一条助手消息同批**发 `request_confirmation` + `write_file` 两个 tool call；确认通道 120ms 后同意；写工具 handler 起点即调 gate（记录时序）。测试**不静态 import Pi 包**（未安装则整组 skip，同 smoke 先例）。

**结果（两向对照）**：

- **主组**（两交互工具带 `executionMode:"sequential"`）：`confirm:start > confirm:end > gate(role.md)`——**write_file 在确认完成之后才执行**；且确认后真实落盘。
- **对照组**（从定义上**抹掉** `executionMode`，其余不变）：`gate(role.md) > confirm:start > confirm:end`——**write_file 抢跑于确认**（甚至先于确认通道开始）。

⇒ **该字段在 Pi 1.1.0 真实链路（createAgentSession → customTools → 注册包装 → agent-loop 批执行）中承重且生效**：没有它，同批的 `write_file` **确实会**在客户确认之前执行（设计 A-6 的担心为真）；有了它，整批顺序执行。此前登记为「SDK 有此能力但**未实测**」，本轮**已实测**（对照组即不含该字段的同一场景）。

**如实标注（残留）**：① 该保证限于「同一助手消息批内」；跨轮的模型自律仍靠 A-2 文案（description + promptGuidelines，仅工具激活时进系统提示）。② `promptGuidelines` 本轮验证的是「SDK 接受该字段、注册不报错」；其进入系统提示的渲染效果未在真实模型端到端断言（属客户跑）。③ 「先确认后写」在本层是**模型行为**约束；硬保证在编排 A-3（confirmed 路径才发行进 writeSet、F4 拒未确认路径）——**不是本层**。

## 与设计稿不符之处 / 跨角色（如实）

- **保留** `finalizeBootstrap` 槽与 `finalize_bootstrap` 工具**原样未动**（设计 A-4 明确：删除是最后一步、下游先改）。
- `answered` 增可选 `operatorId`、`declined`/`unavailable` 增可选 `reason`（见上；不改变三态语义）。
- **供编排**：构造 `CustomerInputFn`（复用 `OperatorChannelFn` 通道；CLI 终端映射 / 桌面交互卡）、注入 `createPiRuntimeAdapter({ customerInput })`；「有客户通道才注入」即注册判据。CLI 的 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 可配；若把 `ANS_PI_PROMPT_TIMEOUT_MS` 调大（长预览需要），交互时限**自动**跟随放宽（收敛规则），无需同步改。
- **供桌面**：交互卡渲染所需字段全在 `CustomerInputRequest`（confirm: title/preview/detail；choice: title/question/options/multiple/preview）与回包 `CustomerInputOutcome`——形状单一来源在 `session.ts`。

## 验证（本角色执行）

- `node --test "test/pi-adapter/*.test.ts"`（**带引号**）→ **97 pass / 0 fail / 0 skipped**（较前 74 净 **+23**：`customer-input.test.ts` 19 条 + `interactive-execution-mode.test.ts` 4 条）。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **715 计 / 702 pass / 12 fail / 1 skip**。**12 红全部在他人边界**：`test/桌面应用/**`（该角色正在改 B-2「切换保留历史」，其旧断言与新语义冲突——同刻其 `app/desktop/**` 亦有在途 typecheck 错误，红随其改动波动）与 `test/项目管理/shared/path-primitives.test.ts`（既有 macOS `/private/var` 前缀环境红，基线红之一）。**本角色目录 0 红**。相对派工时基线（692/689/2/1）：**+23 计 +23 过＝本角色新增**；其余 −10 过全数落在桌面应用在途改动。
- `npm run typecheck`（tsc --noEmit）→ **本角色文件零错误**；全仓余下错误全在 `app/desktop/**`、`test/桌面应用/**`（桌面应用在途）。
- **未读** `.env`、**未发**真实模型请求（faux 为进程内 provider）、**未打印**凭据值。

## 边界声明

只写本角色 Section 1 内文件：`src/provider/pi/session.ts`、`src/provider/pi/tools.ts`、`src/common/pi-adapter/timeout.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/**`、`角色卡/Pi适配器/**`。**未动** `src/interface/**`、`src/pipeline/**`、`src/common/编排/**`、`app/**`、他角色 tests/docs；`finalizeBootstrap` 槽原样保留。

## 追加（同日，小活）：preview 路径硬要求（配合编排 A-3 发行器）

**来源与理由（读编排 `src/common/编排/confirmed-writes.ts`，只读确认）**：A-3 的发行器在 `request_confirmation` 返回 `answered/confirmed:true` 后，从**呈现给客户的文本**（`title + preview + detail`）用保守正则提取「路径样 token」，逐个经 `resolveWrite` 探测后**发行进本会话 writeSet**；模型无法重算或伪造；**preview 不列路径 ⇒ 不发行 ⇒ 后续写入被 F4 拒**（fail-closed，但会打断流程）。该文件头自注「A-2 的指引文案宜要求 su 在 preview 中列出将写出的路径」——本轮据此补文案。

**改了什么（`src/common/pi-adapter/real-adapter.ts` 的 `describeTool`，两分支）**
- `request_confirmation`：description 与 promptGuidelines 增「**preview 必须列出将要写出的具体路径**（相对项目根、含目录，如 `角色卡/示例/role-card.md`）；写盘许可依 preview 所列路径发行；**未列出的路径不会获得许可，写入会被门禁拒绝**」；并**明示「列出路径 ≠ 获准」——获准的唯一凭据是 `confirmed:true`**（防模型把「列了路径」当同意）。
- `request_choice`：同样要求「若 preview 展示将写出的内容须列出具体路径」；并明示**选择 ≠ 写盘同意**——`choice` 的回答**不发行**任何写盘许可（发行器只认 `confirm` 且 `confirmed:true`；本角色亦在 `request_choice` 分支不触发行器），要写盘仍须另行经 `request_confirmation` 预览（含路径）并获确认。
- **未动** handler 行为、冻结类型、executionMode、超时/中止路径——**纯文案**（工具说明层）。

**测试**：`test/pi-adapter/interactive-execution-mode.test.ts` 增 1 条文案用例（钉「必须列出具体路径」「未列出的路径」「不等于」「confirmed:true」；choice 侧钉「选择≠写盘同意」「不构成写盘同意」；并反向断言不含「列出路径即可写」式措辞）。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **98 pass / 0 fail / 0 skipped**（+1）；`npm run typecheck` 本角色文件零错误；**未读** `.env`、**未发**真实模型请求。

## 删除（同日，A-4 最后一步）：旧收口面（finalize_bootstrap）整体移除

**缘由**：`finalize_bootstrap` 工具自 A-4 起**无任何注入方**（编排 `genesisFinalize` 已删、桌面 `finalizeBootstrap` 已删）⇒ 永不注册 = **死代码**；「同意才落盘」已由交互工具族 + 编排 writeSet/F4 承担（设计稿 A-4「删除顺序：下游先、本层后」的最后一步）。

**删除清单（全部本角色 Section 1 内）**
- `src/provider/pi/tools.ts`：`FINALIZE_BOOTSTRAP_TOOL_NAME`、`makeFinalizeBootstrapTool`、`buildGovernedTools` 的注册分支、`GovernedToolsOptions.finalizeBootstrap`、头部历史段（改为一句墓碑注记）；「先例」引用改指仍存者（`run_shell`/`shellGate`/`customerInput`）。
- `src/provider/pi/session.ts`：`FinalizeBootstrapFn` 类型、`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 的 `finalizeBootstrap?` 选项及透传。**保留** `FinalizeStatus` / `FinalizeResult`（编排 `govern-session.ts` 等**仍消费**；段头改为现状说明）。
- `src/common/pi-adapter/real-adapter.ts`：`FinalizeBootstrapFn` import、`describeTool` 的 `"finalize_bootstrap"` 分支、`RealPiAdapterOptions.finalizeBootstrap`、传参一处。
- `test/pi-adapter/finalize-bootstrap.test.ts`：由 9 条「存在/注册/措辞/不写盘/类型」用例**改写为墓碑用例（4 条）**——任何构造（含注入客户通道）下不得出现；运行期 `tools.ts` 不再导出该名；**编译期 @ts-expect-error 墓碑**（`FinalizeBootstrapFn` 若被加回，typecheck 报 TS2578 失败）；保留两结果型可导入可用。

**消费者 grep（先查后删，如实）**：全仓 `finalizeBootstrap` 作为**本层选项**的注入方 **0 处**（`test/编排/finalize.test.ts` 用的是编排**写入本体函数** `finalizeBootstrap(input)`，同名不同物，未动）；`FinalizeBootstrapFn` 的唯一外部引用是编排 `src/common/编排/finalize.ts:130` 那行**临时再导出**——编排**同刻已删**（其文件现记「再导出整段亦删除」），无编译窗口残留。**未碰** `src/common/编排/**`、`src/pipeline/**`、`app/**`。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **93 pass / 0 fail / 0 skipped**（98 − 9 旧 + 4 墓碑）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **701 计 / 698 pass / 2 fail / 1 skip**——**2 红恰为既有环境红**（`test/桌面应用/pi-config.test.ts` 仓库目录名、`test/项目管理/shared/path-primitives.test.ts` macOS `/private/var` 前缀），**本角色目录 0 红**；`npm run typecheck` → **全仓零错误**（含本角色）。**未读** `.env`、**未发**真实模型请求。

## 新增：交报告工具 submit_report（设计 C-1；客户裁定「新增交报告工具」）

**来源**：设计稿 §C-1（归属 Pi适配器 + 编排 + 桌面应用）：角色完成任务时交回一份**模型自己写的**报告（做了什么/结论/证据），交回 su 汇总。本轮只做 **Pi适配器部分**（工具 + 契约 + 文案 + 测试）；编排的「报告即回交事件内容、未交回退推导、evidence 只取被接受的写事件」与桌面的回交卡渲染**不在本层**。

**改了什么（本角色 Section 1 内）**
- `src/provider/pi/session.ts`（§4 冻结契约家）新增三型：`ReportHandbackPayload { status: "completed"|"blocked"; summary; evidence?: string[] }`（字段与编排 `TaskHandback`/`TaskReport` **逐字同构**，roleId/at 由编排补）、`ReportHandbackReceipt { ok; message? }`、`ReportHandbackFn`（注入点）。`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 各增 `reportHandback?` 并透传。
- `src/provider/pi/tools.ts`：`SUBMIT_REPORT_TOOL_NAME = "submit_report"` + `makeSubmitReportTool`；**未注入 `reportHandback` 即不注册**（同 run_shell/customerInput 先例；只给项目角色——su 不注入即不存在）。handler：参数校验（status 枚举、summary 非空、evidence 为字符串数组且每条非空；非法时**不调用 fn**）→ 只把载荷交给注入能力 → **如实**转达回执（成功/无回执 → 「报告已交回」+ status；回执 `ok:false`/抛错 → 「**未能交回**」+ 原因，绝不谎称已交回）。用 `raceAbort` 防悬挂（本地回交、非交互等待，**不设等待超时**）。**不写盘、不做治理判定、不进 `GOVERNED_WRITE_TOOLS`**。
- `src/common/pi-adapter/real-adapter.ts`：`describeTool` 增 `submit_report` 分支（普通 JSON-Schema：status 枚举 + summary 必填 + evidence 可选数组；description + promptGuidelines 写死「完成/确认无法完成时**必须**交回报告：一句话结论 + 改了哪些文件/产出了什么 + 关键证据；**不得只在正文里说**」，并明示**不写盘、不改变任何写盘权限**）；**不设 `executionMode`**（非交互等待，不并到 sequential 档）；`RealPiAdapterOptions.reportHandback` 透传。
- 测试：`test/pi-adapter/submit-report.test.ts`（**12 条**）：未注入→不注册/注入→出现、载荷逐字、blocked+省略 evidence、**fire-and-forget（void 返回）可注入**、参数校验（fn 不被调）、抛错/回执拒→「未能交回」如实（**反向断言不含「已交回」**）、中止即返回、不写盘、文案断言（含反向断言不得暗示写权）、冻结类型可导入。

**跨角色形状接缝（本轮修通，如实登记）**：编排同刻在 `run-role.ts` 声明 `AdapterCapabilities.reportHandback?: (report: TaskReport) => void | Promise<void>`（fire-and-forget）。初版我的 `ReportHandbackFn` 返回联合**不含 void**，导致集成侧 `src/pipeline/orchestration/run-role.ts(427)` TS2322 与 `test/装配/govern-target.test.ts(242)` TS2345（参数位同构无碍——`TaskReport` 与 `ReportHandbackPayload` 逐字相同；差在返回位）。**修复在本层**：返回联合接纳 `void | Promise<…|void>`（void = 已接收无回执，运行语义本就如此，仅类型放宽），并加火-and-forget 用例锁死。修后 **全仓 typecheck 零错误**。**未碰**编排/装配文件。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **105 pass / 0 fail / 0 skipped**（93 + 12）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **718 计 / 715 pass / 2 fail / 1 skip**——**2 红仍恰为既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`），本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。**未读** `.env`、**未发**真实模型请求。

**供编排/桌面**：编排在**项目角色**会话注入 `reportHandback`（su 不注入）；其捕获的载荷即 `TaskReport` 值（两型同构，可直取）。桌面回交卡所需字段在 `ReportHandbackPayload`（status/summary/evidence）。

## 新增：D-1 重启恢复（Pi适配器部分）

**来源**：设计稿 §D-1（客户已定存储位置＝**项目内 `.ans/sessions/`**，符合「环境封闭」纪律）；可行性证据见本文件前轮只读核实（`SessionManager.create/open/continueRecent/findById`、JSONL 落盘、`open` 后 `createAgentSession` 构造期即按投影播种 `agent.state.messages`——sdk.js:253-259）。与前一轮衔接：`src/provider/pi/session.ts` 的 `PiRuntimeAdapterOptions` 与 `real-adapter.ts` 的 `RealPiAdapterOptions` 各增可选 **`sessionDir?: string`**（编排侧 `run-role.ts:455` 已按 `sessionDirFor(projectRoot, roleId)` 逐角色传入，接缝已活）。

**改了什么（本角色 Section 1 内）**
- `src/common/pi-adapter/real-adapter.ts`：新增导出 `selectSessionManager(SessionManagerClass, {cwd, sessionDir})`：
  - **未给 `sessionDir`** → `SessionManager.inMemory(cwd)`——**逐字保留旧行为**（不落盘）；
  - 给了 → 目录内**有最近会话即 `open` 恢复**（`list` 取 modified 最近；与 SDK `continueRecent` 同源语义，session-manager.js:1354-1362/:1449-1459），否则 `create(cwd, sessionDir)` 新建；返回 `{manager, mode: "in-memory"|"resumed"|"created", sessionFile?}`。
  - **目录约定（与编排 2026-10-12 协调确认）**：目录创建**归本层**（编排不预建 `.ans`）——SDK `SessionManager.create` 构造器本就 `mkdirSync(dir,{recursive:true})`（session-manager.js:646-648），本层**再加显式预建 + `accessSync(W_OK)` 可写校验**，把失败变成**一句话明确错误**（含目录与原因，声明**不会静默退化为不落盘**）。目录不可写/不可建 → 抛错（实测 chmod 0o500 用例）。
  - **如实登记（时机）**：建目录发生在 **`bindRole`（绑定会话）时**；**会话文件仍惰性**（首条 user/assistant 消息才落盘，SDK `_hasConversation` 语义，d.ts:245-250）。与编排注释「创建归适配器在**真正落盘时**做」的措辞略有出入——实际是**绑定时建目录、首条消息时落文件**（真正造出目录的还有 SDK 构造器，绕过它不划算）。
- `bindRole`：`sessionManager: sessionSelection.manager`（替换原 `SessionManager.inMemory`）；恢复时打 `log.stage` **并** `emit({kind:"message"})`（「会话已恢复：<文件>」可见提示）；新建时一条 stage 日志。
- **环境封闭登记（D-1 要求）**：本适配器的持久化数据**只写 `<项目>/.ans/sessions/<角色>/`，绝不读写 `~/.pi`**。论证：`createAgentSession` 的 `~/.pi` 回落分支（sdk.js:71-79：agentDir 默认值 / authPath / modelsPath / settingsManager / sessionManager）被我们的**显式** resourceLoader + in-memory settingsManager + 自选 sessionManager + 显式 modelRuntime **全部绕过**（`options.agentDir` 也未传，authPath/modelsPath 为 undefined）；`ResourceLoader` 无任何写文件代码（全文件无 writeFileSync）；`AgentSession` 无文件写入（无 writeFileSync）；trust store（唯一会写盘的旁路）只由 **CLI 入口**构造（main.js:576 等），不在本路径。**另如实指出**：`sessionDir` 必须**逐角色隔离**（共用一目录会互相恢复；cwd 过滤分不出角色）——编排已按 `<root>/.ans/sessions/<roleId>/` 传入。
- **一致性坑（D-1 已核实的坑，写进注释与文档，不静默）**：恢复时 `SettingsManager`/resourceLoader/工具集须与首启一致（我们固定，满足）；**能力集变化**（customerInput/reportHandback 增减）会让**转录里声明过、本次未注册**的工具保持 pending（SDK `_restoreToolsFromTranscript` 按转录恢复装载，agent-session.js:1368-1377）——界面应提示而非静默（归桌面；真机端到端属客户跑）。
- 测试：新增 `test/pi-adapter/session-persistence.test.ts` **6 条**：① 不给 sessionDir→in-memory（追加消息也不落盘）；② 给→新建（目录存在、**首条消息前无文件**、追加后文件存在非空含消息）；③ 同目录再选→**恢复同一文件**、`messages` 非空含原文；④ 多会话→取最近；⑤ **目录不可写→明确抛错**（POSIX；chmod 0o500）；⑥ **端到端（faux provider 离线）**：真会话跑一轮 → dispose（模拟关应用）→ 同 sessionDir 重建 → `session.state.messages` 含上一轮内容（**重启恢复的本层实证**）。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **111 pass / 0 fail / 0 skipped**（105 + 6）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **742 计 / 739 pass / 2 fail / 1 skip**——**2 红仍恰为既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`），本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。**未读** `.env`、**未发**真实模型请求（faux 离线）。

## 修订：G-1 客户确认不设超时（Pi适配器部分）

**来源**：设计稿 §G-1（客户裁定 2026-10-12「没必要超时啊，就卡在这等客户同意呗」）。

**改了什么（本角色 Section 1 内）**
- `src/common/pi-adapter/timeout.ts`：
  - **退役**：`DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS`（110s 缺省上限）、`CUSTOMER_INPUT_PROMPT_MARGIN_MS`、`resolveCustomerInputTimeoutMs`（A-6 的 `min(配置, promptMs−余量)` 收敛）——缺省上限取消后收敛失去意义，**按新语义整体删除**（原语义留痕于文件注释；`ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 保留为**显式**配置）。
  - **新增**：`readOptionalTimeoutMs`（未设/非法 → `undefined` = 不限时）；`InteractionGate`/`createInteractionGate`（等待引用计数 + `onChange`，可重入、退订）；**`withPausableTimeout`**——与 `withTimeout` 同形的**可暂停硬超时**：闸「等待中」时计时停走（余量保留），恢复后按**剩余时间**续算，到期才拒（超时后不取消 work，同既有语义）。
- `src/provider/pi/tools.ts`：等待**缺省不设限**（`timeoutMs === undefined` 时纯 `await`，不再套 `withTimeout`）；仅显式配置（option 或 env）才计时；`askCustomer` 在等待全程 `interactionGate.begin()/end()`（finally 保证）；文件头补 **G-1 诚实边界**（未决请求只在进程内存，进程结束即失效 → 如实「未获客户同意」，绝不假装同意）。
- `src/common/pi-adapter/real-adapter.ts`：`bindRole` 建**每会话一个** `interactionGate`，传给 `buildGovernedTools`，并**逐字复刻到 e2e 用例**；`prompt()` 以 **`withPausableTimeout(session.prompt(text), promptMs, "prompt", interactionGate)`** 替换原 `withTimeout`——**客户输入挂起期间该轮时限暂停/续期，作答后恢复**；删除收敛块与其日志。`session.ts`/`real-adapter.ts` 的选项注释同步新语义。

**证据（全部离线、不真等长时限）**
- **「等待期间不掐断」端到端（faux）**：主组——客户 **250ms** 后才同意、每轮硬超时 **120ms** ⇒ 因挂起暂停，该轮**不被掐断**（实测 elapsed ≥240ms 正常完成）；**对照组**（同一场景**不挂闸**）⇒ 到 120ms 即 `TimeoutError` 被掐断——**证明挂起暂停是承重机制**。
- **等待期间会话 = 忙**：第一轮等待客户时并发 `session.prompt` 被 SDK 拒（`Agent is already processing…`，agent-session.js:1553）——**核实并钉住**（用例断言消息匹配 `already processing`）。
- **缺省不限时的长等待**（mock 时钟，不真等）：虚拟等待 **180s**（超过旧缺省 110s）仍等到答复；**110s 处尚未超时**（旧上限的判别点）。
- **显式配置仍计时**：env `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS=60000`，虚拟 59,999ms 不超时、60,000ms 即「未获客户同意（超时）」。
- **可暂停时限单测**（mock 时钟）：无闸 = 普通硬超时；闸等待中 tick 千万毫秒不拒；恢复后按剩余量到期才拒。

**诚实边界（G-1 必登记，已写进代码注释与本文件）**：未决的客户请求**只在进程内存**（注入 fn 的挂起 promise + 前端卡的 pending 表）——**应用关闭/崩溃即消失**，恢复后**不会**有半截「已同意」；D-1 恢复的是会话**历史**，不是未决工具调用。此类失效（中止/通道不可用）本层如实返回「未获客户同意（原因：…）」，**绝不假装同意**。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **120 pass / 0 fail / 0 skipped**（111 + 9）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **766 计 / 763 pass / 2 fail / 1 skip**——**2 红仍恰为既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`），本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。**未读** `.env`、**未发**真实模型请求。

**供编排/桌面**：通道侧语义（CLI 不设超时、EOF → unavailable；桌面卡不再按时间过期、「已失效」文案如实）归各自角色；本层已保证「等待不设限 + 每轮时限暂停 + 忙语义 + 失效即 fail-closed」。

## 新增：su 派发任务工具 dispatch_task（设计 H-1）

**来源**：设计稿 §H-1（客户原话「给 su 加一个工具，可以派发任务」）；本轮只做 **Pi适配器部分**（工具 + 契约 + 文案 + 测试）。前端路由（自动开会话/排队/去重/失败保留）归编排+桌面，**不在本层**。

**改了什么（本角色 Section 1 内）**
- `src/provider/pi/session.ts`（§4 冻结契约家）新增三型：`DispatchTaskPayload { roleId; task; reason? }`、`DispatchReceipt { ok; message? }`、`DispatchTaskFn`（注入点，**返回位含 `void`**——沿用 C-1 的接缝教训，编排 fire-and-forget 形态可直接注入）。`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 各增 `dispatchTask?` 并透传。
- `src/provider/pi/tools.ts`：`DISPATCH_TASK_TOOL_NAME = "dispatch_task"` + `makeDispatchTaskTool`；**未注入 `dispatchTask` 即不注册**（同 run_shell/customerInput/reportHandback 先例；**只给 su**——由编排以是否注入表达）。handler：参数校验（`roleId`/`task` 非空——**空/空白即拒且不调用 fn**；`reason` 可选）→ 只把载荷交给注入能力 → **如实**转达（受理/void → 「任务已派发」**并重申「派发 ≠ 授权」**；回执 `ok:false` / 抛错 → 「**未能派发**」+ 原因，**绝不谎称**——失败文案刻意避开「已派发」子串以配合严格反向断言）。`raceAbort` 防悬挂、不设等待超时。**不写盘、不做治理判定、不进 `GOVERNED_WRITE_TOOLS`**。
- `src/common/pi-adapter/real-adapter.ts`：`describeTool` 增 `dispatch_task` 分支（schema：`roleId`/`task` 必填 + `reason` 可选；**不设 executionMode**）；description + promptGuidelines **写死三条**：① **派发 ≠ 授权**——只转移「任务与上下文」，不转移身份或写权；对方写权仍只来自其边界与 `request_confirmation` 的 `confirmed:true`，不得在任务文本里承诺或代授写权；② 任务文本**自足**（对方看不到 su 的上下文：做什么/依据哪份文档/完成标准）；③ **返工**时把要求与证据一并写进任务文本。并明示「不写盘、不做治理判定、不改变任何角色的写权」。`RealPiAdapterOptions.dispatchTask` 透传。
- 测试：`test/pi-adapter/dispatch-task.test.ts` **11 条**：注册判据（未注入→不注册/注入→出现）、载荷逐字（reason 省略不在载荷）、void 回执受理、参数校验（fn 不被调）、回执拒/抛错→「未能派发」如实（**反向断言不含「已派发」**）、**文案断言含「派发≠授权」+ 反向断言不得出现「已获授权/已放行写盘/授予写权」字样**、中止即返回、不写盘、冻结类型可导入。

**如实边界（设计 §校验与失败语义）**：`roleId` 的**语义**校验（是否本项目角色、是否指向 su 自身）归**注入能力（编排）**——本层只做**句法**校验（非空），语义拒因经回执 `ok:false` 原样转达（如「roleId 不是本项目角色：foo」），**不静默、不猜测**。前端路由（自动开会话/排队/去重/失败保留）与 CLI 不做同等路由（登记）归各自角色。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **131 pass / 0 fail / 0 skipped**（120 + 11）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **777 计 / 774 pass / 2 fail / 1 skip**——**2 红仍恰为既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`），本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。**未读** `.env`、**未发**真实模型请求。

## 新增：K-2 图片发送（契约扩展 + 适配器透传）

**来源**：设计稿 §K-2（客户「聊天加上支持发送图片」）；可行性核实（本角色，证据为 SDK 产物）已采纳：SDK 全通——`sendUserMessage(content: string | (TextContent|ImageContent)[])`（agent-session.d.ts:612-615，"Always triggers a turn"）内部即归一为 `prompt(text, { images })`；等价直通＝`prompt(text, options?: PromptOptions)`（:534）+ `PromptOptions.images?: ImageContent[]`（:178-181）；图片块为 pi 自有形状 `{type:"image"; data; mimeType}`（pi-ai types.d.ts:277-281），发送时 SDK 转 wire `{type:"image", source:{type:"base64", media_type, data}}`（anthropic-messages.js:88-104）。

**改了什么（本角色 Section 1 内）**
- `src/provider/pi/session.ts`（§4 契约家）：新增 `PromptImage`（**逐字镜像** pi-ai 的 `ImageContent`；注释写明 wire 转换由 SDK 负责）与 `PromptOptions { images?: PromptImage[] }`；**`RoleSession.prompt(text)` → `prompt(text, opts?)`**（可选参——既有调用方零破坏）；fake 适配器签名同步（无模型、不消费图片；无图时事件逐字不变，带图加「附 N 张图片」）。
- `src/common/pi-adapter/real-adapter.ts`：prompt 包装**抽为导出工厂 `makeRolePrompt`**（可单测的桩件接缝）：无图 → `session.prompt(text)` **不传 options（逐字旧行为）**；带图 → **原样透传** `session.prompt(text, { images })`（同一数组、不复制）；**不按 `Model.input` 门控**（模型是否多模态不由本层猜）；失败两条路径如实外推不变（异常 → 事件「pi 适配器中止：…」+ abort + 上抛；SDK 以 `stopReason:"error"` 收束的轮次走既有 message_end→message 外推）。`bindRole` 改为 `prompt: makeRolePrompt({…})`。

**实测（faux provider，离线；另附本项目首次的 SDK 图像管线结论）**
- **有效图**（1×1 PNG）：`prompt(text,{images})` 被接受，图片块**逐字进入 LLM 转录**（我们的 `data`/`mimeType` 原样出现在 TranscriptContext 的 user 消息 content 数组里）——形状与 wire 兼容成立。
- **无效图（非图像数据）**：SDK 图像管线处理失败 → **显式省略**而非静默——模型可见文本带注记
  `[Image omitted: could not be resized below the inline image size limit.]`（`dist/core/utils/image-process.js:47/:55`；支持 png/jpeg/gif/webp、自动转 png、自动缩放默认开）。用例双断言（有效进块 / 无效带注记且原数据不进转录）。
- **网关非多模态**（如实登记）：SDK 发送路径**不消费 `Model.input`**（无门控；我们克隆模板仍声明 `["text","image"]`，那是模板声明）——图片照发，由网关报错 → 该轮 `stopReason:"error"` 消息或以异常呈现（两形态均已外推）；**面向用户的如实提示落点建议在编排/桌面**；真机验证属客户跑。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **138 pass / 0 fail / 0 skipped**（131 + 7）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **813 计 / 810 pass / 2 fail / 1 skip**——**2 红仍恰为既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`），本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。**未读** `.env`、**未发**真实模型请求（faux 离线）。

**跨角色（如实）**：调用侧（编排 `run-role.ts` 的 `send(text)`、桌面聊天发送、CLI）要带图须扩各自入参并传 `{images}`——契约已就位、可选参零破坏；桌面同刻在接发送侧。

## 新增：R-1 前置——审读结论工具 `report_shell_verdict` + `shellVerdict?` 选项

**来源**：编排 R-1（客户裁定：shell 闸 (b) 审读**不解析自由正文**，改用**工具调用**取结构化结论）。形状**逐字取自**编排 `src/common/编排/shell-gate.ts:205-217`（**读之确认、不导入**——§6；`SHELL_VERDICT_TOOL_NAME="report_shell_verdict"` 同串）。

**改了什么（本角色 Section 1 内）**
- `src/provider/pi/session.ts`（§4 契约家）：新增 `ShellVerdictPayload { verdict: "allow"|"deny"|"unsure"; reason?: string }` 与 `ShellVerdictFn`（返回位 `void | Promise<void>`——与编排形状逐字一致）；`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 各增 `shellVerdict?` 并透传。**落地后编排 `run-role.ts:530` 的瞬时 TS2353 即消解**（全仓 typecheck 归零）。
- `src/provider/pi/tools.ts`：`SHELL_VERDICT_TOOL_NAME` + `makeReportShellVerdictTool`；**未注入 `shellVerdict` 即不注册**（同 run_shell/customerInput 先例；**只给审读会话**——由调用方以是否注入表达）。handler：verdict 必须恰为三值枚举（非法 → 拒绝且**能力不被调用**；reason 可选）→ 只把载荷交给注入能力 → **如实**转达（成功「审读结论已交回（verdict: …）」；抛错/中止 → 「**未能交回**」+ 原因 + 「结论只以本工具调用为准（正文里写不算）」）。`raceAbort` 防悬挂。**不写盘、不做判定、不执行/不放行任何命令、不进 `GOVERNED_WRITE_TOOLS`**。
- `src/common/pi-adapter/real-adapter.ts`：`describeTool` 增分支（schema：verdict 三值枚举 + 必填；reason 可选）；description + promptGuidelines 写死「结论以**本工具调用**为准——**不要**只在正文里写」「本工具不授予任何权限、也不构成对任何命令的放行」；**无 executionMode**。`RealPiAdapterOptions.shellVerdict` 透传。
- 测试：`test/pi-adapter/shell-verdict.test.ts` **10 条**（注册判据；三值载荷逐字；省略 reason；参数校验（fn 不被调）；抛错如实（**反向断言不含「已交回」**）；中止即返回；**文案断言 + 反向断言（不得出现「已放行/已授权/已授予/代表放行/代为放行」）**；不写盘；冻结类型可导入且与编排形状结构兼容）。

**网关 500（`unknown variant 'tool_removal'`）根因确证（只读核实，本轮未改，仅报）**
- **机制**：pi-ai 只在模型声明的能力位为真时才生成**会话中途工具变更块**——`nativeToolChanges = compat.supportsMidConvoSystemMessages && compat.supportsMidConvoToolChanges && initialTools.length > 0`（anthropic-messages.js:870）→ 生成 `{type:"tool_addition"}`/`{type:"tool_removal"}`（:1027-1041）；两能力位**缺省 false**（types.d.ts:781-783，属 `inline-tools-2026-09-15` beta 语义）。
- **我们为何踩雷**：`buildExplicitRuntime` 克隆 Anthropic 模板时 `{...templateModel, …}` **原样继承 `compat`**；实测本机模板 `claude-fable-5.compat`＝`{ supportsMidConvoSystemMessages:true, supportsMidConvoToolChanges:true, forceAdaptiveThinking:true, supportsStrictTools:true, allowedFallbackModels:[…] }`。⇒ SDK 以为网关支持该 beta，在会话中途工具装载变化时**生成 `tool_removal` 块并存进历史**；**网关不认识该变体**，整段重发 → 500（助手 `content: []` → 旧正文本解析恒失败）——即编排真机根因的完整链路。
- **建议（一行级，在本角色 `buildExplicitRuntime` 内、本轮未动）**：克隆时显式**收窄 compat**——至少 `supportsMidConvoSystemMessages:false`、`supportsMidConvoToolChanges:false`（网关非 Anthropic 官方端点，inline-tools beta 通常不支持）；同时建议核对 `forceAdaptiveThinking`/`supportsStrictTools`/`allowedFallbackModels`（同为模板照抄、网关未证实）。**另**：既有已落盘 JSONL 里若已含 `tool_removal` 块的会话，恢复重发仍会 500——建议编排/桌面做一次扫描清理（审读会话已 `persistSession:false` 不受影响）。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **148 pass / 0 fail / 0 skipped**（138 + 10）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **874 计 / 870 pass / 3 fail / 1 skip**——3 红＝**既有环境红 2 条**（桌面 pi-config 目录名、pm shared macOS `/private/var`）＋**桌面在途新红 1 条**（`test/桌面应用/renderer.test.ts:941` 「S-1 流式输出双向语义」，桌面角色同刻在改，非本层）；本角色目录 0 红；`npm run typecheck` → **全仓零错误**（编排瞬时红已消解）。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`（工作区含他人在途改动）。**未读** `.env`、**未发**真实模型请求。

## 修复（同日）：网关 500 `unknown variant 'tool_removal'` 根因修复 + 存量防御

**来源**：上一轮本角色确证的根因（模板 compat 继承）经客户知情后派工落实；「存量污染」的前提在本轮被**实测修正**（见下）。

### A. 主修：`buildExplicitRuntime` 克隆时显式收窄 compat（`src/common/pi-adapter/real-adapter.ts`）

收窄清单（每项均把**模板实测值**与**网关情形**写进代码注释）：
| compat 字段 | 模板实测值 | 收窄为 | 依据 |
| --- | --- | --- | --- |
| `supportsMidConvoSystemMessages` | true | **false** | 网关是第三方 anthropic-messages 兼容代理，mid-convo system-messages 行为未证实；true 参与 `nativeToolChanges` 门槛（anthropic-messages.js:870） |
| `supportsMidConvoToolChanges` | true | **false** | **主犯**：true ⇒ SDK 会话中途生成 `{type:"tool_addition"}/{type:"tool_removal"}` 块（:1027-1041）⇒ 网关不认该变体 ⇒ **500**（真机审读轮 35/37 被拒、助手 content 恒空的根因） |
| `forceAdaptiveThinking` | true | **false** | 强制 adaptive thinking 格式（:729/:846），网关支持未证实 |
| `supportsStrictTools` | true | **false** | 工具 schema 附 Anthropic strict 扩展字段（:146/:872/:926），网关未必认 |
| `allowedFallbackModels` | [opus…] | **清空（undefined）** | 非空 ⇒ 请求可带服务端 fallback 字段且引用 opus 模型（:134/:458），网关必不支持 |

**其余 compat 字段原样保留**（逐项收窄、不整体丢弃）。身份字段（id/baseUrl/provider/contextWindow）与克隆语义不变。

### B. 存量处置（**前提经实测修正，如实**）

- **实测探针（本地，离线）**：真会话中途改工具装载（`setActiveToolsByName` 移除其一）后读 JSONL——**存的是 system 消息上的 `toolsAdded`/`toolsRemoved` 元数据**（`message.role==="system"` 的 message entry），**不是字面 `tool_removal` 块**；字面块是**每次请求**在 anthropic-messages.js **受 compat 两能力位门控**生成的。⇒ **收窄 compat（A）后，存量会话重发不会再生成该块——修复即覆盖存量，无需清洗**。上一轮「会话历史含网关不认的块」的表述据此修正为「历史含**元数据**，在 compat=true 时每次重发**被生成**为块」。
- **仍实现的防御（对象 = 万一的旧版/他源字面块文件）**：`sessionFileHasForeignToolChangeBlocks(filePath)`——只认 **system 消息 content 里的字面块**（用户/助手正文提及同名串不误报）；`selectSessionManager` 选最近会话时**跳过**污染文件（有干净旧档即恢复它并记 `skippedContaminated`）；**全候选皆污染 → 如实拒绝恢复并新建** + `note`（日志与事件流如实告知，**不静默挂死、不清洗改写历史**——改写历史风险高，且当前 SDK 无此类文件）。
- **理由（选「跳过/如实新建」而非「清洗」）**：清洗需改写 JSONL 历史（可能损坏、破坏证据链），而真实对象在当前 SDK 下**不存在**；防御按最小动作、fail-closed、全透明。

### C. 这是否解释其它真机现象（评估，有据者写、无据者标未证）

- **可解释**：凡「会话中途发生过工具装载变化」的会话（含**恢复后装载差异**、扩展/MCP 工具增删、`setActiveToolsByName` 调用），在 compat=true 时**其每一次后续请求**都生成 `tool_removal` 块并被网关 500 ⇒ 助手 `content: []` ⇒ 表现为「该会话此后恒空/恒失败」。这正是「长会话模型行为异常/内容为空」的**一类**完整机制。
- **未证**：不涉及工具装载变化的长会话异常、以及其它表现（如个别轮次内容异常）**未逐例取证**——不宣称全部由本因解释。

### 验证

- `node --test "test/pi-adapter/*.test.ts"`（带引号）→ **153 pass / 0 fail / 0 skipped**（148 + 5，新文件 `wire-compat-and-legacy.test.ts`）。
- **wire 级回归（离线，`onPayload` 捕获、不发网络）**：收窄后请求参数**无** `tool_removal`/`tool_addition`；对照组（两能力位改回 true）**复现** `tool_removal` 块——修复承重、且复现原始 500 触发条件。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **879 计 / 876 pass / 2 fail / 1 skip**——**恰为 2 条既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`；桌面在途 S-1 红同刻已由其修复）；本角色目录 0 红。
- `npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`。**未读** `.env`、**未发**真实模型请求。

## 修复（同日）：W-1 写类工具「同轮丢写」——write_file/edit_file 钉 `executionMode:"sequential"`

**来源**：真机 su 上报「`edit_file` 同轮丢写」；客户要求先修系统问题。**根因（A-6 同类实测方法证伪/证实）**：Pi **缺省同批并行**执行工具（agent.js:145，A-6 已实测），而 `executionMode:"sequential"` 当时只加在两个交互工具上；`write_file`/`edit_file` 具**读改写竞态**（edit = 读→改→写），同批对**同一文件** write+edit 并行时，edit 的**读**发生在 write 落盘之前（或文件尚未创建）⇒ edit 失败、或其结果被 write 覆盖 = **丢写**。

**复现（离线 faux A/B，双向）**
- 场景：同一助手消息批内发 `write_file`（大内容 ~2.4MB，含 `MARK_WRITE
BASE
`）+ `edit_file`（`BASE`→`EDITED`），目标文件**初始不存在**。
- **A 对照组**（抹掉两写类工具的 executionMode = 修复前）：**丢写复现 3/3**（`{hasWrite:true, hasEditEffect:false}`；另探针 5/5 同）；机制：edit 的读要么 ENOENT、要么撞不赢 write 的慢落盘。
- **B 主组**（修复后原样）：**3/3 无丢写**（edit 在 write 的产物上生效：`{hasWrite:true, hasEditEffect:true}`）——顺序执行且语义正确。

**改动**：`real-adapter.ts` 的 `describeTool` 默认分支对 `write_file`/`edit_file` 透传 `executionMode:"sequential"`（与交互工具同源写法）；**理由注释**已写明（同批并行默认 + 同文件读改写竞态 + A/B 结果）。
**`read_file` 判定：不加（结论与依据）**：① 纯读**无写可竞争**，不存在丢写；② **批级规则**（任一工具 sequential ⇒ 整批顺序，agent-loop.js:369）已使「读+写/编辑」混批**整批顺序**——单独给 read_file 加只影响**纯读批**（无竞争可防），反而增串行开销。
**附带影响（如实登记）**：凡含 write_file/edit_file 的批**整批转为顺序执行**（批级规则使然）——多文件批量写入会串行化（性能换正确性，符合治理工具的语义预期）。

**测试**：新增 `test/pi-adapter/write-sequencing.test.ts` **3 条**（形状断言：两写类 sequential、read_file/run_shell 不加、交互/交报告档位不受扰；A/B 各 3 连跑）；同步更新 `interactive-execution-mode.test.ts` 中「write_file executionMode undefined」的旧断言（改为 sequential）。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **156 pass / 0 fail / 0 skipped**（153 + 3）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **883 计 / 880 pass / 2 fail / 1 skip**——**恰为 2 条既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`）；本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`。**未读** `.env`、**未发**真实模型请求。

## 修复（同日）：X-1 每轮重复 `settled`——收口为唯一发射点

**来源**：真机 su 记录 7 次「逐字相同的重复投递」。根因：适配器两处同发 `settled`——
扩展层 `pi.on("agent_settled")`（real-adapter.ts 原 :715 一带）与 `session.subscribe(agent_settled)`（原 :1016 一带）
⇒ 每轮 settle **两份** ⇒ 编排 `withHandback` 每读到一个 settled 发一份回交；桌面去重键含毫秒级 `at`
⇒ 两次键不同 ⇒ 去重失效 ⇒ 重复投递。

**保留哪个发射点（结论与理由）**：**保留 `session.subscribe`（收口为导出函数 `wireSettledOnce`），删除扩展层 `agent_settled` 映射**。
- `session.subscribe` 是 **AgentSession 的公开事件面**、与事件源同层；**扩展层是可缺席层**（未加载/加载失败即整层不在），而 `settled` 是消费方**关键信号**（漏发 ⇒ 消费方永久挂起）——关键信号不应挂在可选层上。
- 扩展层的独立职责（`tool_call` 拦截、tool_execution_*、message_end、压缩三钩子）**全部保留**；只删重复的那一个映射。`buildGovernanceExtension` **改为导出**（供接线测试断言其 handlers **不含** `agent_settled`——防重复发射点漂移回）。
- **中止路径语义保持**：SDK 在 abort 后仍发 `agent_settled`（agent-session.js:689-691），`wireSettledOnce` 照发一个——实测 abort 路径**恰 1**。

**「恰一个」证据（离线夹具，双向）**
- **A（修复前接线复现）**：扩展含 `agent_settled` 映射 + subscribe → 一轮 **2** 个 settled（复现真机重复）。
- **B（修复后接线，用出厂 `buildGovernanceExtension` + `wireSettledOnce`）**：一轮 **恰 1**；且断言出厂扩展 handlers **不含** `agent_settled`、**仍含** `tool_call`（拦截能力未伤）。
- **中止回归**：出厂接线下一轮 `abort()` → 仍**恰 1** 个 settled（消费方不挂起）。
- **stub 单测**：一次 settle ⇒ 恰 1；两次 ⇒ 2（每轮一个）；非 settle 事件不产 settled；退订生效。

**连带核查：其它事件有无同类重复（逐条清点，全部单源单次）**
`real-adapter.ts` 全发射点：`settled`（**唯一源** = `wireSettledOnce`，原双源已收口）；`tool_call`×2 来自**不同底层事件**（`on("tool_call")`=「模型请求调用」、`tool_execution_start`=「开始执行」——按设计各一次，非重复）；`accepted`/`denied` ← `tool_execution_end`（每次执行一次）；写类拦截 `denied` ← `on("tool_call")` 拒绝分支；`message` ← `message_end`（每条助手消息一次）/ `prompt()` 的「用户指令」（每 prompt 一次）/ 压缩三钩子（每压缩事件一次）/ contextWindow 提示与会话恢复提示（**一次性**）。**结论：`agent_settled` 是唯一「同一底层事件挂两个监听」的重复源；其余无同类问题。** fake 适配器自持队列，`settled` 每 prompt 恰一次，不受影响。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **160 pass / 0 fail / 0 skipped**（156 + 4）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **889 计 / 886 pass / 2 fail / 1 skip**——**恰为 2 条既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`）；本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`。**未读** `.env`、**未发**真实模型请求。

## 调整（同日）：终端日志降噪——两条常规会话行降为 trace（客户直接要求）

**来源**：客户在应用终端直接指认「会话已恢复：…（历史与模型上下文自该会话续起）」这行**不需要**。

**改动（`real-adapter.ts`，一行级）**：**新会话（持久化目录 …；首条消息后才落盘）** 与 **会话已恢复：…** 两条由 `log.stage` 降为 **`log.trace`**——它们是**每次开会话都会出现**的常规信息；默认终端只留必要阶段行，`ANS_PI_TRACE=1/true/yes` 时才打印（logger.ts 既有门槛）。注释已写明理由。
**不降噪（保持 stage）**：真正影响判断的阶段行与**异常/一次性**信息（构造各阶段、prompt 中止、contextWindow 默认提示、**跳过污染会话的 note** 等）。
**未动（本轮，界面诚实提示保留）**：事件流/聊天流里的那条恢复提示（`emit({kind:"message"})`）照发——`log-noise.test.ts` 断言之。**可选建议（供客户裁定，未擅改）**：该事件流提示每次恢复都会进聊天流，若界面已用其它方式表明「历史已续」，可考虑一并降噪或只入状态区。

**测试**：新增 `test/pi-adapter/log-noise.test.ts` **4 条**：① 真 logger 门槛（默认 stage 打印、trace 不打印；开 trace 才打印）；② 真 `bindRole`（**离线构造**）新会话 → 提示走 trace、不走 stage、其余 stage 行（「bindRole 完成」）不变；③ 预置会话文件 → 恢复路径 → trace 有、stage 无、**事件流恢复提示仍在**；④ 合成污染会话 → 「跳过恢复并新建」note **仍走 stage**（异常行不降噪）。

**验证**：`node --test "test/pi-adapter/*.test.ts"`（带引号）→ **164 pass / 0 fail / 0 skipped**（160 + 4）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **893 计 / 890 pass / 2 fail / 1 skip**——**恰为 2 条既有环境红**（桌面 pi-config 目录名、pm shared macOS `/private/var`）；本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`。**未读** `.env`、**未发**真实模型请求。

## 调整（同日）：恢复提示二次降噪——聊天流也不出现（客户二次裁定，推翻上一节）

**来源**：客户在聊天流再次看到「**会话已恢复：…（历史与模型上下文自该会话续起）**」并明确表示不需要（原话「这个也不需要啊，这个不需要」；再次出现后「本来已经让你去掉了，怎么又加回来了」）。本文件上一节（终端降噪）中「**事件流恢复提示未动**（界面诚实提示保留）」的保留决定，**已被该次客户明确推翻**——恢复是常规事件，聊天流也不要它。

**改动（`src/common/pi-adapter/real-adapter.ts` 的 `mode === "resumed"` 分支，全部在本角色 Section 1 内）**
- **删除** `emit({ kind: "message", summary: notice })`；`notice` 变量随之清理（恢复行内联进 `log.trace` 调用），原拼接的 skip 片段拆为独立分支。
- `log.trace(会话已恢复：…)` **保留**——终端降噪维持上一轮现状（默认不打印，`ANS_PI_TRACE` 打开仍可见，供排障）。
- **注释按新裁定重写**：旧注「界面/事件流里的那条恢复提示保留——诚实提示」已删，不再留与行为矛盾的叙述（并明确标注「首轮只降终端、保留聊天流的那条决定已被客户明确推翻」）。

**第 2 条核查：skippedContaminated 的信息损失（结论：直接删 emit 会损失，已改为独立分支补齐）**

`skippedContaminated` 只在两条路径有值：

1. **全污染 ⇒ 新建**（`note` 路径）：note 文案已含「已跳过恢复并新建」，`log.stage` + 事件流照旧——**本轮未动**（派工明确「异常路径不动」）。
2. **resumed + 跳过过污染档**（该路径 **`note` 为 `undefined`**）：此情形 skip 事实**此前只出现在被删的那条 notice 里**（原 notice 拼接「；已跳过 N 个含未知块的会话」）——若直接删 emit，该事实**只在 `ANS_PI_TRACE` 打开的 trace 里可见**，默认即被**静默吞掉**。

处理：新增独立分支，该情形**如实告知**（`log.stage` + **事件流**，与路径 1 同口径；「异常事实不静默」是本项目既有语义——`SessionManagerSelection.skippedContaminated` 的字段注释亦写明「>0 时调用方应**如实告知**，勿静默」）；文案：「检测到 N 个会话文件含网关不认识的工具变更块（tool_removal/tool_addition），已跳过这些文件、恢复最新一条干净会话（不静默、不清洗历史）。」**恢复本身（常规事件）仍不进聊天流**——skip 事实进聊天流不违背客户裁定（非常规；且是期望永不触发的防御分支，仅当真有含网关不认块的会话文件时出现）。

**测试（`test/pi-adapter/log-noise.test.ts`，4 → 5 条）**
- 恢复用例**断言反转**：原 `assert.match(events[0]!, /^message:会话已恢复：/, "事件流应保留恢复提示")` 改为「**事件流不含**恢复提示」；trace 断言与「不走 stage」断言保留。事件读取改为**先 dispose 再排空**（`dispose` 已 `queue.close()`，迭代器排空已缓冲事件后正常结束——不会因「一条事件都没有」而挂起等待）。
- note 用例（全污染）**补事件流断言**（此前只断 stage；补完「日志 + 事件流」的如实告知契约，并把它与恢复路径的边界钉清）。
- **新增** resumed+跳过 组合用例：构造——干净档 `message.timestamp` 取较早（SDK `list` 的 `modified` 优先取消息时间）、污染档 `header.timestamp` 较新（system 消息不参与 modified 计算，回落 header 时间）⇒ 排序污染在前、被跳过；干净旧档被恢复 ⇒ `mode=resumed` 且 `skippedContaminated=1`（**note 为 undefined 的组合路径**）。断言：skip 事实走 stage + 事件流；恢复行只走 trace；事件流不含恢复提示。
- **断言承重（A/B 实测）**：反向注入旧行为——恢复 `emit` 加回 + skip 独立分支删除 ⇒ 恢复用例与组合用例**恰两条转红**；撤销后全绿——新断言确会捕获「静默删掉」与「提示漂移回聊天流」两类回归。

**验证**：`node --test "test/pi-adapter/**/*.test.ts"`（带引号）→ **165 pass / 0 fail / 0 skipped**（164 + 1）；全量 `node --test "test/**/*.test.ts"`（带引号）→ **909 计 / 906 pass / 2 fail / 1 skip**——**2 红恰为既有基线红**（桌面 `pi-config.test.ts` 检出目录名断言、pm shared `path-primitives.test.ts` 的 macOS `/private/var` 前缀；计/过较上一节 893/890 的增量含他角色在途改动）；本角色目录 0 红；`npm run typecheck` → **全仓零错误**。Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`（工作区含他人在途改动）。**未读** `.env`、**未发**真实模型请求。

**边界 / 跨角色（未越界改）**：只写 `src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/log-noise.test.ts` 与本角色文档面。**供桌面角色**：`app/renderer/renderer.js:1611` 另有一条**回放分隔行**「会话已恢复（模型上下文一并恢复）」（`test/桌面应用/renderer.test.ts:593` 有断言）——那是桌面自己的会话回放 UI，属其边界，本轮**未动**；若客户对聊天流的要求涵盖该行，由桌面角色处置。
