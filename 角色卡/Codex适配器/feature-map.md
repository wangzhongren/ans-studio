# Codex适配器功能导航

- [使用 Codex 执行受治理角色会话](docs/feature/codex-governed-session.md)：使用 Codex ANS 代理和真实 MCP，保留工具门禁、原轮中止与隔离恢复。当前自有22/22、固定CLI本地假服务回环通过；required/profile与真实工具投影已接入。全仓类型检查通过，在线与桌面最终联调由后继角色接续。

本角色属于运行时接入组，本次开发沿用客户既有授权；[接口和原证据](api-spec.md)说明实际依赖、配置与验证范围。


- [外来 MCP 白名单化（G-4 V2/P2）](docs/change/2026-10-16_change_g4-v2-mcp-whitelist.md)：`installedMcpServers` 纯消费——白名单定义＋禁用集单条 `-c mcp_servers={…}`（approve＋per-call 超时）、三处恰等（进程/线程/目录名字集）、`mcpToolCall` 行映射与坏 server 降级行；真 CLI 0.162.1 编码器校验绿。真实网关 namespace 桥接受性与真机 E2E 属验收轮。

- [推理强度与推理事件（G-5 wave 2）](docs/change/2026-10-16_change_g5-reasoning-effort.md)：请求面四档 `-c model_reasoning_effort`（off/未设零注入＋如实行）；推理完成态 item 恰一行事实（增量零行、不隔离、durationMs 真实信号）；网关拒绝 ⇒ 保守识别＋恰一次去参数重发（重建进程）。探针记录见 [probe_reasoning-surface](docs/change/2026-10-16-probe_reasoning-surface.md)。真实网关接受面属验收轮。
