---
id: duplicate-event-integration-review
type: fix
title: 工具与输入重复显示的统一身份修复审核
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
revision: 1
related: [desktop-event-duplication, desktop-duplicate-display-identity, pi-canonical-tool-events, runtime-core-run-shell-description-20261015]
---

# 同一次工具调用或输入只显示一次，真实不同操作继续保留

用户已明确要求核查全部重复并修复。此指令覆盖当前已查明缺陷的必要修复，root将据此向固定属主派发；不记录成用户已经确认本新文档的具体文字。当前仅调查、跨角色方案与审核，尚未实施。任何新增业务、权限或可选增强不由该指令自动批准。

证据与方案：[UI调查](../../../桌面UI/docs/fix/2026-10-15_fix_event-duplication.md)、[窗口调查](../../../桌面窗口/docs/fix/2026-10-15_fix_duplicate-display-identity.md)、[Pi源端方案](../../../Pi适配器/docs/fix/2026-10-15_fix_canonical-tool-events.md)、[Core v2](../../../运行时核心/docs/fix/2026-10-15_fix_run-shell-description.md)。项目管理独立只读相关源码、实际计数与属主SDK探针后确认：Pi hook与execution_start为同一工具双生产；真实回交只有一次native user，却在replay有同turn user与普通message回显。不是已有证据证明工具handler或队列send执行两次，不应改投递重试掩盖显示问题。

## 最小统一契约

1. 工具：Pi只在真实SDK execution_start生产一个canonical tool_call，带实际turnId/toolCallId，detail.phase为start。hook治理照旧，拒绝事实phase为blocked；SDK结束结果phase为result，保留ok/status/errorCode。blocked与result是不同阶段，不能因同call吞掉后者。其它适配器现有kind可由消费者映射既有阶段，不按摘要推断，不为本修复增开无必要适配器写集。
2. 输入：Core是注入生产路径唯一输入回显生产者，在实际开始通知、user持久化及signal检查后、inner.prompt前发一次message，detail为中立 `PromptInputEventDetail {source:'prompt-input';text:string;imageCount?:number}`，top带真实runtime/roleId/turnId。Pi生产注入明确关闭旧echo；standalone/helper缺省兼容原echo并补typed marker。demo同理区分真实Core turn与standalone，Codex/Claude由Core得到一致输入。图片原对象透传，标记只记数量，不在新事件复制图片内容。
3. 历史/显示：Window透传权威输入标记与真实turn，原replay user与typed echo在UI归为同一输入身份；同文不同turn是两次输入。工具显示登记使用项目/角色/runtime/turn/call/phase；结果阶段不得被开始阶段覆盖，拒绝和失败继续可见。live/history双向只覆盖同可信身份，不改审计原记录。旧缺身份记录保持事实，不用正文前缀、标题、时间窗或最近调用猜重。
4. 请求卡：Core `CustomerInputMetadata.toolCallId?`仅把实际确认/选择handler入口原callId与既有turn/signal传出；Window关联到实际请求载荷。随机requestId是答复关联，不冒充callId。UI在可信同turn/call和requestId对应下整合冗余请求展示，两个到达顺序均处理，仍保留实际卡、决定、失效、失败、回放锚点与后台角色隔离；同标题新request不可吞。
5. shell说明：仅公共schema的run_shell工具description及command description说明一次程序argv、shell:false、不解释operators/展开、多命令分次调用，保留ShellGate明确allow。splitCommand、spawn、门禁/审核策略不变，不将说明修正变成shell执行模型变更。

原handler、dispatch/report回调、忙碌队列、客户clientMessageId/ACK、abort、失败与迟到事件及多runtime隔离保持。输入类型与可选callId属于已有事件/请求显示合同补身份，不授权任何新能力。接口方向仍为Adapter→Core→Pipeline→桌面Interface既有事件流，UI不访问私有运行时实现。

## 待定项与写集

唯一审核结论 **recommend approval**。已复核Core v2、Pi r1、Window r2、UI r2字段与范围一致，root可据用户现有bugfix授权冻结并派发本记录必要修复，不须把该授权冒记成确认新文档全文。恢复提示重复目前缺独立同生命周期证据，现UI已有contextSource/warning token；本批保留并回归现幂等，不新增sessionInstanceId。后续取得证据再审必要修复，不用profileRevision/nativeSessionId冒充生命周期身份；此未证实检查不阻塞已查明缺陷。

