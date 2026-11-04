---
id: v1.9.1-release-prepare-20261104
type: change
title: v1.9.1 发布准备：交付原文直出与自动决策转客户修复
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-11-04"
    kind: created
    summary: 客户决定发布 1.9.1 版（补丁版）；版本 1.9.0→1.9.1；README 当前版本/下载表/要点 → v1.9.1
  - date: "2026-11-04"
    kind: verified
    summary: 本地预检 npm run typecheck 0、装配测试 87/87 通过
  - date: "2026-11-04"
    kind: updated
    summary: PR #48 合并（3efee86，含 prepare 09d4d9e）；annotated tag v1.9.1 已打并推送（tag 对象 8438b33，指向 3efee86）
  - date: "2026-11-04"
    kind: verified
    summary: pipeline 钉版本轮完成并本地验证——node --test 装配 87/87、npm run typecheck 0
---

# v1.9.1 发布准备

客户已授权发布 **1.9.1 版（补丁版）**（同前几轮形态：未签名 ZIP）。发布准备（版本标识、README 发布说明与本记录）已随 PR #48 合并（`3efee86`），annotated tag `v1.9.1` 已打并推送。本轮完成流水线钉版：发布策略与声明、打包测试、release workflow 切到 v1.9.1。发布 workflow 触发与发布在后续轮次完成。

## 版本与冻结源

- 版本 1.9.0 → **1.9.1**（patch / 补丁版）。`package.json` 与 `package-lock.json` 仅根两处版本字段（`package-lock.json` 的根 `version` 与 `packages[""].version`），依赖与锁结构零变动（`@base-ui/react@1.9.0` 等依赖版本不受影响）。
- 发布源（冻结源）：annotated tag **`v1.9.1`**（tag 对象 **`8438b33d31517f8da56bb28f8f26bcdacbe52e75`**）→ prepare PR #48 合并提交 **`3efee86f7645e2a0bbee3aefd0de5db60dffb900`**（含 prepare 提交 `09d4d9e85e19166640d9353586577f1046976c4e`）。其产品代码基线为原 `origin/main` **`09529613650d06d45c0369c2f29464032bb60925`**（`Merge pull request #47 from wangzhongren/fix/auto-decision-escalate`），包含自 v1.9.0 以来的两项修复：
  - PR #46 `delivery-inline-report`（提交 `ea1231346d9167a7719f243ebe4b63600d873f12`，文档 `847678cadeca78522c48c0c94b5d3d8ca48e6eba`，合并 `8c56993adccfffe9740c847564d7aff2c638ae45`）：交付行默认内联报告正文，批次状态收进折叠回执；
  - PR #47 `auto-decision-escalate`（提交 `305fc6f5322696b3fc02a0b0d012f293bbe22648`，文档 `00757890b9f23b8e66b9eb4e8ec6afdfeb54b225`，合并 `09529613650d06d45c0369c2f29464032bb60925`）：自动决策「无法核对」时原卡转客户确认，同指纹拒绝去重。
- 发布准备提交：**`09d4d9e`**（`chore(release): prepare v1.9.1`，PR #48）；流水线切换提交：`ci(release): point pipeline at v1.9.1`（本轮）。

## 本轮变化（相对 v1.9.0）

- **交付原文直出**（`delivery-inline-report`）：交付卡（`kind=delivery`）默认内联 `summary.text` 全文（既有 16 KiB 投影保护不变），不再要求点击「查看完整报告摘要与证据」；批次标题、三列回执、重试与状态附注收进卡片尾部默认折叠的「接收历史」`details`，证据单独小折叠保留；投影 flags、证据逐条 redacted/truncated、`role="status" aria-live="polite"` 与安全副本仍在 DOM。回交行（`kind=handback`）与验收报告行为不变；零 i18n key、零通道/主进程/preload/src 改动（纯渲染层 4 文件，+144/−61）。
- **自动决策转客户 + 拒绝去重**（`auto-decision-escalate`）：`settleJudgeOutcome` 在 manual 收尾与 ledger-unavailable 预检中，遇到无法核对类拒绝码（`isUnverifiableRejectionCode`，单一来源编排 `mechanical-rejection.ts`）或同卡指纹（sha256，只用于去重、不写盘、不进账本）的重复自动拒绝时，改为向客户原卡呈现并附原因（`governance-judge.escalated`），不再反复自动拒绝；可核对卡判定与既有 approval 写卡退回语义不变，judge 仍绝不自动放行无物证的卡（fail-safe 方向不变）。只改 `app/desktop/customer-input.ts` 与 `test/桌面应用/decision-service.test.ts`。
- 其余能力与 v1.9.0 相同。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.9.0 → 1.9.1（prepare 轮）。
- `README.md`、`README.en.md` 发布区：当前版本 v1.9.1（2026-11-04 发布）；下载/校验链接指向 v1.9.1 资产；SHA256 表按先例留待发布后回填（中文「发布后回填」、英文 "filled in after release"，不预填、不虚构）；要点补充上述两项内容；发布记录链接指向本文件（prepare 轮）。
- 本文件。
- 流水线钉版（本轮）：`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`、`src/common/装配/release-policy.d.mts`、`test/装配/release-packaging.test.ts`。

