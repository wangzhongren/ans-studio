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
    summary: tag v1.7.0 → 358cde9 已推送；release-policy/.d.mts、release.yml、发布打包测试夹具全部切到 v1.7.0/358cde9；提交 4f7d24d
  - date: "2026-10-24"
    kind: verified
    summary: 流水线切换轮 typecheck 0、装配测试 84/84；release.yml YAML 解析与 selectOverlay 预判通过
  - date: "2026-10-24"
    kind: blocked
    summary: CI run 40092292623（源 tag v1.7.0=358cde9）失败：interface 第四轮等待超时、project-document 期望缺 changelog、V-D1 POSIX 目录大小写重复
  - date: "2026-10-24"
    kind: implemented
    summary: tag 不移动，overlay 按精确路径加入 team-plan.ts、interface.test.ts、project-document.test.ts；发布打包测试夹具同步
  - date: "2026-10-24"
    kind: blocked
    summary: 第二次 CI run 40093494057 仍失败：V-D1 与 project-document 已修复通过；剩余 acceptance-dispatch（旧“不派 Proof”断言误伤自动验收合法发送）与 interface（第四轮被前一轮 post-write 单飞挡住）
  - date: "2026-10-24"
    kind: implemented
    summary: overlay 再增列 test/桌面应用/acceptance-dispatch.test.ts（测试修复，interface 已在列）；发布打包测试夹具同步
---

# v1.7.0 发布准备

客户决定发布 **1.7.0**、**未签名 ZIP**（同 v1.6.0 形态）。版本标识与发布说明已切换，发布流水线（`release-policy`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`）已在 tag 确定后切到 v1.7.0。本记录随发布进展更新；最终 CI/资产/SHA 在完成后填入。

## 版本与冻结源

- 版本 1.6.0 → **1.7.0**（minor）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：annotated tag **`v1.7.0`** → commit **`358cde9152584be29eff3a7564c99d9dd53463d8`**（PR #15 合并提交；tag 对象 `9e7008ac815cfb9c65e3d29c15134729f3d3a6c0`，已推送）。
- 发布准备提交：**`3a7f74f`**（`chore(release): prepare v1.7.0`），随 PR #15 合入 `358cde9`。
- 流水线切换提交：**`4f7d24d`**（`ci(release): point pipeline at v1.7.0`），在 tag 之后提交，承载 v1.7.0 overlay 与 workflow 切换。
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

### CI 阻断修复轮（overlay 增列，tag 不动）

- `src/common/装配/release-policy.mjs`：`files` 精确加入 `src/common/编排/team-plan.ts`（目录大小写重复跨平台修复，唯一生产文件）、`test/桌面应用/interface.test.ts`（第四轮等待预算 6000→15000）、`test/桌面应用/project-document.test.ts`（期望补 changelog）；注释标明为 v1.7.0 发布阻断修复，未列名 `app/`/`src/` 仍 fail-closed。
- `test/装配/release-packaging.test.ts`：新增 v1.7.0 blocking-fix 精确入选用例；v1.4.0 历史用例移除已重新入列的 `interface.test.ts`（其入选改由新用例断言），其余 fail-closed/excluded 断言与覆盖保留。
- 本文件。
- 说明：三个修复文件由其他角色修复与提交，本角色只负责 overlay 白名单与发布测试夹具，本轮未改这些文件内容。

### 第二次 CI 阻断修复轮（overlay 再增列，tag 不动）

- `src/common/装配/release-policy.mjs`：`files` 精确加入 `test/桌面应用/acceptance-dispatch.test.ts`（自动验收的合法 verifier 发送不再被旧的“不派 Proof”断言误伤；interface 已在列）。
- `test/装配/release-packaging.test.ts`：blocking-fix 精确入选断言同步加入该文件；未列名同目录测试仍 excluded、未列名 `src/` 仍 fail-closed，断言不放宽。
- 本文件。
- 说明：该测试修复由桌面角色完成与提交，本角色只负责 overlay 白名单与发布测试夹具，未改该文件内容。

## 本地预检

2026-10-24，Node v24.22.1 / npm 11.19.1。

### 发布准备轮

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 84 tests / 84 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行 |

### 流水线切换轮（提交 `4f7d24d`）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，`tsc --noEmit` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 84 tests / 84 pass / 0 fail / 0 skip |
| release.yml YAML 解析（项目 `yaml` 库） | 0 | `source_ref` 默认 v1.7.0、`publish` 默认 false、并发组 release-v1.7.0、jobs=build/release |
| `selectOverlay` 对本次改动文件预判 | 0 | 入选 `.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`、`.d.mts`、`test/装配/release-packaging.test.ts`；本变更文档 excluded |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行：当前 HEAD 为流水线提交 `4f7d24d`，tag→HEAD 只含已提交的流水线 overlay；v1.7.0 阻断修复 3 文件与本次 overlay 增列仍未提交，预演会漏掉这些改动，不能代表最终发布树；待修复与增列一并提交后由 CI 执行并回填 overlayPaths/actualTree/overlayPatchSha256 |

### CI 阻断修复轮（overlay 增列）

| 命令/检查 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 85 tests / 85 pass / 0 fail / 0 skip（新增 v1.7.0 blocking-fix 用例） |
| `selectOverlay` 预判 | 0 | `team-plan.ts`、`interface.test.ts`、`project-document.test.ts` 入选；未列名 `runtime-resolution.test.ts`、`d-dispatch-listing.test.ts` excluded；未列名 `src/common/编排/flow-service.ts` 抛 `Unreviewed production overlay` |

### 第二次 CI 阻断修复轮（overlay 再增列）

| 命令/检查 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.7.0`，无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 85 tests / 85 pass / 0 fail / 0 skip |
| `selectOverlay` 预判 | 0 | `acceptance-dispatch.test.ts` 与既有 blocking-fix 路径（team-plan、interface、project-document）入选；未列名 `runtime-resolution.test.ts`、`session-rebuild-race.test.ts` excluded；未列名 `src/common/编排/flow-service.ts` 抛 `Unreviewed production overlay` |

