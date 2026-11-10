# 桌面窗口批次变更记录：T3 两条固定工作流路径 B3 桌面/卡片（真实 Git 端口 / merge-main / A9 基线 / A12 归档 / 路径 B / fixed 面板）

- 批次：**B3 桌面/卡片**（团队计划 §三 B3「桌面窗口」行 + 任务精确写集）
- 角色 / 上下文：桌面窗口（roleId `桌面窗口`，独立固定上下文）
- 日期：2026-11-10；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  分支 `feat/two-fixed-workflow-paths`；基线 HEAD **`80bc3b6`**（B0–B3 编排已提交；
  `git status --porcelain -- src app test` 开工时为空）
- 状态：**已实现，未提交**；`npm run typecheck` **exit 0**；新增桌面测试 **30/30 pass**
  （`b3-workflow-git-real` 9 + `b3-release-merge-desktop` 7 + `b3-fixed-baseline-pathb` 6 + `b3-fixed-cards-panel` 8）；
  受影响桌面套件 before/after **失败名集合逐名一致**；只读回归 `test/编排` **1,291/1,265/24/2**
  （24 失败名与 B3 编排记录逐名一致）、`test/roles` **275/275**、`test/门禁引擎` **499/493/5/1**
  （5 失败名与 B3 编排记录逐名一致）、`test/runtime-core` **577/540/33/4**（33 失败名与 B3 编排记录
  环境基线逐名一致）；**未 commit / 未 push / 未 merge / 未发布**；
  未运行真实模型/Electron；未占用 9222/9223。

## 0. 依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结，唯一判据） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（MF-IR-8） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 / 35,665 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| B3 编排记录（端口/服务签名，只读） | `角色卡/编排/docs/change/2026-11-10_B3_two-fixed-workflow-paths.md` | 303 / — / `8b12e572c22af6452776984823c759f1c2af344b6383ddf32a58a1c1cd0faa35` |
| B1 桌面记录（只读；启用闸/路由基线） | `角色卡/桌面窗口/docs/change/2026-11-10_B1_two-fixed-workflow-paths-desktop.md` | 304 / — / `847b9235af2cebec8ec90a751ea042d966f02de8c25a65075d362c038e694cb7` |

覆盖判据（桌面 owner 部分）：**AC-09/AC-10/AC-11/AC-12/AC-13/AC-14/AC-15/AC-16/AC-20/AC-22/AC-23**、
T-05/T-07/T-10/T-11/T-12/T-15 的桌面确定性测试；真机全链（AC-30）不在本批。

## 1. 实施内容（按写集）

### 1.1 `app/desktop/workflow-git.ts`（M，+716/−8）：**真实** `ReleaseGitPort` / `BaselineGitPort`

- 固定 argv/sanitized env（沿用仓库既有 `git-command.ts` 约定）：继承 env 中全部 `GIT_*` 丢弃；
  `GIT_CONFIG_NOSYSTEM=1`、`GIT_CONFIG_GLOBAL` 指向项目内空文件、`HOME`/`XDG_CONFIG_HOME` 隔离到
  `<projectRoot>/.ans/git-home`、`GIT_TERMINAL_PROMPT=0`、`GIT_OPTIONAL_LOCKS=0`、`GIT_NO_REPLACE_OBJECTS=1`、
  `GIT_ATTR_NOSYSTEM=1`、`GIT_CEILING_DIRECTORIES=<projectRoot>`、`LC_ALL=C`、`-c core.hooksPath=<empty>`；
  `spawn(shell:false)`、输出/时限有界（4 MiB / 30 s）；**不经 shell**、无模型自报参数。
- `BaselineGitPort`：
  - `ensureRepository`：`.git` 不存在 ⇒ 父仓库上溯检测（`baseline-parent-repository-detected`）→
    `git init -b main`（旧 git 回退 `git init` + `git symbolic-ref HEAD refs/heads/main`）；
    既有仓库（含 worktree `.git` 文件）no-op；`allowInit:false`（路径 B）⇒ `b-repository-required`（不自动 init）；
    仓库本地身份缺省 `ANS`/`ans@local`（只写 `.git/config`，`identityDefaultsApplied`）；
  - `ensureGitignore`：复用编排 `ensureProjectGitignore`；被跟踪且有未提交修改 ⇒ `baseline-gitignore-dirty`；
    缺失/块不完整 ⇒ `baseline-gitignore-malformed`；写入/未跟踪 ⇒ `git add .gitignore` + **仅 `.gitignore`**
    的 baseline commit（`git commit -m ... -- .gitignore`；幂等：已提交同内容 `committed:false`）；
  - `inspectWorktree`：dirty = tracked 修改/删除 + **非忽略** untracked（`.gitignore` 过滤；`.ans`/`node_modules` 不计）；
  - `prepareTaskBranch`：`ans/task/<workflowId>` 从 `main`（A9）或当前 HEAD（路径 B）创建/切换；
    同名分支 + `allowReuse:false` ⇒ `baseline-branch-exists`（不删除/不强推）；`allowReuse:true` 复用；
    切换失败（本地改动）⇒ `baseline-repository-dirty`。
