# 团队计划：验收返工自动路由与 rejected 重新派发（acceptance-rework-routing）

- **任务 ID**：`2026-10-23-acceptance-rework-routing`｜**产品 flowId**：`acceptance-rework-routing`（任务标签）
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色）｜**日期**：2026-10-23
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/flow/账本/沟通记录/验收文档**
- **闸门 0/1 记录**：[`docs/communication/2026-10-23_intent_acceptance-rework-routing.md`](../communication/2026-10-23_intent_acceptance-rework-routing.md)（闸门 0 已确认；「闸门 1 确认记录（2026-10-23）」客户原话「确认方案 v1，按推荐 Q1–Q13 A；O1–O4 不做。方案确认不等于实施授权，闸门 2 另行确认。」）
- **客户确认的策划方案**：[`docs/planning/2026-10-23_design_acceptance-rework-routing.md`](../planning/2026-10-23_design_acceptance-rework-routing.md) **方案 v1**（951 行；SHA-256 `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5`）
- **风险档位**：**T3（治理行为、验收结果路由、派发与 flow 收口语义变更）**；目标版本 **v1.7.0**，发布前完成独立 T3 验收
- **记录性质**：不是 `task_ops` 机器状态；本项目没有 `.ans/project.json`（`.ans/` 仅 `sessions/`）；不伪造任务令牌、审批、锁或机器预检。
- **当前停点**：交沟通向客户确认**闸门 2**；客户另行给出**实施授权**前不派发。本计划**写盘不等于派发，也不等于实施**。本变更与 i18n、目录 v3、治理写卡门禁分别闸门、分别实施、分别验收，不合并。

---

## 一、任务、档位与基线

### 1.1 任务与目标（方案 v1 / Q1–Q13 A / O1–O4 不做）

1. **非通过时转交协调者**：客户 reject、judge 代批 reject、judge deny/manual auto-rework 时，应用把验收报告、结构化返工清单、决定/判断来源交 Steward / 统筹（Convener）；Proof 继续独立，不修产品、不直接派发。
2. **只 accepted 收口**：最新 acceptance 决定是 accepted 才收口；rejected 是「待返工」，不再被 `hasAcceptanceDecision` 当作永久收口。
3. **报告结构化段**：验收报告增加恰好一个 fenced YAML 段，schema `acceptance-rework/v1`（`coordinator` + `items[{id,owner,action,evidence}]`）；严格校验、单 owner、跨 owner 拆项、64 项/32KB 上限；缺段/坏段只走人工兜底，不解析自由文本。
4. **重派门**：rejection/路由后 flow 有实质更新、执行步骤全 done、`verification` pending、同内容未派 ⇒ 恰好重派一次 Proof；无新进展、同 flow 内容、`verification` 进行中 ⇒ 不派，避免热循环。
5. **rejected 重开**：新增 app-only `reopenAcceptanceStepForRework`，只把 `verification` 从 dispatched/delivered 安全重开为 pending 并清旧证据；done/终态拒绝；不新增枚举、保留 id、角色工具或写权。
6. **措辞如实**：judge 来源写「自动决策未通过/未完成」，任何 judge 来源不得出现「客户拒绝」；客户手拒才写「客户拒绝」；`notPresented`/`unavailable` 语义不变。
7. **不扩权**：客户最终 accept/reject 权不变；不新增 `cardKind`/`FlowStepKind`/`Power`/`Decision`；不改 CLI、发布配方、打包、版本号；不改目标项目。

### 1.2 非目标

- 不修改、不代写 `ans-gateway` 的 flow/账本/报告/角色卡/任何项目文件；目标项目只读复算，**零写入**。
- 不自动 accept/reject；不把「报告不通过」直接当客户拒绝；不伪造 `customer.decision`。
- 不做 O1（app-only `addFlowStep`）、O2（改 Convener/Verifier 卡文本）、O3（legacy 接 mtime/record 重派）、O4（验收卡采集客户文字理由）。
- 不新增角色工具、不扩 `AdapterCapabilities`、不改 `flow_step_update`/`flow_step_supersede` 参数或权限。
- 不与 i18n、目录 v3、治理写卡门禁合并验收；不引用它们的验收结论替本变更背书。
- 不提交、不推送、不合并、不发布。

### 1.3 T3 依据

本变更改变应用对验收决定、返工路由、flow 收口与重新派发的判定，涉及跨角色契约、编排公共出口、桌面治理行为与系统行；即使不扩权也按治理变更取 **T3**。T3 默认验证为适用全量回归 + 治理/共享抽象检查 + 真实 Electron；不因「只改文案/文档」降档。

### 1.4 基线（2026-10-23 写计划时实测）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `main` / `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树既有改动 | i18n（变更 A，T2）、目录 v3（T3）、治理写卡推进（T3）均已实施并有独立验收报告判定「通过（当前候选）」，但**均未提交**；另有 `docs/*/memo.md` 修改与管理文档未跟踪。以上是**既有上下文**，不是本变更候选，本计划不改变其结论 |
| 本变更目标文件现状 | `src/common/编排/flow-state.ts`、`test/编排/flow-state.test.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/tools.test.ts` 与 HEAD 一致；`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`app/desktop/{customer-input,interface,governance-advance}.ts`、`app/main.ts`、`test/编排/flow-service.test.ts`、`test/桌面应用/{acceptance-dispatch,interface,operator-wiring}.test.ts`、`test/桌面应用/e2e/main.mjs` 已被上述既有变更修改（未提交）。S1 必须逐文件记录 `git hash-object` + `sha256sum` 基线 |
| i18n 现状 | `src/common/shared/i18n/` 与 `messages/{zh-CN,en-US}.ts` 已由 i18n 候选建立（未提交）；`test/项目管理/shared/i18n.test.ts` 有 zh/en key 全集 parity；新增系统行 key 由项目管理写入两份目录 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不建立第二份机器状态 |
| Node/npm | 当前 shell PATH 不含 node/npm；按既有流程加入 PATH 后记录实测版本（上轮 Node v24.22.1 / npm 11.19.1，以实测为准） |
| 测试 runner | `node --test`；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；真实 Electron `test/桌面应用/e2e/main.mjs`；不新增 runner/配置 |
| 最近全量基线 | `governance-advance-redispatch-report-v1`：356 文件（排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`）、3693/3666/9/18；9 项均为既有 Windows symlink EPERM。S1 **必须重新实测**，不直接沿用 |
| 目标项目 | `ans-gateway` 只读快照 A：480 条账本、38 步、flow SHA-256 `51e9a98b…`；唯一 acceptance 决定为 2026-10-23T08:05:01.066Z rejected；报告 v1/v2 均无机器可读段；现场仍在漂移（快照 B），实施/验收时重新只读复算 |
| 验收基线 | 客户闸门 1 确认的方案 v1（951 行；SHA-256 `9ceea642…`）；正式标准由内置独立验收在实施前基于同一版本另写 |

