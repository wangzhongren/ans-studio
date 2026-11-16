# B6b 测试债治理：B0 既有红（其他）族 18 名 / 12 文件

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/b6b`（分支 `fix/test-debt-b6b`，起点 `a0baea2` = `origin/main`，含 B3a #111 / B3b #112 / B3c #113 / B4 #114 / R4 分析 #115）
- 范围：R5 `b0-existing-other` 族 **17 名 / 11 文件**（R5 修正：`required` 伪影已随 B4 转绿）＋ B5 移交 `f-handler` **F3 1 名** = **18 名 / 12 文件**（`schema.test.ts` 为任务书列出的 `required` 伪影位，实际 3× 已绿、无需修改）。R5 的 f-handler 文件同时含 B0 的 F7 与 B5 的 F3，二者均已处置。
- 约束遵守：只改 10 个测试文件 + 本记录/`_evidence/`；**未改产品/workflow/release.yml/角色卡/边界/其他测试**；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 复现参数：逐文件 `node --test --test-timeout=120000`，全部**自然退出**（未使用 `--test-force-exit`）。`git-role-workflows-e2e.test.ts` 单次约 3m15s（内含真实业务子进程）。其证据目录为测试自写、未跟踪；单次全文件运行约产生 1 GB 临时工件，验证后已全部清理、未入库。

## 0. 摘要

1. **18 名中 17 名转绿**：10 个修改文件各 3× 自然退出全绿、零新增；`claude-adapter/schema.test.ts` 的 `required` 伪影不再复现（10/10 ×3，未修改）。
2. **1 名保持红并单列 owner 裁决候选**：`direct-role-capabilities-e2e.test.ts` 的 Q normal-new early chain——不是夹具字段漂移，而是该场景被 2026-11-10「两条固定工作流路径」语义取代（fixed 默认 + A3 前置 + legacy freeze 断言失效），见 §3/`_evidence/04-product-candidates.txt`。
3. **未发现“产品缺陷”候选**；本轮所有红名都可归因为测试装配过时/环境假设。两处与原断言相反的行为（裸 legacy 重派不投递、客户面板 closeTask 拒绝）按 B5 既有结论定性为**当前有意语义**，已在测试中如实钉住（§1.10、§3 补充）。
4. `npm run typecheck` ⇒ **EXIT=0**（`_evidence/05-typecheck.txt`）。
5. 根因类别：v2.0.0 受派任务/run 授权交集（t1-pipeline）、active-role-evidence（trunk-stable）、B23 文档内容增长（session byte pin）、fixed 语义取代（direct-role）、探针审计裸子串误报（h-scope）、`currentTurnId` getter 契约（pi-loopback）、未跟踪证据目录（git-role）、D 批词汇演化（entry D-04）、招募备忘录目录警告（project）、绑定层+handler 两层语义（f-handler）、重派/收口语义（log-actions）。

## 1. 逐文件定性与改法

逐名处置机读表见 `_evidence/03-dispositions.tsv`；修改前/后 3× 计数见 `_evidence/01-before-3x.tsv` / `02-after-3x.tsv`；原始输出在 `_evidence/runs/`。

### 1.1 `test/测试/g4-skill-verify/h-scope-audit.test.ts`（3 名，全绿）
- **定性：测试装配过时（源码切片漂移 + 审计子串过宽）**。
- 范围②/范围③补＋⑤：`run-role.ts` 当前能力透传为
  `cap?.installX === true && input.installX !== undefined ? blockedRoleCapabilities?.installX ?? input.installX : undefined`
  （input 在场前置 + 角色能力保护回落）。按当前实现逐字更新正则；「能力矩阵是唯一透传判据」的断言意图不变。
  范围②的桌面注入判据正则放宽为允许同行 `canNominate`（`\n?`），源码格式漂移。
- 范围⑥：旧检查 `text.includes(".probe")` 会把 `{ ...probeTool() }`（spread 产生 `..probe`）与 `audit.probe`
  属性访问误报为探针模块引用。改为**模块引用面**审计：
  `/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'`][^"'`]*\.probe(?:\.[^"'`]*)?["'`]/`；
  探针文件名基名逐条检查保留。
- 验证：7/7 ×3 自然退出。

### 1.2 `test/测试/t1-pipeline-integration.test.ts`（3 名：T1 pi/codex/claude，全绿）
- **定性：测试装配过时（v2.0.0 受派任务授权交集 + 聊天 handback 语义）**。
- 原夹具 `taskId:"T1"` 是合成任务、不在账本：e71501c 起项目角色带 taskId 时按「真实受派任务」求
  `module/current` 交集（`run-role.ts:1649/1759`），空交集导致客户确认后写入仍被拒
  （`Target is outside the actual assigned task's frozen module/current authorization intersection`）。
- 改法：去掉合成 `taskId`，保留 `scope:{writeSet:[],conditions:[]}`（确认发行仍是唯一写权来源，探针实测
  确认路径放行、未预览路径拒绝）。三次 `send` 显式 `handback:{required:true}`——当前 `withHandback`
  对聊天轮（required=false 且无报告）跳过回交（`handback.chat.skipped`），显式 required 保留原
  `aborted/unreported/completed` 回交断言与三条 settled 断言。
- 验证：8/8 ×3 自然退出（此前失败时曾因 mock timers + 失败清理导致进程不退出；修复后自然退出）。

### 1.3 `test/测试/trunk-stable-write-integration.test.ts`（2 名：stable workflow、appointment-write，全绿）
- **定性：测试装配过时（v2.0.0 active-role-evidence）**。项目角色边界解析现要求
  `documentContext.frozenRoleEvidence` 或 trunk `activeRoles`（`selectRoleDocumentEvidence`），
  裸 `role-card.md`/`boundary.yaml` 抛 `active-role-evidence-missing-or-mismatched`。
- 改法：`gateProject()` 改为异步——写齐 canonical 角色卡（10 个必需章节）、`boundary.md` 与
  `boundary.yaml` 恒等条目、5 个辅助引用文件；用 `completeSnapshotDigest` 构造并 `prepareSnapshot`
  一份真实 complete-snapshot；按 `FROZEN_ROLE_REF_KEYS` 八类引用构造 `FrozenRoleEvidence` 并绑定
  `documentContext`。角色边界内容（docs/workflow.md / 角色卡 impl 两文件 / docs/proposals/）与全部
  stable 许可/哈希/repin 断言逐字未变。
- 验证：8/8 ×3 自然退出。

### 1.4 `test/测试/git-role-workflows-e2e.test.ts`（2 名：Q30、Q74，全绿）
- **定性：测试装配环境假设（未跟踪证据目录）**。Q30/Q74 在 `finally` 向
  `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/` 写证据；该目录未入 Git，
  全新工作树/CI 首跑 ENOENT。
- 复现披露：修改前 run1（目录不存在）两名为 ENOENT；run1 的后续业务用例在运行中创建了该目录，
  使修改前 run2/run3 偶然通过（**状态相关复现**，不是逻辑 flake）。详见 `_evidence/06-git-role-evidence-dir.txt`。
- 改法：模块加载时 `await fs.mkdir(evidence,{recursive:true})`；Q30/Q74 断言体未改。
- 验证：**先删除整个证据目录再跑首轮**（证明 fresh-checkout 修复），随后连续 2 轮；全文件 3× 自然退出全绿
  （7 pass / 12 skip）。运行产生的约 1 GB 未跟踪工件已清理。

### 1.5 `test/测试/g3-search-verify/pi-loopback-verify.test.ts`（1 名：跨轮配对，全绿）
- **定性：测试夹具契约错位**。`currentTurnId` 是**当前轮 id 读取器**（生产 `src/provider/pi/session.ts`
  `() => turn.id`），不是分配器；e71501c 的 native-observation 层在同一逻辑轮再读一次，旧夹具
  「每次调用自增」把第二轮推成 `g3-turn-3`（首轮读两次）。
- 改法：夹具改为在真实 `session.prompt()` 边界推进轮次（包装 `bindRole` 返回的 session.prompt），
  读取器返回稳定值；两轮用例断言 `g3-turn-1/2` 逐字保留。生产侧无双读缺陷（getter 语义下两次读同值）。
- 验证：6/6 ×3 自然退出。

### 1.6 `test/桌面应用/session.test.ts`（1 名：AC-8 预算，全绿）
- **定性：测试 pin 过时（有意的文档内容增长）**。B23（`6482387`，fixed-path 哈希来源说明）更新了
  doc-format 正文：索引 5,223 → **5,244 B**，最大详情（project-roster/v3）4,089 → **4,243 B**。
- 改法：重钉实测字节并更新用例名；`≤8192 B` 预算、54 个格式 id、最大 id 断言不变。
- 验证：7/7 ×3 自然退出。

### 1.7 `test/桌面应用/project.test.ts`（1 名：buildProjectConfig，全绿）
- **定性：测试期望过时（文档化的非角色目录警告）**。2026-11-08 仓库新增 `角色卡/招募/memo.md`
  （人事备忘录目录，非角色卡）；其 memo 明确记载唯一 warning
  `角色卡/招募：缺少 role-card.md，已跳过` 是按技能默认路径产生的**预期提示**。
- 改法：断言 `listing.warnings` 恰为该一条文档化警告；另断言归档的「桌面应用」零警告。
  其他任何新增警告仍会失败（未放宽为“过滤后为空”）。
- 验证：23/23 ×3 自然退出。

### 1.8 `test/测试/entry-role-minimal-d.test.ts`（1 名：D-04 撤除残留，全绿）
- **定性：测试装配过时（产品词汇演化）**。D 批撤除的是 flow/team-plan **机器**；v1.3 两条固定路径
  （B1，2026-11-10）把 `team-plan` 作为当前词汇重新引入：`complete-team-plan` 动作、`team-plan/v3`
  文档格式、`TrunkSource:"team-plan"`、`purpose:"team-planning"`、`workflow-service`/`workflow-state`
  模块名。旧 residue 正则命中 131 处（team-plan 79 / workflow-service 34 / workflow-state 12 / docs/flows 6）。
- 改法（按实际含义修正，非一刀切放宽）：
  - residue 集**移除 `team-plan`**（不再是残留判据）；
  - `flow-service`/`flow-state` 加负向 lookbehind `(?<!work)`——`workflow-*` 子串不再误报，**独立旧模块名仍被捕获**；
  - 保留全部旧机器专属标识符（governance-gate / flow_get / request_acceptance / … / ledger.jsonl）；
  - allowlist 从 9 条精简为 6 条：保留 3 条既有 `docs/flows/` 合法语义，新增 3 条当前 `docs/flows/`
    引用（doc-format pathPattern、classify-shell policy、apply-journal execution:flow 正则）；
    stale 条目（team-plan 相关）随语义移除。
- 验证：6/6 ×3 自然退出（`hits=[]` 且 `unusedAllowlist=[]`）。

### 1.9 `test/测试/g4v2-mcp-verify/f-handler.test.ts`（2 名：F3（B5 移交）、F7（B0），全绿）
- **定性：测试同步（e71501c 绑定层 + 诊断两层）**。真实能力闭包先做 `stillUnmanaged` 身份/范围核验，
  无活轮次/伪造 origin ⇒ `effect-scope-unproven`（`capability.effect.refused`），先于 handler 的
  `not-customer-turn`（`mcp.refused`）。
- **F3**：保留原名与原 `not-customer-turn` 逐字断言，新增两层：
  - 真实绑定层（无轮次、无 identity-bound origin）⇒ `effect-scope-unproven` + 文案 + 盘快照零副作用；
  - handler 本体经同一实现 `sessionEnv.applyMcpChange` 直调 ⇒ `not-customer-turn` 逐字 + 零副作用；
  - 非客户 kind 的私有面直注改到当前判据位置 `entry.origins.running.kind`（旧 `activeDeliveries` 已非判据）；
  - 「无 active 条目的客户轮放行」按 e71501c 身份绑定语义改为 fail-closed（绑定层拒绝 + handler 拒绝），
    客户消息轮（kind=message）放行断言保留。
- **F7**：真实绑定调用 ⇒ `capability.effect.refused`（toolName=install_mcp、reasonCode=effect-scope-unproven）；
  直调 handler ⇒ `mcp.refused`（reasonCode=not-customer-turn）。
- 验证：7/7 ×3 自然退出。

### 1.10 `test/桌面应用/log-actions.test.ts`（1 名：参数校验与如实回执，全绿）
- **定性：测试同步（重派/收口/投递当前语义）**。
  1. `redispatchTask` 对原任务写 `recordTaskFailure`（`task.reported status=failed`，
     `stuck-terminated:redispatch`），**不写** `task.closed/rework`（B5 stuck-redispatch 同口径）；
  2. 裸 legacy 任务无 runId/pinned run：新任务账本事实如实，但投递经 `openInternal → resolveDeliveryAssignment`
     来源门 fail-closed（不伪造送达；B5 已定性非产品回归）；
  3. `Interface.closeTask` 在 v2.0.0 固定为「客户面板不得冒充角色收口」的如实拒绝，收口只由任务原创建者经
     `close_created_task` 角色能力执行；拒绝路径不写 `task.closed`。
- 改法：原三条正向断言更新为上述当前语义的逐字断言（失败报告、未投递、收口拒绝），参数校验与
  listTasks/readRoleActivityLog/terminateRoleRun 断言不变。
- 验证：1/1 ×3 自然退出。

### 1.11 `test/测试/direct-role-capabilities-e2e.test.ts`（1 名：**未改，保持红**）
- **定性：语义取代候选（owner 裁决）**，详见 §3 与 `_evidence/04-product-candidates.txt`。
- 复现：3/3 同错 `baseline-document-missing`（`docs/product/direct-e2e-intent-vN.md` 缺失）。

### 1.12 `test/claude-adapter/schema.test.ts`（`required` 伪影位：**未改，已绿**）
- **定性：伪影不再复现**。文件内无名为 `required` 的用例；R4/R5 已把裸 `required` 记为族归属伪影，
  B4/source 门变更后消失。本机 10/10 ×3 自然退出全绿，无需修改（按任务书“以实际为准”）。

## 2. 验证（3× 自然退出）

| 文件 | 修改前（3×） | 修改后（3×） | 目标名 |
| --- | --- | --- | --- |
| h-scope-audit | 4/7 pass（3 fail） | **7/7 ×3** | 3 名全绿 |
| t1-pipeline-integration | 5/8（3 fail） | **8/8 ×3** | 3 名全绿 |
| trunk-stable-write-integration | 6/8（2 fail） | **8/8 ×3** | 2 名全绿 |
| git-role-workflows-e2e | run1 5 pass/2 fail/12 skip（dep. on dir） | **7 pass/12 skip ×3**（含删目录 fresh 首跑） | Q30/Q74 全绿 |
| pi-loopback-verify | 5/6（1 fail） | **6/6 ×3** | 全绿 |
| 桌面应用/session.test.ts | 6/7（1 fail） | **7/7 ×3** | 全绿 |
| 桌面应用/project.test.ts | 22/23（1 fail） | **23/23 ×3** | 全绿 |
| entry-role-minimal-d | 5/6（1 fail） | **6/6 ×3** | 全绿 |
| g4v2 f-handler | 5/7（2 fail：F3+F7） | **7/7 ×3** | 全绿 |
| 桌面应用/log-actions.test.ts | 0/1（1 fail） | **1/1 ×3** | 全绿 |
| direct-role-capabilities-e2e | 2/3（1 fail） | **2/3 ×3（未改）** | 保持红（候选） |
| claude-adapter/schema.test.ts | 10/10 ×3 | **10/10 ×3（未改）** | `required` 不复现 |

- 其余名不变、零新增失败；未新增 skip/todo；未删用例。
- `npm run typecheck` ⇒ **EXIT=0**（`_evidence/05-typecheck.txt`）。

## 3. 产品/语义候选（单列，未改）

1. **Q normal-new early chain**（`test/测试/direct-role-capabilities-e2e.test.ts`）：
   空项目默认 fixed（`workflowMode` 无显式 legacy 即 fixed）；intent-confirm 的 `prepareIntent` 要求
   `docs/product/<flowId>-intent-vN.md` 且活动 workflow A2 已 completed；用例是 B1 之前的 legacy 直启顺序
   （先 docs/intents 入口与确认卡、后 product 写意图），且末段断言 legacy trunk/doc-freeze 的
   `intent-confirmed`——fixed A3 明确不触 trunk/doc-freeze。需 owner 裁定：
   a) 重写为固定路径 A1→A2→A3 真实链（改钉 workflow A3 完成）；或 b) 产品保留空项目 legacy 早链。
   详见 `_evidence/04-product-candidates.txt`。
