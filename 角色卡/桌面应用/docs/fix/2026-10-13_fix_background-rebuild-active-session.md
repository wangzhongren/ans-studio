---
id: background-rebuild-active-session
type: fix
title: 后台边界重建完成后仍能继续发送消息
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [boundary-refresh, state-machine-and-replay-dedup, desktop-three-pane]
events:
  - date: "2026-10-13"
    kind: created
    summary: 顺序复现后台重建完成后活动目标为空，提出桌面角色内最小修复待项目管理评审
  - date: "2026-10-13"
    kind: implemented
    summary: 项目管理 v1 评审及客户直接修复授权后实施；顺序续发、选择与关闭等待窗口回归通过，Electron 附件回归待收尾
  - date: "2026-10-13"
    kind: verified
    summary: 管理器 16/16、相关测试 63/63、真实 Electron 11 项修复行为与既有滚动全通过；桌面全套唯一既有目录名环境红如实保留
---

# 后台重建结束后，下一条消息仍应送到当前角色

方案版本：v1（评审后必要测试适配及关闭全部扫描收口由项目管理追加认可）。所属功能见[桌面工作台](../feature/2026-10-11_feature_desktop-three-pane.md)。客户直接授权由对应角色修复，项目管理已[评审推荐实施](../../../项目管理/docs/fix/2026-10-13_fix_background-rebuild-session-review.md)，本角色已收到实施指令；没有重复申请本次必要修复权限。

## 什么情况下出错

用户已经打开 A 角色。边界文件改变后，su 一轮结束会触发后台刷新。等刷新完成再输入“继续”，界面报“会话尚未开启”，消息没有送到模型。重建成功且 A 仍保活，也会出错。

2026-10-13 在 Node v24.14.0 / Darwin arm64 上只读运行已有临时诊断用例，实测 `liveRoles=["A"]`、`activeRole=null`、`send.ok=false`、`delivered=0`。诊断用例的断言确认的是缺陷存在，不能当作修复通过的断言。

真实路径：`interface.ts::emitSessionEvent` 收到主入口的 `settled` → `refreshStaleBoundaries()` → `rebuildIfBoundaryStale(roleId, false)` → `disposeEntry()` 清空 `activeRoleId` → `openInternal(..., false)` 重建成功但不恢复活动目标 → 随后的 `send()` 在入口得到 null，拒发。此前并发修复只覆盖 refresh 与 send 同时开始；两者顺序发生时，发送入口已丢失目标，无法自愈。

前端还有两个衔接问题：`selectRole()` 看见本地 `sessionOpenRoleId` 相同就提前 return，实际没有向后端确认；`onSend()` 失败只标 error，仍保留“已开启”状态。于是点同角色也无法恢复。

## 必要修复

1. 在会话重建前记录活动目标及当前用户选择版本。重建只按原路径更新边界与恢复历史，继续复用按角色 `rebuildChains` 和条目身份守卫。成功后仅在“重建前该角色活动、期间没有新的用户选择或关闭操作、当前仍是同项目的新句柄”时恢复活动目标。非活动角色的后台重建不抢位。失败不恢复活动状态，系统行及 send 的错误保留底层失败原因。
2. 用户显式 open 在入口推进内部选择版本，包括同角色及失败的 open；关闭当前选择目标或全部也撤销恢复资格，包括暂无条目的 stop。定向关闭非活动 B 不撤销 A 的恢复资格。因此用户切到其他角色的动作即刻使旧重建的恢复资格失效。重建里的后台重开不会用 `userInitiated=true` 无条件改活动目标；用户发起的重建/续接也沿对应选择版本确认目标。无需增加 IPC 字段或公开 API。
3. stop 与已经在途的重建沿现有串行链收口：先撤销对应恢复资格，再等待相关 rebuild 链完成，最后释放当前条目。定向 stop 只等待目标角色；关闭全部还推进本次扫描专属版本，终止旧扫描尚未开始的下一角色重建，再等待当时在途的 rebuild 链并关闭其最终句柄。普通角色选择不取消扫描。这样换项目的 `stopSession(null)` 不会漏掉暂时移出表的旧角色，也不在 A→B 扫描交接中复活旧项目。此处只衔接当前重建窗口，不扩展到派发、普通新建或所有异步操作的通用取消框架。
4. 同角色显式点击继续执行滚到未决卡/底部，然后经既有 `d.openSession` 确认、续接或重新开启。后端已有保活会话时复用句柄，不为了确认而重建历史。保留 U-1 同角色点击滚底和 P-1 卡优先语义。
5. send 返回失败或抛错时，撤销匹配本次项目/角色的本地“已开启”标记并显示原错误；之后用户显式点击或再次发起发送才重新确认会话。补开失败则本次发送立即结束，不继续调用 sendSession。异步点击返回时核对本次项目/选择，避免旧结果改写新选择。失败消息不会自动重发；忙时入队、图片失败保留、已送达消息不重复投递。

