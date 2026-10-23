# 变更记录：验收返工路由——测试 S7 集成/回归（T3）

- **任务 ID**：`2026-10-23-acceptance-rework-routing`（产品 flowId：`acceptance-rework-routing`；节点 **S7 集成/回归**）
- **角色/执行者**：测试（Testing worker，独立子代理上下文）
- **日期**：2026-10-23
- **状态**：**`verified-by-tests-only`**（测试角色对当前候选完成了跨角色 e2e、受影响套件、T3 串行全量、真实 Electron、目标项目只读复算与类型/构建核对；**不是验收结论**，不声称通过、不授权提交/推送/发布）
- **本记录不代替独立验收**：P1–P12 的正式判定由内置独立验收按 `docs/acceptance/acceptance-rework-routing-criteria-v1.md` 写 `docs/acceptance/acceptance-rework-routing-report-v1.md` 作出；本记录只提供测试证据与失败分类。

## 0. 依据（客户已确认）

- 闸门 0/1/2 + 实施授权：`docs/communication/2026-10-23_intent_acceptance-rework-routing.md`（实施授权原话「授权按团队计划 v1 与标准 v1 实施 S2–S7；不包含 commit/push/发布/目标项目写入，不新增角色/边界。」）
- 团队计划 v1：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`（§3.6 测试写集、§4.1 S7、§5.3 测试纪律、§5.4 证据失效）
- 验收标准 v1：`docs/acceptance/acceptance-rework-routing-criteria-v1.md`（P1–P12；本记录对应 P1–P9 的 e2e/回归/Electron/目标复算证据）
- 方案 v1：`docs/planning/2026-10-23_design_acceptance-rework-routing.md`（§5.3–§5.8、§8.2–§8.5；Q1–Q13 A；O1–O4 不做）
- S1 基线：`角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-baseline.md`（T3 基线 3725/3697/10/18；目标快照）
- S2–S6 变更记录：`角色卡/编排|桌面窗口|运行时核心|项目管理/docs/change/2026-10-23_change_acceptance-rework-routing.md`（候选哈希与自测结果；本记录只对当前候选做独立测试，不自验产品）

## 1. 写集（实际只写这些；未改产品源码）

- `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`（**新增**，10 例）
- `test/测试/governance-e2e-auto/fixture.ts`（**追加可选钩子**，默认关闭；`governance-e2e-auto/` 既有 20 个 e2e 文件及其用例全部保留并回归通过）
- `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing.md`（本文件）
- `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`（原始日志、哈希、复算脚本与输出）

**未写**：`src/**`、`app/**`（含 `app/main.ts`、`app/desktop/**`、`app/renderer/**`）、`test/桌面应用/**`、`test/桌面UI/**`、`test/编排/**`、`test/runtime-core/**`、`test/项目管理/**`、`test/装配/**`、角色卡/边界/YAML、`docs/` 其他目录、目标项目 `ans-gateway`；未 commit/push/暂存/发布。

### 1.1 fixture 扩展（可选、默认关闭；不改变既有用例语义）

| 选项 | 作用 | 缺省 |
| --- | --- | --- |
| `wireAutoRework?: boolean` | 把 customer-input 的 `onAutoRework` 接到 `desktop.routeAcceptanceAutoRework`（与 `app/main.ts` 同模式，仅接线） | false（不注册回调） |
| `failOpenRoles?: Set<string>` | 注入「后台打开指定角色会话失败」，用于发送失败→`failed`→下一次事件重试 | undefined（真实打开） |
| `resolveRuntime?: DesktopDeps["resolveRuntimeFn"]` | 固定引擎解析（返工路由/重派需确定性 runtime，不触真实凭据） | undefined（产品 `resolveProjectRuntime`） |
| `appendGovernanceLedger?: DesktopDeps["appendGovernanceLedgerFn"]` | 注入审计账本追加（仅失败注入用例） | undefined（真实 append） |

- 只新增可选字段和 `options.failOpenRoles?.has(...) === true` 判断；未改既有脚本、既有断言或默认路径。`test/测试/**` 全部 832/825/1/6 通过（1 项既有 EPERM）。

## 2. 新增 e2e（`s-acceptance-rework-routing.test.ts`）覆盖

> 全部使用系统临时根、真实 `openRoleSession` + 桌面 `createDesktopInterface` + 客户通道 + 账本 + flow 工具；不读真实 `.env`/凭据/在线模型；不写目标项目。

| 用例 | 覆盖（标准/任务） | 关键断言 |
| --- | --- | --- |
| S7-A 客户 reject 全链路 | P1/P3/P4/P5/P6；任务 1 | 真实验收卡客户 reject → 最新 rejected 路由 Convener（报告路径 + `acceptance-rework/v1` 逐项 id/owner/action/evidence + 决定时间 + 来源「客户拒绝（客户手拒）」）→ 零 Proof 返工 → 无新增 `customer.decision` → `.ans/governance/acceptance/flow-a/rework-routing.json`（schema/source/status/reportSha/items）→ app→convener 审计恰一条无 stepId → rework-f1 done + flow 新内容/新 mtime → **恰一次**重派 Proof（vN+1、引用被拒报告、返工段硬要求、不覆盖被拒报告）→ 同内容再触发不重派 → accepted 收口（verification done + acceptance 证据）、不路由/不重派 |
| S7-B 无 flow 进展 | P4/P6；任务 1 | rejection 后无 flow 更新 ⇒ 不重派 Proof、Lead 一条「返工路由尚未完成/暂不派发验收复核」去重系统行；重复 import 仍只一条 Convener 任务、零热循环 |
| S7-C judge auto-rework（真实卡） | P3/P4；任务 1 | 真实验收卡 + 真实判断 driver（manual/not-recommended 在 allowlist）→ onAutoRework → 路由 Convener；回执含「自动决策未通过/未完成/这不是客户拒绝/Convener/重新提交验收」，剔除否定句后无「客户拒绝」；系统行「自动决策未通过/未完成」且无「客户拒绝」；零 `customer.decision`、零 Proof 返工；flow 更新后恰一次重派、同内容不重派 |
| S7-D 报告缺段/坏段 | P2/P3/P5；任务 1 | 目标项目形态（§8 表/§9.1 列表）与未知字段坏段 ⇒ 「报告不完整」任务：不生成 items、不建 flow 步骤（flow 字节不变）、错误具体可见、record `structured:false`/`itemCount:0`、系统行可见、不伪造决定、不派 Proof |
| S7-E owner 归属 | P3/P5/P8；任务 1 | 有效项 owner=executor 先行；`ghost-role`/`app` 逐项 blocked；`verifier`=报告/工具修正（不向 Proof 派产品返工）；`convener`=治理文档/变更包项（不向内置角色 dispatch_task）；Convener 恰一条 |
| S7-F 无可 supersede 旧步骤 gap | P5/P8（Q5 A）；任务 1 | 任务文本要求「没有可 supersede 的旧步骤 ⇒ fail-closed：记录 gap 并请 Lead/Proof 补 flow 计划，不凭空造步骤」；应用不创建/改写 flow（不存在凭空 rework-* 步骤） |
| S7-G verification dispatched/delivered | P4.4；任务 1 | app-only `reopenAcceptanceStepForRework` 把 dispatched/delivered 重开为 pending、清旧证据、保留 dependsOn；随后恰一次重派 Proof；账本恰一条新 verification 派发 |
| S7-H accepted 不重开 | P1/P4；任务 1 | 最新 accepted + verification dispatched ⇒ 按 accepted 收口（done + acceptance 证据）、不重开为 pending、不写 routing record、不路由/不重派 |
| S7-I legacy Markdown（Q6 A） | P1/P8；任务 1 | legacy + 历史 rejected 保持旧行为（Lead「该流程已有验收决定」、不路由/不重派/不写 record、不新增 YAML）；legacy 无决定且门通过仍正常派验证 |
| S7-J record 幂等/重启/失败可见 | P6/P9；任务 1 | 审计失败：record `sent`、任务已发、Lead「审计记录写入失败」可见、账本无 app→convener、不派 Proof；发送失败（打开 Convener 失败）：record `failed` + error 可见、不派 Proof，故障移除后下一次事件重试成功 `sent`；重启（新 Interface 同项目根）：不重复路由/系统行、record `sentAt` 保持 |

### 2.1 新 e2e 原始结果

- 命令：`node --test --test-concurrency=1 test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`
- 结果：**10 tests / 10 pass / 0 fail / 0 skip / 0 todo，exit 0**（连续 3 次运行均 10/10；最终原始日志 `…-evidence/s7-new-e2e.log`，`duration_ms` ≈ 3846）
- 新文件哈希：`git hash-object` `1cc677239100e763383a8edeb2d4d86b8774a5ba`；SHA-256 `931001895808f889b1b3abbd2eff5e6dcce85fa7a6bfb2007ef9fb73d191d5ae`；51,137 B
- fixture 哈希：`git hash-object` `336177aeca57bab33aea6741eb9df532d63bc1c9`；SHA-256 `2e4e571aa4b8aeae9da21ab59323e45b83b23c94d6fec307a226fde019ad7e71`；76,009 B（S1 基线 `9ce3caed…`/`ec1b2c1d…`/74,257 B；本角色只追加可选钩子，其余 diff 属既有工作树改动）

## 3. 受影响套件（串行）

> 环境：Windows 11 / Git Bash；Node v24.22.1（`C:/Users/51054/AppData/Local/Programs/nodejs`）；HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；工作区候选。每条命令单独日志（含 COMMAND/START/EXIT_CODE/END）。

| # | 套件 | exit | tests | pass | fail | skipped | todo | 日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `test/编排/**/*.test.ts` | 1 | 850 | 849 | 1 | 0 | 0 | `directed-orchestration.log` |
| 2 | `test/桌面应用/**/*.test.ts` | 0 | 568 | 568 | 0 | 0 | 0 | `directed-desktop-app.log` |
| 3 | `test/runtime-core/**/*.test.ts` | 1 | 295 | 288 | 3 | 4 | 0 | `directed-runtime-core.log` |
| 4 | `test/项目管理/shared/**/*.test.ts` | 0 | 184 | 179 | 0 | 5 | 0 | `directed-project-management-shared.log` |
| 5 | `test/测试/**/*.test.ts` | 1 | 832 | 825 | 1 | 6 | 0 | `directed-testing-e2e.log` |
| 6 | `test/装配/**/*.test.ts` | 0 | 84 | 84 | 0 | 0 | 0 | `directed-assembly.log` |

- 合计 **2813 / 2793 / 5 / 15 / 0**；失败 5 项全部为既有 Windows symlink `EPERM`（与 S1 §5.1 逐条一致）；无断言失败、无桌面应用套件时序偶发（本轮）。
- 与 S1 差额：编排 +40（S2）、桌面应用 +10（S3）、runtime-core +2（S4）、shared +3（S5）、测试 +10（本角色 S7）；失败集合不变。详见 `affected-suites-summary.txt`。

## 4. T3 串行全量回归（最终候选）

- 命令（实际）：`mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"`
- 文件清单：**360 个文件**（全部 `.test.ts` 361 个，排除 1 个）；排除 `test/pi-adapter/write-sequencing.test.ts`（**已知挂起**：3 个 `test()` 打印 ✔ 后进程不退出；S1 同处置），排除方式为显式文件清单，不静默跳过。
- 结果：**exit 1；tests 3790 / pass 3763 / fail 9 / skipped 18 / todo 0 / cancelled 0；327,811.8 ms**；2026-10-23 20:57:19 → 21:02:47（本地）。
- 原始日志：`full-regression-serial-excluding-write-sequencing.log`（约 995 KB）；摘要：`full-regression-summary.txt`。

