# B2 独立验收报告：每个文档格式的权威说明与全员可读（T2）

- 日期：2026-11-10；身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**（与 B1 作者同一独立身份）。本报告只作 B2 判定；**未改代码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron**。
- 判定标准：**B1 v1.1（唯一判据）** `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`，**497 行 / 75,577 bytes / SHA-256 `621c5da7654407d132c29dfd87955ac52ca9ab41e66a2b3e7725271468e6244a`**。
- 判定对象：**11 文件候选**（5 M + 6 新），HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad26d768297cb076af4f8e24316c7d71b7`，分支 `feat/document-format-specifications`）；确定性证据 D1 v1.1 `adc23f45f56f8cd16251e41756f9fce1b56430fadbf10b6add6e2cef3aec090f`（227 行 / 42,274 bytes）；真实运行 RR3 `44bdf61c39cdc65ecc35aa611ece06469e845057fff69cb670536bad27f9bba6`（211 行 / 31,639 bytes；agent 报 212 行为行数口径）。
- 状态：**B2 独立验收完成；总判定 `insufficient evidence`（49 pass / 0 fail / 4 insufficient / 0 NA）**。未通过项集中在 **AC-13 / RR-2 / RR-5 / EV6 的真实运行隔离证据**（9222 未被贪吃蛇占用、贪吃蛇根前后只读快照缺失；B1 §0.2-8「不读/写运行根」与 AC-13-5「只读快照」存在内部张力）。其余 49 项 pass；建议协调方以 **B1 v1.2 窄澄清**（或 RR4）闭合后再判 B2。**不授权提交/推送/合并/发布。**
- **B2 v1.1 更新（2026-11-10）**：依 **B1 v1.2**（`9e52a4aadecfb0849e2ce03e7dc29fc057b659840b13ea64102f5060d3dea5bb`，509 行 / 80,864 bytes）复判 AC-13/RR-2/RR-5/EV6（隔离证据口径）与 AC-14/RR-6（shell 停止规则），见 **§8**；原 49/4/0 判定保留为历史；**最终 53 pass / 0 fail / 0 insufficient / 0 NA，总判定 pass**。

## 0. 结论摘要

| 项 | 结果（B2 独立复核） |
| --- | --- |
| 总判定 | **insufficient evidence**：49 pass / 0 fail / **4 insufficient**（AC-13、RR-2、RR-5、EV6）/ 0 NA |
| 候选身份 | `src app test` 11 项（5 M + 6 ??）；逐文件 raw SHA-256 与 D1 v1.1 表 **11/11 全等**；聚合 **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**（独立复算一致） |
| manifest | `src app test` **1,113** 文件 / 25,907,278 bytes；manifest 文本 SHA-256 **`ff671d50fb7cd206a94b0fb2477a7aaa3a94b78b7fbb22f313bb0d7e587e021b`**、聚合 **`fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**（独立生成与 RR3 记录逐字节相同） |
| 写集外 | `角色卡/**` tracked 0；classify-shell/run-manifest/workflow-preconditions/evidence-check/boundary-*/amendment-validate/upgrade-validate/renderer/optional-acceptance/chief-workflow 全 0；`package*`/构建配置 0；`test/桌面应用/chief-workflow.test.ts` raw `87983bde…` 与团队计划 T5 记录一致 |
| 独立复跑（6 文件） | doc-format **25/25**；governance-matrix **18/18**；runtime pin **11/11**；gate pin **19/19**；desktop session **7/7**；all-roles **5/5**——全部 exit 0、0 fail/0 skip |
| 独立复跑（目录） | 编排 **1164/1140/22/0/2**；runtime-core **554/517/33/0/4**；门禁 **472/466/5/0/1**——失败/skip 集合与 D1 v1.1 逐条一致（D1 的 `failing tests:` 汇总行除外） |
| 参考套件 | optional-acceptance **6/2/1/3/0**（同名 not ok 1/4/5/6）；chief-workflow **B2 直跑 >300s 未退出（已知一次性挂起族，已停止、未作权威）**；D1 v1.1 权威 rerun **66/50/16** |
| 静态门 | `npm run typecheck` **exit 0**；4 行 / 43 bytes / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| RR3 | 产品真实 `doc_format` **1** 次（`format:"project-intent/v1"`，回执 **2,162 B**，首行 `doc-format-specs/v1`）；intent v4 **25,686 B / `905870be…`**，卡 marker 一致；`prepareIntentConfirmation` 通过、`freeze-committed`；意图卡 1；6 内置 + `test-dev` `session.open.ready`；项目角色直连被 `sendSession` 拒绝并按 B1 v1.1 RR-7 回落；账本重置披露；shell 3 次未执行 + 1 审批卡；9222 预检/后检 0、9223 释放；候选/manifest 前后不变；模型 `deepseek-v4-flash` |
| B2 条件/限制 | 9222 **未被贪吃蛇占用**（pre 0）、**贪吃蛇根前后只读快照缺失**（RR3 明确未读取）；B1 §0.2-8 与 AC-13-5 冲突；shell 审批卡后的停止规则解释；详见 §4 |

## 1. 依据与绑定身份（写盘前实测）

