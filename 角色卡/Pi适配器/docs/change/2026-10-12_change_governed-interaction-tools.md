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
