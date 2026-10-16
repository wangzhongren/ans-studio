---
id: codex-truncation-parity-assessment
type: fix
title: Codex 路径截断同构评估（对照 Pi F-3）——评估报告
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: assessment-only
---

# Codex 路径截断同构评估（对照 Pi F-3）

**状态：评估轮——未实施、未测试。** 本轮只写评估文档：**零代码改动、零测试、零 git 提交**；`kanban-live-2` 与 `角色卡/测试/docs/change/…kanban-live-real-project-evidence/` 未触碰。行号基于工作树（HEAD `27bc263`；本角色三文件无未提交改动，`src/provider/codex/session.ts` blob `7831d908…`）。文中推测性结论均标注证据等级；拿不准处标「**待确认**」。

## 结论（先列）

**（b）无同构缺陷。** Pi F-3 的缺陷类——「截断被静默归类为『完成』、事件流零表示、截断事实不上事件面」——在 Codex 路径**不存在**：Codex/Responses 协议的未完成终态在**外部层**即被判为**错误**（非成功终态），ANS 适配器把它如实映射为 `failed` 轮次，settled 事件、`prompt()` 抛错、回交 `status:"failed"` 三处均可读到，且错误消息携带截断原因文案。残余差异（重试成本、结构化程度、外部一致性）与「截断后报告缺失」的后果仍在，但不构成适配器层同构修复的立项理由，列为观测/验证项（§五）。

## 一、任务与基线

