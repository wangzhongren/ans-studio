# 基线记录：验收判断的提案物证路径修复（acceptance-evidence-path）B0 实施前基线

- **任务 ID**：`2026-11-01-acceptance-evidence-path`（T2）
- **记录角色**：测试（Testing）
- **日期**：2026-11-01
- **阶段**：B0 实施前基线（团队计划 §5.1/§5.3；§六 T2 证据口径）
- **风险档位**：**T2**（客户闸门 1 确认；跨 `app/desktop` 与 `src/common/编排`，不改判断规则/权限/契约形状）
- **状态**：**baseline-recorded（基线已记录）**；本记录只陈述实施前实测，不构成任何验收结论，也不是候选
- **授权依据**：
  - 沟通/闸门 0/1/2、实施授权与 V1/B-1 核验：`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（B0 实测 **83 行** / SHA-256 `f7967434106014eb7346b1731b74a1127155ae070c7d7ff1c6812613eaa6a37c`；该文件是管理记录、会继续追加：V1 写盘时 76 行 / `a95baf85…`，团队计划写盘时 61 行 / `47b9b707…`，均为历史快照，不混用）
  - 客户确认方案 P1.2：`docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）
  - 团队计划：`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）
  - 实施前验收标准 V1：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行** / `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`）
  - 独立复核：`docs/planning/2026-11-01_review_acceptance-evidence-path.md`（**124 行** / `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6`）
- **基线身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `eb77fadafc4df40594938798645da111665027c3`（tree `4e4d6dd137698c4b07be9d1611bd82a315e15123`）
- **工作树前提**：B0 全程未改产品源码、测试、配置、角色卡或边界；`git status --short -- src app test` 为空；`git diff --cached --name-only` 为空。既有变更仅为两份 memo、桌面窗口 B-1 边界三文件（人事按闸门 2 执行）与 5 份未跟踪管理文档（§三.1）。

---

## 一、环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-11-01T09:52:49+08:00 起；最后一条基线日志 09:56:38+08:00 | `00-environment.txt`、`21-platform-extra.log`、`22-trial-git-state.log` |
| OS / Shell | Windows 11 Pro 10.0.26300；MINGW64 / Git Bash 3.6.10-710e5275.x86_64；`SHELL=/bin/bash.exe`、`MSYSTEM=MINGW64`、`BASH_VERSION=5.3.15(2)-release` | `00-environment.txt`、`21-platform-extra.log` |
| Node / npm | **v24.22.1 / 11.19.1** | `03-node-npm-electron.log` |
| Git | 2.55.0.windows.5 | `21-platform-extra.log` |
| 平台 | win32 x64；`os.release()` = 10.0.26300 | `21-platform-extra.log` |
| 仓库 | 本 worktree；分支 `feat/flow-improvements-wave1`；HEAD `eb77fad…`；tree `4e4d6dd1…` | `01-git-baseline.log`、`21-platform-extra.log` |
| node_modules | 存在，377 个顶层条目 | `03-node-npm-electron.log` |
| Electron | 包 `electron@44.7.0` 存在；`node_modules/electron/dist/electron.exe` 存在（246,302,208 字节）；`node_modules/electron/path.txt` = `electron.exe` | `03-node-npm-electron.log` |
| task_ops | **未启用**：`.ans/project.json` 不存在（`.ans/` 仅含 `sessions/`）；本记录不伪造任何任务令牌/锁/审批/机器状态 | `20-scope-check.log` |
| 应用状态 | **正在运行**（非 B0 启动，详见 §四）；与团队计划 §1.4「应用当前关闭」不一致，如实记录 | `14-app-process-check.log`、`15-app-identity-cdp.log` |
| 写入范围 | 仅本文件（`角色卡/测试/docs/change/`）；原始日志写入仓库外临时目录 | 本记录 §八 |

---

## 二、输入文档核验（B0 冻结）

| 文档 | 行数 | 字节 | SHA-256（B0 实测） | 与任务卡/沟通记录对照 |
| --- | --- | --- | --- | --- |
| `docs/planning/2026-11-01_design_acceptance-evidence-path.md`（P1.2） | 396 | 39,584 | `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9` | 与任务卡、沟通记录闸门 1 一致 |
| `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md` | 431 | 48,088 | `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3` | 与任务卡、沟通记录闸门 2 一致 |
| `docs/acceptance/acceptance-evidence-path-criteria-v1.md`（V1） | 580 | 62,475 | `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179` | 与任务卡、沟通记录 V1 核验一致 |
| `docs/communication/2026-11-01_intent_acceptance-evidence-path.md` | 83 | 8,678 | `f7967434106014eb7346b1731b74a1127155ae070c7d7ff1c6812613eaa6a37c` | 含闸门 0/1/2、实施授权、V1/B-1 核验；较 V1 引用的 76 行快照追加了 V1/B-1 核验小节 |
| `docs/planning/2026-11-01_review_acceptance-evidence-path.md` | 124 | 28,706 | `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6` | 与团队计划引用一致 |

原始命令与输出：`19-input-binding.log`（39 行）。

---

## 三、命令与结果

### 3.1 仓库状态

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `git rev-parse HEAD` | 0 | `eb77fadafc4df40594938798645da111665027c3` |
| `git branch --show-current` | 0 | `feat/flow-improvements-wave1` |
| `git status --short` | 0 | 5 个已修改 + 5 个未跟踪管理文档（B0 开始时快照；本记录写盘后新增本文件，见 §七）；**无 `src/`、`app/`、`test/` 改动** |
| `git diff --cached --name-only` | 0 | 空（未暂存） |
| `git diff --name-only` | 0 | 仅 memo/治理文档：`docs/acceptance/memo.md`、`docs/scheduling/memo.md`、`角色卡/桌面窗口/boundary.md`、`boundary.yaml`、`changelog.md` |
| `git status --short -- src app test` | 0 | **空**（产品代码/测试零改动） |
| `git diff --stat` | 0 | 5 files changed, 23 insertions(+)，全部为 memo 与 B-1 治理文件 |
| `git check-ignore -v app/renderer/dist/index.html` | 0 | `.gitignore:9:app/renderer/dist/`（构建产物为忽略项，非候选） |

- 已修改：`docs/acceptance/memo.md`、`docs/scheduling/memo.md`、`角色卡/桌面窗口/boundary.md`、`角色卡/桌面窗口/boundary.yaml`、`角色卡/桌面窗口/changelog.md`。其中桌面窗口三文件为闸门 2 确认的 **B-1** 边界条目（md 1 行 + yaml 4 行 + changelog 2 行 = 7 行新增），与沟通记录「3 个治理文件、7 行新增」一致；B0 只读记录、不修改。
- 未跟踪管理文档（非产品代码）：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`、`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`、`docs/planning/2026-11-01_design_acceptance-evidence-path.md`、`docs/planning/2026-11-01_review_acceptance-evidence-path.md`、`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`。