- `ReleaseGitPort`：
  - `inspectRepository`：branch/headOid/mainOid/objectFormat/trackedChanges/untracked/gitignoreSha256/
    gitignoreTrackedDirty（只读；HEAD 不可解析 ⇒ `release-workflow-not-ready`）；
  - `previewMerge`：base=main OID（unborn ⇒ 空树）/tip ⇒ files（status/path）、fileCount、diff stat、
    diffDigest（sha256(name-status + stat)，确定性）；
  - `mergeMain`：项目级临界区（进程内；占用 ⇒ `release-main-busy`）；复核 branch/tip/main base/dirty；
    main unborn ⇒ `git switch -c main <tipOid>`（`mergeKind:"initial"`）；main 存在 ⇒ `git switch main`
    （被占用/失败 ⇒ `release-main-busy`）+ `git merge --no-ff -m ... <branch>`；冲突 ⇒ `git merge --abort`
    + 切回任务分支 + `release-merge-conflict`（不 force/reset/clean）；成功 ⇒ `release.merged` 回执
    （baseOid/tipOid/mergeOid/files/diffDigest），**工作区停在 main**；**不 push/tag**。
- B1 骨架逐字保留（`createWorkflowGitPort` 缺省 fail-closed；`mergeMainConfirmationError` 客户本人唯一）。

### 1.2 `app/desktop/workflow.ts`（M，+90）：首次 fixed 启动 / fixed 面板模式 / 活动 workflow

- `ensureFixedPathStarted`：委托编排 `prepareFixedPathStart`（原子写 `.ans/project.json workflowSchema`，
  保留既有键；显式 `legacy/v1` **不覆盖**；坏文件 ⇒ `project-config-write-failed`），再以 B1 启用闸 +
  编排 `workflowMode` 复核实际模式（legacy 在飞 flow 仍 legacy）。
- `activeFixedWorkflowIdFor`：该 flow 最新未关闭 `workflow.started` 的 workflowId（卡片 `workflowId/stage` 戳）。
- `resolveProjectFixedPanelMode`：显式 fixed / 显式 legacy / 缺省按固定账本存在性 ⇒ VCA/trunk/stable 面板只读判定。

### 1.3 `app/desktop/customer-input.ts`（M，+103）：merge-main 应用自有卡

- `buildMergeMainCardRequest`：`kind:"choice"` + `cardKind:"merge-main"` + `application:true` +
  冻结选项词汇（`approve-merge-main`/`reject-merge-main`）；preview 必含 workflowId/flowId、main base OID、
  branch tip OID、文件数、diff stat、合并方式、高风险提示与（路径 B）非 main 基线披露。
- `mergeMainCardPreviewText`（单源文本）；`toMergeMainCardDecision`：客户本人 approve/reject；
  judge/directive 的 `answered` **不代批**（`unavailable`，release 保持开放）；`declined` 的 judge 来源
  ⇒ `judge-reject`；应用中止/窗口失效 ⇒ `timeout`；缺失 ⇒ `unavailable`。
- 既有 `isApplicationDecisionReservedForCustomer`（B1）继续保证 merge-main 不进判断器/委托/指令。

### 1.4 `app/desktop/session.ts`（M，+894/−13）：fixed 应用接线（单一实现拼装）

1. **首次 fixed 启动（AC-12）**：`routeDispatch` trio 分支——幕僚首个 `stage-request` 携带 `workflowPath`
   且 B1 启用闸未开时，先 `ensureFixedPathStarted`（写 `workflowSchema` + 复核），再按模式路由；
   写失败 ⇒ `project-config-write-failed`（不派发、不弹卡）；显式 legacy/v1 不覆盖（走 legacy 路由）。
