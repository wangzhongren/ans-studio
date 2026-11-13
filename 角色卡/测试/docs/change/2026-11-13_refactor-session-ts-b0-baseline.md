# B0 基线冻结与源码钉子治理（`app/desktop/session.ts` 重构）

- 日期：2026-11-13
- 角色：ANS 测试（独立执行；B0 主执行）
- 方案依据：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §2.7 / §4.4 / §5 B0 / §6.2
- 工作树：`.claude/worktrees/refactor-session-ts-b0`（分支 `refactor/session-ts-b0`）
- 起点：`c234e79ce0a7d6553c5f2244061348ca3707129f`（Merge PR #94，含 PR #93 方案与 PR #94 B8；= 当时 origin/main）
- 客户裁决：**Q1 已批准**（14 个源码钉子机械改指，断言语义不变）
- 状态：**B0 完成（未提交）**——基线冻结、三套 known-red 无漂移核对、全量 before（分段）、聚合读取器、14 钉子改指与逐个验证、typecheck 全部完成；保留项见 §8.2
- 边界：只改 14 个源码钉子的读取方式 + 新增聚合读取器/自测 + 本角色记录与证据；**生产代码 0 改动**；未 commit/push、未触发 CI、未 tag、未触碰 `main`；未占用 9222/9223/9224；未读 `.env`
- 证据目录：`角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/`

> 因同一工作树上桌面窗口角色并行写入其写区文件（`test/桌面应用/session-structure.test.ts`，本角色未触碰），
> 为保证基线可复现，全部重型测试证据在**独立临时快照工作树**（detached `c234e79`，干净跟踪树，
> `git worktree add` 于系统临时目录）执行；静态清单与 14 钉子验证在共享 B0 工作树执行。
> 快照的 `node_modules` 以目录联接指向 `release-v2.0.0-blockers-8` 工作树（`package-lock.json` 哈希一致：
> `a5e315ca976467bb6dc8a28c6854d7a387cf9dc13fdbb0d36aea99c8a5de8d63`）。

## 0. 环境

| 项 | 值 | 证据 |
| --- | --- | --- |
| 平台 | Windows 11 Pro（10.0.26300），MINGW64 | `00-environment.txt` |
| Node | v24.22.1 | 同上 |
| npm / git | 11.19.1 / 2.55.0.windows.5 | 同上 |
| CPU | 32 逻辑核 | 同上 |

## 1. `app/desktop/session.ts` 冻结（B0 起点实际值）

| 指标 | 值 |
| --- | --- |
| SHA-256 | `e7288b2eee2a5aa31393a6f39e6a32676610215c64d78b4a793b52ef4d5fb453` |
| 行数 / 字节 | **13,491 行 / 871,147 字节** |
| 编码 | UTF-8、LF、无 BOM（首 3 字节 `69 6d 70`）；工作树字节与 `git blob` 哈希一致 |
| 最长行 | 749 字符（第 300 行） |

与方案 §0（e0c5e01：13,466 行 / 868,951 字节 / `ad9679c7…`）的差异来自 PR #94 B8 对 `session.ts` 的修复
（`git diff --stat e0c5e01 c234e79 -- app/desktop/session.ts` = +27/−2，净 +25 行）。**B0 以 c234e79 实测为基线。**
证据：`07-session-freeze.txt`。

## 2. 导出面：51 个符号（方案附录 B → 源码实测逐名核对）

方法：静态解析顶层 `export interface|type|class|const|function` 与 `export type { … }`（脚本
`tools-extract-exports.mjs`，输出 `01-exports-actual.json`）；再以 `tools-compare-appendix-b.mjs` 与附录 B
逐名比对（输出 `02-appendix-b-vs-actual.json`）。

结果：**51 = 值/类 6 + 类型 45**；`RuntimeKind`（`export type { RuntimeKind }`）与 `RunChangeMode`
（`export type { … } from run-manifest.ts`）按类型类计入。附录 B 六类计数 6+13+9+6+10+7 与实测集合**完全相等**
（`onlyInPlan=[]`、`onlyInSource=[]`、`valueMismatch` 双向为空）。

