# 意图确认：治理写卡推进的可重入性与 flow 收口

- 日期：2026-10-23
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认**（客户明确选择「先把这个治理推进去重漏洞作为独立变更修掉」）
- 关联项目：`C:\Users\51054\Desktop\work\ans-gateway`（现场观察，不在本仓库改目标项目）
- 目标版本：独立变更；不并入当前 i18n B1–B4 或目录 v3 验收

## 客户原话

> 先把这个治理推进去重漏洞作为独立变更修掉，i18n 稍后继续。

## 现场现象（只读核对）

`ans-gateway` 的 `ai-governance-pipeline` 流程：

- `role-cards`：`dispatched`
- `role-readiness`：`delivered`
- `acceptance-criteria`：`pending`
- 7 个 `boundary.yaml` 当前均为「role-card → feature-map → functional-description → memo → api-spec → 写集」；当前解析器与 ②b 必填条目检查遍历全部 `file` 条目，不依赖顺序。
- 账本：最后一次 Crew 写卡为 04:50:46；04:51:05 Liaison 给 Convener 发协调；04:52:41 Convener 写出 readiness（7/7 pass），但没有应用派发 Convener 的记录，`role-cards` 未被应用标 done。
- 诊断：04:50:52 有一次 `advance.post-write.source-settle`（Crew settle），之后没有 `advance.appointment.*`/`artifacts-invalid`/`dispatched`；04:48:08 Liaison→Crew 的 `dispatch_task` 被 `governance.dispatch.rejected` 拒绝。
- 代码事实：`postWriteAdvanceDispatched` 的 Convener 键为 project+flow+convener，成功后不清理；账本 `afterwards` 去重只看最新 appointment 之后的 app→Convener 派发；没有项目刷新/手工改文件触发的重新校验；`role-cards` 步骤没有应用侧完成路径。

## 沟通的意图理解

1. 修复应用侧治理写卡推进的**可重入性**：Crew 重写角色卡/边界后，应用能重新校验并在通过后再次派发 Convener readiness，而不是被永久运行期去重挡住。
2. 修复**手工修正/项目刷新后的重新校验**：没有 Crew 新事件时，应用也能发现卡片已修正并推进。
3. 修复 **`role-cards` 的 flow 收口**：结构校验通过后，`role-cards` 不应长期停留在 `dispatched`，否则 `role-readiness`/后续步骤无法正常 done。
4. **不改变权限模型**：不新增角色对 `角色卡/` 的写权限，不放开治理角色互相派发；应用继续作为中介与 flow 唯一写者。现有自动反馈 Crew 的路径保留，只修触发/去重/收口。
5. **不改目标项目**：本次只修 ans-studio 产品；`ans-gateway` 的现场解封由客户/桌面操作，不代写目标项目 flow/账本。
6. 顺序问题只作为回归项：加一条 boundary 条目逆序仍通过的测试；不把“只检查前几条”当作当前事实。

## 非目标

- 不重构整个治理流程/角色权限；不新增 cardKind/FlowStepKind/Power/Decision 枚举。
- 不把 i18n B1–B4 或目录 v3 的改动混入本变更；三者独立变更、独立验收。
- 不自动伪造 `role-cards` 完成或 readiness 判定；应用只记录其已执行的确定性结构校验结果。
- 不迁移 `ans-gateway` 的角色卡/流程，不修改其账本。

## 风险档位建议

**T3**：涉及治理推进/flow 状态与应用专用流程写入，属于治理行为变更；需独立方案、团队计划、闸门 2、实施前标准、T3 全量回归与独立验收。

## 客户补充确认（2026-10-23）

> 这个组队写完卡之后，不是应该有个门禁去验证吗，如果不对的话，就让组队修改就是了。

沟通理解：客户预期的是**既有写卡门禁闭环**——Crew 写完/重写 → 应用校验 → 不合格自动反馈 Crew 修改 → Crew 再写 → 应用再校验 → 合格才推进。本次修复的目标是恢复这个闭环的可重入性，**不是**新增角色间派发通道，也不改变 Crew 的写卡权限。应用仍是校验者与中介；`reportAppointmentArtifactIssues` 的自动反馈路径保留并修复触发/去重。

## 闸门 1 确认记录

- 确认时间：2026-10-23（本地）
- 客户选择：**确认方案 A（推荐）**，并按 Q1–Q8 推荐项实施。
- 确认对象：[治理写卡推进的可重入门禁闭环](../../planning/2026-10-23_design_governance-advance-redispatch.md) 草案 v1（299 行；SHA-256 `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341`；blob `9223448f823bd30ef01c9d11d51385c3aeff9fef`）。
- 确认的默认项：
  - Q1 接受应用专用 `completeRoleCardsStep`（应用是结构校验者与 flow 唯一写者；不伪造客户决定）。
  - Q2 接受项目刷新自动触发（`listProject` 廉价探针 + 250ms 合窗 + 指纹去重）。
  - Q3 指纹 = 目标角色六文件 sha256 + 团队计划 sha256 + validator schema 版本；不含 mtime/时间。
  - Q4 版本化运行期键（指纹 + 最近 Crew 写卡位置）+ 通过记录/最近 Crew 写卡为账本锚；早期 appointment 链派发不算 readiness。
  - Q5 本轮不加显式“重新校验/推进”动作；选装 O1 不默认。
  - Q6 role-cards 完成证据放 `.ans/governance/role-cards/<flowId>/<fingerprint>.json` + `artifact.observed(power=app)`。
  - Q7 readiness 文案：role-cards 已 done 只推进 role-readiness；role-readiness 已 done 时明确不要重做。
  - Q8 证据范围：T3 全量回归 + 真实 Electron + 目标项目只读复算 + 夹具全链路 e2e；不代写目标项目。
