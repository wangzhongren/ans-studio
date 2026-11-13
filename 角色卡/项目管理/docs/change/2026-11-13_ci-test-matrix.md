---
id: ci-test-matrix-20261113
type: change
title: 测试专用 CI（test-ci.yml）：开发期三平台测试反馈通道
created: "2026-11-13"
updated: "2026-11-13"
timezone: Asia/Shanghai
status: implemented-unverified
related: [session-ts-refactor]
events:
  - date: "2026-11-13"
    kind: created
    summary: 新增 .github/workflows/test-ci.yml（仅 workflow_dispatch；macOS arm64/x64 + Windows x64；typecheck + 有界全量测试 + 日志工件）；不改 release.yml、不放宽发布门禁、不发布
  - date: "2026-11-13"
    kind: verified
    summary: YAML 语法与结构校验通过（yaml@2.9.0 主解析 + js-yaml 交叉解析；矩阵与 release.yml 程序化 deep-equal）；git 状态仅新增 2 文件
---

# 测试专用 CI：开发期三平台测试反馈通道（R1）

## 背景（死结）：冻结 tag + overlay 使发布 workflow 暂时无法充当测试通道

发布 workflow（`.github/workflows/release.yml`）以「冻结 tag + 显式 overlay」为唯一源：`src/common/装配/release-prepare.mjs` 以冻结 tag 为源树，再按 `src/common/装配/release-policy.mjs` 的 `selectOverlay()` 追加**评审过的** overlay 文件。

`selectOverlay()` 的放行规则（`release-policy.mjs` 193–235 行）：

- 精确文件白名单（`files` 集合）＋目录白名单 `src/common/装配/`、`test/装配/`；
- 任何以 `app/` 或 `src/` 开头但未列名的路径 → 直接 `throw new Error("Unreviewed production overlay: …")`（**fail-closed**）；`test/` 下未列名文件静默落 excluded、不随构建树。

`session.ts` 重构（`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md`）引入 `app/desktop/session/**` 下的**新生产文件**。它们不在 v2.0.0 冻结 overlay 白名单中，且以 `app/` 开头 → `release-prepare.mjs` 按设计 fail-closed。这是发布策略的**正确行为**（未评审生产代码不得进入发布源），不是缺陷；但后果是：**在新 tag 之前，release workflow 无法为重构分支提供三平台测试反馈**，而计划 §5 B7 的验证门槛（含「三平台 release 冒烟」）恰需此反馈。

替代方案（本记录）：新增一条**只增不减**的测试专用 CI——独立 workflow、只读权限、直接测任意 ref、不触碰发布链路。发布门禁与发布流程保持原样，新 tag 之后的发布验证仍由 `release.yml` 唯一承担。

## 用途

- 开发期三平台（macOS arm64 / macOS x64 / Windows x64）测试反馈通道：手动指定任意 ref，运行 `npm run typecheck` 与有界全量测试（`test/**/*.test.ts`），采集三平台基线；
- 为重构波次边界（如 B4/B6/B7）提供「三平台冒烟」的替代反馈来源，直到新 tag 后发布 workflow 恢复可用；
- 测试输出落盘为工件，便于逐名比对失败（known-red 差分）。

## 非目标

- **不改** `.github/workflows/release.yml`、`release-prepare.mjs`、`release-policy.mjs` 或任何源码/测试/配置/角色卡/边界；
- **不放宽发布门禁**：不替代、不参与发布验证；发布权威测试命令保持原样；
- **不发布**：无 tag、无打包、无 release-prepare/overlay、无 Release 资产、无写权限；
- 不新增 push/pull_request 触发（仅手动，保守）。

## Workflow 要点（`.github/workflows/test-ci.yml`）