| 项 | 实测 |
| --- | --- |
| B1 v1.1 | `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`：**497 行 / 75,577 bytes / `621c5da7654407d132c29dfd87955ac52ca9ab41e66a2b3e7725271468e6244a`** |
| 团队计划 | `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`：100 行 / 14,393 bytes / `4d99586f6b32d884ab461307541e7f01f82cc092f0e5c9eaaeabc42f615ebdc2`（RR3 记录 §1 绑定值） |
| 派发记录 | `docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md`（RR3 记录 §1 绑定） |
| D1 v1.1 | `角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md`：227 行 / 42,274 bytes / `adc23f45f56f8cd16251e41756f9fce1b56430fadbf10b6add6e2cef3aec090f`；证据索引 `07-evidence-sha256.txt` self `053681a0…`；v1.1 增量 `v11-*`。 |
| RR3 | `角色卡/测试/docs/change/2026-11-10_RR3_document-format-specifications.md`：211 行 / 31,639 bytes / `44bdf61c39cdc65ecc35aa611ece06469e845057fff69cb670536bad27f9bba6`；证据 `25137114e42e3253f3948f4db1561f62c3207ffdf39883ab23b3ee48faa147a5`（106 文件）。RR1 `7e95ea07…`、RR2 `7bde21e8…` 为前两轮失败记录，未拼接。 |
| 批次记录 | W1 `c85e1a84…`（含 D1 后修复与 §2 修正）、W2 `77e09ba4…`、W3 `b43dc8fd…`、W4a `c41a6b07…`、W4b `d4e22572…`、W5 `3fde941a…`（实测与 agent 一致） |
| 候选 | HEAD/tree/分支如上；**11** 文件（5 M + 6 ??）；聚合 `bcd32553…`；manifest 1,113 / `fc296e95…`；无删除/重命名 |
| 模型（如实） | `deepseek-v4-flash`（`.env` 与 RR3 原生 `message.model` 一致）；非 Anthropic Claude |

## 2. 独立复核（不得只信报告）——方法与结果

### 2.1 候选身份（BASE-4/5）

- `git -c core.quotepath=false status --porcelain -- src app test` 恰 **11 行**：5 M（`app/desktop/session.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`）+ 6 新（`src/common/编排/doc-format-specs.ts`、`test/编排/doc-format-specs.test.ts`、`test/runtime-core/doc-format-specs-pin.test.ts`、`test/门禁引擎/doc-format-specs-pin.test.ts`、`test/桌面应用/session.test.ts`、`test/测试/doc-format-all-roles.test.ts`）。
- B2 独立计算逐文件 raw SHA-256，与 D1 v1.1 表 **11/11 全等**（bytes 亦一致；`doc-format-specs.ts` 100,605 / `3c0c9c63…`，测试 101,313 / `54e5b01a…`，其余见 D1 §1.2）。
- 聚合（路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联）＝ **`bcd3255392…`**；manifest 用 `git ls-files -co --exclude-standard -z -- src app test`（tracked 1,107 + 候选 6 = 1,113），逐文件 sha256、`sha256<TAB>path\n` 排序，文本 SHA-256 **`ff671d50…`**、聚合 **`fc296e95…`**；与 RR3 `post/post-summary.json`/`pre/preflight-stdout.json` 的候选聚合、manifest 聚合/字节数（25,907,278）一致。
- 写集外：`git status --porcelain -- 角色卡` tracked 0；`api-spec`/role-card/boundary 无 M；12 组 exclusion 全 0；`test/桌面应用/chief-workflow.test.ts` raw `87983bde4a21387d6b2e1b7a26c430efba73a3ccc92fe01d30cb3182c03ac494`（团队计划 T5 记录）；`app/renderer/**` 0；`package*.json`/`electron-builder.yml`/`tsconfig.json` 0；`src app test` untracked 仅 6 候选；staged 0；无删除/重命名（`git diff --summary` 空）。
- BASE-7：`git cat-file -e HEAD:test/桌面应用/session.test.ts` → **absent**；边界 `角色卡/桌面窗口/boundary.yaml:99`、`boundary.md:39` 均列该单文件；候选新文件存在（`23bc19a7…` / 26,853 B）；W4b 记录 §5 记录边界漂移；H1 delta=0。

### 2.2 稳定性（BASE-5）

- D1 v1.1/RR3 前后：11 文件、聚合、manifest、HEAD/tree/分支、fullStatus 一致；RR3 `post/post-summary.json` `candidateAggregateMatch=true`、`manifestMatch=true`、`fullStatusIdentical=true`。
- B2 复跑全部测试/typecheck 后复取：`src app test` 仍 **11**（5 M + 6 ??）、untracked 6、聚合 **`bcd32553…`**；HEAD/tree/分支不变；未在 `src app test` 产生副作用文件。B1 v1.1 为 `docs/acceptance` M（判据文件，非候选），不影响候选/manifest。

### 2.3 确定性复跑（B2 独立执行；Node v24.22.1）

| 套件 | B2 实测（tests/pass/fail/cancelled/skip；exit） | D1 v1.1 | 结论 |
| --- | --- | --- | --- |
| `test/编排/doc-format-specs.test.ts` | **25/25/0/0/0；0** | 25/25 | 一致 |
| `test/测试/governance-matrix-integration.test.ts` | **18/18/0/0/0；0** | 18/18（v1.0 17/18 的确定性失败已修复） | 一致 |
| `test/runtime-core/doc-format-specs-pin.test.ts` | **11/11/0/0/0；0** | 11/11 | 一致 |
| `test/门禁引擎/doc-format-specs-pin.test.ts` | **19/19/0/0/0；0** | 19/19 | 一致 |
| `test/桌面应用/session.test.ts`（新建恢复） | **7/7/0/0/0；0** | 7/7 | 一致 |
| `test/测试/doc-format-all-roles.test.ts` | **5/5/0/0/0；0** | 5/5 | 一致 |
| `test/桌面应用/optional-acceptance.test.ts` | **6/2/1/3/0；1**（not ok 1/4/5/6） | 6/2/1/3/0 | 一致 |
| `test/桌面应用/chief-workflow.test.ts` | **>300s 未退出，已停止（未作权威）** | 权威 rerun 66/50/16 | 已知一次性挂起族（D1 §2.6）；B2 不伪造计数 |

