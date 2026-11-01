# 验收判断提案物证路径修复方案复核记录

- 复核对象：`docs/planning/2026-11-01_design_acceptance-evidence-path.md`（版本 P1，367 行；SHA-256 `af200f3d61a07d236684b860415bdf6e90334419292567199ac7e31e0a85e169`；复核按该快照只读）
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：跨 `app/desktop` 与 `src/common/编排`、修改判断链的事实/物证取值、包含真实试跑回归与 T2 风险档位，不满足轻量条件）
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；**不继承作者对话**；只读方案、闸门 0、代码、测试与试跑证据；只写本复核记录）
- 闸门 0 记录：`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（53 行；SHA-256 `e97b978b7be485679d94568e96058f3f03096600fa63384b8683c313b21fe53e`；客户原话「记录这个验收物证路径 bug 并修复」）
- 复核日期：2026-11-01
- 代码基线：worktree `flow-improvements-wave1` HEAD `eb77fadafc4df40594938798645da111665027c3`（与方案标注一致）
- 说明：复核只作建议，不是批准、客户闸门、实施授权或验收基线。作者处置见方案 §11。

## 独立核对过的关键事实（只读）

- 方案与闸门 0 的行数、SHA-256 与任务输入一致；方案 §1.2 的代码基线行号与 HEAD 快照一致：`app/desktop/session.ts:3883` 为 `proposalPath: \`docs/proposals/${flowId}-v1.md\``，`pinnedRun` 在 `:3741` 计算；`src/common/编排/governance-judge-facts.ts:181` 为 `docs/proposals/${flowId}-v1.md`；`src/common/编排/governance-judge-evidence.ts:1072` 调用 `requiredArtifactPaths`、`:1101` 读取 `artifacts.proposalPath`、`:1143` 产生「物证不可读」；`src/common/编排/governance-judge.ts:324-339` 证据包失败直接 manual；`app/desktop/customer-input.ts:1049-1106` 把 `judgeContext.artifacts` 原样放入判断请求、`:1165` 起 `settleJudgeOutcome`、`:1317-1332` manual 结算为 declined。
- 试跑证据核对：`docs/proposals/textkit-cli-v1.md` 存在（mtime `2026-11-01 09:17:38 +0800`，sha256 `d6cad5f2…`，frontmatter `schema: project-proposal-entry/v1`、`entryOf: docs/proposals/textkit-cli-proposal-v1.md`）；真实提案 `docs/proposals/textkit-cli-proposal-v1.md` sha256 `a2bdbee2…`；`.ans/runs/run-20261101-textkit-cli-87325f96/manifest.json` 的 `state` 为 `pinned`、`documents.proposal.path` 为真实提案路径且 sha256 与文件一致。
- 试跑任务账本核对：`req-ede39454bd1a30e5`（`2026-11-01T01:15:10.970Z`）与 `req-ef57716bc74bf1d4`（`2026-11-01T01:15:29.883Z`）均为 `operatorId=judge:pi`、`choice=declined`，reason 为「自动决策未通过：规范物证缺失（物证不可读：docs/proposals/textkit-cli-v1.md；请按上述原因修正后重新提交）…」；`req-6dc353d878405acc`（`2026-11-01T01:19:00.208Z`）为 `by=judge`、`choice=accept`、`judge.reasonCode=sufficient`，`judge.evidence` 明确含 `docs/proposals/textkit-cli-v1.md`。质检报告 `docs/quality/textkit-cli-report-v1.md` 确为 AC-1..AC-5 5/5 通过，§11 如实登记验收卡被自动决策挡下、未送达客户。
- 版本解析能力核对：`src/common/shared/intent-entry-contract.ts` 的 `latestVersioned`（`:183-206`）按 `^<flowId>-<kind>-v(\d+)\.md$` 取数字最大版本，`readIntentEntryFacts`（`:212-245`）返回 `proposalPath`；`session.ts:129` 已导入、`:7153` 已在 §5A contract_check 使用。方案 §2.5 的复用路径可实现，且不新增 readdir/regex 实现。
- 现有测试核对：`test/桌面应用/run-pin.test.ts:471-503` 只断言 legacy 的 `judgeContext.facts.runState`；`test/编排/acceptance-judge-minimal.test.ts:52` 直接构造正确路径 `docs/proposals/focus-proposal-v1.md`；`test/桌面应用/acceptance-evidence.test.ts` 只覆盖 `evidence_check`；`test/编排/decision-evidence-packet.test.ts` 的 `flow-a-v1.md` 是显式传入的历史 fixture。方案 §1.3 的「现有测试为什么没发现」基本成立。
- 全仓既有约定核对：`mechanical-rejection.ts:37/179`、`workflow-preconditions.ts:259/1006/1222`、`governance-judge-prompt.ts:143` 中的约定路径均带 `-proposal`，但其中 `:37/179`、`workflow-preconditions:1222`、`governance-judge-prompt:143` 写作 `-proposal-v1.md` 而非 `-proposal-vN.md`；`run-manifest.ts:367/843`、`workflow-preconditions.ts:259/1006` 为 `-proposal-vN.md` 正则。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 两处源码改动（session 根因、facts 文案）均能逐项追溯闸门 0 的「最新提案 + run/manifest 优先 + 同步修正 requiredArtifactPaths 文案」；静态 `-proposal-v1`、永远最新、角色自报三种备选已比较与否决。未发现为「以后可能」新增抽象、模块或兜底；fail-closed 不变。F9 只是测试夹具复用方式未写明，不影响产品最小性。 |
| OD-2 必做与选装 | 通过 | 没有产品功能选装；§10 的六项是客户确认点/风险选择，不是默认勾选的选装。方法 A/B 是真实回归的证据路线，未把「方法 B」冒充成与 A 等价的证明；§10 第 3 项明确请客户选择。 |
| OD-3 复用 | 发现 | 复用 `readIntentEntryFacts` 的方向正确，且已确认 `session.ts` 既有导入与用法；但方案多处称其为「唯一既有实现/全仓唯一」，与 `run-manifest.ts`、`workflow-preconditions.ts`、`session.ts chainDispatchFacts` 的既有私有扫描并存（F6）。本次不新增实现，故不改变方向，只需校正表述。 |
| OD-4 非目标 | 发现 | 非目标总体守住闸门 0（不修 intent/report 静态回落、不修 proposal 卡、不处理 O1/O2）；但 §9「不创建/修改/删除试跑项目的别名文件」与 §5.4 方法 A 的临时移出/还原冲突， §7 已有「除 §5.4 经授权」例外而 §9 未同步（F4）。这会影响实施/验证的授权边界。 |
| OD-5 被否决的备选 | 通过 | §2.1 的 (a)(b)(c)(d) 是真实比较：静态 v1、永远最新、角色自报均有具体代价与否决理由；未发现为凑对比编造的备选。 |
| MK-1 目标 | 发现 | 目标可追溯到闸门 0，现状与设计候选有 [现状]/[设计候选] 标记，事实与推断基本分开；但「验收卡永远到不了客户」混淆了开着「替我决策」时的正常语义（正常成功是 judge 代批 accept，本来就不呈现客户），R8「未授权变通产物」也缺少授权依据（F7）。 |
| MK-2 完整流程与失败分支 | 发现 | §4.1 调用图与 §2.3 分支表覆盖 pinned 有路径/无 proposal、无 pin 有 v1..v3、仅别名、无提案、pinned 不可读；R4/R6 提到额外只读与 active run 失败。但 pinned 分支只冻结 `proposalPath`，`run-role.ts:1146-1156` 仍在无 pin 路径事实下解析 `judgeContext.intentId`（读最新提案/产品意图），方案未说明该假设或测试（F5）。 |
| MK-3 输入输出 | 通过 | 输入（验收卡、judgeContext.artifacts、pinned manifest）与输出（证据包读取路径、sha256/bytes、manual/artifact-missing、declined 回退）及字段含义可核对；失败时卡片不呈现、不改写客户决定账本。重要边界情形已在 §2.3 列出。 |
| MK-4 契约 | 通过 | §4.2 有固定契约段：提供方（桌面窗口）、消费方（编排证据包/判断链）、不新增字段、失败语义（manual/artifact-missing，绝不 approve）、版本与变更影响（只改取值来源，属缺陷修复）。未把技术实现细节冒充业务契约。 |
| MK-5 完成标准 | 发现 | AC-1..AC-8 可核对，但 AC-3 的证据包断言没有直接测试映射（F2）；pinned-manifest-no-proposal 与 only-alias 两个分支没有对应测试（F3）；AC-6「不调用模型」T5 未说明如何断言（F11）；AC-8 方法 B 不能单独证明 app 侧派生路径（F1）。AC-7 的命令与证据记录要求完整。 |
| MK-6 风险与未决事项 | 发现 | R1-R8 与 §10 六项决策较完整，R1 的别名回归风险已被正确识别；但缺 pinned 分支 intentId 未冻结的假设（F5）、legacy 仅 `<flowId>-v1.md` 项目在修复后转为 fail-closed 的兼容性影响（F10），以及「受控副本补证」未定义（F8）。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点 | **重要** | §5.4 方法 B、§6 AC-8 | 方法 B 的确定性部分「从同一 pinned manifest 生成 GovernanceJudgeRequest」不经过 `enrichAcceptanceJudgeContext`，只能证明证据包能读 manifest 路径，不能证明 app 的派生逻辑已修复；真实 `request.resolved.judge.evidence` 是模型自述，模型可能引用真实路径而掩盖 app 仍使用别名。AC-8 允许方法 B 经披露通过，存在把「别名兜底」误判为「修复生效」的风险。 | `app/desktop/session.ts:3883`；`src/common/编排/governance-judge-evidence.ts:1072-1101`；试跑 `req-6dc353d878405acc` 的 `judge.evidence` 含别名 | AC-8 要求以方法 A 为准；或在真实 app 上增加可核对的 `judgeContext.artifacts.proposalPath` 捕获（诊断字段/受控测试钩子），与 T4 结果同时作为方法 B 的必需要件。方法 B 只能作为补充，不能单独判 pass。 |
| F2 | 漏重点 | 一般 | §5.1 T3、§6 AC-3 | AC-3 要求「证据包 `ok=false`、`reasonCode=artifact-missing`、reason 含正确路径」，但 T3 只断言 `proposalPath === undefined` 与继承值被覆盖；`governance-judge-facts.test.ts` 只断言 `missingPaths`；`acceptance-judge-minimal.test.ts` 走 `evaluateGovernanceJudgeVerdict` 的 `artifactMissingReason`，不是 `buildDecisionEvidencePacket` 的 `chooseReason`。计划中没有直接覆盖 AC-3 证据包输出的测试。 | `src/common/编排/governance-judge-evidence.ts:1072-1078`；`src/common/编排/governance-judge-verdict.ts:287-292,614-617`；`test/编排/acceptance-judge-minimal.test.ts:122-140` | 增加 T3b/T6：把捕获的 judgeContext 拼成 GovernanceJudgeRequest 调 `buildDecisionEvidencePacket`，断言 `ok=false`、`reasonCode=artifact-missing`、reason 含 `docs/proposals/<flowId>-proposal-v1.md` 且不含旧路径；或明确 AC-3 由哪个测试提供 reason 原文。 |
| F3 | 漏重点 | 一般 | §2.3 分支表、§5.1 T1-T5 | 分支表明确包含「run pinned 但 manifest 无 proposal（含 null/空串）」和「无 pin 只有 `<flowId>-v1.md` 别名」两条，但测试计划没有直接用例：T1 覆盖 pinned 有路径、T5 覆盖 pinned 路径不可读，T2 覆盖 v1/v2/v3 与别名并存；若实现误在 pinned 无 proposal 时回退最新扫描，现有测试不能发现。 | 方案 §2.2 规则 1、§2.3 行 2/4；`app/desktop/session.ts:3741` 的 `pinnedRun` 条件 | 增加 pinned-manifest-no-proposal（null/缺失/空串）与 only-alias 无 pin 的负例，断言 `proposalPath === undefined`、不调用最新扫描、证据包 artifact-missing；测试夹具同时放入别名，确认不会被选中。 |
| F4 | 漏重点 | 一般 | §9 第 3 条、§5.4 方法 A、§7 | §9 写「不创建/修改/删除试跑项目的别名文件」，但方法 A 要求把别名临时移出 `docs/proposals` 并在验证后按原字节还原；§7 已写「试跑项目文件（除 §5.4 经授权的别名临时移出/还原）」，§9 未同步。实施/验收者按 §9 字面可能拒绝方法 A，或误以为无需 §10 第 3 项授权。 | 方案 §5.4、§7、§9、§10 第 3 项 | 在 §9 明确：「产品代码不创建/修改/删除别名；§5.4 经客户授权的临时移出/还原是验证步骤，不属于产品写集」，与 §7/§10 保持一致。 |
| F5 | 漏重点 | 一般 | §2.2 规则 1、§4.2、§8 R5/R6 | pinned 分支只冻结 `proposalPath`；`run-role.ts:1146-1156` 仍在不带 pinned 路径的情况下调用 `readIntentEntryFacts` 解析 `judgeContext.intentId`（会读最新提案/产品意图）。若磁盘上的更新提案改变了 intentId，修复后可能出现「pinned v1 提案 + 最新 intentId」的意图解析冲突，方案 §2.3「按冻结契约判断」的承诺缺少该假设/测试。 | `src/pipeline/orchestration/run-role.ts:1146-1156`；`app/desktop/session.ts:3742`；`src/common/编排/governance-judge-evidence.ts:1205-1212`；`src/common/shared/intent-entry-contract.ts:224-245` | 明确 intentId 在提案版本间稳定的假设；或在 run-role 的 `readIntentEntryFacts` 传入 pinned `documents.proposal.path`/`documents.intent.path`（如纳入写集）；至少给 T1 增加「pinned v1 + 磁盘 v2 且 intentId 不同」的负例，确认 fail-closed 符合预期。 |
| F6 | 漏重点 | 建议 | §1.2 末段、§4.2 表、§4.3 | [现状] 表述不精确：`mechanical-rejection.ts:37/179`、`workflow-preconditions.ts:1222`、`governance-judge-prompt.ts:143` 是 `-proposal-v1.md` 而非 `-proposal-vN.md`；`intent-entry-contract.ts` 的 `latestVersioned` 不是全仓唯一实现（`run-manifest.ts:360-368`、`workflow-preconditions.ts:1004-1008`、`session.ts:5941-5959` 各有同类扫描）；§4.3「违反闸门 0 的单一来源要求」属过度归因，闸门 0 原文只要求「含版本解析 + run/manifest 优先」。 | 上述源码行；闸门 0 §意图理解第 1 条 | 改为「既有约定均带 `-proposal`（部分文案用 v1 版示例）」；「共享层唯一公开的解析入口 / 本次不新增第二份实现」；删除「闸门 0 的单一来源要求」或改为设计原则。 |
| F7 | 漏重点 | 建议 | §1.1、§1.4、§6 AC-8、§8 R8 | 「验收卡永远到不了客户」与「替我决策」开启时的正常语义混淆：成功时 judge 代批 accept，卡本来就不呈现客户；缺陷是自动判断无法完成并被退回。R8 称别名为「未授权变通产物」也缺少依据：试跑账本显示 chief 以 `task.created` 派发 rapporteur 创建该入口文档，属于治理侧变通，不宜写成未授权。 | 试跑 `tasks.jsonl` 中 `t-mvx540yf-22773fa3` 的创建/完成事件；`req-6dc353d878405acc` 的 `by=judge, choice=accept`；`app/desktop/customer-input.ts:1298-1332` | 统一成功行为为「judge 接受 / 验收流程完成」，不把「客户看到卡」当成功标准；把 R8 改为「治理侧绕过产品约定的变通产物（授权状态由试跑治理方确认）」。 |
| F8 | 漏重点 | 建议 | §5.4 方法 B | 「若真实记录仍引用别名，则由方法 A 或受控副本补证」中的「受控副本」未定义：位置、授权、如何保留证据、是否属于产品写集、如何避免再次被别名掩盖都未说明，作为 fallback 不可执行。 | 方案 §5.4、§7、§9 | 删除「受控副本」或具体定义（独立目录、试跑治理方授权、记录移出/还原 sha256、命令与候选版本）；同时明确它不属于产品写集，且不能替代方法 A 的区分力。 |
| F9 | 过度设计 | 建议 | §5.1 新增测试文件 | 新文件 `test/桌面应用/acceptance-proposal-path.test.ts` 计划沿用 run-pin.test.ts 的 SessionManager + customerInput 捕获方式，但 `harness`/`writeProject` 是 run-pin.test.ts 的局部函数；若复制会产生大段夹具重复，若抽共享 helper 又需要把 helper 文件加入写集。方案未说明复用/复制策略。 | `test/桌面应用/run-pin.test.ts:82-140`（局部 `writeProject`/`harness`） | 二选一写明：复用/抽取共享测试 helper（更新 §7 写集与归属），或声明复制夹具并说明维护边界；避免测试角色在实施时临时扩写集。 |
| F10 | 漏重点 | 建议 | §2.3 行 4、§1.4、§8 R1/R8 | 修复后无 pin 且只有 `<flowId>-v1.md` 的历史项目会从「旧代码可能读到该文件」变为「缺失 fail-closed」； §2.3 已写出该行为，但没有作为兼容性影响/风险单列，也没有说明是否有受影响项目（试跑别名只是其中一例）。这符合闸门 0「不回退到错误约定」，但客户应知悉行为变化。 | 方案 §2.3 行 4；试跑 `docs/proposals/textkit-cli-v1.md`；`app/desktop/session.ts:3883` | 增加 R9 或 §10 披露项：「仅 `<flowId>-v1.md` 的历史项目在无 pin 时将 fail-closed；如需兼容，另开迁移/别名需求」。不改变本方案的非目标。 |
| F11 | 漏重点 | 建议 | §5.1 T5、§6 AC-6 | AC-6 写「不调用模型」，但 T5 只计划断言证据包 `artifact-missing` 与 detail；证据包失败到 `governance-judge.ts` 直接 manual、不调用模型的路径没有被测试或 spy 覆盖。该行为是既有 fail-closed 语义，不是本次新增，但 AC-6 的证据来源需要说明，否则验收只能引用既有代码而不是 T5。 | `src/common/编排/governance-judge.ts:324-339`；方案 §5.1 T5 | 在 T5 增加 judge 层测试/模型调用 spy，或把 AC-6 的证据限定为「既有 `governance-judge.ts` 回归 + T5 证据包失败」，并写明证据来源；不要求改产品行为。 |

