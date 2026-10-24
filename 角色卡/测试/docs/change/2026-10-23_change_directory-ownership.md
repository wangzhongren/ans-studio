# 变更记录：目录级授权与目录规范（directory-ownership）——测试角色验证

- **任务**：`2026-10-23-directory-ownership`（产品 flowId `directory-ownership`）
- **风险档位**：**T3**（治理/权限/流程设计变更；方案 §1/§11、团队计划 §1.2）
- **角色**：测试（Testing worker，独立固定角色上下文）
- **日期**：2026-10-23
- **状态**：**`verified-by-tests-only`（仅测试角色在**最终候选**上完成 v3 夹具/e2e/布局核对/T3 全量回归与真实启动验证；不是验收通过，不是候选验收结论）**
- **授权依据**：
  - 客户闸门 2 与实施授权：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`
  - 方案：`docs/planning/2026-10-23_design_directory-ownership.md`（§5.3 V-D/V12、§6 布局核对、§7 完整流程、§9.2、§11 P1–P12）
  - 验收标准 v1.1：`docs/acceptance/directory-ownership-criteria-v1.md`（P12/P14/G1–G3；`实现目录` 必填）
  - 团队计划：`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`（§4.3 测试、§5 D6/D7、§6）
- **写集**：`test/测试/`（本记录与证据目录除外）；未改 `src/**`、`app/**`、其他角色测试/角色卡/边界、`test/桌面应用/`、`docs/scheduling|acceptance|communication`、package/tsconfig/vite。
- **证据目录**：`角色卡/测试/docs/change/2026-10-23-directory-ownership-evidence/`
- **候选版本**：见 §1.2；本记录 §二以后全部指向**最终候选（含 D5 修复）**。D6 中间候选结果保留在 §五.4 供对照，不作为最终证据。

---

## 一、候选身份与环境

### 1.1 环境事实

| 项 | 值 |
| --- | --- |
| 时间 | 2026-10-23 12:15 起（D6）、12:29 起最终候选复核；最终全量 12:34:06 → 12:39:31 |
| 仓库/分支 | `C:\Users\51054\Desktop\work\ans-studio` / `main` |
| HEAD | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（未提交；工作树含 D4/D5、i18n B0 与 D5 修复的既有改动） |
| OS / Shell | Windows 11 Pro 10.0.26300；Git Bash（MINGW64_NT-10.0-26300，bash 5.3.15） |
| Node / npm | v24.22.1（`/c/Users/51054/AppData/Local/Programs/nodejs/node`；命令前 `export PATH=...`）/ 11.19.1 |
| Electron | v44.7.0（`package.json` 44.7.0；真实 Electron 自检） |
| 暂存区 | `git diff --cached --name-only` 为空（未暂存） |
| task_ops | 未启用（无 `.ans/project.json`）；不伪造令牌/审批/机器预检 |

### 1.2 最终候选身份（产品改动 delta 由对应 owner 提供，测试角色只读核对/运行）

**桌面窗口 D5 修复 delta（既有精确文件；测试角色未改）**

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/desktop/governance-advance.ts` | `8f90a7138a2742509c484e5c856b26497878c3e7` | `90dbfbd1cb32474b8687d11e02cbe507f1c8773f57af8e1e7bd6499975e4bb90` |
| `app/desktop/interface.ts` | `61e91311207c739d560d308577135c2205feffb8` | `1f580f0f5ba5431461fbd451034ab95314651f47a4b9d7a4fc3e39548c305ed4` |
| `test/桌面应用/interface.test.ts` | `3e3b9083f646aaf0d5925d1915ab9408fd6fc842` | `45cec1f88f0a8fc3cca47443f45fea93898faf500d21bd0b1891dbf204711242` |
| `test/桌面应用/operator-wiring.test.ts` | `679d3ce6809beea3dac0be493b9bb535ba5cc10c` | `997af101d9cd103b4945c48a05417dd8b8741d31d12cf6a8c4a98dcdd45713cb` |
| `test/桌面应用/e2e/main.mjs` | `67f0572e700fbfc9bfe65e480a37ac307909d456` | `ec77bf3be4ac359bb4b82b5698c49667fd251705ad182279842ca674140fbe7a` |

修复内容（只读核对）：提案接受→Convener 的默认任务文案改为**新流程默认 v3**（`governance-advance.ts` 约 869–883 行：显式 `teamPlanSchema: 1|2` 才走 v2 文案，缺省走 v3）；`interface.ts` 同口径 schema 分支；`test/桌面应用/e2e/main.mjs` 注册 `preferences:get` / `preferences:set-locale` 内存桩（D6 曾观测到 3 处未注册错误）。

**测试角色改动文件（7 个；本记录与证据目录之外）**

| 文件 | `git hash-object` | `sha256sum` | 说明 |
| --- | --- | --- | --- |
| `test/测试/governance-e2e-auto/fixture.ts` | `9ce3caed83e87f21f4444875b054d79bf4816e69` | `ec1b2c1dde230dc758c25b361100fcbae8802ef356c75524f2fe5c22c69f5981` | v3 计划生成器/共享 split 场景；`roleBoundaryDoc` 可选 `extraEntries`（默认行为不变）；v1/v2 夹具保留 |
| `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | `da5b0c53bf3b44bdc652c15a2ee2107341ce81b6` | `c35da9810c995a3d556e2f406323a273024e5521dac77cb23c14d4f933296cee` | v3 卡前守卫负例 15 个 + `唯一写集` 别名正例 |
| `test/测试/governance-e2e-auto/q-role-granularity.test.ts` | `8a1cd8a85a64250de4ff9958cc58c157adca264a` | `9689f5cbe1ec299921d6d92d3174a68369d482b985a6bd37d999c3e9d8148c52` | q11–q15（v3 正向/负例/共享/V11/真实守卫） |
| `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | `7973d367a43fbd09a893496f1d73b67e80e022e9` | `305cc0ab4027e16ea25cb5730cb6324533732385810b1b5d774a5eb516726159` | r6 v3 Map/Reduce 硬前置不回归 + r7 v3 分片隔离 |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `a28009aeafff85fa96907f3150420d034f91d2ad` | `83c2c3905d1ed7be443c4847babc0a7129c47263707163ba107eac4f2a71b785` | 新增 v3 完整链路；v1/v2 链路保留 |
| `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | `aa3f78bc0ecdc69c9d0ecc0ccf565340de6311e7` | `bc0ce9cee9bf9dcdb2d45a33f61bbbf99ceb6eac6f8487e7a4f40983772616e7` | 场景 2c：Convener 任务断言更新为 D5 修复后的**默认 v3**文案（并断言不得再给默认 v2）；场景仍真实写 v2 计划、Crew 文案仍按 v2 计划断言，legacy 覆盖不弱化 |
| `test/测试/directory-layout.test.ts`（新增） | `1eb758d1e0e4f8a1fb2141187a69dc8d714ee18f` | `7a4b845f4b8396a9b23ae90746197b64051a00abfea1663bee3e343af191154e` | 布局核对 e2e（临时 git 项目根 + 原始 status/diff） |

**候选稳定性**：上述 12 个文件（5 个桌面 delta + 7 个测试角色文件）在最终候选全部测试/Electron/全量回归前后 `git hash-object` 与 `sha256sum` 逐字节一致（`final-candidate-hashes-start.txt` 与 `final-candidate-hashes-end.txt`；diff 仅为 `directory-layout.test.ts` 的行序，内容一致）。

### 1.3 写集核对

- `git status --short -- src app test` 中，属于测试角色的改动仅为上述 7 个文件；其余 `src/**`、`app/**`、`test/**` 为 D4/D5、D5 修复与 i18n B0 的既有上下文，不是本角色产物。
- 未新建 `test/桌面应用/` 文件；未改其他角色测试；未写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/verification/`（本仓库证据写本角色 `docs/change/`）。
- 未 commit、未 push、未暂存、未发布。

---

## 二、改动摘要（测试角色）

### 2.1 `fixture.ts`：v3 计划生成器（保留 v1/v2）

- 新增 `TeamPlanV3RoleInput`/`TeamPlanV3ModuleInput`/`TeamPlanV3DirectoryInput`/`TeamPlanV3Options` 与 `teamPlanV3Doc`：
  - frontmatter `teamPlanSchema: 3`、同一行 `directories`、`modules`、`recommended`、`riskTier`；
  - 模块清单 5 列（含 `实现目录`）；
  - 角色表 15 列（`授权目录 | 精确写集 | …`；列名可覆盖为 `唯一写集`/`边界` 以构造别名正负例）；
  - 「目录规范」12 列表 + 五维判断章节；
  - `v3DirectoryRowText`/`v3ModuleRowText` 行渲染。
- 新增共享场景：`v3CanonicalParts`（storefront/checkout-api 两个 Map + 既有 Reduce tester；目录规范 5 行）与 `v3SharedSplitPlan`（`shared: split` 父子目录场景，含父目录被直接分配的负例）。
- `roleBoundaryDoc` 增加可选 `extraEntries`（v3 精确写集文件；缺省输出与既有调用完全一致）。
- **未改动** `teamPlanDoc`（v1）与 `teamPlanV2Doc`（v2）；既有 v1/v2 夹具没有批量迁移。

### 2.2 测试覆盖（按任务 1–5）

| 要求 | 覆盖 |
| --- | --- |
| v3 负例：缺规范/重复目录/多 owner/目录重叠/嵌套/治理路径/整层名/路径逃逸/`shared: split` 违规/缺 `实现目录`/角色目录不在模块实现目录/`唯一写集` warning/`边界` 列名 error | `p-team-plan-guard.test.ts` 15 个新负例 + `q-role-granularity.test.ts` q12/q13；负例全部在真实卡前守卫下断言「不发卡/不判断/不写账本/不派 Crew」；别名 warning 单独正例（发卡并代批） |
| v3 完整链路 | `i-full-chain.test.ts`：计划 v3 → appointment → Crew 写卡/目录边界（V12 new 一致、existing ⊆ 边界）→ readiness（`directories/spec/shared/layout`）→ Map 在授权目录内新建文件/子目录 → 布局核对 pass（含**反例**：executor 自检 reviewer 目录 ⇒ fail）→ Reduce manifest → 变更包 → Verifier → acceptance；同文件 v1/v2 完整链路保留并通过 |
| 角色粒度/MapReduce v3 | `q-role-granularity.test.ts` q11–q15（正向/负例/共享/V11/真实守卫）；`r-mapreduce-parallel.test.ts` r6（Map 并行组、Reduce dependsOn 硬前置）、r7（v3 分片独立根/日志/输出、失败隔离、共享只读计划哈希不变、manifest 索引） |
| 布局核对 e2e | `test/测试/directory-layout.test.ts`：临时 git 项目根；目录内新增文件/子目录 pass；跨目录/他人目录/禁写区/命名不符/子目录越界/路径逃逸 fail；删除按原路径、重命名按新路径；管理记录/角色根工作文档跳过；报告与原始 `git status --short --untracked-files=all`/`git diff` 一致且可复算 |
| legacy | `real-entry.test.ts` 未改（`docs/scheduling` 快照语义保持「不新增/不改写」；本轮未新增调度记录）；v2/v1 旧断言全部保留；`b-proposal-accept-timing` 的 v2 计划场景保留，仅更新 Convener 默认文案断言到真实 v3 行为 |

**v3 语义边界**：v3 不改变 flow schema/V11；q14/r3/r4 断言 `FLOW_STEP_KINDS` 仍四值、旧 flow 不新增前置检查；V11 对 v3 计划与 v2 一致（`delivery-<module>`、`contract-freeze`、Reduce 覆盖全部 Map）。

---

## 三、最终候选定向测试

| 套件/命令 | 结果 | 原始日志 |
| --- | --- | --- |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | **123 tests / 123 pass / 0 fail / 0 skipped**（exit 0） | `final-governance-e2e-auto-suite.log` |
| `node --test test/测试/directory-layout.test.ts` | **1 / 1 pass**（日志内打印逐路径布局核对报告） | `final-directory-layout.log` |
| `npm run typecheck` | **exit 0**（无 TS 错误） | `final-typecheck.log` |
| `npm run typecheck:renderer` | **exit 0**（无 TS 错误） | `final-typecheck-renderer.log` |

套件内计数（相对改动前基线）：p 19 → **35**（+16：15 个 v3 负例 + 别名正例）；q 10 → **15**（+5）；r 5 → **7**（+2）；i 2 → **3**（+1）；套件合计 99 → **123**（+24）；另有新增布局测试文件 **1** 例 ⇒ 测试角色新增 **25** 例（v3 语义 24 + 布局 1）。

**关键断言示例（原始输出见日志）**：
- v3 计划解析：`teamPlanSchema: 3`、`directories` 5 项、目录规范 5 行、模块 `实现目录` 为 `src/storefront/`、`src/checkout/`；无 error/warning/exception-review。
- 卡前守卫：负例 `receipt.ok=false` 且消息含具体规则；`presented=0`、`judgeInvocations=0`、账本无 appointment、`nominator` 未开会话。
- 完整链路：`appointment.targetRoleIds=["executor","reviewer","tester"]`、`artifactPath=docs/scheduling/flow-a-team-v1.md`、`decisionEvidence.kind=judge`；Crew 任务含「团队计划 v3」「授权目录：src/storefront/」「v3 写卡要求」；readiness 任务含「团队计划为 v3（teamPlanSchema: 3）」「模块实现目录：storefront→src/storefront/」「directories/spec/shared/layout」；Map 新建 `src/storefront/handlers/create-order.ts` 等 4 个文件（含一层子目录）后布局核对全部 pass；反例 fail；acceptance 由判断代批且 `0` 张手动卡。

**D5 修复后的测试更新（非弱化）**：最终候选首次套件运行出现 1 项确定性失败——`b-proposal-accept-timing.test.ts:341` 仍断言 Convener 任务含「团队计划 v2」，而修复后的默认文案已是 v3（失败原文与分类：`d5-fix-suite-first-run-failure.txt`）。测试角色按真实行为把该断言更新为 v3 默认（并新增 `directories`/`目录规范`/`实现目录` 断言 + 断言不得再给默认 v2），场景仍写 v2 计划且 Crew 文案仍按 v2 断言；重跑 **123/123**。未改产品、未删除/放宽其他断言。

---

## 四、最终候选真实启动/演示

### 4.1 真实 Electron 自检（既有 `test/桌面应用/e2e/main.mjs`，未新建文件）

- 命令：`ANS_E2E_OUTDIR=<evidence>/electron-e2e-final ./node_modules/.bin/electron test/桌面应用/e2e/main.mjs`
- 结果：**exit 0**；`report.txt` 中 `E2E_PASS=true`、`E2E_FAILURES=`（空）、`E2E_DONE=1`；`ROLE_COUNT=16`；17 张截图；真实 Electron 主进程 + 真实 preload + 真实渲染进程（模型路径为既有离线/演示适配器，**未使用真实模型/在线会话/凭据**）。
- **`No handler registered for 'preferences` 计数 = 0**（D5 修复的 e2e harness 已注册 `preferences:get`/`set-locale` 内存桩；D6 曾出现 3 处，已在最终候选消除）。
- 证据：`final-electron-e2e-main.log`、`final-electron-e2e-summary.txt`、`electron-e2e-final/report.txt` + 17 截图。

### 4.2 v3 计划解析/布局核对临时项目根演示

- `test/测试/directory-layout.test.ts` 在系统临时目录创建真实 git 项目根：`parseTeamPlan`（pipeline 公共出口）解析 v3 计划 → 原始 `git status --short --untracked-files=all`/`git diff` → `checkDirectoryLayout` 逐路径核对 → 报告可复算。
- 记录：`v3-demo-temp-root.txt`、`final-directory-layout.log`（含完整报告与候选哈希）。
- **证据边界**：v3 语义链路由确定性 e2e 证明；未声称跑过真实模型/在线治理会话。真实 Electron 自检证明应用可真实启动/退出与关键检查，不替代 v3 治理链路。

---

## 五、最终候选 T3 全量回归（串行，排除已知挂起）

| 项 | 值 |
| --- | --- |
| 命令 | `mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"` |
| 文件数 | **355**（`test/**/*.test.ts`，排除 `test/pi-adapter/write-sequencing.test.ts`） |
| 排除理由 | 已知挂起：2026-10-22 基线与 2026-10-23 首轮 T3 基线均在该文件 3 个用例打印 `✔` 后进程不退出（基线记录 §四/§9.3 同口径） |
| 开始/结束 | 2026-10-23 12:34:06 → 12:39:31（duration 324,202.4 ms） |
| 计数 | **3655 tests / 3628 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled** |
| 退出码 | **1**（9 项既有 EPERM，见下） |
| 原始日志 | `final-full-regression-serial-excluding-write-sequencing.log`；摘要 `final-full-regression-summary.txt`；失败原文 `final-full-regression-failures.txt`；文件清单 `full-regression-excluded-file-list.txt` |

### 5.1 与基线及 D6 上一轮对照

| 指标 | 基线（B0 后、v3 实施前） | D6 上一轮（修复前） | **最终候选（含 D5 修复）** | 最终相对基线 | 最终相对 D6 |
| --- | --- | --- | --- | --- | --- |
| tests | 3591 | 3655 | **3655** | **+64** | 0 |
| pass | 3563 | 3627 | **3628** | **+65** | **+1** |
| fail | 10 | 10 | **9** | **−1** | **−1** |
| skipped | 18 | 18 | **18** | 0 | 0 |
| todo | 0 | 0 | **0** | 0 | 0 |

**tests +64 归因**：测试角色新增 **+25**（v3 语义 24 + 布局 1）；D4 既有上下文 `test/编排/directory-conformance.test.ts` **+15**；其余 D4/D5 实施阶段既有上下文测试 **+24**（非本角色改动，逐文件归属以各 owner 报告为准）。

**失败差额**：基线 10 = 9 既有 EPERM + 1 桌面时序偶发；D6 10 = 9 EPERM + 1 桌面时序偶发（新实例）；**最终 9 = 仅 9 项既有 EPERM，本轮未出现桌面时序偶发**。**新增确定性失败：0 项。**

### 5.2 失败分类（最终 9 项，全部为既有 Windows symlink `EPERM`）

1. `native symlink and storage runtime mismatch fail before SDK query`（`test/claude-adapter/session.test.ts`）
2. `native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary`（`test/codex-adapter/session.test.ts`）
3. `store validate callback rejects directory symlink before Pi parse or new native write`（`test/pi-adapter/injected-runtime.test.ts`）
4. `Pi storage refuses file symlink and role/runtime mismatch without touching other storage`（`test/pi-adapter/injected-runtime.test.ts`）
5. `D3 linked workspace root remains usable; linked target itself is not replaced`（`test/runtime-core/file-write-safety.test.ts`）
6. `store: traversal, mismatched scope and symlinked runtime directories rejected`（`test/runtime-core/session-store.test.ts`）
7. `store: native validation stays lazy and native symlink is rejected before effects`（`test/runtime-core/session-store.test.ts`）
8. `读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛`（`test/测试/g4-skill-verify/b-render-double-check.test.ts`）
9. `node test外指符号链接路径不获委托；项目内测试路径获委托`（`test/编排/shell-authorized-routine.test.ts`）

错误均为 `EPERM: operation not permitted, symlink ...`（errno -4048），与历史基线清单逐条一致。

### 5.3 关键用例在最终全量中的状态

- v3 完整链路、v2 完整链路、五角色全自动链路、布局核对 e2e、q11/q15、r7、`v3 唯一写集别名`、`场景2c（v2）`：全部 ✔。
- 本角色 25 个新增用例在最终全量中全部通过；`b-proposal-accept-timing` 更新后的 v3 默认断言通过。

### 5.4 D6 中间候选结果（保留对照，不作为最终证据）

D6 全量（桌面修复前）为 **3655 / 3627 / 10 / 18 / 0**（exit 1）：9 项既有 EPERM + 1 项桌面会话生命周期时序偶发（`i-full-chain` 五角色链路的 `send(convener)` 返回“会话尚未开启”）。隔离分类：整文件 4 次 3 次全绿、1 次 v2 链路 `send(tester)` 返回“会话已关闭”；每个链路用例单独运行各 2/2 绿；既有两条链路组合 3/3 绿；另有 `chain-flake-isolation.txt` 与 `full-regression-isolation-*.log`。最终候选重跑未再出现该偶发。

---

## 六、发现与未决项（交统筹/owner，不由测试角色修）

1. **D5 默认文案缺口已由桌面窗口修复并在最终候选验证**：提案接受→Convener 默认 v3；显式 v1/v2 文案保留（`operator-wiring.test.ts` 由桌面窗口断言）。测试角色只更新了 `test/测试/` 内与该行为相关的 `b-proposal-accept-timing` 断言。
2. **桌面会话生命周期时序偶发**：D6 出现 1 次（新实例，非确定性，隔离全绿）；最终候选全量未复现。仍建议桌面窗口 owner 关注 LRU/会话 open→send 竞态；不得把偶发当基线红掩盖。
3. **Electron `preferences:get` 未注册**：D6 观测 3 处；最终候选 harness 修复后 **0 处**，`E2E_PASS=true`。

---

## 七、证据边界声明

- **不是验收**：本记录状态 `verified-by-tests-only`；不判定 P1–P15/G1–G3，不写 `docs/acceptance/`，不声称客户确认或验收通过。
- **未真实模型/在线会话**：v3 语义链路由确定性 e2e（脚本桩 + 真实 gate/interface/ledger/客户通道/判断 driver）证明；真实 Electron 自检是真实启动/退出，但模型为既有离线/演示路径。未声称跑过真实模型/在线会话。
- **未改产品/其他角色测试**：未修改 `src/**`、`app/**`、`test/桌面应用/`、`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面UI/`、其他角色卡/边界、工程配置。桌面 delta 为对应 owner 的既有精确文件，本角色只读核对/运行。
- **未使用真实 `.env`/凭据**：全部临时目录/既有夹具；Electron 使用 OUTDIR 下的临时 Pi env 文件（dummy token），不指向仓库真实 `.env`。
- **未 commit/push/暂存/合并/发布**；未启用 task_ops；不伪造令牌/审批/锁/机器预检。
- **并发上下文**：工作树同时含 D4/D5、D5 修复与 i18n B0 的既有改动；本记录只对测试角色 7 个文件负责，不为其背书。
- **证据对应**：本记录 §二以后的结果均来自最终候选；D6 结果仅在 §5.4 作为对照，不再作为最终证据。

---

## 八、证据文件清单（最终候选）

目录：`角色卡/测试/docs/change/2026-10-23-directory-ownership-evidence/`

| 文件 | 内容 |
| --- | --- |
| `final-candidate-environment-start.txt` | 最终候选环境、HEAD、`git status`、桌面 delta diff stat |
| `final-candidate-hashes-start.txt` / `final-candidate-hashes-end.txt` | 5 个桌面 delta + 7 个测试角色文件 `git hash-object` + `sha256sum`（运行前后一致） |
| `final-governance-e2e-auto-suite.log` | 最终候选 v3/legacy e2e 套件原始输出（123/123 pass，exit 0） |
| `final-directory-layout.log` | 最终候选布局核对 e2e 原始输出（含逐路径报告与候选哈希） |
| `final-typecheck.log` / `final-typecheck-renderer.log` | 最终候选类型检查原始输出（exit 0） |
| `full-regression-excluded-file-list.txt` | 355 个文件清单（排除 write-sequencing） |
| `final-full-regression-serial-excluding-write-sequencing.log` | 最终候选 T3 串行全量原始 stdout/stderr（计数、失败原文、exit_code=1） |
| `final-full-regression-summary.txt` | 最终计数、相对基线/D6 差额与归因 |
| `final-full-regression-failures.txt` | 最终 9 项既有 EPERM 失败原文 |
| `final-electron-e2e-main.log` | 最终候选真实 Electron 自检 stdout/stderr 原文 |
| `electron-e2e-final/report.txt` + 17 张截图 | 最终候选真实 Electron 自检报告与截图（`E2E_PASS=true`，preferences 错误 0） |
| `final-electron-e2e-summary.txt` | 最终 Electron 命令/版本/退出/关键检查与历史对照 |
| `d5-fix-suite-first-run-failure.txt` | D5 修复后首次套件运行的确定性失败原文、分类与测试更新记录（123/122/1 → 123/123） |
| `v3-demo-temp-root.txt` | 临时项目根 v3 计划解析/布局核对演示说明 |
| `environment-and-worktree-start.txt`、`candidate-hashes-*.txt`、`governance-e2e-auto-suite.log`、`directory-layout.log`、`typecheck*.log`、`full-regression-*`、`electron-e2e*`（D6 批次） | D6 中间候选原始证据（保留对照，不作为最终证据） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成；最终定稿后重算） |

**状态再次声明**：本文件与证据只证明「最终候选下，测试角色编写的 v3 e2e/布局核对/legacy 回归/T3 全量回归/真实启动自检已执行并如实记录」；**不是验收通过**，最终判定由内置独立验收按 `docs/acceptance/directory-ownership-criteria-v1.md` 作出。
