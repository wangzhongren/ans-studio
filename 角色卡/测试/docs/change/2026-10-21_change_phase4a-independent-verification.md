---
id: ui-platform-phase4a-independent-verification
type: change
title: UI 平台化 Phase 4A（引擎/设置/资料/工作概览/队列抽屉）独立验证
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase4a-scope, ui-platform-phase4a-design, ui-contract-surface, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: created
    summary: 4A 独立验证：干净重建、单测/基线/IME/懒挂载、自写 26 项离线 IPC 冒烟、PM §10.3 bench、uiux-v2 八段复跑、C1/C2 与契约核对；4A 门通过，可进 4B
---

# Phase 4A：独立验证（测试角色）

受验对象：桌面UI 的 [Phase 4A 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md) 与 [4A 证据](../../../桌面UI/docs/change/2026-10-21-phase4a-evidence/)；门规：PM [§十二/§十三](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)；台账：[check 台账 §七](2026-10-21_check-ledger-phase3a.md)。候选已变化（3A/3B → 4A），本记录覆盖旧结论中受影响的渲染层部分。独立执行，未复用桌面UI 脚本与结论。

候选基线：HEAD `fc1a39c` + 当前工作树；环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、Electron 44.7.0。证据目录：[2026-10-21-phase4a-verification-evidence](2026-10-21-phase4a-verification-evidence/)。

## 一、结论（pass / needs-work / missing-evidence）

**4A：pass。** 派发列出的检查全部独立执行通过；未发现 4A 实现缺陷。**4A 门结论：通过，可进入 4B**（依 PM §11.2/§十三：4A 通过后才进入 4B）。**needs-work：无；missing-evidence：无**（4A 门所需证据齐全）。

已记录、不阻塞 4A 的事项：

- **C2** `expired old shell shown disabled in its own runtime`：新入口 RUNTIME 段到达且值为 false；旧入口同段**同样失败**（本次独立复跑确认）——PM §13.3 已裁定为「同因既有红」，期望与 3B 已批准的「收起失效 shell 卡 + 原因提示」语义冲突，待 4B/Phase 5 重锚或退役；**不计 4A 新红**。
- **judge 结果行跨引擎重放**：按 PM §13.2 归 4B（4A 冻结 `confirm-store`）；4A 未宣称每引擎 judge 历史完整恢复。
- **默认段 `historical own-template failures direct`**：Phase 5 项（旧模板历史分类），4A 未触碰；非 4A 新红。
- **VISUAL 段 `V2 source report uses separate layered top and facts…`**：4B 报告卡（`.report-source-button`/绿色报告头）范围；非 4A 新红。
- 文档小差异：`ui-contract-surface.md` 行 8（引擎触发器）仍写「选择仅本地演示」，与 4A 真实切换不一致；行 #7/#9/#10/#15/#16/#18/#19/#20 已更新。建议桌面UI 随 4B 文档同步该行（不影响功能）。

