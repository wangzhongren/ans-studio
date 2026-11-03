---
id: v1.8.4-release-prepare-20261103
type: change
title: v1.8.4 发布准备：全局任务状态、验收卡与派发护栏
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 客户决定发布 1.8.4 版（未签名 ZIP）；版本 1.8.3→1.8.4；README 当前版本/下载表/要点 → v1.8.4
  - date: "2026-11-03"
    kind: verified
    summary: 本地预检 npm run typecheck 0、npm run typecheck:renderer 0、装配测试 87/87 通过
---

# v1.8.4 发布准备

客户决定发布 **1.8.4** 版、**未签名 ZIP**（同前几轮形态）。本轮准备发布源、版本标识与发布说明；发布流水线切换在 tag 确定后的后续提交完成。本记录随发布进展更新；最终 CI/资产/SHA 在完成后填入。

## 版本与冻结源

- 版本 1.8.3 → **1.8.4**（patch）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：PR #33 合并提交 **`05d9414a43562cd0e701e0017ebf093aa858df71`**（`Merge pull request #33 from wangzhongren/feat/global-task-state`），包含：
  - PR #31 派发护栏放松（`2e16164`，合并 `5a35908`）：派发受理只保留角色授权矩阵，状态检查降级为 advisory；
  - PR #32 验收报告卡特殊显示与原文直出（`1081430`，合并 `0a12310`）；
  - PR #33 全局任务状态与幕僚版本决策权（`728c4e1`/`27162ca`）。
- annotated tag **`v1.8.4`**：待打；指向 PR 合并提交，SHA 在下一轮填入。
- 发布准备提交：**待填**。流水线切换提交：**待填**。

## 本轮变化（相对 v1.8.3）

- **全局任务状态与幕僚版本决策权**：
  - `project_state` 只读工具 + UI「项目状态」区：从 `.ans/state/tasks.jsonl`、run manifest 与版本化文档即时派生跨 flow 的 focus/阶段/未收口任务/阻塞/版本与证据指针/下一步，不落第二份状态；
  - `project_note`：幕僚受控写 `project.focus` / `project.note`（append-only，app-only 账本）；
  - `request_version_decision`：幕僚提议「版本修改」或「新版本开发」，应用发 application-owned decision 卡，由客户或「替我决策」判断 agent 决定；应用只执行机器部分（新 flow/run、关闭旧 flow 全部活动 run、orphan 旧申请、切换 focus、审计），不写文档、不派角色、不创建任务；pinned run 仍走 run-change；
  - 新增账本事件 `project.focus` / `project.note` / `version.decision`，97 个 i18n key 与 README 事件清单同步。
- **验收报告卡特殊显示与原文直出**：verifier 验收报告返回幕僚的报告卡与客户侧验收决定卡使用「独立验收」身份/配色，直接渲染完整报告原文与证据；普通报告卡不变。
- **派发护栏放松**：派发前置只保留「谁能给谁派发」的角色授权硬门；任务状态类检查降级为 advisory（不阻断、可审计），run 记账仍 best-effort。
- 其余能力与 v1.8.3 相同（run-change 契约变更通道、D3 记账修复、v1.8.1 全部能力）。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.8.3 → 1.8.4。
- `README.md`、`README.en.md` 发布区：当前版本 v1.8.4（2026-11-03 发布）；下载/校验链接指向 v1.8.4 资产；SHA256 表按先例留待发布后回填；要点补充全局任务状态/验收卡/派发护栏说明；发布记录链接指向本文件。
- 本文件。
- 未改（留给下一轮）：`release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-11-03，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.8.4-prepare`（基于 `05d9414` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.8.4`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `npm run test:assembly`（`node --test "test/装配/**/*.test.ts"`） | 0 | 87 tests / 87 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行（同前几轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.8.4 尚未创建） |

## 发布配方（下一轮）

- `release-policy.mjs`：`SOURCE_REF='v1.8.4'`、`SOURCE_SHA=<tag 合并提交 SHA>`；白名单保持基础集与历史保留条目（若有发布阻断修复按 v1.8.0/v1.8.2 先例逐文件加入）。
- `release-policy.d.mts`：字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.8.4；历史批次用例保留。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题与 notes → v1.8.4；`publish` 默认 false。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；未运行全量测试、`build:renderer`、prepare 预演，未触发 CI。
- 本轮产品能力的验证证据沿用（不重跑）：全局任务状态/版本决策 D1 重跑 3462/3434/10/18（新增确定性失败 0）、E2 独立验收通过（V1 v1.1；AC-1–AC-10 全 pass、R1–R5 满足）；验收卡与派发护栏的 E1/E2/E3 记录；完整回归与三平台构建由发布 workflow 作为独立门执行。
