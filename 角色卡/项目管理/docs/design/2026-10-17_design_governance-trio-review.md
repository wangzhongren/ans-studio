---
id: governance-trio-review
type: design
title: 治理三权分立（Rapporteur / Nominator / Convener）——项目管理评审与 V1 拆发
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: approved
revision: 1
related: [governance-trio, governance-pin-recovery, existing-project-compat, contract-workflow-dispatch, role-capability-install, shell-auto-approve, role-watchdog-and-closure]
events:
  - date: "2026-10-17"
    kind: reviewed
    summary: 批准三权分立方向；V1 最小闭环＝三个内置治理角色/rapporteur 主入口/能力矩阵/按角色边界与预授权/三道协议门禁/应用账本/新项目 trio 与旧项目 single 兼容；迁移单列 V1b，面板与自动推进列 V2；钉死跨角色契约并纠正提案与代码事实的 13 处偏差；列出八项必须客户拍板
---

# 治理三权分立（Rapporteur / Nominator / Convener）——项目管理评审与 V1 拆发

**审查对象**：产品提案 [2026-10-17_design_governance-trio.md](../../../产品/docs/design/2026-10-17_design_governance-trio.md)（status `proposed`，revision 1）。
**客户需求（逐字）**：「su 这个角色，我需要拆解成三个角色，Rapporteur 报告员 · 理解意图、沟通、形成方案（rapporteur）；Nominator 提名官 · 选择角色、组建团队（nominator）；Convener 召集人 · 安排流程、推动协作（convener）……关键还在于一条制度原则：Rapporteur 有提案权，Nominator 有提名权，Convener 有编排权，但没有任何一个角色自动拥有最终批准权。三个角色之间通过提案、评审、授权和反馈形成协作关系。」
**本轮性质**：跨角色评审与拆发，**不写代码**。本文是实施口径与派发计划，不是实施结果；代码、测试、`.ans`、UI 均未改动。

## 一、结论

**批准三权分立方向，但按本文的 V1 收窄与契约实施。** 提案的制度原则成立，代码落点也基本找对了；但提案把「三个内置角色」当成单内置角色的简单扩列，低估了四件事的改造面：**边界来源**（现在所有内置角色共用同一个项目治理边界文档）、**能力注入**（现在用 `suppressHandback` 一个布尔代表所有治理能力）、**回交/看护路由**（现在都指向 `primaryRoleId`，即 su）、**治理记录写入**（现在 su 的边界同时被当成应用写 `.ans` 的边界）。不先钉死这四件事，实施会退化成「三个人共用 su 的权限」或「finalize 被自己的门禁挡住」。

**V1 最小闭环（必须交付）**：

1. 三个**内置**治理角色 `rapporteur` / `nominator` / `convener`，`rapporteur` 为 `primaryRoleId`；旧 `su` 在 `single` 模型中保持原行为。
2. **按角色的 Section 1 与预授权**：三人不共享 `角色卡/ + docs/ + .ans/` 全量；拒绝文案指路。
3. **能力矩阵**：Convener 独享派发/看护/恢复提议；Nominator 独享技能/MCP 安装；三人都有客户确认通道；三人都不接 su 的 risky/deny shell 审批档。
4. **三道协议门禁**：提案接受门、任命写入门、派发范围门；拒绝文案指路，门禁只认应用签发的客户决定。
5. **应用独占审计账本**：`.ans/governance/ledger.jsonl`（append-only），记录「谁提的案、谁提的名、谁排的程、客户批了什么」。
6. **新项目默认 trio、旧项目默认 single 兼容**：旧项目行为逐字不变；左树显示非模态升级提示。
7. **最小 UI**：主入口 / 治理职能分组、权力副标题、等待客户决定状态行、迁移提示条；不做三个独立面板。

**V1b（紧随 V1）**：旧项目「su → trio」显式迁移（预览零写入 → 客户确认 → 写 `.ans` + manifest 留痕，不重写角色卡/边界/pin，不删历史）。**V2**：流程面板、自动推进、批量迁移、一键回滚、更细权限策略。若 V1b 未就绪，旧项目**保持 single 全功能**并在界面明示——这是明确降级，不是静默半成品。

**没有必须返工的方案级问题**；但有 **13 处代码事实偏差**（§二）和 **必须执行的实施修正**（§五），以及 **8 项必须客户拍板**（§十二）。

## 二、代码事实复核（只读；工作树含在飞修改）

| # | 提案说法 | 代码事实（2026-10-17 工作树） | 裁定 |
| --- | --- | --- | --- |
| 1 | 扩展 `openGovernanceSession` 即可让三人可选 | **桌面 su 聊天不走 `openGovernanceSession`**：`app/desktop/session.ts:1265-1315` 的 T30 裁决明确用 `openRoleSession` + `scope: undefined`；`openGovernanceSession` 只服务 CLI `ans govern`（`src/interface/cli/govern.ts:119`）。 | 桌面行为由 `app/desktop/session.ts::open()` 与 `run-role.ts` 决定；`openGovernanceSession` 只补 CLI 的 function 选择。**不得**把桌面改成走治理会话引擎（会改变 genesis/finalize 路径）。 |
| 2 | 三人各有边界，`resolveBoundarySection` 按角色返回条目 | 现状 `resolveBoundarySection`（`src/common/门禁引擎/boundary-core.ts:554-593`）对**任何**不在 `project.roles` 的角色都走第 2 步：返回**同一个** `gov.path` 治理边界文档（条目＋acceptance）。第 3 步创世种子只认 `BUILT_IN_GOVERNANCE_ROLE_ID === "su"`（:583-589）。 | 必须引入**内置治理角色注册表**与 `governanceModel`；trio 下三人边界由注册表条目合成，**不再**用 `gov.path` 的条目做写权；项目治理边界文档只保留为应用 pin 锚点/旧模型边界。 |
| 3 | 项目治理记录由应用维护，三人只读 | 现状 `finalizeBootstrap`/`repinIfBootstrapped` 用**当前会话的边界**去 gate `.ans`、manifest、治理边界文档（`src/common/编排/finalize.ts:194-258`；`src/pipeline/orchestration/run-role.ts` 的 `repinIfBootstrapped`）。su 的边界里含 `.ans/`，所以应用能写。 | trio 下若沿用「会话边界」，要么 finalize 被挡，要么某个角色获得 `.ans` 写权。必须新增**应用专用治理边界**（`appGovernanceBoundary`），只给应用写库用，三人的边界均禁写。 |
| 4 | `suppressHandback` 改成按 function 查能力矩阵 | `run-role.ts:553` 的 `suppressHandback` 同时决定：回交、派发（:586）、看护三能力（:592-594）、技能/MCP（:600-608）、su 预授权（:515）、shell 审批档（:619-628）。**一个布尔七个用途**。 | 保留 `suppressHandback` 表示「内置治理角色不自我回交」，其余六项改查 `role.governanceFunction` 的能力矩阵。**不得**用角色 id 字符串散落硬编码。 |
| 5 | 项目角色回交投 Convener、镜像 Rapporteur | 桌面回交、看护、批次、失败系统行全部用 `suRoleIdOf(projectRoot)`（`app/desktop/session.ts:1669-1674`），即 `listProject().primaryRoleId`；`WatchdogProjectSnapshot.suRoleId`（:2067）也用它。 | trio 下**运营主人**是 Convener（回交、看护、恢复提议、投递失败系统行），**客户镜像**是 Rapporteur（`primaryRoleId`）。必须区分 `handbackOwnerRoleId` 与 `primaryRoleId`，替换约 10 处调用；不能只改一处。 |
| 6 | 审计账本建议 `docs/audit/governance.jsonl` | `docs/audit/**` 在 PM 边界内且条件是 `shell-gate`（`角色卡/项目管理/boundary.yaml:50-54`）；再写一类文件需要新 condition/Governance 授权，且角色可读。 | V1 账本放 **`.ans/governance/ledger.jsonl`**（应用独占区，角色均禁写，无需改任何角色边界）；`docs/audit/governance.jsonl` 只作 V2 导出/只读视图。 |
| 7 | 三人均不写 `.ans`/治理边界/manifest | 现状 `.ans` 写入由 `gatedAtomicWrite` 经 `resolveWrite` 放行；`renderGovernanceBoundaryDoc()` 写出 `角色卡/ docs/ .ans/` 三普通目录（`finalize.ts:102-121`）。 | 保留「应用写」，但必须新增应用专用边界并把三人边界里的 `.ans/`、`角色卡/governance-boundary.yaml`、manifest 列为**禁写路径**（含拒绝文案）。 |
| 8 | `docs/workflow.md` 文件级预授权 | 预授权机制只支持**目录树**：`SU_PREAUTHORIZED_WRITE_DIRS`（`run-role.ts:1023`）+ `isUnderOrEqual`。单文件不在机制内。 | V1 **不新增文件级预授权**；Convener 首次写 `docs/workflow.md` 走一次 `request_confirmation`。降级如实写入角色卡。 |
| 9 | Convener 把「提名」步骤交给 Nominator | `dispatch_task` 目标校验明确拒绝 `builtIn === true`（`app/desktop/session.ts:1973-1978`）；三人都是内置。 | **治理角色之间不互相 dispatch**。Convener 把流程单标到「提名」步骤，应用在客户聊天流/左树给一个**客户点击的「打开 Nominator（提名步骤）」**入口；不新增角色间命令通道。 |
| 10 | 确认卡上显示 flowId、权力类型 | `CustomerInputRequest` 只有 `confirm`/`choice` 与自由文本（`src/model/runtime.ts:133-156`）；`CustomerInputMetadata` 无 flowId/stepId（:159-166）；工具 schema 也不收。 | 给 `request_confirmation`/`request_choice` 增加**可选** `flowId`/`stepId`（slug 校验），透传进 metadata 与账本；缺失时仍可用（旧调用零变化）。 |
| 11 | 三人均可被 `resolveRole` 解析 | `resolveRole` 只对 `roleId === "su"` 填 `BUILT_IN_ROLE_CARD_TEXT`（`src/service/role/resolve-role.ts:56-58`）；其余内置角色 `cardText` 为空。 | 注册表提供三张卡文本；`resolveRole` 对 trio id 返回 `kind:"built-in-governance"` + `governanceFunction` + 卡文本。 |
| 12 | `listProject` 返回三条内置，`primaryRoleId = rapporteur` | `listProject` 先把 su 塞进 `roles` 再扫目录（`resolve-role.ts:172-180`、:253），且**不读 `.ans`**；`primaryRoleId` 恒为 `SU`（:269）。 | 先扫项目角色算 `hasRoles`，再按 `governanceModel` 决定内置角色集与 `primaryRoleId`；模型来源由共享载入器新增 `readGovernanceModel` 提供（PM 属主），Service 只读调用。 |
| 13 | 旧 su 归档只读 | 现状没有归档内置角色的语义；`archived` 只对项目角色边界 YAML 生效（`resolve-role.ts:29-40`、`boundary-core.ts:569-571`）。 | trio 下 `listProject` **不返回 su**；`resolveRole("su")` 返回明确「已归档，当前为三权模型」；历史会话/历史记录仍可按 roleId 读取（不要求开会话）。**不建 `角色卡/su/`**。 |

