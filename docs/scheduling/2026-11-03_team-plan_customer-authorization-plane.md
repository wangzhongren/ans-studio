# 团队计划：客户授权平面——两个标记 `@审批` / `@决策`

- **任务 ID**：`2026-11-03-customer-authorization-plane`
- **产品 flowId**：`customer-authorization-plane`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立固定上下文）
- **日期**：2026-11-03
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档；未 commit/push**
- **闸门 0/1 记录**：[`docs/communication/2026-11-03_intent_customer-authorization-plane.md`](../communication/2026-11-03_intent_customer-authorization-plane.md)（当前 89 行 / SHA-256 `f3755b024732f8028233a8aeaaec2766e94d47800f91372d26d71f6fd344e394`；闸门 0 与闸门 1 均已客户确认）。方案/复核头引用的 69 行 / `91d77bb8…` 是追加闸门 1 记录前的快照，按不同版本引用，不混用。
- **客户确认的策划方案版本（唯一实施与验收基线）**：[`docs/planning/2026-11-03_design_customer-authorization-plane.md`](../planning/2026-11-03_design_customer-authorization-plane.md) **P1.1**（1199 行 / SHA-256 `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`，本计划写盘前实测一致）。
- **独立复核**：[`docs/planning/2026-11-03_review_customer-authorization-plane.md`](../planning/2026-11-03_review_customer-authorization-plane.md)（132 行 / SHA-256 `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`）；P1.0 完整复核 F1–F9、再复核（P1.1）结论「建议提交客户确认」；剩余 R1/R2 为建议级。复核不是批准、不是客户确认、不是实施授权、不是验收基线。
- **风险档位**：**T3**（客户闸门 0 已声明；方案 §11.3 与复核一致；触及共享 Model、公共入口/跨模块契约与权限/审计语义，需全量适用回归）。本计划不压档。
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目当前**没有 `.ans/project.json`**（连 `.ans/` 目录都不存在），未启用 task_ops；本计划不伪造任务令牌、审批、锁或机器预检记录，证据以文件哈希与原始命令输出为准。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2**（参与角色、精确写集、边界变更、T3、阶段顺序、验收安排、证据口径、实施授权边界、基线 rebase 条件）；客户另行给出实施授权前不派发、不写卡、不改代码。

---

## 一、任务与基线

### 1.1 实施对象（按客户确认的 P1.1，不扩大）

本任务把客户在输入框开头的两个标记 `@审批` / `@决策` 变成一条可审计的「打字即授权」路径。实施点与方案章节对应如下（只作计划索引，不改写方案）：

1. **输入识别与路由（§3）**：`src/model/directive-marker.ts` 唯一纯解析器（零 import，主进程与渲染侧共享）；主进程 `Interface.sendSession` 权威识别，命中后不调用 `SessionManager.send`/`handle.send`；渲染侧只用同一函数做**回显抑制**，且以主进程能力位 `directivesEnabled` 为准；带图命中明确拒绝；未命中路径逐字不变。
2. **指令账本（§5）**：项目私有 `.ans/state/customer-directives.jsonl`，append-only、事件回放、独立轮转、坏行容错；`customer-directive/v1` 事件与视图；`d-<seq>` ID；`once`/`session`/`forever`；`sessionId` 失效判定；target 隔离；Provider/Service/Pipeline 三层。
3. **两个消费者（§6）**：审批前置在 `src/common/编排/shell-gate.ts` 的 `decide()` 内、确定性硬地板之后机械 allow/deny（只读 `approval`）；决策消费者在 `app/desktop/customer-input.ts` 的 `presentEntryNow()` 之前按确定性规则代选/拒绝（只读 `decision`）；冲突/不匹配必须绕过 `tryAutoSelectDecision`；跨判断器隔离强制点 I-1..I-7；指令不得越过 preblock/write-guard/c=deny/readonly/script 等硬边界。
4. **IPC、面板与回执（§3.3/§4/§7）**：`directive:confirm-request` / `directive:confirm-response` / `directive:list` / `directive:revoke` / `directive:state`；两个逻辑面板分列生效与已撤销/已消费/已失效；回执「已记录审批指令 #id」「已记录决策指令 #id」；高危二次确认由主进程复核；指令面板不占 `shellCardSlot`、不进 `customer-input` 一项目一卡队列；项目切换取消未决面板。
5. **审计归属（Q9 A，§9.2）**：`request.resolved.by`、`version.decision.decidedBy`、run manifest `decidedBy` 扩展 `"directive"`，并记 `directiveId`；逐点更新旧读者（含 `requirement-change.ts` 的 `=== "judge"` 读者），四处审计/文案如实区分「客户指令、判断 agent、客户本人」。
6. **i18n（§9.2/AC-17）**：新增指令面板/回执/高危/错误文案，zh-CN/en-US 成对，无硬编码用户可见字符串。
7. **共享 JSONL 辅助（§8.4，团队计划采用）**：`src/common/shared/jsonl-ledger.ts` 作为唯一共享实现，由项目管理实现并冻结；编排在同一变更内把 `task-state.ts` 调用点迁到该辅助（行为逐字不变、需回归）；指令 Provider 复用该辅助，不产生第二份轮转/原子追加实现。设计同时给出**退路 B**（Provider 自带等价实现、不碰 `task-state.ts`）；若 P1 审核或等价回归证明 A 不可行，可按退路 B 实施并在 E1 如实披露，不改变闸门 1 方案语义（见 §十）。
8. **测试与证据（§10/§11.3）**：各层单测/契约测试；跨角色集成；T3 全量适用回归；双端 typecheck；方案 AC 要求的真实运行截图证据（不要求录屏）。

**闸门 1 已确认的边界口径（不重开）**：Q5 **A** = 本轮 `@审批` 只对 shell 命令生效，`domain`/`path` 只记录不生效、面板标注「暂无消费者」；Q9 **A** = 审计枚举扩展 `"directive"` + `directiveId`；Q1–Q10 其余按推荐 A；**O1–O11 全部不实施**；不做 `@边界` 解析、不做英文别名/全角 `＠`、不新增联网/外部目录审批闸、不调用模型解释非精确决策指令、不新增 CLI 入口、不把指令注入模型上下文。

### 1.2 风险档位与验证口径：T3

按 `ans-governed-construction/references/testing.md` 的唯一定义：**T3 = release、shared-abstraction change（Model、公共入口、跨模块契约）、governance or permission change，或证据不确定/不足**；默认验证为**全量适用回归 + release/shared-abstraction 检查**。

本任务的 T3 依据：修改共享 Model（`src/model/runtime.ts`、`src/model/project-state.ts`、新增 `src/model/directive.ts`/`directive-marker.ts`）、公共入口（Pipeline 指令运行时、shell gate 注入、desktop IPC/preload）、跨模块契约（`customer-directive/v1` 事件与视图、`SendResult`/`ShellReviewResult`/`CustomerInputOutcome` 加法字段），并改变客户授权/撤销/高危/审计归属语义。客户已在闸门 0 声明 T3，方案与复核一致；本计划不降档。

**验证口径**：受影响角色层测试 + 跨角色集成 + **T3 全量回归**（`node --test` 全量、`--test-concurrency=1`，按 B0 基线分类既有 Windows 环境失败；新增确定性失败=0、新增 skip=0）+ **双端 typecheck**（`npm run typecheck` + `npm run typecheck:renderer`）+ 项目既有 `npm run build:renderer` 渲染构建门 + 方案 AC-1/AC-3/AC-5/AC-18 要求的**真实运行截图**（关闭 DEBUG、记录 sha256/候选/窗口尺寸/拍摄命令；**不得要求或提供录屏**）。除方案明确要求的真实运行截图外，不额外要求 Electron/E2E 场景。

### 1.3 本轮非目标（不得顺手扩大）

- 不实施 O1–O11：不新增联网域名审批消费者、不新增外部目录审批消费者、不做模型解释、不做 `until=<时长/日期>`、不做英文/别名/全角标记、不做角色级审批范围、不做面板搜索/导出、不做 `@边界` 迁移引导、不做整体回滚开关 `ANS_CUSTOMER_DIRECTIVES_DISABLED`、不做结构性禁止 shell 读取 `.ans`、不做随机后缀 ID。
- 不解析/不迁移 `@边界`；不把指令翻译成指令；不对其他 `@...` 产生提示。
- 不改 `c=deny` 硬地板、preblock、write-guard、`resolveWrite` 写门禁、边界文档、角色卡、验收判定、证据规则、客户三道闸门。
- 不让指令授权代码/角色卡/边界变更；不让审批指令参与决策判断；不让决策指令参与 shell 审批；不把指令注入模型上下文；不让角色工具有指令写入口。
- 不改 CLI 入口；不改 `package.json`/构建配置/发布配方；不提交、不推送、不合并、不发布；不启动应用做「已验收」声明。

### 1.4 基线（写计划时实测，2026-11-03）

