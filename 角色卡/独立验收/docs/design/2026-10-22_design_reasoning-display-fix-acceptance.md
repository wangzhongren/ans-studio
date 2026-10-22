---
id: reasoning-display-fix-acceptance
type: design
title: 思考行显示修复 R1–R5 独立验收标准——展开见正文、按回合归组、省略如实说明
version: A1
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: ready
related: [reasoning-display-fix, reasoning-effort-lightweight-repairs, ui-platform-round]
events:
  - date: "2026-10-22"
    kind: created
    summary: 在设计 accepted/revision 1、R1–R5 实施刚并行启动时固定桌面UI「思考行显示修复」的验收标准；只定判据，未判定实现，未运行测试
  - date: "2026-10-22"
    kind: updated
    summary: 项目管理按授权收尾设计第八节，设计版本身份由 a2e1109… 更新为 e02c9594…；仅刷新本标准的设计哈希/状态说明与未决项，判据不变
---

# 思考行显示修复 R1–R5 验收：先写死「怎样算做到」

客户 2026-10-22 在真实桌面应用的 Steward 会话里看到多个「已思考」折叠行：点开仍只有「已思考」三个字，同一轮相邻多行、会话结束之后还有几行，回放也看不到正文。设计给出的修复范围是 **R1–R5**：正确读取核心投影后的思考正文、按回合归组、如实显示时长与「平台省略」、实时与回放同解，并用纯逻辑单测＋Electron 离线 e2e＋typecheck/build 证明。**O1–O7 均不选**。

本文件是**本轮修复的验收标准（version A1，status: ready）**。它回答：必须交付什么、成功/失败/边界看到什么、需要哪些证据、怎样下结论。**本文不判定实现结果，不预告通过。**写作时设计已 accepted/revision 1，R1–R5 实施刚并行启动，候选未冻结；标准定义时点晚于设计与实施启动。

## 一、依据、授权与状态

- **客户授权**：客户 2026-10-22 确认按[修复思考行显示——展开可见正文、按回合归组、平台省略如实说明](../../../项目管理/docs/design/2026-10-22_design_reasoning-display-fix.md)的 **R1–R5** 实施；**O1–O7 均不选**。该确认是设计与实施范围确认，不构成实施完成、测试通过或验收结论。
- **设计版本**：上述设计 `status: accepted`、`revision: 1`；本角色当前核对的本机 SHA-256 为 `e02c9594faf28bf83a997b6d080d90e01263deb69a2083517e6d18ababf9c1a8`。设计 §2（R1–R4 精确规则）、§3（归属）、§4（兼容/回归）、§5（R5 验证计划）、§6（R1–R5/O1–O7）是本标准的行为依据。
- **设计状态已收尾**：本角色写作时曾见文末「状态与下一步」段仍写 `status: draft`；项目管理已按授权收尾，当前文末写明「设计已获客户确认（status: accepted）；未实施、未测试、未验收」。旧 `a2e1109…` 版本已失效，本标准按当前 accepted 正文执行；判据不受该状态文字刷新影响。
- **标准定义时点晚于设计与实施启动**：设计已于 2026-10-22 获客户确认；本文件写作时 R1–R5 实施刚并行启动，候选未冻结。本文件是**补定判据**，不追认任何已实现部分，也不代表任何一项已经满足。
- **现场证据**：客户现场为 Pi + `deepseek-v4-flash[1m]` 的 Steward 会话；设计 §1.2 的只读代码事实（`events.ts:472-481` 读 `detail.text`/summary、`replay.ts` 用 summary 去重、`ChatRow` 只渲染 label+text、`app/desktop` 已有 `row.reasoning` 载体、Service 已单点投影）与本角色抽查一致。现场应用仍在运行，本任务不重启、不触碰 todo-demo。
- **角色独立**：本上下文只承担独立验收，只写 [boundary.md](../../boundary.md) Section 1 与任务精确范围共同覆盖的文件。不改产品代码、测试、断言、他人报告、权限或调度状态；不代跑全部测试、不派发、不把实施者自述当成观察结果；不提交 Git。

## 二、交付与范围

### 2.1 必需项 R1–R5 的具体交付物

验收对象是设计 §2/§5/§6.1 的 R1–R5。五项缺一不可；只交付其中几项不能记完成。

