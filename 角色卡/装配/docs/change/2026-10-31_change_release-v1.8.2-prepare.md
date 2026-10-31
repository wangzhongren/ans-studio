---
id: v1.8.2-release-prepare-20261031
type: change
title: v1.8.2 发布准备：D3 选中集记账修复补丁
created: "2026-10-31"
updated: "2026-10-31"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-10-31"
    kind: created
    summary: 客户决定发布 1.8.2 补丁（未签名 ZIP）；版本 1.8.1→1.8.2；README 当前版本/下载表/要点 → v1.8.2
  - date: "2026-10-31"
    kind: verified
    summary: 本地预检 npm run typecheck 0、npm run typecheck:renderer 0、装配测试 86/86 通过
  - date: "2026-10-31"
    kind: updated
    summary: PR #27 合并（1064ad8，含 D3 修复 a6d87a7）；annotated tag v1.8.2 已打并推送；release-policy/workflow/打包测试切到 v1.8.2
  - date: "2026-10-31"
    kind: blocked
    summary: 首轮 CI（run 41172893105）macOS arm64 挂新增测试清理竞态（chain-enforcement ENOTEMPTY）；改测试清理（重试/确定性等待）后经显式 overlay 白名单重跑
  - date: "2026-10-31"
    kind: updated
    summary: 测试清理修复 ff58dd4 合入 main；release-policy 白名单加入 4 个精确测试文件、打包测试增批次用例；重跑 CI 待触发
---

# v1.8.2 发布准备

客户决定发布 **1.8.2** 补丁版、**未签名 ZIP**（同 v1.8.1 形态）。本轮准备发布源、版本标识与发布说明；发布流水线切换在 tag 确定后的后续提交完成（`ci(release): point pipeline at v1.8.2`）。本记录随发布进展更新；最终 CI/资产/SHA 在完成后填入。

## 版本与冻结源

- 版本 1.8.1 → **1.8.2**（patch）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：**`a6d87a7`**（`fix(desktop): scope D3 role selection to appointment cards`，修复 `docs/communication/2026-10-31_intent_d3-decision-option-collision.md` 记录的缺陷；含 v1.8.1 tag `72454c7` 之后的该修复提交）。
- annotated tag **`v1.8.2`**：已打并推送，指向 PR #27 合并提交 **`1064ad8748c8d5a987bb378190a3ca2e47f932c7`**。
- 发布准备提交：**`71a4eb4`**（`chore(release): prepare v1.8.2`，PR #27）；流水线切换提交：`ci(release): point pipeline at v1.8.2`（本轮）。

## 本轮变化（相对 v1.8.1）

- **D3 选中集记账修复**：`request.resolved` 仅 appointment 卡写 `targetRoleIds`；其他 choice 卡（decision/intent-confirm/proposal/acceptance）的选中项写入 `selectedOptionIds`（仅审计）；`request.created`/`request.resolved` 落应用侧 `cardKind`；D3 扫描只接受 appointment 裁决（新事件看 cardKind，legacy 仅以 `rosterVersion`/`rosterSha256` 戳兼容）；历史污染记录自动忽略、无需迁移。
- 其余能力与 v1.8.1 相同（§5A 意图契约可见、P0 投递/收尾不变量与停止解楔、P1 请求超时与 SDK 诊断、P2 网络监听、P3 仅 replay-safe 安全重试、验收卡归属指引、图片预算移除）。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.8.1 → 1.8.2。
- `README.md`、`README.en.md` 发布区：当前版本改为 v1.8.2（2026-10-31 发布）；下载表与校验链接全部指向 v1.8.2 资产；SHA256 改为发布后回填；要点补充 D3 记账修复说明；发布记录链接指向本文件。
- 本文件。
- 未改（留给下一轮）：`src/common/装配/release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-10-31，Node v24.22.1 / npm 11.19.1，工作树 `release-v1.8.2`（`a6d87a7` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.8.2`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `npm run test:assembly`（`node --test "test/装配/**/*.test.ts"`） | 0 | 86 tests / 86 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行（同前两轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.8.2 尚未创建，下一轮执行） |

## 发布配方（下一轮）

- `release-policy.mjs`：`SOURCE_REF='v1.8.2'`、`SOURCE_SHA=<tag 合并提交 SHA>`；白名单保持基础集与历史保留条目。
- `release-policy.d.mts`：字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.8.2；v1.8.0 历史批次用例保留。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题与 notes → v1.8.2；`publish` 默认 false。

## CI、资产与 SHA（待回填）

- 三平台 CI run：首轮 **run 41172893105 失败**（macOS arm64 新增测试清理竞态 `ENOTEMPTY`；Windows/macOS x64 通过）；测试稳定性修复后经 release-policy overlay 白名单（精确测试文件路径）重跑。重跑结果与资产**待回填**；不编造 run id。
- 资产：`ANS-Studio-1.8.2-mac-arm64.zip`、`-mac-x64.zip`、`-win-x64.zip` + `SHA256SUMS-*` + `release-provenance.json` + `overlay.patch`；发布后回填。
- 未签名、未公证。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；未运行全量测试、`build:renderer`、prepare 预演，未触发 CI。
- D3 修复的验证证据：定向 35/35、全量 3176/3149/9/18（日志 `bb3adb19…`）、双 typecheck/build 0（见缺陷记录 `docs/communication/2026-10-31_intent_d3-decision-option-collision.md`）。
