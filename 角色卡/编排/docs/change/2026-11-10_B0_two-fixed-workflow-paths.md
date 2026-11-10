# 编排批次变更记录：T3 两条固定工作流路径 B0 基础设施/账本（fixed 任务豁免 / 投影 / 模式 / basis 骨架）

- 批次：**B0 基础设施/账本**（团队计划 §三 B0「编排」行；方案 v1.3 §10.2 B0）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）；写集 `src/common/编排/task-state.ts`（M）、
  `src/common/编排/workflow-state.ts`（新）、`workflow-service.ts`（新）、`basis-guard.ts`（新）、
  `src/pipeline/orchestration/run-role.ts`（M，**仅**补 `CARD_KIND_ROUTE_HINTS["merge-main"]`）、
  `test/编排/**`（新 5 文件）与本角色 `docs/change/` 记录
- 日期：2026-11-10；worktree `.claude/worktrees/trunk-amendment`，分支 `feat/two-fixed-workflow-paths`，
  HEAD **`ad22192197b28f401de8e1d22669b577ef4833e0`**（代码基线 **`10f90c769ce9c2a567cdd364def0037fe9019a05`**）
- 依据（写盘实测 hash）：
  - B1 验收 `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`
    （197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`）——
    AC-06/AC-08/AC-12/AC-15/AC-17/AC-18/AC-19、T-03/T-05/T-06/T-07/T-08（B0 只做基础部分）
  - 方案 v1.3 `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md`
    （1,392 行 / 184,391 B / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8`）——
    §4.1（WorkflowView/事件/账本/per-flow）、§4.4（合法转移/返工/stop）、§4.5（阶段完成骨架）、
    §5.2/§5.3（.gitignore/basis）、§7.1（事件字段/fixed task.created 校验）、§7.2（basis 校验）、§3.3（stage-request 类型理解）
  - 团队计划 `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md`
    （159 行 / 17,013 B / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211`）
- 状态：**B0 编排批次已实现**；新增 31 用例 **31/31 pass**；`npm run typecheck` **exit 0**；
  `test/编排` before/after 失败名集合 **完全相同**（24 known red 不恶化、新增确定性失败=0、新 skip=0）；
  **未 commit / 未 push / 未 merge / 未发布**；未运行真实模型/Electron；未占用 9222/9223。

## 1. 实施内容（按写集）

### 1.1 `src/common/编排/task-state.ts`（M，+117/−9）：fixed `task.created` 豁免（MF-3 / AC-17 / T-06）

按 v1.3 §7.1 MF-3 精确分支（`appendTaskEvent`，:404 起）：

- **`kind==="task.created"` 且 `workflowId !== undefined`（fixed）**：
  - `workflowId` 必填合法 slug；`flowId` 必填且合法 slug；`stage ∈ WorkflowStage` 必填；
  - `taskKind` 可缺省（普通生产任务）；给出时只允许 `"stage-request"`；`workflowPath` 只允许 `"A"|"B"`；
  - **`runId`/`runState` 出现即拒绝**（`fixed-task-run-forbidden`）——fixed 任务不带 run；
  - `workflowPath` **仅首 stage-request**（G-1/§3.3）：携带时要求 `taskKind==="stage-request"`，且同
    `workflowId` 已存在 stage-request 任务 ⇒ `workflow-path-not-first`（同幂等键 replay 放行）。
- **无 `workflowId` 且 `flowId !== undefined`**：旧 `run-required` 规则**逐字保留**（含 `allowLegacyRun`
  历史/测试重放语义；文案/code 不变）。
- **读侧**（`validateEvent`，:1102 起）：fixed 字段给出即 fail-closed 校验（坏形状按坏行计数跳过，不猜）；
  `workflowPath` 无 `workflowId` 拒绝；旧行无字段照常。
- **replay**（:1188）：fixed 任务（`workflowId` 存在）不再被回填 `runState:"legacy"`（旧 legacy 回填逐字保留）。
- **`taskCardOf`/`renderTaskCardLines`**（:1283/:1386）：可选输出 `workflowId/stage/taskKind/workflowPath`；
  fixed 任务不渲染 `run：legacy（未冻结）`，改为渲染 `工作流：<wf>（路径 X，stage Y，taskKind）`。
  `taskStatusOf`/`findTaskByIdempotencyKey` 语义不变（新字段仅随 `created` 保留）。
- `appendTaskEvent` 改为 `async`（同一 `Promise<AppendResult>` 返回形状；无抛错语义变化），仅用于
  「workflowPath 首请求」检查读取 tasks 账本。

### 1.2 `src/common/编排/workflow-state.ts`（新，364 行）：投影（AC-08 / AC-17 / T-03）

纯函数（**无 I/O / 时钟 / 随机**）；类型/守卫只消费 `model/runtime.ts`：

- `WorkflowView`/`WorkflowStageState`：v1.3 §4.1 冻结形状（workflowId/flowId/path/stage/status/stages/
  basisId?/releaseId?/reviewRoleId?/blocked?）＋ B0 可选追加（`stopping?`/`closed?`/`activatedRoleIds?`/
  `skippedEvents?`，仅加法）。
- `deriveWorkflowView(events, tasks)`：
  - 事件只增：同幂等键重复忽略（first wins，计 `duplicate`）；形状非法事件计数跳过（计 `invalid`）；
  - **关键事件缺失/顺序非法 ⇒ `blocked.code="workflow-corrupt"`**（空账本/首事件非 `workflow.started`/
    身份不一致/重复 started/非法转移均 fail-closed，不猜、不自动推进）；
  - 阶段状态机骨架：`WORKFLOW_STAGE_TRANSITIONS`（v1.3 §4.4：A1→…→A10→A11/A12a、A12a→A11、
    A11→A12b、A12b→A12/A13、A12→A13、B1→B2→B3→B4；返工边由 `stage.reworked.reworkOf` 表达）；
  - **A10→A11 门**：A10 未 completed 时 `stage.requested A11` ⇒ corrupt（AC-08/T-03）；
  - **A12a/A12b**：A10 completed 后 A12a 可直派（chief→reviewRole，无 stage.requested）；A12a 在办时
    允许推进 A11（G-1；criteria 可在实现期间完成）；A11 completed 后 A12b 可直派；A12b completed 后
    `stage.completed A12` 聚合完成；A12b rework 回 A11（新 attempt）；
  - A1/A4/A7 在 `stage.dispatched`（任务创建）即视为 completed（§4.5）；B2 完成于 `change.scope-decided`；
  - **stop 骨架**：`workflow.stop-requested` ⇒ `stopping`；`workflow.stop-unconfirmed` ⇒
    `blocked.code="workflow-stop-unconfirmed"`；`workflow.closed` ⇒ `closed{outcome,reason}` 终态
    （关闭后任何新事件 ⇒ corrupt）；关闭清空 stop-unconfirmed 的 blocked；
  - `tasks` 仅作补充：本 workflow 的 fixed `task.created` 将仍 pending 的 A1/A4/A7 等标记派发/完成
    （A12a/A12b 只认账本事件，避免与 G-1 顺序规则冲突）；阶段完成判定完整实现留给 B1。
- `nextStages(view)`：关闭/stopping/corrupt ⇒ 空；completed ⇒ 静态后继（过滤已完成）；A12a 在办 ⇒
  `[A11, A12a]`；其余 ⇒ 同阶段（首发/重试）。

### 1.3 `src/common/编排/workflow-service.ts`（新，442 行）：账本/模式/配置骨架（AC-12 / AC-15 / T-05 / T-07）

- 账本路径常量：`.ans/state/workflows.jsonl` / `basis.jsonl` / `releases.jsonl`；schema 聚合
  `FIXED_PATH_LEDGER_SCHEMAS`（`ans-workflow/v1`/`ans-basis/v1`/`ans-release/v1`，单一来源=Model）；
  `FIXED_LEDGER_LIMITS` = 5 MiB × 3（`jsonl-ledger` 默认）。
- `appendWorkflowEvent`/`appendBasisEvent`/`appendReleaseEvent`：Model 守卫校验（非法 ⇒
  `invalid-event`，不落盘）；**同幂等键 replay 返回原事件、不追加第二行**（进程内 per-file 串行链，
  read-then-append 原子化；跨进程并发不在 B0 范围）。
- `readWorkflowLedger`/`readBasisLedger`/`readReleaseLedger`：`jsonl-ledger` 旧→新读取、坏行计数
  （`badLines`/`errors`/`ignoredLines`）不阻塞。
- `workflowMode(projectRoot, flowId)`（**不缓存**）：`.ans/project.json workflowSchema==="legacy/v1"`
  ⇒ 强制 legacy；该 flow 有活动 legacy run（`.ans/runs/*/manifest.json` state ∈ {draft,pinned} 且
  flowId 匹配）或 `.ans/trunk/manifest.json` 有效 trunk 指向该 flow ⇒ legacy；否则 fixed（新 flow 一律
  fixed；`"two-fixed-paths/v1"` 与缺省同按 per-flow）。配置不可解析 ⇒ fail-closed legacy（不猜 fixed）。
  B0 解释（记录待 B1 复核）：trunk「未关闭」= 其引用的 run（如有）未处于 closed/cancelled。
- `writeProjectConfigWorkflowSchema`：原子写（同目录 tmp + rename）；**保留既有键**（governanceModel/
  roles/未知键原样）；已显式 `legacy/v1` ⇒ 不覆盖（`changed:false, skipped:"explicit-legacy"`）；
  既有值非法/文件不可解析/顶层非对象 ⇒ fail-closed `project-config-write-failed`（不覆盖）；
  已为目标值 ⇒ `changed:false` 不重写。
- `.gitignore` ans-managed 块骨架：`ANS_GITIGNORE_BLOCK_START/END`、`ANS_GITIGNORE_ENTRIES`（v1.3 §5.2
  18 项）、`ansGitignoreBlock()`、`ansGitignoreBlockStatus()`、`withAnsGitignoreBlock()`、
  `ensureProjectGitignore()`（缺失补齐/幂等/保留用户内容/原子写/起止标记不完整 ⇒
  `baseline-gitignore-malformed` fail-closed）。
- **不实现**：fixed 派发/session 路由/stage-request 受理/closeTask/prepareIntent/finalizeIntent/
  发布合并（B1/B3）。

### 1.4 `src/common/编排/basis-guard.ts`（新，370 行）：依据骨架（AC-19 / T-08）

- 发现：`discoverBasisDocuments(projectRoot, flowId)` 按 `<flowId>-<kind>-vN.md` 取最新版本
  （intent/proposal/modules/roster/architecture 必需，assets 可选；团队计划
  `docs/scheduling/<flowId>-team-vN.md` 单独字段）；缺失必需项如实列出。
- 有界读取：`readBasisDocuments` —— **32 文件 / 单文件 4 MiB / 总 8 MiB**，超限
  `basis-document-budget`（按本批任务口径命名；附实际计数）；缺失 `basis-document-missing`；
  其他读取失败/路径穿越 `basis-document-unreadable`；SHA-256/bytes 由实际字节计算
  （`sha256OfBasisBytes`）。
- `recordBasisDocuments`：发现 + 有界读取 + 团队计划单独字段（计入同一预算）。
- `basis.recorded` 构造/校验骨架：`basisIdFor(idempotencyKey)` = `bas-`+SHA-256 前 24 hex（确定性）；
  `buildBasisRecordedEvent`（`recordedBy:"application"`、`v:1`/`at`/schema/幂等键）；
  `isBasisRecordedEvent`（Model `isBasisEvent` + kind 收窄）。
- **Q4 `reason:"path-b"` 只读标记**：`isBasisReadOnlySnapshot` 仅判标记；**不产生写权**、drift
  fail-closed、不视为基线 3 件小事、不弹卡（文档化于函数注释）。
- `verifyBasisDocuments`：重算当前字节 SHA-256 与记录比对；漂移/删除（`actualSha256:null`）⇒
  `{ok:false, code:"basis-drift"}`。完整 verify 接线（A11/B3/A12/A13 关键门、`basis.drift` 记账）在 B3/B4。

### 1.5 `src/pipeline/orchestration/run-role.ts`（M，+1/−0）：B0 跨文件类型红修复

`CARD_KIND_ROUTE_HINTS`（:3234）新增**唯一**键：

```
"merge-main": "merge-main 为应用合并通道发起的高风险确认卡，必须客户本人确认、judge 不可代批；不得用 request_choice/request_confirmation 发该卡",
```

旧键/文案逐字不变；`GovernanceCardKind` 新增 `merge-main` 后 `Record<GovernanceCardKind,string>`
类型红（TS2322）消除，typecheck exit 0。

### 1.6 新增测试（`test/编排/**`，5 文件 / 31 用例 / 全部 pass）

| 文件 | 用例 | 覆盖 |
| --- | --- | --- |
| `task-state-fixed.test.ts` | 6 | fixed 放行/缺 workflowId 旧拒/`workflowId+runId` 拒/坏 stage·slug·path/`workflowPath` 首请求/replay 读取新字段/收口与幂等查询 |
| `workflow-state.test.ts` | 10 | A1→A10 合法推进、A10 未完成发 A11 ⇒ corrupt、A12a/A12b/A12/rework 顺序、幂等键去重/坏事件/身份不一致、stop 骨架、任务补充、B 路径骨架、stage.blocked |
| `workflow-mode.test.ts` | 6 | per-flow（legacy 在飞 + 新 flow 并存/closed 释放/trunk）、legacy 强制/默认 fixed/配置损坏 fail-closed、project.json 原子写回（保留键/幂等/legacy 不覆盖/坏文件）、.gitignore 块（创建/幂等/保留用户内容/畸形） |
| `workflow-ledger.test.ts` | 5 | append/read、幂等 replay、坏行计数/未知字段、轮转段旧→新、三账本分文件/跨 schema 坏行、不写旧账本、非法事件拒绝 |
| `basis-guard.test.ts` | 6 | 最新版本发现/缺失、record 哈希与 bytes、预算（32/4 MiB/8 MiB + 注入阈值）、drift（变更/删除）、basis.recorded 构造/校验/确定性 basisId、path-b 只读标记 |

## 2. 候选身份、文件清单与 raw SHA-256

| 文件 | 行数 | 字节 | raw SHA-256 | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/task-state.ts` | 1,404 | 80,937 | `029a9a89a7ef75e5da149c96765cfdad53667303f8a4b08ec18fa0d6296be6f8` | +117 / −9 |
| `src/common/编排/workflow-state.ts`（新） | 364 | 16,527 | `863a3164f018087e27d8043e0928f116dc243a9a8a8407a3f354531f53be41a7` | +364 / −0 |
| `src/common/编排/workflow-service.ts`（新） | 442 | 19,379 | `0c76ea1f28066add523279747de981fd49c43648b9873ab8fb5720c8d4e6ae2f` | +442 / −0 |
| `src/common/编排/basis-guard.ts`（新） | 370 | 14,912 | `3874925bd134d757bcc63ec965192e87d9de827d1f9344ddbc1043cc84a5175e` | +370 / −0 |
| `src/pipeline/orchestration/run-role.ts`（M） | 3,670 | 239,418 | `aafb1a07f8498d03a544ec6491ba59b0f3dc1604a4d4c6052eb7ce0e5e67b9b9` | +1 / −0 |
| `test/编排/task-state-fixed.test.ts`（新） | 237 | 9,472 | `fe5f9978593f9431cd2181efa67f8f0d01601c6c8fe861ea38da9641788db9ed` | +237 / −0 |
| `test/编排/workflow-state.test.ts`（新） | 268 | 13,118 | `78eae4ff3560e6b8b47ba8a1365d587e8aa279fe40afe446f6f757306d28d9b4` | +268 / −0 |
| `test/编排/workflow-mode.test.ts`（新） | 225 | 10,282 | `dde12f1abd114bd95c0397239b9c63ad07eace3778b41520200178f435d5736b` | +225 / −0 |
| `test/编排/workflow-ledger.test.ts`（新） | 200 | 9,097 | `65890706ced87da8890f5c986ccc046b902301e0c5b3e62d9144214ca7916b12` | +200 / −0 |
| `test/编排/basis-guard.test.ts`（新） | 216 | 10,012 | `b536cffdbf3eb397aedcef5c1bffd6411629ebaccda377aee76e3b436e87f735` | +216 / −0 |

- **聚合**：本角色代码/测试 10 文件 = **2 修改（+118/−9）+ 8 新增（2,322 行）**；新增依赖 0；
  既有断言/用例删除 0（测试文件全部为新增）。
- 证据：`_evidence/candidate.sha256.txt`、`_evidence/candidate.numstat.txt`。

## 3. 写集边界（写集外 diff = 0）

并行 B0 文件在工作树中的内容**逐字节保持**（本批前后两次实测 hash 相同）：

| 并行 B0 文件 | raw SHA-256（before = after） |
| --- | --- |
| `src/model/runtime.ts` | `17c5d7a40cc8a725fddeb615845a92abcbee29df9870bb91ff146f82232ab8fc` |
| `src/model/role.ts` | `ea01d09387e26f889f15116933cb41a0b5244a3a906c5b2b1ce74b914538f195` |
| `src/provider/runtime/schema.ts` | `061fd80c791d6794b09d9976983cbdd31aeeba8b6c820898fe41f99a7a5e50fc` |
| `src/provider/runtime/tools.ts` | `d30b7f65a117d852cae9bc478dafc48c60c9202c9660c28f7c716545e2e15635` |
| `src/common/shared/config-loader.ts` | `2d6a22fd5311f67a92c1211d84177cd0e059e587583bfaf25e7de2c4cdcad425` |

- 未改 `src/common/roles/**`、`app/**`、`src/common/门禁引擎/**`、`src/common/gates/**`、
  `src/model/runtime.ts`、`src/model/role.ts`、`src/provider/runtime/**`、`src/common/shared/**`；
  未改其它角色/文档；未新增依赖。
- 并行 B0 测试文件未被本批触碰：`test/runtime-core/stable-write-card-kind.test.ts`
  `2504b507…`、`test/门禁引擎/role-module-contract.test.ts` `566eea7c…`、
  `test/项目管理/shared/config-loader.test.ts` `07e27157…`、`test/runtime-core/two-fixed-workflow-paths-b0.test.ts`
  `b82c84c1…`、`test/门禁引擎/dispatch-matrix-mode.test.ts` `0a08bcad…`（完整 hash 见
  `_evidence/parallel-hashes.txt`）。
- `git status --porcelain -- src app test` 最终清单（20 行）见 `_evidence/git-status-final.txt`；
  其中属于本批的仅上表 10 文件 + 本记录/证据目录，其余为并行 B0 基线。

## 4. 测试 / typecheck 证据

- **基线（本批开始，同一工作树含并行 B0 改动）**：`node --test --test-concurrency=1 "test/编排/**/*.test.ts"`
  ⇒ tests 1,178 / pass 1,152 / **fail 24** / skip 2（B1 §二 记载 22 fail/2 skip，实际 24——如实按实测基线，
  见 `_evidence/test-orch-before.tap` 与 `_evidence/fails-before.txt`）。
