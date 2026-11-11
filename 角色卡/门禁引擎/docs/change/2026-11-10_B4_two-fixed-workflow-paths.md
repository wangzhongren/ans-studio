# 门禁引擎 B4 记录：两条固定工作流路径（Shell v5 / 任务级 Git 写 / 临界区提交门）

- 日期：2026-11-10
- 角色：ANS 固定角色「门禁引擎」（roleId: 门禁引擎；独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 批次：**B4（迁移/废弃）——本角色批次**：`SHELL_RULES_VERSION="5"`、任务级 Git 写白名单
  （`git add`/`git commit -m`）、项目级临界区提交门（staged ⊆ writeSet；`git-critical-section-busy`）、
  Git 审计描述、写守卫 v5、本角色测试与记录。
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`ce3d56e8396756cb80c22609613e6139cb19fe15`
  （B0–B3.1 已提交；基线 `git status --porcelain -- src app test` 为空）
- 性质：**D1 实现批次记录**（自检，不替代 B2 独立验收）；未提交/未推送/未合并/未发布；
  未运行真实模型/Electron；未占用 9222/9223。
- 总判定：**本角色 B4 写集完成；`npm run typecheck` exit 0；`test/门禁引擎` 520/514/5/1
  （= 基线 499/493/5/1 + 新增 21 tests 全绿；5 个既有 known-red 同名同因、skip 不增）；
  写集外 diff=0；未新增依赖/客户门/角色。**

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| B1 验收（冻结；AC-21/AC-23/AC-25、T-09/T-14/T-15/T-19） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 行 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| 实现级方案 v1.3（§6.2 Shell v5 / §6.3 提交门禁细节 / §6.5 旧机制处置 / §9.2） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 行 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| G-IR 接口评审（MF-IR-8/§九；requestReleaseMerge 不支持新增） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 行 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |

三份依据实测 hash 与任务给定值一致（证据 02）。

## 二、B4 实施内容（对照任务条目）

### 2.1 规则集 v5（`src/common/门禁引擎/classify-shell.ts`，M）

- `SHELL_RULES_VERSION` `"4"` → **`"5"`**；`defaultShellRules().id` → **`ans-default-v5`**（规则数据变化）。
- **v4 只读白名单逐字保留**：`matchReadonlyGit` / `buildReadonlyGitBody` 未改；只读 Git 判定位置、
  ruleId（`allow:readonly:git:<id>`）与实际执行体单一来源不变。
- **旧规则集 fail-closed**：v4/v3/v2 规则集因版本不符整条拒绝（`deny:rules-invalid`），**不静默放宽**；
  迁移必须用 `defaultShellRules()` 的 v5（测试断言 v4/v3 整条拒绝）。
- **新增任务级 Git 写 matcher** `matchTaskGit(argv, facts)`（纯函数，**唯一实现**）：
  - `git add <literal paths…>`：每个 token 必须是**字面**项目相对路径（复用只读 Git 的
    `isReadonlyGitPath` 同一实现：拒绝 `-A/--all/-u/-p/--` 等任何 flag、`.`/`./x`、通配 `*?[]`、
    pathspec magic `:`/`:(glob)`/`:(exclude)`、绝对路径/盘符/反斜杠/`..`/`.git` 段/空段），且
    逐路径 ⊆ 任务 writeSet（目录范围以 `/` 结尾；覆盖判定 `taskGitPathCovered` = 既有 `gitCovered` 同一口径）；
  - `git commit -m <message>`：**只允许** `-m` 单形态；拒绝 `-F -`/`-F <file>`/`--file`/`--amend`/
    `--no-verify`/`-a`/`--all`/`--author`/`-am`/`-G`/`--reuse-message`/多 flag/多参/空 message；
  - **无 taskGitScope / 无 writeSet 来源 / 事实非法 ⇒ add/commit 一律拒**
    （`git-task-scope-missing` / `git-task-scope-invalid`；模型不可自报事实）。
- **普通 Git 拒绝面**：push/fetch/pull/remote/tag/merge/rebase/cherry-pick/revert/reset/clean/checkout/
  switch/restore/stash/worktree/submodule/config/update-ref/symbolic-ref/init/rm/mv/am/apply/branch/
  update-index/gc/filter-branch/notes/replace/prune/repack/sparse-checkout/maintenance 等硬拒
  （稳定码 **`git-command-not-ordinary`**；ruleId 仍为 `deny:raw-git-controlled-tools-required`，
  以保持 v4 旧断言逐字通过）。`git init` 只经应用 `BaselineGitPort`（shell 不允许）。