### 4.1 与 S1 基线逐项对照

| 指标 | S1 基线 | S7 最终 | 差额 | 归因/说明 |
| --- | --- | --- | --- | --- |
| 文件数 | 358 | 360 | +2 | S2 新增 `test/编排/acceptance-rework.test.ts`；S7 新增 `s-acceptance-rework-routing.test.ts` |
| tests | 3725 | 3790 | +65 | S2 +40、S3 +10、S4 +2、S5 +3、S7 +10 |
| pass | 3697 | 3763 | +66 | 新用例全部通过；S1 的 1 次 i-full-chain 时序偶发本轮未复现 |
| fail | 10 | 9 | -1 | 失败集合 = S1 的 **9 项既有 Windows symlink EPERM**；**零本变更新增确定性失败** |
| skipped | 18 | 18 | 0 | 全部既有平台/设计跳过；无新增 skip/todo |
| todo | 0 | 0 | 0 | — |

### 4.2 失败分类

- **(A) 既有 Windows symlink EPERM：9 项**（`EPERM: operation not permitted, symlink`，errno -4048）——与 S1 §6.3(A) 逐条一致：claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core `session-store` 2、`file-write-safety` 1、g4-skill-verify 1、编排 `shell-authorized-routine` 1。原始错误见全量日志。
- **(B) i-full-chain 桌面会话生命周期时序偶发**：T3 全量本轮 **0 次**；整文件隔离复跑 6 次中 3 次出现（run2 2 项、run3 1 项、run5 1 项；run1/4/6 全绿），均为 `会话尚未开启（点击左侧角色即可开启）` / `会话已关闭，请重新点击角色。`（open→send/close 竞态），与 S1 §6.3(B)、目录授权 D6、i18n 集成记录同族；**非本变更确定性新增失败**（本变更未改该文件/夹具默认路径），也不掩盖其存在。日志：`isolated-i-full-chain-run1..6.log`。
- **(C) 本变更新增确定性失败：0 项。** 未以 `skip`/`todo` 冒充通过。