### 1.5 闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）** | `docs/communication/2026-10-23_intent_acceptance-rework-routing.md` |
| 闸门 1：方案确认 | **已确认（2026-10-23，方案 v1，Q1–Q13 A，O1–O4 不做）** | 同文件「闸门 1 确认记录（2026-10-23）」 |
| 闸门 2：角色指派/写集确认 | **未确认** | 本计划 §八；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发、不改代码 |
| 实施前验收标准 | 未写盘 | 内置独立验收在闸门 2 后、实施前写 `docs/acceptance/acceptance-rework-routing-criteria-v1.md` |

**三个事实**：本计划写盘 ≠ 派发 ≠ 实施；闸门 2 确认角色/写集/顺序/验收安排，**不等于实施授权**；实施授权由沟通在闸门 2 后另行取得。

---

## 二、五维判断与决策表

### 2.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 这是验收治理行为变化，横跨既有分层：决定语义/重开/报告解析归编排；回调/路由/记录/重派门/系统行归桌面窗口；declined 措辞归运行时核心；系统行 key 归项目管理（shared 唯一属主）；跨角色 e2e/T3/Electron/目标复算归测试。没有产生需要不同知识与契约的新独立责任 |
| 2. 范围归属 | **现有 Section 1 覆盖；无角色/边界变更** | 方案 §7 路径逐文件映射（§三、§六）；`src/common/编排/`、`test/编排/`、`app/desktop/`、`test/桌面应用/` 既有精确文件、`src/provider/runtime/tools.ts`、`test/runtime-core/`、`src/common/shared/`、`test/项目管理/shared/`、`test/测试/` 均有 owner。唯一需说明的是 `app/main.ts` 的**角色标签校正**（方案文本标装配，权威 Section 1 属桌面窗口），不是边界扩张 |
| 3. 契约影响 | **有，跨层公共出口与治理语义** | 新增 `latestAcceptanceDecision`/`parseAcceptanceReworkReport`/`reopenAcceptanceStepForRework` 经既有 `src/pipeline/orchestration/flow-state.ts` 公共出口；报告 schema `acceptance-rework/v1`、routing record `acceptance-rework-routing/v1`、重派门与 `acceptanceLastDispatchAtMs` 收窄是跨层契约。单一主属：解析/flow 写入 → 编排；桌面消费/路由/去重/文案 → 桌面窗口；措辞 → 运行时核心；i18n key → 项目管理；e2e → 测试。编排先冻结，桌面再消费 |
| 4. 证据独立性 | **已满足** | 各开发角色跑自己的单元/层测试；测试角色独立跑 e2e、T3 全量、真实 Electron、目标项目只读复算；内置独立验收按实施前标准判定。实施者不自验产品，统筹不改验收结论 |
| 5. 协调成本 | **维持现有团队最低** | 5 个现有 worker（编排、桌面窗口、运行时核心、项目管理、测试）+ 内置独立验收 + 统筹；不新增角色，不启用装配/门禁引擎/桌面UI/人事。新增专职「返工路由」角色会增加建卡、边界、交接与证据成本，而本轮没有新的持续独立责任 |

### 2.2 决策表结果

**不变，派给现有角色。**

- **无新增、无拆分、无合并、无角色卡改动、无边界变更。**
- 参与 worker：**编排、桌面窗口、运行时核心、项目管理、测试**；**内置独立验收**写标准与报告；**统筹**写计划/变更包/调度记录。
- **不启用装配**：`app/main.ts` 在权威 `角色卡/桌面窗口/boundary.md` Section 1（单文件），不在 `角色卡/装配/boundary.md`；方案 §6.1/§7.1 把它归到「装配」是角色标签不一致，本计划按权威边界派给桌面窗口，装配不写任何文件。
- **不启用人事**：无角色/边界变更，无需写卡。
- **不启用门禁引擎**：Q1–Q13 A、O1–O4 不做，不改角色卡文本、枚举、写边界；Convener 现有 `flow_step_supersede`/`dispatch_task` 足够。
- **不启用桌面UI**：`app/renderer/**` 不改；系统行沿用现有聊天流与 Markdown 渲染，报告结构化段按代码块显示。

### 2.3 条件项（不是默认，触发即停止回报）

1. 若实施确实需要的新文件不在已授权目录内（例如 `test/桌面应用/` 新文件）：该目录对桌面窗口是**逐文件授权**，触发改边界；停止回报，交 ANS 人事按闸门 2 额外确认补精确单文件条目。本计划默认**不新建**该目录文件。
2. 若 `test/桌面应用/e2e/main.mjs` 需要超出既有自检台的定向扩展：该文件虽是桌面窗口既有单文件，仍须在 S1 说明并只做最小追加，保持既有检查；不得删除断言或把平台性失败改成通过。
3. 若发现 Q5 的 fail-closed gap 无法覆盖目标项目某项返工、或必须新增 app-only `addFlowStep`/Convener 新工具：属方案/范围实质变化，重开闸门 1/2，本计划拒绝自行扩大。
4. 若实施发现必须新增 `cardKind`/`FlowStepKind`/`Power`/`Decision`、改 `governance-roles.ts` 卡文本或改 `src/model/**`：停止回报，重开闸门 1/2。

### 2.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有 5 个 worker + 内置验收 + 统筹 | **采用** | 写集与现有 Section 1 一一对应；契约/桌面/措辞/目录/测试分离；协调成本最低 |
| B. 新增「返工路由」专职角色 | 否决 | 一次性跨层治理变更，不构成持续独立责任；现有 owner 已覆盖 |
| C. 把编排拆成「flow 语义」与「报告解析」两个角色 | 否决 | 同一私有 `src/common/编排/` 与同一公共出口，无过载证据；拆分会增加交接 |
| D. 由一个角色包办全部实现 | 否决 | 跨越编排/桌面/运行时/项目管理/测试的 Section 1；违反单一属主 |
| E. 用项目 `角色卡/独立验收` worker 判定 | 否决 | 其 Section 1 只覆盖 `角色卡/独立验收/docs/`，不含 `docs/acceptance/`；会形成双重验收 |
| F. 让装配做 `app/main.ts` 接线 | 否决 | 权威 Section 1 中 `app/main.ts` 属桌面窗口；装配边界不含该文件。按方案标签派发会造成越界写 |
| G. 把 i18n/目录 v3/写卡门禁合并验收 | 否决 | 客户已确认独立闸门/独立验收；合并会污染候选与结论 |

---

## 三、参与角色、精确写集与边界

> 每个文件同一时间只有一个 owner。未列路径默认只读。新增文件仅限已授权目录内；角色卡/边界/YAML、他角色资料、`.ans` 治理状态不属任何 worker 写集。

### 3.1 Section 1 覆盖图（2026-10-23 核对）

