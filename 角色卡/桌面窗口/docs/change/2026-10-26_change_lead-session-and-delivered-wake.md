# 2026-10-26 主理会话不按容量淘汰 + 交付核证唤醒合并/系统呈现

## 客户原话与授权

1. **主理会话不关闭**（客户指令，已授权实施）：客户把主理（Lead，`primaryRoleId`）的会话设计为**不关闭**。
   现状缺陷：`app/desktop/session.ts` 的 `MAX_LIVE_SESSIONS = 3` 与 `evictBeyondLimit()` 在保活会话超过上限时
   按 LRU `disposeEntry`，主理也会被淘汰。
2. **统筹侧重复唤醒**（客户追加反馈，带截图）：「统筹侧出现多条『你：流程 … 以下步骤已 delivered，等待统筹
   核证』，带『客户消息 / 撤回』标记；同一交付上方还有『交付 · 来自 X』行，看起来就是重复。」

## 行为差异

### A. 主理会话不按容量淘汰（`app/desktop/session.ts`）

- `evictBeyondLimit()` 的淘汰候选新增判据：**跳过该会话所属项目的 `primaryRoleId` 会话**——主理即使最久未用
  也不被 LRU 回收。主理 id 逐会话经 `deps.getListing(entry.projectRoot)` 解析（`isPrimarySession`），
  **不硬编码 `liaison`/`su`**；single/su 与 trio/liaison 同口径。
- **多项目并存**：每个会话按自己的 `projectRoot` 解析主理——A 项目的主理不会被 B 项目误 pin。
- **未改变**：`MAX_LIVE_SESSIONS`（仍为 3）；busy 跳过与 `keepRoleId` 语义；非主理仍按 LRU 淘汰；
  非主理全忙时沿用「暂超限，settled 后下一时机再收」；项目关闭/切换、定向 `stop`、边界陈旧重建等显式生命周期
  不经 `evictBeyondLimit`，行为不变。
- listing 精确 miss 时按斜杠变体兜底（复用既有 `findListingForFeedback`）；listing 暂不可得 ⇒ 该会话不视为
  主理，维持既有淘汰语义（无主理信息时不臆断）。

### B. 交付核证唤醒合并（`app/desktop/interface.ts::wakeStewardForDeliveredSteps`）

- 保留原有「步骤 owner（交付角色）已 settle」前置判断（owner 有活会话/队列/在途投递 ⇒ 等下一次事件）。
- 新增**目标统筹**判据：统筹（convener）忙 / 有排队 / 有在途投递时**不发、也不标已通知**；新步骤留在
  「未通知」集合，等统筹空闲的下一次验收检查**合并为一条**消息，一次列出当时全部待核证步骤。
- 消息带 `[系统·治理核证] ` 文首定格标记（复用渲染侧既有 `[系统·<子类>]` system 行归类路径），
  并以 `sendBackground({ kind:"system" })` 投递：目标忙时入队为 `DeliveryItem kind:"system"`
  （UI 队列显示「系统」、不可撤回），不再冒充客户消息（「你」+撤回）。
- 诊断新增 `acceptance.delivered-wake.skip{reasonCode:"steward-busy"}`。

### C. 主理不再对 delivered 阶段协调/落行

- `coordinationStageOf` 删除 delivered 分支：主理协调**只保留 failed / blocked / aborted**。
- `wakeStewardForDeliveredSteps` 不再调用 `note(...)`，即不再落 `deliveredWaitNote`（「已 delivered，等待统筹
  核证」）系统行；`noteGovernanceCoordination` 删除 delivered 共享指纹/跳过逻辑，delivered 核证只走统筹通道，
  避免主理再派统筹造成双份。
- `wakeStewardForReadySteps` 不再依赖 delivered 指纹（仍以「存在 delivered 待核证」为前置，行为不变）。

### D. `sendBackground` / `send` 显式 system 类别

- `SessionMessageMetadata` 新增内部字段 `kind?: "system"`；`sendBackground` 新增同名输入。
- `send` 目标忙时按 `DeliveryItem kind` 入队（`system` 条目的摘要不写「你：」）；直接投出时 `origin.kind`
  同步记 `system`。**缺省仍是 `message`**：真实客户消息、dispatch、handback 语义逐字不变。
- 使用面仅限治理唤醒：delivered 核证、主理阻塞协调、`[自动推进]` 就绪唤醒。

## 影响面