| 编号 | 所有者 | 主要落点 | 验收时要看到什么 |
| --- | --- | --- | --- |
| **R1** | 桌面UI | `app/renderer/src/chat/events.ts`（`describeEvent` 的 `source==="reasoning"` 分支） | 正文唯一来源是投影形 `detail.reasoning.text.text`（`DisplayTextV1`）；不读 `detail.text`；`summary` 不作正文；`status`/`durationMs` 透传；`turnId` 先取 `event.turnId`、缺省取 `detail.turnId`；`reasoning.text` 为原始字符串/结构损坏/`status` 非 complete/omitted ⇒ fail-closed 诊断系统行，不显示未投影文本 |
| **R2** | 桌面UI | 桌面UI 内单一文案函数（`events.ts`/`reasoning.ts`/`types.ts` 之一）＋`ChatRow.tsx` | complete 有真实时长「已思考 N 秒」（`N=max(1,round(ms/1000))`）；无信号「已思考」；omitted「已思考（内容由平台省略）」；合并部分省略「…（部分内容由平台省略）」；非法时长不显示秒；`ChatRow` 只取用单一函数，兜底常量同源、无第二份文案 |
| **R3** | 桌面UI | `app/renderer/src/chat/chat-store.ts`、`replay.ts`、`events.ts`（`historyRowToDescriptor`） | 同一 `turnId` 恰一个 reasoning 行；正文按到达序 `\n\n` 拼接；状态/时长合并规则；piece 指纹幂等；插入位置确定（回合内、终态之前、不移动其他行）；实时去重豁免 reasoning；实时/回放/全量重建同一映射与合并规则；无 `turnId` 保守不合并 |
| **R4** | 桌面UI | `ChatRow.tsx`（`.reasoning-note` 等）、`events.ts` 诊断分支 | omitted 不渲染 `<pre>`，正文区显示「平台省略了思考正文，无法显示具体内容。」，标题带「（内容由平台省略）」；complete 空正文显示「没有可显示的思考正文。」；`reasoning-diagnostic` 沿用既有系统诊断行；不伪造正文/时长/摘要 |
| **R5** | 桌面UI（测试角色复核） | `test/桌面UI/reasoning-view.test.ts`（新增）、`test/桌面UI/reasoning-electron-smoke.mjs`＋受控 preload（新增）、typecheck/build | 纯逻辑单测覆盖设计 §5.1；Electron 离线 e2e 覆盖 §5.2；`npm run typecheck`、`npm run typecheck:renderer` 0 错；`npm run build:renderer` 成功；真实 Pi wire 样本（§5.4）区分「有正文」vs「平台省略」 |

### 2.2 明确排除的可选项 O1–O7

以下均**未获授权**，本轮不得实施，也不作为通过条件；若候选里出现相关改动，按范围越权处理（见 §六）。

| 编号 | 被排除的内容 | 范围核对例子 |
| --- | --- | --- |
| O1 | 默认展开思考行或记住展开状态 | 默认折叠必须保持；不得自动置 `open`；不得持久化展开状态；手动开合沿用 `detailsOpen` |
| O2 | 复制思考正文按钮 | 不新增复制按钮/剪贴板接线 |
| O3 | 显示思考 token/字符数 | 不新增计数展示或字段 |
| O4 | 流式展示思考过程（增量） | Pi 仍在 `message_end` 产事实；不新增增量渲染/流式协议 |
| O5 | 额外显示 truncated/redacted 标记 | 正文只显示核心投影后的文本；不新增二次标记 |
| O6 | 跨回合思考汇总/统计 | 不新增跨回合统计/汇总视图 |
| O7 | 每条 assistant 消息单独折叠 | 必须按 `turnId` 回合级归组，不得退回每条 assistant 一行 |

### 2.3 必须保持不变的部分

1. **不改 runtime core / Provider / 适配器 / 桌面窗口 / 持久化**：`src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/tool-display.ts`、`src/common/pi-adapter/real-adapter.ts`、Claude/Codex 适配器、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、`.ans/sessions` 持久化 schema、IPC/preload/main、`package.json`/锁文件/构建配置零 diff。若实施中发现回放载体在某路径缺失，由**桌面窗口**在其 Section 1 内做最小透传修复，须另行授权并在候选归属中单列；不得由桌面UI 越界修改。
2. **默认折叠**：reasoning 行到达即折叠；无自动展开、无记忆展开状态；手动开合沿用既有 `detailsOpen`，合并时不丢失。
3. **其他来源与行不受影响**：delivery / prompt-input / system / reasoning-diagnostic / tool-lifecycle / denied / turn-terminal / assistant 文本行的映射、样式与相对顺序不变；reasoning 不伪装成 assistant 正文，不进入 assistant 反馈镜像。
4. **既有测试与接口**：`test/桌面UI/event-routing.test.ts`、`replay.test.ts`、`history-dedupe.test.ts`、`row-model.test.ts` 及 Phase 3B/4A/4B/5B 冒烟保持通过；`test/桌面应用/multi-runtime.test.ts` 的 `row.reasoning` 载体断言保持有效；不改旧断言、不删用例、不 skip 以促成通过。
5. **安全与转义**：渲染层只显示核心投影后的 `DisplayTextV1.text`，原始字符串一律 fail-closed；React 文本节点/既有 esc 语义保持，不以 `innerHTML` 注入正文；零 console 错误/CSP 违规。

