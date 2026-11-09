# 团队计划：团队计划登记 run 绑定 / baseDigest 合法来源（T2，2026-11-09）

- **任务 ID**：`2026-11-09-team-plan-run-binding`
- **产品 flowId（拟）**：`team-plan-run-binding`（真实运行沿用贪吃蛇 flow，不新增产品 flow）
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-09
- **状态**：团队计划已写盘。闸门 0 已由客户「做」确认（缺陷记录最终版 + 修正裁定）；闸门 1/2 按 2026-11-07 预授权/全权委托免逐次确认；实施待 judge 变更冻结/合入后按 BASE-1 重取基线放行。**未派发实施（本计划写盘后派发）。**
- **风险档位**：**T2（change；协调方已批准按 change 处理）**。Q1（T2/T3 口径）待协调方维持；若按「凡改 Model 公共工具契约即 T3」裁定，则按 T3 执行全量回归（AC 与判据不变），档位不得由实施/验收自行下调。
- **唯一实施基线（方案 P1.1）**：`docs/planning/2026-11-09_design_team-plan-run-binding.md`（438 行 / 60,802 bytes / SHA-256 `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b`；P1.0 `1d9bbaee…` 历史保留）。
- **独立复核**：`docs/planning/2026-11-09_review_team-plan-run-binding.md`（R1.0 + R1.1 追加后 279 行 / 46,262 bytes / `452f6437ac116d72b1bf5e8a03754cbf78026d8c81e30dc6691e348531d353d8`；**R1.1 结论：M1/G1/G2/S1–S6 全部闭合、无新增 must-fix、建议提交（可进入 B1/实施派发）**；余 N1–N4 建议不阻断）。
- **B1 v1（冻结，唯一判据）**：`docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（263 行 / 61,546 bytes / `eb94d7cbf9d8c2aaf32b4ebeda60f5e53d76d6d1b9944fdd7c1cd6f30da6b5ce`；BASE-1–8、AC-1–13、P-1–P-15、RR-1–8、EV1–7；全部 `未取证`）。
- **缺陷记录（最终版，含客户修正裁定）**：`docs/communication/2026-11-09_defect_team-plan-run-ambiguity.md`（40 行 / 4,669 bytes / `ae403883f8d5edb46b5a3b6c15aeb366c1fc663d92eb14ba0188e534fd9a13b3`）。裁定：**团队计划仍归运营（convener）撰写/登记**；不做职责/角色卡/边界变更；规范路径/格式并入「文档格式说明」变更；**run-ambiguity / baseDigest 合法来源由应用侧解决**。
- **RR5 证据（只读引用）**：`角色卡/测试/docs/change/2026-11-09_RR5_snake-restore-proposal-flow.md`（201 行 / 27,140 bytes / `af8f200865742cc63f94e203b8e22442bc9d60ea32482094d44497a7e85f3a1a`）+ `2026-11-09_RR5_evidence/`。
- **基线（写本计划时实测）**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `fb1aa39e787934f334b9c164e4221074f97f6147`（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`；提案卡修复已提交）；**工作树携带 judge 25 文件未提交实现（B2 pass `07dd2da3…`，提交/合并待协调方/客户）**。**当前工作树不得作为本变更实施基线；实施须在 judge 冻结/合入后按 BASE-1 重取。**
- **串行次序（P1.1 §3.3；协调方裁决为准）**：judge → **本变更** → 文档格式。`src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/model/runtime.ts`、`app/desktop/session.ts` 单写者；本变更避开 `test/桌面应用/session.test.ts`（用 `test/桌面应用/chief-workflow.test.ts`）。

---

## 一、任务（按 P1.1，不扩大）

