---
id: customer-authorization-plane-d2-real-run
type: change
title: 客户授权平面 D2 真实运行探针与既有 E2E 证据核验
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - customer-authorization-plane-b0-baseline
  - customer-authorization-plane-d1-regression
  - customer-authorization-plane-c1-implementation
  - customer-authorization-plane-c2-implementation
events:
  - date: "2026-11-03"
    kind: created
    summary: D2 核验既有 E2E（不重跑，E2E_PASS=true/失败空/exit 0/87s/30 截图全部有引用）；新 test-only 探针在真实 Electron 下 64 checks（63 true/1 false）、16 张 1360x860 截图、落账 9 事件；面板撤销回执缺失如实记录；53 个 D1 候选逐文件复核 53/53 未变
---

# 客户授权平面 D2：真实运行探针与既有 E2E 证据核验

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：测试（固定角色；本上下文只承担该角色）/ 团队计划 §5.1 **D2（真实运行证据）**。
- **日期 / 状态**：2026-11-03；**`implemented-unverified`**。本记录只记录 D2 实际执行与原始证据，**不判验收、不判通过/返工**；AC 判定属独立验收 E2。
- **一句话事实**：既有 Electron E2E **未重跑**，只做证据核验：`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、`exit_code=0`、87 秒、30 张截图与 report 引用一一对应；D2 新增 test-only 真实 Electron 探针覆盖 `@审批`/`@决策` 全链路，**64 checks / 63 true / 1 false**（唯一 false 为面板撤销路径未产生回执系统行，见 §五.1），16 张 1360×860 截图、9 条账本事件；`exit_code=1`（由该 false 导致，不伪造成 PASS）；D1 的 **53 个候选逐文件复核 53/53 未变（0 mismatch/0 missing）**，D2 只新增 1 个 test-only 探针与证据；未 commit/push。

---

## 一、输入与版本（只读实测）

| 输入 | 派发引用 | D2 读取时点实测 | 说明 |
| --- | --- | --- | --- |
| 测试角色卡 | — | **29 行 / `452cee435b7f08c6dd6f34b1156d7b5ea5f08ba8862ad68d824d2ff44af10068`** | 只承担测试角色 |
| 测试边界 Section 1 | — | **19 行 / `9a2eba3fc842f185eb228ef49cd30dfd66ec3933c42cca0202ff2ae26c97859f`** | 写集：`test/测试/`、`角色卡/测试/docs/change/` |
| 团队计划 v1 + §十三/§十四 | 675 / `4545d3a5…` | **675 行 / `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671`** | 一致 |
| V1 验收标准 | 1171 / `51ac0f50…` | **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`** | 一致 |
| D1 回归记录 | 231 / `c4d6ecfe…` | **231 行 / `c4d6ecfe105a9a218fd720e55b7bcc84761326cbc361148864e96d5160c7a9ad`** | 一致 |
| C1 实施记录 | 208 / `966cba43…` | **208 行 / `966cba43dff59d127c86602981da6ee170e6447ab4a4b8df6f0dfbee469fefc6`** | 一致 |
| C2 实施记录 | 176 / `dc8bcca4…` | **176 行 / `dc8bcca40631985a32cfe7e7a4b9b50323c4bc4580e18432779e78b8ab1481ba`** | 一致 |
| C2 探针参考（只读） | — | `run-c2-ui-probe.mjs` **397 行 / `c7e2b310bc444a01d98ec97de87c63af752446dfe042934ec66882a62d4cbd12`**；`c2-probe-preload.cjs` **129 行 / `5ffd9748b99a7c35188572ad27f6b85c676b8869cfed8cf438bea8a78a7e3c6e`** | 只读参考；D2 独立实现，未修改 C2 文件 |

原始观测见 `00b-probe-environment.txt` 与 `06-d2-probe.log` 头。

---

## 二、环境