### 2.4 本轮不判、不能冒充的证据边界

| 项 | 本轮是否判 | 说明 |
| --- | --- | --- |
| 真机重建/重启后的 UI 实看 | **不判（若实施后另行安排）** | 当前应用不重启、现场保留；修复在下一构建生效。若客户/统筹另行安排新构建真机实看，其结果单独记录，不并入本标准的离线通过结论 |
| 其他引擎的思考正文 | **不判** | Claude/Codex 的事实形状同形，渲染侧统一消费；其平台是否实际提供正文/省略不在本轮验证范围 |
| 持久化 / 历史 schema | **不判** | 当前会话 `getSessionHistory` 0 行；本轮不承诺重启后回放；回放验收用脚本化/持久化会话载体，不改 `.ans/sessions` schema |
| O1–O7 | **不判** | 未授权、不实施；不因「顺手做了」算加分，实施即为范围越权 |
| 提交/推送/部署/发布/合并 | **不判** | 验收结论不授权任何对外操作 |

## 三、成功标准 S1–S12

每条都要有当前候选上的**可执行证据**（测试用例名、命令、退出码、原始输出/DOM 断言）；只有代码阅读或设计论证不算动态证据。

### S1 R1 正确读取投影正文

**必须观察到（对应设计 §2 R1、§5.1-1）**

1. `events.ts` 的 `source==="reasoning"` 分支从 `detail.reasoning.text.text` 取正文；不读 `detail.text`；`event.summary`（「已思考」）不作正文。
2. `status` 仅接受 `complete`/`omitted`；`durationMs` 透传真实有限非负值；`turnId` 先取 `event.turnId`、缺省取 `detail.turnId`。
3. `reasoning.text` 为**字符串**（未投影原始事实）或结构损坏、`status` 非法 ⇒ **fail-closed**：渲染诊断系统行「推理内容无法安全显示」，不显示该字符串；不崩溃。
4. 渲染侧行数据形状为 `{status, text, durationMs?, label}`（桌面UI 内部）；不把 `DisplayTextV1` 之外的原始载荷带进正文。

**判失败**：正文仍来自 `detail.text`/summary；原始字符串被显示；坏件崩溃或伪造正文；`turnId` 取错导致归组错位。

### S2 R2 时长与四态文案精确

**必须观察到（对应设计 §2 R2、§5.1-2）**

1. 单一文案函数（桌面UI 内唯一来源）按设计 §2 R2 产 label；`ChatRow` 只取用该函数，兜底常量与函数同源，无第二份文案实现。
2. 逐项文案：complete 4200ms →「已思考 4 秒」；complete 400ms/0ms →「已思考 1 秒」；complete 无时长 →「已思考」；omitted 无时长 →「已思考（内容由平台省略）」；omitted 8000ms →「已思考 8 秒（内容由平台省略）」；部分省略 →「…（部分内容由平台省略）」。
3. 非法时长（负数/NaN/Infinity/字符串/null）一律按无信号，不显示秒数；`N=max(1,round(ms/1000))`，不出现「已思考 0 秒」。
4. 合并行时长**仅当所有已收 piece 都带真实 `durationMs`** 时求和；任一段缺信号则不显示秒数（不显示部分和）。

**判失败**：文案与设计不一致；伪造时长/部分和；同一文案两份实现；`ChatRow` 自行拼文案。

### S3 R3 按 turnId 归组与正文合并

**必须观察到（对应设计 §2 R3、§5.1-5）**

1. 同一 `turnId` 只保留一个 reasoning 折叠行；第一个 piece 建行，后续原地合并，不新增行。
2. 正文按**到达序**以 `\n\n` 拼接；omitted piece 不贡献正文。
3. 状态合并：全部 omitted ⇒ `omitted`；只要一段 complete ⇒ `complete`，混合时 `partialOmitted` 标记；时长合并按 S2.4。
4. 每行维护 piece 指纹集合（`status|durationMs?|正文`）；同一 piece 实时重推、实时/历史各来一次、全量重建多次到达 ⇒ 不重复拼接、不重复计时；`detailsOpen` 等行字段合并时保留。
5. 已知限制如实记录：同回合两条完全相同的真实 piece 会被指纹合并为一条（不猜测、不伪造区分）。

**判失败**：同 turn 多行；正文乱序/漏段/重复；状态或时长合并错误；重复投递导致正文翻倍；合并丢失开合状态。

