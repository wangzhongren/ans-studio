# 团队计划：治理写卡推进的可重入门禁闭环（governance-advance-redispatch）

- **任务 ID**：`2026-10-23-governance-advance-redispatch`｜**产品 flowId**：`governance-advance-redispatch`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色）｜**日期**：2026-10-23
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通/验收**
- **闸门 0/1 记录**：[`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`](../communication/2026-10-23_intent_governance-advance-redispatch.md)（2026-10-23 已确认；闸门 1 客户明确选择**方案 A（推荐）**，Q1–Q8 按推荐）
- **客户确认的策划方案**：[`docs/planning/2026-10-23_design_governance-advance-redispatch.md`](../planning/2026-10-23_design_governance-advance-redispatch.md) v1（299 行；SHA-256 `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341`；blob `9223448f823bd30ef01c9d11d51385c3aeff9fef`）
- **风险档位**：**T3（治理行为与 flow 状态变更）**；不新增角色/权限/枚举，不写目标项目。
- **记录性质**：不是 `task_ops` 机器状态；无 `.ans/project.json`（`.ans/` 仅 `sessions/`）；不伪造任务令牌、审批、锁或机器预检。
- **当前停点**：交沟通向客户确认**闸门 2**；客户另行给出**实施授权**前不派发。本变更与 i18n、目录授权 v3 分别闸门、分别实施、分别验收，不合并。

---

## 一、任务、档位与基线

### 1.1 目标（方案 A / Q1–Q8）

1. **可重入门禁闭环**：Crew 写卡/重写或用户刷新项目后，应用重新做去重的只读结构校验；不合格按来源反馈 Crew/Convener 修正，不推进、不弹客户卡、不写 `customer.decision`；合格则把 `role-cards` 标 `done`，再派 Convener 做 `role-readiness`。
2. **去重与账本锚（R1–R3）**：运行期键改为版本化（指纹 + 最近 Crew 写卡位置），`applicationDispatchCommitted` 同键；账本以“当前指纹通过记录”或“最近 Crew appointment-write”为锚，早期 appointment 链无 `stepId` 的 Convener 派发不再算 readiness 已派发。
3. **刷新触发（R4）**：`listProject` 更新 listing 后先做廉价探针，仅有待校验/待派发 flow 才排完整检查；250ms 合窗；防 `projectChanged` 自激。
4. **收口与反馈（R5–R7）**：新增应用专用 `completeRoleCardsStep`（`.ans/governance/role-cards/<flowId>/<fingerprint>.json` + `artifact.observed(power=app)`）；反馈按内容指纹去重；readiness 文案说明 role-cards 已 done / role-readiness 已 done 不要重做。
5. **不变量**：应用仍是唯一结构校验者与 flow 写者；Crew 只经既有 appointment-write 写 `角色卡/`；不新增写权、派发权或枚举；目标项目只读。

### 1.2 非目标

- 不新增 `角色卡/` 写权限、不放开角色互派、不新增 `cardKind`/`FlowStepKind`/`Power`/`Decision`/artifact kind 枚举；不重构治理流程/权限，不把 Convener 语义 readiness 改成应用判定。
- 不新增 watcher、不加显式“重新校验/推进”动作（Q5）、不加 O1。
- 不迁移/写入 `ans-gateway` 的角色卡、flow、账本；只做只读复算。
- 不把 i18n B0/B1–B4 或目录 v3 的既有改动混入本变更候选，也不改变它们的候选/验收结论。
- 不提交、不推送、不合并、不发布。

### 1.3 T3 依据

本变更改变应用推进治理流程的判定、去重与 flow 写入行为，涉及跨角色契约与编排公共出口；即使不扩权也按治理变更取 T3。实施前须有客户确认的方案版本、独立验收标准、T3 全量回归与真实 Electron 证据；升档不降档。

