---
id: change-ui-platform-phase4b-fix-reverification
type: change
title: Phase 4B needs-work 返工聚焦重验——C2/锚点/UIUX 四项修复通过，4B 门关闭
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase4b-governance-receipts, ui-platform-phase4b-independent-verification, ui-platform-round-review, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 对 4B 返工候选 clean rebuild；单测/旧基线/IME/懒挂载、自写 smoke 42/42、RUNTIME 17/17、VISUAL 54/54、FLOW 补证 12/12、默认段补证 100 布尔全过、bench 3 轮、C1 Δ=16；两项真红已修复且断言未弱化，结论 pass（4B 门关闭、Phase 4 完成；Phase 5 仍留）
---

# Phase 4B needs-work 返工聚焦重验

**候选**：桌面UI [Phase 4B 变更记录 §一之二 返工节](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md) 与更新后的 `2026-10-21-phase4b-evidence/`。按 Governing Invariant #6，本报告只对本次 clean rebuild 候选有效，覆盖上一份 4B 报告的受影响结论。

**环境**：Darwin 25.6.0 arm64；Node v24.14.0；Electron 44.7.0；HEAD `224cf83`。证据：[2026-10-21-phase4b-fix-verification-evidence](2026-10-21-phase4b-fix-verification-evidence/)。

## 一、结论

**pass：4B 门关闭；Phase 4 完成。** 上一轮两项真红均已修复并通过独立复现：

1. **C2 重锚**：RUNTIME `expired old shell collapses with reason visible in its own runtime` **pass**，新增 `expired shell exposes no authorize action after collapse` pass；自写 smoke 复现「异引擎缓存 shell → 失效 → 切回」得到卡收起、`composer-hint` 含「原shell轮次已中止」、无 `sc-allow/sc-close`、Esc 零回包。
2. **已答卡锚点**：默认段 `denied conclusion anchor and decided card retained` **pass**；自写 smoke 最小复现（前缀 full rebuild）得到 DOM 同节点保留、`opIndex=requestIndex+1`、`conclusionIndex=opIndex+1`、卡 `decided` 且动作冻结。

UIUX 四项（960 五角色行不重叠、200% 逐容器无横溢、报告 facts 间距、治理预览取消回焦）均通过；C2 与五角色重锚语义一致，断言未被弱化。

**边界**：4B 通过不等于最终验收。全量双端、`main.mjs`、入口切换、打包/发布、Windows/DPI/屏读、真实模型/网络仍在 Phase 5；DELIVERY_NOTE 左树身份、COMPLETE_FLOW P7 角色树待选择、默认段官方虚拟窗口阅读锚点为 Phase 5 既有缺口，行为面已由 smoke/补证副本覆盖但未在官方段到达。

## 二、构建与门禁

| 项 | 结果 |
| --- | --- |
| `npm run typecheck` / `typecheck:renderer` | exit 0 / exit 0 |
| clean build（删除 `app/renderer/dist`） | exit 0；`dist/src/index.html` + 1 JS + 1 CSS |
| CSP 静态扫描 | 严格 meta；零内联 script/style/style=；无 unsafe-inline/eval；modulepreload 关闭 |
| gzip9 入口预算 | **286,105B ≤ 307,200B**（JS 266,914 + CSS 18,805 + HTML 386） |
| 单测 `test/桌面UI/*.test.ts` | **96/96** |
| 旧基线 `test/桌面应用/*.test.ts` | **679/679** |
| IME（新入口） | **26 true / 0 false / E2E_DONE=1**（24 检查基线保持） |
| 懒挂载 | **10/10**，`LAZY_TOOLGROUP_DONE=1` |
| 旧渲染器/main/preload/desktop | 对 HEAD **零 diff** |
| 依赖/冻结文件 | `package.json/lock` mtime 10:45、`App.tsx` 12:07、`Sidebar` 14:10、`shell.css` 12:35、`phase4a.css` 14:33，均早于返工（4B 改动 15:36+）；无新增依赖 |
| DOM 例外 | 仍仅延迟挂载 40 + 失效/排队卡动作 hidden；无新增例外 |

## 三、自写 Electron 离线 smoke（42/42）

脚本：[smoke/independent-smoke.cjs](2026-10-21-phase4b-fix-verification-evidence/smoke/independent-smoke.cjs) + `ans-p4b-fix-smoke-preload.cjs`（真实 renderer + 离线 IPC 替身，contextIsolation=true、nodeIntegration=false、sandbox=false、show:false）。`PHASE4B_SMOKE PASS 42 checks / 0 failures`，零 console error、零 load failure。

新增/加强的独立复现：

- **C2**：claude 视图收到 pi 的 shell 确认（缓存、不显示）→ pi `operator-expired`（带 projectRoot/runtime）→ 切 pi：`#shell-confirm` hidden、hint=「原shell轮次已中止」、`sc-allow/sc-close` 不可见、无 `shellConfirmRespond`、Esc 后仍零回包。
- **锚点**：历史 request/conclusion（prefix 前插触发 full rebuild）+ 已答 operator 卡：`replayAnchorDebug` requestIndex 2、conclusionIndex 4、rowsAtReplay 4；`rowModelDebug.operators[0].index=3`；DOM 节点保留（dataset 仍在）、`data-state=decided`、`.op-actions` hidden；DOM 顺序 task < card < reply。
- **960 五角色**：liaison/rapporteur/nominator/convener/verifier + A，960 下 6 行 rect 两两不重叠、`#role-tree` 无横向溢出、行不越过树右界。
- **200%**：`#chat`/`#right-body`/`.chat-head`/`.head-inner` 均 `scrollWidth<=clientWidth+1`，documentElement 无横溢，`.head-inner` 计算 `flex-wrap: wrap` 且高度 112px（实际换行）。
- **报告 facts**：`.report-facts > div` 计算 flex、`column-gap:4px`、`dt::after` 为「：」、标签与值间距 4px。
- **治理预览取消回焦**：取消后 `document.activeElement === #governance-status [data-governance-establish]`，且零写入、hint「已取消，未写入任何文件」。
- **回归**：聚合/镜像/治理记录/报告持久化/交付回执/菜单/queueView/single 警告/judge 跨引擎重放/`replayAnchorDebug` 全部保持；`unimplemented=[]`。

