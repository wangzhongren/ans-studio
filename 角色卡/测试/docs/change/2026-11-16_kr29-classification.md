# KR-29 分类专项：冻结 known-red 29（门禁 5 + 编排 24）逐名分类与执行批次（2026-11-16）

- 角色：ANS「测试」（roleId: 测试）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\kr29ana`（分支 `analysis/test-debt-kr29`，HEAD `5661a73` = `origin/main`，Node v24.22.1）
- 范围：**只分析、只写分类文档与证据**。未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。
- Canonical 名单：
  - 门禁 5 = `角色卡/运行时核心/docs/change/2026-11-10_B2_two-fixed-workflow-paths-evidence/07-gates-failure-names.txt`（CRLF 按 LF 比较）
  - 编排 24 = `角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-05-known-red-failnames.txt`（CRLF 按 LF 比较）
- 运行口径：门禁 `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"`（先临时 LF 归一 `src/common/门禁引擎/workflows/chief/chief-workflow.md` 与 `chief-workflow-v2.md`，跑后 `git checkout --` 还原并确认 CRLF/status 干净）；编排 `--test-concurrency=1 --test-timeout=120000`，137 文件主跑 + `git-trunk-store.test.ts` 单文件，允许 `--test-force-exit`（只影响全部用例结束后的进程退出，不改变执行/判定）。
- 既有分析：KR-33 分类记录（方法借鉴）、R2–R6 更新与证据、B0/B7 记录、2026-11-09 验收文档、2026-11-04/07/08/09 各角色变更记录。
- CI 工件：R6 run `43848313583`（`main @ 82dc180`），`/tmp/r9-art/test-logs-{mac-x64,win-x64}/test-ci-output.log`（只读；原始大日志不入库）。

## 0. 摘要

1. **分类计数：产品回归 1 / 环境·平台 1 / 测试假设过时 26 / 已转绿（冻结基线过期）1 = 29。**
2. **本机工作树复现**：门禁 **577 tests / 571 pass / 5 fail / 1 skipped**（94.9s），失败名与冻结门禁 5 **逐名一致（5/5）**；编排主跑 **1375 / 1350 / 23 / 2**（142.5s）+ `git-trunk-store` **13/13**（59.1s），冻结编排 24 中 **23 红、1 绿**（`wiring guards…`）。
3. **中性临时根对照**（`git archive HEAD` 到 `%TEMP%\kr29-canon`，无 `.git`）：15 个失败文件 + 5 个门禁文件的定向复跑为 **269 / 239 / 28 / 2**，28 个红名与工作树**逐名一致**；`wiring guards…` 两处均绿。**29 名中没有 linked-worktree `.git` 文件/`runtime-protection-scope-unknown` 类环境症状。**
4. **R6 CI（macOS x64 + Windows x64）**：29 名中 **27 名两平台均 ✖**；2 名两平台均绿（`node test外指符号链接…`、`wiring guards…`）。即这 27 名不是本机伪红，而是**正常 checkout 的 CI 真红**。
5. **集合算术**：R6 known-red-62 命中 33 = 门禁 5 + 编排 22 + runtime-core 6；缺失 29 = runtime-core 环境红 27 + 本套的 2 个绿名。与 R6 `08-set-summary.json` 的 `kr_not_current=29` 一致。
6. **关键定性**：28 个当前红名主要是产品语义在冻结后（多由 `e71501c` 2026-11-07、`3362acb` 2026-11-05、W3-G 2026-11-08、B16/B26 等）前移，而测试断言仍停在旧文案/旧通道/旧夹具；唯一产品回归是**空 `projectRoot` 触发 `realpath('')` ENOENT**；唯一环境项是本机 Windows 符号链接权限（CI 已绿）。
7. **冻结名约束**：所有测试更新必须**保留冻结测试名原样**（含“15 个活项目角色”“v4.1”“drops old taskId”等历史标题），只改断言体/夹具；不得改名/重建基线。唯一已绿的 `wiring guards…` 建议在 B7 重冻结时按 **REMOVED** 登记。

