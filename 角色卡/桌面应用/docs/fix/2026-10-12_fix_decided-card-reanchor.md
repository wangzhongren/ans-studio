---
id: decided-card-reanchor
type: fix
title: 修复真机缺陷：已决/未决交互卡（重）物化落到聊天流最末尾（锚点物化）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-card-reachability, hot-path-and-virtual-stream, operator-card-delivery-and-tool-rows]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户真机报告「这个确认过的，在聊天里面，切换出去，再回来变成最下面了」——已决交互卡切走再切回跑到聊天流最末尾；真机 CDP 探针取到 DOM 证据（已决卡排在全部消息之后）
  - date: "2026-10-12"
    kind: implemented
    summary: 锚点物化三级落位（① 复用既有行＝主修复；② 同表首物化位 / 回放锚点表插入；③ 兜底落尾绝不丢卡）；回放行带上请求标识（session-history 的 requestId/anchor/anchorKey）；customer-input 载荷带 anchorKey
  - date: "2026-10-12"
    kind: verified
    summary: 真机探针前后对照（修前切回落尾/修后索引恒定）；e2e「回放重建+已决卡」时序断言全 true（E2E_DONE=1）；typecheck 0 错；test/桌面应用 162 计/161 过/1 红（唯一红=既有环境红）；全量 912 计/909 过/2 红（两红均既有环境红）
---

# 修复：交互卡（重）物化落到聊天流最末尾（锚点物化）

## 症状与触发条件

客户原话：「**这个确认过的，在聊天里面，切换出去，再回来变成最下面了**」——已决（已确认/已回「不同意」）的
交互卡，切走再切回后跑到聊天流的**最末尾**（排在它之后发生的全部消息之后）。真机 CDP 探针取到的 DOM 证据
（su 聊天流，按行序）：两张已决卡都排在流尾；切走/切回各一次卡仍在尾部——即每次（重）物化都落尾。

## 根因（真机 Electron 探针确证）

两个因素叠加，缺一不显：

1. **`materializeOperatorCard` 的去重判据按「当前 DOM 子节点」找卡**（`cardInPane` ⇒ `cardElInPane` 遍历
   `pane.children`）。而 Q-2 **窗口化**（≥150 行）后，离屏的 `keepEl` 行被 `updateVirtualWindow` **脱挂**
   （元素实例保留在行表里，但 `parentNode !== pane`）——卡片在行表里**并未丢**，`cardInPane` 却判为
   「丢失」。
2. 判「丢失」后旧实现**重新建卡并 `registerRow` 追加行表尾**（`registerRow` 一律
   `rec.index = rl.rows.length`，无插入位概念）⇒ 卡被搬到行表最末；**且旧行仍持有旧元素**（潜在双份呈现）。
   `showPane` 每次切回都调 `materializePendingFor`（对登记表**全部**条目——含已决卡）⇒ 每次切走切回都触发。

长会话（窗口化）+ 切换角色即复现；**open 与已决卡同病**（未决卡当年恰在流尾，跳尾不可见；卡片一旦被后续
活动推离尾部即暴露——客户所见即已决卡）。探针（真实 Electron + 真实 renderer）修前证据：窗口化 pane 里
已决卡切回后挂载在子节点末尾（流尾）；行表出现该请求的**第二张**卡行。

## 修复后的行为（锚点物化——三级落位，open 与 decided 一视同仁）

卡的（重）物化按**时序锚点**落位（`app/renderer/renderer.js`）：

1. **① 复用既有行（主修复）**：物化先按 `requestId` 扫行表——卡行仍在（哪怕离屏脱挂）⇒ **直接返回，
   绝不重建**。行还在，虚拟窗口滚到它时自会挂回；既修掉跳尾，也修掉「旧行+新行」的潜在双份。
2. **② 按锚点落位（走不到 ① 的防线——行表被整体重建而登记表仍在）**：
   - **首次到达不加锚**：卡就是当下最新事件，**行表尾＝它发生的位置**（此后新行只在其后追加，位置关系
     不再变）——防同题新请求被回放锚点插进历史；
   - 重物化时按优先级取插入位：**同表首物化位**（`entry.anchorIndex` + 行表身份 `seq` 校验）→
     **回放锚点表**（见下）插到「调用工具 request_confirmation」行之后（结论行之前＝两行之间；
     只有结论行可锚时插到它之前）；
   - `registerRow` 新增 `opts.atIndex`（锚点插入 + 其后各行 index 右移重编号——attachRow/卡定位/虚拟窗口
     都按 index 找行，语义不变）。
3. **③ 兜底：追加行表尾**——找不到任何锚点 ⇒ `atIndex=null` ⇒ 追加行表尾。**绝不丢卡**（不丢卡优先于
   落位；落尾的卡仍可被 P-1 chip 定位、作答、定格）——该兜底在代码里写明。