2. **路径 B（AC-10）**：`routeFixedPathDispatch` 在 B1/B3 生产派发前调用
   `ensurePathBStartForDispatch`（非 B 路径/已有 basis ⇒ no-op；否则 `preparePathBStart` + 真实
   `BaselineGitPort`；无仓库 ⇒ `b-repository-required`）；A11/B1/B3 派发前 `verifyBasisForWorkflow`
   （漂移 ⇒ `basis-drift`，不派实现）；B3 派发核对 `modulePaths` ⊆ `change.scope-decided.effectiveWritesets`
   （越界/无写集 ⇒ `b-change-scope-invalid`；缺模块证据 ⇒ `dispatch-evidence-missing`）。
3. **A9 基线（AC-15/16）**：fixed 会话的 `complete_team_plan` 注入 `completeTeamPlanFixedForHandle`
   （可信身份：projectRoot/actorRoleId=convener/受派任务 workflowId；真实 `BaselineGitPort`；
   回执映射 `DirectActionReceipt`：成功 `applied`/targetDigest=basisId，失败 `blocked`+errorCode）；
   失败只回报运营/幕僚、不弹客户卡。legacy 会话逐字保留 direct 实现。
4. **A12 归档（AC-20）**：fixed 会话注入 `closeCreatedTaskFixed`（run-role 绑定 projectRoot/actorRoleId）：
   `accepted` 时应用补证据——报告 `evidence[]` 真实文件 path+字节 SHA-256 → artifacts；A11/B3 记录
   任务分支真实 tip（分支必须 `ans/task/<workflowId>`）；**A12b** 用 `archiveAcceptance` 生成
   `docs/acceptance/<flowId>-acceptance-vN.md`（criteria 取 A12a 任务报告证据），失败 ⇒
   `acceptance-archive-failed`/`acceptance-record-invalid` **阻塞**（不写 task.closed）；同 operationId 幂等 replay。
5. **3 张 fixed 卡（AC-13）**：`withRequestLifecycle` 对 fixed 卡的**应用绑定**（只对 3 张卡 + acceptance
   做模式解析，其他卡种零新增 await/legacy 时序不变）：
   - intent-confirm：`prepareIntent` ⇒ `documentRefs[intent]`（path/sha256/version）+ context marker +
     `workflowId/stage:"A3"` 戳；裁决 confirm ⇒ `finalizeIntent`（校验 intent 入口/hash）+ `stage.completed A3`；
   - proposal：应用计算五件 `documentRefs`（intent/proposal/modules/roster/architecture），缺失 ⇒
     `proposal-document-missing`（notPresented）；accept ⇒ `stage.completed A6`、revise ⇒ `stage.reworked A5`、
     reject/拒绝 ⇒ `stage.blocked A6`；**不调用** legacy `proposalCardFrozenRejection`（fixed 无 run pin）；
   - appointment：选项必须**恰为**最新名单角色 + `multiple=true`，推荐集=名单顺序（应用生成、不采信模型）；
     `documentRefs[roster]` + `workflowId/stage:"A10"` 戳；裁决选定 ⇒ `stage.completed A10`；
     fixed 决议**不带 legacy roster 戳**（结构上不可被 legacy D3 读取方当作 D3 证据）；
   - acceptance：fixed **不发**验收卡（`acceptance-card-suppressed`，notPresented、不写账本）。
   - D3 防污染（G-10）：legacy D3 扫描（`chainDispatchFacts`）忽略带 `workflowId` 的决议。
6. **merge-main 应用通道（AC-14/AC-22；MF-IR-8）**：`runFixedReleaseMerge`（应用入口）——
   `prepareReleaseMerge`（前置/漂移/preview；不满足 ⇒ `release-workflow-not-ready`，**不发卡**）→
   `presentMergeMainCard`（经既有客户卡通道 `presentAppCard`；客户本人）→ 客户 approve ⇒
   `executeReleaseMerge`（含 `confirmation.by:"customer"`；fixed argv 本地合并；不 push/tag）；
   客户 reject ⇒ `release.rejected.by=customer`；judge 转人工/拒绝或应用中止（超时）⇒
   `release.rejected.by=judge`（非客户关闭；绝不写成客户确认）；judge approve 尝试/无效裁决 ⇒
   `release-unauthorized`（不写终态、保持等待）；无客户卡通道 ⇒ `release-card-unavailable`（不默认通过）。
   **未新增 `requestReleaseMerge`**。
