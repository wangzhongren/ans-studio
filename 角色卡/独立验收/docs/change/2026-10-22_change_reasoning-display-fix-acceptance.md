---
id: change-reasoning-display-fix-acceptance
type: change
title: 思考行显示修复 R1–R5 独立验收——通过（受限）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified
related: [reasoning-display-fix, reasoning-display-fix-acceptance, desktopui-reasoning-display-fix, reasoning-wire-sample, reasoning-effort-lightweight-repairs, ui-platform-round]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 按 A1 对判定时候选 HEAD 4d944e75+工作树逐条判定；判定期间该工作树被提交为 6e51589（父 4d944e75，内容一致，仅 Git autocrlf 归一化）；R1–R5、S1–S12、F1–F12、E1–E8 满足（S11/E8 受限：既有 Phase4A/5A 焦点/时序冒烟在离屏环境失败，非本变更路径、不计为通过）；独立复跑 reasoning-view 15/15、桌面UI 162/162、桌面应用 506/506、双 typecheck 0、Electron e2e 14/14（截图与角色证据逐字节一致）、Phase3B/4B 通过；真实 Pi 样本 3 个 complete 正文 335/1403/1153；真机重建/重启 UI、持久化、其他引擎、O1–O7 未判
---

# 思考行显示修复 R1–R5 独立验收：通过（受限）

**标准**：[思考行显示修复 R1–R5 独立验收标准 A1](../design/2026-10-22_design_reasoning-display-fix-acceptance.md)，version A1、`status: ready`，SHA-256 `8c390270acc421a209d876f858b8b6fb547e3658d5b66bef1881427ea6c19edc`。本报告按该文件的 S1–S12、F1–F12、E1–E8 逐条判断，不另造标准。

**设计**：[修复思考行显示——展开可见正文、按回合归组、平台省略如实说明](../../../项目管理/docs/design/2026-10-22_design_reasoning-display-fix.md)，`status: accepted`、`revision: 1`，SHA-256 `e02c9594faf28bf83a997b6d080d90e01263deb69a2083517e6d18ababf9c1a8`；客户 2026-10-22 确认 R1–R5 实施、O1–O7 均不选。设计文末已按授权收尾为「设计已获客户确认；未实施、未测试、未验收」。

**候选**：判定开始时为 HEAD `4d944e7587f10be29b6356c42539e06219ed88fc` + 未提交工作树；本角色现场捕获 `git status --porcelain`（`core.quotepath=false`）97 行。判定期间该工作树被提交为 `6e515893c403a2ec3e1eabb87efb057846781bcd`（父 `4d944e75`，分支 `feat/background-tasks-governance-and-reasoning`）；本角色复核提交前后产品/测试文件的磁盘 SHA-256 与判定时一致，`git show` 的差异仅为 `core.autocrlf=true` 的 LF 归一化（`tr -d '\r'` 后逐文件相等）。当前工作树干净，仅剩本角色验收文件。环境：Windows 11 Pro 10.0.26300、Git Bash、Node v24.22.1、npm 11.19.1、Electron（项目本地）。

**总体结论：通过（pass，受限）**——R1–R5 交付齐全且归属正确；S1–S12、F1–F12、E1–E8 满足（S11/E8 受限，见 §六）；本角色独立复跑关键套件与 Electron e2e 全部通过，e2e 报告与角色证据**逐字节一致**；真实 Pi wire 样本 3 个成功样本均为 `status:"complete"`、正文 335/1403/1153 字符、`truncated:false`/`redacted:false`，R4 的 omitted 场景由 e2e 夹具覆盖。**受限范围**：真机重建/重启后的 UI 实看未做（当前应用仍是旧页面；新 dist 已在磁盘）；会话历史持久化 0 行，回放证据为脚本化历史；既有 Phase4A/5A 冒烟的焦点/时序检查在本角色离屏/后台验收运行中失败（非本变更路径，不计为通过）；O1–O7 未实施。**不能据此声称「真机通过」或「既有全部冒烟零回归」。**

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色未修改产品代码、测试、断言、他人报告、权限或调度状态，未提交 Git；判定期间候选产品/测试文件未改动（仅新增本报告与角色导航）。

