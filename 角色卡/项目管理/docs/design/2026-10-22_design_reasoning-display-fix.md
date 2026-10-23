---
id: reasoning-display-fix
type: design
title: 修复思考行显示——展开可见正文、按回合归组、平台省略如实说明
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: accepted
revision: 1
related: [reasoning-effort-lightweight-repairs, ui-platform-round]
events:
  - date: "2026-10-22"
    kind: created
    summary: 客户真机反馈 Steward 会话思考行展开只见「已思考」且多行相邻；仅做只读调查并形成桌面UI修复方案，未改产品代码/测试、未提交 Git、未重启应用
  - date: "2026-10-22"
    kind: customer-confirmed
    summary: 客户确认按 R1–R5 实施、O1–O7 均不选；该确认是设计与实施范围确认，不构成实施完成、测试通过或验收结论
---

# 修复思考行显示——展开可见正文、按回合归组、平台省略如实说明

**本轮性质：设计文档（status: accepted，方案编号 ANS-REASONING-DISPLAY；版本 D1）。** 客户已于 2026-10-22 确认按 **R1–R5 实施、O1–O7 均不选**；该确认是设计与实施范围确认，**不代表已实现、已测试或已验收**。本文由项目管理编写，未实施、未测试、未验收、未提交 Git。客户 2026-10-22 在真实桌面应用（Pi + deepseek-v4-flash[1m]）的 Steward 会话中反馈「思考的内容没有显示对」「又多个已思考连接在一块也不知道干嘛的」。本方案只写设计，不改产品代码/测试/其他角色文件，不重启应用（当前应用仍在跑，保留现场）。已验收的守卫/尾连字符/后台任务改动不在本方案范围。

## 一、问题与目标

### 1.1 客户看到的现象（白话例子）

客户在 Steward 会话里问了一个需要多步工具的问题。模型先思考了 8 秒、中间又思考了几次，然后回答。界面上出现多个「已思考」折叠行：

- 点开其中一个，里面仍然只有「已思考」三个字，看不到任何思考内容；
- 同一个用户消息前面紧挨着两个「已思考」，一轮「会话结束」之后又出现四个，读的人不知道这些行属于哪一轮、为什么在这里；
- 回放/重新打开会话时同样看不到正文。

期望：点开「已思考」能看到模型实际的思考正文；如果平台没有提供正文（省略/redacted），要明确写「平台省略了思考正文」，而不是空白或再次显示「已思考」；同一回合只显示一个思考折叠行，带真实时长（有真实信号时），位置在该回合内，不跑到「会话结束」之后。

### 1.2 已确认的代码事实（只读调查）

| 层 | 现状 | 证据 |
| --- | --- | --- |
| Pi 适配器 | 每个 assistant message 的 `thinking` blocks 抽取 `{text,status}`；`message_end` 时 emit `detail={version:1,source:"reasoning",reasoning:{text,status,durationMs?}}`，summary 为「已思考」。tool loop 中一个回合可能有多条 assistant message，因此可能 emit 多条 reasoning 事件 | `src/common/pi-adapter/real-adapter.ts:680-716`、`extractReasoningFacts` L861-878 |
| 运行时核心/Service | 对 `detail.source==="reasoning"` 恰一次投影：脱敏＋预算，summary 定格「已思考」，产出 `detail.reasoning={text:DisplayTextV1,status,durationMs?}`；实时、持久化、历史读取共用同一投影 | `src/service/runtime/session.ts:240-250`、`:73-79`；`src/common/runtime-core/tool-display.ts:208-236`；契约 `src/model/runtime.ts:859-919` |
| 渲染映射 | `source==="reasoning"` 只读 `detail.text`（投影后不存在该字段），回落到 summary ⇒ `data.text` 变成「已思考」 | `app/renderer/src/chat/events.ts:472-481`，`stringDetail` L80-86 |
| 行组件 | `ReasoningRow` 渲染 `data.label` ＋ `<pre>{data.text}</pre>`；未读 `status/durationMs`，无「平台省略正文」分支 | `app/renderer/src/chat/ChatRow.tsx:647-663` |
| 实时去重 | `eventKey` 用 `detail.text || summary`；同一回合所有 reasoning 事件得到同一个 key（summary「已思考」），若 turnId 存在，后续 piece 会被当成重复跳过。要合并多段正文，必须让 reasoning 免于按 summary 的实时去重，改由合并层做幂等 | `app/renderer/src/chat/replay.ts:72-81`、`:108-130` |
| 历史回放载体 | 桌面窗口已把投影形 `row.reasoning` 放进回放行；渲染侧 `historyRowToDescriptor` 不读该字段，reasoning 行落成 assistant 文本行 | `app/desktop/runtime-history.ts:43-53`、`app/desktop/session-history.ts:44-51`、`app/renderer/src/chat/events.ts:707-755` |
| 历史读取 | 当前会话 `getSessionHistory` 返回 0 行（未持久化）；实时与回放共用 `events.ts` 映射，回放同样丢正文 | 客户现场证据；`chat-store.applyHistory` |
| 旧版验收口径 | React 迁移前的 G-5 桌面验收已定义四态文案、实时/回放同一入口、默认折叠、省略态文案；React 重写后未承接 | `test/测试/retired-5b/g-desktop.test.ts.retired:27-48、50-61、91-115` |

