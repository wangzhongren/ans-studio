# 2026-10-29 — 工作流维护者化（v4.1）：六卡、机械前置、报告路由、shell 写区守卫与验收最小事实

- 日期：2026-10-29｜任务：内置角色工作流维护者化 + 招人流程强制化 + shell 写区约束（方案 v2.1，客户闸门 1/2 已过）｜风险档位：T3（治理/权限/流程变更）
- 分支/worktree：`feat/entry-role-minimal` @ `.claude/worktrees/entry-role-minimal`｜实施基线：`a27644d`（含人事 chain-enforcement 边界 Delta-2）
- 依据：`docs/planning/2026-10-29_design-workflow-maintainers-hiring.md`（v2.6 模块先行；文档版本化/拓扑图/R2 为协调 2026-10-29 追加口径，实施以本记录 §4.3/§4.4 为准；文件随本批入库）；复核记录 `docs/planning/2026-10-29_review-workflow-maintainers-hiring.md`（246 行 / `dd6d2a4e…`，结论通过）；拓扑 v4.1 与真机测试日志 `docs/communication/2026-10-29_*.md`；客户确认 Q1–Q11 按推荐项（Q4 D3 带 decisionId、Q6 验收 judge 最小链事实）；**Q1/Q2 已由客户 2026-10-29 修正**：不强制客户审批，改为判断 agent 审查脚本内容（开关关闭仍弹客户卡；不可用/超时/解析失败 fail-closed），Q2 测试/安装普通审批+审计；**§六 delta 2 客户追加**：模块先行（一模块一文件夹/一属主）、人员+模块拓扑图、文档版本化。
- 性质：实施与验证记录（**不是验收结论**）；本地提交，不 push、不合并 main。

## 1. 实施范围（严格按方案 §8 写集）

### 1.1 门禁引擎

- `src/common/门禁引擎/governance-roles.ts`：六张内置卡按拓扑 v4.1 重写——幕僚五步链（产品意图 → 策划方案+名单+架构 → 人事按名单招人 → 交付运营）与「一次一步/不跳步」；产品意图文档；策划 `project-roster/v1` 名单（schema/version/roles/directories）；人事 D3（`cardKind=appointment` 多选、decisionId、写卡目录 ⊆ 名单）；运营接交付/派实现/收报/发起验收；质检回报**发起方**。convener 能力位 `dispatchTask: true`（已批准权限 delta；目标矩阵由桌面 M6/M7 执行）。worker 卡模板要点（实现任务只来自运营、只写名单目录、验收归质检）并入人事卡。
- `src/common/门禁引擎/classify-shell.ts`：新增 `isOpaqueShellExecution(argv)`——解释器执行脚本文件 / `-m` 模块 / `npm run`、`npx`、`corepack` / 构建任务工具 ⇒ opaque；**Q2 A**：`node --test`、`npm test`/`install`/`ci` 等按普通审批（开关可代批）+ 审计；**F6/G3**：短内联（`node -e`/`python -c`，≤2048B、≤10 行、单行 ≤1024B）不硬拒、走脚本审查；长内联与 re-shell（`bash -c`/`sh -c`/`eval`/`exec`/`source`/`awk`/`find -exec`）维持 hardDeny；`bash script.sh` 走脚本审查。
- `src/common/门禁引擎/shell-write-guard.ts`（新增）：确定性写目标判定 + 注入 `checkWrite`（同一 `resolveWrite`，realpath/F4/scope 口径一致）。显式写目标（cp/mv/tee/touch/mkdir/rm/sed -i/chmod/ln/dd 等）逐目标判定：越界/`..`/绝对越界/禁写前缀 ⇒ deny；全部在边界内 ⇒ pass（继续既有审批链）；不透明执行 ⇒ opaque。cwd 异常时以项目根为基准（防按外部目录解释后放行）。

### 1.2 编排

