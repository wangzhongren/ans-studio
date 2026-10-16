---
id: claude-truncation-parity-assessment
type: fix
title: 截断同构评估——对照 Pi F-3 的只读结论
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: draft
related: [claude-session, claude-governed-session-v2-a1]
events:
  - date: "2026-10-16"
    kind: created
    summary: 对照 Pi F-3 完成只读同构评估；结论 (b) 无同构缺陷，登记可见性残余与一项待确认
---

# 截断同构评估：Claude 路径没有 Pi F-3 那条「截断静默完成、吞掉报告」链

**状态：未实施 / 未测试。** 本文为**评估轮**产物：只读代码与只读依赖定位，**零代码改动、零测试改动、零 git 提交**；`kanban-live-2` 与 `角色卡/测试/docs/change/…kanban-live-real-project-evidence/` 全程未触碰。文中一切「拟」「若将来」均为建议，未落地。

派发来源：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md`（批准记录表「Claude适配器：截断同构评估（对照 F-3）」行，:25；立项评估 :79）。对照基线：`角色卡/Pi适配器/docs/fix/2026-10-15_fix_kanban-turn-truncation.md`（下称 Pi 提案）。评估对象 HEAD `27bc263`（e3c0100 之后仅文档提交）；SDK `@anthropic-ai/claude-agent-sdk@0.3.299`，其 CLI 2.1.299（darwin-arm64，`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`，sha256 `ba5ab7b8…`，见该包 manifest.json）。

## 一、结论（先说结果）

**（b）无同构问题**——对 Pi F-3 的缺陷链（「输出预算被钳到 1 → SDK 恢复静默失效 → 适配器把 length 归 completed → 报告被吞且回放层不可见」），Claude 路径逐环节均不可复现，且失败语义是「响亮失败」而非「静默成功」。理由分述于 §二、§三。

保留两个非缺陷级事项（不改变 (b)，不立修复）：
- **O-C1（可选加固候选，待客户确认）**：截断事实的**特定性**在事件流不可见（见 §四）。
- **T1（待确认，最小未封口假设）**：若真机探针证实「`subtype=success 且 is_error=false 且 stop_reason="max_tokens"` 的 result 帧」可达，则会产生一个静默截断点，届时应升级为 (a) 类小修复（额外读一个字段 + 外推一行）。二进制证据倾向不可达，见 §六。

## 二、逐项对照 Pi 根因

### 2.1 Pi 2.1「输出预算被钳到 1 token」→ Claude 无同构路径

- **ANS 侧没有任何输出预算设置或钳制**：全仓 `src/` 搜 `max_tokens|maxTokens|maxOutputTokens` 零命中；Claude 适配器构造 SDK 选项（`src/provider/claude/session.ts:224-231`）不含任何预算字段；子进程环境为白名单构造（`session.ts:163-174`，仅 PATH/HOME/TMPDIR/…/ANTHROPIC_API_KEY/CLAUDE_CONFIG_DIR/ANTHROPIC_BASE_URL 等），**不转发也不设置** `CLAUDE_CODE_MAX_OUTPUT_TOKENS`。
- **SDK/CLI 外部依赖（只读定位）**：CLI 自带输出上限与提示文案——二进制内含 "Claude's response exceeded the output token maximum … The CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable cannot raise this limit.（非流式请求）" / "…To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable."（偏移 ≈84,954,841），及 "the response hit the output token limit"（≈81,291,625）。即：输出预算由 CLI 默认值决定、可用环境变量调（流式路径），与 Pi 的差异是：**没有发现任何「按剩余上下文把预算反应性钳小」的路径**；对上下文压力，CLI 走的是拒绝/自动压缩一族（`prompt_too_long`、`tengu_ptl_surfaced_to_user`、reactive compact 代码在二进制 ≈210.68MB 区域），即「拒绝或压缩」，不是「静默把输出压到 1 个 token」。CLI 默认预算的确切数值属外部依赖，未定位（见 §六 T2）。
- 结论：Pi 的**放大器（钳到 1）在 Claude 路径没有对应物**。

### 2.2 Pi 2.2「SDK 恢复静默失效」→ Claude CLI 内置有界多次恢复，耗尽后响亮失败

CLI 2.1.299 嵌入 JS（二进制真值，偏移按 darwin-arm64 该构建）显示主回路针对截断有多层恢复：

- **恢复触发与上限**：`wd(b)` =「末条 assistant 帧 `apiError==="max_output_tokens"`」（定义 ≈210,641,145）；命中后在 `ae<=Er` 内补一轮，**`Er=3`**（≈210,629,299；守卫默认 `maxOutputTokensRecoveryCount:0`，≈210,629,092），转移记录 `transition:{reason:"max_output_tokens_recovery",attempt:ae}`（≈210,700,042–210,700,705 区域）。
- **恢复提示文案（CLI 注入，模型可见）**：`gft`＝"Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces."（定义 ≈194,992,353）；`fLt`＝"Your response above was cut off mid-stream. Resume directly from where it stops…"（`truncated_response_recovery` 分支，主回路 ≈210,701,000 区域，上限同为 `Er`）；thinking-only 场景另有 `hft` 文案与 thinking-block 复用路径（`bm`：单 thinking 块 + `stop_reason="max_tokens"` + `resumable` → 不注入提示、直接续 thinking，SDK 侧标记 `resumed_from_incomplete_thinking`：`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3656-3659`「max-output-tokens recovery」）。
- **耗尽后**：`Zl({withheld:…})` 构造终帧 / `{reason:"api_error"}` 收束（同区域）；SDK 类型面上「turn ended on an API error」的 result 为 `subtype:"success" + is_error:true`，错误文本在 `result` 字段（`sdk.d.ts:5804-5806`）；错误类别 `SDKAssistantMessageError` 含 `'max_output_tokens'`（`sdk.d.ts:3720`）。`TerminalReason` 枚举无 max-tokens 成员（`sdk.d.ts:9820`），即截断耗尽不被当作正常完成。
- 结论：**恢复机制存在、有界（3 次）、且耗尽后为错误收束**——与 Pi「一次性恢复静默 no-op」形状不同。CLI 恢复在轮内透明进行；恢复成功 = 模型真的得到继续机会（这是 Pi 侧缺失、F-3-a 想补的能力，Claude 已有）。

### 2.3 Pi 2.3「适配器把 length 归 completed」→ Claude 无同构归并位

- Pi 的归并位是 `src/common/pi-adapter/lifecycle.ts:40-48`（:45 三元把除 error/aborted 外一律归 `completed`，length 落 `completed` 且无记录）。**Claude 侧不存在对应函数**：`src/common/claude-adapter/lifecycle.ts`（全文 53 行）只有队列、abortError、waitForTurn（:3-53），**没有任何 observe/stopReason 归并**。
- Claude 的实际归并内联在 `src/provider/claude/session.ts` 的消息泵（:267-298）：
  - assistant 帧只抽 `text` 块发事件（:272-273），不读 `message.message.stop_reason`（流式帧该字段为 null，见 `sdk.d.ts:3630`），不读 `message.error`（含 `max_output_tokens` 成员），不读 `resumed_from_incomplete_thinking`。
  - result 帧判定为失败的依据只有 `message.subtype !== "success" || message.is_error`（:276-279）→ `resumeFailed` + reject("Claude SDK 本轮返回失败结果") + `closeEngine`；成功则 `nativeId = message.session_id` 并 resolve（:287-291）。**不读** `message.stop_reason`、`message.terminal_reason`。
  - 轮次 outcome 只有 catch 里派生的 `timed_out/aborted/failed` 与默认 `completed`（:330-335），settled 摘要 `Claude 本轮${outcome}`、detail `{outcome, turnId}`（:341）。
- 因此：**Claude 路径上「截断耗尽」以 result `is_error` 到达 → 轮次记 `failed`（响亮），不会记 completed**；「恢复成功」→ 正常 completed（此时截断已被 CLI 在轮内消化，不存在被吞的报告窗口）。编排对 failed 的既有处理不变（`src/pipeline/orchestration/run-role.ts:912-914` 判失败；无报告则 `terminal-fallback/unreported`，`run-role.ts:551/682`、`src/common/编排/handback.ts:126-140/346`）——诚实降级链完整。

### 2.4 Pi 2.4「截断事实不可见」→ Claude 部分同形（残余，非缺陷级）

- 同形处：截断的**特定事实**不进 ANS 事件流——settled detail 无截断标注（`session.ts:341`）；失败轮摘要只有 "Claude 本轮failed"，不说明失败种类（`session.ts:332`）；thinking-only 帧不发任何事件（:272-273 只取 text，与 Pi `real-adapter.ts:547-548/589-603` 同形——但 Claude 侧 thinking-only 收尾有 CLI 的 thinking_only_response 纠正（二进制 ≈210.70MB 区域 `query_thinking_only_response`，nudge 文案常量 `Kon`），后果不同形）。
- 不同形处（要害）：Pi 的不可见伴随**静默 completed**；Claude 的不可见伴随**failed** 或**已恢复**。前者才是 F-3 的 P0（su 以为正常收尾、无从察觉被截断）；后者 su 至少看到失败，且会话连续性不丢（新引擎经 `nativeId` resume，`session.ts:79/183/288-289`）。

## 三、结论（b）与适用边界

**判断：不立 F-3 同构修复。** 依据：Pi F-3 四要素在 Claude 路径或不存在（钳到 1、length→completed 归并位）、或形状相反（恢复有界且非静默、耗尽响亮失败）、或后果不同（不可见只发生于已失败或已恢复的轮）。「截断且未交报告」在 Claude 侧的可观察结果是既有的诚实降级（`unreported/terminal-fallback`），不是 F-3 的「completed 且无报告且回放无痕」。

边界情形（如实列出，均不构成 (a)）：

1. 恢复成功但模型续写后仍未调用 `submit_report`：轮次真实 completed，报告缺失走既有 `unreported` 降级。这是模型行为而非截断机制缺陷（模型已获得继续机会），与 Pi F-3「轮内模型没有任何机会」不同。
2. 截断期间轮内墙钟可能变长（CLI 恢复轮内进行）；ANS 侧 `promptTimeoutMs` 仍独立守门（`session.ts:329`），超时→`timed_out`/响亮失败，无新语义。
3. 若 CLI 恢复文案（gft 等）经由 SDK 流对消费者可见：ANS 只消费 assistant/result 两类帧（:272/:274），不受影响（未逐一复现其流可见性，标待确认，但不改变结论）。

## 四、残余不对称（O-C1，可选加固候选，仅记录、未实施）

**加什么**：若希望截断事实在 replay/UI 可见且带 kind（如 settled detail 追加 `truncation:"max_output_tokens"`，或对失败轮发一条系统消息注明「本轮失败：模型输出达上限被截断」）。
**为哪种情况准备**：CLI 恢复耗尽后的 failed 轮；su 人工排查时少一次「failed 太笼统」的困惑。
**依据**：本次评估中该信息确实只存在于原生层（result.stop_reason / assistant error），ANS 事件流不可见（§2.4）；Pi 提案 F-3-b 的同类论证。
**不加会怎样**：失败轮仍如实 failed、报告仍走 unreported——行为与今日一致，仅特定性欠缺。
**代价**：`session.ts` 结果分支与 settled 各加一处判断 + 测试桩扩展；语义面只增不减。
**判断**：非缺陷级，**默认不勾选**；是否做由 PM/客户决定（如客户希望两个 runtime 的截断叙述统一，可合并为一条跨角色小任务，见 §五）。

## 五、F-3-a/b 机制的复用性评估（假如同构修复）

Pi 提案的机制由两半构成：**a（截断后限一次收尾补发）**、**b（截断事实外推：系统行 + settled detail 加 `truncation` 字段）**。逐半对照：

- **a 半（补发）：对 Claude 不适用，且不建议叠加。** Claude 的补发由 CLI 在本轮内已做（`max_output_tokens_recovery`，≤3 次，提示文案 `gft`/`fLt`，§2.2）；适配器再补一段会形成两层自动续写（双发提示、与 CLI 恢复状态交错），风险大于收益。共享价值≈0。
- **b 半（外推）：概念可复用，代码不可跨角色搬。** 两点原因：
  1. **检测源不同**：Pi 每条 assistant 消息就有 `stopReason`（`lifecycle.observe` 可判）；Claude 流式 assistant 帧 `stop_reason` 为 null，事实在 result 帧（`sdk.d.ts:3630`）与 assistant `error` 字段（:3720）。检测器必须各写各的。
  2. **出口是公共契约**：`SessionEvent`（`src/model/runtime.ts:15-22`，kind 冻结集 :19）与 `RuntimeTurnOutcome`（:238，四值）属**运行时核心**单一来源；若要「truncation 字段/系统行文案」跨 runtime 统一，需由运行时核心在其契约里加（本角色不越界、不代改）。否则各适配器只能走 Pi-b 的「既有 `unknown` detail 里自行加字段」路线（追加安全、消费方忽略安全）。
- **可共享的抽象位置（只写建议）**：
  - 契约层（运行时核心属主）：settled detail 的 `truncation?: string`（或等价字段）半开口约定；`errorCode` 类细分如需统一也在此层。
  - 适配器层（各角色私有）：detector +「每轮首条系统消息」+ settled 字段。Claude 侧落点将是 `src/provider/claude/session.ts` 的结果分支（:274-291，读 `stop_reason`/`error`）与 settled 发射（:341，用既有 `emit` 的 redact 包装 :89-92）；测试落点是 `test/claude-adapter/session.test.ts` 的 `fake()` 结果桩（:74，当前只合成 `subtype/is_error/session_id/user_message_uuid`，无 `stop_reason`/`error` 变体——**现无任何截断路径测试**）。
  - 不采用：把 `pi-adapter` 模块搬进或共享给 `claude-adapter`（角色私有实现，检测源结构不同，会制造第二份行为）。
  - 模式借鉴点（不共享代码）：Pi F-3-a 的「本轮是否已成功 `submit_report`」判据，Claude 侧有同类可观察点（工具 handler 的 `callTurn` + 工具名，`session.ts:199-221`）。
- **净结论**：假如同做，共享的应是**契约字段语义**（运行时核心立项），不是 Pi 的代码；且鉴于 (b)，当前无需为 Claude 立项。

## 六、待确认与补充验证方案

- **T1（最小未封口假设，最影响 (b) 的封口）**：是否存在可达的 result 帧「`subtype:"success" ∧ is_error:false ∧ stop_reason:"max_tokens"`」。二进制证据倾向不可达（恢复上限内继续→终帧 stop_reason 为 end_turn/tool_use；耗尽→`api_error` 收束→is_error），但未真机复现。**验证方案（不实施，需派发）**：扩展既有原生探针 `test/claude-adapter/native-loopback.probe.ts`（真实 bundled CLI + 本地 127.0.0.1 SSE 假服务器已跑通，见文件头注释）——在 SSE 响应序列里构造 `stop_reason:"max_tokens"` 的截断应答（含 thinking-only 变体），观察：CLI 是否发起恢复请求、恢复尝试次数是否=3、耗尽后到达 SDK 消费者与 ANS 的最终帧（subtype/is_error/stop_reason/terminal_reason）与 settled。若证实不可达→(b) 封口；若证实「success ∧ !is_error ∧ max_tokens」可达→升级 (a) 小修复（读 result.stop_reason + 外推，修复面同 §4）。
- **T2**：CLI 未设 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 时的默认输出预算值（外部依赖；只读未定位默认常量）。影响面：仅叙述精度，不影响结论。
- **T3**：`hft`（thinking-only 续写提示）在 2.1.299 是否因标志 `Mr(){return!1}` 常态关闭、thinking-only 截断是否统一走 thinking-block 复用（`bm` 路径）。二进制推断，未复现；只影响 §2.2 叙述精度。
- **T4**：CLI 恢复注入的 meta 提示在 SDK 流中是否对消费者可见（ANS 只消费 assistant/result，预计无影响）。

## 七、证据坐标（复核对表）

| 事实 | 坐标 |
| --- | --- |
| ANS 无输出预算设置/钳制 | `src/provider/claude/session.ts:163-174`（childEnv 白名单）、`:224-231`（queryOptions 无预算字段）；`src/` 全仓 grep `max_tokens\|maxTokens` 零命中 |
| assistant 帧只发 text、无 stop_reason/error 处理 | `session.ts:272-273` |
| result 帧失败判据仅 subtype/is_error；不读 stop_reason/terminal_reason | `session.ts:274-291`（:276-279 失败分支，:288 nativeId） |
| outcome 归并与 settled detail（无截断字段） | `session.ts:330-335`（派生）、`:341`（发射） |
| Claude 无 observe 归并位 | `src/common/claude-adapter/lifecycle.ts:3-53` 全文 |
| Pi 归并位（对照） | `src/common/pi-adapter/lifecycle.ts:40-48`（:45）；`real-adapter.ts:421/547-548` |
| 编排对 failed 与无报告的既有诚实降级 | `src/pipeline/orchestration/run-role.ts:912-914/551/682`；`src/common/编排/handback.ts:126-140/346` |
| SDK：流式 assistant stop_reason=null、事实在 result | `@anthropic-ai/claude-agent-sdk/sdk.d.ts:3630/3635` |
| SDK：max-output-tokens recovery 标记 | `sdk.d.ts:3656-3659` |
| SDK：assistant error 含 `max_output_tokens` | `sdk.d.ts:3720` |
| SDK：result stop_reason 字段；API-error 回合 result 语义 | `sdk.d.ts:5752/5868`；`5804-5806` |
| SDK：TerminalReason 无 max-tokens 成员 | `sdk.d.ts:9820` |
| CLI：恢复上限 `Er=3`、恢复转移/耗尽路径 | 二进制 darwin-arm64 2.1.299 偏移 ≈210,629,299 / ≈210,700,042–210,709,000 区域（`max_output_tokens_recovery`） |
| CLI：恢复文案 gft/hft/fLt | ≈194,992,353（`gft` 定义）；≈210,701,000（`fLt`） |
| CLI：输出上限与 env 文案 | ≈84,954,841；≈81,291,625 |
| 测试现状：夹具结果桩无 stop_reason/error 变体 | `test/claude-adapter/session.test.ts:74` |
| 原生探针（未来 T1 验证载体） | `test/claude-adapter/native-loopback.probe.ts:1-2` |

附注：二进制偏移按本机 darwin-arm64 构建（sha256 `ba5ab7b8c195fa03ab8d5bf3915c76153b576a2c40e79a5c46e265e7ed9744b3`，SDK manifest.json）核对；跨平台二进制偏移可能不同，复核对请以包内 manifest 校验和先验身份，或改用 `sdk.d.ts` 行号（稳定）。本文所有本仓行号以**已提交基线 HEAD `27bc263`** 为准；若 Pi F-3 实施（`pi-adapter` 两文件）此后落地，`pi-adapter` 行号按函数名（`observe`/`finish`/`message_end`）定位。

关联：[Claude 会话功能](../feature/claude-session.md)。（功能文档的演变历史回链在将来若实施任何改动时补。）
