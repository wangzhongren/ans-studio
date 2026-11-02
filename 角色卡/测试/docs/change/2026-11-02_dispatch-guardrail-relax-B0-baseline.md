# 基线记录：派发护栏放宽（dispatch-guardrail-relax）B0 实施前基线

- **任务 ID**：`2026-11-02-dispatch-guardrail-relax`（风险档位 **T3**；方案 P1.1 / 团队计划 v1 / 验收标准 V1）
- **记录角色**：测试（Testing）
- **日期**：2026-11-02
- **阶段**：B0 实施前基线（团队计划 §5.1/§5.3、§7.3；V1 §5.5）
- **状态**：**baseline-recorded（基线已记录）**。本记录只陈述实施前实测事实，不实施、不验收、不判通过/返工；不是候选、不是验收报告，不宣布任何变更通过。
- **授权依据（B0 入口条件，转引沟通/团队计划/V1；B0 不重新判定客户闸门）**：
  - `docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`（**124 行** / SHA-256 `bbb64072b0d0f071be756158a9f24a4ea944e7c86ae10372e0b5e55407c5b93f`；含闸门 0/1/2 确认小节与「实施授权记录」）。实施授权小节客户原话：「授权实施：按团队计划 v1 与 V1 标准开始 B0/P1，随后按阶段实施；不含提交/推送/发布。」
  - 团队计划 v1：`docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`（**482 行** / SHA-256 `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d`；B0 实测与任务输入一致）
  - 验收标准 V1：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（**814 行** / SHA-256 `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3`；B0 实测与任务输入一致）
- **基线身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（tree `689a49580fd7e79a0bfae1be343597b793967f71`）
- **工作树前提**：B0 开始与结束时 `git status --porcelain -- src app test` 均为空、`git diff --cached --name-only` 为空；**无产品源码/测试改动**。既有变更为 6 个已跟踪管理/治理文件和 5 个未跟踪管理文档（§3.1）；B0 新增仅本记录与同目录原始日志。

---

## 一、环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（UTC） | 2026-11-02T03:28:24Z – 03:35:20Z（本地 Asia/Shanghai 11:28–11:35） | 各原始日志 `START`/`END` |
| OS / Shell | Windows 11 Pro 10.0.26300；MINGW64_NT-10.0-26300（Git Bash 3.6.10-710e5275.x86_64）；`SHELL=/bin/bash.exe` | `uname -a`、`echo $SHELL` |
| Node / npm | **v24.22.1 / 11.19.1** | `node --version` / `npm --version` |
| Git | 2.55.0.windows.5 | `git --version` |
| 平台 | win32 x64 | 环境（Node/OS 输出） |
| node_modules | 存在（`node_modules/`） | `ls -d node_modules` |
| Electron | 包 `electron@44.7.0`；`node_modules/.bin/electron` 存在；`node_modules/electron/dist/electron.exe` 存在（246,302,208 字节） | `package.json`、`ls -la` |
| E2E 脚本 | `test/桌面应用/e2e/main.mjs` 存在（232,942 字节）；B0 **只记录存在性，未执行 E2E** | `ls -la` |
| task_ops | **未启用**：`.ans/project.json` 不存在；不伪造任务令牌/锁/审批/机器状态 | `ls .ans/project.json` |
| 应用状态 | 本 worktree 的 ANS 应用**未运行**；系统中有 3 个 `electron.exe`（PID 34404 主进程 / 11492 GPU / 41000 network utility），均来自另一 worktree `…\.claude\worktrees\network-monitor\node_modules\electron\dist\electron.exe`，运行 `test/桌面UI/phase5a-electron-smoke.mjs`，**不是本任务应用**；B0 未启动/停止任何进程 | `tasklist`、PowerShell `Get-CimInstance Win32_Process` |
| 应用启动方式（记录，不启动） | `npm run app` = `electron app/main.ts`；CLI `npm start` = `node bin/ans.js`；E2E = `node_modules/.bin/electron test/桌面应用/e2e/main.mjs` | `package.json` scripts |
| 写入范围 | 仅 `角色卡/测试/docs/change/`（本记录与原始日志）；未写产品/测试/角色卡/边界/治理文档 | 本记录 §八 |

---

## 二、输入文档核验（B0 冻结）

