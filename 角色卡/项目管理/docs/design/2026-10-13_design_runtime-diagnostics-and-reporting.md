---
id: runtime-diagnostics-and-reporting
type: design
title: 真实回交汇总、聊天空白与24小时诊断日志
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [background-rebuild-active-session, truthful-handback-and-authorized-shell, runtime-outcome-and-diagnostics]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户要求停止真实项目测试、删除测试代码并修复报告汇总、白屏、重复确认，关键日志只保留一天；各属主已独立调查和评审接口
  - date: "2026-10-13"
    kind: verified
    summary: 所属角色实施完成，独立离线组合与真实Electron验收通过，最终修复版本已打开并确认诊断日志真实落盘
---

# 用户应收到主入口的真实汇总结论

客户在真实计算器试跑中看到的报告只有“completed / 会话结束 / write_file 执行完成”，同时有空白聊天区和重复确认。试跑已停止，对应 Electron 进程已退出，临时计算器目录 `/private/tmp/ans-real-project-20261013-FrfwDD` 已按客户指令删除。此后仅做修复所需的离线回归，不继续让真实模型创建测试项目。

本方案依据客户直接指令“删除掉测试代码，修改一下里面的问题吧”“必须在关键位置都加上日志”“日志只保留1天”安排必要修改。项目管理评审结论为推荐实施；该结论不冒充客户对某个文档版本的确认。已授权范围内直接推进，不加入选装功能或重新索取同一修复授权。

## 已查明的原因

- Pi 工具包装丢失 handler.ok，失败也被 SDK 视为成功；accepted 事件没有文件路径，回交只能得到重复工具名。
- shell 审核等待没有挂入交互等待闸，人工确认期间 prompt 的120秒时限仍继续，可能先中止轮次。
- 编排在没有有效正式报告时仍推导 completed，且 seen/report 跨轮残留；事件消费晚于下一次 send 时还可能错取报告。
- 桌面将报告提前镜像到 su，又将实际投递的正文显示一次；连续回交分多轮进入 su，提示仅要求验收，没有明确对客户汇总。
- 长聊天 dirty flush 固定选择尾部窗口，用户上翻时仍卸载视口行。只读探针300行/视口200px得到 visibleMounted=0，按当前视口更新则为5。此结论证明聊天区空白机制，不把它说成已复现整个 Electron 进程崩溃。

## 角色与对接

| 属主 | 必要交付 | 依赖与核查 |
| --- | --- | --- |
| 项目管理 | `src/common/shared/diagnostics.ts`、本角色专属 shared 测试、共享组件文档 | 统一存储与滚动24h清理；其它角色只导入，不另建 sink |
| Pi适配器 | 工具真实 ok/isError、安全事件详情、交互等待/abort、每prompt唯一终态和日志 | 公共类型由 `src/provider/pi/session.ts` 主属维护；先提供 turnId/outcome/report metadata |
| 编排 | 按轮隔离回交、真实状态和有用证据、单份/批次汇总提示、已授权常规检查政策和日志 | 消费 Pi 元数据与共享日志；主属 `TaskHandback` 和报告正文渲染 |
| 桌面应用 | 当前视口窗口化、异常诊断、真实回交投递及合批、移除主入口双份原始报告、政策接线 | 消费编排批次渲染；不得另推导报告/权限/日志存储 |
| 测试 | 最终组合候选的独立离线回归 | 不改产品代码，不恢复真实项目试跑 |

方案分别由[Pi适配器](../../../Pi适配器/docs/fix/2026-10-13_fix_runtime-outcome-and-diagnostics.md)、[编排](../../../编排/docs/fix/2026-10-13_fix_truthful-handback-and-authorized-shell.md)及桌面应用固定上下文提出。已有 API 和相邻层调用原样复用；共享日志是框架支撑，不能反向依赖运行层。原有 session 恢复与 refreshListing 未提交修改作为基线保留。

## 轮次与报告契约 v1