- **name**：`Test matrix (development feedback)`。
- **触发**：仅 `workflow_dispatch`；输入 `ref`（可选，默认 `main`，用于 checkout 指定分支/tag/commit）。
- **权限**：`permissions: contents: read`（无任何写权限）。
- **并发**：`concurrency.group: test-ci-${{ inputs.ref }}`，`cancel-in-progress: false`（同一 ref 串行，不同 ref 互不取消）。
- **矩阵**（与 release.yml 逐项相同）：`macos-15`（mac / arm64）、`macos-15-intel`（mac / x64）、`windows-2025`（win / x64）；`fail-fast: false`。
- **job 超时**：120 分钟。依据：本通道只跑全量测试（627 个测试文件、`--test-concurrency=1` 串行）；`--test-timeout=300000` 使挂起变成可命名的失败后，开发 ref 仍可能在数个 5 分钟挂起后继续跑完剩余文件；release 的 45 分钟是「回归测试 + 打包 + 产物验证」整体构建预算，本通道需要独立余量。job 级超时仍保证 runner 不被无限占用；且本通道不参与发布判定，加长不影响发布门禁。
- **步骤**（顺序固定）：
  1. git config（`core.autocrlf false` / `core.eol lf` / `core.longpaths true`，与 release 同）；
  2. `actions/checkout@v4`（`ref: ${{ inputs.ref }}`，`fetch-depth: 0`）；
  3. `actions/setup-node@v4`（`node-version: 24.14.0`，`registry-url: https://registry.npmjs.org`）；
  4. `npm ci`；
  5. `npm run typecheck`；
  6. ripgrep 保障（bash：macOS brew / Windows choco / 其它 apt，`rg --version` 验证；部分 POSIX 集成测试依赖 rg）；
  7. 有界全量测试（bash + `set -o pipefail`，stdout/stderr 同时 `tee` 到 `test-ci-output.log`，保留退出码；Windows runner 同样走 bash）：`node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"`；
  8. `actions/upload-artifact@v4`（`if: always()`；name `test-logs-${{ matrix.platform }}-${{ matrix.arch }}`；path `test-ci-output.log`；`if-no-files-found: warn`）。
- **不含**：release-prepare/overlay、`build:renderer`、打包、发布、tag、Release 资产上传、任何写权限。

## 与 release.yml 逐项对齐表

| 项 | release.yml（发布门禁） | test-ci.yml（本通道） | 对齐/差异 |
| --- | --- | --- | --- |
| 触发 | `workflow_dispatch`（`source_ref` 必填、默认 `v2.0.0`；`publish` 布尔） | `workflow_dispatch`（`ref` 可选、默认 `main`） | 差异：本通道显式选择被测 ref；均为手动 |
| 权限 | build job 继承 `contents: read`；release job `contents: write` | 全局 `contents: read` | 对齐且更窄：零写权限、无 release job |
| concurrency | `group: release-v2.0.0`，`cancel-in-progress: false` | `group: test-ci-${{ inputs.ref }}`，`cancel-in-progress: false` | 仅组名不同（按 ref 隔离） |
| runner 矩阵 | `macos-15`(mac/arm64)、`macos-15-intel`(mac/x64)、`windows-2025`(win/x64)；`fail-fast: false` | 逐项相同 | **完全对齐**（程序化 deep-equal） |
| Node | `actions/setup-node@v4`，`24.14.0`，`registry.npmjs.org` | 逐字相同 | **完全对齐**（程序化 deep-equal） |
| git config | `core.autocrlf false` / `core.eol lf` / `core.longpaths true` | 逐字相同 | **完全对齐**（run 文本相等） |
| checkout | `actions/checkout@v4`，`fetch-depth: 0` | `actions/checkout@v4`，`ref: ${{ inputs.ref }}`，`fetch-depth: 0` | 差异：本通道显式 ref（用途所需） |
| 源 | `release-prepare.mjs` 组装冻结 tag + 显式 overlay（`.release/source`） | 直接以被测 ref 为源（仓库根） | **关键差异**：本通道绕过 overlay（死结所在），不触碰发布源 |
| 依赖安装 | `npm ci`（working-directory `.release/source`） | `npm ci`（仓库根） | 同一锁文件语义；目录不同仅因发布源位于 `.release/source` |
| typecheck | `npm run typecheck`（`.release/source`） | `npm run typecheck`（仓库根） | 对齐 |
| ripgrep 保障 | bash；macOS brew / Windows choco / 其它 apt；`rg --version` | 逐字相同 | **完全对齐**（run 文本相等） |
| 测试命令 | `node --test --test-concurrency=1 "test/**/*.test.ts"` | `node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"`（外加 `set -o pipefail`、`2>&1 \| tee test-ci-output.log`） | 差异仅 `--test-timeout` 与日志 tee；**发布权威命令保持原样** |
| 日志/工件 | 发布资产与 provenance | `test-ci-output.log` → artifact `test-logs-<platform>-<arch>`（`if: always()`） | 差异：开发反馈需要日志 |
| 打包/发布 | `build:renderer`、`package`、`release-verify`、release job `gh release` | 无 | 差异：非目标（本通道不发布） |
| job 超时 | 45 分钟（含打包与验证） | 120 分钟（仅测试） | 差异：见「Workflow 要点」中的依据 |

