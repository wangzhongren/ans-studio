---
id: codex-reasoning-effort-change
type: change
title: G-5 wave 2（Codex）：推理强度接线（四档 -c / off 零注入如实行）＋推理事件面＋降级链（恰一次去参数重发）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-reasoning-surface-probe, codex-mcp-whitelist-change]
---

# G-5 wave 2（Codex）：推理强度接线 + 推理事件面 + 降级链

依据：客户 2026-10-16 批准的 G-5（推理与推理强度）与 PM wave-2 派发；请求面冻结映射＝`src/model/runtime.ts` `reasoningEffort` 字段注释；形状事实＝本角色探针 [probe_reasoning-surface](2026-10-16-probe_reasoning-surface.md)（A3/A4＋拒绝面/覆盖语义逐项定格，本批按其落地）。契约（`ReasoningEffortV1`/`RuntimeReasoningFactsV1`/`RuntimeReasoningEventDetailV1` 等）由运行时核心已落盘；Service 已做投影单点（`projectReasoningDetail`）——本适配器**只产事实**。

## 改动（本角色边界内 5 文件；0 git 提交）

- **`src/common/codex-adapter/config.ts`**（+~30）：
  - `settings()` 增档位校验（`:45`）：`options.reasoningEffort` 越出五值 ⇒ 装配前抛错（纵深防御；Service 已归一，探针实证 config 层对任意串放行）；返回值携 `reasoningEffort`。
  - `reasoningEffortOverride(effort)`（`:68`，新增）：**单一编码来源**——`low/medium/high/xhigh` ⇒ `model_reasoning_effort="<值>"`（顶层标量键独立一条）；**`off`/未设 ⇒ `undefined`（零注入）**。
- **`src/common/codex-adapter/protocol.ts`**（+~12）：`isReasoningParamRejection(message)`（`:150`）：降级链保守识别——`reasoning|effort` 锚与拒绝词锚（`unsupported|not supported|unrecognized|unknown|invalid`）**共现**才识别；空/非串/单锚 ⇒ 不识别（宁少一次重发）。
- **`src/provider/codex/session.ts`**（+~170/-60）：
  - **请求接线**：`connect(disabled, injectReasoning=true)`（`:402-406`）把 `reasoningEffortOverride` 编入进程 `-c`（与既有覆盖同序追加；**去参数重发＝该条缺席、其余逐字不变**）；`reasoningInjected` 会话级判定（`:324`）。
  - **off 如实文案**（`:653-656`）：显式「关」⇒ 零注入＋会话级恰一行：**「Codex 平台无「关」档：未注入推理强度参数（维持平台默认，推理未关闭）」**（`detail {version:1, source:"reasoning-effort", reason:"off-unsupported"}`；不假装关闭）。
  - **推理事件面**（`:560-620`）：通知订阅新增三分支——`item/started`（reasoning ⇒ 记 `startedAtMs`）；`item/reasoning/{summaryPartAdded,summaryTextDelta,textDelta}`（**消费不产行**——完成态先行；仅作降级闸的「已产出内容」证据）；`item/completed` reasoning ⇒ 恰一行事实：`{version:1, source:"reasoning", reasoning:{text, status, durationMs?}}`——text＝`content` 优先、仅摘要取摘要（平台给什么就是什么；v1 单一正文位）、全空＝`status:"omitted"`（如实不假装）；**durationMs 只取真实信号**（`startedAtMs→completedAtMs`，缺一不携带）；summary 位用核心定格常量 `REASONING_EVENT_SUMMARY`（Service 投影单点再强制覆盖）。
  - **降级链**（`:687-690` 闸＋`:742-766` `degradeReasoning`）：闸＝`failed` ∧ 本会话曾注入 ∧ **`!turn.outputSeen`（产出任何内容前）** ∧ 未中止 ∧ 判据命中 ∧ 未降级过；动作＝如实一行（**「本网关不支持所设推理强度，本轮已按默认执行」**）＋诊断（`reasoning.effort.degraded`）＋**恰一次**：关闭引擎 → `connect(foreignServers, false)`（去参数重建）→ 重挂 `nativeToolHandler`/通知订阅 → 重建线程（有 storage 先试续接当前线程，失败或非持久会话＝新线程）→ 目录恰等复核 → 重臂 TurnState → **同一输入**重发；成功后本轮继续（settled completed）。「产出任何内容」证据面＝agentMessage/webSearch/mcpToolCall/reasoning item 或增量、原生工具调用请求。
  - **重构（降级链与会话构造同源）**：抽 `nativeToolHandler`（原内联 handler）、`establishThread`/`subscribeNotifications`/`inspectCatalog` 三段具名助手（会话构造与去参数重发两处共用，不第二份实现）；既有语义逐字保留（含 P0 降级行的订阅提前/去重单点）。
