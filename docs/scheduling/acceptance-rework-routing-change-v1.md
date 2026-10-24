# 变更包：验收返工自动路由与 rejected 重新派发（acceptance-rework-routing）

- **任务 ID**：`2026-10-23-acceptance-rework-routing`｜**产品 flowId**：`acceptance-rework-routing`
- **变更**：验收返工自动路由与 rejected 重新派发（客户 reject / judge auto-rework 转交 Convener；只 accepted 收口；rejected 后按重派门允许一次重新派发 Proof；报告结构化返工段；judge/客户措辞分离；i18n 系统行）
- **风险档位**：**T3（治理行为、验收结果路由、派发与 flow 收口语义变更）**；**目标版本 v1.7.0**，发布前完成独立 T3 验收
- **闸门 0/1/2 与实施授权记录**：`docs/communication/2026-10-23_intent_acceptance-rework-routing.md`（现行 76 行；SHA-256 `b4bc67b7be66c3f1760cb9ad42e0f62b7430c3d942cbfeb02c2fe16234502bec`；blob `a3649668fbdb6cde70007894cf738d45d0696068`）
  - **闸门 0（意图确认）**：已确认（客户「这个可以，先排上，等这个国际化搞完了，在搞」；补充「验收返工路由也是1.7 版本的」）。
  - **闸门 1（方案确认）**：已确认（客户「确认方案 v1，按推荐 Q1–Q13 A；O1–O4 不做。方案确认不等于实施授权，闸门 2 另行确认。」）。
  - **闸门 2（角色指派/写集/顺序/验收安排）**：已确认（客户「确认团队计划 v1 的角色、写集、无新增角色/无边界变更、app/main.ts 归桌面窗口、S1–S7 与 T3 验收安排；实施授权另行取得。」）。
  - **客户实施授权**：已给（客户「授权按团队计划 v1 与标准 v1 实施 S2–S7；不包含 commit/push/发布/目标项目写入，不新增角色/边界。」）。
  - 沟通记录的 SHA-256 已从标准写盘时的 69 行快照（`9a904f43…`）变为现行 76 行（追加闸门 2 与实施授权记录）；授权事实以现行记录为准（标准 §1.1 已说明该漂移）。
- **客户闸门 1 确认的策划方案**：`docs/planning/2026-10-23_design_acceptance-rework-routing.md` **v1**（951 行；SHA-256 `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5`；blob `92f88c03bdfdc0683e81a07392c0d4975bcbe28a`）
- **团队计划**：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md` **v1**（389 行；SHA-256 `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab`；blob `2e88d2ad39b31911a4c96c8148e79be97e718b44`）
- **实施前验收标准**：`docs/acceptance/acceptance-rework-routing-criteria-v1.md` **v1**（961 行；SHA-256 `b62746e9696eb4103718c46386878d7d34a785e5481803749de930128b5de481`；blob `88d2e542cad573ba14290eff871860b2b8d25a40`），实施前冻结
- **S1 基线记录**：`角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-baseline.md`（334 行；SHA-256 `bcd5ddfcaac4f9f4eadda5763084fef44be3d2e74c5cf4e5948ab576e03305a8`；blob `7746037e4a72106a56d74ef864a2d788a3f3b12d`）
- **S7 集成/回归记录**：`角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing.md`（211 行；SHA-256 `841588b8fb0c3eb58a1cde58efe619f8ca27c90ec282e86d3526cc0cd2b4e009`；blob `5dd7223177e99b4b848f023c838929d0d0605704`；状态 **`verified-by-tests-only`**）；证据目录 `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`，manifest `sha256.txt` **92 行**（SHA-256 `8d5f48cd1e5d2d8e12bc244b59e65ca4516308810233e2fe2c0e419fe648abca`）
- **S2/S3/S4/S5 记录**：`角色卡/编排/docs/change/2026-10-23_change_acceptance-rework-routing.md`（142 行；SHA-256 `6af4062629d76b1134ea09862ae8a4cd562c0741de6613c323ec619ecec5a88c`）、`角色卡/桌面窗口/docs/change/2026-10-23_change_acceptance-rework-routing.md`（146 行；SHA-256 `a283f78c28ff379d4004d74fd819d54f1026d672113b4636ca595c17c8acb573`）、`角色卡/运行时核心/docs/change/2026-10-23_change_acceptance-rework-routing.md`（110 行；SHA-256 `8b2c228b7d1825e58d50de779f606c0c8e0bfaebbd1f9dc9b75b59a0ed202b84`）、`角色卡/项目管理/docs/change/2026-10-23_change_acceptance-rework-routing.md`（110 行；SHA-256 `7b2aba99f1a4e8787713f2264c6aedd6dc1287a02a20cf2381cc022e17943488`）
- **状态**：**实施与测试完成，待独立验收（I10）；不是验收报告**。本文件不判定通过/返工/证据不足，不声称已验收或已发布，不授权提交、推送、合并、发布或写目标项目。
- **日期**：2026-10-23

---

## 一、候选身份

- 当前 HEAD：`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`main`；S1 记录 tree `1149238a834f31588797016d6ee2289a4ac3e97b`）。
- 工作树：**未提交、未暂存**；`git diff --cached --name-only` 为空（实测 0 项）。候选 = 工作区内容；HEAD 树不含本变更。
- 候选范围：S2–S7 的**产品/测试候选共 21 个文件**（相对 HEAD：新增 6、修改 15），按 §三分组列出。其中本变更**新建** 3 个文件（`src/common/编排/acceptance-rework.ts`、`test/编排/acceptance-rework.test.ts`、`test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`）；另外 3 个「HEAD 不存在」的文件（i18n 两份消息目录与 `test/项目管理/shared/i18n.test.ts`）由 i18n 既有未提交候选建立，本变更只在整文件内追加 6 个 key / 3 个用例，整文件哈希列入候选只为复算，不代表本包为 i18n 其余内容背书。
- `app/renderer/dist/` 是 `.gitignore` 忽略的构建产物、**非候选**；S7 的 `build:renderer` 产物写入该目录，`git status -- app/renderer/dist` 为 0 项。
- `test/桌面应用/e2e/main.mjs` **不是本变更候选**：它在 HEAD 前已被 i18n 既有候选修改（未提交），当前哈希仍等于 S1 基线 `git hash-object 142e0f18d7701964053d97c6412d38809684c329` / SHA-256 `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b`；本变更未写该文件，只把它作为真实 Electron 运行证据。
- 候选稳定性：21 个候选文件在生成前、生成后各复算一次 `git hash-object` + `sha256sum`，两次逐行一致（§四）；候选哈希与 S7 记录 `candidate-hashes.txt`、S2/S3/S4/S5 记录逐文件一致。