| 方案 §7 路径 | 所属角色 | Section 1 依据（权威 `boundary.md`） | 本任务写入 |
| --- | --- | --- | --- |
| `src/common/编排/flow-state.ts`、`flow-service.ts`、新增 `acceptance-rework.ts` | 编排 | 「目录（私有）`src/common/编排/`」 | 是 |
| `src/pipeline/orchestration/flow-state.ts` | 编排 | 「单文件 `src/pipeline/orchestration/flow-state.ts` / 流程状态 YAML 契约的 Pipeline 公共出口」 | 是 |
| `test/编排/flow-state.test.ts`、`flow-service.test.ts`、新增 `acceptance-rework.test.ts` | 编排 | 「目录（测试）`test/编排/`」 | 是 |
| `app/desktop/customer-input.ts`、`interface.ts`、`governance-advance.ts` | 桌面窗口 | 「目录 `app/desktop/` / 桌面 Interface（主进程侧纯逻辑）」 | 是 |
| `app/main.ts` | **桌面窗口** | 「单文件 `app/main.ts` / Electron 主进程入口：建窗与窗口生命周期、IPC 注册、诊断与恢复接线」 | 是（S6 接线） |
| `test/桌面应用/acceptance-dispatch.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/acceptance-dispatch.test.ts`」 | 是（主测试面） |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/interface.test.ts`」 | 是 |
| `test/桌面应用/operator-wiring.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/operator-wiring.test.ts`」 | 条件（仅回调/三态断言受影响时） |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 「单文件 `test/桌面应用/e2e/main.mjs` / 桌面端到端总自检台（真实 Electron）」 | 条件（默认只运行；定向扩展须最小追加） |
| `src/provider/runtime/tools.ts` | 运行时核心 | 「单文件 `src/provider/runtime/tools.ts` / 公共受治理工具执行」 | 是 |
| `test/runtime-core/tools.test.ts` | 运行时核心 | 「目录 `test/runtime-core/` / 本角色单元测试与契约夹具」 | 是 |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | 「目录（私有）`src/common/shared/` / 跨角色共享组件」 | 是（仅新增 key） |
| `test/项目管理/shared/i18n.test.ts`（parity）、`i18n-guard.test.ts`（按需） | 项目管理 | 「目录（测试）`test/项目管理/shared/`」 | 是（parity；guard 仅在允许清单受影响时） |
| `test/测试/governance-e2e-auto/`（新增链路）、`test/测试/governance-judge-cards-verify/`（如需） | 测试 | 「目录（测试）`test/测试/` / 跨角色联调、完整流程与回归用例」 | 是 |
| `docs/acceptance/`（标准、报告） | 独立验收（内置） | 技能 `references/acceptance-role.md` 默认写权 | 是（不派 worker） |
| `docs/scheduling/`（本计划、变更包、调度记录） | 统筹（内置） | 技能 `references/scheduler.md` 默认写权 | 是（不派 worker） |
| `app/main.ts` 归「装配」的方案写法 | 装配 | `角色卡/装配/boundary.md` **不含** `app/main.ts` | **否（角色标签校正）**；按权威边界派桌面窗口，装配不参与 |

### 3.2 编排（契约先行）

- **写集**：
  - `src/common/编排/flow-state.ts`：`hasAcceptanceDecision`（1003-1007）改为 `latestAcceptanceDecision`（按账本 append 顺序取该 flow 最后一条 acceptance 决定）；`evaluateFlowCompletion`（1034-1084）默认 strict：accepted ⇒ 已收口，rejected ⇒「验收已拒绝，流程等待返工」不 closed，无决定 + 齐备 ⇒ ready；新增可选 `allowRejectedAcceptance`（默认 false，仅供桌面重派门取具体未完成原因）；保留 `hasUnresolvedDecision` 口径；`changes-requested`/`none`/`unclassified`/缺字段 fail-closed。
  - `src/common/编排/flow-service.ts`：`completeAcceptanceStep`（643-730）只认最新 accepted（即使更早有 accepted，最新 rejected ⇒ `acceptance-not-accepted` 且不写 flow）；新增 app-only `reopenAcceptanceStepForRework({projectRoot, flowId})`：pending 无 evidence 幂等；pending 带旧 evidence 清空并写事件；dispatched/delivered ⇒ pending + 清 evidence；done ⇒ `acceptance-already-done`；failed/blocked/aborted ⇒ `acceptance-step-terminal`；缺步骤/账本不可读/原子写失败 fail-closed；不写 `customer.decision`、不新增枚举。
  - 新增 `src/common/编排/acceptance-rework.ts`：fenced YAML 解析/校验；`schema: acceptance-rework/v1`；`coordinator` 缺省 `convener`（接受 `steward` 别名，其他 warning 仍路由 Convener）；`items` 非空、≤64、id 唯一且匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`、owner 恰好一个、action 非空 ≤2000、evidence 字符串/数组 ≤10×500；未知字段/重复 id/多 owner/多块/超 32KB/不支持版本 ⇒ `invalid`/`unsupported`；只扫描 fenced block，不解析 §8 表/§9.1 编号列表；纯值对象，无 IO、不读模型。
  - `src/pipeline/orchestration/flow-state.ts`：导出 `latestAcceptanceDecision`、`parseAcceptanceReworkReport`、`reopenAcceptanceStepForRework` 及类型；不复制逻辑、不做二次判定；不注册为角色工具。
- **测试**：`test/编排/flow-state.test.ts`（最新决定/默认 strict/rejected 不 closed/`allowRejectedAcceptance`/accepted 收口/verification dispatched/证据/未结算/顺序）；`flow-service.test.ts`（`completeAcceptanceStep` 最新决定；reopen 正/负/幂等/终态/缺步骤/账本坏行/原子写）；新增 `acceptance-rework.test.ts`（解析正例/缺段/坏 YAML/未知字段/重复 id/空 owner/action/多 owner/超限/多块/不支持版本/不解析自由文本）。
- **不写**：`src/model/**`、`governance-ledger.ts`、`governance-roles.ts`、`app/**`、`test/桌面应用/**`、`test/测试/**`、`src/common/shared/**`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **可观察交付**：函数签名/返回码/证据 schema 冻结；正/负例矩阵；`node --test "test/编排/**/*.test.ts"` 与 `npm run typecheck` 原始输出；候选哈希。

### 3.3 桌面窗口（依赖编排公共出口与 i18n key）