## 1. 数据源、方法与口径

| 代际 | 环境 | 命令/范围 | 结果 | 用途 |
| --- | --- | --- | --- | --- |
| L（本机工作树） | kr29ana（linked worktree，`.git` 为文件） | 任务口径：门禁全量（LF 归一）+ 编排 137 文件 + git-trunk-store 单文件 | 门禁 577/571/**5**/1；编排 1375/1350/**23**/2 + 13/13 | 冻结名逐名复现与错误体 |
| C（中性根） | `%TEMP%\kr29-canon`（`git archive HEAD`，无 `.git`） | 20 个失败文件定向，同参数 | 269/239/**28**/2，失败名与 L 一致 | 排除 linked-worktree 症状 |
| R6（CI） | macOS x64 / Windows x64 | `test/**/*.test.ts` 全量（run 43848313583，`main @ 82dc180`） | 29 名：**27 红 / 2 绿**（两平台同形） | 平台形态与真实 CI 证据 |
| B0/B7（冻结基线） | c234e79 快照工作树 | 门禁 LF 归一全量；编排拆分口径 | 门禁 577/571/5/1；编排 1373/1347/24/2 | 冻结来源与历史一致性 |

- 依赖准备：kr29ana 无 `node_modules`；以目录联接复用 `refactor-session-ts-b7` 的 `node_modules`（`package.json` SHA-256 `c37e1e49…`、`package-lock.json` `a5e315ca…` 与 kr29ana 完全一致）。未跟踪的环境准备，不是仓库改动。
- 证据文件：`_evidence/00-run-metadata.txt`（命令/计数/还原确认）、`01-kr29-master.tsv` / `04-ci-status-matrix.tsv`（29 名全字段与两平台状态/首错）、`02-name-set-diff.txt`（集合差）、`03-error-bodies-local.txt`（逐名错误体摘录）、`05-source-evidence.md`（代码/api-spec/历史定位）、`06-neutral-root-comparison.txt`、`07-batch-plan.tsv`。原始大 TAP/日志不入库。

## 2. 29 名逐条分类表

错误列为本机工作树（门禁为 LF 归一后）的首个断言/错误；CI 列见 `04-ci-status-matrix.tsv`（27 名两平台同错，2 名两平台绿）。