7. **fixed 面板（AC-23）**：`fixedPanelState(projectRoot, flowId?)` 只读投影（mode/panel/mutationAllowed +
   workflow stage/status/blocked/closed）；fixed ⇒ `panel:"read-only"`、`mutationAllowed:false`；legacy 逐字不变。

### 1.5 `app/desktop/version-change.ts`（M，+28）：fixed 面板只读纯函数

- `FIXED_PANEL_READONLY_CODE="fixed-path-panel-readonly"`、`versionChangePanelModeFor`（fixed ⇒ read-only /
  legacy ⇒ full）、`versionChangePanelMutationAllowed`、`fixedPanelReadonlyRejection`（结构化拒绝回执）。

### 1.6 `app/desktop/interface.ts`（M，+26）：fixed 项目 mutation IPC 拒绝

- `fixedPanelMutationRejection(projectRoot)`（`resolveProjectFixedPanelMode` ⇒ fixed 时返回只读拒绝）接入
  `presentVersionChange` / `requestTrunkUpgrade` / `confirmTrunkUpgrade` / `requestTrunkRefreeze` /
  `abandonTrunkUpgrade` / `requestTrunkRecover`；列表/状态查询保留（只读）；legacy 项目零变化。
- 未改 renderer/main/UI（不做 UI 改版；面板视觉隐藏属渲染层后续）。

### 1.7 测试（`test/桌面应用/**`，新 4 文件 / 30 tests）

- `b3-workflow-git-real.test.ts`（9）：真实临时 Git 仓库——init -b main/既有 no-op/父仓库检测/路径 B 无仓库
  `b-repository-required`；gitignore 托管块+仅该文件 baseline commit/幂等/dirty/malformed；dirty 只算
  tracked+非忽略；任务分支创建/冲突 fail-closed/复用/从 HEAD；inspect/preview；merge --no-ff + 工作区停 main；
  main unborn initial；冲突 abort+回任务分支（不 force/reset/clean）；临界区 `release-main-busy`；不 push/tag。
- `b3-release-merge-desktop.test.ts`（7）：merge-main 卡构造（app-owned/冻结选项/不进 GROUP/preview 字段）；
  裁决映射（客户本人；judge answered 不代批；judge declined；timeout）；`runFixedReleaseMerge` 客户本人确认
  ⇒ 本地合并（release.confirmed.by=customer / release.merged / workflow.closed delivered / 不 push/tag）；
  客户拒绝 by=customer；judge 拒绝 by=judge；judge approve 尝试不合并/不写终态；超时 ⇒ release.rejected；
  前置不满足不发卡不写 release.requested；无通道不合并；已合并 no-op `release-already-merged`。
- `b3-fixed-baseline-pathb.test.ts`（6）：A9 fixed complete_team_plan → 真实 Git（init/gitignore/branch）
  + basis.recorded(repo/reviewRoleId) + stage.completed A9、不弹卡、不写 runs；A9 dirty ⇒ status blocked
  （`baseline-repository-dirty`）+ stage.blocked A9 + 无 basis；A12b close accepted ⇒ docs/acceptance 归档
  （workflowId/reportSha/idempotencyKey）+ A12b/A12 聚合 + 幂等 replay；criteria 缺证 ⇒
  `acceptance-record-invalid` 阻塞（不写 task.closed/无归档）；路径 B B1 准备（basis reason=path-b/任务分支/
  无仓库 `b-repository-required` 不 init）；B3 写集门（合法/越界/缺证据/角色无写集）。
- `b3-fixed-cards-panel.test.ts`（8）：首次 fixed 启动（写 workflowSchema 保留既有键 / 显式 legacy 不覆盖 /
  坏配置 `project-config-write-failed`）；intent-confirm（documentRefs+marker+workflowId/stage A3 + finalize A3）；
  proposal（五件 documentRefs + stage A6；缺失 ⇒ `proposal-document-missing`）；appointment（选项=名单/
  multiple/推荐集/戳；不一致 ⇒ `appointment-invalid`；无 legacy roster 戳）；acceptance 抑制；legacy D3 扫描
  忽略 fixed 决议；fixed 面板只读投影 + legacy 不变。

## 2. G-IR / AC 闭环（桌面 owner 部分）

