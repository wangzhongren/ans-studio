# 验收完成标准：验收判断的提案物证路径修复（acceptance evidence proposal path）——实施前标准 v1

- 风险档位：**T2**（客户在闸门 1 确认；跨 `app/desktop` 与 `src/common/编排` 的缺陷修复；不改判断规则、fail-closed 语义、代批口径、`GovernanceJudgeContext/Request` 契约字段形状与发布面）。升档条件按方案 P1.2 §8.1；升档不降档。
- 判定依据：客户闸门 0/1/2 与实施授权记录 `docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（写标准时 **76 行** / SHA-256 `a95baf85a7e2807be7069806ab838a7e0bc75df3e8652a32f87040d82b36d237`，含闸门 0、闸门 1（含方法 A 验证授权）、闸门 2、实施授权记录；该文件是沟通管理记录、可能继续追加，引用其确认小节而不引用固定行号；历史快照：闸门 0 写盘 **53 行** / `e97b978b7be485679d94568e96058f3f03096600fa63384b8683c313b21fe53e`，团队计划写盘时 **61 行** / `47b9b707e401f772b0f4cee12ab84f0574d1ce91c613e9c0e5f108ba5a51d87d`，不混用）；客户在闸门 1 确认的方案 **P1.2** `docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）的 §2.2（取值优先级）、§2.4（缺证文案）、§3（精确改法）、§5（测试计划）、§6（AC-1–AC-8）、§7（写集）、§8（风险档位/回滚）、§9（非目标）；独立复核 `docs/planning/2026-11-01_review_acceptance-evidence-path.md`（**124 行** / `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6`，F1–F11 与 N1 已闭合，结论「建议提交客户确认」）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）§1.2（T2 验证口径）、§4（写集/边界）、§5（阶段）、§6（证据要求）、§7（验收安排）、§9（闸门 2 项）。本文件的 AC 不得弱于方案 §6；团队计划只作范围、写集、阶段、证据口径依据，不是标准来源。
- 选定检查：**T2 口径**——受影响角色层测试（桌面窗口、编排）+ 跨模块集成证据（session 派生经 `buildDecisionEvidencePacket` 的端到端断言）+ `npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`）+ **真实试跑方法 A**；不默认全量回归（见 §六）。方案 §5.3 建议追加的 `test/桌面应用/**`、`test/编排/**` 按团队计划 D1 作为补充证据，不虚报为全量回归。
- 录屏与截图：**不要求录屏**。方案未把截图或录屏列为 AC-1–AC-8 的证据；不得以缺少录屏或缺少截图判 `fail` 或 `insufficient evidence`（2026-10-27 客户规则：验收证据最多使用截图，不得要求或提供录屏/屏幕录像）。AC-8 的 `tasks.jsonl` 原始记录、命令输出与 sha256 是必需证据，不能用截图替代。
- 复用证据：仅同一候选、同一输入/依赖/夹具、同一命令、同一配置的证据可复用；候选、输入、依赖、契约、夹具或构建变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用其它变更的证据替本变更背书。
- 任务 ID / flowId：`2026-11-01-acceptance-evidence-path` / `acceptance-evidence-path`。
- 标准路径 / 版本 / 日期：`docs/acceptance/acceptance-evidence-path-criteria-v1.md` / **v1** / **2026-11-01**（实施前冻结）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准，不判定候选；写盘时**未实施、未测试、未验收**——HEAD `eb77fad` 仍是旧错误路径实现（`app/desktop/session.ts:3883`、`src/common/编排/governance-judge-facts.ts:181`），两个新测试文件尚不存在（只读核对见 §1.4）。
- 验收报告：**另写 `docs/acceptance/acceptance-evidence-path-report-v1.md`，本文件不是报告**。报告由独立验收在实施后按本标准与统筹变更包判定，结论只能是通过/返工/证据不足。
- 适用变更：仅本任务（验收判断的提案物证路径修复）。提交/推送/合并/发布不属本任务，也不因验收通过而授权（团队计划 §八）。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-01） | 沟通记录「客户原话」：客户「记录这个验收物证路径 bug 并修复」；闸门 0 写盘快照 53 行 / `e97b978b…` |
| 闸门 1：方案确认 | 已确认（2026-11-01，P1.2 为唯一实施基线） | 沟通记录「闸门 1 记录」：客户原话「确认闸门 1 修复方案（T2，含方法 A 验证授权）」；方案 P1.2 396 行 / `355cbf1c…`；复核 124 行 / `25bc602e…` |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收安排/证据口径 | 已确认（2026-11-01） | 沟通记录「闸门 2 记录」：客户原话「确认闸门 2：参与角色、写集与边界条目」；团队计划 431 行 / `94f80cff…` §九 |
| 客户实施授权 | 已给（2026-11-01） | 沟通记录「实施授权记录」：客户原话「授权开始实施」；范围限 P1.2 方案与团队计划，**提交/推送/合并/发行不在本次授权内**（另行授权） |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-11-01） |

方案文件头仍写「待闸门 1 客户确认」、团队计划文件头仍写「闸门 2 未确认、实施授权未给」——这些是写于确认之前的状态行，不作为判定依据；以 `docs/communication/` 的确认小节与冻结哈希为准（见 §九.1）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 v1；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施/提交/推送/合并/发布授权；实施授权以沟通记录为准，验收结论只写在 `docs/acceptance/acceptance-evidence-path-report-v1.md`。
- 方案实质变更（改判断规则/代批权限/契约形状/写集/档位/真实回归方法）按方案 §8.1 与团队计划 §5.4 停止并重开对应闸门，本文件随之重判；不自行放行。

### 1.3 本轮范围（判定边界，不重复方案正文）

本文件判定覆盖（对应方案 §1/§2/§3/§5/§6 与团队计划 §1.1）：

1. **取值优先级（`app/desktop/session.ts` `enrichAcceptanceJudgeContext`）**：pinned run 的 `documents.proposal.path`（trim 后非空）为唯一路径，磁盘更新版本不覆盖；pinned 但 manifest 无 proposal（null/缺失/空串）视为缺失、不回退最新扫描；无 pinned run 时经既有 `readIntentEntryFacts` 取 `docs/proposals/<flowId>-proposal-vN.md` 数字最大版本，`<flowId>-v1.md` 别名与其它命名不匹配；解析不到时 `proposalPath` 为 `undefined` 且显式覆盖继承旧值；pinned 路径不可读时保留该路径交给证据包，不回退。
2. **缺证文案（`src/common/编排/governance-judge-facts.ts`）**：`requiredArtifactPaths` 的 `expectedProposal` 改为 `docs/proposals/<flowId>-proposal-v1.md`（flowId 缺失时为「提案」），只作缺证文案，不扫盘、不做版本选择；`expectedQualityReport` 不变。
3. **测试与证据**：新增 session 集成测试（T1/T1b/T2/T2b/T3/T4/T5）与 facts 单测；更新 `acceptance-judge-minimal` 缺证文案断言；受影响层回归、typecheck；既有断言不得弱化；别名不得被选为 `proposalPath` 的负例必须覆盖。
4. **真实试跑回归（AC-8）**：按方案 §5.4 **方法 A** 在试跑项目重发验收卡（别名临时移出、记录 sha256、验证后按原字节还原），确认判断 agent 接受且 `judge.evidence` 指向真实提案；**AC-8 只以方法 A 为充分证据**。
5. **无回归与写集（AC-7）**：`npm run typecheck` 0；受影响测试全 pass；改动仅限闸门 2 确认的 5 文件；无越权改动。

**明确不判定为本轮缺陷或范围的边界**（依据闸门 1/2 已确认版本，不是放宽）：