- **分类器上下文（加法）**：`classifyShellDetailed(argv, rules, context?: ShellClassifyContext)`；
  2 参调用逐字保持 v4 行为（裸 Git 写仍硬拒）。`classifyShell(argv, rules)` 冻结两参契约不变。
- **审计描述（加法）**：`ShellVerdict.code`（稳定失败码）与 `ShellVerdict.taskGit`
  （`template/result/code/taskId/workflowId/branch/paths/messageSha256/argvDigest`）——每条
  `git add`/`git commit`（**允许或拒绝**）都携带；`argvDigest` 为 `["git", ...argv.slice(1)]` 的 SHA-256，
  commit message 仅落 SHA-256、不落明文。既有审计字段不减少、不改写（见 §五写集外需求）。

### 2.2 项目级临界区提交门（`src/common/门禁引擎/task-git-gate.ts`，新）

- `runTaskGitCommit(input)`：**纯编排 + 全部注入**（锁 / staged 读取 / commit 执行），无 IO、不 spawn。
- 顺序（fail-closed）：① scope 校验（`git-task-scope-*`）→ ② `commitArgv` 必须命中 `matchTaskGit`
  的 **commit** 形态（纵深；否则 `git-commit-form-forbidden`）→ ③ 当前分支 = `ans/task/<workflowId>`
  （`git-branch-mismatch`）→ ④ 取**项目级临界区**（生产注入桌面 B3 同一把
  `acquireProjectGitCriticalSection`；占用 ⇒ **`git-critical-section-busy`**，不排队、不提交）→
  ⑤ **锁内**读 `git diff --cached --name-only -z`（固定 argv `TASK_GIT_STAGED_INSPECTION_ARGV`）并校验
  staged：非空（`git-staged-empty`）、逐路径字面（`git-staged-not-literal`）、非治理写区
  （`git-staged-governance-path`：`.ans/**`、`角色卡/**`、`docs/audit/**`、`docs/acceptance/**`）、
  ⊆ writeSet（`git-staged-outside-writeset`）→ ⑥ **同一锁内**执行 commit（检查与提交之间无释放点，
  消除检查-提交间隙）→ ⑦ `finally` 释放（成功/前置失败/异常三路都释放；异常释放后**如实抛出**）。
- `parseTaskGitStagedOutput(raw)`：NUL 分隔解析（`git diff --cached --name-only -z`）。
- 回归断言：锁在 `inspectStaged` 与 `commit` 期间均被持有；并发第二提交确定性 `busy`；
  staged 空/越界/治理写区/非字面均不提交且释放；inspect/commit 异常释放后抛出原错误。

### 2.3 写守卫 v5（`src/common/门禁引擎/shell-write-guard.ts`，M）

- `ShellWriteGuardInput.taskGitScope?`（应用注入；模型不可自报）。`program === "git"` 分支：
  - 只读 Git 白名单命中且非 `start_background_task` ⇒ pass（v4 逐字保留）；
  - **v5 追加**：`matchTaskGit` 命中且非后台 ⇒ pass（形状级；staged 内容与提交由 2.2 复核）；
  - 其余 Git 一律 `deny`（`shell-write-hard-deny`；无 scope 的 add/commit 仍拒）。
- 与分类器**共用同一 matcher 函数引用**（防「只改分类器、写守卫仍拒」的经典陷阱）；
  旧断言要求的 reason 关键词（`git_query`）与 code 保持。

### 2.4 未改（写集内复核）

- `src/service/governance-matrix/**`：B2 已完成 fixed 视图（本批零 diff，实测见证据 06）。
- `src/common/门禁引擎/governance-roles.ts`、`chief-workflow-v2.md`：B2 已完成（本批零 diff）。
- `checkGitPolicy`（legacy 结构化 Git 策略）未改；`git_query/git_candidate/git_publish`、
  `select_run_change`、`request_stable_write`、`submit_refactor`、`submit_version_change`、
  `request_version_decision` 等 legacy 工具**不注入 fixed** 的编排/桌面侧接线属其它 owner（本批复核规则层，
  未新增任何注入路径）。

## 三、v5 规则矩阵（实测，证据 07）