**另两条在飞事实**（影响排期，不影响方案）：

- 「替我审」判断 agent 正在改 `src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts`、`src/service/runtime/session.ts`、`src/provider/*/session.ts`、`app/renderer/renderer.js` 等；三权实施**不得与它并行写同一文件**（§十一）。
- abort 修复正在改 `src/service/runtime/session.ts` 的隔离语义（`quarantined = underlying !== undefined && !underlyingFinished`）；三权**不触碰** aborter/隔离代码，实施前以该修复落地后的 HEAD 为基线。

## 三、V1 范围与分期

### 3.1 V1（最小可交付闭环，必须一次成立）

| 模块 | 做什么 | 不做什么 |
| --- | --- | --- |
| 门禁引擎 | 内置治理角色注册表；`GovernanceModel`/`GovernanceFunction` 类型；`listProject` 三内置/主入口/模型；`resolveRole` 三卡文本与 function；`resolveBoundarySection` 按模型与角色合成边界；应用专用治理边界；保留 id 冲突守卫 | 不把三人边界写进项目文件；不新增治理边界文档；不改 pin 算法 |
| 运行时核心 | `DispatchTaskPayload` 增可选 `flowId`/`stepId`；`request_confirmation`/`request_choice` 增可选 `flowId`/`stepId` 并透传 metadata；能力矩阵类型 | 不改 abort/超时/隔离；不改 judge 语义；不新增第二套工具 |
| 编排 | `openGovernanceSession` 支持 `governanceFunction`；`withGovernanceRole` 并入选中角色；按 function 的能力注入与预授权；禁写路径守卫；治理账本；三道门禁的纯判定函数；settle 后账本观测 | 不把治理角色做成 dispatch 目标；不自动推进流程；不自动批准 |
| 桌面窗口 | 三内置注入、按 function 路由；回交/看护改投 Convener、镜像 Rapporteur；`routeDispatch` 加流程门禁与 reserved 目标拒绝；安装/恢复的目标守卫改「任一内置」；迁移入口接线（V1b 单独一波）；客户决定队列（一项目一卡） | 不改 shell 三层链的项目角色语义；不把 judge 的 allow 当治理批准 |
| 桌面UI | 左树三组（主入口/治理职能/其他角色）；权力副标题；`primaryRoleId` CTA；等待客户决定状态行；旧模型迁移提示条；确认卡显示 flowId/权力类型 | 不做提案/提名/流程三个面板；不读 Markdown `status` 当权威 |
| 测试 | 按角色写权矩阵、三道门禁、路由、迁移、账本还原、UI e2e；全量三层 glob | 不跑真实模型/凭据；不以测试全绿代替客户真机 |

### 3.2 V1b（紧随 V1，可独立交付）

- 「su → trio」显式迁移：`previewGovernanceMigration`（零写入）→ 客户确认 → `migrateGovernanceModel` 写 `.ans` 的 `governanceModel:"trio"` + `docs/bootstrap-manifest.md` 追加一条升级留痕。
- 不重写角色卡/边界/契约/工作流/历史会话；pin 不变则不重算；旧 `docs/su/**` 保留只读。
- 迁移后 su 从 `listProject` 消失、不可开启；历史记录仍可读。
- **降级**：V1b 未交付时，旧项目保持 `single` 全功能，界面显示「旧治理模型（su）· 升级入口待本版后续」，不出现三权角色。

### 3.3 V2（不在本版承诺）

- 流程侧栏/面板（按 flowId 展示步骤、负责人、状态、待客户决定）；
- 自动推进（应用按流程单自动推进下一步，但仍不自动批准）；
- 批量迁移、CLI 迁移、一键回滚；
- 更细权限策略、跨项目治理、三人各自独立模型。

## 四、三权权限裁定（逐条回答提案 §十二 的 12 个开放问题）

1. **三人是否都是内置角色？→ 是，V1 固定三人内置，id 为 `rapporteur` / `nominator` / `convener`。** 理由与提案一致：空项目悖论、权限稳定性、与 su 现状同信任级。**补充裁定**：id 是**保留 id**；`角色卡/rapporteur/` 等目录一律不认（`listProject` 跳过并警告，`resolveRole` 按内置解析或明确报错，绝不把项目角色当治理角色）。三人的卡文本、边界、能力都来自注册表，不依赖项目文件。

2. **Rapporteur 是否唯一主入口？→ 是。** trio 下 `primaryRoleId = "rapporteur"`，左树主位、空态 CTA、默认选中都由它驱动；Nominator/Convener 可被客户直接打开，但默认不主推。直接打开不改变其权限约束。

3. **提名权是否包含写角色卡/边界？→ 提名本身不写；客户作出任命决定后，由 Nominator 按确认卡逐路径写入。** 钉死：
   - **谁写**：Nominator（只有它有 `角色卡/` 的边界条目和写入能力）。
   - **经什么确认卡**：先一张**任命卡**（`request_choice`，多选候选角色 id，记录 `targetRoleIds`），再一张**写盘确认卡**（`request_confirmation`，逐文件列出 `角色卡/<id>/role-card.md`、`boundary.yaml`、`memo.md` 等路径，`confirmed:true` 后才发行写入）。
   - **写边界归谁**：文件由 Nominator 写；**授权归客户**（任命决定 + 写盘确认两层）；**pin/收尾归应用**（`finalize.ts` 自动收尾）；Nominator 不得改自己的边界、不得改 `角色卡/governance-boundary.yaml`、不得创建第四个治理角色。
   - **不允许**「应用替 Nominator 写角色卡」：角色卡内容必须由 Nominator 在客户确认后写出；应用只做 gate/pin/manifest。

4. **Convener 是否能直接派发？→ 能，但仅限「已接受提案 + 已任命名单/快捷路径 + 流程步骤」。** 钉死：
   - 派发目标**只能是项目角色**；三个内置角色（含 Convener 自己）一律拒绝。
   - 派发文本必须引用已接受的提案/契约/流程单路径，不内嵌全文、不自算哈希（沿用 G-1）。
   - `dispatch_task` 只注入 Convener；Rapporteur/Nominator 不注册该工具。
   - 去重键在既有 `roleId\0task\0reason` 之外增 `flowId\0stepId`；同一 flow 步骤重复派发被拒/提示。
   - **治理角色之间不 dispatch**（见 §二-9）；Convener 通过流程单 + 客户点击的「打开 Nominator」入口完成提名步骤。

5. **旧 su 是否保留？→ 旧项目默认保留 su 全功能兼容模式；显式迁移后 su 归档只读、隐藏、不可开启、不删历史。** 不自动把 su 改成只读；不强制迁移；不建 `角色卡/su/`。是否长期双模型并存由客户定；V1 不提供一键回滚（迁移预览会列出可手工恢复的 `.ans` 字段与 manifest 记录）。

6. **是否三期分批？→ 是：V1 最小闭环、V1b 迁移、V2 面板/自动推进/批量。** 客户若要求「迁移也必须进 V1」，则把 V1b 并入 V1 的最后一波，但不得挤掉三道门禁与账本——门禁与账本是制度原则的载体，缺它们三权只是三个聊天角色。

7. **契约归属**：`docs/contracts/**` 归 **Rapporteur**（提案的冻结表达）；Nominator/Convener 只读。契约版本化，变更出新版本文件；不原地改。

8. **技能/MCP 归属**：`docs/skills/**`、`docs/mcp/**` 与安装/卸载能力归 **Nominator**；Convener 不接安装工具。安装仍是「仅客户明示、先落盘再激活」，安装不改变任何角色的写边界。

9. **Convener 的 shell 面**：**只读档**（`(c)=allow` 直接执行；`risky`/`review`/`deny` 一律拒绝，不出客户审批卡）。三人都不接 su 的 `shellOperatorOnly + approveDeny` 审批档；执行类 shell 留给项目角色三层链。理由：治理角色兼执行批准会把「治理决定」和「命令放行」混在一起，与客户「没有任何一个角色自动拥有最终批准权」的原则冲突。

10. **审计账本位置/保留期**：V1 用 **`.ans/governance/ledger.jsonl`**，append-only，不轮转，应用独占写入，三人只读（且三人边界禁写 `.ans`）。`docs/audit/governance.jsonl` 作为 V2 的只读导出/展示面；不与 `docs/audit/shell-gate.jsonl` 混用。理由见 §二-6。

11. **旧 `docs/su/**` 迁移后写权**：只读保留；三人可读、可引用，但**不预授权、不可写**。V1 不给任何治理角色 `docs/su` 预授权。

12. **迁移是否自动**：新空项目自动 trio；旧项目必须**客户显式迁移**（预览 → 确认）。V1 不提供自动迁移、CLI 批量迁移。迁移失败如实报 `phase`，不承诺零副作用。

**补充裁定（提案未列，但必须钉死）**：

