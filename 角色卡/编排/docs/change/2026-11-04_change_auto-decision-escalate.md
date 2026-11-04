# 自动决策「无法核对」类升级客户确认——编排角色变更记录（2026-11-04）

- 角色：编排（orchestration）
- worktree：`.claude/worktrees/auto-decision-escalate-fix`
- 分支：`fix/auto-decision-escalate`（基于 origin/main `61bb0b2`）
- 方式：客户直修（跳过调研/方案），只做编排角色边界内的实现、测试与记录
- 未提交：worktree 内未 commit / push

## 1. 客户直修依据

依据：`docs/communication/2026-11-04_issue-auto-decision-proposal-sidecar.md`（该文档在主检出/客户授权平面 worktree 中为未跟踪文件，未包含在本 worktree 的 origin/main 提交树内；本轮从客户授权平面 worktree 读取原文核对）。

客户原话（2026-11-04）：「这个也要修复」（引用该记录的 P1 与三条修复建议）。

本轮要落实的语义（第 1 条，以及第 3 条中属于判定链路的部分）：

- 自动判断遇到「无法核对」类条件（criteria-ref-mismatch、规范物证缺失、提案缺 sidecar 等）时**不得自动拒绝**，应把卡原样转客户确认，并在卡上说明无法核对的原因；
- judge 绝不无物证自动放行（fail-closed 方向不变：无物证绝不 approve）；
- 本轮不做「流程产出 sidecar / 验收标准物证」那条（第 2 条，另立任务）；同一卡指纹去重/一次性提示（第 3 条的操作侧）由桌面窗口角色在 app 侧消费本分类器实现。

## 2. 根因定位（本轮实现依据）

1. `src/common/编排/governance-judge-facts.ts:173-225`（`requiredArtifactPaths`）：提案卡（cardKind=proposal）未携带 `artifacts.proposalPath` 时判定 `missing:true`，约定路径 `docs/proposals/<flowId>-proposal-v1.md`；pinned run manifest `documents` 未登记提案即触发（文件存在也不算）。
2. `src/common/编排/governance-judge-evidence.ts:1072-1078`：证据包构建写入 `artifact-missing`（「判断无法核对」）；`chooseReason`（同文件 785-793）把它列为最高优先 reasonCode。
3. `src/common/编排/governance-judge.ts:324-339`：证据包 `ok=false` 时不调用模型，直接返回 `manual`。
4. `src/common/编排/governance-judge-verdict.ts:613-617`：同样以 `manualOutcome("artifact-missing", ...)` 返回 manual。
5. app 侧（桌面窗口角色负责修改）：把 `manual` 结算为 `declined` 自动退回，导致同一张卡被反复拒绝。本轮只在编排侧提供「无法核对」的单一来源分类器供 app 消费，不改判定/放行逻辑。

## 3. 改动清单

### 3.1 `src/common/编排/mechanical-rejection.ts`（191 行 → 237 行，+46 行）

- 在 `RULES` 之后、`LEGACY_CODE_ALIASES` 之前新增模块内常量 `UNVERIFIABLE_REJECTION_CODES: ReadonlySet<string>`（JSDoc 120-130 行、集合 131-160 行）与导出函数 `isUnverifiableRejectionCode(code)`（162-165 行）。
- 集合内容（白名单，共 24 个 code）：物证 `artifact-missing`/`artifact-not-read`；验收标准 `criteria-*` 15 个（missing/format-missing/format-ambiguous/parse-failed/schema-invalid/version-mismatch/version-unresolved/ref-mismatch/status-draft/id-invalid/priority-invalid/duplicate-ac/too-many/empty/mismatch）；证据自洽 `evidence-mismatch`/`evidence-path-invalid`；证据包 fail-closed 码 `context-missing`/`evidence-packet-missing`/`evidence-packet-overflow`/`evidence-conflict`/`evidence-hash-mismatch`。
- 语义：该 code 属于「无法核对事实」（物证/验收标准缺失、不可读或互相不一致），不是「判断结论为不合格」；桌面自动决策必须原样转客户卡并附原因，不得自动拒绝。分类器先经 `canonicalRejectionCode` 归一，旧别名将来映射到核对类码时自动生效。
- 未改：`RULES` 表内容、既有导出语义、owner/retryable、判定/放行路径（`governance-judge*` 均未动）。
- 注释微调（如实披露）：任务给定注释原文含 `evidence-packet-*/evidence-conflict`，其中 `*/` 会提前闭合 JSDoc 块注释，导致 Node 类型剥离报 `ERR_INVALID_TYPESCRIPT_SYNTAX`；按任务允许的「微调注释措辞」，改为顿号分隔 `evidence-packet-*、evidence-conflict、evidence-hash-mismatch`。集合内容与函数语义完全未变。