选择版本和 stop 收口只保护本次重建/选择衔接，不引入轮询、错误字符串分类、第二套会话管理或通用重试。没有选装项。

## 范围与取舍

修改均属桌面 Interface 适配及其前端状态；编排 `openRoleSession`、Pi、门禁、共享类型与 preload 契约原样复用。没有跨角色写入需求。单纯让每次发送先 open 可以掩盖后台目标丢失，但 send 当前契约不带角色且会增加常规 IPC；单纯删前端 shortcut 又不能修复后台已成功重建的顺序续发。因此修复活动目标的生命周期，并用已有 open 作为用户显式确认入口。

精确拟写集：

| 文件 | 必要用途 |
| --- | --- |
| `app/desktop/session.ts` | 重建前后活动目标、选择版本、错误原文及 stop 收口 |
| `app/renderer/renderer.js` | 同角色确认、失败撤销标记、补开失败终止和本次选择核对 |
| `test/桌面应用/session-rebuild-race.test.ts` | 顺序续发、非活动重建、切角色、失败、stop/换项目等待窗口回归 |
| `test/桌面应用/boundary-refresh.test.ts` | 续接私有调用新增选择版本，更新对应静态钉；其他断言保持 |
| `test/桌面应用/renderer.test.ts`（只读复用） | 保留 U-1/P-1 静态契约；静态钉不算行为已验证 |
| `test/桌面应用/e2e/main.mjs` | Electron 真实 renderer + 既有 IPC 的重新确认、失败与滚动行为验证 |
| 本文 | 方案、评审版本和最终简要证据 |
| `角色卡/桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md` | 实施验证后同步真实会话流程、历史链接 |
| `角色卡/桌面应用/feature-map.md`、`memo.md`、`changelog.md` | 实施验证后的导航及维护线索 |

`app/desktop/interface.ts`、`test/桌面应用/dispatch-fresh-enum.test.ts` 只读，不修改首轮寻址补丁。构建配置、其他角色目录、治理文件及原有未提交工作受保护。

## 怎样验证

使用真临时目录和真文件内容哈希制造边界改变；用可控等待点安排顺序与并发，断言公开结果及真实消息投递，不把私有状态字符串当作验收。

- A 活动 → 改边界 → **await 后台刷新完成** → send“继续”：`ok=true`，活动 A，恰一份消息实际到新句柄，旧句柄未送，保活状态正确。保留既有 refresh×send 并发用例。
- A 活动、B 陈旧：后台重建 B 不抢 A；重建 A 等待期间用户 open B，完成后仍 B。busy 角色跳过、未变边界不重复重建。
- 重开返回失败/抛错：不恢复假活动状态，真实错误可见，消息未投递；用户显式 open 后可恢复。
- 重建 dispose/open 等待期间 stop A 或 stop 全部：stop 返回后无旧句柄、无旧活动目标；随后开新项目的同名角色，不被旧重建抢回。等待点证明收口，不用延时猜测。
- Electron 中：重复点击同角色实际调用 openSession，已有句柄续接、不重置历史，滚到卡/底部；程序化释放后仍用同角色按钮重新开启，随后发送真正到达；发送失败撤销 local session 标记，下一次显式操作重新确认且没有自动重发；补开失败不调用 sendSession。

实际命令：`npm run typecheck`；`node --test test/桌面应用/session-rebuild-race.test.ts test/桌面应用/boundary-refresh.test.ts test/桌面应用/renderer.test.ts test/桌面应用/dispatch-fresh-enum.test.ts`；`node --test "test/桌面应用/**/*.test.ts"`；`ANS_E2E_OUTDIR=/private/tmp/ans-session-repair-e2e-final-01a133d2 node_modules/.bin/electron test/桌面应用/e2e/main.mjs`。Electron 复用离线适配器注入缝与临时输出，不触真实模型/凭据。