13. **边界来源**：trio 下三人的 Section 1 = 注册表条目 + 项目治理记录里的 acceptance；**不读** `角色卡/governance-boundary.yaml` 的条目。该文档在 trio 下仅作 pin 锚点与旧模型边界，UI/角色卡如实说明。内置边界是应用代码，pin 不覆盖代码——与 su 的内置边界同信任级，不新增风险，但必须写明。
14. **治理记录写入**：应用专用边界 `appGovernanceBoundary` 只用于写 `.ans/**`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md`；不注入任何角色会话。三人边界把这些路径列为禁写。
15. **`docs/workflow.md`**：V1 不做文件级预授权；Convener 首次写走一次确认卡。若客户认为太繁，V1b 再加通用 `preauthorizedFiles` 机制。
16. **决策卡串行**：同一项目同一时刻只允许一张待客户决定卡；后续请求排队并在界面显示「等待前一个决定」。这是应用行为，不是角色自律。
17. **快捷路径**：提案接受卡提供「接受并直接执行（复用现有角色）」选项；仅在**不新建/不改角色边界**时允许跳过提名文件；若涉及新角色/边界，仍必须任命卡 + 写盘确认卡。快捷路径的决定仍记在客户名下。
18. **分歧上呈**：同一问题第二次退回 → 自动 `escalated-to-customer`，三人停止互相转交；提案最多 `v2`；flow 连续 24h 无状态变化 → Convener 只报 `paused/blocked`，不自动催办、不自动换人。
19. **三人是否共享上下文？→ 不共享模型上下文。** 三人各自独立会话、独立上下文；交接物是项目文件（提案/契约/提名/流程）与带路径的投递消息；会话重建后通过重读文件恢复；V1 不自动让三人互相聊天，应用按流程单一次只推进一步，客户可见每一步。三者共用同一 runtime 选择与同一项目配置，不要求每角色不同模型。
20. **三人与现有项目角色的地址/权限关系**：三人是内置角色，无 `角色卡/` 目录、不进 `roles` 映射、不是 `dispatch_task` 目标；项目角色保留自己的角色卡/边界/写权，按各自边界工作。Nominator 只能在客户任命后写项目角色的角色卡/边界；Convener 只能派发已任命/快捷路径内的项目角色；Rapporteur 不直接指挥项目角色。项目角色回交只给证据，不转移身份/写权。

## 五、跨角色契约（钉死）

### 5.1 Model 类型（`src/model/role.ts`，门禁引擎主属）

```ts
export type GovernanceModel = "single" | "trio";
export type GovernanceFunction = "proposal" | "nomination" | "schedule";

export interface ResolvedRole {
  // ...既有字段
  governanceFunction?: GovernanceFunction; // 仅内置治理角色（trio）
}

export interface ProjectConfig {
  // ...既有字段
  governanceModel?: GovernanceModel; // 缺省 "single"（旧行为逐字不变）
}
```

- `ProjectListing`（`src/service/role/resolve-role.ts`）增 `governanceModel: GovernanceModel`。
- `ProjectRoleSummary` 增 `governanceFunction?: GovernanceFunction`；桌面 `RoleView` 原样透传。
- `GovernanceModel` 的默认值是 `"single"`：**任何未显式声明 trio 的调用方行为逐字不变**，这是全量回归的基线保证。

### 5.2 内置治理角色注册表（`src/common/门禁引擎/governance-roles.ts`，门禁引擎私有 common）

```ts
export interface GovernanceCapabilities {
  customerInput: true;              // 三人都有
  dispatchTask: boolean;            // 仅 convener
  roleStatus: boolean;              // 仅 convener
  sessionTail: boolean;             // 仅 convener
  proposeRecovery: boolean;         // 仅 convener
  installSkill: boolean;            // 仅 nominator
  installMcp: boolean;              // 仅 nominator
  shell: "none" | "readonly" | "operator-approve"; // convener=readonly；su=operator-approve；其余 none
}

export interface BuiltInGovernanceRoleSpec {
  id: "rapporteur" | "nominator" | "convener";
  displayName: string;              // 「报告员 Rapporteur」等
  function: GovernanceFunction;
  cardText: string;
  entries: BoundaryEntry[];         // 该角色的 Section 1
  preauthorizedDirs: readonly string[];
  forbiddenWritePaths: readonly string[];
  capabilities: GovernanceCapabilities;
}

