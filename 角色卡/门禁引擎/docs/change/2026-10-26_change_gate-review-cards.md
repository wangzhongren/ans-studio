# 变更记录：Gate 复核角色卡文本（Steward 证据完整性 + request_gate_review；Proof gate 复核）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-26
- 角色：门禁引擎（Gate Engine）
- 任务：`2026-10-26-design_proof-gate-reviews` §6/§7/§10（A1/A2/A5/A6）——内置治理角色卡文本
- 依据：
  - 客户 2026-10-26 **追加授权实现** `request_gate_review` 与设计 §4–§8、§12 的 gate 机制（`角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` v3 `approved-implementing`）；客户追加要求：**gate 复核独立于最终验收**、**防吹毛求疵**（gate `fail` 至少一个 blocker/major；只有 minor/nit 的 fail 按结构不符退回 Proof、不触发返工；`pass` 可带 minor/nit 备注）。
  - 客户 2026-10-26 **追加要求（同日、经协调方转达）**：**主理（Lead / liaison）收到系统消息时，只向客户汇报，不得给 Steward 发任务 / 不得 `dispatch_task`**——系统消息包括 `[系统·治理协调]`、gate pass / fail 系统行、交付 / 阻塞通知等；客户明确要求或客户消息触发的协调仍按原规则（客户消息不是系统消息）。
  - 项目规则 `角色卡/项目管理/docs/project-rules.md` §二 第 12 条「gate 复核-01」。
  - 运行时核心契约（已落树、只读核对）：`src/model/runtime.ts` 的 `RequestGateReviewInput` / `RequestGateReviewResult` / `RequestGateReviewFn`（`flowId?` / `gateId` / `note?`；冻结 code `dispatched | already-dispatched | gate-not-found | criteria-missing | flow-incomplete | unavailable | rejected`）。
  - 项目管理共享 i18n（只读核对）：`main.gateReview.*` 13 个 key（回执 / 系统行 / 防吹毛求疵文案）。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `CONVENER_CARD_TEXT` / `VERIFIER_CARD_TEXT` / `LIAISON_CARD_TEXT` 产品数据文本、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/liaison-role.test.ts`、本角色 changelog / memo / feature-map 与本变更记录。未改 `src/common/编排/**`、`app/**`、`src/model/**`、`src/provider/**`、共享 i18n、flow/桌面/模型实现或 `demos/`；未 commit / push；未重启应用；未跑真实 Electron / 浏览器。

## 1. 写前核对与基线

- `git rev-parse HEAD` = `5bd9fe48194c48de8898e1c85aad2c8c386a3aea`（分支 `feat/scaffold-first-governance`）。
- `node --version` / `npm --version` = v24.22.1 / 11.19.1。
- 工作树已有其他角色在飞改动（共享 i18n、编排 / 运行时核心 / 桌面 / 项目管理文档），**不含本批目标文件**；本批开始前未单独复跑全套基线（并行编辑中，数字浮动），以写后结果为准。
- 写后候选哈希（`git hash-object` / `sha256sum`）：
  - `src/common/门禁引擎/governance-roles.ts` = `b4b45a89cea2d18a9e5bbe66de480dcf0b8a59fd` / `653c5c2baf08aac296bda08a83e7fd34e49ad33f9746aff035975c37d079bf22`
  - `test/门禁引擎/governance-trio.test.ts` = `edd2cb6fac94cd4db4eb400f4659d7932ea94d32` / `3645dab0c2fbd1fc2f8105f0cfdb39e95ebd3337aba712d16495689ff242a6bb`
- 后续仅改本角色文档（changelog / memo / feature-map / 本文件）不改变上述代码候选。

## 2. `CONVENER_CARD_TEXT`（Steward / 统筹）

### 2.1 「Gate 规划（必须）」：从 rules-only 规则改为已授权的 flow 表达与默认矩阵

- **flow 表达**：gate 是**现有 `kind: artifact` 步骤 + 可选 `gateKind` 元数据**（`vertical-slice` / `visual-baseline` / `integration-performance`），**不是新 `FlowStepKind`**；`gateKind` 未知值 / 其它 kind 携带被应用拒绝。最终客户验收沿用现有 `verification` / `acceptance`（`kind: acceptance`），**不属于 `gateKind`、不写成 gate 步骤**（删除旧 `gate-final-acceptance` 示例）。
- **gate 步骤字段**：id `gate-<slug>`（不得占用保留验收 id）、`owner: verifier`、`kind: artifact`、`status: pending`、`gateKind`、`evidence.ref` 指向 `docs/acceptance/<flowId>-<gateId>-report-v1.md`（应用按最新报告版本重写）、`dependsOn` 前置交付。
- **默认矩阵**：按风险档 T0–T3 × 产品类型（纯文档 / 后端 / CLI、UI / 桌面 / Web、游戏）给出默认 gate；档位取团队计划 / 变更包较高者，**gate 数量只增不减、不得减少默认 gate**（客户书面豁免并记录除外）；`qualityTier: prototype` 不豁免 gate。
- **三类 gate 复核口径**：垂直切片（脚手架 + 首个端到端切片）、视觉基线（真实浏览器 / 游戏、关 DEBUG 截图）、集成 / 性能（e2e / 性能预算 / Reduce manifest 对账）。
- **标准节单一来源**：最新 `docs/acceptance/<flowId>-criteria-vN.md` 为每个 gate 增加标题含精确 `gateId` 的「Gate 复核标准」节；缺节 ⇒ `request_gate_review` 返回 `criteria-missing`，由 Proof 补 / 递增，统筹不写 `docs/acceptance/**`。
- **下游硬拦**：下游 `delivery-*` / Reduce / 证据步骤把 gate 写进 `dependsOn`；gate 未 `done` ⇒ `dependencies-not-done`、ready 不提示、`evaluateFlowCompletion` 不可达；不引入图 schema、V 系列静态校验维持现状。
- **失败与返工 + 防吹毛求疵**：fail/conditional 含 blocker/major ⇒ 应用记录失败并按返工路由交统筹，统筹用 `flow_step_supersede` / 新版本步骤建返工、任务带 severity/reason/targets，返工后**重新请求**同一 gate；**只有 minor/nit 的 fail 属结构不符 ⇒ 退回 Proof 补报告、不触发返工**；minor/nit 为非阻断备注，不反复开 gate。
- **Proof 独判、统筹不自审**：统筹只做证据完整性检查后调用 `request_gate_review({ flowId, gateId })`；不得自查代替、不得自己标 gate 通过、不得代写 gate 报告；**gate 复核 ≠ 验收通过 ≠ 客户批准**。
- **范围**：不新增 `FlowStepKind` / 治理角色 / cardKind；`request_gate_review` 只注入统筹会话；`request_acceptance` 仍是最终验收唯一主动通道；无 gate 的旧 flow 行为逐字不变。

### 2.2 「证据完整性与 gate 协调（必须）」：机械清单 → 主动请求 → 回执 → 返工 → 与最终验收分开

- 职责收缩为「**证据完整性检查、gate 复核请求与返工协调**」；只判「齐不齐」、不判「好不好」；不对画面 / 实现质量下结论。
- 新增 **gate 证据完整性机械清单**：依赖 done 且账本可对账（`dispatch.accepted` / `artifact.observed` / `customer.decision`）、最新 criteria 含 Gate 复核标准节、视觉门真实运行 / 演示步骤 done + 路径存在、集成 / 性能门步骤 done + 性能证据路径存在、无在途工作；**文件存在 ≠ 内容合格，统筹自查 ≠ Proof 复核**。
- 新增 **主动请求**：清单齐备后完成即主动 `request_gate_review({ flowId, gateId })`；gate 步骤 `done` 只能由应用按 Proof 报告收口，统筹不得 `flow_step_update` 标 gate `done`（应用以 `gate-review-required` 拒绝）/ `delivered` / `dispatched`，不得代写报告。
- 新增 **冻结回执逐项处理**：`dispatched`（≠ 通过）/ `already-dispatched`（不重复提交，flow_get 核对）/ `gate-not-found` / `criteria-missing` / `flow-incomplete` / `unavailable` / `rejected`，全部如实、不伪造 / 不绕过 / 不原样死循环。
- 新增 **失败后返工协调**与**最终验收分开**（`request_acceptance` 只用于最终验收；gate 未 done ⇒ `flow-incomplete`；gate 失败 ≠ 客户拒绝）。
- 标准工作流第 1/2/6/7/9 步与「完成即主动 request_acceptance」章节同步：声明 gate 步骤、写 `dependsOn`、到点请求、gate done 应用收口、最终验收不跳过 gate、两条通道回执不混用。
- 流程工具纪律与 YAML schema 段补 gate 例外与可选 `gateKind` 字段约束。

## 3. `VERIFIER_CARD_TEXT`（Proof / 验收）

- 新增「**Gate 复核（gate 任务，必须）**」章节：
  - 收到 `gate-*` 任务后读最新 criteria 的 Gate 复核标准节 + `dependsOn` 证据 + 候选 / 流程版本，**亲自运行或打开真实输出**（不是只读转述日志 / 截图 / 摘要）。
  - UI / 游戏必须打开真实浏览器 / 游戏核对；**截图 / 录屏必须关闭 DEBUG 覆盖层**；DEBUG 覆盖层、旧候选截图、无法对应当前候选 ⇒ `insufficient evidence`（按 fail 处理，不通过）。
  - gate 报告 `docs/acceptance/<flowId>-<gateId>-report-vN.md`（首次 v1、重验递增、不覆盖）；证据附件 `docs/verification/<flowId>/<gateId>/`；复用 `acceptance-triage/v1`（恰好一个 fenced YAML 段），结论只允许 pass / fail / conditional。
  - **防吹毛求疵**：`pass` 允许空 items、也允许带 minor/nit；`fail` / `conditional` **必须至少一个 blocker 或 major**；只有 minor/nit 的 fail 属结构不符，应用退回补报告、**不触发返工**；禁止用 nit 开 fail。
  - 禁止：不发 `request_choice` / 验收卡、不写 `customer.decision`、不实现、不派发、不标任何 flow 步骤 done（gate 步骤 done 只能由应用按报告收口，Proof 不对 gate 步骤 `flow_step_update`）、不改 flow / 账本 / 返工范围。
  - gate 失败不实现 / 不派发 / 不返工，等统筹重新请求后写新版本报告；gate 报告 ≠ 最终验收报告；gate 失败 ≠ 客户拒绝。
- 分诊章节开头说明 gate 报告复用同一结构；质量职责新增三条 gate 要求；流程工具纪律新增 gate 步骤例外（Proof 不更新 gate 状态）。
- Proof 卡仍不含 `request_acceptance`（测试钉住），两条通道分离。

## 4. `LIAISON_CARD_TEXT`（Lead / 主理）：系统消息只汇报、不派任务（客户同日追加）

- 客户追加规则：**主理收到系统消息时只向客户汇报，不要给统筹（Steward）发任务 / 不要 `dispatch_task`**。系统消息包括 `[系统·治理协调]`、gate pass / fail 系统行、交付 / 阻塞通知等；这些只用于告知客户与主理，不得变成 Lead→Steward 的协调任务。客户明确要求或客户消息触发的协调仍按原规则（客户消息不是系统消息）。
- 落点：
  - 「工作流管理（Lead / 主理）」的 `dispatch_task` 条目追加约束：系统消息只向客户汇报，不得据此 `dispatch_task` 派 Steward / 统筹；只有客户明确要求或客户消息触发的协调才可派发。
  - 「治理协调（Lead / 主理）」新增「**系统消息只汇报、不派任务（必须）**」条目：收到系统消息时只向客户如实汇报（完成了什么、风险 / 阻塞、下一步或需要客户决定什么），不得给 Steward / 统筹 发任务、不得调用 `dispatch_task`，不得把系统消息当成客户指令；客户明确要求或客户消息触发的协调仍按原规则（客户消息不是系统消息）。
- 未改桌面系统行文案 / 编排 prompt（其他属主）；`dispatch_task` 能力位与客户消息路径（闸门 1 后 coordinate）保持不变。

## 5. 测试

- 重写 `governance-trio.test.ts` 的「Gate 规划」用例（原 rules-only 断言）：覆盖 flow 表达 / gateKind 枚举 / owner=verifier / T0–T3 矩阵 / 三类口径 / 标准节 / 下游硬拦 / 主动请求与回执 / 防吹毛求疵 / 未新增 FlowStepKind / `request_gate_review` 仅统筹卡定义；反向断言 rules-only 旧口径（「提前 gate 若当前没有通道」「不引入 `request_gate_review`、`gateKind`」「gate-final-acceptance」「原型档（任意产品）」等）必须消失。
- 扩展「证据完整性与 gate 协调」用例：新增主动 `request_gate_review`、`gate-review-required`、冻结回执、gate 与最终验收分开、minor/nit 不返工断言；保留原有「不判质量 / Proof 独判 / 不自审 / 不代替验收」与数据面零变化断言。
- 新增「Proof gate 复核」用例（A5）：取证、DEBUG、报告路径 / 版本化 / triage、防吹毛求疵、禁止事项、gate ≠ 最终验收 / ≠ 客户拒绝、质量职责、`request_acceptance` 不在 Proof 卡。
- `liaison-role.test.ts` 与 `governance-trio.test.ts` 同步断言 Lead 系统消息纪律：系统消息种类列明、只向客户汇报、不得给 Steward 发任务 / 不得 `dispatch_task`、不得当客户指令；客户消息路径（闸门 1 后 coordinate）与 `dispatchTask` 能力不回归。
- 现有断言未删除、未放宽；仅 rules-only 时期已被客户授权取代的断言改为新口径并加反向断言。

## 6. 验证结果（本批写后）

- `node --test test/门禁引擎/governance-trio.test.ts` ⇒ **exit 0，50 计 / 50 过 / 0 失败 / 0 skip**。
- `node --test "test/门禁引擎/**/*.test.ts"` ⇒ **exit 0，330 计 / 329 过 / 0 失败 / 1 Windows 既有 skip**。
- `npm run typecheck` ⇒ **exit 0，0 错**（中间一次复跑曾出现 6 条诊断，全在边界外 untracked 在飞文件 `test/编排/flow-gate.test.ts`（编排角色并行创建），已由编排属主修复；最终全仓复跑通过）。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 7. 未做 / 依赖其他角色 / 残余风险

