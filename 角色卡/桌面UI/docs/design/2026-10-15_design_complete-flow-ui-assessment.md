---
id: complete-flow-ui-assessment
type: design
title: 完整桌面流程的UI消费合同评估
created: "2026-10-15"
updated: "2026-10-15"
status: draft
revision: 1
---

# 先补真实可读信息，再接成果阅读入口

固定桌面UI，依据[产品真实走查](../../../产品/docs/design/2026-10-15_design_desktop-complete-walkthrough.md)、[UX草案](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)、其complete-flow HTML源码和[Window r1评估](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-window-assessment.md)作独立只读审查。本侧没有操作真实窗口、打开浏览器原型、运行生产测试或修改产品。产品/UX的CUA证据不记成本侧亲测；原型模拟输出、文件读取和报告不能直接作为生产合同。

## P1/P2 工具诊断与单次调用阅读

存在三处不同损失。Pi `real-adapter.ts::tool_execution_start/end`提供path、状态、durationMs/errorCode等，但run_shell command和原ToolResult.message/stdout/stderr未可靠进入展示事件。Window `runtime-history.ts`只把toolName/target/phase/status/turn/call/ok映为ReplayRow.activity；target从call.args.path/command及previous取，现有detail.path也未消费，原始detail的duration/error等被丢弃。UI `tool-rows.js::activityOf`消费path/args.command/target及状态，却不保存更多诊断字段；`fillActivities`只渲染时间/工具目标/状态，`appendDenied`展开仍只有已传入summary，不可能从无信息的通用“执行失败”恢复ENOENT或命令。P1既有字段的mapper损失与P2新字段缺口不能混作一个CSS问题。

最小消费要求：继续scope/actualturn/call身份配对，只将可信同call的start/blocked/result放在一次调用的可展开阅读块，三阶段和拒绝/失败不互相覆盖。首屏显示可靠目标或command、实际结论与短错误；展开提供可用的原始输入摘要/结果文本/exit/stdout/stderr及“未保存/已截断”。这些字段须Core/Model/适配器属主定义可展示可选合同，Window保真归一后UI消费，不直接渲染任意SDK对象。时间短显、原值保留title/可访问全文；无call/turn不按相邻行或同文配对。当前special生命周期幂等、原决定卡关联及阅读保持必须沿用。

旧ANS缺字段保持“未保存”，不能解析助手总结填命令/错误。若需读取旧native以补可信信息，属于Window经属主字段评审的明确fallback，不由UI读取JSONL或按最近call猜。stdout等默认收起并有边界/截断说明，不能恢复成全组正文铺开；敏感内容处理与上限须源端/Window先定，不把UI替换字符串当完整脱敏。

必测：既有detail.path保真、命令/exit/错误各引擎映射；真实start-result、blocked-result、同文不同call/turn、未知legacy、结果晚到、超长输出/缺字段/安全内容；单次行与原展开状态、两档宽度、窗口化上翻锚点。原“native工具失败不泄stdout正文”和治理denied允许路径保真约束需升级为“展开才读经审核详情”，不能简单删除旧测试。

## P3 文档预览

`renderRight`当前用role.docs.length计数，`renderDocs`输出展示文本，没有文档读取动作；目录/文件应消费已有DocsIndexEntry.kind区分，目录不算可阅读文档。角色卡正文已在listing里，可复用；任意报告全文缺受限IPC。openExternal仅http/https，不应把普通路径变file链接绕过窗口校验。

UI仅对Window明确返回的可读文件引用提供按钮，传projectRoot/roleId/相对路径及请求版本；目录无打开文件动作。Window负责真实scope/清单/realpath/竞态、大小与格式限制、错误结果；具体政策待评审，UI不校验文件系统。报告evidence字符串不是文件授权，不能正则抽路径自动可读。候选预览为静态Markdown/纯文本，沿既有转义/链接安全与图片不自动读取规则。返回保留报告/资料的展开状态、chat及drawer阅读位置；项目/角色/引擎改变使旧读响应失效，不让旧文件出现在新上下文。

必测：已列文件、目录、缺失/拒绝/不支持/过大、项目切换迟到响应、键盘打开返回、窄窗滚动与安全Markdown。Window负责路径/符号链接与权限测试，UI不伪造这些通过。

