# Pi 适配器代码导航

当前功能见 [Pi 运行时](docs/feature/pi-runtime.md)，公共接口见 [api-spec](api-spec.md)。本角色为固定 Pi 属主，只消费 Model 中立契约与核心注入能力。

| 位置 | 当前职责 |
| --- | --- |
| `src/provider/pi/session.ts` | Model 类型旧路径显式转出；中立/旧 gate 工厂 overload；SDK 懒加载与旧工具构造兼容 |
| `src/provider/pi/tools.ts` | 核心 public 工具/schema 的窄显式 facade，不复制处理器 |
| `src/common/pi-adapter/real-adapter.ts` | 实际 SDK、schema/执行模式转换、原始 signal、工具白名单、资源封闭、事件、生命周期 |
| `src/common/pi-adapter/native-session.ts` | 精确 Pi native/legacy 读取、旧档复制迁移、有效上下文确认与恢复失败说明；目录链校验委托 storage callbacks |
| `src/common/pi-adapter/lifecycle.ts` | 注入轮次 ID、首次明确终态锁定与一次 settled |
| `src/common/pi-adapter/provider-config.ts` / `settings.ts` | Pi 显式模型/认证存在性与兼容能力收窄，内存设置 |
| `src/common/pi-adapter/tool-compat.ts` | 原 describeTool alias 指向 Core public schema；只供旧 helper 输入兼容 |
| `src/common/pi-adapter/timeout.ts` / `logger.ts` / `event-queue.ts` | 自有计时、诊断呈现与流辅助；InteractionGate 型引用 Model |
| `src/common/pi-adapter/fs-write.ts` / `format-denial.ts` | 历史 direct helper 与旧 hook fixture 兼容；不在生产公共工具执行链 |
| `test/pi-adapter/injected-runtime.test.ts` | 真实 SDK/faux 原 handler/schema/gate/取消、Service接线、native/legacy与回放验证 |

唯二 Core public 兼容 edge 为 provider/pi/tools 和 private tool-compat 的显式转出；它们只落实已批准迁移，不扩张其他 Provider 互调或他人 common 导入。SDK 版本/依赖归装配，native 路径守卫、公共工具、Service回放归运行时核心，五层连接及最终合并验收归各原属主。