- **写集**：
  - `app/desktop/customer-input.ts`：`CreateCustomerInputChannelOptions`（180-216）新增可选 `onAutoRework`；`settleJudgeOutcome`（621-770）只在 `cardKind==="acceptance"`、`outcome==="declined"`、`operatorId=judge:*`、非 `notPresented` 时触发；allowlist：verdict `deny`，manual `timeout`/`parse-failed`/`not-recommended`/`group-mismatch`；不触发 `switch-off`/`aborted`/`unavailable`/`notPresented`/`ledger-unavailable`/`row-failed`；回调抛错只记诊断，不影响已结算 decline；不改三态/账本语义、不伪造 `customer.decision`。
  - `app/desktop/interface.ts`：`latestAcceptedAcceptanceDecision`（1988-2000）、`closeAcceptedFlow`（2023-2061）、`dispatchAcceptanceForFlow`（2207-2569）、`runAcceptanceCheck`（2636-2648）、写卡后推进检查（3638-3643）统一为「最新 accepted 才收口」；新增 `routeAcceptanceRework`/`routeAcceptanceAutoRework`、routing record `.ans/governance/acceptance/<flowId>/rework-routing.json`（原子写、schema `acceptance-rework-routing/v1`、去重/续跑/同内容抑制）、owner 校验（项目 listing + 内置治理角色；未知/不可派发逐项 blocked，不猜、不改 owner）、Lead 系统行与去重、重派门（flow 内容 sha + mtime + `acceptanceLastDispatchAtMs`）、审计 `dispatch.accepted{actorRoleId:"app",targetRoleId:"convener"}` best-effort（失败只诊断，不伪造）；消费 `governance-advance.ts` 收窄后的 `acceptanceLastDispatchAtMs`/`acceptanceDispatchRecorded`（只认 `stepId:"verification"` 或旧无 stepId + verifier；`acceptance-criteria` 等其他 verifier 派发不计入）；routing record 写失败不发送，发送失败 record failed 并等下一次事件。
  - `app/desktop/governance-advance.ts`：`acceptanceLastDispatchAtMs`（408-…）与 `acceptanceDispatchRecorded`（388-…）收窄为只认 `stepId:"verification"` 或旧无 stepId + verifier（`acceptance-criteria` 等其他 verifier 派发不计入）；`flowCompletionIssue`（424-501）legacy 保持旧行为（Q6 A）并加回归锁；`buildAcceptanceTaskMessage`（536-570）追加「不通过/返工报告必须有 `acceptance-rework/v1` 段」硬要求，新增可选 `reportPath`（vN+1）/`previousReportPath`，旧调用不传时文案逐字不变；新增纯函数 `buildAcceptanceReworkTaskMessage`（来源/决定时间/报告路径与哈希/结构化清单/blocked 项/核对已有进展/按 owner supersede/dispatch/不 supersede 验收步骤/不替客户验收/清单是数据不是权限）。
  - `app/main.ts`（S6）：新增 `onAutoRework` 可变句柄，与 `advanceGovernanceFlow` 同模式（480-503），接到 desktop 的 `routeAcceptanceAutoRework`；仅接线，不放业务逻辑。
- **测试**：`test/桌面应用/acceptance-dispatch.test.ts`（主测试面：rejected 路由/等待/重派/去重/循环抑制；accepted 收口；verification 进行中；judge 来源；报告缺段/坏段/未知 owner/`owner:"verifier"|"convener"`；审计失败；记录写失败/发送失败；目标形态夹具；legacy `flowCompletionIssue` 旧行为回归；既有 rejected 用例按 Q1 **替换**为「最新 rejected ⇒ 路由/不永久收口」，并保留「accepted ⇒ 不重派」负例，不是把断言改弱）；`interface.test.ts`（写卡后推进最新 accepted；routing record/去重按需）；`operator-wiring.test.ts`（仅 customer-input 回调/三态断言受影响时）；`e2e/main.mjs`（默认运行；定向系统行冒烟须最小追加）。
- **硬约束**：**不得在 `test/桌面应用/` 新建文件**；不得改 `app/renderer/**`、`app/preload.cjs`、`src/**`、`src/common/shared/**`、`package.json`/`tsconfig.json`/`vite.config.ts`、角色卡/边界。
- **可观察交付**：路由恰好一条 Convener 任务、零 Proof 返工派发、无新增 `customer.decision`；重派对同内容/同进度不重复；系统行客户/judge 来源可分；`node --test` 精确文件 + `npm run typecheck` 原始输出；候选哈希；无越界写。

### 3.4 运行时核心（与桌面并行）

- **写集**：`src/provider/runtime/tools.ts`：`request_confirmation` declined（1333-1337）、`request_choice` declined（1468-1470）按 `outcome.operatorId` 区分 `judge:*` 与客户/通道；judge 文案为「自动决策未通过/未完成（原因…）；这不是客户拒绝；应用会把本次退回交 Steward/统筹（Convener）组织返工；请等待返工后重新提交验收」；客户/通道保持既有语义；`notPresented` 仍走 `cardNotPresented`；`notConsented`（1168-1170）不变；不新增工具/schema/字段。
- **测试**：`test/runtime-core/tools.test.ts`：judge declined 不含「客户拒绝」；客户 declined 含「客户拒绝」；`notPresented`/`unavailable` 不变；judgeReceipt 代批措辞不变。
- **不写**：`src/model/**`、`src/service/**`、`src/common/**`、`app/**`、其他角色测试、`docs/scheduling/`、`docs/acceptance/`。
- **可观察交付**：措辞 diff；`node --test test/runtime-core/tools.test.ts` + `npm run typecheck`；候选哈希。

### 3.5 项目管理（i18n 系统行 key）

