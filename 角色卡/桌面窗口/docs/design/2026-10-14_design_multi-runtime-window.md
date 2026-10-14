# 桌面选择运行时、设置与会话隔离

契约：ANS-RUNTIME-V2 revision 1，D1 必要实现；状态：独立评估完成，沿用客户既有开发授权。本文细化已批准[总设计](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)，没有新增选装。

用户选择 Pi、Codex 或 Claude 后，打开角色、发送消息、查看历史及接收派发都属于所选引擎。后台旧轮次继续使用它开始时的引擎；配置保存后，下一次新输入在旧轮次结束后重建该引擎会话。

## 独立影响评估

现有 `session.ts` 的 Map 仅按 roleId，后台投递使用全局 lastRuntime，故同名角色跨项目或切换引擎会误续接。修复采用项目、角色、runtime 的组合键，profile revision 存于每个活句柄，队列在入队时固定 runtime。边界刷新、FIFO、回交批次与 LRU 延用现有机制，增加句柄身份校验，旧流不能清除新流 busy。

生产创建只走 Pipeline `createRuntimeAdapterFactory`；旧注入 Pi/demo 工厂仅保留测试兼容。历史走 Pipeline `readRoleSessionHistory` 的 ANS 回放；只有 Pi 可读取旧 JSONL 作为展示 fallback。回放和索引均不证明原生恢复成功。核心 native resumed 映射桌面 recovered；核心 recovered 映射桌面 fresh 加警告。开会话与轮次后的状态均读 handle 动态 getters。

设置 metadata 单一消费共享 RUNTIME_SETTINGS。读视图给 field 的 key/label/required/secret/help/value/isSet/source/fallbackKey；secret value 恒为空。保存只接受所选 runtime 白名单里的字符串；地址仅接受无 userinfo 的 http/https URL，错误不回显输入。共享 env-file 原子写成功才增加 profile revision。Pi 的 ambient token 不在 busy 轮次中重载：保存只落文件，重建前安全应用所选 runtime 的键；仍有旧 Pi 轮次时等待其结束，保留排队回执。Codex/Claude 已由各属主冻结创建时配置快照。

客户确认 callback 原样保留 O1 的 CustomerInputMetadata.signal，监听中止并删除 pending，推失效通知；dispose 也取消该句柄确认。signal 不进入 IPC。迟到旧 yes 返回 expired，不发行许可。

写集仅 `app/main.ts`、`app/preload.cjs`、`app/desktop/`，边界内窗口测试及窗口资料。renderer 由 U1 实现，SDK/Model/Pipeline/shared 不修改。独立测试仅假引擎、临时目录和假 env，无真实模型、真实 .env、凭据或 Git 修改。

## 冻结渲染消费契约

- `desktop.getRuntimeConfig(runtime)` → `{runtime,label,path,fields,missingKeys,revision,application}`，application 为 `current|next-session|after-active-turn`。字段 source 为 `file|environment|fallback|default|unset`；fallbackKey 仅键名。
- `desktop.saveRuntimeConfig({runtime,updates})` → `{ok,appliedKeys,error?,runtime,revision,application}`。旧 getPiConfig/savePiConfig 保留。
- `openSession({projectRoot,roleId,runtime})` → 既有 OpenResult + runtime/projectRoot/profileRevision；contextSource 保持 resumed/recovered/fresh，contextWarning 如实。
- sendSession 兼容 `(text,images)`，新增第三参 `{projectRoot,roleId,runtime}`。stopSession/abortSession/withdrawQueued 兼容 roleId，支持带 runtime/projectRoot 的对象目标。
- `getSessionHistory({projectRoot,roleId,runtime})` → `{projectRoot,roleId,runtime,rows,error,skipped}`；`onSessionHistory` 推相同形状。按三元身份缓存，回放不称模型已恢复。
- `onSessionEvent` 信封 `{projectRoot,roleId,runtime,event}`；`onRoleState` 增 projectRoot/runtime/profileRevision/contextSource/contextWarning，queue/running 的条目增 runtime。`listLiveSessions` 旧 roleId[] 保留，新增 `listLiveSessionViews()` 返回三元身份。
- `onOperatorRequest` 增 projectRoot/runtime；新增 `onOperatorExpired` → `{id,roleId,projectRoot?,runtime?,reason}`，表示旧卡已失效。
- listProject roles 原样转发可选 readonly group/groupDuty，不解析角色 Markdown、不影响权限。

## 验证与交付

新增窗口多运行时测试覆盖真实 Pipeline/Service 与假 Provider 的选择及 replay；同角色切引擎与跨项目、旧后台派发/回交、profile 保存成功/失败/忙轮次、凭据环境/fallback掩码、非法 URL、确认取消和迟到 yes；重跑窗口既有单元与 strict TypeScript。真实窗口及 renderer 由 T1/U1 独立验证，窗口单元不替代其证据。
