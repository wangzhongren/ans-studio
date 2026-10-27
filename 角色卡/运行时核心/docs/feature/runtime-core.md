# 同一套治理工具与隔离会话

编排在用户选择 Pi、Codex 或 Claude 后，交给核心固定的角色和已注入能力。核心让这些引擎收到相同的工具与处理器：初次门禁拒绝不创建目录或文件；写前重判拒绝不提交目标文件，但可能保留已创建的父目录。客户拒绝或停止也不会变成同意。开启持久化后，可读历史按角色和引擎隔离保存。

状态：C1 核心已实现及无网络验证；三种 SDK 与 CLI/桌面入口最终接线由各原属主验证。

```mermaid
flowchart TD
  input[编排提供 role runtime gate 与注入能力] --> choose[Service 懒加载所选公开工厂]
  choose -->|缺依赖或工厂失败| error[如实返回失败]
  choose --> inject[注入公共 schema handler 和精确 storage]
  inject --> precheck{disposed active quarantined 检查通过?}
  precheck -->|否| prereject[拒绝 无新turn 无开始通知]
  precheck -->|是| prompt[生成固定 turnId 绑定本轮]
  prompt --> ack[原prompt闭包同步一次开始确认]
  ack -->|callback抛错| ackfailed[failed终态 释放active 无nativeprompt]
  ackfailed --> terminal
  ack -->|返回或缺省| inputecho[保存原输入 取消检查 单次typed输入事件]
  inputecho --> native[原nativeprompt 图片对象透传]
  native --> call{工具请求?}
  call -->|写或编辑| writegate{写 gate 允许且未停止?}
  writegate -->|否| deny[拒绝 无写入副作用]
  writegate -->|是| guard{真实路径与目标状态有效?}
  guard -->|否| deny
  guard -->|是| prepare[write_file按需建父目录 edit_file保留原目录]
  prepare --> regate{同一写gate重判且真实父目录未变?}
  regate -->|否| stopped[拒绝 未提交文件 可能已有父目录]
  regate -->|是| atomic[读取普通mode 临时文件写入并恢复权限后原子替换 随信号取消]
  call -->|shell| shellgate{审核明确 allow 且未停止?}
  shellgate -->|否| deny
  shellgate -->|是| child[剥离凭据后执行 argv]
  call -->|确认或选项| wait[暂停 prompt 时限 等客户回应]
  wait -->|拒绝或中止| no[未获客户同意]
  wait -->|明确回应| answer[如实交回结果]
  call -->|报告派发审读| receipt[仅调用注入能力 如实交回回执]
  native --> stop{停止或超时?}
  stop -->|是| abort[每轮一次中止请求]
  abort -->|一秒清理失败| quarantine[报错 隔离当前会话]
  abort -->|清理完成| terminal[一个 settled 标明实际 outcome]
  atomic --> terminal
  stopped --> terminal
  child --> terminal
  deny --> terminal
  no --> terminal
  answer --> terminal
  receipt --> terminal
  stop -->|否| terminal
  terminal --> persist{显式开启持久化?}
  persist -->|否| memory[保持内存 无 .ans 创建]
  persist -->|是| save[保存 ANS 回放与 adapter 确认的原生结果]
  save -->|失败| failure[抛出存储错误 修复后可重试]
  save -->|成功| done[本轮结束 可继续下一轮]
```

使用核心 API 的最小调用是 `createRuntimeAdapter({ runtime, gate, projectRoot, skillRoot, providerFactories }).bindRole(role)`；需要写入时明确传项目根 writeRoot，需要存历史时传 `persistSession: true`。`providerFactories` 在测试中接收与真实 adapter 完全相同的 tools/storage，测试直接调用实际 handler。公开完整参数见 [api-spec](../../api-spec.md)。

2026-10-21 D3：写文件和编辑文件在提交前复用同一 `WriteGate`，实际目标是否满足角色边界和任务写集仍由门禁决定。核心复核真实父目录与首次守卫一致，拒绝目标文件本身的链接或其他非普通文件；状态读取仅 `ENOENT` 可按新文件处理。POSIX 已有文件保留 `mode & 0777`，共享原子写在临时句柄恢复权限、同步后才替换目标；新文件仍按 `0600` 和 umask 创建。失败或中止不提交半成品，但这不提供无竞态的 OS 隔离。Windows 原生结果仍待独立验证。当前核心回归和限制见 [D3 修复记录](../fix/2026-10-21_fix_d3-file-write.md)。