- **写集**：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` 新增 6 个 key：`main.governance.acceptanceReworkRoutedCustomer`、`acceptanceReworkRoutedAutomatic`、`acceptanceReworkPending`、`acceptanceReworkReportIncomplete`、`acceptanceReworkFailed`、`acceptanceReworkAuditFailed`；语义：客户来源写「客户拒绝」，judge 来源写「自动决策未通过/未完成（判断代批/自动退回）」，任何 judge 来源不得出现「客户拒绝」。
- **测试**：`test/项目管理/shared/i18n.test.ts` 的 zh/en key 全集 parity 必须通过；`i18n-guard.test.ts` 仅在允许清单受影响时更新（新增文本进目录，不新增硬编码）。
- **不写**：`app/**`、`src/model/**`、`src/pipeline/**`、`src/provider/**`、其他 shared 文件、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界；不改 shared 属主/目录。
- **可观察交付**：key 契约先冻结（S5a）供桌面 typecheck；两份目录 parity/typecheck 原始输出；候选哈希。

### 3.6 测试（独立 e2e / T3 / 真实 Electron / 目标复算）

- **写集**：`test/测试/governance-e2e-auto/` 新增 `s-acceptance-rework-routing.test.ts`（既有 `n-invalid-governance-card.test.ts` 已占用 `n-`，不用任务建议的 `n-` 名；也可并入 `f-acceptance-gate.test.ts`）；按需 `test/测试/governance-judge-cards-verify/`。内容：
  1. 全链路：客户 reject → Convener 任务含清单/报告 → Convener 建 `rework-*` → owner done → 应用**恰好一次**重派 Proof → accepted → `verification` done；同进度再触发不重派。
  2. judge deny/manual auto-rework：Convener 任务 + 「自动决策」系统行 + 无 `customer.decision` + 零 Proof 返工派发。
  3. 报告缺段/坏段：Convener「报告不完整」任务，无 items、无 flow 步骤；未知 owner 逐项 blocked。
  4. legacy Markdown 行为不变（Q6 A）。
  5. 目标项目只读复算：复制 `ans-gateway` flow/账本到临时夹具，按 §8.5 重建快照 A 语义（删除快照 B 新增两个 rework 步骤及账本 481–483 等条目），断言「仅 rejected 挡住、移除后 ready:true」「返工步骤未完成时即使移除 rejected 也不 ready」；原项目前后哈希一致、零写入。
- **测试/证据**：`node --test --test-concurrency=1 "test/**/*.test.ts"`（排除已知挂起 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式）、`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；真实 Electron `test/桌面应用/e2e/main.mjs`（fresh userData，记录含 `E2E_PASS` 的原始输出）。
- **不写**：产品源码、其他角色单测、`test/桌面应用/`（桌面窗口 owner）、`test/编排/`、`test/runtime-core/`、`test/项目管理/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。测试角色**不自验产品**，不改产品断言保绿。
- **可观察交付**：基线/终验命令、退出码、环境、计数、原始日志、失败分类；e2e/Electron/目标复算证据；候选哈希与 diff/status。

### 3.7 明确不改

- `app/renderer/**`（桌面UI）、`app/preload.cjs`、`src/model/{boundary,role,decision,runtime}.ts`、`src/common/编排/governance-ledger.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/interface/cli/**`、`src/service/**`、`src/provider/**`（`tools.ts` 除外）、`package.json`/`tsconfig.json`/`vite.config.ts`/`electron-builder.yml`、发布配方、`docs/flows/`、目标项目任何文件、历史报告/账本。
- 不做 O1 app-only `addFlowStep`、O2 卡文本、O3 legacy 重派、O4 客户文字理由；若实施需要，重开闸门 1/2。
- 不改 `.ans` 中的会话/治理状态作为产品候选；测试夹具使用临时项目根，不覆盖既有调度/验收记录。

### 3.8 单写者矩阵与共享文件

| 文件/目录 | 唯一 owner（本任务） | 并发规则 |
| --- | --- | --- |
| `src/common/编排/**`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/**` | 编排 | 不与桌面/测试并发写 |
| `app/desktop/**`、`app/main.ts`、`test/桌面应用/**` | 桌面窗口 | S3 与 S6 同一 owner；同一文件不拆给两人 |
| `src/provider/runtime/tools.ts`、`test/runtime-core/**` | 运行时核心 | 可与 S2/S3 并行（无共享文件） |
| `src/common/shared/i18n/messages/**`、`test/项目管理/shared/**` | 项目管理 | key 契约（S5a）先于桌面 typecheck；别人只读消费 |
| `test/测试/**` | 测试 | 只在 S7 写；不写产品/其他角色测试 |
| `docs/acceptance/**` | 内置独立验收 | 不派 worker |
| `docs/scheduling/**` | 统筹 | 不派 worker；项目管理边界虽列该目录（task_ops 内容），本任务不派其写入 |

---

## 四、阶段与依赖（S1–S7）

### 4.1 阶段表

| 阶段 | 角色 | 可观察交付 | 入口/出口 |
| --- | --- | --- | --- |
| **S1 实施前准备** | 沟通/统筹；内置独立验收；测试 | 闸门 2 确认记录 + 客户实施授权（分开）；`docs/acceptance/acceptance-rework-routing-criteria-v1.md`（T3，先于实施）；T3 基线（typecheck、受影响套件、全量基线、已知挂起排除、目标项目只读快照与哈希）；逐角色 `preflight-role` 与写集哈希基线 | 入口：本计划写盘；出口：闸门 2 + 实施授权 + 标准写盘 + 基线可复算 + 预检通过 |
| **S2 编排契约** | 编排 | `latestAcceptanceDecision`/`evaluateFlowCompletion` 选项/`completeAcceptanceStep` 最新 accepted/`reopenAcceptanceStepForRework`/`acceptance-rework.ts` 解析/`flow-state.ts` 公共出口 + 编排测试 | 入口：S1；出口：函数/返回码/schema 冻结，`test/编排/**` 与 typecheck 通过，候选哈希 |
| **S3 桌面路由** | 桌面窗口 | `customer-input` 回调、`interface` 最新决定/路由/记录/重派门/系统行、`governance-advance` 任务/legacy；`acceptance-dispatch`/`interface`/`operator-wiring` 测试 | 入口：S2 公共出口冻结 + S5a key 契约；出口：测试/typecheck 通过，无 `customer.decision`，legacy 不变，候选哈希 |
| **S4 运行时措辞** | 运行时核心 | `tools.ts` judge/客户措辞 + `tools.test.ts` | 入口：S1（与 S2/S3 并行，无共享文件）；出口：测试/typecheck 通过，候选哈希 |
| **S5 项目管理 key** | 项目管理 | S5a：6 个系统行 key（zh/en）；S5b：parity/typecheck | 入口：S1；S5a 与 S2 并行；S5b 在 S3 前完成 parity；出口：key 契约冻结、parity 通过 |
| **S6 接线与构建核对** | 桌面窗口 | `app/main.ts` `onAutoRework` 句柄接线；`npm run typecheck`；确认无 preload/IPC 形状变化 | 入口：S3 + S5a；出口：接线完成、typecheck 通过、候选哈希 |
| **S7 集成/回归/验收** | 测试 → 统筹 → 内置独立验收 | 测试角色全链路 e2e、T3 串行全量、真实 Electron、目标只读复算；统筹写 `docs/scheduling/acceptance-rework-routing-change-v1.md`；独立验收写 `docs/acceptance/acceptance-rework-routing-report-v1.md` | 入口：S3+S4+S5+S6 完成且共享文件冻结；出口：证据齐全 + 报告按当前候选判定（通过/返工/证据不足） |

### 4.2 依赖、并行组、串行点

- **串行点**：S1 → S2 → S3 → S6 → S7；S2 公共出口冻结先于 S3；S3 + S5a 先于 S6；S3/S4/S5/S6 全部完成先于 S7 终验；S7 先于独立验收判定。
- **并行组**：S1 后 S2（编排）∥ S4（运行时）∥ S5a（PM key）；S3 与 S4 可并行（无共享文件）；S5b 在 S3 前完成 parity。
- **不允许**：S3 与 S6 同时写 `app/main.ts`/`interface.ts`（同一 owner 也不并发）；任何角色写 `test/桌面应用/` 新文件；任何角色写 `docs/scheduling/` 或 `docs/acceptance/`；任何角色改角色卡/边界/枚举/目标项目；S3 完成前对最终候选跑「终验」并声称通过。

### 4.3 相对任务建议顺序的调整（说明）

1. **S5 的 key 契约前移**：桌面系统行会引用 `main.governance.acceptanceRework*` key；若等 S4 后再写，桌面 typecheck 会被 `MessageKey` 拦住。因此把 S5 拆为 S5a（key 契约，与 S2 并行）和 S5b（parity/typecheck，S3 前完成）；S4 仍是运行时核心，S6 仍是接线。
2. **S4 与 S3 并行**：`tools.ts` 与桌面/编排无共享文件，可在 S1 后独立开工；不改变层依赖（运行时措辞不依赖 `reopen`/解析器）。
3. **S6 由桌面窗口执行，装配不参与**：`app/main.ts` 在权威 Section 1 属桌面窗口；方案 §6.1/§7.1 的「装配」标签与边界不一致，本计划按边界执行，避免越界写。这是**角色标签校正**，不是边界变更。

### 4.4 每阶段出口证据

- **S1**：闸门 2 记录 + 实施授权记录（分别）；标准文件路径/行数/SHA-256；基线命令、环境、计数、失败清单与分类；目标快照哈希；各角色 `preflight-role` 与实际 card/boundary 根、requiredWorkDocuments 核对结果。
- **S2**：`git diff --name-only` 落在编排写集；`test/编排/**` 原始输出；typecheck；候选哈希；公共契约清单（函数签名/返回码/schema）。
- **S3**：桌面精确测试原始输出；typecheck；无 `customer.decision`/无客户卡的断言；legacy 旧行为回归；候选哈希。
- **S4**：`tools.test.ts` 原始输出；typecheck；措辞 diff；候选哈希。
- **S5**：两份 message 目录 diff；parity 测试；typecheck；无硬编码回潮；候选哈希。
- **S6**：`app/main.ts` diff（仅接线）；typecheck；无 preload/IPC 形状变化；候选哈希。
- **S7**：全链路 e2e、T3 全量、真实 Electron `E2E_PASS`、目标只读复算、失败分类；变更包（候选哈希、改动路径、任务节点、证据链接、T3）；独立验收报告（P1–P12）。

---

## 五、测试与验收安排（T3）

### 5.1 标准先于实施

- 内置独立验收在 **S1**、实施前基于客户闸门 1 确认的方案 v1（951 行；SHA-256 `9ceea642…`）写 `docs/acceptance/acceptance-rework-routing-criteria-v1.md`，覆盖方案 §8.1–8.6 的 P1–P12 草案，**不得弱于** §8.6；标准可细化证据与判定规则，不能改方案或加客户未确认的范围。
- 标准至少含：ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断；判定只有 `pass`/`fail`/`insufficient evidence`/`not applicable`（N/A 写依据）。

### 5.2 覆盖矩阵（P1–P12 对应阶段）

| 标准 | 主要证据阶段 | 角色 |
| --- | --- | --- |
| P1 最新决定语义 / 收口 | S2 单测 + S3 集成 + S7 目标复算 | 编排、桌面窗口、测试 |
| P2 结构化返工段 | S2 解析器单测 + S3 集成/负例 | 编排、桌面窗口 |
| P3 路由（客户/judge/代批/auto-rework） | S3 集成 + S7 e2e | 桌面窗口、测试 |
| P4 措辞 | S4 单测 + S3 系统行 + S7 Electron | 运行时核心、桌面窗口、测试 |
| P5 Convener 契约 | S3 任务文本 + S7 e2e/flow 夹具 | 桌面窗口、测试 |
| P6 重派门/循环抑制 | S3 集成 + S7 目标夹具 | 桌面窗口、测试 |
| P7 verification 重开 | S2 单测 + S7 e2e | 编排、测试 |
| P8 兼容/迁移（legacy 不变、无新枚举） | S2/S3 回归 + S7 全量 | 编排、桌面窗口、测试 |
| P9 失败/边界 fail-closed | S3 负例 + S7 | 桌面窗口、测试 |
| P10 分层/权限（无越界、无新工具） | S2/S3/S6 diff + S7 核对 | 全角色、独立验收 |
| P11 测试/证据（断言未弱化、目标零写入） | S7 | 测试、独立验收 |
| P12 文档/状态（不把计划写成结果） | S7 | 统筹、独立验收 |

### 5.3 测试纪律

- **测试角色不自验产品**：产品单元/层测试由各开发角色自跑并交原始输出；测试角色只做跨角色 e2e、完整链路、T3 全量、真实 Electron 与目标只读复算。测试角色不修产品、不改其他角色测试。
- **断言不改弱**：`test/桌面应用/acceptance-dispatch.test.ts` 现有 rejected 用例固定了旧行为（「已有验收决定 ⇒ 不派 verifier」），按客户确认的 Q1 必须**替换**为新语义；同时保留「accepted ⇒ 收口/不重派」「无新进展 ⇒ 不重派」负例，防止把门改没。任何删除/放宽断言都必须在变更包列明理由并由独立验收核对，不能为保绿改弱。
- **真实 Electron**：`test/桌面应用/e2e/main.mjs` 对当前候选 fresh userData 运行，记录 `E2E_PASS` 与失败原文；既有平台性失败按基线对照，不算本变更通过。定向系统行冒烟（客户拒绝/自动决策/报告缺段）可在同一自检台最小追加，不新建 UI 通道。
- **T3 全量回归**：`node --test --test-concurrency=1 "test/**/*.test.ts"`（排除已知挂起 `test/pi-adapter/write-sequencing.test.ts` 并声明）、`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；记录候选、命令、环境、退出码、计数、原始日志、失败分类；`skip`/`todo` 不计通过；既有无害失败按基线对照，零新增确定性失败。最近基线 356 文件/3693/3666/9/18，S1 必须重测。
- **目标项目零写入**：`ans-gateway` 只读；复算在临时夹具进行；前后哈希/只读核对；复算只证明新逻辑在快照 A/B 上按门动作，**不等于目标项目已修复**。
- **变更包/报告独立**：统筹在 S7 写变更包（候选哈希、改动路径、任务节点、证据链接、T3）；独立验收写报告并判定；统筹不改结论，不用其他变更验收背书。

