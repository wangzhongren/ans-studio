---
id: pi-tool-display-report-consumer
type: design
title: Pi 工具详情与报告来源接口消费评估
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: draft
revision: 2
related: [runtime-tool-display-contract-a, runtime-report-provenance-contract-c]
---

# Pi 只转换真实事实，显示保护由注入能力统一完成

本角色固定 Pi 适配器；本轮只读源码和评审、写本设计，未改产品/测试、未发模型请求、未操作桌面。客户确认 UX v2 方向不等于已批准 A/C r2 的预算、内容政策和持久化失败策略。依据 Core [A/r3](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md)、[C/r2](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)及[当前 Pi 功能](../feature/pi-runtime.md)。

结论：已对照实际 real-adapter.ts 重新审阅 A/r3，接受其完整中立合同及 C/r2；r1 的四项待冻结问题均已解决，无新增接口阻塞。以下为同版映射及接线约束，可由 PM 合并审核。不得让 Pi 导入 Core 私有 common 或另写脱敏/预算器。生产必须接入 projector；optional 只服务旧 standalone，不能当漏接的降级理由。具体内容政策/数值仍待客户确认，不提前实施。

## A：来源映射与 native 边界

| 来源 | Pi 实际可得事实 | 候选投影输入与保留限制 |
| --- | --- | --- |
| SDK execution_start | event.toolName/toolCallId/args、当前 actual turn | 唯一 start；run_shell 的实际 args.command、read/write/edit 实际采用的 path 交 projector。其它工具不生成目标，不拷贝任意 args。 |
| 治理 hook 拒绝 | 实际 toolCallId、同 turn、已生成 reason、实际 input | blocked 独立于 result；真实 reason 作 error/resultText，不删门禁或改变返回block。白名单、kill-switch、旧写闸三分支一律投影。 |
| 注入 handler 成功/失败 | toPiTool 当次 result.ok/message、未来可选 execution、开始时捕获 turn | resultText 使用原 ToolResult.message，不从合并字符串反解 stdout/exit。execution 仅取 Core 返回的真实结构字段；原始未知details不透传。 |
| SDK execution_end | toolName/toolCallId/isError/durationMs/result.content/details | ok/status依SDK真实结束；优先绑定同call handler捕获事实。无handler事实的missing/invalid/blocked/截断/异常，用native content中明确text块作结果文本。图片、任意native对象、stack/cause不投影。无文本留缺失，不造原文。 |
| handler throw | 捕获的 Error.message 与SDK失败end | 记录同call的实际Error.message供end投影，不把异常整对象或stack放事件；仍按原行为向SDK抛出，原模型结果语义不改。 |

A/r3已用 ToolDefinition.displayInputRule 定格真实handler规则，Pi原样携带 source.input={rule,args}，不复写解析器。core-path-v1 选择 args.path ?? args.file_path ?? args.filePath 后才校验string，前项非string不回退；core-command-v1 选command/cmd首个string，空string不回退；custom同名无rule不造目标。现extractCallPath仅保原执行/诊断兼容，不用它旁路新display。

建议在 bindRole 内建立按真实 toolCallId 的私有 transient facts map，同时注入 toPiTool 和 buildGovernanceExtension；保存当次turn、允许的原始target、实际 ToolResult.message/execution 或 Error.message。end消费并删除；dispose清空，拒绝调用无handler条目也正常走native end。此map不持久、不对外公开、不喂模型、不按文本配对。late/duplicate end继续发真实事件，不因map被消费就吞掉；缺失callId走缺身份分支，不补邻近call。未知/外来end只取该end实际保留的文本和身份，不能复用当前新turn冒认旧轮。

这样无需把 execution 塞入 SDK ToolResult.details：当前toPiTool仅给SDK `content:[{type:'text',text:result.message}]`、原安全details和isError；新增结构execution通过Pi内存桥到展示投影器，给模型/native的message/content和既有details逐字保持。start的command是获审前实际请求字符串，不声称已执行或已被审核allow；结果中的 process 只来自真实执行，审核拒绝不造exitCode。

