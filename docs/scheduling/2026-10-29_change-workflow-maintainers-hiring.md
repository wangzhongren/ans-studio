# 2026-10-29 — 工作流维护者化（v4.1）：六卡、机械前置、报告路由、shell 写区守卫与验收最小事实

- 日期：2026-10-29｜任务：内置角色工作流维护者化 + 招人流程强制化 + shell 写区约束（方案 v2.1，客户闸门 1/2 已过）｜风险档位：T3（治理/权限/流程变更）
- 分支/worktree：`feat/entry-role-minimal` @ `.claude/worktrees/entry-role-minimal`｜实施基线：`a27644d`（含人事 chain-enforcement 边界 Delta-2）
- 依据：`docs/planning/2026-10-29_design-workflow-maintainers-hiring.md`（v2.1，772 行 / `fd20099a…`）；复核记录 `docs/planning/2026-10-29_review-workflow-maintainers-hiring.md`（246 行 / `dd6d2a4e…`，结论通过）；拓扑 v4.1 与真机测试日志 `docs/communication/2026-10-29_*.md`；客户确认 Q1–Q11 按推荐项（Q4 D3 带 decisionId、Q6 验收 judge 最小链事实）；**Q1/Q2 已由客户 2026-10-29 修正**：不强制客户审批，改为判断 agent 审查脚本内容（开关关闭仍弹客户卡；不可用/超时/解析失败 fail-closed），Q2 测试/安装普通审批+审计。
- 性质：实施与验证记录（**不是验收结论**）；本地提交，不 push、不合并 main。

## 1. 实施范围（严格按方案 §8 写集）

### 1.1 门禁引擎

- `src/common/门禁引擎/governance-roles.ts`：六张内置卡按拓扑 v4.1 重写——幕僚五步链（产品意图 → 策划方案+名单+架构 → 人事按名单招人 → 交付运营）与「一次一步/不跳步」；产品意图文档；策划 `project-roster/v1` 名单（schema/version/roles/directories）；人事 D3（`cardKind=appointment` 多选、decisionId、写卡目录 ⊆ 名单）；运营接交付/派实现/收报/发起验收；质检回报**发起方**。convener 能力位 `dispatchTask: true`（已批准权限 delta；目标矩阵由桌面 M6/M7 执行）。worker 卡模板要点（实现任务只来自运营、只写名单目录、验收归质检）并入人事卡。
- `src/common/门禁引擎/classify-shell.ts`：新增 `isOpaqueShellExecution(argv)`——解释器执行脚本文件 / `-m` 模块 / `npm run`、`npx`、`corepack` / 构建任务工具 ⇒ opaque；**Q2 A**：`node --test`、`npm test`/`install`/`ci` 等按普通审批（开关可代批）+ 审计；`node -e`/`sh -c` 等 hardDeny 不变（G3）。
- `src/common/门禁引擎/shell-write-guard.ts`（新增）：确定性写目标判定 + 注入 `checkWrite`（同一 `resolveWrite`，realpath/F4/scope 口径一致）。显式写目标（cp/mv/tee/touch/mkdir/rm/sed -i/chmod/ln/dd 等）逐目标判定：越界/`..`/绝对越界/禁写前缀 ⇒ deny；全部在边界内 ⇒ pass（继续既有审批链）；不透明执行 ⇒ opaque。cwd 异常时以项目根为基准（防按外部目录解释后放行）。

### 1.2 编排

