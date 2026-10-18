---
id: governance-liaison-independent-verification
type: fix
title: 治理四角色（新增 Liaison 联络官）独立端到端验证（测试角色）
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: verified
related: [governance-liaison-review, governance-trio, governance-trio-review, governance-pin-recovery]
events:
  - date: "2026-10-18"
    kind: created
    summary: 按 PM 评审 §4–§7/§十 独立验证四角色（liaison→rapporteur→nominator→convener）——自建 `test/测试/governance-liaison-verify/` 34 例离线端到端（列表/主入口/写权/能力/交接/澄清/镜像/自动推进/审计还原/UI 文案）；修正本角色 7 条因四角色变更失效的旧三权断言（未放宽）；全量 2769/2747 pass/19 fail/3 skip（新增红 3：AC5 缺 `dispatch.accepted{trigger:"intent-handoff"}`、AC3 越界写文案未指回归属、AC21 CLI 未收窄；既有红 16 均非本批）；typecheck 0；另登记 2 项口径偏差（`power:"communication"` 与评审 `"liaison"`、`dispatch.accepted(customer-decision)` 缺 `stepId`）
  - date: "2026-10-18"
    kind: reverified
    summary: 属主修复三处缺陷后复审——① `power` 统一 `"liaison"`、CLI `--function/--role liaison` 显式拒绝、Liaison 越界写文案指回报告员/提名官/召集人/应用；② 桌面交接成功补写 `dispatch.accepted{app, trigger:"intent-handoff", targetRoleId:"rapporteur", intentId}`，推进账本支持显式 `stepId`（缺席记诊断、不伪造）。本角色同步断言（`power` 严格 `liaison`；AC5 改走真实桌面链；AC19 显式 stepId 入账/缺席不伪造）；复跑本批 **34/34**；全量 **2769/2750 pass/16 fail/3 skip**（新增红 0；剩余 16 红全为既有环境/他角色在途）；typecheck 0；报告缺陷改为已修复、残余仅「卡片未携带 stepId 时账本无该字段（已诊断、不伪造）」的如实说明
---

# 治理四角色（新增 Liaison 联络官）独立端到端验证（测试角色）

**验证对象**：PM 评审 [2026-10-18_design_governance-liaison-review.md](../../../项目管理/docs/design/2026-10-18_design_governance-liaison-review.md)（status `approved`，revision 1；客户 2026-10-18 拍板「三权不变、角色四名」）已落地的门禁引擎 / 运行时核心 / 编排 / 桌面窗口 / 桌面UI 实现。
**验证范围**：四角色枚举与主入口、旧 trio 自动获得 Liaison、single 逐字不变、Liaison 写权矩阵与能力矩阵、`hand_off_intent` 交接闭环与全部守卫、`request_clarification` 两轮上限、决定卡镜像（同一请求 id / 只答一次 / 两侧冻结 / single 不镜像 / 排队聚合）、自动推进账本、审计可还原、UI 文案与镜像呈现。
**纪律**：只写 `test/测试/` 与 `角色卡/测试/` 自有文档；未改 `src/`、`app/`、其他角色测试或资料；未读取 `.env`、未使用真实凭据、未启动真实模型、未 git 提交。

## 一、环境

| 项 | 值 |
| --- | --- |
| 平台 | Windows 11 Home China（win32） |
| Node | v24.11.1 |
| 基线 | `main` / 工作树含本轮各角色在途改动 |
| 测试命令 | `node --test "test/**/*.test.ts"`（**三层 glob**） |
| 类型检查 | `npm run typecheck`（TypeScript 7.0.2） |
| 网络/模型 | 全部离线；会话入口使用确定性桩适配器（脚本化工具调用，立即 settled，不触真实模型） |

## 二、夹具

新增目录 `test/测试/governance-liaison-verify/`（`fixture.ts` + 6 个用例文件，**34 例**），全部在系统临时目录构造、用后清理：

