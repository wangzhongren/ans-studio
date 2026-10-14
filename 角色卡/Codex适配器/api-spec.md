# Codex适配器实现报告

适配器已实现。X1 原 14 项证据保留在[实施记录](docs/change/2026-10-14_change_codex-governed-session.md)；X1S 可选空白地址修复后自有 **16/16** 与全仓严格类型检查通过，见[修复记录](docs/fix/2026-10-14_fix_blank-base-url-default.md)。稳定 CLI `0.162.1` 的无模型配置/schema 探针已由[装配](../装配/api-spec.md)通过，用户入口最终整合由后继角色接续。正式契约仅引用 `src/model/runtime.ts` 和[运行时核心接口](../运行时核心/api-spec.md)。

公共入口为 `src/provider/codex/session.ts::createCodexRuntimeAdapter(options): RuntimeAdapter`，输入 `CodexRuntimeAdapterOptions extends RuntimeProviderOptions`。工具、存储、交互等待和当前轮 ID 全由调用方注入，不导入其他 Provider 或角色私有 common。扩展注入 `engineFactory/mcpLoader/env/cliPath` 仅用于基础设施替身/受控嵌入；工厂与入口加载不启动外部资源，`bindRole` 才加载实际 MCP 和 Codex CLI。公开类型还有 `CodexEngineFactory/CodexEngineInput/CodexRpcConnection/CodexMcpModules`，只通过本 Provider 入口引用，不直接引 common。

运输决定：实际检查 `@openai/codex-sdk@0.162.1` 后发现它不能读取有效配置或处理服务端审核请求；本地假配置实证根 MCP map 会合并外部服务。因此采用必要 app-server JSON-RPC：先枚举并禁用全部 native MCP、重启验证，再注册注入工具对应的 `dynamicTools` ANS 代理。实验 `item/tool/call` 具有 threadId/turnId/callId，校验身份后通过真正 MCP Client/Server/InMemoryTransport 调用原 handler。旧轮/未知工具在进 MCP 前拒绝，队列保持原 Signal，不补用新轮 Signal。初始化 `experimentalApi=true/explicitGatewayOauth=true`；新建/恢复/每轮 read-only+never，返回沙箱与空 native MCP catalog 必须验证。没有 HTTP MCP 分支或流式事件审核。[完整设计及独立影响评估](docs/design/2026-10-14_design_codex-governed-transport.md)。

精确依赖由装配安装：`@openai/codex@0.162.1`、`@modelcontextprotocol/sdk@1.32.1`；本角色没有改依赖与 lockfile。早期 alpha 调查与后来的稳定无模型探针分别留在原生产者记录；配置/schema 通过不能等同于在线模型或 OS 全面沙箱验证。

支持设置：模型与 key 必需，`modelId` 优先于 `ANS_CODEX_MODEL`；`baseUrl` 优先于 `ANS_CODEX_BASE_URL`。地址选中值 trim 后为空或未提供时默认 `https://api.openai.com/v1`；显式空白直接选择官方默认，不继续 fallback 到环境地址，显式非空继续优先。`apiKeyEnvVar` 显式指定来源时缺值不 fallback，否则 `CODEX_API_KEY` 优先、`OPENAI_API_KEY` 作为本适配器明确映射的 fallback。key 缺少直接失败，不读全局登录状态；base URL 接受无 username/password 的 HTTP(S) API endpoint，不接收 CLI 运输地址。只向原生子进程传 PATH、独立 CODEX_HOME、实际 CODEX_API_KEY；通过唯一自定义 provider 的 env_key 使用 key，不调用 login 或持久化 auth。bindRole 同步捕获 model/base/key 与秘密值，后续运输及错误脱敏使用同一份结果。消息、错误、工具参数/结果按共享秘密键与实际自定义 key 脱敏。

`RoleSession` 实现 prompt/events/abort/dispose 和 runtime/roleId/contextSource/nativeSessionId/contextWarning。普通停止保持会话，清理失败隔离；每轮唯一 settled/detail.outcome；detail 保留 toolName/name/toolCallId。persist 模式只用注入 storage nativeDirectory，并调用 validate/prepare；没有 storage 使用临时根，dispose 删除；回放全交核心。图片 MIME 支持 png/jpeg/gif/webp，转为临时 localImage，dispose 删除。

默认 CLI launcher 会再启动原生程序，POSIX 以本次专属进程组整体清理；TERM 不结束时 KILL 全组，确认 group/exit 或如实报清理失败。Windows 使用 owned PID 的 taskkill/T/F 先清树，该 OS 分支在当前 macOS 未动态验证。自有测试证明 wrapper/native 同时忽略 TERM 后也没有迟到写入或存活 native PID。

本地 MCP request timeout 为 `2147483647ms`，prompt 计时在 interactionGate 等待暂停。服务器 dynamicTool deadline 未由官方/types 建立，不宣称无限等待；上游提前 serverRequest/resolved 立即取消原轮。错误/一般模型失败如实外推，不把一般失败改写成原生恢复失败。

自有命令：`node --test 'test/codex-adapter/**/*.test.ts'` 与 `npm run typecheck`，X1S 当前均通过。`node test/codex-adapter/native-probe.mjs` 稳定结果由装配记录；本次仅设置解析变化，没有重跑运输探针。早期临时 harness 的原始命令见实施记录，生产没有临时包路径 fallback。