| 项 | 实测值 |
| --- | --- |
| HEAD / 分支 | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` / `feat/customer-authorization-plane` |
| Node / npm | `v24.22.1` / `11.19.1` |
| Electron | `v44.7.0`（`node_modules/electron/dist/electron.exe`） |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `5.3.15(2)-release` |
| 时区 | Asia/Shanghai（记录时间 +08:00） |
| worktree | `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane` |
| 依赖 / 构建 | `node_modules` 存在；`app/renderer/dist` 为 `build:renderer` 产物（被忽略、非候选） |
| DEBUG 覆盖层 | `DEBUG` / `ANS_DEBUG` / `ELECTRON_ENABLE_LOGGING` 均未设置；截图无 DEBUG 覆盖层 |

`00-environment.txt`（既有 E2E 环境）与 `00b-probe-environment.txt`（D2 探针环境）。注：上表 Node `v24.22.1` 为 shell Node；Electron 运行期使用其内置 Node（既有 E2E report 记 `NODE=24.21.0`、`ELECTRON=44.7.0`），二者不混用。

---

## 三、既有 Electron E2E 证据核验（**不重跑**）

按派发要求复用并引用既有证据，未再次启动 E2E。

### 3.1 原始结果

| 项 | 值 | 证据 |
| --- | --- | --- |
| 命令 | `ANS_E2E_OUTDIR=<…>/e2e-out node_modules/.bin/electron test/桌面应用/e2e/main.mjs` | `05-e2e-run.log` 头 |
| 脚本 SHA-256 | `8c88c911dd4e523979c229e9a264cf78f52ecc4c1c058d4266be1d8508f29bd3` | `05-e2e-run.log` 头 |
| 起止 / 耗时 | 2026-11-03T18:03:36+08:00 → 18:05:03+08:00 / **87 秒** | `05-e2e-run.log` 尾 |
| 退出码 | **0** | `05-e2e-run.log` 尾 |
| `E2E_PASS` | **true** | `e2e-out/report.txt` 第 510 行 |
| `E2E_FAILURES` | **空** | `e2e-out/report.txt` 第 511 行 |
| `E2E_DONE` | **1** | `e2e-out/report.txt` 第 512 行 |
| 截图 | **30 张 PNG**；report 引用 30 个唯一文件名；**0 个未引用、0 个引用缺失** | `e2e-out/`、`05b-e2e-screenshot-hashes.txt` |
| 截图尺寸 | 30 张均为 **1360×860** | `05b-e2e-screenshot-hashes.txt` |
| 渲染构建门 | `npm run build:renderer` **exit 0**，2799 modules transformed，vite 自报 342ms | `04-build-renderer.log` |
| 证据哈希 | report `4e19e7dcbbf2a486544dd2a561d146812a86637b0a805009521f300926b80152`；日志 `68c51d63b95694256733aeb3637264c0e457095f4dc23f2853aa6923bfa4dad2`；构建日志 `a0e110aa250887d798d1f4ae8cbb89160e23c30e352c90300ba1cf8f361b3747` | `08-evidence-hashes.txt` |

### 3.2 口径

- 该 E2E 是**既有桌面回归证据**，不覆盖本任务的 `@审批`/`@决策` 指令平面场景；D2 的指令平面证据来自 §四 的独立探针。
- 未修改、未扩展 `test/桌面应用/e2e/main.mjs`；未新建 e2e 脚本。
- `e2e-out/userData/`、`e2e-out/e2e-pi.env` 等为 E2E 运行期临时产物，**不是入库候选**。

---

## 四、D2 指令平面真实运行探针

### 4.1 探针与运行

| 项 | 值 |
| --- | --- |
| 路径 | `test/测试/customer-authorization-plane-d2-probe.mjs`（**test-only，954 行**） |
| SHA-256 | `a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427` |
| 运行脚本 | `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/run-d2-probe.sh` |
| 命令 | `ANS_D2_HEAD=<HEAD> ANS_D2_PROBE_OUT=<…>/probe-run-2 ./node_modules/.bin/electron test/测试/customer-authorization-plane-d2-probe.mjs` |
| 起止 / 耗时 | 2026-11-03T18:44:38+08:00 → 18:44:54+08:00 / **16 秒** |
| 退出码 | **1**（唯一失败检查见 §五.1；其余 63 项通过） |
| 结果计数 | **64 checks：63 true / 1 false；16 张截图；report.failures=1；0 console error；0 CSP violation** |
| 真实件 | 真实 `app/preload.cjs`（`684c0d96…`）、真实渲染 `app/renderer/dist/index.html`（`eb38faaa…`）、真实 `app/desktop/interface.ts`/`directive-input.ts`/`customer-input.ts`/`project.ts` 与真实 B1 账本运行时；无关 IPC 用无害桩（运行命令与探针头部注释见 §4.1 与探针文件） |
| userData | `probe-run-2/userData`（**全新**，探针在 app ready 前 `setPath`；**未使用** C2 `probe-run/user-data`） |
| 夹具项目 | `probe-run-2/project`、`probe-run-2/project-2`（临时生成，非客户项目） |
| 窗口 | BrowserWindow content size **1360×860**（`useContentSize`，`frame:false`） |
| 截图 | 16 张 PNG，全部 1360×860；关闭 DEBUG 覆盖层；**无录屏** |
| report | `probe-run-2/report.json` **875 行 / `f4a95fab1b6afb561b11b89bb4a9015345b031f2d0a9a546cf1c77ef21cc89b2`** |
| 账本 | `probe-run-2/project/.ans/state/customer-directives.jsonl` **9 行 / `765b8b10fbe74a9869d54012a0d289c6fa58528655718991edc6d379c68fac4a`**；快照 `ledger-snapshot.json` `2044a479…` |
| 日志 | `06-d2-probe.log` **98 行 / `ba50baa30c8a20eadc583da379642e088659e6e6bbbc89d794e9db1c23f6353b`** |

**探针迭代披露**：最终运行前保留 3 次开发迭代日志（`06-d2-probe-run1.log`、`06-d2-probe-run2.log`、`06-d2-probe-run3.log`）。run1 的 8 个失败均为探针自身选择器/账本字段形状期望错误（产品行为正常），run2 因把 `@决策 选推荐项 until=session` 按项目级提交而触发 AC-13 高危（需勾选）导致等待超时，run3 补齐说明性截图；**最终结果以 `06-d2-probe.log` 与 `probe-run-2/` 为准**，早期日志不当作最终证据。

### 4.2 场景覆盖（派发 D2 必做逐项）

| 场景 | 观察 | 关键 checks | 截图 | 主要 AC |
| --- | --- | --- | --- | --- |
| S1 `@审批 允许 shell "npm install" once` | 确认面板显示原文/动作/范围/资源/期限；无「发给幕僚」用户气泡；确认后系统行「已记录审批指令 #d-1」；账本 `directive.created d-1`（target=approval、until=once、allow、shell:npm install） | `S1_DIALOG_FIELDS=true`、`S1_NO_USER_BUBBLE=true`、`S1_RECEIPT=true`、`S1_LEDGER_CREATED=true` | `01-approval-confirm-dialog.png`、`02-approval-receipt.png` | AC-1/AC-2/AC-3/AC-5 |
| S2 高危 `forever` | 未勾选风险确认时确认按钮**禁用**；勾选后可确认；回执 #d-2；账本 `highRisk.reasons=["forever"]`、`acknowledged:true` | `S2_HIGH_RISK_UNCHECKED_DISABLED=true`、`S2_HIGH_RISK_ACK_ENABLES_CONFIRM=true`、`S2_RECEIPT=true`、`S2_LEDGER_HIGH_RISK_RECORDED=true` | `03-high-risk-confirm-disabled.png`、`04-high-risk-acknowledged.png` | AC-13 |
| S3 `@决策 选推荐项 until=session` | 项目级「选推荐项」在「替我决策」开关关闭时按 AC-13 触发高危：确认禁用；勾选后落账 #d-3；decision 卡被代选 `alpha`，结果行「客户指令 #d-3 已代选推荐项 方案 A（客户指令，不是客户本人点击）」；无客户卡；`operatorId="directive:d-3"` | `S3_PROJECT_RECOMMENDED_HIGH_RISK=true`、`S3_RECEIPT=true`、`S3_DECISION_AUTO_SELECTED=true`、`S3_RESULT_ROW=true`、`S3_RESULT_ROW_ATTRIBUTION=true`、`S3_NO_CUSTOMER_CARD=true` | `05a-decision-high-risk-dialog.png`、`05-decision-directive-applied.png` | AC-10/AC-13 |
| S4 决策冲突 | `d-3`（select-recommended）与 `d-4`（只接受「方案 B」、flow=focus）同时适用 ⇒ 不代选、呈现客户卡、系统行「决策指令冲突（d-3、d-4）：未代选；已改为由客户在卡上选择。」；人工选择 beta，`directive` 为空 | `S4_CUSTOMER_CARD_PRESENTED=true`、`S4_CONFLICT_NOTICE=true`、`S4_CONFLICT_NOTICE_IDS=true`、`S4_CONFLICT_NOT_AUTO_SELECTED=true` | `06-decision-conflict-card-and-notice.png`、`06a-decision-conflict-notice-after-answer.png` | AC-10 |
| S4b 决策不匹配 | 先经输入式撤销 `@决策 撤销 #d-3`/`#d-4`（回执正确）；再创建 `只接受 不存在的选项`（#d-7）；触发卡 ⇒ 呈现客户卡 + 系统行「决策指令 #d-7 未匹配到唯一选项：未代选；已改为由客户在卡上选择。」；人工选择 alpha，`directive` 为空 | `S4B_REVOKE_D3_RECEIPT=true`、`S4B_REVOKE_D4_RECEIPT=true`、`S4B_NO_MATCH_NOTICE=true`、`S4B_NO_MATCH_NOTICE_ID=true`、`S4B_NO_MATCH_NOT_AUTO_SELECTED=true` | `06b-decision-no-match-card-and-notice.png`、`06c-decision-no-match-notice-after-answer.png` | AC-10/AC-12 |
| S5 指令面板 | 审批/决策两个逻辑分区；生效与历史组；行显示动作/范围/资源/期限/状态/consumer/`(id, createdAt)`；撤销 d-1 后行进入「已撤销」、账本追加 `directive.revoked d-1`；**面板撤销未出现回执系统行**（见 §五.1） | `S5_TWO_LOGICAL_PANELS_AND_ROWS=true`、`S5_REVOKED_ROW_STATE=true`、`S5_LEDGER_REVOKED=true`、`S5_PANEL_REVOKE_RECEIPT=false` | `07-directive-panel.png`、`08-approval-revoked.png` | AC-3/AC-12/AC-24 |
| S6 项目切换取消未决面板 | 未决确认对话框打开时切换项目 ⇒ 对话框关闭；提交回包 `{ok:false, error:"已取消；未记录。", directiveCancelled:true}`；账本零新增 | `S6_DIALOG_CLOSED_ON_SWITCH=true`、`S6_SUBMIT_RETURNED_CANCELLED=true`、`S6_CANCEL_MESSAGE=true`、`S6_NO_LEDGER_WRITE=true` | `09-project-switch-cancels-pending.png` | AC-4/AC-22 |
| S7（AC-22）shell 卡待答 + 卡内入口 | shell 卡待答时从卡页脚入口输入 `@审批 允许 shell "npm install" once` ⇒ 指令确认对话框打开，shell 卡保持待答；未调用 `shell:confirm-response`；确认后回执 #d-9，shell 卡仍待答；卡内提示「确认对话框已打开；本卡仍待答」 | `S7_SHELL_CARD_PENDING=true`、`S7_DIRECTIVE_DIALOG_OPEN=true`、`S7_SHELL_CARD_STILL_PENDING_WITH_DIALOG=true`、`S7_NO_SHELL_RESPONSE_YET=true`、`S7_RECEIPT=true`、`S7_RECEIPT_NEW_ID=true`、`S7_SHELL_CARD_STILL_PENDING_AFTER_CONFIRM=true`、`S7_SHELL_NOT_RESPONDED=true` | `10-shell-card-directive-dialog-coexist.png`、`11-shell-card-still-pending.png` | AC-22 |

