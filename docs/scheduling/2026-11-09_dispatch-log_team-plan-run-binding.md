# 派发记录：团队计划登记 run 绑定 / baseDigest 合法来源（T2，2026-11-09）

- **任务 ID**：`2026-11-09-team-plan-run-binding`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-09
- **基线（已冻结）**：`24799cb61239272e8603018adc094881bb6263dd`（judge 代批 T3 已提交并推送；PR #79 待客户逐 PR 允许合并）。worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；`git status --porcelain -- src app test` = 0。
- **依据**：团队计划 `docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md`（`48148836…`）；**B1 最新 v1.2（唯一判据）** `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（297 行 / 74,210 bytes / `0f528a0b9f80cb9c451985c2a3d37c25a51b7f1959910600ec54a93246303d1b`；v1.1 增 T7、v1.2 增 T8/T9 并否决 api-spec 纳入）；方案 P1.1 `2bb663fe…`；复核 R1.1 `452f6437…`。
- **协调方裁决（2026-11-09）**：Q1 维持 T2；Q4（runId 不进 marker）、Q6（不 bootstrap）、Q7（任命卡由 nominator 发）、S2（host-local 码不登记）按 B1 默认；judge 模型口径接受引擎级 pass（不重跑 Anthropic）；实施序：本变更实施 → D1 → RR6 → B2；随后文档格式实施 → D1 → RR → B2。

## 一、批次与单写者

| 批次 | Owner | 写集 | 前置 |
| --- | --- | --- | --- |
| B1 运行时核心 | 运行时核心 | W1 `src/model/runtime.ts`（`CompleteTeamPlanInput` 区域）、W2 `src/provider/runtime/schema.ts`、T4 `test/runtime-core/submit-capability-tools.test.ts` | 基线 `24799cb` |
| B2 编排 | 编排 | W3 `src/service/trunk/impl/apply-journal.ts`、W4 `src/pipeline/orchestration/trunk-runtime.ts`、T1 `test/编排/direct-role-capabilities.test.ts`、T2 `test/编排/git-capabilities.test.ts`、T6 `test/编排/convener-module-consumption.test.ts` | B1 |
| B3 convener-code | convener-code | W5 `src/common/roles/convener/index.ts`、T3 `test/roles/convener/convener-module.test.ts` | B1（可与 B2 并行，文件不重叠） |
| B4 桌面窗口 | 桌面窗口 | W6 `app/desktop/session.ts`、T5 `test/桌面应用/chief-workflow.test.ts` | B2（service/回执契约） |
| D1 | 测试 | 受影响套件 before/after、P-1–P-15、typecheck、旧断言记录 | B1–B4 |
| RR6 | 测试 | 现有贪吃蛇 target、隔离 userData、CDP 9223；预算按预批；预期 RR6-B | D1 |

- **单写者**：`apply-journal.ts`/`trunk-runtime.ts`/`model/runtime.ts`/`session.ts` 同一时刻仅一个 owner 编辑；B2/B3 可并行（不同文件），B4 在 B2 后；任何写集外文件 diff = 0。
- **纪律**：不改角色卡/边界/roster/卡文本；不改路径/版本/roster/modules/`parseTeamPlan`/marker/`classify-shell`；不 bootstrap trunk；不自动关闭旧 draft run；不新增依赖/目录；不提交/推送/合并/发布；不触碰贪吃蛇 9222/其运行根；真实运行仅 9223。
- **证据**：各 owner 写自身 `角色卡/<role>/docs/change/2026-11-09_W{n}_<role>_team-plan-run-binding.md`（含文件/sha256/测试/披露）；D1/RR6 由测试写记录。

## 二、放行与下一步

- 本记录写盘后按 B1→B2/B3→B4 派发；D1 通过后按 B1 RR-1–RR-8 执行 RR6；B2 由同一独立验收按 B1 `0f528a0b…`（v1.2）判定。
- 合并需客户逐 PR「允许我合并」；发布/tag 未授权。

## 三、实施状态（2026-11-09）

| 批次 | 状态 | 文件数 | 关键结果 |
| --- | --- | --- | --- |
| B1 运行时核心 | 完成 | 3 | W1/W2/T4；targeted 25/23/2（2 既有红）；typecheck 由 W1 后 9 条降为 0（随 W3/W4/T7 落地） |
| B2 编排 | 完成 | 6 | W3/W4/T1/T2/T6/T7；T1 47/46/1、T2 16/13/1/2（既有红/环境 skip）、T6 9/9；新增确定性失败 0/新 skip 0 |
| B3 convener-code | 完成 | 4 | W5/T3/T8/T9；32/32；B1 v1.2 否决 api-spec，已回退基线 `20e6336d…`（blob） |
| B4 桌面窗口 | 完成 | 2 | W6/T5；chief-workflow 66/54/12；W20 ENOTEMPTY 隔离复跑 2/2 pass；新增确定性失败 0/新 skip 0 |
| D1 | 完成 | — | 记录 `1b69a1bc…`；组合 15 文件聚合 `a80e93da…`、manifest `b06433b5…`；受影响套件 before/after 失败/skip 集合 diff 空；新增确定性失败 0/新 skip 0；typecheck exit 0；P-1–P-15 有证据锚点 |
| RR6 | 完成（未达团队计划门） | — | 记录 `7f672fb2…`（200 行 / 28,778 bytes）；停在更早的既有 `versioned-doc-overwrite` 文档冻结门（rapporteur 尝试原地更新已冻结提案 v1），**RR6-A/B/C 均未观测**；`complete_team_plan` 调用 0、回执 0；无 bootstrap；9222 零监听、9223 释放、贪吃蛇运行根 108 文件前后一致；预算 1 消息/1 卡/2 派发/2 chief/2 rapporteur/0 convener/0 product·impl/0 Git/≈4m20s；模型 `deepseek-v4-flash`（非 Anthropic） |
| RR6 修正轮 | 完成（RR6-B 已观测） | — | 记录 `3d69277e…`（222 行 / 32,167 bytes）；1 条客户消息 → chief 派 convener → 规范团队计划 `docs/scheduling/snake-game-team-v1.md` → `complete_team_plan({"flowId":"snake-game","operationId":"ctp-snake-team-v1-1","plan":{"path":"docs/scheduling/snake-game-team-v1.md","version":1}})`，**baseDigest/plan.sha256/runId 全省略** → 回执 `trunk-unavailable`/`effective-manifest-missing`（13:23:51.340Z）；`plan-path-invalid` 未出现；无 bootstrap；9222 零监听、9223 释放、贪吃蛇运行根 108 文件前后一致；预算 1 消息/0 卡/1 派发/1 chief 完成/0 convener 完成/0 product·impl/rapporteur 1 完成/0 Git/≈1m30s；模型 `deepseek-v4-flash`（非 Anthropic）；候选/manifest 前后不变 |
| B2 | 待执行 | — | 同一独立验收按 B1 v1.2 判定 15 文件候选 + D1 + RR6b |

- 组合候选当前 `src app test` = 15 个 M（3+6+4+2），无新增/删除；`api-spec` diff=0；写集外 tracked diff=0；`npm run typecheck` exit 0（批次记录）。
- B1 v1.1/v1.2 为实施期窄修订：T7 fixture 机械适配、T8/T9 convener 金样/差分同步、api-spec 否决回退；AC/P/RR/EV 与判定规则未变。
