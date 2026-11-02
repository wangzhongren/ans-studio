---
id: global-task-state-d1-rerun-regression
type: change
title: global task state D1 重跑（D-04 返工后）全量回归与证据
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: verified
related: [global-task-state-b0-baseline, global-task-state-d1-regression]
events:
  - date: "2026-11-02"
    kind: created
    summary: D-04 返工（acceptance-rework→rework-pending）后按新候选重跑 D1：候选哈希、双 typecheck/build、受影响套件、D-04 守卫、T3 全量与 phase4b E2E
  - date: "2026-11-02"
    kind: supersedes
    summary: 替代 2026-11-02_global-task-state-D1-regression.md（旧候选 needs-work 结果），旧记录与旧证据标注 superseded、不得沿用
---

# D1 重跑（D-04 返工后）：global task state（全局任务状态 / 版本决策）

- **任务 ID**：`2026-11-02-global-task-state`
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-02 / 团队计划 §五 **D1（T3 回归）重跑**
- **重跑原因**：D1 第一次运行（旧候选）T3 发现 1 项新增确定性失败——既有 D-04 残留守卫命中候选新增的 `acceptance-rework` 字样。返工已完成：blocker kind `acceptance-rework` → `rework-pending`（A0/A1/A4 相关文件；A2/A3/A5 无改名改动）。**旧 D1 记录与证据已标注 `superseded`，其 needs-work 结论与候选哈希不得沿用**；本记录只针对返工后的新候选。
- **状态**：**D1 重跑完成**。本记录只记录事实与证据，**不判验收、不判通过/返工**；最终结论由独立验收 E2 按 V1 v1.1（`docs/acceptance/global-task-state-criteria-v1.md`，915 行 / SHA-256 `fe48dc326c918bb0c94f353df2bcd55a6d69b9f95b93ec4fdc0e259094a9847f`）判定。
- **候选**：HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`（分支 `feat/acceptance-return-card`）+ 工作树 A0–A5 返工后未提交改动；**32 个候选文件与团队计划 §4.1/§4.3 写集精确匹配**（30 个 `src/app/test` + README 2），相对第一次运行仅 5 个文件内容变化（§二增量表），无路径增删；写集外产品/测试改动 0，`package.json`/锁/构建配置未改，staged 空；全部运行后候选逐文件哈希快照一致。
- **结果摘要**：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0；受影响套件 **99 tests / 99 pass / 0 fail / 0 skipped / 0 todo**；`test/测试/entry-role-minimal-d.test.ts` **6/6 pass**（旧 D-04 失败已消失）；重建后 dist 旧 token `acceptance-rework` 计数 **0**、新 token `rework-pending` 计数 1；T3 全量（393 文件，排除 `write-sequencing.test.ts`）**3462 tests / 3434 pass / 10 fail / 18 skipped / 0 todo**（exit 1；9 项既有 Windows symlink EPERM + 1 项间歇性 cleanup EPERM，**新增确定性失败 0**，见 §六/§九）；`phase4b-electron-smoke.mjs` **PASS 69 checks / 0 failures**（exit 0，console 0，CSP 0，14 张截图）；未 commit/push、未接触客户。

---

## 一、重跑输入与替代关系

| 项 | 实测值 | 说明 |
| --- | --- | --- |
| 返工范围 | A0 `src/model/project-state.ts`、A1 `src/common/编排/project-state.ts` + `test/编排/project-state.test.ts`、A4 `app/renderer/src/lib/platform.ts` + `test/桌面UI/project-state.test.ts` | 与派发一致；blocker kind 改名 `acceptance-rework` → `rework-pending` |
| 派发给定哈希核对 | 5 文件行数/哈希逐项一致：417/`61d77932…`、1156/`a082f0d2…`、465/`ba996417…`、590/`604a0aef…`、493/`d0b6d244…` | 以本记录 §二工作区实测为准 |
| V1 v1.1 | `docs/acceptance/global-task-state-criteria-v1.md`，**915 行 / `fe48dc326c918bb0c94f353df2bcd55a6d69b9f95b93ec4fdc0e259094a9847f`** | 与派发一致（旧 D1 时为 v1 907 行 / `b6c23c78…`） |
| 策划 P1.3 | `docs/planning/2026-11-02_design_global-task-state-version-authority.md`，**1303 行 / `7faa3e8b348612b6151aec4046a169b8810eb2bbcf347c3866675d65f1084dc8`** | 与派发一致（旧 D1 时为 P1.2 1302 / `1573e1ef…`） |
| 团队计划 | `docs/scheduling/2026-11-02_team-plan_global-task-state.md`，477 行 / `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62` | 未变 |
| 旧记录状态 | `2026-11-02_global-task-state-D1-regression.md` frontmatter `status: superseded`，正文顶部加替代说明；旧证据目录加 `SUPERSEDED.md` | 旧候选证据保留、不得沿用 |

---

## 二、候选身份与写集闭合

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD | `git rev-parse HEAD` | `0a123109a6b10e9b60fd1aee5f08f861455c48de` |
| 分支 | `git branch --show-current` | `feat/acceptance-return-card` |
| 候选清单 | `git status --porcelain -- src app test` | 30 条（A0 4 + A1 9 + A2 7 + A3 3 + A4 7）；README 2 条（A5） |
| 写集闭合 | 期望清单 vs `git -c core.quotePath=false ls-files -m -o` 双向比对 | **32/32 精确匹配**，无写集外产品/测试改动（`12-scope-check.txt`） |
| 暂存区 / 配置 | `git diff --cached --name-only`；`package.json`/锁/构建配置 status | 均**空** |
| 相对第一次运行增量 | 逐文件哈希 diff（`00b-candidate-delta.txt`） | **仅 5 个文件变化、0 路径增删**（见下表） |

返工增量（旧→新，工作区字节）：

| 文件 | 旧 SHA-256（第一次 D1） | 新 SHA-256（本次） |
| --- | --- | --- |
| `src/model/project-state.ts` | `8e5a9145…` | `61d7793276bf389770673001dd416e8821a0943faa983e6e80eacf386bf3103a` |
| `src/common/编排/project-state.ts` | `6f9e6467…` | `a082f0d220a859d430f421c1225dd9384ade66e3cf5f723bfe8cac652007b6f8` |
| `test/编排/project-state.test.ts` | `d7381231…` | `ba996417a6be036c66c7d55e9b806e0ee7093c07a724a0c2b26507d43928e266` |
| `app/renderer/src/lib/platform.ts` | `b7c2c7a2…` | `604a0aef17628ac335d5a9e428695a2ba565aeae5d1e60774d3b426360e7d7fe` |
| `test/桌面UI/project-state.test.ts` | `e47ea39b…` | `d0b6d244c17a0159ca92e1682104ee9e0cb94ec692b356ed01c1bd586adeb743` |

完整候选哈希（32 文件，`git hash-object` + `sha256sum`，全部 LF；完整机器可读清单 `00-candidate-identity.txt`）：

| # | 角色 | 文件 | git hash-object | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | A0 | `src/model/project-state.ts` | `7b8d5ea65ce0486b4496267123f9e933c04dbe17` | `61d7793276bf389770673001dd416e8821a0943faa983e6e80eacf386bf3103a` |
| 2 | A0 | `src/model/runtime.ts` | `19f4dac4d9343144a8674c23afaa1c053e9c7974` | `014e0b0cf214f765f3b700335976d904109b8facf0d88f3f4323aef117dccc4e` |
| 3 | A0 | `src/provider/runtime/tools.ts` | `98b5df46957db795d6466c1dc4d4eace73155d6a` | `dfa3fb4fe1fa58bc92fdceac0d6eef5862c39c2534add372c00662bb78e3bac0` |
| 4 | A0 | `src/provider/runtime/schema.ts` | `675dc23532fddbabb64a7aacb0aa5effe946f0cc` | `2da78f7c6462875c6789067ca9cfd7e814dd527f71cd4de993d611c2f6106654` |
| 5 | A1 | `src/common/编排/task-state.ts` | `b28ba7e1317ab5aab33f2c3e53b54c20104fa9c2` | `4cb100b1d7c2125731739484e4c6d9b93ccfb44e17bd15c29739fedc6781eed0` |
| 6 | A1 | `src/common/编排/project-state.ts` | `eeb58f89d65e8d31b83f1bc8270d91fe65a745a8` | `a082f0d220a859d430f421c1225dd9384ade66e3cf5f723bfe8cac652007b6f8` |
| 7 | A1 | `src/common/编排/version-decision.ts` | `9fe716ad41c43c153ce6da464f2382b072c54bc8` | `978e6d9fd5d1c6d98eb26c0228a592d329ba74e748ea19622c705d702108e1e6` |
| 8 | A1 | `src/pipeline/orchestration/run-role.ts` | `c31d676e8496f067ab321bf9f879c90b6adb21e6` | `e8c1cf26dba6eaa3dc06603a3ba5a7e5aff877a70fed57bb5dcd5098da272d17` |
| 9 | A1 | `test/编排/project-state.test.ts` | `51edae38a644abe8df925c6080323859e9917e15` | `ba996417a6be036c66c7d55e9b806e0ee7093c07a724a0c2b26507d43928e266` |
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
| 26 | A4 | `app/renderer/src/lib/platform.ts` | `29069f196d91eb61ce2c7c11492695c249ad44f0` | `604a0aef17628ac335d5a9e428695a2ba565aeae5d1e60774d3b426360e7d7fe` |
| 27 | A4 | `app/renderer/src/shell/shell.css` | `bec217b80e442b0ef112757cf552f42f46c5734d` | `2b76fa8fc940272c8ace07a460adc202ff2736d014f36598f02efe3246c8e240` |
| 28 | A4 | `test/桌面UI/project-state.test.ts` | `fda47ca16f756a25d696ad68369bf754a0334e37` | `d0b6d244c17a0159ca92e1682104ee9e0cb94ec692b356ed01c1bd586adeb743` |
| 29 | A4 | `test/桌面UI/phase4b-electron-smoke.mjs` | `c71528f695a731aa229c4419e0b0e8897ca0f2ca` | `bd6fdba15954da3e6c689d9fe8028d421e4e59200909a2c1f3a42f6b6bf409eb` |
| 30 | A4 | `test/桌面UI/phase4b-smoke-preload.cjs` | `cca75d9cbf480b5df4fc980c64a6b0f20e82c722` | `d1b7612173f0b888f2aa01cdec5e6674fac0efe4699a8988c40ab7550ac8d1b3` |
| 31 | A5 | `README.md` | `77e259adba7ae455f4cbb5d848b116ddc4629db7` | `d2c77e7864323c888c6b0b8da43f0782dfd44a0a5da2d7443e8627ea0f6f4692` |
| 32 | A5 | `README.en.md` | `3b0d1a60b9e22640ef4282eae1eef09332fddecf` | `51b1796b7442fc2754030576ae714045944e7255184c0ea8f9ffc8eba4b08315` |

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1` |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `/bin/bash.exe` |
| Electron | 44.7.0（`node_modules/electron/dist/electron.exe`） |
| 时区 | Asia/Shanghai |

