---
id: v2.0.0-release-prepare-20261112
type: change
title: v2.0.0 发布准备：两条固定工作流路径成为默认工作流
created: "2026-11-12"
updated: "2026-11-12"
timezone: Asia/Shanghai
status: implemented-unverified
related: []
events:
  - date: "2026-11-12"
    kind: created
    summary: 客户授权发布 2.0.0 版（重大版本）；版本 1.9.2→2.0.0；README 当前版本/下载表/要点 → v2.0.0
  - date: "2026-11-12"
    kind: verified
    summary: node -e 校验 package.json 与 package-lock.json 根版本字段三处一致（2.0.0），依赖与锁结构零变动
---

# v2.0.0 发布准备

客户已明确授权发布 **2.0.0 版（重大版本）**（同前几轮形态：未签名 ZIP）。本轮只做发布准备：版本标识、README 发布说明与本记录，并在 release 分支上提交、推送、开 PR；**不打 tag、不动 main、不触发 workflow**（tag 与 dispatch 由调度方执行）。本任务的文件集依据客户明确的发布授权（release-prepare 先例 `f2a34f1` 同一文件集：`package.json`、`package-lock.json`、`README.md`、`README.en.md` 与本记录），不改角色卡边界。

## 版本与冻结源

- 版本 1.9.2 → **2.0.0**（major / 重大版本；原因：默认工作流行为变化——两条固定工作流路径成为默认、派发权分裂、Git 治理机制退役）。`package.json` 与 `package-lock.json` 仅根两处版本字段（`package-lock.json` 的根 `version` 与 `packages[""].version`），依赖与锁结构零变动。
- 发布源（冻结源）：`origin/main` 当前 **`a6d4c5531be4dee46a17cda32178451e0b0f9676`**（`Merge pull request #84 from wangzhongren/feat/two-fixed-workflow-paths`）。
- 发布准备分支：`release/v2.0.0-prepare`（从 `a6d4c55` 切出）；发布准备提交 `chore(release): prepare v2.0.0`（本轮）。**本轮不打 tag、不合并 main、不触发 workflow**。

## 本轮变化（相对 v1.9.2）

- **两条固定工作流路径成为默认工作流**（T3「两条固定工作流路径」，客户 2026-11-10 确认进入开发）：新增固定阶段 **A1–A13**（新项目/新功能包：意图→方案→人事→团队计划与基线→任命→实现→独立验收→交付合并）与 **B1–B4**（既有实现的变更/修复：影响面分析→范围决定→实现→交付合并）；默认路径固定、确定，更重机制可按例外启用，但不得成为默认前置。
- **角色派发分裂**：**运营（convener）是生产线的唯一派发者**——产品/策划/人事/实现角色的任务全部由运营派发；**幕僚（chief）做产线调度**（经 `stage-request` 请求运营派发下一步）**并派发独立验收**（质量门与生产派发分离）；幕僚不派生产线角色。3 张客户确认卡（意图/方案/任命）保留不合并；高风险动作仍需客户本人确认，judge 不可代批。
- **Git 简化**：默认路径只做「任务分支提交 + 合并 main（客户本人确认）」；取消 trunk ref、bootstrap、冻结闭包、候选 ref、run pin、stable-write 许可等全部治理型 Git 机制；Git 只装代码，治理状态走应用 append-only 账本（`.ans/state/*.jsonl`）；旧机制代码 compat-only 保留、不删除、不迁移历史账本。
- **B29–B34 修复**（真机全链中发现并修复）：
  - **B29**：fixed A9 团队计划回执被工具层降级「结果未知」——`complete_team_plan` 回执形状修复；
  - **B30**：只读 Git `[user]` 白名单（repo-local 默认身份 `user.name`/`user.email` 放行，其余 fail-closed）；
  - **B31**：A12b 轻量验收（blocked 报告 + 应用归档 + 非空 note + accepted 的受支持分支；其它阶段、缺归档、缺 note 仍 fail-closed）；
  - **B32**：A11/B3 提交 argv 引号规则（`git commit -m "<message>"` 单消息参数；运营不得代 worker 提交）；
  - **B34**：路径 B 拒绝 B2 advance stage-request（消除 `change.scope-decided` 记录窗口被关闭且不可恢复的死锁；B1 完成后直接发 B3）。
- **真机验证摘要**：RR28/RR29 贪吃蛇全链（A1–A13 全链、merge-main 客户卡、target main 已合并；真实浏览器 RR-03 六项可玩性全过）与 B2 v2 独立验收 overall pass（AC 30/30、T 20/20、RR 6/6、EV 8/8）；RR30 武侠肉鸽 Path A 全链（A1–A13、merge-main、A13 交付说明等待并留证）；RR34 Path B 修复后九项可玩性全过（B1→B3→B4 无阻塞、merge-main 客户卡真实作答、真实浏览器 RR-03 九项全过、控制台 0 error）。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.9.2 → 2.0.0。
- `README.md`、`README.en.md`：版本状态新增 v2.0.0 段，原 v1.9.2 段改写为「已含能力不变」保留历史；「没有旧流程机器」「旧机制已退场」版本字样 → v2.0.0；下载区当前版本 v2.0.0（2026-11-12 发布）、三个下载行链接与文件名 `v2.0.0`/`ANS-Studio-2.0.0-*`、PowerShell 示例文件名 2.0.0；SHA256 块改为「发布后回填」占位（不预填、不虚构）；overlay/provenance/patch 链接指向 v2.0.0；发布记录链接指向本文件；details 后要点行与「部分能力尚未随发布包提供」同步 v2.0.0；「深入了解」发布准备链接改到本记录。
- 本文件。
- 未修改 `release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/**` 或任何其它文件。

## 发布计划

- prepare PR 合并后，annotated tag **`v2.0.0`** 打在 prepare 合并提交上（由调度方执行；tag 不可移动）。
- tag 后在主线上以一次小提交完成 `src/common/装配/release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml` 的 pointer 更新（`SOURCE_REF='v2.0.0'` / `SOURCE_SHA=<prepare 合并提交>` / workflow 默认与 `gh release` 引用），**避免 overlay 自引用**；overlay 只允许该 pointer 更新进入。
- 发布 workflow 由调度方 dispatch；三平台构建、Release 资产与 SHA256 回填在后续轮次完成。

## 证据边界

- 本轮只改版本字段与发布文档，**未运行全量测试**；仅以 `node -e` 校验 `package.json` 与 `package-lock.json` 的根版本字段三处一致。真机验证证据沿用已有记录（RR28/RR29/RR30/RR34 与 B2 v2 报告），本轮不重跑。
- 本轮**未打 tag、未动 main、未触发 workflow**（tag 与 dispatch 由调度方执行）；未新增依赖；未改角色卡边界。