## 为什么它不构成对发布门禁的放松

1. **独立 workflow**：`.github/workflows/test-ci.yml` 是新增文件，`release.yml` 零改动（`git diff` 为空）；发布仍只能由 `release.yml` dispatch。
2. **无写权限、无发布动作**：全程 `contents: read`；没有 tag、打包、overlay、Release 资产或 `gh release` 步骤。
3. **`--test-timeout` 只命名失败、不跳过**：超时的测试仍计为失败（失败可命名、可统计），不重试、不跳过、不放宽任何断言；该参数只存在于测试通道。
4. **发布权威命令保持原样**：`release.yml` 的 `node --test --test-concurrency=1 "test/**/*.test.ts"` 未改；发布门禁仍以三平台构建 + 产物验证 + 冻结源绑定为准。
5. **结论去向不同**：本通道通过/失败只表示该 ref 的开发期测试状态，不产生任何发布放行结论。

## 触发方式与使用说明

- 仅手动：GitHub → Actions → `Test matrix (development feedback)` → Run workflow；`ref` 留空即 `main`，也可填分支/tag/commit。
- 合并后由**协调者手动触发**采集三平台基线；同一 ref 串行执行（`cancel-in-progress: false`），不同 ref 互不取消。
- 结果读取：三平台各自一个 job；日志工件 `test-logs-mac-arm64` / `test-logs-mac-x64` / `test-logs-win-x64`（`if: always()`，失败也有日志）。

## 验证（本地，未触发任何 workflow）

- **YAML 语法解析**：`node`（v24.22.1）+ 仓库依赖 `yaml@2.9.0`（与 `package.json` 同版本，经主检出 `node_modules` 加载）`YAML.parse` 通过；另以 `js-yaml@4` 交叉解析通过（`on` 键解析为字符串 `"on"`）。
- **结构断言（程序化，全部通过）**：`name`；触发仅 `workflow_dispatch`；`inputs.ref` 可选且默认 `main`；`permissions` 仅 `contents: read`；`concurrency` 组 `test-ci-${{ inputs.ref }}` 且 `cancel-in-progress: false`；矩阵与 `release.yml` 逐项 deep-equal；`fail-fast: false`；job 超时 120；8 个步骤逐项（git config / checkout / setup-node / `npm ci` / typecheck / ripgrep / 有界测试 / upload-artifact 参数）；测试命令逐字匹配协调者口径。
- **非目标检查（程序化，全部通过）**：解析后的 workflow 不含 `gh release`、`release-prepare`、`release-verify`、`electron-builder`、`--publish`、`upload-pages-artifact`；无 `"write"` 权限；无 push/pull_request 触发。
- **对齐检查（程序化，全部通过）**：git config run、ripgrep run 与 `release.yml` 文本相等；setup-node `with` 与 release deep-equal；`release.yml` 的测试命令未变（`node --test --test-concurrency=1 "test/**/*.test.ts"`）。
- **文件形态**：当前工作树文件为 LF、无 BOM。本地检出为 `core.autocrlf=true`（既有工作树文件为 CRLF、HEAD blob 为 LF）；提交时 Git 按索引归一化，入库/远端内容为 LF，与现有 workflow 文件的 blob 形态一致。
- **git 状态**：仅新增 2 个文件（`git status --short` 两条 `??`）；`git diff --stat`（经 intent-to-add 取数后已还原索引，未留暂存）：`2 files changed, 213 insertions(+)`。`release.yml` 与仓库其它文件零改动；未 commit、未 push。
- **未执行**：未触发任何 workflow、未运行 `npm ci`/测试（本通道本身由协调者在合并后手动触发验证）。

## 证据边界

- 本轮只新增 `.github/workflows/test-ci.yml` 与本记录；不改 `release.yml`、源码、测试、配置、角色卡、边界。
- 未打 tag、未 push main、未触发任何 workflow、未占用 9222/9223/9224；本地只读校验。
