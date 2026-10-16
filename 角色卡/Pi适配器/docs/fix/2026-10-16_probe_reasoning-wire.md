---
id: pi-probe-reasoning-wire
type: probe
title: G-5 A5/A6/A7 探针（Pi 侧）——setThinkingLevel 全档 wire／R1 非法组合定格与修复／thinking 丢弃复证／400 降级前置事实
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: probe-complete
related: [pi-role-mcp-install-p3, role-reasoning-effort]
---

# G-5 A5/A6/A7 探针（Pi 侧）——逐项定格（客户 2026-10-16 批准 G-5；"先探针、后接线"）

**状态：探针完成，结论已驱动同批实施。** 依据＝运行时核心评估 `角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md` §七 A5/A6、§八 R1。本轮**纯本地**：假网关＝`127.0.0.1` loopback anthropic-messages（捕获真实 wire 请求体与头）；**零外网出口、零真实网关请求**。记录＝本文；证据＝`docs/fix/2026-10-16_probe_reasoning-wire-evidence/`；探针脚本 `test/pi-adapter/reasoning-wire.probe.ts`（scratch，非测试；测试文件不引用探针——沿测试角色钉）。

**探针先行顺序如实登记**：首轮于接线前运行（捕获"修复前"事实）；off 前置修复与 R1 修复落盘后复跑（捕获"修复后"）；两轮事实均在本文登记。

## A5：setThinkingLevel 全档 wire 捕获

**先—后对照**（大 contextWindow＝131072；budget 为 `thinking.budget_tokens`）：

| 档位 | 修复前 effective | 修复后 effective | 修复后 wire | beta 头 |
|---|---|---|---|---|
| 未设（对照） | medium | medium | `{type:"enabled", budget:8192, display:"summarized"}` | `interleaved-thinking-2025-05-14` |
| off | **minimal（钳制＝假关闭，R6 实锤）** | **off** | **`{type:"disabled"}`** | **无** |
| low | low | low | `{enabled, 2048}` | 有 |
| medium | medium | medium | `{enabled, 8192}` | 有 |
| high | high | high | `{enabled, 16384}` | 有 |
| xhigh | xhigh | xhigh | `{enabled, 16384}`（`clampReasoning` 钳 budget，档位语义保留） | 有 |
| minimal／max（非中立档，仅探针） | minimal／max | 同 | `{enabled, 1024}`／`{enabled, 16384}` | 有 |

- 修复前 off：`setThinkingLevel("off")` 被 `clampThinkingLevel` 钳到 minimal（模板 `thinkingLevelMap.off=null` ⇒ `getSupportedThinkingLevels` 视 off 不可用）——**wire 实测 `enabled + budget 1024`＝假关闭**（R6 实锤）。修复（克隆时 `off:null→undefined`）后：effective=off、wire `{type:"disabled"}`、**interleaved beta 头随之消失**（该头仅在 thinkingEnabled 时附加，`anthropic-messages.js:844-847`）。
- **max_tokens 联动**：带思考时 `max_tokens = min(clamp(窗口), base+budget)` 形态实测 ≥ 预算+1024（大窗口下合法）；`display:"summarized"` 恒在。
- 未设对照 wire 与"现状 medium 隐式"逐字一致（**未设＝不调用**口径的可观测面）。

## R1：`budget ≥ max_tokens` 非法组合——**实锤可达（两种非法形）**

边界组（修复前捕获；自证判定按 API 规则 `1024 ≤ budget < max_tokens`）：

| contextWindow | wire（实测） | 判定 |
|---|---|---|
| 5000 | `thinking{enabled, budget=1024}` ＋ `max_tokens=854` | **非法：budget(1024) ≥ max_tokens(854)**（＝协调函点名形态） |
| 5700 | `thinking{enabled, budget=530}` ＋ `max_tokens=1554` | **非法：budget(530) < 1024（API 下限）**（本轮新发现的第二非法形） |
| 6200 | `thinking{enabled, budget=1030}` ＋ `max_tokens=2054` | 合法（1030 < 2054） |

机制（dist 只读＋实测吻合）：`simple-options.js:63-80` 把预算钳到 `max(0, max_tokens−1024)`；`anthropic-messages.js:745` 再钳一次；**渲染侧 `budget_tokens: options.thinkingBudgetTokens || 1024`（:962）**——预算算出 0 被 `||` 回落到 1024 ⇒ `max_tokens ≤ 1024` 时不合法；`max_tokens ∈ (1024, 2048)` 时钳出 `(0,1024)` 的子下限值同样非法。常规运行下压缩阈值（reserveTokens 16384）使该窗不可达；**小 contextWindow 配置（如 5–6K）或上下文未压缩即近满时可达**（且默认 medium 隐式路径同样带思考 ⇒ 修复前该窗对"未设"会话同样适用）。