**目录级**（`find` 出的 `*.test.ts` 列表、串行）：

| 目录 | B2 实测（tests/pass/fail/cancelled/skip；exit） | D1 v1.1 | 失败/skip 集合 |
| --- | --- | --- | --- |
| `test/编排/`（108 文件，含新文件） | **1164/1140/22/0/2；1** | 1164/1140/22/0/2 | 逐条一致（D1 `failing tests:` 汇总行除外） |
| `test/runtime-core/`（60 文件） | **554/517/33/0/4；1** | 554/517/33/0/4 | 逐条一致 |
| `test/门禁引擎/`（42 文件） | **472/466/5/0/1；1** | 472/466/5/0/1 | 逐条一致 |

- **新增确定性失败 = 0 / 新 skip = 0**：6 个关键套件全绿；目录失败/skip 集合与 D1 v1.1 一致；无新增 skip/todo/force-exit（候选结构扫描 0）。
- `npm run typecheck` **exit 0**（4 行 / 43 bytes / `22d52cc9…`，与 D1/前序同 hash）；`app/renderer` 未触及，`typecheck:renderer`=N/A。
- 旧断言改写：本变更**新增 6 个测试文件、既有测试文件零修改** ⇒ B1 §4.3「旧断言改写」= 0；`test/桌面应用/chief-workflow.test.ts` 未修改（raw `87983bde…`）；`optional-acceptance` diff=0；无删除/弱化 fail-closed 断言。
- **W1 记录 §2 修正核对**：当前 W1 记录 `c85e1a84…` §2 已写明 `GOVERNANCE_MATRIX_SCHEMA` 例外（不 import、B18 唯一字面量、pin 测试）；D1 记录 §9 引用的旧版 `c6f9e90f…` 的 §2 瑕疵在当前版已修正（D1 的披露为历史；以当前 W1 与候选 hash 为准）。

### 2.4 RR3 真实运行复核（B2 只读取证，不重跑）

- **产品真实 `doc_format`**：`extracts/product-doc-format-calls.json`（`c6c6dfb8…`）1 次、`{"format":"project-intent/v1"}`、`deepseek-v4-flash`；回执 `extracts/product-doc-format-receipts.json`（`68914b31…`）文本 **2,162 B**，首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`，含字段/样例/错误码；`rr3-summary.json > productDocFormatReceiptBytes=[2162]`。
- **intent v4**：`product/jinyong-rogue-2d-intent-v4.md` **25,686 B / `905870be…`**；`rr3-summary.json > intentCard.marker` 与文件 sha256/version 4 一致；`intentFreeze` = `freeze-start`/`freeze-committed`（17:14:34.410/.429Z）；`requestResolved` `req-e8320c4bdb8e5b4e`、`confirm`、`by:"customer"`；意图卡 1 张（`budget.cards=1`）。
- **产品写入/工具面**：`productToolCounts` = doc_format 1 / list_dir 2 / read_file 2 / write_file 1 / edit_file 5 / run_shell 3 / submit_report 1；`productWriteEditCount=6`；`productShellResults` 3 条均 `isError:true`（拒绝/120000ms 超时），`shell-card-deny.json`（`ab4c6e5c…`）1 张审批卡（certutil，硬拒 deny，未执行）。
- **全员注册**：`round3-summary.json > sessionsOpened` 含 chief/product/rapporteur/nominator/convener/verifier 6 内置 + `test-dev`（17:13:52.179Z）；`projectRoleSession` 记录 `role.open test-dev`；产品/幕僚 prompt_snapshot 含 doc_format guidelines。
- **项目角色直连（B1 v1.1 回落）**：`operator-project-role-send.json`（`2ae48041…`）`{"ok":false,"error":"向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。"}`；composer disabled；会话注册 + 数据源可调用（D1/W5 源码/测试）为证；**未做项目角色真实模型调用**，未冒充。
- **账本重置（准备，不计候选）**：`pre/prepare-target.json` 源 ledger 677,338 B / 401 行 / `044ca6f9…`（`pre/tasks-source-ledger.jsonl` 保留），工作副本 `.ans/state/tasks.jsonl` 0 B / `e3b0c442…`；8 项目角色、9 pin MATCH；旧模型激活口径如实披露。
- **预算/端口/零触碰**：`rr3-summary.keyFacts.budget` = 1 客户消息 / 1 卡 / 0 操作者送达 / 产品 doc_format 1 / 项目角色 0 / chief 0；`wallClock` ≈8m27s（≤20m）；`pre/preflight-stdout.json` `portsPre` 9222=0/9223=0、electron 0；`post/ports-and-processes-post.txt`/`final-isolation.txt` 9223 仅 TIME_WAIT、无 9222、无 electron；**9222 未被贪吃蛇占用**（见 §4-1）；贪吃蛇根/target **未读/未写**（记录 §9 明示，无 hash 快照；见 §4-1）。
- **target**：`post/post-summary.json` 462→482（added 20 / changed 6 / removed 0）；`post/target-diff.txt` 仅新增 `docs/product/jinyong-rogue-2d-intent-v4.md`（docs v1–v3/提案/契约未改写），无 `game/`；trunk 无 `manifest.json`（旧 copy 无 trunk；应用既有迁移不属本变更）。
- **候选/manifest**：`post/post-summary.json` `candidateFileCount=11`、聚合前后 `bcd32553…`、manifest 1,113 / `fc296e95…`、`candidateFilesMatch=true`/`manifestMatch=true`/`fullStatusIdentical=true`；HEAD/tree/分支不变；未提交/推送。
- **模型**：`pre/preflight-stdout.json` `model=deepseek-v4-flash`、provider `https://aiproxy2.abujlb.com/deepseek`；原生 `message.model` 一致；非 Anthropic。

