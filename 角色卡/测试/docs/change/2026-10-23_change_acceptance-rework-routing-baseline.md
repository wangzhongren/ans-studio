# 基线记录：验收返工自动路由与 rejected 重新派发（T3）S1 实施前基线

- **任务 ID**：`2026-10-23-acceptance-rework-routing`｜**产品 flowId**：`acceptance-rework-routing`（任务标签）
- **记录角色**：测试（Testing worker，独立角色上下文）
- **执行者**：测试角色（本记录及全部原始日志均由测试角色执行产生）
- **日期**：2026-10-23
- **阶段**：S1「实施前准备」的基线部分（团队计划 §1.4、§四 4.1 S1、§5.3、§6.2/§6.3）
- **风险档位**：**T3（治理行为、验收结果路由、派发与 flow 收口语义变更）**；目标版本 **v1.7.0**
- **状态**：**S1 baseline complete；本基线不是实施/验收通过**。本记录只陈述实施前实测，不构成候选、不构成验收结论。
- **授权与闸门前提**：
  - 团队计划：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`（§1.4 基线、§四 S1、§六 边界、§七 风险）
  - 策划方案（只读基线）：`docs/planning/2026-10-23_design_acceptance-rework-routing.md`（客户闸门 1 确认的 v1，951 行；SHA-256 `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5`）
  - **闸门 2 已确认（2026-10-23，沟通记录 `docs/communication/2026-10-23_intent_acceptance-rework-routing.md`「闸门 2 确认记录（2026-10-23）」）；客户实施授权未给**：本任务只做只读基线，不实施、不派发、不改代码。团队计划文件头/§1.5 的「闸门 2 未确认」是**过期状态**，以沟通记录为准；团队计划 v1 哈希 `d95fc817…` 与沟通记录一致（`gate2-confirmation-check.txt`）。
- **基线身份**：分支 `main`，HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a834f31588797016d6ee2289a4ac3e97b`）
- **工作树前提**：当前工作树包含三项**已验收但未提交**的既有变更——i18n（T2）、目录授权 v3（T3）、治理写卡推进（T3）——按团队计划 §1.4/§7.3 作为**冻结基线**；本变更**尚未实施**。本记录不评价、不背书这三项变更，也不把它们并入本变更候选。

---

## 一、环境与工作树身份

### 1.1 环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-10-23 18:51:08 +0800 | `environment.txt` |
| OS | Windows 11 Pro 10.0.26300（`Microsoft Windows [版本 10.0.26300.9711]`）；`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64` | `uname -a`、`cmd /c ver` |
| Shell | Git Bash `/usr/bin/bash`，`GNU bash, version 5.3.15(2)-release` | `$BASH_VERSION` |
| 仓库 / 分支 | `C:\Users\51054\Desktop\work\ans-studio` / `main` | `pwd`、`git branch --show-current` |
| HEAD / tree | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` / `1149238a834f31588797016d6ee2289a4ac3e97b` | `git rev-parse` |
| Node PATH（默认 shell） | **不含 Node**；`node`/`npm` 需显式导出 | 实测 |
| Node（执行用） | **v24.22.1**（`/c/Users/51054/AppData/Local/Programs/nodejs/node`；每条命令前 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`） | `which node`、`node --version` |
| npm | **11.19.1** | `npm --version` |
| `package.json` | `ans-cli@1.6.0`；engines `node >=23.6`；无 `npm test`，测试用 `node --test`；typecheck 脚本 `tsc --noEmit` / `tsc -p app/renderer/tsconfig.json` | `runner-facts.txt` |
| 暂存区 | `git diff --cached --name-only` **为空**（0 项） | `environment.txt` |
| 工作树条目 | `git status --short` 共 **205** 项；其中 `src app test` 范围 **114** 项 | `environment.txt` |

### 1.2 工作树状态（基线起点）

