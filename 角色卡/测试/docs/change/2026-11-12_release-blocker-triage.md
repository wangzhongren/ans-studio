# v2.0.0 发布阻断治理：macOS Regression 失败分流报告（2026-11-12）

- 角色：ANS「测试」（roleId: 测试）；本文件为唯一仓库写入，**未修改任何测试/产品代码，未 commit，未触发 CI，未 push**。
- 任务：对 CI run `43138943189` 的 macOS arm64 job `130920941222`（Regression tests 挂起 45 分钟取消）做只读分流：提取失败名 → 映射测试文件 → 按根因分组（冻结 known-red / macOS 特有 / 疑似新引入 / 未知）→ 给出修复批次建议。
- 工作树事实（与派单文字有出入，如实记录）：当前工作树为 `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`，分支 **`release-v2.0.0-pointer`**，HEAD **`3edf2e5`**（不是派单所述 `feat/two-fixed-workflow-paths`）。`git diff 7cb9eea 3edf2e5` 仅 `.github/workflows/release.yml` +1 行（core.longpaths），**`test/` 与 `src/` 和 CI 运行提交 `7cb9eea` 完全一致**，因此本地源码可用于本次映射。
- 结论摘要：187 条 ✖ 去重条目（含 1 条 reporter 汇总头 `failing tests:`，真实测试/子测试名 **186** 个）；按任务口径分为 **冻结 known-red 31 / macOS 特有 120 / 疑似新引入（非冻结、Windows 基线亦失败）35 / 未知 0**。造成 120 条 macOS 特有失败的主因高度集中：**macOS `os.tmpdir()` 是 `/var/folders/...` 符号链接路径，Core 准入的 `readGitHostProtectionRequirement` 把「输入根 ≠ realpath 根」判为 `noncanonical-project-root` ⇒ 保护范围 `unknown` ⇒ `bindRole/composeContext` 直接抛 `runtime-protection-scope-unknown`**。该机制与 B7.1 evidence 已记录的 linked-worktree `.git` 文件导致同一错误码的 25 条额外失败同源。挂起点为 `test/桌面应用/decision-service.test.ts` 之后、`optional-acceptance.test.ts` / `diagnostics.test.ts` 均无任何输出；按协调方事实，`optional-acceptance.test.ts` 为挂起嫌疑（另一角色并行修复），本报告不重复计入 186。

---

## 一、数据来源与命令

| 项 | 值 |
| --- | --- |
| CI run | `43138943189`（workflow `release.yml`，event `workflow_dispatch`，`Build and verify release`） |
| 运行提交 | `7cb9eea7519238973455f8c5a7bd4010f29d19f8`（`main`，提交信息 `ci(release): point pipeline at v2.0.0`） |
| 目标 job | `130920941222` - `build (macos-15, mac, arm64)`，conclusion `cancelled` |
| 对照 job | `130920940909` - `build (macos-15-intel, mac, x64)`，同样 `cancelled` |
| Windows job | `130920941465` - `build (windows-2025, win, x64)`，conclusion `failure`；**在 `actions/checkout` 阶段 `git.exe` exit 1，未进入测试**，本次 run 无 Windows 测试数据 |
| 日志落盘 | `gh run view 43138943189 --repo wangzhongren/ans-studio --job 130920941222 --log > <tmp>/job-130920941222.log`（561,891 bytes / 3,359 行；临时目录，不修改仓库） |
| 测试命令 | `working-directory: .release/source` + `node --test --test-concurrency=1 "test/**/*.test.ts"`（`.github/workflows/release.yml:74-76`） |
| 失败名提取 | 对 `Regression tests` 步骤行做正则 `\tRegression tests\t\S+Z ( {0,2})✖ (.*)$`，去掉尾随 `(123.4ms)`；按名称去重。✖ 行共 **198** 条，去重 **187** 条（含 4 条 `✖ failing tests:` 汇总头合并为 1 条）；排除汇总头后真实名 **186** 个（177 个顶层 test + 9 个 `t.test` 子测试） |
| 映射 | 对 `test/**/*.test.ts`（625 个文件）做精确子串匹配；对模板字符串动态名用唯一前缀定位到文件；对 9 个通用子测试名按日志上下文（`▶ W5 ...` 后的 `t.test(mode)`）钉到 `test/桌面应用/chief-workflow.test.ts` |
| known-red 基线 | `角色卡/运行时核心/docs/change/2026-11-09_WJ1_judge-delegated-evidence/runtime-core-post-full.tap.txt`（✖ 去重 33，排除 `failing tests:`）；`角色卡/运行时核心/docs/change/2026-11-10_B2_two-fixed-workflow-paths-evidence/07-gates-failure-names.txt`（5）；`角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-05-known-red-failnames.txt`（24） |
| 平台对照基线 | B7.1 `09-readonly-suites/runtime-core-neutral-cwd.tap`（Windows，runtime-core 586 tests / 574 pass / 8 fail）；B8.2 `10-after-fail-names.txt`（Windows 桌面套件 811 tests / 701 pass / 100 fail / 10 cancelled，去重 106 名）；B7.1/B8.2 `06/10-after-*.tap` 的 `ok` 记录 |
| 交叉核验 | macOS arm64 与 macOS x64 两份日志各自去重 **186 名，集合完全相同**（0 差异） |

时间线：Regression tests 步骤 `02:06:35.663Z` 开始；最后一条测试输出 `02:11:16.856Z`（`✔ 应用自有 decision 卡通过共享校验…`，`test/桌面应用/decision-service.test.ts`）；此后 **≈39 分 22 秒零输出**，`02:50:38.966Z ##[error]The operation was canceled.`（步骤共 ≈44 分钟）。

---

## 二、失败名清单与文件映射

- 顶层清单见 **附录 A.1**（按文件分组，含 `KR`/`MAC`/`NEW` 标签），按组/交集明细见 A.2/A.3。
- 全部 **186 个真实名 100% 映射到 35 个测试文件，未能映射 0 个**。
- 初始精确 grep 命中 165/186；未命中的 **21 个**全部是源码中的**模板字符串动态名**，用唯一前缀/日志上下文人工钉定，见第六节。
- 9 个通用子测试名（`enumerated`/`selected`/`cancelled`/`changed`/`model-source`/`commit-race`/`unmanaged`/`unmanaged-system`/`required`）是 `test/桌面应用/chief-workflow.test.ts` 中 `W5` 父测试的 `t.test(mode)`（源码 786、944 行两个循环），不是独立测试文件；父测试 `W5 专字段真实workSourceRef…` 同时也在失败名中，因此 W5 家族在本报告中按「父 1 + 子 9」计数（若按顶层测试计，总数 186→177）。