### 2.5 B1 v1.1 三项澄清的适用核对

- **项目角色直连**：B1 v1.1 AC-12-4/5、RR-2/4/7、§7、R-2/Q10 已明确「应用仅允许幕僚消息（非幕僚会话只读/仅诊断）⇒ RR-7 回落（会话注册 + 数据源可调用 + 如实标注，不冒充真实读取）」；RR3 的 `sendSession` 拒绝与该条一致。**B2 按回落判 pass**，不以项目角色真实读取冒充。
- **「一次写对」**：B1 v1.1 AC-12-3/RR-3 已明确「frontmatter/schema 首次写入即正确、无 schema 拒绝/重试」判定；正文多次 `edit_file` 不构成本项失败但须如实记录。RR3 的 1 write + 5 edits、frontmatter 首次正确、无 schema 拒绝、最终 `905870be…` 与 marker 绑定、`prepareIntentConfirmation`/freeze 通过 ⇒ **AC-12-3 pass（附披露）**。
- **审批卡预算**：B1 v1.1 AC-14-1/RR-6 已明确「卡 ≤1 仅指意图确认卡；审批卡/客户卡如实记录，不计入该 ≤1」；RR3 意图卡 1/1 + shell 审批卡 1 + 2 次审核超时（run_shell 均未执行）**不构成预算超标**。**AC-14-1 pass**；停止规则解释见 §4-2。

## 3. 逐条判定

> 每条在同一最终候选 + D1 v1.1 + RR3 上判定；证据见 §2。**49 pass / 0 fail / 4 insufficient / 0 NA**；未通过项为 AC-13、RR-2、RR-5、EV6（同一隔离证据缺口，见 §4-1）。

### 3.1 BASE-1..BASE-8

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| BASE-1 | **pass** | 实施基线 HEAD `3cd55dc`/tree `e05d68ad`、分支 `feat/document-format-specifications`；提案卡修复 `fb1aa39e`、judge `24799cb`、团队计划 run 变更 `3cd55dc` 均在祖先链；`src app test` 11 文件；无 judge 在飞。 |
| BASE-2 | **pass** | 串行：提案卡修复→judge→团队计划 run→本变更；`src/model/runtime.ts` 仅 DocFormat/GovernedToolsOptions 2 hunk，judge/团队计划区域零触碰；单写者记录 D1 §1.7。 |
| BASE-3 | **pass**（附限制） | D1 v1.1 + B2 独立 after：编排 22/2、runtime-core 33/4、门禁 5/1、optional 6/2/1/3/0 同名；新文件全绿；新增确定性失败 0/新 skip 0；chief 抖动/一次性挂起见 §4-3；before 为 EOL 对齐重建副本（§4-5）。 |
| BASE-4 | **pass** | 11 文件；per-file hash 11/11=D1；聚合 `bcd32553…`；manifest 1,113 / `ff671d50…` / `fc296e95…`；写集外 0；无新依赖/目录；候选与 RR3 记录一致。 |
| BASE-5 | **pass** | D1/RR3 前后 + B2 复跑后：11 文件/聚合/manifest/HEAD/tree/分支/staged 相同；测试未污染 `src app test`。 |
| BASE-6 | **pass** | L1 注册表（doc-format 25/25）、L2 门禁 pin 19/19、L3 运行时 pin 11/11、L4 桌面 session 7/7、L5 跨角色 5/5、L6 RR3；各层绑定候选/命令/环境/计数。 |
| BASE-7 | **pass** | `HEAD:test/桌面应用/session.test.ts` absent；边界单文件条（boundary.yaml:99/boundary.md:39）；候选恢复该路径；W4b 记录边界漂移；H1 delta=0；新建后 7/7。 |
| BASE-8 | **pass** | 6 新文件均在既有授权目录（`src/common/编排/`、`test/编排/`、`test/runtime-core/`、`test/门禁引擎/`、`test/测试/`、`test/桌面应用/session.test.ts`）；无新目录；角色卡/边界/`.ans` diff=0。 |