| 条件 | 状态 | 证据/说明 |
| --- | --- | --- |
| AC-09 A12 验收（归档） | **桌面侧闭环** | A12b close 应用归档（版本随 report/幂等 `acceptance:<wf>:<reportSha>`/失败阻塞）；证据 04 |
| AC-10 路径 B 状态机与准备 | **桌面侧闭环** | B1/B3 派发前 `preparePathBStart`（无仓库 fail-closed）；B3 写集门；证据 04 |
| AC-11 发布前置按路径 | **桌面侧闭环（服务层判定）** | `prepareReleaseMerge` A13/B4 前置；桌面不发卡/不执行；证据 04 |
| AC-12 per-flow/首启写回 | **桌面侧闭环** | `ensureFixedPathStarted`（显式 legacy 不覆盖；写失败 fail-closed）；证据 04 |
| AC-13 3 张卡 | **桌面侧闭环（呈现/绑定/戳）** | documentRefs/任命选项/验收卡抑制/D3 排除；证据 04（run-role 侧残留见 §6） |
| AC-14 merge-main | **桌面侧闭环** | 应用自有非判断卡/仅客户本人/judge 排除/preview 必含/不新增工具；证据 04 |
| AC-15/16 基线 | **桌面侧闭环** | 真实 Git 端口 + A9 应用适配；失败 status blocked + stage.blocked A9 + 不弹卡；证据 04 |
| AC-20 A12 归档 | **桌面侧闭环** | 见 AC-09 |
| AC-22 merge main 执行 | **桌面侧闭环** | 固定 argv/initial/merge --no-ff/冲突 abort 回任务分支/幂等/不 push/tag；证据 01/04 |
| AC-23 fixed 面板/能力 | **桌面侧闭环** | 面板只读 + mutation IPC 拒绝 + workflow 状态投影；B1 工具过滤不变 |
| MF-IR-8 不新增 requestReleaseMerge | **遵守** | 注入面/类型面零新增；应用入口 `runFixedReleaseMerge` |
| T-15 审计（judge 不冒充客户） | **桌面侧闭环** | `release.confirmed.by` 服务双检 + 决策映射不代批；证据 04 |

## 3. 验证与证据

### 3.1 typecheck

- 基线（HEAD `80bc3b6`，开工时）：`npm run typecheck` **exit 0**；
- 终版：`npm run typecheck` **exit 0**（`_evidence/03-after-typecheck.txt`）。

### 3.2 新增目标测试

`_evidence/04-targeted-tests.tap`：**30 tests / 30 pass / 0 fail / 0 skipped**（4 文件；真实 Git 夹具；
连续多次运行一致；无新增 skip/force-exit；未启动 Electron/真实模型）。

### 3.3 受影响桌面套件 before/after（同一命令，`--test-force-exit`）

命令（**18 个既有受影响套件**；after 另加 4 个新增 B3 目标文件 = 22 文件）：
`node --test --test-concurrency=1 --test-force-exit --test-timeout=60000 --test-reporter=tap <列表>`；
before = HEAD `80bc3b6` 纯净解包（`git archive HEAD` + node_modules junction；新增文件在 HEAD 不存在）。

| | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| before（HEAD 纯净解包；18 既有套件） | 238 | 190 | 48 | 0 |
| after（本批工作树；18 既有 + 4 新增 = 22 文件） | 268 | 220 | 48 | 0 |

- **失败名集合 diff = 0（IDENTICAL）**：before/after 各 48 个失败名逐名一致（`_evidence/before-fail-names.txt`、
  `after-fail-names.txt`、`failure-names-diff.txt`）；新增确定性失败 = 0、新 skip = 0、既有失败无消失。
- 套件清单（18 既有 + 4 新增）：`fixed-path-routing`、`workflow-git-port`、`b3-workflow-git-real`（新）、
  `b3-release-merge-desktop`（新）、`b3-fixed-baseline-pathb`（新）、`b3-fixed-cards-panel`（新）、
  `chain-enforcement`、`session`、`interface`、`dispatch-fresh-enum`、`handback-delivery`、`run-pin`、
  `multi-runtime`、`message-queue`、`ans-wiring`、`boundary-refresh`、`log-actions`、`run-change-trigger`、
  `version-change`、`rejection-copy`、`pending-card-restart`、`queue-visibility`。

### 3.4 扩展桌面套件（其余导入 SessionManager 的 40 文件；已知挂起 4 文件单列）

