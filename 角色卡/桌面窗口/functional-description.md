# 桌面窗口 模块笔记与代码位置

## 职责与范围

本角色实现 ANS 桌面客户端的主进程侧（`app/main.ts`、`app/preload.cjs`、`app/desktop/`）：窗口、通道、会话与装配；判定一律调门禁引擎、Pi 一律经适配器。渲染前端（`app/renderer/`）属「桌面UI」。拆分背景与逐文件路由见[拆分设计](docs/design/2026-10-14_design_role-split-window.md)。

## 代码位置

```
app/
  main.ts                     Electron 主进程入口（建窗/无边框/菜单置空/IPC 注册/启动载入 .env/诊断与恢复）
  preload.cjs                 受限 IPC 桥（CJS，contextBridge 白名单）
  desktop/
    interface.ts              桌面 Interface：IPC 处理器（纯逻辑，可单测）
    session.ts                会话管理器（点角色即开、多轮 send、投递机/队列、边界重建、shell 闸两档分发）
    project.ts                由枚举构造 ProjectConfig（含创世态判定）；读变更记录/docs 索引（展示用）
    session-history.ts        旧 Pi 展示兼容：只读解析 JSONL → 界面行；不推断原生上下文
    request-anchor.ts         交互请求锚点键单一算法（kind+title；两侧同源拼键）
    customer-input.ts         客户确认制交互通道（按请求快照校验回包；fail-closed）
    operator-channel.ts       操作者确认通道 (a) + shell (c) 实件 arm（buildDesktopShellArming）；fail-closed
    runtime-config.ts         共享设置 registry 视图/白名单原子保存/安全应用
    runtime-history.ts        Pipeline ANS 回放转换；只有 Pi 的旧 JSONL 展示 fallback
    pi-config.ts              Pi 配置面板逻辑（读写仓库根 .env，经共享 env-file 模块；掩码/原子写纪律）
    composer-images.ts        图片校验纯逻辑（解码/魔数嗅探/限额）
    chat-adapter.ts           演示运行时适配器（仅测试注入缝使用；每轮发 settled）
    push-batcher.ts           事件合帧批推与角色状态去抖（纯逻辑）
    diagnostics.ts            窗口/渲染/进程诊断观察与窄桥
test/桌面应用/（主进程侧 22 个，路径沿用拆分前，逐文件清单见 boundary.yaml）
  e2e/main.mjs                桌面端到端总自检台（真实 Electron；自建窗与生产 main.ts 同形）
```

## 依赖方向

`main.ts`（入口）→ `app/desktop/*`（Interface）→ 编排 `openRoleSession` / 门禁引擎 `listProject`/`resolveWrite` → 下游；共享组件（`config-loader`、`env-file`、`diagnostics`、`runtime-shared`、`argv/path-primitives`）只读导入。主进程**不导入** `src/` 下 Service/Provider 的 impl；只经冻结导出调用。

## 关键实现点（拆分时承接，详见归档）

- **授权链唯一实现** `project.ts::buildEffectiveProjectConfig`（fallback 运行期同意 → 共享载入器 → 采纳 `.ans` 治理边界路径）；会话语义与界面共用，杜绝漂移。
- **点角色即开**：`SessionManager.open` 一次调用经 `openRoleSession`（`scope: undefined`）；多会话保活 LRU（跳过 busy）；切换角色不 dispose 切回续。
- **投递机**（E-1/H-1/L-1/P0/P1）：三类条目（客户消息/派发/回交）同一队列；失败如实+放回队首；去重键/撤回/`full` 定格；「排队≠已执行」。
- **边界陈旧重建**（O-1）：读盘 sha256 三来源快照指纹；陈旧 ⇒ 串行化作废重建 + 身份守卫 + TOCTOU 重校验；在跑轮次不打断。
- **shell 两档**：项目角色 (c)/(b)/(a) 三层链；su 只读档（给出 `shellReadonly` 即 arm，不带 `!suppressHandback` 前缀）。
- **诊断**：唯一共享 logger 滚动 24h；`app:reload-interface` 显式重载；`replayPending` 同 id 重推不代答。
- 历史沿革（全部变更/修复）见冻结归档 `角色卡/桌面应用/docs/` 与[功能导航](feature-map.md)链接。

## 已知偏离 / 边界登记

- 拆分未物理移动 `test/桌面应用/`；主进程侧测试文件按 file 逐条授权（见 [boundary.yaml](boundary.yaml)）。
- **拆分落地已完成**（2026-10-14）：`e2e/main.mjs` 与四个真实枚举测试（`session`/`operator-channel`/`project`/`p0-halt-and-images`）的样例角色 id 已改「桌面窗口」并全量跑通，详见[变更记录](docs/change/2026-10-14_change_split-role-id-test-updates.md)。**抽屉/队列断言已于同日同步至 UIUX v2 现行结构**（PM 跟进派发：6 处 log-only 重锚、3 处日志键随语义改名）；剩余 5 行同族「文案/格式面」脱节已列名交 PM 决定是否再派（见该记录跟进节）。
- 已知环境红：`pi-config.test.ts` 检出目录名断言（基线）。`e2e/main.mjs` 的 `DIAGNOSTICS` 基线红已于 2026-10-14 修复（S-1 夹具改生产形状＋唯一 `turnId` ⇒ 真窗口化；尾部 mac 场景与 `E2E_DONE=1` 恢复，连跑 5+1 次轮间内容级零差异——见[变更记录](docs/change/2026-10-14_change_split-role-id-test-updates.md) 跟进 4）。

## 多引擎接入（D1）

当前行为与完整流程见[桌面多引擎会话](docs/feature/multi-runtime-desktop.md)。生产创建调用 Pipeline createRuntimeAdapterFactory；会话、队列及事件均带项目/角色/runtime，配置保存使该引擎 profile revision 递增，并在安全点重建。新增模块与白名单 IPC 见[API](api-spec.md)，独立验证见[实施记录](docs/change/2026-10-14_change_multi-runtime-window.md)。
