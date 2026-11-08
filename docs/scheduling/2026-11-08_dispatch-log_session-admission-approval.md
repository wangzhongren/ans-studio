# 派发与状态记录：会话创建准入按操作审批（G2 / I0 / W 批次）

- **任务 ID**：`2026-11-08-session-admission-approval`；flowId `session-admission-approval-based`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-08
- **性质**：统筹派发/状态/接口评审记录，不是 `task_ops` 机器状态，不是验收结论；不授权提交/推送/合并/发布。
- **依据**：
  - 团队计划：`docs/scheduling/2026-11-08_team-plan_session-admission-approval.md`（449 行 / 61983 bytes / SHA-256 `ce30fad6f0cb48d948007de97d553a1362836eb77dbcff67a10382388c1ad421`；闸门 2 对象，已由沟通核验）。
  - **设计当前基线 P1.3**：`docs/planning/2026-11-08_design_session-admission-approval-based.md`（855 行 / 130013 bytes / SHA-256 `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`）。**P1.2→P1.3 等价映射**：P1.2（844 行 / `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`，闸门 1 对象）→ P1.3 仅含 4 处文本勘误（E1 `shell-write-guard` 位置/owner、E2 trunk owner=编排、E3 binding owner=shared-code、E4 `ShellAuditRecord` 落点）与 §8.5 记录，**语义等价、设计方向/写集/AC 不变**；实施选型以 P1.3 为准。团队计划头部对 P1.2 的引用按本映射理解，计划哈希保持不变（不重写已核验对象）。
  - 复核记录：`docs/planning/2026-11-08_review_session-admission-approval-based.md`（193 行 / `817ebc9d…`）；意图：`docs/communication/2026-11-08_intent_session-admission-approval-based.md`（43 行 / `51918bc9…`）；闸门 1 留痕：`docs/communication/2026-11-08_gate-confirmation_session-admission.md`（27 行 / `7ffa4706…`）；预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（38 行 / `e2bdd96b…`）。
  - **B1 冻结标准**：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / 29020 bytes / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`）——唯一判据。
  - **B0 豁免记录**：`docs/communication/2026-11-08_waiver_baseline_session-admission.md`（18 行 / 1314 bytes / `d7a699d2819213cad60645fa0ffbce126fc1d5da290078f4dbcb6f6ab6b8e2fd`；客户原话「这种直接去变更把，基线搞他干啥呢」）。

---

## 一、闸门与基线状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 2（团队计划） | 已核验（2026-11-08，沟通） | 团队计划 `ce30fad6…`；实施授权按预授权留痕 |
| 设计基线 | **P1.3**（`2553b97a…`；P1.2 语义等价映射见头部） | `docs/planning/2026-11-08_design_session-admission-approval-based.md` |
| B1 v1 | 冻结（`fb881126…`） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` |
| B0 正式基线 | **客户豁免**（B1 §B0-1–B0-5 不执行）；变更包/B2 必须披露 | `docs/communication/2026-11-08_waiver_baseline_session-admission.md` |
| B0 实际情况 | 测试角色在豁免到达前已完成一次新 B0（645 行 / 61762 bytes / `31e178b3a55ded68ad0c164465d1c69070c631df8afa6f482beace3d9fa88aef`；证据目录 `2026-11-08_session-admission-approval-B0-evidence/` 564 文件、索引 `225a3ee77734122abfa4bbc8e43132d3b5815076ca692bee1cbfdd9230504ca8`）。**按客户指令不作为正式基线**，仅保留为辅助参考证据（不计入验收基线，不用于判 pass/fail） | `角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-baseline.md` |
| 回归参考基线 | 上一变更 E3 T3 记录（原 `76872622e9e0f83912abae6a615734ed9429fe44fe8b86f2b8afa3cf509fb078`；B2 后文字订正版 `d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`，计数不变）：**4,872 tests / 4,641 pass / 198 fail / 1 cancelled / 32 skip**；其测得代码内容即当前 HEAD `a1b2f66`（E3 候选已随 PR #72 合并） | `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md` + 证据目录；环境差异在 E3 报告如实披露 |
| 回归方法 | 每个 W 批次对受影响套件做实施前后对照；D1 汇总受影响套件+跨角色集成；E3 全量 T3 与参考基线按（文件+测试名[+类别]）逐条对照；**新增确定性失败=0、新增 skip=0**；环境性差异逐条说明；不得删测试/放宽断言/加 skip/force-exit | 本记录 §四、团队计划 §5.5/§6.1 |
| **T1 单列（不混入本变更候选）** | T1 Claude schema 修复三文件仍未提交（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`、`test/claude-adapter/schema.test.ts`）；属**已验收的独立候选**，与本变更无关；最终提交计划/变更包须单列处理，**不得计入本变更候选或写集** | 协调方指令（2026-11-08 提速消息）；B0 记录 §13 |

---

## 二、I0 接口评审结论（实施接口基准）

> 由统筹汇总受影响方在派发前置的接口约束；各实施批次在证据中确认「按 I0 执行/偏差=0」。P1.3 §8.5 勘误已并入。若实施中发现必须偏离，停止并回报统筹（不得自行变更）。

| # | 事项 | 定稿结论 |
| --- | --- | --- |
| I0-1 | R8a `registerShellApproval` 签名与登记点 | 统一 `registerShellApproval(gate, facts, sink)`；**登记点唯一在 `createShellGate` 构造成功后**；`buildShellGate`/`assemble*` 只传 `projectRoot`/sink，不参与 probe 结果传递；§4.1 shell-arming 的「如不放在 createShellGate 则在此登记」不采用 |
| I0-2 | R8b 测试私有 Symbol 载体 | 挂在 **sink 对象**的非枚举属性（随 `opts.audit` 传递）；Symbol 宿主=`src/common/shared/shell-approval-binding.ts`；**不得**从 `src/service/gate/shell-rules.ts` 等生产公共出口再导出；生产装配测试断言 `assemble*`/`buildShellGate` 从不设置 |
| I0-3 | R8c probe 未登记语义 | 未登记 gate ⇒ `probeShellApproval` 返回 `undefined` ⇒ `protected-scope-approval-chain-unproven`；已登记但 sink 无 `probe()`/`probe()` 抛错 ⇒ 返回冻结 facts 且 `probe:"unavailable"` ⇒ `protected-scope-audit-unavailable`；并发共享同一 promise、结果冻结 memoize；无任何接受 probe 结果值的 API |
| I0-4 | 只读 Git 路由接线 | **采用注入能力对象（推荐方案 a）**：`GovernedToolsOptions.readonlyGit`（`src/model/runtime.ts`）形状为**不透明能力** `{ match(argv): object \| undefined; execute(match: object, budgets?): Promise<只读执行事实> }`（tools 不依赖 match 内部字段/不 import 门禁引擎）；由 `run-role`/桌面装配从 `matchReadonlyGit`（经 `src/service/gate/shell-rules.ts` 公共出口，同一函数引用；具体 match 类型由门禁引擎定义并经 shell-rules 类型再导出）+ `executeReadonlyGit`（`src/provider/trunk/public/trunk-store.ts`）构造并注入。`git` 程序在 `shellGate` 放行后：有能力且命中 ⇒ 走 `execute`；无能力/未命中 ⇒ `readonly-git-runner-unavailable`（**绝不回退通用 spawn**）；非 git 命令按现状 spawn。不得出现第二份 matcher/规范体实现 |
| I0-5 | 规则集版本迁移 | `SHELL_RULES_VERSION` `"3"`→`"4"`、规则集 id `ans-default-v3`→`ans-default-v4`；删除 `defaultReadOnly()` 的不可达 `readonly:git` 条目；全仓规则夹具/断言同批同步（当前实测点名 `test/编排/shell-risky-order.test.ts:39`）；外部/项目级 v3 pin 若存在即 fail-closed（**不兼容读 v3、不静默放宽**）；迁移搜索与理由入变更包 |
| I0-6 | `auditFailurePolicy` | 默认 `"observe"`；受保护范围由 `assembleProjectShellGate`/`assembleOperatorShellGate` 启用 `"deny-non-readonly"`（`run-role` 传保护状态）；只读 `c-allow` 不翻转；审批类放行 + 审计 append 失败 ⇒ 拒绝执行并记 `shell.audit.deny` 诊断 |
| I0-7 | 审计字段与 `by` 语义 | `ShellAuditRecord.readonlyGit:{id,canonicalArgv}`（必做）定义在 `src/common/编排/shell-audit.ts`；`branch` 保持 `c-allow`；`by` 以 `ruleset:allow:readonly:git:<id>` 为**前缀**（允许既有档位后缀）；`readonlyGit.canonicalArgv` 必须与实际执行体一致（单一来源 `buildReadonlyGitBody`） |
| I0-8 | P1.3 勘误 E1–E4 | 采纳：E1 `shell-write-guard.ts` 在 `src/common/门禁引擎/`（owner=门禁引擎）；E2 trunk Provider owner=编排；E3 binding owner=shared-code；E4 `ShellAuditRecord` 在 `shell-audit.ts`（编排）。实施一律按实际路径/owner |
| I0-9 | 模块依赖方向 | `src/common/shared/shell-approval-binding.ts` 只依赖 `src/model/`（可定义结构性 sink/facts 类型，不 import 编排/门禁私有）；`shell-gate`/`session.ts` 以结构类型消费；`ReadonlyGitMatch` 具体类型由门禁引擎定义并经 `shell-rules` 类型再导出（编排 trunk 可只读引用），`model` 侧能力接口对 match 保持不透明（object），避免 model→shared/门禁依赖；不得出现第二份定义 |
| I0-10 | 不再重开 | 以上结论 + P1.3 为实施基准；新增偏差须停止回报；不改写权/客户主权/审批/审计语义 |

---

## 三、派发表与状态

| 批次 | 角色（上下文） | 写集（精确） | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| B0 | 测试 | `角色卡/测试/docs/change/`（完成） | — | **已完成但按客户指令豁免**（参考答案，非正式基线） |
| W1 | shared-code | `src/common/shared/shell-approval-binding.ts`、`test/项目管理/shared/`、`角色卡/shared-code/docs/architecture/shared-components.md`、自身 `docs/change/` | I0 | **完成（含 D1 修复）**：binding 287 行（`8fdcda39…`）+ 单测 19/19（`1ea506b6…`）；共享套件 D1 修复后 218/213/0 fail/5 skip（`[i18n-guard] violations=0`）；typecheck 0；D1 修复新增 `ui.judge.entryForeground` 中英成对（zh `6d5b1ef4…` / en `4c63f9b5…`）并同步 i18n 计数测试（`914db2a2…`，1212/1917）；I0 偏差 0；证据 `角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md`（148 行 / `d802a3f6…`） |
| W3-G | 门禁引擎 | `src/common/门禁引擎/classify-shell.ts`、`shell-write-guard.ts`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/`、自身 `docs/change/` | I0 | **完成**：classify-shell 1878→2223 行（`60cef039…`）、write-guard（`579964dd…`）、shell-rules（`0ea4729b…`）；门禁套件 426→449（失败同名同数 5=既有红，新增失败 0/新 skip 0）；跨角色复跑 shell-readonly 9/9、shell-gate 35/35（既有红转绿）、shell-risky-order 20/20、lightweight 4 pass/6 skip；typecheck 0；I0 偏差 0；证据 `角色卡/门禁引擎/docs/change/2026-11-08_W3G_readonly-git-matcher.md`（124 行 / `c593ea51…`）；跨角色待办 6 项（v4 夹具同步、entry 注入、trunk 入口、路由、审计字段、POSIX 复核） |
| W2-R | 运行时核心 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/`、自身 `docs/change/` | W1（binding API） | **完成**（与 W4 合并一轮）：model `c4dae557…`、session `c46e878…`；runtime-core 502→523（+21 全 pass；失败同名同数 33=既有红），新增失败 0/新 skip 0；typecheck 0；I0 偏差 0；证据 `角色卡/运行时核心/docs/change/2026-11-08_W2W4_session-admission-runtime.md`（225 行 / `86db4eed…`） |
| W4-R | 运行时核心 | `src/provider/runtime/tools.ts`、`schema.ts`、`test/runtime-core/`（含只读 Git 路由） | W2-R + W3-G | **完成**（合并于 W2-R）：tools `c37793c…`、schema `e472196…`；只读 Git 路由（无能力/未命中 ⇒ `readonly-git-runner-unavailable`，不回退 spawn）；证据同上 |
| W1b/W2b/W3b | 编排 | `src/common/编排/shell-gate.ts`、`shell-audit.ts`、`src/pipeline/orchestration/run-role.ts`、`shell-arming.ts`、`src/provider/trunk/impl/git-command.ts`、`public/trunk-store.ts`、`test/编排/`、自身 `docs/change/` | W1 + W2-R + W3-G | **完成（含 Amendment-1）**：shell-audit `b68cb129…`、shell-gate 修订后 `b64b83e3…`（runA prompt 已透传 entry/roleId）、shell-arming `b4a121d…`、run-role `dd873dc…`、git-command `ac723f8…`、trunk-store `c89716b…`；编排修订后 1093/1069/22 fail/2 skip（失败集合与实施前逐条 diff 空=22 既有红；新增失败 0/新 skip 0）；受影响测试 53/53；typecheck 0；I0 偏差 0；证据 `角色卡/编排/docs/change/2026-11-08_W1bW2bW3b_shell-wiring.md`（225 行 / `0628ad93…`，含 §12 Amendment-1） |
| W5-D | 桌面窗口 | `app/desktop/operator-channel.ts`、`app/main.ts`、`test/桌面应用/` 既有清单文件、自身 `docs/change/` | W2-R + 编排能力注入 | **完成**：operator-channel `fb699592…`（ShellConfirmRequest entry/protectedScope；presenter 从 prompt 透传）；`app/desktop/session.ts`/`app/main.ts` 无需改动（openRoleSession 已内部构造 readonlyGit/roleId/auditFailurePolicy，只读核对见证据）；受影响套件 126→128（+2 pass；9 既有红同名）；typecheck 0；条件 H1 未触发；证据 `角色卡/桌面窗口/docs/change/2026-11-08_W5D_operator-card-entry.md`（231 行 / `ddc81a33…`） |
| W5-U | 桌面UI | `app/renderer/`（entry 展示）、`test/桌面UI/`、自身 `docs/change/` | W5-D | **完成（含 D1 修复）**：judge.ts `af9af580…`（`shellConfirmEntryLabel` 使用 `ui.judge.entryForeground`，硬编码中英文已删除）、ConfirmCard `f620610f…`、judge.test `6ad07d2c…`；桌面UI 443/443 pass、i18n-guard 6/6（violations=0）；typecheck:renderer/build:renderer/typecheck 均 0；`protectedScope` 按 O7 默认不做视觉；证据 `角色卡/桌面UI/docs/change/2026-11-08_W5U_operator-card-entry.md`（48 行 / `8fe479b4…`，含「D1 修复：i18n key 化」节） |
| D1 | 测试 | `test/测试/`（跨角色集成）、`角色卡/测试/docs/change/` | W1–W5 | **完成（含修复复验）**：集成 9/9（`session-admission-approval-integration.test.ts` `34582aae…` 8 例 + `-q9-integration.test.ts` `1b2441f2…` 1 例）；首轮唯一 delta = `i18n-guard` 1 新失败（W5-U 硬编码「前台命令」）→ shared-code+桌面UI 修复后复验：shared 218/213/0/5、门禁 449/443/5/1、runtime-core 523/486/33/4、编排首跑 1081/1055/24/2（已知非确定性：git-trunk-store 文件级 Node 崩溃 + download-provider 抖动）→ **全量复跑 1093/1069/22/2 精确回到基线**、桌面四文件 128/119/9/0、桌面UI 443/443/0、`test/测试` 670/612/39/1/18 逐名一致；**新增确定性失败 0/新 skip 0**；静态门 0；候选冻结 38 文件聚合 `b62c7c7c…`、manifest 1,077 文件 `5308e71a…`（前后 diff 0）、T1 未变。D1 记录 `角色卡/测试/docs/change/2026-11-08_D1_cross-role-integration.md`（`1c9f2e8c…`，含「D1 修复复验」节；首轮版 `42bac879…`）+ `post-fix-logs/` |
| RR | 测试（统筹组织） | `角色卡/测试/docs/change/` | D1 | **完成（AC-23 达成、AC-24 部分）**：受保护目标项目+真实 Claude；父门受理→task.created `t-mw7crlr8-f32405f4`→**product 会话创建成功**（session.open.ready；`runtime-creation-admission-unproven` 0 次）→投递→product 回合启动（AC-23）。只读 `git status` 0 卡经固定传输、审计 c-allow/`by` 前缀/`readonlyGit.canonicalArgv`/roleId 齐全；非只读 `touch` 未弹卡、被 write-guard 硬拒（shell-write-outside/file-gate-host-facts-unproven、零执行）；审批卡子项按 AC-25 回退 D1 确定性证据。预算偏差（dispatch 2 次、驱动未在 48s 停止→10m04s、product 重复报告 2）与 CDP 关闭挂起均如实记录。证据 `角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal.md`（121 行 / `cc5968ee…`）+ 25 文件（索引 `2c7b03e9…`） |
| E3-F | 测试 | `角色卡/测试/docs/change/` | RR | **完成**：一次全量 T3（520 文件 = 参照 510 + 新增 10；514 自然 + 6 登记挂起；27 分钟；未用 force-exit）→ **4,979/4,750/196 fail/1 cancelled/32 skip**；既有 510 文件 4,891/4,662/196/1/32，新增 10 文件 88/88；对照参照 4,872/4,641/198/1/32：逐条一致 193、新增失败 2（均既有非确定性、隔离不复现）、消失 5（2 预期转绿 + 3 参照非确定性）、**新增确定性失败 0/新 skip 0**；辅助 B0 差异逐条解释；静态门 0；扫描（退役码零生产/死规则删/规则集仅 v4/matcher 单一来源）通过，上一变更 `73175db7…` 未覆盖。证据 `2026-11-08_E3-T3-full-regression.md`（169 行 / `5cba2d54…`）+ 590 文件（索引 `5642b2cc…`）；扫描 `..._session-admission.md`（45 行 / `9b05470f…`）+ 4 文件（索引 `478c0e44…`） |
| E3-B | 统筹 | `docs/scheduling/` | E3-F | **完成（B2 v1 insufficient → 补证后更新）**：变更包 `2026-11-08_change-package_session-admission-approval.md`；B2 v1 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`（198 行 / `d49fa516…`，33 pass/0 fail/2 insufficient/6 N/A：AC-2、AC-4） |
| B2补证 | 测试 | `test/测试/`、`角色卡/测试/docs/change/` | B2 v1 | **完成**：新增 1 文件 3 例（`session-admission-approval-b2-gap-integration.test.ts` `4aa783ad…`）——AC-2（Pi+项目角色+shellOperatorChannel：真实 assemble/createShellGate+file sink、prepareRole observed+token+approvalChain、真实 bindPreparedRole、session.open.ready、appTools 含 shell）；AC-4（Claude/Pi 无 shell：ready、appTools 不含 shell、无 approvalChain/native 阻断）；3/3 pass；`test/测试` 673/615/39/1/18（原 670/612/39/1/18+3/3）；typecheck 0；**新候选 39 文件聚合 `e89716bd…`、manifest 1,078/`57087b8b…`（diff 0）**；证据 `角色卡/测试/docs/change/2026-11-08_B2-gap-integration.md`（89 行 / `54c0db31…`）+ 20 文件（索引 `7121eaa1…`） |
| E3-V | 内置独立验收（沟通启动） | `docs/acceptance/` | E3-B | 不由统筹执行 |

