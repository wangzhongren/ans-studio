---
id: customer-authorization-plane-b0-baseline
type: change
title: customer authorization plane B0 基线记录
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 记录 rebase 后 HEAD 4c3a6e4 上的 B0 基线：环境、npm ci、双端 typecheck、build:renderer、五组受影响套件、T3 全量与 Electron 可运行性事实
  - date: "2026-11-03"
    kind: verified
    summary: 收尾核对 src/app/test 无改动、暂存区为空、lockfile 未变；证据文件逐一行数与 SHA-256 可复算
---

# B0 基线记录：客户授权平面（customer authorization plane）

- **任务 ID**：`2026-11-03-customer-authorization-plane`（flowId `customer-authorization-plane`，T3）
- **记录角色**：测试（worker，固定测试角色上下文）
- **日期 / 节点**：2026-11-03 / 团队计划 §5.1 **B0（基线）**
- **状态**：**B0 完成**。本记录只记录事实，**不实施、不验收、不判通过/返工**；不是独立验收结论。
- **入口**：闸门 2 与实施授权已由沟通记录 `docs/communication/2026-11-03_intent_customer-authorization-plane.md` 确认（观察值 120 行 / SHA-256 `e0b89c26…`）；基线 rebase 已完成，实测 HEAD 与派发说明一致。
- **一句话事实**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` / 分支 `feat/customer-authorization-plane`；`src app test` 采集前后均无改动、暂存空；`npm ci` exit 0（33 s wall，526 包，lockfile 未变）；`npm run typecheck`、`typecheck:renderer`、`build:renderer` 均 exit 0；五组受影响套件合计 **2006 tests / 1993 pass / 4 fail / 0 cancelled / 9 skipped / 0 todo**（4 项均为既有 Windows symlink EPERM）；T3 全量 **3479 tests / 3452 pass / 9 fail / 18 skipped / 0 todo，exit 1**（9 项失败与 18 项 skip 均为既有环境/平台项；新增确定性失败 0、新增 skip 0）；Electron 44.7.0 二进制存在，**未启动应用、未跑 E2E**；未 commit/push。

---

## 一、入口输入快照（只读核对）

| 项 | 实测值 | 与派发说明 |
| --- | --- | --- |
| 团队计划 | `docs/scheduling/2026-11-03_team-plan_customer-authorization-plane.md`，**653 行 / SHA-256 `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`** | 一致（`37e6bd0d…`） |
| 方案 P1.1 | `docs/planning/2026-11-03_design_customer-authorization-plane.md`，**1199 行 / `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`** | 一致（`7875ad6a…`） |
| 独立复核 | `docs/planning/2026-11-03_review_customer-authorization-plane.md`，**132 行 / `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`** | 观察值 |
| 沟通记录（观察值） | `docs/communication/2026-11-03_intent_customer-authorization-plane.md`，**120 行 / `e0b89c2645f7119241ca8d88b4c60f84ea782b6ba79b361a6e0b19d1ee85374f`** | 一致（`e0b89c26…`） |
| 实施前标准 V1（旁路观察，非 B0 输入） | B0 开始时 `docs/acceptance/customer-authorization-plane-criteria-v1.md` **不存在**；B0 运行期间由内置独立验收并行写盘，观察值 **1171 行 / 92,791 B / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`** | V1 属独立验收节点，本记录不使用其内容判定 B0 |

---

