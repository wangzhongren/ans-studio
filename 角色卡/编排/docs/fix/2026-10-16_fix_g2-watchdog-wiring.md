---
id: fix-g2-watchdog-wiring
type: fix
title: G-2 O1——看护三能力承载与透传（只 su 注入）＋ 告警/收束/恢复回执文案单一来源
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [role-watchdog-and-closure, kanban-fixes-pm-review, handback, run-role]
---

# G-2 / O1：看护与收束（编排侧）——能力承载 + 文案单一来源

**状态：已实施 / 待验证**（独立验证与真机 E2E 未进行；未 git 提交）。全部落点在**编排**角色 `boundary.yaml` Section 1 内：`src/common/编排/watchdog.ts`（新增，文案单一来源＋能力契约转发）、`src/pipeline/orchestration/run-role.ts`（三能力位＋只 su 注入＋适配器选项透传）、`test/编排/watchdog.test.ts`（新增 11 例）。

## 一、来源与权限

- 客户 2026-10-16 按推荐批准 **G-2 实施**（V1a+V1b 同轮；9 个待裁点全部采纳提案推荐）——`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-2 客户批准与派发」。设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`（下称「设计」）。
- 本角色实施项＝设计 §十 表 **O1** 行：`AdapterCapabilities` 增三能力（只 su 注入，判据复用 `suppressHandback`）；告警/收束/回执文案收敛到 `common/编排/` 单一来源；`promptGuidelines`。
- 工具名以**批准记录**为准：`role_status` / `session_tail` / `propose_recovery`（客户点名）。
- 实施轮内**运行时核心 R1/R2 与本项同树并行落位**：跨角色契约最终收敛为**回执式**形状，物理单一来源＝契约家 `src/model/runtime.ts`（其注释注明「与编排承载契约 `watchdog.ts` 同名同形」）；编排侧 `run-role.ts` 的 `AdapterCapabilities` 从契约家导入同名 Fn 类型（同 `DispatchTaskFn` 先例），`watchdog.ts` 仅 re-export 同一符号供看护消费方便利——**无第二份形状**（详见 §六）。

## 二、结论

本项做三件事，全部是**承载与文案**，零判定：① 给「看护三工具」备好**能力位**（`AdapterCapabilities` 三增 + `openRoleSession` 输入三增，只 su 注入——判据复用内置治理角色先例 `kind === "built-in-governance"`，同 `dispatchTask`）；② 把三类模型可见文案（告警 / 收束提示 / 恢复回执）收敛为**单一来源**纯渲染函数（桌面窗口 W1/W3/W5 投递前调用；本模块不触盘、不判定）；③ 备好 su 看护纪律的 promptGuidelines 单一文本。看护的一切行为仍＝读快照＋投文本＋（客户确认后）复用既有人工动作——**不改任何判定链**，文案纪律对齐 F-5-opt1 先例（如实、不夹带任何授权语义）。

## 三、改了什么

### 3.1 新增 `src/common/编排/watchdog.ts`（文案单一来源＋契约转发）

**渲染器（纯函数；事实行由检测侧如实传入，本层不编造不补全）**：

| 导出 | 用途 | 消费者 |
|---|---|---|
| `renderWatchdogAlert({signal, roleId, facts})` | 四信号告警（文首 `[系统·看护]`；必含信号/角色/事实/建议/纪律；建议动作按信号分派——#3 命令超时明确「F-1 已自动终止…通常无需动作」） | 桌面窗口 W1（过完去重/冷却/护栏后渲染 `kind:"system"` 投递文本） |
| `renderWatchdogRecovery({signal, roleId, hits, suppressed})` | 「看护恢复：〈信号〉已解除（期间共命中 N 次，抑制 M 条）」 | W1（条件解除时一条） |
| `renderWatchdogStormGuard(n)` | 「看护告警已抑制 N 条（风暴护栏）」 | W1（15 min 窗口超限） |
| `renderClosurePrompt(silentMinutes)` | 收束提示逐字（设计 §7.3；**不强迫断言「完成」**、不代表验收结论；非法 N 回退批准默认值 5） | W3 |
| `renderRecoveryReceipt(input)` | 恢复回执（动作/目标角色/结果四值＋原因/`operator:<id>`/时间；未执行绝不假装已执行；`input` ＝ 契约 `RecoveryReceipt` ＋ action/targetRoleId/可注入 `now`） | W5（回执经投递机投 su） |