每条原始输入可在 `PromptOptions.onTurnStarted` 同步获知Core真正创建的 `turnId/roleId/runtime`。通知在前置检查通过、生成UUID后且任何输入持久化/native工作前恰一次；未创建轮次的前置拒绝没有通知。Window只在原direct/queued发送闭包捕获此ID，再按actualturn映射自己的clientMessageId，不按FIFO/latest/文本猜测。Core不会收到或存储clientMessageId；回调抛错仍按单failed终态收尾，后续合法轮次不被占住。细节及当前核心证据见 [C1A](../fix/2026-10-14_fix_prompt-start-acknowledgement.md)，实际窗口映射/renderer去重仍由D1/U1/T1验证。

Pi 外层和内层使用相同的有效 prompt/构造时限。显式参数优先，未给时读取现有 `ANS_PI_PROMPT_TIMEOUT_MS` 与 `ANS_PI_CONSTRUCT_TIMEOUT_MS`；有限正数环境值取 floor，非法或缺失回退 120000ms。显式非法值维持原 timer helper 的不设时限行为。其他引擎不读取 Pi 环境时限，仍用显式值或既有默认。这样已有 300 秒配置不会再被外层 120 秒提前切断，详见 [C1T 验证](../fix/2026-10-14_fix_pi-effective-timeouts.md)。

store 构造、读取和原生目录校验都不建目录。真正持久化时才创建自己的目录；native 准备回调拒绝符号链接。历史位于 `.ans/sessions/<role>/<runtime>/ans/`，native 位于同一隔离目录 `native/`。`readRuntimeSessionHistory` 返回 ANS 可读记录，不能据此说模型恢复了原生上下文；`resumed` 只来自 adapter 的确认，失败后重建记录为 `recovered` 并附警告。

本轮中止会使工具的客户等待返回“未获同意”。确认/选项回调现在还会收到入口捕获的原始 signal 和轮次/角色/runtime；迟到回调不能用新的轮次或信号代替旧请求判断许可。编排的许可发行者必须在真正发放路径前检查该原始信号，桌面必须使旧卡失效；这些实际消费者连接由 O1/D1 和独立测试验证。运行中的 shell 先 SIGTERM，仍未结束时 250ms 后 SIGKILL，一秒后仍没结束会报清理超时。它直接执行 argv，`shell:false`；不声称提供 OS 全面沙箱。原生 abort 挂住时同样一秒内报错并隔离会话，下一轮不能在未确认清理的上下文里运行。

公共工具的停止失败保持各自含义：确认/选项“未获客户同意”、报告/审读“未能交回”、派发“未能派发”、执行前shell“未执行”。统一取消包装不再覆盖 handler 已经返回的真实失败；迟到成功仍返回失败。实际运行后被中止的shell保留自己的运行失败信息。当前兼容验证见 [C1P](../fix/2026-10-14_fix_tool-abort-failure-messages.md)。

2026-10-22 治理确认卡未发出回执：当编排在**呈现前**拒绝一张治理确认卡时，客户通道以 `declined + notPresented:true` 表示「卡片从未呈现」，`request_confirmation` 回执改为「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意；请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」，不再说成客户拒绝；常规 `declined` 文案逐字不变，`request_choice` 不受影响。schema 同时写明五个内置治理角色必须始终同时携带 `flowId` + `cardKind`（缺失会被应用拒绝且不会向客户发卡），普通项目角色与 single/su 仍为可选。呈现前守卫本身在编排（N1），本层只负责回执与 schema 纪律；端到端行为待 N1 接线。见 [变更记录](../change/2026-10-22_change_invalid-governance-card-receipt.md)。

2026-10-25 写入预授权 system 回执：桌面「写入预授权」在**触达客户通道之前**直接结算写盘确认——边界内写盘 `answered + confirmed:true`、边界外/不可写 `declined + notPresented:true`，两种都带 `operatorId:"system:write-preauthorization"`。`request_confirmation` 现按 `operatorId` 的 `system:` 前缀**先于** `notPresented` 分流：系统放行回执明确「系统预授权已直接放行（边界内写入），不是客户确认，也不是判断 agent 代批」（`confirmed:true` 保留为技术凭据）；系统拒绝回执明确「系统预授权拒绝（边界外或不可写），不是客户拒绝、不是客户未同意」，并明说「不要改写参数或重复调用本工具重试：边界外写入不会因重试而获准」，不再输出「治理确认卡未发出/请补齐后重新调用」的误导文案。真实「未呈现」（治理字段缺项等 judge/编排来源）与客户、judge 的既有回执逐字不变；`request_choice` 不涉及（写入预授权只结算 `kind:"confirm"`）。见 [变更记录](../change/2026-10-25_change_write-preauthorization-receipt.md)。

