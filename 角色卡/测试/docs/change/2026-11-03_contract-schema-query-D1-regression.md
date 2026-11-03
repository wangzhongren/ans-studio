---
id: contract-schema-query-d1-regression
type: change
title: contract schema query D1 全量回归与证据
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: verified
related: [contract-schema-query-b0-baseline]
events:
  - date: "2026-11-03"
    kind: created
    summary: 记录 D1 候选 10 文件哈希、双端 typecheck、三组受影响套件、T3 全量回归与 Electron 可运行性事实
---

# D1 全量回归与证据：contract schema query（契约/schema 查询）

- **任务 ID**：`2026-11-03-contract-schema-query`
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-03 / 团队计划 §五 **D1（跨角色回归）**，入口为 A0a/A0b/A1/A2/A3 退出
- **状态**：**D1 已完成执行**。本记录只记录事实与证据，**不判验收、不判通过/返工**；最终结论由独立验收 E2 按 V1（`docs/acceptance/contract-schema-query-criteria-v1.md`，725 行 / SHA-256 `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d`）判定。
- **候选**：HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`（分支 `release/v1.8.4-assets`）+ 工作树 10 个产品/测试文件未提交改动（A0a/A0b/A1/A3/A2）；与派发清单 **10/10 精确匹配**，无写集外产品/测试改动，`package.json`/锁/构建配置未改，staged 空；全部运行后候选逐文件哈希一致。
- **结果摘要**：`npm run typecheck` / `typecheck:renderer` 均 exit 0；三组受影响套件 **88 tests / 88 pass / 0 fail / 0 skipped / 0 todo**；T3 全量（393 文件，排除 `write-sequencing.test.ts`）**3478 tests / 3451 pass / 9 fail / 18 skipped / 0 todo**（exit 1；失败集合与 B0 **完全相同**的 9 项既有 Windows symlink EPERM，**新增确定性失败 0、新增 skip 0**，见 §六/§八）；Electron 44.7.0 与 dist 存在、本 worktree 无 Electron 进程，**未启动应用/未跑 E2E**；未 commit/push、未接触客户。

---

## 一、D1 输入与观察项（只读核对）

| 项 | 派发引用 | 读取时点实测 | 说明 |
| --- | --- | --- | --- |
| V1 | 725 / `110018449f…` | **725 行 / `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d`** | 一致 |
| 团队计划 | 539 / `a93bd02f…` | **539 行 / `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c`** | 一致 |
| P1 审核 | 293 / `d547b90d…` | 当前路径文件为 **272 行 / `4469ce2d50f0b4117f154288e996e1bdecd1990126c132510e8c26885eaa87b9`**（`status: blocked`） | **版本事故（已由统筹/沟通校正）**：**生效 P1 决定 = 293 行 / `d547b90d…`、`recommend approval` + P1-CSQ-01–10**（沟通记录/`docs/communication/memo.md` 记录，统筹据此启动 A0a/A0b/A1/A3）；磁盘当前路径的 272/`4469ce2d…` 是重复审核覆盖的事故版本（其 §0 自述以 293 为准），仅作事故历史，**不是生效决定**。D1 按派发与生效 P1 决定执行 |
| A1 提案 | — | **90 行 / `9fe02757d2e90b5848ccb914108bbace7c7f784cf2e6393cf098ba5dc4ab8cfb`**（`角色卡/编排/docs/change/…-P1-proposal.md`） | 已按 P1-CSQ-03 修订；评审时原版为 `70e36ea4…`。仅记录版本事实，不重审提案 |
| B0 基线 | 171 / `314f9941…` | **189 行 / `9f5872807fd163c9e47ce5a9b704771a2162f9129114a194f2f3bb53ef20676e`** | **引用版本校正（已确认）**：171/`314f9941…` 是中间版；**B0 终态 = 189/`9f587280…`**（末尾含独立重跑 269.5s 与计数逐条一致的补记），本 D1 以其为对照；T3 基线计数仍为 **3462/3435/9/18**（9 项既有 symlink EPERM、新增确定性 0、新增 skip 0） |
| 沟通记录（观察值） | — | 164 行 / `0bd6a75a508b3671689548324b1f29bb23dbc0102d9c760a543346e1bed3c63b` | 管理记录可能继续追加，只留观察值 |

---

## 二、候选身份与写集闭合

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD / 分支 | `git rev-parse HEAD`；`git branch --show-current` | `243d8f6a6db663a383b516aad6320c5110c7f583` / `release/v1.8.4-assets` |
| 候选清单 | `git status --porcelain -- src app test` | **10 条，全部 `M`**（无新增/删除文件） |
| 写集闭合 | 期望 10 路径 vs `git -c core.quotePath=false ls-files -m -o` 双向比对 | **10/10 精确匹配**，无写集外产品/测试改动（`12-scope-check.txt`） |
| diff 规模 | `git diff --stat -- src app test` | **10 files changed, 780 insertions(+), 13 deletions(−)** |
| 暂存区 / 配置 | staged / `package.json`/锁/构建配置 status | 均**空** |

候选哈希（逐文件 `git hash-object` + `sha256sum`，工作区字节；全部 LF，`core.autocrlf=true` 仅影响后续 git touch 提示）：

| # | 角色 | 文件 | git hash-object | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | A0a/A0b | `src/model/runtime.ts` | `90f0a4b4b15d66e41a2c2f9c1333581d7339da50` | `05d6e4e9f4740e88b5616a0e76960b93e936d17466e0dbe1b8d473c30fe7d0f5` |
| 2 | A0a/A0b | `src/provider/runtime/tools.ts` | `8b257fbe2649f8c4538a1a284dcf1d54d886a9cb` | `2d2f8b10cafecb1e9c65871faa5c64862f71a2fa94bc29135bb79812933be159` |
| 3 | A0a/A0b | `src/provider/runtime/schema.ts` | `1683fb406fdabab10afa831770c8b85cd9142672` | `0cb1f6f4dcd7b6a7b6e8ec52c68d5ad593ca0b58f07bc66b15a6a1408bbe987e` |
| 4 | A1 | `src/common/编排/workflow-preconditions.ts` | `74a60e37ce8931ca282d4fc38e9099cd88642400` | `5fa99f57c2423531bc28784e3561313953f2f134bb6ffa3f6574380ed23fb727` |
| 5 | A1 | `test/编排/workflow-preconditions.test.ts` | `f1b2d26cce30a72eed6be558ae95063d002c6913` | `9d083a156d0d645b133e299c2fc9f473d2cc36de1bb27d180f9cc1bf6f98e9ad` |
| 6 | A1 | `test/编排/trio-worker-report.test.ts` | `d2bc956507def345fcff71985b76165c77879af7` | `7ab180eb49c4c94b9dd0a47360c21ec298dee12a71bf34461ea9fd8cd5ab4d2c` |
| 7 | A3 | `src/common/门禁引擎/governance-roles.ts` | `8926ec3faa354ad2716ae01168d2ec46fa741f54` | `e1639969069a90b1aada42850da0bcbf4aac35dbdc4fd1a976f6996ee3842f40` |
| 8 | A2 | `app/desktop/session.ts` | `26aac02aecee060ce0d5c4aa5a5ca2d0102a7978` | `346777afb5dc1e89af5ea89905ddb11a595f9f7cb8cec71099f7d866fb538f82` |
| 9 | A2 | `test/桌面应用/rejection-copy.test.ts` | `b372d88b8a89859483609c02ada8443237eff2e0` | `71388f9f734309074a8e6bd8a3c5a14853def4309a656b2878274e9c65d3cb91` |
| 10 | A2 | `test/桌面应用/run-pin.test.ts` | `779a2480fb02d9c06e38cc875f3c9e11c8a46be1` | `3344387aada33224e97aae49b157cfd49519a6afa0e62bff90106761cbb075bc` |

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1` |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `/bin/bash.exe` |
| 时区 | Asia/Shanghai |