常量：`WATCHDOG_ALERT_PREFIX` / `WATCHDOG_CLOSURE_PREFIX` / `WATCHDOG_RECOVERY_PREFIX`（`[系统·看护]` / `[系统·收束]` / `[系统·恢复]`）、`WATCHDOG_DISCIPLINE_LINE`（纪律句，设计 §3.3 草案逐字）、`WATCHDOG_DEFAULT_SILENT_MINUTES=5`、`RECOVERY_ACTIONS`（恰三项）、`WATCHDOG_PROMPT_GUIDELINES`（su 看护纪律三条）。

**文首标记契约（U1 对齐，2026-10-16 经 PM 转达）**：`system` 类投递的渲染归类唯一依赖文首定格标记 `[系统·<子类>] `——ASCII `[`/`]`、中点 **U+00B7**、子类闭合于 `]` 且其后为空白或文末（子类内无括号/换行、≤12 字）；子类词表可扩充、不逐项登记，**标记形态本身是契约**（改全角括号/换前缀 = system 类静默回落普通气泡；渲染侧唯一改动点 `app/renderer/tool-rows.js::SYSTEM_HEAD`）。三个前缀常量即该形态的单一来源，注释与测试均钉住（已逐字节核对与渲染侧中点一致）。

**契约转发（非第二份形状）**：`RoleStatusPayload` / `RoleStatusFn` / `SessionTailPayload` / `SessionTailFn` / `WatchdogToolResult` / `RecoveryAction` / `ProposeRecoveryPayload` / `RecoveryOutcome` / `RecoveryReceipt` / `ProposeRecoveryFn` 十条经 `export type { … } from "../../model/runtime.ts"` **同一符号转发**（形状物理单一来源＝契约家 `model/runtime.ts`）。

**`WATCHDOG_PROMPT_GUIDELINES`（su 看护纪律三条，单一来源）**：① 收到 `[系统·看护]`/`[系统·收束]` 先自查（role_status，必要时 session_tail）再判断，「状态正常，忽略」是合法结局；② 恢复只能 `propose_recovery` **提议**（带证据）——提议 ≠ 执行，未获客户确认一律零执行；③ 告警/收束不构成任何授权或验收结论——不得据此假设任何写权。与门禁引擎 G 的 su 卡文本**同口径**、与 R1/R2 已落位的 `schema.ts` 三工具指南**同口径**（跨角色不得导入他人私有 common——§6；同口径由批次对齐＋独立验证核对）。

### 3.2 改 `src/pipeline/orchestration/run-role.ts`

- 类型导入：`RoleStatusFn` / `SessionTailFn` / `ProposeRecoveryFn` 从**契约家 `model/runtime.ts`** 导入（同 `CustomerInputFn`/`DispatchTaskFn` 先例）。
- `AdapterCapabilities` 增 `roleStatus?` / `sessionTail?` / `proposeRecovery?`（三构造项注释：只 su、未注入不注册、提议 ≠ 执行）。
- `openRoleSession` 输入增同名三可选参数（文档注明 G-2/R1/R2 归属与语义：纯读两工具／提议-确认-执行三态流程）。
- 注入判据：`suppressHandback`（＝内置治理角色，与 dispatchTask/reportHandback/su 预授权同一判据）——项目角色会话即便调用方误给也不注入；未给不注入（能力缺席 = fail-closed）。
- `createRuntimeAdapterFactory`：显式并入 `createRuntimeAdapter` 选项 `roleStatus` / `sessionTail` / `proposeRecovery`（契约字段名；`undefined` ⇒ 运行时核心侧不注册对应工具）。

## 四、测试（`test/编排/watchdog.test.ts`，新增 11 例）