| 项 | 值 |
| --- | --- |
| 分支 / HEAD | `feat/customer-authorization-plane` / `243d8f6a6db663a383b516aad6320c5110c7f583` |
| 工作树（写本计划前） | 仅三份未跟踪管理文档：`docs/communication/2026-11-03_intent_customer-authorization-plane.md`、`docs/planning/2026-11-03_design_customer-authorization-plane.md`、`docs/planning/2026-11-03_review_customer-authorization-plane.md` |
| 产品/测试改动 | `git status --porcelain -- src app test` 为空 |
| 任务配置 | 无 `.ans/` 目录、无 `.ans/project.json`；未启用 task_ops |
| Node / npm | `v24.22.1` / `11.19.1` |
| 依赖 | **本 worktree 无 `node_modules`**；B0 前须安装依赖（`node_modules` 为忽略产物）或如实记录无法安装。未安装前不把任何测试声明为已跑 |
| 远程基线 | `origin/main` = `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（已含 PR #38/#39/#40；见 §八） |
| 测试命令 | `node --test`；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 为既有命令；不新增 runner/配置 |
| E2E 夹具 | `test/桌面应用/e2e/main.mjs` 存在（232942 bytes）；Electron 二进制需依赖安装后核对 |
| 归档角色 | `角色卡/桌面应用/`、`角色卡/产品/` 为只读归档，不在任何角色写入面内，不参与本任务 |

### 1.5 版本纪律

- 方案 **P1.1 1199 行 / `7875ad6a…`** 是唯一实施与验收基线。实施角色按方案正文的符号名与文本锚点施工；方案中的行号对应 HEAD `243d8f6` 快照，**基线 rebase 后行号会漂移，以符号名/文本锚点为准**（AC-19 披露）。
- 实施中发现需要改变方案口径（如改变 target/期限/消费者优先级/账本位置、扩大写集、启用任一 O 项、改变 Q5/Q9 结论），停止并回报统筹，按技能重开闸门 1/2；不得自行变更。
- 闸门 1 材料披露的 R1/R2（`directivesEnabled` 能力位应明确属基础实现、AC-13 高危子句以 Q7 A 为前提）在实施前由策划作者做**文字收口（下一版/编辑性，不改语义）**；V1 与实施引用收口后的文本与新哈希。若收口改变语义，重开闸门 1。

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-03）** | `docs/communication/2026-11-03_intent_customer-authorization-plane.md` |
| 闸门 1：方案确认 | **已确认（2026-11-03，P1.1 为唯一实施基线；Q5 A、Q9 A 单独确认）** | 同上「闸门 1 确认记录」 |
| 闸门 2：角色指派/写集/边界变更 | **未确认** | 本计划 §十一；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权（IA） | **未给** | 与闸门 2 分开记录；未给前不派发、不改代码 |
| 实施前验收标准（V1） | 未写盘 | 由内置独立验收在闸门 2 + 实施授权后、实施前写 `docs/acceptance/customer-authorization-plane-criteria-v1.md` |
| 提交/推送/合并/发布 | 未授权 | 一律另行授权；本任务不执行 |

### 2.1 闸门 2 与实施授权是两个事实

- 闸门 2 确认的是**参与角色、各自范围和写集、是否有角色/边界变更、档位、阶段顺序、验收安排、证据口径、实施授权边界与基线 rebase 条件**；实施授权是对代码实施的授权。两者分开记录，不能互相替代。
- 客户在闸门 1 的确认不等于闸门 2，也不等于实施授权。
- 本计划写盘后不派发任何 worker，直到：闸门 2 确认 + 实施授权齐备 + 实施前验收标准经沟通确认 + B-1..B-4 边界变更落地（人事）+ 基线 rebase/合并完成 + 逐角色范围预留完成。

### 2.2 客户在闸门 1 已确认的默认项（本计划据此排期，不重开）

| 项 | 确认结果 |
| --- | --- |
| 方案版本 | P1.1（1199 行 / `7875ad6a…`） |
| Q5 | **A**：本轮 `@审批` 只对 shell 命令生效；`domain`/`path` 只记录、面板标注「暂无消费者」 |
| Q9 | **A**：审计归属扩展 `"directive"` + `directiveId` |
| Q1–Q10 其余 | 按推荐 A |
| O1–O11 | 全部不实施（O1/O2 因 Q5 A 不实施；O9–O11 未选） |
| 复核处置 | F1–F9 与三条未解决意见已真实落入 P1.1 正文与 AC；R1/R2 建议级，实施前文字收口 |

### 2.3 事实校正：`contract-schema-query` 已合入 `origin/main`

任务描述中的「PR #38 未合并」在写本计划时已过期。实测：

- PR #38 已于 2026-11-03T04:53:28Z 合并（merge commit `9f1a89436594e8d55e0d6c73a81cf54c3c646690`）；
- `origin/main` 已含 PR #39（`f104029`）与 PR #40（`4c3a6e4`，分支 tip `bf33f31`）；
- 本 worktree 的基点 `243d8f6` 是上述合并的 merge-base；本分支尚未包含这些改动。

**这不改变闸门 1 方案语义**；只影响实施基线顺序。协调建议见 §八。

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 本任务是跨层的一次性纵向特性：共享 Model 契约属运行时核心既有职责；账本 Provider/Service/Pipeline 与 shell 闸消费属编排既有会话编排/账本职责；桌面输入/IPC/decision 消费者属桌面窗口既有 Interface 职责；面板/回执属桌面UI既有渲染职责；共享 JSONL 辅助与 i18n 属项目管理既有职责；跨角色验证属测试职责。没有产生需要不同知识/契约的持续独立责任 |
| 2. 范围归属 | **现有 Section 1 覆盖大多数路径；4 处未覆盖需改边界** | 目录授权覆盖 `app/desktop/`、`app/renderer/`、`src/common/编排/`、`src/common/shared/`、各 `test/<role>/`；单文件覆盖 `src/model/runtime.ts`/`project-state.ts`、`app/main.ts`、`app/preload.cjs` 等。未覆盖：2 个新 Model 文件、1 个新 Pipeline 文件、`src/provider/directive/` 与 `src/service/directive/` 新模块根、2 个新桌面测试文件（`test/桌面应用/` 是逐文件授权）→ B-1..B-4 |
| 3. 契约影响 | **有，跨角色共享契约变更；每项有唯一 primary owner** | Model 事件/视图/解析器/高危谓词与 `runtime.ts`/`project-state.ts` 加法 → 运行时核心；账本 Provider/Service/Pipeline 公共句柄、shell gate 注入契约、Q9 审计枚举（`task-state`/`version-decision`/`run-manifest`）→ 编排；桌面 IPC/preload、`SendResult` 加法、decision 消费者、Q9 桌面读者 → 桌面窗口；i18n key 集合与共享 JSONL 辅助 → 项目管理；渲染侧仅按 preload 契约消费。契约先冻结再消费 |
| 4. 证据独立性 | **已满足** | 各实施角色跑自己的层测试并交原始输出；测试角色跑跨层集成、T3 全量回归、双端 typecheck/构建与真实运行复跑；内置独立验收按实施前标准（基于 P1.1）判通过/返工/证据不足；实施者不自验，统筹不改验收结论 |
| 5. 协调成本 | **复用现有团队最低；新增角色不划算** | 现有 7 个实施角色恰好覆盖写集；装配/门禁引擎/各适配器不参与。新增「客户指令专职角色」会跨 Model/Provider/Service/Pipeline/Desktop/Renderer 重复建卡与边界，协调成本大于收益。协调重点是**契约冻结顺序**、**共享文件单写者**与**基线 rebase** |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 运行时核心 | **调整边界**（B-1：新增 2 个 Model 单文件条目） | `src/model/runtime.ts`、`src/model/project-state.ts` 已授权；新 `directive.ts`/`directive-marker.ts` 未列；职责不变 |
| 编排 | **调整边界**（B-2 新增 `customer-directive.ts`；B-3 新增 `src/provider/directive/`、`src/service/directive/` 两个私有模块目录） | `src/common/编排/` 目录与 `run-role.ts`/`govern-session.ts`/`shell-arming.ts` 单文件已授权；新 Pipeline 文件与新 Provider/Service 模块未列；职责不变 |
| 桌面窗口 | **调整边界**（B-4：新增 2 个精确测试文件条目） | `app/desktop/` 目录、`app/main.ts`、`app/preload.cjs` 已授权；`test/桌面应用/` 为逐文件授权，新测试文件未列；职责不变 |
| 桌面UI | **保留** | `app/renderer/` 与 `test/桌面UI/` 均为目录授权；新面板组件与测试在目录内 |
| 项目管理 | **保留** | `src/common/shared/` 与 `test/项目管理/shared/` 均为目录授权；i18n 属主按 2026-10-23 i18n 团队计划与 2026-10-31 shell 升级计划先例 |
| 测试 | **保留** | `test/测试/` 为目录授权；跨层集成/T3/E2E 复跑在既有职责内 |
| 装配 | **保留、本轮不参与** | 不改 `package.json`/`tsconfig`/`vite.config.ts`/`src/index.ts`/发布配方；renderer 导入 `src/model/directive-marker.ts` 沿用既有 i18n 相对导入先例，不需 Vite alias 或 tsconfig 改动 |
| 门禁引擎 | **不参与** | 本任务不改 shell 规则集、写守卫、`resolve-write`、`shell-rules.ts`；O10 不实施 |
| 产品、宣传、UIUX设计师、Claude/Codex/Pi 适配器 | **不参与** | 无写集、无契约面 |
| 项目 `角色卡/独立验收` worker | **不参与** | 其 Section 1 只覆盖 `角色卡/独立验收/docs/`，不含 `docs/acceptance/`；使用技能内置独立验收，避免双重验收 |
| 人事（内置） | **闸门 2 后执行 B-1..B-4** | 角色卡/边界/YAML/根 changelog 由人事维护；不改角色 id/能力描述/显示名 |
| 内置独立验收 | **参与**（V1 标准 / E2 判定） | 技能默认写权 `docs/acceptance/` |
| 统筹 | **参与**（本计划、派发、收证、变更包、记录） | 技能默认写权 `docs/scheduling/` |
| 沟通 | **参与**（闸门记录、向客户呈报、启动验收主上下文） | `docs/communication/` |

### 3.3 决策表结果

**不变（角色名单）+ 改边界（B-1..B-4，职责相同，仅补精确路径）。**

- **无**新增角色、**无**拆分、**无**合并、**无**角色 id/显示名/能力描述变更。
- 四处未覆盖路径按 B-1..B-4 交人事在边界 md/yaml 中补登；其余所有文件都在既有目录或单文件授权内。
- 一次性特征不新建角色；现有 7 个实施角色覆盖写集，协调成本最低。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有 7 个实施角色 + 人事 B-1..B-4 + 内置独立验收 + 统筹 | **采用** | 写集与既有 Section 1 一一对应；Model/账本/桌面/渲染/共享/集成职责分离；协调成本最低 |
| B. 新增「客户指令」专职工作角色 | 否决 | 一次性纵向切片，不构成持续独立责任；会跨四层与桌面/渲染多处写集，建卡/边界/交接成本大于收益 |
| C. 拆分编排为「账本角色 + 闸角色」 | 否决 | 账本与两个消费者的契约必须单一 owner 冻结；写集不可干净分离，且拆分会造成跨角色热点 |
| D. 把账本 Provider/Service 放运行时核心 | 否决 | 运行时核心职责是引擎接入/公共会话契约/受治理工具；最接近的账本先例 `task-state.ts` 在编排私有目录。放编排使账本与其消费/审计同源，避免跨角色账本契约漂移 |
| E. 把 decision 消费者也放编排 | 否决 | decision 卡呈现与结算在 `app/desktop/customer-input.ts`，属桌面窗口；编排只提供 target-scoped facts 与消费 API |
| F. 使用项目 `角色卡/独立验收` worker | 否决 | 写区不含 `docs/acceptance/`；会造成双重验收与标准漂移 |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：A1（Model/解析器/高危谓词）、A2（共享 JSONL 辅助）、A3（i18n key）写集互不相交，可并行；三者冻结后 B1 才消费。B1 冻结账本/闸/Pipeline 契约后 C1 才接入；C1 冻结 IPC/preload 形状后 C2 才实现渲染面。
- **共享文件单写者**：`src/model/**` 只由运行时核心写；`src/common/编排/**`、`src/provider/directive/**`、`src/service/directive/**`、`src/pipeline/orchestration/**` 只由编排写；`app/desktop/**`、`app/main.ts`、`app/preload.cjs` 只由桌面窗口写；`app/renderer/**` 只由桌面UI写；`src/common/shared/**` 只由项目管理写；各 `test/<role>/**` 各自唯一；`test/桌面应用/**` 对桌面窗口逐文件授权。
- **基线先 rebase**：`origin/main` 已含 `contract-schema-query`（§八）；B0 必须在 rebase 后的基线上记录，旧基线的 Model 证据不得复用。
- **不允许**任何角色写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/` 或角色卡/边界；不允许并发写同一文件。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-11-03 核对）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本。未列路径默认只读。目录授权内新增文件不重写边界；新增精确文件/改动归属/增删逐条路径才交人事。

| 方案路径/面积 | 所属角色 | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `src/model/directive.ts`（新） | 运行时核心 | **未覆盖 → B-1** | 是（A1） |
| `src/model/directive-marker.ts`（新） | 运行时核心 | **未覆盖 → B-1** | 是（A1） |
| `src/model/runtime.ts` | 运行时核心 | 单文件条目 | 是（A1，加法字段） |
| `src/model/project-state.ts` | 运行时核心 | 单文件条目 | 是（A1，Q9 枚举） |
| `src/common/shared/jsonl-ledger.ts`（新） | 项目管理 | 目录（私有）`src/common/shared/` | 是（A2） |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | 同上 | 是（A3） |
| `src/provider/directive/`（新模块根） | 编排 | **未覆盖 → B-3** | 是（B1） |
| `src/service/directive/`（新模块根） | 编排 | **未覆盖 → B-3** | 是（B1） |
| `src/pipeline/orchestration/customer-directive.ts`（新） | 编排 | **未覆盖 → B-2** | 是（B1） |
| `src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`shell-arming.ts` | 编排 | 单文件条目 | 是（B1，接线） |
| `src/common/编排/task-state.ts`、`version-decision.ts`、`run-manifest.ts` | 编排 | 目录（私有）`src/common/编排/` | 是（B1，Q9 枚举/共享辅助迁移） |
| `src/common/编排/shell-gate.ts`、`shell-audit.ts` | 编排 | 同上 | 是（B1，审批消费者/审计） |
| `app/desktop/directive-input.ts`（新）、`interface.ts`、`session.ts`、`customer-input.ts`、`requirement-change.ts`、`recovery-channel.ts`（条件） | 桌面窗口 | 目录 `app/desktop/` | 是（C1） |
| `app/main.ts`、`app/preload.cjs` | 桌面窗口 | 单文件条目 | 是（C1） |
| `app/renderer/src/shell/Composer.tsx`、`chat/ipc.ts`、新增面板/对话框/store/CSS（目录内） | 桌面UI | 目录 `app/renderer/` | 是（C2） |
| `test/runtime-core/`（新增解析器/契约测试） | 运行时核心 | 目录 `test/runtime-core/` | 是（A1） |
| `test/编排/`（新增账本/闸测试 + 既有更新） | 编排 | 目录 `test/编排/` | 是（B1） |
| `test/项目管理/shared/jsonl-ledger.test.ts`（新）、`i18n.test.ts`（更新） | 项目管理 | 目录 `test/项目管理/shared/` | 是（A2/A3） |
| `test/桌面应用/directive-input.test.ts`（新） | 桌面窗口 | **未覆盖 → B-4** | 是（C1） |
| `test/桌面应用/directive-decision.test.ts`（新） | 桌面窗口 | **未覆盖 → B-4** | 是（C1） |
| `test/桌面应用/interface.test.ts`、`session.test.ts`、`decision-service.test.ts`、`run-change.test.ts`、`version-decision.test.ts` 等既有文件 | 桌面窗口 | 既有精确条目 | 按需更新（C1） |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 既有精确条目 | 条件（D2 真实运行） |
| `test/桌面UI/`（新增面板/对话框测试 + 既有更新） | 桌面UI | 目录 `test/桌面UI/` | 是（C2） |
| `test/测试/`（新增跨层集成 + 受影响复跑 + T3） | 测试 | 目录（测试）`test/测试/` | 是（D1/D2） |
| `src/interface/cli/**` | 编排 | 单文件条目 | **否**（CLI 不识别指令，方案非目标） |
| `src/common/门禁引擎/**`、`src/service/gate/**` | 门禁引擎 | 单文件/目录条目 | **否**（O10 不实施，写守卫/规则集不变） |
| `package.json`、`tsconfig.json`、`vite.config.ts`、`src/index.ts`、发布配方 | 装配 | 单文件/目录条目 | **否**（无构建/入口变更） |
| `docs/planning/`、`docs/communication/` | 策划/沟通 | 各自默认写权 | 否（本任务只引用/由对应角色追加） |
| `docs/scheduling/` | 统筹（内置） | 技能默认写权 | 是（本计划、变更包、memo、状态记录） |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1/E2 报告） |

### 4.2 共享属主核对（不猜）

- `src/common/shared/`：**项目管理唯一写入者**（`角色卡/项目管理/boundary.md` + `docs/project-rules.md`）。本任务新增 `jsonl-ledger.ts` 与 i18n 消息；不新增第二个共享目录、不复制实现。
- `src/model/runtime.ts`、`src/model/project-state.ts`：**运行时核心唯一主属**；本次均为**加法**（可选字段/枚举扩展/新文件），不删除、不改既有字段语义。改动会使引用方既有证据失效，由消费方重测。
- `src/model/directive.ts`、`directive-marker.ts`：运行时核心主属；渲染侧只导入 marker 文件（零 import），不把整个 `runtime.ts` 打进渲染包。
- `src/common/编排/`：编排私有；其他角色只经 Model 类型与 Pipeline 公开句柄消费，不直接导入私有实现。
- `src/provider/directive/`、`src/service/directive/`：编排新建的模块私有根，仅用于客户指令账本；不是 `src/provider`/`src/service` 的整目录授权。
- `app/desktop/`、`app/main.ts`、`app/preload.cjs`：桌面窗口；`app/renderer/`：桌面UI。渲染侧不实现 IPC，只按 preload 契约消费。
- `test/桌面应用/`：**逐文件授权**（不是目录授权）；本任务只能写既有精确条目 + B-4 新增的两个精确文件；不得在 `test/桌面应用/e2e/` 新建脚本（只能条件扩展 `e2e/main.mjs`）。
- `test/桌面UI/`、`test/编排/`、`test/runtime-core/`、`test/项目管理/shared/`、`test/测试/`：各自目录授权，互不重叠。

### 4.3 逐角色精确写集与可观察交付

> 每个文件同一时间只有一个写入者。实现顺序 `Model → Provider/Service → Pipeline → Interface → Renderer`；跨角色工作等真实依赖与已冻结契约。

#### 运行时核心（A1：Model 契约/解析器/高危谓词）

- **写集**：
  - **新增** `src/model/directive-marker.ts`：唯一纯函数 `parseDirectiveMarker(text)`；零 import、不读盘、不依赖 Node；规则按方案 §3.1（前导空白、标记后边界、多行、半角 `@`、`@边界` 不命中、空正文、带图拒绝的判定依据）。
  - **新增** `src/model/directive.ts`：`CustomerDirectiveTarget`/`Until`/`ApprovalResource`/`ApprovalAction`/`DecisionAction`/`DirectiveCreatedEventV1`/`DirectiveEventV1`/`CustomerDirectiveView`/target-scoped fact 类型；高危谓词（§4.3，可判定）；ID/字段约束常量；依赖 `runtime.ts` 类型。
  - `src/model/runtime.ts`：加法字段——`ShellReviewResult` 可选 `directive?: { id: string; scope: "once"|"session"|"forever" }`；`CustomerInputOutcome` 可选 `directive?: { id: string; action: "select-recommended"|"select-option"|"reject" }`；不新增 `GovernanceJudgeFacts` 未使用字段（O3 不实施）。
  - `src/model/project-state.ts`：`VersionDecisionDecidedBy` 加法 `"directive"`。
  - **新增** `test/runtime-core/directive-marker.test.ts`：§3.1 全部示例 + 边界/近失配/多行/全角/空正文/带图判定。
  - **新增** `test/runtime-core/directive-contract.test.ts`：事件/视图 schema、高危谓词真值表、target 类型隔离（I-1 编译期负例）。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`app/**`、`src/common/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、`test/编排/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/测试/**`。
- **公开契约**：上述 Model 类型与解析器/高危谓词；**A1 完成即冻结**，B1/C1/C2 只按冻结形状消费；变更须回到本角色并重跑受影响证据。
- **可观察交付**：解析器全部规则单测；高危谓词真值表；类型隔离负例无法通过 typecheck；`node --test "test/runtime-core/**/*.test.ts"` + `npm run typecheck` 原始输出；候选哈希；冻结声明。

