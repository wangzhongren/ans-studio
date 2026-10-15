# 运行时核心公开接口（ANS-RUNTIME-V2 revision 1 / C1）

唯一中立类型入口为 `src/model/runtime.ts`。现有 Pi 的 `RuntimeAdapter`、`RoleSession`、`SessionEvent`、`PromptOptions` 与 gate/交互/报告/派发/审读全部公共形状已移入这里；Pi 属主保留旧路径类型转出。新增字段均不要求旧会话替身实现。

**C1A开始确认：** `PromptOptions.onTurnStarted?: (metadata: PromptTurnStartedMetadata) => void`，metadata只含 `readonly turnId:string/roleId:string/runtime:RuntimeKind`。Core actual新turn在前置disposed/active/quarantined检查通过、UUID/active/providerturn设置后，try内且appendReplay/nativeprompt前同步恰一次调用。前置拒绝零调用；callback同步抛错进入failed单terminal并释放active，未开始native工作则不调用idle native.abort。adapter仅接收原PromptOptions对象/images，不调用此callback。它不带signal/clientMessageId、不写入store、不授予任何权限。Window只从原prompt闭包捕获ack后按actualturn关联显示；不能用首次事件/FIFO/latest猜测。旧缺callback兼容不变；当前证据见 [C1A](docs/fix/2026-10-14_fix_prompt-start-acknowledgement.md)。

适配器冻结输入为 `RuntimeProviderOptions`，工厂为 `RuntimeProviderFactory = (options) => RuntimeAdapter | Promise<RuntimeAdapter>`。核心 Service 的入口是 `src/service/runtime/session.ts::createRuntimeAdapter(options): RuntimeAdapter`。适配器公开工厂分别约定 `createPiRuntimeAdapter`、`createCodexRuntimeAdapter`、`createClaudeRuntimeAdapter`；Service 也支持 `providerFactories: Partial<Record<RuntimeKind, RuntimeProviderFactory>>` 无网络注入。SDK 只在实际请求所选工厂时加载。

`RuntimeProviderOptions` 必需 `runtime/projectRoot/skillRoot/tools/interactionGate/currentTurnId`，可选 `storage/modelId/baseUrl/providerId/apiKeyEnvVar/promptTimeoutMs/constructTimeoutMs`。`tools` 是只读数组，每项含 `name/description/inputSchema/handler`，可选 `promptGuidelines/executionMode`。`inputSchema` 是 JSON Schema；handler 收 `{name,args,toolCallId?,signal?}`，返回 `{ok,message}`。只有 Service 构造这些工具；适配器仅转换 SDK schema 和调用 handler，禁止自行复制、导入核心 Provider 或他人 common。`interactionGate` 与旧 Pi 完全同形：`begin/end/isWaiting/onChange`；客户或 shell 审核等待会暂停适配器 prompt 时限。

工具公开入口为 `src/provider/runtime/tools.ts::buildGovernedTools(gate, options?): ToolDefinition[]`。schema 公开入口为 `src/provider/runtime/schema.ts::describeTool(name)`，返回旧 `parameters/description/promptGuidelines?/executionMode?` 形状供 Pi 兼容；工具对象使用 `inputSchema = parameters`。写/编辑/读取默认注册；shell、确认/选项、报告、派发、审读只在注入对应能力时注册。报告/派发支持可选第二参 `{turnId,roleId?,runtime?}`；单参消费者兼容。`executionMode: sequential` 的写入与交互必须由适配器按顺序调用，不能与同批写入并发。

**C1R 冻结补充：** `CustomerInputFn(req, metadata?: CustomerInputMetadata)`，第二参含 `signal?: AbortSignal, turnId?: string, roleId?: string, runtime?: RuntimeKind`。确认和选项 handler 在本次入口捕获轮次，并把原 `call.signal` 引用送给客户回调。旧单参 callback 完全合法。发放确认写集的消费者必须在真正发行前检查此原始 signal 是否 aborted；不能依后来轮次或新的 signal 判断旧 yes 是否有效。工具的 raceAbort 仅停止当前等待，不会取消消费者自己的 promise/副作用；O1/D1 必须按该上下文使旧许可和卡失效。修复与当前证据见 [C1R](docs/fix/2026-10-14_fix_customer-input-cancellation.md)。

持久化入口为 `src/provider/runtime/session-store.ts::createRuntimeSessionStore({projectRoot,roleId,runtime})`，返回 `RuntimeSessionStorage`。只读字段 `runtime/roleId/directory/nativeDirectory/legacyDirectory?`；Pi 独有 legacyDirectory 为旧角色目录。回调 `readLatest/saveSession/appendReplay/readReplay`。原生目录是 `.ans/sessions/<role>/<runtime>/native/`；ANS 索引和 JSONL 回放在同隔离目录的 `ans/`。存储对象创建/读取不建目录，第一次保存才建。适配器只使用注入的精确目录，不能遍历其他角色/runtime。可选 `validateNativeDirectory()` 在 native 读取/恢复前校验全目录链且不创建目录；`prepareNativeDirectory()` 在真正开始 native 持久化时创建目录，mkdir 前后校验，拒绝 symlink/非目录。公共 store 实现两者，旧注入替身缺席仍兼容；适配器不得复制安全实现。