export const BUILT_IN_GOVERNANCE_ROLES: readonly BuiltInGovernanceRoleSpec[];
export const LEGACY_GOVERNANCE_ROLE_ID = "su";
/** su 在 single 模型下的既有四棵预授权目录与能力集（逐字保留旧行为）。 */
export const LEGACY_SU_PREAUTHORIZED_DIRS: readonly string[];
export const LEGACY_SU_CAPABILITIES: GovernanceCapabilities;
export function governanceRoleOf(id: string): BuiltInGovernanceRoleSpec | undefined;
export function governanceFunctionOf(id: string): GovernanceFunction | undefined;
export function governanceCapabilitiesOf(id: string): GovernanceCapabilities | undefined;
export function isBuiltInGovernanceRoleId(id: string): boolean;
export function appGovernanceEntries(): BoundaryEntry[];
export function appGovernanceBoundary(acceptance: Acceptance): BoundarySection1;
```

**注册表条目（V1，逐项钉死）**：

| 角色 | 边界条目（root project） | 预授权目录 | 禁写路径 |
| --- | --- | --- | --- |
| rapporteur | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | 同左三棵 | `.ans/**`、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、`角色卡/<内置治理角色 id>/**`、`docs/nominations/**`、`docs/flows/**` |
| nominator | `角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | `docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/`（**不含** `角色卡/`） | `.ans/**`、manifest、`角色卡/governance-boundary.yaml`、`角色卡/<内置治理角色 id>/**`、`docs/proposals/**`、`docs/flows/**` |
| convener | `docs/flows/`、`docs/workflow.md`、`docs/governance/convener/` | `docs/flows/`、`docs/governance/convener/`（**不含** `docs/workflow.md`） | `.ans/**`、manifest、`角色卡/**`、`docs/proposals/**`、`docs/nominations/**`、`docs/skills/**`、`docs/mcp/**` |

- **卡文本最低内容**：每个 spec 的 `cardText` 必须写清：本角色职能与权力（提案/提名/编排）、**不拥有最终批准权**、可写目录与禁写路径、`cardKind`/选项 id 约定、`.ans`/治理边界/manifest 只能由应用写、不得创建第四个治理角色、不得改其他治理角色的资料。`su` 的旧卡文本保留为 `LEGACY_SU_CARD_TEXT`（single 模型逐字不变）。
- **预授权 ≠ 放行**：仍走 F4/F6/F7/条件激活；预授权只是初始 writeSet 的一部分。
- `forbiddenWritePaths` 在 `run-role.ts` 的 gate 包装里**先于** `resolveWrite` 判定，拒绝文案指路（例如「该路径属应用治理记录，任何角色不可写」）。
- `角色卡/governance-boundary.yaml` 是 `角色卡/` 内的例外，必须显式禁写，不能只靠条目排除。
- 表中的 `角色卡/<内置治理角色 id>/**` 在实现里展开为**具体前缀**：`角色卡/rapporteur/`、`角色卡/nominator/`、`角色卡/convener/`、`角色卡/su/`（`su` 在 trio 下也不可被创建）；不要实现 glob，按段比较。
- 表中的 `manifest` 均指 `docs/bootstrap-manifest.md`；`.ans/**` 是应用治理记录区，三人均禁写。

### 5.3 边界解析与治理模型（门禁引擎）

`resolveBoundarySection(roleId, project)` 的 V1 判定顺序：

1. `model = project.governanceModel ?? "single"`。
2. `model === "single"`：
   - `roleId === "su"` → **既有四条分支逐字不变**（项目覆盖 → 治理边界覆盖 → 创世 → 内置未接受）。
   - `roleId` 是 trio id → 返回未接受 + `parseError: "三权角色在 single 治理模型下不可用"`（结构性拒绝，不开放）。
3. `model === "trio"`：
   - `roleId === "su"` → 返回未接受 + `parseError: "su 已归档（当前为三权治理模型），不可写入/开启"`。
   - `roleId` 是 trio id：
     - `spec = governanceRoleOf(roleId)`；
     - 若 `project.governanceBoundary?.path` **非空**且 `acceptance.accepted === true` → `{ entries: spec.entries, boundarySource: "<built-in:trio/"+roleId+">", acceptance: gov.acceptance }`；
     - 若 `governanceBoundary?.path` 为空且 `project.genesisBootstrap` 存在 → `{ entries: spec.entries, boundarySource: "<built-in:trio/"+roleId+">", acceptance: { accepted: true, source: genesis.source } }`；
     - 否则 → `{ entries: spec.entries, boundarySource: ..., acceptance: { accepted: false, source: "" } }`（fail-closed，F6 拒一切写）。
   - **绝不**读取 `project.governanceBoundary.path` 的条目作为 trio 角色的写权来源。
   - **不得**把桌面运行期同意（`DESKTOP_RUNTIME_CONSENT`，`path` 为空时的 fallback acceptance）当成 trio 的项目接受证据；trio 的接受必须有 `.ans` 治理记录（`path` 非空）或本次显式 genesis。
4. 其他角色（项目角色）→ 既有逻辑不变。

`appGovernanceBoundary(acceptance)`：条目固定为 `角色卡/governance-boundary.yaml`（file）、`.ans/`（directory）、`docs/bootstrap-manifest.md`（file）；只由编排/应用在 `finalizeBootstrap`、`repinIfBootstrapped`、`previewGovernanceMigration`、`migrateGovernanceModel` 中使用。**不注入任何角色会话**。

**调用口径（钉死）**：
- `run-role.ts` 的 `repinIfBootstrapped` 调用处：`model === "trio"` → 传 `appGovernanceBoundary(setup.role.boundary.acceptance)` 且 `governanceModel:"trio"`；`single`/su → 传 `setup.role.boundary`（逐字不变），`governanceModel` 可省略（缺省即 single）。
- trio 下三个内置角色都会在 settle 后触发 repin；编排必须按 `projectRoot` 串行（进程内 promise 链），避免 `.ans`/manifest 并发写入交错。`single` 下保持现状（只有 su）。
- 迁移/建立/重接受仍走 `finalize.ts` 既有入口，不新增第二套写库。

### 5.4 `listProject` 与排序（门禁引擎）

- 签名不变；新增 `ProjectListing.governanceModel`。
- 实现顺序改为：
  1. 扫项目角色目录，得到 `projectRoles` 与 `hasRoles`；
  2. 读模型：`readGovernanceModel(projectRoot)`（见 5.5）；无显式值时：无 `.ans` + 无项目角色 → `trio`（新空项目）；其余（无 `.ans` + 有项目角色）→ `single`（旧项目，保持兼容）；
  3. 按模型前置内置角色：single → `su`；trio → `rapporteur`、`nominator`、`convener`（此顺序）；
  4. `primaryRoleId`：single → `"su"`；trio → `"rapporteur"`；
  5. 项目角色按 `roleId.localeCompare` 排序，保留既有 `group`/`groupDuty`。
- **不自动按产物目录猜模型**：若项目有 `docs/proposals|nominations|flows` 但无 `.ans`，`listProject` 仍按 `single`（不静默切换）；桌面在 S1「建立治理记录」预览中提示「检测到三权产物，建议选择 trio」，由客户在建立卡上**显式选择**模型。选择结果写进 `.ans`，这是客户决定，不是自动推断。
- 保留 id 冲突：扫到 `su`/`rapporteur`/`nominator`/`convener` 目录时，`warnings.push("...：与内置治理角色 id 冲突，已跳过")`，不枚举；`resolveRole` 对保留 id 忽略 `project.roles` 映射（防项目角色遮蔽治理角色）。
- 旧项目无 `.ans` 且有项目角色 → `single` + `governanceModel`，不报警（避免噪声）；UI 据此显示升级提示。
- `.ans` 存在但不可解析 → `single`（行为不变），治理记录状态仍由桌面 `governanceRecord` 标 `invalid`。
- **配置传播**：`app/desktop/project.ts::buildProjectConfig` 必须写 `governanceModel: listing.governanceModel`；`buildEffectiveProjectConfig` 必须把载入器的 `project.governanceModel`（若有）带进会话 `ProjectConfig`，缺失才回退 `listing.governanceModel`。否则 `resolveBoundarySection` 会按默认 `single` 解析，三权角色全部不可写。
- **CLI 同步**：`src/index.ts` 的 `ans govern <dir>` 配置注入同样调用 `readGovernanceModel`；无 `.ans` 且无项目角色 → `trio`，否则 `single`。新增 `--function proposal|nomination|schedule`（trio 下选择会话角色；single 下拒绝并提示旧模型）。`ans role run` 不受影响（只服务项目角色）。
- **会话角色解析出口**（Service 公共，`src/service/role/resolve-role.ts`）：

```ts
export interface ResolvedGovernanceRole {
  roleId: string;
  function: GovernanceFunction | null; // single/su 为 null
  model: GovernanceModel;
}
export function resolveGovernanceRole(
  listing: ProjectListing,
  opts?: { function?: GovernanceFunction; roleId?: string },
): ResolvedGovernanceRole; // 非法组合抛错（明确文案）
```

  `openGovernanceSession`、CLI `ans govern --function` 与测试共用本函数；不得各自枚举 `builtIn`。

### 5.5 `.ans` 兼容与迁移标记（PM 属主共享组件 + 编排）

- `.ans/project.json` 只新增一个**可选**字段：`governanceModel: "single" | "trio"`。**不新增** `governanceRoles` 映射：三人 id 是应用常量，写进 `.ans` 只会制造第二份真相。
- `src/common/shared/config-loader.ts`（PM 属主，只读导入）新增：

```ts
export type GovernanceModelRead =
  | { state: "explicit"; model: "single" | "trio" }
  | { state: "absent" }
  | { state: "unreadable"; reason: string };

export function readGovernanceModel(projectRoot: string, ansDirName?: string): Promise<GovernanceModelRead>;
```

  - 只读 `.ans/project.json` 的 `governanceModel`；缺失/非法 → `{state:"absent"}`（不猜测）；文件不可读/不可解析 → `unreadable`（调用方按 `single` 处理，并保留既有 `governanceRecord.invalid`）。
  - 不复用 `loadEffectiveConfig` 的 fallback 语义，避免把运行期同意带进模型判定。
- `loadEffectiveConfig` 的 `buildFromAns` 同时把 `governanceModel` 填进 `ProjectConfig`；缺失不填（默认 `single`）。
- 迁移写入：`migrateGovernanceModel` 只改 `.ans` 的 `governanceModel`，保留 `projectRoot`/`skillRoot`/`roles`/`governanceBoundary`/`pins` 等未知字段；先在内存构造完整对象再原子写，不删未知字段。
- **首次收尾写入模型**：`FinalizeInput` 增可选 `governanceModel?: GovernanceModel`；`finalizeBootstrap` 组装 `.ans` 时仅当给出才写该字段（trio 新项目传 `"trio"`；single/su 不传，保持旧 `.ans` 形状）。`repinIfBootstrapped` 在创世态由调用方传入当前模型。
- **S1 建立也带模型**：`GovernanceRecordInput` 增可选 `governanceModel?: GovernanceModel`；桌面按 `listing.governanceModel`（即 5.4 的检测结果）传入，`previewGovernanceRecord` 的预览必须显示「将写入的治理模型」，`establishGovernanceRecord` 把它交给 `finalizeBootstrap`。这样「trio 创世中途丢失 `.ans`、但已有项目角色」的项目可以按 `trio` 重建记录，而不是被降级成 single；旧项目 S1 仍传 `single`（或不传，保持旧行为）。
- 迁移留痕：`docs/bootstrap-manifest.md` 追加一条「治理模型升级（su → trio）」：时间、旧/新模型、变更文件、`.ans` 新旧哈希（若可算）、客户确认证据。
- **回滚**：V1 不提供按钮；迁移预览给出迁移前 `.ans` 的字段快照与 manifest 记录，客户可手工恢复。一键回滚列 V2。
- **桌面窗口契约（V1b）**：
  - `ListProjectResult` 增 `governanceModel: GovernanceModel`；`RoleView` 增 `governanceFunction?: GovernanceFunction`（内置角色才有）。
  - IPC：`project:governance-migrate-preview` / `project:governance-migrate`（`app/main.ts` 注册）。
  - preload/Interface：`previewGovernanceMigration({projectRoot})` / `migrateGovernanceModel({projectRoot, confirm:true, previewDigest})`。
  - 结果形状：`GovernanceMigrationPreviewResult = {ok:true, preview:{model, targetModel, writePaths, modelField, manifestLine, pinChanges, retainedFiles, snapshotDigest}} | {ok:false, code, message}`；`GovernanceMigrationResult = {ok, phase:"guard"|"write", status:"completed"|"already-trio"|"no-record"|"blocked"|"write-failed"|"preview-stale"|"busy"|"invalid-request", model, message}`。
  - 成功后：清 listing 缓存 → `refreshStaleBoundaries()` → `emitProjectChanged(projectRoot)`；不自动开会话。

### 5.6 会话与能力矩阵

**`openGovernanceSession`**（`src/pipeline/orchestration/govern-session.ts`）：

- `GovernSessionInput` 增可选 `governanceFunction?: GovernanceFunction`。
- 解析顺序：`governanceRoleId`（显式）→ `governanceFunction` 对应 id → 默认 `rapporteur`（trio）/ `su`（single）。
- 校验：trio 下 `governanceRoleId` 必须是三人之一；single 下必须是 `su`；否则抛错（明确文案）。
- `withGovernanceRole` 只把**选中**的 id 并入 `builtInRoles`；不把三人全部塞进去（避免 CLI 意外开放其他两个）。
- CLI `ans govern` 增 `--function proposal|nomination|schedule`（trio 下选择会话角色；缺省 `proposal`）。single 下传 `--function` → 明确拒绝并提示「旧治理模型只有 su」。`--role` 仍保留：trio 下必须是三人之一，single 下必须是 `su`。
- `discoverGovernanceRoleId` 改为调用 Service 的 `resolveGovernanceRole(listing, { function })`；CI/测试保留旧枚举行为作为 fallback。
- 默认提示词按 function 追加一段：proposal/nomination/schedule 各自的输出目录与「不批准、不任命、不越界」纪律；文案不写「已授权/已批准」。
- **文案数据驱动**：`runGovernSession`/`openGovernanceSession`/桌面/诊断里写死「su」的提示词、状态行、错误文案，逐一改为读取角色显示名或 `governanceFunction`；不得让 Rapporteur 会话自称 su。

**能力注入矩阵**（`run-role.ts` + `app/desktop/session.ts` 同源；唯一数据来源 = 注册表 `capabilities`）：

| 能力 | rapporteur | nominator | convener | su（single） |
| --- | --- | --- | --- | --- |
| `customerInput`（确认制） | 是 | 是 | 是 | 是 |
| `dispatchTask` | 否 | 否 | **是** | 是（旧行为） |
| `roleStatus` / `sessionTail` | 否 | 否 | **是** | 是 |
| `proposeRecovery` | 否 | 否 | **是** | 是 |
| `installSkill` / `installMcp` | 否 | **是** | 否 | 是 |
| `shellOperatorOnly`（risky/deny 审批） | 否 | 否 | 否 | 是（旧行为） |
| `shellReadonly` | 否 | 否 | **是** | 否（旧行为用审批档） |
| `reportHandback` | 否（不自我回交） | 否 | 否 | 否 |
| 预授权目录 | 5.2 表 | 5.2 表 | 5.2 表 | 既有四棵 `docs/su`/`contracts`/`skills`/`mcp` |
| 禁写路径 | 5.2 表 | 5.2 表 | 5.2 表 | 保持现状（应用写 `.ans`） |

- `run-role.ts` 保留 `suppressHandback = role.kind === "built-in-governance"` 仅用于「不自我回交/不注入 `reportHandback`」；其余能力改：
  - `const cap = governanceCapabilitiesOf(setup.role.id) ?? LEGACY_SU_CAPABILITIES;`
  - 派发/看护/安装按 `cap.*` 注入；`governanceCapabilitiesOf("su")` 返回 `LEGACY_SU_CAPABILITIES`（单点，不在 `run-role` 另写一份）。
- `suPreauthorized` 改为 `builtInPreauthorized(role)`：trio 按注册表 `preauthorizedDirs`；single/su 用既有四棵。函数名改为 `scopeWithBuiltInPreauthorization`，保留 `scopeWithSuPreauthorization` 作为 su 分支的内部实现或直接删除并更新注释。
- `forbiddenWritePaths` 包装 gate：在 `resolveWrite` 之前判；命中即拒绝，原因含「该路径属应用治理记录/其他治理角色，任何角色不可写」。

**桌面端**（`app/desktop/session.ts::open()`）：

- `customerInput`：`role.builtIn === true`（三人与 su）。
- `dispatchTask`：`role.governanceFunction === "schedule"`。
- `roleStatus`/`sessionTail`/`proposeRecovery`：`=== "schedule"`。
- `installSkill`/`uninstallSkill`/`installMcp`/`uninstallMcp`：`=== "nomination"`。
- `shellOperatorOnly`：仅 `model === "single" && role.builtIn === true`（su 旧审批档）；trio 下**不传**。
- `shellReadonly`：trio 下 `role.governanceFunction === "schedule"` 时从同一 `deps.shellArming` 构造 `{ classifyShell, rules }`（不带 operator channel）；single 下不传（su 用审批档）。
- `shellArming`（项目角色三层链）：`role.builtIn !== true`，逐字不变。
- `routeDispatch`：目标 `builtIn === true` 拒绝（三人均拒绝）；新增流程门禁（§6.2）；来源角色必须是 Convener（注入已保证，再做防御性校验）。
- `applySkillChange`/`applyMcpChange` 的「不能是 su 自身」改为 `isBuiltInGovernanceRoleId(targetRoleId)`。
- `proposeRecovery` 的目标守卫同样改为「任一内置」。
- `lastSuRuntime` 改名 `lastGovernanceRuntime`：键仍是 projectRoot，值取 **回交主人**（trio=Convener）会话的 runtime；看护投递用它。
- `handbackOwnerRoleId(projectRoot)`：trio 从 listing 找 `governanceFunction === "schedule"` 的角色 id；single 用 `primaryRoleId`。回交、看护、恢复回执、投递失败系统行全部改用它；`primaryRoleId` 只用于主入口/镜像。
- `watchdogSnapshot.suRoleId` → `governanceRoleId`（同义替换，值=回交主人）；`app/desktop/watchdog.ts` 的消费方同步。
- `routeDispatch` 成功入队后写账本 `dispatch.accepted`（5.7）；失败不写。

### 5.7 审计账本（编排私有 common + Pipeline 薄再导出）

**文件**：`src/common/编排/governance-ledger.ts`；经 `src/pipeline/orchestration/govern-session.ts` 薄再导出给桌面窗口（桌面不直接导入编排私有 common）。

**存储**：`<projectRoot>/.ans/governance/ledger.jsonl`，append-only，UTF-8，一行一条 JSON。

**类型**：

```ts
export type GovernancePower = "proposal" | "nomination" | "schedule" | "acceptance" | "app" | "customer";

/** 客户决定的细分类型（门禁按它判定，不靠自然语言）。 */
export type GovernanceDecisionKind =
  | "proposal-accept"
  | "proposal-accept-quick"
  | "proposal-revise"
  | "proposal-reject"
  | "appointment"
  | "appointment-write"
  | "schedule-write"
  | "acceptance"
  | "migration"
  | "unclassified"; // 缺 cardKind 或选项 id 非标准：门禁一律拒绝，提示重发

