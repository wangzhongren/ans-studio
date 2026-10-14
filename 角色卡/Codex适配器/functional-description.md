# Codex适配器模块说明

负责把 Codex SDK 与需要的 Codex 传输接口封装成 ANS 运行时：原生会话、工具接入、权限约束、事件转换、停止与恢复。只执行调用方注入的 ANS 能力，不改变角色授权或任务调度。

源码边界见 boundary.yaml，功能入口见 [feature-map.md](feature-map.md)。当前公开入口 `src/provider/codex/session.ts::createCodexRuntimeAdapter` 使用必要 app-server 运输与真实内存 MCP；只接收核心注入工具、存储和交互等待能力。空白可选 API 地址修复后自有 16 项与全仓类型检查通过，稳定 CLI 探针已由装配通过，桌面和最终联调由后继角色接续，见 [API](api-spec.md)。