| 文档 | 行数 | SHA-256（B0 实测） | 对照 |
| --- | --- | --- | --- |
| `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md`（P1.1，语义基线） | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` | 与任务输入、团队计划/V1 引用一致 |
| `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` | 与任务输入、团队计划/V1 引用一致 |
| `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`（团队计划 v1） | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` | 与任务输入一致 |
| `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（V1） | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` | 与任务输入一致 |
| `docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md` | 124 | `bbb64072b0d0f071be756158a9f24a4ea944e7c86ae10372e0b5e55407c5b93f` | 管理记录，可能继续追加；含闸门 0/1/2 与实施授权记录 |

以上为只读核验；B0 未修改任何输入文档。

---

## 三、命令与结果

### 3.1 仓库状态

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `git rev-parse --abbrev-ref HEAD` | 0 | `feat/flow-improvements-wave1` |
| `git rev-parse HEAD` | 0 | `c80f4944c3421554fcbd35f8570cedd3e2119a0a` |
| `git rev-parse HEAD^{tree}` | 0 | `689a49580fd7e79a0bfae1be343597b793967f71` |
| `git status --short`（B0 开始） | 0 | 6 个已跟踪修改 + 5 个未跟踪管理文档（见下）；无 `src/`、`app/`、`test/` 条目 |
| `git status --porcelain -- src app test`（开始与结束） | 0 | **空**（产品代码/测试零改动） |
| `git diff --cached --name-only`（开始与结束） | 0 | **空**（未暂存） |
| `git status --short`（B0 结束后） | 0 | 与开始时相同，另加 B0 证据目录 `角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-B0-evidence/` |

- 已跟踪修改（均为管理/治理记录，非产品候选）：`docs/communication/memo.md`、`docs/planning/memo.md`、`docs/scheduling/memo.md`、`角色卡/桌面窗口/boundary.md`、`角色卡/桌面窗口/boundary.yaml`、`角色卡/桌面窗口/changelog.md`。桌面窗口三文件为闸门 2 确认的人事 H1 B-1/B-2 边界补登；B0 只读记录、未修改。
- 未跟踪管理文档（非产品代码）：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`、`docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`、`docs/planning/2026-11-02_design_dispatch-guardrail-relax.md`、`docs/planning/2026-11-02_review_dispatch-guardrail-relax.md`、`docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`。
- 原始输出：`01-git-baseline.txt`（26 行 / `6b05ef23ef9ab4ec27414e6b657984693e566df4dd699685eccb8042454a5885`；B0 结束后复跑，HEAD/状态与开始时一致）。

### 3.2 存在性检查

| 检查 | 结果 |
| --- | --- |
| `test/编排/workflow-preconditions.test.ts`、`test/编排/task-state.test.ts`、`test/编排/appointment-roster.test.ts` | 存在，已运行（§3.4） |
| `test/编排/dispatch-advisories.test.ts` | **不存在**（基线应缺失；B0 未创建） |
| `test/桌面应用/{chain-enforcement,star-routing,rejection-copy,run-pin,run-change-trigger,run-change-entry,dispatch-fresh-enum}.test.ts` | 均存在，已运行（§3.4）；B0 未修改 |
| `test/pi-adapter/write-sequencing.test.ts` | 存在（7,710 字节）；T3 全量按既有验收记录排除（§3.5） |
| `test/桌面应用/e2e/main.mjs` | 存在（232,942 字节）；B0 未执行 |
| `node_modules/.bin/electron` | 存在；`node_modules/electron/dist/electron.exe` 存在 |

### 3.3 类型检查

| 命令 | 退出码 | 结果 | 日志 |
| --- | --- | --- | --- |
| `npm run typecheck`（即 `tsc --noEmit`） | **0** | 无错误输出；2026-11-02T03:28:24Z → 03:28:27Z（约 3 秒） | `typecheck.txt`（7 行 / `011334ff6319c5b1a39fa599c5dac5874c8762b1421ac9c31c279a66bfea0e8d`） |

原始输出全文仅 `> ans-cli@1.8.3 typecheck`、`> tsc --noEmit` 与 `EXIT_CODE=0`；无错误摘要。

### 3.4 受影响套件基线（`node --test --test-concurrency=1`）

| # | 套件 | 命令要点 | 退出码 | tests | pass | fail | skip | todo | duration_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排（3 文件） | `test/编排/workflow-preconditions.test.ts test/编排/task-state.test.ts test/编排/appointment-roster.test.ts` | **0** | 39 | 39 | 0 | 0 | 0 | 854.9347 |
| B | 桌面（7 文件） | `test/桌面应用/chain-enforcement.test.ts … dispatch-fresh-enum.test.ts`（团队计划 §4.3 列名 7 个文件） | **0** | 50 | 50 | 0 | 0 | 0 | 12725.1921 |
| C | 编排新增测试 | `test/编排/dispatch-advisories.test.ts` | — | — | — | — | — | — | 文件**缺失**（基线预期；未创建、未运行） |

A+B = 89 个测试全部通过，0 fail / 0 skip / 0 todo。原始输出：`orchestration-affected-suite.txt`（51 行 / `788cc76b09da2085c9ef940f09ae5ec6159e5a68cd47dc81a9ace568d799f05b`）、`desktop-affected-suite.txt`（62 行 / `64bbf4bde3805de3ae740d6346482359c0343b99ec91bf37ff9d30b3d7660a49`）。

### 3.5 T3 全量基线

- 实际命令：

```bash
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')
```

- 工作目录：本 worktree 根；文件数 **386**；shell 参数替换在本机 Git Bash 可用（未超长），命令按原样执行。
- 排除项：`test/pi-adapter/write-sequencing.test.ts`（既有已知挂起）。依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`；排除原因已在命令中显式写出（`! -name 'write-sequencing.test.ts'`），未静默跳过。
- 时间：2026-11-02T03:28:57Z → 03:33:58Z（duration_ms **301174.1765**，约 5 分 1 秒）。
- 退出码：**1**（由 9 项既有 Windows symlink EPERM 失败导致）。
- 计数：