## 一、候选身份与证据绑定

### 1.1 候选与归属

| 项 | 值 | 核对结果 |
| --- | --- | --- |
| HEAD | 判定开始 `4d944e7587f10be29b6356c42539e06219ed88fc`；期间工作树被提交为 `6e515893c403a2ec3e1eabb87efb057846781bcd`（父 `4d944e75`，分支 `feat/background-tasks-governance-and-reasoning`） | 提交内容与判定时工作树一致（on-disk 哈希见 §1.2；提交 blob 仅 LF 归一化） |
| 工作树 | 判定开始 `git status --porcelain`（`core.quotepath=false`）97 行；提交后当前仅本角色 `feature-map.md`/`memo.md` 修改 + 本报告 untracked | 桌面UI 改动落在 `app/renderer/` 与 `test/桌面UI/`；此前守卫/尾连字符/后台任务改动随提交进入 HEAD，按各自变更记录分开归属 |
| 桌面UI 改动 | `app/renderer/src/chat/reasoning.ts`（新）、`events.ts`、`chat-store.ts`、`replay.ts`、`ChatRow.tsx`、`app/renderer/src/shell/shell.css`；`test/桌面UI/reasoning-view.test.ts`、`reasoning-electron-smoke.mjs`、`reasoning-smoke-preload.cjs`（新）；`角色卡/桌面UI/api-spec.md`、`feature-map.md`、`memo.md`、变更记录/证据 | 均在桌面UI `boundary.md` Section 1 的 `app/renderer/`、`test/桌面UI/` 与角色文档内 |
| 运行核心/Pi/桌面窗口/持久化 | `src/model/runtime.ts`、`src/service/runtime/session.ts` 等改动属此前守卫/尾连字符/后台任务（随本次快照提交进入 HEAD）；`src/common/pi-adapter/real-adapter.ts`、`app/desktop/`、`app/main.ts`、`app/preload.cjs`、`package.json` 无桌面UI 改动 | 未发现 R1–R5 越界修改；此前改动按各自记录归属 |
| 构建产物 | `app/renderer/dist/index.html`（`d9b885ca…`）、`assets/index-D7yxIV_U.js`（`393f23e0…`）、`assets/index-s5ZMUClC.css`（`42af9c83…`）；gitignored | 与桌面UI 变更记录一致；独立 e2e 使用该入口 |

### 1.2 关键文件摘要（本角色独立计算）

```text
756fe0c61aaf583ac8199677cfe47aed2d6a044a1983dff78aaa83faa7366d4a  app/renderer/src/chat/reasoning.ts
25978c691fcb7ad40fdecf356766256f23c13b5d1ccf827698fdd3461d1c2231  app/renderer/src/chat/events.ts
3fe5b2623e4123589ad3a474a328b1358c3ae812130d633e9550d9b6afc26ddc  app/renderer/src/chat/chat-store.ts
106ba332bb870e2d4ece001d854aaf075cdf9e1d92ae02abc32259b947d0588b  app/renderer/src/chat/replay.ts
4f90bd236405121885d9ee83002d3fcf2ccb31e18b1186bff52c0e8606b33ac6  app/renderer/src/chat/ChatRow.tsx
f8870503cfc5aa47d64a4262262bc524e7fcdd8c396e20da570c7f8cbcbf17e9  app/renderer/src/shell/shell.css
77c8e2c14915886b5b9fa5f26f4c190c2a1884426d0d7af621f69949a76e0af8  test/桌面UI/reasoning-view.test.ts
a632b83c4d9a5819bc512c8f57f1a193d87346526f81b3bdd28fe08b9c8a9e14  test/桌面UI/reasoning-electron-smoke.mjs
6828670da5586b44b34bcc30bbbb2780aa9700ea9cf9c49df033b2f60efa3704  test/桌面UI/reasoning-smoke-preload.cjs
e02c9594faf28bf83a997b6d080d90e01263deb69a2083517e6d18ababf9c1a8  角色卡/项目管理/docs/design/2026-10-22_design_reasoning-display-fix.md
```