- `src/common/编排/workflow-preconditions.ts`（新增）：`project-roster/v1` 名单解析/校验（schema/flowId/version/角色 id/内置 id 拒绝/目录合法与不重叠/治理路径拒绝）、最新名单发现与 `version + sha256`、D3 卡形状校验与推荐集生成、派发矩阵 M1–M8、报告路由 M9。
- `src/common/编排/task-state.ts`：`task.created.from` / `task.closed.by` 放宽为 `chief | convener`；新增 `flowId`/`stepId` 与 `request.resolved.rosterVersion/rosterSha256` 校验（slug / 正整数 / 64 位 hex）；旧记录（无新字段）逐字可读（F9 兼容）。
- `src/common/编排/governance-judge-facts.ts` / `governance-judge-verdict.ts` / `governance-judge-prompt.ts`：验收 judge **最小链事实**（Q6 A）——产品意图 + 提案 + 名单（version/hash）+ D3 裁决 + 质检报告；撤除旧 flow 的 proposalDecision/criteria/change-package 门槛；appointment 推荐集按名单校验。
- `src/common/编排/shell-gate.ts` / `src/pipeline/orchestration/shell-arming.ts`：注入 `writeGuard`、`snapshotBefore` 与 `approvalContextLoader`。显式写目标越界 deny 直接拒绝（0 卡、0 judge）；script 先加载**脚本审查上下文**（不可用 ⇒ fail-closed 拒绝），再交既有审批链（开关开 → judge；开关关 → 客户卡）；只读档 script 拒绝；非 advisory 项目链的 c=deny 硬地板保持；最终 allow 后、spawn 前拍快照。新增 `shell-approval-context.ts`：`node/python/bash <script>`、`node -e`、`npm run <script>` 读取有界内容；`package.json#scripts`、内联代码、非脚本 opaque 说明；judge 提示词（`shell-judge-prompt.ts`）展示脚本路径/内容并要求核对写区/破坏性/越权。
- `src/common/编排/shell-post-audit.ts`（新增）：执行前轻量快照（路径+mtime+size）→ 执行后 diff → 越界新增/修改/删除写 `docs/audit/shell-gate.jsonl` 并返回越界清单（不自动回滚；审计写失败只诊断）。**返工（P6/R2）**：`.ans/` 不再排除（应用独占治理记录区的项目内变化按越界审计）；执行后审计**只做项目内可见性**，不宣称兜底项目外写入——项目外越界由 static guard（脚本路径/显式目标）与 judge 审查拦截。
- `src/pipeline/orchestration/run-role.ts`：招人卡只由人事发起（选项=最新名单角色、多选、推荐集由应用生成）；`TRIO_CARD_KINDS.convener` 移除 `appointment`、nominator 增 `appointment`；appointment-write boundary 条目 ⊆ 名单授权目录（可读名单时强制）；shell 装配构造 `checkWrite` 闭包（boundary/scope/skillRoot/forbidden），并挂 `shellPostAudit` 能力。

### 1.3 桌面窗口

- `app/desktop/session.ts`：运营获得 `dispatch_task` 注入；`routeStarDispatch` 在 `newTaskId/task.created` **之前**执行 M1–M8（拒绝不产生任务行、不开目标会话；F10）；`task.created.from` 写实际创建者、交付任务固定 `stepId=project-handoff`、`flowId` 落盘；报告按 `task.created.from` 路由（项目 worker/质检 → 发起者；内置 worker → 幕僚；无任务绑定 → 幕僚，兼容旧记录）；D3 裁决回填 `decisionId` 并记录最新名单 `rosterVersion/rosterSha256`；appointment-write 校验 D3 名单版本/hash = 当前最新名单（旧 D3 作废，M11）；验收卡由应用补充最小链事实（意图/名单/D3/质检报告；缺失 ⇒ judge 回落手动）。
- `app/desktop/operator-channel.ts`：把 `prompt.approvalContext` 原样交给判断请求（judge 看到脚本路径/内容）；客户卡展示脚本路径与有界内容；`manualOnly` 字段保留兼容但守卫不再设置（客户口径修正：不强制客户本人）。
- `src/model/runtime.ts`（共享 Model）：`TaskCreatedEvent.from`/`stepId`、`TaskClosedEvent.by`、`RequestResolvedEvent.rosterVersion/rosterSha256`、`CustomerInputMetadata` 名单字段、`CustomerInputOutcome.decisionId`、`ShellReviewRequest`/`OperatorPrompt.manualOnly`、`ShellExecutionOutcome`/`ShellPostAuditFn`/`GovernedToolsOptions.shellPostAudit`、`GovernanceJudgeFacts` 验收最小链字段。
- `src/provider/runtime/tools.ts`：`request_choice` 回执携带应用生成的 `decisionId`（D3 写卡凭据）；`run_shell` 执行后调用写审计钩子，越界写入如实附在工具结果（不静默）；`schema.ts` dispatch_task 文案更新为 v4.1 派发矩阵。

### 1.4 写集核对（F2 返工）

上列实现中另有 8 个路径未在方案 §8 逐条点名，均落在各自角色 Section 1 / 目录授权内、无写区扩张：
`app/desktop/operator-channel.ts`（桌面窗口：judge 审查脚本内容/客户卡展示）、`src/provider/runtime/schema.ts`（运行时核心：dispatch_task 文案）、`test/runtime-core/customer-input-context.test.ts`（运行时核心测试区）、`test/桌面应用/operator-channel.test.ts`、`test/桌面应用/star-routing.test.ts`（桌面窗口精确测试文件）、`test/编排/acceptance-judge-minimal.test.ts`、`test/编排/appointment-roster.test.ts`、`test/编排/shell-approval-context.test.ts`、`src/common/编排/shell-approval-context.ts`、`src/common/编排/shell-judge-prompt.ts`（编排）、以及本变更记录 `docs/scheduling/2026-10-29_change-workflow-maintainers-hiring.md`（调度记录）。`test/桌面应用/chain-enforcement.test.ts` 的精确边界条目由人事 `a27644d` 预置。