| 命令（scope = taskId + `ans/task/<wf>` + `["src/impl/"]`） | 判定 | ruleId | code |
| --- | --- | --- | --- |
| `git status` | allow | `allow:readonly:git:status` | — |
| `git log --output=x` | deny | `deny:raw-git-controlled-tools-required` | `git-command-not-ordinary` |
| `git add src/impl/a.ts` | allow | `allow:task-git:add` | — |
| `git add -A` | deny | 同上 | `git-task-add-flag-forbidden` |
| `git add ./src/impl/a.ts` / `src/*.ts` | deny | 同上 | `git-task-add-not-literal` |
| `git add other/x` | deny | 同上 | `git-task-path-outside-writeset` |
| `git add .ans/x` | deny | 同上 | `git-task-path-governance` |
| `git commit -m x` | allow | `allow:task-git:commit` | — |
| `git commit -F -` / `--amend` | deny | 同上 | `git-commit-argument-forbidden` |
| `git commit -m ""` | deny | 同上 | `git-commit-message-empty` |
| `git push` / `merge` / `reset` / `clean` / `checkout` / `switch` / `tag` / `update-ref` / `config` / `init` | deny | 同上 | `git-command-not-ordinary` |
| `git add …` / `git commit …`（**无 scope**） | deny | 同上 | `git-task-scope-missing` |

> `ruleId` 保持 v4 旧值是为了「旧断言不改」；v5 的可判别语义在 `code`（新增加法字段）与
> `taskGit` 审计描述中。AC-21 的 `git-command-not-ordinary` 由 `code` 承载。

## 四、验证结果

### 4.1 类型检查

- `npm run typecheck`：**exit 0**（证据 03；写后与收尾两次均 0）。

### 4.2 目标新测试（`test/门禁引擎/**`，新 2 文件 / 21 tests）

| 文件 | tests | 覆盖 |
| --- | --- | --- |
| `test/门禁引擎/classify-shell-v5.test.ts`（新） | 13 | v5 版本/v4-v3 拒绝；v4 只读白名单保留；`matchTaskGit` allow 矩阵；add flag/非字面/路径外/治理写区拒绝；commit `-F/amend/no-verify/-a/--author/空 message/多参` 拒绝；scope 校验；分类器无 scope 全拒；合法 scope allow + 审计描述；push/merge/reset 等 45 形态拒绝；脚本/re-shell 绕过仍拒；写守卫 v5；**ShellGate 审计行不减少**（add/commit allow 与普通 Git deny 各写一行）；v4 旧规则回归 |
| `test/门禁引擎/task-git-critical-section.test.ts`（新） | 8 | 固定 argv/NUL 解析；staged 校验矩阵；锁贯穿检查与提交；取锁前拒绝；busy；staged 失败不提交且释放；异常释放后抛出；并发确定性 busy |

- 定向复跑：**21/21 pass、0 fail、0 skip**（证据 04）。

### 4.3 `test/门禁引擎` before/after（同一命令：
`node --test --test-concurrency=1 --test-force-exit --test-reporter=tap test/门禁引擎/*.test.ts`）

| | 文件 | tests | pass | fail | skip |
| --- | --- | --- | --- | --- | --- |
| before（HEAD `ce3d56e`） | 47 | 499 | 493 | 5 | 1 |
| after（+2 新文件） | 49 | 520 | 514 | 5 | 1 |

- 失败名集合 **完全一致**（5 个既有 known-red；`FAILURE-NAME-SET-IDENTICAL`，证据 09）：
  1. `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`
  2. `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`
  3. `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`
  4. `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`
  5. `D-10：质检卡保留可选质量核对与截图上限，不要求录屏`
- 新增确定性失败 = 0；新增 skip = 0（skip 仍为 before 同一 `unreadable（权限）…`）。
- 说明：`readonly-git-matcher.test.ts` 在 after 全量 TAP 之后仅有一处注释/标题文字更新
  （无断言/行为变化），已单独复跑 **21/21 pass**（证据 04b）。

### 4.4 只读回归（写集外测试套件）

| 套件 | 结果 | 对照 |
| --- | --- | --- |
| `test/编排`（128 文件） | **1,299 / 1,273 pass / 24 fail / 2 skip** | 24 个失败名与 `角色卡/编排/docs/change/2026-11-10_B0_two-fixed-workflow-paths_evidence/fails-after.txt` **逐名一致**（`ORCH-FAILURE-SET-IDENTICAL`；证据 10） |
| `test/roles`（24 文件） | **275/275 pass / 0 fail / 0 skip** | 证据 11 |
| `test/runtime-core`（63 文件） | **586 / 549 pass / 33 fail / 4 skip** | 33 个失败名与 B3 证据 `角色卡/桌面窗口/docs/change/2026-11-10_B3_two-fixed-workflow-paths-desktop_evidence/runtime-core.tap` **逐名一致**（`RUNTIME-CORE-FAILURE-SET-IDENTICAL`；既有环境性红：`runtime-protection-scope-unknown` + Windows symlink EPERM + checkpoint/copy 旧红；证据 12） |
| shell 相关编排（`shell-post-audit`/`shell-readonly`/`shell-approval-wiring`/`shell-risky-order`/`readonly-git-transport`） | **51/51 pass** | 证据 13；`shell-post-audit.test.ts` 未改、全绿 |