> 说明：上表为**判定时工作树磁盘字节**的 SHA-256。判定期间工作树被提交为 `6e51589`；`git show HEAD:<path>` 的 blob 与磁盘版本行尾不同（`core.autocrlf=true` 的 LF 归一化）。本角色对 `events.ts`/`chat-store.ts`/`replay.ts`/`ChatRow.tsx`/`shell.css` 做 `tr -d '\r'` 后逐文件与提交 blob 相等，其余文件（reasoning.ts、测试、设计、记录）哈希直接相等。故提交是**同一内容的快照**，证据绑定不变。

### 1.3 证据来源与版本

| 来源 | 版本 / 摘要 | 本角色核对方式 |
| --- | --- | --- |
| A1 标准 | `8c390270…` | 逐条对照；判据未修订 |
| 项目管理设计 | `e02c9594…`、accepted、revision 1 | 复算一致；§2 R1–R4、§3 归属、§4 兼容、§5 R5、§6 O1–O7 逐节对照 |
| 桌面UI 变更记录 | `ed705769…`、implemented-unverified | 逐节阅读；改点、命令、未验证项与事实相符 |
| 真实 Pi wire 样本 | `69aa48a9…`、sampled | 读取报告与 `reasoning-sample-final.json`；原始/投影两形、status/长度/truncated/redacted 核对 |
| Electron e2e 证据 | `report.json` `af2ffaa4…` + 4 张 PNG | 逐 check 读取；本角色独立复跑并与角色证据比对 |
| 旧 G-5 桌面口径 | `test/测试/retired-5b/g-desktop.test.ts.retired` | 只读参考，确认「四态文案/默认折叠/实时回放同入口」沿革；不改历史 |
| 本角色独立复跑 | 单测/双 typecheck/Electron e2e/Phase 冒烟 | §五 E2–E8，全部绑定本候选 |

## 二、交付与范围核对

### 2.1 R1–R5 交付物

| 编号 | 实际落点与行为 | 结论 |
| --- | --- | --- |
| **R1** | `reasoning.ts::reasoningPieceFromDetail/FromCarrier` 只读投影形 `detail.reasoning.text.text`（`reasoning.text.text`）；`events.ts::describeEvent` 不再读 `detail.text`/summary，坏件落 `系统` 诊断行「推理内容无法安全显示」；`turnId` 缺省回退 `detail.turnId`；`historyRowToDescriptor` 消费 `row.reasoning` 并与实时同一提取器，缺失保持 assistant 回落、坏载体落诊断行 | 满足 |
| **R2** | `reasoning.ts::reasoningLabel` 单一文案来源：complete 有真实时长「已思考 N 秒」（四舍五入、下限 1）；无信号「已思考」；omitted「…（内容由平台省略）」；部分省略「…（部分内容由平台省略）」；非法时长忽略；合并时长仅在全部 piece 有真实信号时求和；`ChatRow` 只取 `data.label`，兜底常量同源 | 满足 |
| **R3** | `chat-store.ts::appendReasoningDescriptor` 同一 `turnId` 只保留一行，后续 piece 原地合并（`pieces`/指纹/`detailsOpen` 保留）；正文按到达序 `\n\n`；状态/时长合并；`reasoningInsertIndex` 确定性落位（本回合首个 assistant/activities/tool-lifecycle/denied/turn-terminal 之前，否则最后一条之后，否则表尾）；无 `turnId` 不合并/不重排；`replay.ts::classifyLiveDuplicate` 对 reasoning 豁免 summary 去重；全量重建按 turnId 与历史归并，无历史行插回终态之前 | 满足 |
| **R4** | `ChatRow.tsx::ReasoningRow`：omitted 不渲染 `<pre>`、显示「平台省略了思考正文，无法显示具体内容。」、标题带「（内容由平台省略）」；complete 空正文显示「没有可显示的思考正文。」；部分省略补说明；`reasoning-diagnostic` 沿用系统诊断行；不伪造正文/时长/摘要 | 满足 |
| **R5** | `test/桌面UI/reasoning-view.test.ts` 15 例、`test/桌面UI/*.test.ts` 162/162；Electron 离线 e2e 14 checks/0 failures、4 张截图；`npm run typecheck`/`typecheck:renderer` 0、`build:renderer` 成功；真实 Pi wire 样本 3 个 complete 正文 335/1403/1153 | 满足（限制见 §六） |

