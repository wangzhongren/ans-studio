# bootstrap 快照单槽位与冻结闭包矛盾：实施前验收标准 B1 v1

- 日期：2026-11-10；固定身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**。本文件只做实施前验收标准；**不实施、不派发、不运行真实模型、不运行测试、不授权提交/推送/合并/发布**。
- 风险档位：**T3（协调方 2026-11-10 已确认）**。依据：`src/common/门禁引擎/classify-shell.ts` 的 Git 发布策略语义改动（冻结闭包范围 + frozen 证明允许集）+ 服务侧装配，两者缺一不能通过真实运行。**B1+B2 必须同 PR/同批次（不可拆批独立通过）**；若协调方批准拆 PR，必须同一发布批次并在各 PR 注明「单独合并不改变真实运行结果」。档位不得由实施侧/验收侧自行下调。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对**同一最终候选**与本版本判定。
- 依据（写盘前实测）：
  - 方案 **P1.1**：`docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`，**477 行 / 68,367 bytes / SHA-256 `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0`**（M1/M2/G1–G4/S1–S7 已处置，§8.1 处置表在案；P1.0 `1f6afc15…` 仅历史）。
  - 独立复核记录：`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`，**263 行 / 43,407 bytes / SHA-256 `17453813867397bb028c851c8bedbcb1ddf5d479e959f685d3dab3f862e76a0e`**；R1.0（195 行 / 31,763 bytes / `4c01b07d…`）结论「建议修订后提交」（M1/M2 must-fix、G1–G4、S1–S7）；R1.1 窄复核「M1/M2/G1–G4/S1–S7 全部闭合、0 must-fix、建议提交」，余 N1–N6 不阻断。
  - 缺陷记录：`docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`，**36 行 / 2,733 bytes / SHA-256 `63f6e239ddbb1d447553b3404c28450c21f868c267a3a7e47f69a4188c816a82`**。
  - RR19 证据（只读引用）：`角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`，**182 行 / 23,923 bytes / SHA-256 `a4a90ebed25102ba2bd9b3be3d3863a6980c5fc5064ce6cbc06d3665267f8820`**；证据目录 `2026-11-10_RR19_snake-full-chain-evidence/`，关键原件实测：`extracts/vca-snapshot-files.json`（38 行 / 1,315 bytes / `760e714a9f7f4906f2004db7590e4a753afb947f93e13f2f0911a31607b246bb`）、`versions-final.jsonl`（21 行 / 7,228 bytes / `3e87ad9f376b0f765b43a2b07ebdbe78c1981a19e3b4e5ae8393fd97394700a6`）。
  - RR14（前序同族失败，只读）：`角色卡/测试/docs/change/2026-11-10_RR14_snake-full-chain.md`，**155 行 / 21,384 bytes / `227589b04726d4fa206fd69d18a8a790139e7473d2c25048269aad7f4021339f`**（`git-policy-app-freeze-closure` 回执原文在案）。
  - 并行变更（只读）：文档格式变更提交 `ecf9ead`（**PR #81**，B2 `53 pass / 0 fail`；本分支基点 `0ab2584` 已含其提交）；团队计划 run 绑定 `3cd55dc`（PR #80 已合并）与 judge `24799cb`、提案卡修复 `fb1aa39e` 均在基点历史；`origin/main` = `caabeea`（PR #80 合并），本地 `main` 停在 `c1fb74a`（落后 origin）。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（`e2bdd96b…`）；T3 确认与 RR20 授权以协调方 2026-11-10 书面记录为准。
- 代码基线（写盘时实测）：worktree `.claude/worktrees/trunk-amendment`；分支 **`feat/bootstrap-snapshot-freeze-closure`**；HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）；`git status --porcelain -- src app test` = **0**（干净）。工作树另有历史未提交/未跟踪产物（`docs/communication/memo.md` M、`.commit-msg-*`/`.pr-body-*`/`.tmp-*`、未跟踪 docs），**不属于本变更写集**；实施必须从干净基线新建/重切分支，不得带入。P1.1 行号为当前检出快照；#81 合并与实施落地后行号漂移，**以符号名与文本锚点为准**。
- 关系：本 B1 只覆盖本变更（bootstrap 装配 + 冻结闭包 + 允许集 + RR20）；**不修改**其它 B1、在飞变更（文档格式 #81、团队计划、judge、提案卡修复）与已验收候选；不改变公共校验语义；发布/tag 不在授权内。
- 编号口径：方案 §5.1 定义 **T1–T19**；本 B1 逐条转写并新增 **BASE-1..BASE-8、AC-1..AC-14、RR-1..RR-8、EV1..EV6**；不新增验收语义。

## 0. 范围与非目标

### 0.1 本 B1 覆盖

1. **服务侧装配（编排）**：bootstrap 快照按闭合证据集合装配——`directRefs(target)`（每 kind 至多一个当前版本 target）× `versions.jsonl` 中全部 `event:"frozen"` 记录解析文件（记录 sha 必须等于磁盘字节）× 已确认意图 × `versions.jsonl` 本身；manifest 单槽位语义不变；历史由账本自动装配，不作为 targets。
2. **门禁两处（门禁引擎）**：`git-policy-app-freeze-closure` 仅对 `event:"frozen"` 行要求快照同 path 同 sha；将「经 frozen 闭包证明的 `snapshot-content` 路径」加入 `allowed`（仅此集合）。
3. **M1 收缩承诺**：bootstrap 每 kind 至多一个当前版本 target；同 kind 多版本单请求明确拒绝（不 last-wins/不取最高）；非 bootstrap 路径不变。
4. **集成与真实运行**：B3 跨角色集成（真实 Git 对象 + 真实 `prepareDirectSubmission`）；RR20 隔离真实运行（round8 干净副本、9223、预算/停止/attestation、预期链）。
5. 写集/owner/H1/串行、T1–T19 测试矩阵、typecheck、旧断言记录、证据层级与判定规则。

**非目标**：不支持同 kind 多版本 targets 单请求（另立变更）；不改 `version-change/v1`/`complete-snapshot/v1`/`trunk/v1`/`version-baseline/v1` schema/数据模型；不改 `versions.jsonl` 格式/事件类型；不改 `expectedFromSha256`/`baseTrunk`/`bootstrap` 语义；不改角色/角色卡/边界/权限/writeSet/闸门语义定义；不改 `run-manifest.ts`/`evidence-check.ts`/`workflow-preconditions.ts` 等 parser/validator；不提升 Git raw-object 预算；不重跑 RR、不伪造、不绕过。

### 0.2 必须保留的契约/边界（硬约束）

