# W-J5：judge-delegated 跨层集成/夹具实施记录（judge 代批生效）

- 日期：2026-11-09；角色：ans-studio 固定 worker「测试」（roleId: 测试）。
- 变更：`judge 代批生效`（客户裁定：开关开启即委托、judge 代批生效、审计如实记 judge、不伪造 customer/decisionId）。
- 方案依据（P1.2）：`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`，686 行 / 88,988 bytes / SHA-256 `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`；重点 §5.2 测试行、§6（J15/J16/J17）、§9。
- B1 v1：`docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`（`2517668c…`，任务给定）。
- 只读消费：W-J1（`72848a5b…`）、W-J2（`70f0f62a…`）、W-J3（`221b3199…`）。
- 工作目录：worktree `.claude/worktrees/trunk-amendment`；基线 HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（分支 `feat/plan-escalation-card`，叠加 W-J1–W-J3 未提交在飞改动；本批未编辑 `src/**`、`app/**`）。
- Node **v24.22.1**。
- 状态：**W-J5 已实施；`test/测试/**` 逐文件前后对照完成（无新增确定性失败、无新 skip；见 §4）；`npm run typecheck` exit 0；未提交/推送；未验收；未运行真实模型/Electron；未占用 9222。**

## 1. 写集与改动

| 文件 | 改动 | 方案条目 |
| --- | --- | --- |
| `test/测试/git-write-chain-fixture.ts`（M） | `buildWriteChain` 新增 opt-in `intentBy`/`d3By`（`"customer" \| "judge"`）与 `judgeAudit` 覆盖；judge 模式下按应用真实回执形状写 `request.created/resolved`（`by:"judge"`、`operatorId:"judge:<engine>"`、`judge` 审计、`decisionId:"decision-<requestId>"`），并以与账本 `judge` 审计逐字段一致的 outcome 结算；返回 `intentRequestId/intentDecisionId/d3RequestId/d3DecisionId/intentJudgeAudit?/d3JudgeAudit?`。**全部为缺省可关的加法；默认（customer）分支生成的事件/冻结/激活输入逐字不变**（5 个既有 `buildWriteChain` 消费方前后结果一致，§4.3）。 | §5.2、J15 |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（新增，1 例，~63-66s） | J15 跨层真实文件链：judge intent 冻结 → R9 字段对账（G1 超长原值、无客户字段）→ `readConfirmedIntentEvidence` → 回落负例 → judge D3 Service 层激活（`d3Source:"judge"`+`decision-<requestId>`）→ `prepareExecutionRun`/pin/`readRunRoleContext` → 真实 Git candidate/review 的 `verifyReviewIntent` e2e（`prepareReviewTask`）→ nominator `d3-by` 缺口钉住。 | J15、AC-J1/J2/J7 跨层面 |
| `test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts`（新增，2 例） | J16/J17 测试层：`freezeEvents` 无 source 事件字节逐字不变；judge-delegated source 镜像 `actionSource`；`appendTaskEvent → readTaskState` 真实账本正例与 8 类负例 fail-closed。 | J16/J17 |
| `test/测试/direct-role-capabilities-e2e.test.ts`、`test/测试/version-change-integration.test.ts` | **未修改**（Q5 客户主权与既有回归按原样运行；SHA-256 前后相同，见 `candidate-hashes.txt`）。 | Q5 回归 |

**未改（越界为零）**：`src/**`、`app/**`、`test/编排|runtime-core|门禁引擎|桌面应用/**`、其它角色卡/边界/文档。本批 `git status --porcelain -- src app test` 中本批自身改动仅上述 3 个文件；其余为 W-J1–J3 在飞与桌面窗口批次的在飞文件（见 §4.6）。

## 2. 覆盖矩阵（本批实测）