## 复核结论

**建议修订后提交。**

方案对根因的定位（`session.ts` 硬编码 `<flowId>-v1.md`）与闸门 0 的「最新提案 + run/manifest 优先」一致；修复方向最小、复用 `readIntentEntryFacts` 合理，未发现过度设计或与闸门 0 意图明显不一致，也没有「暂不建议提交」级别的关键信息缺失。但 F1 是影响 AC-8 验收证据有效性的重要发现（方法 B 可能无法区分「修复生效」与「别名兜底」），F2-F4 影响 AC-3 证据包断言、分支覆盖和试跑文件授权边界，建议作者按复核规则 §9 逐项处置并在闸门 1 前修订这些项；F5-F11 为一般/建议级，作者可采纳、部分采纳或不采纳并记录理由，未解决意见由沟通在闸门 1 材料中披露。

**建议在闸门 1 前必须修订/明确：**

1. F1：AC-8 不得由方法 B 单独判 pass；改为方法 A 为准，或补充真实 app 的 `judgeContext.artifacts.proposalPath` 可核对捕获并与 T4 同时作为证据。
2. F2：补 AC-3 的 `buildDecisionEvidencePacket` 直接断言（首选 T3b/T6），或明确 AC-3 reason 原文由哪个测试提供。
3. F3：补 pinned-manifest-no-proposal（null/空串/缺失）与 only-alias 无 pin 的负例。
4. F4：对齐 §9 与 §5.4/§7 的别名临时移出/还原授权边界。
5. F5：写明 intentId 在提案版本间稳定的假设，或补 pinned 路径下的 intent 解析测试；若需改 `run-role.ts`，必须更新写集和风险档位判断。
6. F8：若保留方法 B，定义「受控副本」；否则删除该 fallback，只保留方法 A。