1. **冻结保护不弱化**：每一条 `event:"frozen"` 记录仍须在 bootstrap 快照中逐字节同 path 同 sha 出现；缺失/漂移/不可读/同 path 冲突一律 fail-closed；未知 event/非法 freeze 形状仍拒绝。被排除的仅是不可恢复的草稿历史行（baseline/version-added/draft-updated/draft-marker 的旧 sha）。
2. **门禁允许集只补 frozen 证明集**：只把「frozen 记录已在 `primary.files` 同 path 同 sha 证明、且表行 kind=`snapshot-content`」的路径加入 `allowed`；不得放宽到任意路径；`git-policy-app-freeze-record`/`-source`/`git-policy-app-document-closure`/`git-policy-app-content-closure` 等其他 policy 分支与 `checkGitPolicy` 签名/返回形状不变。
3. **服务侧 fail-closed**：账本解析失败、未知 event、非法 freeze、异 flow 行、`-vN` 后缀版本 ≠ record.version、文件缺失/不可读/漂移、同 path 冲突 sha——全部拒绝；不吞行、不跳过、不从猜测来源补 hash；不新增外部错误码（继续 `trunk-item-invalid`→`vca-target-invalid` 等既有 code，消息含路径）。
4. **M1 收缩**：bootstrap 仅支持每 kind 一个当前版本 target；同 kind 多版本单请求明确拒绝；非 bootstrap 仍由既有 `expectedFrom`/槽位计数（行为/消息不变）；当前版本由角色声明，服务侧不推断版本高低（N3）。
5. **不改 schema/数据模型/marker**：`complete-snapshot/v1` 语义不变；快照 ID `s-<hash(flowId, operationId)>` 与 digest `completeSnapshotDigest` 算法不变；无新 marker；无新 ref/发布流程；`versions.jsonl` 追加语义不变。
6. **旧调用/非 bootstrap 逐字不变**：非 bootstrap VCA（tN→tN+1）、detail-amendment、team-plan（仅 `directRefs(target)`）、激活、initial-workflow 路径行为/字节不变；`prepareDirect` 的「target 必须在快照内」检查保留；旧快照/历史/operation 不迁移不重写。
7. **H1 delta = 0**：不改角色卡正文、边界、权限、writeSet、roster、派发矩阵；各角色 `docs/change` 实施记录属其 Section 1 既有授权，不构成权限/角色变化；不新增目录/依赖。
8. **B1+B2 同 PR/同批次**：只落 B1 会停在 `git-policy-app-freeze-closure`/`git-policy-raw-write-scope`；只落 B2 会停在 `vca-target-invalid`；拆 PR 只能同一发布批次，各 PR 注明单独合并不改变真实运行结果。**不得**把本变更与 #81/团队计划/judge/提案卡修复混成一个 PR。
9. **真实运行纪律**：RR20 使用 round8 干净副本（同根清理/会话剥离/账本重置，原 target 只读），CDP 仅 9223、9222 零占用/零触碰；预算/首果即停/不重试/不追加；严禁伪造；变更/门工具 blocked/failed 立即停止。

### 0.3 判定对象

只判定**同一最终候选**是否满足冻结方案 P1.1、复核 R1.1 与协调方 T3 确认；不判方案质量/取舍，不判其它在飞变更。B2 由**同一独立验收身份**按本 B1 执行。

## 1. 基线、实施顺序与证据层级（BASE-1..BASE-8）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **实施基线（重取）**：实施开始时记录 worktree、分支、HEAD/`HEAD^{tree}`、`git status --porcelain -- src app test`、全仓 status。基线必须满足：(a) **文档格式 #81 已合并**后从 `origin/main` 干净分支重切/rebase，或 **stacked PR** base=`feat/document-format-specifications` 且 #81 合并后 retarget；(b) `git fetch origin`，以 `origin/main`（复核实测 `caabeea`）+#81 为基线，不得使用落后的本地 `main`（复核实测 `c1fb74a`）；(c) 工作树未跟踪 `.tmp-*`/`.commit-msg-*`/`.pr-body-*`/未跟踪 docs/`memo.md` M 不得带入；(d) `src app test` 干净。若协调方裁决不同基线/次序，记录裁决与影响后再实施。P1.1 行号为 `0ab2584` 快照；实施以符号锚点重新核对。 | 基线 HEAD/tree/status/分支；`fetch origin`/rebase/stacked 记录；#81 合并/B2 引用；协调裁决 | 未取证 |
| BASE-2 | **T3 与串行/单写者**：T3 已确认；批次顺序 **B1（服务装配）∥ B2（门禁）→ B3（集成）→ B5（D1/独立验收）→ B4（RR20）**；`apply-journal.ts` 只由编排写，`classify-shell.ts` 只由门禁引擎写，`test/测试/` 只由测试写，`test/编排/`/`test/门禁引擎/` 各 owner；同一时刻一人一文件；B1+B2 同 PR/同批次，**不可拆批独立通过**。 | 协调/调度记录；T3 确认；单写者/串行记录；PR 计划 | 未取证 |
| BASE-3 | **基线已知红项 + 增量不回归口径**：实施基线上以同一命令/Node 版本重取 before/after；参照当前基线（含 #81/团队计划/judge）：`test/runtime-core/**` **33 fail / 4 skip**、`test/编排/**` **22 fail / 2 skip**、`test/门禁引擎/**` **5 fail / 1 skip**、`test/桌面应用/` 四文件 **26 fail**、`test/桌面应用/optional-acceptance.test.ts` **6/2/1/3/0**；doc-format D1 v1.1 计数（runtime-core 554/517/33/4、编排 1164/1140/22/2、门禁 472/466/5/1）与团队计划 run D1（桌面四文件 61/35/26/0）作参照。判定：**同名用例不得恶化；新增确定性失败 = 0；新 skip = 0**；环境抖动须同候选隔离复跑通过方可排除；不以绝对全绿为前提。 | 基线命令/Node 版本/TAP 输出/逐文件 hash；before/after 失败与 skip 标题集合 diff；隔离复跑日志 | 未取证 |
| BASE-4 | **候选身份/写集/聚合/manifest**：候选只含 §2.1 允许文件；记录绝对检出、基线 HEAD、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合（按路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联的 SHA-256）与 manifest（`src app test` 及写集）；写集外 diff=0（尤其 §2.2 排除清单、#81/团队计划/judge/提案卡修复写集）；无删除/重命名越界、无新依赖；未跟踪治理文档不计入候选。 | 候选清单/聚合/manifest；逐文件 hash；diff/numstat；稳定性快照 | 未取证 |
| BASE-5 | **稳定性**：证据运行前后同一候选/manifest/聚合/树；HEAD/tree/分支/暂存不变；任何源码/测试/依赖/夹具/构建/命令变化使证据失效并重取；不得拼接旧候选/旧证据/不同环境；不得用 #81/团队计划/其它 B1 的证据冒充本候选。 | manifest/聚合/树前后快照；diff 0；失效重取记录 | 未取证 |
| BASE-6 | **H1 delta = 0 与边界**：编排写集命中 `src/service/trunk/`、`test/编排/`、`角色卡/编排/docs/change/`；门禁引擎命中 `src/common/门禁引擎/`、`test/门禁引擎/`、`角色卡/门禁引擎/docs/change/`；测试命中 `test/测试/`、`角色卡/测试/docs/change/`；不新增目录；不改角色卡/边界/权限/writeSet/roster/派发矩阵。 | 边界 Section 1 条目；新增文件清单；H1 记录；diff 0 对照 | 未取证 |
| BASE-7 | **T3 档位与升档触发器**：T3 已确认；**任一出现即停止并升级/回报**：需要扩展 `version-change/v1`/`complete-snapshot/v1` schema；需要改 `versions.jsonl` 事件/格式；需要改角色/边界/权限/writeSet；需要新增门禁允许集而非本方案限定的 frozen 证明集；需要提升 Git raw-object 预算；需要支持同 kind 多版本单请求；真实运行出现未预期门禁 code。若协调方改判 T2，须书面写明「含门禁政策文件改动的 T2 例外」及理由，否则按 T3。 | 档位裁决；升级/停止记录；写集核对 | 未取证 |
| BASE-8 | **证据层级独立**：L1 服务装配（编排单测/FS）；L2 门禁 policy（门禁单测）；L3 跨角色集成（真实 Git 对象 + 真实 `prepareDirectSubmission`）；L4 RR20 真实运行。各层绑定候选 digest/命令/环境/退出/计数/日志 hash；L2 不得替代 L3，L3 不得替代 L4，确定性证据不得以真实运行替代，反之亦然。 | 证据索引（层级/候选/命令/环境）；交叉引用审计 | 未取证 |