---

## 四、批次纪律与停止条件

- 每个 W 批次：写者/写集/证据/候选哈希记录；**受影响套件实施前后对照**（前=批次开工时现状，后=本批次完成后）；不得修改写集外文件；不得提交/推送/暂存/合并/发布。
- 不得删除测试/放宽断言/加 skip/force-exit 求绿；跨角色只读消费经公共出口（`src/service/gate/shell-rules.ts`、`src/provider/trunk/public/trunk-store.ts`、`src/common/shared/`、`src/model/`）。
- **条件 H1 停止条件**：在 `test/桌面应用/` 新建文件、或需写任何 Section 1 未覆盖路径 → 立即停止并回报统筹，由人事 H1 处理。
- 真实运行（RR）如环境/凭据/UI 自动化不可达，按 AC-25 如实记录并回退确定性证据，不伪造、不追加预算。
- 并发：工作树有 T1 三文件（只读）；另有并行变更 `2026-11-08-remove-predictive-gates` 的团队计划/派发记录（其自述未派发、串行前置为本变更）。若出现其写入 `src/app/test`，停止并回报（本变更候选失效并重取证据）。
- B0 豁免与参考基线差异（如 200 vs 198 fail）由 E3 报告逐条解释；不得把辅助 B0 或参考基线冒充本变更通过项。

