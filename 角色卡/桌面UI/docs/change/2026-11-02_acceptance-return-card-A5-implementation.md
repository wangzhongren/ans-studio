---
id: acceptance-return-card-a5-implementation
type: change
title: 验收回交卡 A5 实施记录：phase4b E2E 最小夹具
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: A5 实施：phase4b 自包含 E2E 块（两处报告卡/普通对照/决定卡/P1-ARC-01/02/200%）
  - date: "2026-11-02"
    kind: implemented
    summary: A5 夹具写入；node --check 通过；官方 harness 基线过期无法跑通；临时调试副本 15/15 验证夹具；未 commit/push
---

# 验收回交卡 A5 实施记录：phase4b E2E 最小夹具

- **实施角色 / 上下文**：桌面UI（渲染层测试/夹具），本上下文只承担该角色。
- **节点**：团队计划 §五 **A5（E2E 夹具）**；输入 A3/A4 已完成。
- **状态**：**implemented-unverified**。A5 夹具已写入 `test/桌面UI/phase4b-electron-smoke.mjs`，`node --check` 通过；**官方 phase4b harness 在当前 HEAD 基线过期，无法完成官方 `E2E_PASS`**（原因见 §四）；用临时 debug 副本验证 A5 块 15/15 通过（副本已删除，非官方证据）。**未 commit/push、未接触客户、未判验收**。

## 一、输入与基线

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| A3 `ReportCard.tsx` | `app/renderer/src/shell/ReportCard.tsx` | 461 | `787db0208bc370c0c3f5d61348010c21fa413a9f3b84be7cbce48a04e6956285` |
| A3 `DecisionDialog.tsx` | `app/renderer/src/chat/DecisionDialog.tsx` | 391 | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` |
| A3 `shell.css` / `phase4a.css` / `phase4b.css` | 见 A3 记录 | 3355 / 1776 / 1088 | `12bf211c…` / `79fe0703…` / `0c05f4d4…` |
| A4 `session.ts` / `customer-input.ts` | 见 A4 记录 | 7881 / 2067 | `73b1f70e…` / `059f080e…` |
| A4 SessionManager 测试 | `test/桌面应用/acceptance-return-card.test.ts` | 468 | `0c008cc5…` |
| P1 审核 / 桌面UI 提案 | 见 P1/A5 派发输入 | 168 / 463 | `8a114aab…` / `e2eb138e…` |
| A3 记录 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A3-implementation.md` | 159 | `fed6af62…` |

- 分支 / HEAD：`feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`。
- 编辑前 harness：`test/桌面UI/phase4b-electron-smoke.mjs` 967 行 / git `565499b2…` / sha256 `6a30fd39…`；`git diff --cached` 为空。
- 未改 A2/A3/A4 产品文件、`app/**`、`src/**`、其他 E2E 文件、角色卡/边界/治理。

## 二、改动内容（仅 `test/桌面UI/phase4b-electron-smoke.mjs`）

在既有 200% 段落之后、最终 console/CSP 检查之前追加一个自包含块（`— 11. A5 验收报告卡/决定卡 E2E`），不修改既有断言/夹具/顺序，不新建 e2e 脚本：