原始输出：`01-git-baseline.log`（31 行）、`20-scope-check.log`（30 行）。

### 3.2 目标文件身份与存在性（写前基线）

| 文件 | 存在 | 字节 | 行数 | `git hash-object` | SHA-256 | 与 HEAD blob |
| --- | --- | --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | 是 | 488,981 | 7,785 | `b3bfdee7019ce9bf64ab148905f417d8f7d7a233` | `9dace0fb3c494ca9168113dd788bc5874a93918880e5cc01294f8467bd2bb2a0` | 相同 |
| `src/common/编排/governance-judge-facts.ts` | 是 | 17,023 | 328 | `6d5d368c5f7dd3e00c5fe9840bcab3503d7e0f12` | `72fd06f52c262d7338f851438fc76f68722099ae25dd68c4b57fc669edb9e5d1` | 相同 |
| `test/编排/acceptance-judge-minimal.test.ts` | 是 | 4,913 | 140 | `8bdc4db76ddcd4390922a49bc380c930be61d427` | `dc3c33bb73e788b89ea8b6db1a5370654c550fd611e8f0b3dd968cb54e8fc772` | 相同 |
| `test/桌面应用/acceptance-proposal-path.test.ts`（拟新增） | **absent** | — | — | — | — | — |
| `test/编排/governance-judge-facts.test.ts`（拟新增） | **absent** | — | — | — | — | — |