## 5. 类型检查与构建

| 命令 | exit | 结果 | 日志 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 无诊断 | `typecheck.log` |
| `npm run typecheck:renderer` | **0** | 无诊断 | `typecheck-renderer.log` |
| `npm run build:renderer` | **0** | Vite 构建成功（307 ms）；产物写入 `app/renderer/dist`（vite `root: app/renderer`、`outDir: dist`；`.gitignore` 第 9 行忽略；`git status -- app/renderer/dist` 0 项，无跟踪差异） | `build-renderer.log`、`build-renderer-tree.txt` |

## 6. 真实 Electron（fresh userData）

- 命令：`ANS_E2E_OUTDIR=<evidence>/electron-e2e-runN node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs`
- 运行 1：exit 0；`E2E_PASS=true`、`E2E_FAILURES=`（空）、`E2E_DONE=1`；原始输出/报告/截图：`electron-e2e-run1/`。
- 运行 2：exit 0；`E2E_PASS=true`、`E2E_FAILURES=`（空）、`E2E_DONE=1`；`electron-e2e-run2/`。
- **覆盖边界（如实记录）**：现有 `main.mjs` **不含**本变更新增系统行（客户拒绝 / 自动决策未通过 / 报告缺段）的定向断言（`grep acceptanceRework|acceptance-rework|自动决策未通过/未完成` 为空）。按团队计划 §3.3「默认运行、定向扩展最小追加」与本任务约束，**未改 `main.mjs`**；该点记为**未覆盖**，交独立验收判断是否需要追加定向冒烟。本变更新增系统行的确定性断言由 S7-A/C/D 与 S2–S5 的桌面测试覆盖；Electron 证据用于启动/导入/聊天/卡片/系统行通道不回归。