## 二、代码与工作树基线

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 分支 | `git branch --show-current` | `feat/customer-authorization-plane` |
| HEAD | `git rev-parse HEAD` | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` |
| 产品/测试改动（采集前） | `git status --porcelain -- src app test` | **空** |
| 产品/测试改动（采集后） | `git status --porcelain -- src app test` | **空** |
| 暂存区 | `git diff --cached --name-only` | **空** |
| 其它工作树改动（采集前） | `git status --short` | `M docs/scheduling/memo.md`；未跟踪：本任务沟通/方案/复核/团队计划——均为管理/治理文档，**非产品/测试候选** |
| 其它工作树改动（采集后） | `git status --short` | 新增 `M docs/acceptance/memo.md`、`?? docs/acceptance/customer-authorization-plane-criteria-v1.md`（V1 并行产出，非测试角色写集）；另加本 B0 证据目录 |
| 依赖锁文件 | `git status --porcelain -- package-lock.json package.json` | **空**（`npm ci` 未改 lockfile/manifest） |
| 计划新测试文件 | 本任务按计划由测试角色在 D1 新增 `test/测试/` 集成用例，B0 不新增 | 不适用 |

受影响测试目录文件数（顶层 `*.test.ts`，`find` 实测）：`test/runtime-core` 37、`test/编排` 55、`test/桌面应用` 53、`test/桌面UI` 51、`test/项目管理/shared` 10。全仓 `test/**/*.test.ts` 共 **394** 个；排除 `test/pi-adapter/write-sequencing.test.ts`（存在）后 **393** 个。

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1` |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64 2026-07-28 09:32 UTC x86_64 Msys`）；Git Bash `/bin/bash.exe` |
| 时区 | Asia/Shanghai（记录内时间均 +08:00） |
| worktree | `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane` |
| `node_modules`（B0 前） | **不存在** |
| `node_modules`（B0 后） | 由 `npm ci` 安装；忽略产物、未暂存 |
| Electron 包版本 | **44.7.0** |

---

## 四、依赖安装

| 项 | 实测值 |
| --- | --- |
| 命令 | `npm ci`（`package-lock.json` 存在，316,123 B） |
| 起止（+08:00） | 2026-11-03T13:33:23–13:33:56 |
| 实际耗时 | **33 s** wall clock（npm 摘要报告 28s） |
| 退出码 | **0** |
| Node / npm | v24.22.1 / 11.19.1 |
| 安装摘要 | `added 526 packages, and audited 527 packages in 28s`；`99 packages are looking for funding`；`21 vulnerabilities (18 moderate, 3 high)`（npm 报告，未执行 `npm audit fix`） |
| install scripts | npm 11.19.1 以 allowScripts 门控**未执行**包安装脚本（electron/esbuild 等 4 个包告警）；`node_modules/electron/dist` 在 `npm ci` 后**不存在** |
| Electron 二进制补取 | B0 的 `node -e "require('electron')"` 版本/路径检查触发 `electron/index.js` 的 `downloadElectron()`（`install.js`），于 13:34:04 下载成功；`dist/electron.exe` 现存在 246,302,208 B。属环境副作用，已披露 |
| lockfile 影响 | `git status --porcelain -- package-lock.json package.json` 为空；未改 lockfile/manifest，未改用 `npm install` |
| 原始日志 | `01-npm-ci.log` |

---

## 五、门禁命令结果

| # | 命令 | 起止（+08:00） | 耗时 | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 13:34:26–13:34:34 | 8 s | **0** | 0 类型错误，无诊断 | `02-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 13:34:37–13:34:42 | 5 s | **0** | 0 类型错误，无诊断 | `03-npm-run-typecheck-renderer.log` |
| 3 | `npm run build:renderer`（`vite build`） | 13:34:47–13:34:52 | 5 s（vite 自报 449 ms） | **0** | 2795 modules transformed；产物见 §八；仅有 chunk 体积/动态导入警告 | `04-npm-run-build-renderer.log` |

`app/renderer/dist/` 为忽略产物：`git check-ignore -v app/renderer/dist/index.html` → `.gitignore:9:app/renderer/dist/`；`git ls-files app/renderer/dist` **为空**，非候选。

---

## 六、受影响套件基线

全部 `node --test --test-concurrency=1`，按目录/顶层 `*.test.ts` 逐组执行；`test/桌面应用/e2e/main.mjs` **未运行**，`test/桌面UI` 的 `.mjs` 冒烟未运行，未启动 Electron。