说明：S4/S4b 的人工回答由探针经**真实 customer-input 通道 API**投递（`customerChannel.respond`），不是点击卡片按钮；卡片已真实呈现（截图），本 D2 关注「不代选 + 系统行 + 卡片呈现」，卡片点击路径属既有 decision 卡 UI 证据。

### 4.3 截图清单与 SHA-256（16 张，均 1360×860）

| # | 文件 | 字节 | SHA-256 |
| ---: | --- | ---: | --- |
| 1 | `00-initial-chat.png` | 63,213 | `5759371e56159b1149cb65b83dec3a0d04fa084737db524d842764ad07b30c2e` |
| 2 | `01-approval-confirm-dialog.png` | 70,239 | `083e69fadf36d4a9305c364f22b57d8937f11130579d7aa69d70c133842a176e` |
| 3 | `02-approval-receipt.png` | 56,177 | `ccdb2a64b89b9459387a504d0f7389fd6d7777b73471c24e17a4d85d87d2c7e7` |
| 4 | `03-high-risk-confirm-disabled.png` | 79,503 | `22f3ef7c29e3473800c3c68d6761b6451b4b919a615e38d56f5bfbc7548231f1` |
| 5 | `04-high-risk-acknowledged.png` | 79,383 | `0af69bd42d007535c7f92c910ea2fd8bb4da2d81e8631b663ff9a86a053db3ca` |
| 6 | `05-decision-directive-applied.png` | 63,743 | `4b7e930dc924e5af74cc213721a44dfe4037f74e5f0d2d31da07c61d1e42457b` |
| 7 | `05a-decision-high-risk-dialog.png` | 80,737 | `ebd2cfb4ff1870d632e0e3e34cd577381fcce6af27735dc1cb97ca340de79e33` |
| 8 | `06-decision-conflict-card-and-notice.png` | 80,750 | `c56969b5f5d765d210817e4eab41e05a9619d623ba3d243b5d0bc460244f74f0` |
| 9 | `06a-decision-conflict-notice-after-answer.png` | 71,749 | `81c8a7d10e8e630bea585131c1153725ce8ce2cca2ef757fd4885d9357b028e4` |
| 10 | `06b-decision-no-match-card-and-notice.png` | 84,982 | `aaa9821a639e308e9fd4b83be719f7ad243ad75dfd028284e1cabacf46219e9a` |
| 11 | `06c-decision-no-match-notice-after-answer.png` | 83,306 | `e6305841a016537574d70c5d4d79b34876d3b206f0c5533f4f893b31850c40c6` |
| 12 | `07-directive-panel.png` | 101,119 | `714d102498e02659e5331ed3d6247d73ef7b726db73bc34996f07f3fbcf5f9b0` |
| 13 | `08-approval-revoked.png` | 102,927 | `26e24c7c2ce8b19fc4fe0ac9bc8e8632aed0f1d87d2807bd6060aae38f70667a` |
| 14 | `09-project-switch-cancels-pending.png` | 62,053 | `2c6a697d71f47d6af116d87159a7deb75def740dc3b20def2bc62dfdd4ae8136` |
| 15 | `10-shell-card-directive-dialog-coexist.png` | 78,510 | `4b01fa0bd721f47963706ed15d2d6a73eed7c8a626b393e178c21b3f6f6f4c8c` |
| 16 | `11-shell-card-still-pending.png` | 73,972 | `fa23ee9e73c0e179e7fd03a6cc420925b556c6525925d02b386af1da8cd4c4cf` |

机器可读清单：`04-screenshot-hashes.txt`（16 行 + 表头 + COUNT）；既有 E2E 30 张清单：`05b-e2e-screenshot-hashes.txt`。

### 4.4 账本样例

- 路径：`probe-run-2/project/.ans/state/customer-directives.jsonl`（9 行 / 3,344 bytes / `765b8b10…`）。
- 9 条事件（摘要见 `07-ledger-events.txt`）：
  - `d-1` created approval allow shell:npm install once（seq 1）
  - `d-2` created approval allow shell:npm install forever，`highRisk.reasons=["forever"]`、`acknowledged:true`（seq 2）
  - `d-3` created decision select-recommended，scope `{}`，`highRisk.reasons=["switch-off-project-recommended"]`、`acknowledged:true`（seq 3）
  - `d-4` created decision select-option「方案 B」，scope `{flowId:"focus"}`（seq 4）
  - `d-3` revoked（seq 5）；`d-4` revoked（seq 6）
  - `d-7` created decision select-option「不存在的选项」，scope `{flowId:"focus"}`（seq 7）
  - `d-1` revoked（seq 8，面板路径）
  - `d-9` created approval allow shell:npm install once（seq 9，AC-22 卡内入口）
- `rawText`/`sessionId`/`createdBy`/`source` 均按 `customer-directive/v1` 记录；不在此重复原文全文。
- **本探针未执行任何 shell 命令，因此不产生 shell 审计样例**；`directive:{id,scope}`/`by:"directive:<id>"` 审计证据见 B1/D1（`test/编排/customer-directive-gate.test.ts`、D1 集成测试第 2 用例）。

---

## 五、发现与观察（如实记录，不修改产品代码）

### 5.1 面板撤销路径未产生回执系统行（唯一失败检查）

- **观察**：S5 点击面板内 `directive-revoke-d-1` 后：
  - 面板行 `directive-row-d-1` 进入 `data-status="revoked"`（`S5_REVOKED_ROW_STATE=true`）；
  - 账本追加 `directive.revoked id=d-1 seq=8`（`S5_LEDGER_REVOKED=true`）；
  - **未出现**「已撤销审批指令 #d-1」系统行（等待 3 秒，`S5_PANEL_REVOKE_RECEIPT=false`，notes 中无该回执）。
- **对照**：同一服务路径的输入式撤销 `@决策 撤销 #d-3`/`#d-4` 均产生了正确回执（`S4B_REVOKE_D3_RECEIPT=true`、`S4B_REVOKE_D4_RECEIPT=true`），说明回执模板与 durable 后投递路径本身可用。
- **代码锚点（只读核对）**：
  - `app/renderer/src/stores/directive-store.ts:922-925` 的 `revokeDirective({ id, target, projectRoot })` **未传 `roleId`/`runtime`**；
  - `app/desktop/directive-input.ts:749-751` 的 `revoke()` 从入站载荷读取可选 `roleId`，随后调用 `emitReceipt(projectRoot, roleId, …)`；
  - `app/desktop/directive-input.ts:366` 的 `emitReceipt` 在 `roleId` 为空时**直接 return**（回执需要显示目标角色）。
