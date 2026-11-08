# 团队计划：会话创建准入改为「按操作审批」+ Git 只读/专属命令放行

- **任务 ID**：`2026-11-08-session-admission-approval`
- **产品 flowId**：`session-admission-approval-based`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立固定上下文）
- **日期**：2026-11-08
- **状态**：团队计划已写盘。闸门 1/2 与实施授权按客户预授权与全权委托视为已覆盖（`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`，38 行 / SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`；**发布/tag 除外**）；正式闸门记录（版本/哈希/客户原话）由沟通在 `docs/communication/` 留痕，本上下文不写。**未派发、未实施、未改代码/测试/角色卡/边界/方案/验收文档。**
- **唯一实施基线（方案）**：`docs/planning/2026-11-08_design_session-admission-approval-based.md` **P1.2**（844 行 / 128528 bytes / SHA-256 `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`；写本计划前实测一致）。本计划不扩大、不改变方案口径；实施超出 P1.2 或本计划写集须停止并回报统筹。
- **独立复核**：`docs/planning/2026-11-08_review_session-admission-approval-based.md`（193 行 / 53879 bytes / SHA-256 `817ebc9de73f825f474b42a8f714866bd1d5ddd9b0348e14a2c6f0b3b44d122d`；完整复核 F1–F15 + 窄复核 R1–R7 + 最终窄核对；最终结论「建议提交客户确认」，剩余 R8a–R8c 建议级）。
- **实施前验收标准（B1 v1，已写盘冻结）**：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / 29020 bytes / SHA-256 `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`；状态「B1 完成、冻结（实施前）」，全部条目 `未取证`）。**说明：任务输入称「B1 正在写」，写本计划时实测该文件已完整写盘并自述冻结；以文件现状为准，后续若独立验收递增版本，按 B1 §5 复判规则处理。**
- **闸门 1 留痕**：`docs/communication/2026-11-08_gate-confirmation_session-admission.md`（27 行 / SHA-256 `7ffa4706c48a1450f70c6efa74083e636a8a6ac4a6fff4dfaf74c4128ed7b32f`；P1.2 为确认对象，预授权覆盖）。
- **意图与客户规格**：`docs/communication/2026-11-08_intent_session-admission-approval-based.md`（43 行 / SHA-256 `51918bc90b25691659aa515bfd475c953e5facb356bc343c2e05e594d779c108`；含客户补充规格「git 命令只读放行，每个角色的专属git 命令放行」）。
- **风险档位**：**T3**（P1.2 §4.6：治理/权限/审批语义 + 门禁引擎硬地板收窄 + 跨运行时核心/Pipeline/门禁引擎/trunk Provider/桌面共享契约；不压档）。
- **记录性质**：本文件是统筹团队计划，不是 `task_ops` 机器状态。本检出无 `.ans/project.json`（未启用 task_ops）；不伪造任务令牌、锁、审批或机器预检记录；证据以文件哈希、原始命令输出与独立验收结论为准。
- **基线（写本计划时实测）**：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`（tree `3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`；PR #72 merge `c06942530f80e5cb394246dcb82e0ab3ad2d781f` 的 tree 与之相同）；Node v24.22.1 / npm 11.19.1，`node_modules` 存在。
- **工作树脏基线（写本计划时实测）**：tracked 修改 4 条——`docs/communication/memo.md`、`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`（T1 窄修复，**只读、不属本变更写集**）与 **未暂存删除** `角色卡/项目管理/docs/architecture/shared-components.md`（上一变更 E1 迁移窗口的删旧副本动作，非本变更写集）；未跟踪 197 项（上一变更/历史留存的管理文档、角色卡 evidence 目录与 `.tmp-*`/`.pr-body-*`/`.commit-msg-*` 临时文件；含 B1 v1）。**T1 实际文件集为 3 个**：修改 `src/common/claude-adapter/schema.ts`、修改 `test/claude-adapter/session.test.ts`、未跟踪 `test/claude-adapter/schema.test.ts`（设计只点名前两个；以 B0/统筹记录为准）。
- **文件面基线（写本计划时实测）**：`src/common/shared/` 存在（11 项：argv-primitives、atomic-write、config-loader、diagnostics、env-file、i18n、intent-entry-contract、jsonl-ledger、path-primitives、runtime-settings、runtime-shared）；`test/项目管理/shared/` 存在（14 项）；`src/common/shared/shell-approval-binding.ts` **当前不存在**（本变更新建）；`src/provider/trunk/public/trunk-store.ts` 当前**未导出** `gitCommandArgv`/`executeGit`；`SHELL_RULES_VERSION = "3"`（`src/common/门禁引擎/classify-shell.ts:1109`），规则集 id `ans-default-v3`（`:1792`）。

---

## 一、任务与基线

### 1.1 目标（按 P1.2，不扩大）

1. **准入与执行分离**：受保护项目（`readGitHostProtectionRequirement` 返回 `required`）中，角色会话创建只核「当时可核事实」；取消「非 codex 必须有 native factory plan」与「应用工具含 `run_shell`/`start_background_task` 即创建期拒绝」两处阻断；新增「注册了 shell 工具 ⇒ 审批链绑定 + 持久 file 审计探针必须成立」的身份绑定证据（新 reason `protected-scope-approval-chain-unproven` / `protected-scope-audit-unavailable`，fail-closed）。
2. **只读/非只读按操作分类**：只读命令经既有 (c) 白名单直接放行；其余走既有 (a) 审批卡/「替我审批」+ 审计；确定性封堵（`shell-command-guard`）与写目标守卫（`shell-write-guard`）仍为硬拒。
3. **Git**：只读子命令按精确 argv 白名单直接放行（10 子命令，经固定本地 Git 传输执行，不走通用 spawn）；角色专属 Git 走既有结构化 `git_query`/`git_candidate`/`git_publish` 的角色 ACL + 纯策略 + 审计；裸 Git 写/发布仍拒绝（硬地板=writeGuard 程序名 deny）。
4. **审批链不新建、只接线**：复用 `shell-gate`/`shell-escalation`/`shell-command-guard`/`shell-write-guard`/`shell-audit`/桌面审批卡与判断 agent；未 arm ⇒ shell 工具不存在（结构性 fail-closed）。
5. **不改 PR #72 契约**：`inspectToolSurface`/`composeRuntimeApplicationMediation`/派发父门/controller resume/`RuntimeSessionToolSurfaceFacts` 语义不变；新证据 `approvalChain` 只进入创建准入，不被写/发布门消费。

可核对验收标准见 P1.2 §5（AC-1–AC-30）与 B1 v1（§2 逐条转写）；正式判定由内置独立验收按 B1 v1 作出。

### 1.2 风险档位与验证口径：T3

- 依据 P1.2 §4.6 与 `docs/acceptance/2026-10-22_acceptance-risk-tier-criteria.md` §4.3.3（治理/权限/审批语义变更 + 门禁引擎硬地板收窄 + 跨角色共享契约）。
- **T3 验证口径**：受影响角色层测试 + 跨角色集成 + **全量适用回归**（按 B0 新基线逐条对照冻结失败/skip 名单，`node --test --test-concurrency=1` 口径）+ `npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`）+ **一次最小真实 Claude 运行**（P1.2 §6.2 / B1-EV5）+ 真实运行原始证据。升档不降档；证据不足按 `insufficient evidence` 记录。

### 1.3 本轮非目标（不得顺手扩大）

- 不开放无审批自由 shell；不删除/降低审批、审计、判拒升级、写目标守卫、确定性封堵。
- 不放宽写/发布门（`inspectInitializationProtection`、stable-write、交付、run-stop）；不把应用中介证据或 `approvalChain` 用于这些门。
- 不改角色卡文本/角色边界/治理流程/验收权；不新增角色。
- 不为 Git 写命令新开 shell 审批通道；Git 写/发布仍只走结构化能力。
- 不在本变更解决 P1.6 Q5「仓库初始化保护的应用中介证据」（Q9 披露，负向 AC-26）。
- 不新增运行时回切开关（Q10 推荐）；回切=回滚提交。
- 不修工作树中 checkpoint/T1 等既有在飞改动；不清理与本次无关的未跟踪文件（只按 B0 记录并隔离）。
- 不提交、不推送、不合并、不发布；不改 `package.json`/构建/发布配方（预期无构建面变化）。

### 1.4 本轮不做（统筹能力边界）