| tests | suites | pass | fail | cancelled | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- |
| **3358** | 0 | **3331** | **9** | 0 | **18** | **0** |

原始输出：`t3-full-suite.txt`（4458 行 / `65933bbdb488feba66a8263b90534cdaf80bec64ce61eddd75f258b89b0f3192`）。

---

## 四、失败清单与分类

### 4.1 失败清单（9 项，全部 EPERM symlink）

| # | 测试文件:行 | 测试名 | 错误 |
| --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | `EPERM: operation not permitted, symlink`（errno `-4048`） |
| 9 | `test/编排/shell-authorized-routine.test.ts:191` | node test外指符号链接路径不获委托；项目内测试路径获委托 | `EPERM: operation not permitted, symlink`（errno `-4048`） |

说明：第 9 项在同一测试文件的上一任务 B0 记录中位于 `:184`，本基线为 `:191`（文件演进）；错误类型相同。9 项失败均发生在测试夹具调用 `fs.symlink`/`fs.symlinkSync` 时，错误码统一为 `EPERM`、`errno: -4048`、`syscall: 'symlink'`。

### 4.2 分类

| 分类 | 数量 | 判定依据 |
| --- | --- | --- |
| 既有 Windows symlink EPERM（环境） | **9** | 9 项失败全部为 `EPERM` symlink；既有验收记录 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:165` 记载「最近基线 9 项」Windows symlink EPERM；本机独立探针在 `%TEMP%` 新建目录直接 `fs.symlinkSync` 同样得到 `EPERM errno -4048`（与测试夹具无关） |
| 其它环境失败 | 0 | — |
| 其它/未知确定性失败 | 0 | — |
| **本次新增失败集合** | **0** | B0 是实施前基线，无候选改动；9 项全部归入既有 Windows symlink EPERM 类，未发现未知失败 |
| 新增 skip / todo | 0 | 本基线 skip=18、todo=0，均为测试自身平台条件跳过（见下）；B0 未新增任何 skip/todo |

- **skip 18 项分类（均为既有平台条件跳过，不计为 pass）**：D3/POSIX 权限、umask、chmod、fsync 相关 15 项；POSIX 进程组 SIGTERM 清理 1 项；不可读权限 1 项；目录不可写（`# chmod 语义在 Windows 不适用`）1 项。完整名称见 `t3-full-suite.txt` 中 `﹣ … # SKIP` 行。
- **symlink 环境探针**：`node -e` 在 `os.tmpdir()` 新目录执行 `fs.symlinkSync` → `SYMLINK_OK=false`、`code=EPERM`、`errno=-4048`、`syscall=symlink`，清理临时目录后退出 0。日志：`symlink-probe.txt`（8 行 / `283854a2afa32ab1811785d824ae83bf7e0b508a2cf6202397c60c76b82cac20`）。
- 本记录不修改任何失败测试、不新增跳过、不把既有失败算作通过。

---

## 五、应用 / Electron / E2E 可运行性状态

