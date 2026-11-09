# 修复记录（F7）：提案确认卡「通道未受理」——draft run 决策证据按实际项目字节绑定（A′，编排侧）

- 日期：2026-11-09
- 角色：ANS 编排（独立实施上下文；roleId `编排`）
- 状态：**修复记录先于代码**。本记录在修改任何代码/测试之前写盘；其后不再改写本文件，实施与验证的实际结果一律落在同目录证据夹
  `角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding-evidence/`（前后测试日志、diff、候选 hash、计数）。
- 工作类型与路径：缺陷修复快路径（F1–F9），T1；本记录只覆盖**子修复 A′（编排）**，与桌面窗口子修复 B（fail-closed 呈现）按「一缺陷、两同源子修复」拆分，各自单所有者。
- 依据（写盘前实测 hash）：
  - 缺陷记录（沟通；客户修复指示 1–4）：`docs/communication/2026-11-09_defect_proposal-card-run-binding.md`，48 行 / SHA-256 `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`。
  - 修复路由（调度；A′ 细节、D1–D5、A1–A7）：`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，183 行 / SHA-256 `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`。
  - 实施前验收标准 B1 v1（验收；条件性冻结，D2 采用 A′ 等价绑定）：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`，196 行 / SHA-256 `42a1ec9b86b8ae2fe7805de9fcedbac3ab71ae266999e09266c794abc65c963b`。
  - 基线：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（tree `262e7ba42ee646d055f65f92e640834a89addde1`）；`git status --porcelain -- src app test` = 0（干净）。

## 1. 症状（真实运行观测）

- 贪吃蛇真实测试（2026-11-09）：幕僚经策划（rapporteur）在 **draft run** 上发出「提案确认」卡（`requestId=req-e6ff1693840f0ed0`，`cardKind=proposal`，`flowId=snake-game`）。
- 卡片呈现给客户；但每次提交都失败，界面显示「回传失败：通道未受理——请重试」，可无限重试、永不成功；幕僚回合被阻塞（会话「正在工作」）。
- 主进程诊断在卡片创建瞬间记录 `event:"chief-decision.failed"`、`errorMessage:"Draft request target is not bound to that run"`；返工重出卡（`req-2454680582827a06`）复现同一错误。角色侧重新出卡不可能成功（非模型操作问题）。

## 2. 根因（HEAD 实测 file:line）

1. **draft run 在 pin 之前没有任何文档绑定写点**：`src/common/编排/run-manifest.ts` `ensureDraftRun`（`:322-353`）新建 draft 时字面量 `documents: {}`、`execution: { teamPlan: null, flow: null }`；`writeRunManifest` 的全部调用方中只有 pin/re-pin 路径写 `documents`。实测目标项目 `.ans/runs/` 下 4 个 draft manifest 的 `documents` 全为空对象。
2. **`prepareDecisionEvidence` 的 draft 分支要求「请求目标 ⊆ manifest refs」，refs 恒空 ⇒ 必然拒绝**：`src/service/trunk/impl/apply-journal.ts:881-1003`；draft 分支 `:941-953` 收集 `run.documents/execution` refs，`refs.length===0 || paths 不在 refs ⇒ unavailable("Draft request target is not bound to that run")`（`:948`）。
3. 该提案卡的宿主事实 `judgeContext`（`src/pipeline/orchestration/run-role.ts:1595-1608`）不含 `artifacts`（历史字段，运行时无生产者），`metadata.criteriaRef` 亦无生产者 ⇒ 请求目标 `paths=[]`；但即使不看 paths，`!refs.length` 已先失败。
4. **结论**：draft 阶段的任何 run-bound 客户决策卡（proposal/decision/appointment/acceptance）在宿主准备（`host.prepare`）阶段都必然失败——这是结构性缺陷，不是 snake-game 特有，也不是模型误操作。呈现 fail-closed（子修复 B）与提交闸不在本记录范围。

## 3. 预期行为（已确认基线，F1）

