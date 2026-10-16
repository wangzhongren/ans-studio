---
id: v3-visual-convergence-independent-verification
type: change
title: 2026-10-16 v3 界面收敛批次独立验证报告（测试角色）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [visual-convergence-v3-implementation-deskui, visual-convergence-v3-signoff-uiux, fix-e2e-selfcheck-v3-sync, u1-notice-restick-deskui, kanban-fixes-pm-review]
events:
  - date: "2026-10-16"
    kind: verified
    summary: v3 界面收敛批次独立复验完成——冻结绑定（HEAD 745b3db 工作树 58 文件 sha256，结束复算 58/58 逐字节一致；renderer.js 3179388f 等八项指纹逐条复核命中）；全量 1678 用例 1677 过 0 败 1 跳过（唯一跳过＝既有 Windows-only）+ typecheck 0；12 条数值断言、S1-S4/W6b/W5/W6/W9-W11、零动效约束经三方夹具独立复跑原始测量逐项核实；W7 未动/W8 未实施；桌面窗口自检台 26 类逐处核对（零删除机械核证：9 处改名全部在对照表、repairCheck 22==22）+9 条 IPC 接线+三处能力移除处置合理；U1 修复自建 24 项对抗夹具两轮全过（上翻不打扰/同高零抖动/阈值边界/非点击写入面）；e2e 独立复跑两轮 E2E_DONE=1、U1_WINDOWED_TO_BOTTOM=true（dist 18→0），与留存 r4/r5 及 U1 修复轮报告逐字节互证；发现 0 项不通过、7 项备注/存疑（均不影响判定）
---

# 2026-10-16 v3 界面收敛批次独立验证报告（测试角色）

**验证对象**：客户 2026-10-16「**按推荐批准，开始实施**」后的四件套交付——①桌面UI v3 实施（W1–W6 默认档 / W6b / S1–S4 / W9–W11 SVG 弧线转轮；12 条数值断言），记录 `角色卡/桌面UI/docs/fix/2026-10-16_fix_visual-convergence-v3-implementation.md`；②UIUX 复测签署 `角色卡/UIUX设计师/docs/design/2026-10-16-visual-convergence-v3-signoff.md`；③桌面窗口自检台同步 `角色卡/桌面窗口/docs/fix/2026-10-16_fix_e2e-selfcheck-v3-sync.md`；④U1 修复（切回会话提示条撑开顶底 18px）`角色卡/桌面UI/docs/fix/2026-10-16_fix_u1-notice-restick.md`。批准口径＝[PM 评审](../../../项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md) §「客户批准（2026-10-16）：v3 界面收敛实施」（7 项）与 §「伴随项」（U1＋自检台同步登记）；设计规格＝`角色卡/UIUX设计师/docs/design/2026-10-16_design_visual-convergence-v3.md` §二(d)（12 条断言与 S1–S4 口径）。

**整体结论：通过（0 项不通过；7 项备注/存疑，均如实列明、不影响批准面判定）。**

本报告全部原始证据落在 `角色卡/测试/docs/change/2026-10-16-v3-verification-evidence/`（下称「证据目录」）。独立对抗夹具＝`test/测试/u1-notice-restick-probe.mjs`（自建，本批唯一新增测试辅助文件：真实 renderer/preload + 受控 IPC 替身，无模型请求、无网络）。**独立构造**：e2e 复跑与审计复跑用我自己的 OUTDIR；三方度量工具（桌面UI 仓库审计、UIUX `/tmp` 夹具、既有 uiux-v2）全部由我复跑取**原始测量值**核对（不复用其断言结论）；U1 滚动语义以自建夹具独立核验。全程只写 `test/测试/`（1 探针）与 `角色卡/测试/`（本报告＋证据＋memo）；**未改** `app/`、`src/`、他角色文件；**未 git 提交**；未碰 `/private/tmp/ans-v11-release-run` 与 `/private/tmp/ans-ui-preview`（本轮全部 OUTDIR：`/private/tmp/ans-test-v3-e2e`、`/private/tmp/ans-u1-probe{,-r2}`、`/private/tmp/ans-v3-verify-*`）。

---

## ① 冻结绑定（本结论对应哪一版代码）

