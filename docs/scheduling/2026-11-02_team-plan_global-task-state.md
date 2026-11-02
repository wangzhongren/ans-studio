# 团队计划：全局任务状态 + 幕僚版本决策权（global task state / version authority）

- **任务 ID**：`2026-11-02-global-task-state`
- **flowId**：`global-task-state`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-02
- **状态**：团队计划已写盘；**未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档、未 commit/push**。预授权覆盖方案范围与推荐项，但 **B-1/B-2 是边界变更，尚未获客户确认**；闸门 2/边界确认前不派发。
- **闸门 0 + 预授权**：[`docs/communication/2026-11-02_intent_global-task-state.md`](../communication/2026-11-02_intent_global-task-state.md)（91 行 / SHA-256 `a25e6cf865d41b22640af4c302c04ba3c8f68a8a61612556f64fac0944a8f683`；客户选择「发卡确认」；预授权原话「我都同意，等下搞好了，直接安排去修改」及条件）。
- **客户确认的策划方案（实施基线）**：[`docs/planning/2026-11-02_design_global-task-state-version-authority.md`](../planning/2026-11-02_design_global-task-state-version-authority.md) **P1.1**（1283 行 / SHA-256 `369f666acb76ac88fe30854d84b2f08f3148a55c9ff53958185310ef5c3af910`；本计划写盘前实测一致）。
- **独立复核**：[`docs/planning/2026-11-02_review_global-task-state-version-authority.md`](../planning/2026-11-02_review_global-task-state-version-authority.md)（148 行 / SHA-256 `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`；**P1.0 复核快照 103 行 / `3b8d3a3ad407a1da71940d9d26b8aaa98665f50fc2759daafc27c57a8ae3fc07`**；P1.1 再复核结论「建议提交客户确认」；F1–F13 基本关闭，R1/R2 一般、R3–R5 建议）。
- **代码基线**：worktree `flow-improvements-wave1`，HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`。方案/复核/沟通文档未提交；产品/测试无本任务改动；未启用 task_ops。
- **风险档位**：**T3（不降档）**。新增治理决策权、账本共享契约加法扩展、跨角色工具/UI/run 生命周期；方案 §10.3 已定档。

---

## 一、任务与基线

### 1.1 目标（按 P1.1，不扩大）

1. 为幕僚（chief）提供**项目级、跨 flow 的全局任务状态**：focus flow/run、阶段、全部未收口任务及 blocked/failed 分开、阻塞/卡点、版本/证据指针、下一步；由应用从 `.ans/state/tasks.jsonl` 与 `.ans/runs/*/manifest.json` **即时派生**，不落第二份状态。
2. 幕僚通过受控工具管理 focus、阻塞备注、下一步（append-only 事件），不能改机器事实、run manifest、任务状态、文档或验收。
3. 幕僚可发起**版本决策**：版本修改（同一 flow 出 `-vN+1`，继续当前 run）或新版本开发（应用新建 flow/run，关闭旧 flow 的全部活动 run，保留旧产物）；复用 application-owned `decision` 卡，由客户或「替我决策」判断 agent 决定；应用只执行机器部分，不写文档、不派角色、不创建任务、不自动修复当前修仙 run。
4. 保持验收判定、证据规则、写权/边界、客户闸门、run-change 三模式、需求变更通道不变；roster/引用循环与 demo 重复投递是独立事项。

### 1.2 已知实施约束 R1–R5（必须进入实现与测试）

| 编号 | 约束 | 落点 |
| --- | --- | --- |
| R1 | active run 必须从**部分扫描结果**派生或新增可部分工作的纯函数，不能复用 all-or-nothing 的 `findActiveRun`；补「1 个坏 manifest + 1 个好 manifest」测试，合法 flow 的 active 标记仍正确；`listRunManifestsResult` 的既有 all-or-nothing 语义不改 | `src/common/编排/project-state.ts` 的 `scanRunManifestsForState`/`deriveActiveRunFromManifests`；`test/编排/project-state.test.ts` |
| R2 | 统一「通道超时」与「发起轮次中止」审计语义：超时/不可用写 `request.resolved`（`declined`/`unavailable`，不执行）；发起中止写 `request.orphaned(reason:"initiator-aborted")`，不写 `request.resolved`、不执行；晚到答案只记诊断/角色日志；同步方案时序图/契约/AC | P1.2 方案收口（策划）；`version-decision.ts`/`session.ts` 映射；`test/编排/version-decision.test.ts`、`test/桌面应用/version-decision.test.ts` |
| R3 | 执行期发现 pinned 时 fail-closed，不能落入 F5 的 `uncertain`；已 `request.orphaned` 的请求不进入「resolved 未执行」推断；执行期 pinned 写明确的 `version.decision(status:"failed", message:"run-change-required")`（或等价可审计终态），并补测试 | `version-decision.ts`、`session.ts`；`test/编排/version-decision.test.ts`、`test/桌面应用/version-decision.test.ts` |
| R4 | 「关闭旧活动 run」必须写「旧 flow 的**全部**活动 run（含多个 draft）」，不只请求带的 `runId`；同步契约/AC/卡面文案 | P1.2 方案 §4.3/§4.6/§7.2/AC-5.2；`version-decision.ts`/`session.ts`；测试断言全部 `closedRunIds` |
| R5 | 方案/复核引用必须标注 **P1.0 复核快照 103 行 / `3b8d3a3a…`**，不能把当前 148 行 / `22128e59…` 冒充 P1.0 快照；P1.2 收口时更新方案引用，不改写复核记录 | 策划 P1.2 方案头/§13；本计划 §1/§二已分别列两个快照 |

### 1.3 本轮非目标（不得顺手扩大）

- 不改验收判定/验收卡语义/证据路径/`evidence_check`；不改写权、边界、`resolveWrite`、`TaskScope`、forbiddenWritePaths、shell 守卫、版本化文档只读保护。
- 不改客户三道闸门、人事 D3/`appointment-write`、角色卡/边界文本；不改 run-change 三模式或自动批准；不改 `request_requirement_change`。
- 不自动修复当前修仙 run；不追溯修改 `xianxia-brotato-b/-c` 或 proposal/roster 历史；不处理 roster/引用循环与 demo 重复投递（独立事项）。
- 不自动派发、不自动写文档、不自动创建角色/任务、不自动关闭旧任务；不新增 `cardKind`；不把版本决策做成验收或范围批准。
- 不实施 O1/O3–O11（O2/O8 默认不做）；O2 只读状态快照文档不生成；O4 面板写操作不做；O7 自动终止/关闭旧任务不做。
- 不 commit/push/merge/release；不接触客户；不伪造 task_ops 机器状态或审批。

### 1.4 基线与输入快照

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `feat/flow-improvements-wave1` / `0a123109a6b10e9b60fd1aee5f08f861455c48de`（PR #32 已合并） |
| 工作树（写本计划前） | 已跟踪修改：`docs/communication/memo.md`、`docs/planning/memo.md`；未跟踪：本任务闸门 0/方案/复核。**产品/测试无本任务改动**（`git status --porcelain -- src app test` 为空） |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不伪造任务令牌/锁/预检 |
| 方案/复核/闸门 0 | P1.1 1283 / `369f666a…`；复核 148 / `22128e59…`（P1.0 快照 103 / `3b8d3a3a…`）；闸门 0 91 / `a25e6cf8…` |
| 测试基线 | 仓库现有 `test/**/*.test.ts` 389 个；`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起测试（T3 排除时必须记录命令与原因）；Windows symlink EPERM 属既有环境失败 |
| 现有契约/入口 | `src/common/编排/task-state.ts` 账本 kind 白名单；`run-manifest.ts` 的 `listRunManifestsResult`/`findActiveRun`/`closeRun`；`decision-card.ts` application-owned decision；`app/desktop/session.ts` 的 `withRequestLifecycle`/`restoreRequestState`；`src/provider/runtime/{tools,schema}.ts` 注入才注册；`src/model/runtime.ts` 事件/能力契约 |

---

## 二、预授权、闸门与停点