### 2.2 O1–O7 排除核对

| 编号 | 核对结果 |
| --- | --- |
| O1 | 默认折叠保持；未发现自动置 `open`/展开状态持久化；`detailsOpen` 只随手动开合保留 |
| O2 | 未新增复制按钮/剪贴板接线 |
| O3 | 未新增 token/字符计数展示或字段 |
| O4 | 未新增流式增量/增量协议；仍消费 `message_end` 后的事实 |
| O5 | 未新增 truncated/redacted 额外标记；正文只显示核心投影文本 |
| O6 | 未新增跨回合汇总/统计 |
| O7 | 按 `turnId` 回合级归组；未退回每条 assistant 消息一行 |

### 2.3 必须保持不变的部分

1. **零 diff 面**：`src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/tool-display.ts`、`src/common/pi-adapter/real-adapter.ts`、Claude/Codex 适配器、`app/desktop/`、`app/main.ts`、`app/preload.cjs`、`.ans/sessions` schema、IPC/preload/main、`package.json`/锁文件/构建配置未因 R1–R5 产生改动；随本次快照提交进入 HEAD 的 `src/model/runtime.ts`/`src/service/runtime/session.ts` 改动属此前守卫/尾连字符/后台任务，按各自记录归属。
2. **默认折叠**：reasoning 行到达即折叠；无自动展开、无展开状态持久化；手动开合沿用 `detailsOpen`。
3. **其他来源与行**：delivery/prompt-input/system/reasoning-diagnostic/tool-lifecycle/denied/turn-terminal/assistant 映射、样式与相对顺序不变；reasoning 不伪装成 assistant 正文、不进入反馈镜像。
4. **既有测试**：`event-routing`/`replay`/`history-dedupe`/`row-model` 等 `test/桌面UI/*.test.ts` 162/162、`test/桌面应用/*.test.ts` 506/506、Phase3B/4B 冒烟通过；`multi-runtime.test.ts` 载体断言保持有效；未删除/放宽/skip 既有断言。
5. **安全与转义**：渲染层只显示核心投影后的 `DisplayTextV1.text`；原始字符串 fail-closed；React 文本节点/既有 esc 语义保持；e2e 零 console 错误/CSP 违规/意外导航。

### 2.4 本轮不判、不能冒充的证据边界

| 项 | 本轮是否判 | 说明 |
| --- | --- | --- |
| 真机重建/重启后的 UI 实看 | **不判** | 当前应用仍是旧页面；新 dist 已在磁盘。若客户/统筹另行安排新构建真机实看，单独记录，不并入本标准的离线通过结论 |
| 其他引擎的思考正文 | **不判** | Claude/Codex 是否实际提供正文/省略未验证；渲染侧只按同形事实消费 |
| 持久化 / 历史 schema | **不判** | 当前会话 `getSessionHistory` 0 行；回放证据为脚本化历史；不改 `.ans/sessions` |
| O1–O7 | **不判** | 未授权、未实施；不因「顺手做了」算加分 |
| 提交/推送/部署/发布/合并 | **不判** | 验收结论不授权任何对外操作 |

## 三、成功标准 S1–S12