1. **应用侧派生/校验**：`complete_team_plan` 的 `baseDigest` = effective trunk manifest digest（`readEffectiveSnapshot`），`plan.sha256` = 计划文件实际字节 SHA-256；模型值改为**可选断言**（给了必须严格相等，否则既有稳定 code 拒绝）；未知/不可读/漂移/无 effective trunk 一律 fail-closed。
2. **宿主 run 绑定**：桌面新增 `SessionManager.completeTeamPlanForHandle`，从当前真实受派回合的真实任务（`inspectAssignedTask`）注入 `runId`；模型自报仅断言；绑定值记入既有 `DirectActionSource.runId` 与回执；**marker 不变**（不写 runId）。
3. **兼容/重放**：旧式完整正确 payload 逐字等价（`team-plan:<digest>` 字节锚点）；缺省 payload 与 Git prepare→commit 重放语义按 M1 裁决（P-8 四变体）；NoOp/journal/marker 等价；审计不伪造。
4. **不变项**：路径/版本/roster/modules/`parseTeamPlan`/owner/writeset 校验逐字保留；`project_state`/`version-decision` 的 `run-ambiguous` 语义保留；团队计划仍归运营；不新增角色/边界。

## 二、五维判断与角色

| 维度 | 判断 |
| --- | --- |
| 责任独立性 | 保留现有角色，无新增/拆分/合并：运行时核心（model/schema）、编排（apply-journal/trunk-runtime）、convener-code（preflight 纯策略）、桌面窗口（宿主绑定）、测试；无角色职责变更（客户裁定）。 |
| 范围归属 | 全部路径在既有 Section 1；**H1 delta = 0**；不改角色卡/边界/roster/卡文本；不新增目录/角色/工具/卡种。 |
| 契约影响 | 有：`CompleteTeamPlanInput`/工具 schema **加法可选（non-breaking）**；不改数据模型/`RunManifest`/marker/`classify-shell`；若实施发现 breaking 或需新数据模型 ⇒ 停止升级 T3。 |
| 证据独立性 | 各 owner 模块测试；L1–L6 分层（运行时核心契约/编排 fs/编排 Git/convener preflight/桌面绑定/真实运行）；B2 独立验收；统筹不判。 |
| 协调成本 | 中：与 judge 同文件串行、与文档格式同文件串行；单写者；T2 全量受影响回归。 |

## 三、写集与 owner（按 P1.1 §3.1 / B1 §2.1；零重叠）

| # | 文件 | Owner（单一） | 用途 |
| --- | --- | --- | --- |
| W1 | `src/model/runtime.ts` | 运行时核心 | `CompleteTeamPlanInput` 可选化（`baseDigest?`、`plan.sha256?`）+ 注释（应用派生；声明值仅断言；`runId` 由宿主绑定）；**只改该区域**（judge/文档格式区域不得混入本候选 diff） |
| W2 | `src/provider/runtime/schema.ts` | 运行时核心 | `complete_team_plan` schema/描述：`required` 缩减为 `["operationId","flowId","plan"]`，plan required `["path","version"]`，`baseDigest`/`sha256` 可选但保留 64 hex 形状；描述写明应用派生与勿猜 |
| W3 | `src/service/trunk/impl/apply-journal.ts` | 编排 | `completeTeamPlanInternal` 派生/断言（严格相等）；`resolved` 仅 marker/target/回执/commit 断言（M1）；`:2863` 形状可选 + `:2858/:2861/:1244` 的 `baseDigest ?? null`（G2）；`source.runId` 记录 |
| W4 | `src/pipeline/orchestration/trunk-runtime.ts` | 编排 | `convenerTeamPlanFacts` 缺省字段投影；`:476-477/:498-499/:824-825/:836-837` 回显 `baseDigest ?? null`；`:626-627` 注释同步（G2） |
| W5 | `src/common/roles/convener/index.ts` | convener-code | `checkTeamPlan` 可选字段放宽（路径/版本/未知键规则逐字保留；卡文本不改） |
| W6 | `app/desktop/session.ts` | 桌面窗口 | `completeTeamPlanForHandle` 宿主 run 绑定 + 接线（`:4319`、handle 建立处 `:4373` 同源）；仅 convener 注入 |
| T1 | `test/编排/direct-role-capabilities.test.ts` | 编排 | 派生/断言/兼容/NoOp/run 断言/重放（P-1–P-8、P-15；既有 `:411-431` 含 `:427-428` 原样保留） |
| T2 | `test/编排/git-capabilities.test.ts` | 编排 | Git prepare→commit 派生路径（P-9；既有「Git team plan publication…」`:514` 为基线已知红，按增量口径，不得作为 pass 证据） |
| T3 | `test/roles/convener/convener-module.test.ts` | convener-code | preflight 可选字段/路径规则（P-10；`:394-399` 旧断言按 B1 §4.3 改写记录） |
| T4 | `test/runtime-core/submit-capability-tools.test.ts` | 运行时核心 | schema 形状（P-11） |
| T5 | `test/桌面应用/chief-workflow.test.ts` | 桌面窗口 | 宿主绑定（P-12；**避开不存在的 `session.test.ts`**） |
| T6 | `test/编排/convener-module-consumption.test.ts` | 编排 | 多 draft/run-ambiguous 登记成功（P-13）、facts 投影 |