## 发布配方（已切换，待 CI）

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.7.0'`、`SOURCE_SHA='358cde9152584be29eff3a7564c99d9dd53463d8'`；白名单＝基础集（`package.json`、`package-lock.json`、`.github/workflows/release.yml`；dirs＝`src/common/装配/`、`test/装配/`）＋历史精确条目＋v1.7.0 发布阻断修复 4 条（`src/common/编排/team-plan.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/project-document.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`），未列名 `app/`/`src/` 仍 fail-closed。
- `src/common/装配/release-policy.d.mts`：字面量与 `.mjs` 同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言及打包面用例切到 v1.7.0 与上述 SHA；新增 v1.7.0 blocking-fix 精确入选用例；断言不放宽、未删测试。
- `.github/workflows/release.yml`：workflow_dispatch `source_ref` 默认、并发组、`gh release view/create/upload/edit`、标题与 notes 全部 → v1.7.0；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`；`publish` 默认仍为 false（draft），发布时以工作流输入 `publish=true` 公开。
- 待办：修复文件由对应角色提交后，提交本 overlay 变更，用同一 tag v1.7.0 重新触发三平台 CI；prepare 预演结果（overlayPaths/actualTree/overlayPatchSha256）与 run id 由 CI 回填。

## CI、资产与 SHA（待回填）

### CI run 40092292623（失败，源 tag v1.7.0=358cde9）

- 失败项（3 个测试）：
  1. `test/桌面应用/interface.test.ts`：第四轮等待预算不足（6000 ms）超时。
  2. `test/桌面应用/project-document.test.ts`：期望文本缺少 changelog。
  3. V-D1 POSIX：目录大小写重复（跨平台）。
- 处置：**tag v1.7.0 不移动**（源 tag 不可变），按既有显式 overlay 机制加入发布后修复：
  - `src/common/编排/team-plan.ts`：目录大小写重复跨平台修复（唯一生产文件）。
  - `test/桌面应用/interface.test.ts`：第四轮等待预算 6000→15000。
  - `test/桌面应用/project-document.test.ts`：期望补 changelog。
- 待重新触发：同一 tag v1.7.0 + 更新后的 overlay；新 run id 待回填。
- 修复核对（2026-10-24）：`src/common/编排/team-plan.ts` 的 V-D1 修复已落地——以 `parsed.path.toLowerCase()` 作比较键（只改比较键，展示/落盘保留原大小写），替换原 `compareKey`；编排角色以模拟 darwin 复跑 29/29，旧键复现 28/29 且仅 V-D1 失败，提交前已核对。本角色未改该文件。

### CI run 40093494057（第二次，仍失败，源 tag v1.7.0=358cde9）

- 已修复通过：V-D1（`src/common/编排/team-plan.ts`）与 `test/桌面应用/project-document.test.ts`。
- 剩余失败（2 个桌面测试）：
  1. `test/桌面应用/acceptance-dispatch.test.ts`：自动验收的合法 verifier 发送被旧的“不派 Proof”断言误伤。
  2. `test/桌面应用/interface.test.ts`：第四轮被前一轮 post-write 单飞挡住。
- 处置：tag 仍不移动；overlay 再按精确路径加入 `test/桌面应用/acceptance-dispatch.test.ts`（interface 已在列），由桌面角色修复测试断言。
- 待第三次重跑：同一 tag v1.7.0 + 更新后的 overlay；新 run id 待回填。

- 第三次三平台 CI run：**待触发/待回填**；不编造 run id。
- 资产：`ANS-Studio-1.7.0-mac-arm64.zip`、`ANS-Studio-1.7.0-mac-x64.zip`、`ANS-Studio-1.7.0-win-x64.zip`，以及各平台 `SHA256SUMS-*.txt`、`SHA256SUMS-overlay.txt`、`release-provenance.json`、`overlay.patch`；SHA256 在构建完成前未知，**未预填**，发布后由 Release 校验文件回填/核对。
- 三平台运行包**未签名、未公证**（同 v1.6.0 形态）：macOS 未公证、Windows 未做代码签名。

## 证据边界

- 发布准备轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；流水线切换轮只改发布策略、workflow 与发布打包测试，并运行 `typecheck`、装配测试、release.yml YAML 解析与 `selectOverlay` 预判；CI 阻断修复轮只增列经评审的 overlay 精确路径并同步测试夹具；第二次 CI 阻断修复轮再增列 `test/桌面应用/acceptance-dispatch.test.ts`。
- CI run 40092292623 与 40093494057 的失败结论来自协调方转达的发布修复任务；本角色未重跑这些 run，也未改修复文件的内容，只把经评审的精确路径加入 overlay 并补选择断言。
- prepare 预演仍未执行：当前 HEAD `033ccc8` 已含前两轮 overlay 与三项修复，但 `acceptance-dispatch.test.ts` 修复与本次 overlay 增列尚未提交，预演会漏掉这些改动；待一并提交后由 CI 执行并回填。
- 未运行全量测试、`build:renderer`；未触发 CI，未下载或启动 ZIP。三平台构建/解压/启动 smoke 仍由 CI 原生 runner 执行；桌面在线链路验证范围与 v1.6.0 记录一致，不因本版扩大。
