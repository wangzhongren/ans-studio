风险档位：T3｜判定依据：客户闸门 0/1/2 与实施授权（`docs/communication/2026-10-23_intent_acceptance-rework-routing.md`，76 行，SHA-256 `b4bc67b7be66c3f1760cb9ad42e0f62b7430c3d942cbfeb02c2fe16234502bec`，blob `a3649668fbdb6cde70007894cf738d45d0696068`）+ 客户闸门 1 确认的策划方案 v1（`docs/planning/2026-10-23_design_acceptance-rework-routing.md`，951 行，SHA-256 `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5`，blob `92f88c03bdfdc0683e81a07392c0d4975bcbe28a`）+ 验收标准 v1（`docs/acceptance/acceptance-rework-routing-criteria-v1.md`，961 行，SHA-256 `b62746e9696eb4103718c46386878d7d34a785e5481803749de930128b5de481`，blob `88d2e542cad573ba14290eff871860b2b8d25a40`）+ 团队计划 v1（`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`，389 行，SHA-256 `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab`，仅作范围、写集、阶段与证据口径依据）+ 技能 `references/testing.md` 的 T3 定义｜选定检查：21 个产品/测试候选逐路径 `git hash-object` + `sha256sum`（21/21 一致，0 mismatch；稳定性快照 21 行 `30deb89efd694cb4d4768fcaf6a1da1024e8217ffacc728a837fe3ce5d82f97e`）；复用 S7 对同一候选的 T3 串行全量（360 文件，3790/3763/9/18，排除 `test/pi-adapter/write-sequencing.test.ts`）、受影响套件（2813/2793/5/15）、真实 Electron（2/2 `E2E_PASS`）、typecheck/typecheck:renderer/build（0）、新增全链路 e2e（10/10×3）；本次定向复跑编排 122/122、`acceptance-dispatch` 44/44、`tools` 13/13、`i18n` 37/37、新增 e2e 10/10；目标 `ans-gateway` 只读复算（独立脚本，A/B 语义、reopen、重派门、报告兜底、零写入）｜复用证据：S1–S7 记录/证据（同一 HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`、21/21 候选哈希一致、Node v24.22.1/npm 11.19.1/Windows 11、同命令同夹具；S7 记录状态 `verified-by-tests-only`，manifest 92 行 `8d5f48cd1e5d2d8e12bc244b59e65ca4516308810233e2fe2c0e419fe648abca`）；不引用 i18n、目录 v3、治理写卡门禁或 v1.7.0 发布的验收结论，也不为其背书｜全量回归：已执行（S7 于当前候选 2026-10-23 20:57:19–21:02:47，3790/3763/9/18，9 项均为既有 Windows symlink EPERM，0 项本变更确定性新增；本次未重跑全量，按同候选复用并复核原始日志与计数）｜结论：通过

# 独立验收报告：验收返工自动路由与 rejected 重新派发（acceptance-rework-routing）

- 任务 ID / 产品 flowId：`2026-10-23-acceptance-rework-routing` / `acceptance-rework-routing`
- 日期：2026-10-23｜角色：内置独立验收（独立子代理上下文，非沟通/统筹/开发/测试）
- 验收基线：客户闸门 1 确认的方案 v1（Q1–Q13 按推荐 A；O1–O4 不做）；判定标准为本报告引用并判时复算的 `acceptance-rework-routing-criteria-v1.md`（v1）
- 候选：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a834f31588797016d6ee2289a4ac3e97b`）+ 工作区未提交、未暂存的 21 个产品/测试候选
- 结论：**通过**（只对当前候选有效；不授权提交、推送、合并、发布，也不声称目标项目已修复）
- 报告路径：`docs/acceptance/acceptance-rework-routing-report-v1.md`（本文件；不是标准，不是客户确认记录）

---

## 一、总体结论

按验收标准 v1 逐项判定，P1–P12 全部适用行 **pass**，G1/G2 **pass**；未发现 fail 行，也未发现必须判 `insufficient evidence` 的整行缺证。结论为 **通过**。

通过的含义仅为：**当前工作区候选**在标准 v1 与客户确认的方案 v1 下，已有原始执行输出/文件原文/只读复算覆盖所要求的行为，且证据对应当前候选。它不授权 commit、push、合并、发布或任何对外操作；不改变客户最终 accept/reject 权力；不表示 `ans-gateway` 已恢复。v1.7.0 发布前仍需以本结论（或候选变化后的新结论）作为独立 T3 验收依据，并与 i18n、目录 v3、治理写卡门禁、发布事实分开登记。

---

## 二、候选身份与独立复算

### 2.1 仓库身份（判定时实测）