| 覆盖点 | 关键断言 | 结果 |
| --- | --- | --- |
| judge intent 冻结（`finalizeIntentConfirmation`→R9） | `schema doc-freeze/v1`、`reason:"intent-confirmed"`、`origin:"judge-delegated"`、`applicationId:"intent-<requestId>"`、`frozenAt===resolved.at`；**无** `decidedBy/decisionId/actorRoleId`；`source` 与账本 `request.resolved.judge` 的 `engine/model/reasonCode/reason/selected/cardKind/at` 逐字段一致；G1：`reason` 4,110 字符、`model` 531 字符原值未截断（`runtime/wj5-main-freeze.json` + `runtime/runtime-artifact-summary.json`） | PASS |
| `readConfirmedIntentEvidence`（账本重放复核） | `ok:true`（fixture 内建 + 主测试显式断言） | PASS |
| `verifyReviewIntent` e2e（W-J2 未覆盖的缺口） | 真实 worker commit → accepted 收口 → convener integrate（真实 Git candidate/ref/journal）→ `prepareReviewTask`→`readReviewMaterial`→`verifyReviewIntent` 从冻结 trunk Git 历史重放 judge 来源并逐字段通过；该链唯一 `intent-confirmed` 冻结为 judge-delegated（无 customer/chief 记录） | PASS |
| judge D3 real `decisionId` + Service 层激活 | `d3Source:"judge"`、`authorization.decisionId="decision-w7-d3-request"`、无 `actionSource`；D3 证据字节 `by:"judge"`、`operatorId:"judge:claude"`、`group:"decision"`、`cardKind:"appointment"`；`prepareRoleActivation→prepareActivationCommit→commitPreparedActivation` 成功（含 git policy 授权期望形状） | PASS |
| `prepareExecutionRun`/pin/run 读取 | `freezeExecutionRun`（内部 prepare+pin）成功且 `state:"pinned"`；`prepareExecutionRun` 复读 `alreadyPinned:true`；`readRunRoleContext` pinDigest 一致；真实 `codeBasis`/`documentGitBasis` | PASS |
| judge 回落/开关关闭（服务层等价） | `declined`/`unavailable`/outcome-resolved judge 不一致 ⇒ `trunk-item-invalid`、无新增冻结、不抛错（冻结数保持 1） | PASS |
| J16 `doc.freeze` judge 正负例 | `appendTaskEvent → readTaskState` 真实账本正例（intent+proposal）；负例 8 类（source 缺失/kind 非 judge/decidedBy/decisionId/applicationId/at/cardKind/reason）全部拒绝 | PASS |
| J17 `freezeEvents` 字节不变/镜像 | 无 source 的 VCA 事件 JSON 逐字相等（无 `actionSource` 键）；judge source 如实镜像且通过账本校验 | PASS |
| Q5 客户主权/回落回归（既有） | `test/测试/version-change-integration.test.ts` 第 12 例「客户主权与旧入口：VCA 卡不被 @决策/判断器代选…」前/后均 **ok**；该文件其余 9 红为既有 `vca-channel-unavailable` 语义漂移（前后失败标题集合相同，见 §4.4） | PASS（既有） |
| 已知跨角色缺口（不修） | Runtime 包装层 `activateRoleDocuments`（judge D3）返回 `activation-not-ready` / message `…(appointment-facts-invalid)`；同链 Service 层正例已过 | 已钉住（§5.1） |

## 3. 夹具设计（默认行为不变）

- `intentBy:"judge"`：`request.resolved` 写 `by:"judge"`、`operatorId:"judge:<engine>"`、`judge:{group:"decision",cardKind:"intent-confirm",engine,model?,reasonCode,reason?,selected}`、`decisionId:"decision-<requestId>"`；`finalizeIntentConfirmation` 的 outcome 与账本 `judge` 逐字段一致。`intentBy` 缺省 ⇒ 既有 customer 事件/outcome 逐字不变。
- `d3By:"judge"`：`request.resolved` 写 `by:"judge"`、`operatorId`、`judge:{group:"decision",cardKind:"appointment",…}`、`decisionId:"decision-<d3RequestId>"`；`activationInput.d3DecisionId` 使用同一真实应用值。`d3By` 缺省 ⇒ 既有 customer D3 逐字不变。
- `judgeAudit`：仅覆盖 judge 模式的审计摘要字段（引擎/模型/理由/理由码/选择集），用于 G1 超长原值与引擎变体；不改变任何默认分支。

## 4. 运行记录（Node v24.22.1；worktree 根）

运行命令（与任务命令**逐文件等价**；任务命令的单一进程形态因**既有登记挂起文件**无法自然完成，沿用 E3/W7 的逐文件 + watchdog 口径）：

`node --test --test-concurrency=1 --test-reporter=tap "test/测试/**/*.test.ts"`（逐文件；`run-suite.sh`：登记挂起文件 90s，其它 300s；before/after 同一脚本）

### 4.1 全量前后对照（原始计数）

| 样本 | 文件 | tests | pass | fail | cancelled | skipped | 无 summary | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before（HEAD+W-J1..J3 在飞） | 112 | 686 | 629 | 38 | 1 | 18 | 1（customer-authorization 登记挂起） | `pre/summary.tsv` |
| after（W-J5 候选） | 114 | 692 | 632 | 41 | 1 | 18 | 0 | `post/summary.tsv` |

原始差值：+2 文件 / +6 tests / +3 pass / +3 fail / skip 0 / cancelled 0。其中：

- **+2 文件 / +3 tests / +3 pass** = 两个新增测试文件（3 例全部通过；证据 `targeted/2026-11-09_judge-delegated-effectiveness.tap` 65.9s、`targeted/2026-11-09_judge-delegated-doc-freeze.tap` 2/2）。
- **+3 fail 全部为 runner 文件级合成条目（非测试级断言失败）**，见 §4.2 归一化。

### 4.2 归一化（B1 BASE-3 口径）

完整说明见 `compare/normalization-notes.txt`；失败标题 diff（`compare/fails-diff.txt`）只新增以下 3 条，**全部是文件级合成条目**，无任何既有测试断言新增失败：

