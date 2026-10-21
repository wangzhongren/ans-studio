---
id: ui-platform-phase3b-independent-verification
type: change
title: UI 平台化 Phase 3B（真实卡族/双开关/输入区）独立验证
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase3b-cards-composer, ui-platform-phase3a-independent-verification, check-ledger-phase3a, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: created
    summary: 候选变化后按 Invariant #6 重验：干净重建、单测/旧基线/IME/懒挂载、PM §10.3 bench 重基线、自写 39 项离线 IPC 冒烟、uiux-v2 七段独立复跑、C1 收敛与契约语义抽查；3B 范围通过，Phase 3 整体门可判完成
---

# Phase 3B：独立验证（测试角色）

受验对象：桌面UI 的 [Phase 3B 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md) 与 [3B 证据](../../../桌面UI/docs/change/2026-10-21-phase3b-evidence/)；门规：PM [§10.3/§10.4/§10.6](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)；台账：[Phase 3A check 名台账](2026-10-21_check-ledger-phase3a.md)。候选已变化，本记录覆盖旧 3A 结论中受影响的渲染层部分。独立执行，未复用桌面UI 脚本与结论。

候选基线：HEAD `fc1a39c` + 当前工作树；环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、Electron 44.7.0（Chromium 152.0.7977.130）。证据目录：[2026-10-21-phase3b-verification-evidence](2026-10-21-phase3b-verification-evidence/)。

## 一、结论（pass / needs-work / missing-evidence）

**3B 范围内：pass。** 派发列出的检查全部独立执行通过；未发现 3B 实现缺陷。**Phase 3 整体门：可判完成（pass）**——按 PM §10.5「3B 通过后 Phase 3 整体门才算完成」，3A 子门已放行、3B 本次通过；全量双端等价与 `main.mjs` 仍按 PM §10.1 留 Phase 5。

**needs-work：无（3B 范围内）。** 残留项均已在台账登记为阶段/基线事项：

- **B 类（Phase 4）**：uiux-v2 默认段第 9 项（工作概览/队列抽屉）、SEND_FACTS `P7 old runtime rejected result…`（依赖每引擎真实会话/切换）、QUEUE_VIEW `queued baseline shows two`（operator 排队聚合）——均非 3B 缺口（§六）。
- **C 类既有基线红**：C2 旧入口 `expired old shell shown disabled in its own runtime`（旧渲染器零 diff，随 Phase 5 下线）；C1 尾部折叠锚点**已收敛**（新 Δ=16 ≤ 旧 32、≤20 目标，§七）。
- **观察（非阻断）**：切到 single 项目时，先前在 trio 打开的一次性警告若仍在显示，会保留旧「替我决策中」行直到「知道了」/约 9 秒自动收起（开关本身已正确禁用并显示 single 说明）。建议 Phase 4 在治理模型变化时刷新警告行；不影响 fail-closed 与开关权威。

**missing-evidence：无**（3B 门所需证据齐全）。未验证边界见 §九。