## 2. 范围、Owner 与写集

### 2.1 实施写集（按 P1.1 §4.1；每文件唯一 owner，零重叠）

| 批次 | Owner（单一） | 文件 | 改动/用途 | 关联条目 |
| --- | --- | --- | --- | --- |
| B1 服务装配 | 编排 | `src/service/trunk/impl/apply-journal.ts` | bootstrap 每 kind ≤1 target 拒绝、闭合集合装配（frozen 记录文件 + 意图 + versions）、fail-closed、两处捕获共用 helper；非 bootstrap 不调用 | AC-1/2/3/6/8/9 |
| B1 测试 | 编排 | `test/编排/direct-role-capabilities.test.ts`（M）或 `test/编排/bootstrap-frozen-closure.test.ts`（新） | T1–T9/T15–T18 服务侧用例 | T1–T9、T15–T18 |
| B1 记录 | 编排 | `角色卡/编排/docs/change/2026-11-10_W_bootstrap-frozen-closure.md`（新） | 实施记录（文件/sha/测试/披露） | BASE-4 |
| B2 门禁 | 门禁引擎 | `src/common/门禁引擎/classify-shell.ts` | (i) `git-policy-app-freeze-closure` 仅 `event:"frozen"`；(ii) frozen 证明的 `snapshot-content` 路径加入 `allowed`；其余不变 | AC-2/4/5/10 |
| B2 测试 | 门禁引擎 | `test/门禁引擎/git-shell-acl.test.ts`（M）或 `test/门禁引擎/freeze-closure.test.ts`（新） | T1/T10–T14/T19 门禁用例 | T1、T10–T14、T19 |
| B2 记录 | 门禁引擎 | `角色卡/门禁引擎/docs/change/2026-11-10_W_freeze-closure-scope.md`（新） | 实施记录 | BASE-4 |
| B3 集成 | 测试 | `test/测试/bootstrap-freeze-closure-integration.test.ts`（优先新增）；如需改 `test/测试/git-write-chain-fixture.ts`，只做加法导出并列出依赖套件回归面（S6） | 真实 Git 对象 + 真实 `prepareDirectSubmission`：4-target、多版本账本、8 frozen + 5 草稿行、M2 允许集；pin 服务/门禁路径解析一致 | T1、T10–T13、T17、T19 |
| B3 记录 | 测试 | `角色卡/测试/docs/change/2026-11-10_D_bootstrap-frozen-closure.md`（新） | 集成记录 | BASE-4 |
| B4 真实运行 | 测试 | `角色卡/测试/docs/change/2026-11-10_RR20_bootstrap-freeze-closure.md` + 证据目录 | RR20（§5） | RR-1..RR-8 |
| B5 独立验收 | 独立验收 | 本 B1 + B2 报告 | 不在实施写集；协调方排期 | — |

- **单写者**：`apply-journal.ts` 只由编排写；`classify-shell.ts` 只由门禁引擎写；`test/测试/` 只由测试写；`test/编排/`、`test/门禁引擎/` 各 owner；同一时刻一人一文件。
- **记录归属（S5）**：方案/缺陷/复核三份未跟踪记录由策划/协调方随实施 PR（或 docs-only 提交）一并提交，路径/哈希写入 B2/D1 记录，不得孤儿化。

### 2.2 明确排除（diff 必须为 0；防越权）

- **#81 文档格式写集**：`src/common/编排/doc-format-specs.ts`、`src/provider/runtime/tools.ts`/`schema.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`app/desktop/session.ts`、`test/桌面应用/session.test.ts` 等（已随 #81 提交；本候选不得含其 diff）。
- **团队计划/judge/提案卡修复写集**：`src/common/roles/convener/index.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/service/trunk/impl/apply-journal.ts` 的团队计划区域（`completeTeamPlanInternal` 等）、`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts` 等（只读；本变更只改 `apply-journal.ts` 的 bootstrap 装配区域）。
- **schema/数据模型/parser**：`src/model/trunk.ts`、`src/model/version-change.ts`、`src/common/编排/run-manifest.ts`、`src/common/编排/evidence-check.ts`、`src/common/编排/workflow-preconditions.ts`、`src/service/trunk/impl/amendment-validate.ts`、`src/service/trunk/impl/upgrade-validate.ts`、`src/common/门禁引擎/boundary-*.ts` 等。
- **其它**：`app/renderer/**`、角色卡 `role-card.md`/`boundary.md`/`boundary.yaml`、`docs/skills/**`、`docs/mcp/**`、`test/桌面应用/optional-acceptance.test.ts`、`test/桌面应用/chief-workflow.test.ts`、`.ans/**`、目标项目产品文档；不新增依赖/构建/发布配置。

### 2.3 边界与升级条件

- **零重叠/无 H1**：每个产品文件按 boundary §1 单一 owner；新增测试文件均在已授权目录；不新增目录。
- **升级条件（任一出现即停止并升级，本 B1 不适用）**：需要改 §0.2-1/2/3/5 的冻结/允许集/schema/versions 语义；需要新增门禁允许集而非 frozen 证明集；需要角色/边界/权限/writeSet/roster 变更；需要写集外文件/新目录/新依赖；需要提升 raw-object 预算；需要支持同 kind 多版本单请求；需要拆批独立通过真实运行。

