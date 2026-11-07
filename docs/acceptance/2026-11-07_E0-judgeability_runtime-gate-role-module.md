# E0 契约可判性确认（B1 E0.1–E0.9）：运行时门控与角色模块 v1

- 日期：2026-11-07；固定身份：ANS 独立验收唯一主上下文（本记录只做 E0 可判性确认，不实施、不派发、不运行真实模型、不判 B2、不授权提交/推送/合并/发布）。
- 对象：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` **E0.2**，**681 行 / 53674 bytes / SHA-256 `798ce9ce0d23cfd0fcc73c021d0510e517e9a34d6a22c45907605a442550b3fc`**（取代 E0.1：574 行 / 43032 bytes / `3830fe63…`）。
- 评审记录：`docs/scheduling/2026-11-07_review_E0-contract_runtime-gate-role-module.md`，**71 行 / 12303 bytes / SHA-256 `6905f391b42c95a1cc94bd367fdb4ae23a080e8151cdf21f01e37363337a13f6`**（评审对象为 E0.1；R-1/R-2 blocking，R-3 accuracy-blocking，R-4 准确性，R-5 一致性）。
- 适用标准：B1 v1 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md`（273 行 / 38456 bytes / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999`）与 B1 v1.1 `…criteria-v1.1.md`（137 行 / 17749 bytes / `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867`）。本确认只涉 E0.1–E0.9；E3.1 以 v1.1 为准。
- 依据：P1.6 `24150207…`（1242 行）、复核 `59b2c81c…`（305 行）、团队计划 `00e1f76b…`（687 行）、B0 `13553505…`（910 行 / 81484 bytes）、六项契约确认（`docs/communication/memo.md` 2026-11-07 条）、H1 记录（同 memo 2026-11-07 条：8 卡/边界/YAML/changelog；`shared-directories.md` `4e43e615…`→`80ece2c5…`）。
- 结论（先行）：**E0.2 契约可判性通过（无阻断性语义缺口）；但 E0 冻结条件尚未全部满足**——门禁 delta **D1**（14 个 `RoleToolId` + `RoleToolName`/映射/允许集 + 测试）**尚未落地**，且 E0.2 存在 2 处版本文字、1 处 Q3 编号/语义不一致及若干冻结记录要素需补齐。补齐后可冻结；冻结前不得开始 E1。详见 §7。

## 1. 只读核对（本轮实测）

| 项 | 值/结果 |
| --- | --- |
| E0.2 行数/字节/SHA-256 | 681 / 53674 / `798ce9ce0d23cfd0fcc73c021d0510e517e9a34d6a22c45907605a442550b3fc`（与任务声称一致） |
| 评审记录行数/字节/SHA-256 | 71 / 12303 / `6905f391b42c95a1cc94bd367fdb4ae23a080e8151cdf21f01e37363337a13f6`（一致） |
| B0 行数/字节/SHA-256 | 910 / 81484 / `13553505abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101`（一致） |
| 六项契约确认 | `docs/communication/memo.md` 2026-11-07 条（P1.6 不变 `24150207…`；shared-components 迁至 shared-code 目录；E0 产物按既有写权；新角色 E0 后上岗/上岗前只读；`handback.ts`/`workflow-preconditions.ts` 默认不迁移；`test/项目管理/shared/` 路径保留 owner 移交；T1 三文件不得修改） |
| H1 记录 | memo 同日条：8 角色卡片/边界/YAML/changelog 完成；B-9/B-10/B-11 完成；B-12 `references/shared-directories.md` 修订 `4e43e615…`→`80ece2c5…`。我复算当前技能文件 `C:\Users\51054\.claude\skills\ans-governed-construction\references\shared-directories.md` = `80ece2c55d9392c5cdae19afc637c340b7fd7831e5fc18fadf96e8b08d946ea3`，含 `common/roles/<id>/`、`common/gates/`、S2 共享 owner 规则；修订前副本未在本地保留（`4e43e615…` 仅由 memo 记录，未独立复算）。 |
| 门禁引擎当前草案 | `src/model/role.ts`（工作树未提交）`e0385fab…`：`RoleToolId` 当前只有 **5 个 id**（roleActivityLog/terminateRoleRun/redispatchTask/projectNote/requestVersionDecision）；**全仓未发现 `RoleToolName`**；契约测试 `test/门禁引擎/role-module-contract.test.ts` 399 行 / `6484e633…`，仍按“五个角色专属额外注入 id”断言（第 97 行注释）。`governance-roles.ts` 已有 `builtInRoleModuleDataOf`（D2 零复制 lookup）。 |
| 共享组件目录 | `角色卡/项目管理/docs/architecture/shared-components.md` 当前仍存在（49025 bytes / `dd33fdf7…`）；E1 迁移尚未开始（E0.2 §4.1 计划 shared-code 建新 → 评审 → PM 删旧）。 |

## 2. E0.2 对 B1 E0.1–E0.9 的覆盖（契约层面）

| B1 条目 | E0.2 覆盖位置 | 覆盖判断 | 缺口/备注 |
| --- | --- | --- | --- |
| E0.1 8 模块边界/public API/消费者/owner/版本 | §3.1（BuiltInRoleModule 等类型）、§3.2（六角色目录/内容/消费者/测试根）、§4（shared）、§5（gates）、§6（写集/owner） | **可判（覆盖）** | 模块“版本”目前只有契约全局版本 E0.2；若 B1 要求逐模块版本，冻结记录需声明“E0.2 契约版本适用全部模块”或补逐模块 API 版本。非阻断。 |
| E0.2 角色模块契约细化/纯策略 | §3.1（tools/dispatch/preflight/context 签名 + RolePolicyDecision）、§3.3（10 条纯数据/纯策略约束）、§3.4（动作前置/事实包） | **可判（覆盖）** | `RoleToolId` 契约文本已扩为 14 id + `RoleToolName` 映射 + 允许角色表（§3.1 R-1、§10.2 D1），但**代码/测试 D1 未落地**（见 §5/§7 G1）；冻结前需落地。 |
| E0.3 共享模块契约 | §4.1（owner/写集/迁移）、§4.2（11 个既有共享组件 public entry/消费者）、§4.3（handback/workflow-preconditions 编排公开只读、默认不迁移） | **可判（覆盖）** | handback/workflow-preconditions 的 public entry 名称已列（`isDispatchableRoleId`、`evaluateDispatchAuthorization` 等），但未列其测试文件；`provider/runtime/{schema,tools}.ts` 明确留运行时核心、不迁 shared（§4.1）；冻结记录应写明该排除与既有测试来源。非阻断。 |
| E0.4 门控模块契约 | §5.1（API 类型/函数）、§5.2（运行时分支/证据接受/消费者边界）、§5.3（18 个 reason 闭集与触发文字）、§5.4（只判定/不采集/不 import 引擎） | **可判（覆盖）** | R-3 import 路径已改为 `../../model/runtime.ts`；R-4 reason 触发文字已按实现精确化（strict custom-factory 仅 custom-override、applicationMediation 非 undefined 即 ambiguous、parent.kind undefined 允许）。消费者/禁止消费者（write/publish/stable-write/run-stop）明确。 |
| E0.5 错误语义 | §3.5、§5.3 | **可判（覆盖）** | 对外 `trunk-verify-failed` + 现有文案；内部 reason 闭集；缺事实/未知 fail-closed；`RolePolicyDecision` 形状。 |
| E0.6 依赖方向/无环 | §2（Model←shared←{roles,gates}←engines；零跨角色 import；shared 不 import 门/角色；无环）、§10.2 D9（type-only Model 边豁免；禁止 value import 反向/环） | **可判（覆盖）** | D9 扫描口径须写入冻结记录与扫描脚本（见 §5/§7 G4/G5）；当前尚未见扫描脚本落地（E1 gates-code 工作）。 |
| E0.7 写集/owner（含 shared-directories 修订与 shared-components 迁移） | §6（8 角色写集/测试/owner；现有引擎/Model owner；零重叠；新共享根需 H1 B-1–B-12/闸门 2）、§4.1（catalog 迁至 `角色卡/shared-code/docs/architecture/shared-components.md`）、§4.3（不迁移例外） | **部分覆盖 → 需冻结记录补证** | E0.2 **未点名 `shared-directories.md` 修订**（仅以 H1 B-1–B-12/闸门 2 间接覆盖）；B1 E0.7 要求其前后 SHA-256。H1/memo 有 `4e43e615…`→`80ece2c5…` 记录（当前文件 hash 已独立复算为 `80ece2c5…`），冻结记录必须显式引用；shared-components 迁移计划在 §4.1/§6 已覆盖（E1 单写者执行）。 |
| E0.8 行为/测试基线 + 冻结记录 | §7（B0 4,452/4,221/198/1/32/0；6 挂起；22 fixture；契约测试 7/7；E1 过渡权威）、§8（冻结记录字段：路径/版本/SHA/评审参与方/消费者/基线/契约测试/冻结变更流程 + B1 E0.1–E0.9 映射） | **可判（覆盖，需版本修正）** | §8 第 525 行“版本 | E0.1（本文件）”与 §12 第 679 行“本文件为 E0.1 契约草案”为**陈旧版本文本**；冻结记录必须使用 E0.2 `798ce9ce…`，并修正/覆盖这两行。§0 输入表未列 B1 v1.1（§7.1 引用了 v1.1）；冻结记录应补 `e5027742…`。D1 落地后契约测试行数/证据 hash 会变，冻结记录须用后置值。 |
| E0.9 E0 出口判据 | §8（E0 评审通过 + B1 E0.1–E0.9 可判；冻结后变更走 §4.4）、§12（未冻结；下一步评审/冻结） | **可判（覆盖，需版本修正）** | 与 E0.8 相同：§12 的“E0.1 契约草案”文字需改为 E0.2；出口条件本身清晰。 |

**契约覆盖结论**：E0.2 对 B1 E0.1–E0.9 的**语义/结构覆盖完整**；未见需要重写契约的语义缺口。存在的缺口均为（a）门禁 D1 代码/测试落地、（b）版本文本/Q3 编号等文档一致性、（c）冻结记录要素补证。

## 3. R-1/R-2 关闭核验

| 发现 | E0.2 处置 | 判断 |
| --- | --- | --- |
| R-1（blocking）RoleToolId 闭集不完整 | §3.1 扩为 **14 id**（roleActivityLog/terminateRoleRun/redispatchTask/projectNote/requestVersionDecision/requestRequirementChange/submitVersionChange/selectRunChange/completeTeamPlan/activateRoleDocuments/closeCreatedTask/submitRefactor/requestStableWrite/decidePendingRequest）+ `RoleToolName` snake_case 类型 + id→运行时工具名→允许角色表；未知/越权 id fail-closed（不注入、不静默忽略）；§10.2 D1 要求门禁引擎在 E0 冻结前落地 14 id + 映射 + 允许集 + 测试，新增 id 走接口评审。 | **契约文本关闭**；**代码/测试 D1 未落地**（`src/model/role.ts` 仍 5 id、无 `RoleToolName`；契约测试仍 5 id 断言）。D1 是 E0 冻结前条件，不是 E0.2 文本缺口；落地后 E0.1/E0.2 可判。 |
| R-2（blocking）RoleDispatchPolicyInput 范围不清 | §3.1 R-2 段：`dispatch()` 只回答“真实来源能否向真实目标派发”（source/target 身份 + targetExists），四字段不变；hub/legacy/review 路由、convener run/module 规则、D3 集合、交付任务/模块属主、报告时点与 `reportTargetForTaskCreator` 均留在引擎；`reportToRoleId` 仅作差分期望，不驱动实际报告路由；未来要 convener 模块拥有模块规则须新增可选可信事实并重开接口评审。 | **关闭（契约文本）**。与评审建议一致，未新增字段、未扩权。 |

## 4. Q1–Q12 处置可接受性

| Q | E0.2 处置 | 可接受性 |
| --- | --- | --- |
| Q1 共享 public entry | 保持 per-component public entry，不新增伞状 `index.ts` | 接受；与评审 Q1 一致，无 god-module。 |
| Q2 TrustedToolPolicyInput | 维持最小（仅 `governanceModel`）；宿主事实留注入层 | 接受；与评审/运行时核心判断一致。 |
| Q3（编号冲突，见下） | §11 问题表把 Q3 写作“动作事实键”（默认 api-spec 登记 + 测试，§3.4）；§11.1 处置表 Q3 写作“dispatch 范围→硬身份/存在性”（R-2，§3.1） | **需澄清**：两处 Q3 语义不同。实质处置都存在（facts 默认 §3.4；dispatch 范围 §3.1 R-2），不改变语义；但冻结记录/E0.2 必须统一编号，避免“Q3 未回答”或“答非所问”。 |
| Q4 资源根 | 默认应用资源根，本版不增 `root` 字段；loader owner/版本/hash 与 `RoleContextSection[]` 装配规则列入 E1 接口评审 | 接受；与评审一致，未扩 Model。 |
| Q5 RoleToolId | 按 R-1 扩 14 + 映射 | 接受（契约文本）；D1 落地见 §5。 |
| Q6 编排公开只读入口 | 确认不迁移；`handback.ts`/`workflow-preconditions.ts` 保持编排 owner + 公开只读 | 接受；与六项契约确认第 4 项一致。 |
| Q7 Pi server tools | 启用即不提供应用面事实（fail-closed），不新增 Model 字段；默认关闭不变；真机未实测 | 接受；与评审/Pi P-1 一致；真机限制需在 B1/E2 按桩件+代码判。 |
| Q8 wrapSession | 确认转发 `inspectApplicationToolSurface`（可选）；其他 Pi native 方法 legacy 未转发不在本 E0 范围 | 接受；与 Pi P-2 一致；已记录范围。 |
| Q9 gates 类型/所有权 | `src/common/gates/index.ts` 使用 §5.1 类型；P1 D-minimal 本地类型 E2 删除/别名；reason 闭集 §5.3；nativeInstanceId 必填 | 接受；与评审一致。 |
| Q10 nativeInstanceId | P1-A Amendment-1 必填字段纳入 gate accepted evidence | 接受；与三适配器/运行时核心一致。 |
| Q11 客户可见限制 | 不重开；Codex 外来 MCP fail-closed、WebSearch 默认 fail-closed、写/发布门 strict observed 复述；文字按三适配器建议澄清 | 接受；与 B1 L1–L6/客户决定一致，未放宽。 |
| Q12 共享目录/测试历史名 | catalog 迁至 `角色卡/shared-code/docs/architecture/shared-components.md`（E1 单写者）；`test/项目管理/shared/` 历史名保留 | 接受；与六项契约确认第 1/5 项一致；迁移尚未执行（E1）。 |

**Q1–Q12 结论**：实质处置可接受，与 E0.1 评审建议一致；唯一需修正的是 **Q3 编号/语义不一致**（文档层面，不改变语义）。其余 Q 未发现与 B1/P1.6/六项确认冲突。

## 5. 门禁 delta D1/D9/D10 与 B1 的关系

| Delta | E0.2 内容 | 与 B1 的关系 | 当前状态/冻结条件 |
| --- | --- | --- | --- |
| **D1** RoleToolId 闭集（R-1） | 14 id + `RoleToolName` snake_case + id→name→允许角色表；`RoleToolPolicy.tools` 保持 `RoleToolId[]`；未知/越权 fail-closed；新增 id 走接口评审；§10.2 D1 要求门禁引擎在 E0 冻结前落地 | 直接支撑 **B1 E0.1/E0.2**（角色模块 public API/闭集/纯策略）+ 门禁引擎 E0 证据 | **未落地**：`src/model/role.ts` 仍 5 id、无 `RoleToolName`；`test/门禁引擎/role-module-contract.test.ts` 399 行仍 5-id 断言；`角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md` 及 `src/model/role.ts` hash/行数需随 D1 更新。**E0 冻结前必须完成**（contract §10.2 明确“交门禁引擎 owner，在 E0 冻结前”）。 |
| **D9** 无环扫描口径 | 豁免 Model 内 type-only 边（`role.ts↔runtime.ts`、既有 `download.ts` 例外）；禁止 value import 反向/环；type-only 共享原语单列；写入冻结记录与扫描脚本 | 直接支撑 **B1 E0.6**（依赖方向/无环）与 E3 D2/D5 扫描 | **契约已定义**；冻结记录必须写入该口径，E1 gates-code 的 module-graph 扫描脚本须按此实现（当前未见脚本落地）。不是 E0.2 文本缺口；是冻结记录/E1 证据项。 |
| **D10** capabilities 单一真源 | E1 接口评审前声明模块 spec 的 `capabilities` 为唯一真源，`tools()` 输出为派生；加类型/测试约束（Equal/字段一致），不得两份不一致 | 支撑 **B1 E0.2/E0.6**（纯数据/单一事实源）与 E1 接口评审 | **契约已定义**；冻结记录须记录该声明为 E1 接口评审前置；当前 `RoleToolPolicy.capabilities` 与 `GovernanceRoleSpec.capabilities` 双来源仍在，E1 前需按 D10 收敛（不是 E0 冻结代码 delta）。 |

**门禁 delta 结论**：D1 是 **E0 冻结前必须落地的代码/测试 delta**；D9/D10 是 **冻结记录/E1 接口评审项**。D1 未落地是当前 E0 freeze 条件未满足的直接原因（不是 E0.2 契约文本缺陷）。

## 6. 原 E0.1 中已判可部分是否因 E0.2 变化而失效

评审记录 §五曾给出：E0.3–E0.5/E0.7–E0.9 已具备可判输入；E0.1/E0.2/E0.6 在修订前不可判。E0.2 变更后的影响：

| 部分 | 影响 | 判断 |
| --- | --- | --- |
| E0.3 共享 | E0.2 §4.1/§4.2/§4.3 细化 owner/入口/迁移/编排例外；Q1/Q6/Q12 处置确认，无否定性变化 | **不失效**；以 E0.2 §4 为当前文本；冻结记录需补 handback/workflow-preconditions 测试来源与 schema/tools 排除说明。 |
| E0.4 门控 | R-3 修正 import 路径（`../../model/runtime.ts`）；R-4 修正 reason 触发文字；§5.1–§5.4 细化 | **E0.1 的错误文本失效，但 E0.2 取代后仍可判**；须以 E0.2 §5.1/§5.3 为准，不得再引用 E0.1 旧文字。 |
| E0.5 错误语义 | R-4 reason 触发文字修正；§3.5/§5.3 | **不失效**；须用 E0.2 修正后文字。 |
| E0.7 写集/owner | E0.2 §6 细化写集/owner、§4.1 catalog 迁移；Q12 确认；但未点名 shared-directories.md | **部分不失效**；写集/owner 与 catalog 迁移可用；shared-directories 修订需冻结记录补 H1/B-12 证据（`4e43e615…`→`80ece2c5…`，当前文件 hash 已复算）。 |
| E0.8 基线/冻结记录 | §7 沿用 B0/22 fixture；§8 冻结字段；但 §8/§12 残留“E0.1”版本文字；§0 未列 B1 v1.1 | **实质不失效，记录需修正**；冻结记录必须使用 E0.2 `798ce9ce…` 与 v1.1 `e5027742…`，并注明 D1 后契约测试/证据 hash。 |
| E0.9 出口 | §8/§12；出口条件“E0 评审通过 + B1 E0.1–E0.9 可判”未变；版本文字需修正 | **不失效**；以 E0.2 为冻结候选。 |
| E0.1/E0.2/E0.6 | E0.2 新增/修订内容（14 id、dispatch 收窄、D9 口径）使其**具备可判文本**；但 D1 代码/测试未落地、D9 未入冻结记录、E0.1 逐模块版本未明示 | **可判文本已具备；D1/D9/记录项待补**；补齐后可判 pass，当前不能视为 E0.1/E0.2/E0.6 已通过。 |

## 7. 冻结条件与需修订/补齐缺口

### G1（冻结阻断，代码/测试）：D1 未落地

- 事实：`src/model/role.ts` 当前 `RoleToolId` 仅 5 id（`e0385fab…`），全仓无 `RoleToolName`；`test/门禁引擎/role-module-contract.test.ts` 399 行 / `6484e633…` 仍按 5 id 断言；门禁证据文档 `971dadde…`（314 行）反映的是 D1 前状态。
- 要求：门禁引擎按 E0.2 §3.1/§10.2 D1 落地 14 id + `RoleToolName`/映射 + 允许角色表 + 未知/越权 fail-closed + 测试；更新 `src/model/role.ts`、契约测试、证据文档与 hash；随后冻结记录引用后置证据。
- 影响：B1 E0.1/E0.2（及 E1 装配语义）；未落地前 E0 不能冻结。

### G2（冻结前文档修正）：E0.2 版本文字陈旧

- 事实：E0.2 §8 第 525 行“版本 | E0.1（本文件）”；§12 第 679 行“本文件为 E0.1 契约草案”。头部/版本记录已为 E0.2。
- 要求：改为 E0.2（或由冻结记录明确覆盖为 E0.2，并注明原行已过期）；冻结记录版本字段/哈希必须使用 E0.2 `798ce9ce…`，不得引用 E0.1 `3830fe63…`。

### G3（冻结前文档一致性）：Q3 编号/语义冲突

- 事实：E0.2 §11 问题表 Q3 = “动作事实键”（默认 api-spec 登记 + 测试，§3.4）；§11.1 处置表 Q3 = “dispatch 范围→硬身份/存在性”（R-2，§3.1）；评审记录 Q3 = dispatch 范围。
- 要求：统一 Q3 编号：要么把“动作事实键”改为另一编号并在 §11.1 补其处置（§3.4 默认），要么在 §11.1 明确 Q3 指 dispatch 范围、facts schema 处置见 §3.4；冻结记录记录该澄清。实质处置不变。

### G4（冻结记录必填）：shared-directories 修订与 B1 v1.1

- E0.2 未点名 `shared-directories.md`；B1 E0.7 要求其前后 SHA-256。H1/memo 记录 `4e43e615…`→`80ece2c5…`；我复算当前技能文件为 `80ece2c5…`（修订前副本未本地保留，`4e43e615…` 以 memo 为据）。冻结记录必须显式引用该修订（或 E0.2 增一句）。
- E0.2 §0 未列 B1 v1.1（§7.1 已引用）；冻结记录应补 B1 v1.1 `e5027742…`。
- E0.2 §8 的“契约测试 7/7”与 §0 的 399 行/证据 hash 在 D1 后会变；冻结记录必须用后置实测值。

### G5（冻结记录/E1 项，非阻断）：D9/D10 与共享/工具排除

- D9 无环扫描口径（type-only Model 边豁免、禁 value import 环、type-only 原语单列）必须写入冻结记录与 E1 `module-graph` 扫描脚本。
- D10 capabilities 单一真源声明必须写入冻结记录并作为 E1 接口评审前置；E1 前 `RoleToolPolicy.capabilities`/`GovernanceRoleSpec.capabilities` 双来源需按 D10 收敛。
- E0.3 的 `provider/runtime/{schema,tools}.ts` 明确留运行时核心、不迁 shared（§4.1）；handback/workflow-preconditions 的既有测试来源与 public entry 清单应在冻结记录补列。非阻断，但影响 E0.3/E0.7 证据完整性。
- E0.1 若要求逐模块“版本”，冻结记录应声明 E0.2 契约版本适用于全部模块（或补逐模块 API 版本）。非阻断。

### G6（一般）：E0.1 旧评审文字不得再引用

- R-3/R-4 已修正 E0.1 的 import 路径与 reason 文字；冻结记录/E1 不得引用 E0.1 旧 §5.1/§5.3 文字；E0.4/E0.5 以 E0.2 为准。

## 8. 结论

- **E0.2 契约可判性：通过（无阻断性语义缺口）**。B1 E0.1–E0.9 在 E0.2 中均有可判覆盖（§3–§8 映射见 §8 表）；R-1/R-2 已在契约文本关闭；Q1–Q12 实质处置可接受（Q3 编号需澄清）；D9/D10 已定义。
- **E0 冻结条件：尚未全部满足**。冻结前必须完成 **G1（D1 代码/测试落地）**、**G2（E0.2 版本文字）**、**G3（Q3 编号/语义澄清）**，并在冻结记录中补齐 **G4（shared-directories/B1 v1.1/后置证据）** 与 **G5（D9/D10/共享与工具排除/逐模块版本声明）**；G6 为引用纪律。
- 上述完成后，E0 可冻结；冻结前 E1 不得启动；E0 冻结记录路径按 E0.2 §8 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`，版本/哈希使用 E0.2 `798ce9ce…`（D1 落地后如契约需再改，按接口评审递增版本并重算）。
- 本记录不是 B2、不是 E0 冻结记录、不判任何 E1/E2/E3 条目；不改变 B1 v1/v1.1、P1.6、团队计划、角色卡或代码。

## 9. 限制与披露

1. 本确认只做只读核对：未运行测试/真实模型，未改方案/契约/代码/测试/角色卡/边界；`src/model/role.ts`/契约测试仅为只读查看其当前状态（hash/行数如 §1）。
2. D1“未落地”依据当前工作树源码/测试实读；若门禁引擎在本记录写盘后已完成 D1，请以新证据/hash 重跑本确认（受影响部分）。
3. `shared-directories.md` 修订前副本未在本地保留，`4e43e615…` 仅据 H1/memo 记录；当前文件 `80ece2c5…` 已独立复算；冻结记录需保留该前后对照。
4. Q3 编号冲突是文档层事实；其两种实质处置（facts 默认 api-spec 登记；dispatch 硬身份）均已存在于 E0.2，按 G3 澄清即可，不改语义。
5. 本确认不判定 B1 E0.1–E0.9 为 pass/fail；B2 需在 E0 冻结记录与实施证据齐备后按 B1 判。