---

## 四、门禁命令（typecheck / typecheck:renderer）

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 12:28:25–12:28:27 | **0** | 0 类型错误 | `01-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 12:28:28–12:28:29 | **0** | 0 类型错误 | `02-npm-run-typecheck-renderer.log` |

---

## 五、受影响套件

全部 `node --test --test-concurrency=1`，文件清单与派发逐字一致，均 exit 0。

| # | 层 | 文件组 | 起止（+08:00） | tests | pass | fail | cancelled | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排（A1） | `test/编排/workflow-preconditions.test.ts`、`trio-worker-report.test.ts` | 12:28:33–12:28:38 | 34 | **34** | 0 | 0 | **0** | **0** | `03-suite-orchestration.log` |
| B | 桌面应用（A2） | `test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` | 12:28:33–12:28:39 | 36 | **36** | 0 | 0 | **0** | **0** | `04-suite-desktop-app.log` |
| C | 门禁引擎（A3） | `test/门禁引擎/view-image-cards.test.ts`、`list-project.test.ts` | 12:28:33–12:28:36 | 18 | **18** | 0 | 0 | **0** | **0** | `05-suite-gate-engine.log` |
| **合计** | — | — | 12:28:33–12:28:39 | **88** | **88** | **0** | **0** | **0** | **0** | — |

- 与 B0 对比：编排 26→34（+8 新/扩展用例）、桌面应用 28→36（+8）、门禁引擎 18→18；均为候选扩展测试。

---

## 六、T3 全量回归

| 项 | 实测值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)` |
| cwd | worktree 根（Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300 Git Bash） |
| 文件数 | **393**（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`；清单 `07-full-t3-file-list.txt`） |
| 起止（+08:00） | 12:28:57–12:33:25（**268,376.7958 ms ≈ 4 分 28 秒**） |
| 退出码 | **1**（因 9 项既有环境失败；非运行错误） |
| 计数 | **tests 3478 / pass 3451 / fail 9 / cancelled 0 / skipped 18 / todo 0** |
| 原始日志 | `07-full-t3.log`（4,580 行 / 512,872 B） |
| 失败分类 | **9 项全部为既有 Windows symlink EPERM，与 B0 逐项同名同位置**（§八）；无其它确定性失败 |

与 B0 基线对照（B0 终态 189/`9f587280…`：3462 tests / 3435 pass / 9 fail / 18 skip）：

| 指标 | B0 | D1 | 差 |
| --- | --- | --- | --- |
| tests | 3462 | 3478 | **+16**（候选扩展：编排 +8、桌面应用 +8） |
| pass | 3435 | 3451 | **+16** |
| fail | 9（既有 EPERM） | 9（同一集合） | **0 新增确定性失败** |
| skipped | 18 | 18（同一集合） | **0 新增 skip** |
| todo | 0 | 0 | 0 |

排除项（不得当作通过）：

- `test/pi-adapter/write-sequencing.test.ts` —— 仓库既有已知挂起（历史记录：39+ 分钟无进展、CPU 约 2339s），依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 与团队计划 §7.2 排除；本轮**未运行、行为未验证**。排除命令即上述 `find ... ! -name 'write-sequencing.test.ts'`。

18 项 skip（与 B0 相同）：codex-adapter 1、pi-adapter 1、runtime-core file-write-safety 4、runtime-core lightweight-permission-repairs 6、门禁引擎 pin-evidence 1、shared atomic-write 5。完整清单见 `08-failure-classification.txt`。

---

## 七、Electron / E2E（仅事实，不启动）

按 V1 与本任务口径，D1 **不要求运行真实 Electron/E2E**；只记录可运行性事实：

| 项 | 实测值 |
| --- | --- |
| Electron 包版本 | **44.7.0**；`node_modules/electron/dist/electron.exe` **存在** |
| 渲染入口（忽略产物） | `app/renderer/dist/index.html` **存在**，SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f`（既有构建产物，非本次候选构建） |
| 本 worktree Electron 进程 | **0** |
| 已执行 | `node -e` 版本/路径存在性检查；**未启动应用、未跑 E2E、未截图/录屏**（`06-electron-facts.txt`） |

