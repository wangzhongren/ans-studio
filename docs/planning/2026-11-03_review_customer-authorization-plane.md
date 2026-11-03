# 客户授权平面——两个标记 `@审批` / `@决策` 复核记录

- 复核对象：`docs/planning/2026-11-03_design_customer-authorization-plane.md`（P1.0，2026-11-03；1147 行；SHA-256 `6260008c840ba03c0933801638b00a00c97f06529dd1398918ff6aa7fc4766a5`，复核时按 `wc -l` / `sha256sum` 重算一致）
- 复核模式：**完整复核**（选择依据：跨 Model/Provider/Service/Pipeline/Interface 与 shell gate、decision 卡两个消费者；新增共享业务契约、事件 schema 与 IPC；涉及授权、撤销、高危与治理材料；含多个选装与范围不确定项——不满足轻量条件，`planning-proposal-review` §3.3 全部情形均触发）
- 复核上下文：同一策划角色的独立只读上下文（由沟通启动）
- 闸门 0 记录：`docs/communication/2026-11-03_intent_customer-authorization-plane.md`（69 行；SHA-256 `91d77bb868c78dcee4d32adf94db96645843ce8f3672b7a2e4017326c128400a`，复核时重算一致）
- 代码基线：worktree `customer-authorization-plane`，分支 `feat/customer-authorization-plane`，HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`；复核时工作区仅两份未跟踪文档（本方案与闸门 0 记录）
- 复核日期：2026-11-03
- 本记录只链接方案路径与版本，不复抄方案正文；复核只作建议，不是批准、不是闸门 1 客户确认、不是实施授权、不是验收基线。

## 复核对象快照

| 项 | 值 |
| --- | --- |
| 方案版本 | P1.0（2026-11-03，状态：草案） |
| 行数 | 1147 |
| SHA-256 | `6260008c840ba03c0933801638b00a00c97f06529dd1398918ff6aa7fc4766a5` |
| 闸门 0 记录 | 69 行 / `91d77bb868c78dcee4d32adf94db96645843ce8f3672b7a2e4017326c128400a` |
| 代码基线 | HEAD `243d8f6a6db663a383b516aad6320c5110c7f583` |

## 复核模式与依据

按 `planning-proposal-review` §3.2/§3.3：本方案跨模块（Model、Provider、Service、Pipeline、桌面 Interface/渲染）、新增共有业务契约（`customer-directive/v1` 事件与视图、`SendResult`/`ShellReviewResult`/`CustomerInputOutcome` 加法字段）、改变授权与审计语义（客户指令的放行/拒绝/代选与归属）、含 O1–O8 多个选装与 Q1–Q10 待决点，且风险涉及不可逆行为与治理边界，故按完整模式检查 OD-1 至 OD-5、MK-1 至 MK-6。

## 独立核对过的事实

以下为复核上下文按真实代码（HEAD 快照）逐项只读抽检的结果；不采信作者自述，行号以本次复核实际读到的位置为准。

| # | 方案断言（位置） | 独立核对结果 |
| --- | --- | --- |
| 1 | 输入路径 Composer→`session:send`→main→Interface→SessionManager→sendDelivery（§2.1，2-1..2-8） | **一致**：`app/renderer/src/shell/Composer.tsx:232-234`（trim/空文本拒绝）、`:268`（target）、`:282-286`（先 `appendLocalUser` 再 `bridge.sendSession`）、`:295-320`（未接受恢复草稿）；`app/preload.cjs:65-66`（`session:send`）；`app/main.ts:894`（`registerHandler("session:send")`）；`app/desktop/interface.ts:2339-2371`（主进程重校验图片→`manager.send`）；`app/desktop/session.ts:3167-3291`（`send`）；`:1497-1528`（`sendDelivery`，`:1500` 写 `lastUserText`） |
| 2 | 发送路径无前缀/命令解析（2-9） | **一致**：上述两处均无 `startsWith("@")`、斜杠命令或前缀解析（全仓检索无相关命中） |
| 3 | `@审批`/`@决策`/`@边界` 源码与测试零命中（2-10） | **一致**：`src/`、`app/`、`test/` 字面检索均零命中 |
| 4 | `customer.directive` 现状不存在（2-11、§2.3） | **一致**：除本次方案与意图记录外全仓零命中；`customer.decision` 仅存在于注释/文案/旧测试夹具（如 `src/pipeline/orchestration/run-role.ts:848`、`:978`，`app/desktop/customer-input.ts:277`、`:544`、`:1420`，i18n 文案），不是现存账本 |
| 5 | `.ans/state/tasks.jsonl` 先例（2-12..2-14、2-42） | **一致**：`src/common/编排/task-state.ts:4-12`（app-only、append-only、角色不可写、旧 gate/flow/ledger 不读）、`:41`（路径常量）、`:42-46`（5MiB/3 份/env 可调）、`:49-56`（kind 白名单）、`:233-258`（轮转）、`:260-267`（追加串行链）、`:589`、`:651-698`（轮转旧→新、坏行跳过并记录） |
| 6 | `request.resolved.by` / `version.decision.decidedBy` 只允许 customer\|judge（2-16、2-45） | **一致**：`task-state.ts:342-344`、`:462-464`；`src/model/project-state.ts:91`；`src/common/编排/run-manifest.ts:87`、`:619`；`app/desktop/session.ts:4165-4197`（`judged` 仅识别 `judge:` 前缀→`by`）、`:4657-4690`（`decidedBy` 计算与写入）、`:4469-4470`（文案窄联合） |
| 7 | run-change 归属映射（2-31） | **一致**：`app/desktop/session.ts:1977-2092`，`:2077` `operatorId.startsWith("judge:") ? "judge" : "customer"` |
| 8 | 两个判断开关与操作者通道（2-19..2-21） | **一致**：`app/main.ts:338-344`（两个独立开关）、`:559-561`（`isGroupEnabled`）；`app/desktop/session.ts:2619-2638`（每会话 metadata：roleId/projectRoot/runtime/signal/turnText/judge）；`app/desktop/operator-channel.ts:498-522`（开关/无 judge/中止→原 present）、`:527-540`（`ShellJudgeRequest` 字段：command/argv/cwd/toolCallId/roleId/projectRoot/runtime/policy/tier/reason/turnText/approvalContext，**无客户指令字段**） |
| 9 | shell 闸三层链与硬地板（2-22、2-24） | **一致**：`src/common/编排/shell-gate.ts:13-31`（链说明）、`:465-1073`（`createShellGate`/`decide`）、`:492-494`（`readonlyOnly` 禁止注入 `takeGrant`）、`:596-617`（写守卫 deny）、`:664-703`（script 分支 takeGrant）、`:769-781`（非 script review/risky 才查 takeGrant）、`:787-820`（advisory/approveDeny 的 `c-deny→a-*`） |
| 10 | shell 升级授权只活在角色会话且 dispose 清空（2-23、2-38） | **一致**：`src/common/编排/shell-escalation.ts:5`、`:181-189`（键 `(roleId, projectRoot, cwd, entry, 规范化 argv)`）、`:255-261`（once/session）、`:312-314`、`:357-359`、`:590-596`（`dispose` 清空 records/grants/requestedKeys/pending） |
| 11 | 判断器分组与治理 facts（2-25..2-27） | **一致**：`src/model/runtime.ts:419-439`（`GovernanceJudgeGroup`、`GOVERNANCE_CARD_GROUP`：appointment-write→approval；proposal/appointment/acceptance/intent-confirm/decision→decision）、`:1868-1935`（`GovernanceJudgeFacts`，无客户指令字段）；`src/pipeline/orchestration/run-role.ts:1117-1199`（`judgeContext` 唯一计算点，`buildGovernanceJudgeFacts`）；`src/common/编排/governance-judge-facts.ts:8-11`（`ledgerErrors>0` 禁止 approve）、`:134-154` |
| 12 | decision 卡不调用模型、确定性默认推荐（2-28、2-29） | **一致**：`app/desktop/customer-input.ts:1066-1123`（`planJudge`，`:1075` decision 卡直接返回 undefined）、`:1426-1486`（`tryAutoSelectDecision`：开关开、trio、推荐项仍在卡内、结果行投达成功→`answered`+judge 审计；不调用模型）、`:1489`（`presentEntryNow`） |
| 13 | decision 卡校验（2-30） | **一致**：`src/common/编排/decision-card.ts:86-145`（仅 convener/rapporteur 或 `application:true`；choice；合法 flowId；≥2 选项；id 非空不重复；恰一个 `recommended:true`） |
| 14 | `.ans/**` 读取隔离（2-17） | **一致**：`src/common/runtime-core/shell-judge/policy.ts:241-253`（任何 `.ans` 段即 app-private）；`src/common/编排/governance-judge-prompt.ts:98-104`（一律拒绝 `.ans/**`） |
| 15 | 偏好与配置单一来源（2-18、2-43、2-44） | **一致**：`app/desktop/preferences.ts:28-37`（开关形状/缺省全关）、`:50-52`（`<userData>/ans/preferences.json`）、`:116-128`（未知键/非布尔⇒全关+诊断）、`:251-256`（写失败如实返回）；`src/common/shared/config-loader.ts:37-39`（`.ans` 常量） |
| 16 | 面板/IPC/重推现状（2-32..2-37、2-39..2-41） | **一致**：`app/main.ts:525-573`（operator 通道；`:547-556` delivery-note 系统行）、`:577-626`（shell 确认卡共用通道）、`:627-693`（开关 IPC，sender 校验）、`:638-656`（本次运行暂停）、`:613-619`（`app:recovery-ready` 幂等重推）；`app/preload.cjs:196-313`；`app/renderer/src/chat/ipc.ts:1-8`（通道消费清单/命名惯例）；`customer-input.ts:1189-1225`、`:1322-1332`（switch-off 回落客户卡）、`:1874-1928`（回包快照校验）、`:1930-1955`（`rejectAllPending`） |
| 17 | 联网/外部目录没有独立审批消费者（§0、§2.8、2-46..2-48） | **一致**：`src/common/runtime-core/network-gate.ts:1-13`（仅在线/离线与等待窗口）；`src/common/pi-adapter/real-adapter.ts:648-660`（web_search/web_fetch 默认关）、`src/common/codex-adapter/config.ts:10-30`（`webSearchEnabled` 默认关）、`src/provider/claude/session.ts:556-565`（能力位默认关，判断模式强制关）；`src/common/门禁引擎/shell-write-guard.ts` 存在（写目标守卫，无 domain/path 审批对象） |
| 18 | 既有裁定引用（§6.1、§6.2/§8.5） | **一致**：2026-10-19「判断 agent 是唯一审查者」裁定存在于 `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md:20` 与 `角色卡/桌面窗口/changelog.md:86`；2026-10-26 decision 卡确定性默认推荐见 `src/model/runtime.ts:428-430`、`customer-input.ts:1073-1074` 注释与 §2-29 行为 |
| 19 | 复用先例（§3.2、§8.4、§9.4） | **一致**：渲染侧相对导入 `app/renderer/src/i18n/index.ts:14-29`；`src/common/shared/argv-primitives.ts:1-8`（属主＝项目管理）；`SendResult` `app/desktop/session.ts:370-390`；`ShellReviewResult` `src/model/runtime.ts:242`；`CustomerInputOutcome` `src/model/runtime.ts:523`；`ShellAuditRecord.customerGrant` `src/common/编排/shell-audit.ts:109`；`app/renderer/src/chat/DecisionCenterPanel.tsx` 存在 |
| 20 | T3 定档（§11.3） | **一致**：`references/testing.md:18`（release/shared-abstraction/governance-permission/证据不确定＝T3，需全量适用回归）；方案理由（共享 Model、公共入口、跨模块、权限语义）成立；客户在闸门 0 已声明 T3（意图记录 :8） |

## 清单结果

| 条目 | 结果 | 说明 |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 必做项可对应闸门 0 目标与已查实现状；共享 JSONL 抽取给出退路 B；失败处理与风险相称；未发现为"以后可能要用"预留的抽象。Q5 的缩减问题计入 F1（属范围确认，不属过度设计） |
| OD-2 必做与选装 | 发现 | O1–O8 有稳定编号、好处、代价、不加会怎样，且未勾选冒充批准；但回滚开关（§9.5）作为"建议"未列入选装清单、无待确认状态与 AC（F7） |
| OD-3 复用 | 通过 | 复用 tasks.jsonl 的 JSONL 纪律、operator/确认卡模式、decision 卡校验、`GOVERNANCE_CARD_GROUP`、i18n 与注入先例；明确不新增第二本账/第二解析器/第二写门禁 |
| OD-4 非目标 | 发现 | 非目标清单清楚；但 Q5 默认 A 实质缩减闸门 0 已确认的"联网/外部目录"覆盖，必须在闸门 1 作为显式客户决定（F1） |
| OD-5 被否决的备选 | 通过 | Q1–Q10 的备选真实可核（如 Q10 B 引用的 `DecisionCenterPanel.tsx` 确实存在；Q2 B/C 的代价成立）；未发现为凑对比编造的备选。Q9 的编号矛盾见 F2 |
| MK-1 目标 | 发现 | 目标/问题/成功行为可追溯到闸门 0 原话；事实与设计候选分标（[现状]/[设计候选]/[待客户决定]）；但"角色/模型不能读 `.ans`"超出实际结构保证（F4），Q5 缩减需显式确认（F1） |
| MK-2 完整流程与失败分支 | 发现 | 主流程、两个消费者、失败表与并发表基本完整（面板不可用/取消/写盘失败/解析失败/撤销非法/坏账本/高危未勾选/硬地板/决策不匹配均有落点）；冲突路径与默认推荐的关系未写明（F6），与既有确认卡队列/呈现槽的共存未说明（F8） |
| MK-3 输入输出 | 通过 | 面板字段、事件字段、约束（id/target/until/rawText/command/host/path/selector/highRisk/sessionId）与边界情形（空正文、带图、超长、NUL）可核对；§4.3"命令为空"与 §5.2 非空约束不一致（随 F9） |
| MK-4 契约 | 发现 | §5.6 契约章节完整（涉及角色/输入输出/共享术语/交接条件/行为保证/版本变更）；Q9 编号与推荐自相矛盾（F2）；Q9 扩展面更新清单遗漏 `session.ts` 的生产/展示点与 `requirement-change.ts` 读者（F3）；"允许列表先行"与"deny 最先"互斥（F5） |
| MK-5 完成标准 | 通过 | AC-1..AC-20 逐条可核对，覆盖识别/不投递/回执/隔离/撤销/期限/高危/回归/非目标；AC-18 遵守"只截图不录屏"；AC-10 依赖 Q9 结论（随 F2/F3 统一） |
| MK-6 风险与未决事项 | 通过 | 风险表、未决 Q1–Q10、选装、在途重叠（§9.4）与限制均已单列；未发现隐藏假设；§9.4 的另一 worktree 无法独立核对（见"未检查事项"） |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点 | **重要** | §0（:35-38）、§1.4（:132）、§2.8（:257）、§13 Q5（:1048-1056）、O1/O2（:985-988）、§15.4（:1125-1126） | 闸门 0 的 `@审批` 明确覆盖"shell / 联网 / 外部目录的允许、拒绝、撤销"（意图记录 :16、:38、:47）。P1.0 推荐 Q5 A：domain/path 只记录、不生效、面板标"暂无消费者"，O1/O2 才新增闸。这是对已确认意图覆盖面的实质缩减；方案虽在多处如实披露，但 A 以"推荐"并入 Q1–Q10 总体确认，客户可能在未逐项确认 Q5 时随"确认方案"一起通过。 | 意图记录 :16、:38、:47；方案 :37、:132、:257、:1052-1056、:1126 | 闸门 1 材料把 Q5 单列为显式 yes/no 决定：确认"选 A = 本轮联网/外部目录指令不生效"；把 O1/O2 说明为"补齐闸门 0 该部分意图的选装"而非一般健壮性选项；面板/回执的"暂无消费者"文案须与决定一致。 |
| F2 | 漏重点 | **重要** | §6.2 第 7 条（:643）、§9.2（:848、:857）、§13 Q9（:1090-1098） | Q9 选项字母自相矛盾：§13 表定义 A（推荐）＝扩展枚举为 `"directive"` 并记 `directiveId`，B＝不改 schema、仍记 `by:"customer"`；但 §6.2 第 7 条与 §9.2 标题把"扩展枚举"称为 Q9 B，§9.2 末尾又把 Q9 A 说成"不改 schema"并"推荐 B"。同一客户决策点出现两套字母与两套推荐，客户无法据此确认，实施范围（是否触及旧验证器/读者/i18n）随之摇摆；AC-10"run-change 归属按 Q9"也随之歧义。 | 方案 :643、:848、:857、:1090-1098；`task-state.ts:342-344`、`:462-464`（扩展面真实存在） | 统一 Q9 编号与定义，只保留一个推荐；§0/§6.2/§9.2/AC-10 全部改为一致引用；若推荐扩展枚举，写清 T3 代价与完整更新清单（见 F3）。 |
| F3 | 漏重点 | 一般 | §9.2 更新清单与"旧读者安全方向"断言；§2-31（:218） | 若采用扩展枚举，§9.2"必须同一变更内更新"清单遗漏 `app/desktop/session.ts` 的实际生产点：`:4165-4197`（`request.resolved` 的 `judged` 计算与 `by` 写入）、`:4657-4664`（`decidedBy` 计算并传入 `mapVersionDecisionAnswer`）、`:4469-4470`（`decidedByText` 窄联合）；也遗漏读者 `app/desktop/requirement-change.ts:316-318`（`source === "judge" ? judge : customer`，会把 `"directive"` 误显示为"客户在 decision 卡上选择"）。设计称"旧读者只做 `=== "customer"` 判断……安全方向"本身成立，但存在做 `=== "judge"` 判断的旧读者，该断言未覆盖；§2-31 只引 `:2077`。 | `session.ts:4165-4197`、`:4469-4470`、`:4657-4690`；`requirement-change.ts:316-318`；`task-state.ts:342-344`；复核另确认 `session.ts:4141-4147` 的通道异常分支只写 `"customer"`，不受影响 | 把上述生产/展示点补入清单；将"旧读者安全方向"改为逐点核对；AC-10/AC-15 增加"directive 归属在 request.resolved / version.decision / run manifest / UI 文案四处均如实显示"的断言。 |
| F4 | 漏重点 | 一般 | §5.4 表"角色/模型"行（:563）、§1.5 术语（:154） | 称角色/模型"无任何读写路径；不能读 `.ans`"。实际结构保证只覆盖：判断 agent 只读工具对 `.ans/**` 整体硬排除；角色写路径被 write-guard/forbiddenWritePaths 拒绝。shell 读命令没有对应护栏：`classify-shell.ts` 与 `src/service/gate/shell-rules.ts` 均无 `.ans` 读取规则，角色经 run_shell 执行 `cat .ans/state/customer-directives.jsonl` 会走既有审批链（与 `tasks.jsonl` 的既有暴露相同），放行后可读。作为安全承诺超出了实际结构。 | `policy.ts:241-253`、`governance-judge-prompt.ts:98-104`；`classify-shell.ts`/`shell-rules.ts` 无 `.ans` 命中；`shell-write-guard.ts:30`（仅禁写）；方案 :154、:563 | 将承诺限定为"无直接 API/工具读取路径；shell 读取与其他 `.ans` 运行数据同受既有 shell 审批与审计"；若确实要求结构性禁止读取，需新增读取防护——属新行为，应另行列入选装/范围决定并补 AC。 |
| F5 | 漏重点 | 一般 | §6.1 判定顺序（:598-610）与"与既有 shell 允许列表的关系"（:627）、§6.3 表（:663） | 同一节内互斥：顺序表把"审批指令 deny 检查"放在 `c=allow` 之前（第 4 步先于第 6 步），优先级段写"deny 指令最先……可拒绝 `c=allow`"；但"与既有 shell 允许列表的关系"写"允许列表（c=allow）仍然先行、仍然放行"，§6.3 表也写"允许列表 先行"。实现与验收会面对两种口径。 | 方案 :598-610、:627、:663；`shell-gate.ts:769-781`（既有 grant 只在 review/risky 查） | 统一措辞：deny 指令先于 c=allow/c=deny/script/allow 指令；允许列表只先于 allow 指令；"先行"仅指 allow 侧且不被 allow 指令扩大。 |
| F6 | 漏重点 | 建议 | §6.2 第 5、6 条（:641-642） | 冲突分支写"不代选，回落客户卡"，但未说明是否同时压制既有 `tryAutoSelectDecision` 默认推荐；第 6 条只对"不匹配的 select-option"明确阻止默认推荐。若冲突路径让默认推荐先行，"不代选"落空（会以推荐项静默代选）。 | `customer-input.ts:1426-1486`（默认推荐在 `presentEntryNow` 内先行）；方案 :641-642 | 明确冲突与不匹配两条路径都绕过默认推荐（或写明例外），补 AC-10 断言。 |
| F7 | 过度设计 | 建议 | §9.5（:882）、§3.3 第 7 步（:318） | `ANS_CUSTOMER_DIRECTIVES_DISABLED=1` 回滚开关以"建议"出现，无稳定选装编号、待确认状态、收益/代价，不在 AC；按选装规则应列为 O 项或明确为必做。另：该开关开启时主进程不拦截标记、按普通聊天投递，而渲染侧仍按同一纯函数抑制用户气泡——该组合下的界面行为（是否走"补画气泡"路径）未写明。 | 方案 :882、:318；`Composer.tsx:282-320`（先画气泡/未接受恢复草稿的现状） | 将回滚开关列为 O9（或改为必做并纳入 AC），写清禁用态下渲染侧回显与 `session:send` 返回的关系。 |
| F8 | 漏重点 | 建议 | §3.3（:331）、§3.5（:343）、§4.5、§8.4；既有 `app/main.ts:577-606`、`customer-input.ts:634-652` | 指令面板设计为独立应用级通道，但未说明与既有 shell 确认卡"每窗口共享呈现槽"和 `customer-input`"一项目一卡"队列的共存语义：角色 shell 卡待答时客户再输入 `@审批`、或指令面板待确认时角色发卡，会怎样（并行模态/排队/互相阻塞）没有定义，也无 AC/UI 测试。 | `main.ts:577-606`（shellCardSlot 排他）、`customer-input.ts:634-652`（一项目一卡） | 补一段共存/仲裁规则（例如指令面板独立模态、不占治理卡槽；或明确排队），并在 AC 中覆盖。 |
| F9 | 漏重点 | 建议 | §4.3（:399）、§4.1（:362）、§9.4（:873） | 文字级不一致：§4.3 把"命令为空"列为高危谓词，但 §5.2 规定 `command` 非空（该谓词不可达）；§4.1"Q/O6"应为 O6；§9.4"judgedContext"应为 `judgeContext`。 | 方案 :399、:362、:873、:505-512 | 校正文字，避免按不可达谓词写测试。 |

## 复核结论

**建议修订后提交**

理由：方案总体忠实覆盖闸门 0 意图，现状核实与架构设计扎实，失败分支、隔离强制点与 AC 覆盖度较好；但存在两个影响客户决策的重要发现（F1：联网/外部目录缩减必须在闸门 1 显式确认；F2：Q9 编号/推荐自相矛盾），且 Q9 扩展面的兼容性说明（F3）与两处结构承诺/顺序表述（F4、F5）需要修订后才适合作为闸门 1 的确认对象。修订不改变已确认的闸门 0 口径。

## 未检查事项、限制与未解决意见

- **未读取另一 worktree**：按复核约束未读取 `contract-schema-query` 所在原 worktree 与 `flow-improvements-wave1`，§9.4 的"与在途变更重叠"评估只做文本审阅；无法独立确证对方 diff 的文件/区域与 rebase 顺序建议是否成立。该项不据此判定对错，记为未独立核实。
- **未运行任何测试、构建或应用**：方案尚未实施，且复核只读；本记录中的代码事实均为 HEAD `243d8f6` 快照的静态阅读结果，不代表运行时行为；Mermaid 图未渲染验证。
- **抽检范围**：已覆盖承载性断言（输入链、账本先例与归属枚举、判断器事实源、decision 默认推荐、shell 升级/dispose、IPC/开关/偏好、联网缺口、既有裁定、复用先例、T3 定义）；未逐条复核对附录 A 的全部锚点（如 `app/main.ts:863-894`、`run-role.ts:678-705` 等细节行号），未检查 `test/` 全量。
- **未解决意见（供作者决定是否补充）**：① 项目切换/多项目窗口下，指令面板与 `session` 指令的归属细节未定义；② §9.5 提到人工把坏账本改名恢复，但未讨论 `seq` 重置后与历史 `#d-N` 回执/审计的 id 复用风险；③ §4.3 将项目级 `select-recommended` 排除在高危之外的理由是"等同于现有推荐默认"，但在 Q7 A（指令独立于开关）下，开关关闭时现有默认推荐本不会执行——建议在高危理由或面板文案中补充这一差异说明。
- 本复核是**建议**：不是批准、不是闸门 1 客户确认、不是实施授权、不是验收基线；方案正文只由作者修改，作者逐项处置后由沟通在闸门 1 材料中如实披露未解决意见。

## 再复核记录（P1.1）

- 复核版本：P1.1（2026-11-03；1199 行；SHA-256 `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`，复核时按 `wc -l` / `sha256sum` 重算一致）。P1.0（1147 行 / `6260008c…`）保留为历史快照。
- 复核范围：只覆盖受影响部分（§0、§1.4、§2.8、§2-17/§2-31、§3.3/§3.5、§4.1/§4.3、§5.4/§5.5、§6.1–§6.3、§7.1、§9.2/§9.4/§9.5、§12、§13、§14、§15、AC-9/10/13/15/20–24），未重读未受影响章节全文。
- 复核方式：逐项核对 §14 处置表是否**真实落入正文与 AC**（不采信处置表自述）；全文检索 `Q9`、`允许列表`、`directivesEnabled` 等关键词确认无残留反向表述或新矛盾。

### 处置核对（F1–F9）

| 发现 | 状态 | 正文/AC 证据（P1.1） |
| --- | --- | --- |
| F1（联网/外部目录缩减） | 已解决 | §0（:38、:41）、§1.4（:135）、§2.8（:260）、§13 Q5（:1088）、§12 O1/O2（:1009-1012）、§15.5（:1178）、AC-20（:948）、AC-21（:949）。Q5 已明确为闸门 1 单独 yes/no，"确认整份方案不等于选 A"，未单独选择按未决处理。 |
| F2（Q9 字母矛盾） | 已解决 | §0（:39）、§6.2 第 8 条（:659）、§9.2（:864、:877）、§13 Q9（:1128-1134）、AC-10（:938）。全文 Q9 仅一种定义：A＝扩展枚举 + `directiveId`（推荐），B＝不改 schema（不推荐）；无残留反向表述。 |
| F3（Q9 更新清单/旧读者） | 已解决 | §2-31（:221）、§9.2 更新清单（:864-876）、AC-10（:938）、AC-15（:943）。`session.ts:4165-4197`/`:4469-4470`/`:4657-4690` 与 `requirement-change.ts:316-318` 均已列出；"旧读者安全方向"改为逐点核对，明确 `=== "judge"` 读者必须修。 |
| F4（`.ans` 读取承诺） | 已解决 | §1.5（:157）、§2-17（:195）、§5.4（:577）、O10（:1027-1028）。承诺限定为"无直接 API/工具读取路径；shell 读取同 tasks.jsonl 受既有审批/审计"；结构性禁止读取作为 O10 默认不实施。 |
| F5（允许列表顺序） | 已解决 | §6.1（:625、:642）、§6.3（:679）、AC-9（:937）。deny 指令先于 `c=allow`；允许列表只在 allow 侧先行；全文无"允许列表仍然先行、仍然放行"式残留。 |
| F6（冲突/默认推荐） | 已解决 | §6.2 第 5–7 条（:656-658）、§6.2 关系段（:669）、AC-10（:938）。冲突与不匹配两条路径都绕过 `tryAutoSelectDecision`；默认推荐只在无适用指令时运行。 |
| F7（回滚开关/O9） | 已解决 | §3.3 第 7 步（:321）、§9.5（:902）、O9（:1025-1026）、AC-23（:951）。回滚开关列为 O9 默认不实施；禁用态回显由主进程能力位驱动。 |
| F8（面板共存） | 已解决 | §3.5 共存段（:354-359）、项目切换行（:352）、§7.1（:719）、AC-22（:950）。指令面板不占 `shellCardSlot`、不进一项目一卡队列、不互相阻塞；项目切换取消未决面板。 |
| F9（文字不一致） | 已解决 | §4.1（:373，`Q/O6`→O6）、§4.3（:410-413，删除不可达"命令为空"并改为拒收）、§9.4（:893，`judgeContext`）。 |
| 未解决意见①（项目切换） | 已补充 | §3.5（:352）、§7.1（:719）、AC-22（:950）。 |
| 未解决意见②（账本重置/ID 重号） | 已补充 | §5.5（:590）、§9.5（:904）、O11（:1029-1030）、AC-24（:952）。 |
| 未解决意见③（开关关闭时项目级选推荐） | 已补充 | §4.3（:411、:415）、§13 Q7（:1112）、AC-13（:941）。 |

### 剩余发现（均为建议级，不影响提交）

| 编号 | 类别 | 严重度 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- | --- | --- |
| R1 | 漏重点 | 建议 | §3.3 第 7 步（:321）、§9.5/O9（:902、:1025-1026） | `directivesEnabled` 能力位只在 O9（默认不实施）语境下描述；若 O9 未选，基础实现是否仍由主进程推送该位（指令平面启用时恒 `true`）未写明。若基础实现不推送，§3.3 第 7 步"仅当 true 才抑制气泡"无来源，与 §1.2"命中时不出现发给幕僚的用户气泡"的成功标准衔接不清。 | 明确能力位属基础实现（指令平面启用时主进程推送 `true`，项目切换重推），O9 只增加由 env 控制 `false` 的分支；或在 §3.3 写明 O9 未选时的默认值来源。 |
| R2 | 漏重点 | 建议 | AC-13（:941）、§13 Q7（:1112） | AC-13 新增"开关关闭时项目级 `select-recommended` 触发高危"未注明以 Q7 A 为前提；若客户选 Q7 B，该组合不会应用（§13 Q7 说明），该子句不可核对。 | 在 AC-13 加"（Q7 A 时）"条件，或让该子句与 Q7 客户选择联动。 |

### 备注（记录衔接）

- 方案 §14（:1150）引用复核记录为 94 行 / `5bda5ff7…`；本再复核节追加后记录行数与 SHA-256 会变化。建议沟通在闸门 1 材料中同时引用本「再复核记录（P1.1）」节与新的记录哈希，或由作者在下一版把 §14 的引用改为"P1.0 复核部分 + P1.1 再复核节"。本再复核只追加本节，未改方案正文，也未改 P1.0 复核部分。

### 再复核结论

**建议提交客户确认**。F1–F9 与三条未解决意见均真实落入正文与 AC（非仅 §14 声称），未发现新矛盾；Q5/Q9 已明确为闸门 1 单独 yes/no 决定；O9–O11 均明确默认不实施。仅余 R1/R2 两条建议级备注，不影响闸门 1，沟通可按规则如实披露。