结论：运行时契约和回放载体已经就位，缺的是桌面UI 的渲染映射、回合归组和文案。**本方案不改 runtime core/Pi 适配器契约**；只有在实施前证据表明适配器把 SDK 已经给出的正文丢了，才另立 Pi 适配器任务，不并入本方案。

### 1.3 目标（验收口径）

1. 展开任一条思考折叠行，能看到该回合真实的思考正文（来自 `detail.reasoning.text.text`，不是 summary）。
2. `status:"omitted"` 时正文区显示明确说明「平台省略了思考正文」，不是空白、不是重显「已思考」、不伪造正文。
3. 有真实 `durationMs` 时折叠标题显示「已思考 N 秒」；没有真实信号时保持「已思考」；不发明时间。
4. 同一 `turnId` 的多条 reasoning 事件合并为一个折叠行（正文按到达序拼接），放在该回合内 assistant/tool 行附近的确定位置，绝不落在该回合「会话结束」之后，也不与用户消息错位。
5. 实时与历史回放用同一映射、同一合并规则，行为一致。
6. 其他来源（delivery/prompt-input/system/reasoning-diagnostic）和工具行/会话结束行不受影响；不把 reasoning 行伪装成 assistant 正文。

### 1.4 非目标（本轮不做什么）

- 不改 `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/tool-display.ts` 的契约或投影实现；不改 Pi/Claude/Codex 适配器。
- 不改历史持久化 schema、`.ans/sessions` 布局、IPC/preload/main、`package.json` 或依赖。
- 不做流式思考增量、默认展开、复制按钮、token 统计、思考过程动画等新功能（见第六节可选项 O1–O7，默认不纳入）。
- 不在本设计轮重启当前应用或修改运行中的进程；修复在下一构建/启动生效。

## 二、精确行为规则

### R1 正确读取投影详情（必需）

`events.ts` 的 `describeEvent` 在 `source === "reasoning"` 分支按以下规则取数，**不再读 `detail.text`，不再用 `event.summary` 当正文**：

```ts
const reasoning = asRecord(event.detail?.reasoning);
const textHolder = asRecord(reasoning?.text);           // DisplayTextV1
const status = reasoning?.status === "complete" || reasoning?.status === "omitted"
  ? reasoning.status : null;
if (!textHolder || typeof textHolder.text !== "string" || status === null) {
  // 坏件/旧原始事实：不猜、不渲染未投影文本；沿用诊断形系统行
  return systemRow("推理内容无法安全显示", turnId);
}
const body = status === "omitted" ? "" : textHolder.text; // omitted 一律不呈现正文
const durationMs =
  typeof reasoning.durationMs === "number" && Number.isFinite(reasoning.durationMs) && reasoning.durationMs >= 0
    ? reasoning.durationMs : undefined;
```