- 呈现给客户的提案确认卡（及其它客户决策卡）在**证据真实存在**时应被正确承载、可裁决（缺陷记录客户修复要求 2）：由应用在出卡时按**实际项目字节**完成绑定（快照 + 哈希）或等价的可验证机制；**未知/不可读/哈希不符仍 fail-closed**。
- 既有 pinned-run 决策路径与无 runId 的意图/初始路径不得弱化（客户修复要求 3）。

## 4. 修复后的行为（A′：应用侧等价绑定，仅编排）

仅改 `src/service/trunk/impl/apply-journal.ts` `prepareDecisionEvidence` 的 **draft 分支**（约 `:941-953`）。语义：

1. **manifest refs 非空时逐字保留既有权威**：请求目标必须 ⊆ refs；refs 文件按 manifest 哈希重读比对，不符 ⇒ `"Draft run evidence drifted"`；行为与现状一致（A5/AC-5）。
2. **refs 为空（当前唯一现实形态）时启用等价绑定**：
   - 目标路径集 = `judgeContext.artifacts` 的路径值 + `metadata.criteriaRef.path`（应用/host 计算事实）；两者皆无时用既有 `discoverDecisionFiles(projectRoot, flowId)`（`docs/product|proposals|contracts` 下 `<flowId>-*` 最新版本化文档，与无 runId 分支同一发现机制）。
   - 模型/角色自报路径（`metadata.paths` / `judgeContext.paths`，确认卡专用）**只做 ⊆ 校验、绝不直接读取**：自报目标不在目标集内 ⇒ `unavailable("Draft request target is not bound to that run")`。
   - 对目标集逐文件 `store.readProjectFile` 读取**实际字节**（预算沿用：读取上限 2 MiB；`DECISION_FILE_LIMIT=64 KiB`/`DECISION_TOTAL_LIMIT=256 KiB` 与 secret 检查在快照前生效），经既有 `markers()` 把逐文件 SHA-256 纳入 `verification`。
   - `criteriaRef.sha256`（若有）与盘上实际字节不符 ⇒ `unavailable`（哈希不符，fail-closed）。
   - 由既有快照 API `store.prepareSnapshot` 生成 `complete-snapshot/v1` 证据快照（`snapshotId=decision-<digest>`、`digest=completeSnapshotDigest(files)`，files 与实际字节一致），`baseDigest/evidenceRefs` 绑定本次裁定。
   - 使用目录发现时记录 `discovery.digest`（与无 runId 分支同形）：结算前 `isCurrent()→checkDecisionEvidence` 重新发现/重读实际字节比对，**文档变更或新版本出现 ⇒ 基底过期**（chief 拒绝结算，fail-closed）。
   - 空目标（无 artifacts/criteriaRef 且发现集为空）⇒ `unavailable("Draft request target is not bound to that run")`；**不呈现、不伪造、不生成快照**。
3. **pinned 分支（`:929-940`）与无 runId 分支（`:955-978`）逐字不动**。
4. **不写 run manifest、不改 `run-manifest.ts`/`src/model/**`**：`documents` 保持空对象、manifest 字节/哈希前后一致；不新增数据模型/公共契约（D2 采用 A′ 等价绑定）。

## 5. 范围与非目标

- 写集：`src/service/trunk/impl/apply-journal.ts`（单文件；如需 helper 仅限同文件/`src/common/编排/`）；`test/编排/direct-role-capabilities.test.ts`（补用例）。
- 非目标/禁止：`src/common/编排/run-manifest.ts`、`src/model/**`、`src/pipeline/orchestration/run-role.ts`、桌面窗口（`app/desktop/**`、`app/renderer/**`）、`src/provider/**`、其它角色资料、角色卡/边界/治理/权限/验收标准；不改 `RunDocKind`/`request.*`/IPC 形状；不新增数据模型或公共契约。**若实现必须越界/新增契约 ⇒ 停止并升级，不在本记录内实施。**
- 子修复 B（materials 失败 fail-closed 呈现）由桌面窗口角色另行处理，不在本记录。