### 3.2 AC-1..AC-17

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| AC-1 | **pass** | doc-format 25/25；54 id（A25+B29）deepEqual/唯一/三处一致；registry 100,605 B；索引 5,223 B / 最大详情 4,089 B（D1 独立实测）；30 个 spec testSeam。 |
| AC-2 | **pass** | doc-format 25/25；单一来源（`doc-format-specs.ts` 渲染）；modules/roster/topology 复用 `contractSchemaText`；intent-entry 模板；`workflow-preconditions` 29/29 与 `contract_check` 未改。 |
| AC-3 | **pass** | schema 字面量扫描 + 白名单理由；gate pin 19/19、runtime pin 11/11；公开常量 import、内联唯一副本、私有常量交叉 pin；B18 governance-matrix 例外已修复。 |
| AC-4 | **pass** | 真实 parser/validator 样例正例；A13 填充样例；A14 严格层 seam；B 组 exported-pure/public-path-fixture/text-shape；example 即测试输入。 |
| AC-5 | **pass** | 字段变异矩阵（删除/null/类型/枚举）按 presence/层断言；A1/A2/A3-A4/A14 分层；数据驱动；负例断稳定 code。 |
| AC-6 | **pass** | overclaim guard：convention 字段违反值仍被接受（或显式豁免）；A15/A16/A22/A23/A24/A25 等 `enforced:false`。 |
| AC-7 | **pass** | loadChecks/parser 主错误码负例；code 族扫描（含非后缀成员）；`modules-doc-*` 10 个、A4 10 个 roster 码；白名单理由；gate pin。 |
| AC-8 | **pass** | runtime pin 11/11：扁平 schema/无顶层 oneOf、注入才注册、未知/非字符串、预算/截断、`tools/list`、`toPiTool`、MCP；索引/详情 ≤8192 B（5,223/4,089）。 |
| AC-9 | **pass** | session 7/7（6 内置+项目角色注入）、all-roles 5/5（8 角色 × 5 轮）、judge/有界无、未注入无工具、description/promptGuidelines/`toPiTool`；RR3 6+1 `session.open.ready`。 |
| AC-10 | **pass** | session 7/7：`docFormatText` 第一条语句静态早退；spy 零 `getListing`/`refreshListingNow`/文件 IO；legacy `contract_check` 不变；`Promise<string>`。 |
| AC-11 | **pass** | parser/validator/格式/角色卡/边界 diff=0；`contract_check` 三 topic 不变；既有 parser 套件同名；无新依赖；未注入路径不变。 |
| AC-12 | **pass**（附 v1.1 披露） | 真实 Electron/model/UI；1 消息→派产品→doc_format 1 次（2,162 B）；intent v4 25,686 / `905870be…` 一次写入 frontmatter 正确、无 schema 拒绝（正文 5 edits 按 v1.1 记录）；prepare/freeze；卡 1；6+1 注册；项目角色 RR-7 回落；产品真实读取必需、注册未冒充。 |
| AC-13 | **insufficient** | 真实 Electron/model/UI、9223/独立 userData/target、9223 释放/无 Electron 均有证；但 **9222 未被贪吃蛇占用**（pre 0，B1 AC-13-2/RR-2 预检要求「9222 由贪吃蛇占用」未满足），且 **贪吃蛇根前后只读快照缺失**（RR3 明确未读取，B1 AC-13-5/RR-2/RR-5 要求）。9222 零占用、9223 释放、无 Electron 可证；零触碰为声明 + 端口/进程证据，无 hash 快照。B1 §0.2-8「不读/写运行根」与 AC-13-5「只读快照」内部冲突（§4-1）。 |
| AC-14 | **pass**（附 §4-2 披露） | 1 消息/1 意图卡/0 操作者送达/产品 doc_format 1/项目角色 0/chief 0/Git 0/墙钟 ≈8m27s；首果即停；0 客户消息重试；9222/9223；shell 3 次未执行 + 1 审批卡按 v1.1 不计入意图卡 ≤1；账本重置披露；停止规则解释见 §4-2。 |
| AC-15 | **pass**（附 §4-3 限制） | typecheck 0（`22d52cc9…`）；D1 v1.1 before/after；B2 独立 6 套件 + 3 目录；optional 6/2/1/3/0；失败/skip 集合一致；新增确定性失败 0/新 skip 0；chief 直跑挂起、D1 权威 66/50/16。 |
| AC-16 | **pass** | 候选 diff 不含 judge/提案卡/§2.2 排除文件；`src/model/runtime.ts` 仅 DocFormat 2 hunk；`app/desktop/session.ts` 仅注入/docFormatText；串行记录在案。 |
| AC-17 | **pass** | B 组/A14 seam 在 doc-format 25/25 与 gate pin 19/19；`exported-pure`/`public-path-fixture`/`text-shape` 逐行；A14 不宣称纯校验器；残余风险披露。 |

### 3.3 TM-1..TM-14

| TM | 判定 | 依据（B2 复跑/D1 映射） |
| --- | --- | --- |
| TM-1 | **pass** | doc-format 25/25：54 id、spec 字段、testSeam、预算、无 fs；D1 TM-1 实测 5,223/4,089 B。 |
| TM-2 | **pass** | doc-format 25/25：A1–A13/A17–A21 真实 parser；A14 seam；B 组分类；example 即输入。 |
| TM-3 | **pass** | doc-format 25/25：变异矩阵/分层/条件负例。 |
| TM-4 | **pass** | doc-format 25/25：convention 违反值接受/豁免。 |
| TM-5 | **pass** | doc-format 25/25 + gate pin：schema 字面量扫描/白名单/A14/B29。 |
| TM-6 | **pass** | doc-format 25/25 + workflow-preconditions 29/29：contractSchemaText 复用/来源行/intent-entry。 |
| TM-7 | **pass** | gate pin 19/19 + runtime pin 11/11：私有常量交叉 pin。 |
| TM-8 | **pass** | doc-format 25/25：code 族扫描（含非后缀成员）。 |
| TM-9 | **pass** | doc-format 25/25 + gate pin：loadChecks/主错误码负例/seam。 |
| TM-10 | **pass** | gate pin 19/19：10 章节/三文件/严格 YAML/boundary 恒等/archived。 |
| TM-11 | **pass** | runtime pin 11/11：扁平/注入/未知/`tools/list`/`toPiTool`/MCP/预算。 |
| TM-12 | **pass** | session 7/7：注入矩阵/静态早退/legacy/judge/预算。 |
| TM-13 | **pass** | all-roles 5/5：8/8 注册、judge 隔离、同一索引、40 次可调用。 |
| TM-14 | **pass**（附 §4-3） | D1 v1.1 + B2 目录/6 套件/typecheck；失败/skip diff；chief 挂起披露。 |