export interface GovernanceLedgerEntry {
  at: string;                         // ISO
  kind:
    | "customer.decision"
    | "dispatch.accepted"
    | "artifact.observed"
    | "governance.established"
    | "governance.reaccepted"
    | "governance.migrated";
  flowId?: string;
  stepId?: string;
  /** 本事件的动作人（角色 id，或 "app"/"customer"）。 */
  actorRoleId: string;
  power: GovernancePower;
  /** 仅 customer.decision：决定类型（门禁判定用）。 */
  decisionKind?: GovernanceDecisionKind;
  artifactPath?: string;              // 项目相对路径
  artifactVersion?: number;
  artifactSha256?: string;            // 应用算，角色不自算
  /** 仅写盘确认：本次客户确认/发行的具体路径（逐条）。 */
  paths?: string[];
  targetRoleId?: string;
  targetRoleIds?: string[];
  customerDecision?: "accepted" | "accepted-quick" | "appointed" | "rejected" | "changes-requested" | "none";
  decisionEvidence?: {
    kind: "customer-input" | "desktop-governance-record" | "customer-message";
    toolCallId?: string;
    turnId?: string;
    sessionId?: string;
    action?: "establish" | "reaccept" | "migrate";
    previewDigest?: string;
  };
  messageSummary?: string;
  runtime?: RuntimeKind;
  sessionId?: string;
}
```

**API**：

```ts
export async function appendGovernanceLedger(
  projectRoot: string,
  entry: GovernanceLedgerEntry,
): Promise<{ ok: true } | { ok: false; message: string }>;

export async function readGovernanceLedger(
  projectRoot: string,
): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }>;