### 5.4 证据失效与复用

- 同候选、同输入/依赖/命令的证据可复用；候选、flow/报告/账本夹具、i18n 目录、契约或配置变化使受影响证据失效。
- 复用仅限未受影响路径且对应当前候选；T3 全量不因「别的角色跑过」而省略；若证据链不完整，升档补证而不是降档。
- 证据写各角色自身 `docs/change/`（按现有约定），不伪造 `docs/verification/`；独立验收只写 `docs/acceptance/`。

---

## 六、边界与授权核对

### 6.1 逐文件核对（2026-10-23）

| 路径 | 角色 | 权威 Section 1 | 状态 |
| --- | --- | --- | --- |
| `src/common/编排/flow-state.ts`、`flow-service.ts`、`acceptance-rework.ts`（新） | 编排 | 目录 `src/common/编排/` | 覆盖；新文件在已授权目录内 |
| `src/pipeline/orchestration/flow-state.ts` | 编排 | 单文件（md 与 yaml 均有） | 覆盖（此前 YAML-only 漂移已由当前工作树 md 补入） |
| `test/编排/flow-state.test.ts`、`flow-service.test.ts`、`acceptance-rework.test.ts`（新） | 编排 | 目录 `test/编排/` | 覆盖 |
| `app/desktop/customer-input.ts`、`interface.ts`、`governance-advance.ts` | 桌面窗口 | 目录 `app/desktop/` | 覆盖 |
| `app/main.ts` | **桌面窗口** | 单文件 | 覆盖；**不是装配**（装配 Section 1 不含此文件） |
| `test/桌面应用/acceptance-dispatch.test.ts` | 桌面窗口 | 单文件 | 覆盖（当前工作树 md 第 44 行、yaml 第 114 行；目录 v3 候选已补入） |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 单文件 | 覆盖 |
| `test/桌面应用/operator-wiring.test.ts` | 桌面窗口 | 单文件 | 覆盖（条件改） |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 单文件 | 覆盖（默认只运行；条件最小追加） |
| `src/provider/runtime/tools.ts` | 运行时核心 | 单文件 | 覆盖 |
| `test/runtime-core/tools.test.ts` | 运行时核心 | 目录 `test/runtime-core/` | 覆盖 |
| `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` | 项目管理 | 目录 `src/common/shared/` | 覆盖；仅新增 key，不改属主/目录 |
| `test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts`（按需） | 项目管理 | 目录 `test/项目管理/shared/` | 覆盖 |
| `test/测试/governance-e2e-auto/**`、`test/测试/governance-judge-cards-verify/**`（如需） | 测试 | 目录 `test/测试/` | 覆盖；可在目录内新建用例 |
| `docs/acceptance/**` | 内置独立验收 | 技能默认写权 | 覆盖；不派 worker |
| `docs/scheduling/**` | 统筹 | 技能默认写权 | 覆盖；不派 worker |
| `app/main.ts`（方案标装配） | 装配 | **不覆盖** | 不是写集；按权威边界派桌面窗口 |

