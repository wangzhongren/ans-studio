---
id: acceptance-return-card-b0-baseline
type: change
title: acceptance return card B0 基线记录
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-11-02"
    kind: created
    summary: 记录 B0 基线环境、工作树状态、三条门禁命令与四组受影响套件结果
---

# B0 基线记录：acceptance return card（验收结果返回卡）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-02 / 团队计划 §五 **B0（基线）**
- **状态**：**B0 完成（基线命令与受影响套件全部通过）**。本记录只记录事实，**不实施、不验收、不判通过/返工**；不是独立验收结论。
- **入口**：按调度派发说明，B0 入口（闸门 2 + 客户实施授权 + V1 + H1）已核验满足；本记录不重新判定闸门，也不把闸门确认当实施授权本身。
- **一句话事实**：HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` / 分支 `feat/flow-improvements-wave1`；`src app test` 无本任务改动；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 均退出码 0；四组受影响套件合计 **94 tests / 94 pass / 0 fail / 0 skipped / 0 todo**；本 worktree 未启动应用、未跑 Electron E2E、未 commit/push。

---

## 一、入口输入快照（只读核对）

| 项 | 实测值 | 与派发说明/冻结值 |
| --- | --- | --- |
| 团队计划 | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md`，**429 行 / SHA-256 `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6`** | 一致 |
| 实施前验收标准 V1 | `docs/acceptance/acceptance-return-card-criteria-v1.md`，**926 行 / `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b`** | 一致 |
| 策划方案 P1.2 | `docs/planning/2026-11-02_design_acceptance-return-card.md`，**873 行 / `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2`** | 一致 |
| 独立复核记录 | `docs/planning/2026-11-02_review_acceptance-return-card.md`，**143 行 / `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f`** | 一致 |
| 沟通记录（当前观察值） | `docs/communication/2026-11-02_intent_acceptance-return-card.md`，**137 行 / `654e432b5ba27ae73fddfd7bf2e7c598b5bc1b880986e8018e0d12f2ede3098b`** | V1 冻结时引用 130 行 / `48fa7342…`；该文件是可能继续追加的管理记录，本记录只留观察值，不用其哈希判定入口 |

说明：B0 入口状态以调度派发说明为准；上表是读取时点的文件事实，供后续变更包复算。

---

## 二、代码与工作树基线

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 分支 | `git branch --show-current` | `feat/flow-improvements-wave1` |
| HEAD | `git rev-parse HEAD` | `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` |
| 工作树 | `git status --short` | 7 个已跟踪修改（沟通/策划/调度 memo、B-1 治理三文件）+ 4 个未跟踪管理记录（V1、方案 P1.2、复核、团队计划）；无产品/测试改动 |
| 产品/测试改动 | `git status --porcelain -- src app test` | **空** |
| 暂存区 | `git diff --cached --name-only` | **空** |
| 任务配置 | `test -f .ans/project.json` | **不存在**（未启用 task_ops） |

B0 全部命令执行后复测：HEAD、分支不变；`git status --porcelain -- src app test` 仍为空；`git diff --cached --name-only` 仍为空；工作树新增只有本记录与其原始日志目录（均在测试角色 `角色卡/测试/docs/change/` 写区内）。`app/renderer/dist/` 是 `.gitignore:9` 忽略的构建产物（`git ls-files app/renderer/dist` = 0），不是产品候选。

---

## 三、H1 边界条目（治理文件，非产品候选）

| 文件 | 行数 | SHA-256 | B-1 条目位置 |
| --- | --- | --- | --- |
| `角色卡/桌面窗口/boundary.md` | 93 | `4756558e521fdd27fb82bc9a4064174bb41656724ba2604d5ef63e519b3f0e23` | 第 76 行：`test/桌面应用/acceptance-return-card.test.ts` 精确单文件条目 |
| `角色卡/桌面窗口/boundary.yaml` | 251 | `ea766230846d85d08a3a800e844e9aa94deeaca70abcaa77c5c6ebdc7bd74157` | 第 219 行：同路径条目（含 Delta-ARC-1 注释） |
| `角色卡/桌面窗口/changelog.md` | 199 | `6b6b9bc850ebe9ca224f0b8808ec18ea26456abf67f6f0594eef2aad15534626` | 第 3 行：B-1 记录 |

三文件均存在且 md/yaml 的逐文件授权条目在位；按团队计划 §4.5，B-1 是人事治理变更，不计入产品候选。B0 未修改这些文件。

---