2026-10-26 Gate 复核请求契约：客户授权把关键节点验收门禁（gate）的独立复核权归验收（Proof），统筹只做证据完整性检查并请求复核。核心新增与最终验收**独立**的请求通道 `request_gate_review({flowId?, gateId, note?})`（Model `RequestGateReviewInput/Result/Fn` ＋ `GovernedToolsOptions.requestGateReview`，未注入 ⇒ 不注册）：工具层只校验 `gateId` 为 slug、`note` 为有界文本（≤2000 字，超长拒绝不截断），并**原样转达**应用回执 `ok/code/message`（可选 `flowId`/`gateId`/`runtime`）；契约外回执（含 `passed`/`done` 等未知 code）按未派发/失败 fail-closed。`dispatched` 只表示已派 Proof——**gate 复核 ≠ 验收通过 ≠ 客户批准**；gate fail 只按 blocker/major 判失败，只有 minor/nit 不构成返工依据（防吹毛求疵）。`request_acceptance` 的形状、冻结 code、注入条件与文案逐字不变。应用侧 gate 校验/派发/记录/返工与编排/桌面注入尚未接线，因此当前生产会话不注册（fail-safe toward 现状）。见 [变更记录](../change/2026-10-26_change_request-gate-review-contract.md)。

2026-10-26 需求变更申请契约：客户要求报告员/Draft 起草提案发现需要**新的客户授权/范围**（或约束/成本变化）时，**不把未获授权的诉求塞进提案卡**，而由 `request_requirement_change` 提交需求变更审批。核心契约：Model `RequestRequirementChangeKind/Input/Result/Fn` ＋ `GovernedToolsOptions.requestRequirementChange`（**只给报告员注入**，未注入 ⇒ 不注册）；工具参数 `flowId?`/`intentId?`（至少一个，slug）、`changeKind` 五值（scope/authorization/constraint/cost/other）、`summary`（≤500 字）/`rationale`（≤4000 字）必填，`impact?`（≤2000 字）/`proposedIntentPatch?`（≤4000 字，**仅建议**）可选，超长拒绝不截断，未知参数拒绝。handler 只做形状校验并**原样转达**应用回执 `ok/code/message`（可选 `flowId`/`intentId`/`requestId`）；契约外回执（含 `submitted`/`accepted`/`done`）按未提交 fail-closed，抛错/中止不假设已提交。成功文案固定（2026-10-26 客户两次纠正后定稿）：**已提交需求变更审批（提案/统筹 decision 卡；替我决策→判断 agent，未开启→客户手选）；申请≠批准；主理只在批准后执行意图变更，不审批；发起方不得自批**；`dispatched` 只表示已提交、不代表通过；本工具不写盘、不弹卡、不改变写权。`request_clarification` 与其它工具逐字未变。应用侧校验/去重/派发/系统行与编排/桌面注入未接线，因此当前生产会话不注册（fail-safe toward 现状）。见 [变更记录](../change/2026-10-26_change_request-requirement-change-contract.md)。

2026-10-26 decision（材料性选择）卡契约：客户要求主理发现材料性选择（演示/验收证据方式、范围、标准/契约偏离、成本或客户可见行为）时**不自行决定**，交统筹（Steward）发 `request_choice(cardKind="decision")`；卡内恰有一个 `recommended: true` 推荐项；客户开启「替我决策」时判断 agent 默认选推荐项。核心契约：`GovernanceChoiceCardKind` 增 `decision`；`GOVERNANCE_CARD_GROUP` 增 `decision: "decision"`（**只表达开关分组，不表达权限**）；`CustomerInputOption` 增可选 `recommended?: boolean`（类型层只给字段，推荐项数量校验在应用/角色侧）。Provider schema：options 项增可选 `recommended` boolean、cardKind enum 增 `decision`，文案钉「仅统筹使用／恰一个推荐项／替我决策默认推荐／独立于提案·任命·验收／不等于验收·客户批准／不触发门禁·验收／`pass` 不适用」。工具层只原样透传 `recommended`——**不代选、不补默认、不校验推荐项个数**；`recommended` 非布尔按 options 非法在触达客户前拒绝，未知卡种仍拒绝（不猜）。原有卡种与 `request_choice` 回执零变化。应用侧角色白名单、判断默认选推荐项、桌面呈现与编排/桌面注入尚未接线；见 [变更记录](../change/2026-10-26_change_decision-card-contract.md)。