## 6. 回归场景（测试矩阵，对应 B1 §4.1 A1–A7）

- A1 draft 空 refs + 盘上存在 flow 版本化文档 ⇒ 成功：`context` 含实际字节；`evidenceRefs` 逐文件 sha256 + 快照 `complete-snapshot/v1` 可读、`digest` 可复算；`isCurrent()===true`；**manifest 未被写**（字节/哈希前后一致）。
- A2 prepare 后文档变更 / 新版本出现 ⇒ `isCurrent()===false`；再次 prepare 用新字节、新 `baseDigest`；旧基底不得结算。
- A3 未知/越界/角色自报目标 ⇒ 仍 `"Draft request target is not bound to that run"`，不生成快照、不读自报路径。
- A4 目标不可读/缺失/非文本/超大/含 secret、`criteriaRef.sha256` 不符 ⇒ 既有错误分类拒绝，不生成快照，不静默降级为目录发现或伪造哈希。
- A5 manifest refs 非空 ⇒ 既有行为不变（子集要求 + `"Draft run evidence drifted"`）；既有用例 `direct-role-capabilities.test.ts:945-956` 原样通过。
- A6 pinned 分支：既有 不可变字节/live 泄漏拒绝/closed run `isCurrent=false` 用例（`:919-943`）原样通过，分支源码 diff 0。
- A7 无 runId 分支：既有发现集/新版本过期/secret/超大用例（`:896-917`、`:957-965`）原样通过，分支源码 diff 0。
- 附加：`test/桌面应用/optional-acceptance.test.ts` 为基线已知红项，**不在写集、不修改**；不纳入本角色的写集证据，仅记录不恶化。

## 7. 验证计划

- 命令：`node --test --test-concurrency=1 "test/编排/**/*.test.ts"`（改前/改后各一次，记录 tests/pass/fail/skip/exit；新增确定性失败 = 0、新 skip = 0）；`npm run typecheck` exit 0。
- 真实模型/Electron：**不运行**；不占用贪吃蛇 9222（本子修复为确定性层验证；真实运行标准 RR-1–RR-7 由协调方另行安排）。
- 证据：上文证据夹保存 前后日志、`git diff`、改动文件前后 hash、候选（HEAD/tree/diff 统计）、测试计数对照。
- 提交纪律：不提交/推送/合并/发布。

## 8. F1/F2/F4/F8 确认

- **F1（预期行为已在确认基线内）**：通过——缺陷记录「客户修复指示」要求 2（合法出卡可提交：由应用按实际项目字节完成绑定（快照+哈希）或等价可验证机制；未知/不可读/哈希不符仍 fail-closed）；要求 3（不弱化 pinned/意图确认路径）。
- **F2（实际结果偏离且可复现）**：通过——真实运行诊断 `chief-decision.failed`（`Draft request target is not bound to that run`）×2 + 目标项目 4/4 draft manifest `documents:{}` + 20 张截图 + 无限重试记录。
- **F4（不新增/改变公共契约、共享抽象、数据模型、跨角色接口、架构分层、模块边界）**：通过——仅收窄 draft 分支的接受条件（输出形状不变）；不写 manifest、不改 `RunModel`/`RunDocKind`/IPC。
- **F8（既有指派/客户修复指令覆盖所有者、范围与写集）**：通过——编排为既有所有者（`角色卡/编排/boundary.md` §1 覆盖 `src/service/trunk/impl/apply-journal.ts` 与 `test/编排/`）；客户「修复并继续」+ 调度路由 A′ 子修复指派覆盖本写集。

## 9. 「记录先于代码」

- 本文件在 `src/service/trunk/impl/apply-journal.ts` 与 `test/编排/direct-role-capabilities.test.ts` 的任何改动**之前**写盘；写盘时的基线 hash 见同目录证据夹 `before-file-hashes.txt`。实施结论不写回本文件（保持 mtime 顺序可核对），实际结果见证据夹。
