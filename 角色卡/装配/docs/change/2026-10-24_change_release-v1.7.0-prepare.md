---
id: v1.7-release-prepare-20261024
type: change
title: v1.7.0 发布准备：冻结源 e4968d6、版本与发布说明切换
created: "2026-10-24"
updated: "2026-10-24"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-10-24"
    kind: created
    summary: 客户决定发布 1.7.0（未签名 ZIP，同 v1.6.0 形态）；版本 1.6.0→1.7.0；README 当前版本/下载表/要点 → v1.7.0
  - date: "2026-10-24"
    kind: verified
    summary: 本地预检 npm run typecheck 0、npm run typecheck:renderer 0、装配测试 84/84 通过
---

# v1.7.0 发布准备

客户决定发布 **1.7.0**、**未签名 ZIP**（同 v1.6.0 形态）。本轮只准备发布源、版本标识与发布说明；`release-policy`、`.github/workflows/release.yml` 与 `test/装配/release-packaging.test.ts` 等发布流水线切换要等 tag 确定后由下一轮更新。本记录随发布进展更新；最终 tag/SHA/CI/资产在完成后填入。

## 版本与冻结源

- 版本 1.6.0 → **1.7.0**（minor）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：**`e4968d6`**（`Merge pull request #14 from wangzhongren/flow-appointment-feedback-fix`，PR #14 合并提交）。
- annotated tag **`v1.7.0`**：待打；其指向的 commit SHA 在下一轮填入。
- 发布准备提交：**待填**（本轮改动提交后回填）。

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

- `package.json`、`package-lock.json`：仅版本字段 1.6.0 → 1.7.0。
- `README.md` 发布区：当前版本改为 v1.7.0（2026-10-24 发布）；下载表与校验链接全部指向 v1.7.0 资产；删除 v1.6.0 SHA256 明细，改为“v1.7.0 发布后由 Release 的 SHA256SUMS 回填/核对”；v1.6.0 要点替换为 v1.7.0 要点；发布记录链接指向本文件。
- 本文件。
- 未改（按任务留给下一轮）：`src/common/装配/release-policy.mjs`、`src/common/装配/release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-10-24，Node v24.22.1 / npm 11.19.1，工作树 `lead-governance-coordination`（`e4968d6` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 84 tests / 84 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行 |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.7.0 尚未创建，下一轮执行） |

## 发布配方（下一轮）

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.7.0'`、`SOURCE_SHA=<tag v1.7.0 指向的 commit SHA，下一轮填入>`；白名单保持基础集（files＝`package.json`、`package-lock.json`、`.github/workflows/release.yml`；dirs＝`src/common/装配/`、`test/装配/`），未列名 `app/`/`src/` 仍 fail-closed。
- `src/common/装配/release-policy.d.mts`：字面量与 `.mjs` 同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF='v1.6.0'` / `SOURCE_SHA='f43f7a5…'` 断言及打包面用例全部切到 v1.7.0 与对应 SHA；断言不放宽。
- `.github/workflows/release.yml`：workflow_dispatch `source_ref` 默认、并发组、`gh release view/create/upload/edit`、标题与 notes 全部 → v1.7.0；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`；`publish` 默认仍为 false（draft）。
- 下一轮完成上述切换并打 annotated tag v1.7.0 后，运行 prepare 预演并记录 overlayPaths/actualTree/overlayPatchSha256。

## CI、资产与 SHA（待回填）

- 三平台 CI run：**待触发/待回填**；不编造 run id。
- 资产：`ANS-Studio-1.7.0-mac-arm64.zip`、`ANS-Studio-1.7.0-mac-x64.zip`、`ANS-Studio-1.7.0-win-x64.zip`，以及各平台 `SHA256SUMS-*.txt`、`SHA256SUMS-overlay.txt`、`release-provenance.json`、`overlay.patch`；SHA256 在构建完成前未知，**未预填**，发布后由 Release 校验文件回填/核对。
- 三平台运行包**未签名、未公证**（同 v1.6.0 形态）：macOS 未公证、Windows 未做代码签名。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；未运行全量测试、`build:renderer`、prepare 预演，未触发 CI，未下载或启动 ZIP。
- 三平台构建/解压/启动 smoke 仍由 CI 原生 runner 执行；桌面在线链路验证范围与 v1.6.0 记录一致，不因本版扩大。