| 文件 | 失败数 | KR | MAC | NEW |
| --- | --- | --- | --- | --- |
| `test/桌面应用/chief-workflow.test.ts` | 42 | 0 | 14 | 28 |
| `test/runtime-core/report-provenance.test.ts` | 18 | 0 | 18 | 0 |
| `test/runtime-core/session.test.ts` | 18 | 3 | 15 | 0 |
| `test/runtime-core/git-capability-tools.test.ts` | 16 | 7 | 9 | 0 |
| `test/runtime-core/session-admission-approval.test.ts` | 9 | 0 | 9 | 0 |
| `test/runtime-core/session-lifecycle.test.ts` | 8 | 0 | 8 | 0 |
| `test/claude-adapter/session.test.ts` | 6 | 0 | 6 | 0 |
| `test/桌面应用/chain-enforcement.test.ts` | 6 | 0 | 0 | 6 |
| `test/runtime-core/prompt-start-acknowledgement.test.ts` | 5 | 4 | 1 | 0 |
| `test/runtime-core/view-image-policy.test.ts` | 5 | 0 | 5 | 0 |
| `test/pi-adapter/tool-display-projection.test.ts` | 4 | 0 | 4 | 0 |
| `test/runtime-core/background-review.test.ts` | 4 | 0 | 4 | 0 |
| `test/runtime-core/codex-native-optional.test.ts` | 4 | 0 | 4 | 0 |
| `test/runtime-core/reasoning-effort.test.ts` | 4 | 4 | 0 | 0 |
| `test/pi-adapter/injected-runtime.test.ts` | 3 | 0 | 3 | 0 |
| `test/runtime-core/abort-quarantine.test.ts` | 3 | 3 | 0 | 0 |
| `test/runtime-core/background-session-access.test.ts` | 3 | 0 | 3 | 0 |
| `test/runtime-core/effective-timeouts.test.ts` | 3 | 3 | 0 | 0 |
| `test/桌面应用/ans-wiring.test.ts` | 3 | 0 | 3 | 0 |
| `test/runtime-core/application-mediation.test.ts` | 2 | 0 | 2 | 0 |
| `test/runtime-core/dispatch-workflow-writer-copy.test.ts` | 2 | 2 | 0 | 0 |
| `test/runtime-core/file-write-safety.test.ts` | 2 | 1 | 1 | 0 |
| `test/runtime-core/readonly-git-routing.test.ts` | 2 | 0 | 2 | 0 |
| `test/runtime-core/reasoning-facts.test.ts` | 2 | 0 | 2 | 0 |
| `test/runtime-core/submit-capability-tools.test.ts` | 2 | 2 | 0 | 0 |
| `test/codex-adapter/chat-transport.test.ts` | 1 | 0 | 1 | 0 |
| `test/runtime-core/download-tool.test.ts` | 1 | 0 | 1 | 0 |
| `test/runtime-core/governance-matrix-tool.test.ts` | 1 | 0 | 1 | 0 |
| `test/runtime-core/mcp-declarations.test.ts` | 1 | 0 | 1 | 0 |
| `test/runtime-core/request-requirement-change-tool.test.ts` | 1 | 0 | 1 | 0 |
| `test/runtime-core/shell-judge.test.ts` | 1 | 0 | 1 | 0 |
| `test/runtime-core/trunk-contract.test.ts` | 1 | 1 | 0 | 0 |
| `test/runtime-core/version-change-contract.test.ts` | 1 | 1 | 0 | 0 |
| `test/runtime-core/write-gate-context.test.ts` | 1 | 0 | 1 | 0 |
| `test/桌面应用/boundary-refresh.test.ts` | 1 | 0 | 0 | 1 |
| **合计** | **186** | **31** | **120** | **35** |

---

## 三、按根因分组表

### 分组规则（按任务口径，互斥按优先级）

1. **冻结 known-red**：与三套基线逐名匹配（不论平台原因）→ `KR`。
2. **macOS 特有**：未命中冻结集，且满足以下之一：
   - 在最近 Windows 基线（B7.1 `runtime-core-neutral-cwd.tap` / B8.2 `10-after-fail-names.txt` / 2026-11-11..12 的 `ok` tap 记录）中通过；或
   - 无 Windows 对照，但测试代码走 Core 准入（`createRuntimeAdapter(...).bindRole` / `prepareRole` / `desktop.openSession`）且使用 `mkdtemp(os.tmpdir())`，与已证实的 macOS 同因路径一致（高置信推断）。
3. **疑似新引入**（本报告中的 `NEW`）：未命中冻结集、且**在 Windows 基线中同名 `not ok` / 出现在 B8.2 after-fail-names**（即非平台差异）；这些几乎全部是 T3/固定路径时代新增/改写的桌面测试，属于「未冻结的既有红」或真实缺陷，需 owner 决定修复或补冻结。
4. **未知/需复跑**：无法归入以上者 → 本次 **0**。