| 标准 | 结论 | 关键证据 |
| --- | --- | --- |
| **S1** R1 正确读取投影正文 | **通过** | `describeEvent` 只走 `detail.reasoning.text.text`；`reasoningPieceFromCarrier` 要求 `text.text` 字符串与合法 status；原始字符串/缺失/非法 status/非字符串 text 均落诊断行（单测 R1 三例）；`turnId` 回退 `detail.turnId` 单测通过；`historyRowToDescriptor` 消费 `row.reasoning`、缺失回落 assistant、坏载体诊断 |
| **S2** R2 时长与四态文案 | **通过** | 单测覆盖 4200→4 秒、400/0→1 秒、无时长→「已思考」、omitted 8 秒→「已思考 8 秒（内容由平台省略）」、部分省略、非法时长（-1/NaN/Infinity/字符串/null）→无秒；合并时长仅全 piece 有信号时求和；`ChatRow` 兜底常量同源 |
| **S3** R3 按 turnId 归组与正文合并 | **通过** | 单测：两段正文 `第一段\n\n第二段`、时长 4000、`detailsOpen` 保留、重复 piece 幂等、全 omitted→omitted、混合→complete+部分省略、任一段缺时长→不显示总时长；e2e 实时两段合并为一行「已思考 4 秒」、正文 `甲段正文\n\n乙段正文` |
| **S4** R3 确定性插入与终态顺序 | **通过** | `reasoningInsertIndex` 单测覆盖 assistant/activities/tool/terminal 之前、non-anchor 之后、未知回合表尾、无 turnId 表尾；e2e 顺序 `user→reasoning→assistant→terminal`、reasoningIndex 1 < terminalIndex 3；全量重建检查 reasoningIndex 3 < terminalIndex 4；迟到 piece 合并不移动位置 |
| **S5** R3 实时去重/历史/全量回放同解 | **通过** | `classifyLiveDuplicate` reasoning 豁免（单测 historyCount=1/liveCount=1 均不 skip，其他类型不变）；`historyRowToDescriptor` 与实时同一提取器；e2e 回放 `row.reasoning` 一行「已思考 3 秒」、同 piece 实时重推不重复、增量回放正文不翻倍、历史缺载体回落 assistant、全量重建不追加表尾 |
| **S6** R4 省略/空正文/诊断/安全 | **通过** | 单测 omitted 强制空正文、违规正文不呈现、label 带「（内容由平台省略）」；e2e omitted 标题「已思考 8 秒（内容由平台省略）」、`pre:false`、固定说明、无空白；complete 空正文分支实现；诊断行文案沿用；React 文本节点/esc；坏件原文不上屏 |
| **S7** R5 纯逻辑单测 | **通过** | 本角色独立 `node --test test/桌面UI/reasoning-view.test.ts` → **15/15、0 fail、0 skip、exit 0**；覆盖映射/文案/合并/插入/幂等/降级/omitted/坏件/去重；断言指向实际输出，不是只读源码 |
| **S8** R5 Electron 离线 e2e | **通过** | 本角色独立运行 `./node_modules/.bin/electron test/桌面UI/reasoning-electron-smoke.mjs app/renderer/dist/index.html /tmp/acc-reasoning-e2e` → **14 checks / 0 failures / exit 0**；报告 `finished:true`、console/csp 空；4 张截图与角色证据 **SHA-256 逐字节一致**；覆盖实时/省略/回放/坏件/无 turnId/全量重建/回归 |
| **S9** R5 typecheck 与构建 | **通过（构建未重跑，见 §六.6）** | 本角色独立 `npm run typecheck` exit 0、`npm run typecheck:renderer` exit 0；变更记录记录 `npm run build:renderer` exit 0，dist 入口/资产存在且被独立 e2e 使用；未重跑 build 以避免写入桌面UI 的 gitignored 生成目录 |
| **S10** 真实 Pi wire 样本与有正文/省略 | **通过** | 样本报告 + `reasoning-sample-final.json`：3 个成功样本 `status:"complete"`、正文 335/1403/1153 字符、`truncated:false`/`redacted:false`；原始 Provider 580 字符、Service/投影 335 字符；未发现适配器丢失 SDK 正文；R4 omitted 由 e2e 夹具覆盖（真实样本未出现 omitted） |
| **S11** 其他来源、工具行与既有测试零回归 | **通过（受限）** | `test/桌面UI/*.test.ts` 162/162、`test/桌面应用/*.test.ts` 506/506、Phase3B/4B 冒烟通过；delivery/tool row 回归检查通过；Phase4A（99 检查/6 焦点/inert 失败）与 Phase5A（37 检查/2 阅读锚点失败）在本离屏/后台验收运行中未通过，场景无聊天 reasoning 行、改动不触达焦点/键盘/队列/assistant 映射，判为环境限制、不计为通过（§六.4） |
| **S12** 默认折叠与 O1–O7 未实施 | **通过** | `ChatRow` 使用既有 `detailProps`，无自动置开；O1–O7 关键词扫描只有无关局部变量 `copy`/既有 `denied-copy`，无复制按钮/token/流式/截断标记/跨回合统计/逐消息折叠；`detailsOpen` 只随手动保留 |

