---
id: operator-card-delivery-and-tool-rows
type: change
title: 真机缺陷修复（交互卡只在被查看的会话可见）+ 工具行瘦身（只显示状态与目标）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-cards-and-finalize-removal]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户真机暴露——交互卡在未查看的会话里不可见（110s 空转超时）；逐行核查定位唯一可复现路径（roleId 回落当前查看角色）；同轮并入客户追加的「工具行只显示状态与目标」
  - date: "2026-10-12"
    kind: implemented
    summary: renderer 严格路由 + 挂起登记表（去重/补挂/过期终态）+ 跨 pane 只读指针 + 徽标按挂起集重算；customer-input.ts 增 expired 终态标记；新增 app/renderer/tool-rows.js（纯函数瘦身映射）并接线实时/回放工具行；测试与 e2e 同步
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 111 计/110 过/1 红（唯一红为既有环境红）；全量 756 计/753 过/2 红/1 skipped（两红均既有环境红，非本改动）
---

# 交互卡投递修复 + 工具行瘦身（2026-10-12）

**来源**：①客户真机缺陷（实现者角色的交互卡在自己的 pane 里不可见、切走后无从得知 → 110 秒空转超时）；
②客户追加裁定：「read 内容不用展示，只显示是否读取成功了，就行了。修改之类的都不用展示。」

> **状态：已实施、已验证。** 实施面：`app/renderer/{renderer.js, tool-rows.js(新), index.html}`、
> `app/desktop/customer-input.ts`、`test/桌面应用/**`、本页。e2e 已同步（`OPX_*`/`TOOLROW_*` 检查点），
> **本轮未跑**（真实 Electron 验收属「客户跑」）。
>
> **G-1 修订（同日）**：本文的「过期终态/超时」语义已按客户裁定收窄为「**唯一失效＝应用重启/关闭**」，
> 卡片**不再按时间过期**——现行文案与钉子见 `2026-10-12_change_no-timeout-cards.md`；本页保留为当时记录。

## 一、根因（文件:行）+ 修法

**能产生该症状的唯一代码路径**：修复前 `app/renderer/renderer.js:295` 的
`var roleId = … ? payload.roleId : state.selectedRoleId;` ——**roleId 为空/缺失时回落"当前查看的角色"**，
卡因此被落进**当时正在看的那个 pane**：不在请求者自己的 pane（切回看不到）、也不在任何"提示"里
（「切走了就无从得知」）。附带两点薄弱：B-3 徽标只在 `appendOperatorRequest` 里置位（误落时徽标也亮在**错的角色**上）；
卡片无「重物化」与「过期终态」语义。

**payload.roleId 何时会空**：正常链路（`customer-input.ts` 每会话闭包恒带 roleId，session.ts:412-414 绑定）
**不会**；真机上出现的具体来源**未能确证**（现场无日志可查）。因此修法**不纠结"为何为空"**，而是把
这条错误路径彻底移除并升级为登记表驱动：

| # | 修法 | 落点 |
| --- | --- | --- |
| 1 | **严格路由**：roleId **只信 payload**；为空走显式兜底 `"(未标识角色)"` 并如实提示——**绝不**冒充当前查看角色 | `renderer.js::appendOperatorRequest` |
| 2 | **挂起登记表** `opRequests`：把「请求」与「渲染」解耦——一条请求**一次渲染**（幂等；同 id 重复推送只补挂不重卡）；状态 `open/decided/expired` 与 finalNote 存档 | 同上 + `materializeOperatorCard`/`cardInPane` |
| 3 | **切回补挂**：`showPane` 重挂时按登记表补挂未决卡（正常路径卡随 pane 元素存活；本钩子防 pane 重建丢卡） | `renderer.js::showPane` |
| 4 | **可见性**：请求不属于当前查看角色时，向当前 pane 放**只读指针**「【待确认】角色 <X> 有一条交互请求等你作答——点左侧该角色查看」；**徽标按"任一 open 请求"重算**（多请求并存正确） | 同上 + `refreshAwaitingBadge/openRequestCountFor` |
| 5 | **过期终态**：`respond` 对「无挂起请求」（超时/已被处理）回 `{ok:false, expired:true}`——卡片**定格**为「该请求已结束（超时或已被处理）——未获同意。」，**不再解冻重试**（防对已死请求反复触发）；可重试的非法决定**不带** expired | `customer-input.ts::respond` + renderer submit 分支 |