结构门：逐路径白名单核对；与既有 patch 对照确保完整保留；没有新增层依赖、IPC、错误吞没或放松测试；功能文档与最终代码一致。工程法案仍标草稿，使用其中已确认规则，不把待确认条目升级为约束。

## 调查基线

- HEAD：`e3d9997e2918117239029d17b7db34f83b90b7a3`；package 1.0.0。
- 开始时已有未提交：`interface.ts` +7；`session.ts` +29/-4；未跟踪 `dispatch-fresh-enum.test.ts`。均是 `refreshListing` 缓存 miss 实时枚举寻址工作，与本修复分别保留。
- 开始时 sha256：session `985dd77d075251fdbc42d68f41a6710f18943cefebfdf34b26ac0f52270ea2e5`；interface `0ecd28ac00f790878b4f09380ae93cfb07d71ad5b67501aab059f338144795e0`；renderer `5446080bf467a281a9430e632c1e7e6100e407f38c60bc04502676877fc42554`。
- 已加载本角色卡与 boundary.yaml；sha256 分别为 `5cc7b21859fcc62c42a95987920f43ab6dcd6e71ea6361c8f0f899fe68f5c819`、`f357d53a605e5f68cc8fd47f672765ce532407e723d3c14aea13304eafe56ae4`。上下文固定【桌面应用】，无子代理，无任务图记录（standalone single-role repair）。

## 已运行证据

- 正确性红用例先运行：`node --test --test-name-pattern='后台重建完成后再发送' test/桌面应用/session-rebuild-race.test.ts`，1 失败，实际 `send.ok=false` 与期望 true 不符。修复后同文件 16/16 通过，包含真实新句柄代数投递和两个明确等待窗口；双角色扫描交接断言 stop 返回后及扫描完成后均无句柄、无后续重开/投递。
- `npm run typecheck` exit 0；相关四文件命令 63/63；桌面全套 194 计/193 过/1 失败。唯一失败 `pi-config.test.ts:60` 要求目录结尾为 `ans-cli/.env`，当前仓库为 `ans-runtime`，是既有环境红，未改其生产逻辑/断言。原有首轮寻址 2/2 通过。
- `git diff --check` 与 `git apply --reverse --check /private/tmp/ans-session-preexisting-01a133d2.patch` 均 exit 0，原首轮寻址 patch 可完整逆向匹配。interface sha256 保持 `0ecd28ac00f790878b4f09380ae93cfb07d71ad5b67501aab059f338144795e0`，既有未跟踪 dispatch 测试保持 `2f342694adaa091b0dfe4050f451fc4decad3fa437547f510327db38dd1b6cd9`。
- 源码候选 sha256：session `32ace95d1f43fae58962ed338426a07e8f783ed2882cbe1087494ac959e30180`；renderer `e58d46e0f82a62e632cb6c8069d201902e4c20dab7ca12885ed9eca28567467c`。提交独立核查后源码保持不变。
- Electron 首次沙箱启动 SIGABRT；经自动权限审查运行离线窗口。第一次实际验证前六项同角色确认/历史保留/真实投递/失败和异常/无自动重发通过，附件用例因 harness 未接既有 `app:attach-image` 超时。只补测试主进程接线后重跑，未修改生产源码；该次失败不记为通过。
- 最终 Electron [报告](/private/tmp/ans-session-repair-e2e-final-01a133d2/report.txt)：11 个 `SESSION_REPAIR_*` 全部 true，包括真实图片输入保留、补开失败无 send/无用户气泡、显式恢复无重发；`U1_WINDOWED_TO_BOTTOM`、`U1_NORMAL_TO_BOTTOM`、`U1_REPEAT_TO_BOTTOM` 及全部 `P1_*` 滚动行为通过。`E2E_DONE=1`，报告无 ERROR/WATCHDOG。console 的发送异常原文来自本次主动注入，前端已捕获且错误撤销用例通过。
- 相关[单测日志](/private/tmp/ans-session-focused-tests-01a133d2.log)、[角色全套日志](/private/tmp/ans-session-desktop-tests-01a133d2.log)；项目管理与固定测试角色已独立核查最终源码，独立 Electron [报告](/private/tmp/ans-independent-electron-01a133d2/report.txt)另覆盖真实前端 12 条行为断言。独立报告不替代上述角色自测。

当前状态：本次修复已实施并验证；完整角色套件的一条既有环境失败仍保留。运行中客户应用未更新，没有提交或发布。
