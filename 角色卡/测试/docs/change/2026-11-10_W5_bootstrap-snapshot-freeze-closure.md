# W5：bootstrap 快照/冻结闭包冲突修复 —— 跨角色集成批（测试）实施记录

- 日期：2026-11-10；角色：ans-studio 固定 worker「测试」（roleId: 测试）；独立验证上下文。
- 变更：T3「bootstrap 快照单槽位与冻结闭包要求互相矛盾」**W5 集成批（B3）**：真实 service/store/Git 对象上的 bootstrap 4-target 全链、候选/发布 policy verdict、负例矩阵、T19 允许集边界与旧路径回归。
- 方案依据（P1.1）：`docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`，**477 行 / 68,367 bytes / SHA-256 `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0`**（§2.1/§2.4/§3.2/§3.3/§5.1；B3 写集 §4.1、S6）。
- 复核依据（R1.1，含 R1.0）：`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`，**263 行 / 43,407 bytes / SHA-256 `17453813867397bb028c851c8bedbcb1ddf5d479e959f685d3dab3f862e76a0e`**。
- 实施前验收标准（B1 v1）：`docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`，**256 行 / 49,013 bytes / SHA-256 `9b7fa81cf4db2bb843691c88e929d49bd193a1f73d0944be3c329b41c6e0bc8b`**；本批对应 AC-1/AC-3/AC-4/AC-6/AC-7/AC-9/AC-10/AC-13 的跨层证据与 T1/T2/T3–T7/T17/T18/T19 的 L3 部分。
- 在飞批次只读依据（不属本批写集）：W1 记录 `角色卡/编排/docs/change/2026-11-10_W1_bootstrap-snapshot-freeze-closure.md`（**145 行 / `0ffe52c8e9a538fd318929adb41f37868aadcc200fbf7d183bec0acf25eb2308`**）；W2 记录 `角色卡/门禁引擎/docs/change/2026-11-10_W2_bootstrap-snapshot-freeze-closure.md`（**149 行 / `37249c423db2d56615a892706ec213d6a30bce6878c722b39cf8fb42eaf2126b`**）。
- 缺陷记录（只读）：`docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`（36 行 / 2,733 bytes / `63f6e239ddbb1d447553b3404c28450c21f868c267a3a7e47f69a4188c816a82`）。
- 基线（开始时与结束时实测）：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/bootstrap-snapshot-freeze-closure`；HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）；Node **v24.22.1** / npm 11.19.1。
- 状态：**W5 已实施**；新增集成测试 **9/9 pass**（0 fail / 0 skip）；W1 定向 14/14、W2 定向 7/7、`git-shell-acl` 39/39、`judge-delegated-effectiveness` 1/1 前后不变；`version-change-integration` 12/3/9（9 条均为既有 B0 红，仅登记不作 pass 证据）；`npm run typecheck` exit 0；**未发现 W1/W2 实现缺口**；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。

## 0. 与其它批次的关系（并发如实记录）

- 本批期间 **W1（编排）/W2（门禁引擎）改动在同一 worktree 在飞**：`src/service/trunk/impl/apply-journal.ts`（M）、`src/common/门禁引擎/classify-shell.ts`（M）、`test/编排/bootstrap-frozen-closure.test.ts`（新）、`test/门禁引擎/freeze-closure.test.ts`（新）。本批**零编辑**这些文件；证据时点实测产品文件 SHA-256 与 W1/W2 记录一致：
  - `apply-journal.ts` = `d0a3fdf27bcdada86258406d73e7ff630543f3f9c5b0585f14b9ef4629430cd4`（W1 记录同值）；
  - `classify-shell.ts` = `b4b98a5a4e001f2294c65b04e119b34e7b7a369c69cede856e7458627d54ad1b`（W2 记录同值）。
- 本批**未改** `test/测试/git-write-chain-fixture.ts`（S6：优先新增独立测试文件；该 683 行共享 fixture 的 6 个依赖套件因此零回归面）、产品代码、schema/数据模型、角色卡/边界/其它文档。
- `docs/communication/memo.md`（M）与 `.tmp-*`/`.commit-msg-*`/`.pr-body-*` 等为工作树既有历史产物，不属本批写集，未触碰。

## 1. 写集与候选（严格按角色 Section 1）

| 文件 | 状态 | 行 / 字节 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `test/测试/bootstrap-frozen-closure-integration.test.ts` | 新增（??） | **702 / 54,143** | **`f949bfa4cb4723344c7c87fd475d2d6d804c4019032f8e2d7b7f05c216373338`** | +702 / −0 |
| `角色卡/测试/docs/change/2026-11-10_W5_bootstrap-snapshot-freeze-closure.md` | 新增（本记录） | 写盘后实测（随回报） | 写盘后实测（随回报） | 新增 |
| `角色卡/测试/docs/change/2026-11-10_W5_bootstrap-snapshot-freeze-closure-evidence/` | 新增（证据目录，22 文件） | 见 §6 | 见 §6 | 新增 |

- **实现候选聚合**（按路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联的 SHA-256；单文件候选）：`8916adab2a43c34d8b0b70e16ffa851f5b6fa1107597b65c14eb3fe7eb2ec6b7`。
- 写集外 `src app test`：`git status --porcelain -- src app test` 实测仅 W1/W2 在飞 4 文件 + 本批新增测试文件；本批对 `src/`/`app/` 与其它测试文件的 diff = **0**；未删除/重命名、未新增依赖、未改构建/发布配置。
- **未使用既有 9 条 B0 红作为 pass 证据**（见 §3.3）。

## 2. 实现要点（P1.1 §4.1 B3；B1 AC-1/3/4/6/7/9/10/13）

新增 `test/测试/bootstrap-frozen-closure-integration.test.ts`（不使用 `git-write-chain-fixture.ts`，避免共享 fixture 回归面；不复制其桩件，直接组合真实 service/store）：

### 2.1 真实 bootstrap 前态（`buildBootstrapChain`）

- 真实临时项目根（`realpath(mkdtemp)`）+ 8 份 RR19 文档（intent v1、proposal v1/v2、architecture v1/v2、roster v1/v2、modules v1）。
- **真实 Git init**：真实 init 任务 + immutable `repository-work-source/v1` + draft run → `createGitCapabilityService.prepareInitialization/executeInitialization`（真实 host mutation lease、真实 `.ans/trunk/operations/<sha>/init.json`、真实 `.git`）。
- **真实 intent 确认**：`prepareIntentConfirmation` + 真实 `request.created/resolved` 账本事件 + `finalizeIntentConfirmation` → 真实 R9 `intent-confirmed` 冻结行（customer 来源）。
- **RR19 历史账本**：2 条 intent 草稿旧行（baseline/draft-updated）与 3 条 proposal/roster 草稿旧行（version-added/draft-updated）以 fixture 字节落盘（代表「原位改写后不可恢复的历史中间态」，与 RR19 `versions-final.jsonl` 前序行同形；**不是本测试产生的冻结/快照/引用效果**）；7 份历史/当前文档的 `migrated-legacy` 冻结行经**真实注册表写入器** `appendDocFreezeRecords` 追加（读真实磁盘字节复核 sha）。
- **真实 product document-preparation 任务**：chief 原始 work source（`purpose:"document-preparation"`、`initializationOperationId` 绑定真实 init）+ `recordTaskObservation` 真实账本 + draft run，供 `prepareDirectAuthority` 的发布任务/来源校验。
- 不绑定任何 Core 会话（只用 service/store 层）；多个临时根互不干扰（Core 注册表/H12 进程级约束不触发）。

### 2.2 受支持 bootstrap 全链（T1；AC-1/AC-4/AC-9）

- 真实 `prepareDirectSubmission`（4 current-version targets：proposal v2 / architecture v2 / roster v2 / modules v1；`baseTrunk:null`；`expectedFromSha256:null`）→ 快照 **9 文件**（8 frozen 文档含 intent v1 + `.ans/state/versions.jsonl`），按 path 字典序，每文件 sha256 = 磁盘原始字节，账本 frozen 记录 sha = 磁盘字节，5 条草稿旧 sha 均不在快照。
- 真实 `vca.prepareDirect` 接受（RR19 的 `vca-target-invalid / "Target bytes absent from complete snapshot"` 拒绝点消除）。
- 真实 `prepareDirectCommit`（`materializeManifestFiles` + 真实候选 plan）→ 真实 `prepareDirectAuthority` → 真实 `checkGitPolicy`：
  - candidate `allowed:true`（inputDigest `aca836aee…`）、publication `allowed:true`（inputDigest `52256ac8e…`），无 `git-policy-app-freeze-closure` / `git-policy-raw-write-scope`；
  - 历史 v1 文档在候选树中为真实 `snapshot-content`（`appGeneratedFiles` 实测），`versions.jsonl` 为 `frozen-application-evidence`（M2 允许集来自 frozen 证明）。
- 真实 `commitPreparedDirect` → t1：manifest `trunkVersion:1`、真实 `refs/ans/trunk`、真实 `refs/ans/candidates/<sha(operationId)>`、真实已发布 journal（`createGitRefStore.readJournal` phase `published`）、真实快照文件；真实 `vca.finalizeDirect` → `status:"applied"`。
- 提交副作用（如实）：4 个 target 的 `migrated-legacy` 冻结经**真实迁移确认**追加 `role-direct-applied` 行（`confirmsMigratedPublication` 全链：提交 journal/commit 字节/快照/文档 ref 证明）；冻结保护不弱化。

### 2.3 负例矩阵（AC-3/AC-6/AC-9；M1/T2–T7/T17/T18）

| 用例 | 观察（真实链路） |
| --- | --- |
| T2 7-target 同 kind 多版本 | service `trunk-item-invalid`（消息含 slot/「assembled from R9」）→ 全链 `vca-target-invalid`；无 manifest/ref/operation snapshot |
| T3 缺 frozen 文件 | `Frozen closure file is missing/unreadable: docs/proposals/demo-proposal-v1.md`；无副作用 |
| T4 frozen 文件漂移 | `Frozen closure hash drift: …demo-proposal-v1.md`；无副作用 |
| T5 frozen 文件不可读 | 注入 store 读取失败（故障注入）→ 同上 missing/unreadable；无副作用 |
| T6 坏行 / 未知 event / 非法 freeze | 真实注册表整体 `baseline-corrupt` fail-closed（不跳过）；全链 `vca-target-invalid`；无副作用 |
| T7 同 path 两种 sha | 注入注册表意图证据 sha ≠ frozen 记录 → `Frozen closure path conflict: docs/product/demo-intent-v1.md`；无副作用 |
| T17 异 flow 冻结行 | 真实注册表追加 `other-proposal-v1` → `Frozen closure record belongs to another flow: other`（逐行、不静默过滤）；无副作用 |
| T18 `-vN` 后缀 ≠ record.version | 真实注册表 `baseline-corrupt` fail-closed；注入注册表下服务侧防御性 `Frozen closure record version differs from its path: docs/proposals/demo-proposal-v2.md`；无副作用 |
| T19 未证明 snapshot-content | 门禁层一致事实（W2 同口径、真实 Git 对象 + 真实 digest 算法）：candidate/publication 均 `git-policy-raw-write-scope`；补 frozen 证明后均 allowed（允许集只接纳证明路径） |

### 2.4 旧路径回归（AC-7）

- t1 之后真实非 bootstrap direct（proposal v2→v3 modify）：快照仅 `directRefs(target)` 当前槽位（proposal v3 + 未变 architecture v2/roster v2/modules v1），**不含** `versions.jsonl`/intent/历史 v1（旧行为逐字不变）；`vca.prepareDirect` 非 bootstrap 路径接受。
- t1 之后真实 `prepareTeamPlanCommit`（convener；真实 roster/modules/plan 解析）：team-plan 快照 = `directRefs(target)` + 其自身 plan-completion marker，**不含** `versions.jsonl`/历史冻结文件（冻结账本收集只在 bootstrap direct 生效）。
- **initial-workflow**：本文件不重驱（需 stable-write 请求/批准/真实写入/绑定链，属其它套件/RR20）；其 policy 分支不变由同批 `test/门禁引擎/git-shell-acl.test.ts` 39/39 全量回归（含 initial-workflow/团队计划/激活/raw-object 预算用例）覆盖，如实披露不作本文件断言。

## 3. 测试与运行记录

命令在 worktree 根执行；Node v24.22.1；日志在证据目录并逐文件 SHA-256 见 §6。

### 3.1 本批新增测试

`node --test --test-concurrency=1 --test-reporter=tap "test/测试/bootstrap-frozen-closure-integration.test.ts"` → **9 tests / 9 pass / 0 fail / 0 skip，exit 0**（duration 20,454 ms；日志 `w5-integration.tap.txt` = `a5fcb9bcef105b661f69bd9d4ea918aad1a9d21c80b8fc97d2cd83d484a90f23`）。定稿前的迭代版本曾出现 3 处**本文件自身 fixture/断言**失败（architecture 版本链引用、team-plan 快照含自身 marker、非 bootstrap 快照含未变槽位），均已修正；不属于候选证据。

| # | 用例 | 覆盖 |
| --- | --- | --- |
| 1 | T1 bootstrap 4-target 全链 9 文件/verdicts/t1 | T1、AC-1/4/9 |
| 2 | T2 7-target 多版本拒绝 | T2、AC-3、M1 |
| 3 | T3 缺失/漂移/不可读 | T3–T5、AC-6 |
| 4 | T6 坏行/未知 event/非法 freeze | T6、AC-6 |
| 5 | T7 同 path 冲突 | T7、AC-6 |
| 6 | T17 多 flow 逐行拒绝 | T17、AC-6 |
| 7 | T18 后缀版本防御 | T18、AC-6 |
| 8 | T19 未证明 snapshot-content | T19、AC-4、N2 |
| 9 | 旧路径回归（direct/team-plan） | AC-7 |

### 3.2 before/after（同命令、同 Node、同一机器）

| 套件 | before | after | 失败/skip 变化 | 日志 SHA-256（before → after） |
| --- | --- | --- | --- | --- |
| `test/编排/bootstrap-frozen-closure.test.ts`（W1 定向） | 14 / 14 pass / 0 fail / 0 skip，exit 0 | 14 / 14 / 0 / 0，exit 0 | 无 | `5cf9d0ec…` → `41b20086…` |
| `test/门禁引擎/freeze-closure.test.ts`（W2 定向） | 7 / 7 / 0 / 0，exit 0 | 7 / 7 / 0 / 0，exit 0 | 无 | `23894832…` → `e240254b…` |
| `test/门禁引擎/git-shell-acl.test.ts` | 39 / 39 / 0 / 0，exit 0 | 39 / 39 / 0 / 0，exit 0 | 无 | `e470d77d…` → `afd46575…` |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（直接调 `checkGitPolicy` 的跨角色套件） | —（本批新增检查） | 1 / 1 / 0 / 0，exit 0 | 无 | `86e60e14…` |
| 本批新增集成测试 | 不存在（新） | **9 / 9 / 0 / 0，exit 0** | +9 pass | `a5fcb9bc…` |
| `npm run typecheck` | exit 0（`22d52cc9…`） | exit 0（`22d52cc9…`，输出逐字相同） | 无 | `22d52cc9…` |

- **新增确定性失败 = 0、新 skip = 0、已知红不恶化**。
- `git-shell-acl` 的一次 after 运行在 39 个用例全部 `ok` 后进程未退出（环境抖动，TAP 完整但无 summary/exit）；按 BASE-3 以**同候选隔离复跑**通过（87,526 ms，exit 0）并在本记录与证据中采用复跑日志；如实披露该次抖动。

### 3.3 既有 B0 红（只登记，不作 pass 证据）

- `test/测试/version-change-integration.test.ts`：**12 tests / 3 pass / 9 fail / 0 skip，exit 1**（日志 `add6e5ce…`）。9 条失败与 W1 记录及既往 B0 名单逐条同名（VCA product/detail/拒绝/发起角色/toSha256/AC-5×2/bootstrap VCA/冻结 missing），错误均为既有 P3.1 产品决策「former customer approval channel is closed」（`vca-channel-unavailable`，早于本变更路径）；与本批新增测试文件无因果。**不得**作为本批 pass 证据。

### 3.4 证据敏感性说明（如实）

本批**未**为取得「旧代码失败」敏感性证据而回退/暂存产品文件（遵守 W1/W2 在飞写集不得修改/回退的纪律）；敏感性由 W1/W2 各自记录的证据承担（W1：14/14 定向；W2：新测试 vs HEAD 1 pass/6 fail）。本批的 9 条用例全部依赖 W1+W2 同批次实现，未与旧代码对照复跑。

## 4. 候选身份与稳定性

- 本记录与证据时点：HEAD `0ab2584…`（tree `d6c2158d…`）、分支 `feat/bootstrap-snapshot-freeze-closure`；无新提交/暂存；未提交/推送/合并/发布。
- 候选测试文件 raw SHA-256 `f949bfa4…`、聚合 `8916adab…`；产品在飞文件 SHA-256 与 W1/W2 记录逐字一致（§0）。
- 证据运行后未再修改候选文件；`t1-snapshot-9-files.json` / `t1-policy-verdicts.json` 中的 snapshotId/digest 为该证据运行的实际值（账本 `recordedAt` 使用真实时间戳，跨运行 digest 会变化；同输入重放确定性由 W1 T16 钉住，不在本文件重复宣称）。

## 5. 限制 / 披露（如实）

1. **层级边界**：本批是 L3 跨角色集成（真实 service/store/Git 对象 + 真实 `prepareDirectSubmission`/`checkGitPolicy`/`materializeManifestFiles`/`commitPreparedDirect`），**不是** L4 真实运行（RR20）。生产 `submitDirect` 的 Core 工具派发/actor-proof 包装（`executeGitBusinessPublication` 的 `inspectGitActionAuthorization` + `.ans/trunk/operations/<sha>/authorization.jsonl` sidecar）不在本层驱动：candidate/publication 的两个 policy verdict 直接取自该函数同源的 `authority.candidatePolicyInput/publicationPolicyInput`，其余链路（commit/journal/ref/CAS）全部真实执行。sidecar/真实 UI 由 e2e 套件与 RR20 覆盖。
2. **fixture 输入 vs 生产效果**：历史草稿旧行（5 条）与历史 `migrated-legacy` 冻结的记录存在性由 fixture 准备（后者经真实注册表写入器落盘并复核磁盘 sha）；intent 冻结、bootstrap 快照、journal、candidate/trunk ref、t1 manifest、role-direct-applied 迁移确认追加均为真实生产写入，**无伪造**。
3. **T19 为门禁层一致事实**：服务侧装配按构造只纳入槽位/已确认意图/frozen 证明/账本文件，结构上不产生未证明 `snapshot-content`；T19 以 W2 同口径（真实 Git 对象 + 真实 complete-snapshot digest 算法）构造门禁事实并钉住允许集边界，不宣称服务装配产物、不冒充 snapshot/journal。
4. **initial-workflow 未在本文件重驱**（需 stable-write 批准/写入/绑定链）；其 policy 分支回归由 `git-shell-acl` 全量 39/39 覆盖（§2.4/§3.2）。
5. **Core 会话**：chain 的 work source `parent.sessionId` 为 fixture 字面量（service 层只校验非空字符串），不绑定真实 Core 会话；本层不宣称 actor-proof。
6. **已知 B0 红**：`version-change-integration` 9 红为既有产品决策，不在本批修复范围，不作 pass 证据（§3.3）。
7. **规模/多 flow**：闭合集合随 frozen 版本数线性增长；raw-object 预算（128 文件/单文件 1 MiB/整单 4 MiB/树条目 2048）未提升；含异 flow 行的项目仍不能 bootstrap（逐行 fail-closed，本批 T17 钉住）。本批 9 文件约 6.7 KB 原文，远低于预算。
8. **未运行**：真实模型（deepseek-v4-flash 等均未涉及）/Electron/CDP 9222/9223；未跑 RR20；未提交/推送/合并/发布；未修改方案/B1/复核/角色卡正文/边界/产品代码/其它测试。
9. **W1/W2 缺口**：本批全链通过，**未发现**需要停止上报的 W1/W2 实现缺口（含提交期 migrated-legacy → role-direct-applied 迁移确认、M2 允许集、9 文件装配）。
10. **记录自身**：本文件行数/字节/SHA-256 无法内嵌，写盘后实测并随回报提交。

## 6. 证据目录

目录：`角色卡/测试/docs/change/2026-11-10_W5_bootstrap-snapshot-freeze-closure-evidence/`（22 文件）

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `w5-integration.tap.txt` | 本批新增集成测试 TAP（9/9/0/0，exit 0） | `a5fcb9bcef105b661f69bd9d4ea918aad1a9d21c80b8fc97d2cd83d484a90f23` |
| `t1-snapshot-9-files.json` | T1 实际快照：snapshotId/digest + 9 文件 path/sha256/bytes | `5f1c13cee8e510102a5e757f2b041a76e555ee2e5dfc9154edfac6dedc176fd4` |
| `t1-policy-verdicts.json` | T1 candidate/publication verdict（allowed、inputDigest）+ businessPublication + t1 manifest | `953f81810f687edb838d6ec496737c8722b1916a84860409b88f40f3fea502d4` |
| `t1-ledger-frozen-after-commit.json` | 提交后 R9 账本 frozen 行（intent-confirmed / migrated-legacy / role-direct-applied） | `50710440147f17d45f03c3e84cb2dd94edd0945be531fd3959b547072633964a` |
| `t19-verdicts.json` | T19 未证明（raw-write-scope）/证明后（allowed）两 verdict | `dcea22c133eab00b5e94a5f55b669c7ecff7fcd2161e8ca3f55b3e9f4b766335` |
| `negative-w5-t2-seven-targets.json` | T2 service/全链 code+message | `da4f4b39ff333799179e505c5774fe878723c020f5f5474ed2f5709ac5fc795e` |
| `negative-w5-t3-missing.json` | T3 缺 frozen 文件 | `64d4f0dd6c8b0a00f49214f7715767817827259f096f63b4ee20db680ec33eb1` |
| `negative-w5-t4-drift.json` | T4 漂移 | `e18641beb3fbb115f44092a143d6d25b9057bdc0935ee0540f6fa8fabbc3fc96` |
| `negative-w5-t6-bad-line.json` | T6 坏行 | `ec2757b1c1dde0316c2042a91e5b21691defbd6a656be1e4563f963d5ac94aee` |
| `negative-w5-t6-unknown-event.json` | T6 未知 event | `6347af4cf64858745fe4c63b80665d93b69db78c0192e0f9092119e59e79d15a` |
| `negative-w5-t6-invalid-freeze.json` | T6 非法 freeze 形状 | `dbf9c93c150dc6f220b4ae58607b41fdf6a98cb0ed786e596cbe949e5cfaa059` |
| `negative-w5-t17-foreign-flow.json` | T17 异 flow 逐行拒绝 | `0162861bc852f6cbeb81bcd6800e98884909a118c26d956deeff935419ab3d10` |
| `negative-w5-t18-suffix-real.json` | T18 真实注册表拒绝 | `a623cc4235a47f6198bd14305e88e524637400ca0ac981665c804d7d8e5d2811` |
| `before-w1-bootstrap-frozen-closure.tap.txt` | W1 定向 before（14/14） | `5cf9d0ec74f89ba9a40413faddcf07f93a8ecbd1eb2b2de50b3d6fa080cad57a` |
| `after-w1-bootstrap-frozen-closure.tap.txt` | W1 定向 after（14/14） | `41b20086601d9e71a68baf0f293f676f8eaf9bd8d7228bb67d28e9945a61da5a` |
| `before-w2-freeze-closure.tap.txt` | W2 定向 before（7/7） | `2389483235b0fd2ab3735367414f166c9f2c8e10cc66be389d33d8f230913871` |
| `after-w2-freeze-closure.tap.txt` | W2 定向 after（7/7） | `e240254b6d365bbe918b052593aaf8a26a5b61339c3c5a43ac2dd3242db8613c` |
| `before-git-shell-acl.tap.txt` | git-shell-acl before（39/39） | `e470d77d9a4e712f186dd56a2512524f23e171da2596f00622e11c30b005b730` |
| `after-git-shell-acl.tap.txt` | git-shell-acl after 隔离复跑（39/39，exit 0） | `afd46575950422f091055ed05d819defdb9cd0566368c21cbfe8c4bb59eef2b4` |
| `after-judge-delegated-effectiveness.tap.txt` | `judge-delegated-effectiveness`（1/1） | `86e60e1449f2a18f999b7849a39d6489454a813d60e1614ca1f1aadf53533690` |
| `after-version-change-integration.tap.txt` | 既有 B0 红登记（12/3/9，exit 1） | `add6e5cea8feb04573f7f04ceac73c304e3ea359d3c2042310ac4b92f647de7a` |
| `typecheck.txt` | `npm run typecheck`（exit 0） | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |

- TAP 日志 hash 以证据目录内落盘文件为准；before 日志取自本批开工基线（W1/W2 在飞状态），after 取自本批候选状态。

## 7. 未提交声明

本批未提交、未推送、未合并、未发布；未创建 tag；未运行真实模型/Electron；未占用 9222/9223。候选与证据均待独立验收（B2/D1）复判。

**（完）**