| # | 层 | 命令（glob 逐字） | 文件数 | 起止（+08:00） | tests | pass | fail | cancelled | skipped | todo | 退出码 | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 运行时核心 | `node --test --test-concurrency=1 "test/runtime-core/*.test.ts"` | 37 | 13:35:10–13:35:46 | 282 | 275 | **3** | 0 | 4 | 0 | 1 | `05a-suite-runtime-core.log` |
| B | 编排 | `node --test --test-concurrency=1 "test/编排/*.test.ts"` | 55 | 13:36:07–13:36:25 | 694 | 693 | **1** | 0 | 0 | 0 | 1 | `05b-suite-orchestration.log` |
| C | 桌面应用 | `node --test --test-concurrency=1 "test/桌面应用/*.test.ts"` | 53 | 13:36:36–13:37:50 | 498 | **498** | 0 | 0 | 0 | 0 | 0 | `05c-suite-desktop-app.log` |
| D | 桌面UI | `node --test --test-concurrency=1 "test/桌面UI/*.test.ts"` | 51 | 13:37:57–13:38:06 | 374 | **374** | 0 | 0 | 0 | 0 | 0 | `05d-suite-desktop-ui.log` |
| E | 项目管理 shared | `node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"` | 10 | 13:38:13–13:38:26 | 158 | 153 | 0 | 0 | 5 | 0 | 0 | `05e-suite-project-shared.log` |
| **合计** | — | — | **206** | 13:35:10–13:38:26 | **2006** | **1993** | **4** | **0** | **9** | **0** | — | — |

失败分类（逐条见 `07-failure-classification.txt` 与各组日志）：

- A 组 3 项：`file-write-safety.test.ts:97`、`session-store.test.ts:46`、`session-store.test.ts:58`，均为 Windows `EPERM`（errno -4048，`symlink`）。
- B 组 1 项：`shell-authorized-routine.test.ts:184`，Windows `EPERM`（`symlinkSync`）。
- 合计 4 项**全部为既有 Windows symlink 环境失败**；新增确定性失败 **0**。C/D/E 组 0 失败。
- skip 9 项：A 组 4（`file-write-safety` 的 D3 模式用例）、E 组 5（`atomic-write` 的 D3 finalMode 用例），均为既有平台 skip；新增 skip **0**。

---

## 七、T3 全量基线

团队计划 §6.3/§7.2 要求 T3 全量。实际执行命令（`06-run-t3.sh` 内逐字）：

```
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)
```

说明：本 worktree 的命令守卫拒绝命令替换/xargs 形式，因此用证据目录内脚本 `06-run-t3.sh` 原样执行该命令；脚本首行输出 `command:` 即上式，日志头尾含 `cwd/start/end/exit_code`，可复算。

| 项 | 实测值 |
| --- | --- |
| 文件数 | **393**（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`；文件清单见 `06-full-t3-file-list.txt`，393 行 / SHA-256 `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce`，与既有 B0 的 393 文件清单哈希**逐字节相同**） |
| 起止（+08:00） | 2026-11-03T13:39:01–13:43:28 |
| 耗时 | **267,120.7702 ms ≈ 4 分 27 秒** |
| 退出码 | **1**（因 9 项既有环境失败，非运行错误） |
| 计数 | **tests 3479 / pass 3452 / fail 9 / cancelled 0 / skipped 18 / todo 0** |
| 失败分类 | 9 项全部既有 Windows symlink `EPERM`；新增确定性失败 **0** |
| skip | 18 项既有平台 skip；新增 **0** |
| 原始日志 | `06-full-t3.log`（4,580 行 / 513,043 B） |

与既有 `contract-schema-query` B0（HEAD `243d8f6`，3462 tests / 3435 pass / 9 fail / 18 skip）对比：tests、pass 各 **+17**，fail 与 skip 数量、条目逐条相同；差异与 rebase 后已合入的 `contract-schema-query` 新增用例一致（观察值，不作验收判定）。

排除项（不得当作通过）：

- `test/pi-adapter/write-sequencing.test.ts` —— 仓库既有已知挂起（历史记录：39+ 分钟无进展、CPU 约 2339s）；排除依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 与团队计划 §6.3；本轮**未运行、行为未验证**。排除参数 `! -name 'write-sequencing.test.ts'`。

18 项 skip（逐条见 `07-failure-classification.txt`）：codex-adapter/session 1；pi-adapter/session-persistence 1；门禁引擎/pin-evidence 1；runtime-core/file-write-safety 4；测试/lightweight-permission-repairs 6；项目管理/shared/atomic-write 5。

---

## 八、Electron / E2E 可运行性（仅事实，不启动）

| 项 | 实测值 |
| --- | --- |
| Electron 包版本 | **44.7.0** |
| Electron 二进制 | `node_modules/electron/dist/electron.exe` **存在**（246,302,208 B）；`node_modules/.bin/electron` 存在；`path.txt` 内容 `electron.exe` |
| 渲染入口（忽略产物） | `app/renderer/dist/index.html` **存在**（597 B，SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f`）；`assets/index-HVZOxqQQ.js` 1,325,286 B、`assets/index-haa4j9RY.css` 152,847 B、图标 PNG 55,057 B（哈希见 `08-electron-facts.txt`） |
| e2e 入口 | `test/桌面应用/e2e/main.mjs` **存在**（2859 行） |
| 本 worktree Electron 进程 | **0** |
| 机器其它 Electron 进程 | 3 个（PID 11492/34404/41000），可执行路径均指向 `…\.claude\worktrees\network-monitor\node_modules\electron\dist\electron.exe`，与本 worktree 无关 |
| 已执行 | `node -e` 版本/路径检查、`stat`、`tasklist`/`Get-Process electron` 只读检查；**未启动应用、未运行 E2E、未截图、未录屏** |