A/r3已冻结精确Source union：handler事实放result={ok,message,execution?}，throw放error={message?,code?}，native-only结果转native={isError,content:[text或unsupported]}，text按LF拼接由projector统一处理；全部结果缺失只诊断RESULT_OUTCOME_UNAVAILABLE。原生isError优先决定最终ok，handler事实仍保留原message/execution。projector返回可能是无业务结论的diagnostic，Pi emit不得补造phase/ok/status，也不能把投影异常当工具失败。turn仍取可信原捕获值，不把该诊断当report失败。

## A：完整保护边界与兼容

当前真实Pi没有 Codex URL/Claude内部ID那样的现成profile文本redactor，不能谎称已有。A/r3已冻结 profile register：Pi实际cfg解析后、SDK load/query/工具效果前，按同次profile env快照登记实际cfg.apiKeyEnvVar（含显式config override）及Core给出的toolDisplayCredentialEnvNames键和值；不传完整env、不日志化值。Core已捕获自身公共/extra名单，纯内存追加并验证ready，重复同profile幂等，bound后改profile拒绝并要求新session。Pi无现有redactor，可省略projector第二参，不复制净化函数。若需Pi特有规则，必须作为单一注入纯函数而非本角色复制Core过滤器；任何异常不回退raw。当前Pi日志记录baseUrl的trace属于既有非工具诊断，本A不借机改全局日志；验收须明确工具事件保护范围，不声称所有native/trace都脱敏。

所有工具 start、blocked、result 的公开emit均先投影，summary只由净化后事实构成。现start摘要直接插path、blocked摘要直接reason、result detail.path均须移除raw旁路；如保兼容path/command，只从已净化display.target派生并计总预算。diagnostics调用只传现允许的身份/机器码，不因A新增raw message/execution/args；投影失败发bounded typed diagnostic，不fallback旧summary。Core pump再allowlist是最终replay/IPC防线，不能代替adapter发前保护。

普通assistant message、输入echo、压缩/恢复信息不因A顺带变工具或按前缀过滤。C新报告另走其纯文本保护；A不承诺所有未知秘密通用DLP，Pi native原始模型工具文本也不因A改写。

A/r3已冻结toolDisplayMode：Core composition固定required-v1，缺projectToolEvent/register或非函数时Pi在SDK load/query前拒构造；登记失败也是构造错误，不造工具denied。未ready提前投影只DISPLAY_PROFILE_NOT_READY。standalone/direct省略mode或明确legacy-standalone保旧语义和无A保证；显式required-v1必须满足同一早拒条件。不得从tools/currentTurnId猜生产，旧夹具可明确legacy。identity/enumeration原值保留，不送文本redactor、不递归scrub投影对象，即使其字符串含假secret片段；summary/display/兼容别名仍统一净化预算。

旧Pi JSONL fallback本轮尚无A公开净化入口。接受Core/Service/Pipeline提供统一历史保护并保持层方向；Window直读Pi私有native实现的路径不得因A继续扩张。Pi仅按已批准的公开历史调用接缝提供原事实，缺旧command/result数据显示缺失，绝不为展开重读文件或反解summary。本提案不授权新增跨层依赖；若需Pi公开history方法，须先冻结其Model值与精确ownership后单列，而不是在此任意新增Provider API。

## C：进入 Pi 前剥离中立 metadata

接受Core拥有source保存、目标attempt/receipt、仅保存恢复和budget，Pi不实现或伪造persistence capability，不依据目录/输入字符串判断enabled，也不重新prompt来“重试保存”。Core给inner.prompt前必须剥离inputProvenance/inputPresentation/onDeliveryProgress及Core回调；Pi当前makeRolePrompt只重建 `{images}`，无图只发text，无object spread，已是第二层窄边界。两层都保留，未来新选项用明确allowlist，不将opts透传SDK。

只剥离顶层字段对“C metadata不入SDK”足够的前提：system prompt、text、images原对象未被Core人为塞入这些结构；Pi只使用原text和同引用images，不能用安全展示summary重render模型交接。文字里本来已有[回交]正文会照常进模型，这是既有业务输入；不要把它和额外结构元数据混同。需测试构造带sentinel metadata的Core→真实Pi链，断言SDK第二参只images，完整LLM转录不含sentinel；原text/图片逐字相同，onDeliveryProgress只由Core触发。Pi原生命周期/abort/工具signal不改。

## 拟写集、依赖与验证