Core：`src/provider/runtime/schema.ts`两个说明，`src/model/runtime.ts`上述detail导出与可选metadata，`src/service/runtime/session.ts`输入事件，`src/provider/runtime/tools.ts`demo输入与metadata；测试仅`test/runtime-core/session.test.ts`、`customer-input-context.test.ts`必要行为，同属主文档证据。

Pi：`src/common/pi-adapter/real-adapter.ts`；新增`test/pi-adapter/tool-call-events.test.ts`，必要同步`prompt-images.test.ts`、`injected-runtime.test.ts`及自身文档。

Window r2：`app/desktop/runtime-history.ts`、`session-history.ts`、`customer-input.ts`；测试仅`test/桌面应用/multi-runtime.test.ts`、`operator-wiring.test.ts`、`diagnostics.test.ts`必要用例。ReplayRow可选input只读Model类型，typed echo规范为user并与同turn的persisted user归一，优先保原user正文/at，支持两种次序；实际request载荷可选turnId/toolCallId仅非空原metadata透传，op-N仍只响应ID。main/preload透明通道、队列不改。

UI r2：`app/renderer/renderer.js`、`tool-rows.js`、`runtime-ui.js`的身份登记与映射，必要纯展示helper在自有renderer目录；测试仅属主`test/桌面应用/tool-rows.test.ts`、`runtime-ui.test.ts`、`renderer.test.ts`、`e2e/uiux-v2.mjs`及自身文档。工具顶层turn优先，重复成功不得把失败/拒绝降级，blocked/result保持不同阶段。其它文件只读。

## 验证与保护

真实SDK测试须证明同call唯一start且handler一次、hook阻断handler零次但blocked/result事实保留；覆盖九工具统一路径、不同call/turn、合法相同文本、缺身份、异常和重复终态。Core证明每实际prompt一次typed输入、图片保真、前置拒绝无输入、真实助手即使带“用户指令”前缀也保留。Window/UI联调验证live/history两向、append/full/growth、卡片两种到达顺序、相同标题不同request、失败/决定/失效、clientMessageId及阅读锚点不回退。受影响依赖改动后重测消费者，独立真实桌面核native/replay与实际副作用次数，不用行数冒充执行次数。

root原p-limit修复任务已经通过red/green及独立green并有三报告，当前确认撤权收尾继续保留。本修复不改目标项目成果、权限、.env或凭据，不把复测当重新派发原任务。旧日志不改写，后续需要模型探针由测试角色保留明确输入/候选与验证边界。当前生产未改、测试未运行，不提前记verified。

兼容限制明确：旧Pi双start其中一条缺callId，旧回显缺typed来源；无法建立可信关联时仍保留原可见事实，本批不承诺旧缺身份历史自动消失。修复后新来源幂等与既有可关联历史才可按合同呈现一次。没有新增业务或选装内容，无权限扩张；因元数据修订，受影响旧集成证据须重测后才能作为当前结果。

## 实施对照进展

root已据当前用户bugfix指令向固定属主发本版必要范围实施指令，未记录为客户确认本新文档全文。Core、Pi、Window已交付候选，项目管理只读实际diff与统一r1核对：typed输入在Core actualACK/persist/signal之后产生一次，Pi生产echo关闭、standalone兼容保留；唯一SDK start、治理hook与blocked/result事实保留；Window两序输入归一仅可信同turn并优先原user正文/时间，请求原turn/call非空透传，queue/send/main/preload不变；未知旧消息不按前缀过滤。

root随后独立读码发现窗口历史将denied的activity.phase统一写result，而UI优先采用该显式phase，不再从eventKind回退blocked，导致同call的hook拒绝与SDK失败result被合吞。项目管理先前认为eventKind仍足够的判断有误，已纠正并要求窗口按本版三phase契约保真实阶段；这属于必要合同实现修复，不新增政策或写集。修后必须通过真实history mapper→ToolRows同call blocked/result独立事实回归；此前11项输入/回交集成不覆盖该问题，不能用于宣称工具阶段通过。

root已裁定并由窗口落实：显式start/blocked/result优先；缺phase仅按已知kind映射tool_call→start、accepted→result、denied→blocked，真正unknown沿旧规则，不用正文。显式result即使kind=denied仍保result，原legacy native toolResult的显式result也不改。项目管理复核同call历史夹具期望[start,blocked,result,blocked,result]，UI按phase建身份与阶段登记，samephase失败/拒绝不会被后来成功降级；此校正保持live/history一致，无需改Codex/Claude生产。