- **After**：tests 1,209（+31 新用例）/ pass 1,183 / **fail 24** / skip 2；
  **失败名集合 before→after diff = 空（完全相同）**；新增确定性失败 = 0、新 skip = 0、已知红不恶化
  （`_evidence/test-orch-after.tap`、`_evidence/fails-after.txt`、`_evidence/fails-diff.txt`）。
- **目标新测试**：5 文件 31/31 pass、0 fail、0 skip（`_evidence/new-tests.tap`）。
- **既有 task-state 套件**：20/20 pass（`_evidence/task-state-after.tap`）。
- **相邻并行 B0/卡种套件**：`two-fixed-workflow-paths-b0` / `stable-write-card-kind` /
  `dispatch-matrix-mode` / `role-module-contract` ⇒ 38/38 pass（`_evidence/adjacent-suites.tap`）；
  `test/项目管理/shared/config-loader.test.ts` ⇒ 30/30 pass（`_evidence/adjacent-shared-code.tap`）。
- **typecheck**：`npm run typecheck` ⇒ **exit 0**（实现后 + 测试补齐后两次，均 0；
  `_evidence/typecheck-early.txt`、`_evidence/typecheck-final.txt`）。B0 跨文件红
  `run-role.ts(3234,7) TS2322` 已消除。

