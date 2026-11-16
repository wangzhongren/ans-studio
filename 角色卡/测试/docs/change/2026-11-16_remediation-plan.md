# R2：首轮三平台测试 CI 结果分析与测试债治理计划

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/plan-test-debt-remediation`（分支 `plan/test-debt-remediation`，起点 `96cff60` = `origin/main`）
- 范围：**只分析、只写计划**。本文件与同名前缀 `_evidence/` 下的提取脚本、失败名单与计数 JSON 是唯一产物；未修改任何代码/测试/配置/workflow/角色卡/边界，未 commit/push，未触发 workflow，未 tag，未碰 main。
- 数据源：GitHub Actions run **43421603526**（`test-ci` 首跑，`workflow_dispatch` on `main`，2026-11-13T12:00:46Z 创建）；三个 job：
  - macOS arm64 `131872698153`（failure，12:00:50–12:22:46）
  - macOS x64 `131872698562`（failure，12:00:51–12:29:55）
  - Windows x64 `131872698592`（cancelled，12:00:50–14:01:03，job `timeout-minutes: 120`）
- CI 命令（`.github/workflows/test-ci.yml`）：`node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts" 2>&1 | tee test-ci-output.log`；Node 24.14.0；三平台 typecheck 均 success。
- 既有基线/证据：
  - B0 冻结全量基线（Windows，15 段合并）：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/full/b0-frozen-failnames-191.txt`（191 唯一名）与同目录 `b0-frozen-merged.json`；原始 B0 证据在 `.claude/worktrees/refactor-session-ts-b0/角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/15-full-tap-before-failnames.txt`。
  - B7 全量收口记录：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-final.md`（190 唯一名、15 段表、B0 diff、flake 披露）；三套冻结 known-red：`…_facade-barrel_evidence/segment3/knownred/{runtime-core-33,gates-5,orchestration-24}.txt`。
  - 历史分流与第二批分析：`角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md`（186 名 [KR]/[MAC]/[NEW]）与 `2026-11-12_release-blocker-batch2-analysis.md`（35 名逐条查证）。
- 原始日志：`/tmp/ci-logs/{macos-arm64,macos-x64,windows}.log`；Windows 工件 `test-logs-win-x64` 解包于 `/tmp/ci-logs/artifact-win/test-ci-output.log`。**原始大日志不入库**，仅证据目录中的提取脚本与派生 JSON/名单入库候选。

## 1. 三平台计数表

| 平台 | job 结果 | 耗时 | tests | pass | fail | cancelled | skipped | 唯一 `✖` 名 | 备注 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| macOS arm64 | failure | ~22m | 5,823 | 5,519 | **282** | 3 | 19 | **285** | 最终汇总完整；`duration_ms` 1,237,503 |
| macOS x64 | failure | ~29m | 5,823 | 5,517 | **284** | 3 | 19 | **287** | 最终汇总完整；`duration_ms` 1,575,824 |
| Windows x64 | **cancelled** | 120m（触顶） | 无最终汇总 | — | — | — | — | **117**（119 条 `✖` 行） | 测试输出只到 12:31:59.391；之后静默 **88.97 分钟**被取消 |

口径说明：

- 唯一名与 `ℹ fail` 的 ±3 差异来自 `node:test` 的父/子测试计数（W5/W10 父测试在 inline 出现、叶块为 `selected`/`commit-race`/`required`）以及 W52 子进程输出被嵌入最终 section；**平台失败数以汇总 `fail` 为准，唯一名用于分族与去重**。
- Windows 取消前没有顶层 `ℹ tests/pass/fail/cancelled` 汇总；日志中的 `ℹ tests 1` 全部来自测试内部 spawn 的子 runner，不能当作顶层汇总。工件 `test-ci-output.log`（585,193 B / 3,738 行）与 gh 日志的 `✖` 行数/唯一名集合完全一致（119/117，`sameNameSet=true`），**排除日志截断**。
- 三平台 `✖` 文件级条目（`✖ <file>.test.ts (…ms)`）：**0 条**。本轮没有文件级失败行，只有测试级失败名。
- 三平台合并唯一失败名：**289**；macOS arm64 集合是 macOS x64 的子集（x64 多 2 名：`申请直达…`、`路径 B：B3 accepted…`）；Windows 117 名中 115 名与 macOS 并集重叠（114 名与 arm64 重叠），仅 2 名 Windows 独有（`W36…`、`W48…`）。

## 2. 分族总表（互斥分族，合计 289）

| 族 | 数量 | 平台分布（arm64/x64/win） | 是否已知 | 代表文件（计数） | 主要证据 |
| --- | ---: | --- | --- | --- | --- |
| 冻结 known-red 62 | **33** | 33/33/6 | KR 33/33；B0/B7 各 33 | `trunk-upgrade-validation`(5)、`trio-worker-report`(3)、`section1-write-preauthorization`(2)、`appointment-roster`(2) | 三套冻结名单逐名命中；B7 §5 diff 空 |
| 挂起/超时族 | **2** | 2/2/2 | B0/B7 各 2（B7 登记为 120s 取消） | `session-rebuild-race`(1)、`stuck-redispatch`(1) | 300000ms 级 `✖` 条目；见 §3 |
| macOS git-config 平台族 | **113** | 113/113/2 | B0 1；triage MAC 2 | `git-shell-acl`(28)、`git-trunk-store`(13)、`git-capabilities`(12)、`git-command`(11)、`bootstrap-frozen-closure-integration`(9) | 块级错误码 `git-config-executable-or-unsupported` 115 名（2 名跨列到漂移/KR）；`13-precompose-probe.txt` 复现 |
| CI 路径规范形/守卫族 | **36** | 35/35/28 | B0/B7 各 8 | `multi-runtime`(22)、`git-action-authorization-gate`(3)、`git-action-cross-runtime-*`(4)、`git-action-authorization-wiring*`(3) | `git-file-final-guard-unproven` 20 名（8 名 W29/W30/W33/W34/W35 跨列漂移）；Windows 8.3 短路径断言 |
| source 门测试装配族 | **23**（另 7 名 star-routing 跨列漂移） | 23/23/21 | B0/B7 各 23 | `run-pin`(11)、`run-change-trigger`(9)、`i-full-chain`(2)、`claude-adapter/schema`(1) | `document-planning-source-unavailable` 20、`worker-dispatch-source-unavailable` 5、`chief-hub-flow-unavailable` 2、`stage-request-required` 3 |
| e71501c 语义漂移族 | **33** | 31/32/33 | B0/B7 各 24；triage NEW 14 | `chief-workflow`(14)、`star-routing`(7)、`directive-input`(5)、`stuck-redispatch`(3)、`handback-delivery`(2) | e71501c 语义更新 + batch2 分析；W19 close 通知契约 |
| VCA 流程/通道族 | **13**（另 5 名 AC-5 跨列 KR） | 13/13/4 | B0/B7 各 13 | `version-change-integration`(9)、`version-change`(4) | `vca-channel-unavailable` 5、`vca-role-not-allowed` 3；其余为 VCA 状态断言 |
| flake 时序族 | **16** | 16/16/9 | B0/B7 各 9 | `session-rebuild-race`(3)、`network-state-e2e`(3)、`f2-claim-release`(2) | E3-F/D1/B8.2 ENOTEMPTY/时序族；`D1 test wait expired`、`waitFor 超时`、`离线回交未入队`、`等待超时` |
| B0 既有红（其他） | **17** | 17/17/12 | B0/B7 各 17 | `h-scope-audit`(3)、`t1-pipeline-integration`(3)、`trunk-stable-write-integration`(2) | B0/B7 逐名稳定（130 名交集；本轮无 B0/B7 xor） |
| 未归类 | **3** | 2/3/2 | B0 0；triage MAC 1 | `b31-fixed-release-auto-desktop`(1)、`runtime-core/file-write-safety`(1)、`编排/git-command`(1) | 见 §6 未归类说明 |