2. 补充（非候选，仅披露）：log-actions 中「裸 legacy 重派不投递」「客户面板 closeTask 拒绝」均为
   v2.0.0 当前有意语义（B5 先例），已如实钉住，不列为产品回归。

## 4. 剩余名（`_evidence/03-dispositions.tsv`）

| 名 | 文件 | 状态 | 分类 |
| --- | --- | --- | --- |
| Q normal-new early chain: actual chief customer request -> formal product dispatch -> product write/report; no seeded freeze | `test/测试/direct-role-capabilities-e2e.test.ts` | RED（未修改） | 语义取代候选：fixed A1→A2→A3 前置取代 legacy 早链；owner 裁决 |
| （R4/R5 裸伪影 `required`） | `test/claude-adapter/schema.test.ts` | GREEN（3×） | 伪影消失，非真实用例；B4 已处置 |

## 5. 证据边界与披露

1. **git-role 复现状态相关**：修改前只有 run1（目录缺失）复现 ENOENT；run1 运行中业务用例创建目录后，
   run2/3 偶然通过。修复后以“删除目录再跑”证明 fresh-checkout 行为；详见 `_evidence/06-git-role-evidence-dir.txt`。
2. **临时工件**：git-role 全文件运行会向未跟踪证据目录写约 1 GB 工件；验证后已清理，未入库。
3. **未做的事**：未改产品/workflow/release.yml/角色卡/边界/其他测试；未 commit/push；未触发 CI；未 tag/碰 main；
   未读 `.env`；未占用 9222/9223/9224；未跑 macOS（平台结论仅 Windows 11 x64 本机 + R5 CI 归因引用）。