## 二、干净重建与静态检查（通过）

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0
npm run build:renderer       # exit 0（vite 8.3.4，204ms）
```

| 资产 | raw | gzip9 |
| --- | ---: | ---: |
| `dist/assets/index-B0PdgwOl.js` | 680,134B | 226,166B |
| `dist/assets/index-C0WoUscm.css` | 80,304B | 14,706B |
| `dist/src/index.html` | 583B | 384B |
| **入口引用合计** | — | **241,256B ≤ 300KB（307,200B）** |

与桌面UI 报告（240,121B）差 +1,135B（重建实例差异）。静态扫描：恰 1 个外部 module script + 1 个 stylesheet；无内联脚本/`<style>`/`style=`/`unsafe-*`/modulepreload；严格 CSP meta 逐字在位。

## 三、测试、基线、IME 与懒挂载（通过）

| 检查 | 结果 |
| --- | --- |
| `node --test test/桌面UI/*.test.ts` | **33/33 pass，exit 0**（3A 18 + 3B 15：卡状态机/失效、judge 映射、双开关、队列/撤回、附件类型） |
| `node --test test/桌面应用/*.test.ts` | **679/679 pass，0 fail，exit 0** |
| 旧渲染器核心 vs HEAD | `index.html`/`renderer.js`/`styles.css`/`tool-rows.js`/`role-status.js`/`runtime-ui.js`/`ui-labels.js`/`engine-selector.js` 与 `app/main.ts`/`app/preload.cjs`/`app/desktop/` **全部零 diff** |
| 三个 e2e diff | 仅 3A 已接的 `ANS_RENDERER_ENTRY` 目标切换（各 4 行），**断言零改动、未弱化** |
| IME 新入口 | **24/24 true，E2E_DONE=1，exit 0** |
| 延迟挂载正向检查（`test/测试/phase3a-lazy-toolgroup-check.mjs`） | **10/10，LAZY_TOOLGROUP_DONE=1，exit 0**（>40 闭合内部 0、摘要/直显、展开 45、离屏稳定、≤40 仍挂载） |
| 依赖 | 3B **零新增**；`package.json`/锁未改（锁相对 HEAD 仍为 3A 已记录的 107 新增，全部 markdown-it 15.0.3 工具链）；禁入清单零命中 |

## 四、bench 重基线（PM §10.3；通过）

方法：同机同日，每目标首轮预热不计，之后新旧交替 3 有效轮；中位 + p95 + 单轮 50ms 红线。预热：旧 stormA 26.8ms、新 22.7ms（原始值保留在 `bench/warmup-*.json`）。

| 指标 | 旧有效轮（中位） | 新有效轮（中位） | 阈值 | 判定 |
| --- | --- | --- | --- | --- |
| stormA.maxGap | 21.3 / 22.0 / 19.3（**21.3**） | 25.6 / 24.4 / 21.1（**24.4**） | ≤ max(21.3, 25) | PASS |
| stormB.maxGap | 18.7 / 18.7 / 18.7（18.7） | 18.6 / 18.6 / 18.7（18.6） | ≤ max(18.7, 25) | PASS |
| stormA_handler.maxMs | 13.1 / 11.7 / 14.6（13.1） | 0.7 / 0.6 / 0.7（0.7） | ≤ max(15.7, 18.1) | PASS |
| stormB_handler.maxBatchMs | 2.1 / 1.6 / 1.7（1.7） | 0.9 / 1.0 / 1.0（1.0） | ≤ max(2.0, 6.7) | PASS |
| replay.replayMs | 20.9 / 20.0 / 20.8（20.8） | 5.3 / 5.7 / 5.8（5.7） | ≤ max(25.0, 25.8) | PASS |
| scrollToBottom.ms | 24.6 / 22.8 / 24.8（24.6） | 5.1 / 8.0 / 8.9（8.0） | ≤ max(29.5, 29.6) | PASS |

新有效轮 maxGap 分布：25.6 / 18.6 / 24.4 / 18.6 / 21.1 / 18.7 → **p95=25.6ms ≤35**、**单轮最大 25.6ms ≤50**。结论：**通过**。

**保留（差异与余量）**：桌面UI 自报新 stormA 中位 18.6ms；本次独立重跑为 24.4ms（仍达标，但距 25ms 下限仅 0.6ms）。属同机运行波动；按 PM §10.3 规则 5，3B 后若再改聊天热路径须重新按同规则重跑并记录，不回溯修改本轮阈值。

## 五、自写 Electron 离线 IPC 冒烟（39/39，通过）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase3b-verification-evidence/electron-smoke/independent-smoke.cjs) + 主/无 judge 两个离线 preload（同目录）。窗口：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`、真实 `loadFile(dist/src/index.html)`；第二窗口用缺 judge 方法的桥变体。结果 **39/39 true、exit 0**，零 console/CSP/did-fail-load。

- **shell 卡**：标题「shell 命令请求」、命令逐字（含 `<&>` 与引号）、默认焦点 `sc-deny`、`state.shellConfirm.id` 同步；Esc → 回包 `{id, allow:false}` 并收起；显式「放行执行」→ 恰 `allow:true`；显式「拒绝」→ `allow:false`；本轮 settled → 收起且**不产生回包**；`operator-expired` 命中 id → 收起并显示真实原因；通道异常 → 收起 + 「按 fail-closed 不放行」提示。
- **su 三档**：risky/review/deny 均标题「命令审批 · Proof / 验收」、档位可见、`命中原因：tier:*` 逐字、绕过写边界警告、默认拒绝焦点。
- **恢复卡**：动作「重建会话」+ 说明、目标角色、原因/证据逐字（`证据逐字 <&> 保留`）、默认焦点 `rc-deny`；Esc → `allow:false` 并收起；显式「执行」→ 恰 `allow:true`；失效回包 → 卡片保留且动作全禁用、如实「未获执行」、× 可关闭；通道异常 → 「按 fail-closed 不执行」定格、× 可关闭（绝不呈现为已执行）。
- **judge 结果行**：allow 结果行锚定在 `call-j1` 工具行之后（`.shell-judge-row[data-tool-call-id]`），标题/档位/引擎/operator 文案齐备；deny 行含理由与重试出路；manual **不产生行**；同 id 重推幂等；治理代批行「judge 代批 · 代审批」+「确认写入 1 个路径（docs/a.md）」+ 流程。
- **双开关**：初始关闭、可用；开启「替我审批」→ `setShellJudgeEnabled(true)`、标签「替我审批中 · 判断 agent」、一次性警告（含 shell/写盘/写卡代批行）；「知道了」后与重复推送/重绘均不重现；开启「替我决策」→ 决策警告行出现；single 项目 → 决策开关禁用 + 「旧治理模型（single）不支持代决策」；桥缺四方法 → 两开关禁用 + 「当前版本不支持自动判断，保持手动」。
- **发送**：成功载荷 `(text, images[], {projectRoot,roleId,runtime}, {clientMessageId})`、用户气泡、输入清空；`queued:true` → 「已入队…（第 2 位）」系统行；未接受拒发 → 恢复草稿 + 「发送失败：测试拒绝」行/提示 + 角色错误；已接受后失败 → 不回显假「发送失败」、不恢复草稿、错误标记如实。
- **角色草稿**：A/B 各自文本切换保持（A 草稿 ↔ B 草稿）。
- **停止**：忙时可见/空闲隐藏；`abortSession` 目标逐字段精确；「已请求停止当前轮次」；不支持/失败两态如实文案。
- **附件**：选图 → chip + **data URL 缩略图** + 名称/KB 标题；粘贴 File → `attachImage({name:'paste.png',mime,dataBase64})` → chip；拖入同理（drop.png）；移除。
- **队列**：进行中/第 1 位/第 2 位与来源、仅客户消息可撤回；撤回成功就地回执「已撤回排队消息：…」、失败就地「撤回无效：消息已投递」并落系统行。
- **系统行**：`用户指令：[系统·看护] 巡检开始` → `.msg-injected.is-system` chip「系统消息 · 看护」，前缀剥离、正文正确。
- **无 CSP/console/did-fail-load**。截图 `electron-smoke/phase3b.png`（single 项目、双开关警告、草稿与附件缩略图）。

说明：恢复卡的失效回执文案是「未获执行」，通道异常才是「按 fail-closed 不执行」；两条路径均已分别实测。

## 六、uiux-v2 七段独立复跑（新入口）

| 段 | 报告条目 / 布尔 | 通过 | 失败名 | 归属 |
| --- | --- | --- | --- | --- |
| 默认 | 10 / 9 | 8 | `one independent work list without duplicated role documents` | 台账 B1 / Phase 4（工作概览/队列抽屉；`#tab-work` 禁用占位） |
| JUDGE | 33 / 33 | 33 | — | — |
| G2_RECOVERY | 5 / 5 | 5 | — | — |
| TERMINAL | 22 / 22 | 22 | — | — |
| TOOLFOLD | 19 / 17 | 17 | —（C1 已转绿，Δ=16） | — |
| SEND_FACTS | 9 / 8 | 7 | `P7 old runtime rejected result cannot disable current runtime or overwrite draft` | 台账 B2 / Phase 4（真实引擎切换与每引擎会话；当前 `selectRuntime` 仍为本地投影，切换后 `sessionOpenRoleId` 为空，检查要求仍为 A） |
| QUEUE_VIEW | 2 / 1 | 0 | `queued baseline shows two` | 台账 B2/B5 / Phase 4（operator 排队聚合 `.op-queue-aggregate`，契约行 13；change record §七列 Phase 4） |

**确认：三个失败项均为台账 B 类 Phase 4/5，不是 3B 缺口；3B 未拉入 Phase 4 功能，断言未弱化。** 与桌面UI 自述的计数差异仅为「条目 vs 布尔」口径（其 SEND_FACTS 8/9、QUEUE_VIEW 1/2 把观察条目计入；本次按布尔检查计 7/8 与 0/1），失败名与归属一致。

## 七、C1 收敛与 C2

- **C1 尾部折叠锚点**（同机同日，同一套件）：新入口 `anchorBefore=150 → anchorAfter=anchorLater=166`，**Δ=16px**，非累积；旧入口 `150→182`，**Δ=32px**（既有红）。判据：新 Δ ≤ 旧基线 32 **成立**；收敛目标 ≤20 **成立**；断言未改（e2e diff 仅目标切换）。按 PM §10.5，C1 已满足 Phase 5 切换判据，并达到收敛目标。
- **C2** `expired old shell shown disabled in its own runtime`：旧渲染器零 diff，未在本轮重跑（旧入口套件其余段与 3B 无关）；仍按台账登记为旧渲染器既有红，随 Phase 5 下线退役。

## 八、契约与回包语义抽查（通过）

- 渲染侧：`node:`/`require(`/`fs`/`ipcRenderer` 直连 **0 命中**；`resolveWrite`/`classifyShell`/`evaluateGate`/`resolveBoundary` **0 命中**（无第二份边界判定）；手绘 `<svg>` 0；tsx/ts 裸 hex 0。
- `allow:true` 仅来自卡片上显式「放行执行 / 执行」点击：`respond(true)`（两处）→ `shellConfirmRespond/recoveryConfirmRespond({allow: allow === true})`；Esc/×/拒绝/取消、失效、通道异常均 fail-closed。
- DOM 例外唯一：`DEFER_TOOL_ROWS_WHEN_CLOSED=40`（ChatRow），未新增第二例；正向检查 10/10 保持。
- 依赖与锁未变（§三）；旧渲染器与主进程/preload/desktop 零 diff。

## 九、未验证 / 覆盖边界

1. 真实模型/网络与真实主进程确认卡通道：冒烟用离线替身（含故意异常注入）；真实角色会话中触发 shell/su/恢复卡未验。
2. 打包安装包、Windows/DPI/200% 文字/屏读、`prefers-reduced-motion`：本机 macOS。
3. `main.mjs` 整机自检与全量双端逐 check 名对照：Phase 5。
4. Phase 4 功能面（引擎真实切换/每引擎会话与设置、工作概览/队列抽屉、治理三权卡/镜像/排队聚合、治理记录、资料抽屉、delivery/persistence/report 全文、`replayAnchorDebug`）：未实现，按台账 B 延期。
5. 3A2 的 12 组视觉计算样式：UIUX 已复核（3A2 pass），本轮未逐项重测。
6. 长转录手感、真实队列位次随 role-state 的自然前移（只用快照模拟）、跨项目草稿边界：未覆盖。

## 十、与桌面UI 自述的差异与观察

1. bench 数值：其新 stormA 中位 18.6ms；本次独立 24.4ms（仍通过，余量 0.6ms）。按 PM §10.3 保留原始数据，不修改阈值。
2. uiux 计数口径：SEND_FACTS/QUEUE_VIEW 的「8/9、1/2」含观察条目；按布尔检查为 7/8、0/1，失败名一致。
3. 观察（非阻断）：切到 single 项目后，仍在显示的一次性警告保留旧「替我决策中」行至自动/手动收起；开关状态与 single 说明正确，建议 Phase 4 随治理模型变化刷新警告行。
4. **单测增量计数**：其记录称「3B 新增 16 项，累计 33」，但 18（3A）+16=34；实际逐文件计数为 confirm-logic 8 + judge 7 = **新增 15**，累计 33——总量正确，新增数应为 15（仅文字笔误）。
5. 其余自述（卡族逐字/默认焦点/Esc/显式 allow、双开关一次性警告、single 禁用、发送/停止/附件/队列、system 行、C1=16）均被本轮独立复现。

## 十一、边界核对

- 只写：本报告、`角色卡/测试/docs/change/2026-10-21-phase3b-verification-evidence/`、本角色 `feature-map.md`/`memo.md`/`changelog.md`。均在 `角色卡/测试/` 内。
- 未改产品代码、构建配置、测试文件或其他角色文件；未 commit/push。
- 按派发删除并重建 `app/renderer/dist/`（gitignore 构建产物）；未触碰源码。

## 附：复跑命令

```bash
rm -rf app/renderer/dist && npm run typecheck:renderer && npm run build:renderer
node --test test/桌面UI/*.test.ts
node --test test/桌面应用/*.test.ts
ANS_RENDERER_ENTRY="$PWD/app/renderer/dist/src/index.html" ANS_IME_OUTDIR=/tmp/ime \
  ./node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs
./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs

# bench（预热 1 轮/目标不计 + 新旧交替 3 有效轮）
BENCH_OUT=… ./node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs
ANS_RENDERER_ENTRY=… BENCH_OUT=… ./node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs

# 自写 3B 冒烟
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase3b-verification-evidence/electron-smoke/independent-smoke.cjs

# uiux-v2 七段（新入口）
ANS_RENDERER_ENTRY=… ANS_UIUX_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs
ANS_JUDGE_UI_ONLY=1 … ; ANS_G2_RECOVERY_UI_ONLY=1 … ; ANS_TERMINAL_UI_ONLY=1 …
ANS_TOOLFOLD_UI_ONLY=1 … ; ANS_SEND_FACTS_UI_ONLY=1 … ; ANS_QUEUE_VIEW_UI_ONLY=1 …
```