### S4 R3 确定性插入位置与终态顺序

**必须观察到（对应设计 §2 R3 位置表、§5.1-6）**

1. 到达时同回合已有 assistant / activities / tool-lifecycle / denied / turn-terminal ⇒ 新 reasoning 行插到该回合**第一条**此类行之前。
2. 同回合只有 user / delivery / injected / system 等非锚点行 ⇒ 插到该回合最后一条行之后。
3. 同回合还没有任何行（正常流式首条）⇒ 表尾追加（现状）。
4. reasoning 行**永远在该回合 `turn-terminal`（「会话结束」）之前**；不插进别的回合；不移动其他行；`operator`/judge 等锚点卡行不参与锚点集合、相对顺序不变；合并已有行不改变行位置。
5. 无 `turnId` 的坏件：不合并、不重排、不猜回合，按到达序独立成行（正文/省略照 S1/S2 如实显示）。

**判失败**：reasoning 行落在「会话结束」之后/错误回合；迟到 piece 把行移到别处或移动其他行；无 `turnId` 被强行合并/重排。

### S5 R3 实时去重、历史映射与全量回放同解

**必须观察到（对应设计 §2 R3 去重、§5.1-4/7、§5.2-3）**

1. `classifyLiveDuplicate` 将 `detail.source==="reasoning"` 豁免（与终态/工具身份同类），不再用 `turnId+summary` 吞掉同回合后续 piece；幂等交给 piece 指纹。
2. `historyProjectionKey`/`liveCoversHistoryRow` 不把 reasoning 纳入首行文本分组；`historyRowToDescriptor` 读到 `row.reasoning` 时映射为 `kind:"reasoning"`，与实时走同一提取器/合并器；`row.text`（「已思考」摘要）不作正文。
3. 全量回放重建时：历史 reasoning 行按同一规则建行/合并；实时侧保留下来的 reasoning 行按 `turnId` 合并进历史行（指纹幂等），无对应历史行时插到该回合终态行之前，**不得统一追加到表尾**。
4. `row.reasoning` 缺失（旧数据/坏件）⇒ 保持现有 assistant「已思考」文本行回落，不伪造 reasoning 行。

**判失败**：reasoning 被 summary 去重吞掉；实时与回放显示不同；历史多段被误删；全量重建后 reasoning 跑到表尾/「会话结束」之后；旧数据被伪造成 reasoning 行。

### S6 R4 省略、空正文、诊断与安全

**必须观察到（对应设计 §2 R4、§5.1-3、§5.2-2）**

1. `status:"omitted"`：正文区**不渲染 `<pre>`**，显示固定说明「平台省略了思考正文，无法显示具体内容。」（`.reasoning-note`）；折叠标题带「（内容由平台省略）」；带正文的违规 omitted 不显示正文。
2. complete 但正文为空：显示「没有可显示的思考正文。」，不留空白展开区。
3. `source==="reasoning-diagnostic"`：沿用既有系统诊断行（`summary || "推理内容无法安全显示"`），不改样式、不伪装成思考内容；投影坏件同此。
4. 任何情况下不伪造正文、不伪造时长、不把 summary/平台摘要冒充原文；正文经 React 文本节点/既有 esc 语义渲染，保持转义。
5. 安全：渲染层只显示核心投影后的 `DisplayTextV1.text`；原始字符串一律 fail-closed；不以 `innerHTML` 注入正文。

**判失败**：omitted 显示空白/再次「已思考」/伪造正文；空正文留空展开区；诊断行被改样式或伪装正文；出现 `innerHTML` 注入/原始未投影文本。

### S7 R5 纯逻辑单测

**必须观察到（对应设计 §5.1）**

1. `test/桌面UI/reasoning-view.test.ts` 实际存在并运行；覆盖：映射（投影正文/非 summary/turnId 回落）、文案四态与非法时长、省略/坏件/原始字符串、历史映射（`row.reasoning`/缺失回落/坏载体）、合并（顺序/状态/时长/幂等/`detailsOpen`）、插入顺序（锚点/非锚点/终态之前/无 turnId）、去重（reasoning 豁免、其他类型不变）。
2. 断言指向**实际行为/输出**，不是只读源码/镜像实现；既有断言不删除、不放宽。
3. 测试命令、退出码、原始输出可核对；0 fail、0 skip（若有既有 skip，需逐条说明与本变更无关）。

**判失败**：无单测或只读源码；关键分支（正文映射/归组/插入/省略/去重）无实际断言；测试被 skip/删除/放宽。

### S8 R5 Electron 离线 e2e

**必须观察到（对应设计 §5.2）**