### 2.1 预授权范围核对

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| 意图/方案范围 | **在预授权内** | 全局任务状态 + 幕僚版本决策权；Q1–Q6 推荐 A、C1–C7 推荐、O1–O11 默认不实施；不改验收/证据/写权/闸门 |
| 角色集合 | **在预授权内，无新增角色** | 现有运行时核心/编排/桌面窗口/桌面UI/项目管理/装配/测试/人事/策划/独立验收/统筹/沟通足够 |
| 风险档位 | **T3，未改变方案定档** | 方案 §10.3；本计划不压档、不升档 |
| 精确写集 | **除 B-1/B-2 外均在既有 Section 1 内** | 见 §4.1/§4.5 |
| 边界变更 | **超出既有 Section 1：B-1/B-2 待客户确认** | `src/model/project-state.ts` 不在运行时核心；两个新 `test/桌面应用/*.test.ts` 不在桌面窗口逐文件授权 |
| 实施/提交/发布 | 实施按预授权可准备；**提交/推送/合并/发布仍另行授权** | 闸门 0 记录 §78–83 |

**结论：团队计划可在预授权内写盘并准备派发，但 B-1/B-2 是边界变更，必须先由沟通向客户请示；未确认前不创建新文件、不派 worker、不实施。** 这不改变方案范围/推荐项/T3。

### 2.2 闸门状态与停点

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-02）** | 客户选择「发卡确认」 |
| 客户预授权 | **已给（2026-11-02）** | 「我都同意，等下搞好了，直接安排去修改」；条件是方案/团队计划不越出已确认意图、推荐选项、写权/边界；边界/权限/档位变化需重新请示 |
| 闸门 1：方案确认 | **P1.1 草案 + 再复核；预授权覆盖方案推荐项** | 复核结论「建议提交客户确认」；本计划不重复要求闸门 1，但 P1.2 窄收口由沟通核对 |
| 闸门 2：角色/写集/边界 | **待确认（B-1/B-2）** | 本计划 §八；B-1/B-2 未确认前不派发 |
| 实施授权 | **预授权覆盖实施准备；边界确认后按计划派发** | 提交/推送/发布另行授权 |
| 实施前验收标准 | **V1 未写盘** | 内置独立验收在边界确认/实施前写 `docs/acceptance/global-task-state-criteria-v1.md` |
| 提交/推送/发布 | **未授权** | 本计划与实施期间不 commit/push |

### 2.3 闸门 2 与边界变更的先后

- 本计划写盘 → 沟通把 **B-1/B-2 + P1.2 窄收口 + 参与角色/写集/T3/阶段/V1/E2/证据口径**提交客户确认。
- 客户确认边界后，人事 H1 落 boundary.md/yaml；内置独立验收写 V1；测试 B0 建基线；之后 P1 实现提案 + 项目管理审核 → A0–A5 → D1 → E1/E2/E3。
- 若客户不接受 B-1/B-2，按 §9.2 的 **fallback** 改为既有目录内实现/扩展既有测试文件，重新核对写集；不得默认越界。
- 本计划不把「客户预授权」写成「B-1/B-2 已批准」；边界是独立事实。

---

## 三、五维判断与决策

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 全局状态派生属编排既有职责；类型/事件/工具属运行时核心；会话/发卡/执行/IPC 属桌面窗口；面板属桌面UI；i18n 属项目管理；P1.2 方案收口属策划；边界属人事。没有需要新设“全局状态专员”的独立知识/持续责任。 |
| 2. 范围归属 | **现有 Section 1 覆盖大部分；B-1/B-2 两个缺口** | `src/model/project-state.ts` 未列（运行时核心只列 `src/model/runtime.ts`）；`test/桌面应用/project-state.test.ts`、`version-decision.test.ts` 未列（桌面窗口逐文件授权）。其余目录/单文件均在既有边界内。 |
| 3. 契约影响 | **T3：共享账本事件/能力契约 + 新只读/决策契约 + 工具/IPC/UI** | `project-state/v1`、`version-decision/v1`、`task-state` 加法扩展、`GovernedToolsOptions`、preload/IPC、i18n。契约主属必须单一：运行时核心（Model/事件/工具 schema）→ 编排（派生/纯逻辑）→ 桌面窗口（生命周期/发卡/执行/IPC）→ 桌面UI（只读展示）→ 项目管理（i18n）。 |
| 4. 证据独立性 | **满足** | 实施角色写各自测试；测试角色做 T3 全量回归/E2E 与证据；内置独立验收另起上下文写 V1/E2；不把实现者自测当验收。 |
| 5. 协调成本 | **高但必要；不新增角色、不合并** | 契约先行的 5 个实施层（运行时核心/编排/桌面窗口/桌面UI/项目管理）+ 装配 README；若新增“全局状态”角色，会与既有五层重复建卡/契约/测试，成本大于收益。用串行共享文件和明确 owner 控制成本。 |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 运行时核心 | **保留 + 边界 B-1** | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`schema.ts` 在既有边界；新增 `src/model/project-state.ts` 需 B-1 |
| 编排 | **保留** | `src/common/编排/` 目录覆盖 `task-state.ts`、新 `project-state.ts`/`version-decision.ts`；`src/pipeline/orchestration/run-role.ts` 是既有单文件；`test/编排/` 目录覆盖新测试 |
| 桌面窗口 | **保留 + 边界 B-2** | `app/desktop/`、`app/main.ts`、`app/preload.cjs` 在既有边界；两个新 `test/桌面应用/*.test.ts` 未列，需 B-2 |
| 桌面UI | **保留** | `app/renderer/` 与 `test/桌面UI/` 目录授权；面板、bridge 类型、CSS、UI 测试与 E2E 夹具均在内 |
| 项目管理 | **保留** | `src/common/shared/` 与 `test/项目管理/shared/` 目录；i18n 两语言 + 计数/parity；另负责 P1 实现提案审核 |
| 装配 | **保留（轻量）** | `README.md`/`README.en.md` 单文件；F13 事件清单同步；不改 `package.json`（无新依赖） |
| 测试 | **保留** | `test/测试/` 目录、`角色卡/测试/docs/change/`；T3 全量回归、typecheck/build、Electron E2E、证据 |
| 人事（内置） | **保留（H1）** | 仅 `角色卡/运行时核心`、`角色卡/桌面窗口` 的 boundary.md/yaml/changelog；不改 id/显示名/职责/role-card |
| 策划（内置） | **保留（P1.2 文档收口）** | `docs/planning/`；只修 R2/R4/R5 表述/引用，不改 Q/C/O/范围/T3 |
| 内置独立验收 | **保留（V1/E2）** | `docs/acceptance/`；另起唯一验收主上下文 |
| 统筹/沟通 | **保留** | `docs/scheduling/`、`docs/communication/`；本计划/派发/收证/闸门/回报 |
| 产品/宣传/UIUX设计师/门禁引擎/各适配器/项目独立验收 worker | **不参与** | 本任务不写产品意图、宣传、设计原型、门禁表、适配器；不引入项目 worker |

### 3.3 决策表

**不变，派给现有角色；另需 2 项精确边界变更（B-1/B-2）和 1 项文档收口（P1.2）。**

- **无**新增角色、**无**拆分、**无**合并、**无**角色 id/显示名/职责描述变更。
- **B-1**：运行时核心新增 `src/model/project-state.ts`（共享 Model 类型）。
- **B-2**：桌面窗口新增 `test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`（两个精确测试文件）。
- **P1.2**：策划只收口 R2/R4/R5 的时序图/契约/AC/引用，不改范围/选项/T3。
- 其余全部路径在既有目录/单文件授权内；不改共享导出、工具 schema 之外的公共 API、`cardKind` 或验收/证据/写权/闸门。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有五层角色 + B-1/B-2 | **采用** | 写集与现有 Section 1 一一对应；契约、派生、会话、UI、i18n、测试职责分离；新增角色无持续独立责任 |
| B. 新增“全局状态/版本决策”专职角色 | 否决 | 跨 Model/编排/桌面/UI；建卡/边界/交接成本大于收益；会与既有 owner 重复 |
| C. 把运行时核心与编排合并 | 否决 | 破坏现有 Model/编排分层与写权；共享契约应留在运行时核心 |
| D. 把 `src/model/project-state.ts` 放进 `src/common/编排/` 以规避 B-1 | 不采用（备选） | 可避免 B-1，但让 UI/桌面依赖编排私有目录，破坏 Model 契约归属；若客户拒绝 B-1，按 §9.2 fallback 重新核对 |
| E. 扩展既有 `test/桌面应用/session.test.ts`/`interface.test.ts` 以规避 B-2 | 不采用（本计划默认） | 新集成面（全局状态/版本决策）需要独立文件；若客户拒绝 B-2，改为扩展既有文件并重写测试映射 |
| F. 直接修当前修仙 run/roster/demo | 否决 | 方案 §11.2 明确独立事项；本任务只提供能力，不自动修复 |
| G. 让应用自动派发/自动写文档 | 否决 | 改变派发权/任务质量；O11 不实施；幕僚按结果自行 `dispatch_task` |
| H. 新增 `cardKind` | 否决 | 复用 application-owned `decision` 卡已满足语义；新增卡种扩大 judge/UI/审计面 |

