---
id: change-ui-platform-phase4b-independent-verification
type: change
title: Phase 4B 独立验证——治理/镜像/聚合/报告/回执/锚点；C2 重锚与默认段锚点为真红
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: needs-work
related: [ui-platform-phase4b-governance-receipts, ui-platform-round-review, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 对 4B 交付候选 clean rebuild、单测/旧基线/IME/懒挂载、自写离线 Electron smoke 38/38、bench 3 轮、uiux-v2 全部段与只读补证副本；4B 大部分通过，但 C2 重锚（原因不可见）与默认段 B1 锚点（full rebuild 落尾）为真红，FLOW 官方段未到达其声称的 7 个 C 检查；结论 needs-work，Phase 4 门不关闭
---

# Phase 4B 独立验证（测试角色）

**候选**：桌面UI [Phase 4B 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)（`status: delivered`）与 `2026-10-21-phase4b-evidence/`。门规：PM [§十五/§15.7/§15.10](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)；台账：[check 台账 §八](2026-10-21_check-ledger-phase3a.md)。按 Governing Invariant #6，本报告只对本次 clean rebuild 的候选有效。

**环境**：Darwin 25.6.0 arm64；Node v24.14.0；Electron 44.7.0；HEAD `224cf83`。构建入口 `app/renderer/dist/src/index.html`（`npm run build:renderer`，emptyOutDir）。证据：[2026-10-21-phase4b-verification-evidence](2026-10-21-phase4b-verification-evidence/)。

## 一、结论

**4B：needs-work（门不通过）。** 大部分 4B 功能面通过（聚合、镜像、治理记录、报告/持久化/交付、菜单状态、queueView、single 警告、judge 跨引擎重放、`replayAnchorDebug`、bench/C1/热路径门），但两项 **4B 必过 check 为真红**，且官方 FLOW 证据的到达表述不实：

1. **C2 重锚红**：`expired old shell collapses with reason visible in its own runtime` 连续 2 次 false——卡收起但原因未进入 `composer-hint`，不可见/不可追溯。
2. **默认段 B1 锚点红**：`denied conclusion anchor and decided card retained` false——已答卡在 full rebuild 后落尾，未按锚点插回请求/结论之间（最小复现确认）。
3. **FLOW 证据缺口**：交付记录称 FLOW 通过 18 项并含 `C outer ok inner failed`/不可读报告/P3 来源文档；官方报告实际在 P7（源序在这些 C 检查之前）中止，这些名未到达。测试用只读副本仅跳过 P7 两个 Phase 5 阻断检查后补证 12/12 通过，但官方证据本身不能支撑原表述。

**Phase 4 门：不关闭。** 修复上述两项产品红并更正 FLOW 证据表述、按 Invariant #6 重跑受影响段后，方可重判 4B/Phase 4。全量双端、入口切换、打包/发布仍在 Phase 5。

## 二、构建与门禁

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 根类型检查 | `npm run typecheck` | exit 0 |
| 渲染类型检查 | `npm run typecheck:renderer` | exit 0 |
| 构建（clean） | `rm -rf app/renderer/dist && npm run build:renderer` | exit 0；`dist/src/index.html` + 1 JS + 1 CSS |
| CSP 静态扫描 | `dist-static-scan.cjs` | 严格 meta；零内联 script/style/style=；无 unsafe-inline/eval；modulepreload 关闭；单外链脚本 |
| gzip9 入口预算 | 入口引用 JS+CSS+HTML gzip9 | **285,702B ≤ 307,200B**（JS 266,839 + CSS 18,476 + HTML 387） |
| 4B 纯逻辑单测 | `node --test "test/桌面UI/*.test.ts"` | **96/96** |
| 旧基线 | `node --test test/桌面应用/*.test.ts` | **679/679** |
| IME（新入口） | `ime-enter.mjs` | **26 true / 0 false / E2E_DONE=1**（24 检查基线保持） |
| 懒挂载 | `phase3a-lazy-toolgroup-check.mjs` | **10/10**，`LAZY_TOOLGROUP_DONE=1` |
| 旧渲染器/main/preload/desktop | `git diff --exit-code HEAD` | **零 diff** |
| 依赖/冻结文件 | mtime + hash | `package.json/lock` 10:45、`App.tsx` 12:07、`Sidebar` 14:10、`shell.css` 12:35、`phase4a.css` 14:33，均早于 4B 改动（15:36+）；无新增依赖 |
| DOM 例外 | 源码核对 | 仅延迟挂载 40 + 失效/排队卡动作 hidden；无新增懒挂载/卸载例外 |

证据：`build/`、`gates/`、`ime/`、`lazy/`、`gates/candidate-sha256.txt`。

## 三、自写 Electron 离线 smoke（38/38）

脚本：[smoke/independent-smoke.cjs](2026-10-21-phase4b-verification-evidence/smoke/independent-smoke.cjs) + 自有 IPC 替身 `ans-p4b-smoke-preload.cjs`（contextIsolation=true、nodeIntegration=false、sandbox=false、show:false；不复用桌面UI 脚本）。`PHASE4B_SMOKE PASS 38 checks / 0 failures`，零 console error、零 load failure。

覆盖与结果：

- **operator 聚合（6）**：trio 主入口唯一 `.op-queue-aggregate`；`queuedDebug` 插入序；不可聚焦/无按钮/无请求内容；同 id 重推不重复；呈现后移出聚合且同 id 卡唯一；expired 移除；切引擎清空且快照不复活；清空后主进程重推按新计数重建。
- **镜像（4）**：源 A/镜像 C 同 `data-request-id` 两表面（C 面 `.is-mirror`、`镜像 · 主入口`、`来自 主理 / Lead 的治理决定 · 客户最终批准`；A 面非镜像）；排队镜像 `.op-queued`「等待前一个决定」且动作容器 hidden、零可见可用按钮；任一面作答只发一次 `operatorRespond`，双面 `data-state=decided` 且动作收起；延迟回包下双击只发一次。
- **治理（8）**：`#governance-status` 状态行 + 建立动作；`#governance-preview` 唯一、非模态（无 backdrop/aria-modal/role=dialog）、Esc 关闭且焦点回触发、取消零写并提示「已取消，未写入任何文件」；三权建立预览含写入/pin/声明，confirm 一次且 success 仅在 write+completed；写阶段失败如实显示 `错误码：IO_ERROR` 且不声称零写；guard 失败显示「已存在；本次未写入任何文件」；重新接受 modified/missing/unreadable、64hex digest、警告，确认一次带同一 digest，成功文案；迁移 `not-available` 如实且零写；`governance:next-step` 只更新状态行、不切角色/不开抽屉。
- **报告/持久化/交付（7）**：报告全文、来源/声明「已完成」、disclaimer「不等于独立验收」、摘要 180 字/4 行预览；failed 显示「重试保存报告」，重试一次后 saved 且迟到 failed 更新不覆盖；交付「本批 2 份（不表示全部收齐）」、2 张 `.delivery-report`、三列事实、失败重试一次后「接收历史已保存」且迟到失败不覆盖；expired 回执无假重试并显示「可补存的会话材料已失效」；安全副本 flags「此处未记录完整模型输入 · 已净化」。
- **菜单/queueView/single/judge/锚点（13）**：菜单 208px、两行、状态文字 已配置/缺配置/配置未知；读取缓存只对 unknown（codex）重读一次；queueView 经 `#tab-card`/`#tab-work` 切换均清空且可重开；single 下 decision 禁用并收起警告，回 trio 不重放警告、再次开启重新提示一次；judge shell/治理结果行按引擎缓存，切回 claude 只重放一次、pi 不串；`replayAnchorDebug` 字段 requestIndex/conclusionIndex/rowsAtReplay 与插入后索引右移；卡片插入请求/结论之间，重复同历史时同序。

## 四、uiux-v2 逐段（新入口）

官方段（未改文件）：

| 段 | 结果 | 失败名/归属 |
| --- | --- | --- |
| QUEUE_VIEW | **4/4 pass** | — |
| MIRROR | **8/8 pass**（五角色；`rapporteur,nominator,convener,verifier`；状态行「三权 · 五角色」；无四角色双期望） | — |
| GOVERNANCE_REACCEPT | **7/7 pass**（PM §15.7 记 5/5，实际名单 7 项全绿） | — |
| JUDGE | **33/33 pass** | — |
| G2 | **5/5 pass** | — |
| SELECTOR / CONFIG / ROLE / SEND / TERMINAL / TOOLFOLD | **27/27、21/21、11 条(9 布尔)、8/8、22/22、19 条(17 布尔)** 全绿 | 4A 基线；ROLE/TOOLFOLD 含 2 个 report 对象 |
| RUNTIME | **14/15 + 1 red** | `expired old shell collapses with reason visible in its own runtime` = **4B 红（C2）**，连续 2 次；原因不可见 |
| VISUAL | 48/49 pass，随后止于 | `V2 import selects primary su and keeps it inside tree viewport` = Phase 5（树视口/Sidebar，非 4B 写集）；4B 报告面 **20/20** 全过 |
| DELIVERY_NOTE | 7/8 pass，随后止于 | `builtin identity stays data and accessible without duplicate third visible line` = Phase 5/左树身份；4B 交付注记 **5/5** 全过 |
| COMPLETE_FLOW | 18/19 pass，止于 | `P7 choice pending separated from empty queue` = Phase 5；官方仅到达 4B C/P3 **5/12**（C source 声明/same card/target safe/only save/expired original），其余 7 名未到达 |
| 默认段 | 50 布尔 + 4 report 对象后，raw assert 止于 | `full replay preserves content identity`（reading offset）= Phase 5 虚拟窗口；B1/B2 未到达 |

**只读补证副本**（不修改仓库测试；仅跳过阻断其后的 Phase 5 检查，所有 4B 断言原样）：

- [probes/uiux-v2-flow-reach.mjs](2026-10-21-phase4b-verification-evidence/probes/uiux-v2-flow-reach.mjs)：跳过 P7 两个 Phase 5 检查后到达 C/P3；报告 **35 项全过**，4B 必过 12 名逐一命中（含 `C source report mismatched role…`、`C fallback abort…`、`C disabled live report…`、`C outer ok inner failed…`、`C unreadable report record…`、`P3 source B documents browsing…`、`C expired material…`），随后止于 Phase 5 role-reading 夹具。
- [probes/uiux-v2-default-reach.mjs](2026-10-21-phase4b-verification-evidence/probes/uiux-v2-default-reach.mjs) / `default-collect`：跳过 Phase 5 full-replay/toggleDrift 后到达默认段 4B 21 项；**19/21 通过**，`denied conclusion anchor and decided card retained` 为 **4B 红（锚点）**；`queued baseline shows two` 由 QUEUE_VIEW 覆盖。B1 其余 13 项与 B2 6 项均通过。

**断言强度核对**：4A→4B 共同检查名逐一比对，无 pass→fail 的弱化；SELECTOR/CONFIG/ROLE/SEND/TOOLFOLD 名单逐字一致；VISUAL/DEFAULT 仅新增检查；C2 由旧「shown disabled」重锚为「collapses with reason」（新名，仍红）；MIRROR 四角色双期望已删除，五角色夹具落地。官方 FLOW 的 18 项表述与到达事实不符（见 §五）。

## 五、两项真红与证据缺口

### 5.1 C2 重锚红（RUNTIME）

- 断言：`document.getElementById('shell-confirm').hidden && composer-hint.textContent.includes('原shell轮次已中止')`。
- 实测两次（`uiux/RUNTIME`、`RUNTIME2`）：`shell-confirm` 确实隐藏，但 `composer-hint` 为空；同时 `pi-old-confirm` operator 卡显示「请求已失效，未获同意。原因：原轮次已中止」，但 shell id `sc-runtime-old` 的原因无可见载体。
- 归因（只读）：`recordOperatorExpired` 在缓存中清掉同 id `shellConfirm`；切回 pi 时 `replayRest` 先 `expireOperator`（`expireShell` 因当前无卡不写 hint）后 `receiveShell`（已为空），原因丢失。与交付记录 §五「C2 pass」不符。
- 归类：**4B 产品红**（PM §15.10 门前条件 3；§15.6 口径「收起 + 原因可见/可追溯」）。

### 5.2 默认段 B1 锚点红

- 断言：`replayAnchorDebug('B')[0]` 的 request/conclusion 均非空，`rowModelDebug('B').operators[0].index === requestIndex + 1`，且 `.op-confirm.hidden`。
- 官方默认段未到达；只读 collect 副本到达后 false。最小复现（[probes/anchor-decided-probe.cjs](2026-10-21-phase4b-verification-evidence/probes/anchor-decided-probe.cjs)）：历史 request(1)/conclusion(2) + operator 卡先插到 2；deny 后 full rebuild（前缀 + 两行）后 card 在 index 3、requestIndex 1、conclusionIndex 2——卡落结论之后。`op-confirm` 仍正确 hidden，故失败点是锚点回插。
- 归因（只读）：`appendOperatorRequest` 创建 operator 行时未把 `anchorKey/anchor` 存到行上；`applyHistory` full rebuild 仅按 `row.anchorKey` 回插，缺省只能尾插。与交付记录「full 重建按锚点回插」不符。
- 归类：**4B 产品红**（4B 默认段 B1 必过；`REPLAY_ANCHOR_DEBUG_SAME_FIELDS` 的 full rebuild 场景）。

### 5.3 证据表述缺口（FLOW）

交付记录 §五称 FLOW「通过 18 项：… C outer ok inner failed、不可读报告注记、P3 来源文档、P6 草稿/焦点；随后止于 P7」。官方 `uiux/FLOW/report.json` 的 19 个布尔项中，实际止于 P7，且源序中 `C source report mismatched role`（633）、`C fallback abort`（636）、`C disabled live report`（639）、`C outer ok inner failed`（642）、`C unreadable report record`（644）、`P3 source B documents browsing`（652）、`C expired material…`（657）均在 P7（628）之后，不可能已达。该表述需更正；行为本身经补证副本 12/12 通过，不据此判产品红。

## 六、bench（§10.3，同机同日，旧/新交替 3 轮）

| 指标 | 新（3 轮） | 新中位 | 旧中位 | 阈值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| stormA.maxGap | 17.7 / 17.7 / 20.7 | 17.7ms | 24.0ms | max(旧,25)=25 | pass |
| stormB.maxGap | 19.3 / 19.8 / 17.7 | 19.3ms | 17.6ms | 25 | pass |
| stormA_handler.maxMs | 1.2 / 0.3 / 0.3 | 0.3ms | 11.2ms | max(×1.2,+5)=16.2 | pass |
| stormB_handler.maxBatchMs | 0.9 / 0.8 / 0.3 | 0.8ms | 1.0ms | 6.0 | pass |
| replay.replayMs | 5.9 / 6.1 / 11.2 | 6.1ms | 11.4ms | 16.4 | pass |
| scrollToBottom.ms | 7.3 / 6.8 / 11.0 | 7.3ms | 12.3ms | 17.3 | pass |

3 个有效轮（`histDirect=true`、`histPending.r1=false`）；新入口单轮最大帧 **20.7ms**（max ≥ p95，故 p95≤35 成立；单轮 ≤50）。旧/新 `mounted` 361 vs 1 为结构差异（已知口径，3A 起记录），不影响同事件量计时。**C1：TOOLFOLD `fold anchor offsets` 150→166，Δ=16px（≤32，目标≤20）**。

## 七、契约面与边界

- **契约行 #8/#12/#13/#15/#17/#19/#20**：与实现一致——#8 引擎真实切换 + 208px 两行状态（smoke/SELECTOR）；#12 delivery/report/anchor 行与 `replayAnchorDebug`（smoke，但 full rebuild 锚点见 §5.2）；#13 operator 镜像/聚合/`inert`（smoke）；#15 queueView 顶层 tab 清空、`#right-queue-body` 唯一（smoke/queueView）；#17 治理状态/唯一非模态预览/建立/重新接受/迁移（smoke/GOV）；#19 driver 扩展 `governance`/`replayAnchorDebug`、`unimplemented=[]`（smoke）；#20 `state.governancePreview` 字段在快照中（源码核对）。
- **契约行 #14**：文字更新为「C2 失效卡语义 4B 重锚为收起 + 原因可见」，但新入口到达值为 false（原因不可见）→ **文字与实现不一致，4B 红**。
- **边界**：本上下文只读产品/测试；仅写 `角色卡/测试/` 与 `test/测试/`；未改产品代码/测试断言/配置/权限；未读 `.env`；未 commit/push。证据中的 `user-data` 已删除。

## 八、复验建议（交桌面UI/PM）

1. 修复 C2：缓存失效 shell 时保留原因并在切回目标引擎时写入 `composer-hint`（或等价可追溯载体），确保 `#shell-confirm` 收起 + 原因可见；复跑 RUNTIME 两次。
2. 修复锚点：operator 行保存 `anchorKey/anchor`（或 full rebuild 用 pending 载荷的 anchorKey 回插），确保卡在请求/结论之间且索引右移；复跑默认段 B1 + 最小复现。
3. 更正 4B 变更记录 §五 FLOW 的到达名单与「C2 pass」表述；用官方可达路径重跑或明确记录补证副本口径。
4. 按 Invariant #6 重跑受影响段（RUNTIME、默认段、FLOW/VISUAL）与热路径门（bench/懒挂载/C1/IME）；测试独立复验后重判 4B/Phase 4。