- 派发来源：项目管理批准记录 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md`——实施派发表「Codex适配器：截断同构评估（对照 F-3）」行；依据 Pi适配器提案跨边界节。
- 对照基准（Pi F-3 根因，`角色卡/Pi适配器/docs/fix/2026-10-15_fix_kanban-turn-truncation.md` §二.3）：Pi 的缺陷是三段的——(1) `lifecycle.ts:40-48` 把 `stopReason="length"` 归 `completed` 且不记录该事实；(2) `real-adapter.ts:547-552` 截断消息只剩 thinking ⇒ 不发任何事件；(3) 截断事实只存在于 native 文件，replay/UI/编排均不可见，模型没有任何机会补发报告。
- 取证时点备注：本轮取证时，F-3-a/b 实现（Pi适配器 `lifecycle.ts`/`real-adapter.ts`）与 F-3-d（编排 `handback.ts`）已存在于**未提交工作树**（`git status` 三文件为 M）。本文引用其「落盘约定」时以工作树为准并逐处标注；Pi 提案文档本身仍是「未实施」文本，两者勿混。

## 二、Codex 路径的截断/未完成应答处理——逐步定位

### 2.1 本角色代码（写权面，只读审查）【本角色代码】

| 位置 | 内容 | 与截断的关系 |
| --- | --- | --- |
| `src/provider/codex/session.ts:513-518` | `turn/completed` 归类：`completed`→completed、`interrupted`→aborted、**其余一律 failed**（:515）；`completed.error.message` 记入 `turn.failure`（:517） | 任何非正常终态都无「完成」后门；未知状态 fail-safe 落 failed |
| `session.ts:519-521` | `error` 通知：`willRetry !== true` → failed+message；**`willRetry === true`（内部重试中）故意不产生任何事件** | 全路径唯一「静默」——瞬态重试语义，非终态 |
| `session.ts:447-448` | 轮次 failed/timed_out 时 `prompt()` 向调用方抛错（消息=turn.failure） | 截断失败对编排显式可见 |
| `session.ts:455-457` | `finally` 内唯一 settled 发射：summary=`Codex turn ${reason}`，detail=`{outcome, error?}` | 截断事实以 settled failed+error 文案上事件面 |
| `session.ts:505-507` | `item/completed` 的 agentMessage → `message` 事件 | 已产出的部分正文会外推（被切断那条的可见性见 §五待确认 4） |
| `session.ts:498-500` | `transportClosed` → failed | 传输断死也走 failed |
| `src/common/codex-adapter/protocol.ts`、`config.ts` | 传输/工具/配置辅助；`config.ts:48-57` `safetyOverrides` **不设置** `stream_max_retries` 等重试参数 | 适配器不干预外部重试行为（取 codex 默认） |
| 全三文件 grep | **无任何** `incomplete` / `truncat` / `max_output` / `finish_reason` 字样（0 命中，见 §证据 E4） | 适配器不做截断识别、不抑制、不补发——全部依赖外部协议把「未完成」表达为错误 |

### 2.2 外部协议链（非本角色代码；只读定位）【外部协议】

链条自模型到客户端（证据来源逐段标注）：

1. **Responses API / SSE（模型面）**：截断以「未完成终态」表达（`response.incomplete` 事件族 / 响应体 `incomplete_details.reason`，如 `max_output_tokens`、`content_filter`）。属外部协议。
2. **codex-api `sse/responses.rs`**：把未完成终态转成错误 `ApiError::Stream("Incomplete response returned, reason: {reason}")`。证据：上游 issue openai/codex#38831（正文与评论引该文件 `response.incomplete` 分支与代码行）；**本地固定 CLI 0.162.1 二进制含同族文案**（`Incomplete response returned, reason: `、`incomplete_details`/`reason` 字段解析与 `codex-api/src/sse/responses.rs:573/578` 行引用，见 E1/E2）。**注意**：0.162.1 二进制**没有** `response.incomplete` 字面量（字节级 0 命中，E2），与 main 上按事件类型分支的引用行不一致——0.162.1 的具体判定分支（事件类型 vs 响应体 `status`/`incomplete_details`）未从二进制完全还原，标**待确认（不影响语义结论：两代实现都属「未完成→错误」）**。
3. **错误分类与重试**：`ApiError::Stream → CodexErr::Stream`（api_bridge.rs）；stream 错误被归为**可重试**（protocol/src/error.rs）；按 `stream_max_retries` 重试同一请求，耗尽后报 `stream disconnected before completion: Incomplete response returned, reason: …`。证据：issue #38831 正文/评论；本地二进制字符串 `stream_max_retries`、`#exceeded retry limit, last status:`、上引 final 文案（E1/E3）。issue 于 2026-10-13 被标记 "fixing" 并关闭（修复在 main）；**0.162.1（ANS 固定版）是否含修复待确认**——有用户在 0.162.1 上复现的报告（issue 内 Water-Run），且本地二进制仍含完整重试链文案、未见专用错误变体名（`ResponseIncomplete`/`IncompleteResponse` 扫描 0 命中，E3）。
4. **app-server JSON-RPC（ANS 实际客户端面）**：终态经 `turn/completed`（TurnStatus ∈ `completed`/`interrupted`/`failed`/`inProgress`，二进制 serde 串簇可证）与/或 `error` 通知（`ErrorNotification` 含 `willRetry` 与结构化 `codexErrorInfo`：`responseStreamDisconnected`/`responseStreamConnectionFailed`/`httpConnectionFailed`/`responseTooManyFailedAttempts`/`activeTurnNotSteerable`/`contextWindowExceeded` 等，二进制可证）送出。本适配器**只读** `.message` 与 `willRetry`，未消费 `codexErrorInfo`（grep 0 命中）。

### 2.3 端到端呈现（据上推断，未经真机）

截断 ⇒ 外部内部重试（ANS 事件流不可见，:519 静默）⇒ 耗尽 ⇒ `error(willRetry:false)` 和/或 `turn/completed failed` ⇒ 适配器：settled `Codex turn failed` + `detail.error`（含 `Incomplete response returned, reason: …` 文案）＋ `prompt()` 抛错 ⇒ 编排（只读参考，工作树 `src/common/编排/handback.ts:337-343`）：回交 `status:"failed"`、summary「本轮执行失败…，尚不能确认任务完成。」

即：**报告仍会缺失**（该轮无提交机会，与 Pi 相同），但以「失败+原因」诚实呈现，而不是 Pi 式「完成」假象。此推断的外部位（重试计数、终态通知精确形态）标**待确认**（§五）。

## 三、同构性判定（对照 Pi 三段缺陷）

