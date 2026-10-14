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
