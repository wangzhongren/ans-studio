# 装配模块笔记

入口负责启动配置、命令分发与退出结果。当前接线和使用流程见 [功能导航](feature-map.md) 与 [CLI 运行时接线](docs/feature/cli-runtime-assembly.md)，公开报告和当前证据见 [api-spec](api-spec.md)。

- `src/index.ts` 将 project/scope/runtime/runtimeOptions 交给 Interface；演示配置仅在缺 `.ans` 时使用，明确标演示 acceptance，任务范围仍收窄。
- `src/common/装配/runtime.ts` 只解析选择，枚举引用 pm 共享实现；`demo-runtime.ts` 是装配自有的无模型权限演示替身，类型引用 Model。
- `bin/ans.js` 直接运行 TypeScript 入口并以真实码收敛；`package.json/package-lock.json` 固定 SDK 依赖，`tsconfig.json` 保持 strict。
- `test/装配/` 验证启动/接线；跨组完整验收属于测试角色，真实引擎效果属于对应适配器，装配不复制门禁或工具实现。

当前 own candidate、正常安装版本及历史失败链接在 [B0/B1 原报告](docs/change/2026-10-14_change_multi-runtime-assembly.md)。实际 `.env` 本次未读未写，示例仅占位符。