F6/F7/F9/F10/F11 建议同步修正措辞、披露或补充测试证据说明，但不单独构成闸门 1 前的阻断项。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 未运行任何测试、未启动应用、未做真实试跑回归；所有代码结论来自 HEAD `eb77fad` 的静态阅读，未验证运行时路径、超时、卡片推达、真实 judge 模型输出或 Windows 路径行为。
- 未逐行读完 `app/desktop/session.ts`（约 7759 行）、`app/desktop/customer-input.ts`、`src/common/编排/governance-judge-evidence.ts`、`src/pipeline/orchestration/run-role.ts` 等大文件；只读了与验收 judgeContext、证据包、物证路径、manual 结算、intent 解析相关的段落。
- 未验证试跑项目在第三次验收已被 judge accept 后是否仍可重新发起验收卡、run/task 生命周期是否允许方法 A/B 的复跑；未检查试跑项目当前运行的应用版本与候选版本部署方式。
- 未检查全部 `requiredArtifactPaths` 的调用方（只按仓库内 grep 核对了 `governance-judge-evidence.ts`、`governance-judge-verdict.ts`、`governance-judge.ts` 等直接调用）；未检查仓库外脚本/发布物是否依赖旧缺失文案。
- 未核对 `docs/` 下所有引用 `<flowId>-v1.md` 的历史文档与历史 flow；F10 的兼容性影响只按代码当前行为和试跑别名推断，未量化受影响项目。
- 未核对角色卡/边界 YAML 对 `app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`、测试文件的实际写权归属；只依据方案 §7 的归属声明和现有仓库结构判断 T2 合理性。
- 未检查 `test/桌面应用/acceptance-proposal-path.test.ts`、`test/编排/governance-judge-facts.test.ts`（均尚不存在）的实现可行性细节；T1/T4/T5 的 `pinRun` 夹具是否能在现有 `writeProject` 基础上最小构造，未实际验证。
- 未检查 `docs/planning/memo.md` 与既有策划先例；未读取 `docs/communication/` 除闸门 0 外的历史记录。

