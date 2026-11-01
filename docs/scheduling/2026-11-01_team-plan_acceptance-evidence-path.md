# 团队计划：验收判断的提案物证路径修复（acceptance evidence proposal path）

- **任务 ID**：`2026-11-01-acceptance-evidence-path`
- **产品 flowId**：`acceptance-evidence-path`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-01
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0/1 记录**：[`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`](../communication/2026-11-01_intent_acceptance-evidence-path.md)（当前 61 行 / SHA-256 `47b9b707e401f772b0f4cee12ab84f0574d1ce91c613e9c0e5f108ba5a51d87d`；闸门 0 写盘快照为 53 行 / `e97b978b…`）。闸门 1 客户原话「确认闸门 1 修复方案（T2，含方法 A 验证授权）」。
- **客户确认的策划方案（唯一实施基线）**：[`docs/planning/2026-11-01_design_acceptance-evidence-path.md`](../planning/2026-11-01_design_acceptance-evidence-path.md) **P1.2**（396 行；SHA-256 `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`，本计划写盘前实测一致）。
- **独立复核**：[`docs/planning/2026-11-01_review_acceptance-evidence-path.md`](../planning/2026-11-01_review_acceptance-evidence-path.md)（124 行 / SHA-256 `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6`）——完整复核 F1–F11 + P1.1 窄复核 F1–F4/N1 + P1.2 确认；结论「建议提交客户确认」，无阻断项。
- **风险档位**：**T2（跨模块缺陷修复：app/desktop ↔ src/common/编排；不改判断规则/权限/契约形状）**，客户已在闸门 1 确认按 T2；升档条件见方案 §8.1。
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目当前**没有 `.ans/project.json`**（未启用 task_ops）；不伪造任务令牌、审批、锁或机器预检记录，证据以文件哈希与原始命令输出为准。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（参与角色/写集/边界变更/档位/顺序/验收安排/证据口径/提交与发布边界）**；客户另行给出实施授权前不派发、不写卡、不改代码。

---

## 一、任务与基线

### 1.1 目标（按客户确认的 P1.2，不扩大）

修复验收判断的提案物证路径缺陷：

1. **根因修复（`app/desktop/session.ts` `enrichAcceptanceJudgeContext`）**：`judgeContext.artifacts.proposalPath` 的取值按优先级——**pinned run 的 `documents.proposal.path` > 最新 `docs/proposals/<flowId>-proposal-vN.md`（复用既有 `readIntentEntryFacts`）> 缺失（不编造、回退不成立）**；pinned 但 manifest 无 proposal 时不回退最新扫描；pinned 路径不可读时保留该路径交给证据包，得到精确「物证不可读」并 fail-closed；别名 `<flowId>-v1.md` 不参与。
2. **文案对齐（`src/common/编排/governance-judge-facts.ts`）**：`requiredArtifactPaths` 的 `expectedProposal` 改为 `docs/proposals/<flowId>-proposal-v1.md`（flowId 缺失时「提案」），只作为缺证文案，不扫盘、不做版本选择。
3. **测试与真实回归**：新增 session 集成测试（T1/T1b/T2/T2b/T3/T4/T5）与 facts 单测；更新 `acceptance-judge-minimal` 缺证文案断言；按方案 §5.4 **方法 A** 在试跑项目上真实重发验收卡（临时移出别名、记录 sha256、验证后按原字节还原），确认判断 agent 接受且 `judge.evidence` 指向真实 `docs/proposals/textkit-cli-proposal-v1.md`。

可核对完成标准为方案 §6 **AC-1–AC-8**；其中 **AC-8 只以方法 A 为充分证据**，方法 B 仅补充；正式验收标准由内置独立验收在实施前基于同一确认版本写盘（见 §七）。

### 1.2 风险档位与验证口径：T2

方案与闸门 1 定档 **T2**：跨 `app/desktop` 与 `src/common/编排`，修改判断链的事实/物证取值，需跨模块集成与真实试跑回归；**不**改变判断规则、approve/deny/manual 条件、代批或权限语义、契约字段形状、发布面，fail-closed 不变。

**T2 验证口径**：受影响角色层测试（桌面窗口、编排）+ 跨模块集成 + `npm run typecheck`（必要时 `typecheck:renderer`、`build:renderer`）+ **真实试跑方法 A 回归**；不默认全量回归；证据不足时升档补证（升档不降档）。方案 §5.3 建议追加 `test/桌面应用/**`、`test/编排/**` 作为补充证据；若实施触及共享层或判断规则，按方案 §8.1 停止并升 T3/重开闸门。

### 1.3 本轮非目标（不得顺手扩大）

- 不改变验收卡判断规则、fail-closed 语义、代批口径（「替我决策/替我审批」语义不变）。
- 不修 `intentRel`/`reportRel` 的静态 v1 回落，不冻结 pinned `judgeContext.intentId`（R5/R10；另开需求）。
- 不修 proposal 卡自身的 artifacts 接线；不处理试跑 O1（双 BOM）/O2（`wc <file> -h`）。
- 不新增 judgeContext 字段、不改 `GovernanceJudgeRequest`/`GovernanceJudgeContext` 类型、不改判断提示词。
- **不新增第二份版本解析实现/共享助手**；不导出 `latestVersioned`；不在 `session.ts` 写 readdir/regex。
- 产品代码不创建/修改/删除试跑项目的别名文件；§5.4 方法 A 的临时移出/还原是经客户授权的**验证步骤**，不属于产品写集。
- 不 commit/push；不发布；不启动应用做「已验收」声明（真实回归属实施后验证，需实施授权）。

