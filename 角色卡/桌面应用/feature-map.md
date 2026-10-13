# 桌面应用功能导航

本角色负责的**系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。
每份功能的稳定说明（当前流程 + 流程图 + 演变历史）归 `docs/feature/<feature-id>.md`；**本角色各功能的稳定说明待补**，既有历史先链 `docs/change/`、`docs/fix/`、`docs/design/` 记录。

> 注：本文件 2026-10-12 建立（此前缺失；role-card 已引用本路径）。功能文档按 `docs/feature/` 规范逐步补齐——先立导航，不建失效链接。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 双栏工作台 + 右抽屉 | 导入项目 → 左树（项目/角色，su 置顶为主入口）→ 中栏聊天；右栏角色资料**收成右上角图标簇（两枚：角色资料/Pi 设置）、点了以抽屉展示**（2026-10-13 客户两轮裁定：默认不常驻、聊天列宽不 reflow；待办/队列归角色） | 已实现 | [三栏功能说明](docs/feature/2026-10-11_feature_desktop-three-pane.md)、[右栏图标化与抽屉](docs/change/2026-10-13_change_chat-stream-declutter-and-md-tables.md)、[两枚图标与 Pi 适配](docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md) |
| 点角色即开聊（导入即授权） | 左树点角色 → 直接建立/续接多轮会话，全程无确认框；写入由门禁引擎静默把关、越界拒绝内联在聊天流 | 已实现 | [多会话并存与切换保留](docs/change/2026-10-12_change_markdown-and-multisession.md)、[重启恢复](docs/change/2026-10-12_change_session-restore.md) |
| 会话队列与状态徽标 | 角色忙时消息/投递入队（每角色一条队列）；左树如实显示「工作中 · N 待办」；**待办/队列归角色**——作为「角色资料」抽屉里该角色名下的两节（进行中+排队 / 仅排队位次，逐字保留、随选中角色），角色资料图标角标＝选中角色待办深度（收起不丢信息）；排队 ≠ 已执行 | 已实现 | [消息队列与角色状态](docs/change/2026-10-12_change_message-queue-and-role-state.md)、[右栏待办组](docs/change/2026-10-12_change_right-queue-panel.md)、[两枚图标与 Pi 适配](docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md) |
| su 治理对话（创世/建角色） | 与内置治理角色 su 对话：未 bootstrap 空项目可创世写出治理产物；产物收尾/重 pin 由编排在轮末自动完成 | 已实现 | [确认制与收口删除](docs/change/2026-10-12_change_operator-cards-and-finalize-removal.md) |
| 客户确认制交互卡 | su 经 `request_confirmation`/`request_choice` 把「将写什么」摆到聊天流里，客户作答才发行 writeSet、才落盘；卡的（重）物化按**时序锚点**落位（切走/切回、pane 重建、回放后不跳尾；open 与已决一视同仁；兜底落尾不丢卡） | 已实现 | [交互卡投递与工具行](docs/change/2026-10-12_change_operator-card-delivery-and-tool-rows.md)、[卡可达性](docs/change/2026-10-12_change_operator-card-reachability.md)、[锚点物化修复](docs/fix/2026-10-12_fix_decided-card-reanchor.md) |
| 回交投递 + su 派发路由 | 项目角色一轮结束自动回交 su 验收（去重/排队/失败保留）；su 经 `dispatch_task` 把任务路由进目标角色会话 | 已实现 | [回交投递 su 验收](docs/change/2026-10-12_change_su-handback-acceptance.md)、[派发路由](docs/change/2026-10-12_change_dispatch-routing-and-injected-style.md)、[回交卡渲染崩溃修复](docs/fix/2026-10-12_fix_handback-render-crash.md) |
| shell 闸（项目角色·三层链） | 项目角色的 `run_shell`：命令执行前经 (c) 白名单/硬拒 → (b) su 模型审读 → (a) 客户应用内确认卡（拒绝为默认；关窗/超时 = 不放行） | 已实现 | [开放 shell 桌面 arm](docs/change/2026-10-12_change_shell-arm.md)、[应用内确认卡](docs/change/2026-10-12_change_shell-confirm-card.md) |
| **su 只读 shell（只读档）** | **su 的 `run_shell` 只执行 (c) 只读白名单命令**（`ls`/`cat`/`git status` 等）；`risky`/`review`/`deny` 一律拒——**不接 (b)/(a)**、不弹框、不打扰客户 | **已实现** | [su 只读 shell 桌面接线](docs/change/2026-10-12_change_su-readonly-shell-arming.md)（稳定功能说明待补；编排侧装配见 `角色卡/编排/docs/change/2026-10-12_change_su-readonly-shell.md`） |
| 边界变更自动重开会话（O-1） | 角色/治理边界文件被改后，活会话按读盘哈希检出陈旧 ⇒ 作废重建并按新边界续；**重建按角色串行化 + 身份守卫**（2026-10-13 真机竞态修复：并发作废重建不再误删新会话/误复位忙态/丢消息）；如实提示上下文恢复情况 | 已实现 | [边界变更刷新](docs/change/2026-10-12_change_boundary-refresh.md)、[状态机簇修复](docs/change/2026-10-13_change_state-machine-and-replay-dedup.md) |
| 历史回放去重（D-1 修复） | 主进程重推会话历史（`project:changed`→refresh 链路）时：同一份**幂等**（不再整份再回放——真机「同段消息渲染两遍」修复）、文件增长走**增量**、重写/截断走**全量重建**；纯函数 `UiLabels.replayPlan` 出策略 | 已实现 | [状态机簇修复](docs/change/2026-10-13_change_state-machine-and-replay-dedup.md) |
| 聊天流虚拟渲染 + 热路径治理 | 长会话（≥150 行）只实体化视口附近；事件合帧推送、状态去抖——角色工作期间界面不卡 | 已实现 | [热路径与虚拟流](docs/change/2026-10-12_change_hot-path-and-virtual-stream.md)、[点击角色到底部](docs/change/2026-10-12_change_click-to-bottom.md) |
| Markdown 渲染（聊天流/角色卡/卡片） | 统一 `Md` 管线（同一转义/白名单；链接外开经 Interface 校验仅 http/https；表格已启用、图片禁用以原文呈现；聊天流无常规提示——欢迎行/恢复分隔行已删，异常提示保留） | 已实现 | [Markdown 与多会话](docs/change/2026-10-12_change_markdown-and-multisession.md)、[vendor 化](docs/change/2026-10-12_change_markdown-vendored-library.md)、[按钮文案与角色卡](docs/change/2026-10-12_change_ui-button-label-and-card-markdown.md)、[去常规提示与表格](docs/change/2026-10-13_change_chat-stream-declutter-and-md-tables.md) |
| Pi 配置面板 | 界面读写仓库根 `.env`（3 项必填 + 1 项高级；token 掩码、绝不外发）——补上 Electron 缺失的 `--env-file`；入口=右上角图标簇（面板本体迁入右侧抽屉；抽屉内字段堆叠、任意窗宽不溢出——2026-10-13 客户裁定） | 已实现 | 功能文档待补（见 [memo.md](memo.md) 的 T28/面板瘦身条目）、[两枚图标与 Pi 适配](docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md) |
| 输入区图片（选图/粘贴/拖入） | 主进程读文件、Interface 按真实字节嗅探校验；**随消息端到端送进模型**（`sendSession(text, images)` → 主进程重校验 → 队列入队定格 → 句柄整包透传；2026-10-13 客户批准 P0-1） | 已实现 | [K-1 胶囊输入 + K-2 图片](docs/change/2026-10-12_change_k-input-capsule-and-images.md)、[P0 收官环](docs/change/2026-10-13_change_p0-halt-and-images.md) |
| 停止当前轮次（P0-2） | **输入框区、发送钮左侧**的小圆钮（2026-10-13 客户反馈后从聊天头移来）——仅该角色忙碌时出现（role-state 快照判据）；点击向会话请求中止当前一轮（编排 `abort?` 三态契约），聊天流**如实行**（已请求停止 / 当前运行时不支持停止 / 停止失败）；轮次仍以 settled 收尾、重复点击幂等；会话保留（**不是**「结束会话」）；**与发送钮并存**——发送钮绝不因忙碌被替换/禁用（忙碌时发消息=入队） | 已实现 | [P0 收官环](docs/change/2026-10-13_change_p0-halt-and-images.md)（含位置调整 §2′） |
| 自绘标题栏 + 无默认菜单栏 | `frame:false` + 菜单栏置 null；渲染侧自绘三窗口按钮（经 IPC）+ 右上角图标簇（角色资料/Pi 设置两枚，点了开抽屉） | 已实现 | 功能文档待补（见 [functional-description.md](functional-description.md)、[memo.md](memo.md)）、[两枚图标与 Pi 适配](docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md) |

## 说明

- 功能点 = 用户或外部系统能触发并得到结果的行为；本角色不自编项目管理/测试等功能。
- 跨角色事项（门禁引擎、编排、Pi 适配器、Pi 扩展）不在本导航重复，按各自角色文档链接（如 su 只读档的编排侧装配）。
- 每份 `docs/feature/<feature-id>.md` 补齐时，在本表对应行更新链接。
