# 团队计划：shell 判拒后的客户确认通道 + 例行命令白名单扩容 + 回执/开关粒度

- **任务 ID**：`2026-10-31-shell-deny-customer-escalation`
- **产品 flowId**：`shell-deny-customer-escalation`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-10-31
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0 记录**：[`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`](../communication/2026-10-31_intent_shell-deny-customer-escalation.md)（闸门 0 已确认；客户原话「把这个方案立为下一轮改进（走闸门 0/1）」）。该文件含闸门 1 记录后现为 57 行、SHA-256 `51c1a9677cc0d5d8a1fd6d668e44d370556433e5e87ede0be4a8007ac0f57cfc`；方案头引用的 49 行 / `74e0596c…` 是追加闸门 1 记录前的快照，两者按不同版本引用，不混用。
- **闸门 1 记录**：同一文件「闸门 1 记录（2026-10-31）」——客户原话「确认闸门 1 方案 v1.3（857 行 / 6bd12a99）作为实施基线」。
- **客户确认的策划方案版本（唯一实施基线）**：[`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`](../planning/2026-10-31_design_shell-deny-customer-escalation.md) **v1.3**（857 行；SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`，本计划写盘前实测一致）。含 §10 可核对验收标准 P1–P12/G1–G5、§15 Q1–Q14 推荐值（客户按推荐确认）、§11 O1–O12（默认不实施）。**本计划不扩大、不改变方案口径**；实施超出确认版本或 §12 写集须停止并回报。
- **独立复核**：[`docs/planning/2026-10-31_review_shell-deny-customer-escalation.md`](../planning/2026-10-31_review_shell-deny-customer-escalation.md)（148 行；SHA-256 `617d9a7f84599ade1837934a5fb86ee93e95cf13dfca2d37911bc11e0de9c586`）——完整复核 F1–F14、窄复核 N1–N7、第二轮窄复核 N8–N9、确认性窄复核 v1.3 结论「可提交闸门 1」。
- **风险档位**：**T3（治理/权限/审批语义变更）**，按方案 §12/§13 与 `references/testing.md` 风险分档；验证口径见 §1.2。
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目当前**没有 `.ans/project.json`**（仅有 `.ans/sessions/`），未启用 task_ops；本计划不伪造任务令牌、审批、锁或机器预检记录，证据以文件哈希与原始命令输出为准。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（角色指派/写集/边界变更/档位/顺序/验收安排/证据口径/发布口径）**；客户另行给出实施授权前不派发、不写卡、不改代码。

---

## 一、任务与基线

### 1.1 目标（按客户确认的方案 v1.3，不扩大）

实施闸门 0 已确认、闸门 1 已确认 v1.3 的三层改动：

1. **判拒后的客户确认通道（核心）**：judge 主动 `deny`（非 c=deny 硬拒档）或 `manual/retry-capped` 后，角色可对**该精确命令**发起一次客户确认申请；升级卡呈现命令原文、cwd、judge 判拒理由/替代方案、角色必要性说明，选项 `allow-once` / `allow-session` / `deny`；无答复/通道不可用默认拒绝；客户批准记为**客户手批**，审计与 judge 放行可区分；硬拒档（c=deny）、确定性封堵（preblock）、写目标守卫 deny、readonly 档、非 `run_shell` 入口、其它 `manual` 均不可申请。
2. **确定性白名单扩容（减少误伤）**：`matchRoutineShellCommand` 唯一纯谓词——`npm test`、固定脚本名 `npm run test|typecheck|lint|check`、受限路径 `node --test`、`tsc --noEmit`、`npm ci` 在**所有角色（含内置治理角色）**走 (c) 级确定性放行（0 卡、0 judge 调用）；`npm install <新包>` 保留判拒 + 申请确认；其余形态不变，fail-closed 不变。
3. **回执措辞与开关粒度**：判拒回执改为「可申请客户确认 + 关闭开关兜底」；新增「本次运行暂停自动审批」（shell-only、应用运行期、跨窗口重开保留、重启清零、不写偏好、不影响治理 approval 组）；入口在判拒结果行 + 升级卡页脚。

可核对完成标准为方案 §10 的 **P1–P12 / G1–G5**；正式验收标准由内置独立验收在实施前基于同一确认版本写盘（见 §七）。

### 1.2 风险档位与验证口径：T3

方案定档 **T3**，本计划不压档。理由：改变审批/权限语义（判拒后的客户升级）、改 shell 开关粒度、扩大确定性执行面（例行命令不再经 judge 脚本内容审查）、新增审计契约与 IPC/卡片面，跨门禁引擎/编排/Pipeline/运行时核心/桌面窗口/桌面UI/共享 i18n。

**T3 验证口径**：受影响角色层测试 + 跨角色集成 + **全量适用回归**（`node --test` 全部测试，`--test-concurrency=1`，按基线分类 Windows 既有 symlink/EPERM 等环境失败）+ `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` + **真实 Electron E2E** + 按 2026-10-27 客户规则的**真实应用截图**（关闭 DEBUG 覆盖层、记 sha256/候选版本/拍摄命令/窗口尺寸；不得要求或提供录屏）。升档不降档；证据不足按 §七判 `insufficient evidence`。

### 1.3 本轮非目标（不得顺手扩大）

- 不让 judge 自翻判拒；不把 shell 判拒接入「替我决策」；不做「一键允许所有」；无答复不默认放行。
- 不放宽 c=deny 硬拒档与 preblock 长内联/无界搜索；不新增 c=deny 终结（现状按路径区分，方案不修订终结性）。
- 不改治理卡（提案/任命/验收）的「替我决策」语义；不改角色 id/显示名/写区；两开关存在与分组不变。
- 不做 OS 级沙箱、不自动回滚越界写入、不改被治理目标项目。
- **O1–O12 全部默认不实施**（允许一次 TTL、其它 manual 覆盖、按项目/角色暂停、更保守/更宽白名单、聊天内卡、结果行转人工按钮、任意 `npm run <script>`、规则集数据开关、系统行、撤销本会话允许、后台入口、脚本变化后重新申请）。
- 不改 `package.json`/构建配置/发布配方；不提交、不推送、不合并、不发布；不启动应用做「已验收」声明。
- 不改角色卡职责描述、不新建/拆分/合并角色、不扩任何角色权限（仅按 §4.5 做三项精确边界条目变更，交人事执行）。

### 1.4 基线（写计划时实测，2026-10-31）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `feat/flow-improvements-wave1` / `9f670fb2c7d403baf995071055d697c50714c905`（已合并 main `32d8f0d` / v1.8.3） |
| 工作树（写本计划前） | 仅三份未跟踪管理文档：`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`、`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`、`docs/planning/2026-10-31_review_shell-deny-customer-escalation.md`；本计划写盘后新增未跟踪 `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md` 与 memo 更新。以上均非产品代码改动 |
| 已跟踪代码/测试改动 | 无（`git status --short` 无已跟踪项） |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不建立第二条机器状态 |
| Node 环境 | `node v24.22.1`（`C:\Users\51054\AppData\Local\Programs\nodejs`，当前 PATH 可用）；实施前仍按角色证据记录实测版本 |
| 测试命令 | 仓库使用 `node --test`；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`、`npm run dev:renderer` 为既有命令；不新增 runner/配置 |
| 参考测试基线 | 2026-10-31 run-change 记录：全量 3193 tests / 3166 pass / 9 fail（全部为既有 Windows symlink EPERM）/ 18 skip。**仅作参考**；B0 必须在本次实施前重新记录真实基线并按失败分类 |
| 发布基线 | `src/common/装配/release-policy.mjs`：`SOURCE_REF=v1.8.3`、`SOURCE_SHA=c3957d0…`；overlay 白名单 fail-closed。本任务按方案建议走**新小版本**、不用 overlay（见 §八） |
| 共享属主 | `src/common/shared/` 唯一写入者为项目管理；`src/model/runtime.ts` 属运行时核心；`src/common/门禁引擎/` 属门禁引擎；`src/common/编排/` 与 `src/pipeline/orchestration/` 属编排；`app/desktop/`、`app/main.ts`、`app/preload.cjs` 属桌面窗口；`app/renderer/` 属桌面UI；`test/桌面应用/` 对桌面窗口是逐文件授权 |

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-31）** | `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md` |
| 闸门 1：方案确认 | **已确认（2026-10-31，v1.3 为唯一实施基线）** | 同上「闸门 1 记录（2026-10-31）」 |
| 闸门 2：角色指派/写集/边界变更 | **未确认** | 本计划 §九；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开记录；未给前不派发、不改代码 |
| 实施前验收标准 | 未写盘 | 由内置独立验收在闸门 2 后、实施前写 `docs/acceptance/shell-escalation-criteria-v1.md`；沟通确认路径/版本 |
| 发布 | 未议 | 方案建议新小版本发布；发布流程另行（§八） |

### 2.1 闸门 2 与实施授权是两个事实

- 闸门 2 确认的是**参与角色、各自范围和写集、是否有角色/边界变更、档位、阶段顺序、验收安排、证据口径、发布口径**；实施授权是对代码实施的授权。两者分开记录，不能互相替代。
- 客户在闸门 1 的确认不等于闸门 2，也不等于实施授权。
- 本计划写盘后不派发任何 worker，直到：闸门 2 确认 + 实施授权齐备 + 实施前验收标准写盘并经沟通确认 + §4.5 边界变更落地（人事）+ 逐角色范围预留完成。

### 2.2 客户在闸门 1 已确认的默认项（本计划据此排期，不重开）

