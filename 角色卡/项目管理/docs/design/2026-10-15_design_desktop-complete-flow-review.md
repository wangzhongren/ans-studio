---
id: desktop-complete-flow-review
type: design
title: 真实桌面完整流程设计的跨角色审查
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [desktop-complete-walkthrough-meeting, product-desktop-complete-walkthrough-20261015, uiux-desktop-complete-flow-20261015]
---

# 让失败能查明、成果能阅读，保持真实任务语义

用户本轮只授权真实走查、问题清单、可点击原型及评审后客户确认，不授权生产实施。项目管理审查[产品问题清单](../../../产品/docs/design/2026-10-15_design_desktop-complete-walkthrough.md)与[UIUX流程提案revision2](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)，会议过程见[两轮纪要](../meetings/2026-10-15_meeting_desktop-complete-walkthrough.md)。两轮现已结束，唯一结论 **recommend approval（仅revision2交互设计方向）**，无剩余产品方向阻塞；实现合同仍待定稿，不给可实施已就绪结论。

产品与UIUX分别在真实ANS串行独占操作并署名证据，没有代答root准备的pending请求或修改凭据。产品15图与UX亲测覆盖相交但不互相代签；权限写入确认、决定最终成功/失败、运行中撤回停止和未导入状态均须按各自真实覆盖写明。普通request_choice选择不等于写权确认；原型模拟分支不能冒称真机已经走过。

## 当前跨角色发现

[窗口独立评估r1](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-window-assessment.md)由固定Window上下文只读完成，未操作桌面、未改产品。PM独立源码追踪与其结论一致：

- P1/P2失败与执行详情：Pi事件源已丢原结果文本/命令，窗口历史mapper又只保简activity，纯renderer无法恢复不存在的数据。需Core/Model/适配器明确可展示输入、命令、错误、结果、exit与截断字段，Window保真传递，UI按真实scope/turn/call/phase展示。旧记录有就读、没有就明确未保存，不从助手总结/邻近条目猜。源端必须定义可展示内容，不把任意SDK对象或环境凭据搬UI。
- P3报告/资料阅读：当前role detail/docs index可复用并区分文件/目录，但没有读取报告正文的受限IPC。新接口需主进程核当前已导入项目、已列文件、词法/真实路径边界、符号链接/替换竞态、格式/大小与明确失败结果；UI相对路径不是读取授权。报告evidence是任意文字，不自动转文件白名单。Markdown/纯文本静态预览是候选范围，具体政策及实现合同待定，不称已有能力。
- P4回交成果卡：源角色live有TaskHandback，但投su后主要是text，prompt-input只表示输入并非typed报告；历史没有完整业务对象。编排需定义报告/投递持久来源才可承诺跨重载结构化成果；旧文本保留“原始交接内容”而不伪造验收或任务收齐。completed报告不等独立验收。
- P5上下文说明可放固定区域，但真实dispose/open恢复需保留，不用profileRevision/nativeSessionId假作新生命周期身份，不靠相同文案永久吞恢复。尚无新生命周期接口批准。
- P6关闭抽屉回实际发起入口，可由UI保存opener，发起按钮消失时用稳定fallback，不改变后台会话。
- P7pending独立于delivery queue，可由现UI请求登记分别显示待选择/待确认及队列状态；不把pending数塞进正式队列，不把choice操作翻成授权。

核心产品目标合理：先补失败恢复与成果核对，再减噪声；但新文件读取与持久报告不是CSS优化。后续客户即使确认设计方向，也不能据此暗中扩接口或读权限；实施前需相应固定属主把必要合同、精确写集和验证补为可审查版本。

## 待完成的设计评审

[UI独立消费者评估r1](../../../桌面UI/docs/design/2026-10-15_design_complete-flow-ui-assessment.md)已到：P1/P2源、mapper、展示三层损失分别存在；P5 `showSessionContext` 以!chat-empty判断历史，但loading先移空态，空历史提示可误判；该结论是源码推导，不冒称UI属主本人真机复现。P6真实opener、P7请求登记可复用现合同。UI未改生产/测试或操作用户窗口。

[Core独立评估](../../../运行时核心/docs/design/2026-10-15_design_complete-flow-core-assessment.md)已到：ToolResult公开仅ok/message，shell code/stdout/stderr等是内部结构，不能反解析文本伪造结构。Pi已把message存native但ANS end丢正文，start丢command，Claude start也缺args；各适配器保护范围不同。当前输出1MiB只是wholechunk软阈值、无截断标志，read_file展示无界，环境剥离不等于输出脱敏。新增有界display合同、预算/截断/敏感展示规则与各适配器消费方评估是P1/P2实施前置，本轮不暗定新policy或冒称通用安全保证。