1. **内置 verifier 回交行**：`load("trio")` + `selectRuntime("pi")` + `select("verifier")`，推送 `kind:"handback"`（`source.roleId:"verifier"`）。断言 `.msg-handback.is-acceptance`、标题「独立验收报告」、徽标「独立验收」、`.report-top/.report-body.is-acceptance`、完整 `summary.text` 末尾 marker、全部 2 条 evidence 及 flags、`另有 2 条证据因预算省略`、无 `.report-complete`、事实行条件措辞/免责声明、非「已通过」断言式短语、冷色 `rgb(134, 197, 227)`。
2. **blocked verifier 回交行**：`status:"blocked"`，断言 `.msg-handback.is-acceptance.is-blocked`、标题/徽标保留、危险色 `rgb(201, 122, 109)`、`.report-top` 危险背景 `rgb(46, 34, 32)`。
3. **普通报告卡（AC-4）**：项目角色 P 的报告，断言无 `is-acceptance`/徽标、标题「任务报告」、180 字预览不含尾部 marker、`.report-complete` 默认关闭且含完整 marker、`尚未确认` 事实行。
4. **交付批两处位置 + P1-ARC-02**：一份 delivery 批次含 2 份 verifier 报告（completed + blocked）、1 份普通报告、1 份不支持版本（version 2）报告。断言两个 `.delivery-report.is-acceptance`、blocked 段 `is-blocked`、普通段 `className==='delivery-report'` 且无验收类/徽标、普通段保留 `.report-complete`；验收段完整正文/证据/无折叠；两段冷色/危险色分别为 `rgb(134, 197, 227)`/`rgb(201, 122, 109)`。
5. **P1-ARC-01 真实 DOM 负例**：不支持版本的 verifier 报告走 **DeliveryCard** 路径（live handback 在 `chat-store` 被 `reportVersionSupported` 过滤，不进入 ReportCard；交付批是可达的渲染路径）。断言该 `.delivery-report` 类名恰为 `delivery-report`、无 `is-acceptance`/`is-blocked`、无 `.report-title`/徽标/折叠，只显示「不支持此报告版本，未生成成果摘要。」。
6. **验收决定卡**：推送 `session:operator-request`（`request.cardKind:"acceptance"`、唯一 preview marker、2 选项/1 推荐、`acceptanceReport.version:1`、path `docs/quality/flow-a5-report-v1.md`、16384 字节报告文本含末尾 marker、`truncated:true`）。断言 `.decision-dialog.is-acceptance`、`.dd-kind` 文本「独立验收决定」（非机器值）、`.dd-acceptance-report`/`.dd-acceptance-body` 原文 marker、`.dd-report-path` O2、`.dd-preview` marker 默认可见（`height>0` 且不在 `details` 内）、截断提示、选项可作答/推荐星标；冷色 `rgb(79, 134, 163)`。高风险变体断言 `is-acceptance.is-high-risk.is-destructive` 且边框非冷色（danger/warning）。两卡均用 `.dd-later` 关闭。
7. **窄屏/200%**：在 200% 下断言 `.dd-acceptance-body`/`.dd-acceptance-report` 与 `.hb-summary`/`.acceptance-evidence` 无横向溢出；断言后恢复 `setZoomFactor(1)`。

## 三、P1-ARC-01 / P1-ARC-02 夹具落点

- **P1-ARC-01**：交付批中的 unsupported verifier 报告断言无任何验收类/标题/徽标（§二.5）。说明：live `kind:"handback"` 的 version≠1 报告在 `app/renderer/src/chat/chat-store.ts:1250` 被 `reportVersionSupported` 过滤，不会到达 `ReportCard`；因此真实 DOM 负例使用 DeliveryCard 路径（也覆盖 P1-ARC-01 要求的外层类门控）。A3 的 source-guard 已静态钉住 `ReportCard`/`DeliveryCard` 两处 `supported && reportAcceptance`。
- **P1-ARC-02**：普通交付段 `className==='delivery-report'`、无 `is-acceptance`/`is-blocked`；验收段 blocked 才加 `is-blocked`（§二.4）。
- **两处位置冷色一致 / 危险色优先**：回交行与交付批分别断言 info/danger RGB；决定卡高风险断言 compound 规则生效（§二.6）。

## 四、运行结果与可运行性

### 4.1 `node --check`

| 项 | 值 |
| --- | --- |
| 命令 | `node --check test/桌面UI/phase4b-electron-smoke.mjs` |
| 退出码 | **0** |
| 日志 | `.../A5-evidence/05-node-check.log`（4 行 / `aef345034bcaed939ec00c21cd86e1704b3fb075df77b3c5e2621d9ad2649602`） |

### 4.2 官方 phase4b smoke（当前基线不可跑通）

| 项 | 值 |
| --- | --- |
| 命令 | `node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/tmp/a5-phase4b` |
| 结果 | `PHASE4B_SMOKE FAIL 1 checks / 1 failures`；`CHECK smoke completed without exception=false` |
| 原因 | 首个既有检查读取 `document.getElementById('governance-status').textContent`；该治理 UI 已在 `98d3fe2 feat(batch-D2): remove governance UI and desktop exposure` 移除，当前 `app/renderer/src` 无 `#governance-status` 生产者（仅遗留 CSS）。失败发生在 A5 追加块之前，属 harness 基线过期，非 A5 夹具失败。 |
| 日志 | `.../A5-evidence/01-phase4b-smoke.log`（7 行 / `dc1c6fbf4c777c42150ddb4b344f656b048ebd7e6158e9320204738fd9b6f002`） |

### 4.3 备用 `uiux-v2.mjs`（当前基线不可跑通）