## 3. 验收标准（AC-1..AC-14）

> 判定前提：每条在**同一最终候选**上、以可复算原始证据判定；全部子判据满足方可 `pass`；任一 fail 触发项即 `fail`；证据不全为 `insufficient evidence`。全部条目当前 `未取证`。

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| AC-1 | **bootstrap 快照装配**：bootstrap（`baseTrunk:null`）的 `complete-snapshot/v1` 文件集合 = 当前槽位 `directRefs(target)`（每 kind ≤1，4-target 标准）× 全部 `event:"frozen"` 记录解析文件 × 已确认意图 × `.ans/state/versions.jsonl`；标准 RR20 口径为 **8 个 frozen 文档（含 intent v1）+ versions.jsonl = 9 文件**；每个文件 sha256 = 磁盘原始字节（`captureSnapshot` 复核），记录 sha 必须相等；按 path 字典序排序、同 path 去重且同 sha；快照 ID `s-<hash(flowId,operationId)>` 与 `completeSnapshotDigest` 算法不变；两处捕获（`prepareDirectSubmission` 与 `executeDirectInternal` fallback）共用同一 helper；非 bootstrap 不调用。 | 未取证 |
| AC-2 | **冻结闭包谓词仅 `event:"frozen"`**：门禁对 `versions.jsonl` 中每条 `event:"frozen"` 行保留 `primary.files` 同 path 同 sha 的**强度不变**要求；`baseline`/`version-added`/`draft-updated`/`draft-marker` 行保留既有形状/来源/归属校验（`:726-727`/`:730-731`），不再要求快照携带其历史旧 sha；未知 event/非法 freeze 形状仍拒绝；不新增豁免/放行分支。 | 未取证 |
| AC-3 | **M1 同 kind 多版本单请求**：bootstrap 每 kind 至多一个当前版本 target（proposal/modules/topology/architecture/assets/roster 各 ≤1）；同 kind 多版本单请求在 `prepareDirectSubmission` **明确拒绝**（`trunk-item-invalid`→`vca-target-invalid`，消息含 slot/路径与「历史由 R9 账本自动装配，不得作为 targets 声明」；不 last-wins/不静默取最高）；历史 v1 仅由账本自动装配、不作为 targets；非 bootstrap 仍由既有 `expectedFrom`/槽位计数拒绝（行为/消息不变）；当前版本由角色声明（N3）。 | 未取证 |
| AC-4 | **M2 门禁允许集**：`classify-shell.ts` `appMetadataPaths` 仅把「`event:"frozen"` 记录已在 `primary.files` 同 path 同 sha 证明、且元数据表行 kind=`snapshot-content`」的路径加入 `allowed`；**不放宽任意路径**：未被 frozen 证明的额外 `snapshot-content` 仍 `git-policy-raw-write-scope`（T19 负例；N2 选择 `gitRolePath` 不放行的路径，如 `docs/proposals/<flow>-proposal-v9.md`）；candidate 与 publication 两个 verdict 一致；`complete-snapshot`/`frozen-application-evidence`/teamPlan/activation/initial-workflow 分支不受影响。 | 未取证 |
| AC-5 | **规模/预算**：Git raw plan `files.length ≤128`、树条目 ≤2048、单文件 ≤1 MiB、整单 ≤4 MiB；快照 JSON base64 放大约 1.33× ⇒ 文档原始总字节约 ≤1.5 MB；超限按既有 `git-policy-raw-byte-budget` fail-closed；**不提升预算**；RR20 9 文件约 80 KB 原文在限内；规模限制作为已知限制披露。 | 未取证 |
| AC-6 | **账本负例 fail-closed**：多 flow 账本逐行 `flowId === input.flowId`，异 flow 行**逐行拒绝**（消息含 flowId，不静默过滤；与门禁 `:726` 同规则，T17）；未知 event/坏行/非法 freeze 形状拒绝（T6）；同 path 多来源 sha 冲突拒绝（T7）；`record.path` 已是 `-vN.md` 且 N ≠ `record.version` 时服务侧**防御性**拒绝、门禁保持 `:728` 原样使用路径（T18/Q7）；历史 frozen 文件缺失/不可读/漂移拒绝（T3–T5）；不吞行/不跳过/不猜测。 | 未取证 |
| AC-7 | **旧调用/非 bootstrap/其它路径逐字不变**：非 bootstrap VCA（t1→t2）、detail-amendment、team-plan（仅 `directRefs(target)`，不含 versions）、激活、initial-workflow 行为/字节不变；`prepareDirect`「target 必须在快照内」检查保留；旧快照/历史/operation 不迁移不重写；外部错误码集合不变（仅消息含具体路径）；`snapshot-immutable-conflict`/`snapshot-hash-drift` 原样 fail-closed；T15 仅 FS 媒体回归（不宣称 Git policy，G1）。 | 未取证 |
| AC-8 | **确定性与重放**：同一 operationId 重放装配得到相同快照 digest；`prepareSnapshot` 幂等；同一 operationId 但文件集合不同 ⇒ `snapshot-immutable-conflict` fail-closed（RR19 的 `s-9fbf9c81…` 已成为不可变证据，RR20 必须用新 operationId `…-02`）；排序/去重确定；审计可由 targets+versions+意图离线复算。 | 未取证 |
| AC-9 | **失败无副作用/审计不伪造**：所有 fail-closed 负例不产生 manifest/`refs/ans/trunk`/`git-mode.json`/freeze/versions 变更，不产生部分提交；错误消息含具体路径/原因；证据只记录实际文件/记录/hash，不伪造；`captureSnapshot` 的 `snapshot-hash-drift`/`snapshot-ref-conflict` 原样保留。 | 未取证 |
| AC-10 | **不弱化证明**：任何 `frozen` 行缺失/漂移/不可读/异 flow 仍拒绝（T11/T12/AC-6）；`allowed` 只含 frozen 证明路径；未被证明的额外 snapshot-content 仍拒（T19）；teamPlan 的 unrelated bytes 检查（`:739-741`）逐字节不变；快照 digest/账本/primary.files 三重钉死；保护不降级。 | 未取证 |
| AC-11 | **RR20 真实运行**：按 §5 RR-1..RR-8 执行：round8 干净副本（同根清理/会话剥离/账本重置，原 target 114/114 只读）、9223/9222 隔离、预算/停止/attestation、4 当前版本 targets（expectedFrom null、新 operationId）、8 frozen+versions=9 文件快照、candidate/publication policy allowed（无 freeze-closure/raw-write-scope/target-absent）、预期链 bootstrap→trunk→workflow→团队计划→run pin→D3→激活→实现→游戏/下一门；不伪造、不重试、不追加。 | 未取证 |
| AC-12 | **隔离/并行/同 PR**：候选 diff 不含 #81/团队计划/judge/提案卡修复的其它文件或区域（`apply-journal.ts` 仅 bootstrap 装配区域；`classify-shell.ts` 仅本方案两处）；B1+B2 同 PR/同批次（拆 PR 同发布批次且注明单独合并不改变真实运行）；#81 先合并/rebase 或 stacked；实施基线 fetch origin/`origin/main`+ #81；不提交/推送/合并/发布（由客户逐 PR 授权）。 | 未取证 |
| AC-13 | **测试/回归**：T1–T19 全部可执行并通过（或按预期 fail-closed）；受影响套件 before/after 按 BASE-3 无新增确定性失败/新 skip、已知红不恶化；`npm run typecheck` exit 0；旧断言改写逐条记录（不得删除/弱化 fail-closed 断言）；`test/测试/git-write-chain-fixture.ts` 如改只做加法导出并列出依赖套件回归面。 | 未取证 |
| AC-14 | **证据/attestation/披露**：RR20 绑定 RR19 `a4a90ebe…`、方案 P1.1 `643cb33f…`、R1.0/R1.1、协调方 T3/RR20 授权、`prepare-report`/`target-clean-manifest`/原 target 114/114、证据 manifest；披露 RR19 遗留 draft run/init-source/`s-9fbf9c81…`、账本重置/会话剥离、模型 deepseek-v4-flash、7-target 不在范围、raw-object 预算、#81 依赖；不伪造。 | 未取证 |