- **影响**：面板撤销满足账本/行状态，但不满足 D2 矩阵「撤销生效项 → 回执」以及 V1 AC-12「回执正确」的客户可见面。**D2 未修改产品代码/断言**，交 E2 判定；修复应由 C1/C2 属主在授权写集内处理（面板载荷补 `roleId`，或由主进程从行/卡上下文解析显示目标）。
- **证据**：`probe-run-2/report.json` 的 `S5_PANEL_REVOKE_RECEIPT`、`08-approval-revoked.png`、`06-d2-probe.log`。

### 5.2 高危 Q7 A 子句在真实运行中成立

- `@审批 … forever`：未勾选时确认禁用；勾选后落账，账本保存 `highRisk.reasons/acknowledged/acknowledgedAt`（S2）。
- `@决策 选推荐项 until=session`（项目级）在「替我决策」开关关闭时显示高危横幅、确认禁用；勾选后落账，账本 `highRisk.reasons=["switch-off-project-recommended"]`（S3/`05a-decision-high-risk-dialog.png`）。与 AC-13/V1 §1.2.1（Q7 A 前提）一致，非缺陷。

### 5.3 冲突/不匹配回落

- 两条适用决策指令给出不同结果 ⇒ `决策指令冲突（d-3、d-4）`，客户卡呈现，不代选，不消费（S4）。
- 唯一适用指令无法匹配唯一选项 ⇒ `决策指令 #d-7 未匹配到唯一选项`，客户卡呈现，不代选（S4b）。
- 两条路径均未产生 `directive:*` 结算归属；人工回答的 `operatorId` 为探针通道标识，`directive` 为空。

### 5.4 AC-22 共存

- shell 卡待答期间，卡内入口提交不受阻；指令确认对话框在 shell 卡之上打开，shell 卡保持待答；确认指令后 shell 卡仍待答，未发送 `shell:confirm-response`（S7，`10/11` 截图）。卡内提示明确「确认对话框已打开；本卡仍待答」。

### 5.5 项目切换

- 未决指令确认对话框随项目切换关闭，提交回包 `directiveCancelled:true` 且错误文案「已取消；未记录。」；账本零新增（S6）。早前迭代观察到新项目 pane 的输入框不回填旧项目草稿（最终探针未把该点作为断言）；草稿恢复口径（`directiveCancelled` 按原 runtime/role 键保存）交 C2/E2 核对 AC-4。

### 5.6 探针性质与限制

- 探针是 test-only 证据工具，**不进入产品代码**；无关 IPC 用无害桩，但指令链路（preload → renderer → main interface → directive controller → B1 ledger → customer-input）均为真实件。
- 探针不执行真实模型轮次、不联网、不写客户项目；夹具项目与 userData 全在证据目录。
- 探针未驱动真实 shell 工具，因此不产生 D2-S4「精确命令放行一次/第二次回正常链」与 shell 审计样例；这些由 B1 gate 测试与 D1 集成测试覆盖（见 §六）。

---

## 六、未覆盖、停止项与证据边界

| 项 | 状态 | 说明 / 既有覆盖 |
| --- | --- | --- |
| V1 §4.6 D2-S8 重启后 `session` 失效、未用 `once` 失效 | **未在 D2 真实 Electron 重跑** | D1 集成测试第 4 用例（`test/测试/customer-authorization-plane-integration.test.ts`）以真实 B1 运行时验证 `app-restart`/`unused-once`；D2 派发清单未列重启场景 |
| V1 §4.6 D2-S9 坏账本 | **未在 D2 真实 Electron 重跑** | D1 集成测试第 5 用例验证坏行 `ledgerErrors>0`、facts 为空、主路径回落；C1 `directive-decision.test.ts` 覆盖坏账本按无指令 |
| V1 §4.6 D2-S4 精确命令放行一次 + 重复回正常链 | **未在 D2 探针执行** | 探针只创建审批指令，不运行 shell；B1 `customer-directive-gate.test.ts`、D1 集成测试第 2 用例覆盖 gate 消费/once/顺序/审计 |
| V1 §4.6 D2-S11 带图标记拒绝 / `@边界` 普通聊天 | **未在 D2 探针执行** | C1 `directive-input.test.ts` 覆盖带图命中拒绝；`@边界` 非目标由 A1 解析器测试与 AC-20 结构检查覆盖；D2 派发清单未列 |
| 空正文面板、近失配普通投递 | **未在 D2 探针执行** | C1/C2 单测覆盖空正文 `confirmable:false`、近失配不命中；D2 派发清单未列 |
| shell 审计样例 | **本 D2 不产生** | 无 shell 执行；见 B1/D1（§4.4 末条引用） |
| 多引擎真实运行 | **只选默认 `claude` 运行时** | 团队计划 §10.2 第 9 项允许至少一个真实引擎；其余以共享通道测试覆盖 |
| 面板撤销回执 | **观察到缺失**（§五.1） | 唯一失败检查；不伪造 PASS，交 E2 |
| 录屏 | **不要求、不提供** | 仅 PNG 截图，符合 V1 §2.4 |

**停止项**：无。未发现需要改产品/扩写集/新增依赖的阻断；面板撤销回执缺失作为事实发现记录，不擅自修复。

---

## 七、写集、候选完整性与纪律

| 检查 | 结果 |
| --- | --- |
| HEAD | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（与 D1 相同） |
| D1 53 候选逐文件 `git hash-object` + SHA-256 | **53/53 unchanged；mismatch 0；missing 0**（`03-candidate-integrity.txt`，脚本 `verify-d1-candidates.mjs`） |
| `git status --porcelain -- src app test` | 50 entries；除 D1 候选外**唯一新增路径**为 `test/测试/customer-authorization-plane-d2-probe.mjs`（test-only 探针） |
| `src/provider/directive/`、`src/service/directive/` | 状态目录条目展开后均为 D1 已列候选，未新增文件 |
| 暂存区 | `git diff --cached --name-only` **空**（未暂存） |
| 构建/配置/入口 | `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml` **未改** |
| 产品代码/其他角色测试 | **未修改**；D2 只新增 test-only 探针与证据 |
| 断言/skip | 未修改既有断言；未新增 skip/todo |
| 提交/推送/合并/发布 | **均未执行** |
| 其他角色 | 未派发、未切换角色 |

D2 新增文件（证据/工具，非产品候选）：`test/测试/customer-authorization-plane-d2-probe.mjs`、`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/` 下探针日志/截图/哈希/脚本。

**transient 文件披露（不得作为入库候选）**：`e2e-out/userData/`、`e2e-out/e2e-pi.env`、`probe-run-2/userData/`、`probe-run-2/project/`、`probe-run-2/project-2/`、`probe-run-2/project/.ans/state/customer-directives.jsonl`、`probe-run-2/ledger-snapshot.json`、`app/renderer/dist/`（构建产物，已被 `.gitignore` 忽略）。其中 JSONL/快照仅作**证据引用**（记录路径与 SHA-256），不是产品/测试源候选；E1 组装候选时应只列产品/测试源文件与同候选证据，排除上述运行期产物与整个 `probe-run-2/userData/`。

---

## 八、证据清单（关键项）