- 默认运行在 `role geometry 1360` 断言失败，并出现未注册 IPC handler（`session:role-states`/`network:get-state`/`preferences:get`/`background-tasks:list`）；属该 harness 当前基线问题，本次未修改。日志 `.../A5-evidence/04-uiux-v2-attempt.log`（39 行 / `b408c112e5461210874bce07bda8d653f05e281bbd2e9c816977c652566a01fc`）。

### 4.4 临时 debug 副本（非官方，仅验证 A5 夹具；已删除）

- 复制最终 phase4b 到临时文件，替换过期首检查并跳过已移除治理/旧段（`if(false)`），仅执行 A5 块：**15 checks / 15 true / 0 failures，PHASE4B_SMOKE PASS**。该运行验证了 A5 选择器/事件时序/P1-ARC-01/02/200% 夹具；**不作为官方 E2E_PASS 证据**，临时文件与输出已删除，D1 须在 harness 基线修复后重跑官方命令。
- 日志 `.../A5-evidence/02-a5-debug-smoke.log`（22 行 / `77f01bf348fea2653e1c100476f56b273813dd205188ca9c315e03de19f6151a`）。

### 4.5 环境

Node `v24.22.1` / npm `11.19.1` / `MINGW64_NT-10.0-26300 3.6.10-710e5275.x86_64` / Git Bash `5.3.15(2)-release`；日志 `.../A5-evidence/06-environment.log`（5 行 / `50f47ce3e9381cff230688a022cd92baa2097733b22453419886aedd13954586`）。

## 五、候选哈希（before / after）

| 文件 | before `git hash-object` | before sha256 | after `git hash-object` | after sha256 | 行数 |
| --- | --- | --- | --- | --- | --- |
| `test/桌面UI/phase4b-electron-smoke.mjs` | `565499b29a00e9643fda186b0639b368eec77172` | `6a30fd39f6d1fa1fa433a5ed674335b898f3f3640974359919f4b9cedb05f7c4` | `91f5ccced5e6c0feedb1b85948134c66359ca0d2` | `b3dd05a91fb45b9d9e0cf1dd7dcf70b257ef1ebcdeddcbb3e1cc3ee22c1e347e` | 967 → 1293 |

- A5 候选 = 该文件的 after 哈希；`git diff --stat` 仅此文件（+326 行）。
- 哈希/状态原始记录：`.../A5-evidence/03-hashes-status.txt`（94 行 / `b17166e683062fddd8269a7baaee17d94348857cc15beb965d94bfcc52287a50`）。

## 六、写集与纪律核对

- **本上下文写盘**：`test/桌面UI/phase4b-electron-smoke.mjs`；本记录与 `A5-evidence/` 日志；`memo.md` 状态（按需）。
- **未写**：A2/A3 产品源码、`app/**`、`src/**`、`test/桌面应用/e2e/main.mjs`、`uiux-v2.mjs`（未改）、其他角色/治理/角色卡边界。临时 debug 副本和 preload 调试注入已删除/还原（`phase4b-smoke-preload.cjs` 无 diff；`phase4b-a5-debug.mjs` 不存在）。
- **未 commit / 未 push / 未接触客户 / 未判验收**；`git diff --cached --name-only` 为空。
- 工作树中的 A1/A2/A3/A4 冻结文件与既有治理/管理记录不属本候选（`03-hashes-status.txt` 标注）。

## 七、偏差、限制与下一步

- **关键限制**：官方 phase4b harness 因治理 UI 移除（`98d3fe2`）基线过期，在首个检查即失败；`uiux-v2` 默认运行也有基线失败。本记录**不声称官方 E2E_PASS**；A5 夹具通过临时 debug 副本验证（15/15），但 D1 必须在 harness 基线修复/更新后运行官方命令并取证。
- **P1-ARC-01 路径说明**：live handback 的不支持版本报告被 `chat-store` 过滤，真实 DOM 负例落在 DeliveryCard；ReportCard 的同门控由 A3 source-guard 覆盖。
- **未做**：未修改 harness 既有过期检查（不属 A5 写集）；未修 `uiux-v2`；未运行官方 smoke 通过。
- **下一步**：D1 在修复后的 harness 上运行 `phase4b-electron-smoke.mjs`（或按团队计划改用 `uiux-v2.mjs`）并记录 `E2E_PASS`/截图（至多）/候选哈希；E2 按 V1 判定。A5 状态保持 `implemented-unverified`，本记录不是验收结论。