- **写集外 diff = 0**：judge 写集、文档格式写集、提案卡修复文件、`classify-shell.ts`、`run-manifest.ts`、`parseTeamPlan`、路径校验、`app/renderer/**`、角色卡/边界/`optional-acceptance.test.ts` 均不得改；无新依赖/新目录/构建发布配置。
- **零重叠**：产品文件按 boundary 唯一 owner；测试目录按 owner 不重叠；无 H1。
- **旧断言改写逐条记录**（B1 §4.3）：至少 `test/roles/convener/convener-module.test.ts:394-399`（缺 `baseDigest` 由拒绝改允许）+ 新增 `{path,version}` 正例；`:403` 63 位拒绝不变；`convener-module-consumption.test.ts:265-270` 增「缺省不投影/不造键」；`submit-capability-tools.test.ts:327` 旧形状保留 + 新增省略形状正例。不得静默放宽 fail-closed 断言。

## 四、阶段计划

| 节点 | 内容 | 前置 |
| --- | --- | --- |
| G2 | 沟通留痕本计划 + P1.1 + R1.1 + B1（预授权） | 本计划写盘 |
| 基线重取（BASE-1/2） | judge 冻结/合入后重取 HEAD/tree/status/聚合；确认单写者窗口；重取受影响套件 before 计数/失败名集合 | judge B2 pass `07dd2da3…` + 提交/合入（待协调方/客户）；本计划 |
| W1–W2 运行时核心 | `CompleteTeamPlanInput` 可选化、schema/描述、形状测试 | 基线重取 |
| W3–W4 编排 | 派生/断言/重放/fail-closed/兼容；Git prepare→commit；facts 投影；机械触点 | W1–W2 |
| W5 convener-code | preflight 可选字段；路径/版本/未知键不变；旧断言改写 | W1–W2 |
| W6 桌面窗口 | `completeTeamPlanForHandle` 绑定 + 接线；host-local 码分层 | W3–W4 |
| D1 | 受影响套件 before/after + 失败/skip 集合 diff + typecheck；P-1–P-15；已知红不恶化 | W1–W6 |
| RR6 | 现有贪吃蛇 target、隔离 userData、CDP 9223；预算按预批；预期 RR6-B（无 effective trunk）；首果即停/不重试 | D1 |
| E3 | 按 T2 受影响全量回归（若 Q1 裁 T3 则全量 T3）；参照 D1/基线已知红 | RR6 |
| E3-B | 变更包（候选/证据/披露/契约变更） | E3 |
| B2 | 同一独立验收按 B1 `eb94d7cb…` 判定 | E3-B |

## 五、验收与证据（要点）