## 真实复测发现的项目状态顺序缺陷

root独立在无sessions的新副本导入后首次DOM见到旧角色停止/恢复徽标。项目管理已读[UI最小顺序方案r1](../../../桌面UI/docs/fix/2026-10-15_fix_project-status-reset-order.md)及实际applyListing：角色树/右栏/头部首次render先于fresh分支清roleMeta/busy/queue/resetPanes，清理后没重画，故旧DOM存续。推荐按现有“核查全部并修复”授权修复：仅将原fresh重置移到首次render前，保持fresh=false普通刷新、成功切换后才清、pendingHistories按projectRoot冲洗及新项目真实快照。无需新generation接口，不改状态派生政策。

追加必要写集只`app/renderer/renderer.js::applyListing`、`test/桌面应用/e2e/uiux-v2.mjs`与属主记录；其它冻结候选不扩大。属主修后须给新hash并重跑受影响UI，root重载实际窗口核新项目首次DOM；先前98/32等旧UI结果不能冒用为新字节证据。原p-limit任务、窗口/运行时、配置与权限不在该校正写集。

## 最终当前候选验收

项目管理已读取[测试角色独立报告](../../../测试/docs/fix/2026-10-15_duplicate-events-independent.md)与[p-limit真实修改/撤权报告](../../../测试/docs/change/2026-10-15_p-limit-real-code-desktop.md)，独立重算其candidate-manifest中13个源码/测试文件，全部匹配。最终renderer为`cbd3a40459776306f04b12c24e66e7e0da5edab9eec9625f40311f7abd53df0a`，阶段校正后的runtime-history为`46343b7ffe8625b4bd089dc10bb35a6a176364f4535721c15343ad5b743d7fcf`。reset r1的必要顺序修复由root依据本轮全部bugfix授权派发，不记录成客户确认该新草案文本；未加generation接口。

最终全仓原始日志1259项：1258 pass、0 fail、1既有Windows skip；最初受限环境的本地listen EPERM原日志保留，允许监听后同套通过。最终typecheck由测试角色记录exit0，项目管理另跑当前diff --check通过。UI修后PROJECT_RESET7、DUP32、MERGE12、FULL98、单元59均为新字节重跑，未冒用旧冻结候选。Core/Pi/Window专项及独立11项合同测试作为分层证据，九工具覆盖包含受控SDK/renderer路径，不声称九种全由在线桌面逐一重造。

真实Pi桌面：原项目request_choice/request_confirmation各一次、实际点击决定、write/edit落盘读回；新鲜副本fresh3中su的native调用/结果/start均10，测试均11，重复start身份均0。两次独立node -v均保留；预期ENOENT工具失败仍可见，分次git与精确npm test实际31通过/exit0；dispatch、submit_report与回交各一，最终renderer重载后派发/回交仍各一。最终顺序修后再次导入另一无sessions同名角色项目，未点角色首次DOM四角色均未开启，普通聊天零工具/零回交。

旧su长会话上下文压缩120秒超时保留为实际失败，不计通过，也未放宽超时；剩余链用无旧sessions副本完成，原源码补丁与31项红绿/独立绿、三报告及撤权证据保留。普通聊天后的真实重开/恢复经测试角色核查是fixture JSON缺尾LF导致su收尾1491→1492字节修正、实际dispose/open，不是同句柄重复通知，不为此新增接口或删真实恢复提示。

最终结论：**当前候选 verified**，已查明工具/输入/卡生命周期重复与新项目首次状态顺序缺陷闭合，已有失败/不同turn/call/图片/回交语义保持。旧匿名历史缺可信身份仍诚实保留；Codex/Claude仅受控三runtime合同验证，未声称在线通过；.env不变，原p-limit源码临时写权已撤、pins匹配，未提交或发布。

属主回报Core窄24/相关57、Pi专项31/全Pi209、Window64均通过且各typecheck为0；独立测试角色新增`test/测试/duplicate-input-identity.test.ts`并与chat-handback/T1联跑11/11，覆盖三runtime同文异turn、真实Core输入/历史归一、助手同前缀保留、入口callId准确与原失败/超时/中止回交。最终UI与真实桌面仍待当前候选证据，此处不标verified。

原p-limit31项red/green、独立green与三份报告已由测试角色核实；撤权完成后index/test不可写、doc可写且pins匹配，补丁保留。后续修复复测不重新打开该写权，不丢原任务成果。