### 3.5 协调成本与关键排序

- **契约先行**：A0 先冻结 `ProjectStateView`/事件/能力/tool schema；A1 的派生/纯逻辑只依赖 A0；A2 只依赖 A0/A1；A4 只依赖 A2 的 IPC 与 A3 的 i18n key；A5 在 A2/A4 后。
- **串行共享文件**：`src/model/runtime.ts`/`project-state.ts` 只由运行时核心写；`src/common/编排/**` 只由编排写；`app/desktop/**`/`app/main.ts`/preload 只由桌面窗口写；`app/renderer/**`/`test/桌面UI/**` 只由桌面UI写；i18n 只由项目管理写；README 只由装配写；`test/桌面应用/` 逐文件只由桌面窗口写；`test/编排/` 只由编排写。
- **不允许**：B-1/B-2 未确认前创建新文件；A1 在 A0 冻结前改共享类型；A2 在 A1 纯逻辑/契约未冻结前改 session；A4 在 A2 IPC 未冻结前写面板；A5 在 A2/A4 前改 README/E2E；任何角色写其他角色路径、角色卡/边界、`docs/planning|scheduling|acceptance|communication`。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（HEAD `0a12310` 核对）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本。目录授权内新增文件不重写边界；逐文件目录中的新条目才交人事。

| 方案路径 | 所属角色 | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `src/model/project-state.ts`（新增） | 运行时核心 | **未列（B-1）** | 是（A0，H1 后） |
| `src/model/runtime.ts` | 运行时核心 | 单文件 | 是（A0） |
| `src/provider/runtime/tools.ts`、`schema.ts` | 运行时核心 | 单文件 | 是（A0） |
| `src/common/编排/task-state.ts`、`project-state.ts`（新）、`version-decision.ts`（新） | 编排 | 目录 `src/common/编排/` | 是（A1） |
| `src/pipeline/orchestration/run-role.ts` | 编排 | 单文件 | 是（A1） |
| `src/common/编排/run-manifest.ts`、`decision-card.ts` | 编排 | 目录 | **默认只读**；R1 的 partial scan/active derive 放在 `project-state.ts`，不改 all-or-nothing API；若实施必须改，仍在目录内但需在 P1 报告 |
| `app/desktop/session.ts`、`interface.ts` | 桌面窗口 | 目录 `app/desktop/` | 是（A2） |
| `app/main.ts`、`app/preload.cjs` | 桌面窗口 | 单文件 | 是（A2） |
| `test/桌面应用/project-state.test.ts`（新）、`version-decision.test.ts`（新） | 桌面窗口 | **未列（B-2）** | 是（A2，H1 后） |
| `test/桌面应用/chief-workflow.test.ts` | 桌面窗口 | 单文件 | 是（A2，扩展） |
| `test/桌面应用/run-change.test.ts`、`run-change-entry.test.ts` | 桌面窗口 | 既有单文件 | **否**（T3 回归执行；不改） |
| `app/renderer/src/chat/TaskCenterPanel.tsx`、`ProjectStatePanel.tsx`（新）、`lib/platform.ts`、`shell/shell.css` | 桌面UI | 目录 `app/renderer/` | 是（A4） |
| `test/桌面UI/project-state.test.ts`（新）、`phase4b-electron-smoke.mjs`、`phase4b-smoke-preload.cjs` | 桌面UI | 目录 `test/桌面UI/` | 是（A4/E2E，条件/按需） |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | 目录 `src/common/shared/` | 是（A3） |
| `test/项目管理/shared/i18n.test.ts` | 项目管理 | 目录 `test/项目管理/shared/` | 是（A3，计数/parity） |
| `README.md`、`README.en.md` | 装配 | 单文件 | 是（A5，F13 事件清单） |
| `test/编排/project-state.test.ts`（新）、`version-decision.test.ts`（新） | 编排 | 目录 `test/编排/` | 是（A1） |
| `test/编排/task-state.test.ts`、`run-manifest.test.ts`、`decision-card.test.ts` | 编排 | 目录 `test/编排/` | 是（A1，扩展/回归） |
| `test/测试/`（跨层补充） | 测试 | 目录 | **默认否**；若 P1 需要跨层用例，仅在目录内新增并回报 |
| `角色卡/运行时核心/boundary.md`/`boundary.yaml`/`changelog.md` | 人事 | 人事治理写权 | 是（H1 B-1） |
| `角色卡/桌面窗口/boundary.md`/`boundary.yaml`/`changelog.md` | 人事 | 人事治理写权 | 是（H1 B-2） |
| `docs/planning/` | 策划 | 策划写权 | 是（P1.2 方案收口） |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1/E2） |
| `docs/scheduling/` | 统筹 | 本计划/变更包/E3 | 是 |
| `docs/communication/` | 沟通 | 闸门/授权/回报 | 是 |

### 4.2 共享属主核对

- `src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`：运行时核心；本任务改共享事件/能力/工具描述，其他角色只读引用。
- `src/common/编排/`：编排唯一写入者；`run-manifest.ts`/`decision-card.ts` 默认只读，R1 partial scan/active derive 在 `project-state.ts`，不复制状态机。
- `app/desktop/`、`app/main.ts`、preload：桌面窗口唯一写入者；不改 `app/renderer/**`。
- `app/renderer/`、`test/桌面UI/`：桌面UI唯一写入者；不改 `app/desktop/**`/`src/**`。
- `src/common/shared/i18n/messages/*`、`test/项目管理/shared/`：项目管理唯一写入者。
- `test/桌面应用/`：逐文件授权；新文件仅 B-2 两个；既有 `run-change*.test.ts` 只读回归。
- `test/编排/`：编排；`test/测试/`：测试；互不重叠。
- `docs/planning/` 策划、`docs/scheduling/` 统筹、`docs/acceptance/` 独立验收、`docs/communication/` 沟通、`角色卡/**` 人事；worker 不写这些路径。

### 4.3 逐角色精确写集与可观察交付

#### 运行时核心（A0：Model/事件/工具契约）

- **写集**：`src/model/project-state.ts`（新增，B-1；`ProjectStateView`/`VersionDecisionCard`/`VersionDecisionRequest/Result` 等纯类型，无 I/O）；`src/model/runtime.ts`（`TaskStateEvent` 联合扩展 `ProjectFocusEvent`/`ProjectNoteEvent`/`VersionDecisionEvent`，`RequestOrphanedEvent.reason` 扩展，`GovernedToolsOptions` 增加 `projectState`/`projectNote`/`requestVersionDecision`）；`src/provider/runtime/tools.ts`（三个工具：`project_state` 只读、`project_note`/`request_version_decision` 仅幕僚；注入才注册）；`src/provider/runtime/schema.ts`（工具 schema/描述；写明只读、申请≠批准、路线≠内容批准、不写文档/不派发）。
- **不做**：不改验收/证据/写权/闸门；不新增 `cardKind`；不改 `app/**`、`src/common/编排/**`（A1 负责）。
- **可观察交付**：TypeScript 类型/事件/能力编译通过；工具只在注入时注册；`npm run typecheck` 0；候选哈希。

