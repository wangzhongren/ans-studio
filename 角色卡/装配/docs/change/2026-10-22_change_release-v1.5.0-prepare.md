---
id: v1.5-release-prepare-20261022
type: change
title: v1.5.0 发布准备：冻结源 35cca0b、Windows/renderer/smoke overlay 与 CI run 39706385498
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: in-progress
related: []
events:
  - date: "2026-10-22"
    kind: implemented
    summary: package/lock 版本 1.4.0→1.5.0；README 当前版本/下载表/SHA 说明/要点 → v1.5.0；提交 35cca0b
  - date: "2026-10-22"
    kind: verified
    summary: 本地预检 typecheck 0、typecheck:renderer 0、全量 3315/3312/1/2（唯一红＝缺真实 rg 的环境红）、build:renderer 0（gzip 合计约 292.4KB）
  - date: "2026-10-22"
    kind: implemented
    summary: annotated tag v1.5.0 → 35cca0b（SOURCE_SHA）已推送；release-policy 指 v1.5.0 并重置基础白名单；release.yml 默认/并发/发布段/标题/notes → v1.5.0；提交 5513209；prepare 预演 exit 0（selected 2、actualTree 1ae3b77b…）
  - date: "2026-10-22"
    kind: triggered
    summary: 三平台 CI run 39701856151 已触发（headSha 5513209，publish=false/draft）；随后因测试夹具仍钉 v1.4.0 取消
  - date: "2026-10-22"
    kind: implemented
    summary: 测试夹具对齐 v1.5.0（release-packaging.test.ts + release-policy.d.mts）；装配 83/83、typecheck 0；prepare 预演 selected 4、actualTree 53441757…；提交 c166914
  - date: "2026-10-22"
    kind: triggered
    summary: 新三平台 CI run 39702128045 已触发（headSha c166914，publish=false/draft）
  - date: "2026-10-22"
    kind: implemented
    summary: 协调方四修复合入 main（8784b45/7884979/1b62023/0d7f5fb）；overlay 精确增列 7 文件；release.yml 增跨平台 ripgrep 安装；装配 84/84、typecheck 0；prepare selected 11、actualTree ca3e8ba…；提交 1685f19
  - date: "2026-10-22"
    kind: triggered
    summary: 重新触发三平台 CI run 39703920167（headSha 1685f19，publish=false/draft）
  - date: "2026-10-22"
    kind: implemented
    summary: run 39703920167 三平台 packaged smoke 因包内缺 app/renderer/dist/index.html 失败；release.yml 增 build:renderer（Regression tests 后、Package 前）；prepare selected 11、actualTree 1d1a1d7c…；提交 31e70c1
  - date: "2026-10-22"
    kind: triggered
    summary: 重新触发三平台 CI run 39705028954（headSha 31e70c1，publish=false/draft）
  - date: "2026-10-22"
    kind: implemented
    summary: run 39705028954 三平台 build 全 success、release job 因旧 settings 键在 release-assets 失败；release-assets.mjs 改为 14 键全要求（settingsEntryDisabled 取代 settings）、测试夹具同步；装配 84/84、typecheck 0；prepare selected 12、actualTree db9d82ee…；提交 e507b4a
  - date: "2026-10-22"
    kind: triggered
    summary: 重新触发三平台 CI run 39706385498（headSha e507b4a，publish=false/draft）
---

# v1.5.0 发布准备

客户决定发布 **1.5.0**、**未签名 ZIP**（同 v1.4.0 形态）：先创建 draft Release，三平台原生 CI 通过后由客户/协调方决定公开。发布范围＝当前 main（含 UI 平台化与并行工作流）。

## 版本与冻结源

- 版本 1.4.0 → **1.5.0**（minor）。`package.json`/`package-lock.json` 仅根两处版本字段，依赖零变动。
- 准备提交 **`35cca0b`**（`chore(release): prepare v1.5.0`）。
- annotated tag **`v1.5.0`**：tag 对象 `4b0b8db37fcfdad2bee081902158e66b15019b89` → commit **`35cca0bd2ed373c8ed5984dea45a76a608f4e502`**（= **SOURCE_SHA**）。tag 与 main 均已推送 origin。