- **候选身份**：`src app test` 逐文件 raw SHA-256 + 可复算聚合（`path + "\0" + sha256`，按路径排序后 SHA-256）+ manifest；只含 W1–W6/T1–T6；写集外 diff 0；稳定性前后快照。
- **B1 判据**：BASE-1–8、AC-1–13、P-1–P-15、RR-1–8、EV1–7；旧断言改写逐条；known-red 口径（新增确定性失败=0、新 skip=0、同名不恶化）。
- **确定性分层**：L1 schema/工具形状；L2 编排派生/断言/fail-closed/重放；L3 Git prepare→commit；L4 convener preflight；L5 桌面宿主绑定/多 draft；L6 RR6。低层不替代真实运行，反之亦然。
- **真实运行 RR6**：
  - 环境：真实 Electron（本候选 worktree `app/main.ts`）+ 真实模型 + 真实 UI；隔离 `--userData`（仓库外）；CDP **仅 9223**；**9222 全程零监听/零占用**；目标 = **现有贪吃蛇 target** `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target`（未复制、未改 init-source 路由）；运行根仓库外。
  - 预算（协调方书面预批，RR6-D 须绑定原文）：客户消息 **1**（仅合法客户决策 +1）；卡 ≤4；派发 ≤8；chief ≤8；convener ≤3；product/impl 各 ≤4；其它角色 ≤2；Git ≤4；墙钟 ≤45 分钟；首果即停；不自动重试；不触碰其它实例。
  - 目标链条：提案 → 团队计划 → 任命 → 实现 → 出游戏**或下一门**。
  - **预期分支（S5-1）**：现 target `.ans/trunk/` 无 `manifest.json`（RR5 同态），故 **RR6 第一个决定性结果几乎必然是 RR6-B（`trunk-unavailable`/`plan-basis-incomplete`）**；happy path（登记成功 + 派生值 + 绑定 run）由 P-1/P-9/P-13 确定性覆盖。**不得**为触发 RR6-A 临时 bootstrap trunk（属升 T3 触发器）。
  - RR6-A（happy path，真实触发时）/ RR6-B（主预期/如实下一门）/ RR6-C（fail-closed 观察）/ RR6-D（预算/隔离/证据）按 B1 §5 记录；不得把下一门判为本变更失败，也不得宣称已过。
- **披露**：RR5 模型 `deepseek-v4-flash`（非 Anthropic Claude，RR6 须如实记录）；RR5 应用/首席回环（重复提案卡/同任务重投）计入预算与判读；路径/格式归文档格式变更；无 effective trunk 的下一门；judge 工具面问题另案。

## 六、协调项与默认处置（B1 §9）

1. **Q1（T2/T3）**：默认 T2；若协调方裁 T3，按 T3 全量回归，AC 不变。**实施前须确认**。
2. **Q4（runId 进 marker）**：默认只写 `source.runId` 与回执，marker 不变 ⇒ `classify-shell.ts` 零改动；非默认分支须门禁引擎 owner 参与并重评档位。
3. **Q6（bootstrap publication）**：本变更不放宽、不自动 bootstrap；是否纳入真实流程由协调方另决；RR6-B 如实停在该门。
4. **Q7（任命卡流程）**：`appointment` 仅 nominator 可发；RR6 若在此停，如实记录下一门；任务文本应由 nominator 发起。
5. **S2（host-local 码）**：`plan-flow-conflict`/`plan-task-unavailable`/`plan-task-changed` 沿用 `run-change-source-*` 先例，不登记共享稳定码；`plan-run-conflict` 复用 service 既有码；inspect 失败直通 `trunk-item-invalid`。
6. **N1–N4**：canonicalJson 引用按 `trunk-common.ts:12-18`（N1）；P-9 先复现/定位既有红（N2）；`plan-hash-drift` 文案拆分按 B1 记录（N3）；P1.1 标题文案（N4）不阻断。
7. **串行/单写者**：judge（已 B2 pass，未提交）→ 本变更 → 文档格式；`apply-journal.ts`/`trunk-runtime.ts`/`model/runtime.ts`/`session.ts` 同一时刻单写者；合并前互相 diff、后合并方 rebase 并重跑双方测试矩阵。
8. **提交/合并**：协调方按流程提交/推送/PR；**合并需客户逐 PR「允许我合并」**；发布/tag 未授权。

## 七、写盘边界与下一步

- 本计划只写 `docs/scheduling/`；不写产品/测试/角色卡/边界/验收判据；不判验收；不实施；不提交/推送/合并/发布。
- 下一步：协调方确认 Q1（及 Q4/Q6/Q7 默认处置）→ judge 冻结/合入后重取基线 → 派发 W1–W6/T1–T6 → D1 → RR6 → E3 → E3-B → B2。