- 正文唯一来源是投影形 `detail.reasoning.text.text`（`DisplayTextV1`）；`event.summary`（「已思考」）只作旧数据兜底文案，绝不作为正文。
- `detail.reasoning.text` 若是字符串（未投影的原始事实）或结构损坏，**fail-closed**：渲染诊断系统行「推理内容无法安全显示」，不显示该字符串，避免绕过核心脱敏/预算。
- `turnId` 取 `event.turnId`；缺省时取 `detail.turnId`（Service 会把 turnId 并入 detail）；两者都没有则视为无轮次坏件（见 R3 保守规则）。
- 渲染侧行数据形状（桌面UI 内部，不是跨角色契约）：`{status, text, durationMs?, label}`；`label` 由 R2 的单一函数产出。

### R2 时长与文案格式（必需，格式写死）

单一函数（桌面UI 内唯一文案来源，`ChatRow` 只取用）：

```ts
function reasoningLabel(input: { status: "complete" | "omitted"; durationMs?: number; partialOmitted?: boolean }): string {
  const base = input.durationMs !== undefined
    ? `已思考 ${Math.max(1, Math.round(input.durationMs / 1000))} 秒`
    : "已思考";
  if (input.status === "omitted") return `${base}（内容由平台省略）`;
  if (input.partialOmitted) return `${base}（部分内容由平台省略）`;
  return base;
}
```

| 情形 | 折叠标题 | 展开正文区 |
| --- | --- | --- |
| complete，有真实 durationMs | `已思考 N 秒` | `<pre>` 正文 |
| complete，无时长信号 | `已思考` | `<pre>` 正文 |
| complete，正文为空（仅签名/零长） | `已思考`（有真实时长则带秒） | 说明「没有可显示的思考正文。」 |
| omitted，无时长 | `已思考（内容由平台省略）` | 说明「平台省略了思考正文，无法显示具体内容。」 |
| omitted，有真实 durationMs | `已思考 N 秒（内容由平台省略）` | 同上 |
| 合并后部分省略 | `已思考 N 秒（部分内容由平台省略）` | 可见正文 ＋ 说明「平台省略了部分思考正文。」 |

- `N = max(1, round(durationMs / 1000))`：四舍五入到整秒，下限 1（0ms 真实信号也显示「已思考 1 秒」，避免「已思考 0 秒」坏观感）。这是对旧 G-5 桌面验收文案（retired G1）的沿用。
- `durationMs` 非法（负数、NaN、Infinity、字符串、null）一律按无信号处理，不显示秒数。
- **合并行的时长只在所有已收 piece 都带真实 `durationMs` 时求和显示**；任一段缺信号则不显示秒数（不显示部分和，避免把 5 秒说成总时长）。
- 无时长文案用「已思考」而不是旧 G1 的「推理内容」：客户当前界面已以「已思考」为标签，保持客户熟悉的词；此处是 PM 对本方案的冻结，若 su/客户要改回「推理内容」需在审核时明确。
- `ChatRow` 里保留一个常量兜底（旧行没有 `label` 时显示「已思考」）；常量与上述函数同源导出，不出现第二份文案实现。

### R3 按 turnId 归组与排序（必需）

#### 身份与合并

- **一个 `turnId` 只保留一个 reasoning 折叠行**。第一个 piece 建行，后续 piece 原地合并，不新增行。
- 正文按**到达序**拼接：各 piece 的非空可见正文用 `\n\n` 连接；omitted piece 不贡献正文。
- 状态合并：所有 piece 都 omitted ⇒ `status:"omitted"`；只要有一段 complete ⇒ `status:"complete"`，并用 `partialOmitted` 标记混合省略。
- 时长合并：仅当所有 piece 都带真实 `durationMs` 时求和（见 R2）。
- 幂等：每行维护已收 piece 指纹集合（`status|durationMs?|正文`，内部字段，不渲染）。同一 piece 被实时重推、或实时/历史各来一次时，指纹命中即忽略，不重复拼接、不重复计时。代价是**同回合两条完全相同的真实 piece 无法区分，会合并为一条**（记录为已知限制，不猜测）。
- 合并时保留行上已有的 `detailsOpen` 等字段（开合状态不因合并丢失）。

