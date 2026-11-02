# 团队计划：派发护栏只保留「谁能给谁派发」（dispatch authorization only）

- **任务 ID**：`2026-11-02-dispatch-guardrail-relax`
- **产品 flowId**：`dispatch-guardrail-relax`（沿用意图/方案文件名；本任务没有独立的 flow 记录）
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-02
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0/1 记录**：[`docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`](../communication/2026-11-02_intent_dispatch-guardrail-relax.md)（当前 91 行 / SHA-256 `b0bb187cfd065ff4b2f14d2bccce30d24c901178fb12576c9f778a184c0f4149`，含闸门 0、闸门 1 材料与闸门 1 确认记录；方案头引用的 67 行 / `212e987f…` 是追加闸门 1 记录前的闸门 0 快照，两者按不同版本引用、不混用）。闸门 1 客户原话：「确认闸门 1：方案 P1.1，Q1–Q5 全 A，O1/O5/O7 后续独立事项，O2–O4/O6 暂不做，planDispatchDelivery 拒投保留；接受 F4/R1–R4 披露。」
- **客户确认的策划方案（唯一实施基线）**：[`docs/planning/2026-11-02_design_dispatch-guardrail-relax.md`](../planning/2026-11-02_design_dispatch-guardrail-relax.md) **P1.1**（877 行；SHA-256 `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649`，本计划写盘前实测一致）。本计划不扩大、不改变方案口径；实施超出确认版本须停止回报。
- **独立复核**：[`docs/planning/2026-11-02_review_dispatch-guardrail-relax.md`](../planning/2026-11-02_review_dispatch-guardrail-relax.md)（150 行；SHA-256 `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5`；P1.0 完整复核 F1–F12 + P1.1 再复核 R1–R4；再复核结论「建议提交客户确认」，无阻断项）。方案 §13 仍引用 P1.0 复核快照（101 行 / `232c4b1c…`）并写「未解决意见：无」，按 R4 由策划作者做提交前文档更正，不改已确认方案语义（见 §六）。
- **风险档位**：**T3**（治理/权限/派发受理语义变更；方案 §9 与闸门 1 已定档，本计划不压档）。
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目当前**没有 `.ans/project.json`**（仅有 `.ans/sessions/`、`.ans/su/`），未启用 task_ops；本计划不伪造任务令牌、审批、锁或机器预检记录，证据以文件哈希与原始命令输出为准。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（参与角色/写集/边界变更/档位/阶段顺序/验收安排/证据口径/实施授权边界）**；**闸门 2 确认与客户实施授权前不派发任何 worker、不写卡、不改代码**。闸门 2 与实施授权是两个分开的事实，不能互相替代。

---

## 一、任务与基线

### 1.1 目标（按客户确认的 P1.1，不扩大）

把派发受理拆成两层，并完成测试迁移与 T3 证据：

1. **硬授权（保留拒绝）**：只判定「谁能给谁派发、目标是否真实存在」——不能自派；只有幕僚/运营可派发；幕僚只可派产品/策划/人事/运营/质检（不是项目 worker；`su`/未知内置按 `target-card-missing` 拒绝）；运营只可派真实存在的项目 worker 或内置质检；目标 id 不存在/未枚举到则拒绝。拒绝发生在 `task.created` 之前：不写任务行、不打开目标会话、不投递。
2. **状态提示（advisory，不阻断）**：意图/方案/名单/模块/env-bootstrap/D3/交付/run/pin/文档哈希/版本化基线全部降级为提示 + 诊断记录（`tasks.dispatch.advisory`），返回 `ok:true` 并照常建任务、投递；幂等抑制保留为业务去重；run 记账尽力而为，不可用时任务省略 flow/run 锚点；删除「派发被冻结事实拒绝时自动弹 run-change 卡」的触发路径，保留 run-change 卡、显式入口与提案卡冻结路径；`planDispatchDelivery` 契约引用缺失继续拒投且运行文案逐字不变。
3. **测试与证据**：按方案 §7.3 逐条把旧状态拒绝迁移为「硬负例」或「受理 + advisory」正例，不删除测试、不新增 skip、不放松断言；T3 全量回归 + `npm run typecheck` + 可跑的 Electron E2E；证据最多截图、不要求录屏。

可核对完成标准为方案 §8.2 **AC-1–AC-8**；正式验收标准由内置独立验收在实施前基于同一确认版本写盘（见 §七）。

### 1.2 风险档位与验证口径：T3

方案与闸门 1 定档 **T3**：派发受理语义属于治理/权限边界变更，不是纯文档或局部实现。验证口径按技能 `references/testing.md` 的 T3 定义与方案 §8.3：