## 4. 测试矩阵（T1–T19）与受影响套件

### 4.1 测试矩阵（按 P1.1 §5.1 逐条转写）

| # | 场景 | 预期 | 层 | 判定 |
| --- | --- | --- | --- | --- |
| T1 | **受支持 bootstrap**：4 当前版本 targets（proposal v2、architecture v2、roster v2、modules v1，`expectedFromSha256:null`）+ `versions.jsonl`（8 frozen + 5 草稿旧 sha；intent v1 含于 8 frozen）+ 3 历史 v1 文件在盘 | `prepareDirectSubmission` 快照 **9 文件**（8 frozen 文档含 intent v1 + versions.jsonl）；`prepareDirect` 通过；经 `executeGitBusinessPublication` 的 candidate+publication policy **allowed:true**（含 M2 允许集）；无 target absent/freeze-closure/raw-write-scope | 编排+门禁+集成 | 未取证 |
| T2 | **7-target 同 kind 多版本单请求**（RR19 原样） | `prepareDirectSubmission` 明确拒绝（service 直呼 `trunk-item-invalid`；全链 `submitDirect` 映射 `vca-target-invalid`，N1），消息含 slot/「历史由 R9 自动装配」；无提交；不再以「Target bytes absent」/`expectedFrom` 计数错误呈现（M1） | 编排 | 未取证 |
| T3 | 历史 frozen 文件缺失（记录在、磁盘无） | fail-closed：`vca-target-invalid`，消息含路径；无 manifest/ref；无 freeze 追加 | 编排 | 未取证 |
| T4 | 历史 frozen 文件漂移（磁盘 sha ≠ 记录 sha） | fail-closed（`snapshot-hash-drift`/明确消息）；无提交 | 编排 | 未取证 |
| T5 | 历史 frozen 文件不可读（IO/权限） | fail-closed；无提交 | 编排 | 未取证 |
| T6 | versions.jsonl 含未知 event / 坏行 / 非法 freeze 形状 | fail-closed；不跳过 | 编排+门禁 | 未取证 |
| T7 | 同 path 两种 sha（target 与 frozen 记录冲突） | fail-closed，消息含 path | 编排 | 未取证 |
| T8 | 无历史（全新项目，仅 intent-confirmed + 单版本 targets） | 行为与原实现一致（快照内容不变），bootstrap 通过 | 编排（回归） | 未取证 |
| T9 | 非 bootstrap 升级（t1→t2） | 快照内容/流程逐字不变；不调用闭合收集 | 编排（回归） | 未取证 |
| T10 | 门禁：versions.jsonl 含 frozen + 草稿行，快照含全部 frozen 文件 | `checkGitPolicy` allowed | 门禁 | 未取证 |
| T11 | 门禁：缺一个 frozen 文件 / frozen sha 不符 | 仍 `git-policy-app-freeze-closure`（强度不变） | 门禁 | 未取证 |
| T12 | 门禁：未知 event 或冻结行 `freeze` 非法 | 仍 `git-policy-app-freeze-record`/`-source` 拒绝 | 门禁 | 未取证 |
| T13 | 门禁：非 frozen 行未进入快照 | allowed（本变更语义） | 门禁 | 未取证 |
| T14 | marker/政策不变：`git-policy-app-*` 其他分支、team-plan/activation/workflow policy 用例 | 全部既有断言不变 | 门禁（回归） | 未取证 |
| T15 | **FS 媒体**：直接 `executeDirect`（bootstrap，无 preparedSnapshotRef） | 闭合集合装配 + `verifyClosure`（子集）通过；**不宣称 Git policy**（G1：`executeDirect` 不经 `checkGitPolicy`；Git 发布路径恒有 preparedSnapshotRef） | 编排（FS 回归） | 未取证 |
| T16 | 确定性/重放：同一 operationId 重放装配 | 相同快照 digest；`prepareSnapshot` 幂等；不同文件集合的旧 operationId → `snapshot-immutable-conflict`（fail-closed，披露） | 编排 | 未取证 |
| T17 | **多 flow 账本负例**：versions.jsonl 含异 flow 行 | 服务侧逐行 fail-closed（消息含 flowId，不静默过滤）；门禁仍按 `:726` 拒绝 | 编排+门禁 | 未取证 |
| T18 | **`-vN.md` 后缀版本 ≠ record.version** | 服务侧防御性 fail-closed（Q7）；门禁保持 `:728` 原样使用路径（差异与理由写明） | 编排+门禁 | 未取证 |
| T19 | **M2 负例**：快照含额外 `snapshot-content` 文件但无对应 frozen 记录 | 门禁仍 `git-policy-raw-write-scope` 拒绝（允许集不得过宽；路径选择见 N2） | 门禁 | 未取证 |

### 4.2 受影响套件、命令与 before/after

