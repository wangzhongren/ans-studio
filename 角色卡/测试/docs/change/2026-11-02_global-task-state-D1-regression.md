---
id: global-task-state-d1-regression
type: change
title: global task state D1 全量回归、E2E 与证据
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: superseded
related: [global-task-state-b0-baseline]
events:
  - date: "2026-11-02"
    kind: created
    summary: 记录 D1 候选哈希、双 typecheck/build、四组受影响套件、T3 全量回归（10 fail：9 既有 EPERM + 1 新增 D-04）与 phase4b Electron E2E 结果
  - date: "2026-11-02"
    kind: superseded
    summary: D-04 返工（acceptance-rework → rework-pending）后由重跑记录 2026-11-02_global-task-state-D1-rerun-regression.md 替代；本记录与证据仅作历史追溯，旧候选结论不得沿用
---

# D1 全量回归、E2E 与证据：global task state（全局任务状态 / 版本决策）

> **已被替代（superseded，2026-11-02）**：D-04 返工（`acceptance-rework` → `rework-pending`）后已按新候选重跑；结论与证据以 [`2026-11-02_global-task-state-D1-rerun-regression.md`](2026-11-02_global-task-state-D1-rerun-regression.md) 为准。本记录针对**旧候选**，其 needs-work 结论、候选哈希与证据**不得沿用**，仅作历史追溯。