- `git diff --cached --name-only` 为空，无暂存、无提交。
- `git status --short` 共 205 项，含已跟踪修改（`app/**`、`app/renderer/**`、`src/**`、`test/**`、`角色卡/**`、`docs/*/memo.md`）与未跟踪文件/目录（i18n 目录、目录 v3 夹具、管理文档、`.claude/`、`demos/` 等）。
- `src app test` 范围 114 项（`worktree-during-full-run.txt`）：包括 i18n 候选（`app/desktop/{i18n,preferences}.ts`、`app/renderer/src/i18n/**`、`src/common/shared/i18n/**`、`test/项目管理/shared/i18n{,-guard}.test.ts` 等）、目录 v3 候选（`src/common/编排/team-plan.ts`、`directory-conformance.ts`、门禁卡文本、桌面 V12/任务文案与相关测试）、治理写卡推进候选（`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/{interface,acceptance-dispatch}.test.ts`、`test/测试/governance-e2e-auto/**` 等）。**这些是既有上下文，不是本变更候选。**
- 本变更目标文件现状见 §二：`src/common/编排/flow-state.ts`、`test/编排/flow-state.test.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/tools.test.ts` 等于 HEAD；`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`app/desktop/{customer-input,interface,governance-advance}.ts`、`app/main.ts`、`test/编排/flow-service.test.ts`、`test/桌面应用/{acceptance-dispatch,interface,operator-wiring}.test.ts`、`test/桌面应用/e2e/main.mjs` 已被前三项变更修改（未提交），作为本变更实施前的冻结起点。

### 1.3 基线稳定性

- 全量回归运行中与运行后，`src app test` 范围的 114 个改动/新增文件 SHA-256 **逐字节一致**（`worktree-hashes-during-full-run.txt` vs `worktree-hashes-end.txt`，`diff` 为空）；`git status --short -- src app test` 前后相同；无并发写入混入本基线。
- §二目标文件哈希在基线收尾复核时与 `target-hashes.txt` 一致；无本角色或他方对这些文件的写入。
- 目标项目 `ans-gateway` 在基线快照命令内部 before/after 哈希一致（§七）；之后出现的漂移为**目标项目外部操作**，见 §七.5。

---

## 二、目标文件起始哈希（写前基线，不是候选）

> 列来源：团队计划 §三（§3.2–§3.6）逐文件写集。哈希为 2026-10-23 18:51:15 +0800 工作区内容。

| 文件 | 状态 | `git hash-object` | `sha256sum` | 字节 |
| --- | --- | --- | --- | --- |
| `src/common/编排/flow-state.ts` | 等于 HEAD | `ec1ba7c1706cc5b07ef17f01ef935bf529a8ea9a` | `f9c4959a8def24ecfbc317220ece27545195f1f7eaed0d930cb37a1b63252e44` | 47,540 |
| `src/common/编排/flow-service.ts` | 工作区已改（既有上下文） | `467d0925d4f5c687fb1f19787ef8d3dcfe9dd3a5` | `82049e2bf9570e23f3af43ee77654c3f5e8b9b23468518f1d0592cfd85ee514b` | 66,448 |
| `src/common/编排/acceptance-rework.ts`（计划新增） | **不存在** | – | – | – |
| `src/pipeline/orchestration/flow-state.ts` | 工作区已改（既有上下文） | `729597beba576f710a28c819386215145b793f6b` | `78172c7a760fc5f0df8319763032a0a80175daddf7a4102507feb2850ff08a9a` | 1,664 |
| `app/desktop/customer-input.ts` | 工作区已改（既有上下文） | `049117443573c6f844ff2f5c39572010e38d1b2e` | `2fd40074b7463fa0573dd1a1d0db0c7aa393abf5f620c3385b0797ca815209e2` | 65,944 |
| `app/desktop/interface.ts` | 工作区已改（既有上下文） | `80bb89cb214938f2127f8da5c72d1384eda692ba` | `7a02b434729689eaa83cfd622bc3dcb25ce460a1ac1ec365939c0f1bf268f158` | 292,874 |
| `app/desktop/governance-advance.ts` | 工作区已改（既有上下文） | `f4c997f2b330d5b5220518fe6640aac0eaf6a2b2` | `c84cf85454facff4e4013f7b8ad305da49d9a4eefd4aad63dcb1d21792c32fa7` | 78,874 |
| `app/main.ts` | 工作区已改（既有上下文） | `49cd5530345958d2e4f5dcb2887dfabfb5b37240` | `89d822f88821ad9f16cd9be3862670f75a4582400d26a87781f42e26f2d8a98f` | 61,888 |
| `src/provider/runtime/tools.ts` | 等于 HEAD | `2023e9f08be24c577f8c1adc91fc8f5d8792271b` | `c2e09c875b2fc633d4b1991379c1ccfdc12e32547e63ad344b96f5178463560c` | 166,067 |
| `src/common/shared/i18n/messages/zh-CN.ts` | 工作区已改（i18n 既有上下文） | `b38c7664bdbbf20ffa0ddc2ecf0de4d9bfaf0914` | `02fd19459fb8cb628b5b6d6054726852901c22abb5bd4309a5fb224727255df8` | 113,741 |
| `src/common/shared/i18n/messages/en-US.ts` | 工作区已改（i18n 既有上下文） | `15cfccc73faf6cd66c1243357f822ac357c23ecb` | `9522a65d6166d4fc6c4a9562bb86e59e705d44c721ac92e73385e8e0ebe28fff` | 120,976 |
| `test/编排/flow-state.test.ts` | 等于 HEAD | `015a60ac9c39f9137a25440c2c51ff34cda9245f` | `a1419d2de869c079e161f19d46c51ef1809b61bc62c2fd64953102a3398c0862` | 54,784 |
| `test/编排/flow-service.test.ts` | 工作区已改（既有上下文） | `0d28dad9cf2e2daebdb8b47fb44b32163a961e57` | `28d1b9b4cbe2899a0e69202983b92532d99d84af3473f72d918e1aa01f9af680` | 69,600 |
| `test/编排/acceptance-rework.test.ts`（计划新增） | **不存在** | – | – | – |
| `test/桌面应用/acceptance-dispatch.test.ts` | 工作区已改（既有上下文） | `d321afd85bbae8a15ed3a9910c7c1183903e91fa` | `2141841bcc14650ba65d9323d16bbc1b54004a478fc80681adfcd8922257c9e9` | 108,863 |
| `test/桌面应用/interface.test.ts` | 工作区已改（既有上下文） | `2185ae934ab8fff6377fd02504cadc0619e44d5e` | `448b2586fe133badfbbc7abd36253d405aea04516091146467e96afcb149dda0` | 346,615 |
| `test/桌面应用/operator-wiring.test.ts` | 工作区已改（既有上下文） | `73c1e22dcd64e88debc5f7b62625760292db637c` | `a8c9f24617b2e03b947b2257bcff60a5c917222af279ca86d34fbf4bc11cbed7` | 123,401 |
| `test/桌面应用/e2e/main.mjs` | 工作区已改（既有上下文） | `142e0f18d7701964053d97c6412d38809684c329` | `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b` | 173,881 |
| `test/runtime-core/tools.test.ts` | 等于 HEAD | `a1d10ddfd29932d57732c3d86a55d88f0ec80b36` | `a99c52cea45661a63910182d4df0502691d29eef08a627e431fbf964afcd1ef6` | 20,547 |
| `test/项目管理/shared/i18n.test.ts` | 未跟踪（i18n 既有上下文） | `bca8e6ad8d9c36677acacef88f96faaab526f855` | `af234a1b74c695bfadfa666e540534a05fc5acaad6683a760d1527ffb7c6621f` | 46,368 |
| `test/项目管理/shared/i18n-guard.test.ts` | 未跟踪（i18n 既有上下文） | `3358a1428f60b1d115e9a3af5aab39601938eb12` | `05003446fd8973b9954dd10593f8f5df284d68b3d733b8832a83338f949cf7e9` | 6,151 |

**目录型写集现状（`test/测试/`）**：

- `test/测试/governance-e2e-auto/`：20 个文件（19 个 `.test.ts` + `fixture.ts`）；既有 `n-invalid-governance-card.test.ts` 已占用 `n-` 前缀（团队计划 §7.1 风险）；本变更计划新增 `s-acceptance-rework-routing.test.ts` 或并入 `f-acceptance-gate.test.ts`。
- `test/测试/governance-judge-cards-verify/`：6 个文件（5 个 `.test.ts` + `fixture.ts`）。
- 逐文件哈希见 `target-hashes.txt`。

> 候选阶段只应包含相对本表（及 §1.3 工作区基线）变化的路径；前三项既有变更声明为「既有上下文」，不纳入本变更候选，也不为其背书。

---

## 三、边界/写集预检（只读）

`ownership-preflight.txt` 逐项核对团队计划 §三的 owner 覆盖，结论：

- **`test/桌面应用/acceptance-dispatch.test.ts` 逐文件授权仍在**：`角色卡/桌面窗口/boundary.md` 第 44 行、`boundary.yaml` 第 114 行均有条目 —— 团队计划 §6.2 条件覆盖成立，S1 无需停止派发。
- `test/桌面应用/interface.test.ts`（md 第 29 行）、`test/桌面应用/operator-wiring.test.ts`（md 第 32 行）、`test/桌面应用/e2e/main.mjs`（md 第 41 行）均有精确单文件条目。
- **`app/main.ts` 属桌面窗口**：`角色卡/桌面窗口/boundary.md` 第 9 行、`boundary.yaml` 第 9 行有条目；`角色卡/装配/boundary.{md,yaml}` **不含**该文件 —— 与团队计划 §2.2/§6.2 的角色标签校正一致。
- 编排：`src/common/编排/` 目录、`src/pipeline/orchestration/flow-state.ts` 单文件、`test/编排/` 目录均在 `角色卡/编排/boundary.md`。
- 运行时核心：`src/provider/runtime/tools.ts` 单文件、`test/runtime-core/` 目录均在 `角色卡/运行时核心/boundary.md`。
- 项目管理：`src/common/shared/`、`test/项目管理/shared/` 均在 `角色卡/项目管理/boundary.md`。
- 测试：`test/测试/` 在 `角色卡/测试/boundary.yaml` Section 1。
- 本角色未修改任何角色卡/边界；边界文件哈希见 `boundary-preflight.txt`。

---

## 四、类型检查

| # | 命令 | 退出码 | 错误数 | 开始/结束（本地） | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | **0**（`grep -c "error TS"` = 0） | 18:51:59 → 18:52:00 | `typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | **0**（`grep -c "error TS"` = 0） | 18:52:00 → 18:52:01 | `typecheck-renderer.log` |

