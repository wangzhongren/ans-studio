---
id: lead-session-and-delivered-wake-acceptance
type: change
title: 主理会话不按容量淘汰 + 交付核证唤醒合并/系统呈现 独立验收——C1–C5 逐项判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: verified-limited
related: [lead-session-pin, delivered-wake-merge, governance-wake-system-kind]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 对未提交工作树（分支 feat/scaffold-first-governance，HEAD 9de56d4）按客户交接口径 C1–C5 独立判定；代码/测试/角色文档 diff 逐条核对，无 skip/only、无弱化断言；本角色独立复跑 typecheck 0、session 40/40、queue-withdraw-lru 5/5、acceptance-dispatch 74/74、interface 137/137（当前快照哈希绑定）；实现方原始证据中 desktop-suite 651/651 与治理 e2e 155/155 经计数/内容核对，e2e 首跑 T2 抖动与变更自述一致且代码段未改动；总体 pass，无 needs-work；真实 Electron e2e 未跑、证据时间戳绑定限制与若干非阻断残余已登记
---

# 主理会话不按容量淘汰 + 交付核证唤醒合并/系统呈现 独立验收

**总体结论：pass（无 needs-work）。** 客户 C1–C5 全部满足；未发现写死标准、绕开门槛或弱化断言。附 **1 项证据绑定限制**（实现方单测/全量证据生成时间早于两个产品源码文件的最后修改时间，本角色已用当前快照定向复跑覆盖改动面；桌面全目录 651/651 未由本角色复跑）与若干**非阻断残余**（真实 Electron e2e 未跑等，见 §六）。建议提交前在冻结快照重跑桌面全目录，并重启应用做一次真机 UI 复核。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写自身 `docs/change/` 与本角色 `feature-map.md` / `memo.md`；未修改产品源码、测试源码、共享 i18n 或其他角色文档；未 commit / push。

## 一、标准与依据

本批为实施完成后的独立验收；客户在交接中直接给出验收标准。为使判定可复核，本报告将其固定为 **C1–C5（事后标准，post-hoc criteria）**，并保留这一过程限制：仓库中没有本批实施前由本角色固定的设计/验收文档。

| 编号 | 验收项 | 主要判据 |
| --- | --- | --- |
| C1 | 主理会话不按容量 LRU 关闭 | `MAX_LIVE_SESSIONS` 数值不变；非主理仍按 busy/LRU 淘汰；主理 id 按**各会话所属项目**的 `primaryRoleId` 解析（不硬编码）；多项目各认各的主理；显式生命周期（项目关闭/切换、边界重建、定向 stop）不变 |
| C2 | 交付核证唤醒合并 | 统筹（convener）忙/有排队/在途时**不逐条发送、也不标已通知**；新 delivered 步骤累积，统筹空闲后的下一次验收检查**合并为一条**；步骤 owner 已 settle 的前置判断保留 |
| C3 | 治理唤醒以系统消息呈现 | 治理唤醒经 `sendBackground kind:"system"` 入队：UI 显示「系统」、不可撤回；不再以客户消息（「你：」+撤回）呈现；真实客户消息 / dispatch / handback 语义不变 |
| C4 | 主理不再对 delivered 阶段落行/派协调 | `coordinationStageOf` 删除 delivered 分支；不再落 `deliveredWaitNote` 系统行；主理只保留 failed/blocked/aborted 协调 |
| C5 | 不弱化/不夹带/不造第二套 | 不弱化断言、不改无关行为、不新增第二套门禁/状态；`MAX_LIVE_SESSIONS` 仍为 3；不 commit/push |

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD | `9de56d4`（验收开始时与结束时一致，未新增提交） |
| 候选状态 | **未提交工作树**：10 个 tracked 修改 + 2 个未跟踪文档（change 记录与证据目录）；`.claude/`、`demos/` 未跟踪，属其他任务，不在候选范围 |
| 候选快照哈希 | `session.ts 1989d051…`、`interface.ts f8d87a76…`、三个测试文件 `196df104…` / `bcf92cad…` / `fc30dde9…`（复核前后一致；完整表见证据索引） |
| 差异摘要 | `git diff --stat` = 10 文件 +373/−89；代码+测试 5 文件 +364/−84 |
| 平台 / Node / npm | Windows 11 Pro 10.0.26300 / v24.22.1 / 11.19.1 |

**候选文件与归属**