- `src/common/编排/workflow-preconditions.ts`（新增）：`project-roster/v1` 名单解析/校验（schema/flowId/version/角色 id/内置 id 拒绝/目录合法与不重叠/治理路径拒绝）、最新名单发现与 `version + sha256`、D3 卡形状校验与推荐集生成、派发矩阵 M1–M8、报告路由 M9。
- `src/common/编排/task-state.ts`：`task.created.from` / `task.closed.by` 放宽为 `chief | convener`；新增 `flowId`/`stepId` 与 `request.resolved.rosterVersion/rosterSha256` 校验（slug / 正整数 / 64 位 hex）；旧记录（无新字段）逐字可读（F9 兼容）。
- `src/common/编排/governance-judge-facts.ts` / `governance-judge-verdict.ts` / `governance-judge-prompt.ts`：验收 judge **最小链事实**（Q6 A）——产品意图 + 提案 + 名单（version/hash）+ D3 裁决 + 质检报告；撤除旧 flow 的 proposalDecision/criteria/change-package 门槛；appointment 推荐集按名单校验。
- `src/common/编排/shell-gate.ts` / `src/pipeline/orchestration/shell-arming.ts`：注入 `writeGuard`、`snapshotBefore` 与 `approvalContextLoader`。显式写目标越界 deny 直接拒绝（0 卡、0 judge）；script 先加载**脚本审查上下文**（不可用 ⇒ fail-closed 拒绝），再交既有审批链（开关开 → judge；开关关 → 客户卡）；只读档 script 拒绝；非 advisory 项目链的 c=deny 硬地板保持；最终 allow 后、spawn 前拍快照。新增 `shell-approval-context.ts`：`node/python/bash <script>`、短内联 `node -e`/`python -c`、`npm run <script>` 读取有界内容；`package.json#scripts`、内联代码、非脚本 opaque 说明；judge 提示词（`shell-judge-prompt.ts`）展示脚本路径/内容并要求核对写区/破坏性/越权。
- `src/common/编排/shell-post-audit.ts`（新增）：执行前轻量快照（路径+mtime+size）→ 执行后 diff → 越界新增/修改/删除写 `docs/audit/shell-gate.jsonl` 并返回越界清单（不自动回滚；审计写失败只诊断）。**返工（P6/R2/v2.4）**：`.ans/` 不再排除（应用独占治理记录区的项目内变化按越界审计）；执行后审计覆盖项目树 + **显式声明的 extraRoots（skillRoot）**边界，**不宣称**兜底任意项目外写入——项目外越界由 static guard（脚本路径/显式目标）与 judge 审查拦截。
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
| `test/门禁引擎/classify-shell.test.ts` | 更新（v2.4 F6） | 52 | 短内联 review/长内联与 re-shell deny；bash 脚本文件 review；find -exec deny |
| `test/门禁引擎/shell-write-guard.test.ts` | 新增（返工后 9，含 F1/F2/F6 形态） | 9 | 显式写目标边界/越界/禁写/逃逸、opaque 与 Q2 例外、cwd 防御、TaskScope 经 checkWrite 收窄；**P6 十种绕过形态全部 opaque**、plain 形态不误伤 |
| `test/编排/workflow-preconditions.test.ts` | 新增（模块/拓扑/版本/env 后 13） | 13 | 名单解析正/负例（v2 modules/roles.modules/拓扑）、版本化引用（最新/旧版只读/缺文件/链断裂）、最新名单 version/hash、D3 卡形状/推荐集、M1–M8 矩阵、M9 路由 |
| `test/编排/shell-post-audit.test.ts` | 新增（返工后 8） | 8 | 快照 diff、越界判定、审计记录、真实文件系统排除项；**`.ans/` 与项目根之外（extraRoots/`..`/绝对路径）越界检测；R9 baseline 改写审计** |
| `test/编排/appointment-roster.test.ts` | 新增（BUG-3 后 8） | 8 | 人事发卡/推荐集、选项≠名单拒绝、convener 发卡拒绝、boundary 目录 ⊆ 模块并集；**appointment-write judge 事实（allowedPathRoots=角色卡/<target>/ ∪ 模块并集、pathProbes 逐路径 allowed、缺 targetRoleId 拒绝）；一人多模块（同父兄弟目录）并集；D3 preview 附拓扑图** |
| `test/编排/acceptance-judge-minimal.test.ts` | 新增（R2 后 4） | 4 | 验收最小链事实通过/缺项 manual/物证缺失；**验收模块事实 moduleId/目录/属主** |
| `test/编排/shell-operator-only.test.ts` | 更新（+2，返工 +3） | 16 | opaque → 审批（含脚本上下文，不强制客户本人）、上下文不可用 fail-closed、写目标 deny 直拒；**P6 真实守卫 × 审批档集成（越界 deny / 不可解析交判断）** |
| `test/编排/shell-approval-context.test.ts` | 新增（R2 后 9） | 9 | 脚本/内联/npm run/test/install/构建配置内容与 sha256；深度 ≤2 引用展开；64KB/2000 行/3 文件/128KB bounds fail-closed；注入防护与 judge 提示词 |
| `test/编排/task-state.test.ts` | 更新（+2） | 9 | from/closed 放宽、stepId/flowId、roster 字段校验、旧记录兼容 |
| `test/编排/trio-worker-report.test.ts` | 更新（+1） | 4 | v4.1 卡文本（五步链/名单/D3/验收发起方）、convener dispatch 能力 |
| `test/桌面应用/chain-enforcement.test.ts` | 新增（返工后 6） | 6 | 跳步拒绝（M1/M2/M8）且拒绝在 task.created 之前、交付/运营作用域（M5–M7）、报告路由（M9，含**质检回报发起方**）、M11 名单版本（含 flowId-only） |
| `test/桌面应用/operator-channel.test.ts` | 更新（+3） | 56 | judge 收到脚本内容并据其裁决（deny/allow）；开关关 → 客户卡展示内容；manualOnly 兼容能力 |
| `test/runtime-core/customer-input-context.test.ts` | 更新（+1） | 3 | request_choice 回执 decisionId |
| `test/测试/su-shell-approval-verify/e-zero-execution.test.ts` | 更新（v2.4 F6） | 6 | 短 `node -e` 由 c-deny 改判 c-review→a-* 脚本审查分支；长内联/re-shell 仍 deny |
| `test/门禁引擎/versioned-doc-guard.test.ts` | 新增（v2.8–v2.15 R6/R9） | 11 | 版本化路径/版本号；覆盖既有 -vN.md ⇒ deny；shell cp 旧版 deny/新版 pass；基线 TOFU/marker/坏行/缺失 fail-closed、canonical 路径、并发登记、O_EXCL 锁/活锁不接管/token fencing、旧记录归一化、属主写后单文件登记 |
| 既有更新 | — | — | `chief-workflow`（convener dispatch v4.1）、`star-routing`（M8/M5/M6）、`entry-role-minimal-d`、`i-full-chain` |