| 文件 | 行数/数量 | SHA-256 | 用途 |
| --- | ---: | --- | --- |
| `00-environment.txt` | 16 | `dcc24b577c1423f1a7461b735163e2028a214424717e1fc11aaca91ae8b8c4b5` | 既有 E2E 环境（Node/npm/Electron/HEAD/OS） |
| `00b-probe-environment.txt` | 33 | `5140e2c1b54ad8f41fb3a745b5de3a079b7918b4645ac92f6a609bf6770b54f1` | D2 探针环境/命令/userData/窗口/哈希 |
| `02-residual-processes.txt` | 12 | `c03eab841ec12051a83de5aa8f16c8c4676ddfe1f81516848b4aab0ac3660a3b` | 残留进程（PID 35700 已终止；34404/11492/41000 属 network-monitor） |
| `02b-d2-residual-processes.txt` | 12 | `455755d54ed6072423b5e747f4b2c63374fde3915806d145c5ad34d9eb864661` | D2 探针后残留复查（同上，无新增 Electron） |
| `03-candidate-integrity.txt` | 8 | `ef9e0db12d21993838f9676e72aa4538e117f8c44db46c439c51b2e5cdf76ae8` | D1 53 候选 53/53 未变；唯一新增探针 |
| `04-build-renderer.log` | 27 | `a0e110aa250887d798d1f4ae8cbb89160e23c30e352c90300ba1cf8f361b3747` | D2 入口构建 `exit 0` |
| `04-screenshot-hashes.txt` | 18 | 见 `08-evidence-hashes.txt` | 16 张探针截图清单/尺寸/SHA-256 |
| `05-e2e-run.log` | 199 | `68c51d63b95694256733aeb3637264c0e457095f4dc23f2853aa6923bfa4dad2` | 既有 E2E 原始日志（exit 0 / 87s） |
| `05b-e2e-screenshot-hashes.txt` | 32 | 见 `08-evidence-hashes.txt` | 既有 E2E 30 张截图清单/尺寸/SHA-256 |
| `06-d2-probe.log` | 98 | `ba50baa30c8a20eadc583da379642e088659e6e6bbbc89d794e9db1c23f6353b` | **最终探针原始日志**（64 checks / 1 false / exit 1 / 16s） |
| `06-d2-probe-run1.log` / `run2.log` / `run3.log` | — | 见 `08-evidence-hashes.txt` | 开发迭代日志（不作为最终证据） |
| `07-ledger-events.txt` | 12 | `3d5abb32643cdb48ebc19d1fd4ae1eabde6f9d19a13d309b39a72e79ad54a1d8` | 9 条账本事件摘要 |
| `e2e-out/report.txt` | 512 | `4e19e7dcbbf2a486544dd2a561d146812a86637b0a805009521f300926b80152` | 既有 E2E 报告（E2E_PASS=true） |
| `probe-run-2/report.json` | 875 | `f4a95fab1b6afb561b11b89bb4a9015345b031f2d0a9a546cf1c77ef21cc89b2` | 探针逐检查结果/截图/console |
| `probe-run-2/ledger-snapshot.json` | 166 | `2044a479b8cb48ef0a08ac3edf569335bb7cbf5a1e0ee2f0ed5dd713f99eb301` | 账本快照 |
| `probe-run-2/project/.ans/state/customer-directives.jsonl` | 9 | `765b8b10fbe74a9869d54012a0d289c6fa58528655718991edc6d379c68fac4a` | 账本原始 JSONL |
| `test/测试/customer-authorization-plane-d2-probe.mjs` | 954 | `a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427` | test-only 探针 |

完整逐文件哈希（含证据脚本）见 `08-evidence-hashes.txt`。

---

## 九、D2 出口事实（只报事实，不判验收）

- 既有 E2E：**未重跑**；`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、`exit_code=0`、87 秒、30 张截图与 report 引用 30/30 对应（§三）。
- 指令平面真实运行：**64 checks / 63 true / 1 false**，16 张 1360×860 截图，9 条账本事件（§四）。
- 唯一 false：面板撤销未产生回执系统行；输入式撤销回执正常；已按事实记录并给出代码锚点，未修改产品（§五.1）。
- AC-22 共存、项目切换取消、高危未勾选禁用、决策代选/冲突/不匹配、审批回执与落账均在真实 Electron 下观察到（§4.2）。
- D1 53 候选 **53/53 未变**；D2 仅新增 test-only 探针与证据；未 commit/push（§七）。
- 未覆盖项（重启/坏账本真实运行、shell 执行/审计、带图/`@边界`、多引擎）已逐项披露并指向既有测试证据（§六）。
- 本记录不是验收结论；最终 AC 判定由独立验收 E2 按 V1 给出。

- **记录版本**：本记录最终 **288 行**（`wc -l`，含本行）；SHA-256（不含本行，可复算：`head -n -1 <本文件> | sha256sum`）：`f8e1e9b1605ac54485e38d9dc6ebc9734fe9096b299bf496179816cfbe783ba7`

---

## 十、D2-fix（Revision 1，2026-11-03）

- **触发**：D2 §五.1 唯一失败 `S5_PANEL_REVOKE_RECEIPT=false`（面板撤销无回执）；C2 已在本候选上窄修 4 个文件（`stores/directive-store.ts`、`chat/directive-panel.tsx`、`shell/Composer.tsx`、`test/桌面UI/directive-panel.test.ts`，C1 未改）。候选因此相对 D1/D2 变化，D1/D2 的受影响证据失效；本修订在**当前候选**上重跑 D2 探针 + 既有 E2E + 受影响套件 + T3 全量 + 静态/构建门，只报事实，不判验收。
- **基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（未变）；原 288 行内容（第 1–288 行）**字节未改**，为纯追加修订。原 288 行版本自述 SHA-256 按当时 `head -n -1`（即现文件第 1–287 行）复算为 `f8e1e9b1605ac54485e38d9dc6ebc9734fe9096b299bf496179816cfbe783ba7`，本轮复核一致；原记录「64 checks / 63 true / 1 false」「E2E 未重跑」等事实继续有效，仅代表修复前候选。
- **输入复核（全文件 SHA-256，均与派发一致）**：D2 记录 288 行 / `4752abb00c1c4b1acdb0a0e28d417a875b0c728f444f7840010d9d62f81e7937`；D1 记录 231 行 / `c4d6ecfe105a9a218fd720e55b7bcc84761326cbc361148864e96d5160c7a9ad`；C2 修复记录 139 行 / `6157181cfe88aa8285081ed95c7496f25e3a6e483d2abeeeed9131127cf11b5b`；C2 实施记录 176 行 / `dc8bcca40631985a32cfe7e7a4b9b50323c4bc4580e18432779e78b8ab1481ba`；C1 实施记录 208 行 / `966cba43dff59d127c86602981da6ee170e6447ab4a4b8df6f0dfbee469fefc6`；团队计划 675 行 / `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671`；V1 1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`；B0 基线 239 行 / `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441`。

### 10.1 当前候选（54 文件：D1 53 + D2 探针）

| 归属 | 文件数 | 与 D1/D2 的关系 |
| --- | ---: | --- |
| C1 | 11 | 逐字未变（`app/desktop/directive-input.ts` 仍为 `914868d8…`；C1 未参与 C2 修复） |
| C2 | 5 | 未变（dialog/ipc/ConfirmCard/shell.css + directive-dialog.test） |
| C2-fix | 4 | **修订**：store/panel/Composer/directive-panel.test（见 10.2） |
| A1 / A2 / A3 / allowlist / B1 | 6 / 2 / 3 / 1 / 20 | 逐字未变 |
| D1 | 1 | 跨层集成测试逐字未变（`e60cdb64…` / `57b3b9d9…`） |
| D2-probe | 1 | **新增**：`test/测试/customer-authorization-plane-d2-probe.mjs`（test-only） |
| **合计** | **54** | `git ls-files -m -o --exclude-standard -- src app test` 展开后 54；**unexpected 0 / missing 0 / mismatch 0** |