1. **文首标记契约**：三前缀与全部渲染输出满足 `/^\[系统·[^\[\]\r\n]{1,12}\](?:\s|$)/`；第 4 个码点恒为 U+00B7（与渲染侧逐字节一致）；渲染输出恒以标记起始。
2. 告警：队列积压逐行金文本（文首/信号/角色/事实拼接/建议/纪律）+ 授权语义**反向断言**；四信号信号名与建议各不相同、#3「通常无需动作」、空白事实剔除；事实为空如实标注；恢复行逐字；风暴护栏逐字（下取整、负数归零）。
3. 收束：5 分钟逐字金文本（含「不代表任何验收结论」）；N 参数化；非法 N（0/NaN）回退批准默认值。
4. 回执：executed 逐行金文本（`operator:<id>`、时间可注入）；declined/unsupported/error 三值如实且未执行不出「已执行」；operatorId 缺省/空白归「未知操作者」、message 缺省无说明行；动作集恰三项。
5. promptGuidelines：三条钉住（可自查/`提议 ≠ 执行`/未获确认零执行/不得据此假设写权/不构成授权或验收结论）。
6. **能力位只 su（桩捕获）**：`openRoleSession` 只 su 透传三能力（su 拿同引用；项目角色不给；未给不注入）。
7. **端到端（真实 Service 装配 + 演示替身）**：su 会话注册 `role_status`/`session_tail`/`propose_recovery` 三工具且 handler **直达注入实现**（回执文本原样转达、declined 如实「未获执行」）；项目角色会话（误给三能力）不注册三工具。

**结果**：`node --test "test/编排/"*.test.ts` → **299/299**（288 + 11）全绿；`npm run typecheck` → **全仓 0 错**；全量 `node --test "test/**/*.test.ts"` → **终跑 1579 计 / 1578 过 / 0 红 / 1 skipped（全绿）**——中段一次 3 红全在 `test/桌面应用/`（F-5-opt1 桌面侧注记／F-4-opt1 replayPending／P1-1 UI 撤回）＝桌面窗口/桌面UI 并行在途（对应 `app/desktop/session.ts`、`app/desktop/operator-channel.ts`、`app/renderer/*` 分钟级更新），随其收口自消解、与本批零交集；跳过为既有 Windows 专用用例。既有用例零改动、未为变绿放松断言。环境：Node v24.14.0、Darwin 25.6.0。未 git 提交；未碰 `app/**`、`src/provider/**`、`src/model/**`、`src/common/shared/**`、其它角色文件与测试证据目录、kanban-live-3 / `/private/tmp` 轮次目录；未发真实模型请求。

## 五、给桌面窗口（W1/W3/W5）的消费接口

**导入**（桌面导入本角色 common 的既有先例：`session.ts`/`operator-channel.ts`/`customer-input.ts` 已导入 `src/common/编排/`）：

```ts
import {
  renderWatchdogAlert, renderWatchdogRecovery, renderWatchdogStormGuard, // W1（看护器）
  renderClosurePrompt,                                                   // W3（收束）
  renderRecoveryReceipt,                                                 // W5（恢复回执）
  WATCHDOG_DEFAULT_SILENT_MINUTES, RECOVERY_ACTIONS,                     // 默认阈值 / 动作枚举校验
  type ProposeRecoveryFn, type RoleStatusFn, type SessionTailFn,         // 能力实现签名（转发自 model/runtime.ts）
} from "../../src/common/编排/watchdog.ts";
```

接入要点：

