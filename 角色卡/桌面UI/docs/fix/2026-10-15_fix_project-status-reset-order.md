---
id: desktop-project-status-reset-order
type: fix
title: 新项目首次显示沿用旧角色徽标的刷新顺序
created: "2026-10-15"
updated: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 导入新项目时，首次显示使用新项目状态

root独立真实复测在没有 `.ans/sessions` 的 `/private/tmp/ans-real-p-limit-20261015-duplicate-retest` 导入后、未点角色前，看到su/测试已停止、维护/项目管理空闲且带旧恢复说明。root提供真实AX观察，本角色只读源码，不操作该窗口、不修改生产。当前[工具与输入修复](2026-10-15_fix_event-duplication.md)候选保持冻结。

根因已静态确认：`renderer.js::applyListing(res,fresh)` 先更换projectRoot和角色列表，调用renderRoleTree/renderRight/setChatHeader/updateControls，之后才在fresh分支清理roleMeta/roleBusy/queue/running及resetPanes。`roleStatusId`/`badgeHtml`在第一次render读取了旧roleMeta、lastSummary等事实；清理后没有再重绘树，因此旧DOM会持续到下一次事件或用户操作。这不是新项目真实恢复，也不需要新增session generation。`resetPanes`已有runtimeViews、草稿、OP、历史/行表清理，问题在其晚于首次展示。

最小必要修复：将现有fresh重置块移动到首次renderRoleTree/renderRight/setChatHeader之前；保持原清理字段、pendingHistories按projectRoot冲洗与导入取消/失败行为，不重写状态派生、不增加异步请求或接口。成功导入后才重置，未成功切换不清旧项目。新项目真实pending history/role-state若后续到达仍如实呈现；同项目普通refresh的fresh=false保留当前会话、队列和决定。此为既有项目隔离合同的显示顺序纠错，不新增产品政策。

精确拟改：仅 `app/renderer/renderer.js::applyListing` 顺序，以及自有 `test/桌面应用/e2e/uiux-v2.mjs` 的真实renderer回归；本记录同步。测试先用旧项目带hadSession/error/lastSummary、busy/queue与异引擎视图，然后导入另一无历史同名角色列表，在没有任何新事件的首次DOM上验证不含旧停止/恢复/错误/待办，selector仍按已有项目启用；再验证新项目真实快照正常显示、旧项目迟到事件不串、fresh=false刷新保留当前事实。运行原dup/merge/full UI及必要单元，维持图文/阅读/OP锚点与配置入口。

PM已独立审核recommend approval，root依据用户既有bugfix授权明确派发。已按本版实施，源变更时立即通知root，独立真实窗口须重载后补新项目首次DOM复测；本侧未操作用户窗口。原p-limit成果、Core/Pi/Window、配置/.env与权限不在写集。


## 实施与验证

产品唯一增量为applyListing原fresh块移到首次renderRoleTree/renderRight/setChatHeader/updateControls之前，原字段/clear/reset/flush内容无增删。pending history先按新projectRoot冲洗，允许真实恢复状态进入第一次树渲染；fresh=false不清。

当前renderer SHA-256 `cbd3a40459776306f04b12c24e66e7e0da5edab9eec9625f40311f7abd53df0a`，替代前轮 `ffbb73bc…`。工具/输入纯映射两个生产文件不变。自有 `e2e/uiux-v2.mjs` 增 `ANS_PROJECT_RESET_UI_ONLY=1` 场景，实际Electron/preload+受控IPC **PROJECT_RESET_UI_PASS 7**（Electron44.7.0 / Node24.21.0），包括旧项目真实形状meta/队列、同名新角色首次DOM未开启、旧迟到状态丢弃、新真实状态可见、fresh=false保持、新root缺旧runtime视图、pending新历史首render显示已恢复。首轮夹具返回DOM对象而check严格要求true，并误写未开启类名；已按实际st-off与布尔断言校正，产品未再调整。

同一新产品候选复跑 `ANS_DUP_UI_ONLY=1` **32项**、`ANS_MERGE_UI_ONLY=1` **12项**、无专项变量完整UI **98项**，均exit 0。均用 `ANS_UIUX_OUTDIR=/private/tmp/ans-project-reset-<模式> node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` 独立目录；完整UI中fixture撤回失败是主动模拟场景。`node --test test/桌面应用/tool-rows.test.ts test/桌面应用/runtime-ui.test.ts test/桌面应用/renderer.test.ts` **59/59**、`npm run typecheck` exit 0、限定diff检查exit 0。前轮结果只作为旧版本历史，当前这些为新字节重跑。

证据：[候选与只读依赖](2026-10-15-project-status-reset-evidence/manifest.txt)、[7项首次DOM](2026-10-15-project-status-reset-evidence/project-reset-report.json)、[32项重复](2026-10-15-project-status-reset-evidence/duplicate-report.json)、[12项合并](2026-10-15-project-status-reset-evidence/merge-report.json)、[98项完整UI](2026-10-15-project-status-reset-evidence/full-ui-report.json)、[59项单元](2026-10-15-project-status-reset-evidence/unit-tests.txt)、[960宽](2026-10-15-project-status-reset-evidence/project-reset-960.png)、[1360宽](2026-10-15-project-status-reset-evidence/project-reset-1360.png)。真实用户项目首次状态验证由root测试角色归档，本记录不把离线IPC等同真实主进程。