运行期值（6）：`SessionManager`、`MAX_LIVE_SESSIONS`、`CAPABILITY_INSTALL_SYSTEM_PREFIX`、
`desktopProjectExecutionInventory`、`subscribeDesktopExecutionInventory`、`shouldSuppressStarTaskReport`。

类型（45）：`ActiveRunView`、`BackgroundTaskReadInput`、`BackgroundTaskReadReply`、`BackgroundTaskStopInput`、
`BackgroundTaskStopReply`、`BackgroundTaskView`、`BackgroundTasksListReply`、`CloseTaskInput`、`CloseTaskResult`、
`DeliveryQueuePersistenceFacts`、`DeliveryQueuePersistenceOutcome`、`DeliveryQueueRestoreReport`、
`DesktopOrchestrationEvent`、`DesktopProjectExecutionInventory`、`DesktopSessionInventoryFact`、`EffectiveConfigInfo`、
`GovernanceClientProjectionV1`、`InstallationCapabilityTool`、`InstallationEffectRefusalObservation`、
`NativeProjectRegistration`、`OpenResult`、`PersistedDeliveryItemV1`、`PersistenceCapabilities`、`PersistenceReply`、
`PersistenceScope`、`PersistenceUpdated`、`PersistenceValues`、`RebuildSessionResult`、`RedeliverResult`、
`RedispatchTaskInput`、`RedispatchTaskResult`、`RunChangeMode`、`RuntimeKind`、`SendResult`、`SessionEventEnvelope`、
`SessionManagerDeps`、`SessionMessageMetadata`、`SessionOpenRequest`、`SessionTarget`、`StopResult`、`TaskListView`、
`TaskRestoreReport`、`TerminateRoleRunInput`、`TerminateRoleRunResult`、`WithdrawResult`（逐名来源 `01-exports-actual.json`）。

## 3. 导入方清单（全仓 `import … from ".../session.ts"`，按路径解析到 `app/desktop/session.ts`）

方法：`tools-import-inventory.mjs` 递归扫描 `app/ src/ test/ bin/`，对每条 import/export-from 解析相对路径，
仅统计解析到 `app/desktop/session.ts` 者；分类为生产 / 测试（`*.test.ts`）/ 探针夹具（test/ 下非 test 文件）/
retired。输出 `03-import-inventory.json`（逐文件逐语句符号）与 `03b-import-files-list.txt`（名单+计数）。

| 类别 | 文件数 | import 语句数 | 被导入符号出现数 | 备注 |
| --- | ---: | ---: | ---: | --- |
| 生产 | 2 | 5 | 34 | `app/desktop/interface.ts` 4 条/33 符号；`app/main.ts` 1 条/1 符号（`SessionEventEnvelope`，type） |
| 测试 `test/**/*.test.ts` | 67 | 67 | 85 | `SessionManager` 出现在 66 个测试文件 |
| 探针/夹具（test/ 下非 .test.ts） | 3 | 5 | 6 | `test/测试/download-requests-electron-probe.mjs`（1 条）、`test/测试/g4-skill-verify/fixture.ts`（2 条）、`test/测试/g4v2-mcp-verify/f-fixture.ts`（2 条） |
| retired（不参与构建/测试） | 1 | 1 | 1 | `test/测试/retired-5b/d-mirror-advance.test.ts.retired` |

与方案 §2.4 数字的对照（如实披露口径差异）：

- 方案写作「70 个测试文件」；实测 c234e79 为 **67 个 `.test.ts` + 3 个探针/夹具 = 70 个 test/ 下文件**（retired 除外），文件口径一致。
- 方案写作「121 处 import 出现」；该数字无法用单一可复现口径精确复现。实测三种口径：解析后 import 语句 **78 条**（含生产 5、探针 5、retired 1）；被导入符号出现 **126 次**（85 测试 + 34 生产 + 6 探针 + 1 retired）；原文 `app/desktop/session.ts` 字符串在 `test/` 出现 **117 次**（含注释）。差异应为方案统计口径与提交时点（e0c5e01 vs c234e79）不同，**以本节实测为准**。
- 生产面与方案一致：2 文件；`interface.ts` 33 符号（方案 29+4）、`main.ts` 1 符号。