- HEAD＝`745b3db`（branch `main`；本批全部改动**未 commit**、停在**工作树**——与前几批相同交付形态）。
- **冻结集**＝`git status` 全量 24 条目（16 修改 + 8 未跟踪路径）展开的 **58 个文件**（`freeze-manifest-before.sha256`）：4 个 `app/renderer/` 实施文件、5 个 `test/桌面应用/` 文件（含桌面窗口 `e2e/main.mjs`）、4 份记录的文档与证据（v3 实施证据 10 件、U1 证据 2 件、自检台证据 8 件、signoff 与 signoff-evidence 19 件）、两角色 memo/changelog/api-spec 与 PM 评审 §v3 批准。
- **全量 sha256 冻结**（before，2026-10-16 16:45）；**全部复跑结束后复算 → 58/58 逐字节一致**（`sha256-freeze-end` 对比，无任何被验证文件在验证期间被动过）。
- 关键指纹逐条复核（与各记录声称比对，全部命中；完整 58 条见冻结清单）：

| 文件 | sha256（前 8） | 声称来源 | 结论 |
|---|---|---|---|
| `app/renderer/renderer.js` | `3179388f` | U1 记录 §5（改前 `0d704b44`） | ✅ |
| `app/renderer/role-status.js` | `ba3051c8` | v3 记录 §7 / U1 记录 §5 | ✅ |
| `app/renderer/tool-rows.js` | `3f851983` | v3 记录 §7 / U1 记录 §5 | ✅ |
| `app/renderer/styles.css` | `7f83b2bc` | v3 记录 §7 / U1 记录 §5 | ✅ |
| `test/桌面应用/renderer.test.ts` | `d2c267f6` | U1 记录 §5（改前 `74630b45`） | ✅ |
| `test/桌面应用/tool-rows.test.ts` | `a0915e71` | v3 记录 §7 | ✅ |
| `test/桌面应用/e2e/uiux-v2.mjs` | `08aa1845` | v3 记录 §7 | ✅ |
| `test/桌面应用/e2e/uiux-design-audit.mjs` | `9d1b05c9` | v3 记录 §7 | ✅ |
| `test/桌面应用/e2e/main.mjs` | `a1dfa75f` | （桌面窗口记录未声称——本轮登记） | — |

- **v3→U1 两段衔接无断点**：v3 实施记录 §7 的 `renderer.js 0d704b44` / `renderer.test.ts 74630b45` 与 UIUX signoff §1 复测对象指纹逐位一致（signoff 全文含 `0d704b44…` 全值）；U1 修复后 `3179388f` / `d2c267f6` 即本回复验对象。`.session-notice` 引入归因复核：`fd0ac73` 起存在（前身 `7457da4` 提示在 `.chat-head-notes`），与 U1 记录「缺陷由 V2 批 fd0ac73 引入」一致。

## ② 全量复跑

- `node --test "test/**/*.test.ts"` → **1678 用例：1677 过 / 0 败 / 1 跳过，exit 0**（`fulltests-summary.txt`）。唯一 skip＝既有「规范化：Windows 大小写不敏感（仅 win32）」（`# 仅 Windows`）——非回归。与 U1 记录声称（1678：1677/0/1）**逐位一致**。
- `npm run typecheck` → **全仓 0 错，exit 0**（`typecheck.txt`）。
- 计数口径对账：v3 批新增 7 例（renderer.test.ts +5＝U1 1＋v3 4；tool-rows.test.ts +2），与 U1 记录中 `test/桌面应用/**` 354/354 自洽。

## ③ 范围审计（逐项落地核实）

### 3.1 12 条设计数值断言（设计 §二(d)；我复跑三方夹具取**原始测量值**逐项核对，非仅读其断言结果）

断言 1–8 走仓库审计夹具（`ANS_UIUX_OUTDIR=/private/tmp/ans-v3-verify-audit node_modules/.bin/electron test/桌面应用/e2e/uiux-design-audit.mjs` → `AUDIT_DONE`，v3 段 30/30）；9–12 走 indicators 口径（同一夹具 + UIUX `indicators5.mjs`）。