两命令均在仓库根、按 §1.1 的 PATH 与 Node v24.22.1 执行；日志含命令、起止时间与 `exit_code=`。

---

## 五、受影响套件基线

> 命令在仓库根、按 §1.1 的 PATH/Node 执行；六条命令**串行**、互不并发；每个命令单独日志（含命令、起止时间、`exit_code=`、全部用例行与 `ℹ` 计数）。`test/桌面应用` 的 glob 只匹配 `*.test.ts`，不含 `e2e/main.mjs`（S7 项）。`test/装配` 实际导入 `src/common/shared/config-loader.ts`（`governance-model-injection.test.ts`），按「实际导入 shared」口径纳入。

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | 耗时（Node 自报） | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | **1** | 810 | 809 | 1 | 0 | 0 | 14,192.8 ms | `directed-orchestration.log` |
| 2 | `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` | **0** | 558 | 558 | 0 | 0 | 0 | 102,594.2 ms | `directed-desktop-app.log` |
| 3 | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | **1** | 293 | 286 | 3 | 4 | 0 | 28,614.0 ms | `directed-runtime-core.log` |
| 4 | `node --test --test-concurrency=1 "test/项目管理/shared/**/*.test.ts"` | **0** | 181 | 176 | 0 | 5 | 0 | 7,389.1 ms | `directed-project-management-shared.log` |
| 5 | `node --test --test-concurrency=1 "test/测试/**/*.test.ts"` | **1** | 822 | 815 | 1 | 6 | 0 | 110,331.1 ms | `directed-testing-e2e.log` |
| 6 | `node --test --test-concurrency=1 "test/装配/**/*.test.ts"` | **0** | 84 | 84 | 0 | 0 | 0 | 7,292.2 ms | `directed-assembly.log` |

