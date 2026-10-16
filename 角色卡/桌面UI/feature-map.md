# 桌面UI功能导航

本角色负责的**渲染前端系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。
每份功能的稳定说明（当前流程 + 流程图 + 演变历史）将由本角色在验收后建立在 `docs/feature/<feature-id>.md`；**当前待补**，先链冻结归档 `角色卡/桌面应用/` 的历史记录（原位保留，链接有效；下表标注「归档」）。功能点 = 用户能在界面上触发并看到结果的行为；跨角色事项（会话、通道、判定）不在本表重复，归「桌面窗口」。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 引擎选择、会话隔离与设置 | 选择 Pi/Codex/Claude，各自保留历史和草稿；按实际字段查看配置及组别，旧确认失效后不可作答 | U1R2本侧60/12通过；当前产品候选待独立T1重验 | [当前完整流程](docs/feature/runtime-choice.md) |
| 工作台骨架与自绘标题栏 | 两栏 + 右抽屉骨架、无边框自绘标题栏（窗口三按钮来自主进程 IPC）、右上角图标簇（角色资料/Pi 设置）与角标 | 已实现，稳定说明待补 | 归档：[三栏功能说明](../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)、[图标化与抽屉](../桌面应用/docs/change/2026-10-13_change_chat-stream-declutter-and-md-tables.md)、[两枚图标与 Pi 适配](../桌面应用/docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md) |
| 会话聊天流呈现 | 每角色一个聊天 pane（切走保历史）；回放幂等/增量/全量重建去重；≥150 行虚拟窗口；贴底/上翻不拽回/点角色到底/未决卡优先定位；状态徽标与 `data-state` | 已实现 | 归档：[热路径与虚拟流](../桌面应用/docs/change/2026-10-12_change_hot-path-and-virtual-stream.md)、[点击到底部](../桌面应用/docs/change/2026-10-12_change_click-to-bottom.md)、[状态机簇修复](../桌面应用/docs/change/2026-10-13_change_state-machine-and-replay-dedup.md)；本角色：[虚拟行锚点漂移修复](docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md)（行占位口径=真实行高+行距，开合记录组锚点零漂移） |
| 交互卡与确认卡族呈现 | su 确认/选择卡在聊天流呈现与定格（锚点物化不跳尾）；shell 命令确认卡（命令逐字、拒绝默认焦点、Esc/关闭不放行）；**恢复确认卡（G-2）**：动作/目标角色/证据逐字、恰「执行」=allow:true、等待不设限、失效如实；`[系统·看护/收束]` 投递输入单独样式（来源=系统；队列视图标签「系统」、不可撤回呈现） | 已实现（恢复卡侧 implemented-unverified，W5/O1 落树后接真） | 归档：[卡投递与工具行](../桌面应用/docs/change/2026-10-12_change_operator-card-delivery-and-tool-rows.md)、[卡可达性](../桌面应用/docs/change/2026-10-12_change_operator-card-reachability.md)、[锚点物化修复](../桌面应用/docs/fix/2026-10-12_fix_decided-card-reanchor.md)、[应用内确认卡](../桌面应用/docs/change/2026-10-12_change_shell-confirm-card.md)；本角色：[G-2/U1 恢复卡与系统行](docs/fix/2026-10-16_fix_g2-recovery-card-and-system-rows.md) |
| 待办/队列展示与撤回交互 | 角色资料抽屉内「待办/队列」「队列概览」两节 + 角标；行内全文展开；未投递客户消息撤回的就地回执；派发/回交只读呈现 | 已实现 | 归档：[右栏待办组](../桌面应用/docs/change/2026-10-12_change_right-queue-panel.md)、[两枚图标与 Pi 适配](../桌面应用/docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md)、[P1 三条](../桌面应用/docs/change/2026-10-13_change_p1-queue-withdraw-lru-switch-guard.md) |
| 输入区（胶囊/IME/图片/停止） | 胶囊输入框；输入法组合保护（候选 Enter 不误发送）；图片选图/粘贴/拖入与缩略图（渲染侧不碰文件）；停止钮（发送钮左侧、忙碌时现、与发送并存） | 已实现 | 归档：[胶囊输入与图片](../桌面应用/docs/change/2026-10-12_change_k-input-capsule-and-images.md)、[IME 修复](../桌面应用/docs/fix/2026-10-13_fix_ime-enter-candidate.md)、[P0 收官环](../桌面应用/docs/change/2026-10-13_change_p0-halt-and-images.md) |
| Markdown 渲染 | vendor markdown-it 封装（esc 单一来源、html:false、链接白名单外开、表格启用、图片原文呈现）；聊天流/角色卡/卡片同一管线 | 已实现 | 归档：[Markdown 与多会话](../桌面应用/docs/change/2026-10-12_change_markdown-and-multisession.md)、[vendor 化](../桌面应用/docs/change/2026-10-12_change_markdown-vendored-library.md)、[去常规提示与表格](../桌面应用/docs/change/2026-10-13_change_chat-stream-declutter-and-md-tables.md) |
| 空态 · 提示 · 防呆条 | 未 bootstrap 空态（只说一遍、中栏正中）；写入语义常驻横栏；异常/未授权内联如实呈现；切换项目防呆确认条（不落聊天历史） | 已实现 | 归档：[空态收敛](../桌面应用/changelog.md)（2026-10-11 条目）、[切换项目防呆](../桌面应用/docs/change/2026-10-13_change_p1-queue-withdraw-lru-switch-guard.md) |
| 按 UI/UX 设计实现（当前批次） | 按 v2 设计规范与原型逐项对齐骨架/色板/组件（66px 聊天头、760 会话列、焦点环等）；两档离线实测复核 | 已实现（当前候选，独立复核待 PM） | 归档：[按设计对齐](../桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md)、[v2 实施设计](../桌面应用/docs/design/2026-10-13_design_uiux-v2-implementation.md)、[体验返工](../桌面应用/docs/fix/2026-10-13_fix_uiux-reacceptance.md) |

## 说明

- 本角色不自编项目管理/测试功能；功能文档建立在验收达标后，先立导航不留失效链接。
- 「桌面窗口」侧的系统功能（窗口/会话/通道/判定）见[桌面窗口功能导航](../桌面窗口/feature-map.md)；渲染侧与主进程的接口契约见[桌面窗口 api-spec](../桌面窗口/api-spec.md)。
- 跨角色事项（门禁引擎、编排、Pi 适配器）不在本表重复。