#### 编排（A1：派生视图 + 版本决策纯逻辑 + 账本加法）

- **写集**：`src/common/编排/task-state.ts`（新事件 kind 白名单/`validateEvent` 加法扩展；`TaskRecord`/`taskStatusOf` 不消费新事件；`request.orphaned.reason` 扩展；旧行不变）；`src/common/编排/project-state.ts`（新增 `buildProjectStateView`/`scanRunManifestsForState`/`deriveActiveRunFromManifests`；flow 合并、focus、blocked/failed、版本/证据指针、notes/nextStep、errors/truncated、角色裁剪；纯读零写入；R1）；`src/common/编排/version-decision.ts`（新增 `buildVersionDecisionCard`/`validateVersionDecisionRequest`/`mapVersionDecisionAnswer`/`planVersionDecisionExecution`/`computeTargetVersions`；纯逻辑、不读盘；R2/R3/R4 语义）；`src/pipeline/orchestration/run-role.ts`（透传 `projectState`/`projectNote`/`requestVersionDecision` 能力）。
- **测试写集**：`test/编排/project-state.test.ts`（新增；flow/focus/多 run/坏+好 manifest/tasks/blockers/versions/evidence/notes/裁剪/有界/轮转/零写入/R1）；`test/编排/version-decision.test.ts`（新增；参数/卡形状/两选项/一推荐/targetVersions/版本修改/新版本开发/pinned/多 run/pending/拒绝/中止/晚到/R2/R3/R4）；`test/编排/task-state.test.ts`（扩展；新事件校验/重放/坏行/reason）；`test/编排/run-manifest.test.ts`（扩展；`closeRun` supersede/多 draft 回归）；`test/编排/decision-card.test.ts`（扩展；application-owned 绕过角色 allowlist/两选项/一推荐；角色上限不变）。
- **只读**：`run-manifest.ts`、`decision-card.ts`、`workflow-preconditions.ts`、`versioned-doc-guard.ts`；不复制解析/状态机；不改 `listRunManifestsResult` 的 all-or-nothing 语义。
- **不做**：不写 `app/**`、`src/model/**`、UI/i18n/README；不改验收/证据/写权。
- **可观察交付**：派生视图可复算；R1 坏+好 manifest 测试；版本决策纯逻辑单测；`npm run typecheck` 0；候选哈希。

#### 桌面窗口（A2：会话/发卡/执行/IPC）

- **写集**：`app/desktop/session.ts`（`projectStateView`、`projectNote`、`requestVersionDecision`；`withRequestLifecycle`/变体落 `request.*`；执行版本修改/新版本开发；`version.decision` 审计；R2 超时/中止/晚到；R3 pinned/orphaned 排除；新 flow 命名/关闭全部旧活动 run/orphan 旧申请/切换 focus；不自动关任务/不派角色/不写文档）；`app/desktop/interface.ts`（`project-state:get`/`project:note`/`version-decision:request` 类型与 handler；`listTasks`/`requestRunChange` 不动）；`app/main.ts`（IPC 注册）；`app/preload.cjs`（受限 bridge；不暴露 Node）。
- **测试写集**：`test/桌面应用/project-state.test.ts`（新增，B-2；IPC 形状、chief 注入/其他角色裁剪、notes、零写入）；`test/桌面应用/version-decision.test.ts`（新增，B-2；发卡/客户/judge/拒绝/超时/中止/重试新 requestId/第二未决重启/通知不吞/版本修改/新版本开发/多 draft 全部关闭/orphan/pinned fail-closed/部分失败/resolved→executing 崩溃窗口）；`test/桌面应用/chief-workflow.test.ts`（扩展；新工具只给 chief/其他角色不注册）。
- **只读回归**：`test/桌面应用/run-change.test.ts`、`run-change-entry.test.ts`（不改；执行）；`test/桌面应用/acceptance-*`/`optional-acceptance.test.ts`/`e2e/main.mjs` 只读执行。
- **不做**：不改 `app/renderer/**`、`src/**`、i18n、README、角色卡/边界；不自动修复当前修仙 run。
- **可观察交付**：`project-state:get` 真实 IPC 形状；版本决策卡 application-owned；拒绝/中止零执行；R2/R3 测试；`npm run typecheck` 0；候选哈希。

#### 桌面UI（A4：项目状态区 + E2E 夹具）

- **写集**：`app/renderer/src/chat/TaskCenterPanel.tsx`（顶部最小「项目状态」区；只经 `platform` 取 IPC；不重算）；`app/renderer/src/chat/ProjectStatePanel.tsx`（新增；focus/徽标/flow 列表/阻塞/版本表/证据/下一步；只读）；`app/renderer/src/lib/platform.ts`（`getProjectState`/`projectNote` 桥类型；与 preload 一致）；`app/renderer/src/shell/shell.css`（状态区样式；无第二套派生）；`app/renderer/src/chat/ipc.ts` 仅在现有刷新钩子不足时按需改（仍在本目录）。
- **测试/E2E 写集**：`test/桌面UI/project-state.test.ts`（新增；渲染/只读/无本地派生/i18n 两语言）；`test/桌面UI/phase4b-electron-smoke.mjs`、`phase4b-smoke-preload.cjs`（按需更新；不新建 e2e 脚本；真实 Electron 截图）。
- **不做**：不改 `app/desktop/**`/`src/**`/i18n/README；不在渲染层重新扫描文件或实现 `taskStatusOf`。
- **可观察交付**：面板只读、与任务中心 unclosed 一致、focus/阻塞/版本/证据/下一步显示、无写操作；`npm run typecheck:renderer`/`npm run build:renderer` 0；E2E 截图（至多）；候选哈希。

#### 项目管理（A3：i18n + P1 审核）

- **写集**：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`（新卡标题/问题/选项/系统行/面板标签/错误码文案；中英成对、占位符一致、无中文泄漏）；`test/项目管理/shared/i18n.test.ts`（计数/parity/占位符; 以实际 key 集为准）；`i18n-guard.test.ts` 只读回归。
- **P1 审核**：只读各实施角色短提案，确认 `project-state/v1`、`version-decision/v1`、任务账本加法、工具注入、IPC、UI 同 builder、R1–R5 测试映射、i18n key；写 `角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md`（`recommend approval`/`needs revision`/`not ready`）。
- **不做**：不改产品代码/其他角色测试/角色卡/边界；不写 `docs/scheduling|acceptance|communication|planning`。

#### 装配（A5：README 文档）

- **写集**：`README.md`、`README.en.md`（`TaskStateEvent` 事件清单同步新 `project.focus`/`project.note`/`version.decision`；运行/测试说明如有相关变更）；不改 `package.json`（无新依赖）、构建/发布配置。
- **可观察交付**：中英事件清单一致、无旧形状；README diff 在写集内。

#### 测试（D1：T3 全量回归/E2E/证据）

- **写集**：`角色卡/测试/docs/change/2026-11-02_global-task-state-D1-regression.md` + 证据目录；`test/测试/` 默认不新增；若 P1 确认需要跨层用例，仅在目录内新增并回报。
- **D1**：对 A0–A5 同一候选跑方案 §9.1 受影响套件 + §9.3 T3 全量回归；`npm run typecheck`、`typecheck:renderer`、`build:renderer`；真实 Electron E2E（优先 `test/桌面UI/phase4b-electron-smoke.mjs`；必要时只读执行 `test/桌面应用/e2e/main.mjs`）；分类既有失败（`write-sequencing.test.ts` 挂起、Windows symlink EPERM）与本次新增确定性失败；候选哈希。
- **不做**：不改产品源码、其他角色测试/组件、角色卡/边界、`docs/scheduling|acceptance|communication|planning`；不把失败改断言保绿。

#### 人事（H1：边界）

- 按 §4.5 在 `角色卡/运行时核心/boundary.md`/`boundary.yaml`/`changelog.md` 加 B-1；在 `角色卡/桌面窗口/boundary.md`/`boundary.yaml`/`changelog.md` 加 B-2；md/yaml 逐条一致；不改 id/显示名/职责/role-card；不重写其它角色边界。

#### 策划（P1.2：方案收口）

- **写集**：仅 `docs/planning/2026-11-02_design_global-task-state-version-authority.md`（或经沟通确认的 P1.2 同名版本）；修 R2 时序图/§4.4/§7.2/AC-7.1/AC-8.5，R4 §7.2「全部活动 run」，R5 方案头/§13 引用标注 P1.0 快照 103/`3b8d3a3a…`；R1/R3 的必要披露；不改 Q1–Q6/C1–C7/O1–O11、范围、T3、写权/验收边界。
- **不做**：不改复核记录（历史证据）；不改角色卡/业务代码/其他 docs。
- **出口**：沟通核对 P1.2 只属 R1–R5 窄收口；若实质改范围/契约/AC/档位，停止并重开闸门 1。

#### 内置独立验收 / 统筹 / 沟通

- 内置独立验收：V1 `docs/acceptance/global-task-state-criteria-v1.md`；E2 `docs/acceptance/global-task-state-report-v1.md`；沟通另起唯一验收主上下文。
- 统筹：本计划、`docs/scheduling/global-task-state-change-v1.md`、`global-task-state-status-e3.md`、memo。
- 沟通：`docs/communication/` 闸门 2/边界确认、P1.2 核对、实施/提交授权记录与回报。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/` 统筹；`docs/acceptance/` 内置独立验收；`docs/communication/` 沟通；`docs/planning/` 策划；`角色卡/**` 人事。worker 不写这些路径。