### 3.2 `test/编排/unverifiable-rejection.test.ts`（新增，104 行）

node:test + node:assert/strict，4 个用例：

1. 真值：12 个代表 code（artifact-missing/artifact-not-read/criteria-ref-mismatch/criteria-missing/criteria-parse-failed/evidence-mismatch/evidence-path-invalid/evidence-packet-missing/evidence-packet-overflow/evidence-conflict/evidence-hash-mismatch/context-missing）→ true。
2. 假值：timeout/parse-failed/aborted/insufficient-evidence/path-outside-boundary/path-unverified/model-manual/switch-off/not-recommended/空串/未知 code → false。
3. 漂移守卫：遍历 `rejectionMapSnapshot()`，所有 `criteria-` 开头 code 必须 true；artifact-missing/artifact-not-read/evidence-mismatch/evidence-path-invalid 必须 true。
4. 兼容：5 个现有旧别名（M2_ROSTER_INVALID/M5_TARGET_CARD_MISSING/M6_MODULE_OWNER_MISMATCH/APPOINTMENT_ROOT_MISSING/PATH_OUTSIDE_BOUNDARY）→ false，且与 canonical 化后的结果一致（分类器先归一）。

断言信息均为中文，说明「无法核对类升级客户、不自动放行」的意图。

### 3.3 证据目录

`角色卡/编排/docs/change/2026-11-04_change_auto-decision-escalate-evidence/`：

- `unverifiable-test.log`（命令 1 原始输出）
- `unverifiable-batch-test.log`（命令 2 原始输出）
- `typecheck.log`（命令 3 原始输出）

## 4. 测试与证据（原始结果）

命令 1：`node --test test/编排/unverifiable-rejection.test.ts` → 4 tests / pass 4 / fail 0（duration_ms 约 80.5）。

命令 2：`node --test test/编排/evidence-check.test.ts test/编排/decision-evidence-packet.test.ts test/编排/governance-judge-facts.test.ts test/编排/unverifiable-rejection.test.ts` → 31 tests / pass 31 / fail 0（duration_ms 约 261.3）。

命令 3：`npm run typecheck`（`tsc --noEmit`）→ 无诊断输出，退出码 0。

## 5. 未提交声明

- 本 worktree 内未执行 commit / push；未运行 npm install / electron。
- 只写本角色边界文件：`src/common/编排/mechanical-rejection.ts`、`test/编排/unverifiable-rejection.test.ts`、本记录及其 evidence 子目录。
- 临时拼接脚本与临时块文件已删除（`.ans-tmp-insert.txt`、`.ans-tmp-splice.cjs`）；未改其他角色文件。

## 6. 候选哈希（2026-11-04 写定）

- `src/common/编排/mechanical-rejection.ts`：sha256sum `1f2bc6c15e958deac2ad10b79135c2dff1121f419589d20b3984babe500ec558`；git hash-object --stdin `7df621bac001a0ccd278dac06c15c94978c11c2b`
- `test/编排/unverifiable-rejection.test.ts`：sha256sum `ff90aa52845e2fc1708130457f9798ccc19db1ba83b43743ad4860818a5c5b04`；git hash-object --stdin `6534a54d9eb623e7f618a27f8a157d194a167795`
- `.../unverifiable-test.log`：sha256sum `096e6d60592341ccf0ccaff12918c0b923084ac2f59bdf7f6dae67350167f845`
- `.../unverifiable-batch-test.log`：sha256sum `1927932e398d3af0c7ad0218c5457e3dd370d8008cd9a0b7dc96b0a4228e8cca`
- `.../typecheck.log`：sha256sum `49f4466effc28ca2fa3fd1af1ea5a4fadf1a7f4541bb1d4f8297215a5cd69803`
- 本记录文件自身：哈希无法自引用内嵌，写定后的 sha256sum 与 git hash-object 值随交付回报给出（见最终回报）。

## 7. 风险与披露

- 分类器是**白名单**：未知或新增 code 默认 false，维持旧行为（不会被误升级为客户确认）；新增核对类 code 时必须同步加入集合并更新测试漂移守卫。证据包 reasonCode（context-missing/evidence-packet-*/evidence-conflict/evidence-hash-mismatch）不在 `RULES` 快照内，漂移守卫无法自动覆盖，新增同类码需人工同步。
- 不含运营/模型/边界类 code（path-unverified、evidence-scope-denied、timeout、parse-failed 等）：它们维持既有自动决策语义。
- 本分类器只是单一来源；真正生效取决于 app 侧（桌面窗口角色）改用 `isUnverifiableRejectionCode` 判定 manual 结果的结算方式（转客户卡而非 declined）。judge/verdict/evidence 判定逻辑本轮未改，fail-closed 不变。
- 客户文档中「第 2 条：流程产出 sidecar/验收标准物证」不在本轮范围。