## 7. 目标项目只读复算（`ans-gateway`；零写入）

### 7.1 当前快照（2026-10-23 21:07:30 +08；只读）

| 文件 | SHA-256 | 字节 | 行数 | mtime（本地） |
| --- | --- | --- | --- | --- |
| `docs/flows/ai-governance-pipeline.yaml` | `bd057b1d3157851cc68ba26a4f54fa726b112c55dd9e7b7c5fd9169186054163` | 22,551 | 671 | 2026-10-23 20:57:56.508 |
| `.ans/governance/ledger.jsonl` | `bdafbf45ad1444c6b6d15fc1b25654c86b65fd9035a9c2e4eeef3cf18f218564` | 484,243 | 751 | 2026-10-23 20:57:37.379 |
| `docs/acceptance/…-report-v1.md` | `0106dc8092fec6f7bf14b96aac6d2e07f0d0023b9136e5cd7335c7c9df04c801` | 21,897 | 163 | 2026-10-23 15:59:53.997 |
| `docs/acceptance/…-report-v2.md` | `d0df0789ae3a01ad8955165417e287186cb13b573206ea5224fc0d33433d9d32` | 15,288 | 150 | 2026-10-23 17:37:20.759 |

- flow：**59 步**（done 18 / superseded 40 / pending 1 `verification`）；账本：**751 条、0 坏行**（customer.decision 121 / artifact.observed 547 / dispatch.accepted 79 / intent.handed-off 4）。
- 唯一 acceptance 决定：第 368 行 `2026-10-23T08:05:01.066Z` `rejected`（`decisionEvidence.kind:"customer-input"`）；最近 `stepId:"verification"` 的 verifier 派发：第 359 行 `08:01:26.084Z`；两版报告均无 `acceptance-rework` 段（0 次）。
- **与 S1 快照对照（外部漂移）**：S1 为 flow `0805213a…`/40 步、ledger 530 条；当前已漂移到 `bd057b1d…`/59 步、751 条。报告 v1/v2 哈希未变。漂移来自目标项目外部操作（另一会话/人工），**不是本角色写入**；本角色未在目标根执行任何写命令。
- **零写入证明**：读取命令内 before/after 哈希逐字节一致（`target-project-snapshot.txt`）；复算脚本对四个源文件在复制前后再次计算 SHA-256 一致（`zeroWrite.unchanged: true`）；`.ans/governance/` 仅 `ledger.jsonl`，**不存在** `acceptance/` 路由记录目录；目标不是 git 仓库（`git rev-parse` = no），无本角色新增文件。