定向（最终 b7813ad）：门禁引擎 275 计（274 过 / 1 skip）、编排 530 计（529 过 / 1 红＝既有 Windows symlink EPERM）、桌面应用 344/344、runtime-core 258 计（251 过 / 3 红 / 4 skip，红均既有 symlink）、测试 544 计（534 过 / 4 红 / 6 skip，红均基线）、项目管理 154 计（149 过 / 5 skip）、装配 85/85；逐文件：classify-shell 52、shell-write-guard 9、shell-operator-only 16、shell-post-audit 8、shell-approval-context 9、workflow-preconditions 13、appointment-roster 8、acceptance-judge-minimal 4、task-state 9、trio-worker-report 4、chain-enforcement 6、operator-channel 56、su zero-execution 6、versioned-doc-guard 11（合计 211/211 全过）。

## 3. 验证（串行）

- 全量（最终提交 b7813ad）：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（340 文件）→ **3000 tests / 2970 pass / 12 fail / 18 skip**（12 红＝9 Windows symlink EPERM + T1×3 既有环境问题）；日志 `%TEMP%\ans-env-full.log`，sha256 `9017f225bcc796747b504e73ebbadb883708f7ac1d49456a5ebfd4a5a964fdbf`。
- `npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0（最终代码重跑）。
- phase5a 真实 Electron（最终）：**34/34 checks、failures=0、console/CSP 0**（report `%TEMP%\ans-phase5a-env\report.json`，sha256 `2b4902b428c7cdacaf89286a55ea30bc237895b727e0281be9a0032f90834945`）。
- 桌面 E2E（最终；临时夹具 `%TEMP%\ans-e2e-g-fixture-1029`；fresh APPDATA）：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；报告 `%TEMP%\ans-e2e-env-out\report.txt`，sha256 `342ba23911121be552a258cbffacd344359889bada407db34c35f71e9932db49`；`session:role-states` 未注册错误 0。

## 4. 应用冒烟（重启后）

- 11:14–11:15（本地）：停止旧进程 → `npm run app -- --remote-debugging-port=9235`（worktree 新代码）后台启动；CDP 在线、渲染器加载（标题「ANS 治理会话工作台」）。
- 两开关按持久值恢复为**开**（`preferences.json` 此前的 `judgeSwitches:{approval:true,decision:true}`）。
- 经渲染器真实入口 `loadProject('C:/Users/51054/Desktop/work/trial-focus-timer')` **只读**导入：六角色枚举（chief/product/rapporteur/nominator/convener/verifier）、`primaryRoleId=chief`、`governanceModel=trio`；未打开会话、未向 trial 项目写入。
- 截图 `%TEMP%\ans-regress-1029\08-hiring-smoke.png`；启动日志 `%TEMP%\ans-regress-1029\app-hiring-smoke.log` 无 error/failed/exception。应用保持运行（CDP 9235）。**真机回归约定**：一律使用 Pi 运行时（项目已配置 `ANS_PI_*`/`ANTHROPIC_AUTH_TOKEN`）；UI 默认 Claude 运行时需要 `ANTHROPIC_API_KEY`，本批不配置、不使用 Claude 做真机回归。

**返工 v2 后冒烟（F1–F5）**：停止旧进程 → 最终代码后台启动（CDP 9235）→ 两开关持久值仍为开 → `loadProject('trial-focus-timer')` 只读导入并 `selectRuntime('pi')`（六角色/primary=chief/trio）→ 截图 `%TEMP%\ans-regress-1029\10-hiring-rework2-smoke.png`；启动日志 `%TEMP%\ans-regress-1029\app-hiring-rework3.log` 无 error/failed/exception（未出现 Claude/ANTHROPIC_API_KEY 缺失）。**trial 项目 SHA-256 前后清单**：`trial-manifest-pre.txt` 与 `trial-manifest-post2.txt` 均 28 文件、sha256 同为 `5af6cd98…`，`diff` 为空（TRIAL_UNCHANGED）——冒烟未改 trial 任何文件。

**返工 v3 后冒烟（F6/F7，最终代码）**：停止旧进程 → 当前 worktree 代码后台启动（CDP 9235；日志 `%TEMP%\ans-regress-1029\app-hiring-rework4.log` 无 error/failed/exception，未出现 Claude/ANTHROPIC_API_KEY 缺失，Pi 包加载/bindRole 正常）→ 两开关持久值仍为开（`auto-approve-toggle`、`judge-decision-toggle` 均 checked）→ `loadProject('C:/Users/51054/Desktop/work/trial-focus-timer')` 只读导入（六角色、`primaryRoleId=chief`、`governanceModel=trio`、`session=null`）→ 项目载入后 `selectRuntime('pi')` 返回 true、`runtime=pi`（UI「Pi 已配置」）→ 截图 `%TEMP%\ans-regress-1029\11-hiring-rework3-smoke.png`。**trial 项目 SHA-256 前后清单**：`trial-manifest-pre3.txt` 与 `trial-manifest-post3.txt` 均 28 文件、sha256 同为 `5af6cd981a2d82e7c553e01b1852a1cd6dd52b40436e98f382101b06ff99c9ec`，`diff` 为空（TRIAL_UNCHANGED）——冒烟未改 trial 任何文件。应用保持运行（CDP 9235）。

## 4.1 回滚前置（F3 返工）

**结论（书面限制）**：**不支持把本批回滚到旧代码后直接读取新记录**——旧 `task-state` 校验会拒绝 `task.created.from="convener"` / `task.closed.by="convener"`。回滚前必须二选一：
1. **保留本批放宽后的读取器**（最小兼容补丁：`task-state.ts` 的 from/closed.by 校验接受 chief|convener，并忽略 `stepId/rosterVersion/rosterSha256`）；或
2. **执行文档化迁移**（在回滚前对 `.ans/state/tasks.jsonl` 逐行处理）：
   ```js
   // node 迁移脚本（示意；先备份 tasks.jsonl）
   const fs = require("node:fs");
   const file = ".ans/state/tasks.jsonl";
   const out = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
     const e = JSON.parse(line);
     if (e.kind === "task.created" && e.from === "convener") { e.legacyFrom = "convener"; e.from = "chief"; }
     if (e.kind === "task.closed" && e.by === "convener") { e.legacyBy = "convener"; e.by = "chief"; }
     // 旧读取器忽略未知字段；若目标旧版本严格拒绝未知字段，再删除 stepId/rosterVersion/rosterSha256 并留档。
     return JSON.stringify(e);
   });
   fs.writeFileSync(file, out.join("\n") + "\n");
   ```
本批新读取器保持对旧记录的兼容（`from:"chief"`、`closed.by:"chief"`、无新字段），并有混合新旧记录测试。

## 4.2 真机五步链回归（BUG-3 修复）

**现象**：干净项目 `C:/Users/51054/Desktop/work/trial-hiring-chain` 真机走链时，D3 招人卡由判断 agent 代批通过（`decisionId=decision-req-b2c02d0d82c7609d`，resolved=bookmark-impl+bookmark-qa），但随后 4 次 `appointment-write`（含收窄为单卡单路径）均被自动审批层确定性拒绝：「写盘路径不在允许范围内（角色卡/<目标>/role-card.md 不在角色可写根内）」；第④步派运营被硬拒（目标角色卡不存在）⇒ 链条在③死锁。

**根因**：`src/pipeline/orchestration/run-role.ts` 重建 `judgeContext` 时只带 `flowId/facts/paths`，**未设置 `allowedPathRoots` 与 `pathProbes`**；`governance-judge-evidence.ts` 读到空数组后把每条声明路径判为 `insideAllowedRoot=false` ⇒ verdict `path-outside-boundary`。C 批测试直接构造 judge 参数，未覆盖这条生产接线（本批新增的 M4/D3 校验亦未改变该缺口）。

**修复**（`run-role.ts` judgeContext 构造）：
- `allowedPathRoots` = `角色卡/<targetRoleId>/`（卡文件）∪ 名单给该目标的授权目录（`appointmentAllowedDirectories`，已由 M4 校验 boundary 条目 ⊆ 名单；名单不可读时仅卡目录，后续 M11 fail-closed）；
- `pathProbes` = 对 `completeness.declaredPaths` 每条路径调用**同一个 `gate`**（`resolveWrite` + 治理禁写前缀）机械探测；allowed=false 时携带原因；
- 既有 `validateAppointmentWritePreview`（targetRoleId/decisionId、角色卡目录、必需章节、boundary YAML）与桌面 D3/名单版本校验保持不变。

**测试**（`test/编排/appointment-roster.test.ts`，4→7）：新增 ① judgeContext 含 `角色卡/implementer/` 与名单目录 `src/`、`pathProbes` 为 allowed；② `role-card.md` 与 `boundary.yaml` 两条声明路径均有 allowed 探针；③ 缺 `targetRoleId` 结构拒绝、不触达客户、无 judgeContext。越名单目录拒绝沿用既有用例。

## 4.3 模块清单 + 模块归属（客户 §六 delta 2 / v2.6 R1–R5）

**口径**：先写模块，再把模块安排给人；一个模块=一个文件夹，一模块一属主，模块目录互不重叠且不得互相嵌套（同父兄弟如 `src/bill/a` 与 `src/bill/b` 合法）；角色可拥有多个模块，授权目录=名下模块文件夹并集。

- **schema `project-roster/v2`**：`modules[]` 1–12 项，每项 `id`（小写 slug、≥2 字符）/`name`/`purpose`/`directory`（恰好一个目录、非文件/数组、项目相对、治理子路径拒绝）/`publicContract`/`architectureSource`；`roles[].modules[]` 引用模块 id（每个模块恰一属主、每个角色至少一个模块、可多模块）；`intent`/`proposal`/`architecture` 版本化引用。
- **topology**：名单正文必须有「人员+模块拓扑图」章节，含 ```topology YAML（modules id/directory/roleId + roles id/modules + management 含 convener 与全部项目角色），与 frontmatter 绑定完全一致；D3 卡 preview 由应用附加 `rosterTopologyText()`（模块→属主、角色→模块、运营管理关系）。
- **appointment-write**：`allowedPathRoots` = `角色卡/<targetRoleId>/` ∪ 该角色名下**模块文件夹并集**；`pathProbes` 逐声明路径经同一 `gate` 探测；boundary 条目/子目录按模块并集判定（`validateAppointmentWritePreview`），越模块拒绝。
- **派发/任务/验收（R2）**：`DispatchTaskPayload`/`TaskCreatedEvent`/`dispatch_task` schema/`routeStarDispatch`/任务卡增加 `moduleId`+`moduleDirectory`；convener 派项目 worker 必须带 moduleId 且目标拥有该模块（`module-required`/`module-missing`/`module-not-owned`/`module-directory-mismatch`），目录以名单为准落盘；幂等键纳入模块（同文本不同模块不误判）；验收 facts 增加 moduleId/目录/属主，验收卡可携带模块。
- **测试**：workflow-preconditions 11（模块缺失/重叠/嵌套/多属主/未绑定/文件路径/治理子路径/同父兄弟/一人多模块）、appointment-roster 8（judge roots 模块并集、role-card/boundary 探针、一人多模块、缺 targetRoleId）、chain-enforcement 6（目标不拥有模块拒绝、模块 id/目录落盘、错误目录拒绝、既有链路）。

