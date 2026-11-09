# 团队计划登记 run 绑定 / baseDigest 合法来源：实施前验收标准 B1 v1.2

- 日期：2026-11-09；固定身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**。本文件只做实施前验收标准；**不实施、不派发、不运行真实模型、不运行测试、不授权提交/推送/合并/发布**。
- 版本：**v1.2（2026-11-09）** = v1.1 + convener-code 批次窄修订；v1.2 增补 §2.1 写集行（T8/T9）与 §4.3 旧/新记录，并在附录 B 记录理由/证据；**明确否决 `角色卡/convener-code/api-spec.md` 纳入写集（应回退，见附录 B）**；v1.1 的 T7/附录 A 原样保留；**不改 AC-1–AC-13、P-1–P-15、RR-1–RR-8、EV1–EV7 与判定规则**；全部条目仍 `未取证`。
- 风险档位：**T2（按 P1.1 §5.1；协调方已批准按 change 处理；Q1 口径待协调方维持/升档）**。本 B1 默认按 **T2 + 全量受影响回归**判定；若协调方按「凡改 Model 公共工具契约即 T3」裁定 T3，则按 T3 执行全量回归（§4.2），AC 与判据不变。档位不得由实施侧/验收侧自行下调，也不得用 T2 口径规避 T3 回归。
- 状态：**实施前冻结标准（B1 v1.2；v1.1 + convener-code 批次窄修订）**；全部条目当前 `未取证`，不得视为已通过。B2 只对**同一最终候选**与本版本判定。
- 依据（写盘前实测）：
  - 方案 **P1.1**：`docs/planning/2026-11-09_design_team-plan-run-binding.md`，**438 行 / 60,802 bytes / SHA-256 `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b`**（M1/G1/G2/S1–S6 已处置，§8 处置表在案）。
  - 独立复核记录：`docs/planning/2026-11-09_review_team-plan-run-binding.md`，**279 行 / 46,262 bytes / SHA-256 `452f6437ac116d72b1bf5e8a03754cbf78026d8c81e30dc6691e348531d353d8`**；R1.0 结论「建议修订后提交」（1 must-fix M1、2 general G1/G2、S1–S6），R1.1 窄复核结论「M1/G1/G2/S1–S6 全部闭合；无新增 must-fix；建议提交（可进入 B1/实施派发）」，余 N1–N4 建议不阻断。
  - 缺陷记录（最终版，含客户修正裁定）：`docs/communication/2026-11-09_defect_team-plan-run-ambiguity.md`，**40 行 / 4,669 bytes / SHA-256 `ae403883f8d5edb46b5a3b6c15aeb366c1fc663d92eb14ba0188e534fd9a13b3`**。裁定要点：团队计划仍归运营（convener）撰写/登记，不做职责/角色卡变更；规范路径/格式并入「文档格式说明」变更；**run-ambiguity / baseDigest 合法来源由应用侧解决**；不实施任何「团队计划改由策划撰写」的变更。
  - RR5 证据（只读引用，不作为本变更 B2 证据）：`角色卡/测试/docs/change/2026-11-09_RR5_snake-restore-proposal-flow.md`，**201 行 / 27,140 bytes / SHA-256 `af8f200865742cc63f94e203b8e22442bc9d60ea32482094d44497a7e85f3a1a`**；证据目录 `角色卡/测试/docs/change/2026-11-09_RR5_evidence/`，关键原件实测：`complete-team-plan-receipts.jsonl`（15 行 / 37,260 bytes / `db9a1c1d70ca25c3c6299ae9914f3310152a7de4284ba78e67ede13230ab24e6`）、`convener-reports/6f61eb74b5862cc3b98c131d12708e07a20d14edb04dfb4c6503d4b3ffde854f.json`（`7a544a19ca77e2869c3e1fd4b00897d3a67199a055cbd5829768695627e2f2f2`）、`pre/target-manifest-pre.json`（370 行 / 15,512 bytes / `8a662af9342a57aa8d6328c13675ab67b72303cf546f922c6fc298f0caeedcc8`）。
  - 并行变更（只读引用）：judge 代批 P1.2 `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（686 行 / 88,988 bytes / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`），其实现 25 文件在本工作树**未提交**（D1 `角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness.md` 224 行 / 23,909 bytes / `d7c16852684140fcc0dbe912e93d71adb51727a124f1106c793c2ee1ef1c2e64`；RR `角色卡/测试/docs/change/2026-11-09_RR_judge-delegated-effectiveness.md` 169 行 / 22,238 bytes / `22cc60f30119937747f55c182613f629a7775375b4f9699a9618cfc7ad6f02fe`）；文档格式 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md`（979 行 / 146,555 bytes / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`）与其 B1 `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（482 行 / 69,121 bytes / `bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe`）；提案卡修复已提交 HEAD `fb1aa39e787934f334b9c164e4221074f97f6147`（B2 pass 记录 `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-report-v1.md` 只读引用）。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（38 行 / 3,418 bytes / `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`，实测）；方案/复核/团队计划/实施免逐次闸门，**任何实质变化（范围、角色结构、治理语义、风险档位）必须停下回报**；提交/推送/合并/发布未授权。
- 代码基线（写盘时实测）：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`）；`git status --porcelain -- src app test` = **25 项（23 M + 2 `??`）**，为 judge P1.2 在飞实现（`src/model/runtime.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`test/编排/direct-role-capabilities.test.ts`、`test/测试/2026-11-09_judge-delegated-*.test.ts` 等），**不属于本变更候选**。**当前工作树状态不得作为本变更实施基线**；实施须在 judge 冻结/B2 后按 BASE-1 重取。P1.1 的 `file:line` 为当前检出快照；judge 合并后行号漂移，**实施/验收以符号名与文本锚点为准**。
- v1.1 修订时点（实测）：HEAD **`24799cb61239272e8603018adc094881bb6263dd`**（提交「feat(judge-delegated): judge 代批生效（T3）…」；judge 已合入；分支 `feat/plan-escalation-card`）；`git status --porcelain -- src app test` = **3 项（修订时点实测；此后实施继续推进，本文不作实时状态镜像）**（运行时核心批次 W1/W2/T4 在飞：`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/submit-capability-tools.test.ts`）；本修订不把任何在飞批次计入候选/B2 证据，实施基线/候选仍按 BASE-1/BASE-4 认定。W1 证据（只读引用）：`角色卡/运行时核心/docs/change/2026-11-09_W1_team-plan-run-binding-evidence/after-typecheck.log`（**33 行 / 5,165 bytes / `9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127`**）；其中 `test/编排/fixtures/git-action-authorization-wiring.ts(163,76)` TS2322 为本修订对象（修复点 `:76`）；同日志 `apply-journal.ts:2858/2861/2863` 错误为 B1 W3 已列机械触点（编排批次待实施），不属写集外。
- v1.2 修订时点（实测）：HEAD **`24799cb61239272e8603018adc094881bb6263dd`**；`git status --porcelain -- src app test` = **7 项 M（修订时点实测；实施继续推进，本文不作实时状态镜像）**——W1/W2/T4 3 文件 + W5/T3 4 文件（`src/common/roles/convener/index.ts`、`test/roles/convener/{convener-module,convener-differential}.test.ts`、`test/roles/convener/oracle-fixture.ts`）；另有 `角色卡/convener-code/api-spec.md` M（**本修订明确不纳入、应回退**，见附录 B）与 convener-code 未跟踪实施记录（不计候选）。本修订独立复跑 convener 两测试文件 = **32/32 pass、0 fail/0 skip**（修订时点；B2 仍在最终候选重测，不作为 B1 证据）。
- 关系：本 B1 只覆盖本变更（应用侧派生/断言 + 宿主 run 绑定）；**不修改**其它 B1、其它在飞变更（judge、文档格式、提案卡修复）与已验收候选；不改变公共校验语义；发布/tag 不在授权内。
- 编号口径：方案 §4.1 定义 **P-1..P-15**（14+1 条）；本 B1 逐条转写并新增 **BASE-1..BASE-8、AC-1..AC-13、RR-1..RR-8、EV1..EV-7**；不新增验收语义；v1.1 增补 §2.1 的 T7 写集行与 §4.3 记录（不新增 P/AC/RR/EV 判据）；v1.2 增补 T8/T9 写集行与 §4.3 记录，并明确 `角色卡/convener-code/api-spec.md` 不纳入（不改 P/AC/RR/EV 判据）。

## 0. 范围与非目标

### 0.1 本 B1 覆盖

1. `complete_team_plan` 的**应用侧派生/校验**：`baseDigest` = effective trunk manifest digest（`readEffectiveSnapshot`），`plan.sha256` = 计划文件实际字节 SHA-256；模型值仅作断言（可缺省）；未知/不可读/漂移/无 effective trunk 一律沿用既有稳定码与文案 fail-closed。
2. **宿主 run 绑定**：桌面 `SessionManager.completeTeamPlanForHandle` 从当前真实受派回合的真实任务（`inspectAssignedTask`）注入 `runId`；模型自报仅断言；绑定值记入 `source.runId`/回执。
3. **兼容/重放**：旧式完整正确 payload 逐字等价（I6；`team-plan:<digest>` journal message 字节锚点）；缺省 payload 与 Git prepare→commit 的重放语义（M1/P-8 四变体）；NoOp/journal/marker 等价；审计不伪造（I7）。
4. **不变项**：路径/版本/roster/modules/`parseTeamPlan`/owner/writeset 校验逐字保留；`project_state`/`version-decision` 的 `run-ambiguous` 语义保留；团队计划仍归运营；不新增角色/边界。
5. 确定性测试矩阵（P-1..P-15）、受影响套件 before/after、旧断言改写记录、`npm run typecheck`，以及隔离真实运行 RR6（A/B/C/D 分支）。

**非目标**：规范路径/格式的实现与说明（归文档格式变更）；bootstrap trunk / 从 live 文档构造 effective digest；run 生命周期动作（pin/close/restart/批量清理）；角色卡/边界/职责变更；提交/推送/合并/发布。

### 0.2 必须保留的契约/边界（硬约束）

1. **不改角色职责/角色卡/边界/团队计划归属**（客户最终裁定）：`角色卡/**` 的 `role-card.md`、`boundary.md`、`boundary.yaml`、`CONVENER_CARD_TEXT`、派发矩阵/卡种/权限 diff = 0（各角色按自身边界写实施记录除外）；团队计划仍归运营（convener）；**H1 delta = 0**；不新增/删除角色，不新增边界条目。
2. **路径/格式不属本变更**：`docs/scheduling/<flowId>-team-v<N>.md` 的规范路径/格式说明由文档格式变更覆盖；本变更**不改**路径正则、版本规则、`parseTeamPlan`、roster/modules 校验；RR5 的 `plan-path-invalid` 是**正确校验**，非本变更修复对象；非规范路径仍拒（convener preflight 与 Service 两层一致）。
3. **不改 run 生命周期/门禁**：不 pin/close/restart/清理任何 run；不自动 bootstrap trunk；不改 `RunManifest` 字段；**marker 不变**（不写入 `runId`）；`src/common/门禁引擎/classify-shell.ts` diff = 0（Q4 默认处置）；`project_state`/`version-decision` 的 `run-ambiguous` 语义/文案不变。
4. **模型值不信任（I1）**：模型提供的 `baseDigest`/`plan.sha256`/`runId` 只作断言；必须与实际派生值/宿主绑定值**严格相等**（不做 case fold），否则沿用既有稳定 code 拒绝；审计不伪造（I7），任何未与真实字节核对相等的模型值不得写入证据。
5. **fail-closed（I2）**：effective trunk 缺失/不可读、计划字节不可得（既无匹配冻结字节、live 也不可读）、结构/roster/modules 不合法——一律按既有 code 拒绝，不伪造、不回退到猜测、不生成摘要或写盘。
6. **旧调用兼容（I6）**：旧式完整正确 payload 的 `requestDigest`/journal message（`team-plan:<digest>`）/marker/target/回执/NoOp 与现状**逐字一致**（来源选择逐字保留现状，§3 AC-2）；缺省 payload 的重放语义按 M1 裁决（§3 AC-5）。
7. **公共契约仅加法可选（non-breaking）**：`CompleteTeamPlanInput` 字段可选化、schema `required` 缩减；不新增工具/IPC/账本事件；不改数据模型；实施若发现公共契约 breaking 或需要新数据模型 ⇒ **立即停止并升级 T3**，本 B1 不适用。
8. **写集硬约束**：只允许 §2.1 文件；写集外 diff = 0（尤其 judge/文档格式写集与本工作树 25 个在飞文件）；无新依赖、不改构建/发布配置；不得为求绿删除/弱化既有断言或新增 skip/force-exit。

### 0.3 判定对象

只判定**同一最终候选**是否满足冻结方案 P1.1、复核记录与客户最终裁定；不判方案质量/取舍，不判其它在飞变更。B2 由**同一独立验收身份**按本 B1 执行。

## 1. 基线、实施顺序与证据层级（BASE-1..BASE-8）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **实施基线（重取）**：本变更实施开始时记录 worktree、分支、HEAD/`HEAD^{tree}`、`git status --porcelain -- src app test` 与全仓 status；实施基线必须满足串行次序（BASE-2）：提案卡修复已提交/B2 pass（`fb1aa39e` 已满足），且 **judge 变更已冻结/B2 完成或已合入**（其 25 文件实现无在飞编辑）。**写盘时 worktree 携带 judge 25 文件未提交集，不得作为本变更实施基线**；若协调方裁决不同基线/次序，记录裁决与影响后再实施。P1.1 行号为本快照参考，实施/验收以符号名与文本锚点重新核对。 | 基线 HEAD/tree/status/分支；提案卡修复 B2 引用；judge 冻结/B2/合并记录；协调裁决记录 | 未取证 |
| BASE-2 | **实施顺序与单写者**：顺序为 **judge → 本变更 → 文档格式**（P1.1 §3.3；文档格式 P1.2 §10；以协调方裁决为准）。`src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/model/runtime.ts` 为共享文件，**同一时刻只允许一个变更编辑**；本变更不得与 judge/文档格式并行编辑。`app/desktop/session.ts` 与文档格式变更同文件（P1.1 §3.3 W6），同样串行写。合并前互相 diff 检查；后合并方 rebase 并重跑双方测试矩阵。 | 协调/调度记录；单写者/串行记录；基线 HEAD；judge/文档格式 B2 引用 | 未取证 |
| BASE-3 | **基线已知红项 + 增量不回归口径**：(a) 以 judge **D1 记录**（`d7c16852…`）为当前 25 文件组合候选参照：`test/runtime-core/**` 540/503/33 fail/4 skip、`test/编排/**` 1133/1109/22/2、`test/门禁引擎/**` 453/447/5/1、`test/桌面应用/` W-J4 四文件 61/35/26/0、`test/测试/` W-J5 相关 7 文件归一 8/8/0、`test/roles/nominator/**` 27/27、typecheck exit 0。(b) 以提案卡修复 **B1 v1.1 附录 A.1–A.3**（`682539ba…`）为 `test/编排/**` 22 fail/2 skip 集合、`test/桌面应用/chief-workflow.test.ts` 基线 59/47/12→改后 63/47–48/15（环境抖动，隔离复跑通过）、`optional-acceptance` 6/2/1/3/0（diff 0）、`run-change-trigger` 9/0/9 等参照。**实施基线（BASE-1）上必须以同一命令/Node 版本重取 before/after 计数与失败/skip 标题集合**，D1/A.1–A.3 只作参照、不得替代。判定：**同名用例不得恶化；新增确定性失败 = 0；新 skip = 0**；环境抖动须同候选隔离复跑通过方可排除，不得豁免新增确定性失败；不以绝对全绿为前提。 | 基线命令/Node 版本/TAP 输出/逐文件 hash；before/after 失败与 skip 标题集合 diff；隔离复跑日志；D1/A.1–A.3 引用 | 未取证 |
| BASE-4 | **候选身份/写集/聚合/manifest**：候选只含 §2.1 允许文件；记录绝对检出、基线 HEAD、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）与 manifest（`src app test` 及写集）；写集外 diff = 0（尤其 judge 写集、文档格式写集、提案卡修复文件与写盘时 25 个在飞文件）；无删除/重命名越界、无新依赖；未跟踪治理文档不计入候选。`src/model/runtime.ts` 与 judge/文档格式同文件不同区域——本变更候选在该文件只允许 `CompleteTeamPlanInput` 区域改动，judge/文档格式区域必须已是实施基线内容、不得混入本候选 diff。 | 候选清单/聚合/manifest；逐文件 hash；diff/numstat；区域核对；稳定性快照 | 未取证 |
| BASE-5 | **稳定性**：证据运行前后同一候选/manifest/聚合/树；HEAD/tree/分支/暂存不变；任何源码/测试/依赖/夹具/构建/命令变化使证据失效并重取；不得拼接旧候选/旧证据/不同环境；不得用 judge/文档格式/提案卡修复或其它 B1 的证据冒充本候选。 | manifest/聚合/树前后快照；diff 0；失效重取记录 | 未取证 |
| BASE-6 | **H1 delta = 0 与边界**：全部写集命中各自 boundary §1：运行时核心（`src/model/runtime.ts:6`、`src/provider/runtime/schema.ts:38`、`test/runtime-core/` 目录）；编排（`src/pipeline/orchestration/trunk-runtime.ts:50`、`src/service/trunk/:57`、`test/编排/:83` 目录）；convener-code（`src/common/roles/convener/:8`、`test/roles/convener/:11`）；桌面窗口（`app/desktop/:15` 目录、`test/桌面应用/chief-workflow.test.ts:127` 单文件）。不新增目录；不改角色卡/边界/roster/卡文本；团队计划归属不变；无新角色/边界。 | 边界条目；新增文件清单；H1 记录；diff 0 对照 | 未取证 |
| BASE-7 | **T2 档位与升 T3 触发器**：默认按 P1.1 T2（协调方已批准按 change；Q1 口径待确认）。**任一出现即停止并升级 T3/回报**：需要 bootstrap trunk 或从 live 文档构造 effective；需要自动关闭/收敛旧 draft run（run 生命周期语义）；需要改 `RunManifest`/marker/`classify-shell` 政策；需要改角色卡/边界/职责（客户已否）；实施发现公共契约 breaking 或需要新数据模型；需要 Section 1 外文件/新目录/新依赖。档位不得由实施侧/验收侧自行下调；T2 不得规避 T3 全量回归。 | 档位裁决记录；升级/停止记录（若有）；写集核对 | 未取证 |
| BASE-8 | **证据层级独立**：L1 运行时核心契约/工具形状（schema/model/`directShapeError`）；L2 编排派生/断言/fail-closed/重放（fs 路径）；L3 编排 Git prepare→commit；L4 convener preflight；L5 桌面宿主绑定与多 draft 集成；L6 隔离真实运行 RR6。各层绑定候选 digest/命令/环境/退出/计数/日志 hash；低层不得替代真实运行，真实运行不得替代确定性；确定性证据不得以真实运行替代，反之亦然（P1.1 §4.3）。 | 证据索引（层级/候选/命令/环境）；交叉引用审计 | 未取证 |

## 2. 范围、Owner 与写集

### 2.1 实施写集（按 P1.1 §3.1；每文件唯一 owner，零重叠）

| # | 文件 | Owner（单一） | 变更/用途 | 关联条目 |
| --- | --- | --- | --- | --- |
| W1 | `src/model/runtime.ts` | 运行时核心 | `CompleteTeamPlanInput` 可选化（`baseDigest?`、`plan.sha256?`）+ 注释（应用派生；声明值仅断言；`runId` 由宿主绑定）；与 judge/文档格式同文件不同区域 | AC-9、BASE-4 |
| W2 | `src/provider/runtime/schema.ts` | 运行时核心 | `complete_team_plan` 参数 schema/描述：`required` 缩减为 `["operationId","flowId","plan"]`，`plan` required `["path","version"]`，`sha256`/`baseDigest` 可选但保留 64 hex 形状；描述写明应用派生与勿猜 | AC-9、P-11 |
| W3 | `src/service/trunk/impl/apply-journal.ts` | 编排 | `completeTeamPlanInternal` 派生/断言（严格相等）；`:2863` 形状检查可选化；`resolved` 仅 marker/target/回执/commit 断言（M1）；机械触点 `:2858/:2861/:1244` 的 `baseDigest ?? null`（G2）；`source.runId` 记录 | AC-1–AC-5、AC-12 |
| W4 | `src/pipeline/orchestration/trunk-runtime.ts` | 编排 | `convenerTeamPlanFacts` 缺省字段投影；`:476-477/:498-499/:824-825/:836-837` 回显 `baseDigest ?? null`；`:626-627` 注释同步（G2） | AC-10、AC-12 |
| W5 | `src/common/roles/convener/index.ts` | convener-code | `checkTeamPlan` 可选字段放宽（`baseDigest`/`plan.sha256` 可缺省，给了必须 hex64；plan 键集允许 `{path,version}` 或 `{path,sha256,version}`）；**路径/版本/未知键规则逐字保留**；卡文本不改 | AC-8、AC-10、AC-11 |
| W6 | `app/desktop/session.ts` | 桌面窗口 | 新增 `completeTeamPlanForHandle` 宿主 run 绑定 + 接线（`:4319`、handle 建立处 `:4373` 同源） | AC-6、AC-7 |
| T1 | `test/编排/direct-role-capabilities.test.ts` | 编排 | 派生/断言/兼容/NoOp/run 断言/重放用例（fs 路径；既有 `:411-431` 含 `:427-428` 原样保留） | P-1..P-8、P-15 |
| T2 | `test/编排/git-capabilities.test.ts` | 编排 | Git prepare→commit 派生路径用例（新增/扩展；该文件既有「Git team plan publication…」`:514` 为基线已知红项，按增量口径，**不得作为 pass 证据**） | P-9、BASE-3 |
| T3 | `test/roles/convener/convener-module.test.ts` | convener-code | preflight 可选字段/路径规则保持；**改写 `:394-399` 缺失 `baseDigest` 旧断言**（§4.3） | P-10 |
| T4 | `test/runtime-core/submit-capability-tools.test.ts` | 运行时核心 | schema 形状：省略 base/sha 合法、缺 path/version 非法、未知键拒绝、旧形状合法 | P-11 |
| T5 | `test/桌面应用/chief-workflow.test.ts` | 桌面窗口 | 宿主绑定：真实 busy convener 回合、task run 注入、冲突/无任务拒绝（**避免使用 `test/桌面应用/session.test.ts`**——该文件当前不存在，文档格式变更计划恢复，避免同文件冲突） | P-12 |
| T6 | `test/编排/convener-module-consumption.test.ts` | 编排 | 多 draft run 下登记成功、pinned 冲突不受影响（集成层）；facts 投影（缺省不造键） | P-13、AC-10 |
| T7 | `test/编排/fixtures/git-action-authorization-wiring.ts` | 编排 | **v1.1 增补**：`holdableCompleteTeamPlan()` 回执 `baseDigest: input.baseDigest ?? null` 机械适配（W1 可选化后 `string \| undefined` 不满足 `DirectActionReceipt.baseDigest: string \| null`；不改断言/行为）；支撑 `git-action-authorization-wiring*` 发布/授权 wiring 用例族与全量 typecheck（T2/P-9 相关；T6/P-13 不直接引用该 fixture——实测） | AC-4、AC-9、BASE-4 |
| T8 | `test/roles/convener/oracle-fixture.ts` | convener-code | **v1.2 增补**：金样用例「plan 缺 sha256」由旧「已知更严格差异（deny）」改为新契约允许（allow）；`KNOWN_DELTAS` 2→1、`counts.preflightKnownDeltas` 3→2、`payloadSha256` 重算（`b82c364e…` → `67ef107d…`）；机械同步，不弱化 Service fail-closed（`plan-hash-drift`/`plan-base-conflict` 仍在 Service） | AC-10、P-10、BASE-4 |
| T9 | `test/roles/convener/convener-differential.test.ts` | convener-code | **v1.2 增补**：team-plan 组期望 allowed 3→4、compared 10→11、knownDelta 2→1；机械同步，不改其它断言 | AC-10、P-10、BASE-4 |

- 既有测试若断言「`baseDigest`/`plan.sha256` 为 schema/preflight 必填」需改写：按 §4.3 逐条记录旧断言/新断言/理由（不得静默放宽 fail-closed 断言）。
- 测试基线已知红项按 BASE-3 口径：**新增确定性失败 = 0、新 skip = 0、已知红项不恶化**；不得为求绿改基线红项或在写集外修测试。

### 2.2 明确排除（diff 必须为 0；防越权）

- **judge 写集**（实施基线后已入库部分除外）：`src/model/version-change.ts`、`src/service/version-change/**`、`src/provider/version-change/**`、`src/pipeline/orchestration/version-change-runtime.ts`、`src/common/编排/task-state.ts`、`src/common/门禁引擎/classify-shell.ts` 及其测试（`src/service/trunk/impl/apply-journal.ts`/`trunk-runtime.ts`/`model/runtime.ts` 只允许本变更区域，见 BASE-4）。
- **文档格式写集**：`src/provider/runtime/tools.ts` 的 `doc_format` 逻辑、`src/pipeline/orchestration/run-role.ts`、`test/桌面应用/session.test.ts`（本变更不碰）、`docs/skills/**`、`docs/mcp/**`、`src/common/编排/doc-format-specs.ts` 等。
- **提案卡修复文件**：`app/desktop/customer-input.ts` 与既有已提交内容（只读）。
- **路径/格式/解析实现**：`src/common/编排/workflow-preconditions.ts`、`parseTeamPlan`、`run-manifest.ts`、`evidence-check.ts`、`src/service/trunk/impl/amendment-validate.ts` 等 parser/validator。
- **其它**：`app/renderer/**`、`角色卡/**` 的 `role-card.md`/`boundary.md`/`boundary.yaml`、`test/桌面应用/optional-acceptance.test.ts`、`.ans/**`、目标项目产品文档；不新增依赖、不改构建/发布配置。
- **v1.2 明确排除**：`角色卡/convener-code/api-spec.md`（工作树当前 M）**不纳入本变更候选，应回退**——P1.1 §3.2 明确「不改任何 `角色卡/**`」（H1 delta=0），B1 §0.2-1 亦不允许角色卡/角色职责/边界变更；其契约描述同步需求按附录 B v1.2 处置（如协调方/方案修订批准，另版纳入）。

### 2.3 边界与升级条件

- **零重叠/无 H1**：每个产品文件按 boundary §1 单一 owner；测试文件均在已授权目录/单文件；桌面窗口在本变更可写 `app/desktop/session.ts` 与 `test/桌面应用/chief-workflow.test.ts`。
- **升级条件（任一出现即停止并升级普通流程/T3，本 B1 不适用）**：需要改 §0.2-1/2/3 的职责/路径校验/run 生命周期/门禁；需要 bootstrap trunk 或从 live 构造 effective；需要 Section 1 外文件/新目录/新依赖；公共契约由加法可选变为 breaking 或需要新数据模型；需要把 `runId` 写入 marker 或改 `classify-shell.ts`（Q4 非默认分支）；需要登记 host-local 码为共享稳定码且协调方判定属契约变更。

## 3. 验收标准（AC-1..AC-13）

> 判定前提：每条在**同一最终候选**上、以可复算原始证据判定；全部子判据满足方可 `pass`；任一 fail 触发项即 `fail`；证据不全为 `insufficient evidence`。全部条目当前 `未取证`。

### 3.1 应用侧派生/校验/兼容/重放（AC-1–AC-5、AC-12；owner：编排）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-1 | **`baseDigest` 应用侧派生与断言**：`:2863` 身份/形状检查改为「缺省合法」——`actor === "convener"`、`operationId`/`flowId` 非空不变；`input.baseDigest === undefined` 或通过 `/^[a-f0-9]{64}$/i`；缺省时由 `readEffectiveSnapshot` 的 `manifest.digest` 派生（`derivedBase = current.digest`）；提供时必须**严格相等**（无 case fold；大写 hex 形状通过但值比较失败，与基线 `:2883` 一致）；`flowId` 不符或声明值不等于派生值 ⇒ 既有 `plan-base-conflict` 且文案不变（"Plan basis differs from the actual effective flow document snapshot"）。失败回执 `baseDigest` 分层（S3/Q10）：service 层 effective 读取成功后回显 `derivedBase`；读取前失败（含 `plan-identity-invalid`）回显 `input.baseDigest ?? null`；preflight/Git 身份层（早于 effective 读取）只能回显 `request.baseDigest ?? null`；同一逻辑请求跨层失败回执允许不同（null/自报 vs 实际），不视为不一致；`DirectActionReceipt.baseDigest` 允许 null。`source.baseDigest` 仍为 `current.digest`（`:2918` 语义不变）。不伪造任何摘要。 | 未取证 |
| AC-2 | **`plan.sha256` 应用侧派生与断言 + 来源选择等价**：来源选择**逐字保留现状**（G1，不新增 frozen/live 不一致拒绝）：(i) 声明 sha 命中冻结快照同 path 且同 sha ⇒ 用冻结字节（即使 live 不同；不读 live）；(ii) 声明 sha 未命中冻结 ⇒ 读 live 并要求 `live.sha256 === 声明值`（即使 frozen 同路径留有旧字节）；(iii) 缺省 sha ⇒ live 可读用 live，live 不可读再用 frozen 同 path 兜底，两者都不可得才拒绝（`plan-hash-drift`，缺省文案 "Plan bytes are unreadable or absent from the effective snapshot"）。`derivedSha = actual.sha256`；提供时必须**严格相等**（无 case fold；大写 hex 值相等亦拒，与基线 `:2896` 一致）。后续 `parseTeamPlan`、marker、`target.execution.teamPlan` 全部使用 `derivedSha`（frozenMatch 命中时 `derivedSha` 即声明值，与现状一致）。拒绝时无 journal/marker/trunk 变更。 | 未取证 |
| AC-3 | **fail-closed（含无 effective trunk）**：无 `.ans/trunk/manifest.json`（`readEffectiveSnapshot` 失败）⇒ 既有 `trunk-unavailable`，不生成任何摘要、不写盘、不 bootstrap；effective snapshot 缺 roster/modules 引用或字节 ⇒ `plan-basis-incomplete`；roster/modules 不一致 ⇒ `plan-owner-invalid`；计划字节不可读/缺失 ⇒ `plan-hash-drift`；结构非法 ⇒ `plan-structure-invalid`；路径/版本非法 ⇒ `plan-path-invalid`。全部沿用既有稳定 code；文案允许 P1.1 §2.2 的两条 `plan-hash-drift` 变体（N3；旧文案 `:2896` 无测试断言）；失败不得产生 journal/marker/trunk/证据伪造，不得以猜测回退。RR6 停在 `trunk-unavailable`/`plan-basis-incomplete` 是**正确的下一门**，不是本变更失败（RR6-B 如实记录，不得宣称已过）。 | 未取证 |
| AC-4 | **旧调用逐字等价（I6）**：旧式完整正确 payload（`baseDigest` + `plan.sha256` 正确）与基线逐字一致：`requestDigest = directHash({ input, actor })` 对**原样 input** 计算；journal message 恰为 `team-plan:<digest>`（字节锚点，同一 input ⇒ 同一 canonicalJson ⇒ 同一 hash）；marker `team-plan-completion/v1` 的 `plan` 为规范化值（与旧式正确调用相同）；target snapshot/manifest/`source.baseDigest`/`targetDigest`/回执/`planRef`/NoOp 语义逐字一致；同 operationId 重放（含 trunk 前进后、`test/编排/direct-role-capabilities.test.ts:411-431` 含 `:427-428` 删除计划文件后）返回既有回执；来源选择 (i)/(ii) 的旧式接受/拒绝集合与基线相同（无新增拒绝角落）。任何改变 `team-plan:<digest>` 形态或 marker 字节的实现视为回归。 | 未取证 |
| AC-5 | **重放语义（M1/P-8 四变体）**：`requestDigest` 与先序重放匹配保持「提交原样 input」、位置不变（`:2865`，先于任何 effective 读取/派生）；`:2874-2879` 的 `prior.message` 与 `team-plan:` + `requestDigest` 的逐字相等判定与命中返回既有回执逐字保留。`resolved = {...原样 input 字段, baseDigest: derivedBase, plan: {path, sha256: derivedSha, version}}` **只用于** marker、`target.execution.teamPlan`、`decorate`/`planRef` 回执与 commit 断言；journal message/`source`/`targetDigest` 语义不变。`PreparedTeamPlanCommit.input` 保持 `structuredClone(input)`（`:2926`）；Git prepare→commit 两侧摘要形态一致；store 的 `journalDigest`/manifest/expectedSnapshot/expectedFiles 绑定 fail-closed。变体：①缺省 payload 首成功后同 operationId 同原样 payload 重放 ⇒ 命中先序重放、同一回执（不读 effective/不重派生）；②Git prepare→commit 完成后原样 payload 重放 ⇒ 同一回执；③同 operationId 但 payload 形态变化 ⇒ `plan-operation-conflict`；④旧式显式 payload 删除计划文件/trunk 前进后重放 ⇒ 逐字不变。`canonicalJson` 按键排序并丢弃 `undefined`（`src/service/trunk/impl/trunk-common.ts:12-17`，N1 更正引用）⇒ 缺省字段与值为 `undefined` 哈希一致。 | 未取证 |
| AC-12 | **审计不伪造（I7）**：任何与真实字节/宿主绑定不一致的模型值在归一化前即拒绝（`plan-base-conflict`/`plan-hash-drift`/`plan-run-conflict`），不产生 journal/marker；证据只记录派生值/实际值（marker/target/回执/`source.runId`）；journal message 只绑定原样请求身份；回执 `baseDigest`/`targetDigest`/`planRef.sha256`/`source.runId` 如实；不得以空串摘要（如 `e3b0c442…`）或截断 hash 冒充实际值；失败/NoOp/回退如实报告。 | 未取证 |

### 3.2 宿主 run 绑定与集成（AC-6–AC-7；owner：桌面窗口 + 编排）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-6 | **宿主绑定（`completeTeamPlanForHandle`）**：模式对齐 `selectRunChangeForHandle`（`app/desktop/session.ts:1414-1428`）。校验当前真实回合未变化：`entry` 存在、`entry.handle === handle`、`entry.origins.running === origin`、`entry.busy`、`!origin.settled`、lifetime/turn 两个 abort signal 未触发、`signal?.aborted` 为 false；取 `origin.taskId`（必须有）并调用 `inspectAssignedTask({projectRoot, actorRoleId:"convener", taskId})`（`trunk-runtime.ts:1101-1103` → `apply-journal.ts:2471-2528`）；任务已关闭/不存在/非本角色 ⇒ **直通其原码 `trunk-item-invalid`**（不重写）。`assigned.flowId !== request.flowId` ⇒ host-local `plan-flow-conflict`；`request.runId !== undefined && request.runId !== assigned.runId` ⇒ 既有 service 码 `plan-run-conflict`；随后以 `{...request, runId: assigned.runId}` 调用 `direct.completeTeamPlan(..., signal)`；核验期间回合变化 ⇒ host-local `plan-task-changed`，不执行；无当前回合/无 `origin.taskId` ⇒ host-local `plan-task-unavailable`。host-local 码不登记为共享稳定码（S2；如需登记另评）；接线于 `:4319` 改为包装并使用与 `gitBinding` 同源 handle（`:4373`）；仅 convener 注入。成功回执 `source.runId` = 受派任务实际 run，`planRef.sha256` = 派生值；marker 不变。 | 未取证 |
| AC-7 | **多 draft/歧义语义/CLI 回归**：多未 pin draft run（RR5 形态）下，convener 经受派任务登记计划**不受阻塞**并绑定任务 run；不自动关闭/清理旧 draft run；多个 **pinned** run 冲突仍是硬错误（`run-manifest.ts:307-319`/`:658-662` 语义不变）；`project_state`/`version-decision` 的 `run-ambiguous` 语义与输出逐字不变（只读对照）；`runId` 属于 flow / 不属于 ⇒ 成功且 `source.runId` 记录 / `plan-run-conflict`（P-7）。CLI/一次性路径不注入 `completeTeamPlan`（仅 `session.ts:4319` 注入；`run-role.ts` 透传；govern-session/CLI 不注入）⇒ **无工具回归**（Q8），不得绕过绑定为 CLI 另开口子。 | 未取证 |

### 3.3 契约/前置/路径/归属（AC-8–AC-11；owner：运行时核心 + convener-code + 编排）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-8 | **路径/格式/版本不变**：路径正则与 preflight 精确匹配逐字保留——Service `^docs/scheduling/<escaped flowId>-team-v<version>\.md$`（`:2886`）；convener `checkTeamPlan` 的 `expectedPath` 精确相等（`convener/index.ts:432-438`）；非规范路径（RR5 的 `docs/scheduling/snake-game-team-plan-v1.md`、roster 路径等）仍被拒：preflight `team-plan-path-invalid` → 回执 `plan-path-invalid`，Service 同 code；**不因本变更放宽**。规范路径/格式的说明/实施归文档格式变更（`886fef84…`/`bec45edf…`）；本变更不新增别名、不改 `parseTeamPlan`/版本/roster/modules 校验。`plan.version` 仍是角色声明（Q9），不派生；路径与版本一致性仍强制。RR6 的 chief 任务文本必须包含规范路径，否则路径门会掩盖本变更效果（流程/文档格式责任）。 | 未取证 |
| AC-9 | **公共契约加法可选、非 breaking + 工具形状**：`CompleteTeamPlanInput` 变为 `{ operationId; flowId; runId?; baseDigest?: string; plan: { path: string; sha256?: string; version: number } }`，注释写明应用派生/断言/宿主绑定；schema `required` = `["operationId","flowId","plan"]`、plan required = `["path","version"]`，`baseDigest`/`sha256` 可选但保留 64 hex 形状；描述改写（应用派生 effective trunk digest 与实际字节 SHA-256，可省略或给匹配断言；未知/不可读/漂移拒绝；`runId` 由应用按实际受派任务绑定，勿猜）；`tools.ts` 无逻辑变更（`directShapeError` 按 schema 机械校验）。省略 base/sha 结构合法；缺 `plan.path`/`plan.version` 拒绝；未知键拒绝；旧形状合法；成功回执 JSON 含派生 `planRef.sha256`。不新增工具/IPC/账本事件；不改数据模型；若需要 breaking/新数据模型 ⇒ 停止升级 T3（§0.2-7）。 | 未取证 |
| AC-10 | **convener preflight（`checkTeamPlan`）**：`baseDigest` 可缺省（给了必须 hex64）；`plan` 键集允许 `{path,version}` 或 `{path,sha256,version}`，`sha256` 给了必须 hex64；**路径/版本规则逐字保留**；未知键仍 `facts-unknown`；`TEAM_PLAN_FACT_KEYS` 不变；`convenerTeamPlanFacts` 缺省字段不投影（或投影 undefined 由 preflight 视为缺省），`runId` 宿主绑定后总在；deny 映射保持既有 `plan-path-invalid`/`plan-identity-invalid` 口径；`trunk-runtime.ts:626-627` 注释同步（"工具 schema 已保证 baseDigest 形状"的表述修正）。 | 未取证 |
| AC-11 | **团队计划归属/角色职责零变更（H1 delta = 0）**：`角色卡/**`（`role-card.md`/`boundary.md`/`boundary.yaml`）、`CONVENER_CARD_TEXT`、roster、派发矩阵/卡种/权限 diff = 0；团队计划仍由运营（convener）撰写/登记（客户最终裁定）；不新增/删除角色，不新增边界；W5 只改 preflight 纯策略代码，不改身份/职责/工具集；`convener/index.ts:62` 卡文本与新契约的文案偏差**本变更不修改**（Q5，以工具描述为执行口径）；不实施任何「团队计划改由策划撰写」的变更。 | 未取证 |

### 3.4 回归（AC-13；全 owner）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-13 | **回归/静态门**：pinned/无 run 分支、run-manifest、`evidence_check`/`contract_check` 输出零行为变化；`project_state`/`version-decision` 输出不变；P-14 既有相关用例原样通过；受影响套件按 BASE-3 在实施基线上 before/after 对照：同名用例不恶化、**新增确定性失败 = 0、新 skip = 0**、已知红项（`test/编排/**` 集合、`git-capabilities.test.ts:514`、`chief-workflow` 基线红、`optional-acceptance` 6/2/1/3/0 等）不恶化；`npm run typecheck` exit 0（tsconfig `src,test,app`，`app/renderer` 既有排除）；写集外 diff = 0；旧断言改写逐条记录（§4.3）。不以绝对全绿为前提，不得用退出 0/自述/局部绿替代。 | 未取证 |

## 4. 测试矩阵（P-1..P-15）、受影响套件与旧断言记录

### 4.1 新增/扩展矩阵（按 P1.1 §4.1 逐条转写；owner 对应 T1–T6）

| # | 层/Owner | 用例 | 必须观察 | 判定 |
| --- | --- | --- | --- | --- |
| P-1 | 编排/T1 | effective trunk 存在；模型只给 `{path,version}` → `completeTeamPlan` | `status:"applied"`；`source.baseDigest === manifest.digest`；`planRef.sha256 === sha256(实际字节)`；trunk 版本 +1；marker `plan.sha256` = 实际值 | 未取证 |
| P-2 | 编排/T1 | 声明 `baseDigest` ≠ effective → 拒绝；另加大写 hex 且取值正确的负例（S1） | `plan-base-conflict`；无 journal/marker/trunk 变更；大写值与现状一致被拒（严格相等） | 未取证 |
| P-3 | 编排/T1 | 声明 `plan.sha256` ≠ 实际字节 → 拒绝；另加大写 hex 负例（S1） | `plan-hash-drift`；无副作用 | 未取证 |
| P-4 | 编排/T1 | 计划字节不可得（live 不可读且无同 path frozen）；frozen 与 live 同时存在时的来源选择 | 前者 `plan-hash-drift` fail-closed；后者按 AC-2 来源选择 (i)/(ii)（不做「frozen/live 不一致即拒绝」，G1）：声明命中 frozen 用 frozen、否则 live 命中即接受；缺省 sha 的 (iii) 单列 | 未取证 |
| P-5 | 编排/T1 | 无 `.ans/trunk/manifest.json`（RR5 形态） | `trunk-unavailable`；不生成任何摘要、不写盘（如实 fail-closed）；不 bootstrap | 未取证 |
| P-6 | 编排/T1 | 旧式完整 payload（值正确） | 与基线逐字一致：同 operationId 重放/幂等返回同回执；marker/journal 字节可复算一致；`team-plan:<digest>` 字节锚点保持 | 未取证 |
| P-7 | 编排/T1 | `runId` 属于 flow / 不属于 | 属于 ⇒ 成功且 `source.runId` 记录；不属于 ⇒ `plan-run-conflict` | 未取证 |
| P-8 | 编排/T1 | 重放语义四变体（M1）：①缺省 payload 首成功后同 operationId 同原样 payload 重放；②Git prepare→commit 后原样 payload 重放；③同 operationId 但 payload 形态变化；④删除计划文件后旧式显式 payload 重放（既有 `:427-428`） | ①② ⇒ 命中先序重放、同一回执（不读 effective/不重派生）；③ ⇒ `plan-operation-conflict`；④ ⇒ 逐字不变；旧式 `team-plan:<digest>` message 字节锚点保持 | 未取证 |
| P-9 | 编排/T2 | Git 路径：prepare（省略值）→ commit；prepare 后计划字节漂移 | 省略值仍可 prepare/commit（**prepared input 保持原样**，M1）；漂移 ⇒ 断言/CAS 拒绝；`classify-shell` 政策原样通过（marker 不变）；该文件既有「Git team plan publication…」（`:514`）为基线已知红项：B2 须记录其红因与新增用例的隔离/关系（S5-3/N2）；**先在同基线复现/定位红因再定 P-9 用例范围**（N2），不得以既有红项作为 pass 证据 | 未取证 |
| P-10 | convener-code/T3 | preflight：缺 `baseDigest`/`plan.sha256` 允许；给错形状拒绝；路径/版本错误仍 `team-plan-path-invalid`；未知键仍 `facts-unknown` | 逻辑同 AC-10；路径规则逐字不变；旧断言改写按 §4.3 记录 | 未取证 |
| P-11 | 运行时核心/T4 | 工具形状：省略 `baseDigest`/`plan.sha256` 结构合法；缺 `plan.path`/`plan.version` 拒绝；未知键拒绝；旧形状合法 | `directShapeError` 判定符合 schema；成功回执 JSON 含派生 `planRef.sha256`；`tools.ts` 无逻辑变更 | 未取证 |
| P-12 | 桌面窗口/T5 | 真实 busy convener 回合 + 受派任务：模型省略 runId / 自报不同 runId / 无当前任务 / 回合变化 | 省略 ⇒ 注入任务 run；不同 ⇒ `plan-run-conflict`（service 既有码）；本地前置无任务/回合变化 ⇒ host-local `plan-task-unavailable`/`plan-task-changed`；`inspectAssignedTask` 失败直通 `trunk-item-invalid`（S2 分层）；成功回执 `source.runId` = 任务 run | 未取证 |
| P-13 | 编排/T6 | 集成：多 draft run + `run-ambiguous` 状态下，convener 经受派任务登记计划 | 登记成功且绑定任务 run；`project_state`/`version-decision` 行为不变（只读对照）；多 draft 非冲突；不自动关闭旧 run | 未取证 |
| P-14 | 回归 | pinned/无 run 分支、run-manifest、`evidence_check`/`contract_check` 输出 | 零行为变化；相关既有测试原样通过（按 BASE-3 对照） | 未取证 |
| P-15 | 编排/T1 | 非规范路径（RR5 形态：`docs/scheduling/<flowId>-team-plan-v1.md` 等） | 仍 `plan-path-invalid`（服务层正则，与前置层一致）；**不因本变更放宽**；该失败归文档格式责任 | 未取证 |

### 4.2 受影响套件、运行命令与 before/after 对照

- 运行口径：Node **v24.22.1**（与 D1/RR5 一致），worktree 根执行，`node --test --test-concurrency=1 [--test-reporter=tap] <file>` 逐文件或按目录（`test/编排/**`、`test/runtime-core/**`、`test/roles/convener/**`、`test/桌面应用/chief-workflow.test.ts`）；记录 tests/pass/fail/cancelled/skip/exit 与日志 SHA-256；不得并发多个套件污染计数。
- 受影响文件（前后对照，逐文件计数 + 失败/skip 标题集合 diff）：`test/编排/direct-role-capabilities.test.ts`、`test/编排/git-capabilities.test.ts`、`test/编排/convener-module-consumption.test.ts`、`test/runtime-core/submit-capability-tools.test.ts`、`test/roles/convener/convener-module.test.ts`、`test/桌面应用/chief-workflow.test.ts`。
- 目录级回归：`test/编排/**`、`test/runtime-core/**`、`test/roles/convener/**`、`test/桌面应用/chief-workflow.test.ts`；按 BASE-3 在**实施基线**上重取 before，与候选 after 对照（失败/skip 标题集合逐条 diff）。
- 已知红参照（只作参照，不替代实施基线重测）：D1 记录（`d7c16852…`）的五套件计数与集合；提案卡修复 B1 v1.1 A.1（`test/编排/**` 22 fail/2 skip 集合，含 `git-capabilities.test.ts:514` 与同文件 `:33` 2 skip）、A.2（`chief-workflow` 基线 59/47/12、改后 63/47–48/15，隔离复跑通过）、A.3（统一口径：新增确定性失败=0/新 skip=0）。
- `test/桌面应用/optional-acceptance.test.ts`：diff = 0；只读对照 6/2/1/3/0；不在写集、不得修改。
- 静态门：`npm run typecheck` exit 0（`tsc --noEmit`；`tsconfig.json` include `["src","test","app"]`、exclude `["app/renderer"]` 属既有范围）；记录日志与退出码。
- 每条证据绑定候选 HEAD/聚合/命令/环境/退出/计数/日志 hash；确定性证据与真实运行分层独立（BASE-8）。

### 4.3 旧断言改写逐条记录（不得静默放宽）

1. `test/roles/convener/convener-module.test.ts:394-399`：旧断言为「删除 `baseDigest`（遍历键含 `baseDigest`）⇒ `team-plan-facts-invalid`」。新契约下缺省 `baseDigest` 合法，必须改为「删除 `baseDigest` ⇒ `allow`」；另补正例「`plan:{path,version}`（无 sha256）⇒ `allow`」；`{ baseDigest: "a".repeat(63) }`、错误 sha256 形状、未知键、路径/版本错误等拒绝断言保持。记录旧文/新文/理由/对应 P-10。
2. `test/roles/convener/convener-module.test.ts:403` 的 `{ baseDigest: 63 位 }` 拒绝断言**不变**（给了必须 hex64）。
3. `test/编排/convener-module-consumption.test.ts:265-270`：既有 facts 键集合断言（含 `baseDigest`、`runId` 未给不造键）在输入含 `baseDigest` 时保持；**新增**「缺省 `baseDigest` 不投影/不造键」断言；不得删除既有未知键/路径映射断言。
4. `test/runtime-core/submit-capability-tools.test.ts:327` 旧形状（含 `baseDigest`/`plan.sha256`）仍合法，保留；**新增**省略形状正例与缺 `path`/`version`/未知键负例；若该文件其它处断言 `required` 数组含 `baseDigest`/`sha256`，逐条记录旧/新。
5. 其它任何被改写的既有断言：逐条给出 `文件:行`、旧断言原文、新断言、理由、对应 P/AC；**不得删除/弱化 fail-closed 断言**（`plan-base-conflict`/`plan-hash-drift`/`plan-path-invalid`/`plan-run-conflict`/`trunk-unavailable` 等负例必须保留并加强）；未记录即视为静默放宽，判 fail。
6. N3 文案：`plan-hash-drift` 现有两条文案（旧 `:2896` 与新增「Plan bytes are unreadable or absent from the effective snapshot」）；B1 写盘时 grep 确认旧文案仅存在于 `apply-journal.ts:2896`、无测试断言；若实施新增文案断言，按新文案逐条记录，不要求旧文案断言。
7. P-9 既有红项用例不得改写求绿；`git-capabilities.test.ts` 既有「Git team plan publication…」不得被删除/跳过。
8. （v1.1 增补，机械触点非断言改写）`test/编排/fixtures/git-action-authorization-wiring.ts:69-76`：旧返回 `baseDigest: input.baseDigest`（W1 后类型 `string | undefined`，不满足 `DirectActionReceipt.baseDigest: string | null`，typecheck TS2322 见证据）；新返回 `baseDigest: input.baseDigest ?? null`。理由：与 P1.1 G2 同族的 `?? null` 机械适配；**不改断言/行为**——现有调用均提供 `baseDigest` 时两者取值相同，缺省时 fixture 回执如实为 null；不改变任何 fail-closed/路径/重放语义。证据：`角色卡/运行时核心/docs/change/2026-11-09_W1_team-plan-run-binding-evidence/after-typecheck.log`（33 行 / 5,165 bytes / `9c5d7eed…`；错误位于 `test/编排/fixtures/git-action-authorization-wiring.ts(163,76)`，修复点 `:76`）。对应 T7/AC-4/AC-9/BASE-4。
9. （v1.2 增补，金样契约同步）`test/roles/convener/oracle-fixture.ts:886-911/:1438-1443/:1616-1632`：旧「team-plan plan 缺 sha256（已知差异）」`expectedAllow:false`/`expectedCode:"team-plan-facts-invalid"`/`knownDelta:"team-plan-fact-schema"`；新「team-plan plan 缺 sha256（新契约允许）」`expectedAllow:true`/`expectedCode:null`/`knownDelta:null`；`KNOWN_DELTAS` 2→1、`counts.preflightKnownDeltas` 3→2、`payloadSha256` `b82c364e96fd52e0f6754e819792e2a70695f16f4b2c6025edb12a3dbc258c34` → `67ef107d65c0d753d9041563d187183d58bc1b40a707ca17aca1f6779ac6f31e`。文件 SHA-256：`998f372f39ba47488f6232c7e8598b4c497b9716fe7ff57b0501a7c83230bc28` → `b7c7f2e8e543c9054e8864be22ede705d4c2d8e4b33e08594a94bcfeeb589528`。理由：新契约允许缺省 `plan.sha256`（应用派生）；Service 仍执行 `plan-hash-drift`/CAS/结构校验，金样只同步 preflight 事实契约，不弱化 fail-closed。对应 T8/AC-10/P-10/BASE-4。
10. （v1.2 增补，差分期望同步）`test/roles/convener/convener-differential.test.ts:13-19/:211-216`：旧 allowed 3/compared 10/knownDelta 2；新 allowed 4/compared 11/knownDelta 1。文件 SHA-256：`53a9b94a7fd3a63ab6c576c05ef04a67030c336b7f5f6686b73953f0e08e5549` → `f46f7bd308620a8a934b04263c231ca6c53788326b7c2f649a13defbc4f24172`。理由：跟随 T8 的新契约金样计数；不改其它断言。对应 T9/AC-10/P-10/BASE-4。
11. （v1.2 明确否决，非改写）`角色卡/convener-code/api-spec.md` **不纳入候选、应回退**：基线 SHA-256 `20e6336dcbd47acda251dbc4fb7cf5a7a95ebc40c3c6beac4837f7a60933aea4`；工作树当前 `874a18cfcb8ed673fc4adfb83580a8d20294bc33092073a0ccd1e60980b31c99`（§5.1/§7 契约描述同步）不得出现在候选。依据：P1.1 §3.2「不改任何 `角色卡/**`」、B1 §0.2-1（H1 delta=0，不改角色卡/角色职责/边界）；如需同步，须协调方/方案修订批准后另版纳入。文档偏差按 Q5 同口径处置（工具描述为执行口径），B2 以 api-spec diff=0 判定。

### 4.4 候选/证据层级独立

- P-1..P-8/P-15 证据只证明编排 fs 路径；P-9 只证明 Git 路径；P-10 只证明 convener preflight；P-11 只证明运行时核心 schema/工具形状；P-12 只证明桌面宿主绑定；P-13 只证明多 draft 集成；P-14/AC-13 只证明回归。
- 所有证据索引标注候选 HEAD/聚合/manifest；不同层级/不同候选/不同环境的证据不得拼接；真实运行证据（§5）单独层级，不得反向替代确定性测试。

## 5. 真实运行标准（RR-1..RR-8；对应 P1.1 §4.2 RR6-A/B/C/D）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| RR-1 | **真实环境与隔离**：真实 Electron（本候选 worktree `app/main.ts`）+ 真实模型 + 真实 UI；隔离 `--userData`（仓库外专用路径，不写全局 `%APPDATA%/Electron`）；CDP **仅 9223**；**9222 全程零监听/零占用**；目标 = **现有贪吃蛇 target** `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target`（未复制、未改 init-source 路由）；运行根仓库外；记录候选 HEAD/聚合、入口、provider 配置、userData、target、端口、模型名。 | 未取证 |
| RR-2 | **预算与纪律（协调方书面预批）**：客户消息 **1**（仅合法客户决策时 +1）；卡片 ≤**4**；应用层派发 ≤**8**；chief 回合 ≤**8**；convener 回合 ≤**3**；product/impl 各 ≤**4**；其它角色各 ≤**2**；Git 能力调用 ≤**4**；墙钟 ≤**45 分钟**；**首个决定性结果即停**；**不自动重试**；**不触碰其它实例（9222）**。预算来自协调方书面消息预批；仓库内无独立记录，**RR6-D 证据须绑定/引用该书面记录原文**（S5-2）。RR5 观测到的应用/首席回环重投（重复提案卡 `req-5a9f23a5034b45eb`、同任务重投）须计入预算与判读（首果即停、不自动重试口径不变）；驱动 0 重试不得被误报为成功。 | 未取证 |
| RR-3 | **预期分支（派发记录须预先写明）**：B1 写盘时只读实测现 target `.ans/trunk/` 仅有 `initialization-sources/` 与 `snapshots/`，**无 `manifest.json`**（RR5 同态）⇒ **RR6 的第一个决定性结果几乎必然是 RR6-B**（`trunk-unavailable`/`plan-basis-incomplete`）；happy path（登记成功 + 派生值 + 绑定 run）由 P-1/P-9/P-13 确定性覆盖。**不得**为触发 RR6-A 临时 bootstrap trunk（属升 T3 触发器，§0.2-3/BASE-7）。 | 未取证 |
| RR-4 | **RR6-A（happy path；确定性覆盖为主）**：若前置齐备（规范路径 + effective trunk），convener 调用 `complete_team_plan` 时**不需要也不伪造** `baseDigest`/`plan.sha256`；登记成功且回执含应用派生 `planRef.sha256` 与 `source.runId`（= 本任务 run），随后流程继续（任命卡或下一门）。现 target 下真实运行未触发时，须如实标注「真实运行未触发」，以 P-1/P-9/P-13 确定性证据覆盖；**不得宣称真实运行已证明**。若为触发 A 而 bootstrap ⇒ 停止升级，本 B1 不适用该真实运行。 | 未取证 |
| RR-5 | **RR6-B（主预期/如实下一门）**：若停在明确下一门，必须原件记录并归类：`plan-path-invalid`（路径/格式 → 文档格式责任；chief 任务文本应写明规范路径）、`trunk-unavailable`/`plan-basis-incomplete`（无 effective trunk publication → P1.1 §2.9 前置）、任命卡被拒（`appointment` 仅人事（nominator）可发——RR5 chief 任务文本要求 convener 发任命卡，属流程文本问题 Q7）。**不得**把下一门判为本变更失败，也不得宣称已过；RR6-B 与 P-1/P-9/P-13 分层独立。 | 未取证 |
| RR-6 | **RR6-C（fail-closed 观察，若可触发）**：模型若仍自报错误 `baseDigest`/`sha256`/`runId`，回执必须是既有稳定 code（`plan-base-conflict`/`plan-hash-drift`/`plan-run-conflict` 等断言拒绝），不得被接受；按 service/preflight/Git 层核对回执 `baseDigest` 分层（Q10/S3），不做跨层「回执不一致」误判。若预算内无法真实触发，以 P-2/P-3/P-7/P-12 确定性覆盖并如实标注。 | 未取证 |
| RR-7 | **RR6-D（预算/隔离/证据）**：按 §5 RR-2 预算执行；9222 零改动（运行前后进程/端口/目标关键文件 hash 对照）、9223 结束释放（无 LISTENING、无 Electron 残留）；证据原件（诊断/账本/run manifest/回执/截图/驱动日志）绑定候选身份与逐文件 SHA-256；模型名如实记录（RR5 实测 `deepseek-v4-flash`，非 Anthropic Claude；RR6 不得宣称 Claude）；运行未写仓库产品/测试/角色卡/其它文档。 | 未取证 |
| RR-8 | **如实性**：不伪造游戏产物/任命/成功；下一门、失败、回退、预算偏差（如门后继续运行）如实报告；不拼接 RR5 或其它候选证据；RR6 只承诺本次候选/环境/输入下的证据，不宣称完整闭环/长期稳定性/发布。 | 未取证 |

## 6. 证据与检查要求（EV1–EV7）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| EV1 | 基线/顺序/候选：BASE-1–BASE-8；judge 冻结后重取基线；提案卡修复已提交；串行/单写者记录；候选只含写集；聚合/manifest/树稳定；H1 delta=0；T2/升级记录。 | 未取证 |
| EV2 | 派生/断言/fail-closed：AC-1–AC-3、AC-12；P-1–P-5、P-15；payload 形态（旧式显式/缺省值）与来源选择 (i)/(ii)/(iii) 分列；负例无副作用；无伪造摘要。 | 未取证 |
| EV3 | 兼容/重放/Git：AC-4–AC-5；P-6–P-9；`team-plan:<digest>` 字节锚点；NoOp/journal/marker 可复算；prepared input 原样；Git store 绑定 fail-closed；P-9 红因隔离。 | 未取证 |
| EV4 | 宿主绑定/集成：AC-6–AC-7；P-7/P-12/P-13；真实回合/handle/busy/abort 校验；`inspectAssignedTask` 直通码；`source.runId`；多 draft 不阻塞；`run-ambiguous` 不变；CLI 无工具回归。 | 未取证 |
| EV5 | 契约/前置/路径/归属：AC-8–AC-11；P-10/P-11；schema 形状；preflight 可选字段；非规范路径仍拒；H1 delta=0；团队计划归属不变。 | 未取证 |
| EV6 | 回归/静态：AC-13；P-14；受影响套件 before/after 计数与失败/skip 集合 diff；旧断言改写逐条；`npm run typecheck` exit 0；无新增确定性失败/新 skip。 | 未取证 |
| EV7 | 真实运行：RR-1–RR-8；预算/纪律/隔离/证据/如实性；9222 零改动与 9223 释放证明；RR6-A/B/C/D 分支记录；模型名如实。 | 未取证 |

## 7. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前最终候选上全部适用项有完整、可复算原始证据；`baseDigest`/`plan.sha256` 由应用从 effective trunk digest/实际字节派生，模型值可选且不符即拒（既有 code/文案）；无 effective trunk/不可读/漂移/结构非法全部 fail-closed 且无副作用；旧调用正确值 `team-plan:<digest>`/journal/marker/target/NoOp 逐字等价；缺省重放与 Git prepare→commit 重放命中先序回执、payload 形态变化 `plan-operation-conflict`、删除后旧式重放逐字不变；宿主绑定从真实受派任务注入 run，turn/handle/busy/abort 校验与码分层正确，`source.runId` 记录，多 draft 不阻塞且 `run-ambiguous` 语义不变，CLI 无回归；路径/版本校验零放宽且非规范路径仍拒；公共契约为加法可选、工具形状符合 schema；团队计划归属/角色职责/角色卡/边界零变更；受影响套件按 BASE-3 无新增确定性失败/新 skip、已知红不恶化、typecheck exit 0；RR6 按预算/隔离执行并如实记录分支（RR6-A 未真实触发时以 P-1/P-9/P-13 确定性覆盖并标注，不冒充真实运行）。
- **fail**：改角色卡/边界/职责/团队计划归属/路径校验/run 生命周期/marker/`classify-shell`；自动 bootstrap 或从 live 构造 effective digest；接受未与真实字节/宿主绑定核对相等的模型值；伪造 `baseDigest`/`sha256`/`runId`/证据/回执/客户同意；破坏 `team-plan:<digest>` 字节锚点、journal/marker/NoOp 或旧调用兼容；缺省 payload 重放被 `plan-operation-conflict`/`plan-base-conflict` 误拒；宿主绑定取错 run、绕过 turn/handle/busy/abort 校验或接受模型自报 run；多 draft 被误判冲突/自动关闭旧 run；`run-ambiguous` 语义被改；非规范路径被放宽；公共契约 breaking/新数据模型未停止升级；删除/弱化既有 fail-closed 断言、新增 skip/force-exit、新增确定性失败或已知红恶化；改 `optional-acceptance` 或写集外文件；无证据宣称成功；RR6 占用 9222/触碰其它实例/触发 bootstrap/伪造结果。
- **insufficient evidence**：缺基线/顺序/候选/hash/聚合/manifest；缺 payload 形态/来源选择 (i)/(ii)/(iii)/四变体证据；缺 `team-plan:<digest>` 字节锚点或 marker/journal 复算；缺宿主绑定回合/task/inspect/回执/`source.runId` 证据；缺多 draft/`run-ambiguous` 只读对照；缺 schema/preflight 形状证据；缺路径负例；缺旧断言改写记录；缺 before/after 计数与失败/skip 集合 diff/隔离复跑；缺 typecheck；缺 RR6 环境/预算/证据或分支归类；RR6-A 未真实触发且无 P-1/P-9/P-13 确定性覆盖；缺 9222 零改动/9223 释放证明；候选/环境/命令任一变化未重取。
- **not applicable**：仅限有明确依据者（如 renderer 视觉目标：本变更不改 `app/renderer/**`；CLI 真实运行：本变更不注入 CLI 工具，Q8 以回归证明）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以退出 0/自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不得拼接旧候选/旧证据/不同环境/其它 B1 证据；B2 只对同一最终候选判定，不授权提交/推送/合并/发布。

## 8. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；P1.1/复核/缺陷/RR5/并行变更引用与哈希在案；Q1/Q4/Q6/Q7 条件标注 | — |
| 实施前置 | BASE-1/2/7：judge 冻结/B2 或合入、提案卡修复已提交、串行/单写者窗口确认、T2 档位确认；否则不进入实施 | 等 judge/协调裁决；补基线/次序记录 |
| 实施（运行时核心） | W1/W2/T4；AC-9/P-11；加法可选、非 breaking；typecheck 相关通过 | 回 owner；breaking/新数据模型即停止升级 T3 |
| 实施（编排） | W3/W4/T1/T2/T6；AC-1–AC-5/AC-12/P-1–P-9/P-13/P-15；派生/断言/重放/fail-closed/兼容证据齐备 | 回 owner；越界即停止转普通流程/T3 |
| 实施（convener-code） | W5/T3；AC-8/AC-10/P-10；路径/版本/未知键规则逐字不变；旧断言改写记录 | 回 owner |
| 实施（桌面窗口） | W6/T5；AC-6/AC-7/P-12；真实回合校验/绑定/码分层；CLI 无回归 | 回 owner |
| 确定性验证 | P-1–P-15、EV2–EV6；受影响套件 before/after；旧断言改写；typecheck exit 0；无新增确定性失败/新 skip | 回相应 owner；不得单方判过 |
| 真实运行 | RR-1–RR-8 预算/纪律/隔离/证据完成并如实报告分支（RR6-A/B/C/D） | 不进入 B2 pass；按证据不足/返工处理 |
| B2 | 同一独立验收身份按本 B1 全部适用项判定；候选/证据链齐备；披露充分 | 报告 pass/fail/insufficient；不授权发布 |

**复判规则**：本 B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响（沿用 v1.x 惯例）；候选/基线/公共契约/写集/依赖/夹具/构建/命令/环境变化使证据失效并重取；证据复用须证明候选关联且输入/依赖/契约/命令/环境未变；judge/文档格式/提案卡修复或其它 B1 证据不得冒充本候选当前证据；提交/推送/合并/发布/tag 未授权。

## 9. 残余/待确认（Q1/Q4/Q6/Q7、N1–N4 与其它条件）

| 项 | 本 B1 的处置/条件 |
| --- | --- |
| Q1（T2/T3 判定） | 默认 **T2**（P1.1 §5.1；协调方已批准按 change）。若协调方按「凡改 Model 公共工具契约即 T3」口径裁定 T3，则按 T3 执行全量回归（§4.2），AC 与判据不变；档位不由实施/验收自行下调。 |
| Q4（runId 是否进 marker） | 默认**只写入 `source.runId` 与回执，marker 不变** ⇒ `classify-shell.ts` 零改动。若协调方要求进 marker，须门禁引擎 owner 同步改 `git-policy-plan-marker` 期望、写集扩层并重评档位；本 B1 按默认判定，非默认分支不适用本 B1。 |
| Q6（bootstrap publication） | 本变更**不放宽、不自动 bootstrap**（§0.2-3；P1.1 §2.9）。是否把 VCA `baseTrunk:null`+`bootstrap:true` 纳入真实流程由协调方另行决策（可能另立变更）；RR6-B 如实停在该门。 |
| Q7（任命卡流程文本） | `cardKind=appointment` 仅人事（nominator）可发（`run-role.ts:1294-1310`）；RR5 chief 要求 convener 发任命卡属流程文本问题，非应用缺陷；RR6 若在此停，如实记录为下一门；由统筹/沟通在任务文本中改为 nominator 发起。 |
| Q5（convener 卡文本偏差） | 卡文本第 62 行（"提交版本化团队计划及 path/hash/version、flowId、当前依据摘要"）与新契约存在文案偏差；按客户「不改角色卡」裁定**本变更不修改**，以工具描述为执行口径；如需同步走后续角色卡维护流程。 |
| Q8（CLI 回归面） | `completeTeamPlan` 仅 `app/desktop/session.ts:4319` 注入；CLI/一次性运行不注入 ⇒ 无工具回归；未来 CLI 需要须另行设计，不得绕过绑定。 |
| Q9（plan.version 派生） | **不**派生：版本是角色声明（决定 v1/v2 与路径一致性），沿用既有路径/版本校验。 |
| Q10/S3（失败回执 baseDigest 分层） | service 层 effective 读取成功后回显实际 digest；读取前失败回显 `input.baseDigest ?? null`；preflight/Git 身份层只能回显 `request.baseDigest ?? null`；跨层差异允许，不视为不一致；`DirectActionReceipt.baseDigest` 允许 null。 |
| S2（host-local 码登记） | `plan-flow-conflict`/`plan-task-unavailable`/`plan-task-changed` 沿用 `run-change-source-*` 先例作为 host-local 码，不登记共享稳定码；`plan-run-conflict` 复用 service 既有码；inspect 失败直通 `trunk-item-invalid`。若协调方要求登记为共享稳定码，另评（P1.1 §7-1/S2），不阻断默认方案。 |
| N1（canonicalJson 引用更正） | P1.1 §2.3 将 `canonicalJson` 指到 `report-provenance.ts:7`；实际 `directHash` 使用的是 `src/service/trunk/impl/trunk-common.ts:12-17`（按键排序、丢弃 `undefined`）。语义结论不变；实施/证据按实际代码（本 B1 AC-5 已更正）。 |
| N2（P-9 已知红实施期提醒） | P-9 落在 `test/编排/git-capabilities.test.ts`（`:514` 既有红、`:33` 2 skip）；B2/实施先在同基线复现/定位红因，再决定 P-9 用例范围与隔离；不得以既有红项作为 pass 证据，不得改写红项求绿。 |
| N3（plan-hash-drift 文案拆分） | 旧文案仅存在于 `apply-journal.ts:2896` 一处、无测试断言；新增「Plan bytes are unreadable or absent from the effective snapshot」文案；若 B1/实施新增文案断言，按新文案逐条记录；行为与 code 不变。 |
| N4（P1.1 标题文案） | P1.1 文件标题第 1 行仍为「方案（P1.0）」与页眉/§5.1/版本记录的 P1.1 不一致；一行文案，不影响 B1/实施/验收。 |
| 其它-1 | judge 实现冻结/合并时点决定本变更实施基线；文档格式变更排序由协调方定（默认 judge → 本变更 → 文档格式）。 |
| 其它-2 | RR6 的 chief 任务文本必须包含规范团队计划路径（`docs/scheduling/<flowId>-team-v<N>.md`），否则路径门会掩盖本变更效果（文档格式责任，§5 RR-5）。 |
| 其它-3 | RR6-D 预算证据须绑定协调方书面预批记录（S5-2）；仓库内无独立预算记录。 |

## 10. 范围限制与披露

1. **模型（如实）**：RR5 会话原生记录 `message.model` 实测为 **`deepseek-v4-flash`**（.env 配置；非 Anthropic Claude）。本 B1 按 RR5 实测记录；RR6 证据须如实记录实际模型，不得宣称 Claude。
2. **既有 judge 工具面问题**：RR5 提案卡执行期 `chief-decision.failed`（`phase=execution`）为既有问题（RR4/S1 已记录），**不属本门**；judge 变更另案在飞（BASE-1/BASE-2 串行引用）。
3. **无 effective trunk（如实）**：RR5 目标与 B1 写盘时现 target 均无 `.ans/trunk/manifest.json`；本变更不放宽、不 bootstrap；RR6 的第一个决定性结果几乎必然是 RR6-B（`trunk-unavailable`/`plan-basis-incomplete`）；happy path 由 P-1/P-9/P-13 确定性覆盖，不得临时 bootstrap 或宣称真实运行已过 A。
4. **RR5 应用/首席回环**：RR5 记录 §5.3/§6.5/§10-3 的重复提案卡（`req-5a9f23a5034b45eb`，同 taskId）与同任务重投、convener 二次 blocked，均为应用/回环行为（驱动 0 重试）；RR6 预算/判读须计入该既有现象（首果即停、不自动重试口径不变）。
5. **路径/格式**：RR5 的 `plan-path-invalid` 是正确校验，本变更不修；规范路径/格式归文档格式变更（`886fef84…`/`bec45edf…`），本 B1 只读引用。
6. **基线时点**：本 B1 写盘时 worktree 携带 judge 25 文件未提交实现（HEAD `fb1aa39e` + 在飞集）；本 B1 未依赖、未修改这些文件；实施必须在 judge 冻结/B2 后按 BASE-1 重取基线，行号漂移以符号锚点为准。
7. **未运行任何真实模型/测试/Electron**：本 B1 的代码行为均来自只读核对与 P1.1/复核记录；全部条目 `未取证`。
8. **本 B1 写盘限制**：只写 `docs/acceptance/`；未改代码/方案/测试/角色卡/边界/其它文档；未提交/推送/合并/发布；不授权实施。

## 11. 当前状态

- **B1 v1 完成、冻结；v1.1 窄修订完成；v1.2 窄修订完成（实施前）**；BASE-1–BASE-8、AC-1–AC-13、P-1–P-15、RR-1–RR-8、EV1–EV7 当前全部 `未取证`，不得判 pass。
- 实施前置（v1.1 时点）：judge 已于 `24799cb` 合入，judge 冻结/B2 条件已满足；本变更从该基线实施（运行时核心批次 W1/W2/T4 在飞 3 文件）；Q1/Q4/Q6/Q7 与 S2 需协调方按 §9 确认（默认处置已在案）；文档格式变更仍按 BASE-2 在其后串行。
- **v1.1 修订时点（2026-11-09）**：本修订只补 T7 写集与 §4.3 记录，不判任何条目；其余批次与 B2 仍按本 B1（BASE-1–BASE-8、AC-1–AC-13、P-1–P-15、RR-1–RR-8、EV1–EV7）执行。
- **v1.2 修订时点（2026-11-09）**：convener-code 批次 W5/T3 在飞（含 T8/T9 两测试支撑文件）；`角色卡/convener-code/api-spec.md` 不纳入写集、须回退（附录 B）；本修订不判任何条目；其余批次与 B2 仍按本 B1 执行。
- 后续由**同一独立验收身份**在实施/确定性测试/真实运行证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并；不授权提交/推送/合并/发布。
- 本 B1 不修改其它 B1/在飞变更；发布/tag 不在授权内。

---

## 附录 A（v1.1，2026-11-09）：实施期机械写集补充

- **修订性质**：v1.1 = v1 正文原样 + 本次窄修订；**不改** AC-1–AC-13、P-1–P-15、RR-1–RR-8、EV1–EV7、§7 判定规则与 §8 阶段出口；只增补 §2.1 的 T7 写集行与 §4.3 的旧/新记录。全部条目仍 `未取证`，本修订不构成任何 pass。
- **修订理由（实测）**：W1 将 `CompleteTeamPlanInput.baseDigest` 改为可选后，`test/编排/fixtures/git-action-authorization-wiring.ts` 的 `holdableCompleteTeamPlan()` 返回 `baseDigest: input.baseDigest`（`string | undefined`），不满足 `CompleteTeamPlanFn` 的 `DirectActionReceipt.baseDigest: string | null`；`npm run typecheck` 报 TS2322（`after-typecheck.log:26`，错误位置 `test/编排/fixtures/git-action-authorization-wiring.ts(163,76)`）。修复只能是该行 `?? null`（与 P1.1 G2 同族），不改断言/行为/公共契约。
- **写集/边界**：文件在 `test/编排/` 授权目录（`角色卡/编排/boundary.yaml:83`），owner 编排；无 H1、无角色卡/边界/职责变更；不属于 T3 触发器（非 run 生命周期/marker/classify-shell/公共契约 breaking/新数据模型）。
- **证据**：基线 `24799cb61239272e8603018adc094881bb6263dd`；修订时点 W1/W2/T4 在飞 3 文件（`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/submit-capability-tools.test.ts`；此后 W5 等批次继续推进，状态以 BASE-1/候选记录为准）；`after-typecheck.log` **33 行 / 5,165 bytes / `9c5d7eedfdee5866c1c43029ad9aedcf24b9ec1ec1271d5977367953ca678127`**；同日志 `apply-journal.ts:2858/2861/2863` 错误为 B1 W3 已列机械触点（编排批次待实施），不属写集外。
- **影响**：不改变任何 AC/P/RR/EV 判据或判定规则；只把该 fixture 纳入 §2.1 允许写集，避免 B2 按写集外 diff=0 误判 fail。若实施发现更多同类机械触点，须按本附录同口径记录/递增版本，不得静默扩展写集。

---

## 附录 B（v1.2，2026-11-09）：convener-code 批次机械写集补充与 api-spec 否决

- **修订性质**：v1.2 = v1.1 + 本次窄修订；**不改** AC-1–AC-13、P-1–P-15、RR-1–RR-8、EV1–EV7、§7 判定规则与 §8 阶段出口；只增补 §2.1 的 T8/T9 写集行与 §4.3 的旧/新记录，并明确否决 `角色卡/convener-code/api-spec.md`。全部条目仍 `未取证`，本修订不构成任何 pass。
- **修订理由（W5/T3 机械触点）**：W5 将 convener preflight 的 `baseDigest`/`plan.sha256` 放宽为可缺省后，`test/roles/convener/oracle-fixture.ts` 与 `test/roles/convener/convener-differential.test.ts` 中按旧契约冻结的金样/差分期望必须同步（否则 `test/roles/convener/**` 产生新的确定性失败）。改动仅为契约同步：oracle 金样「plan 缺 sha256」由 known-delta deny 改为 allow，`KNOWN_DELTAS` 2→1、`preflightKnownDeltas` 3→2、`payloadSha256` 重算；differential 期望 allowed 3→4/compared 10→11/knownDelta 2→1。**不弱化 Service fail-closed**（`plan-base-conflict`/`plan-hash-drift`/CAS/结构校验仍在 Service）；不删除/弱化其它断言。
- **api-spec 否决（应回退）**：`角色卡/convener-code/api-spec.md` 虽在 convener-code boundary §1 内且改动为契约描述同步，但 P1.1 §3.2 明确「不改任何 `角色卡/**`」（H1 delta=0），B1 §0.2-1 亦不允许角色卡/角色职责/边界变更；该文件不在已批准的 §2.1 写集内。**结论：api-spec 应回退到基线 `20e6336d…`；不得出现在本变更候选。** 其与实现后的契约描述偏差按 Q5 同口径处置（以工具描述为执行口径）；如需同步，须协调方/方案修订批准后另版纳入。
- **写集/边界**：T8/T9 在 `test/roles/convener/` 授权目录（`角色卡/convener-code/boundary.yaml:11`），owner convener-code；无 H1、无角色卡/边界/职责变更；不属于 T3 触发器（非 run 生命周期/marker/classify-shell/公共契约 breaking/新数据模型）。
- **证据（实测/实现侧报告）**：HEAD `24799cb61239272e8603018adc094881bb6263dd`；T8 文件 `998f372f…` → `b7c7f2e8e543c9054e8864be22ede705d4c2d8e4b33e08594a94bcfeeb589528`；T9 文件 `53a9b94a…` → `f46f7bd308620a8a934b04263c231ca6c53788326b7c2f649a13defbc4f24172`；api-spec 基线 `20e6336d…`（工作树 `874a18cf…` 应回退）。本修订独立复跑 `test/roles/convener/convener-module.test.ts` + `test/roles/convener/convener-differential.test.ts` = **32/32 pass、0 fail/0 skip**（2026-11-09，修订时点；B2 仍须在最终候选上重测）；typecheck 剩余 8 条均为 W3/W4/T7 已列触点（实现侧报告；B2 重测）。
- **影响**：不改变任何 AC/P/RR/EV 判据或判定规则；B2 对 T8/T9 按 §4.3 记录核对，对 api-spec 按 diff=0（回退后）核对；若实施发现更多同类机械触点，须按本附录同口径记录/递增版本，不得静默扩展写集。