### 6.2 结论

- **无新增角色、无边界变更。** 不需要 ANS 人事写卡或改边界；人事只在闸门 2 后按客户确认的计划处理（本计划无此需求）。
- **一处角色标签校正（非边界变更）**：方案 §6.1/§7.1 把 `app/main.ts` 归「装配」；权威 `角色卡/桌面窗口/boundary.md` Section 1 单文件列有 `app/main.ts`，`角色卡/装配/boundary.md` 不含。本计划按权威边界派给桌面窗口，装配不参与。请客户在闸门 2 确认这一指派。
- **条件覆盖**：`test/桌面应用/acceptance-dispatch.test.ts` 的覆盖依赖当前工作树中目录 v3 候选补入的 boundary 条目（未提交）。S1 预检必须确认该条目仍在；若被回退/未落地，则该项回到「逐文件未覆盖」，**停止派发**，交人事/闸门 2 补条目，不默认写。
- **无未覆盖路径**；未覆盖即停止回报，不自行扩权。

### 6.3 授权纪律

- 每个 worker 取自己的角色、边界、授权、输入与交付要求；不继承统筹完整对话。
- 逐角色 `preflight-role` 核对实际 card/boundary 根、完整登记与 `requiredWorkDocuments`；缺权写入团队计划交人事，不代改。
- 任务计划只能缩小已确认边界，不能新增权限；测试文件必须在授权目录/精确文件内。
- `docs/acceptance/` 只由内置独立验收写，`docs/scheduling/` 只由统筹写；不把这两个目录派给 worker。

---

## 七、风险、工作量与顺序

### 7.1 主要风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **T3 全量成本** | 回归耗时长、已有 9 项 Windows symlink EPERM/挂起项干扰判断 | S1 重测基线；终验只对新增确定性失败负责；`write-sequencing` 排除并记录；不因成本降档 |
| **报告 schema 采用** | 目标项目现有 v1/v2 报告无 `acceptance-rework/v1` 段，升级后只能走 `structured:false`/「报告不完整」兜底 | 应用不猜、不解析自由文本；Convener 读报告或要求 Proof 补结构；重派任务要求 vN+1 按新模板；不把缺段当客户拒绝 |
| **Convener flow 工具/Q5 gap** | 没有可 supersede 的旧步骤时无法凭空建 `rework-*`；O1 不做 | fail-closed gap，记录并请 Lead/Proof 补 flow 计划；不新增 app-only add step；若客户要求覆盖全部 F-item，重开闸门 1/2 |
| **Q13 目标恢复** | report-v2 是账本外复核，升级后可能重派一次；也可能因 flow 未变不重派 | 以账本/flow 为自动依据；升级前可登记 report-v2 或接受一次重复，由目标项目 Convener/Lead/客户决定；本任务只读，不写目标 |
| **legacy 限制** | legacy Markdown rejected 流程不自动重派 | Q6 A 保持旧行为 + 迁移提示；不重写旧 flow/报告/账本；在报告中如实写明 |
| **与 i18n/目录 v3/写卡门禁共享文件** | `interface.ts`/`governance-advance.ts`/`customer-input.ts`/`app/main.ts`/i18n messages 已被前三者修改（未提交） | 三者已验收但未提交，视为冻结基线；S1 逐文件哈希；本变更候选只含新 hunk；同一文件不并发；不合并验收 |
| **`acceptanceLastDispatchAtMs` 收窄** | 收窄过度会挡住重派；收窄不足会把 `acceptance-criteria` 误当复核 | 只认 `stepId:"verification"` 或旧无 stepId + verifier；正/负例覆盖 `acceptance-criteria` 不计入 |
| **mtime/时钟/内容 sha** | 可能延迟或误判重派 | flow 内容 sha 抑制同内容；mtime 只作进度信号；以真实事件触发；测试注入 mtime/sha |
| **候选代码变化不可见** | 应用不知道目标代码候选哈希，只以 flow/证据更新为进展 | 任务要求 Convener 把返工登记到 flow；报告/变更包核对候选；残差风险在验收报告写明 |
| **owner 未知/多 owner** | 部分返工无法派发 | 解析整段不采信或逐项 blocked；有效项先行（Q8）；不猜、不改 owner；要求补证/拆项 |
| **i18n key 与 typecheck 顺序** | key 未先写会导致桌面 typecheck 失败 | S5a key 契约先于 S3；zh/en 同时写；parity 通过再交桌面 |
| **边界条件（test/桌面应用 逐文件）** | 目录 v3 boundary 候选若未落地，`acceptance-dispatch.test.ts` 失去覆盖 | S1 预检确认；不覆盖则停止派发，交人事/闸门 2 |
| **方案标签误派** | 把 `app/main.ts` 派给装配会越界写 | 按权威 Section 1 派桌面窗口；闸门 2 明确确认 |
| **测试命名冲突** | `n-` 前缀已被 `n-invalid-governance-card` 占用 | 新增用 `s-acceptance-rework-routing.test.ts` 或并入 `f-acceptance-gate.test.ts` |
| **范围蔓延** | 实施中发现需要新枚举/新工具/卡文本 | 停止回报；重开闸门 1/2；不默认扩权 |