---

## 八、失败清单与分类

T3 全量 **9 项失败 = B0 基线同一集合的既有 Windows symlink `EPERM`（errno -4048）环境失败**，逐项同名同文件:行；无其它确定性失败。

| # | 文件:行 | 测试名 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

- **新增确定性失败 = 0**；**新增 skip = 0**；无未知/无法解释的失败；无测试删除、无断言放宽。
- 以上 9 项按既有环境失败单列，**不算通过，也不计入新失败**；原始失败堆栈见 `08-failure-classification.txt` 与 `07-full-t3.log`。
- 本次未出现 B0 之后的间歇性 `background-entry` cleanup EPERM；失败集合与 B0 完全一致。

---

## 九、测试 diff 无弱化核对

- `git diff --stat -- test`：4 个修改测试文件 **+540 / −2**；无新增测试文件。
- 删除行仅 2 条 import，均被同文件更完整 import 取代（`workflow-preconditions.ts` 的导出集合扩展、`describeTool` 新增），无断言删除。
- 无新增 skip/todo、无测试文件删除（`10-test-diff-U0.txt`、`10b-test-diff-summary.txt`）。
- 未改 README/i18n/package/构建配置（`10b` 末尾核对为空）。

---

## 十、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-candidate-identity.txt` | 96 | 7,914 | `d43afb48a53c0c8ab4dfd1fda2dfeb489b850adc6cbfb1b1e31007be9e34343a` |
| `01-npm-run-typecheck.log` | 9 | 233 | `50e58e9844137d16e1ae6f7489f4f26197403962c93a1fe6930c4ee88e0d35ee` |
| `02-npm-run-typecheck-renderer.log` | 9 | 272 | `0f10fac152a7d88cf0a294317abe6488ee7d289d94dc32da52c115b7b7a3a22c` |
| `03-suite-orchestration.log` | 47 | 4,212 | `2d951a13e6f2fbc5862f7aa02dd9dcc565ca0069a6ede80b5c87c75053eaf719` |
| `04-suite-desktop-app.log` | 49 | 4,138 | `4c84b2afc677baaffed37525eaab3566dde09feb897598c9bc4bc5686c20e1c9` |
| `05-suite-gate-engine.log` | 31 | 2,332 | `452436ebda25cac1eac5d4cab22a90b87a48bf565e5350f7b0199229795d9eca` |
| `06-electron-facts.txt` | 8 | 542 | `348d1f32a297907a610526702d108dc800ffdb8b3fd567b17aba4a120ac0e3c2` |
| `07-full-t3-file-list.txt` | 393 | 16,684 | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `07-full-t3.log` | 4,580 | 512,872 | `e59a4dc9ae61343ec571a60d3a509eab96e8be50229641b6807f7644d54efc22` |
| `08-failure-classification.txt` | 190 | 13,397 | `7c43fae74a9210dc7396d36f2b605ecb1d4ba7aebd6f0693e558ddbe8ae3f1e6` |
| `09-post-run-verification.log` | 32 | 1,534 | `9c3cdca56886bb227a4e05b0865e6ef1ffc3e111a4ca6086bfc01771b5319575` |
| `10-test-diff-U0.txt` | 567 | 28,471 | `95597dbc1001ae7664eb292554fcae5b4601bd971a296d59abda2323e51411f2` |
| `10b-test-diff-summary.txt` | 19 | 805 | `828e1508361479151f0848acc24810c6e10384a4b37cb291b62cbc196730c92d` |
| `11-inventory.txt` | 19 | 1,595 | `43cb80876c0d1dd13d7bdec8474a445b5ff7e2d738047114fe34135e5c716904` |
| `12-scope-check.txt` | 9 | 302 | `b92ddb5034fb6a078722a22a096a9b00d45c9a4f604b19d2d6f3d3863117cddf` |