---

## 二、候选隔离

本变更包**只列本变更的产品/测试 hunk**。同一工作树中的以下内容**不是**本候选，不得以本包或本变更验收结论为其背书：

- **i18n（T2）候选**：`src/common/shared/i18n/**`（除本变更新增 6 个 key 区块）、`src/common/shared/runtime-settings.ts`、`runtime-shared.ts`、`app/renderer/**`、`app/preload.cjs`、`test/桌面UI/**`、`test/测试/i18n-integration.test.ts` 等。两份 i18n 消息目录与 `i18n.test.ts` 的整文件字节包含 i18n 既有内容；本变更只对其 6 个 `main.governance.acceptanceRework*` key 与 3 个新增用例负责。
- **目录级授权 v3（T3）候选**：`src/common/编排/team-plan.ts`、`directory-conformance.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/model/runtime.ts`、`test/编排/team-plan.test.ts`、`test/门禁引擎/**`、`test/测试/directory-layout.test.ts` 等。
- **治理写卡推进（T3）候选**：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/{interface,acceptance-dispatch}.test.ts`、`test/测试/governance-e2e-auto/**` 中既有写卡/可重入门禁改动等。
- **验收返工排期、塔防 demo（`demos/`）、`.claude/`、管理记录**（`docs/communication|planning|scheduling|acceptance`）、角色卡 `docs/change/**` 与证据、角色卡/边界/枚举/依赖、`package.json`/`tsconfig*`/`vite.config.ts`/发布配方、`ans-gateway` 任何文件：均非产品候选。
- **`test/桌面应用/` 未新建文件**：该目录对桌面窗口是逐文件授权；`git status --short -- test/桌面应用` 只有既有文件的 `M`，没有 `??`（S1/S7 核对一致）。`e2e/main.mjs` 虽显示 `M`（i18n 上下文），本变更未写。

### 2.1 含既有未提交上下文的混合文件（整文件哈希含其他变更）

以下文件的**整文件哈希包含其他变更的未提交内容**；本包只对**本变更 hunk**负责，验收不得用本变更结论为其他变更/其他 hunk 背书，也不得把整文件算作本变更：

| 文件 | 混合的既有上下文（按 S1 基线/角色记录） |
| --- | --- |
| `src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts` | 目录 v3 / 治理写卡推进既有 hunk；本变更追加最新 accepted、reopen、公共出口、测试 |
| `app/desktop/customer-input.ts` | i18n B3 既有 hunk；本变更追加 `onAutoRework` |
| `app/desktop/interface.ts` | i18n B0/B3、目录 v3、治理写卡既有 hunk；本变更追加最新决定/路由/record/重派门 |
| `app/desktop/governance-advance.ts` | i18n B3、目录 v3、治理写卡既有 hunk；本变更追加派发谓词收窄、legacy 回归锁、返工任务文本 |
| `app/main.ts` | i18n B0/B3 既有 hunk；本变更只追加 `onAutoRework` 接线 |
| `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | i18n 既有整文件（HEAD 未跟踪）；本变更只追加 6 key / 3 用例 |
| `test/桌面应用/acceptance-dispatch.test.ts`、`interface.test.ts` | 目录 v3 / 治理写卡/i18n 既有 hunk；本变更追加/替换验收返工用例 |
| `test/桌面应用/operator-wiring.test.ts` | i18n B3 en-US 用例 + 目录 v3 一处 `teamPlanSchema` hunk；本变更追加 `onAutoRework` 回调断言 |
| `test/测试/governance-e2e-auto/fixture.ts` | 目录 v3 / 治理写卡既有改动；本变更只追加默认关闭的可选钩子（`wireAutoRework`/`failOpenRoles`/`resolveRuntime`/`appendGovernanceLedger`） |

`src/common/编排/flow-state.ts`、`test/编排/flow-state.test.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/tools.test.ts` 在 S1 时等于 HEAD，本变更的改动归属清晰。

---

## 三、候选表与哈希（工作区最终内容）

> 复算：逐路径 `git hash-object -- <path>` + `sha256sum -- <path>`；「新增」= HEAD 中不存在。哈希为 2026-10-23 21:12 +0800 本包生成时值。行数/字节用 `wc -l` / `stat -c %s`。

### 3.1 编排（7）

| # | git hash-object | sha256sum | 行 | 字节 | 状态 | 路径 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `723f34659101f80f757b0e3ead74560a17c3770d` | `ea271ee88067b0b2bcf67576141f09dd6efaa0e2a78f01e66b2ebdb74148bd4a` | 1167 | 52297 | 修改 | `src/common/编排/flow-state.ts` |
| 2 | `8d783e991b885c6d72b7e269c8e9f1a012c9be1a` | `29cd83f99fd0e7d73801c76dc0f70921704dbfd5f37e3f65820c0de7c5213919` | 1766 | 74697 | 修改 | `src/common/编排/flow-service.ts` |
| 3 | `45843ef4bb2ff0c338ce89219e116ede21f9d9d6` | `a8598588cda2d3a805c2879c5381870184a0973cb68e8b3a893ff40048ea9559` | 477 | 19752 | **新增（本变更新建）** | `src/common/编排/acceptance-rework.ts` |
| 4 | `bb6963db1c716e99b8e956ca0711ac1fb545cd1b` | `96966286ca48e5356d39bb2e825b424aec7b7c3022bb8a321d98c3be715f59dc` | 78 | 2662 | 修改 | `src/pipeline/orchestration/flow-state.ts` |
| 5 | `43cc48ab169d27f2a2fdf25c12093bad07574a3d` | `3efba1b9e5fabf08f029b6cfa8d5abf27a4c56d423b730014c92b953c6f05ea8` | 1840 | 65603 | 修改 | `test/编排/flow-state.test.ts` |
| 6 | `6aa7af358bc71ad4771998eac070d98a1fdf4e56` | `eef623a4bace3206bcfc225d1fb522b326e4a871f2bc0bd7d32fcb9c1a794342` | 1952 | 84741 | 修改 | `test/编排/flow-service.test.ts` |
| 7 | `9c3ec88ce070015190b13f847b2b25dcc641a455` | `99735a3123ef6e4f0cec474ae766f560e96a98692e2c6789e422285cbce70fb1` | 456 | 18702 | **新增（本变更新建）** | `test/编排/acceptance-rework.test.ts` |

### 3.2 桌面窗口（7）

| # | git hash-object | sha256sum | 行 | 字节 | 状态 | 路径 |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | `987c090dd935a08ce83c88084e042379a928f150` | `dd709a41b8e8307570814c346542218674ba996af65300f31c1ceea96168b186` | 1249 | 70607 | 修改 | `app/desktop/customer-input.ts` |
| 9 | `a49a84c85a431648fdd2fa58ea11e07b2ee3bcfb` | `20e9b545eb3a41faa24a4269aad863ec331885173ce9a8d9599f952d719139bf` | 5847 | 336550 | 修改 | `app/desktop/interface.ts` |
| 10 | `3ca76030a5b310dbe0c11776fa937206bda759b9` | `3a75af8c4a111e75930df25acc1417fca5013dbbbd2b2208623a3123206a5947` | 1385 | 92296 | 修改 | `app/desktop/governance-advance.ts` |
| 11 | `b7801bc06e83187b35b373ee7986743eea96b1ed` | `cc7982ea7156e2b55d2f434b1e3aa0fb1c61372aeeca50cd8b5a25f771346342` | 992 | 63034 | 修改 | `app/main.ts` |
| 12 | `b9eea6669f6fe44a7bed563e9b07bb3a3f42d34e` | `cb6b78133aa35a8d6f4f0abe0c8b03a39a35fec163cc212533ca5462a823f1f8` | 2852 | 147331 | 修改 | `test/桌面应用/acceptance-dispatch.test.ts` |
| 13 | `1e545367e512b3d2cf740ee531eefe2b9757e884` | `c01a060e94703e71e8e043995285ae113151a86b6afe9e24faac4bbd3805a575` | 7052 | 358766 | 修改 | `test/桌面应用/interface.test.ts` |
| 14 | `65f358a2fbaf3d7d799175709628b8fb121bf5c1` | `326c9156819126b6dbe58669f0bb73ea439228f9c6b3fd7fe55cdfded3dbac8a` | 2521 | 130187 | 修改 | `test/桌面应用/operator-wiring.test.ts` |

### 3.3 运行时核心（2）

| # | git hash-object | sha256sum | 行 | 字节 | 状态 | 路径 |
| --- | --- | --- | --- | --- | --- | --- |
| 15 | `2a7983459249aff27b1ba43193d07d8cf7c72658` | `b3bc52c45042c7493b8ed9e122654513481f67f7877e4d551a6e0479e88153a1` | 2787 | 168074 | 修改 | `src/provider/runtime/tools.ts` |
| 16 | `467ef81cb045a805803edeb356cc0c589cb97a1b` | `c7db7e1f5db919b2f9a61c8c15f97ab9b5c8afd54e82c3d8f960cbc005f5ad94` | 380 | 29169 | 修改 | `test/runtime-core/tools.test.ts` |

### 3.4 项目管理（3）

| # | git hash-object | sha256sum | 行 | 字节 | 状态 | 路径 |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | `c0501469ed8b8631e63ba124f419aa642a034400` | `d487a8d4853004daea619a82b2d760ff3218d6fd1015f1c29623d2ae15953e4e` | 1534 | 115558 | HEAD 无（i18n 既有未提交；本变更 +6 key） | `src/common/shared/i18n/messages/zh-CN.ts` |
| 18 | `74ab4a7d654143b20b6614d7508f48da67c211cc` | `05089d70b7b1e0ee720d619efb57aa8d305b7b8f004f4be66144476257e4b373` | 1774 | 122490 | HEAD 无（i18n 既有未提交；本变更 +6 key） | `src/common/shared/i18n/messages/en-US.ts` |
| 19 | `26501c142dbd2c03bd6db6e135a0a29da8d46a3b` | `d8e7567797d9a324e1e2f9889b84758c81ac1b6df76f98b63c2c652f3bebac97` | 1270 | 54322 | HEAD 无（i18n 既有未提交；本变更 +3 用例） | `test/项目管理/shared/i18n.test.ts` |

### 3.5 测试（2）

| # | git hash-object | sha256sum | 行 | 字节 | 状态 | 路径 |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | `1cc677239100e763383a8edeb2d4d86b8774a5ba` | `931001895808f889b1b3abbd2eff5e6dcce85fa7a6bfb2007ef9fb73d191d5ae` | 1079 | 51137 | **新增（本变更新建）** | `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` |
| 21 | `336177aeca57bab33aea6741eb9df532d63bc1c9` | `2e4e571aa4b8aeae9da21ab59323e45b83b23c94d6fec307a226fde019ad7e71` | 1877 | 76009 | 修改（含既有上下文；本变更+可选钩子） | `test/测试/governance-e2e-auto/fixture.ts` |

**计数**：候选 **21** —— 相对 HEAD 新增 **6**、修改 **15**；按本变更归属为新建 **3**、在既有文件上追加 **18**。

---

## 四、候选稳定性

- **生成前快照**（2026-10-23 21:12 +0800）：按 §三顺序对 21 个路径输出 21 行 `<git hash-object>\t<sha256sum>\t<new|modified>\t<path>`（`new` = HEAD 中不存在，`modified` = HEAD 中存在；含末尾换行），整体 **SHA-256 `30deb89efd694cb4d4768fcaf6a1da1024e8217ffacc728a837fe3ce5d82f97e`**。
- **生成后复算**：写完本变更包与 memo 后对同一 21 路径再算一次，逐行 `diff` 为空；整体 SHA-256 与上值一致。**产品/测试候选零变化。**
- 写包期间只有 `docs/scheduling/` 下的本包与 `docs/scheduling/memo.md` 发生变化；二者不是产品/测试候选，不参与候选哈希。
- 环境：Windows 11 Pro 10.0.26300 / Git Bash；Node **v24.22.1**（`C:/Users/51054/AppData/Local/Programs/nodejs`）/ npm **11.19.1**；HEAD `ee59296…`；`git diff --cached --name-only` 为空；本包写盘前 `git status --short` 共 225 项（工作树含既有三项变更、管理记录、`.claude/`、`demos/` 等；条目不等于候选数）。
- 与 S7 记录对照：21 个候选哈希与 S7 `candidate-hashes.txt`（22 项，含 `e2e/main.mjs`）逐文件一致；S7 已记录 `CANDIDATE_HASHES_STABLE=yes`。`e2e/main.mjs` 当前仍为 S1 基线 `142e0f18…`，本变更未改。

---

## 五、节点表 S1–S7

| 节点 | 内容 | 角色 | 状态 | 记录/证据 |
| --- | --- | --- | --- | --- |
| **S1** 实施前准备 | 闸门 2 + 实施授权（分开记录）；T3 验收标准 v1（先于实施）；T3 基线（typecheck、受影响套件、全量 3725/3697/10/18、目标只读快照、逐角色边界预检） | 沟通/统筹、内置独立验收、测试 | **已完成**（baseline complete；不是验收） | 标准 `b62746e9…`；基线 `bcd5ddfc…` + `…-baseline-evidence/`（含 `gate2-confirmation-check.txt`、`target-hashes.txt`、`full-regression-summary.txt`）；沟通记录 `b4bc67b7…` |
| **S2** 编排契约 | `latestAcceptanceDecision`、`evaluateFlowCompletion({allowRejectedAcceptance})`、`completeAcceptanceStep` 最新 accepted、app-only `reopenAcceptanceStepForRework`、`acceptance-rework.ts` 解析器、Pipeline 公共出口 + 编排测试 | 编排 | **已完成**（角色记录 `implemented-unverified`） | `角色卡/编排/docs/change/2026-10-23_change_acceptance-rework-routing.md`（`6af40626…`）+ `…-evidence/`：定向 122/122；`test/编排/**` 850/849/1（1 项既有 EPERM）；typecheck 0 |
| **S3** 桌面路由 | `customer-input` `onAutoRework`；`interface` 最新决定/路由/routing record/重派门/系统行；`governance-advance` 谓词收窄/legacy 回归锁/返工任务文本；测试 | 桌面窗口 | **已完成**（角色记录 `implemented-unverified`） | `角色卡/桌面窗口/docs/change/2026-10-23_change_acceptance-rework-routing.md`（`a283f78c…`）+ `…-evidence/`：acceptance-dispatch 44/44、interface 120/120、operator-wiring 54/54、桌面套件 568/568、typecheck 0 |
| **S4** 运行时措辞 | `tools.ts` judge/客户 declined 分流；`tools.test.ts` 正负例 | 运行时核心 | **已完成**（角色记录 `implemented-unverified`） | `角色卡/运行时核心/docs/change/2026-10-23_change_acceptance-rework-routing.md`（`8b2c228b…`）+ `…-evidence/`：tools 13/13、相邻回归 52/52 与 13/13、typecheck 0 |
| **S5** 项目管理 key | S5a 6 个 `main.governance.acceptanceRework*` key（zh/en）；S5b parity/typecheck | 项目管理 | **已完成**（角色记录 `implemented-unverified`） | `角色卡/项目管理/docs/change/2026-10-23_change_acceptance-rework-routing.md`（`7b2aba99…`）+ `…-evidence/`：shared 184/179/0/5、typecheck 0、补充 i18n 集成 8/8 |
| **S6** 接线与构建核对 | `app/main.ts` `onAutoRework` 句柄接线（仅接线） | 桌面窗口 | **已完成**（同一 S3 记录 §5；`implemented-unverified`） | 桌面记录 `a283f78c…` §5/§7；typecheck 0；无 preload/IPC 形状变化 |
| **S7** 集成/回归/验收准备 | 跨角色 e2e 10/10×3；受影响套件 2813/2793/5/15；T3 串行全量 3790/3763/9/18；typecheck/typecheck:renderer/build 0；真实 Electron 2/2 `E2E_PASS`；目标只读复算零写入；候选哈希稳定 | 测试 | **`verified-by-tests-only`**（不是验收结论） | `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing.md`（`841588b8…`）+ `…-evidence/`（manifest 92 行，`8d5f48cd…`） |
| **I10** 独立验收 | 按标准 v1 与变更包判定（通过/返工/证据不足） | 内置独立验收 | **待进行** | 报告应写 `docs/acceptance/acceptance-rework-routing-report-v1.md`；本包不预判 |

> S2–S5 角色记录的 `implemented-unverified` 状态**不因 S7 测试而升级**；S7 记录自身也只声明 `verified-by-tests-only`。正式完成判断只由内置独立验收按标准 v1 作出。

---

## 六、实现摘要

- **最新验收决定与收口（编排）**：`latestAcceptanceDecision(flowId, ledgerInput)` 按账本 **append 顺序**取该 flow 最后一条 acceptance 决定，分类 `none`/`ledger-unavailable`/`accepted`/`rejected`/`unresolved`（`changes-requested`/`none`/`unclassified`/缺字段一律 fail-closed）；`evaluateFlowCompletion` 默认 strict：只有最新 `accepted` 收口，最新 `rejected` 返回「验收已拒绝，流程等待返工…」且**不出现「已收口」**；新增可选 `allowRejectedAcceptance`（默认 `false`，仅供桌面重派门读取具体未完成原因，不改变收口语义）；`hasUnresolvedDecision` 口径保持不变。删除旧私有 `hasAcceptanceDecision`。
- **`completeAcceptanceStep` 只认最新 accepted（编排）**：即使更早有 accepted，最新为 rejected/unresolved/none ⇒ `acceptance-not-accepted`，flow 字节不变；已 done 幂等；坏账本/缺步骤/写失败 fail-closed；不写 `customer.decision`。
- **app-only 重开（编排）**：新增 `reopenAcceptanceStepForRework({projectRoot, flowId, autoRework?})`，只把 `verification` 从 `dispatched`/`delivered`（或 pending 带旧证据）安全重开为 `pending` 并清空 evidence，保留 `dependsOn`/supersede 关系；`pending` 无证据幂等；`done` ⇒ `acceptance-already-done`；`failed/blocked/aborted` ⇒ `acceptance-step-terminal`；不新增枚举、保留 id、角色工具或写权；`autoRework:true` 供「无 `customer.decision` 但有耐久 routing record」的 judge 路径声明。
- **结构化报告解析（编排）**：新增纯函数 `parseAcceptanceReworkReport(markdown)`，只认**恰好一个** fenced YAML 段，`schema: acceptance-rework/v1`，`coordinator`（缺省 `convener`；接受 `steward` 别名；其他值 warning 仍路由 Convener）+ `items[{id,owner,action,evidence}]`；严格校验（未知字段、重复 id、多 owner、空 action、>64 项、>32KB、多块、不支持版本 ⇒ `invalid`/`unsupported`），**不解析 §8 表格/§9.1 编号列表/自由文本**，缺段/坏段整段不采信。
- **路由（桌面）**：`routeAcceptanceRework`（客户 reject）与 `routeAcceptanceAutoRework`（judge deny/manual auto-rework）共用实现：读最新 `<flowId>-report-vN.md` → 解析结构化段 → owner 校验（项目 listing 非内置角色可派发；`verifier` 归报告/工具修正；`convener`/内置治理角色归治理文档/变更包；`app`/`customer`/未知 owner 逐项 `blocked`，有效项先行）→ 写 record → 发送**唯一一条** Convener 任务 → best-effort 账本审计。**Proof 不接收返工派发**；不伪造 `customer.decision`；不自动 accept/reject。
- **`.ans` routing record（桌面）**：`.ans/governance/acceptance/<flowId>/rework-routing.json`，schema `acceptance-rework-routing/v1`，原子写；字段含 `source`/`sourceDetail`/`decisionAt`/`requestId`/`reasonCode`/`reportPath`/`reportSha256`/`itemsDigest`/`itemCount`/`structured`/`coordinator`/`flowSha256AtRoute`/`flowMtimeMsAtRoute`/`status`（pending/sent/failed）/`sentAt`/`lastDispatchedFlowSha256`/`lastDispatchedAt`/`error`。**先写 record 再发送**：写失败不发送；发送失败 `failed` 并等下一次事件重试；发送成功 `sent` 后写既有 `dispatch.accepted{actorRoleId:"app", targetRoleId:"convener"}`（无 stepId）；审计失败只诊断 + 系统行，不伪造账本、不翻转已发送事实；同来源+决定/请求+报告哈希的去重与重启去重。
- **重派门（桌面 + 编排）**：最新非 accepted 且存在 routing record；`verification` 为 `dispatched/delivered` 或 pending 带旧证据时先 app-only 重开；`evaluateFlowCompletion(flow, ledger, {allowRejectedAcceptance:true})` 必须 `ready:true`；客户 reject 以 `decisionAt`（缺失/不可解析回落 record `sentAt`/`at`）、judge auto-rework 以 routing `sentAt`/`at` 为进度基线，`flowMtimeMs <= baseline` 不派；`record.lastDispatchedFlowSha256 === 当前 flow sha` 或 `acceptanceLastDispatchAtMs >= flowMtimeMs` 不派；通过后**恰好重派一次** Proof（报告写 vN+1、不覆盖被拒报告），同内容/同进度不重复；不自动 accept/reject。
- **派发谓词收窄（桌面）**：`acceptanceDispatchRecorded`/`acceptanceLastDispatchAtMs` 只认 `stepId:"verification"`，或**旧记录无 `stepId` 且 `targetRoleId:"verifier"`**；`acceptance-criteria` 等其他 verifier 派发不计入；既有 app 写 `stepId:"verification"`（无 targetRoleId）保留。`flowCompletionIssue`（legacy Markdown）保持旧行为并加回归锁；`buildAcceptanceTaskMessage` 新增可选 `previousReportPath`，传新参数时追加「报告必须含 `acceptance-rework/v1` 段」与「写 vN+1」硬要求，旧调用文案逐字不变；新增纯函数 `buildAcceptanceReworkTaskMessage`。
- **judge/客户措辞（运行时核心）**：`request_confirmation`/`request_choice` 的 `declined` 按 `outcome.operatorId` 分流；`judge:*` 写「自动决策未通过/未完成（原因…）；这不是客户拒绝…」，验收卡（`request_choice` + `cardKind:"acceptance"`）额外写明交 Steward/统筹（Convener）返工、等待返工后重新提交验收；客户/通道保持既有「客户拒绝」逐字文案；`notPresented`/`unavailable`/`judgeReceipt`/`notConsented` 不变；不新增工具/schema/字段。
- **i18n 系统行 key（项目管理）**：新增 6 个 `main.governance.acceptanceRework*` key（zh-CN/en-US）：`RoutedCustomer`（仅客户来源写「客户拒绝」）、`RoutedAutomatic`（judge/代批来源写「自动决策未通过/未完成」，不含「客户拒绝」）、`Pending`、`ReportIncomplete`（`{flowId,reportPath,detail}`）、`Failed`、`AuditFailed`；目录 key 数 1236→1242，parity/占位符/取值断言通过；`i18n-guard` 无需更新。
- **`app/main.ts` 接线（S6）**：新增与 `advanceGovernanceFlow` 同模式的可变句柄 `routeAcceptanceAutoRework`，把 `createCustomerInputChannel({onAutoRework})` 的事实交给 `desktop.routeAcceptanceAutoRework(info)`；仅接线，失败只记诊断；不改 preload/IPC 形状。

---

## 七、验证证据

> 全部为 S7 测试角色对**当前候选**的实际执行结果（`verified-by-tests-only`），原始日志在 `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`。

### 7.1 新增 e2e（`s-acceptance-rework-routing.test.ts`）

- **10 tests / 10 pass / 0 fail / 0 skip / 0 todo，exit 0**；连续 **3 次**运行均 10/10（`s7-new-e2e.log`，`duration_ms` ≈ 3846）。
- 覆盖：客户 reject 全链路（路由→Convener→rework done→恰一次重派→accepted 收口）、无 flow 进展不重派、judge auto-rework、报告缺段/坏段、owner 归属与 blocked、Q5 gap、verification dispatched/delivered 重开、accepted 不重开、legacy Markdown（Q6 A）、record 幂等/重启/失败可见。

### 7.2 受影响套件（串行，当前候选）

| # | 套件 | exit | tests | pass | fail | skipped | 日志 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `test/编排/**/*.test.ts` | 1 | 850 | 849 | 1 | 0 | `directed-orchestration.log` |
| 2 | `test/桌面应用/**/*.test.ts` | 0 | 568 | 568 | 0 | 0 | `directed-desktop-app.log` |
| 3 | `test/runtime-core/**/*.test.ts` | 1 | 295 | 288 | 3 | 4 | `directed-runtime-core.log` |
| 4 | `test/项目管理/shared/**/*.test.ts` | 0 | 184 | 179 | 0 | 5 | `directed-project-management-shared.log` |
| 5 | `test/测试/**/*.test.ts` | 1 | 832 | 825 | 1 | 6 | `directed-testing-e2e.log` |
| 6 | `test/装配/**/*.test.ts` | 0 | 84 | 84 | 0 | 0 | `directed-assembly.log` |

- **合计 2813 / 2793 / 5 / 15 / 0**；5 项失败全部为既有 Windows symlink `EPERM`（与 S1 §5.1 逐条一致），无断言失败、无桌面应用套件时序偶发（本轮）。
- 与 S1 差额：编排 +40（S2）、桌面应用 +10（S3）、runtime-core +2（S4）、shared +3（S5）、测试 +10（S7）；失败集合不变（`affected-suites-summary.txt`）。

### 7.3 T3 串行全量回归（最终候选）

- 命令（实际）：`mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"`；清单 **360 个文件**（全部 `.test.ts` 361 个，排除 1 个）；显式排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`（3 个 `test()` 打印 ✔ 后进程不退出），不静默跳过。
- 结果：**exit 1；tests 3790 / pass 3763 / fail 9 / skipped 18 / todo 0 / cancelled 0；327,811.8 ms**（2026-10-23 20:57:19 → 21:02:47 本地）。
- 失败分类：**9 项既有 Windows symlink `EPERM`**（claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core `session-store` 2、`file-write-safety` 1、g4-skill-verify 1、编排 `shell-authorized-routine` 1），与 S1 §6.3(A) 逐条一致；**本变更新增确定性失败 0 项**。
- 对照 S1 基线 **3725 / 3697 / 10 / 18**：文件 +2（`acceptance-rework.test.ts`、`s-acceptance-rework-routing.test.ts`）、tests +65、pass +66、fail −1（S1 的 1 次 `i-full-chain` 桌面生命周期时序偶发本轮未复现）、skip 18 不变；差额归因见 `full-regression-summary.txt`。
- `i-full-chain` 偶发：T3 全量本轮 0 次；整文件隔离复跑 6 次中 3 次出现（`会话尚未开启…`/`会话已关闭…`，open→send/close 竞态），与 S1 §6.3(B)、目录授权 D6、i18n 集成记录同族；**非本变更确定性新增**（`isolated-i-full-chain-run1..6.log`）。