#### 位置（确定性规则）

| 到达时同回合已有行 | 新 reasoning 行插入位置 |
| --- | --- |
| 已有 assistant / activities / tool-lifecycle / denied / turn-terminal | 插到该回合**第一条**此类行之前 |
| 只有 user / delivery / injected / system 等非锚点行 | 插到该回合最后一条行之后 |
| 还没有该回合任何行（正常流式首条） | 表尾追加（现状） |

- 该规则保证：reasoning 行永远在该回合 `turn-terminal`（「会话结束」）之前；永远不插进别的回合；有 assistant/tool 输出时排在输出之前（阅读语义＝「这一轮先想了想，再回答/调工具」）。
- **不移动任何其他行**；`operator`/judge 等锚点卡行不参与锚点集合，不因 reasoning 插入而改变相对顺序。
- 合并已有行时**不改变该行位置**（第一段的落点就是整个回合折叠行的位置）。
- 无 `turnId` 的坏件：**不合并、不重排、不猜回合**，每条按到达序独立成行（正文/省略照 R1/R2 如实显示）；这是保守处理，宁可多一行也不把事实挂到错误回合。

#### 实时去重（必须同步调整）

- `classifyLiveDuplicate` 把 `detail.source==="reasoning"` 视为豁免（与终态/工具身份同类），不再用 `turnId+summary` 把同回合后续 piece 吞掉；重复投递的幂等交给 R3 的 piece 指纹。
- 历史/实时文本去重（`historyProjectionKey`、`liveCoversHistoryRow`）不把 reasoning 纳入首行文本分组；`historyRowToDescriptor` 读到 `row.reasoning` 时映射为 `kind:"reasoning"`，与实时走同一个提取器/合并器。
- 全量回放重建时：历史 reasoning 行按同一规则建行/合并；实时侧保留下来的 reasoning 行**按 turnId 合并进历史行**（指纹幂等），没有对应历史行时插到该回合终态行之前，**不得在重建后被统一追加到表尾**（否则又会出现在「会话结束」之后）。
- `row.reasoning` 缺失（旧数据/坏件）⇒ 保持现有 assistant 文本行回落，不伪造 reasoning 行。

### R4 省略、空正文与诊断（必需）

- `status:"omitted"`：正文区**不渲染 `<pre>`**，显示固定说明「平台省略了思考正文，无法显示具体内容。」（`.reasoning-note`，复用现有字体/卡片底，不新增视觉规范）。折叠标题同时带「（内容由平台省略）」，折叠状态下也能看懂。
- complete 但正文为空：显示「没有可显示的思考正文。」，不留空白展开区。
- `source==="reasoning-diagnostic"`：沿用现有系统诊断行（`summary || "推理内容无法安全显示"`），不改样式、不伪装成思考内容。
- 投影形损坏（R1 的 fail-closed 分支）：同诊断系统行。
- 任何情况下不伪造正文、不伪造时长、不把 summary/平台摘要冒充原文；React 文本节点渲染，保持现有转义语义。

## 三、归属与文件范围

### 3.1 主属：桌面UI

本修复的主属是**桌面UI**。逐文件对照其 `boundary.md` Section 1（`app/renderer/` 整目录、`test/桌面UI/` 整目录均在授权内）：