- 逐文件 `git hash-object` + SHA-256：`09-candidate-identity-fix.txt`（134 行 / `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`）；全部运行结束后复查 `17-post-run-candidate-identity-fix.txt`（134 行 / `71b24533d714c5a26d98213df26a4734ca03221cdb91a75536b73e74ce76fcf1`），仍 **54/54、0/0/0**。暂存区为空（`git diff --cached --name-only` 空）。
- 写集外 0：除上述 54 个产品/测试文件与 D2 探针外，`src`/`app`/`test` 无其他变更；`package.json`/`package-lock.json`/`tsconfig*`/`vite.config.ts`/`electron-builder.yml` 未改。

**D1 后发生变化的 5 个文件（含新增探针）**：

| 路径 | D1 记录（blob / SHA-256 / 行数） | 当前（blob / SHA-256 / 行数） | 来源 |
| --- | --- | --- | --- |
| `app/renderer/src/stores/directive-store.ts` | `40e84a11…` / `5096ba69…` / 1067 | **`4bb498cac277485dacae8353b95c7fb12d3c5bb8` / `edb7eefb9c758e1200ab8701a9df9d0cf171c3603b488257a4c0ecdf1f7e29e9` / 1080** | C2 修复（撤销载荷补 `{roleId,runtime}`） |
| `app/renderer/src/chat/directive-panel.tsx` | `64e60250…` / `c96f6cd2…` / 283 | **`6cc87500d1820118706b576891900b69d6340f5f` / `9861abd673aa432ba0595f2b1846ea34f42b91a24fefc36f4c6872d1e2db82ba` / 320** | C2 修复（透传上下文到撤销调用） |
| `app/renderer/src/shell/Composer.tsx` | `9afe743b…` / `0a19060b…` / 1011 | **`9b64fe998f18d6cab7a83accdd52fc14ec803e78` / `972b5779685b0943f7391b5aae2b2ca2a199dd7c1671bc06115b8b2fbb2aa1f8` / 1011** | C2 修复（面板挂载补 `roleId/runtime`） |
| `test/桌面UI/directive-panel.test.ts` | `c507a74f…` / `6ab90d22…` / 441 | **`e7f72fb5c49943b73e29080b9302cdf270c00300` / `f51e232144e2dde9707ee1e95cc7d24c61d9dbc80722c3d9464b229a2fb607c0` / 490** | C2 修复（新增带上下文载荷用例 + 源码守卫） |
| `test/测试/customer-authorization-plane-d2-probe.mjs` | 不存在 | **`4532a4e261dd5e6778fcfff9aefd58854b780887` / `a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427` / 954** | D2 探针（test-only，未修改） |

其余 49 个 D1 候选（含 C1 11、C2 5、A1/A2/A3/allowlist/B1、D1 集成测试）逐字未变；C2 修复记录 §2.1 的写后哈希与上表逐一吻合。

### 10.2 D2 探针复跑（当前候选，`probe-run-3`）

| 项 | 实测值 |
| --- | --- |
| 探针（未修改） | `test/测试/customer-authorization-plane-d2-probe.mjs` 954 行 / `a7913e87…`；日志头 `probe_sha256` 一致 |
| 命令 | `ANS_D2_HEAD=4c3a6e40… ANS_D2_PROBE_OUT=<…>/probe-run-3 ./node_modules/.bin/electron test/测试/customer-authorization-plane-d2-probe.mjs` |
| 渲染入口 | `npm run build:renderer` 先重建（`10-build-renderer-fix.log`）；dist `index.html` `5e58c03b…`，`renderer_entry_sha256` 记入日志头 |
| userData / 夹具 | `probe-run-3/userData`（**全新**，app ready 前 `setPath`）、`probe-run-3/project`、`probe-run-3/project-2`；**未复用** `probe-run-2` 或 C2 `probe-run` |
| 起止 / 耗时 | 2026-11-03T18:58:53+08:00 → 18:59:05+08:00 / **12 秒** |
| 退出码 | **0**（`D2_PROBE_DONE failures=0 checks=64 screenshots=16`） |
| checks | **64 / 64 true**；report.failures=0；0 console error；0 CSP violation |
| **S5 回执** | **`S5_PANEL_REVOKE_RECEIPT=true`**，receipt=「已撤销审批指令 #d-1」；`S5_TWO_LOGICAL_PANELS_AND_ROWS=true`、`S5_REVOKED_ROW_STATE=true`、`S5_LEDGER_REVOKED=true`（`d-1` 面板撤销为 seq 8） |
| 对照回执 | `S1_RECEIPT=true`、`S2_RECEIPT=true`、`S3_RECEIPT=true`、`S4B_REVOKE_D3_RECEIPT=true`、`S4B_REVOKE_D4_RECEIPT=true`、`S7_RECEIPT=true`（输入式/卡内入口未回归） |
| 截图 | **16 张 PNG**，全部 1360×860，清单 `11b-probe-screenshot-hashes-fix.txt`（18 行 / `726f8b820491cca0ab35d17db673599ca40a0dd9c97357b9393502c3ef2b7b7e`） |
| 截图对照 | 14 张与 D2 原证据逐字相同；`07-directive-panel.png`（`22f02524…`）与 `08-approval-revoked.png`（`eeafe6cc…`）因新增回执行而变化。C2-fix 自身 `probe-run/` 的 07/08 为 `1f01a92f…`/`6025fbe0…`，与本轮像素不同；面板行含 `(id, createdAt)` 时间戳，不同运行时刻像素不同，回执文本与检查结果一致 |
| report | `probe-run-3/report.json` **876 行 / 23,490 bytes / `c146869911c0801ce8476262cbeb892b73b63d28cfd2eec9bb678ce66335be5e`** |
| 账本 | `probe-run-3/project/.ans/state/customer-directives.jsonl` **9 行 / 3,344 bytes / `9e582f1fb3fa968fc18211b07120766f574ce3b3be95c6b32830a992a0d90696`**；快照 `ledger-snapshot.json` 166 行 / `0b2f39d176557eae68d62b03613b6a27066324b4a28d64665c065bb7ab395f23` |
| 日志 | `11-d2-probe-fix.log` **98 行 / 10,605 bytes / `5bb6479ce68504744525c3c8f0dfa4c5c1fe8fc4226084231ef76dbf53d680c8`** |

- 探针为 test-only 证据工具，**未修改**（哈希与 D2 记录一致）；本轮只读运行。
- 日志头有 1 条 Chromium GPU 持久缓存路径告警（`persistent_cache_sandboxed_file_factory`），与 D2 原 `06-d2-probe.log` 第 12 行同类同因；report 记录 console error=0、CSP violation=0。

### 10.3 既有 Electron E2E 复跑（当前候选，`e2e-fix-out`）