补充：

- 集合对照：当前 289 名中 **130** 名命中 B0（191）且同时命中 B7（190）；B0/B7 的当前交集完全一致（无仅 B0 或仅 B7 的名字），说明这 130 名是两轮 Windows 本地全量都稳定出现的既有红。**33/62** 冻结 known-red 在本轮出现；其余 29 名未出现（平台/执行路径差异，不能据此判绿）。
- B0 的 61 名未在本轮出现：macOS 与 Windows 的差异、B0 后语义变化、以及本轮未执行到的路径都可能贡献；**不构成 Windows 转绿证据**（Windows 本轮被取消，只跑了约 30 分钟测试）。
- 当前不在 B0/B7/KR/历史 triage 任一集合中的名字 **147** 名，主要由 macOS git-config 族（111 名 mac-only）、CI 路径族、multi-runtime 与 e71501c 漂移族吸收；家族归类规则见 `_evidence/assign-families.mjs`。
- macOS 特有判据（只在 macOS 失败、Windows B0/B7/本轮日志均未见）：**128** 名（`08-set-summary.json` 的 `mac_only_not_windows_log_and_not_b0_b7`）；其中 **111** 名集中在 git-config 族，其余 17 名分散在 CI 路径/source 门/VCA/漂移/flake。另有 172 名「不在 Windows 本轮日志」但部分命中 B0/B7 或只是 Windows 取消前未执行到；因 Windows 只跑了约 30 分钟，**128 名不能全部当作平台特有**，本计划按根因族而不是按「mac-only」一刀切。
- 历史 triage（`2026-11-12_release-blocker-triage.md`）186 名中的 `[KR]/[MAC]/[NEW]` 标签本轮只命中 26 名（KR 6 / MAC 4 / NEW 16）；原因是 P0（macOS 非规范根）已修复、重构 B1–B7 与 e71501c 后续语义变化改变了失败面。**旧标签只作根因线索，不作本轮判定**。

### 2.1 家族说明与跨列

1. **macOS git-config 平台族（本轮最大确定性块，113 名 / 26 文件）**
   - 直接错误码 `git-config-executable-or-unsupported` 命中 115 名；其中 1 名 `W29 … document-change 保专业规划scope…` 按语义漂移族优先归类、1 名 KR `Git team plan publication and active-only activation…` 按 known-red 优先归类，故本族 113。
   - 22 名是 `git-initialization-effects-pending` 的下游（`pending-recovery`），其 JSON 的 `message` 明确为 `Error: git-config-executable-or-unsupported`（`w5-init-operation` 8、`w7-init-operation` 6、`w3b-fixture-init-operation` 4、`w3b-doc-fixture-init` 2、`actual-init-storage-op` 1 等）。
   - 2 名同时出现在 Windows 日志（`Q2 real default CodexChat HTTP…`、`Q74 owned Git metadata observer…`），但 Windows 的失败面不同（无 `git-config` 字符串）；本族主体是 **macOS 特有**。
   - 根因（高置信）：macOS 的 `git init` 会写入 `core.precomposeunicode = true`；产品 `configFormat()` 的 core 白名单（`src/provider/trunk/impl/git-command.ts:514`）没有这个键，于是任何真实 git 夹具在 `inspectGitRepository` 阶段 fail-closed。本机探针已复现：加键即 `git-config-executable-or-unsupported`，去掉即通过（`_evidence/13-precompose-probe.txt`）。
2. **CI 路径规范形/守卫族（36 名）**
   - `multi-runtime.test.ts` 22 名：CI 上 `manager.open({projectRoot:"/one"...})` 没有调用注入的 `openRoleSession`，`opened` 为空，测试随后读 `source.input`/`source.handle` 抛 `TypeError: Cannot read properties of undefined (reading 'input'/'handle')`；B7 本机 Windows 同名测试全部通过（`segment-桌面应用.tap:567-583`）。该文件同时有 8 名 B0/B7 既有断言红。
   - `git-file-final-guard-unproven` 20 名：git-action 授权 gate/wiring/e2e 测试在 CI 双平台报「Actual file/edit handlers do not carry the current canonical metadata roots and link guard」；其中 8 名 chief-workflow W29/W30/W33/W34/W35 按漂移族归类（见下）。
   - Windows 8.3 短路径：`Q2 P2 first new project` 的断言 `actual C:\Users\runneradmin\...` vs `expected C:\Users\RUNNER~1\...`；CI Windows runner 的 `os.tmpdir()` 使用 8.3 短名，`realpath` 返回长名。macOS 的 `/var/folders` → `/private/var` 同源但已在 P0 修复中被 canonicalize 处理；Windows 短路径未处理。
3. **source 门测试装配族（23 + 7 跨列 = 30 名）**
   - 产品在 `app/desktop/session.ts` 的文档准备/worker 派发门要求「已登记项目生命周期 + 当前 accepted 客户轮次 + 来源仍 current」；run-change-trigger/run-pin/star-routing 的 harness 直接调用 `dispatch`/`openRoleSession` 桩，没有真实 `sessionId`/`turnId`/`inputAccepted`，恒被 `document-planning-source-unavailable` / `worker-dispatch-source-unavailable` 拒绝。batch2（2026-11-12）§3.1/§5 B2-2 已给出同一根因链，并明确需要 owner 裁决「legacy 直接派发是否受支持」。
   - `star-routing` 7 名同时命中 source 门与「星形回交后缀」语义，按漂移族优先归类，故本族 23；跨列说明保留。
4. **e71501c 语义漂移族（33 名）**
   - 任务点名的例子都在本族或跨列：stuck-redispatch B-07/原任务 closed、trio 裸回交来源门、星形回交后缀、W29/W30/W35/W36/W19；另有 directive-input 的 sendSession 语义、handback-delivery 的 trio/星形回交等待、application-line 的 request.* 深比较、decision-service 的旧 @ 决策预设。
   - 证据：e71501c checkpoint（2026-11-07）引入 direct role capabilities / Chief-led Markdown coordination / Git role permissions，之后产品又经 B 系列修改；B0/B7 中 24 名稳定红、triage NEW 14 名，batch2 §3.2/§4 已把 chief-workflow 的 W29/W30/W33/W34/W35/W36 归入「P0 掩盖 + 非确定/级联」并要求复跑。**本轮不直接修**；需 owner 确认当前语义后更新期望，不能放宽断言。