## 4. 三套冻结 known-red：canonical 来源与 c234e79 漂移核对

| 套件 | canonical 基线文件 | SHA-256 | 名单 |
| --- | --- | --- | --- |
| runtime-core（33） | `角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-provider_evidence/14b-knownred-runtime-core.tap` | `bf8e490f…` | `04a-knownred-runtime-core-33.txt` |
| 门禁引擎（5） | `角色卡/运行时核心/docs/change/2026-11-10_B2_two-fixed-workflow-paths-evidence/07-gates-failure-names.txt` | `d58a48b4…` | `04b-knownred-gates-5.txt` |
| 编排（24） | `角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-05-known-red-failnames.txt` | `1b0cf6a1…` | `04c-knownred-orchestration-24.txt` |

（canonical 完整哈希见 `04-canonical-source-sha256.txt`；比对工具 `tools-knownred-compare.mjs`，逐名双向 diff。）

| 套件 | c234e79 重跑（快照工作树） | 与冻结名单 diff | 证据 |
| --- | --- | --- | --- |
| runtime-core | 604 tests / 567 pass / **33 fail** / 4 skipped | **空**（33/33 逐名命中） | `14-segment-runtime-core.tap`、`06a-knownred-runtime-core-diff.json` |
| 门禁引擎 | 577 tests / 571 pass / **5 fail** / 1 skipped（LF 归一后运行，92s） | **空**（5/5 逐名命中） | `14-segment-门禁引擎.tap`、`06b-knownred-gates-diff.json` |
| 编排 | 1,373 tests / 1,347 pass / **24 fail** / 2 skipped（排除 `git-trunk-store.test.ts` 的主跑，139s；该文件单独 13/13 通过，57s） | **空**（24/24 逐名命中） | `14-segment-编排.tap`、`14-segment-编排-git-trunk-store.tap`、`06c-knownred-orchestration-diff.json` |

**结论：三套冻结 known-red 在 c234e79 无漂移（33/5/24 逐名一致）。**

门禁套件资源归一：工作树为 CRLF（`core.autocrlf=true`），按既有口径以 `git cat-file blob HEAD:<path>` 临时写回
`src/common/门禁引擎/workflows/chief/chief-workflow.md` 与 `chief-workflow-v2.md`（LF），跑完立即
`git checkout --` 还原（见 `14-segments-summary.txt` 内的 gates LF 行）。

编排套件环境 flake（如实披露）：`test/编排/git-trunk-store.test.ts` 在本环境全量运行时可能挂起/原生崩溃
（历史记录：单文件 13/13 通过；B8 记录采用拆分口径）。本轮处置见 §5 与 `14-segments-summary.txt`。

## 5. 全量测试 TAP before（Windows / Node v24）

### 5.1 单进程全量尝试（指定命令）→ 已知环境挂起

命令：`node --test --test-concurrency=1 --test-timeout=120000 "test/**/*.test.ts"`（c234e79 快照工作树）。
实际：11:41 启动，11:41:24 后再无任何输出（369 行后停住），约 11:46 手动终止。清理时发现 runner 进程泄漏仍存活
（父 `node --test …` + 子进程命令行 `test\pi-adapter\abort.test.ts`，自 11:41:22 起 >14 分钟未结束——已超过
`--test-timeout=120000` 多轮，属 runner/子进程级挂起，非单测断言失败）。原始输出保留 `05-full-tap-before.txt`
（369 行 / 34,433 字节）与 `05-full-tap-before.exit.txt`。判定为仓库已登记的本环境 Node test runner 挂起族，
按任务口径改用**分段执行**。

### 5.2 分段口径（与 CI 命令的差异声明）

- 分段：按 `test/` 一级目录 13 段顺序执行；命令与指定命令同参数（`--test-concurrency=1 --test-timeout=120000`），
  glob 前缀替换为 `"test/<段>/**/*.test.ts"`。
- 增补 `--test-force-exit`：本环境存在测试完成后的句柄泄漏/挂起（历史记录在案）；该开关只影响测试完成后的进程退出，
  不改变任何用例结果。**CI 权威命令不变**（`.github/workflows/release.yml` 无此开关）。
