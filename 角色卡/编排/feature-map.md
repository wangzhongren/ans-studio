# 编排功能导航

本角色负责的**系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。
每份功能的稳定说明（当前流程 + 流程图 + 演变历史）归 `docs/feature/<feature-id>.md`；**本角色各功能的稳定说明待补**（见状态列），既有历史先链 `docs/change/`、`docs/fix/` 记录。

> 注：本文件 2026-10-12 建立（此前缺失；role-card 已引用本路径）。功能文档按 `docs/feature/` 规范逐步补齐——先立导航，不建失效链接。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 多运行时受治理会话 | 选四引擎，经 Service 建工具、分角色/runtime 存储与读取实际上下文；中止旧确认不发行写权 | 编排 238/238，实际引擎整合待验 | [运行时选择](docs/feature/runtime-selection.md) |
| ans role run（一次性角色会话） | CLI 按角色跑一轮受治理会话：解析角色/边界 → 写入前门禁 → 事件流到 `settled` | 已实现 | 功能文档待补（[受治理会话运行时](docs/change/2026-10-12_change_governed-interaction-a3-a4.md)） |
| 角色会话句柄（多轮） | 桌面聊天栏的会话式入口：`openRoleSession` 一个会话多轮 send（可带图 `opts.images` 原样透传，P0-1）、`abort?()` 停当前轮次（三态如实：不支持停止即如实说明，P0-2）、事件流持续、`dispose` 收口；桌面停止钮与图片 IPC 接线为后环 | 已实现 | 功能文档待补（[P0-1/P0-2 句柄层](docs/change/2026-10-13_change_p01-images-p02-abort-handle.md)、[会话自持目录](docs/change/2026-10-12_change_session-dir-restore-wiring.md)） |
| ans govern（治理会话） | su 的治理对话（建/改角色、创世）：CLI 与桌面收敛为同一引擎 `openGovernanceSession` | 已实现 | 功能文档待补（[确认制/删收口](docs/change/2026-10-12_change_governed-interaction-a3-a4.md)） |
| 客户确认制（写前预览确认） | 写盘前经 `request_confirmation` 预览（含具体路径）并获客户 `confirmed:true`，写集按确认发行 | 已实现 | 功能文档待补（同左；残余「内容漂移」已如实登记） |
| 自动收尾 / 重 pin | su 会话 settle 后自动重扫并更新 `.ans` pin + manifest（创世首轮 = 首次收尾） | 已实现 | 功能文档待补（同左 + [finalize 相关记录](docs/change/2026-10-12_change_governed-interaction-a3-a4.md)） |
| 看护信号文案（watchdog） | 四类看护告警/恢复/风暴护栏/收束提示的单一来源渲染；`turn-deadline` 为「轮次到点检查」（不中止、没卡死不动作、卡死才提议、1 小时兜底） | 已实现 | [到点检查记录](changelog.md#2026-10-17--看护信号-turn-deadline-改为轮次到点检查整轮不设超时1-小时为最后兜底) |
| **建立治理记录（已有角色、无 `.ans`）** | `previewGovernanceRecord` 只读预览 / `establishGovernanceRecord` 由操作者显式触发，复用 `finalizeBootstrap` 写出治理边界文档 + `.ans` + manifest；守卫/互斥/`phase` 三态见记录 | 已实现（B1+B2） | [I3 记录](changelog.md#2026-10-17--i3已有角色但无治理记录兼容previewgovernancerecord--establishgovernancerecordb1--pipeline-薄再导出b2)；公开面见 [api-spec](api-spec.md) |
| **重新接受治理 pin（`pin-mismatch` 恢复）** | `previewGovernanceReacceptance` 只读预览（逐文件 changed/blockers/previewDigest）/ `reacceptGovernancePins` 操作者确认后整表重算现有 pin 写回 `.ans` + manifest 追加记录；不增删 pin、不改边界内容/roles/source | 已实现（B1+B2） | [重新接受记录](changelog.md#2026-10-17--治理记录-pin-不符重新接受previewgovernancereacceptance--reacceptgovernancepinsb1-pipeline-薄再导出b2)；公开面见 [api-spec](api-spec.md) |
| shell 闸（三层链：项目角色） | c-b-a审核与留痕；宿主已委托本项目精确常规检查且b明确允许时免重复a | 编排已实现并验证 | [shell审核](docs/feature/shell-review.md) |
| **shell 审计边界（W6-A 补丁）** | trio 下 shell 审计写 `docs/audit/shell-gate.jsonl` 改用应用专用边界 `appGovernanceBoundary`（应用写审计）；single/su 沿用既有治理角色边界（`docs/audit/` 条件目录 + `shell-gate` 条件），逐字不变 | 已实现 | [api-spec](api-spec.md#w6-a-补丁trio-的-shell-审计边界2026-10-18) |
| **内置治理角色 shell（审批档；只读档保留为兼容）** | **五个内置治理角色＋su 的 `run_shell`：只读白名单免审批直放（0 卡）；risky/review/deny 逐条客户/判断 agent 审批（不接 (b) 审读）；旧只读档代码保留（执行集 ⊆ 审批档）** | **已实现（编排；桌面注入待其属主扩到全部内置角色）** | [统一审批档记录](docs/change/2026-10-19_change_all-roles-shell-approval-sync.md)；[su 审批档记录](changelog.md#2026-10-17--su-的-run_shell-改为只读免审批其余含-deny-逐条客户批准operatoronly--approvedeny编排侧)；[su 只读 shell](docs/change/2026-10-12_change_su-readonly-shell.md) |
| **「替我审」判断 agent（编排驱动）** | `createShellJudge`：一次性非持久化判断会话（三引擎同期）、只读能力注入 + deny-all 写门禁、15s 超时/中止、防循环、allow 必须无损、deny 始终有效；客户 D1：deny 档 allow 照常放行并标 `hardDenyOverride`；审计透传 `judge`（`by` 以 `operator:judge:<引擎>` 结尾） | **已实现（P2 编排；适配器/桌面接线待各属主）** | [api-spec](api-spec.md)；[实施记录](changelog.md#2026-10-17--替我审判断-agentp2-编排驱动与审计透传) |
| **治理卡判断 agent（「替我审批」/「替我决策」，编排驱动）** | `createGovernanceJudge`：三引擎一次性只读判断会话、六卡种 rubric、required-read 与逐路径机械复核、accept-quick 不代批、负向一律 manual；`run-role` 计算 `judgeContext`（trio 限定）、账本写 `decisionEvidence.kind:"judge"`、两交互工具 judge 代批回执 | **已实现（P2 编排；`createGovernanceJudge` 接线/桌面状态机归 P4）** | [api-spec](api-spec.md#2026-10-18-p2治理卡判断-agent替我审批替我决策)；[变更记录](changelog.md#2026-10-18--p2-编排治理卡判断-agent替我审批替我决策) |
| **治理三权编排接线（W2）** | trio 三内置角色的会话职能选择（`--function`）、注册表能力矩阵/预授权/禁写、`.ans/governance/ledger.jsonl` 审计账本、三道门禁（提案接受/任命写入/派发五条）、`customer.decision` 与 `artifact.observed` 落账 | **已实现（W2；桌面 W3/UI W4 待各属主）** | [api-spec](api-spec.md#w22026-10-17治理三权在编排层的接线账本--门禁--能力矩阵)；[W2 记录](changelog.md#2026-10-17--w2治理三权编排接线账本--三道门禁--能力矩阵) |
| **治理四角色编排接线（W6-A）** | Liaison 意图交接（`hand_off_intent`：意图文件权威/四要素/slug/去重/`initial` 一次性/每轮一次）+ Rapporteur 澄清（`request_clarification`：同一 flow 最多 2 轮）；账本 `intent.handed-off`（`power:"liaison"`）与 `clarification.requested`；CLI 显式拒绝 `--function/--role liaison`（AC21）、缺省 proposal 保持；能力矩阵按注册表注入（Liaison 无确认卡/派发/看护/安装/shell） | **已实现（W6-A 编排；桌面 W6-B / UI W6-C 待各属主）** | [api-spec](api-spec.md#w6-a2026-10-18治理四角色编排接线意图交接--澄清--账本)；[W6-A 记录](changelog.md#2026-10-18--w6-a治理四角色编排接线意图交接--澄清--账本) |
| **治理模型迁移（`su → trio`，V1b）** | `previewGovernanceMigration` 零写入预览（字段快照/写路径/manifest 行/保留文件/摘要）/ `migrateGovernanceModel` 客户确认后只改 `.ans` 的 `governanceModel:"trio"`（保留全部既有/未知字段）+ manifest 升级留痕 + 账本 `governance.migrated`；不重写角色卡/边界/pin、不删历史、不建 `角色卡/su/` | **已实现（V1b 编排侧；桌面 IPC/UI 待各属主接线）** | [api-spec](api-spec.md)（V1b 节）；[迁移记录](changelog.md) |
| 回交（任务报告） | 按真实ACK/turnId隔离来源、报告与证据，普通聊天不自动回交；正式任务未报告/失败如实回交，最终报告按真实bound档保存，失败仅保存恢复；主入口核对已收到报告后向客户汇总 | 编排已实现并验证 | [任务报告回交](docs/feature/task-handback.md) |
| su 派发任务 | su 把任务派发给项目角色（前端路由：未开自动开/忙排队/去重）；派发 ≠ 授权 | 已实现（编排侧） | 功能文档待补（[派发接线](docs/change/2026-10-12_change_su-dispatch-wiring.md)、[派发回执](docs/change/2026-10-12_change_dispatch-receipt-queue.md)） |
| 会话开局注入（已安装技能节，G-4 I4） | `renderInstalledSkillsSection(projectRoot, roleId)`：读 `docs/skills/<name>/install.md` 登记＋当刻字节 digest，渲染「本角色已安装技能（先读）」指针节；坏件跳过不拒会、零技能空串；三适配器系统提示各拼接一段（接线待其属主） | 编排侧已实现（渲染单一来源；三适配器接线待其属主） | [G-4 I4/I5 记录](docs/change/2026-10-16_change_g4-skill-injection-and-preauth.md) |
| 交互工具 CLI 通道 | CLI 端的客户确认/操作者确认通道（stdin 问答；EOF/未识别一律 fail-closed） | 已实现 | 功能文档待补（[客户确认不设超时](docs/change/2026-10-12_change_customer-input-no-timeout.md)） |
| 会话自持目录（重启恢复） | 会话数据按角色/runtime 隔离于 `.ans/sessions/<role>/<runtime>/`（Service 注入存储，实际持久化才建目录） | 已实现（编排侧） | 功能文档待补（[session-dir 接线](docs/change/2026-10-12_change_session-dir-restore-wiring.md)） |

## 说明

- 功能点 = 用户或外部系统能触发并得到结果的行为；本角色不自编项目管理/测试等功能。
- 跨角色事项（Pi 适配器、门禁引擎、桌面应用）不在本导航重复，按各自角色文档链接。
- 每份 `docs/feature/<feature-id>.md` 补齐时，在本表对应行更新链接。