---

## 四、门禁命令（typecheck / typecheck:renderer / build:renderer）

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 20:25:45–20:25:47 | **0** | 0 类型错误 | `01-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 20:25:48–20:25:49 | **0** | 0 类型错误 | `02-npm-run-typecheck-renderer.log` |
| 3 | `npm run build:renderer`（`vite build`） | 20:25:57–20:25:59 | **0** | vite 8.3.4，2795 modules，382ms；仅既有非致命警告（chunk >500 kB、`INEFFECTIVE_DYNAMIC_IMPORT`） | `03-npm-run-build-renderer.log` |

重建产物（`app/renderer/dist/` 为忽略产物、非产品候选）：

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `app/renderer/dist/index.html` | 597 B | `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f` |
| `app/renderer/dist/assets/index-HVZOxqQQ.js` | 1,325,286 B | `a341b86ea1d596a7bf3a8c63a726af443bde20b1f1ead807dfff529966a90b51` |
| `app/renderer/dist/assets/index-haa4j9RY.css` | 152,847 B | `523c311667d0936fe3658dc298578173daebf92ce8fcf4fe207639fd66642498` |
| `app/renderer/dist/assets/ans-studio-ans-icon-DOpmqMAU.png` | 55,057 B | `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c` |

Token 检查（重建前源码与 dist、重建后 dist）：

- 源码 `src app`（排除 dist/node_modules）：`acceptance-rework` **0 命中**；`rework-pending` 在 A0/A1/A4 对应位置存在（`03a-token-check-before-build.txt`）。
- 重建后 `app/renderer/dist`：`acceptance-rework` **0**、`rework-pending` **1**（`03b-renderer-dist-hashes.txt`）。
- `git ls-files app/renderer/dist` = 0，`git check-ignore` 确认 `.gitignore:9`。

---

## 五、受影响套件与 D-04 守卫

全部 `node --test --test-concurrency=1`，文件清单与计划一致；均 exit 0。

| # | 层 | 文件组 | 起止（+08:00） | tests | pass | fail | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排（A1） | `test/编排/project-state.test.ts`、`version-decision.test.ts`、`task-state.test.ts`、`run-manifest.test.ts`、`decision-card.test.ts` | 20:26:12–20:26:16 | 45 | **45** | 0 | **0** | **0** | `04-suite-orchestration.log` |
| B | 桌面窗口（A2） | `test/桌面应用/project-state.test.ts`、`version-decision.test.ts`、`chief-workflow.test.ts`、`run-change.test.ts`、`run-change-entry.test.ts` | 20:26:19–20:26:23 | 27 | **27** | 0 | **0** | **0** | `05-suite-desktop-app.log` |
| C | 项目管理（A3） | `test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts` | 20:26:26–20:26:27 | 16 | **16** | 0 | **0** | **0** | `06-suite-i18n.log` |
| D | 桌面UI（A4） | `test/桌面UI/project-state.test.ts` | 20:26:30–20:26:30 | 11 | **11** | 0 | **0** | **0** | `07-suite-desktop-ui.log` |
| **合计** | — | — | 20:26:12–20:26:30 | **99** | **99** | **0** | **0** | **0** | — |

- 与第一次 D1 对比：编排 45、桌面窗口 27、i18n 16 不变；桌面UI 10→**11**（A4 返工测试新增 1 项，`test/桌面UI/project-state.test.ts` 493 行）。
- i18n：`[i18n-guard] scanned=132 allowlisted=20 violations=0`；计数 `ui 1001 / main 576 / shared 62 / preferences 3，总计 1642`（A3 无改动，与第一次 D1 一致）。
- **D-04 守卫单测**：`node --test --test-concurrency=1 test/测试/entry-role-minimal-d.test.ts` → **tests 6 / pass 6 / fail 0 / exit 0**（`08-d04-guard.log`）；第一次 D1 的 1 项新增确定性失败已消失。

---

## 六、T3 全量回归

| 项 | 实测值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)` |
| cwd | worktree 根（Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300 Git Bash） |
| 文件数 | **393**（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`；清单 `10-full-t3-file-list.txt`） |
| 起止（+08:00） | 20:26:57–20:31:49（**291,225.3082 ms ≈ 4 分 51 秒**） |
| 退出码 | **1**（因失败；非运行错误） |
| 计数 | **tests 3462 / pass 3434 / fail 10 / cancelled 0 / skipped 18 / todo 0** |
| 原始日志 | `10-full-t3.log`（4,578 行 / 512,124 B） |
| 失败分类 | **9 项既有 Windows symlink EPERM + 1 项间歇性临时目录清理 EPERM（环境）**；**新增确定性失败 = 0**（§九） |
| 新 skip | **0**（18 项与既有平台 skip 分类一致） |
| 与第一次 D1 对比 | 测试总数 3461→3462（A4 新增 1 项 UI 测试）；D-04 新增确定性失败已消失；本次多出的 background-entry 失败为间歇性环境 EPERM（§九） |

排除项（不得当作通过）：

- `test/pi-adapter/write-sequencing.test.ts` —— 仓库既有已知挂起（历史记录：39+ 分钟无进展、CPU 约 2339s），客户已决定排除；依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`。本轮**未运行、行为未验证**；排除命令即上述 `find ... ! -name 'write-sequencing.test.ts'`。

