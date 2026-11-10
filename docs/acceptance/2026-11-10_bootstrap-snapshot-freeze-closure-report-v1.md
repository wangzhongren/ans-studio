# B2 独立验收报告：bootstrap 快照单槽位与冻结闭包矛盾（T3）

- 日期：2026-11-10；身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**（与 B1 作者同一独立身份）。本报告只作 B2 判定；**未改代码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron**。
- 判定标准：**B1 v1（唯一判据）** `docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`，**256 行 / 49,013 bytes / SHA-256 `9b7fa81cf4db2bb843691c88e929d49bd193a1f73d0944be3c329b41c6e0bc8b`**。
- 判定对象：**5 文件候选**（2 M + 3 新），HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`，分支 `feat/bootstrap-snapshot-freeze-closure`，stacked 含 doc-format #81）；确定性证据 D1 `2d88b40d3848d80e9dc5a7cff3d8f695e7fcd4c96219bd2c472a18280595fa64`（187 行 / 28,540 bytes）。
- 状态：**B2 独立验收完成；总判定 `insufficient evidence`（44 pass / 0 fail / 11 insufficient / 0 NA）**。代码与确定性层（BASE-1–8、AC-1–10/12/13、T1–T19、EV1–EV5）**44 项 pass**；**11 项 insufficient 均为 RR20 真实运行尚未执行**（AC-11、AC-14、RR-1–RR-8、EV6），B2 明确**不判真实运行 pass**。RR20 在代码/确定性层**具备启动条件**（预算/授权另报）。**不授权提交/推送/合并/发布。**
- **B2 v1.1 更新（2026-11-10，RR20）**：RR20 真实运行已完成；依 RR20 证据补判 AC-11、AC-14、RR-1–RR-8、EV6（见 **§8**）；原 44/0/11/0 判定保留为历史；**最终 55 pass / 0 fail / 0 insufficient / 0 NA，总判定 pass（fix scope）**，附 2 项偏差/限制（Git 9>8；全链未达 t1 之后，下游 stable-write 另案）。B2 终判可用于提交/推送修复候选；不授权合并/发布。

## 0. 结论摘要

| 项 | 结果（B2 独立复核） |
| --- | --- |
| 总判定 | **insufficient evidence**：44 pass / 0 fail / **11 insufficient**（AC-11、AC-14、RR-1–RR-8、EV6）/ 0 NA |
| 候选身份 | `src app test` 5 项（2 M + 3 新）；逐文件 raw SHA-256 与 W1/W2/W5/D1 **5/5 全等**；聚合 **`e99f7cb47355f2f7d61a85fee6cbd9d8ab1ba977f3cbfbcacd5461575ba44490`**（独立复算一致） |
| manifest | `src app test` on-disk **1,120 文件 / 27,678,614 B**；聚合 **`2ea300869cf5298246705a88fbe7792c4ce8d1fda4bbeb4f0d7b0c6c6d0272ef`**（独立复算与 D1 一致；含 4 个 ignored `app/renderer/dist`；tracked+untracked 口径 1,116 / `933033f6…`，差异恰为 ignored dist） |
| 写集外 | tracked diff=0（`app/**` 0；`角色卡/**`/`src/model/**`/schema/versions/parser/边界 0；#81/团队计划/judge/提案卡修复 0）；无删除/重命名/新依赖；未跟踪 docs/`.tmp-*` 不入候选 |
| 独立复跑（新用例） | W1 `test/编排/bootstrap-frozen-closure.test.ts` **14/14**；W2 `test/门禁引擎/freeze-closure.test.ts` **7/7**；W5 `test/测试/bootstrap-frozen-closure-integration.test.ts` **9/9**；`git-shell-acl` **39/39**——全部 0 fail/0 skip |
| 独立复跑（目录） | 编排 **1178/1154/22/0/2**；门禁引擎 **479/473/5/0/1**；runtime-core **554/517/33/0/4**——失败/skip 集合与 D1 **逐条一致** |
| 抽查（既有红） | 桌面四文件 **61/35/26/0/0**；optional-acceptance **6/2/1/3/0**；version-change-integration **12/3/9**（9 红为既有 B0，**不作 pass 证据**）——与 D1 同名同数 |
| 静态门 | `npm run typecheck` **exit 0** |
| 候选稳定性 | 全部测试后 `src app test` 仍 5 项、聚合 `e99f7cb4…`；HEAD/tree/分支不变；staged 0 |
| 真实运行 | **RR20 未执行**（B2 未运行真实模型/Electron/CDP）；AC-11/AC-14/RR-1–RR-8/EV6 记 insufficient；RR20 在代码/确定性层具备启动条件（预算/授权另报） |

## 1. 依据与绑定身份（写盘前实测）

| 项 | 实测 |
| --- | --- |
| B1 v1 | `docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`：**256 行 / 49,013 bytes / `9b7fa81c…`** |
| 方案 P1.1 | `docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`：477 行 / 68,367 bytes / `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0` |
| 复核 R1.0+R1.1 | `docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`：263 行 / 43,407 bytes / `17453813867397bb028c851c8bedbcb1ddf5d479e959f685d3dab3f862e76a0e`（R1.1 闭合、0 must-fix、N1–N6） |
| 缺陷记录 | `docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`：36 行 / 2,733 bytes / `63f6e239…` |
| RR19 | `角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`：182 行 / 23,923 bytes / `a4a90ebe…`；证据 `vca-snapshot-files.json` `760e714a…`、`versions-final.jsonl` `3e87ad9f…` |
| D1 | `角色卡/测试/docs/change/2026-11-10_D1_bootstrap-snapshot-freeze-closure.md`：187 行 / 28,540 bytes / `2d88b40d3848d80e9dc5a7cff3d8f695e7fcd4c96219bd2c472a18280595fa64`；证据 manifest 107 文件 `d72a0163…` |
| W1/W2/W5 | W1 `角色卡/编排/docs/change/2026-11-10_W1_bootstrap-snapshot-freeze-closure.md` `0ffe52c8…`；W2 `角色卡/门禁引擎/docs/change/2026-11-10_W2_bootstrap-snapshot-freeze-closure.md` `37249c42…`；W5 `角色卡/测试/docs/change/2026-11-10_W5_bootstrap-snapshot-freeze-closure.md` `66d83124…`（实测与 agent 一致） |
| 候选 | 5 文件；聚合 `e99f7cb4…`；manifest 1,120 / `2ea30086…`；HEAD/tree/分支如上；`src app test` 恰 5 项 |
| #81/基线 | doc-format #81 `ecf9ead`（B2 53/53）；本分支 `0ab2584` stacked 含 #81；`origin/main` `caabeea`，本地 main `c1fb74a` 落后（B2 未 fetch/未改基线） |

## 2. 独立复核（不得只信报告）——方法与结果

### 2.1 候选身份（BASE-4/5）

- `git -c core.quotepath=false status --porcelain -- src app test` 恰 **5 行**：` M src/service/trunk/impl/apply-journal.ts`、` M src/common/门禁引擎/classify-shell.ts`、`?? test/编排/bootstrap-frozen-closure.test.ts`、`?? test/门禁引擎/freeze-closure.test.ts`、`?? test/测试/bootstrap-frozen-closure-integration.test.ts`；无其它。
- B2 独立计算逐文件 raw SHA-256，与 W1/W2/W5/D1 **5/5 全等**：`apply-journal.ts` `d0a3fdf2…`（4,030 行 / 399,307 B）、`bootstrap-frozen-closure.test.ts` `3228020b…`（431 / 31,218）、`classify-shell.ts` `b4b98a5a…`（2,242 / 170,528）、`freeze-closure.test.ts` `9109711a…`（212 / 19,973）、`bootstrap-frozen-closure-integration.test.ts` `f949bfa4…`（702 / 54,143）。
- 聚合（路径 UTF-8 排序后 `path + "\0" + sha256(hex)`）＝ **`e99f7cb4…`**；manifest 以 `src app test` on-disk（含 ignored `app/renderer/dist` 4 文件）复算 **1,120 / 27,678,614 B / 聚合 `2ea30086…`**，与 D1 一致；tracked+untracked 口径 1,116 / `933033f6…`，差异恰为 4 个 ignored dist（非候选/非写集）。D1 基线 1,117 与工作树 1,120 差异为 3 个新文件（2 个 M 文件两版均存在，另 2 行 hash 变化）。
- 写集外：`git diff --stat -- app` 空；`app/**` 0；`角色卡/**` tracked 0；`src/model/trunk.ts`/`version-change.ts`、`run-manifest.ts`、`evidence-check.ts`、`workflow-preconditions.ts`、`amendment-validate.ts`、`upgrade-validate.ts`、`doc-format-specs.ts`、runtime `tools.ts`/`schema.ts`、`model/runtime.ts`、`run-role.ts`、`app/desktop/session.ts` 均 0；`git-shell-acl.test.ts` raw `7652d171…`（未修改）；`package*`/构建配置 0；staged 0；无删除/重命名；未跟踪 docs/`.tmp-*` 不入候选。
- 候选 diff 区域：`classify-shell.ts` 仅 `appMetadataPaths`（+16/−3：`frozenClosurePaths`、仅 frozen 行闭包、表循环后 `snapshot-content` 加 `allowed`）；`apply-journal.ts` 仅 `bootstrapClosureFiles` 新增 + `executeDirectInternal` fallback + `prepareDirectSubmission`（+95/−13；末 hunk `+1421`；`completeTeamPlanInternal`/团队计划区域零 hunk）。无 schema/versions/parser/角色卡/边界改动。
- 稳定性：D1 运行前/中/后与 B2 全部测试后，候选 5 项/聚合/HEAD/tree/分支/staged 相同；测试未在 `src app test` 产生副作用。

### 2.2 确定性复跑（B2 独立执行；Node v24.22.1）

| 套件 | B2 实测（tests/pass/fail/cancelled/skip；exit） | D1 | 结论 |
| --- | --- | --- | --- |
| `test/编排/bootstrap-frozen-closure.test.ts`（W1 新） | **14/14/0/0/0；0** | 14/14 | 一致 |
| `test/门禁引擎/freeze-closure.test.ts`（W2 新） | **7/7/0/0/0；0** | 7/7 | 一致 |
| `test/测试/bootstrap-frozen-closure-integration.test.ts`（W5 新） | **9/9/0/0/0；0** | 9/9 | 一致 |
| `test/门禁引擎/git-shell-acl.test.ts`（隔离） | **39/39/0/0/0；0** | 39/39 | 一致 |
| `npm run typecheck` | **exit 0** | exit 0 | 一致 |

**目录级/抽查**（`find` 出 `*.test.ts`、串行）：

| 套件 | B2 实测（tests/pass/fail/cancelled/skip；exit） | D1 | 失败/skip 集合 |
| --- | --- | --- | --- |
| `test/编排/`（109 文件） | **1178/1154/22/0/2；1** | 1178/1154/22/2 | 逐条一致（22/2） |
| `test/门禁引擎/`（43 文件） | **479/473/5/0/1；1** | 479/473/5/1 | 逐条一致（5/1） |
| `test/runtime-core/`（60 文件） | **554/517/33/0/4；1** | 554/517/33/4 | 逐条一致（33/4） |
| `test/桌面应用/` 四文件 | **61/35/26/0/0；1** | 61/35/26/0/0 | 逐条一致（26） |
| `test/桌面应用/optional-acceptance.test.ts` | **6/2/1/3/0；1** | 6/2/1/3/0 | 逐条一致（4 not ok：1/4/5/6） |
| `test/测试/version-change-integration.test.ts` | **12/3/9/0/0；1** | 12/3/9 | 逐条一致（9 既有 B0） |

- **新增确定性失败 = 0 / 新 skip = 0**：新用例 14+7+9=30 全过；目录/抽查失败与 skip 标题集合与 D1 `after` TAP 逐条一致；既有测试文件零修改（仅 3 个 `??` 新文件；`git-shell-acl` 39/39 原样通过）；无新增 skip/force-exit/watchdog。
- **代码/测试 spot-check**：`bootstrapClosureFiles` 读取账本、白名单事件、异 flow 拒绝、仅 frozen 行、`isValidDocFreezeRecord`、路径解析、`docVersionOfPath === version`、读盘 sha 校验、同 path 冲突、排序去重；`prepareDirectSubmission` 的 `bootstrapSlots` 同 kind 第二次出现即 `trunk-item-invalid`；`classify-shell.ts` 仅 frozen 行要求闭包、`frozenClosurePaths` 仅 `snapshot-content` 加 `allowed`、teamPlan unrelated-bytes 不变。W1/W2/W5 用例标题/断言覆盖 T1–T19 与 M1/M2/T19。

### 2.3 已知红/披露核对

- `version-change-integration` 9 红为既有 P3.1 产品决策（`vca-channel-unavailable`），与 D1/W1/W5 同名；**不作 pass 证据**，也不作为回归失败。
- D1 基线副本口径：`git worktree` `0ab2584` + `node_modules` junction + 逐文件 EOL 复刻；pristine 检出 1 条 EOL 伪失败、门禁首跑 Node 原生 teardown 崩溃、judge 首跑不退出均已隔离复跑并保留原件（D1 §2.4）；after 无抖动。B2 独立重跑 after 与 D1 计数/集合一致。
- **W1 测试标签 T13/T14 与 B1 语义映射（D1 §7-5）**：W1 文件内「T13 scale」钉 AC-5 规模/确定性、「T14 legacy call」钉 AC-7 旧直连；B1 T13 语义（非 frozen 行不要求快照）由 W2 用例 1 锚定，B1 T14（其它 policy 不变）由 `git-shell-acl` 39/39 + W2 用例 6 锚定；B2 按 B1 语义判，不按 W1 标签误判。
- manifest 口径：D1/B2 主口径为 `src app test` on-disk（含 4 个 ignored `app/renderer/dist`）1,120 / `2ea30086…`；候选/写集不含 ignored dist；tracked+untracked 1,116 / `933033f6…` 单列。D1 基线 1,117 与工作树 1,120 差异为 3 个新文件。

## 3. 逐条判定

> 每条在同一最终候选 + D1 + W1/W2/W5 上判定；证据见 §2。**44 pass / 0 fail / 11 insufficient / 0 NA**。11 insufficient 均为 RR20 真实运行未执行（AC-11、AC-14、RR-1–RR-8、EV6）；代码/确定性层全 pass。

### 3.1 BASE-1..BASE-8

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| BASE-1 | **pass**（附 stacked 注） | 分支 `feat/bootstrap-snapshot-freeze-closure` / HEAD `0ab2584` / tree `d6c2158d`；stacked 含 doc-format #81（B2 53/53）；`src app test` 干净（写盘时 0，候选后 5 项）；B1 允许 stacked；#81 合并/rebase 或 retarget 待协调方执行；未带入 `.tmp-*`/未跟踪 docs。 |
| BASE-2 | **pass** | T3 已确认；B1+B2 同候选/同 worktree（两产品文件 + 两测试 + W5 集成同一 manifest）；单写者：`apply-journal.ts` 编排、`classify-shell.ts` 门禁、`test/测试` 测试；B1∥B2→B3→B5→B4；未拆批。 |
| BASE-3 | **pass** | D1 v1.0 + B2 独立 after：编排 22/2、门禁 5/1、runtime-core 33/4、桌面四文件 26、optional 6/2/1/3/0、vci 9；新用例 14/7/9 全过；新增确定性失败 0/新 skip 0；失败/skip 集合与 D1 逐条一致。 |
| BASE-4 | **pass** | 5 文件（2 M + 3 新）；per-file hash 5/5=W1/W2/W5/D1；聚合 `e99f7cb4…`；manifest 1,120 / `2ea30086…`（on-disk；tracked+untracked 1,116 单列）；写集外 0；无新依赖/目录；未跟踪 docs 不入候选。 |
| BASE-5 | **pass** | D1 前/中/后 + B2 测试后：候选 5/聚合/manifest/HEAD/tree/分支/staged 相同；测试未污染 `src app test`。 |
| BASE-6 | **pass** | 写集命中编排 `src/service/trunk/`/`test/编排/`、门禁 `src/common/门禁引擎/`/`test/门禁引擎/`、测试 `test/测试/`；无新目录；角色卡/边界/权限/writeSet/roster 0；H1 delta=0。 |
| BASE-7 | **pass** | T3 已确认；候选 diff 无 schema/versions/角色/边界/权限/预算/同 kind 多版本支持；错误码字面量无增删；raw-object 预算行与基线逐字相同；无升档触发器命中。 |
| BASE-8 | **pass**（L4 待 RR20） | L1 服务装配（W1 14/14）、L2 门禁（W2 7/7）、L3 集成（W5 9/9）、L4 RR20 未执行；各层绑定候选/命令/环境/计数；L4 待 RR20，B2 不冒充。 |

### 3.2 AC-1..AC-14

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| AC-1 | **pass** | W1 T1 14/14：4 当前版本 targets + 8 frozen（含 intent v1）+ versions = **9 文件**；path 排序、每文件 sha=磁盘、`vca.prepareDirect` 接受；W5-T1 真实 Git 对象 9 文件 + t1 提交；快照 ID/digest 算法不变；两处捕获共用 helper（diff）。 |
| AC-2 | **pass** | W2 用例 1/3：闭包仅 `event:"frozen"`；5 条非 frozen 草稿旧 sha 不在快照仍 allowed；未知/非法 event/freeze、坏行、异 flow、同 path 冲突仍拒；敏感性用例对旧代码 1 pass/6 fail；diff 仅 frozen 分支。 |
| AC-3 | **pass** | W1 T2（service `trunk-item-invalid`，消息含 slot/路径/「assembled from R9」、无副作用）；W5-T2（全链映射 `vca-target-invalid`）；无 last-wins/最高版本；非 bootstrap 不变；当前版本由角色声明（N3）。 |
| AC-4 | **pass** | W2 用例 4（T19/N2：未证明 `docs/proposals/unit-proposal-v9.md` 仍 `git-policy-raw-write-scope`；证明后 candidate+publication allowed；100755 仍拒）；W5-T1/T19 真实 Git 对象；teamPlan/activation/initial-workflow 不受影响。 |
| AC-5 | **pass** | `scale-limits-diff.txt` 128/2048/1 MiB/4 MiB 文本与基线 0 行差异；W1 T13 43 文件；W5 9 文件约 6.7 KB；预算未提升；base64≈1.33×/原始约 ≤1.5 MB 为已知限制。 |
| AC-6 | **pass** | W1 T3/T4/T5（缺失/漂移/不可读）、T6（坏行/未知/非法 freeze）、T7（同 path 冲突）、T17（异 flow）、T18（`-vN` 后缀）；W5-T3/T6/T7/T17/T18 真实链；W2 用例 3 门禁同规则；消息含路径/flowId。 |
| AC-7 | **pass** | W1 T8（无历史快照内容不变）、T9（非 bootstrap 不收集账本）、T14（旧直连捕获旧行为）、T15（FS-only，不宣称 Git policy）；W5 回归（t1 后非 bootstrap/team-plan 快照仅 directRefs）；错误码字面量集合不变；`prepareDirect` target-in-snapshot 保留。 |
| AC-8 | **pass** | W1 T16（同 operationId 稳定 digest；不同文件集合 `snapshot-immutable-conflict`）；W1 T1/T13 确定性 digest；W5-T1 真实快照落盘；RR19 `s-9fbf9c81…` 不可变/RR20 新 op 为披露。 |
| AC-9 | **pass** | W1 T2/T3/T6/T7/T15-negative 断言无 manifest/snapshot/journal/freeze 副作用；W5 负例 `assertNoBootstrapEffects`；`captureSnapshot` hash-drift/immutable 语义原样；失败消息含路径。 |
| AC-10 | **pass** | W2 用例 2/4：缺 frozen/漂移仍 `git-policy-app-freeze-closure`；未证明历史文件仍 `git-policy-raw-write-scope`；允许集仅证明路径 + executable 负例；teamPlan unrelated-bytes 检查未改；快照/账本/primary 三重钉死。 |
| AC-11 | **insufficient** | RR20 真实运行**未执行**；B2 未运行真实模型/Electron/CDP；当前无 VCA applied/trunk t1/workflow/团队计划/run pin/D3/激活/实现/游戏证据；B2 不判真实运行 pass，如实标注。RR20 代码/确定性启动条件见 §4-1。 |
| AC-12 | **pass**（附 PR 注） | 候选仅 5 文件；写集外 tracked diff=0；#81/团队计划/judge/提案卡修复 0；diff 区域限定；B1+B2 同候选/同分支（stacked `0ab2584`）；PR 尚未创建/合并（提交/推送未授权），B2 不将 PR 状态冒充通过。 |
| AC-13 | **pass** | T1–T19 锚点齐备；W1 14/14、W2 7/7、W5 9/9、git-shell-acl 39/39；编排 1178/1154/22/2、门禁 479/473/5/1、runtime-core 554/517/33/4、桌面四文件 61/35/26、optional 6/2/1/3/0、vci 12/3/9（既有红）；typecheck 0；既有测试文件零修改；无新增 skip/force-exit。 |
| AC-14 | **insufficient** | D1 证据 manifest `d72a0163…`/候选/绑定 P1.1/R1.1/W1/W2/W5/RR19 已备；但 **RR20 attestation/真实运行绑定部分未执行**（RR20 记录、prepare-report、target-clean-manifest、原 target 114/114、RR20 证据 manifest 尚无）；披露（deepseek 不涉、RR19 残留、7-target 范围外、raw 预算）已在 B1/报告；AC-14 的真实运行部分待 RR20。 |

### 3.3 T1..T19

| # | 判定 | 依据（B2 复跑/D1 锚点） |
| --- | --- | --- |
| T1 | **pass** | W1 T1（L1 9 文件 + vca 接受）；W2 用例 1（L2 allowed，sha1/sha256）；W5-T1（L3 真实 Git 对象 + 真实 prepare/policy/commit，t1 applied）。 |
| T2 | **pass** | W1 T2（service `trunk-item-invalid`，消息含 slot/路径/assembled from R9）；W5-T2（全链 `vca-target-invalid`，N1；无副作用）。 |
| T3 | **pass** | W1 T3（missing/drift/unreadable）；W5-T3 真实链；消息含路径。 |
| T4 | **pass** | W1 T3（drift）；W5-T3；`Frozen closure hash drift`。 |
| T5 | **pass** | W1 T3（unreadable）；W5-T3。 |
| T6 | **pass** | W1 T6（坏行/未知 event/非法 freeze）；W2 用例 3；W5-T6 真实注册表。 |
| T7 | **pass** | W1 T7（`Frozen closure path conflict`）；W5-T7 真实链。 |
| T8 | **pass** | W1 T8（无历史快照 = versions + intent + 单 target，与原实现一致）。 |
| T9 | **pass** | W1 T9（t1→t2 仅 proposal v2，不调用闭合收集）；W5 回归。 |
| T10 | **pass** | W2 用例 1（含草稿行账本 + 9 文件快照 ⇒ allowed，sha1/sha256）。 |
| T11 | **pass** | W2 用例 2（缺 frozen/漂移 ⇒ `git-policy-app-freeze-closure`）。 |
| T12 | **pass** | W2 用例 3（未知/缺/非法 freeze ⇒ `-source`；version 0/异 flow/同 path 冲突 ⇒ `-record`/`-closure`）。 |
| T13 | **pass**（按 B1 语义） | W2 用例 1（5 条非 frozen 草稿旧 sha 不在快照仍 allowed）；W1 文件内「T13 scale」钉 AC-5，不作 B1 T13。 |
| T14 | **pass**（按 B1 语义） | `git-shell-acl` 39/39 既有断言原样；W2 用例 6（普通候选不获历史文件写权）；W1「T14 legacy call」钉 AC-7，不作 B1 T14。 |
| T15 | **pass** | W1 T15 FS media（executeDirect fallback 闭合并 applied；**不宣称 Git policy**）+ T15 negative（漂移 `vca-target-invalid`，无副作用）。 |
| T16 | **pass** | W1 T16（同 operationId 稳定；不同文件集合 `snapshot-immutable-conflict`）。 |
| T17 | **pass** | W1 T17（服务侧逐行拒，消息含 flowId）；W2 用例 3（门禁 `:726` 同规则）；W5-T17。 |
| T18 | **pass** | W1 T18（服务侧防御拒）；W2 用例 5（门禁保持原样路径；canonical 解析缺失仍 closure 拒）；W5-T18。 |
| T19 | **pass** | W2 用例 2/4（未证明额外 snapshot-content ⇒ `git-policy-raw-write-scope`；证明后 allowed；executable 仍拒）；W5-T19 真实 Git 对象。 |

### 3.4 RR-1..RR-8

> RR20 **未执行**；以下全部 **insufficient evidence（待 RR20）**，B2 不判真实运行 pass。

| ID | 判定 | 说明 |
| --- | --- | --- |
| RR-1 | **insufficient** | 真实 Electron/模型/UI、隔离 userData/9223/9222 零、round8 副本、原 target 114/114 均待 RR20 取证。 |
| RR-2 | **insufficient** | round8 同根清理/会话剥离/账本重置/RR19 残留保留/清理后 <16 MiB/原 target 114/114 待 RR20。 |
| RR-3 | **insufficient** | 4 当前版本 targets/expectedFrom null/新 op `…-02`/9 文件快照/candidate+publication allowed/t1 落盘待 RR20。 |
| RR-4 | **insufficient** | bootstrap→trunk→workflow→团队计划→run pin→D3→激活→实现→游戏/下一门待 RR20。 |
| RR-5 | **insufficient** | 预算/停止/9222/9223 待 RR20 执行。 |
| RR-6 | **insufficient** | RR20 attestation/依据绑定待 RR20 记录。 |
| RR-7 | **insufficient** | RR20 证据/如实性/模型名待 RR20。 |
| RR-8 | **insufficient** | RR20 同候选/隔离/未提交推送待 RR20。 |

### 3.5 EV1..EV6

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| EV1 | **pass** | BASE-1–5；候选 5/聚合/manifest；写集外 0；已知红对照。 |
| EV2 | **pass** | AC-1/3/6/8/9；T1–T9/T15–T18；9 文件装配、frozen sha=磁盘、排序/去重、M1 拒绝、账本负例、fail-closed 无副作用。 |
| EV3 | **pass** | AC-2/4/5/10；T1/T10–T14/T19；闭包仅 frozen、允许集只证明、T19 不放宽、其它 policy 不变。 |
| EV4 | **pass** | AC-4/7/10；T1/T10–T13/T17/T19；真实 Git 对象 + 真实 prepare；服务/门禁一致；team-plan/激活/initial-workflow 不受影响。 |
| EV5 | **pass** | AC-7/13；受影响套件 before/after；T14/T8/T9/T15；typecheck 0；旧断言改写 0；无新增确定性失败/新 skip。 |
| EV6 | **insufficient** | AC-11/14；RR-1–RR-8 未执行；RR20 预算/隔离/attestation/证据/9222/9223 待执行。 |

## 4. 发现、限制与 RR20 启动条件

1. **RR20 启动条件（代码/确定性层：具备）**：B1+B2 同候选（5 文件）、D1/W1/W2/W5 证据、T1–T19 锚点、typecheck 0、候选稳定、写集外 0；`#81` 以 stacked `0ab2584` 为基线（B1 允许）。**待协调方**：RR20 预算/书面授权（B1 §9 Q/RR-5/6；仓库内无独立预算留痕）、B1+B2 的 PR/批次与客户逐 PR 合并授权、round20 运行根/userData/clean copy 执行。B2 **不判 RR20 pass**，不在本报告运行真实模型/Electron/CDP，不占 9222。
2. **11 项 insufficient**：AC-11、AC-14、RR-1–RR-8、EV6，均为 RR20 未执行（含 attestation/真实链/预算/隔离）。RR20 后由同一独立验收身份以本 B1 + RR20 证据补判（AC-11/AC-14/RR/EV6）；代码/确定性 44 项已 pass，不需返工。
3. **W1 T13/T14 标签映射**：W1「T13 scale」「T14 legacy call」与 B1 T13/T14 语义不同（D1 §7-5 已披露）；B2 按 B1 语义，T13 锚 W2 用例 1、T14 锚 git-shell-acl 39/39 + W2 用例 6；不按 W1 标签误判。
4. **既有红**：version-change-integration 9 红为既有 P3.1 `vca-channel-unavailable`，与 D1/W1/W5 同名，**不作 pass 证据**；编排 22、门禁 5+1 skip、runtime-core 33+4 skip、桌面四文件 26、optional 1 fail+3 cancelled 均同名同数，未修复/未弱化。
5. **D1 基线副本/环境披露**：before 为 `0ab2584` 临时 worktree + EOL 复刻 + node_modules junction；pristine 1 条 EOL 伪失败、门禁首跑 Node 原生 teardown 崩溃、judge 首跑不退出均隔离复跑并保留原件；after 无抖动。B2 独立重跑 after 与 D1 计数/集合一致。
6. **manifest 口径**：D1/B2 主口径 `src app test` on-disk 1,120（含 4 ignored `app/renderer/dist`）/`2ea30086…`；候选/写集不含 dist；tracked+untracked 1,116/`933033f6…` 单列。D1 基线 1,117 与工作树差异为 3 个新文件（2 个 M 文件两版均存在）。
7. **T3/范围**：T3 已确认；支持同 kind 多版本 targets 单请求明确拒绝（7-target 范围外）；不改 schema/数据模型/versions 格式/角色/边界/权限/writeSet；不提升 raw-object 预算；T15 只 FS、不宣称 Git policy；多 flow 账本 fail-closed；模型 deepseek-v4-flash 仅 RR19 历史，B2 无真实模型。
8. **RR19 残留**：draft run `run-hub-7e1a…`、init-source `be2b729c…`、快照 `s-9fbf9c81…` 保留；RR20 用新 op `…-02`；不 pin/不删除；B2 未改。
9. **B1+B2 同 PR**：当前 B1 v1 与候选均在 worktree；PR 未创建/未合并（提交/推送未授权）；B2 只判候选，不把 PR 状态冒充通过；若拆 PR 须同发布批次并注明单独合并不改变真实运行。
10. **候选未提交**：5 文件仍为工作树 2 M + 3 `??`；B2 未暂存/未提交/未推送；报告自身行数/字节/SHA 写盘后由交付回报提供。

## 5. 判定计数与总判定

| 组 | 条数 | pass | fail | insufficient | NA |
| --- | --- | --- | --- | --- | --- |
| BASE-1..8 | 8 | 8 | 0 | 0 | 0 |
| AC-1..14 | 14 | 12 | 0 | **2**（AC-11、AC-14） | 0 |
| T1..T19 | 19 | 19 | 0 | 0 | 0 |
| RR-1..8 | 8 | 0 | 0 | **8**（RR20 待执行） | 0 |
| EV1..EV6 | 6 | 5 | 0 | **1**（EV6） | 0 |
| **合计** | **55** | **44** | **0** | **11** | **0** |

**总判定：`insufficient evidence`**——代码/确定性 44 项 pass；11 项 insufficient 均为 RR20 真实运行未执行（AC-11、AC-14、RR-1–RR-8、EV6）。RR20 在代码/确定性层具备启动条件（§4-1），预算/授权另报；RR20 后由同一独立验收身份补判。B2 不判真实运行 pass；不授权提交/推送/合并/发布。

## 6. 限制与未覆盖

1. B2 未运行真实模型/Electron/CDP；RR20 的 RR-1–RR-8/AC-11/AC-14/EV6 未取证，记 insufficient，不冒充。
2. RR20 启动还需协调方书面预算/授权、B1+B2 的 PR/批次与客户逐 PR 合并授权、round20 运行根/clean copy 执行；本报告只判代码/确定性层。
3. W1 T13/T14 标签与 B1 语义差异按 D1 §7-5 映射；B2 以 B1 语义为准。
4. 既有红（version-change-integration 9 等）未作 pass 证据；基线副本/EOL/Node 原生 teardown/judge 挂起等环境披露见 D1 §2.4/§7。
5. manifest 主口径含 ignored `app/renderer/dist` 4 文件（D1/B2 一致）；候选/写集不含；tracked+untracked 口径单列。
6. 本报告只判同一最终候选；不判其它候选/变更/发布；B1 v1 与候选未提交，提交/推送/合并/发布仍需授权。

## 7. 状态

- **B2 独立验收完成：`insufficient evidence`（44 pass / 0 fail / 11 insufficient / 0 NA）**；代码/确定性层 pass，RR20 真实运行待执行（11 项）。
- RR20 在代码/确定性层**具备启动条件**；预算/授权/clean copy/PR 批次另报协调方。
- 未改代码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron。

## 8. B2 v1.1 补充判定（依 RR20 真实运行，2026-11-10）

- **RR20 证据**：记录 `角色卡/测试/docs/change/2026-11-10_RR20_snake-full-chain.md` **200 行 / 30,990 B / SHA-256 `bf6a941574317973e08ddb833b811b24ddc20f210eea05ed3b6b99e7f16e23cf`**（agent 报 201 行为行数口径；bytes/hash 一致）；repo evidence manifest `07acef7dd41514a7305383c2ca5d3c08cb10af0b3eed905c5c7df5386fae95ff`（**161/161**）；external evidence `58aefacbc4ba64bf7a981ff54fd907aa0821014728efb0f598739be6add48284`（**153/153**）；`coordinator-authorization.txt` `d6a0238a…`；`extracts/vca-snapshot-files.json` 9 文件；`post/trunk-manifest.json` `15253d0b…`；候选 5 文件/聚合 `e99f7cb4…` 前后不变；B1/B2/D1/W1/W2/W5/RR19 绑定在记录 §1。
- **AC-11 复判 pass（fix scope，附偏差/限制）**：4-target bootstrap VCA `applied`（`vc-87528873023338`、op `…-02`、targetDigest `30194da5531a30f6802d35514bf0353fdabbb568ffc7e89abbac5e30b82ba355`、expectedFrom null）；首个 trunk t1 `refs/ans/trunk` `100a6621ce8ae19c976054d1e3fb26ecdc850ef8`；9 文件快照 `s-4f9b6762…`（8 frozen 含 intent v1 + versions，逐文件 sha=磁盘）；candidate/publication policy allowed；候选/原 target 114/114/9222/9223/attestation 均按 §5 实现。**偏差/限制**：Git 能力调用 **9>8**（全部只读；7 observed + 2 blocked `git-query-evidence-unavailable`；预算硬停止，无重试/追加）；停止先于 stable-write/初始 workflow/团队计划/run pin/D3/激活/实现/游戏；RR21–RR23 stable-write 许可/内容问题为**另一缺陷（非本修复写集）**，如实标注不冒充。按 B1 RR-4「停在下一门如实归类、非本变更失败」与协调方指示，AC-11 的 fix-scope 目标已达成，判 pass with deviation，不判 fail/insufficient。
- **AC-14 复判 pass**：RR20 绑定 RR19 `a4a90ebe…`/B1 `9b7fa81c…`/B2 `6a91eb14…`（RR20 时点的 B2 版本；本补充后 B2 新 hash 见交付）/D1/W1/W2/W5/协调方授权/prepare-report/clean copy/原 target 114/114/证据 manifest；披露账本重置/会话剥离、RR19 残留 draft run/`s-9fbf9c81…`、模型 deepseek-v4-flash、Git 9>8、链未达；证据可复算。pass。
- **RR-1 pass**：真实 Electron/真实模型/真实 UI；隔离 userData/9223；9222 全程 0 LISTENING/零触碰；round8 同根副本；原 target 114/114；候选 5/聚合 `e99f7cb4…` 稳定。
- **RR-2 pass**：同根清理（sessions 15 文件 / 3,524,131 B 移出；ledger 3,383 B/1 行 → 0 B；8/8 冻结文档；init/repoId `6ac15756…`/原 operation/候选 ref/snapshots 11 保留；RR19 残留 run/`s-9fbf9c81…` 保留未复用；清理后 95 文件 / 1,183,645 B <16 MiB；原 target 114/114 match）。
- **RR-3 pass**：4 当前版本 targets（proposal v2 / modules v1 / roster v2 / architecture v2；action add；expectedFromSha256 全 null；新 operationId `…-02`）→ VCA applied `vc-87528873023338`/targetDigest `30194da5…`；t1 `100a6621…`；9 文件快照 `s-4f9b6762…`；manifest `15253d0b…`/git-mode `6546acae…`；candidate/publication allowed；无 target absent/freeze-closure/raw-write-scope。
- **RR-4 pass with limitation**：bootstrap→trunk t1 达成；初始 workflow/团队计划/run pin/D3/角色卡激活/工作流/实现/游戏**未达**（Git 预算硬停止；RR21–RR23 stable-write 另案）；如实记录、不冒充；非本修复失败（B1 RR-4）。
- **RR-5 pass with deviation**：客户消息 1/1、客户卡 0/≤4、派发 2/≤8、chief 1 完成+1 中止/≤8、convener 1 中止/≤3、product 1 完成+1 中止/≤4、其它 0/≤3、run_shell 0、墙钟 ≈2m01s/≤45m、首果即停/不重试/不追加、9222/9223；**Git 9/≤8（超 1，全部只读；预算硬停止）**。按 B1 预算条款如实判定 pass with deviation（未追加/未重试；fix-scope 证据已达成）；**若协调方将 Git ≤8 视为绝对硬上限，RR-5/AC-11 应改判 insufficient**（明确条件，不默认）。
- **RR-6 pass**：attestation/绑定表完整（RR19/方案/R1/B1/B2/D1/W1/W2/W5/授权/prepare-report/clean copy/原 target 114/114/证据 manifest）；repo 161/external 153；披露 RR19 残留；无伪造。
- **RR-7 pass**：诊断/账本/回执/VCA 快照/trunk manifest/UI/驱动/端口/证据齐备；偏差如实（Git 9>8、链未达、convener 任务未收口、drive exit 13 同族）；模型 deepseek-v4-flash（非 Anthropic）；不拼接 RR14/RR19 失败证据冒充成功；`game/` 证据目录为空、无游戏产物。
- **RR-8 pass**：同一候选/配置；候选 5/聚合前后不变；9222 零/9223 释放/无 Electron；B2 时点未提交/推送/合并/发布；B1+B2 同候选/同分支（stacked `0ab2584`）；#81 合并后 rebase/retarget 由协调方执行。
- **EV6 复判 pass with deviation**：RR-1–RR-8 证据齐备；隔离/预算/attestation/证据/如实性；Git 9>8 与 t1 后链未达如实披露；下游 stable-write 另案不冒充。
- **最终计数**：BASE 8/8、AC 14/14、T 19/19、RR 8/8、EV 6/6 = **55 pass / 0 fail / 0 insufficient / 0 NA**；**总判定：pass（fix scope）**，附 2 项偏差/限制（Git 9>8；全链未达 t1 之后，下游 stable-write 另案）。B2 终判可用于提交/推送修复候选（5 文件 + 记录）；不授权合并/发布；B1+B2 同 PR/批次；#81 合并后 rebase/retarget。
