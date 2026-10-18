---
id: governance-liaison-review
type: design
title: 治理四角色（新增 Liaison 联络官）——项目管理评审与 V1 拆发
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: approved
revision: 1
related: [governance-liaison, governance-trio, governance-trio-review, governance-pin-recovery, existing-project-compat]
events:
  - date: "2026-10-18"
    kind: reviewed
    summary: 批准「三权不变、角色四名」；Liaison 为 trio 主入口（primaryRoleId=liaison），只写 docs/intents/、只拥有沟通权；钉死 GovernanceFunction/GovernancePower 增 liaison、四角色注册表与能力矩阵、hand_off_intent 交接与去重、request_clarification、决定卡镜像（同一请求 id、只答一次、两侧冻结、一项目一卡）、账本 intent.handed-off + dispatch.accepted(trigger=intent-handoff)、兼容保持 governanceModel:"trio"、UI 与验收 AC1–AC24；发现并纠正当前 auto-dispatch 未写 dispatch.accepted(app) 的缺口；给出 W6 波次与必须客户拍板项
---

# 治理四角色（新增 Liaison 联络官）——项目管理评审与 V1 拆发

**审查对象**：产品提案 [2026-10-18_design_governance-liaison.md](../../../产品/docs/design/2026-10-18_design_governance-liaison.md)（status `proposed`，revision 1）。
**客户需求（逐字）**：「感觉报告员可以在拆分一下，把客户沟通，和编写提案，拆分出来。客户沟通的作为主入口。」
**已拍板**：新角色 **Liaison 联络官（`liaison`）**；提案接受/修改卡**镜像到主入口**；**现在就改四角色**；三权与最终批准权归属不变。
**本轮性质**：跨角色评审与拆发，**不写代码**。本文是实施口径与派发计划，不是实施结果；源码、测试、`.ans`、UI 均未改动。

## 一、结论

**批准「三权不变、角色四名」的方向，并按本文收窄实施。** 提案把「客户沟通」从 Rapporteur 拆给 Liaison、让 Liaison 做默认入口，制度上是成立的：Liaison 只产生**意图记录**与**交接请求**，不产生任何能解锁门禁的候选物，因此治理模型仍可称「三权」（提案/提名/编排），角色数变为四个。

提案对代码现状的判断基本准确：trio 注册表、`primaryRoleId`、能力矩阵、会话路由、一项目一卡队列、应用后台派发均已落地。但改四角色不是「注册表加一项」：有 **5 处必须先钉死的接缝**——① `GovernanceFunction`/`GovernancePower` 的枚举与排序；② `GovernanceCapabilities.customerInput` 目前是字面量 `true`，必须改为 `boolean` 才能让 Liaison 不发卡；③ `hand_off_intent` 的校验/去重必须在应用侧机械执行，不能靠模型自律；④ 镜像必须扩展现有 `opRequests` 的单角色登记，而不是新建第二套卡；⑤ 当前 auto-dispatch 的 `advanceGovernanceFlow` **没有写** `dispatch.accepted{actorRoleId:"app"}`，与 trio 评审 revision 2 的审计契约不符，必须先补。

**V1 最小闭环（不可降级）**：

1. 四个内置治理角色 `liaison` / `rapporteur` / `nominator` / `convener`，顺序固定；trio 下 `primaryRoleId = "liaison"`。
2. Liaison 的 Section 1 与预授权只有 `docs/intents/`；其余治理产物全部禁写；能力矩阵只给沟通与交接，不给发卡/派发/看护/安装/恢复/shell。
3. `hand_off_intent`：Liaison 写意图文件后调用；应用校验四要素、去重、每轮一次、`initial` 仅一次，成功后在**后台**把一条任务投给 Rapporteur（`actor=app`，不打开/不切换会话、不移动 pane/焦点），失败只落系统行、不重试。
4. 提案接受/修改卡镜像到主入口：同一请求 id、两侧呈现、只答一次、两侧冻结、一项目一卡；原卡保留。
5. `request_clarification`：Rapporteur 专用，写账本 `clarification.requested` 并在主入口落系统行；同一 flow 最多 2 轮。
6. 兼容保持 `governanceModel: "trio"`：旧 trio 项目升级后自动获得 Liaison 主入口，不迁移、不重写 `.ans`/pin/manifest；`single`/su 逐字不变。
7. 审计账本：`intent.handed-off`（谁转交、意图文件/哈希）+ `dispatch.accepted{trigger:"intent-handoff"}`（应用投递给谁）；两者都不是客户批准。

**可降级项（必须显式登记，不得静默）**：若桌面UI 的镜像实现超出一批可交付范围，V1 先只镜像 `proposal`（客户已明确要求的那张），任命/任命写盘/流程写盘/验收卡保留原生位置并在主入口状态行说明；这是降级，不是默认。**不可降级**：四角色枚举、Liaison 写权/能力、交接闭环、提案卡一次性作答、旧项目兼容、账本。

**没有必须返工的方案级问题**；有 **17 处代码事实/口径纠偏**（§二）、**必须执行的实施修正**（§四–§七）、**24 条验收**（§十）与 **4 项必须客户拍板**（§十三）。

## 二、代码事实复核（只读；工作树含在飞修改）