**锚点关联（回放行带上请求标识）**：`app/desktop/session-history.ts` 解析会话 JSONL 时，把
`request_confirmation` / `request_choice` 的**调用行**与**结论行**带上同一标识——`requestId`＝pi
`toolCallId`（调用行经内容块 `id`、结论行经 `message.toolCallId` 配对，**不解析正文**）、`anchor`＝
`"request"|"conclusion"`、`anchorKey`＝请求本体 kind+title 的**单一算法键**（新模块
`app/desktop/request-anchor.ts`；工具名常量只读导入自 §4 冻结契约家所在层 `src/provider/pi/tools.ts`，
不复制字面量）。`app/desktop/customer-input.ts` 的请求载荷同法带 `anchorKey`——两侧逐字可对上。
渲染侧回放时按 `anchorKey` 建「调用行/结论行行序位」表（`paneAnchors`，随项目作废；同题请求问过两次以
最后一次为准），物化时消费。

**两个 id 命名空间为何不用直接匹配（如实）**：渲染侧登记表的 `requestId` 是主进程客户通道的会话内编号
（`op-N`，只活在本进程内存、不落会话文件）；会话文件里是 pi 的 `toolCallId`（`call_00_…`）。请求对象
`CustomerInputRequest` 为冻结形状、不含 toolCallId（本角色边界外不得扩）——故两侧以请求本体
kind+title 键关联。

## 不回归（验收口径逐条）

- **P-1 未决卡滚动**：`scrollToOperatorCard` 按行表找卡（去重后恰一行，定位更准）；切回滚到卡、chip
  计数/逐张定位、到达即达（先量后挂）全部原样（e2e P1_* 全 true）。
- **`#op-chip` 指路 / U-1 到底 / S-1 贴底**：未动（e2e 相应检查点全 true）。
- **行登记表/虚拟窗口语义**：`registerRow` 缺省仍追加（全部既有调用点零改动）；窗口化/Spacer/rAF 合帧
  逐字未动（e2e Q-2/S-1 全 true）。
- **去重**：`cardInPane` 保留（作为行表缺失但 DOM 还在时的防御层）；**去重语义反而变强**——行表里也查重
  （按 requestId），同卡在行模型里恒恰一行（e2e `ANCHOR_NO_DUPLICATE_ROW=true`）。

## 回归验证（真实运行）

- **真机探针前后对照**（真实 Electron + 真实 preload/renderer + 真通道，修前/修后各跑一遍）：
  - 窗口化 pane + 已决卡 + 切走/切回 ×2：修前卡挂载在流尾；修后**不再落尾**（行序索引恒定 213，
    行表尾 333；行模型恰一条卡行）。
  - 回放 pane + 同题请求：回放锚点表登记 `{requestIndex:3, conclusionIndex:4}`（相邻配对）。
- **e2e（`test/桌面应用/e2e/main.mjs` 新增「回放重建 + 已决卡」时序断言段）**：
  `ANCHOR_TABLE_REGISTERED` / `ANCHOR_STABLE_NOT_TAIL_ONCE` / `ANCHOR_STABLE_NOT_TAIL_TWICE` /
  `ANCHOR_NO_DUPLICATE_ROW` / `OPEN_CARD_STABLE_AT_ANCHOR` / `OPEN_CARD_CHIP_VISIBLE` 全 **true**；
  既有全部检查点无回归（`E2E_DONE=1`；194 true / 2 个既有预期 false）。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **162 计 / 161 过 / 1 红**
  （唯一红＝既有环境红 `pi-config.test.ts` 检出目录名断言）；全量
  `node --test "test/**/*.test.ts"` → **912 计 / 909 过 / 2 红**（两红均既有环境红：上处 +
  `test/项目管理/shared/path-primitives.test.ts` 的 macOS /var 符号链接）。Node v24.14.0 / Darwin arm64。

## 已知边界（如实）

- **② 级（锚点插入）在当前架构下属防线**：登记表（`opRequests`）与行表（`paneRowLists`）如今同生共死
  （`resetPanes` 同时清两者），pane 元素不复建——故生产路径恒走 ①；② 的两支（同表首物化位 / 回放锚点表）
  为「登记表存活而行表被重建」的未来/异常形态兜底，其两侧数据（回放行标识、锚点表登记、载荷 anchorKey）
  各有测试钉（session-history 2 例 + renderer 源码钉 + e2e 锚点表断言）。**兜底落尾绝不丢卡**为硬保证。
- **修后行为细微差异（如实）**：旧缺陷会把离屏卡重建到流尾（用户切回立刻看见卡在底部）；修后卡留在原位
  （可能离屏）——未决卡由 P-1 chip 与「切回滚到卡」承担可达性，已决卡本就无需可达性。
- **观察到的相邻缺陷（本轮未修、如实登记）**：`project:changed` → `refreshProject` 会再走一次
  `app:list-project`，主进程对每个角色**再推一次**会话历史 ⇒ 渲染侧对同一 pane **重复回放整份转录**
  （`onSessionHistory` 对同项目无去重守卫）。它与本缺陷同 pane 交互（重复回放会进一步挤压卡的位置感），
  但属独立的呈现缺陷，宜另开任务修（渲染侧按「最近一次已回放的会话文件」去重，或主进程只在导入/切换时推）。