**合计：2748 tests / 2728 pass / 5 fail / 15 skipped / 0 todo；6 条命令中 3 条 exit 0、3 条 exit 1。**

### 5.1 失败分类（5 项，全部为既有 Windows symlink `EPERM`）

| # | 套件 | 失败用例 | 错误 |
| --- | --- | --- | --- |
| 1 | 编排 | `node test外指符号链接路径不获委托；项目内测试路径获委托`（`test/编排/shell-authorized-routine.test.ts`） | `EPERM: operation not permitted, symlink ...`（`errno -4048`） |
| 2 | runtime-core | `D3 linked workspace root remains usable; linked target itself is not replaced`（`test/runtime-core/file-write-safety.test.ts`） | 同上 |
| 3 | runtime-core | `store: traversal, mismatched scope and symlinked runtime directories rejected`（`test/runtime-core/session-store.test.ts`） | 同上 |
| 4 | runtime-core | `store: native validation stays lazy and native symlink is rejected before effects`（`test/runtime-core/session-store.test.ts`） | 同上 |
| 5 | 测试 | `读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛`（`test/测试/g4-skill-verify/b-render-double-check.test.ts`） | 同上 |

**无断言失败、无产品缺陷型失败、无桌面时序偶发。** 本变更尚未实施，这 5 项与历史基线（9 项 EPERM 中落在本受影响套件范围内的 5 项）逐条一致；其余 4 项 EPERM 位于未纳入本节的适配器/pi 套件，见 §六 T3 全量。

### 5.2 跳过（15 项，全部为既有平台型按设计跳过）

