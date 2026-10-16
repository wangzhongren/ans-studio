---
id: g2-independent-verification
type: change
title: 2026-10-16 G-2 批次独立验证报告（角色看护与收束 W1-W5/R1/R2/O1/G/U1；测试角色）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [role-watchdog-and-closure, kanban-fixes-pm-review, fix-g2-watchdog-and-recovery, core-g2-status-tools-recovery, fix-g2-watchdog-wiring, g2-su-watchdog-card-fix, desktop-ui-g2-recovery-card-and-system-rows]
events:
  - date: "2026-10-16"
    kind: verified
    summary: G-2 独立复验完成——冻结绑定（HEAD 89c95fe + 68 条目 sha256，结束复算逐字节一致）、全量 1603/1602/0红/1skip + typecheck 0（含我 64 例后 1667/1666/0/1）；范围审计 W1-W5/R1/R2/O1/G/U1 全落地、9 项批准裁定逐条核实、未批准项（非目标）零实施；对抗 64/64 全绿（含契约冻结核对：三能力字段名五面同钉、三前缀字节级一致 U+00B7、桌面闭包→真 openRoleSession→真 createRuntimeAdapter 端到端连通）；发现 0 项不通过、7 项备注/留白（均如实登记、不影响判定）
---

# 2026-10-16 G-2 批次独立验证报告（测试角色）