| 文件 | +/− | 内容 |
| --- | --- | --- |
| `app/desktop/session.ts` | +38/−6 | `evictBeyondLimit` 跳过各项目主理（`isPrimarySession`）；`sendBackground`/`send` 新增 `kind:"system"`；`origin.kind` 同步 |
| `app/desktop/interface.ts` | +51/−65 | delivered 唤醒：统筹忙门、合并语义、`[系统·治理核证]` 前缀、`kind:"system"`；删除主理 delivered 协调/`deliveredWaitNote`；协调/`[自动推进]` 唤醒改 system 类别 |
| `test/桌面应用/session.test.ts` | +156/−1 | 主理 pin×3（含多轮使用、多项目、busy 语义）；LRU 基线夹具改为「主理不参与 open 序列」 |
| `test/桌面应用/queue-withdraw-lru.test.ts` | +40/−0 | system 类别入队/不可撤回；缺省仍为客户消息类别 |
| `test/桌面应用/acceptance-dispatch.test.ts` | +79/−12 | delivered 唤醒断言改为「主理不落行」+ 统筹忙合并 1 例；done-flow 夹具移到 harness 初始化后落盘 |
| `角色卡/桌面窗口/`（changelog、feature-map、functional-description、memo、docs/feature、change 记录与证据） | — | 与实现一致的变更记录与文档；本角色只读核对 |

## 三、实现核对（逐条标准）

### C1 主理会话不按容量淘汰 —— **pass**

- `MAX_LIVE_SESSIONS = 3` 未变（`session.ts:260`；基线同为 3）。
- `evictBeyondLimit()`（`session.ts:1390-1409`）候选判据依次为 `busy` → `keepRoleId` → **`isPrimarySession(s)`**；`isPrimarySession`（`session.ts:1416-1419`）逐会话取 `findListingForFeedback(entry.projectRoot)?.primaryRoleId` 比对 `entry.roleId`：**按会话所属项目解析，不硬编码 liaison/su**；多项目并存时 A 项目主理不会误 pin B 项目会话。
- listing 精确 miss 时按斜杠变体兜底（复用既有 `findListingForFeedback`，`session.ts:3201-3210`）；listing 不可得 ⇒ 不视为主理，维持既有淘汰语义（不臆断）。
- 非容量路径/显式生命周期不经本方法：`stop`（定向/全部）、同三元身份重开、边界陈旧重建分别走 `disposeEntry`，diff 未触碰（`session.ts:1332/1525/2058/2897/2910/4128` 均无改动）；容量淘汰只有这一处 LRU（全仓 `MAX_LIVE_SESSIONS` 仅 `session.ts`）。
- 测试：`session.test.ts` 新增「主理应 pin…多轮使用」「多项目『各认各的主理』」「busy 语义：非主理全忙 ⇒ 暂超限；settled 后下一时机只收空闲的非主理」3 例；基线 LRU 用例把主理 P 移出 open 序列，原 LRU 断言逐字保留（`disposed=["A"]`、`opened=5`、切回重建等）。本角色独立复跑 **40/40**。

### C2 交付核证唤醒合并 —— **pass**

`interface.ts::wakeStewardForDeliveredSteps`（4207-4306）顺序复核：

1. 读 flow YAML / 解析失败/无 delivered ⇒ 不处理；
2. 只挑「从未通知且不在发送占位」的新步骤；为空 ⇒ 不发；
3. **保留** owner 前置判断：任一 owner 有活会话或排队/在途投递 ⇒ 等下一次事件（与基线一致）；
4. **新增统筹忙门**：`RUNTIME_KINDS.some(isRoleBusy || hasPendingDelivery("convener"))` ⇒ 记录 `acceptance.delivered-wake.skip/reasonCode:"steward-busy"` 并 **return，且尚未写 `deliveredWakePendingSteps`、未写 `deliveredWakeNotifiedSteps`**——即「不发也不标已通知」，新步骤自然累积；
5. 通过后才占位（先占位再跨 await，并发同批只发一条），失败回滚占位；
6. 发送文本一次列出本次全部未通知步骤（合并为一条），成功后才把该批记入已通知集合。

`convener` 硬编码与既有投递目标一致；且本函数两个调用点（`interface.ts:4769/4891`）都位于 `dispatchAcceptanceForFlow` 内，而该函数在 `governanceModel !== "trio"` 时提前返回（`interface.ts:4640-4643`），因此该路径对 single/su 不可达，不存在「single/su 下误用 convener 判据」的新问题。

测试：`acceptance-dispatch.test.ts` 新增「统筹忙 ⇒ 两条 delivered 均不投递；settle 后恰一条合并消息含全部三步；主理不收等待核证行/不触达 `[系统·治理协调]`」；既有 delivered 唤醒用例保留 owner 活跃不抢跑、按 stepId 去重、新步骤再评估等断言。本角色独立复跑 **74/74**。
覆盖说明：「统筹有排队/在途」与 busy 共用同一谓词的另一分支（`hasPendingDelivery`，既有方法），新用例只实测 busy 分支；排队/在途为代码审查通过（非阻断）。