| 项 | 实测值 |
| --- | --- |
| 命令 | `ANS_E2E_OUTDIR=<…>/e2e-fix-out node_modules/.bin/electron test/桌面应用/e2e/main.mjs` |
| 脚本（未修改） | `test/桌面应用/e2e/main.mjs` SHA-256 `8c88c911dd4e523979c229e9a264cf78f52ecc4c1c058d4266be1d8508f29bd3`（与 D2 原记录一致） |
| userData | `e2e-fix-out/userData`（**全新**，脚本 `app.setPath("userData", OUTDIR/userData)`）；输出目录运行前 `rm -rf` 重建 |
| 起止 / 耗时 | 2026-11-03T18:59:30+08:00 → 19:00:56+08:00 / **86 秒** |
| 退出码 | **0** |
| 结果标记 | **`E2E_PASS=true`**、`E2E_FAILURES=`（空）、`E2E_DONE=1` |
| 截图 | **30 张 PNG**，全部 1360×860；report 的 30 个 `.png` 引用与文件**一一对应**（0 未引用 / 0 缺失）；清单 `12b-e2e-screenshot-hashes-fix.txt`（32 行 / `88452647b80b0cfd758bc632134c10f9532a4527a63645767c5fdfadb7245d21`） |
| report | `e2e-fix-out/report.txt` **512 行 / 27,943 bytes / `f0807a8e02a7ca8108ebd95b504e887b6d398fd0295bcb8eca240ccb0998f2d2`** |
| 日志 | `12-e2e-fix.log` **199 行 / 15,056 bytes / `d55df407502713a3a45a8b8a1eaef50445cd0a8fd2739319b97de5a0dbc9e8c9`** |
| 已知噪声 | 日志中 `background-tasks:list` 未注册处理器的 Electron 会话告警 58 条、GPU cache 告警 6 条，与 D2 原 `05-e2e-run.log` 同类同量；不影响 `E2E_PASS` 与退出码 |

### 10.4 受影响套件（逐组 `node --test --test-concurrency=1`）

| # | 组 | 文件数 | tests | pass | fail | skipped | todo | 退出码 | 耗时 | 日志 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| A | 桌面UI `test/桌面UI/*.test.ts` | 53 | **402** | **402** | 0 | 0 | 0 | 0 | 5,244 ms | `13a-suite-desktop-ui.log` |
| B | 桌面应用 `test/桌面应用/*.test.ts` | 55 | **522** | **522** | 0 | 0 | 0 | 0 | 70,562 ms | `13b-suite-desktop-app.log` |
| C | 编排 `test/编排/*.test.ts` | 57 | 737 | 736 | **1** | 0 | 0 | 1 | 13,354 ms | `13c-suite-orchestration.log` |
| D | 运行时核心 `test/runtime-core/*.test.ts` | 39 | 309 | 302 | **3** | 4 | 0 | 1 | 31,119 ms | `13d-suite-runtime-core.log` |
| E | 项目管理 shared `test/项目管理/shared/*.test.ts` | 11 | 175 | 170 | 0 | 5 | 0 | 0 | 7,348 ms | `13e-suite-project-shared.log` |
| F | i18n guard `test/项目管理/shared/i18n-guard.test.ts` | 1 | 6 | 6 | 0 | 0 | 0 | 0 | 243 ms | `13f-suite-i18n-guard.log`（`scanned=136 allowlisted=21 violations=0`） |
| **合计** | — | **216** | **2,151** | **2,138** | **4** | **9** | **0** | — | — | — |
| G | D1 跨层集成（单列） | 1 | **6** | **6** | 0 | 0 | 0 | 0 | 513 ms | `13g-suite-d1-integration.log` |

- 4 项失败全部为 B0/D1 同名同因的既有 Windows symlink `EPERM`：runtime-core 3（`file-write-safety.test.ts:97`、`session-store.test.ts:46/58`）、编排 1（`shell-authorized-routine.test.ts:184` 测试；栈内 `:191` 为 EPERM 抛点）。**新增确定性失败 0**。
- 9 项 skip 均为既有平台项（runtime-core 4 + 项目管理 shared 5）。**新增 skip 0**。
- 与 D1 的 2,150/2,137/4/9 相比：**+1 test / +1 pass**（C2 修复在 `directive-panel.test.ts` 新增 1 用例），fail/skip 不变。

### 10.5 T3 全量回归（当前候选）

命令（`D1-evidence/run-t3.sh` 逐字执行）：

```
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)
```

| 项 | 实测值 |
| --- | --- |
| 文件数 | **403**；清单 `14-full-t3-file-list-fix.txt`（403 行 / `ccabf2f3d0638068298acfb2025e6aad111e33830772eb5c59c87ca65b44a04c`，与 D1 文件清单**同哈希**；含 D1 集成测试，不含 `.mjs` 探针） |
| 起止 / 耗时 | 2026-11-03T19:04:03+08:00 → 19:08:24+08:00（日志 `start`/`end`）/ **260,985 ms ≈ 4 分 21 秒** |
| 退出码 | **1**（因 9 项既有环境失败；非运行错误） |
| 计数 | **tests 3,624 / pass 3,597 / fail 9 / cancelled 0 / skipped 18 / todo 0** |
| 失败分类 | 9 项全部既有 Windows symlink `EPERM`；file:line + 测试名与 D1/B0 **逐条相同**；**新增确定性失败 0** |
| skip | 18 项与 D1/B0 分类逐条相同；**新增 0** |
| 原始日志 | `14-full-t3-fix.log` 4,733 行 / 529,001 bytes / `10ac5e52868e536181503a0519ad42114fb0ccd1bcb7c17175dbbb7b5b1ac585`；分类 `15-failure-classification-fix.txt` 64 行 / `4a6d1e4e465568103cbccb845c98000736e0d08b7f207cd2b20a2b60e69f3a60` |

与 D1（403 / 3,623 / 3,596 / 9 / 18）对照：**+1 test / +1 pass**（C2 修复新增用例），文件数、fail、skip 均不变。排除项仍为 `test/pi-adapter/write-sequencing.test.ts`（仓库既知挂起，按 B0/团队计划 §6.3 不运行，行为未验证）。

### 10.6 静态 / 构建门

| # | 命令 | 结果 | 耗时 | 日志 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **exit 0** | 1,480 ms | `16a-typecheck-fix.log`（10 行 / `384d42c6d37d92c67c3d8ea95bc211a73a45a4f081b0313922f4f7d6f62ffd0b`） |
| 2 | `npm run typecheck:renderer` | **exit 0** | 646 ms | `16b-typecheck-renderer-fix.log`（10 行 / `97006a340c822ea9f788c784fdfcd941a1ed3849cbf4c5893846f3c1bff51764`） |
| 3 | `npm run build:renderer` | **exit 0**（2,799 modules transformed；vite 自报 336 ms；仅既有 chunk/dynamic-import 警告） | 947 ms | `10-build-renderer-fix.log`（28 行 / `d20e311a32db1327305b05dee1d420eb0b0ee51f459fc3a1a249d985968b095b`） |

`app/renderer/dist/` 为 `.gitignore` 忽略的构建产物，非候选；构建先于探针/E2E 执行，确保真实运行使用当前源码。

### 10.7 披露、纪律与边界