**与 110 秒窗口的关系（我的选择）**：**不改计时**——时限的唯一来源留在 Pi适配器工具层 withTimeout，
桌面**不自造第二套计时**；且计时本就从工具调用（=请求送达界面，毫秒级）起算，「未查看」问题本质是**可见性**
而非计时（本次三重可见性：正确 pane 的卡 + 左树徽标 + 当前 pane 指针）。**跨角色建议（未做，供客户拍板）**：
若仍要「时限从卡片**首次可见**起算」：由 **Pi适配器** 扩展契约——桌面在卡片首次挂到可见 pane 时回发一个
`operator-seen` 通知（新增一条轻量 IPC + 通道回调），适配器据其起点重算剩余时限；**谁做什么**：桌面出
`operator-seen` 信号（我方可做，小改动）；适配器出「按 seen 重新计时」（他们做）；**在没有这条契约前，桌面
绝不自己暂停/重启任何计时**。

## 二、工具行瘦身（客户裁定）

新增纯函数 **`app/renderer/tool-rows.js::slimToolRow`**（经典脚本 + node 双环境；renderer 经
`window.ANSToolRows` 取用，加载顺序 vendor→markdown→role-status→tool-rows→renderer）：

1. **只取首行**；2. 掐掉预览分隔「 # 」及其后一切；3. 掐掉「 · 」列表（只留第一段）；
4. 工具名后重复段去重（`read_file：read_file: docs/接口约定.md # …` → `read_file：docs/接口约定.md`）；
5. `工具名：` 后仍是长且无路径的内容（>60 字）→ 折叠 `工具名：…`；6. 总长限 140，超出加「…」。

**接线**：实时 `tool_call`/`accepted` 行与 D-1 **回放**工具行都经它；**`denied` 行保持全量**（拒绝原因与
允许路径是治理信号，不瘦身）；交互卡/回交卡不动；**`detail` 一律不渲染**（防御：即便事件 detail 带长内容
也不铺出——反证：源码不含 `ev.detail`）。成功/失败词与失败原因摘要（限内）保留。

## 三、证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/*.test.ts"` → **111 计 / 110 过 / 1 红**
  （唯一红为**既有环境红** pi-config，未动）；全量 **756 / 753 / 2 红 / 1 skipped**（两红均既有环境红）。
- **卡修复断言**（`renderer.test.ts`）：源码**不得**含 `: state.selectedRoleId;` 回落；`(未标识角色)` 兜底；
  登记表/幂等物化/`showPane` 补挂/`cardInPane` 查重；指针行文案与「仅非当前查看时」守卫；`expired` 终态
  文案与登记；徽标按挂起集重算；通道侧 `expired: true`。
- **通道终态断言**（`operator-wiring.test.ts`）：未知 id → `{ok:false, expired:true}`；非法决定 → `ok:false`
  且**无** expired（可重试）、请求仍挂起、随后合法作答成功。
- **工具行断言**（`renderer.test.ts`）：客户真机样例逐字 → `read_file：docs/接口约定.md`；
  **反向断言**：200 遍「正文内容」的读取结果**不得出现**该内容、多行只取首行、长无路径内容折叠为 `…`；
  成功/失败词与 `EACCES` 原因保留；渲染接线（实时+回放）与 `detail` 不渲染。
- **e2e（已同步、未跑）**：7c `OPX_*`（不在当前 pane 落卡 / 指针出现 / 徽标亮 / 切回见卡 / 同 id 幂等一张 /
  已死请求过期定格 / 作答后徽标熄灭）+ `TOOLROW_NO_CONTENT`/`TOOLROW_HAS_PATH`。

## 不在本轮（登记）

- `operator-seen`（时限从首次可见起算）：**跨角色建议**，见上；未动任何计时。
- 上游（Pi适配器/编排）如需在事件里携带结构化工具字段（替代字符串摘要），属其边界——桌面侧已有防御层
  （瘦身映射 + detail 不渲染），不受影响。