- **任务 ID**：`2026-11-02-global-task-state`（团队计划/方案/复核同 slug `global-task-state`）
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-02 / 团队计划 §五 **D1（T3 回归）**，入口为 A5 退出
- **状态**：**D1 已完成执行**。本记录只记录事实与证据，**不判验收、不判通过/返工**；最终结论由独立验收 E2 按 V1（`docs/acceptance/global-task-state-criteria-v1.md`，907 行 / SHA-256 `b6c23c78486239a6aec1abe3f6118a2d3a83716dcc9d443299cabd58598b77ab`）判定。T3 全量发现 **1 项新增确定性失败**（D-04 残留守卫命中候选新增文件中的 `acceptance-rework` 字样），**新增确定性失败 ≠ 0**，已如实报告统筹/属主；D1 不修复、不判定返工，记录状态 `needs-work` 仅供后续节点识别。
- **候选**：HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`（分支 `feat/acceptance-return-card`）+ 工作树 A0–A5 未提交改动；**32 个候选文件与团队计划 §4.1/§4.3 写集精确匹配**（30 个 `src/app/test` + README 2），无写集外产品/测试改动，`package.json`/锁/构建配置未改，staged 空；全部运行结束后候选逐文件哈希与采集快照 **32/32 一致**。
- **结果摘要**：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0；四组受影响套件 **98 tests / 98 pass / 0 fail / 0 skipped / 0 todo**；T3 全量（393 文件，排除 `write-sequencing.test.ts`）**3461 tests / 3433 pass / 10 fail / 18 skipped / 0 todo**（exit 1；9 项既有 Windows symlink EPERM + **1 项新增确定性失败 D-04**，见 §五/§七）；`phase4b-electron-smoke.mjs`（当前候选重建后入口）**PASS 69 checks / 0 failures**（exit 0，console 0，CSP 0，14 张截图）；未 commit/push、未接触客户。

---

## 一、候选身份与写集闭合

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD | `git rev-parse HEAD` | `0a123109a6b10e9b60fd1aee5f08f861455c48de` |
| 分支 | `git branch --show-current` | `feat/acceptance-return-card` |
| 候选清单 | `git status --porcelain -- src app test` | 30 条：A0 4 + A1 9 + A2 7 + A3 3 + A4 7（详见下表） |
| 装配候选 | `git status --porcelain -- README.md README.en.md` | 2 条（A5） |
| 写集闭合 | 期望清单 vs `git -c core.quotePath=false ls-files -m -o` 双向比对 | **32/32 精确匹配**，无写集外产品/测试改动（`12-scope-check.txt`） |
| 暂存区 | `git diff --cached --name-only` | **空** |
| 配置/构建 | `git status --porcelain -- package.json package-lock.json electron-builder.yml vite.config.ts tsconfig.json` | **空**（未改） |
| H1 治理文件 | `git status --porcelain -- 角色卡/桌面窗口 角色卡/运行时核心` | 6 条（boundary.md/yaml + changelog 各 2 角色），非产品候选，见 §九 |
| 其它治理文档 | `git status --porcelain`（全量） | 未跟踪：V1、团队计划、方案/复核、沟通记录、P1 提案/审核、B0/D1 记录；非产品候选 |

候选哈希清单（逐文件 `git hash-object` + `sha256sum`，工作区字节；完整机器可读清单见 `00-candidate-identity.txt`；本候选 32 个文件 **CRLF 行数均为 0（LF）**，`core.autocrlf=true` 仅影响后续 git touch 提示，不影响本记录哈希）：

| # | 角色 | 文件 | git hash-object | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | A0 | `src/model/project-state.ts` | `2121845eda284930c120472f5f12d9372a5e2412` | `8e5a9145120e6778711bd721f1ebc494f49ba04c2d63095b265bbcc1e74d4945` |
| 2 | A0 | `src/model/runtime.ts` | `19f4dac4d9343144a8674c23afaa1c053e9c7974` | `014e0b0cf214f765f3b700335976d904109b8facf0d88f3f4323aef117dccc4e` |
| 3 | A0 | `src/provider/runtime/tools.ts` | `98b5df46957db795d6466c1dc4d4eace73155d6a` | `dfa3fb4fe1fa58bc92fdceac0d6eef5862c39c2534add372c00662bb78e3bac0` |
| 4 | A0 | `src/provider/runtime/schema.ts` | `675dc23532fddbabb64a7aacb0aa5effe946f0cc` | `2da78f7c6462875c6789067ca9cfd7e814dd527f71cd4de993d611c2f6106654` |
| 5 | A1 | `src/common/编排/task-state.ts` | `b28ba7e1317ab5aab33f2c3e53b54c20104fa9c2` | `4cb100b1d7c2125731739484e4c6d9b93ccfb44e17bd15c29739fedc6781eed0` |
| 6 | A1 | `src/common/编排/project-state.ts` | `04996efd7bf6a2ef9dfc8d88a94095d07d975041` | `6f9e64679f657529111f1b0ac8ff636be4f95788991144f91230d94b88756f80` |
| 7 | A1 | `src/common/编排/version-decision.ts` | `9fe716ad41c43c153ce6da464f2382b072c54bc8` | `978e6d9fd5d1c6d98eb26c0228a592d329ba74e748ea19622c705d702108e1e6` |
| 8 | A1 | `src/pipeline/orchestration/run-role.ts` | `c31d676e8496f067ab321bf9f879c90b6adb21e6` | `e8c1cf26dba6eaa3dc06603a3ba5a7e5aff877a70fed57bb5dcd5098da272d17` |
| 9 | A1 | `test/编排/project-state.test.ts` | `cdeabaf8d1dde915919b2f06ea0addcddba6a07d` | `d73812315fb8827b14afdea9278928f2d982b7bf67be81f1c92e3264ad75a770` |
| 10 | A1 | `test/编排/version-decision.test.ts` | `2702ea869156832bfae588c03a5ff73654eb9133` | `6b69f69c620dd8b304eacac848b32625878f84218f30edf7abf7a16052cc5351` |
| 11 | A1 | `test/编排/task-state.test.ts` | `5a894e8ec3e92a31e42e1b7fb8e65498797e894a` | `61655b859a9ed583045542cef88c78a62174223be6276ccfa9f90fc51988c9e5` |
| 12 | A1 | `test/编排/run-manifest.test.ts` | `9c32130a3a12fd34c28b02918b75353183ef7293` | `b1594d3175202b344a9eaac9781dc60223bdb8f331e1eb75590c5434bd377cdc` |
| 13 | A1 | `test/编排/decision-card.test.ts` | `3c88892ce385d614df3a1d88f7bbbffa9376335b` | `674bbaebfe9ba1a2a6cad6f93f9e727e98e68eb59e24092f9bbfe11d3781f032` |
| 14 | A2 | `app/desktop/session.ts` | `bbf0f9d37031a3d15533d1cd84ca3207f86562a8` | `86c84c4db272209c471d2ad802dee29f85e6afbe9f3609be093dc96ba2acbed3` |
| 15 | A2 | `app/desktop/interface.ts` | `0ddc0dcbf921092e37e0b832e0c8d2a5b135a811` | `8d981705dee9baa2e9fd7a879c280993544668ae836dd98cdbc4c826c5b3b8d1` |
| 16 | A2 | `app/main.ts` | `3de39c3bdb5d5768a236003c4d4c42328ac4b45b` | `1e5cf23a4c8e0c4a2175474a9c777b8eaadb40c5fc5b2b4aa069f28392965d0e` |
| 17 | A2 | `app/preload.cjs` | `523e0c742a9c5d3b220280b8b56666ef484d531f` | `f1c38c1f8c34630598362c82f2c25b4e2cbc11fd549d9c5599db143013af23e9` |
| 18 | A2 | `test/桌面应用/project-state.test.ts` | `1304dfdb5ffdfe2c58ca886489bef15c98641d2b` | `104c8fb3862c20df54aa89d2e1cb6de2dc2fd1cbf7f7c29bb9929841978f6c77` |
| 19 | A2 | `test/桌面应用/version-decision.test.ts` | `d34cccc5489bdd39cb0d42499c1eecb4e1edb9bf` | `53b85c29d76680a12b5ab0d5b2b87ba8863edd126a6e99a9903a23194f24f40e` |
| 20 | A2 | `test/桌面应用/chief-workflow.test.ts` | `3f323a0f75cdeca295af088bb6767974234b8027` | `8cc03eacb46442193b80a3e4669a2b1fe78b0cdf62abd0a62350ed00be1c2c54` |
| 21 | A3 | `src/common/shared/i18n/messages/zh-CN.ts` | `b5cb538ad4942d27058ac8b892998b06299f7994` | `299e619cecf0734d7c9e838b975ad452e1ddb2e458fc5f4b193ba20a1865210b` |
| 22 | A3 | `src/common/shared/i18n/messages/en-US.ts` | `aaf3736374a058cccd40ffe1fa4f2f99f56110bc` | `4aa73f8f85f88b9aa66a713895e372d60c45b4b28612455034f45ebb9e907c40` |
| 23 | A3 | `test/项目管理/shared/i18n.test.ts` | `86b8855a9d675d0d66a5533f9e8bbf0eabfd04ad` | `711088654dfca62b7536aaea43592af081dc365088b2b7b58f4f3af01aec261b` |
| 24 | A4 | `app/renderer/src/chat/TaskCenterPanel.tsx` | `6377c0c436f15f3dc8550ad89097dbe847cd6ca2` | `6616d4a8e1d12cc43aee3436c3b42ee359e86b906392ef0a5b43a4fec9d8a136` |
| 25 | A4 | `app/renderer/src/chat/ProjectStatePanel.tsx` | `4d7e09953f26b1f56e5006d881e2e9ebcf29ee52` | `749d5468d191b8af3e4a4e1cdfc0b0cb8ff91275a171389c243d6865a8741862` |
| 26 | A4 | `app/renderer/src/lib/platform.ts` | `ee6f7aadb964fd6aa09c7fcb86c8cde5efb02cc2` | `b7c2c7a2ec47aea787b404b8467459e5b907aa9bf356e11ed0dd1a54d7eec4b1` |
| 27 | A4 | `app/renderer/src/shell/shell.css` | `bec217b80e442b0ef112757cf552f42f46c5734d` | `2b76fa8fc940272c8ace07a460adc202ff2736d014f36598f02efe3246c8e240` |
| 28 | A4 | `test/桌面UI/project-state.test.ts` | `59c2c388d9fa760c1f8ce1aeeea55332b9c90db4` | `e47ea39ba851b871df30d9f7f977aeb1489c518ed430b6295695476ab8353124` |
| 29 | A4 | `test/桌面UI/phase4b-electron-smoke.mjs` | `c71528f695a731aa229c4419e0b0e8897ca0f2ca` | `bd6fdba15954da3e6c689d9fe8028d421e4e59200909a2c1f3a42f6b6bf409eb` |
| 30 | A4 | `test/桌面UI/phase4b-smoke-preload.cjs` | `cca75d9cbf480b5df4fc980c64a6b0f20e82c722` | `d1b7612173f0b888f2aa01cdec5e6674fac0efe4699a8988c40ab7550ac8d1b3` |
| 31 | A5 | `README.md` | `77e259adba7ae455f4cbb5d848b116ddc4629db7` | `d2c77e7864323c888c6b0b8da43f0782dfd44a0a5da2d7443e8627ea0f6f4692` |
| 32 | A5 | `README.en.md` | `3b0d1a60b9e22640ef4282eae1eef09332fddecf` | `51b1796b7442fc2754030576ae714045944e7255184c0ea8f9ffc8eba4b08315` |

说明：`git hash-object`（无过滤）与 `sha256sum` 均对工作区字节计算；若文件含 CRLF 会与 LF 归一 blob 不同，本候选全部 LF（见 `00-candidate-identity.txt` 的 `crlf_lines=0`）。

---

## 二、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1` |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `/bin/bash.exe` |
| Electron | 44.7.0（`node_modules/electron/dist/electron.exe`） |
| 时区 | Asia/Shanghai（记录内时间均 +08:00） |