| 检查 | 实测值 |
| --- | --- |
| `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`main`） |
| `git rev-parse HEAD^{tree}` | `1149238a834f31588797016d6ee2289a4ac3e97b` |
| `git diff --cached --name-only` | 0 项（无暂存） |
| `git status --short` | 226 项（工作树含本变更前既有 i18n、目录 v3、治理写卡门禁等未提交改动与未跟踪管理记录；条目不等于候选数） |
| 最近提交 | `ee59296 docs(release): record v1.6.0 published assets and checksums`；无本任务提交/推送 |
| `git status --short -- test/桌面应用` | 仅既有文件 `M`，**无 `??`**（未新建文件） |
| `git status --short -- app/renderer/dist` | 0 项（构建产物被 gitignore） |

### 2.2 21 个产品/测试候选逐路径复算

复算命令：对变更包 §三的 21 个路径逐个 `git hash-object -- <path>` + `sha256sum -- <path>`，并按 §三顺序生成 `<git hash-object>\t<sha256sum>\t<new|modified>\t<path>` 快照。结果：**21/21 与变更包逐项一致，mismatch = 0**；快照 21 行、整体 SHA-256 `30deb89efd694cb4d4768fcaf6a1da1024e8217ffacc728a837fe3ce5d82f97e`，与变更包 §四一致；相对 HEAD **6 new / 15 modified**，其中本变更新建 3 个、既有文件追加 18 个，与变更包计数一致。

| # | 路径 | `git hash-object` | `sha256sum` | 相对 HEAD |
| --- | --- | --- | --- | --- |
| 1 | `src/common/编排/flow-state.ts` | `723f34659101f80f757b0e3ead74560a17c3770d` | `ea271ee88067b0b2bcf67576141f09dd6efaa0e2a78f01e66b2ebdb74148bd4a` | modified |
| 2 | `src/common/编排/flow-service.ts` | `8d783e991b885c6d72b7e269c8e9f1a012c9be1a` | `29cd83f99fd0e7d73801c76dc0f70921704dbfd5f37e3f65820c0de7c5213919` | modified |
| 3 | `src/common/编排/acceptance-rework.ts` | `45843ef4bb2ff0c338ce89219e116ede21f9d9d6` | `a8598588cda2d3a805c2879c5381870184a0973cb68e8b3a893ff40048ea9559` | new（本变更新建） |
| 4 | `src/pipeline/orchestration/flow-state.ts` | `bb6963db1c716e99b8e956ca0711ac1fb545cd1b` | `96966286ca48e5356d39bb2e825b424aec7b7c3022bb8a321d98c3be715f59dc` | modified |
| 5 | `test/编排/flow-state.test.ts` | `43cc48ab169d27f2a2fdf25c12093bad07574a3d` | `3efba1b9e5fabf08f029b6cfa8d5abf27a4c56d423b730014c92b953c6f05ea8` | modified |
| 6 | `test/编排/flow-service.test.ts` | `6aa7af358bc71ad4771998eac070d98a1fdf4e56` | `eef623a4bace3206bcfc225d1fb522b326e4a871f2bc0bd7d32fcb9c1a794342` | modified |
| 7 | `test/编排/acceptance-rework.test.ts` | `9c3ec88ce070015190b13f847b2b25dcc641a455` | `99735a3123ef6e4f0cec474ae766f560e96a98692e2c6789e422285cbce70fb1` | new（本变更新建） |
| 8 | `app/desktop/customer-input.ts` | `987c090dd935a08ce83c88084e042379a928f150` | `dd709a41b8e8307570814c346542218674ba996af65300f31c1ceea96168b186` | modified |
| 9 | `app/desktop/interface.ts` | `a49a84c85a431648fdd2fa58ea11e07b2ee3bcfb` | `20e9b545eb3a41faa24a4269aad863ec331885173ce9a8d9599f952d719139bf` | modified |
| 10 | `app/desktop/governance-advance.ts` | `3ca76030a5b310dbe0c11776fa937206bda759b9` | `3a75af8c4a111e75930df25acc1417fca5013dbbbd2b2208623a3123206a5947` | modified |
| 11 | `app/main.ts` | `b7801bc06e83187b35b373ee7986743eea96b1ed` | `cc7982ea7156e2b55d2f434b1e3aa0fb1c61372aeeca50cd8b5a25f771346342` | modified |
| 12 | `test/桌面应用/acceptance-dispatch.test.ts` | `b9eea6669f6fe44a7bed563e9b07bb3a3f42d34e` | `cb6b78133aa35a8d6f4f0abe0c8b03a39a35fec163cc212533ca5462a823f1f8` | modified |
| 13 | `test/桌面应用/interface.test.ts` | `1e545367e512b3d2cf740ee531eefe2b9757e884` | `c01a060e94703e71e8e043995285ae113151a86b6afe9e24faac4bbd3805a575` | modified |
| 14 | `test/桌面应用/operator-wiring.test.ts` | `65f358a2fbaf3d7d799175709628b8fb121bf5c1` | `326c9156819126b6dbe58669f0bb73ea439228f9c6b3fd7fe55cdfded3dbac8a` | modified |
| 15 | `src/provider/runtime/tools.ts` | `2a7983459249aff27b1ba43193d07d8cf7c72658` | `b3bc52c45042c7493b8ed9e122654513481f67f7877e4d551a6e0479e88153a1` | modified |
| 16 | `test/runtime-core/tools.test.ts` | `467ef81cb045a805803edeb356cc0c589cb97a1b` | `c7db7e1f5db919b2f9a61c8c15f97ab9b5c8afd54e82c3d8f960cbc005f5ad94` | modified |
| 17 | `src/common/shared/i18n/messages/zh-CN.ts` | `c0501469ed8b8631e63ba124f419aa642a034400` | `d487a8d4853004daea619a82b2d760ff3218d6fd1015f1c29623d2ae15953e4e` | new（HEAD 无；i18n 既有未提交，本变更 +6 key） |
| 18 | `src/common/shared/i18n/messages/en-US.ts` | `74ab4a7d654143b20b6614d7508f48da67c211cc` | `05089d70b7b1e0ee720d619efb57aa8d305b7b8f004f4be66144476257e4b373` | new（同上，+6 key） |
| 19 | `test/项目管理/shared/i18n.test.ts` | `26501c142dbd2c03bd6db6e135a0a29da8d46a3b` | `d8e7567797d9a324e1e2f9889b84758c81ac1b6df76f98b63c2c652f3bebac97` | new（HEAD 无；i18n 既有，本变更 +3 用例） |
| 20 | `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | `1cc677239100e763383a8edeb2d4d86b8774a5ba` | `931001895808f889b1b3abbd2eff5e6dcce85fa7a6bfb2007ef9fb73d191d5ae` | new（本变更新建） |
| 21 | `test/测试/governance-e2e-auto/fixture.ts` | `336177aeca57bab33aea6741eb9df532d63bc1c9` | `2e4e571aa4b8aeae9da21ab59323e45b83b23c94d6fec307a226fde019ad7e71` | modified（含既有上下文；本变更 +可选钩子） |

### 2.3 非候选与边界文件

- `test/桌面应用/e2e/main.mjs`：`git hash-object 142e0f18d7701964053d97c6412d38809684c329` / SHA-256 `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b`，与 S1 基线**逐字节一致**，**不是本变更候选**（本变更只把它作为真实 Electron 运行证据，未改其断言）。
- `test/桌面应用/`：无未跟踪文件（`git ls-files --others --exclude-standard -- test/桌面应用` = 0），满足逐文件授权与“不得新建文件”。
- 方案/团队计划/沟通记录/标准/S1/S7/变更包哈希复核：方案 951 行 `9ceea642…`、团队计划 389 行 `d95fc817…`、沟通记录 76 行 `b4bc67b7…`、标准 961 行 `b62746e9…`、S1 基线 334 行 `bcd5ddfc…`、S7 记录 211 行 `841588b8…`、变更包 309 行 `8c6684c6e74236bb3696984c4e95ae793a6d4a5f4c4e7996dfa41be0d4e0c87a`；均与文件头/任务引用一致。S2–S5 记录 142/146/110/110 行，哈希 `6af40626…` / `a283f78c…` / `8b2c228b…` / `7b2aba99…`，与变更包一致。

---

## 三、候选隔离、写集与非目标（G2 / P11 事实）

### 3.1 混合文件只认本变更 hunk

以下文件在工作树中含 i18n（T2）、目录级授权 v3（T3）、治理写卡推进（T3）的既有未提交内容；本报告只对本变更 hunk 负责，**不替其他变更或其余 hunk 背书**：