### 7.2 工作量（定性，精确工时待评估）

| 角色 | 规模 | 说明 |
| --- | --- | --- |
| 编排 | 中–大 | 4 个产品文件（含 1 新）+ 3 个测试；决定语义/重开/解析器是核心契约，先冻结 |
| 桌面窗口 | 大 | 4 个产品文件（含 `app/main.ts`）+ 3–4 个测试；路由/记录/重派门/系统行集成复杂度最高 |
| 运行时核心 | 小 | 1 个产品文件 + 1 个测试；措辞分支清晰，可与编排并行 |
| 项目管理 | 小–中 | 2 个 message 文件 + parity；但 key 在关键路径上，必须先冻结 |
| 测试 | 大 | 新 e2e 链路 + T3 串行全量 + 真实 Electron + 目标只读复算；证据成本最高 |
| 独立验收 | 中 | 实施前标准 + 实施后报告；不参与实现 |
| 统筹 | 中 | 本计划、变更包、派发/收证/放行/记录 |

### 7.3 顺序约束（与既有变更）

- **既有三项变更已验收但未提交**：i18n（T2）、目录 v3（T3）、治理写卡推进（T3）。本变更加在其工作树之上，候选隔离：只把本变更 hunk 计入候选，不 revert/吸收/重写它们的改动，不为它们背书。
- **共享文件串行**：`app/desktop/interface.ts`、`governance-advance.ts`、`customer-input.ts`、`app/main.ts`、`src/common/shared/i18n/messages/**` 在 S1 记录基线后由本变更单一 owner 写；若既有变更在本变更实施期间又修改这些文件，停止并重新基线。
- **不与 i18n/目录 v3/写卡门禁合并验收**：候选、标准、报告、变更包分开；本变更 T3 结论不为它们背书，也不引用它们的结论替代本变更证据。
- **发布前独立验收**：v1.7.0 发布前完成本变更独立 T3 验收；本计划不包含发布/打包/版本号变更。

---

## 八、闸门 2 待客户确认项（一页摘要）

1. **参与角色**：编排、桌面窗口、运行时核心、项目管理、测试为实施 worker；内置独立验收写标准与报告；统筹写计划/变更包/调度记录。**不启用装配、门禁引擎、桌面UI、人事及其他角色**。
2. **精确写集**：按 §三。编排 `src/common/编排/{flow-state,flow-service,新增 acceptance-rework}.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/{flow-state,flow-service,新增 acceptance-rework}.test.ts`；桌面窗口 `app/desktop/{customer-input,interface,governance-advance}.ts`、`app/main.ts`、`test/桌面应用/{acceptance-dispatch,interface,operator-wiring}.test.ts`、`e2e/main.mjs`；运行时核心 `src/provider/runtime/tools.ts`、`test/runtime-core/tools.test.ts`；项目管理 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts`（+按需 guard）；测试 `test/测试/governance-e2e-auto/`（新增 `s-acceptance-rework-routing.test.ts` 或并入 `f-acceptance-gate.test.ts`）、`test/测试/governance-judge-cards-verify/`（如需）。
3. **是否有角色/边界变更**：**无新增角色、无边界变更**。一处**角色标签校正**：`app/main.ts` 按权威 Section 1 属桌面窗口，不属装配；请确认由桌面窗口接线。`test/桌面应用/` 为逐文件授权，只改上述既有文件，**不得新建文件**；`acceptance-dispatch.test.ts` 的覆盖依赖当前工作树目录 v3 候选补入的 boundary 条目，S1 预检确认，若未落地则停止派发交人事/闸门 2。
4. **风险档位**：**T3**；适用 T3 全量回归 + 真实 Electron + 目标项目只读复算 + 夹具全链路 e2e；不降档。
5. **阶段顺序**：S1 实施前准备（闸门 2 + 实施授权 + T3 标准 + 基线）→ S2 编排契约 ∥ S4 运行时 ∥ S5a i18n key → S3 桌面路由（依赖 S2 + S5a）→ S6 `app/main.ts` 接线 → S7 集成/回归 → 独立验收；S3 与 S4 可并行，S6 后终验。
6. **验收安排**：内置独立验收在实施前写 `docs/acceptance/acceptance-rework-routing-criteria-v1.md`（覆盖 P1–P12，不弱于方案 §8.6），实施后写 `...-report-v1.md`；不使用项目 `角色卡/独立验收` worker；不与 i18n/目录 v3/写卡门禁合并判定。
7. **证据口径**：候选哈希（逐文件 `git hash-object` + `sha256sum`）、原始命令/退出码/计数/失败原文、T3 全量（排除 `write-sequencing` 并声明）、真实 Electron `E2E_PASS`、目标项目只读复算且零写入、无 `customer.decision` 伪造、无越界写、断言未弱化、变更包/报告独立。
8. **闸门 2 确认 ≠ 实施授权**：客户可先确认角色/写集/顺序/验收安排，再另行给出实施授权；未给实施授权前不派发、不改代码。本计划不写实施授权记录。
9. **既有改动隔离**：i18n、目录 v3、治理写卡推进已验收但未提交，作为既有基线；本变更独立候选、独立验收，不合并、不改其结论；共享文件按 §七串行。
10. **方案不变**：客户已在闸门 1 确认方案 v1/Q1–Q13 A/O1–O4 不做；本计划不自行加 O1/O2/O3/O4、不扩权、不改枚举/角色卡/目标项目；若需改变，重开闸门 1/2。

---

## 九、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`）。
- **未确认**：闸门 2（参与角色/写集/角色标签校正/T3/顺序/验收/证据口径）与客户实施授权。
- **未写盘**：实施前验收标准（内置独立验收在闸门 2 后写 `docs/acceptance/acceptance-rework-routing-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改源码/测试/角色卡/边界/方案/flow/账本/沟通记录/验收文档；未写目标项目。
- **下一步**：交沟通 → 客户闸门 2（含 `app/main.ts` 角色标签校正、`test/桌面应用/` 逐文件覆盖确认）→ 客户实施授权 → 内置独立验收写标准 + 测试跑基线 + 逐角色预检 → 按 S2–S7 派发。若客户改变方案/Q1–Q13 或要求扩权/改目标项目，重开闸门 1/2。
