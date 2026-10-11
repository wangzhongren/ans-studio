// 装配侧 `.ans` 配置载入器——**薄转发**（T12）。
//
// 本文件的**全部实现**（`loadEffectiveConfig` / `enforcePinBackedAcceptance` / `ansProjectPath`
// / 常量 / 类型 / 私有解析函数）已由 T11 **整体搬迁**到共享组件
// `src/common/shared/config-loader.ts`（搬迁非 fork，保持单一实现；属主：项目管理）。
//
// 工程法案 §一.5 与 `docs/architecture/shared-components.md` 规定：消费方**只读导入**共享组件、
// **不得复制第二份实现**。原装配私有实现位于 `src/common/装配/config-loader.ts`；搬迁后此处只留
// **转发**以兼容既有导入点（`src/index.ts`、`test/装配/config-loader.test.ts`），
// **绝不保留本地同义实现**。
//
// 故本文件**不得**再有任何本地逻辑：改动行为一律改共享组件（由项目管理维护），此处随之一并生效。

export * from "../shared/config-loader.ts";
