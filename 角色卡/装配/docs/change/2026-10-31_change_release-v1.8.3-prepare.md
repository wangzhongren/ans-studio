---
id: v1.8.3-release-prepare-20261031
type: change
title: v1.8.3 发布准备：run-change 触发与入口接线补丁
created: "2026-10-31"
updated: "2026-10-31"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-10-31"
    kind: created
    summary: 客户决定发布 1.8.3 补丁（未签名 ZIP）；版本 1.8.2→1.8.3；README 当前版本/下载表/要点 → v1.8.3
  - date: "2026-10-31"
    kind: verified
    summary: 本地预检 npm run typecheck 0、npm run typecheck:renderer 0、装配测试 87/87 通过
  - date: "2026-10-31"
    kind: updated
    summary: PR #28 合并（c3957d0，含 run-change 接线 b7cc275）；annotated tag v1.8.3 已打并推送；release-policy/workflow/打包测试切到 v1.8.3
---

# v1.8.3 发布准备

客户决定发布 **1.8.3** 补丁版、**未签名 ZIP**（同前两轮形态）。本轮准备发布源、版本标识与发布说明；发布流水线切换在 tag 确定后的后续提交完成。本记录随发布进展更新；最终 CI/资产/SHA 在完成后填入。

## 版本与冻结源

- 版本 1.8.2 → **1.8.3**（patch）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：**`b7cc275`**（`feat(desktop): wire run-change triggers and entry`，修复 `docs/communication/2026-10-31_intent_run-change-unwired.md` 记录的缺陷；独立验收 pass：`docs/acceptance/2026-10-31_wave3-run-change-wiring-acceptance-report-v1.md`，101 行 `a949b1a4…`）。
- annotated tag **`v1.8.3`**：已打并推送，指向 PR #28 合并提交 **`c3957d00d19f5a177aeaa2950df394274231b25b`**。
- 发布准备提交：**`510b2ab`**（`chore(release): prepare v1.8.3`，PR #28）；流水线切换提交：`ci(release): point pipeline at v1.8.3`（本轮）。

## 本轮变化（相对 v1.8.2）

- **run-change 契约变更通道接线**：
  - 显式入口：会话头「契约变更 · 重开 run」（`listProject.activeRuns` 只读摘要；无 pinned/多 pinned/桥缺省 ⇒ 禁用并说明原因）；preload → main → `interface.requestRunChange` → `SessionManager.requestRunChangeDecision`；
  - 自动触发（保守，两类可机械核对场景）：①派发被冻结基线拒绝且最新 roster 确含目标新角色/模块；②提案卡与 pin 版本冲突。命中先呈现 run-change 三模式卡，再回 `run-change-required` 三段式；同一 pinned run 自动仅一次；识别不出不弹卡；
  - 三段式：`run-change-required`（owner=app、retryable=true、action 明确）；
  - 冻结语义不变：continue-frozen 不改 run；stop-and-restart 收口旧 run + 新 draft（不自动 pin）；stop 取消；不自动替客户选模式；未新增 cardKind；manifest schema/§5A/Pi/Codex/release 未动。
- 其余能力与 v1.8.2 相同（含 D3 记账修复、v1.8.1 全部能力）。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.8.2 → 1.8.3。
- `README.md`、`README.en.md` 发布区：当前版本 v1.8.3（2026-10-31 发布）；下载/校验链接指向 v1.8.3 资产；SHA256 待回填；要点补充 run-change 接线说明；发布记录链接指向本文件。
- 本文件。
- 未改（留给下一轮）：`release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-10-31，Node v24.22.1 / npm 11.19.1，工作树 `release-v1.8.3`（`b7cc275` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.8.3`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `npm run test:assembly`（`node --test "test/装配/**/*.test.ts"`） | 0 | 87 tests / 87 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行（同前几轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.8.3 尚未创建） |

## 发布配方（下一轮）

- `release-policy.mjs`：`SOURCE_REF='v1.8.3'`、`SOURCE_SHA=<tag 合并提交 SHA>`；白名单保持基础集与历史保留条目（若有发布阻断修复按 v1.8.0/v1.8.2 先例逐文件加入）。
- `release-policy.d.mts`：字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.8.3；历史批次用例保留。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题与 notes → v1.8.3；`publish` 默认 false。

## CI、资产与 SHA（待回填）

- 三平台 CI run：**待触发/待回填**；不编造 run id。
- 资产：`ANS-Studio-1.8.3-mac-arm64.zip`、`-mac-x64.zip`、`-win-x64.zip` + `SHA256SUMS-*` + `release-provenance.json` + `overlay.patch`；发布后回填。
- 未签名、未公证。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；未运行全量测试、`build:renderer`、prepare 预演，未触发 CI。
- run-change 接线的验证证据：真实触发三模式测试 7/7、入口全链测试、聚焦独立验收 pass（`a949b1a4…`）；全量 3193/3166/9/18（`f672d31f…`）、E2E 18 PNG（`b3e9f1e9…`）、phase5a 43/43（`13737b9b…`）。
