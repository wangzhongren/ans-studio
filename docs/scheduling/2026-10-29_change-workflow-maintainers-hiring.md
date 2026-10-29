# 2026-10-29 — 工作流维护者化（v4.1）：六卡、机械前置、报告路由、shell 写区守卫与验收最小事实

- 日期：2026-10-29｜任务：内置角色工作流维护者化 + 招人流程强制化 + shell 写区约束（方案 v2.1，客户闸门 1/2 已过）｜风险档位：T3（治理/权限/流程变更）
- 分支/worktree：`feat/entry-role-minimal` @ `.claude/worktrees/entry-role-minimal`｜实施基线：`a27644d`（含人事 chain-enforcement 边界 Delta-2）
- 依据：`docs/planning/2026-10-29_design-workflow-maintainers-hiring.md`（v2.1，772 行 / `fd20099a…`）；复核记录 `docs/planning/2026-10-29_review-workflow-maintainers-hiring.md`（246 行 / `dd6d2a4e…`，结论通过）；拓扑 v4.1 与真机测试日志 `docs/communication/2026-10-29_*.md`；客户确认 Q1–Q11 按推荐项（含 Q1 opaque 强制客户本人、Q2 测试/安装普通审批+审计、Q4 D3 带 decisionId、Q6 验收 judge 最小链事实）。
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
- `src/common/编排/shell-gate.ts` / `src/pipeline/orchestration/shell-arming.ts`：注入 `writeGuard` 与 `snapshotBefore`。显式写目标 deny 直接拒绝（0 卡）；opaque 交 (a) 且 `manualOnly`（判断 agent 不代批）；只读档 opaque 拒绝；非 advisory 项目链的 c=deny 硬地板保持；最终 allow 后、spawn 前拍快照。
- `src/common/编排/shell-post-audit.ts`（新增）：执行前轻量快照（路径+mtime+size，排除 `.ans/.git/node_modules/dist/build/...`）→ 执行后 diff → 越界新增/修改/删除写 `docs/audit/shell-gate.jsonl` 并返回越界清单（不自动回滚；审计写失败只诊断）。
- `src/pipeline/orchestration/run-role.ts`：招人卡只由人事发起（选项=最新名单角色、多选、推荐集由应用生成）；`TRIO_CARD_KINDS.convener` 移除 `appointment`、nominator 增 `appointment`；appointment-write boundary 条目 ⊆ 名单授权目录（可读名单时强制）；shell 装配构造 `checkWrite` 闭包（boundary/scope/skillRoot/forbidden），并挂 `shellPostAudit` 能力。

### 1.3 桌面窗口

- `app/desktop/session.ts`：运营获得 `dispatch_task` 注入；`routeStarDispatch` 在 `newTaskId/task.created` **之前**执行 M1–M8（拒绝不产生任务行、不开目标会话；F10）；`task.created.from` 写实际创建者、交付任务固定 `stepId=project-handoff`、`flowId` 落盘；报告按 `task.created.from` 路由（项目 worker/质检 → 发起者；内置 worker → 幕僚；无任务绑定 → 幕僚，兼容旧记录）；D3 裁决回填 `decisionId` 并记录最新名单 `rosterVersion/rosterSha256`；appointment-write 校验 D3 名单版本/hash = 当前最新名单（旧 D3 作废，M11）；验收卡由应用补充最小链事实（意图/名单/D3/质检报告；缺失 ⇒ judge 回落手动）。
- `app/desktop/operator-channel.ts`：`prompt.manualOnly === true` 时跳过判断 agent，强制客户本人确认（Q1 A 的窄例外）。
- `src/model/runtime.ts`（共享 Model）：`TaskCreatedEvent.from`/`stepId`、`TaskClosedEvent.by`、`RequestResolvedEvent.rosterVersion/rosterSha256`、`CustomerInputMetadata` 名单字段、`CustomerInputOutcome.decisionId`、`ShellReviewRequest`/`OperatorPrompt.manualOnly`、`ShellExecutionOutcome`/`ShellPostAuditFn`/`GovernedToolsOptions.shellPostAudit`、`GovernanceJudgeFacts` 验收最小链字段。
- `src/provider/runtime/tools.ts`：`request_choice` 回执携带应用生成的 `decisionId`（D3 写卡凭据）；`run_shell` 执行后调用写审计钩子，越界写入如实附在工具结果（不静默）；`schema.ts` dispatch_task 文案更新为 v4.1 派发矩阵。

## 2. 测试（新增/更新）