- 本上下文不实施、不派发开发（派发待沟通确认后另行启动）、不判独立验收、不写角色卡/边界/方案/产品代码/测试/验收文档。

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-08，含 Git 补充规格） | `docs/communication/2026-11-08_intent_session-admission-approval-based.md`（`51918bc9…`） |
| 闸门 1：方案确认 | **预授权视为已覆盖**（P1.2 为唯一实施基线） | `2026-11-07_preauthorization_proceed-without-gates.md` §解读 3；`2026-11-08_gate-confirmation_session-admission.md`（`7ffa4706…`） |
| 闸门 2：角色指派/写集/边界 | **预授权视为已覆盖**（对本计划版本）；正式记录由沟通在 `docs/communication/` 留痕 | 同上 |
| 客户实施授权 | **预授权视为已给出**；发布除外 | 同上 + 「全权委托」节 |
| 实施前验收标准 | **已写盘冻结**：B1 v1（185 行 / `fb881126…`） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` |
| 提交/推送/PR/合并 | 本变更范围内已由「全权委托」覆盖；**本计划与实施前阶段不执行** | `2026-11-07_preauthorization_proceed-without-gates.md` |
| 发布/tag | **未授权** | 同上 |

### 2.1 预授权不是免记录

- 按预授权条件：方案与团队计划的版本/哈希、复核记录、角色卡清单须在沟通记录留痕。**沟通须在本计划写盘后，把本计划（路径/行数/SHA-256）、P1.2、复核记录与 B1 v1 写入 `docs/communication/` 闸门记录**；未留痕前人事/实施角色不得把本计划当作已确认对象。
- 实质变化（范围、角色结构、治理语义、风险档位、Q 处置）或无法解决的障碍 → 停止并回报客户，不伪造成功。

### 2.2 已确认决定与 Q 处置（不重开）

| 决定 | 本计划执行口径 | 出处 |
| --- | --- | --- |
| 创建准入按操作审批 | 按 P1.2 §2.2/§2.3 实现；新证据身份绑定、fail-closed | 意图记录；P1.2；闸门 1 留痕 |
| Git 只读放行（Q1/Q2） | 按 P1.2 §2.4.3 的 10 子命令精确白名单 + 参数级 fail-closed；`log` 无目标默认 HEAD、`--all` 拒绝；**客户可见披露**：shell 只读 Git 不套用 `git_query` 的 `readableOids`/publication-proof，可读任意完整 OID/历史（AC-29 判可执行范围）；白名单为全局门禁引擎收窄（Q15） | 意图记录「补充规格」；P1.2 §0.3/§2.4.3/Q1/Q2；闸门 1 留痕要点 |
| 角色专属 Git 放行 | 走既有 `git_query`/`git_candidate`/`git_publish` ACL/策略/审计，不因创建准入被拒；越权仍拒 | 意图记录；P1.2 §2.4.4 |
| 审计失败策略（Q4） | **采纳 `deny-non-readonly`**：审批类放行但审计 append 失败 ⇒ 拒绝执行；只读 `c-allow` 不翻转 | P1.2 §2.5.5/Q4；B1 §6.4（验收目标） |
| 受保护+shell 的准入证据（Q5） | 无绑定/项目根不符 ⇒ `protected-scope-approval-chain-unproven`；非 file+durable+probe ok ⇒ `protected-scope-audit-unavailable`；均不创建会话 | P1.2 §2.3/Q5 |
| 后台任务（Q6）/代批（Q7） | 保留 `start_background_task`（同一审批链，升级授权不适用后台）；「替我审批」维持现状（manual/row-failed 按拒绝且不弹卡） | P1.2 §2.5/Q6/Q7 |
| Git 写/初始化（Q9） | **不放宽**注册表级 `inspectInitializationProtection`；受保护项目中角色 Git 写/初始化很可能仍被拒（`git-core-creation-proof-unavailable`/`git-native-surface-unproven`），AC-26 负向验证并披露 | P1.2 §0.3/§2.4.4/Q9；B1 §6.2 |
| 回切（Q10） | 不新增运行时开关；回切=按提交回滚。既有 `ANS_SHELL_ESCALATION_DISABLED` 仅控升级通道，不变 | P1.2 Q10 |
| 错误码（Q11）/审计字段（Q12）/角色卡（Q13） | 按 P1.2 §4.3 退役/新增 reason；`ShellAuditRecord.readonlyGit:{id,canonicalArgv}` 必做、`branch` 保持 `c-allow`、`by` 前缀 `ruleset:allow:readonly:git:<id>`；角色卡文本不改（只读 Git 是权限不是指令） | P1.2 §4.2/§4.3/Q11/Q12/Q13 |
| 真实运行预算（Q14） | 按 P1.2 §6.2 / B1-EV5：1 条客户消息、chief 1 回合、product 1–2 回合、`dispatch_task` ≤1、审批卡 ≤2 张、墙钟 ≤10 分钟、失败即停 | P1.2 Q14；B1 §3.5 |

### 2.3 版本纪律

- P1.2（`b13e2fe7…`）是唯一实施与验收基线；实施角色按 P1.2 的符号名与文本锚点施工（P1.2 行号对应 HEAD `a1b2f66` 快照）。
- B1 v1（`fb881126…`）冻结后不随候选调整；确需变更递增版本并记录理由，受影响证据重判。
- 实施中发现需要改变方案口径（门禁语义、证据路径、写集归属、阶段顺序、Q 处置）→ 停止并回报统筹，按流程重开对应闸门；不得自行变更。

---

## 三、五维判断与决策

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **保留现有角色分工，无新增/拆分/合并**：变更按既有模块所有权自然落到 5 个代码维护角色（运行时核心、编排、门禁引擎、shared-code、桌面窗口/桌面UI）；新增的共享证据件有独立变更原因与接口评审职责，由既有 `shared-code` 维护；Git 只读匹配仍归门禁引擎（单一来源），固定传输归 trunk Provider（编排既有私有目录） | P1.2 §4.1；各角色 `boundary.md` §1 实测（§4.6） |
| 2. 范围归属 | **所有写目标均在现有 Section 1 内，H1 delta = 0（默认口径）**；不存在无 owner 的路径。需更正 P1.2 的 4 处 owner/路径标签（§4.7），但写集归属唯一 | 本计划 §4.2–§4.6 |
| 3. 契约影响 | **有，但为加法**：`RuntimeCreationPlanFacts.approvalChain?`、`ShellReviewRequest.roleId?`、`OperatorPrompt.entry?/roleId?/protectedScope?`、`GovernedToolsOptions.readonlyGit`、`ShellAuditRecord.readonlyGit`（必做）与新增共享模块 API、matcher/规范体公共再导出。**契约先行**：I0 接口评审冻结加法形状与接线，再实现消费方；共享 API 变更须评审记录 + 消费者影响清单 + 测试 | P1.2 §4.1/§4.4；`角色卡/shared-code/boundary.md` 模块纪律 |
| 4. 证据独立性 | **满足**：各实现角色只跑自己模块测试；跨角色集成、B0、T3 全量、真实运行由测试角色执行；B2 由内置独立验收按 B1 v1 判定；统筹不改验收结论 | P1.2 §6；B1 §1/§3 |
| 5. 协调成本 | **高但可控**：5 个代码角色 + 测试 + 独立验收；关键串行点限于共享证据件→消费方、model 加法→工具/桌面、matcher→写守卫/工具路由；其余可并行；写集两两不相交（§4.5），无同文件多写者；不新增客户卡，接口评审为内部流程 | 本计划 §5.7 |

### 3.2 逐角色判断

| 角色 | 判断 | 具体范围（五维要点） |
| --- | --- | --- |
| 运行时核心 | **保留（职责增补，不拆分）** | 创建准入语义（`session.ts` 新算法/admittedPlan/退役旧检查）；Model 加法字段；`tools.ts`/`schema.ts` 只读 Git 路由与 `roleId`/`entry` 透传；模块测试 |
| 编排 | **保留（职责增补，不拆分）** | `shell-gate` 登记 binding/审计探针接线/`auditFailurePolicy`/`projectRoot` 准入字段；`shell-audit` sink 探针/`readonlyGit` 字段；`run-role` 删除旧门 + 防御断言 + 能力注入；`shell-arming` 选项；trunk 固定传输 `executeReadonlyGit` 与公共出口 |
| 门禁引擎 | **保留（职责增补，不拆分）** | `classify-shell` 只读 Git matcher/规范体/删除死规则/升规则集版本；`shell-write-guard` 精确 pass；`shell-rules` 公共再导出；门禁测试与差分 |
| shared-code | **保留（新增一个共享模块）** | 新建 `src/common/shared/shell-approval-binding.ts`（登记/检查/探针、私有 Symbol 宿主）+ 共享测试；共享 API 评审记录 + 消费者影响清单；共享组件目录更新 |
| 桌面窗口 | **保留** | `app/desktop/operator-channel.ts` 卡面数据（`entry`/`protectedScope` 透传、`ShellConfirmRequest` 加法）；`app/desktop/session.ts` 注入只读 Git 能力与 `roleId`；`app/main.ts` 仅透传；既有精确测试内补用例 |
| 桌面UI | **保留（条件参与）** | 若接口评审定稿在卡面展示 `entry`（及可选受保护标识）：`app/renderer/src/chat/judge.ts`/`ConfirmCard.tsx` 渲染与 `test/桌面UI/` 测试；不参与判定 |
| 测试 | **保留** | B0 新基线；跨角色集成（`test/测试/`）；受影响套件；T3 全量对照；真实 Claude 最小运行执行与原始证据；不并入实现角色 |
| 内置独立验收 | **保留** | B1 v1 已写盘冻结；B2 判定；不承担维护职责 |
| 统筹 | **保留** | 本计划、派发、B0/候选登记、变更包、放行记录；不判验收 |
| 装配 | **不参与** | 无 `package.json`/入口/构建/依赖变化；若实施确需构建面变化，停止并回报 |
| 项目管理 | **不参与** | `src/common/shared/` 与共享组件目录已按 B-9/§6.4 移交 `shared-code`；本变更不写 PM 路径 |
| Claude/Codex/Pi 适配器 | **不参与** | P1.2 不改适配器事实方法（Claude/Pi 无 native 事实、Codex 严格路径条件保持） |
| 产品/宣传/UIUX设计师/招募 | **不参与** | 与本变更无关 |
| 项目 `角色卡/独立验收` worker | **不启用** | 避免双重验收；B1/B2 由内置独立验收（技能内置管理角色）执行 |

### 3.3 决策表结果

**不变（现有角色）+ 无 H1 边界变更（默认）+ 新增 1 个共享模块 + 4 处设计文本标签更正 + 实施接口评审 I0。** 无拆分、无合并、无角色 id/显示名变更；不新增客户卡；接口评审为内部流程（记录写入提议角色 `docs/change/`，跨角色排期由统筹记 `docs/scheduling/`）。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 由既有角色按现有边界实施，shared-code 承接新共享件 | **采用** | 写集零重叠、单一 owner；与 PR #72 后的角色结构一致 |
| B. 新设「准入/审批」专项角色 | 否决 | 变更只替换既有模块内语义，无独立变化原因；新增角色违反「不新增角色」非目标 |
| C. 把 `shell-approval-binding` 放 `src/common/编排/`（编排私有） | 否决（默认） | P1.2 定为共享件且被运行时核心消费；放编排私有会造成跨角色 import 私有目录。若 I0 评审否决共享件，则回退为「仅 `createShellGate` 内部登记 + `prepareRole` 经注入的检查函数消费」方案，需重开计划修订（改变写集/接口） |
| D. 把只读 Git matcher 放新 shared 件 | 否决 | 复核 F13 已定稿：沿用 `matchRoutineShellCommand` 先例，门禁引擎私有实现 + `shell-rules` 公共出口 |
| E. 新建 trunk Provider 角色 | 否决 | `src/provider/trunk/` 是编排既有私有目录；P1.2 §4.1 的「运行时 Provider（trunk）」是标签，不是新角色 |
| F. 运行时双轨/回切开关（新旧准入并存） | 否决 | 会引入两套准入语义与测试矩阵；P1.2 Q10 推荐不新增；回切=回滚提交 |
| G. `test/桌面应用/` 新建测试文件 | 否决（默认） | 该目录为逐文件授权（`角色卡/桌面窗口/boundary.md`），新建文件需 H1；默认扩展现有 `operator-channel.test.ts`/`session.test.ts`/`operator-wiring.test.ts` |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：I0 冻结加法形状、binding API、接线与规则集迁移口径，再开始产品写入。
- **单一 owner**：`session.ts`/`tools.ts`/`schema.ts`/`model/runtime.ts` 只由运行时核心写；`shell-gate`/`shell-audit`/`run-role`/`shell-arming`/`provider/trunk` 只由编排写；`classify-shell`/`shell-write-guard`/`shell-rules` 只由门禁引擎写；`src/common/shared/` 只由 shared-code 写；`app/desktop/`/`app/main.ts` 只由桌面窗口写；`app/renderer/` 只由桌面UI写。
- **串行点**：I0 → W1（shared 模块）→ W2（运行时核心准入）/W4（工具路由）；W3 可与 W1/W2 并行，但 W4 依赖 W3；W5 依赖 W2+W3；D1 → RR → E3。
- **差分而非双轨**：只读 Git 规范体与 `gitQueryBody` 做纯函数差分测试；不建立运行时新旧实现并存。

---

## 四、参与角色、写集与边界核对

### 4.1 口径与命名

- 角色均为仓库既有 ANS worker（`角色卡/<roleId>/`）；`roleId` 以目录名为准。
- 本表按**实际 Section 1**（`角色卡/*/boundary.md`，`boundary.yaml` 为同步副本）分配；P1.2 §4.1 的角色/路径标签与实测不一致处以本节为准（§4.7 列明）。
- 允许新增文件规则：目录授权内可新增内部文件（测试目录、`src/common/shared/`、`app/desktop/`、`app/renderer/`、`src/provider/trunk/`、`src/common/门禁引擎/`、`src/common/编排/`）；**`test/桌面应用/` 为逐文件授权，不得新建文件**（除非先经 H1，见 §4.6）。

### 4.2 写集映射（方案 §4.1/§4.2/§4.3 → 唯一 owner + 精确文件）

| # | 方案改动（§4.1/§4.2/§4.3） | 唯一 owner | 精确写集 | 依赖/备注 |
| --- | --- | --- | --- | --- |
| 1 | `RuntimeCreationPlanFacts.approvalChain?`、`ShellReviewRequest.roleId?`、`OperatorPrompt.entry?/roleId?/protectedScope?`（`roleId` 按 P1.2 §2.5.2；审计/展示用，不信任渲染侧）、`GovernedToolsOptions.readonlyGit`（必做） | 运行时核心 | `src/model/runtime.ts` | 加法；I0 冻结形状；`ShellAuditRecord` 不在此文件（见 #4） |
| 2 | 新建共享证据件：`registerShellApproval(gate,facts,sink)`/`inspectShellApproval`/`probeShellApproval`（无值入参、memoize）、私有 Symbol | shared-code | `src/common/shared/shell-approval-binding.ts`、`test/项目管理/shared/shell-approval-binding.test.ts`、`角色卡/shared-code/docs/architecture/shared-components.md` | 共享 API 评审 + 消费者影响清单；不得被生产公共出口再导出 Symbol（R8b） |
| 3 | `createShellGate` 构造成功后登记 binding；`projectRoot` 从「仅诊断」改「准入绑定字段」；`roleId`/`entry` 透传；可选 `auditFailurePolicy`；诊断事件（`shell.git-readonly.allow`/`shell.audit.deny`/`session.admission.approval-chain` 建议） | 编排 | `src/common/编排/shell-gate.ts` | 消费 #2；与 #4 同批 |
| 4 | `ShellAuditSink.probe?()/describe?()`；file sink 探针（含一次 F-6-1 refresh 重试）；`ShellAuditRecord.readonlyGit:{id,canonicalArgv}`（必做）与可选 `roleId` | 编排 | `src/common/编排/shell-audit.ts` | `branch` 保持 `c-allow`；`by` 前缀语义由 #10 产生 |
| 5 | 只读 Git 命中 ⇒ writeGuard pass（仅 `entry==="run_shell"`）；其余 `git` 仍硬拒；`entry` 输入 | 门禁引擎 | `src/common/门禁引擎/shell-write-guard.ts` | **路径更正**：P1.2 §4.1 写 `src/common/编排/shell-write-guard.ts`，实际文件在门禁引擎（§4.7） |
| 6 | 删除「所有裸 Git 硬拒」→ 只读精确白名单 allow / 其余硬拒；`matchReadonlyGit`/`buildReadonlyGitBody`；删除死 `readonly:git` 条目；`SHELL_RULES_VERSION` 3→4 与 `ans-default-v3`→v4；`git log` 默认 HEAD、`--all` 拒绝；攻击矩阵 fail-closed | 门禁引擎 | `src/common/门禁引擎/classify-shell.ts` | 与 #5、#7 同批；差分测试与版本迁移见 §5.6 |
| 7 | 公共出口逐字再导出 matcher/规范体（同一函数引用） | 门禁引擎 | `src/service/gate/shell-rules.ts` | 沿用 `matchRoutineShellCommand` 先例 |
| 8 | 新增固定传输只读入口 `executeReadonlyGit(projectRoot, match, budgets)`：绝对可执行 + 固定 12 项 `-c` + 重建 env + 预算；不接受任意 argv | 编排 | `src/provider/trunk/impl/git-command.ts`、`src/provider/trunk/public/trunk-store.ts` | 公共出口导出；#9 经注入能力消费；不得回退通用 spawn |
| 9 | `run_shell`/`start_background_task` 请求带 `roleId`/`entry`；只读 Git 路由到注入能力；能力缺席 ⇒ `readonly-git-runner-unavailable`；工具说明补充只读 Git 与 `git_query` 指引 | 运行时核心 | `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` | 消费 #1/#8；接线方向由 I0 定稿（§4.7） |
| 10 | 只读 Git 审计 `readonlyGit:{id,canonicalArgv}` 数据来源与 `by` 前缀（`ruleset:allow:readonly:git:<id>`，允许档位后缀）；审计在判定时落盘 | 编排（`shell-gate` 内） | 同 #3（`src/common/编排/shell-gate.ts`） | canonicalArgv 由 #6 单一来源生成；与实际执行体一致性由测试断言 |
| 11 | `prepareRole` 新算法；`approvalChain` 白名单投影与 `configDigest`；`admittedPlan`；`ensureAdapter`/`verifyScope`/`bindPreparedRole` 替换 unconfined 检查；退役 reason；`protected-scope-approval-chain-changed` | 运行时核心 | `src/service/runtime/session.ts` | 消费 #2/#4；Codex native 严格路径逐字保留；`inspectToolSurface` 不动；**保留**：unknown scope、custom/demo、scope revision 变化、工具/handler 漂移、`roleCapabilityGuards unknown` 仍拒绝 |
| 12 | `bindPreparedRuntimeRole` 删除 `:731-733` 的 `runtime-protected-scope-unmediated-app-execution-planned`；防御断言（声称 shell 却无 `approvalChain` ⇒ unproven）；受保护时传 `auditFailurePolicy`；注入 `readonlyGit`；必要时传 `roleId` | 编排 | `src/pipeline/orchestration/run-role.ts` | 与 #11 同批（否则 Codex 受保护+shell 仍拒） |
| 13 | `assemble*` 选项增加 `auditFailurePolicy`（登记点固定在 `createShellGate`） | 编排 | `src/pipeline/orchestration/shell-arming.ts` | 不改装配失败语义（缺件不 arm） |
| 14 | 卡面数据：`ShellConfirmRequest` 加法（`entry`/`protectedScope`）、presenter 透传；只读 Git 能力注入；`app/main.ts` 仅透传 | 桌面窗口 | `app/desktop/operator-channel.ts`、`app/desktop/session.ts`、`app/main.ts`；测试仅扩展 `test/桌面应用/operator-channel.test.ts`（及既有 `session.test.ts`/`operator-wiring.test.ts`，如需要） | 不改判定；`test/桌面应用/` 不新建文件 |
| 15 | 卡面渲染：`entry` 展示（前台/后台任务），可选受保护标识（O7 默认不做） | 桌面UI（条件参与） | `app/renderer/src/chat/judge.ts`、`app/renderer/src/shell/ConfirmCard.tsx`、`test/桌面UI/`（如 `judge.test.ts`） | 若 I0 决定不展示（仅数据面加法），桌面UI 范围可为零；不得出现第二份判定 |
| 16 | 错误码/原因码新增与退役、UI 人话映射（O8 选装） | 运行时核心（产生方）+ 编排（run-role 传递） | 同 #11/#12；O8 若做，桌面窗口 `app/desktop/` 或 i18n 消费方（本计划默认不做 O8） | 退役码不得再由生产路径产生；测试引用按 §4.3 更新 |
| 17 | 角色卡/边界/方案/验收文档 | **不写** | — | 本变更不改角色卡；R8/勘误由沟通/策划文本同步 |

### 4.3 测试写集映射（方案 §4.5/§6.1）

| 测试/新增测试 | 唯一 owner | 说明 |
| --- | --- | --- |
| `test/runtime-core/git-capability-tools.test.ts:577-601`（R14） | 运行时核心 | 断言改为新 reason `protected-scope-approval-chain-unproven`；保持「不构造 native、不发请求、不写 marker」 |
| `test/runtime-core/` 新增/更新：`prepareRole` 真值表、mode 可接受集合、`ensureAdapter`/`verifyScope`/`bindPreparedRole`、approval-chain 变化（AC-27 模块级）、只读 Git 路由（能力缺席 fail-closed） | 运行时核心 | 目录授权；新增文件允许 |
| `test/门禁引擎/classify-shell.test.ts`（`:39-41, 96-102, 452-460, 649, 662-663`） | 门禁引擎 | `git status/log/diff` 等只读形态转 allow；非白名单 flag/子命令仍 deny；ruleId 口径二选一固定 |
| `test/门禁引擎/shell-write-guard.test.ts:111-113, 235-259` | 门禁引擎 | `git status` 仅 `run_shell` 命中 pass；`git clean/checkout/restore` 等保持 deny |
| `test/门禁引擎/git-shell-acl.test.ts:843-852` | 门禁引擎 | 收紧为「只读精确形态 allow；其余 deny」；路径限定 git 程序保持 deny |
| `test/门禁引擎/` 新增：matcher/规范体全形态 + §2.4.3 攻击矩阵 + 边界（OID 长度/字面路径/行号上限/未知 flag/全局选项/`entry`/`log` 默认 HEAD/`--all`）+ **差分测试**（与 `gitQueryBody` 重叠模板逐条同规范 argv；分叉逐条记录） | 门禁引擎 | 差分测试仅覆盖纯函数，不建运行时双轨 |
| `test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914` | 编排 | **既有红、本变更转绿**；B0 记录既有红，E3 区分「既有红转绿」与「新增红」 |
| `test/编排/shell-risky-order.test.ts:39` | 编排 | 硬编码 `version:"3"`/规则集 id 随 `SHELL_RULES_VERSION`→4 同步 |
| `test/编排/` 新增：binding 登记（构造即登记、未登记 fail-closed）、审计探针/refresh 一次重试、`auditFailurePolicy` observe/deny 分支、writeGuard 注入断言（接 (a) 路径必须带 writeGuard）、`executeReadonlyGit` 固定传输（绝对可执行/固定 env/预算/alias 优先内建/能力缺失不回退 spawn） | 编排 | 目录授权；`test/编排/git-command.test.ts` 既有或新增文件均可 |
| `test/测试/lightweight-permission-repairs.test.ts:182`（POSIX skip） | 测试 | 按新白名单同步 |
| `test/测试/` 新增：跨角色集成（受保护+shell 准入正/负例、真实 `createShellGate` + file sink、R14 原始函数拒绝、`run_shell`/`start_background_task` allow/deny/timeout、升级 registry、只读 Git 固定传输端到端、PR #72 回归） | 测试 | 目录授权；跨层集成不与模块单测重复 |
| `test/桌面应用/operator-channel.test.ts` | 桌面窗口 | 卡面加法字段/展示用例；既有断言不破坏；**不新建 `test/桌面应用/` 文件** |
| `test/桌面UI/`（如渲染改动） | 桌面UI | `entry`/受保护标识渲染用例 |

### 4.4 文档与证据写集

| 产物 | owner | 路径 |
| --- | --- | --- |
| 本计划、派发/B0 登记、接口评审汇总、变更包、放行记录 | 统筹 | `docs/scheduling/` |
| B0 记录 + 证据目录、集成证据、真实运行原始证据 | 测试 | `角色卡/测试/docs/change/`（含证据目录与 `evidence-index.md`） |
| 各角色实现/测试证据 | 各实现角色 | `角色卡/<roleId>/docs/change/` |
| 共享 API 评审记录 + 消费者影响清单 | shared-code（提议）+ 消费角色确认 | `角色卡/shared-code/docs/change/` + 消费角色 `docs/change/` |
| B1/B2 | 内置独立验收 | `docs/acceptance/` |
| 闸门/授权留痕 | 沟通 | `docs/communication/` |

### 4.5 无重叠核对（写集两两不相交）

| 写集根 | 唯一 owner | 与其它角色交集 |
| --- | --- | --- |
| `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts`、`test/runtime-core/` | 运行时核心 | 无 |
| `src/common/编排/shell-gate.ts`、`shell-audit.ts`、`src/pipeline/orchestration/{run-role,shell-arming}.ts`、`src/provider/trunk/`、`test/编排/` | 编排 | 无（`src/common/编排/` 私有目录） |
| `src/common/门禁引擎/classify-shell.ts`、`shell-write-guard.ts`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/` | 门禁引擎 | 无 |
| `src/common/shared/shell-approval-binding.ts`、`test/项目管理/shared/`、`角色卡/shared-code/docs/architecture/shared-components.md` | shared-code | 无（`src/common/shared/` 已由 PM 移交） |
| `app/desktop/`（`operator-channel.ts`/`session.ts` 等）、`app/main.ts`、`test/桌面应用/` 既有清单文件 | 桌面窗口 | 无（逐文件测试不新建） |
| `app/renderer/`、`test/桌面UI/` | 桌面UI | 无 |
| `test/测试/`、`角色卡/测试/docs/` | 测试 | 无 |

结论：**写集两两不相交、无同文件多写者；跨角色只读消费（model/shared/shell-rules/trunk 公共出口）不产生写集交集。** 唯一的共享消费面是 `src/common/shared/shell-approval-binding.ts`（shared-code 写、编排/运行时核心读）与 `src/model/runtime.ts`（运行时核心写、编排/桌面读）——均为单一 writer 模式。

### 4.6 Section 1 覆盖图与 H1 边界 delta

> 依据各角色权威 `boundary.md`（`boundary.yaml` 为同步副本；实测两者在本节所列条目上一致）。未列路径默认只读。

| 本变更新文件/新公共入口/改动落点 | 覆盖的 Section 1 条目 | owner | 需 H1？ |
| --- | --- | --- | --- |
| `src/common/shared/shell-approval-binding.ts`（新文件） | 目录（共享资产）`src/common/shared/` | shared-code | **否** |
| `test/项目管理/shared/shell-approval-binding.test.ts`（新测试） | 目录（测试）`test/项目管理/shared/` | shared-code | **否** |
| `executeReadonlyGit`（新函数）+ `public/trunk-store.ts` 新导出 | 目录（私有）`src/provider/trunk/` | 编排 | **否** |
| `matchReadonlyGit`/`buildReadonlyGitBody`（门禁引擎私有/导出纯函数） | 目录（私有）`src/common/门禁引擎/` | 门禁引擎 | **否** |
| `src/service/gate/shell-rules.ts` 再导出 | 单文件 `src/service/gate/shell-rules.ts` | 门禁引擎 | **否** |
| `ShellAuditRecord.readonlyGit`/sink `probe?/describe?` | 目录（私有）`src/common/编排/` | 编排 | **否** |
| `approvalChain`/`roleId`/`OperatorPrompt` 字段/`GovernedToolsOptions.readonlyGit` | 单文件 `src/model/runtime.ts` | 运行时核心 | **否** |
| `session.ts`/`tools.ts`/`schema.ts` 改动 | 单文件授权（各自） | 运行时核心 | **否** |
| 桌面卡面数据/注入 | 目录 `app/desktop/` + 单文件 `app/main.ts` | 桌面窗口 | **否** |
| 渲染展示（如定稿） | 目录 `app/renderer/` | 桌面UI | **否** |
| 测试改动（§4.3） | 各自测试目录/既有逐文件条目 | 各 owner | **否**（`test/桌面应用/` 仅扩展现有清单文件） |

**结论：H1 delta = 0（默认口径）。** 条件项（若出现即停止并回报，由人事 H1 补条目后方可写）：
1. 在 `test/桌面应用/` **新建**测试文件（该目录为逐文件授权）；
2. 任何落在上表之外的路径（例如新目录、把实现移到模块根、跨角色目录写）；
3. 若 I0 评审否决「shared 共享件」方案而改放其它目录（改变写集归属，需修订本计划）。

### 4.7 设计文本勘误与实施接口评审事项（I0 议程）

> P1.2 明确「实施以符号名与文本锚点为准」；下列 4 处标签/路径更正不改变设计方向、客户可见范围或写集唯一性，由沟通知会策划做文本同步；R8a–R8c 按 B1 §0.3 要求由实施接口评审定稿并记录。

| # | 事项 | 处置口径 |
| --- | --- | --- |
| E1 | P1.2 §4.1 写 `src/common/编排/shell-write-guard.ts` | **实际文件为 `src/common/门禁引擎/shell-write-guard.ts`**（复核记录已按实际路径核对）；owner=门禁引擎 |
| E2 | P1.2 §4.1 行标签「运行时 Provider（trunk）」 | 实际 owner=**编排**（`src/provider/trunk/` 是编排私有目录），无独立 trunk 角色 |
| E3 | P1.2 §4.1 行标签「共享（pm/shared）」 | 实际 owner=**shared-code**（PR #72 B-9 已从项目管理移交 `src/common/shared/` 与 `test/项目管理/shared/`） |
| E4 | P1.2 §4.1 把 `ShellAuditRecord.readonlyGit` 列在 `src/model/runtime.ts` 行 | 实际 `ShellAuditRecord` 定义在 `src/common/编排/shell-audit.ts`（编排）；model 行只加 `RuntimeCreationPlanFacts.approvalChain?`/`ShellReviewRequest.roleId?`/`OperatorPrompt.entry?/roleId?/protectedScope?`/`GovernedToolsOptions.readonlyGit` |
| R8a | `registerShellApproval` 签名不一致（§2.3.1 无 sink vs §2.3.2/§4.1 有 sink）；§4.1 shell-arming 行残留旧条件式 | **统一为 `registerShellApproval(gate, facts, sink)`**；登记点唯一在 `createShellGate`；§4.1 shell-arming 的「如不放在 createShellGate 则在此登记」不采用 |
| R8b | 测试私有 Symbol 载体不明 | **挂在 sink 对象（非枚举属性）**，随 `opts.audit` 传递；Symbol 宿主= `src/common/shared/shell-approval-binding.ts`；不得被 `src/service/gate/shell-rules.ts` 等生产出口再导出；生产装配测试断言 `assemble*`/`buildShellGate` 从不设置 |
| R8c | `probeShellApproval` 未登记语义未写明 | **未登记 ⇒ 返回 `undefined`**（走 `protected-scope-approval-chain-unproven`）；**已登记但 sink/probe 缺失/抛错 ⇒ 冻结 facts 且 `probe:"unavailable"`**（走 `protected-scope-audit-unavailable`）；补单测 |
| W1 | 只读 Git 路由接线：`tools.ts`（运行时核心）如何取得 matcher/规范体 | I0 定稿二选一并记录依赖方向：**(a) 注入能力对象同时封装 `match`+`execute`**（推荐：`run-role`/桌面装配构造，运行时核心不 import 门禁引擎）；(b) `tools.ts` 经 `src/service/gate/shell-rules.ts` 公共出口消费（须记录跨角色依赖理由与单一来源证据）。禁止第三份实现 |
| W2 | 规则集版本迁移（`SHELL_RULES_VERSION` 3→4、`ans-default-v3`→v4） | 同批搜索并更新所有规则集夹具/断言；外部/项目级 v3 pin 若存在 → fail-closed（不得静默兼容放宽）；迁移记录入变更包 |
| W3 | `auditFailurePolicy` 默认与装配 | 默认 `"observe"`；受保护范围由 `assembleProjectShellGate`/`assembleOperatorShellGate` 启用 `"deny-non-readonly"`（`run-role` 传入保护状态）；只读 `c-allow` 不翻转 |

**I0 出口**：接口评审记录（写入提议角色 `docs/change/`，统筹在 `docs/scheduling/` 汇总）覆盖上表全部事项；R8a–R8c 关闭；加法契约形状冻结；共享 API 评审记录 + 消费者影响清单齐备。未过 I0 不得开始 W1–W5 产品写入。

---

## 五、阶段计划

### 5.1 节点总表

| 节点 | 阶段 | 角色 | 可观察交付 | 前置 |
| --- | --- | --- | --- | --- |
| G2 | 闸门/授权留痕 | 沟通 | 本计划 + P1.2 + 复核 + B1 v1 的闸门记录（预授权覆盖）；实施授权记录 | 本计划写盘 |
| B0 | 新基线 | 测试（统筹登记） | 新 B0 记录 + 证据目录（B0-1–B0-5） | G2 |
| I0 | 实施接口评审 | 运行时核心/编排/门禁引擎/shared-code/桌面窗口/桌面UI + 测试/独立验收（可判性，只读） | R8a–R8c 处置、接线/依赖方向、规则集迁移、勘误确认、加法形状冻结 | B0（可与 B0 末段并行，实施前完成） |
| W1 | 共享证据与审计接线 | shared-code + 编排 | binding 模块 + 测试；sink probe/describe；`readonlyGit` 审计字段；`createShellGate` 登记与透传；`auditFailurePolicy` | I0 |
| W2 | 创建准入语义 | 运行时核心 + 编排 | model 加法字段；`prepareRole` 新算法；`bindPreparedRole`/`verifyScope`/`ensureAdapter`；`run-role` 删旧门 + 防御断言；退役 reason | W1 |
| W3 | Git 只读执行面 | 门禁引擎 + 编排 | matcher/规范体/分类器/写守卫/规则版本；`executeReadonlyGit` + 公共出口；差分与攻击矩阵测试 | I0（可并行 W1/W2） |
| W4 | 运行时工具路由 | 运行时核心 | `tools.ts`/`schema.ts` 只读 Git 路由（无回退 spawn）、`roleId`/`entry`、`readonly-git-runner-unavailable` | W2（model）+ W3 |
| W5 | 桌面卡面 | 桌面窗口 + 桌面UI | `operator-channel`/`session`/`main` 透传与能力注入；渲染展示（如定稿）；既有测试用例扩展 | W2 + W3 |
| D1 | 确定性验证 | 各 owner + 测试 | 受影响套件、跨角色集成、typecheck、renderer build（如触及）；相对 B0 的新增失败/新 skip=0 | W1–W5 |
| RR | 真实运行最小验证 | 测试（统筹组织） | AC-23/AC-24 证据 + 预算/中止记录（AC-25） | D1 |
| X | 单轨替换/删除与迁移 | 各 owner | 删除清单（旧 reason 分支/常量/死规则）+ 死代码扫描 + 规则集迁移记录 | 与 W1–W3 同批落地，D1 验证 |
| E3-F | 终验执行 | 测试 + 各 owner | T3 全量（对照新 B0 逐条 diff）、typecheck、负例矩阵、候选 manifest | X + RR |
| E3-B | 变更包 | 统筹 | 候选哈希、改动路径、节点、证据链接、T3、删除清单、披露 | E3-F |
| E3-V | B2 | 内置独立验收 | 按 B1 v1 判 pass/fail/insufficient evidence/not applicable | E3-B |
| E3-R | 放行记录 | 统筹 | `docs/scheduling/` 放行记录（只表示当前候选满足 B1；不授权发布） | E3-V |

### 5.2 B0 新基线（核实结论与记录要求）

**核实结论**：上一变更 B0（`角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md`，`13553505…`）绑定 HEAD `e71501c` + 当时工作树；其有效期条款明确「HEAD/T1/依赖/夹具/构建变化 → B0 失效须重记」。当前 HEAD `a1b2f66` 已变化，**旧 B0 不适用于本变更，必须重新登记**。**沿用其「冻结脏基线」方法（记录 + 证据目录 + 失败/skip 权威清单 + 逐条对照），不得沿用其数据**（B1 §1 亦如此要求）。

**新 B0 记录要求（对应 B1 §1 B0-1–B0-5；由测试执行、统筹登记）**：
1. **身份**：HEAD `a1b2f66`（tree `3aa82fb7…`）、分支 `feat/plan-escalation-card`、写记录时的完整 `git status --porcelain`（tracked/untracked 全量）、`src app test` scope、Node/npm/OS/环境变量、暂存区状态；B0 记录路径/行数/字节/SHA-256 + 证据目录索引哈希。
2. **脏基线内容**：T1 实际 3 文件单列（只读、不属本变更候选）；`角色卡/项目管理/docs/architecture/shared-components.md` 未暂存删除如实记录（非本变更写集）；未跟踪文件按类别记录（管理文档/角色卡 evidence/临时脚本；写本计划时实测 197 项，B0 以实测为准），说明不进候选。
3. **全量测试**：文件枚举、逐文件自然 EXIT/CLOSE（或等价逐文件记录）、逐文件 tests/pass/fail/cancelled/skip/todo、退出码/signal/watchdog；已知挂起文件按登记隔离（90s 或既有口径）；**不得以 `--test-force-exit` 冒充自然通过**（若为已知 post-test 泄漏使用，逐文件列明理由）。
4. **失败/skip 权威清单**：按（文件 + 测试名 [+ 类别]）逐条；**基线红/绿必须包含设计 §4.5 点名的既有红**（`test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914`）与既有绿（`test/门禁引擎/classify-shell.test.ts` 等）；上一变更 B0 的 checkpoint 系统性失败/挂起若仍存在，逐条记录并分类（不属本变更）。
5. **有效期**：实施前/E3 前重核 HEAD、分支、T1 文件、依赖锁/夹具/构建配置；任何变化重记 B0；B0 记录自身 SHA-256 入变更包。
6. **候选稳定性**：证据运行前后同一 `src app test` manifest（逐文件 sha256 + 可复算聚合算法明文）；B1 v1 与管理文档不进候选。

### 5.3 B1（实施前标准）

- B1 v1 已写盘并自述冻结（`fb881126…`）；统筹在派发记录登记其哈希。若后续修订递增版本（B1 §5 复判规则），本计划与派发引用新版本，受影响证据重判。

### 5.4 实施批次（按 owner 并行/串行依赖）

- **W1（shared-code → 编排）**：shared 模块先行（含接口评审记录）；编排同批接线 `shell-audit`/`shell-gate`。W1 落地的 binding 是「惰性记录」，不改变任何既有行为（未消费），可安全先行。
- **W2（运行时核心 + 编排）**：`session.ts` 准入算法与 `run-role.ts` 旧门删除/防御断言必须同批完成（否则 Codex 受保护+shell 仍被 `:731-733` 拒绝，AC-3 不可达）；W2 必须在 W1 之后（否则受保护+shell 会话全部 fail-closed，虽安全方向正确但使目标不可达）。
- **W3（门禁引擎 + 编排 trunk）**：与 W1/W2 写集不相交，可并行；matcher/写守卫/分类器/规则版本与 `executeReadonlyGit` 同批（只改分类器不修写守卫会留下「分类器放行、写守卫仍拒」的经典陷阱）。
- **W4（运行时核心）**：在 W2 的 model 字段与 W3 的 matcher/transport 就绪后实现路由；不得回退通用 spawn。
- **W5（桌面窗口 + 桌面UI）**：在 W2 字段、W3 能力就绪后实现；桌面装配需把只读 Git 能力注入适配器工厂选项。
- **测试同批**：各 owner 的 §4.3 同步用例随其批次提交；测试角色的跨角色集成在 W1–W5 完成后开始（D1）。
- **单写者约束**：同一文件同一时间只有一个写入者；`src/common/编排/shell-gate.ts`、`src/service/runtime/session.ts`、`src/common/门禁引擎/classify-shell.ts`、`src/provider/trunk/impl/git-command.ts`、`src/provider/runtime/tools.ts`、`app/desktop/operator-channel.ts`、`app/renderer/src/shell/ConfirmCard.tsx` 为热点单写文件。

### 5.5 测试与验证（受影响套件、T3、真实运行）

| 阶段 | 最低检查（命令） | 判定 |
| --- | --- | --- |
| W1 | `node --test "test/项目管理/shared/**/*.test.ts"`、`"test/编排/**/*.test.ts"`、`npm run typecheck` | 本批次测试全绿；无新增确定性失败 |
| W2 | `node --test "test/runtime-core/**/*.test.ts"`、`"test/编排/**/*.test.ts"`、`npm run typecheck` | R14 新 reason 断言通过；真值表/防御判据通过 |
| W3 | `node --test "test/门禁引擎/**/*.test.ts"`、`"test/编排/**/*.test.ts"`、`npm run typecheck` | 只读 Git allow/deny、写守卫 pass/deny、攻击矩阵、差分、版本/id 同步 |
| W4/W5 | `node --test "test/runtime-core/**/*.test.ts"`、`"test/桌面应用/**/*.test.ts"`；如触及渲染：`npm run typecheck:renderer` + `npm run build:renderer`；`test/桌面UI/**` | 加法字段不破坏既有断言；渲染构建绿或给出 N/A 依据 |
| D1 | 上述受影响套件 + `test/测试/**` 跨角色集成 + PR #72 回归（`test/编排/trunk-dispatch-parent.test.ts`、`test/runtime-core/application-mediation*`）+ `npm run typecheck` | 相对新 B0：**新增确定性失败 = 0、新 skip = 0**；既有失败变化逐条说明；`shell-readonly`/`shell-gate` 既有红转绿单独标注 |
| RR | 真实 Claude 最小验证（P1.2 §6.2 / B1-EV5）：临时根 + 临时 userData；审计门禁预检（同 file sink probe，含一次 refresh）；1 消息/1 chief 回合/1–2 product 回合/≤2 卡/≤10 分钟/失败即停 | AC-23 会话创建成功 + 投递；AC-24 只读 0 卡、非只读卡与审计；AC-25 限制如实 |
| E3-F | **T3 全量**（`node --test --test-concurrency=1`，按 B0 口径文件集/自然退出/挂起登记）+ 失败/skip 逐条 diff + `npm run typecheck` + 渲染按需 + D9 风格死代码扫描（仅限本变更删除项） | 新增确定性失败 0、新 skip 0；删除清单核实；候选 manifest 一致 |