### 7.2 A/B 语义复算（临时夹具；`target-recalc.mjs` → `target-recalc-output.txt`）

- **A 语义重建**：复制当前 flow/账本到系统临时根；A 快照没有未结算决定，因此仅排除外部后加的未结算决定（不删 done/superseded 步骤；现场执行步骤已全 done），保留 08:05 `rejected`。结果：
  - strict：`ready:false`，唯一 issue「验收已拒绝，流程等待返工；返工后需重新派发验收。」；
  - `allowRejectedAcceptance:true`：`ready:true`；
  - 内存移除 rejected（不写回）：`ready:true`。⇒ 复现「仅 rejected 挡住、移除后 ready」。
- **B 语义**：把某个 done 的 `rework-*` 步骤改为 `dispatched` 并去掉证据，移除 rejected 后仍 `ready:false`（「执行步骤 … 尚未完成」）。⇒ 返工未完成时不会误派。
- **reopen 语义（真实 Pipeline 出口）**：rejected + `verification:dispatched` + 旧 acceptance 证据 ⇒ `ok:true`，verification 变 `pending` 且 `evidence:null`；`verification:done` ⇒ `acceptance-already-done`（不自动重开）。
- **重派门事实**：`decisionAtMs=1792742701066` < `flowMtimeMs=1792760276508`（rejection 后 flow 有更新）；`acceptanceLastDispatchAtMs=1792742486084` < flow mtime（旧复核早于 flow）；A 语义夹具下门通过（允许一次重派）。同内容抑制以 `record.lastDispatchedFlowSha256 === 当前 sha` 为例（记录为假设，不写目标）。
- **报告兜底**：report-v1/v2 的 `parseAcceptanceReworkReport` 均为 `missing`（0 次 `acceptance-rework`），证明不解析 §8/§9.1 自由文本。

### 7.3 **重要发现（交验收/统筹）**：目标现场有外部后加的未结算决定

- 账本第 **646** 行（`2026-10-23T12:08:21.756Z`，`actorRoleId:"rapporteur"`，`decisionEvidence.kind:"customer-input"`）是 `decisionKind:"unclassified"`、`customerDecision:"none"` 的客户决定（摘要「确认冻结契约 v3 docs/contracts/ai-governance-pipeline-contract-v3.md」）。
- 按**既有未结算决定口径**（本变更未改），`evaluateFlowCompletion` 对现场形态 `allowRejectedAcceptance:true` 仍返回 `ready:false`（「该流程仍有未结算的决定」），因此**升级后目标项目会先路由 Convener，但不会立即自动重派 Proof**，直到该未结算决定被核对/结算（或迁移/补证）。
- 这不是本变更缺陷：P1 明确「未结算决定继续挡收口」；A 语义（无该决定）复算通过。但它改变了「升级后允许一次重派」的现场预期，**必须由统筹/独立验收与目标项目 Convener 记录处置（登记/核对/结算该决定）**，不能把目标项目未恢复归因于本变更测试失败。
- 复算只证明新逻辑在复制快照上按门动作，**不等于目标项目已修复**；本角色未写目标项目。

