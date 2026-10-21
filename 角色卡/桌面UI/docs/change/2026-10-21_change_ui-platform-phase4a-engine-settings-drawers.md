---
id: change-ui-platform-phase4a-engine-settings-drawers
type: change
title: Phase 4A —— 引擎真实切换、三引擎设置、角色资料/文档、工作概览与队列抽屉
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-and-verified（4A 范围内；PM §十三 两处裁定已落地）
related: [ui-platform-phase4a-scope, ui-platform-round-review, ui-platform-phase4a-design, ui-contract-surface, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: updated
    summary: UIUX Phase 4A 评审 M1–M6 修正——队列独立子视图（标题/返回/>3 查看更多）、撤回成功/失败 system 行、设置 Tabs 键盘（←→/Home/End/roving/aria）、保存条两行完整状态、角色头状态-only、960 焦点/Esc/inert 与 200% 证据；重跑门禁/bench/C1
  - date: "2026-10-21"
    kind: updated
    summary: PM §十三 裁定落地——批准并实施 ChatRow 失效 operator 卡动作隐藏（最小冻结例外）、左树单计数（.ti-count 唯一数字，状态标签只表达状态）；judge 跨引擎重放归 4B、C2 同因既有红待 4B/5；重跑门禁与证据
  - date: "2026-10-21"
    kind: implemented
    summary: 按 PM §十二放行与 UIUX 4A 设计实现引擎真实切换/每引擎视图与会话/跨引擎草稿、三引擎设置面板（Slider copy-in）、角色资料与文档只读、工作概览、队列抽屉、扩展点；通过 typecheck/build/CSP/gzip/单测/IME/懒挂载/4A 冒烟/bench/C1；uiux-v2 SELECTOR/CONFIG/ROLE_FOCUS/SEND_FACTS 全绿，RUNTIME 到达一处 ChatRow 冻结文件阻塞项（其后由 PM §十三 解除并通关），默认段与 VISUAL 到达 4B/5 边界
---

# Phase 4A 实施记录：引擎真实切换、三引擎设置、角色资料/文档、工作概览与队列抽屉

**依据**：PM [4A 复核与放行 §十二 + 实施期 §十三](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（QUEUE_VIEW 归 4B、Slider 单文件例外、Sidebar 最小修改、工作概览定位深度）、UIUX [4A 设计附录](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4a-design.md) 与原型证据、桌面UI [4A 范围与写集](../design/2026-10-21_design_ui-platform-phase4a-scope.md)、测试台账 §七。

**状态**：4A 范围内已实现并验证；不是 Phase 4 完成、不是最终验收。全量双端、`main.mjs` 整机自检、入口切换与打包属 Phase 5；治理三权/镜像/排队聚合/报告全文/persistence/delivery/`replayAnchorDebug` 属 4B。

## 一、4A 各面与旧实现对应

| 4A 面 | 新渲染器实现 | 旧实现对照（只读） |
| --- | --- | --- |
| 引擎真实切换与每引擎视图 | `chat/runtime-view.ts`（纯逻辑：视图键/路由/重放/代际）+ `chat/ipc.ts`（录制与切换编排）。切换：保存旧视图事实（持续按项目×引擎录制载荷引用）→ `resetPanes` + 清角色忙/队列快照 → 先放历史 → 重新 `openSession/getSessionHistory`（目标引擎三元身份）→ 再按到达序重放 events/role-state/operator 卡/失效/排队/shell/恢复 → 配置提示刷新。不调 `session:stop` | `renderer.js` `captureRuntimeView/installRuntimeView/deliverRuntimePayload`（L1240–1321）、`selectRuntime`（L1293） |
| 每引擎会话/历史/草稿 | `chat-store.selectRole` 使用 `uiStore.runtime` 打开/读取三元身份；`Composer.tsx` 草稿与附件键从 role 扩为 `runtime×role`（内存；成功发送/显式移除/切项目清除）；切换时保存旧稿、恢复目标稿；迟到旧引擎拒发只回填旧视图草稿、不触碰当前视图 | `sessionTarget/selectRole`、`composerDrafts` 按 runtime 视图快照（旧 `captureRuntimeView` 内含 `composerDrafts`） |
| 三引擎设置 | `chat/runtime-config.ts`（纯逻辑）+ `stores/settings-store.ts`（按引擎缓存/版本守卫/通知）+ `shell/SettingsPanel.tsx`。字段/必填/秘密/choices/control/help 全来自 `getRuntimeConfig` 元数据；Pi 三必填 + 推理 select + 高级两项 range；Codex/Claude 字段；secret password + 显示/隐藏（值恒空、不回显）；长档位用新 `components/ui/slider.tsx`（Base UI Slider copy-in）+ output + hidden 规范值；非预设值回退文本 + amber；固定 64px 保存条（状态两行完整呈现）；Tabs ←/→/Home/End + roving tabindex + aria-controls/tabpanel；保存 loading/saved/missing/error/晚到守卫；`.env` 写入只走主进程 | `renderer.js` `applyPiView/syncRange/bindRangeControl/loadPiConfig/savePiConfigFromForm/renderPiConfigWarning`（L4292–4660）、`engine-selector.js`、`runtime-ui.js` 标签映射 |
| 缺配提示 | `ChatHeader` 会话头下 `#runtime-config-notice/#runtime-config-message/#runtime-config-settings`；仅当前引擎缺项/读取失败显示；文案逐字；键盘可达；打开当前引擎设置 | `renderRuntimeConfigNotice`（L4471） |
| 角色资料抽屉 | `stores/drawer-store.ts`（tab/阅读状态/文档子视图/焦点/撤回回执）+ `shell/ProfilePanel.tsx`：角色头（状态只表达状态，计数不混写）、四节 `<details data-section="card|boundary|changes|docs">`（Markdown 受控管线；节开合/内外层滚动按 角色×引擎×项目）；待办/队列预览（前 3 + 查看全部）；`查看已列文档` | `renderRight` 角色资料段（L6050–6080）、`drawerReading` |
| 文档只读 | `chat/document-view.ts`（纯逻辑：错误码/链接/回包校验）+ `shell/DocumentView.tsx`：显式选择才读（opaque projectViewId/documentId）、Markdown/文本、错误码如实 + 重试、返回列表/角色资料焦点、外部链接 `openExternal`、内部相对链接命中已列文档则打开、迟到读取失效 | `documentList/renderDocumentView/readDocument/refreshDocumentList/onDocumentAction`（L4502–4614） |
| 工作概览 | `chat/work-view.ts`（纯逻辑）+ `shell/WorkOverview.tsx`：待处理（待确认/待选择 + 定位）、当前工作、排队、最近回交（按真实报告身份去重）；`#right-queue-body` 唯一；不重复角色文档；badge = 待处理数 | `pendingRequestsHtml/workListHtml/currentWorkReports/updateWorkReports`（L5868–5930、L6015–6050） |
| 队列抽屉区 | `shell/QueuePanel.tsx` + `shell/QueueSubview.tsx`：工作概览/资料仅预览（当前 + 前 3 条排队，>3 显示「查看全部队列」）；同一 424 抽屉的子视图标题 `<角色> · 队列`、返回来源视图、当前/排队全量（简单上限 50）；位次/来源/时间/摘要/全文/仅客户消息未投递可撤回/就地回执 + 成功/失败 system 行；成员唯一来自 `session:role-state`；展开与回执按角色×引擎保存 | `queueViewsFor/queueRowsHtml/withdrawQueuedMessage/updateRightQueue`（L5664–5814、L5916–5929）、`sysRow` 成功/失败回执 |
| 角标 | 工作概览角标 = 待确认/待选择数；角色资料角标 = 当前工作+排队；左树角色行 `.ti-count` 显示同一「当前+排队」计数（PM §12.3 #1）；含 aria-label，99+ 封顶 | 旧 `setTabBadge('work', views+openRequests)`（F7 合并计数）→ 按 PM 裁定拆分 |
| Sidebar 最小修改 + 单计数 | `#tab-pi` 启用（去演示 title；按项目启用；经 drawer-store 打开设置；title/aria「<引擎> 设置」）；**单计数**（PM §十三）：`.ti-count` 是唯一可见数字（当前+排队），状态标签用 `statusBadge(status, 0)` 只表达状态（工作中/空闲/等待你确认/错误），队列深度进 `.ti-count` 的 title/aria-label 与工作概览；树分组改为扁平 `.tree-group` 兄弟节点并按组内组长在前；拖拽/收起/宽度/导入未改 | `renderTabs/selectRuntime`、`roleGroups` 组长排序、`statusBadge` |
| 失效 operator 卡动作隐藏（冻结例外） | `chat/ChatRow.tsx`：`closed` 时 `.op-actions` 及 confirm/deny/submit/cancel 加 `hidden`（保留 disabled/finalNote/aria/卡片容器）；旧 `freezeOperatorCard` 同义；PM §十三 批准，仅此一处 | 旧 renderer.js `freezeEntryCards/freezeOperatorCard` |
| Slider | `app/renderer/src/components/ui/slider.tsx`（base-nova copy-in，`@base-ui/react/slider`，零新增依赖）；仅 Pi 两个 7 档 range；aria-valuemin/max/now + valuetext、键盘 ←→/Home/End、焦点环；hidden input 持规范值；不出现第二套 slider | 旧原生 `input[type=range]` + `syncRange`（L4331–4366） |
| 扩展点 | `chat/extensions/README.md`（`import.meta.glob("./extensions/*.ts")` → `install(bridge)=>cleanup`，4A 空实现）；`driver-extensions/README.md`（`import.meta.glob("../driver-extensions/*.ts")` → 合并驱动，4A 空实现） | — |

### 1.1 事件路由（唯一新增判定）

- 当前视图（显式 runtime 等于当前；**缺省 runtime 属于当前视图**，沿新渲染器 `envelopeMatches`「缺省不猜」）→ 现有 store；
- 异引擎 → 该引擎 `runtime-view` 缓存（只存载荷引用，不解析正文、不深拷贝）；
- 旧项目（显式 `projectRoot` 与当前项目不符）→ 丢弃（当前视图与缓存都不接收）；
- 切回：history（先）→ events（到达序）→ role-state（每角色最新）→ operator 卡（到达序）→ 失效回执 → 排队卡 → shell/恢复卡 → judge 结果；
- 失效/作答后缓存同步定格：切回不复活已收起的 shell 卡；已答 operator 卡以失效态重放（`.op-note` 原因如实）。

## 二、文件清单

**新增（`app/renderer/src/`）**：`chat/runtime-config.ts`、`chat/runtime-view.ts`、`chat/document-view.ts`、`chat/work-view.ts`、`stores/settings-store.ts`、`stores/drawer-store.ts`、`shell/SettingsPanel.tsx`、`shell/ProfilePanel.tsx`、`shell/WorkOverview.tsx`、`shell/QueuePanel.tsx`、`shell/QueueSubview.tsx`、`shell/DocumentView.tsx`、`shell/phase4a.css`、`components/ui/slider.tsx`、`chat/extensions/README.md`、`driver-extensions/README.md`。

**修改（`app/renderer/src/`）**：`chat/ipc.ts`（路由/切换/扩展注册）、`shell/Drawer.tsx`（tab 面板/常驻挂载/inert/焦点/滚动）、`shell/ChatHeader.tsx`（工作概览/设置入口/角标/缺配条/引擎真实切换）、`shell/EngineSelect.tsx`（真实切换/禁用/aria-busy/右对齐 placement）、`shell/Composer.tsx`（草稿 runtime×role/切项目清除/迟到拒发）、`shell/Sidebar.tsx`（PM 补正最小修改 + §十三 单计数）、`chat/ChatRow.tsx`（**仅** PM §十三 批准的失效 operator 卡动作 `hidden`，一处）、`test-driver.ts`（selectRuntime 真实语义/openPiPanel/loadPiConfig/savePiConfigFromForm/piKeys/rightTab 扩展/驱动扩展点）、`lib/platform.ts`（只读声明新通道）。

**测试**：`test/桌面UI/runtime-config.test.ts`、`runtime-view.test.ts`、`document-view.test.ts`、`work-view.test.ts`、`phase4a-electron-smoke.mjs`、`phase4a-smoke-preload.cjs`。

**角色文档**：本文件、[证据目录](2026-10-21-phase4a-evidence/)、[组件台账](../feature/ui-components.md)、[契约面](../feature/ui-contract-surface.md)、feature-map/memo/changelog/functional-description/api-spec 同步。

**未修改**：`App.tsx`、`chat/chat-store.ts`、`chat/ChatStream.tsx`、`chat/events.ts`、`chat/judge.ts`、`stores/confirm-store.ts`、`chat/confirm-logic.ts`、`shell/shell.css`、`main.tsx`、现有 `components/ui/**`（Slider 为唯一新增）、`package.json`/`package-lock.json`、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器、根配置、其他角色。`ChatRow.tsx` 仅按 PM §十三 例外改一处（见 §五）。

## 三、门禁与真实验证（本机 2026-10-21）

### 3.1 静态/构建

- `npm run typecheck:renderer`：0 错；`npm run typecheck`：0 错；`npm run build:renderer`：成功。
- CSP：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;`；无 inline script/style、无 unsafe-inline/eval（grep 0）。
- gzip（level 9，入口引用资源）：HTML 390B + JS 246,420B + CSS 17,094B = **263,904B ≤ 300KiB**。

### 3.2 测试

- `node --test test/桌面UI/*.test.ts`：**67/67**（含 4A 新增 4 个纯逻辑文件；无 DOM/JSX）。
- `node --test test/桌面应用/*.test.ts`：**679/679**（旧基线；未触碰旧渲染器/守卫断言）。
- IME 新入口：**24/24 true** + `E2E_DONE=1`。
- 延迟挂载（`test/测试/phase3a-lazy-toolgroup-check.mjs`，新入口）：**10/10 passed**。
- 4A Electron 离线 IPC 冒烟（`phase4a-electron-smoke.mjs`，新入口，UIUX 修正后）：**checks=99 failures=0**；含 **28 张截图**（1360/960；队列子视图、撤回成功/失败 system 行、Tabs 键盘态、保存条完整状态、资料状态-only、960 焦点/Esc/inert、200%）。
- 3B 冒烟回归（`phase3b-electron-smoke.mjs`，新入口，UIUX 修正后）：**45/45**。

### 3.3 uiux-v2 新入口（逐段到达）

| 段 | 结果 |
| --- | --- |
| `ANS_SELECTOR_UI_ONLY` | **26/26 通过**（报告数 27；含默认 Claude/三引擎提交/键盘/几何/缺配入口/长标签） |
| `ANS_CONFIG_UI_ONLY` | **20/20 通过**（报告数 21；含读取失败/晚到/保存失败/read-fail-after-save/秘密清空/application） |
| `ANS_ROLE_RETURN_FOCUS_UI_ONLY` | **9/9 通过**（报告数 11；含嵌套阅读/角色/引擎隔离/焦点） |
| `ANS_SEND_FACTS_UI_ONLY` | **8/8 通过**（含关闭 `P7 old runtime rejected result cannot disable current runtime or overwrite draft`） |
| `ANS_RUNTIME_UI_ONLY` | **13/14 通过（PM §十三 后）**：`Pi own history background queue draft and expired card restored` 已通过（`.op-confirm.hidden=true`）；唯一失败为 C2 `expired old shell shown disabled in its own runtime`——PM §十三 确认同因既有基线红，待 4B/5 重锚，不阻塞 4A |
| 默认段 | 通过到 `success uses real returned snapshot`；在 **Phase 5 项** `historical own-template failures direct` 失败（旧源码守卫/历史分类，归 Phase 5；4A 项 `one independent work list without duplicated role documents` 与队列/资料/草稿项全过） |
| `ANS_VISUAL_V2_UI_ONLY` | 通过 `V2 ordinary chat stays ordinary …`、`V2 accepted structural positions …`、`V2 ordinary chat work overview has no invented report`；在 4B 报告卡 `V2 source report uses separate layered top and facts …` 失败（4B 范围，未宣称 VISUAL 全段） |
| `ANS_TOOLFOLD_UI_ONLY` | **19 项全过**；C1 `fold anchor offsets`：before 150 → after 166 → later 166，**Δ=16（≤32，目标≤20）且不累积** |
| `ANS_QUEUE_VIEW_UI_ONLY` | 4B（PM §12.1 裁定），4A 未运行/未宣称 |

### 3.4 bench（PM §10.3 同机同日旧/新交替 4 轮，首轮预热，2–4 轮中位）

| 指标 | 旧 | 新 | 阈值 | 结果 |
| --- | --- | --- | --- | --- |
| stormA maxGap | 18.8ms（19.2/17.6/18.8） | **17.8ms**（22.0/17.8/17.7） | ≤max(旧,25) | 通过 |
| stormB maxGap | 17.7ms（17.7/17.7/17.7） | **17.7ms**（17.7/18.3/17.6） | ≤max(旧,25) | 通过 |
| stormA handler | 12.1ms | **0.4ms** | ≤max(旧×1.2,旧+5) | 通过 |
| stormB handler | 1.5ms | **0.7ms** | 同上 | 通过 |
| replay | 21.3ms | **3.3ms** | 同上 | 通过 |
| scrollToBottom | 14.7ms | **5.1ms** | 同上 | 通过 |

p95（新 maxGap）22.0/18.3 ≤35ms；单轮最大 28.7ms（旧）/22.0ms（新）≤50ms。原始 JSON 与 summary 见证据 `bench/`。

## 三·五、UIUX Phase 4A 评审修正（M1–M6，2026-10-21）

UIUX 评审 [2026-10-21_design_ui-platform-phase4a-review.md](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4a-review.md) 结论 needs-work，列 6 项 4B 前必须；本上下文逐项修正并重跑：

1. **M1 队列子视图**：新增 `shell/QueueSubview.tsx`。工作概览/角色资料只做预览（当前工作 + 前 3 条排队；总数 >3 显示「查看全部队列（N）」）；子视图在同一 424 抽屉内，标题 `<角色> · 队列`，返回「工作概览/角色资料」（来源决定），Esc 先返回来源视图；`#right-queue-body` 保持唯一；不新增第四会话头图标/第二抽屉/新 `rightTab` 值（仍为 work/card，契约面不变）；960 单列可读。旧实现 `renderRight` 的 work/card 与 `updateRightQueue` 同源。
2. **M2 撤回回执**：`stores/drawer-store.ts` 成功追加 system 行「已撤回排队消息：〈摘要〉」；失败/异常在保留 `.q-feedback` 就地回执的同时追加 system 行「撤回无效：…」/「撤回失败：…」；不做乐观移除，位次仍由真实快照刷新；撤回中禁用与焦点归还保留。语义对齐旧 `renderer.js` 的 `sysRow`。
3. **M3 设置 Tabs 键盘**：`SettingsPanel.tsx` 补 WAI-ARIA Tabs：←/→ 循环、Home/End 首尾、roving `tabIndex`、`aria-controls="pi-engine-panel"`、`role=tabpanel` + `aria-labelledby`；移动即切换配置视图并聚焦目标 tab；保存/字段逻辑不变。
4. **M4 保存条状态**：`.pi-status` 改为 64px 内两行（line-clamp 2，font 10.5/1.35）；状态文案压缩为「已保存到 .env（改动键 N 个）。必填配置已齐备/仍缺 N 项（见上方）。〈应用时点短句〉」，完整逐键/完整 application 放 `title`（`savedStatusTitle`）；不省略应用时点，`aria-live` 全文保留。1360/960 与 200% 均复测。
5. **M5 角色资料状态计数**：`ProfilePanel.tsx` 改 `statusBadge(status, 0)`，角色头只显示状态（等待你确认/工作中/空闲/错误）；数量只在 `.ti-count`、队列预览标题与「查看全部队列（N）」。
6. **M6 960 焦点/Esc/inert 与 200%**：冒烟新增 960 档工作/资料/设置三面的 `col-left/col-mid inert`、焦点进入抽屉、Tab 停留在抽屉、Esc 关闭回触发（tab-work/tab-card/tab-pi）、队列子视图 Esc 回来源视图断言；新增 200%（Electron zoom 2）设置/资料无横向溢出与保存条完整状态断言。200% 在本机可测，已实测通过。

另补 Slider 视觉证据：`1360/960-settings-slider.png` 展开高级并滚到滑块，thumb/output 位于抽屉内。

修正后门禁：见 §三；新增/更新截图见 §四。UIUX 复核待其独立进行，本记录不宣称复核通过。

## 四、证据目录

[`2026-10-21-phase4a-evidence/`](2026-10-21-phase4a-evidence/)：

- `phase4a-smoke/`：`report.json`、**28 张截图**（三引擎设置缺配/已保存/失败/Claude/Codex、Slider（1360/960）、Tabs 键盘态、引擎切换中、角色资料（干净顶部 1360/960）、文档阅读、工作概览、队列子视图（1360/960）、撤回失败/成功回执、失效 operator 卡、左树单徽标 1360/960、960 焦点态、200% 设置/资料）、`run.log`；
- `uiux-v2/{SELECTOR,CONFIG,ROLE_FOCUS,SEND_FACTS,RUNTIME,DEFAULT,VISUAL,TOOLFOLD}/report.json + run.log`（UIUX M1–M6 修正后最终重跑）；`adjacent/`（JUDGE/G2/TERMINAL 与 3B 冒烟回归日志）；
- `lazy/`（10/10 report + log）、`bench/`（8 份 JSON + `summary.json`，UIUX 修正后重跑）、`gates/`（typecheck/build/旧基线/新单测/IME/懒挂载/toolfold 日志、`summary.txt`）。

## 五、边界与阻塞项（如实）

1. **`Pi own history background queue draft and expired card restored`（RUNTIME_UI_ONLY）——已由 PM §十三 解除**：原唯一失败子句为 `.op-confirm.hidden`；PM 批准 `ChatRow.tsx` 最小冻结例外后，该 check **已通过**（卡片 `data-state=expired`、confirm/deny/submit/cancel `hidden=true`、`.op-note` 原因可见、卡片容器/aria 保留）。例外登记见 §五.13。
2. **C2 `expired old shell shown disabled in its own runtime`**：PM §十三 确认按**同因既有基线红**处理（本实现按 2026-10-18 决定收起失效 shell 卡并如实提示原因、不保留按钮全禁用卡），待 4B/5 重锚；**不阻塞 4A**。RUNTIME 现到达并在此 check 停止（此前项全过）；冒烟 `C2_SAME_CAUSE_EXPIRED_SHELL_CLOSES_WITH_REASON` 记录同因行为。
3. **judge 结果行的每引擎重放——PM §十三 明确归 4B**：`onShellJudgeResult/onOperatorJudgeResult` 由 `confirm-store.initJudgeSwitches` 直接订阅；4A 的 judge 结果行在当前视图内按既有 `chat-store` 过滤，**切回旧引擎不重放历史 judge 行**（契约面/本记录已注明，不宣称完整恢复）。其余每引擎面（history/events/role-state/operator 卡/shell/恢复卡/草稿）均已缓存重放；4B 经扩展点或属主 API 补齐。
4. **引擎菜单选项的配置状态文字**（已配置/缺配/配置未知/检查中）：未在菜单项渲染。PM §12.3 #4 明确 4A 不预取三引擎；为避免破坏 SELECTOR「每次提交恰一次读取」断言，4A 只在当前引擎缺配条/设置面板显示状态；菜单状态摘要留 4B（懒加载/缓存策略）。
5. **队列抽屉作为独立子视图**：`state.rightTab` 契约限定 `card|work|pi|document|null`，4A 将全量队列放在工作概览 `#right-queue-body`（含「查看更多」上限），角色资料提供预览；未新增第四入口/第二个抽屉，符合 UIUX §5「不新增图标」与 PM §12.3 #7。
6. **最近回交**：只呈现聊天流现有 handback 行并去重；完整报告/持久化/source 文档按钮、报告 delivery 属 4B（WorkOverview 无「查看来源角色文档」按钮）。
7. **工作概览定位**：只对**已挂载** operator 卡做「关抽屉 + DOM 滚动/聚焦 + tabindex=-1」；虚拟行 locator/键盘 locate 属 4B（未改 chat-store/ChatStream）。
8. **C1/懒挂载**：未改工具组/聊天行热路径；TOOLFOLD 19 项与懒挂载 10/10 全过，C1 Δ=16 不变。
9. **判读口径**：默认段/VISUAL 的失败是 4B/Phase 5 边界，不是 4A 新红；`main.mjs` 整机自检、全量双端、入口切换/打包未运行（Phase 5）。
10. **相邻 uiux-v2 段（非 4A 门清单，回归观察）**：PM §十三 后重跑 `JUDGE 33/33`、`G2 5/5`、`TERMINAL 22/22`、`TOOLFOLD 19`、3B 冒烟 45/45 全过。`TERMINAL_MERGE`（首项 `same actual turn and outcome denied plus settled has one readable terminal`）、`NOTICE`（`live system notice is its own sys row with 系统 badge`）、`BLANK`（`fixture: background pane has queue/status rows but no transcript`，`paneDebug(B)` 无行模型返回 null）在新入口失败；三者均落在 4A 未触碰的 `chat-store`/聊天行/通知行路径（`ChatRow` 仅按 §十三 改了失效 operator 动作），且不在 PM 4A 门清单或 3B 已验收段内，按既有新入口缺口记录、不计入 4A 通过或新红（日志见证据 `adjacent/`）。


11. **切引擎时旧视图确认卡的本地收起**：`confirm-store.ts` 属 4A 冻结文件，无「按视图清卡」公开 API；切换时调用其既有的 `dismissShell()/dismissRecovery()`（文档注明为测试/演示注入用，仅本地收起、不发 IPC、不代表放行）让旧视图卡让位，目标视图缓存卡随后由重放安装。语义与旧渲染器 `installRuntimeView` 一致（不产生任何授权/执行），但若 PM 认为应改由 confirm-store 属主提供正式 API，请在 4B 追加，不在 4A 扩围。

12. **左树单计数——已按 PM §十三 执行**：`.ti-count` 是唯一可见数字徽标（当前工作+排队，例 4）；状态标签改为 `statusBadge(status, 0)`，只表达状态（工作中/空闲/等待你确认/错误），不再带「N 待办」；队列深度保留在 `.ti-count` 的 `title/aria-label`（「当前工作 X 项，排队 Y 项」）与工作概览。既有状态优先级/错误/恢复语义不变。

13. **冻结写集例外登记（PM §十三 批准，唯一一处）**：
   - 文件：`app/renderer/src/chat/ChatRow.tsx`（4A §12.2 不修改清单内，经 PM §十三 最小例外批准）。
   - 改动：仅 operator 卡动作区——`closed`（失效/已答）时 `.op-actions` 与 `op-confirm/op-deny/op-submit/op-cancel` 增加 `hidden`；保留 `disabled`、`finalNote`、`aria-label`、卡片容器与选项只读态。未改聊天行/工具组/虚拟窗口/回放/其它卡。
   - 旧实现依据：旧 `renderer.js` 的 `freezeEntryCards/freezeOperatorCard` 对失效卡冻结并收起动作（不保留可点按钮）；2026-10-18 起 shell/恢复卡同向。
   - 验收：RUNTIME `Pi own history…restored` 通过；冒烟 `EXPIRED_OPERATOR_CARD_HIDES_ALL_ACTIONS_KEEPS_REASON`；截图 `1360/960-operator-expired`（无死按钮、原因可见）。
   - 边界：例外不扩展到其它行类型；后续如需改 ChatRow 其它部分，仍须回 PM。

## 六、核对方式与状态声明

- 只读核对：PM §十二、UIUX 4A 设计/原型证据、台账 §七、旧渲染器对应段、`app/preload.cjs`、桌面窗口 `api-spec.md`、现有渲染器源码。
- 执行过的命令均在 §三与证据 `gates/summary.txt` 记录；所有数值来自本机真实运行输出（非估算）。
- 未运行：`main.mjs`、`ANS_QUEUE_VIEW_UI_ONLY`、全量双端、打包发布、真实模型/网络/.env；未修改根配置/依赖/主进程/preload/旧渲染器/其他角色；未新增依赖（Slider 为 copy-in 单文件）。
- 本文是 4A 实现与验证记录，不是 4A 门结论、Phase 4 完成或最终验收；门结论由 PM/测试/UIUX 独立复核。