| # | 提案说法 | 代码事实（2026-10-18 工作树） | 裁定 |
| --- | --- | --- | --- |
| 1 | `GovernanceFunction` 增沟通职能 | `src/model/role.ts:25` 现为 `"proposal" | "nomination" | "schedule"`；`ResolvedRole.governanceFunction`（:47）与 `ProjectRoleSummary.governanceFunction`（`resolve-role.ts:121`）原样透传。 | **增 `"liaison"`**（按本任务书；提案的 `communication` 被本裁定取代）。理由：与角色 id 同词、跨层少一次映射；`trio` 命名的是权力模型而不是角色数量。台账 `GovernancePower` 同步增 `"liaison"`。若客户以后要求语义化命名，整体改 `communication` 的成本只在同批枚举与文案，不影响结构。 |
| 2 | 注册表加一个 spec 即可 | `src/common/门禁引擎/governance-roles.ts:29-49` 的 `GovernanceCapabilities.customerInput` 是**字面量 `true`**；`BuiltInGovernanceRoleSpec.id`（:53）只含三人；`BUILT_IN_GOVERNANCE_ROLES`（:173-267）三人；`BUILT_IN_ROLE_DIR_PREFIXES`（:76-81）三人 + su。 | `customerInput: boolean`（Liaison=false，其余 true）；`id` 增 `"liaison"`；注册表**首位**插 Liaison；能力增 `handOffIntent`/`requestClarification`；目录前缀增 `角色卡/liaison/`。 |
| 3 | Liaison 只有沟通权 | 现有三人卡文本：Rapporteur 自称「理解客户意图、沟通」（:90-113）；Convener 写「提名步骤由客户点击入口打开 Nominator」（:152）；三人卡均写「不得创建第四个治理角色」（:111/:139/:167）。 | 三张卡文本**必须同步修订**：Rapporteur 去掉「客户沟通主入口」、改读意图与 `request_clarification`；Convener 的提名步骤改为「由应用后台派发」（2026-10-18 客户修正已落地）；「第四个」改为「第五个/新增治理角色」。否则模型行为与新职责冲突。 |
| 4 | trio 主入口改 Liaison | `src/service/role/resolve-role.ts:371-401`：`builtIns` 直接 `BUILT_IN_GOVERNANCE_ROLES.map`；`primaryRoleId = governanceModel === "trio" ? "rapporteur" : su`。 | 注册表顺序即枚举顺序；trio 下 `primaryRoleId = "liaison"`。`listProject` 其余逻辑（hasRoles、warnings、reserved id）不变。 |
| 5 | `resolveGovernanceRole` 合法列表改四人 | `resolve-role.ts:154-198`：trio 的 `--role` 校验与错误文案只列三人；缺省 `function = "proposal"`。`src/common/编排/args.ts:113` 的 `GOVERNANCE_FUNCTIONS` 只含 proposal/nomination/schedule。 | `resolveGovernanceRole` 接受 `liaison`（错误文案列四人）；共享缺省**仍是 `proposal`**（CLI 是操作者工具，不是客户入口）。CLI 的 `GOVERNANCE_FUNCTIONS` **保持三值**：V1 不提供 `ans govern --function liaison`（没有跨会话交接能力，半可用的主入口比不提供更危险）。桌面走 `openRoleSession`，不受此限制。 |
| 6 | 能力矩阵加两项即可 | `run-role.ts:532-545` 已按 `governanceRoleOf`/`governanceCapabilitiesOf` 取 spec/能力/预授权；:600-640 先判 `forbiddenWritePaths` 再路由门禁；:866-870 对 `isTrio && preauthorizedDirs.length > 0` 的会话扫描预授权目录；:1123-1140 每轮 settle 写 `artifact.observed`，`power` 取 `trioSpec.function as GovernancePower`。 | 注册表加 Liaison 后，边界/预授权/禁写/产物观测**自动生效**；但 `GovernancePower` 必须增 `"liaison"`，否则 `artifact.observed` 的类型转换是假的。`handOffIntent`/`requestClarification` 需在 `run-role.ts` 与桌面 `session.ts` 两处按能力注入（注入才注册）。 |
| 7 | 桌面按 function 路由 | `app/desktop/session.ts:1248-1300`：`canSchedule`/`canNominate` 由 `governanceFunction` 派生；:1269 `customerInput = role.builtIn === true ? ...`；:1352-1357 Convener 只读 shell。 | 新增 `canLiaise = governanceFunction === "liaison"`；`customerInput` 判据改为「内置且 function ≠ liaison」（Liaison 只用聊天，不发确认/选择卡）；`handOffIntent` 只注入 Liaison；`requestClarification` 只注入 Rapporteur。 |
| 8 | 客户卡是一请求一角色 | `app/desktop/customer-input.ts:51-67` 的 `OperatorRequestPayload` 只有单个 `roleId`；:174 `activeByProject` 一项目一卡；:296-341 请求进 `pending`/`waiting`，presenter 只对 active 调用；:354-368 `respond` 按请求快照结算。 | 扩 `OperatorRequestPayload.mirrorRoleId?: string`；**不新建第二个请求/第二条 pending**；镜像是同一 `id` 的第二呈现面。渲染侧登记由单 `roleId` 扩为 `surfaces`。 |
| 9 | 渲染侧建第二张卡 | `app/renderer/renderer.js:3066` 的 `opRequests` 是 `requestId → { roleId, ..., card, state }`；:3101-3120 `openRequestIdsFor(roleId)` 只认 `entry.roleId`；:3281-3307 入口登记与幂等物化；:3317-3331 失效与补挂；:4844-4877 权力副标题与树项；:4917-4944 主入口/治理职能分组。 | `opRequests[requestId]` 增 `surfaces: string[]` 与 `cards: Map<roleId, Element>`；`openRequestIdsFor` 按 `surfaces` 命中；两张面各自物化、同一 `requestId`、作答/失效/冻结同时作用；镜像面不参与源 pane 的锚点表（追加在末尾，带来源标签）。 |
| 10 | 镜像卡是一种新卡片 | `app/desktop/governance-advance.ts:111-151` 的 `deriveGovernanceNextStep` 只按 `cardKind` + 客户实际选择推导；:157-182 生成后台任务消息。 | **不新增 `GovernanceCardKind`**、不改推导表；镜像只是呈现，不产生额外 `governance:next-step`。否则会重复派发。 |
| 11 | 账本加事件即可 | `src/common/编排/governance-ledger.ts:27-79`：`GovernancePower` 六值；`kind` 六值；`GovernanceLedgerEntry` 无 `intentId`/`handoffKind`/`trigger`。`run-role.ts:560-571` 打开时读快照、每次 send 刷新；`session.ts:2225-2246` Convener 工具派发成功后才写 `dispatch.accepted`。 | 增 `GovernancePower = "liaison"`；`kind` 增 `"intent.handed-off"`/`"clarification.requested"`；字段增 `intentId?`/`handoffKind?`/`trigger?`（`"customer-decision" | "intent-handoff" | "settle"`）；旧条目缺省 `trigger` 仍合法。 |
| 12 | 后台派发已有审计 | **`app/desktop/interface.ts:1076-1127` 的 `advanceGovernanceFlow` 只写诊断 `advance.dispatched` 与一条 delivery-note，未追加 `dispatch.accepted{actorRoleId:"app", power:"app"}`**；trio 评审 revision 2 §5.6/AC24 要求写。 | **这是当前 auto-dispatch 批次的契约缺口**。W6-0 必须先补：成功投递后写 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"customer-decision", flowId?, stepId?, targetRoleId}`，不写 `customerDecision`。Liaison 的 `trigger:"intent-handoff"` 复用同一写法。 |
| 13 | 进度行会持久保留 | `app/desktop/interface.ts:664-672` 的 `emitSessionEvent` 只是主进程转发 + 主入口 settle 触发 `project:changed`；系统行/message 事件不写入会话历史文件。 | V1 进度行是**运行期呈现**：应用重启后不保证回放；持久记录是账本与 `docs/intents/*.md`。UI 不得宣称「可在主入口回看全部进度」。若客户要求回放，列 V1.1（只读回放，不得造第二张可作答卡）。 |
| 14 | 需求方默认入口变化无需提示 | `resolve-role.ts:358-368`：旧项目（有 `.ans` 或已有角色目录）仍读 `trio`；`listProject` 的 `primaryRoleId` 一变，桌面主位/默认选中/空态 CTA 全部跟着变；`app/renderer/renderer.js:4286-4362` 导入时默认选中主入口、不自动开会话。 | 旧 trio 项目升级后**默认入口直接变为 Liaison**，无数据迁移。Liaison 空态用一句话说明「本版起默认入口为联络官；报告员与历史提案不变」；不做持久迁移提示条。 |
| 15 | 保留 id 守卫需要另加 | `resolve-role.ts:54`、:297 已用 `isBuiltInGovernanceRoleId` 判定保留 id；`governance-roles.ts:325-327` 的集合是「su + 注册表成员」。 | 注册表加 Liaison 后自动成为保留 id：`角色卡/liaison/` 跳过并警告、`resolveRole("liaison")` 按内置解析、项目角色不能遮蔽。**不需要另写一份名单**；但测试要补 `角色卡/liaison/` 断言。 |
| 16 | 回交/看护仍投主入口 | `app/desktop/session.ts:1818-1832` 的 `handbackOwnerRoleId`：trio → `governanceFunction === "schedule"`（Convener）；single → `primaryRoleId`。:1091-1118 的后台开/发不抢 `activeRoleId`。 | **不变**：回交/看护/恢复回执仍归 Convener；`primaryRoleId` 只用于主入口与客户镜像。Liaison 不获得看护/派发/回交主人身份。 |
| 17 | 现有测试只是小改 | `test/门禁引擎/governance-trio.test.ts:113-120` 断言三人顺序/职能/显示名；:334 断言 `listProject` 三人；`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` 等也钉三人/主入口。 | 这些断言**必须同批更新为四人**；不能只加新测试而让旧断言继续描述三人。属主更新（见 §十二），测试角色独立验收。 |

**另两条在飞事实**（影响排期，不影响方案）：

- 当前工作树有 auto-dispatch/警告一次性/预算修复的在飞修改（`app/desktop/session.ts`、`customer-input.ts`、`interface.ts`、`main.ts`、`preload.cjs`、`app/renderer/*`、`test/桌面应用/*` 等）。Liaison 批次**必须串行排在该批收口之后**，不得并写同一文件。
- `app/desktop/interface.ts::advanceGovernanceFlow` 的账号缺口（#12）可能在该批收口中被补；若收口后仍未补，W6-0 必须先补，否则 Liaison 的账本链会继承同一个缺口。

## 三、V1 范围与分期

### 3.1 V1（必须一次成立）

| 模块 | 做什么 | 不做什么 |
| --- | --- | --- |
| 门禁引擎 | `GovernanceFunction` 增 `liaison`；注册表 Liaison spec（卡文本/条目/预授权/禁写/能力）；`customerInput: boolean`；能力增 `handOffIntent`/`requestClarification`；目录前缀增 `角色卡/liaison/`；`listProject` 四人/顺序/`primaryRoleId=liaison`；`resolveGovernanceRole` 四人；三人卡文本修订；测试 | 不把 Liaison 边界写进项目文件；不新增治理边界文档；不改 pin 算法；不把 Liaison 变成第四种决定权 |
| 运行时核心 | `HandOffIntentPayload`/`HandOffIntentFn`、`RequestClarificationPayload`/`RequestClarificationFn`；`GovernedToolsOptions` 两个能力位；`hand_off_intent`/`request_clarification` 工具定义/schema/handler；未注入即不注册 | 不改 `CustomerInputRequest` 冻结形状；不给 Liaison 注入 `customerInput`；不改 abort/超时/judge |
| 编排 | `run-role.ts` 按能力注入交接/澄清；Liaison 预授权/禁写自动生效；`governance-handoff.ts`（意图校验、去重、消息模板）；`governance-ledger.ts` 扩展；`govern-session.ts` 薄再导出；`artifact.observed` 覆盖 `docs/intents/` | 不写 `.ans` 以外的新存贮；不让角色互发 `dispatch_task`；不自动批准 |
| 桌面窗口 | `handOffIntent` 能力（校验→后台开 Rapporteur→`sendBackground`→系统行→账本）；`requestClarification` 能力（账本→主入口系统行）；`advanceGovernanceFlow` 补 `dispatch.accepted(app)`；`OperatorRequestPayload.mirrorRoleId`；客户决定后主入口进度行；不打开/不切换 | 不新建第二套投递队列；不新建第二套卡系统；不改回交/看护主人；不改 shell 三层链 |
| 桌面UI | `liaison` 文案/权力副标题；主入口/治理职能分组；镜像卡物化/冻结/徽标/来源标签；排队聚合行；空态与状态行；Liaison 空态保留治理记录入口 | 不做意图/流程面板；不做独立权限说明模态；不自动打开/切换角色；不把镜像卡写入模型上下文 |
| 测试 | 四角色枚举、写权矩阵、能力矩阵、交接守卫/失败、镜像一次性/排队、澄清闭环、兼容、审计还原、UI e2e；全量三层 glob | 不跑真实模型/网络/凭据/`.env` |

### 3.2 最小闭环与降级

- **最小闭环（必须）**：AC1–AC7、AC9–AC14、AC16–AC18、AC20–AC24（见 §十）。
- **可降级（显式登记）**：AC8 的镜像范围可先只做 `proposal`；其余治理卡保留原生位置，主入口状态行显示「任命/验收卡请在发起角色聊天作答」。降级不得改变「同一请求只答一次」与「原卡保留」。
- **不可降级**：四角色枚举、Liaison 写权/能力、交接闭环、提案卡一次性作答、旧项目兼容、账本、禁止自动批准。

### 3.3 V1.1 / V2（不在本版承诺）

- V1.1：镜像卡重启后的只读回放（读账本 + 请求登记，不造第二张可作答卡）；镜像范围补齐任命/验收；客户侧「主入口体验统计」只读诊断。
- V2：意图/流程面板、批量迁移、跨项目治理、Liaison 的只读看护（`role_status`/`session_tail`）、更细的镜像来源标记。

## 四、四角色契约（钉死）

### 4.1 角色与权力

| 角色 | 职能词（`GovernanceFunction`） | 权力 | 只产出 | 绝不能产出 |
| --- | --- | --- | --- | --- |
| **Liaison 联络官** `liaison` | `liaison` | **沟通权**（非决定权） | `docs/intents/**`、交接请求 | 批准、提案、契约、提名、流程单、派发、任命、改角色卡/边界 |
| **Rapporteur 报告员** `rapporteur` | `proposal` | **提案权** | 澄清问题、提案、契约、方案说明 | 批准、任命、派发、改角色边界 |
| **Nominator 提名官** `nominator` | `nomination` | **提名权** | 候选名单、角色卡/边界草案（客户确认后写入）、能力安装建议 | 任命、批准、派发、改提案内容 |
| **Convener 召集人** `convener` | `schedule` | **编排权** | 流程单、步骤顺序、派发、进展与阻塞报告 | 批准、任命、改方案、改角色卡/治理记录 |

一句话记法不变：**Liaison 负责「客户要什么」，Rapporteur 写「做什么」，Nominator 写「谁来做」，Convener 写「按什么顺序做」；客户写「同意/不同意」。**

### 4.2 注册表（`src/common/门禁引擎/governance-roles.ts`）

**顺序即 `listProject` 的枚举顺序**：`liaison` → `rapporteur` → `nominator` → `convener`。

Liaison spec 逐项钉死：

```ts
{
  id: "liaison",
  displayName: "联络官 Liaison",
  function: "liaison",
  entries: [projectEntry("docs/intents/", "directory", "客户意图记录（intentId/handoffKind/goal/scope/acceptance/客户原话）")],
  preauthorizedDirs: ["docs/intents/"],
  forbiddenWritePaths: [
    ...APP_ONLY_WRITE_PREFIXES,        // .ans/**、manifest、角色卡/governance-boundary.yaml
    "角色卡/",                          // 含 角色卡/liaison/、其他内置、项目角色目录
    "docs/proposals/", "docs/contracts/", "docs/nominations/",
    "docs/skills/", "docs/mcp/", "docs/flows/",
    "docs/governance/", "docs/workflow.md",
  ],
  capabilities: {
    customerInput: false,
    handOffIntent: true,
    requestClarification: false,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    shell: "none",
  },
}
```

- `GovernanceCapabilities` 增 `handOffIntent: boolean`、`requestClarification: boolean`；`customerInput` 由字面量 `true` 改为 `boolean`。
- `app/**`、`src/**`、`test/**` 不在 Liaison 的 Section 1 内，**结构性禁写**；是否列入 `forbiddenWritePaths` 由实现决定（列入只影响拒绝文案的指向，不扩大权限）。卡文本必须写明「不实现、不跑代码、不写测试」。`docs/intents/` 是唯一写区。
- `LEGACY_SU_CAPABILITIES` 增 `handOffIntent: false`、`requestClarification: false`（su 旧行为不多给工具）。
- `BUILT_IN_ROLE_DIR_PREFIXES` 增 `"角色卡/liaison/"`（其余 spec 的禁写矩阵随之覆盖）。
- `BuiltInGovernanceRoleSpec.id` 的联合类型增 `"liaison"`；`TrioGovernanceRoleId`/`BUILT_IN_GOVERNANCE_ROLES`/`isTrioGovernanceRoleId`/`trioGovernanceSource` **名称保留**（`trio` 指权力模型，不是人数），避免无意义的跨角色改名。

### 4.3 能力矩阵（唯一数据来源＝注册表）

| 能力 | Liaison | Rapporteur | Nominator | Convener | su（single） |
| --- | --- | --- | --- | --- | --- |
| `customerInput`（确认/选择卡） | **否** | 是 | 是 | 是 | 是 |
| `handOffIntent`（交接工具） | **是** | 否 | 否 | 否 | 否 |
| `requestClarification`（澄清工具） | 否 | **是** | 否 | 否 | 否 |
| `dispatchTask` | 否 | 否 | 否 | **是** | 是（旧行为） |
| `roleStatus` / `sessionTail` | 否 | 否 | 否 | **是** | 是 |
| `proposeRecovery` | 否 | 否 | 否 | **是** | 是 |
| `installSkill` / `installMcp` | 否 | 否 | **是** | 否 | 是 |
| shell | `none` | `none` | `none` | `readonly` | `operator-approve` |
| 预授权目录 | `docs/intents/` | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | `docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | `docs/flows/`、`docs/governance/convener/` | 既有四棵 |

- **Liaison 不注入 `customerInput`**：它只用聊天问问题，不占用「一项目一卡」的治理决定队列；`request_confirmation`/`request_choice` 在 Liaison 会话里**结构性不存在**。
- **既有角色只增 `requestClarification` 一项**（Rapporteur）：其余能力与写边界逐项不变；澄清工具不改变提案权/门禁，只增加一条把问题送到主入口的通道。
- 能力判断仍按 `governanceFunction`/注册表派生，不在调用方散落角色 id 硬编码。桌面 `session.ts` 用 `canLiaise = governanceFunction === "liaison"`、`canClarify = governanceFunction === "proposal"`，与既有 `canSchedule`/`canNominate` 同型。

### 4.4 边界解析与预授权

- `resolveBoundarySection`（`src/common/门禁引擎/boundary-core.ts:570-625`）的 trio 分支已按 `governanceRoleOf(roleId)` 取 `spec.entries`；加 Liaison spec 后**无需改判定顺序**。trio 下仍**不读** `角色卡/governance-boundary.yaml` 的条目作为角色写权来源。
- Liaison 的 acceptance 与其他三人相同：必须来自 `.ans` 治理记录（`governanceBoundary.path` 非空且 accepted）或本次显式 genesis；不得把桌面运行期同意当 trio 的接受证据。
- `run-role.ts` 的 `confirmationMode = input.customerInput !== undefined`：Liaison 没有 `customerInput`，走静态边界/预授权；`docs/intents/` 在 Section 1 内，写入不需要确认卡，但仍过 F4/F6/F7 与条件激活。
- `forbiddenWritePaths` 在 `resolveWrite` **之前**判定；拒绝文案指回正确归属（提案/提名/编排/应用）。`docs/intents/` 是唯一例外放行目录。

### 4.5 `listProject` / `primaryRoleId` / `resolveGovernanceRole`

- `listProject`（`resolve-role.ts:244-419`）：
  - 扫项目角色、算 `hasRoles`、读 `readGovernanceModel`、按模型前置内置角色的既有顺序**不变**；
  - trio → 四个内置（注册表顺序）；`primaryRoleId = "liaison"`；
  - `ProjectListing.roles` 仍先内置后项目角色；`governanceModel` 恒返回 `"trio"`。
- `resolveRole`（:44-107）：`liaison` 是保留 id，按注册表返回 `kind:"built-in-governance"` + `governanceFunction:"liaison"` + 卡文本；项目 `roles` 映射不得遮蔽。
- `resolveGovernanceRole`（:154-198）：
  - trio 下 `roleId` 合法值增 `liaison`；错误文案列四人；
  - 缺省 `function` **仍是 `proposal`**（共享解析器语义不变）；
  - `function:"liaison"` 合法（供测试/未来前端），但 **CLI 解析器不接受**（见 §4.6）。
- 保留 id 守卫：`isBuiltInGovernanceRoleId` 自动含 Liaison；`listProject` 扫到 `角色卡/liaison/` → 跳过并警告「与内置治理角色 id 冲突，已跳过」；`resolveRole("liaison")` 忽略项目映射。
- **桌面 Interface 契约不新增 IPC**：`RoleView.governanceFunction?: GovernanceFunction`（`app/desktop/interface.ts:129-140`）与 `ListProjectResult.primaryRoleId/governanceModel`（:146-168）已承载四角色事实；Liaison 只是数据变化。唯一新增的主→渲字段是 `OperatorRequestPayload.mirrorRoleId`，仍走既有 `session:operator-request`；作答仍走 `session:operator-response`。`hand_off_intent`/`request_clarification` 是模型工具，不经 IPC。

### 4.6 CLI 面（明确收窄）

- `ans govern` 的 `--function` **仍只接受 `proposal|nomination|schedule`**（`args.ts:113` 的 `GOVERNANCE_FUNCTIONS` 不变）。
- `--role liaison` 或 `--function liaison` → 明确拒绝：「联络官仅桌面主入口提供；CLI 请用 --function proposal|nomination|schedule」。
- 理由：`hand_off_intent` 需要跨会话后台投递，CLI 单进程没有这条路径；提供一个不能交接的 Liaison 会破坏「主入口」语义。`openGovernanceSession` 的 `governanceFunction` 类型虽含 `liaison`，V1 在 CLI 调用处拒绝（防御性再校验）。
- `ans role run` 不受影响（只服务项目角色）。

### 4.7 `governanceModel` 与旧项目

- **保持 `governanceModel: "trio"`**，不新增 `quad`、不新增 `.ans` 字段、不做迁移。
- 旧 trio 项目：升级后 `listProject` 自动返回四角色、`primaryRoleId` 变 `liaison`；`.ans`、pin、manifest、角色卡、提案/流程/账本全部不动。
- `single`/su：`listProject` 仍只返回 su，`primaryRoleId = "su"`；无 Liaison、无镜像、无交接、无新账本事件；`resolveBoundarySection` 对 Liaison 在 single 下结构性拒绝（沿用「trio 角色在 single 不可用」）。
- 旧版应用读同一 `trio` `.ans`：仍按三人工作、忽略 `liaison` 与 `docs/intents/`；新版再打开后 Liaison 回来，数据不丢。
- `docs/intents/` 对旧项目是新增空目录；首次使用时由 Liaison 创建，**不加入 pin**。

## 五、意图交接（`hand_off_intent`）契约

### 5.1 工具与参数（运行时核心）

工具名：`hand_off_intent`；常量 `HAND_OFF_INTENT_TOOL_NAME = "hand_off_intent"`；**只注入 Liaison**，未注入即不注册（同 `dispatch_task` 先例）。

```ts
// src/model/runtime.ts
export interface HandOffIntentPayload {
  intentId: string;                 // slug：^[a-z0-9][a-z0-9-]{1,63}$
  handoffKind: "initial" | "clarification" | "revision";
  goal: string;
  scope: string;
  acceptance: string;
  summary: string;                  // 1..200 字；超长拒绝，不静默截断
  flowId?: string;                  // slug；clarification/revision 建议带
}
export type HandOffIntentFn = (
  payload: HandOffIntentPayload,
  metadata?: ReportHandbackMetadata, // turnId/sessionId 供每轮一次与审计
) => HandOffIntentReceipt | Promise<HandOffIntentReceipt>;
export interface HandOffIntentReceipt { ok: boolean; message?: string }
```

`src/provider/runtime/tools.ts` 增加 `makeHandOffIntentTool`；`buildGovernedTools` 仅在 `options.handOffIntent !== undefined` 时注册。工具层**不读文件、不写账本、不投递**，只把载荷交给注入的能力——与 `dispatch_task` 同纪律。

**接线（同 `dispatchTask` 先例）**：`AdapterCapabilities`（`src/pipeline/orchestration/run-role.ts:164`）与 `createRuntimeAdapterFactory`（同文件 :1685-1710）把 `handOffIntent`/`requestClarification` 透传到 `GovernedToolsOptions`；桌面 `SessionManager.open` 只在能力命中时传入（Liaison 的 `handOffIntent`、Rapporteur 的 `requestClarification`）。任一环缺失 = 工具不注册（fail-closed），不得在其他层补注册。

### 5.2 应用侧校验（编排 `src/common/编排/governance-handoff.ts`，新增）

纯逻辑，不写盘、不发消息；经 `src/pipeline/orchestration/govern-session.ts` 薄再导出给桌面窗口（桌面不直接导入编排私有 `common/`）。

```ts
export interface IntentHandoffValidationInput {
  projectRoot: string;
  intentId: string;
  handoffKind: "initial" | "clarification" | "revision";
  goal: string; scope: string; acceptance: string; summary: string;
  flowId?: string;
}
export type IntentHandoffValidation =
  | { ok: true; artifactPath: string; artifactSha256: string; message: string }
  | { ok: false; code: string; message: string };
export function validateIntentHandoff(input: IntentHandoffValidationInput): Promise<IntentHandoffValidation>;
export function intentHandoffDedupeKey(input: { intentId: string; handoffKind: string; sha256: string }): string;
```

机械校验（全部 fail-closed，任何一条不满足 → `ok:false`，不投递、不写账本）：

1. **模型与角色**：`governanceModel === "trio"` 且当前角色 `governanceFunction === "liaison"`（能力注入已保证，这里防御性再校验）。
2. **文件存在**：`<projectRoot>/docs/intents/<intentId>.md` 存在、可读、UTF-8；`intentId` 必须匹配 slug（防路径穿越）。
3. **frontmatter**：文件以 `---` 开头并有闭合 `---`；顶层 `key: value` 可解析；`intentId` 与入参一致；`goal`/`scope`/`acceptance` 非空。
4. **文件为权威**：入参的 `goal`/`scope`/`acceptance` 必须与文件逐项相等（去首尾空白后比较）；文件里的 `handoffKind`/`flowId` 若给出且与入参不一致 → 拒绝。**不猜测、不截断、不用模型的话覆盖文件**。
5. **四要素**：`goal`/`scope`/`acceptance` 任一为空 → 拒绝；`summary` 为空或超过 200 字 → 拒绝。
6. **去重**：`intentId + handoffKind + sha256(原始文件字节)` 已成功交接 → 拒绝「已交接，不重复派发」。
7. **`initial` 仅一次**：同一 `intentId` 已有成功 `initial` → 拒绝，提示改用 `clarification`/`revision`；需要新一轮工作请写新 `intentId`。
8. **澄清/修订引用**：`clarification`/`revision` 必须已有至少一次成功交接（同 `intentId`）；否则拒绝。`flowId` 建议带，但不强制（无 flow 的直接对话也可修订意图）。
9. **每轮一次**：`metadata.turnId` 存在时，同一会话同一轮第二次成功交接 → 拒绝；`turnId` 缺失时降级为仅去重 + `initial` 一次性，并记诊断（不得假装执行了每轮守卫）。
10. **账本可读**：去重/`initial` 判定需要读账本；账本不可读 → 拒绝（fail-closed），提示检查 `.ans/governance/ledger.jsonl`。

**失败回执**：工具返回 `{ok:false, message}`，消息必须能指导模型下一步，例如「意图文件缺少 acceptance；请先向客户澄清并更新 docs/intents/<id>.md，未交接」「同一意图已交接，不重复派发；如需求变化请用 clarification/revision」。

**与提案的两处收紧（本评审裁定，比提案更严）**：

- `initial` 一次性按 `intentId` 判定，**不依赖 flow 是否关闭**（V1 没有可靠、机器可读的「flow 已关闭」信号）；新一轮工作必须写新 `intentId`。这样任何一次「重新开始」都有独立审计链。
- `clarification`/`revision` 必须已有**同 `intentId` 的成功交接**，不接受「只有意图文件、从未交接」的修订入口；否则任何新文件都能自称修订，去重与 `initial` 一次性会失效。

### 5.3 后台投递（桌面窗口）

Liaison 会话注入的 `handOffIntent` 能力在 `app/desktop/session.ts` 构造（需要会话队列与事件外推）：

1. 调 `validateIntentHandoff`；失败 → 返回 `{ok:false, message}`，不投递。
2. 目标固定 `rapporteur`；runtime 取来源 Liaison 会话的 runtime（同引擎）；通过 `manager.openBackground({projectRoot, roleId:"rapporteur", runtime})` 开后台会话（不抢 `activeRoleId`/`selectionVersion`）。
3. 通过 `manager.sendBackground(...)` 投递**唯一一条**任务消息；忙时进既有投递队列（`queued:true` 仍是成功）。
4. 成功：在 Liaison 聊天流落系统行「已交给报告员（工作中）」或「报告员工作中，已排队」；随后 best-effort 写账本（§七）。失败：落系统行「应用无法把意图交给报告员：<原因>；未重试」，**不写成功账本、不循环重试**；失败尝试不进入成功去重集，下一次接交接必须由客户新消息触发。
5. **不打开/不切换会话、不移动当前 pane/输入焦点**；左树只按 `role-state` 显示 Rapporteur「工作中」（复用 `sendBackground` 的 `background` 纪律，`app/desktop/session.ts:1091-1118`、:1640-1670）。

**任务消息模板**（只给地址与最小上下文，不内嵌全文、不让模型自算哈希）：

```
流程 <flowId>（若给）：客户意图已交接。
请读 docs/intents/<intentId>.md（intentId=<intentId>，handoffKind=<kind>）；这是意图记录，不是客户批准。
请形成提案并用提案卡请客户决定；信息不足用 request_clarification，不要反复追问客户。
<summary>
```

### 5.4 `request_clarification`（Rapporteur 专用）

```ts
export interface RequestClarificationPayload {
  flowId?: string;      // slug
  intentId?: string;    // slug；与 flowId 至少给一个
  question: string;     // 非空；给客户看的一句话
  summary?: string;     // 可选，≤200 字
}
export type RequestClarificationFn = (payload, metadata?) => { ok: boolean; message?: string } | Promise<...>;
```

- 工具名 `request_clarification`；只注入 `governanceFunction === "proposal"` 的 Rapporteur；未注入即不注册。
- 应用侧：校验至少一个 `flowId`/`intentId`；读账本数同一 `flowId`（无则同一 `intentId`）的 `clarification.requested` 条数；**已达到 2 轮 → 拒绝**，提示「请在提案卡上请客户决定（带假设/备选）」。通过则写 `clarification.requested`（`actorRoleId:"rapporteur"`, `power:"proposal"`, `flowId?`, `intentId?`, `messageSummary`），并在主入口 Liaison 落系统行「报告员需要澄清：<question>」。
- **不弹客户决定卡**、不占「一项目一卡」队列、不改变任何权力/写权；客户在 Liaison 回答后，Liaison 更新意图并 `hand_off_intent{handoffKind:"clarification"}`，应用再投递给 Rapporteur。
- 若 Liaison 会话未打开：系统行事件仍会创建其 pane 并记载（运行期）；重启后不回放（§二-13），但账本与意图文件可还原。V1 如实说明，不承诺持久展示。

## 六、决定卡镜像契约

### 6.1 定义与范围

**镜像 = 同一个请求 id 的第二处呈现，不是第二个请求，也不是第二次审批。** 主进程只创建一个 `pending` 条目；镜像只是让同一张卡同时出现在主入口（Liaison）聊天流里。客户无论在哪一侧作答，调用的是同一个 `respond({id, decision})`，只结算一次。

**镜像判据**（`app/desktop/governance-advance.ts` 导出纯函数 `isMirroredGovernanceCard(cardKind)`）：

| `cardKind` | 是否镜像 | 理由 |
| --- | --- | --- |
| `proposal` | **是** | 客户明确要求；主入口应能接受/修改提案 |
| `appointment` | **是** | 任命是客户级治理决定 |
| `appointment-write` | **是** | 逐路径写盘确认是任命的第二层 |
| `schedule-write` | **是** | 流程写盘是治理决定 |
| `acceptance` | **是** | 验收是客户级治理决定 |
| `write`（普通写盘确认） | 否 | 角色工作会话的操作确认，不是治理决定 |
| 无 `cardKind`（旧调用） | 否 | 零行为变化 |
| shell 审批卡 / 恢复确认卡 | 否 | 运维面，保持原生位置 |

- 仅 `governanceModel === "trio"` 且来源角色 ≠ `primaryRoleId` 时镜像；Liaison 没有 `customerInput`，不会成为来源。
- 只有**已呈现（active）**的治理卡镜像；排队中的请求不出现可操作卡，只在主入口显示聚合行「还有 N 个决定等待前一个决定」（`customer-input.ts:174` 的 `activeByProject` 不变）。
- **原卡保留**：原生卡与镜像卡都显示、都可作答；第一份被受理的答案生效。原生卡留在发起角色聊天流；镜像卡带来源标签「来自 <发起角色> 的治理决定 · 客户最终批准」。

### 6.2 载荷与状态

- `OperatorRequestPayload`（`app/desktop/customer-input.ts:51-67`）增可选 `mirrorRoleId?: string`；`roleId` 仍是发起角色（回执归属/原生徽标）。
- `session.ts` 构造 `customerInput` 闭包时（:1426-1428）计算并传入 `ctx.mirrorRoleId`：`trio` 且 `cardKind` 命中镜像集合且 `roleId !== listing.primaryRoleId` → `primaryRoleId`；否则不传。**不在渲染侧重复判据**。
- `pending`/`waiting` 仍以请求 id 为键；**不创建第二个条目**；`respond` 仍按请求快照校验（:354-368）。
- 第一次合法答案结算后，第二次 `respond`（无论来自哪一侧）返回 `{ok:false, expired:true}`；界面已冻结；第二次不写账本、不产生第二个 `customer.decision`、不触发第二次 `onNextStep`。
- 两侧几乎同时提交：主进程事件循环串行受理，先到者生效；后到者按终态拒绝。

### 6.3 渲染侧（`app/renderer/renderer.js`）

- `opRequests[requestId]` 由单 `{roleId, card}` 扩为 `{roleId, surfaces: string[], cards: { [roleId]: Element }, state, finalNote, ...}`；`surfaces = [roleId, mirrorRoleId?]`（去重）。
- `openRequestIdsFor(roleId)`（:3101-3107）改为 `surfaces.includes(roleId)`；`openRequestCountFor`/`statusBadgeHtml`/`updateOpChip` 自动跟随。
- `materializeOperatorCard(requestId, surfaceRoleId)`：
  - 源面：沿用现有锚点/回放/行序位逻辑（:3334-3470）；
  - 镜像面：追加到 Liaison pane 末尾（不参与源面 `paneAnchors`），带来源标签与同一请求 id 的按钮；
  - 同一 `requestId` 在同一面幂等（`cardInPane` 去重）。
- 作答：任一面点击 → `d.operatorRespond({id, decision})`；成功后冻结**所有** `entry.cards`，并刷新所有面的徽标/队列（`refreshEntryAwaiting` 改为遍历 `surfaces`）。
- 失效：`session:operator-expired` 的 `payload.roleId` 是来源角色；查找条目时按 `opRequests[payload.id]`，命中后冻结所有面（不要求 `payload.roleId === entry.roleId` 之外的第二个面）。
- 排队：`session:operator-queued` 的 payload 带 `mirrorRoleId`；主入口显示聚合行，不物化可操作卡。
- 镜像卡**不写入 Liaison 的模型上下文**：它不是模型消息，只是界面呈现；Liaison 回答进展时读项目文件/账本快照。

### 6.4 持久性与重启语义（如实）

- 镜像卡是**运行期呈现**：随待决请求存在；应用关闭/重启后未决请求按既有 G-1 语义失效（`expired:true`），镜像卡随之消失。
- 持久记录在账本与发起角色的会话历史：`customer.decision` 记录客户批了什么；发起角色聊天回放保留原生卡。Liaison 聊天不会凭空多出它没有参与过的模型消息。
- V1 不承诺「重启后在主入口回放镜像卡」；V1.1 可做只读回放（读账本 + 请求登记），但不得造第二份可作答卡。

## 七、账本与审计

### 7.1 类型扩展（`src/common/编排/governance-ledger.ts`）

```ts
export type GovernancePower =
  | "proposal" | "nomination" | "schedule" | "acceptance"
  | "app" | "customer" | "liaison";           // 新增；只作标记，门禁不读

export interface GovernanceLedgerEntry {
  // ...既有字段
  kind:
    | "customer.decision" | "dispatch.accepted" | "artifact.observed"
    | "governance.established" | "governance.reaccepted" | "governance.migrated"
    | "intent.handed-off" | "clarification.requested";   // 新增
  intentId?: string;
  handoffKind?: "initial" | "clarification" | "revision";
  trigger?: "customer-decision" | "intent-handoff" | "settle";
}
```

- 旧条目缺 `trigger` 仍合法；不追改历史。
- `dispatch.accepted` 的 `trigger` 用于区分「客户决定后推进」「意图交接后投递」「settle 后推进」；三者都仍是 `actorRoleId:"app"`, `power:"app"`，**都不是客户批准**。

### 7.2 写入点（V1）

| 事件 | 写入者 | 触发点 | 关键字段 |
| --- | --- | --- | --- |
| `intent.handed-off` | 桌面窗口 | `hand_off_intent` 投递成功后 | `actorRoleId:"liaison"`, `power:"liaison"`, `intentId`, `handoffKind`, `targetRoleId:"rapporteur"`, `flowId?`, `artifactPath`, `artifactSha256`, `messageSummary`(≤200), `runtime`, `sessionId` |
| `dispatch.accepted`（交接） | 桌面窗口 | 同上投递成功后 | `actorRoleId:"app"`, `power:"app"`, `trigger:"intent-handoff"`, `targetRoleId:"rapporteur"`, `intentId`, `flowId?`, `messageSummary` |
| `dispatch.accepted`（客户决定推进） | 桌面窗口 | `advanceGovernanceFlow` 投递成功后（**当前缺口，W6-0 补**） | `actorRoleId:"app"`, `power:"app"`, `trigger:"customer-decision"`, `flowId`, `stepId`, `targetRoleId` |
| `clarification.requested` | 桌面窗口 | `request_clarification` 校验通过后 | `actorRoleId:"rapporteur"`, `power:"proposal"`, `flowId?`, `intentId?`, `messageSummary` |
| `customer.decision` | 编排 | 既有 `run-role.ts` 客户通道包装器 | 既有字段；镜像作答仍只写**一条** |
| `artifact.observed` | 编排 | Liaison 每轮 settle 后扫 `docs/intents/`（既有 `preauthorizedDirs` 机制） | `actorRoleId:"liaison"`, `power:"liaison"`, `artifactPath`, `artifactSha256` |

- **顺序**：先投递成功、后写账本（沿用 `dispatch.accepted` 先例）；账本失败只记诊断，不翻转投递结果、不循环重试。
- **不写客户决定**：`intent.handed-off`/`dispatch.accepted`/`clarification.requested` 均不写 `customerDecision`/`decisionEvidence`；任何门禁不读它们。

### 7.3 审计可还原

| 审计问题 | 账本回答 |
| --- | --- |
| 客户说了什么 | 聊天流 + `docs/intents/<intentId>.md`（Liaison 写，`customerWords` 原话摘录）+ `artifact.observed` |
| 谁转的交 | `intent.handed-off`（`actorRoleId:"liaison"`, `power:"liaison"`, `intentId`, `handoffKind`, `artifactPath/hash`） |
| 应用怎么推进的 | `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId}` |
| 谁提的案 | `artifact.observed{actorRoleId:"rapporteur", artifactPath:"docs/proposals/<flowId>-vN.md"}` |
| 谁提的名 | `artifact.observed{actorRoleId:"nominator", ...}` |
| 谁排的程 | `artifact.observed{actorRoleId:"convener", ...}` + `dispatch.accepted`（Convener 工具派发或 app 推进） |
| 客户批了什么 | `customer.decision`（`decisionKind`、`customerDecision`、`targetRoleIds`、`paths`、`decisionEvidence`）；镜像作答仍一条 |
| 澄清往返 | `clarification.requested` + 后续 `intent.handed-off{handoffKind:"clarification"}` |

**纪律**：`intent.handed-off` 不是客户批准；镜像不产生第二份 `customer.decision`；角色（含 Liaison）不可写账本；`.ans/**` 在四人的 `forbiddenWritePaths` 内；`decisionEvidence.surfaceRoleId` V1 不记录（客户在哪一侧作答是 UI 事实，不入账本）。

## 八、兼容与迁移（保持 `governanceModel: "trio"`）

- **不新增 `.ans` 字段**：不写 `governanceRoles` 映射、不加 `quad`、不加 `liaison` 标记。四角色 id 是应用常量，由注册表 + 模型派生。
- **旧 trio 项目零迁移**：`.ans`、pin、manifest、角色卡、提案/契约/提名/流程/账本全部不动；升级后自动获得 Liaison 主入口。`docs/intents/` 是新增空目录，首次使用时由 Liaison 创建，不加入 pin。
- **single/su 逐字不变**：`listProject` 只返回 su、`primaryRoleId="su"`；无 Liaison、无镜像、无交接、无新账本事件；`resolveBoundarySection` 对 Liaison 在 single 下结构性拒绝。
- **旧版应用兼容**：旧版读同一 `trio` `.ans` 仍按三人工作，忽略 `liaison` 与 `docs/intents/`；新版再打开后 Liaison 回来，数据不丢。`docs/intents/**` 不被旧版删除。
- **迁移（single → trio）代码不变**：`migrateGovernanceModel` 仍只写 `governanceModel:"trio"`；迁移预览文案补一句「迁移后客户默认入口为联络官」，不改变写路径与 pin。
- **保留 id**：`角色卡/liaison/` 跳过并警告；`resolveRole("liaison")` 按内置解析；项目角色不能遮蔽。
- **迁移后 su**：仍隐藏、不可开启、历史只读；Liaison 不获得 `docs/su/**` 写权。

## 九、UI（最小面）

### 9.1 左树

1. **主入口**：Liaison（`primaryRoleId` 驱动，现有 `renderRoleTree`/`roleTreeItem` 结构无需重写，数据变化即可）。
2. **治理职能（内置）**：Rapporteur、Nominator、Convener（主入口从组里排除的既有逻辑自动生效）。
3. **其他角色**：项目角色，沿用 `group`/`groupDuty`。

每行显示：

- 「联络官 Liaison」「报告员 Rapporteur」「提名官 Nominator」「召集人 Convener」；
- 权力副标题：**「客户沟通 · 不拥有最终批准权」** / 「提案权 · 不拥有最终批准权」 / 「提名权 · 不拥有最终批准权」 / 「编排权 · 不拥有最终批准权」；
- 内置标识：「内置角色：随应用发布，无角色目录」。

实现落点：`app/renderer/ui-labels.js` 的 `GOVERNANCE_ROLE_TEXT` 增 `liaison` 项；`app/renderer/renderer.js:4844-4877` 的 `roleSubtitle`/`roleTreeItem` 与 :4917-4944 的分组均按 `governanceFunction` 派生，不硬编码 id。

### 9.2 空态与治理记录入口的优先级（必须修正）

当前 `emptyStateHtml`（`renderer.js:419-471`）在 `govEmpty` 命中时会把治理记录 CTA 置空（:450-451）。Liaison 是主入口，**「建立治理记录 / 检查并重新接受」入口必须继续显示在主入口**。因此实现必须把优先级钉死：

1. `hasRoles === false` → 保留 S0「项目尚未 bootstrap」与「开始与 <主入口> 对话」CTA；Liaison 的一句话职责说明作为附加提示，不替换 S0。
2. `action === "reaccept"` / `"establish"` → 保留既有治理记录 CTA；若当前角色是 Liaison，可同时显示其职责提示。
3. 否则 `govEmpty` → 显示该治理角色的空态说明；主入口不再重复「开始与 <自己> 对话」CTA。
4. 其他 → 既有默认空态。

文案：

- Liaison：「客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给报告员形成提案。我不写提案、不批准。本版起默认入口为联络官；报告员与历史提案不变。」
- Rapporteur：「通常由联络官交接打开；客户也可以直接找我。我只写提案，不批准。」
- Nominator/Convener：沿用既有「通常由应用按流程后台派发」说明。
- 旧项目（single）不出现 Liaison；旧模型提示条与迁移入口不变。

### 9.3 状态行与系统行

- 状态行显示：治理模型（三权/旧模型）、当前 `flowId`（若有）、`等待你决定` / `进行中` / `阻塞` / `已升级客户`；数据来自账本/流程单，不读 Markdown `status`。
- 新增主入口进度行（只读、非模型消息）：
  - 「已交给报告员（工作中）」
  - 「报告员需要澄清：<一句话>」
  - 「报告员工作中 / 提名官工作中 / 召集人工作中」（随 `role-state`）
  - 「应用无法把意图交给报告员：<原因>；未重试」
  - 排队聚合：「还有 N 个决定等待前一个决定」
- **落位**：交接/澄清/失败行落主入口 Liaison；客户决定后的下一步推进行落**作答面**（若可知）并同步主入口（Liaison），目标角色保留自己的系统行；不整段镜像角色助手消息。
- 失败行不循环重试、不自动切换视图；`single`/`su` 不出现这些行。
- **持久性如实**：进度行是运行期呈现，重启后不回放；账本与意图文件是持久记录（§二-13）。

### 9.4 不做

- 不做独立的「意图」面板（V1）；`docs/intents/*.md` 复用现有文档预览/资料入口。
- 不做第三个（意图/流程）面板或独立权限说明模态。
- 不自动打开/切换 Liaison 或任何角色；镜像卡到达只更新徽标与状态行。
- 不把镜像卡写入 Liaison 的模型上下文。

## 十、验收映射（可测量）

1. **四角色枚举**：新 trio 项目 `listProject` 恰返回 4 个 `builtIn === true`，顺序 `liaison`/`rapporteur`/`nominator`/`convener`，`primaryRoleId === "liaison"`，`governanceModel === "trio"`。
2. **左树与文案**：主入口为联络官；治理职能组恰为报告员/提名官/召集人；四条权力副标题逐字正确；`角色卡/liaison/` 不出现。
3. **Liaison 写权**：写 `docs/intents/**` 放行；写 `docs/proposals/**`、`docs/contracts/**`、`docs/nominations/**`、`docs/flows/**`、`docs/skills/**`、`docs/mcp/**`、`docs/governance/**`、`docs/workflow.md`、`角色卡/**`、`.ans/**`、manifest、治理边界全部被拒，拒绝文案指回正确归属。
4. **能力矩阵**：Liaison 无 `customerInput`/`dispatchTask`/`roleStatus`/`sessionTail`/`proposeRecovery`/`installSkill`/`installMcp`/shell；有 `handOffIntent`；Rapporteur 有 `requestClarification`；Nominator/Convener 与 trio 契约逐项不变；su 旧行为不变。
5. **交接闭环（确定性夹具）**：意图文件 → `hand_off_intent` → 账本 `intent.handed-off` + `dispatch.accepted{actor:"app", trigger:"intent-handoff"}` → Rapporteur 收到一条任务；**不打开/不切换会话、不移动 pane/焦点**；左树只显示「工作中」。
6. **交接守卫**：意图文件缺失、`goal/scope/acceptance` 任一为空、入参与文件不一致、slug 非法、`summary` 为空/超长、同一 `intentId+handoffKind+hash` 重复、同一轮第二次、`initial` 第二次、`clarification`/`revision` 无既有交接、账本不可读 → 工具拒绝且无账本/无派发；非 Liaison 角色无该工具。
7. **交接不是批准**：交接与派发不写 `customerDecision`/`decisionEvidence`；无客户接受提案时 Convener 写 flow 仍被拒。
8. **镜像范围**：`proposal`/`appointment`/`appointment-write`/`schedule-write`/`acceptance` 在 Liaison 与发起角色两侧都出现；`write`、shell 审批、恢复确认、无 `cardKind` 不镜像；降级为仅 `proposal` 时其余卡仍在原生位置且 UI 说明。
9. **同一请求只答一次**：在任一侧作答后两侧冻结；另一侧再答返回 `expired:true`；账本恰一条 `customer.decision`；`onNextStep` 恰一次。
10. **排队与一项目一卡**：第二张治理卡排队时不出现可操作镜像，只显示聚合排队行；第一张结算后第二张按序出现并镜像；不自动合并/批准。
11. **镜像后的下一步**：在主入口接受提案 `accept` → 恰一次后台派发 Nominator；`accept-quick` → 恰一次 Convener；无重复派发、无第二事件。
12. **澄清闭环**：Rapporteur `request_clarification` → 账本 `clarification.requested` → Liaison 出现系统行 → 客户回答 → Liaison `hand_off_intent{clarification}` → 再投递 Rapporteur；不新建 flow；超过 2 轮必须在提案卡上请客户决定。
13. **直接路径仍可用**：客户直接打开 Rapporteur 写提案、发卡、接受；不要求意图文件；提案卡仍镜像到 Liaison。
14. **旧项目兼容**：既有 trio 夹具 `.ans` 在升级前后逐字节不变（或字段级无变化）；`primaryRoleId` 变 `liaison`；single 夹具行为逐字不变（仍 su、无镜像、无交接、无新账本事件）。
15. **降级语义**：旧版应用读同一 trio `.ans` 不崩溃、仍按三角色工作；新版再打开后 Liaison 回来；`docs/intents/**` 不被删除。
16. **保留 id**：`角色卡/liaison/` 被跳过并给出警告；项目角色不能遮蔽内置 Liaison。
17. **审计可还原**：给定一条完整链，能从账本还原「客户意图 → 谁转的交 → 谁提的案 → 客户批了什么 → 应用派发给谁」；`intent.handed-off` 与 `customer.decision` 不混用。
18. **失败路径**：投递失败只落系统行、无成功账本、不循环重试；下一次成功交接必须由客户新消息触发。
19. **应用推进审计（W6-0 修复）**：`advanceGovernanceFlow` 成功投递后写 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"customer-decision", flowId, stepId, targetRoleId}`；不写 `customerDecision`；失败不写。
20. **UI 最小面**：主入口 Liaison；治理职能组三人；Liaison 空态同时保留「建立治理记录 / 检查并重新接受」入口；镜像卡来源标签；无新面板；后台推进不切换选中角色/pane/焦点。
21. **CLI 收窄**：`ans govern --function liaison` 明确拒绝；`proposal|nomination|schedule` 行为不变；`ans role run` 不受影响。
22. **账本失败不翻转**：账本 append 失败只记诊断/如实回执，不改变客户决定、不放宽门禁、不阻断投递。
23. **无自动批准**：全仓不存在「角色文件 status → 门禁放行」「judge allow → 治理批准」「应用交接/派发 → 客户决定/自动批准/自动写盘/自动任命」的代码路径；测试逐条断言。
24. **全量回归**：`node --test "test/**/*.test.ts"`（三层 glob，不能漏测）；typecheck 零错；不跑真实模型/网络/凭据/`.env`。