Service 外层已经确定的失败、中止或超时结果具有优先级；随后 inner abort 清理发出的 terminal 或事件流错误不能改写该结果。清理错误仍单独报告，清理失败仍隔离会话。正常未由外层强制的轮次照实采用 inner outcome，最终每轮一个 settled；当前竞态验证见 [C1O](../fix/2026-10-14_fix_outer-terminal-outcome.md)。

主要源码入口为 `src/service/runtime/session.ts::createRuntimeAdapter` 与同文件 `readRuntimeSessionHistory`。后者是编排的公共历史读取 operation，Service 委托现有 Provider 只返回 Model 记录/回放；桌面经 Pipeline 再到该 Service，不能直读 Provider。工具执行位于 `src/provider/runtime/tools.ts::buildGovernedTools`，实际存储位于 `src/provider/runtime/session-store.ts`。自测覆盖真实临时文件写/edit、越界与停止零副作用、实际 shell 中止、自定义凭据剥离、隔离回放及单轮结束身份；历史入口当前验证见 [C1H](../fix/2026-10-14_fix_service-history-entry.md)，原始环境与候选见 [C1 记录](../change/2026-10-14_change_runtime-core.md)。未运行真实在线模型轮次，也未完成其他角色的迁移测试。

| 日期 | 类型 | 状态 | 变化 | 记录 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 设计 | 已实施 C1 | 中立契约与公共治理工具迁移 | [独立设计与影响评估](../design/2026-10-14_design_runtime-core.md) |
| 2026-10-14 | 修改 | 核心已验证 | 公共工具、隔离记录、停止与 Service 组合 | [原始证据](../change/2026-10-14_change_runtime-core.md) |
| 2026-10-14 | 修复 | 核心已验证，消费者待集成 | 客户回调拿到原始取消上下文，迟到 yes 不给后轮发行许可 | [C1R 当前证据](../fix/2026-10-14_fix_customer-input-cancellation.md) |
| 2026-10-14 | 修复 | 核心已验证，编排接线待属主重测 | 通过 Service operation 读取既有 Provider 的隔离记录 | [C1H 当前证据](../fix/2026-10-14_fix_service-history-entry.md) |
| 2026-10-14 | 修复 | 核心已验证 | Pi 既有有效环境时限同时用于内外层计时 | [C1T 当前证据](../fix/2026-10-14_fix_pi-effective-timeouts.md) |
| 2026-10-14 | 修复 | 核心已验证，Pi回归待原属主重测 | 停止时保留工具专属失败语义 | [C1P 当前证据](../fix/2026-10-14_fix_tool-abort-failure-messages.md) |
| 2026-10-14 | 修复 | 核心已验证，Pi迁移竞态待原属主重测 | 外层既定结果不被内层清理事件改写 | [C1O 当前证据](../fix/2026-10-14_fix_outer-terminal-outcome.md) |
| 2026-10-14 | 修复 | 核心已验证，桌面原闭包映射待属主/独立测试 | 原始prompt得到真实turn的同步只读开始确认 | [C1A 当前证据](../fix/2026-10-14_fix_prompt-start-acknowledgement.md) |
| 2026-10-26 | 新增 | 契约/工具已实施待验证；应用与注入端未接线 | Gate 复核请求 `request_gate_review`（独立于最终验收；`dispatched` 只表示已派 Proof；gate fail 只按 blocker/major） | [变更记录](../change/2026-10-26_change_request-gate-review-contract.md) |
| 2026-10-26 | 新增 | 契约/schema/工具已实施待验证；角色白名单/判断默认推荐/桌面呈现未接线 | 材料性选择卡 `cardKind=decision`（仅统筹；恰一个 `recommended`；替我决策默认推荐；不等于验收/批准；不触发 gate） | [变更记录](../change/2026-10-26_change_decision-card-contract.md) |
| 2026-10-26 | 新增 | 契约/schema/工具已实施待验证；应用与注入端未接线 | 需求变更申请 `request_requirement_change`（报告员发现新授权/范围时不塞提案卡；审批卡由提案/统筹发起、判断 agent/客户在 decision 卡上决定；申请≠批准；发起方不得自批；主理只在批准后执行意图变更） | [变更记录](../change/2026-10-26_change_request-requirement-change-contract.md) |
| 2026-10-27 | 新增 | 契约/schema/工具已实施待验证；应用侧校验/收口与注入端未接线 | 验收标准产物汇报 `report_artifact_ready`（质检只向应用汇报、应用校验后决定是否收口；工具不写盘/不写 flow/不假装已接受；成功不等于自动完成；未声明 accepted 按未接受 fail-closed） | [变更记录](../change/2026-10-27_change_report-artifact-ready-contract.md) |