5. **VCA 流程/通道族（13 + 5 跨列 = 18 名）**
   - `vca-channel-unavailable: Ordinary document submissions use submitDirect with a real operation, expected base and target hashes` 与 `vca-role-not-allowed: Direct submit requires the real session role, operation id and explicit expected base` 共 8 名；其余 5 名为 VCA 冻结/拒绝/hash-drift 状态断言。
   - 5 名 AC-5（trunk-upgrade-validation）同时在冻结 known-red 62 内，按 KR 优先归类；跨列保留。batch2 §2.3/§四已指出 VCA 是「产品门 vs 测试直接提交」的契约问题，需 owner 裁决。
6. **flake 时序族（16 名）**
   - 当前日志中 **ENOTEMPTY=0、Node 原生 `CleanupQueue::Add` 断言=0、AggregateError=0**；本族依据是既有 E3/E3-F/D1/B8.2 的 flake 登记（`chief-workflow` 清理竞态、`application-line`、W52 子进程发布通知等）加本轮时序错误码（`D1 test wait expired` 3、`waitFor 超时` 2、`等待实际事件超时` 2、`等待超时` 1、`离线回交未入队` 2）与平台差异（2 名 x64-only、2 名 Windows-only）。
   - `application-line` 的 `申请直达…` 只在 x64 出现、arm64 通过；`b31-fixed-release-auto` 同样只在 x64；`W36`/`W48` 只在 Windows 出现。这些是跨平台漂移的强线索，但**样本只有一轮**，不据此判定平台特有。
7. **B0 既有红（其他，17 名）**：B0/B7 稳定命中、但不属于上述根因族（如 `h-scope-audit` 的 installMcp/installSkill 能力矩阵断言、`t1-pipeline-integration` 确认暂停语义、`trunk-stable-write-integration` 的 active-role-evidence fixture、Q30 依赖已删除的 evidence 目录、byte 预算 pin、project 枚举警告等）。这些需要逐文件 3× 复跑定性，不能靠单轮日志判产品/测试。

### 2.2 产品回归候选（先报告，不排修）

以下断言指向产品行为异常或「产品门 vs 测试期望」的确定性契约冲突；按任务约束**单列、不进入治理批次直接修**，由 owner 裁决后再决定产品修复或测试期望更新：

| 候选 | 文件/错误 | 说明 |
| --- | --- | --- |
| W19 close 通知 | `test/桌面应用/chief-workflow.test.ts:1424`；`The actual creator receipt must supply notification source` | 产品 `src/pipeline/orchestration/trunk-runtime.ts:818-823` 的 `closeCreatedTask` 按注释不调用 `notifyDirect`，测试却要求 close 产生 direct notification；batch2 §4 已判确定性契约冲突 |
| source 门拒绝 legacy 直接派发 | `run-change-trigger` / `run-pin` / `star-routing`；`document-planning-source-unavailable` / `worker-dispatch-source-unavailable` | 产品要求真实 accepted 客户轮次与已登记生命周期；若「legacy 直接派发」是受支持路径则为产品缺陷，否则应更新 harness（batch2 B2-2） |
| VCA 直接提交被拒 | `version-change-integration` / `version-change`；`vca-channel-unavailable` / `vca-role-not-allowed` | 产品要求真实会话角色、operation id、expected base/target hashes；测试走直接通道。需 owner 明确 legacy 能力面 |
| multi-runtime open 未建会话 | `test/桌面应用/multi-runtime.test.ts`；`opened[0]` 为空 / `manager.open` 未调用 `openRoleSession` | CI 双平台出现、B7 本机通过；可能是产品准入对假根 `/one` 的行为变化，也可能是测试假根在 CI 环境不成立 |
| `requestRoleStates` 忙锁 | `test/桌面应用/interface.test.ts:288`；`项目正在处理派发或权限变更，选择尚未更改。请稍后重试。` | `changeProjectSource` 在测试并发/清理窗口内报忙；需区分产品锁语义与测试时序 |
| installMcp/installSkill 能力矩阵 | `test/测试/g4-skill-verify/h-scope-audit.test.ts`；`installMcp 透传判据＝能力矩阵（唯一）` 等 | B0 既有红；断言产品能力位透传，需 owner 确认矩阵是否在 e71501c 后更新 |

## 3. 挂起文件清单（--test-timeout 命中与 Windows 静默停顿）

### 3.1 测试级 300000ms 条目（不是文件级）

| # | 失败名 | 文件 | arm64 时长 | x64 时长 | Windows 时长 | 出现次数 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | `关闭全部与双角色刷新扫描交接：停止返回后没有后续重开或投递` | `test/桌面应用/session-rebuild-race.test.ts` | 300008.997ms | 300002.543ms | 300011.3438ms | mac 各 2 次（inline + 最终 section）；Windows 1 次（取消前） |
| 2 | `C-04 decision 开关开启（真实 channel）：judge 按唯一推荐项代选 terminate ⇒ 0 张客户卡 + 结果行 + 任务收口` | `test/桌面应用/stuck-redispatch.test.ts` | 300009.843ms | 300000.979ms | 300002.0474ms | 同上 |

- **文件级 300000ms 条目：0 条**（三平台均无 `✖ <file>.test.ts (300000.xxxxms)`）。任务简报中「每个约 300000ms 的条目 = 一个挂起文件」的前提与实际日志不符：本轮命中的是 **2 个测试级条目**，分别位于 2 个文件；每个平台为这 2 个测试各消耗约 5 分钟（合计约 10 分钟/平台）。
- 日志行位置（gh log 行号，便于复核）：arm64 `关闭全部…` inline 3435 / 最终 section 8830，`C-04…` inline 3500 / 最终 9026；x64 `关闭全部…` inline 3456 / 最终 8893，`C-04…` inline 3521 / 最终 9089；Windows 仅在取消前内联出现，`关闭全部…` 3451、`C-04…` 3516（无最终 section）。
- 两个测试都是 B0/B7 已登记的既有挂起（B7 §10 记录为 120s 取消的 2 条同名），不是本轮新引入；B7 本机用 120s timeout 观察到的同名行为与 CI 的 300s timeout 同源。
- mac 日志的 5 分钟静默间隔与条目一一对应：`12:07:45→12:12:45`（条目 1）、`12:12:53→12:17:53`（条目 2，arm64）；x64 对应 `12:13:09→12:18:09`、`12:18:23→12:23:23`。这是 timeout 生效前的正常等待，不是额外挂起。

### 3.2 Windows 静默停顿（120 分钟预算的真正大头）