1. `test/桌面UI/reasoning-electron-smoke.mjs`＋受控 preload 实际运行；入口为构建后的 `app/renderer/dist/index.html`（`npm run build:renderer` 产物）。
2. 实时：user → 两条同 turn reasoning（正文 A/B、真实时长）→ assistant → settled；断言恰一个 `.reasoning-row`、标题「已思考 N 秒」、展开正文 `A\n\nB`、行在 assistant/`.turn-terminal` 之前。
3. 省略：omitted ⇒ 标题带「（内容由平台省略）」、展开说明文本、无 `<pre>` 假正文、无空白。
4. 回放：`session:history` 推入带 `row.reasoning` 的行 ⇒ 同一行结构与文案；再推同一 piece 实时事件 ⇒ 不重复、正文不翻倍；历史缺载体 ⇒ assistant「已思考」文本行原样。
5. 坏件/无 turnId：坏载荷落诊断系统行；两条无 turnId reasoning 各成一行、不合并、顺序按到达。
6. 回归：delivery/system/tool-lifecycle/turn-terminal 行结构与相对顺序不变；零 console 错误/CSP 违规；DOM 断言输出与截图写入证据目录。

**判失败**：只有单测/代码阅读；e2e 未运行或用未构建的旧 dist；实时/回放不一致；省略出现空白/假正文；顺序断言缺失；有 console/CSP 错误未处理。

### S9 R5 typecheck 与构建

**必须观察到（对应设计 §5.5）**

1. 同一候选上 `npm run typecheck` exit 0。
2. 同一候选上 `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`）exit 0。
3. 同一候选上 `npm run build:renderer` 成功；e2e 使用该构建产物；记录构建/候选身份。

**判失败**：任一 typecheck 非 0；build 失败；e2e 未使用构建产物；用旧构建输出充数。

### S10 真实 Pi wire 样本与「有正文 vs 平台省略」

**必须观察到（对应设计 §5.4）**

1. 测试角色（或实施前只读探针）提供一条**真实 Pi 会话**的 reasoning 事件样本（脱敏），记录 `detail.reasoning.text.text` 实际值、`status`、`durationMs`（如有）、`turnId`，并注明采集时间/构建/运行时。
2. 结论明确区分三种情形：①正文非空 ⇒ R1 修复显示正文；②正文为空且 `status:"omitted"` ⇒ R4 的省略说明就是正确结果、不改适配器；③怀疑适配器丢了 SDK 已给正文 ⇒ **停止本方案实施，另立 Pi 适配器调查**，不夹带修改。
3. 样本不足/缺失时，**不能**把「真实 Pi 是否有正文」写成已确认；离线渲染测试的通过不等于真实 Pi 行为通过。

**判失败**：无样本却声称真实 Pi 正文可见/省略；样本与实现前提矛盾仍继续按 R1 交付；用脚本化事件冒充真实 Pi 样本。

### S11 其他来源、工具行与既有测试零回归

**必须观察到（对应设计 §4.3/§4.4/§4.10）**

1. delivery/prompt-input/system/reasoning-diagnostic/tool-lifecycle/denied/turn-terminal/assistant 映射、样式与相对顺序不变；reasoning 不进入 assistant 正文/反馈镜像。
2. `test/桌面UI/event-routing.test.ts`、`replay.test.ts`、`history-dedupe.test.ts`、`row-model.test.ts` 保持通过；Phase 3B/4A/4B/5B 冒烟保持通过；`test/桌面应用/multi-runtime.test.ts` 的 `row.reasoning` 载体断言保持有效。
3. 既有测试计数不减少、不出现为促成通过的 skip/删除/放宽；全量或目标套件的新增失败不得归为既有基线红。

**判失败**：其他来源/工具行顺序或样式变化；既有桌面UI/载体测试红或 skip；reasoning 被伪装成 assistant；新失败被归为基线红。

### S12 默认折叠与 O1–O7 未实施

**必须观察到**

1. reasoning 行默认折叠；无自动展开、无展开状态持久化；合并时 `detailsOpen` 保留（手动开合）。
2. 未新增复制按钮、token/字符统计、流式增量、truncated/redacted 额外标记、跨回合统计、每条 assistant 单独折叠（O1–O7 均未实施）。
3. `ChatRow` 的兜底标签只作旧行兜底，不与单一文案函数形成第二份实现。

**判失败**：默认展开/记忆展开；任一 O 被实施；出现第二份文案/展开状态存储。

## 四、失败与边界标准 F1–F12

> 本文件的 F 编号只用于本标准；设计 §5 的编号另有含义；仓库既有「F4 写前拦截」等名称与本文件无关。

### F1 空正文 / redacted / truncated