| # | 套 | 名称（冻结逐字） | 文件:行 | 错误码/断言 | 分类 | 归属/批次 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | G | `D-10：质检卡保留可选质量核对与截图上限，不要求录屏` | test/门禁引擎/view-image-cards.test.ts:32 | match `/可选质量核对/` 不中（现卡文为“独立质量核对”；证据上限/不要求录屏仍在） | 测试假设过时 | 门禁引擎 / A |
| 2 | G | `listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留` | test/门禁引擎/role-group-metadata.test.ts:47 | `23 !== 15`（非内置角色 23） | 测试假设过时 | 门禁引擎 / A |
| 3 | G | `listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告` | test/门禁引擎/list-project.test.ts:23 | warnings `['角色卡/招募：缺少 role-card.md，已跳过']` ≠ `[]` | 测试假设过时 | 门禁引擎 / A |
| 4 | G | `卡文本：运营负责落盘工作流，幕僚不再被暗示为写者` | test/门禁引擎/convener-workflow-write.test.ts:42 | match `/项目工作流文件 docs/workflow.md 由运营落盘维护/` 不中（现卡文“项目实现流程由 Convener 维护”“Convener 管impl”） | 测试假设过时 | 门禁引擎 / A |
| 5 | G | `渲染过滤：section=roles/routing 与注册表展示字段出现在文本中` | test/门禁引擎/governance-matrix-service.test.ts:514 | match `/工作流管理、按序派发、短报汇总/` 不中（旧 chief 展示字段已随 e71501c 移除） | 测试假设过时 | 门禁引擎 / A |
| 6 | O | `A5 runRole 一次性 CLI：createAdapter 不收到 capabilities（矩阵不注入）` | test/编排/governance-matrix-injection.test.ts:316 | actual `{protectedGitRoots:[…]}` ≠ `undefined` | 测试假设过时 | 编排 / B |
| 7 | O | `AC-5：D3 targetRoleIds 不在 roster ⇒ 批准前拒绝（vca-target-invalid）` | test/编排/trunk-upgrade-validation.test.ts:171 | `submitted.ok false !== true`（vca-channel-unavailable） | 测试假设过时 | 编排 / B |
| 8 | O | `AC-5：role-card 缺失 ⇒ 批准前拒绝（fail-closed）` | test/编排/trunk-upgrade-validation.test.ts:202 | `submitted.ok false !== true` | 测试假设过时 | 编排 / B |
| 9 | O | `AC-5：合法单契约升级仍可通过（roster 未变更 ⇒ 不做磁盘最新版强链校验）` | test/编排/trunk-upgrade-validation.test.ts:216 | `submitted.ok false !== true` | 测试假设过时 | 编排 / B |
| 10 | O | `AC-5：契约版本链不匹配（roster 引用 proposal v1 + target proposal v2）⇒ 拒绝` | test/编排/trunk-upgrade-validation.test.ts:184 | `submitted.ok false !== true` | 测试假设过时 | 编排 / B |
| 11 | O | `AC-5：无效 roster ⇒ 批准前拒绝（vca-target-invalid，不冻结/不 re-pin）` | test/编排/trunk-upgrade-validation.test.ts:148 | `vca-channel-unavailable: Ordinary document submissions use submitDirect…` | 测试假设过时 | 编排 / B |
| 12 | O | `BUG-3：appointment-write judge 事实含角色可写根（角色卡/<target>/ ∪ 名单目录）与 allowed 探针` | test/编排/appointment-roster.test.ts:425 | 角色卡路径 `pathProbe.allowed false !== true` | 测试假设过时 | 编排 / B |
| 13 | O | `BUG-3：角色卡 role-card.md 与 boundary.yaml 均经同一 resolveWrite 探测为 allowed` | test/编排/appointment-roster.test.ts:445 | `false !== true`（两探针） | 测试假设过时 | 编排 / B |
| 14 | O | `D-1：projectRoot 为空 → 不传 sessionDir（旧行为）` | test/编排/session-dir.test.ts:114 | `ENOENT: realpath ''`（run-role.ts:1543 → git-command.ts:626） | **产品回归** | 编排 / B |
| 15 | O | `D-1：一次性路径 runRole **不传**能力面（一局即止，无持久化/恢复语义）` | test/编排/session-dir.test.ts:138 | actual `{protectedGitRoots:[…]}` ≠ `undefined` | 测试假设过时 | 编排 / B |
| 16 | O | `Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority` | test/编排/git-capabilities.test.ts:515 | `trunk-item-invalid: The actual publication task has no original Chief input source` | 测试假设过时 | 编排 / B |
| 17 | O | `P6 集成（Q1/Q2 口径修正）：可静态证明越界 ⇒ deny；不可解析 ⇒ 交判断并附脚本内容；plain 仍按边界` | test/编排/shell-operator-only.test.ts:511 | `git clean -fdx：审批通过 ⇒ 放行` false（W3-G 起裸 Git 写硬拒） | 测试假设过时 | 编排 / B |
| 18 | O | `Retained intent confirmation: real migration keeps history and only the exact persisted customer decision adds confirmation` | test/编排/direct-role-capabilities.test.ts:70 | message `frozen-conflict: docs/product/demo-intent-v2.md` ≠ `frozen-conflict` | 测试假设过时 | 编排 / B |
| 19 | O | `TM-5 schema 字面量全仓扫描：src/**/*.ts 的 xxx/vN ∈ schemaLiteral ∪ 规范 id ∪ 显式白名单（含理由）` | test/编排/doc-format-specs.test.ts:1312 | 未登记 7 个字面量：`ans-basis/v1`、`ans-release/v1`、`ans-task-git-shell/v1`、`ans-workflow/v1`、`chief-workflow/v2`、`legacy/v1`、`two-fixed-paths/v1` | 测试假设过时 | 编排 / B |
| 20 | O | `applyStableSnapshot：mini re-pin 不升 trunkVersion、旧哈希不符/无 manifest 待续接` | test/编排/trunk-service.test.ts:507 | pending 实际多 `errorCode:'stable-manifest-unavailable'`、`message:'missing'` | 测试假设过时 | 编排 / B |
| 21 | O | `node test外指符号链接路径不获委托；项目内测试路径获委托` | test/编排/shell-authorized-routine.test.ts:184 | `EPERM: symlink`（本机无符号链接权限） | **环境/平台** | 编排 / B |
| 22 | O | `openRoleSession：普通角色 settle → 发出 handback（形状正确）` | test/编排/handback.test.ts:116 | `'blocked' !== 'unreported'`（合成 taskId 无真实任务 ⇒ 写入被 assignedTaskWritePaths 拒） | 测试假设过时 | 编排 / B |
| 23 | O | `real ACK binds task → Q1/Q2 chat → next task even with delayed consumption; chat report drops old taskId` | test/编排/chat-handback-scope.test.ts:59 | 第 5 行 taskId 实际 `'ignored'` ≠ `undefined` | 测试假设过时 | 编排 / B |
| 24 | O | `v4.1 工作流卡文本：幕僚主链顺序一步一派；产品/策划/人事/运营/质检含各自产物与回报目标；convener 获得 dispatch 能力` | test/编排/trio-worker-report.test.ts:184 | match `/主链顺序（必须）/` 不中 | 测试假设过时 | 编排 / B |
| 25 | O | `wiring guards: append sits after current gate and before effects with the frozen R2 digest mapping; run-change/stop paths never append` | test/编排/git-action-authorization-wiring.test.ts:69 | 本机/CI 均绿（B3c 8f6bbd2 已修） | 已转绿（基线过期） | — / D |
| 26 | O | `人事（Nominator）：无任务收窄时 Section 1 条目直接放行；他人写区/应用目录仍拒` | test/编排/section1-write-preauthorization.test.ts:304 | 角色卡路径 `allowed false !== true`（roleDraftWritePaths guard） | 测试假设过时 | 编排 / B |
| 27 | O | `卡片文本：幕僚卡要求派发后结束本轮、禁止 sleep/轮询空转；五张 worker 卡要求完成任务必须 submit_report` | test/编排/trio-worker-report.test.ts:162 | 幕僚卡无 `/派发后立即结束本轮/`（纪律在 chief-workflow.md） | 测试假设过时 | 编排 / B |
| 28 | O | `卡片文本：验收卡发起权归质检——运营只可 dispatch 质检，幕僚不得要求运营提交验收卡` | test/编排/trio-worker-report.test.ts:214 | 运营卡无 `/可发起验收＝用 dispatch_task 派质检/`（现设计由 Chief 创建 Verifier，固定路径不发 acceptance 卡） | 测试假设过时 | 编排 / B |
| 29 | O | `有任务 writeSet 时 trio 不并入 Section 1：Nominator 角色卡条目仍被 F4 收窄拒` | test/编排/section1-write-preauthorization.test.ts:248 | reason 实际 `Role drafts require the actual completed plan and current D3 selection…` ≠ `/不在任务 writeSet 内（F4）/`（行为仍是拒绝） | 测试假设过时 | 编排 / B |