| Pi 缺陷段 | Codex 对应 | 判定 |
| --- | --- | --- |
| 截断归 `completed` 且不记录 | `session.ts:515` 默认 failed；`length`/incomplete 类状态在外部即判错误 | **不同构**（反证） |
| 截断消息不发任何事件 ⇒ 零表示 | settled failed + `prompt()` 抛错 + `detail.error` 文案 + 回交 failed；仅重试期瞬态静默（设计如此） | **不同构**（反证） |
| 截断事实仅 native 可见 | 事实进 ANS 事件面（settled detail.error）与回交状态 | **不同构**（反证） |
| 无第二次机会交报告 | 两侧今天相同（Codex 也暂无补发）；但 Codex 的缺失发生在「显式失败轮」，su 可读到失败与原因，非静默 | 结构不同；补发评估见 §四 |

**结论（b）**。残余风险（不构成适配器同构缺陷，列观测）：

- **R1 成本面（外部缺陷）**：incomplete 被外部归为可重试 ⇒ 同请求重试至耗尽（issue #38831 要点）。影响=时延与用量；缓解手段（升级 CLI、配置 `stream_max_retries`）属装配/PM 决策与产品口径，非本角色边界，且本适配器当前不设置重试参数（`config.ts:48-57`）。**待确认** 0.162.1 是否仍含重试。
- **R2 结构化程度**：截断原因只以自由文本出现在 `detail.error`；`codexErrorInfo` 未消费。若编排/UI 想按类区分（如仅对截断类失败注记），需本角色会话层与编排的跨边界约定（见 §四）。
- **R3 外部一致性**：若网关把截断**误标**为完整完成（如 `completed`+`status:"completed"`），协议可观察面上两适配器都不可见——非适配器层同构缺陷，属网关合规观测项（§五 V2）。

## 四、对 F-3-a/b 的复用性评估（只写建议；不动共享代码）

约定现状（工作树）：Pi 侧 F-3-b = 每轮首条截断发一条系统 `message` 行（detail `{turnId, truncation:"length"}`）+ settled detail 追加 `truncation:"length"`（`pi-adapter/lifecycle.ts:61-63/97`）；F-3-a = 同轮限一次「收尾补发」提示（env `ANS_PI_LENGTH_FOLLOWUP`，`real-adapter.ts:621-627/711-713`）；编排 F-3-d 仅对 `detail.truncation === "length"` 且未交报告者注记（`handback.ts:344-350`）。

- **F-3-b（事实外推）**：概念可复用、**代码不可复用**。Pi 的载体挂在「完成轮附注」语义上；Codex 的截断走「失败轮既有 error 通道」，事实已在外推，只是无结构化标记。若产品要求结构化对齐，最小自足方案=session.ts 在失败时附加只增字段（如 `truncation:"incomplete"`，判据取外部文案前缀与/或 `codexErrorInfo`）。**不建议现在做**：(i) 文案匹配跨版本脆弱（上游修复会改文案/错误类别，见 issue #38831）；(ii) 消费方（编排 F-3-d）只认 `"length"`，新值需跨角色约定与派发；(iii) 暂无消费场景证据。**建议登记为可选候选（未立项），与 R2 合并考虑**。
- **F-3-a（截断后限一次补发）**：技术上自足（失败轮后会话仍可用——`session.test.ts:237-242` 已证；`submit_report` 是否注入可查 `options.tools`，成功可经 :325-363 的 MCP 代理跟踪），但**不建议立同构修复**：(i) 外部重试已先行 N 次同请求，补发大体面对同一上下文/预算条件，预期救回率低（Pi 的救回靠 overflow 压缩缩上下文，Codex 该路径不会压缩）；(ii) 「failed 轮内补发」牵动 turn/报告归属语义（报告按 turnId 记账、轮次关闭拒收——编排单一属主域）。如产品坚持，须先有真机/回环证据与编排侧语义裁定，走独立提案。
- **F-3-c/d 对照**：c（提示词）对 Codex 同样边际（提示词面经 `composeContext` :218-224，无需改）；d（回交摘要注记）若要覆盖 Codex 失败轮「原因文案入摘要」，属编排改动 + 本角色结构化信号前置（见上），跨边界另派。

## 五、待确认项与补充验证方案

待确认：