## 五、写集外需求（**停止报告项**；本批未越权修改）

1. **事实注入接线（编排/运行时核心/桌面）**：`run-role.ts`/`shell-gate.ts` 需在会话/回合装配处捕获
   应用事实并构造 `taskGitScope`（`workflowService.inspectAssignedTask` + A 团队计划 writesets ∩ 模块属主 /
   B 派生写集），以第三参 `{ taskGitScope }` 调用 `classifyShellDetailed`、并向写守卫注入
   `ShellWriteGuardInput.taskGitScope`。
2. **公开出口**：`src/service/gate/shell-rules.ts`（Service 出口，非本角色写集）需再导出
   `matchTaskGit` / `task-git-gate` 的符号，供编排/运行时合法消费（生产消费者不得导入私有 `common/`）。
3. **审计落盘**：`src/common/编排/shell-audit.ts` 的 `ShellAuditRecord` 需追加可选 `taskGit?` 字段，
   `shell-gate.ts` 在构造审计行时投影 `ShellVerdict.taskGit`（`command/taskId/branch/paths/result/sha256`）。
   既有 `docs/audit/shell-gate.jsonl` 行为不变、只追加；未减少任何既有字段。
4. **临界区接线**：`run_shell` 的 commit 执行路径必须在 spawn 前调用
   `runTaskGitCommit`，并注入桌面 B3 的同一把 `acquireProjectGitCriticalSection`、
   `inspectStaged`（固定 argv `TASK_GIT_STAGED_INSPECTION_ARGV`）与 `commit`（规则层允许的固定 argv）。
   在该接线完成前，v5 规则层不会放行任何 `git add`/`git commit`（2 参调用/无 scope 恒拒，fail-closed）。

## 六、候选与写集

### 6.1 候选文件（本角色 B4 写集；raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts`（M） | `ea72fe6c6c634b32590d336fd63f0d2ec5a863a9ed885ac44827c94d21022081` | 185,782 | 2,508 |
| `src/common/门禁引擎/shell-write-guard.ts`（M） | `0f32dd50c39eb4f843c7d0c2adfcd939111412f009d2c33943cab70395f2411b` | 43,697 | 791 |
| `src/common/门禁引擎/task-git-gate.ts`（新） | `2446bf1107ef986c5c04ee04d55b83d28ebf8699422df747f4c8271b02181980` | 7,770 | 141 |
| `test/门禁引擎/classify-shell-v5.test.ts`（新） | `540841eb1e70f3bad0193dfcc9e759363fc4d73080543ba5b11fefbfbe9217bd` | 24,334 | 417 |
| `test/门禁引擎/task-git-critical-section.test.ts`（新） | `50156c9ef276d3267df5b00389858aece78cc029194e2a31755ee33347338802` | 13,540 | 323 |
| `test/门禁引擎/classify-shell.test.ts`（M） | `a8650621ae638da5cf645faa34e10ffc9a4a2bed52ba174f2fd0c3701b29bb72` | 36,500 | 698 |
| `test/门禁引擎/readonly-git-matcher.test.ts`（M） | `bc5e17152105be57fe259e13001ea703cdb7b14fc2823f846b634390a993e6a3` | 20,975 | 374 |

- 7 文件合计 **332,598 bytes / 5,252 行**；M 文件 numstat：
  classify-shell `+280/−14`、shell-write-guard `+27/−8`、classify-shell.test `+2/−2`、
  readonly-git-matcher `+13/−11`（合计 `+322/−35`）；新文件 141 + 417 + 323 行。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接的 SHA-256）：
  **`f01f9fb5ea37349dd085d10a68e495735d406b72b8ae062669521064cf3fb0a2`**（证据 08b）。
- 旧断言仅随规则数据同步 4 行（`classify-shell.test.ts` `"4"→"5"`、`ans-default-v4→v5`；
  `readonly-git-matcher.test.ts` 同 2 值 + v4 拒绝新增断言、标题/注释文字），未删除/未弱化任何断言。