## 十一、风险

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| **沟通与提案脱节** | Liaison 转述偏差，Rapporteur 写出错误提案 | 意图文件带客户原话、`goal/scope/acceptance`；提案 frontmatter 关联 `intentId`；入参与文件不一致即拒绝；客户可直接找 Rapporteur |
| **重复提案/重复交接** | 同一意图多次派发，Rapporteur 写多份提案 | `intentId+handoffKind+sha256` 去重；`initial` 仅一次；每轮一次；修订必须引用既有 intent；提案最多 v2 |
| **镜像卡答两次** | 两侧都点，产生两个决定 | 同一请求 id 单点结算；第二份 `expired:true`；两侧同步冻结；账本只一条；渲染侧不建第二请求 |
| **自动交接误触发** | 客户寒暄/提问被当成任务，自动派发 | 意图四要素非空；每轮一次；去重；Liaison 卡文本要求先问清；系统行可见；不自动重试 |
| **Liaison 越权** | 写提案、任命、派发、批准 | Section 1 只 `docs/intents/`；能力矩阵无 dispatch/install/approval；禁写路径先于 `resolveWrite`；拒绝文案指路；测试逐项断言 |
| **主入口单点** | Liaison 会话异常时客户不知道找谁 | Liaison 不是关卡；客户可直接打开 Rapporteur；原生卡始终存在；失败系统行如实说明 |
| **默认入口变化引发困惑** | 旧 trio 项目升级后突然面对联络官 | Liaison 空态一句话说明；不做永久迁移提示；报告员仍可点开 |
| **镜像噪音/双徽标** | 同一决定在两侧都亮「等待你确认」 | 只镜像治理卡；只镜像 active 卡；排队用聚合行；徽标语义是「同一请求」，不是两张卡 |
| **澄清循环** | Rapporteur 反复追问，客户疲惫 | 同一 flow 最多 2 轮；第 3 轮必须提案卡（带假设/备选）；Liaison 负责解释 |
| **与在飞 auto-dispatch 冲突** | 同文件并行修改，下一步事件重复/冲突 | 串行在 W3/W4 收口后做；复用 `governance-advance.ts` 的投递纪律；交接是新增触发，不复制第二套；`deriveGovernanceNextStep` 不新增卡片种类 |
| **审计缺口** | 应用后台推进未写 `dispatch.accepted(app)`；客户在哪一侧作答无法区分 | W6-0 补齐 app 派发账本；侧别 V1 如实不记录；账本回答「谁批了什么」 |
| **意图文件泄密** | 客户在沟通里贴了凭据/密钥被写入文件 | 卡文本明确禁止；`customerWords` 只摘录需求；V1 只做文案纪律，不做内容扫描承诺；残留风险如实登记 |
| **成本/延迟** | 多一个角色、多一次意图落盘与交接 | 直接路径仍可用；快捷路径保留；V1 只按客户消息推进一次；模板化；不三人互聊 |
| **能力矩阵字面量** | `customerInput: true` 改 `boolean` 导致消费方类型/断言遗漏 | 门禁引擎单点改；消费方按 `governanceFunction` 派生；测试逐项断言；`LEGACY_SU_CAPABILITIES` 显式补 false |
| **卡文本陈旧** | Rapporteur 仍自称客户沟通入口；Convener 仍写「客户点击打开 Nominator」 | W6-0 同批修订三张卡文本；测试钉住关键词；Convener 文案改为「应用后台派发」 |