| # | 断言（阈值） | 我的复测值（原始测量） | 结论 |
|---|---|---|---|
| 1 | `.chat-pane` gap=16±1px | **16px**；相邻行实距 11/11 全 **16.0**（UIUX 夹具 12/12 全 16） | ✅ |
| 2 | p margin=10±1；h3 纵值 ≤16/≤6+1 | p `0px 0px 10px`；h3 `16px 0px 6px` | ✅ |
| 3 | 单行用户气泡 ≤44px | **42px**（pad `9px 14px`、lh 24px） | ✅ |
| 4 | 输入区 ≤140px、空框 ≤30px | composer **137.6px**（pad 14/32/12）；textarea **28px** | ✅ |
| 5 | 转录总高 ≤850px | 仓库夹具 **789.2px**；UIUX 夹具按同口径从原始 rows 复算 **823.0px** | ✅ |
| 6 | 完整可见行 ≥9 | **9**（视口 614.4px） | ✅ |
| 7 | 工具活动行 ≤48px | 合并行 max=avg=**47.1px** | ✅ |
| 8 | 960/1360 `bodyScrollW==`视口宽 | 1360=**1360**、960=**960** | ✅ |
| 9 | working 徽标 12±1px SVG；v3spin 0.9±0.2s | boxW **12**、svg css 12×12、`v3spin 0.9s` | ✅ |
| 10 | 尾行 26.6±2px 不因图标增加、含转轮且动画生效 | **26.6px**、含 `.spin-arc`、`v3spin 0.9s` | ✅ |
| 11 | loading 同一枚 SVG 转轮（无第二实现） | `svg`+`v3spin 0.9s`；`.spinner` 元素 **0** | ✅ |
| 12 | reduced-motion（CDP）≤0.01s 且 iteration ≤1 | `1e-06s`、`1`；`matchesReduce=true` | ✅ |

**计数：12/12 通过。** 复核两处口径说明（signoff §4 已提，我实算确认）：(a) 转录总高 789.2（repo 夹具）与 823.0（UIUX 夹具）差 33.8px＝一行系统行＋16px 行距——我按 UIUX 口径从**原始 rows 几何**复算得 823.0，与其签署一致；(b) 仅这两处口径差异，数值本身无冲突。

### 3.2 结构级 S1–S4 / W5 / W6 / W6b / 零动效⑦（同夹具原始测量）

| 项 | 我复测值 | 结论 |
|---|---|---|
| S1 相位合并 | 4 相位→**2 个调用**；合并行（调用发起→状态未记录）高 47.1≤48；活动行总高 94.2 ≤ 0.6×212.4=127.44；UIUX 整元素口径 132.2 ≤ 0.6×257.4（51.4%） | ✅ |
| S1 折叠可见性 | 折叠摘要「2 个调用 · 含状态未记录」且失败行在流内可见；截断附验（超长目标 `…`、同调用并 1 行）通过 | ✅ |
| S4 摘要口径 | 「N 个调用」＋异常补「· 异常 M」＋未知照旧；`callSummary` 单测（异常=含异常相位行数）通过 | ✅ |
| S2 chip 对齐 | chip x=**384**、pane x=**384**、diff=**0**≤8（960 档截图贴合） | ✅ |
| S3 尾行两态 | chip 可见 ⇒ `.tool-current` 为 null；无 chip（回放后）⇒ 兜底「等待你确认」（两态均断言）；`updateOpChip` 三出口回呼 + 后台角色不再顺手动 chip（读 diff 核实） | ✅ |
| W5/W6/W6b | 摘要行高 22px；注入盒 body lh 24px（1.6）；系统行正文 `投递排队积压：…`（无 `[系统·看护]` 重复前缀）、chip「系统消息 · 看护」照旧；`displayBody` 剥前缀单测（含多空白/仅标记空正文/非 system 不带）通过 | ✅ |
| 零动效长期约束⑦ | chip `animation-name: none`；确认卡至多 `op-flash`（iteration 1）；app 源码零第二转轮、零打字光标/骨架屏（retirement grep：`@keyframes spin`/`.spinner` 生成 0 命中） | ✅ |

### 3.3 未批准项零实施

