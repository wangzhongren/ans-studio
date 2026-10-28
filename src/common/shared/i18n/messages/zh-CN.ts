// 中文（简体）参考消息目录 —— **key 全集参考**。
//
// 属主：项目管理（本目录唯一写入者）。`MessageKey` 由本文件的 key 推导
// （`src/common/shared/i18n/keys.ts`），因此新增/删除 key 先改这里，再改 `en-US.ts`；
// `en-US.ts` 的类型会强制其 key 集合与本文件一致。
//
// 约定（方案 §4.3/§7.4）：
//  · key 只含小写 ASCII、数字、点、连字符，格式 `<area>.<component>.<purpose>`；
//  · B0 阶段中文文案沿用现有界面原文（窗口标题、导入项目、选择图片、启动失败）；
//  · 迁移批次只 key 化，不改写中文措辞；key 一旦发布不改名。
//
// B1–B4 key 契约（2026-10-23，项目管理一次性产出；消费方迁移在后续批次）：
//  · `ui.*`      B1/B2 渲染层用户可见 chrome、状态、错误前缀（来源：`app/renderer/src/**`）；
//  · `main.*`    B3 主进程应用生成、最终显示给用户的文本（来源：`app/desktop/**`）；
//  · `shared.*`  B4 共享设置元数据 + 跨层通用短词（来源：`src/common/shared/**`）。
//  · **不收录**：发给 agent 的任务文案/提示词、模型/工具输出、外部错误原文（作为 `{detail}`
//    参数保留）、诊断/日志码、机器标识、历史文本解析正则、CLI 输出（B5）。
//  · 复用：同一含义/同一文案只保留一个 key；跨层短词放 `shared.common.*`。
//  · 动态值用 `{param}` 插值；计数文案用复数模板（`{ one, other }` / `{ other }`）。

import type { Catalog } from "../types.ts";

