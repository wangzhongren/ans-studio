# 桌面窗口 API 规格

实现契约 **ANS-RUNTIME-V2 revision 1 / D1 + D1R + D1R2**。主进程 `app/main.ts`、受限桥 `app/preload.cjs`、纯逻辑 `app/desktop/`。当前行为见[功能说明](docs/feature/multi-runtime-desktop.md)，证据见[实施记录](docs/change/2026-10-14_change_multi-runtime-window.md)。窗口不调用 SDK；生产创建与历史经编排公开入口，工具与存储归核心。Model 类型入口为 `src/model/runtime.ts`。

## 运行时与设置

`RuntimeKind=demo|pi|codex|claude`。设置字段/必填/秘密/help/fallbackKeys 单一来源为共享 `RUNTIME_SETTINGS`，窗口不维护第二份。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getRuntimeConfig(runtime) | runtime-config:get `{runtime}` | RuntimeConfigView |
| saveRuntimeConfig(input) | runtime-config:save `{runtime,updates}` | RuntimeConfigSaveResult |
| getPiConfig() | pi-config:get | 兼容 path/fields；实际新视图可含附加字段 |
| savePiConfig(updates) | pi-config:save `{updates}` | 兼容 ok/appliedKeys/error；遵守 busy Pi 安全应用点 |

`RuntimeConfigView={runtime,label,path,fields,missingKeys,revision,application}`。field 含共享 metadata 及 `{value,isSet,source,fallbackKey?}`，source 为 file/environment/fallback/default/unset。所有共享 secret 键 value 恒空串；fallbackKey 只键名；URL 中的 userinfo 不回显。空白必填值为 unset，缺 key fallback 仅按适配器真实约定。

`RuntimeConfigSaveResult={ok,runtime,appliedKeys,revision,application,error?}`。updates 仅采纳所选引擎白名单字符串；非字符串拒绝；URL 须为不含 userinfo 的 http/https。共享 `saveEnvFile` 逐行保留其他键并原子覆盖；错误不含提交值。成功且写键非空才 revision+1。application 为 current/next-session/after-active-turn；保存本身不证明引擎/账号可连接。

Pi 保存不重载忙轮次凭据；下一输入或重开在所有旧 Pi 轮次空闲后应用所选字段并重建。各项目等待此安全点的 Pi 队列会被最后一个旧轮次结束唤醒。旧单独 `pi-config.ts` 函数仍兼容既有调用；生产 IPC 使用上述新逻辑。

## 会话、历史与状态

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| openSession(input) | session:open `{projectRoot,roleId,runtime}` | OpenResult |
| sendSession(text,images?,target?,metadata?) | session:send `{text,images,target?,metadata?}`，target 为三元身份 | SendResult |
| stopSession(target?) | session:stop，旧 roleId/null 或 `{projectRoot,roleId,runtime}` | StopResult |
| abortSession(target) | session:abort，旧 roleId 或三元对象 | RoleSessionAbortResult |
| withdrawQueued(target,id) | session:withdraw，旧 roleId 或三元对象加 id | WithdrawResult |
| listLiveSessions() | session:live | 兼容唯一 roleId[] |
| listLiveSessionViews() | session:live-views | `{projectRoot,roleId,runtime,profileRevision}[]` |
| getSessionHistory(input) | session:history-get 三元身份 | SessionHistoryView |

`OpenResult` 延续 ok/error/note/config/resumed/contextSource/contextWarning，并增 runtime/projectRoot/profileRevision。缓存与重建链使用项目×角色×runtime；每活句柄保存其创建 profile revision。旧字符串目标优先活动同名句柄；不存在且多实例时拒绝模糊目标，三元对象精确寻址。新 UI 应总传三元对象。

桌面 `resumed` 表示活句柄复用；核心 native resumed → 桌面 recovered（真实已恢复）；核心 native recovered → 桌面 fresh + warning（恢复失败后重建）。未确认时不从索引或文件推断恢复成功。状态在轮次后重新读取 handle 动态 getters。

`SessionHistoryView={projectRoot,roleId,runtime,rows,error,skipped}`。rows 的旧 ReplayRow 四种 kind 保留，新增可选顶层 turnId/eventKind：user 只取 entry.turnId且无eventKind；event取 entry.turnId ?? event.turnId 与原 event.kind。工具 activity.turnId 使用相同有效ID，交互 anchorKey/requestId/anchor 保留。mapper 逐事件保留原次序和delta片段，不压缩不同turn的同文；旧Pi缺字段时不推造 metadata。ANS 回放由 Pipeline `readRoleSessionHistory` 提供。只有 Pi 无 ANS 行时读取旧角色目录 JSONL 作展示 fallback；不用于模型恢复证明。

| 订阅 | 主→渲通道与 payload |
| --- | --- |
| onSessionEvent(cb) | session:event 单信封 / session:events 同序信封数组；`{projectRoot,roleId,runtime,event,clientMessageId?}` |
| onRoleState(cb) | session:role-state；`{projectRoot,roleId,runtime,profileRevision,contextSource?,contextWarning?,busy,summaries,queue,running}` |
| onSessionHistory(cb) | session:history，SessionHistoryView |
| onProjectChanged(cb) | project:changed，既有可能变更信号 |

