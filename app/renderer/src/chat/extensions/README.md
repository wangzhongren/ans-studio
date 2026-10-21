# chat/extensions —— 4B IPC 扩展点（Phase 4A 只建机制）

本目录供 Phase 4B 追加**渲染侧 IPC 扩展**（治理三权卡/镜像/报告回执等），
4A 不在此放任何业务实现。

## 机制

`app/renderer/src/chat/ipc.ts` 在安装主接线后用 Vite 的
`import.meta.glob("./extensions/*.ts", { eager: true })` 注册本目录下的模块：

```ts
export interface ChatExtensionModule {
  install?: (bridge: DesktopBridge) => (() => void) | void;
}
```

- 每个模块导出 `install(bridge)`，可订阅 preload 白名单通道并返回清理函数；
- 4B 新增文件即可接入，**不编辑 4A 文件**；
- 扩展异常被隔离，不影响主界面接线。

## 4A 约束

- 不复制边界判定；通道按 preload 契约名消费；
- 不新增持久化/第二套状态库；
- 不修改 `chat-store`/`ChatStream` 的聊天热路径（4B 自己的文件除外，回 PM 批准）。
