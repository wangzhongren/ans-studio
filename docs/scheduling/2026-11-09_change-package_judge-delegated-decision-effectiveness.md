# E3-B 变更包：代理审批/代决策的效力等同客户本人（judge 代批生效，T3，2026-11-09）

- **任务 ID**：`2026-11-09-judge-delegated-decision-effectiveness`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-09
- **性质**：E3-B 变更包（候选冻结 + 确定性/真实运行证据索引 + 披露）。**不是验收结论**；B2 由独立验收按 B1 v1.1 判定（本包 §六 之后执行）。合并需客户逐 PR 明确「允许我合并」；发布/tag 未授权。
- **风险档位**：**T3**（治理/权限/审批/审计语义；跨运行时核心/编排/trunk/版本变更/门禁共享契约；不压档）。
- **依据（写包时实测）**：
  - 意图（闸门 0）：`docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`。
  - 团队计划：`docs/scheduling/2026-11-09_team-plan_judge-delegated-decision-effectiveness.md`（`9b61a48460a00fb25f2587edba441d73082a93ecc0f50b7dec83c1c214a8b219`；含 W-J2b amendment 行）。
  - 方案 P1.2：`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（686 行 / 88,988 bytes / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`）。
  - 独立复核：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`（362 行 / 52,462 bytes / `de1d0281d9fb6a309a5e231b095aec068bc77bb86e3bc9ad85b8931be430da7d`；R1.0 F1–F13 + R1.1 窄复核；P1.2 处置 G1/S1–S3）。
  - **B1 v1.1（唯一判据）**：`docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`（400 行 / 61,990 bytes / `4cbb5df2507c2b30d43b37707cba305490ca8f8fc365b65e25a18f99b3693543`；v1 `2517668c…` + AC-J7b amendment）。
  - **D1（组合）**：`角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness.md`（224 行 / 23,909 bytes / `d7c16852684140fcc0dbe912e93d71adb51727a124f1106c793c2ee1ef1c2e64`）。
  - **RR（真实运行）**：`角色卡/测试/docs/change/2026-11-09_RR_judge-delegated-effectiveness.md`（169 行 / 22,238 bytes / `22cc60f30119937747f55c182613f629a7775375b4f9699a9618cfc7ad6f02fe`）+ `2026-11-09_RR_judge-delegated-effectiveness-evidence/`（126 文件；`evidence-manifest.txt` `87bd82fb948f9f981a812dd69a36411be87ba974da5b4ee662b80f7bc4300555`）。
  - **E3-F（全量 T3）**：`角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness.md`（271 行 / 32,620 bytes / `8dc4a0913139b5557d1c7bcc27776c879f56b0740b93bc1306e8ff8370e9c7ff`）+ `2026-11-09_E3-F_judge-delegated-effectiveness-evidence/`（`evidence-manifest.txt` 680 条目 / 84,424 bytes / `96a2d4bda11b318c8576e0d62a92b25964970f54fd3e80fa45280dd6becbf8e7`）。
  - 批量实施证据（只读消费）：W-J1 `72848a5b…`、W-J2 `70f0f62a…`、W-J3 `221b3199…`、W-J4 `1a4926ef…`、W-J5 `c811d518…`（含 §7 amendment）、W-J2b `c2defed0…`。
- **基线**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `fb1aa39e787934f334b9c164e4221074f97f6147`（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`；提案卡修复已提交）；暂存 0；候选 = HEAD + 本包 25 文件。

## 一、候选身份（BASE-4/BASE-5）

- **候选 25 文件 = 11 `src/**` M + 12 `test/**` M + 2 `test/测试/**` 新文件（`??`）**；无删除/重命名/写集外条目。
- **canonical 聚合**（逐文件 raw SHA-256，`sha256  path` 两空格、LF、按路径字节序 `LC_ALL=C sort -k2`，对 25 行文本取 SHA-256）：**`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**（D1/RR/E3-F 三处同值；本次写包时复算命中）。
- **`src app test` manifest**：**1,107 条目 / `2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（D1/RR/E3-F 同值）。
- **范围合规**：`git status --porcelain -- app` = 0；`git diff --stat -- app/desktop` = 0；T1 三文件（claude-adapter schema/session 测试）不在写集、未混入；`optional-acceptance.test.ts` 未修改。

### 1.1 逐文件 raw SHA-256（按批次）

