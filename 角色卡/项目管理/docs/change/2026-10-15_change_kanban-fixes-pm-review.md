---
id: kanban-fixes-pm-review
type: change
title: kanban-live 修复提案 PM 评审批次（五份提案核实完毕，待客户批准）
created: "2026-10-15"
status: review-complete-awaiting-customer
---

# PM 评审：kanban-live 修复提案批次（2026-10-15）

派发：[2026-10-15_change_kanban-runtime-fixes-dispatch.md](2026-10-15_change_kanban-runtime-fixes-dispatch.md)。五份提案（各属主角色独立上下文产出，全部标注「未实施/未测试」，零代码改动、零 git 提交）：

| 项 | 提案 | 属主 |
|---|---|---|
| F-1/F-7/F-8 | `角色卡/运行时核心/docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md` | 运行时核心 |
| F-2/F-4 | `角色卡/桌面窗口/docs/fix/2026-10-15_fix_kanban-delivery-and-operator.md` | 桌面窗口 |
| F-3/F-9 | `角色卡/Pi适配器/docs/fix/2026-10-15_fix_kanban-turn-truncation.md` | Pi适配器 |
| F-5 | `角色卡/门禁引擎/docs/fix/2026-10-15_fix_kanban-f4-governance-note.md` | 门禁引擎 |
| F-6 | `角色卡/编排/docs/fix/2026-10-15_fix_kanban-shell-audit-f6.md` | 编排 |

## 一、抽查核验（PM 独立复核）

- F-1：583s/132s 两段时间线、`runShell` 无执行计时器（tools.ts:379-438）、`ok: code === 0`（tools.ts:492）——属实。
- F-2：`drainChains` 每项目一条、持有贯穿整轮（session.ts:1610-1629）——属实。
- F-3：`clampMaxTokensToContext` 下限 1（pi-ai simple-options.js）；native 原始行 idx96/idx99 `stop=length, output=1, input 465496/338687`；`lifecycle.ts:45` 把 length 归 completed——属实。
- F-4：`DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS=120000`、env `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`（app/desktop/operator-channel.ts:68/70/228）——属实；拒绝文案由编排 shell-gate.ts:562-567 固定成「无人值守？」。
- F-5：su 13:21:29 先写成功、13:28:22 同路径被拒（replay 逐条核实）；F4 拒绝文案列边界允许路径而非写权集（resolve-write.ts:44-57/137）——属实。
- F-6：审计 53 条、缺 17 条与 stderr 17 行一一对应；创世过渡窗（13:21:29→13:21:42）内会话快照 acceptance 未接受——属实。

对派发初始假设的三处修正（以属主证据为准）：F-3「输出太长」实为输出预算被钳到 1 token；F-4「后台角色通道判定」实为桌面确认通道自身 120s 超时被误报「无人值守」；F-5「任务写集未发行」实为创世重钉触发 O-1 会话重建、已发行写权被静默清零。

## 二、证据保全