**未解决意见：**

1. 方法 A 与 B 的选择属于客户决策（§10 第 3 项）；复核意见是方法 B 不能单独承担「根因已修复」的验收证明，至少要与 T4/真实 app 捕获同时使用（F1）。
2. pinned 分支的 intentId 仍由 `run-role.ts` 从最新提案/产品意图解析；是否属于本修复范围、是否需要冻结，请作者判断并记录（F5）。若作者认为 intentId 跨提案版本稳定，建议在方案中写成显式假设，并由 T1 负例覆盖。
3. 试跑别名的授权状态与修复后处置（归档/移除）由试跑治理方/客户决定；本复核不判断别名是否应删除（F7/F10）。
4. 若客户认为判断链物证取值属于治理变更而要求 T3，本复核的 T2 建议随之失效，应按 T3 重定验收范围（§10 第 2 项）。
5. 本复核不改变复核记录模板、角色定义或客户闸门；作者不得以本记录替代客户确认，沟通应在闸门 1 材料中如实披露上述未解决意见。

## 再复核记录（如发生）

### P1.1 受影响部分窄复核（2026-11-01）

- 复核版本：**P1.1**（`docs/planning/2026-11-01_design_acceptance-evidence-path.md`，395 行；SHA-256 `66c4c705e35b24fa5fa2f02fd9418517155e547f4812a7437a908492284a64c3`；按该最终快照只读）。沟通补充更正的 `8d896cd7…` 快照与最终版仅差 §5.1 一处夹具说明（新增 `docs/intents/<intentId>.md`），本复核以最终 `66c4c705…` 为准。
- 复核范围：F1-F11 的处置及受影响章节（§1.1/1.2/1.4、§2.5/2.6、§4.2/4.3、§5.1/5.4、§6、§7、§8.2、§9、§10、§11），并检查修订是否引入新矛盾；按 `planning-proposal-review.md` §9 未重读未受影响章节的全文。
- 受影响的发现更新：