[编排P4独立评估r1](../../../编排/docs/design/2026-10-15_design_complete-flow-orchestration-assessment.md)已到：源Pipeline追加handback不在Core回放，接收su仅prompt文本；完整历史需要源报告Service公开记录入口与目标typed输入的同批报告快照两个持久接点，现无该业务API。类型应由Model/Core公开中立定义，不能让Core导入编排私有common。成员handbackKey与投递尝试真实turn分开，保批量/重试/主动聊天报告，task/turn未知不补造。Core当前评估仅P1/P2，不代表P4接口已评估或接单，后续必须补专门合同。

产品已受正式第二轮邀请审具体revision1原型，不重新操作真实桌面；UIUX补双宽/失败/返回/草稿检查与有限回应。PM将据此给唯一recommend approval / needs revision / not ready，区分设计方向与可实施就绪程度，并列必要项/选装/未决能力。当前不修改app/src/test/.env，不改边界，不将设计任务授权当实施授权。

## 第二轮具体修订与原型证据

产品亲操原型发现建议覆盖非空草稿、已有聊天模拟保存退ready，以及停止全重画收起执行详情；PM只读审图发现普通choice侧栏仍待确认。UIUX在同轮有限回应并冻结revision2：非空草稿仅聚焦、空才填；保存保已有chat/choice/run状态；停止保详情及局部阅读位置；侧栏按kind分待选择/待确认，初始选择无默认且禁提交。PM读取对应JSON及最终原型源码、查看双宽图，未亲操键盘；不把UIUX或产品操作归给PM。

冻结原型 SHA-256 `0ea73a24312def8e0f7c237bd5c6ff22fde1c8961c5b69f62af845054babd95a`，规范revision2 SHA-256 `3143a45ee2c434b69dfbf52958466868578d3c47576e9d56a117005b92038a67`。PM已独立复算原型一致。草稿/保存/停止证据是本地模拟state，停止前后top=0/详情数组一致不代表虚拟列表锚点全验；真实文件read、API安全、屏读/IME/附件完整链仍未测。产品同版受影响点最终复核待回报，不能提前写生产verified。

[root冻结v2独立抽查](../../../测试/docs/design/2026-10-15_interaction-prototype-verification.md)已复核初始禁选、choice未选禁提交与显选、pending/queue分源和定位、阅读Esc回invoker、legacy缺字段；仅原型有限抽查，未冒签全部场景。真实UX-WALK-1在产品/UX释放后由root选择完整记录并收尾，无未决或文件写权。本轮当前app/src/test/.env无diff。

## 交付给客户的确认范围

客户本次确认对象是规范revision2与其同hash可点击原型中的P1–P7交互方向：错误/命令详情、成果只读阅读与原文分层、当前上下文状态、实际入口回焦、待选择/待确认与队列独立。不新增搜索、文档中心、自动重试/重跑、历史猜补、进度推测或正式权限mode，无选装项。

实现准备仍不就绪，必须先由实际属主定稿三项合同：①Core/Model/适配器的有限安全工具展示字段与历史透传；②Window受限文档只读接口、真实路径/清单/格式/大小/失败策略及UI消费；③编排与Model/Core的typed报告源/接收持久记录与版本兼容。P5–P7可主要复用UI现状态与请求登记，但也须各自具体写集、基线及回归。设计确认不消除这些技术前置，不自动授权生产实施或拓读权限。

验证计划应保护先前selector/config/dup/merge/full/project-reset及图片/IME/队列/卡决定/阅读锚点，新增有限合同与真实主进程验证。在线三引擎、真实磁盘安全、屏幕阅读器不能由HTML成功冒证。后续实现只有对应方案可审查、边界明确且客户授权后才能派发。

产品最终同revision2亲测R1/R2、停止阅读与960受影响点后已在canonical给recommend approval，仅设计方向；UIUX冻结字节未再改，双方各自保留本人证据/未覆盖，不冒签对方测试。PM复核四属主评估、产品/UX贡献与root独立抽查，认为方向能对准真实问题，必要性/成本及不可凭原型承诺的功能都已披露。

简报：建议客户确认本revision2设计方向。改进先让失败有可靠原因、执行可核对、成果能阅读，再把回交原文与当前状态/待处理信息分层；草稿、取消和返回焦点保持。本轮没有生产改动，确认后先补上述三个工程合同及精确实施方案，再决定实施范围；不把可点击原型或设计确认当作接口已经具备。

后续客户已明确确认revision2 P1–P7交互方向，并另授权相关角色补齐三项接口具体方案、评审后再请求实施确认。当前仅方案设计授权，未获生产实现授权；分工、canonical合同及后续可测性审核记录在[接口方案计划](2026-10-15_design_complete-flow-interface-plan.md)，不得回写本轮设计为已实现。