| 项 | 确认结果 |
| --- | --- |
| 白名单脚本名 | 仅固定 `test\|typecheck\|lint\|check`；任意 `npm run <script>` **不**放行（覆盖 2026-10-29 §五/Q2 的部分口径，已在方案 §3.5 如实披露） |
| `npm ci` | 确定性放行，含生命周期脚本风险，客户已明示接受 |
| `tsc` | 只 `tsc --noEmit`；裸 `tsc` 不放行 |
| 暂停作用域 | 「本次应用运行」：shell-only、跨窗口重开保留、重启清零并回到持久化开关值、不写偏好、不影响治理 approval 组 |
| 限额 | 会话总上限默认 5；同窗口同时 1 张待答 shell 卡族 |
| 呈现面 | 复用既有 shell 确认卡；接受「升级卡排他、审批卡等待」的仲裁 |
| 升级入口 | 仅 `run_shell`；`start_background_task` 判拒不开放（O11 后续） |
| 自定义规则集 | 代码级白名单在 risky 之前命中，即使宿主注入更严格规则；客户已接受并披露 |
| 脚本上下文时效 | 客户批准的是判拒时看到的脚本内容；脚本变化后授权作废、本会话不可再申请 |
| Q1–Q14 / O1–O12 | Q1–Q14 按推荐执行；O1–O12 默认不实施 |

### 2.3 版本纪律

- 方案 **v1.3 857 行 / `6bd12a99…`** 是唯一实施与验收基线。实施角色按方案正文的符号名与文本锚点施工（方案行号对应 HEAD `9f670fb` 快照）。
- 实施中发现需要改方案口径（例如放宽硬拒、允许任意脚本名、扩大入口、改变暂停影响面、接入「替我决策」、改动 §12 写集归属），停止并回报统筹，按 §13.3 重开闸门 1/2；不得自行变更。

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 三处改动分别是：门禁引擎的确定性判定补充、编排的判拒台账/授权消费、桌面窗口/桌面UI 的卡片与开关呈现、运行时核心的契约与工具面、项目管理的 i18n key、测试的跨层证据。它们都是既有角色职责的一部分，没有产生需要不同知识/契约的新持续责任；新增 `shell-escalation.ts`（编排私有）与 `app/desktop/shell-escalation.ts`（桌面窗口）是既有职责内的实现文件 |
| 2. 范围归属 | **现有 Section 1 覆盖；两处 Markdown 漂移 + 一个新测试文件需精确条目** | 方案 §12 的每个路径映射到现有角色（§4.1）。`src/service/gate/shell-rules.ts`（门禁引擎）与 `src/pipeline/orchestration/shell-arming.ts`（编排）只登记在 `boundary.yaml`、未在权威 `boundary.md`——属既有漂移，须由人事校正；`test/桌面应用/shell-escalation.test.ts` 是 `test/桌面应用/` 逐文件授权下的新增文件，须补精确条目（§4.5） |
| 3. 契约影响 | **有，跨角色共享契约变更；每项有唯一 primary owner** | 新增/变更：运行时模型契约（`ShellEscalation*`、`ShellReviewRequest.entry`、`ShellJudgeAudit.manualAsDeny`、`ShellReviewResult.grant`、`GovernedToolsOptions.shellEscalation`）→ 运行时核心；新工具 `request_shell_escalation` 与 schema → 运行时核心；IPC（`shell:confirm-*` 扩展、`shell:judge-pause` 新增、`shell:judge-state.paused`）与 preload → 桌面窗口；升级 registry/状态机/资格/审计事件 → 编排；白名单谓词与 Service 公开出口 → 门禁引擎；i18n key 目录 → 项目管理。契约先冻结（A1/A2/A3）再消费（B1/C1/C2） |
| 4. 证据独立性 | **已满足** | 各实施角色跑自己的层测试并交原始输出；测试角色跑跨层集成、真实 E2E 与 T3 全量回归；内置独立验收按实施前标准（基于 v1.3）判通过/返工/证据不足；实施者不自验，统筹不改验收结论 |
| 5. 协调成本 | **复用现有团队最低；新增角色不划算** | 现有 7 个实施角色（门禁引擎、编排、运行时核心、桌面窗口、桌面UI、项目管理、测试）恰好覆盖 §12 写集；装配本轮不参与（发布另议）；人事只做三项边界条目。新增「升级通道专职角色」会跨层重复建卡/边界/交接成本，且无持续独立责任。协调重点是**契约冻结顺序**与**共享文件单写者**（§5.2） |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 门禁引擎 | **调整边界**（补 `boundary.md` 精确条目 `src/service/gate/shell-rules.ts`；YAML 已登记） | 白名单谓词唯一实现与写守卫协同在既有私有目录；Service 出口是既有模式（`classifyShell`/`defaultShellRules` 已如此消费）；职责不变 |
| 编排 | **调整边界**（补 `boundary.md` 精确条目 `src/pipeline/orchestration/shell-arming.ts`；YAML 已登记） | `shell-gate`/`shell-audit`/`shell-judge-verdict`/`routine-shell-policy` 在私有目录；`run-role.ts`/`govern-session.ts` 已列；新 `shell-escalation.ts` 落在私有目录；职责不变 |
| 运行时核心 | **保留** | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` 均为已授权单文件；`test/runtime-core/` 为目录授权 |
| 桌面窗口 | **调整边界**（新增精确条目 `test/桌面应用/shell-escalation.test.ts`，md+yaml） | `app/desktop/` 目录与 `app/main.ts`/`app/preload.cjs` 单文件已列；`operator-channel.test.ts`/`e2e/main.mjs` 为既有精确条目；仅新测试文件需精确条目 |
| 桌面UI | **保留** | `app/renderer/` 与 `test/桌面UI/` 均为目录授权 |
| 项目管理 | **保留** | `src/common/shared/` 与 `test/项目管理/shared/` 均为目录授权 |
| 测试 | **保留** | `test/测试/` 为目录授权 |
| 装配 | **保留、本轮不参与实施** | 本任务不改 `package.json`/构建配置/入口/发布配方；发布按新小版本另行（§八） |
| 产品、宣传、UIUX设计师、Claude/Codex/Pi 适配器 | **不参与** | 无写集、无契约面 |
| 项目 `角色卡/独立验收` worker | **不参与** | 其 Section 1 只覆盖 `角色卡/独立验收/docs/`，不含 `docs/acceptance/`；使用技能内置独立验收（默认写权 `docs/acceptance/`），避免双重验收 |
| 人事（内置） | **闸门 2 后执行三项边界条目** | 角色卡/边界/YAML/根 changelog 由人事维护；不改角色 id/显示名/职责描述，不扩权限 |
| 内置独立验收 | **参与**（V1 标准 / E2 判定） | 技能默认写权 `docs/acceptance/` |
| 统筹 | **参与**（本计划、派发、收证、变更包、记录） | 技能默认写权 `docs/scheduling/` |
| 沟通 | **参与**（闸门记录、向客户呈报） | `docs/communication/` |

### 3.3 决策表结果

**不变，派给现有角色；另需三项精确边界变更（职责相同，仅补精确路径）。**

- **无**新增角色、**无**拆分、**无**合并、**无**角色 id/显示名变更。
- 三项边界变更见 §4.5：2 项 Markdown/YAML 漂移校正（门禁引擎 `shell-rules.ts`、编排 `shell-arming.ts`）+ 1 项新增精确测试文件条目（桌面窗口 `test/桌面应用/shell-escalation.test.ts`）。
- 新增文件都落在既有**目录授权**内：`src/common/编排/shell-escalation.ts`、`app/desktop/shell-escalation.ts`、`test/编排/shell-escalation.test.ts`、`test/门禁引擎/shell-routine.test.ts`、`test/桌面UI/` 新视图测试、`test/测试/` 集成测试。
- 装配不参与实施；发布另议。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有 7 个实施角色 + 人事边界条目 + 内置独立验收 + 统筹 | **采用** | 写集与现有 Section 1 一一对应；判定/编排/契约/桌面/共享/集成职责分离；协调成本最低 |
| B. 新增「shell 审批升级」专职角色 | 否决 | 一次性纵向切片，不构成持续独立责任；会跨门禁/编排/桌面多处写集，建卡/边界/交接成本大于收益 |
| C. 拆分桌面窗口为「卡片角色 + 暂停角色」 | 否决 | 卡片仲裁（升级/审批/恢复）必须单一 owner 才能保证互斥；写集并不相交到可分离 |
| D. 把升级 registry 放运行时核心或项目管理 shared | 否决 | registry 是每会话编排状态，事实来源在 `shell-gate`/`run-role`；运行时核心只拥有契约类型；shared 是跨角色共享组件，不是闸内部状态 |
| E. 把白名单谓词放编排（避免跨角色） | 否决 | 谓词必须与分类器（`classify-shell.ts`）和写守卫（`shell-write-guard.ts`）同源且唯一；编排只能经 `src/service/gate/shell-rules.ts` 公开出口消费（方案 §5.3/F3） |
| F. 把 `test/桌面应用/shell-escalation.test.ts` 放桌面UI | 否决 | 它测主进程 presenter/暂停 IPC/通道，属桌面窗口；桌面UI 测试应在 `test/桌面UI/` |
| G. 把新断言并入既有 `operator-channel.test.ts` 以避免边界变更 | 不采用 | 方案 §12 明确新增独立测试文件；升级资格矩阵/状态机/仲裁时序体量独立，独立文件更可核对；边界变更小且已列明 |
| H. 使用项目 `角色卡/独立验收` worker | 否决 | 其写区不含 `docs/acceptance/`；会造成双重验收与标准漂移；用技能内置独立验收 |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：A1（运行时模型 + 工具面）、A2（白名单谓词 + Service 出口）、A3（i18n key）可并行，冻结后 B1 才消费；B1 冻结后 C1 才接入；C1 的 IPC/preload 形状冻结后 C2 才实现渲染面。
- **共享文件单写者**：`src/model/runtime.ts` 只能由运行时核心写；`src/pipeline/orchestration/*` 只能由编排写；`app/desktop/**`、`app/main.ts`、`app/preload.cjs` 只能由桌面窗口写；`src/common/shared/**` 只能由项目管理写；`test/桌面应用/**` 只能由桌面窗口写；`test/桌面UI/**` 只能由桌面UI写；`test/门禁引擎/**`、`test/编排/**`、`test/项目管理/shared/**`、`test/测试/**` 各自唯一。
- **不允许**任何角色写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/` 或角色卡/边界。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-10-31 核对）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本。下表依据实际 Section 1；未列路径默认只读。目录授权内新增文件不重写边界；新增精确文件/改动归属/增删逐条路径才交人事。

| 方案 §12 路径 | 所属角色 | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts` | 门禁引擎 | `角色卡/门禁引擎/boundary.md`「目录（私有）`src/common/门禁引擎/`」 | 是（A2） |
| `src/common/门禁引擎/shell-write-guard.ts` | 门禁引擎 | 同上 | 是（A2） |
| `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 | 同上 | 是（A2，文案） |
| `src/service/gate/shell-rules.ts` | 门禁引擎 | `boundary.yaml` 第 24–26 行已列；**`boundary.md` 未列（漂移，H1 校正）** | 是（A2，H1 后） |
| `src/common/编排/shell-escalation.ts`（新增） | 编排 | `角色卡/编排/boundary.md`「目录（私有）`src/common/编排/`」 | 是（B1） |
| `src/common/编排/shell-gate.ts`、`shell-audit.ts`、`shell-judge-verdict.ts`、`routine-shell-policy.ts` | 编排 | 同上 | 是（B1） |
| `src/pipeline/orchestration/shell-arming.ts` | 编排 | `boundary.yaml` 第 20–22 行已列；**`boundary.md` 未列（漂移，H1 校正）** | 是（B1，H1 后） |
| `src/pipeline/orchestration/run-role.ts`、`govern-session.ts` | 编排 | `boundary.md` 单文件条目 | 是（B1） |
| `src/model/runtime.ts` | 运行时核心 | `角色卡/运行时核心/boundary.md` 单文件条目 | 是（A1） |
| `src/provider/runtime/tools.ts`、`schema.ts` | 运行时核心 | 同上 | 是（A1） |
| `app/desktop/shell-escalation.ts`（新增）、`confirm-card.ts`、`recovery-channel.ts`（条件）、`session.ts`、`interface.ts`、`operator-channel.ts` | 桌面窗口 | `角色卡/桌面窗口/boundary.md`「目录 `app/desktop/`」 | 是（C1） |
| `app/main.ts`、`app/preload.cjs` | 桌面窗口 | `boundary.md` 单文件条目 | 是（C1） |
| `app/renderer/src/shell/ConfirmCard.tsx`、`stores/confirm-store.ts`、`chat/ipc.ts`、`lib/platform.ts`、`chat/judge.ts`、`chat/judge-row-view.ts`、`shell/shell.css` | 桌面UI | `角色卡/桌面UI/boundary.md`「目录 `app/renderer/`」 | 是（C2） |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | `角色卡/项目管理/boundary.md`「目录（私有）`src/common/shared/`」 | 是（A3） |
| `test/门禁引擎/classify-shell.test.ts`、`shell-write-guard.test.ts`、新增 `shell-routine.test.ts`、`shell-rules-public-reexport.test.ts`（更新） | 门禁引擎 | 「目录（测试）`test/门禁引擎/`」 | 是（A2） |
| `test/编排/shell-escalation.test.ts`（新增）、`shell-gate.test.ts`、`shell-operator-only.test.ts`、`shell-authorized-routine.test.ts`、`shell-judge*.test.ts` 及受影响 shell 套件 | 编排 | 「目录（测试）`test/编排/`」 | 是（B1） |
| `test/runtime-core/**`（新工具/契约测试，按需） | 运行时核心 | 「目录 `test/runtime-core/`」 | 是（A1） |
| `test/桌面应用/operator-channel.test.ts`（既有，改写/扩展） | 桌面窗口 | 「单文件 `test/桌面应用/operator-channel.test.ts`」既有精确条目 | 是（C1） |
| `test/桌面应用/shell-escalation.test.ts`（新增） | 桌面窗口 | **未列（逐文件授权；H1 新增精确条目）** | 是（C1，H1 后） |
| `test/桌面应用/e2e/main.mjs`（条件扩展） | 桌面窗口 | 「单文件 `test/桌面应用/e2e/main.mjs`」既有精确条目 | 条件（D2 需要时） |
| `test/桌面UI/judge-row-view.test.ts`、`confirm-logic.test.ts`、新增升级卡视图测试（建议 `shell-escalation-view.test.ts`） | 桌面UI | 「目录 `test/桌面UI/`」 | 是（C2） |
| `test/项目管理/shared/i18n.test.ts` | 项目管理 | 「目录（测试）`test/项目管理/shared/`」 | 是（A3） |
| `test/测试/**`（新增跨层集成、受影响套件、E2E 复跑） | 测试 | 「目录（测试）`test/测试/`」 | 是（D1/D2） |
| `src/common/装配/release-policy.mjs`（§12 overlay 影响） | 装配 | 「目录（私有）`src/common/装配/`」 | **否**（新小版本发布，不用 overlay；见 §八） |
| `docs/planning/`、`docs/communication/` | 策划/沟通 | 各自默认写权 | 否（本任务只引用） |
| `docs/scheduling/` | 统筹（内置） | 技能默认写权 | 是（本计划、变更包） |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1 标准、E2 报告） |

### 4.2 共享属主核对（不猜）

- `src/common/shared/`：**项目管理唯一写入者**（`角色卡/项目管理/boundary.md` + `docs/project-rules.md` §一.5）；本任务只新增/修改 i18n 消息 key，不新增共享组件、不复制目录。
- `src/model/runtime.ts`：**运行时核心唯一主属**；本次加字段均为**加法**（`entry?`、`manualAsDeny?`、`grant?`、`shellEscalation?` 与新类型），不得删除/改变既有字段语义。改动会使引用方既有证据受影响，由消费方重测。
- `src/common/门禁引擎/shell-rules.ts` 模式：Service 公开出口只**逐字转出**（同一函数引用），不复制实现；本任务沿用该先例再导出 `matchRoutineShellCommand`。
- `src/common/编排/`：编排私有；其他角色只经 `src/service/gate/shell-rules.ts`（白名单）与 `src/model/runtime.ts`（契约）消费，不得直接导入私有 `common/`。
- `app/desktop/`、`app/main.ts`、`app/preload.cjs`：桌面窗口；`app/renderer/`：桌面UI。渲染侧不实现 IPC，只按 preload 契约消费。
- `test/桌面应用/`：**逐文件授权**（不是目录授权）；本任务只能写 §4.1 列出的既有精确文件 + H1 新增的 `shell-escalation.test.ts`；**不得新建 `test/桌面应用/e2e/` 下的新脚本**（只有 `e2e/main.mjs` 被逐文件授权）。
- `test/桌面UI/`、`test/门禁引擎/`、`test/编排/`、`test/项目管理/shared/`、`test/测试/`：各自目录授权，互不重叠。

### 4.3 逐角色精确写集与可观察交付

> 每个文件同一时间只有一个写入者。实现顺序 `Model → Provider/Service → Pipeline → Interface`；跨角色工作等真实依赖与已冻结契约。

#### 门禁引擎（A2）

- **写集**：
  - `src/common/门禁引擎/classify-shell.ts`：新增唯一纯函数 `matchRoutineShellCommand(argv): { id: string } | undefined`（无 IO、无规则集依赖，实现 §5.1 全部精确形态）；`classifyShellDetailed` 在**硬拒/记号检查之后、risky 判断之前**调用，命中返回 `allow`（`ruleId: "allow:routine:<id>"`）。
  - `src/common/门禁引擎/shell-write-guard.ts`：`evaluateShellWriteTargets` 在程序名解析后、`node --test`/`npm` 脚本分支之前调用**同一函数**，命中返回 `{ kind: "pass" }`。
  - `src/common/门禁引擎/governance-roles.ts`：`SHELL_APPROVAL_CARD_LINE` 补一句「判拒后可申请客户确认（每会话一次）」（文案，不改判定）。
  - `src/service/gate/shell-rules.ts`：再导出 `matchRoutineShellCommand`（同一函数引用；**H1 边界条目落地后**）。
  - `test/门禁引擎/classify-shell.test.ts`（更新既有断言：`npm test`/`npm ci` 由 risky 改 allow；`npm run build`/`npm install` 仍 risky）、新增 `test/门禁引擎/shell-routine.test.ts`（正/负例矩阵、自定义规则集 P7、错误形态不命中）、`test/门禁引擎/shell-write-guard.test.ts`（例行命令返回 `pass`）、`test/门禁引擎/shell-rules-public-reexport.test.ts`（`matchRoutineShellCommand` 同引用断言）。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`src/model/*`、`src/service/gate/resolve-write.ts`、`src/common/编排/**`、`test/编排/**`、`app/**`、其他角色资料。
- **公开契约**：`matchRoutineShellCommand`（经 `src/service/gate/shell-rules.ts`），命中 id 稳定（`allow:routine:<id>`）；不加入 `ShellRules` 数据（§5.4）。
- **可观察交付**：谓词单测通过；分类器/写守卫共用同一函数（diff 证明无第二份）；对 `test/编排/shell-authorized-routine.test.ts` 的影响（`npm ci` 负例与委托命中分支变为 `c-allow`）由编排在 B1 按方案 §5.4 同步改断言，A2 在完成报告中给出谓词行为与影响清单；`node --test "test/门禁引擎/**/*.test.ts"` + `npm run typecheck` 原始输出；候选哈希。

