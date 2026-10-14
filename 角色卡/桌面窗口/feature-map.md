# 桌面窗口功能导航

本角色负责的**主进程/窗口/会话装配系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。
每份功能的稳定说明（当前流程 + 流程图 + 演变历史）将由本角色在验收后建立在 `docs/feature/<feature-id>.md`；**当前待补**，先链冻结归档 `角色卡/桌面应用/` 的历史记录（原位保留，链接有效；下表标注「归档」）。界面呈现侧（`app/renderer/`）的功能见[桌面UI 功能导航](../桌面UI/feature-map.md)。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 窗口生命周期与自绘标题栏接线 | 无边框窗口（`frame:false`、无默认菜单）、三窗口钮/最大化态经 IPC 驱动、关窗释放本窗口 IPC、mac 重开可再建 | 已实现 | 归档：[三栏功能说明](../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)、[空态收敛与标题栏](../桌面应用/changelog.md)（2026-10-11 条目） |
| preload 受限 IPC 桥 | `contextBridge` 白名单通道，不暴露任何 Node 能力；两通道兼容（单发/合帧批） | 已实现 | 归档：[api-spec](../桌面应用/api-spec.md)（IPC 通道全表） |
| 桌面会话装配（点角色即开） | 导入即授权：`.ans` pin-backed acceptance / 运行期同意；多会话保活（LRU 跳过 busy）；边界陈旧检测与作废重建（串行化+身份守卫）；状态机真实快照 | 已实现 | 归档：[`.ans` 接线](../桌面应用/docs/change/2026-10-12_change_session-comment-refresh.md)、[会话恢复](../桌面应用/docs/change/2026-10-12_change_session-restore.md)、[边界刷新](../桌面应用/docs/change/2026-10-12_change_boundary-refresh.md)、[状态机簇修复](../桌面应用/docs/change/2026-10-13_change_state-machine-and-replay-dedup.md) |
| 消息投递与队列 | 客户消息忙时入队（不丢、按序、可撤回）；su 派发路由；回交自动投递 su（去重、失败保留重试）；批推合帧 | 已实现 | 归档：[消息队列与角色状态](../桌面应用/docs/change/2026-10-12_change_message-queue-and-role-state.md)、[回交验收](../桌面应用/docs/change/2026-10-12_change_su-handback-acceptance.md)、[派发路由](../桌面应用/docs/change/2026-10-12_change_dispatch-routing-and-injected-style.md)、[P1 三条](../桌面应用/docs/change/2026-10-13_change_p1-queue-withdraw-lru-switch-guard.md) |
| 停止与图片端到端（主进程侧） | `session:abort` 三态契约接线；图片主进程重校验（解码/魔数/限额，任一张不合格整条拒发）与队列入队定格 | 已实现 | 归档：[P0 收官环](../桌面应用/docs/change/2026-10-13_change_p0-halt-and-images.md) |
| 客户交互通道与 shell 闸接线 | `request_confirmation`/`request_choice` 挂起与作答（按请求快照校验、fail-closed 四条）；shell 闸 (a) 通道与 (c) 实件 arm（两件同备才 arm；su 只读档分发、给出即 arm） | 已实现 | 归档：[交互卡与收口删除](../桌面应用/docs/change/2026-10-12_change_operator-cards-and-finalize-removal.md)、[shell arm](../桌面应用/docs/change/2026-10-12_change_shell-arm.md)、[su 只读 shell](../桌面应用/docs/change/2026-10-12_change_su-readonly-shell-arming.md)、[应用内确认卡](../桌面应用/docs/change/2026-10-12_change_shell-confirm-card.md) |
| 会话记录回放解析（D-1） | `<project>/.ans/sessions/<roleId>/` 最近 JSONL 只读解析为界面行；交互工具调用/结论行锚点标识；probe 判定恢复来源 | 已实现 | 归档：[重启恢复](../桌面应用/docs/change/2026-10-12_change_session-restore.md)、[锚点物化修复](../桌面应用/docs/fix/2026-10-12_fix_decided-card-reanchor.md) |
| Pi 配置面板逻辑（主进程侧） | 启动载入仓库根 `.env`（补 Electron 缺失的 `--env-file`）；面板键 3 必填+1 高级；掩码/原子写/只改相关键 | 已实现 | 归档：[api-spec §Pi 配置面板](../桌面应用/api-spec.md)、[面板瘦身](../桌面应用/changelog.md)（2026-10-11 条目） |
| 项目导入与枚举 | 经门禁引擎 `listProject` 枚举角色（不重写解析）；构造 ProjectConfig（含创世态判定）；读变更记录/docs 索引（只读展示） | 已实现 | 归档：[三栏功能说明](../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)、[`.ans` 接线](../桌面应用/docs/change/2026-10-12_change_session-comment-refresh.md) |
| 诊断与显式恢复 | 唯一共享 logger 滚动 24h；窗口加载/故障/IPC 诊断；显式重载续接、同 id 重推仍 pending 请求（不代答/不延期） | 已实现 | 归档：[视口/报告/诊断修复](../桌面应用/docs/fix/2026-10-13_fix_viewport-reports-diagnostics.md) |
| 端到端总自检台（e2e/main.mjs） | 真实 Electron 驱动主进程装配+preload+renderer 全链自检（离线替换适配器；截图+报告） | 已实现（2026-10-14：样例角色改「桌面窗口」；诊断基线红随「S-1 生产形状夹具」修复，`E2E_DONE=1` 全程跑通——见[变更记录](docs/change/2026-10-14_change_split-role-id-test-updates.md)） | 归档：[桌面应用 memo](../桌面应用/memo.md)、[e2e 看门狗修复](../桌面应用/changelog.md)（2026-10-12 条目） |

## 说明

- 本角色不自编项目管理/测试功能；功能文档建立在验收达标后，先立导航不留失效链接。
- 界面呈现侧（聊天流/抽屉/输入区/交互卡渲染/Markdown 等）见[桌面UI 功能导航](../桌面UI/feature-map.md)。
- 跨角色事项（门禁引擎、编排、Pi 适配器）不在本表重复。