正文已由核心投影完成脱敏与预算；渲染层只显示 `DisplayTextV1.text`，不二次处理、不额外拼接标记。complete 空正文显示「没有可显示的思考正文。」；redacted 文本由核心替换；truncated 只影响正文长度，不改变行结构。不得把空串显示为空白展开区，不得二次脱敏/截断。

### F2 省略与混合省略

`status:"omitted"` 一律不呈现正文，显示固定省略说明；标题带「（内容由平台省略）」。合并后全部 omitted ⇒ omitted；部分 omitted ⇒ complete + 「（部分内容由平台省略）」，可见正文＋「平台省略了部分思考正文。」。不得把省略显示成空白、再次「已思考」或伪造正文。

### F3 非法时长

负数、NaN、Infinity、字符串、null、缺失一律按无信号处理，不显示秒数；不得显示「已思考 0 秒」或部分和；合并时长只在所有 piece 都有真实信号时求和。

### F4 坏件 / 未投影原始事实 fail-closed

`detail.reasoning.text` 为字符串、缺少 `textHolder.text`、`status` 非法、载荷损坏 ⇒ 诊断系统行「推理内容无法安全显示」；不显示原始字符串、不用 summary 冒充、不崩溃。`reasoning-diagnostic` 沿用既有系统诊断行。

### F5 重复投递与幂等

同一 piece 经实时重推、实时/历史各一次、全量重建多次到达 ⇒ 正文不重复、时长不重复累计；piece 指纹命中即忽略；已知限制：同回合两条完全相同真实 piece 合并为一条（如实记录，不猜测）。不得用 summary 去重吞掉 reasoning。

### F6 会话结束顺序与回合归属

reasoning 行始终在该回合 `turn-terminal` 之前；不插进别的回合；全量重建后不统一追加到表尾；不移动其他行；`operator`/judge 锚点卡相对顺序不变；迟到 piece 合并后不移动行位置。

### F7 其他来源与工具行不受影响

delivery/prompt-input/system/reasoning-diagnostic/tool-lifecycle/denied/turn-terminal/assistant 映射、样式、相对顺序不变；工具组/工具相位合并/连续工具组/`activityGroupByRole` 不受影响；reasoning 不进入 assistant 正文与反馈镜像。

### F8 无 turnId 保守处理

无 `turnId` 的 reasoning piece 不合并、不重排、不猜回合；每条按到达序独立成行，正文/省略照 R1/R2 如实显示；宁可多一行，不把事实挂到错误回合。

### F9 零 diff 面

`src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/tool-display.ts`、`src/common/pi-adapter/real-adapter.ts`、Claude/Codex 适配器、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、`.ans/sessions` schema、IPC/preload/main、`package.json`/锁文件/构建配置零 diff。若确需桌面窗口最小透传修复，须另行授权并在候选归属中单列；不得由桌面UI 越界修改或顺手扩范围。

### F10 默认折叠 / 无 O1

reasoning 行到达即折叠；无自动展开、无记忆展开状态；手动开合沿用 `detailsOpen`；合并不丢失开合状态。若出现默认展开/展开状态持久化，按 O1 越权处理。

### F11 安全 / 转义 / CSP

渲染层只显示核心投影后的 `DisplayTextV1.text`；原始字符串 fail-closed；React 文本节点/既有 esc 语义保持；不以 `innerHTML` 注入正文；e2e 零 console 错误/CSP 违规；不新增 IPC/schema/网络访问。

### F12 测试完整性

R5 新增测试必须实际运行；不得删除、skip、放宽既有断言；不得用只读源码断言冒充 DOM/e2e 行为；e2e 必须用构建后的 `dist/index.html`；测试计数减少或关键分支无断言按返工/证据不足处理。

## 五、必需证据 E1–E8

实施与测试角色交付时必须提供下列证据；不接受「已完成」「已测」这类自述。每条证据都要绑定**同一候选**（E6）。

