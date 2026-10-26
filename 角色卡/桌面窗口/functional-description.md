# 桌面窗口 模块笔记与代码位置

## 职责与范围

本角色实现 ANS 桌面客户端的主进程侧（`app/main.ts`、`app/preload.cjs`、`app/desktop/`）：窗口、通道、会话与装配；判定一律调门禁引擎、Pi 一律经适配器。渲染前端（`app/renderer/`）属「桌面UI」。拆分背景与逐文件路由见[拆分设计](docs/design/2026-10-14_design_role-split-window.md)。

2026-10-15 按客户确认的[总方案 revision 2](../项目管理/docs/design/2026-10-15_design_complete-flow-interface-plan.md)，本角色增加 [B/r2 受限项目文档读取](docs/design/2026-10-15_design_restricted-document-read.md)专属 Model/Pipeline/Service/Provider 维护职责。授权精确增加 8 个源码与 1 个测试文件；没有扩张其他角色边界，没有授予各层目录或 `common/`。本节描述已生效的责任分配，B 代码与真实桌面行为仍待属主实施和独立测试，不能当成当前已可使用的功能；治理检查见[变更记录](docs/change/2026-10-15_change_restricted-document-boundary.md)。

## 代码位置

```
app/
  main.ts                     Electron 主进程入口（建窗/无边框/菜单置空/IPC 注册/启动载入 .env/诊断与恢复）
  preload.cjs                 受限 IPC 桥（CJS，contextBridge 白名单）
  desktop/
    interface.ts              桌面 Interface：IPC 处理器（纯逻辑，可单测）
    renderer-entry.ts         渲染入口唯一路径事实源（Phase 5B：唯一 renderer/dist/index.html）
    navigation-policy.ts      导航兜底纯策略（同 URL/允许入口、http(s) 外开、恶意协议阻止、外开去重闸；PM §17.12）
    navigation-guard.ts       will-navigate/setWindowOpenHandler 接线（真实主进程窗口安装；可假件测试）
    session.ts                会话管理器（点角色即开、多轮 send、投递机/队列、边界重建、shell 闸两档分发）
    view-image.ts             view_image 桌面侧投递（工具读取的图片 → 下一轮同角色后台系统提示；能力注入）
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
test/桌面应用/（路径沿用拆分前，逐文件清单见 boundary.yaml；B 测试单文件新增授权，尚待创建）
  e2e/main.mjs                桌面端到端总自检台（真实 Electron；自建窗与生产 main.ts 同形）
```

## 依赖方向

`main.ts`（入口）→ `app/desktop/*`（Interface）→ 编排 `openRoleSession` / 门禁引擎 `listProject`/`resolveWrite` → 下游；共享组件（`config-loader`、`env-file`、`diagnostics`、`runtime-shared`、`argv/path-primitives`）只读导入。主进程**不导入** `src/` 下 Service/Provider 的 impl；只经冻结导出调用。

## B 文档读取专属职责与代码位置（已授权，待实现）

| 层 | 精确文件 | 本角色职责 |
| --- | --- | --- |
| Model | `src/model/project-document.ts` | 唯一主属：B 版本、引用、可信导入内部类型、请求/结果与错误类型；无 IO，其他角色只读消费 |
| Pipeline | `src/pipeline/project-document/read-project-document.ts` | 对外唯一 `createProjectDocumentReader` 入口；组合 scope 更新、读取与关闭 |
| Service abstract | `src/service/project-document/abstract/document-reader.ts` | 服务接口与 Provider 所需读取条件 |
| Service public | `src/service/project-document/public/read-project-document.ts` | 受限服务创建/调用入口 |
| Service impl | `src/service/project-document/impl/read-project-document.ts` | 唯一权限 registry、清单资格、预算/格式/编码政策与安全错误映射 |
| Provider abstract | `src/provider/project-document/abstract/file-reader.ts` | 文件句柄事实与受限有界 IO 接口 |
| Provider public | `src/provider/project-document/public/file-reader.ts` | 平台文件读取能力工厂 |
| Provider impl | `src/provider/project-document/impl/file-reader.ts` | 路径与句柄校验、只读 open、有界 read、关闭与平台能力检查 |
| 测试 | `test/桌面应用/project-document.test.ts` | 服务/Provider 预算、编码、句柄竞态、grant/scope 与引用失效 |

既有 `main.ts`、`preload.cjs`、`app/desktop/interface.ts` 与 `project.ts` 接入 B 的 IPC/可信原生选目录 grant/既有文档索引；新读取能力不在 Interface 直接增加 fs。调用方向为 Interface → Pipeline → Service public/abstract → Provider public/abstract → Node 基础设施，各层可引用 Model；上层不直导下层 impl、不平级互调、不把 fs 藏进 common。Service 是阅读清单与权限 registry 的唯一实现，Interface 只投递可信 listing 候选；Provider 只返回文件事实与字节。

B 的每窗口 grant 只来自原生选目录，renderer root/recovery/evidence 文本均不授权；关窗清除，重启须原生重选。清单限本次已导入非 builtIn 角色的资料卡/changelog/docs file；UTF-8 md/txt 每文件至多 262144 原始字节，预算、symlink、平台能力与竞态限制遵照 B/r2。支持可信本地 macOS/Linux 受测文件系统，Windows/能力不足拒读，不保证对抗恶意本地 writer 的瞬时目录替换或硬链接来源。读取资格不替代 `resolveWrite` 写门禁；共享路径原语只读复用，文档正文不进诊断或自动交模型。UI 安全渲染与真实窗口验收分别由桌面UI及测试角色负责，具体行为以实现后的功能文档和原始证据为准。

## 关键实现点（拆分时承接，详见归档）

- **授权链唯一实现** `project.ts::buildEffectiveProjectConfig`（fallback 运行期同意 → 共享载入器 → 采纳 `.ans` 治理边界路径）；会话语义与界面共用，杜绝漂移。
- **点角色即开**：`SessionManager.open` 一次调用经 `openRoleSession`（`scope: undefined`）；多会话保活 LRU（跳过 busy 与各项目主理 `primaryRoleId`——主理会话不关闭）；切换角色不 dispose 切回续。
- **投递机**（E-1/H-1/L-1/P0/P1/G-2）：四类条目（客户消息/派发/回交/系统）同一队列；失败如实+放回队首；去重键/撤回/`full` 定格；「排队≠已执行」；治理唤醒按 `system` 入队（显示「系统」、不可撤回）。
- **view_image 桌面投递**（2026-10-26，两轮附件）：开会话/重建时构造 `viewImage: ViewImageFn`（契约全家 `src/model/runtime.ts`）并随 `openRoleSession` 注入（全部角色）；工具本轮内调用 ⇒ 经既有 `send` 以 `background:true`+`kind:"system"` 排队，settle 后按序投给**同一角色**，`PromptOptions.images` 装入工具生成的 `PromptImage` 原引用；成功回执 `{ok:true}`，失败/会话不可用/非法载荷如实 `{ok:false,message}`。目标在开会话时定格（不按 `activeRoleId`）。见[功能说明](docs/feature/view-image-delivery.md)。
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