18 项 skip（均为既有平台 skip，无新增）：codex-adapter 1、pi-adapter 1、runtime-core file-write-safety 4、runtime-core lightweight-permission-repairs 6、门禁引擎 pin-evidence 1、shared atomic-write 5。完整清单见 `15-failure-classification.txt`。

---

## 七、Electron E2E（phase4b，返工后候选构建）

按 V1 §5.6 与 B0 记录的仓库既有方式运行（plain `node` 形式不可用，见 B0 §七）。

| 项 | 实测值 |
| --- | --- |
| 命令 | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/Users/51054/AppData/Local/Temp/ans-phase4b-smoke-d1-rerun` |
| 起止（+08:00） | 20:26:32–20:26:45 |
| 退出码 | **0** |
| 汇总 | **`PHASE4B_SMOKE PASS 69 checks / 0 failures`** |
| 入口 | 返工后候选重建的 `app/renderer/dist/index.html`，SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f` |
| report.json | checks 69 / 69 true、failures 0、console errors 0、CSP violations 0、截图 14 张（含 5 项 project-state 断言全 true） |
| 原始日志 / 报告 | `09-phase4b-electron-smoke.log`、`phase4b-out/report.json` |
| 不录屏 | 满足（仅截图） |

截图 14 张（含 `phase4b-project-state.png`），逐文件 SHA-256 见 `phase4b-out/SHA256SUMS` 与 §九；harness 既有行为：`phase4b-960.png` 与 `phase4b-960-five-role-tree.png` 哈希相同。