| 编号 | 证据 | 通过条件 |
| --- | --- | --- |
| **E1** | **设计与变更记录** | 设计 `status: accepted`、`revision: 1`、SHA-256 `e02c9594…` 被引用；桌面UI 实施变更记录存在（实际文件名以真实路径为准），写明用户可见入口、实际代码位置、验证命令与结果、未验证项；若含桌面窗口最小透传修复，须另附其授权与变更记录；状态与实际相符 |
| **E2** | **实际测试命令与原始输出** | 列出每条关键标准的命令、工作目录、环境（OS/架构、Node/npm、Electron 版本）、退出码与原始 stdout/stderr；纯逻辑单测、Electron e2e、typecheck、build 分别记录；不接受只有自述、截图或计划 |
| **E3** | **纯逻辑单测** | `test/桌面UI/reasoning-view.test.ts` 实际运行，覆盖设计 §5.1 的映射/文案/省略/坏件/历史映射/合并/插入/去重；记录 tests/pass/fail/skip 与用例映射；0 fail、0 skip（既有 skip 需说明与本次无关） |
| **E4** | **Electron 离线 e2e** | `test/桌面UI/reasoning-electron-smoke.mjs`＋受控 preload 实际运行；实时/省略/回放/坏件/无 turnId/回归六类断言；DOM 断言输出、截图路径、零 console/CSP 错误；入口为构建后 `dist/index.html`；区分「离线 e2e」与「真机」 |
| **E5** | **typecheck 与构建** | 同一候选 `npm run typecheck` exit 0、`npm run typecheck:renderer` exit 0、`npm run build:renderer` 成功；附原始输出尾部与构建产物时间/摘要 |
| **E6** | **候选与归属** | `git rev-parse HEAD` 完整 SHA；`git status --porcelain`（`core.quotepath=false`）完整清单（修改/新增/删除/未跟踪，未跟踪文件附哈希）；逐文件归属到 R1–R5 与各角色 Section 1；`app/renderer/` 与 `test/桌面UI/` 归属桌面UI；`app/desktop/` 等零 diff 面；此前守卫/尾连字符/后台任务等在途改动分开列明；候选冻结时点 |
| **E7** | **真实 Pi wire 样本与边界** | 一条真实 Pi 会话 reasoning 样本（脱敏）记录 `detail.reasoning.text.text`/`status`/`durationMs`/`turnId`/采集环境；明确「有正文」「平台省略」「疑似适配器丢失」三态；样本缺失 → 该项证据不足；真机重建/重启 UI 实看若另行安排，单独记录、不并入离线通过 |
| **E8** | **零回归与基线红** | 既有桌面UI 测试（`event-routing`/`replay`/`history-dedupe`/`row-model`）与 Phase 3B/4A/4B/5B 冒烟、`test/桌面应用/multi-runtime.test.ts` 实际运行；记录计数与失败清单；其他来源/工具行/turn-terminal 不受影响；若跑全量，既有环境红（如 Windows symlink EPERM）逐条指名，不得把本改动引入的失败归为基线红；不声称全绿 |

## 六、判定规则

### 6.1 三种结论

| 结论 | 条件 | 后续 |
| --- | --- | --- |
| **通过（pass）** | R1–R5 交付齐全且归属正确；S1–S12、F1–F12 全部满足；E1–E8 完整且绑定当前候选；无未解决失败；O1–O7 未实施；无断言被删除/放宽、无测试被 skip 以促成通过；文档与实际行为一致；真实 Pi 样本已区分「有正文/省略」 | 交可信启动端/统筹记录该阶段完成。通过只覆盖「当前候选 × 实际记录平台」的离线渲染与 e2e 范围，不授权提交/推送/部署/发布/合并，不替代真机阶段 |
| **返工（needs-work）** | 已有证据表明不满足标准：例如展开仍显示 summary/「已思考」；omitted 空白/再显「已思考」/伪造正文；同一 turn 多行或落在「会话结束」之后；实时/回放不一致；坏件显示原始字符串；伪造时长；默认展开；其他来源/工具行被改；runtime core/Pi/桌面窗口/持久化越界改动；typecheck/build 失败；断言被放宽/删除/skip；O1–O7 被实施 | 验收报告列出条目、原始证据、差异与应回到的所有者（桌面UI / 桌面窗口若涉透传 / 测试角色），由可信启动端安排修复与复测，保留原失败记录 |
| **证据不足（missing-evidence）** | 无法判断：测试未实际运行或只给自述/截图；缺少命令、退出码或原始输出；Electron e2e 未跑或只用旧 dist；真实 Pi 样本缺失；关键场景只有代码阅读；候选与当前工作树不符；E1–E8 任一必需项缺失；环境未记录；基线红无法区分；候选未冻结或 R1–R5 未全部交付 | 写明缺什么、由谁补、补证后重判；**不能记通过**，也不能把「没有证明失败」当成通过 |

### 6.2 必须判「证据不足」的情形（不穷举）

1. 声称测试通过但没有实际运行记录、退出码或原始输出。
2. 测试输出对应的候选与当前工作树不一致（HEAD、工作树清单或未跟踪文件哈希不符）。
3. 关键标准只有代码阅读/设计论证，没有动态证据（尤其 S1 的正文来源、S3/S4 的归组/顺序、S6 的省略、S5 的实时/回放同解）。
4. `npm run typecheck`/`typecheck:renderer` 未在同一候选运行，或只提供定向结果。
5. Electron e2e 未运行，或未使用 `npm run build:renderer` 的当前构建产物。
6. 真实 Pi wire 样本缺失，或无法区分「有正文/平台省略/疑似适配器丢失」。
7. 环境/Electron/Node 版本未记录，或只提供其他平台证据却宣称本平台行为。
8. 改动归属清单缺失，无法判断 R1–R5 与此前在途任务的边界。

