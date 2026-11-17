# R9 批次 E3：最后一次有界预算调整（team-plan per-test 600s；Q2 P2 child 900s / 父 960s）

- 日期：2026-11-17
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9i`（分支 `fix/test-debt-r9i`，起点 `e437154` = `origin/main`，含 A2 `d27a34e` + E2 `26ccd24`）
- 写区（仅这些）：`test/编排/git-capabilities.test.ts`、`test/测试/git-role-workflows-e2e.test.ts`；本记录。
- 输入（只读）：协调者任务书（R9-E3，执行**最后一次**有界预算调整）；收官轮 v2 attempt 2 实况（run **43993937915**，三平台同 SHA `e437154`）；A2 记录 `2026-11-17_r9-a2-team-plan-budget.md`；E2 记录 `2026-11-17_r9-e2-q2-tail-stage.md`。
- 边界：未改产品 `src/**`、`app/**`、`.github/**`（含 `test-ci.yml`）、release-policy、main；未改 `test/测试/git-role-workflows-driver.ts`；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占用 9222/9223/9224。
- 本机环境：Windows 11 / Node v24.22.1。

## 0. 摘要

1. **依据（收官轮 v2 attempt 2，run 43993937915，三平台同 SHA `e437154` 全量）**：arm64 与 Windows 全绿；x64 fail 1 + cancelled 1，且两条残差均为**纯超时**（无断言失败）——`Git team plan publication…` 恰 300,001.6ms 触顶当前 per-test 300s，`Q2 P2 first new project…` 恰 540,046.2ms 触顶 child 绝对预算 540s。
2. **协调者裁决**：拆 528 步串行链测试代价过大，测量已充分证明是平台性能差；做**最后一次**有界预算调整（E3）。
3. **改动（两文件，零断言/零语义）**：
   - `test/编排/git-capabilities.test.ts`：team-plan 用例 per-test `300000` → **`600000`**。
   - `test/测试/git-role-workflows-e2e.test.ts`：`q2P2ChildAbsoluteBudgetMs` `540000` → **`900000`**；`q2P2WholeTestBudgetMs` `600000` → **`960000`**（仍保留 60s 结果核验/拆解余量）；同文件全部派生常量/断言/注释审计并同步一致。
4. **本机定向验证（Windows）**：Q2 P2 **199,184.4ms 通过**（child 墙钟 198,975ms，watchdog 未触发，budget 记录 `wholeTestMs=960000`、child deadline−START 恰 900,000ms，E2 四子段全部 `resolved`）；team-plan **132,087.7ms 通过**；`npm run typecheck` EXIT 0。
5. **硬上限（已写入两文件注释与本记录）**：这是最后一次预算调整；若 x64 仍超 600s（team-plan）/ 900s（Q2 P2）→ **必须拆测试或转产品候选，不得再抬**。

## 1. 三平台实测（收官轮 v2 attempt 2，run 43993937915，同 SHA `e437154`）

| 平台 | job 结果 | `Git team plan publication…` | `Q2 P2 first new project…` |
| --- | --- | --- | --- |
| arm64 | success | 133.8s 通过 | 218.2s 通过 |
| Windows | success | 186.9s 通过 | 311.2s 通过 |
| x64 | fail 1 + cancelled 1 | **300,001.6ms 触顶**（纯超时，无断言失败） | **540,046.2ms 触顶 child 绝对预算**（纯超时） |

- x64 同链明显慢于 arm64/Windows（协调者裁定口径：慢 2.5–3×）。
- 由触顶值可直接算出的**下界**（触顶时真实耗时不可知，只能确定 ≥ 上限）：team-plan ≥2.24×（vs arm64）/ ≥1.61×（vs Windows）；Q2 P2 ≥2.47×（vs arm64）/ ≥1.74×（vs Windows）。注释按协调者裁定写「慢 2.5–3×」。
- 定性：两条残差均为预算触顶（`test timed out` / case 绝对预算耗尽），**非断言失败、非产品缺陷**；arm64/Windows 同 SHA 同用例全绿佐证。

## 2. 改动（两文件；旧值 → 新值 / 依据）

### 2.1 `test/编排/git-capabilities.test.ts`（diff：`6 insertions(+), 2 deletions(-)`）

| 位置 | 项 | 旧值 | 新值 | 依据 |
| --- | --- | ---: | ---: | --- |
| `:526` | team-plan 用例 per-test timeout | `300000` | **`600000`** | x64 300,001.6ms 触顶（完成即超旧上限）；arm64 133.8s / Windows 186.9s；末次调整 |

- 用例上方注释（`:515` 起）保留 A2 历史；以 R9-E3 段替换原「若 300s 仍触顶」行：记录三平台实测数字、x64 慢 2.5–3×、这是最后一次预算调整、若 x64 仍超 600s → 拆测试或转产品候选，不得再抬。
- 测试名逐字未动；零断言改动、零测试增删、零语义改动。

### 2.2 `test/测试/git-role-workflows-e2e.test.ts`（diff：`14 insertions(+), 7 deletions(-)`）

| 位置 | 项 | 旧值 | 新值 | 依据 |
| --- | --- | ---: | ---: | --- |
| `:1319` | `q2P2ChildAbsoluteBudgetMs`（子进程硬预算） | `540000` | **`900000`** | x64 恰 540,046.2ms 触顶；arm64 218.2s / Windows 311.2s；末次调整 |
| `:1318` | `q2P2WholeTestBudgetMs`（父测试显式 timeout） | `600000` | **`960000`** | child 900s + 60s 结果核验/拆解（差值语义保持不变） |

同文件派生点审计（均随两常量自动一致，无需改字面值）：

| 派生点 | 位置 | 机制 | 结果 |
| --- | --- | --- | --- |
| outer deadline 默认 | `:1332` | `suppliedOuter` 否则 `now + q2P2ChildAbsoluteBudgetMs + 30000` | 930,000ms（实测 outer−deadline = 30,000ms） |
| 子进程 deadline | `:1333` | `min(now + child, outerDeadlineAt − 30000)` | 900,000ms（实测恰 900,000ms） |
| child `caseDeadlineAt` | `:1404` | `min(now + firstNewBusinessTimeoutMs(), suppliedDeadlineAt)` | 受父给定 900s 界约束 |
| 子进程入口 sanity 上限 | `:3472` | `deadlineAt ≤ now + q2P2ChildAbsoluteBudgetMs` | 900,000ms |
| budget 记录 `wholeTestMs` | `:2340` | q26/默认路径取 `q2P2WholeTestBudgetMs` | 960,000（本次实测确认） |
| Q17 注释 | `:1428–1429` | 文本 `192 HTTP/600s` → `192 HTTP/960s`，补 E3 行 | 960s |
| E2 `remainingCase` 说明 | `:2247–2250` | 文本：历史 540s 标注「当时」；新裁决行 child 900s/父 960s + 硬上限 | 900s/960s |

- 其余相关注释同步：预算常量块新增 R9-E3 说明（三平台实测、x64 慢 2.5–3×、末次调整、硬上限）。零断言改动、零测试增删、测试名逐字未动；未改 `driver.ts`。

## 3. 硬上限声明（写入代码注释与本记录）

- team-plan：**若 x64 仍超 600s，必须拆测试或转产品候选，不得再抬。**
- Q2 P2：**若 x64 仍超 900s，必须拆测试或转产品候选，不得再抬。**
- 这是 R9 的**最后一次**有界预算调整；本轮之后不再有任何预算上调，只允许拆测试/转产品候选。

## 4. 本地验证（Windows 本机，定向）

### 4.1 Q2 P2（任务书指定命令，1 次，pass）

```bash
node --test --test-concurrency=1 --test-timeout=1200000 --test-name-pattern="Q2 P2" "test/测试/git-role-workflows-e2e.test.ts"
```

```text
✔ Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards (199184.3841ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 203153.1909
EXIT=0
```

- child 生命周期（`<caseTag>-child-lifecycle.json`）：START `2026-11-17T03:14:19.502Z` → SPAWN(pid 7820) → EXIT(exitCode 0, signal null) → CLOSE(exitCode 0, signal null)；`watchdogFired=false`；child 墙钟 **198,975ms**；**deadlineAt − START = 900,000ms**（deadlineAt `2026-11-17T03:29:19.502Z`，outerDeadlineAt `03:29:49.502Z`，恰 +30,000ms 保留）。
- `error-outcomes.json`：`primaryError:null / cleanupError:null / disposeCompleted:true / finalAssertionsCompleted:true / driverErrors:[]`；child-result `completed:true`。
- budget 记录（`<caseTag>-full-final-proof.json` 的 `extra.budget`）：

  ```json
  {"diagnosticQueueOnly":false,"httpRequests":256,"wholeTestMs":960000,"perObservationMs":240000,"retries":0,"expectedRequestsAtMost":180,"runnerIsolation":"none","diagnosticOnly":false}
  ```

  （`httpRequests:256`/`expectedRequestsAtMost:180` 是 Q39 child 信封既有路径——child 继承 `ANS_Q39_BUSINESS=1` 使 `q23Business` 成立；与 E3 无关、未改动。）
- stageTimeline：19 段全部 `resolved`；E2 四子段（`remainingCase=true`）实测：

  | outcome | label | budgetMs（case 剩余） | remainingCase | durationMs |
  | --- | --- | ---: | --- | ---: |
  | resolved | `actual worker surface / scoped write` | 820,351 | true | 11,739 |
  | resolved | `actual controller integration` | 808,612 | true | 13,642 |
  | resolved | `actual verifier review` | 794,970 | true | 3,210 |
  | resolved | `actual controller bounded stop / delivery` | 791,760 | true | 80,832 |

  - 四子段合计 109,423ms（E2 单轮实测 103,695ms，同量级）；`Q_BOUNDED_CASE_REMAINDER` 首条 `remainingMs=820351`——证明子段预算已是新 child 900s 的剩余量，而非旧 540s / 默认 240s。

### 4.2 team-plan（任务书指定命令，1 次，pass）

```bash
node --test --test-concurrency=1 --test-timeout=1200000 --test-name-pattern="Git team plan publication" "test/编排/git-capabilities.test.ts"
```

```text
✔ Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority (132087.7017ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 132434.1791
EXIT=0
```

### 4.3 静态检查

- `npm run typecheck`（`tsc --noEmit`）：**EXIT 0**（无输出错误行）。

### 4.4 清理

- 本次 Q2 P2 生成的证据目录 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence`（运行前**不存在**；本次运行生成 38 个文件）已**整体删除**，恢复运行前状态。
- 精确删除本次新增的 2 个临时根（运行前后对 `%TEMP%` 同名前缀快照 diff，新增恰 2 个）：
  - `%TEMP%\q2-git-first-bootstrap-SFbjho`（Q2 P2 夹具根，与 child START 同窗创建）；
  - `%TEMP%\ans-trunk-service-sJ7Cxd`（team-plan 夹具根）。
- 其余既有 `q2-git-*`（406 个）/ `ans-trunk-service-*`（8,293 个）为跨会话累计，**未动**；未做全量 temp 清扫。
- 工作树 `git status`：仅 `M test/测试/git-role-workflows-e2e.test.ts`、`M test/编排/git-capabilities.test.ts` + 本记录（untracked）。

## 5. 披露

1. **写区/边界（治理透明）**：`test/编排/git-capabilities.test.ts` 在 `角色卡/编排/boundary.md` Section 1 的 `test/编排/` 目录内，不在测试角色 Section 1（`test/测试/`）；本次由协调者 E3 任务书**明确授予两文件写区**，与已合入的 A2（`d27a34e`，PR #145）同法。本批仅预算数值与注释；若治理要求正式登记跨角色写区，请协调者/人事更新。
2. **平台边界**：仅 Windows 本机定向各 1 次 pass；arm64/x64 未在本机复现，收官轮 CI（含 x64）是权威验收。
3. **慢化比口径**：注释按协调者裁定写「x64 同链慢 2.5–3×」；由于 x64 两次均触顶，可算出的比值为下界（见 §1），真实耗时只能确定 ≥ 上限，故发生比例以 CI 收官轮为准。
4. **零断言/零语义**：两文件 diff 仅预算数值与注释；断言、测试名、流程、driver 及其余测试均未改；未删测试、未放宽阈值、未改 `driver.ts`。
5. **预算记录字段勿误读**：`httpRequests:256 / expectedRequestsAtMost:180` 为 Q39 child 信封既有语义（child 继承 `ANS_Q39_BUSINESS=1`），非本批变更；E3 只改 `wholeTestMs`（600000→960000）与 child 绝对预算（540000→900000）。
6. **历史注释保留**：E2 诊断中的 `child 540s 上限` 是当时事实，已标注「当时」；新裁决行记录现行 900s/960s 与硬上限，避免与现行值混淆。
7. **约束遵守**：未 commit/push；未触发 CI；未 tag；未碰 main；未改产品 `src/**`、`app/**`、`.github/**`（含 `test-ci.yml`）、release-policy；未读 `.env`；未占用 9222/9223/9224。
8. **未验项**：x64 是否在 600s/900s 内通过——本地无法复现 x64 慢机，只能由收官轮 CI 回答；若再次触顶，按 §3 硬上限处置。

## 6. 产物与复现

- 本记录 + 两个测试文件（仅预算与注释）。
- 复现命令：

  ```bash
  cd .claude/worktrees/fix-test-debt-r9i
  node --test --test-concurrency=1 --test-timeout=1200000 --test-name-pattern="Q2 P2" "test/测试/git-role-workflows-e2e.test.ts"
  node --test --test-concurrency=1 --test-timeout=1200000 --test-name-pattern="Git team plan publication" "test/编排/git-capabilities.test.ts"
  npm run typecheck
  ```