- 命令同上（`--test-timeout=45000`）；before = HEAD 纯净解包，after = 本批工作树；
- 已知挂起（B1 记录同源环境问题，**单列不并入对比**）：`optional-acceptance`、`stuck-redispatch`、
  `session-rebuild-race`、`directive-decision`；
- before：**432 tests / 400 pass / 32 fail / 0 skipped**（30 个失败名，含重名）；
- after：**432 tests / 397 pass / 35 fail / 0 skipped**；失败名集合 diff = **+3 名、−2 名、1 个名称变化**，
  逐项归因（均非本批回归）：
  - `I-1 补丁（真正接通核查）`、`P0-2 abort 三态`、`已 bootstrap（有角色）su gate` 三项：同 worktree 拓扑下
    用**纯净 HEAD 代码**复跑同样失败——把 worktree `.git` 文件复制进纯净解包根后运行同一 3 文件：
    71/66/5/0，5 个失败名与工作树**逐名一致**（`_evidence/before-env4-pristine-gitfile.tap`、
    `before-env4-gitfile-fails.txt`；根因 = linked-worktree `.git` 为文件 ⇒ run-role
    `runtime-creation-prepared-api-unavailable`，与 B1 记录 §3.2 同源环境问题；两次工作树采样同集合，
    `_evidence/after-env4-worktree.tap`/`-2.tap`）；
  - `P0-1 合法图`/`P0-1 重校验拒绝` 在纯净解包同样失败（before 已含，非新增）；
  - `W20` 消失 + `W47 select/revise` 名称变化属 `chief-workflow` 真实卡链既有非确定（B1 §3.2 已披露；
    同名用例不恶化、无新增确定性失败）。
- 证据：`_evidence/before-remaining-desktop.tap`、`after-remaining-desktop.tap`、两组失败名文件。

### 3.5 只读回归（本角色写集外；`src/**` 零 diff）

| 套件 | 结果 | 对照 |
| --- | --- | --- |
| `test/编排/**` | **1,291 / 1,265 / 24 / 2** | 24 失败名与 B3 编排记录证据 `05-after-failure-names.txt` **逐名一致**（`_evidence/orch-fail-names.txt`） |
| `test/roles/**` | **275 / 275 / 0 / 0** | 与 B3 编排记录一致（`_evidence/roles.tap`） |
| `test/门禁引擎/**` | **499 / 493 / 5 / 1** | 5 失败名与 B3 编排记录证据 `09-gates-readonly.tap` **逐名一致**（`_evidence/gates.tap`） |
| `test/runtime-core/**` | **577 / 540 / 33 / 4** | 33 失败名与 B3 编排记录环境基线（`10-runtime-core-fails.txt`）**逐名一致**（worktree `.git` 为文件导致的环境性失败；`_evidence/runtime-core.tap`） |

### 3.6 候选与写集（见 §4）

- `git status --porcelain -- src app test` 恰为本批 10 文件；`src/**` 零 diff；`app/main.ts`/`app/renderer/**`
  零 diff；`package.json`/`package-lock.json` 零 diff（无新依赖）（`_evidence/06-write-set-status.txt`）。

## 4. 候选（本角色 B3 写集）

`_evidence/07-candidate-hashes.txt`（逐文件 raw SHA-256 / bytes / lines + numstat + 聚合）：

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `app/desktop/session.ts`（M） | `78c7251fddda3b8c61b5b04c845daefe3db6d5be363da0f366be42ccfa89cc4e` | 800,501 | 12,541 |
| `app/desktop/workflow-git.ts`（M） | `5cb1381c1838e44c46a7d466d75704a81bc6baac946ebad0d6524f79ff667376` | 39,272 | 882 |
| `app/desktop/workflow.ts`（M） | `90c517d7905ef518cd6cc03d9d41a43dfaec30c6c129155962f5cb728f8e8f9b` | 13,198 | 248 |
| `app/desktop/customer-input.ts`（M） | `095a2d6402f801bc22ec30bbfcc49456a85728989f4f939b90711da3c9a17ef4` | 164,068 | 2,872 |
| `app/desktop/version-change.ts`（M） | `c6ee909dcf62330205f9de2f4692ba49c1d288dd2989ae06b7341a1d16d4810e` | 69,087 | 1,591 |
| `app/desktop/interface.ts`（M） | `63a9631cde0b1fe74d2f962012f0fb0506d0e4adc473ac924271f2171e49ea09` | 198,438 | 3,355 |
| `test/桌面应用/b3-workflow-git-real.test.ts`（新） | `7b0f23506607c7350b4f36887ee2ecfca2e951ceeb1e7220040d39f61d1a016d` | 20,701 | 408 |
| `test/桌面应用/b3-release-merge-desktop.test.ts`（新） | `8833887fe546206c11a95a557b5e9bfcd063d5f3783870f2f8c0bef0d480d3fd` | 29,780 | 567 |
| `test/桌面应用/b3-fixed-baseline-pathb.test.ts`（新） | `a891c5bef7a700501486394f8ae07345dd1a16305538bf72b6b487862381426f` | 37,631 | 701 |
| `test/桌面应用/b3-fixed-cards-panel.test.ts`（新） | `360e28a4efca72a17746492d4fea3744f1e231ef8c1c6140197684802c4d1303` | 33,047 | 622 |