`RoleSession` 可选 `runtime/roleId/contextSource/nativeSessionId/contextWarning`。`contextSource = in-memory | fresh | resumed | recovered`，只有原生引擎确认恢复了模型上下文才允许 resumed；ID 存在和 ANS 回放都不构成该确认。若恢复失败后新建，使用 recovered 并附 warning；失败不可默默切另一引擎。恢复可能延迟至 prompt 才被 SDK 判定，适配器须随后更新会话属性。Service 保存实际属性，并明确每轮 failed/aborted/timed_out/completed，恰好一个 settled。单次 settle 不意味着任务报告已完成。

历史公开读取的 **Pipeline 指定入口**为 `src/service/runtime/session.ts::readRuntimeSessionHistory({projectRoot,roleId,runtime}): Promise<{record?:RuntimeSessionRecord,entries:RuntimeReplayEntry[]}>`，Service 委托已有 Provider operation，只返回 Model 记录/回放值，不转出 Provider 对象。`src/provider/runtime/session-store.ts` 的同名入口仅供 Service 和 Provider 验证使用；桌面经 Pipeline，Pipeline 经 Service，不能跳层。这是 ANS 回放，绝不宣称可恢复原生上下文；缺目录时返回 `{entries:[]}`，读取不创建 `.ans`。C1H 修复见 [当前记录](docs/fix/2026-10-14_fix_service-history-entry.md)。无持久化选项时 `storage` 缺席，不创建 `.ans`。

`RuntimeSessionOptions` 必需 `runtime/gate/projectRoot/skillRoot`，继承公共工具 options（读写根、shell gate、确认、报告、派发、审读与各时限），可选 `providerFactories/persistSession/modelId/baseUrl/providerId/apiKeyEnvVar/promptTimeoutMs/constructTimeoutMs/script`。`persistSession: true` 才注入 store；`script` 只供 demo。写根未给时沿用只判定、不落盘的兼容行为；生产调用方须将 writeRoot 固定到项目根。Service 自动将实际 `apiKeyEnvVar` 加入 shell 的剥离集合，`GovernedToolsOptions.extraCredentialEnvVars` / `buildShellEnv(base, extraNames = [])` 支持明确额外凭据名，旧单参兼容。

**C1T 时限兼容：** Service 在 Provider composition 时解析一次有效 prompt/construct 时限，把相同数值交给外层计时器与 RuntimeProviderOptions。Pi：显式 option 以 `??` 优先且保留原值；未给时沿原 `ANS_PI_PROMPT_TIMEOUT_MS` / `ANS_PI_CONSTRUCT_TIMEOUT_MS` 规则，env 有限正数才 floor，缺失/空白/非法回退 120000ms。显式非有限/非正值依既有 helper 不设时限，不能偷偷替成默认。其他 runtime 保持显式值或 120000ms，不读取 Pi env。没有新增 UI 或 env 字段；Model/API 形状不变。当前验证见 [C1T](docs/fix/2026-10-14_fix_pi-effective-timeouts.md)。

Service 为每轮提供一个 ID，归一事件的顶层和 `detail.turnId`，报告/派发 metadata 使用同一 ID。适配器每次 handler 调用必须携带该轮原始 AbortSignal；旧 optional 类型仅是已有单测兼容，不能用缺信号表示生产工具可以迟到执行。中止是每轮一次共享 promise，一秒内完成或如实拒绝；清理失败进入隔离，必须重建会话。SDK 输出的 repeated settled 被归并为一次明确 outcome。demo 的公开 Provider 兼容入口为 `src/provider/runtime/tools.ts::createDemoRuntimeAdapter(options, script?)`，Service 只负责组合。

**C1O 结论优先级：** 外层catch已经判定的timed_out/aborted/failed不会再被后续inner abort清理的settled改写；正常未强制结论仍采纳inner实际结果。清理错误与隔离照实保留，最终每轮仍一个settled。公共签名不变，验证见 [C1O](docs/fix/2026-10-14_fix_outer-terminal-outcome.md)。

**C1P 失败语义兼容：** 公共工具入口中止时返回 `ok:false` 和各工具原有含义：确认/选项“未获客户同意”、报告/审读“未能交回”、派发“未能派发”、执行前shell“未执行”。await 后已有 handler 的真实失败保留；迟到的成功仍改为失败。停止检查、signal与gate规则不变；实际运行后被中止的shell保留自身失败信息，不能混同执行前拒绝。当前证据见 [C1P](docs/fix/2026-10-14_fix_tool-abort-failure-messages.md)。

状态：C1 Model/工具/schema/store/Service 已实现，自有无网络测试通过；Pi/Codex/Claude 的 SDK 迁移与用户入口接线由各原属主独立完成，不能把这些核心结果当成最终整合验收。详见 [原始验证记录](docs/change/2026-10-14_change_runtime-core.md)。Adapter 个性化配置若需要新增字段，先交核心协调并补充本文件，不能各自增殖公共类型。