- `fixture.ts`：临时项目根/角色目录/意图文件/提案/流程单/账本条目/目录树快照/`waitForLedger`/确定性客户通道；**自建假适配器**（`buildGovernedTools` 逐能力位透传）——实施方 `createFakeRuntimeAdapter` 尚未转发 W6-A 的 `handOffIntent`/`requestClarification`，故本夹具自建等价适配器，使两个新工具在离线用例中真实注册并执行到编排包装器。
- `a-roles-writes-caps.test.ts`（**8 例**）：四角色枚举/主入口、旧 trio 零迁移、保留 id、single 不变、Liaison 写权矩阵、AC3 文案归属、能力矩阵、工具注册面。
- `b-intent-handoff.test.ts`（**12 例**）：合法交接（工具→账本）、AC5 双事件、八类守卫、去重/initial 一次性/修订引用、每轮一次、非 Liaison 无工具、账本不可读、投递失败不重试、交接不是批准、`docs/intents` settle 观察、桌面后台投递闭环（不切 pane）、桌面投递失败。
- `c-clarification.test.ts`（**5 例**）：澄清闭环与账本、两轮上限（flow）、intentId 计数/缺归属/账本坏、送达失败不写账本、桌面主入口系统行且不弹决定卡。
- `d-mirror-advance.test.ts`（**7 例**）：镜像通道一次性/排队、SessionManager 镜像面计算（proposal/appointment/appointment-write/schedule-write/acceptance；write/无 cardKind/single 不镜像）、渲染源码钉、ui-labels 文案、下一步推导与镜像范围、自动推进账本。
- `e-audit.test.ts`（**1 例**）：意图→提案→任命→派程→验收全链，只读账本还原审计问题。
- `f-cli.test.ts`（**1 例**）：AC21 CLI 收窄（按评审口径断言，见缺陷 2）。

关键判据：

- **假桌面** = 真实 `SessionManager` + 真实 `openRoleSession`，仅注入自建假适配器与 listing/emit；**假 IPC** = 真实 `createDesktopInterface`。
- **账本还原** = 只读 `.ans/governance/ledger.jsonl`：`intent.handed-off` 判谁沟通、`artifact.observed` 判谁提案/提名/排程、`customer.decision` 判客户批了什么、`dispatch.accepted` 判应用/召集人派发给谁。
- **UI** = 真 `ui-labels.js` 纯函数 + renderer 源码结构钉（未启动 Electron/DOM）。