1. `customer-authorization-plane-integration`：E3/W7 已登记 90s 挂起（W7 after-log `✖ ... (90006ms)`）。before 为 no-summary（88s，TAP 未刷出）；after 为 watchdog 触发的文件级 `not ok`（exitCode 143）。两态同一挂起、同一文件、不 import 本批任何改动文件。
2. `git-action-activation-e2e`：after 全量中**测试本体通过**（`ok 1`，46.9s），仅进程在 300s watchdog 内未退出 → 文件级合成失败。
3. `git-action-delivery-claude-e2e`：after 全量中**测试本体通过**（`ok 1`，91.3s），仅进程未退出 → 文件级合成失败。

归一化后（去除 3 条文件级合成条目）：

| | 文件 | tests | pass | fail | cancelled | skipped |
| --- | --- | --- | --- | --- | --- | --- |
| before | 112 | 686 | 629 | 38 | 1 | 18 |
| after（归一化） | 114 | 689 | 632 | 38 | 1 | 18 |
| 增量 | +2 | +3 | +3 | **0** | 0 | **0** |

⇒ **新增确定性测试级失败 = 0；新 skip = 0；预存红项集合逐条不变**（`compare/fails-pre.txt` vs `fails-post.txt` 除上述 3 条外为空 diff）。

### 4.3 进程退出抖动（环境，非候选；隔离复跑与对照）

两个重型 e2e 在 after 全量中出现「测试本体通过但进程未退出」；按 B1 BASE-3「同候选隔离复跑通过方可排除」，已做隔离复跑与 **原始夹具对照组**（同一测试、HEAD 夹具）：

| 文件 | after 全量 | 同候选隔离复跑（W-J5 夹具） | 对照组（HEAD 原夹具，同环境） |
| --- | --- | --- | --- |
| `git-action-activation-e2e` | 本体 PASS 46.9s；进程 >300s | PASS 干净退出 ×2（`isolated/activation-ab-mod-4.tap`、`-5`）；另 3 次为 Node v24.22.1 原生 `CleanupQueue::Add` 断言崩溃（E3 §3.5 已登记的原生 bug） | 5 次：干净 PASS ×2、进程 hang ×1（240s）、原生崩溃 ×2（`isolated/orig-more-1..5.tap`） |
| `git-action-delivery-claude-e2e` | 本体 PASS 91.3s；进程 >300s | PASS 干净退出 ×1（`isolated/delivery-mod-7.tap`）；另 2 次进程未退出 | 干净 PASS ×1（88s，EXIT=0，`isolated/delivery-orig-fixture.tap`）；before 全量亦干净 PASS |

结论：**原始夹具同样复现同类退出抖动/原生崩溃** ⇒ 与 W-J5 夹具改动无因果关系，属本环境/Node v24.22.1 的既有抖动族（E3 登记的 `CleanupQueue::Add` 与「测试后未自然退出」）；按增量口径不计新增确定性失败，且同候选隔离复跑通过。如实保留全部样本（含未通过样本），不作隐瞒。

### 4.4 既有红项对照（与 before 相同）

before 的 18 个红/挂起文件（`compare/fails-pre.txt` 逐条）在 after 中集合不变，典型：`version-change-integration` 9 红（`vca-channel-unavailable`，前后同名）、`abort-cleanup-verify` 2 红、`governance-e2e-auto/i-full-chain` 2 红、`g4-skill-verify`+`g4v2-mcp-verify` 4 文件 7 红、`g3-search-verify/pi-loopback-verify` 1 红、`real-entry` 5 红、`t1-pipeline-integration` 3 红、`t1-real-cli` 3 红、`trunk-stable-write-integration` 2 红、`download-requests-integration` 1 红、`entry-role-minimal-d` 1 红、`wiring` 1 红、`turn-watch-verify/b-last-resort` 1 cancelled、`direct-role-capabilities-e2e` 1 红（Q1 早期链陈旧期望）、`customer-authorization` 登记挂起。均为既有/与 judge 无关；本批未修改其断言、未新增 skip。

### 4.5 定向与补充回归

| 命令/文件 | 结果 | 证据 |
| --- | --- | --- |
| 新增 `2026-11-09_judge-delegated-effectiveness.test.ts`（独立，含 runtime 证据导出） | **1/1 pass**，65.6s | `targeted/2026-11-09_judge-delegated-effectiveness.tap`；全量内 61.9s 亦 pass（`targeted/suite-…`） |
| 新增 `2026-11-09_judge-delegated-doc-freeze.test.ts` | **2/2 pass** | `targeted/2026-11-09_judge-delegated-doc-freeze.tap` |
| `test/编排/trunk-events.test.ts`（W-J2 J16/J17 只读回归） | 5/5 pass（前/后一致） | `targeted/trunk-events-{pre,post}.tap` |
| `test/编排/task-state.test.ts`（W-J2 J16 只读回归） | 20/20 pass（前/后一致） | `targeted/task-state-{pre,post}.tap` |
| `test/编排/direct-role-capabilities.test.ts`（W-J2 J4/J5/J8/J9/J10 只读回归） | 43 tests / 42 pass / 1 fail（既有红 `Retained intent confirmation…`，前/后同名） | `targeted/orch-direct-role-{pre,post}.tap` |
| `test/编排/version-change-service.test.ts`（W-J2 J3 只读回归） | 16/16 pass（前/后一致） | `targeted/orch-version-change-service-{pre,post}.tap` |
| `npm run typecheck`（`tsc --noEmit`） | **exit 0**（前/后） | `typecheck-pre.txt` / `typecheck-post.txt` |

