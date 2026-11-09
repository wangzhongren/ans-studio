# 确定性与组合验证记录 D1：提案确认卡「通道未受理」缺陷修复（A′+B 组合候选，2026-11-09）

- 角色：ANS 测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 日期：2026-11-09（本地 12:10–12:47 +0800；UTC 04:10–04:47）。
- 工作区（git worktree）：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`。
- 范围与纪律：本记录只覆盖**确定性层 D1**（组合候选的身份、受影响套件计数、失败/skip 对照、静态门、稳定性）；真实运行 RR4 见同日 `2026-11-09_RR4_proposal-card-run-binding-real-run.md`。未修改仓库产品/测试/角色卡/其它文档（只写本记录与证据目录、仓库外临时根）；未提交/推送/暂存/合并/发布；未占用/影响贪吃蛇 9222 实例（PID 9764 全程在运行，未触碰）。
- 判定口径：本记录不判定 B1 任何条目通过/失败；只陈述实测事实与对照。

## 0. 事实摘要（先读）

1. **组合候选身份成立**：HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（tree `262e7ba42ee646d055f65f92e640834a89addde1`，分支 `feat/plan-escalation-card`）+ 工作区**恰好 4 个**修改文件（A′×2、B×2）；`git status --porcelain -- src app test` 无其它条目；暂存 0。逐文件 raw SHA-256 与两份子修复证据的 after 值**全部一致**；A′ 两文件聚合复算 = `bb24291e…`（与 A′ 证据一致），4 文件组合聚合 = `bf127456…`。
2. **`src app test` manifest（1,109 文件口径）**：canonical（逐文件 raw sha256、两空格、`LC_ALL=C` 字节序、LF、含末行换行）SHA-256 = `4958207f196109ef5c7d25e642f8846880236a94e6fe4fca6bb6af03e1cab064`；运行前后**逐行 diff 0**。
3. **`test/编排/**`（107 文件逐文件/等价运行）**：tests **1127** / pass **1103** / fail **22** / cancelled 0 / skipped **2**——与 A′ 证据 after 计数完全一致；**失败用例名集合 diff 为空（22/22 同名）**；skip 名相同（2 项既有 skip）；新增 A1–A5 用例全部通过。
4. **`test/桌面应用/chief-workflow.test.ts`（63 tests，两轮）**：run1 63/51/12，run2 63/49/14（基线 59/47/12）；新增/改写的 B 用例（W1b missing-evidence 改写 + B1/B2/B3/B4/B5）两轮**全部 pass**；两轮失败并集 = 基线同名失败 + 仅 {W20、W29、W10/unmanaged、W47-revise} 四个既有环境抖动项（隔离复跑：W20 2/2 pass、W29 用例本体 2/2 pass（文件级 Node 原生 teardown 崩溃）、W10 5/5 pass、W47 select pass / revise ENOTEMPTY 抖动）；**新增确定性失败 = 0，新 skip = 0**。
5. **只读回归**：`decision-service` 20/20 pass；`application-line` 3/3 pass（基线 2/1 fail 为本机抖动，未恶化）；`run-change-trigger` 9 fail（与基线 9 个失败名逐条相同，基线已知红）；`pending-card-restart` 1/1 pass；`optional-acceptance.test.ts`（BASE-3 命令，**未修改，diff 0**）：6 tests / pass 2 / fail 1 / cancelled 3——与 B1 BASE-3 完全一致。
6. **静态门**：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0。
7. **如实披露**：整包 glob 首次运行在 `version-change-runtime.test.ts` 子进程句柄泄漏处挂起（>10 分钟，1053/1127 后无输出）；该文件单独运行 5/5 pass、0.7s 退出 0，属环境性文件进程泄漏（与 A′ 证据记录的 contaminated run1 同类），该次样本**不作判据**，全文保留为 incident 证据；本机在跑贪吃蛇实例构成共享负载，Windows 临时目录 `ENOTEMPTY`/Node teardown 崩溃为既有环境现象。

## 1. 依据与输入

| 项 | 路径/标识 |
| --- | --- |
| 缺陷记录（客户修复指示 1–4） | `docs/communication/2026-11-09_defect_proposal-card-run-binding.md`（SHA-256 `21dfb43c…`） |
| 修复路由 | `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`（`4e8fb354…`） |
| 实施前验收标准 | `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`（`42a1ec9b…`，196 行）；**v1.1 最终文件在本次取证时尚未存在**（仓库内未检出），本轮按 v1 与任务书附加口径（`test/编排/**` 22 fail/2 skip 基线已知红）执行 |
| A′ 修复记录/证据 | `角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding.md`（`d4147997…`）+ 同目录 `…-evidence/`（候选聚合 `bb24291e…`、A1–A7、1122→1127、typecheck 0） |
| B 修复记录/证据 | `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation.md`（`4005b0f4…`）+ 同目录 `…-evidence/`（B1–B5、chief-workflow 63、typecheck 0） |

## 2. 组合候选身份（实测）

### 2.1 检出与改动面

- HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`；tree `262e7ba42ee646d055f65f92e640834a89addde1`；分支 `feat/plan-escalation-card`；暂存 0。
- `git status --porcelain -- src app test`（运行前/后同值，恰好 4 文件）：

| 文件 | 归属 | numstat |
| --- | --- | --- |
| `src/service/trunk/impl/apply-journal.ts` | A′（编排） | +31/−5 |
| `test/编排/direct-role-capabilities.test.ts` | A′（编排） | +122/−2 |
| `app/desktop/customer-input.ts` | B（桌面窗口） | +35/−5 |
| `test/桌面应用/chief-workflow.test.ts` | B（桌面窗口） | +167/−20 |

- 无其它 `src app test` 改动/新增/删除/重命名；`test/桌面应用/optional-acceptance.test.ts` 与全部只读回归文件 diff 0；B1 §0.2 所列公共契约文件（`src/model/*`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`、`app/desktop/session.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/run-manifest.ts`）均不在改动面（manifest 前后逐行一致亦覆盖 `app/renderer/dist` 构建产物）。

### 2.2 逐文件 raw SHA-256（磁盘实际字节）与聚合

| 文件 | raw SHA-256 | owner 证据对照 |
| --- | --- | --- |
| `src/service/trunk/impl/apply-journal.ts` | `09130d02fd5a053883148fc4321110b0eeca89b9036cb0e2767b588346e77e41` | = A′ after（`09130d02…`） |
| `test/编排/direct-role-capabilities.test.ts` | `4f98332f3a4c8258320e4f1f5316c34ca5a6cca8cf6596d53ee74ca07b67f4a1` | = A′ after（`4f98332f…`） |
| `app/desktop/customer-input.ts` | `71e0cc0bb7be44257312c3421f210a88376f3ca07efcf448be54de1b8f217fa0` | = B after |
| `test/桌面应用/chief-workflow.test.ts` | `f5dd81d64cefa707a0348f16be9b2fa2e8827976ded2ae87780364e61ba450fc` | = B after |

- 聚合方法（BASE-4）：按路径 `LC_ALL=C` 字节序排序后 `path + "\0" + sha256` 串联的 SHA-256。
  - A′ 两文件复算 = `bb24291eb6ba3adcaa7ceff5483fbfe73f8fb70cc9a8275b79ecfd9d04b6b8f0`（与 A′ 证据候选聚合一致，验证方法一致）。
  - **组合 4 文件聚合 = `bf12745676901055ccfcb98e3578205465c88a3ef8293faa91827dc5beb80986`**（运行前后同值）。
- diff 身份核对（内容级）：当前 `git diff` 的 A′ 两文件部分与编排证据 `code-diff.patch` **逐字节一致（diff exit 0）**；B 两文件部分与桌面窗口证据 `after-customer-input.diff`、`after-chief-workflow-test.diff` 分别**逐字节一致（diff exit 0）**。

### 2.3 `src app test` manifest（1,109 文件口径）

- 口径：`find src app test -type f`（含 4 个已忽略的 `app/renderer/dist/*` 既有构建产物，排除 `node_modules`）= **1,109 文件**；行格式 `<sha256>  <path>`（两空格）、`LC_ALL=C` 字节序、LF、末行换行。
- canonical 文件 SHA-256（sha256sum of manifest）：**`4958207f196109ef5c7d25e642f8846880236a94e6fe4fca6bb6af03e1cab064`**。
- 路径串联聚合（`path\0sha256`）：`a9e20d16bd4c33baf5fa5ee42275dceff71596aaa532b9f8825d63d82e2441d5`。
- 运行前/后两份 manifest **逐行 diff 0**（evidence `manifest-src-app-test-before.txt` / `-after.txt`）。

## 3. 环境

- Windows 11 Pro 10.0.26300；Git Bash（MINGW64）；Node **v24.22.1**；npm 11.19.1；Electron 44.7.0（本 D1 未启动）。
- 本机同时运行贪吃蛇实例（PID 9764，CDP 9222；**未触碰**），构成测试共享负载；该负载与 Windows 临时目录清理竞态导致个别用例的环境抖动（见 §5.3）。
- 命令：`node --test --test-concurrency=1 --test-reporter=tap <file>` 逐文件；`npm run typecheck`；`npm run typecheck:renderer`。

## 4. `test/编排/**`（A′ 受影响套件）

### 4.1 计数（107 个测试文件，逐文件运行，等价于 glob `test/编排/**/*.test.ts`）

| 指标 | 本轮（组合候选） | A′ 证据 after | 对照 |
| --- | --- | --- | --- |
| tests | **1127** | 1127 | 一致 |
| pass | **1103** | 1103 | 一致 |
| fail | **22** | 22 | 一致 |
| cancelled | **0** | 0 | 一致 |
| skipped | **2** | 2 | 一致 |
| 失败名集合 | 22 项 | 22 项 | **diff 为空**（evidence `bianpai-fail-baseline.txt` vs `bianpai-fail-current.txt`） |
| skip 名 | Delivered Hub / Delivered legacy code provenance | 同 | 一致 |

- 基线已知红项确认：22 个失败与本修复无关（A′ 证据已用隔离复跑证明，如 `trio-worker-report.test.ts` 单独复跑即失败），本轮只做增量口径对照；**新增确定性失败 = 0，新 skip = 0**。
- 13 个文件 exit=1（全部为承载既有红项的文件）；其余 93 个文件 exit=0（另有 `version-change-runtime.test.ts` 单独运行 exit=0，见 §4.3）。
- 决策证据相关用例：既有 5 项 + 新增 A1–A5（`direct-role-capabilities.test.ts` ok 27–31）全部通过，含 A5 既有用例「draft planning run needs bound document hashes」原样通过。

### 4.2 逐文件原件

`bianpai-per-file/` 保存 107 个文件的 TAP 日志与 `exit-codes.txt`（106 条逐文件退出码；`version-change-runtime` 因先行单独运行未重复执行，其 TAP 同在目录内、exit 0）。

### 4.3 如实披露：整包 glob 首次运行挂起（不作判据）

- 首次按 glob 整包运行（与 A′ 证据同命令）在 1053/1127 后无输出并挂起 >10 分钟；挂起子进程为 `test/编排/version-change-runtime.test.ts`（其 5 个用例均已完成，最后一条 181.9ms），属文件进程句柄泄漏未退出。
- 该文件在同一候选上单独运行：**5/5 pass、exit 0、0.7s**；A′ 证据亦记录过同类现象（`git-trunk-store.test.ts` 在共享负载下不退出，空闲时 13/13 pass）。
- 该次部分样本保留为 `bianpai-full-glob-incident.tap`（7393 行），**不用于计数/对照**；§4.1 的判据是完整逐文件运行。

## 5. `test/桌面应用/chief-workflow.test.ts`（B 受影响套件）

### 5.1 计数（两轮样本）

| 样本 | tests | pass | fail | cancelled | skipped | exit | duration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 基线（B 证据，HEAD） | 59 | 47 | 12 | 0 | 0 | 1 | ~71.4s |
| 本轮 run1 | **63** | 51 | 12 | 0 | 0 | 1 | 67.9s |
| 本轮 run2 | **63** | 49 | 14 | 0 | 0 | 1 | 69.2s |

- 新增 4 个测试（W1b missing-evidence 改写 + B1/B2/B3-B4/B5），**两轮全部 pass**（TAP ok 5–11）；skip 两轮均为 0。
- 两轮失败并集对照基线（12 项：W5(+nested commit-race/selected)、W14、W19、W22、W23、W28 stop、W28 stop-and-restart、W33、W34、W47 select）：
  - **两轮均复现的基线同名失败**：W5（含子测试 commit-race）、W14、W19、W22、W23、W28×2、W33、W34（同名同因，与 B 证据一致）；
  - **仅个别轮次出现的基线同名项**：W47 select（run2；run1 通过）；
  - **超基线项**：W20（run1）、W29（run1）、W10/unmanaged（run2）、W47 revise（run2）——均为 B 证据已记录的既有环境抖动族，隔离复跑见 §5.3；
  - 基线中的子测试 `selected` 本轮两轮均通过（未恶化）。
- **新增确定性失败 = 0；新 skip = 0**。

### 5.2 改写/新增用例结果（两轮均 pass）

- `W1b 真实缺材料（B）：materials失败fail-closed——不呈现卡、无presented、回执notPresented含真实原因、回合不阻塞且不依赖关闭委托`
- `B1 materials失败fail-closed：不呈现卡、declined+notPresented+真实原因、pending清零且旧id不可重试`
- `B2 materials失败竞争：prepare在途关闭委托⇒恰一次呈现，迟到失败不双结算，客户可接管`
- `B3/B4 execution无有效决定⇒既有chiefWaiting回退不变；respond闸manualTakeoverRequired且关闭后可结算`
- `B5 materials失败原因非空且如实：保留prepare错误原文，空错误也不得退化为回退文案`
- 另：既有成功路径 `W1b 真实SessionManager…`、`W1b 真实无退修选项…` 两轮均 pass。

### 5.3 超基线失败项的隔离复跑分类（同候选）

| 项 | 隔离复跑（`--test-name-pattern`） | 分类 |
| --- | --- | --- |
| W20 | 2/2 pass，exit 0 | 环境抖动（临时目录清理） |
| W29 | 两个 W29 用例本体 pass（6.8s/6.3s）；文件级 `not ok` 为 Node 原生 teardown 崩溃（`cleanup_queue-inl.h` 断言，exitCode 134，发生于 `src/provider/runtime/session-store.ts` destroyTracking），非断言失败 | 环境/运行时清理抖动 |
| W10（含子测试 unmanaged） | 5/5 pass，exit 0 | 环境抖动 |
| W47 | select pass；revise 失败 `ENOTEMPTY`（Windows 临时目录 `ans-w47-default-chief-*` 清理竞态）；run1 两方向均 pass、run2 两方向均 fail | 环境抖动（与 B 证据一致：两方向互为翻转） |

## 6. 只读回归文件

| 文件 | 本轮 | 基线（B 证据） | 对照 |
| --- | --- | --- | --- |
| `decision-service.test.ts` | 20/20 pass，exit 0 | 20/20 pass | 一致 |
| `application-line.test.ts` | 3/3 pass，exit 0 | 3 tests / 2 pass / 1 fail（本机抖动） | 未恶化（本轮全过） |
| `run-change-trigger.test.ts` | 9 tests / 0 pass / 9 fail，exit 1 | 9/0/9 | 失败名逐条相同（基线已知红） |
| `pending-card-restart.test.ts` | 1/1 pass，exit 0 | 1/1 pass | 一致 |

## 7. `optional-acceptance.test.ts`（基线已知红；禁止修改）

- 命令（BASE-3 同款）：`node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts`。
- 结果：**tests 6 / pass 2 / fail 1 / cancelled 3 / skipped 0 / exit 1**；not ok 1（`:128` 断言）、not ok 4（`:239` 超时）、not ok 5（`:252`）、not ok 6（`:287`）——与 B1 BASE-3 完全一致，无恶化。
- 该文件在候选中的 diff = 0（未修改）。

## 8. 静态门

- `npm run typecheck`（`tsc --noEmit`）→ **exit 0**（`typecheck.log`）。
- `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`）→ **exit 0**（`typecheck-renderer.log`；本修复不改 `app/renderer/**`）。

## 9. 稳定性（运行前后）

| 项 | 运行前 | 运行后 |
| --- | --- | --- |
| HEAD / tree / 分支 | `c1439ce…` / `262e7ba4…` / `feat/plan-escalation-card` | 同 |
| `git status --porcelain -- src app test` | 4 文件（§2.1） | 同 |
| 暂存 | 0 | 0 |
| 候选 4 文件 raw sha256 / 聚合 | §2.2 | 同 |
| manifest（1109 文件）逐行 | `4958207f…` | `4958207f…`（逐行 diff 0） |

## 10. 偏差与未覆盖边界（如实）

1. **未做**：真实运行（RR4 由同日另一记录/证据覆盖）；未判验收；未对照 B1 v1.1（文件尚不存在）。
2. **整包 glob 挂起事件**（§4.3）只作 incident 披露，计数以逐文件运行为准；逐文件与 glob 在 Node 测试运行器语义下等价（`--test-concurrency=1`）。
3. 本机共享负载导致 chief-workflow 的两轮失败分布不同（12/14），但并集对照 + 隔离复跑未发现任何与 A′/B 改动相关的确定性新失败；`application-line` 基线 1 fail 本轮未复现（方向向好）。
4. `optional-acceptance` 的 4 项未通过为 BASE-3 已知红，未修复、未弱化、未修改。
5. 证据只绑定本候选 digest/本机环境/本命令；换候选或环境需重取。

## 11. 证据索引（本目录）

- 记录：`2026-11-09_D1_proposal-card-run-binding-fix.md`（本文件）。
- 摘要/身份/环境：`d1-summary.txt`、`candidate-identity.txt`、`env.txt`。
- manifest：`manifest-src-app-test-before.txt`、`manifest-src-app-test-after.txt`（各 1,109 行）。
- `test/编排/**`：`bianpai-per-file/`（107 个 TAP + `exit-codes.txt`）、`bianpai-fail-baseline.txt`、`bianpai-fail-current.txt`、`bianpai-full-glob-incident.tap`、`bianpai-full-glob-incident.stderr.txt`。
- `chief-workflow`：`desktop/chief-workflow-run1.tap`、`desktop/chief-workflow-run2.tap`、`desktop/isolation/{W20,W29,W10,W47}.tap`。
- 回归：`regress/{decision-service,application-line,run-change-trigger,pending-card-restart,optional-acceptance}.tap`。
- 静态门：`typecheck.log`、`typecheck-renderer.log`。
- 逐文件 SHA-256 清单：`sha256sums.txt`（生成本目录内全部原件后计算）。

## 12. 状态

- **D1 取证完成；只陈述事实，不判验收。** 未提交/推送/合并/发布；未改仓库产品/测试/角色卡/其它文档；未动贪吃蛇 9222 实例与其 target/run 根；本记录之外只写了仓库外临时根 `C:\Users\51054\Desktop\work\ans-studio-test-tmp-d1-rr4`（脚本/中间产物）与本证据目录。

## 13. 后续状态说明（B1 v1.1；本记录写盘后到达）

- 2026-11-09 12:29（本地）B1 原地更新为 **v1.1**（同路径 `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`，**294 行 / 48,124 bytes / SHA-256 `682539ba619366ae11243ccb661503ab84873549fc66d5a4b4a23c6b694918c7`**）；附录 A.1–A.3 将 `test/编排/**` 22 fail / 2 skip 与 `chief-workflow` 基线红口径纳入统一口径（与本记录 §4/§5 的实测口径一致），A.4 新增 RR-8（引用实施侧 RR4 记录）。
- 本 D1 记录写盘时 B1 v1.1 尚不存在，按 v1 + 任务书附加口径执行；v1.1 附录未改变 AC/测试矩阵，故本记录的候选/计数/失败对照结论不受影响。B2 应以 v1.1 为准；S1 真实运行见同日 `2026-11-09_RR4_proposal-card-run-binding-real-run.md` §12。