- `npm run typecheck` exit 0。
- 编排：`test/编排/direct-role-capabilities.test.ts`、`test/编排/git-trunk-store.test.ts`、`test/编排/git-capabilities.test.ts`（+新增 `test/编排/bootstrap-frozen-closure.test.ts` 如采用）。
- 门禁：`test/门禁引擎/git-shell-acl.test.ts`（新增 M2/closed-scope 用例）、`test/门禁引擎/versioned-doc-guard.test.ts`（语义回归）、`test/门禁引擎/classify-shell.test.ts`（shell 判定不受影响）。
- 跨角色/集成：`test/测试/bootstrap-freeze-closure-integration.test.ts`（优先新增）；`test/测试/version-change-integration.test.ts`；`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（调用 `checkGitPolicy` 的回归）。若改 `test/测试/git-write-chain-fixture.ts`，列出依赖套件并全跑。
- 目录级按 BASE-3：`test/编排/**`（22 fail/2 skip）、`test/runtime-core/**`（33/4）、`test/门禁引擎/**`（5/1）、`test/桌面应用/` 四文件（26）、`optional-acceptance` 6/2/1/3/0；before/after 失败/skip 集合 diff；新增确定性失败 0/新 skip 0。
- T3 口径：全量回归或至少受影响 + Git 发布链全链（协调方裁决；默认按 T3 全量/受影响+全链，不降档）。
- 命令：`node --test --test-concurrency=1 --test-reporter=tap <file/dir>`；Node v24.22.1；记录 tests/pass/fail/cancelled/skip/exit、日志 hash、环境。

### 4.3 旧断言改写逐条记录（不得静默放宽）

1. **预期不改写的既有断言（必须原样通过）**：`test/门禁引擎/git-shell-acl.test.ts` 既有 `git-policy-app-*` 断言、`versioned-doc-guard.test.ts`、`classify-shell.test.ts`、`test/编排/git-trunk-store.test.ts`、`git-capabilities.test.ts`、`direct-role-capabilities.test.ts` 既有冻结/意图用例、`test/测试/version-change-integration.test.ts`；T14 明确其他 policy 分支不变。
2. **允许的改写仅限**：新增测试文件；为新增 M1/M2/闭包语义在既有测试文件中新增断言；任何改写必须逐条给出 `文件:行`、旧断言原文、新断言、理由（对应 AC/T）、证据行；**不得删除/弱化 fail-closed 断言**。
3. `test/测试/git-write-chain-fixture.ts` 如改：只做加法导出（S6），列出全部依赖套件并全跑；不得改既有导出语义。
4. 旧快照 digest 硬编码：T8/T15 若因快照内容更多而需更新，逐条记录旧/新 digest 与理由；不得放宽断言求绿。
5. 任何 skip/force-exit/watchdog/删除断言求绿 = fail；环境抖动须同候选隔离复跑通过方可排除。

### 4.4 证据绑定

- 所有 T 用例日志标注候选 digest/manifest、命令、环境、Node 版本、退出码与计数；同一用例不得跨候选拼接；真实运行（§5）单独层级。
- 证据层级按 BASE-8：L1 服务装配 → L2 门禁 policy → L3 跨角色集成 → L4 RR20；低层不得替代真实运行，反之亦然。

## 5. 真实运行标准（RR-1..RR-8；对应 P1.1 §6 RR20）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| RR-1 | **环境/隔离**：真实 Electron（本候选 worktree `app/main.ts`）+ 真实模型 + 真实 UI；隔离 `--userData`；CDP **仅 9223**；**9222 预检/后检 0 LISTENING、零占用/零触碰**；运行根仓库外 `…\ans-snake-fullchain-run-2026-11-10\round20\`；目标 = round8 干净副本 `…\round8\target`；原 target `…\ans-game2d-snake-2026-11-09\target` 只读（114/114）；记录候选 HEAD/聚合、入口、provider、userData/目标/端口、模型名。 | 未取证 |
| RR-2 | **round8 干净副本/预置**：同根清理（非新建 init/不换 repoId）：`.ans/sessions` 移动到 `round20/evidence/pre/sessions-source/`（前后逐文件 hash 一致、源目录消失）；`tasks.jsonl` 复制到 `pre/source-ledger-tasks.jsonl` 后重置为空（0 B），披露 fixture 准备；保留/复核 docs 8/8 冻结文档、`.ans/trunk/initialization-sources` 20、`operations/83ca5888…`、snapshots 10→11（含 `s-9fbf9c81…`）、`git-init-process.json`、versions（21 行）、doc-freezes、version-changes、stable-write 状态、`.git/` 候选 ref；清理后 <16 MiB、账本 0 行、无 legacy moduleDirectory；**RR19 遗留 draft run `run-hub-7e1a…`/init-source `be2b729c…`/快照保留并披露**（G2）；原 target 114/114 match。 | 未取证 |
| RR-3 | **bootstrap VCA**：1 条客户消息 → 派 product → 4 当前版本 targets（proposal v2、architecture v2、roster v2、modules v1；action add；`expectedFromSha256:null`；**新 operationId `…-02`**，不得复用 `…-01`）→ `submit_version_change` → 回执 `ok:true status:"applied"`；快照 files = **8 frozen 文档（含 intent v1）+ versions.jsonl = 9 文件**；candidate/publication policy allowed（无 `git-policy-app-freeze-closure`/`git-policy-raw-write-scope`/target absent）；trunk `t1` manifest/`refs/ans/trunk` 落盘；任务文本明确「历史由账本自动装配、不得列历史为 targets、同 kind 多版本会被拒」。 | 未取证 |
| RR-4 | **预期链**：bootstrap VCA applied → effective trunk `t1`（manifest + `refs/ans/trunk`）→ 初始 workflow stable 发布（显式 approve）→ 团队计划登记（team-v2）→ run pin → D3 任命 → 角色卡/激活 → 工作流 → 实现 → 游戏产物或下一门；按序取证；若停在下一门，如实记录并归类（非本变更失败，不伪造）。 | 未取证 |
| RR-5 | **预算/纪律**：客户消息 **1**（+1 仅合法客户决策）；客户面对卡 ≤4；应用层派发 ≤8；chief 回合 ≤8；convener ≤3；product/impl 各 ≤4；其它角色各 ≤3；**Git 能力调用 ≤8**；墙钟 ≤45 分钟；**首果即停、不自动重试、不追加**；不触碰 9222/其它根；变更/门工具（`submit_version_change`/`request_stable_write`/`complete_team_plan`/`git_candidate`/`git_publish`/`activate_role_documents`/`select_run_change`/`close_created_task`）blocked/failed 立即停止；`run_shell` 即停；只读 `git_query` blocked 记录不停止。 | 未取证 |
| RR-6 | **attestation/依据绑定**：RR20 记录绑定 RR19 `a4a90ebe…`（182 行 / 23,923 B）、本方案 P1.1 `643cb33f…`、R1.0 `4c01b07d…`/R1.1、协调方 2026-11-10 书面授权（T3+RR20 范围/预算/禁令）、`prepare-report.json`、`target-clean-manifest.json`/`target-clean.sha256`、原 target 114/114、证据 manifest（逐文件 SHA-256）；披露 RR19 遗留 draft run/init-source/快照保留；无第 2 条客户消息；不伪造。 | 未取证 |
| RR-7 | **证据/如实性**：诊断/账本/回执/VCA 快照/manifest/UI 截图/驱动日志/端口进程/原 target 只读快照/证据 manifest 齐备；失败/偏差/下一门/预算偏差如实报告；模型名如实（deepseek-v4-flash，非 Anthropic）；不拼接 RR14/RR19 的失败证据冒充本轮成功；不宣称未发生的结果。 | 未取证 |
| RR-8 | **同一候选/隔离/同 PR**：RR20 使用 B1+B2 同候选/同配置；不得用 #81/团队计划/judge/提案卡修复证据替代；运行前后 `git status`/`git diff --stat` 证明仅允许写集变化；9222 零改动/9223 释放/无 Electron 残留；未提交/推送/合并/发布（客户逐 PR 授权）。 | 未取证 |

## 6. 证据与检查要求（EV1–EV6）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| EV1 | 基线/候选：BASE-1–BASE-5；#81 合并/rebase/stacked；干净基线；候选只含允许文件；写集外 diff=0；聚合/manifest 可复算；已知红逐条对照。 | 未取证 |
| EV2 | 服务装配：AC-1/3/6/8/9；T1–T9/T15–T18；9 文件装配、frozen 记录 sha=磁盘、排序/去重/哈希算法、M1 拒绝、账本负例、fail-closed 无副作用。 | 未取证 |
| EV3 | 门禁：AC-2/4/5/10；T1/T10–T14/T19；闭包仅 frozen、允许集只 frozen 证明、T19 不放宽、其它 policy 不变、candidate/publication 一致。 | 未取证 |
| EV4 | 集成：AC-4/7/10；T1/T10–T13/T17/T19；真实 Git 对象 + 真实 `prepareDirectSubmission`；服务/门禁路径解析一致；团队计划/激活/initial-workflow 不受影响。 | 未取证 |
| EV5 | 回归/静态：AC-7/13；受影响套件 before/after；T14/T8/T9/T15；typecheck 0；旧断言改写逐条；无新增确定性失败/新 skip。 | 未取证 |
| EV6 | 真实运行：AC-11/14；RR-1–RR-8；预算/隔离/attestation/证据/如实性；9222 零改动与 9223 释放；RR19 残留披露；模型名如实。 | 未取证 |

## 7. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前最终候选上全部适用项有完整、可复算原始证据；bootstrap 快照 9 文件/frozen 记录逐字节/排序去重/哈希算法；冻结闭包仅 frozen 且强度不变；M1 同 kind 多版本明确拒绝；M2 允许集只 frozen 证明；规模/预算 fail-closed；多 flow/版本后缀/未知/漂移/不可读 fail-closed；旧调用/非 bootstrap/team-plan/initial-workflow 逐字不变；错误码集合不变；T1–T19 与受影响套件/typecheck 通过；RR20 按预算/隔离/attestation 完成并如实报告（含下一门）；B1+B2 同 PR/同批次；写集/H1 合规。
- **fail**：放宽 frozen 闭包/允许集到任意路径；伪造 frozen 文件/记录/回执/通过；删除/弱化 fail-closed 断言或新增 skip/force-exit/watchdog；改 schema/数据模型/versions 格式/角色/边界/权限/writeSet/roster；提升 raw-object 预算；支持同 kind 多版本单请求；只落 B1 或只落 B2 宣称通过；RR20 占用 9222/改动贪吃蛇根/target/9223 未释放；无证据宣称成功；拼接旧候选/旧证据。
- **insufficient evidence**：缺基线/候选/聚合/manifest/hash；缺 T1–T19 任一锚点；缺 before/after 计数/失败名集合 diff；缺 M2 允许集正负证据；缺 RR20 环境/预算/attestation/证据包；缺 9222 零改动/9223 释放；缺旧断言改写记录；证据跨候选/环境拼接或无法复算。
- **not applicable**：仅限有明确依据者（Pi/Codex 真实模型：本变更真实运行只承诺 Claude/当前模型；renderer：不触及；同 kind 多版本单请求：明确范围外；team-plan 快照：仅 `directRefs` 不涉及本装配）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以退出 0/自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不得拼接旧候选/旧证据/不同环境/其它 B1 证据；B2 只对同一最终候选判定，不授权提交/推送/合并/发布。

## 8. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；全部条目 `未取证`；编号口径/T 矩阵/残余在案 | — |
| 协调/派发闸门 | BASE-1/2/7：#81 合并/rebase/stacked、fetch origin、干净基线、T3 确认、B1+B2 同 PR/同批次、单写者 | 不派发；补协调/重排；重评写集/次序 |
| 实施 B1（编排） | 仅编排写集；AC-1/3/6/8/9、T1–T9/T15–T18；frozen 装配/M1/fail-closed；非 bootstrap 不变 | 回 owner；越界即停止升级 |
| 实施 B2（门禁） | 仅门禁写集；AC-2/4/5/10、T1/T10–T14/T19；闭包仅 frozen/允许集只证明集；其它 policy 不变 | 回 owner；越界/放宽即停止升级 |
| 集成 B3 | AC-4/7/10、T1/T10–T13/T17/T19；真实 Git 对象 + 真实 prepare；服务/门禁一致 | 回相应 owner；不得单方判过 |
| D1/确定性 | T1–T19、EV1–EV5；受影响套件 before/after；typecheck 0；旧断言记录；无新增确定性失败/新 skip | 回 owner；不得放宽断言求绿 |
| 真实运行 RR20 | RR-1–RR-8 预算/隔离/attestation/证据完成并如实报告（含下一门） | 不进入 B2 pass；按证据不足/返工处理 |
| B2 | 同一独立验收身份按本 B1 全部适用项判定；候选/证据链齐备；披露充分 | 报告 pass/fail/insufficient；不授权发布 |

**复判规则**：本 B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响；候选/基线/#81 状态/公共契约/写集/依赖/夹具/构建/命令/环境变化使证据失效并重取；证据复用须证明候选关联且输入/依赖/契约/命令/环境未变；#81/团队计划/judge/提案卡修复或其它 B1 证据不得冒充本候选；提交/推送/合并/发布/tag 未授权。

## 9. 残余/待确认（Q1–Q14、N1–N6 与其它条件）

| 项 | 本 B1 的处置/条件 |
| --- | --- |
| Q1/T3 | T3 已确认；`classify-shell.ts` 共享抽象 + 治理判定语义；若协调方改判 T2，须书面 T2 例外及理由，否则按 T3；不得自评降档。 |
| Q2 | 闭包仅 `event:"frozen"`（冻结终态 ⇒ 已冻结路径末条必为 frozen；未冻结路径末条为 draft-updated，字节未必可入快照）；S3。 |
| Q3 | 服务侧仅纳入 `flowId === 当前 flow` 的 frozen 行；异 flow 行逐行 fail-closed，不静默过滤；T17。 |
| Q4 | RR20 任务文本采用「只提交当前版本 targets（每 kind 恰一个）、应用自动补历史」；T1/RR-3。 |
| Q5 | bootstrap 同 kind 多版本单请求明确拒绝（不 last-wins/不取最高）；T2；不属本变更受支持路径。 |
| Q6 | 外部错误码集合不变（只改消息）；旧调用/RR 判断沿用 `vca-target-invalid` 等；AC-7。 |
| Q7 | 历史 frozen 路径实际 `-vN.md` 且 N ≠ record.version：服务侧防御性 fail-closed；门禁保持 `:728` 原样；T18。 |
| Q8 | #81 先合并后 rebase，或 stacked PR base=`feat/document-format-specifications` 合并后 retarget；实施前 `git fetch origin`，以 `origin/main`（`caabeea`）+#81 为基线，本地 `main`（`c1fb74a`）落后；BASE-1。 |
| Q9 | RR20 使用新 operationId（`…-02`）；披露 RR19 残留快照 `s-9fbf9c81…` 为证据；同 ID 会 `snapshot-immutable-conflict`；AC-8/RR-2。 |
| Q10 | 大型历史 bootstrap 规模限制接受为已知限制：128 文件/单文件 1 MiB/整单 4 MiB/树条目 2048/base64≈1.33× ⇒ 文档原始约 ≤1.5 MB；超限 `git-policy-raw-byte-budget` fail-closed，不提升预算；AC-5。 |
| Q11 | B1+B2 同 PR；拆 PR 必须同批次合并后运行 RR20；AC-12。 |
| Q12 | `executeDirectInternal` fallback 同步接线（共用 helper）；仅 FS 媒体旧直连可达，T15 按 FS 回归、不宣称 Git policy；AC-7/T15。 |
| Q13 | 同 kind 多版本单请求明确拒绝只限 bootstrap；非 bootstrap 仍由既有 `:713-714` 拒绝，行为/消息不变；AC-3。 |
| Q14 | 规划/缺陷/复核三份未跟踪记录随实施 PR（或 docs-only 提交）提交，路径/哈希写入 B2/D1 记录；S5/§2.1。 |
| N1 | T2 层口径：service 直呼 `trunk-item-invalid`；全链 `submitDirect` 映射 `vca-target-invalid`；B1/B2 记录写明测试层。 |
| N2 | T19 选择 `gitRolePath` 不放行的路径（如 `docs/proposals/<flow>-proposal-v9.md`），并注明 product/version-upgrade facts；不得选 `docs/product/`（会被直接放行）。 |
| N3 | M1 收缩后服务侧不推断版本高低；当前版本由角色声明；§6.3/RR-3 任务文本引导；如需防御性校验（槽位 target 为该族最高冻结版本）另立变更。 |
| N4 | `versions.jsonl` 仅在 bootstrap 进入快照；initial-workflow 继承 bootstrap 全部文件但走 `initialWorkflowMetadataPaths` 且按 `:405-409` 放行；`appMetadataPaths` 两处改动只对 bootstrap 生效；精确化披露。 |
| N5 | 服务侧最小形状未要求非 frozen 行 `freeze === undefined`（门禁 `:731` 要求）；整体仍 fail-closed；如需更早拒绝可并入服务侧形状（实施注意）。 |
| N6 | T1 文案「8 frozen + 5 草稿旧 sha + intent v1」中 intent v1 已含于 8 frozen；按 §6.3 写成「8 frozen（含 intent v1）+ 5 草稿旧 sha」。 |
| 其它-1 | RR20 预算/授权以协调方 2026-11-10 书面记录为准；仓库内无独立预算留痕；RR20 记录须绑定该书面记录（G2）。 |
| 其它-2 | RR19 遗留 draft run/init-source/快照保留（`onlyUnpinnedDrafts` 接受 draft）；不 pin/不删除；pre 清单逐项记录。 |
| 其它-3 | 规划/缺陷/复核三份记录未跟踪；由策划/协调方随实施 PR 或 docs-only 提交，避免孤儿化。 |

## 10. 范围限制与披露

1. **模型（如实）**：RR19/RR20 真实运行模型为 **`deepseek-v4-flash`**（`.env` 与原生 `message.model` 一致；非 Anthropic Claude）；RR20 记录如实记录，不得宣称 Claude。
2. **RR19 残留（如实）**：RR19 遗留 draft run `run-hub-7e1a…`、init-source `be2b729c…`、快照 `s-9fbf9c81…`（63,937 B / `fa807db6…`）保留为证据；不 pin/不删除；RR20 使用新 operationId；同 ID 会 `snapshot-immutable-conflict`。
3. **7-target 不在范围**：同 kind 多版本 targets 单请求明确拒绝（M1 收缩）；RR20 只走 4 当前版本 targets；若未来需要，另立变更重设计 `expectedFrom`/槽位计数（T3）。
4. **T3**：门禁政策语义改动 + 服务装配；B1+B2 同 PR/同批次；不得拆批独立通过；若协调方改判 T2 须书面例外。
5. **raw-object 预算**：128 文件/1 MiB 单文件/4 MiB 整单/2048 树条目/base64≈1.33×；文档原始约 ≤1.5 MB；超限 `git-policy-raw-byte-budget` fail-closed；不提升预算；列为已知限制。
6. **#81 依赖**：文档格式 #81 先合并/rebase 或 stacked；实施基线 `git fetch origin`/`origin/main`+ #81；本地 main 落后；候选不得混入 #81 diff。
7. **记录归属**：方案/缺陷/复核三份未跟踪记录由策划/协调方随实施 PR 或 docs-only 提交，路径/哈希写入 B2/D1；不得孤儿化。
8. **多 flow/规模限制**：多 flow 账本逐行 fail-closed（不静默过滤）；含异 flow 行项目仍不能 bootstrap（既有语义，本变更不扩围）；大历史受 raw-object 预算限制。
9. **FS/Git 媒体**：T15 只作 FS 媒体回归；Git policy 由 T1/T14 覆盖；`executeDirect` 不经 `checkGitPolicy`；fallback 只对 FS 旧直连可达。
10. **本 B1 未运行任何真实模型/测试/Electron**：代码行为均来自 P1.1/复核只读核对；全部条目 `未取证`。
11. **写盘限制**：本 B1 只写 `docs/acceptance/`；未改代码/方案/测试/角色卡/边界/其它文档；未提交/推送/合并/发布；不授权实施。

## 11. 当前状态

- **B1 完成、冻结（实施前）**；BASE-1–BASE-8、AC-1–AC-14、T1–T19、RR-1–RR-8、EV1–EV6 当前全部 `未取证`，不得判 pass。
- 实施前置当前未满足：需 #81 合并/rebase 或 stacked、`git fetch origin` 干净基线；T3 已确认；B1+B2 同 PR/同批次；写集/单写者待派发。
- 后续由**同一独立验收身份**在候选/确定性测试/集成/RR20 证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并；不授权提交/推送/合并/发布。
- 本 B1 不修改其它 B1/在飞变更；发布/tag 不在授权内。