| 批次 | 文件 | raw SHA-256 |
| --- | --- | --- |
| W-J1 | `src/model/version-change.ts` | `f185824160e3081f312d0c73e692fcef27c20ca0a18954be32ba2d189cc9e4bb` |
| W-J1 | `src/model/runtime.ts` | `67e649047a177a5e8dedd26cae3a3e6d894bda767d8be95dc84b2fac4bcb8c22` |
| W-J1 | `test/runtime-core/direct-role-capabilities.test.ts` | `80cd5d521cc74b4bb3b68b253006d6387e76fa10a84dcc20a53eb9afd4201833` |
| W-J1 | `test/runtime-core/version-change-contract.test.ts` | `bea0d51ab8f3a9675ab55c4fe75c70b2e2b27168979beab968245f27a78f85c9` |
| W-J2 | `src/service/trunk/impl/apply-journal.ts` | `e5774d054bbb025ab56b4fbbdcbe2f2cc5fa3006f1bc2dec19dc02735030720c` |
| W-J2 | `src/service/version-change/impl/freeze-service.ts` | `0f4ef1411bed880ccaaaac1d7e8201b9e8f7a40a6e573b1ee0f92a6f98e42755` |
| W-J2 | `src/service/version-change/abstract/version-change-service.ts` | `deaaeb46f60e8a983ff142ef86e201d159ba906ebd5e8c1eff048b861122416a` |
| W-J2 | `src/provider/version-change/impl/guard-freeze-registry.ts` | `81869f3f2a0e914891617b4c6144cdb5abe6e0dbee3f1a604134dc9ac8d0fdb5` |
| W-J2 | `src/pipeline/orchestration/trunk-runtime.ts` | `7b120c800dbb9b0e27e9023e91c87d190746b51f161aafb0cbca421445cefde0` |
| W-J2 | `src/pipeline/orchestration/version-change-runtime.ts` | `c8f67dacaa716b1e18d62f3d3ecd930a01682083a5c323b90d50c63b9cb103d3` |
| W-J2 | `src/common/编排/task-state.ts` | `da5cf6891ea7cb3730b7ca5a8e1d55bb97bd2571df549276e557d4bc121fff5d` |
| W-J2 | `test/编排/direct-role-capabilities.test.ts` | `0f63f049573ef2c6d25d786a3826f9b79fc98536e48a1c4c6a737c0bd089e022` |
| W-J2 | `test/编排/version-change-service.test.ts` | `14a3dc5187530ba8540651e1a7ee8cfe9f744ad911a3f569609d9b7289d3c880` |
| W-J2 | `test/编排/task-state.test.ts` | `f863e8e7b922b88a93f5eaada03b7b2ce10421dc8bd7796d9f136bf46abc3b03` |
| W-J2 | `test/编排/trunk-events.test.ts` | `9987d42b245114d100506fa25e16185f92a90f0a529d0df9782144818da3ed01` |
| W-J3 | `src/common/门禁引擎/classify-shell.ts` | `a98f09e42b10d88a8d18ad26a1f37284a1435880be11df3e3f18babafdc9e7c1` |
| W-J3 | `test/门禁引擎/direct-role-capabilities.test.ts` | `f36e108d5eeee9b8a045f9cbf9283218ac3b1cafb5b324c2751eadee32a5d666` |
| W-J3 | `test/门禁引擎/git-shell-acl.test.ts` | `7652d171c3c5e1fc32d85fbf3d9c5bc0c6a8cbd224d7c581a62d17fdbc19a6e4` |
| W-J4 | `test/桌面应用/decision-service.test.ts` | `f5186992b3bdae4038f90c48a2d3551254bd60c5e69037e69222175ac93e807b` |
| W-J4 | `test/桌面应用/run-change-trigger.test.ts` | `3775b8da8f62c62a3b0aa75c99bdba4c8e8274757ffd900975a73d3541dd9bbf` |
| W-J5 | `test/测试/git-write-chain-fixture.ts` | `59700e5fab72796cb27fccfe4aaf0f35e9f83b324f4edfdedb20f981788d7ea7` |
| W-J5 | `test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts`（新） | `8ff9666272c4a85768393da8b4f1b802f606878c12d8848cfadf76471e96653f` |
| W-J5 | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（新） | `7c40f724683cfbfaaad4b97a879bb43a59611a282e3a3fc13ab79023e487fcdd` |
| W-J2b | `src/common/roles/nominator/index.ts` | `77fe423a016cd64cd85cdc25ece0086b1c39e0f84d66b914b881f0ba0a8abe9c` |
| W-J2b | `test/roles/nominator/nominator-module.test.ts` | `3375a9e74630eea112ccdb3773072ef317eda31be983824fb94eb837e5d111ff` |

- 改动规模（D1 numstat）：23 个 M 文件 +1318/−82；2 个新文件 299/99 行。

## 二、改动内容（按方案 P1.2，六批）