- 现有相关测试**不得删断言/加 skip/放宽**；失效证据按规则重取并披露；Windows 既有环境失败按 B0 基线分类。
- 真实运行只承诺证据所示；不改仓库、不写既有项目、不改 `app/main.ts`；只用仓库根 `.env` 既有凭据（不打印/不复制）。

### 5.6 E1/E2 风格切换/删除：适用性判定、删除清单、迁移、双跑口径

**适用性判定：本变更不建模块双轨、不建运行时双轨（Q10：不新增回切开关）。** 变更是在既有文件内替换准入/门禁语义，旧实现与新实现无法并存运行（并存会产生两套准入语义）。因此 E1/E2 仅取「**单轨替换 + 同批删除 + 纯函数差分 + 回切=回滚提交**」形态：

1. **同批替换/删除清单（随对应批次落地，E3-F 核实）**：
   - **「含 shell 即拒」→「shell ⇒ 审批链绑定 + 审计探针」**：`src/service/runtime/session.ts` 的 `hasUnconfinedScriptTools` 常量（`:242`）及其 4 处使用（`:546`、`:559`、`:1160`、`:1214`）删除，由 `approvalChain` 检查替换（设计 §2.2.3/§2.2.4）；`required-scope-unconfined-script-tools` 不再产生（字符串保留在历史证据/测试注释仅供对照，生产路径零产生）。
   - **「native factory plan 硬拒」→「仅 codex 严格路径」**：`prepareRole` 的 native 准备/校验分支由现行「非 demo 即尝试」收窄为「仅 codex 准备并保持原严格条件」；非 codex 不再产生 `native-factory-plan-unavailable|unverified|preparation-failed`；Codex 原条件逐字保留（不是删除）。`src/pipeline/orchestration/run-role.ts:731-733`：`runtime-protected-scope-unmediated-app-execution-planned` 分支删除；替换为防御断言（声称 shell 却无 `approvalChain` ⇒ unproven）。
   - `src/common/门禁引擎/classify-shell.ts`：`defaultReadOnly()` 中不可达的 `readonly:git` 死规则删除；`SHELL_RULES_VERSION` "3"→"4"、规则集 id `ans-default-v3`→`ans-default-v4`。
   - `src/common/门禁引擎/shell-write-guard.ts`：程序名 git 无条件 deny 改为「matcher 命中且 `entry==="run_shell"` ⇒ pass；其余 deny」。
   - `src/common/门禁引擎/classify-shell.ts`：所有裸 Git 无条件 deny 改为「只读精确白名单 allow / 其余 deny」。
   - 结构化 `gitQueryBody` 的 log 无目标 → `--all` 保持（`git-command.ts:498-503` 语义不动，属 `git_query` 结构化路径）；只读 shell 规范体默认 HEAD——两处分叉在差分测试中逐条记录（设计 §2.4.3/F5 允许的分叉）。