## 十二、派发顺序与并行边界

### 12.1 前置门槛

**在 auto-dispatch/警告一次性/预算修复批次收口前，不启动 Liaison 实施。** 二者共用以下文件/接缝：

| 文件 | 在飞内容 | Liaison 将改内容 | 处理 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | 后台派发、投递、账本、能力注入 | Liaison 能力、镜像 ctx、交接/澄清、app 账本 | 桌面窗口单一属主；先收口，后 Liaison |
| `app/desktop/customer-input.ts` | `OperatorRequestPayload`、队列、onNextStep | `mirrorRoleId`、镜像呈现 | 先收口，后扩展 |
| `app/desktop/interface.ts` | `advanceGovernanceFlow`、`ListProjectResult` | 补 app 账本、主入口进度行 | 先收口；若未补账本，W6-0 补 |
| `app/main.ts` / `app/preload.cjs` | 事件转发、IPC | **预期不改**（复用现有 `session:operator-request`/`session:operator-response`/`governance:next-step`） | 若确需新 IPC，桌面窗口同批 |
| `app/renderer/renderer.js` | 交互卡、左树、状态行 | 镜像物化/冻结/徽标、空态 | 桌面UI单一属主；先收口 |
| `test/桌面应用/*` | auto-dispatch/警告/预算测试 | 镜像/交接测试 | 同文件串行；新用例用新文件名 |

