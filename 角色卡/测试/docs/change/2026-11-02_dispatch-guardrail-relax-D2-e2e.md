# D2 真实 Electron E2E：派发护栏放宽（dispatch-guardrail-relax）

- **任务 ID**：`2026-11-02-dispatch-guardrail-relax`（风险档位 **T3**）
- **记录角色**：测试（Testing）
- **日期**：2026-11-02
- **阶段**：D2 可跑 Electron E2E（团队计划 §5.1/§5.3、§7.3；V1 §5.4）
- **状态**：**D2-complete：E2E 已真实运行并产出 `E2E_PASS=true`（exit 0，79s）**。本记录只陈述运行事实，不判验收；D2 结果供 E1 变更包 / E2 独立验收使用。
- **输入与基线**：
  - 团队计划 v1：`docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`（**482 行** / `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d`）
  - 验收标准 V1：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（**814 行** / `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3`）
  - B0：`角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md`（**201 行** / `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb`）
  - D1（含 D1-fix）：`角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-D1-regression.md`（**287 行** / `12b581bac3f0627c170fc7c5ea8cbc0938bcb718c4674f1205f3f341ad90316c`）
- **候选身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`；**候选树 `79962115b301f9e2b7c6c0d19af8844335b1fef5`（E2E 前后复算一致）**。
- **环境**：Windows 11 Pro 10.0.26300 / MINGW64 Git Bash 3.6.10；host Node **v24.22.1** / npm 11.19.1；Git 2.55.0.windows.5；E2E 报告记录 Electron **44.7.0**、Electron 内置 Node **24.21.0**；测试窗口 **1360×860**（脚本 BrowserWindow）；未设置任何 DEBUG 环境变量，脚本无 DEBUG 覆盖层。

---

## 一、执行命令与结果

| 项 | 值 |
| --- | --- |
| 工作目录 | 本 worktree 根 |
| 命令 | `ANS_E2E_OUTDIR=<D2 evidence dir> node_modules/.bin/electron test/桌面应用/e2e/main.mjs` |
| 输出目录 | `角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/`（脚本自带 `ANS_E2E_OUTDIR`；临时 userData 也在此目录，不碰客户真实配置） |
| 开始 | 2026-11-02T05:05:26Z（本地 13:05:26） |
| 结束 | 2026-11-02T05:06:45Z（本地 13:06:45） |
| 退出码 | **0** |
| 耗时 | **79 秒** |
| 报告结论 | **`E2E_PASS=true`**、`E2E_FAILURES=`（空）、`E2E_DONE=1` |
| 报告文件 | `report.txt`（**512 行** / 26,800 B / SHA-256 `db0c82dc063802abfc286a4cc2579a13a4d9814d0dbde3a34ffe7f3d3a4d8227`） |
| 原始 stdout/stderr | `02-e2e-run.txt`（190 行 / 14,204 B / SHA-256 `99cd43c1a2cbea1187e434a277c8d1221d436ae4da9adb9c80a055012281dd5c`） |

- 报告关键值：`ELECTRON=44.7.0`、`NODE=24.21.0`、`PROJECT=<本 worktree>`、`ROLE_COUNT=16`、`E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`。
- report 中 **无** `E2E_ERROR` / `WATCHDOG_TIMEOUT` / `IMPORT_ERROR` / `RENDERER_ENTRY_ERROR`；无 `capture-failed`。
- stdout/stderr 摘要：进程 exit 0；stderr 含 57 条 `Error occurred in handler for 'background-tasks:list': No handler registered`（E2E harness 未注册该通道的非致命报错）与 1 条 `Error occurred in handler for 'session:send': Error: 修复探针：发送异常原文`（脚本自身的失败注入探针）。这些输出未进入 `E2E_FAILURES`；脚本的通过判据为 `hardChecks`/`repairChecks` 全 true（`E2E_PASS=true`）。如实记录，不把它们算作产品通过或产品失败。
- 未使用录屏；未要求录屏。

---

## 二、截图与产物

- 截图数量：**30 张 PNG**；全部 **1360×860**；无 `capture-failed`。
- 截图来源：当前候选真实 Electron 窗口（`win.webContents.capturePage()`），未启用 DEBUG 覆盖层；未使用录屏。
- 产物目录：`角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/`；另有脚本生成的临时项目/诊断/userData 子目录（`diagnostics/`、`gate-fixture-project/`、`genesis-TSNCfe/`、`governance-disabled-project/`、`p13-second-project/`、`proj-sKJJog/`、`userData/`、`userData-restart-probe/`），均为 E2E 临时运行产物，不是产品候选。
- 截图清单与 SHA-256（字节数/尺寸见 `03-artifact-manifest.txt`）：

| 文件 | SHA-256 |
| --- | --- |
| `00-titlebar.png` | `8681ed2bfe3b9fab67d68f85d73c2f7d1dcf28278ee10ef20f83f3a7bba9d612` |
| `01-import.png` | `0ec443357d8c232cb2f402c711a7143409b8e0cfb232ae5b0dfbc08dbd94dea8` |
| `01b-su.png` | `0ec443357d8c232cb2f402c711a7143409b8e0cfb232ae5b0dfbc08dbd94dea8` |
| `02-chat.png` | `bd83d4a49b0d1f7e7e116fd3ea2405eca06182102c74c2f30c1d45f16c8abe9b` |
| `03-denied.png` | `5c83621cd0b935874f346e5354f824961e053acfb15b479b92040408a254aa61` |
| `04-profile.png` | `0683ea68ed355aee5475b1c9fe63399231ae06bd4968b054f8c905ba13ef7466` |
| `05-bootstrap.png` | `19d0707d26533ec4208fd7914adfcbbd0de12225c6622546966e19bdbe66482f` |
| `06-refresh.png` | `8ced4f8b352a62db40e4a6a568b20c9cc49c5c177baf284bacc0195473830fb1` |
| `07-handback.png` | `9c62c1f9bbe23ec4267167e119b068dc94555caf060fdfec2eabea671cadc74e` |
| `08-su-pane.png` | `3978df8d0580960aae1768ffbd0d4538af2af4650d2ae3f468cb5926e9961cd4` |
| `09-pi-panel.png` | `10a53a6ef145f4b6009faa0d8cf4dc93772934ae23ae7e879cafbd255120ee02` |
| `10-pi-saved.png` | `f6959b2f33d999972abdb4204a03cbb6b9e8eef5d9ff4f6b0fdd5396557f5750` |
| `11-operator-card.png` | `d1cfa3c03dde7bf47dace3d6e41914095a17c6c6f72c0088a7df8511072e739f` |
| `11b-decision-dialog.png` | `eb982b77e39e04ea94455288ae6bc675c27645dbea72f50bb25dee57084aa328` |
| `11c-decision-history.png` | `28feae74e8d3057bdee5f7aa5be28c6848dc85496334847d1e97183052d6759e` |
| `12-composer.png` | `0683ea68ed355aee5475b1c9fe63399231ae06bd4968b054f8c905ba13ef7466` |
| `12-restore.png` | `f8a021b0ef99168e5ad913eb8998f4aac0c5281c4ba4beee54c9064be6fe2460` |
| `14-operator-crosspane.png` | `d44c2d3b17428b6031e2ac92246557cca39414ee6b5e8b79c78a5988e0b1de9a` |
| `30-escalation-card.png` | `f93deab86091ee5b2842c61384ed6e234fb986ea6a895036810785747572c208` |
| `31-escalation-card-details.png` | `926509805cd813b34837058a6c0b083074f09ff7c9311fd07b214b15f8624dca` |
| `32-judge-deny-pause-button.png` | `85ad0a7103e4fd35705e3299fe02e044a6d88c1d2d5c76e6774cbe7ecd11a855` |
| `33-whitelist-no-card.png` | `85ad0a7103e4fd35705e3299fe02e044a6d88c1d2d5c76e6774cbe7ecd11a855` |
| `34-escalation-paused-footer.png` | `3f0db4fa4cd0af99117244213c88327a25fc2df542f81b19c9a6e2b7368a40cb` |
| `35-judge-row-paused.png` | `cec252d8fb08fac22132978340d6ca8e239fca6c7f0e55d3345a01b7e60c17ae` |
| `36-paused-after-window-reopen.png` | `f31965569c04b461f780f12691a7cb654e266087d39417a950aa5149d14ddf73` |
| `37-escalation-slot-arbitration.png` | `4113a73d847da5e4c5aa6fefee431b0a73678585db23073cd513853de0a493f9` |
| `38-approval-card-contrast.png` | `76cf4406b8e918b111e78a7126f559793a6394de6a952a4746bc081cb961c0de` |
| `39-escalation-script-context.png` | `32520e7c775e907caaa27f1c56f5a2f3bf9790d7b258d58e081faa4ea75f54c0` |
| `40-judge-retry-hint.png` | `92028c25ad39f9bdf4bf3c522e4e50dec6c50d929fe1e0bc236584e1b9d1dd12` |
| `41-escalation-pending-then-allow.png` | `a3ae7e1a7382a97bbcf4ae71b5a6ba2614acb3575fca215ed4c8336226eecea4` |

- 报告共 29 条 `SHOT_*` 截图日志；`11b-decision-dialog.png` 由 `E_QUEUE_PRIORITY_CHAT_NO_CARD_SHOT=` 记录（同一截图机制），合计 30 张，与目录文件一致。
- 完整清单（含字节数、尺寸、非图片产物哈希）：`03-artifact-manifest.txt`（41 行 / `d6415e79ce0a58d8f0056386322bbfc0c9a5d46d2b72274a00ef41af5aa54204`）。

---

## 三、候选前后一致性

| 检查 | E2E 前 | E2E 后 | 结果 |
| --- | --- | --- | --- |
| HEAD | `c80f4944c3421554fcbd35f8570cedd3e2119a0a` | 同左 | 未变 |
| `git status --porcelain -- src app test` | 13 路径（A1 5 + B1 7 + `i-full-chain` 1） | 同左（13 路径，逐行相同） | **E2E 未改产品/测试** |
| 13 路径逐文件 blob + SHA-256 | 见 `01-pre-e2e-state.txt` | 见 `04-post-e2e-state.txt`；与 E2E 前 **逐项相同** | 14 个文件（含 run-role 对照）哈希一致 |
| 候选树 | `79962115b301f9e2b7c6c0d19af8844335b1fef5` | 同左 | 未变 |
| `git diff --cached --name-only` | 空 | 空 | 未暂存 |
| `git status --short` 全量 | 38 行 | 38 行，逐行相同 | E2E 未产生仓库内非证据改动 |

- E2E 的 `ANS_E2E_OUTDIR` 指向本角色证据目录；报告、截图、临时项目/userData/诊断均在该目录内，不属于产品候选。
- D2 未运行构建或 typecheck；只运行既有 E2E 脚本，未修改脚本。
- 关键候选哈希（E2E 前后一致）：`workflow-preconditions.ts` `9dfb5563…`、`dispatch-advisories.ts` `0781cd3d…`、`mechanical-rejection.ts` `1e1e6573…`、`session.ts` `491bf24f…`、`i-full-chain.test.ts` `b5d5c6c8…`。

---

## 四、D2 事实结论（不判验收）

1. **E2E 可跑且通过**：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs` 在最终候选上真实运行，exit 0、79s、`E2E_PASS=true`、`E2E_FAILURES` 空、`E2E_DONE=1`。
2. **截图证据**：30 张真实窗口截图，全部 1360×860，无 `capture-failed`，无 DEBUG 覆盖层，无录屏。
3. **候选未变**：E2E 前后 HEAD、13 路径 status、逐文件哈希、候选树 `79962115…` 均一致；E2E 未改产品/测试/脚本。
4. **限制**：该 E2E 是桌面应用整机自检，不是派发护栏专项场景；其 `E2E_PASS=true` 只证明脚本覆盖的检查在最终候选上通过，不替代 D1/T3 的派发语义证据，也不构成验收结论。stderr 中的 `background-tasks:list` 无 handler 与失败注入探针为非致命输出，未计入 `E2E_FAILURES`；是否影响验收由独立验收按 V1 判断。
5. **未做**：未 commit/push/merge/release；未修改 E2E 脚本；未接触客户；未判验收。

