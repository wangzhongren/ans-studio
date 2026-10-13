---
id: state-machine-and-replay-dedup
type: change
title: 真机状态机簇修复——忙态误复位/孤儿会话（并发作废重建 TOCTOU）+ data-state 轮末回 idle + 回放去重（同段消息渲染两遍）
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [boundary-refresh, session-restore, message-queue-and-role-state, p0-halt-and-images]
events:
  - date: "2026-10-13"
    kind: created
    summary: 协调方真机探针交办一组状态机缺陷（su 轮次在跑但忙态 1.5s 翻假/停止钮消失；data-state 永不复位 idle；聊天流无 settled 行）＋客户截图实锤「su 消息整段重复渲染两遍」——并案诊断修复
  - date: "2026-10-13"
    kind: investigated
    summary: 只读 CDP 探针（运行中应用，DevTools 9333）实测：正常轮次 settle 与轮末到达完全对齐（1s/6s 轮次各恰一发 settled；停止钮/忙态全程正确）——排除「适配器多发/早发 settled」；坐实两条：(1) settle 触发的 refreshStaleBoundaries 与用户紧接 send 各自的作废重建**并发 TOCTOU**（晚到方 dispose 误删新会话条目/清 activeRoleId，真机「轮次还在跑忙态翻假/消息落空」的机制）；(2) 回放**无去重**（project:changed→refreshProject→主进程重推历史→整份再追加；运行中 su pane 行模型 2300 行的直接证据）；「无 settled 行」＝虚拟窗口化下尾行未挂载的 DOM 采样伪影（行模型有、滚动到底即见）
  - date: "2026-10-13"
    kind: implemented
    summary: session.ts——作废重建按角色**串行化**（rebuildChains，同 drainChains 先例）+ disposeEntry 身份守卫 + 每个 await 后 TOCTOU 重校验；send 目标角色**入口定格**（并发重建不清空指针/丢消息）+ activeRoleId 复位；renderer.js——data-state 改随 role-state 真实快照（syncChatState：三处校准，轮末回 idle）；回放去重（纯函数 UiLabels.replayPlan：同份幂等 skip / 增长增量 append / 其余 rebuildPane 全量重建）；ui-labels.js——replayPlan/sameReplayRows 纯函数
  - date: "2026-10-13"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 173 计/172 过/1 红（唯一红=既有环境红）；全量 937 计/934 过/2 红（两红均既有环境红）；e2e E2E_DONE=1（231 true；REPLAY_DEDUP_IDEMPOTENT/APPEND/REBUILD、REPLAY_NO_DOUBLE_ON_REFRESH、DATA_STATE_RUN_WHILE_BUSY/IDLE_AFTER_ROUND、SETTLED_ROW_PRESENT 全 true；竞态单测 10/10 确定性通过）
---

# 真机状态机簇修复：并发作废重建 + data-state + 回放去重

**来源**：协调方真机探针（ans-playground/su/重启后）交办三条 + 客户截图「su 的消息整段重复出现两次」。
**属本角色边界内**（`app/desktop/session.ts`、`app/renderer/**`、`test/桌面应用/**`）。

## 0. 机制结论（先排除后坐实；只读 CDP 探针取证，未重启应用）

- **「适配器多发/早发 settled」——排除**：运行中应用插入只读订阅实测——1 秒轮与 6 秒多工具轮各**恰一发**
  settled，且与轮末（回复/`prompt 返回`）对齐；轮次全程忙态=true、停止钮全程可见。
- **「忙态在长轮次中段翻假」——坐实为并发作废重建 TOCTOU**：su 轮末编排**自动重 pin**（改盘上治理文件）
  → 每次 settle 都把 su 会话的边界快照变陈旧 → ① settle 触发的 `refreshStaleBoundaries` 与 ② 用户紧接的
  `send()`（发言前查陈旧）**同时**判出「陈旧」，在各自读盘 `await` 窗口后双双 dispose+重开。旧实现的
  `disposeEntry` 按 key 删、`rebuildIfBoundaryStale` 在 await 后不重验身份：晚到的一方会**误删对方刚重建的
  新会话**（可能已开跑轮次）并推 `busy=false`；且 `disposeEntry` 清 `activeRoleId` 后到者不改写时，用户的
  消息会**落空**（「会话尚未开启」）。真机表现＝「轮次还在跑、忙态翻假、停止钮消失」。复现：单测把两条
  路径并发触发——修复前 10/10 中 9 次消息落空/忙态终态 false；修复后 10/10 恰一次作废、恰一次重建、
  条目保活、消息送达、忙态终态 true。
- **`data-state` 永不回 idle——坐实（独立缺陷）**：pill 退役（2026-10-13 前批）后，`run` 只在开启会话时
  写入、**全代码无回 idle 路径**（`setState("idle")` 仅在换项目重置处）。
- **「没有 settled 行」——DOM 采样伪影（非缺陷）**：Q-2 虚拟窗口化下离屏行不挂载；运行中 su pane 行模型
  2300 行、视口不在尾部时 `querySelectorAll('.sys-settled')` 恒 0；滚动到底即见（实测 1 条在场），
  行模型里恒有。settled 行**该出现且出现**，无需改发射/渲染语义。