---

## 八、测试 diff 无弱化核对 / README

- `git diff --stat -- test`：7 个修改测试文件 **+492 / −5**（与第一次 D1 相同；返工仅改 2 个**未跟踪新增**测试文件内容，不在 tracked diff 中）。
- 删除行仅 5 条：2 条 import 被超集取代、3 条 i18n 计数旧值更新（921/1545 → 1001/1642）；断言仍为 `assert.deepEqual`/`assert.equal`。
- 无新增 skip/todo、无测试删除（`11-test-diff-U0.txt`、`11b-test-diff-summary.txt`）。
- README（A5 无改动）：`README.md`/`README.en.md` 各 1 行事件清单，含 `project.focus`/`project.note`/`version.decision`，无旧形状（`13-readme-checklist.txt`）。
- 写集核对：32/32 精确匹配、无越界、无 package/构建配置改动（`12-scope-check.txt`）。

---

## 九、失败清单与分类

T3 全量 10 项失败 = **9 项既有 Windows symlink EPERM + 1 项间歇性临时目录清理 EPERM（环境）**；**新增确定性失败 = 0**。

### 9.1 既有环境失败（9，与第一次 D1 相同）

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

### 9.2 间歇性环境失败（1，非确定性，单列）

| 项 | 内容 |
| --- | --- |
| 文件:行 | `test/测试/background-tasks-entry/background-entry.test.ts:292` |
| 测试名 | `F4/CC1：第 9 个并发启动在 ShellGate 之前被拒——分类器零调用、零 spawn、无任务` |
| 失败原文 | `Error: EPERM, Permission denied: 'C:\Users\51054\AppData\Local\Temp\ans-qa-bg-…'`；`rmSync`（`fixture.ts:52` cleanup，测试体末尾 344 行），errno 1 |
| 性质 | **清理阶段临时目录删除 EPERM，不是断言失败、不涉及候选代码**；同一测试在第一次 D1 全量中通过、本次全量失败一次；单文件隔离复跑 2 次：run1 **12/12 pass**、run2 **11/12 fail（同一 cleanup EPERM）**（`14b-recheck-background-entry-run1/2.log`）→ **非确定性环境 flake**（Windows 临时目录删除锁/权限） |
| 分类 | 计入「环境失败」并单列；**不计为本次新增确定性失败**（未复现为确定性、与候选改动无因果链）；若后续 E2 需要，可按仓库既有 EPERM 口径另行观察 |