| 组 | 失败数 | 代表名 | 文件 | 判定 | 依据 |
| --- | --- | --- | --- | --- | --- |
| **G1 冻结 known-red** | 31 | `Core-managed binding rejects a provider that did not register its display profile before first prompt`；`R12 every real Core bind shares the host lease and registry…`；`Service 三键读取注入…` | 11 个 `test/runtime-core/*`（session 3、git-capability-tools 7、prompt-start-ack 4、reasoning-effort 4、abort-quarantine 3、effective-timeouts 3、submit-capability-tools 2、dispatch-workflow-writer-copy 2、file-write-safety 1、trunk-contract 1、version-change-contract 1） | 冻结 known-red | 与 WJ1 runtime-core 33 逐名命中 31；gates 5 / 编排 24 交集 **0**（这两套在挂起前从未执行，见第八节）。**子拆分**：6 名在 B7.1 Windows neutral-cwd 仍 `not ok`（真 known-red）；25 名在 B7.1 Windows neutral-cwd 已 `ok`，说明 WJ1 冻结集已过时或该 25 名只是 macOS 环境触发（详见第五节） |
| **G2 macOS 特有（noncanonical 临时根 → scope unknown）** | 120 | `Service selects exactly chosen injected factory and executes real governed handler`；`ACK is not delivery: user failure has exact Provider count and history retry never invokes it`；`W1b 真实SessionManager…`；`W19 实际Core回报与Git回调同assignment…`；`R12 actual shell/governance judge tool modes…` | 23 个文件；主要集中在 `report-provenance` 18、`session` 15（非 KR）、`session-admission-approval` 9、`session-lifecycle` 8、`git-capability-tools` 9（非 KR）、`claude-adapter/session` 6、`chief-workflow` 14（非 NEW）、`view-image-policy` 5、`pi-adapter/*` 7、`codex-*` 2 等 | macOS 特有（高置信；其中 10 个 adapter 名无 Windows 对照，见备注） | ① 日志出现 `/var/folders/2s/.../T/...`（macOS `os.tmpdir()` 符号链接路径），`realpath` 会得到 `/private/var/folders/...`；② `src/provider/trunk/impl/git-command.ts:918 readGitHostProtectionRequirement` 在 `hostProjectKey(realpath(root)) !== hostProjectKey(input.projectRoot)` 时抛 `noncanonical-project-root` ⇒ `unknown`；③ `src/service/runtime/session.ts:231/1262/1283/1294` 把 unknown 变成 `runtime-protection-scope-unknown`（bind/compose 抛错；prepare 加 reason）；④ 日志 W19 错误原文 `runtime-creation-admission-unproven:runtime-protection-scope-unknown,custom-provider-factory-unverified`，W1b 的 `desktop.openSession(...).ok` 为 false；⑤ 同一组名在 macOS arm64/x64 完全相同；⑥ 同组名在 Windows B7.1/B8.2 基线为 `ok`（89 名 neutral-cwd `ok` + 21 名 2026-11-11/12 tap `ok`）；⑦ B7.1 `NOTES.txt` 已记录 linked-worktree `.git` 为文件时同码 `runtime-protection-scope-unknown` 造成 25 条额外失败、换中性 cwd 后清零，机制同源 |
| **G3 疑似新引入（非冻结、Windows 亦红）** | 35 | `D3 卡种收口…`（2 条）；`F4：质检报告按任务创建者路由…`；`M1/M2…`；`M5/M6/M7…`；`M9…`；`W5 专字段真实workSourceRef…`（+9 个子测试）；`W14 convener按本次真实任务冻结…`；`W19/W22/W23/W28×2/W29×4/W30×2/W33/W34/W35/W36/W47…`；`G-4 接线钉…` | `test/桌面应用/chain-enforcement.test.ts` 6；`test/桌面应用/chief-workflow.test.ts` 28（父 19 + 子 9）；`test/桌面应用/boundary-refresh.test.ts` 1 | 疑似新引入（按任务定义：与冻结基线无交集且非平台差异） | 26 个顶层名 + W5 的 9 个子测试；26 个顶层名全部出现在 **B8.2 `10-after-fail-names.txt`（Windows，2026-11-11，after 状态）**；W5 父名同样在 B8.2 after 失败名单中。多数为 T3/固定路径时代新增/改写的桌面链路测试。B8.2 文档已把其中部分标为环境非确定（W14 Windows `ENOTEMPTY`、W20/W47 偶发）或已知红，但**不在三套冻结基线内**，需要 owner 决定修复或补冻结 |
| **G4 未知/需复跑** | 0 | — | — | 无法归类 | 无（所有名均可归入 G1–G3；G2 中 10 个 adapter 名为代码路径高置信推断，未单列为未知，风险见第八节） |
| **独立组：挂起** | 1 个文件（未计入 186） | `test/桌面应用/optional-acceptance.test.ts`（协调方已知挂起嫌疑） | 同左；`test/桌面应用/diagnostics.test.ts` 同样零输出 | 挂起（另一角色并行修复） | 最后输出停在 `decision-service.test.ts`；两文件均无任何测试输出；按协调方事实归 optional-acceptance，不重复计入修复批次 |

---

## 四、与三套冻结 known-red 的交集（31）明细

三套基线：RC = `runtime-core-post-full.tap.txt` 去重 33；G = `07-gates-failure-names.txt` 5；O = `b17-05-known-red-failnames.txt` 24。并集 62，CI 186 名与之交集 **31（全部来自 RC；G/O 交集 0）**。

**说明：G/O 交集为 0 不代表通过**——挂起发生在 `decision-service.test.ts` 之后，`test/门禁引擎`、`test/编排`、`test/roles`、`test/测试`、`test/装配`、`test/项目管理` 等目录在日志中没有任何测试输出，从未执行。挂起修复后必须重新核验这两套 known-red。

以下 31 名按 B7.1 Windows neutral-cwd（2026-11-11，586 tests / 574 pass / 8 fail）状态拆分为「仍红（真冻结）」6 与「Win 已绿（冻结集过时/平台触发）」25：

### 4.1 B7.1 Windows neutral-cwd 仍 `not ok`（6，真 known-red）

| # | 名称 | 文件 |
| --- | --- | --- |
| 1 | Core-managed binding rejects a provider that did not register its display profile before first prompt | `test/runtime-core/session.test.ts` |
| 2 | D3 linked workspace root remains usable; linked target itself is not replaced | `test/runtime-core/file-write-safety.test.ts` |
| 3 | dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」 | `test/runtime-core/dispatch-workflow-writer-copy.test.ts` |
| 4 | dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行 | `test/runtime-core/dispatch-workflow-writer-copy.test.ts` |
| 5 | doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6） | `test/runtime-core/version-change-contract.test.ts` |
| 6 | 主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3） | `test/runtime-core/trunk-contract.test.ts` |

### 4.2 B7.1 Windows neutral-cwd 已 `ok`（25，冻结集过时或仅 macOS 触发）

Pi env 300s/310s…；R12 actual shell/governance judge tool modes…；R12 every real Core bind shares the host lease…；R12 interruption during async factory preparation…；R2 Service real-chief context…；R2 chief timeout…；R8 a custom factory cannot self-report…；R8 active HTTP inference alone…；R8 native registry/instance/role/runtime/activity…；Service explicit Pi timing overrides…；Service 三键读取注入…；abort rejection keeps quarantine…；abort rejection no longer quarantines forever…；acknowledged turns keep aborted/timed_out…；active and disposed prompt rejections…；actual Service registry snapshots…；all runtimes read the same inspection env…；normal abort without cleanup failure…；outer aborted result stays aborted…；outer timeout remains timed_out…；quarantined prompt rejection…；synchronous acknowledgement throw…；未设/空串 ⇒ 字段缺席…；诊断自身故障不改变执行…；非法值 ⇒ 按未设处理…。

> 这 25 名与 G2 的 macOS 机制高度重合：WJ1 基线（2026-11-09）捕获的 runtime-core 红，在 B7.1（2026-11-11）的 Windows 中性 cwd 已绿；CI 中再次失败更像 macOS 环境触发而非产品回归。**建议协调方以 B7.1 的 8 名 Windows 基线重新冻结 runtime-core，而不是继续使用 WJ1 的 33 名**（本报告仍按派单口径把这 25 名计入 KR）。

---

## 五、未能映射名单

**0 个**。原始精确 grep 未命中的 21 个已全部人工钉定：