#### 编排（B1）

- **写集**：
  - **新增** `src/common/编排/shell-escalation.ts`：判拒记录台账（键 `(roleId, projectRoot, cwd, entry, 规范化 argv)`；只记录 `entry="run_shell"`；旧记录清理；`seq`）、资格判定（只读已记录审核结果）、状态机（`recorded/requested/granted-once/granted-session/denied/expired/consumed`）、一次性/会话授权存储、脚本上下文 sha256 时效校验（`stale` ⇒ 拒绝且作废）、申请接口（限流 5/1、同命令每会话一次、同窗口 1 张）、升级决定审计事件（`event:"escalation-decision"`）；纯逻辑 + 注入时钟/presenter/审计 sink；roleId 由每会话闭包绑定；**`ANS_SHELL_ESCALATION_DISABLED=1` 时 registry 不创建、工具不注册、`takeGrant` 不注入**（方案 §13.2 推荐回滚开关，默认纳入）。
  - `src/common/编排/shell-gate.ts`：注入 `onReviewed` / `takeGrant` / `onAuditSinkCreated`；**授权检查精确位置**——preblock → write-guard deny → classify 计算 → 仅当 `detail.decision` 为 `review`/`risky`（非 deny、非 allow）时非 script 查授权；script 分支内先 c=deny 检查、再重载上下文并比对 sha256、再查授权；任何 c=deny 不消费/不放行；c=allow 不消费；`readonlyOnly === true` 时不得注入 `takeGrant`（构造期守卫或调用点跳过）；`ShellReviewResult.grant?`；审计写 `customerGrant`；新增分支常量。
  - `src/common/编排/shell-audit.ts`：审计记录加可选 `event` / `customerGrant` / `escalation` / `entry` 字段（append-only、向后兼容）；`escalation-decision` 记录填既有必填字段（`timestamp`、`toolCallId`（可空串）、`command`/`argv`/`cwd`（判拒原文）、`conclusion`、`execution:"未执行"`、`conditions:["shell-gate"]`）。
  - `src/common/编排/shell-judge-verdict.ts`：判拒出路句改为「可申请客户确认 + 关闭开关兜底」；保留「关闭」「替我审批」「重试」子串与 `containsExitLine` 兼容。
  - `src/common/编排/routine-shell-policy.ts`：形态判断复用 `matchRoutineShellCommand`（经 Service 出口），但**只接受原委托清单三个 id**（`npm test`、`npm run typecheck`、`node --test` 受限路径），保留项目根/cwd/realpath 校验；不继承新增形态。
  - `src/pipeline/orchestration/shell-arming.ts`：透传 `onReviewed`/`takeGrant`/`onAuditSinkCreated` 到 `buildShellGate`（共享 sink）——**H1 边界条目落地后**。
  - `src/pipeline/orchestration/run-role.ts`：每会话构造 `shellEscalation`（注入 presenter），把 `recordReview`/`takeGrant` 交给闸、把 `request` 作为工具能力；`AdapterCapabilities` 增字段。
  - `src/pipeline/orchestration/govern-session.ts`：公共再导出（薄）。
  - 测试：**新增** `test/编排/shell-escalation.test.ts`；按方案与影响更新 `shell-gate.test.ts`、`shell-operator-only.test.ts`、`shell-authorized-routine.test.ts`（**按方案 §5.4**：`npm ci` 负例与 `npm test`/`npm run typecheck`/`node --test` 的委托命中分支改为 `c-allow`，不得弱化其它断言）、`shell-judge.test.ts`、`shell-judge-concurrency.test.ts`、`shell-judge-read-discipline.test.ts`、`shell-judge-risk-scope.test.ts`、`shell-arming.test.ts`；若断言受影响，更新 `shell-advisory-ruleset.test.ts`、`shell-readonly.test.ts`、`shell-review-chain.test.ts`、`shell-risky-order.test.ts`、`shell-command-guard.test.ts`、`shell-post-audit.test.ts`（完成报告逐条列出理由）。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`。
- **不写**：`src/model/runtime.ts`、`src/provider/runtime/**`、`src/common/门禁引擎/**`、`src/service/gate/shell-rules.ts`、`app/**`、`test/门禁引擎/**`、`test/桌面应用/**`。
- **公开契约**：`ShellEscalationSession`（内部）；`onReviewed`/`takeGrant`/`onAuditSinkCreated` 的语义与位置按 §6.3；授权放行分支 `customer-escalation:allow-once|allow-session`；申请决定分支 `escalation:granted-once|granted-session|denied|expired`；`by` 形状按 §7.1。
- **可观察交付**：资格矩阵（可申请/不可申请全表）；状态机与旧记录清理；五路径授权顺序（script/advisory/operatorOnly/三层链/readonly）单测；c=allow 不消费；c=deny 不消费/不放行；`stale-context`；后台入口不写入/不清除/不消费；回滚开关（工具不注册/无授权）；`node --test "test/编排/**/*.test.ts"` + `npm run typecheck`；候选哈希。

