---
id: v1.8-release-prepare-20261030
type: change
title: v1.8.0 发布准备：冻结源 4cddd5a、版本与发布说明切换
created: "2026-10-30"
updated: "2026-10-30"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-10-30"
    kind: created
    summary: 客户决定发布 1.8.0（未签名 ZIP，同 v1.7.0 形态）；版本 1.7.0→1.8.0；README 当前版本/下载表/要点 → v1.8.0
  - date: "2026-10-30"
    kind: verified
    summary: 本地预检 npm run typecheck 0、npm run typecheck:renderer 0、装配测试 85/85 通过
  - date: "2026-10-30"
    kind: updated
    summary: tag v1.8.0 已打并推送（6211e08）；release-policy/workflow/打包测试切到 v1.8.0；prepare 预演与 CI 结果发布后回填
---

# v1.8.0 发布准备

客户决定发布 **1.8.0**、**未签名 ZIP**（同 v1.7.0 形态）。本轮只准备发布源、版本标识与发布说明；`release-policy`、`.github/workflows/release.yml` 与 `test/装配/release-packaging.test.ts` 等发布流水线切换要等 tag 确定后由下一轮更新。本记录随发布进展更新；最终 tag/SHA/CI/资产在完成后填入。

## 版本与冻结源

- 版本 1.7.0 → **1.8.0**（minor）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：**`4cddd5a`**（`fix(governance): close 3.4 evidence-check acceptance findings F1-F5`，第一波流程改进终态候选；自 v1.7.0 起 107 个提交）。
- annotated tag **`v1.8.0`**：已打并推送，指向 PR #25 合并提交 **`6211e08b7481c1346022fe2c36d47759dee3384f`**。
- 发布准备提交：**`5dff8ff`**（`chore(release): prepare v1.8.0`，PR #25）；流水线切换提交：`ci(release): point pipeline at v1.8.0`（本轮）。

## 本轮变化

- **内建角色最小系统与五步雇佣链**：产品意图 → 策划（名单 + 模块 + 架构）→ 人事（D3 / appointment 写卡）→ 运营交付 → 独立验收；shell 写区守卫（脚本内容审读、可证明越界直接拒绝）；modules/topology 等版本化文档守卫与旧版只读；报告按创建者路由、内建 worker `submit_report`、消除幕僚忙等。
- **模块/名单/拓扑 v2 与 roster v3**：模块可为单文件或单目录，同父兄弟目录可属不同模块；标准固定角色 env-bootstrap（环境/资源 + 入口/索引，领域中立）；模块路径随派发、任务与验收事实传递。
- **桌面缺陷修复**：重复投递与终态抑制；决策/审核弹窗透明令牌修复；决策列表显示请求标题；窄栏 composer 两行/容器查询布局；judge 开关跨重载持久化；跨窗口角色状态同步。
- **第一波流程改进（wave-1）**：
  - **run 冻结（3.1）**：run manifest（`.ans/runs/<runId>/manifest.json`，七类文档 path+sha256，assets 可选）、draft→pinned 同一 runId、pin 前置、mid-run 新版本不激活、run-change 决策卡（continue-frozen / stop-and-restart / stop）、legacy 只读（`run-legacy-readonly`）、新任务缺 run 拒绝（`run-required`）。
  - **机械拒绝三段式 + 契约速查（3.2）**：统一 `{code, missing, action, owner, docs, retryable}`；直接写门禁、shell 守卫、版本化文档守卫、governance judge 与派发前置全部接线；只读 `contract_check`（角色裁剪、≤4KB、不授予写权）。
  - **证据自洽校验（3.4）**：`evidence-meta/v1` sidecar；应用重算 lines/bytes/sha256/metrics；AC-28 自述负例（自述 223 行 / 实际 234）；P0 从 `ans-criteria/v1` criteria 机械派生（sidecar / 角色自报 `p0` 忽略并标记）；collection / legacy / stale 处理；只读 `evidence_check`（角色隔离、路径安全、不执行项目脚本）。
- 旧 v1/v2/v3 计划、流程与角色卡保持兼容。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.7.0 → 1.8.0。
- `README.md`、`README.en.md` 发布区：当前版本改为 v1.8.0（2026-10-30 发布）；下载表与校验链接全部指向 v1.8.0 资产；删除 v1.7.0 SHA256 明细，改为「v1.8.0 发布后由 Release 的 SHA256SUMS 回填/核对」；v1.7.0 要点替换为 v1.8.0 要点；发布记录链接指向本文件。
- 本文件。
- 未改（按任务留给下一轮）：`src/common/装配/release-policy.mjs`、`src/common/装配/release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-10-30，Node v24.22.1 / npm 11.19.1，工作树 `release-v1.8.0`（`4cddd5a` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.8.0`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `npm run test:assembly`（`node --test "test/装配/**/*.test.ts"`） | 0 | 85 tests / 85 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行（同 v1.7.0 准备轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.8.0 尚未创建，下一轮执行） |

## 发布配方（下一轮）

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.8.0'`、`SOURCE_SHA=<tag v1.8.0 指向的合并提交 SHA，下一轮填入>`；白名单保持基础集（files＝`package.json`、`package-lock.json`、`.github/workflows/release.yml`；dirs＝`src/common/装配/`、`test/装配/`），未列名 `app/`/`src/` 仍 fail-closed。
- `src/common/装配/release-policy.d.mts`：字面量与 `.mjs` 同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF` / `SOURCE_SHA` 断言及打包面用例全部切到 v1.8.0 与对应 SHA；断言不放宽。
- `.github/workflows/release.yml`：workflow_dispatch `source_ref` 默认、并发组、`gh release view/create/upload/edit`、标题与 notes 全部 → v1.8.0；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`；`publish` 默认仍为 false（draft）。
- 下一轮完成上述切换并打 annotated tag v1.8.0 后，运行 prepare 预演并记录 overlayPaths / actualTree / overlayPatchSha256。

上述切换已随本轮提交完成（tag v1.8.0 = `6211e08`）；prepare 预演（overlayPaths / actualTree / overlayPatchSha256）以 CI 构建产生的 provenance 为准，随发布回填。

## CI、资产与 SHA（待回填）

- 三平台 CI run：**待触发/待回填**；不编造 run id。
- 资产：`ANS-Studio-1.8.0-mac-arm64.zip`、`ANS-Studio-1.8.0-mac-x64.zip`、`ANS-Studio-1.8.0-win-x64.zip`，以及各平台 `SHA256SUMS-*.txt`、`SHA256SUMS-overlay.txt`、`release-provenance.json`、`overlay.patch`；SHA256 在构建完成前未知，**未预填**，发布后由 Release 校验文件回填/核对。
- 三平台运行包**未签名、未公证**（同 v1.7.0 形态）：macOS 未公证、Windows 未做代码签名。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；未运行全量测试、`build:renderer`、prepare 预演，未触发 CI，未下载或启动 ZIP。
- 第一波全量 / Electron / phase5a 证据见波终态验收报告 `docs/acceptance/flow-improvements-wave1-final-acceptance-report-v1.md`（112 行 / `13ea2e3de805177cce6840688d3ca6fb3395fd46f4bc6845f0c1411e6e0bf921`）；三平台构建 / 解压 / 启动 smoke 仍由 CI 原生 runner 执行，不因本版扩大验证范围。