### 7.4 类型检查与构建

| 命令 | exit | 结果 | 日志 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 无诊断 | `typecheck.log` |
| `npm run typecheck:renderer` | **0** | 无诊断 | `typecheck-renderer.log` |
| `npm run build:renderer` | **0** | Vite 构建成功（307 ms）；产物写入 `app/renderer/dist`（gitignore） | `build-renderer.log`、`build-renderer-tree.txt` |

### 7.5 真实 Electron（fresh userData）

- 命令：`ANS_E2E_OUTDIR=<evidence>/electron-e2e-runN node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs`。
- 运行 1/2：exit 0；`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`；证据 `electron-e2e-run1/`、`electron-e2e-run2/`。
- **覆盖边界（如实）**：现有 `main.mjs` 不含本变更新增系统行（客户拒绝/自动决策未通过/报告缺段）的定向断言；本变更未改 `main.mjs`。新增系统行的确定性断言由 S7-A/C/D 与 S2–S5 桌面测试覆盖；Electron 证据用于启动/导入/聊天/卡片/系统行通道不回归。该点记为**未覆盖**，交独立验收判断是否需要定向冒烟。

### 7.6 目标项目只读复算（`ans-gateway`；零写入）

- 复算在临时夹具进行；A 语义（仅 rejected 挡住、移除后 `ready:true`）、B 语义（返工步骤未完成时移除 rejected 仍不 ready）、reopen（dispatched + 旧证据 ⇒ pending/清证据；done ⇒ `acceptance-already-done`）、重派门（`decisionAtMs`/`flowMtimeMs`/`acceptanceLastDispatchAtMs` 比较；同内容 sha 抑制）与报告兜底（report-v1/v2 均 `missing`）均有原始输出（`target-recalc.mjs`、`target-recalc-output.txt`）。
- **零写入证明**：读取命令内 before/after 哈希逐字节一致；复算脚本对四个源文件复制前后 SHA-256 一致（`zeroWrite.unchanged: true`）；`.ans/governance/` 仅 `ledger.jsonl`，**不存在** `acceptance/` 路由记录目录；目标不是 git 仓库，无本角色新增文件。
- 复算只证明新逻辑在复制快照上按门动作，**不等于目标项目已修复**；现场外部漂移与未结算决定见 §八。

