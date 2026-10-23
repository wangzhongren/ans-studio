风险档位：T3｜判定依据：治理/权限变更（内置治理角色职责/写权、appointment 发起人、流程步骤归属与验收证据来源变更；依据 references/testing.md「Risk-Based Verification and Change Packages」，治理变更即使只改文档也非 T0）｜选定检查：53 个产品/测试候选哈希逐文件复算（mismatches=0）、逐角色写集/差异核对、受影响单测/层测试/集成、canonical e2e 154/154、T3 全量回归 run1/run2 3448/3421/9/18 与阶段 A 基线对照、typecheck/typecheck:renderer/build:renderer、真实 Electron e2e 与治理链演示、P1–P15/G1–G4 逐行核对｜复用证据：阶段 A 基线日志仅用于既有失败分类；候选层测试/e2e/启动演示为同候选最新证据；isolated/whole-file rerun 仅用于并行偶发分类；未把过期证据当作通过证据｜全量回归：已执行（测试角色 run1/run2 原始日志；统筹串行复核 3448/3421/9/18 exit 1；9 项均为阶段 A 既有 Windows symlink EPERM，零新增红）

# 验收报告：治理分工第 1、3、5 项（governance-split-1-3-5）

- 任务 ID：`2026-10-22-governance-split-1-3-5`
- 产品 flowId：`governance-split-1-3-5`
- 阶段：**实施后独立验收判定**（N10）
- 报告版本：`governance-split-1-3-5-report-v1`
- 判定时间：2026-10-22
- 判定角色：ANS 内置独立验收（`references/acceptance-role.md`）
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-22_design_governance-split-1-3-5.md`；blob `71a0ea72c889eebac9bb637d0bda72aa8d99773a`；SHA-256 `2e4b486df4f3aaa5d99b8ba6b87b640ca289cd491333fee99a2666c85c89b442`）
- 验收标准：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`（blob `85f50a7bd26097e43d10400ef5cbcc579be22166`；SHA-256 `e97eadec8ca41205c515b3ae559259e9de006c93b17a7f4ad898752c65346259`；T3；写盘后冻结，未修改）
- 变更包：`docs/scheduling/governance-split-1-3-5-change-v1.md`（blob `fa2d6aba3775fd523a3e447cb6f0105e87352828`；SHA-256 `551780ea7b81289acd5b5bc70a5d840804a9d4d04f0a6b2542392ab69da52db9`）
- 候选：**53 个产品/测试文件**；候选清单 `角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-phase-e-evidence/candidate/hashes.tsv`（`git hash-object` = `743f41fe07eb172624dd4353dc1e51bb8042cb0f`；SHA-256 = `2ca97bd78439a66c383615c105d6002fa635cee47745f427d1c3be3646fdb503`）；HEAD `c3693ecdcb78bd83def351c0f2967571dad7174c`（未变）
- 总体结论：**通过（当前候选）**；附 §5 残余观察。结论只对上述候选有效，不授权提交、推送、合并、发布或任何对外操作。

---

## 一、判定摘要

1. **P1–P15 全部适用行 pass，G1–G4 pass；无 fail，无 insufficient evidence。**
2. 当前候选满足客户闸门 1 确认的方案 v1：第 1 项（团队计划归 Convener、Crew 只写卡、appointment→Crew 回路/去重/重启/拒绝取消、写卡校验后派 Convener、flow/账本/写权/UI 同步）、第 3 项（实施前标准、T0–T3、证据复用、全量回归条件、报告首行五项、acceptance 卡/账本/路径、与工程法案 §二.9 一致）、第 5 项（内容清单、结构硬校验、Convener readiness、gap 回路、api-spec not-applicable、只对新/改角色）均已落地并有原始证据。
3. 第 2、4 项、角色命名/路径、工程基线文本、历史文件等非目标未被改动。
4. T3 全量回归已对当前候选执行：测试角色两次原始全量日志均为 3448 / 3421 pass / 9 fail / 18 skipped；9 项失败逐条与阶段 A 基线相同（Windows symlink EPERM），**零本次新增确定性失败**。统筹串行复核同计数。9 项既有失败不构成通过依据，也不构成本次新增红。
5. 残余观察：并行负载下两个桌面测试偶发失败（隔离/整文件/串行通过，测试角色两次全量未复现，基线亦有同类偶发）；`dispatch-delivery.test.ts` 写集补充的记录追溯；一次 `write-sequencing.test.ts` 瞬时挂起；真实启动/演示使用脚本桩模型（Electron/preload/renderer/Interface/门禁/账本为真实产品代码）；在线模型/凭据不在本轮验收面。详见 §5。
6. 结论为**通过（当前候选）**，不是对后续候选的长期授权；候选任一产品/测试/角色卡/边界文件变化，受影响证据失效，需按标准 §3.3 重判。

---

## 二、基线与候选核对

### 2.1 基线文档

| 文件 | 角色 | 判定时 blob | 判定时 SHA-256 | 与标准写盘点对照 |
| --- | --- | --- | --- | --- |
| `docs/planning/2026-10-22_design_governance-split-1-3-5.md` | 验收基线（方案 v1） | `71a0ea72c889eebac9bb637d0bda72aa8d99773a` | `2e4b486df4f3aaa5d99b8ba6b87b640ca289cd491333fee99a2666c85c89b442` | **未变**，基线有效 |
| `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` | 闸门 0/1/2 与实施授权记录 | `0153d1ccd9ade67b27bf959a7182781ee2b5b8ef` | `bd683a1784e5cb253201d20de58fdabe9de4ad0c71fffdbf02e9487dbd7dfb92` | 标准写盘时为 `ee7ab8c7…` / `f2280a8c…`；差异是后续追加闸门 2 记录与标准引用，**闸门 0/1 意图与方案确认内容未变** |
| `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` | 闸门 2 范围/写集（非标准来源） | `26357c74d1264fde32c249ab3eb8518004d9878c` | `0d096baadee7dc28eb59ebd69e0bb74ee4243ef93b434892263f3019ee24e281` | 标准写盘时为 `a057030c…` / `a3755cbb…`；差异是追加 §11.11–§11.13（阶段 D 补充修复、阶段 E 结果）；写集补充见 G2 |
| `docs/acceptance/governance-split-1-3-5-criteria-v1.md` | 验收标准 v1 | `85f50a7bd26097e43d10400ef5cbcc579be22166` | `e97eadec8ca41205c515b3ae559259e9de006c93b17a7f4ad898752c65346259` | **未变**，标准冻结有效 |