- **当前 `advanceGovernanceFlow` 未写 `dispatch.accepted(app)`**：收口时由桌面窗口属主补；若仍缺，W6-0（门禁/运行时/编排之外的桌面窗口前置）必须先补，Liaison 不在缺口上叠缺口。
- 若在飞批次尚未提交/验证，Liaison 只出本文与任务书，不启动执行上下文。

### 12.2 W6 波次（收口后）

| 波次 | 属主 | 内容 | 依赖 |
| --- | --- | --- | --- |
| **W6-0 契约** | 门禁引擎 + 运行时核心 | `GovernanceFunction`/`GovernancePower` 增 `liaison`；注册表 Liaison spec/顺序/能力/目录前缀；三人卡文本修订；`listProject`/`resolveGovernanceRole`；运行时核心载荷/工具/能力位；单测 | 无（但 `model/runtime.ts` 需在飞批次已收口） |
| **W6-A 门禁+编排** | 门禁引擎 ∥ 编排 | 门禁：保留 id/边界/lists 测试；编排：`run-role.ts` 能力注入、`governance-handoff.ts`、`governance-ledger.ts`、`govern-session.ts` 再导出、`artifact.observed` 覆盖 | W6-0 |
| **W6-B 桌面窗口** | 桌面窗口 | `handOffIntent`/`requestClarification` 能力；后台开/发；系统行；`mirrorRoleId`；`advanceGovernanceFlow` 补 app 账本；主入口进度行；不打开/不切换 | W6-A |
| **W6-C 桌面UI** | 桌面UI | `liaison` 文案/副标题；树分组；镜像卡物化/冻结/徽标/来源标签；空态优先级；排队聚合；状态行；渲染测试 | W6-B 的 Interface 契约 |
| **W6-D 独立验收** | 测试 | 四角色、写权、能力、交接、镜像、澄清、兼容、审计还原、UI e2e；全量三层 glob | W6-0–W6-C |