## 3. 分类判定

### 3.1 产品回归（1 名，#14）

- 测试：`test/编排/session-dir.test.ts:114`，最小项目 `{projectRoot:"", skillRoot:"", builtInRoles:["su"]}`，期望会话可开、`sessionDir === undefined`（明确标注“旧行为”）。
- 产品：`openRoleSession` / `runRole` 自 `e71501c` 起无条件调用 `readGitProtectionFacts(input.project.projectRoot)`（`run-role.ts:1543`、`:537`）；`git-command.ts:624-626` 直接 `realpath(projectRoot)`，空串抛 `ENOENT: no such file or directory, realpath ''`，会话在构造前失败。`sessionDirFor` 至今保留空根守卫（`run-role.ts:4466-4469`），说明空根是既有支持形态。
- 证据：本机工作树、中性根、R6 macOS x64 与 Windows x64 均为同一 ENOENT（`03/04`）。CI 两平台同错，排除了本机特例。
- **最小修复（编排）**：在 `openRoleSession`/`runRole` 取得保护事实前，对 `projectRoot.trim()===""` 短路为 `{state:"unmanaged"}` / 空 `protectedGitRoots`（与无 `.git` 根同形），保持旧的无 sessionDir 行为；不改其他保护判定。若 owner 裁定空根不再支持，则需改为结构化拒绝并把本名重分类为“测试假设过时”（但会改变旧行为，风险更高）。