- **W7 不动（批准②）**：`.msg { font-size:15px; line-height:1.8; }` 逐字仍在（diff 未触碰该行；renderer.test.ts 反向钉也在）。✅
- **W8 未实施**：`app/renderer/index.html` 未在改动集中（git diff 空）；「尚未导入项目」×2 原样（复测 grep）。✅
- 其余「§二(c) 明确不动」项（标题栏/会话头/阅读列宽/字号色板/圆角焦点环/恢复与 shell 卡结构/抽屉模态/op-request 卡/队列来源标签/系统行实线左竖条/is-replay/拒绝文字呈现）：diff 逐段核对，零触碰。✅

### 3.4 批准面（7 项）↔ 落地逐条

PM 评审批准 ①W1–W6 默认档 ②W7 不动 ③W6b ④S1 ⑤S2/S3 ⑥W9–W11 SVG 弧线转轮 ⑦零动效长期约束——①③④⑤⑥⑦ 均有 §3.1/3.2 原始测量背书；② 见 §3.3。**全落地，零夹带**（W8 与(c)类零触碰见上）。

### 3.5 已批准范围内的 v2 断言修订 5 处（非放松核证，读 diff 逐条）

`uiux-v2.mjs` 恰 5 处口径修订：①`one canonical lifecycle` ×9：`i<4?2:1`→一律 `1`（S1 合并行下**去重检测语义不变**——真出现重复渲染时工具名仍会 ≥2 次而转红）；②`share phase identities`：2 行→1 行**且**行内含「调用发起」「执行完成」两标签（更强）；③`unknown is honest count`：「3 条活动」→「3 个调用」（计数 3 不变；无 callId 三事件各成行）；④⑤两处 S3 尾行断言：由「尾行=等待你确认」改为「chip 可见＋无尾行（＋busy 真实信号/抽屉在开照旧）」。**其余 v2 断言零改动**（diff 全文 4 个 hunk 已通读）。另 `uiux-design-audit.mjs` 顶部夹具 `runtime-config:get` 形状更新（旧形状会顶出告警条挤压视口——夹具过期修正）与看门狗 60s→120s（新增 v3 段耗时需要）均非断言放松。✅

### 3.6 桌面窗口自检台同步（`test/桌面应用/e2e/main.mjs`）逐处对照

- **对照表覆盖**：记录 §一 A 组 4 处（A1–A4）＋B 组 22 处（B1–B22）＝**26 类**，与「26 类断言行/夹具点」声称一致；C 组 9 条 IPC 接线逐条对照 `app/main.ts` 现行通道（我读 diff 核实：`session:live-views`/`session:history-get`/`report:retry-save`/`report:get-save-state`/`delivery:retry-history-save`/`delivery:get-receipt`/`session:get-persistence`/`runtime-config:get`/`runtime-config:save` 恰 9 条）。
- **零删除（机械核证）**：HEAD 与工作树的断言名集合对比——`log` 名 317→321，**HEAD 独有恰 9 个且全部为对照表登记过的改名**（BADGE_ON_CARD_WHILE_COLLAPSED→BADGE_ON_WORK_WHILE_COLLAPSED / CHAT_HEAD_NO_BUTTONS→CHAT_HEAD_ONLY_APPROVED_BUTTONS / COMPOSER_ROWS_ARE_ATTACH_AND_CAPSULE→…_ATTACH_CAPSULE_NOTE / PI_ENTRY_IN_TABS→PI_ENTRY_IN_SIDEBAR_FOOT / RUNTIME_NOTE_IN_HEADER→…_IN_COMPOSE_NOTE / SHOT_08_MIRROR→SHOT_08_SU_PANE / SU_WRITE_NOTE_IN_HEADER→…_IN_COMPOSE_NOTE / TAB_CARD_ACTIVE_STILL→TAB_WORK_ACTIVE_STILL / WRITE_NOTE_REMAINS_IN_HEADER→…_IN_COMPOSE_NOTE）；`repairCheck` 名 **22==22 零增删**；新增名 4（TAB_WORK_ACTIVE、DRAWER_TITLE_WORK、SU_DELIVERY_CARD_PRESENT 为记录中登记的新信息/守卫行；RIGHT_HAS_TODO_SECTION 由 HEAD 的合并行拆为独立行、语义不变）。**无任何断言被静默删除。**
- **零放松（抽查加强项）**：B4 只读守卫由「仅查旧元素」升级为「旧元素＋现行 aria-description 双载体」；B16 崩溃点改防御式（缺失如实 false，不再空指针——r1 基线的 `E2E_ERROR` 根因）；B18 `REPORT_NO_PREMATURE_SU_MIRROR` 由 `!…is-mirror` 加强为 su pane 全域 `!任何 .msg-handback`；B11 clean 判据由「runtime-note 不存在于 composer」改为「只可在 `.compose-note` 一处」（位置钉死；v3 归位所致，非放松）。
- **三处「能力已移除」处置合理**：①事件层镜像（is-mirror 已退役）→ 替代能力守卫 `SU_DELIVERY_CARD_PRESENT`（生产投递形状推入 → 断言「回交投递 · 本批 1 份」物化）＋强化断言＋SHOT 改名——语义不删；②「15s 文本防误伤」（fca8f6b 已删）→ `MANUAL_*` 重锚为「文本层回显不触发注入」反向钉；③`.pi-advanced-hint` 静态段落（被 applyPiView 重写取代）→ 改钉现行载体 `.runtime-field-help`＋静态段落**合并取文**含「留空」「默认」。
- A2/A4 的 S-1 夹具修正（补顶层 `turnId`；死睡 800ms→有界轮询 `waitUntil`）经我的 e2e 复跑证实为必要且充分（见 §4.1；归因句瑕疵见 §5-1）。

