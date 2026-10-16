---
id: codex-reasoning-surface-probe
type: change
title: Codex 面推理探针（G-5 wave 2 前置）：A3 事件帧 + A4 请求链 + 拒绝面/覆盖语义定格
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: probe-complete
related: [codex-mcp-surface-probe, codex-mcp-whitelist-change]
---

# Codex 面推理探针：A3/A4＋拒绝面/覆盖语义（离线；沿假引擎先例）

对上：运行时核心评估 §七 探针清单 A3/A4（`角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md`）＋G-5 wave 2 Codex 派发（「先探针、后接线」）。**手段**：固定 codex 0.162.1 真 app-server 进程＋本地 loopback 假 Responses SSE 端点（沿 G-3/P0 先例）；**外部模型调用 0、凭据全假**；schema 事实沿用 P0 证据目录的 `generate-ts` 产物。证据＝`docs/change/2026-10-16-reasoning-surface-evidence/`（probe 8/8 自检过、exit 0；raw.json 全量逐字）。

## A3：假 SSE 注入 reasoning item + 增量帧

**结论：通知方法与 item 形状全部定格；增量帧消费但不产行（完成态先行）。**

- **假 SSE 注入帧**（标准 Responses 帧名，0.162.1 全数识别）：`response.output_item.added`（`{type:"reasoning",id,summary:[],content:[]}`）→ `response.reasoning_summary_part.added`（×2 段）→ `response.reasoning_summary_text.delta`（×2）→ `response.reasoning_text.delta` → `response.output_item.done`（完成态 item）→ message → `response.completed`。
- **app-server 产出的通知逐字**（`ServerNotification` 三方法名全部命中）：
  - `item/started`：信封 `{item:{type:"reasoning",id,summary:[],content:[]}, threadId, turnId, startedAtMs}`；
  - `item/reasoning/summaryPartAdded`：`{threadId, turnId, itemId, summaryIndex}`；
  - `item/reasoning/summaryTextDelta`：`{threadId, turnId, itemId, delta, summaryIndex}`；
  - `item/reasoning/textDelta`：`{threadId, turnId, itemId, delta, contentIndex}`；
  - `item/completed`：信封 `{item:{type:"reasoning", id, summary:[string…], content:[string…]}, threadId, turnId, completedAtMs}`——**item 的 summary/content 为字符串数组**（完成态聚合；增量经 delta 帧给）。
- **durationMs 真实信号**：`item/started.startedAtMs` → `item/completed.completedAtMs`（两字段均实测存在；缺一不携带）。
- **回归钉注记**：接线前适配器对上述全数静默（无分支）；接线后＝完成态 item 映射恰一行事实、增量帧零行（tests: `reasoning.test.ts`「delta frames … never mis-mapped」）。

## A4：`-c model_reasoning_effort` 全链

**结论：四档映射与上游落点定格；无效值 config 层放行、上游原样携带（本仓因此前置校验）；控制格「未设」在 wire 面仍带平台缺省 `summary:"auto"`（现状，非本仓注入）。**

| 格 | config/read 回读 | 上游请求体 `reasoning` |
| --- | --- | --- |
| 未设（控制） | `null` | `{"summary":"auto"}`（**无 `effort` 键**——平台缺省 summary，随现状） |
| `-c …="high"` | `"high"` | `{"effort":"high","summary":"auto"}` |
| `-c …="bogus"` | `"bogus"`（原样） | `{"effort":"bogus","summary":"auto"}`（**原样上游**——config 层不拦，拒绝与否归网关/请求期） |
| 线程 config `model_reasoning_effort:"low"`（进程 high） | — | `{"effort":"low",…}`（**线程覆盖进程**） |
| 轮级 `turn/start.effort:"low"`（进程 high） | — | `{"effort":"low",…}`（**轮级覆盖**，且后续轮沿用） |

- 未设＝零参数的含义＝**ANS 不注入任何 `-c`**（逐字现状）；wire 面 `summary:"auto"` 为 0.162.1 平台缺省，任何姿态都带、与本功能无关（如实记录）。
- 无效值形态：请求期由上游裁决（本地假端点全接受 ⇒ 轮次照常 completed）；**本仓须前置白名单校验**（已接线至 `settings()`，越界装配前抛错）。
- **取消语义（降级链设计输入）**：`thread/start config model_reasoning_effort: null` 与 `""` **被拒**（`rpc error: reasoning_effort must not be empty in model_reasoning_effort`）；轮级 `effort: null` **不生效**（上游仍 high）。⇒ 0.162.1 **无轻量「去参数」路径**，降级重发必须重建进程（`-c` 缺席）。

## 拒绝面（降级链锚点；A4 延伸格）

**结论：上游 400 逐字进入 error 通知与 turn 错误；app-server 不自动重试；同线程失败后可续跑。**

- 假端点对携带 `reasoning` 的首请求回 `400 {"error":{"message":"Unsupported parameter: reasoning","type":"invalid_request_error","param":"reasoning"}}` 后：
  - `error` 通知：`{error:{message:"<上游体 JSON 逐字>", codexErrorInfo:"other", …}, willRetry:false, threadId, turnId}`；
  - `turn/completed`：`turn.status:"failed"`＋`turn.error.message` 同逐字文本；线程状态转 `systemError`；
  - **无内核重试**（1 次拒绝 ↔ 1 次 HTTP 请求）；该轮零 item（`items:[]`）。
  - 同线程**可续跑**：切回接受模式后第二次 `turn/start` 照常 `completed`（先失败不毁线程）。
- ⇒ 降级链判据（接线采用，保守）：`reasoning|effort` 锚 ＋ 拒绝词锚（`unsupported|not supported|unrecognized|unknown|invalid`）**共现**才识别（`isReasoningParamRejection`）；未命中＝不重发（宁少一次）。真实网关文案（B3）未验，措辞不合锚 ⇒ 如实失败不降级。

## 未定格 / 未验边界

1. **真实网关**（B3）：reasoning 参数接受面、拒绝文案、reasoning items/summary 回传面——需客户真网关（本批全 loopback）。
2. `model_reasoning_summary` 开关与 `summary:"auto"` 的真实回传关系（摘要默认 auto 已实测下发；回传内容依赖网关）。
3. Windows 未跑；嵌套/多段 reasoning item 的边界（本批单 item、两段摘要）。
4. 上游 429/5xx 下 app-server 自身重试与降级链的交互（本批只探 400）。

## 证据清单

- 探针：`reasoning-surface.probe.mjs`（9 格：R0 控制、R1 A3、R2/R3 A4、R4 拒绝面+续跑、R5/R6 覆盖、R7 取消语义三格）；复跑 `node 角色卡/Codex适配器/docs/change/2026-10-16-reasoning-surface-evidence/reasoning-surface.probe.mjs`（cwd＝仓库根；需 pinned `@openai/codex@0.162.1`）。
- 原始输出：`reasoning-surface.raw.json`（8/8 自检、exit 0、`externalModelCalls: 0`）＋ `reasoning-surface.stderr.txt`（恒空）。
- schema 摘录：`schema/`（三个增量通知 + `TurnStartParams` + `ReasoningSummary`，源自同版本 `generate-ts`）。
- 哈希清单：`manifest.json`。

（本记录状态：**探针完成 / 接线见同批 change 记录 / 未提交**。全部结论可按证据目录独立复跑。）