| 原始未命中类型 | 数量 | 处理 |
| --- | --- | --- |
| 动态模板名 `ACK is not delivery: ${phase} failure…` | 3 | 前缀命中 `test/runtime-core/report-provenance.test.ts`（源码 64 行 `for(const phase of ['user','boundary','index'])`） |
| `test/桌面应用/chief-workflow.test.ts` 动态模板名（W20/W21/W28/W29/W30/W47/W48/W35/W36 等随场景/模式展开） | 18 | 前缀唯一命中 + 源码模板字符串（如 1502、1580、2162、2251 行）人工钉定 |
| 通用子测试名（`enumerated` 等 9 个） | 9 | 日志上下文 `▶ W5 …`、`W52 W5 primary failure <mode>` 与源码 786/944 行 `t.test(mode)` 钉定；父测试 W5 同时失败 |
| reporter 汇总头 `failing tests:` | 1（不计入 186） | 非测试名，仅作为 node:test 汇总块标记排除 |

---

## 六、建议修复批次（≤5 批）

> 原则：先修平台根因（一批解决 ~120 名 + 25 名过时冻结），再修挂起，再处理真正的 known-red 与未冻结红，最后重跑双平台并重建基线。所有批次均需在 macOS arm64 + x64 和 Windows 至少各跑一次受影响文件。

### 批次 1（P0）：macOS 非规范临时根 → 保护范围 unknown

- **文件**：
  - 产品：`src/provider/trunk/impl/git-command.ts`（`readGitHostProtectionRequirement` / `hostProjectKey`，918 行附近；核心修复点）
  - 产品（仅在必要时）：`src/service/runtime/session.ts`（`readCoreProtectionScope`，231 行；可在 Core 边界统一 canonicalize）
  - 测试（可选、二选一）：G2 覆盖的 26 个测试文件可统一加 `realpath`（如 `const root = await realpath(await mkdtemp(...))`），但这只是测试侧规避，不修复真实 macOS 用户的 `/var` 符号链接项目根；其中 `file-write-safety.test.ts` 的 ENOTDIR 一项可能属独立的 macOS 错误码语义差异，需单独确认
- **根因**：macOS `os.tmpdir()` 返回 `/var/folders/...`，`realpath` 为 `/private/var/folders/...`；现有守卫把「输入根 ≠ realpath 根」当作 `noncanonical-project-root` → `unknown`。建议把项目根在进入保护事实计算前**一次 canonicalize**（realpath 后以规范根为身份），保留「realpath 失败 / `.git` 为文件或符号链接 / 控制目录不安全」的 fail-closed 判定（B7.1 的 linked-worktree 语义不变）。
- **预期验证**：
  1. 单测钉：以 `/var/folders/...` 符号链接根的临时项目调 `readGitHostProtectionRequirement` 返回 `unmanaged`（或按真实 `.ans` 事实返回 `required`），**不再 unknown**；`createRuntimeAdapter(...).bindRole` 成功；
  2. 目标文件重跑（macOS arm64/x64）：`test/runtime-core/report-provenance.test.ts`、`session.test.ts`、`session-admission-approval.test.ts`、`session-lifecycle.test.ts`、`git-capability-tools.test.ts`、`view-image-policy.test.ts`、`background-review.test.ts`、`codex-native-optional.test.ts`、`reasoning-facts.test.ts`、`readonly-git-routing.test.ts`、`claude-adapter/session.test.ts`、`pi-adapter/injected-runtime.test.ts`、`pi-adapter/tool-display-projection.test.ts`、`codex-adapter/chat-transport.test.ts`、`test/桌面应用/ans-wiring.test.ts`、`chief-workflow.test.ts`（预期 G2 120 名清零、25 名过时 KR 一并转绿）；
  3. Windows 回归：同一组文件在 Windows 保持 B7.1 neutral-cwd 的 8 名基线不回退；
  4. 安全负例：非 canonical 的**真实恶意**根仍拒绝（例如 `.git` 为文件/符号链接、`.ans/trunk` 为符号链接）。
- **是否允许 overlay 精确条目**：**允许，但仅限 `src/provider/trunk/impl/git-command.ts`（必要时 + `src/service/runtime/session.ts`）的精确行**；这属于产品修复，应作为独立批准变更，不可借 overlay 绕过全量门。测试 helper 的 `realpath` 改动可走精确测试文件 overlay（若 owner 选择测试侧规避）。

### 独立项（前置，不计入本 triage 修复批次）：`optional-acceptance.test.ts` 挂起（另一角色并行修复）

- **文件**：`test/桌面应用/optional-acceptance.test.ts`；同时排查 `test/桌面应用/diagnostics.test.ts`（日志中两者均零输出）。
- **根因**：挂起（具体调用栈日志不可得；按协调方事实归 optional-acceptance）。
- **预期验证**：在 macOS `.release/source` 语义下用带超时的定向运行（如 shell `timeout` 包一层 `node --test --test-concurrency=1 test/桌面应用/optional-acceptance.test.ts`），确认文件在分钟级内完成；随后确认 `decision-service.test.ts` 之后能继续推进到 `diagnostics` 及后续目录；再跑全量。
- **overlay**：等 owner 修复后，仅允许该测试文件（及必要的测试 helper）精确条目 overlay；**本 triage 不重复计入修复批次**。

### 批次 2（P1）：真冻结 known-red（6 名，B7.1 Windows 仍红）

- **文件**：`test/runtime-core/dispatch-workflow-writer-copy.test.ts`（2）、`test/runtime-core/file-write-safety.test.ts`（D3 linked root）、`test/runtime-core/session.test.ts`（Core-managed binding）、`test/runtime-core/trunk-contract.test.ts`、`test/runtime-core/version-change-contract.test.ts`。
- **根因**：文案/契约与 D3 linked-root 行为；这些在 Windows 与 macOS 都红，属于真已知红。需逐名给出「修产品 or 改期望」决定；若接受现状，则以新基线重新冻结。
- **预期验证**：每个文件分别在 Windows（B7.1 neutral-cwd 口径）与 macOS 跑；记录失败名与代码/文案依据；修后期望 6 名清零，冻结则新基线逐名一致。
- **overlay**：仅在 owner 确认「测试期望已过时」时允许精确测试条目 overlay；产品行为修复走正常变更，不允许 overlay 掩盖。

### 批次 3（P1）：非冻结、Windows 亦红的 T3 时代桌面链路（35 名）