## 8. 最终候选哈希（与 S2–S5 记录逐文件一致）

> 完整原文（含测试文件）见 `candidate-hashes.txt`；以下为产品候选关键文件，工作区、HEAD `ee59296`。

| 文件 | `git hash-object` | SHA-256 |
| --- | --- | --- |
| `src/common/编排/flow-state.ts` | `723f34659101f80f757b0e3ead74560a17c3770d` | `ea271ee88067b0b2bcf67576141f09dd6efaa0e2a78f01e66b2ebdb74148bd4a` |
| `src/common/编排/flow-service.ts` | `8d783e991b885c6d72b7e269c8e9f1a012c9be1a` | `29cd83f99fd0e7d73801c76dc0f70921704dbfd5f37e3f65820c0de7c5213919` |
| `src/common/编排/acceptance-rework.ts`（新） | `45843ef4bb2ff0c338ce89219e116ede21f9d9d6` | `a8598588cda2d3a805c2879c5381870184a0973cb68e8b3a893ff40048ea9559` |
| `src/pipeline/orchestration/flow-state.ts` | `bb6963db1c716e99b8e956ca0711ac1fb545cd1b` | `96966286ca48e5356d39bb2e825b424aec7b7c3022bb8a321d98c3be715f59dc` |
| `app/desktop/customer-input.ts` | `987c090dd935a08ce83c88084e042379a928f150` | `dd709a41b8e8307570814c346542218674ba996af65300f31c1ceea96168b186` |
| `app/desktop/interface.ts` | `a49a84c85a431648fdd2fa58ea11e07b2ee3bcfb` | `20e9b545eb3a41faa24a4269aad863ec331885173ce9a8d9599f952d719139bf` |
| `app/desktop/governance-advance.ts` | `3ca76030a5b310dbe0c11776fa937206bda759b9` | `3a75af8c4a111e75930df25acc1417fca5013dbbbd2b2208623a3123206a5947` |
| `app/main.ts` | `b7801bc06e83187b35b373ee7986743eea96b1ed` | `cc7982ea7156e2b55d2f434b1e3aa0fb1c61372aeeca50cd8b5a25f771346342` |
| `src/provider/runtime/tools.ts` | `2a7983459249aff27b1ba43193d07d8cf7c72658` | `b3bc52c45042c7493b8ed9e122654513481f67f7877e4d551a6e0479e88153a1` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `c0501469ed8b8631e63ba124f419aa642a034400` | `d487a8d4853004daea619a82b2d760ff3218d6fd1015f1c29623d2ae15953e4e` |
| `src/common/shared/i18n/messages/en-US.ts` | `74ab4a7d654143b20b6614d7508f48da67c211cc` | `05089d70b7b1e0ee720d619efb57aa8d305b7b8f004f4be66144476257e4b373` |

- 一致性核对：上表与 S2（`06-candidate-hashes.txt`）、S3 §7、S4 §4、S5 §6 的候选哈希**逐文件一致**；`test/桌面应用/e2e/main.mjs` 仍为 S1 基线 `142e0f18…`（本变更未改）。
- 候选在全部 S7 运行后复算未变（`CANDIDATE_HASHES_STABLE=yes`；见环境/哈希日志）。

## 9. 残余风险与未覆盖（如实）