/** 只读快照（同步门禁消费；由会话在 open/send 时异步刷新）。 */
export interface GovernanceLedgerSnapshot {
  entries: readonly GovernanceLedgerEntry[];
  errors: readonly string[];
}
```

- 进程内按 `projectRoot` 串行（promise 链）；`mkdir -p .ans/governance`；`appendFile` 后 `fsync`（失败不回滚、不抛给角色）；失败只记诊断，并如实回 `{ok:false}`。
- **角色不可写账本**：`.ans/**` 在所有内置角色 `forbiddenWritePaths` 内；角色也没有 `write_file` 到 `.ans` 的边界条目。
- **权威性**：门禁只读账本，不读 Markdown `status`。UI 的「谁提的/谁提的名/谁排的程/客户批了什么」读账本。
- **写门禁的同步性**：`resolveWrite` 是同步的，账本读取是异步的。故会话在 `open()` 与每次 `send()` 开始时把账本读成只读快照；`customerInput` 包装器在客户作出决定后**同步更新内存快照并异步追加落盘**；同步 `WriteGate` 只读快照。跨会话的新决定（例如 Rapporteur 接受了提案后 Convener 会话已在开着）由下一次 `send()` 刷新快照——这是 V1 的明确时序边界，写入前若快照未含决定则拒，绝不猜。

**写入点（V1）**：

| 事件 | 写入者 | 触发点 |
| --- | --- | --- |
| `customer.decision` | 编排 | `run-role.ts` 的 `customerInput` 包装器：`raw(req, metadata)` 返回后，按 `cardKind` + 选项 id 写 `decisionKind`，按 `outcome` 写 `customerDecision`；`power` 由 function 映射（proposal/nomination/schedule/acceptance）；`decisionEvidence` 带 `toolCallId/turnId/sessionId`；`artifactSha256` 由应用对最新版本文件计算；写盘确认另记 `paths` |
| `dispatch.accepted` | 桌面窗口 | `routeDispatch` 入队成功后；`decisionEvidence` 不需要（派发不是客户决定），`messageSummary` 截断 ≤200 字 |
| `artifact.observed` | 编排 | 内置角色每轮 settle 后，扫其 `preauthorizedDirs` 下的 `.md`，与上一轮快照比较，新增/变更才写；`artifactSha256` 应用算 |
| `governance.established` / `governance.reaccepted` / `governance.migrated` | 编排 | `finalize.ts` 的 establish/reaccept/migrate 成功后；`decisionEvidence.action` 与 `previewDigest` 必填（如有） |

- `artifact.observed` 的扫描范围**仅**角色的预授权目录（不扫 `角色卡/` 全树；Nominator 写出的角色卡由 `customer.decision` 的任命/写盘确认覆盖，V2 再补 `appointment.written`）。
- 账本不记 shell 审批；shell 审批继续落 `docs/audit/shell-gate.jsonl`，两者不混用，也不互相替代。

### 5.8 确认工具参数（运行时核心）

`request_confirmation` / `request_choice` 的 input schema 增**可选**：

- `flowId`：`^[a-z0-9][a-z0-9-]{1,63}$`；缺失允许（旧调用零变化）。
- `stepId`：同 pattern；缺失允许。
- `cardKind`：`request_choice` 取 `proposal` / `appointment` / `acceptance`；`request_confirmation` 取 `write` / `appointment-write` / `schedule-write`。缺失允许（旧调用零变化，但**不能**解锁任何治理门禁）。

`tools.ts` 的 `customerMetadata` 把三者并入 `CustomerInputMetadata`；`CustomerInputRequest` 增同名可选字段供桌面卡片显示。非法格式 → 工具返回 `ok:false` 并说明，不猜测、不截断。

**按角色的 `cardKind` 白名单**（编排的 `customerInput` 包装器在执行前校验；越权即返回 `ok:false`，不弹卡）：

| 角色 | 允许的 `cardKind` | 账本映射 |
| --- | --- | --- |
| rapporteur | `proposal`、`acceptance`、`write` | `proposal` + 选项 id `accept`/`accept-quick`/`revise`/`reject` → `proposal-accept`/`proposal-accept-quick`/`proposal-revise`/`proposal-reject`；`acceptance` + `accept`/`reject` → `decisionKind:"acceptance"`；`write` → 普通写盘确认（不解锁门禁） |
| nominator | `appointment`、`appointment-write`、`write` | `appointment` + 选中 id 列表 → `decisionKind:"appointment"`、`targetRoleIds`；`appointment-write` → `decisionKind:"appointment-write"`、`paths`（来自 confirmed-writes 发行器）；`write` → 普通写盘 |
| convener | `schedule-write`、`write` | `schedule-write` → `decisionKind:"schedule-write"`；`write` → 普通写盘 |
| su（single） | 任意（旧行为） | 仍写账本 `power:"app"/"customer"` 可省略；不参与 trio 门禁 |

- **选项 id 约定**：Rapporteur 的提案卡必须使用固定 id `accept` / `accept-quick` / `revise` / `reject`；Nominator 的任命卡选项 id 必须是候选角色 id（多选）；验收卡必须使用 `accept` / `reject`。非标准 id → 账本记 `decisionKind:"unclassified"`，门禁拒绝并提示重发。
- 角色不能伪造客户答案：账本记录的是 `CustomerInputOutcome`（answered/declined/unavailable）与 `operatorId`，不是角色自述；`cardKind` 只决定分类，不能把未答的卡写成已答。
- `dispatch_task` 的 input schema 增同名可选 `flowId`/`stepId`；`DispatchTaskPayload` 增同名可选字段。缺失时 `routeDispatch` 按旧行为（允许，但不享受 `flowId+stepId` 去重与门禁的「已接受范围」校验——**V1 对 Convener 调用要求必填**，模型不填则工具返回明确错误；旧 su 调用不受影响）。

### 5.9 文件归属速查（不构成写入授权）

| 属主 | 本项涉及的文件/目录 |
| --- | --- |
| 门禁引擎 | `src/model/role.ts`（类型主属）、`src/common/门禁引擎/governance-roles.ts`（新）、`boundary-core.ts`、`governance-seed.ts`（如需）、`src/service/role/resolve-role.ts`、`src/service/boundary/resolve-boundary.ts`（再导出）、`test/门禁引擎/` |
| 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/` |
| 编排 | `src/pipeline/orchestration/govern-session.ts`、`run-role.ts`、`src/common/编排/finalize.ts`、`governance-ledger.ts`（新）、`governance-gate.ts`（新）、`handback.ts`（如需）、`test/编排/` |
| 桌面窗口 | `app/desktop/session.ts`、`interface.ts`、`project.ts`、`watchdog.ts`、`customer-input.ts`、`confirm-card.ts`、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/`（既有文件） |
| 桌面UI | `app/renderer/renderer.js`、`app/renderer/styles.css`、`app/renderer/index.html`（仅在确需时）、既有渲染测试 |
| 项目管理 | `src/common/shared/config-loader.ts`（`readGovernanceModel`）、`test/项目管理/shared/`、本评审与备忘 |
| 测试 | `test/测试/`（独立验证夹具与端到端） |

- 这张表只是**归属指引**；真正的写入白名单仍是各角色 `boundary.yaml` 的 Section 1。任何跨角色新增文件先由 Governance 更新边界并经客户确认。

## 六、协作协议与三道门禁

### 6.1 一次需求的闭环（V1）

```
客户 → Rapporteur（主入口）
  ├─ 写 docs/proposals/<flowId>-v1.md（frontmatter: flowId/version/author/status: draft）
  ├─ request_choice（cardKind=proposal，flowId，选项：accept / accept-quick / revise / reject）
  └─ 客户决定① → 账本 customer.decision（power=proposal）
        ↓
  Convener 写 docs/flows/<flowId>.md（步骤表；首步标「提名」）
  ├─ 界面给「打开 Nominator（提名步骤）」客户点击入口（不是 dispatch）
  └─ 若客户选 accept-quick 且复用现有角色 → 可跳过提名文件，直接建步骤
        ↓
  Nominator 写 docs/nominations/<flowId>-v1.md
  ├─ request_choice（cardKind=appointment，flowId，multiple:true，候选角色 id）→ 客户决定②：任命
  └─ request_confirmation（cardKind=appointment-write，flowId，逐文件列角色卡/边界路径）→ 客户决定③：写盘
        ↓（Nominator 写角色卡/边界；应用自动 finalize/pin）
  Convener dispatch_task（flowId+stepId，目标=已任命项目角色）
        ↓
  项目角色执行 → 回交 Convener（镜像 Rapporteur）
        ↓
  Convener 更新流程单（done/blocked/下一步）
        ↓
  Rapporteur 汇总证据 → request_choice（cardKind=acceptance，flowId，accept/reject）→ 客户决定④：验收
        ↓
  流程关闭；或按反馈开 v2（提案最多 v2）
```

**硬约束**：

- 没有客户决定①，Convener 不能写 flow（门禁按账本拒绝）；没有决定②，Nominator 不能写任何 `角色卡/**`；没有已接受提案 + 已任命名单/快捷路径 + 流程步骤，`dispatch_task` 拒投。
- 同一 flow 同一时刻只允许一个待客户决定；第二张卡排队。
- 角色之间不互相批准；`status: accepted` 写在 Markdown 里不改变任何门禁。
- 治理角色之间不 `dispatch`；提名步骤由客户点击打开。
- 客户可以随时直接打开三人；直接对话不改变权力边界。

### 6.2 三道门禁（应用侧纯判定，编排私有 common `governance-gate.ts`）

```ts
export interface GovernanceGateInput {
  projectRoot: string;
  model: GovernanceModel;
  roleId: string;
  action: "write-flow" | "write-nomination" | "write-role-card" | "dispatch";
  flowId?: string;
  stepId?: string;
  targetRoleId?: string;
  targetRoleIds?: string[];
  path?: string; // 项目相对路径（write-* 用）
}

export type GovernanceGateDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

/** 快照类型见 §5.7（`GovernanceLedgerSnapshot`，单一来源，不在此另立一份）。 */
export function evaluateGovernanceGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision;
```

- **提案接受门**：`write-flow`（Convener 写 `docs/flows/<flowId>.md`）与 `write-nomination`（Nominator 写 `docs/nominations/<flowId>-vN.md`）要求账本中该 `flowId` 的最新 `customer.decision` 的 `decisionKind` ∈ `{proposal-accept, proposal-accept-quick}`；否则拒，文案指回「请先在 Rapporteur 会话完成提案接受」。
- **任命写入门**：`write-role-card`（Nominator 写 `角色卡/<targetRoleId>/**`）要求账本中该 `flowId` 有 `customer.decision` 且 `decisionKind="appointment"`、`targetRoleIds` 含 `targetRoleId`；否则拒，文案「请先取得客户任命」。写盘确认卡（`decisionKind="appointment-write"`，`paths` 逐条）由 confirmed-writes 发行器另行执行；账本记录它与路径清单，供审计与 V2 的「写入完成」核对。
- **派发范围门**：`dispatch` 要求：
  1. 目标 `targetRoleId` 不是内置治理角色；
  2. 该 flow 有 `decisionKind ∈ {proposal-accept, proposal-accept-quick}`；
  3. 目标在 `appointment` 的 `targetRoleIds` 内，**或**该 flow 的决定为 `proposal-accept-quick` 且目标为既有项目角色；
  4. `flowId`/`stepId` 必填，且在流程文件中存在对应步骤；
  5. 同一 `flowId+stepId` 未被派发过（或流程单已出新版本）。
  任一条不满足 → 拒投 + 如实回执 + 系统行；不静默。
- 门禁读账本失败（文件不可读/格式坏）→ **拒**（fail-closed），文案提示检查 `.ans/governance/ledger.jsonl`；不回退到 Markdown。
- 门禁只服务内置角色会话与 `routeDispatch`；**项目角色不受此门禁影响**（它们按各自边界工作）。

### 6.3 防空转/防循环（V1 机械规则）

1. 一个步骤一个主人；无主人的步骤不得 `in-progress`。
2. 同一版本同一步骤第二次 `returned` → 自动 `escalated-to-customer`，三人停止转交。
3. 一个提案最多 `v2`；再改必须客户明确要求或开新 flow。
4. 一个 flow 一个当前版本；旧版本 `superseded`，不删除，不参与派发/主视图。
5. 派发唯一键加 `flowId + stepId`；重复派发被去重并如实提示。
6. 禁止自循环：候选物作者不能同时是接受者；三人不能互相批准。
7. 无进展熔断：24h 无状态变化且无客户动作 → Convener 只报 `paused/blocked`，不自动催办、不自动换人。
8. 治理角色不增殖：不得创建第四个治理角色，不得把项目角色提升为治理角色。

### 6.4 快捷路径（客户明确要求时）

- 提案卡的 `accept-quick` 选项：客户选择后，账本记 `customerDecision="accepted-quick"`；若**不新建角色/不改边界**，Convener 可直接按提案开步骤并派发给现有项目角色，跳过提名文件。
- 若涉及新角色/改边界：仍必须任命卡 + 写盘确认卡；快捷路径不能省掉边界确认。
- 快捷路径不产生任何「角色自动批准」；所有决定仍记在客户名下。

## 七、审计与授权

### 7.1 客户最终批准如何体现

| 批准类型 | 载体 | 账本字段 | 谁不能冒充 |
| --- | --- | --- | --- |
| 提案接受/退回 | `request_choice`（flowId） | `decisionKind ∈ {proposal-accept, proposal-accept-quick, proposal-revise, proposal-reject}`, `customerDecision` | 任何角色、Markdown `status` |
| 角色任命 | `request_choice`（flowId, multiple） | `decisionKind="appointment"`, `targetRoleIds` | Nominator 自己的提名文件 |
| 角色卡/边界写入 | `request_confirmation`（逐路径） | `decisionKind="appointment-write"`, `customerDecision`, `paths`（confirmed-writes 发行器同源校验） | 角色口头同意、聊天消息 |
| 流程验收 | `request_choice`（flowId） | `decisionKind="acceptance"`, `power="acceptance"`, `customerDecision` | Convener 的「已派发/已完成」 |
| 治理记录建立/重接受/迁移 | 桌面预览 + 确认点击 | `kind="governance.*"`, `decisionEvidence.action` + `previewDigest` | 任何角色的文件写入 |
| shell 放行 | 既有 shell 审批卡/judge | 不进治理账本 | judge 的 allow 不能当治理批准 |
| pin 重新接受 | 预览 + 确认 | `governance.reaccepted` | 自动重试/自动覆盖 |

- 门禁、派发、账本**只认应用签发的决定**；不解析提案/提名/流程文件的 `status`。
- 任何角色不得把自己的推荐写成决定；UI 文案「推荐」「等待客户决定」，不用「已授权」「已批准」描述提名/派发/流程推进。

### 7.2 judge（「替我审」）与三权的关系

- judge 仍只处理 **shell 放行**，是独立的只读判断 agent；**不参与**提案接受、任命、验收、治理记录。
- trio 下不给三人 shell 的 risky/deny 审批档；judge 的 allow/deny 结果只作用于项目角色的 shell 三层链（或 convener 的只读档无审批可放）。
- 卡面文案分两种：治理决定卡标「治理决定 · 客户最终批准」；shell 卡/judge 结果标「shell 放行 · 非治理决定」。
- **不得**把 judge 的 allow 写进治理账本作为客户决定。

### 7.3 三人之间的留痕

| 审计问题 | 账本回答 |
| --- | --- |
| 谁提的案 | `artifact.observed`（`actorRoleId="rapporteur"`，`artifactPath="docs/proposals/<flowId>-vN.md"`，版本/哈希） |
| 谁提的名 | `artifact.observed`（`actorRoleId="nominator"`，`artifactPath="docs/nominations/<flowId>-vN.md"`） |
| 谁排的程 | `artifact.observed`（`actorRoleId="convener"`，`artifactPath="docs/flows/<flowId>.md"`）+ `dispatch.accepted`（`flowId/stepId/targetRoleId`） |
| 客户批了什么 | `customer.decision`（`decisionKind`、`customerDecision`、`targetRoleIds`、`paths`、`decisionEvidence.toolCallId/turnId/sessionId`） |
| 治理记录何时建立/迁移 | `governance.established` / `governance.reaccepted` / `governance.migrated`（`decisionEvidence.action` + `previewDigest`） |

- 提案/契约：Rapporteur 写，`artifact.observed` + 客户决定账本。
- 提名：Nominator 写，`artifact.observed` + 任命/写盘决定账本。
- 流程：Convener 写，`artifact.observed` + `dispatch.accepted` + 客户验收决定账本。
- 分歧：各自保留自己的候选物，不互相改写；客户在两张候选物之间裁决，账本记裁决。
- 阻塞：Convener 在流程单标 `blocked` 并附证据；第二次退回自动升级客户。

## 八、入口与 UI（V1 最小面）

### 8.1 左树

1. **主入口**：Rapporteur（沿用现有主入口区域框与默认选中）。
2. **治理职能（内置）**：Nominator、Convener。
3. **其他角色**：项目角色，沿用 `group`/`groupDuty` 分组。

每行显示：

- 中文名 + 英文名（「报告员 Rapporteur」「提名官 Nominator」「召集人 Convener」）；
- 权力副标题：「提案权 · 不拥有最终批准权」「提名权 · 不拥有最终批准权」「编排权 · 不拥有最终批准权」；
- 内置标识：「内置角色：随应用发布，无角色目录」。

实现落点：`app/renderer/renderer.js::renderRoleTree()`（:4318）与 `roleTreeItem()`（:4264）按 `role.builtIn` + `state.primaryRoleId` 分组；`roleSubtitle()`（:4254）读 `role.governanceFunction` 映射文案；**不硬编码 id**，数据来自 `listProject` 的 `governanceFunction`。

### 8.2 空态与状态行

- Rapporteur 空态保留「建立治理记录 / 检查并重新接受」入口（沿用 `UiLabels.governanceActionFor` 单一谓词）。
- Nominator 空态：「通常由流程单提名步骤打开；仅在客户明确要求时直接使用」。
- Convener 空态：「通常由已接受提案开启流程；只负责排步骤与派发，不批准方案」。
- 状态行显示：治理模型（三权/旧模型）、当前 flowId（若有）、`等待客户决定` / `进行中` / `阻塞` / `已升级客户`；状态由账本/流程单派生，不读角色自述。
- 旧模型提示条：「本项目使用旧治理模型（su）。可升级为三权模型。」+「查看差异 / 升级」；V1 若 V1b 未就绪，按钮显示「升级入口待本版后续」，不假装可用。

### 8.3 决定卡

- 显示：`flowId`、权力类型（提案/提名/编排/验收）、将写路径（写盘确认）、摘要/哈希、选项（接受/退回/要求修改/拒绝；任命多选）。
- 同一项目同一时刻只展示一张待决定卡；后续请求在界面显示「等待前一个决定」，**不自动合并、不自动批准**。
- S1「建立治理记录」预览增**治理模型选择**（`single` / `trio`）：默认 `single`；若检测到 `docs/proposals|nominations|flows`，给出「建议 trio」的提示，但必须客户点选。选择结果写进 `.ans`，并在预览中逐字显示。
- 确认卡不改变角色边界；卡上的路径逐条列，未列出的写不进去（沿用 confirmed-writes 机制）。

### 8.4 不做

- 不做三个独立「提案/提名/流程」面板；Markdown 复用现有文档预览/资料入口。
- 不新增独立「权限说明」模态；说明放行副标题 + 内置卡文本 + 文档链接。
- 不把「推荐」写成「决定」；不把「已派发」写成「已完成」。

## 九、验收映射（可测量）

1. **新项目默认**：`listProject` 恰返回 3 个 `builtIn === true`，顺序 `rapporteur`/`nominator`/`convener`，`primaryRoleId === "rapporteur"`，`governanceModel === "trio"`；左树出现「主入口 / 治理职能」两组；CTA 打开 Rapporteur。
2. **三人可开**：分别打开三人的会话；默认只选中 Rapporteur；直接打开 Nominator/Convener 不改变其权限约束（工具注册矩阵逐项断言）。
3. **写权矩阵**：Rapporteur 写 `角色卡/**` 被拒；Nominator 未确认写 `角色卡/**` 被拒；Convener 写 `角色卡/**`、`.ans/**` 被拒；三人写 `.ans/**`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md` 全部被拒；拒绝文案指路。至少三个角色的边界求值测试。
4. **预授权矩阵**：Rapporteur 写 `docs/nominations/**` 被拒；Nominator 写 `docs/proposals/**` 被拒；Convener 写 `docs/proposals/**`、`docs/skills/**` 被拒；三人预授权目录内的写放行（仍过 F6）。
5. **提案门禁**：没有账本 `customer.decision`（accepted）的 flow，Convener 写 flow 被拒；提案文件里写 `status: accepted` 不改变判定。
6. **任命门禁**：没有任命决定，Nominator 写任何 `角色卡/**` 被拒；确认卡未列出的路径写不进去；任命名单外的目标角色不能被派发。
7. **派发门禁**：没有已接受提案 + 任命/快捷路径 + 流程步骤 → `dispatch_task` 拒投；目标为三人之一 → 拒投；同一 `flowId+stepId` 重复派发被去重；每次成功派发账本有 `dispatch.accepted`。
8. **回交路由**：trio 下项目角色回交进 Convener 并在 Rapporteur 聊天流镜像；single 下仍进 su。
9. **看护路由**：trio 下看护系统消息投 Convener；Rapporteur 只镜像；Convener 可 `role_status`/`session_tail`/`propose_recovery`，Rapporteur/Nominator 不注册这些工具。
10. **一次一个待决定**：同一项目同时只允许一个待客户决定；第二张卡排队并在界面可见。
11. **审计可还原**：给定一个完整 flow，能从 `.ans/governance/ledger.jsonl` + 三份候选物还原「谁提的案、谁提的名、谁排的程、客户批了什么」；每个候选物有作者与版本。
12. **迁移**：旧项目默认 `single` 且行为不变；迁移预览零写入；确认后 `.ans` 有 `governanceModel:"trio"`、manifest 有升级记录；旧角色卡/边界/pin/历史会话保留；su 从 `listProject` 消失且不可开启；不建 `角色卡/su/`。
13. **旧项目无 `.ans` 有角色**：仍 `single`，不报警；S1 预览若检测到 `docs/proposals|nominations|flows`，提示「建议 trio」，但必须由客户在建立卡上显式选择；选 `trio` 才写 `governanceModel:"trio"`，选 `single` 或未选则保持 `single`。不自动按产物猜模型。
14. **`.ans` 不可解析**：`governanceModel` 按 `single` 处理，治理记录状态 `invalid`，不崩、不静默回退运行期同意。
15. **保留 id 冲突**：`角色卡/rapporteur/`、`角色卡/nominator/`、`角色卡/convener/`、`角色卡/su/` 均被跳过并警告；不会遮蔽内置角色。
16. **账本失败不翻转**：账本 append 失败只记诊断/如实回执，不改变客户决定、不放宽门禁、不阻断写盘。
17. **无自动批准**：全仓不存在「角色文件 status → 门禁放行」「judge allow → 治理批准」「dispatch 成功 → 验收通过」的代码路径；测试逐条断言。
18. **UI 最小面**：无三个新面板；主入口/治理职能分组、权力副标题、等待客户决定状态行、迁移提示条可见；现有治理记录入口仍可用。
19. **快捷路径**：`accept-quick` 且无新角色 → 可跳过提名文件派发；有新建/改边界 → 仍出任命卡 + 写盘确认卡。
20. **全量回归**：`node --test "test/**/*.test.ts"`（三层 glob，不能漏测）；typecheck 零错；不跑真实模型/凭据/`.env`。
21. **文件交接闭环（确定性端到端）**：不跑真实模型，用测试夹具模拟「Rapporteur 写提案 → 客户接受 → Convener 写 flow → Nominator 写提名 → 客户任命 → 写盘确认 → 角色卡落盘 → Convener 派发 → 项目角色回交 → Convener 更新 flow → Rapporteur 请客户验收」；每一步的账本事件、候选物路径/版本/哈希、派发回执、回交镜像可串成一条链；跳过任一道客户决定都会被门禁拒绝。