2. **迁移**：规则集版本升级须同步仓库内全部规则夹具/断言（当前实测仅 `test/编排/shell-risky-order.test.ts:39` 硬编码 `version:"3"`）；外部/项目级 v3 pin 若存在即 fail-closed 整条拒绝（不静默放宽，不兼容读 v3，除非 I0 改选兼容并记录理由）；迁移记录与搜索证据入变更包。
3. **双跑口径**：**不做运行时双跑**；仅做纯函数差分——`buildReadonlyGitBody` 与 `gitQueryBody` 对重叠模板（status/log/diff/show/rev-parse/ls-files/ls-tree/merge-base）逐条断言同一描述→同一规范 argv；允许分叉（blame、cat-file 变体、`--oneline`、log 默认 HEAD、输出格式差异）逐条记录。另以模块级 fixture 对新旧准入 reason 集合做对照（证明仅预期变化，无意外放宽）。
4. **回切策略**：无运行时开关；异常时按提交整体回滚（revert）。既有 `ANS_SHELL_ESCALATION_DISABLED` 仅控升级通道，与本变更无耦合；回滚后须重跑 D1/E3 相应证据。

### 5.7 依赖、单写者约束、失败与恢复

- **必须串行**：G2 → B0/I0 → W1 → W2 → W4；W3 → W4；W2+W3 → W5；D1 → RR → E3-F → E3-B → E3-V → E3-R。
- **可并行**：W1 与 W3（写集不相交）；W2 与 W3 在编排侧为不同文件（`run-role.ts` vs `provider/trunk/`），可按文件并行；各角色文档/证据。
- **不允许**：任何角色写写集外路径；W2 早于 W1；只改分类器不改写守卫（或反之）；切换未验证即删旧实现；角色写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界；以旧 B0/旧候选证据冒充当前结果。
- **失败/返工**：失败阻止依赖节点；返工交原所有者（模块归其角色、共享归 shared-code、门禁归门禁引擎、引擎归现有 owner、测试复测）；统筹不改验收结论；候选/B0/契约/标准/边界变化使受影响证据失效，回到待做/返工。
- **并发在飞**：工作树有 T1 三文件（只读）、`shared-components.md` 删除与 197 项未跟踪文件；派发前核对同文件占用；若冲突先冻结/重排并回报。