- **文件**：`test/桌面应用/chain-enforcement.test.ts`（6）、`test/桌面应用/chief-workflow.test.ts`（19 父 + 9 子 = 28）、`test/桌面应用/boundary-refresh.test.ts`（1）。
- **根因**：B8.2 `10-after-fail-names.txt` 已存在同名 Windows 失败：D3 卡种收口（2）、F4/M9 报告路由、M1/M2 与 M5/M6/M7 advisory、W5 workSourceRef、W10 fresh scope、W14 冻结、W19 回报、W22/W23 verifier、W28/W29/W30 策划/意图、W33/W34/W35/W36、W47 revise、G-4 接线钉。B8.2 文档已把 W14（Windows `ENOTEMPTY`）与 W20/W47 标为环境非确定；其余需逐名复现。
- **预期验证**：先在 **Windows HEAD `7cb9eea`** 跑上述三个文件，确认与 B8.2 同名失败仍复现；再对每个名给「修产品 / 修测试 / 补冻结」三选一；修复后两平台目标文件清零；补冻结则写入新 baseline（文件名+日期+hash）。
- **overlay**：产品修复不允许 overlay；测试期望修正可精确条目 overlay；补冻结只改证据文档，不改测试。

### 批次 4（P2）：挂起修复后的全量双平台重跑与基线重建

- **文件**：无代码文件；重建 `角色卡/运行时核心/docs/change/…runtime-core`、`…07-gates-failure-names.txt`、`角色卡/编排/docs/change/…b17-05-known-red-failnames.txt`，并新增「桌面套件 known-red」清单（若批次 3 决定冻结）。
- **根因**：当前 RC 冻结集基于 WJ1（11-09），已被 B7.1（11-11）的 8 名 Windows 基线超越；G/O 在本次挂起 run 中从未执行；桌面套件缺冻结基线。
- **预期验证**：macOS arm64 + x64、Windows 三平台各跑一次 `node --test --test-concurrency=1 "test/**/*.test.ts"`；失败名与三套（或四套）冻结集逐名 diff 为空；记录测试数/pass/fail/cancelled；确认无 45 分钟挂起。
- **overlay**：无（仅文档与冻结基线更新）。

---

## 七、风险与限制

1. **日志截断**：186 名只覆盖挂起前已执行的测试文件；`test/门禁引擎`、`test/编排`、`test/roles`、`test/测试`、`test/装配`、`test/项目管理` 及 `test/桌面应用` 后半段（`diagnostics` 起）从未执行，真实失败总数一定 ≥186。三套 known-red 中的 gates 5、编排 24 交集为 0 仅是「未执行」，不可当作通过。
2. **错误细节缺失**：`node --test` spec reporter 的内联 ✖ 行不带错误体，日志中只有 4 个 W52 子进程的 `failing tests:` 摘要（含 `test at` 与断言文本）。除 W1b/W5/W19/W20/W21/W28/W29/W30/W33/W34 的 `openSession(...).ok === false` 与 `runtime-creation-admission-unproven:runtime-protection-scope-unknown,custom-provider-factory-unverified` 外，多数分组靠「文件/代码路径 + Windows 基线对照」推断，不是逐条断言级证据。
3. **Windows 对照的时点**：B7.1/B8.2 evidence 是 2026-11-11 的 Windows 结果；CI HEAD `7cb9eea`（11-12）还包含 B18–B34 的后续改动。因此「Windows 绿」不能 100% 排除 11-11 之后引入的跨平台回归；需在 Windows HEAD 上复跑受影响文件确认（批次 2/3/4）。本次 run 的 Windows job 在 checkout 阶段就失败，没有任何测试数据可用。
4. **冻结集过时**：WJ1 runtime-core 33 名中，25 名在 B7.1 Windows neutral-cwd 已绿；若继续按旧集判定，会把 25 名 macOS 环境失败误记为 known-red。建议协调方在修完批次 1 后重新冻结 RC 基线（B7.1 的 8 名口径），否则「known-red 清零」会被旧名单拖住。
5. **计数口径**：186 含 9 个 W5 子测试；若只算顶层 test，总数 177；W5 父 + 9 子在失败名中同时出现，属同一测试家族的父子双计。187 与 186 的差异仅是 node:test 的 `failing tests:` 汇总头（去重后 1 条），不是真实测试。
6. **挂起归属**：日志只能证明最后输出在 `decision-service.test.ts`、`optional-acceptance.test.ts` 与 `diagnostics.test.ts` 均零输出；究竟是哪一个文件挂起，日志不能单独定论。本报告按协调方事实把 optional-acceptance 列为挂起嫌疑，`diagnostics.test.ts` 建议同批排查。
7. **10 个无 Windows 对照的 adapter 名**（`test/claude-adapter/session.test.ts` 6、`test/codex-adapter/chat-transport.test.ts` 1、`test/pi-adapter/injected-runtime.test.ts` 3）：代码均使用 `createRuntimeAdapter(...).bindRole` + `mkdtemp(os.tmpdir())`，失败耗时 8–32ms（与同步抛错一致），按同因归入 macOS 组；但缺 Windows 同名对照，属高置信推断而非直接证据。若批次 1 修复后仍红，应转「未知/需复跑」独立调查。
8. **未做的事**：未跑全量或单文件测试（仅只读 grep/源码定位）；未触发 CI；未 push/commit；未修改任何测试/产品/角色卡/基线文件。报告文件由调度决定是否随 PR 提交。

---

## 附录 A：完整清单（186 个真实名）

### A.1 按测试文件分组（186 个测试/子测试名）

标签：`KR`=冻结 known-red 命中；`MAC`=macOS 特有（Windows 基线通过或同因高置信）；`NEW`=非冻结、Windows 基线亦失败（疑似新引入/T3 时代未冻结红）。

#### `test/claude-adapter/session.test.ts`（6）

- [MAC] Core strips C metadata before Claude and preserves exact SDK prompt/images while publishing safe display copy
- [MAC] actual handler thrown Error projects protected message, unknown throw stays opaque, model retains original generic failure
- [MAC] core Service receives real Claude MCP reports/dispatch receipts and saves replay with actual metadata
- [MAC] real Core projector receives actual args/rule/result execution while SDK content and opaque identities stay unchanged
- [MAC] required production path displays real read ENOENT and Node shell output without parsing result messages
- [MAC] web search on: native frames project one paired start/result per call; failure, unsupported content and budget text stay truthful and never fail the turn

#### `test/codex-adapter/chat-transport.test.ts`（1）

- [MAC] bounded Chief default Core and Codex reach only the real decision handler through local HTTP

#### `test/pi-adapter/injected-runtime.test.ts`（3）

- [MAC] Service -> real Pi native wiring shares injected wait gate, captured customer context and one terminal
- [MAC] Service saves actual fresh/resumed/recovered Pi metadata and public replay remains runtime-isolated
- [MAC] migrated Service/Pi timers honor legacy env once and native timeout normalizes to one timed_out terminal

#### `test/pi-adapter/tool-display-projection.test.ts`（4）