## 5. 限制与披露（B0 范围）

- **未实现（B1/B2/B3/B4）**：fixed 谓词/矩阵（B1）、stage-request 受理/分发/session 路由（B1/B3）、
  `closeTask`/`prepareIntent`/`finalizeIntent` 完整实现（B1）、角色模块 `fixedCards`（B2）、
  `classify-shell` v5（B4）、`request_release_merge`（G-IR 后）、`basis.verified` 节流/`basis.amended`
  流程/`basis.drift` 记账、发布合并执行、A/B 阶段完成判定中的 artifact/hash/角色激活齐全条件。
- `workflow-state` 投影为**骨架**：静态转移表覆盖 v1.3 §4.4 主链与 A12a/A12b/rework/stop；B1 需补齐
  完整完成判定（文档/哈希/角色激活/分支 tip）并把 `reviewRoleId`/`basisId` 派生接入 basis/roster。
- `workflowMode` 的 trunk「未关闭」按 B0 解释（引用 run 为 closed/cancelled ⇒ 视为关闭）；B1 复核。
- 新增错误码（B0 骨架，未列入 v1.3 附录 C 的按语义命名，B1 可按冻结清单映射）：
  `invalid-task-binding`/`fixed-task-run-forbidden`/`workflow-path-not-stage-request`/
  `workflow-path-not-first`（fixed task.created 校验）；`baseline-gitignore-malformed`/
  `baseline-gitignore-write-failed`（.gitignore 骨架）；`basis-document-missing`/
  `basis-document-budget`（basis 读取；后者按本批任务明确口径命名）。
- `writeProjectConfigWorkflowSchema` 以保留键为目标，不保证保留原文件格式化；失败一律
  `project-config-write-failed` 且不覆盖既有内容。
- 未运行真实模型/Electron/真机全链；不构成 B2 判定或客户批准。并行 B0 文件的语义正确性属各自
  owner（本批只保证不改动其字节）。

## 6. 未提交声明

本批全部改动（上表 10 个代码/测试文件 + 本记录与 `_evidence/`）写入本轮工作树，
**未 `git add`/commit/push/merge/tag/发布**；未改 `角色卡/**` 之外其它角色文件；未占用 9222/9223。