- runtime-core 4 项：`file-write-safety` 的 D3 权限/umask 用例（POSIX 语义，Windows 跳过）。
- 测试 6 项：`test/测试/lightweight-permission-repairs` 的 D3 AC3–AC7 权限用例。
- 项目管理/shared 5 项：`atomic-write` 的 D3 finalMode/umask/chmod/sync 用例。
- 均带 `# SKIP`，与历史基线同源；无新增 skip/todo。

### 5.3 套件补充观察

- `test/桌面应用/**` 本轮 **558/558 全绿**：历史基线中的 readiness/ledger 时序偶发族**本轮未复现**；终验若再现，按既有隔离/整文件复跑流程单独列示。
- `test/项目管理/shared/i18n.test.ts` 与 `i18n-guard.test.ts`（i18n 既有上下文）在本轮纳入并全部通过（含在 181 tests 内）。

---

## 六、T3 全量基线（串行，排除已知挂起文件）

### 6.1 命令与文件数

| 项 | 值 |
| --- | --- |
| 命令（实际） | `mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"`（单次 Node 进程、串行） |
| 文件清单 | `full-regression-excluded-file-list.txt`：`find test -name '*.test.ts' ! -path 'test/pi-adapter/write-sequencing.test.ts' \| sort` → **358 个文件**（全部 `.test.ts` 359 个，排除 1 个） |
| 排除文件 | `test/pi-adapter/write-sequencing.test.ts`（3 个 `test()`） |
| 排除理由 | **已知挂起**：该文件 3 个用例打印 `✔` 后进程不退出；2026-10-22 基线、2026-10-23 两轮 T3 基线均复现。本轮不纳入计数，S7 终验按同一处置并再次声明 |
| 原始日志 | `full-regression-serial-excluding-write-sequencing.log`；分类/差额 `full-regression-summary.txt` |

### 6.2 结果

| 指标 | 值 |
| --- | --- |
| 退出码 | **1** |
| tests / pass / fail / skipped / todo / cancelled | **3725 / 3697 / 10 / 18 / 0 / 0** |
| 耗时 | **310 s**（Node 自报 `duration_ms` 310,182.9） |
| 开始 / 结束 | 2026-10-23 18:57:10 / 19:02:20（本地） |
| 原始日志 | `full-regression-serial-excluding-write-sequencing.log`（6,470 行）；摘要 `full-regression-summary.txt` |

### 6.3 失败分类（10 项）

**(A) 既有 Windows symlink `EPERM`：9 项** —— 与历史清单逐条一致，错误均为 `EPERM: operation not permitted, symlink ...`（`errno -4048`）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:637` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:103` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

**(B) 桌面会话生命周期时序偶发：1 项** —— `test/测试/governance-e2e-auto/i-full-chain.test.ts:477`（test at `:230`）「五角色全自动链路…」：`AssertionError: 会话尚未开启（点击左侧角色即可开启）。 false !== true`（`readinessTask.ok` expected true / actual false；176.008 ms）。

- **隔离复跑**：`full-regression-isolation-i-full-chain-run1.log` **失败**（同一行 477、同一断言，176.2866 ms）；`...-run2.log` **3/3 全绿**（9.4 s）；`...-run3.log` **3/3 全绿**（9.5 s）。
- **家族对照**：与目录授权 D6、i18n 集成记录中的同族现象一致（`send(convener)` 返回「会话尚未开启」的 open→send 竞态）；同一用例在受影响 `test/测试/**` 套件运行中**通过**（822/815/1/6）。
- **判定**：**非确定性时序偶发**，不是本变更确定性新增失败（本变更尚未实施）；S7 若再现，按同一隔离流程分类，不得笼统归为环境问题。
- 本轮**未复现**桌面应用套件的 readiness/ledger 偶发族（`test/桌面应用/**` 558/558 全绿）。

**跳过 18 项**：与历史清单逐条一致——codex-adapter 1（Windows 无 POSIX 进程组）、pi-adapter 1（chmod 语义）、runtime-core `file-write-safety` 4、`test/测试/lightweight-permission-repairs` 6、门禁引擎 `pin-evidence` 1、`test/项目管理/shared/atomic-write` 5。无新增 skip/todo。

### 6.4 与上一轮最终基线的对照

| 基线 | 文件数 | tests | pass | fail | skipped | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 上一轮最终（治理写卡推进，`...-redispatch-evidence/final`） | 356 | 3693 | 3666 | 9 | 18 | 9 项均为 Windows symlink EPERM；零桌面时序偶发 |
| **本轮（S1 实测，i18n/目录 v3/写卡推进工作树）** | **358** | **3725** | **3697** | **10** | **18** | 9 EPERM + 1 桌面会话生命周期时序偶发；exit 1 |