#### 运行时核心（A1）

- **写集**：
  - `src/model/runtime.ts`：新增升级通道契约（§6.3 形状）：`ShellEscalationAction`/`ShellEscalationDecision`/`ShellEscalationCardRequest`（含 `version`/`requestId`/`kind` 由桌面侧扩展、`roleId`/`projectRoot`/`runtime`/`command`/`argv`/`cwd`/`judgeReason`/`judgeCustomerMessage`/`judgeAlternative`/`necessity`/`approvalContext`/`expiresAt`）/`ShellEscalationPresentFn`/`ShellEscalationFn`（入参含 `command`/`argv`/`necessity`）/`ShellGrant`；`ShellReviewRequest.entry?: "run_shell" | "start_background_task"`；`ShellJudgeAudit.manualAsDeny?: true`（加法）；`ShellReviewResult.grant?`；`GovernedToolsOptions.shellEscalation`。
  - `src/provider/runtime/tools.ts`：注册 `request_shell_escalation`（**注入才注册**且 shell 已 arm；入参 `{command, necessity?}`，argv 由本文件 `splitCommand` 生成后交 registry，模型不提供 argv）；`run_shell`/`start_background_task` 在 `ShellReviewRequest` 填 `entry`；授权放行结果附「客户已允许一次/本会话」说明。
  - `src/provider/runtime/schema.ts`：新工具 JSON-Schema 与说明（明确只申请、不执行命令、每会话一次、无授权字段）。
  - `test/runtime-core/`（按需新增/更新）：工具注册/缺省不注册、argv 注入、entry 字段、schema 形状、加法字段兼容。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`。
- **不写**：`src/common/**`、`src/pipeline/**`、`app/**`、`test/编排/**`、`test/测试/**`。
- **公开契约**：上述模型类型与工具契约；**A1 完成即冻结**，B1/C1 只按冻结形状消费；变更须回到本角色并重跑受影响证据。
- **可观察交付**：`node --test "test/runtime-core/**/*.test.ts"` + `npm run typecheck`；类型加法不破坏既有消费方（typecheck 全绿）；工具未注入时不注册（能力缺席）；候选哈希。

#### 桌面窗口（C1）

- **写集**：
  - **新增** `app/desktop/shell-escalation.ts`：升级卡 pending/replay/expire 呈现端（复用扩展后的 `confirm-card.ts`）；IPC 数据面（卡请求、回包、过期）；卡内容只用判拒记录（命令原文/argv/cwd/judge 理由/替代方案/上下文），necessity 标注「角色提供，未经验证」。
  - `app/desktop/confirm-card.ts`：共享核心扩展——**保留既有布尔 `mount/respond` 不变**，新增「动作投影」挂载（升级卡）；跨卡片仲裁 API `pendingCount()`/`canPresent()`/`waitForSlot(signal)`；升级卡排他、审批卡在主进程等待；等待期间不启动操作者确认超时；等待上限/中止 fail-closed；按 `{id}`/`kind` 路由回包；不破坏恢复卡「等待客户不设限」语义。
  - `app/desktop/recovery-channel.ts`：仅当共享核心签名变化时做最小适配（签名不变则不改，完成报告说明）。
  - `app/desktop/session.ts`：把桌面 presenter 交给 `openRoleSession`；会话终止/重建时中止挂起升级卡（默认拒绝，不放行）。
  - `app/desktop/interface.ts`：`ShellJudgeStateReply` 增可选 `paused`；暂停读取/恢复接口（状态本体在 `app/main.ts` 模块级）。
  - `app/desktop/operator-channel.ts`：`retry-capped` 拒绝建议改用新出路文案；确保 `manualAsDeny`/`modelVerdict` 事实随判拒审计传出（共享类型加法后去掉/兼容本地扩展）；开关关闭路径逐字不变。
  - `app/main.ts`：升级卡 IPC（复用 `shell:confirm-*`）；新增 `shell:judge-pause`（模块级 `shellSessionPaused`，只影响 shell 操作者通道的 `isEnabled()`，不改持久化开关、不影响治理 approval 组）；`shell:judge-state` 推送 `paused`。
  - `app/preload.cjs`：受限桥新增升级卡/暂停方法（白名单，不暴露 Node 能力）。
  - 测试：`test/桌面应用/operator-channel.test.ts`（开关路径回归）；**新增** `test/桌面应用/shell-escalation.test.ts`（资格/呈现/三选项/超时/replay/仲裁四组时序/暂停 IPC/窗口重开语义）——**H1 边界条目落地后**；条件扩展 `test/桌面应用/e2e/main.mjs`（真实 Electron 总自检；不新建 e2e 目录脚本）。
  - 自身 `docs/change/`、`api-spec.md`（IPC 通道与导出）、`memo.md`。
- **不写**：`app/renderer/**`、`src/**`、`package.json`/`tsconfig.json`/`vite.config.ts`、`test/桌面UI/**`、`test/测试/**`、`test/门禁引擎/**`、`test/编排/**`、`test/项目管理/shared/**`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：IPC 形状按方案 §7.2（`shell:confirm-request` 复用 + `kind`；回包按 `kind` 区分 `allow` 与 `action`；`shell:judge-pause`；`shell:judge-state.paused`）；`ShellJudgeStateReply` 可选加法；preload 方法名；卡内容字段按 §7.1。
- **可观察交付**：升级卡不会覆盖审批卡、审批卡不会覆盖升级卡；有审批卡待答时升级申请直接拒绝；超时/窗口关闭/轮次中止默认拒绝；重复回包不产生第二次授权；暂停不写偏好、不影响治理 approval 组、跨窗口重开保留、重启清零；开关关闭路径逐字不变；`node --test test/桌面应用/operator-channel.test.ts test/桌面应用/shell-escalation.test.ts` + `npm run typecheck`；候选哈希。

#### 桌面UI（C2）