---

## 六、验收与证据计划

### 6.1 每阶段出口、证据与候选身份

| 阶段 | 出口判据 | 证据 | 候选身份 |
| --- | --- | --- | --- |
| G2 | 沟通闸门记录覆盖本计划 + P1.2 + 复核 + B1 v1 的路径/行数/SHA-256 | `docs/communication/` 记录 | — |
| B0 | B0-1–B0-5 齐备；基线红/绿与设计 §4.5/§6.1 一致 | B0 记录 + 证据目录（索引 hash）+ 原始日志 | HEAD `a1b2f66` + 工作树（T1 单列） |
| I0 | R8a–R8c 关闭；接线/迁移定稿；加法形状冻结；共享 API 评审记录 | 接口评审记录（角色 `docs/change/`）+ 统筹汇总 | — |
| W1–W5 | 各批次测试全绿、typecheck 绿；无新增确定性失败 | 各角色 `docs/change/`（命令/输出/hash） | 逐批次候选 manifest |
| D1 | 受影响套件 + 跨角色集成通过；相对 B0 新增失败 0/新 skip 0 | 测试 `角色卡/测试/docs/change/` + 原始日志 | 组合候选（`src app test` manifest，逐文件 sha256 + 聚合算法） |
| RR | AC-23/24 完成并如实报告；失败/回退保留 | 诊断/`tasks.jsonl`/审计 JSONL/UI 截图/预算记录 | 与 D1 同一候选 |
| E3-F | T3 全量对照 B0 逐条 diff；新增失败 0/新 skip 0；删除清单核实；typecheck/渲染按需 | T3 原始日志/逐文件结果/对照 diff；D9 范围扫描 | 最终候选（冻结哈希） |
| E3-B | 变更包齐备（候选/路径/节点/证据/T3/删除清单/披露/B0 hash） | `docs/scheduling/` | 最终候选 |
| E3-V | B2 报告（pass/fail/insufficient evidence/not applicable） | `docs/acceptance/` | 最终候选 |
| E3-R | 放行记录（满足 B1 的当前候选；不授权发布） | `docs/scheduling/` | 最终候选 |

