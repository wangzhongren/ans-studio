# 变更记录：gate 复核 `flow-busy` 共享 i18n 文案（项目管理）

- **任务**：gate 复核在途返回新码 `flow-busy`，需要把原因告诉运营——项目管理新增共享 i18n key `main.gateReview.flowBusy` 并同步契约测试
- **记录角色**：项目管理（项目协调组）
- **日期**：2026-10-27
- **状态**：**共享 i18n key 与契约测试已完成；key 尚无消费方；未改运行时/桌面/编排/角色卡/测试夹具代码；未验证端到端**
- **授权依据**：客户要求（2026-10-27，经主控任务转达）；设计 `docs/planning/2026-10-27_design_gate-review-return-routing.md` §4.1/§10.1 明确共享 i18n（`main.gateReview.*`）由项目管理扩展与测试
- **工作树说明**：原 `lead-governance-coordination` worktree 已按客户 2026-10-27 收口（提交 `43372e4` 并入本地 `main` 后删除，见 `docs/communication/2026-10-27_intent_worktree-consolidation.md`）；本次在活动工作树 `gate-review-flow-busy`（分支 `feat/gate-review-flow-busy`，HEAD `43372e4`）执行
- **环境**：Windows 11 / Git Bash；Node `v24.22.1`

---

## 一、新增 key 与文案

`main.gateReview.flowBusy`（`zh-CN.ts` / `en-US.ts` 同 key；**无占位符**，消费方可直接取词，不需要传参）：

| 语言 | 文案 |
| --- | --- |
| zh-CN | 流程仍有在途交付/轮次/回交，gate 暂不派发；这是可重试状态，不是故障或 gate 失败；请在在途工作结束后重试。 |
| en-US | The flow still has in-flight deliveries, runs, or handbacks, so the gate is not dispatched yet; this is a retryable state, not a failure or a gate failure — retry after the in-flight work finishes. |

**语义**：`flow-busy` 是**可重试**状态——流程仍有在途交付/轮次/回交，gate 复核暂不派发；不是故障、不是 gate 失败；在途工作结束后重试即可。文案不含 flow/gate id 占位符；若消费方需要上下文，可自行在系统行拼接身份，不改变本 key 契约。

---

## 二、测试契约同步

`test/项目管理/shared/i18n.test.ts`：

- `GATE_REVIEW_KEYS` 13→14（新增 `main.gateReview.flowBusy`，位置在 `flowIncomplete` 之后）；占位符契约 `[]`。
- 分区计数：`main` 530→**531**；总 key 1387→**1388**；`prefixes.main − B0` 525→**526**（ui/shared/preferences 不变）。
- 语义断言：zh 必须含「在途」「暂不派发」「可重试」「不是故障」「gate 失败」「结束后重试」；en 必须含 `in-flight` / `not dispatched` / `retryable` / `not a failure` / `gate failure` / `retry after`。
- 逐字插值断言：zh/en 各一条完整文案；en-US 不含中文由既有循环断言覆盖。

---

## 三、未实施与边界

1. **key 尚无消费方**：本次未改运行时/桌面/编排代码；`flow-busy` 回执到 `main.gateReview.flowBusy` 的接线由运行时核心/桌面窗口属主完成。接线前取词不受影响，但不会有产品路径使用它。
2. **未验证端到端**：未运行 gate 复核在途场景、桌面测试、Electron；本记录不构成实现或验收结论。
3. 未改角色卡/边界、产品/工具/桌面/运行时/编排/i18n 之外代码；未 commit/push；未重启应用；未触碰游戏项目/`demos/`。

---

## 四、验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| i18n 契约 | `node --test "test/项目管理/shared/i18n.test.ts"` | **62 tests / 62 pass / 0 fail / 0 skipped**，exit 0 |
| 共享组件套件 | `node --test "test/项目管理/shared/**/*.test.ts"` | **210 tests / 205 pass / 0 fail / 5 skipped**，exit 0 |
| 类型检查 | `npm run typecheck` | **exit 0**（全仓无诊断） |

---

## 五、本批写集

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`
- `角色卡/项目管理/docs/change/2026-10-27_change_gate-review-flow-busy-key.md`（本文件）
- `角色卡/项目管理/changelog.md`

未触碰：`app/**`、`src/provider/**`、`src/model/**`、`src/pipeline/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、其他角色资料、角色卡/边界、构建配置、`demos/`。
