# 变更包（E3 最终版）：会话创建准入改为「按操作审批」+ Git 只读/专属命令放行

- **任务 ID**：`2026-11-08-session-admission-approval`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-08
- **性质**：E3 终验变更包，交独立验收按 B1 v1 判定 B2；**不是验收结论**；不授权提交/推送/合并/发布。
- **风险档位**：**T3**（P1.3 §4.6；不压档）。
- **依据**：
  - 设计当前基线 **P1.3**：`docs/planning/2026-11-08_design_session-admission-approval-based.md`（855 行 / 130013 bytes / `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`）；P1.2（`b13e2fe7…`，闸门 1 对象）→ P1.3 仅 4 处文本勘误（E1–E4）+ §8.5，**语义等价**。
  - 复核：`docs/planning/2026-11-08_review_session-admission-approval-based.md`（193 行 / `817ebc9d…`）。
  - **B1 唯一判据**：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / 29020 bytes / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`）。
  - 团队计划：`docs/scheduling/2026-11-08_team-plan_session-admission-approval.md`（449 行 / `ce30fad6…`，闸门 2 对象，已核验）。
  - 派发/接口评审记录：`docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`（含 I0 结论与各批哈希）。
  - **B0 豁免**：`docs/communication/2026-11-08_waiver_baseline_session-admission.md`（18 行 / `d7a699d2…`；客户指令跳过 B0 正式重记）。
  - 回归参考基线：上一变更 E3 T3 记录 `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`（原 `76872622…`；B2 后文字订正版 `d0d67ff4…`，计数不变）：**4,872 tests / 4,641 pass / 198 fail / 1 cancelled / 32 skip**；其测得代码内容即当前 HEAD `a1b2f66`（E3 候选已随 PR #72 合并）。

---

## 一、候选身份

- **基线与环境**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`（tree `3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`；PR #72 merge `c069425` tree 相同）；暂存 0；Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300（Git Bash）。
- **候选 39 文件**（B2 补证后：原 38 + `test/测试/session-admission-approval-b2-gap-integration.test.ts`（`4aa783ad…`，3 例）；`git status --porcelain -- src app test` 42 项 = 候选 39 + T1 只读 3；其中 `app/` 3 + `src/` 16 + `test/` 20）。
- **聚合身份（当前候选）**：`e89716bdc7353ec46b2a7e4e3535dc2e2427ca20b107faf439c09e0bc97c6070`（算法：逐文件 `sha256 <path>`、行格式 `<raw_sha256>  <path>`（两空格）、`LC_ALL=C` 按整行排序、逐行 `\n` 连接后 SHA-256；B2 补证实测）。
- **证据绑定说明（B1 复用口径）**：E3-F T3、D1、RR 证据均在**原 38 文件候选**（聚合 `b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`）上取得；B2 补证的唯一候选 delta = **新增 1 个测试文件**（无任何产品/既有测试文件变化，逐文件哈希一致），新文件 3/3 pass、`test/测试` 套件 673/615/39/1/18（原 670/612/39/1/18 + 3/3）。未受影响证据按 B1「未受影响证据可复用」规则复用；是否接受由 B2 判定。
- **稳定性 manifest（当前候选）**：`src app test` 全量（排除 `app/renderer/dist`、`node_modules`）**1,078 文件 / `57087b8bd0d2a83af6fc59ab60ddb4be3004eb700187a813bd3401c834b862f5`**，B2 补证运行前后 diff **0 行**；原 E3 证据为 1,077 文件 / `5308e71a…`（差值 = 新增测试文件 1）。HEAD/tree/分支/暂存未变。
- **T1 只读基线（不属本变更候选）**：`src/common/claude-adapter/schema.ts`（`afe70c62…`）、`test/claude-adapter/session.test.ts`（`f0db260e…`）、`test/claude-adapter/schema.test.ts`（`358ac967…`）；聚合 `06cc75ca2a503cf87813628c080657fc546dd753447ea32219be82008c136323`；属**已验收独立候选**，最终提交计划须单列，不混入本变更。
- **逐文件候选哈希**（冻结前实测，两空格格式）：