只读参考文件哈希（用于 D1 对照与零改动核对）：

| 文件 | `git hash-object` | SHA-256 |
| --- | --- | --- |
| `src/common/shared/intent-entry-contract.ts` | `40bf6b47e4ad413a0c7319d134ea352359080502` | `73478f2ec47cacace72f7a48127fea577ebfa8ceef924d3860da6fd97beb20e8` |
| `src/common/编排/governance-judge-evidence.ts` | `cf1e9f8822b5db28420a414d2fd7b3d00b2cd24d` | `c9062a3743eeec07117ac2b3f248f31255e1b5722135205fb5da4b12faa87d0a` |
| `src/common/编排/governance-judge.ts` | `20bbfdfc247cff3d81d1fb571f3cdad184accb4e` | `053c8fa8e49dc55b883519a4818bc9e46de342245c566bf584579a5099d18a76` |
| `test/桌面应用/acceptance-evidence.test.ts` | `27abc2b8753c16bca5213f667b683b726b207daa` | `c6009dcb49c4f76fdfe2d2e8cef424832be27a00004c52f1b1495324dc07f1f1` |
| `test/桌面应用/run-pin.test.ts` | `7e4ddabbccfa9194d6a292ef7a3646283279d802` | `bdf1fb6ef035594835a7e2af0c59a09e99815ff46417d114f1f3dba213c006bc` |
| `test/编排/decision-evidence-packet.test.ts` | `7864a80297c17558374e14d4128d1a4b00e4a8ee` | `86d79cfd20bfeddf41624d7f01691a420c94154114ff88dc5ff9a71a1360353f` |
| `test/编排/workflow-preconditions.test.ts` | `cfde02b76781066e4b24a78f2184ecc7b1ebd268` | `74a1e3d977bb7ecff0bbc0f8c017fabddb9db7d43741f23022e25aea1fcd7594` |

配置/构建基线（零改动对照）：

| 文件 | SHA-256 |
| --- | --- |
| `package.json` | `8b8bde31fa71472539d1d06b28e1ce3552a97042d18748b6c17b61838b079c22` |
| `package-lock.json` | `cf00899dbad4216e384078ed6e00fb3ea40af1d503b63d530fa3d1544828d29b` |
| `vite.config.ts` | `88ebbd11220e2a20e89db0d81cca6b9693e1fd14ac370860979df295982209cb` |
| `tsconfig.json` | `3a8cb263de30f1a4b712ffd809aa8948c479da5ed318c5922024de90e56d30f0` |
| `electron-builder.yml` | `3546ce53121235836044630cab7b46a702a0302d25d352d5fa6f0a1a3f958237` |

原始输出：`02-target-file-hashes.log`（59 行）、`20-scope-check.log`。

### 3.3 根因锚点只读核对（基线仍为旧错误路径）

| 文件:行 | 内容 | 说明 |
| --- | --- | --- |
| `app/desktop/session.ts:3733` | `private async enrichAcceptanceJudgeContext(` | 根因函数入口（V1 §1.4 引用一致） |
| `app/desktop/session.ts:3883` | `proposalPath: \`docs/proposals/${flowId}-v1.md\`,` | **旧错误路径**（漏 `-proposal`，V1 引用一致） |
| `app/desktop/session.ts:7157` | `...(run?.documents.proposal?.path !== undefined ? { proposalPath: run.documents.proposal.path } : {})` | 另一处（contract_check 链路），非本次写集 |
| `src/common/编排/governance-judge-facts.ts:181` | `const expectedProposal = flowId !== undefined ? \`docs/proposals/${flowId}-v1.md\` : "提案";` | **旧错误约定文案**（V1 引用一致） |
| `src/common/编排/governance-judge-facts.ts:182` | `expectedQualityReport = docs/quality/${flowId}-report-v1.md` | 本修复不变 |
| `src/common/shared/intent-entry-contract.ts:183/212/225` | `latestVersioned` / `readIntentEntryFacts` / `proposalPath` 解析 | 共享层既有实现（只读；默认不修改） |