- **候选范围**：`src/ app/ test/`（逐文件原字节 SHA-256 + 可复算聚合 + 算法明文）；T1 三文件只读、不入候选；管理文档（`docs/`、角色卡 evidence）不入候选；工作树完整 status 在 B0/变更包记录。
- **证据存放**：各角色 `角色卡/<roleId>/docs/change/`；测试 `角色卡/测试/docs/change/`；截图按既有规则（最多截图、不录屏、记录 sha256/候选/命令/尺寸）；管理记录不混入产品候选。
- **证据失效**：候选/B0/设计契约/依赖/夹具/构建/命令/环境变化使受影响证据失效并重取；不得只改哈希冒充当前结果。

### 6.2 披露（客户可见限制，不得隐藏）

1. **Q9**：受保护项目角色 Git 写/初始化很可能仍被注册表级 `inspectInitializationProtection` 拒绝（本方案不放宽）；AC-26 负向验证并在 B2/变更包披露。
2. **F1**：shell 只读 Git **不套用** `git_query` 的 `readableOids`/publication-proof；可读任意完整 OID/历史（`log` 无目标默认 HEAD、`--all` 拒绝）；verifier 等结构化读取限制只约束 `git_query`；Q1/Q2 客户可见权衡已由闸门记录覆盖。
3. **R8a–R8c**：建议级缺口；I0 关闭、B2 逐项记录处置（关闭/转后续/未处理），不得静默忽略。
4. **Q4**：采纳 `deny-non-readonly`（审批类放行但审计写失败 ⇒ 拒绝；只读 `c-allow` 不翻转）；若客户改选 observe，AC-28 按披露项处理、不判安全通过（须重开确认）。
5. **Q10**：无运行时回切开关；回切=回滚提交。
6. **审计不可用 ⇒ 受保护+shell 会话不可创建**（有意 fail-closed；探针含一次 refresh 重试后仍不可写即拒绝；错误回执可读性 O8 默认不做）。
7. **审批疲劳**：逐条审批可能诱导橡皮图章；缓解=只读 0 卡、例行白名单、judge 系统风险审查；不扩大代批。
8. **只读 Git 新面**：固定传输/精确 argv/固定 env/输出预算为缓解；仍属新增 shell 可执行面，以 AC-6/AC-16 攻击矩阵与真实运行覆盖。
9. **B0 为冻结脏基线**：HEAD `a1b2f66` 本身非绿色（上一变更的 checkpoint 既有失败/挂起若仍存在）；本变更不修既有失败；不得把 B0 既有失败写成「本变更失败」或「已清零」。
10. **发布/tag 未授权**；提交/推送/合并按委托，但不含发布。