#### 项目管理（A2：共享 JSONL 辅助；A3：i18n；P1 提案审核）

- **写集**：
  - **新增** `src/common/shared/jsonl-ledger.ts`：通用 JSONL 追加一行、按大小轮转、旧→新读取、坏行计数；纯 Node、不依赖运行层；契约在 A2 冻结。
  - **新增** `test/项目管理/shared/jsonl-ledger.test.ts`：追加/回放/轮转/部分写/坏行/并发串行/空文件边界。
  - `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`：新增 `ui.directive.*` / 回执 / 高危 / 错误 / 面板分组 / 开关状态文案（key 集合按方案 §4.4/AC-17；具体 key 在 A3 冻结）。
  - `test/项目管理/shared/i18n.test.ts`：按实际更新分区计数、parity、en-US 零中文泄漏。
  - `角色卡/项目管理/docs/architecture/shared-components.md`：登记 `jsonl-ledger` 组件（用途/入口/owner/消费者/契约/测试与影响）。
  - P1 审核记录：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md`（按 `references/proposal-review.md`）。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`、架构文档（按需）。
- **不写**：`app/**`、`src/model/**`、`src/common/编排/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、其他 `test/` 目录。
- **公开契约**：`jsonl-ledger` 的行为契约（追加/轮转/回放/坏行）与 i18n key 集合；**A2/A3 完成即冻结**，B1/C1/C2 只消费。
- **可观察交付**：`jsonl-ledger` 单测与 `task-state` 等价回归方案；i18n 计数/parity/零泄漏；`node --test "test/项目管理/shared/**/*.test.ts"` + `npm run typecheck`；候选哈希；冻结声明；P1 审核结论（`recommend approval` / `needs revision` / `not ready`）。

#### 编排（B1：账本 Provider/Service/Pipeline + shell 消费者 + Q9 审计枚举）

- **写集**：
  - **新增** `src/provider/directive/**`：`.ans/state/customer-directives.jsonl` 的追加/回放/轮转/坏行；纯存储，不做业务判定；复用 `src/common/shared/jsonl-ledger.ts` 的冻结契约。
  - **新增** `src/service/directive/**`：状态机（created/consumed/revoked/expired）、ID 分配（`d-<seq>`）、target 过滤、快照、创建/撤销/消费/失效、高危计算、错误语义。
  - **新增** `src/pipeline/orchestration/customer-directive.ts`：每项目运行时句柄——`submitFromInput`/`approvalFacts`/`decisionFacts`/`takeDirective`/`applyDecisionDirective`/`revoke`/`list`；把 `takeDirective` 注入 shell gate、把 decision facts 注入 customer-input 通道。
  - `src/common/编排/task-state.ts`：迁移到 `src/common/shared/jsonl-ledger.ts`（行为逐字不变）；`request.resolved.by`/`version.decision.decidedBy` 加法 `"directive"` 与可选 `directiveId`。
  - `src/common/编排/version-decision.ts`、`run-manifest.ts`：`decidedBy` 联合与映射加法 `"directive"`。
  - `src/common/编排/shell-gate.ts`：注入 `takeDirective`；顺序按方案 §6.1（preblock → write-guard → classify → deny 指令 → c=deny → c=allow → script → 既有 grant → allow 指令 → 既有链）；`readonlyOnly` 不注入；`ShellReviewResult.directive` 透传。
  - `src/common/编排/shell-audit.ts`：审计记录加法可选 `directive:{id,scope}`（与 `judge`/`customerGrant` 并列互斥）；`by:"directive:<id>"`。
  - `src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`shell-arming.ts`：构造/注入运行时句柄与 `takeDirective`；CLI 不注入 ⇒ 行为逐字不变。
  - **新增** `test/编排/customer-directive.test.ts`（Provider/Service/Pipeline：schema/ID/状态机/target 过滤/快照/撤销/失效/坏行/轮转/幂等/消费失败回落）。
  - **新增** `test/编排/customer-directive-gate.test.ts`（shell gate：deny 先于 c=allow、allow 只在 review/risky、script 不适用、once 原子消费、既有 grant 不回归、硬地板不翻案、readonly 不注入、审计 `by`）。
  - 按需更新 `test/编排/task-state.test.ts`、`version-decision.test.ts`、`run-manifest.test.ts`、`shell-gate.test.ts`、`shell-post-audit.test.ts`、`shell-escalation.test.ts`、`shell-arming.test.ts`、`runtime-orchestration.test.ts`、`session-handle.test.ts`（逐条理由在完成报告列出，不得弱化断言）。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`。
- **不写**：`src/model/**`、`src/common/shared/**`、`src/common/门禁引擎/**`、`src/service/gate/**`、`app/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/runtime-core/**`、`test/项目管理/**`、`test/测试/**`。
- **公开契约**：`customer-directive` Pipeline 句柄形状、`takeDirective` 注入契约、审计字段、Q9 枚举；**B1 完成即冻结**，C1/C2 只消费；变更须回到编排并重跑受影响证据。
- **可观察交付**：账本 schema/轮转/坏行/ID/幂等；target 隔离；审批顺序矩阵；once 消费；Q9 枚举；`node --test "test/编排/**/*.test.ts"` + `npm run typecheck`；候选哈希；冻结声明。

