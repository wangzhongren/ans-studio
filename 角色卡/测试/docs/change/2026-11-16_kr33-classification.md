# KR-33 分类专项：冻结 known-red 33 逐名分类与修复批次（2026-11-16）

- 角色：ANS「测试」（roleId: 测试）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\kr33ana`（分支 `analysis/test-debt-kr33`，HEAD `d1f256f` = `origin/main`）
- 范围：**只分析、只写分类文档与证据**。未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- Canonical 名单：`角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-provider_evidence/14b-knownred-runtime-core.tap`（33 个顶层 `✖` 名，排除 `✖ failing tests:` 头；R2–R6 证据中 33 名逐名一致）。
- 既有分析：R2–R6 更新文档与 `_r2…_r6-evidence/`、`2026-11-12_release-blocker-triage.md`（§4.1 六名真红 / §4.2 二十五名）、B0/B7 记录、`B7.1 …09-readonly-suites/NOTES.txt`。
- CI 工件：R5 = `/tmp/r8-art/`（run 43829367008，`main @ a0baea22`，arm64+x64+Windows 完整）；R6 = `/tmp/r9-art/`（run 43848313583，`main @ 82dc180`，x64+Windows；arm64 job 级 cancelled 无工件）。原始大日志不入库。

## 0. 摘要

1. **分类计数：产品回归 1 / 环境·平台 27 / 测试假设过时 5**（合计 33）。
2. **本机工作树复现恰为 604 tests / 567 pass / 33 fail / 4 skipped**，失败名与 14b 冻结 33 **逐名一致（33/33）**。命令：`node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit "test/runtime-core/**/*.test.ts"`；`--test-force-exit` 只影响全部用例完成后的进程退出（R6 CI 亦使用），不改变执行/判定语义。
3. **同代码规范根对照（无 `.git` 的临时副本）为 604/592/8/4**：25 名直接转绿；2 名仍为本机 Windows symlink EPERM；6 名真实失败跨环境稳定。
4. **R5（三平台）与 R6（x64+Windows）中，本 33 名的结果逐名一致：27 名全绿、6 名全红**。R5 arm64 亦同一形态。
5. **关键事实：冻结 33 的 14b 基线本身是在 linked worktree（`release-v2.0.0-blockers-3`，`.git` 为文件）里采集的**。14b 的 33 个失败体构成为：26 个 `runtime-protection-scope-unknown`、3 个 Windows symlink `EPERM`、4 个真实断言失败。也就是说 **29/33 在冻结时是环境症状或环境掩盖**；规范根/CI 才暴露其中 2 个被掩盖的真实缺陷（D3 断言、Core-managed 重复 dispose），最终形成 CI 的 6 名真红。
6. **6 名真红的处置**：5 名是测试假设过时（dispatch 文案 ×2、D3、主干来源、doc-freeze 理由集），1 名是产品回归（Core-managed 绑定失败路径重复 dispose）。全部修复文件均落在 `角色卡/运行时核心/boundary.yaml` 写区（`src/**` 与 `test/runtime-core/**`），属主角色为**运行时核心**；测试角色只做独立分析与验证。
7. **门禁约束**：冻结 33 名必须**逐名转绿，不能改测试名/重建基线**。因此所有测试更新只改断言体与夹具，**保留冻结测试名原样**（即使标题含“直接写”“九类”等历史字样），并在测试体内加注释说明。

## 1. 数据源、方法与口径

| 代际 | 环境 | 命令/范围 | 结果 | 用途 |
| --- | --- | --- | --- | --- |
| B（本机工作树） | kr33ana（linked worktree，`.git` 为文件） | runtime-core 全量，120s timeout，force-exit | 604 / 567 / **33** / 4 | 任务口径复现；逐名错误体 |
| C（规范根对照） | `%TEMP%\kr33-canon`（`git archive d1f256f`，无 `.git`） | 同上 | 604 / 592 / **8** / 4 | 区分环境 vs 真实缺陷 |
| R5（CI 第四轮） | macOS arm64 / x64 / Windows x64 | `test/**/*.test.ts`，300s，全量 | 33 名中 27 ✔ / 6 ✖（三平台同形） | 平台形态与错误体 |
| R6（CI 第五轮） | macOS x64 / Windows x64（arm64 cancelled） | 同上，force-exit | 33 名中 27 ✔ / 6 ✖（两平台同形） | 最新 CI 证据 |
| 14b（冻结基线） | release-v2.0.0-blockers-3（linked worktree） | runtime-core 全量（2026-11-12） | 33 fail（26 scope-unknown + 3 EPERM + 4 断言） | Canonical 名单与冻结时错误体 |

- 依赖准备：kr33ana 本身无 `node_modules`；以目录联接复用 `refactor-session-ts-b7` 的 `node_modules`（`package.json`/`package-lock.json` SHA-256 与该祖先提交完全一致）。这是未跟踪的环境准备，不是仓库改动。
- 口径：本文件的“33 名”专指 **runtime-core 冻结 33**。注意 R6 文档中的“known-red 33（命中 62 中 33）”是另一个口径（gates 5 + 编排 24 + 少量），二者数字相同但集合不同，引用时勿混淆。
- 证据文件：`_evidence/00-run-metadata.txt`（命令与计数）、`01-kr33-master.tsv` / `02-kr33-master.json`（逐名全字段）、`03-name-set-diff.txt`（A/B/C/D 集合差）、`04-root-cause-probe.txt`（根因探针）、`05-ci-status-matrix.tsv`（逐平台状态）、`06-real-six-ci-error-bodies.txt`（6 名 CI 错误体摘录）、`07-source-evidence.md`（源码/文档/历史定位）。

## 2. 33 名逐条分类表

错误码/断言列：环境项给统一错误码；真实项给 CI/规范根断言。证据列：B=本机工作树（33 红），C=规范根对照（8 红），R5/R6=CI。完整字段（含冻结时错误与建议全文）见 `01-kr33-master.tsv`。

| # | 名称（冻结逐字） | 文件:行 | 错误码/断言 | 分类 | 证据 | 归属/批次 | 建议 |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `abort rejection no longer quarantines forever once the underlying turn settles later` | test/runtime-core/abort-quarantine.test.ts:26 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 2 | `abort rejection keeps quarantine when the underlying turn never settles` | test/runtime-core/abort-quarantine.test.ts:59 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 3 | `normal abort without cleanup failure keeps its existing quarantine lifecycle` | test/runtime-core/abort-quarantine.test.ts:81 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 4 | `dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行` | test/runtime-core/dispatch-workflow-writer-copy.test.ts:10 | ERR_ASSERTION: 旧文案 regex 不匹配 | 测试假设过时 | 本机B；C 红；R5/R6 红（06） | 运行时核心 / K3 | K3 按现文案/stable-write 契约更新 |
| 5 | `dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」` | test/runtime-core/dispatch-workflow-writer-copy.test.ts:29 | ERR_ASSERTION: 旧文案 regex 不匹配 | 测试假设过时 | 本机B；C 红；R5/R6 红（06） | 运行时核心 / K3 | K3 按现文案/stable-write 契约更新 |
| 6 | `Pi env 300s/310s reach the Provider inspection option while the Service turn timer uses the fixed 1h last resort` | test/runtime-core/effective-timeouts.test.ts:36 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 7 | `Service explicit Pi timing overrides env, including the legacy disabled-timer values` | test/runtime-core/effective-timeouts.test.ts:55 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 8 | `all runtimes read the same inspection env; Service still uses the fixed 1h last resort` | test/runtime-core/effective-timeouts.test.ts:120 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 9 | `D3 linked workspace root remains usable; linked target itself is not replaced` | test/runtime-core/file-write-safety.test.ts:97 | /符号链接/ ≠ [file-write-protection] symbolic-link target | 测试假设过时 | 本机B；C 红；R5/R6 红（06） | 运行时核心 / K3 | K3 断言保护码 + 能力守卫 |
| 10 | `R12 every real Core bind shares the host lease and registry; in-progress/active/disposed actors remain visible` | test/runtime-core/git-capability-tools.test.ts:739 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 11 | `R12 interruption during async factory preparation prevents the subsequent native bind` | test/runtime-core/git-capability-tools.test.ts:770 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 12 | `R12 actual shell/governance judge tool modes and a direct interpretation actor all enter the Core registry` | test/runtime-core/git-capability-tools.test.ts:783 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 13 | `actual Service registry snapshots bind the instance and do not convert empty capabilities into confinement proof` | test/runtime-core/git-capability-tools.test.ts:985 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 14 | `R8 a custom factory cannot self-report the default Codex Chat production provenance` | test/runtime-core/git-capability-tools.test.ts:1022 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 15 | `R8 native registry/instance/role/runtime/activity mismatches remain unknown` | test/runtime-core/git-capability-tools.test.ts:1039 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 16 | `R8 active HTTP inference alone is not treated as an uncontrolled execution program` | test/runtime-core/git-capability-tools.test.ts:1068 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 17 | `active and disposed prompt rejections have no turn acknowledgement` | test/runtime-core/prompt-start-acknowledgement.test.ts:69 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 18 | `quarantined prompt rejection has no acknowledgement after one stopped actual turn` | test/runtime-core/prompt-start-acknowledgement.test.ts:85 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 19 | `synchronous acknowledgement throw yields one failed terminal, zero native work, and releases the turn` | test/runtime-core/prompt-start-acknowledgement.test.ts:104 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 20 | `acknowledged turns keep aborted/timed_out outcomes and single matching terminal` | test/runtime-core/prompt-start-acknowledgement.test.ts:123 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 21 | `Service 三键读取注入：set ⇒ 注入 RuntimeProviderOptions.reasoningEffort（规范形）` | test/runtime-core/reasoning-effort.test.ts:87 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 22 | `未设/空串 ⇒ 字段缺席（逐字现状的机读形态，而非 undefined 值）；demo 恒缺席` | test/runtime-core/reasoning-effort.test.ts:99 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 23 | `非法值 ⇒ 按未设处理（零参数）＋诊断如实；空串静默不诊断；绝不毁会话` | test/runtime-core/reasoning-effort.test.ts:111 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 24 | `诊断自身故障不改变执行（绝不毁会话）；跨键不串（设 claude 键对 codex 会话零影响）` | test/runtime-core/reasoning-effort.test.ts:128 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 25 | `store: traversal, mismatched scope and symlinked runtime directories rejected` | test/runtime-core/session-store.test.ts:46 | EPERM symlink | 环境（symlink权限） | 本机B+C EPERM；R5/R6 绿 | 运行时核心 / K4 | K4 能力探测/junction |
| 26 | `store: native validation stays lazy and native symlink is rejected before effects` | test/runtime-core/session-store.test.ts:58 | EPERM symlink | 环境（symlink权限） | 本机B+C EPERM；R5/R6 绿 | 运行时核心 / K4 | K4 能力探测/junction |
| 27 | `outer timeout remains timed_out when abort cleanup emits inner aborted terminals` | test/runtime-core/session.test.ts:377 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 28 | `outer aborted result stays aborted and a settled underlying lifts quarantine despite failing cleanup` | test/runtime-core/session.test.ts:404 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 29 | `Core-managed binding rejects a provider that did not register its display profile before first prompt` | test/runtime-core/session.test.ts:439 | 2 !== 1（disposed 计数） | 产品回归 | 本机B；C 红；R5/R6 红（06） | 运行时核心 / K2 | K2 删除重复 inner.dispose |
| 30 | `R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget` | test/runtime-core/submit-capability-tools.test.ts:503 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 31 | `R2 chief timeout is finite and normal sessions still receive injected narrow capabilities` | test/runtime-core/submit-capability-tools.test.ts:537 | runtime-protection-scope-unknown | 环境（worktree根） | 本机B；C 绿；R5/R6 绿 | 运行时核心 / K1 | K1 中性根 |
| 32 | `主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3）` | test/runtime-core/trunk-contract.test.ts:80 | deepEqual: 多 team-plan | 测试假设过时 | 本机B；C 红；R5/R6 红（06） | 运行时核心 / K3 | K3 期望加入 team-plan |
| 33 | `doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6）` | test/runtime-core/version-change-contract.test.ts:176 | 10 !== 9 | 测试假设过时 | 本机B；C 红；R5/R6 红（06） | 运行时核心 / K3 | K3 10类/三分区 |

## 3. 分类判定

### 3.1 环境 / 平台（27 名）

#### E1：linked worktree 的 `.git` 文件 → `runtime-protection-scope-unknown`（25 名，#1-3、#6-8、#10-24、#27-28、#30-31）

- **根因链**：测试把 `projectRoot: process.cwd()`（及 `skillRoot`）传给 `createRuntimeAdapter(...).bindRole/composeContext`。在 linked worktree 中 cwd 的 `.git` 是文件（`gitdir: …`）；`src/provider/trunk/impl/git-command.ts:971` 的 `readGitHostProtectionRequirement` 对非“普通目录”的 `.git` 抛 `git-association-protection-requirement-unknown`，`src/service/runtime/session.ts:232` 将其归一为 `state:"unknown"`，`:1277/:1297-1298` 抛 `runtime-protection-scope-unknown`。
- **探针证据**（`_evidence/04-root-cause-probe.txt`）：`.git` 文件 ⇒ unknown；无 `.git` 或 `.git` 目录 ⇒ unmanaged；纯字符串/大小写/realpath 差异均不是变量。
- **对照**：同代码规范根（无 `.git`）下 25 名全部通过（604/592/8/4）；R5 三平台与 R6 两平台均 25 名 ✔。
- **判定**：这是**产品既有的 fail-closed 安全口径**（`.git` 为文件/链接时保护范围未知，不得当作 unmanaged），不是产品缺陷；也不属于“测试假设过时”的语义期望问题，而是测试夹具依赖了 checkout 形态。按任务分类归**环境/平台**。
- **适配方式（K1）**：在这 7 个测试文件中，把 `projectRoot`/`skillRoot` 从 `process.cwd()` 改为**中性临时根**（`mkdtemp`，无 `.git`），或加一个共享 helper（可放 `test/runtime-core/fixtures.ts`）。断言、超时与错误期望全部不变；不改产品的保护范围判定。
- **为何不是产品放宽**：`release-policy.mjs:16` 与 B3-2b 明确把 `.git` 为文件/链接列为 fail-closed 负例；放宽会削弱受保护范围判定。B7.1 也以“中性 cwd”作为该环境的既定适配方式。

#### E2：Windows 本机符号链接权限（2 名，#25-26）

- `test/runtime-core/session-store.test.ts:46/:58` 在准备阶段 `fs.symlink(..., "dir")`；本机无 `SeCreateSymbolicLinkPrivilege` ⇒ `EPERM`（构造未完成，断言不可达）。规范根复跑仍 EPERM；R5 arm64/x64 与 R6 x64/Windows CI 均 ✔（runner 具备符号链接能力）。
- **适配方式（K4）**：创建链接前做能力探测；Windows 优先改用 `junction`（`lstat().isSymbolicLink()` 对 junction 为 true，仍验证“链接目录被拒绝、外部目录零写入”的语义），无权限时按诊断跳过；断言不放宽。

### 3.2 测试假设过时（5 名）

| # | 当前真实语义（代码/契约） | 旧期望 | 更新建议 |
| --- | --- | --- | --- |
| 4/5 | `schema.ts:752/758/761/774`：跨角色实现前准备 `docs/contracts/…` 与**运营职责内的** `docs/workflow.md`；按地址引用不内嵌；缺失（旧项目过渡期）不拒投。`request_stable_write`（`schema.ts:1818-1840`）以客户 stable-write 确认卡为写路径（C1d AC-33）。 | `/工作流由**运营（convener）**落盘到 docs/workflow.md/`、`/Section 1 预授权、直接写即可/`、`/先落盘再派发/`、`/**再**派发任务/`；反断言“不得声称写盘经确认制”。 | 按现文案更新为语义断言：运营负责 `docs/workflow.md`、跨角色实现前准备、按地址引用、缺失容忍；删除/改写已被 stable-write 契约取代的“直接写/不得确认制”断言。**测试名不改**。 |
| 9 | `tools.ts:597-609` `finalFileProtection` 对符号链接目标返回 `[file-write-protection] symbolic-link target`；e71501c 引入。同文件 D3 ENOTDIR 用例（B6a 更新）已断言英文 `canonical identity unavailable; no write (ENOTDIR…)`，说明英文 reason code 是现行测试口径，#9 是残留中文断言。 | `/符号链接/`。 | 断言稳定保护码 `\[file-write-protection\] symbolic-link target`，保留“目标未被替换、原内容不变”的强断言；加 symlink 能力守卫。**测试名不改**。 |
| 32 | `src/model/trunk.ts:36-45` `TRUNK_SOURCES` 含 `team-plan`（7 源）；`api-spec.md:217` 明确“增 team-plan 真实计划发布来源，不能伪产品 upgrade”。 | 6 源（缺 `team-plan`）。 | 期望集加入 `team-plan`；保留 `main-upgrade` 负例与 bootstrap/recovery/upgrade 显式断言。**测试名不改**。 |
| 33 | `src/model/version-change.ts:196-235`：`DOC_FREEZE_REASONS` 10 个，含 `role-direct-applied`；customer 5 / application 4 / direct 1；judge-delegated 只是 customer 子集。`api-spec.md:187/209` 明确新增 direct reason。 | 9 类、customer+application 两分区穷尽。 | 改为 10 类、三分区互斥且并集==全集；保留 `migrated-draft` 非 reason、migration marks、baseline event kinds。**测试名不改**。 |

补充：dispatch 文案的旧断言不仅 regex 过期，其中“不得声称写盘经确认制”与当前 `request_stable_write` 的客户确认卡路径**方向相反**；更新前需 owner（运行时核心）确认 2026-11-04 “Section 1 预授权、直接写”决定已被 2026-11-04 C1d（stable-write 确认即写）取代。若 owner 认为旧决定仍须保留字面，则改为产品文案恢复（同属运行时核心写区），但这与现行 stable-write 工具说明冲突，风险更高。

### 3.3 产品回归（1 名，#29）

- 测试：`session.test.ts:439-447`，fixture 统计 `disposed`，断言 `native=0 && disposed=1`。
- 产品：`session.ts:750-765`。`bindRole` 成功后 `constructed = inner`（:751）；`assertReady()` 失败时内层 catch **先** `await inner.dispose()`（:752）并抛出；外层 catch **又** `await constructed?.dispose()`（:763）。同一 inner 被 dispose 两次。
- 历史：内层 dispose 来自 `6e515893`（2026-10-22）；`constructed` + 外层 dispose 来自 `e71501ca`（2026-11-07）。测试早于 e71501c，故这是 e71501c 引入的**可观察清理行为回归**。
- 证据：R5 arm64/x64/win 与 R6 x64/win 全部 `2 !== 1`（session.test.ts:446:33）。
- **最小修复（K2）**：删除 `:752` 的 `await inner.dispose()`（外层 catch 已覆盖同一 `constructed`），保持 native=0、dispose 恰一次、失败态被如实记录。若 owner 裁定“dispose 幂等、允许两次”，需在契约中显式声明并说明放弃 exactly-once 断言的理由；默认不建议。

## 4. 修复归属与执行批（可并行写区）

**归属**：33 名的产品与测试文件全部在 `角色卡/运行时核心/boundary.yaml` 的写区（`src/model/*`、`src/service/runtime/session.ts`、`src/provider/runtime/*`、`test/runtime-core/`）；**属主角色均为运行时核心**。测试角色（本专项）只读分析并写本记录；不越界改代码/测试。若协调方希望由测试角色执行 K1/K3/K4 的测试夹具改动，需先经治理更新 `角色卡/测试/boundary.yaml`（当前测试写区仅 `test/测试/`），否则违反写边界；本记录不建议绕边界。

**并行写区**：四个批的文件集合两两不相交（K1 与 K2 分别动 test 与 src；K3/K4 的测试文件互不重叠），可并行；仅 K1 与 K2 的**验证**建议先有中性根或规范根（见下）。

| 批 | 目标名 | 文件清单（相对仓库根） | 预计改法 | 验证门槛 |
| --- | ---: | --- | --- | --- |
| K1 | 25（#1-3、#6-8、#10-24、#27-28、#30-31） | `test/runtime-core/abort-quarantine.test.ts`、`effective-timeouts.test.ts`、`git-capability-tools.test.ts`、`prompt-start-acknowledgement.test.ts`、`reasoning-effort.test.ts`、`session.test.ts`、`submit-capability-tools.test.ts`（可加 `fixtures.ts` helper） | 中性临时根替代 `process.cwd()` 作为 `projectRoot/skillRoot`；不改断言 | 在 kr33ana 工作树定向跑 7 文件 3×：25 名全绿、无新红；规范根对照仍 8 红（或更少）；typecheck 0 |
| K2 | 1（#29） | `src/service/runtime/session.ts` | 删除 assertReady 失败路径的重复 `inner.dispose()`（或加一次性 dispose 保护） | `session.test.ts` 在规范根/中性根 3×：Core-managed 名绿、disposed=1、native=0；邻近 bindRole 用例无新红；typecheck 0 |
| K3 | 5（#4/5、#9、#32、#33） | `test/runtime-core/dispatch-workflow-writer-copy.test.ts`、`file-write-safety.test.ts`、`trunk-contract.test.ts`、`version-change-contract.test.ts` | 按 §3.2 更新断言；测试名逐字保留；D3 加 symlink 能力守卫 | 4 文件在规范根/CI 形态 3×：5 名全绿；D3 在无 symlink 权限机按诊断跳过而非红；typecheck 0 |
| K4 | 2（#25-26） | `test/runtime-core/session-store.test.ts` | symlink 能力探测；win32 用 junction 或诊断跳过 | 本机 3×：2 名绿或按诊断 skip（非 fail）；CI 形态保持绿；断言不放宽 |

**建议执行顺序**（按“CI 真红优先、环境批量随后”）：

1. **K3 + K2 并行**（4+1 文件，互不相交）：先消灭 CI 两平台 6 名 runtime-core 真红中的 5+1；此后再跑 R7 CI，runtime-core 应 0 红。
2. **K1**（7 文件）：处理 25 名工作树环境红，使本机 frozen 33 逐名转绿；可与 K2 验证共用中性根 helper。
3. **K4**（1 文件）：处理本机 symlink 2 名；CI 已绿，优先级最低。

若发布门禁要求在**本机工作树**直接看到 33/33 绿，则 K1/K4 必须与 K2/K3 同批完成；若门禁以**规范 checkout/CI** 为准，则 K3+K2 已使 33 名中的 27 名（CI 已绿）+ 6 名（修复后）全部在 CI 绿，K1/K4 属于本机复现口径的适配。

## 5. 风险与未决项

1. **禁止重建基线**：33 个冻结名必须逐名转绿。K3 的测试更新**不得改测试名**（含“直接写”“九类”等历史标题）；否则旧名消失、等于重建基线。建议在测试体内加注释说明标题为历史名、语义按当前契约。
2. **dispatch 文案的决策归属**：旧测试反断言“不得声称写盘经确认制”，与当前 `request_stable_write` 的客户 stable-write 确认卡方向相反。需 owner 明确 2026-11-04 “直接写”决定与同日 C1d“确认即写”的优先关系；默认按现行产品（stable-write）更新测试。
3. **D3 文案语言**：当前 reason code 为英文（`[file-write-protection] symbolic-link target`）。若 owner 要求用户可见中文，需产品侧本地化 reason（运行时核心），测试再断言中文；否则按稳定码更新测试。两种都能转绿，但不能两边都不改。
4. **Core-managed 清理契约**：产品修复默认“dispose 恰一次”。若 owner 裁定重复 dispose 可接受，则需修改测试并记录理由；不建议静默放宽。
5. **K1 夹具语义风险**：`process.cwd()` 改中性根后，个别测试若隐含依赖仓库根（例如读取角色卡/skill 文件、受保护根）可能改变行为。7 个文件需逐个 3× 验证；`skillRoot` 同步替换为同一中性根，避免“项目根中性、技能根仍是工作树”的半吊子形态。
6. **门禁环境口径**：冻结 33 是在 linked worktree 里采的（29/33 为环境/掩盖），当前 CI 只红 6。建议 R7 收口时以**规范 checkout/CI** 为发布判据，同时保留本机 33 名逐名证据（K1/K4 后）；两者都不得重建基线。
7. **arm64 缺口**：R6 arm64 job 级 cancelled 无工件；R5 arm64 与另两平台同形（27 ✔ / 6 ✖）。R7 应重跑 arm64 补齐三平台结论。
8. **口径混淆**：R6 文档“known-red 33（62 中命中 33）”与本专项“runtime-core 33”集合不同；引用时注明来源（14b vs R6 §2）。
9. **symlink 权限**：本机无法验证依赖符号链接的断言路径（D3/store）；K3/K4 的能力守卫必须保证“无权限 ⇒ 诊断 skip”，不得把环境限制当成产品通过。

## 6. 验证口径（修复后）

1. **本机工作树（kr33ana，任务口径）**：`node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit "test/runtime-core/**/*.test.ts"` 3× 自然完成；期望 604/604 pass、0 fail、4 skipped（或按诊断 skip 的 D3/store 项以 skip 呈现且非 fail）；冻结 33 名逐名状态全部为 ✔ 或显式 diagnostic skip（仅限平台能力项），**不得有 ✖**。
2. **规范根对照**：同一命令 3×；期望同口径 0 fail（D3/store 在无权限机为 diagnostic skip）。
3. **CI R7（三平台）**：`test/**/*.test.ts` 全量；runtime-core 6 名真红清零；arm64 重跑补齐；记录 tests/pass/fail/cancelled/skipped 与唯一 ✖ 名。
4. **三套冻结 known-red**：runtime-core 33 逐名 diff（33→0）；gates 5 / 编排 24 保持既有集合、无新增红（本轮不触碰）。
5. **静态**：`npm run typecheck` EXIT=0；改动仅限 K1–K4 列出的文件，无跨写区/角色卡/配置/workflow 改动。
6. **证据**：每批保留目标文件 TAP/日志（原始大日志不入库，仅存派生错误体与计数），并在批记录中给出文件列表与 SHA-256。

## 7. 约束声明与产物

- 本专项只分析、只写文档/证据；未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 产物：本文件 + `_evidence/00-run-metadata.txt`、`01-kr33-master.tsv`、`02-kr33-master.json`、`03-name-set-diff.txt`、`04-root-cause-probe.txt`、`05-ci-status-matrix.tsv`、`06-real-six-ci-error-bodies.txt`、`07-source-evidence.md`。
- 原始大日志（R5/R6 工件、两次全量 TAP）未入库；证据目录仅保留派生表、探针输出与 6 名错误体摘录。