真实适配器每次 prompt 生成一个稳定 `turnId`。所有该轮事件在既有 `detail` 携带 turnId；终态只有一次 `settled`，其 `detail.outcome` 为 `completed | failed | aborted | timed_out`，可含安全 errorCode。中间 SDK 重试错误不压过最后真实成功；硬超时则锁定 timed_out。工具详情为 `{turnId,toolCallId,toolName,path?,ok,status,durationMs?,errorCode?}`，不携带源内容。

`ReportHandbackMetadata = {turnId:string}` 由 provider/session 单一定义；`ReportHandbackFn(report,metadata?)` 的报告 payload 不变，既有单参调用兼容。工具入场时捕获本轮标识，迟到回执不能归到下一轮。编排按 turnId 保存、消费和清理报告/证据，不依赖“当前最新报告”。旧替身缺元数据仍按已知轮界收口并清理，不伪造来源。

`TaskHandback.status` 由编排维护 `completed | blocked | unreported | failed | aborted`；工具 `TaskReport.status` 继续仅 completed/blocked。无正式报告不得推导完成，失败/超时不能被此前 completed 报告覆盖。缺报告时给出明确待补原因及可识别、去重的实际文件路径证据，不把工具计数当成果。

编排公开 `renderHandbackBatchPrompt(handbacks: readonly TaskHandback[]): string`，与既有单份函数同源。要求 su 验收已经收到的报告后向客户汇总成果、证据、未完成/返工和下一步；任务关联未知时不宣称全部角色已完成。桌面仅合并同项目 su 队首连续 handback，遇用户消息/派发就停止，失败整批按原顺序保留，去重键不丢。来源角色保留证据，su 只显示默认收起的真实投递详情与模型汇总结论，不提前镜像原始卡片制造收到假象。

## 普通检查的委托确认

客户本次“按理说不是替我同意吗”作为宿主执行普通检查的直接授权。桌面为当前已导入且已授权项目传入政策 `{enabled:true,projectRoot,authorizationSource:'customer-delegated-routine-checks'}`；这不是 su 派发自授，也不是全局绕过。

编排只对精确常规检查形式（npm test、npm run typecheck、约定 node --test）且 b 审核明确 allow 的请求免重复 a。c 硬拒不变，非匹配 risky、删除、安装、外部操作仍走原审核链；b 拒绝或不确定不能当作已授权。具体 argv 匹配/项目一致性由该角色单一实现并测试。Pi 工具文案必须区分已接受项目边界内任务与真正需要确认的治理变更，避免提示强制每次普通写入重复申请。

## 统一诊断日志契约 v1

`configureDiagnostics({directory,clock?})` 在桌面 main 初始化；默认目录为 `path.join(app.getPath('userData'),'ans','diagnostics')`，避免多个 Electron 项目共用日志。`createDiagnosticLogger({component,projectRoot?,roleId?})` 返回 `record(event,fields?)` 和 `error(event,error,fields?)`。未配置时 no-op；异步串行 JSONL 写入，IO失败不让业务抛错，但 `getDiagnosticsStatus()` 返回目录、固定 retentionMs 和净化 lastError。`flushDiagnostics()` 与 `disposeDiagnostics()` 用于验证和退出。

每条记录含时间、组件、事件、项目/角色上下文，以及 runtime 白名单元数据：turnId/toolCallId/toolName/path/outcome/durationMs/ok/errorType/errorCode/errorMessage/requestId/decision/reasonCode/state/count/queueDepth/reportSource/pid等。未知字段不存；禁止命令原文、argv、prompt、源内容、token、原始API响应。错误消息移除已知环境凭据与常见授权/密码片段，限长；错误对象不原样序列化。

日志按**滚动24小时**保留，不按自然日粗删。启动和写入时检查维护期限，并由每分钟维护任务清理早于24小时的记录；维护 timer 不阻止退出。写入检查最多每分钟扫描一次，避免每条日志反复解析一整天记录导致主线程压力；过期清理粒度为一分钟。仅处理本模块自己的诊断文件，不删会话历史、治理审计或用户文件。清理同样串行，验证精确边界、旧行移除、非日志文件不动、写入/清理失败不影响业务。