## 四、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1` |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `/bin/bash.exe` |
| `node_modules` | 存在 |
| Electron 包 / 二进制 | `electron` **44.7.0**；`node_modules/electron/dist/electron.exe` 存在；`require('electron')` 解析到本 worktree 的 `node_modules/electron/dist/electron.exe` |
| Electron 内嵌版本 | `ELECTRON_RUN_AS_NODE=1` 实测 `electron 44.7.0 / chrome 152.0.7977.130 / node 24.21.0`，退出码 0（只验证二进制可执行，未启动应用窗口） |
| E2E harness | `test/桌面应用/e2e/main.mjs`（2859 行）、`test/桌面应用/e2e/uiux-v2.mjs`（1554 行）、`test/桌面UI/phase4b-electron-smoke.mjs`（967 行）均存在；三者 `node --check` 退出码 0 |
| 新增测试文件 | `test/桌面应用/acceptance-return-card.test.ts` **不存在**（基线预期；B-1 已授权该精确路径，B0 不创建） |
| 应用运行状态 | **本 worktree 无 Electron 进程**（应用未运行）。机器上另有 3 个 `electron.exe`，属于 `worktrees/network-monitor` 的 `phase5a-electron-smoke.mjs`（2026-10-30 启动，父 PID 34404），与本任务无关；B0 未触碰、未启动任何应用 |
| 启动方式（未执行） | 开发版 `npm run app`（`electron app/main.ts`）；渲染层开发 `npm run dev:renderer`；E2E 按 harness：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs` 等。**B0 不启动应用、不跑 E2E** |

---

## 五、门禁命令结果

命令均在 worktree 根目录执行，Node/npm 同 §四；每条日志含 command/cwd/start/end/exit_code 与原始输出。

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 15:34:23–15:34:26 | **0** | 0 类型错误，无输出 | `01-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 15:34:30–15:34:31 | **0** | 0 类型错误，无输出 | `02-npm-run-typecheck-renderer.log` |
| 3 | `npm run build:renderer`（`vite build --config vite.config.ts`） | 15:34:34–15:34:44 | **0** | vite 8.3.4，2793 modules transformed，5.11s 构建完成 | `03-npm-run-build-renderer.log` |

`build:renderer` 产物（写入被忽略的 `app/renderer/dist/`，非候选）：

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `app/renderer/dist/index.html` | 597 B | `b8a8de3b229ef0ea8215b74da458a8933363313d0906ef0fde1f7b98fd734c63` |
| `app/renderer/dist/assets/index-1P177gky.js` | 1,295,097 B | `2e0cec0655a9e13ac75d5126804978350b77a9aeeb393c386c7cdd64ef3c41ad` |
| `app/renderer/dist/assets/index-CWivz_4o.css` | 148,477 B | `2da0e4c5118e78b4183fbd338db965ec8374740dbe169eeb8c13c805627975a0` |
| `app/renderer/dist/assets/ans-studio-ans-icon-DOpmqMAU.png` | 55,057 B | `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c` |

构建仅出现两条非致命警告（记录为基线，不是失败）：chunk >500 kB 提示；`decision-center-store.ts` 同时被动态与静态导入导致 `INEFFECTIVE_DYNAMIC_IMPORT`。

---

## 六、受影响套件基线

全部使用 `node --test --test-concurrency=1`，文件清单与派发说明逐字一致，未增删用例文件。

| # | 套件（文件组） | 起止（+08:00） | 退出码 | tests | pass | fail | cancelled | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | `test/桌面UI/report-view.test.ts`、`role-view.test.ts`、`decision-dialog.test.ts`、`dialog-a11y.test.ts`、`source-guard.test.ts`、`theme-tokens.test.ts` | 15:34:50–15:34:51 | **0** | 36 | **36** | 0 | 0 | **0** | **0** | `04-suite-desktop-ui.log` |
| B | `test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts` | 15:34:55–15:34:56 | **0** | 13 | **13** | 0 | 0 | **0** | **0** | `05-suite-i18n.log` |
| C | `test/桌面应用/acceptance-evidence.test.ts`、`optional-acceptance.test.ts` | 15:35:00–15:35:03 | **0** | 9 | **9** | 0 | 0 | **0** | **0** | `06-suite-desktop-app.log` |
| D | `test/runtime-core/tool-display.test.ts`、`report-provenance.test.ts` | 15:35:07–15:35:10 | **0** | 36 | **36** | 0 | 0 | **0** | **0** | `07-suite-runtime-core.log` |
| **合计** | — | 15:34:50–15:35:10 | **0** | **94** | **94** | **0** | **0** | **0** | **0** | — |