### 6.3 独立验收输入清单

1. P1.2（`b13e2fe7…`）、复核记录（`817ebc9d…`）、B1 v1（`fb881126…`）与本团队计划版本 + 闸门留痕；
2. 新 B0 记录 + 证据目录（B0 hash 入变更包）；
3. 变更包（候选哈希、改动路径、节点、证据链接、T3、删除清单、披露）；
4. I0 接口评审记录（R8a–R8c、接线/迁移/勘误）与共享 API 评审记录 + 消费者影响清单；
5. 各批次测试原始输出、跨角色集成、T3 全量对照 diff、typecheck/渲染证据；
6. 真实运行原始证据（含预算/中止/失败如实记录）；
7. 删除清单与死代码扫描报告（仅本变更范围）；规则集版本迁移搜索与理由。

---

## 七、风险与依赖

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | T3 治理/权限语义变更被误实现（unknown 冒充 observed / 新证据被写门消费） | 按 P1.2 INV；`approvalChain` 只进创建准入；AC-11/12/17/18/26 负例；B2 判 |
| R2 | 审批疲劳/橡皮图章 | 只读 0 卡；例行白名单；judge 系统风险审查维持现状；不扩大代批 |
| R3 | 审计不可用导致受保护+shell 会话不可创建（fail-closed 副作用） | 设计有意为之；真实运行前审计门禁预检；O8 人话映射可选；披露 |
| R4 | 只读 Git 新面被 PATH/alias/外部程序/参数绕过 | 固定传输（绝对可执行/固定 12 项 `-c`/重建 env）；精确 argv 白名单；攻击矩阵 AC-16；别名内建优先测试；`--all` 拒绝 |
| R5 | 与 PR #72 契约冲突 | P1.2 §2.8/附录 B 与复核已核对无冲突；AC-19 回归；不改 `inspectToolSurface`/`applicationMediation`/派发父门 |
| R6 | 规则集版本升级导致外部 v3 pin fail-closed | I0 决策 + 全仓夹具同步 + 迁移记录；不静默放宽 |
| R7 | 工作树脏基线/并发占用（T1、shared-components 删除、未跟踪文件） | B0 全量记录并隔离；派发前核对占用；不属本变更的路径不碰 |
| R8 | W2 早于 W1 导致受保护会话全部被拒（不可达） | 强制串行 W1→W2；单写者；批次出口核对 |
| R9 | 跨角色 wiring 漂移（matcher 三份实现/规范体分叉） | 单一来源（门禁引擎）+ shell-rules 公共出口 + 差分测试；I0 定接线 |
| R10 | 真实运行环境（审计边界未接受/UI 卡不稳定） | 预检 + AC-25 回退确定性测试并如实披露；不追加预算 |
| R11 | 候选/B0 失效或证据复用 | 冻结脏基线逐条对照；候选 manifest；失效重取；不拼接不同候选 |
| R12 | 范围蔓延（顺手改角色卡/i18n/无关 Git 模板/blame 结构化模板） | 本计划非目标；O3/O6/O8 默认不做；越界即停止回报 |
| R13 | 共享 API 未经评审即被消费 | I0 冻结 + shared-code 评审记录 + 消费者影响清单；无记录不得合并（角色纪律） |
| R14 | 桌面测试目录逐文件授权被违反（新建文件） | 默认扩展现有清单文件；新建即触发条件 H1（§4.6） |