**最小修复（同批实施）**：`ans-reasoning` 扩展在 `before_provider_request` 逐请求修复（仅装 `reasoningEffort` 时装配）——enabled 形态且不满足 `1024 ≤ budget < max_tokens` 时：`max_tokens > 1024` ⇒ 预算钳入 `[1024, max_tokens−1]`（诊断 `reasoning.repaired{state:"budget-clamped"}`）；`max_tokens ≤ 1024`（**无任何合法 enabled 组合**）⇒ 改 `{type:"disabled"}`（诊断 `state:"thinking-disabled"`）。测试内含**自证网关**（非法组合必 400）：修复后 cw=5000/5700 均放行、轮次正常完成。如实边界：修复仅覆盖"设档"会话（未设＝逐字现状的硬口径；未设路径的同一潜在窗如实登记，PM 可一行扩展）。

## A6：thinking 块丢弃复证 ＋ durationMs 信号可达性

- loopback SSE 送 `thinking` 块＋text 块 ⇒ 当前事件面：**思考正文（`PROBE-THOUGHT-SECRET-42`）零出现**（`extractMessageText` 只收 `type==="text"`——复证成立）；正文文本行照旧。事件面仅 `[message(text), settled]`。
- **part 事件可达（新证据）**：原生订阅实测 `message_update` 6 次，`assistantMessageEvent` 分量：`thinking_start/delta/end`、`text_start/delta/end` 各 1 ⇒ **真实起止信号存在 ⇒ durationMs 可由 part 事件起止实测**（瞬时回环测得 0ms 亦为真事实，不当"无信号"丢弃；无 part 信号则不携带）。据此实施捕获：`message_end` 产 `{version:1, source:"reasoning", reasoning:{text,status,durationMs?}}`（redacted 块 ⇒ `status:"omitted"`、正文空串；正文提取行为不变、思考行先于文本行）。

## A7：网关因思考参数 400 后的行为（降级设计前置事实）

假网关对含 `thinking` 的请求回 400（JSON 错误体）⇒ 实测：**恰 1 次请求**（SDK 不重试 400）；`prompt()` **正常 resolve**（不抛）；事件面如实 failed 终态（`denied「本轮模型运行失败」`＋`settled「本轮运行失败」outcome=failed`，**失败终态在 prompt 返回后由 lifecycle.finish 发射**）。⇒ 降级设计据实落地：检测在扩展 `message_end`（保守判据，置位恰一次）→ **prompt 包装层在终态发射前**消费（`consumeRetry`）→ `suppress` 先于重发 → 同文本直调底层 `session.prompt` 重发（不递归包装、settled 仍单点）；重发再失败即走既有失败路径（不二次）。测试实证：成功重发（恰 2 请求/一行/一诊断、后续轮次不再附带）与"重发仍失败"（2 请求→failed、次轮 1 请求不再重发）双形态，及未设会话**零降级**对照。

## 未定格与边界（如实）

1. **真网关对 `thinking:{type:"disabled"}` 与 interleaved beta 头的接受面**＝B1 系列真网关探针（本轮禁网关请求）；off 修复的 wire 语义在协议面成立，接受性未证。
2. adaptive 方向（`forceAdaptiveThinking` 翻旗）未动（评估 B1/B4 待真网关裁决）。
3. `reasoning.repaired` 为诊断面静默修复（无用户行）——紧窗边缘的如实性登记于实施记录。
4. durationMs 为 part 事件观测墙钟（真实起止信号）；平台若不给 part 事件则不携带（本仓 anthropic-messages 路径实测恒有）。

## 证据与复现

- `node test/pi-adapter/reasoning-wire.probe.ts <OUTDIR>`（纯本地；loopback）。本轮：`docs/fix/2026-10-16_probe_reasoning-wire-evidence/`（`driver-output.txt` 全文；`reasoning-wire-result.json` 结构化捕获——修复后）。
- 关键 dist 引用：`pi-ai/dist/{models.js:678-708, api/simple-options.js:5-80, api/anthropic-messages.js:686-746/844-847/928-968}`；`pi-agent-core/dist/{types.d.ts:300, agent-loop.js:100-137}`；`pi-coding-agent/dist/core/agent-session.js:2052-2075`。

（本文状态：探针完成、结论已实施；同批实施记录见 `docs/change/2026-10-16_change_reasoning-effort-pi.md`。未 git 提交。）
