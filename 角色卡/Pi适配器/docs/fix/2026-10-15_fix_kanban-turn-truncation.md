---
id: pi-kanban-turn-truncation-fix-proposal
type: fix
title: 输出上限截断吞正式报告（F-3）与压缩频次观察（F-9）——修复提案
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: proposed
revision: 1
---

# 输出上限截断吞正式报告（F-3）与压缩频次观察（F-9）——修复提案

本上下文固定为 Pi 适配器（boundary.yaml Section 1）。本轮为**提案轮**：只写提案文档，**未改任何 src/app/test 代码、未写测试、未 git 提交**；`kanban-live` 项目与 `角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/` 下文件全程只读。两个问题的派发来源：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md`（F-3 属主＝Pi适配器；F-9 属主＝Pi适配器，观察项）。

证据锚点（真机、只读）：
- replay（ANS 回放层）：`~/code/vibeingcode/ans-testbed/kanban-live/.ans/sessions/测试者/pi/ans/replay.jsonl`（下称 replay，按行号引用）。
- native（Pi 原始会话）：同项目 `.../pi/native/2026-10-15T13-28-32-587Z_01a13fc0-….jsonl`（下称 native，按 0 基行号引用）。
- 终态报告 JSON：证据目录 `raw/26d61e5f777ac82dede509285031fed6114304ad56e54a9f207dee4e60b996be.json`。
- 被测模型：`ans-gateway / deepseek-v4-flash[1m]`（api=anthropic-messages，thinkingLevel=medium，native idx 1）。
- 被测代码版本：本仓 HEAD `e3c0100`（与测试轮 baseline.json 的 `ansHead` 一致）。

**状态：未实施 / 未测试。** 文中一切「拟改」均为方案；标注「待确认」处为证据不足项。

---

## 一、F-3（P0）问题与证据

测试者第一轮已完成全部 6 个测试文件与缺陷定位（KANBAN-DEF-001），但收尾轮回复被输出上限截断，`submit_report` 未发出；系统如实降级为 `unreported / terminal-fallback`，正式报告缺失，su 只能人工重建。事实链（均为实测记录）：

| 时刻（2026-10-15） | 事实 | 出处 |
| --- | --- | --- |
| 13:34:36.872Z | 测试者一次 `run_shell`（`ls -la /var/folders/…/T`）返回 **1,048,671 字符**的工具结果入上下文 | native idx 94 |
| 13:34:48.410Z | `上下文压缩完成（触发：threshold）：压缩前约 375596 tokens`（开始事件 13:34:36.882Z） | replay 119/120；native idx 95 |
| 13:34:48.413Z→13:34:56.954Z | 压缩后**下一个**真实请求：`input=465496, cacheRead=2176`（真实 prompt≈467,672 tokens），响应 `stopReason=length / rawStopReason=max_tokens`，`output=1`，content 只有 thinking「The」（无文本、无工具调用） | native idx 96 |
| 13:34:56.955Z | `context_edit`（targetId=截断消息 d1f546ba，replacement=null）——SDK 把截断消息从上下文剔除 | native idx 97 |
| 13:34:56.956Z | `settled`，summary「会话结束」，detail `{outcome:"completed"}` | replay 121 |
| 13:34:56.957Z | 系统生成终态报告 `26d61e5f…`：`origin=terminal-fallback, status=unreported`，summary 如实写明「本轮未提交正式任务报告…」、证据为 19 条已写入文件 | 报告 JSON |

同会话第二次出现（第二轮任务）：13:52:30.191Z su 派发复跑任务（replay 122）；13:52:30.194Z→13:52:37.436Z 该轮**第一个**真实请求 `input=338687, cacheRead=130048`（真实 prompt≈468,735 tokens）再次被截断（`stopReason=length`，`output=1`，thinking「Let」；native idx 99）。这一次 SDK 的自动恢复生效（见根因），13:52:37.437Z 剔除截断消息、13:52:37.437–13:52:56.861Z overflow 压缩、重试后模型继续工作（13:52:58.854Z 起，重试后首个请求真实用量仅≈6,704 tokens，native idx 102），最终 13:56:28.970Z 正常 settle 并交出了正式报告（`raw/15ef7606….json`，origin=submitted-report）。

同类第二次出现（另一会话）：taskboard 轮 `06-governance-repair-progress-ax.txt:203-205` 记录了「unreported」回交与 `write_file 执行失败（Tool call "write_file" was not e…`（参数被截断的迹象），与 problem-summary A2 的记载互证。

**必须保留的行为**：诚实降级（unreported/terminal-fallback、证据保留、不谎报完成）在本轮工作正常，是本次修复要保护的既有性质，不是要改掉的对象。本提案只解决「报告通道被截断掐断且截断事实在回放层不可见」。

## 二、F-3 根因（读实际代码，含只读的 SDK 定位）

### 2.1 截断的机械原因：输出预算被钳到 1 token（SDK 层，只读定位）

- pi-ai 在构造 anthropic-messages 请求时钳制输出预算：`clampMaxTokensToContext`（`node_modules/@earendil-works/pi-ai/dist/api/simple-options.js:3-9`）：
  `max_tokens = min(model.maxTokens, max(1, model.contextWindow − estimateContextTokens(context) − 4096))`，其中 `MIN_MAX_TOKENS=1`、`CONTEXT_SAFETY_TOKENS=4096`；调用点 `dist/api/anthropic-messages.js:740`。
- 本会话 `model.contextWindow` 由 ANS 配置注入（`ANS_PI_CONTEXT_WINDOW`，见 F-9；实测注入值未留档）。两次截断请求的**真实** prompt 用量（input+cacheRead）为 467,672 / 468,735，`output=1`——与「估算值达到/超过配置窗口（threshold 压缩后估算并未有效回落）⇒ 可用输出预算被钳到下限 1」的算式一致（确切的钳制归因：SDK 钳制 vs 网关侧钳制，**待确认**；SDK 侧算式与观测自洽）。
- 结果：该轮模型**只来得及输出 1 个 token**（"The"/"Let"）即以 `max_tokens` 收场。这也直接决定了下文 F-3-c 候选（提示词类方案）的评估结论。

### 2.2 SDK 的恢复尝试与「静默失效」（只读定位）

- SDK 对 length 截断有内建的「压缩并重试一次」：`_checkCompaction`（`pi-coding-agent/dist/core/agent-session.js:2329`）判 `recoverableLength`（`:2375`；`isRecoverableLength = stopReason==="length" && output < model.maxTokens`，`pi-ai/dist/utils/overflow.js:170`）→ `_omitRecoveryAttempt`（剔除截断消息，即 native idx 97/100 的 context_edit）→ `_runAutoCompaction("overflow", true)`（`:2405-2407`），最多一次（`_overflowRecoveryAttempted` 守卫，`:2383`；用户消息开始时重置，`:729`）。
- 第二轮：该路径成功（replay 124/125；重试后上下文大幅收缩）。
- 第一轮：该路径**静默失效**——`_runAutoCompaction` 内唯一不发任何事件的提前返回是 `prepareCompaction` 未产出可压缩内容时的 `if (!preparation) return false;`（`agent-session.js:2471-2473`；`prepareCompaction` 的 `return undefined` 条件见 `compaction/compaction.js:606/639`）。观测与之吻合：native idx 97 之后**没有**任何压缩开始/完成/失败事件，1–2ms 内直接 settle（replay 121）。即：**刚压完（threshold）后的截断，SDK 的恢复压缩「无可压」而静默放弃，轮次就此结束**。（精确到是 `preparation===undefined` 还是 `prepareCompaction` 内部被静默吞掉的异常：**待确认**；两种结局在证据上不可分。）
- 结论：**不能依赖 SDK 自动恢复来保报告**；报告通道的兜底必须在 ANS 层有自己的、有界的动作。

### 2.3 适配器层（本角色边界，根因所在）

- `src/common/pi-adapter/lifecycle.ts:40-48` `observe(message)`：对 assistant 消息只分辨 `stopReason === "error"→failed`、`=== "aborted"→aborted`，**其余一律落 `"completed"`（:45）**——`"length"` 截断被当作普通完成，且**不记录**该事实。
- `src/common/pi-adapter/real-adapter.ts:547-552`（`message_end`）只经 `extractMessageText`（:589-603）抽取正文文本；截断消息只有 thinking 块 ⇒ **不发任何事件**。原始接线点：`wireSettledOnce`（:412-427）在 `message_end` 调 `lifecycle.observe(event.message)`（:421）。
- 因此 replay/UI 层看不到截断：replay 只有 settled「会话结束」（summary 未提截断）；截断事实**只存在于 native**。这正是派发条目 F-3 候选(b) 指向的缺口。
- 报告通道本身没有断开：编排 `withHandback`（`src/common/编排/handback.ts:313-354`）在 settled 时取 `opts.report(turnId)`（`src/pipeline/orchestration/run-role.ts:682`），无报告则如实构造 `terminal-fallback/unreported`（`buildTaskHandback`，`handback.ts:126-140`）。问题在于截断轮**模型没有任何机会**发出 `submit_report`（`src/provider/runtime/schema.ts:108-149`，运行时核心单一来源），而系统也**没有试过给它第二次机会**。

## 三、F-9（P3 观察项）问题与评估（只记录，不实施）

### 3.1 观察记录

同一测试者会话内：
1. 13:34:48 `threshold` 压缩（压缩前估算 375,596；replay 120）。
2. 13:52:37–56 `overflow` 压缩（压缩前估算 265,185；`willRetry=true`；replay 124/125）——触发者实际是上一条截断回复的**可恢复 length 停**（2.2 的 `recoverableLength` 路径），不是上下文真正溢出：它在「新任务开跑后的第一个请求」处出现，与该轮上下文仍然很大（真实 prompt≈468,735）直接相关。

两次压缩功能上均成功（第二轮重试后继续工作），「自动压缩 + 自动重试」链路可用；问题是**第一次压缩没有把真实请求拉回安全区**。

### 3.2 阈值配置来自哪里（代码位置）

- ANS 侧（本角色）：
  - 上下文窗口解析：`src/common/pi-adapter/provider-config.ts:119-149`（优先级：显式 opts > 环境变量 `ANS_PI_CONTEXT_WINDOW` > 保守默认 `DEFAULT_PI_CONTEXT_WINDOW=32768`，:81）；缺失时给出可见提示（:156-163）。
  - 压缩设置固定覆盖：`src/common/pi-adapter/settings.ts:48-57`（`ANS_SETTINGS_OVERRIDES`：`enabled:true, reserveTokens:16384, keepRecentTokens:20000`，等同 Pi 内置缺省、环境封闭）；经 `SettingsManager.inMemory` 注入（`real-adapter.ts:838`，:924/:928）。
  - 模型构造：`real-adapter.ts` 的 `buildExplicitRuntime`（:90-181）克隆 anthropic 模板后**无条件覆盖** `contextWindow=cfg.contextWindow`（:118；护栏 :174-178）——**不覆盖 `maxTokens`**（保持模板值）。
- SDK 侧（只读）：
  - 阈值判据 `shouldCompact = contextTokens > contextWindow − reserveTokens`（`compaction/compaction.js:173-176`）。
  - 触发点两处：请求前 `_compactBeforeNextAssistantResponse`（`agent-session.js:424`，经 request 投影钩子）、运行后 `_checkCompaction` case 3（`:2412-2446`）。
  - 估算口径 `estimateContextTokens`＝「最近一次有效 usage.totalTokens + 其后消息按 **chars/4** 估算」（`compaction.js:110-135`、`:201+`）。本次 `tokensBefore=375596` 与「上一请求 usage 113,282 + 1MiB 工具结果 ≈262,168（chars/4）」吻合（差 <0.1%）——**估算含 CJK 欠计风险，且与实际 API 计费口径不同**。

### 3.3 与网关模型标称上下文（1M）的关系

- 模板模型是 claude 的 `contextWindow=1,000,000`；ANS 明确拒绝沿用（`provider-config.ts:29-38` 的论证与 `real-adapter.ts:105-118` 的无条件覆盖）——模型 id 里的 `[1m]` 只是网关侧的模型名，**不进入 pi 的窗口计算**。
- 本轮注入的 `ANS_PI_CONTEXT_WINDOW` 实测值未留档（证据约定不含值）。可由证据反推：阈值在估算 375,596 时触发 ⇒ `CW ≤ 375,596+16,384 ≈ 391,980`；且两次截断请求的真实 prompt 达 467,672/468,735、输出被钳到 1 token，与「配置窗口（估算口径）已被触及」的算式一致（若为 SDK 钳制，反推 `CW ≤ ≈382,600`，**粗算、待确认**）。即：**算子配置的是远小于标称 1M 的保守窗口，压缩触发点按该值计算——这一方向本身正确**（`provider-config.ts` 的既定论证）。

### 3.4 是否存在「刚压完又爆」的阈值/预算问题：存在，且机制可证

1. **估算 vs 真实口径差**：阈值按估算触发（375,596），而下一请求的真实用量是 467,672（≈+24.5%）——触发时点距真实窗口的余量比配置看起来的更小（差额构成未逐项拆清，**待确认**；chars/4 对 CJK 的欠计是最可能来源）。
2. **尾部保留把巨量工具结果留在窗内**：threshold 压缩（split-turn、`keepRecentTokens=20000`）后，下一次真实请求仍是 467,672 tokens——单条 1 MiB 工具结果（≈262k 估算、真实更大）没有被压掉；`keepRecentTokens` 按估算计，但保留判断受「不可在工具调用与其结果之间切分/转向起点」等约束影响（具体构成**待确认**）。效果上：**该次压缩对真实 prompt 尺寸近乎零收缩**，紧接着的第一个请求即触到输出钳制。
3. **对比（同会话异轨）**：13:52 的 overflow 压缩把上下文从真实≈468k 收缩到重试后≈6,704 tokens（native idx 102）——同一会话证明「压缩本身能大幅收缩」，问题在 threshold 路径的**保留策略与估算口径**，不在「压缩频次」本身。
4. **工具结果尺寸与窗口无联动**：单条 `run_shell` 输出上限 `MAX_SHELL_OUTPUT_BYTES=1,048,576`（`src/provider/runtime/tools.ts:295`，运行时核心）≈26 万估算 tokens，单条即可占配置窗口的 ≈68%。这是放大器，不是本例的唯一原因，但值得评估（见 F-9-opt2）。
5. 与 A2/F-3 相互放大属实：13:52 的「overflow」触发者就是上一条截断（F-3），两次现象同源。

## 四、拟改动（最小）、必需项 vs 可选加固项、fail-honest 边界

### 4.1 候选评估（对应派发条目 a/b/c）

- **F-3-a 截断收尾补发（采纳为必需）**：`stopReason=length` 且本轮未成功提交报告时，由适配器在**同一轮次内**自动补发一次收尾提示，让模型在恢复出正常输出预算的下一轮里调用 `submit_report`。理由：2.2 已证不能依赖 SDK 恢复；2.1 已证截断轮内模型无法自救；a 是唯一能「把报告救回来」的机制。副作用面小：只影响「截断且未交报告」的轮次，限 1 次、可开关、失败不劣化现状。
- **F-3-b 截断事实外推（采纳为必需）**：把截断事实从 native 提到 ANS 事件流（一条系统消息行 + settled detail 带 `truncation:"length"`），replay/UI/后续编排消费方都能看见。理由：这是 P0 事故里唯一「本可避免 su 困惑与人工重建成本」的增量信息；且是 b 类（透明）改动风险最低的一项。做得小、只加不减。
- **F-3-c 阶段提示（评估后不采纳为修复手段，仅记录）**：在 `submit_report` 的 promptGuidelines（`src/provider/runtime/schema.ts:143-147`，属运行时核心）加「接近产出上限时优先提交报告」类提示。评估：**对本例无效**——截断发生时输出预算是 1 token（2.1），任何提示词都无法在那一轮被执行；若截断发生在余量较大处（如工具参数被截成半句），提示词至多改善「先交报告再写长文」的先后习惯，属边际收益。该文件不在本角色边界，本提案不建议为 F-3 实施；如需长期习惯引导，应由运行时核心按 F-3-c 编号另行评估。

### 4.2 最小拟改动清单（全部在本角色 boundary.yaml Section 1 内）

| 文件 | 拟改 | 对应项 |
| --- | --- | --- |
| `src/common/pi-adapter/lifecycle.ts` | `observe()`：新增截断识别——`record.stopReason === "length"` 时置 `lastStopReason=length`（`begin()` 归零），并对每轮**首次**截断发一条系统消息（见下文案）+ 诊断记录；`finish()` 的 settled detail 追加 `truncation:"length"`（仅当末条 assistant 消息为截断时）；新增只读谓词 `wasTruncated()` 供收尾补发判据 | F-3-b / F-3-a 判据 |
| `src/common/pi-adapter/real-adapter.ts` | ①`makeRolePrompt`：首个 `session.prompt` 正常返回后，若 `wasTruncated()` 且未交报告且开关开启 → 以独立 `withPausableTimeout` 段补发一次收尾提示（严格 ≤1 次/轮；消息文案与超时见 4.3）；补发为 best-effort，失败不把已完成的轮次改判，只如实外推 + 有界清理。②`bindRole`：构造补发配置（env 开关、`submit_report` 是否在注入工具集中、报告记账），经 `RoleSessionDeps` 传入。③扩展层 `tool_execution_end`（:521-545）跟踪 `submit_report` 成功（`!isError`）并记下当时的 turnId——「对已提交场景不重复」的判据。④（可选，F-9-opt1）`wireSettledOnce` 订阅 `compaction_end`（SDK 公开事件，`agent-session.d.ts:73`）以携带 `result.estimatedTokensAfter` | F-3-a / 去重 / F-9-opt1 |
| `test/pi-adapter/length-followup.test.ts`（新） | 见 §五 | 测试计划 |
| （无其他生产文件） | `src/provider/pi/session.ts` 契约不新增类型（全部为内部接缝；deps 增量字段为可选，缺省=逐字旧行为）；`timeout.ts`、`settings.ts`、`provider-config.ts` 不动 | — |

拟新增的接缝（形状，供评审核对）：
- `lifecycle.ts`：`wasTruncated(): boolean`；settled detail `{turnId, outcome, errorCode?, truncation?: "length"}`（**只增字段**；outcome 枚举不变）。
- `real-adapter.ts`：`RoleSessionDeps` 增可选 `lengthFollowup?: { enabled: boolean; text: string; timeoutMs?: number; wasReportSubmitted: () => boolean }`；缺省不传 ⇒ 行为与今日逐字一致（直接调用方/旧测试无感）。env：`ANS_PI_LENGTH_FOLLOWUP`（`"0"/"false"/"no"/"off"` 显式关闭；**缺省开启**）与可选 `ANS_PI_LENGTH_FOLLOWUP_TIMEOUT_MS`（缺省=该会话 `promptMs`）。

### 4.3 行为变化（逐条）

1. **截断不再沉默（F-3-b）**：`stopReason=length` 的轮次，事件流新增**恰好一条**系统消息（kind 仍是冻结集内的 `message`），拟文案：`「本轮模型输出达到输出上限被截断（stopReason=length)——末条回复不完整，正式报告可能未发出。」`，detail `{turnId, truncation:"length"}`；settled detail 追加 `truncation:"length"`。replay.jsonl、UI 聊天流、诊断日志随之可见（replay 由运行时核心统一持久化既有 SessionEvent，无需改持久化）。summary 文本与 settled 的 `outcome` **不变**（避免牵动 withHandback 的状态映射与 UI 既有文案）。
2. **收尾补发（F-3-a）**：判据＝「开关开启 ∧ 注入工具集中存在 `submit_report` ∧ 末条消息截断 ∧ 本轮无成功 `submit_report` ∧ 本夹具每轮只补发一次」。触发时：先发一条系统消息（拟文案：`「已自动补发一轮收尾提示（因上一轮输出被截断；限一次）。」`），再 `session.prompt(LENGTH_FOLLOWUP_TEXT)`，用**独立的** `withPausableTimeout` 段计时（缺省=promptMs）。拟提示文案：`「【系统】上一轮回复因达到输出上限被截断，可能未完整收尾。若本轮任务已完成或你已确认无法完成，请立即调用 submit_report 交回简短报告（一句话结论＋关键证据）；若任务尚未完成，请直接继续（不要重复已完成的工作）。」`
3. **补发的失败语义**：补发段异常（含超时）只做——如实事件行 + 诊断记录 + 有界 abort 清理（复用既有 `requestAbort` 路径与 900ms 上限）——**不改变** settled 的 outcome 与既有对第一轮的语义；报告仍未交 ⇒ 编排照旧诚实产出 `terminal-fallback/unreported`（诚实降级不变）。若补发轮**再次**截断 ⇒ 不二次补发，settled 记 `truncation:"length"`。
4. **与轮次硬超时**：`src/common/pi-adapter/timeout.ts` 与运行时核心镜像 `src/common/runtime-core/timeout.ts` 均**不改**；补发段有独立上限（≤1 段），首段语义不变；轮次总墙钟仅在最坏情形增加 ≤1 个受限段。abort/超时锁定语义不受影响（`lifecycle.fail` 的 forced 守卫仍先于 observe，`lifecycle.ts:33-41`）——被中止/超时的轮次**不会**触发补发。

### 4.4 fail-honest 边界（不破坏清单，评审核对用）

- **绝不把截断当成功**：`outcome` 语义与 `terminal-fallback` 降级保持原样；补发只能换来一份**模型自己写的真实报告**（origin 变 `submitted-report`），**绝不**由系统把证据合成为报告。
- **绝不重复投递报告**：same-turn 判据（4.3-2）；且既有去重链（`run-role.ts:419-435` 的 `taskReports` 按 turnId、`completedTurns` 关闭轮次；`handback.ts:292-354` 的 `finished` 集 + 每轮单个 settled）不变——补发不新增 settled，也不新增 handback。
- **绝不劣化现状**：补发失败/无报告时，一切如实性与今日完全一致（多出的只有诚实的信息行）。

### 4.5 回交投递 / 终态记录 / 报告去重语义影响（逐项）

- **回交投递**：`withHandback` 只认 `settled`；补发在同一 `RoleSession.prompt()` 调用内、同一 lifecycle.turnId 下发生 ⇒ 仍**恰一个** settled、恰一次回交。补发轮里成功的 `submit_report` 记到**同一 turnId** ⇒ settled 时 `opts.report(turnId)` 取到它 ⇒ `origin=submitted-report`、`status` 取报告值（这正是把 unreported 变回正式报告的路径）。
- **终态记录**：settled detail 增字段（4.3-1），既有消费方（withHandback 读 `outcome/errorCode`；UI 读 summary）不受影响；replay 持久化无需改动。
- **报告去重**：既有语义「同轮重复提交以最后一次为准、轮次关闭后拒收」（`run-role.ts:423-434`）不变；补发的判据在提示层就避免了「已交报告还催交」的多余往返。
- **chat 轮**（无任务轮）：适配器不掌握「本 prompt 是否有任务」的编排态（`PromptOptions` 无此信号；`RuntimeInputProvenanceV1` 仅 handback 一种）。补发文案以「若…任务已完成」的条件句写就，chat 轮最坏成本=一次短往返；且「模型在 chat 轮主动 submit_report 会生成回交」是**今日已有**的行为（`handback.ts:325-333` 仅在无报告时跳过），补发不引入新的语义类别。如客户不接受该成本，可后置为「由编排经 PromptOptions 传 turn 类别」（跨角色，另立任务）。

## 五、测试计划（test/pi-adapter/，全部离线；夹具复用点已核）

新文件 `test/pi-adapter/length-followup.test.ts`（命名随实施走查最终定）：

**A. 生命周期单测（stub，复用 `settled-once.test.ts:40-69` 的 listeners 集 stub 模式与 `runtime-outcome.test.ts:21-37` 的 lifecycle 直调模式）**
1. `observe(length)` → 恰一条截断系统消息 + `wasTruncated()==true`；同轮第二条 length 消息**不**重复发通知；`finish()` 的 settled detail 含 `truncation:"length"` 且 `outcome:"completed"`。
2. `observe(length)` 后 `observe(stop)`（模拟补发成功轮）→ settled detail **不含** `truncation`；通知仅一条。
3. `begin()` 后旧轮标志不残留（新一轮 `wasTruncated()==false`）。
4. 既有回归：`runtime-outcome.test.ts:21-49` 的 outcome 断言逐字不变（length 不影响 failed/aborted/timed_out 映射）。

**B. 提示包装单测（stub 会话，复用 `prompt-images.test.ts:42-76` 的 `PromptCapableSession` 桩件模式 + `runtime-outcome.test.ts:43` 的 subscribe/emit 接线）**
stub：`prompt(text)` 第 1 次调用后触发 `message_end(assistant{stopReason:"length",content:[thinking]})` + `agent_settled` 再 resolve；第 2 次调用记录 text 并触发 `message_end(stop)` + `agent_settled`。断言：
1. 开关开 + 未交报告 → `prompt` 恰被调 **2** 次，第 2 次文本=拟文案常量；settled 恰 1 条；事件流含两条新增系统行（截断 + 已补发）。
2. `enabled:false`（等价 env 关闭）→ 恰 1 次；无补发行。
3. `wasReportSubmitted()==true` → 恰 1 次（对已提交场景不重复）。
4. 补发轮**再次** length → 仍恰 2 次（限次=1），settled 含 `truncation`。
5. 第一轮 prompt reject（模拟 API 错误）→ 无补发；既有 catch/fail 语义断言不变（对照 `runtime-outcome.test.ts:53-59`）。
6. 补发轮 reject/超时 → settled 仍恰 1 条、无重复终态；补发失败系统行在场；`requestAbort` 被调用（spy）且不抛。
7. `lifecycle.fail("aborted")` 后（中止轮）→ 无补发（forced 守卫）。
8. 缺省不传 `lengthFollowup`（旧直接调用方）→ 行为与旧断言逐字一致（防回归）。

**C. 真实 SDK 端到端（离线 faux，复用 `settled-once.test.ts:87-176` 与 `runtime-outcome.test.ts:100-131` 的 faux 引导）**
- `settingsManager = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } })`（关 SDK 自身恢复，隔离被测行为；已核 `runtime-outcome.test.ts:113` 先例）。
- `faux.setResponses([ fauxAssistantMessage([fauxThinking("The")], { stopReason: "length" }), fauxAssistantMessage([fauxToolCall("submit_report", { status: "completed", summary: "fixture" })]), fauxAssistantMessage("done") ])`（`fauxThinking`/`stopReason:"length"` 均已在 `providers/faux.d.ts` 核实可用）。
- 断言（开关开）：`submit_report` 的注入 `reportHandback` spy 恰被调 1 次、metadata.turnId==settled 的 turnId；settled 恰 1 条；模型请求数恰 +1（补发轮）。
- 断言（开关关）：report spy 0 次、恰 1 条 settled 且 detail 含 `truncation:"length"`、事件流含截断系统行。
- 注明：**「unreported→submitted-report 的终态报告换算」**属编排语义，其端到端断言归编排/跨角色验收（本角色不导入 `src/common/编排/` 私有模块做测试；语义依据见 §4.5 的 read-only 定位）。

**D. 关于假适配器**（`createFakeRuntimeAdapter`）：本提案**不**给假适配器加截断模拟——它的 prompt 是脚本回放、无法表达「模型消息 stopReason」，硬加会造出第二份行为实现；B/C 两层（stub + faux）已覆盖全部新行为。若 PM 认为需要更高层的无模型端到端，建议走 C 的 faux 链而非扩假适配器。

命令（实施轮用，沿用本仓惯例带引号 glob）：`node --test "test/pi-adapter/*.test.ts"`、`npm run typecheck`、`git diff --check`。已知基线：全量固定 2 红（检出目录名 ans-cli 断言、macOS /var 符号链接），非本次回归。

## 六、跨角色影响（只读定位，本提案不改）

| 侧 | 只读定位 | 影响判断 |
| --- | --- | --- |
| 运行时核心 | `src/provider/runtime/schema.ts:108-149`（`submit_report` 单一来源）；`src/provider/runtime/tools.ts:295`（1 MiB 输出上限）；`src/common/runtime-core/timeout.ts`（镜像，只读参考） | F-3-a/b 不需要核心改任何文件；F-3-c（提示词）与 F-9-opt2（结果尺寸）如需实施归核心，另派 |
| 编排 | `src/common/编排/handback.ts:126-140/292-369`、`src/pipeline/orchestration/run-role.ts:419-435/682` | 语义兼容（§4.5）；可选 **F-3-d**（跨角色）：terminal-fallback 的 summary 里附「（截断：stopReason=length）」供 su 直读，成本=一行级改动，是否做由 PM 定 |
| 桌面窗口/桌面UI | — | 无需改动：截断行走既有 `message` 事件渲染；若要特殊样式另立任务 |
| Claude适配器 / Codex适配器 | `src/provider/claude/session.ts:317-341`、`src/provider/codex/session.ts:447-457/515-518` 各自维护 outcome 映射 | **同构评估建议**：两适配器目前没有「截断未交报告」的任何处理；各自运行时是否 surfaced 等价信号（如 Claude 的 max_tokens 停、Codex 的对应态）本层未核实。建议 PM 各立一条「同构评估」任务，由两角色查证后再决定是否同修——**不建议**现在由本角色代改（不越界、证据不足） |
| 测试角色证据 | `…kanban-live-real-project-evidence/` | 全程只读，未改 |

## 七、风险与回滚

- **风险 1（补发成本）**：截断轮多一次模型往返（真实 token 成本、墙钟 ≤1 个受限段）。缓解：限 1 次/轮、`ANS_PI_LENGTH_FOLLOWUP` 可即时关闭。**需客户裁定**：是否接受「缺省开启」（本提案主张开启：此修复的收益场景恰是无人值守时；备选=缺省关闭由算子显式打开）。
- **风险 2（补发措辞被模型误用）**：文案已显式「不要重复已完成的工作」；最坏结果是模型重述结论——不产生错误状态，报告仍须经 `submit_report` 与既有校验（`normalizeTaskReport`，`handback.ts:147-160`，非法报告被忽略、退回 unreported）。
- **风险 3（事件新增字段/文案扰动消费方）**：全部为**追加**（字段忽略安全；新行只在罕见截断时出现）；已核对 log-noise 断言集不含截断相关行。
- **风险 4（去重退化）**：不新增 settled/handback 发射点（settled 唯一发射点的纪律见 `real-adapter.ts:394-427` 的历史注释）；same-turn 判据防止重复催交。
- **风险 5（F-9-opt1 改动压缩事件源）**：可选项，若不放心可先行只保留消息行（不动压缩事件结构）。
- **回滚**：生产改动集中 2 个文件（lifecycle/real-adapter）均为纯追加与可选注入；回滚=单批 revert；`ANS_PI_LENGTH_FOLLOWUP=0` 可仅关补发而保留透明性改进。回滚不涉及数据迁移（native/replay 格式不变）。

## 八、可选加固项（F-9，全部不实施，仅编号与成本）

- **F-9-opt1 压缩前后估算可见化**（本角色，成本小）：`wireSettledOnce` 订阅 `compaction_end` 事件（公开面）把 `result.tokensBefore/estimatedTokensAfter` 带进事件 detail（现只有 tokensBefore）。收益：下次「压了等于没压」一眼可见；风险：事件结构小改+测试。
- **F-9-opt2 工具结果尺寸与窗口联动**（运行时核心，成本中，需设计评审）：`MAX_SHELL_OUTPUT_BYTES=1MiB`（≈26 万估算 tokens）单条即可占配置窗口 ~68%；可评估「按配置窗口比例限幅/超限替换为摘要+提示」等方案。收益：直接消除本次 threshold 压缩被单条结果顶穿的放大器；风险：证据完整性 vs 上下文预算的取舍，属产品口径。
- **F-9-opt3 估算口径对齐**（SDK 侧，仅观察）：chars/4 对 CJK 欠计、估算≠API 计费口径；ANS 侧无直接修法，可维持「窗口宁可设小」的既有策略（`provider-config.ts` 论证），并在 opt1 可见化后用真实数据定期校验配置值。成本：无代码，靠运维约定。
- **F-9-opt4（观察结论性建议）**：不把 13:52 的第二次压缩当独立缺陷修——它是 SDK 对 F-3 截断的恢复动作且成功；F-3-a 落地后，「截断→补发」的成功路径（第二轮已实证）会更早接管，overflow 频次问题的主要部分随 F-3 消解。剩余「threshold 压缩有效性」问题按 opt1/opt2 观察与评估。

## 九、实施前置与依赖

- 待客户批准本提案（含「缺省开启」裁定）后由 PM 派实施；实施轮的最小写集见 §4.2，验证见 §五，完成后以真实的「截断→补发→报告到达」无模型证据 + 真机复跑证据回填本文（状态改为 verified 时另开 `## 实施与真实验证` 节）。
- 本文所有行号以 HEAD `e3c0100` 为准；实施时如行号漂移按函数名定位。