## 三、逐项结果

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 四角色枚举：恰 4 个 `builtIn`（liaison→rapporteur→nominator→convener）、`primaryRoleId=liaison`、`governanceModel=trio`；卡文本含沟通权/第五个治理角色，Rapporteur 不再自称客户沟通主入口，Convener 提名步骤为应用后台派发 | **通过** | a-1 |
| 2 | 旧 trio 项目自动获得 Liaison 主入口；`listProject` 前后完整文件树快照逐字节不变（零迁移） | **通过** | a-2 |
| 3 | 保留 id：`角色卡/liaison/` 被跳过并警告；项目角色不能遮蔽内置 Liaison | **通过** | a-3 |
| 4 | single：仍 su / `primaryRoleId=su`；无 Liaison/交接/镜像；`resolveGovernanceRole` 拒绝 liaison；su 能力集显式含两项新能力 false | **通过** | a-4 |
| 5 | Liaison 写权：`docs/intents/**` 放行；`角色卡/**`、`.ans/**`、manifest、proposals/contracts/nominations/flows/skills/mcp/governance/workflow、`src/**` 全拒且给原因 | **通过** | a-5 |
| 6 | AC3 文案归属：越界写拒绝文案指回报告员/提名官/召集人/应用（修复后复审） | **通过** | a-AC3 |
| 7 | 能力矩阵：Liaison 仅 `handOffIntent`（无 customerInput/dispatch/status/sessionTail/recovery/install/shell）；Rapporteur 提案+澄清；Nominator 安装；Convener 派发/看护/只读 shell；注册表为唯一来源 | **通过** | a-6 |
| 8 | 工具注册面：注入才注册（`hand_off_intent`/`request_clarification` 各自独立；都不注入则都不存在） | **通过** | a-7 |
| 9 | 合法交接：工具调用成功 → `intent.handed-off` 字段完整（actor=liaison、power=liaison、intentId/handoffKind/target=rapporteur/flowId/artifactPath/artifactSha256），且不写客户决定/证据 | **通过** | b-1 |
| 10 | 交接成功同时写 `dispatch.accepted{actor=app, power=app, trigger=intent-handoff, target=rapporteur, intentId}`（真实桌面链，修复后复审） | **通过** | b-AC5 |
| 11 | 交接守卫：文件缺失、goal/scope/acceptance 空、入参与文件不一致、slug 非法、summary 空/超长 → 拒且零投递零账本 | **通过** | b-2 |
| 12 | 去重/`initial` 一次性/`clarification` 无既有交接 → 拒 | **通过** | b-3 |
| 13 | 每轮一次：同轮第二次拒；下一轮可再交接 | **通过** | b-4 |
| 14 | 非 Liaison 角色即便误给 `handOffIntent` 也不注入 | **通过** | b-5 |
| 15 | 账本坏行 → 交接 fail-closed（拒、不投递） | **通过** | b-6 |
| 16 | 投递失败/抛错 → 如实回执、不重试、零成功账本 | **通过** | b-7 |
| 17 | 交接不是批准：交接后 Convener 无客户接受仍不能写流程单 | **通过** | b-8 |
| 18 | Liaison 每轮 settle 观察 `docs/intents`：`artifact.observed`（actor=liaison、沟通权标记） | **通过** | b-9 |
| 19 | 桌面交接：后台开 Rapporteur、恰一条任务模板、不抢 `activeRoleId`/不切 pane、成功系统行落 Liaison、账本一条 | **通过** | b-10 |
| 20 | 桌面交接失败：只落失败系统行、零成功账本、恰一次投递尝试、不切 pane | **通过** | b-11 |
| 21 | 澄清闭环：工具 → 账本 `clarification.requested`（rapporteur/proposal/flowId/intentId）→ 不写客户决定 | **通过** | c-1 |
| 22 | 两轮上限：同 flow 第 1/2 轮通过、第 3 轮拒并提示提案卡；按 intentId 计数；缺归属拒；账本坏拒 | **通过** | c-2、c-3 |
| 23 | 澄清送达失败：如实回执、不写账本、不重试 | **通过** | c-4 |
| 24 | 桌面澄清：系统行落主入口 Liaison；客户确认通道零调用（不占一项目一卡） | **通过** | c-5 |
| 25 | 镜像通道：同一请求 id、来源角色不变、镜像面=liaison；第一次作答结算、第二次 `expired:true`；`onNextStep` 恰一次；排队卡不呈现、结算后按序呈现 | **通过** | d-1、d-2 |
| 26 | 桌面镜像面：proposal/appointment/appointment-write/schedule-write/acceptance 带 `mirrorRoleId=liaison`；write/无 cardKind/single 不镜像 | **通过** | d-3 |
| 27 | 渲染侧：同一请求只登记一次、`surfaces` 列表、两面各自物化、冻结遍历全部呈现面、按请求 id 失效、排队聚合行、镜像徽标/来源标签样式 | **通过** | d-4 |
| 28 | ui-labels：镜像徽标「镜像 · 主入口」、来源标签「来自 <来源> 的治理决定 · 客户最终批准」、排队聚合文案逐字；single 不出现聚合行 | **通过** | d-5 |
| 29 | 自动推进推导：accept→Nominator、accept-quick→Convener、任命→Convener、验收/修订/拒绝→无下一步；镜像范围判据五类 | **通过** | d-6 |
| 30 | 自动推进账本：三次客户决定各写一条 `dispatch.accepted{actor=app, power=app, trigger=customer-decision}`、目标/flowId 正确、不写客户决定/证据；显式 `stepId` 入账、缺席不伪造（修复后复审） | **通过** | d-7 |
| 31 | 审计还原：意图→提案→任命→派程→验收，账本可还原谁沟通/谁提案/谁提名/谁排程/客户批了什么/谁派发；交接与客户决定不混用 | **通过** | e-1 |
| 32 | AC21 CLI：`ans govern --function liaison` 明确拒绝、三值不变（修复后复审） | **通过** | f-1 |