### 3.4 RR-1..RR-8

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| RR-1 | **pass** | 真实 Electron `app/main.ts`（83,599 B / `339fcfaa…`）+ deepseek-v4-flash + 真实 UI；隔离 userData/9223；target `round3/target`；候选 HEAD/聚合；环境原件。 |
| RR-2 | **insufficient** | 预置 8 项目角色、9 pin MATCH、账本重置（源 `044ca6f9…`、工作 0 B `e3b0c442…`）均有证；但 **9222 未被贪吃蛇占用**（pre `listeners9222=0`，B1 RR-2「9222 由贪吃蛇占用（只读）」未满足）且 **贪吃蛇根前后只读快照缺失**（RR3 未读取）。其余预置/隔离项 pass；见 §4-1。 |
| RR-3 | **pass**（附 v1.1） | 1 消息→产品派发（无模块字段）→doc_format 1 次（2,162 B）→intent v4 25,686/`905870be…`→prepare/freeze→卡 1/客户 confirm；frontmatter 首次正确、无 schema 拒绝；正文 1 write+5 edits 按 v1.1 如实记录。 |
| RR-4 | **pass**（附 v1.1） | 6 内置 + `test-dev` `session.open.ready`；产品真实读取；项目角色直连被 `sendSession` 拒绝；按 RR-7 回落（会话注册 + 数据源可调用），**未冒充真实读取**；产品真实调用仍必需。 |
| RR-5 | **insufficient** | 9222 预检/后检 0、9223 释放（TIME_WAIT）、无 Electron、target 隔离可证；但 **9222 未被贪吃蛇占用**、**贪吃蛇根前后只读快照缺失**（B1 RR-5/AC-13-5），零触碰为声明 + 端口/进程证据；见 §4-1。 |
| RR-6 | **pass**（附 §4-2） | 客户消息 1/1、意图卡 1/1、操作者 0/≤1、产品 1/≤3、项目 0/≤1、墙钟 ≈8m27s/≤20m、首果即停、0 重试；shell 3 未执行 + 1 审批卡（v1.1 不计入意图卡 ≤1）；9222/9223；停止规则解释见 §4-2。 |
| RR-7 | **pass** | 项目角色 RR-7 回落如实标注；docFormat 已注入/可调用；失败/偏差（shell、账本重置、旧激活口径）如实报告；未伪造。 |
| RR-8 | **pass** | RR-3/RR-4 同一候选/配置；未用 judge/提案卡证据；运行前后 11 文件/聚合/manifest 相同；未提交/推送。 |

### 3.5 EV1..EV6

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| EV1 | **pass** | BASE-1–5；候选 11/聚合/manifest；写集外 0；已知红对照。 |
| EV2 | **pass** | AC-1–7/TM-1–10；doc-format 25/25 + gate pin 19/19；54 spec/变异/overclaim/schema/稳定 code；contract_check 不变。 |
| EV3 | **pass** | AC-8–11/TM-11/12；runtime pin 11/11 + session 7/7；扁平/零 IO/预算/未知/注入才注册/静态早退/judge；无校验变更。 |
| EV4 | **pass** | AC-9/TM-13；all-roles 5/5；6 内置+1 项目角色注册；数据源只读；无副作用；层独立。 |
| EV5 | **pass**（附 §4-3） | AC-11/15–17/TM-14；D1 v1.1 + B2 6 套件/3 目录/typecheck；旧断言改写 0；已知红不恶化；chief 挂起披露。 |
| EV6 | **insufficient** | RR-1–8；预算/隔离/证据/如实性大部分有证；但 AC-13/RR-2/RR-5 的 **9222-被占/贪吃蛇根快照**缺口使隔离证据包不完整；9222 零/9223 释放可证；见 §4-1。 |

## 4. 发现、更正与限制（B2 独立记录）