观察（非阻断、只读）：`app/desktop/session.ts` 含 1 个 NUL 字节（`tr -cd '\000' | wc -c` = 1），GNU grep 默认将其判为二进制（需 `grep -a`）；该文件为既有状态、与工作树 HEAD blob 逐字节相同，B0 未改。

原始输出：`16-anchors-and-dist-hashes.log`（41 行）、`17-session-anchors.log`（17 行）。

### 3.4 类型检查与渲染构建

| # | 命令 | 退出码 | 结果 | 日志（行数 / SHA-256） |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | **0** | 无输出、0 错误；09:53:09 → 09:53:12 | `04-typecheck.log`（9 / `b02493d0ad06cb286829ea8d4f4e038a06558a7a403b77dbf48ddf991b16a20c`） |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | **0** | 无输出、0 错误 | `05-typecheck-renderer.log`（9 / `50dafa02edecab143cc8be6cb35be7e45ace03340c558dc2a33d96fd7ad8cc6a`） |
| 3 | `npm run build:renderer`（`vite build`） | **0** | vite v8.3.4；2793 modules transformed；built in 5.07s；输出 4 个文件到 `app/renderer/dist/`（git 忽略） | `06-build-renderer.log`（56 / `fab49e358d1365384218dc53c999c181077f0e2f2980f82dec8bf44dc7e80157`） |

- 构建产物（构建前后文件名/字节数一致，文件名含内容哈希；B0 未改源码）：`index.html` 597 B / `index-1P177gky.js` 1,295,097 B / `index-CWivz_4o.css` 148,477 B / `ans-studio-ans-icon-DOpmqMAU.png` 55,057 B；构建后 SHA-256 见 `16-anchors-and-dist-hashes.log`。
- 构建告警（非失败）：chunk > 500 kB；`decision-center-store.ts` 被动态导入同时被静态导入，动态导入无法单独分块；`@tailwindcss/vite` 插件耗时提示。
- 首次 `tasklist /FI ...` 因 Git Bash 将 `/FI` 路径转换而失败（exit 1），属 Shell 参数转换现象；改用 PowerShell `Win32_Process` 取得进程事实（§四）。

### 3.5 受影响层基线（逐条）

| # | 命令 | 退出码 | tests | pass | fail | skip | todo | duration_ms | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | `node --test test/桌面应用/acceptance-evidence.test.ts test/桌面应用/run-pin.test.ts` | **0** | 15 | 15 | 0 | 0 | 0 | 2954.7542 | 无 |
| B | `node --test test/编排/acceptance-judge-minimal.test.ts test/编排/decision-evidence-packet.test.ts test/编排/workflow-preconditions.test.ts` | **0** | 33 | 33 | 0 | 0 | 0 | 218.9756 | 无 |
| C（补充，对应 D1 命令的既有子集） | `node --test --test-concurrency=1`（A+B 五个文件） | **0** | 48 | 48 | 0 | 0 | 0 | 3798.9474 | 无 |

A+B = C（15 + 33 = 48），计数自洽。日志：

- `07-suite-desktop-affected.log`：28 行 / `d83cb9858a21955cb7ef9fb1701e765bf9f145dcc2d7d164717894378f87a59f`
- `08-suite-orchestration-affected.log`：46 行 / `79ea392899467fd9770df36da04a458026bde464059f50038add34d787f005b2`
- `18-suite-affected-concurrency1.log`：61 行 / `35cebf55fc3725464b8bd88b9558ecd72089ae33a6738aac92e1efe44fbbb904`