1. **目标项目外部未结算决定**（§7.3）：现场自动重派会被既有 fail-closed 口径挡住，需目标侧/统筹处置；不是本变更测试失败。
2. **目标报告无结构化段**：路由只能走「报告不完整」兜底（无 items、无 flow 步骤），需 Convener 读报告或要求 Proof 补 `acceptance-rework/v1`；重派任务要求 vN+1。
3. **legacy Markdown（Q6 A）**：历史 rejected legacy 流程不自动重派，需迁移 YAML；已由 S7-I 锁定旧行为。
4. **真实 Electron 未覆盖新系统行定向断言**（§6）：未改 `main.mjs`；交独立验收判断是否追加。
5. **i-full-chain 时序偶发**（§4.2B）：隔离复跑可复现（open→send/close 竞态），T3 全量本轮未复现；既有家族，非本变更确定性新增。
6. **fixture 工作树既有改动**：`fixture.ts` 的 diff（相对 HEAD 494 行）多数属既有工作树改动（S1 已记录）；本角色只追加 §1.1 可选钩子，默认关闭，`test/测试/**` 既有用例全部通过。
7. **测试角色不自验产品**：本记录不判定 P1–P12，不声称验收通过；候选只对当前工作区内容有效，任何产品文件变化使本记录证据失效（标准 §2.3）。
8. **未提交/未推送/未发布**：`git diff --cached` 为空；无 commit/push/merge/release；未写目标项目；未使用真实凭据/在线模型。

## 10. 证据清单（目录 `角色卡/测试/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 环境、HEAD/tree、Node/npm、完整 `git status --short`、暂存为空 |
| `candidate-hashes.txt` | 22 个产品/测试候选文件的 `git hash-object` + `sha256sum` + 字节 |
| `write-set-and-hashes.txt` | 本角色写集、新 e2e/fixture 哈希、暂存 0、真实 `docs/flows`/`.ans` 未改 |
| `fixture-full-diff-from-head.patch` | `fixture.ts` 相对 HEAD 的完整 diff（含既有改动；本角色钩子可定位） |
| `s7-new-e2e.log` | 新 e2e 原始输出（10/10，exit 0） |
| `directed-*.log` | 六个受影响套件原始输出（含命令/起止/exit/计数） |
| `affected-suites-summary.txt` | 受影响套件计数、5 项失败分类、与 S1 对照 |
| `full-regression-excluded-file-list.txt` | T3 全量 360 文件清单（排除 `write-sequencing.test.ts`） |
| `full-regression-serial-excluding-write-sequencing.log` | T3 串行全量原始 stdout/stderr（3790/3763/9/18/0；exit 1） |
| `full-regression-summary.txt` | 全量计数、9 项 EPERM、18 skip、与 S1 差额、i-full-chain 分类 |
| `isolated-i-full-chain-run1..6.log` | i-full-chain 整文件隔离复跑（3/3、1/3、2/3、3/3、2/3、3/3） |
| `typecheck.log` / `typecheck-renderer.log` | 两条类型检查原始输出（exit 0） |
| `build-renderer.log` / `build-renderer-tree.txt` | Vite 构建原始输出与产物清单/hash；dist 为 gitignore |
| `electron-e2e-run1/` / `electron-e2e-run2/` | 两次 fresh userData 真实 Electron：launch.txt、stdout.log、report.txt、截图、diagnostics |
| `target-project-snapshot.txt` | 目标四文件哈希/大小/行数/mtime、flow/账本摘要、前后哈希零写入 |
| `target-recalc.mjs` | A/B 语义与 reopen/门复算脚本（只读目标、临时夹具） |
| `target-recalc-output.txt` | 复算原始输出（live/A/B/reopen/门/报告/zeroWrite） |
| `structural-checks.txt` | 只读结构性核对（无 `addFlowStep`/`flow_step_add`；new 函数只经 Pipeline + 桌面消费；枚举定义处） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |

## 11. 状态声明

- 本记录状态 **`verified-by-tests-only`**：测试角色已对当前候选完成独立 e2e、受影响套件、T3 串行全量、真实 Electron、目标项目只读复算与类型/构建核对；**不是验收结论**，不声称 P1–P12 通过，不授权提交/推送/合并/发布。
- 目标项目复算只证明产品逻辑在复制快照上按门动作，**不等于目标项目已修复**；现场外部漂移与未结算决定见 §7.3。
- 未改产品源码、其他角色测试/角色卡/边界/方案/标准；未 commit/push；未写目标项目；未使用真实 `.env`/凭据/在线模型。