## P4 成果摘要与原始交接

live源角色的handback事件已有结构化TaskHandback；`appendHandback`能诚实显示status/summary/evidence。接收角色的`appendInjectedMessage/buildInjectedElement`却只有typed输入的text（typed source仅证明输入，不证明报告对象），当前展示整段renderHandbackPrompt，包含面向模型的验收指令。历史user/typed输入也不持有原TaskHandback，因此不能靠[回交]前缀或正文切句升级为正式成果卡。

新报告默认成果摘要、原文另行展开应由编排定义typed报告/投递关联与持久来源，Window保真转发；UI按可信报告ID/turn/scope显示来源、真实结论、证据、未完成、任务号未知。旧纯文本只能作为“原始交接内容”，不得自动捏造已验收/已收齐或可读文件引用。completed是报告结论，不等于独立验收通过。P3文档入口只有可信可读引用才出现。

必测：主动聊天submit_report、正式任务报告、未知任务号、不同turn同文、真助手似报告文本不升级、原文保留及无新投递/权限副作用；旧日志不改写。

## P5/P6/P7 可在现合同下改进的部分

P5：`showSessionContext`用 `!pane.querySelector('.chat-empty')` 当hadHistory，但`selectRole`先register sys-loading即ensureContent移除空态；故没有历史也可能被当有历史，这是可复查的UI结构推导，不等于本侧复现。应依实际历史/实质转录事实而非空态DOM决定“以上为历史”。当前上下文在固定状态区域消费contextSource/contextWarning/resumed，不能把字段齐备当模型记得；旧真实恢复/失败事实仍可查。Window指出LF规范化曾导致真实dispose/open，本侧同意不能文本隐藏或把nativeSessionId/profileRevision当生命周期。现接口不足以精准判断每次新handle，不在本设计暗加generation或删除真正不同恢复记录。

P6：`openPiPanel`无实际opener记录，`closeRightDrawer`硬回 `tab-<priorTab>`，能直接解释主条打开设置后Esc回右上。UI可记录实际按钮DOM与原上下文，关闭优先回仍connected/可见/可用的发起按钮；保存后主条消失才回稳定tab，切项目不抢回旧上下文。程序化打开须明确fallback。文件预览从报告/资料发起时同理保留来源，不把所有关闭都送到toolbar。无需Window API。

P7：`openRequestIdsFor`来自请求登记，`queueViewsFor`来自running/queue，原数据本就分离；`renderCurrentWork`却对任意pending统一说“等待你确认”，资料抽屉只列工作/队列。可按request.kind分别表达“待选择/待确认”，以原requestId定位卡；计数与queue独立，不能把pending加进排队深度。request_choice不是写入授权，request_confirmation也不天然等于写权确认，标题/预览含义须真实呈现。取消/拒绝/过期/定位保持原回包语义，不由界面替客户作答。

必测：空新会话/真实历史/真实重开与失败、Pi↔Claude切换；三种实际设置入口的Enter/Esc回焦、主条保存后消失、入口离窗与项目变化；pending+空queue、pending+queue、单/多选、一般确认与写确认分别表达、两同标题不同request、后台scope、卡被drawer覆盖后定位及原决定DOM。

## 设计结论与范围

支持P1/P2/P3作为核对任务的核心路径，P4/P5/P6/P7按上述真实数据边界表达。P1/P2需Core/Pi等源端+Window历史合同；P3需新只读受限能力；P4需编排持久typed业务来源。P5固定状态/真实history判断、P6回焦、P7分开表达主要为UI现合同消费，不应作为纯CSS一揽子跨角色实施。原型写死命令、报告、文档和返回模拟仅用于评审，不直接迁入产品。

拟UI候选写面为renderer组件/样式及必要自有tool-rows/runtime-ui/renderer/e2e测试，精确实现集须待UX最终规范和公共合同冻结再提。最少保留59单元、DUP32、MERGE12、完整UI98、项目状态7、selector25/config20的实际renderer保护，新增设计行为用受控合同验收，再由独立测试角色跑真实主进程/模型。当前只有本评估文档新增，无产品、测试、配置、权限或目标项目修改，也没有测试/交互通过声明。