### 3.2 环境 / 平台（1 名，#21）

- `test/编排/shell-authorized-routine.test.ts:184-191` 在准备阶段 `fs.symlinkSync`；本机无 `SeCreateSymbolicLinkPrivilege` ⇒ `EPERM`，断言不可达。中性根仍 EPERM（排除 checkout 形态）；R6 macOS x64 / Windows x64 均 ✔。
- **适配（编排测试）**：沿用 KR-33 K4 方法——创建链接前做能力探测；win32 优先改用 junction（`lstat().isSymbolicLink()` 对 junction 为 true，仍验证“外指不获委托、项目内获委托”语义），无权限时诊断 skip；断言不放宽、CI 形态保持绿。

### 3.3 测试假设过时（26 名）

按根因簇分组（源码/契约证据见 `05-source-evidence.md`）：

| 簇 | 名 | 当前真实语义 | 旧期望 | 更新建议 |
| --- | ---: | --- | --- | --- |
| G1 角色卡/花名册（门禁） | #1-5 | verifier 卡改为“独立质量核对”；chief 卡改为资源驱动（“由 Convener 维护/管impl”）；matrix 展示字段随 e71501c 重写；非内置角色 23（+8 个 code 角色）；`角色卡/招募` memo 目录的告警是 7281792 明示的预期 | 旧卡文/旧展示短语/15 个角色/零告警 | 只改 `test/门禁引擎/` 断言：按现卡文与现 matrix 字段；计数改 23 或按角色集合；允许招募告警或把 memo 目录辨认为非角色。**测试名不改** |
| G2 VCA 客户审批通道关闭 | #7-11 | `version-change-runtime.ts:765-773`：`submit/present` 统一 `vca-channel-unavailable`；`api-spec:1227` 明确“ordinary submit/present no longer create customer approval cards”；合法路径是 `submitDirect`（真操作/base/target hash） | 旧 `submit(version-upgrade)+present` 的批准前拒绝语义 | 按 `submitDirect`/`approve` 现行链重写同等校验（schema/roster/D3/版本链/不冻结/不 re-pin），保留冻结名。若某条历史语义已不可达，需在记录中说明并请协调者裁定；不得改名 |
| G3 Nominator 直接写卡 guard | #12-13、#26、#29 | `run-role.ts:1649-1679/1779-1781`：role-card/boundary 写入必须命中 `roleDraftWritePaths`（真实完成计划 + 当前 D3）；appointment-write 旧卡不得替代；拒绝 reason 为新文案 | 旧 appointment-write 卡 + Section 1 直接放行；旧 F4 reason | 重写 appointment-write 夹具为真实计划/D3 直写模型；Standalone Section 1 测试改为断言拒绝；#29 只改 reason 断言（行为仍拒） |
| G4 能力面 protectedGitRoots | #6、#15 | `run-role.ts:579/2997`：一次性/会话适配器均传 `{protectedGitRoots}`（Git 保护事实） | `capabilities === undefined` | 断言 `governanceMatrix/contextSections === undefined`（A5 本意是“矩阵不注入”），允许 `protectedGitRoots`；一次性路径仍无持久化/恢复语义 |
| G5 任务级写集 fail-closed | #22 | `run-role.ts:1759`：有 taskId 的会话写入必须在 `assignedTaskWritePaths` 交集内；合成 taskId 无真实任务 ⇒ 空集 ⇒ 拒绝 | 有 taskId 仍按角色边界放行 | handback 形状测试改用无 taskId（或落真实任务/写集）；不得放宽产品 fail-closed |
| G6 聊天回交 taskId | #23 | `api-spec:1458` 修订 2：`required:false` 仍保留宿主核验 taskId；显式空聊天意图不带 taskId 才清旧身份 | “chat report drops old taskId” | 按现语义更新期望（第 5 行 `ignored`），或把该轮改为不带 taskId 的显式新聊天 |
| G7 发布任务来源绑定 | #16 | `apply-journal.ts:1196` + `api-spec:1286/1667`：发布任务必须有 `workSourceRef`/原始 Chief 输入源，缺失拒绝 | 旧计划任务无 workSourceRef 仍可提交 | 夹具构造真实初始化源并给 `task.created` 附 `workSourceRef`；保留冻结名 |
| G8 裸 Git 写硬拒 | #17 | `shell-write-guard.ts:581-618`（W3-G 2026-11-08）：只读白名单/task-level add/commit 之外一律硬拒，审批不可覆盖 | `git clean -fdx`、`git checkout -- .` 走审批放行 | 把两项移入“静态可证明 ⇒ deny”列表；不再断言 prompt 放行 |
| G9 诊断字段/文案 | #18、#20 | `guard-freeze-registry.ts:989` 的 message 为 `frozen-conflict: <path>`；`stable-snapshot.ts:104-106` pending 带 `errorCode/message`；`api-spec:1714` 已记录 | 裸 `frozen-conflict`；只断言 `{applied:false,pendingReattach:true}` | 断言前缀/包含诊断字段；不删原有 mini-repin/不升版本断言 |
| G10 内部 schema 字面量 | #19 | 7 个新字面量均为内部 ledger/matcher/config 枚举（model/runtime.ts、workflow-service.ts、run-role.ts、model/role.ts） | 白名单未登记 | `SCHEMA_WHITELIST` 增 7 条并写非文档格式理由；不得靠放宽扫描 |
| G11 卡片/流程资源驱动 | #24、#27、#28 | chief 卡把流程纪律委派给注入的 `chief-workflow.md`（含“结束本轮/不要 sleep/连续轮询”）；固定路径不发 acceptance 卡（`chief-workflow-v2.md:80`），Verifier 任务由 Chief 创建 | v4.1 卡文（主链顺序/验收卡发起权/派发后立即结束本轮） | 断言改读当前卡文或 `chief-workflow.md`/`v2` 资源；保留冻结名（标题含“v4.1”仅作历史名） |