#### 桌面窗口（C1：Interface/IPC/面板/decision 消费者/Q9 读者）

- **写集**：
  - **新增** `app/desktop/directive-input.ts`：标记命中后的主进程逻辑——提交/确认/取消/列表/撤销/高危复核/幂等/项目切换/面板共存；纯逻辑 + 注入 presenter。
  - `app/desktop/interface.ts`：`sendSession` 在图片校验/`manager.send` 之前解析标记；命中不调用 `manager.send`；调用注入的 `directiveRuntime.submitFromInput`；`SendResult` 加法 `directive?: { id; target }`；未命中路径逐字不变。
  - `app/desktop/session.ts`：`SendResult` 定义加法；Q9 生产/展示点（`request.resolved.by`、`decidedByText`、`version.decision.decidedBy`、run-change `operatorId` 映射）识别 `directive:<id>`。
  - `app/desktop/customer-input.ts`：decision 消费者（只对 `cardKind==="decision"`）；确定性规则、冲突/不匹配绕过 `tryAutoSelectDecision`、`directing` 内部状态、`once` 消费、`operatorId:"directive:<id>"`、`CustomerInputOutcome.directive` 回填。
  - `app/desktop/requirement-change.ts`：`=== "judge"` 旧读者改为显式三值映射，避免 directive 误显示为 customer。
  - `app/desktop/recovery-channel.ts`：仅当 presenter/共享签名变化时最小适配；不改须说明无回归。
  - `app/main.ts`：`directive:confirm-request/response/list/revoke/state` IPC、sender 校验、窗口作用域、关窗取消、恢复重推、`directivesEnabled` 能力位推送（基础实现恒 true；O9 不实施）。
  - `app/preload.cjs`：受限桥白名单新增指令通道（不暴露 Node 能力）。
  - **新增** `test/桌面应用/directive-input.test.ts`：识别/不投递/面板通道/回包快照校验/幂等/重推/关窗/高危复核/面板共存/项目切换。
  - **新增** `test/桌面应用/directive-decision.test.ts`：decision 消费者确定性规则/冲突与不匹配绕过默认推荐/开关独立性/Q9 四处归属断言。
  - 按需更新既有精确文件：`test/桌面应用/interface.test.ts`、`session.test.ts`、`decision-service.test.ts`、`run-change.test.ts`、`version-decision.test.ts`（逐条理由在完成报告列出）。
  - 条件扩展 `test/桌面应用/e2e/main.mjs`（仅 D2 真实运行需要；不得新建 `e2e/` 脚本）。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`。
- **不写**：`app/renderer/**`、`src/**`、`test/桌面UI/**`、`test/测试/**`、`test/编排/**`、`test/runtime-core/**`、`test/项目管理/**`、`package.json`、`tsconfig*`、`vite.config.ts`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：IPC 通道形状、preload 方法、`SendResult` 加法、`CustomerInputOutcome` 加法、`directivesEnabled` 能力位；**C1 完成即冻结**，C2 只消费；变更须回到桌面窗口并重跑受影响证据。
- **可观察交付**：命中不投递（无角色轮次/无 `lastUserText` 变化）；未命中零变化；带图拒绝；面板/回执/高危复核/项目切换/面板共存；decision 消费者与默认推荐绕行；Q9 四处归属；`node --test` 目标文件 + `npm run typecheck`；候选哈希；冻结声明。

#### 桌面UI（C2：渲染面板/回执/回显抑制/i18n 消费）

- **写集**：
  - `app/renderer/src/shell/Composer.tsx`：用共享纯函数判断是否抑制本地用户气泡；**仅当主进程能力位 `directivesEnabled === true` 时抑制**；未命中/能力位 false 按普通发送并补画气泡。
  - `app/renderer/src/chat/ipc.ts`：新增指令通道的类型与消费清单；旧主进程缺省 ⇒ 能力禁用并说明。
  - **新增** `app/renderer/src/chat/directive-dialog.tsx`：确认面板（原文/动作/范围/资源/期限/高危横幅/勾选/确认禁用/未识别片段）。
  - **新增** `app/renderer/src/chat/directive-panel.tsx`：两个逻辑面板（审批/决策），各列生效中与已撤销/已消费/已失效；撤销按钮；consumer 状态（`shell-gate`/`decision-card`/`暂无消费者`）。
  - **新增** `app/renderer/src/stores/directive-store.ts`：面板/对话框状态、`directive:list/revoke/state` 消费、项目切换清空。
  - `app/renderer/src/shell/shell.css` 与/或既有样式文件：面板/对话框/回执样式（具体文件在 C2 提案冻结，目录内）。
  - **新增** `test/桌面UI/directive-dialog.test.ts`、`test/桌面UI/directive-panel.test.ts`（目录授权）。
  - 按需更新 `test/桌面UI/confirm-logic.test.ts`、`test/桌面UI/decision-dialog.test.ts`（逐条理由在完成报告列出）；条件更新 `test/桌面UI/phase5a-electron-smoke.mjs`（build 冒烟）。
  - 证据：`角色卡/桌面UI/docs/change/`（截图/几何/日志）。
- **不写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`package.json`、`vite.config.ts`、`tsconfig*`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：只按 preload 白名单通道与主→渲染事件消费；不实现 IPC、不判路径、不调用判断器。
- **可观察交付**：命中时无“发给幕僚”的气泡；面板字段/高危勾选/确认禁用/回执精确；两个面板分组与撤销；i18n 中英文案；`node --test "test/桌面UI/**/*.test.ts"`、`npm run typecheck:renderer`、`npm run build:renderer`；真实 Electron 冒烟/截图；候选哈希。

#### 测试（D1/D2：跨层集成 + T3 全量 + 真实运行证据）

- **写集**：
  - **新增** `test/测试/customer-authorization-plane-integration.test.ts`：跨层集成（真实 Model/Service/Provider/Pipeline + 桌面 presenter 替身 + shell gate + decision 消费者替身；指令创建→快照→消费→撤销→失效→坏账本；target 隔离；Q9 归属）。
  - **新增** `test/测试/customer-authorization-plane-restart.test.ts`（或并入上述文件）：`sessionId` 重启失效、`once` 未使用失效、账本轮转/坏行、项目切换。
  - 按需更新其他 `test/测试/` 既有跨角色套件。
  - 证据：`角色卡/测试/docs/change/`（B0/D1/D2 记录、原始日志、截图清单）。
- **不写**：产品源码、其他角色单测/测试目录、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **可观察交付**：跨层集成原始输出；受影响套件与 T3 全量回归计数/失败分类（新增确定性失败=0、新增 skip=0）；双端 typecheck + `build:renderer`；真实 Electron 复跑（`E2E_PASS`/计数/截图）；候选哈希/diff/status；证据目录与哈希。

#### 装配 / 门禁引擎（不参与实施）