**输入显示身份（2026-10-15）：** PromptInputEventDetail 的 source 固定为 prompt-input，text 为原文，imageCount 可选。Core 在实际开始通知/user持久化/取消检查后、native prompt前发一次 kind:message，顶层与 detail.turnId 都为 actualturn；非空图片只记数量，图片原对象继续透传。Pi 注入路径不再另发 echo，demo 有 Core turn 时同理；direct helper 兼容由原属主维护。Window/UI 按 actualturn 关联 replay user 与 typed echo，不按正文前缀猜输入，不补猜旧数据身份。CustomerInputMetadata.toolCallId 可选，只透传确认/选择 handler 原始 callId，缺席仍缺席，旧单参回调兼容，不新增许可。见[本次修复](docs/fix/2026-10-15_fix_run-shell-description.md)。

## 已实施 A4 / C2.tp1 接口（2026-10-15，整合待验）

`src/model/runtime.ts` 是中立类型唯一来源；实际字段请引用它，不复制本节摘要当另一份schema。

- A：`RuntimeProviderOptions.toolDisplayMode='required-v1'`由Core固定，注入`projectToolEvent`、`registerToolDisplayProfile`与`toolDisplayCredentialEnvNames`。Core factory前检查注入，bind后检查profile已登记，未登记关闭inner并拒绝首prompt。适配器仍须在自身SDK加载/效果前按此模式早拒；旧standalone缺mode保兼容，不能把Core生产降为legacy。
- projector消费实际`RuntimeToolEventSource`，返回有界ToolDisplayV1或无业务结论message诊断，身份不经文本redactor。`ToolDefinition.displayInputRule`和实际handler共享原路径/命令选择；`ToolResult.execution?`来自shell真实结构，仅观测旧收集器丢弃事实，不改变原message/argv/审核/收集阈值。新projection异常不等于工具拒绝。
- `projectRuntimeLegacyHistory(input:RuntimeLegacyHistoryProjectionInputV1)`是Service纯同步桥，无FS/Provider/SDK。Window现reader产物由Pipeline包装调用后再发protected结果；Pipeline包装与Window parser/锚点接线由原属主实现，Core不直接读Window旧native文件。
- 历史公共读取`readRuntimeSessionHistory({projectRoot,roleId,runtime,credentialEnvNames?})`对旧工具事件/消息文本采用当前已知值和格式保护，兼容返回reports/reportErrors；不构造SDK或为了显示补读业务文件。旧轮换secret不可恢复、未知秘密不称全面DLP。
- C：Core返回`RoleSession.persistence`，mode由实际ANS storage决定（enabled/disabled），scope与方法均闭包绑定；不接受caller布尔、路径或source scope覆盖。无该能力的旧外部adapter由Pipeline按unknown-live降级，不由Core创建目录代替。
- `recordFinalReport(draft)`只接本session已结束actualturn的最终业务投影；`retryReportPersistence(reportId)`、`getReportPersistence(reportId)`只保存/查询原冻结材料。saved/already-saved不等已投递或验收；`accepted-memory`工具回执明确候选待收口。源enabled失败不变原outcome。
- 可信目标`PromptOptions.inputProvenance`或live-only`inputPresentation`由Core验证，进入inner.prompt前剥离新metadata/回调；原模型text与images引用保持。C目标历史/IPC只用安全文本副本（16KiB正文/1KiB摘要、inputTextProjection.modelInputRecorded:false），普通无C聊天不改变。
- PM实施裁定的必要兼容补：`RuntimeLiveHandbackPresentationV1`额外可选`deliveryId/attemptId/target`；三齐且目标匹配才提供receipt/progress/查重，全缺保原live且不造身份，部分为INVALID。它不产生durable reportId，不把live reports写盘，disabled仍无目录。
- `getDeliveryReceipt(attemptId)`、`retryDeliveryHistoryPersistence(attemptId)`与`onPersistenceChange`是bound capability操作。ACK早于user保存；新C边界/最终receipt独立记录。可能执行事实优先于再次读盘/输入失效，不能因后来磁盘坏了变为“未执行”。最终receipt跨handle可读；无final只保守pending，无outcome，不从邻近settled猜。
- 仅保存恢复按完整base指纹+本次完整已知记录前缀检查，原子补缺尾段/index；损坏、外来后续拒补，不截坏行、不重prompt。16MiB恢复预算、128详细receipt与最小seen身份保护、dispose expired均有实际回归。source保存成功后的首次入队由Window唯一状态归并推进；target补历史绝不启动Provider。

属主实现及故障日志见[实施记录](docs/change/2026-10-15_change_complete-flow-core.md)。此接口发布不替代三适配器、Pipeline、Window/UI和独立桌面验收，也没有部署声明。

**2026-10-15 非工具边界修复：** accepted/denied不自动等于工具事件。Core live/history同用结构判断，仅显式tool_call或非空toolName/嵌套call.name走工具projector；普通引擎/运输事实保原kind和实际scope/turn、安全summary与已知outcome，不造工具name/phase/call，不保未知raw detail。API无新字段。[独验红转绿与新候选](docs/fix/2026-10-15_fix_non-tool-event-routing.md)，原final-manifest保历史，新Service依赖需重测。