1. **AC-13 / RR-2 / RR-5 / EV6 insufficient（主要缺口）**：RR3 `pre/preflight-stdout.json > portsPre.listeners9222=0`，即 **9222 未被贪吃蛇占用**；B1 AC-13-2/RR-2 的「预检 9222 由贪吃蛇占用（只读确认）」未满足。RR3 §9/§11 明确 **未读取/未哈希贪吃蛇运行根与 target**（「全程仅 netstat/tasklist」），B1 AC-13-5/RR-2/RR-5 的「贪吃蛇根前后只读快照」缺失；「零触碰」是记录声明 + 端口/进程（9222 0、9223 TIME_WAIT、无 Electron），无 hash 快照。**根因是 B1 内部冲突**：§0.2-8「不碰贪吃蛇：不读/写运行根、端口 9222、其临时根或 target」与 AC-13-2/5「9222 由贪吃蛇占用、贪吃蛇根前后只读快照」不能同时满足；RR3 选择了硬约束（不读）。**建议**：协调方发 **B1 v1.2 窄澄清**——当贪吃蛇实例未运行/硬约束禁止读取时，隔离证据接受「9222 零占用 + 9223 释放 + 无 Electron + 未读/未写声明 + 端口/进程检查」，快照子项 N/A；或另派 **RR4**（若允许只读哈希且贪吃蛇实例在跑）。在此之前 AC-13/RR-2/RR-5/EV6 只能判 insufficient，不能冒充 pass。
2. **AC-14/RR-6 停止规则解释（pass 附披露）**：RR3 产品 3 次 `run_shell`（均未执行）+ 1 张 shell 审批卡（certutil，硬拒 deny），运行继续至意图卡。B1 v1.1 已明确审批卡不计入意图卡 ≤1、按 AC-14-1 如实记录；B1 AC-14-4/RR-6「出现任何非本变更卡/越界写/非预期模型调用 ⇒ 立即停止」若把 shell 审批卡解释为「非本变更卡」，则运行未立即停止（偏差）。B2 按「审批卡是 AC-14-1 预期记录项、非候选卡/非越界写/无额外模型会话」判 RR-6 pass 附披露；**若协调方要求严格停止，须 B1 v1.2 澄清/或判 RR-6 insufficient**。shell 工具调用本身为模型行为偏差（非候选代码），三次均未执行，产品如实未取得 hash、未编造。
3. **「一次写对」按 B1 v1.1 判 pass 附披露**：RR3 产品 1 `write_file` + 5 `edit_file` 内容修订；frontmatter 首次写入即正确、无 schema 拒绝/重试；最终 25,686 B / `905870be…` 与意图卡 marker 一致、`prepareIntentConfirmation`/freeze 通过。B1 v1.1 AC-12-3 明确该口径；若按旧 v1 字面「单次 write」则 AC-12-3 会 insufficient——**以 B1 v1.1 为准**。
4. **项目角色直连按 B1 v1.1 RR-7 回落**：`sendSession` 对 `test-dev` 返回固定拒绝（「向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。」），composer disabled；证据=会话注册（`session.open.ready`）+ 数据源可调用（D1/W5），**未做项目角色真实模型调用**，未冒充。产品真实读取仍为必需且已发生。
5. **D1 v1.1 / W1 记录版本**：D1 v1.1 修复 v1.0 的 `governance-matrix-integration` 确定性失败（B18 唯一字面量、不 import `GOVERNANCE_MATRIX_SCHEMA`），B2 独立复跑 **18/18**；当前 W1 记录 `c85e1a84…` §2 已含该例外修正（D1 记录引用的旧 W1 `c6f9e90f…` §2 瑕疵为历史；以当前 W1/候选 hash 为准）。D1 v1.1 判据头写 B1 v1 `bec45edf…`，B1 v1.1 只澄清真实运行口径/不改确定性判据；B2 已据 v1.1 判。
6. **D1 before 基线为重建副本**：`git archive 3cd55dc` + 逐文件 EOL 对齐 + node_modules junction + fake `.git`；首次 LF 副本作废（`superseded-lf-before/`）。B2 独立重跑 after（6 套件/3 目录/optional/typecheck）并与 D1 before/after 集合核对；before 非 worktree 本体，已披露。
7. **chief-workflow 一次性挂起（如实）**：B2 直跑 >300s 未退出（输出缓冲为空），已停止、未 force-exit、未作权威；D1 v1.1 权威 rerun 66/50/16（v1.0 首次 after 亦挂起，§2.6 登记同族）；B2 不伪造 chief 计数；其余 6 套件/3 目录/optional 均以 B2 实测为准。
8. **RR3 记录/证据小项**：RR3 记录 `wc -l` 211 行（agent 报 212 行，可能为 `splitlines` 口径；bytes/hash `44bdf61c…`/31,639 一致）；`round3-summary.json` 的 `docFormat` 数组含 1 条 chief `role_status` 结果（被类型标为 `doc_format.tool_result`，属提取器标签瑕疵）；产品 `doc_format` 计数以 `rr3-summary.productDocFormat`/budget=1 为准，2,162 B 已核。
9. **账本重置（准备）**：RR3 将复制目标的工作账本重置为空（源 677,338 B / 401 行 / `044ca6f9…` 保留只读）；原因 legacy 10 条 `moduleDirectory` 非法导致投递 fail-closed；属准备阶段、不在候选/manifest/写集，已披露。旧模型激活口径（无当前 `role-activation/v1` 记录）如实披露；B1 RR-2「激活记录」按复制既有合法项目解释，附限制。
10. **B1 v1.1 为工作树 M（未提交）**：B2 以 bytes/SHA `621c5da…` 绑定判据；B1 v1.1 只澄清 RR 方法/AC-12-3/AC-14-1，不改 AC/TM/RR/EV 编号或强度；若协调方不接受 §4-1/§4-2 的解释，须另发 B1 v1.2 或 RR4。
11. **模型/端口**：deepseek-v4-flash（非 Anthropic）；B2 未运行真实模型/Electron/CDP，未占用 9222/9223；RR3 证据只读引用。
12. **候选/manifest 稳定性**：B2 复跑后 11 文件/聚合 `bcd32553…`/HEAD/tree/分支不变；`src app test` untracked 6（候选新文件）；无写集外新文件。

## 5. 判定计数与总判定