| 发现 | 状态 | 窄复核说明 |
| --- | --- | --- |
| F1 | 闭合 | §5.4 已把方法 A 定为 AC-8 的唯一充分方法；方法 B 明确不经过 `enrichAcceptanceJudgeContext`、只能补充，未获方法 A 授权时 AC-8 记 insufficient evidence。§5.4/AC-8/§10 第 3 项一致，不再可能仅凭方法 B 或一次 accept 判 pass。 |
| F2 | 闭合 | T3 已增加 `buildDecisionEvidencePacket` 直接断言（`ok=false`、`reasonCode=artifact-missing`、reason 含正确路径且不含旧路径）；AC-3 证据来源明确。 |
| F3 | 闭合 | T1b（pinned manifest 无 proposal 的 null/缺失/空串三变体，fixture 同时放 v2/v3 与别名）与 T2b（无 pin 仅别名）已加入；AC-1/AC-2 同步。实现若误回退最新扫描或选中别名，断言会失败。 |
| F4 | 闭合 | §9 已改为「产品代码不创建/修改/删除别名；§5.4 方法 A 的临时移出/还原是经客户/试跑所有者授权的验证步骤，不属于产品写集」；§7/§5.4/§10 第 3 项一致，授权边界不再自相矛盾。 |
| F5 | 闭合（部分采纳） | 未扩大写集改 `run-role.ts`；§2.6/R10/§10 第 7 项明确要求客户知悉 intentId 稳定假设，并声明若最新提案改变 intentId 会因意图冲突 fail-closed、不误 approve。已核对 `resolveIntentReference` → `resolveIntentEntryReference`：request 与 proposal 的 intentId 不一致返回 `intent-ambiguous`；`test/编排/decision-evidence-packet.test.ts:207-221` 有既有覆盖。未新增「pinned v1 + 最新 v2 不同 intentId」的专门 session 用例，作为部分采纳的披露可接受。 |
| F6 | 闭合 | §1.2 已改为「全仓既有约定均带 `-proposal`（部分文案用 v1 示例）」；§2.5 明确 `latestVersioned` 不是全仓唯一，列出既有私有扫描；§4.2 改为「既有实现之一（本次复用的公开入口）」；§4.3 不再把单一来源归因闸门 0。正文无「全仓唯一/闸门 0 单一来源要求」残留（§11 处置表内的历史引用除外）。 |
| F7 | 基本闭合（N1 建议） | §1.1/§1.4/R8 已改为「judge 代批 accept / 验收流程完成」语义，R8 改为治理侧变通产物、授权状态由试跑治理方确认。AC-8 仍写「客户卡未被错误的自动决策拦截」，建议改为「验收流程未被错误的自动决策拦截」，避免与 §1.1 的「客户本来就不需要看到卡」再次混淆；不阻断。 |
| F8 | 闭合 | §5.4 已删除未定义的「受控副本」，明确方法 B 只能补充、未获方法 A 授权时 AC-8 为 insufficient evidence；不再存在未说明的 fallback。 |
| F9 | 闭合 | 已明确自包含最小夹具，不抽共享 helper、不改 `run-pin.test.ts`；最终版补入 `docs/intents/<intentId>.md`（证据包意图基准）。已核对 `writeRunManifest` 导出且 `validateRunManifest` 只要求 schema/runId/flowId/createdAt/updatedAt/schemas/documents/execution；无 roster/modules 时 `loadPinnedRoster` 返回 not-ok 而不抛错，session 仍能生成 `judgeContext.artifacts`，最小 pinned manifest 方案静态可行。 |
| F10 | 闭合 | R9 与 §10 第 6 项已披露：无 pin 且仅 `<flowId>-v1.md` 的历史项目修复后 fail-closed；如需兼容另开迁移/别名需求。 |
| F11 | 闭合 | AC-6 证据已限定为 T5 证据包失败 + 既有 `governance-judge.ts:324-339` 控制流（本修复未改），不新增模型 spy；T5 只断言证据包失败，证据来源与 AC-6 表述一致。 |

