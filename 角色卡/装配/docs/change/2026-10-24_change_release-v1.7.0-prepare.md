---
id: v1.7-release-prepare-20261024
type: change
title: v1.7.0 发布准备：发布源 tag v1.7.0（358cde9）、版本与发布说明切换
created: "2026-10-24"
updated: "2026-10-24"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-10-24"
    kind: created
    summary: 客户决定发布 1.7.0（未签名 ZIP，同 v1.6.0 形态）；版本 1.6.0→1.7.0；README 当前版本/下载表/要点 → v1.7.0；发布准备提交 3a7f74f
  - date: "2026-10-24"
    kind: verified
    summary: 发布准备轮本地预检 typecheck 0、typecheck:renderer 0、装配测试 84/84 通过
  - date: "2026-10-24"
    kind: implemented
    summary: tag v1.7.0 → 358cde9 已推送；release-policy/.d.mts、release.yml、发布打包测试夹具全部切到 v1.7.0/358cde9
  - date: "2026-10-24"
    kind: verified
    summary: 流水线切换轮 typecheck 0、装配测试 84/84；release.yml YAML 解析与 selectOverlay 预判通过
---

# v1.7.0 发布准备

客户决定发布 **1.7.0**、**未签名 ZIP**（同 v1.6.0 形态）。版本标识与发布说明已切换，发布流水线（`release-policy`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`）已在 tag 确定后切到 v1.7.0。本记录随发布进展更新；最终 CI/资产/SHA 在完成后填入。

## 版本与冻结源

- 版本 1.6.0 → **1.7.0**（minor）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：annotated tag **`v1.7.0`** → commit **`358cde9152584be29eff3a7564c99d9dd53463d8`**（PR #15 合并提交；tag 对象 `9e7008ac815cfb9c65e3d29c15134729f3d3a6c0`，已推送）。
- 发布准备提交：**`3a7f74f`**（`chore(release): prepare v1.7.0`），随 PR #15 合入 `358cde9`。
- 首轮记录曾以 `e4968d6`（PR #14 合并提交）为发布源；tag 确定后以 `358cde9` 为准。`358cde9` 已包含 `3a7f74f`，即冻结源已含本轮版本与 README 发布准备改动。

## 本轮变化

- 独立验收范围恢复为**所有变更**（含非发布变更），`release` 仅作为可选的发布元数据；验收标准门覆盖所有声明验收标准的新契约流程（旧流程与 accept-quick 例外保留）。
- 任命（appointment）客户决定自动收口；写卡校验反馈去重，并加忙时门控与系统前缀。
- 中文界面使用中文内置角色名；角色详情面板展示角色根文档。
- 目录级授权 v3 与团队计划目录一致性。
- i18n：zh-CN / en-US 文案目录、偏好 IPC 与 locale store。
- 流程步骤完成后自动推进（唤醒 Steward 处理就绪步骤）；`flow_step_update` 遇版本冲突重试一次。
- 验收返工路由：结构化返工报告、回到 Lead 的返工路由与 rejected 重开。
- Lead 治理协调与上报。
- 旧 v1/v2/v3 计划、流程与角色卡保持兼容。

## 本轮改动文件

### 发布准备轮

- `package.json`、`package-lock.json`：仅版本字段 1.6.0 → 1.7.0。
- `README.md` 发布区：当前版本改为 v1.7.0（2026-10-24 发布）；下载表与校验链接全部指向 v1.7.0 资产；删除 v1.6.0 SHA256 明细，改为“v1.7.0 发布后由 Release 的 SHA256SUMS 回填/核对”；v1.6.0 要点替换为 v1.7.0 要点；发布记录链接指向本文件。
- 本文件。该轮提交 `3a7f74f`，经 PR #15 合入 `358cde9` 并成为 tag v1.7.0 的内容。

### 流水线切换轮（tag 确定后）

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.7.0'`、`SOURCE_SHA='358cde9152584be29eff3a7564c99d9dd53463d8'`；注释更新为 v1.7.0 冻结源；白名单保持基础集与历史精确条目，未列名 `app/`/`src/` 仍 fail-closed。
- `src/common/装配/release-policy.d.mts`：字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言与打包面用例标题切到 v1.7.0/上述 SHA；断言不放宽、未删测试。
- `.github/workflows/release.yml`：`source_ref` 默认、并发组、`gh release view/create/upload/edit`、标题（`ANS Studio 1.7.0`）与 notes 全部 → v1.7.0；`publish` 默认仍 false（draft），发布时由工作流输入 `publish=true`。
- 本文件。