### 1.4 基线（写计划时实测，2026-11-01）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `feat/flow-improvements-wave1` / `eb77fadafc4df40594938798645da111665027c3`（含 shell-escalation 提交 `3a49427` 与其文档提交 `f80822d`/`eb77fad`；方案标注基线一致） |
| 主分支 | `main` / `a187d592e638f687d07837b3c949ba68421afea9`（含 PR #29 合并提交 `b7586ce` 与合并后沟通记录）；**HEAD 不包含该合并提交**，但目标文件内容与 main 一致：`git diff --stat eb77fad main -- app/desktop/session.ts src/common/编排/governance-judge-facts.ts src/common/shared/intent-entry-contract.ts` 为空。实施前如要求以 main 为基线，先 rebase/合并并重记基线（不改方案锚点） |
| 工作树（写本计划前） | 仅三份未跟踪新文档：`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`、`docs/planning/2026-11-01_design_acceptance-evidence-path.md`、`docs/planning/2026-11-01_review_acceptance-evidence-path.md`；本计划写盘后新增未跟踪 `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`。均非产品代码改动 |
| 已跟踪代码/测试改动 | 无（`git status --porcelain -- src app test` 为空） |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops |
| 环境 | Node v24.22.1 / npm 11.19.1；worktree `node_modules` 已安装；Electron 44.7.0 二进制已存在（上一轮补装）；应用当前关闭（真实回归阶段需按 B0 口径重新构建/启动） |
| 目标文件 | `app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`、`test/编排/acceptance-judge-minimal.test.ts` 存在；`test/桌面应用/acceptance-proposal-path.test.ts`、`test/编排/governance-judge-facts.test.ts` 尚不存在 |
| 共享属主 | `src/common/shared/` 唯一写入者为项目管理；`app/desktop/` 属桌面窗口；`src/common/编排/`、`test/编排/` 属编排；`test/桌面应用/` 对桌面窗口是**逐文件授权**；`test/测试/` 属测试 |

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-01）** | 沟通记录「客户原话」：客户「记录这个验收物证路径 bug 并修复」 |
| 闸门 1：方案确认 | **已确认（2026-11-01，P1.2 为唯一实施基线）** | 同上「闸门 1 记录（2026-11-01）」：客户「确认闸门 1 修复方案（T2，含方法 A 验证授权）」 |
| 闸门 2：角色指派/写集/边界变更 | **未确认** | 本计划 §九；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发、不改代码、不启动应用 |
| 实施前验收标准 | 未写盘 | 内置独立验收在闸门 2 后、实施前写 `docs/acceptance/acceptance-evidence-path-criteria-v1.md`；沟通确认路径/版本 |
| 方法 A 验证授权 | **已在闸门 1 确认** | 临时移走试跑别名 `docs/proposals/textkit-cli-v1.md`（记录 sha256，验证后按原字节还原）；仍须试跑项目所有者/客户在执行时确认现场 |
| 提交/推送 | **未授权** | 实施/验收期间不 commit/push；提交/推送另行授权 |
| 发布 | **未授权** | 不发行；无 tag/版本/构建/上传/发布说明 |

### 2.1 闸门 2 与实施授权是两个事实

- 闸门 2 确认参与角色、各自范围与写集、边界变更、档位、阶段顺序、验收安排、证据口径、提交/发布边界；实施授权是对代码实施与真实回归的授权。两者分开记录，不能互相替代。
- 闸门 1 已确认方案与方法 A **不等于**闸门 2，也不等于实施授权。
- 本计划写盘后不派发，直到：闸门 2 确认 + 实施授权 + 实施前标准写盘并经沟通确认 + §4.5 边界条目落地（人事）+ 逐角色范围预留完成。

### 2.2 客户在闸门 1 已确认/知悉的事项（本计划据此排期，不重开）

| 项 | 确认/知悉 |
| --- | --- |
| 取值优先级 | pinned manifest 路径 > 最新 `<flowId>-proposal-vN` > 缺失 fail-closed；否决静态 `-proposal-v1`、永远最新、角色自报 |
| 缺证文案 | `docs/proposals/<flowId>-proposal-v1.md`（flowId 缺失「提案」）；`manual/artifact-missing`，绝不 approve |
| 风险档位 | **T2**；若客户认为判断链属治理变更要求 T3，按 T3 重定范围 |
| 写集 | 5 文件（两处源码 + 三个测试），不新增共享助手 |
| 方法 A | **已授权**：临时移走/还原试跑别名并记录 sha256；未做则 AC-8 为 insufficient evidence |
| R9 | 无 pin 且仅 `<flowId>-v1.md` 的历史项目修复后 fail-closed；兼容另开需求 |
| R10 | 不冻结 `intentId`；最新提案改变 intentId 会因意图冲突 fail-closed，不误 approve |
| 别名处置 | 试跑别名属治理侧变通产物；验证后由试跑治理方决定归档/移除，产品代码不碰 |

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 缺陷修复落在既有职责：桌面窗口负责验收 judgeContext 的物证路径派生；编排负责 `requiredArtifactPaths` 文案与证据包消费；测试负责真实回归。没有需要不同知识/契约的新持久责任 |
| 2. 范围归属 | **现有 Section 1 覆盖；1 个新逐文件测试需精确条目；方案 §7 的角色标签需校正** | 5 个文件均映射到现有角色（§4.1）；`test/桌面应用/acceptance-proposal-path.test.ts` 是桌面窗口逐文件授权的新文件，须人事按 §4.5 补条目；方案 §7 把三个测试都写「测试」，但 `test/桌面应用/` 属桌面窗口、`test/编排/` 属编排——按实际边界校正（§10.3） |
| 3. 契约影响 | **无新字段/类型；只修正既有字段的取值来源** | `artifacts.proposalPath` 形状不变；`GovernanceJudgeContext/Request` 不变；不新增共享抽象；复用 `readIntentEntryFacts`（`src/common/shared/intent-entry-contract.ts` 的既有公开入口）；唯一 primary owner：桌面窗口（提供方）+ 编排（消费方/文案） |
| 4. 证据独立性 | **满足** | 桌面窗口/编排各自层测试；测试角色跑跨模块回归与真实试跑方法 A；内置独立验收按 P1.2 的 AC-1–AC-8 判通过/返工/证据不足；实施者不自验 |
| 5. 协调成本 | **复用现有角色最低；新增角色不划算** | 2 个实施角色（桌面窗口、编排）写集不相交可并行；测试负责真实回归；内置验收/统筹/人事按既有分权。新增「验收物证」专职角色会重复建卡/交接成本，且无持续独立责任 |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 桌面窗口 | **保留 + 调整边界**（补 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目） | `app/desktop/session.ts` 在 `app/desktop/` 目录授权内；新测试在逐文件授权目录，需 H1 精确条目；职责不变 |
| 编排 | **保留** | `src/common/编排/` 目录与 `test/编排/` 目录授权覆盖 facts 源码、新 facts 单测与 `acceptance-judge-minimal` 更新；职责不变 |
| 测试 | **保留** | B0 基线、跨模块回归、试跑真实方法 A 回归与证据；`test/测试/` 目录授权（本任务默认不新增该目录文件） |
| 项目管理（shared） | **不参与（默认）** | 只有确需导出 `latestVersioned` 或修改 `src/common/shared/intent-entry-contract.ts` 时才需要；方案明确不新增共享助手；若发生，停止并重开闸门 2/评估档位 |
| 装配 | **不参与实施** | 不改 `package.json`/构建/发布配方；真实回归使用既有构建/启动命令 |
| 人事（内置） | **闸门 2 后执行 B-1 边界条目** | 角色卡/边界/YAML/根 changelog 由人事维护；不改 id/显示名/职责描述，不扩权限 |
| 内置独立验收 | **参与**（V1 标准 / E2 判定） | 技能默认写权 `docs/acceptance/` |
| 统筹 | **参与**（本计划、派发、收证、变更包、记录） | 技能默认写权 `docs/scheduling/` |
| 沟通 | **参与**（闸门 2、方法 A 现场授权协调、回报） | `docs/communication/` |
| 产品/宣传/UIUX/各适配器/运行时核心/门禁引擎/项目独立验收 worker | **不参与** | 无写集；独立验收用内置，不用项目 worker |