- **W-J1（运行时核心）**：`DocFreezeOrigin` 增 `"judge-delegated"` 与对应 source/校验；`isJudgeDelegatedSource`、`DOC_FREEZE_JUDGE_DELEGATED_REASONS`（仅 `intent-confirmed`/`proposal-confirmed`）；统一 D3 纯函数 `requestResolvedD3DecisionId`/`isJudgeD3Resolution`（customer/judge→真实 decisionId；chief-delegated→requestId；null/非对象 fail-closed）；旧记录兼容与契约测试。
- **W-J2（编排）**：`apply-journal.ts` judge 代批意图确认/同受拒 proposal 路径生成/读取/复核 `intent-confirmed` 冻结；`freeze-service.ts` 构建 `judge-delegated` source（`requestId/engine/operatorId/reasonCode/reason/selected/cardKind/at`，不写 `model/decidedBy/decisionId/actorRoleId`）；VCA/guard-freeze-registry/trunk-runtime/version-change-runtime 镜像消费；`task-state` `doc.freeze` 校验；judge 拒绝不生成冻结（manual/deny/无唯一推荐/不可用回落不变）。
- **W-J3（门禁引擎）**：`classify-shell.ts` 对 judge D3 resolution 与 `judge-delegated` 冻结来源按统一 helper 消费；customer/chief 路径逐字不变。
- **W-J4（桌面窗口，仅测试）**：decision-service/run-change-trigger 回归钉（客户路径/卡片/J12 三例），产品 `app/desktop` diff=0。
- **W-J5（测试）**：`git-write-chain-fixture.ts` judge/customer 分支等价改写（断言未删除/未弱化）；新增 J16/J17（doc-freeze 正/负例、旧事件字节不变）与 J15（judge 代批 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；非法 d3-by 负例）。
- **W-J2b（nominator-code，协调方批准）**：`d3-by` 接受集加入 `"judge"`（单行）+ nominator 测试；使 judge D3 经 `activateRoleDocuments` 生效；**不改其它角色/职责**。

## 三、D1 组合确定性验证（摘要）

- 组合候选与 W-J1–W-J5/W-J2b 六批 after 状态逐文件 SHA-256 全等（diff 空）；候选/manifest 运行前/中/后三次快照一致。
- 受影响套件（对 D1/各批基线，失败标题集合 diff 0）：runtime-core **540/503/33/4**；编排 **1133/1109/22/2**；门禁引擎 **453/447/5/1**；桌面四文件 **61/35/26/0**；nominator **27/27**；test-role 7 文件 raw 9/8/1（归一化 8/8/0）。
- `npm run typecheck` exit 0；**新增确定性失败 0、新 skip 0**；环境抖动（effectiveness 进程未退出）同候选隔离复跑 1/1 自然通过。

## 四、E3-F 全量 T3（摘要）

- 候选冻结不变（25 文件 / `9eb21d3b…` / manifest 1,107 / `2468fc59…`；运行前/中/后 diff 0；`app/desktop` diff 0）。
- 全量 **547** 个 `test/**/*.test.ts`（对参照 540 清单 +7/−0：本变更 2 + HEAD 基线 5）；逐文件独立进程自然运行（6 个登记挂起 90s、其余 300s；**未 force-exit/test-timeout**）；541 自然完成 + 6 登记挂起。
- **总计：5,075 tests / 4,845 pass / 197 fail / 1 cancelled / 32 skipped / 0 todo**（参照 E3-F 540 文件 5,032/4,807/192/1/32）。
- 与参照失败/skip 多重集对照：**新增确定性失败 = 0、新 skip = 0**；4 条新增条目全部环境性（3 条 chief-workflow ENOTEMPTY 清理竞态，隔离复跑集合漂移；1 条 run-stop e2e Node 原生 `CleanupQueue::Add` 崩溃，隔离复跑 1/1 自然通过 43.7s）；既有失败消失 0。
- 本变更新增测试：2 个新文件 3/3 pass；13 个既有测试文件内新增 35 用例全部 pass（judge 20 + HEAD 基线差 15）。
- 静态门：`npm run typecheck` exit 0；`typecheck:renderer`/`build:renderer` N/A（候选无 `app/**`，`app/renderer`/`app/main.ts` diff 0，tsconfig 既有 exclude）。
- 测试完整性：删除测试 0；delta 中 skip/force-exit/test-timeout 0；移除断言行 2（均为 fixture 等价改写，未弱化）。
- 口径如实披露：任务给定参照 `5cba2d54…` 实测为 `2026-11-08_E3-T3-full-regression.md`（4,979/4,750/196/1/32、520 文件）；5,032/4,807/192/1/32 与 540 文件清单来自后继全量 `2026-11-08_E3-F_remove-predictive-gates.md`（`41a4a215…`）；E3-F 记录两者均列明，不混用。

## 五、真实运行（RR，开/关两腿）

