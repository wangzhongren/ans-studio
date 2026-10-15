---
id: complete-flow-window-assessment
type: design
title: 完整桌面流程的窗口接口影响评估
created: "2026-10-15"
status: draft
revision: 1
---

# 窗口独立只读评估

依据[产品走查](../../../产品/docs/design/2026-10-15_design_desktop-complete-walkthrough.md)与[UX草案](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)。仅设计评审，无真实窗口操作、代码修改或测试执行。以下是候选接口要求，不是新授权或已经生效的读取策略。

## P1/P2 命令、错误与输出

现有live事件保留原detail，Window不需要新增事件IPC；历史mapper却只输出activity的toolName/target/phase/status/turnId/toolCallId/ok，丢弃更多原detail。Pi execution_end只生产通用「执行失败/完成」、path、状态、durationMs、errorCode，未保留原工具message/content/stdout/stderr；start metadata主要有path，run_shell命令未可靠保留。这是源端和历史展示合同的缺口，不能由Window从邻近聊天补全。

公共run_shell handler实际把stdout/stderr与exit信息写入ToolResult.message；这不等于SessionEvent已经具有结构化stdout/stderr字段。Pi native可能保有原toolResult，但当前普通ANS历史不能因此宣称拥有。Codex/Claude/旧demo的detail结构也不完全相同。最小方案应由Core/Model与适配器属主明确可选原始输入/命令、结果文本、错误、exit等字段及截断标志，Window只保真透传；UI按真实scope/turn/call/phase展现，未知旧记录明确「未保存」。不解析助手总结或虚构旧命令。

成本：跨Core/Pi/UI/Window联合合同；Window精确候选runtime-history.ts、session-history.ts与multi-runtime.test.ts。必测start/results两阶段、blocked和failed result并存、真实命令与exit/output保真、旧缺字段、分引擎、超长输出与凭据脱敏。应由源端定义可展示内容上限与敏感内容处理，不擅自把原始env/任意SDK对象传UI。

## P3 阅读报告与资料

可复用listProject返回的角色卡正文、changelog及docs索引；DocsIndexEntry已有kind=file/directory，UI应直接区分目录。已有openExternal明确仅http/https，不接受file:，不能绕成任意本地文件打开。当前没有读取指定报告全文的受限IPC，不能仅靠链接样式实现。

最小候选是单一只读文档预览接口，由Window main/preload/interface及内部文档读取模块提供，UI只传当前已导入projectRoot、roleId和项目相对路径。主进程必须按实际已导入listing核对scope、按可允许文档清单核对文件（优先角色docs索引kind=file，以及明确列出的角色资料），目录不是可读文件。报告evidence目前是任意字符串数组，不是可靠文件清单；报告产物需主属主给结构化文件引用，或用户从现有资料列表选择已列文件，不能从任意证据句中提取路径扩权。

真实路径校验要同时限制词法路径与realpath归属，拒绝绝对路径/越界/指向项目外的符号链接；只读不等于任意读权限。文件缺失、已变目录、权限失败、格式不支持、超大小、项目切换后请求失效必须有明确结果。候选首批UTF-8 Markdown/纯文本，仅静态预览，禁执行HTML/脚本/链接载入和自动读图片；具体扩展名、大小上限与列入机制待PM及产品确认，不伪称现有政策。隐藏凭据文件、.env、密钥和未列源码不因输入路径而进入读取面；不能把读取文件失败内容当作秘密回显。校验与读取之间的替换竞态需选定平台可落实的文件句柄方案并回归，不承诺仅realpath字符串检查即完全解决。

成本：一个受限接口与main/preload透明接线、Window文档读取测试、UI阅读返回/定位状态。必测已列Markdown、目录、缺失、..、绝对路径、符号链接外逃、项目切换、过大/二进制/无权限；不写项目文件、不触真实凭据。具体方案需新接口评审和实施授权。

## P4 typed回交与纯文字

源角色live的OrchestrationEvent.handback已有TaskHandback（status/summary/evidence/role/turn/runtime），不是普通助手话；但投su时队列把它渲成prompt，Core输入持久化主要存text，typed prompt-input仅说明是输入，不保留TaskHandback业务对象。历史回放也不自动保存Pipeline产生的handback。因此「所有历史回交显示成果卡」不能只从[回交]前缀切正文并断言正式报告。

新typed报告链若需端到端历史展示，由编排定义报告/投递关联的持久合同及属主；Window只把已有队列handback对象或新公开字段转发，不能自行造报告结论。旧纯文本保留原始交接内容且标记未知关联。报告内容本身仍是模型报告，completed不等于独立验收通过；evidence字符串不自动等于可打开文件。必测普通聊天似回交文本不升级、主动submit_report真实回交、同轮原始说明保留、缺任务号不伪造、不同turn不合并。

## P5/P7 现合同可复用与限制

contextSource/contextWarning与OpenResult.resumed可表达实际恢复；profileRevision只是配置版本，nativeSessionId也不代表新handle。当前没有会话生命周期ID，不能宣称精准按生命周期归并全部恢复通知。UI可把当前上下文放固定状态区域，并保留真实重开/失败记录。已核实status-retest的尾LF标准化触发真实dispose/open，不能抹为重复。若后续证实同生命周期重复，另审身份合同。

request_choice是选择请求，不是写入授权确认；request_confirmation也必须按实际request语义展示，不等同所有write_confirmation。OperatorRequestPayload已保真实turn/call、scope与响应id；卡、作答、失效按其真实生命周期。delivery queue/running是正式投递与排队消息，pending确认独立存在，不能把pending数写进queue数。UI已有请求登记可显示独立「待选择/待确认」并定位，不需Window把它伪装为队列。必测普通聊天选择、正式任务确认、pending+空queue、queue+pending并存、取消/过期、后台scope、两个同标题不同call；不代答真实权限。

结论：P5状态位置、P6回焦、P7分开表达主要由UI复用现接口；P1/P2需源端和历史数据合同，P3缺受限文档读取能力，P4缺持久typed业务来源。不同改进分属不同owner，不能作为纯CSS一揽子实施。当前不实施，不新增policy，不扩大Window边界。
