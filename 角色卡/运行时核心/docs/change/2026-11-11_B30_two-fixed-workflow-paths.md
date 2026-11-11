# W：B30 repo-local `[user]` 默认身份放行 + B29 工具层配套核对（运行时核心，2026-11-11）

- 角色：ANS 固定 worker「运行时核心」（roleId: 运行时核心），独立上下文。
- 任务：T3「两条固定工作流路径」B30——RR26 实测：桌面 A9 基线写入的 repo-local `[user]` 默认身份使后续角色只读 Git 全部 `git-config-section-unsupported`；并核对 B29（桌面 `completeTeamPlanFixedForHandle` 改回 fixed 服务形状）是否需要在工具层配套修改。
- 依据：调度方 B30 派发单（RR26 接缝事实）；编排服务 `CompleteTeamPlanFixedResult`/`WorkflowServiceFailure`（`src/common/编排/workflow-service.ts:3966-4043, 663`）；桌面 `ensureIdentityDefaults`（`app/desktop/workflow-git.ts:368-379`，只读引用）。
- 基线：HEAD `fc3556e`（B28 提交）。

## 一、RR26 失败事实（根因）

- A9 基线 `ensureIdentityDefaults`（桌面写区）会写 repo-local `[user] name=ANS / email=ans@local`。
- 随后角色 `run_shell` 的只读 Git（`executeReadonlyGit → executeGit → inspectGitRepository → configFormat`，`src/provider/trunk/impl/git-command.ts:477-493`）只允许 `[core]`/`[extensions]` 节；遇 `[user]` 抛 `git-config-section-unsupported`。且 entry 值正则 `^([a-z]+)\s*=\s*([a-z0-9]+)$` 不接受 email 的 `@`。
- 结果：身份缺省一旦写入，全部只读 Git（status/log/diff…）在传输前被拒，A9 后角色无法核验仓库状态。

## 二、实施

### 2.1 `src/provider/trunk/impl/git-command.ts`（M，+12/−1）

- `configFormat` 允许 `user` 节，**仅键 `name`/`email`**；user 节值用受限字符集 `^[A-Za-z0-9._%+@ -]+$`（禁引号/分号/`#`/反斜杠/换行/控制字符等可执行或注入形态）。
- 非法键（如 `signingkey`）⇒ `git-config-executable-or-unsupported`；非法值（引号/分号/续行反斜杠/空值等）⇒ `git-config-value-invalid`。
- 其余行为逐字不变：`core`/`extensions` 允许清单、boolean 值域、`objectformat`/`repositoryformatversion` 校验、`core.hooksPath`/`alias`/`include`/`includeIf`/未知 section 等一律 fail-closed；`[user]` 子节语法（`[user "x"]`）与布尔式无等号条目同样拒绝。
- 修复位于 `inspectGitRepository` 共用的 config 解析层，只读 Git 与候选/主干存储的变更路径同时受益；`configDigest` 仍绑定原始字节，保护事实不变。

### 2.2 测试（M，3 文件 +95）

- `test/编排/git-command.test.ts`（+36）：B30 接受用例——用真实 Git 写入 `user.name=ANS`/`user.email=ans@local` 后 `createGitQueryPort(...).inspect()` 成功、`query({template:"status"})` 真实执行；B30 安全边界用例——9 组非法键/注入值/危险 section（`signingkey`、分号、引号、续行反斜杠、布尔式无等号、`alias`、`include`、`includeIf`、`core.hooksPath`）逐组仍拒。
- `test/编排/readonly-git-transport.test.ts`（+19）：真实临时仓库夹具写入同样的 `[user]` 默认身份后，`executeReadonlyGit('status')` exit 0 且输出含真实 untracked 文件；追加 `user.signingkey` 后再次拒绝（值合法性边界 fail-closed）。
- `test/runtime-core/two-fixed-workflow-paths-b3-1.test.ts`（+40）：B29 配套（见第三节）。

## 三、B29 配套核对（工具层，单列）

**结论：B25 校验器已兼容 fixed 服务成功/失败形状，`src/provider/runtime/tools.ts` 无需改动（本次未改）。**

- 成功形状 `{ok, operationId, flowId, workflowId, basisId, plan, documents, replay, stageCompleted}`（服务类型 `CompleteTeamPlanFixedResult` 成功分支，另含可选 `git`）：
  - `operationId`/`flowId`/`workflowId` 与入参逐字一致；`basisId`（`bas-`+24 hex）按非空字符串接受（工具层不重算/不钉格式，服务为权威）；`plan.path` 非空、`plan.version` 安全整数、`plan.sha256` 64 hex；`documents` 数组（元素形状不重校验）；`replay`/`stageCompleted` 布尔；可选 `git` 作为透传字段不阻断。⇒ 识别为 `ok:true` 并逐字透出。
  - `workflowId` 身份比较保持 fail-closed：桌面绑定可信受派任务 workflowId 后，正常调用中模型入参与其一致；不一致仍按 unknown 处理（不伪造成功，不放松 B25 校验）。