**差额核对**（文件清单 `diff` 为据）：

- **文件 +2**：`test/桌面UI/i18n-b1-b2.test.ts`、`test/测试/i18n-integration.test.ts`。
- **tests +32**：两个新增文件合跑 **13/13**（`new-test-files-count.log`）；其余 +19 来自 i18n 最终候选在既有测试文件内的新增。当前工作树的套件计数与 i18n 集成记录一致（桌面应用 558/558、shared 181/176/0/5、装配 84/84、test-domain 822/815/1/6、编排 810/809/1），**本变更尚未实施，不贡献任何测试增量**。
- **pass +31 / fail +1**：+1 仅为 §6.3(B) 的 1 次时序偶发；9 项 EPERM 集合不变。
- **skip 18 不变；todo 0 不变。**

---

## 七、目标项目只读快照（`ans-gateway`，S7 零写入复算基线）

> 目标项目不是 git 仓库；本角色只做读取，未写任何目标文件。现场仍在漂移（§7.5），S7 必须以届时只读复算为准，不能把本节数值当作「当前现场」。

### 7.1 快照文件（2026-10-23 18:51:53 +0800）

| 文件 | SHA-256 | 字节 | 行数 | mtime（本地） |
| --- | --- | --- | --- | --- |
| `docs/flows/ai-governance-pipeline.yaml` | `0805213ab87ad8fa5c3ac8d5fce8fb0b641f9b9e50873d75ec5a7a4278903928` | 13,787 | 418（`wc -l`；按换行 split 为 419） | 2026-10-23 18:43:13.939 |
| `.ans/governance/ledger.jsonl` | `6d70bdeba0bd4160a47689dcce19980d1658a5b9349435cd25073bb7d799a48d` | 377,313 | 530（非空 530） | 2026-10-23 18:50:44.041 |
| `docs/acceptance/ai-governance-pipeline-report-v1.md` | `0106dc8092fec6f7bf14b96aac6d2e07f0d0023b9136e5cd7335c7c9df04c801` | 21,897 | 163 | 2026-10-23 15:59:53.997 |
| `docs/acceptance/ai-governance-pipeline-report-v2.md` | `d0df0789ae3a01ad8955165417e287186cb13b573206ea5224fc0d33433d9d32` | 15,288 | 150 | 2026-10-23 17:37:20.759 |

### 7.2 flow 状态摘要（快照）

- `flowId=ai-governance-pipeline`；**40 步**：`done=18`、`superseded=21`、`pending=1`。
- kind 计数：`customer-decision=2`、`artifact=12`、`dispatch=25`、`acceptance=1`。
- 保留验收步骤 `verification`：`kind=acceptance`、`status=pending`、无 evidence、无 dependsOn。
- 非验收步骤 39 个：done 18、superseded 21。
- 与团队计划 §1.4 的「38 步 / 18 done / 19 superseded」相比，现场已新增 2 个步骤并调整 superseded 计数（漂移，不是本基线冻结值）。

### 7.3 账本摘要（快照）

- **530 条**、**0 坏行**；kind 计数：`customer.decision=97`、`artifact.observed=383`、`dispatch.accepted=48`、`intent.handed-off=2`。
- **唯一 acceptance 决定**：第 368 行，`at=2026-10-23T08:05:01.066Z`，`customerDecision=rejected`，`decisionEvidence.kind=customer-input`，`flowId=ai-governance-pipeline`。
- verifier 派发共 3 条：第 18 行 `acceptance-criteria`（04:08:48.685Z）、第 23 行 `acceptance-criteria`（04:11:36.290Z）、第 359 行 `verification`（08:01:26.084Z，最近一次验收复核）。
- `actorRoleId=app → targetRoleId=convener` 的 `dispatch.accepted` 共 2 条（快照内，供 S7 对照）。
- 账本条目数较团队计划 §1.4 的 480 条继续增长（漂移）。

### 7.4 报告结构化段现状（S7 兜底基线）

- report-v1：`acceptance-rework` 出现 **0** 次；fenced YAML 块 **0**、fence 标记 **0**。
- report-v2：`acceptance-rework` 出现 **0** 次；fenced YAML 块 **0**、fence 标记 **2**（非 YAML）。
- 结论：两版报告均**没有** `acceptance-rework/v1` 机器可读段；S7 复算必须按 `structured:false`/缺段兜底，不解析 §8 表或 §9.1 编号列表。

### 7.5 零写入核对与外部漂移