### 3.3 决策表结果

**不变，派给现有角色；另需 1 项精确边界变更（职责相同，仅补精确路径）。**

- **无**新增角色、**无**拆分、**无**合并、**无**角色 id/显示名变更。
- 边界变更：**B-1** 桌面窗口 boundary.md + boundary.yaml 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目（见 §4.5）。
- 其余 4 个文件均落在既有目录授权内；不新增共享助手；不改契约形状。
- 装配不参与实施；提交/推送/发布另行授权。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有角色：桌面窗口 + 编排 + 测试 + 内置验收 + 统筹 + 人事边界条目 | **采用** | 写集一一对应、写集不相交可并行、协调成本最低 |
| B. 新增「验收物证」专职角色 | 否决 | 一次性跨两模块缺陷修复，无持续独立责任；建卡/边界/交接成本不划算 |
| C. 把 `test/桌面应用/acceptance-proposal-path.test.ts` 交给测试角色（照方案 §7 标签） | 否决 | `test/桌面应用/` 是桌面窗口**逐文件授权**，测试角色 Section 1 仅 `test/测试/`；照标签会越权。计划按实际边界归桌面窗口并加精确条目 |
| D. 把两个 `test/编排/` 测试交给测试角色（照方案 §7 标签） | 否决 | `test/编排/` 是编排目录授权；测试角色只写 `test/测试/`。计划归编排 |
| E. 为版本解析新增共享助手/导出 `latestVersioned` | 否决（默认） | 方案明确复用 `readIntentEntryFacts`，不新增第二份实现；确需时停止重开闸门 2/评估 T3 |
| F. 真实回归用方法 B 替代方法 A | 否决 | 方法 B 不经过 `enrichAcceptanceJudgeContext`，别名存在时旧代码也可通过；AC-8 只以方法 A 为充分证据（复核 F1） |
| G. 关闭「替我决策」由客户手批作为回归证据 | 否决 | 不经过判断链，不能证明路径修复 |
| H. 同时修 `intentRel`/`reportRel` 或冻结 pinned intentId | 否决 | 方案 §9 非目标；另开需求，避免扩大写集/档位 |

### 3.5 协调成本与关键排序（结论）

- **并行**：A1（桌面窗口）与 A2（编排）写集不相交，可在 H1/V1/B0 后并行；`test/桌面应用/` 新文件必须在 H1 后创建。
- **串行**：V1+B0 → A1/A2 → D1（跨模块回归）→ D2（真实试跑方法 A）→ E1 → E2 → E3；真实回归依赖修复候选与可启动构建。
- **共享文件单写者**：`app/desktop/session.ts`、`test/桌面应用/**` 只由桌面窗口写；`src/common/编排/governance-judge-facts.ts`、`test/编排/**` 只由编排写；`src/common/shared/**` 默认只读；测试角色不写产品/其他角色测试。
- 角色名不同不代表写集不同；按精确路径预留，不并发写同一文件。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-11-01 核对，HEAD `eb77fad`）

| 方案 §7 路径 | 所属角色（按实际 Section 1） | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | 桌面窗口 | `角色卡/桌面窗口/boundary.md`「目录 `app/desktop/`」 | 是（A1） |
| `test/桌面应用/acceptance-proposal-path.test.ts`（新增） | 桌面窗口 | 「单文件 `test/桌面应用/…`」逐文件授权；**未列，需 H1 新增** | 是（A1，H1 后） |
| `src/common/编排/governance-judge-facts.ts` | 编排 | `角色卡/编排/boundary.md`「目录（私有）`src/common/编排/`」 | 是（A2） |
| `test/编排/governance-judge-facts.test.ts`（新增） | 编排 | 「目录（测试）`test/编排/`」 | 是（A2） |
| `test/编排/acceptance-judge-minimal.test.ts`（更新） | 编排 | 「目录（测试）`test/编排/`」 | 是（A2） |
| `test/桌面应用/acceptance-evidence.test.ts`、`run-pin.test.ts` | 桌面窗口 | 既有逐文件条目 | **否**（回归只读；不改） |
| `test/编排/decision-evidence-packet.test.ts`、`workflow-preconditions.test.ts` | 编排 | 目录（测试） | **否**（回归只读；不改） |
| `src/common/shared/intent-entry-contract.ts` | 项目管理（shared 唯一写入者） | `src/common/shared/` 目录（项目管理） | **否（默认）**；仅确需导出 `latestVersioned` 时由项目管理参与并重开闸门 2/评估档位 |
| 试跑项目 `docs/proposals/textkit-cli-v1.md` 临时移出/还原 | 试跑项目所有者/客户授权；**非产品写集** | 方案 §5.4 方法 A 验证步骤 | 验证动作（D2），不属产品写集 |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1/E2） |
| `docs/scheduling/` | 统筹 | 技能默认写权 | 是（本计划、变更包） |
| `docs/communication/` | 沟通 | 沟通写权 | 是（闸门 2 记录） |
| `docs/planning/` | 策划 | 策划写权 | 否（只引用） |

