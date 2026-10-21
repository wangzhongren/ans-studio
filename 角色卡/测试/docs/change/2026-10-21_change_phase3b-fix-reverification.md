---
id: ui-platform-phase3b-fix-reverification
type: change
title: Phase 3B UIUX 五项修正（CSS/图标）聚焦重验
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase3b-cards-composer, ui-platform-phase3b-independent-verification, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: created
    summary: 候选变化后聚焦重验：重建、原 39 项冒烟不回退 + 6 项新样式断言、单测/基线/IME/懒挂载、PM §10.3 bench、uiux-v2 受影响段；全部通过
---

# Phase 3B 五项修正：聚焦重验（测试角色）

**候选变化**：桌面UI 按 UIUX Phase 3B 评审修正 5 项（纯 CSS/图标/夹具，行为逻辑未改，见 [变更记录 D 节](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md)）。受影响面：SU 卡视觉、shell 详情 chevron、拖入反馈、队列撤回命中区、附件缩略图圆角/图标；以及夹具 PNG。行为面按 Invariant #6 回归原有 39 项冒烟。独立执行，未复用对方脚本。

候选基线：HEAD `fc1a39c` + 当前工作树；环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、Electron 44.7.0。证据目录：[2026-10-21-phase3b-fix-verification-evidence](2026-10-21-phase3b-fix-verification-evidence/)。

## 一、结论（pass / needs-work）

**pass。** 五项修正均按声明值生效（独立计算样式核实）；原有 39 项行为冒烟**零回退**；单测/旧基线/IME/懒挂载、bench 阈值、uiux-v2 受影响段全部通过。**needs-work：无。**