- 18:51:53 快照命令在**同一命令内**计算 before/after 哈希，四个文件逐字节一致（`target-project-snapshot.txt`）——测试角色未写目标项目。
- 18:57:17 首次观察到外部漂移（`target-project-drift-observation.txt`）：flow → `c1507e12…`（14,466 B、437 行、42 步：done 17 / superseded 23 / pending 2）、ledger → `614db6d8…`（388,212 B、538 条、0 坏行）；最新 acceptance 决定仍为第 368 行 rejected。报告 v1/v2 未变。
- 漂移发生在快照命令退出之后，来自目标项目外部操作（另一会话/人工），**不是本角色写入**；本节基线值仍以 18:51:53 快照为准，S7 必须重新只读复算。

---

## 八、基线与失败分类结论

1. **基线可用（S1 baseline complete）**：HEAD `ee59296` 工作树、node v24.22.1 下，typecheck ×2 全 0；六个受影响套件 **2748 tests / 2728 pass / 5 fail / 15 skipped**（失败全为既有 EPERM 子集）；T3 串行全量（排除已知挂起 `write-sequencing.test.ts`）**3725 / 3697 / 10 / 18 / 0**（exit 1，310 s）。
2. **确定性失败只有 9 项既有 Windows symlink `EPERM`**：与历史基线逐条一致（claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core `session-store` 2、`file-write-safety` 1、g4-skill-verify 1、编排 shell-authorized-routine 1）。**零本变更确定性新增失败**（本变更尚未实施，无候选代码）。
3. **1 项非确定性桌面会话生命周期偶发**（`i-full-chain` 五角色链路 `send(convener)` →「会话尚未开启」）：整文件隔离 3 次中 1 次失败、2 次 3/3 全绿；与目录授权 D6/i18n 集成记录同族。终验按同一隔离流程分类，不得记作确定性红，也不得用「环境问题」笼统带过。
4. **18 项跳过均为既有平台/设计跳过**（POSIX 权限/进程组语义在 Windows 不适用），无新增 skip/todo；`skip`/`todo` 不计通过。
5. **与上轮基线差额已解释**：文件 +2、tests +32（新增文件 13 + i18n 既有测试文件内的 +19）、fail +1（仅本轮时序偶发）、skip 不变；不把 i18n/目录 v3/写卡推进的测试增量记到本变更名下。
6. **目标项目基线已冻结并可零写入复算**：快照见 §七；两版报告均无 `acceptance-rework/v1` 段；最新验收决定仍为 2026-10-23T08:05:01.066Z rejected（唯一）；`verification` pending。现场在基线后继续漂移（外部操作），S7 必须重新只读复算，不能沿用本节数值。
7. **候选隔离**：本变更目标文件起始哈希见 §二；`flow-state.ts`/`tools.ts`/对应测试等于 HEAD，其余共享文件带前三项既有变更（冻结基线）；候选阶段只应包含相对本基线的本变更 hunk。
8. **边界预检通过**：`test/桌面应用/acceptance-dispatch.test.ts` 的逐文件授权仍在（团队计划 §6.2 条件满足）；`app/main.ts` 按权威边界属桌面窗口，装配边界不含该文件。
9. **不宣布任何通过**：本记录不是候选、不是实施、不是验收；**闸门 2 已确认（2026-10-23，沟通记录）；客户实施授权未给**；S7 终验只对相对本基线的新增确定性失败负责。

---

## 九、证据边界声明

- **未启用 task_ops**；本项目无 `.ans/project.json`；不伪造任务令牌、锁、审批或机器预检记录。
- **不声称验收通过**：本记录是 S1 实施前基线，不是候选、不是验收报告；不启动 S2 实施，不代替独立验收判定。
- **未改产品/测试源码**：`src app test` 114 个改动/新增文件在基线期间 SHA-256 逐字节一致（§1.3）；未修改任何断言；未新建 `test/桌面应用/` 文件。
- **未写目标项目**：`ans-gateway` 只读；快照命令 before/after 哈希一致；后续漂移为外部操作（§7.5）。
- **未使用真实 `.env`/凭据/在线模型**：测试使用仓库既有夹具/临时目录；未读取、打印或写入真实 `.env` 或任何密钥。
- **未 commit/push/合并/发布**；无暂存。
- **写入边界**：只写 `角色卡/测试/docs/change/`（本记录与 `2026-10-23-acceptance-rework-routing-baseline-evidence/`），符合测试角色 Section 1（`角色卡/测试/boundary.yaml`）。
- **并发上下文**：工作树中的 i18n、目录 v3、治理写卡推进改动均为他角色既有产物，非本角色写入，不纳入本变更候选。