4. **f-handler 范围说明**：任务书按 1 名（F3）计数，但同文件 F7（R5 B0 其他 17 名之一）同样复现且已处置；
   两者共用 e-handler 两层结论（B5 §1.5 先例）。
5. **schema 文件**：任务书列出 `required`/`selected` 伪影位；实际无该用例，3× 绿；未改。
6. **断言纪律**：未放宽断言、未删用例；所有改写均为按当前有意语义更新期望/夹具并逐字钉住；
   D-04 的 residue 收窄附逐条语义依据，旧机器专属标识符全部保留。

## 附录：证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-b6b-b0-other_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-before-3x.tsv` | 12 文件修改前 3× 计数、目标失败名、复现状态备注 |
| `02-after-3x.tsv` | 修改后 3× 计数（自然退出）、git-role fresh-dir 说明 |
| `03-dispositions.tsv` | 逐名处置（family/file/name/disposition/basis），19 行（18 名 + `required` 伪影） |
| `04-product-candidates.txt` | Q normal-new early chain 的复现、根因链、owner 裁决选项；log-actions 当前语义披露 |
| `05-typecheck.txt` | `npm run typecheck` 最终输出（EXIT=0） |
| `06-git-role-evidence-dir.txt` | Q30/Q74 未跟踪证据目录的状态相关复现与修复验证说明 |
| `07-h-scope-before-observed.txt` | h-scope-audit 修改前 3× 的失败名/错误（原始控制台未留存时的书面记录） |
| `runs/` | 逐文件修改前（`*-run*.txt`）与修改后（`*-after*.txt`）原始 node --test 输出；git-role 业务子进程日志量较大 |