### 4.5 精确边界变更清单（闸门 2 对象，由人事执行）

| # | 角色 | 治理文件 | 变更内容（精确） | 现状与依据 | 性质 |
| --- | --- | --- | --- | --- | --- |
| B-1 | 运行时核心 | `角色卡/运行时核心/boundary.md` + `boundary.yaml` + `changelog.md` | 新增单文件 `src/model/project-state.ts`，用途：全局任务状态/版本决策的共享 Model 类型（`ProjectStateView`/`VersionDecisionCard`/`VersionDecisionRequest/Result`；无 I/O）；yaml 附 Delta 注释（`# --- Delta-GTS-1（2026-11-02，团队计划 §4.5；闸门 2）：新增 1 个共享 Model 文件（project-state），逐文件授权 ---`） | 运行时核心 Section 1 只列 `src/model/runtime.ts`，未列该新文件；方案 §6.1 指定 Model 层共享类型 | 新增精确路径（职责相同，不新增角色/权限） |
| B-2 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `boundary.yaml` + `changelog.md` | 新增两个精确测试文件：`test/桌面应用/project-state.test.ts`（全局状态 IPC/裁剪/备注/零写入）与 `test/桌面应用/version-decision.test.ts`（发卡/决定/拒绝/超时/中止/重试/新版本开发/恢复）；yaml 附 Delta 注释（`# --- Delta-GTS-2（2026-11-02，团队计划 §4.5；闸门 2）：test/桌面应用/ 新增 2 个精确测试文件（project-state、version-decision），逐文件授权 ---`） | 桌面窗口对 `test/桌面应用/` 是逐文件授权；两文件未列；方案 §9.1 要求 SessionManager 级集成测试 | 新增精确路径（职责相同，不新增角色/权限） |

- 人事执行后核对 md/yaml 一致、无其它未列改动、按角色 changelog 记录；不重写 role-card、不改 id/显示名/职责。
- **除 B-1/B-2 外没有其它边界变更**：`app/renderer/`、`test/桌面UI/`、`app/desktop/`、`test/桌面应用/` 既有单文件、`src/common/shared/`、`test/项目管理/shared/`、`test/编排/`、`test/测试/`、`README*`、`src/model/runtime.ts`、`src/provider/runtime/*`、`src/common/编排/*`、`src/pipeline/orchestration/run-role.ts` 均在既有授权内。
- 若实施需要任何未列路径（含 `src/model/project-state.ts` 之外的 Model、`test/桌面应用/` 其他新文件、新 e2e 脚本、共享导出、`package.json` 变更）：**停止**，回报统筹并视情况重开闸门 2/评估 T3；不得默认越界。
- **角色卡/工具描述对齐**（方案 §5.5/§11.2）不在本任务写集；作为独立事项由人事/后续闸门 2 处理；本任务只改 `src/provider/runtime/schema.ts` 的工具描述。