**通过 34 / 失败 0（34 例）**；首轮 3 处按评审口径的失败已由属主修复并复审转绿（见第六节）。

## 四、旧三权断言修正（工作树基线定位，未放宽）

先跑全量定位 `test/测试/` 内因四角色变更失效的旧断言，共 **7 条测试（5 文件）**，逐条按新事实收紧/改精确期望：

| 文件 | 旧断言 | 新断言 | 依据 |
| --- | --- | --- | --- |
| `governance-trio-verify/a-listing-sessions-writes.test.ts` | 恰 3 个 builtIn、顺序 rapporteur→…、`primary=rapporteur` | 恰 **4** 个 builtIn、顺序 **liaison**→rapporteur→…、`primary=liaison`（并核对四职能） | 评审 §4.2/§4.5 |
| `governance-trio-verify/c-migration.test.ts` | 迁移后 `primary=rapporteur`、roles 为 3 内置 | `primary=liaison`、roles 为 **4 内置**（liaison 首位） | 同上 |
| `governance-trio-verify/d-single-compat.test.ts` | su 能力对象 deepEqual 8 键 | 加 `handOffIntent:false` / `requestClarification:false`（**显式 false**，不是省略） | 评审 §4.2/§4.3 |
| `governance-trio-verify/e-ui.test.ts`（3 条） | 三权副标题；Rapporteur 空态为空串；状态行「三权」 | 四角色副标题（含 Liaison「客户沟通」+ `primaryEntrance`）；Rapporteur/Liaison 专属空态逐字；状态行「三权 · 四角色」；假 listing 4 内置 + `primary=liaison`；硬编码扫描加 `liaison` | 评审 §9.1–§9.3 |
| `t9-block1-bootstrap.test.ts` | 空项目 3 内置 / rapporteur 主入口 | 4 内置 / liaison 主入口 / 四职能 | 评审 §4.5 |

另把本角色若干过期措辞「三人」同步为「三权角色/四角色」（`a-listing`、`g1-copy-and-nails` 断言消息、`g2-verify/contract-freeze` 注释）——**仅文字，断言强度未变**。

**复审补充（缺陷修复后的期望同步，非放宽）**：

- `a-listing` 写权矩阵：Convener 写 `角色卡/A/role-card.md` 的拒绝文案期望由 `/应用治理记录|其他治理角色/` 改为 `/提名官|Nominator/`（实现已按 AC3 指回具体归属）。
- `b-intent-handoff`：`intent.handed-off` 与 Liaison `artifact.observed` 的 `power` 期望由「`liaison` 或 `communication`」收紧为严格 `"liaison"`；AC5 用例改走真实桌面链（`SessionManager`）以验证两份事件各一份。
- `d-mirror-advance`：推进账本增加显式 `stepId` 断言（显式给出→入账；缺席→不伪造），并保留 `customerDecision`/`decisionEvidence` 缺席断言。

## 五、全量回归数字

| 轮次 | tests | pass | fail | skipped | typecheck |
| --- | --- | --- | --- | --- | --- |
| 基线（本轮开工，工作树） | 2735 | 2709 | 23 | 3 | 0 错 |
| 首轮收口（发现 3 缺陷） | 2769 | 2747 | 19 | 3 | 0 错 |
| **复审（三处缺陷修复后）** | **2772** | **2753** | **16** | **3** | **0 错** |

- **修正旧红 7**（本角色 5 文件，见第四节）；新增 **34 例**（复审后 **34/34**）。
- **新增红 0（复审后）**：首轮 3 红（AC5/AC3/AC21）已由属主修复、本角色断言同步后转绿；复审未见新的实现红。
- **既有红 16（与本批改动无交集，保持原样）**：Windows symlink `EPERM` 8（claude/codex/pi/runtime-core/编排 shell）、runtime-core shell 子进程竞态 1、桌面 `markdown` vendor pin 1、桌面 renderer 源码钉 4（N-1/data-state/P1-3/G-5，属桌面UI 在途）、桌面 `runtime-ui` 1、本角色 `g4-skill-verify` symlink `EPERM` 1。
- 复审轮 tests 较首轮 **+3**：属主修复批次在各自测试目录新增的用例（非本角色新增）。
- `npm run typecheck` → **0 错**。