## 二、干净重建与静态检查（通过）

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0
npm run build:renderer       # exit 0
```

| 资产 | raw | gzip9 |
| --- | ---: | ---: |
| `dist/assets/index-Bsf1l--C.js` | 745,453B | 246,740B |
| `dist/assets/index-B2KPvJVS.css` | 94,580B | 17,054B |
| `dist/src/index.html` | 583B | 386B |
| **入口引用合计** | — | **264,180B ≤ 300KB（307,200B）** |

桌面UI 报告 263,098B；重建实例差 +1,082B。静态扫描：无内联脚本/`<style>`/`style=`/`unsafe-*`/modulepreload；严格 CSP meta 在位。

## 三、测试、基线、IME、懒挂载（通过）

| 检查 | 结果 |
| --- | --- |
| `node --test test/桌面UI/*.test.ts` | **67/67 pass，exit 0**（4A 新增 runtime-config/runtime-view/document-view/work-view 纯逻辑） |
| `node --test test/桌面应用/*.test.ts` | **679/679 pass，exit 0** |
| IME 新入口 | **24/24 true，E2E_DONE=1，exit 0** |
| 延迟挂载正向检查 | **10/10，exit 0** |
| 旧渲染器核心 / main / preload | 与 HEAD 零 diff；`app/desktop/` 无 tracked 修改 |
| 依赖 | 未新增；Slider 为 copy-in 单文件（复用 `@base-ui/react@1.9.0`）；锁相对 HEAD 仍为 107 新增（3A markdown 升级）；禁入清单零命中 |
| DOM 例外 | 仅两处已批准：`DEFER_TOOL_ROWS_WHEN_CLOSED=40`（3A/PM §10.4）、`ChatRow` 失效 operator 卡 `.op-actions`/动作 `hidden`（PM §13.1，一行级）；未发现第三处 |

说明：`app/desktop/assets/` 出现 8 个未跟踪 PNG（品牌/图标素材），无 tracked 修改；不属 4A 写集，按并行角色产物登记，不影响 4A 验证。

## 四、自写 Electron 离线 IPC 冒烟（26/26，通过）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase4a-verification-evidence/electron-smoke/independent-smoke.cjs)（本角色自写；离线 preload 同目录）。窗口：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`、`show:false`、`loadFile(dist/src/index.html)`。结果 **26/26 true、exit 0**，零 console/CSP/did-fail-load。

- **默认引擎与显式优先**：初始 Claude、`openSession/getSessionHistory` 三元身份均 `claude`。
- **三引擎真实切换**：切 pi → `openSession/getSessionHistory` 均为 pi、pane 显示 `PI-HISTORY`；切 codex → `CODEX-HISTORY` 且无 PI 行；切回 pi → pi 历史恢复、无 codex 行。
- **跨引擎草稿**：pi 下「PI 草稿」→ 切 claude 输入为空 → 写「CLAUDE 草稿」→ 切回 pi 得「PI 草稿」→ 再切 claude 得「CLAUDE 草稿」。
- **迟到/异引擎不覆盖**：claude 当前时推入 `runtime:"pi"` 的 `PI-LATE` 事件，claude pane 不含；切回 pi 后出现（缓存重放）。
- **三引擎设置**：`#pi-panel` 3 个 `role=tab`、pi 选中；secret 输入 `type=password`、value 空、placeholder「已设置，留空则不修改」；Slider `input[type=range]` `aria-valuemin=0`/`max=4`/`now=2`/`aria-valuetext=500000`，隐藏 input 值 `500000`；`ArrowRight` 后 `now=3`、隐藏值 `1000000`；非预设档位回退文本输入 `custom-tier` + `.pi-range-note` 可见。
- **保存状态**：延迟保存在途显示「正在保存…」且 `#pi-save` 禁用；完成「已保存到 .env（改动键：…）。必填配置已齐备。下一次开启会话时应用。」；失败路径「保存失败：保存失败测试」。
- **缺配入口**：切 codex 后 `#runtime-config-notice` 可见「Codex 配置不完整，缺：CODEX_API_KEY。请补齐后保存。」；点击 `#runtime-config-settings` 打开设置且 codex tab 选中、`#pi-inp-CODEX_API_KEY` 存在。
- **读取失败/重试/晚到守卫**：读取失败显示错误与 `#pi-retry-read`，重试后字段恢复；pi 延迟读取期间切到 claude tab，晚到结果不覆盖当前面板（仍 claude 字段、无 pi 字段）。
- **角色资料/文档**：`details[data-section]` 恰 `card,boundary,changes,docs`；「查看已列文档」→ 列表 1 项；只读打开显示「文档正文」且无 `<script>`、状态「只读文档 · 24 字节」；返回列表/角色资料焦点仍在抽屉内；首次读取 `NOT_FOUND` 显示「文档不存在。」+ 重试按钮，重试成功显示内容。
- **工作概览**：待处理「待定位卡」+「定位」按钮、角标 1、无角色文档 `details`；点击定位后抽屉关闭、焦点落在 operator 卡（`closest('.op-request')`）。
- **抽屉队列**：进行中/第 1 位/第 2 位与来源；仅 message 可撤回；成功撤回调用精确 target/id，随后由真实 role-state 快照刷新位次（不伪造就地成功文案）；失败路径就地回执「撤回无效：消息已投递」。
- **失效 operator 卡**：`data-state=expired`、`.op-actions` 与动作按钮 `hidden=true` 且 `disabled`、原因「请求已失效原因」可见、卡片容器保留。
- **左树单计数**：`.ti-count` 唯一数字「3」（当前工作 1 + 排队 2），title/aria「当前工作 1 项，排队 2 项」；`.ti-status` 只显示「工作中」、不含「待办」。
- 截图 `electron-smoke/phase4a.png`（工作概览/队列/失效卡/单徽标/草稿）。

## 五、bench（PM §10.3；通过）与 C1

新测量会话：预热（旧 17.6ms / 新 23.1ms，原始值保留不计），之后新旧交替 3 有效轮：

| 指标 | 旧中位 | 新中位 | 阈值 | 判定 |
| --- | --- | --- | --- | --- |
| stormA.maxGap | 25.0（25.0/27.5/17.7） | **17.6**（20.6/17.6/17.6） | ≤ max(25.0,25) | PASS |
| stormB.maxGap | 17.6（17.6/17.7/17.6） | **18.7**（18.7/20.5/18.0） | ≤ max(17.6,25) | PASS |
| stormA_handler.maxMs | 11.5 | 0.6 | ≤ max(13.8,16.5) | PASS |
| stormB_handler.maxBatchMs | 1.2 | 0.8 | ≤ max(1.4,6.2) | PASS |
| replay.replayMs | 20.5 | 6.5 | ≤ max(24.6,25.5) | PASS |
| scrollToBottom.ms | 18.4 | 14.6 | ≤ max(22.1,23.4) | PASS |

新有效轮 maxGap 全部：20.6/18.7/17.6/20.5/17.6/18.0 → **p95=20.6ms ≤35**、单轮最大 20.6ms ≤50。**通过。**
**C1**：TOOLFOLD 同机同日新入口 `150→166` **Δ=16px**（非累积），旧 Δ=32、目标 ≤20、Phase 5 判据新 Δ≤32——满足。

## 六、uiux-v2 八段独立复跑（新入口）

| 段 | 条目 / 布尔 | 通过 | 失败名 | 归属 |
| --- | --- | --- | --- | --- |
| SELECTOR | 27 / 27 | 27 | — | — |
| CONFIG | 21 / 21 | 21 | — | — |
| ROLE_RETURN_FOCUS | 11 / 9 | 9 | — | — |
| SEND_FACTS | 8 / 8 | 8 | — | —（P7 每引擎会话已转绿） |
| RUNTIME | 16 / 15 | 14 | `expired old shell shown disabled in its own runtime` | **C2 同因既有红**（旧入口同段同样失败，本次已复跑确认）；PM §13.3 待 4B/5 重锚 |
| 默认 | 48 / 45 | 44 | `historical own-template failures direct` | **Phase 5**（旧模板历史分类；台账 B2 Phase 5）；4A 项 `one independent work list…`、队列/资料/草稿几何等均 PASS |
| VISUAL | 5 / 4 | 3 | `V2 source report uses separate layered top and facts before primary source and full copy` | **4B**（报告全文/source 卡） |
| TOOLFOLD | 19 / 17 | 17 | —（C1 Δ=16） | — |

**QUEUE_VIEW 未运行**（PM §12.1 裁定属 4B）。默认段已越过第 9 项，4A 目标项（`one independent work list without duplicated role documents`、`snapshot keeps independent role document open`、`role/queue/pi geometry 1360/960`、`growing composer avoids drawer`、`success uses real returned snapshot`）全部 PASS。**所有失败均为台账 B/C 类（4B/5 或既有红），不是 4A 缺口；断言未弱化。**

## 七、契约面 / 台账 / 驱动核对

- 契约面行 #7/#9/#10/#15/#16/#18/#19/#20 已更新为「已满足（4A）」且与实现一致；行 8 文本仍写「选择仅本地演示」，与真实切换不符（文档滞后，建议 4B 同步）。
- 驱动：`selectRuntime` 为真实 Promise 切换；`openPiPanel/loadPiConfig/savePiConfigFromForm/piKeys` 可用；`state.rightTab` 扩展为 `card|work|pi|document|null`；`driver-extensions/*` 已挂注册器（4A 空实现）。
- DOM 例外：仅延迟挂载（40）与失效 operator 卡动作 hidden（PM §13.1）；无新增例外。
- 台账：4A 50 / 4B 21 / Phase 5 11（82 分母）+ QUEUE_VIEW 另 3 名归 4B（§12.1 已更正）；本轮失败项均落在 4B/5/C 类。
- 渲染侧语义：无 `node:`/`require(`/`fs`/`ipcRenderer` 直连；无 `resolveWrite/classifyShell/evaluateGate/resolveBoundary`（无第二份边界判定）。

## 八、与桌面UI 自述的差异

1. uiux 计数：其 SELECTOR「26/26（报告 27）」、CONFIG「20/20（报告 21）」；本次按布尔检查计 SELECTOR 27/27、CONFIG 21/21（含观察条目口径差异），失败名一致。
2. gzip：其 263,098B；本次 264,180B（+1,082B，实例差异）。
3. 其余（RUNTIME 唯一 C2、默认 Phase 5 项、VISUAL 4B、bench、C1=16、单计数、失效卡隐藏）均独立复现一致。
4. 其记录仍写「单测新增 16 项」为 3B 遗留笔误（实为 15）；4A 新增 4 个文件后总 67 一致。

## 九、未验证 / 覆盖边界

1. 真实模型/网络、真实 `.env` 写入与主进程文档读取：冒烟用离线替身（只验证渲染侧消费与状态机）。
2. 打包安装包、Windows/DPI/200% 文字/屏读、`prefers-reduced-motion`：本机 macOS。
3. `main.mjs` 整机自检、全量双端逐 check 名对照、入口切换：Phase 5。
4. QUEUE_VIEW 与 4B 面（治理三权/镜像/排队聚合、治理记录动作、报告全文/persistence/delivery、operator 镜像、`replayAnchorDebug`、judge 跨引擎重放）：4B。
5. 长队列 `查看更多` 上限/长转录手感、真实键盘 Tab 全链：未逐项覆盖。

## 十、边界核对

- 只写：本报告、`角色卡/测试/docs/change/2026-10-21-phase4a-verification-evidence/`、本角色 `memo.md`/`changelog.md`/`feature-map.md`。在 `角色卡/测试/` 内。
- 未改产品代码、构建配置、测试或其他角色文件；按派发删除并重建 `app/renderer/dist/`；未 commit/push。

## 附：复跑命令

```bash
rm -rf app/renderer/dist && npm run typecheck:renderer && npm run build:renderer
node --test test/桌面UI/*.test.ts && node --test test/桌面应用/*.test.ts
ANS_RENDERER_ENTRY=… ANS_IME_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs
./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase4a-verification-evidence/electron-smoke/independent-smoke.cjs
# bench：预热 1 轮/目标不计 + 新旧交替 3 有效轮（见 bench/）
# uiux：ANS_SELECTOR_UI_ONLY / ANS_CONFIG_UI_ONLY / ANS_ROLE_RETURN_FOCUS_UI_ONLY / ANS_SEND_FACTS_UI_ONLY /
#       ANS_RUNTIME_UI_ONLY / 默认 / ANS_VISUAL_V2_UI_ONLY / ANS_TOOLFOLD_UI_ONLY（QUEUE_VIEW 属 4B，不跑）
```