## 四、uiux-v2 逐段（新入口）

| 段 | 结果 | 到达/失败归属 |
| --- | --- | --- |
| RUNTIME | **17/17 pass** | C2 重锚 + 无 authorize 跟随断言均 pass |
| QUEUE_VIEW | **4/4 pass** | — |
| MIRROR | **8/8 pass** | 五角色口径；verifier 在组、状态行「三权 · 五角色」 |
| GOVERNANCE_REACCEPT | **7/7 pass** | PM 记 5/5，实际名单 7 项全绿 |
| JUDGE | **33/33 pass** | 回归 |
| G2 | **5/5 pass** | 回归 |
| SELECTOR / CONFIG / ROLE / SEND / TERMINAL / TOOLFOLD | **27/27、21/21、11 条(9 布尔)、8/8、22/22、19 条(17 布尔)** 全绿 | 4A 基线 |
| FRESH_CONTEXT | **4/4 pass** | — |
| VISUAL | **54/54 pass** | 含树视口 4 项；无 Phase 5 失败 |
| DELIVERY_NOTE | 7/8，止于 | `builtin identity stays data and accessible without duplicate third visible line` = **Phase 5**（左树身份徽标）；4B 交付注记 **5/5 全过** |
| COMPLETE_FLOW（官方） | 18/19，止于 | `P7 choice pending separated from empty queue` = **Phase 5**；官方到达 4B C/P3 **5/12** |
| COMPLETE_FLOW（补证副本） | **35/35** | 仅跳过 P7 两个 Phase 5 检查；4B C/P3 **12/12** 逐一 pass，随后止于 Phase 5 `role reading fixture must really scroll` |
| 默认段（补证副本） | **107 条 / 100 布尔全过** | 仅跳过 Phase 5 虚拟窗口阅读/开合断言；`denied conclusion anchor and decided card retained`、B1/B2/B3 全过 |

**断言强度核对**：与返工前 4B 报告逐名比较，QUEUE/MIRROR/GOV/JUDGE/G2/SELECTOR/CONFIG/ROLE/SEND/TERMINAL/TOOLFOLD/GHOST/FLOW 名单逐字一致；RUNTIME 新增 2 项（无 authorize、runtime bridge report），VISUAL 新增 3 项树视口检查；原两项红由 false→true；无 pass→fail、无删除/放宽。C2 语义与台账「收起 + 原因可见/可追溯」一致；五角色夹具仍为 `rapporteur,nominator,convener,verifier`，无四角色双期望。

## 五、bench（§10.3，同机同日，旧/新交替 3 轮）

| 指标 | 新（3 轮） | 新中位 | 旧中位 | 阈值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| stormA.maxGap | 17.5 / 17.4 / 20.8 | 17.5ms | 27.1ms | max(旧,25)=27.1 | pass |
| stormB.maxGap | 20.0 / 21.2 / 17.7 | 20.0ms | 17.6ms | 25 | pass |
| stormA_handler.maxMs | 0.3 / 0.8 / 0.7 | 0.7ms | 11.8ms | 16.8 | pass |
| stormB_handler.maxBatchMs | 0.9 / 1.0 / 0.6 | 0.9ms | 1.0ms | 6.0 | pass |
| replay.replayMs | 9.7 / 10.2 / 10.7 | 10.2ms | 19.6ms | 24.6 | pass |
| scrollToBottom.ms | 15.3 / 7.6 / 10.6 | 10.6ms | 14.1ms | 19.1 | pass |

3 个有效轮（`histDirect=true`、`histPending.r1=false`）；新入口单轮最大帧 **21.2ms**（max ≥ p95，p95≤35 成立；单轮 ≤50）。**C1：150→166，Δ=16px（≤32，目标≤20）**。

## 六、契约面与边界

- #8/#12/#13/#15/#17/#19/#20 与实现一致；#12 的 `replayAnchorDebug` full rebuild 回插已由 smoke/默认段补证覆盖；#13 镜像/聚合保持；#15 queueView 清空保持；#17 治理预览取消现在同时回焦；#19 driver 扩展与 `unimplemented=[]`；#20 `state.governancePreview` 保持。
- **#14**：C2 失效卡「收起 + 原因可见」新入口到达 true，契约文字与实现一致。
- 只写 `角色卡/测试/` 与 `test/测试/`；未改产品代码/测试断言/配置/权限；未读 `.env`；未 commit/push。证据 `user-data` 已删除。

## 七、结论与后续

**4B：pass。** C2、锚点两项真红修复；UIUX 四项修复；官方/补证段、bench/C1、热路径门全过；无断言弱化。**Phase 4 门关闭（Phase 4 完成）**。

**仍留 Phase 5**：`main.mjs`、全量双端逐 check、入口切换、打包/发布/安装包、真实模型/网络/`.env`、Windows/DPI/屏读；DELIVERY_NOTE `builtin identity…`、COMPLETE_FLOW P7、默认段官方 `full replay preserves content identity` 为 Phase 5 既有缺口。不得宣称全量双端等价或最终验收。