### 1.4 基线（2026-10-23 实测）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `main` / `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树既有改动 | 目录 v3 已实施并有独立验收报告（判定“通过（当前候选）”，未提交）；i18n B0 与 B1–B4 key/契约及相关改动在工作树（未提交、验收未完成）；`docs/*/memo.md` 修改；意图/方案/团队计划/变更包/验收文档等未跟踪。以上均为**既有上下文**，不是本变更候选 |
| 本变更目标文件现状 | `src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts` 与 HEAD 一致；`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`test/测试/governance-e2e-auto/*` 部分已被既有变更修改。实施前记录工作区哈希基线，候选只含本变更 hunk |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不建立第二份机器状态 |
| Node/npm | 当前 shell PATH 未包含 node/npm；按既有流程加入 PATH 后记录实测版本（上轮 Node v24.22.1 / npm 11.19.1，以实测为准） |
| 测试 runner | `node --test`；`npm run typecheck`；真实 Electron `test/桌面应用/e2e/main.mjs`；不新增 runner/配置 |
| 全量已知情况 | 目录 v3 终验 355 文件 / 3655 计 / 3628 过 / 9 红 / 18 skip，9 红均为既有 Windows symlink EPERM；`test/pi-adapter/write-sequencing.test.ts` 挂起、默认排除；桌面时序偶发须隔离复跑分类。**S2 必须重新实测基线，不直接沿用** |
| 既有管理文档 | `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/` 与各角色 `docs/change/` 记录不纳入产品候选 |

---

## 二、闸门与授权

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）** | 意图记录文件 |
| 闸门 1：方案确认 | **已确认（2026-10-23，方案 A + Q1–Q8 推荐）** | 同文件「闸门 1 确认记录」；对象为方案 v1（哈希见文件头） |
| 闸门 2：角色/写集确认 | **未确认** | 本计划 §八；确认记录由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发、不改代码 |
| 实施前验收标准 | 未写盘 | 内置独立验收在闸门 2 后、实施前写 `docs/acceptance/governance-advance-redispatch-criteria-v1.md` |

**已确认的 Q1–Q8（本计划据此排期，不自行改变）**：Q1 接受应用专用 `completeRoleCardsStep`；Q2 接受 `listProject` 廉价探针 + 250ms 合窗 + 指纹去重；Q3 指纹 = 目标角色六文件 sha256 + 团队计划 sha256 + validator schema 版本（不含 mtime）；Q4 版本化运行期键 + 通过记录/最近 Crew 写卡为账本锚，早期 appointment 链派发不算 readiness；Q5 本轮不加显式动作、O1 不默认；Q6 证据放 `.ans/governance/role-cards/<flowId>/<fingerprint>.json` + `artifact.observed(power=app)`；Q7 role-cards 已 done 只推进 role-readiness，role-readiness 已 done 时明确不要重做；Q8 T3 全量 + 真实 Electron + 目标项目只读复算 + 夹具全链路 e2e，不代写目标项目。

**两个事实**：闸门 2 确认参与角色/写集/边界/档位/顺序/验收/证据口径；实施授权是代码实施授权。闸门 1 的“方案 A + Q1–Q8”不等于闸门 2，也不等于实施授权。本计划写盘后不派发，直到闸门 2 + 实施授权 + 实施前标准经沟通确认 + 逐角色范围预留齐备。

---

## 三、五维判断与决策表

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 产品治理行为变化横跨既有分层：`completeRoleCardsStep`/指纹/账本锚/flow 收口归编排；去重键/刷新探针/文案归桌面窗口；跨角色 e2e/T3/Electron 归测试。无新的持续独立责任 |
| 2. 范围归属 | **现有 Section 1 覆盖；无角色/边界变更** | 方案 §7 路径逐个映射（§四）；`test/桌面应用/` 逐文件授权、默认只改既有精确文件；唯一既有文档漂移按 §4.6 闸门 2 条件处理 |
| 3. 契约影响 | **有，跨层公共出口与治理去重语义** | 新增 `completeRoleCardsStep` 经 `flow-state.ts` 公共出口；指纹/去重键/账本锚/readiness 文案是跨层契约。单一主属：函数与 flow 写入 → 编排；桌面消费/去重/文案 → 桌面窗口；e2e → 测试。编排先冻结，桌面再消费 |
| 4. 证据独立性 | **已满足** | 编排/桌面各自跑单元/层测试；测试独立跑 e2e、T3 全量、真实 Electron、目标项目只读复算；内置独立验收判定；实施者不自验，统筹不改结论 |
| 5. 协调成本 | **维持现有团队最低** | 3 个现有实施 worker（编排、桌面窗口、测试）+ 内置独立验收 + 统筹；不新增角色，不启用人事/装配/桌面UI/其他角色 |

**决策表结果：不变，派现有角色。** 无新增、无拆分、无合并、无角色卡改动。**不启用人事**（无角色/边界变更；`flow-state.ts` md 漂移若需补登见 §4.6，属既有条目文档对齐）；**不启用装配**（`app/main.ts`/`app/preload.cjs`/渲染层不改，`completeRoleCardsStepFn` 沿用 `completeAcceptanceStepFn` 的默认静态导入）；**不启用桌面UI**（`app/renderer/**` 不改，刷新由既有 `refreshProject → listProject` 承担）；**不启用其他角色**（不改 `src/common/shared/`、`src/model/`、门禁引擎、运行时核心、项目管理）。

**条件项（不是默认）**：① 若确需在 `test/桌面应用/` 新建文件，该目录是逐文件授权，触发改边界，必须停止回报，由 ANS 人事按闸门 2 额外确认补精确单文件条目；本计划默认不新建。② 若 `test/桌面应用/e2e/main.mjs` 必须修改才能产生 `E2E_PASS`，该文件不在任何实施写集内，停止回报，不默认改。③ `test/桌面应用/acceptance-dispatch.test.ts` 仅在触发面/去重断言确受影响时修改（既有精确文件）。

**考虑过的选项**：A 现有角色 + 内置验收 + 统筹（采用：写集与 Section 1 一一对应、协调成本最低）；B 新增“治理推进”专职角色（否决：一次性跨层修复，无持续独立责任）；C 拆分编排 flow-service/公共出口（否决：同一私有 common/pipeline 出口，无过载证据）；D 一个角色包办（否决：跨编排/桌面/测试边界）；E 项目 `角色卡/独立验收` worker（否决：其 Section 1 不含 `docs/acceptance/`，且双重验收）；F 显式重新校验动作 / G watcher（否决：Q5/Q2 已确认不做，如改变需重开闸门 1/2）。

---

## 四、参与角色、精确写集与边界

### 4.1 编排（契约先行）

- **写集**：
  - `src/common/编排/flow-service.ts`：新增应用专用 `completeRoleCardsStep`（与 `completeAcceptanceStep` 同层）及内部 helper。输入 `{projectRoot, flowId, roleIds, validatedFiles:[{path,sha256}], fingerprint, appointmentArtifactPath?}`；行为按方案 A5：文件仅限目标角色六文件且重读核对 sha256（不一致返回 `role-cards-stale`）；按步骤 `kind` 生成证据（`dispatch` 要求账本已有 `dispatch.accepted{flowId, stepId:"role-cards"}`；`artifact` 写 `.ans/governance/role-cards/<flowId>/<fingerprint>.json` 并追加幂等 `artifact.observed`）；已 done 幂等；终态拒绝；缺步骤/不支持 kind 返回明确错误；共用 per-project 串行队列、候选 YAML 复核与原子写；写 `flow.role-cards.completed`，view actor `app/app`；**不写 `customer.decision`**。
  - `src/pipeline/orchestration/flow-state.ts`：再导出 `completeRoleCardsStep`（桌面唯一公共出口；不复制逻辑、不做二次判定）。
  - `test/编排/flow-service.test.ts`：done + evidence；幂等；终态拒绝；stale 哈希；越界路径拒绝；`artifact.observed` 幂等；不写 `customer.decision`；候选 YAML 重新解析与原子写失败不破坏原文件。
  - `src/pipeline/orchestration/run-role.ts`：**预计无功能改动**；不注册为角色工具、不进 `AdapterCapabilities`。若确需再导出，必须说明理由且只限该文件既有导出纪律，不改变角色工具面。
- **不写**：`src/model/**`、`src/common/shared/**`、`src/provider/**`、`src/service/**`、`src/common/门禁引擎/**`、`app/**`、`test/桌面应用/**`、`test/测试/**`、其他角色目录、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约/交付**：返回码与证据 schema、幂等/终态/stale 语义、`flow.role-cards.completed`；正/负例矩阵与原始命令输出；候选哈希。

### 4.2 桌面窗口（依赖编排公共出口）

- **写集**：
  - `app/desktop/interface.ts`：`postWriteAdvanceDispatched`/`applicationDispatchCommitted`/`applicationConvenerDispatchKey` 版本化键（指纹 + 最近 Crew 写卡位置，成功后清理旧键）；`appendApplicationDispatch` 同键去重；`appointmentArtifactFeedback` 改为内容指纹；`runPostWriteAdvanceCheck` 按“校验 → 反馈或完成 role-cards → 派 Convener”顺序；`listProject` 后廉价探针 + 250ms 合窗；账本锚点；防自激（仅 listing 签名变化或实际动作时 `emitProjectChanged`）；deps 新增 `completeRoleCardsStepFn` 与静态导入（沿用 `completeAcceptanceStepFn` 模式）。
  - `app/desktop/governance-advance.ts`：`buildRoleReadinessTaskMessage` 新增可选 `roleCardsDone?: {evidenceRef:string}`、`roleReadinessAlreadyDone?: boolean`；未传时 v1/v2/v3 文案逐字不变。
  - `test/桌面应用/interface.test.ts`：可重入正/负例（两次错误写卡 → 两次反馈；修正 → 通过；role-cards 恰一次 done、readiness 恰一次派发；无客户卡/无 `customer.decision`）；同内容去重、内容变化重报；手工改文件 + `listProject` 触发；跨重启账本锚（目标项目形态）；artifact/dispatch 两种 kind、缺步骤、已 done 幂等、终态拒绝、stale 不派；逆序 boundary 回归；防自激；legacy/v2 逐字/逐行为不变。
  - `test/桌面应用/acceptance-dispatch.test.ts`（**条件**）：仅当触发面/去重断言受影响时修改既有文件。
- **硬约束**：**不得在 `test/桌面应用/` 新建文件**；不得改 `app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/**`、`package.json`/`tsconfig.json`/`vite.config.ts`、角色卡/边界。**公开契约/交付**：桌面团队计划读取/写卡校验结果、readiness 文案；不新增/改 IPC、客户入口、派发权；精确测试 + typecheck 原始输出；候选哈希；无越界写。

### 4.3 测试（独立 e2e / T3 / 真实 Electron）

- **写集**：`test/测试/governance-e2e-auto/`（目录授权；可并入既有 `l-crew-write-validation.test.ts` 或新增用例，不新建其他目录）。
- **内容**：① 全链路 e2e：错误写卡 → 反馈 Crew → 重写 → 通过 → role-cards done（证据可核对）→ readiness 恰一次派发 → 同内容不重复；旧账本（appointment 后旧 app→Convener、之后 Crew 写卡）不挡；无客户卡、无 `customer.decision`。② 目标项目只读复算：复制 `ans-gateway` flow/账本到临时夹具，断言旧条目不再挡、当前指纹可放行；原项目零写入（前后哈希/只读核对）。③ 基线/终验：`npm run typecheck`、受影响套件、T3 全量（排除 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式）。④ 真实 Electron：执行既有 `test/桌面应用/e2e/main.mjs`，记录 `E2E_PASS` 原始输出；**不修改该文件**（若必须修改，停止回报）。
- **不写**：产品源码、其他角色单测、`test/桌面应用/`（由桌面窗口 owner 处理）、`test/编排/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。**可观察交付**：基线/终验命令、退出码、计数、失败原文与分类；e2e/Electron/复算证据；候选哈希与 `git status`。

### 4.4 内置独立验收与统筹

- **内置独立验收**：闸门 2 后、实施前写 `docs/acceptance/governance-advance-redispatch-criteria-v1.md`；实施后写 `...-report-v1.md`；不使用项目 `角色卡/独立验收` worker；不改调度结论。
- **统筹**：写本计划与 `docs/scheduling/governance-advance-redispatch-change-v1.md`（变更包）；负责派发、收证、阶段放行与记录；不写产品/测试/验收文档。

### 4.5 边界覆盖与缺口（2026-10-23 核对）

| 路径 | 角色 | 依据 | 状态 |
| --- | --- | --- | --- |
| `src/common/编排/flow-service.ts` | 编排 | `角色卡/编排/boundary.md`「目录（私有）`src/common/编排/`」 | 覆盖 |
| `src/pipeline/orchestration/flow-state.ts` | 编排 | **只在 `角色卡/编排/boundary.yaml`，未在权威 `boundary.md` Section 1**（Markdown/YAML 漂移） | **闸门 2 条件**：由 ANS 人事/Governance 在 md 补登同一单文件条目并保持 YAML 同步；未补登前不派编排写该文件，或客户明确以 YAML 既有条目为本任务授权依据（不是新扩权，是既有条目文档对齐） |
| `test/编排/flow-service.test.ts` | 编排 | 「目录（测试）`test/编排/`」 | 覆盖 |
| `app/desktop/interface.ts`、`governance-advance.ts` | 桌面窗口 | 「目录 `app/desktop/`」 | 覆盖 |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 精确单文件 | 覆盖 |
| `test/桌面应用/acceptance-dispatch.test.ts` | 桌面窗口 | 精确单文件（当前工作树 `boundary.md` 已由目录 v3 补入；若该改动未落地/被回退则回到逐文件缺口） | 条件覆盖；默认不改，仅在触发面/去重断言受影响时修改 |
| `test/测试/governance-e2e-auto/**` | 测试 | 「目录（测试）`test/测试/`」 | 覆盖（可在目录内新建用例） |
| `docs/acceptance/*`、`docs/scheduling/*` | 内置验收/统筹 | 技能内置写权 | 覆盖 |

**新文件缺口**：桌面窗口不得在 `test/桌面应用/` 新建文件；确需新文件时停止并回报统筹，交人事/闸门 2 补精确单文件条目，不默认派发。**Electron 自检台**：`test/桌面应用/e2e/main.mjs` 属桌面窗口既有精确文件但不在本计划写集；若必须修改，停止回报。其他方案路径均被现有 Section 1 覆盖。

### 4.6 明确不改

`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/common/shared/**`、`src/model/**`、`src/common/门禁引擎/**`、`src/provider/**`、`src/service/**`、角色卡/边界/YAML、`package.json`/`tsconfig.json`/`vite.config.ts`/`electron-builder.yml`、`docs/acceptance/**`（内置验收按标准/报告写除外）、`docs/communication/**`、`docs/planning/**`；不改 i18n B0/B1–B4 与目录 v3 的既有候选。各角色自身 `角色卡/<role>/docs/` 变更记录不属本任务写集；证据以候选哈希、原始输出与交接报告为准。

---

## 五、阶段、依赖与并行（S1–S6）

| 阶段 | 角色 | 可观察交付 | 入口/出口 |
| --- | --- | --- | --- |
| **S1 闸门 2 + 实施授权** | 沟通 → 客户；统筹提交 | 闸门 2 确认记录（参与角色/写集/无边界变更/T3/顺序/验收/证据口径）；客户实施授权记录（分开） | 入口：本计划写盘；出口：两者齐备 |
| **S2 标准 + 基线** | 内置独立验收（标准）；测试（基线），可并行 | `docs/acceptance/governance-advance-redispatch-criteria-v1.md`；当前 HEAD/工作树 typecheck、受影响套件、全量基线（排除 write-sequencing）、失败分类、目标文件哈希 | 入口：S1；出口：标准经沟通确认 + 基线可复算 |
| **S3 编排契约** | 编排 | `completeRoleCardsStep` + `flow-state.ts` 公共出口 + `test/编排/flow-service.test.ts`；定向测试/typecheck；公共契约冻结 | 入口：S2；出口：函数/返回码/证据 schema 稳定，测试通过，候选哈希 |
| **S4 桌面消费** | 桌面窗口 | 可重入门禁、指纹去重、刷新探针、账本锚、readiness 文案；精确测试/typecheck；无越界写 | 入口：S3 公共出口冻结 + 共享文件无并发写（§5.2）；出口：测试通过，legacy/v2 行为不变，候选哈希 |
| **S5 终验** | 测试 | 全链路 e2e、T3 全量、真实 Electron `E2E_PASS`、目标项目只读复算、失败分类 | 入口：S3 + S4 完成（e2e 夹具可在 S3 后准备，最终运行必须对 S4 候选）；出口：证据齐全 |
| **S6 变更包 + 判定** | 统筹 → 内置独立验收 | `docs/scheduling/governance-advance-redispatch-change-v1.md`；`docs/acceptance/governance-advance-redispatch-report-v1.md`（通过/返工/证据不足） | 入口：S5；出口：报告按当前候选判定 |

### 5.1 串行/并行规则

- **必须串行**：S1 → S2 → S3 → S4 → S5 → S6；S3 契约冻结先于 S4 消费；S4 完成先于 S5 终验；S5 完成先于 S6 判定。放行/发布不在本变更内。
- **可并行**：S2 的标准与基线（写区不同）；S5 内测试按模块分片（每分片独立临时根/端口/日志，不共享可变夹具）。
- **不允许**：S3 与 S4 并行写引用 `completeRoleCardsStep` 的桌面代码；S4 完成前对最终候选跑“终验”并声称通过；任何角色写 `docs/scheduling/` 或 `docs/acceptance/`；任何角色写 `test/桌面应用/` 新文件；任何角色改角色卡/边界/枚举/目标项目。
- **S2 出口**：标准含验收表、T3 依据、pass/fail/insufficient evidence/not applicable 规则、证据计划、版本/哈希冻结；基线含命令、环境、计数、失败清单与分类；未确认不派实施。
- **S3/S4/S5 出口**：S3 返回码/证据 schema 冻结，`run-role.ts` 无功能改动（或按说明仅再导出），无 `customer.decision`；S4 可重入/去重/探针/锚/文案完成，旧账本放行、逆序 boundary 通过、防自激、legacy/v2 不变；S5 e2e 通过、T3 与基线逐项对照、`E2E_PASS`、目标项目零写入且复算可复现、失败分类完整。

### 5.2 与既有 i18n / 目录 v3 的共享文件顺序

| 共享文件 | 本变更 | 既有改动 | 排序要求 |
| --- | --- | --- | --- |
| `app/desktop/interface.ts` | 去重/指纹/探针/完成与派发 | i18n B0/B3、目录 v3 | 既有写入冻结后本变更再写；同一文件不并发 |
| `app/desktop/governance-advance.ts` | readiness 文案 | i18n B3、目录 v3 | 同上 |
| `test/桌面应用/interface.test.ts` | 可重入/去重/文案断言 | i18n B0/B3、目录 v3 | 同上 |
| `test/测试/governance-e2e-auto/*` | 全链路 e2e | 目录 v3 夹具/链路 | 以工作区哈希为基线，只追加本变更用例 |
| `src/common/编排/flow-service.ts`、`flow-state.ts`、`test/编排/flow-service.test.ts` | 本变更主写 | 无既有改动 | 直接写 |

- **候选隔离**：S3/S4 入口记录写集内文件 `git hash-object` + `sha256sum` 基线；变更包只列相对基线变化的路径；i18n/目录 v3 既有改动声明为“既有上下文”，不纳入本变更候选，也不为其背书。
- 若 i18n 或目录 v3 在 S4 前仍在写共享文件，S4 等待其冻结；不并发写、不顺手改它们的 key/契约/候选。

---

## 六、证据要求

### 6.1 通用证据（每个实施角色）

1. **写前基线**：目标文件 `git hash-object` + `sha256sum`、`git rev-parse HEAD`、`git status --short`；与本计划记录不一致时停止回报。
2. **候选身份**：每个改动文件工作区 `git hash-object` + `sha256sum`（CRLF/LF 分别记录）；新增文件同。
3. **改动范围**：`git diff --name-only` + `git status --short` 必须落在该角色写集内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
4. **原始输出**：命令、退出码、环境（Node/npm、OS/Shell）、计数（pass/fail/skip/todo）、失败原文；跳过项写明原因；实现完成但未验收写 `implemented-unverified`，不写 `verified`。
5. **禁止**：不提交、不推送、不合并、不发布；不改断言保绿；不把计划写成结果；不伪造测试输出。

### 6.2 逐角色最低检查

| 角色 | 检查 | 证据 |
| --- | --- | --- |
| 编排 | `node --test test/编排/flow-service.test.ts`（可按需 `"test/编排/**/*.test.ts"`）；`npm run typecheck` | done/幂等/终态/stale/越界/`artifact.observed` 幂等/无客户决定；计数；候选哈希 |
| 桌面窗口 | `node --test test/桌面应用/interface.test.ts`（+ 条件 `acceptance-dispatch.test.ts`）；`npm run typecheck` | 可重入/去重/刷新/跨重启锚/两种 kind/逆序/防自激/legacy 不变；无客户卡/无 `customer.decision`；计数；候选哈希 |
| 测试 | 定向 e2e；`node --test "test/**/*.test.ts"`（排除 `test/pi-adapter/write-sequencing.test.ts`）；`npm run typecheck`；真实 Electron `test/桌面应用/e2e/main.mjs` | 基线/终验计数与失败分类；e2e 全链路；`E2E_PASS`；目标项目只读复算；候选哈希/diff/status |
| 内置独立验收 | 按标准核对证据、复核候选哈希与原始日志 | 报告：通过/返工/证据不足；不改调度结论 |