- 破案关键诊断日志已转存：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/raw/diagnostics/ans-diagnostics-2026-10-15.jsonl`（739,797B，原路径在 /private/tmp 会被清理）。
- 派发文档 F-6 行证据路径更正为「证据目录顶层 app-redacted.log」。

## 三、推荐实施范围（待客户批准）

必需项全数 + 下列推荐勾选（其余不勾）：

| 编号 | 内容 | 建议 |
|---|---|---|
| F-1（必需全套） | 命令级时限（默认 600000ms，只可调大不可禁用；超时=如实「超时已终止（N ms）」+轮次继续） | 勾选 |
| F-1-opt1 | 进程树终止（POSIX 进程组 / Windows taskkill /T） | 勾选 |
| F-2-M1 | 投递链持有收窄到「认领段」 | 勾选 |
| F-2-opt2 / opt3 | openInternal 同键互斥（闭合既有双开窗口）/ 认领段诊断 | 勾选；opt1（链键降为每队列）不勾（先稳） |
| F-3-a / b | 截断后限一次「收尾补发」（默认开启、env 可关）+ 截断事实外推系统行 | 勾选 |
| F-3-c / d | schema 文案修正（运行时核心）/ 回交摘要截断注记（编排） | 勾选（小项） |
| F-4-M1 / M2 | 桌面确认超时与 shell 审核预算对齐 + 超时/中止原因分流 | 勾选 |
| F-4-opt1 / opt2 | 窗口 focus/show 重推挂起确认卡 / 取消-超时诊断补录 | 勾选；opt3（提高默认值）不勾 |
| F-4-X1 | 编排把通道真实 reason（超时）转达给模型，不再固定「无人值守？」 | 勾选（编排小改） |
| F-5-main | F4 拒绝信息可操作化 + allowedByRoot 语义修正 | 勾选 |
| F-5-opt1 / opt2 | 重建如实行模型可见化（跨桌面窗口/编排）/ schema.ts 那句误导文案修正（运行时核心） | 勾选；opt3（写权跨重建保留）不勾 |
| F-6-1 / 2 | 审计写遇拒刷新边界快照重试 + 提示去重与如实话术 | 勾选；opt2/opt3 暂不排期（登记） |
| F-7（必需）+ opt1/opt2 | 独立操作符 token 守卫 + 内嵌操作符/变量展开检测（未加引号的 `grep a\|b` 类命令将从可用变为明确阻断——文案给「加引号或拆分」指引） | 勾选 |
| F-8-a + b | 投影层「已执行完成（退出码 N）」+ 桌面窗口/桌面UI 行分类同步（跨角色派发） | 勾选 |
| 新增评估 | F-9-opt2：1 MiB 工具结果上限与上下文窗口/钳制的联动评估（运行时核心） | 立项评估 |
| 新增评估 | Claude/Codex 适配器截断同构评估（各自角色） | 立项评估 |

## 四、未决事项（非阻塞，实施轮内自行回答）

1. F-4：**已由客户（操作者本人）亲历证实（2026-10-15 晚）：cp 确认卡确实弹出过，但因 120s 超时后无法点击**——渲染存在，不存在「未渲染」缺陷；问题确认为「超时窗口过短 + 过期后卡片静默失活」。F-4-M1/M2 即为对症修法；F-4-M2 的到期文案应让过期卡显示明确原因（「操作者确认超时，未获放行——可让角色重新发起。」）而非静默变灰，实施后真机复验专门观测此项。F-4-V1 e2e 降级为回归项（原「未渲染则转派桌面UI」分支关闭）。
2. F-4：派发时引用的「另一处 cp 出现可放行确认卡」在三份 replay 中未复现，按跨轮混淆撤回，不影响修法。
3. F-5：`writeSetContains` 字符串比对不区分根（理论窗口、真机未复现）——登记观察，不动。
4. PM 观察：`SHELL_REVIEW_TIMEOUT_ENV` 同名常量分居 编排 `shell-deadline.ts` 与 运行时核心 `timeout.ts` 两处 common——登记，另行评估归并。
5. F-6 残留：17 条缺失中 1 条（13:21:39.359，任何授权落地前发生）物理不可恢复，属 fail-closed 应有残留——请客户确认可接受。

## 五、影响面与风险（摘要）

- 全部改动为「拒绝更多/如实标注」，无任何权限放行面扩大；fail-closed 语义全部保留。
- 实施跨六个上下文：运行时核心、桌面窗口、Pi适配器、门禁引擎、编排、桌面UI（仅 F-8-b 行分类，若 F-4-V1 证实问题再追加）。
- 高敏感面：F-2 投递链重构（桌面核心路径，提案含 6 个既有测试文件的完整回归计划）；F-5-main 触及 decision.ts（单一主属主，按法案经本评审并呈客户批准后方可实施）。
- 回滚：各提案均为单文件/小面积 revert，F-3 另有 env 即时关闭开关。

## 六、下一步

1. 客户批准本表的建议范围（或逐项点名调整）。
2. 按批准范围向各属主角色派发实施上下文（仍是「一个上下文一个固定角色」），各带测试与证据回交要求。
3. 实施完成后由独立验证上下文（测试角色）复验 + 真机 E2E 复跑（含 F-2/F-4/F-3 断点观测项）。
