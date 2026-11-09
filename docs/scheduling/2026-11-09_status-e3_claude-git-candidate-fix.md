# E3-R 放行记录：Claude 适配器 `git_candidate` MCP schema 窄修复（B2 v1 pass，2026-11-09）

- **任务 ID**：`2026-11-09-claude-git-candidate-call-context-fix`
- **记录角色**：ANS 统筹调度（Scheduler）；**T1 窄修复**
- **日期**：2026-11-09
- **性质**：E3-R 放行记录——只表示**当前修复候选满足 B1 v1（独立验收 B2 v1 判 pass）**，不替代验收、不改变客户主权；按「全权委托」放行**提交/推送/PR/合并**；**发布/tag 除外未授权**。
- **判定依据（实测）**：
  - B1 v1（冻结、唯一判据）：`docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`（109 行 / 17,638 bytes / `a1baa41e94bef0fc62985d7451d86d85170a2482d0fd1c82be27a3f5ed486412`）。
  - **B2 v1（pass）**：`docs/acceptance/2026-11-09_claude-git-candidate-fix-report-v1.md`（107 行 / SHA-256 `1bae184b00e546afadb45c0a274b618df9dfdea541d1466e5f1420fe26505301`；**19 pass / 0 fail / 0 insufficient / 0 N/A**；AC-8 按「MCP 成功到达应用处理器、首个决定性结果即停、如实下一门」判 pass；无返工/无安全旁路）。
  - E1 变更包：`docs/scheduling/2026-11-09_change-package_claude-git-candidate-fix.md`（84 行 / 13,469 bytes / `65bfd12d13c80a1ec334167ce7b22f7746b57d6c5bbc1f28f8b0f34200a240e8`）。
  - 修复记录（F7，先于代码、未改写）：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`（124 行 / 17,881 bytes / `57451f902faaa829176b7e7262779875c1bfad48115ffe5bb14f66391695e510`）。
  - 路由/定性：`docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`（88 行 / `18648fee…`）。
  - **候选**：2 文件（均为修改）；`session.ts` `a3e3d427…`（+35/−5）、`session.test.ts` `6379bc8e…`（+265/−2）；canonical 聚合 `5427e1774105bc83a74383c1e49cb2e8c1f9d15cecd7406bb6659954e21a258a`；工作树 manifest 1,105 文件 / `2d0ab31b66481a22869e6d18d1fbbf96099335f9e601c6e37aecf83552268e99`；HEAD 树指纹 `b433282d…`。
  - 基线：HEAD `acc5512a3c9004312973538c3073ae2ec5b1ed6d`（tree `18ad571984705d8ab6297781b5782719bed92a89`）；分支 `feat/plan-escalation-card`；暂存 0；第二变更已合并（PR #74，merge `2e870248…`）。

## 一、放行结论

- **B2 v1 判 pass**（19/0/0/0）；当前候选（2 文件 / `5427e177…`）满足 B1 v1；公共契约零变化（`git diff --quiet HEAD` 对 `runtime/schema.ts`/`tools.ts`/`common/claude-adapter/` = 0）。
- **放行范围**：提交 / 推送 / PR / 合并（本窄修复范围内）。
- **不在放行范围**：发布 / tag（客户另行指示）；下一门修复（`git-worker-task-unproven` 任务绑定/夹具派发路径）属后续另案/夹具准备，不混入本候选。

## 二、限制与披露（非阻塞）

1. **下一门 `git-worker-task-unproven`**：真实运行中 `git_candidate commit` 已通过 MCP 校验并到达应用处理器；应用回执 blocked（`src/service/trunk/impl/git-capabilities.ts:263-268` 要求恰一条 `task.created {from:"convener", to:<worker>, runId, flowId, moduleId}`；RR fixture 经 chief hub 派发、`from:"chief"`、无 `moduleId`）。**属夹具派发路径，不属本 T1 适配器修复**；B2 按 AC-8 判 pass 并披露；sidecar/journal/candidate ref 未产出（不伪造/不宣称完整 Git 写成功）。
2. **停止账本缺口**：git_candidate 回执后立即 halt，`tasks.jsonl` 缺 `task.delivered`/`task.reported`（`delivery.claim.start/start/claim.end` 已记录）；如实披露。
3. **BASE-5 稳定性**：真实运行前后 HEAD/tree/分支/暂存/status/两文件哈希/manifest 同值；候选/manifest 聚合独立复算一致。
4. **runtime-core 7 例环境事实**：linked worktree `.git`-file 布局导致 `runtime-protection-scope-unknown`；`git archive HEAD` 纯净副本 45/45 全绿；与本修复无因果。
5. **既有事实（非本修复引入）**：union 型注册的 `tools/list` 输出 `{type:"object",properties:{}}`，校验在服务端 Zod；修复前后一致。助手 `claudeToolInputWithCallContext` 为命名导出仅供本角色单测（无其它消费者）。
6. **范围**：只改 Claude适配器 `session.ts` + `test/claude-adapter/session.test.ts`；Pi/Codex 未改动、未跑真实模型；真实运行只要求真实 Claude。
7. **发布/tag 未授权**。

## 三、提交分组计划（供沟通执行；提交前以 `git status` 复核）

### A. 候选 2 文件（唯一候选）
- `src/provider/claude/session.ts`（`a3e3d4276f9fa9713d47d4b6b4a0ac06008fd0ffc87bbeec25d2ae2ddca8c26b`）
- `test/claude-adapter/session.test.ts`（`6379bc8ef7a26a700b1dcd937bba7429dec3704fa11027f44c119fd5b8469e67`）
- 聚合 `5427e177…`（算法：逐文件工作树 raw sha256、`<hash>  <path>` 两空格、`LC_ALL=C` 排序、`\n` 连接后 SHA-256）。

### B. 记录（提交）
- 修复记录：`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context.md`（**证据目录 `2026-11-09_fix_claude-git-candidate-call-context-evidence/` 排除**——原始日志/real-run 证据留在工作树，可由索引哈希复取）。
- 管理文档：
  - `docs/scheduling/2026-11-09_fix-routing_claude-git-candidate-call-context.md`
  - `docs/scheduling/2026-11-09_dispatch-log_claude-git-candidate-fix.md`
  - `docs/scheduling/2026-11-09_change-package_claude-git-candidate-fix.md`
  - `docs/scheduling/2026-11-09_status-e3_claude-git-candidate-fix.md`（本放行记录）
  - `docs/acceptance/2026-11-09_claude-git-candidate-fix-criteria-v1.md`
  - `docs/acceptance/2026-11-09_claude-git-candidate-fix-report-v1.md`
  - `docs/communication/memo.md`（本窄修复沟通备忘，按指示纳入）

### 排除项与理由
- **证据目录**（本修复 `docs/fix/…-evidence/`）：体积大、原始复算件，保留工作树不提交（索引哈希已在 E1 记录）。
- **第二变更文档/记录**：已随 PR #74 合并（`acc5512` 等），不重复。
- **其它历史未跟踪文档/角色证据**（`governance-authority-matrix*`、`trunk-amendment-model*`、`2026-11-04/05/07_*`、各适配器/角色历史 evidence 等）：非本修复。
- **临时文件**（`.tmp-*`、`.pr-body-*`、`.commit-msg-*`、截图等）：草稿，不提交。
- 公共契约/其它角色/共享/`app/`/`docs/planning` 等：本修复无改动。

## 四、最终真实验证准备（合并后，待协调方放行；本记录先只读准备）

**目标**：一次经运营（convener）派发的最小真实运行，验证 `git_candidate commit` 经 MCP 校验成功、应用回执成功，并产出 sidecar `authorization.jsonl` + `git.json` + candidate ref；预算 1 客户消息 / ≤2 Git 调用 / 10–15 分钟；首个决定性结果即停，如实下一门。

**可行性（只读核对结论）**：
- **任务拓扑可构造（已被 W7 夹具证明）**：`prepareRoleDispatch({fromRoleId:"convener", targetRoleId:"impl", flowId, runId, moduleId})` + `recordTaskObservation(task.created {from:"convener", to:"impl", runId, flowId, moduleId, moduleDirectory, modulePaths, runState:"pinned"})` 是生产路径（`apply-journal.ts` 的 convener worker 派发同源）；W7 `test/测试/git-write-chain-fixture.ts` 已在真实 service/store/初始化/trunk/pin 上构造该任务（`src/impl/`、`impl-core`）。
- **任务投递路径可用**：桌面 `SessionManager.restoreTasks(projectRoot)` 在项目导入/启动时对**未关闭、未投递、无报告**的 `task.created` 自动按真实 `planDispatchDelivery` + 队列 drain 打开目标角色会话并投递（`sourceRoleId` 仅展示为 chief；**任务账本仍为 `from:"convener"`**，`git-worker-task-unproven` 校验以账本为准）。UI 客户输入为 **chief-only**（`sendSession` 拒绝非 chief 目标）；`openSession` 明确不携带 host task binding（任务绑定只能来自真实派发/恢复）。
- **结论：可行（推荐方案）**——预置夹具（仓库外、真实 product API）+ 导入恢复投递到真实 Claude worker 会话 + 真实 MCP → 应用 → sidecar/journal/ref。live convener 模型派发（chief→convener→worker）也可行但会超出 `dispatch_task ≤1` 预算（2 次派发/多层回合），列为备选并需预算调整。

**推荐计划（合并后执行；本轮未执行）**：
1. **预置（仓库外临时根，复用/裁剪 W7 fixture；不改仓库）**：治理记录 + 真实 init/trunk v1/v2 + 角色文档/模块（`impl-core` → `src/`，worker `impl` 写集 `src/impl/`）+ roster/topology + initial workflow + `freezeExecutionRun` pin（`execRunId`，`codeBasis.ref=refs/ans/trunk` + OID）；用 `prepareRoleDispatch`/`recordTaskObservation` 写入**一条未投递的开放 worker 任务**：`from:"convener"、to:"impl"、flowId、runId=execRunId、moduleId:"impl-core"、moduleDirectory:"src/impl/"、modulePaths:["src/impl/"]、runState:"pinned"`，text 要求「创建 `src/impl/<file>` 并用 `git_candidate commit`（base `refs/ans/trunk` + pinned OID）提交」；不写 `task.delivered`/`reported`/`closed`。目标项目建立 `required` 保护事实（init-source/治理接受）并完成审计预检（`.ans/trunk/operations/` 可写）。
2. **真实运行**：真实 Electron（隔离 userData，本 worktree `app/main.ts`，CDP）+ 真实 Claude + 真实 UI；导入目标项目 → `restoreTasks` 自动投递该 convener 任务到 `impl` 会话（真实任务绑定；必要时发送 **1 条** chief 消息满足观测/预算，内容不要求驱动 worker）；worker（真实 Claude）调用 `git_candidate commit`；观察 MCP 成功 → 应用回执（`prepared` 或如实下一门）→ sidecar/journal/candidate ref。
3. **预算/停止**：1 消息；worker 1–2 回合；Git 调用 ≤2；卡 ≤2；10–15 分钟；首个决定性结果即停；不自动重试/不追加预算。
4. **证据**：`task.created` 账本（convener/moduleId/flowId/runId，无 closed）、`session.open.ready`/投递诊断、工具入参/回执原文、`authorization.jsonl`/`git.json`/candidate ref、候选/manifest 前后 diff 0、预算/中止记录；若下一门（如 `git-run-code-basis-unavailable`/`git-worker-scope-unavailable`），如实报告并保留原件。
5. **风险/预检项（运行前只读核对）**：恢复投递的运行时解析（`findLiveRuntime`/默认；必要时先把项目 runtime 设为 claude）；`planDispatchDelivery` 对任务文本/引用的保守拦截；worker 写集与模块路径一致；base OID = pin `codeBasis`；账本 `from:"convener"` 与 `moduleId` 校验；目标项目保护事实；UI 导入后自动 `restoreTasks` 的时序（`interface.ts:2456`）。若恢复投递不足以驱动 worker，回退备选：1 条 chief 消息要求继续该开放任务（可能触发 1 次真实 chief 派发，仍在 dispatch ≤1），或申请预算调整走 chief→convener→worker（2 派发）。

**本轮状态**：仅完成只读可行性核对与计划；未执行真实运行、未写夹具/仓库文件；待协调方放行后按上述执行并回报结果。

## 五、非阻塞后续项

1. **worker Git 写任务绑定的真实 commit 证据**：本修复已达 MCP 成功；完整 sidecar/journal/ref 需上述运营派发 real run（或后续夹具对齐）产出；未产出前不宣称完整 Git 写成功。
2. **发布/tag**：仍未授权。
3. **第二变更后续**（已披露）：Claude MCP schema 缺陷由本窄修复关闭；其余覆盖边界/环境性项不变。

## 六、状态更新记录

- 2026-11-09：B2 v1 判 **pass**（`1bae184b…`；19/0/0/0）；本放行记录写盘；放行提交/推送/PR/合并（发布/tag 除外）；提交分组 A（2 文件）/B（记录）如上；最终真实验证计划已备（待放行）。