关键位置：应用启动/关闭/加载失败/renderer退出、renderer error与unhandledrejection、会话open/send/rebuild/stop、SDK构造/恢复/prompt start/end/timeout/abort、工具start/result、审核和交互等待起止、submit_report接收及终态、报告enqueue/block/deliver/fail/batch。renderer通过桌面窄IPC上报白名单诊断，不提供任意写文件能力。

## 完成条件

实际行为测试证明：失败工具不accepted；等待确认不耗模型计时且仍能abort；报告不跨轮串/不伪完成；连续报告真正合成一次su输入且失败保留；上翻接收新输出仍有可见行；普通已授权检查不弹重复确认；日志包含关键事件且自动删除24小时前记录。必要类型、角色和组合回归通过；环境基线失败单列。

## 最终交付与证据

项目管理日志专项8/8；Pi适配器185/185；编排222/222；桌面相关13/13与renderer/hot-path45/45，角色全套201计/200过/1目录名基线失败。最终全仓离线回归1029计/1026过/2失败/1跳过；二红分别为未改的pi-config默认目录末尾要求ans-cli、shared路径测试在macOS的 `/var` 与 `/private/var` 字符串预期。类型检查、差异检查和原有用户补丁逆向匹配检查通过；没有用放松断言盖住这些基线问题。完整输出 `/private/tmp/ans-runtime-integrated-regression-final-20261013.log`。

固定测试角色独立组合5/5、未接受项目负分支1/1、交互等待3/3、队列保序/失败保留2/2；真实Electron独立验证上翻内容锚点、默认收起报告、窄日志IPC、24h集成、真实renderer崩溃后的显式恢复、同id未决请求恢复并可作答、关闭窗口后真实activate均通过。报告 `/private/tmp/ans-independent-desktop-final-01a133d2/report.txt`；开发者最终完整harness `/private/tmp/ans-runtime-diagnostics-e2e-p1-final/report.txt` 同样 E2E_DONE=1，无ERROR/WATCHDOG。这些是临时验证输出，产品诊断留存由共享组件管理。

独立验收额外发现的长聊天定位问题已经修复：450行后显式定位卡仍在视口外，改为邻近虚拟行实测后按真实rect校准。修复后卡top387.015625/bottom496.515625位于视口98.28125至584.859375内，标题和确认按钮两种入口都实际可见。中部绝对scrollTop随高度重估变化不作缺陷：同一可见内容锚点偏移仅0.0625px，保持阅读位置。

最终共享日志源码SHA-256 `acd54eb0064dee857e1a14255cc7b59817a979cd34a7825134d9f35eb68f98f4`；renderer `959740486ba447272ef30a38c634e5b77d82e3dcd1e2ef8ad7907d024d47b191`。各角色完整写集、哈希与自身证据见各自修复记录。全部改变均在属主边界内，原refreshListing修改与未跟踪dispatch测试保持；后者SHA-256仍 `2f342694adaa091b0dfe4050f451fc4decad3fa437547f510327db38dd1b6cd9`。

2026-10-13已重新打开实际 `app/main.ts`，界面显示正常导入页，未继续真实模型项目试跑。实际日志 `/Users/wangzhongren/Library/Application Support/Electron/ans/diagnostics/ans-diagnostics-2026-10-13.jsonl` 已出现app.start/window.load.start/window.load.end及IPC起止，进程82165。临时计算器目录再次检查不存在。没有提交、发布或部署到其它机器。

确认修复的是已复现聊天视口空白、卡定位和mac重开IPC问题；原始整窗异常尚未独立确认根因，现可记录并尝试显式恢复。SDK已启动直接子进程尚未接AbortSignal，本波未扩展进程树治理；不将模型中止或有界清理说成所有子进程停止。上述限制不改变已验证的本次修复结论。
