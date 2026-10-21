---
id: ui-platform-phase4a-fix-reverification
type: change
title: Phase 4A UIUX M1–M6 修正聚焦重验
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase4a-independent-verification, ui-platform-phase4a-scope, ui-platform-phase4a-design, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: created
    summary: 候选变化后聚焦重验：重建、单测/基线/IME/懒挂载、自写 32 项冒烟（M1–M6 + 原 4A 面）、bench、uiux 八段；全部通过，4A 门保持通过
---

# Phase 4A M1–M6 修正：聚焦重验（测试角色）

**候选变化**：桌面UI 按 UIUX 4A 评审修正 M1–M6（队列独立子视图、撤回成功/失败 system 行、设置 Tabs 键盘、保存条两行完整状态、角色头状态-only、960/200%），见 [4A 变更记录 §三·五](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)；桌面UI 冒烟更新至 99 项/28 图。本记录独立执行，未复用其脚本；原 4A 面回归保留。

候选基线：HEAD `fc1a39c` + 当前工作树；环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、Electron 44.7.0。证据目录：[2026-10-21-phase4a-fix-verification-evidence](2026-10-21-phase4a-fix-verification-evidence/)。

## 一、结论（pass / needs-work）

**pass。** M1–M6 修正均按声明生效且未引入回退；**4A 门保持通过，可继续 4B**。**needs-work：无。**

## 二、干净重建与门禁（通过）

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0
npm run build:renderer       # exit 0
```

gzip9：JS 247,478B + CSS 17,116B + HTML 389B = **264,983B ≤ 300KB**（桌面UI 报告 263,904B，实例差 +1,079B）；CSP 静态扫描零内联/严格 meta。单测 **67/67**、旧基线 **679/679**、IME **24/24**、懒挂载 **10/10**；旧渲染器核心/main/preload 零 diff；依赖未新增；DOM 例外仍为已批准的两处（延迟挂载 40、失效 operator 卡 hidden）。

## 三、自写 Electron 冒烟（32/32，通过）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase4a-fix-verification-evidence/electron-smoke/independent-smoke.cjs)（本角色自写，在原 4A 26 项基础上补充 M1–M6）。结果 **32/32 true、exit 0**，零 console/CSP/did-fail-load。原 4A 面（引擎切换/草稿/设置/资料/文档/工作概览/失效卡/单计数）全部保持 true。

### M1 队列独立子视图

- 预览：当前工作 1 + 排队前 **3**（`.q-item` 共 4）；`查看全部队列（6）`（总数含进行中）；`#right-queue-body` **唯一**；标题「A · 工作概览」。
- 子视图：点击后标题 **「A · 队列」**、`#right-queue-body` 仍唯一、全量 **6** 项；焦点落在 `.queue-back`；「返回」回到「A · 工作概览」且焦点回 `.queue-view-all`；再次进入后按 **Esc 返回来源视图**（抽屉保持打开）。

### M2 撤回回执

- 成功：`withdrawQueued` 调用后 **新增 system 行**「已撤回排队消息：…」（`#chat .sys-call` delta ≥1）；位次仍由真实 role-state 快照刷新（不乐观移除）。
- 失败：**就地 `.q-feedback`「撤回无效：…」+ system 行「撤回无效：…」** 同时出现。

### M3 设置 Tabs 键盘/ARIA

- roving：恰一个 `tabIndex=0`、两个 `-1`；三个 tab `aria-controls="pi-engine-panel"`、`id=pi-engine-tab-<engine>`；面板 `role=tabpanel`、`aria-labelledby` 指向当前 tab。
- 键盘：ArrowRight → codex 选中并聚焦；End → claude；Home → pi；切换即更新配置视图（保存/字段逻辑未变）。

### M4 保存条状态（1360 / 960 / 200%）

- `.pi-save-bar` 高 **64px**；`#pi-status` 在两行内完整呈现（clientHeight 28 / scrollHeight 28，无截断）；1360、960 与 Electron `zoomFactor=2` 三档均通过；200% 下页面无横向溢出；状态文本/标题含应用时点（「…应用」），完整逐键与 application 在 `title`/aria-live。

### M5 角色头状态-only

- 角色头 `.role-status` 只显示「工作中」等状态文字，不含「待办」或计数；数量只在 `.ti-count`、队列预览标题与「查看全部队列（N）」。

### M6 失效卡与单计数（回归保持）

- 失效 operator 卡：`data-state=expired`、动作 `hidden+disabled`、原因可见、容器保留。
- 左树：`.ti-count` 唯一数字「3」（当前 1+排队 2），title/aria「当前工作 1 项，排队 2 项」；状态标签不含「待办」。