---

## 五、状态更新记录

- 2026-11-08：G2 已核验（团队计划 `ce30fad6…`）；P1.3 勘误落盘（`2553b97a…`）；客户豁免 B0 已留痕（`d7a699d2…`）；I0 结论冻结（§二）；派发 W1（shared-code）与 W3-G（门禁引擎），二者并行。
- 2026-11-08：**提速指令（客户关注节奏）**——最大化并行（W1/W2/W3 互不重叠部分并行；W4/W5 合并一轮）；I0 仅 R8a–R8c 为阻塞定稿（其余随实施记录）；中间批次不逐批回报，D1+RR 完成或遇阻塞/条件 H1 时回报；终验一次跑全量 T3（参照上一变更 E3 记录），受影响套件前后对照保留；不得删测试/放宽断言/加 skip/force-exit；B1 `fb881126…` 唯一判据。
- 2026-11-08：W1、W3-G 完成（证据与哈希见 §三）；进入 W2+W4（运行时核心合并一轮）派发。
- 2026-11-08：D1 完成跨角色集成 9/9，但发现本变更新增确定性失败 1（i18n 硬编码守卫：W5-U `judge.ts` 硬编码「前台命令」）；已按纪律停止、RR 暂停；派发 shared-code 增 `ui.judge.entryForeground` 键，随后桌面UI 消费并重取 D1 证据。
- 2026-11-08：i18n 修复完成——shared-code 中英成对新增 `ui.judge.entryForeground` 并把 key 计数同步为 ui 1212 / 总计 1917；桌面UI `judge.ts` 改用该 key（`af9af580…`）。统筹实测 shared 218/213/0/5、桌面UI 443/443、i18n-guard 6/6（violations=0）。已派发测试角色重取 D1 复验、冻结新候选并执行 RR。
- 2026-11-08：D1 复验通过（候选 38 文件聚合 `b62c7c7c…`、manifest 1,077/`5308e71a…` diff 0；各套件与基线逐名一致；新增失败 0/新 skip 0；静态门 0；D1 记录 `1c9f2e8c…`）；RR 完成（AC-23 达成、AC-24 部分+AC-25 回退；记录 `cc5968ee…`）；E3-F 全量 T3 已派发。
- 2026-11-08：**E3-F 完成**：4,979/4,750/196/1/32（新增确定性失败 0/新 skip 0；对照参照逐条 193 一致、2 非确定性新增、5 消失）；候选/manifest 全程不变；静态门/扫描通过；E3-B 变更包已写盘，交沟通启动 B2。
- 2026-11-08：**B2 结论 insufficient evidence**（`docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`，198 行 / `d49fa516…`；33 pass/0 fail/2 insufficient/6 N/A：AC-2 Pi bindPreparedRole+ready、AC-4 Claude/Pi 无 shell ready+appTools 缺原始日志）。已派发测试角色在 `test/测试/` 补两项集成用例并重算候选（新文件入候选；不改产品/不跑真实模型）。
- 2026-11-08：**B2 补证完成**：AC-2/AC-4 真实 service 路径 3/3 pass；新候选 39 文件聚合 `e89716bd…`、manifest 1,078/`57087b8b…`（diff 0）；产品/既有测试零变化（未受影响证据按 B1 复用规则复用，交 B2 复核）；变更包已更新（§3.1/§九）。
- 2026-11-08：**既有文件漂移披露（非本变更引入）**：`test/桌面应用/operator-wiring.test.ts`、`test/桌面应用/session.test.ts` 在本检出已被 `4c24149`（test batch-D3）删除，但 `角色卡/桌面窗口/boundary.md` 仍列该两文件；本变更按逐文件授权未新建、未恢复，桌面受影响套件以仍存在的 `operator-channel.test.ts`/`shell-escalation.test.ts`/`diagnostics.test.ts`/`multi-runtime.test.ts` 为准；该漂移不在本变更写集，交人事/治理后续处理（不顺手改）。
