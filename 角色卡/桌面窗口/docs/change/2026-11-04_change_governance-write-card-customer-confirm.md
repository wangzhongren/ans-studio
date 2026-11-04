# 实施记录（修复）：治理写卡（appointment-write）确认卡不被判断器代批/代拒（2026-11-04，客户直修）

- 角色：桌面窗口（desktop window）——`app/desktop/`、`test/桌面应用/**` 属本角色 Section 1
- 分支：`fix/governance-write-card-customer-confirm`（worktree `.claude/worktrees/governance-write-customer-confirm`；基于 origin/main `c2f1630`）
- 定性：**修复**（已确认行为偏离；无新行为/契约/边界/权限变化）
- 依据：客户问题记录 `docs/communication/2026-11-04_issue-governance-write-card-customer-confirm.md`（Communication 维护）

## 一、症状与触发条件

1. 客户开启「替我审批」（approval 组开关）。
2. 七张角色卡 appointment-write 确认卡被判断器以 reasonCode `sufficient` **代批**（客户本人未点击）。
3. godot-custodian 的 `boundary.yaml` 写卡因「与现有角色卡声明冲突」被判断器**直接拒绝**，卡未呈现给客户（拒绝回执写明「这不是客户拒绝」）。
4. 客户要求：治理写卡必须客户本人确认；判断器既不许代批，也不许把卡拒掉。

## 二、根因（origin/main `c2f1630`）

- `app/desktop/customer-input.ts::planJudge` 对 `cardKind="appointment-write"` 走通用 approval 组判断门：presenter、judge fn、`isGroupEnabled("approval")`、`governanceModel==="trio"`、合法 flowId 全部满足即调用治理 judge。
- judge driver 的 approve（实机 reasonCode `sufficient`）经 `settleJudgeOutcome` 直接结算 `answered`（`operatorId:"judge:<engine>"` + judge 审计），不呈现客户卡。
- judge deny 同样在 `settleJudgeOutcome` 直接结算 `declined`，卡不呈现；manual/超时等走自动退回。
- 因此客户既看不到卡，也无法本人确认/拒绝。

## 三、修复方案（仅 appointment-write）

1. `planJudge` 在解析出 `cardKind` 后、组映射前排除 `appointment-write`：永不生成 JudgePlan ⇒ 不调用判断函数、不产生 `OperatorJudgeResultPayload` 结果行、不写 judge 审计字段；无论「替我审批」开关状态，直接走既有 `presentNow` 路径呈现客户本人。
2. `tryAutoSelectDecision` 增加显式防线（结构上写卡不会携带 decisionCard；防未来接线变化）。
3. `settleJudgeOutcome` 顶部增加防御：若未来出现第二入口误入 appointment-write，丢弃判断结果并原卡呈现客户，绝不代批/代拒。
4. `escalateJudgeOutcomeToCustomer` 注释说明对 appointment-write 不可达——「与现有角色卡声明冲突」类拒绝不再可能发生。
5. 其余确认卡（shell 命令确认在 `operator-channel.ts` 独立通道）、普通写盘预授权、恢复确认等行为**逐字不变**。
6. fail-closed 语义不变：无 presenter/通道时如实 `unavailable`，不伪装成功。

## 四、判断/代批入口审计（全局定位）

| 入口 | 结论 |
| --- | --- |
| `planJudge`（主判断门） | 已排除 appointment-write（本次行为改动点） |
| `tryAutoSelectDecision`（decision 卡确定性代选） | 仅 decision 卡；已加 appointment-write 显式防线 |
| `tryApplyDirectiveDecision`（客户指令消费者） | 仅 `cardKind="decision"`，appointment-write 不可达 |
| `settleJudgeOutcome` / `runJudge` | 只能由 planJudge 生成的计划调用；顶部防御兜底写卡 |
| `escalateJudgeOutcomeToCustomer` | 仅 settle 内部调用；对写卡不可达（注释说明） |
| `presentEntryNow` 的 `judgeContext.unavailableReason` 自动退回分支 | planJudge 已返回 undefined ⇒ 写卡不可达 |
| `preauthorizeWrite`（边界内写盘预授权） | `角色卡/**` 命中治理敏感类别（`write-preauthorization.ts`）恒返回 confirm；不自动放行/拒绝 |
| `GOVERNANCE_CARD_GROUP` 映射 | 保留为单一来源（pipeline driver/UI 仍读）；桌面通道不再为 approval 组发起判断 |

## 五、行为对照（before/after）

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 开关开 + 写卡，judge approve（`sufficient`） | judge 代批（`operatorId:"judge:<engine>"` + 结果行 + judge 审计），卡不呈现 | 原卡呈现客户；judge 0 调用、0 结果行、无 judge 审计；客户 confirmed ⇒ `answered`，operatorId=客户通道 |
| 开关开 + 写卡，judge deny | 直接 `declined`，卡不呈现 | 原卡呈现客户（判断器不运行），客户本人决定 |
| 开关开 + 写卡，judge manual/timeout/异常/ledger 不可用 | 自动退回/拒绝 | 原卡呈现客户（判断器不运行） |
| 开关关 + 写卡 | 呈现客户 | 呈现客户（不变） |
| 客户拒绝写卡 | `declined` | `declined`（不变；`approval.resolved.by=customer`） |
| 普通 confirm / shell / 恢复确认 | 既有行为 | 逐字不变 |
| 无 presenter / 无通道 | `unavailable` | `unavailable`（不变） |