### 9.3 新增确定性失败：0

- 第一次 D1 的 D-04 残留守卫失败已消失：`test/测试/entry-role-minimal-d.test.ts` **6/6 pass**（`08-d04-guard.log`）；`src/app` 源码与重建后 `dist` 的 `acceptance-rework` 命中数均为 **0**，新 token `rework-pending` 在位（`03a/03b`）。
- 全量失败集合中的 10 项均可归为环境（9 既有 symlink EPERM + 1 间歇性 cleanup EPERM）；**没有任何失败指向候选断言/行为**。

### 9.4 其它

- 无未知/无法解释的失败；无新增 skip/todo；无测试删除；未改断言保绿。

---

## 十、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-candidate-identity.txt` | 185 | 15,242 | `417166423e1fb2b874c22b11a9db6c6844aa9dbcfe700938bb7fa8cb3b6335a6` |
| `00b-candidate-delta.txt` | 22 | 1,572 | `ca9b1177f3b3a082ceed295b147bb8944467a4ba69a94efcf1bc2c79d48d4ff3` |
| `01-npm-run-typecheck.log` | 9 | 233 | `6121896fb7b72cc8acd00634234f41a725a0d41d2bb2a26f29533f2b74d7bd83` |
| `02-npm-run-typecheck-renderer.log` | 9 | 272 | `cb5d9a6532cee60804de921761644f0924f9c4c33471f37842e1093b5c9e4b2d` |
| `03-npm-run-build-renderer.log` | 27 | 1,581 | `138cdb2aa09c663aa45114291e0a36a4433f4077a79b38ed22df5e1e80af29ea` |
| `03a-token-check-before-build.txt` | 15 | 1,231 | `8a42ca3ec8894b23049072221c4b69c5fa1bc237b59abbe7f70f17d1edb597a8` |
| `03b-renderer-dist-hashes.txt` | 27 | 1,285 | `842ae61c334c56e44f486eb300698fc04d4d0b07e2802e1064ddc0a1e5153977` |
| `04-suite-orchestration.log` | 58 | 5,487 | `5c2d97af22cb9e701e1df681955e772f6afad5ae7b269b44926adba371820bec` |
| `05-suite-desktop-app.log` | 40 | 3,762 | `e7ccf1d8a5e3b7f05aa4b617430920621d2a44a15af1a5ce73f49751cefd542e` |
| `06-suite-i18n.log` | 30 | 1,962 | `5c542be9f76d2eaeb9a2f53f060c867fa95a3f57f3f2bd47ef767918bb530a84` |
| `07-suite-desktop-ui.log` | 24 | 1,505 | `80189d18af9e57e74a97a3d117059828140ed74409d1c1f5d376c5d785da3271` |
| `08-d04-guard.log` | 19 | 907 | `f7c4078edddb9600dabbef0dff333eec37c46747f05f6010853b153975f3078b` |
| `09-phase4b-electron-smoke.log` | 82 | 7,098 | `38cb55b3c133a127f904fd495c5a9d431d968e08a209221276a01a2b29057357` |
| `10-full-t3-file-list.txt` | 393 | 16,684 | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `10-full-t3.log` | 4,578 | 512,124 | `9f92a5eec5efe9900e65e427e5c5f295273015923b9d1f5fe09728359be83472` |
| `11-test-diff-U0.txt` | 546 | 28,549 | `f3202e62fc1cbff9efa7b47abce23d9cdfda1c610dccef431676d8d8c9e843a7` |
| `11b-test-diff-summary.txt` | 22 | 1,138 | `771ca07cbf55d67837f74503be5d9ae608b128e8268a8d3bae02b54146efee4d` |
| `12-scope-check.txt` | 13 | 387 | `a4dbb2da68a4229b23d2c6a3f583fde4d0ceef310f44ab21448632b1b260751c` |
| `13-readme-checklist.txt` | 13 | 1,655 | `72b126717c0cf5f18b98d3195e290f3b67db3151876a9bed5e3a337c0080e0df` |
| `14b-recheck-background-entry-run1.log` | 25 | 1,721 | `2b1a85408b426d0a45fd88330ecfc4f911834c3d4393ce8a01521e53d1cca2d1` |
| `14b-recheck-background-entry-run2.log` | 41 | 2,723 | `eb7b3c42923782d18cf6301e105e393c9e880731cc2badc40e7bfdda3f2acb89` |
| `15-failure-classification.txt` | 207 | 15,150 | `c54158243e0dc6e4358982b1a3c0768e2ac68610201bd7d6425c4646b6199e28` |
| `16-post-run-verification.log` | 54 | 2,663 | `99b9a785845c5ccc3d28590552fbf865a804e1030f123d063fe1a99c01deba11` |
| `17-inventory.txt` | 44 | 4,305 | `eb20d785f442feb9e7ce75f7588d8dcee4cd4e2c952e72690b4da4b133a965b4` |
| `phase4b-out/SHA256SUMS` | 15 | 1,370 | `ac2329b924e2b183c89e3bb2bdc5970011070ca40f282a019441f33cac0c6cd2` |
| `phase4b-out/report.json` | 822 | 18,830 | `aef95035a366e7a8c25ccd675a4cade2aa2f2abc1b7bdadc14776117205cf4ff` |
| `phase4b-out/phase4b-project-state.png` | — | 114,979 | `bb8ee07b9beca13fd60fea363104e4466a5661367256c09c242894307fea9b6b` |
| `phase4b-out/phase4b-1360.png` | — | 91,052 | `68fac7a8bb50309d2f64d9cfb6020d22ee71c314839f78b08095308b4273cdcf` |
| `phase4b-out/phase4b-960.png` | — | 69,435 | `d813fbd0fd9a28ec44c5a2a2015c24fde1fe28108ed7352075bab352f09e8536` |
| `phase4b-out/phase4b-960-five-role-tree.png` | — | 69,419 | `c3c8b0d68734c9f7ad086da8e5f23c83c6a6981fafb91801a4b1359ca3462844` |
| `phase4b-out/phase4b-1360-report.png` | — | 98,195 | `019028c756921a8b68d4b1610d8ce7f6f70f4f1727847424543b6fdffdb5e994` |
| `phase4b-out/phase4b-960-report.png` | — | 74,769 | `8ece6a5d59a3fb8013010ecb894b6fcd2f937ba67884e65f6bd7d2bd48aecb5e` |
| `phase4b-out/phase4b-200pct.png` | — | 65,214 | `65e1ff3e32d09f97f2cd783eddab783d7d4957b92eb1715bec69914f4c6c77b8` |
| `phase4b-out/phase4b-200pct-five-role-tree.png` | — | 64,014 | `8f84cf57033abf37177db7a99726fd89e2c9397758d843507523e8e852b8513f` |
| `phase4b-out/phase4b-200pct-report.png` | — | 60,733 | `4d0d00b5495494cfdf08bdc8c628857785a5cacbd20b33c5fb5ac7e7bfdc4b6c` |
| `phase4b-out/phase4b-200pct-report-details.png` | — | 70,877 | `77450f8e0e281b339f41662096ee67b5f0e0fd2a00646e1000d483c67cef29b2` |
| `phase4b-out/a5-acceptance-handback.png` | — | 66,707 | `45b405ce5a66680d72b63308dd7219c03d0a3193d3e99b8bb18025f09f6ffe79` |
| `phase4b-out/a5-acceptance-delivery.png` | — | 79,458 | `9818f55de46dadb8eedea7986e615cedb1ad74773b06103f766ea7c37a18250e` |
| `phase4b-out/a5-acceptance-dialog-200pct.png` | — | 67,797 | `d8dce81c7c39c211bdb7b89530f293eb2aefb8b6ce9ff41ceca6bc067864348e` |
| `phase4b-out/a5-acceptance-report-200pct.png` | — | 76,718 | `47e6c62c1d9fd7844daa264e3b169bfafd280d122161df4e6b154a2f1269fd63` |