### 4.2 共享属主核对（不猜）

- `src/common/shared/`：**项目管理唯一写入者**。方案 §7 把 `intent-entry-contract.ts` 写成「归属运行时核心/编排共享」与实际边界不符——若需修改该文件，必须由**项目管理**参与并更新团队计划/写集，不能由编排或运行时核心直接写。本计划默认不修改。
- `app/desktop/`、`app/main.ts`、`app/preload.cjs`：桌面窗口；本任务只改 `session.ts`。
- `src/common/编排/`、`test/编排/`：编排；`test/桌面应用/`：桌面窗口逐文件；`test/测试/`：测试目录。四者互不重叠。
- `GovernanceJudgeContext/Request.artifacts` 形状不变；不新增字段/类型；`readIntentEntryFacts` 为只读公开入口，不新增实现。
- 试跑项目文件不是产品候选；方法 A 的移出/还原须记录 sha256 并由试跑所有者/客户现场确认，验证后按原字节还原。

### 4.3 逐角色精确写集与可观察交付

#### 桌面窗口（A1）

- **写集**：
  - `app/desktop/session.ts`：`enrichAcceptanceJudgeContext` 内按 §2.2 计算 `proposalRel`（pinned `documents.proposal.path` > `readIntentEntryFacts({projectRoot, flowId}).proposalPath` > undefined）；显式覆盖 `baseContext?.artifacts` 的旧值；不新增 IO/缓存/import；不改 `intentRel`/`reportRel`/判断规则。
  - **新增** `test/桌面应用/acceptance-proposal-path.test.ts`（H1 后）：自包含最小夹具（`docs/product/focus-intent-v1.md`、`docs/intents/<intentId>.md`、`docs/proposals/*`、`docs/quality/focus-report-v1.md`、最小项目 listing；`writeRunManifest` 写最小 pinned manifest）；覆盖 T1（pinned v2 + 磁盘 v3 → v2）、T1b（pinned 无 proposal null/缺失/空串 → undefined，不扫描）、T2（无 pin v1/v2/v3 → v3，不等于别名）、T2b（无 pin 仅别名 → undefined）、T3（无提案 → undefined、继承旧值被覆盖；拼 `GovernanceJudgeRequest` 调 `buildDecisionEvidencePacket`，断言 `ok=false`、`reasonCode=artifact-missing`、reason 含 `docs/proposals/<flowId>-proposal-v1.md` 且不含 `-v1.md` 别名）、T4（试跑形状 pinned 真提案 + 别名 → 证据包含真路径/不含别名）、T5（pinned 路径不可读 → `artifact-missing`、detail「物证不可读：<pinned path>」、不回退）。
  - 自身 `docs/change/` 记录、`api-spec.md`/`memo.md`（按需）。
- **不写**：`app/main.ts`、`app/preload.cjs`、其他 `app/desktop/` 文件、`src/**`、其他角色测试、`test/桌面应用/acceptance-evidence.test.ts`/`run-pin.test.ts`（保持不变）、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML。
- **可观察交付**：pinned/最新/缺失/别名/不可读五类行为；新测试全过；`acceptance-evidence.test.ts`、`run-pin.test.ts` 既有断言不变且通过；`npm run typecheck` 0；候选哈希。

#### 编排（A2）

- **写集**：
  - `src/common/编排/governance-judge-facts.ts`：`expectedProposal = flowId !== undefined ? \`docs/proposals/${flowId}-proposal-v1.md\` : "提案"`；同步更新函数上方注释（不扫盘；实际路径由 app 传入；与 `mechanical-rejection`/`workflow-preconditions`/`governance-judge-prompt` 同一命名）；`expectedQualityReport` 不变。
  - **新增** `test/编排/governance-judge-facts.test.ts`：`requiredArtifactPaths` 对 acceptance/proposal 缺 proposal 时 `missingPaths` 恰为 `docs/proposals/focus-proposal-v1.md`；flowId 缺失为「提案」；任何结果不含 `docs/proposals/focus-v1.md`。
  - 更新 `test/编排/acceptance-judge-minimal.test.ts`：既有「物证缺失/未读 ⇒ manual」用例增加 reason 含正确路径、不含旧路径；既有断言保持原样。
  - 自身 `docs/change/`、`api-spec.md`/`memo.md`（按需）。
- **不写**：`src/common/shared/**`、`app/**`、`test/桌面应用/**`、其他角色测试、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML。
- **可观察交付**：facts 纯函数文案正确；`acceptance-judge-minimal` 更新后既有断言不弱化；`test/编排/**` 相关套件通过；`npm run typecheck` 0；候选哈希。

#### 测试（B0/D1/D2）

- **写集**：本任务默认不写产品/测试源码；证据写 `角色卡/测试/docs/change/`。若需新增 `test/测试/` 用例，先回报统筹并确认写集/闸门 2（默认不加）。
- **B0**：HEAD/工作树、Node/npm、`node_modules`/Electron、`npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`）、受影响套件基线（`test/桌面应用/acceptance-evidence.test.ts`、`run-pin.test.ts`、`test/编排/acceptance-judge-minimal.test.ts`、`decision-evidence-packet.test.ts`、`workflow-preconditions.test.ts`）；应用当前关闭，记录现场与重启方式。
- **D1**：修复候选后跑方案 §5.3 受影响测试 + `test/桌面应用/**`、`test/编排/**` 补充；`npm run typecheck`（必要时 typecheck:renderer/build）；计数/失败分类/候选哈希；不把 T2 证据虚报为全量回归。
- **D2（真实回归方法 A）**：在试跑项目 `C:\Users\51054\Desktop\work\trial-shell-escalation`、pinned run `run-20261101-textkit-cli-87325f96`、与试跑相同 runtime、「替我审批/替我决策」开启下：
  1. 记录别名 `docs/proposals/textkit-cli-v1.md` 的 sha256（并记录真实提案 `textkit-cli-proposal-v1.md` sha256 `a2bdbee2…`）；
  2. 将别名临时移出 `docs/proposals`（不参与扫描的目录；记录位置）；
  3. 以修复候选重新构建/启动应用，重新发起验收卡；
  4. 断言新 `request.resolved` 为 `by=judge`、`choice=accept`、`judge.reasonCode=sufficient`，`judge.evidence` 含 `docs/proposals/textkit-cli-proposal-v1.md` 且不含别名、无「物证不可读」；
  5. 验证后按原字节还原别名并复核 sha256；记录请求 id/时间/候选版本/试跑项目与 run id；
  6. 若试跑项目生命周期不允许重新发起验收卡，停止并回报沟通/客户，不伪造结果；方法 B 只能作补充，不能单独判 AC-8 pass。