## 四、失败与边界 F1–F12

| 标准 | 结论 | 关键证据与说明 |
| --- | --- | --- |
| **F1** 空正文/redacted/truncated | **通过** | 渲染层只显示 `DisplayTextV1.text`，不二次处理；complete 空正文显示「没有可显示的思考正文。」；redacted/truncated 由核心投影承担，行结构不变；单测覆盖空正文/非法 text |
| **F2** 省略与混合省略 | **通过** | omitted 无 `<pre>`、固定说明；混合省略 complete+部分省略标记；omitted 不贡献正文；e2e/单测覆盖 |
| **F3** 非法时长 | **通过** | 负数/NaN/Infinity/字符串/null → 无信号、不显示秒；合并时长仅全信号求和；单测覆盖 |
| **F4** 坏件/未投影原始事实 | **通过** | 原始字符串/缺失/非法 status/非字符串 text → 诊断系统行「推理内容无法安全显示」；原文不上屏（单测断言 JSON 不含原文；e2e `leaked:false`） |
| **F5** 重复投递与幂等 | **通过** | 同一 piece 实时重推/实时+历史/全量重建 → 正文/时长不重复；指纹 `status|durationMs|正文`；已知限制（同回合完全相同真实 piece 合并、无 turnId 重复不幂等）按设计接受 |
| **F6** 会话结束顺序与回合归属 | **通过** | 锚点插入永远在 `turn-terminal` 之前；全量重建不追加表尾；不移动其他行；迟到 piece 不移动位置；e2e 顺序断言覆盖 |
| **F7** 其他来源与工具行不受影响 | **通过** | delivery-note/system、工具行回归检查通过；assistant/prompt-input/system/reasoning-diagnostic 映射不变；reasoning 不进入 assistant 正文/镜像 |
| **F8** 无 turnId 保守处理 | **通过** | 无 turnId 不合并/不重排、按到达序独立成行；单测与 e2e 两条无 turnId 各成一行、正文顺序正确 |
| **F9** 零 diff 面 | **通过（含归属说明）** | `app/renderer/` 之外的运行核心/Pi/Claude/Codex/桌面窗口/IPC/preload/main/持久化/package 未因 R1–R5 改动；随本次快照提交进入 HEAD 的 `src/model/runtime.ts`、`src/service/runtime/session.ts` 改动属此前任务，按变更记录归属（§一.1） |
| **F10** 默认折叠/无 O1 | **通过** | 无自动展开/记忆展开；`detailsOpen` 手动保留；O1 未实施 |
| **F11** 安全/转义/CSP | **通过** | 只显示投影文本；原始字符串 fail-closed；React 文本节点/esc；e2e 零 console/CSP/导航 |
| **F12** 测试完整性 | **通过** | 新单测/e2e 实际运行；既有 162/162、506/506 未删/未放宽/未 skip；e2e 使用当前 `dist/index.html`；Phase4A/5A 环境失败见 §六.4，不计为通过 |

## 五、必需证据 E1–E8