### 3.6 补充全目录基线

| 目录 | 命令 | 文件数 | 退出码 | tests | pass | fail | skip | todo | duration_ms | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 桌面应用 | `node --test "test/桌面应用/*.test.ts"` | 49 | **0** | 444 | 444 | 0 | 0 | 0 | 7605.1365 | 无 |
| 编排 | `node --test "test/编排/**/*.test.ts"` | 51 | **1** | 639 | 638 | **1** | 0 | 0 | 1602.4992 | `test/编排/shell-authorized-routine.test.ts:184` EPERM symlink |

- 桌面应用：49 个测试文件全部通过，0 skip / 0 todo。
- 编排：唯一失败为 **Windows symlink EPERM**，详见 §五。
- 日志：`10-suite-desktop-dir.log`（470 行 / `10f64c3f0e24360fe985665bcee4aec37f1786fb2e27a70c486af434cd61c553`）、`11-suite-orchestration-dir.log`（1218 行 / `791172c1d7d82e964e43b84583ec201c9447e27c57b567572c68403c25492a77`）、文件清点 `09-suite-inventory.log`（105 行 / `50883320cf9d406d2b024191d9c07cbeafb88f0630774306052e8a6b770af849`）。

备注：本任务为 T2，团队计划 §1.2/§6.3 与 V1 §2.3/§6.2 **不默认要求全量回归**；上述两个目录仅为 D1 补充证据的基线，**不虚报为全量回归**。全仓库其它目录（适配器、运行时核心、门禁引擎等）未在 B0 执行，属非必要范围。

---

## 四、试跑现场只读核对（D2 前置，未修改/未移动）

试跑项目：`C:\Users\51054\Desktop\work\trial-shell-escalation`（存在；为 Git 仓库但**尚无提交**——`git status -sb` 显示 `## No commits yet on main`，`git rev-parse HEAD` exit 128，全部文件未跟踪；只读记录，不影响本任务）。

| 项 | 实测 | 对照 |
| --- | --- | --- |
| `docs/proposals/textkit-cli-v1.md`（别名） | **存在**；7,035 字节；SHA-256 `d6cad5f2f03981e4ad25109933cb9170f74726d5d30d2375741e6029b325cbef`；mtime 2026-11-01 09:17:38.479838900 +0800 | 复核历史快照引用前缀 `d6cad5f2…`，一致 |
| `docs/proposals/textkit-cli-proposal-v1.md`（真实提案） | **存在**；15,952 字节；SHA-256 `a2bdbee2882d788947808743d7d2a6d1e053ed97035df907012b34d60d4ce185`；mtime 2026-11-01 08:57:22.426351600 +0800 | 与方案/复核快照 `a2bdbee2…` 一致 |
| `docs/proposals/` 内容 | `textkit-cli-modules-v1.md`、`textkit-cli-proposal-v1.md`、`textkit-cli-roster-v1..v7.md`、`textkit-cli-v1.md`；**无 `-proposal-v2+`** | 别名与真实提案并存，能区分旧/新约定 |
| `.ans/runs/run-20261101-textkit-cli-87325f96/manifest.json` | **存在**；2,100 字节；SHA-256 `c7fcfbf2a057115bd75370f5aa82e7dcd7ac36cf77e8c1d89f9d51c4f5a97b36`；`schema: ans-run/v1`；`state: **pinned**`；`runId: run-20261101-textkit-cli-87325f96`；`documents.proposal.path: docs/proposals/textkit-cli-proposal-v1.md`；`documents.proposal.sha256: a2bdbee2…` | 与 V1 §4.5 预期一致（pinned 真提案） |

结论：试跑现场**具备 D2 方法 A 的基线条件**（pinned run + 真实提案 + 可区分的别名），但实际执行仍需 D1 通过后的修复候选构建与试跑项目所有者/客户现场确认（团队计划 §九.8）；B0 未移动别名、未重发验收卡、未启动/重启应用。