### 3.7 U1 修复面（最小/无计时器/粘性语义未动）

- **最小**：diff 仅新增 `noticeLayoutPin()`/`restickAfterNoticeChange(pin)` 两助手 + 包装 `setHint` 与 `renderContextState` 的历史投影注记写入（两写方同住一根条、同一口径）+ 三处注释同步；滚动语义函数（`scrollBottomForced`/`streamShouldPin`/`flushBatchSideEffects`）diff 零触碰。✅
- **无计时器**：U1 代码段 `setTimeout/setInterval` 命中 **0**（我自 grep + 单元测试反向钉双证）。✅
- **既有粘性语义未动**：e2e 复跑 S-1 五组断言全 true（贴底/上翻不拽/回底）；自建夹具 B6 控制项钉住「显式点击角色 ⇒ 到底部」U-1 语义未变（§4.2）。✅
- 附带评估（记录 §6）两处为注释级处置：lastManualSend「勿据它做归类判断」、回放归类块的残余边界如实标注——读 diff 核实为**只改注释/不改行为**。✅

## ④ 对抗性核对（独立构造）

### 4.1 e2e `test/桌面应用/e2e/main.mjs` 独立复跑（两轮，含与留存证据的字节级互证）

- **r1（fresh OUTDIR `/private/tmp/ans-test-v3-e2e`）**：**`E2E_DONE=1`**；352 行；**`U1_WINDOWED_TO_BOTTOM=true`（dist=0；基线 18）**、U1_NORMAL/REPEAT=true；S-1 五组全 true；全报告 `=false` 仅 2 处**观测/反向守卫**（`OLD_GENERAL_CLAIM_PRESENT=false`＝期望即假；`BOOTSTRAP_HAS_ROLES=false`＝未建角色时观测量），**0 断言红**。
  - 与我复跑对照：r1 与桌面窗口留存 `main-e2e-r4/r5-final.txt` 归一化后 **逐字节一致**，唯一差异＝OUTDIR 路径与 U1 两行（18/false → 0/true，即修复本身）——`e2e-r1-vs-retained-r4-diff.txt`。
- **r2（复用同一 OUTDIR，模拟 U1 修复轮的运行方式）**：与 U1 修复轮 `e2e-report-after.txt` 归一化后 **逐字节一致（diff 为空）**——`e2e-r2-vs-u1-fixround-diff.txt`。
- **一处观察行差异已实验归因**：`P1_ARRIVAL_DEBUG`（观察 JSON，非断言；两轮 `P1_ARRIVAL_SCROLLED=true` 均过）中 `ch`＝566（fresh，与 r4/r5 一致）vs 614（复用 OUTDIR，与 U1 轮一致）——差异=48px 提示条区；对照实验证明其由 **OUTDIR 复用**（首跑会留下 `proj-*`/`e2e-pi.env` 改变导入/刷新流的状态）引起，非产品差异。证据：`e2e-main-r1-report.txt`（fresh）与 `e2e-main-r2-report.txt`（reuse）同机同树两轮对照。
- 旁证：桌面窗口记录「r4/r5 两轮逐字一致」我独立重算成立（仅 OUTDIR 行不同）；其边界单测 266/266 与 typecheck 0 的留档复核无误。