### C3 治理唤醒以系统消息呈现 —— **pass**

- `SessionMessageMetadata.kind?: "system"`（`session.ts:290-296`）为内部字段；`sendBackground` 透传（1650-1664）；`send` 中 `deliveryKind = background && metadata?.kind === "system" ? "system" : "message"`（2731）——**只对 background 投递生效**，缺省 message。
- 目标忙入队：`kind: deliveryKind`（2783），系统条目摘要**不写「你：」**（2787-2788）；直接投出时 `origin.kind = "system"`（2806）——该字段在会话结算链只用于 handback 判定（2569）与队列投递记录，direct system 无判定副作用。
- UI：渲染侧既有映射 `kind:"system"` ⇒ 标签「系统」、`canWithdraw=false`（`app/renderer/src/chat/confirm-logic.ts:194/241`；i18n `shared.common.system=系统`）；撤回层仅 `kind === "message"` 可撤（`session.ts:3567-3571`），因此 system 条目自动不可撤回。`[系统·治理核证]` 前缀可被既有 `classifyInjected` 识别为系统行（`events.ts:522`，子类 4 字 ≤12）。
- 三处治理唤醒均显式 `kind:"system"`：delivered 核证（4288）、主理阻塞协调（4418）、`[自动推进]` 就绪唤醒（4584）。其余 `sendBackground` 调用点未传 kind ⇒ 客户消息/dispatch/handback 语义不变。
- 测试：`queue-withdraw-lru.test.ts` 新用例证明同一忙会话队列里 `["system","message"]` 分类、system 撤回返回只读错误、客户消息撤回仍成功。本角色独立复跑 **5/5**。

### C4 主理不再对 delivered 落行/派协调 —— **pass**

- `coordinationStageOf`（4344-4359）只剩 failed/blocked/aborted 分支；delivered 分支及其 `details` 文案已删除。
- `wakeStewardForDeliveredSteps` 移除 `note(...)` 调用与返回值指纹；`noteGovernanceCoordination` 删除「delivered 共享指纹跳过」逻辑，`governance.coordination.sent` 的 reasonCode 固定为 `blocked`。
- `wakeStewardForReadySteps` 去掉 `deliveredNotifiedHash` 入参；仍以「存在 delivered 待核证」为前置（行为不变）。
- 全仓已无 `main.interface.deliveredWaitNote` 的代码引用（仅 i18n 词条保留，见 §六）。
- 测试：delivered 用例改为断言主理 `deliveredWaitNote` 行数为 **0**（含新步骤再评估后仍为 0），新增合并用例断言主理不收到 `[系统·治理协调]`；既有阻塞协调用例（`interface.test.ts:7142` 起）本角色独立复跑 **137/137**，确认 failed/blocked 协调未回归。

### C5 不弱化/不夹带/不造第二套 —— **pass**

- 三个测试文件无 `skip`/`only`/`todo`；唯一改写旧断言的 delivered 用例，是把「主理恰一条等待核证行」改为「主理零行」（**新行为本身的要求**），同时新增系统前缀、合并、去重等更强断言；`request_acceptance` 用例只把 done-flow 夹具移到 harness 初始化之后（+`sleep(150)`），**断言零改动**，diff 可核。
- 无新增 IPC 通道/卡片种类/账本 kind；`DeliveryItem.kind` 的 `system` 值系既有（G-2/W2 看护/回执在用），本次只是新增显式入口；`deliveredWakeNotifiedSteps/PendingSteps` 为既有内存去重集合，未引入第二套门禁或持久状态。
- `MAX_LIVE_SESSIONS` 仍 3；`git status` 无 commit/push；`git diff --check` 仅 1 处测试文件 EOF 多一空行（见 §六，风格级）。

## 四、证据核对

### 4.1 原始证据（实现方，Windows 原生）

| 命令 | 声明结果 | 本角色核对 |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | 证据文件只有 npm 横幅、**无显式退出码**；本角色独立复跑 exit 0（弥补） |
| `node --test test/桌面应用/session.test.ts` | 40/40 | 计数与用例名一致；独立复跑 40/40 |
| `node --test test/桌面应用/queue-withdraw-lru.test.ts` | 5/5 | 一致；独立复跑 5/5 |
| `node --test test/桌面应用/acceptance-dispatch.test.ts` | 74/74 | 一致；独立复跑 74/74 |
| `node --test test/桌面应用/interface.test.ts` | 137/137 | 一致；独立复跑 137/137 |
| `node --test "test/桌面应用/**/*.test.ts"` | 651/651 | 计数一致；**未由本角色复跑**（按交接不代跑全量） |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | 首跑 154/155 → 整目录重跑 155/155 | 首跑失败明细在案（T2 triage `actual 'failed'` vs `expected 'dispatched'`，`acceptance-triage-e2e.test.ts:514`）；重跑全绿；见 §4.3 |