| 项 | 值 |
| --- | --- |
| 最后一条测试输出 | 2026-11-13T12:31:59.3915875Z（`Q72 Convener ordinary preparation…` 的 `# SKIP` 行） |
| 取消时刻 | 2026-11-13T14:00:57.8125464Z（`##[error]The operation was canceled.`） |
| 静默间隔 | **5,338,421ms ≈ 88.97 分钟** |
| 归属文件（高置信推断） | `test/测试/git-role-workflows-e2e.test.ts` |
| 依据 | 最后一批输出是 Q65/Q2 P2/Q36/Q37–Q72，全部声明在该文件；最后栈帧指向 `git-role-workflows-driver.ts` 的 `hashFixtureFiles`/`observeFixtureGitMetadata`，由 `runFirstNewBusinessCase` 的 `driver.save` 调用；Q2 P2 前一条栈帧还显示 Windows 8.3 短路径断言（`C:\Users\runneradmin\...` vs `C:\Users\RUNNER~1\...`） |
| 机制假设 | Q2 P2 失败/`driver.save` 抛错后，`driver.dispose()` 未能执行（或未关闭 fixture HTTP server/子进程），文件测试结束后 Node 事件循环仍有存活句柄，`node --test` 不退出；`--test-timeout` 只约束测试函数，已结束的测试不再被计时，故没有 300000ms 条目 |
| 影响 | Windows job 在约 30 分钟测试输出后静默 89 分钟，直到 120 分钟 job 上限取消；这是 Windows 预算被消耗的**首要原因**，优先级高于两个 5 分钟 timeout |

## 4. 批次计划

> 原则：**挂起文件族（先削 Windows 预算）→ 确定性失败（known-red 之外）→ flake 硬化**；产品回归候选先报告、单列不排修。每批改法均以「不改语义、不放宽断言、flake 只硬化」为边界；产品侧改动需 owner/对应角色批准，不由测试角色直接改产品。
>
> 共同门槛：每批目标文件本机 **3× 自然退出**（macOS 专属批在 macOS runner/定向 CI 上等价验证）、三套 known-red（runtime-core 33 / 门禁 5 / 编排 24）**逐名 diff 空**、`npm run typecheck` EXIT=0；下一轮三平台 CI 复跑记录 tests/pass/fail/cancelled/skipped 与唯一失败名。

### 4.1 批次总表

| 批次 | 族 | 文件数 | CI 轮次 | 目标 |
| --- | --- | ---: | --- | --- |
| B1（P0） | 挂起/泄漏 | 3–4 | R1 | Windows 不再触顶 120m；两个 300s 测试变为快速失败/自然完成 |
| B2（P0） | macOS git-config | 产品 1 + 测试 1（下游 26 文件验证） | R2 | 113 名 macOS 确定性红清零；macOS 真实 git 夹具恢复 |
| B3a（P1） | source 门装配 | 4（star-routing 7 由 B4 一次处理） | R3 | 23–30 名 source 门红定性并转绿/冻结 |
| B3b（P1） | VCA 流程/通道 | 2（+trunk-upgrade KR 跨列） | R3 | 13–18 名 VCA 红定性并转绿/冻结 |
| B3c（P1） | CI 路径规范形/守卫 | 13 | R3 | 36 名 CI 路径/guard 红定性并转绿/冻结 |
| B4（P1） | e71501c 语义漂移 | 7 | R3 | 33 名语义漂移按当前契约更新期望 |
| B5（P2） | flake 硬化 | 11 | R4 | 16 名时序红按族硬化，不新增断言 |
| B6（P2） | B0 其他 + 未归类 | 15 | R4 | 17+3 名逐文件 3× 定性（产品/测试/冻结三选一） |
| B7（P2） | 收口/重冻结 | 0 | R5 | 三平台复跑、known-red 逐名 diff、更新基线 |

预计：**8 个治理批次 + 1 个收口轮次**；可合并为 **5 个三平台 CI 轮次**（R1、R2、R3=B3a+B3b+B3c+B4、R4=B5+B6、R5=B7）。

### 4.2 B1（P0）：挂起/泄漏族

| 文件 | 一句改法 |
| --- | --- |
| `test/测试/git-role-workflows-e2e.test.ts` | `runFirstNewBusinessCase`/Q2 P2 的 `finally` 改为**先 `await driver.dispose()` 再 `driver.save(...)`**（或把 `save` 包 try/catch 保证 dispose 必达），并在创建 fixture 根时用 `fs.realpathSync(fs.mkdtempSync(...))` 规范化，消除 Windows 8.3 短路径断言与泄漏句柄。 |
| `test/测试/git-role-workflows-driver.ts` | 只在需要时给 `driver.save`/`observeFixtureGitMetadata` 增加「保存失败不阻断 dispose」的调用顺序保护；不改 `hashFixtureFiles` 的严格断言。 |
| `test/桌面应用/session-rebuild-race.test.ts` | 对 `Promise.race([refresh, laterOpen.arrived])` 增加 10s 显式 deadline（超时抛带 `refresh`/`stop` 状态的诊断），并在 `finally` 释放全部 waitPoint；断言「不重开、不投递、无活句柄」逐字不变。 |
| `test/桌面应用/stuck-redispatch.test.ts` | 对 C-04 的 `redispatchTask` 增加 10s deadline/无事件诊断（保留 `escalated`、`pushed.length===0`、`rows.length===1`、`selected/closed` 断言）；若 10s 内产品确不返回，转产品死锁候选另报。 |

验证门槛（本机）：

- 三个文件各自 **3× 自然退出**（`node --test --test-concurrency=1 <file>`，每个文件 < 60s；不得再出现 300s 条目）；Windows 上优先跑。
- 三套 known-red 逐名 diff 为空（runtime-core 33 / 门禁 5 / 编排 24）；`npm run typecheck` EXIT=0。
- 下一轮三平台 CI：Windows job 测试步骤 ≤ 60 分钟（或至少不再因静默停顿触顶 120 分钟）。

### 4.3 B2（P0）：macOS git-config 平台族

| 文件 | 一句改法 |
| --- | --- |
| `src/provider/trunk/impl/git-command.ts` | 在 `configFormat()` 的 `allowed.core` 白名单加入 `precomposeunicode`（仅布尔值 true/false，与 filemode/ignorecase 同类）；`core.hooksPath`/`alias`/`include`/`includeIf`/unknown section 的 fail-closed 判定逐字不变。**产品侧改动，需 owner/桌面角色批准**。 |
| `test/编排/git-command.test.ts` | 在既有 B30 `[user]` 正/负例旁新增一条钉：macOS 风格 `[core] precomposeunicode = true` 被接受；`core.hooksPath`/`includeIf`/非法值仍拒绝。不改现有断言。 |

验证门槛：