- 本任务**不写** `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`src/index.ts`、`bin/ans.js`、`.github/workflows/**`、`electron-builder.yml`、发布配方；不改 `src/common/门禁引擎/**`、`src/service/gate/**`、`src/service/boundary/**`。渲染侧导入 `src/model/directive-marker.ts` 沿用 `app/renderer/src/i18n/index.ts` 的相对导入先例，不需要 Vite alias/tsconfig 改动；若实施证明确需构建配置改动，停止并回报，不在本写集内顺手改。

#### 内置独立验收 / 统筹 / 人事 / 沟通

- 内置独立验收：`docs/acceptance/customer-authorization-plane-criteria-v1.md`（V1）、`docs/acceptance/customer-authorization-plane-report-v1.md`（E2）；不派 worker。
- 统筹：`docs/scheduling/`（本计划、`customer-authorization-plane-change-v1.md` 变更包、`customer-authorization-plane-status-e3.md` 状态记录、memo）；不派 worker。
- 人事：B-1..B-4 精确边界条目 + 受影响角色根 `changelog.md`；未确认闸门 2 前不写卡。
- 沟通：`docs/communication/`（闸门 2 确认与实施授权记录；启动唯一验收主上下文）。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹默认写区；本任务由统筹写本计划、变更包、状态记录、memo；**不派给任何 worker**。
- `docs/acceptance/`：内置独立验收默认写区；写实施前标准与验收报告；**不使用**项目 `角色卡/独立验收` worker（其 Section 1 不含此目录，且会造成双重验收）。
- `docs/communication/`：沟通写区；本计划不写，闸门 2/实施授权记录由沟通写入。
- `角色卡/**` 的角色卡、边界、YAML、根 changelog：人事维护；本任务仅 B-1..B-4 与 changelog，不改能力描述/id/显示名。

### 4.5 精确边界变更清单（B-1..B-4，闸门 2 对象，由人事执行）

> 四项都是「职责不变、补精确路径」。B-1/B-2 是新增层源码单文件；B-3 是新建模块私有目录（仅客户指令账本 Provider/Service，不是整层目录授权）；B-4 是逐文件授权目录下的新增测试文件。**不新增角色、不改角色 id/显示名/能力描述、不扩大任何其它权限。**

| # | 角色 | 治理文件 | 变更内容（精确） | 依据/性质 |
| --- | --- | --- | --- | --- |
| B-1 | 运行时核心 | `角色卡/运行时核心/boundary.md` + `boundary.yaml` | Section 1 新增两行单文件条目：`src/model/directive-marker.ts`（客户指令标记纯解析器；零依赖，主进程与渲染侧共享）、`src/model/directive.ts`（客户指令事件/视图/高危谓词共享 Model 类型） | 方案 §8.1/§5.2；两文件均未列；新共享 Model 契约的唯一主属；职责相同 |
| B-2 | 编排 | `角色卡/编排/boundary.md` + `boundary.yaml` | Section 1 新增单文件条目：`src/pipeline/orchestration/customer-directive.ts`（客户指令运行时 Pipeline 公共句柄：解析→面板请求→落账；facts/consume/revoke） | 方案 §8.1/§8.3；`src/pipeline/orchestration/` 对编排是逐文件授权，新文件未列；职责相同 |
| B-3 | 编排 | `角色卡/编排/boundary.md` + `boundary.yaml` | Section 1 新增两个**有界目录**条目：`src/provider/directive/`（客户指令账本 Provider；本任务新建的模块私有根）、`src/service/directive/`（客户指令 Service：状态机/ID/target 过滤/快照；本任务新建的模块私有根）。不得解释为 `src/provider/`/`src/service/` 整目录授权 | 方案 §8.1；两模块根均未列；目录条目限本任务新建的指令账本模块，文件限于 provider/service 各 abstract/impl/public |
| B-4 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `boundary.yaml` | Section 1 新增两个精确单文件测试条目：`test/桌面应用/directive-input.test.ts`（主进程侧：识别拦截/指令 IPC/面板通道/重推/关窗取消/高危复核/面板共存）、`test/桌面应用/directive-decision.test.ts`（主进程侧：decision 消费者确定性规则/冲突与不匹配绕过默认推荐/Q9 归属读者） | `test/桌面应用/` 对桌面窗口是**逐文件授权**；方案 §10.1 要求主进程侧集成与 decision 消费者测试；职责相同 |

- 人事执行后须核对：`boundary.md` 与 `boundary.yaml` 一致、无其它未列改动、无保护文件被普通工作文件许可覆盖；按受影响角色根 `changelog.md` 记录本次变更与依据（团队计划 + 闸门 2 确认记录）。
- 角色职责描述不变：**不重写 role-card.md**；如需注记只写 changelog。
- 本任务**不要求**校正与本写集无关的既有漂移；保持现状，不在本变更内顺手改边界。
- 若实施中发现需要 B-1..B-4 之外的路径（例如第三个 `test/桌面应用/` 新文件、额外 Model/Service 文件、构建配置），**停止并回报**，按闸门 2 增补；不得自行扩边界。

### 4.6 工作量与范围预留

> 工作量按文件与检查项计，不编造工时；未知按文件面估算。

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 运行时核心 | 2 个新 Model 文件 + 2 个既有 Model 加法 + 2 个新测试 | A1 独占 `src/model/{directive,directive-marker,runtime,project-state}.ts`、`test/runtime-core/` 相关文件 |
| 项目管理 | 1 个共享辅助 + 1 个新测试 + 2 个 i18n 消息 + 1 个计数测试 + 架构目录 + P1 审核 | A2/A3/P1 独占 `src/common/shared/jsonl-ledger.ts`、i18n messages、`test/项目管理/shared/`、`docs/architecture/shared-components.md` |
| 编排 | 1 个新 Pipeline + 2 个新模块根 + 6 个既有产品文件 + 2 个新测试 + 按需既有测试 | B1 独占 `src/provider/directive/`、`src/service/directive/`、`src/pipeline/orchestration/{customer-directive,run-role,govern-session,shell-arming}.ts`、`src/common/编排/{task-state,version-decision,run-manifest,shell-gate,shell-audit}.ts`、`test/编排/` 相关文件 |
| 桌面窗口 | 1 个新桌面模块 + 7 个既有产品文件（1 条件）+ 2 个新测试 + 5 个按需既有测试（+ 条件 e2e） | C1 独占 `app/desktop/` 列明文件、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/` 列明文件 |
| 桌面UI | 1 个既有组件 + 1 个既有 ipc + 3 个新渲染文件 + 样式 + 2 个新测试 + 按需既有测试 | C2 独占 `app/renderer/src/**` 列明文件、`test/桌面UI/` 相关文件 |
| 测试 | 1–2 个新跨层集成测试 + 受影响套件 + T3 全量 + E2E 复跑 | D1/D2 独占 `test/测试/` 相关文件 |
| 人事 | 4 项边界条目 + 受影响角色根 changelog | H1（闸门 2 + 实施授权后） |
| 内置独立验收 | 1 标准 + 1 报告 | V1/E2 |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；任何角色不得写其他角色路径；同一文件同一时间只有一个写入者；契约冻结前消费方不写引用代码。

---

## 五、阶段、依赖与并行组

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门 2 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、精确写集、B-1..B-4、T3、阶段顺序、验收安排、证据口径、实施授权边界、基线 rebase 条件） | 本计划写盘 |
| IA | 实施授权 | 沟通 → 客户 | 实施授权记录（与闸门 2 分开） | G2 |
| H1 | 边界变更 | 人事 | B-1..B-4 在 boundary.md + boundary.yaml 一致落地 + 受影响角色根 changelog；不改能力描述/id | G2 + IA |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/customer-authorization-plane-criteria-v1.md`：AC-1..AC-24 验收表（不弱化）、T3 依据与升档条件、证据计划、判定规则、版本冻结；经沟通确认路径/版本 | G2 + IA（可与 H1/B0 并行） |
| B0 | 基线 | 测试 | rebase/合并后的 HEAD/工作树、依赖安装状态、Node/npm、Electron、`typecheck`/`typecheck:renderer`/`build:renderer`、受影响套件与 T3 全量基线原始输出与失败分类；确认无产品代码改动 | G2 + IA + 基线 rebase/合并完成（可与 H1/V1 并行） |
| P1 | 实现提案与审核 | 运行时核心、项目管理、编排、桌面窗口、桌面UI（提案）；项目管理（审核） | 各角色实现提案（只写各自 `角色卡/<role>/docs/change/`）；项目管理审核结论 `recommend approval` / `needs revision` / `not ready`；不写产品代码 | V1 + B0 + H1 |
| A1 | Model 契约 | 运行时核心 | `directive-marker.ts`/`directive.ts`/`runtime.ts`/`project-state.ts` + 解析器/高危谓词/类型隔离测试；**冻结声明** | P1 审核通过 |
| A2 | 共享 JSONL 辅助 | 项目管理 | `jsonl-ledger.ts` + 单测 + `shared-components.md`；**冻结声明**（含 `task-state` 等价回归方案） | P1 审核通过 |
| A3 | i18n 契约 | 项目管理 | zh-CN/en-US key 集合 + 计数/parity/零泄漏；**冻结声明** | P1 审核通过 |
| B1 | 账本与审批消费者 | 编排 | Provider/Service/Pipeline 运行时 + `task-state` 迁移 + Q9 枚举 + shell gate/audit + run-role/govern-session/shell-arming 接线 + 测试；**账本/闸/Pipeline 契约冻结** | A1 + A2 冻结 + H1 |
| C1 | 桌面接线 | 桌面窗口 | Interface 拦截 + directive-input + IPC/preload + main 生命周期 + decision 消费者 + Q9 读者 + 测试；**IPC/preload 形状冻结** | A1 + B1 + A3 冻结 + H1 |
| C2 | 桌面UI | 桌面UI | Composer 回显抑制 + 确认对话框 + 两个指令面板 + store + CSS + i18n 消费 + 测试 + `build:renderer` | C1 IPC/preload 冻结 + A3 冻结 |
| D1 | 跨层集成与回归 | 测试 | `test/测试/` 跨层集成；受影响套件；**T3 全量回归**；双端 typecheck + `build:renderer`；失败分类；候选哈希/diff/status | A1 + A2 + A3 + B1 + C1 + C2 全部退出门满足 |
| D2 | 真实运行证据 | 测试 + 桌面窗口（e2e 夹具，条件）+ 桌面UI（截图） | 真实 Electron：命中不投递/面板/高危/回执/撤销/重启失效/decision 代选与冲突回落；**截图证据**（关闭 DEBUG、sha256、候选、窗口尺寸、拍摄命令；不录屏） | D1 入口条件满足且 `build:renderer` 成功 |
| E1 | 变更包 | 统筹 | `docs/scheduling/customer-authorization-plane-change-v1.md`：候选哈希、改动路径、任务节点、证据链接、T3、基线 rebase 披露 | D1 + D2 |
| E2 | 独立验收 | 内置独立验收（同一验收主上下文） | `docs/acceptance/customer-authorization-plane-report-v1.md`：AC-1..AC-24 逐项结论与证据引用；通过/返工/证据不足 | E1 |
| E3 | 放行与记录 | 统筹 → 沟通 | 按匹配当前候选的结论更新记录、释放依赖、交沟通回报；验收通过不授权提交/推送/合并/发布 | E2 |

### 5.2 依赖要点

- **必须串行**：G2 → IA → H1/V1/B0 → P1 → A1/A2/A3 → B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3。
- **可并行**：H1（人事）、V1（内置验收）、B0（测试）在 IA 后互不写同一路径；A1（运行时核心）、A2（项目管理共享辅助）、A3（项目管理 i18n）写集不相交，可并行；D2 中测试复跑与桌面UI 截图可在同一候选上并行取证（证据必须附同一候选哈希）。
- **不允许**：P1 审核通过前写产品代码；A1/A2/A3 冻结前消费方写引用代码；B1 与 C1/C2 并行写同一文件；C2 在 C1 冻结前写引用新 IPC 的代码；任何角色写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界；在 `test/桌面应用/e2e/` 新建脚本。
- **共享文件不并发写**：`src/model/runtime.ts`/`project-state.ts`（运行时核心）、`src/common/编排/*`/`src/pipeline/orchestration/*`/`src/provider/directive/*`/`src/service/directive/*`（编排）、`app/desktop/*`/`app/main.ts`/`app/preload.cjs`（桌面窗口）、`app/renderer/*`（桌面UI）、`src/common/shared/*`（项目管理）、各 `test/<role>/*` 各自唯一。角色名不同不代表写集不同；按路径预留。
- **基线 rebase 先于 B0**：`origin/main` 已含 `contract-schema-query`；实施入口先把本分支更新到 `origin/main`（当前 `4c3a6e4`，以 IA 时实际 HEAD 为准），再记录 B0；旧基线证据不得复用（§八）。

### 5.3 各节点入口/出口条件（验收门与证据）

- **G2 入口**：本计划写盘。**出口**：闸门 2 确认记录覆盖本计划版本、参与角色、精确写集、B-1..B-4、T3、顺序、验收安排、证据口径、实施授权边界、基线 rebase 条件；确认记录由沟通写入 `docs/communication/`。
- **IA 入口**：G2 确认。**出口**：客户实施授权记录（独立于闸门 2）。
- **H1 入口**：G2 + IA。**出口**：B-1..B-4 在 md/yaml 一致落地；受影响角色根 changelog 记录；无其它 diff；人事报告条目与哈希。
- **V1 入口**：G2 + IA。**出口**：标准含验收表（ID/方案条目/需要的证据/证据路径/候选/产出角色/结果/判断）、T3 依据与升档条件、判定规则（pass/fail/insufficient evidence/not applicable）、证据计划、版本/哈希冻结；AC-1..AC-24 不弱化；沟通确认路径/版本；未确认不派实施。
- **B0 入口**：G2 + IA + 基线 rebase/合并完成 + H1 入口条件满足（可与 H1 并行执行）。**出口**：基线命令、环境、计数、失败清单与分类可复算；确认无产品代码改动；记录 Node/npm、OS/Shell、HEAD/worktree、依赖安装状态。
- **P1 入口**：V1 经沟通确认 + B0 完成 + H1 完成。**出口**：各角色实现提案（文档，不写产品代码）；项目管理审核结论；阻断项清单；若 `needs revision`，回原角色修订后再审；不得跳过审核写产品代码。
- **A1 入口**：P1 审核 `recommend approval` + 实施授权。**出口**：Model/解析器/高危谓词落地；runtime-core 测试与 `npm run typecheck` 通过；契约形状与方案 §3.1/§4.3/§5.2/§8.3 一致；候选哈希/diff/status；**冻结声明**。
- **A2 入口**：P1 审核通过 + 实施授权。**出口**：`jsonl-ledger` 落地；单测通过；`shared-components.md` 登记；`task-state` 等价回归方案可核对；候选哈希；**冻结声明**。
- **A3 入口**：P1 审核通过 + 实施授权。**出口**：i18n key 中英成对、计数更新、parity/零泄漏；`test/项目管理/shared/i18n.test.ts` 原始输出；候选哈希；**冻结声明**。
- **B1 入口**：A1 + A2 冻结 + H1 完成。**出口**：账本 Provider/Service/Pipeline、Q9 枚举、shell gate/audit、run-role/govern-session/shell-arming 接线落地；target 隔离、顺序矩阵、once 消费、坏行/轮转、`task-state` 等价回归通过；`node --test "test/编排/**/*.test.ts"` + typecheck；候选哈希/diff/status；**契约冻结**。
- **C1 入口**：A1 + B1 + A3 冻结 + H1 完成。**出口**：命中不投递、未命中零变化、带图拒绝、面板/回执/高危复核/幂等/重推/关窗/项目切换/面板共存、decision 消费者、Q9 四处归属通过；目标测试 + typecheck；候选哈希；**IPC/preload 形状冻结**。
- **C2 入口**：C1 IPC/preload 冻结 + A3 冻结。**出口**：确认对话框/两个面板/回执/回显抑制/i18n 消费完成；`node --test "test/桌面UI/**/*.test.ts"`、`typecheck:renderer`、`build:renderer` 通过；真实 Electron 冒烟；截图/几何证据；候选哈希。
- **D1 入口**：A1/A2/A3/B1/C1/C2 全部退出门满足。**出口**：跨层集成通过；受影响套件与 T3 全量回归计数、失败分类（新增确定性失败=0、新增 skip=0）；双端 typecheck + `build:renderer`；候选哈希/diff/status。
- **D2 入口**：D1 入口条件满足且 `build:renderer` 成功。**出口**：真实 Electron 场景与截图证据齐全（AC-1/AC-3/AC-5/AC-18）；账本/审计样例；失败分类；候选哈希与证据哈希。
- **E1 入口**：D1 + D2 完成。**出口**：变更包完整、候选可复算、节点/证据链接齐备、T3 标注、基线 rebase/退路 B 等披露。
- **E2 入口**：E1。**出口**：验收表逐项结论、总体通过/返工/证据不足；报告链接任务/方案版本/标准版本/候选/证据/未解决项。
- **E3 出口**：只表示当前候选满足标准；不授权提交、推送、合并、发布。