补充：#1 的 D-10 语义（不强制 view_image/真实运行/强制证据/录屏）仍由同文件第一个用例通过守护；只需把 `可选质量核对` 的逐字断言改为现行“独立质量核对/证据最多截图”语义。#3 的“招募”目录是人事备忘录（`角色卡/招募/memo.md`），7281792 的 memo 已写明该告警是预期提示，非角色卡缺陷。

## 4. 修复归属与执行批次（按写区分组）

**归属**：门禁 5 的修复只需改 `test/门禁引擎/**`（门禁引擎写区）；编排 23 个红名的修复只需改 `test/编排/**`（编排写区），另有 #14 的最小产品修复在 `src/pipeline/orchestration/run-role.ts`（同属编排写区）。**本专项只读分析，不越界改代码/测试。** `wiring guards…` 无需修复，只做冻结基线登记。

| 批 | 目标名 | 文件清单（相对仓库根） | 预计改法 | 验证门槛 |
| --- | ---: | --- | --- | --- |
| A | 5（#1-5） | `test/门禁引擎/view-image-cards.test.ts`、`role-group-metadata.test.ts`、`list-project.test.ts`、`convener-workflow-write.test.ts`、`governance-matrix-service.test.ts` | 只改断言/计数/告警允许集；保留冻结名 | LF 归一两 chief md 后 `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"` 3×：577 tests / 576 pass / 0 fail / 1 skip；冻结 5 逐名绿；跑后还原并确认 CRLF/status 干净 |
| B | 23（#6-24、#26-29） | `test/编排/governance-matrix-injection.test.ts`、`trunk-upgrade-validation.test.ts`、`appointment-roster.test.ts`、`session-dir.test.ts`、`git-capabilities.test.ts`、`shell-operator-only.test.ts`、`direct-role-capabilities.test.ts`、`doc-format-specs.test.ts`、`trunk-service.test.ts`、`shell-authorized-routine.test.ts`、`handback.test.ts`、`chat-handback-scope.test.ts`、`trio-worker-report.test.ts`、`section1-write-preauthorization.test.ts` + `src/pipeline/orchestration/run-role.ts`（#14） | 先落 #14 空根守卫；再按 §3.3 逐簇更新断言/夹具；保留冻结名 | 137 文件主跑 + git-trunk-store 单文件（`--test-concurrency=1 --test-timeout=120000`，可 `--test-force-exit`）3×：1375 tests / 1373 pass / 0 fail / 2 skip + 13/13；冻结 23 红名逐名绿；本机 symlink 名绿或诊断 skip（CI 绿）；`npm run typecheck` EXIT=0；无新增红 |
| D | 1（#25，已绿） | 无代码文件；下一次 B7 重冻结时在 `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/knownred/orchestration-24.txt` 登记 REMOVED | 基线维护（文档） | 重冻结文档记录 REMOVED 理由（B3c 8f6bbd2 修复）；不得在 R7 前改名/删名 |

