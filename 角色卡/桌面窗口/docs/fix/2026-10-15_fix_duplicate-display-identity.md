---
id: desktop-duplicate-display-identity
type: fix
title: 输入与工具重复显示的窗口身份接线
created: "2026-10-15"
updated: "2026-10-15"
revision: 2
status: implemented
---

# 回交两行的来源与最小修复候选

revision 2 已按PM统一审核与root传达的既有bugfix授权实施，窗口单测通过；真实桌面验收待独立测试。用户反馈 dispatch_task、request_confirmation、其它工具及回交出现重复显示。相关功能见[多引擎会话](../feature/multi-runtime-desktop.md)。工具源端双 tool_call 的修复归运行时核心，本记录只评估 Window 的输入和历史身份传递。

## 真实证据

目标 `/private/tmp/ans-real-p-limit-20261014`，su/pi ANS `replay.jsonl` 第214行是 kind=user，at=2026-10-14T14:49:04.645Z，turnId=ffda1878-902f-44f7-870a-331d63a725a8；第215行是 event/message，at=.647Z，同一turnId，摘要为「用户指令：[回交] 来自 维护…」。su/pi native JSONL 第113行仅一条对应 user 输入（.647Z）。独立留档见[已收报告](../../../测试/docs/change/2026-10-14-p-limit-real-code-evidence/su-received-reports.json)。这些证据支持一次实际 send 的双显示来源，不支持两次实际投递。

Core `src/service/runtime/session.ts` 每次 prompt 建真实 turn、发 ACK、appendReplay kind=user，随后调用 adapter。Pi adapter `real-adapter.ts` 又发输入 message 回显。Window `runtime-history.ts` 将 kind=user 映为 user 行，将所有 message 映为 assistant 行，目前没有显式输入回显身份，所以同一输入得到两个显示入口。即时手动消息由 UI 先显示，自动派发/回交由事件回显显示；恢复历史同时有 user 与 echo。不能通过文本、时间或最近轮次猜来源。

队列 `session.ts` 的回交去重使用 projectRoot/runtime/handbackKey；同一key在入队前登记。drainQueue 在实际send前置busy，onTurnStarted来自原prompt闭包，事件转发只有 consume→interface.emitSessionEvent→主进程推送单条路径。历史读取是展示，不调用send。当前没有需要修改投递次数或放宽去重的证据；真实不同turn/call、迟到事件必须保留。

## 最小方案与唯一契约

本版对齐[Core 输入回声与确认卡方案 v2](../../../运行时核心/docs/fix/2026-10-15_fix_run-shell-description.md)。Model 导出 `PromptInputEventDetail={source:'prompt-input',text:string,imageCount?:number}`，Core 在实际 ACK、kind=user 持久化及原 signal 检查后、inner.prompt 前产生唯一 message；顶层 turnId/roleId/runtime 是该真实轮次。Pi 生产路径关闭旧回声，standalone helper 保留 typed 回声。Window 不改变事件生产。

`ReplayRow` 增可选 `input?: PromptInputEventDetail`（只读导入 Model 类型）。`runtime-history.ts` 仅对 kind=message 且 detail 的 source 为 prompt-input、text 为字符串的事件规范为 kind=user，并保留 input、实际 turnId、eventKind 与原时间。正文使用 detail.text，图片数量用 imageCount 单独传递，不解析「用户指令」前缀，不记录图片数据。

历史读取以当前请求 projectRoot/roleId/runtime 为作用域、真实非空 turnId 为输入身份：同一turn已有 persisted user 与 typed echo 时仅返回一条规范输入，优先保留 persisted user 原正文/at，并合入可信 input 元数据；不把同文异turn合并。支持两种到达次序；缺实际turn或缺typed来源的记录按原事实保留，不猜关联。只减少返回的展示重复，不删除或改写 replay/native 原始日志。没有typed echo的旧user仍展示；未知message即使正文像回声也不抹除。UI 据规范输入类别+实际turn关联live与history，不将全部message当user。

`CustomerInputMetadata` 由Core兼容增加 toolCallId?:string（真实handler原call）。Window `OperatorRequestPayload` 增 `turnId?: CustomerInputMetadata['turnId']`、`toolCallId?: CustomerInputMetadata['toolCallId']`，在 customer-input.ts 从原 metadata 逐字段透传，仅非空字符串存在时携带。已有ctx中的projectRoot/roleId/runtime和原metadata.signal仍保留；op-N只用于响应pending请求，不充当toolCallId。UI必须同时有实际turn/call才能按作用域绑定交互卡，未知legacy继续原请求/结果展示，不凭标题匹配认定重复。本次不改变respond、授权、取消或signal检查。

不改queue、dispatchTask路由、handback投递、重试或实际send；不读取或改凭据；复用既有 session:history 与 session:operator-request，不新增通道。新增payload可选字段由UI同步消费，main/preload既有透明传递不需修改。

## 恢复提示的范围裁定

现OpenResult与role-state仅contextSource/contextWarning，profileRevision表示配置版本，不是handle生命周期；nativeSessionId也不能代表每次新handle。UI showSessionContext已有source/warning token幂等，root所见可能是真实reopen提示。目前没有同handle重复通知的真实证据，不新增sessionInstanceId接口，不宣称本批解决此类提示。后续若取得证据，另行按固定角色与接口审核，不以文本或profileRevision猜生命周期。