### 4.2 U1 滚动贴底语义——自建夹具 24 项（两轮同结果，全过）

`test/测试/u1-notice-restick-probe.mjs`（真实 renderer/preload + 受控 IPC；163 行窗口化现场；成功复现缺陷条件：切走再切回、提示条在贴底之后出现）。`PROBE_DONE failures=0` ×2 轮。

| 组 | 钉住的性质 | 实测要点 |
|---|---|---|
| A（3 项） | U1 主路径：切回角色、提示条尾部出现（18.59px）→ **dist=0**；且视口压缩量 Δch=18.00 ≈ 条高 18.59（补滚=条高补偿，非偶然） | 缺陷形状下修复生效的核心证据 |
| B（7 项） | **上翻不打扰（非点击写入面＝drop 文件触发的 setHint；无角色点击/无 U-1 介入）**：条高 0→18.59 增大、18.59→0 缩矮、同高重写三种写入下 `scrollTop` **逐字节不变**；控制项 B6 证实「复点角色⇒到底部」＝U-1 显式动作语义（与提示修法无关） | st0=st1=st2 同值 |
| C（3 项） | 在底部·条高不变（事件错误单写）→ **零抖动**（st、sh 均不变）且仍贴底 | |
| D（4 项） | 在底部·条高缩小：复点路径 dist=0；非点击路径（drop 图片→附件成功尾 `setHint("")`）无滚动副作用，残余 46px 与「附件行增高 64px−条高 18.59≈45.4」**算术闭合**（属记录已声明的范围外同族面，见 §5-3） | |
| E（3 项） | 阈值边界（`STICK_THRESHOLD_PX=24`）：dist=40（>阈值）条高增/缩均不打扰（st 不变）；dist=20（≤阈值）条高增大**重贴底**（dist→0） | 与 `UiLabels.stickToBottom` 语义一致 |

**探针版本历史如实保留**：v1 曾报 3 项红，经核**全部为夹具场景错误**（把「复点角色⇒到底部」U-1 显式语义误记为提示条补滚违规；且该操作后测点已回底，后续断言基准失配）——修正为非点击写入触发后全绿；v2 又暴露 D 段「46px 残余」，量测归因于 composer 附件行增高（范围外面），以算术闭环而非放任断言处置。**无产品侧问题被掩盖：每一处红都有量测级归因并落在最终全绿证据链内。**

### 4.3 UIUX 与桌面UI 审计/度量工具关键项（我复跑取原始值）

- 桌面UI 仓库审计（`uiux-design-audit.mjs`）：**AUDIT_DONE、v3 段 30/30**；原始 measures 逐项与 §3.1/3.2 表一致（另有 S1/S2/S3/W6b 全部原始字段）。
- UIUX 自建密度夹具（`/tmp/ans-uiux-v3/ext/audit-v3.mjs`，只读运行）：`AUDIT_V3_DONE`；我复跑的 densityClosed/Open/simClosed 原始值与 signoff 留存证据**逐值一致**（gap 全 16、气泡 42、composer 137.6、空框 28、可见行 9/7、activity 47.1、转录 span 823.0）。
- UIUX 指标夹具（`indicators5.mjs`）：`INDICATORS_DONE`；boxW 12、`v3spin 0.9s`、尾行 26.6、reduced-motion `1e-06s/1`——与 signoff 一致。
- `uiux-v2.mjs` 默认全量：**UIUX_V2_PASS 99**（与 v3 批基线一致，无回归）。

## ⑤ 备注/存疑（均不影响判定；如实登记）