**建议执行顺序**：

1. **A 与 B 可并行**（写区不相交：`test/门禁引擎/**` vs `test/编排/**` + `run-role.ts`）。
2. **B 内部顺序**：#14 产品守卫 → G2（5 名 VCA，批量同文件）→ G3（4 名同簇）→ G4/G5/G6/G7/G8/G9/G10 → G11（3 名卡文/资源）→ #21 symlink 能力守卫。`session-dir.test.ts` 同时承载 #14/#15，先产品后测试。
3. **每批完成后**：定向 3×（自然退出）+ `npm run typecheck`；再跑三套冻结 known-red 的逐名 diff（本套 29 → 0 红，`wiring guards` 按 REMOVED 记录）。
4. **R7 CI**：三平台全量 `test/**/*.test.ts`（arm64 必跑），确认 29 名从失败名中消失；本套 27 名当前 CI 真红应清零，2 名保持绿。

## 5. 风险与未决

1. **冻结名不可重建**：26 个“测试假设过时”的更新必须保留测试名原样；标题中的“15 个活项目角色”“v4.1”“drops old taskId”等历史字样不得改。建议在测试体内加注释说明标题为历史名、语义按当前契约。
2. **VCA 5 名的重写范围（#7-11）**：`submit/present` 通道是**有意关闭**（api-spec:1227），不是产品缺陷。测试若无法在保留原名的前提下表达旧“批准前拒绝”，需 owner（编排）裁定是改用 `submitDirect/approve` 等价断言还是按 REMOVED 登记；不得静默删除。
3. **空 projectRoot 的属主裁决（#14）**：默认按“旧行为仍受支持”修产品（run-role.ts 空根短路），这是本专项唯一产品回归。若 owner 明确空根不再支持，则改为结构化拒绝并把本名重分类为测试假设过时；需在批记录中留痕。
4. **卡文归属**：`trio-worker-report` 3 名与门禁 #4/#5 的断言对象是 `src/common/roles/<id>`（chief-code/convener-code/verifier-code 写区）。本方案只改测试读取/断言；若 owner 决定恢复旧卡文（产品文案），则改动会跨到 code 角色写区，必须先经治理更新边界。
5. **Nominator 直写模型（#12-13、#26、#29）**：`roleDraftWritePaths` 要求真实完成计划 + D3，测试夹具需构造合法计划/名单/D3 与任务写集；若夹具过重，建议抽出共享 helper，但不得放宽产品 guard。
6. **任务级写集（#22）**：`assignedTaskWritePaths` 是 e71501c/B16/B26 的 fail-closed 语义；测试应改用无 taskId 的形状场景或落真实任务，不应把空交集当允许。
7. **symlink 本机限制（#21）**：CI 两平台已绿；本机修复只能走能力探测/junction/诊断 skip，断言不得放宽。若门禁要求本机 29/29 “绿”而非“无红”，需协调者接受 diagnostic skip 口径（与 KR-33 K4 一致）。
8. **R6 统计口径**：R6 文档“known-red 62 命中 33”= 门禁 5 + 编排 22 + runtime-core 6；本套 29 中 27 名在其中且两平台真红，2 名缺失（绿）。引用时勿把“33”误读为 runtime-core 33；本套 29 与 runtime-core 33 是不同集合。
9. **arm64 缺口**：R6 arm64 job 级 cancelled 无工件；本套 27 名在 R6 的 macOS 结论仅来自 x64。R7 必须重跑 arm64 才能给三平台结论（R5 显示 33 名中 27 绿/6 红在 arm64 与 x64 同形，但不可替代 R7）。
10. **冻结基线过期**：`wiring guards…` 已由 B3c（8f6bbd2）修复；下一次重冻结应登记 REMOVED，否则“29 名全部转绿”目标会因一个已绿名产生口径噪音。