- [MAC] Core -> actual Pi -> real read/ENOENT/shell: display projected, execution remains private, SDK content unchanged
- [MAC] all nine injected names project start/result once; real declared rule wins over tool name; blocked and failed native end coexist
- [MAC] native bridge preserves handler result/throw and unsupported content, call identity and rule; metadata is not SDK options
- [MAC] real Pi shell exit0, spawn failure, signal and review denial retain actual process facts without invented exit

#### `test/runtime-core/abort-quarantine.test.ts`（3）

- [KR] abort rejection keeps quarantine when the underlying turn never settles
- [KR] abort rejection no longer quarantines forever once the underlying turn settles later
- [KR] normal abort without cleanup failure keeps its existing quarantine lifecycle

#### `test/runtime-core/application-mediation.test.ts`（2）

- [MAC] P1-A real default Codex session remains strict-observed and never gains the dual path
- [MAC] P1-A wrapper keeps applicationMediation absent for custom factories, demo and strict observed sessions

#### `test/runtime-core/background-review.test.ts`（4）

- [MAC] Service dispose：终止运行中任务、管理器失效、dispose 幂等
- [MAC] Service：assertReady 失败如实拒绝并关闭已绑定 inner 会话（管理器释放路径已接线）
- [MAC] Service：bindRole 失败如实拒绝（管理器释放在无回合时为空操作；释放接线见代码/构造失败路径）
- [MAC] Service：仅 ShellGate 会话注入四工具；判断会话与无 ShellGate 会话不可见

#### `test/runtime-core/background-session-access.test.ts`（3）

- [MAC] dispose 后：运行中任务终止，list/read/stop 明确失效且不复活管理器
- [MAC] 无管理器：list 为空、read 未找到、stop 明确失败且不抛（含判断会话）
- [MAC] 有管理器：list/read/stop 与选项转调当前会话管理器

#### `test/runtime-core/codex-native-optional.test.ts`（4）

- [MAC] A9/D6 official-pure-preparation-unproven 退役：纯准备/丢弃只按真实边界决定 construction.status，trustedPurePreparation 仅证据
- [MAC] F5 Codex native 不可用（WebSearch）在受保护 + shell + 审批链下仍可准入：plan 省略 native 且审批链成立
- [MAC] F5 native observed ⇒ plan 记录可选强证明并可绑定；present-but-changed 逐字段拒绝
- [MAC] F5/P1.2-AC-27 Codex native 不可用（responses）仍可准入：plan 省略 native、无 native-factory-* 拒绝、ensureAdapter 回落工厂构造

#### `test/runtime-core/dispatch-workflow-writer-copy.test.ts`（2）

- [KR] dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」
- [KR] dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行

#### `test/runtime-core/download-tool.test.ts`（1）

- [MAC] W-1 Service 透传：注入 requestDownload ⇒ 普通会话含 request_download；未注入与两种判断会话均不含

#### `test/runtime-core/effective-timeouts.test.ts`（3）

- [KR] Pi env 300s/310s reach the Provider inspection option while the Service turn timer uses the fixed 1h last resort
- [KR] Service explicit Pi timing overrides env, including the legacy disabled-timer values
- [KR] all runtimes read the same inspection env; Service still uses the fixed 1h last resort

#### `test/runtime-core/file-write-safety.test.ts`（2）

- [KR] D3 linked workspace root remains usable; linked target itself is not replaced
- [MAC] D3 lstat ENOTDIR is a status error, never a new-file fallback

#### `test/runtime-core/git-capability-tools.test.ts`（16）

- [KR] R12 actual shell/governance judge tool modes and a direct interpretation actor all enter the Core registry
- [KR] R12 every real Core bind shares the host lease and registry; in-progress/active/disposed actors remain visible
- [KR] R12 interruption during async factory preparation prevents the subsequent native bind
- [MAC] R12 physically managed or unknown scopes cannot invoke an unknown legacy factory even outside mutation
- [MAC] R12 unsupported default native plan is omitted optional evidence: admission observed with no native spawn or project write
- [MAC] R14 actual required scope admits registered scripts through the approval chain; Codex native plan is optional evidence and clean Chat/unmanaged scripts still work
- [MAC] R15 actual callback and registry replacement make observer facts unknown instead of trusting function properties
- [MAC] R15 real blocked callbacks bind the protected default Chat surface; forged identities and drift never gain admission
- [MAC] R16 default Core writes approved workflow bytes through a strict host SHA gate and real after-write receipt
- [MAC] R18 actual default Core/Chat transmits the parent-free schema and rejects model JSON before dispatch
- [MAC] R20 default Core/default Chat binds true dual roots and repo observations to actual write/edit stages
- [KR] R8 a custom factory cannot self-report the default Codex Chat production provenance
- [KR] R8 active HTTP inference alone is not treated as an uncontrolled execution program
- [KR] R8 native registry/instance/role/runtime/activity mismatches remain unknown
- [MAC] R9 Service binds defensive host roots without claiming FS confinement or complete discovery
- [KR] actual Service registry snapshots bind the instance and do not convert empty capabilities into confinement proof

#### `test/runtime-core/governance-matrix-tool.test.ts`（1）

- [MAC] AC-1/AC-2/AC-15 Service 透传：注入⇒工具存在；未注入⇒不存在；判断会话结构性无该工具；contextSections 透传/缺省不下发

#### `test/runtime-core/mcp-declarations.test.ts`（1）

- [MAC] 接线注入：Service providerFor 按角色注入 RuntimeProviderOptions.installedMcpServers（纯读、绝不建目录；新 bind 重读）

#### `test/runtime-core/prompt-start-acknowledgement.test.ts`（5）

- [KR] acknowledged turns keep aborted/timed_out outcomes and single matching terminal
- [KR] active and disposed prompt rejections have no turn acknowledgement
- [MAC] actual turn has one synchronous acknowledgement before persisted input/native work and shares all identities
- [KR] quarantined prompt rejection has no acknowledgement after one stopped actual turn
- [KR] synchronous acknowledgement throw yields one failed terminal, zero native work, and releases the turn

#### `test/runtime-core/readonly-git-routing.test.ts`（2）

- [MAC] W4 真实 Service 入口：readonlyGit 注入可达（demo 适配器闭环，零 spawn）
- [MAC] W4 真实 Service 入口：run_shell 携带会话 roleId（demo 适配器闭环）

#### `test/runtime-core/reasoning-effort.test.ts`（4）

- [KR] Service 三键读取注入：set ⇒ 注入 RuntimeProviderOptions.reasoningEffort（规范形）
- [KR] 未设/空串 ⇒ 字段缺席（逐字现状的机读形态，而非 undefined 值）；demo 恒缺席
- [KR] 诊断自身故障不改变执行（绝不毁会话）；跨键不串（设 claude 键对 codex 会话零影响）
- [KR] 非法值 ⇒ 按未设处理（零参数）＋诊断如实；空串静默不诊断；绝不毁会话