### 6.3 证据失效与不降低标准

- 产品代码、测试、断言、配置或依赖在证据生成后变化 → 受影响证据失效，需在新候选上重跑受影响门；不能拼接不同候选的输出。
- 同一候选同一范围已有有效结论可复用；设计/标准实质修订后，按原确认流程更新并重判受影响项。
- 验收不为了通过而放宽标准：不接受自述代替原始输出、代码阅读代替 DOM/e2e 行为、单测代替 Electron e2e、旧 dist 代替当前构建、脚本化事件冒充真实 Pi 样本、离线结果冒充真机。
- 验收报告至少包含：任务/阶段、设计与本标准版本（含设计 SHA-256）、候选身份、实际改动范围与归属、逐条 S/F 结论、原始证据链接、剩余问题与理由。
- **验收通过不授予提交、推送、部署、发布或合并权限**；发布决定属客户。

## 七、未判范围与未决问题

### 7.1 本轮不判

1. **真机重建/重启后的 UI 实看**：当前应用不重启、现场保留；修复在下一构建生效。若客户/统筹另行安排新构建真机实看，单独记录，不并入本标准的离线通过结论。
2. **其他引擎的思考正文**：Claude/Codex 是否实际提供正文/省略未判；渲染侧只按同形事实消费。
3. **持久化 / 历史 schema**：当前会话 `getSessionHistory` 0 行；不承诺重启后回放；不改 `.ans/sessions`。
4. **O1–O7**：未授权、不判；若发现实施，按范围越权交回。
5. **提交/推送/部署/发布/合并**：不判、不授权。

### 7.2 未决与需交接确认

1. **候选尚未冻结**：写作时 R1–R5 实施刚并行启动；验收前必须由可信启动端给出候选冻结时点与改动归属清单（E6），否则只能判证据不足。
2. **真实 Pi 样本时点**：设计 §5.4 要求实施前样本；实施已并行启动。样本可稍后补，但必须作为 E7 证据；若样本显示适配器丢失 SDK 正文，按设计停止本方案并另立 Pi 任务，不能把 R1–R5 验收为「已修复真实问题」。
3. **桌面窗口最小透传修复**：设计称 `app/desktop` 载体已就位、不需要改；若实施发现某路径缺失，须由桌面窗口在其 Section 1 内另行授权修复，并在 E6 单列，不得由桌面UI 越界修改。
4. **回放验收载体**：当前会话历史 0 行；回放验收使用脚本化/持久化会话（design §4.2/§5.2），不得把「实时可用」冒充「回放可用」。
5. **文案口径**：设计冻结无时长文案为「已思考」（沿客户当前界面），旧 G-5 G1 的「推理内容」不再使用；若 su/客户要改回，需在设计审核时明确，本标准按设计现行文字判定。

## 八、标准状态与后续

- 本文件是**验收标准（version A1，status: ready）**，不是实施、测试、验收报告或发布记录。截至写作时，R1–R5 实施刚并行启动、候选未冻结；本文件不对任何候选给出通过/返工/证据不足结论。
- 交付方按 §五 提交证据后，本角色将在自身 `docs/change/` 撰写独立验收报告，逐条对照 S1–S12、F1–F12 与 E1–E8，附原始证据链接和候选摘要；结论只写通过、返工或证据不足三态之一（可分项）。
- 标准若因授权、设计/候选变化需要修订，先记录依据并按原确认流程处理；实施后不得为了通过而放宽本文件。
- 验收通过不授予提交、推送、部署、发布或合并权限。

## 九、相关链接

- 设计（项目管理）：[修复思考行显示——展开可见正文、按回合归组、平台省略如实说明](../../../项目管理/docs/design/2026-10-22_design_reasoning-display-fix.md)
- 运行时契约与既有投影：[runtime.ts](../../../../src/model/runtime.ts)、[tool-display.ts](../../../../src/common/runtime-core/tool-display.ts)、[session.ts](../../../../src/service/runtime/session.ts)
- 桌面UI 边界：[boundary.md](../../boundary.md)
- 旧 G-5 桌面验收口径（退役参考，不改写）：[g-desktop.test.ts.retired](../../../../test/测试/retired-5b/g-desktop.test.ts.retired)
- 本角色上一轮思考等级轻量兼容标准（可作为跨轮参考）：[R2 标准](2026-10-21_design_reasoning-light-criteria.md)