- **写集**：
  - `app/renderer/src/shell/ConfirmCard.tsx`：升级卡三按钮/字段（命令原文块、cwd、judge 理由/替代方案、必要性独立区块+不可信标注、客户手批声明、暂停页脚次动作）。
  - `app/renderer/src/stores/confirm-store.ts`：按 `kind` 路由；升级卡与审批卡单槽互斥呈现；过期/未知 id 回 `{ok:false,expired:true}` 的 UI 反馈。
  - `app/renderer/src/chat/ipc.ts`、`lib/platform.ts`：preload 桥新增方法的类型与消费（旧主进程缺省 ⇒ 能力禁用并说明）。
  - `app/renderer/src/chat/judge.ts`、`chat/judge-row-view.ts`：判拒结果行「本次运行暂停自动审批」按钮与「本次运行已暂停」状态/恢复。
  - `app/renderer/src/shell/shell.css`：样式。
  - 测试：`test/桌面UI/judge-row-view.test.ts`、`confirm-logic.test.ts` 按需更新；**新增升级卡视图测试**（建议 `test/桌面UI/shell-escalation-view.test.ts`，目录授权内，命名以实施为准并在完成报告列出）；条件更新 `test/桌面UI/phase5a-electron-smoke.mjs`（真实 build 冒烟）。
  - 证据：`角色卡/桌面UI/docs/change/`（截图/几何输出/日志）。
- **不写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`package.json`、`vite.config.ts`、`tsconfig.json`、`app/renderer/tsconfig.json`（除非构建确需且另回报）、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：只按 `window.desktop` 白名单通道与主→渲染事件消费；不实现 IPC、不判路径、不调 judge。
- **可观察交付**：三选项卡在真实渲染中可用；必要性区块有不可信标注；过期卡不放行；暂停按钮/徽标/恢复；中英文 key 消费正确；`node --test "test/桌面UI/**/*.test.ts"`、`npm run typecheck:renderer`、`npm run build:renderer`；真实 Electron 冒烟（临时 userData）；截图组（关闭 DEBUG）；候选哈希。

#### 项目管理（A3）

- **写集**：
  - `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`：新增/修改 key（§7.3）：`main.operator.escalation.*`（`appliedOnce/appliedSession/denied/expired/ineligible/pending/capped/invalid`）、`main.operator.manualDenyAdvice.retryCapped`、`main.operator.judgeWayOut`（改写，保留「关闭」「替我审批」「重试」）、`ui.judge.closeAndRetry`（改写，保留同上子串）、`ui.confirm.escalation.*`（`title/intro/judgeHeader/necessityHeader/necessityNote/allowOnce/allowSession/reject/note/expired/customerNotJudge/pauseSession`）、`ui.judge.pauseSession/pauseSessionDone/pausedBadge/resume`。
  - `test/项目管理/shared/i18n.test.ts`：显式更新 key 分区计数（当前钉死 ui 886 / main 550 / shared 62 / preferences 3 = 1501；新增后按实际更新）；parity 与英文零中文泄漏。
  - 自身 `docs/change/`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`app/**`、`src/model/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、`test/桌面UI/**`、`test/桌面应用/**`、`test/测试/**`、`test/门禁引擎/**`、`test/编排/**`。
- **公开契约**：i18n key 集合与中英文案；**A3 完成即冻结**，C1/C2 只消费。
- **可观察交付**：中英成对、无中文泄漏、计数更新、既有 key 语义不变；`node --test "test/项目管理/shared/**/*.test.ts"` + `npm run typecheck`；候选哈希。

#### 测试（D1/D2）

- **写集**：`test/测试/`（目录）。默认新增 `test/测试/shell-escalation-integration.test.ts`（跨层：编排 registry + 运行时工具能力 + 桌面 presenter 替身 + 审计 sink；授权顺序、资格矩阵、限流/去重、审计区分、暂停不影响治理 approval 组、白名单 judge 调用计数=0 的可核对断言；用注入替身，不启动真实 Electron）；按需更新受影响的跨角色套件；`角色卡/测试/docs/change/` 证据。
- **不写**：产品源码、其他角色单测/测试目录（`test/桌面应用/`、`test/桌面UI/`、`test/项目管理/`、`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`）、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **可观察交付**：跨层集成原始输出；受影响套件与 T3 全量回归（`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` 或等价）计数与失败分类（既有 Windows 环境失败 vs 本次新增，后者为 0）；`npm run typecheck`/`typecheck:renderer`/`build:renderer`；真实 Electron E2E 复跑（`E2E_PASS`、phase5a 计数）；证据目录路径/哈希；候选哈希、diff/status。

#### 装配（不参与实施，发布另议）