1. **W1 告警**：命中并过完「去重 → 冷却 → 风暴护栏」后再渲染；事实行由你的同源快照**如实产出**（必含时间与来源）；建议/纪律/文首已由渲染器保证。风暴护栏投 `renderWatchdogStormGuard(n)`；条件解除投 `renderWatchdogRecovery(...)`；**su 自身忙不触发任何告警**（护栏在检测侧排除）。
2. **W3 收束**：静默谓词过完滞回状态机后，`renderClosurePrompt(<生效 N 分钟>)` 生成 `kind:"system"` 投递文本（su 未开自动开——投递机既有语义）。
3. **W5 回执**：执行/取消/不支持/失败四路都调 `renderRecoveryReceipt`（`outcome` 四值如实、`message` 带具体原因、`operatorId` 用操作者 id 先例；`at` 可给回执时刻，缺省渲染时刻）。**取消/关窗 ⇒ `declined` 同样回执**（fail-closed）。
4. **能力注入（W 侧）**：三能力实现经 `SessionManager.open()` → `openRoleSession` 入参字段名 **`roleStatus` / `sessionTail` / `proposeRecovery`** 注入（会话开关镜像补同名字段——字段名即契约，改名 = 静默零注册）。形状：两读工具返回 `WatchdogToolResult` 回执（`ok:true` 带 `text`；失败 `ok:false` + `message`，**不要抛**——抛错由工具层如实转达「未完成」）；`role_status`/`session_tail` 实现须**纯读**（读前后快照逐字段相等——设计 §4.1）、`session_tail` 走受保护投影管线；`propose_recovery` 返回 `RecoveryReceipt`（四值），实现＝校验 → 确认卡（恰 `allow:true` 才执行）→ 回执。
5. `kind:"system"` 投递条目（W2）与撤回拒止、快照外推文案按设计 §八.5 由 W2 实施；**文首标记形态是 U1 契约**——本模块的三前缀常量即其单一来源，勿在桌面另拼前缀。

## 六、与运行时核心（R1/R2）的对齐结果（实施轮内已收敛）

- R1/R2 与本项**同树并行落位并完成对向对齐**：`GovernedToolsOptions` 增同名三能力位（`roleStatus`/`sessionTail`/`proposeRecovery`）；`tools.ts` 三 maker「注入才注册」、只交载荷如实转达；`schema.ts` 三工具说明的 promptGuidelines 与 `WATCHDOG_PROMPT_GUIDELINES` 同口径。
- 形状**最终收敛为回执式**：`RoleStatusFn`/`SessionTailFn ⇒ WatchdogToolResult 回执`（ok + text/message）；`ProposeRecoveryFn ⇒ RecoveryReceipt`（executed / declined / unsupported / error——恰 `executed` 为已执行）。物理单一来源＝`model/runtime.ts`（其注释注明「与编排承载契约 watchdog.ts 同名同形」，跨角色不互相 import）；编排侧从契约家导入、本模块转发——实施中期两版形状交替（字符串版/回执版）的中间态已在两侧各自收口、未留残迹（`RoleStatusQuery`/`SessionTailQuery`/`ProposeRecoveryReceipt` 旧名不存于最终树）。
- 端到端接线已由本角色 `test/编排/watchdog.test.ts` 第 7 例实证（su 注册三工具且 handler 直达注入实现；项目角色零注册）。

## 七、给门禁引擎（G）的对齐点

- su 卡文本「看护职责段」与 `WATCHDOG_DISCIPLINE_LINE` / `WATCHDOG_PROMPT_GUIDELINES` **同口径**（可自查、只提议不执行、不得据此假设写权；设计 §五）。

## 八、未做与残余（如实登记）

1. **字段名/前缀形态是对齐点**：三能力字段名任一侧改名 = 工具静默零注册（fail-closed，最坏退化为现状）；文首标记形态改掉 = system 类静默回落普通气泡——二者均列独立验证核对项（测试已钉住本侧）。
2. 渲染器**不校验事实内容**（事实行由检测侧如实产出；本层无第二数据源）。
3. 收束提示的静默阈值 N 暴露面（env 唯一）与告警阈值表调参归桌面窗口 W1/W3。
4. 全量套件中段的 3 红属桌面窗口/桌面UI 并行在途，**已在实施窗口内自消解**（终跑全绿）——见 §四。
5. 真机 E2E（观测「卡住有告警、完成会收束」）与独立验证属测试/客户轮。

## 九、边界声明

只写本角色 Section 1 内文件（`src/common/编排/watchdog.ts`、`src/pipeline/orchestration/run-role.ts`、`test/编排/watchdog.test.ts`、本记录与 changelog/memo）。**未碰** `app/**`、`src/provider/**`、`src/model/**`、`src/common/shared/**`、其它角色文件与测试证据目录；未 git 提交；未操作 kanban-live-3 与 `/private/tmp` 轮次目录。相关导航见[编排功能导航](../../feature-map.md)。