- **「同段消息渲染两遍」——坐实＝已登记缺陷触发在案**：su 写文件（或任一 su 轮末）→ `project:changed` →
  渲染侧 `refreshProject` → 主进程对每角色**重推**会话历史 → `onSessionHistory` **无守卫地整份再回放**——
  轮次越多副本越多（运行中 pane 2300 行的直接证据；客户看到的重复段即 replay 副本）。**重复事件投递
  路径——排除**：生产外推只走 `session:events` 合帧批通道（单发通道仅 e2e 探针用），页面级订阅按次去重后
  实测无重复；此前探针里的「重复事件」是多个探针订阅叠加的观测伪影。

## 1. 修复 A：作废重建串行化 + 身份守卫（session.ts）

- **按角色串行链 `rebuildChains`**（同 `drainChains` 先例）：`rebuildIfBoundaryStale` 拆为
  串行壳 + `rebuildIfBoundaryStaleUnsafe`——并发触发方**等前一个重建完全收尾**再查；那时条目已是新会话
  （快照新鲜）⇒ 无陈旧 ⇒ no-op。绝不双 dispose/双开。
- **`disposeEntry` 身份守卫**：只释放**仍在表中的同一引用**（`get(roleId) === entry`）——被替换 ⇒ no-op
  （纵深防御：即便绕过串行链也不误删新会话）。
- **每个 `await` 后 TOCTOU 重校验**：读盘 diff / 会话文件探测之后，**同一引用、仍未开跑**才继续。
- **`send()` 目标角色入口定格**：用户在按下发送那一刻的目标角色为准——并发重建清空/替换 `activeRoleId`
  不再使本条消息落空；指针被并发清掉时按用户意图复位（用户期间开了别的角色则不抢位）。忙时入队同样
  按定格目标（不按「当下的 activeRoleId」）。

## 2. 修复 B：data-state 随真实快照回 idle（renderer.js）

- 新 `syncChatState(roleId)`：`#chat[data-state]` **只随 role-state 真实快照** `state.roleBusy`
  （与停止钮同一单一数据源）——有轮次在跑 = `run`、空闲 = `idle`。三处校准：`setChatHeader`
  （选角色/换项目/开启）、`onRoleState`（快照推送，正看着该角色时）、开启成功路径。
- 旧「开启即写死 run」（`setState("run", "聊天中")`）退役；`err` 两处（开启失败/异常）保留
  （下一次快照/切角色再校准）。

## 3. 修复 C：回放去重（ui-labels.js + renderer.js）

- 纯函数 `UiLabels.replayPlan(prev, nextRows)`（可独立单测）返回三态：
  - **skip**——与上次回放**逐字段相同**（kind/text/at/requestId/anchorKey/anchor 全等）⇒ 幂等 no-op
    （重推不再叠加副本——客户重复渲染修复核心）；
  - **append**（from=旧行数）——新行 = 旧前缀逐字段一致 + 追加尾巴 ⇒ **增量回放**（盘上文件增长路径）；
  - **full**（from=0）——首次 / 内容不一致（重写、截断、字段变）⇒ **全量重建**：`rebuildPane`
    作废旧 pane（行模型/回放锚点表随 pane 重建、请求登记表保留待重物化）后全量重放——**绝不追加第二份**。
- `replayHistory` 记住每角色上次状态（rows/error/projectRoot；随项目作废）；错误态变化（出现/消失/文案改）
  强制全量（旧错误分隔行不残留）；错误分隔行只在全量路径插入。

## 4. 测试与证据（2026-10-13；Node v24.14.0 / Darwin arm64）

- **新单测** `session-rebuild-race.test.ts`（2 例）：并发作废重建（refreshStaleBoundaries × send）——
  身份守卫+串行下**恰一次作废、恰一次重建、条目保活、轮次不被误删、消息送达、忙态终态 true**（修复前
  该并发序列 10/10 中 9 次令消息落空且忙态终态 false——修复后 10/10 确定性全过）；busy 期间两条检查
  路径都跳过（不误删/不误复位；L-1 入队语义不回退）。
- `renderer.test.ts`：+2（replayPlan 纯函数六态断言——同份 skip/增长 append/字段变·截断·同长不同内容·
  锚点字段变全量 + 渲染接线钉；data-state 修复钉——syncChatState 三处校准、旧写死 run 退役、err 保留）；
  D-1 钉更新（错误分隔行只在全量路径）。
- **e2e**（真实 Electron）：`REPLAY_DEDUP_IDEMPOTENT`（同份重推行数不变）/`REPLAY_DEDUP_APPEND`
  （增长 +2）/`REPLAY_DEDUP_REBUILD`（重写后恰为新集合）/`REPLAY_NO_DOUBLE_ON_REFRESH`
  （refreshProject 真链路重推不增行）；`DATA_STATE_RUN_WHILE_BUSY`/`DATA_STATE_IDLE_AFTER_ROUND`
  （慢轮缝真忙 ⇒ run；settle 后 ⇒ idle）；`SETTLED_ROW_PRESENT`（settled 行在聊天流如实出现）。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **173 计 / 172 过 / 1 红**
  （唯一红＝既有环境红）；全量 → **937 计 / 934 过 / 2 红**（两红均既有环境红）；e2e → **E2E_DONE=1**
  （231 true / 2 个既有预期 false）。