- 本任务**不写** `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`src/index.ts`、`bin/ans.js`、`.github/workflows/release.yml`、`electron-builder.yml`、`src/common/装配/release-policy.mjs`。
- 发布按 §八 走新小版本流程；发布实施（版本号、发布配方）不在本任务写集，另行授权。

#### 内置独立验收 / 统筹 / 人事 / 沟通

- 内置独立验收：`docs/acceptance/shell-escalation-criteria-v1.md`（V1）、`docs/acceptance/shell-escalation-report-v1.md`（E2）；不派 worker。
- 统筹：`docs/scheduling/`（本计划、`shell-escalation-change-v1.md` 变更包、memo）；不派 worker。
- 人事：§4.5 三项边界条目 + 三个角色根 changelog；未确认闸门 2 前不写卡。
- 沟通：`docs/communication/`（闸门 2 确认记录由沟通写入）。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹默认写区；本任务由统筹写本计划、变更包、memo；**不派给任何 worker**。
- `docs/acceptance/`：内置独立验收默认写区；写实施前标准与验收报告；**不使用**项目 `角色卡/独立验收` worker（其 Section 1 不含此目录，且会造成双重验收）。
- `docs/communication/`：沟通写区；本计划不写，闸门 2 确认记录由沟通写入。
- `角色卡/**` 的角色卡、边界、YAML、根 changelog：人事维护；本任务仅 §4.5 三项边界条目 + changelog，不改能力描述、不改 id/显示名。

### 4.5 精确边界变更清单（闸门 2 对象，由人事执行）

> 三项都是「职责不变、补精确路径」。前两项是把 `boundary.yaml` 已登记但 `boundary.md` 缺失的既有条目对齐（Markdown 是授权来源，YAML 是同步副本）；第三项是逐文件授权目录下的新增测试文件。**不新增角色、不改角色 id/显示名、不扩大任何权限。**

| # | 角色 | 治理文件 | 变更内容（精确） | 现状与依据 | 性质 |
| --- | --- | --- | --- | --- | --- |
| B-1 | 门禁引擎 | `角色卡/门禁引擎/boundary.md` | 在 Section 1 表内新增一行：`\| 单文件 \| src/service/gate/shell-rules.ts \| shell 规则集公开再导出（编排 shell 闸 (c) 层的合法注入源；客户 2026-10-12 确认） \|` | `boundary.yaml` 第 24–26 行已登记同名同用途（含「客户 2026-10-12 确认」）；权威 `boundary.md` 未列——既有 Markdown/YAML 漂移。本任务 A2 需要经此公开出口再导出 `matchRoutineShellCommand`（方案 §5.3/F3） | 漂移校正；不扩权限（YAML 已存在的同一条目对齐到 md） |
| B-2 | 编排 | `角色卡/编排/boundary.md` | 在 Section 1 表内新增一行：`\| 单文件 \| src/pipeline/orchestration/shell-arming.ts \| shell 闸装配（I-1 三层链 + su 只读档） \|` | `boundary.yaml` 第 20–22 行已登记（用途：shell 闸装配，注明「补登记；I-1 建设期新建、此前漏登」）；权威 `boundary.md` 未列——既有漂移。本任务 B1 需要改该文件透传新注入（方案 §6.1/§12） | 漂移校正；不扩权限 |
| B-3 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `角色卡/桌面窗口/boundary.yaml` | 新增精确单文件测试条目 `test/桌面应用/shell-escalation.test.ts`，用途：主进程侧测试——升级卡 presenter/三选项/超时/replay、卡片仲裁与暂停 IPC；yaml 条目附 Delta 注释（如 `# --- Delta-SE-1（2026-10-31，团队计划 §4.5；闸门 2）：test/桌面应用/ 新增 1 个精确测试文件（shell-escalation），逐文件授权 ---`） | 两文件均未列；`test/桌面应用/` 对桌面窗口是**逐文件授权**（非目录授权），方案 §12 明确新增该文件且需闸门 2 精确条目 | 新增精确路径（职责相同）；不改 id/显示名；不扩其它权限 |

- 人事执行后须核对：`boundary.md` 与 `boundary.yaml` 一致、无其它未列改动、无保护文件被普通工作文件许可覆盖；按各角色根 `changelog.md` 记录本次校正与依据（团队计划 + 闸门 2 确认记录）。
- 角色职责描述不变：**不重写 role-card.md**；如需注记只写 changelog。
- 本任务**不要求**校正与本写集无关的既有漂移（如编排 `boundary.yaml` 中的 `pm-reviewer.ts` YAML-only 条目）；它保持现状，不在本变更内顺手改边界。
- 除上述三项外，**没有**其它边界变更；所有其它新增文件均在已接受目录授权内。

### 4.6 工作量与范围预留

> 工作量按文件与检查项计，不编造工时；未知按文件面估算。

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 门禁引擎 | 4 个产品文件 + 3–4 个测试文件（含 1 新增） | A2 独占 `src/common/门禁引擎/` 相关文件、`src/service/gate/shell-rules.ts`、`test/门禁引擎/` 相关文件 |
| 编排 | 8 个产品文件（含 1 新增）+ 1 新增测试 + 按影响更新既有 shell 套件 | B1 独占 `src/common/编排/`、`src/pipeline/orchestration/{shell-arming,run-role,govern-session}.ts`、`test/编排/` |
| 运行时核心 | 3 个产品文件 + 按需 runtime-core 测试 | A1 独占 `src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`test/runtime-core/` |
| 桌面窗口 | 1 新增 + 7 个产品文件 + 2 个测试文件（1 新增，条件 e2e 扩展） | C1 独占 `app/desktop/` 列明文件、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/{operator-channel,shell-escalation}.test.ts`、条件 `e2e/main.mjs` |
| 桌面UI | 7 个渲染文件 + 2–3 个测试/冒烟 | C2 独占 `app/renderer/src/**` 列明文件、`test/桌面UI/` 相关文件 |
| 项目管理 | 2 个消息目录 + 1 个计数测试 | A3 独占 `src/common/shared/i18n/messages/`、`test/项目管理/shared/i18n.test.ts` |
| 测试 | 1 个新增集成测试 + 受影响套件 + 全量回归 + E2E 复跑 | D1/D2 独占 `test/测试/` 相关文件 |
| 人事 | 3 项边界条目 + 3 个根 changelog | H1（闸门 2 后） |
| 内置独立验收 | 1 标准 + 1 报告 | V1/E2 |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；任何角色不得写其他角色路径；同一文件同一时间只有一个写入者；契约冻结前消费方不写引用代码。

---

## 五、阶段、依赖与并行组

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、精确写集、三项边界变更、T3、阶段顺序、验收安排、证据口径、发布口径）；实施授权记录（分开） | 本计划写盘 |
| H1 | 边界变更 | 人事 | §4.5 三项精确条目落地（md/yaml 一致）+ 三个角色根 changelog；不改能力描述/角色 id | G2 |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/shell-escalation-criteria-v1.md`：P1–P12/G1–G5 验收表不弱化、T3 依据与升档条件、证据计划、判定规则、版本冻结；经沟通确认路径/版本 | G2（可与 H1/B0 并行） |
| B0 | 基线 | 测试 | 当前 HEAD/工作树、Node/npm、`typecheck`/`typecheck:renderer`/`build:renderer`、受影响套件与全量基线原始输出与失败分类；确认无产品代码改动 | G2（可与 H1/V1 并行） |
| A1 | 契约与工具 | 运行时核心 | `src/model/runtime.ts` 升级契约 + `tools.ts` 注册 `request_shell_escalation`/entry + `schema.ts`；runtime-core 测试；**契约冻结** | V1 + B0 + 实施授权 |
| A2 | 白名单谓词 | 门禁引擎 | `matchRoutineShellCommand` + 分类器前置 + 写守卫 `pass` + `shell-rules.ts` 再导出 + `governance-roles.ts` 文案；门禁引擎测试；**谓词冻结** | H1 + V1 + B0 + 实施授权 |
| A3 | i18n 契约 | 项目管理 | zh-CN/en-US 新 key/措辞 + `i18n.test.ts` 计数与 parity；**key 冻结** | V1 + B0 + 实施授权 |
| B1 | 编排核心 | 编排 | `shell-escalation.ts` + `shell-gate`/`shell-audit`/`shell-judge-verdict`/`routine-shell-policy`/`shell-arming`/`run-role`/`govern-session`；编排测试；**registry/注入契约冻结** | A1 + A2 + H1 |
| C1 | 桌面接线 | 桌面窗口 | `app/desktop/shell-escalation.ts` + `confirm-card` 动作投影/仲裁 + recovery 适配（条件）+ `session`/`main`/`interface`/`operator-channel`/`preload`；`operator-channel.test.ts` + 新增 `shell-escalation.test.ts`；**IPC/preload 形状冻结** | A1 + B1 + A3 + H1 |
| C2 | 桌面UI | 桌面UI | 多动作卡 + 暂停按钮/状态 + `ipc`/`platform`/`judge`/`judge-row-view`/`css`；`test/桌面UI` 测试 + `build:renderer` + 真实 Electron 冒烟（临时 userData） | C1（IPC/preload 冻结）+ A3 |
| D1 | 跨层集成与回归 | 测试 | `test/测试/` 跨层集成；受影响套件；**T3 全量回归**；双 typecheck + build；失败分类；候选哈希/diff/status | A1 + A2 + A3 + B1 + C1 + C2 |
| D2 | 真实应用证据 | 测试 + 桌面窗口（e2e 夹具）+ 桌面UI（截图） | 真实 Electron：升级卡三选项/超时/replay、暂停与窗口重开/重启清零、治理 approval 组不受影响、白名单 0 judge 调用、审计 JSONL 样例；**截图证据**（关闭 DEBUG、sha256、候选、窗口尺寸、拍摄命令） | D1 入口条件满足（真实 build 成功） |
| E1 | 变更包 | 统筹 | `docs/scheduling/shell-escalation-change-v1.md`：候选哈希、改动路径、任务节点、证据链接、T3 | D1 + D2 |
| E2 | 独立验收 | 内置独立验收 | `docs/acceptance/shell-escalation-report-v1.md`：验收表 P1–P12/G1–G5 逐项结论与证据引用；通过/返工/证据不足 | E1 |
| E3 | 放行与记录 | 统筹 → 沟通 | 按匹配当前候选的结论更新记录、释放依赖、交沟通回报；验收通过不授权提交/推送/合并/发布 | E2 |

### 5.2 依赖要点

- **必须串行**：G2 → H1（边界先于写 `shell-rules.ts`/`shell-arming.ts`/新测试文件的节点）；V1/B0 → A1/A2/A3（标准与基线先于实施）；A1+A2 → B1（契约与谓词先于编排消费）；B1 → C1（registry/presenter 接口先于桌面接线）；C1 → C2（IPC/preload 形状先于渲染消费）；C2 → D1 → D2 → E1 → E2 → E3（终验针对合并后的同一候选）。
- **可并行**：H1 / V1 / B0 三者互不写同一路径；A1（运行时核心）、A2（门禁引擎）、A3（项目管理）写集不相交；D2 中测试复跑与桌面UI 截图可在同一候选上并行取证（证据必须附同一候选哈希）。
- **不允许**：B1 与 C1 并行写 `app/desktop/` 或 `src/pipeline/`（无交集也应等冻结契约）；C2 在 C1 冻结前写引用新 IPC 的代码；任何角色在 A1/A2/A3 冻结前写引用其契约的实现；任何角色写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。
- **共享文件不并发写**：`src/model/runtime.ts`（运行时核心）、`src/pipeline/orchestration/*`（编排）、`app/desktop/*`/`app/main.ts`/`app/preload.cjs`（桌面窗口）、`src/common/shared/i18n/messages/*`（项目管理）、`test/桌面应用/*`（桌面窗口）、`app/renderer/*`（桌面UI）。角色名不同不代表写集不同；按路径预留。

### 5.3 各节点入口/出口条件（验收门与证据）

- **G2 入口**：本计划写盘。**出口**：闸门 2 确认记录覆盖本计划版本、参与角色、精确写集、§4.5 三项边界变更、T3、顺序、验收安排、证据口径、发布口径；实施授权记录另行齐备。
- **H1 入口**：G2 确认。**出口**：三项边界条目在 md/yaml 一致落地；三个根 changelog 记录；无其它 diff；人事报告条目与哈希。
- **V1 入口**：G2 确认。**出口**：标准含验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T3 依据与升档条件、判定规则（pass/fail/insufficient evidence/not applicable）、证据计划、版本/哈希冻结；P1–P12/G1–G5 不弱化；沟通确认路径/版本；未确认不派实施。
- **B0 入口**：G2 确认。**出口**：基线命令、环境、计数、失败清单与分类可复算；确认无产品代码改动（除既有未跟踪管理文档与本计划）；记录 Node/npm、OS/Shell、HEAD/worktree。
- **A1 入口**：V1 经沟通确认 + B0 完成 + 实施授权。**出口**：模型契约/工具/schema 落地；runtime-core 测试与 `npm run typecheck` 通过；契约形状与方案 §6.3/§7.1 一致；候选哈希/diff/status；**冻结声明**。
- **A2 入口**：H1 完成（`shell-rules.ts` 条目）+ V1/B0 + 实施授权。**出口**：谓词与两处调用落地且同源；正/负例矩阵、自定义规则集 P7、写守卫 `pass` 通过；既有断言变更逐条列明；`node --test "test/门禁引擎/**/*.test.ts"` + typecheck；候选哈希；**冻结声明**。
- **A3 入口**：V1/B0 + 实施授权。**出口**：key 中英成对、计数更新、parity/零泄漏通过；`test/项目管理/shared/i18n.test.ts` 原始输出；候选哈希；**冻结声明**。
- **B1 入口**：A1/A2 冻结 + H1 完成（`shell-arming.ts` 条目）。**出口**：台账/资格/状态机/授权/时效/审计事件落地；五路径授权顺序、c=allow/c=deny 不消费、stale、后台负例、readonly 守卫、回滚开关通过；`node --test "test/编排/**/*.test.ts"` + typecheck；候选哈希/diff/status。
- **C1 入口**：A1+B1+A3 冻结 + H1 完成（新测试条目）。**出口**：升级卡 presenter、三选项、超时/replay/expire、仲裁四组时序、暂停 IPC、开关关闭路径回归通过；`operator-channel.test.ts` + `shell-escalation.test.ts` 原始输出；typecheck；候选哈希；IPC 形状冻结。
- **C2 入口**：C1 IPC/preload 冻结 + A3 冻结。**出口**：多动作卡与暂停 UI 完成；`node --test "test/桌面UI/**/*.test.ts"`、`typecheck:renderer`、`build:renderer` 通过；真实 Electron 冒烟；截图/几何证据；候选哈希。
- **D1 入口**：A1/A2/A3/B1/C1/C2 全部退出门满足。**出口**：跨层集成通过；受影响套件与 T3 全量回归计数、失败分类（新增确定性失败=0、新 skip=0）；双 typecheck + build；候选哈希/diff/status。
- **D2 入口**：D1 入口条件满足且 `build:renderer` 成功。**出口**：真实 Electron 场景与截图证据齐全（P1/P7/P8）；审计 JSONL 样例（P5）；失败分类；候选哈希与证据哈希。
- **E1 入口**：D1+D2 完成。**出口**：变更包完整、候选可复算、节点/证据链接齐备、T3 标注。
- **E2 入口**：E1。**出口**：验收表逐项结论、总体通过/返工/证据不足；报告链接任务/方案版本/标准版本/候选/证据/未解决项。
- **E3 出口**：只表示当前候选满足标准；不授权提交、推送、合并、发布。

### 5.4 失败、返工与恢复