关键基线观察（供 D1 对照，不判验收）：

- **i18n 计数**：`ui 907 / main 559 / shared 62 / preferences 3，总计 1531`，与团队计划 §1.4 和 V1 §1.4 的基线一致（新增 14 个 `ui.*` key 后预期 921/1545，以实施后实际测试为准）。
- **i18n 守卫**：`[i18n-guard] scanned=131 allowlisted=20 violations=0`。
- **现有验收证据套件**：`acceptance-evidence.test.ts` + `optional-acceptance.test.ts` 全过；`optional-acceptance.test.ts` 仍是 channel 级测试，按 V1 §2.2/§2.4 不能单独作为 AC-5–AC-7 证据——该映射属 D1/验收判断，B0 只记录基线通过。
- **投影/报告快照前提**：`tool-display`/`report-provenance` 全过（含 16 MiB 预算、净化/截断、UTF-8 字节预算、快照投影等既有用例）。
- **缺失文件基线**：`test/桌面应用/acceptance-return-card.test.ts` 不存在（符合「实施前」状态；A4 在 H1 后创建）。

---

## 七、失败清单与分类

- 本 B0 四组受影响套件：**失败 0、skip 0、todo 0**，无需失败分类。
- **未出现**既有 Windows symlink/EPERM 类基线失败（该类失败不在本四组套件中触发；B0 未运行其他套件，因此不对其他套件的既有红做分类）。
- **无未知失败**；无测试被跳过或标记 todo。
- B0 未修改任何产品/测试代码，未为保绿改动断言。

---

## 八、Electron / E2E 可运行性（B0 观察）

已确认：

1. Electron 二进制存在且可执行（44.7.0；`ELECTRON_RUN_AS_NODE=1` 退出码 0）。
2. 三个既有 E2E harness 文件存在并通过 `node --check`（main.mjs / uiux-v2.mjs / phase4b-electron-smoke.mjs）。
3. 本 worktree 应用当前未运行；启动方式见 §四。

未确认（B0 不做，按计划留 D1）：

- 未启动应用，未运行任何 Electron E2E，未产生 `E2E_PASS` 或截图；因此「真实窗口 E2E 可完整跑通」在 B0 尚未证实，D1 执行时需按实际 harness 重新确认并记录命令、环境、候选哈希与原始输出。
- 机器上既有的 `network-monitor` Electron 进程与本任务无关，B0 未使用其输出。

---

## 九、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-baseline.txt` | 134 | 7,972 | `823acffe47461917af4156836770d32b7acda300ce7468bb250add45ea322490` |
| `01-npm-run-typecheck.log` | 12 | 295 | `0135aad74ba0fc33ff67a04640eb9f2c6e1f6d98abde6de9886d9cd9415db2d2` |
| `02-npm-run-typecheck-renderer.log` | 12 | 334 | `25cd97fa821d9a1fed9b4cf54e82b0f66a4545b5297aab893a552a2f5825cb05` |
| `03-npm-run-build-renderer.log` | 30 | 1,643 | `a958db95adc36c97c92095263fd4f180a7d6e99196500958483184832ca3aac0` |
| `04-suite-desktop-ui.log` | 52 | 4,322 | `0363ca7d308c2dfb2c16916dfea25795940061f56d525c3481f66548ffccf078` |
| `05-suite-i18n.log` | 30 | 1,694 | `e595575cdc59a6f654590c26b21ab8668808fccb9b211d8199e8dcabafba0a19` |
| `06-suite-desktop-app.log` | 25 | 1,475 | `60bf674073128bd56f200953d6217864ea03471931b72edf619b870e0218a148` |
| `07-suite-runtime-core.log` | 52 | 4,690 | `99942be4876dce25727aaf49a528283af5aed5de0cc8b20d67e530fb6c4fe5ca` |
| `08-post-run-verification.log` | 47 | 3,235 | `8c630459ddc20b432173428230a2abbe898a8733ce314c02f3e30fa6f9f3ec7d` |

---

## 十、B0 出口核对（只报事实）

- 基线命令/环境/计数/失败分类可复算：**是**（命令、cwd、时间、Node/npm、OS、退出码、计数与原始日志均在 §四–§六、§九）。
- 确认无产品/测试改动：**是**（§二）。
- 记录 Electron/E2E 可运行性：**二进制与 harness 已确认；真实 E2E 未执行，留 D1**（§八）。
- 未 commit / 未 push / 未改产品代码 / 未改其他角色或治理文档 / 未接触客户。
- 本记录不是验收结论；AC-1–AC-14 的判定属独立验收（E2）。