实际输入由 Core 在开始确认、原输入持久化及取消检查后统一发一次 message，detail.source 为 prompt-input、text 为原文，非空图片只记 imageCount。top/detail.turnId 都为该实际轮次；Pi 注入与 demo Core 路径不再另发输入回声。消费者凭标记与轮次合并同一输入的历史/live表示，真实助手前缀文字和同文不同轮均保留。确认/选择回调另外收到入口原 toolCallId（可选），供实际请求卡关联；它不增加写权。run_shell 说明明确一次 argv 程序调用、不解释 shell operators/展开，多命令分开调用，原审核与执行不变。

2026-10-15 修复：Core已自验，独立桌面待验。单次可信输入事件、确认卡原调用身份与argv说明，见[当前修复与证据](../fix/2026-10-15_fix_run-shell-description.md)。

## 展开真实工具详情与核对报告历史

Core给适配器同一套必需显示投影，实际命令/路径、ToolResult原message及shell结构结果成为有界、安全的展示数据；模型仍收到原工具内容。身份、start/blocked/result不混用，投影失败只报告显示诊断，不改治理或实际终态。旧native-only历史由Window原reader/解析后经Pipeline调用纯Service保护，不为了补命令再执行或读业务文件；没有事实就未保存。

```mermaid
flowchart TD
  actual[实际tool输入与结果] --> model[原message和执行语义给模型]
  actual --> project[注入projector 净化后UTF8预算]
  project --> guard[Core实际turn归一与最终allowlist]
  guard --> replay[保护后的事件落ANS历史]
  guard --> desktop[窗口与UI按实际call/phase展示]
  legacy[窗口原native历史解析] --> pipeline[Pipeline纯桥]
  pipeline --> pure[Service纯历史保护]
  pure --> desktop
```

实际绑定的ANS store决定persistence.enabled/disabled。Pipeline最终报告在真正收口后交bound capability保存，报告成员与目标投递尝试、实际目标turn分别标识。source保存失败只影响保存状态；显式重试仅存同快照，成功后可首次继续原回交。disabled及旧adapter保原live语义，不能伪称保存成功。

```mermaid
flowchart TD
  final[编排已最终化报告] --> mode{实际源持久能力}
  mode -->|disabled或legacy| live[仅live报告 标未保存]
  mode -->|enabled| report[绑定capability保存安全快照]
  report -->|失败| retry[显式重试保存 同reportId 无源prompt]
  retry --> report
  report -->|成功| enqueue[Window唯一登记入队 冻结成员与原模型文本]
  enqueue --> ack[目标actualturn ACK 尚未证明保存或执行]
  ack --> input[安全显示副本保存 原模型文本仍独立]
  input -->|失败| noProvider[Provider未开始 回执如实]
  input --> boundary[持久或内存边界]
  boundary --> provider[原模型文本与图片调用Provider一次]
  provider --> receipt[实际终态和最终保存回执]
  receipt -->|历史失败| saveOnly[只补可证完整尾段或index 不重模型]
  saveOnly -->|损坏 外来写入 失效| blocked[明确拒补 不猜不修旧日志]
```

新C历史是“交接内容（安全显示副本）”，不是完整模型输入；flags如实表示净化/截断。原文仍逐字给SDK，原生转录与普通chat未被泛清。bound保存材料会随16MiB预算或handle关闭失效，详细成功回执最多128个；最小seen保护防同attempt被再次当成新执行。磁盘后来损坏也不能把已执行事实倒退为未执行。跨文件事务、跨进程exactly-once和重启自动发队列均不在能力内。