## 2. 测试（新增/更新）

| 文件 | 动作 | tests | 覆盖 |
| --- | --- | ---: | --- |
| `test/门禁引擎/shell-write-guard.test.ts` | 新增（返工后 9） | 9 | 显式写目标边界/越界/禁写/逃逸、opaque 与 Q2 例外、cwd 防御、TaskScope 经 checkWrite 收窄；**P6 十种绕过形态全部 opaque**、plain 形态不误伤 |
| `test/编排/workflow-preconditions.test.ts` | 新增 | 7 | 名单解析正/负例、最新名单 version/hash、D3 卡形状/推荐集、M1–M8 矩阵、M9 路由 |
| `test/编排/shell-post-audit.test.ts` | 新增（返工后 5） | 5 | 快照 diff、越界判定、审计记录、真实文件系统排除项；**`.ans/` 与项目根之外（extraRoots/`..`/绝对路径）越界检测** |
| `test/编排/appointment-roster.test.ts` | 新增 | 4 | 人事发卡/推荐集、选项≠名单拒绝、convener 发卡拒绝、boundary 目录 ⊆ 名单目录 |
| `test/编排/acceptance-judge-minimal.test.ts` | 新增 | 3 | 验收最小链事实通过/缺项 manual/物证缺失 |
| `test/编排/shell-operator-only.test.ts` | 更新（+2，返工 +1） | 15 | opaque → 审批（含脚本上下文，不强制客户本人）、上下文不可用 fail-closed、写目标 deny 直拒；**P6 真实守卫 × 审批档集成（越界 deny / 不可解析交判断）** |
| `test/编排/shell-approval-context.test.ts` | 新增（R2 后 8） | 8 | 脚本/内联/npm run/test/install/构建配置内容与 sha256；深度 ≤2 引用展开；64KB/2000 行/3 文件/128KB bounds fail-closed；注入防护与 judge 提示词 |
| `test/编排/task-state.test.ts` | 更新（+2） | 9 | from/closed 放宽、stepId/flowId、roster 字段校验、旧记录兼容 |
| `test/编排/trio-worker-report.test.ts` | 更新（+1） | 4 | v4.1 卡文本（五步链/名单/D3/验收发起方）、convener dispatch 能力 |
| `test/桌面应用/chain-enforcement.test.ts` | 新增（返工后 6） | 6 | 跳步拒绝（M1/M2/M8）且拒绝在 task.created 之前、交付/运营作用域（M5–M7）、报告路由（M9，含**质检回报发起方**）、M11 名单版本（含 flowId-only） |
| `test/桌面应用/operator-channel.test.ts` | 更新（+2） | — | judge 收到脚本内容并据其裁决（deny/allow）；开关关 → 客户卡展示内容；manualOnly 兼容能力 |
| `test/runtime-core/customer-input-context.test.ts` | 更新（+1） | 3 | request_choice 回执 decisionId |
| 既有更新 | — | — | `chief-workflow`（convener dispatch v4.1）、`star-routing`（M8/M5/M6）、`entry-role-minimal-d`、`i-full-chain` |

定向：门禁引擎 261 计（260 过 / 1 skip）、编排 503 计（502 过 / 1 红＝既有 Windows symlink EPERM）、桌面应用 340/340、runtime-core 257 计（250 过 / 3 红 / 4 skip，红均既有 symlink）、测试 544 计（534 过 / 4 红 / 6 skip，红均基线）、项目管理 154 计（149 过 / 5 skip）、装配 85/85。

## 3. 验证（串行）