环境：全部证据为 Windows 11 原生 Node v24.22.1 运行（失败栈含 `C:/Users/...` 路径），无 Linux/macOS 代替。证据 SHA-256 见 [证据索引](2026-10-26_lead-session-and-delivered-wake-acceptance-evidence/00_candidate-and-commands.md)。

### 4.2 证据绑定限制（已缓解，须保留）

**发现**：`app/desktop/session.ts` 与 `app/desktop/interface.ts` 的文件 mtime 为 **15:48:33**，晚于实现方 session/queue/acceptance/interface/desktop-suite 证据的生成时间（15:43–15:46）；只有治理 e2e 重跑（15:51）在源码最后修改之后。也就是说，变更记录表中前几行证据**不能证明**是对当前源码快照采集的；change 记录未提及这次修改。

**缓解**：本角色在记录的候选哈希（复核前后一致）上独立复跑 typecheck 与四个改动相关测试文件，全部通过（§4.1 表），覆盖了本批全部改动面。**仍存缺口**：桌面全目录 `651/651` 只在源码最后修改前运行过；按交接限制本角色未代跑全量。建议提交前在冻结快照重跑一次桌面全目录，把该数字重新绑定到候选。

### 4.3 跨角色 e2e 首跑抖动核对

- 失败用例与形态：`acceptance-triage-e2e.test.ts:514` 的 T2（分诊判断代批）读到 triage record `failed`，期望 `dispatched`；证据原文在案。
- 与本批关系：`interface.ts` 本批 diff 的 hunk 全部落在 4184–4921 行（delivered/协调/ready 唤醒区）；失败所涉分诊处置/重试代码（`interface.ts` 约 3103、3648 行）**零 diff**。change 记录给出的「interim `failed` 写入与 `dispatched` 结算窗口」机理解释与本批代码面无交集。
- 测试角色 2026-10-25 memo 已登记同套件「全量并发跑偶发、单文件隔离通过」的既有并发时序抖动（原文指向 S7-C/T3 实例），本批为同一套件的另一测试；change 记录表述为「该套件的并发时序抖动」属实，且**如实保留了首跑失败记录**（`governance-e2e-auto.txt`），未用重跑掩盖。
- 结论：与本批改动无关、非阻断；建议分诊属主另派收口。

## 五、逐条结论汇总

| 编号 | 结论 | 核心证据 |
| --- | --- | --- |
| C1 | **pass** | diff `session.ts:260/1390-1419`；LRU 仍单一实现；`session.test.ts` 40/40（独立复跑）；显式生命周期路径零 diff |
| C2 | **pass** | diff `interface.ts:4207-4306`；忙门在占位/标记之前；`acceptance-dispatch.test.ts` 74/74（独立复跑，含合并用例）；owner 前置未动 |
| C3 | **pass** | `send` 的 `deliveryKind` 仅对 background 生效；队列摘要去「你：」；渲染侧既有 system 标签/不可撤回映射；`queue-withdraw-lru.test.ts` 5/5（独立复跑） |
| C4 | **pass** | `coordinationStageOf` delivered 分支删除；`note(...)` 调用与共享指纹删除；测试断言主理零行、无协调；`interface.test.ts` 137/137（独立复跑） |
| C5 | **pass** | 无 skip/only；断言改动均为新行为同步且更强；无新 IPC/卡片/账本 kind；MAX=3；无 commit/push；`git diff --check` 仅 1 处 EOF 空行 |

## 六、残余风险与判断