- **卡文本是行为约束，不是实现证据**：`request_gate_review` 的应用实现（`requestGateReviewForProject` 校验 / 派发 / gate 记录 / 账本）、`completeGateStep`、`observeFlowArtifacts` 跳过 gate、`flow_step_update` 的 `gate-review-required`、gate 返工路由与重启恢复由编排 / 桌面角色实施，本批未验证。
- 工具只注入统筹会话（编排 / 桌面 `run-role.ts` / `session.ts` 侧）未由本批验证；能力缺席是 fail-closed 目标口径。
- 共享 i18n `main.gateReview.*` 由项目管理落地，桌面 / 编排消费接线未验证。
- `gateKind` Flow YAML 静态校验 / 解析 / 派发硬拦 / ready 提示 / observe 跳过由编排角色实现（`test/编排/flow-gate.test.ts` 属编排角色在飞测试，本批未越界修改、未运行其行为断言）。
- 防吹毛求疵的执行（fail 只有 minor/nit ⇒ returned-to-proof、不返工）依赖应用机械校验；卡文本只声明规则，未做端到端验证。
- 未真实运行应用、未做 steward/Proof 真机会话 e2e；模型是否遵从卡文本（主动请求、关 DEBUG、不代标）未验证。
- 未 commit / push、未重启应用、未触碰 `demos/`。