- W6-0 的门禁与运行时核心是不同文件，可并行；同角色内串行。
- W6-A 的 `governance-handoff.ts` 与 `run-role.ts` 同属编排，串行；门禁引擎的 `resolve-role.ts` 与编排不同文件，可并行。
- W6-B 依赖 W6-A 的 `govern-session.ts` 公共导出；W6-C 依赖 W6-B 的 `ListProjectResult`/`OperatorRequestPayload`；W6-D 最后。
- **V1b 迁移不需要**（`.ans` 形状不变）；若客户要求「迁移预览补一句默认入口变化」，作为桌面UI 一行文案并入 W6-C，不单列波次。

### 12.3 不得跨角色写的文件（重申）

- `src/model/role.ts`：**门禁引擎**唯一主属。
- `src/model/runtime.ts`：**运行时核心**唯一主属。
- `src/common/门禁引擎/**`：门禁引擎私有；他人只读。
- `src/common/编排/**`、`src/pipeline/orchestration/**`：编排私有；桌面只经 `govern-session.ts` 公共出口。
- `src/service/role/**`：门禁引擎；`src/service/runtime/**`：运行时核心。
- `src/common/shared/**`：PM 唯一写入者（本项**不需要**改 `config-loader.ts`；不新增 `.ans` 字段）。
- `app/desktop/**`、`app/main.ts`、`app/preload.cjs`：桌面窗口。
- `app/renderer/**`：桌面UI。
- 测试目录：`test/门禁引擎/`、`test/编排/`、`test/runtime-core/`、`test/装配/` 等各属主；`test/桌面应用/` 为桌面窗口与桌面UI 共用清单（只扩展既有文件或按既有规则新增）；`test/测试/` 归测试角色。
- 任何角色不得改其他角色的 `角色卡/`、`boundary.yaml`、`memo.md`、`docs/`。

