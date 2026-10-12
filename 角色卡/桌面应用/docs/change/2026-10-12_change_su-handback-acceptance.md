---
id: su-handback-acceptance
type: change
title: 回交自动投递 su 验收（E-1）+ D-1 契约下的上下文来源文案（失真提示退役）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [session-restore]
events:
  - date: "2026-10-12"
    kind: created
    summary: 依 pm 设计稿 E-1（客户裁定全自动、无开关）实施桌面侧自动投递；并落实 pm 钉死的 D-1 契约——退役失真的「模型上下文已重启」文案，文案分支钉进 role-status.js 纯函数
  - date: "2026-10-12"
    kind: implemented
    summary: session.ts 增回交投递机（renderHandbackPrompt/handbackKey 单一来源、去重、排队、自动开 su、失败如实+保留重试）；OpenResult 增 contextSource/contextWarning（probeSessionFile 分类）；role-status.js 增 sessionContextNotice；renderer 文案改走映射；新增 handback-delivery.test.ts（5 例）
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 106 计/105 过/1 红（唯一红为既有环境红）；全量 751 计/748 过/2 红/1 skipped（两红均既有环境红，非本改动）；e2e 已同步（RESTORE_NO_STALE_RESTART_NOTE），本轮未跑
---

# 回交自动投递 su 验收（E-1）＋ 上下文来源文案（D-1 契约）

**来源**：pm 设计稿 E-1（客户裁定**全自动、无开关**）；同轮 pm 钉死 D-1 契约（适配器「目录内有最近会话就恢复」、
编排传目录、**dispose/LRU 淘汰不擦除会话文件**）——据此那条语义互涉有了结论，一并落实。实施面：
`app/desktop/session.ts`、`app/desktop/session-history.ts`、`app/renderer/{renderer.js,role-status.js}`、
`test/桌面应用/**`、本页。

> **状态：已实施、已验证。** e2e 已同步、**本轮未跑**；真实模型端到端（真回交→su 真验收）属「客户跑」。

## 一、E-1：回交自动投递 su 验收

用户会看到什么：某角色（≠su）交回报告后——**su 的聊天流里自动多出**：一条系统行「已自动投递 <角色> 的回交给
su（请其验收：确认通过 / 要求返工 / 上报客户）。」，随后 su 按那条输入回复（其回复即验收意见，Markdown 渲染）。

机制（全在会话层 `SessionManager`，**数据驱动**：su=门禁引擎枚举的 `primaryRoleId`，不硬编码）：

1. **文案单一来源**：投递文本 = 编排 `renderHandbackPrompt(hb)`（**只读导入**，两前端共用、本层不复制）；
   去重键 = 编排 `handbackKey(hb)`。测试直接以这两个函数构造期望——证「用的同一份」。
2. **去重**：键 = `projectRoot\0<handbackKey>`；**入队即登记**——同一条回交（重放/重渲染/重复事件）只投一次。
3. **排队**：`LiveSession.busy`（send 成功置真、收到该角色 `settled` 置假）——su 忙则入队；`settled` 后
   **按到达序**逐条放行；**先置忙再 await send**（防「open 尾部放行」与本次调用竞态导致并发 send）。
4. **su 未开 → 自动开启**（沿用最近一次运行时；渲染侧现实恒为 pi）再投递。
5. **失败如实、绝不静默丢**：开启失败 / 投递失败 ⇒ 在 su 的 pane 放**系统行**（含原因 + 「已保留 + 重试时机」），
   回交**放回队首**（保序）待重试；重试时机 = su 打开 / 下一次回交 / 任一轮结束（settled）。
6. **不做（登记）**：CLI 前端的同等投递（一次性会话，另议）；O-E1（su 以结构化方式记录验收结论）未采纳、不动。

## 二、D-1 契约下的上下文来源文案（失真提示退役）

**逐情形对照表**（判据与文案都在纯函数 `role-status.js::sessionContextNotice`，可断言；主进程经
`probeSessionFile` 按「会话文件在/不在/坏」分类 `OpenResult.contextSource`）：

| 情形 | 事实（判定输入） | 界面显示 |
| --- | --- | --- |
| 同运行内同角色再点（句柄在） | `resumed=true` | **无提示**（就是续接） |
| 显式「结束会话」后再打开 | `resumed=false` + 会话文件在（header 合法） | 「**已从本地会话文件恢复（模型上下文一并恢复）。**」 |
| LRU 淘汰后切回 | 同上 | 同上 |
| 应用重启后打开（D-1 已回放该角色） | `resumed=false` + 文件在 + 已回放分隔行 | **不重复提示**（分隔行已说「会话已恢复（模型上下文一并恢复）」） |
| 会话文件缺失 | `fresh` | 该 pane **有历史**时：「新会话（本地无可用会话文件）——以上为历史记录，模型不会记得；请重新说明需求。」；**无历史**：无提示 |
| 会话文件损坏（头不合法） | `fresh` + `contextWarning` | 「**本地会话文件损坏，未能恢复——已开新会话；模型不会记得以上历史**，请重新说明需求。」 |

**B-2 时期的「模型上下文已重启」已退役**（在 D-1 契约下失真——dispose/LRU 不擦除文件）。唯一残余的
「不会记得」情形**只剩**「文件缺失/损坏 → 新建」——文案里如实带出。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**。
- `node --test "test/桌面应用/*.test.ts"` → **106 计 / 105 过 / 1 红**——唯一红为**既有环境红**
  （`pi-config.test.ts` 断言检出目录名 `ans-cli`，本机 `ans-runtime`；**未动**）。
- 全量 `node --test "test/**/*.test.ts"` → **751 计 / 748 过 / 2 红 / 1 skipped**；两红**均既有环境红、非本改动**。
- **E-1 证据**（`handback-delivery.test.ts`，5 例）：投递文本 `=== renderHandbackPrompt(hb)` 且含报告字段与
  「请验收」（单一来源）；**去重**（同 key 两次事件 → su 恰 1 条）；**忙时排队**（su 先收用户消息→两条回交均
  排队→两次 settle 后按序送达，`send` 序列断言）；**未开自动开**；**开启失败**与**投递失败**分别断言
  「如实系统行（含原因/未投递/已保留/重试时机）」+ 下次时机成功送达（保留不丢）。
- **文案分支证据**：`renderer.test.ts` 的 `sessionContextNotice` 六断言（resumed→无；recovered→「已从本地
  会话文件恢复」；已回放→不重复；fresh 有历史→「不会记得」；fresh 无历史→无提示；损坏→「损坏」措辞）+
  `RENDERER_CODE` 反向断言（失真字符串不出现在任何执行路径）。`session-history.test.ts` 增
  `probeSessionFile`（missing/ok/corrupt）。
- **e2e**：`RESTORE_NO_STALE_RESTART_NOTE`（恢复场景不得出现失真文案）已同步，**本轮未跑**。

## 不在本轮（登记）

- **CLI 前端**同等投递：不做（`ans govern` 是一次性会话，另议）。
- **O-E1**（结构化验收结论）：未采纳、不做。
- 长会话裁剪 / 「新会话」入口：沿 D-1 登记（建议另派）。
