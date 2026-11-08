# 团队计划：删除全部预知式门控 + Git 写/仓库初始化改为「动作时授权」

- **任务 ID**：`2026-11-08-remove-predictive-gates`
- **产品 flowId（拟）**：`remove-predictive-gates`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立固定上下文）
- **日期**：2026-11-08
- **状态**：团队计划已写盘（闸门 2 对象）。闸门 1 已由沟通留痕（`docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`，27 行 / SHA-256 `d32f9b371a01d243869b719025fc63ba5c8d5527d6c62f425e5b537770ebcbea`）；闸门 2 与实施授权按客户预授权/全权委托视为已覆盖（`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`，38 行 / SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`；**发布/tag 除外**），正式留痕待沟通写 `docs/communication/`。**未派发、未实施、未改代码/测试/角色卡/边界/方案/验收文档、未提交/推送/合并/发布、未判验收。实施待在飞变更（会话准入）完成后由沟通放行。**
- **唯一实施基线（方案 P1.3）**：`docs/planning/2026-11-08_design_git-write-init-approval-based.md`（803 行 / SHA-256 `94f71fcbb0d4287fe7ed38c2b7b396d77a9bcdb6f8ff5984146c7495f82a1566`；写本计划前实测一致）。本计划不扩大、不改变方案口径；实施超出 P1.3 或本计划写集须停止并回报统筹。
- **独立复核**：`docs/planning/2026-11-08_review_git-write-init-approval-based.md`（178 行 / SHA-256 `a2468ed0951b28b39405ea71e94b415a8a2b5bf3ecb5f829c87e4d11f3119828`；完整复核 F1–F12、窄复核 R1–R10、短核对 S1–S5 已全部处置关闭；沟通极短只读核对确认 S1/S2 落地，见闸门 1 留痕）。
- **客户指令（闸门 0）**：`docs/communication/2026-11-08_intent_remove-predictive-gates.md`（33 行 / SHA-256 `603e7ef9b5f99259a7aa1bc04a8be7115bc0145a4889d1369dbc9cecb22f10a3`；客户原话「这个预知门控全部删掉」；替代原则：动作时授权 + 身份/权限 fail-closed + 不开放无审批自由 shell/Git 写）。
- **在飞变更（会话准入，只读）**：方案 P1.3 `docs/planning/2026-11-08_design_session-admission-approval-based.md`（855 行 / SHA-256 `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`）；团队计划 `docs/scheduling/2026-11-08_team-plan_session-admission-approval.md`（449 行 / SHA-256 `ce30fad6f0cb48d948007de97d553a1362836eb77dbcff67a10382388c1ad421`）；B1 v1 `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / SHA-256 `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`）；派发/状态 `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`（84 行 / SHA-256 `28a9d762a58cf6f25c57ad3641df5636d9ab5ffc48d0f8abca23ce967492a6a3`；W1/W3 完成、W2/W4 进行中）。**本变更显式取代其 `P1.3-B1-AC-26` 与 B1-EV3 中「`native-factory-plan-unavailable` 仅 codex」表述（Q16，按标签引用，不按行号）。**
- **已合并契约（只读）**：PR #72（P1.6 方案 `24150207…` / E0.3 `067e3d2e…` / 冻结记录 `5439d7c3…`）。本变更**不改**派发父门/应用中介证据契约；写/发布门继续**零引用** `applicationMediation`。
- **B0 口径**：客户已指示跳过 B0 正式重登记（`docs/communication/2026-11-08_waiver_baseline_session-admission.md`，18 行 / SHA-256 `d7a699d2819213cad60645fa0ffbce126fc1d5da290078f4dbcb6f6ab6b8e2fd`；客户原话「这种直接去变更把，基线搞他干啥呢」）。本变更**拟沿用同一口径**：回归参照 = 在飞变更 E3 的 T3 记录（其完成后成为最近参照）；若沟通认定豁免仅覆盖在飞变更，则本变更按届时 B1 的 B0 条目补登记。变更包/B2 必须披露。
- **参考基线（当前可用）**：`角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`（326 行 / SHA-256 `d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`；原 `76872622…`；4,872 tests / 4,641 pass / 198 fail / 1 cancelled / 32 skip；测得内容为 HEAD `a1b2f66`）。本变更 E3 的**首选参照**是在飞变更 E3 记录（其候选包含在飞改动）；当前记录仅作后备与交叉核对，差异逐条披露。
- **风险档位**：**T3**（P1.3 §4.3：治理/权限/审批/审计语义变更；删除受保护项目 Git 写门的进程级闭包；跨运行时核心/编排/trunk/Codex 适配器/桌面共享契约；不得压档）。
- **记录性质**：本文件是统筹团队计划，不是 `task_ops` 机器状态（本检出无 `.ans/project.json`）。不伪造任务令牌、锁、审批或机器预检记录；证据以文件哈希、原始命令输出与独立验收结论为准。
- **基线（写本计划时实测）**：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`。工作树含**在飞变更未提交改动**（W1/W3 完成、W2/W4 进行：`src/service/runtime/session.ts`、`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/common/编排/{shell-gate,shell-audit}.ts`、`src/pipeline/orchestration/{run-role,shell-arming}.ts`、`src/provider/trunk/{impl/git-command,public/trunk-store}.ts`、`app/desktop/operator-channel.ts`、`src/common/门禁引擎/*`、`src/service/gate/shell-rules.ts`、`app/renderer/*` 及对应测试等）与 **T1 三文件**（修改 `src/common/claude-adapter/schema.ts`、修改 `test/claude-adapter/session.test.ts`、未跟踪 `test/claude-adapter/schema.test.ts`；只读、不属本变更写集/候选）；`角色卡/项目管理/docs/architecture/shared-components.md` 未暂存删除为上一变更迁移动作（非本变更写集）；未跟踪文件若干（管理文档/证据/临时文件）。**上述均只读引用，不在本计划写集。**

---

## 一、任务与基线

### 1.1 目标（按 P1.3，不扩大）

1. **删除全部预知式门控的放行前提语义（G1）**：`hasUnconfinedScriptTools`、native factory plan 作为创建前提、`inspectInitializationProtection` 注册表级要求、`native-plan-*`/`native-tool-*`/`process-coverage-*` 类拒绝原因、Codex strict native plan 作为门控 —— 删除或降级为可选证据；证据仍如实产生。
2. **Git 写/初始化改为动作时授权（G2）**：真实角色/任务/回合/项目身份 + 角色 ACL/写集 + `checkGitPolicy` 纯策略 + 根身份 + host mutation lease + 两阶段 revision/rootsDigest 复检 + append-only 审计；任何身份/权限/审计不可证明 ⇒ fail-closed。
3. **三运行时同一动作门（G3）**：Claude/Pi/Codex 均可在受保护项目中完成角色 ACL 内 Git 写/初始化/发布并留审计；Codex native 强证明有则记录、无则不阻断。
4. **run-stop/controller-stop 运行时中立（G4）**：drain 谓词（providerFinished + 无 active tool + tracked process exited）；deferred run-stop 宿主继续（`host-continuation`）；Claude/Pi native 进程树不可观测按客户决定接受并披露。
5. **复用既有审批/审计接线（G5）**：`shell-approval-binding`/`shell-gate`/`shell-audit` 由在飞变更提供，本变更只读消费；不建第二套审批链/DSL。
6. **不改治理契约（G6）**：不改写权/角色边界/客户主权/验收权；不改 PR #72 派发父门/应用中介证据；不开放无审批自由 shell/Git 写。

可核对验收标准见 P1.3 §5（AC-1–AC-24、`P1.2-AC-25`–`P1.2-AC-31`，含负向 `P1.2-AC-28`）；正式 B1/B2 由内置独立验收编写与判定。

### 1.2 风险档位与验证口径：T3

- 依据 P1.3 §4.3 与 `docs/acceptance/2026-10-22_acceptance-risk-tier-criteria.md` §4.3.3（治理/权限/审批语义变更 + 删除进程级写门闭包 + 跨角色共享契约）。
- **T3 验证口径**：受影响套件（各角色模块）实施前后对照 + 跨角色集成 + **全量 T3**（按参考记录同口径，逐文件自然退出/挂起登记，`node --test --test-concurrency=1`）+ `npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`，预计 N/A 需给依据）+ **一次真实 Claude 最小运行**（P1.3 §6.2）+ 原始证据。升档不降档；证据不足按 `insufficient evidence` 记录。
- **B0 口径**：客户指示跳过正式 B0（见头部）；保留轻量证据（每批次对受影响套件做实施前后对照）；最终 E3 与参照记录按（文件 + 测试名 [+ 类别]）逐条对照；**新增确定性失败 = 0、新增 skip = 0**；环境性差异逐条说明。

### 1.3 本轮非目标（不得顺手扩大）

- 不开放无审批自由 shell/Git 写；不删除/降低身份、授权、ACL、写集、审批、审计、客户主权/验收语义；不把 `unknown` 当 `observed`。
- 不把 Git 写改成 shell 审批卡或自由命令（Q12）；结构化 Git 仍只走角色能力。
- 不改 PR #72 派发父门/应用中介证据契约（Q11/Q15；写门继续零引用 `applicationMediation`）。
- 不放松 `custom-override`/`demo` factory 的受保护拒绝（Q14）；不重写 Codex chat 对 MCP/服务端 WebSearch 的真实限制（Q2）。
- 不改 stable-write、写权边界、D3、版本决策、发布/tag；不建 DSL/工作流引擎；不新增角色。
- 不修在飞变更写集与 T1 三文件；不清理与本变更无关的未跟踪文件（按统筹记录隔离）。
- 不提交/推送/合并/发布（提交/推送/合并按委托，**发布/tag 未授权**）。

### 1.4 统筹能力边界

- 本上下文不实施、不派发开发（派发待沟通在在飞变更完成后放行）、不判独立验收、不写角色卡/边界/方案/产品代码/测试/验收文档；只写 `docs/scheduling/`。

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-08） | `docs/communication/2026-11-08_intent_remove-predictive-gates.md`（`603e7ef9…`） |
| 闸门 1：方案确认 | **已留痕**（P1.3 为确认对象，预授权覆盖） | `docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`（`d32f9b37…`） |
| 闸门 2：角色指派/写集/边界 | **预授权视为已覆盖**（对象：本计划）；正式记录待沟通留痕 | `2026-11-07_preauthorization_proceed-without-gates.md` §解读 3 |
| 客户实施授权 | **预授权视为已给出**；**实施启动前置于在飞变更完成 + 沟通放行**；发布除外 | 同上 + 「全权委托」节 |
| 实施前验收标准（B1） | **待写**（内置独立验收；闸门 1 后可写） | 拟 `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md` |
| 提交/推送/PR/合并 | 本变更范围内按「全权委托」；**本计划与实施前阶段不执行** | 同上 |
| 发布/tag | **未授权** | 同上 |

### 2.1 预授权不是免记录

- 按预授权条件：方案与团队计划的版本/哈希、复核记录、B1、角色卡清单须在沟通记录留痕。**沟通须在本计划写盘后，把本计划（路径/行数/SHA-256）、P1.3、复核记录与 B1（冻结后）写入 `docs/communication/` 闸门记录**；未留痕前实施角色不得把本计划当作已确认对象。
- 实质变化（范围、角色结构、治理语义、风险档位、Q 处置）或无法解决的障碍 → 停止并回报客户，不伪造成功。

### 2.2 已确认决定与 Q 处置（P1.3 推荐，预授权覆盖，不重开）

| Q | 本计划执行口径 |
| --- | --- |
| Q1 | **删除**注册表级 Git 写门；接受披露的残余风险——(a) 审批放行的不透明脚本可写 `.git`；(b) 其它 active 会话 foreign MCP/未知工具可在 lease 外写 `.git`；控制=逐操作审批/审计/执行后审计 + 结构化 Git 冲突检测；foreign MCP/未知工具只进 optionalEvidence，不宣称已阻断 |
| Q2 | Codex strict native plan **降为可选证据**；chat 传输 MCP/服务端 WebSearch 真实不支持保留（构造期报错） |
| Q3 / F7 | run-stop/controller-stop 改运行时中立 **drain 谓词**；Claude/Pi native 进程树不可观测接受并披露；`stopAndInspect` 活动排空循环 drain 即返回（若实施保留轮询，须披露每成员最多 5s 与 timeout facts 接受方式） |
| Q4 | 删除 closedTools/未知工具门；O1 不做 |
| Q5 | 保留 disposed 条目 tracked-process drain（不要求 `processCoverage`/native） |
| Q6 | 审计载体为 **append-only sidecar** `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`（write-ahead、失败⇒拒绝）；不写 journal 字段 |
| Q7 | **串行**：本变更全部实施排在在飞变更 E3 完成之后（§4.6）；5（潜在 6）重叠文件不得并行编辑 |
| Q8 | `RunChangeHostPlan`/`ControllerStopHostPlan.handles.nativeInstanceId` **可选**；码保留、语义收窄；不新增 `identityKind` |
| Q9 | `official-pure-preparation-unproven` **退役**；`construction.status` 按真实边界（factoryEntered/nativeBindEntered/pending/revoked）；`trustedPurePreparation` 仅作可选证据字段 |
| Q10 | 身份/历史类检查**保留**（desktop controller 在 Core 注册表、source parent 在 Core 历史、`unknownFactoryAttempts`）；文案去预知措辞 |
| Q11 / PR #72 | 写门/optionalEvidence **不读** `applicationMediation`；strict `toolSurface`/`applicationMediation` 语义不变 |
| Q12 | 结构化 Git **不加**客户审批卡（角色 ACL/任务绑定授权更强）；不把 Git 写纳入 shell 审批 |
| Q13 | 真实运行只做 **真实 Claude 最小验证**；Codex/Pi 由确定性集成/桩件覆盖 |
| Q14 | custom/demo 受保护拒绝（`protected-scope-default-native-plan-required`）**保留** |
| Q15 | 改名为 `inspectGitActionAuthorization`（注释保留溯源）；测试符号同步；O2 旧名别名默认不做 |
| Q16 | 本变更 B1 **取代**在飞 B1 v1 的 `P1.3-B1-AC-26` 与 B1-EV3 中「`native-factory-plan-unavailable` 仅 codex」表述（按标签引用）；本变更新增 AC 统一用 `P1.2-AC-25`…`P1.2-AC-31`（含负向 `P1.2-AC-28`） |
| Q17 | sidecar/诊断保留期限沿用既有 `.ans/trunk/operations` 与桌面日志策略；不新增清理器 |
| Q18 | **不新增回切开关**；回切=回滚提交；既有 `ANS_SHELL_ESCALATION_DISABLED` 等不变 |

**选装项**：O1/O3/O4/O6/O7/O9/O10 不做；O2/O5/O8 默认不做；若 I0 采纳任一，须在接口评审记录并确认不扩大写集、不改变安全语义。

### 2.3 版本纪律

- P1.3（`94f71fcb…`）是唯一实施与验收基线；实施按符号名与文本锚点施工（行号对应 HEAD `a1b2f66` 快照，不作契约）。
- B1 冻结后不随候选调整；确需变更递增版本并记录理由，受影响证据重判。
- 实施中发现需要改变方案口径（门禁语义、证据路径、写集归属、阶段顺序、Q 处置）→ 停止并回报统筹，按流程重开对应闸门；不得自行变更。

---

## 三、五维判断与决策

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **保留现有角色，无拆分/合并/新增**：变更按既有模块所有权落到 3 个实施角色（编排、运行时核心、桌面窗口）+ 测试 + 内置独立验收；Codex 适配器为**条件参与**（默认零写入，仅 D1/D2/D6）。无独立变化原因需要新角色；sidecar 为编排私有实现（不新建共享件）；drain 为 `src/model/runtime.ts` 纯函数（运行时核心单写、跨角色只读消费，与 PR #72 `RuntimeSessionToolSurfaceFacts` 同一模式） | P1.3 §4.1；各角色 `boundary.md` §1 实测（§4.7） |
| 2. 范围归属 | **全部写目标均在现有 Section 1 内，H1 delta = 0（默认口径）**；不存在无 owner 路径。补充条件写集（`git-capabilities.ts`/`git-trunk-store.ts`/`public/trunk-store.ts`）也都在编排既有私有目录内 | 本计划 §4.2–§4.7 |
| 3. 契约影响 | **有**：gate 输入/输出形状（`inspectGitActionAuthorization`）、`RunChangeHostPlan`/`ControllerStopHostPlan` `handles.nativeInstanceId` 可选化（Q8）、sidecar `authorization.jsonl` v1 schema、`isRuntimeSessionDrained` 纯函数导出、错误码新增（`git-action-audit-unavailable`/`git-core-in-flight-unproven`/`git-core-inspection-unavailable`）/退役/收窄。**契约先行**：I0 冻结形状与锚点，再实现消费方；PR #72/E0 契约不改 | P1.3 §3.3/§3.4.3/§3.8/§4.1 |
| 4. 证据独立性 | **满足**：各实施角色只跑自己模块测试；跨角色集成、D1、全量 T3、真实运行由测试角色执行；B1/B2 由内置独立验收按 B1 判定；统筹不改验收结论 | P1.3 §6；B1 要求 |
| 5. 协调成本 | **高但可控**：8 类参与方；最大串行点（Q7）= 本变更整体排在在飞变更 E3 之后；本变内部 W1→W2→W3b、W3a 可与 W1 并行；编排写集最大但单一 owner；写集两两不相交、无同文件多写者；5（潜在 6）个与在飞重叠文件全部串行 | 本计划 §3.5/§4.6 |

### 3.2 逐角色判断（保留/调整/拆分/新增/合并）

| 角色 | 判断 | 五维要点与范围 |
| --- | --- | --- |
| 运行时核心 | **保留（职责增补，不拆分）** | drain 纯函数单源；`session.ts` 收尾（A1/A2/A5/A9、C9、F5/R9）；`test/runtime-core/` |
| 编排 | **保留（职责增补，不拆分）** | 授权门替换/停稳/host-continuation（`trunk-runtime.ts`）、失败准入 drain（`run-role.ts`）、run-stop commit 与 sidecar 写前锚点（`apply-journal.ts`）、sidecar append/read（`git-command.ts`）+ 条件锚点文件；`test/编排/` |
| Codex 适配器 | **调整（默认不参与；条件参与）** | 仅当 I0 确认需适配器侧证据/限制同步时参与，范围限 **D1/D2/D6**；`plan.native` 投影/`ensureAdapter` 回落归运行时核心（R9） |
| 桌面窗口 | **保留（职责增补）** | `app/desktop/session.ts` C8 run-stop drain + native optional；仅**既有** `test/桌面应用/` 清单文件 |
| 测试 | **保留** | `test/测试/` 跨角色集成；D1/E3/RR 执行与原始证据；`角色卡/测试/docs/change/` |
| 内置独立验收 | **保留** | B1 撰写、B2 判定；`docs/acceptance/`；不承担维护职责 |
| 统筹 | **保留** | 本计划、派发/状态、I0 汇总、变更包、放行记录；不判验收 |
| 沟通 | **保留** | 闸门/授权留痕、Q16 取代关系记录、启动 B2；`docs/communication/` |
| 门禁引擎 | **不参与** | 本变更不写 `classify-shell`/`shell-write-guard`/`shell-rules`（在飞变更写集，本变更只读引用既有契约） |
| shared-code | **不参与** | 无共享件新增/变更；`shell-approval-binding` 由在飞 W1 提供，本变更只读消费 |
| 桌面UI | **不参与** | 无卡面/渲染变化；不新增客户卡 |
| 装配 | **不参与** | 预期无 `package.json`/入口/构建/依赖变化；若确需构建面变化 → 停止并回报 |
| 项目管理 / 产品 / 宣传 / UIUX设计师 / 招募 / gates-code 等六角色代码 / Claude适配器 / Pi适配器 | **不参与** | 与本变更写集无关 |
| 项目 `角色卡/独立验收` worker | **不启用** | 避免双重验收；B1/B2 由内置独立验收（技能内置管理角色）执行 |

### 3.3 决策表结果

**不变（现有角色结构）+ 保留全部参与角色 + 编排/运行时核心/桌面窗口职责增补 + Codex 适配器条件参与（默认零写入）+ 无拆分/合并/新增 + H1 delta = 0 + I0 接口评审 + 与在飞变更串行（5 文件，潜在第 6）。** 无角色 id/显示名变更；不新增客户卡；接口评审为内部流程（记录写入提议角色 `docs/change/`，跨角色排期由统筹记 `docs/scheduling/`）。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 由既有角色按现有边界实施，sidecar 归编排私有、drain 归运行时核心 model | **采用** | 单一 owner、写集零重叠；与既有分层（trunk Provider/Service 私有目录、model 纯函数）一致 |
| B. 新设「授权门/审计」专项角色 | 否决 | 变更只替换既有模块内语义，无独立变化原因；新增角色违反「不新增角色」非目标；写集均在既有 Section 1 |
| C. sidecar 放进 `src/common/shared/` 共享件 | 否决 | sidecar 是编排私有协议（apply-journal/trunk-runtime/git-command 消费），跨角色无消费者；共享 API 评审/消费者影响成本高；无收益 |
| D. 与在飞变更并行实施 | 否决 | 5（潜在 6）文件写集重叠、语义叠加（准入 vs 动作门）；Q7 定串行 |
| E. 按「动作面」跨角色分片（同一文件多角色） | 否决 | 会产生同文件多写者；本计划采用「按模块 + 动作面」混合分批（§5.4），但同一文件恒为单一 writer |
| F. 在飞变更未合并前另开工作树并行 | 不采用为默认 | 候选清单/参照基线会分裂；若沟通要求在飞未提交前开工，必须独立 worktree + 独立候选 + 重开计划修订，不自行执行 |
| G. 保留 `inspectInitializationProtection` 旧名 | 否决（Q15） | 名称与语义不符；O2 别名默认不做 |
| H. `RuntimeSessionLifecycleFacts.drained?` 派生字段（O5） | 默认否决 | 纯函数先行，减少跨适配器契约变化；如 I0 采纳须记录 |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：I0 冻结 gate I/O、sidecar 安全/预算/锚点、drain 原因白名单、`expectedTool` 必填、finalize 顺序、H14 身份核对、Q8 plan 形状。
- **单一 owner**：`session.ts`/`model/runtime.ts` 只由运行时核心写；`trunk-runtime.ts`/`run-role.ts`/`apply-journal.ts`/`git-command.ts`/`git-trunk-store.ts`/`git-capabilities.ts`/`public/trunk-store.ts` 只由编排写；`app/desktop/` 只由桌面窗口写；`src/provider/codex/session.ts` 只由 Codex 适配器写（条件）。
- **串行点**：在飞变更 E3（完成并可提交/合入）→ W1/W3a → W2（依赖 W1）→ W3b（依赖 W2+W3a）→ W4（依赖 W1+W2）→ W5 → D1 → RR → E3-F → E3-B → B2。
- **差分而非双轨**：无运行时新旧并存（Q18）；删除与替换同批落地；E3 做删除清单与死代码扫描（限定本变更删除项）。

---

## 四、参与角色、写集与边界核对

### 4.1 口径与命名

- **命名澄清**：本计划中的「P1.3」指本变更方案 `docs/planning/2026-11-08_design_git-write-init-approval-based.md`；在飞变更方案同为 P1.3（`docs/planning/2026-11-08_design_session-admission-approval-based.md`），以文件名区分；`P1.3-B1-AC-26` 特指在飞变更 B1 v1 的 AC-26。
- 角色均为仓库既有 ANS worker（`角色卡/<roleId>/`）；`roleId` 以目录名为准。
- 本表按**实际 Section 1**（`角色卡/*/boundary.md`，`boundary.yaml` 为同步副本）分配；P1.3 §4.1 的角色/路径标签与实测不一致处以本节为准（§4.8 列明）。
- 允许新增文件规则：目录授权内可新增内部文件（`test/编排/`、`test/runtime-core/`、`test/测试/`、`test/codex-adapter/`、`src/provider/trunk/`、`src/service/trunk/`）；**`test/桌面应用/` 为逐文件授权，不得新建文件**（除非先经 H1，见 §4.7）。

### 4.2 写集映射（方案改动项 → 唯一 owner + 精确写集）

| # | 方案改动（P1.3 §4.1/§3.2–§3.7） | 唯一 owner | 精确写集 | 依赖/备注 |
| --- | --- | --- | --- | --- |
| 1 | `isRuntimeSessionDrained` 纯函数（§3.7；含 `DRAIN_EVIDENCE_ONLY_REASONS`/`DRAIN_NATIVE_EVIDENCE_REASONS` 显式白名单，未列默认阻断） | 运行时核心 | `src/model/runtime.ts` | 单一来源；O5 默认不做 |
| 2 | A1/A2/A5/A9 残留、`official-pure-preparation-unproven` 退役、`construction.status` 真实边界；C9 `stopAndInspect`（disposed 分支 + 活动排空循环 drain 即返回）；F5/R9 `plan.native` 可选投影/`ensureAdapter` 无 adapter 回落/`bindRole` 条件核对 | 运行时核心 | `src/service/runtime/session.ts` | **与在飞 W2-R 重叠（串行，§4.6）** |
| 3 | B8/B9/B10 删除 + H13/H14 运行时中立闭包；`inspectInitializationProtection`→`inspectGitActionAuthorization`（F1：gate 只做身份/根/闭包）；输入 `expectedActor`/`expectedTool`（active-tool 必填，S5）/`authorizationMode`/`hostContinuation`；输出 `actor`/`controls`/`optionalEvidence`（B14） | 编排 | `src/pipeline/orchestration/trunk-runtime.ts` | 与在飞无重叠 |
| 4 | C1–C4 run-stop/controller-stop 运行时中立；F2/R1 host-continuation（active 或 disposed+drain、匹配 requesterTurnId/taskId/roleId/project、不要求 activeTools）；Q8 `RunChangeHostPlan`/`ControllerStopHostPlan` `nativeInstanceId` 可选 | 编排 | 同 `trunk-runtime.ts` | 与 #3 同批 |
| 5 | A10/C7 失败准入 drain（与 A10 同一谓词）；A9 残留；F11 实施前逐项复核在飞实际合并状态（符号/锚点，不以「已执行」假定） | 编排 | `src/pipeline/orchestration/run-role.ts` | **与在飞 W1b/W2b/W3b 重叠** |
| 6 | C5 run-stop commit 去 native/`processCoverage` 前提、改 drain（保留 host fence/ledger；`:1487` direct-stop 治理拒绝不变） | 编排 | `src/service/trunk/impl/apply-journal.ts` | 与在飞无重叠 |
| 7 | 业务发布 `commitPreparedDirect/TeamPlan/Activation/InitialWorkflow` **store 写入前** sidecar authorization（失败⇒不提交，R3） | 编排 | 同 `apply-journal.ts` | 与 #6 同文件同批 |
| 8 | sidecar `authorization.jsonl` append/读取（路径安全/符号链接/nlink/单次写入/行长/文件/尝试预算/JSONL 容错；F3/R3/S5）；不改 `GitRefJournal`/`GitInitializationRecord` 与 replay/settlement 身份 | 编排 | `src/provider/trunk/impl/git-command.ts` | **与在飞 #8（executeReadonlyGit）重叠** |
| 9 | sidecar 写前锚点：publish `safeWrite`/`update-ref` 前；candidate journal/对象/ref 前（I0 冻结锚点位置；默认列入条件写集） | 编排 | `src/provider/trunk/impl/git-trunk-store.ts`、`src/service/trunk/impl/git-capabilities.ts` | 条件写集（I0）；均在编排 Section 1 私有目录 |
| 10 | sidecar 公共出口：若 `apply-journal`/`trunk-runtime` 按现有 import 纪律经 `public/trunk-store.ts` 消费（很可能） | 编排 | `src/provider/trunk/public/trunk-store.ts` | **潜在第 6 个与在飞重叠文件**；I0 冻结 |
| 11 | D1/D2/D6：`native-plan-*` 证据保留、chat MCP/WebSearch 真实限制保留；`plan.native` 投影/`ensureAdapter` 归运行时核心（R9） | Codex 适配器（条件） | `src/provider/codex/session.ts`（**默认零写入**） | 仅当 I0 确认需适配器侧同步；不改变证据语义 |
| 12 | C8 桌面 run-stop drain（`:1477-1486`）、`ownedRunStopMembers` native optional（`:1462-1466`）；Git 能力注入不变 | 桌面窗口 | `app/desktop/session.ts` | **与在飞 W5-D 重叠**；不新增审批卡 |
| 13 | 测试同步/新增（§4.3） | 各 owner / 测试 | 见 §4.3 | — |
| 14 | B1/B2 | 内置独立验收 | `docs/acceptance/` | 同一独立验收身份 |
| 15 | 团队计划、派发/状态、I0 汇总、变更包、放行记录 | 统筹 | `docs/scheduling/` | — |
| 16 | 闸门/授权/取代关系留痕 | 沟通 | `docs/communication/` | — |

### 4.3 测试写集映射（方案 §4.5/§6.1）

| 测试 | 唯一 owner | 说明 |
| --- | --- | --- |
| `test/runtime-core/git-capability-tools.test.ts`（R14 `:577-601`；`:509`/`:775-782`/`:1002-1007,1025`） | 运行时核心 | R14 在在飞变更改写为 `protected-scope-approval-chain-unproven` 之后，本变更**两阶段再改写**（Codex native plan 可选、审批链成立即可绑定）；控制面证据拒绝（A11）与 custom/demo 拒绝（A4）保留 |
| `test/runtime-core/session-lifecycle.test.ts` + 新增 `test/runtime-core/` | 运行时核心 | drain 真值表（F6/R7/S1：显式白名单外一律阻断，含 `native:pi-sdk-idle-not-observed` 非 idle 形态、handler-running/not-terminal/mcp-process-coverage、native read failure、`real-provider-settled-not-observed`、cleanup failures、custom disposal、未知 reason；idle Pi 仍 drained）；Claude/Pi 形态；F7 drain 即返回；F5 Codex native 不可用创建/动作（P1.2-AC-27） |
| `test/runtime-core/application-mediation.test.ts` | 运行时核心 | PR #72 回归；不改（除 reason 集合变化） |
| `test/编排/trunk-dispatch-parent.test.ts`（`:388-395`） | 编排 | 源码断言改写（新 gate 条件、仍零引用 `applicationMediation`） |
| `test/编排/rapporteur-module-consumption.test.ts`（`:389-451`）、`test/编排/stable-write-runtime.test.ts`（`:300,316`） | 编排 | direct-stop 拒绝断言保留；新增 `commitPrepared*`/drain 行为；`git-old-core-programs-unproven` 语义收窄用例 |
| `test/编排/git-command.test.ts`、`test/编排/git-trunk-store.test.ts`、`test/编排/git-capabilities.test.ts` + 新增 `test/编排/` | 编排 | sidecar：同 operationId 新 lease/turn 重试不触发 replay/settlement 冲突；旧 journal 无 sidecar 兼容；init/文档/计划/激活/initial workflow `policyInputDigests` 多键；路径/JSONL/预算/坏行；append 失败⇒`git-action-audit-unavailable`；pending-recovery；F2 宿主继续正/负例；F4/R10 闭包；F8 optionalEvidence（不宣称阻断） |
| `test/测试/runtime-dispatch-gate-integration.test.ts`（`:409-416`） | 测试 | N15 写门源码断言改写（新 gate 条件、仍零引用 applicationMediation） |
| `test/测试/git-role-workflows-e2e.test.ts`（`:382-386,1262-1265`） | 测试 | 评估更新（测试模型若代表旧契约，改按 ACL/任务调用；native 仅证据；不属产品代码） |
| 新增 `test/测试/` | 测试 | 跨角色集成：Claude/Pi/Codex 三路径创建→结构化 Git 动作→sidecar；run-stop/controller-stop（Claude/Pi 成员 + Codex native 可选）；F2 集成；PR #72 回归 |
| `test/桌面应用/chief-workflow.test.ts`（`:2146`；同文件 `:2187-2188` Codex 停止成功断言按新语义评估） | 桌面窗口 | 保留 `controller-stop-target-instance-unproven`（Core 身份）并补 Claude/Pi 正向；**仅既有文件，不新建** |
| `test/codex-adapter/application-surface.test.ts`（`:141-153`） | Codex 适配器（条件） | 不改（除 reason 集合变化） |
| `test/gates/*`、`test/门禁引擎/*` | 不参与 | PR #72/在飞变更契约；本变更不改 |

> 说明：删除/改写断言属于**契约变更**，逐条在实施证据与验收记录中列明；不得以「放宽断言」方式静默通过（意图记录 ② 第 3 条）。

### 4.4 文档与证据写集

| 产物 | owner | 路径 |
| --- | --- | --- |
| 本计划、派发/状态、I0 汇总、变更包、放行记录 | 统筹 | `docs/scheduling/` |
| B1/B2 | 内置独立验收 | `docs/acceptance/` |
| 闸门/授权/取代关系留痕 | 沟通 | `docs/communication/` |
| 各角色实现/测试证据（命令/输出/哈希） | 各实施角色 | `角色卡/<roleId>/docs/change/` |
| D1/E3/RR 证据、证据目录与索引 | 测试 | `角色卡/测试/docs/change/` |
| 设计文本同步（勘误） | 策划（经沟通知会） | `docs/planning/`（本计划不写） |

### 4.5 本变内部无重叠核对（写集两两不相交）

| 写集根 | 唯一 owner | 与其它角色交集 |
| --- | --- | --- |
| `src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/` | 运行时核心 | 无 |
| `src/pipeline/orchestration/trunk-runtime.ts`、`run-role.ts`、`src/service/trunk/impl/{apply-journal,git-capabilities}.ts`、`src/provider/trunk/impl/{git-command,git-trunk-store}.ts`、`src/provider/trunk/public/trunk-store.ts`、`test/编排/` | 编排 | 无（`src/service/trunk/`、`src/provider/trunk/` 为编排私有目录；`trunk-runtime`/`run-role` 为编排单文件） |
| `app/desktop/session.ts`、`test/桌面应用/chief-workflow.test.ts`（既有） | 桌面窗口 | 无 |
| `src/provider/codex/session.ts`（条件）、`test/codex-adapter/`（条件） | Codex 适配器 | 无 |
| `test/测试/` | 测试 | 无 |
| `docs/acceptance/` | 内置独立验收 | 无 |
| `docs/scheduling/` | 统筹 | 无 |
| `docs/communication/` | 沟通 | 无 |

结论：**写集两两不相交、无同文件多写者**；跨角色只读消费（`model/runtime.ts`、`trunk-runtime.ts` 导出、`public/trunk-store.ts`、`shell-approval-binding`）均为单一 writer 模式。

### 4.6 与在飞变更的重叠文件与串行安排（Q7）

P1.3 F10 列明 **5** 个重叠文件；本计划核对后另标出 **1 个潜在第 6 文件**（sidecar 公共出口）。

| 文件 | 本变更用途（批次） | 在飞变更用途（状态） | 串行规则 |
| --- | --- | --- | --- |
| `src/service/runtime/session.ts` | W1（A1/A2/A5/A9、C9、F5） | W2-R（进行中） | 本变更 W1 开工前在飞 E3 已完成；以在飞最终内容为基线重核；不并行编辑 |
| `src/model/runtime.ts` | W1（drain 纯函数） | W2-R（进行中，`approvalChain` 等） | 同上 |
| `src/pipeline/orchestration/run-role.ts` | W2（A10/C7、A9 残留） | 编排 W1b/W2b/W3b（待） | 同上 |
| `src/provider/trunk/impl/git-command.ts` | W3a/W3b（sidecar） | 编排 #8 `executeReadonlyGit`（待） | 同上 |
| `app/desktop/session.ts` | W4（C8） | W5-D（待） | 同上 |
| `src/provider/trunk/public/trunk-store.ts`（**潜在第 6**） | W3a/W3b（sidecar 公共导出，若 I0 需要） | 编排 #8（导出 executeReadonlyGit，待） | I0 冻结是否需要；若需要同上述规则 |
| `test/runtime-core/git-capability-tools.test.ts`（测试重叠） | W1（R14 两阶段改写） | W2-R（R14 改写为 `protected-scope-approval-chain-unproven`） | 本变更改写基于在飞最终版本；不合并两阶段断言 |

**串行规则（强制）**：
1. 本变更**全部实施批次**（W1–W6）在在飞变更 **E3 完成**之后开工；推荐在其候选按委托提交/合入、取得干净基线后开工（Q7）。
2. 开工前重核 HEAD/tree/工作树/T1/依赖/夹具；若在飞 B2 尚未完成而工作树仍以其候选为准，**不得**在本工作树并行编辑（候选会互相污染）；沟通如选择提前开工，必须独立 worktree + 独立候选清单，属计划修订事项，不自行执行。
3. 同一文件同一时间只有一个写入者；跨角色只读消费不构成写集交集。

### 4.7 Section 1 覆盖图与 H1 边界 delta

> 依据各角色权威 `boundary.md`（`boundary.yaml` 为同步副本）。未列路径默认只读。

| 本变更写入点 | 覆盖的 Section 1 条目 | owner | 需 H1？ |
| --- | --- | --- | --- |
| `src/pipeline/orchestration/trunk-runtime.ts`、`run-role.ts` | 单文件（各自） | 编排 | 否 |
| `src/service/trunk/impl/apply-journal.ts`、`git-capabilities.ts` | 目录（私有）`src/service/trunk/` | 编排 | 否 |
| `src/provider/trunk/impl/git-command.ts`、`git-trunk-store.ts`、`src/provider/trunk/public/trunk-store.ts` | 目录（私有）`src/provider/trunk/` | 编排 | 否 |
| `src/model/runtime.ts`、`src/service/runtime/session.ts` | 单文件（各自） | 运行时核心 | 否 |
| `src/provider/codex/session.ts`（条件） | 单文件 | Codex 适配器 | 否 |
| `app/desktop/session.ts` | 目录 `app/desktop/` | 桌面窗口 | 否 |
| `test/编排/`、`test/runtime-core/`、`test/测试/`、`test/codex-adapter/`（新增文件） | 目录（测试） | 各 owner | 否 |
| `test/桌面应用/chief-workflow.test.ts`（仅既有文件） | 单文件 | 桌面窗口 | 否 |
| `docs/acceptance/`、`docs/scheduling/`、`docs/communication/` | 管理记录（内置独立验收/统筹/沟通） | 各管理角色 | 否（非产品写集） |

**结论：H1 delta = 0（默认口径）。** 条件项（出现即停止并回报，由人事 H1 / ANS Governance 更新 Section 1 后方可写）：
1. 在 `test/桌面应用/` **新建**测试文件（该目录为逐文件授权）；
2. 任何落在 §4.2/§4.3 之外的路径（新目录、模块根、跨角色目录写）；
3. 若 I0 把 sidecar 实现移到新共享件/新目录（改变写集归属，需修订本计划）。

### 4.8 设计文本勘误与 I0 议程事项（文本同步项，不改变方向）

| # | 事项 | 处置口径 |
| --- | --- | --- |
| E-a | P1.3 §4.1 写集表未逐行列出 `git-trunk-store.ts`/`git-capabilities.ts`，但 §3.4.3 以它们为 sidecar 写前锚点；`public/trunk-store.ts` 可能需公共导出 | **本计划按 §3.4.3 的实际锚点纳入写集**（条件项，I0 冻结锚点位置与是否需要公共出口）；均在编排 Section 1 内，无 H1 |
| E-b | P1.3 §4.1 Codex 行引用 D1/D6；D6（`trustedPurePreparation` 赋值）实际在运行时核心 `session.ts`（R9 已定） | 实施按 R9：`plan.native` 投影/`ensureAdapter` 回落/`bindRole` 条件核对归运行时核心；Codex 行只留 D1/D2/D6 事实/真实限制 |
| E-c | P1.3 §4.5 新增测试路径写「`test/Provider/trunk`（或等价）」 | 实际归 `test/编排/`（`git-command.test.ts`/`git-trunk-store.test.ts`/`git-capabilities.test.ts` 或新增文件；目录授权内） |
| E-d | sidecar 预算「单行 ≤4 KiB × 最多 16 次 = 文件 ≤64 KiB」需自洽组合（S5） | I0 冻结精确组合（行/文件/尝试数）并补测试 |
| E-e | Q16 取代关系按标签引用（`P1.3-B1-AC-26` / B1-EV3），不按行号 | 见 §8；由沟通在两端记录；策划文本同步非阻塞 |

> 以上为标签/路径/预算精度问题，不改变设计方向、客户可见范围或写集唯一性；由沟通知会策划做文本同步；实施按实际路径与 I0 冻结结果。

---

## 五、阶段计划

### 5.1 节点总表

| 节点 | 阶段 | 角色 | 可观察交付 | 前置 |
| --- | --- | --- | --- | --- |
| G2 | 闸门/授权留痕 | 沟通 | 本计划 + P1.3 + 复核（+ B1 冻结后）的闸门记录；实施授权记录 | 本计划写盘 |
| B1 | 实施前验收标准 | 内置独立验收 | B1 v1（路径/行数/SHA-256；全部条目 `未取证`） | 闸门 1 留痕（已有） |
| I0 | 接口评审 | 编排/运行时核心/桌面窗口/Codex（条件）/测试/独立验收（可判性，只读） | I0 冻结记录（gate I/O、sidecar、drain、finalize、H14、Q8、勘误确认） | B1 写盘；在飞接口稳定 |
| W1 | 运行时核心 | 运行时核心 | drain 纯函数；`session.ts` 收尾；F5；`test/runtime-core/` | I0；**在飞变更 E3 完成**（串行起点） |
| W2 | 编排·授权门与停稳 | 编排 | `trunk-runtime.ts` gate/H13/H14/停稳/host-continuation；`run-role.ts`；`apply-journal.ts` drain | W1 |
| W3a | 编排·审计基础 | 编排 | `git-command.ts` sidecar append/read + 单测（纯加法，不改变既有行为） | I0（可与 W1 并行；同受串行起点约束） |
| W3b | 编排·审计接线 | 编排 | 全部写前锚点 + authorization 组合 + 失败拒绝（`git-action-audit-unavailable`） | W2 + W3a |
| W4 | 桌面窗口 | 桌面窗口 | `app/desktop/session.ts` C8 + native optional；既有测试用例 | W1 + W2 |
| W5 | 测试集成 | 测试 | `test/测试/` 跨角色集成；源码断言改写（N15）；e2e 评估更新 | W1–W4 |
| W6 | 条件·Codex 适配器 | Codex 适配器 | 默认 N/A；如 I0 需要，仅 D1/D2/D6 | I0 |
| D1 | 确定性验证 | 测试（各 owner 配合） | 受影响套件 + 跨角色集成 + typecheck；与参照基线对照 | W1–W6 |
| RR | 真实运行最小验证 | 测试（统筹组织） | AC-22/23/24 证据 + 预算/中止记录（AC-24） | D1 |
| E3-F | 终验执行 | 测试 | 全量 T3（对照参照记录逐条 diff）、typecheck、删除清单核实、候选 manifest | RR |
| E3-B | 变更包 | 统筹 | 候选哈希、改动路径、节点、证据链接、T3、删除清单、披露 | E3-F |
| E3-V | B2 | 内置独立验收（沟通启动） | 按 B1 判 `pass/fail/insufficient evidence/not applicable` | E3-B |
| E3-R | 放行记录 | 统筹 | `docs/scheduling/` 放行记录（只表示当前候选满足 B1；不授权发布） | E3-V |

**实施启动门（强制）**：在飞变更 E3 完成（推荐已提交/合入）+ I0 完成 + 沟通放行。启动前重核 HEAD/tree、T1、依赖/夹具/构建配置；任何变化按 B0 豁免口径记录并披露，不作正式 B0 重登记（除非沟通另行确认）。

### 5.2 B1（独立验收撰写，闸门 1 后）

- **撰写者**：内置独立验收（同一独立身份将作 B2）；写 `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（拟名）。
- **输入**：P1.3（`94f71fcb…`）、复核记录（`a2468ed0…`）、意图记录（`603e7ef9…`）、闸门 1 留痕（`d32f9b37…`）、本团队计划、在飞 B1 v1（`fb881126…`，用于取代标签）。
- **内容**：转写 P1.3 §5.1–§5.3（AC-1–AC-24 与 `P1.2-AC-25`–`P1.2-AC-31`，含负向 `P1.2-AC-28`）、§3.8 错误码表、§4.5 测试同步、§6.2 真实运行预算；**首部注明 Q16 取代关系**（取代在飞 `P1.3-B1-AC-26` 与 B1-EV3 相关表述）；全部条目 `未取证`。
- **出口**：B1 冻结（路径/行数/SHA-256），统筹在派发记录登记；沟通在闸门记录引用。B1 冻结后不随候选调整（复判规则由 B1 自定）。
- **时序**：闸门 1 已留痕，可**立即开始**，与在飞变更收尾并行（不写产品代码，无冲突）。

### 5.3 I0 接口评审（逐项冻结）

> 由受影响方在派发前置的接口约束；各实施批次在证据中确认「按 I0 执行/偏差=0」。若实施中必须偏离，停止并回报统筹。I0 记录写入提议角色 `docs/change/`，统筹在 `docs/scheduling/` 汇总。

| # | 事项 | 需冻结的结论（最低要求） |
| --- | --- | --- |
| I0-1 | sidecar 写入契约 | 路径固定 `<canonical projectRoot>/.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`；append 单次写入（O_APPEND/短写失败⇒unavailable）、版本锁/lease、符号链接/nlink/越界拒绝；**精确预算组合**（行 ≤4 KiB、尝试数、文件上限自洽，S5）；JSONL 读取容错（末行截断忽略；坏 JSON/超长行/未知字段 fail-closed）；v1 字段白名单（无凭据/环境）；append 失败 ⇒ `git-action-audit-unavailable`、不执行、无效果 |
| I0-2 | sidecar 写前锚点位置与 owner | 逐动作冻结 append 位置：commit/integrate/revert、init（先于 `writeGitInitializationRecord(prepared)` 与 repo 创建）、delivery、文档/计划/激活/initial workflow（`commitPrepared*` store 写前）；确定 `git-trunk-store.ts`/`git-capabilities.ts`/`public/trunk-store.ts` 是否实际写入（默认条件写集）；append API 签名与导出位置（`git-command.ts`；公共出口必要性） |
| I0-3 | drain 原因分类逐条冻结 | `DRAIN_EVIDENCE_ONLY_REASONS`/`DRAIN_NATIVE_EVIDENCE_REASONS` 显式集合逐条确认；**未列/未知 reason 默认阻断**；`native:pi-sdk-idle-not-observed` 保持阻断（S1）；列出阻断项（`native-provider-lifecycle-read-failed`、`real-provider-settled-not-observed`、`stopCleanupErrors` 四项、`custom-provider-disposal-coverage-unverified`、handler-running/not-terminal/mcp-process-coverage 等）；F7 活动循环 drain 即返回（若保留轮询须记录成本） |
| I0-4 | gate 输入/输出形状 | `expectedActor`/`expectedTool`（**active-tool 模式必填**，缺失⇒`git-actor-core-binding-unproven`，S5）/`authorizationMode`/`hostContinuation`；输出 `ok/registryRevision/inventoryRevision/rootsDigest/actor/controls/optionalEvidence`；**不返回** `authorization`/`policyInputDigests`/`leaseId`（调用点组合）；`optionalEvidence` 不读 `applicationMediation` |
| I0-5 | finalize 顺序与 host-continuation | `finalizeRunChange` 保持 gate（`:748`）先于 host lease（`:750`）；无 policy、不写 sidecar；host-continuation 匹配 `requesterTurnId`/`taskId`（inventory 唯一 live/disposed 记录 + `held.plan.requesterTaskId` 双绑定）/`roleId`/`project`；不要求 live member/activeTools；Q8 `nativeInstanceId` 可选形状与 `absent` vs `present-but-changed` 语义 |
| I0-6 | H14 身份核对 | active 条目必须可读 lifecycle/toolSurface；`toolSurface.sessionId/roleId/runtime` 与 entry 一致；`core-instance-inspection-failed`/缺失⇒`git-core-inspection-unavailable`（不 fail-open）；H13 excluded/豁免边界逐条确认 |
| I0-7 | Codex 参与与 R9 | 确认 Codex 适配器默认零产品写入；`plan.native` 投影/`ensureAdapter` 回落/`bindRole` 条件核对归运行时核心；F5 测试落点（默认 `test/runtime-core/`；如放 `test/codex-adapter/` 由 Codex 适配器在目录授权内写） |
| I0-8 | 改名与测试符号 | `inspectInitializationProtection`→`inspectGitActionAuthorization`；同步 `test/编排/trunk-dispatch-parent.test.ts`、`test/测试/runtime-dispatch-gate-integration.test.ts` 符号定位；O2 别名默认不做 |
| I0-9 | 勘误确认 | §4.8 E-a–E-e 逐项确认；不改方向/写集唯一性；策划文本同步由沟通知会 |

**I0 出口**：I0 记录冻结、无 open must-fix；gate/sidecar/drain/finalize/H14/Q8 形状齐备；各实施批次可据此施工。未过 I0 不得开始 W1–W4 产品写入。

### 5.4 实施批次（在飞变更完成后串行）

**公共纪律（所有批次）**：写者/写集/证据/候选哈希记录；**受影响套件实施前后对照**；不得写写集外文件；不得删除测试/放宽断言/加 skip/force-exit 求绿；不得提交/推送/暂存/合并/发布；跨角色只读消费经既有公共出口。条件 H1 出现即停止回报。

- **W1（运行时核心）**
  - 写：`src/model/runtime.ts`（`isRuntimeSessionDrained` 纯函数 + reason 白名单）；`src/service/runtime/session.ts`（A1/A2/A5/A9 残留核对与收尾、`official-pure-preparation-unproven` 退役、`construction.status` 真实边界、C9 `stopAndInspect` disposed 分支 + 活动排空循环、F5/R9 投影与回落、`bindRole` 条件核对）；`test/runtime-core/`（R14 两阶段改写、drain 真值表、F5、F7）。
  - 出口：`test/runtime-core/` 全绿；受影响套件前后对照；`npm run typecheck` 绿；无新增确定性失败/新 skip；证据入 `角色卡/运行时核心/docs/change/`。
- **W2（编排·授权门与停稳）**
  - 写：`src/pipeline/orchestration/trunk-runtime.ts`（B8/B9/B10 删除、H13/H14、`inspectGitActionAuthorization`、expectedActor/expectedTool/mode、B14 返回、C1–C4、host-continuation、Q8 plan 形状）；`src/pipeline/orchestration/run-role.ts`（A10/C7、A9 残留、F11 复核）；`src/service/trunk/impl/apply-journal.ts`（C5 drain）；`test/编排/` 对应用例。
  - 出口：`test/编排/` 全绿（含改写源码断言）；失败准入 Claude/Pi 形态不再阻塞后续 Git 动作；run-stop/controller-stop Claude/Pi 成员可停止；host-continuation 正/负例通过；typecheck 绿。
- **W3a（编排·审计基础，可与 W1 并行）**
  - 写：`src/provider/trunk/impl/git-command.ts`（sidecar append/read/安全/预算/容错）；（条件）`src/provider/trunk/public/trunk-store.ts` 导出；`test/编排/git-command.test.ts` 等。
  - 出口：sidecar 单测（路径/符号链接/nlink/预算/坏行/截断/pending-recovery 隔离）全绿；纯加法，不改变既有行为；typecheck 绿。
- **W3b（编排·审计接线）**
  - 写：`trunk-runtime.ts` 各动作调用点组合 authorization + append；`apply-journal.ts` `commitPrepared*` 写前 append；`git-capabilities.ts`/`git-trunk-store.ts`（按 I0 锚点）；失败⇒`git-action-audit-unavailable`（不执行、无 ref/对象/工作树副作用）。
  - 出口：AC-1/2/3/4/16/`P1.2-AC-26`/`P1.2-AC-30`/`P1.2-AC-31` 的确定性用例通过；多 verdict digest 映射正确；typecheck 绿。
- **W4（桌面窗口）**
  - 写：`app/desktop/session.ts`（C8 drain、`ownedRunStopMembers` native optional）；`test/桌面应用/chief-workflow.test.ts`（既有文件；保留 `controller-stop-target-instance-unproven` 并补 Claude/Pi 正向；相关 quiescent/complete 断言按 drain 语义评估）。
  - 出口：桌面既有测试全绿；不新建 `test/桌面应用/` 文件；typecheck 绿。
- **W5（测试集成）**
  - 写：`test/测试/runtime-dispatch-gate-integration.test.ts`（N15 源码断言改写）；`test/测试/git-role-workflows-e2e.test.ts`（评估更新）；新增 `test/测试/` 跨角色集成（三路径+sidecar、run-stop、host-continuation、PR #72 回归）。
  - 出口：跨角色集成全绿；PR #72 全套（`test/gates/*`、派发父门、application-mediation）原样通过；typecheck 绿。
- **W6（条件·Codex 适配器）**
  - 默认 **N/A**（零产品写入）。如 I0 确认需适配器侧同步：仅限 D1/D2/D6（证据产生/真实限制），`test/codex-adapter/` 条件参与；不改变证据语义。
- **单轨删除（随批次）**：退役原因的删除与替换同批落地（§5.8）；E3 做删除清单核实与死代码扫描（仅限本变更删除项）。

### 5.5 D1 确定性验证

- **范围**：W1–W5 受影响套件（`test/runtime-core/`、`test/编排/`、`test/桌面应用/`（触及文件）、`test/codex-adapter/`（如触及）、`test/测试/` 跨角色集成）+ `npm run typecheck`；渲染按需（预期 N/A 并给依据）。
- **对照**：每批次「实施前后」受影响套件对照；D1 汇总与**参照基线**（在飞变更 E3 的 T3 记录；未就绪时用 `2026-11-07_E3-T3-full-regression.md` `d0d67ff4…` 交叉核对并披露差异）按（文件 + 测试名 [+ 类别]）对照。
- **判定**：**新增确定性失败 = 0、新增 skip = 0**；既有失败变化逐条说明；不得以 tool 退出 0/自述/局部绿/force-exit 冒充通过。测试同步清单（§4.3）全部落实；每条删除/改写断言有 diff 与理由。
- **证据**：`角色卡/测试/docs/change/`（命令/环境/退出/逐文件结果/对照 diff/候选 manifest）。

### 5.6 RR 真实 Claude 最小运行

- **目的**：证明受保护项目中 Claude 角色会话不仅能创建/投递（在飞变更），还能在 ACL/写集内完成一次**结构化 Git 动作**并留 authorization 审计；其它会话 native 证据缺失不再阻断。
- **环境与纪律**（沿用 P1-RR §4 / 在飞 §6.2）：仓库外临时根 + 临时 `userData`；目标项目构造 `required` 保护事实（父门 init-source 或预置合法 init-source，如实记录）；真实 UI 导入 + 单条客户消息；只用仓库根 `.env` 既有凭据（不打印/复制）；审计预检：目标项目 `docs/audit/shell-gate.jsonl`（如涉及 shell）与 `.ans/trunk/operations/`（含 `authorization.jsonl`）可写；不通过则记录环境事实并停止；不修改仓库、不写既有项目、不改 `app/main.ts`。
- **步骤**：导入目标项目、开 chief 会话、发送 1 条消息派发（按 `docs/intents/*.md` 写意图）→ 验证父门受理、任务创建、目标 product 会话创建成功、任务投递（AC-22）→ 让目标角色执行一次 ACL 内的 Git 动作（优先 `git_candidate commit`；若流程要求 init 则 `git_candidate init`；成功或如实报告下一真实阻塞，AC-23）→ 观察窗口结束即停（`#btn-halt` + `stopSession` + CDP close）。
- **预算**（AC-24）：客户消息 1 条；chief 回合 1 个；product 回合 1–2 个；`dispatch_task` ≤1 次；**Git 能力调用 ≤2 次**；审批卡 ≤2 张；**墙钟 10–15 分钟**；不自动重试；首个决定性失败/成功即停；不追加预算、不伪造。
- **只承诺**：本次候选/环境/输入下的观测事实（**会话创建 + 投递 + 至少一次 ACL 内结构化 Git 动作或如实下一门**）。**不承诺**：六角色完整闭环、发布成功、长期稳定性、Codex/Pi 真实运行（Q13）。若 Git 动作因流程/权限链无法在预算内到达，把子项留给确定性集成测试并如实报告。

### 5.7 E3 终验、E3-B 变更包、B2

- **E3-F（测试）**：全量 T3（按参考记录同口径：文件枚举、逐文件自然 EXIT/CLOSE、tests/pass/fail/cancelled/skip/todo、退出码/signal/watchdog；已知挂起按登记隔离；不得 `--test-force-exit` 冒充）；与参照记录逐条 diff（新增确定性失败 0、新 skip 0）；`npm run typecheck`；渲染按需；删除清单核实 + 死代码扫描（仅本变更删除项）；候选 manifest（`src app test` 逐文件 sha256 + 可复算聚合算法）。
- **E3-B（统筹）**：变更包——候选哈希/改动路径/节点/证据链接/T3（含参照记录与对照 diff）/删除清单/披露（§6.2）/B0 豁免与参照基线说明/T1 单列/取代关系（Q16）。
- **B2**：**沟通启动**内置独立验收，按 B1 v1 判定（`pass/fail/insufficient evidence/not applicable`）；报告入 `docs/acceptance/`；不授权发布。
- **E3-R（统筹）**：放行记录入 `docs/scheduling/`（只表示当前候选满足 B1；不授权发布）。

### 5.8 单轨删除、依赖、单写者与失败恢复

- **适用性**：不建模块双轨、不建运行时双轨（Q18）。E1/E2 取「单轨替换 + 同批删除 + 回切=回滚提交」形态。
- **同批删除清单（随对应批次落地，E3 核实）**：
  - 退役原因（不再产生）：`git-core-creation-proof-unavailable`、`git-native-surface-unproven`、`git-unclosed-effect-registered`、`official-pure-preparation-unproven`；`native-factory-plan-*`/`native-tool-*`/`process-coverage-*` 作为**门控**删除（保留为证据）。
  - 在飞变更已退役（本变更验收确认无残留）：`required-scope-unconfined-script-tools`、`runtime-protected-scope-unmediated-app-execution-planned`（F11：实施前逐项复核符号/锚点，不以「已执行」假定）。
  - 语义收窄（码保留）：`git-old-core-programs-unproven`、`git-role-capability-guard-unproven`、`run-stop-member-lifecycle-unproven`、`run-stop-instance-unproven`、`run-stop-lifecycle-unproven`、`run-stop-unverified`、`controller-stop-target-instance-unproven`、`controller-stop-terminal-unproven`。
  - 新增：`git-action-audit-unavailable`、`git-core-in-flight-unproven`、`git-core-inspection-unavailable`。
  - 旧错误码只读对照保留（历史日志/证据）；新代码不再产生；桌面人话映射 O6 默认不做。
- **不得**：任何角色写写集外路径；W2 早于 W1；只改 gate 不接 sidecar（或反之）；切换未验证即删旧实现；以旧候选/旧参照冒充当前结果；角色写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。
- **失败/返工**：失败阻止依赖节点；返工交原所有者；统筹不改验收结论；候选/参照/契约/标准/边界变化使受影响证据失效并重取。
- **并发在飞**：工作树有在飞变更未提交改动与 T1 三文件；派发前核对同文件占用；若冲突先冻结/重排并回报。

---

## 六、验收与证据计划

### 6.1 每阶段出口、证据与候选身份

| 阶段 | 出口判据 | 证据 | 候选身份 |
| --- | --- | --- | --- |
| G2 | 沟通闸门记录覆盖本计划 + P1.3 + 复核（+ B1 冻结后）的路径/行数/SHA-256 | `docs/communication/` 记录 | — |
| B1 | B1 v1 冻结（路径/行数/SHA-256）；Q16 取代关系写明；全部条目 `未取证` | `docs/acceptance/` 文件 | —（标准，非候选） |
| I0 | I0 记录冻结、无 open must-fix；gate/sidecar/drain/finalize/H14/Q8/勘误齐备 | 接口评审记录（角色 `docs/change/`）+ 统筹汇总 | — |
| W1–W6 | 各批次测试全绿、typecheck 绿；受影响套件前后对照；无新增确定性失败/新 skip | 各角色 `docs/change/`（命令/输出/hash） | 逐批次候选 manifest |
| D1 | 受影响套件 + 跨角色集成 + typecheck 通过；与参照对照新增失败 0/新 skip 0 | 测试 `角色卡/测试/docs/change/` + 原始日志 | 组合候选（`src app test` 逐文件 sha256 + 聚合算法明文） |
| RR | AC-22/23/24 完成并如实报告；预算/中止保留 | 诊断 `session.open.*`/`tasks.jsonl`/`.ans/trunk/operations/*`（含 `authorization.jsonl`）/审计 JSONL/UI 截图/预算记录 | 与 D1 同一候选 |
| E3-F | 全量 T3 对照参照逐条 diff；新增失败 0/新 skip 0；删除清单核实；typecheck/渲染按需 | T3 原始日志/逐文件结果/对照 diff；死代码扫描报告 | 最终候选（冻结哈希） |
| E3-B | 变更包齐备（候选/路径/节点/证据/T3/删除清单/披露/B0 豁免说明/取代关系/T1 单列） | `docs/scheduling/` | 最终候选 |
| E3-V | B2 报告（pass/fail/insufficient evidence/not applicable） | `docs/acceptance/` | 最终候选 |
| E3-R | 放行记录（满足 B1 的当前候选；不授权发布） | `docs/scheduling/` | 最终候选 |

- **候选范围**：`src/ app/ test/`（逐文件原字节 SHA-256 + 可复算聚合 + 算法明文）；**T1 三文件只读、不入候选**（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`、`test/claude-adapter/schema.test.ts`）；管理文档（`docs/`、角色卡 evidence）不入候选；工作树完整 status 在变更包记录。
- **证据存放**：各角色 `角色卡/<roleId>/docs/change/`；测试 `角色卡/测试/docs/change/`；证据目录与索引 hash 齐备。
- **证据失效**：候选/参照/设计契约/依赖/夹具/构建/命令/环境变化使受影响证据失效并重取；不得只改哈希冒充当前结果。

### 6.2 披露（客户可见限制，不得隐藏）

1. **Q1**：删除注册表级 Git 写门；残余风险——(a) 审批放行的不透明 shell 脚本可能写 `.git`（shell 审批/审计/后审计覆盖，不属结构化 Git 写，N5/N7 措辞已限定）；(b) 其它 active 会话的 foreign MCP/未封闭/未知 app 工具可在 `git-mutation` lease 之外写 `.git`（F8；只记录 optionalEvidence，不宣称已阻断，`P1.2-AC-28` 为披露项）。
2. **Q3 / Claude/Pi 进程不可观测**：run-stop/controller-stop 的「已停止」= Core/tracked-process drain，不等于 native 进程树已消失；`stopAndInspect` 活动循环 drain 即返回（若实施保留轮询，披露每成员最多 5s 与 timeout facts 接受方式）。
3. **Q6 / 审计缺口**：sidecar append 失败 ⇒ 动作不执行（`git-action-audit-unavailable`，fail-closed）；动作前拒绝只留诊断 `git.action.denied`（best-effort，桌面日志），无 journal/sidecar；审计不可写时按拒绝处理。
4. **Q7**：本变更与在飞变更串行；5（潜在 6）重叠文件；在飞 B2/候选未冻结前不在同一工作树并行编辑。
5. **Q12**：结构化 Git 写=角色 ACL/任务绑定授权，不弹客户卡；不弱于 shell 审批，不扩大代批。
6. **Q16**：本变更 B1 取代在飞 B1 v1 的 `P1.3-B1-AC-26` 与 B1-EV3 相关表述（按标签）；两端变更包/验收记录须注明；历史记录不删除。
7. **B0 豁免**：客户指示跳过 B0 正式重登记；回归参照=在飞 E3 记录（或当前后备记录），环境差异与失效风险如实披露；若沟通认定豁免不覆盖本变更，则补 B0。
8. **Q13**：真实运行只承诺真实 Claude 最小证据（会话创建+投递+至少一次 Git 动作或如实下一门）；不跑真实 Codex/Pi；不承诺六角色闭环/发布成功/长期稳定性。
9. **Codex 配置（Q2/Q5 风险 5）**：MCP/服务端 WebSearch 的真实不支持仍在绑定/构造期报错；无 native plan 提前 reason 的创建期拒绝路径，错误可能更晚出现。
10. **测试面**：source-text 断言与 reason/验收条目同步属契约变更；逐条记录，不以放宽断言求绿。
11. **可选证据**：native/toolSurface/processCoverage 缺失/unknown 不改变放行结果（只进 optionalEvidence）；不把 unknown 当 observed。
12. **发布/tag 未授权**；提交/推送/合并按委托，不含发布。

### 6.3 独立验收输入清单

1. P1.3（`94f71fcb…`）、复核记录（`a2468ed0…`）、意图记录（`603e7ef9…`）、闸门 1 留痕（`d32f9b37…`）、本团队计划 + 闸门 2 留痕；
2. B1 v1（冻结后路径/行数/SHA-256）；
3. I0 接口评审记录（gate/sidecar/drain/finalize/H14/Q8/勘误）；
4. 各批次测试原始输出、跨角色集成、D1 对照、全量 T3 对照 diff、typecheck/渲染依据；
5. 真实运行原始证据（含预算/中止/失败如实记录）；
6. 删除清单与死代码扫描报告（仅本变更范围）；
7. 变更包（候选哈希、改动路径、节点、证据链接、T3、披露、B0 豁免说明、Q16 取代关系、T1 单列）。

---

## 七、风险与依赖

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | T3 治理/权限语义误实现（unknown 冒充 observed；可选证据变成门；写门读 applicationMediation） | 负例 AC-7/AC-18/AC-19（P1.2-AC-28 披露）；B2 判；code review 重点 |
| R2 | 与在飞变更串行失败/基线漂移（工作树脏、5+1 重叠文件） | 实施启动门（E3 完成）；开工前重核；单写者；若提前开工必须独立 worktree（计划修订） |
| R3 | sidecar 正确性（write-ahead、失败拒绝、replay/settlement 隔离、路径安全） | I0-1/I0-2 冻结；AC-16/`P1.2-AC-26`/`P1.2-AC-30`；fail-closed |
| R4 | drain 原因误分类放过未排空会话 | I0-3 逐条冻结；未列默认阻断；`native:pi-sdk-idle-not-observed` 阻断；测试真值表 |
| R5 | host-continuation 实现错误（缺 taskId 匹配/要求 live member/要求 activeTools） | AC-8/`P1.2-AC-25`/`P1.2-AC-29`；I0-5 |
| R6 | Codex native 可选回落缺失（`ensureAdapter` 抛错） | F5/`P1.2-AC-27`；I0-7；R9 owner 明确 |
| R7 | 真实运行环境（审计预检/审批卡/UI 自动化）不可达 | 预检；AC-24 回退确定性测试并如实披露；不追加预算 |
| R8 | 测试面遗漏（源码断言/错误码表/验收条目） | §4.3 逐条映射；E3 删除清单核实；B2 insufficient evidence 兜底 |
| R9 | 审批疲劳/审批放行脚本写 `.git` 的残余风险 | 已披露（Q1）；控制=逐操作审批/审计/后审计+冲突检测；不扩大代批 |
| R10 | 证据复用/候选拼接 | 候选 manifest；失效重取；不拼接不同候选/环境/阶段 |
| R11 | B0 豁免依赖与参照基线适用性 | 沟通确认；变更包/B2 披露；必要时补 B0 |
| R12 | 范围蔓延（顺手改在飞写集/T1/无关 reason 模板） | 本计划非目标；越界即停止回报 |
| R13 | 潜在第 6 重叠文件（`public/trunk-store.ts`）被遗漏 | I0-2 冻结；串行规则已覆盖；派发前核对占用 |
| R14 | `test/桌面应用/` 逐文件授权被违反 | 仅既有文件；新建即触发条件 H1（§4.7） |

**依赖**：在飞变更 E3 完成与候选冻结；P1.3/复核/B1 版本稳定；I0 完成；工作树无同文件并发写；真实运行凭据/环境可用；B2 由同一独立验收身份判定。

---

## 八、需沟通处理事项

1. **闸门 2 留痕**：沟通在 `docs/communication/` 记录本团队计划（路径/行数/SHA-256）+ P1.3 + 复核记录（+ B1 冻结后），按预授权覆盖闸门 2 与实施授权；未留痕前实施角色不得当作已确认对象。
2. **B1 启动**：闸门 1 已留痕；请沟通/内置独立验收按 §5.2 开始撰写 B1 v1 并冻结登记。
3. **Q16 取代关系（AC-26）**：本变更 B1 取代在飞 B1 v1 的 `P1.3-B1-AC-26` 与 B1-EV3 中「`native-factory-plan-unavailable` 仅 codex」表述；须在**两端**变更包/验收记录注明：本变更 B1/变更包/B2 按标签引用并声明取代；在飞变更若在取代生效后作 B2，其报告注明「`P1.3-B1-AC-26` 由后续变更取代」（只影响被取代条目，不重判其余 AC）；沟通在两端沟通记录同步留痕。历史记录不删除。
4. **T1 三文件**：`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`、`test/claude-adapter/schema.test.ts` 仍未提交，属已验收独立候选；**单列、不混入本变更候选或写集**；最终提交计划/变更包单独处理。
5. **在飞完成与放行**：本变更实施须在在飞变更 E3 完成后由沟通放行；推荐在飞候选按委托提交/合入后开工（干净基线）。若沟通要求在飞未合并前开工，须独立 worktree + 独立候选（计划修订，不自行执行）。
6. **B0 豁免适用性**：客户 B0 豁免记录的文义指向在飞变更；本变更拟沿用（参照在飞 E3 记录）。请沟通确认覆盖本变更，或通知内置独立验收按届时 B1 的 B0 条目补登记。
7. **设计文本勘误知会策划**：§4.8 E-a–E-e（sidecar 锚点写集/Codex 行 D6/测试路径/预算组合/标签引用）；不改设计方向；实施按实际路径与 I0 冻结结果。
8. **派发前置**：I0 结论冻结、B1 冻结、在飞 E3 完成、工作树占用核对（在飞候选、T1、未跟踪文件）无冲突后方可派发；本计划未派发。
9. **条件 H1**：若实施出现 §4.7 条件项（新建 `test/桌面应用/` 文件或越界路径），停止并走人事 H1 / ANS Governance，不自行扩权。
10. **授权边界**：发布/tag 未授权；提交/推送/合并按委托；B2 由沟通启动；统筹不判验收。

---

## 九、计划状态与下一步

- **已写**：本团队计划（`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`）。
- **待办（按序）**：
  1. 沟通：留痕本计划 + P1.3 + 复核（+ B1 冻结后）的闸门记录；确认 B0 豁免适用性；记录 Q16 取代关系；
  2. 内置独立验收：撰写并冻结 B1 v1（闸门 1 后，可立即开始）；
  3. 受影响角色 + 测试：完成 I0 接口评审（§5.3 逐项冻结）；
  4. 在飞变更：完成 W2–W5、D1、RR、E3（及按委托的提交/合入）；沟通放行本变更实施；
  5. 本变更按 W3a/W1 → W2 → W3b → W4 → W5（W6 默认 N/A）实施，各批次同步测试；
  6. D1 → RR → E3-F → E3-B → E3-V（B2，沟通启动）→ E3-R（放行记录）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未联系客户。
- **约束复核**：本文件只写 `docs/scheduling/`；不实施、不派发、不判验收、不提交/推送/合并/发布。若客户改变方案默认项、角色结构、写集口径或 Q 处置，重开对应闸门并修订本计划。