### 7.7 S2–S5 定向计数（角色自测，供交叉核对）

| 阶段 | 命令/结果 |
| --- | --- |
| S2 | `test/编排/{flow-state,flow-service,acceptance-rework}.test.ts` 122/122；`test/编排/**` 850/849/1（既有 EPERM）；typecheck 0 |
| S3 | acceptance-dispatch 44/44；interface 120/120；operator-wiring 54/54；桌面套件 568/568；typecheck 0 |
| S4 | tools 13/13；相邻 runtime-core 52/52；相邻 e2e 13/13；typecheck 0 |
| S5 | shared 184/179/0/5；typecheck 0；i18n 集成补充 8/8 |

### 7.8 证据完整性

- S7 证据 manifest `sha256.txt` **92 行**、SHA-256 `8d5f48cd1e5d2d8e12bc244b59e65ca4516308810233e2fe2c0e419fe648abca`，含 `candidate-hashes.txt`、`s7-new-e2e.log`、`directed-*.log`、`full-regression-serial-excluding-write-sequencing.log`（约 995 KB）、`full-regression-summary.txt`、`isolated-i-full-chain-run1..6.log`、`typecheck*.log`、`build-renderer*`、`electron-e2e-run1/2/`、`target-project-snapshot.txt`、`target-recalc-output.txt`、`structural-checks.txt`。
- 各角色记录与证据在各自 `docs/change/`；这些是管理记录，不是产品候选哈希。