- numstat（app）：`session.ts +894/−13`、`workflow-git.ts +716/−8`、`workflow.ts +90/−0`、
  `customer-input.ts +103/−0`、`version-change.ts +28/−0`、`interface.ts +26/−0`；新增 4 测试文件见 `07`。
- 聚合哈希（`sha256sum` 逐文件行按路径排序后连接再 SHA-256）：`222e52d00ba0ece4079a82f089fa8c9abec3171c0a398d5d005b217797dcba68`（可复算）。

## 5. 与编排导出/端口签名的一致性（只读 import）

- `ReleaseGitPort`：`inspectRepository({projectRoot})→{facts:WorkflowGitRepositoryFacts}`、
  `previewMerge({projectRoot,mainOid,tipOid})→{files,fileCount,diffStat,diffDigest}`、
  `mergeMain({projectRoot,workflowId,flowId,branch,baseOid,tipOid,mergeKind})→{mergeKind,baseOid,tipOid,mergeOid,files,diffDigest}|failure`
  ——与编排 B3 记录 §3 **逐字段一致**（`GitOid={objectFormat,hex}`）。
- `BaselineGitPort`：`ensureRepository({projectRoot,allowInit})`、`ensureGitignore({projectRoot})`、
  `inspectWorktree({projectRoot,branch?})`、`prepareTaskBranch({projectRoot,workflowId,base,allowReuse})`
  ——与记录 §3 一致。
- 调用面：`prepareReleaseMerge`/`executeReleaseMerge`/`rejectReleaseMerge`/`archiveAcceptance`/
  `completeTeamPlanFixed`/`preparePathBStart`/`findAcceptanceArchive`（间接）/`taskBranchName`/
  `releaseIdFor` 不重复实现，均由编排单一实现；桌面只传可信身份/证据/端口。
- `prepareFixedPathStart`、`workflowMode`、`requestStage`、`inspectAssignedTask`、`verifyBasisForWorkflow`、
  `appendWorkflowEvent`、`WORKFLOW_LEDGER_SCHEMA`、`canCompleteStage`、`deriveWorkflowView` 形状一致；
  `src/**` 零修改。
- 无写集外需求被本角色“顺带实现”：发现的 run-role fixed 卡残留见 §6（停止报告）。

## 6. 限制与披露

1. **【写集外需求 / 停止报告】run-role fixed 意图卡仍走 legacy trunk**：
   `src/pipeline/orchestration/run-role.ts`（约 :1695–:1726）对 chief+intent-confirm 无条件调用
   `createTrunkService(...).prepareIntentConfirmation/finalizeIntentConfirmation`；固定项目无 trunk/run，
   真机中该卡会在到达桌面通道前被 `notPresented` 拒绝。需 owner（编排/运行时核心）在 fixed 会话改为
   `workflowService.prepareIntent/finalizeIntent`（或放行至桌面应用层）。桌面侧 `prepareIntent` 接线已就绪。
2. **【写集外需求 / 停止报告】run-role fixed 任命卡发起人仍限 nominator**：
   `run-role.ts`（约 :1386）`if (!isTrio || trioSpec?.id !== "nominator")` 结构性拒绝幕僚发起 appointment；
   固定矩阵 `fixedCards.chief` 含 appointment，但该早退分支未按矩阵放行。需 owner 增加 fixed 分支
   （chief 发起 + 名单校验；桌面已实现选项=名单/推荐集/戳与裁决后的 `stage.completed A10`）。