#### `test/runtime-core/reasoning-facts.test.ts`（2）

- [MAC] Service 单点：原始推理事实在 emit 恰一次投影（summary 定格、turnId 保留、原始正文与随载荷 summary 绝不外流）；坏件走如实诊断行；非推理事件逐字现状
- [MAC] 持久化/回放同形：存储面只见投影形且无原始凭据；历史读取对存量投影（幂等）与手编原始事实（同管道）都过同一单点

#### `test/runtime-core/report-provenance.test.ts`（18）

- [MAC] 128 detailed receipt bound does not forget seen disabled attempts or re-execute one after eviction
- [MAC] 16MiB frozen recovery budget expires oldest failed source snapshots rather than keeping unbounded material
- [MAC] ACK is not delivery: boundary failure has exact Provider count and history retry never invokes it
- [MAC] ACK is not delivery: index failure has exact Provider count and history retry never invokes it
- [MAC] ACK is not delivery: user failure has exact Provider count and history retry never invokes it
- [MAC] actual bound mode, final source identity, idempotent safe report save and conflict are independent of model execution
- [MAC] an ambiguously successful final receipt write is idempotently confirmed, not appended twice
- [MAC] disabled bound mode does not create directories; live-only views do not become durable report snapshots
- [MAC] foreign later replay records block history repair without altering the replay or invoking Provider again
- [MAC] live optional delivery identity is all-or-none and target-bound; disabled mode has real in-memory receipts without directories
- [MAC] no final receipt cannot be reconstructed from boundary or nearby settled after reopening
- [MAC] partial replay is not silently repaired or replayed; later foreign records also block repair
- [MAC] reopened live-only delivery uses its actual user/turn record for inputSaved without claiming durable source reports
- [MAC] same-attempt known execution is monotonic even if the replay becomes an unreadable directory
- [MAC] source retry only saves the first frozen snapshot, duplicate clicks share one operation and disposal expires it
- [MAC] target stores safe text but Provider receives original model text and images; final receipt survives a new handle
- [MAC] unknown persisted C versions do not become a final receipt or permit a new automatic attempt
- [MAC] unknown report file versions are listed as read errors and not silently upgraded

#### `test/runtime-core/request-requirement-change-tool.test.ts`（1）

- [MAC] Service 透传：注入 requestRequirementChange 后 provider 工具面包含 request_requirement_change；未注入则不出现

#### `test/runtime-core/session-admission-approval.test.ts`（9）

- [MAC] W2 AC-27：prepare→bind 之间 gate 替换先被 isCurrent 拦为 runtime-prepared-configuration-changed
- [MAC] W2 approvalChain 稳定投影（无时间戳/凭据）且 configDigest 计入 approvalChain
- [MAC] W2 bindPreparedRole：受保护 + shell + 已登记审批链 ⇒ token 成立并绑定（appTools 含 shell）
- [MAC] W2 composeContext：受保护 + shell + 已登记审批链 ⇒ token 成立后设置 admittedPlan 并返回上下文
- [MAC] W2 mode 可接受集合：readonly / operator-approve / rules-advisory / three-layer 均准入
- [MAC] W2 prepareRole 真值表：required × runtime × shell × binding × provenance × guards
- [MAC] W2 审计三态：非持久/非 file/探针缺失/抛错/unknown 一律 protected-scope-audit-unavailable
- [MAC] W2 无 token 的受保护 shell 会话不得构造适配器：bindRole/composeContext 均拒绝
- [MAC] W2 项目根：注册根与 Core 根不一致 ⇒ unproven；规范化等值（尾斜杠/Windows 大小写）⇒ 准入

#### `test/runtime-core/session-lifecycle.test.ts`（8）

- [MAC] R13 actual default Chat keeps HTTP coverage separate from drain and retains real terminal evidence across disposal
- [MAC] R17 a custom factory with an actual effect stays possibly-started regardless of fake construction facts
- [MAC] R17 a real busy default Chat may finish Core drain after disposal and must refresh its retained terminal evidence
- [MAC] R17 genuine pure context preparation and a pre-native read failure have private never-started evidence
- [MAC] R17 timed-out custom construction keeps its real pending continuation and late effect unknown
- [MAC] R28 missing or corrupt resource fails before Chief factory creation and never falls back to project card text
- [MAC] R28/R30 actual default runtime contexts isolate ordinary Chief workflow, bounded Chief and ordinary judges
- [MAC] R29 Core forwards only its validated cloned Chief decision context; ordinary and judge providers receive no field

#### `test/runtime-core/session.test.ts`（18）

- [KR] Core-managed binding rejects a provider that did not register its display profile before first prompt
- [MAC] Service configured custom API key is stripped from the actual governed shell child
- [MAC] Service event top/detail identity and report metadata share the captured turn
- [MAC] Service failure never selects another engine and unknown runtime rejected
- [MAC] Service persists replay and adapter-confirmed deferred context result after prompt
- [MAC] Service selects exactly chosen injected factory and executes real governed handler
- [MAC] adapter-internal timed_out keeps the generic summary and is not mislabeled as last resort
- [MAC] customer wait pauses the turn last-resort deadline, abort invalidates late consent, next turn works
- [MAC] each actual runtime turn publishes one typed original input before native work and retains real assistant text
- [MAC] hanging native abort is bounded, called once, and leaves the session quarantined
- [MAC] input echo is absent for rejected or failed-start prompts; demo Core and standalone have one input producer
- [MAC] inspection deadline never aborts a progressing turn; the turn completes normally
- [MAC] last resort aborts at the injected deadline with distinct last-resort wording
- [MAC] ordinary engine failure stays a non-tool fact in live, stored and reloaded events while actual tools retain projections
- [KR] outer aborted result stays aborted and a settled underlying lifts quarantine despite failing cleanup
- [KR] outer timeout remains timed_out when abort cleanup emits inner aborted terminals
- [MAC] throw, native failed outcome and last-resort timeout each have one explicit terminal
- [MAC] transient persistence failure is reported and repaired next prompt can succeed

#### `test/runtime-core/shell-judge.test.ts`（1）

- [MAC] Service 装配：注入 shellJudge 时只构造三只只读工具、judgeMode=true、外来 MCP 置空

#### `test/runtime-core/submit-capability-tools.test.ts`（2）

- [KR] R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget
- [KR] R2 chief timeout is finite and normal sessions still receive injected narrow capabilities

#### `test/runtime-core/trunk-contract.test.ts`（1）

- [KR] 主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3）