## 十三、必须客户拍板的点

以下 4 项超出 PM 可自行裁定的范围（或会改变客户可见行为），实施前需客户明确；其余开放问题按本文推荐默认执行。

1. **Liaison 写权**：推荐只写 `docs/intents/`（可审计、可复读、可关联 `intentId`），不设 `docs/governance/liaison/` 工作笔记目录；备选是「Liaison 零写权」，但客户沟通只留在聊天记录、审计无法从项目文件还原意图。
2. **镜像范围**：推荐全部治理 `cardKind`（`proposal`/`appointment`/`appointment-write`/`schedule-write`/`acceptance`）统一镜像；若只镜像提案卡，需明确列为降级，并在主入口说明其余卡在发起角色作答。
3. **旧 trio 项目默认入口**：推荐升级后直接以 Liaison 为主入口、空态一句话说明、不做持久迁移提示条；备选是一次性提示（客户点过即消失）。
4. **镜像/进度行的持久性**：推荐 V1 只做运行期呈现，重启后不回放（持久记录在账本与意图文件）；若客户要求主入口回放，列 V1.1 只读回放，且不得造第二张可作答卡。

**已由客户拍板、无需再问**：新角色 Liaison；提案接受/修改卡镜像到主入口；现在就改四角色；Liaison→Rapporteur 应用后台派发（actor=app，不打开不切换）；交接不是客户批准。

## 十四、明确声明

**本文件只是评审与拆发，未实施。** 未改任何源码、测试、`.ans`、UI 或其他角色文件；未启动执行上下文；未读 `.env`、未跑凭据/网络/真实模型；未 git 提交。文中的源码行号为写作时点工作树读数（含在飞修改），实施前须按当轮 HEAD 复核。本文不构成对任何实现角色的派发授权；是否实施、如何分期、哪些点采用推荐默认，由客户/项目管理拍板。