结论：方案 v1 与标准 v1 未变，验收基线有效。意图记录与团队计划的变化是管理记录追加（闸门 2/阶段 E/写集补充），不是方案实质变更；G2 对写集补充另有追溯说明。

### 2.2 候选身份

- HEAD：`c3693ecdcb78bd83def351c0f2967571dad7174c`，`git log` 最新提交仍是该 HEAD；未提交。
- 候选清单：53 个产品/测试文件，路径见 `.../candidate/candidate-paths.txt`（SHA-256 `ef0d9abef35daa9375c5e10614c9fd59b6775a74480f18654d6bdc226775e75d`）。
- 逐文件哈希：`.../candidate/hashes.tsv` 与 `.../candidate/hashes-recheck.tsv` 均 53 行；验收按清单逐行复算 `git hash-object` + `sha256sum`，**mismatches=0**。
- `git diff --cached --name-only`：空（`.../candidate/diff-cached-name-only.txt` 为 0 字节，SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`）。
- `git status --short`：候选改动为 51 个已跟踪产品/测试文件的 `M` + 2 个未跟踪新测试文件（`p-team-plan-guard.test.ts`、`phase-e-governance-demo.mjs`）；另有角色自身文档、沟通 memo 与 `docs/` 管理记录，按 G1/G2 不混入产品候选。
- 候选分组与方案 §10/团队计划 §4.2 对应：Model/Provider 4、门禁引擎 4、编排 18、桌面窗口 8、桌面UI 4、测试 15，合计 53。

### 2.3 变更包与档位

- 变更包 frontmatter：`flowId: governance-split-1-3-5`、`version: 1`、`riskTier: T3`、`candidate: 743f41fe…`、`candidateSha256: 2ca97bd7…`、`head: c3693ec…`。
- 档位核对：本变更改变内置治理角色职责/写权、appointment 发起人、流程步骤归属、验收证据来源与判断门槛，属治理/权限变更；按 `references/testing.md` 为 **T3**，未压档。验收接受 T3，不降档。
- 变更包内容：候选与范围、53 文件哈希、任务节点 N1–N11、证据链接、T3 依据、复用/失效说明、已知问题；满足 G1。

---

## 三、验收表

> 证据 ID 见 §四「证据索引」；`CAND` = 53 文件候选（HEAD `c3693ec…`；清单 `743f41fe…` / `2ca97bd7…`）。表中「实际证据路径/哈希」给出主证据文件与关键候选文件 hash-object；完整路径/哈希见 §四。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | 团队计划由 Convener 唯一撰写，放 `docs/scheduling/<flowId>-team-v1.md`（新版本 `-team-vN.md`），含 flowId/version/riskTier/推荐集及每个推荐角色的 roleId、职责目标、能力要求、唯一写集、依赖；Crew 只读团队计划，不再提名/选择角色/组建团队，不再发 appointment、不再写 `docs/nominations/`。 | 角色卡文本/注册表 diff；团队计划样例；Crew 越权负例；e2e；候选哈希。 | E2 `governance-roles.ts` `4573b5cc…`；E2 `governance-trio.test.ts` `daaa9f4f…`、`governance-standard-workflow.test.ts` `813b4693…`；E7 e2e-auto 68/68；E1 `CAND`。 | CAND | 门禁引擎、编排、测试 | `NOMINATOR_CARD_TEXT` 已移除提名/选择角色/组建团队，改为按团队计划写卡；注册表 Crew 移除 `docs/nominations/`、Convener 增 `docs/scheduling/`；Crew 发 appointment/写 nominations 负例通过；团队计划卡前守卫 7 负例通过。 | pass |
| P2 | appointment 卡由 Convener 发起；卡前守卫确定性校验团队计划存在、flowId 一致、推荐集非空无重复不含内置角色、卡选项覆盖推荐集且不含内置角色、每个推荐角色有职责/能力/写集/依赖行；失败不生成客户卡、不镜像、不调判断、不写账本、不占 pending，退回 Convener。Crew 卡种白名单不含 appointment，Convener 含 appointment；不新增 cardKind。 | 卡种白名单/默认卡种 diff；守卫负例矩阵；判断物证 diff；无效卡不写账本测试；e2e；候选哈希。 | E2 `run-role.ts` `e77e9ffd…`；E2 `p-team-plan-guard.test.ts` `3675e3e3…`（7 负例）；E2 `governance-judge.test.ts` `97d320f4…`（3094/3436）；E2 `governance-session.test.ts` `37c53984…`（885）；E7 e2e-auto 68/68。 | CAND | 编排、运行时核心、门禁引擎、测试 | 守卫六项校验落地；7 个负例均断言无客户卡/无判断/无账本/不派 Crew；Crew appointment 被结构性拒绝；Convener appointment 卡种与默认卡种生效。 | pass |
| P3 | 客户 appointment 决定后应用派 Crew（不是 Convener），任务含 flowId、团队计划路径/版本、任命名单、`stepId=role-cards`；账本 appointment 决定绑定团队计划 path/version/sha256；运行期 Set + 账本双重去重，重启/重复事件不重派、不漏派；拒绝/取消不派 Crew；客户手选与推荐集不同时按实际名单写卡。 | 应用回路 diff；e2e 时序；账本输出；计划绑定；重启/重复/拒绝/取消测试；候选哈希。 | E2 `interface.ts` `2f0282d8…`（3561/2523）；E2 `governance-advance.ts` `39f8d391…`；E2 `c-appointment-timing.test.ts` `b8ca1389…`（3/3b/3c）；E2 `i-full-chain.test.ts` `908bedcd…`；E2 `interface.test.ts` `0244d9da…`；E7 e2e-auto 68/68。 | CAND | 桌面窗口、编排、测试 | appointment 决定后只派 Crew；Crew 恰一条写卡任务；重复事件运行期去重、重启账本去重；拒绝/取消零派发；账本 `stepId=role-cards`、actor=app；客户手选与推荐集不同时按实际名单并提示 Convener v2。 | pass |
| P4 | Crew 写盘后应用强制刷新 listing 并跑扩展后的 `validateAppointmentArtifacts`；通过才派 Convener 做 readiness；失败按来源分流（Crew 文件 vs 团队计划）、反馈后重发 appointment-write、有界重试、最终失败落 Lead 系统行；不派 Convener、不把 appointment 步骤标 done。 | 校验器/反馈/系统行 diff；每个结构负例；来源分流测试；状态断言；e2e；候选哈希。 | E2 `interface.ts` `2f0282d8…`（2264/2780/4294/4335/4367）；E2 `c-appointment-timing.test.ts` `b8ca1389…`（3/3b）；E2 `l-crew-write-validation` 在 E7 e2e-auto 68/68；E7 `suite-governance-e2e-auto.log`。 | CAND | 桌面窗口、测试 | 结构校验覆盖 role-card/boundary/工作文档；失败按 Crew/计划来源分流；写卡前不派 Convener；有界重试不循环；appointment 步骤未伪标 done。 | pass |
| P5 | flow/账本同步：团队计划、readiness、标准、变更包作为 artifact 步骤可观察；appointment 决定 power/物证更新（Convener 发起 → schedule；绑定团队计划版本/哈希）；不新增 `FlowStepKind`（Q4 A），用 step id + 现有 kind；旧 flow 不被破坏；不观察 `角色卡/`。 | flow-state/flow-service/ledger/judge 测试；flow YAML 模板；artifact.observed；appointment power/物证；旧 flow 夹具；候选哈希。 | E2 `flow-state.ts` `02ee9542…`；E2 `flow-service.ts` `2679703…`；E2 `governance-ledger.ts` `c29a78ae…`；E2 `flow-state.test.ts` `b4f3965c…`（157）；E2 `flow-service.test.ts` `0c535308…`（741）；E2 `governance-judge.test.ts` `97d320f4…`；E7 e2e-auto 68/68。 | CAND | 编排、测试 | `FLOW_STEP_KINDS` 仍为 4 值；新 step id 用现有 kind；团队计划/readiness/标准/变更包均可 artifact.observed；appointment power=schedule 且绑定团队计划；不观察 `角色卡/`；旧 flow 仍可解析。 | pass |
| P6 | 写权只按本项调整：Convener `+docs/scheduling/`；Crew `−docs/nominations/` 并新增禁写 `docs/scheduling/`；Verifier `+docs/acceptance/`；其他角色不变；Convener 不获得 `角色卡/`；Crew 不获得 `docs/scheduling/`。 | 注册表 entries/preauthorized/forbidden diff；写权正/负例；其他角色 entries 未变；候选哈希。 | E2 `governance-roles.ts` `4573b5cc…`；E2 `governance-trio.test.ts` `daaa9f4f…`（172/984/1009/1037/1070）；E2 `governance-liaison-verify/e-audit.test.ts` `032372f1…`；E7 trio 22/22。 | CAND | 门禁引擎、编排、测试 | 预授权目录与禁写严格按方案调整；Convener 无 `角色卡/`、Crew 无 `docs/scheduling/`、Verifier 无 `角色卡/`/团队计划；Liaison/Rapporteur 不获新目录；写权正/负例通过。 | pass |
| P7 | 第 5 项内容清单落地：Crew 卡文本/写卡任务要求 + 确定性结构校验覆盖 role-card 必需章节、boundary 必填条目、feature-map、functional-description、memo、api-spec 或 `not-applicable` + 非空理由；完整清单只对 `new`/`changed` 角色强制，`existing` 只做存在/格式检查并记录 warning；不把文件存在当能力描述完成。 | Crew 卡文本/任务 diff；校验器负例矩阵；代表性角色卡样例；e2e；候选哈希。 | E2 `governance-roles.ts` `4573b5cc…`；E2 `interface.ts` `2f0282d8…`；E2 `governance-standard-workflow.test.ts` `813b4693…`（137）；E2 `interface.test.ts` `0244d9da…`（4335/4367）；E7 e2e-auto 68/68。 | CAND | 门禁引擎、桌面窗口、测试 | Crew 卡逐项列出第 5 项清单；new/changed 缺章节/工作文档逐项反馈 Crew；existing 仅最低检查 warning 不阻塞；api-spec not-applicable 需非空理由；结构通过文案不宣称能力完成。 | pass |
| P8 | 能力语义完整性由 Convener readiness 复核：`docs/scheduling/<flowId>-readiness-v1.md` 逐角色核对职责目标/能力/写集/依赖/交接/质量，`status: pass 或 gaps`；gap 退回 Crew；计划缺细节退回 Convener；应用只宣称结构校验通过、不宣称能力描述已完成；readiness pass 后才派发项目角色。 | readiness 记录模板/样例；Convener 卡/提示 diff；gap/计划缺失回路；系统行文案；e2e；候选哈希。 | E2 `governance-advance.ts` `39f8d391…`（readiness 任务文案）；E2 `interface.ts` `2f0282d8…`（4294）；E2 `c-appointment-timing.test.ts` `b8ca1389…`（3）；E2 `governance-standard-workflow.test.ts` `813b4693…`（174）；E7 e2e-auto 68/68。 | CAND | 门禁引擎、编排、桌面窗口、测试 | readiness 记录路径/字段落地；Crew 文件问题与计划缺细节分流；readiness 任务文案含「能力内容尚未判定」；结构通过后才派 Convener；gap 回路不直接派发。 | pass |
| P9 | 实施前标准：Verifier 在 appointment 决定后、实施派发前写 `docs/acceptance/<flowId>-criteria-v1.md`；标准含验收表、T0–T3、判定规则、证据计划、版本冻结；版本/flowId 可核对；O2 硬门槛在 `evaluateDispatchGate` 对已有 appointment 决定的 flow 要求标准存在且结构合格，`accept-quick`/旧流程豁免须显式测试；缺失不派实施。 | 标准文件样例；派发门槛测试；Verifier 任务文案；`dispatchAcceptanceForFlow` diff；e2e；候选哈希。 | E2 `governance-gate.ts` `d932a6e5…`（O2 门）；E2 `governance-gate.test.ts` `edec4821…`（287/327）；E2 `acceptance-dispatch.test.ts` `0b4a1ca6…`（2071）；E2 `f-acceptance-gate.test.ts` `b8ebde75…`、`i-full-chain.test.ts` `908bedcd…`；E7 e2e-auto 68/68。 | CAND | 门禁引擎、编排、桌面窗口、测试 | O2 门对缺标准/结构不合格拒；accept-quick 与无 appointment 旧流程显式豁免；Verifier 写标准任务 `stepId=acceptance-criteria` 恰一次；标准结构校验覆盖验收表/档位/判定/证据计划/冻结。 | pass |
| P10 | 风险档位：变更包 `docs/scheduling/<flowId>-change-v1.md` 标 T0–T3；团队计划档位为下限；Verifier 可升不可降；报告首行五项；档位不符退回/升档；全量回归只在 T3/证据不足；`qualityTier` 不是风险档位；本任务 T3 必须执行适用全量回归。 | 变更包样例；判断门槛/报告首行测试；档位不符/降档/升档负例；本任务变更包 T3；全量回归原始输出；候选哈希。 | E12 变更包 `551780ea…`（T3）；E2 `governance-judge.ts` `a0d315e6…`（首行五项/档位）；E2 `governance-judge.test.ts` `97d320f4…`（1103/2125）；E2 `b-card-kinds.test.ts` `a584c737…`（503）；E4/E5 全量日志。 | CAND | 统筹、编排、桌面窗口、测试 | 变更包 riskTier=T3；报告首行缺项/低于变更包档位均 manual；升档允许、降档拒绝；变更包缺 riskTier 不派判定；本任务 T3 全量回归已执行。 | pass |
| P11 | 证据复用/检查选择：Verifier 核对开发/测试/装配角色的原始证据，只补缺失/失效/高风险；同候选有效证据可复用；候选/输入/依赖/契约变化使受影响证据失效；真实启动/演示证据必须存在（可由实施/装配/测试角色产出），缺失不得建议 accept；Verifier 不默认自己跑全部测试。 | Verifier 卡/提示/验收任务文案 diff；证据复用/失效测试；报告复用证据栏；真实启动/演示证据；测试日志；候选哈希。 | E2 `governance-roles.ts` `4573b5cc…`（Verifier 标准工作流）；E2 `governance-advance.ts` `39f8d391…`（验收任务文案）；E2 `governance-standard-workflow.test.ts` `813b4693…`（595）；E2 `acceptance-dispatch.test.ts` `0b4a1ca6…`（1272）；E11 Electron `E2E_PASS=true`、治理链 `DEMO_PASS=true`（17+7 截图）。 | CAND | 门禁引擎、编排、桌面窗口、测试 | Verifier 卡改为核对原始证据/只补缺失失效高风险；验收任务文案带标准/变更包/档位/报告路径；真实 Electron 与治理链演示通过；未默认自称全跑。 | pass |
| P12 | acceptance 卡/账本/路径：Verifier 在报告后发 `cardKind=acceptance`；标准/报告在 `docs/acceptance/`，详细证据在 `docs/verification/`；验收决定仍 `customer.decision{decisionKind:"acceptance"}`；判断门槛核对标准/报告/首行五项/档位不低于变更包/收尾门；不新增 cardKind/decision kind；标准/报告不是客户决定。 | 判断门槛/物证 diff；账本条目；路径断言；UI 提示；e2e；候选哈希。 | E2 `governance-judge.ts` `a0d315e6…`；E2 `governance-judge.test.ts` `97d320f4…`（1103）；E2 `acceptance-dispatch.test.ts` `0b4a1ca6…`（2071/2126）；E2 `interface.ts` `2f0282d8…`（`noteVerifierSettle` 报告路径）；E7 e2e-auto 68/68。 | CAND | 编排、桌面窗口、桌面UI、测试 | 报告路径进 `docs/acceptance/`；判定门槛要求标准/报告/变更包/首行五项/档位；acceptance 决定仍走 customer.decision；标准/报告走 artifact/写盘确认，未新增 cardKind/decision；UI 提示同步。 | pass |
| P13 | 与工程法案 §二.9/工程基线一致：不重复、不弱化；真实启动/演示要求保留；T0–T3 定义引用 `references/testing.md`；不扩张写权；`ENGINEERING_QUALITY_BASELINE` 文本与 §二.9 文本不变。 | 规则对照表；基线文本/`project-rules.md` diff（应为空）；报告；相关测试；候选哈希。 | E2 `governance-roles.ts` `4573b5cc…`（`ENGINEERING_QUALITY_BASELINE` 常量未变；仅 Verifier 工作流步骤更新）；`角色卡/项目管理/docs/project-rules.md` 无 diff；E2 `governance-standard-workflow.test.ts` `813b4693…`（595/641）；E13 标准；E12 变更包。 | CAND | 独立验收、统筹、门禁引擎 | 工程基线常量逐字未变；§二.9 文件未改；Verifier 卡仍保留「未真实运行/演示不得建议 accept」；档位定义引用 testing.md；写权调整限于 P6。 | pass |
| P14 | 非目标不变：第 2 项客户入口、第 4 项派发权、角色命名/内部 id/路径、其他无关治理差异均未改；不新增固定测试角色、不新增 cardKind、不删除历史。 | 代码/测试 diff；id/显示名 grep；客户入口/派发权回归测试；e2e；候选哈希。 | E2 `run-role.ts` `e77e9ffd…`、`governance-gate.ts` `d932a6e5…`（ACTION_ROLE dispatch 仍 convener）；E2 `governance-trio.test.ts` `daaa9f4f…`（201 能力矩阵）；E2 `governance-session.test.ts` `37c53984…`（800/849/885）；E2 `dispatch-delivery.test.ts` `73bdb768…`（routeDispatch）；E2 `runtime.ts` `120db534…`（`GovernanceStepKind` 值未增；cardKind 类型未增）。 | CAND | 测试、独立验收、桌面窗口、编排 | 角色 id/显示名/路径未改；第 2 项客户通道仅新增 teamPlanPath 透传；第 4 项 dispatch 权仍 convener；无新增固定测试角色、无新 cardKind/FlowStepKind；历史文件未删除。 | pass |
| P15 | 测试与证据：受影响单测/层测试/集成/e2e 更新并通过；T3 适用全量回归执行；原始输出可复算；不弱化断言；文档状态如实（`implemented-unverified`，不写 `verified`，不把计划写成结果）。 | 全部测试命令/输出；全量回归记录与 N3 基线对照；e2e；候选哈希；diff/status；文档状态摘录。 | E4/E5 全量 run1/run2（3448/3421/9/18）；E6 基线（3416/3386/12/18、3416/3388/10/18）；E7 e2e 154/154；E8 `test/测试` 745/752（唯一红基线 EPERM）；E9 real-entry 16/16；E10 typecheck/typecheck:renderer/build:renderer 全 0；E11 真实启动/演示；E1/E2 候选。 | CAND | 测试、各实施角色、统筹 | 受影响测试全部更新并通过；全量两次同计数，9 红均为基线 EPERM；real-entry F3 改为快照后 16/16；dispatch-delivery 正例补标准、反例缺/坏标准；无 skip/todo/only 新增；文档状态 `implemented-unverified`。 | pass（残余观察见 §5.1） |
| G1 | 变更包完整、候选身份可复算：候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、HEAD、改动路径、任务节点 N1–N11、证据链接、风险档位 T3、复用证据与失效说明；候选与证据匹配；`docs/` 管理记录不混入产品候选。 | 变更包原文；原始哈希/status 输出；验收复算；证据链接；候选哈希。 | E12 变更包 `fa2d6aba…` / `551780ea…`；E1 53 文件 `hashes.tsv` `2ca97bd7…`；E3 `status-short` `a9cb5bb3…`、`head` `78226c18…`、`diff-cached` 空；验收逐文件复算 0 不一致。 | CAND | 统筹、独立验收 | 变更包字段齐全；53 文件哈希逐行与工作树一致；HEAD 未变、暂存为空；`docs/` 管理记录与角色文档未混入 53 文件候选。 | pass |
| G2 | 写集与授权：所有改动路径在闸门 2 确认的逐角色写集内；无越界、无保护文件/角色卡边界改动、无未授权用户改动；不提交/不推送/不合并/不发布；worker 不写 `docs/scheduling/`、`docs/acceptance/`；角色自身文档按写集允许。 | `git diff --name-only`/`--stat`/`status`/`--cached`；与团队计划 §4.2/§8 对照；无提交记录；boundary 文件未变；候选哈希。 | E3 `candidate-paths` `ef0d9abe…`、`diff-name-only` `83b329a4…`、`diff-stat` `b6470c38…`、`status-short` `a9cb5bb3…`；E14 团队计划 §4.2/§8/§11.11；E1 `CAND`。 | CAND | 统筹、独立验收 | 53 路径均在对应角色 Section 1 与团队计划当前写集内；未新建 `test/桌面应用/` 文件；无暂存/提交/推送；无 boundary/role-card 改动；worker 未写顶层 `docs/scheduling/`、`docs/acceptance/`。`dispatch-delivery.test.ts` 属团队计划 §11.11 补充写集，追溯说明见 §5.2。 | pass（追溯补充见 §5.2） |
| G3 | UI 同步：appointment 徽标/提示改为「任命」、Crew 提示改为「客户任命后打开写卡」、下一步/报告路径/验收提示同步；角色显示名/内部 id/路径不变；客户入口不变。 | 渲染层 diff；`test/桌面UI/` 测试；`renderer.test.ts`；`typecheck:renderer`；`build:renderer`；真实启动/演示 UI；候选哈希。 | E2 `governance-view.ts` `f72188bd…`、`role-view.ts` `a3ad631c…`；E2 `governance-view.test.ts` `38634fec…`、`role-view.test.ts` `7cbccd4a…`；E10 `typecheck:renderer` 0、`build:renderer` 0；E11 演示截图。 | CAND | 桌面UI、测试 | appointment 徽标「任命」、appointment-write「任命写卡」；Crew 空态提示改为「客户任命后打开写卡」；显示名/内部 id/路径未改；客户入口未改。 | pass |
| G4 | 兼容与迁移（O4、Q1/Q11 A）：旧 nomination 文件保留只读/过渡回落；旧 flow YAML 与旧角色卡不被删除/重写；既有角色卡只做最低格式检查、不强制补齐第 5 项；新流程使用新结构；测试夹具使用独立 flowId/临时目录，不覆盖既有 `docs/scheduling/` 记录。 | 兼容/回落测试；旧 flow 夹具；文件清单/无删除 diff；测试夹具隔离；候选哈希。 | E2 `governance-judge.test.ts` `97d320f4…`（811 legacy 提名回落）；E2 `flow-state.test.ts` `b4f3965c…`（旧 nomination 仍可解析）；E2 `real-entry.test.ts` `d331de90…`（快照 docs/scheduling，16/16）；E2 `interface.test.ts` `0244d9da…`（4367 existing warning）；E3 `diff-name-only` 无删除历史文件。 | CAND | 编排、桌面窗口、测试 | 旧提名/旧 flow/旧角色卡保留；legacy 回落与 existing warning 测试通过；real-entry 快照确认演示不新增/不改写 `docs/scheduling/` 管理记录；测试夹具使用临时项目。 | pass |

---

## 四、证据索引

> 以下为判定时实际读取/复算的原始证据；SHA-256 为文件内容哈希。验收未修改任何候选文件。

### 4.1 候选与变更包

| ID | 路径 | SHA-256 |
| --- | --- | --- |
| E12 | `docs/scheduling/governance-split-1-3-5-change-v1.md`（blob `fa2d6aba3775fd523a3e447cb6f0105e87352828`） | `551780ea7b81289acd5b5bc70a5d840804a9d4d04f0a6b2542392ab69da52db9` |
| E1 | `角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-phase-e-evidence/candidate/hashes.tsv`（53 行；清单 hash `743f41fe07eb172624dd4353dc1e51bb8042cb0f`） | `2ca97bd78439a66c383615c105d6002fa635cee47745f427d1c3be3646fdb503` |
| E3 | `.../candidate/candidate-paths.txt` | `ef0d9abef35daa9375c5e10614c9fd59b6775a74480f18654d6bdc226775e75d` |
| E3 | `.../candidate/status-short.txt` | `a9cb5bb3b2cd6545588b873ab6459eefbe0f2c3c106d46a2d365c6ac0d5e5512` |
| E3 | `.../candidate/head.txt` | `78226c18231cc079345b5e272507c342c29d31194728e7eb50af0c858227160c` |
| E3 | `.../candidate/diff-cached-name-only.txt`（空） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| E3 | `.../candidate/diff-name-only.txt` | `83b329a49fe76c82daf98a8bf7134d858dadf03f50178645609fa7407e7d1bf2` |
| E3 | `.../candidate/diff-stat.txt` | `b6470c38b7185b9759fcb58f0e4863cf50f9cd01c715fea761ffcd05eca71765` |
| E2 | `.../candidate/full.diff` | `a1df5977b1dca764717cb529859279ddc94306d4e451a9477e9c2372d7508c9c` |

### 4.2 测试与全量回归

| ID | 路径 | SHA-256 |
| --- | --- | --- |
| E4 | `.../phase-e-evidence/full-test-node-run1.log`（3448/3421/9/18；exit 1；22,539ms） | `1f3166c54dffee83d687c8a21d0d8a74f3320ca653b973fde74545f8305cb605` |
| E4 | `.../phase-e-evidence/full-test-node-run2.log`（3448/3421/9/18；exit 1；22,916ms） | `373ecd7d592180a1b3ea21dec56195315bea2ab033ebea84d310d89cd04453e1` |
| E5 | `.../phase-e-evidence/full-test-summary-run1.txt` | `28ec28e7b7947b219676e594c0aa87dba44725782d8e042b8539d0c3e6db7397` |
| E5 | `.../phase-e-evidence/full-test-summary-run2.txt` | `af262f173f7be312cee1fe6b7da4de57b71e7ec18eaf4ee02d7cb4c6d900efe4` |
| E6 | `.../baseline-evidence/full-test-node.log`（3416/3386/12/18；exit 1） | `31537dcdacbcaef99583d0fffd4039c34bce1fe095740d5ccbecc1b6542335b0` |
| E6 | `.../baseline-evidence/full-test-node-run2.log`（3416/3388/10/18；exit 1） | `0d8a192202898e8c27d123c8ed430bd475707bafb9c926462527f99c0f40d8c1` |
| E6 | `.../baseline-evidence/full-test-summary.txt` / `full-test-summary-run2.txt` | `d590e131dd0a7d8836fa36b3f78aa05b6aa81eebe2335a23762b0d645488302b` / `a83f2d0693153e124efab93ee86ae86b5ff70be8d36e7aaeea660844fa7a92cd` |
| E7 | `.../phase-e-evidence/suite-governance-e2e-auto.log`（68/68） | `a36ee9106b60caabef5137e8b65fc305d78f3cfd05113b341a6eba53f18c5d59` |
| E7 | `.../phase-e-evidence/suite-governance-trio-verify.log`（22/22） | `d3689fbdb9224be0457e068eaf9886bf50ca9edf4a37733c991baa1469aaae31` |
| E7 | `.../phase-e-evidence/suite-governance-judge-cards-verify.log`（36/36） | `3887de320b71d24cac38b5634fb2fc250bd1b65d220c004c5b211291a4c3482a` |
| E7 | `.../phase-e-evidence/suite-governance-liaison-verify.log`（28/28） | `c81649e0eb9bf7e79efb5953c623f2634c5f21f989b90e2b9e2366bcd5795419` |
| E8 | `.../phase-e-evidence/test-domain.log`（752/745/1/6；唯一红基线 EPERM） | `6a188f0bf483e33cec032e90e26dc36b70276ccbec824910ef8c647fdcae0dc1` |
| E9 | `.../phase-e-evidence/real-entry.log`（16/16） | `afb14a2a4b04782d659d38c633b46205eea3898977bd6bd6a17b81615e3707b9` |
| E10 | `.../phase-e-evidence/typecheck.log` | `e938f6eda42a5919f80e516bbbfd1708cba7127b707683536654e159b4599e54` |
| E10 | `.../phase-e-evidence/typecheck-renderer.log` | `37a4d2a7717d3ec41fe22bda9d255d15953e5f9fffe039073ba9302d32459238` |
| E10 | `.../phase-e-evidence/build-renderer.log` | `bc70258009404b49c9e9e7750350a44ca8df397d20e8b03a3aded2c5c257acdb` |

### 4.3 真实启动/演示与基线文档

| ID | 路径 | SHA-256 / 说明 |
| --- | --- | --- |
| E11 | `.../phase-e-evidence/electron-e2e/report.txt` | `daef6ab4d1e3bd71ad06f179e2755a8f54eb73c20881c2d7824e485470f66357`；`E2E_PASS=true`、`E2E_DONE=1`、17 张 PNG |
| E11 | `.../phase-e-evidence/governance-demo/report.txt` | `6f61f06096af268af23d8e555e2077a415e0f44b54dd94d69d0d401314ff26cd`；`DEMO_PASS=true`、`DEMO_DONE=1`、`DEMO_IMPL_DISPATCH=true`、7 张 PNG |
| E13 | `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（blob `85f50a7b…`） | `e97eadec8ca41205c515b3ae559259e9de006c93b17a7f4ad898752c65346259` |
| E14 | `docs/planning/2026-10-22_design_governance-split-1-3-5.md`（方案 v1） | `2e4b486df4f3aaa5d99b8ba6b87b640ca289cd491333fee99a2666c85c89b442` |
| E14 | `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` | `bd683a1784e5cb253201d20de58fdabe9de4ad0c71fffdbf02e9487dbd7dfb92`（追加闸门 2/标准记录；闸门 0/1 内容未变） |
| E14 | `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` | `0d096baadee7dc28eb59ebd69e0bb74ee4243ef93b434892263f3019ee24e281`（含 §11.11–§11.13） |