| # | 残余 | 判断 | 理由 |
| --- | --- | --- | --- |
| R1 | listing 暂不可得时主理 pin 失效（该会话按既有 LRU 可被淘汰） | 记录即可 | 会话只能在其项目已枚举后打开；缓存清除只发生在 bootstrap/治理重接受/迁移收尾（先 `refreshStaleBoundaries` 再清理并 `project:changed` 触发重列举），窗口窄；change 记录已如实登记。若需更强保证可改为由会话持主理 id（未来项，非本批要求） |
| R2 | 主理常驻使 live 数可超过 3——不限于「主理+3＝4」；多项目时每个项目主理各占一个，可长期超过 3 | 记录即可 | 客户「主理会话不关闭」的直接结果；`MAX_LIVE_SESSIONS` 数值与非主理淘汰语义未变。change 记录的「4」示例只覆盖单项目，建议文档表述改为「可超出的数量随常驻主理数增长」 |
| R3 | 统筹 busy 判据硬编码 `"convener"`，single/su 是否适用 | 非问题 | `wakeStewardForDeliveredSteps` 仅从 `dispatchAcceptanceForFlow` 调用，该函数 non-trio 提前返回；trio 下 Steward 即内置 convener，与既有投递目标一致 |
| R4 | `main.interface.deliveredWaitNote` 词条保留未删（代码已无引用） | 记录即可 | i18n 目录属共享/项目管理属主；本批不越权删除；无行为影响。i18n 守卫只扫源码硬编码中文、不校验词条引用（`test/项目管理/shared/i18n-guard.test.ts` 代码核对；本角色未运行该守卫） |
| R5 | `[自动推进]` 治理唤醒直接投出时，聊天回显仍按「你」类用户输入呈现（无撤回钮） | 记录即可 | 客户截图问题指**队列条目**（「你：」+撤回），队列呈现已改「系统」；`[自动推进]` 文案体系按 change 记录保留未改。若客户要求正文也显示系统行，需后续给该前缀加 `[系统·…]` 归类，属新需求 |
| R6 | 注释称「渲染侧即便伪造 metadata 也不会把客户消息伪装成系统条目」，但 `sendSession` 原样透传渲染侧 metadata | 记录即可 | `background` 本身即可由渲染侧传入（既有面）；新 `kind` 只改呈现类别/撤回性，不构成权限提升。建议属主把注释改为「非 background 不生效」的准确表述 |
| R7 | `app/desktop/governance-advance.ts:839` 注释仍写阶段键含 `delivered:<…>` | 记录即可 | 该文件不在候选 diff；delivered 阶段已不再产生，注释陈旧；建议属主顺手清理 |
| R8 | 真实 Electron e2e 未跑；渲染侧未改动 | 记录即可（未验证项） | 「系统」标签/不可撤回是渲染侧既有映射（看护 system 条目在用），本次未改 renderer；单测/集成层已证 system 条目入队与快照。真机 UI 需重启后复核（与 change 记录一致） |
| R9 | 证据时间戳早于源码最后修改（§4.2） | 记录即可（已缓解） | 当前快照的改动面已由本角色定向复跑覆盖；建议提交前重跑桌面全目录，把 651/651 重新绑定到冻结候选 |
| R10 | 跨角色 e2e 首跑 T2 分诊抖动（§4.3） | 记录即可 | 既有竞态、代码零 diff、重跑全绿、如实登记；建议分诊属主另行收口 |
| R11 | `queue-withdraw-lru.test.ts` EOF 多余空行（`git diff --check` 唯一告警） | 记录即可 | 风格级；不影响测试/行为 |

**阻塞项：无。** 以上均为记录/建议项，没有一条满足 needs-work（已证实未达标）或需要补证才能判定（missing-evidence）的条件。

## 七、最终判定

**pass。** 客户 C1–C5 逐条满足；实现按项目解析主理、未写死角色；delivered 唤醒的「不发也不标已通知」在代码顺序与测试中均可证；Lead 的 delivered 协调与等待核证行彻底移除；治理唤醒以 system 类入队且客户消息/dispatch/handback 语义不变；无断言弱化、无第二套门禁/状态、`MAX_LIVE_SESSIONS` 仍为 3、未提交。

本判定不授权提交/推送/合并/发布。提交前建议：① 冻结候选后重跑 `test/桌面应用/**` 全目录；② 重启应用复核队列「系统」行/无撤回与主理常驻的真机表现；③ 属主顺手处理 R6/R7/R11 的文面与风格项。

## 附录：本角色独立实测（原始输出见同目录证据）

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | 无诊断 |
| 2 | `node --test "test/桌面应用/session.test.ts"` | 0 | 40 tests / 40 pass / 0 fail / 0 skip |
| 3 | `node --test "test/桌面应用/queue-withdraw-lru.test.ts"` | 0 | 5 / 5 pass |
| 4 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | 0 | 74 / 74 pass |
| 5 | `node --test "test/桌面应用/interface.test.ts"` | 0 | 137 / 137 pass |
| 6 | 证据时间戳与源码哈希比对 | — | 源码 15:48:33 晚于单测证据 15:43–15:46；候选哈希复核前后一致（§4.2） |
| 7 | `git diff --check` / `git status` | 2 / 0 | 仅 EOF 空行告警；HEAD 9de56d4 未变、无 commit/push |
