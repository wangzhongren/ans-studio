# 桌面窗口 B19 记录：已收口 stage-request 的最终报告仍唤醒 chief（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「桌面窗口」（独立固定上下文；B19 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B19**（RR14 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`a69a1eb`（RR14 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未提交/未推送/未合并/未发布**；未运行真实模型/Electron。

## 一、RR14 失败事实

- B18 生效：A2 stage-request 于 03:33:31 accepted 收口（仅 done 报告）；产品 A2 任务 03:33:48 accepted + `stage.completed A2`。
- convener 于 03:33:52 `submit_report`（A2 完成、下一步 A3）并在 03:33:55 settled；该报告的回交 taskId 是**已收口的 A2 stage-request**。
- 回交在入队阶段被 **closed 任务抑制**（`shouldSuppressStarTaskReport`，BUG-5「任务已收口 ⇒ 重复回交不入队」），未投递给 chief；即使投递，普通 `task.reported` observation 也会因 closed 任务被判 `task-observation-invalid`。
- chief 最后回合 03:33:35 已结束；无新唤醒 ⇒ A3 卡未呈，12 分钟无进度，`stalled-no-progress-12min`。

## 二、实施内容（`app/desktop/session.ts`，M）

1. **入队抑制例外**：`commitHandback` 中，`record.created.taskKind === "stage-request"` 且 `record.closed !== undefined` 时，不按 closed 任务抑制（`closedStageRequestObservation`），照常投递给 chief。
2. **observation 跳过**：同一标记下跳过 `task.reported` 的 observation 写入（closed 任务 observation 会被 `task-observation-invalid` 拒绝），保留报告投递；不伪造 task 事件。
3. **drain 丢弃例外**（纵深防御）：`inspectHandbackAssignment` 对 closed fixed child 的 B11.1 丢弃增加 stage-request 例外（`delivery.deliver.fixed-stage-request-closed` 诊断）；closed **生产** child 仍按 B11.1 丢弃（RR6 行为不变）。

## 三、测试（`test/桌面应用/b111-fixed-closed-handback-drain.test.ts`，M）

- 新增 B19 test：closed A2 stage-request（chief→convener）的最终报告（convener→chief）仍投递到 chief；诊断无 `delivery.skip.fixed-child-closed`、有 `report.enqueued`；不伪造 `task.delivered`；closed 事实保留。
- 既有 B11.1 测试（closed 生产 child 丢弃、open 照常、混合批、legacy）全部保留通过。

## 四、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b19-01-typecheck.txt`（`22d52cc9…`） |
| 桌面 fixed 定向 11 文件（含 b111 新 test） | **91/91 pass** | `_evidence/b19-02-desktop-fixed.tap`（`7efca7f2…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b19-03-full-chain.tap`（`2d478b13…`） |

## 五、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | M | 864,589 / 13,425 | `14da5881c1c5a580b7acb5df98ae1d194c790910eec0d6148813f7abc4f1572a` | +27/−10 |
| `test/桌面应用/b111-fixed-closed-handback-drain.test.ts` | M | 27,107 / 499 | `52579c5e4dfe155eb4840cf44299d8325ab45d7da8c75b6e668fcb32e994303c` | +49/−0 |

- 基线/改动状态：`_evidence/b19-00-baseline-head.txt`（`a69a1eb`）、`b19-00-change-status.txt`。
- 本批仅桌面 session；生产任务的 closed/同回合抑制与 B11.1 丢弃语义未改；legacy 路径未改。

## 六、限制与披露

- 本批只改 fixed closed stage-request 的报告投递与测试；**未运行**真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR15。
- closed stage-request 的最终报告不写 task.reported（closed observation 不可写）；报告内容以回交消息投递给 chief，不伪造任务事件。