- `intentRel`/`reportRel` 的静态 v1 回落、pinned `judgeContext.intentId` 冻结（R5/R10）、proposal 卡自身 artifacts 接线、试跑 O1（双 BOM）/O2（`wc <file> -h`）：均属方案 §9 非目标，不要求修复证据，也不因未修复判 fail。
- **产品代码不创建/修改/删除试跑项目别名文件**；方案 §5.4 方法 A 的别名临时移出/还原是经客户授权（闸门 1）的**验证步骤**，不属于产品写集；执行时仍需试跑项目所有者/客户现场确认（团队计划 §九.8）。
- 不新增 judgeContext 字段、不改 `GovernanceJudgeRequest`/`GovernanceJudgeContext` 类型、不改判断提示词、不新增第二份版本解析实现、不导出/修改共享层、不在 `session.ts` 写 readdir/regex、不抽共享测试 helper（方案 §2.5/§5.1/§7；团队计划 §1.3/§九.13）。
- **active run 查询失败/多 pin 按无 pin 走最新解析**（方案 §2.2 规则 5/R6）是既有行为，本修复不改变；验收不要求该路径的专门证据，也不因缺少该证据判 insufficient。
- R9（无 pin 且仅 `<flowId>-v1.md` 的历史项目修复后 fail-closed）是方案预期行为，不是缺陷；验收不要求为这类项目补兼容证明。
- R10（最新提案改变 `intentId` 时证据包按意图冲突 fail-closed、不误 approve）已披露；不冻结 pinned intentId，验收不要求该路径的专门测试。
- 方法 B、关闭「替我决策」后客户手批、单次 `accept` 结果均**不能**作为修复有效性的充分证据（方案 §5.4/AC-8；复核 F1）。
- 全量回归不是 T2 默认要求；只在证据不足或升档时补证（团队计划 §1.2/§6.3）。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-11-01 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD | `git rev-parse HEAD` | `feat/flow-improvements-wave1` / `eb77fadafc4df40594938798645da111665027c3` |
| 工作树（写标准开始时快照） | `git status --short` | 仅 `M docs/scheduling/memo.md` 与 4 个未跟踪管理文档（communication/planning/review/team-plan）；**无产品代码/测试改动** |
| 暂存区 | `git diff --cached --name-only` | 空（未暂存） |
| 方案 P1.2 | `sha256sum` / `wc -l` | `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9` / 396 行 |
| 复核记录 | 同上 | `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6` / 124 行 |
| 团队计划 | 同上 | `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3` / 431 行 |
| 沟通记录（当前，含闸门 0/1/2 与实施授权） | 同上 | `a95baf85a7e2807be7069806ab838a7e0bc75df3e8652a32f87040d82b36d237` / **76 行**；写标准开始时为 69 行 / `05ee7486f4456ac0d7a84759a75eab2def26043b769fae59cb414e16c6ba0283`（沟通过程中追加「实施授权记录」，属管理记录并发追加，不纳入候选）；闸门 0 快照 53 行 / `e97b978b…`、团队计划写盘时 61 行 / `47b9b707…` 为历史快照，不混用 |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（实施/取证仍须记录实测版本） |
| 根因代码锚点（只读核对） | Read/Grep（只读，不运行） | `app/desktop/session.ts:3883` 为 `proposalPath: \`docs/proposals/${flowId}-v1.md\``，`pinnedRun` 在 `:3741` 计算；`src/common/编排/governance-judge-facts.ts:181` 为 `docs/proposals/${flowId}-v1.md`；`governance-judge-evidence.ts:1072-1078` 组装 `规范物证缺失：…（判断无法核对）`、`:1101` 按 `artifacts.proposalPath` 加 proposal 物证、`:1141-1143` 产生「物证不可读：<path>」；`governance-judge.ts:324-339` 证据包失败直接 manual（不调用模型）；`src/common/shared/intent-entry-contract.ts:183-206` `latestVersioned` 用 `^<flowId>-<kind>-v(\d+)\.md$` 取数字最大版本，`:212-254` `readIntentEntryFacts` 返回 `proposalPath` |
| 既有测试锚点（只读核对） | 同上 | `test/编排/acceptance-judge-minimal.test.ts:52` 直接构造正确路径 `docs/proposals/focus-proposal-v1.md`（不经过 session 派生），`:122-140` 覆盖「物证缺失/未读 ⇒ manual」；`test/桌面应用/run-pin.test.ts:471-503` 只断言 legacy `judgeContext.facts.runState`；`test/编排/decision-evidence-packet.test.ts` 多处显式 `artifacts.proposalPath = docs/proposals/flow-a-v1.md`（历史 fixture，不经过本次派生）；`test/桌面应用/acceptance-evidence.test.ts` 覆盖 `evidence_check`（criteria/sidecar），不覆盖验收 judgeContext 的 proposal 物证 |
| 新增测试文件是否存在 | `ls` | `test/桌面应用/acceptance-proposal-path.test.ts` 与 `test/编排/governance-judge-facts.test.ts` **均尚不存在**（符合「实施前」状态） |

以上只读核对用于确认基线与约束；本文件写盘未改方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未启动应用。`docs/scheduling/memo.md` 的修改为统筹续接记录。**写标准期间观察到的并发变化（非本验收写入）**：`角色卡/桌面窗口/boundary.md`、`boundary.yaml`、`changelog.md` 出现人事按闸门 2 执行的 B-1 边界新增（`test/桌面应用/acceptance-proposal-path.test.ts` 精确条目，md/yaml 一一对应，changelog 有记录）；这是授权治理变更，不纳入产品候选，B0 基线应以其为既有状态记录。写标准开始时该变更尚未出现（§1.4 快照），交付时已落地。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施按闸门 2 确认的写集与团队计划阶段执行；实施授权范围以沟通记录为准。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（AC）只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动/绕过标准达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；必须写明依据 |

本任务 AC-1–AC-8 全部适用，均应给出 `pass`/`fail`/`insufficient evidence`；`not applicable` 仅当客户书面确认相关条目不再适用（范围变更）时才可使用，不得用来回避必需证据。