## 6. 验证口径（修复后）

1. **本机工作树（kr29ana，任务口径）**：门禁 LF 归一后 `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"` 3×：577 tests / 576 pass / **0 fail** / 1 skip；冻结门禁 5 逐名 ✔。编排 `--test-concurrency=1 --test-timeout=120000`（137 文件 + git-trunk-store 单文件）3×：1375 tests / 1373 pass / **0 fail** / 2 skip + 13/13；冻结编排 23 红名逐名 ✔，#25 已绿（基线 REMOVED）。还原两个 chief md 后 CRLF/status 干净。
2. **中性根/规范 checkout**：同口径 3×，0 fail；symlink 项在无权限机为 diagnostic skip（非 fail）。
3. **CI R7（三平台）**：`test/**/*.test.ts` 全量；29 名从失败名消失；arm64 产出工件；记录 tests/pass/fail/cancelled/skipped 与唯一 ✖ 名。
4. **三套冻结 known-red**：runtime-core 33 / 门禁 5 / 编排 24（重冻结后 23）逐名 diff；本套 29→0 红（wiring 记 REMOVED）；不得改测试名/重建基线。
5. **静态**：`npm run typecheck` EXIT=0；改动仅限 A/B 列出的文件，无跨写区/角色卡/配置/workflow 改动。
6. **证据**：每批保留目标文件 TAP/日志（原始大日志不入库，仅存派生错误体与计数），并在批记录中给出文件列表与 SHA-256。

## 7. 约束声明与产物

- 本专项只分析、只写文档/证据；未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。
- 产物：本文件 + `_evidence/00-run-metadata.txt`、`01-kr29-master.tsv`、`02-name-set-diff.txt`、`03-error-bodies-local.txt`、`04-ci-status-matrix.tsv`、`05-source-evidence.md`、`06-neutral-root-comparison.txt`、`07-batch-plan.tsv`。
- 原始大日志（两次全量 TAP、定向 TAP、CI 工件）未入库；证据目录仅保留派生表、错误体摘录与根因定位。