- **F1–F4 已闭合**（按上表逐项核对）。
- 新发现：
  - N1（建议，非阻断）：AC-8 仍使用「客户卡未被错误的自动决策拦截」，与 §1.1/§1.4 已明确的「judge 代批 accept、客户本来不需要看到卡」语义不完全一致；建议改为「验收流程未被错误的自动决策拦截」或在 AC-8 引用 §1.1 的语义说明。该问题不影响 F1-F4 的闭合与验收证据路线。
- 窄复核结论：**建议提交客户确认**（仅为本轮 P1.1 的复核建议；不是批准、客户闸门、实施授权或验收基线）。F1–F4 已闭合；F5-F11 的处置/披露可接受；N1 为建议级文字统一，不构成闸门 1 前的阻断项。
- 限制：本轮未运行测试/应用/真实试跑；F5 的「pinned v1 + 最新 v2 不同 intentId」没有专门新增用例（依据解析器语义与既有 `intent-ambiguous` 测试判断）；F9 的最小 pinned manifest 与 T1b/T2b/T3/T5 夹具未实际执行；方法 A 的真实重发卡与别名移出/还原未执行。未复核 P1.1 未受影响章节的全文。

### P1.2 确认性说明（2026-11-01）

- 复核版本：**P1.2**（`docs/planning/2026-11-01_design_acceptance-evidence-path.md`，396 行；SHA-256 `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`；按该最终快照只读）。此前 `dea0c57b…` 快照仅差 §11 内嵌复核记录元数据：最终版删去 §11 内嵌的复核记录行数/SHA-256，改为以复核记录/交付报告为准；设计、AC、测试、写集、风险均未变。
- 复核范围：仅 N1 采纳、版本/处置表更新及 §11 复核记录元数据去内嵌（标题、状态、独立复核行、AC-8 措辞、§11 窄复核结论与 N1 处置行）；按确认性说明未重读未受影响章节全文。
- 核对结果：AC-8 已改为「验收流程未被错误的自动决策拦截（judge 代批 accept 或按客户选择完成；客户本来不需要看到卡）」，与 §1.1 的「judge 代批 accept、客户本来不需要看到卡」语义一致；§11 已记录窄复核结论并新增 N1 处置行，且不再内嵌复核记录行数/哈希；抽查 F1-F11 对应章节未发现设计、分支、测试计划、写集或风险档位变化。**N1 闭合。**
- 确认：不影响 F1–F11 的闭合与 P1.1 窄复核结论；结论仍为 **建议提交客户确认**（仅为建议，不是批准、客户闸门、实施授权或验收基线）。
- 限制：本轮未运行测试/应用/真实试跑；按确认性说明只复核 N1 与版本/处置表更新，未全文重读 P1.2；P1.1 已记录的限制继续有效。