整理后 `git status` 复测（`09-post-run-verification.log`）：HEAD 不变；`git status --porcelain -- src app test` 仍为候选 10 条；逐文件重算 `git hash-object` + `sha256sum` 与 `00-candidate-identity.txt` 快照 **10/10 无差异**（候选外零改动）；staged 空。

---

## 十一、限制与未做

1. **T3 排除项**：`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起（39+ 分钟无进展、CPU 约 2339s），依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 与团队计划 §7.2 排除；本轮**未运行、未验证**，不得视为通过。
2. **既有 Windows symlink EPERM**：既有环境失败单列于 §八；不算通过、不计新增确定性失败。
3. **E2E**：本任务 V1 不要求，未运行；不以单测替代真实渲染结论（本任务不需要）。
4. **输入版本事实（已校正并披露）**：P1 生效决定 = 293/`d547b90d…` recommend approval + P1-CSQ-01–10；磁盘同路径 272/`4469ce2d…` 为重复审核覆盖的事故版本，仅作事故历史；B0 终态 = 189/`9f587280…`（171/`314f9941…` 为中间版）；A1 提案已按 P1-CSQ-03 修订为 90/`9fe02757…`（评审版 `70e36ea4…`）。以上由并行窗口协调/统筹校正，不影响本次 10 文件候选与执行事实（详见 §一）。
5. 本记录只记录测试事实与证据，不代替独立验收；AC 判定属 E2。
6. 未改产品/测试/角色卡/边界/治理文档；未 commit/push；未接触客户。

---

## 十二、D1 出口核对（只报事实）

- 候选哈希可复算：**是**（§二逐文件；完整清单在证据；运行后 10/10 快照一致）。
- 双端 typecheck：**均 exit 0**（§四）。
- 受影响套件：**88/88 pass，0 fail/skip/todo**（§五）。
- T3 全量：**3478 tests / 3451 pass / 9 fail / 18 skipped / 0 todo，exit 1，268.4s**；9 项失败与 B0 基线**同一集合**（既有 Windows symlink EPERM），**新增确定性失败 0、新增 skip 0**；排除项与分类见 §六/§八。
- 输入版本事故/差异已如实披露（P1 生效 293/`d547b90d…` vs 磁盘 272/`4469ce2d…` 事故版；B0 终态 189/`9f587280…`；A1 提案修订 90/`9fe02757…`），见 §一/§十一。
- Electron/E2E：**仅事实记录，未运行**（§七，符合 V1 口径）。
- 测试 diff 无弱化：**是**（§九）。
- 未 commit/push / 未改产品测试 / 未接触客户。