**验证对象**：客户 2026-10-16 按推荐批准「G-2 角色看护与收束」后、五个实施上下文交回的 **V1a+V1b 同轮**实施：桌面窗口 W1-W5（看护器/`system` 第四类/收束/恢复执行桥/恢复确认卡）、运行时核心 R1/R2（`role_status`/`session_tail`/`propose_recovery` 三工具）、编排 O1（三能力承载与透传 + 文案单一来源）、门禁引擎 G（su 卡看护职责段）、桌面UI U1（恢复卡渲染 + `[系统]` 行样式）。批准口径＝实施基线见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-2 客户批准与派发」（9 个待裁点全部采纳）与 §「G-2 实施收口」；设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`。

**整体结论：通过（0 项不通过；7 项备注/留白，均如实列明、不影响批准范围的落地判定）。**

本报告全部原始证据落在本角色证据目录 `角色卡/测试/docs/change/2026-10-16-g2-verification-evidence/`（下称「证据目录」；`raw/` 下为原始输出）；独立用例在本角色边界内 `test/测试/g2-verify/`（**64 例**：9 个用例文件＋1 个自建夹具 `fixture.ts`——contract-freeze/w1-signals/w3-closure/w2-system-delivery/w4-w5-recovery/r1-r2-tools/r1-desktop-datasource/u1-renderer/scope-audit）。**独立构造**：夹具、注入时钟、假句柄、假快照、演示替身全部自建；不复用实施方断言；对他方源码/测试仅只读引用。全程只写 `test/测试/` 与 `角色卡/测试/`；未改任何 `src/`、`app/`、他角色文件与测试；未 git 提交；`ans-testbed/kanban-live-3`、`/private/tmp` 轮次目录与既有证据目录（kanban/g1 两套）只读未碰。

---

## ① 冻结绑定（本结论对应哪一版代码）

- HEAD＝`89c95fed60ff99c2c6daf33f1516c929fcb252a6`（branch `main`；本批全部改动**未 commit**、停在**工作树**——与 G-1 相同交付形态；`raw/environment.txt`）。
- **冻结集＝G-2 批次全部改动文件 68 条目**（`raw/g2-file-list.txt`；按五份实施记录声明的写集 + 设计文档 + 五角色 changelog/memo/feature-map/api-spec + PM 评审记录 + U1 证据文件组装）：20 源码/应用文件、12 测试文件、36 文档与证据文件；**含新增 4 文件**（`app/desktop/watchdog.ts`、`app/desktop/confirm-card.ts`、`app/desktop/recovery-channel.ts`、`src/common/编排/watchdog.ts`）。
- **全部 68 条目 sha256 已冻结**：`raw/sha256-freeze-begin.txt`；复验结束（全部用例与全量跑完后）逐文件重算 diff → **逐字节一致（68/68）**（`raw/sha256-freeze-end.txt`）。本报告全部结论绑定且仅绑定该版本。验证者自身产出（`test/测试/g2-verify/`、证据目录、本报告、memo）不在冻结集内。

关键实现文件指纹（sha256 前 16；完整 68 条见冻结清单）：

| 文件 | sha256（前 16） | 备注 |
|---|---|---|
| `app/desktop/watchdog.ts`（W1/W3 看护器；新增） | `1091e3a3efb8cd02` | |
| `app/desktop/confirm-card.ts`（W5 共享卡件；新增） | `02d25389a541c633` | |
| `app/desktop/recovery-channel.ts`（W5 恢复卡；新增） | `a514bb5ff7cd0018` | |
| `app/desktop/session.ts`（W1/W2/W4/W5 集成） | `2241e7a914c7dd40` | |
| `src/common/编排/watchdog.ts`（O1 文案单一来源；新增） | `9446459a9b468a59` | |
| `src/model/runtime.ts`（承载契约家） | `e9f56d45cbbd1310` | |
| `src/provider/runtime/tools.ts`（R1/R2） | `c11eb37cbe67fb9b` | |
| `src/provider/runtime/schema.ts`（R1/R2 schema） | `6562b4346a339e94` | |
| `src/pipeline/orchestration/run-role.ts`（O1 透传） | `230b5a660b4920de` | |
| `src/common/门禁引擎/boundary-core.ts`（G 卡文本） | `0dce325173281e82` | |
| `app/renderer/renderer.js`（U1） | `928ffacd5c0db0f4` | 与 U1 记录自报前 8 位 `928ffacd` 一致 |
| `app/renderer/tool-rows.js`（U1） | `02d75fb25de1dd61` | 与自报 `02d75fb2` 一致 |
| `app/renderer/ui-labels.js`（U1） | `564fdb9a66778da5` | 与自报 `564fdb9a` 一致 |
| `test/runtime-core/watchdog-tools.test.ts` | `65bf5035f026a74a` | |
| `test/编排/watchdog.test.ts` | `45ea9bfebf89439f` | |

## ② 全量复跑

| 命令 | 原始计数 | 证据 |
|---|---|---|
| `node --test "test/**/*.test.ts"`（冻结版本、**不含**我的用例） | **tests 1603 / pass 1602 / fail 0 / skipped 1 / exit 0**（19s） | `raw/full-suite.txt` |
| `npm run typecheck`（冻结版本） | **0 错误**（exit 0） | `raw/typecheck.txt` |
| `node --test "test/**/*.test.ts"`（**含**我 64 例后） | **1667 / 1666 过 / 0 红 / 1 skip / exit 0**（= 1603 + 64，零相互干扰） | `raw/full-suite-with-g2-verify.txt` |
| `npm run typecheck`（**含**我 9 个新用例文件后重跑） | **0 错误**（exit 0） | `raw/typecheck-with-g2-verify.txt` |
| `node --test "test/测试/g2-verify/*.test.ts"`（本批复验用例） | **64 / 64 过 / 0 红** | `raw/g2-verify-suite.txt` |

- **1 skip 归属**＝既有 Windows 专用用例（`规范化：Windows 大小写不敏感（仅 win32）`）——与既往一致（darwin 本机）。
- **与实施记录计数精确对账（零差异）**：PM 收口「1603 计/1602 过/0 红/1 跳过」＝我复跑逐位一致；分目录复核与各上下文自报精确一致（`raw/per-dir-counts.txt`）：桌面应用 **345/345**（桌面窗口自报 345/345）、runtime-core **104/104**（运行时核心自报 104/104）、编排 **299/299**（自报 299/299）、门禁引擎 **183/182/0/1**（自报 183/182/1 skip）。
- 记忆中「2 条基线红」（检出目录名断言 / macOS `/var` 符号链接）在当前 HEAD **不复现**——与 PM 收口及多个上下文独立报告一致（复验者本人亦未复现）。

## ③ 范围审计

### 3.1 W1-W5/R1/R2/O1/G/U1 逐项落点（存在性 + 关键符号在位）

| 项 | 落点 | 独立核对 |
|---|---|---|
| W1 看护器 | `app/desktop/watchdog.ts`（新增）：四信号/去重/冷却/风暴护栏/`watchdog.failed` 隔离；`session.ts::watchdogSnapshot`（同源快照）/`observeWatchdog`（事件转发）/`busySince` | ✅ 全在位（`scope-audit` 落点钉）|
| W2 `system` 第四类 | `session.ts`：`DeliveryItem.kind` 增 `"system"`、`watchdogDeliver`、快照/队列视图透传、撤回判据（`kind !== "message"`）、失败如实系统行 | ✅ 行为实证（见 ④.3）|
| W3 完成态收束 | `watchdog.ts`：静默谓词＋预热＋滞回状态机；`session.ts::fromSystemDelivery` 标记 | ✅ 行为实证（见 ④.2/④.3）|
| W4 恢复执行桥 | `session.ts`：`rebuildSession`（新公共入口，在跑拒绝）、`redeliverNudge`（包装既有 drain）、`abort` 复用；`internalReopen` 旗标 | ✅ 行为实证（见 ④.4）|
| W5 恢复确认卡 | `recovery-channel.ts`＋`confirm-card.ts`（共享 pending/replay/expire）、`session.ts::proposeRecovery`、`main.ts` IPC `recovery:confirm-request/-response`＋focus/show/`app:recovery-ready` 重推＋关窗 `rejectAllPending`、`preload.cjs` 两侧接线 | ✅ 行为实证（见 ④.4）|
| R1 两工具 | `tools.ts` 两 maker（注入才注册、8 KiB 字节截断、行数归一、失败如实）；`schema.ts` 两块描述；`GovernedToolsOptions` 两能力位 | ✅ 行为实证（见 ④.5/④.6）|
| R2 `propose_recovery` | `tools.ts` maker（只交载荷、四值如实、活动闸）；`schema.ts` 块；桌面 `proposeRecovery` | ✅ 行为实证（见 ④.4/④.5）|
| O1 承载与文案 | `common/编排/watchdog.ts`（新增：五渲染器＋三前缀常量＋纪律句＋re-export 契约家）；`run-role.ts` 三能力位（只 su 透传）＋`createRuntimeAdapter` 选项并入 | ✅ 源码钉＋端到端（见 ⑤）|
| G su 卡文本 | `boundary-core.ts::BUILT_IN_ROLE_CARD_TEXT`「看护职责」段（位置：J-1 段后、末段边界前；三要素齐备；**段级零命中**「授权/获准/放行」） | ✅ `scope-audit` 行为核 |
| U1 渲染 | `tool-rows.js`（`SYSTEM_HEAD` 归类）、`ui-labels.js`（来源标签/动作映射）、`renderer.js`（恢复卡状态机）、`index.html`/`styles.css`（卡面与行样式） | ✅ 行为＋源码钉（见 ④.7）|

### 3.2 9 项批准裁定逐条落地核实

| # | 裁定 | 独立核实 | 结论 |
|---|---|---|---|
| 1 | 静默 5min / tick 30s **仅 env** | 常量恰 300000/30000；env 名唯一（`ANS_DESKTOP_WATCHDOG_{SILENCE,TICK}_MS`）；非法值回落默认；渲染侧/main/interface **零暴露**（无设置项） | ✅ |
| 2 | 阈值按 §3.2 默认表 | 90%／age 10min／depth 5／冷却 10-10-30min／失败窗 15min×3／风暴 15min≤5——常量逐项恰值＋**边界前后行为**实测（见 ④.1） | ✅ |
| 3 | 恢复动作集**恰** {abort-turn, rebuild-session, redeliver} | 编排/通道/schema 枚举三面同一三值；`disable-role`/`delete-session`/`edit-boundary` 等一律拒绝（工具层零触达能力） | ✅ |
| 4 | 恢复卡**不设限**（零计时器） | 行为钉：挂起 1.2s 真实时间仍 pending、无结算；源码钉：`mount` 恰两参（无 `cleanupAfterMs`）＋通道零 `setTimeout`；渲染侧 `renderer.js` **全文零计时器调用**（无 setTimeout/setInterval） | ✅ |
| 5 | 去重口径沿 F-6 | 活跃期单报＋累计（hit/suppressed 计数）＋解除时「看护恢复」行；跨活跃期冷却；#1 每轮身份天然去重——行为实测（见 ④.1） | ✅ |
| 6 | 工具名 role_status/session_tail/propose_recovery | 三工具名常量/schema 可描述/su 卡引用同名——全链无别名漂移 | ✅ |
| 7 | `system` 呈现细节交实现层 | 队列视图来源「系统」；消息行 `is-system`＋shield 图标＋「系统消息 · 〈子类〉」；撤回钮不出现（只认 message） | ✅ |
| 8 | 完成态**不排除**客户活跃 | 静默谓词恰六项（busy/队列/在途/待确认/链/su 忙），**无**客户活跃项；真实活动（含客户消息）只作重武装信号 | ✅ |
| 9 | V1 **不做界面级提示** | 无 OS 通知/系统托盘/看护角标：`app/**` 零 `Notification`/`Tray`；渲染侧四文件零 `watchdog` 引用；main.ts 看护行不直推渲染通道——告警只进 su 会话＋聊天流系统行 | ✅ |

### 3.3 未批准项/非目标零实施

- 看护器**不自动做恢复**：`watchdog.ts` 无 `abort`/`rebuildSession`/`redeliverNudge`/`drainQueue(` 调用；导入面仅四个只读件（时限求值/诊断/RuntimeKind/文案）——源码级审计。
- `watchdogDeliver` 实现＝只入队＋触发现有 drain——零判定/零放行/零中止。
- 非目标（OS 通知/托盘/自动恢复/跨项目聚合/客户活跃感知）均无落点（`scope-audit` 逐项）。

### 3.4 看护永不改判定

- 源码面：看护模块不含任何 gate/写权/队列语义代码；`system` 条目在撤回判据中被拒（治理流只读面）；渲染文本（四类）行为面逐字检视**零授权语义**（无「已授权/已放行/获准/授予写权」）。
- 行为面：W1 告警/W3 收束投递后队列语义不变（条目仍在、撤回仍拒、既有 handback/dispatch/message 语义回归全绿）；恢复执行**仅在客户确认卡恰 allow:true 后**经既有动作 API（abort/rebuild/drain）发生——看护自身从不操作判定链。

## ④ 对抗性核对（独立用例 64 例 / 9 文件 / 全绿）

### 域一览

| 域 | 文件 | 例数 | 结果 | 关键实证 |
|---|---|---|---|---|
| W1 四信号对抗 | `w1-signals.test.ts` | 14 | ✅ | 恰 90%（107999 不报/108000 报）；挂起确认卡排除＋解除恢复；su 自身忙排除（#1-#4）；身份更替恢复行计数如实（N=1）；#2 age 恰 10min/深度恰 5 边界；活跃期单报＋累计（N=3/M=2 如实）＋冷却恰 10min 边界；#3 单次即报/冷却恰边界/无恢复行；#4 恰 3 次（completed/aborted 不计）＋恰 15min 剪枝＋冷却 30min；风暴护栏（5 报＋通告恰一条＋抑制数如实＋窗口滑出恢复）；从未投出者解除**不**投恢复行；看护异常隔离（tick 不抛/恢复）；投递端抛错＝未投出（重试不占冷却） |
| W3 滞回对抗 | `w3-closure.test.ts` | 7 | ✅ | 预热（无 settled 永不触发）；静默恰 5min（差 1ms 不投/恰值投恰一条，「已持续 5 分钟」）；每窗口至多一条（再静默 20min 不重发）；system 持有的 settle 不重武装；真实活动（activity/settled）重武装后满 N 再投；静默谓词五项逐一拦下并重置起点；**投递失败不消费窗口**（重试恰一条） |
| W2＋集成 | `w2-system-delivery.test.ts` | 4 | ✅ | su 忙入队→settled 后**逐字送达**；快照 kind=system/来源恒空/`watchdog\0` 键；**不可撤回**（拒且条目不丢）；失败如实行「未丢弃」＋队首重试送达；busySince=turnStartedAt 同源；`display.process.timedOut` 结构化观察；lastTurn 落表进 role_status；`fromSystemDelivery=true` 标记＋不记活动；W3 集成：收束经真投递机达 su 恰一条，su 回复不催第二条，客户消息重武装后再投 |
| W4/W5 恢复链 | `w4-w5-recovery.test.ts` | 6 | ✅ | 卡字段逐字段（id `rp-`/证据逐字/requestedBy/时刻/项目与引擎随带）；**恰 allow:true 执行**（abort 恰一次）＋同 id 再答 expired（恰执行一次）；取消/`allow:"true"` 字符串/关窗 ⇒ declined（绝不呈已执行）；通道未接线 ⇒ declined；五种非法载荷 ⇒ error 且**零推卡零执行**；unsupported（句柄不带 abort）/error（在跑不打断）如实；rebuild 空闲 ⇒ executed（旧句柄 dispose 恰一次＋新一代）；回执双路（工具值＋`[系统·恢复]` 投回 su＋UI 系统行）；redeliver itemId 不存在如实/目标忙「仍在队列」不谎报已投出；declined 过程零写盘 |
| R1/R2 工具层 | `r1-r2-tools.test.ts` | 8 | ✅ | 注入才注册逐项；role_status 纯读接口＋**8 KiB 字节级**（恰 8192 不截/8193 截总 ≤8192＋truncated 标注；CJK/emoji 不劈码点/代理对；截断＝原串前缀）；契约外回执 fail-honest/抛错「读取未完成」/非法 roleId 零触达/预中止零触达；session_tail 行数归一 40/200＋clamp 如实标注/非法参数零触达/失败如实；propose 载荷逐字段＋metadata 与 dispatch 先例一致/回执四值如实（后三值绝不当已执行）/契约外 fail-closed/活动闸 begin·end 恰一次（抛错路径 finally 收口）/预中止·中途中止「未获结果」不承诺 |
| R1 桌面数据源 | `r1-desktop-datasource.test.ts` | 3 | ✅ | **纯读保证**：调用前后同源快照**逐字段相等**＋零外推/零事件/零投递；role_status 文本结构（项目/时间＋su 行＋角色行＋队列明细含 id＋最近一轮＋「看护：未接线」如实降级/注入后如实）；session_tail 无历史如实（来源/规范行/跳过 结构） |
| U1 渲染侧 | `u1-renderer.test.ts` | 5 | ✅ | 归类（三前缀＋扩充子类均 system；全角/未闭合/U+30FB 冒牌等 8 变体不误伤；实时=回放同解）；来源标签「系统」；动作映射恰三枚＋未知 null；恢复卡源码钉（恰 allow:true 回传/取消·Esc·×＝false/取消默认焦点/证据 textContent/失效「未获执行」/零计时器/两卡 Esc 顺序）；撤回只认 message |
| 契约冻结核对 | `contract-freeze.test.ts` | 6 | ✅ | 见 ⑤ |
| 范围审计 | `scope-audit.test.ts` | 11 | ✅ | 见 ③ |

### 直接驱动的独立接口面

- **桌面注入闭包捕获**：以 stub `openRoleSession` 捕获桌面实际传入的能力闭包（`roleStatus/sessionTail/proposeRecovery`），直接驱动 → 一手验证 manager 层行为；
- **端到端全链**：把桌面构建的输入**原样**交给**真** `openRoleSession` → 真 `createRuntimeAdapterFactory` → 真 `createRuntimeAdapter` → 真 `buildGovernedTools`（仅引擎换演示替身）——su 三工具注册且 handler **直达 manager 数据面**（role_status 文本含真实项目根）；项目角色零注册；
- **真通道驱动**：恢复流用真 `createRecoveryConfirmPresenter`，`respond/rejectAllPending` 真实回包驱动 `恰 allow:true` 判据（含 `allow:"true"` 非布尔的对抗输入）。

## ⑤ 契约冻结核对（关键静默失效面）

| 核对项 | 方法 | 结果 |
|---|---|---|
| 三能力字段名 `roleStatus`/`sessionTail`/`proposeRecovery` 全链一致 | ①源码精确钉**五面**（契约家 GovernedToolsOptions／O1 AdapterCapabilities＋注入判据＋选项并入／运行时核心 options 读取与注册）②真 openRoleSession 桩适配器捕获（su 原引用/项目角色与未给零注入）③桌面输入捕获（su 有闭包/X 为 undefined）④全链端到端（工具存在且 handler 生效） | ✅ **改名即静默零注册**的风险面已被四条独立证据链锁死；承载契约物理单一来源＝`model/runtime.ts`（编排 re-export 同符号，**不得另立第二份**已钉） |
| 三文首标记 `[系统·看护]`/`[系统·收束]`/`[系统·恢复]` 字节级 | 逐字符断言：ASCII `[`/`]`、第 4 码点＝**U+00B7**、无全角括号；四渲染器输出恒「前缀＋ASCII 空格」起始；与 `tool-rows.js::SYSTEM_HEAD` 归类行为对齐（含 U+30FB 冒牌中点不归类）；全仓仅一处定义（编排常量；su 卡/工具 schema 为引用文字） | ✅ **改前缀/改形态即静默回落普通气泡**的风险面已钉 |
| 独立断言 | 上述每项均写有独立断言（源码钉 + 行为钉），与实施方断言无复用 | ✅ |

## ⑥ 备注/存疑与留白（如实登记；均不影响判定）

1. **#4 窗口剪枝边界口径**：恰 15min 时首批记录被剪（严格 `<` 半开区间）→「15min 内第 3 次」按 strictly-below 解读。行为与本机常量一致、设计 §3.2 未明示端点；如实记录备真机调参。
2. **「su 自身忙不报」也抑制 su 的命令超时告警**（其轮次内 F-1 事实不投）——设计 §3.3 字面口径的推论，桌面窗口记录 §五已如实登记；真机观测后可调。
3. **`role_status` 的「规范行 N 条/跳过 M 行」＝解析口径**（非文件物理行数）——桌面窗口记录 §五已登记；文本结构如实，无编造。
4. **#2 的 depth ≥5 辅判**在单条 age 未到时即触发（表 §3.2 OR 语义）——设计明示；误报面列真机观测项。
5. **桌面队列行摘要自带「系统·看护」字面**（`系统·看护 · …` 摘要形式）——属呈现面短句（裁定 7 交实现层），**非**文首标记契约的第二份来源（标记常量全仓唯一，已钉）。
6. **PM 登记的编排 `api-spec.md:53` 行尾空行**：独立复核该行为空行、行尾无空白字符；维持「属主待清、非阻塞」登记，未发现其他残留。
7. **留白（如实，不声称）**：① 真机 E2E（收束时间线/异常→排查→恢复全链/F-1 回归观测/无泄漏 grep/不打扰五项）**未做**——按 PM 安排属 E2E 轮；② 「su 收到告警先核查、只提议不执行」模型侧**无机械强制**（文案＋卡纪律，设计 §十一/ G 记录已登记残余）——属真机观测项；③ Windows 分支（taskkill 等）未真机执行（darwin 本机，既有登记）。

## ⑦ 证据索引（均为原始输出）

- 冻结：`raw/g2-file-list.txt`（68 条目）｜`raw/sha256-freeze-begin.txt`｜`raw/sha256-freeze-end.txt`（结束复算，逐字节一致）
- 环境：`raw/environment.txt`（HEAD/node/OS/工作树状态）
- 全量：`raw/full-suite.txt`（1603/1602/0/1）｜`raw/full-suite-with-g2-verify.txt`（1667/1666/0/1）｜`raw/per-dir-counts.txt`（四目录对账）
- typecheck：`raw/typecheck.txt`｜`raw/typecheck-with-g2-verify.txt`（均 0 错）
- 复验套件：`raw/g2-verify-suite.txt`（64/64）｜`raw/g2-verify-harness-sha256.txt`（我方 10 文件指纹）
- 设计/批准依据：`角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`；`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §G-2

## 附：裁定修订后审计块刷新（2026-10-16，run-5 复裁跟进）

**触发**：客户 2026-10-16 run-5 真机观察后复裁——完成态收束静默阈值默认 **5 min → 30 s**（推理：全角色空闲＋队列全空＋无在途＋无待确认时系统已不可能产生新的自动活动，5 分钟纯属延迟；30 s ＝一个 tick 的最小防抖）；冻结接口改 **`renderClosurePrompt(silentMs)`**（毫秒入参、floor 自适应「N 秒 / N 分钟」）；编排常量**保名改值** `WATCHDOG_DEFAULT_SILENT_MINUTES` 5 → **0.5**（名字沿「分钟」口径＝30 000 ms）；桌面 `WATCHDOG_SILENCE_MS` → **30_000**（env `ANS_DESKTOP_WATCHDOG_SILENCE_MS` 可调保留）。PM 记档：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md`「客户裁定修订」。本角色独立验证套件原钉旧裁定值 ⇒ 4 条断言红（裁定 1 审计块 1 条、W3 3 条），按复裁刷新。

**改了什么**（只动本角色 `test/测试/g2-verify/` 3 文件的旧裁定钉；值全部改指新批准值）：

| 文件 | 刷新点 |
|---|---|
| `scope-audit.test.ts` | 裁定 1 块：`WATCHDOG_SILENCE_MS === 30_000`；`WATCHDOG_DEFAULT_SILENT_MINUTES === 0.5`；**新增**未设 env 回落恰 30_000 断言；**新增**跨模块一致性断言 `0.5 × 60 000 === WATCHDOG_SILENCE_MS`（桌面判定与编排文案回退＝同一复裁值，单侧漂移即红）；零授权语义扫描的 `renderClosurePrompt(5)` → `renderClosurePrompt(30_000)`（真实投递形态） |
| `w3-closure.test.ts` | rig 阈值常量 `SILENCE = 5 * 60 * 1000` → `30_000`（rig 传空 env、不覆盖 `silenceMs` ⇒ **真默认驱动判定**；30_000 与新批准值精确对偶——默认再漂移，差 1 ms 边界即红）；边界文案断言「已持续 5 分钟」→「**已持续 30 秒**」；相关标题/注释同步 |
| `contract-freeze.test.ts` | 两处 `renderClosurePrompt(5)` → `renderClosurePrompt(30_000)`（前缀＋ASCII 空格起始、U1 归类断言原样）——两处旧参本未红（仅前缀断言），按新毫秒语义一并改指（旧参在新语义下渲染「0 秒」，属误导样本，非判定变化） |

**为何是跟进而非放松**：三处均为**同一条断言对新批准值的重钉**——判据与强度逐条保持原样：恰值 `===` 等值断言、差 1 ms 开区间边界（29999 不投 / 30000 投恰一条）、每窗口恰一条计数、前缀/归类判定（契约冻结面）、预热/重武装/投递失败重试等断言零改动。且**净加强 2 条**：① 跨模块默认一致性（0.5 分钟 × 60 000 ＝ `WATCHDOG_SILENCE_MS`）；② 未设 env 的解析默认恰 30 000。`w3` 阈值为**硬编码** 30_000（未改为引用实现常量——引用即随实现放水；硬编码使默认漂移必红）。`w2-system-delivery` 的 `silenceMs: 60_000` 为显式注入的测试口径（非默认钉），新旧裁定下语义均成立，未动。

**复跑计数（刷新后；原始输出 `raw/refresh-*.txt`）**：

| 命令 | 计数 | 结果 |
|---|---|---|
| `node --test "test/测试/g2-verify/*.test.ts"` | **64 / 64 / 0 红** | exit 0（`refresh-g2-verify-suite.txt`） |
| `node --test "test/测试/**/*.test.ts"` | **270 / 270 / 0 红** | exit 0（`refresh-tests-scope.txt`） |
| `node --test "test/**/*.test.ts"`（全量） | **1670 / 1669 / 0 红 / 1 skip / exit 0** | `refresh-full-suite.txt` |
| `npm run typecheck` | **0 错**（exit 0） | `refresh-typecheck.txt` |

- 全量对账：分目录逐位自洽（346+300+104+183+232+29+25+71+110+270 ＝ 1670）；较 G-2 首验记录 1667 计 **+3**——首验之后**接线修复批次与 30 s 修订轮**中两属主（编排/桌面窗口）测试面更新的净增；本角色 64 例与 `test/测试` 目录 270 例计数均未变。1 skip 仍为既有 Windows 专用用例。
- 命令形态注记：字面 `node --test "test/测试/**"` 除测试文件外还命中 4 个目录与 15 个 `.mjs` 手动探针（**非测试文件**）——node 将命中目录当测试文件执行（`Cannot find module`）＋ 9 个探针需真模型凭据/Electron 运行时而非零退出，**13 条非测试条目失败**，与本次刷新及裁定修订无关（`refresh-suites-literal-glob.txt`；逐类定性 `refresh-noise-categorization.txt`）。**测试文件子集**即上表 270/270 全绿。

---

**签署**：测试角色（独立验证上下文，2026-10-16）。本报告只证明「测过的场景通过」，不代替客户的业务确认；未跑真机 E2E 的观测项按上表留白如实交付。