- 环境：真实 Electron（本 worktree `app/main.ts`）+ 产品 `claude` 引擎 + 真实 UI；**CDP 9223**、两腿各独立 `--userData`、仓库外独立目标根；**9222 全程未启动/未占用/未触碰**；贪吃蛇两个运行根 108/88 文件前后逐文件 SHA-256 一致；9223 结束后释放、无 Electron 残留。
- **AC-J10（judge-on）证据面达成**：开关 ON → 真实 chief 发起 `intent-confirm`（`req-86b6b0640c4ba662`，真实 marker）→ judge approve（`engine:"claude"`、`reasonCode:"sufficient"`、14,490ms）→ `request.resolved{by:"judge", operatorId:"judge:claude", decisionId:"decision-req-86b6…"}` → R9 冻结 `reason:"intent-confirmed"`、`origin:"judge-delegated"`、`applicationId:"intent-req-86b6…"`、`source` 与账本逐字段一致（24/24）、无 `decidedBy`/`decisionId`/`actorRoleId`；`freeze-committed`、无 pending-recovery；`readConfirmedIntentEvidence` ok=true；本轮无 `doc.freeze` 事件。
- **AC-J11（judge-off）证据面达成**：第二隔离实例开关 OFF → 原卡呈现客户（真实决策对话框）→ 客户本人 `by:"customer"`/`operatorId:"51054"`/真实 `decisionId` → `origin:"customer"` 冻结（15/15）；**judge 调用数 0**（无任何 `governance-judge.*`）。
- 预算：客户消息 2（每腿 1）、intent-confirm 卡 2（每腿 1）、chief 回合 2、judge 会话 1、驱动墙钟 34s/16s、首果即停、不自动重试。
- 披露：`.env` 后端模型 **`deepseek-v4-flash`**（经代理；非 Anthropic Claude；judge 审计仅 `engine`、无 `model` 字段）——是否满足 B1「真实 Claude（非 demo）」由 B2 独立判定；预检时点 9222 无监听（贪吃蛇当时未运行），本 RR 未触碰；两腿驱动退出码 13（`Browser.close` 后 unsettled top-level await 的工具面记录，证据已完整）。

## 六、B2（待执行）

- **B2 由同一独立验收身份按 B1 v1.1（`4cbb5df2…`）判定**；本包提交的候选/证据见 §一/§四/§五；判定条目 `未取证 → pass/fail/insufficient/NA` 由 B2 报告承载，本包不预设结论。
- B2 复核要点（供独立验收）：候选/聚合/manifest 独立复算；E3-F 新增确定性失败 0/新 skip 0；RR 开/关两腿原件与字段核对；9222 零改动/9223 释放；模型披露口径；旧路径（customer/chief/application/role-direct）逐字不变；AC-31/F35 显式修订逐条（未静默放宽）。

## 七、披露与边界

1. **范围**：仅 judge 代批 `intent-confirmed`/`proposal-confirmed` 两条 reason；VCA/修正案等 Q5 客户主权 reason、judge manual/deny/无唯一推荐/不可用回落、关闭开关原卡回退均不变；`request.resolved`/`CustomerInputOutcome` 形状不变（不新增 actionSource）。
2. **不改角色职责/角色卡/边界**；W-J2b 仅 nominator `d3-by` 接受集 + 测试（协调方批准），`H1 delta=0`。
3. **模型披露**：RR 后端 `deepseek-v4-flash`，非 Anthropic Claude；不宣称已满足 AC-J10-1，由 B2 判定/协调方裁定。
4. **已知红**：runtime-core 33、编排 22 fail/2 skip、门禁 5 fail/1 skip、桌面四文件 26、optional-acceptance 登记挂起与参照一致，未恶化；环境性抖动逐条隔离复跑。
5. **另案**：提案卡修复 S1 的 execution 阶段 judge 工具面错误属既有问题，不在本变更写集，另案处理。
6. **并发**：E3-F 期间同 worktree 出现非本任务未跟踪文件（团队计划 run B1），不在 `src app test`，未污染候选/套件。
7. 未提交/推送/合并/发布；合并需客户逐 PR「允许我合并」；发布/tag 未授权。

## 八、状态

- **E3-B 变更包就绪**：候选 25 文件 / 聚合 `9eb21d3b…` / manifest 1,107 / `2468fc59…`；D1 `d7c16852…`、RR `22cc60f3…`（证据 `87bd82fb…`）、E3-F `8dc4a091…`（证据 `96a2d4bd…`）齐备。
- **下一步**：B2（独立验收，判据 B1 v1.1 `4cbb5df2…`）→ 通过后 E3-R 发布记录（发布/tag 仍需客户授权）；合并需客户逐 PR「允许我合并」。