| 文件 | 变更 | 边界核对 |
| --- | --- | --- |
| `app/renderer/src/chat/events.ts` | R1 投影映射、R2 文案函数、`historyRowToDescriptor` 消费 `row.reasoning` | `app/renderer/` ✓ |
| `app/renderer/src/chat/chat-store.ts` | R3 归组/插入/合并、实时去重接线、全量回放保留行归并 | `app/renderer/` ✓ |
| `app/renderer/src/chat/ChatRow.tsx` | R2/R4 标题、正文、省略说明渲染；默认折叠不变 | `app/renderer/` ✓ |
| `app/renderer/src/chat/types.ts` | reasoning 行数据类型/常量（可选，便于类型收口） | `app/renderer/` ✓ |
| `app/renderer/src/chat/replay.ts` | reasoning 免于 summary 实时去重（R3） | `app/renderer/` ✓ |
| `app/renderer/src/shell/shell.css` | 仅在需要时复用/补 `.reasoning-note`（沿用 `.reasoning-text` 同族样式） | `app/renderer/` ✓ |
| `test/桌面UI/reasoning-view.test.ts`（新增） | R5 纯逻辑单测：映射/文案/合并/插入/幂等/降级 | `test/桌面UI/` ✓ |
| `test/桌面UI/reasoning-electron-smoke.mjs`、`reasoning-smoke-preload.cjs`（新增） | R5 真实 Electron 离线 e2e：实时＋回放＋省略＋坏件＋顺序 | `test/桌面UI/` ✓ |

实现上允许把纯函数拆到同目录新文件 `app/renderer/src/chat/reasoning.ts`（仍属 `app/renderer/`），但**文案/映射/合并必须只有一个实现**，实时与回放共同调用。

### 3.2 桌面窗口：核对后不需要改

| 文件 | 结论 | 边界 |
| --- | --- | --- |
| `app/desktop/runtime-history.ts` | 已把投影形 `row.reasoning` 放进回放行（G-5 wave 2），不改 | `app/desktop/` 属桌面窗口；本方案只读核对 |
| `app/desktop/session-history.ts` | `ReplayRow.reasoning` 载体已定义，不改 | 同上 |
| `app/desktop/session.ts` | reasoning/reasoning-diagnostic 已被排除在 assistant 正文镜像之外，不改 | 同上 |
| `test/桌面应用/multi-runtime.test.ts` | 既有载体测试（`row.reasoning` 透传、坏件回落）仍然成立，不改 | 桌面窗口精确文件授权；如确需调整由桌面窗口执行 |

若实施时发现回放载体在某个路径缺失/被裁剪，由**桌面窗口**在其 Section 1 内做最小透传修复，不新增 IPC/schema；先经项目管理协调，不顺手扩范围。

### 3.3 运行时核心 / Pi 适配器 / 其他角色：不改