3. **`complete_team_plan` 共享 schema 无 `workflowId`（运行时核心 B2 未加）**：桌面从当前真实受派任务
   （`inspectAssignedTask`）绑定 workflowId，不依赖模型自报；建议运行时核心后续把可选 `workflowId`
   加入模型可见 v4 形状（非阻塞，桌面已 fail-closed 拒绝无 workflowId 的受派任务）。
4. **`request.resolved.source:"stage-a10"` 字面字段不存在于 `model/runtime.ts`**：桌面以
   `workflowId`+`stage:"A10"` 戳 + **省略 legacy roster 戳**实现同一隔离（legacy D3 读取方结构上不接受；
   桌面 D3 扫描亦忽略带 workflowId 的决议）。若 B1 要求字面 `source` 字段，需运行时核心类型加法（写集外）。
5. **merge-main 自动触发未接线（不做 UI 改版）**：应用入口 = `SessionManager.runFixedReleaseMerge`
   （A13/B4 前置满足时由 UI 动作/后续自动触发调用；G-IR MF-IR-8 允许该归属）；不新增模型工具。
6. **超时语义**：客户通道 G-1 无计时器；“超时/中止”落实为应用中止/窗口失效（outcome unavailable/aborted）
   ⇒ `release.rejected.by="judge"`（非客户关闭；`release.confirmed.by` 恒为 customer 由服务双检）。
7. **fixed 面板只读是应用层语义**：mutation IPC 拒绝 + 状态投影；渲染层“隐藏”未改（不做 UI 改版；
   fixed 会话本就不注入 VCA/stable/run-change 工具——B1）。项目级判定：显式 fixed 或有固定账本；
   混合项目（legacy 在飞 + fixed）面板整体只读——已披露。
8. **桌面测试为假会话/真实 Git 夹具**：未启动 Electron/真实模型；真机全链（RR-01…RR-06）不在本批；
   未占用 9222/9223。
9. **已知挂起套件**（`optional-acceptance`/`stuck-redispatch`/`session-rebuild-race`/`directive-decision`）
   为 HEAD 同样存在的环境问题（B1 基线记录），本批不并入失败名对比、不修改；扩展套件 `chief-workflow`
   本身非确定（B1 已披露），before/after 同名失败可能受采样影响。

## 7. 未提交声明

- 产品/测试代码变更仅限 §1 写集（6 个 app/desktop 文件 + 4 个新测试文件）；记录与 `_evidence/` 仅写入
  本角色 `角色卡/桌面窗口/docs/change/` 目录（任务精确写集）。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。

## 8. 证据索引（同目录 `..._evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `80bc3b6`；开工 `git status --porcelain -- src app test` 为空 |
| `before-desktop.tap` / `before-fail-names.txt` | 受影响 22 文件 before 全量 TAP（238/190/48/0）与 48 失败名 |
| `03-after-typecheck.txt` | 终版 `npm run typecheck` exit 0 |
| `04-targeted-tests.tap` | 新增 4 文件定向 TAP（30/30 pass） |
| `after-desktop.tap` / `after-fail-names.txt` / `failure-names-diff.txt` | 受影响 22 文件 after 全量 TAP 与失败名集合 diff（空） |
| `06-write-set-status.txt` | 写集/禁改目录/依赖零 diff |
| `07-candidate-hashes.txt` | 候选逐文件 hash/bytes/lines/numstat/聚合 |
| `before-remaining-desktop.tap` / `after-remaining-desktop.tap` / 失败名文件 | 扩展 40 文件 before/after（已知挂起 4 文件单列） |
| `before-env4-pristine.tap` / `after-env4-worktree.tap` / `after-env4-worktree-2.tap` | 环境敏感 3 套件（operator-channel/p0-halt/genesis-bootstrap）纯净解包 vs 工作树（两次采样） |
| `before-env4-pristine-gitfile.tap` / `before-env4-gitfile-fails.txt` | **纯净 HEAD 代码 + 同 worktree `.git` 文件拓扑**复跑：5 失败名与工作树逐名一致（环境复现证明） |
| `orch.tap` / `orch-fail-names.txt` | `test/编排` 只读回归（1,291/1,265/24/2；24 失败名与 B3 编排记录一致） |
| `roles.tap` | `test/roles` 只读回归（275/275） |
| `gates.tap` | `test/门禁引擎` 只读回归（499/493/5/1；5 失败名与 B3 编排记录一致） |
| `runtime-core.tap` | `test/runtime-core` 只读回归（环境基线） |
