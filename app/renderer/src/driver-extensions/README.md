# driver-extensions —— 4B 驱动扩展点（Phase 4A 只建机制）

本目录供 Phase 4B 追加 `window.__ansRenderer` 方法（`replayAnchorDebug`、
治理记录动作等），4A 不在此放任何业务实现。

## 机制

`app/renderer/src/test-driver.ts` 用 Vite 的
`import.meta.glob("../driver-extensions/*.ts", { eager: true })` 注册本目录模块，
把导出对象（`default` 或 `extend`）合并进驱动：

```ts
export const extend = {
  replayAnchorDebug: (roleId: string) => { /* 4B */ },
};
```

- 4B 新增文件即可接入，**不编辑 4A 文件**；
- 不得覆盖 4A 既有方法名（合并按后写覆盖，命名请先查契约面）；
- 不弱化/删除既有断言，不提供假实现。