| 文件 | 动作 | tests | 覆盖 |
| --- | --- | ---: | --- |
| `test/门禁引擎/shell-write-guard.test.ts` | 新增 | 7 | 显式写目标边界/越界/禁写/逃逸、opaque 与 Q2 例外、cwd 防御、TaskScope 经 checkWrite 收窄 |
| `test/编排/workflow-preconditions.test.ts` | 新增 | 7 | 名单解析正/负例、最新名单 version/hash、D3 卡形状/推荐集、M1–M8 矩阵、M9 路由 |
| `test/编排/shell-post-audit.test.ts` | 新增 | 4 | 快照 diff、越界判定、审计记录、真实文件系统排除项 |
| `test/编排/appointment-roster.test.ts` | 新增 | 4 | 人事发卡/推荐集、选项≠名单拒绝、convener 发卡拒绝、boundary 目录 ⊆ 名单目录 |
| `test/编排/acceptance-judge-minimal.test.ts` | 新增 | 3 | 验收最小链事实通过/缺项 manual/物证缺失 |
| `test/编排/shell-operator-only.test.ts` | 更新（+2） | 13 | opaque → manualOnly、写目标 deny 直拒（0 卡、审计分支） |
| `test/编排/task-state.test.ts` | 更新（+2） | 9 | from/closed 放宽、stepId/flowId、roster 字段校验、旧记录兼容 |
| `test/编排/trio-worker-report.test.ts` | 更新（+1） | 4 | v4.1 卡文本（五步链/名单/D3/验收发起方）、convener dispatch 能力 |
| `test/桌面应用/chain-enforcement.test.ts` | 新增 | 4 | 跳步拒绝（M1/M2/M8）且拒绝在 task.created 之前、交付/运营作用域（M5–M7）、报告路由（M9）、M11 名单版本 |
| `test/桌面应用/operator-channel.test.ts` | 更新（+1） | — | manualOnly 跳过 judge、强制客户 |
| `test/runtime-core/customer-input-context.test.ts` | 更新（+1） | 3 | request_choice 回执 decisionId |
| 既有更新 | — | — | `chief-workflow`（convener dispatch v4.1）、`star-routing`（M8/M5/M6）、`entry-role-minimal-d`、`i-full-chain` |

定向：门禁引擎 261 计（260 过 / 1 skip）、编排 503 计（502 过 / 1 红＝既有 Windows symlink EPERM）、桌面应用 340/340、runtime-core 257 计（250 过 / 3 红 / 4 skip，红均既有 symlink）、测试 544 计（534 过 / 4 红 / 6 skip，红均基线）、项目管理 154 计（149 过 / 5 skip）、装配 85/85。

## 3. 验证（串行）

- 全量：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（340 文件）→ **见执行终值**（基线 2919/2889/12/18；日志 `%TEMP%\ans-full-hiring-final.log`）。
- `npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0。
- phase5a 真实 Electron：**34/34 checks、failures=0、console/CSP 0**（report `%TEMP%\ans-phase5a-hiring\report.json`，sha256 `05849042…`）。
- 桌面 E2E（临时夹具 `%TEMP%\ans-e2e-g-fixture-1029`；fresh userData）：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；report sha256 `839ec3c6…`；`session:role-states` 未注册错误 0。

## 4. 应用冒烟（重启后）

- 11:14–11:15（本地）：停止旧进程 → `npm run app -- --remote-debugging-port=9235`（worktree 新代码）后台启动；CDP 在线、渲染器加载（标题「ANS 治理会话工作台」）。
- 两开关按持久值恢复为**开**（`preferences.json` 此前的 `judgeSwitches:{approval:true,decision:true}`）。
- 经渲染器真实入口 `loadProject('C:/Users/51054/Desktop/work/trial-focus-timer')` **只读**导入：六角色枚举（chief/product/rapporteur/nominator/convener/verifier）、`primaryRoleId=chief`、`governanceModel=trio`；未打开会话、未向 trial 项目写入。
- 截图 `%TEMP%ns-regress-1029 8-hiring-smoke.png`；启动日志 `%TEMP%ns-regress-1029pp-hiring-smoke.log` 无 error/failed/exception。应用保持运行（CDP 9235）。

## 5. 决策点与遗留

1. **Q6 A 已按客户确认实施**：验收 judge 最小链事实（facts + verdict + prompt + 桌面 enrich）；未改客户最终验收权。
2. **Q2 A（高风险，客户已明确接受）**：`node --test`/`npm test/install/ci` 保持普通审批 + 执行后审计；任意 `npm run <脚本>` opaque。
3. **M4 目录校验**：最新名单可读时强制 boundary 目录 ⊆ 名单授权目录；名单不可读时由 M11 的 D3 名单版本校验兜底（新链 D3 必带 version/hash）。旧 flow/无名单记录保持既有行为（回滚兼容）。
4. **执行后审计的可见性**：越界写入使工具结果 `ok:false` 并附越界清单；不自动回滚、不跨层强制关闭任务（任务收口仍由幕僚/运营判断）。按方案 §6.5 默认口径。
5. **基线 12 红**（9 Windows symlink EPERM + T1×3）为环境性既有问题，与本批无关。
6. 设计文件 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 随本批首次进入分支（此前仅存在于工作树）。