- 受影响角色层测试（编排纯逻辑、桌面窗口集成）+ 跨角色集成/完整流程回归；
- **T3 全量适用回归**（`node --test --test-concurrency=1`，允许按既有验收记录排除 `test/pi-adapter/write-sequencing.test.ts` 并记录命令与原因）；
- `npm run typecheck`；如改渲染层才需 `typecheck:renderer`/`build:renderer`（本任务默认不改渲染层）；
- **可跑的 Electron E2E**：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`，记录 `E2E_PASS`/截图/候选哈希；不可跑时如实记录原因（AC-6.4），不得静默跳过；
- 失败分类：区分既有 Windows symlink EPERM 等基线失败与本次新增失败，新增确定性失败必须为 0；升档不降档，证据不足按 §七判 `insufficient evidence`。

### 1.3 本轮非目标（不得顺手扩大）

- **O1/O5/O7 不实施**（后续独立事项）；**O2–O4/O6 暂不做**；所有选装默认不实施。
- **F4 不改**：不修改 `redispatch_task`（`src/pipeline/orchestration/run-role.ts`）、`redispatchTask`/`chooseRedispatchTarget`（`app/desktop/session.ts:4324-4330`、`:4476-4620` 一带）的目标选择与授权语义；O7 留作后续独立变更（须重开闸门 0/1）。
- 不改写权/边界（Section 1、`resolveWrite`、`TaskScope`）、shell 命令/脚本守卫、执行后审计、验收判定/验收卡、客户闸门、人事 D3 与 `appointment-write`、报告路由、任务卡格式、任务重派/看护。
- 不改 `src/model/runtime.ts`、`src/common/编排/task-state.ts`（含 `run-required` schema）、`src/common/编排/run-manifest.ts`、`src/common/门禁引擎/versioned-doc-guard.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/common/编排/handback.ts`（`planDispatchDelivery` 运行文案）、`src/provider/runtime/schema.ts`（O5）、`app/renderer/**`。
- 不改角色卡/边界文本（O5 后续）；不改 `package.json`/构建/发布配方；不 commit/push/合并/发布。
- 不把复核结论当客户确认；不把闸门 1 当实施授权；不把本计划当实施授权。
- **与已取消的 run-change-auto-approve / full-report-display 无关**：客户已于 2026-11-02 取消这两轮未提交修复并要求恢复到 `HEAD c80f494`，全部未提交改动已存入本地快照 `stash@{0}`（`e9e53a84…`，标签 `cancel-2026-11-02_full-report+run-change-uncommitted`，见 `docs/communication/memo.md:118`）。本任务不引用、不恢复、不合并这两轮工作树改动；本计划基线为当前干净的 `HEAD c80f494`。

### 1.4 基线（写计划时实测，2026-11-02）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `feat/flow-improvements-wave1` / `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（与方案/复核标注一致） |
| 工作树（写本计划前） | 2 个已跟踪修改：`docs/communication/memo.md`、`docs/planning/memo.md`；3 个未跟踪输入文档：本任务意图/方案/复核记录；**无产品/测试改动**（`git status --porcelain -- src app test` 为空）。本计划写盘后新增未跟踪 `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` 与 memo 更新；均非产品代码改动 |
| 已跟踪代码/测试改动 | 无 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；`.ans/sessions/`、`.ans/su/` 为既有运行目录，不是任务配置 |
| 环境 | Node **v24.22.1** / npm **11.19.1**；worktree `node_modules` 已安装；`node_modules/.bin/electron` 与 `test/桌面应用/e2e/main.mjs` 存在（实际可运行性由 B0 实测、D2 取证） |
| 既有参考基线 | 既有验收记录允许 T3 全量回归排除 `test/pi-adapter/write-sequencing.test.ts` 并记录可复现方式（`docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`）；Windows symlink EPERM 属既有环境失败，B0 必须重新记录并分类，不把既有失败算作通过 |
| 共享属主 | `src/common/编排/` 与 `test/编排/` 属**编排**；`app/desktop/` 与 `test/桌面应用/`（逐文件授权）属**桌面窗口**；`src/common/shared/` 唯一写入者为**项目管理**；`test/测试/` 属**测试**；`docs/scheduling/` 统筹、`docs/acceptance/` 内置独立验收、`docs/communication/` 沟通、`docs/planning/` 策划、`角色卡/**` 人事 |

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-02）** | 意图记录「闸门 0 确认记录」；客户原话「确认闸门 0：按这份意图理解推进方案」 |
| 闸门 1：方案确认 | **已确认（2026-11-02，P1.1 为唯一实施基线）** | 意图记录「闸门 1 确认记录」；客户原话见本文件头 |
| 闸门 2：角色指派/写集/边界变更 | **未确认** | 本计划 §八；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发任何 worker、不改代码、不启动实施 |
| 实施前验收标准 | 未写盘 | 由内置独立验收在闸门 2 后、实施前写 `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`；沟通另起验收主上下文 |
| 提交/推送/发布 | **未授权** | 实施/验收期间不 commit/push；提交/推送/发布另行授权 |
| 已取消变更 | 不相关 | run-change-auto-approve / full-report-display 已取消并收进本地快照；本任务不引用其工作树改动 |

### 2.1 闸门 2 与实施授权是两个事实

- 闸门 2 确认的是**参与角色、各自范围和写集、是否有角色/边界变更、档位、阶段顺序、验收安排、证据口径、实施授权边界**；实施授权是对代码实施与真实回归的授权。两者分开记录，不能互相替代。
- 客户在闸门 1 的确认（P1.1 + Q1–Q5 全 A + 选装/范围说明 + 接受 F4/R1–R4 披露）**不等于**闸门 2，也不等于实施授权。
- 本计划写盘后不派发任何 worker，直到：闸门 2 确认 + 客户实施授权 + V1 标准写盘并经沟通确认 + §4.6 边界条目落地（人事）+ 逐角色范围预留完成。

### 2.2 客户在闸门 1 已确认/知悉的事项（本计划据此排期，不重开）

| 项 | 确认/知悉 |
| --- | --- |
| Q1 | A：保留「目标必须真实存在」（项目 worker 以 role-card + boundary 可解析为准）；取消「D3 选中集合每个角色都须有卡」 |
| Q2 | A：模块归属算任务状态，降级 advisory；写权仍由 Section 1/写守卫保证 |
| Q3 | A：状态检查全部降级为提示 + 诊断记录，不删除 |
| Q4 | A：幂等保留；run 读取/草案/pin/哈希/版本化基线降级 advisory；有 flowId 时尽力创建/复用 draft run 作账本锚点，失败则任务省略锚点；不改 `task-state.ts` schema |
| Q5 | A：目标角色不存在 → 派发硬拒；模块/材料缺失 → advisory，失败落在真正需要该前提的下游动作 |
| 选装 | O1/O5/O7 作为后续独立事项（本任务不实施）；O2–O4/O6 暂不做 |
| `planDispatchDelivery` | 引用契约不存在继续保留为拒投（消息引用完整性，不是任务状态）；若要求也放宽须重开闸门 1 |
| 未关闭项 | 接受 **F4 部分采纳**与 **R1–R4** 如实披露；F4 留 O7；R1 调用协议、R2/R3 口径、R4 引用与未解决意见表述由统筹在团队计划/实现提案审核中处理、实施前明确 |

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 硬授权/advisory 拆分落在**编排**既有职责（`src/common/编排/workflow-preconditions.ts:1187` 的共享编排纯逻辑、`mechanical-rejection.ts` 码表/文案、新增 `dispatch-advisories.ts` 纯逻辑）；会话接线与投递落在**桌面窗口**（`app/desktop/session.ts:6067` `routeStarDispatch` 等）；测试与回归落在**编排/桌面窗口**的层测试 + **测试**角色的跨角色回归。没有产生需要不同知识/契约的持久新责任 |
| 2. 范围归属 | **现有 Section 1 覆盖；2 个逐文件测试条目缺失，需精确边界变更** | 全部路径映射见 §4.1。`src/common/编排/`（目录）、`test/编排/`（目录）、`app/desktop/`（目录）覆盖全部源码与新文件；`test/桌面应用/` 是**逐文件授权**：`chain-enforcement`/`star-routing`/`rejection-copy`/`run-pin`/`dispatch-fresh-enum` 已列，**`run-change-trigger.test.ts`、`run-change-entry.test.ts` 未列**，须 B-1/B-2 |
| 3. 契约影响 | **有共享编排契约变更；唯一 primary owner = 编排；先冻结后消费** | `DispatchPreflightInput` 增 `targetExists`、`chiefRoleId` 允许 `string \| null`；`DispatchPreflightResult.ok:true` 增 `advisories: DispatchAdvisory[]`；新增 `DispatchAdvisory` 类型与 `collectDispatchAdvisories`。均为 `src/common/编排/` 私有共享纯逻辑（桌面窗口按既有 import 消费），不是 Model/任务账本 schema；`DispatchReceipt`/`TaskCreatedEvent` 形状不变；`task-state.ts`、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts` 不改。契约在 A1 退出时冻结，B1 只按冻结形状消费；变更须回编排重跑受影响证据 |
| 4. 证据独立性 | **满足** | 编排单元/层契约测试；桌面窗口主进程集成测试；测试角色跨角色回归、T3 全量回归与可跑 E2E；内置独立验收按 P1.1 写 V1 并判通过/返工/证据不足；实施者不自验，统筹不改验收结论 |
| 5. 协调成本 | **复用现有角色最低；新增角色不划算** | 2 个实施角色（编排、桌面窗口）写集不相交；测试负责跨角色回归；项目管理做实现提案审核（既有技术架构职责）并被条件性纳入 i18n；人事只补 2 个边界条目。新增「派发护栏」专职角色会重复建卡/边界/交接成本，且无持续独立责任 |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 编排 | **保留 + 契约 primary owner** | `workflow-preconditions.ts`、`mechanical-rejection.ts` 在私有目录；新增 `dispatch-advisories.ts` 与 `test/编排/dispatch-advisories.test.ts` 均在目录授权内；职责不变 |
| 桌面窗口 | **保留 + 调整边界（B-1/B-2 两个精确测试条目）** | `app/desktop/session.ts` 在 `app/desktop/` 目录授权内；7 个测试文件中 5 个已列、2 个未列（逐文件授权） |
| 测试 | **保留** | `test/测试/` 目录授权；负责 B0/D1/D2 的跨角色回归、T3 全量、可跑 E2E 与证据；默认不新增 `test/测试/` 用例 |
| 项目管理 | **保留（P1 实现提案审核；i18n 条件参与）** | 既有技术架构/实现提案评审职责（`references/proposal-review.md`）；`src/common/shared/i18n/messages/*` 与 `test/项目管理/shared/` 在目录授权内。默认不写 i18n（复用现有 `main.session.acceptedTask` + 中文 advisory 文本）；如确需新 key，在 P1 声明后按既有目录授权写，不新增边界 |
| 人事（内置） | **闸门 2 后执行 B-1/B-2** | 角色卡/边界/YAML/changelog 由人事维护；不改 id/显示名/职责描述，不扩其它权限 |
| 内置独立验收 | **参与**（V1 标准 / E2 判定） | 技能默认写权 `docs/acceptance/`；沟通另起唯一验收主上下文 |
| 统筹 | **参与**（本计划、派发、收证、变更包、记录） | 技能默认写权 `docs/scheduling/` |
| 沟通 | **参与**（闸门 2 记录、实施授权、R4 协调、回报） | `docs/communication/` |
| 产品/宣传/UIUX设计师/各适配器/运行时核心/门禁引擎/装配/项目 `角色卡/独立验收` worker | **不参与** | 无写集、无契约面；不改 Model/工具面/门禁引擎/构建发布；独立验收用内置，不用项目 worker |

### 3.3 决策表结果

**不变，派给现有角色；另需 2 项精确边界变更（职责相同，仅补既有测试文件的逐文件授权路径）。**

- **无**新增角色、**无**拆分、**无**合并、**无**角色 id/显示名/职责描述变更。
- 边界变更 **B-1/B-2**：桌面窗口 `boundary.md` + `boundary.yaml` 补登 `test/桌面应用/run-change-trigger.test.ts` 与 `test/桌面应用/run-change-entry.test.ts`（见 §4.6）。
- 其余全部源码/测试路径在既有目录授权内：`src/common/编排/`、`test/编排/`、`app/desktop/`、`test/桌面应用/` 已列的 5 个测试文件、`src/common/shared/`（条件 i18n）、`test/项目管理/shared/`（条件 i18n）。
- 装配不参与实施；项目管理默认只做 P1 审核，i18n 为条件写。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有角色：编排 + 桌面窗口 + 测试 + 项目管理（审核/条件 i18n）+ 人事边界 + 内置验收 + 统筹 | **采用** | 写集与现有 Section 1 一一对应；硬授权纯逻辑、会话接线、跨角色回归、实现审核职责分离；协调成本最低 |
| B. 新增「派发护栏」专职角色 | 否决 | 一次性治理语义变更，不构成持续独立责任；会跨 `src/common/编排` 与 `app/desktop` 重复建卡/边界/交接成本 |
| C. 把 `app/desktop/session.ts` 拆给编排 | 否决 | 违反分层与 Section 1；编排不得写 Interface 主进程侧会话 |
| D. 把 `test/桌面应用/*` 交给测试角色 | 否决 | `test/桌面应用/` 对桌面窗口是**逐文件授权**，测试角色 Section 1 只有 `test/测试/`；照方案 §8.1 的「桌面集成」标签会越权 |
| E. 把 advisory 逻辑放桌面窗口 | 否决 | 旧状态检查与硬授权同源，放 `src/common/编排/` 才能保持单一纯逻辑入口与可单测性；桌面窗口只做事实收集与呈现 |
| F. 为 i18n 新文案新增 key 并默认由项目管理写 | 不采用（默认） | 方案 §5.1 允许「复用现有文案 + 中文 advisory 文本」；默认不新增 key，避免 i18n 计数与双语文案扩散；确需时在 P1 声明后按既有目录授权写 |
| G. 不设实现提案审核 P1，直接让 A1/B1 施工 | 否决 | 方案 R1 要求明确调用协议与测试；技能要求已建立的技术架构角色审核实现提案；P1 是解释该协议的唯一关口 |
| H. 把 F4/redispatch 一并纳入本次硬矩阵 | 否决 | 属方案 O7、重开闸门 0/1 的独立变更；本次只披露并做只读核对，不改行为 |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：A1（编排硬授权 + advisory 纯逻辑 + 单测）先冻结，B1（桌面窗口 session 接线 + 集成测试）只按冻结形状消费。
- **串行**：G2 → IA；IA 后 H1/V1/B0（可并行，V1 本就只依赖 G2）→ P1（B0 完成后）→ A1 → B1 → D1 → D2 → E1 → E2 → E3。B1 必须等 A1 冻结与 H1 完成（两个新测试条目先落地）。
- **共享文件单写者**：`src/common/编排/workflow-preconditions.ts`、`dispatch-advisories.ts`、`mechanical-rejection.ts` 只由编排写；`app/desktop/session.ts` 只由桌面窗口写；`src/common/shared/i18n/messages/*` 只由项目管理写（条件）；`test/桌面应用/*` 只由桌面窗口写；`test/编排/*` 只由编排写。任何角色不得并发写同一文件，也不得写 `docs/scheduling|acceptance|communication|planning` 或角色卡/边界。
- **不允许**：在 H1 前创建/修改 `run-change-trigger.test.ts`、`run-change-entry.test.ts`；在 A1 冻结前写引用新 `DispatchPreflightResult.advisories` 的 session 代码；跳过 P1 直接 A1/B1；任何角色改 `redispatch` 路径或 `task-state.ts` schema。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-11-02 核对，HEAD `c80f494`）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本。目录授权内新增文件不重写边界；新增精确文件/逐文件目录中的新条目才交人事。

| 方案路径 | 所属角色 | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `src/common/编排/workflow-preconditions.ts` | 编排 | `角色卡/编排/boundary.md`「目录（私有）`src/common/编排/`」 | 是（A1） |
| `src/common/编排/dispatch-advisories.ts`（新增） | 编排 | 同上（目录授权内新增文件） | 是（A1） |
| `src/common/编排/mechanical-rejection.ts` | 编排 | 同上 | 是（A1，`target-card-missing` 文案/码表） |
| `test/编排/workflow-preconditions.test.ts` | 编排 | `角色卡/编排/boundary.md`「目录（测试）`test/编排/`」 | 是（A1） |
| `test/编排/dispatch-advisories.test.ts`（新增） | 编排 | 同上（目录授权内新增文件） | 是（A1） |
| `app/desktop/session.ts` | 桌面窗口 | `角色卡/桌面窗口/boundary.md`「目录 `app/desktop/`」 | 是（B1） |
| `test/桌面应用/chain-enforcement.test.ts` | 桌面窗口 | 既有逐文件条目（`boundary.md` 第 61 行一带） | 是（B1） |
| `test/桌面应用/star-routing.test.ts` | 桌面窗口 | 既有逐文件条目 | 是（B1） |
| `test/桌面应用/rejection-copy.test.ts` | 桌面窗口 | 既有逐文件条目 | 是（B1） |
| `test/桌面应用/run-pin.test.ts` | 桌面窗口 | 既有逐文件条目 | 是（B1） |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | 桌面窗口 | 既有逐文件条目 | 是（B1） |
| `test/桌面应用/run-change-trigger.test.ts` | 桌面窗口 | **未列（逐文件授权；H1 新增精确条目 B-1）** | 是（B1，H1 后） |
| `test/桌面应用/run-change-entry.test.ts` | 桌面窗口 | **未列（逐文件授权；H1 新增精确条目 B-2）** | 是（B1，H1 后） |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | `角色卡/项目管理/boundary.md`「目录（私有）`src/common/shared/`」 | **条件**（仅 P1 声明需要新 key 时） |
| `test/项目管理/shared/i18n.test.ts` | 项目管理 | 「目录（测试）`test/项目管理/shared/`」 | **条件**（随 i18n） |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 既有逐文件条目 | **否**（D2 只运行，不改脚本） |
| `test/门禁引擎/versioned-doc-guard*.test.ts`、`test/编排/task-state.test.ts`、`test/编排/appointment-roster.test.ts` | 门禁引擎/编排 | 既有目录授权 | **否**（范围外护栏回归只读） |
| `src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/common/编排/task-state.ts`、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`、`app/renderer/**` | 各自 owner | 既有边界 | **否**（本任务不改；O5/渲染另议） |
| `docs/planning/`（R4 文档更正） | 策划 | 策划默认写权 | 否（仅策划作者；本计划只安排） |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1/E2） |
| `docs/scheduling/` | 统筹 | 技能默认写权 | 是（本计划、变更包、memo） |
| `docs/communication/` | 沟通 | 沟通写权 | 是（闸门 2/实施授权记录，由沟通写） |
| `角色卡/桌面窗口/boundary.md` + `boundary.yaml` + changelog | 人事 | 人事治理写权 | 是（H1，仅闸门 2 后） |

### 4.2 共享属主核对（不猜）

- `src/common/编排/`：编排私有；其他角色不得写。`DispatchPreflightInput/Result` 与 `DispatchAdvisory` 是编排内部的共享编排纯逻辑契约，唯一 primary owner 为编排；桌面窗口经既有 import 只读消费，不复制第二份判定。
- `src/common/shared/`：**项目管理唯一写入者**。本任务默认不改 i18n；如 P1 声明需要新 key，也只由项目管理写 `messages/{zh-CN,en-US}.ts` 与 `test/项目管理/shared/i18n.test.ts`，其他角色不写。
- `app/desktop/`：桌面窗口；本任务只改 `session.ts`（若实施提案证明还需改同目录另一文件，先停止回报，不得默认扩写集）。
- `test/桌面应用/`：**逐文件授权**，不是目录授权；本任务只能写 §4.1 列出的 7 个既有测试文件（其中 2 个在 H1 后）。
- `test/编排/`：编排目录授权；`test/测试/`：测试目录授权；`test/项目管理/shared/`：项目管理目录授权。四者互不重叠。
- 运行期契约：`DispatchReceipt`、`TaskCreatedEvent`、`RunManifest` 形状不变；`task-state.ts` 的 `run-required` 不改；不允许以本任务名义改 schema。

### 4.3 逐角色精确写集与可观察交付

> 每个文件同一时间只有一个写入者。实现顺序：硬授权/advisory 纯逻辑（A1）→ 会话接线（B1）；跨角色工作等真实依赖与已冻结契约。

#### 编排（A1）

- **写集**：
  - `src/common/编排/workflow-preconditions.ts`：保留 `evaluateDispatchPreflight` 为**单一公开入口**；`DispatchPreflightInput` 新增 `targetExists: boolean`，`chiefRoleId` 调整为 `string | null`；内部用 `Pick<DispatchPreflightInput, …>` 收窄硬授权输入（不新增对外重复类型）；按方案 §5.3.1 的判定顺序实现硬授权（自派 → 来源 → 幕僚目标类型/内置 allowlist → 运营目标类型/目标存在）；删除状态分支的拒绝；`ok:true` 返回 `advisories: DispatchAdvisory[]`；保留 roster/modules 解析函数不动。
  - `src/common/编排/dispatch-advisories.ts`（新增）：`DispatchAdvisory` 类型 + `collectDispatchAdvisories(input)`；按来源→目标链计算旧状态检查，每条链只报首个未满足项，独立 run/版本/会话级 advisory 可追加；状态事实优先最新名单/D3，pinned roster/D3 只用于 run 专属 advisory 与模块元数据；`run-legacy-readonly` 由会话层事实判断；纯函数、不读盘/写盘、永不 `ok:false`。
  - `src/common/编排/mechanical-rejection.ts`：更新 `target-card-missing` 的 action 文案（同时覆盖「拼写/id 错误」与「角色卡/边界未就绪」）；owner 保持 `nominator`；保留 `M5_TARGET_CARD_MISSING` 旧别名；不新增拒绝码。
  - `test/编排/workflow-preconditions.test.ts`：按方案 §7.3 迁移 M1–M8/flow/run/legacy 断言；硬授权正/负例、`targetExists`、状态缺失不再 `ok:false`。
  - `test/编排/dispatch-advisories.test.ts`（新增）：每个 advisory code 的触发/不触发、链顺序、空 advisory、run/版本基线 advisory、从不返回拒绝。
  - 自身 `角色卡/编排/docs/change/`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`app/**`、`test/桌面应用/**`、`src/common/shared/**`、`src/common/门禁引擎/**`、`src/model/**`、`src/provider/**`、`src/pipeline/**`、其他角色测试、`docs/scheduling|acceptance|communication|planning`、角色卡/边界。
- **公开契约（A1 退出冻结）**：`evaluateDispatchPreflight` 单一入口的输入/输出形状；`DispatchAdvisory`；`targetExists`；`chiefRoleId: string | null`；旧码表映射保留。任何后续变更须回编排重跑受影响证据。
- **可观察交付**：硬授权矩阵全表；每类旧状态检查对应的 advisory；`evaluateDispatchPreflight` 无第二份谓词/重复判定；`node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts` 通过；`npm run typecheck` 0；候选哈希/diff/status；契约冻结声明。

#### 桌面窗口（B1）

- **写集**：
  - `app/desktop/session.ts`：按方案 §5.3.3 与 §六的 R1/R2/R3 要求——`routeStarDispatch` 取 `targetRole`/`targetBuiltIn`/`targetExists`，`chiefRoleId` 允许 null（不误伤运营来源；listing 不可用时项目 worker 目标按硬 `target-card-missing` 拒绝，不猜）；保留 `chainDispatchFacts` 为 advisory 事实源、读失败按缺事实处理；run 状态读取/`ensureDraftRun`/`verifyPinnedRun`/`loadPinnedRoster` 改为尽力而为，带 flowId 时对所有目标 `ensureDraftRun`；**硬授权先于任何 run 账本写入**（R1）；删除 `runChangeRejectionForDispatch`/`dispatchFrozenConflictDetail` 及其调用点，保留 `proposalCardFrozenRejection`/`offerRunChangeOnFrozenContract` 与显式入口；版本基线违规改 advisory；handoff `:6245-6247` 早退与 pin 失败改 advisory 并跳过 pin（R2：有 draft 则任务锚定 draft/缺失，无 runManifest/flowId 则省略锚点）；`task.created` 锚点按 §5.5（draft 直接锚定；pinned 仅在校验通过、roster 成功、目标/模块覆盖时锚定；否则省略并记 advisory）；模块字段按目标区分（实现目标只在属主时写，verifier/合法验收目标模块存在即写 `moduleId`/`modulePaths`，文件型模块不写 `moduleDirectory`）；账本写入失败仍 fail；`planDispatchDelivery` 保留现有方式；投递成功后回执追加 advisory 摘要、`emitDeliveryNote` 一行「状态提示（未阻断）」、诊断按 code 记录；`evidenceScopeRoots` 按 R3 增加 taskId/creator 兼容匹配或 roster/角色边界回退，禁止无 flow 锚点时静默空 roots。
  - **测试更新（7 个既有文件）**：`test/桌面应用/chain-enforcement.test.ts`（硬负例不建行；状态缺失受理 + advisory；handoff 无 flowId/run 账本不可用；verifier 非属主模块元数据；文件型模块不写 `moduleDirectory`；报告路由/D3 版本用例保留）、`star-routing.test.ts`（硬拒/缺 D3 受理/无 handoff 受理/幂等）、`rejection-copy.test.ts`（硬 `target-card-missing` 文案；advisory 不走机械拒绝三段式）、`run-pin.test.ts`（pin 失败 handoff 受理；基线违规受理；直接 pin/manifest 用例不变）、`dispatch-fresh-enum.test.ts`（目标不存在硬拒；缓存刷新后受理）、`run-change-trigger.test.ts`（派发受理 + advisory、不再自动弹卡、显式入口/提案卡路径保留）、`run-change-entry.test.ts`（移除 `runChangeRejectionForDispatch` 源码钉；保留 `proposalCardFrozenRejection`、`requestRunChangeDecision`、显式入口与 `run-change-required` 码表钉）。
  - 自身 `角色卡/桌面窗口/docs/change/`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`app/desktop/` 其他文件（确需时停止回报）、`src/**`、`test/测试/**`、其他角色测试目录、`src/common/shared/**`、`docs/scheduling|acceptance|communication|planning`、角色卡/边界。
- **可观察交付**：硬拒绝不产生任务行/目标会话/新 draft run；状态缺失受理 + 回执/系统行/诊断；handoff 无锚点与 pin 失败口径；verifier 模块元数据；文件型模块不写 `moduleDirectory`；无 flow 锚点 verifier 证据范围正/负例；`node --test --test-concurrency=1` 7 个文件通过；`npm run typecheck` 0；候选哈希/diff/status。

#### 测试（B0/D1/D2）

- **写集**：`角色卡/测试/docs/change/` 证据；`test/测试/`（目录授权）默认**不新增**文件；若 P1 审核确认确需跨层集成用例，先回报统筹并在 `test/测试/` 内新增，保持目录授权、不越界。
- **B0**：记录 HEAD/工作树、Node/npm、`node_modules`/Electron、`npm run typecheck`、受影响套件与 T3 全量基线（允许按 §1.2 排除 `write-sequencing.test.ts` 并记录命令/原因）；确认无产品代码改动（除管理文档）；记录应用关闭与启动方式。
- **D1**：对 A1+B1 的同一候选跑方案 §8.1 受影响命令 + `test/桌面应用/**`、`test/编排/**` 补充 + **T3 全量回归** + `npm run typecheck`；计数/失败分类（既有 vs 新增）/候选哈希；**F4 只读核对**：确认 `src/pipeline/orchestration/run-role.ts` 未被修改，`git diff -U0 app/desktop/session.ts` 的 hunk 不触及 `redispatchTask`/`chooseRedispatchTarget`/重派路径，记录证据。
- **D2**：若环境可跑，执行 `node_modules/.bin/electron test/桌面应用/e2e/main.mjs`，记录 `E2E_PASS`/截图（关闭 DEBUG，记 sha256/候选/窗口尺寸/命令；**最多截图，不要求录屏**）；不可跑则如实记录原因并交验收判 `insufficient evidence`/N/A。
- **不写**：产品源码、其他角色测试、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。

#### 项目管理（P1 审核；i18n 条件参与）

- **P1（实现提案审核，闸门 2 + 实施授权后、A1/B1 写代码前）**：只读核对编排/桌面窗口的短实现提案与方案 P1.1、本计划 §六、Section 1、契约/调用方/证据影响；重点确认 **R1 调用协议**（硬授权先于 run 账本写入；单一公开入口；无重复谓词；对应测试）、**R2**（pin 失败 → draft/缺失；无 runManifest/flowId → 省略锚点）、**R3**（`evidenceScopeRoots` 回退优先级与 fail-closed）、写集/档位/测试迁移不弱化；输出 `recommend approval` / `needs revision` / `not ready` 审核记录（写自身已授权 docs）。
- **i18n（条件）**：仅当 P1 审核确认需要新 key 时，写 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 与 `test/项目管理/shared/i18n.test.ts`（中英成对、计数更新、无中文泄漏）；默认复用现有 `main.session.acceptedTask` + 中文 advisory 文本，不新增 key。
- **不写**：产品源码（除条件 i18n）、其他角色测试、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。

#### 人事（H1）

- 按闸门 2 确认，在 `角色卡/桌面窗口/boundary.md` 与 `boundary.yaml` 补登 **B-1** `test/桌面应用/run-change-trigger.test.ts`、**B-2** `test/桌面应用/run-change-entry.test.ts` 两个精确单文件条目（用途见 §4.6），并在桌面窗口根 changelog 记录；不改 id/显示名/职责描述，不扩其它权限，不重写 role-card。

#### 内置独立验收 / 统筹 / 沟通

- 内置独立验收：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（V1）、`docs/acceptance/dispatch-guardrail-relax-report-v1.md`（E2）；沟通另起唯一验收主上下文。
- 统筹：`docs/scheduling/`（本计划、`dispatch-guardrail-relax-change-v1.md` 变更包、memo）。
- 沟通：`docs/communication/` 闸门 2 记录、实施授权、R4 协调、提交/推送授权（另行）。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹；`docs/acceptance/`：内置独立验收；`docs/communication/`：沟通；`docs/planning/`：策划（R4 更正）；`角色卡/**` 角色卡/边界/YAML/changelog：人事。worker 不写这些路径。

### 4.5 工作量与范围预留

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 编排 | 3 个源码（含 1 新增）+ 2 个测试（含 1 新增）+ 证据 | A1 独占 `src/common/编排/workflow-preconditions.ts`、`dispatch-advisories.ts`、`mechanical-rejection.ts`、`test/编排/{workflow-preconditions,dispatch-advisories}.test.ts` |
| 桌面窗口 | 1 个源码 + 7 个测试 + 证据 | B1 独占 `app/desktop/session.ts`、`test/桌面应用/` 7 个列名文件（B-1/B-2 在 H1 后） |
| 测试 | B0 + D1 + D2 回归与证据 | B0/D1/D2 独占 `角色卡/测试/docs/change/`；`test/测试/` 默认不新增 |
| 项目管理 | P1 审核记录（+ 条件 i18n 2 源码 1 测试） | P1 只读审核；i18n 条件写 `src/common/shared/i18n/messages/`、`test/项目管理/shared/i18n.test.ts` |
| 人事 | 2 项边界条目 + 1 个根 changelog | H1（闸门 2 后） |
| 内置验收 | 1 标准 + 1 报告 | V1/E2 |
| 统筹 | 本计划 + 变更包 + memo | G2/E1/E3 |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；A1/B1 写集不相交但 B1 必须等 A1 冻结；任何角色不得写其他角色路径；同一文件同一时间只有一个写入者。

### 4.6 精确边界变更清单（闸门 2 对象，由人事执行）

| # | 角色 | 治理文件 | 变更内容（精确） | 现状与依据 | 性质 |
| --- | --- | --- | --- | --- | --- |
| B-1 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `boundary.yaml` | 新增精确单文件测试条目 `test/桌面应用/run-change-trigger.test.ts`，用途：派发受理后不再自动弹 run-change——受理 + advisory、客户卡请求数为 0、显式入口/提案卡路径保留；yaml 附 Delta 注释（如 `# --- Delta-DGR-1（2026-11-02，团队计划 §4.6；闸门 2）：test/桌面应用/ 补登 1 个既有精确测试文件（run-change-trigger），逐文件授权 ---`） | 两文件均未列该文件；`test/桌面应用/` 对桌面窗口是**逐文件授权**；方案 §7.3/§8.1 明确改造该测试 | 补登既有测试文件的逐文件授权；职责相同；不改 id/显示名；不扩其它权限 |
| B-2 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `boundary.yaml` | 新增精确单文件测试条目 `test/桌面应用/run-change-entry.test.ts`，用途：源码钉更新——移除 `runChangeRejectionForDispatch` 钉，保留 `proposalCardFrozenRejection`、`requestRunChangeDecision`、显式入口与 `run-change-required` 码表钉；yaml 附 Delta 注释（如 `# --- Delta-DGR-2（2026-11-02，团队计划 §4.6；闸门 2）：test/桌面应用/ 补登 1 个既有精确测试文件（run-change-entry），逐文件授权 ---`） | 两文件均未列该文件；逐文件授权；方案 §7.3/§8.1 明确改造该测试 | 补登既有测试文件的逐文件授权；职责相同；不改 id/显示名；不扩其它权限 |

- 人事执行后核对 md/yaml 一致、无其它未列改动、按角色根 changelog 记录本次补登与依据（团队计划 + 闸门 2 确认记录）；不重写 role-card、不改职责。
- **除 B-1/B-2 外没有其它边界变更**：`src/common/编排/dispatch-advisories.ts`、`test/编排/dispatch-advisories.test.ts` 在既有目录授权内；`app/desktop/session.ts` 与 `test/桌面应用/` 5 个既有测试在既有授权内；i18n 条件写也在项目管理既有目录授权内。
- **冲突检查结论**：逐项核对后**未发现不能隔离的方案/边界冲突**；现有缺口仅为 B-1/B-2 两个可隔离的逐文件授权补登。若实施中出现边界/方案不可隔离冲突，停止并回报统筹，不自行扩权。
- 若实施需要任何未列路径（含 `test/桌面应用/e2e/` 新建脚本、`src/provider/runtime/schema.ts`、角色卡文本等）：**停止**，回报统筹并重开闸门 2/方案评估；不得默认越界。

---

## 五、阶段、依赖与并行组

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、写集、B-1/B-2、T3、阶段顺序、验收安排、证据口径、实施授权边界）；实施授权记录（分开） | 本计划写盘 |
| IA | 实施授权 | 客户 → 沟通 → 统筹 | 客户实施授权记录；未给前不派发任何 worker | G2 |
| H1 | 边界变更 | 人事 | B-1/B-2 精确条目落地（md/yaml 一致）+ 桌面窗口根 changelog | G2 |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`：AC-1–AC-8 不弱化、T3 依据与升档条件、证据计划、判定规则、版本冻结；经沟通确认 | G2（可与 H1 并行；不依赖实施授权，但不得据此开始代码） |
| B0 | 基线 | 测试 | HEAD/工作树、Node/npm、Electron、typecheck、受影响套件与 T3 全量基线、应用关闭与启动方式、失败分类 | IA（可与 H1/V1 并行；P1 需 B0 完成后开始） |
| P1 | 实现提案与审核 | 编排 + 桌面窗口（提案）/ 项目管理（审核） | 两份短实现提案（调用协议、锚点规则、证据回退、写集、测试迁移）+ 项目管理审核记录（`recommend approval`/`needs revision`/`not ready`） | IA + V1 + B0；审核通过前不写代码 |
| A1 | 编排纯逻辑 | 编排 | `workflow-preconditions.ts` 硬授权 + `dispatch-advisories.ts` + `mechanical-rejection.ts` 文案 + 两个单测；typecheck；**契约冻结** | P1 审核通过 + B0 |
| B1 | 桌面接线 | 桌面窗口 | `session.ts` 接线 + 7 个测试更新；typecheck；候选哈希 | A1 冻结 + H1 + P1 |
| D1 | 跨角色回归 | 测试 | 方案 §8.1 受影响 + `test/桌面应用/**`/`test/编排/**` + T3 全量 + typecheck；计数/失败分类/候选哈希；F4 只读核对 | A1 + B1 |
| D2 | 真实 E2E | 测试（桌面窗口/桌面UI 只读支持） | `E2E_PASS`/截图/候选/命令，或如实记录不可用原因；最多截图、不要求录屏 | D1 |
| E1 | 变更包 | 统筹 | `docs/scheduling/dispatch-guardrail-relax-change-v1.md`：候选哈希、改动路径、节点、证据链接、T3、复用/失效说明 | D1 + D2 |
| E2 | 独立验收 | 内置独立验收 | `docs/acceptance/dispatch-guardrail-relax-report-v1.md`：AC-1–AC-8 逐项结论、R1/R2/R3/F4/R4 核对、T3 全量结论；通过/返工/证据不足 | E1 |
| E3 | 放行/回报 | 统筹 → 沟通 | 按匹配当前候选的结论记录/放行/回报；提交/推送/发布另行授权 | E2 |

### 5.2 依赖要点

- **必须串行**：G2 → IA（未给实施授权不派 worker）；IA → B0/P1（测试与实现提案）；B0 → P1 → A1/B1；H1/V1 可与 B0 并行，但 B1 必须在 H1 后；P1 审核通过 → A1 → B1；A1 冻结前 B1 不得写引用新契约的代码；B1 → D1 → D2 → E1 → E2 → E3。
- **可并行**：H1/V1（内置/人事）互不写同一路径；B0 可与 H1/V1 并行；A1 写集与桌面窗口完全隔离；D1 内 `test/编排/**` 与 `test/桌面应用/**` 可并行但必须基于同一候选；D2 与证据整理可并行，但 E1 必须等 D2。
- **不允许**：任何 worker 在闸门 2 + 实施授权前启动；B1 在 H1 前写 `run-change-trigger.test.ts`/`run-change-entry.test.ts`；B1 在 A1 冻结前写引用 `advisories`/`targetExists` 的代码；A1/B1 在 P1 审核通过前写产品代码；任何角色改 `redispatch` 路径、`task-state.ts` schema、`handback.ts` 运行文案、角色卡/边界或治理文档；并发写 `session.ts`/`workflow-preconditions.ts`/i18n。
- **共享文件单写者**：见 §3.5；角色名不同不代表写集不同，按精确路径预留。

### 5.3 各节点入口/出口条件（验收门与证据）

- **G2 入口**：本计划写盘。**出口**：闸门 2 确认记录覆盖本计划版本、参与角色、精确写集、B-1/B-2、T3、顺序、验收安排、证据口径、实施授权边界；实施授权另行齐备。
- **IA 入口**：G2 确认。**出口**：客户实施授权记录（与闸门 2 分开）；未给前不派发任何 worker。
- **H1 入口**：G2 确认。**出口**：B-1/B-2 在 md/yaml 一致落地；桌面窗口根 changelog 记录；无其它 diff；人事报告条目与哈希。
- **V1 入口**：G2 确认。**出口**：标准含 AC-1–AC-8 验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T3 依据与升档条件、R1/R2/R3/F4/R4 核对项、证据计划、判定规则、版本冻结；不弱于方案 §8.2；沟通确认路径/版本；未确认不派实施。
- **B0 入口**：IA。**出口**：基线命令/环境/计数/失败分类可复算；确认无产品代码改动（除管理文档与本计划）；记录应用关闭与启动方式、Electron/node_modules。
- **P1 入口**：IA + V1 经沟通确认 + B0。**出口**：两份实现提案明确 R1 调用协议、R2 锚点、R3 证据回退、写集、测试迁移、i18n 是否需要；项目管理审核结论为 `recommend approval`；否则回到提案所有者修订后复审。
- **P1 顺序说明**：按本次任务硬约束（闸门 2 确认与客户实施授权前不得派发任何 worker），P1 实现提案审核安排在实施授权之后的实施阶段最前，而不是在申请实施授权之前；客户实施授权基于已确认的 P1.1 方案，P1 只核对实施口径/写集/测试，不改变产品语义。若 P1 发现方案/写集/档位实质变化，停止并回报客户，必要时重开闸门 1/2。
- **A1 入口**：P1 审核通过 + B0。**出口**：硬授权/advisory/文案落地；两个单测通过；`npm run typecheck` 0；候选哈希/diff/status；**契约冻结声明**。
- **B1 入口**：A1 冻结 + H1 完成 + P1 审核通过。**出口**：session 接线与 7 个测试更新；受影响套件通过；`npm run typecheck` 0；候选哈希/diff/status；写集外改动=无。
- **D1 入口**：A1+B1 退出。**出口**：方案 §8.1 命令全过；`test/桌面应用/**`/`test/编排/**` 补充结果；T3 全量回归计数/失败分类（新增确定性失败=0、新 skip=0）；typecheck 0；F4 只读核对；候选哈希。
- **D2 入口**：D1 退出。**出口**：`E2E_PASS`/截图/候选/命令，或如实记录不可用原因（AC-6.4）；不把不可用写成通过。
- **E1 入口**：D1 + D2。**出口**：变更包候选可复算、路径/节点/证据/T3 齐全。
- **E2 入口**：E1。**出口**：AC-1–AC-8 逐项结论、R1/R2/R3/F4/R4 核对、总体通过/返工/证据不足。
- **E3 出口**：只表示当前候选满足标准；不授权提交/推送/发布。

### 5.4 失败、返工与恢复

- 失败阻止依赖节点；独立且已授权工作可继续（如 H1/V1/B0/P1 之间互不阻塞）。
- 返工交原所有者（产品代码归编排/桌面窗口；共享 i18n 归项目管理；测试复测）；验收结论不由统筹改写。
- 候选/契约/标准/边界变化使受影响证据失效：回到待做/返工，不得只改哈希让旧证据冒充当前结果。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。
- P1 审核发现方案/写集/档位实质变化：停止实施，回报统筹 → 沟通 → 客户；必要时重开闸门 1/2。

---

## 六、F4 与 R1–R4 处置（实施要求）

> 本节是统筹对闸门 1 已披露未关闭项的处置安排；不改变 P1.1 的客户确认语义，只把实施口径与验证要求固定下来。

### 6.1 R1：单一入口与调用时序（必须在 P1 实现提案审核中明确）

**问题（复核 R1）**：方案 §5.1/§5.3.1 说 `evaluateDispatchPreflight` 是单一公开入口、`ok:true` 返回 `advisories`；§5.2 数据流把硬授权画在事实收集与 run 记账之前，§5.3.3 却把调用点写在 `session.ts:6180-6222`（run 记账 `:6150-6178` 之后）。按后者，硬拒绝（如运营→产品但带 flowId）仍可能先产生/领养 draft run。

**团队计划要求（A1/B1 必须遵守，P1 审核逐项确认）**：

1. **硬授权先于 run 账本写入**：任何硬拒绝必须在 `ensureDraftRun`/`pinRun` 等 run 账本写入之前完成；硬拒绝不得产生任务行、不得打开目标会话、不得产生/领养新的 draft run。run 只读（`findActiveRun`/`verifyPinnedRun`/`loadPinnedRoster`）可在硬授权通过后进行。
2. **硬授权所需事实最小化**：来源/目标 id、`targetBuiltIn`、`targetExists`、`chiefRoleId`/`convenerRoleId`；这些在 `refreshListingNow` + 目标信息（`session.ts:6130-6137`）后即可得到，不依赖 chain facts 或 run 读取。
3. **单一公开入口不变**：`evaluateDispatchPreflight` 仍是唯一公开入口；若实现需要在硬授权前单独调用窄步骤，必须由 `workflow-preconditions.ts` 同一模块导出或由入口内部复用，不得出现第二份谓词/重复判定逻辑；实现提案必须给出最终调用图（硬授权 → 事实 → run 只读/记账 → advisory → task.created）。
4. **advisory 不反向影响硬授权**：状态事实/run 读取失败按缺事实 → advisory，不抛到调用方；advisory 计算不得把 `ok:true` 变 `ok:false`。
5. **测试**：至少覆盖——
   - 硬拒绝（运营→非质检内置且带 flowId；幕僚→项目 worker；自派；未知来源）不产生 `tasks.jsonl` 行、不打开目标会话、**不产生/领养 draft run**（可注入/观察 `ensureDraftRun` 未被调用，或断言 run 目录/账本无新记录）；
   - 硬授权通过、状态缺失时受理 + advisory + 任务行 + 投递；
   - 调用顺序测试（session 集成或对导出窄步骤的单测）证明硬授权先于 run 记账；
   - 既有 `run-required` 正例（有 flowId 时保证 run 锚点）不回归。
6. **P1 审核关口**：项目管理审核未确认 R1 协议与上述测试前，A1/B1 不得写产品代码；统筹不代替该审核。

### 6.2 R2：pin/draft 锚定口径（写入实现要求）

- **pin 失败**（handoff 时缺 D3/缺文档/pin 失败/pin 后校验失败）：派发受理；任务可锚定**已有 draft run**（`runId`/`runState: "draft"`），不得伪造 pinned；不得把校验失败的 pinned run 作为锚点；记 `run-pin-failed`/`run-pin-required` 等 advisory。
- **无 runManifest / 无 flowId（handoff `session.ts:6245-6247` 早退）**：派发受理；任务**省略** run/flow 锚点；记 `run-ledger-unavailable`（无 runManifest）或 `run-pin-required`（有 draft 未 pin）；`stepId=project-handoff` 仍写，`handoffFound` 仍可按 stepId 识别。
- 方案 §4.2 的 advisory 触发说明按上述口径实现（`run-ledger-unavailable` 覆盖 handoff 无 flowId/无 runManifest；`run-pin-required` 覆盖 handoff pin 失败/早退），不把「pin 失败」笼统写成「任务省略锚点」。
- 测试：`run-pin.test.ts` 覆盖 handoff 无 flowId、runManifest 缺失、pin 失败三类；断言受理、锚点符合上述规则、不伪造 pinned、不触发 run-change 卡。

### 6.3 R3：`evidenceScopeRoots` 回退优先级（写入实现要求）

- **优先级**：① 任务自身 `modulePaths`（按 `taskId`/creator 兼容匹配，覆盖无 flow 锚点的 verifier 任务）→ ② 适用的 roster 模块根（pinned roster 仅在锚定时用；否则最新 roster）→ ③ 角色边界根**仅作最后兜底**，需限定到模块/角色相关范围并记录来源；都没有 → **fail-closed**，不把模块外物证算作模块证据。
- 不得因省略 flow 锚点让 verifier 任务的 `scopeRoots` 静默变空而拒绝所有物证；也不得用无边界的角色边界根放宽验收证据范围。
- 测试：`chain-enforcement.test.ts`（或新增既有授权内的用例）覆盖——无 flow 锚点的 verifier 任务仍以 `modulePaths` 贡献证据根（正例）；模块外物证不被接受（负例）；角色边界兜底需可核对/记录。
- 桌面窗口在 B1 实现；P1 审核确认口径；V1 验收把 R3 正/负例列为核对项。

### 6.4 R4：方案 §13 引用与「未解决意见」表述（文档更正安排）

- **执行者**：策划作者（`docs/planning/` 所有者）；由沟通协调在**提交前/实施前**完成。
- **内容**：把方案 §13（`2026-11-02_design_dispatch-guardrail-relax.md:853-875`）的复核记录引用从 P1.0 快照（101 行 / `232c4b1c…`）更新为当前复核记录（150 行 / `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5`），并如实写明未决项：F4 部分采纳未关闭（O7 后续）+ R1–R3 一致性问题；不得改已确认的方案语义、Q1–Q5、AC 或写集。
- **性质**：文档更正（R4 建议），不是方案实质修订；若更正触及任何规范内容，停止并按方案 §9.3 重开闸门 1。
- **基线映射**：实施与验收仍以闸门 1 确认的 P1.1 语义（`54da5d31…`）为基线；更正后的方案哈希须在 P1/变更包中记录为「编辑性更正版」，V1/验收引用两者并注明关系，不把新哈希当作新语义确认。
- **备用**：若策划上下文在实施前无法启动，实施方只能在自身变更记录中引用正确复核快照并把方案 §13 更正列为遗留文档项交策划；不得自行改 `docs/planning/` 或声称方案已更新。

### 6.5 F4：`redispatch_task` 不并入本任务（留 O7）

- 本任务**不改** `redispatch_task`（`src/pipeline/orchestration/run-role.ts:1280`）、`redispatchTask`/`chooseRedispatchTarget`（`app/desktop/session.ts:4324-4330`、`:4476-4620` 一带）的目标选择与授权语义；O7 留作后续独立事项，若客户要求纳入硬矩阵须重开闸门 0/1。
- **只读核对**（D1）：`git diff` 确认 `src/pipeline/orchestration/run-role.ts` 无改动；`app/desktop/session.ts` 的 diff hunk 不触及 `redispatchTask`/`chooseRedispatchTarget`/重派相关区域；在证据中记录核对命令与结果。
- 验收把 F4 作为**已披露未关闭项**记录（不因本任务未修而判失败；但若本任务意外改动该路径则按越权/方案偏差判返工）。

---

## 七、验收安排与证据要求

### 7.1 实施前完成标准（V1）

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、实施前；沟通另起**唯一验收主上下文**；需要并行取证时按既有规则启动 0–4 个只读取证子上下文（主上下文不计数；子上下文只取证、不判断、不产生第二结论）。
- **路径**：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`。
- **基线**：客户闸门 1 确认的 P1.1（877 行 / `54da5d31…`）+ 闸门 0 意图记录；团队计划只作范围/写集/阶段/证据口径依据，不是标准来源。
- **内容**：AC-1–AC-8 验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T3 依据与升档条件、选定检查、消费者重测与证据复用规则、pass/fail/insufficient evidence/not applicable 判定规则、成功/失败/边界情形、证据失效规则、版本冻结规则；必须包含 **R1 调用协议测试、R2 锚点、R3 证据回退正/负例、F4 只读核对、R4 文档更正状态**的核对项；不得弱于方案 §8.2。
- **冻结**：实施开始后不改标准适配候选；确需变更递增版本并交沟通/统筹确认。

### 7.2 验收门与阶段放行

- 每个节点按 §5.3 的出口交付证据；统筹只在**匹配当前候选、客户确认的 P1.1 语义、V1 标准**的有效验收结论出现后记录完成并释放依赖；不接受完成报告/进程退出代替验收。
- 变更包（E1）必须包含：候选哈希（产品/测试；`git hash-object` + `sha256sum`）、改动路径、任务节点 G2–E3、证据链接、风险档位 **T3**、复用证据与失效说明。
- 独立验收报告（E2）首行必须含：风险档位、判定依据、选定检查、复用证据、消费者重测结论、T3 全量回归（已执行或 N/A + 理由）；结论只能是**通过 / 返工 / 证据不足**。
- 验收通过只表示当前候选满足 V1，不授权提交/推送/发布。

### 7.3 证据要求

1. **通用（每个实施角色）**：写前基线（目标文件 `git hash-object` + `sha256sum`、HEAD、`git status --short`）；候选身份（逐文件 before/after blob + sha256；新增文件同）；改动范围（`git diff --name-only`/`status` 在写集内、`git diff --cached` 为空）；原始检查输出（命令、退出码、环境、测试计数 pass/fail/skip/todo、失败原文）；跳过项原因；状态写 `implemented-unverified`；不 commit/push；不改断言保绿；不新增 skip；Windows 既有失败按 B0 分类。
2. **逐角色最低检查命令**：

| 角色 | 命令 | 证据 |
| --- | --- | --- |
| 编排 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts`；`npm run typecheck` | 硬授权矩阵；每个 advisory code；链顺序；无拒绝返回；既有断言变更逐条列明；候选哈希 |
| 桌面窗口 | `node --test --test-concurrency=1 test/桌面应用/chain-enforcement.test.ts test/桌面应用/star-routing.test.ts test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts test/桌面应用/run-change-trigger.test.ts test/桌面应用/run-change-entry.test.ts test/桌面应用/dispatch-fresh-enum.test.ts`；`npm run typecheck` | 硬拒无任务行/会话/draft run；状态缺失受理 + advisory；handoff 无锚点；verifier 模块元数据；文件型模块；R3 正/负例；候选哈希 |
| 测试（B0） | 受影响套件 + T3 全量基线 + `npm run typecheck` | 基线计数/失败分类/命令/环境；确认无产品改动 |
| 测试（D1） | 方案 §8.1 全部命令 + `test/桌面应用/**`、`test/编排/**` 补充 + T3 全量回归（排除 `write-sequencing.test.ts` 并记录）+ `npm run typecheck`；F4 只读核对 | 计数/失败分类/候选哈希；新增确定性失败=0、新 skip=0；排除命令与既有验收依据；F4 diff 证据 |
| 测试（D2） | `node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（若可跑） | `E2E_PASS`/截图（关闭 DEBUG、sha256、候选、窗口尺寸、命令）；不可用原因；最多截图、不录屏 |
| 项目管理 | P1 审核记录；条件 i18n 时 `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts` + typecheck | 审核结论；i18n 中英成对/计数/零泄漏 |
| 人事 | md/yaml 一致性检查 | B-1/B-2 条目/changelog/哈希 |

3. **T3 全量回归口径**：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；`write-sequencing.test.ts` 为既有已知挂起，按 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 允许排除但必须记录命令/原因。新增确定性失败必须为 0；既有失败逐条列出。
4. **E2E 与截图**：按 2026-10-27 客户规则**最多截图，不得要求/提供录屏**；截图来自当前候选真实运行、关闭 DEBUG 覆盖层；记录 sha256、候选版本、拍摄命令/窗口尺寸；不可跑时如实记录。
5. **F4 只读核对**：`git diff --name-only` 确认 `src/pipeline/orchestration/run-role.ts` 未改；`git diff -U0 app/desktop/session.ts` 的 hunk 不覆盖 `redispatchTask`/`chooseRedispatchTarget`/重派路径；结果写 D1 证据。

---

## 八、闸门 2 待客户确认项

1. **参与角色**：编排（A1 硬授权/advisory/文案/单测）、桌面窗口（B1 session 接线 + 7 个桌面测试）、测试（B0/D1/D2 回归与证据）、项目管理（P1 实现提案审核；i18n 条件参与）；人事（H1 B-1/B-2）；内置独立验收（V1/E2）；统筹（计划/派发/收证/变更包）；沟通（闸门/实施授权/回报）。**不参与**：产品/宣传/UIUX设计师/Claude适配器/Codex适配器/Pi适配器/运行时核心/门禁引擎/装配/项目 `角色卡/独立验收` worker。
2. **精确写集**：编排 `src/common/编排/workflow-preconditions.ts`、新增 `dispatch-advisories.ts`、`mechanical-rejection.ts`、`test/编排/workflow-preconditions.test.ts`、新增 `test/编排/dispatch-advisories.test.ts`；桌面窗口 `app/desktop/session.ts` + 7 个 `test/桌面应用/*` 列名文件；测试不写产品/其他角色测试（默认不新增 `test/测试/` 文件）；项目管理 P1 审核记录 + 条件 i18n `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`/`test/项目管理/shared/i18n.test.ts`；任何其它路径不在写集。
3. **边界变更 B-1/B-2**：桌面窗口 `boundary.md` + `boundary.yaml` 补登 `test/桌面应用/run-change-trigger.test.ts`、`test/桌面应用/run-change-entry.test.ts` 两个逐文件测试条目（用途见 §4.6）；**无**新增/拆分/合并角色、无 id/显示名/职责描述变更、无其它权限扩大。
4. **风险档位**：**T3**（治理/权限/派发受理语义变更）；验证按 §1.2/§7.3：受影响层测试 + 跨角色回归 + T3 全量 + `npm run typecheck` + 可跑 Electron E2E；最多截图、不录屏；不压档。
5. **阶段顺序**：G2 → IA → H1/V1/B0（并行）→ P1 → A1 → B1 → D1 → D2 → E1 → E2 → E3；契约先行（A1 冻结）、共享文件单写者；B1 必须在 H1 后、A1 后。
6. **验收安排**：内置独立验收；V1 在实施前按 P1.1 写盘（沟通另起唯一验收主上下文）、AC-1–AC-8 不弱化；E2 判定通过/返工/证据不足；R1/R2/R3/F4/R4 核对项必须进入 V1。
7. **实施授权与闸门 2 分开**：客户可先确认角色/写集/边界/档位/顺序/验收安排，再另行给实施授权；本计划写盘后不派发，直到闸门 2 + 实施授权 + V1 经沟通确认 + H1 边界条目落地 + 逐角色预留完成。
8. **F4/R1–R4 处置**：F4 不改 `redispatch_task`，留 O7（后续独立事项，重开闸门 0/1）；R1 调用协议与测试见 §6.1，P1 审核确认；R2 锚点见 §6.2；R3 证据回退见 §6.3；R4 由策划作者在提交前更正 §13 引用与未决项表述，不改方案语义（§6.4）。
9. **选装与非目标**：O1/O5/O7 作为后续独立事项、本任务不实施；O2–O4/O6 暂不做；`planDispatchDelivery` 契约引用缺失继续拒投；与已取消的 run-change-auto-approve / full-report-display 无关。
10. **证据口径**：未启用 task_ops（无 `.ans/project.json`）；以文件哈希、原始命令输出、diff/status、T3 全量计数/失败分类、可跑 E2E 截图/结果为证据；不 commit/push；管理记录不混入产品候选。
11. **基线**：HEAD `c80f494`；若实施前需 rebase/合并 main，先重记基线并确认不改变 P1.1 锚点与证据口径。
12. **条件写与越界规则**：i18n 仅在 P1 声明需要新 key 时由项目管理按既有目录授权写；任何未列路径（含 `src/provider/runtime/schema.ts`、角色卡、`test/桌面应用/e2e/` 新脚本）必须停止并重开闸门 2/方案评估，不得默认越界。

---

## 九、风险、开放点与不一致点

### 9.1 主要风险

1. **R1 调用时序副作用**：若硬授权仍发生在 run 记账之后，硬拒绝仍可能产生/领养 draft run，违反「拒绝不产生任务」语义。缓解：§6.1 固定协议 + P1 审核 + 专项测试（硬拒绝不产生 draft run）。
2. **R2 锚点口径不清**：pin 失败与无 runManifest/flowId 混写会导致实现/测试断言错误。缓解：§6.2 拆分口径 + 三类 handoff 测试。
3. **R3 证据范围放宽**：角色边界根过宽可能把模块外物证算作模块证据，或空 roots 拒绝所有物证。缓解：§6.3 优先级 + fail-closed + 正/负例。
4. **F4 未关闭**：`redispatch_task` 仍可把任务改派给项目 worker，形式上绕开硬矩阵；本任务只披露 + 只读核对，O7 后续。若客户要求本次纳入，需重开闸门 0/1。
5. **R4 引用与哈希漂移**：方案 §13 仍引用 P1.0 快照且称「未解决意见：无」；策划更正文案会改变方案哈希。缓解：§6.4 只做编辑性更正，V1/变更包同时记录确认版与更正版关系。
6. **测试迁移量大**：可能出现删测试/放松断言。缓解：方案 §7.3 逐条映射、AC-6.1、独立验收核对 diff 与测试数量、D1 记录新 skip=0。
7. **T3 全量环境失败**：Windows symlink EPERM 等既有失败可能被误算；`write-sequencing.test.ts` 为既有挂起。缓解：B0 基线分类、排除命令/原因记录、D1 区分既有/新增。
8. **E2E 可运行性**：Electron E2E 在 Windows 上可能受环境/时序影响。缓解：B0 实测，D2 可跑则取证、不可跑如实记录（AC-6.4），不伪造。
9. **i18n 条件写**：新 key 可能导致 `i18n.test.ts` 计数红线/中文泄漏。缓解：默认不新增 key；确需时 P1 声明、项目管理中英成对并更新计数。
10. **共享文件并发写**：`session.ts`、`workflow-preconditions.ts`、i18n 是热点。缓解：单写者预留、A1 先冻结、B1 后接线，不并发。
11. **无 task_ops**：不伪造机器状态/凭证；证据以文件与原始输出为准。
12. **边界补登前越界**：B-1/B-2 未落地时写两个 run-change 测试会越权。缓解：H1 前禁止 B1 写这两个文件。

### 9.2 开放点

1. **R1 最终 API 形状**：由 A1 实现提案在 §6.1 协议内确定（单一入口内部拆分 vs 同模块窄步骤导出），P1 审核确认；不得复制谓词。
2. **R4 更正形式与时机**：P1.2 编辑性修订或在方案追加更正记录，由策划作者决定；沟通确认其不改变语义；方案哈希映射写入变更包/V1。
3. **E2E 实际可运行性**：由 B0 实测；D2 取证或记录不可用原因。
4. **i18n 是否新增 key**：默认否；P1 审核时按方案 §5.1 与现有中文追加文本惯例决定。
5. **基线是否 rebase/合并 main**：若实施前 main 前进且客户要求同步，重记基线并确认不改变 P1.1 锚点。
6. **F4/O7 边界**：O7 后续是否立项由客户决定；本任务不预设。

### 9.3 与方案写集/角色标签的不一致点（如实记录）

1. **方案 §7.3/§8.1 的测试归属**：方案按「编排纯逻辑/桌面集成」列测试，未写角色归属；按实际 Section 1，`test/编排/` 属编排、`test/桌面应用/` 对桌面窗口是**逐文件授权**、`test/测试/` 属测试。本计划按实际边界分配（编排/桌面窗口/测试），写集不因此扩大；若客户要求把 `test/桌面应用/**` 交给测试角色，需先扩测试角色边界并重开闸门 2（不推荐）。
2. **方案 §5.1 的 i18n「如需要」**：实际 `src/common/shared/i18n/messages/*` 的 owner 是项目管理；本计划默认不新增 key，确需时由项目管理按既有目录授权写（不新增边界）。
3. **方案 §5.2 与 §5.3.3 的 R1 时序不一致**：按 §6.1 固定为「硬授权先于 run 账本写入、advisory 不反向影响硬授权、单一公开入口」；不改变方案的产品语义，只落实实施调用协议。
4. **方案 §5.4/§4.2 的 R2 表格不一致**：按 §6.2 拆分「pin 失败 → draft/缺失」与「无 runManifest/flowId → 省略锚点」；不改变 AC-3.2/AC-3.3 语义。
5. **方案 §5.3.3 的 R3 回退**：按 §6.3 定义优先级与 fail-closed；不改变 AC-5.6 语义。
6. **方案 §13 的 R4 引用**：按 §6.4 由策划作者编辑性更正；不改 Q1–Q5/AC/写集。
7. **方案 §1.4/O5 的 `src/provider/runtime/schema.ts:515-519`**：属 O5 后续独立事项，本任务不写；不把工具描述当已实现行为。
8. 除上述标签/时序/引用校正外，方案 §5.3/§8 的路径、写集性质与非目标与团队判断一致；无其它写集不一致。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`）；统筹 memo 续接线索。
- **未确认**：闸门 2（参与角色/写集/B-1/B-2/T3/顺序/验收安排/证据口径/实施授权边界）与客户实施授权。
- **未写盘**：实施前验收标准（由内置独立验收在闸门 2 后写 `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、E2E、提交、推送、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未联系客户。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权 → 内置独立验收写 V1（沟通另起验收主上下文）→ 人事执行 H1 → P1 实现提案审核 → 按 §五顺序派发。若客户改变方案/写集/边界/档位或未关闭项处置，重开闸门 1/2；本上下文不自行判断客户同意，不扩大授权。