## 十、风险

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| **多内置改造面** | `listProject`/`resolveRole`/`resolveBoundarySection`/`run-role`/桌面注入/渲染树同时改，容易漏一处导致权限错配 | 单一注册表；能力矩阵数据驱动；按 AC3/AC4/AC9 逐角色断言；先落门禁引擎与运行时核心类型，再落编排/桌面 |
| **边界来源混淆** | trio 误用 `governance-boundary.yaml` 的 `角色卡/ docs/ .ans/` 全量授权，三人等于 su | `resolveBoundarySection` 显式按模型分支；trio 不读 `gov.path` 条目；测试断言三人预授权互不重叠 |
| **finalize 被挡/越权** | 复用会话边界导致应用写不了 `.ans`，或把 `.ans` 写权漏给某个角色 | 新增 `appGovernanceBoundary`，只给应用；三人 `forbiddenWritePaths` 显式禁写 |
| **迁移丢记录** | 升级时丢 `.ans`/pin/历史 | 预览零写入、只改 `governanceModel`、保留未知字段、manifest 追加、pin 不变不重算；不删旧文件 |
| **三权空转** | 提案→提名→流程→退回循环 | 一步骤一主人、最多退回一次、提案最多 v2、24h 熔断、流程单强制显示下一步 |
| **提名越权** | Nominator 自行写角色卡/扩边界 | 任命卡 + 逐路径写盘确认卡；写入门禁只认账本；禁写治理边界/自身/其他治理角色 |
| **编排越权** | Convener 派发未批准任务/给三人派活/自行改需求 | 派发门禁；内置目标拒绝；`dispatch_task` 只注入 Convener；账本留痕 |
| **审批旁路** | Markdown 自称 accepted，或把 judge allow 当治理批准 | 门禁只认账本；judge 仅 shell；卡面区分治理决定/shell 放行 |
| **成本/延迟** | 三个会话、多次落盘，简单任务也要三轮 | 快捷路径；V1 不自动让三人互聊；一次只推进一步；模板化 |
| **客户认知负担** | 三个角色、三种权力、多张卡 | 默认只面对 Rapporteur；权力副标题；一项目一卡；旧项目提示条 |
| **内置边界漂移** | 代码里的三人边界变化，pin 不覆盖 | 记录 `governanceModel` 版本；启动/测试校验角色 id 与能力矩阵；文档如实说明 pin 不钉代码 |
| **保留 id 冲突** | 项目已有同名角色目录，遮蔽治理角色 | 保留 id 守卫；`listProject` 跳过 + 警告；`resolveRole` 忽略项目映射 |
| **旧项目长期不迁移** | 两套模型并存，文档/UI 分叉 | single 只维持 su 既有行为，不新增 trio 能力；迁移入口常驻；是否强制由客户定 |
| **账本损坏** | gate fail-closed，流程卡住 | 回执指路；账本 append-only + 诊断；V2 增加只读校验/修复工具（不自动修复） |
| **judge/abort 在飞冲突** | 同文件并行修改，合并冲突或语义回退 | 见 §十一：先落地 judge/abort，再开 trio；trio 不触碰 abort/隔离与 judge 判定 |