- `_evidence/13-precompose-probe.mjs` 在修复后应输出 `WITH_KEY=ACCEPTED`；macOS arm64/x64 定向复跑以下文件（26 个家族文件，优先 top 11）：`git-shell-acl`、`git-trunk-store`、`git-capabilities`、`git-command`、`bootstrap-frozen-closure-integration`、`freeze-closure`、`git-operation-sidecar-tolerance`、`readonly-git-transport`、`run-role-submit-capabilities`、`git-action-cross-runtime-*`、`git-action-authorization-wiring*`；预期 113 名清零或只剩非 git-config 面。
- Windows 回归：同组文件保持 B0/B7 既有红不新增；三套 known-red diff 空；typecheck。
- 预期 downstream：22 名 `git-initialization-effects-pending` 随产品修复一并转绿；若仍有 `git-file-final-guard-unproven`，转 B3c 的 CI 路径族，不并入本批。

### 4.4 B3a（P1）：source 门测试装配族

| 文件 | 一句改法 |
| --- | --- |
| `test/桌面应用/run-change-trigger.test.ts`（9） | 用真实 `desktop.sendSession`/accepted 客户轮次驱动，或给 harness 补 `sessionId`/`origin.turnId`/`inputAccepted`/`sourceIsCurrent` 与已登记 project lifecycle；不删断言、不放宽 source 门。 |
| `test/桌面应用/run-pin.test.ts`（11） | 同上；另外 `worker-dispatch-source-unavailable` 的用例补「当前运营真实受派任务」来源。 |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts`（2） | 固定路径的幕僚派发改为合法 `stage-request`（taskKind/workflowPath/stage/flowId）或带 workflowId/stage 的 fixed 形；断言不降级。 |
| `test/claude-adapter/schema.test.ts`（1） | `required` 子测试的来源门 fixture 补真实 accepted 客户轮次；不动 schema 断言。 |

> `star-routing` 的 7 名同时命中 source 门与星形回交后缀，**统一由 B4 在单文件内一次处理**，B3a 不重复改动，避免同一 CI 轮次内双批冲突。

前置裁决：owner 先明确「legacy 项目是否允许无真实客户轮次的直接派发」。若允许，则是产品门缺陷（产品候选，移出本批）；若不允许，按上表更新 harness。验证：各文件 3× 自然退出；source/worker 门错误码零出现；`fixed-path-routing`/`mode-switch` 回归不新增。

### 4.5 B3b（P1）：VCA 流程/通道族

| 文件 | 一句改法 |
| --- | --- |
| `test/测试/version-change-integration.test.ts`（9） | 走真实客户卡通道（`submitDirect` 带真实 role/operation/base/target hash），或按 owner 裁决为 legacy 直接提交补显式测试宿主路径；VCA 冻结/拒绝/hash-drift 断言不变。 |
| `test/桌面应用/version-change.test.ts`（4） | 同上；`SessionManager blocked` 提示与报告路由断言保持。 |
| `test/编排/trunk-upgrade-validation.test.ts`（5，KR 跨列） | 已在冻结 known-red 62；本批只复跑确认，不改测试；若 B3b 后转绿，在 B7 重冻结时移除。 |

验证：两文件 3× 自然退出；`vca-channel-unavailable`/`vca-role-not-allowed` 零出现；VCA AC-5 KR 逐名 diff 空；typecheck。

### 4.6 B3c（P1）：CI 路径规范形/守卫族

| 文件 | 一句改法 |
| --- | --- |
| `test/桌面应用/multi-runtime.test.ts`（22） | harness 的假根 `/one`/`/two` 改为 `fs.realpathSync(fs.mkdtempSync(...))` 的真实独立根，并在每次 `manager.open` 后断言 `opened.length`/`open.ok`；让「未建会话」成为明确失败而不是后续 `TypeError`；会话/引擎/排队语义断言逐字不变。 |
| `test/编排/git-action-authorization-gate.test.ts`（3） | `git-file-final-guard-unproven` 的用例先补真实 file/edit handler 的 canonical metadata roots/link guard 夹具，或由 owner 确认产品 guard 应对 CI 根 canonicalize；不改「blocked/prepared」判定断言。 |
| `test/测试/git-action-cross-runtime-{init,audit-failure,pi-init,codex-init}.test.ts`（4） | 同上；`w5-cross-*` 的 operationId/guard 事实补真实宿主元数据根；负例仍 fail-closed。 |
| `test/测试/run-stop-host-continuation-integration.test.ts`（1） / `test/测试/session-admission-approval-q9-integration.test.ts`（1） | host-continuation/Q16 的真实 rapporteur/Codex 会话事实补 canonical 根与 disposition 证据；不改 gate 放行/拒绝条件。 |
| `test/编排/git-action-authorization-wiring{,-audit-failure,-retry}.test.ts`（3） | wiring sidecar/journal 用例补真实 handler 元数据根；append/init/candidate digest 断言不变。 |
| `test/测试/git-role-workflows-e2e.test.ts`（Q2 P2） | 与 B1 同一文件：B1 负责 dispose/realpath 清理；B3c 只复跑确认 Q2 P2 与 Q2 real CodexChat 是否转绿，不重复改。 |
| `test/桌面应用/chief-workflow.test.ts`（W48） | W48 的动态模板名先在仓库反查到具体用例后，按同一 canonical 根口径补夹具；归 B4 的文件所有权，B3c 只提供根因结论。 |

前置：multi-runtime 的 `manager.open` 在 CI 上未调用注入 `openRoleSession` 需先 3× 复现；git-action guard 需 owner 判定「产品 guard 应 canonicalize」还是「测试夹具缺真实 handler 元数据根」。若判定产品缺陷，转产品候选并移出本批；若测试夹具缺失，按上表补。验证：13 文件 3× 自然退出；`git-file-final-guard-unproven` 零出现或只剩 B4 的 W 系列；Q2 P2/Q2 real 转绿；known-red diff 空；typecheck。

### 4.7 B4（P1）：e71501c 语义漂移族

| 文件 | 一句改法 |
| --- | --- |
| `test/桌面应用/chief-workflow.test.ts`（14） | W5/W10/W19/W29/W30/W33/W34/W35/W36/W48 按 e71501c 后当前语义更新期望：原任务 closed/rework、close 不自动通知（W19 先按产品候选裁决）、source/round 守卫、guard 元数据根；不放宽「零投递/零停止/唯一收口」类断言。 |
| `test/桌面应用/star-routing.test.ts`（7） | 星形回交后缀、source 门与事件等待在当前语义下一次更新（含 B3a 跨列的 source 门 7 名，避免双批）；保留「项目 worker→Steward、内置来源→Lead、同轮 settle 不双发」。 |
| `test/桌面应用/directive-input.test.ts`（5） | sendSession 命中/未命中/带图/未注入控制器的期望按当前 directive 通道更新；保留「不调用 manager.send/handle.send、不产生角色轮次」断言。 |
| `test/桌面应用/stuck-redispatch.test.ts`（3 剩余） | B-07 自动换人/升级卡/safe 重派按「原任务 closed/rework + 新 taskId + retryOf + 同 idempotencyKey」当前契约更新；C-04 挂起见 B1。 |
| `test/桌面应用/handback-delivery.test.ts`（2） | trio 裸回交来源门与星形回交 `[工作结果]` 固定字段/后缀按当前语义更新事件等待；不弱化「只投幕僚、写 task.reported」。 |
| `test/桌面应用/application-line.test.ts`（1） | `request.*` 深比较按当前事件顺序/字段更新，或改为有序事件断言；这是 x64-only 漂移，先 3× 复跑再改。 |
| `test/桌面应用/decision-service.test.ts`（1） | 业务卡旧 `@` 决策预设不再形成第三个自动执行者；按当前判定更新期望。 |

前置：owner 对 W19 与 VCA/source 门的契约裁决；未裁决前本批只做复跑与证据，不改期望。验证：7 文件 3× 自然退出；无新增失败；known-red diff 空。

### 4.8 B5（P2）：flake 硬化

| 文件 | 一句改法 |
| --- | --- |
| `test/桌面应用/session-rebuild-race.test.ts`（3 剩余） | 统一 waitPoint/deadline 与 `fs.rm` `maxRetries`，清理失败不吞断言；B1 已处理挂起测试。 |
| `test/测试/network-state-e2e.test.ts`（3） | 离线/探针恢复改为事件驱动等待（探针状态 + drain 完成），不靠固定 sleep；`离线回交未入队` 断言保留。 |
| `test/测试/kanban-fixes-verify/f2-claim-release.test.ts`（2） | 用显式 barrier 等待 send/settled；`dispatch is not a function` 先修正 harness 注入，不改队列语义断言。 |
| `test/测试/g4-skill-verify/e-handler.test.ts`（1） | 护栏矩阵的轮次种类按真实事件构造，避免共享计数器；断言逐字不变。 |
| `test/测试/download-requests-integration.test.ts`（1） | 坏行账本读取增加确定性 flush/等待；不跳过坏行断言。 |
| `test/桌面应用/download-request.test.ts`（1） | 「第二张下载卡排队」改为事件驱动（卡队列状态变化），不靠 timeout。 |
| `test/桌面应用/task-restart.test.ts`（1） | 重启恢复等待改为账本事件/drain 完成；`等待超时` 替换为带状态的 bounded wait。 |
| `test/测试/turn-watch-verify/b-last-resort.test.ts`（1） | 保持 B1 既有 cancelled 名；只把 10s 检查时限的等待与清理去抖，不改变时限语义。 |
| `test/测试/g4v2-mcp-verify/f-handler.test.ts`（1） | F3 护栏矩阵同上；与 e-handler 同一 helper 时复用。 |
| `test/测试/queue-recovery-e2e.test.ts`（1） | `回交未持久化` 改为持久化事件/文件 ready 后断言；不降级持久化要求。 |
| `test/桌面应用/interface.test.ts`（1） | `requestRoleStates` 忙锁：在 `changeProjectSource` 前等待进行中派发/权限变更 settle，或对 busy 做有界重试；不吞产品错误。 |

验证：11 文件 3× 自然退出；flake 目标名不再出现；不得新增 skip/todo；known-red diff 空。B5 不与 B1 同时改 `session-rebuild-race`（避免冲突）。

### 4.9 B6（P2）：B0 其他 + 未归类

| 文件 | 一句改法 |
| --- | --- |
| `test/测试/g4-skill-verify/h-scope-audit.test.ts`（3） | installMcp/installSkill 能力矩阵断言与当前矩阵对齐；`test/… 不得引用 .probe` 的扫描范围按真实生产/测试边界更新。 |
| `test/测试/t1-pipeline-integration.test.ts`（3） | T1 确认暂停/中止/过期 yes 的期望按当前 Pipeline 语义更新；保「stale yes 拒绝、current yes 放行」。 |
| `test/测试/trunk-stable-write-integration.test.ts`（2） | `active-role-evidence-missing-or-mismatched` fixture 补真实角色证据；stable workflow 快照断言不变。 |
| `test/测试/g3-search-verify/pi-loopback-verify.test.ts`（1） | 两轮检索的 turnId 配对按真实事件顺序重放；不弱化「id 不串」。 |
| `test/桌面应用/session.test.ts`（1） | AC-8 索引/详情字节 pin 按实际当前字节更新（B1 实测 pin 的维护动作）；同时记录变更理由。 |
| `test/桌面应用/project.test.ts`（1） | 归档目录静默跳过的警告断言按当前枚举契约更新；不放过真实警告。 |
| `test/测试/entry-role-minimal-d.test.ts`（1） | D-04 撤除残留扫描按当前 src/app 生产源码更新白名单/排除项；不扩大到 dist/node_modules。 |
| `test/测试/g4v2-mcp-verify/f-handler.test.ts`（1） | `mcp.refused` 诊断按当前 reasonCode 落盘格式更新；系统行零投递断言保留。 |
| `test/桌面应用/log-actions.test.ts`（1） | listTasks/readRoleActivityLog/terminateRoleRun/redispatchTask 的返回形状按当前 API 更新；参数校验负例保留。 |
| `test/测试/direct-role-capabilities-e2e.test.ts`（1） | Q normal-new 的 `docs/product…` 选择 fixture 补真实文档；确认卡未发出断言保留。 |
| `test/测试/git-role-workflows-e2e.test.ts`（Q30，1） | Q30 依赖的 `2026-11-05_git-role-permissions-evidence` 目录在 B7 已清理；改为测试自建最小 fixture 或显式跳过（记录原因），不读仓库内已删除产物。 |
| `test/claude-adapter/schema.test.ts`（1） | `required` 与 B3a 同一来源门，B3a 一并处理；本批只复跑。 |
| `test/桌面应用/b31-fixed-release-auto-desktop.test.ts`（1） | x64-only 的路径 B merge-main 断言先 3× 复跑；若稳定红，按当前 release/merge 语义更新；不弱化「客户 approve 才合并」。 |
| `test/runtime-core/file-write-safety.test.ts`（1） | `D3 lstat ENOTDIR` 的 macOS 错误码文案与正则 `无法读取目标状态.*ENOTDIR` 对齐（或产品错误映射明确平台文案）；保留「ENOTDIR 不当新文件回退」。 |
| `test/编排/git-command.test.ts`（1） | `Git init journal: restart discovery binds the original operation…` 先 3× 复跑；若 B2 后仍红，按 journal 绑定语义更新 fixture。 |

验证：每个名字至少 2 次隔离运行 + 1 次整文件；输出「确定性红 / 红绿漂移 / 绿」三态；确定性红进入产品/测试修复，漂移项登记为 flake 族；不得留在「未知」。

### 4.10 B7（P2）：收口与重冻结

- 三平台各跑一次全量（`workflow_dispatch`，owner 触发）；记录 tests/pass/fail/cancelled/skipped 与唯一失败名。
- 三套 known-red 逐名 diff：runtime-core 33、门禁 5、编排 24；预期空；若某名转绿，按「REMOVED」登记并在新基线中移除。
- 重建/新增桌面基线：把 B0 191 名中仍稳定红的桌面/编排名，按「确定性红」与「flake 族（按族不按名）」分开冻结；建议新增 `desktop-known-red`（文件+日期+hash）。
- 复核 `git-config` 族 113 名清零、source/VCA/drift/flake 批次目标名清零或只剩已裁决的冻结项。
- 更新本计划后续状态；不 commit/push（由调度统一提交）。

## 5. 优先级与成本

### 5.1 优先级

1. **B1 挂起/泄漏（P0）**：Windows 预算先削。当前每轮 Windows 约 120 分钟触顶；B1 后目标 ≤ 60 分钟。首轮 CI 必须只跑 B1 或 B1+无冲突小批，便于观察 Windows 是否仍停顿。
2. **B2 macOS git-config（P0）**：单批覆盖 113 名（占 macOS 唯一名 39.6%），投入产出最高；产品白名单一行 + 一条测试钉。
3. **B3a/B3b/B3c（P1）**：确定性非 known-red；需 owner 先裁决 source 门/VCA 语义与 CI 路径 guard 口径。
4. **B4（P1）**：e71501c 语义漂移；与 B3 同一轮 CI（文件不重叠）。
5. **B5（P2）**：flake 硬化；在确定性批次后进行，避免把产品/语义问题误当 flake。
6. **B6（P2）**：剩余 B0 其他 + 未归类；逐文件 3× 定性。
7. **B7（P2）**：收口/重冻结。

### 5.2 CI 成本

| 轮次 | 内容 | 预计 wall time | 说明 |
| --- | --- | --- | --- |
| R1 | B1 | 约 60–130 分钟 | 未修好泄漏时 Windows 仍可能触顶 120m；这是观察轮 |
| R2 | B2 | 约 45–70 分钟 | 三平台并行；mac 22–29m，Windows 无停顿后约 30–50m |
| R3 | B3a+B3b+B3c+B4 | 约 45–70 分钟 | 文件不重叠，可合并 |
| R4 | B5+B6 | 约 45–70 分钟 | flake/剩余定性 |
| R5 | B7 | 约 45–70 分钟 | 全量复跑与基线 |

总计约 **5 个三平台轮次、4–6 小时 CI wall time**（按 Windows 修复后估算）；若 B1 未彻底消除停顿，R1/R2 可能各多花 1 小时。每轮三平台 job 并行，实际等待由 Windows 决定。

### 5.3 首轮建议（明确文件）

首轮只做 B1，文件顺序：

1. `test/测试/git-role-workflows-e2e.test.ts`（先修 Q2 P2 失败路径的 dispose/canonicalize，直接消除 89 分钟静默停顿的最大嫌疑）。
2. `test/桌面应用/session-rebuild-race.test.ts`（300s 挂起；加 bounded deadline）。
3. `test/桌面应用/stuck-redispatch.test.ts`（300s 挂起；加 bounded deadline）。

B1 验证通过后立即做 B2：`src/provider/trunk/impl/git-command.ts` + `test/编排/git-command.test.ts`，这是单批收益最大的确定性修复。

## 6. 未归类项说明（3 名）

| 名字 | 文件 | 原因 |
| --- | --- | --- |
| `路径 B：B3 accepted（+运营报告）⇒ 自动呈 merge-main；客户 approve ⇒ 合并 + 交付关闭（不要求 A12b/归档）` | `test/桌面应用/b31-fixed-release-auto-desktop.test.ts` | 仅 x64 出现、arm64 通过、B0/B7 未收录；单轮样本无法区分平台/时序 flake 与确定性语义变化。先 3× 复跑，再归 B4/B5。 |
| `D3 lstat ENOTDIR is a status error, never a new-file fallback` | `test/runtime-core/file-write-safety.test.ts` | triage 已提示 macOS 的 ENOTDIR 错误码文案可能是独立平台差异；本轮错误正则为 `无法读取目标状态.*ENOTDIR`，需确认产品映射/测试正则哪边过时。归 B6。 |
| `Git init journal: restart discovery binds the original operation and excludes FS/ref media` | `test/编排/git-command.test.ts` | 仅 x64 出现、B0/B7 未收录；与 B2 的 git-config 面可能同源，也可能为 journal 绑定语义变化；B2 后 3× 复跑再定性。归 B6。 |

## 7. 风险与披露

1. **Windows 日志不完整**：job 在 120 分钟被取消，只覆盖约 30 分钟测试输出；117 名不是 Windows 全量失败集。B0 的 61 名未在本轮出现不能当作 Windows 转绿；B0/B7 的 130 名交集才是稳定既有红。
2. **错误体归因限制**：macOS 最终 section 有完整断言体；Windows inline `✖` 行没有错误体（顶层 `failing tests:` 从未输出），Windows 的家族归因主要靠同名映射 + 日志上下文推断。块级错误码归因（`10-block-codes.json`）只覆盖 macOS 最终 section；W5/W10 父测试仅 inline 出现，按子测试族归属。
3. **300000ms 条目口径修正**：本轮没有「文件级 300000ms」条目；实际是 2 个测试级条目，各 2 个文件。Windows 的 89 分钟停顿没有任何 `--test-timeout` 条目，属于文件测试结束后的句柄泄漏/事件循环不退出，需 Windows 复现确认具体句柄。
4. **`core.precomposeunicode` 根因的证据边界**：探针在本机 Windows 上证明「加键即拒绝、去键即通过」；macOS `git init` 默认写入该键是上游 git 行为，但 CI 日志不打印 `.git/config` 原文，未在 macOS runner 上直接抓取。B2 修复后必须以 macOS 定向复跑确认 113 名清零；若仍有残留，回到 B6 逐名定性。
5. **产品回归候选未定性**：W19、source 门、VCA 直接提交、multi-runtime open、requestRoleStates、installMcp/installSkill 等都在本计划中只报告、不排修；owner 裁决前不得把「测试期望更新」当作默认处置。
6. **flake 证据来自历史与本轮时序名**：本轮 ENOTEMPTY/Node 原生断言/ AggregateError 均为 0；flake 族的分类依据是 E3/E3-F/D1/B8.2 的既有登记与本轮 `D1 test wait expired`/`waitFor 超时`/`离线回交未入队` 等时序错误，以及 2 名 x64-only、2 名 Windows-only 的跨平台漂移；单轮样本不足以证明具体 flake 频率。
7. **known-red 冻结集可能过时**：33/62 命中，29 名未出现；triage §4.2/§7.4 已提示 runtime-core 33 中 25 名在 B7.1 Windows neutral-cwd 已绿。B7 收口时应按「当前真实红」重冻结，避免旧名单拖住清零。
8. **口径差异披露**：唯一失败名 285/287/117 与 `ℹ fail` 282/284/无 的差异来自父/子计数与嵌入子 runner 输出；分族计数以唯一名为准，平台失败数以汇总为准。B0 191 与 B7 190 的唯一名差异（REMOVED 2 + i18n 已解决）沿用 B7 §4.3/§4.4 的记录。
9. **本报告未做的事**：未修改任何代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 workflow；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未在 macOS 本机复跑（无 macOS 环境），所有平台结论来自 CI 日志与 Windows 本机探针。

## 8. 未决问题

1. **B2 产品修复批准**：是否由 owner/桌面角色批准在 `src/provider/trunk/impl/git-command.ts` 的 core 白名单加入 `precomposeunicode`？若不批准，是否接受测试侧在每个真实 git fixture 上删除该键（26 文件、维护成本高、且真实 macOS 用户仍会命中）？
2. **source 门语义**：legacy 项目是否允许无真实 accepted 客户轮次的直接派发？若允许，`app/desktop/session.ts` 是产品缺陷（产品候选，移出 B3a）；若不允许，B3a 按真实轮次更新 harness。
3. **VCA 直接提交语义**：`submitDirect` 是否应接受 legacy/测试宿主路径？决定 B3b 是产品修复还是测试装配更新。
4. **W19 close 通知**：`closeCreatedTask` 是否应调用 `notifyDirect`？决定产品修复或测试期望更新（batch2 B2-3）。
5. **multi-runtime CI 根因**：`manager.open` 在 CI 上为何不调用注入的 `openRoleSession`（假根 `/one` 在 CI 环境不成立，还是产品准入变化）？需在 CI-like 环境 3× 复现后定性；若产品准入变化，转产品候选。
6. **Windows 静默停顿句柄**：Q2 P2 失败后未释放的是 fixture HTTP server、子进程还是文件 watcher？B1 的 dispose 顺序修复是否足以消除 89 分钟停顿，需 R1 验证。
7. **基线重冻结口径**：B7 是否把桌面套件新增为第四套 known-red（确定性名 + flake 族分开）？runtime-core 33 是否按 B7.1 的 8 名口径收敛？
8. **Q30 测试产物依赖**：B7 已删除 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`（197→329MB 测试产物）；Q30 是否应改为自建 fixture、显式跳过，还是恢复最小证据目录？
9. **两个平台独有名**：`申请直达…`（x64-only）、`路径 B：B3 accepted…`（x64-only）、`W36`/`W48`（Windows-only）是 flake 还是平台语义？需 3× 跨平台复跑。
10. **workflow 侧止血（非测试债，需 owner 决策）**：`test-ci.yml` 是否增加 step 级 `timeout-minutes` 或 `--test-force-exit`（仅开发反馈 workflow，不改发布门）以在泄漏再次发生时快速失败？本计划不修改 workflow，仅提出风险。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `extract-ci-failures.mjs` | 三平台 gh 日志 + Windows 工件提取：汇总、`✖` 去重、文件级判定、超时、静默间隔 |
| `classify-failures.mjs` | 与 B0 191 / B7 190 / known-red 62 / triage 186 合并去重；仓库测试文件反查 |
| `attribute-blocks.mjs` | macOS 最终 `failing tests:` section 逐块错误码归因（避免 300 字截断漏掉下游 `git-config`） |
| `assign-families.mjs` | 互斥分族规则与 `11-families.json` / `12-family-summary.tsv` |
| `13-precompose-probe.mjs` / `.txt` | `core.precomposeunicode` 探针脚本与输出（WITH_KEY=REJECTED / WITHOUT_KEY=ACCEPTED） |
| `01-ci-failures.json` | 三平台完整提取（含 artifactCheck、timeouts、stall、notes） |
| `05-platform-counts.json` | 三平台计数速览（job 元数据、汇总、唯一名、文件级 0、超时数、静默间隔） |
| `02-failnames-macos-arm64.txt` / `03-failnames-macos-x64.txt` / `04-failnames-windows-cancelled.txt` | 逐平台唯一失败名 + 文件（tab 分隔） |
| `06-merged-universe.json` | 289 名并集：平台出现、日志/仓库文件映射、B0/B7/KR/triage 命中、首个错误行 |
| `07-by-file.tsv` | 按测试文件分组的失败名清单 |
| `08-set-summary.json` | 集合交集与平台独有统计 |
| `10-block-codes.json` | 逐名块级错误码（283/285 块） |
| `11-families.json` | 互斥分族全量（含每族文件计数、平台计数、跨列、产品候选标记） |
| `12-family-summary.tsv` | 族汇总（族/数量/top 文件） |
| `14-timeouts-and-stall.json` | 300s 条目、文件级条目、Windows 静默间隔与汇总 |