验收报告 `docs/acceptance/acceptance-evidence-path-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1–AC-8 | 本文件条目与方案 §6 AC-1–AC-8 | 本文件各条「所需证据」 | 原始输出/`tasks.jsonl` 摘录/哈希路径 | `git hash-object` + `sha256sum` | 桌面窗口/编排/测试/统筹 | 实际观察摘要 | pass/fail/insufficient evidence |

总体结论：**AC-1–AC-7 全部 pass 且 AC-8 按方法 A pass，才算通过**；任一项 `fail` → 返工；无 `fail` 但有任一项 `insufficient evidence` → 证据不足，不得判 pass（方案 §6 判断规则）。

### 2.2 原始证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、断言存在，**只是必要条件，不是通过依据**。每条必须观察实际行为：捕获的 `proposalPath` 实际取值、证据包实际读取路径/`sha256`/`reasonCode`/`reason` 原文、真实试跑 `request.resolved` 记录。
- 开发者自述、测试角色转述、工具「成功」、计划文字、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、测试计数与失败原文、`tasks.jsonl` 原始摘录。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做 B0 对照与分类。
- 不得以直接构造正确 `proposalPath` 的单元测试（如既有 `acceptance-judge-minimal` 的 fixture）替代经 `enrichAcceptanceJudgeContext` 的 session 集成测试；后者才是本次根因路径。
- 不得用「代码看起来已调用 `readIntentEntryFacts`」代替实际捕获输出；不得用方法 B 或单次 `accept` 代替方法 A 的区分力。

### 2.3 T2 证据口径

- 按 `references/testing.md` 的唯一定义，本变更 **T2**：受影响角色层测试（桌面窗口、编排）+ 跨模块集成 + `npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`）+ 真实试跑方法 A；**不默认全量回归**。
- 方案 §5.3 受影响测试与团队计划 §6.2 逐角色命令为最低要求；`test/桌面应用/**`、`test/编排/**` 按团队计划 D1 作为补充证据，失败按 B0 分类。
- 不把 T2 受影响证据虚报为全量回归；若报告声称执行了全量回归，必须附原始命令与计数，否则不得作为证据。
- 证据不足或候选不可复算时按 §六升档补证（可要求全量回归或按 T3 重定范围）；升档不降档。

### 2.4 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC 判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「所需证据」中的任何原始输出/文件（只给摘要、转述、口头自述、工具成功提示）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；变更包候选哈希与工作区不一致。
3. 新测试文件缺失、未运行、被 `skip`/`todo`，或断言被删除/放宽以保绿。
4. 以直接构造 `artifacts.proposalPath` 的测试代替经 `enrichAcceptanceJudgeContext` 的捕获（T1/T1b/T2/T2b/T3/T4 必须来自 session 集成夹具）。
5. 只测正例，缺 T1b（pinned 无 proposal 不回退）或 T2b（无 pin 仅别名不选）负例。
6. AC-3 只有 `requiredArtifactPaths` 的 `missingPaths` 断言或既有 minimal verdict 断言，没有直接断言 `buildDecisionEvidencePacket` 的 `ok`/`reasonCode`/`reason`。
7. AC-6 缺 T5 输出，或 `detail` 不是「物证不可读：<pinned path>」。
8. AC-8 只有方法 B、单次 `accept`、或关闭「替我决策」后客户手批；别名未移出/移出期间仍可被扫描；`judge.evidence` 引用别名；新 `request.resolved` 缺失；别名还原 sha256 与移出前不一致；缺请求 id/时间、候选版本或 run id。
9. AC-8 未执行，或缺少试跑项目所有者/客户现场确认记录（闸门 1 已授权方法 A，但执行现场仍需确认——团队计划 §九.8）。
10. `npm run typecheck` 未执行或退出码非 0；方案 §5.3 受影响测试未全跑或有未修复的确定性失败；D1 补充套件失败未按 B0 分类。
11. 写集外改动（产品/测试/共享层/构建/发布/角色卡超出 B-1）或并发混入未隔离。
12. 变更包/证据缺方案版本、标准版本、候选哈希或节点对应关系。
13. 用其它变更（shell-escalation、i18n、目录授权、发布等）的通过结论或证据为本变更背书。
14. 实施/测试自评即验收结论，或实施角色自写验收报告。
15. `not applicable` 未写明依据。

**不得放宽的具体禁令**：不以时间紧降档；不以单测替代 session 集成/真实试跑；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏或截图扣分（反过来也不得把录屏/截图当作必需证据要求提供）。

### 2.5 证据复用与失效

- 同候选、同输入/依赖/夹具、同命令的证据可以复用；候选、输入、依赖、契约、夹具、构建配置变化时，受影响证据失效，只补失效部分。
- 复用必须在统筹变更包中列出「复用理由 + 未失效依据」；验收核对候选哈希一致后才接受。
- 不得跨候选复用，也不得用其它变更的证据替本变更背书；管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）不纳入候选，其哈希变化不影响产品候选有效性，但变更包须把「产品候选」与「治理记录」分开列明。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置（团队计划 §1.4/§九），未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、`tasks.jsonl` 摘录、真实试跑记录为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

### 2.7 候选隔离与管理记录

- 本变更产品候选只列相对 B0 基线变化的闸门 2 写集路径：`app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`、`test/桌面应用/acceptance-proposal-path.test.ts`（新增）、`test/编排/governance-judge-facts.test.ts`（新增）、`test/编排/acceptance-judge-minimal.test.ts`（更新）。
- B-1 边界条目（`角色卡/桌面窗口/boundary.md`/`boundary.yaml` + changelog）是闸门 2 确认的人事治理变更，记录但不计入产品候选；除 B-1 外无边界变更。
- 管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）与角色 `docs/change/` 证据目录不混入产品候选；`app/renderer/dist/` 为忽略产物、非候选。
- 试跑项目文件不是本仓库产品候选；方法 A 的别名临时移出/还原是验证步骤，不属于产品写集。
- 并发写同一产品文件且未隔离的，按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 pass。

---

## 三、验收项（AC）

### 3.0 总表与方案映射

| AC | 方案 §6 对应 | 主题 | 最低证据 | 产出角色 |
| --- | --- | --- | --- | --- |
| AC-1 | AC-1 | pinned 优先、更新版本不覆盖、pinned 无 proposal 不回退 | T1/T1b 原始输出 + 捕获的 `judgeContext.artifacts.proposalPath` + diff | 桌面窗口 |
| AC-2 | AC-2 | 无 pin 取数字最大 `-proposal-vN`、别名不选、仅别名缺失 | T2/T2b 原始输出 + 捕获值 + diff | 桌面窗口 |
| AC-3 | AC-3 | 无提案缺失、继承旧值被覆盖、证据包 `artifact-missing` 与正确文案 | T3 原始输出（含 `buildDecisionEvidencePacket` 断言）+ reason 原文 + diff | 桌面窗口、编排 |
| AC-4 | AC-4 | `requiredArtifactPaths` 缺证文案 | facts 单测原始输出 + diff | 编排 |
| AC-5 | AC-5 | 试跑形状：证据包真实路径与 `sha256`、别名不进入 `evidence` | T4 原始输出 + 证据包 `evidence` 摘要 + fixture 文件哈希 | 桌面窗口 |
| AC-6 | AC-6 | pinned 路径不可读 `manual/artifact-missing`、detail「物证不可读：<pinned path>」、不回退 | T5 原始输出 + `governance-judge.ts:324-339` 零改动基线 | 桌面窗口、编排 |
| AC-7 | AC-7 | 无回归、typecheck、既有断言不弱化、写集 | typecheck/受影响测试原始输出 + 补充套件 + B0 + diff/哈希 | 各实施角色、测试 |
| AC-8 | AC-8 | 真实试跑方法 A（唯一充分证据） | `tasks.jsonl` 新 `request.resolved` 摘录、别名移出/还原 sha256、候选/run id/请求 id 时间 | 测试（桌面窗口按需支持构建/启动） |

**映射自检**：AC-1–AC-8 与方案 §6 的 AC-1–AC-8 一一对应，未拆分、未合并、未删减、未弱化；本文件新增的只是证据记录字段与 T2 证据口径（来自任务要求、闸门 2 确认的团队计划与复核 F1/F2/F3/F11），不新增产品行为要求。

### 3.1 AC-1 pinned 优先、更新版本不覆盖、pinned 无 proposal 不回退（方案 §6 AC-1）

**标准（可核对语句）**

- 当 run 已 pin（`findActiveRun` 返回 `state: "pinned"` 的 manifest）且 `documents.proposal.path` trim 后非空时，捕获的 `judgeContext.artifacts.proposalPath` 与 manifest 的 `documents.proposal.path`（trim 后）**字符串全等**；即使磁盘上存在更新的 `docs/proposals/<flowId>-proposal-vN.md`，也不替换。
- pinned 但 `documents.proposal` 为 null / 缺失 / 空串（三种变体）时，`proposalPath === undefined`：**不回退**到最新扫描、不保留 `baseContext.artifacts` 继承的旧值、不编造路径；fixture 同时放入 `-proposal-v2/v3` 与 `<flowId>-v1.md` 别名时仍为 `undefined`。
- pinned 路径不可读时仍保留 pinned 路径交给证据包（不回退最新/别名）；该情形的精确行为由 AC-6 判定。

**判定方法**

1. 运行 T1（manifest 钉 v2、磁盘另有 v3）：断言捕获的 `judgeContext.artifacts.proposalPath === docs/proposals/<flowId>-proposal-v2.md`。
2. 运行 T1b（pinned 无 proposal 的 null/缺失/空串三变体）：断言 `proposalPath === undefined`；fixture 同时放 v2/v3 与别名——若实现回退扫描或选别名，捕获值不可能是 `undefined`，以此证明「不扫描」而无需 spy。
3. 检查测试确实经过 `enrichAcceptanceJudgeContext`（session 集成夹具：`writeRunManifest` 写最小合法 pinned manifest），不是直接构造 `artifacts`。
4. 检查实现 diff 与方案 §3.1 一致：`pinnedRun !== undefined` 时只用 manifest 路径（trim 后非空）否则 `undefined`；`proposalPath: proposalRel` 显式覆盖 baseContext 旧值。

**所需证据**

- T1/T1b 测试原始输出（命令、退出码、测试计数 pass/fail/skip/todo、失败原文）与捕获值断言。
- pinned manifest fixture 内容摘要（`schema: ans-run/v1`、`state: pinned`、`documents.proposal.path`）。
- `app/desktop/session.ts` 的 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- T1 捕获 v3（磁盘更新版本覆盖 pinned）或别名路径。
- T1b 捕获 v2/v3/别名（pinned 无 proposal 时回退扫描/选中别名），或保留继承旧值。
- 测试直接构造 `proposalPath` 而未经 session 派生（不能证明根因路径）。
- pinned 分支读取 `readIntentEntryFacts` 覆盖 manifest 路径。

**来源**：方案 §6 AC-1、§2.2 规则 1/4、§2.3 行 1/2/7、§5.1 T1/T1b、§3.1。

### 3.2 AC-2 无 pin 取数字最大版本、别名不选（方案 §6 AC-2）

**标准（可核对语句）**

- 无 pinned run（draft 或无 run）时，`proposalPath` 为 `docs/proposals/<flowId>-proposal-vN.md` 中**数字版本最大**的一个（经既有 `readIntentEntryFacts`/`latestVersioned`），且不等于 `<flowId>-v1.md` 别名或其它命名。
- 无 pin 且仅有 `<flowId>-v1.md` 别名、无 `-proposal-vN.md` 时，`proposalPath === undefined`（别名不被选中）。
- 无 pin 且无任何提案时 `proposalPath === undefined`（缺失文案由 AC-3 判定）。
- 不新增第二份版本解析实现：`session.ts` 不新增 readdir/regex，复用共享层既有实现（方案 §2.5）。

**判定方法**

1. 运行 T2（无 pin，v1/v2/v3 同时存在）：断言取 v3，且不等于 `<flowId>-v1.md`。
2. 运行 T2b（无 pin，仅别名）：断言 `proposalPath === undefined`。
3. 检查 session 测试夹具：别名与 `-proposal-vN` 同时存在，能区分旧错误约定与正确约定。
4. 检查 diff：`session.ts` 调用 `readIntentEntryFacts({ projectRoot, flowId }).proposalPath`；无新增 readdir/regex/版本比较；未导出/修改共享层（否则按 §六停止）。

**所需证据**

- T2/T2b 测试原始输出与捕获值。
- session 集成夹具摘要（版本文件与别名清单）。
- `app/desktop/session.ts` diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 选中 `<flowId>-v1.md` 别名或其它非 `-proposal-vN` 命名。
- v3 存在却取 v1/v2（非数字最大）。
- 无 pin 仅别名时回退到别名或编造路径。
- 在 `session.ts` 另写版本扫描/正则，或修改共享层以凑实现。

**来源**：方案 §6 AC-2、§2.2 规则 2、§2.3 行 3/4、§2.5、§5.1 T2/T2b。

### 3.3 AC-3 无提案缺失、旧值被覆盖、证据包 fail-closed 文案（方案 §6 AC-3）

**标准（可核对语句）**

- 无提案（`proposalPath` 解析为 `undefined`）时，捕获的 `judgeContext.artifacts.proposalPath === undefined`；即使 `metadata.judgeContext.artifacts` 预置了旧 `proposalPath`，也必须被**显式覆盖**（`undefined` 不保留旧值）。
- 把捕获的 judgeContext 拼成 `GovernanceJudgeRequest` 调 `buildDecisionEvidencePacket`：`ok === false`、`reasonCode === "artifact-missing"`；`reason` 含 `规范物证缺失：`、`docs/proposals/<flowId>-proposal-v1.md`、`（判断无法核对）`，且**不含** `docs/proposals/<flowId>-v1.md`（旧错误路径子串）。
- 该失败保持 `manual/artifact-missing`，绝不 approve，也不转为交客户手选（客户关闭「替我决策」属另一路径，不是本 AC 的替代证据）。
- 说明（判定层级）：AC-3 判在 `buildDecisionEvidencePacket` 的 `reason` 原文（方案 T3 口径）；桌面客户面外包装（i18n「自动决策未通过…」）不作为 AC-3 的检查对象，方案未要求其专门证据（见 §九.5）。

**判定方法**

1. 运行 T3（fixture 无任何 `-proposal-vN`、质检报告存在；metadata 预置旧 `proposalPath`）：断言捕获 `proposalPath === undefined`。
2. 用同一捕获结果构造 `GovernanceJudgeRequest`（cardKind `acceptance`、flowId 明确）调用 `buildDecisionEvidencePacket`：断言 `ok`/`reasonCode`，读取 `reason` 原文核对必需子串与禁止子串。
3. 检查实现 diff：`proposalPath: proposalRel` 是显式赋值（不是 `...(proposalRel !== undefined ? {...} : {})` 之类的保留旧值写法）。
4. 交叉核对 AC-4 的 facts 单测：`missingPaths` 只含 `docs/proposals/<flowId>-proposal-v1.md`（当报告存在时）。

**所需证据**

- T3 测试原始输出（命令、退出码、计数、断言）；证据包 `ok`/`reasonCode`/`reason` **原文**（不只摘要）。
- 捕获的 `judgeContext.artifacts` 显示（含继承旧值被覆盖的证据）。
- `app/desktop/session.ts`、`governance-judge-facts.ts` diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 证据包 `ok=true`、`reasonCode` 非 `artifact-missing`，或转为 approve/交客户手选。
- `reason` 仍含 `docs/proposals/<flowId>-v1.md` 或缺少 `docs/proposals/<flowId>-proposal-v1.md`。
- 捕获的 `proposalPath` 保留继承旧值（非 `undefined`）。
- 只有 facts 的 `missingPaths` 断言，没有 `buildDecisionEvidencePacket` 直接断言（按 §2.4 判 insufficient）。

**来源**：方案 §6 AC-3、§2.4、§3.1、§5.1 T3；复核 F2。

### 3.4 AC-4 `requiredArtifactPaths` 缺证文案（方案 §6 AC-4）

**标准（可核对语句）**

- `requiredArtifactPaths` 对 `cardKind="acceptance"` 且缺 proposal 时，`missingPaths` 含 `docs/proposals/<flowId>-proposal-v1.md`（当质检报告也存在时恰为这一项；flowId=focus 时为 `docs/proposals/focus-proposal-v1.md`）；对 `cardKind="proposal"` 且缺 proposal 时，`missingPaths` 恰为同一路径。
- flowId 缺失时 `missingPaths` 为「提案」（不编造路径）。
- 任何结果都不含 `docs/proposals/focus-v1.md`（旧错误约定）。
- `expectedQualityReport` 仍为 `docs/quality/<flowId>-report-v1.md`（方案 §3.2：不变）；函数上方注释按方案 §3.2 同步说明（不扫盘；实际路径由 app 传入；与 `mechanical-rejection`/`workflow-preconditions`/`governance-judge-prompt` 同一命名）。

**判定方法**

1. 运行新增 `test/编排/governance-judge-facts.test.ts`：逐 cardKind（acceptance/proposal）与 flowId（有/无）断言 `missingPaths` 精确值。
2. 断言结果字符串不含 `docs/proposals/focus-v1.md`。
3. 对 `expectedQualityReport` 做回归断言（`acceptance` 缺报告时为 `docs/quality/<flowId>-report-v1.md`）。
4. 检查 `src/common/编排/governance-judge-facts.ts` diff：仅 `expectedProposal` 与注释变化，`expectedQualityReport` 不变，无扫盘/版本选择逻辑。

**所需证据**

- facts 单测原始输出（命令、退出码、计数、断言）。
- `governance-judge-facts.ts` diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- `missingPaths` 仍为 `docs/proposals/<flowId>-v1.md`。
- flowId 缺失时编造路径或输出空串。
- 任一结果出现旧路径 `docs/proposals/focus-v1.md`。
- `expectedQualityReport` 被改动，或 facts 函数新增扫盘/版本选择。

**来源**：方案 §6 AC-4、§3.2、§5.1 facts 测试。

### 3.5 AC-5 试跑形状：证据包真实路径与 sha256、别名不进入 evidence（方案 §6 AC-5）

**标准（可核对语句）**

- 试跑形状 fixture（pinned 真实 `-proposal-vN.md` + 磁盘 `<flowId>-v1.md` 别名）：`buildDecisionEvidencePacket` 的 `evidence` 中 proposal 条目 `path` 为真实提案路径（形如 `docs/proposals/<flowId>-proposal-vN.md`），`sha256` 与 fixture/真实提案文件实测一致，`bytes` 可核对。
- 别名不进入 `evidence`：无 `path` 等于 `<flowId>-v1.md` 别名的条目；派生的 `proposalPath` 也不引用别名。
- 本 AC 的确定性断言与方法 B 的「证据包能读 pinned 路径」同口径；方法 B 仍只是 AC-8 的补充证据，不能替代方法 A。

**判定方法**

1. 运行 T4（pinned 真实 proposal + 别名）：捕获 `judgeContext.artifacts.proposalPath === 真实提案路径`；用捕获结果调 `buildDecisionEvidencePacket`，导出 `evidence` 列表。
2. 断言 proposal 条目 `path` 与 `judgeContext` 捕获值一致、`sha256` 与 fixture 文件实测一致；搜索 `evidence` 中无别名路径。
3. 检查 fixture 同时含别名与真实提案（确保能区分）。

**所需证据**

- T4 原始输出 + 证据包 `evidence` 摘要（`kind`/`path`/`sha256`/`bytes`）。
- fixture 真实提案文件实测 `sha256` 与候选哈希。

**失败示例/反例（任一即 fail）**

- `evidence` 含别名路径，或 proposal 条目缺失。
- proposal 条目的 `sha256` 与真实提案文件不一致。
- `proposalPath` 指向别名而仅靠证据包其它字段掩盖。

**来源**：方案 §6 AC-5、§5.1 T4、§5.4 方法 B（确定性部分同口径）。

### 3.6 AC-6 pinned 路径不可读 fail-closed（方案 §6 AC-6）

**标准（可核对语句）**

- pinned 后提案文件被删除/不可读（T5）：`buildDecisionEvidencePacket` `ok === false`、`reasonCode === "artifact-missing"`，`detail` 为 `物证不可读：<pinned path>`（路径为 pinned manifest 中的路径；合法相对路径经 `safeProjectRelativePath` 规整后与 pinned 路径一致）。
- **不回退**最新 `-proposal-vN` 或别名：fixture 同时放 v2/别名时，仍报 pinned 路径不可读。
- 证据包失败进入既有「不调用模型」控制流 `src/common/编排/governance-judge.ts:324-339`（本修复未改该控制流）；AC-6 的证据限定为 **T5 证据包失败 + 该控制流代码基线**，不新增模型 spy（复核 F11）。

**判定方法**

1. 运行 T5（pin 后删除 pinned proposal 文件）：断言 `ok`/`reasonCode`/`detail` 精确值；搜索 `detail` 与 pinned 路径。
2. 断言未回退：fixture 中的 v2/别名没有出现在 `detail` 或 `evidence` 读取路径中。
3. 核对 diff：`governance-judge.ts` 零改动；证据包失败先于 adapter/模型创建（既有控制流，方案 §5.1 T5 说明）。

**所需证据**

- T5 原始输出（含 `detail` 原文）。
- `governance-judge.ts` 零改动 diff 与候选哈希。
- 证据包输出摘要（`ok`/`reasonCode`/`detail`）。

**失败示例/反例（任一即 fail）**

- 回退 v2/别名或返回 `ok=true`。
- `detail` 不是「物证不可读：<pinned path>」（例如指向原始错误路径、`物证不是可核对文本` 或空 detail）。
- 修改 `governance-judge.ts` 控制流以适配，或要求新增模型 spy 才算证据。

**来源**：方案 §6 AC-6、§2.3 行 7、§2.4、§5.1 T5、复核 F11。

### 3.7 AC-7 无回归、typecheck、既有断言不弱化、写集（方案 §6 AC-7）

**标准（可核对语句）**

- `npm run typecheck`（`tsc --noEmit`）退出码 0，记录原始输出与环境；`typecheck:renderer`/`build:renderer` 若实施声明必要则同 0；渲染层未改时未执行不算 fail（团队计划 §1.2「必要时」），但须说明未执行理由。
- 方案 §5.3 受影响测试全部 pass：`test/桌面应用/acceptance-proposal-path.test.ts`（T1/T1b/T2/T2b/T3/T4/T5）、`test/桌面应用/acceptance-evidence.test.ts`、`test/桌面应用/run-pin.test.ts`、`test/编排/acceptance-judge-minimal.test.ts`、`test/编排/governance-judge-facts.test.ts`、`test/编排/decision-evidence-packet.test.ts`、`test/编排/workflow-preconditions.test.ts`。
- 既有断言不得删除/放宽：`acceptance-evidence.test.ts`、`run-pin.test.ts`、`decision-evidence-packet.test.ts`、`workflow-preconditions.test.ts` **零 diff**；`acceptance-judge-minimal.test.ts` 只允许按方案 §5.1 追加缺证文案断言，既有断言保持原样。若任一既有测试因路径文案变化失败，仅在确认属于「旧错误约定断言」时允许逐条更新并在实现记录中列明理由（方案 §5.2）；否则 fail。
- 改动仅限写集 5 文件（见 §2.7）；`src/common/shared/**` 零改动（确需导出 `latestVersioned` 时，必须按方案 §2.5/§7 与团队计划 §九.13 停止并重开闸门 2、更新写集与档位；未重开即改动 → fail）；不新增第二份版本扫描/共享助手。
- 不新增 `skip`/`todo`；失败按 B0 基线分类；本次新增确定性失败 = 0。
- D1 补充套件（`test/桌面应用/**`、`test/编排/**`）按团队计划 §5.3/§6.2 提供计数与失败分类；不虚报为全量回归。

**判定方法**

1. 运行 §4.2 命令清单；记录命令、环境、退出码、计数、失败原文；与 B0 基线逐类对照。
2. `git status --short`/`git diff --name-only` 逐路径核对写集；`git diff --cached --name-only` 为空；范围外零改动（治理记录与 B-1 除外，按其自身记录核对）。
3. `git diff -U0` 检查测试文件：无断言删除/放宽/新增 skip；`acceptance-judge-minimal` 的变更逐条对应方案 §5.1。
4. 核对共享层与构建/发布文件零 diff（`src/common/shared/**`、`package.json`、锁、构建配置、发布配方）。
5. 核对 D1 补充套件的失败分类与 B0 一致，新增失败为 0。

**所需证据**

- 命令原始输出清单（命令/工作目录/环境/退出码/计数/失败原文）。
- B0 基线记录；D1 补充套件结果与失败分类。
- `git status`/`git diff --name-only`/`git diff -U0`；候选文件 `git hash-object` + `sha256sum`。
- 写集外文件零改动对照（共享层、package/锁/构建/发布配方）。

**失败示例/反例（任一即 fail）**

- typecheck 失败或未执行；任一受影响测试失败未修复。
- 删除/放宽既有断言、新增 skip/todo 以保绿。
- 写集外改动（`src/common/shared/**`、其它产品/测试文件、构建/发布面），或未重开闸门即导出共享实现。
- 在 `session.ts` 另写版本扫描/正则。
- 把 D1 补充证据虚报为全量回归；或报告声称全量回归但无原始输出。
- commit/push/merge/release（违反团队计划 §八）。

**来源**：方案 §6 AC-7、§5.2、§5.3、§7、§8.1；团队计划 §1.2/§4/§5.3 D1/§6。

### 3.8 AC-8 真实试跑方法 A（方案 §6 AC-8；唯一充分证据）

**标准（可核对语句）**

- 前置：修复后的候选构建；试跑项目 `C:\Users\51054\Desktop\work\trial-shell-escalation`；run `run-20261101-textkit-cli-87325f96` 仍为 pinned（若执行时实测不同，记录实际 run id 与其 manifest 事实）；「替我审批」「替我决策」开启；与试跑相同 runtime（记录构建/启动命令、应用/Electron 版本与候选文件哈希，证明真实运行的是候选构建）。
- **方法 A（AC-8 判 pass 的唯一充分方法；闸门 1 已授权，执行时需试跑项目所有者/客户现场确认——团队计划 §九.8）**：
  1. 记录别名 `docs/proposals/textkit-cli-v1.md` **移出前** `sha256`；
  2. 将别名临时移出 `docs/proposals` 到不参与扫描的目录（记录目标位置与时间）；
  3. 以修复候选重新构建/启动应用，重新发起验收卡；
  4. 新 `request.resolved` 必须为 `by=judge`、`choice=accept`、`judge.reasonCode=sufficient`；`judge.evidence` 引用 `docs/proposals/textkit-cli-proposal-v1.md`（真实提案，而非 `<flowId>-v1.md` 别名），不含别名；reason 不含「物证不可读」；
  5. 验证后按**原字节**还原别名并复核 `sha256`（与移出前一致）；
  6. 记录请求 id/时间、候选版本、run id、别名移出/还原 `sha256` 与 `tasks.jsonl` 原始摘录。
- **记录必须含（最低字段）**：① 新 `request.resolved` 的请求 id 与时间；② `judge.evidence` 引用 `docs/proposals/textkit-cli-proposal-v1.md`（真实提案，明确不得是 `<flowId>-v1.md` 别名）；③ 候选版本（工作树候选哈希集与构建/启动身份）；④ run id（及其 manifest `state: pinned`、`documents.proposal.path` 实测）；⑤ 别名移出与还原的 `sha256`（移出前后一致）；⑥ `tasks.jsonl` 新记录原始摘录（含 `by`/`choice`/`judge.reasonCode`/`judge.evidence`/reason）。
- **方法 B（只作补充，不能单独判 pass）**：在真实试跑项目上重发验收卡并保留只读证据，以及从同一 pinned manifest 生成 `GovernanceJudgeRequest` 调用修复后的 `buildDecisionEvidencePacket`（记录 proposal `path`/`sha256`）。方法 B 不经过 `enrichAcceptanceJudgeContext`，不证明 app 派生逻辑已修复。
- **单次 `accept`、不修代码仅靠别名的通过、关闭「替我决策」后客户手批**：均不能作为修复有效性的充分证据（方案 §5.4；复核 F1）。
- **未执行或未获授权（含缺少现场确认记录）**：AC-8 记 `insufficient evidence`，不得判 pass；不得以方法 B、客户手批或「别名仍在时也 accept」替代。若试跑项目生命周期不允许重新发起验收卡，停止并回报，不伪造结果（团队计划 §5.3 D2/§10.2 第 2 项）。

**判定方法**

1. 读取试跑项目 `.ans/state/tasks.jsonl` 的新 `request.resolved` 原始记录，核对 `requestId`、`at`、`operatorId`（judge）、`choice`、`judge.reasonCode`、`judge.evidence`、reason 原文。
2. 核对 `judge.evidence` 含 `docs/proposals/textkit-cli-proposal-v1.md` 且不含 `docs/proposals/textkit-cli-v1.md`；reason 不含「物证不可读」。
3. 核对别名移出/还原 `sha256` 记录（移出前与还原后一致）与移出目标目录、时间；核对移出时间早于请求时间、还原时间晚于请求时间（时间线可核对）。
4. 核对 run manifest：`state: pinned`、`documents.proposal.path` 为真实提案、提案文件实测 `sha256` 记录；确认未修改 run/manifest/别名内容。
5. 核对候选身份：构建/启动命令、应用/Electron 版本、候选文件哈希与变更包一致；证明运行的不是旧构建。
6. 若提供方法 B 记录：只作为补充核对（路径/`sha256`），不改变 AC-8 需方法 A 的结论。

**所需证据**

- `tasks.jsonl` 新 `request.resolved` 原始摘录（文件路径 + `sha256`，或受控证据文件路径 + 哈希）。
- 别名移出前/还原后 `sha256` 两条记录（一致）与移出目标位置、时间。
- run id 与 manifest 事实（`state`/`documents.proposal.path`/提案 `sha256` 实测）。
- 候选版本/构建身份（命令、版本、候选文件哈希）。
- 方法 B 记录（如有，作补充）。

**失败示例/反例（任一即 fail）**

- 别名未移出，或移出期间仍位于 `docs/proposals`/可被扫描目录（无法区分修复与别名兜底）。
- `judge.evidence` 引用别名 `docs/proposals/textkit-cli-v1.md`，或 reason 出现「物证不可读」。
- `request.resolved` 非 `by=judge`/`choice=accept`/`judge.reasonCode=sufficient`（例如 declined/reject）。
- 别名还原 `sha256` 与移出前不一致，或别名/run/manifest 内容被修改。
- 运行的不是修复候选构建（候选身份无法建立）。
- 只有方法 B、单次 `accept` 或客户手批；缺请求 id/时间、候选版本或 run id。
- 伪造/编辑 `tasks.jsonl` 或别名哈希记录。

**来源**：方案 §6 AC-8、§5.4、§1.1/§1.4、R1；复核 F1/N1；团队计划 §5.3 D2、§6.2、§九.8。

---

## 四、证据计划

### 4.1 候选身份、基线与环境

- 写前基线（B0，由测试角色记录）：`git rev-parse HEAD`、`git status --short`、目标文件 `git hash-object` + `sha256sum`；确认无产品代码改动（除管理文档）。
- 候选身份：所有新增/改动文件（产品代码、测试）的 `git hash-object` 与 `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同。
- 改动范围：`git diff --name-only` 与 `git status --short` 必须落在 §2.7 写集/边界内；`git diff --cached --name-only` 为空；无授权外已跟踪变化。
- 环境：Node/npm 实测版本、OS/Shell、命令工作目录；Windows 既有失败按 B0 分类；不得伪造输出。
- 候选隔离：管理记录/证据目录不纳入候选；并发写混入按不可复算处理。

### 4.2 命令清单（最低要求；实际以仓库脚本/runner 为准）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| 桌面窗口（A1） | `node --test --test-concurrency=1 test/桌面应用/acceptance-proposal-path.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/run-pin.test.ts`；`npm run typecheck` | 桌面窗口 |
| 编排（A2） | `node --test --test-concurrency=1 test/编排/governance-judge-facts.test.ts test/编排/acceptance-judge-minimal.test.ts test/编排/decision-evidence-packet.test.ts test/编排/workflow-preconditions.test.ts`；`npm run typecheck` | 编排 |
| 跨模块回归（D1） | 方案 §5.3 全套：`node --test --test-concurrency=1 "test/桌面应用/acceptance-proposal-path.test.ts" "test/桌面应用/acceptance-evidence.test.ts" "test/桌面应用/run-pin.test.ts" "test/编排/acceptance-judge-minimal.test.ts" "test/编排/governance-judge-facts.test.ts" "test/编排/decision-evidence-packet.test.ts" "test/编排/workflow-preconditions.test.ts"`；补充 `node --test "test/桌面应用/**"`、`node --test "test/编排/**"`；`npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`） | 测试 |
| 真实试跑（D2，方法 A） | 按 §3.8 步骤在试跑项目执行并取证 | 测试（桌面窗口按需支持构建/启动） |

命令若因仓库实际脚本/runner 不同而调整，须在变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 4.3 原始输出要求

每项检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给「全部通过」摘要不算原始证据。AC-8 记录附 `tasks.jsonl` 原文、别名哈希与候选身份。

### 4.4 文件哈希与 diff/status

- 每个候选文件：`git hash-object <path>` + `sha256sum <path>`；新增文件同。
- `git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对 §2.7 写集/边界。
- 范围外文件（写集外 `src/`/`app/`/`test/`、`src/common/shared/**`、`package.json`/锁/构建配置/发布配方）记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明无弱化断言；`acceptance-judge-minimal` 的变更逐条列理由。

### 4.5 AC-8 真实回归证据清单（试跑项目）

- 试跑项目路径与 run id：`C:\Users\51054\Desktop\work\trial-shell-escalation` / `run-20261101-textkit-cli-87325f96`（实测为准）。
- `tasks.jsonl` 新 `request.resolved` 摘录：请求 id/时间、`operatorId`（judge）、`choice=accept`、`judge.reasonCode=sufficient`、`judge.evidence`（含 `docs/proposals/textkit-cli-proposal-v1.md`，不含别名）、reason（无「物证不可读」）。
- 别名 `docs/proposals/textkit-cli-v1.md`：移出前 `sha256`、移出目标目录与时间、还原后 `sha256`（与移出前一致）、还原时间。
- run manifest 事实：`state: pinned`、`documents.proposal.path = docs/proposals/textkit-cli-proposal-v1.md`、该文件实测 `sha256`（方案/复核快照为 `a2bdbee2882d788947808743d7d2a6d1e053ed97035df907012b34d60d4ce185`；执行时以实测为准，如不同须说明）。
- 候选构建身份：构建/启动命令、应用/Electron 版本、候选文件哈希。
- 方法 B 记录（如有）：同 manifest 的 `GovernanceJudgeRequest` 调用结果（proposal `path`/`sha256`）与真实 `request.resolved` 的 `judge.evidence`——仅作补充，不替代方法 A。

### 4.6 证据路径与禁止事项

- 证据路径按团队计划 §6/§7：实施角色与测试角色的证据放各自 `角色卡/<role>/docs/change/...-evidence/`（或团队计划认可的等价位置）；`docs/acceptance/` 只放标准与报告；管理记录不混入产品候选。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其它变更证据替本变更背书；写 `docs/verification/`；要求或提供录屏。

### 4.7 证据失效与复用

- 候选、输入/依赖、契约、测试夹具、构建配置变化 → 受影响证据失效，只补失效部分；不得跨候选复用。
- 共享文件（`src/common/shared/intent-entry-contract.ts`、`app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`）按单写者/路径预留；并发写造成的混入按不可复算处理。

---

## 五、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| run pinned；磁盘另有更新 `-proposal-vN` | 捕获 manifest 路径（pinned 版本） | 取更新版本 → AC-1 fail |
| run pinned；manifest 无 proposal（null/缺失/空串） | `proposalPath === undefined`，不扫描 | 回退扫描/保留旧值 → AC-1 fail |
| 无 pin；提案 v1/v2/v3 与别名并存 | 取 v3，不等于别名 | 取别名/旧版 → AC-2 fail |
| 无 pin；仅 `<flowId>-v1.md` 别名 | `proposalPath === undefined` | 选中别名 → AC-2 fail |
| 无提案（含继承旧路径） | `undefined`；证据包 `ok=false`/`artifact-missing`；reason 正确路径、无旧路径 | 保留旧值/旧路径文案/approve → AC-3 fail |
| `requiredArtifactPaths` 缺 proposal | `missingPaths` 为 `docs/proposals/<flowId>-proposal-v1.md`（flowId 缺失「提案」） | 旧路径/编造路径 → AC-4 fail |
| 试跑形状（pinned 真提案 + 别名） | 证据包 proposal 条目真实路径与 `sha256`；无别名 | 别名入库/哈希不符 → AC-5 fail |
| pinned 路径不可读（pin 后删除） | `artifact-missing`、「物证不可读：<pinned path>」、不回退 | 回退/其它 detail/approve → AC-6 fail |
| typecheck | 退出码 0 | 非 0/未执行 → AC-7 fail（未执行按 insufficient，视原因） |
| 受影响测试与既有断言 | 全 pass；既有断言零弱化；写集内 | 失败/弱化/越界 → AC-7 fail |
| 真实方法 A（别名移出、候选构建、开关开启） | judge accept、`judge.reasonCode=sufficient`、`judge.evidence` 真提案、无「物证不可读」、别名还原一致 | 别名兜底/证据引用别名/还原不一致 → AC-8 fail |
| 方法 B、单次 accept、客户手批、别名未移出 | 不作为充分证据 | AC-8 insufficient（无 fail 时） |
| 试跑生命周期不允许重发/未获现场确认 | 停止并回报 | AC-8 insufficient evidence |
| 未执行 AC-8 | — | AC-8 insufficient evidence，不得 pass |
| 录屏/截图缺失 | 方案未要求 | 不构成 fail/insufficient |

---

## 六、T2 检查面、升档与停止条件

### 6.1 T2 选定检查面

- 受影响角色层测试：桌面窗口（`app/desktop/session.ts` 派生 + 新 session 测试 + 既有 acceptance-evidence/run-pin 回归）、编排（facts 文案 + facts 单测 + acceptance-judge-minimal 更新 + decision-evidence-packet/workflow-preconditions 回归）。
- 跨模块集成：session 集成测试中「捕获的 judgeContext → `GovernanceJudgeRequest` → `buildDecisionEvidencePacket`」的端到端断言（T3/T4/T5）。
- 类型检查：`npm run typecheck`；条件 `typecheck:renderer`/`build:renderer`（渲染层未改时未执行不算 fail）。
- 真实试跑方法 A（AC-8）。
- 补充证据：`test/桌面应用/**`、`test/编排/**`（团队计划 D1），失败按 B0 分类。

### 6.2 全量回归口径

- 本任务为 T2，**不默认要求全量回归**；不得以「未跑全量」判 fail，也不得把受影响证据虚报为全量。
- 证据不足时按 §6.3 升档补证；若执行全量回归，记录命令/环境/计数/失败原文并与 B0 分类。

### 6.3 升档与停止条件

- 实施中出现以下任一，停止并回报统筹/沟通，按方案 §8.1/团队计划 §5.4 处理（重开闸门、升 T3）：改变判断条件或代批权限；引入缺失物证时 approve 的兜底；修改 `GovernanceJudgeRequest`/`GovernanceJudgeContext` 契约形状或判断提示词；新增公共导出/共享层改动；在 `session.ts` 另写版本扫描；写集/边界/档位变化；方法 A 授权或现场确认缺失。
- 证据不足以建立跨模块或真实回归结论（候选不可复算、方法 A 缺失、别名还原不一致）→ 判 `insufficient evidence` 或升档补证（可要求全量回归）；升档不降档。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理。

---

## 七、与团队计划、写集与授权边界

- 写集以闸门 2 确认的团队计划 §4.1/§4.3 为准：5 文件（`app/desktop/session.ts`；`src/common/编排/governance-judge-facts.ts`；新增 `test/桌面应用/acceptance-proposal-path.test.ts`；新增 `test/编排/governance-judge-facts.test.ts`；更新 `test/编排/acceptance-judge-minimal.test.ts`）。验收按该写集核对 `git diff --name-only`/`git status --short`；任何角色不得写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。
- 边界变更仅限 B-1（桌面窗口 `boundary.md`/`boundary.yaml` 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目 + changelog）；无其它边界改动。团队计划 §10.3 已把方案 §7 的三个测试角色标签校正为实际归属（`test/桌面应用/` 归桌面窗口逐文件授权、`test/编排/` 归编排）；验收按团队计划实际归属核对，不以方案 §7 标签文字判越权。
- `src/common/shared/**` 默认只读；确需导出 `latestVersioned` 时必须按团队计划 §九.13 停止并重开闸门 2（项目管理参与）并重新评估档位；未重开即改动按 AC-7 fail。
- 不 commit/push/merge/release（团队计划 §八）；验收通过只表示当前候选满足标准，不授权提交/推送/合并/发布/发行。
- 试跑项目别名移出/还原是方法 A 的验证步骤，不属于产品写集；产品代码不创建/修改/删除别名。
- 无 task_ops；不伪造机器状态。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/acceptance-evidence-path-criteria-v1.md`，版本 **v1**，日期 **2026-11-01**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 V1 出口）。
- 实施后：统筹提交变更包（`docs/scheduling/acceptance-evidence-path-change-v1.md`：候选哈希、改动路径、节点、证据链接、T2、复用/失效说明）；独立验收按本文件判定并**另写** `docs/acceptance/acceptance-evidence-path-report-v1.md`；报告首行至少含风险档位、判定依据、选定检查、复用证据、T2 口径说明（是否执行全量回归及理由）、结论。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

以下为只读核对发现的事实/文档状态/口径问题，供统筹/沟通/策划处理；本文件**未修改**方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未自行放宽标准。除明确说明外，这些问题不改变本文件的判定力度；如方案/客户后续澄清与本文件理解不同，按 §1.2 递增版本重判。

1. **文档状态头漂移（方案与团队计划）**：方案 P1.2 文件头仍写「草案 P1.2……待闸门 1 客户确认」，团队计划文件头/§二仍写「闸门 2 未确认、实施授权未给」；沟通记录已含闸门 0/1/2 确认与实施授权记录。判定以 `docs/communication/` 的确认小节与冻结哈希为准，不影响本文件条目；建议策划/统筹在后续版本校正状态行。
2. **沟通记录门 2 的项数表述**：沟通记录「闸门 2 记录」写「§九 全部 13 项」，而团队计划 §九 实为 1–14 共 14 项。按语义「§九 全部项」执行（客户确认的是团队计划 §九 全文与其冻结哈希），不按数字 13 截断；建议沟通校正该表述。
3. **AC-8「或按客户选择完成」与 §5.4 方法 A 的表述差异**：方案 §6 AC-8 括注「judge 代批 accept 或按客户选择完成；客户本来不需要看到卡」（N1 措辞），而 §5.4 方法 A 的预期记录为 `by=judge`、`choice=accept`、`judge.reasonCode=sufficient`、`judge.evidence` 指向真实提案。本文件按 §5.4 的明确记录期望判 AC-8 pass；若实际以客户选择完成（非 judge 代批）且无路径错误证据，AC-8 记 `insufficient evidence` 并交沟通/客户澄清是否接受该替代路径——**不自行放宽，也不自行把该情形判 fail**。
4. **AC-6 detail 的精确文本与证据包其它分支**：`物证不可读：<pinned path>` 适用于文件缺失/不可读分支；证据包还有 `物证路径非法：…`、`物证不是可核对文本：…` 分支。T5（pin 后删除文件）应产生「物证不可读」；若实际产生其它分支，AC-6 按方案 §2.4 判 fail/insufficient 并交策划澄清，不自行放宽为「任意 artifact-missing 均可」。
5. **AC-3 的判定层级**：方案 T3 断言的是 `buildDecisionEvidencePacket` 的 `reason`；桌面客户面外包装（`judgeReworkHumanReason` 与 i18n `main.customerInput.ledgerUnavailableShort`「自动决策未通过：…」）不在 AC-3 的测试证据内。本文件按 T3 口径判定；若需要核对客户面文案，方案未要求，本文件不新增。
6. **R6/R10 与 R9 非目标边界**：active run 查询失败/多 pin 按无 pin 处理（R6）与 pinned intentId 未冻结（R10）不在 AC 覆盖；R9（仅别名历史项目 fail-closed）是方案预期行为。验收不因缺少这些路径证据判 insufficient；若实施改变了这些既有行为，属写集外/方案外，按 AC-7 与 §6.3 停止回报。
7. **方法 A 的生命周期与现场确认**：复核与团队计划已披露「试跑项目是否允许再次发起验收卡未验证」「执行时需试跑项目所有者/客户现场确认」。若不允许重发或缺少现场确认，AC-8 记 `insufficient evidence`，不得以方法 B 或客户手批替代；该风险已在闸门 1/2 披露，不构成方案矛盾。
8. **「与试跑相同 runtime」的可核对口径未定义**：方案未写明 runtime 的具体标识。本文件要求记录构建/启动命令、应用/Electron 版本与候选文件哈希，证明真实运行的是修复候选；若无法建立该对应关系，AC-8 记 `insufficient evidence`。这是证据口径细化，不改变方案要求。
9. **试跑别名当前 sha256 的历史快照**：复核记录引用别名前缀 `d6cad5f2…`（历史快照，仅作对照）；执行时应实测移出前值并与还原后值比较，不要求等于历史值。若执行前别名内容已变化，记录并说明；只要移出期间不在扫描目录且还原一致，不影响 AC-8。
10. **沟通记录为并发追加的管理记录**：写标准时 `a95baf85…`/76 行（写前 69 行/`05ee7486…`）；引用其确认小节而非固定行号；验收时以当时的 `docs/communication/` 确认小节为准，不以旧快照哈希替当前记录，也不把两者混用。
11. **方案 §5.3「建议追加」与团队计划 D1 的强制度**：方案写「建议追加 `test/桌面应用/**`、`test/编排/**` 作为补充证据」，团队计划 D1/§6.2 将其列为测试角色输出。本文件按团队计划把该补充套件作为 D1 证据要求（不虚报为全量回归）；其失败按 B0 分类，新增确定性失败为 0（不因方案用语「建议」而省略）。
12. **Node 环境**：写标准时 `node v24.22.1`/`npm 11.19.1` 可用；实施/取证仍须记录实测版本，且不得以写标准时的版本替代候选运行记录。

---

**本文件状态：标准 v1 已冻结；未判定任何候选；未声称本变更已实施、已测试或已验收。**