export const zhCN = {
  // ---- 渲染层设置：语言区（B0 骨架；桌面UI 接线）----
  "ui.settings.language.title": "语言",
  "ui.settings.language.description":
    "选择界面显示语言。切换后立即生效，已生成的记录保持原语言。",
  "ui.settings.language.zhCN": "简体中文",
  "ui.settings.language.enUS": "English",
  "ui.settings.language.saveFailed": "语言偏好保存失败，请稍后重试。",

  // ---- 主进程：窗口与对话框标题（沿用现有原文）----
  "main.window.title": "ANS 桌面应用（受治理会话）",
  "main.dialog.importProject.title": "导入项目（选择项目根文件夹）",
  "main.dialog.pickImage.title": "选择图片",

  // ---- 主进程：启动失败（沿用现有原文）----
  "main.error.startup.title": "应用启动失败",
  "main.error.startup.detail": "界面无法启动，请查看诊断日志后重新打开。",

  // ---- 应用级语言偏好错误（B0 偏好读写接线使用）----
  "preferences.error.invalidLocale": "语言偏好无效，已恢复为简体中文。",
  "preferences.error.saveFailed": "无法保存语言偏好，请稍后重试。",
  "preferences.error.readInvalid": "语言偏好读取失败，已使用默认语言。",

  // =====================================================================
  // shared.* —— B4 共享设置元数据 + 跨层通用短词
  // =====================================================================

  // ---- 跨层通用短词（渲染层与主进程共用；同一文案只此一份）----
  "shared.common.cancel": "取消",
  "shared.common.close": "关闭",
  "shared.common.collapse": "收起",
  "shared.common.retry": "重试",
  "shared.common.retryRead": "重试读取",
  "shared.common.unknown": "未知",
  "shared.common.unknownReason": "未知原因",
  "shared.common.unknownStatus": "未知状态",
  "shared.common.none": "无",
  "shared.common.notReported": "未报告",
  "shared.common.notProvided": "（未报告）",
  "shared.common.notSet": "未设置",
  "shared.common.system": "系统",
  "shared.common.role": "角色",
  "shared.common.tool": "工具",
  "shared.common.failed": "失败",
  "shared.common.completed": "已完成",
  "shared.common.aborted": "已中止",
  "shared.common.redacted": "已净化",
  "shared.common.truncated": "已截断",
  "shared.common.safeCopyTitle": "交接内容（安全显示副本）",
  "shared.common.working": "工作中",

  "shared.common.stopUnsupportedPeriod": "当前运行时不支持停止。",
  "shared.common.stopTurn": "停止本轮",
  "shared.common.shellConfirmationExpired": "此确认已失效（超时或应用重启），未获放行——请让角色重新发起。",
  "shared.common.customerMessage": "客户消息",
  "shared.common.rebuildSession": "重建会话",
  "shared.common.invalidSaveRequest": "保存请求无效。",
  // ---- 引擎设置元数据（`src/common/shared/runtime-settings.ts`；B4 只加 key，形状另批）----
  "shared.runtimeSettings.runtime.demo": "演示",
  "shared.runtimeSettings.pi.token.label": "访问令牌",
  "shared.runtimeSettings.field.apiBaseUrl.label": "API 地址",
  "shared.runtimeSettings.field.apiKey.label": "API 密钥",
  "shared.runtimeSettings.field.model.label": "模型",
  "shared.runtimeSettings.pi.contextWindow.label": "上下文窗口",
  "shared.runtimeSettings.pi.contextWindow.help":
    "拖动选择预设档位，最大 1M tokens；留空＝系统默认（500k）；下一次开启会话时应用。",
  "shared.runtimeSettings.pi.contextWindow.choice.default": "系统默认（500k）",
  "shared.runtimeSettings.pi.contextWindow.choice.k32": "32k",
  "shared.runtimeSettings.pi.contextWindow.choice.k64": "64k",
  "shared.runtimeSettings.pi.contextWindow.choice.k128": "128k",
  "shared.runtimeSettings.pi.contextWindow.choice.k256": "256k",
  "shared.runtimeSettings.pi.contextWindow.choice.k500": "500k",
  "shared.runtimeSettings.pi.contextWindow.choice.m1": "1M",
  "shared.runtimeSettings.pi.promptTimeout.label": "看护检查时限",
  "shared.runtimeSettings.pi.promptTimeout.help":
    "到点只通知治理角色检查是否卡死，不中止本轮；仍在推进则不动作；1 小时为最后兜底；留空＝系统默认（5 分钟）；单位 ms；下一次开启会话时应用。",
  "shared.runtimeSettings.pi.promptTimeout.choice.default": "系统默认（5 分钟）",
  "shared.runtimeSettings.pi.promptTimeout.choice.m1": "1 分钟",
  "shared.runtimeSettings.pi.promptTimeout.choice.m2": "2 分钟",
  "shared.runtimeSettings.pi.promptTimeout.choice.m5": "5 分钟",
  "shared.runtimeSettings.pi.promptTimeout.choice.m10": "10 分钟",
  "shared.runtimeSettings.pi.promptTimeout.choice.m15": "15 分钟",
  "shared.runtimeSettings.pi.promptTimeout.choice.m30": "30 分钟",
  "shared.runtimeSettings.reasoning.label": "推理强度",
  "shared.runtimeSettings.reasoning.help":
    "留空＝维持平台默认（现状零变化）；档位依次为 关/低/中/高/极高（缺省档语义见平台）；思考计入输出 tokens。",
  "shared.runtimeSettings.reasoning.choice.off": "关",
  "shared.runtimeSettings.reasoning.choice.low": "低",
  "shared.runtimeSettings.reasoning.choice.medium": "中",
  "shared.runtimeSettings.reasoning.choice.high": "高",
  "shared.runtimeSettings.reasoning.choice.xhigh": "极高",
  "shared.runtimeSettings.codex.apiKey.help": "已有 OPENAI_API_KEY 时可使用其作为凭据。",
  "shared.runtimeSettings.codex.apiBaseUrl.help":
    "留空使用 OpenAI API；自定义地址须兼容 Responses API。",
  "shared.runtimeSettings.claude.model.help": "留空使用 SDK 默认模型。",
  "shared.runtimeSettings.claude.apiBaseUrl.help": "留空使用 SDK 默认服务。",

  // =====================================================================
  // ui.* —— B1/B2 渲染层（app/renderer/src/**）
  // =====================================================================

  // ---- 窗口标题栏（shell/TitleBar.tsx）----
  "ui.titlebar.windowControlsUnavailable": "窗口控制不可用",
  "ui.titlebar.subtitle": "治理会话工作台",
  "ui.titlebar.minimize": "最小化",
  "ui.titlebar.restore": "还原",
  "ui.titlebar.maximize": "最大化",
  "ui.titlebar.controlsUnavailableHint": "当前环境未提供窗口控制",

  // ---- 应用根组件（App.tsx / main.tsx）----
  "ui.app.missingRoot": "缺少 #root 挂载点",
  "ui.app.expandSidebar": "展开左侧栏",
  "ui.app.emptySub": "尚未导入项目或选择角色",

  // ---- 会话头部（shell/ChatHeader.tsx）----
  "ui.chatHeader.noSession": "尚未开启会话",
  "ui.chatHeader.selectRoleHint": "从左侧选择一个角色开始聊天",
  // 会话头 tab 独立标签（不含 `{roleName} ·` 前缀）；QueueSubview 的可见返回文本
  // 逐字相同，复用这两个 key；`backWork/backRole` 含「返回」，仅用于 aria-label。
  "ui.chatHeader.tabWork": "工作概览",
  "ui.chatHeader.tabCard": "角色资料",

  // ---- 角色显示（chat/role-view.ts）----
  "ui.role.noneSelected": "未选择角色",
  "ui.role.builtinGovernance": "内置治理角色（定义见 SKILL.md）",
  "ui.role.boundaryCount": "{count} 条边界条目",
  "ui.role.group.primary": "主入口",
  "ui.role.group.governance": "治理职能（内置）",
  "ui.role.group.default": "工作角色",
  "ui.role.governance.builtinNote": "内置角色：随应用发布，无角色目录",
  "ui.role.governance.chief.name": "幕僚",
  "ui.role.governance.chief.power": "工作流管理 · 客户沟通 · 不拥有最终批准权",
  "ui.role.governance.product.name": "产品",
  "ui.role.governance.product.power": "产品评审 · 不拥有最终批准权",
  "ui.role.governance.draft.name": "策划",
  "ui.role.governance.draft.power": "提案权 · 不拥有最终批准权",
  "ui.role.governance.crew.name": "人事",
  "ui.role.governance.crew.power": "写卡权（客户任命后） · 不拥有最终批准权",
  "ui.role.governance.steward.name": "运营",
  "ui.role.governance.steward.power": "排期权 · 不拥有最终批准权",
  "ui.role.governance.verifier.name": "质检",
  "ui.role.governance.verifier.power": "验收权 · 不拥有最终批准权",

  // ---- 侧栏（shell/Sidebar.tsx）----
  "ui.sidebar.primaryHint": "主入口：默认入口与主路径",
  "ui.sidebar.builtinRoleNote": "内置角色：定义在 SKILL.md，无角色目录",
  "ui.sidebar.busyAria": "当前工作 {busy} 项，排队 {queued} 项",
  "ui.sidebar.selectProjectFailed": "选择项目失败，请重试。",
  "ui.sidebar.noProject": "尚未导入项目",
  "ui.sidebar.noProjectPeriod": "尚未导入项目。",
  "ui.sidebar.collapse": "收起左侧栏",
  "ui.sidebar.workspace": "工作空间",
  "ui.sidebar.roleListAria": "角色列表",
  "ui.sidebar.noRolesInProject": "该项目下未枚举到角色。",
  "ui.sidebar.resizeAria": "调整左侧栏宽度",
  "ui.sidebar.resizeTitle": "拖动调整左栏宽度；双击复位 248px",
  "ui.sidebar.switchProject": "切换项目",
  "ui.sidebar.importProject": "导入项目",
  "ui.sidebar.pickUnavailable": "当前环境未提供项目选择通道",
  "ui.sidebar.runtimeSettings": "{runtime} 设置",
  "ui.sidebar.settingsDisabled": "导入项目后可配置引擎",
  "ui.sidebar.settings": "设置",
  "ui.sidebar.roleCount": "{count} 个角色",

  // ---- 队列（shell/QueuePanel.tsx）----
  "ui.queue.expand": "展开全文",
  "ui.queue.collapse": "收起全文",
  "ui.queue.fullText": "全文",
  "ui.queue.withdrawTitle": "撤回该条排队消息（仅未投递者可撤）",
  "ui.queue.withdrawing": "撤回中…",
  "ui.queue.withdraw": "撤回",

  // ---- 队列子视图（shell/QueueSubview.tsx）----
  "ui.queueSubview.backRole": "返回角色资料",
  "ui.queueSubview.backWork": "返回工作概览",
  "ui.queueSubview.emptyTitle": "选择角色后查看队列",
  "ui.queueSubview.emptySub": "先从左侧选择角色，再查看该角色的当前工作与排队消息。",
  "ui.queueSubview.queued": "排队 {count}",
  "ui.queueSubview.showAll": "查看更多队列（{count}）",
  "ui.queueSubview.collapse": "收起队列",

  // ---- 工作概览（shell/WorkOverview.tsx + chat/work-view.ts）----
  "ui.work.title": "{roleName} · 工作概览",
  "ui.work.emptyTitle": "选择角色后查看工作概览",
  "ui.work.emptySub": "先在左侧选择角色，再打开工作概览；内容跟随当前角色。",
  "ui.work.pending": "待处理 {count}",
  // 无计数标题（A2；桌面UI 接线：计数移入独立 badge 时用此标题，避免数字重复）
  "ui.work.pendingTitle": "待处理",
  "ui.work.locateTitle": "定位到原交互卡（不会自动作答）",
  "ui.work.locate": "定位",
  "ui.work.currentWork": "当前工作",
  "ui.work.queued": "排队",
  "ui.work.viewAllQueueAria": "查看全部队列（{count} 项）",
  "ui.work.viewAllQueue": "查看全部队列（{count}）",
  "ui.work.recentReports": "最近交付",
  "ui.work.emptyPending": "无待处理请求",
  "ui.work.emptyQueue": "无进行中或排队消息",
  "ui.work.emptyReports": "暂无交付报告",
  "ui.work.overviewAria": "工作概览，{count} 项待处理",
  "ui.work.kind.choice": "待选择",
  "ui.work.kind.confirm": "待确认",
  "ui.work.requestFallback": "交互请求",
  "ui.work.reportStatus.blocked": "被拦下",
  "ui.work.origin.report": "报告声明：",
  "ui.work.origin.system": "系统按终态记录：",
  "ui.work.origin.unconfirmed": "来源未确认：",

  // ---- 后台任务面板（渲染层；运行时 BackgroundTaskCapability: list/read/stop）----
  "ui.background.title": "后台任务",
  "ui.background.count": "后台任务 {count}",
  "ui.background.empty": "当前没有后台任务",
  "ui.background.runningSummary": "{count} 个运行中",
  "ui.background.role": "角色",
  "ui.background.command": "命令",
  "ui.background.startedAt": "启动时间",
  "ui.background.pid": "进程号",
  "ui.background.duration": "已运行",
  "ui.background.exitCode": "退出码 {code}",
  "ui.background.state.running": "运行中",
  "ui.background.state.exited": "已退出",
  "ui.background.state.stopped": "已停止",
  "ui.background.state.failed": "启动失败",
  "ui.background.state.killTimeout": "停止超时",
  "ui.background.viewLog": "查看日志",
  "ui.background.hideLog": "收起日志",
  "ui.background.logEmpty": "暂无输出",
  "ui.background.logTruncated": "日志过长，只显示最近部分",
  "ui.background.stop": "停止",
  "ui.background.stopConfirm": "停止这个后台任务？",
  "ui.background.stopFailed": "停止失败：{detail}",
  "ui.background.readFailed": "读取日志失败：{detail}",
  "ui.background.loadFailed": "读取后台任务失败：{detail}",
  "ui.background.refresh": "刷新",

  // ---- 流程状态面板（渲染层；展示 docs/flows/<flowId>.yaml 的步骤进度）----
  "ui.flow.title": "流程状态",
  "ui.flow.progress": "{done}/{total} 步",
  "ui.flow.current": "当前步骤",
  "ui.flow.owner": "负责",
  "ui.flow.updatedAt": "更新时间",
  "ui.flow.empty": "暂无流程状态",
  "ui.flow.loadFailed": "读取流程状态失败：{detail}",
  "ui.flow.parseError": "{file} 解析失败：{detail}",
  "ui.flow.showAll": "显示全部步骤",
  "ui.flow.hideAll": "收起未完成步骤",
  "ui.flow.state.pending": "待处理",
  "ui.flow.state.dispatched": "已派发",
  "ui.flow.state.delivered": "已交付",
  "ui.flow.state.done": "已完成",
  "ui.flow.state.failed": "失败",
  "ui.flow.state.blocked": "阻塞",
  "ui.flow.state.superseded": "已替代",
  "ui.flow.kind.artifact": "产物",
  "ui.flow.kind.dispatch": "派工",
  "ui.flow.kind.customerDecision": "客户决定",
  "ui.flow.kind.acceptance": "验收",
  "ui.flow.refresh": "刷新",

  // ---- 验收分诊卡（验收分诊：结论/严重度/建议/来源/汇报文本；桌面UI 接线）----
  "ui.triage.title": "验收分诊",
  "ui.triage.question": "对本次验收结果如何处理？",
  "ui.triage.option.rework": "下发运营修改",
  "ui.triage.option.reportOnly": "仅汇报不返工",
  "ui.triage.advice.rework": "建议下发运营修改（{blockers} 个阻断、{majors} 个重要项，改进方案可执行）",
  "ui.triage.advice.reportOnly": "建议仅汇报不返工（仅 {minors} 个次要/风格项）",
  "ui.triage.advice.none": "无法自动建议，请人工判断",
  "ui.triage.conclusion.pass": "通过",
  "ui.triage.conclusion.fail": "不通过",
  "ui.triage.conclusion.conditional": "有条件通过",
  "ui.triage.severity.blocker": "阻断",
  "ui.triage.severity.major": "重要",
  "ui.triage.severity.minor": "次要",
  "ui.triage.severity.nit": "风格建议",
  "ui.triage.section.summary": "验收结论",
  "ui.triage.section.failures": "不通过原因",
  "ui.triage.section.improvements": "改进方案",
  "ui.triage.section.source": "决定来源",
  "ui.triage.source.judge": "判断代批（替我决策）",
  "ui.triage.source.customer": "客户选择",
  "ui.triage.warn.blockingReportOnly": "报告含阻断项，仅汇报将不修复",
  "ui.triage.report.head": "验收结论：{conclusion}",
  "ui.triage.report.reasonLine": "{id} · {severity}：{reason}",
  "ui.triage.report.actionLine": "改进建议：{action}",
  "ui.triage.report.pathLine": "报告：{path}",
  "ui.triage.report.noRework": "本次不返工（{source}）",
  "ui.triage.returnedToVerifier": "验收报告缺少分诊结构，已退回质检补充",
  "ui.triage.missingReport": "验收报告不可读：{detail}",

  // ---- 决策卡（decision card；2026-10-26 客户规则：材料性选择、唯一推荐项、与验收分离；桌面UI 接线）----
  // 语义：decision 卡只记录材料性选择，不是提案/任命/验收，不是客户批准，不触发 gate/验收。
  // 「推荐」只标在唯一推荐项上；judge 代批必须标「自动代理」，不得写成客户本人。
  "ui.decisionCard.title": "决策卡 · 材料性选择",
  "ui.decisionCard.notApprovalBadge": "非客户批准",
  "ui.decisionCard.recommended": "推荐",

  // ---- 抽屉（shell/Drawer.tsx）----
  "ui.drawer.collapseTitle": "收起（Esc）",

  // ---- 引擎选择（shell/EngineSelect.tsx）----
  "ui.engineSelect.aria": "会话引擎",
  "ui.engineSelect.ariaCurrent": "会话引擎，当前 {title}",

  // ---- 输入区（shell/Composer.tsx）----
  "ui.composer.readFileFailed": "读取文件失败",
  "ui.composer.currentRole": "当前角色",
  // 可见分组标题（B1；桌面UI 接线：.composer-trust 分组标题）
  "ui.composer.trustGroupTitle": "托管",
  "ui.composer.emptyMessageHint": "请输入消息内容；图片会随消息一起发送。",
  "ui.composer.sendChannelUnavailable": "发送通道不可用（当前版本未提供）。",
  "ui.composer.imageCount": "（图片 ×{count}）",
  "ui.composer.sendFailed": "发送失败",
  "ui.composer.sendExceptionPrefix": "发送异常：",
  "ui.composer.sendFailedPrefix": "发送失败：",
  "ui.composer.sendNotReturned": "发送调用未正常返回，实际轮次结果尚未报告。",
  "ui.composer.queuedPosition": "已入队：等它完成当前任务后处理（第 {position} 位）。",
  "ui.composer.stopFailedPrefix": "停止失败：",
  "ui.composer.stopRequested": "已请求停止当前轮次——轮次仍会以收尾事件结束。",
  "ui.composer.imageFallbackName": "图片",
  "ui.composer.pickChannelUnavailable": "当前版本未提供选图通道。",
  "ui.composer.pickFailedNoData": "选图失败：未收到图片数据。",
  "ui.composer.pickFailedPrefix": "选图失败：",
  "ui.composer.readImageFailedPrefix": "读取图片失败：",
  "ui.composer.attachValidationUnavailable": "当前版本未提供附件校验通道。",
  "ui.composer.pastedImage": "粘贴的图片",
  "ui.composer.imageValidationFailedPrefix": "图片校验失败：",
  "ui.composer.imageValidationFailed": "图片校验失败。",
  "ui.composer.imageOnly": "只支持图片文件（png / jpeg / webp / gif）。",
  "ui.composer.removeImage": "移除图片",
  "ui.composer.placeholderToRole": "给{role}发送消息…",
  "ui.composer.placeholderSelectRole": "选择角色后发送消息…",
  "ui.composer.ariaMessage": "发送给当前角色的消息",
  "ui.composer.addImage": "添加图片（png / jpeg / webp / gif，≤5MB）",
  "ui.composer.addImageUnavailable": "当前版本未提供选图通道",
  "ui.composer.ariaAddImage": "添加图片",
  "ui.composer.enterHint": "Enter 发送，Shift + Enter 换行",
  "ui.composer.stopTitle": "停止当前轮次",
  "ui.composer.sendWithEnter": "发送（Enter）",
  "ui.composer.sessionNotOpen": "会话未开启：先选择角色并开启会话",
  "ui.composer.ariaSend": "发送",
  "ui.composer.send": "发送",
  "ui.composer.dismissHint": "关闭提示",
  "ui.composer.footerWorking": "Enter 发送，Shift+Enter 换行；发送失败会如实提示。",
  "ui.composer.footerIdle": "选择角色并开启会话后可发送。",
  "ui.composer.writeBoundaryNote": "实际写入导入项目，角色边界外的写入会被拒绝。",

  // ---- view_image 附件标签（下一轮用户提示中的项目图片附件；桌面UI 可选接线）----
  // 客户要求：角色可查看项目内图片证据。view_image 本轮只确认已读取并排队，
  // 图片作为**下一轮用户提示的图片附件**送达同一角色；此标签供该附件展示。
  "ui.viewImage.attachmentLabel": "view_image 附件：{path}",
  // 聊天流缩略图（2026-10-27 客户要求：聊天流显示角色实际查看的那张图）。
  // 路径非法/项目根缺失/加载失败时保留工具行并按原因标注，不显示破图。
  "ui.viewImage.previewNoProject": "项目未加载，无法预览图片。",
  "ui.viewImage.previewPathUnsafe": "目标不是项目内的图片路径，无法预览。",
  "ui.viewImage.previewLoadFailed": "图片加载失败，无法预览。",
  // 放大层（2026-10-27 客户追加：点击缩略图在应用内放大；不导航 file://、不改 CSP）。
  "ui.viewImage.openPreview": "放大查看：{path}",
  "ui.viewImage.lightboxLabel": "图片预览：{path}",

  // ---- 确认卡（shell/ConfirmCard.tsx + chat/confirm-logic.ts）----
  "ui.confirm.shellDenyNote": "点「拒绝」、按 Esc 或关闭本框 = 不放行（不会执行）。",
  "ui.confirm.shellApproveNote":
    "批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。",
  "ui.confirm.recoveryNote": "点「取消」、按 Esc 或关闭本框 = 不执行；仅点「执行」才会执行。",
  "ui.confirm.unknownRole": "(未标识)",
  "ui.confirm.matchedReason": "命中原因：{reason}",
  "ui.confirm.reviewOriginal": "审核原文（内部用语，仅供核查）：{reason}",
  "ui.confirm.suApprovalBadge": "su 审批",
  "ui.confirm.closeNoApprove": "关闭（不放行）",
  "ui.confirm.detailsArgv": "详情（argv / cwd）",
  "ui.confirm.cwd": "工作目录（cwd）",
  "ui.confirm.argv": "规范化参数 argv",
  "ui.confirm.approve": "放行执行",
  "ui.confirm.reject": "拒绝",
  "ui.confirm.actionWithLabel": "动作：{label}（{action}）",
  "ui.confirm.action": "动作：{action}",
  "ui.confirm.proposer": "提议方：{name}",
  "ui.confirm.proposedAt": "提议时间：{time}",
  "ui.confirm.targetItem": "目标条目：{id}",
  "ui.confirm.recoveryTitle": "恢复操作请求",
  "ui.confirm.closeNoExecute": "关闭（不执行）",
  "ui.confirm.targetRole": "目标角色：{role}",
  "ui.confirm.reasonProvided": "原因（提议方提供）：{reason}",
  "ui.confirm.evidenceLabel": "证据（提议方提供，逐字）：",
  "ui.confirm.detailsRecovery": "详情（提议方 / 时间 / 条目）",
  "ui.confirm.execute": "执行",
  "ui.confirm.failedShell":
    "未能回传你的决定（通道未接或异常）——按 fail-closed 不放行；请让角色重新发起。",
  "ui.confirm.expiredRecovery":
    "此确认已失效（应用重启或请求已结束），未获执行——请让提议方重新发起。",
  "ui.confirm.expiredShell": "此确认已失效，未获放行——请让角色重新发起。",
  "ui.confirm.failedRecovery":
    "未能回传你的决定（通道未接或异常）——按 fail-closed 不执行；请让提议方重新发起。",
  "ui.confirm.sourceDispatchWithRole": "派发 · 来自 {roleId}",
  "ui.confirm.sourceDispatch": "派发",
  "ui.confirm.sourceHandbackWithRole": "交付 · 来自 {roleId}",
  "ui.confirm.sourceHandback": "交付",
  "ui.confirm.queueRunning": "进行中",
  "ui.confirm.withdrawn": "已撤回排队消息：{summary}",
  "ui.confirm.withdrawInvalid": "撤回无效：{detail}",
  "ui.confirm.withdrawFailed": "撤回失败：{detail}",
  "ui.confirm.imageTypeUnsupported":
    "图片类型不支持：{type}——只支持 png / jpeg / webp / gif。",
  "ui.confirm.imageTooLarge": "图片过大（> {mb}MB）——请压缩后再发。",

  // ---- 设置面板（shell/SettingsPanel.tsx + chat/runtime-config.ts）----
  "ui.settings.placeholderSet": "已设置，留空则不修改",
  "ui.settings.hide": "隐藏",
  "ui.settings.show": "显示",
  "ui.settings.optionDefault": "留空（平台默认）",
  "ui.settings.rangeOffPreset": "当前值不在预设档位；改为预设档位后保存",
  "ui.settings.secretTag": "机密",
  "ui.settings.statusChecking": "检查中…",
  "ui.settings.statusUnknown": "配置未知",
  "ui.settings.statusMissing": "缺配置",
  "ui.settings.statusConfigured": "已配置",
  "ui.settings.engineSettingsAria": "引擎设置",
  "ui.settings.runtimeConfigCurrent": "{runtime} 配置（当前会话引擎）",
  "ui.settings.runtimeConfig": "{runtime} 配置",
  "ui.settings.panelNote": "配置只影响所选引擎；不会切换当前会话。",
  "ui.settings.pathNotReported": "（保存位置未报告）",
  "ui.settings.saveNote": "保存到仓库根 .env，只修改本引擎字段。",
  "ui.settings.readFailed": "读取配置失败。",
  "ui.settings.incomplete": "{label} 配置不完整，缺：{missing}。请补齐后保存。",
  "ui.settings.advanced": "高级",
  "ui.settings.advancedHint": "以下高级项均可留空；留空 = 使用默认值。",
  "ui.settings.saveToEnv": "保存到 .env",
  "ui.settings.saveNoteTitle": "已保存到 .env（改动键：{keys}）。{tail}{application}",
  "ui.settings.saveNoteShort": "已保存到 .env（改动键 {count} 个）。{tail}{application}",
  "ui.settings.saveNoteNoChanges": "已保存到 .env（改动键 无）。{tail}{application}",
  "ui.settings.stillMissingCount": "必填配置仍缺 {count} 项（见上方）。",
  "ui.settings.stillMissingList": "必填配置仍缺：{keys}。",
  "ui.settings.requiredReady": "必填配置已齐备。",
  "ui.settings.applicationCurrent": "当前配置已应用。",
  "ui.settings.applicationNextSession": "下一次开启会话时应用。",
  "ui.settings.applicationAfterActiveTurn": "当前轮次继续使用原配置；结束后下一次输入应用新配置。",
  "ui.settings.applicationAfterActiveTurnShort": "当前轮次继续使用原配置；下一次输入应用。",
  "ui.settings.applicationUnknown": "配置应用时点未报告。",
  "ui.runtimeConfig.unknownEngine": "未知引擎",
  "ui.runtimeConfig.summaryNotReady": "配置摘要未就绪",
  "ui.runtimeConfig.source.file": "文件",
  "ui.runtimeConfig.source.environment": "环境",
  "ui.runtimeConfig.source.fallback": "回退",
  "ui.runtimeConfig.source.default": "默认",
  "ui.runtimeConfig.sourceUnknown": "来源未报告",
  "ui.runtimeConfig.fieldRequired": "{label} · 必填",
  "ui.runtimeConfig.fieldOptional": "{label} · 可选",
  "ui.runtimeConfig.requiredReady": "{label} 必填配置已齐备。{application}",
  "ui.runtimeConfig.readFailedWithDetail": "读取配置失败：{detail}",
  "ui.runtimeConfig.saveFailed": "保存失败：{detail}",
  "ui.runtimeConfig.saveException": "保存异常：{detail}",
  "ui.runtimeConfig.unknownError": "未知错误",
  "ui.runtimeConfig.saving": "正在保存…",
  "ui.runtimeConfig.readFailedForLabel": "读取 {label} 配置失败，请打开设置检查或重试。",
  "ui.runtimeConfig.checkingLabel": "正在检查 {label} 配置…",
  "ui.runtimeConfig.engineSettingsTitle": "{label} 配置",
  "ui.runtimeConfig.engineSettingsTabTitle": "{label} 设置",
  "ui.runtimeConfig.openEngineSettings": "打开 {label} 设置",

  // ---- 治理面板（shell/GovernancePanel.tsx + chat/governance-view.ts）----
  "ui.governance.checkAndReaccept": "检查并重新接受",
  "ui.governance.establish": "建立治理记录",
  "ui.governance.readingPreview": "正在读取预览…",
  "ui.governance.reacceptPreview": "重新接受治理边界（预览）",
  "ui.governance.upgradePreview": "升级为三权治理模型（预览）",
  "ui.governance.establishPreview": "建立治理记录（预览）",
  "ui.governance.reaccepting": "正在重新接受…",
  "ui.governance.confirmAccept": "确认接受",
  "ui.governance.modelLabel": "治理模型（建立时写入 .ans）：",
  "ui.governance.modelAria": "治理模型",
  "ui.governance.modelToWrite": "将写入的治理模型：{model}",
  "ui.governance.pinObjects": "将 pin 的对象（{pinCount} 项）及角色（{roleCount} 个）：",
  "ui.governance.establishing": "正在建立治理记录…",
  "ui.governance.upgrading": "正在升级…",
  "ui.governance.confirmUpgrade": "确认升级",
  "ui.governance.model.single": "旧模型（su）",
  "ui.governance.model.trio": "三权 · 五角色",
  "ui.governance.modelShort.trio": "三权",
  "ui.governance.status.awaitingCustomer": "等待客户决定",
  "ui.governance.status.inProgress": "进行中",
  "ui.governance.status.blocked": "阻塞",
  "ui.governance.status.escalated": "已升级客户",
  "ui.governance.modelLine": "治理模型：{model}",
  "ui.governance.currentFlow": "当前流程：{flowId}",
  "ui.governance.noRecordBody":
    "本项目有 {roleCount} 个项目角色，但尚无治理记录（.ans/project.json）。项目角色可按各自边界工作；治理角色暂时无法写入。",
  "ui.governance.reasonNotProvided": "原因未提供",
  "ui.governance.recordUnavailable": "治理记录不可用：{reason}；本版不自动覆盖",
  "ui.governance.primaryRole": "主入口角色",
  "ui.governance.noRecordTitle": "尚无治理记录",
  "ui.governance.recordUnavailableTitle": "治理记录不可用",
  "ui.governance.establishHint":
    "与 {roleName} 对话前，请先建立治理记录；也可在终端运行 ans govern <项目目录>。",
  "ui.governance.roleIntro.chief":
    "客户默认入口：管理工作流、调度任务与巡检，接收申请系统通知；不代决、不转发、不审批。角色申请直达客户（应用呈现 / 裁决），结果同时通知幕僚。",
  "ui.governance.roleIntro.product":
    "产品的评审 / 建议 worker；任务只来自幕僚，结果只向幕僚简短汇报；需要客户决定时直接提交申请（应用呈现 / 裁决）。",
  "ui.governance.roleIntro.proposal":
    "通常由产品交接打开；客户也可以直接找我。我只写提案，不批准。",
  "ui.governance.roleIntro.nomination": "客户任命后打开写卡；只按团队计划与任命名单写角色卡与边界，不选择角色、不批准。",
  "ui.governance.roleIntro.schedule": "通常由已接受提案开启流程；只负责排步骤与派发，不批准方案",
  "ui.governance.roleIntro.verification":
    "通常由交付完成后的验收步骤打开；只核对证据、出验收卡，不批准。",
  "ui.governance.mismatch.modified": "{count} 个内容已变更",
  "ui.governance.mismatch.missing": "{count} 个缺失",
  "ui.governance.mismatch.unreadable": "{count} 个不可读",
  "ui.governance.mismatch.someInconsistent": "存在不一致",
  "ui.governance.mismatch.summary":
    "治理记录与盘上边界不一致：共 {pinCount} 条 pin，其中 {diffCount} 个与记录不一致（{detail}）。未确认前，会话不能开启、写入会被拒绝。",
  "ui.governance.mismatch.title": "治理记录与盘上边界不一致",
  "ui.governance.mismatch.note":
    "确认接受后只会刷新 SHA-256 与留痕，不会修改任何边界文件内容。",
  "ui.governance.mismatch.hint": "也可在终端核对 git 历史后再处理。",
  "ui.governance.pin.changed": "{path} — 内容已变更（pin {pinned}… → 现 {actual}…）",
  "ui.governance.pin.missing": "{path} — 文件缺失（无法重新 pin）",
  "ui.governance.pin.unreadable": "{path} — 文件不可读（无法重新 pin）",
  "ui.governance.reacceptPinned": "将重算这 {count} 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。",
  "ui.governance.reacceptWriteLine": "将写入：.ans/project.json、docs/bootstrap-manifest.md",
  "ui.governance.reacceptWarning": "如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。",
  "ui.governance.reacceptSuccess":
    "已重新接受：更新 {updated} 条 pin（共 {total} 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。",
  "ui.governance.reacceptNotWritten": "本次未写入任何文件。",
  "ui.governance.reacceptNoRecord": "没有治理记录；请先建立治理记录。",
  "ui.governance.reacceptInvalidRecord": "治理记录不可用；本版不提供修复。",
  "ui.governance.reacceptNotNeeded": "边界与记录一致，无需重新接受。",
  "ui.governance.reacceptPreviewStale": "预览后边界文件又有变化，已取消本次写入；请重新检查。",
  "ui.governance.reacceptFixFiles": "请先处理上述文件后重试。",
  "ui.governance.reacceptBusy": "上一次操作仍在进行中；本次未写入任何文件。",
  "ui.governance.establishWritePath": "将写入：{path}",
  "ui.governance.establishAdoptExisting": "将采纳既有治理边界文档（不覆盖其内容）。",
  "ui.governance.establishWriteBoundary": "将写入治理边界文档：{path}。",
  "ui.governance.establishBoundaryNotReported": "治理边界文档：（未报告）",
  "ui.governance.establishLegacyBoundary":
    "{path}（旧版 Markdown 边界；将被原样 pin，迁移属后续版本）",
  "ui.governance.establishDeclaration": "不扩大任何角色写边界、不修改任何角色边界文件内容。",
  "ui.governance.establishAlreadyExists": "治理记录已存在；本次未写入任何文件。",
  "ui.governance.establishBusy": "上一次建立仍在进行中；本次未写入任何文件。",
  "ui.governance.establishInvalidRecord": "治理记录不可用；本版不自动覆盖，修复路径待后续版本。",
  "ui.governance.errorCode": "错误码：{code}",
  "ui.governance.noFilesWritten": "未写入任何文件。",
  "ui.governance.modelOption.single": "单模型（single）",
  "ui.governance.modelOption.trio": "三权（trio）",
  "ui.governance.modelChoiceUnwired":
    "当前桌面窗口未接线治理模型选择；本版不能按所选模型建立，按钮已禁用。",
  "ui.governance.trioArtifactsHint":
    "检测到三权产物（docs/proposals / docs/nominations / docs/flows），建议选择 trio；请由你点选。",
  "ui.governance.legacyModelHint": "本项目使用旧治理模型（su）。可升级为三权模型。",
  "ui.governance.migrationLabel": "查看差异 / 升级",
  "ui.governance.migrationPending": "升级入口待本版后续",
  "ui.governance.migrationOpenTitle":
    "打开迁移预览（零写入）；确认后只改 .ans 的 governanceModel 并追加 manifest 记录。",
  "ui.governance.migrationUnwired": "迁移预览与写入尚未接线；本版不可用。",
  "ui.governance.migration.legacyModel": "旧模型",
  "ui.governance.migration.fieldMissing": '（字段缺失，将新增 governanceModel: "trio"）',
  "ui.governance.migration.modelLine": "模型：{from} → {to}",
  "ui.governance.migration.modelField": "将写入 .ans 字段：{field}",
  "ui.governance.migration.manifestAppend": "将追加 manifest 记录：{id}",
  "ui.governance.migration.pinChange": "pin 变更：{item}",
  "ui.governance.migration.pinNoChange": "pin 变更：无（不重算 pin）",
  "ui.governance.migration.retained": "保留文件：{files}",
  "ui.governance.migration.digest": "预览摘要（前 8 位）：{digest}",
  "ui.governance.migration.zeroWrite":
    "预览零写入。确认后只改 .ans 的 governanceModel 并追加 manifest 记录；不重写角色卡/边界/pin/历史会话。",
  "ui.governance.migration.success":
    '已升级为三权治理模型（.ans governanceModel = "trio"）。旧角色卡/边界/pin/历史会话保留。',
  "ui.governance.migration.alreadyTrio": "已是三权治理模型，无需升级；本次未写入任何文件。",
  "ui.governance.migration.noRecord": "没有治理记录（.ans/project.json）；本次未写入任何文件。",
  "ui.governance.migration.blocked": "升级被阻止；本次未写入任何文件。",
  "ui.governance.migration.previewStale": "预览后 .ans 又有变化，已取消本次写入；请重新检查。",
  "ui.governance.migration.busy": "上一次升级仍在进行中；本次未写入任何文件。",
  "ui.governance.migration.invalidRequest": "升级请求无效；本次未写入任何文件。",
  "ui.governance.migration.status": "状态：{status}",
  "ui.governance.migration.writeFailed": "写入阶段失败，可能已写入部分文件，请核对现场。",
  "ui.governance.decisionBadge": "治理决定 · 客户最终批准",
  "ui.governance.intentBadge": "需求确认 · 客户",
  "ui.governance.queueNote": "等待前一个决定",
  "ui.governance.mirrorBadge": "镜像 · 主入口",
  "ui.governance.power.proposal": "提案",
  "ui.governance.power.appointment": "任命",
  "ui.governance.power.appointmentWrite": "任命写卡",
  "ui.governance.power.scheduleWrite": "编排",
  "ui.governance.power.acceptance": "验收",
  "ui.governance.power.intentConfirm": "需求确认",
  "ui.governance.decisionLine.step": "步骤：{stepId}",
  "ui.governance.decisionLine.power": "权力类型：{power}",
  "ui.governance.decisionLine.writePath": "将写路径：{path}",
  "ui.governance.decisionLine.summary": "摘要：{summary}",
  "ui.governance.decisionLine.hash": "哈希：{sha256}",
  "ui.governance.decisionSourceFallback": "发起角色",
  "ui.governance.decisionTitle": "来自 {name} 的治理决定 · 客户最终批准",
  "ui.governance.moreDecisions": "还有 {count} 个决定等待前一个决定",

  // ---- 报告卡（shell/ReportCard.tsx + chat/report-view.ts）----
  "ui.reportCard.viewSource": "查看来源角色文档",
  "ui.reportCard.unsupportedVersion": "不支持此报告版本，未生成成果摘要。",
  "ui.reportCard.sourceLine": "来源 {sourceName} · {origin}",
  "ui.reportCard.title": "任务报告",
  "ui.reportCard.runtimeUnknown": "引擎未知",
  "ui.reportCard.task": "任务 {taskId}",
  "ui.reportCard.taskUnknown": "任务关联未知",
  "ui.reportCard.turn": "轮次 {turnId}",
  "ui.reportCard.turnNotProvided": "轮次未提供",
  "ui.reportCard.excerptLabel": "报告原文摘录",
  "ui.reportCard.folded": "摘要已折叠，完整可用显示副本见下方",
  "ui.reportCard.storage": "报告存储",
  "ui.reportCard.independentAcceptance": "独立验收",
  "ui.reportCard.notConfirmed": "尚未确认",
  "ui.reportCard.disclaimer": "以上为报告或终态记录，不等于独立验收通过。",
  "ui.reportCard.viewFull": "查看完整报告摘要与证据",
  "ui.reportCard.noEvidence": "（未提供证据）",
  "ui.reportCard.receiptHistory": "接收历史",
  "ui.reportCard.targetInput": "目标输入记录",
  "ui.reportCard.targetTurn": "目标轮次结果",
  "ui.reportView.provenance.timestamp": "原时间未保存或不可展示",
  "ui.reportView.provenance.anchorToken": "原定位标记未提供",
  "ui.reportView.provenance.oversize": "原调用身份超出展示预算",
  "ui.reportView.originFormal": "正式交付",
  "ui.reportView.originTerminal": "终态记录",
  "ui.reportView.originUnconfirmed": "来源未确认",
  "ui.reportView.evidenceTruncatedSome": "部分证据显示已截断",
  "ui.reportView.evidenceRedactedSome": "部分证据已净化",
  "ui.reportView.evidenceOmitted": "另有 {count} 条证据因预算省略",
  "ui.reportView.saveError.conflict": "保存内容冲突，不能自动覆盖。",
  "ui.reportView.saveError.invalid": "保存材料无效，不能自动恢复。",
  "ui.reportView.saveError.replayDamaged": "历史记录损坏，不能自动补存。",
  "ui.reportView.saveError.replayChanged": "历史记录已变化，不能自动补存。",
  "ui.reportView.saveError.snapshotExpired": "可补存的会话材料已失效，无法在此补存。",
  "ui.reportView.saveError.provenanceTooLarge": "交付记录超过展示与来源预算，尚未继续投递。",
  "ui.reportView.saveError.textProjectionFailed": "交接显示内容生成失败，尚未交给Provider。",
  "ui.reportView.savedTargetHistory": "接收历史已保存",
  "ui.reportView.savedReport": "报告已保存",
  "ui.reportView.save.sessionOnly": "仅本次会话可见，未启用历史保存。",
  "ui.reportView.save.unsupported": "当前会话无法确认或不支持此保存恢复能力。",
  "ui.reportView.save.historyNotSaved": "本次接收历史未保存；执行状态以上方实际结果为准。",
  "ui.reportView.save.reportNotSaved": "报告尚未保存，暂未继续交付。可补存原报告，无需重新运行任务。",
  "ui.reportView.savingReport": "正在保存报告…",
  "ui.reportView.savingHistory": "正在保存历史…",
  "ui.reportView.save.historyReceiptPending": "尚未取得最终历史回执，处理可能已开始。",
  "ui.reportView.save.reportUnconfirmed": "报告保存状态未确认。",
  "ui.reportView.retryHistory": "重试保存历史",
  "ui.reportView.retryReport": "重试保存报告",
  "ui.reportView.retryNote": "补存已有记录，不再次执行或投递。",
  "ui.reportView.turnStatus.timedOut": "运行超时",
  "ui.reportView.history.unconfirmed": "未确认",
  "ui.reportView.history.saved": "已保存",
  "ui.reportView.history.disabled": "未启用历史保存",
  "ui.reportView.history.notSaved": "尚未保存",
  "ui.reportView.history.maybeStarted": "可能已开始，结果未确认",
  "ui.reportView.history.notHandedToProvider": "尚未交给Provider",
  "ui.reportView.batch": "交付 · 本批 {count} 份（不表示全部收齐）",
  "ui.reportView.modelInputMissing": "此处未记录完整模型输入",
  "ui.reportView.displayTruncated": "显示副本已截断",
  "ui.reportView.summaryTruncated": "摘要已截断",
  "ui.reportView.replicaMissing": "交接内容安全显示副本未提供，不能显示完整模型输入。",
  "ui.reportView.taskRequestLabel": "任务请求原文",
  "ui.reportView.replyOriginalLabel": "本轮角色回复原文（展开）",
  "ui.reportView.deliveryReplyLabel": "本轮交付处理回复原文（展开）",
  "ui.reportView.projection.reportUnreadable": "报告记录不可读（{count} 条）",
  "ui.reportView.projection.omitted": "省略前 {count} 条历史投影",
  "ui.reportView.projection.invalid": "无效投影条目 {count}",
  "ui.reportView.projection.truncated": "历史投影已截断",
  "ui.reportView.projection.skipped": "原解析跳过 {count} 条",

  // ---- 文档视图（shell/DocumentView.tsx + chat/document-view.ts）----
  "ui.documentView.expired": "文档上下文已失效。",
  "ui.documentView.reading": "正在读取已列文档…",
  "ui.documentView.openReadonly": "只读打开此文档",
  "ui.documentView.unreadable": "当前项目/范围不可读",
  "ui.document.error.invalidRequest": "文档请求无效。",
  "ui.document.error.projectNotGranted": "尚未获得当前项目的文档读取许可，请重新选择项目文件夹。",
  "ui.document.error.projectNotActive": "该项目不是当前项目。",
  "ui.document.error.staleScope": "项目文档列表已失效，请返回当前项目重新选择。",
  "ui.document.error.unknownDocument": "文档引用未知。",
  "ui.document.error.notListed": "该文档已不在可读清单中。",
  "ui.document.error.outsideProject": "该文件不在当前项目允许的阅读范围。",
  "ui.document.error.symlinkNotAllowed": "符号链接文档不可读取。",
  "ui.document.error.notFound": "文档不存在。",
  "ui.document.error.notFile": "该引用不是普通文件。",
  "ui.document.error.unsupportedFormat": "此文档格式暂不支持。",
  "ui.document.error.invalidUtf8": "文档不是有效UTF-8文本。",
  "ui.document.error.binaryContent": "文档包含二进制内容，不能预览。",
  "ui.document.error.tooLarge": "文档超过256KiB，无法在此预览。",
  "ui.document.error.permissionDenied": "没有读取此文档的权限。",
  "ui.document.error.changedDuringRead": "读取期间文档发生变化，请重新选择。",
  "ui.document.error.unsupportedEnvironment": "当前环境暂不支持安全读取项目文档。",
  "ui.document.error.ioError": "文档读取失败。",
  "ui.document.error.fallback": "无法读取此文档。",
  "ui.document.readonlyMeta": "只读文档 · {bytes} 字节",
  "ui.document.reading": "正在读取文档…",
  "ui.document.unlisted": "此链接尚未提供阅读入口。",
  "ui.document.empty": "该角色当前没有已列出的可读文档。",
  "ui.document.pickHint": "以下是当前项目中该角色已列出的可读文档，请选择要阅读的文件。",
  "ui.document.sourceTitle": "{roleName} · 来源文档",
  "ui.document.backList": "返回来源文档",
  "ui.document.refresh": "刷新已列文档",
  "ui.document.read": "阅读",
  // ---- 角色资料（shell/ProfilePanel.tsx）----
  "ui.profile.title": "{roleName} · 角色资料",
  "ui.profile.aria": "角色资料，{count} 项进行中或排队",
  "ui.profile.noEntries": "（无条目）",
  "ui.profile.noEntriesParseFailed": "（无条目；解析失败：{detail}）",
  "ui.profile.emptyTitle": "选择角色后查看资料",
  "ui.profile.emptySub":
    "先在左侧选择角色，再从会话头部的“角色资料”或“工作概览”打开对应面板；内容跟随当前角色。",
  "ui.profile.cardTab": "角色卡",
  "ui.profile.emptyCard": "（空）",
  "ui.profile.boundaryTab": "边界条目",
  "ui.profile.changelogTab": "变更记录",
  "ui.profile.noChangelog": "（无 changelog.md）",
  "ui.profile.docsTab": "文档",
  "ui.profile.noDocs": "（无 docs/ 目录或为空）",
  "ui.profile.viewListedDocs": "查看已列文档",
  // 角色根文档展示（2026-10-23 role-root-docs-display S5；方案 §5.5.6）：
  // 4 个必需 key（根文档分组、docs 分组、整节空态、只读打开）+ 3 个可选副标签。
  // 文件名（feature-map.md 等）、`docs/`、`not-applicable` 是路径/内容标识，不翻译。
  "ui.profile.docsGroupRoot": "角色根文档",
  "ui.profile.docsGroupSubdir": "docs/ 目录",
  "ui.profile.noRoleDocs": "（暂无角色文档）",
  "ui.profile.openRootDoc": "只读打开 {name}",
  "ui.profile.rootDoc.featureMap": "功能导航",
  "ui.profile.rootDoc.functionalDescription": "模块视图与代码位置",
  "ui.profile.rootDoc.apiSpec": "接口 / 实现报告",
  "ui.profile.pendingQueue": "待处理 / 队列",
  "ui.queue.title": "{roleName} · 队列",

  // ---- 会话状态徽标（chat/status.ts）----
  "ui.status.label.stopped": "已停止",
  "ui.status.label.closed": "未开启",
  "ui.status.label.idle": "空闲",
  "ui.status.label.working": "工作中",
  "ui.status.label.waitingConfirm": "等待你确认",
  "ui.status.label.error": "错误",
  "ui.status.label.idleRecovered": "空闲（已恢复）",
  "ui.status.title.closed": "尚未开启会话（点它即可开启）",
  "ui.status.title.idle": "会话已开启，当前没有在跑的任务",
  "ui.status.title.working": "有轮次在跑（切走后仍在后台跑的轮次同样计入）或队列有待处理",
  "ui.status.title.waitingConfirm": "有交互请求挂起，等你在会话流里作答",
  "ui.status.title.stopped": "会话已停止（历史保留在界面上；再点开为新会话）",
  "ui.status.title.error": "最近一次轮次或会话以错误结束",
  "ui.status.title.idleRecovered": "句柄未开；聊天流里是该角色恢复出来的历史记录",
  "ui.status.title.unknown": "未知状态（保守占位）",
  "ui.status.pendingCount": "{count} 待处理",
  "ui.status.queueNote.enqueued": "另有 {count} 项已入队，当前任务完成后依次处理",
  "ui.status.queueNote.pending": "另有 {count} 项待处理在队列中（完成后依次处理）",

  // ---- 聊天行（chat/ChatRow.tsx + chat/chat-store.ts）----
  "ui.chatRow.noFileTarget": "无文件目标",
  "ui.chatRow.timeNotRecorded": "未记录",
  "ui.chatRow.legacyStatusSource": "状态来源：旧文本分类，不是新机器执行事实",
  "ui.chatRow.legacyClassification": "旧文本分类，不是新机器执行事实",
  "ui.chatRow.unsupportedDetail": "不支持此详情版本。",
  "ui.chatRow.noDetails": "这条历史没有保存更多目标和错误详情。",
  "ui.chatRow.actualCommand": "实际命令",
  "ui.chatRow.targetFile": "目标文件",
  "ui.chatRow.noFileTargetDetail": "本次调用无文件目标（交互/派发类工具）",
  "ui.chatRow.message": "消息",
  "ui.chatRow.error": "错误",
  "ui.chatRow.result": "结果",
  "ui.chatRow.exitCode": "退出码：{code}",
  "ui.chatRow.signal": "信号：{signal}",
  "ui.chatRow.stdout": "标准输出",
  "ui.chatRow.stderr": "标准错误",
  "ui.chatRow.duration": "耗时：{ms} ms",
  "ui.chatRow.budgetOmitted": "部分展示内容因预算省略",
  "ui.chatRow.nonTextResult": "非文本结果未展示",
  "ui.chatRow.unsupportedInput": "未支持的输入未展示",
  "ui.chatRow.timeNotSaved": "时间未保存",
  "ui.chatRow.operationNotApproved": "操作未放行",
  "ui.chatRow.targetNotRecorded": "目标未记录",
  "ui.chatRow.choose": "请选择",
  "ui.chatRow.confirm": "请确认",
  "ui.chatRow.preview": "预览内容",
  "ui.chatRow.submit": "提交",
  "ui.chatRow.confirmAction": "确认",
  "ui.chatRow.rejectAction": "拒绝",
  "ui.chatRow.turnEnded": "本轮结束",
  "ui.chatRow.judgeDetails": "详情（命令原文 / 理由 / 证据）",
  "ui.chatRow.commandOriginal": "命令原文",
  "ui.chatRow.customerMessage": "客户说明：{message}",
  "ui.chatRow.customerMessageNote": "客户说明由系统整理。",
  "ui.chatRow.evidence": "证据",
  "ui.chatRow.hardDenyOverride": "hardDenyOverride：true（deny 档被自动代理放行）。",
  "ui.chatRow.durationStat": "耗时 {ms}ms",
  "ui.chatRow.readCalls": "读取 {count} 次",
  "ui.chatRow.readBytes": "{bytes} 字节",
  "ui.chatRow.decisionDetails": "详情（判断理由 / 选中项 / 证据）",
  "ui.chatRow.perPath": "逐路径结论",
  "ui.chatRow.pathResult": "{path}：{result}",
  "ui.chatRow.allowed": "允许",
  "ui.chatRow.denied": "拒绝",
  // ---- 客户投影状态（A3：clientProjection.statusCode → 文案映射；桌面UI 接线）----
  "ui.projection.status.completed": "已完成",
  "ui.projection.status.failed": "失败",
  "ui.projection.status.aborted": "已中止",
  "ui.projection.status.timedOut": "已超时",
  "ui.projection.status.unknown": "未知",
  "ui.projection.status.internalFeedback": "内部反馈",
  "ui.chatStore.context.opened": "会话已开启",
  "ui.chatStore.context.projectLoadFailed": "项目加载失败",
  "ui.chatStore.context.primaryNoSession": "主入口 · 尚未开启会话",
  "ui.chatStore.context.opening": "正在开启或恢复会话…",
  "ui.chatStore.context.notConnected": "未连接主进程",
  "ui.chatStore.context.channelUnavailable": "会话通道不可用",
  "ui.chatStore.error.noDesktopBridge": "当前环境未提供桌面通道",
  "ui.chatStore.error.noSessionChannel": "当前版本未提供会话通道",
  "ui.chatStore.openFailed": "会话开启失败",
  "ui.chatStore.openFailedWithReason": "开启会话失败：{reason}",
  "ui.chatStore.context.continues": "会话继续使用现有上下文",
  "ui.chatStore.context.recovered": "已从本地恢复模型上下文",
  "ui.chatStore.context.recoveryFailed": "恢复失败，当前为新会话",
  "ui.chatStore.context.newSession": "新会话",
  "ui.chatStore.context.sourceUnreported": "上下文来源未报告",
  "ui.chatStore.context.historyFailed": "历史读取失败",
  "ui.chatStore.context.engineSwitched": "已切换引擎；点角色重新开启会话",
  "ui.chatStore.replayFailed": "会话记录读取失败，未回放：{detail}",
  "ui.chatStore.historyRetainedSuffix": "；可读历史保留，模型未恢复",
  "ui.chatStore.context.historyRecovered": "会话记录已恢复",
  "ui.chatStore.error.operatorChannelMissing": "operatorRespond 通道未接",
  "ui.chatStore.operatorChannelNotAccepted": "通道未受理",
  "ui.chatStore.context.openingSession": "正在开启会话…",
  "ui.chatStore.context.openedBackground": "会话已开启；后台正在工作，暂无可见消息",
  "ui.chatStore.toolNotApproved": "{toolName} 未放行",
  // ---- 聊天流（chat/ChatStream.tsx）----
  "ui.chatStream.withdrawUnavailable": "撤回无效：当前版本未提供撤回通道。",
  "ui.chatStream.running": "进行中",
  "ui.chatStream.queuePosition": "第 {position} 位",
  "ui.chatStream.empty.noProjectSub":
    "在左侧点击「导入项目」选择项目根目录；导入后点击任意角色开始聊天。",
  "ui.chatStream.empty.notBootstrappedTitle": "项目尚未 bootstrap",
  "ui.chatStream.empty.notBootstrappedSubWithRole":
    "与 {roleName} 对话，让它把角色建出来；左树会随之长出。",
  "ui.chatStream.empty.notBootstrappedSubPrimary": "与主入口对话，让它把角色建出来；左树会随之长出。",
  "ui.chatStream.empty.noRolesTitle": "该项目下未枚举到角色",
  "ui.chatStream.empty.noRolesSub": "请确认项目包含角色卡目录与治理边界；重新导入项目后重试。",
  "ui.chatStream.empty.selectRoleTitle": "选择角色开始聊天",
  "ui.chatStream.empty.selectRoleSub": "从左侧角色树选择角色；每个角色保留自己的会话历史。",
  "ui.chatStream.empty.startSub": "点下方按钮开启会话；发送消息后，这里会显示对话与工具记录。",
  "ui.chatStream.empty.openedTitle": "会话已开启，可直接输入消息",
  "ui.chatStream.empty.openedSub":
    "发送第一条消息后，这里会显示对话与工具记录。写入由治理引擎把关，越界操作会在对话中直接提示。",
  "ui.chatStream.openingSession": "正在开启与角色 {roleName} 的会话…",
  "ui.chatStream.loadingHistory": "正在载入会话历史…",
  "ui.chatStream.startConversation": "开始与 {roleName} 对话",
  "ui.chatStream.working": "正在工作",
  "ui.chatStream.pendingLocate": "有 {count} 条待确认 · 定位",

  // ---- 工具/事件/推理/链接（chat/tool-summary.ts、events.ts、reasoning.ts、markdown.ts）----
  "ui.tool.status.called": "调用发起",
  "ui.tool.status.denied": "已拒绝",
  "ui.tool.status.failed": "执行失败",
  "ui.tool.status.timedOut": "超时终止",
  "ui.tool.status.completed": "已执行完成",
  "ui.tool.status.completedExit": "已执行完成（退出码 {code}）",
  "ui.tool.status.completedShort": "执行完成",
  "ui.tool.status.returned": "工具返回",
  "ui.tool.status.unknown": "状态未记录",
  "ui.tool.status.recorded": "已记录",
  "ui.tool.status.notApproved": "未放行",
  "ui.tool.status.running": "运行中",
  "ui.tool.status.done": "完成",
  "ui.tool.summary": "本轮 {count} 个调用",
  "ui.tool.summaryWithTools": "本轮 {count} 个调用：{tools}",
  "ui.tool.containsDenied": "含 {count} 条未放行",
  "ui.tool.containsFailed": "含 {count} 条失败",
  "ui.tool.containsUnknown": "含状态未记录",
  "ui.events.target": "目标：{target}",
  "ui.events.timedOut": "已超时",
  "ui.events.systemMessage": "系统消息 · {label}",
  "ui.events.systemNotice": "系统通知",
  "ui.events.systemNoticeWithLabel": "系统通知 · {label}",
  "ui.events.dispatchTask": "派发任务",
  "ui.events.dispatchTaskWithRole": "派发任务 · 来自 {role}",
  "ui.events.handbackDelivery": "交付",
  "ui.events.handbackDeliveryWithRole": "交付 · 来自 {role}",
  "ui.events.handbackLegacy": "交付已收到（旧来源，安全详情未提供）",
  "ui.events.legacyUnknown": "旧/未知系统记录：{summary}",
  "ui.events.historyRecord": "（历史记录）",
  "ui.reasoning.fallbackLabel": "已思考",
  "ui.reasoning.unsafe": "推理内容无法安全显示",
  "ui.reasoning.omitted": "平台省略了思考正文，无法显示具体内容。",
  "ui.reasoning.empty": "没有可显示的思考正文。",
  "ui.reasoning.partial": "平台省略了部分思考正文。",
  "ui.reasoning.thoughtSeconds": "已思考 {seconds} 秒",
  "ui.reasoning.omittedSuffix": "（内容由平台省略）",
  "ui.reasoning.partialSuffix": "（部分内容由平台省略）",
  "ui.markdown.externalUnavailable": "当前环境未提供外部打开通道",
  "ui.markdown.openFailed": "链接未能打开：{detail}",
  "ui.markdown.openFailedChannel": "链接未能打开：通道异常",

  // ---- 操作者交互（chat/operator-view.ts）----
  "ui.operator.kind.choice": "待选择",
  "ui.operator.result.confirm": "已确认。",
  "ui.operator.result.deny": "已回『不同意』（未获同意）。",
  "ui.operator.result.cancel": "已取消（未获同意）。",
  "ui.operator.result.submit": "已提交。",
  "ui.operator.submitting": "已提交，等待主进程受理…",
  "ui.operator.expired": "请求已失效，未获同意。",
  "ui.operator.expiredWithReason": "请求已失效，未获同意。原因：{reason}",
  "ui.operator.expiredRetry": "请求已失效，未获同意。请让角色重新发起。",
  "ui.operator.retryFailed": "回传失败：{detail}——请重试。",

  // ---- 自动代理开关与代批行（chat/judge.ts）----
  "ui.judge.mode.approval": "代审批",
  "ui.judge.mode.decision": "代决策",
  "ui.judge.titleWithRole": "命令审批 · {roleName}",
  // judge shell 确认标题的内置治理角色名（2026-10-24 起 zh-CN 为纯中文角色名）。
  // draft / crew / steward 与 `ui.role.governance.*.name` 逐字相同，复用这 3 个 key；
  // chief / product / verifier 单列 judge key（不改 roleId/GovernanceFunction）。
  "ui.judge.roleName.chief": "幕僚",
  "ui.judge.roleName.product": "产品",
  "ui.judge.roleName.verifier": "质检",
  "ui.judge.titleSu": "SU 命令审批",
  "ui.judge.titleShell": "shell 命令请求",
  "ui.judge.tier.risky": "风险命令（risky）",
  "ui.judge.tier.review": "未自动判定（review）",
  "ui.judge.tier.deny": "硬拒类（deny）",
  "ui.judge.shellOn": "替我审批中 · 自动代理",
  "ui.judge.shellOff": "替我审批",
  "ui.judge.decisionOn": "替我决策中 · 自动代理",
  "ui.judge.decisionOff": "替我决策",
  "ui.judge.bridgeMissing": "当前版本不支持自动判断，保持手动",
  "ui.judge.decisionSingleNote": "旧治理模型（single）不支持代决策",
  "ui.judge.shellOffTitle": "手动逐条确认 shell 命令与 trio 写盘/写卡确认（默认）",
  "ui.judge.shellOnTitle": "自动代理先评估 shell 命令与 trio 写盘/写卡确认；可随时关闭",
  "ui.judge.decisionOffTitle": "手动逐张确认提案接受、任命与验收（默认）",
  "ui.judge.decisionOnTitle": "自动代理先评估提案接受、任命与验收；可随时关闭",
  "ui.judge.warningClose": "知道了",
  "ui.judge.toggleOn.shell":
    "替我审批中：shell 命令与写盘/写卡确认（write / appointment-write / schedule-write）将由自动代理代批。",
  "ui.judge.toggleOn.decision": "替我决策中：提案接受、任命、验收将由自动代理代批。",
  "ui.judge.scopeNote":
    "自动代理只读项目内代码/文档/角色卡（不含 .env、密钥/凭据、.ans 账本/会话、审计日志与项目外），不写文件、不执行命令；只代你「接受/任命/确认/验收」，不会代你拒绝、要求修改或勾选证据不足的候选；不确定、缺证据、读取失败、引擎不可用、超时或解析失败会按所属开关回落逐张卡，由你决定。",
  "ui.judge.quickPathNote":
    "提案快捷路径（accept-quick）默认不代批；旧治理模型（single/su）的治理方向卡仍逐张确认；single 下写盘确认仍逐张手动。",
  "ui.judge.costNote":
    "每次代批会产生一次模型调用（token/延迟）；结果行与审计会标明「judge 代批 · 代审批/代决策」；可能误判，可随时关闭。",
  "ui.judge.toggleFailed": "未能确认自动判断开关（通道异常）；保持原状态。",
  "ui.judge.summaryFallback": "无法概括命令；展开查看原文",
  "ui.judge.alternative": "替代方案：{value}",
  "ui.judge.alternativeWithRationale": "替代方案：{value}（{rationale}）",
  "ui.judge.tierLine": "档位：{tier}",
  "ui.judge.hardDenyNote": "该命令属于硬拒类，自动代理判定必要后放行；请复核",
  "ui.judge.reasonLine": "判断理由：{reason}",
  "ui.judge.approvedHardDeny": "已替你放行（自动代理 · 代审批 · deny 档）",
  "ui.judge.approved": "已替你放行（自动代理 · 代审批）",
  "ui.judge.notApproved": "未放行（自动代理 · 代审批）",
  "ui.judge.hardDenyLabel": "deny 档 · judge 放行",
  "ui.judge.engineText": "判断引擎：{engine}",
  "ui.judge.closeAndRetry":
    "可关闭「替我审批」后重试（改为手动确认），或按替代方案调整命令。",
  "ui.judge.headline.acceptProposal": "接受提案（{selected}）",
  "ui.judge.headline.acceptance": "验收通过（{selected}）",
  "ui.judge.headline.appointment": "任命 {selected}",
  "ui.judge.headline.appointmentNotReported": "任命（未报告选中项）",
  "ui.judge.headline.writeConfirm": "确认写入 {count} 个路径（{paths}{tail}）",
  // 路径 > 3 的完整标题（替代运行时拼接「 等 N 个」；en 不再混入中文 tail）。
  "ui.judge.headline.writeConfirmOverflow": {
    other: "确认写入 {count} 个路径（{paths} 等 {count} 个）",
  },
  "ui.judge.headline.writeNotReported": "确认写入（未报告路径）",
  "ui.judge.headline.autoApproved": "已代批",
  "ui.judge.headline.autoApprovedWithKind": "已代批（{cardKind}）",
  "ui.judge.flowSuffix": " · 流程 {flowId}",
  "ui.judge.titlePrefix": "judge 代批 · {label}",
  // 代批来源与「自动代批 ≠ 客户手批」说明（A0；桌面UI 接线：代批状态卡的来源徽标/说明句）
  "ui.judge.autoSource": "自动代理",
  "ui.judge.autoNotCustomerNote": "自动代批 ≠ 客户手批：本结论由自动代理按治理开关给出，客户保留最终决定权。",
  "ui.judge.selectedLine": "选中项：{items}",
  "ui.judge.pathsLine": "路径：{paths}",
  "ui.judge.flowText": "流程：{flowId}",
  "ui.judge.recovery.stopNote": "停该角色当前轮次；不销毁会话。",
  "ui.judge.recovery.rebuildNote": "重建该角色会话（保留 ANS 回放）；目标正忙时不会执行。",
  "ui.judge.recovery.redeliver": "重新投递",
  "ui.judge.recovery.redeliverNote": "触发该角色投递队列立即重试。",

  // ---- 渲染层 store（stores/*.ts）----
  "ui.drawerStore.noSourceRole": "无法确定来源角色，暂不能列出来源文档。",
  "ui.drawerStore.refreshFailed": "文档清单刷新失败。",
  "ui.drawerStore.withdrawUnavailable": "当前版本未提供撤回通道",
  "ui.governanceStore.previewUnavailable": "预览通道不可用（桌面窗口尚未接线）。",
  "ui.governanceStore.migrationUnavailable": "迁移通道不可用（桌面窗口尚未接线）。",
  "ui.governanceStore.previewFailed": "预览失败。",
  "ui.governanceStore.reacceptUnavailable": "重新接受通道不可用（桌面窗口尚未接线）。",
  "ui.governanceStore.establishUnavailable": "建立通道不可用（桌面窗口尚未接线）。",
  "ui.governanceStore.reacceptFailed": "重新接受失败（主进程未返回 message）。",
  "ui.governanceStore.reacceptEffect":
    "治理角色将在下一轮发送前按新边界重建（若正在运行，下一轮结束后生效）。",
  "ui.governanceStore.establishFailed": "建立失败（主进程未返回 finalize.message）。",
  "ui.governanceStore.cancelled": "已取消，未写入任何文件。",
  "ui.governanceStore.nextStep": "下一步：{step}",
  "ui.governanceStore.stepFallback": "治理步骤",
  "ui.governanceStore.flow": "流程 {flowId}",
  "ui.reportStore.sessionNotAvailable": "当前没有原会话可供保存恢复。",
  "ui.reportStore.unsupported": "当前会话不支持此保存恢复能力。",
  "ui.reportStore.projectNotActive": "项目已失效。",
  "ui.reportStore.scopeMismatch": "保存状态范围不符。",
  "ui.reportStore.statusUnavailable": "无法取得保存状态。",
  "ui.settingsStore.noConfigChannel": "当前环境未提供配置通道",
  "ui.settingsStore.configChannelUnavailable": "当前版本未提供配置通道",
  "ui.settingsStore.saveChannelUnavailable": "当前版本未提供配置保存通道",

  // =====================================================================
  // main.* —— B3 主进程应用生成、最终显示给用户的文本（app/desktop/**）
  // =====================================================================

  // ---- 通用主进程短词 ----
  "main.common.unknownRuntime": "未知运行时。",
  "main.common.unknownRole": "(未知角色)",
  "main.common.reloadInterface": "重新加载界面",
  "main.common.recoveryPageTitle": "界面需要恢复",
  "main.common.recoveryPageHeading": "界面暂时无法显示",
  "main.common.recoveryPageBody": "点击重新加载可恢复界面，已有任务不会自动重发。",

  // ---- 后台任务服务（background tasks）----
  "main.backgroundTasks.unavailable": "后台任务服务不可用",

  // ---- 流程状态服务（flow status；docs/flows/<flowId>.yaml 读取）----
  "main.flowStatus.unavailable": "流程状态服务不可用",
  "main.flowStatus.invalidProject": "无效的项目目录",

  // ---- 会话主流程（session.ts）----
  "main.session.contextRecoveryFailed": "原生上下文恢复失败，已重建上下文。",
  "main.session.rebuiltBoundary":
    "该角色边界已更新或运行时配置已保存（{changed}），已作废旧会话，按新边界重开；上下文恢复结果以引擎实际返回为准。",
  "main.session.rebuiltSkills":
    "该角色已安装技能已变更（{changed}），已作废旧会话，按新技能登记重开；上下文恢复结果以引擎实际返回为准。",
  "main.session.rebuildChangedRuntimeConfig": "运行时配置",
  "main.session.rebuildFailed": "按新边界重开会话失败：{detail}（请重试或点击左侧角色）。",
  "main.session.intentHandoffFailed": "应用无法把意图交给策划：{detail}；未重试",
  "main.session.openProposalFailed": "无法开启策划会话（{detail}）",
  "main.session.sendProposalFailed": "发送任务给策划失败（{detail}）",
  "main.session.proposalQueued": "策划工作中，已排队",
  "main.session.proposalWorking": "已交给策划（工作中）",
  "main.session.intentHandedOff":
    "已把意图「{intentId}」交给策划（handoffKind={handoffKind}）——交接 ≠ 客户批准。",
  "main.session.clarificationEmpty": "澄清问题不能为空；未提交。",
  "main.session.clarificationDisplayFailed": "无法在主入口显示澄清请求；未提交。",
  "main.session.clarificationShown":
    "已在主入口（{roleId}）显示；客户回答后由产品更新意图并交接。",
  "main.session.clarificationDelivery": "策划需要澄清：{question}",
  "main.session.missingProjectOrRole": "缺少项目根或角色 id。",
  "main.session.readyContinue": "会话已就绪，续接当前会话。",
  "main.session.closedClickRole": "会话已关闭，请重新点击角色。",
  "main.session.continuing": "已在该角色的会话中，续接当前会话。",
  "main.session.configAfterTurn": "当前轮次继续使用原配置，新配置在轮次结束后应用。",
  "main.session.boundaryRebuildFailed": "该角色边界已更新，但按新边界重开会话失败：{detail}。请重试。",
  "main.session.projectNotEnumerated": "尚未枚举该项目；请先导入项目（app:list-project）。",
  "main.session.roleNotFound": "项目 {projectRoot} 下未找到角色：{roleId}",
  "main.session.eventStreamError": "会话事件流异常：{detail}",
  "main.session.rebuildFailedNoSend":
    "该角色边界已更新，但按新边界重开会话失败：{detail}——本条消息未发送，请重试。",
  "main.session.notOpen": "会话尚未开启（点击左侧角色即可开启）。",
  "main.session.youMessage": "你：{text}",
  "main.session.stopNoSession": "角色 {roleId} 没有打开的会话——没有可停止的轮次。",
  "main.session.stopUnsupported": "当前运行时不支持停止",
  "main.session.stopNoMatch": "没有匹配的会话，请指定项目与运行时。",
  "main.session.releasedRole": "已关闭与角色 {roleId} 的会话（历史记录保留在界面上）。",
  "main.session.releaseError": "释放会话出错：{detail}",
  "main.session.noOpenSessions": "当前没有打开的会话。",
  "main.session.releaseNoSession": "角色 {roleId} 没有打开的会话。",
  "main.session.closed": "会话已关闭。",
  "main.session.closedAll": "已关闭全部会话（{count} 个）。",
  "main.session.recoveryDelivery": "恢复投递 · 来自 {role}",
  "main.session.withdrawIncomplete": "撤回参数不完整。",
  "main.session.withdrawRunning": "该条已进入「进行中」，撤回无效（它正在被执行）。",
  "main.session.withdrawNotCustomer": "该条不是客户消息（派发/交付属治理流）——只读，不可撤回。",
  "main.session.withdrawNotQueued": "该条不在排队中（可能已投递或已撤回）。",
  "main.session.safeCopyPending": "交接内容（安全显示副本）：等待生成",
  "main.session.saveSnapshotExpired": "原保存材料已失效。",
  "main.session.saveUnsupported": "当前会话不支持此保存操作。",
  "main.session.handbackMalformed":
    "收到一条**形状不符**的交付事件（缺交付载荷 / 缺 roleId）——**未投递**（如实忽略；不崩、不静默）。",
  "main.session.handbackRenderFailed":
    "交付载荷无法渲染（{detail}）——**未投递**（如实忽略；不崩）。",
  "main.session.handbackException": "交付处理异常已拦截（不产生未捕获拒绝）：{detail}",
  "main.session.dispatchRejectedEmpty": "派发未受理：roleId 与 task 都必须非空。",
  "main.session.dispatchNoDispatcher":
    "派发未受理：未枚举到本项目治理模型下的派发主人（trio=运营 / single=主入口）——**未投递**。",
  "main.session.dispatchNoDispatcherShort": "派发未受理：未枚举到派发主人——**未投递**（不静默）。",
  "main.session.dispatchModelNote": "（trio：运营或产品）",
  "main.session.dispatchWrongSource":
    "派发未受理：来源角色 {from} 不是本项目派发主人 {dispatcher}{modelNote}。",
  "main.session.dispatchWrongSourceShort":
    "派发未受理：来源角色 {from} 不是派发主人 {dispatcher}——**未投递**（不静默）。",
  "main.session.dispatchUnknownTarget": "派发未受理：角色 {roleId} 不在本项目（未枚举到）。",
  "main.session.dispatchUnknownTargetShort":
    "派发未受理：角色 {roleId} 不在本项目——**未投递**（不静默）。",
  "main.session.dispatchBuiltinTarget":
    "派发未受理：{roleId} 是内置治理角色（trio 三人与 su 均不可被派发）——派发对象应是项目角色。",
  "main.session.dispatchBuiltinTargetShort":
    "派发未受理：{roleId} 是内置治理角色——**未投递**（不静默）。",
  "main.session.dispatchGateDenied": "派发被治理门禁拒绝：{message}",
  "main.session.dispatchGateRejected":
    "派发未受理（治理门禁 {code}）：{message}——**未投递**（不静默）。",
  "main.session.dispatchDuplicateCoordinate":
    "该协调消息（目标 {roleId}，同内容/流程）已在投递队列中——已去重，不重复投递。",
  "main.session.dispatchDuplicate":
    "该派发（目标 {roleId}，同任务文本/流程步骤）已在投递队列中——已去重，不重复投递。",
  "main.session.dispatchSummaryCoordinate": "协调 · 来自 {from} → {to}：{text}",
  "main.session.dispatchSummary": "派发 · 来自 {from}：{text}",
  "main.session.sessionWillAutoOpen": "（其会话未开——将自动开启）",
  "main.session.acceptedCoordinate":
    "已受理：协调消息将投递给 {to}{openNote}（来源 {from} → 运营；协调 ≠ 客户批准，不解除任何派发/验收门禁；受理≠已完成）。",
  "main.session.acceptedTask":
    "已受理：任务将投递给角色 {to} 的会话{openNote}；投递结果/失败会在其聊天流与 {from} 的聊天流如实显示（受理≠已完成）。",
  "main.session.recoveryNoMatch": "未找到匹配的会话（请指定项目与运行时）。",
  "main.session.recoveryNoSession":
    "该角色没有打开的会话——无可重建的会话（可先在界面点开该角色，或改用其他动作）。",
  "main.session.recoveryBusy": "该角色有轮次在跑——不打断（可先 abort-turn 停止本轮，或等其结束后重试）。",
  "main.session.recoveryConcurrent": "会话状态已变化（并发开启/重建）——本次重建未执行，请核对后重试。",
  "main.session.rebuiltByRecovery":
    "已按要求（客户确认的恢复动作）重建角色 {roleId} 的会话（保留 ANS 回放）；上下文恢复结果以引擎实际返回为准。",
  "main.session.redeliverNoMatch": "未找到匹配的会话/队列（请指定项目与运行时）。",
  "main.session.redeliverInFlight":
    "该条目已进入「进行中」（正在投递/执行）——无需重投（其收尾按既有 settled 语义）。",
  "main.session.redeliverNotQueued": "条目不在排队中（可能已投出、已撤回或 id 不符）——未触发重试。",
  "main.session.redeliverQueued":
    "已触发队列重试；该条目仍在队列第 {position} 位（目标忙或未开——保留待重试，下次时机自动再试）。",
  "main.session.redeliverSent": "已触发队列重试；该条目已出队投出（进行中）。",
  "main.session.redeliverGone": "已触发队列重试；该条目已不在队列（已在本次重试中投出，或已被处理/撤回）。",
  "main.session.redeliverCleared": "已触发队列重试；队列已清空，该角色的投递已在途（进行中）。",
  "main.session.redeliverEmpty": "已触发队列重试；该角色的投递队列已空。",
  "main.session.redeliverRemaining":
    "已触发队列重试；仍有 {count} 条在队列（目标忙或未开——保留待重试），{inflight}。",
  "main.session.redeliverInFlightOne": "1 条在途",
  "main.session.redeliverNoInflight": "无在途",
  "main.session.recoveryProposalRejected": "恢复提议未受理：{message}",
  "main.session.recoveryRoleEmpty": "roleId 必须非空。",
  "main.session.recoveryBadAction":
    "action 必须是 abort-turn / rebuild-session / redeliver（收到 {type}）。",
  "main.session.recoveryMissingEvidence": "evidence（证据）必须非空——恢复动作必须有事实依据。",
  "main.session.recoveryTargetMissing": "角色 {roleId} 不在本项目（未枚举到）——未推送任何确认卡。",
  "main.session.recoveryTargetBuiltin":
    "{roleId} 是内置治理角色——恢复动作只针对项目角色（未推送任何确认卡）。",
  "main.session.recoveryAbortRequested":
    "已请求停止角色「{roleId}」的当前轮次——轮次仍以既有 settled 收尾（不制造「已停止」假象）。",
  "main.session.recoveryAbortFailed": "停止失败（未知原因）——未假装已执行。",
  "main.session.recoveryRebuilt":
    "角色「{roleId}」的会话已重建（保留历史回放；上下文恢复结果以引擎实际返回为准）。",
  "main.session.recoveryRebuildFailed": "重建失败（未知原因）——没有任何动作发生。",
  "main.session.recoveryChannelUnwired":
    "恢复确认通道未接线——未获执行（fail-closed），没有任何动作发生。",
  "main.session.recoveryDeclined":
    "客户未确认（拒绝/取消，或确认通道失效）——「{action}」没有执行，也没有任何动作发生。",
  "main.session.recoveryReceipt": "恢复回执（{action} · 角色 {roleId}）：{message}",
  "main.session.recoveryAutoText":
    "[系统·恢复] 恢复提议由桌面**自动执行**（「替我决策」开关开启——自动执行 ≠ 客户逐项批准）：{action} · 角色 {roleId} · {executed}。",
  "main.session.recoveryAutoSummary": "系统·恢复 · 自动执行 · {action} · 角色 {roleId} · {executed}",
  "main.session.executed": "已执行",
  "main.session.notExecuted": "未执行",
  "main.session.configNextSession": "该角色当前没有打开的会话（并非在跑轮次）——新会话打开即生效。",
  "main.session.install.notCustomerTurn": "本动作仅可在客户消息发起的轮次执行——未执行。",
  "main.session.install.roleNotFound":
    "角色「{roleId}」不是本项目项目角色（或为内置治理角色）——未执行。",
  "main.session.install.skillNotRegistered":
    "技能未登记：docs/skills/{name}/install.md 不存在——先落盘再{verb}；未执行。",
  "main.session.install.skillNotRegisteredInstall":
    "技能未登记：docs/skills/{name}/install.md 不存在——先落盘再安装；未执行。",
  "main.session.install.skillNotRegisteredUninstall":
    "技能未登记：docs/skills/{name}/install.md 不存在或不可解析——没有可撤销的登记；未执行。",
  "main.session.install.roleNotListed":
    "登记中未包含角色「{roleId}」——未执行；如确要安装请先更新登记。",
  "main.session.install.skillStatus":
    "技能未登记为已安装：docs/skills/{name}/install.md 状态为「{status}」——先改登记再安装；未执行。",
  "main.session.install.registrationUnchanged": "登记仍含角色「{roleId}」——先改登记再卸载；未执行。",
  "main.session.install.skillMissing":
    "技能内容缺失：{path} 不存在或不可读——先落盘再安装；未执行。",
  "main.session.install.skillMissingUninstall":
    "技能内容缺失：{path} 不存在或不可读——无法如实回执（sha256 与「文件保留」陈述）；未执行。",
  "main.session.install.rebuildFailed":
    "技能登记已{action}，但按新登记重建角色「{roleId}」的会话失败：{detail}——登记仍在、会话未重建（未假装已生效；可在该角色下一次打开会话时生效，或重试）。",
  "main.session.install.effectiveRebuilt": "已重建该角色会话、即刻生效",
  "main.session.install.effectiveNextSession": "该角色当前未打开会话——新会话起生效",
  "main.session.install.effectiveAfterTurn": "该角色正在运行轮次（不打断）——新会话起生效",
  "main.session.install.installedSkill":
    "已安装技能「{name}」→ 角色「{roleId}」；{effective}；内容：{path}（sha256 {digest}）。",
  "main.session.install.uninstalledSkill":
    "已卸载技能「{name}」（角色「{roleId}」）；效果已撤，文件保留于 {path}（sha256 {digest}）；{effective}。",
  "main.session.install.summarySkill": "系统·安装 · 已{verb}技能「{name}」· 角色「{roleId}」· {effectiveShort}",
  "main.session.install.effectiveShortRebuilt": "即刻生效（已重建）",
  "main.session.install.effectiveShortNextSession": "新会话起生效",
  "main.session.install.mcpNotRegistered":
    "MCP 未登记：docs/mcp/{name}.md 不存在——先落盘再{verb}；未执行。",
  "main.session.install.mcpNotRegisteredInstall": "MCP 未登记：docs/mcp/{name}.md 不存在——先落盘再安装；未执行。",
  "main.session.install.mcpNotRegisteredUninstall":
    "MCP 未登记：docs/mcp/{name}.md 不存在或不可解析——没有可撤销的声明；未执行。",
  "main.session.install.mcpStatus":
    "MCP 未登记为已安装：docs/mcp/{name}.md 状态为「{status}」——先改声明再安装；未执行。",
  "main.session.install.mcpDeclarationMissing":
    "MCP 未登记：{path} 不存在——先落盘再安装；未执行。",
  "main.session.install.mcpDeclarationMissingUninstall":
    "MCP 声明缺失：{path} 不存在或不可读——无法如实回执（sha256 与「文件保留」陈述）；未执行。",
  "main.session.install.mcpRebuildFailed":
    "MCP 声明已{action}，但按新声明重建角色「{roleId}」的会话失败：{detail}——声明仍在、会话未重建（未假装已生效；可在该角色下一次打开会话时生效，或重试）。",
  "main.session.install.installedMcp":
    "已安装 MCP「{name}」→ 角色「{roleId}」；{effective}；声明：{path}（sha256 {digest}）；外来 MCP 工具在 ANS 门禁之外执行（能力级授予，非逐调用受审）。",
  "main.session.install.uninstalledMcp":
    "已卸载 MCP「{name}」（角色「{roleId}」）；效果已撤，声明文件保留于 {path}（sha256 {digest}）；已发生的副作用不可撤；{effective}。",
  "main.session.install.summaryMcp": "系统·安装 · 已{verb}MCP「{name}」· 角色「{roleId}」· {effectiveShort}",
  "main.session.install.verbInstall": "安装",
  "main.session.install.verbUninstall": "卸载",
  "main.session.delivery.malformedItem": "投递条目形状不符（缺正文/来源）——已丢弃该条并如实记行（不崩）。",
  "main.session.delivery.machineryException": "投递机异常已拦截（不产生未捕获拒绝）：{detail}",
  "main.session.delivery.noTarget":
    "有{kind}（来自 {sourceRoleId}）待投递，但当前枚举不到目标（主入口角色）——**未投递**（已保留；下次时机自动重试）。",
  "main.session.delivery.openFailedHandback":
    "有交付（来自 {sourceRoleId}）待投递，但**开启 {target} 会话失败**：{detail}——未投递（已保留；下次时机自动重试：你打开 {target}、或下一次交付/一轮结束）。",
  "main.session.delivery.openFailedDispatch":
    "有派发任务（来自 {sourceRoleId}）待投递给角色 {target}，但**开启其会话失败**：{detail}——未投递（已保留；下次时机自动重试：你打开该角色、或下一次派发/一轮结束）。",
  "main.session.delivery.handbackBatch": "交付批次 · {count} 份报告 · 来自 {roles}",
  "main.session.delivery.autoDelivered":
    "已将 {roles} 的交付自动投递给 {target}（等待验收与汇总）。",
  "main.session.delivery.dispatchedNote":
    "已派发任务给 {target}（已投递到其会话；其结果/交付会回到本会话）。",
  "main.session.delivery.receivedDispatch":
    "已接收来自 {role} 的派发任务——请按任务文本执行，完成后交回报告。",
  "main.session.delivery.handbackFailed":
    "交付投递失败（来自 {sourceRoleId}）：{detail}——未丢弃，已保留待重试（下次时机自动重试）。",
  "main.session.delivery.handbackFailedShort": "交付投递失败（来自 {sourceRoleId}）：{detail}",
  "main.session.delivery.dispatchFailed":
    "派发投递失败（目标 {target}）：{detail}——**未丢弃**，已保留待重试（下次时机自动重试）。",
  "main.session.delivery.systemFailed":
    "系统消息投递失败（目标 {target}）：{detail}——**未丢弃**，已保留待重试（下次时机自动重试）。",
  "main.session.delivery.queuedFailed":
    "排队消息投递失败（角色 {target}）：{detail}——**未丢弃**，已保留待重试（下次时机自动重试）。",
  "main.session.delivery.maybeProcessed": "可能已经处理或保存状态未知，未自动重发；可核对历史保存状态。",
  "main.session.delivery.retained": "输入尚未交给模型，未丢弃，已保留同一批次待重试。",

  // ---- 沙箱/图片/历史/项目/运行时错误（interface.ts 等）----
  "main.interface.toggleInvalid": "开关请求无效（需 {enabled:boolean}）。",
  "main.interface.toggleNotBoolean": "enabled 必须为布尔值。",
  "main.interface.toggleUnknownField": "开关请求含未知字段。",
  "main.interface.teamPlanMissingTypeColumn": "团队计划角色表缺少「类型」列（须标 new / changed / existing）",
  "main.interface.teamPlanNoSchemaV2":
    "团队计划未声明 teamPlanSchema: 2：按 v1 兼容校验（不强制模块/公开契约/测试面等 v2 字段；建议迁移团队计划 v2）",
  "main.interface.teamPlanNoFrontmatter": "团队计划缺少 frontmatter（须含 flowId/version/riskTier/recommended）",
  "main.interface.teamPlanNoFlowId": "团队计划 frontmatter 缺少 flowId",
  "main.interface.teamPlanNoRecommended":
    "团队计划缺少唯一的机器可读推荐集（recommended 内联数组或「推荐：」行；空集/重复/歧义不接受）",
  "main.interface.verifierFinished":
    "验收复核已结束（flowId={flowId}）；报告见 {report}（附件见 docs/verification/）与 {governance}；验收卡/客户决定由应用继续（本行不构成验收结论或客户批准）。",
  "main.interface.acceptanceCloseFailed":
    "验收已通过但流程收口失败（流程 {flowId}）：{detail}；未派质检，流程保持待收口（请核对 flow YAML）。",
  "main.interface.acceptanceClosed":
    "验收已通过（判断代批或客户手批，以账本 customer.decision 为准），流程 {flowId} 已收口（保留验收步骤已标 done）。",
  "main.interface.deliveredStepsHeader": "流程 {flowId}：以下步骤已 delivered，等待运营核证：",
  "main.interface.deliveredStepLine":
    "- 步骤 {stepId} 已 delivered（owner={owner}），请核对账本/产物证据，用 flow_step_update 标 done 或退回修正；不要直接写 flow YAML。",
  "main.interface.deliveredVerificationNote":
    "核证要求：先核对账本与产物证据再更新步骤状态；未达 done 条件请退回修正；不要直接 write_file 流程 YAML。",
  "main.interface.deliveredWaitNote":
    "流程 {flowId}：步骤 {steps} 已 delivered，等待运营核证（已投核证任务）。",
  "main.interface.criteriaMissing": "实施前验收标准缺失或为空（{path}）；未派质检判定",
  "main.interface.changePackageMissing": "变更包缺失（{path}）；未派质检判定",
  "main.interface.changePackageNoRisk": "变更包缺少 riskTier（T0–T3）：{path}；未派质检判定",
  "main.interface.flowValidationFailed": "流程状态 YAML 校验失败：{detail}",
  "main.interface.advanceOpenFailed": "收尾推进失败：无法开启质检会话：{detail}；未自动重试。",
  "main.interface.advanceSendFailed": "收尾推进失败：发送验收任务给质检失败：{detail}；未自动重试。",
  "main.interface.piBusy": "Pi 的旧轮次仍在执行，新配置将在其结束后应用。消息可继续排队。",
  "main.interface.readFileNotFound": "文件不存在",
  "main.interface.readFileFailed": "读取失败：{detail}",
  "main.interface.teamPlanMissingUnreadable":
    "团队计划缺失或不可读（账本 appointment 已绑定该计划）；请运营重新写出计划后再校验",
  "main.interface.teamPlanMissingLegacy": "团队计划缺失：按 legacy 流程只做最低结构检查（建议迁移 team-plan / role-cards 流程）",
  "main.interface.teamPlanRoleMissing": "团队计划缺少推荐/任命角色 {roleId} 的角色行",
  "main.interface.teamPlanRoleTypeInvalid":
    "团队计划角色 {roleId} 的类型缺失或不可识别（须为 new / changed / existing）",
  "main.interface.teamPlanRoleFieldEmpty": "团队计划角色 {roleId} 的「{label}」为空（计划缺细节）",
  "main.interface.teamPlanFlowMismatch": 'frontmatter flowId="{planFlowId}" 与流程 {flowId} 不一致',
  "main.interface.cardEmpty": "文件为空（需要角色卡正文）",
  "main.interface.cardNoHeading": "缺少 Markdown 标题（至少一行以 # 开头）",
  "main.interface.cardMissingSection": "缺少「{label}」章节或等价内容（第 5 项必填）",
  "main.interface.boundaryEmpty": "文件为空（需要 role + entries 的边界 YAML）",
  "main.interface.boundaryParseFailed": "边界 YAML 解析失败：{detail}",
  "main.interface.boundaryNoEntries": "entries 为空（Section 1 至少需要一条条目）",
  "main.interface.boundaryRoleMismatch":
    "顶层 role 与目录 id 不一致（YAML role={declared}，目录={roleId}）",
  "main.interface.boundaryDeclaredMissing": "未提供",
  "main.interface.boundaryMissingRootDocs": "entries 缺少角色根工作文档条目 {path}（第 5 项必填）",
  "main.interface.boundaryOnlyRootDocs":
    "entries 仅含角色根工作文档条目，未见团队计划的实际写集条目（请核对计划写集）",
  "main.interface.directorySpecMissing":
    "团队计划角色 {roleId} 的授权目录「{path}」缺少目录规范行（计划问题：请运营补齐目录规范）",
  "main.interface.moduleImplMissing":
    "团队计划模块「{module}」缺少实现目录，无法核对边界更宽部分（计划问题：请运营补充实现目录）",
  "main.interface.authorizedDirNotCoveredExisting":
    "计划授权目录「{path}」未被 boundary.yaml entries 覆盖（existing：仅提醒，不阻塞；迁移提示：下次实质变更时补齐目录条目）",
  "main.interface.authorizedDirNotCovered":
    "计划授权目录「{path}」未被 boundary.yaml entries 覆盖（人事：按团队计划把该目录加入 Section 1；若计划目录本身有误，报告运营修正计划）",
  "main.interface.precisePathNotCoveredExisting":
    "计划精确写集「{path}」未被 boundary.yaml entries 覆盖（existing：仅提醒，不阻塞；迁移提示：下次实质变更时补齐）",
  "main.interface.precisePathNotCovered":
    "计划精确写集「{path}」未被 boundary.yaml entries 覆盖（人事：按团队计划把该文件加入 Section 1；若计划本身有误，报告运营修正计划）",
  "main.interface.boundaryDirWider":
    "boundary.yaml 目录条目「{path}」{wider}（new 角色边界目录必须与计划授权目录一致，不得更宽/更窄；人事收窄边界或报告运营修正计划）",
  "main.interface.boundaryDirWiderWord": "比计划授权目录更宽",
  "main.interface.boundaryDirNotInPlan": "不在计划授权目录集合中",
  "main.interface.boundaryMissingAuthorizedDir":
    "boundary.yaml 缺少计划授权目录「{path}」的目录条目（new 角色边界目录必须与计划授权目录一致，不得更宽/更窄；人事补齐目录条目）",
  "main.interface.boundaryDirWiderExisting":
    "boundary.yaml 目录条目「{path}」比计划授权目录宽（existing：仅提醒，不阻塞；迁移提示：下次实质变更时按 v3 收窄/迁移{extra}）",
  "main.interface.boundaryDirWiderExistingExtra":
    "；且不在角色模块实现目录内，交 readiness 按既有职责复核",
  "main.interface.boundaryDirWiderChanged":
    "boundary.yaml 目录条目「{path}」比计划授权目录宽且不在角色模块实现目录内（changed：交 readiness 按既有职责复核，不硬拒）",
  "main.interface.boundaryWiderMultiModule":
    "boundary.yaml 更宽目录覆盖多个模块实现目录（{modules}；多模块扩张，交 readiness 复核）",
  "main.interface.writesetNotCoveredExisting":
    "计划写集「{path}」未被 boundary.yaml entries 覆盖（existing：仅提醒，不阻塞；下次实质变更时补齐）",
  "main.interface.writesetNotCovered":
    "计划写集「{path}」未被 boundary.yaml entries 覆盖（人事：按团队计划把该路径加入 Section 1；若计划写集本身有误，报告运营修正计划）",
  "main.interface.docEmptyExisting": "文件为空（existing/legacy：仅提醒）",
  "main.interface.docEmpty": "文件为空（需要正文）",
  "main.interface.readErrorExistingSuffix": "（existing/legacy：仅提醒）",
  "main.interface.docNoHeadingExisting": "缺少 Markdown 标题（existing/legacy：仅提醒）",
  "main.interface.featureMapNoContent": "既无功能表/列表行，也未声明无直接负责的系统功能",
  "main.interface.functionalDescriptionMissing": "缺少职责/交接/代码位置或等价内容",
  "main.interface.memoNoContinuation": "至少需要一行 YYYY-MM-DD 的续接记录",
  "main.interface.apiSpecMissing": "未包含接口/导出/契约说明，也未写 not-applicable + 非空理由",
  "main.interface.apiSpecNotApplicableNoReason": "api-spec.md 标为 not-applicable 但未给出非空理由",
  "main.interface.projectListWarning": "listProject 警告：{warning}",
  "main.interface.writeValidationFailed":
    "流程 {flowId}：写卡产物未通过校验（appointment 步骤不能继续；未派运营做 role-readiness，也未把步骤标为 done）。",
  "main.interface.specificProblems": "具体问题：",
  "main.interface.warningsHeader": "提醒（不阻塞，existing/legacy 角色）：",
  "main.interface.fixWriteCard":
    "请修正上述文件后**重新发 appointment-write 确认卡**完成写卡（role-card.md 需含第 5 项必填章节；boundary.yaml 需为合法 YAML，顶层 role 与目录 id 一致，entries 含角色根工作文档与实际写集；工作文档按 feature-map/functional-description/memo/api-spec 补齐，api-spec 不适用时写 not-applicable + 非空理由）。",
  "main.interface.fixTeamPlanV3":
    "请按 v3 修正/补充团队计划（frontmatter teamPlanSchema: 3 与非空 directories；模块清单每个 module 的非空实现目录；角色表授权目录/精确写集；目录规范表 12 字段；每目录唯一 owner/不重叠/共享策略；治理关键路径只精确授权），必要时递增版本并重发任命卡；修正后应用会重新校验。",
  "main.interface.fixTeamPlanLegacy":
    "请修正/补充团队计划（frontmatter flowId/version/riskTier/recommended；角色表逐角色含类型 new/changed/existing、职责目标、能力要求、唯一写集、依赖），必要时递增为 v2 并重发任命卡；修正后应用会重新校验。",
  "main.interface.teamPlanValidationFailed":
    "流程 {flowId}：团队计划未通过结构校验（任命的写卡步骤暂停；人事不自行补计划，应用未派 role-readiness、未把步骤标为 done）。",
  "main.interface.roleCardsStepMissing":
    "流程缺少 id 为 \"{stepId}\" 的步骤（团队计划存在但 flow 未声明 role-cards，无法完成收口；请运营补齐 flow 步骤）。",
  "main.interface.crewBlocking": "人事修正 {count} 个",
  "main.interface.planBlocking": "运营补充计划 {count} 个",
  "main.interface.writeBlockingSummary":
    "写卡产物未通过校验（流程 {flowId}）：{count} 个问题——已反馈 {routed}；未派运营做 role-readiness、未把 appointment 步骤标为 done。首个问题：{path}：{issue}",
  "main.interface.queueKind.handback": "交付",
  "main.interface.queueKind.dispatch": "派发",
  "main.interface.queueKind.system": "系统",
  "main.interface.queueKind.message": "消息",
  "main.interface.queueRecoveredLine": "- [{kind}] {summary}（角色 {roleId} · {runtime}）",
  "main.interface.queueRecovered":
    "已从上次运行恢复 {count} 条任务并重投（应用重启/崩溃后续跑；不弹客户卡、不把步骤标 done）：\n{lines}",
  "main.interface.staleStepFact": "- 步骤 {stepId}（owner: {owner}，status: {status}）",
  "main.interface.staleSteps":
    "流程 {flowId}：检测到 {count} 个步骤可能因应用重启/崩溃丢失（flow YAML 标记为已派发，但 owner 无会话/队列/在途投递）：\n{facts}\n请用 flow_get 核对当前 revision，必要时用 flow_step_supersede 换新步骤并 dispatch_task 重派；不要重复使用已派 stepId。",
  "main.interface.saveProjectNotActive": "该项目不是当前导入项目。",
  "main.interface.missingProjectRoot": "缺少项目根路径。",
  "main.interface.pinCheckFailed": "pin 证据检查失败：{detail}",
  "main.interface.projectNotCurrent": "项目不是当前导入项目；本次未写入任何文件。",
  "main.interface.governanceModelInvalid":
    "governanceModel 必须是 single 或 trio；本次未写入任何文件。",
  "main.interface.confirmMissing": "缺少操作者确认（confirm:true）；本次未写入任何文件。",
  "main.interface.previewDigestInvalid":
    "缺少有效的预览摘要（previewDigest 必须为 64 位十六进制）；本次未写入任何文件。",
  "main.interface.sessionRequestInvalid": "会话请求须指定项目、角色与运行时。",
  "main.interface.imageNotSent": "图片未发送（{detail}）——本条消息未发出，请移除该图后重试。",
  "main.interface.imageNotSentUnsupported":
    "图片未发送（内容不是受支持的图片——真实格式不在 {mimes} 之内，扩展名/声明类型不作数）。本条消息未发出，请移除该图后重试。",
  "main.interface.autoAdvanceFailed": "自动推进失败：{detail}",
  "main.interface.autoAdvanceStalled": "自动推进停住：{detail}",
  "main.interface.dispatchNoProjectRoot": "缺少项目根，无法后台派发",
  "main.interface.dispatchNoRuntime": "缺少运行时，无法后台派发",
  "main.interface.openSessionFailed": "无法开启 {label} 会话：{detail}",
  "main.interface.sendTaskFailed": "发送任务给 {label} 失败：{detail}",
  "main.interface.missingFlowIdWrite": "缺少流程信息（flowId），未派发写卡任务",
  "main.interface.appointmentNotApproved":
    "账本最新任命决定为 {decision}（未获客户同意），未派发写卡任务",
  "main.interface.missingAppointmentList": "缺少任命名单，未派发写卡任务",
  "main.interface.teamPlanMissingNoRoles": "缺少团队计划/任命名单，未派发写卡任务",
  "main.interface.teamPlanMissingBoundHint": "（账本 appointment 绑定 {plan}）",
  "main.interface.teamPlanMissingBound":
    "流程 {flowId}：团队计划缺失（docs/scheduling/{flowId}-team-vN.md）{bound}；未派人事写卡、未继续推进。请运营先写团队计划。",
  "main.interface.teamPlanMissingShort": "团队计划缺失{bound}；未派人事写卡（不猜计划、不自行扩大职责）",
  "main.interface.appointmentVsPlanMismatch":
    "客户实际任命名单（{appointed}）与团队计划推荐集（{recommended}）不同；请运营修订团队计划为 {version} 以反映实际任命（人事只按实际名单写卡）。",
  "main.interface.missingFlowOrList": "缺少流程信息（flowId/任命名单），未自动派发",
  "main.interface.missingFlowIdNomination": "缺少流程信息（flowId），未派发提名任务",
  "main.interface.flowYamlTimeout":
    "运营本轮未在时限内结束，流程状态 YAML {path} 未确认；未派发提名任务",
  "main.interface.flowYamlMissing":
    "运营未写出流程状态 YAML {path}；未派发提名任务（同名 .md 人读视图不算落盘）",
  "main.interface.flowYamlInvalid":
    "流程状态 YAML 校验失败（{path}）：{detail}；未派发提名任务",
  "main.interface.flowYamlUnreadable": "流程状态 YAML {path} 不可读：{detail}；未派发提名任务",
  "main.interface.missingFlowInfoNomination": "缺少流程信息，未派发提名任务",
  "main.interface.openCrewFailed": "无法开启人事会话：{detail}",
  "main.interface.sendNominationFailed": "发送提名任务给人事失败：{detail}",
  "main.interface.linkScheme": "只允许打开 http/https 链接。",
  "main.interface.linkTooLong": "链接过长，已拒绝。",
  "main.interface.externalOpenUnwired": "外部打开未接线（fail-closed）。",
  "main.interface.pickImageUnwired": "选图未接线（fail-closed）。",
  "main.interface.readImageFailed": "读取图片失败：{detail}",
  "main.interface.imageUnsupported": "内容不是受支持的图片（真实格式不在 {mimes} 之内）——扩展名不作数。",
  "main.interface.imageUnsupportedShort": "内容不是受支持的图片（真实格式不在 {mimes} 之内）。",

  // ---- 治理推进系统行（governance-advance.ts；仅用户可见，不含 agent 任务文案）----
  "main.governance.acceptanceAdvance": "流程 {flowId} 步骤已全部完成，已自动派发验收复核给质检（工作中）",
  "main.governance.acceptanceBlocked":
    "自动验收未派发：流程 {flowId} 未通过收尾门。原因：{issue}。{advice}",
  "main.governance.acceptanceBlockedTerminal": "无需操作：流程已收口，应用不会重复派发验收复核。",
  "main.governance.acceptanceBlockedAdvice":
    "建议：若旧步骤已被 retake 取代，请把对应的 aborted/failed 步骤在流程状态文件 {path} 中标为 superseded（或 cancelled）；或用新的 stepId 重新派发任务并在流程状态文件中更新状态与证据。修正后下一次事件会自动重新检查；应用不会自动改写流程状态文件，也不会自动派质检。",
  "main.governance.nominationDispatched": "已派发提名任务给人事（工作中）",
  "main.governance.roleCardDispatched": "已派发写卡任务给人事（工作中）",
  "main.governance.flowTaskDispatched": "已派发流程任务给运营（工作中）",
  "main.governance.flowYamlAndNomination": "流程状态 YAML 已落盘，已派发提名任务给人事（工作中）",
  "main.governance.roleReadinessDispatched": "写卡结构校验通过，已派发角色就绪复核给运营（工作中）",
  "main.governance.criteriaDispatched": "流程 {flowId}：已派发实施前标准编写任务给质检（工作中）",
  "main.governance.nominationAlreadyDone": "提名已完成，未重复派发；已请运营继续下一步",

  // ---- 验收返工路由系统行（2026-10-23 验收返工路由；方案 §6.3.3）----
  // 参数契约：{flowId} 流程 id；{reportPath} 报告相对路径；{detail} 有界诊断/错误原文。
  // 来源语义：仅客户手拒来源写「客户拒绝」；judge/自动来源只写自动决策措辞，不得写成客户拒绝，
  // 也不得声称路由已成功——实际失败由 Failed/AuditFailed 系统行如实报告。
  "main.governance.acceptanceReworkRoutedCustomer":
    "流程 {flowId}：验收结果为客户拒绝；应用已按路由规则把返工交运营组织。",
  "main.governance.acceptanceReworkRoutedAutomatic":
    "流程 {flowId}：自动决策未通过/未完成（判断代批/自动退回）；应用已按路由规则把返工交运营组织。",
  "main.governance.acceptanceReworkPending":
    "流程 {flowId}：返工路由尚未完成（等待发送或等待下一次事件重试）；应用暂不派发验收复核，也不会重复通知。",
  "main.governance.acceptanceReworkReportIncomplete":
    "流程 {flowId}：验收报告缺少可解析的 acceptance-rework/v1 结构化返工段（{detail}）；应用已把报告路径 {reportPath} 与解析错误交运营组织人工返工，未生成返工项、未创建流程步骤。",
  "main.governance.acceptanceReworkFailed":
    "流程 {flowId}：返工路由失败（{detail}）；应用不声称已送达，也不会派发验收复核；修正后下一次事件会自动重试。",
  "main.governance.acceptanceReworkAuditFailed":
    "流程 {flowId}：返工任务已按路由规则转交，但审计记录写入失败（{detail}）；已发送事实不翻转，应用不会伪造账本，请检查账本与诊断。",

  // ---- Gate 复核回执与系统行（2026-10-26 request_gate_review；设计 §5–§8/§12）----
  // 参数契约：{flowId} 流程 id；{gateId} gate 步骤 id；{reportPath} gate 报告相对路径；
  // {detail} 有界诊断/缺项说明；{severity} 失败严重度摘要（blocker/major）。
  // 语义：gate 复核 ≠ 验收通过 ≠ 客户批准；gate 结论不写 customer.decision、不进入验收分诊。
  // 防吹毛求疵：gate fail 必须有 blocker/major；只有 minor/nit 的 fail 按结构不符退回验收，不触发返工；
  // gate pass 可带 minor/nit 备注，不因非阻断建议反复开 gate。
  "main.gateReview.dispatched":
    "流程 {flowId}：已提交 gate {gateId} 复核给质检（工作中）；gate 复核 ≠ 验收通过 ≠ 客户批准。",
  "main.gateReview.alreadyDispatched":
    "流程 {flowId}：gate {gateId} 复核已提交过（在途或已通过），未重复派发；请用 flow_get 核对 gate 步骤状态。",
  "main.gateReview.gateNotFound":
    "流程 {flowId}：未找到 gate {gateId}（步骤不存在或不是 gate）；请核对 flow YAML 后重新提交。",
  "main.gateReview.criteriaMissing":
    "流程 {flowId}：验收标准缺少 gate {gateId} 的复核标准节；请质检补齐最新标准后再提交（运营不写 docs/acceptance/）。",
  "main.gateReview.flowIncomplete":
    "流程 {flowId}：gate {gateId} 的前置步骤或证据不齐（{detail}）；补齐后再提交，不得提前提交或用提交代替缺步骤。",
  "main.gateReview.flowBusy":
    "流程仍有在途交付/轮次/回交，gate 暂不派发；这是可重试状态，不是故障或 gate 失败；请在在途工作结束后重试。",
  "main.gateReview.unavailable":
    "流程 {flowId}：gate {gateId} 复核通道不可用（{detail}）；可能已派发，请用 flow_get 核对；应用未声称已派发，不自行判定通过。",
  "main.gateReview.rejected":
    "流程 {flowId}：gate {gateId} 复核请求被拒（{detail}）；请按原因修正后重交，不原样重试。",
  "main.gateReview.passNote":
    "流程 {flowId}：gate {gateId} 已通过（报告 {reportPath}），已按路由转交统筹（投递结果另行如实说明）；可继续下游，仍须最终客户验收。",
  "main.gateReview.failNote":
    "流程 {flowId}：gate {gateId} 未通过（{severity}；报告 {reportPath}）；gate 保持 pending，返工后需重新请求复核。",
  "main.gateReview.returnedToProof":
    "流程 {flowId}：gate {gateId} 报告缺失或结构不合规（{detail}）；已退回质检补充并通知统筹，投递结果另行如实说明；未判通过、未路由返工。",
  // 2026-10-27 gate 退回/通过路由（方案 v3.2 §3.1/§3.2/§3.6、Q10 A）：投递结果键。
  // {detail} = 有界接收方/错误摘要（不附报告正文、凭据、命令原文）；排队视为已投递。
  "main.gateReview.returnedRouted":
    "流程 {flowId}：gate {gateId} 的退回通知已投递或已排队（排队视为已投递）；应用未判通过、未路由返工，将在新报告版本出现或统筹重新请求后继续处置。",
  "main.gateReview.returnedRouteFailed":
    "流程 {flowId}：gate {gateId} 的退回通知未完全送达（{detail}）；应用未声称已通知，稍后自动重试，超过上限需人工核对；未判通过、未路由返工。",
  "main.gateReview.reportUnreadable":
    "流程 {flowId}：gate {gateId} 报告存在但当前不可读（{reportPath}）；已提醒质检检查可读性并通知统筹，记录保持已派发（未退回、未判通过）。",
  "main.gateReview.reportUnreadableDeliveryFailed":
    "流程 {flowId}：gate {gateId} 报告存在但当前不可读（{reportPath}）；提醒或知情通知未完全送达（{detail}）；记录保持已派发，稍后自动重试，超过上限需人工核对。",
  "main.gateReview.passHandoffSent":
    "流程 {flowId}：gate {gateId} 已通过，通过转交已投递或已排队给统筹（排队视为已投递）；下游派发仍由统筹执行，gate 通过 ≠ 最终验收 ≠ 客户批准。",
  "main.gateReview.passHandoffFailed":
    "流程 {flowId}：gate {gateId} 已通过，但向统筹的通过转交未送达（{detail}）；应用未声称已转交，稍后自动重试，超过上限需人工核对；通用自动推进仍可兜底。",
  "main.gateReview.routingRecordUnusable":
    "流程 {flowId}：gate {gateId} 的路由记录损坏且无法重建（{detail}）；应用已停止自动通知（fail-closed），未声称已送达，请人工核对 gate 记录与报告。",
  "main.gateReview.nitOnly":
    "流程 {flowId}：gate {gateId} 的 fail 只含 minor/nit；gate 失败必须以 blocker/major 为依据，已按结构不符退回质检，不触发返工。",
  "main.gateReview.reportMissing":
    "流程 {flowId}：gate {gateId} 报告不存在或不可读（{reportPath}）；gate 保持 pending，等待质检补交报告，不按超时判通过。",
  "main.gateReview.reworkTask":
    "Gate 返工任务｜{gateId}：按 gate 报告 {reportPath} 的 {severity} 项修复；minor/nit 为非阻断、可选后续。",

  // ---- 决策卡回执与系统行（2026-10-26 客户规则；request_choice(cardKind="decision")）----
  // 参数契约：{option} 选中项标签；{detail} 有界诊断/缺项说明。
  // 语义：decision 卡独立于提案/任命/验收，不是客户批准、不等于验收通过、不是 gate，不触发 gate/验收；
  // 应用按 decisionKind="material-choice" 单独审计留痕（不在用户文案暴露内部账本词）。
  // judge 代批必须标「自动代理」，不得写成客户本人；无唯一推荐项/非法卡一律 fail-closed（未发卡）。
  "main.decisionCard.selectedRecommended":
    "决策卡：你选择了推荐项「{option}」；已如实记录本次材料性选择。",
  "main.decisionCard.selectedOther":
    "决策卡：你选择了「{option}」（非推荐项）；已如实记录本次材料性选择。",
  "main.decisionCard.judgeSelectedRecommended":
    "judge 代批 · 代决策（自动代理）：已按唯一推荐项「{option}」记录；不是客户本人选择。",
  "main.decisionCard.notApproval":
    "决策卡不是验收、不是客户批准，也不构成验收/提案/任命决定：本次选择仅作材料性选择的单独审计留痕，不触发 gate/验收；最终验收与客户批准仍走既有链路。",
  "main.decisionCard.noRecommended":
    "decision 卡缺少唯一推荐项（{detail}）；未向客户发卡（fail-closed），请修正后重试。",
  "main.decisionCard.invalid":
    "decision 卡参数非法（{detail}）；未向客户发卡（fail-closed），请修正后重试。",

  // ---- 会话历史（runtime-history.ts / session-history.ts）----
  "main.history.invalidRequest": "历史请求须指定项目、角色与运行时。",
  "main.history.deliveryState": "投递历史状态",
  "main.history.deliveryMaybeStarted": "投递可能已开始",
  "main.history.legacyReadFailed": "旧历史读取失败。",
  "main.history.readOrProjectionFailed": "历史读取或安全投影失败。",
  "main.history.callTool": "调用工具 {name}",
  "main.history.invalidSessionHeader": "首行不是有效的会话头（type!=session）",
  "main.history.emptySession": "会话文件为空或无有效会话头",
  "main.history.sessionReadFailed": "会话文件读取失败：{detail}",

  // ---- 图片校验（composer-images.ts）----
  "main.composerImages.typeUnsupported": "图片类型不支持：{type}——只支持 {mimes}。",
  "main.composerImages.emptyContent": "图片内容为空或无法读取。",
  "main.composerImages.tooLargeWithLimit": "图片过大（{size} > 上限 {max}）——请压缩后再发。",
  "main.composerImages.dataMissing": "图片数据缺失（空）。",
  "main.composerImages.notBase64": "图片数据不是合法的 base64。",
  "main.composerImages.tooLarge": "图片过大（> {max}）——请压缩后再发。",
  "main.composerImages.decodeFailed": "图片数据解码失败。",

  // ---- 项目图片查看工具（view_image；客户要求：角色可查看项目内图片证据）----
  // 交付语义（2026-10-27 客户要求「同轮看图修复」）：**同轮工具结果附图优先**——图片随本轮
  // 工具结果提供给同一模型的同一轮次，紧接着的下一次模型调用即可看到并判断，不产生队列/系统行；
  // 不支持同轮的引擎**回退为下一轮附件**（随下一轮用户提示送达同一角色）。逐引擎 policy 由
  // 运行时核心决定；无论哪种方式，未收到图片不得假装已看到。路径/类型/大小 fail-closed：
  // 失败时如实报告且不提供图片；能力未注入时不注册该工具。
  "main.viewImage.sameTurn":
    "已读取项目图片 {path}；图片已随本轮工具结果附图提供（同一轮可见），现在可直接查看并判断。若你的上下文未包含图片，请明确说明未看到，不要假装已看到。",
  "main.viewImage.queued":
    "已读取项目图片 {path} 并排队：下一轮将以图片附件提供（随下一轮用户提示送达）；本轮你尚未看到图片内容，不要假装本轮已看到。",
  "main.viewImage.failed": "读取或排队项目图片失败（{detail}）；未提供图片。",

  // ---- 需求变更申请回执/票据/系统行/审批结果（2026-10-26 request_requirement_change；客户要求）----
  // 场景：Draft 提案需要新授权/范围时，**不得写进提案卡**；需求变更申请与审批卡由**统筹或提案
  // 角色**发起（两者都可以，其他角色不可，发起方不得自批）；申请进入独立审批，审批由开启
  // 「替我决策」时的独立判断 agent（默认选唯一推荐项）或未开启时的客户在 decision 卡上完成。
  // **主理不审批**，只在批准后执行意图变更并通知提案修订。
  // 参数契约：{flowId} 流程 id；{intentId} 意图 id；{requestId} 申请票据 id；
  // {detail} 有界诊断/缺项说明；{source} 审批来源（判断代批「替我决策」或客户选择）。
  // 语义：申请 ≠ 批准；提案卡不得承载未确认的新授权；不得把申请或审批结果说成客户本人批准。
  "main.requirementChange.dispatched":
    "流程 {flowId}：已提交需求变更申请 {requestId}（意图 {intentId}），进入独立审批：申请由运营或策划角色发起，审批卡由应用在申请成功后自动经发起方会话呈现（其他角色不可，发起方不得自批）；审批由开启「替我决策」时的判断 agent 默认选推荐项、未开启时由客户在 decision 卡上完成；申请 ≠ 批准——产品不审批，只在批准后执行意图变更并通知策划修订；提案卡不得承载未确认的新授权。",
  "main.requirementChange.alreadyDispatched":
    "流程 {flowId}：已存在待处理的需求变更申请 {requestId}（意图 {intentId}）；未重复提交，请等待独立审批结果（申请由运营或策划角色发起，审批卡由应用在申请成功后自动经发起方会话呈现，发起方不得自批）。",
  "main.requirementChange.invalid":
    "需求变更申请参数非法（{detail}）；未提交（fail-closed），请修正后重试。",
  "main.requirementChange.intentNotFound":
    "流程 {flowId}：未找到意图 {intentId}；需求变更申请未提交，请核对后重试。",
  "main.requirementChange.flowNotFound":
    "流程 {flowId}：未找到该流程；需求变更申请未提交，请核对后重试。",
  "main.requirementChange.unavailable":
    "流程 {flowId}：需求变更申请通道不可用（{detail}）；可能已提交，请核对；应用未声称已提交。",
  "main.requirementChange.rejected":
    "流程 {flowId}：需求变更申请提交被拒（{detail}）；未进入独立审批，请按原因修正后重交，不原样重试。",
  "main.requirementChange.taskLabel": "[需求变更申请·待独立审批]",
  "main.requirementChange.ticket":
    "需求变更申请 {requestId}｜流程 {flowId}｜意图 {intentId}｜待独立审批（申请由运营或策划角色发起，审批卡由应用在申请成功后自动经发起方会话呈现；发起方不得自批；申请 ≠ 批准）：{detail}",
  "main.requirementChange.systemLine":
    "系统·需求变更 · 提交了需求变更申请 {requestId}（流程 {flowId} · 意图 {intentId}），进入独立审批：申请由运营或策划角色发起，审批卡由应用在申请成功后自动经发起方会话呈现（其他角色不可，发起方不得自批）；审批由替我决策→判断 agent 默认推荐、未开启→客户在 decision 卡上完成；申请 ≠ 批准——产品不审批，只在批准后执行意图变更并通知策划修订；提案卡不得承载未确认的新授权。",
  "main.requirementChange.approved":
    "流程 {flowId}：需求变更申请 {requestId}（意图 {intentId}）已通过独立审批（{source}）；产品不审批，将按批准范围执行意图变更并通知策划修订；提案卡不得承载未获批准的新授权。",
  "main.requirementChange.approvalRejected":
    "流程 {flowId}：需求变更申请 {requestId}（意图 {intentId}）未通过独立审批（{detail}）；产品不审批、不执行意图变更；申请 ≠ 批准，策划不得按该申请修订，请按审批意见调整后重新申请。",
  "main.requirementChange.leadExecuteTask":
    "需求变更执行任务｜流程 {flowId}｜意图 {intentId}｜申请 {requestId}：独立审批已通过（{source}）；产品不审批，只按本次批准范围执行意图变更（docs/intents/**）并通知策划修订；不得扩大范围、不得把新授权写进提案卡、不得删除需求绕过 gate 0。",

  // ---- 确认卡/恢复通道（confirm-card.ts / recovery-channel.ts / operator-channel.ts）----
  "main.confirm.expiredTimeout": "确认已超时，旧确认失效。",
  "main.confirm.expiredStopped": "本轮已停止或会话已重建，旧确认失效。",
  "main.recovery.expired": "此恢复确认已失效（应用关闭或会话已重建），**未获执行**——可让 su 重新提议。",
  "main.operator.channelUnavailable":
    "操作者确认通道未配置（无 presenter），拒绝执行（fail-closed）",
  "main.operator.timeoutRejected": "操作者确认超时（>{ms}ms），拒绝执行（fail-closed）",
  "main.operator.channelErrorRejected":
    "操作者确认通道不可用，拒绝执行（fail-closed）：{detail}",
  "main.operator.rejected": "操作者拒绝执行",
  "main.operator.judgeTimeoutManual": "判断超时（>{ms}ms），已转手动确认。",
  "main.operator.judgeAbortedManual": "本轮已中止，判断结果不生效（交回既有中止路径）。",
  "main.operator.judgeErrorManual": "判断异常：{detail}。已转手动确认。",
  "main.operator.manualDenyAdvice.narrowCommand": "请改用落盘脚本或拆分命令后重试。",
  "main.operator.manualDenyAdvice.narrowJudge": "请缩小判断范围（改用落盘脚本或拆分命令）后重试。",
  "main.operator.manualDenyAdvice.narrowRead": "请缩小读取范围或改用落盘脚本后重试。",
  "main.operator.manualDenyAdvice.aborted": "本轮已中止，命令未执行；如仍需执行请重新发起。",
  "main.operator.manualDenyAdvice.switchOff": "请关闭「替我审批」后手动确认。",
  "main.operator.manualDenyAdvice.retry": "请重试，如持续失败请关闭「替我审批」后手动确认。",
  "main.operator.judgeResultDeliveryFailed":
    "审查结果投达失败，无法在聊天中显示判断结论，已拒绝；{detail}。",
  "main.operator.judgeRowFailedManual":
    "自动代理已完成判断，但结果无法在聊天中显示；规则判定仅作参考，本卡已转你手动确认。",
  "main.operator.judgeIncompleteManual":
    "自动代理未能完成判断：{reason}。规则判定仅作参考；自动代理未完成时才由你手批。已转你手动确认。",
  "main.operator.judgeReason.retryCapped": "同类命令连续被拒，已达重试上限",
  "main.operator.judgeReason.contextMissing": "缺少当前轮任务上下文",
  "main.operator.judgeReason.contextTooLarge": "命令或上下文过大",
  "main.operator.judgeReason.modelManual": "自动代理自报无法判断",
  "main.operator.judgeReason.fallback": "判断未完成",
  "main.operator.judgeDeniedHead": "自动代理未放行该命令。",
  "main.operator.judgeExplainToCustomer": "请向客户说明：{message}",
  "main.operator.judgeReasonLine": "原因：{reason}",
  "main.operator.judgeAlternative": "替代方案（{kind}）：{value}",
  "main.operator.judgeWayOut": "出路：如需执行，请关闭「替我审批」后重试。",
  "main.operator.judgeWillRun": "它会在项目里执行：{word}",
  "main.operator.shellReview.title": "受治理 shell 审核 · 操作者确认（第三闸 a）",
  "main.operator.shellReview.intro": "这是一条需要在执行前由你**亲自确认**的 shell 命令（pm 模型审读拿不准/不可用，故升级到你）。",
  "main.operator.shellReview.verify": "请**逐字核对**下面的命令原文后再决定；点「放行」将真的在项目里启动子进程执行它。",
  "main.operator.shellReview.escalationHeader": "── 升级原因（为何交你确认） ──",
  "main.operator.shellReview.argvEmpty": "（argv 为空）",
  "main.operator.shellReview.commandHeader": "── 命令原文（逐字，未加工） ──",
  "main.operator.shellReview.argvHeader": "── 规范化参数 argv（JSON 转义显示；引号仅为界定符） ──",
  "main.operator.shellReview.cwdHeader": "── 工作目录 cwd ──",
  "main.operator.shellReview.denyNote": "点「拒绝」或关闭对话框 = 不放行（不会执行）。",
  "main.operator.approvalTierLine":
    "{role} 审批档：{tier}——须逐条客户批准才执行；批准后可能绕过 ANS 文件写边界（命令以当前 OS 用户权限运行）。拒绝/超时/通道不可用 = 拒绝；默认拒绝、无「记住」，不自动通过。",
  "main.operator.review.risky":
    "自动审核判定这条命令有风险——按治理规则，有风险的命令必须由你亲自确认才能执行。",
  "main.operator.review.timeout": "自动审核超时，未给出结论——按 fail-closed 交你确认。",
  "main.operator.review.parse": "自动审核给出的结论无法解析，未能形成明确意见——按 fail-closed 交你确认。",
  "main.operator.review.error": "自动审核出错了，未给出结论——按 fail-closed 交你确认。",
  "main.operator.review.unavailable": "自动审核当前不可用（审读会话未接上）——按 fail-closed 交你确认。",
  "main.operator.review.unsure": "自动审核拿不准——按 fail-closed 交你确认。",
  "main.operator.review.fallback": "审核未能给出明确结论，按 fail-closed 交你确认。",
  "main.operator.expiredTimeout": "操作者确认超时（>{ms}ms），未获放行——可让角色重新发起。",
  "main.operator.expiredTimeoutNoMs": "操作者确认超时，未获放行——可让角色重新发起。",
  "main.operator.expiredStopped": "本轮已结束、停止或会话已重建，旧 shell 确认失效。",
  "main.operator.judgeTimeoutError": "判断超时（{ms}ms）：未在时限内得到判断结论。",
  "main.operator.confirmTimeoutError": "操作者确认超时（{ms}ms）：未在时限内得到操作者选择。",

  // ---- 判断原因（customer-input.ts / judge-reason.ts）----
  "main.customerInput.judgeDecisionHead": "judge 代批 · 代决策：接受提案（accept）",
  "main.customerInput.judgeAcceptanceHead": "judge 代批 · 代决策：验收通过（accept）",
  "main.customerInput.judgeAppointmentHead": "judge 代批 · 代决策：任命 {ids}",
  "main.customerInput.judgeWriteHead": "judge 代批 · 代审批：确认写入 {count} 个路径（{paths}）",
  "main.customerInput.judgeWriteHeadZero": "judge 代批 · 代审批：确认写入 0 个路径",
  "main.customerInput.judgeWriteHeadOverflow": {
    other: "judge 代批 · 代审批：确认写入 {count} 个路径（{paths}等 {count} 个）",
  },
  "main.customerInput.expiredQueued": "排队决定已自动处理（未呈现客户卡）",
  "main.customerInput.deliveryFailed": "客户交互请求未能送达界面：{detail}",
  "main.customerInput.rowFailedManual": "判断已完成，但结果无法在聊天中显示；已转你手动确认。",
  "main.customerInput.judgeNotDelegated":
    "自动代理未代批（{label}）：{reason}；已转你手动确认。",
  "main.customerInput.rejectNotApproval": "拒绝仅适用于审批组",
  "main.customerInput.switchOff": "你已关闭对应开关",
  "main.customerInput.groupMismatch": "判断结果分组与卡片不符",
  "main.customerInput.notRecommended": "判断结论与卡片选项不符",
  "main.customerInput.emitChannelMissing": "判断结果行通道未配置",
  "main.customerInput.rowFailed": "判断结果无法在聊天中显示",
  "main.customerInput.turnAborted": "本轮已中止，判断结果不生效。",
  "main.customerInput.judgeException": "判断异常：{detail}",
  "main.customerInput.judgeTimeout": "判断超时（>{ms}）",
  "main.customerInput.parseFailed": "判断结果形状非法",
  "main.customerInput.ledgerUnavailable":
    "{label}未通过：{reason}{detail}。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。",
  "main.customerInput.ledgerUnavailableShort":
    "{label}未通过：{reason}。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。",
  "main.customerInput.presenterMissing":
    "客户交互通道未配置（无 presenter），未获同意（fail-closed）",
  "main.customerInput.noPendingRequest":
    "没有待答的交互请求（轮次停止、会话重建或应用关闭会使旧请求失效）",
  "main.customerInput.missingDecision": "缺决定内容",
  "main.customerInput.choiceMismatch": "决定与请求类型不符（请求是 choice）",
  "main.customerInput.confirmMustBeBoolean": "确认决定必须是布尔值",
  "main.customerInput.customerDeclined": "客户不同意",
  "main.customerInput.confirmMismatch": "决定与请求类型不符（请求是 confirm）",
  "main.customerInput.customerCancelled": "客户取消",
  "main.customerInput.selectionMustBeArray": "选择内容必须是字符串数组",
  "main.customerInput.emptySelection": "未选择任何选项（空选择不受理；点「取消」才是拒绝）",
  "main.customerInput.selectionNotInRequest": "选项不在本次请求中（按请求快照校验拒绝）",
  "main.customerInput.singleChoiceOnly": "单选题只能选一个",
  "main.customerInput.unknownDecisionType": "未知的决定类型",
  "main.customerInput.reason.timeout": "判断超时",
  "main.customerInput.reason.aborted": "本轮已中止",
  "main.customerInput.reason.unavailable": "判断服务不可用",
  "main.customerInput.reason.unsupportedEngine": "当前引擎不支持自动判断",
  "main.customerInput.reason.parseFailed": "判断结果无法解析",
  "main.customerInput.reason.artifactMissing": "规范物证缺失",
  "main.customerInput.reason.artifactNotRead": "判断未读取必需的项目文件",
  "main.customerInput.reason.pathOutsideBoundary": "写盘路径不在允许范围内",
  "main.customerInput.reason.pathUnverified": "写盘路径无法逐项核对",
  "main.customerInput.reason.notRecommended": "候选与推荐/选项不一致",
  "main.customerInput.reason.insufficientEvidence": "证据不足",
  "main.customerInput.reason.ledgerUnavailable": "治理事实不可读",
  "main.customerInput.reason.groupMismatch": "判断结果与卡片分组不一致",
  "main.customerInput.reason.budget": "读取预算已用尽",
  "main.customerInput.reason.readTruncated": "读取内容被截断",
  "main.customerInput.reason.contextMissing": "缺少判断所需的上下文",
  "main.customerInput.reason.fallback": "判断未给出可代批结论",
  "main.customerInput.rework.head": "{label}拒绝：{reason}。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。",
  "main.customerInput.autoApprovalLabel": "自动审批",
  "main.customerInput.autoDecisionLabel": "自动决策",
  // ---- 写入预授权系统行（write-preauthorization.ts；2026-10-25 客户规则：边界内直接放行、边界外直接拒绝）----
  "main.customerInput.writePreauthorization.accepted": "边界内写入预授权，已直接放行：{paths}",
  "main.customerInput.writePreauthorization.rejected":
    "系统预授权拒绝写入：{paths}（边界外不给写；未向客户呈现确认卡、未调用判断 agent）",
  "main.customerInput.writePreauthorization.reason.boundary":
    "目标路径未匹配任何边界或不在可写范围内",
  "main.customerInput.writePreauthorization.reason.unresolved":
    "无法解析声明路径（绝对路径/../空段）",
  "main.customerInput.writePreauthorization.reason.mixed": "请求包含边界外路径，整单拒绝",
  "main.customerInput.writePreauthorization.noPaths": "写确认缺少可解析的声明路径",
  "main.judgeReason.readDeniedPrefix": "判断读取被拒：",
  "main.judgeReason.readDeniedDetail": "读取被拒：",
  "main.judgeReason.readDeniedFallback": "所需项目文件无法读取（未记录具体路径）",
  "main.judgeReason.readDeniedTail": "，已转手动确认。",

  // ---- 运行时/项目/历史/看护（runtime-config.ts、project.ts、watchdog.ts 等）----
  "main.runtimeConfig.readFileFailed": "无法读取运行时配置文件。",
  "main.runtimeConfig.invalidUrl": "地址格式无效",
  "main.runtimeConfig.demoNoConfig": "演示运行时无需配置。",
  "main.runtimeConfig.settingsMustBeObject": "设置必须是键值对象。",
  "main.runtimeConfig.valueMustBeString": "设置值必须是字符串。",
  "main.runtimeConfig.urlCredentials": "API 地址须为不含用户名或密码的 http/https 地址。",
  "main.runtimeConfig.invalidApiUrl": "API 地址格式无效。",
  "main.runtimeConfig.choiceInvalid": "{label}取值无效：仅接受 {accepted}（或留空维持平台默认）。",
  "main.runtimeConfig.integerInvalid": "{label}必须是{bound}正整数。",
  "main.runtimeConfig.integerBound": " ≥ {min} 的",
  "main.runtimeConfig.notSaved": "运行时配置未保存，无法写入配置文件。",
  "main.project.governanceInvalid": "治理记录不可用（.ans/project.json 不可解析或结构无效）",
  "main.project.governanceUnaccepted": "治理记录未接受（accepted 不为 true）",
  "main.project.governancePathEmpty": "治理记录缺少治理边界路径（governanceBoundary.path 为空）",
  "main.project.pinCheckFailed": "pin 证据检查失败",
  "main.project.pinMissing": "治理记录未提供可验证 pin",
  "main.runtimeResolution.noRuntime":
    "无法确定项目引擎，请先选择引擎；本次自动验收派发已跳过（不会循环重试）。",
  "main.runtimeResolution.invalidParams": "持久化参数无效。",
  "main.runtimeResolution.persistFailed": "引擎选择未能写入持久化文件。",
  "main.watchdog.signal.turnDeadline": "轮次到点检查",
  "main.watchdog.signal.queueStuck": "投递排队积压",
  "main.watchdog.signal.cmdTimeout": "命令超时",
  "main.watchdog.signal.repeatFail": "重复失败",
  "main.watchdog.durationSeconds": "{seconds} 秒",
  "main.watchdog.durationMinutesSeconds": "{minutes} 分 {seconds} 秒",
  "main.watchdog.durationHours": "{hours} 小时",
  "main.watchdog.kind.handback": "交付",
  "main.watchdog.kind.dispatch": "派发",
  "main.watchdog.kind.system": "系统",
  "main.watchdog.action.redeliver": "重投任务",
  "main.watchdog.recoveryNote":
    "系统·恢复 · {action} · 角色 {roleId} · {executed}",
  "main.watchdog.stormGuard": "系统·看护 · 风暴护栏 · 已抑制 {count} 条",
  "main.watchdog.recoverySignal": "系统·看护 · 看护恢复 · {signal} · 角色 {roleId}",
  "main.watchdog.turnAbortedText":
    "{prefix} 回合自动中止：角色「{roleId}」本轮已耗 {elapsed}（显式配置的自动中止时限 {limit}）。自动中止 ≠ 客户批准：这是看护按「替我决策/替我审批」开关执行的停止动作，只停止本回合、不代表客户逐项审批；轮次收尾后队列中的交付/派发按既有顺序继续投递。",
  "main.watchdog.turnAbortedSummary": "系统·看护 · 回合自动中止 · 角色 {roleId}",
  "main.watchdog.signalSummary": "系统·看护 · {signal} · 角色 {roleId}",
  "main.watchdog.queueStuckSummary": "系统·看护 · {signal} · 角色 {roleId}（深度 {depth}）",
  "main.watchdog.repeatFailSummary": "系统·看护 · {signal} · 角色 {roleId}（{count} 次）",
  "main.watchdog.turnDeadlineElapsedAbort":
    "本轮有效已耗约 {elapsed}（看护检查时限 {timeoutMs}ms；到点仅检查；显式配置的自动中止时限 {limit}，开关开启时看护到点自动中止）",
  "main.watchdog.turnDeadlineElapsedNoAbort":
    "本轮有效已耗约 {elapsed}（看护检查时限 {timeoutMs}ms；到点仅检查、不中止本轮；未配置看护自动中止）",
  "main.watchdog.turnDeadlineAdvice":
    "请用 role_status / session_tail 核对该角色是否卡死；仍在推进则不动作；确认卡死可 propose_recovery（开关开启时由桌面自动执行；关闭时仍需客户确认后应用执行）",
  "main.watchdog.turnDeadlineLastResort": "整轮最后兜底 {text}（运行时硬上限，不是看护自动中止）",
  "main.watchdog.turnDeadlineStarted": "本轮自 {time} 开始、至今仍在进行",
  "main.watchdog.turnDeadlinePendingCard": "该角色有挂起确认卡时不触发本信号（正确等待不报）",
  "main.watchdog.queueStuckHead": "队首已排队 {age}（队列深度 {depth}）",
  "main.watchdog.queueStuckItem":
    "- [{kind}] 来自 {source}：{summary}（入队 {time}）",
  "main.watchdog.repeatFailWindow":
    "近 {minutes} 分钟窗口内已有 {count} 次轮次以 failed/timed_out 结束",
  "main.watchdog.repeatFailLast": "最近一次 {detail}",
  "main.watchdog.repeatFailUnknown": "（未知）",
  "main.watchdog.cmdTimeoutTimedOut": "{time}（结构化事实 display.process.timedOut=true——F-1 已自动终止该命令、轮次继续）",
  "main.watchdog.cmdTimeoutNote": "命令原文与输出在该角色会话流；本告警不含命令原文",
  "main.watchdog.systemSource": "（系统）",
  // ---- B 批（2026-10-28）：任务卡 / 工作结果 / 运行日志 / 巡检 ----
  "main.watchdog.signal.logSilence": "运行日志静默",
  "main.watchdog.patrolSummary": "系统·巡检 · 在岗角色 {count} 个",
  "main.watchdog.patrolSkipped": "系统·巡检 · 已连续跳过 {count} 次（上一轮未结算）",
  "ui.task.title": "任务",
  "ui.task.cardTitle": "任务 #{taskId}",
  "ui.task.target": "目标角色：{role}",
  "ui.task.goal": "目标：{text}",
  "ui.task.expected": "期望产出：{text}",
  "ui.task.evidence": "可选证据：{list}",
  "ui.task.status": "状态：{status}",
  "ui.task.sideEffect": "副作用：{sideEffect}",
  "ui.task.time": "时间：{at}",
  "ui.task.retryOf": "重派自 #{taskId}",
  "ui.task.restored": "已恢复未投递任务 {count} 条",
  "ui.task.duplicate": "同一任务已存在（#{taskId}），未重复派发",
  "ui.task.stateWriteFailed": "任务状态写入失败——未投递（不静默）",
  "ui.task.accepted": "任务已受理：#{taskId}（受理 ≠ 完成）",
  "ui.workReport.title": "工作结果",
  "ui.workReport.status.done": "完成",
  "ui.workReport.status.blocked": "阻塞",
  "ui.workReport.status.failed": "失败",
  "ui.workReport.summary": "摘要：{text}",
  "ui.workReport.evidence": "证据",
  "ui.workReport.unreported": "未提交正式任务报告，尚不能确认任务完成",
  "ui.roleLog.title": "运行日志",
  "ui.roleLog.empty": "暂无日志",
  "ui.roleLog.lastActivity": "最后日志：{at}",
  "ui.roleLog.status.normal": "正常",
  "ui.roleLog.status.slow": "迟滞",
  "ui.roleLog.status.stuck": "卡死",
  "ui.roleLog.status.waiting": "等待",
  "ui.roleLog.view": "读日志",
  // ---- 演示运行时（chat-adapter.ts；demo 消息用户可见）----
  "main.demo.toolCall": "模型请求调用 write_file -> {path}",
  "main.demo.unknownToolDenied": "未知工具，拒绝执行：write_file",
  "main.demo.message": "（演示运行时·第 {turn} 轮）收到：{text}",
  "main.demo.inBoundsWrite": "角色边界内的写入尝试",
  "main.demo.outOfBoundsWrite": "越界写入尝试",
  "main.demo.turnEndedPrototype": "第 {turn} 轮结束（原型阶段未真正落盘）。",
  "main.demo.turnEnded": "第 {turn} 轮结束（演示运行时）。",
} satisfies Catalog;