#### `test/runtime-core/version-change-contract.test.ts`（1）

- [KR] doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6）

#### `test/runtime-core/view-image-policy.test.ts`（5）

- [MAC] Service + claude（Gate 3 已翻 tool-result；5 MB 上限）：同轮附图、不触达桌面能力、超限失败无图
- [MAC] Service + codex（Gate 3 已翻 tool-result，Chat/Pi 证据）：工具结果同轮附图、不触达桌面能力；message 走共享 i18n key
- [MAC] Service + demo（仍 next-turn）：工具调用注入能力并透传 turnId；ToolResult 无 images、交付为 next-turn（零行为变化）
- [MAC] Service + pi（Gate 3 已翻 tool-result）：工具结果同轮附图、不触达桌面能力；message 走共享 i18n key
- [MAC] Service：四个运行时的 view_image 注册门不变——注入 viewImage 才注册；未注入 ⇒ 工具不存在（fail-closed）

#### `test/runtime-core/write-gate-context.test.ts`（1）

- [MAC] R20 issued stages bind invocation/path/op/stage, expire on gate return, and write only after pure final policy

#### `test/桌面应用/ans-wiring.test.ts`（3）

- [MAC] .ans 存在但不可解析 → 未接受、不回退运行期同意（界面据 config 如实呈现）
- [MAC] 无 .ans → 回退运行期同意（登记的非-pin 例外，行为不变）
- [MAC] 有带 pin 的 .ans → pin 生效：会话用其 pin-backed acceptance，边界内写入被接受

#### `test/桌面应用/boundary-refresh.test.ts`（1）

- [NEW] G-4 接线钉（裁定④⑤＋I3）：集合重推导单一来源；注入才注册；护栏读活状态；重建行技能措辞

#### `test/桌面应用/chain-enforcement.test.ts`（6）

- [NEW] D3 卡种收口（2026-10-31）：后续 decision/intent-confirm 裁决不覆盖真实 D3（选项与角色同名也不覆盖）
- [NEW] D3 卡种收口（2026-10-31）：新格式 appointment 被接受；无 cardKind 且无 roster 戳的裁决被忽略
- [NEW] F4：质检报告按任务创建者路由——运营发起回运营；幕僚调度回幕僚
- [NEW] M1/M2：状态缺失受理 + advisory（意图/名单）；同文幂等；基线漂移受理
- [NEW] M5/M6/M7 + 交付标记：状态缺失受理 + advisory；verifier/文件型模块元数据
- [NEW] M9 报告路由：运营派的 worker 报告回运营；幕僚派的任务报告回幕僚

#### `test/桌面应用/chief-workflow.test.ts`（42）

- [NEW] W10 fresh scope分流：unmanaged原四路径/轮次护栏；required私有guard；unknown拒bind
- [NEW] W14 convener按本次真实任务冻结；缺完整执行闭包保stage/code且零worker任务/HTTP
- [NEW] W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界
- [MAC] W1b 真实SessionManager：主chief等待worker时独立chief选非推荐，原工具/来源审计同链且旧@预设不截流
- [MAC] W1b 真实无退修选项：chief退修释放原request_choice→有权原角色write_file补材→同flow新卡独立决定，无客户关开救场
- [MAC] W1b 真实缺材料（B）：materials失败fail-closed——不呈现卡、无presented、回执notPresented含真实原因、回合不阻塞且不依赖关闭委托
- [MAC] W20 默认Core/Chat产品真实报告落账并到chief 普通
- [MAC] W20 默认Core/Chat产品真实报告落账并到chief 真实R9竞争
- [MAC] W21 默认Core/Chat应用生效通知 显式blocked保真任务
- [MAC] W21 默认Core/Chat应用生效通知 纯确认不覆盖真实完成报告
- [NEW] W22 Convener显式review也不能越Chief创建Verifier，零任务零HTTP
- [NEW] W23 Convener不能越Chief新建普通Verifier，零任务零HTTP
- [NEW] W28 默认Core/Chat真实受派策划缺不可变pin stop 拒绝且零停止
- [NEW] W28 默认Core/Chat真实受派策划缺不可变pin stop-and-restart 拒绝且零停止
- [NEW] W29 默认Core/Chat真实既有文档基线后续 document-change 保专业规划scope不授旧执行pin
- [NEW] W29 默认Core/Chat真实既有文档基线后续 document-change-missing-confirmation 保专业规划scope不授旧执行pin
- [NEW] W29 默认Core/Chat真实既有文档基线后续 document-change-source-loss 保专业规划scope不授旧执行pin
- [NEW] W29 默认Core/Chat真实既有文档基线后续 document-change-wrong-flow 保专业规划scope不授旧执行pin
- [MAC] W3 创建中普通库存与实际revision可见；custom工厂伪CodexChat来源经真实Core仍unknown
- [MAC] W3 默认Core→默认CodexChat本地HTTP：真实git_query与同实例surface库存；native旁路拒绝而FS仍unknown
- [NEW] W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 真实重启迁移后
- [NEW] W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 连续写入后
- [NEW] W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续
- [NEW] W34 真实首文档发布与原创建者关闭后派团队规划保独立scope
- [NEW] W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝
- [NEW] W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒
- [NEW] W47 默认Core/Codex本地HTTP：忙Chief独立revise释放真实卡调用
- [MAC] W47 默认Core/Codex本地HTTP：忙Chief独立select释放真实卡调用
- [MAC] W48 默认Core精确controller停止：缺/错task零停止，当前任务sealed且不伪造报告 foreign-lease
- [MAC] W48 默认Core精确controller停止：缺/错task零停止，当前任务sealed且不伪造报告 late-chief-source
- [MAC] W48 默认Core精确controller停止：缺/错task零停止，当前任务sealed且不伪造报告 new-interrupt
- [MAC] W48 默认Core精确controller停止：缺/错task零停止，当前任务sealed且不伪造报告 normal
- [NEW] W5 专字段真实workSourceRef：空目录native来源、父轮结束/焦点切换不撤child、伪来源拒绝
- [NEW] cancelled
- [NEW] changed
- [NEW] commit-race
- [NEW] enumerated
- [NEW] model-source
- [NEW] required
- [NEW] selected
- [NEW] unmanaged
- [NEW] unmanaged-system

### A.2 计数口径说明

- 186 = 177 个顶层 test + 9 个 W5 子测试。
- 原始 ✖ 去重 187 = 上述 186 + 1 条 node:test 汇总头 `failing tests:`（非测试名，已在提取时排除）。
- 与三套冻结 known-red 的交集为 31，全部为 runtime-core；逐名明细见正文第四节。
- 文件映射的完整机器可读清单（186 行）即上方 A.1；未映射 0 条。