- 失败阻止依赖节点；独立且已授权工作可继续（如 V1 与 B0 并行、A1/A2/A3 之间互不阻塞）。
- 返工交原所有者（产品代码归所有者、共享归项目管理、测试复测）；验收结论不由统筹改写。
- 候选/契约/标准/边界变化使受影响证据失效：回到待做/返工，不得只改哈希让旧证据冒充当前结果。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。

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
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"`；`npm run typecheck` | 谓词正/负例矩阵；自定义规则集 P7；写守卫 `pass`；同源引用断言；既有断言变更逐条列明；候选哈希 |
| 编排 | `node --test "test/编排/**/*.test.ts"`；`npm run typecheck` | 资格矩阵；状态机；五路径授权顺序；c=allow/c=deny 不消费；stale；后台负例；readonly 守卫；回滚开关；候选哈希 |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"`；`npm run typecheck` | 工具注册/缺省不注册；argv 注入；entry；schema；加法兼容；候选哈希 |
| 桌面窗口 | `node --test test/桌面应用/operator-channel.test.ts test/桌面应用/shell-escalation.test.ts`（按影响加 `session.test.ts` 等既有精确文件）；`npm run typecheck`；条件 `node test/桌面应用/e2e/main.mjs` | 开关路径回归；三选项/超时/replay；仲裁四组时序；暂停 IPC；窗口重开语义；候选哈希 |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"`；`npm run typecheck:renderer`；`npm run build:renderer`；真实 Electron 冒烟（临时 userData） | 三选项卡/必要性标注/暂停按钮；zh 断言保持；en-US 断言；布局/交互几何；截图组；候选哈希（`dist/` 非候选） |
| 项目管理 | `node --test "test/项目管理/shared/**/*.test.ts"`；`npm run typecheck` | key 计数/parity/零泄漏；候选哈希 |
| 测试 | `node --test test/测试/<新集成>.test.ts`；受影响套件；T3 全量回归；`npm run typecheck`/`typecheck:renderer`/`build:renderer`；真实 E2E 复跑 | 集成输出；全量计数与失败分类；E2E `E2E_PASS`/phase5a 计数；证据哈希；候选哈希/diff/status |

### 6.3 T3 验证口径

- 受影响角色层测试 + 跨角色集成 + **全量回归**（T3）；不因「只改文案」跳过共享/集成检查。
- 共享/契约变更的消费者重测：`src/model/runtime.ts` 的实际消费方（编排、运行时核心 tools、桌面窗口、适配器中的实际导入面）与 `src/common/门禁引擎`、`src/common/shared/i18n` 的消费方按 T3 重测。
- 若证据不足以建立跨层结论（无法复算候选、集成证据缺失、消费者清单不清），升档补证；升档不降档。
- 全量回归允许按既有运行方式排除 `write-sequencing.test.ts`（历史串行写测试）；排除理由写入证据。

### 6.4 真实应用与截图证据（P1/P7/P8）

- **执行者**：桌面窗口（`test/桌面应用/e2e/main.mjs` 扩展，如需要）、桌面UI（真实 Electron 冒烟/截图）、测试（跨层 E2E 复跑）；统筹汇总变更包；内置独立验收核对原始证据。
- **场景**：开关开启 → judge 判拒 → 角色调 `request_shell_escalation` → 升级卡显示（命令原文/cwd/理由/替代方案/必要性/客户手批声明）→ `allow-once` 后原样重试执行一次、第二次回到正常链；`allow-session` 反复执行；`deny`/超时默认拒绝；retry-capped 升级卡页脚可暂停；暂停后新 shell 请求走客户确认卡、治理 approval 组不受影响、窗口重开保留、重启清零；白名单命令 0 judge 调用（计数或日志/审计证明）。
- **截图规则**（2026-10-27 客户规则）：**最多截图，不得要求/提供录屏**；截图来自当前候选真实运行、关闭 DEBUG 覆盖层；记录 sha256、候选版本、拍摄命令/窗口尺寸；日志、校验输出与哈希可作辅助证据。
- **证据路径**：截图/日志写 `角色卡/桌面UI/docs/change/…-evidence/` 与 `角色卡/桌面窗口/docs/change/…-evidence/`；测试证据写 `角色卡/测试/docs/change/`；不写产品 `docs/verification/`。

### 6.5 审计证据（P5）

- 提供 `docs/audit/shell-gate.jsonl` 样例（测试/临时 userData 下的真实运行或受控夹具输出）证明三类可区分：
  - judge 放行：含 `judge`（`by` 含 `judge:<engine>`）；
  - 客户手批（开关关闭）：无 `judge`/`customerGrant`，`branch` 以 `→a-allow` 结尾，`by` 以 `operator:<id>` 结尾；
  - 客户升级授权放行：含 `customerGrant`（`requestId/scope/operatorId`）且无 `judge`，`branch` 为 `customer-escalation:allow-once|allow-session`，`by` 以 `customer:` 开头；
  - 申请决定（允许/拒绝/超时）：`event:"escalation-decision"` 记录含 `conclusion`/`execution`/`conditions` 与稳定 `branch`。
- 新增字段（necessity/卡片载荷）不得含凭据；既有 `command`/`argv` 逐字审计行为不变。

---

## 七、独立验收安排

### 7.1 实施前完成标准（V1）

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、实施前；可与 H1/B0 并行。
- **路径**：`docs/acceptance/shell-escalation-criteria-v1.md`。
- **基线**：客户在闸门 1 确认的方案 **v1.3**（857 行 / `6bd12a99…`）+ 闸门 0 意图记录；团队计划只作范围/写集依据，不是标准来源。
- **最低内容**：验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）、T3 依据与升档条件、选定检查、消费者重测与证据复用规则、pass/fail/insufficient evidence/not applicable 判定规则、成功/失败/边界情形、证据失效规则、版本冻结规则。
- **不得弱于**方案 §10 的 P1–P12/G1–G5；不得自造需求或放宽/加严标准实质。
- **冻结**：实施开始后不得改标准适配候选；确需变更时递增版本、记录理由、交沟通/统筹确认，受影响证据重新核对。

### 7.2 验收表与证据映射（供 V1 细化，不替代标准）

| 方案标准 | 主要证据节点/角色 |
| --- | --- |
| P1 判拒后申请通道 | B1（registry/资格）+ C1/C2（卡与回执）+ D2（真实截图） |
| P2 不可申请档与硬地板 | A2（硬拒/封堵路径）+ B1（readonly 守卫、五路径授权顺序、资格矩阵）+ C1（桌面通道） |
| P3 作用域与消费 | B1（once/session/键/stale）+ C1 + D2（两次调用/重建/c=allow 不消费） |
| P4 限流与卡片仲裁 | B1（5/1、去重）+ C1（仲裁 API/等待超时）+ C2（单槽呈现） |
| P5 审计可区分 | B1（审计字段/事件）+ D1（JSONL 样例） |
| P6 开关关闭路径不变 | C1（operator-channel 回归）+ B1（闸路径） |
| P7 白名单扩容 | A2（谓词/写守卫/自定义规则集）+ D1（judge 调用计数=0）+ D2（真实运行） |
| P8 回执与暂停粒度 | B1（回执句）+ C1（暂停 IPC/状态）+ C2（按钮/徽标）+ D2（窗口重开/重启/治理组） |
| P9 i18n 完整 | A3 + C1/C2（消费）+ D1（i18n 测试） |
| P10 不变量与安全 | A1/A2/B1/C1（单测与注入对抗）+ D1 |
| P11 测试与证据 | D1/D2 + E1/E2 |
| P12 无越权改动 | H1 + E1（diff/枚举/写区检查） |
| G1 申请不丢/不重放 | C1/C2（pending/replay/expire）+ D1 |
| G2 judge 行为不回归 | B1/C1 + D1（既有 judge 套件） |
| G3 权限不扩张 | A1/B1/C1 + E1（diff） |
| G4 开关持久化不回归 | C1 + D1（interface/preferences 测试） |
| G5 文档与基线 | 统筹 E1 + 验收 E2 |

### 7.3 变更包与判定

- 统筹在 D1+D2 完成后组装变更包 `docs/scheduling/shell-escalation-change-v1.md`：候选哈希（产品/测试；`git hash-object` + `sha256sum`）、改动路径（相对本变更阶段入口基线）、任务节点 G2–E3、证据链接、风险档位 T3、复用证据与失效说明。
- 内置独立验收按标准与变更包判定；报告路径 `docs/acceptance/shell-escalation-report-v1.md`；报告首行必须含：风险档位、判定依据、选定检查、复用证据、消费者重测结论、全量回归（已执行或 N/A + 理由）。
- 结论只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；统筹不改验收结论。
- 验收通过只表示当前候选满足标准 v1，不授权提交、推送、合并、发布。

---

## 八、发布影响

- **方案建议：作为新小版本发布，不用 overlay**（方案 §12 发布 overlay 影响小节）。本团队计划据此标注，**不展开发布流程**。
- 本任务实施阶段**不写** `src/common/装配/release-policy.mjs`、`package.json`、`package-lock.json`、`.github/workflows/release.yml`、`electron-builder.yml`；`SOURCE_REF` 保持 `v1.8.3`。发布（版本号、发布配方、CI、产物校验）在本任务验收通过后另行授权，由装配按发布流程执行。
- 若客户改选 **overlay 到冻结 tag v1.8.3**：按 `release-policy.mjs` fail-closed，本写集中**全部 `app/`/`src/` 文件必须逐条加入 `files`**（含 `src/common/装配/release-policy.mjs` 自身在该目录白名单内），新增/修改的 `test/` 文件如随版也须逐条列名；该选择需单独的发布评审与客户确认，**方案不推荐**。
- 发布与验收是两个事实：验收通过不授权发布；发布不改变验收结论。

---

## 九、闸门 2 待客户确认项

> 以下为闸门 2 需客户确认的具体项；客户确认记录由沟通写入 `docs/communication/`。本计划不自行判断客户是否同意。