## 本地预检

2026-10-24，Node v24.22.1 / npm 11.19.1。

### 发布准备轮

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 84 tests / 84 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行 |

### 流水线切换轮（工作树 `release/v1.7.0-pipeline`，基于 `358cde9` 加未提交改动）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，`tsc --noEmit` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 84 tests / 84 pass / 0 fail / 0 skip |
| release.yml YAML 解析（项目 `yaml` 库） | 0 | `source_ref` 默认 v1.7.0、`publish` 默认 false、并发组 release-v1.7.0、jobs=build/release |
| `selectOverlay` 对本次改动文件预判 | 0 | 入选 `.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`、`.d.mts`、`test/装配/release-packaging.test.ts`；本变更文档 excluded |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行：按指示未 commit，HEAD 即冻结源，`git diff <tag>..HEAD` 不含未提交改动（会得到空 overlay），不能代表真实发布树；待提交后由 CI 执行并回填 overlayPaths/actualTree/overlayPatchSha256 |

## 发布配方（已切换，待 CI）

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.7.0'`、`SOURCE_SHA='358cde9152584be29eff3a7564c99d9dd53463d8'`；白名单保持基础集（files＝`package.json`、`package-lock.json`、`.github/workflows/release.yml`，另有历史精确条目；dirs＝`src/common/装配/`、`test/装配/`），未列名 `app/`/`src/` 仍 fail-closed。
- `src/common/装配/release-policy.d.mts`：字面量与 `.mjs` 同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言及打包面用例切到 v1.7.0 与上述 SHA；断言不放宽、未删测试。
- `.github/workflows/release.yml`：workflow_dispatch `source_ref` 默认、并发组、`gh release view/create/upload/edit`、标题与 notes 全部 → v1.7.0；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`；`publish` 默认仍为 false（draft），发布时以工作流输入 `publish=true` 公开。
- 待办：提交后由三平台 CI 执行 prepare 并回填 overlayPaths/actualTree/overlayPatchSha256。

## CI、资产与 SHA（待回填）

- 三平台 CI run：**待触发/待回填**；不编造 run id。
- 资产：`ANS-Studio-1.7.0-mac-arm64.zip`、`ANS-Studio-1.7.0-mac-x64.zip`、`ANS-Studio-1.7.0-win-x64.zip`，以及各平台 `SHA256SUMS-*.txt`、`SHA256SUMS-overlay.txt`、`release-provenance.json`、`overlay.patch`；SHA256 在构建完成前未知，**未预填**，发布后由 Release 校验文件回填/核对。
- 三平台运行包**未签名、未公证**（同 v1.6.0 形态）：macOS 未公证、Windows 未做代码签名。

## 证据边界

- 发布准备轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；流水线切换轮只改发布策略、workflow 与发布打包测试，并运行 `typecheck`、装配测试、release.yml YAML 解析与 `selectOverlay` 预判。
- prepare 预演本轮未执行：按指示未 commit，HEAD 即冻结源，未提交改动不会进入预演树（会得到空 overlay），不能代表真实发布树；待提交后由 CI 执行并回填。
- 未运行全量测试、`build:renderer`；未触发 CI，未下载或启动 ZIP。三平台构建/解压/启动 smoke 仍由 CI 原生 runner 执行；桌面在线链路验证范围与 v1.6.0 记录一致，不因本版扩大。