## 附录 B：复现命令

```bash
# 下载三平台日志（原始日志只放 /tmp，不入库）
mkdir -p /tmp/ci-logs
gh run view 43421603526 --job 131872698153 --log > /tmp/ci-logs/macos-arm64.log
gh run view 43421603526 --job 131872698562 --log > /tmp/ci-logs/macos-x64.log
gh run view 43421603526 --job 131872698592 --log > /tmp/ci-logs/windows.log
gh run download 43421603526 -n test-logs-win-x64 -D /tmp/ci-logs/artifact-win

# 提取 + 合并 + 归因 + 分族（在计划工作树根执行）
node 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/extract-ci-failures.mjs \
  --arm64 /tmp/ci-logs/macos-arm64.log --x64 /tmp/ci-logs/macos-x64.log \
  --win /tmp/ci-logs/windows.log --win-artifact /tmp/ci-logs/artifact-win/test-ci-output.log \
  --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence
node 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/classify-failures.mjs \
  --ci 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/01-ci-failures.json \
  --b0 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/full/b0-frozen-failnames-191.txt \
  --b7 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/full/failnames.txt \
  --kr-dir 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/knownred \
  --triage 角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md \
  --tests-root test --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence
node 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/attribute-blocks.mjs \
  --arm64 /tmp/ci-logs/macos-arm64.log --x64 /tmp/ci-logs/macos-x64.log \
  --out 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/10-block-codes.json
node 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/assign-families.mjs \
  --universe 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/06-merged-universe.json \
  --blocks 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/10-block-codes.json \
  --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence

# git-config 根因探针（只读；不改仓库）
node 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/13-precompose-probe.mjs \
  --repo "$(pwd)"
```

## 附录 C：关键结论速览

- 三平台失败计数：macOS arm64 **282 fail / 3 cancelled**（5,823 tests，唯一名 285）；macOS x64 **284 / 3**（唯一名 287）；Windows **cancelled @120m**（117 唯一名，无最终汇总）。
- 最大确定性块：**macOS git-config 113 名**（`core.precomposeunicode` 不在产品 core 白名单；本机探针复现），单批修复可清约 40% 的 macOS 失败名。
- 第二大块：**CI 路径规范形/守卫 36 名**（multi-runtime 22 + git-action guard 13 + Q2 P2/W48），跨平台，需先复现定性。
- Windows 预算第一元凶：**89 分钟静默停顿**（`git-role-workflows-e2e.test.ts` Q2 P2 失败后的 fixture 泄漏），不是两个 5 分钟 timeout；文件级 300000ms 条目为 0。
- 冻结 known-red 仅 33/62 命中；B0/B7 稳定交集 130 名；历史 triage 旧标签只作线索。
- 首轮：B1（e2e 泄漏 + session-rebuild-race + stuck-redispatch）先削 Windows 预算；第二轮：B2（产品白名单 + 测试钉）。