| 证据 | 结论 | 核对结果 |
| --- | --- | --- |
| **E1** 设计与变更记录 | **通过** | 设计 `accepted`/`revision 1`/`e02c9594…`、A1 `8c390270…` 被引用；桌面UI 变更记录 `ed705769…` 存在，写明改点/命令/未验证项，状态 implemented-unverified 与实际相符；未含桌面窗口透传修复 |
| **E2** 实际命令与原始输出 | **通过** | 变更记录含单测/全量 UI/桌面应用/typecheck×2/build/Electron e2e 命令与退出码；本角色独立复跑关键项并记录（§三 S7/S8/S9、§六.4） |
| **E3** 纯逻辑单测 | **通过** | `reasoning-view.test.ts` 15/15、0 fail、0 skip、exit 0（本角色独立） |
| **E4** Electron 离线 e2e | **通过** | 14 checks/0 failures/exit 0；`report.json` `finished:true`、console/csp 空；4 张 PNG 与角色证据逐字节一致；入口为 `app/renderer/dist/index.html`；覆盖实时/省略/回放/坏件/无 turnId/全量重建 |
| **E5** typecheck 与构建 | **通过（构建未重跑）** | 双 typecheck 独立 exit 0；变更记录记录 build exit 0，dist 资产名/哈希与记录一致并被 e2e 使用；本角色未重跑 build（避免写入桌面UI 的 gitignored 生成目录，§六.6） |
| **E6** 候选与归属 | **通过** | 判定开始 HEAD + 97 行工作树现场捕获；期间工作树提交为 `6e51589`（同内容快照，on-disk 哈希一致、提交 blob 仅行尾归一化）；桌面UI 文件逐项归属 `app/renderer/`、`test/桌面UI/`、角色文档；此前任务改动分开；零 diff 面核对；未发现越权 |
| **E7** 真实 Pi wire 样本与边界 | **通过（含限制）** | 3 个成功样本 complete、正文 335/1403/1153、truncated/redacted false；原始/投影两形核对；R4 omitted 由 e2e 夹具覆盖（真实样本未出现 omitted）；真机重建/重启 UI 未做、持久化 0 行，均列为未判 |
| **E8** 零回归与基线红 | **通过（受限）** | `test/桌面UI/*.test.ts` 162/162、`test/桌面应用/*.test.ts` 506/506、Phase3B/4B 通过；Phase4A 6 个焦点/inert、Phase5A 2 个阅读锚点失败——非本变更路径、离屏/时序环境限制，逐条记录、不计为通过；未发现本变更引入的产品失败；不声称既有冒烟全绿 |

## 六、非阻断残差与限制

1. **真机重建/重启后的 UI 实看未做**：当前应用仍是旧页面；新 dist 已在磁盘。设计 §5.3 的真机检查（正文、归并、时长、回放）需下一次构建/启动后另行安排；本报告不替代，也不把离线 e2e 说成真机。
2. **持久化/回放**：当前会话 `getSessionHistory` 0 行；回放证据来自脚本化 `session:history` 行，不代表该会话重启后可回放；持久化策略不在本轮。
3. **已知限制（设计接受）**：同一回合两条**完全相同**的真实 piece 会合并为一条；无 `turnId` 的重复投递不做幂等、按到达序各成一行。测试与实现均按此记录，不猜测。
4. **Phase4A/5A 冒烟环境限制**：本角色独立运行 Phase4A（`checks=99, failures=6`：`SETTINGS_TABS_ARROW_LEFT_WRAPS_TO_LAST`、`DOCUMENT_BACK_ROLE_RESTORES_ENTRY_FOCUS`、`QUEUE_SUBVIEW_BACK_RETURNS_WORK_AND_FOCUS`、`RUNTIME_960_PROFILE_FOCUS_AND_INERT`、`QUEUE_SUBVIEW_FROM_PROFILE_ESC_RESTORES_ROLE_FOCUS`、`RUNTIME_960_SETTINGS_FOCUS_AND_INERT`）与 Phase5A（`checks=37, failures=2`：`full replay preserves content identity 1360/960`，`before:null`）。分析：Phase4A 脚本 `show:false`、失败全为焦点/inert 恢复；Phase5A 场景为虚拟长历史滚动后的阅读锚点，`before:null` 是滚动/渲染时序；两个脚本的聊天场景均无 reasoning 行（Phase4A 的 `reasoning` 仅指设置里的 reasoning-effort select），R1–R5 改动不触达焦点/键盘/队列/assistant 映射。**不作为本变更引入的失败，也不计为通过**；若需字面「既有冒烟全绿」，需在聚焦的桌面会话重跑或由桌面UI/桌面窗口确认环境限制。
5. **真实 Pi 样本粒度**：只做一轮简单对话取样（每轮一个 assistant message）；多轮/工具调用循环中同回合多条 reasoning 的真实 wire 行为未取样；R3 归组由单测 + e2e 脚本化覆盖。R4 的 omitted 真实平台样本未出现，由 e2e 夹具覆盖。
6. **构建未重跑**：`npm run build:renderer` 成功由桌面UI 变更记录提供；本角色未重跑，因为该命令写入 `app/renderer/dist`（桌面UI 的 gitignored 生成目录，不在独立验收写边界内）。本角色核对了 dist 入口/资产存在且独立 e2e 使用同一入口；如需以本角色重跑构建为门，需另行授权/安排。
7. **候选归属与快照提交**：判定工作树同时含此前守卫/尾连字符/后台任务改动；判定期间该工作树被提交为 `6e51589`（父 `4d944e75`），提交内容与判定时一致（产品/测试 on-disk SHA-256 相同；提交 blob 仅 `core.autocrlf=true` 行尾归一化）。本报告只把 `app/renderer/` 与 `test/桌面UI/` 的 R1–R5 改动计入本次，其余按各自变更记录归属；`src/model/runtime.ts`/`src/service/runtime/session.ts` 的改动不属 R1–R5。
8. **设计状态**：设计文末已按授权收尾；旧 `a2e1109…` 已失效，当前 `e02c9594…` 被引用。