---

## 八、目标现场与残余风险

### 8.1 `ans-gateway` 当前只读快照（2026-10-23 21:07–21:15 +0800）

| 文件 | SHA-256 | 字节 | 行数 |
| --- | --- | --- | --- |
| `docs/flows/ai-governance-pipeline.yaml` | `bd057b1d3157851cc68ba26a4f54fa726b112c55dd9e7b7c5fd9169186054163` | 22,551 | 671 |
| `.ans/governance/ledger.jsonl` | `bdafbf45ad1444c6b6d15fc1b25654c86b65fd9035a9c2e4eeef3cf18f218564` | 484,243 | 751 |
| `docs/acceptance/…-report-v1.md` | `0106dc8092fec6f7bf14b96aac6d2e07f0d0023b9136e5cd7335c7c9df04c801` | 21,897 | 163 |
| `docs/acceptance/…-report-v2.md` | `d0df0789ae3a01ad8955165417e287186cb13b573206ea5224fc0d33433d9d32` | 15,288 | 150 |

- flow：**59 步**（done 18 / superseded 40 / pending 1 `verification`）；ledger：**751 条、0 坏行**（customer.decision 121 / artifact.observed 547 / dispatch.accepted 79 / intent.handed-off 4）。
- 唯一 acceptance 决定：第 368 行 `2026-10-23T08:05:01.066Z` `rejected`（`decisionEvidence.kind:"customer-input"`）；最近 `stepId:"verification"` 的 verifier 派发：第 359 行 `08:01:26.084Z`；两版报告均无 `acceptance-rework` 段（0 次）。
- **与 S1 对照（外部漂移）**：S1 为 flow `0805213a…`/40 步、ledger 530 条；S7 已漂移到 `bd057b1d…`/59 步、751 条；报告 v1/v2 哈希未变。漂移来自目标项目外部操作（另一会话/人工），**不是本变更写入**。本包写盘前只读复核（21:14）与 S7 哈希一致，**S7 之后未再漂移**。
- **零写入**：本变更未在目标根执行任何写命令；S7 的 before/after 哈希一致；目标 `.ans/governance/` 无 `acceptance/` 路由记录目录。