- 代码：`app/desktop/session.ts`、`app/desktop/interface.ts`。
- 测试：`test/桌面应用/session.test.ts`（LRU 基线夹具改为「主理不参与 open 序列」；新增主理 pin（含多轮使用）、
  多项目各自主理、busy 语义 3 例）、`test/桌面应用/queue-withdraw-lru.test.ts`（新增 system 类别入队/不可撤回 1 例）、
  `test/桌面应用/acceptance-dispatch.test.ts`（delivered 唤醒断言改为「主理不落行」+ 新增统筹忙合并 1 例；
  done-flow 夹具改为 harness 初始化后落盘，消除导入补齐检查抢先派发的既有竞态）。
- 呈现：主理会话常驻（可暂时超过 3 个，直到非主理 settle 后回收）；delivered 核证以系统行呈现、不可撤回；
  主理不再收到 delivered 阶段协调任务/等待核证行。
- 不变：不自动验收、不代批、不写 flow/账本、不新增 IPC/卡片种类；`MAX_LIVE_SESSIONS` 数值不变。
- 残余：共享 i18n 的 `main.interface.deliveredWaitNote` 键保留未删（共享属主）；`[自动推进]` 文案体系未改，
  本次只把其投递类别改为 system（聊天正文归类仍按既有 `[自动推进]` 前缀）；真实 Electron e2e 未运行。

## 验证命令与结果

证据目录：`角色卡/桌面窗口/docs/change/2026-10-26-lead-session-and-delivered-wake-evidence/`

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | exit 0（0 错） | `typecheck.txt` |
| `node --test test/桌面应用/session.test.ts` | 40/40 过 | `session-test.txt` |
| `node --test test/桌面应用/queue-withdraw-lru.test.ts` | 5/5 过 | `queue-withdraw-lru-test.txt` |
| `node --test test/桌面应用/acceptance-dispatch.test.ts` | 74/74 过 | `acceptance-dispatch-test.txt` |
| `node --test test/桌面应用/interface.test.ts` | 137/137 过 | `interface-test.txt` |
| `node --test "test/桌面应用/**/*.test.ts"` | 651/651 过 | `desktop-suite.txt` |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"`（跨角色只读复跑；首次一次 T2 抖动，整目录重跑） | 155/155 过 | `governance-e2e-auto-rerun.txt`（首次含抖动的原始记录：`governance-e2e-auto.txt`） |

**过程如实记录**：调整交付唤醒后，`acceptance-dispatch.test.ts` 的
「request_acceptance：acceptance-criteria pending …」在全套并行负载下两次命中既有竞态——`makeHarness` 的导入补齐
检查抢在 `requestAcceptance` 前自动派发 verifier，账本去重使后者返回 `already-dispatched`；该用例单独运行与整
文件运行均稳定通过。已把该用例的 done 流夹具改为 harness 初始化（含导入检查）之后再落盘，**未放宽任何断言**；
修复后整文件、全套与跨角色复跑均绿。

**跨角色套件抖动（如实登记，非本批改动引入）**：跨角色 `governance-e2e-auto` 首跑一次
`acceptance-triage-e2e.test.ts` 的「T2 可执行 blocker + 判断代批」失败（triage record 读到 `failed`，
期望 `dispatched`；同文件整目录与随后重跑均绿）。只读定位：该用例存在既有的**分诊重试与首次处置竞态**——
`executeAcceptanceTriageDisposition` 先写 interim `failed`（`interface.ts` 3103 行附近；judge 自动路径另在
3648 行附近先落一条执行态），结算后的 `run` 再调 `executeAcceptanceTriageDisposition`；并发的 acceptance check
若在 interim 窗口读到 `failed` 会走 `retryAcceptanceTriageRework`，其再次写入 interim `failed` 可能落在首次的
`dispatched` 之后，测试恰在该窗口读取即失败（最终文件仍会被重试写回 `dispatched`）。该代码段（分诊处置/重试）
本批**未改动**；测试角色 memo（2026-10-25）也登记过该套件的并发时序抖动。本批不顺手重构该竞态；建议由分诊
属主另派收口（例如 retry 前先重读记录状态、或 dispatched 写入后再做一次终态确认）。

## 未做 / 风险

- 未 commit / push；未重启应用；未碰 `demos/castle-2d-v2`；未跑真实 Electron e2e。
- 主理常驻会使 live 数在「主理 + 3 个非主理」时达到 4，直到非主理 settle 后被回收——这是客户「主理不关闭」
  指令的直接结果；非主理之间仍严格按 `MAX_LIVE_SESSIONS`/LRU/busy 规则运行。
- 若 listing 缓存暂时不可得/角色表尚未枚举，主理判据不生效（该会话按既有 LRU 可被淘汰）；下一次枚举后可恢复。
- 统筹忙期间新 delivered 步骤只在内存「未通知」集合累积（不持久化）；应用重启后按当前 flow 状态重新评估
  （与既有 stepId 去重语义一致）。