---

## 九、失败清单与分类

T3 全量 **9 项失败，全部为既有 Windows symlink `EPERM`（errno -4048）环境失败**；与既有 B0 记录（`角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` §八）按「测试文件:行 + 测试名」逐条一致。

| # | 文件:行 | 测试名 | 错误要点 | 分类 |
| --- | --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | `EPERM` -4048，`symlink`（异步 `fs/promises`） | **既有** |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | `EPERM` -4048，`symlink`（异步） | **既有** |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | `EPERM` -4048，`symlink`（异步） | **既有** |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | `EPERM` -4048，`symlink`（异步） | **既有** |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | `EPERM` -4048，`symlink`（异步） | **既有** |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | `EPERM` -4048，`symlink`（异步） | **既有** |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | `EPERM` -4048，`symlink`（异步） | **既有** |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | `EPERM` -4048，`symlinkSync`（同步 `node:fs:1937`） | **既有** |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 | `EPERM` -4048，`symlinkSync`（同步 `node:fs:1937`） | **既有** |

- **新增确定性失败：0**；**新增 skip：0**。本基线只含既有环境红；D1 以本记录为对照判定「新增确定性失败 0、新增 skip 0」。这些失败**不算通过，也不计入新失败**；未删除/放宽任何测试或断言。
- 原始失败堆栈与 skip 清单见 `07-failure-classification.txt`（含 `06-full-t3.log` 的 failing-tests 原文）。

---

## 十、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-B0-baseline-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-baseline.txt` | 74 | 3,306 | `81ab7230ebd385d0ca886b82473c68605b1b802e3a21009777cf092f150f4da9` |
| `01-npm-ci.log` | 36 | 2,294 | `3b03ed10e6b7402657412ca58375e3e02bd626a68d66134167e6833996786264` |
| `02-npm-run-typecheck.log` | 11 | 320 | `7fb1837862bd687a7375bd68d70a40bf10508fc6c62dbb758f87ea6f1cc22d5f` |
| `03-npm-run-typecheck-renderer.log` | 11 | 359 | `f63d7b29c93fbdc5ec007f88ad16d39b250d2ae97dc8366f3a8c1e9d822aee7c` |
| `04-npm-run-build-renderer.log` | 29 | 1,705 | `764c4b8d19d59e0b16d97defbe67dd878ea0357370fb4a84133b098529682e13` |
| `05a-suite-runtime-core.log` | 350 | 36,753 | `22b33c2a502475dae509a5446f4008016439f17e5aa06eb1cda0cc38e212bf90` |
| `05b-suite-orchestration.log` | 1,277 | 151,295 | `a26efced3b2adfc13d4968fbb0ab21381fd3748cbf51f2b2dc7cfd645bcd65a0` |
| `05c-suite-desktop-app.log` | 529 | 62,473 | `e8c34357eb40b287eaef9ade1d888022555a03926ababd8848fa5f191793d744` |
| `05d-suite-desktop-ui.log` | 392 | 35,984 | `5c5d2031319b8ef30e9e4a34c358d0ab840500827af2ad24ea757be55684e0b6` |
| `05e-suite-project-shared.log` | 178 | 15,727 | `5a1faf64e1a120ba83b5755bfb659ebaf0acfeb852b3fd840f334f4f99440464` |
| `06-full-t3-file-list.txt` | 393 | 16,684 | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `06-full-t3.log` | 4,580 | 513,043 | `3da3fab7a4685e6b27133620092d3f2bdd6f9d95ea63ea83e83984e5965747a1` |
| `06-run-t3.sh` | 15 | 787 | `b8a6aa533ad0c67bf50c5eb6764d7d77ab6d921e58098afb8efdac3a74d60f5f` |
| `07-failure-classification.txt` | 191 | 15,445 | `97b05ed006c1eca0280154a2b38d5b475774d0fe5f2ed34e9fe747029b06ed37` |
| `08-electron-facts.txt` | 38 | 2,123 | `f83cf221e20697e685e28378e2d4751b4ba87c5bca68ac13f474b2d6df0de7c2` |
| `09-post-run-verification.txt` | 34 | 2,102 | `bf3b9482de89265dcfa41ca7c0ae7c236e985ac5f680bd1ef282e87b9cba5ef0` |