### 5.4 失败、返工与恢复

- 失败阻止依赖节点；独立且已授权工作可继续（如 V1 与 B0 并行、A1/A2/A3 之间互不阻塞）。
- 返工交原所有者（产品代码归所有者、共享归项目管理、测试复测）；验收结论不由统筹改写。
- 候选/契约/标准/边界/rebase 变化使受影响证据失效：回到待做/返工，不得只改哈希让旧证据冒充当前结果。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。
- 若基线 rebase 后出现冲突：`src/model/runtime.ts` 由运行时核心解决，`app/desktop/session.ts` 由桌面窗口解决；冲突解决属于根因修复，须重跑受影响证据与 B0 基线。

---

## 六、证据要求

### 6.1 通用证据（每个实施角色）

1. **写前基线**：目标文件的 `git hash-object` 与 `sha256sum`、`git rev-parse HEAD`、`git status --short`；与本计划记录不一致时停止并回报统筹。
2. **候选身份**：每个改动文件的 `git hash-object` 与 `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同。
3. **改动范围**：`git diff --name-only` 与 `git status --short` 必须落在该角色写集内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
4. **原始检查输出**：命令、退出码、环境（Node 版本、OS/Shell）、测试计数（pass/fail/skip/todo）、失败原文；跳过项写明原因。
5. **文档状态**：实现完成但未验收的文档状态如实写 `implemented-unverified`。
6. **纪律**：不提交、不推送、不合并、不发布；不修改断言以保绿；不新增 skip；不把计划写成结果；不伪造测试输出；Windows 既有失败按 B0 基线分类，不记为本次新失败，也不把新增红归为环境。

### 6.2 逐角色检查命令（最低要求）

| 角色 | 受影响检查 | 证据 |
| --- | --- | --- |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"`；`npm run typecheck` | 解析器全部规则；高危真值表；target 类型隔离负例；加法兼容；候选哈希 |
| 项目管理 | `node --test "test/项目管理/shared/**/*.test.ts"`；`npm run typecheck` | jsonl-ledger 行为；i18n key 计数/parity/零泄漏；shared-components 登记；P1 审核结论；候选哈希 |
| 编排 | `node --test "test/编排/**/*.test.ts"`；`npm run typecheck` | 账本 schema/轮转/坏行/ID/幂等；target 隔离；审批顺序矩阵；once 消费；Q9 枚举；`task-state` 等价回归；候选哈希 |
| 桌面窗口 | `node --test test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts` + 按需既有精确文件；`npm run typecheck`；条件 `node test/桌面应用/e2e/main.mjs` | 命中不投递；未命中零变化；带图拒绝；面板/回执/高危/幂等/重推/关窗/项目切换/面板共存；decision 消费者；Q9 四处；候选哈希 |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"`；`npm run typecheck:renderer`；`npm run build:renderer`；真实 Electron 冒烟（临时 userData） | 对话框/面板/回显抑制/撤销/分组；zh/en 文案；布局/交互几何；截图组；候选哈希（`dist/` 非候选） |
| 测试 | `node --test test/测试/customer-authorization-plane-integration.test.ts`（或等价）；受影响套件；T3 全量回归；`npm run typecheck`/`typecheck:renderer`/`build:renderer`；真实 E2E 复跑 | 集成输出；全量计数与失败分类；E2E `E2E_PASS`/计数/截图；证据哈希；候选哈希/diff/status |

### 6.3 T3 验证口径

- 按 `references/testing.md`：T3 默认**全量适用回归 + release/shared-abstraction 检查**；受影响角色层测试 + 跨角色集成不可省略。
- 共享/契约变更的消费者重测：`src/model/runtime.ts`、`src/model/project-state.ts` 的实际消费方；`src/common/shared/jsonl-ledger.ts` 的 `task-state` 与 directive Provider 两个消费方；`src/common/shared/i18n` 的消费方；shell gate/decision 卡路径的实际调用方。
- 证据复用仅限未受影响路径且同候选/版本；Model/接口/共享辅助变更会使受影响证据失效，必须重跑；rebase 后的旧证据不得复用。
- 全量回归按 B0 基线分类既有 Windows 环境失败；既有排除（如 `write-sequencing.test.ts`）仅按 B0 记录与理由沿用，不新增 skip。
- 证据不足按 V1 判 `insufficient evidence`；升档不降档。

### 6.4 真实运行与截图证据（方案 AC-1/AC-3/AC-5/AC-18）

- **执行者**：桌面窗口（`test/桌面应用/e2e/main.mjs` 条件扩展）、桌面UI（真实 Electron 截图）、测试（跨层 E2E 复跑）；统筹汇总变更包；内置独立验收核对原始证据。
- **场景**：输入 `@审批 允许 shell "npm install" once` → 面板 → 回执 → 精确命令放行一次；重复执行回到正常链；`@决策 选推荐项 until=session` → decision 卡代选并显示「客户指令，不是客户点击」；冲突/不匹配回落客户卡且不默认代选；`@审批 撤销 #d-N`；重启后 `session` 失效；坏账本不阻断主路径；高危未勾选被拒。
- **截图规则**：**最多截图，不得要求/提供录屏**；截图来自当前候选真实运行、关闭 DEBUG 覆盖层；记录 sha256、候选版本、拍摄命令/窗口尺寸；日志、校验输出与哈希可作辅助证据。
- **证据路径**：截图/日志写 `角色卡/桌面UI/docs/change/…-evidence/` 与 `角色卡/桌面窗口/docs/change/…-evidence/`；测试证据写 `角色卡/测试/docs/change/`；不写产品 `docs/verification/`。
- 若真实 Electron/截图因环境不可得，D2 如实记录，E2 按 AC-1/AC-3/AC-5/AC-18 判证据不足；不得以单测替代真实截图，不得伪造 PASS。

### 6.5 审计与 Q9 证据

- 提供测试项目/临时 userData 下的 `.ans/state/customer-directives.jsonl` 样例：created/consumed/revoked/expired 事件、`d-<seq>`、`target`、`sessionId`、`highRisk`；坏行/轮转样例。
- 提供 shell 审计样例：`directive:{id,scope}`、`by:"directive:<id>"`，与 `judge`/`customerGrant` 互斥可区分。
- 提供四处归属断言：`request.resolved.by`、`version.decision.decidedBy`、run manifest `decidedBy`、UI 文案均显示 `"directive"`（或等价「客户指令」），不误记为 customer/judge；`requirement-change.ts` 的旧读者不误显示。
- 新增字段（原文/卡片载荷）不得含凭据；既有 `command`/`argv` 审计行为不变。

---

## 七、独立验收安排

### 7.1 实施前完成标准（V1）

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 + 实施授权后、实施前；可与 H1/B0 并行。
- **路径**：`docs/acceptance/customer-authorization-plane-criteria-v1.md`。
- **基线**：客户在闸门 1 确认的方案 **P1.1**（1199 行 / `7875ad6a…`）+ 闸门 0/1 意图记录（当前 89 行 / `f3755b02…`）+ R1/R2 文字收口后的版本（若已产生）。
- **最低内容**：验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）、T3 依据与升档条件、选定检查、消费者重测与证据复用规则、pass/fail/insufficient evidence/not applicable 判定规则、成功/失败/边界情形、证据失效规则、版本冻结规则。
- **不得弱于**方案 §10.2 的 **AC-1..AC-24**；不得自造需求或放宽/加严标准实质。
- **条件项处理**：AC-23（O9 回滚开关）因 O9 未实施，V1 记 `not applicable（O9 未选）` 并引用闸门 1 记录；AC-24 的 O11 部分记 `not applicable（O11 未选）`，但账本重置/ID 重号披露部分仍须核对。
- **冻结**：实施开始后不得改标准适配候选；确需变更时递增版本、记录理由、交沟通/统筹确认，受影响证据重新核对。

### 7.2 验收表与证据映射（供 V1 细化，不替代标准）