1. **归因句瑕疵（文档级）**：桌面窗口记录 §一 A2 与 `main.mjs` 注释称「v3 把 `tool-rows.js::activityOf.turnId` 收窄为只认顶层」——经我只读比对，收窄实发生于 **fca8f6b**（F 批次，2026-10-15）；v3 批工作树与 HEAD 的 `activityOf` **逐字节相同**（fd0ac73 亦已是顶层）。夹具必须补顶层 `turnId` 的**结论正确且必要**（旧形状在被验代码下确实饿死行数），仅批次归因不准。
2. **`P1_ARRIVAL_DEBUG` 观察行对 OUTDIR 复用敏感**（fresh=566 / reuse=614，非断言、两轮断言均绿）——§4.1 两轮对照实验证明；留档供后续 e2e 排障参考（复跑对照时应固定 OUTDIR 策略）。
3. **composer 附件行增高属 U1 声明范围外的「同族」布局面**：U1 记录 §3 已如实列出「`#runtime-config-notice`/`#switch-confirm` 同族未覆盖」；本轮探针另发现「drop 图片→附件行」同样使 `#chat` 变矮（64px），写时判据正确（dist>24 不补滚），残余 46px 无滚动副作用。**非承诺面**；如需覆盖可平移「量—写—补」范式（建议单独批次）。
4. **语义提示（防后续误读）**：「复点/切换角色 ⇒ 强制贴底」是 U-1 显式动作语义（客户 2026-10-12 裁定）与 S-1「上翻不打扰」并存——后者仅约束**非点击**的流式/提示写入。本批 e2e（S-1 五组＋U1 三组）与探针 B6 共同钉住两者边界。
5. **U1 修复轮 before 报告未留存**（同 OUTDIR 被 after 轮覆写；U1 记录 §4 已如实声明）。三级互证：桌面窗口 r4/r5 留存（pre-fix red）＋我 r1 复跑（post-fix green，与 r4 仅差 U1 行）＋我 r2 复跑（与修复轮逐字节同）。
6. **转录口径差（非冲突）**：789.2（repo 夹具）vs 823.0（UIUX 夹具）＝两夹具转录差一行系统行（33.8＝17.8+16），我按 UIUX 口径从原始 rows 复算一致；两夹具各自 ≤850。
7. **`PI_ADVANCED_HINT_LEAVE_BLANK` 合并取文**：判据为「`.runtime-field-help`＋静态段落」合并文本含「留空」「默认」两字面——现行单一来源 `runtime-settings.ts` 的 help 承载该文案；若未来 help 文案改动，该断言按字面如实生效（语义不删，登记口径供后续属主参考）。

## ⑥ 证据索引（均为原始输出）

目录 `角色卡/测试/docs/change/2026-10-16-v3-verification-evidence/`：

- `freeze-manifest-before.sha256`／`sha256-freeze-end.txt`——58 文件全量 sha256（冻结刻／复验结束刻）；两清单 diff 为空（58/58 逐字节一致）。
- `fulltests-summary.txt`、`typecheck.txt`——② 全量复跑与类型检查原始输出。
- `e2e-main-r1-report.txt` / `e2e-main-r2-report.txt`（附 stdout）——④.1 两轮 e2e 完整报告。
- `e2e-r1-vs-retained-r4-diff.txt`（仅 U1 两行）／`e2e-r2-vs-u1-fixround-diff.txt`（空 diff）／`e2e-r2-vs-retained-r4-diff.txt`——④.1 字节级互证。
- `probe-u1-restick-r1.txt` / `probe-u1-restick-r2.txt`——④.2 自建对抗夹具两轮逐项原始输出。
- `audit-v3-verify-report.json` / `audit-v3-verify-log.txt`——④.3 仓库审计复跑全量测量（v3.results + v3.measures）。
- `uiux-audit-v3-verify-report.json` / `uiux-indicators-verify-report.json`——④.3 UIUX 两夹具复跑原始报告。
- `uiux-v2-verify-log.txt`——④.3 `UIUX_V2_PASS 99`。

## 边界与状态声明

本报告为测试角色独立复验：**未改** `app/`、`src/`、其他角色文件与既有测试；本批唯一新增文件＝自建对抗夹具 `test/测试/u1-notice-restick-probe.mjs`（辅助探针，不被产品代码引用）；写入仅限 `test/测试/` 与本角色 `docs/change/`（报告＋证据）＋ memo 一行；**未 git 提交**；未触碰 `/private/tmp/ans-v11-release-run`、`/private/tmp/ans-ui-preview` 与既有轮次证据目录（只读引用）。受验 58 文件在本轮全部复跑前后 sha256 逐字节一致——本报告结论绑定且仅绑定该版本。真机（CUA）亲操作验收不在本报告面内。