## 本地预检（tag 前，如实记录命令/退出码/失败名）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.5.0`，`tsc --noEmit` 无输出 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无输出 |
| `node --test "test/**/*.test.ts"` | 1 | **3315 tests / 3312 pass / 1 fail / 2 skipped**；唯一失败见下 |
| `npm run build:renderer` | 0 | `dist/index.html` 0.58 kB、CSS 108.67 kB（gzip 19.60）、JS 826.93 kB（gzip 272.43）、图标 55.05 kB；gzip 合计约 **292.4 KB**（≤300 KB） |

**唯一失败（已知环境红，任务允许、未跳过）**：`test/测试/lightweight-permission-repairs.test.ts:164`「D3 AC4: ordinary cat/ls/rg/git reads remain fast; rg --pre forms need approval without pattern/filename false positives」——`AssertionError: real rg is required for this POSIX integration evidence`，`null !== 0`（spawnSync 找不到真实 `rg` 二进制）。本机 PATH 无真实 rg（仅有 Claude Code 的 shell 函数包装，子进程不可见）。**0 产品 red**。

## 发布配方（tag 后 overlay）

- **`src/common/装配/release-policy.mjs`**：`SOURCE_REF='v1.5.0'`、`SOURCE_SHA='35cca0bd2ed373c8ed5984dea45a76a608f4e502'`；白名单**重置为基础集**——files＝`package.json`、`package-lock.json`、`.github/workflows/release.yml`；dirs＝`src/common/装配/`、`test/装配/`。v1.4.0 overlay-2 的 5 条一次性精确条目（`src/common/编排/shell-command-guard.ts` ＋ 4 项测试/夹具）随冻结源吸收**整批移除**；注释写明 v1.5.0 冻结源已含全部产品代码（UI 平台化：React/shadcn Nova、单入口、图标、派发去重、移除 15 分钟自动中止、角色新称）。未列名 `app/`·`src/` 仍 fail-closed，未列名 `test/` 仍 excluded。
- **`.github/workflows/release.yml`**：workflow_dispatch `source_ref` 默认 → **v1.5.0**；concurrency → **release-v1.5.0**；release job 的 `gh release view/create/upload/edit` 全部 → **v1.5.0**；标题 **`ANS Studio 1.5.0`**；notes 改为本轮说明（UI 平台化、未签名/未公证、macOS 13+、Windows 10/11 x64、Windows 暂无内置来源文档阅读、包内不含密钥、先核对 SHA256；保留 provenance/overlay 说明）。`publish` 输入默认仍为 **false**（draft）；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`。
- 配方提交 **`5513209`**（`chore(release): point pipeline at v1.5.0`），已推送 main。
- **prepare 预演（本机，真实仓库未污染）**：`node src/common/装配/release-prepare.mjs` 退出 0；`sourceRef='v1.5.0'`、`sourceSha=35cca0b…`、`overlayPaths` 恰 **2**（`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`）、`actualTree='1ae3b77b22f55b630743eb5ecde98a7ad1889912'`、`overlayPatchSha256='5f8cfd2e411ff7c8c2590f44d211a8901e82886e654e11b443106d43879c8792'`、`excludedChanges=[]`；预演 worktree 已清理。

- **`src/common/装配/release-policy.d.mts`**：字面量同步 `SOURCE_REF: 'v1.5.0'`、`SOURCE_SHA: '35cca0bd…'`。

## 三平台 CI

- 首跑 run **`39701856151`**（headSha `5513209`，2026-10-22T00:47:59Z 触发，`publish=false`）：因测试夹具仍钉 v1.4.0/overlay-2（见下），按协调方指示 **`gh run cancel 39701856151` 取消**，未等待其自然失败。
- **测试夹具对齐（提交 `c166914`，`test(release): align packaging fixtures with v1.5.0`）**：
  - `test/装配/release-packaging.test.ts`：`SOURCE_REF='v1.5.0'`、`SOURCE_SHA='35cca0bd…'`；新增 v1.5.0 打包面选中项用例（release.yml、release-policy.mjs/.d.mts、test/装配/、package.json/package-lock.json 入选，README excluded）；v1.4.0 overlay-2 的 5 条精确条目改为「回到 fail-closed/excluded」用例（生产修复 `src/common/编排/shell-command-guard.ts` 抛 `Unreviewed production overlay`，4 个测试文件 excluded）；fail-closed 与既有排除面断言未放宽。
  - `src/common/装配/release-policy.d.mts`：字面量同步 v1.5.0（与 `.mjs` 一致）。
  - 验证：`node --test "test/装配/**/*.test.ts"` → **83/83 通过、0 失败、0 跳过**；`npm run typecheck` → **exit 0**。
- **对齐后 prepare 预演**（本机，真实仓库未污染）：exit 0；`overlayPaths` 恰 **4**（`.github/workflows/release.yml`、`src/common/装配/release-policy.d.mts`、`src/common/装配/release-policy.mjs`、`test/装配/release-packaging.test.ts`）；`actualTree='534417570e33b4fe612b1042cbafc60a4d26b3cf'`；`overlayPatchSha256='ebf25945e6f3b90a181efea8399013a26db670a9836d10c7d2105d0053ec50d8'`；`excludedChanges` 为 5 个角色卡文档。预演树内 `node --test test/装配/release-packaging.test.ts` **7/7 通过**；预演 worktree 已清理。
- 新跑 run **`39702128045`**：<https://github.com/wangzhongren/ans-studio/actions/runs/39702128045>，headSha `c1669143af61c0182781e11704590f1739b6fb40`，`publish=false`（draft 语义），触发时间 2026-10-22T00:50:41Z；单次快照为 pending。未反复轮询，run id 交协调方。

### 首跑红灯的处置记录（保留，不抹掉）

冻结 tag 内 `test/装配/release-packaging.test.ts` 仍断言 `SOURCE_REF='v1.4.0'`/`SOURCE_SHA='83eec7e…'`，并断言 v1.4.0 overlay-2 的 5 条精确条目入选；策略重置为基础白名单后，预演树实测 2 条失败（`'v1.5.0' !== 'v1.4.0'`、`Unreviewed production overlay: src/common/编排/shell-command-guard.ts`）。该文件与 `release-policy.d.mts` 均属装配边界，经协调方确认后已按上节对齐并提交 `c166914`，首跑取消、改由新跑验证。

## Windows 修复批次与跨平台 ripgrep（overlay 追加）

对齐后的 run `39702128045`（headSha `c166914`）最终**三平台 build 全部 failure、release skipped**。协调方随后把四处经评审修复推到 main：

- `8784b45` test(ui): normalize source-guard paths for windows（`test/桌面UI/source-guard.test.ts`）；
- `7884979` test(runtime-core): make ENOTDIR assertion windows-aware（`test/runtime-core/file-write-safety.test.ts`）；
- `1b62023` test: stabilize reasoning loopback fixtures on windows（`test/测试/g5-reasoning-verify/helpers.ts`、`compatibility-loopback.test.ts`）；
- `0d7f5fb` fix(codex): read CRLF embedded model catalogs on windows（产品修复 `src/common/codex-adapter/reasoning-catalog.ts` ＋ `test/codex-adapter/reasoning-catalog.test.ts`、`fixtures.ts`）。

### overlay 精确增列（提交 `1685f19`）

按协调方清单、单文件不开目录、断言不放宽，`release-policy.mjs` 的 files 精确增加 7 条：`src/common/codex-adapter/reasoning-catalog.ts`、`test/codex-adapter/reasoning-catalog.test.ts`、`test/codex-adapter/fixtures.ts`、`test/桌面UI/source-guard.test.ts`、`test/runtime-core/file-write-safety.test.ts`、`test/测试/g5-reasoning-verify/helpers.ts`、`test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`。`git diff v1.5.0..1685f19` 中的 `src/` 变更**仅** `reasoning-catalog.ts`、无 `app/` 变更、无其它未列出的测试改动（`reasoning.test.ts` 未变，未列入）。

### 跨平台 ripgrep

`.github/workflows/release.yml` 在 **Typecheck 之后、Regression tests 之前**新增一步：`Ensure cross-platform ripgrep for POSIX integration tests`（`shell: bash`）——先 `command -v rg`，已有则直接 `rg --version` 验证；macOS 用 `brew install ripgrep`；Windows 用 `choco install ripgrep -y --no-progress` 并把 `/c/ProgramData/chocolatey/bin` 加入 PATH；其他平台 apt 兜底；安装后统一 `rg --version` 验证。矩阵、超时与其他步骤未改；YAML 经 `yaml.parse` 校验通过。

### 夹具与预演

- `test/装配/release-packaging.test.ts` 新增「v1.5.0 修复批次按精确路径入选」用例：7 文件入选、同目录未列名测试（`judge-mode.test.ts`、`anchor-view.test.ts`、`abort-quarantine.test.ts`、`d-codex.test.ts`）excluded、未列名 `src/common/codex-adapter/config.ts` 仍 fail-closed。
- 验证：`node --test "test/装配/**/*.test.ts"` → **84/84 通过、0 失败、0 跳过**；`npm run typecheck` → **exit 0**。
- 预演（提交 `1685f19`，真实仓库未污染）：`overlayPaths` 恰 **11**——`.github/workflows/release.yml`、`src/common/codex-adapter/reasoning-catalog.ts`、`src/common/装配/release-policy.d.mts`、`src/common/装配/release-policy.mjs`、`test/codex-adapter/fixtures.ts`、`test/codex-adapter/reasoning-catalog.test.ts`、`test/runtime-core/file-write-safety.test.ts`、`test/桌面UI/source-guard.test.ts`、`test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`、`test/测试/g5-reasoning-verify/helpers.ts`、`test/装配/release-packaging.test.ts`；`actualTree='ca3e8ba27a9b08246a3f7c5fe4b873df6e02282b'`；`overlayPatchSha256='734e6feebe812841e9301387bbee0d8fa8a2a3d3758d594910e64f451a017684'`；`excludedChanges` 为 19 个角色卡文档；预演树内 `release-packaging.test.ts` **8/8 通过**；worktree 已清理。
- 新跑 run **`39703920167`**：<https://github.com/wangzhongren/ans-studio/actions/runs/39703920167>，headSha `1685f194c790a9cd48aa6194fb14ef88484a5787`，`publish=false`（draft），创建时间 2026-10-22T01:08:16Z；单次快照为 queued。未轮询，run id 交协调方。

### 第二轮 packaged smoke 失败与 renderer 构建步骤（提交 `31e70c1`）

run `39703920167`（headSha `1685f19`）三平台均进入 packaged smoke 后失败：解压包内缺 `app/renderer/dist/index.html`（`ERR_FILE_NOT_FOUND`）。根因：v1.5.0 的渲染层 `dist` 是 Vite 构建产物（v1.4.0 为静态文件），而 release workflow 在 Package 前没有运行 `npm run build:renderer`；本地 `package:local` 会先 build，故本机未暴露。

修复：`.github/workflows/release.yml` 在 **Regression tests 之后、Package native executable 之前**新增 `npm run build:renderer`（working-directory `.release/source`，非零即停）；矩阵、超时与其他步骤未改。YAML 经 `yaml.parse` 校验，build 步骤顺序为 … → Typecheck → ripgrep → Regression tests → **Build renderer bundle** → Package native executable → Verify → …

验证：`node --test "test/装配/**/*.test.ts"` **84/84**、`npm run typecheck` **0**（test/装配/ 无 workflow 步骤顺序断言，未新增测试）。预演（提交 `31e70c1`）：selected 仍恰 **11**；`actualTree='1d1a1d7cde910c552aa03c1e9f7627fd87afe025'`；`overlayPatchSha256='6ff11d4156152e04e331876475c41ad7e699f115642db7e69106f155aa1e5729'`。

新跑 run **`39705028954`**：<https://github.com/wangzhongren/ans-studio/actions/runs/39705028954>，headSha `31e70c1dfad64af02a33fa71449b1c27869a6fb4`，`publish=false`（draft），创建时间 2026-10-22T01:19:42Z；单次快照 `in_progress`。未轮询，run id 交协调方。

### 第三轮 release job 失败与 packaged smoke 校验键对齐（提交 `e507b4a`）

run `39705028954`（headSha `31e70c1`）**三平台 build 全部 success**；release job 在 `Verify full native artifact set and source bindings` 失败：`Error: Incomplete UI checks: darwin-arm64`。根因：`src/common/装配/release-assets.mjs` 仍要求旧渲染器的 `settings` 键；新 React 渲染器 packaged smoke 实际输出 14 键——`entry` / `rootMounted` / `driver` / `csp` / `cspViolations` / `dom` / `preload` / `ipc` / `importDisabled` / `missingConfiguration` / `settingsEntryDisabled` / `envPathMatches` / `console` / `load`，其中 `console`/`load` 由主进程在脚本结果上补齐（`app/main.ts`）。

修复：`release-assets.mjs` 的必需 UI checks 改为**全 14 键必须 true**（`settingsEntryDisabled` 取代 `settings`，并新增 entry/rootMounted/driver/csp/cspViolations/console/load）；与主进程 `ok = Object.values(checks).every(value === true)` 语义一致，fail-closed、校验强度只增不减。`test/装配/release-packaging.test.ts` 的 manifest 夹具同步 14 键；负例新增 `settingsEntryDisabled:false` 与 `console:false` 两种篡改，均必须被拒绝。

验证：装配 **84/84**、typecheck **0**；预演树内 packaging **8/8**。预演（提交 `e507b4a`）：`overlayPaths` 恰 **12**——上一轮 11 项之外新增 `src/common/装配/release-assets.mjs`（修复本体；该脚本在 release job 从 main 检出运行，进入 overlay 仅保持来源一致）；`actualTree='db9d82eea3128053c57559b03f3a1fdca33390d9'`；`overlayPatchSha256='114ec91c19040aafb7e4641c273ca26e39279dc95dd73b22f417e01047d0672b'`；`excludedChanges` 仍为 19 个角色卡文档。

新跑 run **`39706385498`**：<https://github.com/wangzhongren/ans-studio/actions/runs/39706385498>，headSha `e507b4ae4c285eff4c74eec57573a89fca1db57d`，`publish=false`（draft），创建时间 2026-10-22T01:33:36Z；单次快照 `in_progress`。未轮询，run id 交协调方。

## 未验证项 / 残余

- 三平台原生构建、解压启动与 smoke **未由本角色实测**（由 CI 原生 runner 执行；本机只做 typecheck、装配测试、全量测试、renderer build 与 prepare 预演，未打包、未下载或启动任何 ZIP）。
- README SHA256 表按指示暂写「发布后由 Release 的 SHA256SUMS 校验文件提供」并明确未签名；真实 SHA256 待 CI 产物。
- draft Release 尚未创建；公开发布仍待 CI 全绿后的独立验收与客户/协调方决定。
- 未做 `package:local`/`verify:local`（本轮派发未要求）。
- 首跑 run `39701856151` 已取消（未等其自然失败）；run `39702128045` 三平台 build 已 failure、release skipped，由四处修复与 overlay 追加取代；run `39703920167` 三平台 packaged smoke 因缺 renderer 构建产物 failure，由 `build:renderer` 步骤修复；run `39705028954` 三平台 build success、release job 因旧 smoke 键 failure，由 14 键对齐修复；最新 run `39706385498` 的最终结论待协调方观察。