## 四、bench（PM §10.3；通过）与 C1

预热（旧 18.9ms / 新 21.1ms，原始值保留不计）+ 3 有效轮交替：

| 指标 | 旧中位 | 新中位 | 阈值 | 判定 |
| --- | --- | --- | --- | --- |
| stormA.maxGap | 17.8（25.6/17.8/17.6） | **17.5**（17.3/18.2/17.5） | ≤ max(17.8,25) | PASS |
| stormB.maxGap | 17.5 | 17.7 | ≤ max(17.5,25) | PASS |
| stormA_handler.maxMs | 9.5 | 0.5 | ≤ max(11.4,14.5) | PASS |
| stormB_handler.maxBatchMs | 0.6 | 0.8 | ≤ max(0.7,5.6) | PASS |
| replay.replayMs | 19.5 | 6.2 | ≤ max(23.4,24.5) | PASS |
| scrollToBottom.ms | 15.6 | 12.8 | ≤ max(18.7,20.6) | PASS |

新有效轮 maxGap 全部：17.3/17.4/18.2/18.0/17.5/17.7 → **p95=18.2ms ≤35**、单轮最大 18.2ms ≤50。**通过。**
**C1**：TOOLFOLD 新入口 `150→166` **Δ=16px**（≤32、≤20 目标，非累积）。

## 五、uiux-v2 受影响段（新入口；无回退）

| 段 | 条目 / 布尔 | 通过 | 失败名 | 归属 |
| --- | --- | --- | --- | --- |
| SELECTOR | 27 / 27 | 27 | — | — |
| CONFIG | 21 / 21 | 21 | — | — |
| ROLE_RETURN_FOCUS | 11 / 9 | 9 | — | — |
| SEND_FACTS | 8 / 8 | 8 | — | — |
| RUNTIME | 16 / 15 | 14 | `expired old shell shown disabled in its own runtime` | **C2 同因既有红**（§13.3） |
| 默认 | 48 / 45 | 44 | `historical own-template failures direct` | **Phase 5**（旧模板历史分类） |
| VISUAL | 5 / 4 | 3 | `V2 source report uses separate layered top and facts…` | **4B**（报告全文/source 卡） |
| TOOLFOLD | 19 / 17 | 17 | —（C1 Δ=16） | — |

与修正前逐段一致，**无新增失败名/无回退**；失败仍全部落在台账 B/C 类（4B/5/C2），不是 4A 缺口；QUEUE_VIEW 未运行（4B）。

## 六、观察与差异

1. **队列子视图与 Tab 切换（非阻断观察）**：在队列子视图打开时点击会话头「角色资料」，`queueView` 仍保留，抽屉继续显示队列子视图（标题「角色」·队列），而不是角色资料。M1 只规定了返回按钮/Esc 的返回语义，未规定 Tab 点击；建议 UIUX/桌面UI 确认是否为预期，或让 tab 切换清空 `queueView`。
2. gzip +1,079B（实例差异）；其余 M1–M6 声明值与本次独立实测逐项一致。
3. uiux 计数口径同前（布尔 vs 报告条目），失败名一致。

## 七、未验证

真实模型/网络、真实 `.env` 写入与主进程文档读取（离线替身）、打包、Windows/DPI/屏读、main.mjs 与全量双端（Phase 5）、4B 面（QUEUE_VIEW、治理/镜像/报告全文/persistence/delivery/replayAnchorDebug、judge 跨引擎重放）。

## 八、边界核对

- 只写：本报告、`角色卡/测试/docs/change/2026-10-21-phase4a-fix-verification-evidence/`、本角色 `memo.md`/`changelog.md`。在 `角色卡/测试/` 内。
- 未改产品代码、构建配置、测试或其他角色文件；按派发删除并重建 `app/renderer/dist/`；未 commit/push。

## 附：复跑命令

```bash
rm -rf app/renderer/dist && npm run typecheck:renderer && npm run build:renderer
node --test test/桌面UI/*.test.ts && node --test test/桌面应用/*.test.ts
ANS_RENDERER_ENTRY=… ANS_IME_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs
./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase4a-fix-verification-evidence/electron-smoke/independent-smoke.cjs
# bench：预热 1 轮/目标不计 + 新旧交替 3 有效轮（见 bench/）
# uiux：SELECTOR/CONFIG/ROLE_RETURN_FOCUS/SEND_FACTS/RUNTIME/默认/VISUAL/TOOLFOLD
```
