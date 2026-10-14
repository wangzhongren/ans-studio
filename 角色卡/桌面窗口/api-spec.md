# 桌面窗口 API 规格（IPC 通道与导出）

> 实现报告。源码在 `app/main.ts`、`app/preload.cjs`、`app/desktop/`，归「桌面窗口」角色。**拆分初始版**：完整通道表与导出清单在冻结归档 `角色卡/桌面应用/api-spec.md`（只读，拆分前冻结形态）；本角色将在下一次主进程侧交付时按现状重建本页。

## 对外接口（渲染侧消费面，契约以本角色为准）

preload（`app/preload.cjs`）经 `contextBridge` 暴露的 `window.desktop` 白名单——分组速览（逐通道参数/返回以归档 api-spec 的表为准，如有出入以源码现状为先并回填本页）：

| 组 | 通道 |
| --- | --- |
| 项目 | `app:pick-project`、`app:list-project`、`project:changed` |
| 会话 | `session:open`、`session:send`、`session:stop`、`session:abort`、`session:withdraw`、`session:live`、`session:history`、`session:role-state`、`session:event`、`session:events` |
| 交互/确认 | `session:operator-request`、`session:operator-response`、`shell:confirm-request`、`shell:confirm-response` |
| 图片 | `app:pick-image`、`app:attach-image` |
| 外开 | `app:open-external` |
| Pi 配置 | `pi-config:get`、`pi-config:save` |
| 窗口 | `window:minimize`、`window:toggle-maximize`、`window:close`、`window:is-maximized`、`window:maximized-changed` |
| 诊断/恢复 | `app:renderer-diagnostic`、`app:recovery-state`、`app:reload-interface`、`app:recovery-ready` |

消费者：「桌面UI」渲染前端（其 api-spec.md 记录消费面）。通道增改须同步 `preload.cjs`、`main.ts`、渲染消费面与本表。

## 对外导出（主进程侧模块）

- `app/desktop/interface.ts`：`createDesktopInterface(deps)`、`RoleView`、`ListProjectResult`、`DesktopDeps`、`DesktopInterface`。
- `app/desktop/session.ts`：`SessionManager`、`SessionOpenRequest`、`OpenResult`、`EffectiveConfigInfo`、`SendResult`、`StopResult`、`RuntimeKind`、`SessionEventEnvelope`、`MAX_LIVE_SESSIONS`。
- `app/desktop/project.ts`：`buildProjectConfig`、`buildEffectiveProjectConfig`、`readRoleDocsIndex`、`resolveSkillRoot`。
- `app/desktop/session-history.ts`：`readRoleSessionHistory`、`probeSessionFile`、`ReplayRow`。
- `app/desktop/request-anchor.ts`、`customer-input.ts`、`operator-channel.ts`、`pi-config.ts`、`composer-images.ts`、`chat-adapter.ts`、`push-batcher.ts`、`diagnostics.ts`：见 functional-description.md 与归档 api-spec「对外导出」节（拆分时逐字未变）。

## 运行时关键结论（Electron 与 TS，沿用）

- Electron 44.7.0 自带 Node 24.21，GUI 主进程可直接 `import` 仓库内 `.ts`（原生类型擦除；前提 ESM + 可擦除语法）；**无需构建步骤**；preload 为 CJS 例外（`app/preload.cjs`）。
- 运行：`npm run app`（= `electron app/main.ts`）；`package.json` 的 `main`/`app` 脚本与 electron 依赖属装配角色。

## 合规/偏离与测试证据

- 硬约束「判定唯一来源=门禁引擎」「Pi 经适配器」「preload 不暴露 Node」由本角色测试与 `renderer.test.ts` 通道两端交叉守卫共同钉住。
- 拆分初始版无新增/删除通道；证据沿用归档中最近一次主进程侧交付（视口/报告/诊断批与 P0/P1 批，见 `角色卡/桌面应用/docs/`）。
- 2026-10-14 拆分落地已更新：`e2e/main.mjs` 与四个真实枚举测试（`session`/`operator-channel`/`project`/`p0-halt-and-images`）的样例角色 id 改指「桌面窗口」（证据与对照见 [docs/change/2026-10-14_change_split-role-id-test-updates.md](docs/change/2026-10-14_change_split-role-id-test-updates.md)）。通道/导出面零改动。