### 6.2 写集外 diff=0（实测）

- `git status --porcelain -- src app test` 仅上述 7 文件（证据 06）。
- 零 diff 守卫路径：`src/common/gates`、`src/common/roles`、`src/pipeline`、`src/provider`、
  `src/common/编排`、`app`、`package.json`/`package-lock.json`（证据 06b）。
- `src/service/governance-matrix/**`、`src/common/门禁引擎/governance-roles.ts` 本批零 diff（B2 已完成）。
- 文档/其它：仅本记录与 `_evidence/`。

## 七、限制与披露

1. **临界区/事实注入/审计投影/Service 出口的跨 owner 接线未做**（写集外；§五）。本批交付的是
   规则层 + 可注入临界区门；接线完成前 v5 不会放行任何 Git 写（2 参调用/无 scope 恒拒）。
2. G-IR **MF-IR-8**（不新增 `requestReleaseMerge`）未被本批违反：`RoleToolId` 未改（仍 14 项），
   未新增工具/卡种/客户门。merge-main 执行属 B3（已提交）。
3. `git-command-not-ordinary` 等 v5 码为**新增 `ShellVerdict.code` 加法**；`ruleId` 保持旧口径
   （`deny:raw-git-controlled-tools-required`）以逐字保留 v4 旧断言。
4. `test/门禁引擎` 5 项 known-red 与基线同名同因（非本批写集），未修复、未恶化；
   `test/编排` 24 项、`test/runtime-core` 33 项既有红逐名一致（后者为已知环境性红）。
5. `test/runtime-core` 本工作树失败集与 B3 证据逐名一致；其 test 计数 586 vs B3 577 的差异来自
   HEAD 内 B3.1 之后新增用例，不是本批引入（失败名集合 diff 空）。
6. 未运行真实模型/Electron/真机全链；未占用 9222/9223；不构成 B2 验收或客户批准。
7. 记录内聚合哈希为逐文件表复算的派生值；如需复核以文件实测为准。

## 八、未提交声明

- 本记录与 `_evidence/` 仅写入本角色记录目录（任务精确写集）；**未 commit / 未 push / 未 merge /
  未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余引用 hash 均为写盘实测。

## 九、证据索引（同目录 `..._evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` | 基线 HEAD `ce3d56e` / 分支 / `src app test` 空状态 |
| `01-before-test-门禁引擎.tap` | before 全量 TAP（499/493/5/1） |
| `01-before-failure-names.txt` | before 失败名集合（5 个 known-red） |
| `02-basis-hashes.txt` | 三份依据写盘 hash/行数 |
| `03-after-typecheck.txt` | `npm run typecheck` exit 0 |
| `04-targeted-tests.tap` | 新增 21 tests TAP（21/21 pass） |
| `04b-readonly-matcher-after-final-edit.tap` | `readonly-git-matcher` 注释更新后复跑（21/21 pass） |
| `05-after-test-门禁引擎.tap` | after 全量 TAP（520/514/5/1） |
| `06-write-set-status.txt` | `git status --porcelain -- src app test`（7 文件） |
| `06b-outside-write-set-diff.txt` | 写集外零 diff 实测 |
| `07-v5-rule-matrix.txt` | v5 规则矩阵（24 形态实测判定/ruleId/code） |
| `08-candidate-hashes.txt` | 候选文件 hash/bytes/lines + M 文件 numstat + 新文件 numstat |
| `08b-candidate-aggregate.txt` | 逐行 `path:sha256`、聚合 SHA-256（`f01f9fb5…`） |
| `09-after-failure-names.txt` | after 失败名原始行（5 个） |
| `09-after-failure-names-diff.txt` | before/after 失败名集合 diff（`FAILURE-NAME-SET-IDENTICAL`） |
| `10-after-test-编排.tap` | `test/编排` 全量 TAP（1299/1273/24/2） |
| `10-after-failure-names-编排.txt` / `...-diff-编排.txt` | 24 known-red 名称与 B0 基线逐名一致 |
| `11-after-test-roles.tap` | `test/roles`（275/275） |
| `12-after-test-runtime-core.tap` | `test/runtime-core`（586/549/33/4） |
| `12-after-failure-names-runtime-core.txt` / `...-diff-runtime-core.txt` | 33 失败名与 B3 证据逐名一致 |
| `13-after-test-shell-related.tap` | shell 相关编排 5 文件（51/51） |