2026-10-15：A4/C2文本补充1核心实现与自测完成，消费者整合待验。[实际候选与故障证据](../change/2026-10-15_change_complete-flow-core.md)，[公共API](../../api-spec.md)。

工具展示仅处理真实工具结构；普通引擎失败即使kind=denied，仍是原失败，不产生空工具名或虚构blocked阶段。live和历史同判断，未知detail不侧车回传，真实failed终态与安全summary保持。2026-10-15该必要边界修复已Core77/77及原独验1/1通过，消费者整体重测待续：[当前修复](../fix/2026-10-15_fix_non-tool-event-routing.md)。

2026-10-21 思考等级轻量兼容：设置保存后沿现有配置版本与安全重建路径生效。Core 仍仅在合法显式值时注入 `reasoningEffort`；留空或非法值不注入，由平台默认策略接管。Pi 恢复时须重新应用模型/全局/当前版本默认而非残留旧档，默认预算同样保护。参数明确被拒时，适配器按 D1 的有限兼容路径继续；普通网络/鉴权/限流故障不改档。提示在活动轮内作为 `source:system` 的普通消息显示和回放，不进入助手反馈，不使用“已思考”事实通道；只有正常结果才提示兼容成功。核心本次只同步注释和契约说明，平台实现/真实请求证据由各所有者提供，见 [默认契约修复记录](../fix/2026-10-21_fix_reasoning-default-contract.md)。

## 图片查看 `view_image`（2026-10-26，两轮附件）

客户要求让角色能看项目里的图片。因各引擎对「工具结果附图」支持不一致，采用**两轮附件**：`view_image` 读取项目内图片并调用注入的 `ViewImageFn`，把图片排队为**同一角色下一轮用户提示的图片附件**；工具本轮只返回文本，成功句固定为「已读取并排队；下一轮以图片附件提供；本轮不要假装已看到」。能力未注入 ⇒ 工具不注册（fail-closed）；路径/类型/大小非法 ⇒ 工具失败且不调用能力；能力拒绝/抛错/契约外回执 ⇒ 如实说明「未排队」，绝不谎报已提供。校验口径：项目相对路径（拒绝 NUL/绝对/盘符/`..`，realpath 复核读取根，目录拒绝）、`.png/.jpg/.jpeg/.webp/.gif`（真实扩展名 → MIME）、单文件 ≤10 MB；读二进制后 base64 成 `PromptImage`。本工具不写盘、不联网、不过写门禁，也不改变 `read_file` 等既有工具行为。**接线状态**：契约/schema/工具/测试已落；Service/编排/桌面把图片实际排入下一轮 `PromptOptions.images`、注入判据与聊天呈现未接线（未注入 ⇒ 工具不存在）。实现与验证见 [change](../change/2026-10-26_change_view-image-two-round-attachment.md)。

## 验收标准产物汇报 `report_artifact_ready`（2026-10-27，应用中介）

客户新设计要求：验收标准由质检写完后，**质检只向应用汇报，应用校验后决定是否收口**——不要让应用盯文件自动勾卡，也不要让质检自己改 flow 状态。运行时核心提供应用中介的汇报工具 `report_artifact_ready`：参数 `{flowId, stepId, path, summary?, sha256?}`（`flowId`/`stepId`/`path` 必填、只做基本非空字符串校验；未知参数拒绝且不触达能力），handler 把载荷原样交给注入的 `ReportArtifactFn` 能力并**如实转达**回执 `ok`/`accepted`/`message`。工具**不写盘、不读写 flow、不做治理判定、不假装应用已接受**：路径是否存在、步骤是否属于该 flow、摘要/哈希是否与文件一致、是否收口全部由应用能力校验。**汇报成功不等于自动完成**——`accepted:true` 只表示应用已收到并接受该产物，收口/推进 flow 由应用决定并写入；`accepted:false`、`ok:false`、`accepted` 缺席（`accepted=未声明`字段）或契约外回执一律按**未接受** fail-closed，绝不宣称已收口。能力未注入 ⇒ 工具不注册（fail-closed）。**接线状态**：契约/schema/工具/测试已落；应用侧校验/收口实现与编排/桌面注入（应为内置质检/Proof 会话）未接线 ⇒ 当前生产会话不注册（fail-safe toward 现状）。实现与验证见 [change](../change/2026-10-27_change_report-artifact-ready-contract.md)。