生产候选仅 `src/common/pi-adapter/real-adapter.ts`，必要时本角色私有 `src/common/pi-adapter/tool-event-facts.ts`（只存同call事实、绝不复制projector）。如确需公开兼容类型转出，`src/provider/pi/session.ts`仅显式转出经Core冻结的Model类型，不加业务；不改Core/Model/schema/Window/UI/Pipeline。测试候选 `test/pi-adapter/tool-call-events.test.ts`、`injected-runtime.test.ts`、`prompt-images.test.ts`，如需独立详测新增 `test/pi-adapter/tool-display-projection.test.ts`；原门禁/shell/stop套件照常回归。文档为本设计、api-spec/memo/feature及后续证据，均在本边界。

前置为客户确认 A/r3 与 C/r2 的预算、内容政策和持久化策略，随后Core按已冻结source/projector/profile/required合同实现验证；Core实现验证后Pi接线，随后Window/UI和独立测试。Pi不代Core授权数值/秘密展示政策，也不声明A/C已经可用。

验收需真实离线faux SDK九工具统一source、read成功/ENOENT、shell exit0/非0/spawn/signal/中止/审核拒绝、hook blocked+end并存、late/duplicate/缺ID、同text不同call/turn；core真实execution只在展示有、模型content/native details不新增；fake secret穿target/command/result/error/compat别名/summary全部保护，投影器或profile抛错不泄raw且不改outcome；UTF-8与总JSON预算以Core独立oracle验证，Pi核每条emit均经过同注入路径；ordinary assistant完整保留。C sentinel结构不入SDK、原text/图片同引用、provider不因保存重试被Pi重启。

本阶段没有在线/桌面验证。未来客户确认接口并授权受控验证后，由测试角色选隔离临时项目及明确账户/模型：真实read成功/ENOENT与一次无害批准shell、确认拒绝、停止，核native真实内容与replay净化投影/模型content未变、实际handler次数；不触用户p-limit窗口，不重派原任务、不制造写越界。线上模型验证不能替代无网络故障注入、超预算及secret sentinel测试，也不能在本评审阶段提前运行。


## r2 同版回签（2026-10-15）

本轮重新只读 A canonical revision 3、C revision 2及实际real-adapter的cfg解析、SDK装配、toPiTool原返回、hook/start/end与prompt options窄转接。四项接口问题已全部闭合：Source完整union和native/result优先级、真实handler displayInputRule别名、实际cfg键和值的register内存闭包、required-v1/legacy-standalone明确模式。接受A/r3/C/r2，剩余为客户实质策略决定与实现依赖，不是Pi接口阻塞。

既有精准写集不扩张：real-adapter.ts、可选私有tool-event-facts.ts、必要的session.ts显式类型转出；四个候选Pi测试与本角色文档按上节保持。execution只经过私有同call facts map送projector，SDK content及现安全details不新增execution/C对象，gate/handler信号和实际终态不改。所有summary/detail工具出口保护不放宽，异常只typed diagnostic。C仍Core先剥离、Pi只重建images的双层边界，原text/图片保真。

本轮只更新本评估至revision2，没有产品/测试/桌面/模型操作，没有未来验证通过声明，不代客户批准A/C策略。

## r2 窄回签 A/r4 与 C/r2 text_policy_revision 1（2026-10-15）

已只读同版新增条款，明确接受 A/r4 及 C/r2.tp1，无 Pi 新增阻点，revision仍2。A/r4仅追加Window既有read/parser事实经纯中立entries→Pipeline→Service保护桥；连续最近后缀的1MiB/4096上限和hashed legacy anchor由相关属主实施，不要求Pi新读盘、新历史API、新事实或生产写集。原A/r3 Source/required/profile与不改真实call/turn身份的回签保持。

C/r2.tp1由Core从同一原交接文本计算安全displayInputText，用于新C ANS user/typed summary/IPC及安全恢复材料并附flags；modelPromptText仍逐字交inner.prompt及原图片引用，Pi/native既有转录语义不变，不改写历史。Pi不新增safe-copy字段、不重新render模型输入，也不把provenance/presentation/progress元数据送SDK。Core先剥离、Pi只重建images的双层边界，以及SDK content/details不新增execution/C对象的原测试要求不变。

本次仅附本文档同版回签；精确owned生产/测试write set与上节一致，无增量。预算、内容政策及持久失败策略仍由客户具体确认，未实施、未测试、未操作桌面或模型。
