# 2026-11-16 KR-29 批次 B：编排 23 红名收口（14 test/编排 文件 + run-role.ts 产品回归）

- 角色：ANS「编排」（roleId: 编排）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\kr29b`（分支 `fix/test-debt-kr29-orchestration`，起点 `5661a73` = `origin/main`，Node v24.22.1）
- 分类依据（只读）：`kr29ana` 工作树 `角色卡/测试/docs/change/2026-11-16_kr29-classification.md` 与 `_evidence/`（01-kr29-master.tsv、03-error-bodies-local.txt、05-source-evidence.md、07-batch-plan.tsv）。
- 范围：**只写** `src/pipeline/orchestration/run-role.ts`、14 个 `test/编排` 文件、`角色卡/编排/docs/change/` 记录/证据。未改其他产品/测试/workflow/release.yml/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。

## 0. 摘要

1. **产品回归 1（#14）**：`projectRoot` 为空（旧支持形态）时 `readGitProtectionFacts("")` 触发 `realpath('')` ENOENT；在 `run-role.ts` 空根短路为 unmanaged/空 `protectedGitRoots`，保留旧「不传 sessionDir」行为；非空根 fail-closed 语义不变。
2. **测试期望更新 21 名 / 14 文件**：按分类簇（VCA ×5、Nominator roleDraftWritePaths ×4、能力面 ×2、任务级 writeSet ×1、chat taskId ×1、workSourceRef ×1、W3-G ×1、frozen-conflict ×1、TM-5 ×1、stable 诊断 ×1、卡片/资源驱动 ×3、reason 文案 ×1）逐名更新；**23 个冻结测试名逐字保留**（证据 03：checked=23 missing=0）。
3. **环境 1（#21）**：本机 Windows 无符号链接权限 ⇒ 能力探测 + 目录 junction 等价路径（realpath 外指 ⇒ 不获委托）；断言不放宽；本机 junction 路径实跑绿。
4. **验证**：23/23 冻结名全绿；编排 137 文件主跑 0 fail；`git-trunk-store` 13/13；修改文件 3× 自然退出 EXIT=0；`npm run typecheck` EXIT=0；零新增红名。
   - 注（超时适配）：`git-capabilities.test.ts` 的冻结名测试在本机真实执行完整 Git 链路约 **117s**（分类基线因早失败未跑到后半段）；该测试单独声明 `{ timeout: 180000 }`（Node 按测试覆盖 CLI 默认 120s），**不改任何断言**；其余文件仍受 `--test-timeout=120000` 约束。详见 §5。

## 1. 产品修复（#14，唯一产品回归）

**症状**（分类 E13）：`test/编排/session-dir.test.ts:114`「D-1：projectRoot 为空 → 不传 sessionDir（旧行为）」在会话构造前抛
`ENOENT: no such file or directory, realpath ''`（`git-command.ts:626` ← `run-role.ts:1543`）。本机工作树、中性根、R6 macOS/Windows x64 CI 同错。

**根因**：`e71501c` 引入 Git 保护面后，`openRoleSession` / `runRole` 无条件 `readGitProtectionFacts(projectRoot)`；空串进入 `realpath('')`。`sessionDirFor` 至今显式支持空根（`run-role.ts:4466-4469`），说明空 projectRoot 是既有支持形态。

**最小修复**（`src/pipeline/orchestration/run-role.ts`，+31/-4）：
- 新增 `isBlankProjectRoot`（trim 后为空）、`blankRootGitProtectionFacts()`（`{projectRoot:"", protectedGitRoots:[], coverage:"unknown", ...}`）、`BLANK_ROOT_HOST_PROTECTION`（`state:"unmanaged"`）。
- `runRole`（gate/适配器能力面）、`openRoleSession`（gate/capabilities/session 记录）、`bindPreparedRuntimeRole`（prepare/bind 两分支的主机保护要求）在空根时短路为 unmanaged，不调用 realpath/主机探测。
- 非空根路径逐字不变：`readGitProtectionFacts`、`readGitHostProtectionRequirement`、managed file protocol 与 fail-closed 判定保持原样。产品 diff 见 `_evidence/02-product-fix.diff`。

**验证**：`session-dir.test.ts` 5/5（空根会话可开、`sessionDir===undefined`、不预建 `.ans`；非空根的两条路径/不安全 roleId 行为不变）。

## 2. 测试期望更新（21 名 / 14 文件，冻结名逐字保留）

逐名 dispositions（分类 # 引用、文件:行、类别、处置）见 `_evidence/01-dispositions.tsv`；冻结名核验见 `_evidence/03-frozen-names-check.txt`。按簇摘要：

| 簇 | 名数 | 现行语义依据 | 更新要点 |
| --- | ---: | --- | --- |
| VCA 客户审批通道关闭 | 5（分类 #7-11） | `version-change-runtime.ts:765-773`；api-spec:1227/1307 | 旧 `submit+present` 改为 `submitDirect`（真实 operationId + base `{version,digest}` + expectedFrom hash + 完整快照）；拒绝断言 receipt `vca-target-invalid`；合法升级 applied/t2 且 **direct 不重 pin 旧 run**；不冻结/无批准事件/trunk 不变 |
| Nominator roleDraftWritePaths guard | 4（#12、13、26、29） | `run-role.ts:1649-1679/1779-1781`；nominator 卡 api-spec | 无真实完成计划+D3 ⇒ 空集；appointment-write 旧卡不得替代 ⇒ judge 探针/角色卡 gate 为拒绝且 reason 为新文案；#29 行为仍拒、reason 更新；Section 1 技能文档/他人写区断言保留 |
| 能力面 protectedGitRoots | 2（#6、15） | `run-role.ts:579/2997`（e71501c） | 一次性/会话适配器均传 `{protectedGitRoots}`；断言 sessionDir/governanceMatrix/contextSections 缺席（A5「矩阵不注入」/一局即止语义不变） |
| 任务级 writeSet fail-closed | 1（#22） | `run-role.ts:1759`；B16/B26 | 合成 taskId 无真实任务 ⇒ 写入被拒（blocked）；handback 形状测试改用无 taskId 聊天形态 + send 显式 handback intent 绑定 T-1；不放宽产品 fail-closed |
| chat 保留 taskId | 1（#23） | api-spec:1458 修订 2；`run-role.ts:3215-3219` | `required:false` 仍保留宿主核验的显式 taskId（第 5 行 `"ignored"`） |
| 发布任务 workSourceRef | 1（#16） | `apply-journal.ts:1196`；api-spec:1286/1667 | 经 Service `prepareRoleDispatch`（chief-hub-v1）生成 convener/nominator 各一真实初始化源与 planning run；task.created 附 workSourceRef；不伪造来源 |
| W3-G 裸 Git 硬拒 | 1（#17） | `shell-write-guard.ts:581-618` | `git clean -fdx`/`git checkout -- .` 移入静态硬拒：allow=false、reason 含「裸 Git 硬拒」、不弹卡 |
| frozen-conflict 带路径 | 1（#18） | `guard-freeze-registry.ts:989`；W2 记录 | message 为 `frozen-conflict: <path>`；hash-mismatch 同格式（reason 前缀 + 路径） |
| TM-5 白名单 | 1（#19） | E10 定位的 7 个内部字面量 | `SCHEMA_WHITELIST` 增 `ans-basis/v1`、`ans-release/v1`、`ans-workflow/v1`、`ans-task-git-shell/v1`、`chief-workflow/v2`、`legacy/v1`、`two-fixed-paths/v1`，逐条非文档格式理由；扫描范围不放宽 |
| stable 诊断字段 | 1（#20） | `stable-snapshot.ts:104-106`；api-spec:1714 | pending 深比较补 `errorCode:"stable-manifest-unavailable", message:"missing"`；不升版本/不虚构快照断言保留 |
| 卡片/资源驱动 | 3（#24、27、28） | `chief/internal/card-text.ts`；`chief-workflow.md`/`chief-workflow-v2.md` | chief 卡只委派资源（不使用卡内副本）；结束本轮/禁 sleep/轮询/等待真实回报断言改读 `chief-workflow.md`；v4.1 主链断言改「按缺口选择责任者」+ 五角色责任 + 同轮并行；验收改 fixed v2「固定路径不发 acceptance 卡」；worker submit_report 与 convener dispatch 能力保留 |

## 3. 环境项（#21）

`test/编排/shell-authorized-routine.test.ts` 原在准备阶段 `fs.symlinkSync` 文件链接；本机无 `SeCreateSymbolicLinkPrivilege` ⇒ EPERM（CI macOS/Windows 原已绿）。按 KR-33 K4 口径：
1. 先尝试文件 symlink（原语义）；
2. EPERM 时改用**目录 junction**（`fs.symlinkSync(..., "junction")`；`lstat().isSymbolicLink()` 同为 true，`realpath` 解析到项目外 ⇒ `matchesDelegatedRoutineCheck=false`，语义等价）；
3. 两者都 EPERM 才 `t.diagnostic` + `t.skip`（有据环境限制，不无据 skip）。
断言不放宽（外指不获委托、项目内获委托均保留）。本机实际使用 junction 路径，**该名绿（非 skip）**；CI 保持原文件 symlink 路径。

## 4. 冻结名与范围约束

- 23/23 冻结名逐字保留（`_evidence/03-frozen-names-check.txt`：checked=23 missing=0）；未改名、未重建基线、未删用例。
- 未改动任何非授权文件；`git status` 仅 15 个授权文件 + 本记录/证据目录。
- 未使用 9222/9223/9224；未读 `.env`；未 commit/push/CI/tag。

## 5. 验证

命令口径（分类 §1 / 任务书）：`node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit <137 files>` + `node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit test/编排/git-trunk-store.test.ts`。`--test-force-exit` 只影响全部用例结束后的进程退出，不改变执行/判定。

- **套件前后计数**：
  - 前（分类基线 5661a73）：137 文件 **1375 tests / 1350 pass / 23 fail / 2 skip**；git-trunk-store **13/13**。
  - 后（本次 run 2 / run 3，两次一致）：137 文件 **1375 tests / 1373 pass / 0 fail / 0 cancelled / 2 skip，EXIT=0**（253s/次）；2 skip 为既有 Delivered Hub/legacy code provenance。git-trunk-store **13/13**（3×）。详见 `_evidence/05-suite-counts.txt`、`_evidence/08-git-trunk-store.txt`。
  - **零新增红名**：run 2/3 全量失败名集合为空；23 名逐名绿（`_evidence/03b-23-green-run2.txt`、`_evidence/03c-23-green-run3.txt`：passed=23 not_passed=0）。
- **超时适配（记录在案）**：`git-capabilities.test.ts:515` 冻结名测试完整真实链路在本机约 117s（run 1 在 CLI 120s 默认下被取消：1375/1372/0 fail/1 cancelled/2 skip，EXIT=1）。该测试单独声明 `{ timeout: 180000 }` 后 run 2/3 通过；这是 Node 支持的 per-test 超时覆盖，**不改变任何断言/判定**；其余 136 文件仍受 `--test-timeout=120000` 约束。CI（Linux/macOS）预期更快；若 owner 不接受 per-test 覆盖，需另立测试拆分任务（会改冻结名的承载方式，风险更高）。
- **修改文件 3× 自然退出**：14 文件同命令（`node --test --test-timeout=120000`，无 `--test-force-exit`）3 轮：**220 tests / 218 pass / 0 fail / 0 cancelled / 2 skip，EXIT=0**（137s/133s/135s，三次一致）。2 skip 为 git-capabilities 既有 Delivered Hub/legacy code provenance。见 `_evidence/06-3x-modified.txt`。
- **git-trunk-store**：见 `_evidence/08-git-trunk-store.txt`（13/13）。
- **typecheck**：`npm run typecheck` EXIT=0（`_evidence/07-typecheck.txt`）。
- **逐名目标**：上述 23 名在定向与全量运行中均通过；全量 0 fail、0 cancelled、2 skip（既有 skip）。

## 6. 产物

- 本记录。
- `_evidence/01-dispositions.tsv`：23 名逐名处置（分类 #/文件:行/类别/理由）。
- `_evidence/02-product-fix.diff`：`run-role.ts` 空根短路产品 diff。
- `_evidence/03-frozen-names-check.txt`：冻结名逐字核验。
- `_evidence/03b-23-green-run2.txt` / `_evidence/03c-23-green-run3.txt`：全量 run2/run3 中 23 名逐名绿核验。
- `_evidence/04-file-sha256.txt`：修改文件 SHA-256。
- `_evidence/05-suite-counts.txt`：套件前后计数与全量运行摘要。
- `_evidence/06-3x-modified.txt`：修改文件 3× 自然退出。
- `_evidence/07-typecheck.txt`：typecheck 输出。
- `_evidence/08-git-trunk-store.txt`：git-trunk-store 单文件运行。
- `_evidence/09-timeout-profile.txt`：`git-capabilities` 冻结名测试阶段耗时（超时适配依据）。