`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts`、`app/desktop/customer-input.ts`、`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`app/main.ts`、`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts`、`test/桌面应用/{acceptance-dispatch,interface,operator-wiring}.test.ts`、`test/测试/governance-e2e-auto/fixture.ts`（整文件哈希含既有内容）。本变更 hunk 的可核对锚点：`latestAcceptanceDecision`/`evaluateFlowCompletion({allowRejectedAcceptance})`/`completeAcceptanceStep` 最新 accepted/`reopenAcceptanceStepForRework`/`acceptance-rework.ts`；桌面 `routeAcceptanceRework`/`routeAcceptanceAutoRework`/routing record/重派门/系统行/`acceptanceLastDispatchAtMs` 收窄/`buildAcceptanceReworkTaskMessage`；`onAutoRework` 接线；`declined` 措辞分流；6 个 `main.governance.acceptanceRework*` key 与 3 个用例。

### 3.2 S1 基线内容对账（隔离的强证据）

- S1 `worktree-during-full-run.txt` 记录 `src app test` 范围 **114** 条路径；判定时 `git status --porcelain -- src app test` 为 **121** 条。
- 逐路径集合比较：相对 S1 **新增 7 条路径，全部是 21 候选**（`src/common/编排/acceptance-rework.ts`、`src/common/编排/flow-state.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/tools.test.ts`、`test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`、`test/编排/acceptance-rework.test.ts`、`test/编排/flow-state.test.ts`）；**无删除路径，无非候选新增路径**。
- S1 `worktree-hashes-end.txt`（114 条，含 2 个目录）逐文件 SHA-256 比较：**100 个文件逐字节一致**；**12 个变化文件全部属于 21 候选**（customer-input、governance-advance、interface、main、flow-service、pipeline flow-state、acceptance-dispatch/interface/operator-wiring 测试、fixture、flow-service 测试、i18n 测试）；2 个目录条目（i18n 目录）跳过逐文件比较，但其下 `zh-CN.ts`/`en-US.ts` 已按候选复算。**结论：自 S1 以来，`src app test` 内除 21 候选外没有任何文件内容变化**，即本变更未把其他变更的改动混入候选，也未新增范围外产品/测试改动。
- 角色卡：`角色卡/桌面窗口/boundary.{md,yaml}`、`角色卡/编排/boundary.{md,yaml}` 当前 SHA-256 与 S1 `boundary-preflight.txt` 一致；工作树中其余 `角色卡/**` 已跟踪修改（api-spec/changelog/memo/boundary 等）的 mtime 均早于 S1（最晚 17:40:26），不是本变更写入；本变更只新增各角色 `docs/change/` 管理记录与证据。

### 3.3 非目标/范围外核对

- `package.json`/`package-lock.json` 无 diff；`vite.config.ts`、`tsconfig*`、`electron-builder.yml`、发布配方、版本号无本变更改动；`app/renderer/**`、`app/preload.cjs`、`src/model/**`、`src/common/编排/governance-ledger.ts`、`src/common/门禁引擎/governance-roles.ts`、`docs/flows/` 的工作树改动均为既有其他变更上下文（S1 已存在；本变更 21 候选不含这些路径，且 S1 内容对账显示无新增变化）。
- 无新增 `FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`/`cardKind`/验收保留 id；`FLOW_STEP_KINDS` 仍为 `dispatch`/`customer-decision`/`artifact`/`acceptance` 四项；`reopenAcceptanceStepForRework` 只经 `src/pipeline/orchestration/flow-state.ts` 导出并由桌面消费，未注册为角色工具（测试断言 `run-role.ts`/`model/runtime.ts` 无该能力）；无 `addFlowStep`/`flow_step_add` 引用。
- `app/desktop/{interface,governance-advance,customer-input}.ts` 与 `app/main.ts` 未直接 import `src/common/编排/**` 私有实现或 `src/provider/runtime/**`；桌面经 Pipeline 公共出口消费。`app/main.ts` 的 S6 hunk 仅为 `onAutoRework` 可变句柄与回调接线（及其同文件既有 i18n 上下文），不放业务逻辑。
- 未暂存、未提交、未推送、未合并、未发布；无 `.ans/project.json`/task_ops 伪造。

---

## 四、证据核对（S1–S7、T3、Electron、目标复算）

### 4.1 记录与 manifest

- S1 基线记录：334 行，SHA-256 `bcd5ddfcaac4f9f4eadda5763084fef44be3d2e74c5cf4e5948ab576e03305a8`；其证据目录含 `worktree-*`、`target-hashes.txt`、`target-project-snapshot.txt`、`full-regression-summary.txt` 等。
- S2/S3/S4/S5 记录：哈希与变更包一致（见 §2.3）；各角色证据目录存在（8/9/8/7 个文件）。
- S7 记录：211 行，SHA-256 `841588b8fb0c3eb58a1cde58efe619f8ca27c90ec282e86d3526cc0cd2b4e009`，状态 **`verified-by-tests-only`**（不是验收结论）；证据 manifest `sha256.txt` 92 行、SHA-256 `8d5f48cd1e5d2d8e12bc244b59e65ca4516308810233e2fe2c0e419fe648abca`，逐条 `sha256sum -c` **92/92 OK**。
- 变更包：309 行、SHA-256 `8c6684c6e74236bb3696984c4e95ae793a6d4a5f4c4e7996dfa41be0d4e0c87a`；含任务/flowId、候选哈希、HEAD、路径、S1–S7、证据链接、T3、复用/失效说明、标准版本/哈希、未解决问题；状态“待独立验收”，非报告、不预判。

### 4.2 T3 全量回归（S7 原始日志，同候选复用）

- 命令（实际）：`mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"`；清单 **360** 个文件（361 个 `.test.ts`，排除 1 个）；显式排除 `test/pi-adapter/write-sequencing.test.ts`（已知挂起：3 个 `test()` 打印 ✔ 后进程不退出；S1 同处置），不静默跳过；清单中 `write-sequencing` 出现 0 次。
- 结果：**exit 1；tests 3790 / pass 3763 / fail 9 / skipped 18 / todo 0 / cancelled 0；327,811.8 ms**（2026-10-23 20:57:19 → 21:02:47 本地）；原始日志 `full-regression-serial-excluding-write-sequencing.log`（SHA-256 `22855e337f9c405992129e81dfff5a65d8857cd2ac18d7060f34b1495c3b8215`，约 995 KB），摘要 `full-regression-summary.txt`（`982fde9a…`）。
- 失败分类：**9 项全部为既有 Windows symlink `EPERM`**（claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core `session-store` 2、`file-write-safety` 1、g4-skill-verify 1、编排 `shell-authorized-routine` 1），与 S1 §6.3(A) 逐条一致；日志中 `EPERM: operation not permitted, symlink` 出现 9 次、失败用例标题 9 个；**本变更新增确定性失败 0 项**。18 skip 与 S1 逐条一致；无新增 skip/todo。
- 对照 S1 基线 **3725 / 3697 / 10 / 18**：文件 +2（两个新增测试文件）、tests +65、pass +66、fail −1（S1 的 1 次 `i-full-chain` 时序偶发本轮未复现）、skip/todo 不变。`i-full-chain` 偶发：T3 全量本轮 0 次；整文件隔离复跑 6 次中 3 次出现（open→send/close 竞态），与 S1/目录授权 D6/i18n 集成记录同族，**非本变更确定性新增**，已在 S7 记录如实分类。
- 复用有效性：候选 21/21 哈希与 S7 生成时一致、HEAD/Node/npm/OS/命令/排除清单/夹具/环境一致；T3 日志对应当前候选；本次未重跑全量，未把旧候选证据用于新候选。

### 4.3 受影响套件与定向复跑

- S7 受影响套件（串行）：编排 850/849/1/0、桌面应用 568/568/0/0、runtime-core 295/288/3/4、项目管理/shared 184/179/0/5、测试域 832/825/1/6、装配 84/84/0/0；合计 **2813/2793/5/15/0**；5 项失败全部为既有 EPERM，与 S1 逐条一致（`affected-suites-summary.txt` `ce31273b…`）。
- 本次抽样复跑（同一候选，只读临时根，未改产品/测试）：
  - `node --test --test-concurrency=1 test/编排/acceptance-rework.test.ts test/编排/flow-state.test.ts test/编排/flow-service.test.ts` → **122/122 pass，exit 0**（2026-10-23 21:22 本地）；
  - `node --test --test-concurrency=1 test/桌面应用/acceptance-dispatch.test.ts` → **44/44 pass，exit 0**；
  - `node --test --test-concurrency=1 test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` → **10/10 pass，exit 0**（与 S7 `s7-new-e2e.log` 10/10×3 一致，`38f4849e…`）；
  - `node --test --test-concurrency=1 test/runtime-core/tools.test.ts` → **13/13 pass，exit 0**；
  - `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts` → **37/37 pass，exit 0**。
- 断言未弱化：`test/桌面应用/acceptance-dispatch.test.ts` 相对 HEAD 删除 18 行、无删除测试标题；旧的“rejected ⇒ 已有验收决定 ⇒ 不派 verifier”用例按 Q1 **替换**为 legacy 行为用例（无 YAML + rejected 保持旧行为），新语义由新增用例覆盖；`accepted ⇒ 收口/不重派`、`无新进展 ⇒ 不重派` 负例保留。`test/编排/flow-*` 无删除测试标题；`tools.test.ts` 无删除行；既有 11 例保留，新增 2 例（13/13）。

### 4.4 类型检查/构建与真实 Electron

- `npm run typecheck` exit 0（`typecheck.log` `2a7fdd65…`）；`npm run typecheck:renderer` exit 0（`typecheck-renderer.log` `3fbbc6a3…`）；`npm run build:renderer` exit 0（Vite 307 ms，产物写 `app/renderer/dist`，gitignore；`build-renderer.log` `9d3ee655…`）。三条命令均对当前候选（与 S7 同一候选）。
- 真实 Electron（fresh userData）：运行 1/2 均 exit 0；`report.txt` 末行 `E2E_PASS=true`、`E2E_FAILURES=`（空）、`E2E_DONE=1`（run1 `f095aeed…`、run2 `e8fac0d5…`；截图/诊断在 `electron-e2e-run1/`、`run2/`）。**覆盖边界如实**：现有 `main.mjs` 不含本变更新增系统行（客户拒绝/自动决策/报告缺段）的定向断言，本变更未改 `main.mjs`；系统行内容由 `acceptance-dispatch`/`interface`/`operator-wiring`/新增 e2e 的确定性断言覆盖，Electron 证据用于启动/导入/聊天/卡片/系统行通道不回归。标准 P9 只要求对当前候选运行并记录 `E2E_PASS`（定向冒烟为“可最小追加”，非强制），故不据此判 fail；该边界保留在 §六。

### 4.5 目标项目只读复算（`ans-gateway`；零写入）

判定时目标现场**仍在被外部操作持续改动**（非本验收写入）。依次只读观测到：

| 时点（本地） | flow | ledger | 说明 |
| --- | --- | --- | --- |
| S7 快照 21:07:30 | `bd057b1d3157851cc68ba26a4f54fa726b112c55dd9e7b7c5fd9169186054163`，22,551 B，671 行，**59 步** | `bdafbf45ad1444c6b6d15fc1b25654c86b65fd9035a9c2e4eeef3cf18f218564`，751 条 | S7 记录值；报告 v1/v2 未变 |
| 本次首次 21:20:37Z | 同上 59 步 | `c658589aea1db9119ea964b56a69c8c78ab8f789fa3c35735135a0131f61ba33`，759 条 | 外部漂移；A/B 复算通过 |
| 本次二次 21:22 | `635d353b8baa5a18b868ee8583bad707d49f07421b1e91f899d830f524e0cca6`，24,010 B，703 行，**63 步** | `7fa0251da0aa7c476be922bfb6564a4de56653def86317f3dc6218564d9d9a73`，760 条 | 外部漂移；新增 pending rework/change-package 步骤 |
| 本次最终 21:27:40Z | `f32fdfbfe4ece2eece6d9e2f2f37f35c7e4bd190c986bcd8a44eb366d73aee1b`，25,043 B，738 行，**63 步**（14 done / 44 superseded / 1 dispatched / 4 pending） | `17453bb97b49dbf100dc1143e4398047029e53361a5665cc87d382e3c7c2c1c1`，763 条 | 本次复算所用快照；外部漂移继续 |
| 收尾复核 21:29:55Z | 同上 `f32fdfbf…`，63 步（状态不变） | `f719795f2128b030c774c4d699f33277c1977dd202f231400872909a8d4606d9`，764 条 | 外部又追加 `artifact.observed`；acceptance 决定仍 1 条、unclassified 仍 1 条（第 646 行） |

- 报告：v1 `0106dc80…`（163 行）、v2 `d0df0789…`（150 行）均未变；新出现 **v4** `1b7d17cbe01c04681f1793500bbd71516027b7180a62491747a75a64b60d8cce`（151 行，21:18 外部写入）。**v1/v2/v4 均无 `acceptance-rework` 段**；本次独立调用 `parseAcceptanceReworkReport` 对 v1/v2/v4 结果均为 `missing`（occurrences 0），证明不解析 §8 表格/§9.1 列表/自由文本。
- 唯一 acceptance 决定仍为账本第 368 行 `2026-10-23T08:05:01.066Z` `rejected`（`decisionEvidence.kind:"customer-input"`）；最近 `stepId:"verification"` verifier 派发仍为第 359 行 `08:01:26.084Z`。
- 账本第 **646** 行仍为 `actorRoleId:"rapporteur"`、`power:"proposal"`、`decisionKind:"unclassified"`、`customerDecision:"none"`、`decisionEvidence.kind:"customer-input"`、摘要「确认冻结契约 v3 docs/contracts/ai-governance-pipeline-contract-v3.md」（`at=2026-10-23T12:08:21.756Z`）。
- **独立复算（在临时副本上进行；源文件只读）**：
  - 现场形态：strict `ready:false`（rejected 等待返工 + 4 个未完成步骤 + 未结算决定）；`allowRejectedAcceptance:true` 仍 `ready:false`（4 个未完成步骤 + 未结算决定）——返工未完成或决定未结算时**不误派**。
  - A 语义重建（内存移除外部后加的未完成步骤与未结算决定，保留 08:05 rejected）：strict 唯一 issue「验收已拒绝，流程等待返工；返工后需重新派发验收。」；`allowRejectedAcceptance:true` ⇒ `ready:true`；再移除 rejected ⇒ `ready:true`——复现「仅 rejected 挡住、移除后 ready」。
  - B 语义：保留外部 dispatched/pending rework（如 `rework-readme-log-mapping`）并移除 rejected ⇒ 仍 `ready:false`（执行步骤未完成）——返工未完成不会误派。
  - reopen：`verification:dispatched` + 旧 evidence ⇒ `ok:true`，变 `pending` 且清空 evidence；`verification:done` ⇒ `acceptance-already-done`，文件不变。
  - 重派门事实：`decisionAtMs=1792742701066` < `flowMtimeMs=1792761918336.97`；`acceptanceLastDispatchAtMs=1792742486084` < flow mtime；`acceptanceDispatchRecorded=true`；A 夹具门通过（可恰好重派一次）；现场因 4 个未完成步骤 + 未结算决定**不判重派**（`liveWouldRedispatch:false`）。
  - **零写入**：复制前后四文件 SHA-256 逐字节一致（`zeroWrite.unchanged:true`）；目标 `.ans/governance/` 仅 `ledger.jsonl`，**不存在 `acceptance/` 路由记录目录**；本验收未在目标根执行任何写命令，未新增目标文件。复算原始输出：`C:/Users/51054/AppData/Local/Temp/acc-verify/target-check-out6.txt`（SHA-256 `957f0fdd8f1f33d2cda56b74b3574834a850bebf02905ef01e7d274c8fa6abbc`）；脚本 `target-check.mjs`（`95604f2c…`）。
- 结论边界：复算只证明**新逻辑在只读复制快照上按门动作**，不等于目标项目已修复；目标项目恢复需升级后的真实事件与目标侧处置。

### 4.6 验收定向补充检查（只读临时夹具；补 S7 未单列的边界）

| 检查 | 结果 | 原始输出/哈希 |
| --- | --- | --- |
| P6.5 损坏/未知 schema routing record ⇒ 不派 Proof、可见提示、不伪造 | 损坏 JSON + 无 acceptance 决定 + flow 存在：无任何 Convener/verifier 发送；Lead 系统行「返工路由失败（返工路由记录损坏/未知 schema…）」；`corruptNoteVisible:true`。 | `C:/Users/51054/AppData/Local/Temp/acc-verify/corrupt-record-output.txt`（`60f8d8df…`） |
| P4.2 #10 `verification done` + 最新 rejected ⇒ 不重开/不重派、人工核对 | 路由 Convener 1 条（客户拒绝系统行）；verifier 0；系统行「验收步骤已完成（done），但最新验收决定为 rejected/返工中；异常状态，不自动重开/重派，请人工核对」；`verification` 保持 done。 | `done-rejected-output.txt`（`5815d730…`） |
| P4.2 #11 同 flow 内容 + mtime touch ⇒ 不重派 | 预置 record `lastDispatchedFlowSha256=当前 sha` 并 touch flow mtime：verifier 0、Convener 0、内容/sha 不变。 | `touch-same-output.txt`（`4eef45e0…`） |
| P3.1/P3.8/P3.13 judge 代批 reject（`decisionEvidence.kind:"judge"`） | 恰一条 Convener 任务；verifier 0；任务「来源：自动决策未完成（自动退回）」+ 原因码/原因；系统行「自动决策未通过/未完成（判断代批/自动退回）」；任务/系统行**均不含「客户拒绝」**；record `source:"judge"`、`sourceDetail:"judge"`、`status:"sent"`、`itemCount:1`。 | `judge-proxy-output.txt`（`0df82b78…`） |
| P2.4 旧调用任务文案 | `buildAcceptanceTaskMessage(flowId, evidence)`（不传新参数）不含「⑨」/「本次为重派复核」且保留 ①–⑦；传入 `reportPath`/`previousReportPath` 时追加 ⑨ 与 vN+1 要求。 | 命令输出见 §四.3/§五 P2；`operator-wiring` 既有用例原样通过 |

---

## 五、逐项验收表（P1–P12 + G1/G2）

> P 编号按标准 v1 §3.0；方案 §8.6 的 P4（措辞）并入本表 P3、P7（verification 重开）并入 P4、P9 拆入 P3–P7/P9、P10 并入 P11 + P6/P9、P11 拆入 P9/P10。逐行结果只对当前候选有效。

| ID | 标准摘要 | 最低证据 | 实际证据路径/哈希 | 候选 | 产出角色 | 实际观察 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **P1** | 按账本 append 顺序取最新 acceptance 决定；只有最新 `accepted` 收口；最新 `rejected` 不 closed；`allowRejectedAcceptance` 默认 false；顺序/坏账本/未结算/legacy Q6 正确 | `flow-state.test.ts`、`flow-service.test.ts`、`acceptance-dispatch.test.ts` 原始输出；flow/账本快照 | `test/编排/flow-state.test.ts`（`43cc48ab…`/`3efba1b9…`）新增 9 例；`flow-service.test.ts`（`6aa7af35…`/`eef623a4…`）新增 12 例；本次复跑 122/122；`acceptance-dispatch.test.ts` 44/44；S7 `directed-orchestration.log` 850/849/1（既有 EPERM）；目标 A 复算（§4.5） | 21 候选（`flow-state`/`flow-service`/桌面测试） | 编排、桌面窗口、测试 | `latestAcceptanceDecision` 按数组顺序取最后一条（测试明确“不看 at”）；最新 rejected 返回「等待返工」且不出现「已收口」；accepted 才收口；`allowRejectedAcceptance` 默认 false、true 仍返回具体未完成原因；accepted 后 rejected 不重开 done、rejected 后 accepted 收口；unresolved/坏账本/缺步骤 fail-closed；legacy `flowCompletionIssue` 保持旧行为并有回归锁；`completeAcceptanceStep` 只认最新 accepted、rejected 时文件字节不变、done 幂等。 | **pass** |
| **P2** | 报告恰好一个 fenced YAML `acceptance-rework/v1`；字段/单 owner/64 项/32KB/严格校验/坏段整段不采信/不解析自由文本/不支持版本 fail-closed；模板硬要求；报告 vN+1 | `acceptance-rework.test.ts` 正负例；报告样例；目标无块夹具；任务文案对比 | `test/编排/acceptance-rework.test.ts`（`9c3ec88c…`/`99735a31…`）19 例全过；`src/common/编排/acceptance-rework.ts`（`45843ef4…`/`a8598588…`）；本次复跑 122/122；S7 新增 e2e S7-D；独立解析目标 v1/v2/v4 均 `missing`；任务文案新/旧参数检查（§4.6） | 21 候选（解析器、任务文本、tests） | 编排、桌面窗口 | 正例（字符串/数组 evidence、coordinator 缺省/steward/未知 warning）与负例（缺段、坏 YAML、未知字段、重复 id、空/多 owner、空 action、items 空、>64、>32KB、多块、v0/v2/无版本、HTML 注释、非候选块忽略）均通过；`uniqueKeys`/`maxAliasCount` 同 flow 口径；缺段/坏段只发“报告不完整”任务、无 items、不建步骤、不写客户决定；生产调用传 reportPath 时追加 ⑨ 与 vN+1，旧调用无 ⑨ 且保留 ①–⑦。 | **pass** |
| **P3** | 客户 reject（含 judge 代批）与 judge auto-rework 路由 Convener；Proof 不接收返工、只等待；judge 来源不得写「客户拒绝」，客户手拒才写；客户最终决定权；allowlist；失败可见；任务含清单/缺段提示/来源 | `acceptance-dispatch`/`interface`/`operator-wiring`/`tools` 原始输出；任务文本；账本/record；系统行；e2e/Electron | `acceptance-dispatch.test.ts` 44/44（客户拒绝路由、judge auto-rework、锁/去重、record、报告兜底）；`interface.test.ts` 120/120（S7；auto-rework 接线/最新决定）；`operator-wiring.test.ts` 54/54（allowlist/回调隔离）；`tools.test.ts` 13/13（judge 不含「客户拒绝」、客户含、notPresented/unavailable/judgeReceipt 不变）；S7 `s-acceptance-rework-routing.test.ts` 10/10×3；本次 judge 代批补查（§4.6）；Electron `E2E_PASS` | 21 候选（桌面、runtime、e2e、i18n） | 桌面窗口、运行时核心、项目管理、测试 | 客户 reject ⇒ 恰一条 Convener 任务、零 verifier、无新增 `customer.decision`、Lead「客户拒绝」系统行；judge auto-rework ⇒ Convener + 自动决策系统行/回执、零客户决定、零 Proof；judge 代批 reject ⇒ source judge、system「自动决策未通过/未完成（判断代批/自动退回）」、无「客户拒绝」；非验收 judge 回执为通用文案（不含 Convener/组织返工/重新提交验收）；allowlist 的 switch-off/row-failed/ledger-unavailable/非验收卡不触发，回调抛错不影响结算；任务含报告路径/版本/哈希、逐项 id/owner/action/evidence、缺段提示、blocked/报告修正/治理项分组、先核对/按 owner supersede/不 supersede 验收步骤/不替客户验收/不自己派 Proof；`coordinator` 只建议，实际固定 Convener；Proof 零返工派发。 | **pass** |
| **P4** | 重派门按顺序：最新非 accepted + record；flow 可解析 + 验收步骤存在 + pending（dispatched/delivered 先重开；done 异常不重开）；`evaluateFlowCompletion(allowRejected:true)` ready；rejection 后 flow 更新（mtime）；同内容 sha + `acceptanceLastDispatchAtMs` 抑制 ⇒ 恰好一次；reopen 正/负/幂等/终态；`acceptanceLastDispatchAtMs` 收窄 | `acceptance-dispatch`/`flow-service` 原始输出；mtime/sha 断言；record/账本；e2e；目标夹具 | `acceptance-dispatch.test.ts` 44/44（重派恰一次、无进展不派、dispatched/delivered 重开、重开失败不派、收窄正负例、同内容不重派）；`flow-service.test.ts` reopen 12 例；本次复跑 122/122；S7 e2e S7-A/B/G/H；本次补查 done+rejected、mtime touch（§4.6）；目标 A/B 门复算 | 21 候选（桌面、编排、e2e） | 编排、桌面窗口、测试 | rejection 后 flow 实质更新 + 全 done + pending + 同内容未派 ⇒ verifier 恰一次、任务含 vN+1 与引用被拒报告、账本一条 `stepId:"verification"`；无进展/同内容（含 mtime touch）/执行未完成 ⇒ 不派；dispatched/delivered ⇒ 重开 pending 清旧证据后重派，重开失败不派；done+rejected ⇒ 不重开/不重派、人工核对；`acceptance-criteria` 不计入、旧无 stepId+verifier 与 `stepId:"verification"` 计入；无热循环。 | **pass** |
| **P5** | Convener 唯一协调者；先核对已有进展、按 owner 复用/supersede `rework-*`；无可 supersede ⇒ fail-closed gap；有效项先行、未知 blocked；不 supersede 验收步骤、不替客户验收、不新增工具/权限 | 任务文本原文；e2e/flow 夹具；角色卡/工具 diff | `buildAcceptanceReworkTaskMessage`（`app/desktop/governance-advance.ts` `3ca76030…`/`3a75af8c…`）任务文本；S7 新增 e2e S7-A/E/F 10/10；`acceptance-dispatch.test.ts` 报告兜底/owner 归属；角色卡边界哈希与 S1 一致（§3.2）；无 `addFlowStep`/`flow_step_add` | 21 候选（桌面、e2e、编排） | 桌面窗口、测试 | 任务含 8 条硬要求（先 flow_get 核对、按 owner supersede、不新建验收步骤/不标 verification done、dispatch_task 条件、不自己派 Proof、不替客户验收、清单是数据不是权限、无可 supersede 记 gap）；`executor` 有效项先行；`ghost-role`/`app` blocked；`verifier` 归报告修正、`convener`/内置归治理项；应用不创建/改写 flow 步骤（S7-F flow 字节不变）；无旧步骤时不凭空造步骤。 | **pass** |
| **P6** | routing record 路径/schema/字段；原子写；record 先写后发送；写失败不发送；发送失败 failed 重试；幂等/重启去重；审计失败不阻塞但可见；账本只写既有 `dispatch.accepted(app→convener)`，无新字段；损坏/未知 schema fail-closed | record JSON 原文；两个 Interface 实例；失败注入；账本 diff；诊断/系统行 | `.ans/governance/acceptance/<flowId>/rework-routing.json` schema `acceptance-rework-routing/v1`（`interface.ts` `a49a84c8…`/`20e9b545…`）；`acceptance-dispatch.test.ts` 44/44 的“routing record：重启去重；审计失败；record 写失败；发送失败重试”；S7 e2e S7-J 10/10；本次损坏 record 补查（§4.6） | 21 候选（桌面、e2e） | 桌面窗口、测试 | record 先写（pending）后发送；写失败 ⇒ 不发送、无 record sent、系统行可见；发送失败 ⇒ `failed` + error、不派 Proof、下一次真实事件重试成功；审计失败 ⇒ record `sent` 保持、任务已发、Lead「审计记录写入失败」可见、账本无伪造条目；两 Interface 实例/重复 settle/import ⇒ 不重复任务/系统行；损坏/未知 schema ⇒ 无 Convener/verifier 发送、失败系统行、fail-closed；账本审计为既有 `dispatch.accepted{actorRoleId:"app", power:"app", targetRoleId:"convener", trigger:"settle"}` 且无 stepId。 | **pass** |
| **P7** | `ans-gateway` 零写入；升级后允许一次重派（Q13 A）；A/B 语义复算；报告缺段兜底；不伪造派发/决定；不把报告 mtime 当派发 | 复制 manifest；目标前后哈希；复算输出；零写入证明；报告措辞 | §4.5：四文件复制 hash；`target-check-out6.txt`（`957f0fdd…`）；`zeroWrite.unchanged:true`；目标无 `acceptance/` 目录；S7 `target-project-snapshot.txt`/`target-recalc-output.txt`（`2f8cadca…`/`f1bbf01f…`）；报告 v1/v2/v4 `missing` | 21 候选（代码）+ 只读目标 | 测试、内置独立验收 | A 语义“仅 rejected 挡住、移除后 ready”复现；B/现场“返工未完成即使移除 rejected 也不 ready”；reopen dispatched/done 正确；重派门 A 通过、现场因未完成/未结算不派；目标零写入；报告 v1/v2/v4 均无结构化段 ⇒ `structured:false`/缺段兜底，不解析自由文本；Q13 A 的“升级后允一次重派”记录为**目标侧/客户决定**，本产品不写目标、不伪造账本。 | **pass** |
| **P8** | YAML 新语义、legacy Q6 旧行为；accepted 不回退；旧报告/flow/账本不重写；无新枚举/保留 id；不扩 Proof 权限；无新角色工具 | diff/grep；枚举定义；工具面；legacy/accepted 回归；旧夹具哈希 | `flowCompletionIssue` legacy 分支未改（`governance-advance.ts` diff 无该判定改动）；`acceptance-dispatch.test.ts` legacy rejected 用例（不路由/不重派/不写 record）+ accepted 收口用例；`tools.ts` diff 仅措辞（3 hunk）；`FLOW_STEP_KINDS` 4 项未变；无 `addFlowStep`/`flow_step_add`；`reopenAcceptanceStepForRework` 仅 Pipeline 导出/桌面消费（测试断言未注册）；目标 report v1/v2 哈希未变 | 21 候选 | 编排、桌面窗口、运行时核心、测试 | legacy Markdown + 历史 rejected 保持“任意 acceptance 决定终结”、不路由/不重派、无 YAML/record；无决定且门通过仍正常派 verifier；accepted 流程不重开/不重派；旧报告/flow 不被产品写入；无新枚举/保留 id/角色工具/Proof 权限；无构建/发布/渲染层本变更改动。 | **pass** |
| **P9** | 单测/集成/e2e/真实 Electron/T3 全量；目标只读复算；断言未弱化；S1–S7 证据齐全 | 命令/退出码/计数/原始日志；基线对照；`E2E_PASS`；测试 diff；目标复算；S1–S7 | §4.2–§4.6：T3 3790/3763/9/18；受影响 2813/2793/5/15；新增 e2e 10/10×3；Electron 2/2 `E2E_PASS`；typecheck/build 0；manifest 92/92；S1 334 行/S2 142/S3 146/S4 110/S5 110/S7 211；测试 diff 无删除标题/无弱化 | 21 候选 | 测试、统筹、内置独立验收 | 确定性单测/层测试、集成、e2e、真实 Electron、T3 串行全量、目标只读复算均对当前候选执行或同候选复用；9 项失败全为既有 EPERM（基线原文）、0 项本变更新增确定性失败；18 skip 均为既有平台/设计跳过；`i-full-chain` 偶发如实隔离分类；无 skip/todo 当通过；目标零写入；无断言删除/放宽。 | **pass** |
| **P10** | 变更包/manifest 完整；原始证据（命令/cwd/时间/执行者/环境/退出码/计数/失败原文/哈希/diff）；不接受“全部通过”摘要；复用/失效规则；报告首行五项与完整表 | 变更包；manifest；原始日志；报告；复用/失效记录 | 变更包 `8c6684c6…`；S7 manifest `8d5f48cd…` 92/92；S1–S7 原始日志；本报告首行与 §五表；本次复用/定向补查记录 | 21 候选 + 管理记录 | 统筹、测试、内置独立验收 | 每行证据可定位到原始日志/文件；无伪造哈希/`E2E_PASS`/目标复算；未把管理记录当产品候选；未用旧候选证据判新候选；未引用 i18n/目录 v3/写卡门禁结论；证据复用仅限同候选/同输入/同命令/同环境；候选变化失效规则已在变更包/记录声明。 | **pass** |
| **P11** | 范围外零改动；共享文件只算本变更 hunk；分层（桌面经 Pipeline 公共出口）；无新工具/权限；`test/桌面应用/` 未新建；不暂存/不提交/不推送/不发布 | `git diff --name-only`/`--stat`/`status`/`--cached`；import 检查；枚举/工具 grep；角色卡 diff；目标哈希 | §3.1–§3.3 的 S1 内容对账（100 same/12 diff 全为候选/7 added 全为候选/0 非候选新增）；`git diff --cached` 0；HEAD 未变；`package.json` 无 diff；`FLOW_STEP_KINDS` 未变；无 `addFlowStep`；角色卡边界哈希与 S1 一致；`test/桌面应用` 无 `??` | 21 候选 | 全角色、内置独立验收 | 无范围外产品/测试改动（自 S1 起）；共享文件只追加本变更 hunk（其余 hunk 属既有 i18n/目录 v3/写卡门禁，不背书）；桌面只经 Pipeline 公共出口；无新枚举/工具/权限/依赖；无提交/推送/发布；`app/main.ts` 仅接线。 | **pass** |
| **P12** | 标准先于实施；状态如实（implemented-unverified/verified-by-tests-only，不等于验收）；报告独立；不提前宣称；与 i18n/目录 v3/写卡门禁/发布独立；不越界 | 标准哈希/写盘时间；角色文档状态；报告路径/首行五项；候选隔离；发布状态 | 标准 mtime 2026-10-23 18:57:03（早于 S2 实施 19:28+）；S2–S5 状态 `implemented-unverified`（记录哈希 `6af40626…`/`a283f78c…`/`8b2c228b…`/`7b2aba99…`）；S7 状态 `verified-by-tests-only`（`841588b8…`）；变更包待验收；本报告另写 | 管理记录 + 21 候选 | 统筹、内置独立验收 | 标准先于实施并冻结；实现角色未声称验收通过；S7 只声明 verified-by-tests-only；本报告独立于标准/变更包；未声称已提交/推送/发布或目标已修复；与 i18n/目录 v3/写卡门禁/发布分开。 | **pass** |
| **G1** | 变更包完整、候选身份可复算、管理记录不混入产品候选 | 变更包；逐文件 hash；HEAD/status/diff/stat；标准版本/哈希 | 变更包 309 行 `8c6684c6…`；21/21 复算一致；快照 `30deb89e…`；HEAD/tree/暂存见 §2 | 21 候选 | 统筹、内置独立验收 | 变更包含任务/候选/HEAD/路径/S1–S7/证据/T3/复用/标准/未解决；管理记录不在候选表；候选与 S7 `candidate-hashes.txt` 一致。 | **pass** |
| **G2** | 改动路径在团队计划写集内；无越界；`test/桌面应用/` 未新建；`app/main.ts` 仅接线；不暂存/提交/推送/发布 | `git diff --name-only`/`--stat`/`--cached`；边界/角色卡 diff；目标哈希 | §3：21 路径逐项映射团队计划 §3.1–§3.6；S1 内容对账无范围外新增；`test/桌面应用` 无 `??`；`app/main.ts` 仅接线；staged 0；HEAD 未变；角色卡边界未变 | 21 候选 | 全角色、内置独立验收 | 无越界写；无 `test/桌面应用/` 新文件；`e2e/main.mjs` 未改；`app/main.ts` 仅 S6 接线；无提交/推送/发布；目标未写。 | **pass** |

---

## 六、残余、证据边界与未解决问题（不影响本结论，但须被告知）

1. **目标现场外部漂移（重要）**：`ans-gateway` 在 S7 后继续被外部操作修改：flow `bd057b1d…`/59 步 →（21:22）`635d353b…`/63 步 →（21:27）`f32fdfbf…`/63 步（14 done/44 superseded/1 dispatched/4 pending）；ledger `bdafbf45…`/751 → `c658589a…`/759 → `7fa0251d…`/760 → `17453bb9…`/763 →（21:29:55Z）`f719795f…`/764；21:18 新增 report-v4 `1b7d17cb…`。本次复算只对 21:27:40Z 快照有效；21:29:55Z 复核显示 flow 未变、ledger 仅新增 `artifact.observed`，acceptance/unclassified 计数不变。目标继续漂移时需重新只读复算，不得把本报告数值当“当前现场”。漂移不是本验收写入（脚本前后哈希一致、无 acceptance 目录、无目标写命令）。
2. **账本第 646 行未结算决定（残余/运维事项，非本变更产品缺陷）**：`rapporteur` 在 `2026-10-23T12:08:21.756Z` 写入 `decisionKind:"unclassified"`、`customerDecision:"none"`（摘要「确认冻结契约 v3 …」）。按既有 `hasUnresolvedDecision` 口径（本变更未改，标准 P1 明确未结算决定继续挡收口/重派），升级后目标会先路由 Convener 但**不会立即自动重派 Proof**，直到该决定被目标侧核对/结算或补证。本变更的标准/实现不得、也没有伪造该决定的结算；处置归目标项目 Convener/Lead/客户，不归本产品测试失败。
3. **Q13 A 与 report-v4**：目标 report-v4 是账本外复核（无对应 verifier 派发/acceptance 决定），应用按账本/flow 为自动依据，升级后“允许一次重派”；若客户要避免与 v4 重复，需目标侧在升级前登记或以既有 `dispatch.accepted` 记录，或客户接受一次重复。这是目标侧/客户决定，不是本产品写入。
4. **真实 Electron 未做新增系统行定向断言**：`main.mjs` 未改、无客户拒绝/自动决策/报告缺段的定向 Electron 断言；内容由确定性桌面测试与新增 e2e 覆盖，Electron 证据覆盖启动/导入/聊天/卡片/系统行通道不回归。标准 P9 的定向冒烟为“可最小追加”而非强制，故不判 fail；若发布前要求 UI 文案真机定向证据，需另行添加最小冒烟。
5. **judge 代批 reject 任务来源措辞精度**：补查显示任务首行写「来源：自动决策未完成（自动退回）」，而非更精确的「自动决策未通过（判断代批）」；系统行使用「自动决策未通过/未完成（判断代批/自动退回）」且无「客户拒绝」，record `sourceDetail:"judge"`。归因与路由正确，不构成客户误归因；作为**措辞精度残余**记录，后续如需逐字与方案 §5.1.1 对齐可改（不在本结论中作为 fail，未加严标准）。
6. **queued 视为已投递**：`sendBackground` 的 `queued:true` 路径代码按成功处理（record sent/占位保留），底层 SessionManager 队列语义已有既有测试覆盖；本变更未单独注入 queued 场景，作为证据边界记录。
7. **legacy Markdown 限制（Q6 A）**：历史 rejected legacy 流程不自动路由/重派，保持旧行为；需迁移 YAML 才能进入新语义。目标报告 v1/v2/v4 均无结构化段，升级后只能走“报告不完整”人工兜底；重派要求 vN+1。
8. **Q5 gap / owner 归属 / 候选变化不可见**：无可 supersede 旧步骤时 fail-closed，需 Lead/Proof 补 flow 计划；`app`/`customer`/未知 owner 逐项 blocked；应用只以 flow 更新为进展信号，Convener 未把返工/证据登记进 flow 时不会重派——均为方案声明的残余风险，非本候选缺陷。
9. **record sent 更新写失败/审计 best-effort**：任务可能已发出但 record 仍 pending，重启后可能重复一次 Convener 任务（不是 Proof 派发）；审计失败不阻塞、系统行可见、不伪造账本（Q10 A）。`i-full-chain` 文档生命周期偶发（open→send/close）为既有家族，T3 本轮 0 次、隔离复跑 3/6 出现，非本变更确定性新增。
10. **独立性与不背书**：本报告不引用 i18n（T2）、目录 v3（T3）、治理写卡门禁（T3）或 v1.7.0 发布的验收结论；工作树中这些既有未提交改动只是本变更的基线上下文，本报告不为它们背书。共享文件整文件哈希包含这些上下文，本报告只核本变更 hunk。

---

## 七、放行边界

- 本结论只对**当前候选**（§2）有效；任何产品/测试文件变化使受影响证据失效（标准 §2.3），需重新基线/复算；报告过期。
- **通过不授权提交、推送、合并、发布或任何对外操作**；客户实施授权明确排除 commit/push/发布/目标项目写入。v1.7.0 发布前需由统筹/沟通把本结论与 i18n、目录 v3、治理写卡门禁、发布事实分开登记。
- **目标项目未修复**：本报告只证明新逻辑在只读复制快照上按门动作；`ans-gateway` 恢复需升级后的真实事件与目标侧处置（含第 646 行未结算决定、report-v4 的 Q13 决策）。不得把本报告写成“目标项目已恢复/已解锁”。
- 本报告不是客户确认记录，不改变闸门 0/1/2 对象或版本；不改变角色卡/边界/枚举/依赖。

---

## 八、P 编号对照（标准 §3.0，供追溯）

| 方案 §8.6 | 本报告 | 说明 |
| --- | --- | --- |
| P1 最新决定/收口 | P1 | 直接对应 |
| P2 结构化返工段 | P2 | 直接对应 |
| P3 路由 + P4 措辞 | P3（含 P3.4） | 方案 P4 并入 P3.4 |
| P5 Convener 契约 | P5 | 直接对应 |
| P6 重派门 + P7 verification 重开 | P4（含 P4.4） | 方案 P7 并入 P4.4 |
| P8 兼容/迁移 | P8 | 直接对应 |
| P9 失败/边界 | P3/P4/P5/P6/P7/P9 | 按场景拆入 |
| P10 分层/权限 | P11.4 + P6/P9 | 并入 |
| P11 测试/证据 | P9 + P10 | 拆入 |
| P12 文档/状态 | P12 | 直接对应 |

---

## 九、证据清单（关键路径）

| 证据 | 路径 | 哈希/计数 |
| --- | --- | --- |
| 标准 v1 | `docs/acceptance/acceptance-rework-routing-criteria-v1.md` | 961 行；`b62746e9…`；blob `88d2e542…` |
| 方案 v1 | `docs/planning/2026-10-23_design_acceptance-rework-routing.md` | 951 行；`9ceea642…`；blob `92f88c03…` |
| 团队计划 v1 | `docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md` | 389 行；`d95fc817…`；blob `2e88d2ad…` |
| 沟通/闸门 0/1/2 + 实施授权 | `docs/communication/2026-10-23_intent_acceptance-rework-routing.md` | 76 行；`b4bc67b7…`；blob `a3649668…` |
| 变更包 | `docs/scheduling/acceptance-rework-routing-change-v1.md` | 309 行；`8c6684c6…` |
| S1 基线 | `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-baseline.md` | 334 行；`bcd5ddfc…` |
| S7 记录 | `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing.md` | 211 行；`841588b8…`；`verified-by-tests-only` |
| S7 证据 manifest | `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/sha256.txt` | 92 行；`8d5f48cd…`；92/92 OK |
| T3 全量原始日志 | `…-evidence/full-regression-serial-excluding-write-sequencing.log` | 3790/3763/9/18；`22855e33…` |
| T3 摘要/受影响套件 | `…-evidence/full-regression-summary.txt` / `affected-suites-summary.txt` | `982fde9a…` / `ce31273b…` |
| 新增 e2e | `…-evidence/s7-new-e2e.log` | 10/10×3；`38f4849e…` |
| Electron | `…-evidence/electron-e2e-run1,run2/{report.txt,stdout.log,...}` | 2/2 `E2E_PASS=true`；`f095aeed…` / `e8fac0d5…` |
| typecheck/build | `…-evidence/{typecheck,typecheck-renderer,build-renderer}.log` | 0/0/0；`2a7fdd65…`/`3fbbc6a3…`/`9d3ee655…` |
| 目标快照（S7） | `…-evidence/target-project-snapshot.txt` / `target-recalc-output.txt` | `2f8cadca…` / `f1bbf01f…` |
| 本次目标复算 | `C:/Users/51054/AppData/Local/Temp/acc-verify/target-check-out6.txt` | `957f0fdd…`；快照 `f32fdfbf…`/`17453bb9…` |
| 本次补查 | `…/acc-verify/{corrupt-record-output,done-rejected-output,touch-same-output,judge-proxy-output}.txt` | `60f8d8df…`、`5815d730…`、`4eef45e0…`、`0df82b78…` |
| 候选快照 | `/tmp/acc-verify/snapshot.txt` | 21 行；`30deb89e…` |

---

**状态声明**：本文件是内置独立验收按标准 v1 对当前候选写出的验收报告，结论为**通过**（仅对当前候选有效）。它不是客户确认记录，不是提交/推送/发布授权；不声称目标项目已修复；不改变客户最终 accept/reject 权力；不与 i18n、目录 v3、治理写卡门禁或 v1.7.0 发布合并结论。
