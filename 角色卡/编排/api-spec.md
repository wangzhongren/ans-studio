# 编排公开接口（ANS-RUNTIME-V2 revision 1 / O1）

状态：接线已实现；本角色 238/238 回归、严格 scoped tsc exit 0。默认适配器、根入口与桌面整体验证仍待各属主。唯一 runtime 类型入口 `src/model/runtime.ts`；枚举只读引用 `src/common/shared/runtime-shared.ts`，编排 args 旧出口仅兼容转出。

Pipeline 公开入口 `src/pipeline/orchestration/run-role.ts`：

- `createRuntimeAdapterFactory(project, runtime, options?) => RuntimeAdapterFactory`。`RuntimeAdapterFactory=(gate, capabilities?)=>RuntimeAdapter`；`RuntimeAdapterFactoryOptions=Omit<RuntimeSessionOptions, "runtime"|"gate"|"projectRoot"|"skillRoot">`。支持 Service 现有 modelId/baseUrl/providerId/apiKeyEnvVar/promptTimeoutMs/constructTimeoutMs/providerFactories/persistSession/script 等选项。实际引擎 writeRoot/readRoot/shellCwd 固定项目根；demo 缺省只判定不落盘。SDK 加载/工具构造/存储均属 Service/Provider。
- `createPiAdapterFactory(project,shellGate?)` 是兼容 alias，固定 Pi，经 Service。
- `selectAdapterFactory(runtime,project,deps?)` 支持既有 createAdapter（demo）、piFactory、shellGate，以及 runtimeFactory/runtimeOptions。runtimeFactory 为 `(project,runtime,options?)=>RuntimeAdapterFactory`；四引擎均可用无网络 providerFactories 对接真实 Service。未知值抛错，绝不降级。
- `RoleSessionDeps={createAdapter?,runtimeOptions?}`。runRole/openRoleSession 输入可带 `runtime`；无 createAdapter 时由 Pipeline 建立默认选定 Service 工厂。runRole 缺省 demo；openRoleSession 缺省 Pi。显式自定义工厂保留原注入语义。
- `RoleSessionHandle` 可选只读 `runtime/roleId/contextSource/nativeSessionId/contextWarning` 为实际 session 动态 getter，send 后再次读取可得实际恢复结果。核心 resumed=原生恢复成功；recovered=恢复失败重建并有 warning。Desktop 原词汇需显式转换。
- `readRoleSessionHistory({projectRoot,roleId,runtime}) => Promise<{record?,entries}>` 经 Service 公共操作读取 ANS 回放，不证明模型上下文恢复。
- `AdapterCapabilities` 保留 customerInput/reportHandback/sessionDir/dispatchTask/shellGate/shellVerdict，新增可选 runtime/persistSession。已知 runtime 时 sessionDir 为 `.ans/sessions/<role>/<runtime>/`；旧未显式 runtime 的注入替身继续旧路径。实际 store 恒按所选 runtime 隔离。多轮缺省持久化，persistSession=false 不注入 store；一次性角色路径缺省不持久。

治理 Pipeline 的 GovernSessionInput 支持 runtime/persistSession，默认 Pi。GovernanceSessionHandle 继承 RoleSessionHandle 并保留 governanceRoleId/boundarySource/acceptance/scope/targetDir；context 为动态属性。shell 审读传源 runtime 与同一工厂，固定 persistSession=false。

CLI 内部接口：`runRoleCommand(argv, deps)` 与 `governCommand(argv, deps?)` 都支持 `--runtime demo|pi|codex|claude`；argv 优先于 deps.runtime。装配只需传 project/scope/runtime/runtimeOptions（以及已有 demo createAdapter），无需在根入口创建 Provider/Pipeline。govern 缺省 Pi，明确注入 createAdapter 且未带选择扩展时继续测试/自定义工厂语义。确认 callback 接受 Model `CustomerInputMetadata`，编排原样传到前端；issuer 必须核对原 signal 已中止则不发行。

Service 历史操作已由核心 C1H 补齐，O1 实际存储/公开回放消费测试通过。默认 Pi、新 SDK 依赖及 Claude 原生兼容测试完成前，不声称整个用户入口已验收。


## 2026-10-14 普通聊天回交修复（chat-handback-scope revision 2）

`RoleSessionSendOptions extends PromptOptions` 从 run-role.ts 公开，附 `handback?: {required:boolean;taskId?:string}`。`RoleSessionHandle.send(text, opts?:RoleSessionSendOptions)` 消费来源：true为正式任务、false为普通聊天并清掉旧会话 taskId；未标记且 input.taskId 非空仍默认任务，其余默认聊天。专用字段剥离后才传 Runtime；真实 runtime 组合 Core onTurnStarted，把来源绑定到其真实 turnId 并恰一次转调已有 callback，images 数组引用保留。旧未标记、无 ACK 替身保持 options 同引用/单参兼容路径。

普通聊天无合法报告不生成 handback，失败/中止事件照常透传；合法主动报告仍生成并受真实终态覆盖。每轮不论是否生成都清理报告/来源/证据并防重复迟到。未知真实 turnId 不借 legacy 来源。withHandback 内部 opts.intent 查询本轮 HandbackIntent；不提供查询的旧直接辅助调用保留任务默认。

桌面窗口必须按实际投递条目 dispatch=true、message/handback=false，包括队列重试，不能用正文猜测或会话固定值。Model/Core/Provider 无变更，原单次 runRole 不新增回交。编排247/247通过；全仓typecheck最终通过，真桌面由测试角色复验。记录见 [修复方案及证据](docs/fix/2026-10-14_fix_chat-handback-scope.md)。