- 未选择方案 B/C；若后续改变为 B/C、扩权/边界变更或要求目标项目现场写入，需重开闸门 1/0。
- 记录依据：客户在闸门 1 问题中明确选择“确认方案 A（推荐）”，不是默认勾选、团队共识或沉默。

## 闸门 2 确认与实施授权

- 确认时间：2026-10-23（本地）
- 客户选择：**确认计划**、**授权人事补边界条目**、**确认并授权实施**。
- 确认对象：[团队计划](../../scheduling/2026-10-23-governance-advance-redispatch-team-plan.md)（248 行；SHA-256 `fdd9721a0fc29cac36e0103ecb8ac682bec7245bae4809997ee5a5cea576c82d`；blob `d4e4f1b97bdc3ab02cf531a6ea2931b1c53fb080`）。
- 参与角色与写集：
  - 编排：`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts`。
  - 桌面窗口：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`（条件）。
  - 测试：`test/测试/governance-e2e-auto/`（e2e/T3/真实 Electron/目标项目只读复算）。
  - 内置独立验收、统筹；不启用人事（除本次边界文档对齐）、装配、桌面UI、门禁引擎、运行时核心、项目管理及其他角色。
- 档位与顺序：**T3**；S1 闸门 2 + 实施授权 → S2 标准 + 基线 → S3 编排契约 → S4 桌面消费 → S5 终验 → S6 变更包 + 独立验收。
- 验收安排：实施前 `docs/acceptance/governance-advance-redispatch-criteria-v1.md`；报告 `...-report-v1.md`；不与 i18n/目录 v3 合并判定。
- 证据口径：候选哈希、原始命令/退出码/计数/失败原文、T3 全量（排除已知 write-sequencing 挂起）、真实 Electron、目标项目只读复算、无客户卡/无 `customer.decision`、无越界写；`test/桌面应用/` 不新建文件。
- 边界漂移处理：客户授权 **ANS 人事**把 `src/pipeline/orchestration/flow-state.ts` 补入权威 `角色卡/编排/boundary.md` Section 1，`boundary.yaml` 已有一致条目；这是既有条目文档对齐，不是扩权。`test/桌面应用/acceptance-dispatch.test.ts` 已由目录 v3 候选的授权校正覆盖；`test/桌面应用/e2e/main.mjs` 不在写集，若必须改则停止回报。
- 实施授权：客户明确选择“确认并授权实施”；实施授权与闸门 2 分开记录，本记录同时构成实施授权记录。实施前仍须完成标准写盘、基线记录与范围预留。
- 记录依据：客户在闸门 2 问题中明确选择上述三项，不是默认勾选、团队共识或沉默。

## 独立验收结果

- 验收时间：2026-10-23
- 结论：**通过（当前候选满足 `governance-advance-redispatch-criteria-v1`）**
- 报告：[`docs/acceptance/governance-advance-redispatch-report-v1.md`](../../acceptance/governance-advance-redispatch-report-v1.md)（203 行，SHA-256 `d87f4086ddb3a7eab4f0b3716d35e7ff25f2c71eb4b8ce6f65e8757e27e708ad`，blob `343e89722d10a1720e56c44216efcae7f837da79`）
- 结果：P1–P12 + G1/G2 全部适用行 pass，无 fail/insufficient；12/12 候选哈希复算一致；T3 全量 3693/3666/9/18（9 项全为既有 Windows symlink EPERM，零确定性新增，本轮零桌面偶发）；typecheck 双 0；Electron `E2E_PASS=true`；目标项目只读复算通过、`targetUnchanged=true`。
- 残余风险：目标项目现场未修复/未写入；无真实模型在线会话；role-cards done 后不自动 reopen；probe done 后不读六文件；legacy 跨重启同内容可能再派一次；S5 临时回退旧逻辑无单独日志（首轮失败日志已作复现证据）；记录 `teamPlan: null` 按契约允许；Electron 报告 Node 显示差异；P3 的“不写 flow”以可观察状态判定，未单列 flow 字节前后哈希。
- 本结论只证明产品候选满足标准 v1，不授权提交/推送/合并/发布；也不为 i18n/目录 v3 背书。

## 待闸门 1/2 明确

1. 角色卡指纹/去重键的精确口径（目标卡与 boundary 内容哈希 + 最近 appointment-write 时间）。
2. `role-cards` 由应用专用步骤完成（推荐）还是只要求 Convener 用 flow 工具补 done。
3. 是否增加显式“重新校验/推进”动作，还是仅项目刷新自动触发（推荐自动 + 去重）。
4. 是否在 readiness 任务文案中要求 Convener 在 `role-cards` 已 done 后只推进 `role-readiness`。
5. 证据范围：T3 全量回归、真实 Electron、目标项目只读复算；不代写目标项目。