---

## 十、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-acceptance-rework-routing-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 环境事实、HEAD/tree、完整 `git status --short`、暂存为空、`src app test` 状态 |
| `target-hashes.txt` | 21 个目标文件/计划新增文件的 `git hash-object` + `sha256sum` + 字节 + HEAD 关系；`test/测试` 两个目录逐文件哈希 |
| `ownership-preflight.txt` | 团队计划 §三写集的 owner 覆盖核对（只读） |
| `boundary-preflight.txt` | 桌面窗口/装配边界条目、`app/main.ts` 归属、边界文件哈希、`test/装配` 导入核对 |
| `runner-facts.txt` | `package.json` 脚本/engines、测试文件清单与计数 |
| `typecheck.log` / `typecheck-renderer.log` | 两条类型检查原始输出（含起止时间、`exit_code=`） |
| `directed-orchestration.log` | `test/编排/**` 原始输出（810/809/1/0） |
| `directed-desktop-app.log` | `test/桌面应用/**` 原始输出（558/558/0/0） |
| `directed-runtime-core.log` | `test/runtime-core/**` 原始输出（293/286/3/4） |
| `directed-project-management-shared.log` | `test/项目管理/shared/**` 原始输出（181/176/0/5） |
| `directed-testing-e2e.log` | `test/测试/**` 原始输出（822/815/1/6） |
| `directed-assembly.log` | `test/装配/**` 原始输出（84/84/0/0） |
| `affected-suites-summary.txt` | 六个套件的机读汇总、失败/跳过原文分类 |
| `i18n-test-files-count.log` | `test/项目管理/shared/i18n{,-guard}.test.ts` 合跑计数（40/40；供差额核对） |
| `new-test-files-count.log` | 两个新增测试文件合跑计数（13/13；供 356→358 文件差额核对） |
| `full-regression-excluded-file-list.txt` | T3 全量清单（358 个文件，排除 `write-sequencing.test.ts`） |
| `full-regression-serial-excluding-write-sequencing.log` | T3 串行全量原始 stdout/stderr（3725/3697/10/18/0；exit 1；310 s） |
| `full-regression-summary.txt` | 全量计数、10 失败分类、18 跳过、与上轮基线差额 |
| `full-regression-isolation-i-full-chain-run1.log` / `-run2.log` / `-run3.log` | `i-full-chain` 时序偶发的整文件隔离复跑（失败 / 3/3 / 3/3） |
| `target-project-snapshot.txt` | `ans-gateway` 四个文件的哈希/大小/行数、flow 全步骤状态、账本决定/派发、报告结构化段统计、before/after 零写入核对 |
| `target-project-drift-observation.txt` | 基线后外部漂移的只读观察（不作为基线） |
| `worktree-during-full-run.txt` / `worktree-hashes-during-full-run.txt` | 全量运行中 `src app test` 状态与 SHA-256 |
| `worktree-end.txt` / `worktree-hashes-end.txt` | 基线收尾状态与 SHA-256（与 during 逐字节一致） |
| `stability-check.txt` / `worktree-stability-diff.txt` | 稳定性核对（114 文件 SHA-256 差 0 字节；19 个目标文件哈希复核 0 不匹配） |
| `final-check.txt` | 收尾身份核对：HEAD/tree、暂存 0、边界文件哈希与预检一致、团队计划/方案哈希（方案 `9ceea642…`） |
| `gate2-confirmation-check.txt` | 闸门 2 确认事实（沟通记录摘要、沟通记录/团队计划 v1 哈希；团队计划文件头/§1.5 为过期状态） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |

---

## 十一、证据哈希

- 收尾时对 `2026-10-23-acceptance-rework-routing-baseline-evidence/` 内全部文件与本记录生成 `sha256.txt`（`sha256sum` 原始输出，含本记录文件本身）。
- 本记录与证据文件的身份以该清单为准；调用方回报中的 SHA-256 取自该清单。
- 关键原始证据（同样在清单中）：`environment.txt`、`target-hashes.txt`、`full-regression-serial-excluding-write-sequencing.log`、`full-regression-summary.txt`、`target-project-snapshot.txt`、`target-project-drift-observation.txt`、`stability-check.txt`。

---

**状态再次声明**：本文件是 **S1 实施前基线记录（baseline complete）**，不是候选、不是验收报告；不宣布本变更或任何变更验收通过；**闸门 2 已确认（2026-10-23，以沟通记录为准）；客户实施授权未给**；未 commit、未 push、未合并、未发布；未改产品/测试源码；未写目标项目。