- 外部段级 `timeout` 兜底（段级上限 900–2400s），仅防挂起；逐段落盘 TAP、退出码与耗时（`14-segments-summary.txt`）。
- **拆分单文件（历史登记挂起/崩溃文件，如实披露）**：`test/测试/customer-authorization-plane-integration.test.ts` 与
  `test/编排/git-trunk-store.test.ts` 从所属段拆出单独运行（各 300s 上限）。编排 24 条冻结 known-red 已逐名映射，
  均不在 `git-trunk-store.test.ts` 内（映射核对见 §4）。
- 过程披露：中途一次任务停止时，正在运行的「门禁引擎」孤儿轮（`14a-segment-门禁引擎-orphaned-run.tap`）出现
  29 个**文件级**中断失败（与停止信号波及 test-isolation 子进程的时间吻合）；该轮判为受污染、不作为证据；
  随后在干净进程状态下重跑门禁引擎（`14-segment-门禁引擎.tap`，577/571/5），以重跑结果为准。
- macOS 基线：**由后续 CI 冒烟补充**（本机仅 Windows）。

**分段执行汇总（2026-11-13，c234e79 快照工作树）**

| 段 | exit | 耗时 | tests | pass | fail | skipped | cancelled | 失败名数 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| gates | 0 | 1s | 29 | 29 | 0 | 0 | 0 | 0 | |
| claude-adapter | 0 | 8s | 128 | 128 | 0 | 0 | 0 | 0 | |
| codex-adapter | 0 | 10s | 123 | 122 | 0 | 1 | 0 | 0 | |
| pi-adapter | 1 | 62s | 364 | 361 | 2 | 1 | 0 | 2 | symlink storage 环境红 |
| roles | 1 | 3s | 285 | 283 | 2 | 0 | 0 | 1 | 契约冻结文件哈希 |
| runtime-core | 1 | 49s | 604 | 567 | 33 | 4 | 0 | 33 | **冻结 known-red 33/33** |
| 装配 | 1 | 7s | 99 | 87 | 12 | 0 | 0 | 12 | 缺 SDK 配置/掩码类环境红 |
| 项目管理 | 0 | 8s | 224 | 219 | 0 | 5 | 0 | 0 | |
| 桌面UI | 0 | 7s | 443 | 443 | 0 | 0 | 0 | 0 | |
| 桌面应用 | 1 | 436s | 832 | 760 | 70 | 0 | 2 | 72 | 含 2 条 120s 超时（cancelled） |
| 门禁引擎 | 1 | 92s | 577 | 571 | 5 | 1 | 0 | 5 | LF 归一；**冻结 known-red 5/5** |
| 测试 | 1 | 584s | 711 | 651 | 41 | 18 | 1 | 42 | 含既有红（h-scope 等） |
| 测试-hangsplit | 0 | 0s | 6 | 6 | 0 | 0 | 0 | 0 | 历史挂起文件本轮未挂起 |
| 编排 | 1 | 139s | 1,373 | 1,347 | 24 | 2 | 0 | 24 | **冻结 known-red 24/24** |
| 编排-git-trunk-store | 0 | 57s | 13 | 13 | 0 | 0 | 0 | 0 | 独立运行未复现 flake |
| **合计** | — | — | **5,811** | **5,587** | **189** | **32** | **3** | **191（唯一名）** | pass+fail+skipped+cancelled=5,811 ✓ |

> 计数来源：各段 TAP 末尾汇总经 `tools-merge-segments.mjs` 合并（`15-full-tap-before-merged.json`）。
> 失败名数一列取该段 ✖/not ok 唯一名（cancelled 条目也会打印 ✖，故命名数可大于 fail 计数）。
> 桌面应用段前约 80 秒与本角色 14 钉子验证并发（如实披露）；该段仅 2 条 120s 超时（均为 cancelled），其余失败与负载无关。

### 5.3 before 失败名清单与环境红摘要