---

## 三、门禁命令（typecheck / typecheck:renderer / build:renderer）

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 20:10:05–20:10:07 | **0** | 0 类型错误 | `01-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 20:10:08–20:10:09 | **0** | 0 类型错误 | `02-npm-run-typecheck-renderer.log` |
| 3 | `npm run build:renderer`（`vite build`） | 20:10:11–20:10:13 | **0** | vite 8.3.4，2795 modules，390ms；仅既有非致命警告（chunk >500 kB、`INEFFECTIVE_DYNAMIC_IMPORT`） | `03-npm-run-build-renderer.log` |

构建产物（`app/renderer/dist/` 为 `.gitignore:9` 忽略产物，`git ls-files` = 0；非产品候选）：

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `app/renderer/dist/index.html` | 597 B | `b0af18785303987fbfe60e981b8db4906c1a1d2d5795e9aa74b1f3da2f96f5e1` |
| `app/renderer/dist/assets/index-DnW7hhIg.js` | 1,325,289 B | `20fb9c7520ef04c8eff21fe7e951eb066398c11185fefa6e475485e56a293732` |
| `app/renderer/dist/assets/index-haa4j9RY.css` | 152,847 B | `523c311667d0936fe3658dc298578173daebf92ce8fcf4fe207639fd66642498` |
| `app/renderer/dist/assets/ans-studio-ans-icon-DOpmqMAU.png` | 55,057 B | `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c` |

（构建前 dist 入口为 B0 旧产物 `833b1034…`；本轮构建覆盖，E2E 使用上表 `b0af1878…` 入口，见 §六。）

---

## 四、受影响套件（团队计划 §7.3.2 / V1 §5.3）

全部 `node --test --test-concurrency=1`，文件清单与计划逐字一致；四组均 exit 0。

| # | 层 | 文件组 | 起止（+08:00） | tests | pass | fail | cancelled | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排（A1） | `test/编排/project-state.test.ts`、`version-decision.test.ts`、`task-state.test.ts`、`run-manifest.test.ts`、`decision-card.test.ts` | 20:10:19–20:10:23 | 45 | **45** | 0 | 0 | **0** | **0** | `04-suite-orchestration.log` |
| B | 桌面窗口（A2） | `test/桌面应用/project-state.test.ts`、`version-decision.test.ts`、`chief-workflow.test.ts`、`run-change.test.ts`、`run-change-entry.test.ts` | 20:10:26–20:10:30 | 27 | **27** | 0 | 0 | **0** | **0** | `05-suite-desktop-app.log` |
| C | 项目管理（A3） | `test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts` | 20:10:32–20:10:33 | 16 | **16** | 0 | 0 | **0** | **0** | `06-suite-i18n.log` |
| D | 桌面UI（A4） | `test/桌面UI/project-state.test.ts` | 20:10:35–20:10:35 | 10 | **10** | 0 | 0 | **0** | **0** | `07-suite-desktop-ui.log` |
| **合计** | — | — | 20:10:19–20:10:35 | **98** | **98** | **0** | **0** | **0** | **0** | — |

关键观察（与 B0/A 角色报告对照）：

- 与 B0 相比：编排 20→45（新增/扩展）、桌面窗口 10→27（新增两文件）、i18n 14→16（新增 key 契约用例）、桌面UI 新增 10；各组与 A1 自报 45/45、A3 自报 16/16、A4 自报 10/10 一致。
- i18n：`[i18n-guard] scanned=132 allowlisted=20 violations=0`；计数 `ui 1001 / main 576 / shared 62 / preferences 3，总计 1642`（B0 为 921/559/62/3=1545；新增 97 个全局任务状态/版本决策 key，含 14 个验收回交卡既有 key 保持）。
- 装配：`npm run test:assembly` 的文件集合 `test/装配/**/*.test.ts` 已包含于 §五 T3 全量回归文件中，未另起重复运行（团队计划 §7.3.2「如适用」；README 中英事件清单另行逐行核对，见 §八）。

---

## 五、T3 全量回归

| 项 | 实测值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)` |
| cwd | worktree 根（Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300 Git Bash） |
| 文件数 | **393**（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`；清单 `08-full-t3-file-list.txt`） |
| 起止（+08:00） | 20:11:15–20:16:04（**289,199.9962 ms ≈ 4 分 49 秒**） |
| 退出码 | **1**（因失败；非运行错误） |
| 计数 | **tests 3461 / pass 3433 / fail 10 / cancelled 0 / skipped 18 / todo 0** |
| 原始日志 | `08-full-t3.log`（4,590 行 / 512,319 B） |
| 失败分类 | 9 项既有 Windows symlink EPERM + **1 项新增确定性失败**（§七） |
| 新 skip | **0**（18 项 skip 与既有平台 skip 分类一致，见下） |

对照基准（`角色卡/测试/docs/change/2026-10-30_turn-retry-network-watch-baseline-evidence/full-regression-summary.txt`，不同 worktree/HEAD）：358 文件 / 3077 tests / 3050 pass / 9 fail（全为 EPERM）/ 18 skip。本次新增测试文件与用例使总数上升；**失败集合相对既有基线多出 1 项**（D-04，§七）。

排除项（不得当作通过）：

- `test/pi-adapter/write-sequencing.test.ts` —— 仓库既有已知挂起（历史记录：39+ 分钟无进展、CPU 约 2339s），客户已决定排除；依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`。本轮**未运行、行为未验证**；排除命令即上述 `find ... ! -name 'write-sequencing.test.ts'`。

