---
id: desktopui-reasoning-display-fix
type: change
title: 思考行显示修复——读到投影正文、按回合归并、平台省略如实说明
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-unverified
related: [reasoning-display-fix, ans-reasoning-effort-lightweight-repairs]
events:
  - date: "2026-10-22"
    kind: created
    summary: 按客户确认的设计 R1–R5 实施桌面UI侧修复；O1–O7 未授权未纳入
  - date: "2026-10-22"
    kind: implemented
    summary: 渲染映射/文案/回合归并/省略与坏件呈现完成；单测、Electron 离线 e2e 与 typecheck 已跑，真机重建验证待下一构建
---

# 思考行显示修复——读到投影正文、按回合归并、平台省略如实说明

以前在桌面上展开「已思考」只看到「已思考」本身：渲染层读的是 `detail.text`，而运行时核心早已把正文投影到 `detail.reasoning.text.text`，于是回落到了摘要；同一回合的多条思考也各占一行，甚至跑到「会话结束」之后。现在正文能正常显示；同一回合只保留一个折叠行，带真实时长；平台省略正文时明确写「平台省略了思考正文」，不拿空白或摘要冒充内容。

设计依据：[PM 设计 §R1–R5](../../../项目管理/docs/design/2026-10-22_design_reasoning-display-fix.md)（客户 2026-10-22 确认 R1–R5；O1–O7 未授权）。本记录只写本次实际改动、验证与未验证项，不重复设计全文。

## 改在哪里（位置 → 改动）

| 位置 | 改动 |
| --- | --- |
| `app/renderer/src/chat/reasoning.ts`（新增） | 推理行纯逻辑单一来源：投影载体提取（`reasoning.text` 不是 `{text: string}` 结构即 fail-closed）、R2 文案函数与固定说明常量、piece 指纹、按到达序合并（status/正文/时长/部分省略）、确定性插入位置；不依赖 DOM/store |
| `app/renderer/src/chat/events.ts` | `describeEvent` 的 `source==="reasoning"` 分支改读投影形 `detail.reasoning`（`text.text`/`status`/`durationMs`），不再读 `detail.text`、不再用 summary 当正文；坏件落诊断系统行「推理内容无法安全显示」；`turnId` 缺省回退 `detail.turnId`；`historyRowToDescriptor` 消费回放行的 `row.reasoning`，与实时同一提取器；缺失载体保持 assistant 文本行回落，坏载体落诊断行 |
| `app/renderer/src/chat/replay.ts` | `classifyLiveDuplicate` 对 `detail.source==="reasoning"` 豁免，不再用 `turnId+summary` 吞掉同回合后续 piece；幂等交给合并层 piece 指纹；其他事件类型判定不变 |
| `app/renderer/src/chat/chat-store.ts` | 新增 `appendReasoningDescriptor`：同一 `turnId` 只保留一行、后续 piece 原地合并（`detailsOpen` 等字段保留）；首段落位按「本回合第一个 assistant/activities/tool-lifecycle/denied/turn-terminal 之前 → 否则该回合最后一行之后 → 否则表尾」；无 `turnId` 不合并/不重排；全量回放重建时实时 reasoning 行按 `turnId` 与历史行做 piece 级幂等归并，无历史行则插回该回合终态行之前，不统一追加到表尾 |
| `app/renderer/src/chat/ChatRow.tsx` | `ReasoningRow` 渲染标题与正文；`status:"omitted"` 不渲染 `<pre>`、显示「平台省略了思考正文，无法显示具体内容。」；complete 空正文显示「没有可显示的思考正文。」；部分省略在可见正文后补说明；默认折叠不变；不把 reasoning 伪装成 assistant 正文 |
| `app/renderer/src/shell/shell.css` | 新增 `.reasoning-note`（复用既有卡片底/字号/圆角 token，不引入新视觉规范） |

## 前后对比（一个触发场景）

客户问一个需要多步工具的问题，Pi 在同一回合先后产生两段思考（2100ms、1900ms）和回答：

- 以前：两条（甚至更多）「已思考」折叠行；展开只有「已思考」三个字；落点可能在「会话结束」之后。
- 现在：该回合只有一个「已思考 4 秒」折叠行；展开是按到达序拼接的两段真实正文；位置在用户消息之后、assistant/工具/「会话结束」之前。平台省略正文时标题带「（内容由平台省略）」，展开显示固定说明而不是空白。回放重开同一映射、同一合并规则。

## 范围