### 8.2 目标账本第 646 行的未结算决定（重要，交独立验收/目标侧）

- 第 **646** 行：`at=2026-10-23T12:08:21.756Z`、`kind:"customer.decision"`、`actorRoleId:"rapporteur"`、`power:"proposal"`、`decisionKind:"unclassified"`、`customerDecision:"none"`、`decisionEvidence.kind:"customer-input"`、`messageSummary:"确认冻结契约 v3 docs/contracts/ai-governance-pipeline-contract-v3.md"`。
- 按**既有未结算决定口径**（本变更未改），`evaluateFlowCompletion` 对现场形态 `allowRejectedAcceptance:true` 仍返回 `ready:false`（「该流程仍有未结算的决定」）。因此**升级后目标项目会先路由 Convener，但不会立即自动重派 Proof**，直到该决定被核对/结算（或迁移/补证）。
- **这不是本变更缺陷**：P1 明确「未结算决定继续挡收口」；A 语义（无该决定）复算通过。但它改变了「升级后允许一次重派」的现场预期，**必须由目标项目 Convener/统筹记录处置**，不能把目标项目未恢复归因于本变更测试失败。

### 8.3 残余风险与已知边界（如实）

1. **legacy Markdown 不自动重派（Q6 A）**：历史 rejected legacy 流程保持旧行为（任意 acceptance 决定终结），需迁移 YAML 才能进入新语义；已由 S7-I 回归锁定。
2. **目标报告缺结构化段**：目标 report-v1/v2 均无 `acceptance-rework/v1` 段，升级后只能走「报告不完整」人工兜底（无 items、不建 flow 步骤），需 Convener 读报告或要求 Proof 补段；重派任务要求 vN+1。
3. **真实 Electron 未做新系统行定向断言**：`main.mjs` 未改、未新增定向冒烟；交独立验收判断是否追加。
4. **`i-full-chain` 既有偶发**：open→send/close 竞态；T3 全量本轮未复现，隔离复跑 6 次中 3 次出现；非本变更确定性新增，也不掩盖。
5. **Q5 gap**：没有可 supersede 的旧步骤时应用 fail-closed（记录 gap、请 Lead/Proof 补 flow 计划），不凭空建 `rework-*`；O1（app-only addFlowStep）未做。
6. **Q13 report-v2 登记**：升级前把 report-v2 以既有 `dispatch.accepted` 登记是**目标项目侧/客户决定**，不是本产品写入；未登记则按「允许一次重派」预期，目标侧可接受一次重复；本变更不写目标项目。
7. **共享文件候选隔离**：`interface.ts`、`governance-advance.ts`、`customer-input.ts`、`app/main.ts`、messages、`fixture.ts`、`operator-wiring.test.ts` 等整文件哈希含 i18n/目录 v3/治理写卡既有 hunk；本包只对本变更 hunk 负责，不为它们背书。
8. **record 的「sent 更新」写失败**：任务可能已发出但 record 仍 pending；本进程用内存 sent 集合兜底，重启后可能重复一次 Convener 任务（不是 Proof 派发）；账本审计与后续重派仍由 ledger 去重（桌面记录 §9.2）。
9. **审计 best-effort（Q10 A）**：`dispatch.accepted(app→convener)` 失败不阻塞路由，但会留下审计缺口（系统行可见、不伪造）；未实现严格「先审计后发送」。
10. **候选代码变化不可见**：应用只以 flow 内容/mtime 更新为返工进展信号；Convener 未把返工/证据登记进 flow 时不会重派——任务文本已要求登记。
11. **owner 特殊归属**：`verifier` 与内置治理角色不接收产品返工；`app`/`customer`/未知 owner blocked；部分返工需报告方拆项/补证。
12. **未提交/未推送/未发布**：候选只在工作区；验收通过也不自动授权提交或发布（客户授权明确排除 commit/push/发布/目标项目写入）。v1.7.0 发布前需本变更独立 T3 验收。