## 4.4 文档版本化（客户追加口径）

- **版本化命名**：产品意图 `docs/product/<flowId>-intent-vN.md`、提案 `docs/proposals/<flowId>-proposal-vN.md`、名单 `<flowId>-roster-vN.md`、架构 `docs/contracts/<flowId>-architecture-vN.md`；拓扑图在名单正文并随名单版本化。frontmatter/正文带版本与版本记录；不原地改、旧版只读。
- **引用链**：名单 `intent`/`proposal`/`architecture` 必须版本化路径；`loadLatestRoster` 检查引用文件存在、非空、指向该 flow 的**最新**版本（旧引用 `roster-reference-stale`）；proposal 文本必须含名单声明的 intent 路径、architecture 文本必须含 proposal 路径（`roster-reference-inconsistent`）；D3/appointment-write 继续记录/校验 `rosterVersion`+`rosterSha256`，名单新版本使旧 D3 作废（M11 已有测试）。
- **变更流程**：需求/功能变更 → 产品出意图新版本 → 策划出方案/模块/名单/架构新版本 → 派人事/验收前置按最新版本重走；旧版只读，引用最新。
- **测试**：workflow-preconditions 版本化引用用例（最新/旧版只读/缺文件/stale/链断裂/格式）；chain-enforcement M11（D3 旧 rosterVersion 作废）；`chainDispatchFacts` 改为按最新 intent/proposal/architecture 版本探测。