- 合并失败名清单：`15-full-tap-before-failnames.txt`（**191 个唯一名**）；分段统计：`15-full-tap-before-merged.json`。
- 合并计数：**5,811 tests / 5,587 pass / 189 fail / 32 skipped / 3 cancelled / 0 todo**（pass+fail+skipped+cancelled=5,811 ✓）。
- **三套冻结 known-red**：runtime-core 33/33、门禁 5/5、编排 24/24 逐名一致（见 §4）。
- 三套之外的本环境既有红（均属基线，非本次改造引入）：pi-adapter 2（symlink storage）、roles 2 条/1 唯一名
  （契约冻结文件哈希）、装配 12（缺 SDK 配置/掩码类）、桌面应用 70 + 2 cancelled（含 2 条 120s 超时）、
  测试 41 + 1 cancelled（含 h-scope-audit 3 等）、门禁引擎/编排的 5/24 已计入冻结集。
- 拆分单文件结果：`test/测试/customer-authorization-plane-integration.test.ts` 6/6 通过（历史挂起本轮未复现）；
  `test/编排/git-trunk-store.test.ts` 13/13 通过（独立运行未复现挂起/原生崩溃）。
- 说明：before 基线在 c234e79 干净快照上测得；桌面应用段前 ~80s 与钉子验证并发（见上表注），
  另 2 条 120s 超时条目已如实计入 cancelled。

## 6. 14 个源码钉子机械改指（只改读取方式）

新增 `test/桌面应用/session-source.ts`，钉子统一改为 `readSessionSource()` / `readSessionModule(...)`
（API 与顺序规则见 §7）。逐文件 before/after 见 `10-nails-redirect.diff`（309 行）：
**每个文件的改动仅为「新增 import + 读取构造替换」；所有断言文本、顺序关系、计数阈值逐字未变**。

| # | 文件 | 原读取 | 新读取 | 单文件验证（tests/pass/fail） | 失败对照 |
| --- | --- | --- | --- | --- | --- |
| 1 | `test/桌面UI/evidence-markers.test.ts` | `fs.readFileSync(new URL(...))` | `readSessionSource()` | 1/1/0 | — |
| 2 | `test/桌面UI/queue-status.test.ts` | `fs.readFileSync(path.join(APP,...))` | `readSessionSource()` | 5/5/0 | — |
| 3 | `test/桌面UI/request-status.test.ts` | `fs.readFileSync(path.join(ROOT,...))` | `readSessionSource()` | 4/4/0 | — |
| 4 | `test/桌面应用/boundary-refresh.test.ts` | `fs.readFileSync(path.resolve(...))` | `readSessionSource()` | 14/14/0 | — |
| 5 | `test/桌面应用/chief-workflow.test.ts` | `fs.readFile(new URL(...))` | `readSessionModule("run-change")`（方法边界+相邻顺序钉） | 66/58/8 | 与 c234e79 未改树逐名一致（8） |
| 6 | `test/桌面应用/directive-input.test.ts` | `read("app/desktop/session.ts")` | `readSessionSource()` | 19/14/5 | 与 c234e79 未改树逐名一致（5） |
| 7 | `test/桌面应用/dispatch-fresh-enum.test.ts` | `fs.readFileSync(path.resolve(...))` | `readSessionSource()` | 2/2/0 | — |
| 8 | `test/桌面应用/hot-path.test.ts` | `fs.readFileSync(path.resolve(...))` | `readSessionSource()` | 3/3/0 | — |
| 9 | `test/桌面应用/interface.test.ts` | `read("app/desktop/session.ts")` | `readSessionSource()` | 8/8/0 | — |
| 10 | `test/桌面应用/message-queue.test.ts` | `fs.readFileSync(path.join(APP_DIR,...))` | `readSessionSource()` + 顺序钉 `readSessionModule("lifecycle/send")` | 20/20/0 | — |
| 11 | `test/桌面应用/run-change-entry.test.ts` | `read("app/desktop/session.ts")` | `readSessionSource()` | 5/5/0 | — |
| 12 | `test/测试/g1-verify/g1-copy-and-nails.test.ts` | `await read("../../../app/desktop/session.ts")` | `readSessionSource()` | 5/5/0 | — |
| 13 | `test/测试/g4-skill-verify/h-scope-audit.test.ts` | `read("app/desktop/session.ts")` ×4 | `readSessionSource()` ×4 | 7/4/3 | 与 c234e79 未改树逐名一致（3） |
| 14 | `test/测试/governance-matrix-integration.test.ts` | `fs.readFileSync(path.join(process.cwd(),...))` | `readSessionSource()` | 18/18/0 | — |

