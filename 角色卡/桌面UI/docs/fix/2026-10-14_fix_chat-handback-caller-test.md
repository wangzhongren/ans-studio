---
type: fix
title: 来源包更新后的图片调用方守卫同步
created: "2026-10-14"
updated: "2026-10-14"
status: verified
---

桌面 UI 角色按[项目管理 revision 2 审核及必要测试校准](../../../项目管理/docs/fix/2026-10-14_fix_chat-handback-proposal-review.md)和[窗口 version 2](../../../桌面窗口/docs/fix/2026-10-14_fix_chat-handback-origin.md)实施已确认方案的调用方测试同步。功能入口为[桌面 UI 功能导航](../../feature-map.md)中的消息与图片发送。

窗口每次发送创建含 handback 来源的新外层包，旧图片静态守卫仍要求原外层引用与无包单参，因而失败。本次仅调整 `test/桌面应用/renderer.test.ts` 图片接线测试内 sendDelivery 相关断言，明确聊天 false、队列 dispatch true、每次两参发送与浅包装；保留图片数组/对象不重建、客户 opts 不修改、role/runtime/turnId ACK 校验及原 callback 转发。没有 renderer 产品修改。

验证命令：`node --test test/桌面应用/renderer.test.ts`。通过条件为全部 renderer 守卫通过，且本次 diff 仅上述测试段和本记录；集成与真实桌面证据由测试角色负责。

实际结果：renderer 41/41 pass，fail 0、skip 0，exit 0。`git diff --check -- test/桌面应用/renderer.test.ts` exit 0。原有图片不重建、客户 opts 不修改与 ACK 身份/回调断言逐字保留；仅三条旧构造断言同步并新增一条 dispatch/chat 来源断言。本侧未修改 `app/renderer/` 或窗口生产文件。本记录的 verified 仅覆盖该调用方源码守卫，不表示全仓或真实桌面完成。

证据环境为本仓检出、Node v24.14.0；renderer.test.ts SHA-256 `1174fd02d923f5f3cbf24adfc524124ae66262a920b5c08d2098173e06455481`，只读生产依赖 session.ts SHA-256 `43948d439e80af3e1801b7586a4f3a4a99c9f5484fccccf5931f7e998a51652c`（与 PM 当前审核候选一致）。