目录共 16 个文件（含本记录引用的脚本与后置核对）。日志文件首尾包装行（`cwd` / `command` / `start` / `end` / `exit_code` 或等价的元数据追加行）可按 §四–§七 命令复算。

---

## 十一、异常与限制

1. **npm install-scripts 门控**：npm 11.19.1 未自动执行包安装脚本，`npm ci` 后 `node_modules/electron/dist` 缺失；B0 的可运行性检查 `node -e "require('electron')"` 触发 Electron 自动下载并成功。此为环境行为，非产品代码改动；已写入 `01-npm-ci.log` 与 `08-electron-facts.txt`。
2. **命令守卫**：worktree 命令守卫拒绝 `$(find …)`/`xargs` 形式，T3 用证据目录内 `06-run-t3.sh` 原样执行并在日志头部打印实际命令；脚本内容可审计。
3. **并行写盘**：B0 期间 `docs/acceptance/memo.md` 被修改、`docs/acceptance/customer-authorization-plane-criteria-v1.md` 由内置独立验收并行写盘；均在测试角色写集之外，非本角色写入。产品/测试树采集前后均为空。
4. **单次 T3 运行**：本 B0 只做一次全量采集（未做第二次独立重跑）；命令、文件清单与日志可复算，D1 应在同一候选上重跑并与本基线分类对照。
5. **既有失败与排除项**：9 项 EPERM 与 18 项 skip 均按既有环境/平台项分类，不当作通过；`write-sequencing.test.ts` 未运行、行为未验证。
6. **Electron/E2E**：仅记录可运行性事实，未启动应用、未运行 E2E、未截图；D2 的真实运行证据不在 B0 范围内。

---

## 十二、B0 出口核对（只报事实）

- 基线命令、环境、计数、失败清单与分类可复算：**是**（§三–§七、§九、§十）。
- 确认产品/测试无本任务改动：**是**（§二；采集前后 `git status --porcelain -- src app test` 均空；暂存空）。
- 记录 Node/npm、OS/Shell、HEAD/worktree、依赖安装状态：**是**（§二–§四）。
- Electron 可运行性：**已记录事实（包 44.7.0、二进制存在、本 worktree 无进程），未启动**（§八）。
- T3 全量基线：**3479 tests / 3452 pass / 9 fail / 18 skipped / 0 todo，exit 1**；9 项失败与 18 项 skip 均为既有项，新增确定性失败 0、新增 skip 0（§七/§九）。
- 未 commit / 未 push / 未改产品代码或测试代码 / 未改其他角色或治理文档 / 未接触客户。
- 本记录不是验收结论；AC 判定属独立验收 E2。
- **记录版本**：本记录最终 **239 行**（`wc -l`，含本行）；SHA-256（不含本行，可复算：`head -n -1 <本文件> | sha256sum`）：`c4e3ee37430626191c462ea6663cc1ff2bc63a2e4a6cac91f5bf28d6ac137e23`。