整理后 `git status` 复测（`16-post-run-verification.log`）：HEAD 不变；`git status --porcelain -- src app test` 仍为候选 30 条；逐文件重算 `git hash-object` + `sha256sum` 与 `00-candidate-identity.txt` 快照 **32/32 无差异**（候选外零改动）；staged 空。

---

## 十一、限制与未做

1. **T3 排除项**：`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起（39+ 分钟无进展、CPU 约 2339s；客户已决定排除），本轮**未运行、未验证**，不得视为通过。
2. **既有 Windows symlink EPERM**：既有环境失败单列于 §九，不算通过、不计新增。
3. **E2E 素材**：phase4b 为既有 harness；未运行 `test/桌面应用/e2e/main.mjs`（非必要）。
4. 本记录只记录测试事实与证据，不代替独立验收；AC/R1–R5 的判定属 E2。
5. 未改产品/测试/角色卡/边界/治理文档；未 commit/push；未接触客户。

---

## 十二、D1 重跑出口核对（只报事实）

- 候选哈希可复算：**是**（§二逐文件；完整清单在证据；运行后 32/32 快照一致）。
- 双端 typecheck / renderer build：**均 exit 0**（§四）；重建 dist 无旧 token `acceptance-rework`。
- 受影响套件 + D-04 守卫：**99/99 + 6/6 pass，0 fail/skip/todo**（§五）。
- T3 全量：**3462 tests / 3434 pass / 10 fail / 18 skipped / 0 todo，exit 1**；失败 = 9 项既有 Windows symlink EPERM + 1 项间歇性 cleanup EPERM（环境，单跑 1 过 1 败）；**新增确定性失败 = 0**（D-04 已消失）。排除项与分类见 §六/§九。
- Electron E2E：**返工后候选重建 PASS 69/69、0 failures、14 截图、零 console/CSP**（§七）。
- 测试 diff 无弱化：**是**（§八）。
- 未 commit/push / 未改产品测试 / 未接触客户。