- **`test/codex-adapter/fixtures.ts`**（+~12）：FakeEngine 增 `reasoningItem(item, times)`（item/started+completed 双通知、真实时间戳字段）／`reasoningDelta(method, params)`／`failTurn(message)`（error 通知，A4 拒绝面同形）。
- **`test/codex-adapter/reasoning.test.ts`**（新；7 例）：请求接线（未设零覆盖逐字现状／四档恰一条／off 零注入＋如实行逐字／非法值装配前抛错）；事实映射（content 优先／仅摘要／全空 omitted／无 start 无 durationMs／不隔离）；增量帧零行不误报；判据保守性直测；降级链端到端（重连去参数＋其余覆盖逐字＋同一输入重发＋如实行＋settled 恰一次）；有界与保守四格（重发再拒不再重连／无锚不识别／已产出内容不降级／未注入不降级）。

## 验证（本机 darwin / Node v24.14.0）

- 自有 `node --test test/codex-adapter/*.test.ts` ⇒ **54/54** 绿（P2 后 47＋新 7；0 skip）。
- `npm run typecheck` ⇒ 全仓 0 错。
- 探针（先行）⇒ pinned 0.162.1 **8/8 自检、exit 0**（A3 帧/item 逐字；A4 四档/无效值/覆盖/取消语义；拒绝面＋同线程续跑；外部模型 0）——见探针记录与证据目录。
- 全量 `node --test "test/**/*.test.ts"` ⇒ **2036 计 / 2033 过 / 2 红 / 1 skip**；2 红**均不在本批文件**——`test/测试/g3-search-verify` 审计④（读 `pi-adapter/real-adapter.ts` 的启用判据门文本，Pi 侧在飞改动所致）与 `test/测试/t29-pi-config-roundtrip`（Pi env 夹具键表缺 `ANS_PI_REASONING_EFFORT`，Pi 侧在飞）——两红所读文件与断言面均与 Codex 适配器无交集；本批文件零红（审计④对 `codex/session.ts`/`codex-adapter/config.ts` 的字符串检查全数通过）。

## 未验边界与残余（如实登记）

1. **真实网关**（B3）：reasoning 参数接受面、拒绝文案、reasoning items/summary 回传——本批全 loopback；降级判据按 A4 形状保守匹配，真实文案不合锚 ⇒ 如实失败不降级（宁少一次重发）。
2. **非持久会话（无 storage）降级=新线程**：探针证明 0.162.1 无轻量取消路径（thread config 置 null/空被拒；轮级 effort=null 不生效），去参数只能重建进程；非持久形态下重建进程即换线程——「本轮按默认执行」达成，**跨轮上下文在非持久形态下随进程**（登记；有 storage 走续接尝试，失败自动 recovered）。
3. 降级中途中止 ⇒ 走既有 early-abort quarantine 语义（清 nativeId、不拿死引擎发 interrupt；沿既有纪律）。
4. `model_reasoning_summary` 未接线（v1 不暴露开关）；控制格实测 wire 恒带平台缺省 `summary:"auto"`（现状，非本仓注入）。
5. Windows 未跑；真实网关 429/5xx 与内核重试交互未探。

## 边界声明

只写本角色 Section 1 内文件（`src/provider/codex/session.ts`、`src/common/codex-adapter/**`、`test/codex-adapter/**`、本记录与探针记录/证据/changelog/memo/feature-map）；**未碰**运行时核心/门禁引擎/其他适配器在飞文件；未 git 提交；未发真实模型请求。