| 角色 | 文件 | 结论 |
| --- | --- | --- |
| 运行时核心 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/tool-display.ts`、`test/runtime-core/reasoning-facts.test.ts` | 契约/投影/幂等已满足本方案，不改 |
| Pi适配器 | `src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/reasoning-effort.test.ts` | 现场证据指向渲染映射；不改。只有实施前证据证明 SDK 已给的正文在适配器丢失，才另立任务 |
| Claude/Codex 适配器 | `src/provider/claude/session.ts`、`src/provider/codex/session.ts` | 事实形状同形（complete/omitted/durationMs 可选），由渲染侧统一消费，不改 |
| 产品/UIUX | 角色卡与原型 | 文案按本设计冻结（沿用旧 G-5 G1 文案）；如后续要新的视觉处理另立设计，不在本轮 |
| 测试/独立验收 | 各自标准与报告 | 实施后按本方案第五节验证；本轮不实施、不代写测试 |

### 3.4 明确不需要改的部分

- `app/main.ts`、`app/preload.cjs`、所有 IPC 通道、`package.json`/锁文件/构建配置、`.env`。
- 历史持久化 schema（`.ans/sessions`、replay JSONL 条目形状）。
- 工具行/工具组/交互卡/会话结束行/交付/系统消息的映射与样式。
- 旧的 `test/测试/retired-5b/g-desktop.test.ts.retired` 保持退役，不改写历史验收记录；本方案在 `test/桌面UI/` 新建测试承接同一口径。

## 四、兼容 / 回归

1. **实时**：reasoning 事件按 R1/R3 映射成一条按回合归组的行；summary 仍是「已思考」，只不再作正文来源。旧的 reasoning 行（若已在内存）不迁移，重载/重建后统一。
2. **回放/历史**：`row.reasoning` 存在 ⇒ 与实时同解；缺失（旧数据）⇒ 维持 assistant「已思考」文本行，不伪造。当前会话历史 0 行时只能验实时；回放验收需脚本化历史或启用持久化的会话。
3. **去重**：reasoning 豁免 summary 文本去重，改由 piece 指纹保证实时重推/实时＋历史不重复；其他来源的去重键不变。历史内部去重（`historyProjectionKey`）不纳入 reasoning，同回合多段不会被误删。
4. **工具行排序**：归组/插入只影响 reasoning 行自身位置；`appendDescriptor` 的工具相位合并、连续工具组、`activityGroupByRole` 指针不受影响。
5. **会话结束行**：`turn-terminal` 的合并/提升逻辑不动；reasoning 行始终在该回合终态行之前，不改变「一轮一条会话结束」。
6. **其他来源**：delivery/prompt-input/system/reasoning-diagnostic 分支原样；assistant 文本不走 reasoning 分支；reasoning 不进入 assistant 反馈镜像（桌面窗口侧已排除）。
7. **旧事件降级**：无 `durationMs` ⇒ 无秒数；无 `turnId` ⇒ 独立成行、不合并；无 `reasoning` 载荷/坏件 ⇒ 诊断系统行或旧 assistant 回落；旧投影形（幂等）按同一提取器读取。
8. **空正文/redacted/truncated**：正文已由核心投影完成脱敏与预算；渲染层只显示 `DisplayTextV1.text`，不二次处理、不额外拼接标记。redacted 文本已由核心替换；truncated 只影响正文长度，不改变行结构。
9. **合并幂等**：同一 piece 经实时重推、历史回放、全量重建多次到达，正文不重复、时长不重复累计；全量重建后每个回合至多一条 reasoning 行。
10. **现有桌面UI 测试/e2e**：`test/桌面UI/event-routing.test.ts`、`replay.test.ts`、`history-dedupe.test.ts`、`row-model.test.ts` 及 Phase 3B/4A/4B/5B 冒烟应保持通过；`test/桌面应用/multi-runtime.test.ts` 的载体断言保持有效。新增测试不改旧断言。
11. **当前进程/现场**：本设计不重启、不热更新；修复在下一次构建启动生效。现场 DOM 与日志保留。

## 五、验证计划（R5）

> 以下全部是**计划**，本文不声称已通过；实施后由桌面UI提供证据，测试/独立验收复核。

### 5.1 渲染器纯逻辑单测（`test/桌面UI/reasoning-view.test.ts`）

1. **映射**：投影形 `detail.reasoning.text.text` 正确进正文；summary「已思考」不被当正文；`status`/`durationMs` 透传；`event.turnId` 缺省时取 `detail.turnId`。
2. **文案**：complete 无时长「已思考」；complete 4200ms「已思考 4 秒」；complete 400ms/0ms「已思考 1 秒」；omitted「已思考（内容由平台省略）」；omitted 8000ms「已思考 8 秒（内容由平台省略）」；非法时长（负数/NaN/Infinity/字符串/null）不显示秒数。
3. **省略/坏件**：omitted 正文强制为空；带正文的违规 omitted 不显示正文；原始字符串 `reasoning.text` 不入正文；坏件落诊断系统行；`reasoning-diagnostic` 文案不变。
4. **历史映射**：`row.reasoning` ⇒ `kind:"reasoning"`；缺失 ⇒ assistant 文本行回落；坏载体 ⇒ 诊断行；`row.text`（「已思考」摘要）不作为正文。
5. **合并**：同 turn 两段正文按到达序 `\n\n` 拼接；全 omitted ⇒ omitted；混合 ⇒ complete＋部分省略标记；全部有真实时长才求和；同一 piece 重放不重复；`detailsOpen` 保留。
6. **插入顺序**：首个 piece 在 assistant 文本前、在 tool 行前；迟到 piece 合并后不移动位置；只有 user 行时落在 user 之后；有终态行时落在终态之前；无 turnId 两条 ⇒ 两行、不合并、不重排。
7. **去重**：reasoning 不被 `classifyLiveDuplicate` 按 summary 吞掉；其他事件类型判定不变。

### 5.2 桌面 Electron 离线 e2e（`test/桌面UI/reasoning-electron-smoke.mjs` ＋ 受控 preload）

1. **实时**：推入 user → 两条同 turn reasoning（正文 A/B、真实时长）→ assistant 文本 → settled；断言恰一个 `.reasoning-row`、标题「已思考 N 秒」、展开正文为 `A\n\nB`、行在 assistant/`.turn-terminal` 之前。
2. **省略**：omitted piece ⇒ 标题带「（内容由平台省略）」、展开显示说明文本、无 `<pre>` 假正文、无空白。
3. **回放**：`session:history` 推入带 `row.reasoning` 的行 ⇒ 同一行结构与文案；再推同一 piece 的实时事件 ⇒ 不重复、正文不翻倍；历史缺载体 ⇒ assistant「已思考」文本行原样。
4. **坏件/无 turnId**：坏载荷落诊断系统行；两条无 turnId reasoning 各成一行、不合并、顺序按到达。
5. **回归**：delivery/system/tool-lifecycle/turn-terminal 行结构与相对顺序不变；零 console 错误/CSP 违规；截图与 DOM 断言写入证据目录。

### 5.3 真实 Pi 会话真机检查（实施后）

在**新构建**的桌面应用中，用 Pi + deepseek-v4-flash[1m] 开一个 Steward 会话，提出需要多步工具的问题：

- 展开「已思考」能看到真实思考正文；同一回合只有一行；有真实时长时显示「已思考 N 秒」；
- 若某段平台省略正文，显示省略说明而非空白；
- 多回合会话中 reasoning 行属于各自回合，不在「会话结束」之后，不与用户消息错位；
- 切换角色/重开会话后的回放表现一致（若该会话有持久化历史；当前现场会话历史 0 行不构成本项通过证据）。

### 5.4 实施前证据检查

在改代码前，用一条真实 Pi 会话的 reasoning 事件样本（开发工具/临时只读探针）确认渲染层收到的 `detail.reasoning.text.text`、`status`、`durationMs` 实际值：

- 若正文非空 ⇒ 本方案 R1 直接修复显示；
- 若正文为空且 `status:"omitted"` ⇒ 说明平台确实省略，R4 的如实说明就是正确结果，不改适配器；
- 若怀疑适配器丢了 SDK 已给的正文 ⇒ 停止本方案实施，另立 Pi 适配器调查，不夹带修改。

### 5.5 类型检查与构建

- `npm run typecheck`、`npm run typecheck:renderer` 均 0 错。
- `npm run build:renderer` 成功；e2e 默认入口为 `app/renderer/dist/index.html`。

### 5.6 证据与口径

记录构建 SHA、渲染器版本、事件样本（脱敏）、DOM 断言输出、截图路径；区分「渲染器单测通过」「Electron 离线 e2e 通过」「真实 Pi 真机检查」三层证据，不把离线证据写成真机通过，不把本轮设计写成已实现。

## 六、必需项 / 可选项

### 6.1 必需项（本方案范围，默认全做）

| ID | 内容 | 验收要点 |
| --- | --- | --- |
| R1 | 投影正文映射 | 正文取自 `detail.reasoning.text.text`；summary 不作正文；坏件 fail-closed 诊断 |
| R2 | 时长与文案 | 「已思考 N 秒」/「已思考」；四态文案；下限 1；非法时长忽略；合并时长规则 |
| R3 | 回合归组/排序 | 一回合一行；按到达序拼接；确定性插入位置；终态之前；实时/回放同解；piece 幂等；reasoning 免于 summary 去重 |
| R4 | 省略/空正文/诊断 | omitted 明确说明；空正文说明；诊断行沿用；不伪造 |
| R5 | 测试与证据 | 5.1 单测＋5.2 e2e＋5.5 typecheck；5.3/5.4 为真机与实施前证据 |

### 6.2 可选项（客户已确认均不纳入；记录保留供追溯）

客户已于 2026-10-22 确认 **O1–O7 全部不选**；下表保留原始候选记录，供后续追溯。若未来重启其中任一项，需另走方案/审核/客户确认，不在本次实施范围。

| ID | 内容 | 客户决定（2026-10-22） |
| --- | --- | --- |
| O1 | 默认展开思考行或记住展开状态 | 不纳入；保持默认折叠、手动开合沿用 `detailsOpen` |
| O2 | 复制思考正文按钮 | 不纳入 |
| O3 | 显示思考 token/字符数 | 不纳入 |
| O4 | 流式展示思考过程（增量） | 不纳入；Pi 当前只在 `message_end` 产事实 |
| O5 | 额外显示 truncated/redacted 标记 | 不纳入；正文已由核心保护 |
| O6 | 跨回合思考汇总/统计 | 不纳入 |
| O7 | 每条 assistant 消息单独折叠（而非回合级） | 不纳入；本方案按回合归组 |

## 七、影响与风险

| 项 | 影响/风险 | 处置 |
| --- | --- | --- |
| 实时 vs 回放 | 两路共用同一映射；回放依赖 `row.reasoning` 载体 | R1/R3 单一实现；历史缺载体时如实回落 |
| 历史记录缺失 | 当前会话 `getSessionHistory` 0 行，重启后无法回放该会话思考 | 不由本方案承诺修复；回放验收用脚本化/持久化会话；持久化策略另行评估 |
| 三引擎事实形状 | Claude 通常无 `durationMs`（bundled CLI 无段级时长），Codex/Pi 可能有；status 语义一致 | 渲染侧统一按可选时长处理；无信号不显示秒数 |
| Pi thinking blocks | 适配器只读 `type:"thinking"` 且 `thinking` 为字符串的块；若平台只给签名/别种块，正文可能为空或 omitted | R4 如实说明；若证据显示适配器丢了 SDK 已给正文，另立 Pi 适配器任务 |
| 去重豁免 | reasoning 不再按 summary 实时去重，依赖合并层幂等 | R3 指纹与单测覆盖；同回合完全相同的真实 piece 会合并（已知限制） |
| 插入位置 | 迟到 piece 合并/插入可能让折叠行出现在已渲染的 assistant 行之前（视觉上移），仅限本回合 | 确定性规则＋e2e 顺序断言；不移动其他行 |
| 性能 | 每次 reasoning 事件线性扫描本回合行；行数受回合工具调用数限制，虚拟列表已存在 | 可接受；若后续出现超长回合，再按 turnId 建索引（不在本轮） |
| 安全 | 渲染层只显示核心投影后的 `DisplayTextV1`；原始字符串一律 fail-closed | R1 明确；React 文本节点保持转义 |
| 契约 | 不改 runtime core/适配器/IPC/持久化；无迁移 | 实施前如发现契约缺口，停下来交 PM 协调，不自行扩权 |

### 7.1 未决问题

1. `deepseek-v4-flash[1m]` 经 Pi 返回的 thinking blocks 是否总是带可读正文？5.4 的实施前样本必须先回答；若为空，R4 的省略说明就是正确呈现。
2. 「部分内容由平台省略」这条混合文案是否可接受？本方案按旧 G1 的四态口径扩展；su/客户可在审核时改成更简单的单一省略文案。
3. 客户是否接受「回合级」一个折叠行（而不是每条 assistant 消息一行）？本方案按任务要求选回合级；若要改粒度需回到设计。
4. 现场运行中的应用是哪个构建 SHA？修复在下一次构建生效；需在实施时记录并对齐，避免把旧构建现象当新构建回归。
5. 当前会话未持久化（历史 0 行）；「重启后回放思考」是否在本次客户期望内？如需要，另立持久化/会话策略任务。

## 八、状态与下一步

- **设计已获客户确认（status: accepted）；未实施、未测试、未验收。**
- **未实施、未测试、未验收、未提交 Git**；未改产品代码/测试/其他角色文件；未重启当前应用（现场保留）。
- 客户已于 2026-10-22 确认 R1–R5（O1–O7 不选），已派发**桌面UI**实施；实施后由测试角色验证、独立验收判定。
- 实施轮的最小写入集以桌面UI `boundary.md` Section 1 和最终任务书为准；本文不扩大任何角色权限。
