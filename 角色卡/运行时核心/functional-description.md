# 运行时核心模块说明

负责 ANS 与执行引擎之间的公共会话契约、受治理工具、统一事件和引擎接入入口。提供组内技术契约与兼容要求；项目级授权、调度和验收由项目管理负责。

源码边界见 boundary.yaml，功能入口见 [feature-map.md](feature-map.md)。中立公共类型位于 Model；Service 选择公开工厂并注入公共 Provider 的工具/schema/storage。核心无 SDK 静态依赖，写/编辑门禁前无副作用，shell 审核后才执行，所有生产 adapter 必须携带本轮停止信号。原生恢复由 adapter 确认，ANS 回放仅是可读历史。公开 API 见 [api-spec](api-spec.md)，C1 验证见 [变更记录](docs/change/2026-10-14_change_runtime-core.md)。

