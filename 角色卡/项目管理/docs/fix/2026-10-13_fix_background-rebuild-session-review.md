---
id: background-rebuild-session-review
type: fix
title: 后台会话重建修复的范围评审与验收
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [background-rebuild-active-session, desktop-three-pane]
events:
  - date: "2026-10-13"
    kind: created
    summary: 项目管理评审桌面应用角色修复方案 v1，按客户明确修改指令安排所属角色实施
  - date: "2026-10-13"
    kind: verified
    summary: 桌面角色完成必要修复，项目管理核对最终源码与原有工作，固定测试角色独立验证公开入口和真实 Electron 行为
---

# 重建完成后，用户仍应能向当前角色发消息

客户看到 su 的三条“继续”均报“会话尚未开启”。只读诊断已复现：后台重建成功，角色仍保活，但活动目标为空，消息实际送达数为零。项目管理只做调查、评审与协调，业务修复由固定桌面应用上下文承担。角色职责见[整体架构](../architecture.md)。

## 评审结论

推荐实施[桌面应用修复方案 v1](../../../桌面应用/docs/fix/2026-10-13_fix_background-rebuild-active-session.md)。提交评审时文档 SHA-256 为 `45abef999351a2f1b30b387bc55b55ac219094663d39d68787602474330008e6`；后续完成状态和证据更新不改变本次已评审的必要行为。

后台重建前记录活动目标，成功且用户没有另选角色时恢复；同角色显式点击经既有 openSession 确认后台会话；发送失败撤销匹配的本地开启标记，补开失败则停止本次发送。沿用已有按角色重建链和条目身份守卫，没有新 IPC 或跨层依赖。

选择版本与 stop 等待当前在途重建属于这条已有生命周期的必要收口：仅恢复 null 会忽略用户在等待窗口发起的关闭或失败的角色切换；关闭全部若只看当前会话表，会漏掉暂时被移出表但即将重开的句柄。实现必须用确定性等待点证明这两个已有契约，没有通用取消框架、重试或额外派发修改。

与每次发送都补 open 相比，该方案直接修复活动目标丢失，并保留既有发送契约。前端失败不自动重发，避免消息重复投递；同角色续接保留历史与未决卡的滚动语义。

## 授权与范围

客户明确指令：“这个是一个 ans 技能开发的项目，你让对应的角色去修改”。按该直接修复授权安排必要实现，未将项目管理的评审建议记作客户对某个文档版本的确认。此次必要范围与前一轮已解释、复现的问题一致，无选装项、无新的权限或外部写入需求。

桌面角色仅修改 `app/desktop/session.ts`、`app/renderer/renderer.js`、其角色内回归测试和相关修复/功能/导航记录。现有 interface.ts、session.ts 中首轮寻址修改及未跟踪 dispatch-fresh-enum.test.ts 作为基线完整保留。共享类型、门禁、编排、Pi 和构建配置不变；现有跨角色调用接口只读复用，所以不需要其他实现角色改动。

本次为单角色独立修复，不建立额外任务图。测试角色在独立上下文只读核查最终候选与可执行证据，不代修业务代码。

## 验收条件

- 后台刷新完成再发送：返回成功，消息恰一次送达重建后的句柄。
- 非活动角色重建不抢位；重建期间另选角色不被抢回；关闭会话不遗留重建句柄。
- 同角色点击实际确认后台会话；发送失败后可显式恢复；补开失败不继续发送、不自动重发。
- 必要测试与类型检查实际运行，Electron 渲染行为有独立证据；已有环境失败与本次失败分别记录。
- 差异在角色边界内，保留客户原有工作，文档与最终行为一致。

## 最终候选与实际验证

桌面角色已完成修复。评审过程要求保留两条兼容边界：定向关闭非活动 B 不得撤销活动 A 的恢复资格；关闭全部必须终止尚未启动的多角色刷新步骤，防止 stop 等待期间扫描下一个角色。实现沿已有选择与重建机制收口，没有通用取消框架。`boundary-refresh.test.ts` 的既有续接路径静态断言只增加实际选择版本参数，行为断言没有放松。

最终生产文件 SHA-256：

- `app/desktop/session.ts`：`32ace95d1f43fae58962ed338426a07e8f783ed2882cbe1087494ac959e30180`。
- `app/renderer/renderer.js`：`e58d46e0f82a62e632cb6c8069d201902e4c20dab7ca12885ed9eca28567467c`。

项目管理在该候选独立运行 `npm run typecheck`、`git diff --check` 和原有用户补丁的 `git apply --reverse --check`，均 exit 0；interface.ts 的基线哈希保持不变。角色边界和实际写集核对通过，没有覆盖原有缓存 miss 寻址工作。

桌面角色的相关四个测试文件 63/63 通过，其中会话重建 16 项；角色全套 194 计、193 过、1 失败。唯一失败为未修改的 `pi-config.test.ts:60` 要求默认路径末尾 `ans-cli/.env`，当前检出目录为 `ans-runtime`，与此次会话行为无关；全套测试并非全绿。

固定测试角色在 Node 24.14.0 上独立验证 SessionManager 公开入口 10/10；在真实 Electron 44.7.0 / 内置 Node 24.21.0 上独立执行 12 条界面实际断言，全部通过且 `E2E_DONE=1`。核对消息实际恰一次送达、选择与关闭窗口、同角色真实 IPC、失败后显式恢复、无自动重发、补开失败保留输入、迟到结果不污染新项目。独立临时证据：`/private/tmp/ans-independent-session-01a133d2.test.mjs`、`/private/tmp/ans-independent-electron-01a133d2.mjs`、`/private/tmp/ans-independent-electron-01a133d2/report.txt`；临时文件不作为永久运行依赖。

桌面完整离线 harness 最终报告 `/private/tmp/ans-session-repair-e2e-final-01a133d2/report.txt` 中，新增 11 个 `SESSION_REPAIR` 标志全部 true，既有 U1/P1 滚动标志全部 true，`E2E_DONE=1`，无 `E2E_ERROR` 或 `WATCHDOG`。第一轮新增粘贴图片检查因测试 harness 缺少既有 `app:attach-image` 接线失败，角色只补测试接线并完整重跑，没有改生产接口或删弱断言。

本记录确认此次修复验收通过；运行中的用户客户端未重启，需重启 ANS 后加载源码修改。验证使用独立临时应用和离线适配器，未调用真实模型。