## 二、干净重建与静态检查（通过）

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0
npm run build:renderer       # exit 0
```

gzip9：JS 226,153B + CSS 14,734B + HTML 386B = **241,273B ≤ 300KB**（桌面UI 报告 240,133B，重建实例差 +1,140B）；静态扫描仍为零内联脚本/`<style>`/`style=`/`unsafe-*`、无 modulepreload、严格 CSP meta 在位。

## 三、测试与基线（通过，无回退）

| 检查 | 结果 |
| --- | --- |
| `node --test test/桌面UI/*.test.ts` | **33/33 pass，exit 0** |
| `node --test test/桌面应用/*.test.ts` | **679/679 pass，exit 0** |
| IME 新入口 | **24/24 true，E2E_DONE=1，exit 0** |
| 延迟挂载正向检查（`test/测试/phase3a-lazy-toolgroup-check.mjs`） | **10/10，exit 0** |
| 旧渲染器核心 / main / preload / desktop | 与 HEAD 零 diff；依赖未变 |

## 四、自写 Electron 冒烟：45/45（原 39 项不回退 + 6 项新样式）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase3b-fix-verification-evidence/electron-smoke/independent-smoke.cjs)（本角色自写；在原 39 项基础上新增 6 项）。结果 **45/45 true、exit 0**，零 console/CSP/did-fail-load；原有 shell/su/恢复卡、judge、双开关、发送/停止/附件/队列/system 行断言全部保持 true。

新增 6 项独立实测值（计算样式）：

| 检查 | 实测 | 判定 |
| --- | --- | --- |
| `SU_WARNING_AMBER_SUMMARY_BOLD` | SU 摘要 `font-weight:600`；`.sc-su-warning` 色 `rgb(196,161,95)`（--warning）；`#sc-hint` 默认色 `rgb(148,155,164)`（--text-3）；默认「拒绝/关闭 = 不放行」文案逐字保留 | PASS |
| `SHELL_DETAILS_LUCIDE_CHEVRON_VISIBLE_AND_ROTATED` | `#sc-details summary` 内 Lucide `svg.disclosure-chevron` 存在；闭合 transform 为恒等矩阵；`details[open]` 后 `matrix(0,1,-1,0,0,0)`（90°）；`summary::before` content 为 none（无文本字形 marker） | PASS |
| `DROP_FEEDBACK_VISIBLE_TOKENS` | 拖入 `#composer-capsule` → `is-dropping` 类；border `rgb(148,155,164)`（--text-3）、背景 `rgb(37,42,48)`（--hover） | PASS |
| `DROP_FEEDBACK_CLEARED_ON_LEAVE` | dragleave 后 `is-dropping` 移除 | PASS |
| `QUEUE_WITHDRAW_HIT_TARGET_AND_INPUT_BORDER` | 撤回按钮高 **28px**、字号 **11px**、边框 `rgb(107,117,126)`（--input）、圆角 6px | PASS |
| `ATTACH_CHIP_RADIUS_AND_REMOVE_ICON` | chip 圆角 **8px**、移除钮圆角 **4px**、X 图标 **12×12**、stroke-width **1.5** | PASS |

说明：附件粘贴/拖入夹具使用完整 1×1 PNG 字节（与桌面UI 的夹具修正一致）；缩略图 `src` 为 `data:image/png;base64,…`，无 CSP 违规。SU 没有独立的 uiux-v2 段，其行为与样式由本冒烟 3 档 + 上述样式断言覆盖。

## 五、bench（PM §10.3；通过）

新测量会话：预热（旧 20.4ms / 新 17.4ms，原始值保留不计），之后新旧交替 3 有效轮：

| 指标 | 旧中位 | 新中位 | 阈值 | 判定 |
| --- | --- | --- | --- | --- |
| stormA.maxGap | 23.1（23.1/24.1/17.7） | **18.9**（20.2/17.6/18.9） | ≤ max(23.1,25) | PASS |
| stormB.maxGap | 17.5（17.5/17.5/17.7） | **19.9**（19.9/33.3/18.6） | ≤ max(17.5,25) | PASS |
| stormA_handler.maxMs | 10.3 | 0.3 | ≤ max(12.4,15.3) | PASS |
| stormB_handler.maxBatchMs | 0.5 | 0.3 | ≤ max(0.6,5.5) | PASS |
| replay.replayMs | 14.0 | 5.2 | ≤ max(16.8,19.0) | PASS |
| scrollToBottom.ms | 17.1 | 10.4 | ≤ max(20.5,22.1) | PASS |

新有效轮 maxGap 全部：20.2/19.9/17.6/33.3/18.9/18.6 → **p95=33.3ms ≤35**、单轮最大 33.3ms ≤50。结论：CSS 变更未造成滚动/布局回归；**通过**。保留：stormB 单轮 33.3ms 接近 p95 上限（仍 <35），属单轮抖动；按 §10.3 规则 5，后续热路径变更仍需重新重基线。

## 六、uiux-v2 受影响段（新入口；无回退）

| 段 | 报告条目 / 布尔 | 通过 | 失败 |
| --- | --- | --- | --- |
| JUDGE | 33 / 33 | 33 | — |
| G2_RECOVERY | 5 / 5 | 5 | — |
| TERMINAL | 22 / 22 | 22 | — |
| TOOLFOLD | 19 / 17 | 17 | —（C1 仍 Δ=**16px**，150→166，非累积） |

未出现新的失败名；此前 3B 报告中登记的 B 类 Phase 4 失败项（默认段工作概览、SEND_FACTS P7、QUEUE_VIEW）不在本次受影响段内，未重新触发/未改变归属。SU 由冒烟覆盖（§四）。

## 七、与桌面UI 自述的差异

1. gzip：其 240,133B；本次重建 241,273B（+1,140B，实例差异），均远低于预算。
2. 其记录仍写「单测新增 16 项、累计 33」；实际 confirm-logic 8 + judge 7 = **新增 15**（累计 33），与 3B 主报告同款文字笔误，不影响门禁。
3. 其余五项修正的声明值与本次独立实测**逐项一致**。

## 八、未验证

真实模型/网络与真实主进程卡通道、打包、Windows/DPI/屏读、main.mjs 与全量双端（Phase 5）、Phase 4 功能面、`onError` 通用占位（评审 §七，留 Phase 4）。

## 九、边界核对

- 只写：本报告、`角色卡/测试/docs/change/2026-10-21-phase3b-fix-verification-evidence/`、本角色 `memo.md`/`changelog.md`。在 `角色卡/测试/` 内。
- 未改产品代码、构建配置、测试或其他角色文件；按派发删除并重建 `app/renderer/dist/`；未 commit/push。

## 附：复跑命令

```bash
rm -rf app/renderer/dist && npm run typecheck:renderer && npm run build:renderer
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase3b-fix-verification-evidence/electron-smoke/independent-smoke.cjs
node --test test/桌面UI/*.test.ts && node --test test/桌面应用/*.test.ts
ANS_RENDERER_ENTRY=… ANS_IME_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs
./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs
# bench：预热 1 轮/目标不计 + 新旧交替 3 有效轮（见 bench/）
ANS_JUDGE_UI_ONLY=1 / ANS_G2_RECOVERY_UI_ONLY=1 / ANS_TERMINAL_UI_ONLY=1 / ANS_TOOLFOLD_UI_ONLY=1 \
  ANS_RENDERER_ENTRY=… ANS_UIUX_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs
```