### 4.4 关键候选文件 hash-object（完整 53 行见 E1）

| 文件 | blob | SHA-256 |
| --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | `4573b5cc2da48f79e5abd3ed5e76503ac120a471` | `d82f6fae973dd08e56aee1a4e081115a6444482f2786ec33b4796faeec0a3d1f` |
| `src/pipeline/orchestration/run-role.ts` | `e77e9ffd34304a4f0c47708f15223dea5544bd6e` | `55f11d2dca9696cd5036e67e9748f4789ae1fb04bca7fc6aa30eb0ecd64a86db` |
| `src/common/编排/governance-gate.ts` | `d932a6e5b3fe4e1e0193a26bb5a764c7c1b1a40e` | `5cc9d25ae87c1f92081bf64b7f3214e56fdaa27b3d49ff8dadfd4d093c22a820` |
| `src/common/编排/governance-judge.ts` | `a0d315e60579dbcd11e21ec72e816eecaecda7d8` | `e398ada20751cf087c685574fd3c27a97c54aae0521d00fc7bfaa03dec768e93` |
| `src/common/编排/flow-state.ts` | `02ee95429e00c4c9f98534bfa21e950c40523013` | `baeb2e4a7ab4d2842db63d918433dc6ca4d649249f8f41ed3f54a3f7a0dc28bd` |
| `src/common/编排/flow-service.ts` | `2679703027850c948772fd59f93cc1ed171d08d1` | `828d0c9cbc8800631d20af7e976748c98d31999ecc551ec659978ea8ad31d5e4` |
| `src/common/编排/governance-ledger.ts` | `c29a78ae763769f9e204c7dc59a5eb2667df8b61` | `5fd7750c94db65fdc8a10b7155ffa4aec6fa3a99919c3d7a7bd4cb18e225c96b` |
| `src/model/runtime.ts` | `120db534d7952f3320d34f21afe222067b2b744c` | `d19c1ab9da354b2a616530a7067a88c12a0375c8763a350719af7a7b5a3b89c9` |
| `app/desktop/interface.ts` | `2f0282d827ed6a76b42021a7fd52757d891838b9` | `d3992ab9b74d571ac834630b506784c2853ba75ed27031f364ed428fa8782512` |
| `app/desktop/governance-advance.ts` | `39f8d391f962f7e58edbfd757f02278dc0cdaa7d` | `64680dabc69b1b9e42b68411fcc1f85b4120a6b2dadfbca97a738b5256313319` |
| `app/renderer/src/chat/governance-view.ts` | `f72188bd8737c6056727062f3b3487a9960d2f62` | `4f5e62a8f529e69eefb9c1b7314a87f78c0157f0bcb5cf63efed6f9bf7d6ce48` |
| `app/renderer/src/chat/role-view.ts` | `a3ad631cf0e9d76b40598effd8270f5c8fabe766` | `268a0999015d7bd2f022799fee66e7a035989f8f6a3fdf11c471ef5623b3341b` |
| `test/测试/real-entry.test.ts` | `d331de90dbfe37f8c2236760466920d4700308dd` | `5e858496d436b8c9e620a3ffed1d0e674d09e6dc60be875fb9cb523d94507884` |
| `test/桌面应用/dispatch-delivery.test.ts` | `73bdb768ff3d9634ebeb2c1bc0af1d9f86179232` | `c3117b2586dc71939f338dae6fee30a08f0c89c255c0512587d1f1616a02554a` |
| `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | `3675e3e3957e3e83f74f810d0d4dd3ffac2f68cb` | `78e526b2f2caf2bcbd40255f2444c8e26da47fe44e37e44e3d17a03cd8eefc3a` |
| `test/测试/governance-e2e-auto/c-appointment-timing.test.ts` | `b8ca13891c37c639fb88aa63a8c939c8912752a7` | `dd1239edc9f2a053c56a9dafbc20e1273f65eaea8e064a84d2864d9f54327fa1` |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `908bedcdabddb207652104905dcf4c3720b87c4e` | `de1d132322cfc3a42a5219c729504d0586027291ec7b39e5dc333eb6e55a06de` |
| `test/桌面应用/interface.test.ts` | `0244d9da29b5c799df56ed841149595636e4a25b` | `ea4425786e809055e2faab6e0e51986777396d599cf1c9099a77d7ea17a0dae1` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `0b4a1ca63425cf6fdec3323d53add34a5234ea10` | `c87341ec7c76864c86d0be88b618c7e16d370df09041e19ab0fa3b34a9eb1149` |
| `test/编排/governance-gate.test.ts` | `edec4821982a0fa437f736a9bf25e39caa64213a` | `81e191d8730eaad684b56d9e492e1c8a29c9a8248a0a77907d31835dca996c09` |
| `test/编排/governance-judge.test.ts` | `97d320f4d0ecdee5bcceab6f574a81543f589453` | `c5c4a2651ad89e2ed514ffb279f27d93e46c408cb13bc16823fed57d1f201457` |
| `test/门禁引擎/governance-trio.test.ts` | `daaa9f4f7e01a499b4929a5b3470688d28bb2f08` | `880e9442f2fc76c9ea64e56d8022fd68e26ce24c4db9f11be0bd8d0e14acb09e` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `813b46939417c93c52d02e982e5a5a219a06d884` | `0b0ec21366b587d038d5b1f3b8af8559943b24a489d5a2fdf5632cfa88d15b02` |
| `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts` | `a584c737c0818cb998eedb1b9cd39e0251b7658d` | `6dddb7d714226a7269aa510cf1865dfd7238700c45e36f4af5c99a92107a96a6` |

---

## 五、残余观察与未解决问题

### 5.1 并行全量下的桌面测试偶发（不判返工，记残余观察）

- **现象**：统筹两次并行全量分别出现 1–2 个额外失败：`test/桌面应用/interface.test.ts`「任命→Crew 写卡主路径…」与 `test/桌面应用/acceptance-dispatch.test.ts`「2026-10-20 verifier settle…」；测试角色两次并行全量均为 9 项基线 EPERM、未复现这两个额外失败；隔离/整文件复跑通过（判定时独立复跑：`interface.test.ts` 79/79、`acceptance-dispatch.test.ts` 36/36；变更包记录的定向复跑 1/1、25/25），统筹串行全量 3448/3421/9/18（exit 1；9 项基线 EPERM；零新增红）。
- **判定**：这两个失败**不是当前候选的确定性新增红**；同一候选的测试角色原始 run1/run2 与串行复核均未出现，且基线 run1 已有同类桌面时序偶发（`acceptance-dispatch`、`dispatch-delivery`）。本轮不因此判返工；作为**残余观察**记录。
- **风险**：全量并行负载下桌面测试存在并发敏感。建议后续单独安排测试稳定性改进（不作为本候选通过的前置条件）；若组织要求零 flaky，应在下一轮以独立任务处理，而不是把本轮证据判为通过依据。
- **证据**：E4/E5（测试角色两次）、E6（基线）、E12 §3.4/§六、E14 团队计划 §11.13；隔离复跑计数见 E12 §3.4。

### 5.2 `dispatch-delivery.test.ts` 写集补充的记录追溯

- **事实**：`test/桌面应用/dispatch-delivery.test.ts` 是桌面窗口 Section 1 的既有精确文件；它不在闸门 2 确认记录所引用的团队计划 §4.2/§8 初始写集内，但团队计划 §11.11 记录了 2026-10-22 统筹/沟通批准的**补充写集**，理由是该文件夹具未随 O2 门槛更新、属必要测试更新，不新建文件、不改角色/边界/契约；沟通 memo 亦记录该补充写集与修复结果（52/52）。
- **判定**：该文件在角色 Section 1 内，补充写集有团队计划 §11.11 与沟通记录；本轮按团队计划当前写集核对，G2 判 pass。**追溯建议**：沟通应把该补充写集补记到闸门 2 确认记录（或另行确认），使授权链在客户确认层面完整；这是记录完整性建议，不改变当前候选的产品行为或本轮通过结论。
- **证据**：E14 团队计划 §11.11/§8；`docs/communication/memo.md` 2026-10-22 记录；E1 `CAND`（该文件 blob `73bdb768…`）。

### 5.3 一次 `write-sequencing.test.ts` 瞬时挂起

- 最终候选第一次全量尝试在未修改的 `test/pi-adapter/write-sequencing.test.ts` 挂起 >10 分钟；终止后同一命令重跑正常（22.6s），随后 run2 正常。该文件不在候选改动面，属宿主/并发瞬时问题；不作为候选新增红，记为环境残余观察。证据：E12 §3.4/§六；E4/E5。

### 5.4 真实启动/演示的边界

- 真实 Electron 总自检（`test/桌面应用/e2e/main.mjs`）真实启动 Electron，`E2E_PASS=true`、17 张截图；治理链演示（`test/测试/phase-e-governance-demo.mjs`）使用真实 Electron 窗口、preload、renderer、DesktopInterface、门禁/judge/账本/客户通道，模型适配器为脚本桩（离线、无凭据、不触网），`DEMO_PASS=true`、7 张截图。工程基线「验收前必须真实启动应用并演示」已满足；**真实在线模型/凭据/网络未验证**，不属本任务验收面（方案 §7.5/团队计划 §6.4 已如实记录）。证据：E11。
- 演示中产品自动验收派发在离线无凭据时按设计不启动，用例以真实 Verifier 会话显式驱动标准/报告；门禁/judge/账本/写区仍是产品代码。该限制不改变 P11/P15 的 pass，但后续若要求在线模型链路，应另开任务。

### 5.5 既有 Windows symlink EPERM 与基线对照

- 9 项既有失败与阶段 A 基线逐条相同：`test/claude-adapter/session.test.ts:637`、`test/codex-adapter/session.test.ts:351`、`test/pi-adapter/injected-runtime.test.ts:185/193`、`test/runtime-core/file-write-safety.test.ts:97`、`test/runtime-core/session-store.test.ts:46/58`、`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`、`test/编排/shell-authorized-routine.test.ts:103`。环境无符号链接权限；非本次新增。证据：E4/E5 失败清单；E6 基线失败清单。

### 5.6 串行全量原始日志的归档

- 测试角色两次原始全量日志（E4/E5）是 P15 的主要全量证据；统筹串行复核（`--test-concurrency=1`，3448/3421/9/18）在变更包/团队计划中有摘要，但证据目录未单独保存该次串行运行的原始日志。本轮不以串行摘要代替两次原始全量；建议后续把串行原始日志一并归档，便于复算。该点是证据归档改进建议，不构成 P15 fail。

### 5.7 基线管理记录变化

- 方案 v1 哈希未变；意图记录与团队计划的哈希变化来自闸门 2/阶段 E/写集补充等管理记录追加，不是方案实质变更。详见 §2.1。标准 v1 哈希未变，未为适配候选修改。

---

## 六、结论与效力

### 6.1 总体结论

**通过（当前候选）。**

- P1–P15 全部适用行 pass；G1–G4 pass；无 fail、无 insufficient evidence。
- 候选 53 文件哈希逐行复算一致；HEAD 未变；暂存为空；无提交/推送/合并/发布。
- T3 全量回归对当前候选执行：测试角色两次原始全量均为 3448 / 3421 pass / 9 fail / 18 skipped；9 项均为阶段 A 既有 Windows symlink EPERM；零本次新增确定性失败。统筹串行复核同计数。
- 真实 Electron 启动/演示与治理链演示通过；canonical e2e 154/154；typecheck、typecheck:renderer、build:renderer 均 0。
- 残余观察见 §5，不改变本轮通过结论；若组织要求零 flaky 或补齐写集/串行日志记录，应另安排改进任务，不追溯性改变本候选的通过结论。

### 6.2 效力与限制

- 本结论只对上述 **53 文件候选、HEAD `c3693ec…`、T3** 有效。任一产品/测试/角色卡/边界文件再变化，受影响证据失效，按标准 §3.3 重判；全量回归只在当前候选有效。
- 本结论**不授权提交、推送、合并、发布、部署或任何对外操作**；验收通过不等于客户批准后续动作。
- 本结论不替代客户确认、方案审核、团队计划/闸门 2 记录或调度记录；统筹只能按匹配当前候选的通过结论放行。
- 本报告只写 `docs/acceptance/`；未修改标准、代码、测试、角色卡、边界、方案、团队计划、沟通记录或变更包。

---

## 七、判定时的只读检查记录

1. 核对基线：方案 v1 blob/SHA-256 与标准 §2 记录一致（未变）；意图/团队计划变化为管理记录追加，已记录。
2. 核对候选：53 文件 `git hash-object` + `sha256sum` 逐行复算，mismatches=0；HEAD 未变；`git diff --cached` 空；未提交。
3. 核对档位：变更包 `riskTier: T3`，与治理/权限变更相符；未降档。
4. 核对写集：53 路径与角色 Section 1/团队计划 §4.2/§8/§11.11 对照；`dispatch-delivery` 补充写集记录见 §5.2；无越界、无 boundary/role-card 改动。
5. 核对 P1–P15/G1–G4：读取 `full.diff`、关键源码/测试、测试日志、e2e/真实启动/演示报告；逐行填写 §三。
6. 核对全量回归：对比 E4/E5 与 E6 的计数、失败清单；确认 9 项既有 EPERM 逐条相同、零新增红。
7. 核对真实启动/演示：E11 `E2E_PASS=true`、`DEMO_PASS=true`、截图清单；确认模型适配器为脚本桩的边界已在 §5.4 记录。
8. 核对非目标：diff/测试确认第 2/4 项、角色命名/路径、工程基线文本未改；无新增固定测试角色/cardKind/FlowStepKind。
9. 写报告：首行五项；验收表逐行；结论与残余观察；未改候选。

---

## 八、边界声明

- 本报告不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本报告不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录或调度记录。
- 本报告不是客户确认记录；客户确认仍以 `docs/communication/` 的记录为准。
- 本报告不授权提交、推送、合并、发布或任何对外操作。
- 本报告未把开发自述、测试转述或工具成功当作原始证据；引用的是原始日志、diff/status、哈希、e2e/启动演示报告与账本/测试合同。