- 失败形状 `{ok:false, code, message, missing?}`（服务类型 `WorkflowServiceFailure`）：`fixedFailureResult` 要求 code/message 非空字符串、`missing` 可选字符串数组，原样透出，不降级 unknown。
- legacy 回执路径（`isDirectActionReceipt`/`directReceiptResult`/source 校验）未触碰；`test/runtime-core/two-fixed-workflow-paths-b3-1.test.ts` 既有 legacy 用例保持通过。
- 路由前提（B25 既有行为，本次未改）：仅当 `args.workflowId` 为字符串且 `args.plan` 为对象（fixed v4 形状）时走 fixed 回执校验；legacy 形状不满足该前提，逐字走旧路径。fixed 会话须按 B3.1 schema 传 `workflowId`。
- 新增两个 B29 用例：成功回执用服务类型 `Extract<CompleteTeamPlanFixedResult, {ok:true}>` 逐字段约束（含 `git`、空 `documents`、`bas-` basisId）⇒ `ok:true` 且逐字透出；失败回执用 `WorkflowServiceFailure`（含 `missing`）⇒ code/message 透出；伪造 `workflowId` ⇒ unknown。
- 限制：B29 桌面实现（`app/desktop/session.ts`）由桌面窗口角色并行修改，本工作树核对时仍为修复前形状；本核对以编排服务权威类型/形状为准，未对尚未落盘的桌面代码做断言。

## 四、验证（D1）

| 范围 | 结果 | 证据（raw SHA-256） |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `b30-01-typecheck.txt`（`92ef7d09ed37ae2b50163e2c1eb3438d6e823776f5c0ac23973edfa6661f6fc8`） |
| 受影响集（git-command + readonly-git-transport + B29 配套 b3-1；3 文件） | **34/34 pass** | `b30-02-affected.tap`（`e065d9bc9bb627d1a2dafe4949e54f54a0183eaba17812512a360e64074abcb6`） |
| 确定性全链（`test/测试/fixed-path-full-chain.test.ts`） | **3/3 pass** | `b30-03-full-chain.tap`（`cd9ec76fe1e4f7f2df3d6a0e100b8ef6e4e3462649fd5b4631b1bc47c2eb2832`） |
| 全量 `test/runtime-core/*.test.ts` | **592 tests / 555 pass / 33 fail / 4 skip**；33 条失败名与 WJ1 记录（`runtime-core-post-full.tap.txt`）冻结 known-red **逐名一致**（diff 空；failnames 与 B25 `b25-05` 字节一致） | `b30-04-runtime-core-suite.tap`（`6fb9c5141b299d05cd7961624ca08a0b26f43a388bd59fa3e22480a2e4e44f72`）、`b30-05-runtime-core-known-red-failnames.txt`（`973c918f1eb6ad793442fdfba06aa6117bae8cc6c388b977e6ae855e2d2c6421`）、`b30-06-known-red-diff.txt`（`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`，空） |
| 门禁域 `test/门禁引擎/*.test.ts`（b30-07，必要时对照） | **554 tests / 548 pass / 5 fail / 1 skip**；5 条失败名与 chief-code B2 冻结 known-red（`_evidence/09-after-failure-names.txt`）排序后 **逐名一致**（diff 空） | `b30-07-gates-suite.tap`（`23719fa6b38fba2fbf64b62dfb8d98083c3e88b0e2c5c30a02dbc1ace6684b52`）、`b30-07-gates-known-red-failnames.txt`（`8325f9d8f24a7aeda3899be9187297744bf517c1975ddaf9c9dc0fcd860139f2`）、`b30-07-gates-known-red-diff.txt`（`e3b0c442…`，空） |
| 桌面 fixed-path 受影响集（b2 + b3-fixed-baseline-pathb + b3-workflow-git-real + fixed-path-routing；补充） | **43/43 pass** | `b30-08-desktop-affected.tap`（`1e04d03cac21615f26dcb48fcfc8702e4d5056e138a0165f0b17a540fc108360`） |
| `test/桌面应用/b42-task-git-port-desktop.test.ts`（含 repo-local 身份夹具；补充） | **8/8 pass** | `b30-09-b42-task-git-port.tap`（`8ef3160d51e12e552675678d464c2e9c6e2288ca3c66ede97294080ed46f8514`） |

- 无新增 skip/force-exit；未运行 Electron、未占用 CDP 9224（另有 RR26 实例在跑）。

## 五、候选（运行时核心）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/provider/trunk/impl/git-command.ts` | M | 86,426 / 1,017 | `0160ebe3514413c7e7a165741e74d568709b14d8936be1312659a0d55750a382` | +12/−1 |
| `test/编排/git-command.test.ts` | M | 22,918 / 236 | `d02ecf4b3cea307c7d265545ce0a18009031280caabc0f40c132cb5a779c58e2` | +36/−0 |
| `test/编排/readonly-git-transport.test.ts` | M | 8,327 / 161 | `73b20573ff13071850e807545077a2a3d31adb38599744eb128992f530f02298` | +19/−0 |
| `test/runtime-core/two-fixed-workflow-paths-b3-1.test.ts` | M | 18,399 / 282 | `b471473e9bf70ca7d59e76c1b3c477355e832406fcf8632219bd83abfbdd59e8` | +40/−0 |

- `src/provider/runtime/tools.ts` **未改**（B29 核对结论：B25 校验器已兼容）。
- 证据文件基线头：`b30-00-baseline-head.txt`（`0814664dd741d96a81061d447d3a7d724e3ee843e45cf4aa3db5fa7c4b7b0966`）。

## 六、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR26/B29 真机通过；真实效果待调度方复跑。
- 不改 `app/desktop/**`、`src/common/**`、`src/pipeline/**`、`src/model/**`；不改服务层 `completeTeamPlanFixed`、schema 与 legacy 回执语义。
- `[user]` 值为受限 ASCII 字符集（桌面默认 `ANS`/`ans@local` 命中）；非 ASCII 身份值保持 fail-closed（当前无此写入方）。
- 未 commit（由调度统一提交）；未 push/合并/tag。