## 4.5 版本化只读守卫与模块权威源（v2.8 R6–R9）

- **R6 `versioned-doc-guard`**（`src/common/门禁引擎/versioned-doc-guard.ts`）：识别 intent/proposal/roster/modules/topology/architecture 的 `-vN.md`；覆盖既有版本 ⇒ deny（不进入审批），新建 vN+1 允许。接入 `shell-write-guard` 显式写目标（cp/tee 等）与编排 `run-role` 的 `gate`（write_file/edit_file 等所有角色写入）；shell 覆盖旧版负例见 `versioned-doc-guard.test.ts`。
- **R7 模块权威源**：`docs/proposals/<flowId>-modules-vN.md`（`project-modules/v1`）为唯一权威；`loadLatestRoster` 读取最新模块文档并与 roster `modules[]` 快照逐项比较——缺失 ⇒ `roster-modules-doc-missing`，非法 ⇒ `roster-modules-doc-invalid`，漂移 ⇒ `roster-modules-drift`（以模块文档为准重出 roster）。M2 派人事前置经 `loadLatestRoster` 自动执行。
- **R8**：新增守卫与测试；`DispatchTaskPayload`/`dispatch_task`/`tools.ts` **不接受 moduleDirectory**（应用从名单模块派生落盘）；`TaskCreatedEvent.moduleDirectory` 仍由应用写入。`chain-enforcement` 覆盖目标不拥有模块拒绝、模块 id 落盘、旧路径夹具迁移。
- **R9 基线（v2.9–v2.12）**：`.ans/state/versions.initialized`（`{v:1,initializedAt}`）+ `.ans/state/versions.jsonl`（记录 `v/flowId/doc/version/path/sha256/recordedAt/event/recordedBy`；`path` 为 `flowId/doc` 派生 canonical 逻辑路径，唯一键 `(flowId,doc,version)`）。仅 marker 与 jsonl **都不存在**时 TOFU 一次；marker 存在后 jsonl 缺失/空/坏行/旧条目缺失一律 fail-closed，不补齐旧条目（仅登记版本号更高的新版本，event=`version-added`）。v2.10 旧记录读取时只读归一化（`versioned-doc-baseline`→`baseline`、`recordedBy app`→`app:session`、旧实际 path→canonical），不追加迁移记录。`versions.lock` 用 O_EXCL 独占（`{pid,startedAt,token}`），陈旧锁凭 token 接管、超时 fail-closed、只释放自己 token；登记/TOFU/校验走项目级串行锁。`shell-post-audit` 对受管版本文件做 baseline 比对，baseline 缺失/坏行也 fail-closed。测试：`versioned-doc-guard.test.ts`（TOFU/marker/空/坏行/新版本/并发/锁/归一化）、`shell-post-audit.test.ts`、chain-enforcement 篡改用例。