1. **C2 修复事实**：4 个文件相对 D1 变化（10.1 表），哈希与 C2 修复记录 §2.1 逐字吻合；C1 文件（`app/desktop/directive-input.ts` `914868d8…`、`app/preload.cjs` `684c0d96…`、`app/main.ts` `c62da456…`）未改。本节点只复验，不修改产品/测试代码。
2. **D2 探针**：`test/测试/customer-authorization-plane-d2-probe.mjs` 为 test-only 证据工具，非产品/测试源候选；本轮 SHA-256 `a7913e87…` 未变。
3. **transient 非候选**：`probe-run-3/userData/`、`probe-run-3/project/`、`probe-run-3/project-2/`、`e2e-fix-out/userData/`、`e2e-fix-out/e2e-pi.env`、`app/renderer/dist/` 均为运行/构建产物；JSONL 与快照仅作证据引用（路径 + SHA-256）。
4. **未改断言/未新增 skip**；既有 9 项 EPERM 与 18 项 skip 按 B0 分类，不当作通过、不计为新增。桌面应用 `.mjs` 冒烟与录屏不在本轮范围；多引擎真实运行仍未覆盖（同 D2 §六）。
5. **未 commit/push**；未派发其他角色；未修改角色卡/边界/构建配置。停止项：**无**。
6. **残余边界**：面板撤销回执依赖当前选中角色的 `roleId/runtime`（C2 修复只在该上下文有效时透传）；「无选中角色仍要求回执」未在本轮验证，沿用 C2 修复记录 §6.7 的披露，交 E2 判定。

### 10.8 Revision 1 证据与索引

| 文件 | 行数 | SHA-256 |
| --- | ---: | --- |
| `09-candidate-identity-fix.txt` | 134 | `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a` |
| `17-post-run-candidate-identity-fix.txt` | 134 | `71b24533d714c5a26d98213df26a4734ca03221cdb91a75536b73e74ce76fcf1` |
| `10-build-renderer-fix.log` | 28 | `d20e311a32db1327305b05dee1d420eb0b0ee51f459fc3a1a249d985968b095b` |
| `11-d2-probe-fix.log` | 98 | `5bb6479ce68504744525c3c8f0dfa4c5c1fe8fc4226084231ef76dbf53d680c8` |
| `11b-probe-screenshot-hashes-fix.txt` | 18 | `726f8b820491cca0ab35d17db673599ca40a0dd9c97357b9393502c3ef2b7b7e` |
| `12-e2e-fix.log` | 199 | `d55df407502713a3a45a8b8a1eaef50445cd0a8fd2739319b97de5a0dbc9e8c9` |
| `12b-e2e-screenshot-hashes-fix.txt` | 32 | `88452647b80b0cfd758bc632134c10f9532a4527a63645767c5fdfadb7245d21` |
| `13a-suite-desktop-ui.log` | 416 | `7fdb47c22e8d6995c58cab589076c2236521a351b19ce7e8e29ce77d8368f2e7` |
| `13b-suite-desktop-app.log` | 549 | `515413c619333f0fee7f164e064eae0d3da9b1b944cd1d02a0ee1fa24bb3d570` |
| `13c-suite-orchestration.log` | 1,319 | `3fc6e517abe33228ff66811bdfe4898ca7e4bf9d4ee256f5e20fb76cdeb0ff04` |
| `13d-suite-runtime-core.log` | 374 | `a18e59886ba98933f507f1d529b6a77307d5f638868384a27a3dfd6ed190e3c5` |
| `13e-suite-project-shared.log` | 192 | `ab515e156f602c6471aa46e10b7043a3bdf3175f03e716a7509d624bc2813d28` |
| `13f-suite-i18n-guard.log` | 21 | `00c1c36787462a42e858a0ab0655a58783a461d732b2cc1e87d9925439bcf0f6` |
| `13g-suite-d1-integration.log` | 20 | `312f60242ceadcd7ddf9ed0646d3479d43195af54a08f11ae81959cfc6b4893c` |
| `14-full-t3-fix.log` | 4,733 | `10ac5e52868e536181503a0519ad42114fb0ccd1bcb7c17175dbbb7b5b1ac585` |
| `14-full-t3-file-list-fix.txt` | 403 | `ccabf2f3d0638068298acfb2025e6aad111e33830772eb5c59c87ca65b44a04c` |
| `15-failure-classification-fix.txt` | 64 | `4a6d1e4e465568103cbccb845c98000736e0d08b7f207cd2b20a2b60e69f3a60` |
| `16a-typecheck-fix.log` | 10 | `384d42c6d37d92c67c3d8ea95bc211a73a45a4f081b0313922f4f7d6f62ffd0b` |
| `16b-typecheck-renderer-fix.log` | 10 | `97006a340c822ea9f788c784fdfcd941a1ed3849cbf4c5893846f3c1bff51764` |
| `probe-run-3/report.json` | 876 | `c146869911c0801ce8476262cbeb892b73b63d28cfd2eec9bb678ce66335be5e` |
| `probe-run-3/ledger-snapshot.json` | 166 | `0b2f39d176557eae68d62b03613b6a27066324b4a28d64665c065bb7ab395f23` |
| `probe-run-3/project/.ans/state/customer-directives.jsonl` | 9 | `9e582f1fb3fa968fc18211b07120766f574ce3b3be95c6b32830a992a0d90696` |
| `e2e-fix-out/report.txt` | 512 | `f0807a8e02a7ca8108ebd95b504e887b6d398fd0295bcb8eca240ccb0998f2d2` |

- 逐文件完整索引（含全部 PNG、脚本与旧证据）：**`18-evidence-hashes-revision1.txt`**（由 `evidence-hashes-revision1.mjs` 生成；排除 `userData`/夹具项目的 transient 内容）。原 `08-evidence-hashes.txt` 保留为 D2 修复前候选的索引。
- 新增证据脚本（test-only，非产品候选）：`verify-current-candidates.mjs`、`run-d2fix.sh`、`run-d2-probe-fix.sh`、`run-e2e-fix.sh`、`e2e-report-check.mjs`、`make-classification-fix.mjs`、`evidence-hashes-revision1.mjs`。

### 10.9 Revision 1 出口事实（只报事实，不判验收）

- 当前候选 **54 文件（D1 53 + D2 探针）**逐文件哈希闭合：**0 unexpected / 0 missing / 0 mismatch**；运行后复查不变（§10.1）。
- D2 探针（当前候选、全新 `probe-run-3`）：**64/64 true，failures=0，exit 0，12 秒，16 张 1360×860 截图**；**`S5_PANEL_REVOKE_RECEIPT=true`**（「已撤销审批指令 #d-1」），其余回执与场景检查全部 true（§10.2）。
- 既有 E2E（当前候选、全新 `e2e-fix-out`）：**`E2E_PASS=true`、失败空、exit 0、86 秒、30 张 1360×860 截图、report 引用 30/30**（§10.3）。
- 受影响套件（5 组 + guard）：**2,151 tests / 2,138 pass / 4 fail / 9 skip**；4 项均为既有 symlink EPERM；D1 集成单列 **6/6**；新增确定性失败 0、新增 skip 0（§10.4）。
- T3 全量：**403 文件 / 3,624 tests / 3,597 pass / 9 fail / 18 skip / 0 todo，exit 1**；9 失败与 18 skip 与 D1/B0 逐条相同；**新增确定性失败 0、新增 skip 0**（§10.5）。
- 静态/构建：`typecheck`、`typecheck:renderer`、`build:renderer` 均 **exit 0**（§10.6）。
- 本修订不是验收结论；最终 AC 判定由独立验收 E2 按 V1 给出。

- **记录版本（Revision 1）**：本记录共 **459 行**（`wc -l`，含本行）；SHA-256（不含本行，可复算：`head -n -1 <本文件> | sha256sum`）：`e7b0488b0c5ecbe0a0e76e354e7c7c599db1b19b2d0ae8ee9c884a5cb0e897be`。