---

## 五、证据文件清单

目录：`角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `01-pre-e2e-state.txt` | 82 | `ef204d8ee4417a558809be1e5e06b4e9563064460d20157cc5d3c69ccc095333` |
| `02-e2e-run.txt` | 190 | `99cd43c1a2cbea1187e434a277c8d1221d436ae4da9adb9c80a055012281dd5c` |
| `03-artifact-manifest.txt` | 41 | `d6415e79ce0a58d8f0056386322bbfc0c9a5d46d2b72274a00ef41af5aa54204` |
| `04-post-e2e-state.txt` | 81 | `9145976a4e373d78e9c132432957a65a32daf106a247fc20b8ae5da31875c5c7` |
| `report.txt` | 512 | `db0c82dc063802abfc286a4cc2579a13a4d9814d0dbde3a34ffe7f3d3a4d8227` |
| `00-titlebar.png` … `41-escalation-pending-then-allow.png`（30 张） | — | 见 §二 / `03-artifact-manifest.txt` |
| 临时目录 | — | `diagnostics/`、`gate-fixture-project/`、`genesis-TSNCfe/`、`governance-disabled-project/`、`p13-second-project/`、`proj-sKJJog/`、`userData/`、`userData-restart-probe/`（E2E 运行产物，非候选） |

本记录自身行数/SHA-256 由 D2 完成报告给出（文件无法在不改变自身内容的前提下内嵌最终哈希）。

---

## 六、写入边界与限制

- **写入边界**：仅 `角色卡/测试/docs/change/`（本记录、运行日志与截图/临时产物）；未修改产品源码、测试脚本、配置、角色卡、边界、其他角色文档；未写 `docs/scheduling|acceptance|communication|planning`；未 commit/push/merge/release。
- **运行范围**：真实 Electron E2E；未安装/升级依赖；未启动/停止客户常驻应用（E2E 使用脚本自带临时 userData，不碰客户真实配置）。
- **证据绑定**：路径 + 行数 + SHA-256；候选/环境/脚本变化会使本证据失效，需重取。
- 本记录不是验收结论；E1 变更包与 E2 独立验收按团队计划与 V1 处理。