## 六、范围收回说明（协调者 2026-11-04 追加指令）

曾按追加指令短暂实现「决策组治理卡 approve-only（deny/manual 一律转客户）」。随后协调者收回该范围（判断器整体退役、另行立项），本候选已完整回退：

- `app/desktop/customer-input.ts`：恢复 escalate/settle 原有 manual/deny 自动退回语义、`autoRejectedCards` 指纹去重、`notifyAutoRework`、`ledger-unavailable` 自动退回、`judgeReworkReasonText`、reason 映射/内部码屏蔽等；**仅保留 appointment-write 相关改动**。
- `test/桌面应用/decision-service.test.ts`：恢复原有用例（含「③ 同卡指纹自动拒绝只发生一次」），仅新增 appointment-write 用例。
- `test/桌面应用/optional-acceptance.test.ts`、`test/桌面应用/application-line.test.ts`：恢复原状（与 origin/main 逐字节一致，diff 为空）。
- `test/桌面应用/write-safety.test.ts`：仅新增 appointment-write 会话级用例。

## 七、测试与证据（原始输出）

环境：Windows 11 / Node v24.22.1 / npm 11.19.1；worktree `.claude/worktrees/governance-write-customer-confirm`；候选 = 本 worktree 工作区（未 commit）。

| 序号 | 命令 | 结果 | 原始日志 |
| --- | --- | --- | --- |
| 01 | `node --test test/桌面应用/decision-service.test.ts` | **18/18 pass**（13 既有 + 5 新增 appointment-write） | `2026-11-04_change_governance-write-card-customer-confirm-evidence/01-decision-service.log` |
| 02 | `node --test test/桌面应用/write-safety.test.ts` | **7/7 pass**（5 既有 + 2 新增会话级） | `.../02-write-safety.log` |
| 03 | `node --test "test/桌面应用/*.test.ts"`（桌面全量） | **546/546 pass** | `.../03-full-desktop-suite.log` |
| 04 | 受影响桌面套件（run-change-entry / run-change-trigger / run-change / version-decision / directive-decision / stuck-redispatch / optional-acceptance / application-line） | **59/59 pass** | `.../04-affected-suites.log` |
| 05 | 共享/通道回归（customer-authorization-plane-integration / acceptance-proposal-path / acceptance-evidence / diagnostics / operator-wiring / pending-card-restart / operator-channel / interface） | **87/87 pass** | `.../05-shared-channel.log` |
| 06 | `npm run typecheck` | **exit=0**（无输出） | `.../06-typecheck.log` |

改动补丁（对照改动前 origin/main 文件，`diff -u --strip-trailing-cr`）：`07-diff-customer-input.patch`、`08-diff-decision-service.patch`、`09-diff-write-safety.patch`。

### 既有用例更新说明

全局检索（`rg` 全仓）确认：origin/main 的桌面客户通道测试中**没有**断言「appointment-write 被 judge 代批」的用例；appointment-write 相关既有用例仅覆盖 D3/结构/预览校验（`write-safety.test.ts`）、judge facts（`test/编排/appointment-roster.test.ts`）与 judge 引擎拒绝文案（`rejection-copy.test.ts`，直接调用 `evaluateGovernanceJudgeVerdict`，不经桌面通道）。judge 引擎本身未改动，故这些用例保持原样并通过；本次以新增桌面通道/会话级用例补齐覆盖，未放宽任何既有断言。

## 八、候选哈希（sha256）

| 文件 | sha256 |
| --- | --- |
| `app/desktop/customer-input.ts` | `fb969a9b59669fa48ea6232a8289ea916f245a3310418bce692426d2b39a03c8` |
| `test/桌面应用/decision-service.test.ts` | `22bbacde966d96f2e793aaa197608b9d2adc0247c9e5d9db1f3ad673a39dce98` |
| `test/桌面应用/write-safety.test.ts` | `2a7cc335adf55cb9d9603b27c2d17dd06528d54b33e91d13a5b776b0993a5499` |

## 九、未提交声明与风险

- 本 worktree **未 commit、未 push、未发布**；等待独立验收与客户授权。
- 未改 `src/common/shared/i18n/**`（项目管理角色）、`app/renderer/**`（桌面UI角色）、`src/common/编排/**`；未改 shell 通道 `operator-channel.ts`。
- 风险/说明：approval 组（appointment-write）在桌面治理判断通道中已无可达卡；judge driver 的 approval 能力保留但不会由本通道触发。`GOVERNANCE_CARD_GROUP` 映射未改（单一来源仍表达分组，避免影响 pipeline/UI）；如需彻底移除该组的语义，属判断器退役新立项范围。
- 证据目录中 `*.log` 与 `.patch` 为本地原始输出，按仓库惯例不入库；`patch-parts.tmp/` 为本次补丁脚本临时目录，交付前已删除。