## 精确修改与必要验证（尚未实施）

本角色源文件只改 `app/desktop/runtime-history.ts`（typed输入规范/同真实turn展示去重）、`app/desktop/session-history.ts`（ReplayRow input可选类型）、`app/desktop/customer-input.ts`（OperatorRequestPayload turnId/toolCallId透传）。本角色测试只改 `test/桌面应用/multi-runtime.test.ts`（ANS历史mapper typed输入与双源次序）、`test/桌面应用/operator-wiring.test.ts`、`test/桌面应用/diagnostics.test.ts`（原调用身份与信号/pending生命周期不变）；可按现有夹具位置选择其中必要用例，不新增未授权测试文件。文档仅本记录、api-spec及本角色docs/fix证据。

必需回归：persisted user+typed echo同turn只返回一输入、两种次序都保留原正文；同文异turn、未知legacy、缺turn、真实助手同文消息保持；input imageCount与原图片引用/原ACK保真；交互payload真实turn/call逐字段保留，缺字段不造，op-N响应仍有效，原signal取消仍拒绝；scope/runtime隔离。运行既有dispatch-delivery/handback-delivery/message-queue验证实际send次数不变，运行窗口相关专项与typecheck。UI/Core各自验证工具真实turn/call幂等；测试角色独立真实ANS窗口复测，本角色不并发操作窗口。

风险是错误输入身份会吞真实消息，采用typed来源+实际turn和scope限制，不按正文过滤。旧日志缺identity时保留可见重复而不是伪造关联；兼容处理明示为未修复的未知旧记录。此次无可选增强项，实施需root转达统一审核与客户授权。


## 窗口实际交付与验证

实际只改3个源文件：runtime-history.ts、session-history.ts、customer-input.ts；测试只改multi-runtime.test.ts（新增2项行为测试并加强既有原signal取消用例的真实turn/call断言），其它授权测试仅运行不修改。API同步记录可选字段。未改queue/send/main/preload，不增sessionInstanceId，不操作用户当前窗口。

7文件64/64通过：multi-runtime、operator-wiring、diagnostics、session-history、dispatch-delivery、handback-delivery、message-queue。新历史夹具包含两种到达顺序、同文异turn、重复typed echo、缺turn、未知旧前缀消息、跨role错误标记、原日志逐字不变；交互测试验证真实turn/call、op-N响应、legacy缺字段不造及原signal失效。最终 npm run typecheck exit0，git diff --check通过。[原始单测](2026-10-15_duplicate-identity-window-tests.txt)、[类型检查](2026-10-15_duplicate-identity-window-typecheck.txt)、[候选与消费依赖哈希](2026-10-15_duplicate-identity-window-manifest.txt)。

这些是窗口mapper和payload行为证据，不替代UI真实显示、工具handler次数或原生桌面最终验证。源端并行变更后由测试角色按最终共同候选复核完整链路。


### 必要工具阶段身份校正

root与PM独立复核发现：原history mapper把所有denied映为activity.phase=result，UI优先采用该字段，造成同call的hook blocked与SDK failed result可互吞。窗口已将phase类型扩为call/start/blocked/result，对可信detail.phase=start/blocked/result逐字保留；canonical start保留request锚点。实际hist测试同turn/call、同summary的start、blocked与failed result分别返回且失败状态不丢。root裁定缺phase按原结构kind映射：tool_call→start、accepted→result、denied→blocked；真正unknown继续旧路径，native legacy toolResult仍是result，不更改原日志或实际handler/send。

阶段校正最终专项 multi-runtime/session-history/operator-wiring 38/38通过，最终typecheck exit0、diff-check0。新证据为2026-10-15_duplicate-identity-window-phase-tests.txt与phase-typecheck.txt。


### 新副本恢复提示的只读核查结论

root 在 `/private/tmp/ans-real-p-limit-20261015-status-retest` 完成普通聊天后观察到一次「边界已更新或配置已保存」和一次「已恢复」。该副本首次导入无sessions，UI四角色均未开启；此前新项目旧badge已由UI修复（cbd3a404）。此处不重复操作真实窗口。

Window独立查到普通聊天settled为2026-10-15T01:26:34.416Z；`.ans/project.json` mtime为.417375Z，`docs/bootstrap-manifest.md`为.417919Z。su 每次settled默认autoRepin，finalize会标准化重写两文件；Window按文件内容SHA256检查，发现变化后真实dispose并open，非延迟watcher或重复广播。现四个pin全部匹配、边界文件未变。

root随后按实际创建脚本重建before：`json.dumps(d,ensure_ascii=False,indent=2)`没有尾LF。before1491字节、after1492字节，语义相等且before加单个LF逐字等于after。故是测试副本格式标准化导致内容哈希变化，触发真实新会话生命周期；一次重建提示和一次恢复提示符合实际，不属于重复显示缺陷。无需产品修改、不增加sessionInstanceId、不按文字去重。此结论仅覆盖该副本与此轮，不声称所有未来恢复提示均无重复。