## 本地预检

### prepare 轮（PR #48 前）

2026-11-04，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.1-prepare`（基于 `0952961` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.9.1`，`tsc --noEmit` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 87 tests / 87 pass / 0 fail / 0 skip（duration ≈ 7.9s） |
| `npm run typecheck:renderer` | — | 未执行（本轮无渲染层代码改动；发布 workflow 覆盖） |
| `npm run build:renderer` | — | 未执行（同前几轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.9.1 尚未创建） |

装配测试中的 `release-packaging.test.ts` 仍断言当前流水线的 `SOURCE_REF='v1.9.0'`（下一轮切换），本轮如常通过，无预期失败；未删除测试、未放宽断言。

### pipeline 钉版轮（本轮，基于 tag v1.9.1 / 3efee86）

2026-11-04，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.1-pipeline`（基于 `3efee86` 加本轮改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node --test "test/装配/**/*.test.ts"` | 0 | 87 tests / 87 pass / 0 fail / 0 skip（duration ≈ 6.4s） |
| `npm run typecheck` | 0 | `ans-cli@1.9.1`，`tsc --noEmit` 无诊断 |
| `grep -n "1\.9\.0" .github/workflows/release.yml` | 0（1 行匹配） | 仅命中发布 notes 中按要求保留的对照句「其余能力与 v1.9.0 相同」；source_ref 默认、并发组、`gh release view/create/upload/edit` 引用均已切到 v1.9.1，无其他 v1.9.0 字面量 |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（不触发 workflow；由发布轮独立门执行） |

说明：发布 notes 按发布说明需要保留「其余能力与 v1.9.0 相同」对照句，因此该 grep 仅命中 notes 一行；source_ref 默认、并发组与全部 `gh release` 引用等管线字段均无 v1.9.0 字面量。`release-policy.mjs` 的 `SOURCE_REF`/`SOURCE_SHA`、声明字面量与打包测试均随本轮切到 v1.9.1。

## 发布配方（本轮实际做法）

- `release-policy.mjs`：`SOURCE_REF='v1.9.1'`、`SOURCE_SHA='3efee86f7645e2a0bbee3aefd0de5db60dffb900'`；白名单**保持基础集**（files＝`package.json`、`package-lock.json`、`.github/workflows/release.yml`；dirs＝`src/common/装配/`、`test/装配/`），**无产品/测试 overlay 条目**。v1.9.0 及更早历史条目归档为「历史」注释；fail-closed/excluded 机制不变。
- `release-policy.d.mts`：`SOURCE_REF`/`SOURCE_SHA` 字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.9.1；历史批次用例保留（不删除、不放宽）。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题 `ANS Studio 1.9.1` 与 notes 切到 v1.9.1；`publish` 默认保持 `false`。

## 证据边界

- prepare 轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck` 与装配测试；pipeline 轮只改发布策略/声明、打包测试、release workflow 与本记录，并运行本地装配测试与 `typecheck`。两轮均未运行全量测试、`typecheck:renderer`、`build:renderer`、prepare 预演，未触发 CI，未移动既有 tag，未发布。
- 两项修复的产品验证证据沿用（不重跑）：`delivery-inline-report` 的 typecheck 0 / build 0 / UI 402/402 / phase4b smoke 69/69 / 探针 before 6/6、after 14/14（见 `角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-implementation.md`）；`auto-decision-escalate` 的证据见 `角色卡/桌面窗口/docs/change/2026-11-04_change_auto-decision-escalate.md` 与 `角色卡/编排/docs/change/2026-11-04_change_auto-decision-escalate.md`。完整回归与三平台构建由发布 workflow 作为独立门执行。

## 发布阻断修复（2026-11-04；tag v1.9.1 不移动）

- **失败**：workflow run `41766839758`（headSha `1e3268b`）三平台 build job 均在 `Regression tests` 退出 1，`release` job 跳过——未创建 Release、无资产。唯一失败用例：`test/项目管理/shared/i18n-guard.test.ts:63` 硬编码守卫命中 `app/desktop/customer-input.ts:98:63 编排`（PR #47 引入的 import specifier 含技能路径「编排」，classification §4 机器路径；该文件不在 i18n-guard allowlist）。
- **修复（按 v1.8.x 发布阻断先例；精确路径、单文件不开目录、断言不放宽）**：
  - `test/项目管理/shared/i18n-guard-allowlist.ts`：按字典序补 `app/desktop/customer-input.ts` + 理由注释（机器路径，非用户可见 UI；守卫本身不变）；
  - `src/common/装配/release-policy.mjs`：`files` 精确加入 `test/项目管理/shared/i18n-guard-allowlist.ts`（单文件不开目录），注释按阻断修复格式；
  - `test/装配/release-packaging.test.ts`：新增精确入选 / 同目录 excluded / 未列名 fail-closed 断言。
- **本地预检**：`node --test test/项目管理/shared/i18n-guard.test.ts`（0 违规）、`node --test "test/装配/**/*.test.ts"`、`npm run typecheck`——结果见下（以实测为准）。重新 dispatch 后的三平台门禁为准。