### 4.6 工作量与范围预留

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 运行时核心 | 1 个新 Model + `runtime.ts` + tools/schema | A0 独占 `src/model/project-state.ts`、`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`（H1 后） |
| 编排 | 3 个源码（2 新）+ 1 个 pipeline + 5 个测试文件 | A1 独占 `src/common/编排/{task-state,project-state,version-decision}.ts`、`src/pipeline/orchestration/run-role.ts`、`test/编排/*` |
| 桌面窗口 | 4 个源码 + 3 个测试文件 | A2 独占 `app/desktop/{session,interface}.ts`、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/{project-state,version-decision,chief-workflow}.test.ts`（H1 后） |
| 桌面UI | 2–3 个源码/样式 + 1 个 UI 测试 + E2E 夹具 | A4 独占 `app/renderer/src/chat/{TaskCenterPanel,ProjectStatePanel}.tsx`、`lib/platform.ts`、`shell/shell.css`、`test/桌面UI/*` |
| 项目管理 | i18n 2 文件 + i18n 测试 + P1 审核 | A3 独占 i18n messages、`test/项目管理/shared/i18n.test.ts`、P1 审核记录 |
| 装配 | README 2 文件 | A5 |
| 测试 | T3 回归/E2E/证据 | D1 独占 `角色卡/测试/docs/change/`；`test/测试/` 默认不新增 |
| 人事 | 2 组边界 + changelog | H1 |
| 独立验收 | V1/E2 | 另起上下文 |
| 统筹/沟通 | 计划/变更包/E3/闸门 | 本计划与后续 |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；A0→A1→A2→A4 串行契约；A3 i18n 可在 P1 后与 A0/A1 并行但 A4 面板依赖 A3 key；同一文件同一时间只有一个写入者。

---

## 五、阶段、依赖与并行组

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门/计划 | 统筹 → 沟通 → 客户 | 团队计划写盘；B-1/B-2、P1.2、角色/写集/T3/顺序/V1/E2/证据口径提交客户；边界确认 | 本计划 |
| H1 | 边界变更 | 人事 | B-1/B-2 落地（md/yaml/changelog 一致） | G2 客户确认 |
| P1.2 | 方案收口 | 策划 | R2/R4/R5 窄修订（P1.0 快照引用、超时/中止语义、全部活动 run 表述）；不改范围/Q/C/O/T3 | G2 |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/global-task-state-criteria-v1.md`：AC + R1–R5、T3、证据计划、判定规则；沟通确认 | G2 + P1.2（可并行 H1/B0） |
| B0 | 基线 | 测试 | HEAD/工作树/Node/npm、现有测试/typecheck 基线、既有失败分类、Electron/E2E 可运行性 | G2（可并行 H1/V1） |
| P1 | 实现提案+审核 | 运行时核心/编排/桌面窗口/桌面UI/项目管理 | 各角色短提案（契约/写集/测试映射/R1–R5）+ 项目管理审核 `recommend approval` | V1 + B0 + H1 + P1.2 |
| A0 | Model/事件/工具契约 | 运行时核心 | `src/model/project-state.ts`、`runtime.ts` 事件/能力、tools/schema；typecheck | P1 + H1 |
| A1 | 编排纯逻辑 | 编排 | `project-state.ts`/`version-decision.ts`/`task-state.ts`/`run-role.ts` + 5 个编排测试；R1/R2/R3/R4 纯逻辑 | A0 |
| A2 | 会话/发卡/执行/IPC | 桌面窗口 | `session.ts`/`interface.ts`/`main.ts`/preload + 3 个桌面测试；R2/R3/F5 | A1 + H1 |
| A3 | i18n | 项目管理 | i18n 两语言 + 计数/parity 测试 | P1（与 A0/A1/A2 可并行，A4 依赖其 key） |
| A4 | 桌面UI 面板 | 桌面UI | `TaskCenterPanel`/`ProjectStatePanel`/`platform.ts`/CSS + UI 测试 | A2 + A3 |
| A5 | README/E2E 夹具 | 装配/桌面UI | README 中英事件清单；`phase4b` smoke/preload 状态区断言（按需） | A2 + A4 |
| D1 | T3 回归 | 测试 | 方案 §9.1/§9.3 全量回归 + 双 typecheck/build + Electron E2E + 证据包 | A5 |
| E1 | 变更包 | 统筹 | `docs/scheduling/global-task-state-change-v1.md`：候选哈希、路径、节点、证据、T3 | D1 |
| E2 | 独立验收 | 内置独立验收 | `docs/acceptance/global-task-state-report-v1.md`：AC/R1–R5 逐项；通过/返工/证据不足 | E1 |
| E3 | 放行/回报 | 统筹 → 沟通 | 按候选记录/放行/回报；提交/推送/发布另行授权 | E2 |

### 5.2 依赖要点

- **必须串行**：G2 → H1/P1.2/V1/B0；V1+B0+H1+P1.2 → P1；P1 审核通过 → A0；A0 → A1 → A2；A2 + A3 → A4；A4 → A5；A5 → D1 → E1 → E2 → E3。
- **可并行**：H1/V1/B0/P1.2 互不写同一路径（P1.2 写 docs/planning，V1 写 docs/acceptance，H1 写角色卡，B0 写角色卡/测试/docs）；A3 i18n 在 P1 后可与 A0/A1/A2 并行，但 A4 面板必须等 A3 key 冻结；A5 的 README 与 E2E 夹具可分别由装配/桌面UI 写，互不重叠。
- **不允许**：B-1/B-2 确认前创建 `src/model/project-state.ts` 或 `test/桌面应用/project-state.test.ts`/`version-decision.test.ts`；A0 未冻结前 A1 改共享类型；A1 未冻结前 A2 改 session；A2 未冻结 IPC 前 A4 写面板；A5 前改 README/E2E；任何角色写共享文件/其他角色路径/角色卡/边界/`docs/planning|scheduling|acceptance|communication`。

### 5.3 各节点入口/出口条件

- **G2 入口**：本计划写盘。**出口**：客户确认 B-1/B-2 + 参与角色/写集/T3/顺序/V1/E2/证据口径；P1.2 经沟通核对；未确认不派发。
- **H1 入口**：G2 边界确认。**出口**：B-1/B-2 md/yaml 一致、changelog、无其它 diff；人事报告哈希。
- **P1.2 入口**：G2。**出口**：R2/R4/R5 窄修订落盘；不改变 Q/C/O/范围/T3；沟通核对并记录；若实质变化，停止重开闸门 1。
- **V1 入口**：G2 + P1.2。**出口**：`docs/acceptance/global-task-state-criteria-v1.md`：AC-1–AC-10 + R1–R5 映射、T3、候选/证据/判定规则；不弱于方案 §9；沟通确认。
- **B0 入口**：G2。**出口**：基线命令/环境/计数/既有失败分类可复算；确认产品/测试无本任务改动；Electron/E2E 可运行性。
- **P1 入口**：V1 + B0 + H1 + P1.2。**出口**：短提案明确 `project-state/v1`/`version-decision/v1`、事件/能力/tool schema、IPC、UI 同 builder、R1–R5、测试映射、i18n/key、写集；项目管理审核 `recommend approval`；否则返工复审。
- **A0 出口**：Model/事件/能力/tool schema 编译；typecheck；无产品行为越界；候选哈希。
- **A1 出口**：R1 坏+好 manifest/active 标记；任务/阻塞/版本/证据/notes/裁剪/有界/零写入；R2/R3/R4 纯逻辑；5 个测试通过；typecheck；候选哈希。
- **A2 出口**：`project-state:get`/`project:note`/`version-decision:request` 真实接线；application-owned 卡；拒绝/中止零执行；R2/R3/F5；新 flow 全部旧 run 关闭/orphan/保留产物；3 个测试；typecheck；候选哈希。
- **A3 出口**：i18n 中英成对/占位符/计数；typecheck；候选哈希。
- **A4 出口**：面板只读/同 builder/无本地派生/两语言；typecheck:renderer/build:renderer；候选哈希。
- **A5 出口**：README 中英事件清单；E2E 夹具按需最小断言；不新建 e2e 脚本；候选哈希。
- **D1 出口**：T3 全量适用回归、typecheck/typecheck:renderer/build:renderer 0、Electron E2E/截图（至多、不录屏）、既有失败分类、新增确定性失败 0；候选哈希/diff/status；T3 证据包。
- **E1 出口**：变更包候选可复算、路径/节点/证据/T3 齐全。
- **E2 出口**：AC/R1–R5 逐项结论、T3、总体通过/返工/证据不足。
- **E3 出口**：只表示当前候选满足 V1；不授权提交/推送/发布。

### 5.4 失败、返工与恢复

- 失败阻止依赖节点；H1/P1.2/V1/B0 可独立推进。
- 返工交原 owner：Model/事件/工具归运行时核心；派生/纯逻辑/账本归编排；session/IPC/执行归桌面窗口；面板/E2E 归桌面UI；i18n/P1 审核归项目管理；README 归装配；测试复测归测试；边界归人事。
- 候选/契约/标准/边界变化使受影响证据失效；不得只改哈希让旧证据冒充当前结果。
- P1 审核发现范围/写集/边界/T3 实质变化：停止实施，回报统筹/沟通，重开闸门 1/2；若触及验收/证据/写权/闸门，按 T3 重新评估。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。

---

## 六、关键实现约束与已确认口径

1. **单一事实源**：全局视图只从 `.ans/state/tasks.jsonl`、`.ans/runs/*/manifest.json`、版本化文档派生；读操作零写入；不落第二份状态；`generatedAt` 标明快照时间。
2. **R1 active run**：`scanRunManifestsForState` 逐 manifest 读，返回可读 manifests + `errors[]`；`deriveActiveRunFromManifests` 从部分结果派生 active run（复用冲突/优先级规则），不调用 all-or-nothing `findActiveRun`；`listRunManifestsResult` 语义不变；测试「1 坏 + 1 好 manifest」合法 flow 仍有 active 标记。
3. **R2 超时/中止**：通道超时/不可用 → `request.resolved`（`declined`/`unavailable`），不执行、不写 `version.decision`；发起轮次中止 → `request.orphaned(reason:"initiator-aborted")`，不写 `request.resolved`、不执行；晚到答案只记诊断/角色日志。方案时序图/§4.4/§7.2/AC-7.1/AC-8.5 同步。
4. **R3 执行期 pinned/orphaned**：执行前若发现 pinned → 不创建/不关闭；返回 `run-change-required`；写明确的 `version.decision(status:"failed", message:"run-change-required")`（或等价可审计终态），确保 F5 重启不会误判 uncertain；F5「resolved 无执行记录」扫描排除已 `request.orphaned` 的请求；不自动执行/不重复创建新 flow。
5. **R4 全部活动 run**：`new-version-development` 关闭旧 flow 的**全部** `draft`/`pinned` 活动 run（含多个 draft），`closeReason` 含 `superseded-by:<newFlowId>/<newRunId>`；请求 `runId` 只作决策上下文，不限制关闭范围；若发现 pinned 异常，先 fail-closed，不关闭任何 run。
6. **R5 引用**：方案/团队计划引用复核时写「P1.0 快照 103 行 / `3b8d3a3a…`」；当前复核 148 / `22128e59…` 作为再复核记录；不把两者混用；不改写复核记录。
7. **账本加法**：只加 `project.focus`/`project.note`/`version.decision` 与 `request.orphaned.reason` 可选值；不改既有事件形状；旧行可读；`TaskRecord`/`taskStatusOf` 不消费新事件；旧 app 读新 kind 记坏行但不阻塞、不丢数据。
8. **版本决策**：只注入幕僚；复用 `cardKind:"decision"`、`application:true`、`sourceRoleId:"application"`；两选项、恰一个 `recommended`（幕僚提议）；客户/judge 决定；应用只执行机器部分；不写文档/不派角色/不创建任务/不自动 pin；pinned 走 run-change。
9. **requestId/attempt**：`requestId = version-decision-<runId>-<base36 时间>-<8 hex>` 由应用生成、永不复用；`attempt` = 该 run 的 `request.created` 前缀数（含拒绝/中止）+1，仅展示/审计；pending 按前缀扫描；拒绝/中止→重试/第二未决重启/通知不被吞必须有测试。
10. **审计边界**：`version.decision` 状态机 `executing → executed|failed|uncertain`；`request.*` + `version.decision` 双记录；judge 代批写「判断 agent 代批，不是客户本人」；账本 5 MB×3 轮转，审计只在保留窗口；不声称永久保留。
11. **旧 flow 处置**：新版本开发创建新 draft run、关闭全部旧活动 run、orphan 旧未决申请、保留旧文档/任务/manifest；不自动关闭旧未收口任务；视图标 superseded；旧 worker 由幕僚 `terminate_role_run`/手动收口。
12. **UI/同源**：`project-state:get` 完整只读；工具文本摘要 ≤8 KiB；UI 与工具同 `buildProjectStateView`；任务中心仍是逐任务动作面；面板不直接改账本（O4 不实施）；不新增第二套 `taskStatusOf`。
13. **i18n/README**：i18n 两语言成对/占位符/无中文泄漏；README 中英事件清单同步 `project.*`/`version.decision`；不改角色卡/工具描述之外的 cardKind/验收文案。
14. **边界不变**：不改验收/证据/写权/闸门/run-change/需求变更；不自动修复当前修仙 run；roster/demo 独立；不把版本决策当验收或范围批准。
15. **无 task_ops**：不伪造机器状态/审批/锁；证据以文件哈希、原始命令输出、diff/status、测试/E2E 输出为准。

---

## 七、验收安排与证据要求

### 7.1 实施前完成标准（V1）

- **作者/时机**：内置独立验收（技能默认角色；不是项目 `角色卡/独立验收` worker）；闸门 2/边界确认后、实施前；沟通另起唯一验收主上下文；需要时只读子上下文，不产生第二结论。
- **路径**：`docs/acceptance/global-task-state-criteria-v1.md`。
- **基线**：P1.1 1283/`369f666a…` + P1.2 窄收口（R2/R4/R5）+ 闸门 0/预授权 + 本团队计划；V1 不弱于方案 §9.2，并加入 R1–R5 核对项。
- **内容**：AC-1–AC-10 表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、R1–R5、T3 依据与全量回归计划、选定检查、证据复用/失效规则、pass/fail/insufficient evidence/not applicable 判定、版本冻结。必须覆盖：project-state 只读/部分结果/裁剪/有界/零写入；focus/备注/审计；版本决策卡/拒绝/超时/中止/重试/新版本开发/全部旧 run 关闭/orphan/保留；pinned/run-change 边界；审计/重试/崩溃窗口；UI/i18n；验收/证据/写权/闸门不变。
- **不写**：不改方案/代码/测试/角色卡/边界。

### 7.2 验收门与阶段放行

- 每个节点按 §5.3 出口交证据；统筹只在匹配当前候选、P1.1/P1.2、V1 的有效验收结论出现后记录完成并释放依赖；完成报告/进程退出不能代替验收。
- E1 变更包：候选哈希（`git hash-object` + `sha256sum`）、路径、节点 G2–E3、证据链接、T3、复用/失效说明。
- E2 报告首行：风险档位 T3、判定依据、选定检查、复用证据、消费者重测结论、全量回归结果（含排除项）、结论只能**通过/返工/证据不足**。
- 验收通过只表示当前候选满足 V1，不授权提交/推送/发布。

### 7.3 命令与证据

1. **B0 基线**：`git rev-parse HEAD`、`git status --porcelain -- src app test`、`node --version`、`npm --version`、现有 `npm run typecheck`、受影响套件基线、Electron/E2E 可运行性；不得把旧 baseline 当当前候选。
2. **受影响套件**：

| 层 | 命令（worktree 根） | 证据 |
| --- | --- | --- |
| 编排 | `node --test --test-concurrency=1 test/编排/project-state.test.ts test/编排/version-decision.test.ts test/编排/task-state.test.ts test/编排/run-manifest.test.ts test/编排/decision-card.test.ts`；`npm run typecheck` | R1 坏+好 manifest/active；focus/裁剪/有界/零写入；R2/R3/R4；新事件/旧行；卡形状；typecheck |
| 桌面窗口 | `node --test --test-concurrency=1 test/桌面应用/project-state.test.ts test/桌面应用/version-decision.test.ts test/桌面应用/chief-workflow.test.ts test/桌面应用/run-change.test.ts test/桌面应用/run-change-entry.test.ts`；`npm run typecheck` | IPC/裁剪/备注/零写入；发卡/决定/拒绝/超时/中止/重试/通知/新版本开发/恢复；run-change 不变 |
| 项目管理 | `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts`；`npm run typecheck` | i18n 成对/占位符/计数/P1 审核 |
| 桌面UI | `node --test --test-concurrency=1 test/桌面UI/project-state.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer` | 面板只读/同 builder/两语言/无本地派生 |
| 装配 | README diff/中英事件清单核对；`npm run test:assembly`（如适用） | 事件列表同步 |
| 测试/T3 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；`npm run typecheck`；`npm run typecheck:renderer`；`npm run build:renderer`；`node test/桌面UI/phase4b-electron-smoke.mjs`（按当前 harness）；必要时只读执行 `node test/桌面应用/e2e/main.mjs` | 全量 pass/fail/skip、既有失败分类、新增确定性失败 0；Electron E2E 输出/截图（至多、不录屏） |

3. **T3 排除项**：`test/pi-adapter/write-sequencing.test.ts` 既有挂起，排除时必须记录命令/原因；Windows symlink EPERM 既有环境失败需单列；不得把排除当通过。
4. **E2E**：优先 `test/桌面UI/phase4b-electron-smoke.mjs`（桌面UI 所有权）；需要时只读执行 `test/桌面应用/e2e/main.mjs`（桌面窗口所有）；不新建 e2e 脚本；截图来自当前候选真实运行、关闭 DEBUG、记录 sha256/候选/命令/窗口尺寸；**最多截图，不得要求/提供录屏**。
5. **通用证据**：写前基线（目标文件 `git hash-object` + `sha256sum`、HEAD、status）；候选身份逐文件 before/after；改动范围在写集内；原始命令输出（cwd/时间/Node/npm/OS/exit/pass/fail/skip/失败原文）；不 commit/push；不改断言保绿；不伪造 task_ops/审批。
6. **复用/失效**：仅复用同候选、同输入/依赖、同命令/夹具/环境证据；契约/事件/UI/IPC 变化会使相关证据失效；T3 要求全量回归，不按 T2 省略。

---

## 八、闸门 2 待客户确认项

1. **参与角色**：运行时核心（Model/事件/tools/schema）、编排（project-state/version-decision/task-state/run-role + 测试）、桌面窗口（session/interface/main/preload + 测试）、桌面UI（面板/bridge/CSS/UI 测试/E2E）、项目管理（i18n + P1 审核）、装配（README）、测试（T3/E2E/证据）、人事（B-1/B-2）、策划（P1.2）、内置独立验收（V1/E2）、统筹/沟通。**不参与**：产品/宣传/UIUX设计师/门禁引擎/各适配器/项目独立验收 worker。
2. **精确写集**：按 §4.1/§4.3 逐角色列出；任何角色不得写写集外路径；`test/桌面应用/` 只新增 B-2 两个文件，既有 `run-change*.test.ts`/`acceptance-*`/`e2e/main.mjs` 只读回归；`test/编排/` 只写列出的 5 个文件；不新建 e2e 脚本。
3. **边界变更 B-1/B-2**：运行时核心新增 `src/model/project-state.ts`；桌面窗口新增 `test/桌面应用/project-state.test.ts`、`version-decision.test.ts`；md/yaml/changelog 精确条目见 §4.5；**无**新增/拆分/合并角色、无 id/显示名/职责变更、无其它权限扩大。
4. **风险档位**：**T3**（方案 §10.3；不压档）。若实施需要给幕僚直接决定权、改验收/证据/写权边界、改 run-change、自动派发/写文档、绕过客户闸门 → 停止并重开闸门 0/1/2。
5. **阶段顺序**：G2 → H1/P1.2/V1/B0（并行）→ P1（提案+审核）→ A0 → A1 → A2（+A3 并行）→ A4 → A5 → D1 → E1 → E2 → E3；契约先行、共享文件单写者。
6. **P1.2 窄收口**：策划只修 R2/R4/R5 时序图/契约/AC/引用；不改 Q1–Q6/C1–C7/O1–O11、范围、T3、写权/验收；沟通核对并记录；若实质变化，重开闸门 1。
7. **V1/E2**：内置独立验收另起唯一验收主上下文；V1 在实施前按 P1.1+P1.2 写盘，覆盖 AC-1–AC-10 + R1–R5 + T3；E2 判定通过/返工/证据不足。
8. **证据口径**：未启用 task_ops；以文件哈希、原始命令输出、diff/status、T3 全量回归、typecheck/build、Electron E2E/截图（至多、不录屏）为证据；既有 `write-sequencing.test.ts` 挂起/Windows symlink EPERM 单列；不 commit/push。
9. **实施授权边界**：预授权覆盖实施准备；客户确认 B-1/B-2 后按计划派发；提交/推送/合并/发布仍另行授权；不接触客户。
10. **非目标**：不自动修复当前修仙 run；roster/引用循环与 demo 重复投递独立；不改角色卡/边界文本（除 H1 B-1/B-2）；不改验收/证据/写权/闸门/run-change/需求变更；O1/O3–O11 不实施。
11. **越界规则**：任何未列路径（含额外 Model、其他 `test/桌面应用/` 新文件、新 e2e 脚本、`package.json`、共享导出）停止并重开闸门 2/评估 T3；不得默认越界。
12. **基线**：HEAD `0a12310`；若实施前 main 前进/rebase，重记基线并确认不改变 P1.1/P1.2 锚点/证据口径。

---

## 九、风险、开放点与不一致点

### 9.1 主要风险

1. **T3 范围大**：新增治理决策权 + 共享账本 + 跨角色工具/UI/run 生命周期；必须分阶段、契约先行，不得把 A0/A1/A2 半套切换。
2. **B-1/B-2 未确认**：未获客户边界确认前创建新 Model/测试文件即越权；plan 不伪造批准。
3. **R1 all-or-nothing 残留**：`findActiveRun` 仍可能因坏 manifest 整体失败；必须用 partial scan + derived active run，并测「1 坏 + 1 好」；不得改既有 `listRunManifestsResult` 语义。
4. **R2 语义漂移**：超时/不可用与轮次中止必须分别落 `resolved` vs `orphaned`；晚到答案不写 `resolved`；方案/AC/测试一致。
5. **R3 执行期 pinned**：必须写明确失败/uncertain 终态并排除 orphaned，避免重启误判或重复创建 flow。
6. **R4 全部活动 run**：必须关闭旧 flow 全部 draft/pinned（含多个 draft），`runId` 只作上下文；卡面/AC/测试一致。
7. **R5 引用混用**：必须区分 P1.0 快照 103/`3b8d…` 与当前复核 148/`22128e…`。
8. **审计轮转**：`version.decision`/`project.*` 只在 5 MB×3 账本保留窗口；视图从当前账本重建；永久审计不在范围；测试覆盖轮转行为。
9. **requestId/通知去重**：唯一 requestId + attempt 仅展示；拒绝/中止/第二次未决重启/通知不被吞必须测试。
10. **旧任务/旧 flow**：不自动关闭旧未收口任务/旧 worker；视图标 superseded；幕僚手动收口/终止；避免虚假完成。
11. **共享文件并发**：`session.ts`、`runtime.ts`、`tool/schema`、UI 面板/i18n 单写者；A0–A4 串行契约；不得并行写同一文件。
12. **角色卡/工具描述漂移**：本任务只改 schema 工具描述，不改角色卡；幕僚模型可能仍按旧卡“新建 flow”；作为独立事项后续更新，客户需知悉。
13. **Electron/E2E 可运行性**：B0 记录；不可跑如实记证据不足；不以单测替代真实渲染证据。
14. **无 task_ops**：不伪造机器状态/锁/审批；证据以文件/原始输出为准。

### 9.2 开放点

1. **P1.2 形式**：策划是否只改方案 P1.1 的 R2/R4/R5 段落，或另写 P1.2 同名新版本；本计划默认原地窄修订（未 commit），由沟通核对；不改复核记录。
2. **B-2 替代**：若客户拒绝新增两个 `test/桌面应用/*.test.ts`，改为扩展既有 `test/桌面应用/session.test.ts`/`interface.test.ts`（既有单文件），但需重写测试映射/写集并重核闸门 2；不得新增未列文件。
3. **B-1 替代**：若客户拒绝新增 `src/model/project-state.ts`，可把类型放到 `src/common/编排/project-state.ts`（编排目录），但 UI/桌面将依赖编排目录；需重核分层与写集，不能默认切换。
4. **`scanRunManifestsForState` 归属**：本计划放在 `src/common/编排/project-state.ts`，不修改 `run-manifest.ts`；若实施选择放 `run-manifest.ts`，仍在编排目录，但需在 P1 说明并保持 `listRunManifestsResult` 语义。
5. **UI 面板文件选择**：本计划选 `TaskCenterPanel.tsx` + 新 `ProjectStatePanel.tsx`；若复用现有组件可减少文件，但不得改变同 builder/只读要求。
6. **E2E 夹具**：`phase4b-electron-smoke.mjs`/`phase4b-smoke-preload.cjs` 是否需改取决于面板/ IPC；不新建 e2e 脚本；测试角色只读执行。
7. **i18n key 计数**：以实际 key 集/测试为准；P1 需列最终 key，避免硬编码中文。
8. **P1.2 是否需窄复核**：本计划要求沟通核对；若沟通认为需独立窄复核，另起只读上下文，不扩大范围。
9. **基线**：HEAD `0a12310`；若 main 前进/rebase，重记基线并确认不改变 P1.1/P1.2 锚点。

### 9.3 与方案/复核的不一致点（如实记录）

1. **复核行/哈希**：方案头/§13 引用复核 P1.0 103/`3b8d…`；当前复核记录 148/`22128e59…`。本计划按 R5 区分两者；P1.2 更新方案引用，不改复核记录。**不混用为同一快照。**
2. **B-1/B-2**：方案 §6.1 指定 `src/model/project-state.ts`，但运行时核心 Section 1 未列；方案 §9.1 指定两个新 `test/桌面应用` 文件，但桌面窗口逐文件授权未列。本计划显式列出，不默认纳入。
3. **R1**：方案称可复用 manifest 扫描，但 `findActiveRun` 仍 all-or-nothing；本计划按 R1 在 `project-state.ts` 新增 partial scan/active derive，明确不改 `listRunManifestsResult`。
4. **R2/R4**：方案 P1.1 的 §4.4/§7.2/AC 仍有超时/中止措辞与「全部活动 run」未写全；本计划把它们列为 P1.2 窄收口 + 实现/测试约束，不声称 P1.1 已完全一致。
5. **R3**：方案 F5 扫描未明确排除 orphaned/执行期 pinned；本计划选定“明确失败终态 + orphaned 排除 + 测试”，不改变 Q/C/O/T3。
6. 除上述外，方案 §1–§9 的路径/写集/非目标与团队判断一致；无其它范围扩张。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-11-02_team-plan_global-task-state.md`）；统筹 memo 续接线索。
- **未确认**：B-1/B-2 边界、P1.2 窄收口核对、闸门 2/客户边界确认；V1 未写盘。
- **未做**：派发、实施、测试、验收、E2E、提交、推送、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未接触客户。
- **下一步**：沟通 → 客户确认 B-1/B-2 与团队计划 → 人事 H1 → 策划 P1.2 收口 → 独立验收 V1 → 测试 B0 → P1 实现提案+项目管理审核 → 按 §五顺序派发。若客户改变方案/写集/边界/档位/选装，重开闸门 1/2；本上下文不自行判断客户同意，不扩大授权。