1. 0.162.1 的 incomplete 判定分支（事件类型 vs 响应体）与重试是否仍在生效（issue 修复是否已包含于 0.162.1——本地二进制倾向「未包含」，判据不穷尽）。
2. app-server 对 incomplete-耗尽 的终态通知**精确形态**（`error[willRetry=false]` 与/或 `turn/completed failed`），及 error 对象是否带 `codexErrorInfo` 与取值。
3. ans-gateway 对截断的 Responses 协议表达（是否如实 `incomplete`；R3）。
4. 被切断的那条 agentMessage 是否经 `item/completed` 外推（部分正文可见性；`session.ts:505-507` 只处理已完成的 item）。

补充验证方案（候选，属实施/验证轮；本轮不做）：

- **V1（本地、无外部模型）**：固定 CLI 0.162.1 + 本地假 Responses SSE 回环（团队已有先例：「pinned CLI 0.162.1 + realMCP 本地假 SSE 回环」，见本角色 api-spec.md 2026-10-15 节），对 `turn/start` 对应的模型请求回 `response.incomplete`（reason=max_output_tokens）终帧，观测 app-server 发出的通知序列与文案、重试与终态 ⇒ 直接回答待确认 2/4（可顺带确认 1 的重试面）。
- **V2（真机、一次性）**：真机让 Codex 路径产生一次截断（可复用 F-9 高占用场景），记录 replay settled/detail、回交摘要 ⇒ 回答 2/3。
- **V3（PM/装配）**：评估升级 codex CLI 至 issue #38831 修复后版本（与 R1）。

## 六、证据清单（本轮命令）

- **E1**：`strings -n 8 <bin> | grep "Incomplete response returned"` —— 命中 `Incomplete response returned, reason: `、`stream disconnected before completion: Incomplete response returned, reason: content_filter`。`<bin>`=`node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`（0.162.1）。
- **E2**：`LC_ALL=C grep -ac` 字节级：`response.completed` 18 行命中；`response.failed` 1；`response.output_item.done` 1；**`response.incomplete` 0**；另有 `incomplete_details`+`reason` 与 `responses.rs:573/578` 行引用同段。
- **E3**：serde 串簇：TurnStatus `interruptedfailedinProgress`；`struct ErrorNotification with 4 elements…willRetry`；`CodexErrorInfo::ResponseStreamDisconnected` 等变体；`stream_max_retries`；`#exceeded retry limit, last status: `；`ResponseIncomplete|IncompleteResponse|response_incomplete` 扫描 0 命中。
- **E4**：`grep -in "incomplete|truncat|max_output|finish_reason|context_window" src/provider/codex/session.ts src/common/codex-adapter/protocol.ts src/common/codex-adapter/config.ts` → 0 命中；`codexErrorInfo|errorInfo|error_info` → 0 命中。
- **E5**：本角色测试面：`test/codex-adapter/fixtures.ts:76-79`（`finish(status,error)`/`message(text)` 模拟 `turn/completed` 与 `item/completed`）；`session.test.ts:99-104`（failed→prompt 拒绝+脱敏）、`:237-242`（失败轮后会话可继续、恰 2 settled）、`:243-249`（timed_out detail）。**覆盖缺口**：无 incomplete 专项夹具（现有均以通用 failed 模拟）。
- **E6**：外部来源 openai/codex issue #38831（2026-10-13 closed "fixing"）：引用链 `response.incomplete → ApiError::Stream` →`CodexErr::Stream`→retryable→重试/传输回退→耗尽文案；用户在 0.162.1 上复现的报告在案。

## 七、对本次评估的自我限界

- 全部结论基于**静态代码 + 固定版二进制字符串 + 上游公开记录**；未跑任何真机/回环（本轮评估轮不实施）。§二.3 的端到端序列是「外部行为+适配器映射」的合成推断，外部位已逐项标待确认。
- 二进制字符串判据不穷尽（可达字符串≠全部代码路径），凡「二进制未见」之处均按待确认处理，未升级为断言。

（本文状态：**未实施 / 未测试**。如需推进 §五 V1/V2，请 PM 派发实施/验证轮。）