| 项 | 实测 | 说明 |
| --- | --- | --- |
| 本 worktree 的 ANS 应用 | **未运行** | B0 未启动应用；未连接/操作任何应用窗口 |
| 系统 Electron 进程 | 3 个 `electron.exe`：PID 34404（主）、11492（GPU）、41000（network utility） | 命令行指向 `…\worktrees\network-monitor\node_modules\electron\dist\electron.exe test/桌面UI/phase5a-electron-smoke.mjs`，属另一 worktree 的冒烟脚本，不是本任务应用 |
| Electron 可执行性 | `node_modules/.bin/electron` 与 `node_modules/electron/dist/electron.exe` 均存在；包版本 `electron@44.7.0` | 仅记录存在性；B0 未运行 Electron |
| E2E 脚本 | `test/桌面应用/e2e/main.mjs` 存在（232,942 字节） | B0 未执行 E2E（任务指定只记录可运行性）；实际运行与 `E2E_PASS`/截图/不可用原因由 D2 取证 |
| 应用启动方式 | `npm run app`（`electron app/main.ts`）；CLI `npm start`（`node bin/ans.js`） | 只读自 `package.json`，B0 未启动 |

---

## 六、基线结论（事实，不是验收结论）

1. **typecheck**：`npm run typecheck` 退出码 0，无错误输出。
2. **受影响套件**：编排 3 文件 **39/39 pass**、桌面 7 文件 **50/50 pass**，均 0 fail / 0 skip / 0 todo、退出码 0；`test/编排/dispatch-advisories.test.ts` 在基线**缺失**（符合实施前状态），B0 未创建。
3. **T3 全量基线**：3358 tests / 3331 pass / **9 fail** / 18 skipped / 0 todo，退出码 1；9 项失败全部为既有 Windows symlink EPERM（`errno -4048`），另有 18 项既有平台 skip；未发现其它或未知失败。
4. **本次新增失败集合 = 0**：B0 为实施前基线，无候选改动；全部失败已按既有 Windows symlink EPERM 分类，独立 symlink 探针证实环境限制。
5. **无产品/测试改动**：B0 开始与结束 `git status --porcelain -- src app test` 均为空、`git diff --cached --name-only` 为空；既有变更仅为管理/治理记录与闸门 2 的人事 B-1/B-2 补登。
6. **Electron/E2E**：Electron 二进制与 E2E 脚本存在；本 worktree 应用未运行；B0 未执行 E2E，运行结果留待 D2 按团队计划/V1 取证。
7. **本记录不判验收**：不判通过/返工，不代替独立验收；D1/D2 需以 A1+B1 候选重新取证。

---

## 七、证据文件清单

目录：`角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-B0-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `01-git-baseline.txt` | 26 | `6b05ef23ef9ab4ec27414e6b657984693e566df4dd699685eccb8042454a5885` |
| `typecheck.txt` | 7 | `011334ff6319c5b1a39fa599c5dac5874c8762b1421ac9c31c279a66bfea0e8d` |
| `orchestration-affected-suite.txt` | 51 | `788cc76b09da2085c9ef940f09ae5ec6159e5a68cd47dc81a9ace568d799f05b` |
| `desktop-affected-suite.txt` | 62 | `64bbf4bde3805de3ae740d6346482359c0343b99ec91bf37ff9d30b3d7660a49` |
| `t3-full-suite.txt` | 4458 | `65933bbdb488feba66a8263b90534cdaf80bec64ce61eddd75f258b89b0f3192` |
| `symlink-probe.txt` | 8 | `283854a2afa32ab1811785d824ae83bf7e0b508a2cf6202397c60c76b82cac20` |

### 7.1 本记录自身身份

本记录写盘完成后的行数与 SHA-256 由 B0 完成报告给出（文件无法在不改变自身内容的前提下内嵌自己的最终哈希）。

---

## 八、写入边界与限制

- **写入边界**：仅 `角色卡/测试/docs/change/`（本记录与原始日志）；未修改产品源码、测试、配置、角色卡、边界、其他角色文档；未写 `docs/scheduling|acceptance|communication|planning`；未 commit/push/merge/release。
- **未运行**：真实 Electron E2E（B0 只记录存在性，D2 执行）；A1/B1 候选测试（尚未实施）；应用启动/停止/截图；依赖安装/升级。
- **证据绑定**：路径 + 行数 + SHA-256；HEAD、Node/npm、依赖、输入文档或夹具变化会使相关基线失效，D1/D2 需重新核对或重取。
- 本记录不是验收结论；实施与验收由具备相应授权的角色按团队计划与 V1 执行。