- **不写**：产品源码、其他角色测试、角色卡/边界、试跑项目产品文件（除方法 A 经授权的别名临时移出/还原）、`docs/scheduling|acceptance|communication`。

#### 人事（H1）

- 按闸门 2 确认，在 `角色卡/桌面窗口/boundary.md` 与 `boundary.yaml` 新增精确单文件条目 `test/桌面应用/acceptance-proposal-path.test.ts`（用途：验收 judgeContext proposalPath 派生：pinned/最新/缺失/别名/不可读），并在桌面窗口根 `changelog.md` 记录；不改 id/显示名/职责描述，不扩其它权限。其余角色无边界变更。

#### 内置独立验收 / 统筹 / 沟通

- 内置独立验收：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（V1，AC-1–AC-8，不弱化 P1.2 §6）、`docs/acceptance/acceptance-evidence-path-report-v1.md`（E2）。
- 统筹：`docs/scheduling/`（本计划、`acceptance-evidence-path-change-v1.md` 变更包、memo）。
- 沟通：`docs/communication/` 闸门 2 记录、方法 A 现场授权协调、提交/推送授权（另行）。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹；`docs/acceptance/`：内置独立验收；`docs/communication/`：沟通；`docs/planning/`：策划；`角色卡/**` 边界/YAML/changelog：人事。worker 不写这些路径。

### 4.5 精确边界变更清单（闸门 2 对象，由人事执行）

| # | 角色 | 治理文件 | 变更内容（精确） | 现状与依据 | 性质 |
| --- | --- | --- | --- | --- | --- |
| B-1 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `boundary.yaml` | 新增精确单文件测试条目 `test/桌面应用/acceptance-proposal-path.test.ts`，用途：主进程侧测试——验收 judgeContext 的 proposalPath 派生（pinned manifest 优先/最新 `-proposal-vN`/缺失 fail-closed/别名不选/不可读不回退）；yaml 附 Delta 注释（如 `# --- Delta-AEP-1（2026-11-01，团队计划 §4.5；闸门 2）：test/桌面应用/ 新增 1 个精确测试文件（acceptance-proposal-path），逐文件授权 ---`） | `test/桌面应用/` 对桌面窗口是**逐文件授权**；两文件均未列该新文件；方案 §5.1/§7 要求新增 | 新增精确路径（职责相同）；不改 id/显示名；不扩其它权限 |

- 人事执行后核对 md/yaml 一致、无其它未列改动、根 changelog 记录；不重写 role-card；不改职责。
- **除 B-1 外没有其它边界变更**：`app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`、`test/编排/` 两个文件均在既有目录/单文件授权内。
- 若实施需要改 `src/common/shared/intent-entry-contract.ts`（导出 `latestVersioned`）或新增共享助手：**停止**，按 §10 重开闸门 2（项目管理参与）并重新评估档位；不在本 B-1 内。

### 4.6 工作量与范围预留

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 桌面窗口 | 1 个源码文件 + 1 个新测试（T1/T1b/T2/T2b/T3/T4/T5）+ 证据 | A1 独占 `app/desktop/session.ts`、`test/桌面应用/acceptance-proposal-path.test.ts`（H1 后） |
| 编排 | 1 个源码文件 + 1 个新测试 + 1 个既有测试更新 + 证据 | A2 独占 `src/common/编排/governance-judge-facts.ts`、`test/编排/governance-judge-facts.test.ts`、`test/编排/acceptance-judge-minimal.test.ts` |
| 测试 | B0 + D1 + D2 真实回归与证据 | B0/D1/D2 独占 `角色卡/测试/docs/change/` 记录；不写产品/其他角色测试 |
| 人事 | 1 项边界条目 + 1 个根 changelog | H1（闸门 2 后） |
| 内置验收 | 1 标准 + 1 报告 | V1/E2 |
| 统筹 | 本计划 + 变更包 + memo | E1/E3 |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；A1/A2 可并行但不得写对方路径；D1/D2 只读候选并取证，不改产品。

---