1. **参与角色**：门禁引擎（白名单谓词/写守卫/文案/Service 出口）、编排（升级 registry/闸/审计/回执/装配接线/工具能力接线）、运行时核心（模型契约/新工具/schema）、桌面窗口（升级卡 presenter/仲裁/暂停 IPC/preload/session）、桌面UI（多动作卡/暂停 UI）、项目管理（i18n key 与计数）、测试（跨层集成/T3 全量/真实 E2E）为实施 worker；**人事**在闸门 2 后执行 §4.5 三项边界条目；**内置独立验收**负责实施前标准与实施后判定；**统筹**负责计划、派发、收证、变更包与记录。**不启用产品/宣传/UIUX设计师/Claude适配器/Codex适配器/Pi适配器/项目 `角色卡/独立验收` worker**；**装配本轮不参与实施**（发布另议）。
2. **精确写集**：按 §4.1/§4.3 逐角色列出（含新增文件与既有更新文件）；任何角色不得写写集外路径；`test/桌面应用/` 仅既有精确文件 + H1 新增 `shell-escalation.test.ts`；`test/桌面应用/e2e/` **不得新建脚本**（只能扩展 `e2e/main.mjs`）；新 UI 冒烟放 `test/桌面UI/`。
3. **边界变更**：§4.5 三项（B-1 门禁引擎 `shell-rules.ts` md 校正；B-2 编排 `shell-arming.ts` md 校正；B-3 桌面窗口新增 `test/桌面应用/shell-escalation.test.ts` md+yaml 精确条目）。**无**新增角色、**无**拆分/合并、**无**角色 id/显示名变更、**无**权限扩大；与本写集无关的既有漂移（如编排 `pm-reviewer.ts` YAML-only）本次不校正。
4. **风险档位**：**T3**（治理/权限/审批语义变更），按 §1.2/§6.3 验证：全量回归 + 真实 Electron E2E + 真实截图证据。
5. **阶段顺序**：G2 → H1/V1/B0 → A1/A2/A3（并行）→ B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3；契约先行、共享文件单写者；不得并行写同一文件。
6. **验收安排**：使用**内置独立验收**（写 `docs/acceptance/shell-escalation-criteria-v1.md` / `shell-escalation-report-v1.md`），不使用项目 `角色卡/独立验收` worker；实施前标准先于实施，基于客户闸门 1 确认的 v1.3；标准不得弱于 P1–P12/G1–G5。
7. **证据口径**：未启用 task_ops（无 `.ans/project.json`）；以文件哈希、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图/审计 JSONL 为证据；**最多截图、不得录屏**；不提交、不推送、不合并、不发布；管理记录不混入产品候选；`app/renderer/dist/` 为忽略产物、非候选。
8. **实施授权与闸门 2 分开**：客户可先确认角色指派/写集/边界变更，再另行给出实施授权；本计划写盘后不派发，直到闸门 2 + 实施授权 + 实施前标准经沟通确认 + §4.5 边界条目落地 + 逐角色预留完成。
9. **回滚开关（方案 §13.2 建议项）**：默认纳入实施 `ANS_SHELL_ESCALATION_DISABLED=1`（关闭时不注册申请工具、不创建 registry、不注入 `takeGrant`；既有授权全部失效，fail-closed）；若客户不要求，可裁剪，裁剪后回滚只能整体回退代码（不改变 P/G 验收基线）。
10. **发布口径**：按方案建议走**新小版本**、不用 overlay；发布另行授权与执行（§八）。
11. **既有默认项不重开**：§2.2 的闸门 1 已确认项（固定脚本名、`npm ci`、`tsc --noEmit`、暂停作用域、限额 5/1、复用确认卡、仅 `run_shell`、自定义规则集覆盖、脚本上下文时效、Q1–Q14、O1–O12 不实施）按原口径执行；客户若改变任一项，属方案实质变更，重开闸门 1/2。
12. **并行变更**：本计划假设实施窗口内没有其它变更并发写同一文件；若出现同文件占用，先冻结/重排并回报，不并发写。

---

## 十、风险、开放点与不一致点

### 10.1 主要风险

1. **闸门 2 未确认**：本计划只是团队计划；客户确认角色指派/写集/边界变更前不派发、不写卡、不改代码。
2. **跨角色契约先行失败**：运行时模型/工具契约（A1）若在 B1/C1 后方才变更，会造成返工与证据失效。缓解：A1/A2/A3 先冻结（§5.2/§5.3）。
3. **桌面卡片仲裁复杂性**：升级卡与审批卡共用渲染单槽；必须按方案 §7.2 的排他/等待与等待超时语义实现，否则出现覆盖/挂起。缓解：C1 先冻结仲裁 API 与四组时序测试，C2 按单槽实现。
4. **i18n 计数耦合**：`i18n.test.ts` 分区计数钉死（当前 ui 886 / main 550 / shared 62 / preferences 3 = 1501）；新增 key 必须显式更新，否则全线红。缓解：A3 先冻结 key 集合并更新计数；C1/C2 只消费。
5. **真实应用证据依赖桌面环境**：真实 Electron/E2E 在 Windows 上有时序/环境偶发（历史有 symlink EPERM、窗口时序）；若无法获得真实运行证据，按 `insufficient evidence` 记录，不得以单测替代 P1/P8 真实截图。
6. **共享文件并发写**：`src/model/runtime.ts`、`app/desktop/session.ts`、`app/main.ts`、`preload.cjs`、`src/common/shared/i18n/messages/*` 是跨角色热点；按角色单写者预留，不并发。
7. **白名单安全回退与 `npm ci` 生命周期脚本**：客户已在闸门 1 明示接受；实施不得扩大到任意 `npm run <script>`/裸 `tsc`/越界 `node --test`。
8. **审计 sink 共享**：`onAuditSinkCreated` 必须真正把同一 sink 绑定给升级 registry；外部注入 sink 也须触发回调（方案 F11 处置）。若审计缺失，P5 判证据不足，不以判定正确代替审计。
9. **脚本上下文时效**：`stale-context` 作废且本会话不可再申请；实现必须重载并比对 sha256，不得复用判拒时内容直接放行。
10. **回滚开关未覆盖白名单**：`ANS_SHELL_ESCALATION_DISABLED` 只回滚升级通道；白名单扩容需单独回退代码（方案 §13.2 原文口径）。
11. **未启用 task_ops**：无机器任务状态/凭证；证据与记录以文件与原始输出为准，不伪造。
12. **测试时长**：T3 全量回归与真实 E2E 耗时较长；按 B0 基线安排，不得以「时间紧」降档。

### 10.2 开放点

1. **§13.2 回滚开关**是否纳入实施（默认纳入；见 §九第 9 项）。
2. **卡片仲裁等待上限值**：方案建议复用操作者确认超时链（无环境变量时 120s）；具体值在 C1 实现时确定，不得改变 fail-closed 语义；如实现需要改变方案 §7.2 的语义，停止回报。
3. **`app/desktop/recovery-channel.ts` 是否实际改动**：取决于共享核心签名；C1 必须在完成报告中明确「改/不改 + 理由」，不改也须证明恢复卡无回归。
4. **新增 UI 视图测试命名**：建议 `test/桌面UI/shell-escalation-view.test.ts`，最终以实施为准（目录授权内），完成报告列出。
5. **真实 E2E 的覆盖边界**：多引擎（Claude/Codex/Pi）逐一真实运行成本高；本轮 P1/P8 至少覆盖默认/一个真实引擎，其余引擎以共享通道测试 + 审计样例覆盖，缺口如实写入证据与验收报告（不静默省略）。
6. **并发在飞变更**：本计划基线为 HEAD `9f670fb` 且工作树仅有未跟踪管理文档；实施前若出现同文件改动，重排并回报。

### 10.3 与方案 §12 写集的不一致点（如实记录）

1. **`src/service/gate/shell-rules.ts`**：方案 §12 归门禁引擎；`boundary.yaml` 已登记、`boundary.md` 未列——**既有 Markdown/YAML 漂移**，本计划要求人事按 §4.5 B-1 校正后 A2 才可写；不改变归属。
2. **`src/pipeline/orchestration/shell-arming.ts`**：方案 §12 归编排；同样只在 `boundary.yaml`、不在 `boundary.md`——**既有漂移**，按 §4.5 B-2 校正后 B1 才可写；不改变归属。
3. **`test/桌面应用/shell-escalation.test.ts`**：方案 §12 明确「需闸门 2 精确边界条目」——与 §4.5 B-3 一致；这是本任务唯一真正的新增边界条目。
4. **`src/common/装配/release-policy.mjs`**：方案 §12 列在「发布 overlay 影响」；本计划按方案建议走新小版本，**本任务不写**（不是写集缺口，是发布口径选择）。
5. **方案 §12 未列 `test/runtime-core/**` 与 `test/门禁引擎/shell-rules-public-reexport.test.ts` 的更新**：两者均在既有目录授权内；本计划列入 A1/A2 写集以补足证据（不涉及边界变更）。
6. **方案 §12 未列 `test/桌面应用/e2e/main.mjs` 扩展**：该文件是既有精确条目（已授权）；本计划列为 C1 条件写（仅在真实 E2E 需要时），并禁止在 `test/桌面应用/e2e/` 新建脚本。
7. **方案 §12 标注 `app/desktop/recovery-channel.ts`「可能改」**：本计划按条件写处理（签名不变则不改），见 §10.2 第 3 项。
8. **方案 §12 的 `src/pipeline/orchestration/govern-session.ts`**：已在 `boundary.md` 单文件覆盖，无缺口。

---

## 十一、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`）；统筹 memo 续接线索。
- **未确认**：闸门 2（参与角色/写集/§4.5 三项边界变更/T3/顺序/验收安排/证据口径/发布口径）与客户实施授权。
- **未写盘**：实施前验收标准（由内置独立验收在闸门 2 后写 `docs/acceptance/shell-escalation-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未联系客户。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权 → 内置独立验收写标准（V1）→ 人事执行 H1 边界条目 → 按 §五顺序派发。若客户改变方案默认项或写集/边界口径，重开闸门 1/2；本上下文不自行判断客户同意，不扩大授权。