命中核对：**14/14 全部命中、无遗漏**；改造后 14 个文件中不再有直接读取 `app/desktop/session.ts` 的调用
（余留字符串仅注释与其他 `…/session.ts` 读取）。逐文件原始 TAP 与退出码：`11-nails-verify-NN.tap` 与
`11-nails-verify-summary.txt`。

> 基线对照方法：3 个非零退出文件在**未改动的 c234e79 快照**上单独复跑，失败名集合与本改造后逐名相同
> （directive-input 5 名 → `12-baseline-directive-input-failnames.txt`；h-scope 3 名；chief-workflow 8 名 →
> `12-baseline-chief-workflow-failnames.txt`），**无新增失败、无断言放宽**。
> message-queue 的顺序钉在 B0 回退到单文件全量（`readSessionModule` 回退语义），目标模块名按方案目标架构
> `lifecycle/send` 预留；chief-workflow 按 `run-change` 模块预留。

## 7. 聚合读取器（`test/桌面应用/session-source.ts`）

- `readSessionSource(): string`：barrel（`app/desktop/session.ts`）恒第一段；随后递归拼接
  `app/desktop/session/` 下全部 `.ts`，按相对路径**代码单元序**升序（`a < b` 比较，不用 localeCompare，
  与文件系统枚举顺序无关）；段间以 `"\n"` 连接；模块目录不存在时仅返回 barrel 内容（B0 与单文件逐字节一致）。
- `readSessionModule(name: string): string`：读 `app/desktop/session/<name>.ts`（可含子路径，如
  `lifecycle/send`）；不存在则回退到 `app/desktop/session.ts` 当前内容（B0 语义：单文件即全量源码）。
  非法模块名（空、`.`/`..` 段）抛错。
- `baseDir` 可选参数仅作测试注入（临时目录构造未来结构），生产调用不传。
- 自测 `test/桌面应用/session-source.test.ts`：**5/5 通过、exit 0**（B0 逐字节一致、回退一致、临时目录注入的
  固定拼接顺序与确定性、模块优先、非法名拒绝）。证据：`11b-session-source-self-test.tap`。
- 类型检查：共享 B0 工作树（含本角色改动与桌面窗口角色并行产物）`npm run typecheck` → **EXIT=0（2s）**，
  证据 `16-typecheck.txt`。

## 8. 边界、遗留与风险

### 8.1 写入清单（全部）

- 新增：`test/桌面应用/session-source.ts`、`test/桌面应用/session-source.test.ts`
- 修改：14 个钉子文件（清单与逐文件 diff 见 §6、`10-nails-redirect.diff`）
- 记录/证据：本文件 + `2026-11-13_refactor-session-ts-b0_evidence/`（脚本、TAP、diff、清单）
- 未改：`app/desktop/session.ts` 及任何生产代码；未触碰桌面窗口角色写区 `test/桌面应用/session-structure.test.ts`
  （该文件由并行角色在同一工作树写入，非本角色产物；本角色未读改其内容）
- 未 commit/push、未触发 CI、未 tag、未触碰 `main`；未占用 9222/9223/9224；未读 `.env`

### 8.2 遗留 / 披露

- **全量单进程挂起**：指定命令在本环境 369 行后无输出，按任务口径改为按一级目录分段（同参数 + `--test-force-exit` +
  段级外部 timeout）；CI 权威口径不受影响。macOS 基线由后续 CI 冒烟补充。
- **编排 `git-trunk-store` 环境 flake**：本轮全量主跑排除该文件后无挂起（139s，24 条冻结红逐名一致）；该文件独立运行
  **13/13 通过（57s）**，flake 未复现；处置口径与历史 B8 拆分一致，如实披露。
- **typecheck**：EXIT=0（2s，共享 B0 工作树，含桌面窗口角色并行产物）。
- 共享工作树的桌面窗口角色并行产物（`test/桌面应用/session-structure.test.ts` 及其记录/证据）在 B0 起点时尚未跟踪；
  本记录的全部基线数字取自 c234e79 干净快照，不含该文件；本角色未修改该文件，typecheck 已覆盖合并树。
