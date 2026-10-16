# Claude适配器模块说明

负责把 Claude Agent SDK 封装成 ANS 运行时：原生会话、SDK MCP 工具接入、内置工具禁用（可选联网搜索能力位 `ANS_CLAUDE_WEB_SEARCH` 默认关时同样全禁）、事件转换、停止与恢复。只执行调用方注入的 ANS 能力，不改变角色授权或任务调度。

源码边界见 boundary.yaml，功能入口见 [feature-map.md](feature-map.md)。实际入口为 `src/provider/claude/session.ts::createClaudeRuntimeAdapter`，只转换注入的 Model 能力，不调用其他 Provider。生命周期与 schema 纯辅助放本角色 common。正式20项测试、真实CLI回环及整仓类型检查通过，最终项目集成由各属主验收；接口和限制见 [API](api-spec.md)。

