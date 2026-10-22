---
id: v1.5-release-prepare-20261022
type: change
title: v1.5.0 发布准备：冻结源 35cca0b、基础 overlay 与三平台 CI run 39701856151
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
    summary: 三平台 CI run 39701856151 已触发（headSha 5513209，publish=false/draft）
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

## 三平台 CI

- run **`39701856151`**：<https://github.com/wangzhongren/ans-studio/actions/runs/39701856151>，headSha `551320962a7d0a5959b01e8d914515f8bae70988`，`publish=false`（draft 语义），触发时间 2026-10-22T00:47:59Z。未反复轮询，run id 交协调方。

### 已知预期红（重要，待测试角色处置）

`test/装配/release-packaging.test.ts` 的**冻结 tag 版本**仍断言 `SOURCE_REF='v1.4.0'` / `SOURCE_SHA='83eec7e…'`，并断言 v1.4.0 overlay-2 的 5 条精确条目入选。策略重置为基础白名单后：

1. `release overlay preserves Chinese build paths and excludes private data and documentation` → `'v1.5.0' !== 'v1.4.0'`；
2. `release overlay includes exactly the reviewed overlay-2 fix batch by exact path` → `Unreviewed production overlay: src/common/编排/shell-command-guard.ts`。

已在预演构建树中**实测复现这 2 条失败**。该文件属**测试角色**，本角色边界禁止改 `test/`；因此预计三平台 build job 会在 **Regression tests** 阶段同红、release job 不会执行（不会创建 draft）。处置：由测试角色把断言同步到 v1.5.0（SOURCE_REF/SHA、白名单基础集语义）并提交 main；`test/装配/` 在 overlay 目录白名单内，其提交会自动随下一次运行纳入，无需改 policy。修复后重跑同一命令即可。

## 未验证项 / 残余

- 三平台原生构建、解压启动与 smoke **未由本角色实测**（由 CI 原生 runner 执行；本机只做 typecheck、全量测试与 renderer build，未打包、未下载或启动任何 ZIP）。
- README SHA256 表按指示暂写「发布后由 Release 的 SHA256SUMS 校验文件提供」并明确未签名；真实 SHA256 待 CI 产物。
- `src/common/装配/release-policy.d.mts` 仍声明旧字面量 `'v1.4.0'` 与旧 SHA（本角色边界仅列 `release-policy.mjs`，未改）；不影响 `tsc`（`.mjs` 不参与类型检查），但类型层面已过期，建议下一轮或属主同步。
- draft Release 尚未创建；公开发布仍待 CI 全绿后的独立验收与客户/协调方决定。
- 未做 `package:local`/`verify:local`（本轮派发未要求）。
