# 策划记录：Block 解法路由设计提案 v1（2026-11-20）

- 角色：ANS 内置角色「策划」（业务策划；独立固定上下文）
- 任务：按客户 2026-11-20 新原则「所有的 block 应该都要有解法，就是不是说卡住就暂停……」出设计提案——block 分类学、解法路由、决策路由（替决策开/关）、无 stop 终态、与既有机制接合、两协议兼容、测试验收；只出文档，不改代码/测试，不合并/发布。
- 依据（口径，最终以此为准）：
  - 客户 2026-11-20 原话：缺文件/资源 ⇒ 对应的人修复；业务取舍 ⇒ 客户决策；「替我决策」开启 ⇒ judge 代决策；没有 ⇒ 必须弹客户卡。
  - 协调方 2026-11-20 裁定（覆盖原任务书第 3 点）：**取消 stopped-with-disclosure 终态**；block 终态只有 `fixed` / `decided`；安全/高危走 decided（客户卡、judge 不可代批）；不可恢复/损坏 = 属主修复任务或客户决策（接受现状/更换方案）；审计保留 raised→routed→resolved/escalated，escalated = 升级为更高级修复/客户决策，不是停止。
- 基线：本 worktree `trunk-amendment` 分支 `feat/post-2.1.0`，HEAD `caf0acf`（v2.1.0 已发布）。app-dispatch 分支 `feat/app-dispatch-builtins`（worktree 未提交、已暂停）只读核对，未改动。

## 一、只读输入（实际阅读锚点）

- 设计/语境：`docs/planning/2026-11-17_design_app-dispatch-builtins.md`；`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`；`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`；`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`；`角色卡/测试/docs/change/2026-11-16_remediation-plan.md`。
- 真实运行史：`角色卡/测试/docs/change/2026-11-11_RR26..RR29、RR30/RR31、2026-11-12_RR33/RR34`；`角色卡/桌面窗口/docs/change/2026-11-11_B19_two-fixed-workflow-paths.md`（12 分钟 stall）。
- 编排：`src/common/编排/workflow-service.ts`（`requestStage:733`、`closeTask:1284`、`stage.blocked:1467-1500`、A9 `:3948-4035`、release `:3433/3539/3770`、A3 卡门 `:1630-1640`）；`workflow-state.ts`（blocked/corrupt/stop-unconfirmed）；`workflow-dispatch.ts`（13 拒绝码 `:30-43/147`）；`workflow-preconditions.ts`（`module-paths-mismatch`、`reportTargetForTaskCreator:1738`）；`task-state.ts`；`watchdog.ts`（log-silence 5/10/30min、turn-deadline、`evaluateRedispatchSafety:224`）。
- 桌面：`app/desktop/session/fixed-workflow/route.ts`（拒绝码/`b-change-scope-invalid`）；`dispatch.ts`（契约拒投注释 `:197`、source 门 `:742/756/863/891`）；`handback.ts`（blocked 报告提示 `:293-336`）；`tasks.ts`（`redispatchTask:621`、`escalateStuckTask:799`）；`customer-input.ts`（judge 分组/回落 `:1515-1818`、`isApplicationDecisionReservedForCustomer:482`）；`plan-escalation.ts`；`watchdog.ts`；`governance-advance.ts:40`（停滞消息空 stub）；shell：`shell-gate.ts`/`shell-escalation.ts`。
- app-dispatch（暂停分支，只读）：`workflow-service.ts:5158/5457/5727`；`workflow-definitions.ts:68-75/147-163`；`app/desktop/session/fixed-workflow/stage-dispatch.ts:440-560`；`chief-workflow-v3.md`。

## 二、交付

- 设计提案：`docs/planning/2026-11-20_design_block-resolution-paths.md`
  - 结构：摘要；客户原则与裁定（4 条要求 + 不变量 I-1..I-5）；现点位 51 个（6 族 P1–P51 + RR26–RR34 映射）；分类学 9 类 + 责任归属矩阵 + 「不可恢复/安全/预算」映射；决策路由（judge 开/关、manual 回落、高风险清单、无静默等待）；block 生命周期与 `blocks.jsonl`（raised→routed→resolved/escalated，无 stopped）；与既有机制逐项接合（blocked 报告/拒绝码/缺契约/shell/Q8/stall/reconcile/redispatch/release/source/VCA/网络）；落地形态（纯分类器 + app router + 卡模块 + 角色文本增删 + 两协议兼容）；测试矩阵 T-1..T-12 与 AC-1..AC-10；风险与 Q1–Q10；非目标与披露；附录映射与锚点。
- 本记录。

## 三、关键设计裁定（本记录内冻结）

1. **无 stop 终态**：block 只收敛到 `fixed`/`decided`；「终止本次流程」只作为客户主权选项的结果（显式停稳 + `workflow.closed stopped` + 披露），不是 block 终态。
2. **分类 9 类**：missing-resource / missing-capability / scope-tradeoff / high-risk / environment-infra / protocol-reconcile / repeat-rejection / model-anomaly / budget-quota；判定只认代码/账本事实，不采信模型自报。
3. **决策路由**：B3/B9 业务取舍查「替我决策」；judge 开启且 decision 组、唯一推荐、非主权 ⇒ judge（诚实 provenance）；否则/不可用/manual ⇒ **客户决策卡**（证据+选项+唯一推荐+默认，无答复不执行）。B4 高风险永远客户本人。
4. **现点位 51 个（6 族）**：E9 / D14 / R11 / S5 / W8 / H4；每项有「现在 → 新语义」与路由动作（§2.4、§6.11）。
5. **生命周期**：`blocks.jsonl`（`block/v1`，append-only，独立于 workflows.jsonl）；blockId/幂等键确定性；一 block 一卡、一项目一卡；同指纹重复必 escalated。
6. **两协议**：fixed-v2.1 在飞零迁移（resolver 消费既有事实，修复任务由现有创建者按应用简报创建）；app-dispatch 把 `onExhausted` 语义改为 `route-block-resolver`（定义版本化），reconcile corrupt 接入 B6 路由；不改阶段状态机。
7. **角色文本**：只做减法（删「停止/空转/三选一含停止」）+ 如实上报 block；新会话生效，在飞会话不热改。

## 四、未做 / 边界

- 未改代码、测试、角色卡、边界、schema；未运行 `npm`/测试/真实模型/Electron；未占用调试端口；未读 `.env`；未合并/发布/触发 CI。
- 未修改 `docs/communication/memo.md` 既有未提交改动；未触碰 app-dispatch 分支的任何未提交文件。
- 未实施 resolver/`blocks.jsonl`/角色文本改动；全部为设计提案。

## 五、待确认 / 下一步

- 优先需协调方/客户裁定：Q1（block 账本位置）、Q2（judge manual 回落客户卡）、Q4（终止选项语义）、Q5（在飞 fixed-v2.1 不迁移）、Q6（修复任务创建者）、Q9（A12b 能力缺口处置）。
- 实施建议另立变更：先落纯分类器 + blocks 账本 + 路由矩阵测试（T-1/T-2），再接 fixed-v2.1 事实源，最后接 app-dispatch（Q8/reconcile）。
- 本记录不构成实施授权、验收或客户批准；合并/发布仍按客户逐次放行。