- 全量：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（340 文件）→ **见执行终值**（基线 2919/2889/12/18；日志 `%TEMP%\ans-full-hiring-final.log`）。
- `npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0。
- phase5a 真实 Electron：**34/34 checks、failures=0、console/CSP 0**（report `%TEMP%\ans-phase5a-hiring\report.json`，sha256 `05849042…`）。
- 桌面 E2E（临时夹具 `%TEMP%\ans-e2e-g-fixture-1029`；fresh userData）：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；报告见 `%TEMP%ns-e2e-hiring2-out
eport.txt`（返工后重跑）；`session:role-states` 未注册错误 0。

## 4. 应用冒烟（重启后）

- 11:14–11:15（本地）：停止旧进程 → `npm run app -- --remote-debugging-port=9235`（worktree 新代码）后台启动；CDP 在线、渲染器加载（标题「ANS 治理会话工作台」）。
- 两开关按持久值恢复为**开**（`preferences.json` 此前的 `judgeSwitches:{approval:true,decision:true}`）。
- 经渲染器真实入口 `loadProject('C:/Users/51054/Desktop/work/trial-focus-timer')` **只读**导入：六角色枚举（chief/product/rapporteur/nominator/convener/verifier）、`primaryRoleId=chief`、`governanceModel=trio`；未打开会话、未向 trial 项目写入。
- 截图 `%TEMP%ns-regress-1029 8-hiring-smoke.png`；启动日志 `%TEMP%ns-regress-1029pp-hiring-smoke.log` 无 error/failed/exception。应用保持运行（CDP 9235）。**真机回归约定**：一律使用 Pi 运行时（项目已配置 `ANS_PI_*`/`ANTHROPIC_AUTH_TOKEN`）；UI 默认 Claude 运行时需要 `ANTHROPIC_API_KEY`，本批不配置、不使用 Claude 做真机回归。

**返工后冒烟（R3/F4）**：停止旧进程 → 新代码后台启动（CDP 9235）→ 两开关持久值仍为开 → `loadProject('trial-focus-timer')` 只读导入并 `selectRuntime('pi')`（六角色/primary=chief/trio）→ 截图 `%TEMP%ns-regress-1029 9-hiring-rework-smoke.png`；启动日志 `%TEMP%ns-regress-1029pp-hiring-rework.log` 无 error/failed/exception（未出现 Claude/ANTHROPIC_API_KEY 缺失）。**trial 项目 SHA-256 前后清单**：`trial-manifest-pre.txt` 与 `trial-manifest-post.txt` 均 28 文件、sha256 同为 `5af6cd98…`，`diff` 为空（TRIAL_UNCHANGED）——冒烟未改 trial 任何文件。

## 4.1 回滚前置（F3 返工）

**结论（书面限制）**：**不支持把本批回滚到旧代码后直接读取新记录**——旧 `task-state` 校验会拒绝 `task.created.from="convener"` / `task.closed.by="convener"`。回滚前必须二选一：
1. **保留本批放宽后的读取器**（最小兼容补丁：`task-state.ts` 的 from/closed.by 校验接受 chief|convener，并忽略 `stepId/rosterVersion/rosterSha256`）；或
2. **执行文档化迁移**（在回滚前对 `.ans/state/tasks.jsonl` 逐行处理）：
   ```js
   // node 迁移脚本（示意；先备份 tasks.jsonl）
   const fs = require("node:fs");
   const file = ".ans/state/tasks.jsonl";
   const out = fs.readFileSync(file, "utf8").split(/
?
/).filter(Boolean).map((line) => {
     const e = JSON.parse(line);
     if (e.kind === "task.created" && e.from === "convener") { e.legacyFrom = "convener"; e.from = "chief"; }
     if (e.kind === "task.closed" && e.by === "convener") { e.legacyBy = "convener"; e.by = "chief"; }
     // 旧读取器忽略未知字段；若目标旧版本严格拒绝未知字段，再删除 stepId/rosterVersion/rosterSha256 并留档。
     return JSON.stringify(e);
   });
   fs.writeFileSync(file, out.join("
") + "
");
   ```
本批新读取器保持对旧记录的兼容（`from:"chief"`、`closed.by:"chief"`、无新字段），并有混合新旧记录测试。

## 5. 决策点与遗留

1. **Q6 A 已按客户确认实施**：验收 judge 最小链事实（facts + verdict + prompt + 桌面 enrich）；未改客户最终验收权。
2. **Q2 A（高风险，客户已明确接受）**：`node --test`/`npm test/install/ci` 保持普通审批 + 执行后审计；任意 `npm run <脚本>` opaque。
3. **M4 目录校验**：最新名单可读时强制 boundary 目录 ⊆ 名单授权目录；名单不可读时由 M11 的 D3 名单版本校验兜底（新链 D3 必带 version/hash）。旧 flow/无名单记录保持既有行为（回滚兼容）。
4. **执行后审计的可见性**：越界写入使工具结果 `ok:false` 并附越界清单；不自动回滚、不跨层强制关闭任务（任务收口仍由幕僚/运营判断）。按方案 §6.5 默认口径。
5. **基线 12 红**（9 Windows symlink EPERM + T1×3）为环境性既有问题，与本批无关。
6. 设计文件 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 随本批首次进入分支（此前仅存在于工作树）。