## 五、阶段、依赖与并行组

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、写集、B-1、T2、顺序、验收安排、证据口径、提交/发布边界）；实施授权记录（分开） | 本计划写盘 |
| H1 | 边界变更 | 人事 | B-1 精确条目落地（md/yaml 一致）+ 桌面窗口根 changelog | G2 |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/acceptance-evidence-path-criteria-v1.md`：AC-1–AC-8 不弱化、T2 依据与升档条件、证据计划、判定规则、版本冻结；经沟通确认 | G2（可与 H1/B0 并行） |
| B0 | 基线 | 测试 | HEAD/工作树、Node/npm、node_modules/Electron、typecheck/build、受影响套件基线、应用关闭与启动方式 | G2（可与 H1/V1 并行） |
| A1 | 桌面窗口修复 | 桌面窗口 | `session.ts` 派生修复 + 新测试 T1/T1b/T2/T2b/T3/T4/T5 + 既有 acceptance-evidence/run-pin 回归；typecheck | H1 + V1 + B0 + 实施授权 |
| A2 | 编排文案 | 编排 | `governance-judge-facts.ts` 文案 + 新 facts 单测 + `acceptance-judge-minimal` 更新；typecheck | V1 + B0 + 实施授权（与 A1 并行） |
| D1 | 跨模块回归 | 测试 | 方案 §5.3 受影响测试 + `test/桌面应用/**`、`test/编排/**` 补充；typecheck/必要 build；计数/失败分类/候选哈希 | A1 + A2 |
| D2 | 真实试跑方法 A | 测试（桌面窗口按需支持构建/启动） | 别名移出/还原 sha256；新 `request.resolved`（judge accept、evidence 指向真提案、无「物证不可读」）；请求 id/时间/候选/run id | D1 + 方法 A 现场授权 |
| E1 | 变更包 | 统筹 | `docs/scheduling/acceptance-evidence-path-change-v1.md`：候选哈希、改动路径、节点、证据、T2 | D1 + D2 |
| E2 | 独立验收 | 内置独立验收 | `docs/acceptance/acceptance-evidence-path-report-v1.md`：AC-1–AC-8 逐项；AC-8 只按方法 A；通过/返工/证据不足 | E1 |
| E3 | 放行/回报 | 统筹 → 沟通 | 按匹配当前候选的结论记录/放行/回报；提交/推送另行授权；不发行 | E2 |

### 5.2 依赖要点

- **必须串行**：G2 → H1（新测试条目先于 A1）；V1/B0 → A1/A2；A1+A2 → D1（跨模块回归基于同一候选）；D1 → D2（真实回归基于修复候选与可启动构建）；D2 → E1 → E2 → E3。
- **可并行**：H1/V1/B0 互不写同一路径；A1（桌面窗口）与 A2（编排）写集不相交；D1 内 `test/桌面应用` 与 `test/编排` 可并行但同一候选；D2 与 E1 的部分证据整理可并行，但 E1 必须等 D2 完成。
- **不允许**：A1 在 H1 前创建 `test/桌面应用/acceptance-proposal-path.test.ts`；任何角色写 `src/common/shared/`/角色卡/其他角色测试/docs 管理区；并发写 `app/desktop/session.ts` 或 `governance-judge-facts.ts`；关闭「替我决策」或方法 B 替代 AC-8。

### 5.3 各节点入口/出口条件（验收门与证据）

- **G2 入口**：本计划写盘。**出口**：闸门 2 确认记录覆盖本计划、参与角色、精确写集、B-1、T2、顺序、验收安排、证据口径、提交/发布边界；实施授权另行齐备。
- **H1 入口**：G2。**出口**：B-1 在 md/yaml 一致落地；桌面窗口 changelog 记录；无其它 diff；人事报告条目与哈希。
- **V1 入口**：G2。**出口**：AC-1–AC-8 标准、T2 依据/升档条件、证据计划、判定规则、版本冻结；不弱于方案 §6；沟通确认路径/版本；未确认不派实施。
- **B0 入口**：G2。**出口**：基线命令/环境/计数/失败分类；确认无产品代码改动（除未跟踪管理文档）；记录应用关闭与启动方式、Electron/node_modules。
- **A1 入口**：H1 + V1 + B0 + 实施授权。**出口**：session.ts 按 §2.2/§3.1 修复；新测试 T1/T1b/T2/T2b/T3/T4/T5 全过；既有 `acceptance-evidence`/`run-pin` 不改且通过；`npm run typecheck` 0；候选哈希/diff/status；写集外改动=无。
- **A2 入口**：V1 + B0 + 实施授权。**出口**：facts 文案修正 + 新 facts 单测 + `acceptance-judge-minimal` 更新；相关套件通过；typecheck 0；候选哈希；写集外改动=无。
- **D1 入口**：A1+A2 退出。**出口**：方案 §5.3 命令全过；`test/桌面应用/**`/`test/编排/**` 补充结果；typecheck（必要 build）0；计数/失败分类/候选哈希；若其他角色测试失败，只报告不修改。
- **D2 入口**：D1 退出 + 方法 A 现场授权。**出口**：别名移出/还原 sha256 一致；新 `request.resolved` 为 judge accept、`judge.evidence` 含真实提案、无「物证不可读」；请求 id/时间/候选/run id/试跑项目；方法 B 只作补充；不做/不能做则 AC-8 insufficient evidence。
- **E1 入口**：D1+D2。**出口**：变更包候选可复算、路径/节点/证据/T2 齐全。
- **E2 入口**：E1。**出口**：AC-1–AC-8 逐项结论；AC-8 只按方法 A；总体通过/返工/证据不足。
- **E3 出口**：只表示当前候选满足标准；不授权提交/推送/发布；提交/推送另行授权。

### 5.4 失败、返工与恢复

- 失败阻止依赖节点；独立且已授权工作可继续。
- 返工交原所有者（产品代码归桌面窗口/编排；共享归项目管理；测试复测）；验收结论不由统筹改写。
- 候选/契约/标准/边界变化使受影响证据失效；不得只改哈希让旧证据冒充当前结果。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。

---

## 六、证据要求

### 6.1 通用证据（每个实施角色）

1. **写前基线**：目标文件 `git hash-object` + `sha256sum`、HEAD、`git status --short`；与本计划不一致停止。
2. **候选身份**：逐文件 before/after blob+sha256（工作区；CRLF/LF 分别记录）；新增文件同。
3. **改动范围**：`git diff --name-only`/`git status --short` 必须在写集内；`git diff --cached` 为空；无授权外已跟踪变化。
4. **原始输出**：命令、退出码、环境（Node/OS）、测试计数（pass/fail/skip/todo）、失败原文；跳过项原因。
5. **状态行**：完成未验收写 `implemented-unverified`。
6. **纪律**：不 commit/push；不改断言保绿；不新增 skip；不伪造输出；Windows 既有失败按 B0 分类。

### 6.2 逐角色检查命令（最低要求）

| 角色 | 命令 | 证据 |
| --- | --- | --- |
| 桌面窗口 | `node --test --test-concurrency=1 test/桌面应用/acceptance-proposal-path.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/run-pin.test.ts`；`npm run typecheck` | T1/T1b/T2/T2b/T3/T4/T5 计数；既有断言不变；typecheck；候选哈希 |
| 编排 | `node --test --test-concurrency=1 test/编排/governance-judge-facts.test.ts test/编排/acceptance-judge-minimal.test.ts test/编排/decision-evidence-packet.test.ts test/编排/workflow-preconditions.test.ts`；`npm run typecheck` | facts 文案；minimal 缺证断言；既有断言不变；typecheck；候选哈希 |
| 测试（D1） | 方案 §5.3 全套；`node --test "test/桌面应用/**"`、`node --test "test/编排/**"` 补充；`npm run typecheck`（必要 `typecheck:renderer`/`build:renderer`） | 计数/失败分类/候选哈希；不虚报全量 |
| 测试（D2） | 真实应用构建/启动 + 试跑项目重发验收卡（方法 A） | 别名移出/还原 sha256；`tasks.jsonl` 新记录（id/时间/by/choice/reasonCode/judge.evidence）；候选/run id/试跑项目；无「物证不可读」 |
| 人事 | 边界 md/yaml 一致性检查 | B-1 条目/changelog/哈希 |
| 内置验收 | 按 V1/AC 核对 | 标准/报告 |

### 6.3 T2 验证口径

- 受影响层测试 + 跨模块集成 + typecheck（必要 typecheck:renderer/build）+ 真实试跑方法 A；不默认全量回归；方案 §5.3 建议追加 `test/桌面应用/**`、`test/编排/**` 作为补充。
- 若证据不足以建立跨模块/真实回归结论（候选不可复算、方法 A 缺失、alias 还原不一致），升档补证或判 `insufficient evidence`；升档不降档。
- 方法 B 只补充，不单独判 AC-8 pass；关闭「替我决策」/客户手批不能作为修复证据。

---

## 七、独立验收安排

### 7.1 实施前完成标准（V1）

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 后、实施前；可与 H1/B0 并行。
- **路径**：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`。
- **基线**：客户在闸门 1 确认的 P1.2（396 行 / `355cbf1c…`）+ 闸门 0 意图记录；团队计划只作范围/写集/阶段/证据口径依据。
- **内容**：AC-1–AC-8 验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T2 依据与升档条件、证据计划、判定规则（pass/fail/insufficient evidence/not applicable）、证据复用/失效规则、版本冻结。
- **不得弱于**方案 §6；AC-8 必须以方法 A 为唯一充分方法；方法 B 只补充；未获方法 A 授权/未执行时 AC-8 判 insufficient evidence，不得 pass。
- **冻结**：实施开始后不改标准适配候选；确需变更递增版本并交沟通/统筹确认。

### 7.2 验收要点（V1 细化）

| 验收项 | 主要证据 |
| --- | --- |
| AC-1 pinned 优先/无 proposal 不回退 | T1/T1b 输出；证据包读取路径 |
| AC-2 无 pin 最新版本/别名不选 | T2/T2b 输出 |
| AC-3 无提案缺失/文案 | T3（含 `buildDecisionEvidencePacket`）输出 + facts 断言 |
| AC-4 `requiredArtifactPaths` 文案 | facts 单测输出 |
| AC-5 试跑形状证据包路径/sha | T4 输出 |
| AC-6 pinned 不可读 fail-closed | T5 输出 + `governance-judge.ts:324-339` 既有控制流（本修复未改） |
| AC-7 无回归/写集 | typecheck + 受影响测试 + diff/哈希 |
| AC-8 真实方法 A | 别名移出/还原 sha256 + 新 `request.resolved`/judge.evidence/候选/run id |

### 7.3 变更包与判定

- 统筹在 D1+D2 后写 `docs/scheduling/acceptance-evidence-path-change-v1.md`：候选哈希（产品/测试）、改动路径、节点 G2–E3、证据链接、T2、复用/失效说明。
- 内置独立验收按 V1 与变更包判定；报告 `docs/acceptance/acceptance-evidence-path-report-v1.md`；结论只能通过/返工/证据不足。
- 验收通过只表示当前候选满足标准，不授权提交/推送/发布。

---

## 八、发布、提交与授权边界

- **不发行**：本任务不写 `package.json`/`package-lock.json`/构建配置/发布配方/`release-policy.mjs`；不打 tag、不升版本、不构建/上传发布包、不写发布说明。
- **不 commit/push**：实施/验收期间工作树证据为准；提交/推送需客户另行授权，由沟通按仓库惯例执行（实施角色与统筹不自行提交）。
- 真实回归需要构建/启动应用，属实施后验证步骤（客户实施授权后）；不把启动应用当作验收通过。
- 试跑项目别名移出/还原是方法 A 的验证步骤，不属于产品写集；产品代码不创建/修改/删除别名。

---

## 九、闸门 2 待客户确认项

1. **参与角色**：桌面窗口（`session.ts` 根因 + 新 session 测试）、编排（facts 文案 + facts 单测 + minimal 更新）、测试（B0/D1/D2 真实回归）、人事（B-1 边界条目）、内置独立验收（V1/E2）、统筹（计划/派发/变更包）；**装配不参与实施**；项目管理（shared）默认不参与；产品/宣传/UIUX/运行时核心/门禁引擎/各适配器/项目独立验收 worker 不参与。
2. **精确写集**：桌面窗口 `app/desktop/session.ts` + 新增 `test/桌面应用/acceptance-proposal-path.test.ts`（H1 后）；编排 `src/common/编排/governance-judge-facts.ts` + 新增 `test/编排/governance-judge-facts.test.ts` + 更新 `test/编排/acceptance-judge-minimal.test.ts`；测试不写产品/其他角色测试；任何 `src/common/shared/**` 改动不在默认写集。
3. **边界变更 B-1**：桌面窗口 `boundary.md` + `boundary.yaml` 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目（用途见 §4.5）；**无**新增/拆分/合并角色、无 id/显示名/权限变更；其余 4 文件在既有目录授权内。
4. **角色标签校正**：方案 §7 把三个测试都写「测试」、并把 `intent-entry-contract.ts` 写「运行时核心/编排共享」；按实际 Section 1，`test/桌面应用/` 归桌面窗口（逐文件）、`test/编排/` 归编排、`src/common/shared/` 归项目管理。本计划按实际边界分配；若客户坚持方案 §7 标签，需另行授权测试/项目管理的目录写权并重开闸门 2（不推荐）。
5. **风险档位**：**T2**（客户已在闸门 1 确认）；若实施发现需改判断规则/代批权限/契约形状/共享层，停止并升 T3/重开闸门。
6. **阶段顺序**：G2 → H1/V1/B0 → A1/A2（并行）→ D1 → D2 → E1 → E2 → E3；A1 必须在 H1 后创建新测试；A1/A2 写集不相交。
7. **验收安排**：内置独立验收；V1 先于实施、基于 P1.2、AC-1–AC-8 不弱化；**AC-8 只以方法 A 为充分证据**，方法 B 仅补充；未执行/未获授权时 AC-8 判 insufficient evidence。
8. **方法 A 执行授权**：客户已在闸门 1 授权（临时移走/还原别名并记 sha256）；执行时仍需试跑项目所有者/客户现场确认；验证后按原字节还原并复核 sha256；产品代码不碰别名。
9. **证据口径**：T2 受影响层 + 跨模块 + typecheck（必要 build）+ 真实方法 A；提交前不 commit/push；不发行；管理记录不混入产品候选；`app/renderer/dist/` 忽略产物非候选。
10. **实施授权与闸门 2 分开**：客户可先确认角色/写集/边界，再另行给实施授权；本计划写盘后不派发。
11. **基线**：工作树 HEAD `eb77fad`（方案基线）；main `a187d59`（含合并 `b7586ce`）与 HEAD 的目标文件内容一致；若客户要求实施前先 rebase/合并 main，先重记基线并确认不改变方案锚点。
12. **R9/R10 披露**：无 pin 且仅别名 `<flowId>-v1.md` 的历史项目修复后 fail-closed；不冻结 `intentId`；最新提案改 intentId 会 fail-closed 不误 approve；客户已在闸门 1 知悉。
13. **共享层条件**：若实施确需导出 `latestVersioned`/改 `src/common/shared/intent-entry-contract.ts`，停止并重开闸门 2（项目管理参与）并重新评估档位；不得在 `session.ts` 另写扫描。
14. **不发行**：提交/推送另行授权；发布不属本任务。

---

## 十、风险、开放点与不一致点

### 10.1 主要风险

1. **别名掩盖回归**：试跑项目已有 `textkit-cli-v1.md`，不移动别名旧代码也会通过；方法 A 是唯一充分证据（复核 F1）。缓解：D2 严格执行移出/还原并记录 sha256。
2. **真实回归生命周期**：第三次验收已 judge accept；试跑项目是否允许再次发起验收卡未验证（复核限制）。缓解：D2 先确认现场；不允许则停止回报，不伪造。
3. **共享层诱惑**：若 `readIntentEntryFacts` 不适用或需导出 `latestVersioned`，可能扩大写集/档位。缓解：方案 §2.5 唯一替代是同一共享文件导出；停止并重开闸门 2。
4. **intentId 假设**：pinned 只冻结 proposalPath，`run-role.ts` 仍解析最新 intentId；最新提案改 intentId 会 fail-closed，不误 approve（R10）。已在闸门 1 披露。
5. **历史仅有 `<flowId>-v1.md` 项目**：修复后无 pin 时 fail-closed（R9）；兼容另开需求。
6. **测试覆盖**：T1b/T2b/T3/T4/T5 必须覆盖分支；若实现误回退最新/别名，测试须能发现。
7. **真实回归应用版本**：需修复候选构建/启动，且与试跑相同 runtime；B0 记录现场与启动方式。
8. **写集越界**：`test/桌面应用/` 新文件必须 H1 后；`src/common/shared/**` 默认只读；任何越界停止。
9. **无 task_ops**：不伪造机器状态；证据以文件/原始输出为准。
10. **T2 证据不足**：若 D1/D2 证据不覆盖 AC，按验收判 insufficient evidence，升档补证；不降档。

### 10.2 开放点

1. **方案 §7 角色标签校正**（见 §4.2/§10.3）：默认按实际边界；若客户要求按 §7，需改计划并重开闸门 2。
2. **方法 A 现场**：试跑项目所有者/客户现场确认、应用重启、验收卡重发可行性；未确认前 D2 不启动。
3. **试跑别名处置**：验证后由试跑治理方决定归档/移除；产品不改。
4. **基线**：HEAD `eb77fad` vs main `a187d59`（合并 `b7586ce`）目标文件一致；是否 rebase/合并由实施授权时确认；不改变方案锚点。
5. **测试角色是否新增 `test/测试/` 用例**：默认不新增；若需跨层 E2E 用例，先回报并确认写集/闸门 2。
6. **`readIntentEntryFacts` 适用性**：A1 实施中若发现不可用，按方案 §2.5 唯一替代处理；不得另写扫描。

### 10.3 与方案 §7 写集/角色标签的不一致点（如实记录）

1. **`test/桌面应用/acceptance-proposal-path.test.ts`**：方案 §7 归「测试」；实际 `test/桌面应用/` 是桌面窗口**逐文件授权**，测试角色 Section 1 仅 `test/测试/`。本计划归**桌面窗口**，并由人事在 B-1 加精确条目；写集 5 文件不变。
2. **`test/编排/governance-judge-facts.test.ts` 与 `test/编排/acceptance-judge-minimal.test.ts`**：方案 §7 归「测试」；实际 `test/编排/` 是编排目录授权。本计划归**编排**；写集不变。
3. **`src/common/shared/intent-entry-contract.ts`**：方案 §7 写「归属运行时核心/编排共享」；实际 `src/common/shared/` 唯一写入者为**项目管理**。默认不修改；若需修改，须项目管理参与并重开闸门 2（不是运行时核心/编排直接写）。
4. 除上述标签外，方案 §7 的 5 文件、改动性质与非目标与团队判断一致；无其它写集不一致。

---

## 十一、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`）。
- **未确认**：闸门 2（参与角色/写集/B-1/T2/顺序/验收安排/证据口径/提交与发布边界）与客户实施授权。
- **未写盘**：实施前验收标准（由内置独立验收在闸门 2 后写 `docs/acceptance/acceptance-evidence-path-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、真实回归、提交、推送、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未启动应用；未联系客户。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权 → 内置独立验收写标准（V1）→ 人事执行 B-1 → 按 §五顺序派发。若客户改变方案/写集/边界或档位，重开闸门 1/2；本上下文不自行判断客户同意，不扩大授权。