18 项 skip（均为既有平台 skip，无新增）：

- codex-adapter 1（native process group SIGTERM）；
- pi-adapter 1（chmod 语义 Windows 不适用）；
- runtime-core file-write-safety 4（mode/umask POSIX 语义）；
- runtime-core lightweight-permission-repairs 6（D3 POSIX-mode）；
- 门禁引擎 pin-evidence 1（不可读文件权限）；
- shared atomic-write 5（D3 mode/umask）。

完整清单见 `16-failure-classification.txt`。

---

## 六、Electron E2E（phase4b，当前候选构建）

按 V1 §5.6 与 B0 记录的仓库既有方式运行（plain `node` 形式在 B0 已实测不可用：electron CJS 命名导出 `SyntaxError`/exit 1）。

| 项 | 实测值 |
| --- | --- |
| 命令 | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/Users/51054/AppData/Local/Temp/ans-phase4b-smoke-d1` |
| cwd | worktree 根 |
| 起止（+08:00） | 20:10:47–20:11:02 |
| 退出码 | **0** |
| 汇总 | **`PHASE4B_SMOKE PASS 69 checks / 0 failures`**（B0 为 64 checks；A4 新增 5 项状态区断言，见下） |
| 入口 | 当前候选重建的 `app/renderer/dist/index.html`，SHA-256 `b0af18785303987fbfe60e981b8db4906c1a1d2d5795e9aa74b1f3da2f96f5e1` |
| report.json | checks 69 / 69 true、failures 0、console errors 0、CSP violations 0、截图 14 张 |
| 原始日志 / 报告 | `09-phase4b-electron-smoke.log`、`phase4b-out/report.json`（SHA-256 `aef95035a366e7a8c25ccd675a4cade2aa2f2abc1b7bdadc14776117205cf4ff`） |
| 不录屏 | 满足（仅截图） |

A4 新增的 5 项 project-state 断言（全部 true）：

1. `project state section renders focus and badges`
2. `project state IPC called once on open`
3. `project state read-only: only refresh button`
4. `project state exposes no write bridge`
5. `project state refresh calls IPC once more`

截图 14 张（含新增 `phase4b-project-state.png`），逐文件 SHA-256 见 `phase4b-out/SHA256SUMS` 与 §九；其中 `phase4b-960.png` 与 `phase4b-960-five-role-tree.png` 哈希相同（harness 既有行为，两次窗口状态一致），不影响断言计数。

---

## 七、失败清单与分类

T3 全量 10 项失败 = **9 项既有 Windows symlink EPERM（环境）** + **1 项新增确定性失败（候选）**。

### 7.1 既有环境失败（9，非本次新增）

均为 `EPERM: operation not permitted, symlink`（errno -4048），与 2026-10-30 既有全量基线同类（文件布局随仓库演进略有差异，按测试名对应）：

| # | 文件:行 | 测试名 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

以上按既有环境失败单列，**不算通过、也不计为本变更新增失败**。

### 7.2 新增确定性失败（1，候选引入）

| 项 | 内容 |
| --- | --- |
| 文件:行 | `test/测试/entry-role-minimal-d.test.ts:153`（该测试文件**未被本候选修改**） |
| 测试名 | `D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules）` |
| 失败断言 | `AssertionError: D-04 撤除残留`；actual 非空、expected `[]` |
| 命中（3 文件） | `src\common\编排\project-state.ts: acceptance-rework`、`src\model\project-state.ts: acceptance-rework`、`app\renderer\src\lib\platform.ts: acceptance-rework` |
| 守卫正则 | `D04_RESIDUE = /governance-gate\|...\|acceptance-triage\|acceptance-rework\|request_acceptance\|.../`（该测试来自 2026-10-23 acceptance-rework-routing 任务的 D-04「撤除残留」要求） |
| 候选引入证明 | `git grep -n "acceptance-rework" HEAD -- src app` → **NONE at HEAD**；候选新增/修改在 3 文件中引入该词作为 blocker kind/注释/i18n 映射键（`project-state.ts` 类型联合与派生、`platform.ts` i18n key 映射） |
| 确定性复核 | 单文件重跑 `node --test --test-concurrency=1 test/测试/entry-role-minimal-d.test.ts`：tests 6 / pass 5 / fail 1、exit 1（`15-recheck-d04.log`），与全量结果一致，属源码扫描式确定性失败（非环境/并发） |
| 分类 | **本次新增确定性失败 = 1**；不满足 V1 §5.4 / AC-9.3「新增确定性失败必须为 0」「新 skip 必须为 0」（新 skip 为 0） |
| 处置 | D1 不改产品/测试、不强改断言；交统筹与属主（候选涉及 A0/A1/A4 三个写集）决定修复方式（例如重命名 blocker kind 以避开 D-04 词表，或按治理流程评估守卫词表是否允许该词），修复后需对受影响部分/全量重跑并使本证据失效重采 |

### 7.3 其它

- 无未知/无法解释的失败；无新增 skip/todo；无测试删除；未改断言保绿。
- 四组受影响套件与 E2E 全绿（§四/§六），说明失败局限在既有 D-04 残留守卫与候选命名冲突。

---

## 八、测试 diff 无弱化核对

- `git diff --stat -- test`：7 个修改测试文件 **+492 / −5**；另有 5 个新增测试文件（未跟踪）。
- 删除行仅 5 条：2 条 import 被同文件更完整 import 取代（`DispatchTaskFn` 等类型扩展、`DECISION_CARD_ALLOWED_ROLES` 扩展）；3 条 i18n 计数断言由旧值更新为新值（`ui 921/main 559/total 1545` → `ui 1001/main 576/total 1642`），断言仍为 `assert.deepEqual` / `assert.equal`。
- `grep '^\+.*(\.skip|\.todo|todo:)'`：**无新增 skip/todo**；`git diff --diff-filter=D --name-only -- test`：**无测试文件删除**。
- 原始 `git diff -U0` 全文：`10-test-diff-U0.txt`；摘要：`10b-test-diff-summary.txt`。
- README 中英事件清单（`11-readme-checklist.txt`）：`README.md` / `README.en.md` 各 1 行变更，均新增 `project.focus` / `project.note` / `version.decision` 三个事件名，无旧形状（`version.decision.request`、`project.focus.set` 零命中）。

---

## 九、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-02_global-task-state-D1-regression-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-candidate-identity.txt` | 188 | 15,183 | `c733de048fe2a401245c253dcf7a4bd322198bbd107eb0d0df6e20c087551532` |
| `01-npm-run-typecheck.log` | 9 | 233 | `1592797b7f91d3229893b3c4c828a0e79eb5ba67179c4e31932734699964bd9a` |
| `02-npm-run-typecheck-renderer.log` | 9 | 272 | `29babfda98851ef8b52e439d18de1dea695ae47174d9326570432010fd253862` |
| `03-npm-run-build-renderer.log` | 27 | 1,581 | `361eabdd23781d35edf3fdc9f1ca34fab6f6cc47d05a2838768f63a315a6cfc5` |
| `03b-renderer-dist-hashes.txt` | 25 | 1,244 | `ddda201427972fd58783c348ff64291ee81c1beb76962ef072d9f51e593ae1c4` |
| `04-suite-orchestration.log` | 58 | 5,501 | `8313db758be9fad646ab1312f72c6b40eeb21cac32849ab66a46fe6d3934f8ea` |
| `05-suite-desktop-app.log` | 40 | 3,759 | `351cabbd910833b5daf2fbf328d272c5e6ecb74f01ec7407a368b020e9e2b4ac` |
| `06-suite-i18n.log` | 30 | 1,963 | `cb53514ed843804b5b60d1a2e9fec016d7757d69eba351a6d5185ff1b2d537a3` |
| `07-suite-desktop-ui.log` | 23 | 1,386 | `c3b766fd0bf57b8395a6e8a3e39a66a590bfb770697be57159c63b5e82760688` |
| `08-full-t3-file-list.txt` | 393 | 16,684 | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `08-full-t3.log` | 4,590 | 512,319 | `39ecc36209633b75840a47a087b9fd05d787c0d30da679f8e6c1f9a32fb7d3f2` |
| `09-phase4b-electron-smoke.log` | 82 | 7,103 | `cb5a557e2dad5b64db9f039c72bcec511fd90663a8e190d7e4cd11dc52dd0848` |
| `10-test-diff-U0.txt` | 546 | 28,549 | `f3202e62fc1cbff9efa7b47abce23d9cdfda1c610dccef431676d8d8c9e843a7` |
| `10b-test-diff-summary.txt` | 22 | 1,162 | `2fb9777d12b8a7af7688b577a5616f4315c6375dca2a64ce0a3d2daa53c9698c` |
| `11-readme-checklist.txt` | 13 | 1,790 | `aa1d7de17edbd3ad537e1a84cbaf0b427f6257eea3b9b066b81d48f07f03fd81` |
| `12-scope-check.txt` | 13 | 424 | `863c197446fc9cecd79e4360a4a5ec524285809e5035a5fd63f19f271c36eba8` |
| `13-suite-summaries.txt` | 68 | 1,402 | `078bb4c660841a52c3db51a4e973d31f47399196a56bc32502903d51c472759a` |
| `14-post-run-verification.log` | 99 | 4,359 | `467a209596f25df2582b4238f678270875df2551e8a41b1ea9412bcb1c426a87` |
| `15-recheck-d04.log` | 48 | 2,264 | `a87babc982d6354d98abe2b0bc93cae6749faaf4507d04995c9b08235bafaef6` |
| `16-failure-classification.txt` | 222 | 15,463 | `d7f8dd46ca5c833540d569a7fbcc01bafc94bc0bb64e2fa96ea6604004604b8d` |
| `17-inventory.txt` | 40 | 3,968 | `7488c492c1e4d88ddcd57decea82186d44f2f02b4f8ad66982327b94bb26e8f4` |
| `phase4b-out/SHA256SUMS` | 15 | 1,370 | `36dd1e0c9fb469e5051beffae79a90d38f46c1626e87013e57ba34e223d3646d` |
| `phase4b-out/report.json` | 822 | 18,830 | `aef95035a366e7a8c25ccd675a4cade2aa2f2abc1b7bdadc14776117205cf4ff` |
| `phase4b-out/phase4b-project-state.png` | — | 101,399 | `2d26c9a40d73c4dd58b5adf9cbd34cf55411cd5f72f5097e0986f4e0585387ed` |
| `phase4b-out/phase4b-1360.png` | — | 92,682 | `8da23c50cc121f4a0687ea8251ec3ea39debb2e701bdc8e168e7cfdc46bc0604` |
| `phase4b-out/phase4b-960.png` | — | 69,419 | `c3c8b0d68734c9f7ad086da8e5f23c83c6a6981fafb91801a4b1359ca3462844` |
| `phase4b-out/phase4b-960-five-role-tree.png` | — | 69,419 | `c3c8b0d68734c9f7ad086da8e5f23c83c6a6981fafb91801a4b1359ca3462844` |
| `phase4b-out/phase4b-1360-report.png` | — | 98,195 | `019028c756921a8b68d4b1610d8ce7f6f70f4f1727847424543b6fdffdb5e994` |
| `phase4b-out/phase4b-960-report.png` | — | 74,769 | `8ece6a5d59a3fb8013010ecb894b6fcd2f937ba67884e65f6bd7d2bd48aecb5e` |
| `phase4b-out/phase4b-200pct.png` | — | 65,214 | `65e1ff3e32d09f97f2cd783eddab783d7d4957b92eb1715bec69914f4c6c77b8` |
| `phase4b-out/phase4b-200pct-five-role-tree.png` | — | 64,014 | `8f84cf57033abf37177db7a99726fd89e2c9397758d843507523e8e852b8513f` |
| `phase4b-out/phase4b-200pct-report.png` | — | 60,733 | `4d0d00b5495494cfdf08bdc8c628857785a5cacbd20b33c5fb5ac7e7bfdc4b6c` |
| `phase4b-out/phase4b-200pct-report-details.png` | — | 70,877 | `77450f8e0e281b339f41662096ee67b5f0e0fd2a00646e1000d483c67cef29b2` |
| `phase4b-out/a5-acceptance-handback.png` | — | 66,722 | `272580daa7f65a56e4316b328a20f2d849f3f544aeb1307d2401626ee175dbb0` |
| `phase4b-out/a5-acceptance-delivery.png` | — | 79,459 | `ac5ddb0fc99d1220fa21aa34d04275750b7605bba27f80840ef91ad10c9b9ad9` |
| `phase4b-out/a5-acceptance-dialog-200pct.png` | — | 67,801 | `40930e79707323eb0d69030d089225b0ac84a645dfde83e307d2e21f7ac6f1fe` |
| `phase4b-out/a5-acceptance-report-200pct.png` | — | 76,718 | `47e6c62c1d9fd7844daa264e3b169bfafd280d122161df4e6b154a2f1269fd63` |