- 桌面套件存在三项**非三套冻结集**内的既有红（`test/桌面应用/directive-input.test.ts` 5、`test/测试/g4-skill-verify/h-scope-audit.test.ts` 3、
  `test/桌面应用/chief-workflow.test.ts` 8），均在未改 c234e79 快照上逐名复现，本改造未新增失败。
  全量 before 的其余环境红（pi-adapter 2、roles 2、装配 12、桌面应用 70+2 cancelled、测试 41+1 cancelled 等）见 §5，
  均属基线既有。
- 未达成项：无（B0 范围内）。**限制**：before 基线为 Windows 分段口径，且桌面应用段有前 ~80s 并发负载（见 §5.2 注）；
  macOS/三平台口径由后续 CI 冒烟补充。

### 8.3 给后续批次的约束

- 源码钉子只能经 `test/桌面应用/session-source.ts` 读取；禁止再直接 `readFileSync(...session.ts)`；不得删/放宽断言。
- `readSessionModule` 使用的模块名（当前：`run-change`、`lifecycle/send`）必须在对应用例依赖前存在；若后续批次调整目标
  模块归属，须同步更新钉子并重新验证（读法变更属于方案 §4.4 的机械改指范围，仍不得改断言语义）。
- `readSessionSource()` 的拼接顺序固定为「barrel 先 + session/ 路径代码单元序」；任何调整须同步更新
  `session-source.test.ts` 并重新跑本记录 §6 的 14 文件。

## 9. 证据索引（`2026-11-13_refactor-session-ts-b0_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-environment.txt` | 平台/Node/npm/git/CPU、commit、session.ts 哈希 |
| `01-exports-actual.json` / `02-appendix-b-vs-actual.json` | 51 导出实测 + 附录 B 逐名比对（setEqual=true） |
| `03-import-inventory.json` / `03b-import-files-list.txt` | 导入方逐文件清单（生产/测试/探针/retired 分类） |
| `04-canonical-source-sha256.txt` / `04a-…`/`04b-…`/`04c-…` | 三套 canonical 基线文件哈希与提取后的 33/5/24 名单 |
| `05-full-tap-before.txt` / `05-full-tap-before.exit.txt` | 单进程全量尝试的原始输出（369 行）与挂起判定（`test/pi-adapter/abort.test.ts`） |
| `06a-knownred-runtime-core-diff.json` / `06b-knownred-gates-diff.json` / `06c-knownred-orchestration-diff.json` | 三套 known-red 逐名 diff（均空） |
| `07-session-freeze.txt` | session.ts 冻结指标与 e0c5e01 对照 |
| `09-candidate-sha256.txt` | 16 个候选文件（14 钉子 + 读取器 + 自测）哈希 |
| `10-nails-redirect.diff` / `10-nails-completeness.txt` | 14 文件 before/after diff 与改造完整性核对 |
| `11-nails-verify-01..14.tap` / `11-nails-verify-summary.txt` | 14 个钉子单文件运行原始 TAP、退出码与耗时 |
| `11b-session-source-self-test.tap` | 聚合读取器自测 5/5 |
| `12-baseline-directive-input-failnames.txt` / `12-baseline-chief-workflow-failnames.txt` / `12b-baseline-desktop-app-failnames.txt` | 未改 c234e79 快照上的基线失败名（对照用） |
| `14-segment-*.tap` / `14-segments-summary.txt` | 15 段原始 TAP、退出码与耗时（含 2 个拆分单文件段） |
| `14a-segment-门禁引擎-orphaned-run.tap` | 受任务停止污染的孤儿轮（审计保留，不作证据） |
| `15-full-tap-before-merged.json` / `15-full-tap-before-failnames.txt` | 分段合并统计（5,811/5,587/189/32/3）与 191 个唯一失败名 |
| `16-typecheck.txt` | `npm run typecheck` EXIT=0 |
| `tools-*.mjs` / `tools-run-remaining-segments.sh` | 可复现脚本（导出抽取/附录比对/导入清单/known-red diff/分段合并/分段执行） |