---

## 九、候选复算命令与验收注意事项

### 9.1 复算命令

```bash
cd C:/Users/51054/Desktop/work/ans-studio
git rev-parse HEAD                      # ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1
git diff --cached --name-only           # 应为空（0 项）
git status --short                      # 工作树未提交；本包写盘后 226 项（含本包自身）

# 对 §三 的 21 个路径逐个复算（示例；可按表格顺序放入文件后循环）
git hash-object -- "src/common/编排/flow-state.ts"
sha256sum -- "src/common/编排/flow-state.ts"
# ... 其余路径同法；新增文件同样可算

# 候选稳定性快照（21 行，按 §三顺序；输出整体 SHA-256）
# 每行：<git hash-object>\t<sha256sum>\t<new|modified>\t<path>
# 期望：30deb89efd694cb4d4768fcaf6a1da1024e8217ffacc728a837fe3ce5d82f97e
```

### 9.2 验收注意事项（引用标准 v1，尤其 §八）

1. **P 编号映射（标准 §3.0 / §八.1）**：本标准 P1–P12 与方案 §8.6、团队计划 §5.2 的编号不完全一致。关键对应：**方案 §8.6 P4（措辞）→ 标准 P3.4**；**方案 §8.6 P7（verification 重开）→ 标准 P4.4**；方案 P9 拆入标准 P3/P4/P5/P6/P7/P9；方案 P10 并入标准 P11.4 + P6/P9；方案 P11 → 标准 P9+P10。变更包与报告须同时引用标准 P ID 与方案行号，避免把「方案 P4/P7」误读为缺失（标准 §八.1/§八.3）。
2. **状态头已知漂移（只报告，不改写）**：团队计划文件头/§1.5/§九仍写「闸门 2 未确认、实施授权未给」；方案文件头仍写「草案 v1（待闸门 1 方案确认）」；验收标准文件头的「实施授权尚未取得」是写标准时（实施前）的事实。现行授权事实以沟通记录（76 行；`b4bc67b7…`）为准；标准/团队计划正文冻结（哈希见文首），不因状态头过期视为未确认（标准 §1.1/§八.2）。沟通记录本身也从 69 行 `9a904f43…` 追加为 76 行 `b4bc67b7…`，原因是其后追加闸门 2 与实施授权记录。
3. **`acceptanceLastDispatchAtMs` 精确谓词（标准 §八.4）**：只认 `stepId:"verification"`，或**旧记录无 `stepId` 且 `targetRoleId:"verifier"`**；app 写的 `stepId:"verification"`（无 targetRoleId）必须保留；`acceptance-criteria` 等其他 verifier 派发**不得**计入。S3 测试含正/负例（桌面记录 §3.4/§4）；若判定发现实现采用不同谓词，按方案实质变更处理，不静默接受。
4. **T3 全量口径（标准 §八.5）**：实际命令为串行 `node --test --test-concurrency=1 "${FILES[@]}"`，显式清单排除 `test/pi-adapter/write-sequencing.test.ts`；验收核对命令、排除方式、360 文件清单与 `3790/3763/9/18` 计数；`skip`/`todo` 不计通过。
5. **Node/npm 环境（标准 §八.9）**：默认 shell PATH 不含 Node；取证需前置 `C:/Users/51054/AppData/Local/Programs/nodejs` 并记录版本（S7 用 Node v24.22.1 / npm 11.19.1）；命令不可执行按 `insufficient evidence`，不写成通过。
6. **目标现场漂移与 Q13（标准 §八.6/§八.7）**：判定时必须重新只读复制并记录当时哈希，不能沿用本包 §8.1；升级后允许一次重派，report-v2 登记是目标侧/客户决定，不是产品行为；不得把目标现场未恢复算作本变更失败。
7. **`test/桌面应用/` 与 `app/main.ts`（标准 §八.8/§八.13）**：`test/桌面应用/` 逐文件授权、不得新建文件（本包已核 `git status` 无 `??`）；`app/main.ts` 按权威 Section 1 与闸门 2 属**桌面窗口**、仅接线，不按方案原标签判装配越界。
8. **i18n 措辞断言（标准 §八.11）**：6 个系统行 key 的 zh/en 都需断言；judge 来源不得出现「客户拒绝」（测试先剔除「这不是客户拒绝」再断言），客户来源必须出现「客户拒绝」；不得只测 key 存在或只测中文。
9. **新增 e2e 文件命名（标准 §八.12）**：实际文件为 `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`（`n-` 已被既有用例占用）；标准只要求目录/授权正确。
10. **报告/验收独立性（标准 §八.14）**：本变更结论不得引用 i18n/目录 v3/治理写卡门禁的验收结论，也不得为其背书；v1.7.0 发布记录中分开登记；报告由内置独立验收写 `docs/acceptance/acceptance-rework-routing-report-v1.md`，统筹不改结论。
11. **混合文件责任（本包 §2.1）**：整文件哈希含其他变更；验收只核本变更 hunk（对照 S1 基线哈希与角色记录中的写集/diff），无法区分时按标准 §2.1 要求补充说明，不把整文件算本变更或整文件算既有。
12. **未判定**：本包不写 `docs/acceptance/`，不判定 P1–P12，不声称通过/返工/证据不足。

---

## 十、状态声明

- 本文件是**提交给内置独立验收的候选变更包**，状态「实施与测试完成，待独立验收（I10）」；**不是验收报告**，不判定通过、返工或证据不足，不声称本变更或任何变更已验收、已发布。
- 候选只对当前工作区内容有效；任何产品/测试文件变化会使受影响证据失效（标准 §2.3），需重新基线/复算。
- 未 commit、push、merge、release；未写 `.ans` 治理状态作为产品候选；未写 `ans-gateway` 或任何目标项目；未改角色卡/边界/方案/标准/团队计划/沟通记录/验收报告；未新增角色工具、枚举或依赖。
- 本变更与 i18n、目录 v3、治理写卡门禁**分别实施、分别验收、分别报告**，不合并判定，不互相引用结论背书；纳入 v1.7.0 发布前独立 T3 验收。