## 4.6 五步链真机回归（BUG-3 修复后，`trial-hiring-chain`）

最终代码重启后从第②步续跑（`C:/Users/51054/Desktop/work/trial-hiring-chain`，全程未手工替角色写文件，只发客户澄清消息）：

- **已走通**：策划重出 v2 模块/提案/名单/架构（roster v8 仅项目角色，topology management 含 convener）；D3 由 judge 代批（`decisionId=decision-req-ebd6998cb1685656`，bookmark-impl+bookmark-qa）；**BUG-3 修复验证通过**——appointment-write 两张卡各一次 `confirmed`，角色卡与 boundary.yaml 落盘（`角色卡/bookmark-impl/`、`角色卡/bookmark-qa/`）；第④步交付运营成功（`task.created to=convener stepId=project-handoff`）；运营按模块派发实现任务，worker 写出 `src/cli/*`、`src/store/index.js`、`test/*.test.js`；运营核对 `node --test` **24 pass / 0 fail**。
- **现场暴露并已记录/修正的问题**：意图 frontmatter 仅支持顶层 key:value（三轮退回后修正）；任务文本引用未来契约被投递前置拒收；roster v3–v8 迭代（顶层 modules[] 缺失、topology management 形状、内置 convener 被误加入 roles、角色目录缺 boundary.yaml）；交付运营拒绝文案已改为「D3 选中的项目角色卡未齐备（缺：…）」并补测试；roster 内置角色负例已由解析器拒绝。
- **当时状态**：实现/验收阶段进行中（未到最终 acceptance 汇总）；应用保持运行（CDP 9235）。`trial-focus-timer` 前后清单 28 文件 sha256 同为 `5af6cd98…`，未改动。