| 方案标准 | 主要证据节点/角色 |
| --- | --- |
| AC-1 识别规则 | A1（解析器单测）+ C1/C2（输入/面板）+ D2（截图） |
| AC-2 命中不投递/未命中零变化 | C1（sendSession 拦截/调用计数）+ D1 |
| AC-3 面板字段/预填/确认禁用 | C2（UI 测试/截图）+ C1（IPC） |
| AC-4 取消/关窗/面板不可用/写盘失败 | C1 + C2 + D1 |
| AC-5 回执精确/durable/不含原文/不进模型 | A3（i18n）+ C1（回执）+ C2 + D1 |
| AC-6 账本 schema/ID/轮转/坏行/幂等 | A1（schema）+ B1（Provider/Service）+ D1 |
| AC-7 目标隔离 | A1（类型）+ B1（target 过滤）+ C1（decision facts）+ D1 |
| AC-8 审批 allow/once/硬地板 | B1（gate）+ D1 |
| AC-9 审批 deny/顺序/不翻案 | B1（gate 顺序矩阵）+ D1 |
| AC-10 decision 规则/冲突/默认推荐绕行/Q9 四处 | C1（decision 消费者/Q9）+ B1（run manifest/version-decision）+ A1（枚举）+ A3（文案）+ D1 |
| AC-11 期限/重启失效 | B1（状态机）+ C1（重启）+ D1 |
| AC-12 撤销/同 target/状态 | B1 + C1 + D1 |
| AC-13 高危谓词/主进程复核/Q7 A 子句 | A1（谓词）+ C1（复核）+ C2（UI）+ D1 |
| AC-14 不授权代码/角色卡/边界 | A1/B1/C1（结构/测试）+ D1 |
| AC-15 回归/旧读者逐点核对 | C1（session/requirement-change）+ 测试（T3 全量） |
| AC-16 坏账本/主路径不受阻 | B1 + C1 + D1（故障注入） |
| AC-17 i18n | A3 + C2 + D1 |
| AC-18 T3 证据/截图 | 测试 D1/D2 + 统筹 E1 + 验收 E2 |
| AC-19 与 `contract-schema-query` 重叠处理 | 统筹 + 运行时核心 + 桌面窗口（rebase/证据重跑），E1 披露 |
| AC-20 非目标核对 | 统筹 E1 + 验收 E2（范围清单/结构检查） |
| AC-21 闸门 1 单独决定（Q5/Q9） | 沟通记录 + V1/E1 引用 |
| AC-22 面板共存/项目切换 | C1 + C2 + D1 |
| AC-23 O9 回滚开关 | **not applicable（O9 未选）**；V1 引用闸门 1 记录 |
| AC-24 账本重置/ID 重号披露 | B1/C1（面板/审计展示）+ V1/E1；O11 部分 not applicable |

### 7.3 变更包与判定

- 统筹在 D1+D2 完成后组装变更包 `docs/scheduling/customer-authorization-plane-change-v1.md`：候选哈希（产品/测试；`git hash-object` + `sha256sum`）、改动路径（相对 rebase 后实施基线）、任务节点 G2–E3、证据链接、风险档位 T3、复用证据与失效说明、基线 rebase 与退路 B（若采用）披露。
- 内置独立验收按标准与变更包判定；报告路径 `docs/acceptance/customer-authorization-plane-report-v1.md`；报告首行必须含：风险档位、判定依据、选定检查、复用证据、消费者重测结论、全量回归（已执行或 N/A + 理由）。
- 结论只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；统筹不改验收结论。
- E2 由**同一验收主上下文**判定；沟通另起唯一验收主上下文，不把客户对话或沟通历史带入验收上下文。
- 验收通过只表示当前候选满足标准 v1，不授权提交、推送、合并、发布。

---

## 八、与 `contract-schema-query` 的协调（计划披露，不改变闸门 1 方案）

### 8.1 实际状态（2026-11-03 实测）

| 项 | 值 |
| --- | --- |
| 本 worktree 基线 | `243d8f6a6db663a383b516aad6320c5110c7f583`（`feat/customer-authorization-plane`） |
| `origin/main` | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` |
| PR #38 | **已合并**（2026-11-03T04:53:28Z；merge commit `9f1a89436594e8d55e0d6c73a81cf54c3c646690`） |
| PR #39 / #40 | 已合并（`f104029` / `4c3a6e4`；分支 tip `bf33f31`） |
| merge-base | `243d8f6`（即本 worktree 基点） |

任务描述中的「PR #38 未合并」在写本计划时已过期；本计划按实测状态排期。**这只是基线顺序披露，不改变方案 P1.1 的任何语义。**

### 8.2 重叠面与冲突评估（按实际 diff）

`feat/contract-schema-query` 相对本基点的产品/测试改动：

| 路径 | 对方改动 | 本任务是否触碰 | 冲突面 |
| --- | --- | --- | --- |
| `src/model/runtime.ts` | 新增 `CONTRACT_SCHEMA_TOPICS`/`ContractSchemaTopic`/`ContractCheckInput.topic`（约 :1135 区域） | **是**（`ShellReviewResult.directive?`、`CustomerInputOutcome.directive?`，约 :242/:523 区域） | 同一文件不同区域，均为加法；文本冲突概率低，但 Model 变更互相使证据失效，须重跑 |
| `app/desktop/session.ts` | 新增 `contractSchemaText` 导入（约 :131）与 `contractCheckText` topic 早退（约 :8091） | **是**（Q9 归属映射 :2077/:4165-4197/:4469-4470/:4657-4690） | 同一文件不同区域；`桌面窗口` 负责合并与回归 |
| `src/provider/runtime/tools.ts`、`schema.ts` | `contract_check` topic 相关 | **否**（O3 不实施；无新判断器工具） | 无直接重叠；但 T3 全量回归须覆盖 |
| `src/common/编排/workflow-preconditions.ts`、`src/common/门禁引擎/governance-roles.ts` | contract_check/advisory 相关 | **否** | 无直接重叠 |
| `test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` | 对方更新 | **否**（不在本任务写集） | 无直接重叠；T3 全量覆盖 |
| `test/编排/trio-worker-report.test.ts`、`workflow-preconditions.test.ts` | 对方更新 | **否** | 无直接重叠；T3 全量覆盖 |
| i18n messages | 对方可能未改（diff 未见） | **是**（本任务新增 key） | 加法合并 |
| docs/acceptance、docs/planning、docs/communication、docs/scheduling | 对方有记录/证据 | 本任务只引用自己的基线 | 文档不混用 |

### 8.3 协调建议（统筹排序）

1. **实施入口先 rebase/合并**：在 IA 后、B0 前，把本 worktree 分支更新到当时的 `origin/main`（当前 `4c3a6e4`，以 IA 时实际 HEAD 为准）。本分支目前只有未跟踪管理文档、无提交，更新基线不产生代码冲突；若届时出现本地提交，按正常 rebase/merge 处理。
2. **重记 B0**：在 rebase 后的基线上重新记录 B0（HEAD、依赖、typecheck、受影响套件、T3 全量基线、失败分类）；**不得复用 rebase 前的 Model/桌面证据**。
3. **冲突归属**：若 `src/model/runtime.ts` 出现冲突，由**运行时核心**解决；若 `app/desktop/session.ts` 出现冲突，由**桌面窗口**解决；解决后重跑受影响证据与 B0 基线。其他角色不得代改。
4. **证据与验收**：AC-19 要求实施基线不含对方未提交改动（现已合并，故为「包含已合并改动」）；E1 变更包必须写明 rebase 前后 HEAD、冲突解决与重跑记录。T3 全量回归覆盖对方已合并的 Model/工具/桌面改动，防止组合回归。
5. **不再等待**：`contract-schema-query` 已收尾合入，本任务无需等待对方；若 `origin/main` 在 IA 前继续前进，重复第 1/2 步并在 E1 披露。
6. **设计 §9.4 的限制解除**：复核记录曾因未读取另一 worktree 而无法独立核实重叠；统筹本次已按实际合并分支只读核对（§8.2），该限制在本计划层面已闭合，但实施时仍需按实际 diff 复核。

---

## 九、提交、发布与构建口径

- 本任务**不 commit、不 push、不合并、不发布**；实施、提交、推送、合并、发布均需客户另行授权（闸门 2 与实施授权分开）。
- 本任务**不写** `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`src/index.ts`、`bin/ans.js`、`.github/workflows/**`、`electron-builder.yml`、发布配方；不改版本号。
- 发布是否走新小版本/overlay、何时发布，另行评估与授权；验收通过不授权发布。
- `app/renderer/dist/` 为构建产物/忽略文件，非候选；证据只引用源码候选与构建命令/输出。

---

## 十、风险、开放点与不一致点

### 10.1 主要风险

1. **闸门 2 未确认**：本计划只是团队计划；客户确认角色指派/写集/边界变更前不派发、不写卡、不改代码。
2. **基线 rebase 与证据失效**：`contract-schema-query` 已合入 `origin/main`；rebase 后 `src/model/runtime.ts`/`app/desktop/session.ts` 的旧证据失效。缓解：B0 在 rebase 后重记，冲突归属明确，E1 披露。
3. **本 worktree 无 `node_modules`**：B0/D1/D2 前须安装依赖或如实记录不可用；未安装前不得把测试声明为已跑。
4. **跨角色契约先行失败**：Model/账本/公开句柄若在消费方之后变更，会返工。缓解：A1/A2/A3 先冻结，B1 消费，C1/C2 依次接入。
5. **共享 JSONL 抽取波及 `task-state.ts`**：迁移必须行为逐字不变；等价回归失败则按设计退路 B（Provider 自带实现、不碰 `task-state.ts`），并在 E1 披露。不得为了抽取而弱化既有账本测试。
6. **Q9 旧读者遗漏**：`=== "judge"` 读者（`requirement-change.ts`）会把 directive 误显示为 customer；必须逐点核对 `session.ts`/`requirement-change.ts`/i18n 显示，AC-10/AC-15 断言。
7. **decision 默认推荐绕行**：冲突/不匹配路径若未绕过 `tryAutoSelectDecision`，「不代选」会被静默代选落空；AC-10 必须覆盖。
8. **高危复核在渲染侧被绕过**：主进程必须按结构化字段重算，未勾选拒绝落账；AC-13。
9. **面板共存/项目切换**：指令面板不得占 `shellCardSlot`、不得进一项目一卡队列；项目切换取消未决面板；AC-22。
10. **`.ans` 读取承诺边界**：本方案只保证无直接 API/工具读取路径；shell 读取同 `tasks.jsonl` 受既有审批/审计；O10 不实施。实施/文档不得夸大。
11. **i18n 计数耦合**：`i18n.test.ts` 分区计数钉死；A3 先冻结 key 与计数，C1/C2 只消费。
12. **真实运行证据依赖环境**：D2 若无法获得截图，E2 按 insufficient evidence 判，不得以单测替代。
13. **`test/桌面应用/` 逐文件授权**：新增第三个测试文件必须停回报，不得自行扩边界。
14. **共享文件并发写**：`src/model/runtime.ts`、`app/desktop/session.ts`、`app/desktop/customer-input.ts`、`app/main.ts`、`app/preload.cjs`、i18n messages、`task-state.ts`、`shell-gate.ts` 是热点；按角色单写者预留，不并发。

### 10.2 开放点