## 十一、派发顺序与并行边界

### 11.1 前置门槛

**在「替我审」judge 与 abort 修复批次落地前，不启动三权实施。** 二者与三权共用以下文件/接缝：

| 文件 | judge/abort 在飞内容 | 三权将改内容 | 处理 |
| --- | --- | --- | --- |
| `src/model/runtime.ts` | judge 类型、abort 相关类型 | `flowId`/`stepId`、`CustomerInputMetadata`、能力类型 | 运行时核心单一属主；先在 judge 批次收口，再追加三权字段；不并行编辑 |
| `src/pipeline/orchestration/run-role.ts` | `shellJudge` 能力注入 | function 能力矩阵、预授权、禁写路径、账本 | 编排单一属主；先 judge，后 trio；保留 judge 的 `shellJudge` 注入不动 |
| `src/pipeline/orchestration/govern-session.ts` | judge 公共再导出 | `openGovernanceSession` function 选择、账本再导出 | 先 judge，后 trio |
| `src/service/runtime/session.ts` | judge 模式、abort 隔离 | **三权不碰** | 三权任务书明确禁止改本文件 |
| `src/common/门禁引擎/boundary-core.ts` | 内置卡「命令纪律」段 | 三权卡文本/注册表/边界解析 | 先 judge 卡文本，再三权注册表；或同角色一次改完，避免两批 |
| `app/desktop/session.ts` | judge 注入、shell 通道 | 能力注入、回交/看护路由、派发门禁 | 桌面窗口单一属主；先 judge，后 trio |
| `app/renderer/**`、`app/main.ts`、`app/preload.cjs` | judge 开关/结果行 | 左树分组/权力副标题/迁移提示/一卡队列 | 桌面UI/桌面窗口；先 judge，后 trio；同文件串行 |
| `test/runtime-core/*`、`test/编排/*`、`test/桌面应用/*` | judge/abort 测试 | 三权测试 | 三权测试用**新文件名**，避免与在飞测试同名 |

**结论**：judge/abort 是**串行前置**，不是可并行的独立批次。三权不得以「反正不同段」为理由并行编辑同一文件。

### 11.2 三权内部波次（judge/abort 落地后）

| 波次 | 属主 | 内容 | 依赖 |
| --- | --- | --- | --- |
| W0 契约 | 门禁引擎 + 运行时核心 + PM | `model/role.ts` 类型；注册表壳；`model/runtime.ts` 的 `flowId`/`stepId`/metadata；`config-loader.ts` 的 `readGovernanceModel` | 无（但 runtime.ts 需 judge 已收口） |
| W1 门禁 | 门禁引擎 | 注册表全量；`listProject`；`resolveRole`；`resolveBoundarySection`；`appGovernanceBoundary`；保留 id 守卫；单测 | W0 |
| W2 编排 | 编排 | `openGovernanceSession` function；能力矩阵；预授权/禁写；账本；`governance-gate.ts`；`repinIfBootstrapped` 改用应用边界；单测 | W0 + W1 |
| W3 桌面窗口 | 桌面窗口 | 三内置注入/路由；回交/看护改投；`routeDispatch` 门禁；一卡队列；单测 | W1 + W2 |
| W4 桌面UI | 桌面UI | 左树三组/权力副标题/CTA/状态行/迁移提示；不做三面板；渲染测试 | W3 的 Interface 契约 |
| V1b 迁移 | 桌面窗口 + 编排 + 桌面UI | 迁移预览/写入 IPC、S1 模型选择、manifest 留痕、缓存刷新；不重写角色卡/边界/pin | W3 |
| W5 独立验收 | 测试 | 三权验证套件、迁移夹具、审计还原、全量三层 glob | W1–W4 + V1b |

- W1 与 W0 的 `model/role.ts` 可同角色一次完成；W0 的 `model/runtime.ts` 由运行时核心独立完成，与 W1 并行（不同文件）。
- W2 依赖 W1 的 Service 导出；W3 依赖 W2 的 Pipeline 公共导出；W4 依赖 W3 的 `ListProjectResult`/`RoleView`；W5 最后。
- V1b 迁移在 W3 之后单独一波（桌面窗口 + 编排 + 桌面UI），不得挤进 W1–W4 的关键路径。

### 11.3 不得跨角色写的文件（重申）

- `src/model/role.ts`：**门禁引擎**唯一主属。
- `src/model/runtime.ts`：**运行时核心**唯一主属。
- `src/common/门禁引擎/**`：门禁引擎私有；他人只读。
- `src/common/编排/**`、`src/pipeline/orchestration/**`：编排私有；桌面只经 `govern-session.ts` 公共出口。
- `src/service/role/**`：门禁引擎；`src/service/runtime/**`：运行时核心。
- `src/common/shared/**`：PM 唯一写入者（`readGovernanceModel` 由 PM 落地；消费方只读导入）。
- `app/desktop/**`、`app/main.ts`、`app/preload.cjs`：桌面窗口。
- `app/renderer/**`：桌面UI。
- 测试目录：`test/门禁引擎/`、`test/编排/`、`test/runtime-core/`、`test/装配/` 等各属主；`test/桌面应用/` 为桌面窗口与桌面UI 共用清单（只扩展既有文件，新增文件须先核对边界）；`test/测试/` 归测试角色。
- 任何角色不得改其他角色的 `角色卡/`、`boundary.yaml`、`memo.md`、`docs/`；Nominator 写角色卡只在客户任命 + 写盘确认后，且只能写确认卡列出的路径。

## 十二、必须客户拍板的点

以下 8 项超出 PM 可自行裁定的范围，实施前需客户明确；PM 给出推荐默认。

1. **V1 分期**：V1 最小闭环（三角色/门禁/账本/兼容）+ V1b 迁移，是否接受？推荐：接受；迁移不挤掉门禁与账本。
2. **旧项目默认 single**：未迁移前保持 su 全功能、不出现三权角色，是否接受？推荐：接受；迁移入口常驻、不强制。
3. **迁移后 su 的处置**：隐藏、不可开启、历史只读、不建 `角色卡/su/`、V1 无一键回滚，是否接受？推荐：接受；回滚列 V2。
4. **任命写卡两层卡**：先任命卡（多选候选角色 id）、再写盘确认卡（逐路径），是否接受？推荐：接受；这是「提名 ≠ 任命」的结构性保证。
5. **治理角色之间不 dispatch**：Convener 不直接向 Nominator 派「提名」步骤，改由客户点击「打开 Nominator（提名步骤）」入口，是否接受？推荐：接受；避免新增角色间命令通道与「派发=授权」混淆。
6. **三人 shell 面**：三人都不接 risky/deny 审批档，Convener 只读档，是否接受？推荐：接受；执行类 shell 留给项目角色三层链。
7. **账本位置**：V1 用 `.ans/governance/ledger.jsonl`（应用独占）而非 `docs/audit/governance.jsonl`，是否接受？推荐：接受；V2 再做只读导出。
8. **快捷路径**：提案卡提供「接受并直接执行（复用现有角色）」，有新建/改边界仍走任命 + 写盘确认，是否接受？推荐：接受；简单任务少一轮提名。

## 十三、明确声明

**本文件只是评审与拆发，未实施。** 未改任何源码、测试、`.ans`、UI 或其他角色文件；未启动执行上下文；未读 `.env`、未跑凭据/网络/真实模型；未 git 提交。文中的源码行号为写作时点工作树读数（含在飞修改），实施前须按当轮 HEAD 复核。本评审不构成对 §十二 的客户裁定；未拍板项按推荐默认写入任务书时须逐条标注「待客户确认」。
