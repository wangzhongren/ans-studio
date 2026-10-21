---
id: change-ui-platform-phase4b-200pct-reverification
type: change
title: Phase 4B 200% 收口轻量重验——左树可见/可滚与逐容器/内部节点无横溢通过
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase4b-governance-receipts, ui-platform-phase4b-fix-reverification, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 对 4B 200% 收口候选 clean rebuild；单测/旧基线/IME/懒挂载、桌面UI 70/70 独立复跑、自写 200% 补充 7/7、RUNTIME 17/17、VISUAL 54/54、核心回归、bench 3 轮、C1 Δ=16；结论 pass，4B 门保持关闭
---

# Phase 4B 200% 收口轻量重验

**候选**：桌面UI [Phase 4B 变更记录 UIUX 5/6 收口节](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)（CSS/断言/截图，行为未改）。按 Invariant #6 对本次 clean rebuild 重验。环境：Darwin 25.6.0 arm64；Node v24.14.0；Electron 44.7.0；HEAD `224cf83`。证据：[2026-10-21-phase4b-200pct-verification-evidence](2026-10-21-phase4b-200pct-verification-evidence/)。

## 一、结论

**pass。** 200% 两项收口（UIUX 5 左树不可见/缺配提示被裁/检查假通过；UIUX 6 报告/预览截图未展示目标与 details 内部溢出）通过独立复验：

- 200% 左树可见且可经左栏滚动到达首/末行（首末均进入视口，4 行与屏幕相交），树行零重叠。
- 逐容器无横溢：`#chat`、`.chat-head`、`.head-inner`、`#right-body`、`.runtime-config-notice`、`.governance-status`、`#role-tree`、`.col-mid`、`.session-notice`、`.composer` 全部 `scrollWidth-clientWidth=0`，documentElement 零横溢，`.head-inner` 实际 `flex-wrap:wrap`。
- 缺配提示 200% 全文（398/398、18/18）且按钮 bottom 274.6 < 视口 414、right 658 < 680。
- 报告卡 200% 可见；展开后 `.msg-handback/.report-complete-body/.hb-complete-summary/.hb-evidence` 内部零横溢。
- 治理预览 200% 可见，`.gp-title/.gp-body/.gp-actions/.gp-file/.gp-declare` 零横溢；取消回焦触发元素。

**4B 门保持关闭，Phase 4 维持完成**；全量双端/入口/打包/真机仍 Phase 5。

## 二、门禁

| 项 | 结果 |
| --- | --- |
| typecheck / typecheck:renderer | exit 0 / exit 0 |
| clean build（删除 dist） | exit 0；`dist/src/index.html` + 1 JS + 1 CSS |
| CSP 静态扫描 | 严格 meta；零内联 script/style/style=；无 unsafe-inline/eval；modulepreload 关闭 |
| gzip9 入口 | **286,348B ≤ 307,200B**（JS 266,914 + CSS 19,046 + HTML 388） |
| 单测 | **96/96** |
| 旧基线 | **679/679** |
| IME（新入口） | 24 检查基线保持；`E2E_DONE=1` |
| 懒挂载 | **10/10**，`LAZY_TOOLGROUP_DONE=1` |
| 旧渲染器/main/preload/desktop | 对 HEAD **零 diff** |
| 依赖/冻结文件 | `package.json/lock` 10:45、`App.tsx` 12:07、`Sidebar` 14:10、`shell.css` 12:35、`phase4a.css` 14:33，均早于 200% 收口；无新增依赖 |
| DOM 例外 | 仍仅延迟挂载 40 + 失效/排队卡动作 hidden |

## 三、4B 冒烟

- **桌面UI `phase4b-electron-smoke.mjs` 独立复跑：70/70 PASS、0 failures、零 console/CSP**。200% 相关 11 项全过：容器无横溢、头部 wrap、缺配提示全文、五角色树零重叠/可见/可滚到末行、报告 details 节点无横溢、报告卡可见、治理预览可见且内部无横溢、取消回焦。
- **自写 200% 补充冒烟：7/7 PASS**（[smoke/independent-200pct-supplement.cjs](2026-10-21-phase4b-200pct-verification-evidence/smoke/independent-200pct-supplement.cjs) + 自有 preload，不复用桌面UI 断言）：
  - `200PCT_TREE_VISIBLE_SCROLLABLE_NO_OVERLAP`：6 行、首末行均可见、4 行与屏幕相交、重叠 0、左栏可滚（leftSH 875 > leftCH 378）。
  - `200PCT_CONTAINERS_NO_H_OVERFLOW`：10 个容器 overflow 0、doc 0、head wrap。
  - `200PCT_CONFIG_NOTICE_FULL_TEXT_AND_BUTTON`：全文 398/398、18/18、按钮首屏内。
  - `200PCT_GOVERNANCE_PREVIEW_INTERNAL_NO_OVERFLOW`、`200PCT_GOVERNANCE_CANCEL_FOCUS_BACK`。
  - `200PCT_REPORT_DETAILS_INTERNAL_NO_OVERFLOW_VISIBLE`：报告卡可见 + 4 节点零横溢。
  - `200PCT_ZERO_CONSOLE_ERRORS`：零 error、零 load failure。

## 四、uiux 回归

| 段 | 结果 |
| --- | --- |
| RUNTIME | **17/17 pass**（C2 重锚与无 authorize 跟随断言） |
| VISUAL | **54/54 pass** |
| QUEUE_VIEW | **4/4 pass** |
| MIRROR | **8/8 pass**（五角色） |
| GOVERNANCE_REACCEPT | **7/7 pass** |
| JUDGE | **33/33 pass** |
| G2 | **5/5 pass** |
| TOOLFOLD | **19/19 pass**（C1） |

检查名单与 4B 返工重验逐字一致；本次仅 CSS/断言/截图变化，无删除或放宽；新增的 200% 检查均加入而非替换。

## 五、bench 与 C1

同机同日旧/新交替 3 轮：

| 指标 | 新（3 轮） | 新中位 | 旧中位 | 阈值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| stormA.maxGap | 22.5 / 24.7 / 23.8 | 23.8ms | 19.4ms | max(旧,25)=25 | pass |
| stormB.maxGap | 17.6 / 17.6 / 19.8 | 17.6ms | 17.7ms | 25 | pass |
| stormA_handler.maxMs | 0.7 / 0.6 / 0.6 | 0.6ms | 5.6ms | 10.6 | pass |
| stormB_handler.maxBatchMs | 0.7 / 0.8 / 1.0 | 0.8ms | 1.1ms | 6.1 | pass |
| replay.replayMs | 10.3 / 10.3 / 10.2 | 10.3ms | 20.0ms | 25.0 | pass |
| scrollToBottom.ms | 16.2 / 8.1 / 1.5 | 8.1ms | 21.6ms | 26.6 | pass |

3 个有效轮（`histDirect=true`、`histPending.r1=false`）；单轮最大帧 **24.7ms**（max ≥ p95，p95≤35 成立；单轮 ≤50）。**C1：150→166，Δ=16px（≤32，目标≤20）**。

## 六、边界

只写 `角色卡/测试/` 与 `test/测试/`；未改产品代码/测试断言/配置/权限；未读 `.env`；未 commit/push。证据 `user-data` 已删除。4B 通过不等于最终验收；Phase 5 的 `main.mjs`、全量双端、入口切换、打包/发布、真实模型/网络/Windows/DPI/屏读仍待完成。
