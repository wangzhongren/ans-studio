---
id: pi-server-side-tools-live-probe-results
type: record
title: 服务端工具族 live 探针结果（客户实跑）：网关结论、两轮复放评估（②）与登记项
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: recorded
---

# 服务端工具族 live 探针结果（客户本机实跑，2026-10-16）

**性质**：G-3 客户验证阶段证据（证据目录＝本目录 `docs/fix/`）。由客户在本机实跑本轮实施产物 `test/pi-adapter/server-tools-probe.ts`；由 PM 转达、本角色归档与评估。**本角色未发任何 live 请求**——归档、判定与评估均为离线行为（依据＝转达输出 + 已安装 dist 只读核实）。
**公开仓库纪律**：端点 URL 与 request_id 已隐去（转达原文即已处理完成）；本轮归档再次核对：全文无 URL、无凭据、无查询串正文；模型名保留（`deepseek-v4-flash[1m]`，客户同意保留）。

## 一、原始输出（逐字归档）

```
[probe] .env 读取：.env；应用的键名（不含值）：ANS_PI_BASE_URL, ANS_PI_MODEL, ANS_PI_CONTEXT_WINDOW, ANTHROPIC_AUTH_TOKEN
[probe] ① web_search（web_search_20250305）：status 200；state ok；stopReason end_turn；usageServerTools {web_search_requests:1}；blocks [thinking, server_tool_use(web_search), web_search_tool_result[0], thinking, text]；resultErrors []
[probe] ① web_fetch（web_fetch_20250910）：status 500；errorCategory invalid_request_error；"unknown variant `web_fetch_20250910`, expected `web_search_20250305` or `web_search_20260209`"
[probe] ① code_execution（code_execution_20250825）：status 500；"unknown variant `code_execution_20250825`, expected `web_search_20250305` or `web_search_20260209`"
[probe] ② 两轮复放：round1 status 200 / usage {web_search_requests:3} / blocks [thinking, server_tool_use(web_search), web_search_tool_result[0], thinking, server_tool_use(web_search), server_tool_use(web_search), web_search_tool_result[1], web_search_tool_result[1], text]；strippedTranscriptTextBlocks 0；round2 status 500 "messages.1: all messages must have non-empty content"；verdict「网关拒绝或失败——需评估回填方案 P（提案 §4.5-1）」
[probe] ③ max_uses 上限形状：status 200；usage {web_search_requests:2}；blocks [thinking, server_tool_use, result[0], thinking, server_tool_use, result[1], thinking, text]；resultErrors []
[probe] ④ usage 回传：oneShot web_search {1}；web_fetch null；code_execution null；replayRound1 {3}；replayRound2 null；maxUses {2}
[probe] ⑤ 观察：stopReasons [end_turn,…]；pauseTurnSeen false；「未见即如实记未见」
（模型＝deepseek-v4-flash[1m]；端点已按公开仓库纪律隐去）
```

## 二、网关结论（登记；用途＝配置指引与后续设计判据）

| 项 | 实测结果 | 处置 |
| --- | --- | --- |
| `web_search_20250305` | ✅ 200；`server_tool_use`/`web_search_tool_result` **在服务端真实执行**；`usage.server_tool_use.web_search_requests` 计量 1–3 次/轮 | 注册表现值（`web_search_20250305`）即本网关可用变体；产品声明路径全链已验证 |
| `web_fetch_20250910` | ✗ 500 `unknown variant web_fetch_20250910, expected web_search_20250305 or web_search_20260209` | **配置指引：本网关 `ANS_PI_SERVER_TOOLS` 只应启用 `web_search`**；配 `web_fetch` 会 500 → 触发我们的会话级声明降级（路径 C 行为正确，但该工具在本网关不可用）。注册表**暂保留** web_fetch（其他网关可能支持；type 串以 Anthropic 官方值 `web_fetch_20250910` 为准），本网关不支持为**已知事实**（此前登记的「未验边界」就此结清为「本网关不支持」） |
| `code_execution_20250825` | ✗ 500 unknown variant | 维持「缓」**不解缓**（批准口径 ② 维持） |
| `web_search_20260209` | 网关错误文案列出其支持（较新变体） | **仅登记观察，不加**（客户口径；注册表不动） |
| `max_uses` | 声明 `max_uses:1` 后仍见 2–3 次搜索请求、未见上限类错误码（`resultErrors []`，见 ②/③ 两次实测） | 如实记「**上限未见强制**」：`max_uses` 声明在本网关不构成成本护栏；按次计费的实际次数以 `usage.server_tool_use` 计量透出为准（既有计量路径不变） |
| `pause_turn` | 未见 | 如实记「未见」（该项属可选观察；观察面不变） |

## 三、②两轮复放评估（round2 被 500 拒：`messages.1: all messages must have non-empty content`）

**判定：这是探针构造产物（高置信）；「空内容助手消息被网关拒」不是真实二次轮风险的主形态。**真实残留风险另有一项（相邻 user 消息，见下），属「未验证」而非「已验证拒绝」。

理由（双向钉死）：