本次只改桌面UI Section 1 内的渲染前端与 `test/桌面UI/`。不改 `src/model/runtime.ts`、Service、tool-display、Pi/Claude/Codex 适配器、`app/desktop/`、`app/main.ts`、preload、`package.json`/依赖；不碰已验收的守卫/尾连字符/后台任务改动；未提交 Git、未切分支、未重启现场运行中的应用。

## 验证（实际跑过；未跑的不写成通过）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新增纯逻辑单测 | `node --test test/桌面UI/reasoning-view.test.ts` | **15/15 通过，exit 0**（映射/文案/合并/插入/幂等/降级/omitted/坏件/去重） |
| 桌面UI 全量单测 | `node --test "test/桌面UI/*.test.ts"` | **162/162 通过，0 fail，exit 0** |
| 旧基线回归 | `node --test test/桌面应用/*.test.ts` | **506/506 通过，0 fail，exit 0** |
| 根 typecheck | `npm run typecheck` | **exit 0**（在途测试文件的 7 条类型错误已修复归零） |
| 渲染层 typecheck | `npm run typecheck:renderer` | **exit 0** |
| 渲染构建 | `npm run build:renderer` | **exit 0**（Vite 8.3.4；dist `index.html` + `assets/index-s5ZMUClC.css` + `assets/index-D7yxIV_U.js`） |
| Electron 离线 e2e | `./node_modules/.bin/electron test/桌面UI/reasoning-electron-smoke.mjs app/renderer/dist/index.html 角色卡/桌面UI/docs/change/2026-10-22-reasoning-display-evidence` | **14/14 checks，0 failures，exit 0**；4 张截图 + `report.json`；零 console.error / CSP 违规 / 意外导航 |
| 空白检查 | `git diff --check` | exit 0 |

e2e 覆盖：实时两段合并/时长求和/正文顺序/行位在 user 之后与 assistant、turn-terminal 之前；omitted 标题与说明且无 `<pre>`；回放 `row.reasoning` 同解、缺载体回落 assistant「已思考」、同一 piece 实时重推不重复、增量回放正文不翻倍；坏原始字符串落诊断行且原文不上屏；两条无 turnId 各成一行；全量回放重建后实时 reasoning 行仍在该回合终态之前。

实施前证据（设计 §5.4，由测试角色并行完成，本角色未执行真实模型取样）：[真实 Pi reasoning wire 取样](../../../测试/docs/change/2026-10-22-reasoning-wire-sample.md) 显示 `deepseek-v4-flash[1m]` 经客户网关的 3 个成功样本均 `status:"complete"`、投影正文 335/1403/1153 字符、`redacted:false`/`truncated:false`，未触发 omitted 路径；其中 893ms 原始信号样本的投影 `durationMs` 为 1ms，按 R2 下限显示「已思考 1 秒」。因此本轮以「有正文」为主场景，同时保留 R4 的 omitted/空正文兜底测试。

## 与设计的偏差（均为实现细节，行为不变）

- 行数据内部用 `pieces: ReasoningPiece[]` 记录已收事实（指纹按 `status|durationMs?|正文` 即时计算），而非只存指纹字符串。原因是全量重建时要把实时行与历史行做 piece 级去重；只存指纹无法在不重复拼接的前提下拆分已合并的正文。指纹口径与设计一致，`pieces` 不渲染。
- e2e 的 `reasoning-smoke-preload.cjs` 通过 `require` 复用既有离线 IPC 替身白名单，避免复制第二份 preload 漂移；冒烟入口与夹具独立。
- 测试角色提供的真实 wire 样本（`deepseek-v4-flash[1m]` 返回可读 thinking 正文、status=complete）作为主场景依据；夹具以「有正文」为主，同时保留 omitted/空正文兜底断言。

## 未验证项（如实）

- **真实 Pi 真机检查（设计 5.3）未做**：现场应用仍是旧构建，本轮未重启；需下一次构建/启动后用 Pi + deepseek-v4-flash[1m] 开新会话确认正文、回合归并、时长与回放表现。
- 当前现场会话历史 0 行：回放证据来自脚本化历史行，不代表该会话重启后可回放。
- 已知限制（设计已接受）：同一回合两条**完全相同**的真实 piece 无法区分，会合并为一条；无 `turnId` 的重复投递不做幂等，按到达序各成一行。
- O1–O7（默认展开/复制按钮/token 数/流式增量/额外截断标记/跨回合汇总/逐消息折叠）未授权，未实现。

## 下一步

下一构建启动后在真实 Pi 会话复核（设计 5.3）；独立验收按 R5 口径复核。功能导航见 [feature-map](../../feature-map.md)；相关功能说明 [会话聊天流呈现](../feature/ui-contract-surface.md)。