| 路径 | SHA-256 |
| --- | --- |
| `app/desktop/operator-channel.ts` | `fb6995921b7508b4600f2bf6a7c0e71c21d3510a614b88689d27d969a7b4e919` |
| `app/renderer/src/chat/judge.ts` | `af9af580781152c14f52359eb38f766110f448ff5132296f55c6e590f2d7aafe` |
| `app/renderer/src/shell/ConfirmCard.tsx` | `f620610f4cb54bd2614a215a601dc54b92312a7c78d936ecde2239cb7cf7a63f` |
| `src/common/shared/i18n/messages/en-US.ts` | `4c63f9b5e7ec1c3ae89abc41b089bb744b2af69ca1f7a1f77f34c9acea608dc7` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `6d5b1ef45261e86e8292e4981086807191a23a357507ff26355d1cbdadac51a3` |
| `src/common/shared/shell-approval-binding.ts` | `8fdcda39f74a1c06a954703d20e083e46bba8f539903485e934ec7d2e395926d` |
| `src/common/编排/shell-audit.ts` | `b68cb129b7deb06bec6ca51ee25e0f06e2d5cd073524c8b9c5331a307a15a450` |
| `src/common/编排/shell-gate.ts` | `b64b83e3f7c38504e466e38bd8280e37c67857b9bbca443f5ae8dd63ef58c14e` |
| `src/common/门禁引擎/classify-shell.ts` | `60cef0394653086eda03136d6c7af6e974271162fc856a3a93454499910ea723` |
| `src/common/门禁引擎/shell-write-guard.ts` | `579964dd57074ebda5fa4e95ccb2271ada131c878d244b431a4b10514d671e11` |
| `src/model/runtime.ts` | `c4dae5572039f46c8f6e2b09f32d6f7d8982247ed2a44fa336f0bde02c0a0a38` |
| `src/pipeline/orchestration/run-role.ts` | `dd873dcc6404fc9e2a2014b51371e4e261e88aa47e5f23bf2b26706722782dee` |
| `src/pipeline/orchestration/shell-arming.ts` | `b4a121d2631413dc40239fdb140663ae0c58dd6fdfe0642456c5433efee753f5` |
| `src/provider/runtime/schema.ts` | `e472196f6f7d836f42246137dfe7ea141e4680673c0b4652d3acfc788df636d0` |
| `src/provider/runtime/tools.ts` | `c37793ca24b88c21ede9b69c52ee3e6c26416095c187682318bf909698fbe8d8` |
| `src/provider/trunk/impl/git-command.ts` | `ac723f843fe73270335f0a3f4070fb3dd76ddc1b0ae1fb6222470dd3ad9f8321` |
| `src/provider/trunk/public/trunk-store.ts` | `c89716b58568e9872c80d266a672a7c538fbea9b0ab5581dfd0e6d655a435d8d` |
| `src/service/gate/shell-rules.ts` | `0ea4729b014d25dc21a3d3196b9db253a22ce62a72607485f2d4847fc48aa3c7` |
| `src/service/runtime/session.ts` | `c46e8780176a4fe69aaec27c289b66af967b2f4e462ef1b582929cad0f82b3a9` |
| `test/runtime-core/git-capability-tools.test.ts` | `5690832e4b70d144d10caaa284ae543dc5f8eee73594b37438c1a132fe86a5da` |
| `test/runtime-core/readonly-git-routing.test.ts` | `656e288dfb351810a49191c1f9b05ca6568d0dbdd04cf885eb94f5865d8dd77f` |
| `test/runtime-core/session-admission-approval.test.ts` | `da9c80c8e6e12d4d6653b240ce99094e949ca5fc5f677d21843df025796cd332` |
| `test/桌面UI/judge.test.ts` | `6ad07d2c060c53f96ecc96c28c33918ab12f5ea8165a4a692cf614bc04cfa1b4` |
| `test/桌面应用/operator-channel.test.ts` | `0ccc70c5d455c2d4e19a009edfd64727a618ac3aaea1c9863aef3831ef0bebfc` |
| `test/测试/session-admission-approval-integration.test.ts` | `34582aae4adbbe53c11265dd4474f42371e6378837305ae56b9bea3f2602af89` |
| `test/测试/session-admission-approval-q9-integration.test.ts` | `1b2441f2148450863f948dda394574793f4f68131f368dc3731c056dc11e10a5` |
| `test/测试/session-admission-approval-b2-gap-integration.test.ts`（B2 补证新增，3 例） | `4aa783ad8e967da66df82b890c3ff1d70e7230fc04b3fb50aa68e5eb7ccaaed2` |
| `test/编排/readonly-git-transport.test.ts` | `e8495dfffcd16201b19470df86d60c5638881ae433daf8e2bbe40a0afc7bc663` |
| `test/编排/run-role-admission.test.ts` | `c07092ed64d0332031170876865e22c619147b63d54b40b8415ed08980b65a62` |
| `test/编排/shell-approval-wiring.test.ts` | `d14d068305ef6286ad0bf90834c6d0023553186a49986ac78f23b7dfa1911f5b` |
| `test/编排/shell-risky-order.test.ts` | `f5d858f194630fecce566b7659070b57307f2d74564731f7f3aed31e91541edf` |
| `test/编排/shell-write-guard-injection.test.ts` | `749e86cf0238d9c854d5ce59c931c6789ae15924b805ceeb7d0d1f60a3bc809e` |
| `test/门禁引擎/classify-shell.test.ts` | `362950de1b937e5f25c86ab150f0de157f9a2dea3368d2c29bd632a13bb18aa0` |
| `test/门禁引擎/git-shell-acl.test.ts` | `be8f31be786c9faba9411771c212a55c3184fbadce1e40c0ff50e37c07e04706` |
| `test/门禁引擎/readonly-git-matcher.test.ts` | `3d7caed4ee0da18633d73e64fbc17edaaa8715322d41b6e20415592ea11e6343` |
| `test/门禁引擎/shell-rules-public-reexport.test.ts` | `5b35413e74de0ec5acd1a29efac37faacd28dac05b2c3ecc670be68e02a70ae4` |
| `test/门禁引擎/shell-write-guard.test.ts` | `8f7524a629c825fc92c3cf958081209ebd0c5770160931a4701ffe20c78895ff` |
| `test/项目管理/shared/i18n.test.ts` | `914db2a2bc23f86dfd8a8b3070612894d496cdb27116390c7729832dcf1cd9f4` |
| `test/项目管理/shared/shell-approval-binding.test.ts` | `1ea506b67532cfb012c82111214c88dfe86364f0e80e68363ad99199400b56e4` |