原始输出：`13-trial-site-readonly.log`（63 行 / `c7516a8585bdad1c71005bfbd13e8ab7939ec5712246ea0a9c73c795c6c9de1a`）、`22-trial-git-state.log`（29 行 / `a762b5bcfdc05d00569cdcd6431ebc558ad7731624c0026dfb6eddd374e831c7`）。

### 4.1 应用进程状态（供 D2 前置判断）

| 项 | 实测 | 判定 |
| --- | --- | --- |
| `tasklist | grep -i electron` | 7 个 `electron.exe` 进程（PID 34404/11492/41000/21192/33092/77896/4612） | 有 Electron 进程 |
| 主实例（ANS 应用） | PID 21192（父 node 72092），`electron.exe app/main.ts --remote-debugging-port=9235`；可执行路径 `…\worktrees\flow-improvements-wave1\node_modules\electron\dist\electron.exe`；启动时间 **2026-11-01 08:53:09** | **可识别为 ANS 应用**，且来自**本 worktree** |
| CDP 只读核对 | `http://127.0.0.1:9235/json/version`：Electron/44.7.0、Chrome/152.0.7977.130；`/json/list` 唯一 page：title **「ANS 治理会话工作台」**，URL `file:///…/flow-improvements-wave1/app/renderer/dist/index.html` | 确认为 ANS 渲染器页面 |
| 另一实例 | PID 34404（父 28936）来自 `…\worktrees\network-monitor\`，运行 `test/桌面UI/phase5a-electron-smoke.mjs`；PID 11492/41000 为其子进程 | **非本任务应用**，属另一 worktree 的冒烟脚本 |
| B0 是否启动/停止应用 | **否**（只读 `tasklist`/PowerShell/CDP GET） | B0 无副作用 |

**与计划基线的差异（如实记录）**：团队计划 §1.4 写「应用当前关闭」，B0 实测 ANS 应用**正在运行**（启动于 08:53:09，早于 B0 09:52 开始，非本角色启动）。该实例运行的是修复前代码（本 worktree HEAD `eb77fad` 的 `app/main.ts`）；D2 必须以修复候选**重新构建/启动**才能建立候选身份（V1 AC-8 第 5 项），现有实例不能作为候选运行证据。**B0 未停止该实例**（停止/重启属 D2 或属主现场安排，非本基线授权）。

原始输出：`14-app-process-check.log`（123 行 / `fea830fba2d820d91cf0eb566e146b32fe4ec55cb7039d936678c01a4d35e2a6`）、`15-app-identity-cdp.log`（41 行 / `bcefa1a87f863225d483cc75ace16030c5ffeb7ff418cd313840ced0eccded37`）。

---

## 五、失败分类

| 分类 | 数量 | 明细 |
| --- | --- | --- |
| 既有环境失败（Windows symlink EPERM） | **1** | `test/编排/shell-authorized-routine.test.ts:184`「node test外指符号链接路径不获委托；项目内测试路径获委托」：`Error: EPERM: operation not permitted, symlink '…\Temp\ans-routine-outside-iKZ50s\outside.test.ts' -> '…\Temp\ans-routine-paths-7MhStG\test\external.test.ts'`（`errno: -4048`、`code: 'EPERM'`、`syscall: 'symlink'`） |
| 其它确定性失败 | **0** | — |
| 无法分类 | **0** | — |
| 新增失败（相对既有环境基线） | **0** | 本机无法创建符号链接（独立探针在临时目录 `fs.symlinkSync` 同样 `EPERM`），属账户/进程权限限制，非本任务代码问题；该测试属编排角色测试文件，B0 只读复跑不修改 |
| 新增 skip/todo | **0** | 所有套件 skip = 0、todo = 0 |

- 隔离复跑证据：`node --test test/编排/shell-authorized-routine.test.ts` → **tests 26 / pass 25 / fail 1 / skip 0 / todo 0 / exit 1**，失败与全目录同因（`12-suite-orchestration-isolated-symlink.log`，63 行 / `ae7942cb8a376bd289171ef2fa7594cd6511bdb9d71e5eb60e739ea22765fd2e`）。
- 既有性对照：同一测试的同类 EPERM 已记录于本角色上一任务基线 `角色卡/测试/docs/change/2026-10-31_change_shell-escalation-B0.md` §3.4.1 第 9 项（当时行号 `:103`，本基线 `:184`，为文件演进）；本机当前账户不具备符号链接创建权限，故判**既有环境失败**，非本任务引入。
- 环境探针：`fs.symlinkSync` 在 `%TEMP%` 新目录中直接 `EPERM`（`12-…log` 末段），证明与测试夹具无关。
- 其它受影响套件（桌面应用 444/444、桌面应用受影响 15/15、编排受影响 33/33、串行 48/48）**零失败**。

---

## 六、基线结论

1. **基线可用**：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 全部 exit 0；受影响的桌面应用（15/15）与编排（33/33）套件零失败；补充目录基线为桌面应用 444/444、编排 638/639（唯一失败为既有 Windows symlink EPERM）。
2. **失败分类明确**：唯一失败是 Windows 账户无创建符号链接权限（EPERM，errno -4048），已用独立探针复现；无其它确定性失败、无无法分类项、无新增失败、无新增 skip/todo。
3. **无产品代码/测试改动**：`git status --short -- src app test` 为空、`git diff --cached --name-only` 为空；目标三文件与 HEAD blob 逐字节一致；两个拟新增测试文件确认为 absent。`build:renderer` 仅重写被 `.gitignore` 忽略的 `app/renderer/dist/`（文件名/字节数与构建前一致），未进入 `git status`。
4. **试跑现场就绪（只读事实）**：别名 `textkit-cli-v1.md` 存在（`d6cad5f2…`）、真实提案 `textkit-cli-proposal-v1.md` 存在（`a2bdbee2…`）、run manifest `state: pinned` 且 `documents.proposal.path` 指向真实提案；D2 方法 A 的现场条件在本时点成立。
5. **应用状态与计划基线不一致（D2 注意）**：ANS 应用正在运行（本 worktree、PID 21192、启动于 08:53:09、Electron 44.7.0、页面标题「ANS 治理会话工作台」），运行的是修复前代码；D2 须以修复候选重新构建/启动并建立候选身份，当前实例不能作为候选证据。B0 未启动/停止应用。
6. **范围声明**：B0 未运行真实 Electron E2E、未执行方法 A、未移动/还原别名、未重发验收卡、未修改任何产品/测试/配置/角色卡/边界、未 commit/push/merge/release；未伪造 task_ops/机器状态。本记录不是候选、不是验收报告，不宣布任何变更通过。
7. **限制**：未执行全量仓库回归（T2 不默认要求；仅在 A1/A2 后按 D1 补充）；未验证 A1/A2 候选（B0 时两处源码仍为旧实现）；未确认试跑项目生命周期允许再次发起验收卡（D2 现场确认）；本记录绑定的输入/环境哈希若在 D1/D2 前变化，相关基线失效并需重记。

---

## 七、证据文件清单（仓库外临时目录）

目录：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\B0\`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment.txt` | 5 | `677691c0cbe7136e8b5190477cf5d47a49366b6502b2eca708cdaa40e0eeab7f` |
| `01-git-baseline.log` | 31 | `2ee9c5e8e0b6fbb984fb1505e166e62cd89f899663cc8014d0214318b87aebc2` |
| `02-target-file-hashes.log` | 59 | `ace95054bda50f1466f7c38e556c92afaf91dcba20766843c666f050ea499f0b` |
| `03-node-npm-electron.log` | 43 | `6befdd28051f8fb179ca9ae89a92ca98a75dd5b4ab7c43f8caafff5db5af2b9a` |
| `04-typecheck.log` | 9 | `b02493d0ad06cb286829ea8d4f4e038a06558a7a403b77dbf48ddf991b16a20c` |
| `05-typecheck-renderer.log` | 9 | `50dafa02edecab143cc8be6cb35be7e45ace03340c558dc2a33d96fd7ad8cc6a` |
| `06-build-renderer.log` | 56 | `fab49e358d1365384218dc53c999c181077f0e2f2980f82dec8bf44dc7e80157` |
| `07-suite-desktop-affected.log` | 28 | `d83cb9858a21955cb7ef9fb1701e765bf9f145dcc2d7d164717894378f87a59f` |
| `08-suite-orchestration-affected.log` | 46 | `79ea392899467fd9770df36da04a458026bde464059f50038add34d787f005b2` |
| `09-suite-inventory.log` | 105 | `50883320cf9d406d2b024191d9c07cbeafb88f0630774306052e8a6b770af849` |
| `10-suite-desktop-dir.log` | 470 | `10f64c3f0e24360fe985665bcee4aec37f1786fb2e27a70c486af434cd61c553` |
| `11-suite-orchestration-dir.log` | 1218 | `791172c1d7d82e964e43b84583ec201c9447e27c57b567572c68403c25492a77` |
| `12-suite-orchestration-isolated-symlink.log` | 63 | `ae7942cb8a376bd289171ef2fa7594cd6511bdb9d71e5eb60e739ea22765fd2e` |
| `13-trial-site-readonly.log` | 63 | `c7516a8585bdad1c71005bfbd13e8ab7939ec5712246ea0a9c73c795c6c9de1a` |
| `14-app-process-check.log` | 123 | `fea830fba2d820d91cf0eb566e146b32fe4ec55cb7039d936678c01a4d35e2a6` |
| `15-app-identity-cdp.log` | 41 | `bcefa1a87f863225d483cc75ace16030c5ffeb7ff418cd313840ced0eccded37` |
| `16-anchors-and-dist-hashes.log` | 41 | `5ea44793f0ba3ca000f6fbb44d64b3c665d7d96229fc412005e9f1bb9558056d` |
| `17-session-anchors.log` | 17 | `dfe25b2cef6b18c7e816ae599ee26749ffb37736c82c1f86231f6f12ab983fb6` |
| `18-suite-affected-concurrency1.log` | 61 | `35cebf55fc3725464b8bd88b9558ecd72089ae33a6738aac92e1efe44fbbb904` |
| `19-input-binding.log` | 39 | `099371ec1390ce0ef400dfcc9c4ca8298a2f77f84bd63a24a33ef2d06bb8231d` |
| `20-scope-check.log` | 30 | `7017be390b7cab85777e8b6852d5fa47c672afbf1c5875bd290b554af6d713ee` |
| `21-platform-extra.log` | 14 | `9125636fc99931ccdbcddad7adcc9895bc15085970e588a5d2cafe29ffa835d7` |
| `22-trial-git-state.log` | 29 | `a762b5bcfdc05d00569cdcd6431ebc558ad7731624c0026dfb6eddd374e831c7` |

清单文件：`evidence-manifest.txt`（26 行；SHA-256 `664cd3d4e997d232c1c5924f8577e0bcbf8324d684534b5aec39efb5aaab0542`；生成于 2026-11-01T09:55:21+08:00 后按追加日志重生成）。

---

## 八、写入边界与限制

- **写入边界**：仅本文件（`角色卡/测试/docs/change/` 下新增证据记录）；原始日志位于仓库外临时目录。未修改产品源码、测试、配置、角色卡、边界或他人测试；未写 `docs/scheduling|acceptance|communication`；未 commit/push；未启动/停止应用；未移动/还原试跑别名。
- **未运行的检查**：真实 Electron E2E、D2 方法 A（别名移出/还原与验收卡重发）、A1/A2 候选测试（B0 时未实施）、全仓库全量回归（T2 不默认要求）。
- **证据绑定方式**：路径 + 行数 + SHA-256；若 HEAD、Node/npm、依赖、输入文档或夹具变化，本基线相关部分失效，需重新记录。
- 本记录不构成验收结论；实施与验收由具有相应授权的角色按团队计划与 V1 执行。