## 六、缺陷与口径偏差（首轮发现 → 属主修复 → 复审）

1. **AC5——交接后缺应用投递账本（已修复）**：首轮 `run-role.ts` 成功交接后只写 `intent.handed-off`，`deliverIntentHandoff` 未写 `dispatch.accepted`。属主在桌面窗口补写 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId, flowId?, messageSummary, runtime}`（失败不写、账本失败只诊断、不重试）；本角色 AC5 用例改走真实桌面链复审通过。
2. **AC21——CLI 未按评审收窄（已修复）**：`args.ts` 现对 `--function liaison` 显式报错并指路三值；`govern.ts` 对 `--role liaison` 显式拒绝。`proposal|nomination|schedule` 行为不变；`f-cli` 复审通过。
3. **AC3——越界写拒绝文案不指回归属（已修复）**：编排新增 `governanceWriteOwnerHint`：应用独占→「只能由应用写」；proposals/contracts→报告员；角色卡/提名/技能/MCP→提名官；flows/workflow→召集人。Liaison 越界写 AC3 用例复审通过。
4. **口径偏差——账本 `power` 命名（已修复）**：`intent.handed-off` 与 Liaison 的 `artifact.observed` 统一写 `power:"liaison"`（评审 §7.1）；本角色断言由「liaison 或 communication」收紧为严格 `"liaison"`。
5. **口径偏差——AC19 `stepId`（已补支持）**：推进账本在**卡片/上下文显式给出** `stepId` 时逐条写入；未给出记诊断 `advance.ledger.step-missing` 并**不伪造字段**。残余说明：`CustomerInputRequest.stepId` 是可选契约，卡未携带时账本无 `stepId`——这是如实缺席，不是伪造；若客户要求每张决定都必须有步骤号，需在卡片发起侧强制。
6. **设计已登记（非缺陷）**：镜像卡/进度行是运行期呈现、重启不回放（V1 明确不承诺）；`single` 不出现这些行；角色不可写账本。

**复审结论：首轮 3 项缺陷与 2 项口径偏差均已修复/统一；本批 34/34；未见新的实现缺陷。**

## 七、未覆盖项

- 真实模型/真实引擎的模型行为与真机 Electron 渲染（按纪律不跑；UI 仅用 `ui-labels` 真纯函数 + renderer 源码钉，未驱动 DOM）。
- 镜像卡重启后的只读回放（V1 明确不做）。
- Rapporteur 忙时交接投递 `queued:true` 仍算成功的分支（未构造忙队列）。
- `turnId` 缺失时「每轮一次」降级为去重 + warning 的路径（实现有诊断；未单列用例）。
- `advanceGovernanceFlow` 的 `queued` 与失败注入分支（`sendBackground` 失败/目标忙）。
- 旧版应用读取同一 trio `.ans` 的跨版本兼容（无旧构建可运行；零迁移已由文件树快照证明）。
- 交接/澄清路径的账本 append 失败不翻转（既有三权套件覆盖 `appendGovernanceLedger` 失败；本批直连路径未注入故障）。

## 八、结论

四角色实现与批准评审**一致**：四人注册表/主入口、Liaison 写权与能力、旧 trio 零迁移、single 不变、交接全部守卫与去重/每轮一次、澄清两轮上限、镜像同一请求只答一次/single 不镜像、自动推进 `dispatch.accepted(app, customer-decision)`、审计可还原均经独立离线 E2E 复现通过。首轮发现的 **AC5 应用投递账本、AC3 拒绝文案归属、AC21 CLI 收窄** 三项已由属主修复并复审转绿；**`power` 命名统一为 `"liaison"`**；**推进账本支持显式 `stepId`**（卡片/上下文未给出时如实缺席并记诊断，不伪造）。复审本批 **34/34**、全量 **2772/2753/16/3**（剩余 16 红全为既有环境/他角色在途）、typecheck **0 错**；未发现新的实现缺陷。