---

## 二、改动面（按 owner；详细见各批证据）

| owner | 改动摘要 | 代表文件 | 证据 |
| --- | --- | --- | --- |
| 运行时核心 | Model 加法（approvalChain/roleId/OperatorPrompt/readonlyGit 能力）；`prepareRole` 新算法（binding 探针/审计口径/admittedPlan/退役 unconfined/仅 codex native）；`verifyScope`/`bindPreparedRole`；tools/schema 只读 Git 路由 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts` | `角色卡/运行时核心/docs/change/2026-11-08_W2W4_session-admission-runtime.md`（225 行 / `86db4eed…`） |
| 编排 | `shell-gate` 登记 binding/审计探针/auditFailurePolicy/readonlyGit 审计/entry·roleId 透传；`shell-audit` sink probe/describe；`run-role` 删旧门+防御断言+注入；`shell-arming` 选项；trunk `executeReadonlyGit` 与公共出口 | `src/common/编排/{shell-gate,shell-audit}.ts`、`src/pipeline/orchestration/{run-role,shell-arming}.ts`、`src/provider/trunk/{impl/git-command,public/trunk-store}.ts` | `角色卡/编排/docs/change/2026-11-08_W1bW2bW3b_shell-wiring.md`（225 行 / `0628ad93…`，含 Amendment-1） |
| 门禁引擎 | 只读 Git matcher/规范体、分类器 allow/deny 收窄、写守卫 entry 感知 pass、shell-rules 再导出、规则集 v4 | `src/common/门禁引擎/{classify-shell,shell-write-guard}.ts`、`src/service/gate/shell-rules.ts` | `角色卡/门禁引擎/docs/change/2026-11-08_W3G_readonly-git-matcher.md`（124 行 / `c593ea51…`） |
| shared-code | 新建 `shell-approval-binding`（登记/检查/探针/私有 Symbol）；共享组件目录更新；D1 修复新增 `ui.judge.entryForeground` 中英 key + 计数同步 | `src/common/shared/shell-approval-binding.ts`、`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/` | `角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md`（148 行 / `d802a3f6…`） |
| 桌面窗口 | `ShellConfirmRequest` entry/protectedScope 加法与 presenter 透传；`session.ts`/`main.ts` 无需改（openRoleSession 内部构造能力，只读核对） | `app/desktop/operator-channel.ts` | `角色卡/桌面窗口/docs/change/2026-11-08_W5D_operator-card-entry.md`（231 行 / `ddc81a33…`） |
| 桌面UI | 卡面 entry 标签（i18n key 化）；ConfirmCard 加法 Badge；无第二份判定 | `app/renderer/src/chat/judge.ts`、`app/renderer/src/shell/ConfirmCard.tsx` | `角色卡/桌面UI/docs/change/2026-11-08_W5U_operator-card-entry.md`（48 行 / `8fe479b4…`） |
| 测试 | D1 跨角色集成 9 例（含 Q9 AC-26）；受影响套件对照；RR/E3 证据 | `test/测试/session-admission-approval-*.test.ts` | D1 `角色卡/测试/docs/change/2026-11-08_D1_cross-role-integration.md`（173 行 / `1c9f2e8c…`，含修复复验；首轮 `42bac879…`）；RR `2026-11-08_RR_real-claude-minimal.md`（`cc5968ee…`）；E3 `2026-11-08_E3-T3-full-regression.md`（`5cba2d54…`） |

---

## 三、D1 跨角色集成与静态门

- 集成用例 **9/9 pass**：受保护+shell 准入正/负例（真实 assemble*/createShellGate+file sink）、无 binding⇒unproven、审计不可用⇒audit-unavailable、custom/demo/unknown 拒绝、run_shell/start_background_task allow/deny/timeout、只读 Git 注入能力路由（不 spawn）、writeGuard 注入/后台 Git 拒绝、PR #72 契约、Q9 AC-26（`git-native-surface-unproven`、无副作用）。
- 首轮发现并修复 1 个本变更新增确定性失败：i18n 硬编码守卫（W5-U「前台命令」）→ shared-code 新增 `ui.judge.entryForeground`（zh/en 成对）+ 桌面UI 改用 key；修复后 shared 218/213/0/5、桌面UI 443/443、i18n-guard violations=0。
- **D1 修复后复验（测试角色，`post-fix-logs/`）**：D1 集成 9/9；shared 218/213/0/5；门禁 449/443/5/1；runtime-core 523/486/33/4；编排首跑 1081/1055/24/2（两个已知非确定性：`git-trunk-store` 文件级 Node 原生崩溃 + `download-provider` 时序抖动，隔离复跑正常）→ **全量复跑 1,093/1,069/22/2 精确回到基线**；桌面四文件 128/119/9/0；桌面UI 443/443/0；`test/测试` 670/612/39/1/18 与修复前逐名一致。**新增确定性失败=0、新 skip=0**（首跑 delta 已按既有非确定性处置分类并逐条记录，未改断言/未加 skip）。
- 静态门（修复后）：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0。
- D1 冻结时候选：38 文件，聚合 `b62c7c7c…`（算法见 §一）；manifest 前后 1,077 文件 / `5308e71a…`，diff 0；T1 三文件哈希不变。**B2 补证后当前候选为 39 文件（见 §3.1）**。

### 3.1 B2 补证（AC-2 / AC-4，2026-11-08）

B2 v1 判 AC-2/AC-4 `insufficient evidence` 后，测试角色在 `test/测试/` 新增 **1 个集成测试文件**（3 例，真实 service/assemble 路径，未跑真实模型、未改产品）：

- `test/测试/session-admission-approval-b2-gap-integration.test.ts`（272 行 / 14,266 bytes / `4aa783ad8e967da66df82b890c3ff1d70e7230fc04b3fb50aa68e5eb7ccaaed2`；3/3 pass，0 skip）。
- **AC-2**：Pi runtime + 非内置项目角色 + `shellOperatorChannel`（三层链 rules-advisory）+ 受保护 required + 真实 `assembleProjectShellGate`/`createShellGate` + file sink：`prepareRole` observed+token+approvalChain（file/durable/probe ok、projectRoot 一致）、**真实 `bindPreparedRole` 成功**、diagnostics `session.open.ready`（roleId=worker）、appTools 含 `run_shell`/`start_background_task`、Pi strict surface 仍 unknown；使用**官方 Pi provider 工厂**（显式 fixture 配置，bind 仅构造会话、零模型请求），未注入 fake provider、未伪造 ready/绑定。
- **AC-4**：Claude 与 Pi（参数化 2 例）无 shell 工具、受保护 required、不 arm：`session.open.ready`（roleId=worker）、appTools **不含**两 shell 工具（写工具仍注册）、准 observed+token、**无 approvalChain、无 native-factory-* 阻断**、真实 bind 成功。
- 受影响套件：`test/测试/**`（101 文件，排除登记挂起）**673/615/39 fail/1 cancelled/18 skip** = 原 670/612/39/1/18 + 新文件 3/3；失败/cancelled/skip 集合不变；`npm run typecheck` exit 0。
- 候选：39 文件（原 38 + 本文件），聚合 `e89716bd…`，manifest 1,078 文件 / `57087b8b…`（前后 diff 0）。
- 证据：`角色卡/测试/docs/change/2026-11-08_B2-gap-integration.md`（89 行 / 9,847 bytes / `54c0db31146f24278eae9d15b20cee6513c7a8f57d168f2fea1fe38384a7c0ee`）+ 证据目录 20 文件（索引 26 行 / 2,382 bytes / `7121eaa11b4e51ead3f10e1b7b79b5e91ab5db8554af841d0e2fc76202afd206`）。

---

## 四、T3 全量回归（参考基线口径）

- **方法**：一次权威运行（隔离、无并行测试），520 个 `test/**/*.test.ts`（参照 510 + 本变更新增 10，删除 0）；逐文件独立进程自然运行（`node --test --test-concurrency=1 <file>`），记录 exit/signal/watchdog 与逐文件计数；6 个登记挂起文件 90s watchdog（不计通过），其余 300s 兜底；**全程未使用 `--test-force-exit`/`--test-timeout`**，未删测试/放宽断言/加 skip；墙钟约 27 分钟（13:07–13:34）。
- **结果**：**514 自然完成 + 6 登记挂起**，无未登记 watchdog/停摆、无 no-summary；自然完成计数 **4,979 tests / 4,750 pass / 196 fail / 1 cancelled / 32 skipped / 0 todo**；其中既有 510 文件（504 自然）= 4,891/4,662/196/1/32/0，**本变更新增 10 文件 = 88/88 pass（0 skip）**。
- **与参考基线（4,872/4,641/198/1/32）逐条对照**（文件+测试名多重集）：参照可信失败 198、本次 195（cancelled 口径对齐）；**逐条一致 193；新增失败 2；既有失败消失 5；新增 skip 0 / 消失 skip 0**（31 条打印名一致）。
  - 新增失败 2 条均属上一 E3 已登记非确定性、同候选隔离复跑不复现 ⇒ **新增确定性失败 = 0**：`test/桌面应用/application-line.test.ts`（presented/created 顺序竞态；隔离 3/3 pass）；`test/桌面应用/chief-workflow.test.ts`「unmanaged」（AggregateError/ENOTEMPTY 清理类；隔离复跑失败集合变化、该名未复现）。
  - 消失 5 条：2 条为设计 §4.5 点名既有红按本变更**预期转绿**（`shell-gate` readonly 裁定 A、`shell-readonly` 只读档 git status）；3 条为参照侧非确定性/记账（chief-workflow W29/commit-race 清理类、e-pi 原生 CleanupQueue 崩溃未复现[本轮 11/11]）。
  - 计数差 +19 tests / +21 pass / −2 fail 已逐文件对账（e-pi 崩溃补全、新增用例、interactive-execution-mode 由 watchdog 变自然、两条既有红转绿、application-line 非确定性）。
- **辅助 B0 差异解释（客户豁免；不作 pass/fail 依据）**：旧 B0(e71501c)→辅助 B0(a1b2f66)：chief-workflow 13→16、git-shell-acl 文件级红→绿，故 198→200；辅助 B0(200) vs 参照(198) 多重集 B0-only 5 / ref-only 3 条，全部非确定性/记账类，非本变更引入。
- **静态门与范围扫描**：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0；退役码（`hasUnconfinedScriptTools`/`required-scope-unconfined-script-tools`/`runtime-protected-scope-unmediated-app-execution-planned`）仅存退役注释、生产零产生；死 `readonly:git` 已删；`SHELL_RULES_VERSION` 全仓仅 v4、`ans-default-v3` 零命中、外部 v3 pin fail-closed；matcher/规范体唯一定义于 `classify-shell.ts` 并经 `shell-rules` 同引用再导出；上一变更同名扫描记录 `73175db7…` 未被覆盖。
- **证据**：`角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`（169 行 / 18,357 bytes / `5cba2d548b31f83c7966d3276ebe979c42329aa3c3904d66572ff2ec923dab33`）+ 证据目录 590 文件（520 逐文件原始日志、逐文件结果 TSV、对照/计数对账/隔离复跑/稳定性快照；索引 596 行 / `5642b2cc12cd78a66c5e4e87af2f748086ca1122fdecfd256a1ab84ffa30140f`）；扫描记录 `2026-11-08_E3-scans-and-checks_session-admission.md`（45 行 / 4,092 bytes / `9b05470f342b9dda622462e1d7675443fd5a205c34b4c6e15032280783ce4a99`）+ 4 文件（索引 `478c0e44b0e9f8fb08cda8823ad9f1f6dce9581fc853ded017210c3b0e261172`）。

---

## 五、真实运行（RR）

- **环境与纪律**：仓库外临时根/目标项目/临时 userData；目标项目程序化 establish 治理记录（accepted，pin 2）+ 父门派发真实写入 init-source ⇒ `required`；**审计门禁预检（真实 assembleOperatorShellGate + probeShellApproval，含一次 refresh）= file/durable/probe ok**；真实 Electron + 真实 Claude（只用仓库根 `.env`，未读/打印）；未改仓库/既有项目/`app/main.ts`。
- **AC-23 达成**：1 条客户消息 → `dispatch_task` 父门受理 → task.created（`t-mw7crlr8-f32405f4`）→ **product 会话创建成功**（diagnostics `session.open.ready roleId=product` 04:49:11.475Z；全程 `runtime-creation-admission-unproven` 0 次、`session.open.ready` 17 次）→ task.delivered → product 真实回合启动。**本变更直接目标已真机证明。**
- **AC-24 部分达成**：只读 `git status` **0 卡执行成功**（固定 Git 传输；审计 `branch=c-allow`、`by=ruleset:allow:readonly:git:status（su 审批档）`、`readonlyGit.canonicalArgv` 与实际执行一致、`roleId=product`、`entry=run_shell`）；非只读 `touch docs/product/rr-nonreadonly.txt` **未弹审批卡**——被 write-guard 既有硬地板拒绝（`shell-write-outside`、`file-gate-host-facts-unproven`、`branch=write-guard:deny`、零执行），目标项目 `docs/audit/shell-gate.jsonl` 恰 2 条（c-allow + write-guard deny）。**审批卡子项未观测**，按 AC-25 回退 D1 确定性证据（D1-5/D1-7 覆盖 allow/deny/timeout/entry/writeGuard 注入/后台边界），不宣称已真实验证审批卡。
- **预算/纪律偏差（如实）**：模型同一 chief 回合内 `dispatch_task` 2 次（第 1 次工具级 `chief-hub-flow-unavailable` 拒绝、未建任务；自行修正后第 2 次受理；应用处理器派发仍 1）；决定性结果（发送后约 48s）后驱动未停止（成功条件 cardHandled≥1 的缺陷）→ 应用继续至 10 分钟预算（chief 追加 3 请求回合、product 第 2 回合、其余角色会话两轮被打开且 admission 均成功；04:49:34.673Z 后无额外模型请求）；墙钟发送→停止约 10m04s；product 同任务重复报告 2 条。停止：halt 点击成功、stopSession 关闭 3 会话；随后驱动 CDP 求值挂起被外层 timeout 终止，summary 由 `drive.jsonl` 重建；应用经 CDP Browser.close 优雅关闭，electron 0 残留、9222 端口已关。
- **证据**：`角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal.md`（121 行 / 16,854 bytes / `cc5968eecf13d88bee28e10f544e75df52b8a06e98e1ce3b014959c8d410e75a`）+ 证据目录 25 文件（索引 `2c7b03e9edf41e80d33aaa80295509d50ca79f7d0d9ed297dd26bf5433585124`；drive.jsonl 671 行、tasks/chief/product 日志、审计 2 条、诊断时间线、4 张截图、目标状态、预检/建立日志）。
- **建议（非本变更加分项）**：若客户要求「非只读→审批卡」真机证据，需修复驱动停止条件后另行授权一次最小预算，并使用非写类型非只读命令（如 `npm test`/脚本类 review；`touch` 在受保护范围会被 write-guard 既有硬地板拒绝）；本轮按纪律未追加预算、未重跑。

---

## 六、替换/删除/迁移清单（单轨，无运行时双轨）

1. `hasUnconfinedScriptTools`（`session.ts:242`）及 4 处使用（`:546/559/1160/1214`）删除；`required-scope-unconfined-script-tools` 生产零产生。
2. `run-role.ts:731-733` `runtime-protected-scope-unmediated-app-execution-planned` 删除，改防御断言。
3. native 分支收窄为仅 codex 严格路径；非 codex 不再产生 `native-factory-plan-*`；Codex 原条件逐字保留。
4. `classify-shell.ts` 删除死 `readonly:git` 条目；`SHELL_RULES_VERSION` 3→4、id `ans-default-v4`；v3 pin fail-closed（不兼容读）。
5. 分类器「所有裸 Git 硬拒」→「只读精确白名单 allow / 其余 deny」；写守卫 git 无条件 deny → 命中且非后台入口 pass，其余 deny。
6. 回切：无运行时开关（Q10）；回切=回滚提交；`ANS_SHELL_ESCALATION_DISABLED` 不变。

---

## 七、披露（必须让验收/客户知晓）

1. **B0 豁免**：客户指令跳过 B0 正式重记（`d7a699d2…`）；变更包/B2 必须披露；回归参照为上一变更 E3 T3 记录（`76872622…`/`d0d67ff4…`，4,872/4,641/198/1/32）。
2. **辅助 B0 差异**：豁免前已完成一次新 B0（`31e178b3…`，200 fail/1 cancelled/32 skip，6 挂起同上一 B0），与参考基线 198 的差异（如 chief-workflow 13→16、git-shell-acl 转绿）只在 E3 报告中作辅助解释，**不得混用或作为 pass/fail 依据**。
3. **桌面边界漂移（非本变更引入）**：`test/桌面应用/operator-wiring.test.ts`、`test/桌面应用/session.test.ts` 已被历史提交 `4c24149` 删除，但 `角色卡/桌面窗口/boundary.md` 仍列；本变更未恢复/未新建，桌面受影响套件以存量文件为准；漂移交人事/治理后续处理。
4. **`protectedScope` 无生产者**：O7 选装未获客户选择；模型字段存在但当前无生产者、渲染不展示（不宣称已实现）。
5. **T1 三文件单列**：不属本变更候选；最终提交计划单列处理（已验收独立候选）。
6. **Q9**：受保护项目角色 Git 写/初始化很可能仍被注册表级 `inspectInitializationProtection` 拒绝（本方案不放宽）；AC-26 负向验证。
7. **F1**：shell 只读 Git 不套用 `git_query` 的 readableOids/publication-proof；可读任意完整 OID/历史；`log` 无目标默认 HEAD、`--all` 拒绝；verifier 结构化读取限制仅约束 `git_query`。
8. **Q4**：采纳 `deny-non-readonly`（审批类放行但审计写失败⇒拒绝；只读 c-allow 不翻转）；若客户改选 observe 按 AC-28 披露项处理。
9. **Q10**：无运行时回切开关；回切=回滚提交。
10. **环境差异**：参考基线为上一变更环境（Node v24.22.1 / npm 11.19.1 / Windows 11）；本轮 E3 环境差异与既有非确定性（Node 原生崩溃、ENOTEMPTY 清理抖动、挂起文件）逐条说明，不宣称单次全绿。
11. **发布/tag 未授权**；提交/推送/合并按委托，但不含发布。
12. **并行变更串行前置**：另一变更 `2026-11-08-remove-predictive-gates` 已写团队计划/派发记录（其记录自述「未派发实施，串行前置未满足」并引用本变更在飞）。本候选冻结与证据期间若该变更开始写入 `src/app/test`，本候选失效并须重取证据；E3/B2 须核对无其改动混入。
13. **RR 限制**：AC-23 已真机达成；AC-24 只读部分达成、非只读审批卡未观测（write-guard 既有硬地板先于审批拒绝），按 AC-25 回退确定性证据；预算偏差与驱动停止条件缺陷已如实记录，未追加预算/未重跑；若需真机审批卡证据须另行授权。

---

## 八、独立验收输入清单（交 B2）

1. 本变更包（候选身份/聚合/逐文件哈希/稳定性 manifest）；
2. P1.3（`2553b97a…`）、复核（`817ebc9d…`）、B1 v1（`fb881126…`）、团队计划（`ce30fad6…`）、派发记录（含 I0）；
3. B0 豁免记录（`d7a699d2…`）与辅助 B0（`31e178b3…`，仅参考）；
4. D1 记录 `角色卡/测试/docs/change/2026-11-08_D1_cross-role-integration.md`（173 行 / 22,889 bytes / `1c9f2e8c4212890c0b5c90356f75b09f8086c4ae6ece3db6b1f8cb09330a22f8`；首轮 `42bac879…`）+ 证据目录 58 文件（索引 `9ecbae5c7d43024b0fb0a3343171a3d5771e0169b23ac639b783a446283c3e9f`）；
5. **E3 T3 证据**：`角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`（`5cba2d54…`）+ 证据目录（索引 `5642b2cc…`）；扫描记录 `2026-11-08_E3-scans-and-checks_session-admission.md`（`9b05470f…`）+ 4 文件（索引 `478c0e44…`）；
6. **RR 证据**：`角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal.md`（`cc5968ee…`）+ 证据目录 25 文件（索引 `2c7b03e9…`）；
6a. **B2 补证（AC-2/AC-4）**：`角色卡/测试/docs/change/2026-11-08_B2-gap-integration.md`（`54c0db31…`）+ 证据目录 20 文件（索引 `7121eaa1…`）；新测试文件 `4aa783ad…`；
7. 各批证据文档（W1 `d802a3f6…` / W2W4 `86db4eed…` / W3G `c593ea51…` / 编排 `0628ad93…` / 桌面 `ddc81a33…` / 桌面UI `8fe479b4…`）与共享 API 评审/消费者影响清单；
8. 删除/迁移清单与规则集 v4 迁移搜索证据（E3 扫描记录）。

---

## 九、状态

- **E3-B 就绪（B2 v1 insufficient evidence → 补证完成，待 B2 复核）**：B2 v1 报告 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`（198 行 / `d49fa516…`）判 33 pass / 0 fail / 2 insufficient（AC-2、AC-4）/ 6 N/A，无代码返工/无安全旁路。
- **B2 补证已完成**（§3.1）：AC-2（Pi + 项目角色 + `bindPreparedRole` + `session.open.ready`）与 AC-4（Claude/Pi 无 shell 的 ready + appTools 不含 shell）均以真实 service/assemble 路径通过（3/3）；**当前候选 39 文件，聚合 `e89716bd…`，manifest 1,078 文件 / `57087b8b…`（diff 0）**；产品/既有测试文件零变化，未受影响证据按 B1 复用规则复用（由 B2 判定）。
- 本包不判通过/返工/证据不足；不授权提交/推送/合并/发布（发布/tag 未授权）。
- 若 B2 仍判返工/证据不足：候选变化后受影响证据失效并重取，本包相应更新。