### 6.3 T3、Electron 与目标项目

- **T3 全量**：最终候选跑 `node --test "test/**/*.test.ts"`（排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`，记录排除方式）、`npm run typecheck`；`npm run typecheck:renderer` 默认 N/A（不改渲染层产品代码；如共享契约影响渲染层类型则补跑并记录）。基线与终验逐项对照：本次新增失败 / 既有失败（Windows symlink EPERM、桌面时序偶发）/ 环境不可用/跳过；任一新增失败不得放行。
- **真实 Electron**：执行既有 `test/桌面应用/e2e/main.mjs`，记录命令、时间、退出码与含 `E2E_PASS` 的原始输出；缺失或失效不得建议 accept。
- **目标项目只读复算**：复制 `ans-gateway` 的 flow/账本到临时夹具，断言“旧条目不再挡、当前指纹可放行”；原项目零写入（前后哈希/只读核对）；复算结果不等于目标项目已修复。
- **无客户卡/无 `customer.decision`**：e2e 与桌面测试断言不产生客户卡、不写 `customer.decision`；应用只记录确定性结构校验结果。**失败分类**：既有 EPERM；桌面并发/时序偶发（隔离/整文件/串行复跑）；`write-sequencing` 挂起（排除并记录）；其他新增失败停止回报，不以“环境问题”笼统带过。

---

## 七、验收安排

- **实施前标准**：`docs/acceptance/governance-advance-redispatch-criteria-v1.md`，由内置独立验收在闸门 2 后、S3 前写盘；基于客户确认的方案 A v1 与闸门 0/1 记录，不得弱于方案 §8.3 验收要点。
- **实施后报告**：`docs/acceptance/governance-advance-redispatch-report-v1.md`；结论只能是**通过 / 返工 / 证据不足**；报告首行含风险档位、判定依据、选定检查、复用证据、全量回归（已执行或 N/A + 理由）。
- **独立验收**：技能内置独立验收，不使用项目 `角色卡/独立验收` worker；统筹不改验收结论。
- **不合并判定**：候选、标准、报告、变更包与 i18n、目录 v3 全部分开；本变更结论不为它们背书，也不引用它们的结论替代本变更证据。
- **T3 证据**：全量回归 + 真实 Electron + 目标项目只读复算 + 夹具全链路 e2e；缺一即 `insufficient evidence`。验收通过只表示当前候选满足标准 v1，不授权提交、推送、合并、发布。

---

## 八、闸门 2 待客户确认项

1. **参与角色**：编排（`completeRoleCardsStep` + `flow-state.ts` 公共出口 + 单测）、桌面窗口（`interface.ts`/`governance-advance.ts`/精确测试）、测试（e2e/T3/真实 Electron）为实施 worker；内置独立验收负责标准与判定；统筹负责计划、派发、收证、变更包与记录。**不启用人事、装配、桌面UI、门禁引擎、运行时核心、项目管理及其他角色**。
2. **精确写集**：按 §4.1–§4.3；`test/桌面应用/` 只改 `interface.test.ts` 与条件 `acceptance-dispatch.test.ts`；**不得新建文件**；确需新文件必须停止回报，由人事/闸门 2 补条目。
3. **无角色/边界变更**：角色集合、权限模型、枚举、边界条目不变；唯一待对齐项是 `src/pipeline/orchestration/flow-state.ts` 的 Markdown/YAML 漂移（YAML 已有、md 未列），需人事在 md 补登或客户明确以 YAML 既有条目为本任务授权依据；不是扩权。
4. **档位**：**T3**；适用 T3 全量回归 + 真实 Electron + 目标项目只读复算 + 夹具 e2e；报告首行五项（档位、判定依据、选定检查、复用证据、全量回归）。
5. **阶段顺序**：S1 闸门 2 + 实施授权 → S2 标准 + 基线 → S3 编排契约 → S4 桌面消费 → S5 终验 → S6 变更包 + 独立验收；放行/发布不在本变更内。
6. **验收安排**：内置独立验收写 `docs/acceptance/governance-advance-redispatch-criteria-v1.md` / `...-report-v1.md`；标准先于实施；不与 i18n/目录 v3 合并判定。
7. **证据口径**：候选哈希、原始命令/退出码/计数/失败原文、T3 全量、Electron `E2E_PASS`、目标项目只读复算、无客户卡/无 `customer.decision`、无越界写；失败按既有 EPERM/桌面偶发/write-sequencing 挂起分类；管理记录不纳入产品候选。
8. **实施授权与闸门 2 分开**：客户可先确认角色指派/写集，再另行给出实施授权；未给前不派发、不改代码。
9. **既有改动隔离**：当前工作树含 i18n B0/B1–B4 key/契约与目录 v3 既有改动；本变更独立候选、独立验收，不改变其结论；共享文件按 §5.2 串行写。
10. **方案不变**：客户已在闸门 1 确认方案 A 与 Q1–Q8；本计划不自行加显式动作、不扩权、不改目标项目、不新增 watcher/枚举；若需改变，重开闸门 1/2。

---

## 九、风险与阻塞

1. **重复派发/重复账本**：版本化键 + 通过记录/最近 Crew 写卡锚 + `applicationDispatchCommitted` 同键 + `running/pending` 合窗；测试覆盖双击/连续 settle/重启。
2. **刷新自激**：廉价探针先于 listing 刷新；`emitProjectChanged` 仅在 listing 签名变化或实际反馈/派发/完成动作时发出；专项测试防 `listProject → 检查 → projectChanged → listProject` 循环。
3. **指纹读取成本**：仅“有待校验/待派发”的 flow 读取（7 角色 × 6 文件 + 团队计划）；250ms 合窗；role-cards done 且 readiness 已派发后探针不再读文件。
4. **role-cards 证据语义**：`.ans` 记录只证明结构校验，不代表 readiness/验收/客户批准；记录与文案都写明，避免 Convener/验收误读。
5. **目标项目现状**：`role-cards` 仍 `dispatched`、`role-readiness` 已 done；readiness 文案必须说明“不要重做”；本变更不写目标项目，实际结果以只读复算为准。
6. **同类 Crew appointment 去重未纳入**：`appointment-crew`/nominator 账本去重仍可能挡同一 flow 的重新任命；属同类缺陷但不在本轮范围，列为后续，不静默修改。
7. **legacy/v2 兼容**：无团队计划/无 `role-cards` 步骤的旧流程保持旧文案与旧行为；不得批量改夹具；至少保留一条 legacy 链路。
8. **既有 i18n/目录 v3 改动混入**：候选隔离 + 共享文件冻结 + 变更包只列本变更 hunk；不得用本变更验收为它们背书。
9. **终态不可回退**：`role-cards` done 后文件再被改坏，flow 不会自动 reopen；由 readiness/后续验收与 flow supersede 处理，本轮不新增 reopen 语义。
10. **边界/授权缺口**：`flow-state.ts` md 漂移需闸门 2/人事对齐；`acceptance-dispatch.test.ts` 条件覆盖；`test/桌面应用/` 不得新建；`test/桌面应用/e2e/main.mjs` 不在写集；任一未闭合即阻塞，不默认派发。
11. **环境与全量成本**：Node 不在当前 PATH；Windows symlink EPERM、桌面时序偶发、`write-sequencing` 挂起均需基线对照；S2 先测基线，终验只对新增失败负责。
12. **不伪造决定**：任何分支都不写 `customer.decision`、不弹客户卡、不伪造 role-cards 结论；测试必须断言。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md`）。
- **未确认**：闸门 2（参与角色/写集/无边界变更/T3/顺序/验收/证据口径）与客户实施授权。
- **未写盘**：实施前验收标准（内置独立验收在闸门 2 后写 `docs/acceptance/governance-advance-redispatch-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改源码/测试/角色卡/边界/方案/沟通记录/验收文档；未写目标项目。
- **下一步**：交沟通 → 客户闸门 2（含 `test/桌面应用/` 逐文件授权与 `flow-state.ts` 漂移处理）→ 客户实施授权 → 内置独立验收写标准 + 测试跑基线 → 按 S3–S6 派发。若客户改变方案 A/Q1–Q8 或要求扩权/改目标项目，重开闸门 1/2。