| 组 | 条数 | pass | fail | insufficient | NA |
| --- | --- | --- | --- | --- | --- |
| BASE-1..8 | 8 | 8 | 0 | 0 | 0 |
| AC-1..17 | 17 | 16 | 0 | **1**（AC-13） | 0 |
| TM-1..14 | 14 | 14 | 0 | 0 | 0 |
| RR-1..8 | 8 | 6 | 0 | **2**（RR-2、RR-5） | 0 |
| EV1..6 | 6 | 5 | 0 | **1**（EV6） | 0 |
| **合计** | **53** | **49** | **0** | **4** | **0** |

**总判定：`insufficient evidence`**——其余 49 项 pass；4 项 insufficient 均源于同一真实运行隔离证据缺口（§4-1），建议以 B1 v1.2 窄澄清（或 RR4）闭合后重判 B2。本判定不授权提交/推送/合并/发布。

## 6. 限制与未覆盖

1. B2 未运行真实模型/Electron/CDP；真实运行证据来自 RR3（测试角色取证），B2 只读复核 + 确定性复跑；未占用 9222/9223。
2. 4 项 insufficient 的具体缺口：9222 未被贪吃蛇占用（pre 0）、贪吃蛇根前后只读快照缺失（RR3 未读取）；B1 §0.2-8 与 AC-13-5 内部冲突；不以此宣称零改动已 hash 证明。
3. shell 审批卡后的停止规则（AC-14-4）为解释性 pass；若协调方严格解释「非本变更卡」包含审批卡，RR-6 应改判 insufficient，需 B1 v1.2 澄清。
4. chief-workflow B2 直跑挂起（已知一次性挂起族），未作权威；D1 v1.1 权威 rerun 66/50/16；不宣称 B2 独立复现 chief 计数。
5. D1 before 为 EOL 对齐重建副本；optional 6/2/1/3/0 已复现；`test/测试/**` 全量未由 B2 重跑（D1 v1.1 有 695/635/41/1/18，v1.1 修复 governance 后）；B2 独立覆盖 6 关键套件 + 3 目录。
6. B1 v1.1 为工作树修订（未提交）；B2 以 hash 绑定；提交/推送/合并/发布仍需授权。
7. 报告自身行数/字节/SHA-256 在写盘后由交付回报提供（文件无法内嵌自身哈希）。

## 7. 状态

- **B2 独立验收完成：`insufficient evidence`（49 pass / 0 fail / 4 insufficient / 0 NA）**；缺口集中在 AC-13/RR-2/RR-5/EV6 的隔离证据（§4-1）。
- 未改代码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron。
- 建议：协调方接受 B1 v1.2 窄澄清（9222 未运行/硬约束不读时以端口/进程/零写声明为证，快照 N/A）或另派 RR4；并明确 shell 审批卡是否触发 AC-14-4 停止。闭合后由同一独立验收身份重判。

## 8. B2 v1.1 补充判定（依 B1 v1.2，2026-11-10）

- **判据更新**：B1 v1.2 `9e52a4aadecfb0849e2ce03e7dc29fc057b659840b13ea64102f5060d3dea5bb`（509 行 / 80,864 bytes）；v1.2 只做隔离证据/停止规则窄澄清（§0.2-8、AC-13、AC-14、RR-2/5/6、§7、附录 B），不改 AC/TM/RR/EV 强度/编号/候选。
- **AC-13 复判 pass**：RR3 预检 `portsPre.listeners9222=0`（9222 未被贪吃蛇占用）、9223 预检空闲/后检释放（TIME_WAIT）、无 Electron 残留、RR3 明确未读/未写贪吃蛇运行根/target、端口/进程检查在案。按 B1 v1.2：AC-13-2「9222 由贪吃蛇占用」子项 **N/A**（未占用）、AC-13-3/5 贪吃蛇根 hash/快照子项 **N/A**（未运行且硬约束禁止读取）；替代证据「9222 零占用 + 9223 释放 + 无 Electron + 未读未写声明 + 端口/进程」满足。AC-13-1/4（不占用/关闭 9222、git 状态/写集）仍满足。**pass**。
- **RR-2 复判 pass**：9222 子项 N/A；预置 8 项目角色/9 pin MATCH/账本重置披露/项目角色 session 均在案；RR-2 其余观察满足。**pass**。
- **RR-5 复判 pass**：按 v1.2 零占用口径，9222 零占用 + 9223 释放 + 无 Electron + 未读/未写声明 + 端口/进程检查满足；未占用时快照子项 N/A。**pass**。
- **EV6 复判 pass**：RR-1–RR-8 在 v1.2 口径下齐备；隔离证据包完整（替代证据）；预算/如实性不变。**pass**。
- **AC-14/RR-6 复判 pass**：B1 v1.2 明确 shell/审批卡为 AC-14-1 记录项、非「非本变更卡」；RR3 的 shell 3 次均未执行、1 张硬拒 deny 审批卡、无额外模型会话，继续至意图卡不构成停止触发；如实记录。原 §4-2 的「严格解释则 insufficient」条件随 v1.2 澄清消除。**pass**。
- **其它 49 项**：B1 v1.2 仅澄清隔离/停止规则，不改变 AC-1–12/14–17、TM、BASE、其余 RR/EV 的判据与证据；原 B2 §2–§5 的 49 pass 继续成立；候选 11 文件/聚合 `bcd32553…`/manifest `fc296e95…` 未变，B2 v1 后无新候选/证据变更。
- **最终计数**：BASE 8/8、AC 17/17、TM 14/14、RR 8/8、EV 6/6 = **53 pass / 0 fail / 0 insufficient / 0 NA**；**总判定：pass**（附 §4 的披露/限制，已按 v1.2 澄清）。不授权提交/推送/合并/发布。