## 4.7 模块文件/目录与标准角色 env-bootstrap（客户追加）

- **模块路径**：`directory` 字段可为单个文件或单个目录——以 `/` 结尾=目录，否则=文件；冲突=路径相同或一方包含另一方（同父文件与目录合法）；文件模块授权=该文件本身，目录模块按 boundary kind；topology/绑定/唯一键/模块数规则同步。
- **env-bootstrap（装配/入口）**：默认必带，固定 2 个领域中立模块：`category=env`（环境/资源装配）与 `category=entry`（入口/索引）；代码项目 package.json/scripts/src/main 仅为示例，写作/研究/设计/数据项目用 assets/、index.md 等同样成立。环境/入口类模块按 `category` 归属机械校验，误归属拒绝；小项目省略须写 `envBootstrapOmittedReason`，派人事前置拒绝无理由缺失。
- **测试**：workflow-preconditions 13（文件模块正例、文件+目录同父、相等/包含负例、非代码写作项目 env/entry、env 归属负例）；chain-enforcement 夹具以 `envBootstrapOmittedReason` 保留最小链。

## 5. 决策点与遗留

1. **Q6 A 已按客户确认实施**：验收 judge 最小链事实（facts + verdict + prompt + 桌面 enrich）；未改客户最终验收权。
2. **Q2 A（高风险，客户已明确接受）**：`node --test`/`npm test/install/ci` 保持普通审批 + 执行后审计；任意 `npm run <脚本>` opaque。
3. **M4 目录校验**：最新名单可读时强制 boundary 目录 ⊆ 名单授权目录；名单不可读时由 M11 的 D3 名单版本校验兜底（新链 D3 必带 version/hash）。旧 flow/无名单记录保持既有行为（回滚兼容）。
4. **执行后审计的可见性**：越界写入使工具结果 `ok:false` 并附越界清单；不自动回滚、不跨层强制关闭任务（任务收口仍由幕僚/运营判断）。按方案 §6.5 默认口径。
5. **基线 12 红**（9 Windows symlink EPERM + T1×3）为环境性既有问题，与本批无关。
6. 设计文件 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 随本批首次进入分支（此前仅存在于工作树）。