1. **基线 rebase 时点**：IA 后、B0 前执行；以 IA 时 `origin/main` 为准；若再次前进，重复 rebase/重记 B0。
2. **共享 JSONL 路径 A/B**：计划采用 A（共享辅助）；若 P1/等价回归失败，按设计退路 B 实施并披露；两者均不改变闸门 1 语义。
3. **Provider/Service/Pipeline 内部文件命名**：在 B-2/B-3 授权范围内由 B1 实现提案冻结；不得超出 provider/service directive 各 abstract/impl/public 与 `customer-directive.ts`。
4. **新桌面测试文件命名**：B-4 固定为 `directive-input.test.ts`/`directive-decision.test.ts`；若实施需要拆分/新增，停止回报。
5. **`recovery-channel.ts` 是否改动**：取决于 presenter/共享签名；C1 完成报告必须明确「改/不改 + 无回归理由」。
6. **i18n key 集合与计数**：A3 以实际 `i18n.test.ts` 计数为准；C2 只消费。
7. **`directivesEnabled` 基础语义（R1）**：基础实现由主进程推送 `true`（项目切换重推）；O9 不实施，无 env 关闭分支；渲染侧不得仅凭本地解析抑制气泡。
8. **AC-13 的 Q7 A 前提（R2）**：V1 按 Q7 A 标注；若客户改变 Q7，重开闸门 1。
9. **D2 场景覆盖边界**：多引擎逐一真实运行成本高；至少覆盖默认/一个真实引擎，其余以共享通道测试 + 审计样例覆盖；缺口如实写入证据与验收报告。
10. **既有测试排除**：按 B0 基线记录（如 `write-sequencing.test.ts` 等历史串行写测试）；不新增 skip；排除理由写入证据。
11. **`docs/project-rules.md` 已在 `角色卡/项目管理/docs/`**：静态门按其中已确认条目核对；不虚构新规则。
12. **`contract-schema-query` 后续 main 变动**：IA 前复核；若出现新的同文件改动，按 §八重排。

### 10.3 与任务描述/方案的不一致点（如实记录）

1. **任务描述写 `customer.directives.jsonl`（点号）**：方案 P1.1 与复核统一为 `.ans/state/customer-directives.jsonl`（连字符）。本计划按方案路径执行；实现/测试/文档一律使用 `customer-directives.jsonl`。
2. **任务描述写「PR #38 未合并」**：实测已合并（含 PR #39/#40）；本计划按实测状态排期（§八），不改变方案语义。
3. **方案行号对应 `243d8f6`**：rebase 后行号漂移；实施以符号名/文本锚点为准，E1/AC-19 披露。
4. **方案 §8.4 共享辅助是「若团队计划采用」**：本计划采用共享抽取 A，并保留设计退路 B；这是计划层面的施行选择，不是方案语义变更。
5. **方案 §8.1 用目录名描述 Provider/Service**：B-3 以有界模块目录授权落地（仅客户指令账本模块），不扩展为整层目录授权。
6. **复核记录未读取另一 worktree**：统筹已按实际合并分支只读核对重叠面（§8.2）；复核记录本身不改写，其限制在本计划层面披露。
7. **方案头引用复核 94 行 / `5bda5ff7…`**：当前复核记录 132 行 / `d2588445…`（含 P1.1 再复核节）；闸门 1 以当前记录为准，历史快照不混用。

---

## 十一、闸门 2 待客户确认项

> 以下为闸门 2 需客户确认的具体项；客户确认记录由沟通写入 `docs/communication/`。本计划不自行判断客户是否同意。

1. **参与角色**：运行时核心（Model/解析器/高危谓词）、项目管理（共享 JSONL 辅助 + i18n + P1 审核）、编排（账本 Provider/Service/Pipeline + shell 消费者 + Q9 审计枚举）、桌面窗口（Interface/IPC/面板/decision 消费者/Q9 桌面读者）、桌面UI（确认对话框/指令面板/回显抑制/i18n 消费）、测试（跨层集成/T3 全量/真实运行证据）为实施 worker；**人事**在闸门 2 后执行 B-1..B-4；**内置独立验收**负责实施前标准与实施后判定；**统筹**负责计划、派发、收证、变更包与记录；**沟通**负责闸门记录与启动验收主上下文。**不启用**产品、宣传、UIUX设计师、Claude/Codex/Pi 适配器、门禁引擎、装配、项目 `角色卡/独立验收` worker。
2. **精确写集**：按 §4.1/§4.3 逐角色列出（含新增文件与既有更新文件）；任何角色不得写写集外路径；`test/桌面应用/` 仅既有精确文件 + B-4 新增两个文件；`test/桌面应用/e2e/` **不得新建脚本**（只能条件扩展 `e2e/main.mjs`）；新 UI 冒烟/面板测试放 `test/桌面UI/`。
3. **边界变更**：B-1（运行时核心新增 2 个 Model 单文件）、B-2（编排新增 `customer-directive.ts`）、B-3（编排新增 `src/provider/directive/`、`src/service/directive/` 两个有界模块目录）、B-4（桌面窗口新增 2 个精确测试文件）。**无**新增角色、**无**拆分/合并、**无**角色 id/显示名/能力描述变更、**无**其它权限扩大。
4. **风险档位**：**T3**（共享 Model/公共契约 + 权限/审计语义），按 §1.2/§6.3 验证：受影响套件 + 全量适用回归 + 双端 typecheck + `build:renderer` + 方案要求的真实运行截图。
5. **阶段顺序**：G2 → IA → H1/V1/B0 → P1 → A1/A2/A3（契约冻结，可并行）→ B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3；契约先行、共享文件单写者、基线 rebase 先于 B0。
6. **验收安排**：使用**内置独立验收**（写 `docs/acceptance/customer-authorization-plane-criteria-v1.md` / `customer-authorization-plane-report-v1.md`），不使用项目 `角色卡/独立验收` worker；实施前标准先于实施，基于客户闸门 1 确认的 P1.1；E2 由同一验收主上下文判定，沟通另起验收主上下文；标准不得弱于 AC-1..AC-24。
7. **证据口径**：未启用 task_ops（无 `.ans/project.json`）；以文件哈希、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图/账本/审计样例为证据；**最多截图、不得录屏**；不提交、不推送、不合并、不发布；管理记录不混入产品候选；`app/renderer/dist/` 为忽略产物、非候选。
8. **实施授权边界**：闸门 2 与实施授权分开；客户可先确认角色指派/写集/边界变更，再另行给出实施授权；本计划写盘后不派发，直到闸门 2 + 实施授权 + V1 经沟通确认 + B-1..B-4 落地 + 基线 rebase + 逐角色预留完成。实施授权**不含**提交/推送/合并/发布。
9. **基线 rebase 条件**：`contract-schema-query` 已合入 `origin/main`（当前 `4c3a6e4`）；IA 后、B0 前把本分支更新到当时 `origin/main` 并重记基线；旧证据不复用；冲突由运行时核心/桌面窗口按归属解决（§八）。
10. **共享 JSONL 施行选择**：计划采用 A（`src/common/shared/jsonl-ledger.ts` 抽取，`task-state.ts` 等价迁移）；若 P1/等价回归失败，按设计退路 B 实施并披露；两者均不改变闸门 1 语义。
11. **既有默认项不重开**：Q5 A、Q9 A、Q1–Q10 推荐 A、O1–O11 不实施、不做 `@边界`、不做 CLI、不注入模型上下文、不授权代码/角色卡/边界；客户若改变任一项，属方案实质变更，重开闸门 1/2。
12. **并行/在途变更**：本计划假设实施窗口内没有其它变更并发写同一文件；若出现同文件占用，先冻结/重排并回报，不并发写。

---

## 十二、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-11-03_team-plan_customer-authorization-plane.md`）；统筹 memo 续接线索。
- **未确认**：闸门 2（参与角色/写集/B-1..B-4/T3/顺序/验收安排/证据口径/实施授权边界/基线 rebase 条件）与客户实施授权。
- **未写盘**：实施前验收标准（由内置独立验收在闸门 2 + 实施授权后写 `docs/acceptance/customer-authorization-plane-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未联系客户。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权 → 基线 rebase/重记 B0 → 内置独立验收写 V1 → 人事执行 B-1..B-4 → P1 提案与审核 → 按 §五顺序派发。若客户改变方案默认项或写集/边界口径，重开闸门 1/2；本上下文不自行判断客户同意，不扩大授权。

---

## 十三、闸门 2 增补记录（2026-11-03）

- **增补对象**：团队计划 v1（653 行 / SHA-256 `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`）的 **C2（桌面UI）写集**。客户在 P1 审核后选择 **W-1 A（扩写集）**：C2 写集增补 `app/renderer/src/shell/ConfirmCard.tsx`（按需 `shell.css`），用于实现 shell 确认卡不阻塞 Composer，或在卡内提供指令入口，**保持 V1 AC-22 原语义**。
- **授权依据**：客户经沟通选择 W-1 **A**；这是客户本次给出的**闸门 2 写集增补确认**。C2 的 `角色卡/桌面UI/boundary.md` 已有目录授权 `app/renderer/`（含 `src/` 与样式），`ConfirmCard.tsx`/`shell.css` 在既有边界内，**无需人事 H1 / 边界条目变更**。
- **范围**：仅此一项写集增补。团队计划 v1 的其他参与角色、写集、B-1..B-4、T3、阶段顺序、验收安排、证据口径均不变；方案 P1.1（1199 行 / `7875ad6a…`，闸门 1 确认版）与 P1.2（1209 行 / `1748ad2d…`，R1/R2 编辑性等价）不改；复核/V1/沟通记录不改。
- **对 P1 的影响**：C2 修订 P1-CAP-08（ConfirmCard 非阻塞或卡内指令入口，含既有 shell 卡 UI/测试回归）；C1 纠正 AC-22 映射；C1/C2 的 IPC 命名、`directiveNotice`、能力位时序按 P1 审核记录收口。修订后由项目管理窄复审；`recommend approval` 前不写产品代码。
- **版本与哈希**：本增补记录追加后，团队计划文件哈希由 `37e6bd0d…` 变为新值（写盘后实测）；团队计划 **v1 确认版仍以 `37e6bd0d…` 为基线**，本记录为追加的闸门 2 增补，不重写 v1 语义；V1/E2/E1 引用团队计划时应同时引用 v1 哈希与本增补记录。
- **未改**：未改沟通/方案/复核/验收/角色卡/边界；未写产品/测试代码；未 commit/push。

---

## 十四、闸门 2 增补记录 2（2026-11-03，i18n allowlist）

- **客户裁决 W-5 A**：授权项目管理在 `test/项目管理/shared/i18n-guard-allowlist.ts` 增加 `app/desktop/directive-input.ts` 一条（分类注释：输入解析关键字「撤销」，非用户可见 UI；展示文案已 key 化——classification §4）。这是本次**闸门 2 写集增补确认**。
- **依据**：全仓 i18n 硬编码守卫唯一失败 `app/desktop/directive-input.ts:324:10 撤销`；该「撤销」是 `@审批/决策 撤销 #d-N` 的输入协议 token，不是 UI 文案；P1 复审 W-5 要求 allowlist 增补须闸门 2 确认。
- **范围**：仅 allowlist 一条 + 注释；不改产品代码、其他条目、V1/方案/复核/沟通；C1/C2 候选不变。
- **验证**：`node --test --test-concurrency=1 "test/项目管理/shared/i18n-guard.test.ts"` 6/6 pass（scanned=136 allowlisted=21 violations=0）；`i18n.test.ts` 11/11 pass；allowlist 20→21。
- **版本与哈希**：本记录追加后团队计划文件哈希再次变化（见写盘后实测）；v1 确认版仍以 `37e6bd0d…` 为基线，§十三/§十四为追加的闸门 2 增补；V1/E2/E1 引用团队计划时应同时引用 v1 哈希与增补记录。
- **未改**：未改沟通/方案/复核/验收/角色卡/边界；未写产品代码；未 commit/push。