1. **探针侧构造偏差（两处，均在本轮探针脚本 `test/pi-adapter/server-tools-probe.ts` 内）**：
   - **文本捕获偏差**：脚本对「start 空文本 + `text_delta` 增量」的标准流式文本**未捕获**——`:124` 仅在 start 携带非空 `text` 时入缓冲；`:128-129` 仅在缓冲已非空时追加 delta ⇒ 流式文本全丢。证据自证：round1 blocks 列表**含 `text` 块**而 `strippedTranscriptTextBlocks=0`，恰为该偏差的特征（网关以 delta 流式送文本）。
   - **回放构造偏差**：脚本把空捕获结果直接组装为 `{role:"assistant", content:[]}` 发出；而**真实链路不会把空内容助手消息发上 wire**——pi-ai `convertMessages` 对「转换后空内容」的助手消息**整条跳过**（已安装 dist：`pi-ai/dist/api/anthropic-messages.js:1145-1146` `if (blocks.length === 0) continue;`；user 分支同理 :1080-1081）。即：该 500 的请求形态在真实链路中**不可构造**。
2. **真实链路的剥离形态**：服务端工具块被 pi-ai 归一化层丢弃后，回放中的助手内容只含 text/thinking 的转换结果（`convertMessages` 逐块转换：text 非空才回放、thinking 有签名回放 thinking / 无签名转 text / 全空跳过）。空内容的真实后果＝**该助手消息被整条省略**，而非发送空串消息。round1 实测含 thinking 块（该模型逐轮有 thinking）⇒ 真实二次轮的助手消息非空（thinking+text）。
3. 因此**网关对「剥离转录」本身的接受度仍未获证**：本次 500 发生在更早的格式校验（消息非空），未触及转录内容接受度——这是「**未验证**」，不是「已验证拒绝」。

**修复探针后的补验即可判定**（见四.1）：修复后 round2 将携带非空助手内容（text±thinking），若 200 ⇒ 剥离转录可接受、方案 P 无需启动；若仍 500/400 ⇒ 真实风险成立、启动方案 P 评估。

**残留真实风险（登记）**：**相邻 user 消息**——当某轮助手内容剥离后为**空**（无 text/thinking；如实况可能出现：紧随 `server_tool_use` 的 pause_turn 提前收尾、或非 thinking 模型只回了工具块），真实链路会**整条省略**该助手消息 ⇒ 两条 user 消息相邻。网关是否接受相邻同角色消息**未验证**（补验用例：`[user1, user2]` 两连发，纳入修复后的 §② 一轮）。

**方案 P（提案 §4.5-1 回填）条件性评估（只评估、不实施；本轮不启动）**：

- **触发条件**：修复探针后补验仍显示网关拒绝剥离转录（格式校验通过而转录仍被拒）。
- 若触发，适用性/改动面初评：
  1. **落点仍在边界内**：`before_provider_request` handler 已有（`real-adapter.ts`），可在同一处对 `payload.messages` 做回填；无需新通道。
  2. **内存缓存面（关键风险）**：回填需把 `server_tool_use` 输入与 `*_tool_result`（**含 encrypted_content 与结果全量**）按响应配对**缓存到会话内存**并在回放时写回——这突破当前「encrypted_content 一律不进内存捕获与任何落盘」（提案 §2.2 口径），是新的风险面，**须客户裁定 + 白名单复审**；回填内容仍不得进任何落盘/诊断/replay 行。
  3. **配对身份问题**：payload.messages 中回放的 assistant 消息**不带 responseId**（回放时身份已丢）⇒ 只能**按序配对**（第 n 条 assistant ↔ 第 n 组缓存块）。与自动压缩/branch 摘要**互斥**——压缩重写历史会破坏按序配准，失配回填会产生**更糟的持续 4xx/5xx**；必须以「转录长度/摘要指纹变化即停用回填、回退剥离形态 + 如实告知」兜底，并用 loopback 桩钉死。
  4. **官方语义参照（支持「大概率无需 P」的方向）**：Anthropic 服务器工具的多轮交互官方要求**把原始块原样回传**（pause_turn resubmit 场景）——网关若严格实现该语义，剥离转录大概率可被接受；故方案 P 应等补验结论，**先不设计完成**。

## 四、后续动作建议（供 PM 路由）

1. **探针修复（建议下一轮派发，本角色）**：`test/pi-adapter/server-tools-probe.ts` 两处差：
   - 文本捕获改为**按 index 关联**（start 一律登记缓冲、delta 按 index 追加到对应块）——消除 `strippedTranscriptTextBlocks` 恒 0 的偏差；
   - 回放构造按 pi-ai 语义**省略空内容助手消息**（并加一个带 thinking 的复放变体，以及「相邻 user 消息」分离用例）。
   （本轮按指令「只写 docs 面」**未改代码**——修复属下一轮。）
2. **修复后客户补跑 §②** → 结论回填本文件（判「网关接受剥离转录」/「启动方案 P」；同时给相邻 user 消息答案）。
3. **配置指引（客户/装配/桌面配置面）**：本网关 `ANS_PI_SERVER_TOOLS` **只应设 `web_search`**（如 `web_search` 或 `web_search:3`）；**不要配 `web_fetch`**（500 → 会话级声明降级）；同机 `.env` 若已配 web_fetch 应移除。`max_uses` 可声明但本网关未见强制——将其理解为「请求意图」而非护栏。
4. **登记观察（不加代码）**：网关支持 `web_search_20260209`（仅登记）；`max_uses` 未见强制；`pause_turn` 未见。

## 五、归档自检

- 全文无端点 URL、无 request_id、无凭据值、无搜索查询串/结果正文（公开仓库纪律）；
- 本文件为归档＋评估记录，未改任何 src/test 代码（本轮约束「只写 docs 面」）；
- 与实施记录的关系：本文件是提案 `docs/fix/2026-10-16_proposal_server-side-tools.md` 实施记录「未验边界」第 1/2/3 项的**第一批验证结果**（web_fetch ✗ 已结清、两轮复放＝探针产物待补验、code_execution 缓维持）。