queue/running 延续 kind/sourceRoleId/summary/at/id/full 并增加 runtime。状态去抖按 projectRoot/roleId/runtime 合并。停止/释放不删除未投的待办；投递失败恢复队首并保留新到消息。派发和回交固定 source 引擎，不依当前选择。

## 确认与取消

`onOperatorRequest` / session:operator-request：`{id,roleId,projectRoot?,runtime?,request,anchorKey}`。`operatorRespond({id,decision})` / session:operator-response 延续 confirm/choice 请求快照校验；非法决定可重试，旧 id 返回 expired。

`onShellConfirm` / shell:confirm-request 保留 `{id,command,summary,reasonPlain,reasonRaw,argvLines,cwd}`，新增可选 roleId/projectRoot/runtime；生产 Window 绑定 exact handle 时提供。shellConfirmRespond 仍仅恰 allow:true 才接受。

新增 `onOperatorExpired(cb)` / session:operator-expired：`{id,roleId,projectRoot?,runtime?,reason}`，同时覆盖 customer confirm/choice 与 shell，id 分别为 op-* / sc-*。UI 按身份定格旧卡。

Customer callback 第二参保留 O1 的原 CustomerInputMetadata.signal；session lifetime 信号为本地补充。Shell 公共 OperatorChannelFn 没有原 signal，Window 只向自己的 presenter 传本地精确句柄轮次 metadata；abort、dispose、settled、send 拒绝、presenter 时限都清理旧 pending。内部 signal 不进入 IPC。旧句柄流不能使新卡失效。发行和 shell 执行前原 signal 检查仍由编排/核心实施。

## 其他能力与装配

项目 pickProject/listProject；listProject roles 原样转可选 readonly group/groupDuty，窗口不解析组别。外开、选图/附件、诊断/显式恢复、窗口控制保留已有白名单方法。`app:recovery-state` 增 runtime。所有订阅均返回取消订阅函数；preload 不暴露 Node 能力。未改动通道的完整历史表见[冻结归档](../桌面应用/api-spec.md)。

测试注入面新增 `createRuntimeAdapterFactoryFn`、`runtimeOptions`；默认全部引擎走 Pipeline 工厂。旧显式 createPiAdapterFactoryFn/createDemoAdapterFn 保留原测试接缝及真实 boundary，未选择它们时不绕行到 demo。envFilePath/piConfigEnv 可注入；开发测试只用临时假 env。

已知原有直接 public 门禁枚举/规则导入与 legacy demo/request-anchor 的 Provider 常量/工具导入延续本次前已批准结构；新引擎工厂和历史均通过 Pipeline，不增加 Provider/SDK 跨层调用。真实窗口交互由 U1/T1 提供独立证据。

## D1R 当前证据

历史轮次字段的必要修复见[独立修复记录](docs/fix/2026-10-14_fix_history-turn-metadata.md)：受影响 Window 37/37（其中 multi-runtime 17/17，新增两项）、strict tsc 与scope diff exit0。原D1 171项保持历史，未冒充修复后全组复跑。UI历史/live合并与真实Electron重复保护由U1/T1另交证据。

## D1R2 原客户投递显示关联

第四参metadata可含 `{clientMessageId?:string}`，仅采纳非空字符串作为原输入气泡的opaque显示标识。直接/排队客户输入固定此值，匿名派发/回交也各自建立原prompt来源。没有字段时保持旧调用兼容。

生产Window通过原prompt invocation callback闭包消费Model `PromptOptions.onTurnStarted(PromptTurnStartedMetadata)`：只有Core实际创建turn后的同步只读ack能注册actualturn→原record。metadata包含真实readonly turnId/roleId/runtime；clientMessageId不进入Model、Core、store或工具授权。Window精确身份验证callback，并保留原images数组/图片内容；无runtime标识、无客户端关联的旧替身沿用原单参/整包路径。

`SessionEventEnvelope.clientMessageId`只在原event.turnId命中已ack原record时增加；缺ack的旧提供方、无turn/未知/已清理ID都不绑定。匿名记录没有客户端ID；不使用首次事件、FIFO、最新选择或文本猜测。事件原对象不变。settled清busy/drain之前捕获来源与ID；已ack失败/aborted record保留原ID供延后terminal，前置拒绝未ack record不借下一turn。迟到旧terminal/旧send拒绝不清新轮busy或中止新确认。终结记录有界保留128条，dispose清精确句柄映射。

[当前原实现/101项受影响gate与SHA-256](docs/fix/2026-10-14_fix_client-message-origin.md)。D1/D1R1此前证据仍为历史；真实user气泡/history合并由U1/T1另验。

## 本轮回交来源（chat-handback-scope revision 2）

实现[编排规范](../编排/docs/fix/2026-10-14_fix_chat-handback-scope.md)：Window 每次实际 send 都传 Pipeline 的 RoleSessionSendOptions.handback。只有队列 kind=dispatch 为 required:true；即时客户消息、排队 message、回交消费（含合批）为 required:false，覆盖旧会话 taskId。重试由保留条目的 kind 决定，不解析正文。图片数组原引用与原 onTurnStarted 回调保留，clientMessageId 仍只经真实 ACK 关联。新字段不进入 IPC，不改变历史解析；聊天主动 submit_report 仍由编排产出并按既有路径投递。验证见[修复记录](docs/fix/2026-10-14_fix_chat-handback-origin.md)。