**依赖**：P1.2/复核/B1 版本稳定；B0 有效；I0 完成；工作树无同文件并发写；真实运行凭据/环境可用；B2 由同一独立验收身份判定。

---

## 八、需沟通处理事项

1. **闸门 2 留痕**：沟通在 `docs/communication/` 记录本团队计划（路径/行数/SHA-256）+ P1.2 + 复核记录 + B1 v1（预授权覆盖闸门 1/2 与实施授权）；未留痕前实施角色不得当作已确认对象。
2. **B1 状态澄清**：任务输入称 B1「正在写」，实测已完整写盘并自述冻结（185 行 / `fb881126…`）；请沟通按当前文件登记，若独立验收后续改版按 B1 §5 复判规则处理。
3. **设计文本勘误知会策划**：§4.7 E1–E4（`shell-write-guard` 路径、trunk Provider owner、共享 owner、`ShellAuditRecord` 落点）；不改设计方向，实施按实际路径。
4. **R8a–R8c 处置**：由 I0 接口评审关闭并在变更包/B2 记录；沟通无需客户卡（建议级、不改变安全目标）。
5. **Q 处置复核**：本计划按 P1.2 推荐执行 Q1/Q2/Q4/Q5/Q6/Q7/Q9/Q10/Q11–Q14；若客户对任一 Q（尤其 Q1 读取范围、Q4 审计策略、Q9 Git 写、Q10 回切）提出不同选择 → 停止并重开闸门/修订计划。
6. **B0 重记**：旧 B0 已随 HEAD 变化失效；新 B0 由测试执行、统筹登记（§5.2），沟通知悉。
7. **派发窗口**：派发前确认工作树占用（T1 三文件只读、`shared-components.md` 删除、197 未跟踪文件）无冲突；本计划未派发。
8. **条件 H1**：若实施出现 §4.6 条件项（新建 `test/桌面应用/` 文件或越界路径），停止并走人事 H1，不自行扩权。
9. **实施授权启动**：本计划写盘后，实施由沟通确认后启动（预授权范围内）；发布/tag 不在授权内。

---

## 九、计划状态与下一步

- **已写**：本团队计划（`docs/scheduling/2026-11-08_team-plan_session-admission-approval.md`）。
- **待办（按序）**：
  1. 沟通：在 `docs/communication/` 留痕本计划版本 + P1.2 + 复核 + B1 v1（预授权闸门覆盖记录）；
  2. 测试：写新 B0 记录 + 证据目录（HEAD `a1b2f66`；冻结脏基线方法，数据不沿用旧 B0）；统筹登记；
  3. 实施角色：完成 I0 接口评审（R8a–R8c/接线/迁移/勘误/加法形状冻结）；
  4. 按 W1 → W2 → W4、W3 并行、W5 的顺序实施；各批次同步测试；
  5. D1 → RR → E3-F → E3-B → E3-V（B2）→ E3-R（放行记录）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未联系客户。
- **约束复核**：本文件只写 `docs/scheduling/`；不实施、不派发、不判验收、不提交/推送/合并/发布。若客户改变方案默认项、角色结构、写集口径或 Q 处置，重开对应闸门并修订本计划。