整理后 `git status` 复测（`14-post-run-verification.log`）：HEAD 不变；`git status --porcelain -- src app test` 仍为候选的 30 条；逐文件重算 `git hash-object` + `sha256sum` 与 `00-candidate-identity.txt` 快照 **32/32 无差异**（候选外零改动）；staged 空。

---

## 十、限制与未做

1. **T3 排除项**：`test/pi-adapter/write-sequencing.test.ts` 为仓库既有已知挂起（历史记录：39+ 分钟无进展、CPU 约 2339s；客户已决定排除），本轮**未运行、未验证**，不得视为通过。排除命令与原因见 §五。
2. **既有 Windows symlink EPERM**：属既有环境失败，单列于 §七；不得算作通过，也不得算作本变更新增失败。
3. **新增确定性失败 D-04**：候选新增文件中出现 `acceptance-rework` 字样，命中既有 2026-10-23「撤除残留」守卫；D1 未修复、未改断言。该失败使 **新增确定性失败 = 1（非 0）**，在修复并重跑前，V1 §5.4 / AC-9.3 的 T3 条件不满足；是否返工及修复方式由统筹/属主按治理流程决定。
4. **E2E 素材**：phase4b 为桌面UI 既有 harness（A4 按需扩展 5 项断言）；未运行 `test/桌面应用/e2e/main.mjs`（phase4b 已覆盖真实 Electron 入口与状态区；main.mjs 属桌面窗口所有，非必要）。
5. 本记录只记录测试事实与证据，不代替独立验收；AC/R1–R5 的判定属 E2。
6. 未改产品/测试/角色卡/边界/治理文档；未 commit/push；未接触客户。

---

## 十一、D1 出口核对（只报事实）

- 候选哈希可复算：**是**（§一逐文件 `git hash-object` + `sha256sum`，完整清单在证据；运行后 32/32 无差异）。
- 双端 typecheck / renderer build：**均 exit 0**（§三）。
- 受影响套件：**98/98 pass，0 fail/skip/todo**（§四）。
- T3 全量：**3461 tests / 3433 pass / 10 fail / 18 skipped / 0 todo，exit 1**；其中 9 项既有 Windows symlink EPERM、**1 项新增确定性失败（D-04）**——**新增确定性失败 = 1（非 0）**，V1 §5.4 / AC-9.3 的 T3 条件未满足；排除项与分类见 §五/§七。
- Electron E2E：**当前候选重建后 PASS 69/69、0 failures、14 截图、零 console/CSP**（§六）。
- 测试 diff 无弱化：**是**（§八）。
- 未 commit/push / 未改产品测试 / 未接触客户。