### 4.6 并发如实记录

本批运行期间同 worktree 存在其它角色在飞：W-J1–W-J3 的 `src/**` 与 `test/{runtime-core,编排,门禁引擎}/**` 改动为**基线在飞**（本批只读消费）；桌面窗口批次在 `test/桌面应用/**` 有在飞改动并在本批期间运行其套件（与本批 `test/测试/**` 零重叠，未修改 `app/**` 产品）。after 全量中除 §4.3 的既有抖动族外，无与本批写集相关的变化。另：既有测试 `git-role-workflows-e2e.test.ts` 按其自身设计把每次运行证据（runNonce 命名）写入 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`，前/后两跑各产生一组，属测试既有行为（非本批写集编辑）。

## 5. 缺口、边界与如实披露

### 5.1 已知跨角色缺口（本批不修，已用测试钉住）

`src/common/roles/nominator/index.ts:482` 的 `d3-by` 事实只接受 `"customer"`/`"chief-delegated"`。W-J2 使 `nominatorRoleDocumentsFacts`（`src/pipeline/orchestration/trunk-runtime.ts:748`）在 judge D3 下如实输出 `d3By:"judge"`，因此 **Runtime 包装层** `createDirectRoleRuntime.activateRoleDocuments`（`trunk-runtime.ts:806-812` nominator preflight）在 judge D3 下返回：

```
ok:false, status:"rejected",
message:"Activation premise was refused by the nominator role policy (appointment-facts-invalid)"
```

（主测试第 5 步断言；`runtime/wj5-main-freeze.json` 的 `nominatorGap` 字段。）同链 **Service 层** `prepareRoleActivation → prepareActivationCommit → commitPreparedActivation` 对 judge D3 已成功（真实 active 指针 + `d3Source:"judge"` 授权证据），故缺口仅位于 Runtime 包装层的角色模块事实白名单。修复属角色模块 owner（`d3-by` 接受集加 `"judge"`），**本批越界未改，等待协调方裁决另修**。本测试以断言钉住当前行为；修复落地后需同步更新该断言（会在测试失败中显式提示）。

### 5.2 `verifyReviewIntent` e2e 可达性（W-J2 缺口已补）

已用真实 Git candidate/review fixture 覆盖：`prepareReviewTask` 的 `readReviewMaterial → verifyReviewIntent` 全链通过。该链唯一的 `intent-confirmed` 冻结为 judge-delegated（无 customer/chief 记录），成功即证明 judge 分支按账本重放逐字段通过（含 G1 超长原值、`applicationId=intent-<requestId>`、`decision.event.at===frozenAt`）。负例组与 W-J2 J5 等价（`judgeIntentAuditMatchesSource` 同一条件组；W-J2 已取证负例），本批不重复构造负例历史篡改。

### 5.3 `doc.freeze` judge 分支无 producer（F3/Q10）

judge intent 冻结只写 R9 baseline；主测试断言真链账本 `doc.freeze` 事件数 = 0。J16/J17 为防御/未来路径，本批以 `freezeEvents` 镜像 + 真实 `appendTaskEvent/readTaskState` 校验覆盖（与 W-J2 `test/编排/trunk-events.test.ts` 的 J16/J17 只读回归 5/5 一致）。

### 5.4 回落/开关关闭

桌面层开关语义由桌面窗口 owner 的既有套件覆盖（本批未改 `app/**`）；本批在服务层以 `declined`/`unavailable`/来源不符负例证明「回落形状不产生冻结」，并在 `test/测试` 全量中运行既有 Q5 客户主权回归（第 12 例 ok）。

### 5.5 环境抖动（Node v24.22.1）

本环境存在既有 Node 原生 `node::CleanupQueue::Add` 断言崩溃与重型 e2e「测试本体通过但进程未退出」抖动（E3 §3.5 已登记；W7 证据同族）。本批以**原始夹具对照组**证明其与 W-J5 改动无因果，并保留全部样本。B2 判定时请按 BASE-3 增量口径处理（同候选隔离复跑通过即可排除；本批已提供 `isolated/` 全部原始 TAP）。

### 5.6 其它

未运行真实模型/Electron；未占用 9222；未提交/推送/合并/发布；未修改方案/B1/其它角色资料；未删除/弱化任何既有断言；未新增 skip/force-exit。

## 6. 证据

目录：`角色卡/测试/docs/change/2026-11-09_WJ5_judge-delegated-evidence/`

| 文件/目录 | 内容 |
| --- | --- |
| `pre/summary.tsv`、`post/summary.tsv` | 112/114 个测试文件逐文件 status/counts/exit/duration |
| `pre|post/<fixture-e2e>.tap` | git-action 家族 9 个 e2e + `git-role-workflows-e2e` 的前后 TAP（其中 5 个既有 `buildWriteChain` 消费方证明默认行为不变） |
| `compare/fails-{pre,post}.txt`、`fails-diff.txt` | 顶层失败标题集合与 diff（仅 +3 文件级合成条目） |
| `compare/skips-{pre,post}.txt`、`skips-diff.txt` | skip 集合（diff 为空） |
| `compare/per-file-diff.tsv`、`totals.tsv`、`normalized-totals.tsv`、`normalization-notes.txt` | 逐文件差、原始/归一化总计与归因 |
| `targeted/2026-11-09_judge-delegated-effectiveness.tap`、`…-doc-freeze.tap` | 新增测试独立运行（pass） |
| `targeted/suite-*.tap` | 新增测试在全量运行中的 TAP |
| `targeted/{trunk-events,task-state,orch-direct-role,orch-version-change-service}-{pre,post}.tap` | W-J2 J3/J4/J5/J8/J9/J10/J16/J17 只读回归 |
| `isolated/*.tap` | §4.3 同候选隔离复跑与原始夹具对照全部样本 |
| `runtime/wj5-main-freeze.json`、`runtime/runtime-artifact-summary.json` | 真实冻结记录/账本 judge 审计/authorization/D3 字节/缺口回执（含 G1 长度） |
| `typecheck-pre.txt`、`typecheck-post.txt` | `tsc --noEmit`（exit 0） |
| `run-suite.sh`、`compare.sh` | 逐文件运行器与对照脚本（可复算） |
| `candidate-hashes.txt` | HEAD/分支/Node、写集前后 SHA-256、未改文件前后一致、`git status --porcelain -- src app test` |

可复算要点：

- `test/测试/git-write-chain-fixture.ts`：before `b1b43b1e44a26656c4effda341b47d8f5a38d42c6cc5f13162e62e812196dbd4` → after `931948269f71fb8e8907cdedea12b668e843f62b079c08949f225a166e2c6de7`。
- 新增主测试 `7b0bf988560e6284f3fa069fe08684e20d5b211d036fe92a6f15670175c96a7b`；新增 doc-freeze 测试 `8ff9666272c4a85768393da8b4f1b802f606878c12d8848cfadf76471e96653f`。
- `test/测试/direct-role-capabilities-e2e.test.ts`、`test/测试/version-change-integration.test.ts`：before==after（`df73b205…`、`dd0ec8a0…`）。

## 7. Amendment（2026-11-09）：W-J2b 联动——第 5 节缺口断言改写为 Runtime 包装层 judge D3 成功正例

### 7.1 依据、范围与联动

- 任务：W-J5 的 Runtime 包装层缺口断言因 W-J2b amendment 失效，由**测试 owner**（本记录角色）改写为成功正例并留证（B1 v1.1 附录 **A.3 跨 owner 条件 / A.4-1**；协调方 2026-11-09 批准）。不改写则 AC-J7b 判 `insufficient evidence`。
- B1 v1.1：`docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`，SHA-256 `4cbb5df2507c2b30d43b37707cba305490ca8f8fc365b65e25a18f99b3693543`（附录 A 原样保存于 v1 正文之后）。
- W-J2b（nominator-code）：`角色卡/nominator-code/docs/change/2026-11-09_WJ2b_judge-d3-by.md`，SHA-256 `c2defed0a4d1afea1ead722a1a9f3ab7f26277d904f808b1b055194241a14187`；`src/common/roles/nominator/index.ts` `d3-by` 接受集加入 `"judge"`（单行；`7426b00f…` → `77fe423a016cd64cd85cdc25ece0086b1c39e0f84d66b914b881f0ba0a8abe9c`），`test/roles/nominator/` 25→27 全过、typecheck 0。
- 工作目录 worktree `.claude/worktrees/trunk-amendment`；基线 HEAD `fb1aa39e787934f334b9c164e4221074f97f6147`（分支 `feat/plan-escalation-card`，叠加 W-J1–W-J5 在飞改动）；Node v24.22.1。
- 写集：`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`、`test/测试/git-write-chain-fixture.ts`（必要夹具）、本记录与 `2026-11-09_WJ5_judge-delegated-evidence/amendment/`。**未改 `src/**`、`app/**`、其它角色测试/文档**；未提交/推送；未运行真实模型/Electron；未占用 9222。

### 7.2 旧断言 → 新断言（逐条记录，B1 v1.1 A.4-1）

旧断言（改写前文件 `7b0bf988…`，第 5 节 `:228-239`；实测改写前运行于新代码上失败：`actual 'committed-pending-recovery' / expected 'rejected'`，见 `amendment/before/2026-11-09_judge-delegated-effectiveness.tap`）：

| # | 旧位置 | 旧断言原文 | 新断言（`7c40f724…`） | 理由/依据 |
| --- | --- | --- | --- | --- |
| 1 | `:234` | `assert.equal(runtimeActivation.ok, false, "缺口：Runtime 包装层 judge D3 激活被 nominator d3-by 事实拒绝")` | `:244` `assert.equal(activation.ok, true, …)`（fixture `activationMode:"wrapper"` 经包装层完成激活的实际回执） | W-J2b 后 `d3-by` 接受 `"judge"`，旧缺口断言按设计失效；客户裁定「judge 代批必须生效」覆盖 D3/激活链；B1 v1.1 A.2-1/A.4-1 |
| 2 | `:235` | `assert.equal(runtimeActivation.status, "rejected")` | `:245` `assert.equal(activation.status, "applied")` | 同上；成功路径回执状态为 `applied`（真实 CAS 提交，非 no-op） |
| 3 | `:236` | `assert.match(String(runtimeActivation.message), /appointment-facts-invalid/)` | `:246-247` `errorCode` 缺省断言 + `doesNotMatch(message, /appointment-facts-invalid\|activation-not-ready/)` | 不得再返回旧拒绝码/旧失败门；负例改由 §7.4 的模块事实负例承担（不删除 fail-closed 语义） |
| 4 | `:238-239` | `exportWj5(…, { nominatorGap: { ok:false, status:"rejected", message } })` | `:293-298` `runtimeActivation`（ok/status/source/activationDigest/targetDigest）+ `activationNotifications` + `nominatorFacts` + `d3ByNegatives` + `d3ByPositive` | `nominatorGap` 已不存在；证据改为记录包装层成功回执、真实直投与 d3-by 负例 |

保留/新增的负例（不得删除 fail-closed）：

| # | 新位置 | 新断言 | 说明 |
| --- | --- | --- | --- |
| 5 | `:267-281` | 以真实 role-documents 事实包为底、仅替换 `d3By ∈ {"model","directive","",42}` ⇒ `allow:false`、`code:"appointment-facts-invalid"`、`messageKey:"role.nominator.preflight.factsInvalid"`；真实事实（`d3By:"judge"`）⇒ `allow:true`（`:282`） | 与 W-J2b `nominator-module.test.ts` 的既有负例同源；跨层测试内也钉住非法值仍拒绝 |
| 6 | `:284-291` | 同一已提交激活经包装层重放 ⇒ 仍 `ok:true/applied`；`recordDirectDelivery` 已记账的直投不再重复发送（`replayNotifications.length===0`） | 幂等/直投记账回归 |
| 7 | `:248-255` | 包装层回执 `source` 为真实 `role-direct`/`nominator`/`activate-role-documents`（`operationId="w7-activation"`）；直投收件人恰为 chief/convener/nominator 且幂等键含 operationId | AC-J7b-1「激活证据/快照与既有 success 路径一致」的字段级核对；`activationDigest` 64-hex（`:252`） |

### 7.3 实施改动

1. **夹具 `test/测试/git-write-chain-fixture.ts`**（`931948269f71fb8e8907cdedea12b668e843f62b079c08949f225a166e2c6de7` → `59700e5fab72796cb27fccfe4aaf0f35e9f83b324f4edfdedb20f981788d7ea7`）：
   - 新增 opt-in `activationMode:"wrapper"`：激活经 `createDirectRoleRuntime({projectRoot, actorRoleId:"nominator", notifyDirect}).activateRoleDocuments(...)` 的**完整包装层**完成（真实 nominator Core active `activate_role_documents` 回合 + 真实 host inventory + 真实 `recordDirectDelivery` 记账），断言 `ok:true/status:"applied"`；返回新增 `activationNotifications`（收件人）。
   - `runtime`（既有）与 `service`（缺省）分支行为逐字不变；仅 `runtime` 分支多一条对两份回执共有的 `ok:true` 断言（applied ⇒ ok 恒真，无行为变化）。5 个既有 `buildWriteChain` 消费方前后计数见 §7.5。
2. **主测试 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`**（`7b0bf988…` → `7c40f724683cfbfaaad4b97a879bb43a59611a282e3a3fc13ab79023e487fcdd`）：
   - 主链 `activationMode: "service"` → `"wrapper"`：激活本身经 Runtime 包装层执行（fresh 准备 → 三文档 G 校验 → nominator preflight[d3By:"judge"] → Git 激活发布 actor 证明/授权/lease/CAS 提交 → 直投）。
   - 第 5 节按 §7.2 改写；文件头/测试标题同步；导出字段 `nominatorGap` → `runtimeActivation` 等。
   - `git write-chain` 的 judge intent/D3 夹具（W-J5 既有）不变。
3. **如实披露（不得误读为伪造成果）**：本链的激活在 fixture 阶段经包装层**新提交**（非重放已有 journal）：包装层内部走 `prepareRoleActivation`（全新准备）→ `executeGitActiveRolePublication` 的 `prepareActivationCommit`（prepare-only）→ 真实 actor/授权/lease → `commitPreparedActivation`（CAS 提交）→ 直投记账；第 5 节的 `prepareRoleActivation` 重放用于核对事实包，随后的包装层重放用于幂等断言（`applied` 恢复回执，`finish()` 以 active 指针/账本字节比对）。包装层直投 sink 由测试提供（生产宿主由桌面会话提供）；`recordDirectDelivery` 为真实磁盘记账（`.ans/trunk/deliveries/`）。缺省 sink 时包装层如实返回 `committed-pending-recovery`（改写前旧断言失效时的实测值，已留证）。

### 7.4 新第 5 节覆盖（AC-J7b-1/2/5 映射）

| AC-J7b 判据 | 新断言/证据 |
| --- | --- |
| 1. Runtime 包装层生效（`ok:true`/applied，不再 `appointment-facts-invalid`/`activation-not-ready`） | `:244-247`；回执 `runtimeActivation` 见 `amendment/after/runtime/wj5-main-freeze.json` |
| 1. 事实自洽（`d3By:"judge"`、judge 审计/`operatorId`/`decisionId=decision-<requestId>`） | `:257-265`（重放事实包 `d3By:"judge"`、`d3DecisionId==="decision-w7-d3-request"`）；D3 账本字节与 authorization 由既有第 3 步断言覆盖 |
| 1. 激活证据/快照与既有 success 路径一致 | `:248-255`（source/applicationId/journalId/targetDigest/activationDigest） |
| 2. 接受集 customer/chief-delegated/judge；非法值仍 `appointment-facts-invalid`；其它事实键/错误码不变 | `:267-282`；W-J2b `test/roles/nominator/` 27/27（只读联动，见 7.1） |
| 5. W-J5 Runtime 包装层缺口断言改写为成功正例并记录 | 本节 §7.2/§7.3/§7.5 |

### 7.5 运行记录（Node v24.22.1；`node --test --test-concurrency=1`；外部 watchdog 300s，与 W-J5 `run-suite.sh` 同口径）

命令：`bash 角色卡/测试/docs/change/2026-11-09_WJ5_judge-delegated-evidence/amendment/run-related.sh <outdir>`
（7 个文件：新增 2 个 + `buildWriteChain` 的 5 个消费方；before=改写前工作区[旧断言×W-J2b 代码]，after=本 amendment）。

| 文件 | before（改写前） | after（本 amendment） |
| --- | --- | --- |
| `2026-11-09_judge-delegated-effectiveness.test.ts` | natural；tests 1 / pass 0 / fail 1 / skip 0；exit 1；64s（旧断言按设计失效：`actual 'committed-pending-recovery'` vs `expected 'rejected'`） | natural；1 / 1 / 0 / 0；exit 0；65s（套件内）；独立首跑 68.6s（`after/effectiveness-first.tap`） |
| `2026-11-09_judge-delegated-doc-freeze.test.ts` | natural；2 / 2 / 0 / 0；exit 0 | natural；2 / 2 / 0 / 0；exit 0 |
| `git-run-stop-host-continuation-e2e.test.ts` | natural；1 / 1 / 0 / 0；exit 0；49s | natural；1 / 1 / 0 / 0；exit 0；49s |
| `git-action-delivery-claude-e2e.test.ts` | natural；1 / 0 / 1 / 0；exit 1；69s（Node v24.22.1 原生 `CleanupQueue::Add` 崩溃，测试体未刷出；同状态隔离复跑 PASS 89.5s exit 0） | natural；1 / 1 / 0 / 0；exit 0；93s |
| `git-action-activation-e2e.test.ts` | natural；1 / 1 / 0 / 0；exit 0；48s | natural；1 / 1 / 0 / 0；exit 0；48s |
| `git-action-commit-pi-e2e.test.ts` | hang(300s)；2 / 1 / 1 / 0；exit 124；300s（测试本体 `ok 1` 55.7s，进程未退出 ⇒ 文件级合成 `not ok`） | natural；1 / 0 / 1 / 0；exit 1；24s（Node v24.22.1 原生 `CleanupQueue::Add` 崩溃，测试体未刷出；同候选隔离复跑 PASS exit 0，见 §7.6） |
| `git-action-commit-claude-e2e.test.ts` | natural；1 / 1 / 0 / 0；exit 0；56s | natural；1 / 1 / 0 / 0；exit 0；56s |
| **合计（原始）** | 9 / 6 / 3 / 0 / 0 | 8 / 7 / 1 / 0 / 0 |
| **合计（归一化：去除文件级合成条目）** | 7 / 6 / 1 / 0 / 0（唯一测试级失败 = 旧缺口断言；delivery 崩溃无测试级结果） | 7 / 7 / 0 / 0 / 0（唯一 raw fail = commit-pi 原生崩溃的文件级合成条目） |

结论：**新增确定性测试级失败 = 0；新 skip = 0；无预存红项恶化**；旧缺口断言改写后由红转绿（before 的唯一测试级失败即该旧断言）。before 的 delivery 原生崩溃与 commit-pi 进程未退出、after 的 commit-pi 原生崩溃均为本环境既有抖动族（E3 §3.5 / W-J5 §4.3；隔离样本见 `amendment/isolated/`）：delivery、commit-pi 均以同状态/同候选隔离复跑 PASS 排除（§7.6）。

### 7.6 环境抖动（如实记录，非候选因果）

- before `git-action-delivery-claude-e2e`：套件内进程触发 Node v24.22.1 原生 `node::CleanupQueue::Add` 断言崩溃（`exitCode 134`，测试体未刷出；E3 §3.5 / W-J5 §4.3 已登记）。**同一改写前状态**的隔离复跑（`--test-concurrency=1`）PASS 89.5s、exit 0（`amendment/isolated/delivery-claude-before-rerun.tap`）；after 套件内同文件自然 PASS 93s。
- before `git-action-commit-pi-e2e`：测试本体 `ok 1`（55.7s），进程在 300s watchdog 内未退出 ⇒ 文件级合成 `not ok`（exitCode 143；W-J5 §4.3「测试本体通过但进程未退出」同族）。
- after `git-action-commit-pi-e2e`：套件内 24s 处触发同一 Node v24.22.1 原生 `node::CleanupQueue::Add` 断言崩溃（`exitCode 134`，测试体未刷出）；**同候选**隔离复跑（`--test-concurrency=1`）PASS exit 0（`amendment/isolated/commit-pi-after-rerun.tap`）。
- 本 amendment 对 `service` 模式消费方的行为改动为零（新分支不被其取用）；上述抖动与本候选无因果关系，按 B1 BASE-3 增量口径处理、全部原始样本保留。

### 7.7 证据与哈希

证据目录：`角色卡/测试/docs/change/2026-11-09_WJ5_judge-delegated-evidence/amendment/`

| 文件 | before | after |
| --- | --- | --- |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | `7b0bf988560e6284f3fa069fe08684e20d5b211d036fe92a6f15670175c96a7b` | `7c40f724683cfbfaaad4b97a879bb43a59611a282e3a3fc13ab79023e487fcdd` |
| `test/测试/git-write-chain-fixture.ts` | `931948269f71fb8e8907cdedea12b668e843f62b079c08949f225a166e2c6de7` | `59700e5fab72796cb27fccfe4aaf0f35e9f83b324f4edfdedb20f981788d7ea7` |
| 本记录 `2026-11-09_WJ5_judge-delegated.md` | `b8d7a93301fc184a21d51dadb7036aab225bc4d83c1db4f06f94b63544849a56` | 见 `amendment/evidence-manifest.txt`（记录自哈希不入正文） |

目录内容（全部原始样本）：`amendment/before/summary.tsv` + 每个文件 TAP；`amendment/after/summary.tsv` + TAP（含独立首跑 `effectiveness-first.tap`）；`amendment/after/runtime/wj5-main-freeze.json`（套件内运行导出的包装层回执/直投/事实包/负例）与 `…first-run.json`（独立首跑同内容）；`amendment/isolated/`（隔离样本）；`amendment/compare/`（`compare.sh` 前后对照：失败/跳过标题集合与逐文件计数）；`amendment/typecheck-after.txt`；`amendment/run-related.sh`、`amendment/compare.sh`、`amendment/evidence-manifest.txt`（逐文件 SHA-256，可复算）。

可复算要点：
- `node --test --test-concurrency=1 --test-reporter=tap "test/测试/2026-11-09_judge-delegated-effectiveness.test.ts"`（独立首跑 1/1 pass，68.6s，exit 0）。
- `ANS_WJ5_EVIDENCE_DIR=<dir> bash …/amendment/run-related.sh <outdir>`；`bash …/amendment/compare.sh <before> <after> <compare>`。
- `npm run typecheck`（`tsc --noEmit`）after：exit 0（`amendment/typecheck-after.txt`）。

### 7.8 边界与状态

- 本 amendment 只改 `test/测试/`（上述 2 文件）与本记录/证据；**未改 `src/**`、`app/**`、其它角色测试/文档**（`src/common/roles/nominator/index.ts` 为 W-J2b 产物，只读消费）。
- 未运行真实模型/Electron；未占用 9222；未提交/推送/合并/发布；未新增 skip/force-exit；未删除 fail-closed 断言（非法 d3-by 负例在 §7.2-5）。
- 状态：**amendment 已实施；W-J5 相关 7 文件 before/after 对照完成（新增确定性测试级失败 0、新 skip 0）；typecheck exit 0；未独立验收（B2 由验收身份按 B1 v1.1 判定）。**