## 七、未判范围

1. **真机重建/重启后的 UI 实看**：未判；若实施后另行安排，单独记录。
2. **其他引擎的思考正文**：Claude/Codex 实际正文/省略未判；渲染侧统一消费同形事实。
3. **持久化/历史 schema**：未判；不改 `.ans/sessions`。
4. **O1–O7**：未授权、未判；若发现实施按范围越权交回。
5. **提交/推送/部署/发布/合并**：不判、不授权。

## 八、结论与限制

- **总体结论：通过（pass，受限）**。R1–R5 交付齐全且归属正确；S1–S12、F1–F12、E1–E8 满足（S11/E8 的 Phase4A/5A 焦点/时序冒烟为环境限制，不计为通过）；本角色独立复跑 reasoning-view 15/15、桌面UI 162/162、桌面应用 506/506、双 typecheck 0、Electron e2e 14/14（截图与角色证据逐字节一致）、Phase3B/4B 通过；真实 Pi 样本 3 个 complete 正文 335/1403/1153。
- **通过范围**：Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1、npm 11.19.1、项目本地 Electron；渲染器纯逻辑 + Electron 离线 e2e（脚本化 IPC/历史）；真实 Pi wire 取样（单轮、complete 正文）。
- **明确不在通过范围**：真机重建/重启 UI、真实桌面会话回放（持久化 0 行）、Claude/Codex 实际思考正文、Phase4A/5A 焦点/时序冒烟（环境限制、未计通过）、O1–O7、提交/推送/发布。
- **权限**：本结论不授予提交、推送、合并、部署或发布。本角色未修改产品代码、测试、断言、他人报告、权限或调度状态，未提交 Git；判定期间候选产品/测试内容未改动；期间工作树被提交为 `6e51589` 同内容快照（该提交非本角色执行），当前工作树仅新增本报告与角色导航。后续任何产品/测试/配置变化将使受影响证据失效，需在新候选上重跑受影响门。

## 九、相关链接

- 验收标准 A1：[思考行显示修复 R1–R5 独立验收标准](../design/2026-10-22_design_reasoning-display-fix-acceptance.md)
- 设计（项目管理）：[修复思考行显示——展开可见正文、按回合归组、平台省略如实说明](../../../项目管理/docs/design/2026-10-22_design_reasoning-display-fix.md)
- 桌面UI 变更与证据：[变更记录](../../../桌面UI/docs/change/2026-10-22_change_reasoning-display-fix.md)、[e2e 证据目录](../../../桌面UI/docs/change/2026-10-22-reasoning-display-evidence/)
- 真实 Pi 样本：[取样报告](../../../测试/docs/change/2026-10-22-reasoning-wire-sample.md)、[样本证据](../../../测试/docs/change/2026-10-22-reasoning-wire-sample-evidence/)
- 实现模块：[reasoning.ts](../../../../app/renderer/src/chat/reasoning.ts)、[events.ts](../../../../app/renderer/src/chat/events.ts)、[chat-store.ts](../../../../app/renderer/src/chat/chat-store.ts)、[replay.ts](../../../../app/renderer/src/chat/replay.ts)、[ChatRow.tsx](../../../../app/renderer/src/chat/ChatRow.tsx)
- 旧 G-5 桌面口径（退役参考，不改写）：[g-desktop.test.ts.retired](../../../../test/测试/retired-5b/g-desktop.test.ts.retired)
- 本角色边界：[boundary.md](../../boundary.md)
