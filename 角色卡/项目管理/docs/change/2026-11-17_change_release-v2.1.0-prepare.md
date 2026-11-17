---
id: v2.1.0-release-prepare-20261117
type: change
title: v2.1.0 发布准备：session.ts 十三模块重构与全量测试债清零
created: "2026-11-17"
updated: "2026-11-17"
timezone: Asia/Shanghai
status: implemented-unverified
related: [session-ts-refactor, b7-closure-20261117]
events:
  - date: "2026-11-17"
    kind: created
    summary: 协调者安排 v2.1.0 发布准备（minor 版本）；版本 2.0.0→2.1.0；README 当前版本/下载表/要点 → v2.1.0（T3 两条固定路径、B29–B34、session.ts 十三模块重构、全量测试债清零）
  - date: "2026-11-17"
    kind: verified
    summary: node -e 校验 package.json 与 package-lock.json 根版本字段三处一致（2.1.0）；git diff --stat 仅 5 文件、git diff --check 通过、README 下载链接全部 v2.1.0
---

# v2.1.0 发布准备

协调者已安排发布 **2.1.0 版（minor 版本）**（同前几轮形态：未签名、未公证 ZIP）。本轮只做发布准备：版本标识、README 发布说明与本记录；改动提交在 `release/v2.1.0-prepare` 分支（提交 `chore(release): prepare v2.1.0`，已推送并开 PR），**不打 tag、不动 main、不触发 workflow**（tag 与 dispatch 由协调者执行）。本任务的文件集沿用 release-prepare 先例 `c15395c`（chore(release): prepare v2.0.0）的同一文件集：`package.json`、`package-lock.json`、`README.md`、`README.en.md` 与本记录；不改角色卡边界。

## 版本与冻结源

- 版本 2.0.0 → **2.1.0**（minor / 功能版本；原因：v2.0.0 之后的 session.ts 十三模块重构与全量测试债清零进入发布源，默认工作流行为不变）。`package.json` 与 `package-lock.json` 仅根两处版本字段（`package-lock.json` 的根 `version` 与 `packages[""].version`），依赖与锁结构零变动。
- 发布源（冻结源）：`origin/main` 当前 **`6aebf6485fe33598868241ea82c0c67a00fb2519`**（`Merge pull request #148 from wangzhongren/closure/b7-baseline-rebuild`，含 B7 收口提交 `989fd2b`）。
- 发布准备分支：`release/v2.1.0-prepare`（从 `6aebf64` 切出，单提交 `chore(release): prepare v2.1.0`，已推送并开 PR，合并由协调者执行）。**本轮不打 tag、不合并 main、不触发 workflow。**

## 本版内容（相对 v2.0.0）

- **T3 两条固定工作流路径**（v2.0.0 首次发布，本版保留不变）：固定阶段 **A1–A13**（新项目/新功能包）与 **B1–B4**（既有实现的变更/修复）；**运营（convener）是生产线的唯一派发者**，**幕僚（chief）做产线调度并派发独立验收**（幕僚不派生产线角色）；**Git 回归普通用法**——默认路径只做「任务分支提交 + 合并 main（客户本人确认）」，零 trunk ref、bootstrap、冻结闭包、候选 ref、run pin、stable-write 许可，Git 只装代码、治理状态走应用账本。
- **B29–B34 修复**（v2.0.0 首次发布，本版保留不变）：B29 A9 团队计划回执形状；B30 只读 Git `[user]` 身份白名单；B31 A12b 轻量验收收口；B32 A11/B3 提交 argv 引号规则；B34 路径 B 拒绝 B2 stage-request（消除 `change.scope-decided` 窗口死锁）。
- **session.ts 十三模块重构**（2026-11-13，B0–B7 批次，PR #95–#103）：`app/desktop/session.ts` 的 13,466 行大文件拆为 **barrel 30 行 + `session/index.ts` 门面 + 13 个协作模块**（含共享底座），**导出面 51 不变**（值 6 + 类型 45）；既有导入路径、协议、存储格式、事件顺序不变；只做结构性搬运与机械适配，不改外部行为。
- **全量测试债清零**（B7 收口，合并提交 `6aebf64`）：三平台全绿——**fail 0 / cancelled 0**；tests 5,828，pass **5,809 / 5,809 / 5,796**（arm64 / x64 / Windows）；三套冻结 known-red **0/0/0**（runtime-core-33 33→0、gates-5 5→0、orchestration-24 24→0，62 名逐名 0 命中）；B0/B7 基线按平台重建后失败名集合为空，旧 B0 191 / B7 190 名全部 0 命中；残差归零（R9 第八轮 13 名 × 3 平台全 pass，合并宇宙 0、unclassified 0）；零回退 watchlist 全绿。

## 验证依据

- 测试 CI run **44010606352**（`Test matrix (development feedback)`，`.github/workflows/test-ci.yml`，`workflow_dispatch`，`main @ ffe75ce623a659320e9caf1079ef7e9d81330b02`，2026-11-17T03:29:47Z–04:36:43Z，conclusion **success**）：三平台 tests 5,828；pass 5,809 / 5,809 / 5,796；fail 0 / cancelled 0；三平台 Typecheck success。
- B7 收口合并提交 **`6aebf64`**（PR #148）；收口记录：`角色卡/测试/docs/change/2026-11-17_b7-closure.md`（含 `_evidence/` 摘要、JSON 与只读提取/归类脚本）。该 run 为**开发反馈收官**，不构成发布放行；发布门禁仍以 `release.yml` 的 `node --test --test-concurrency=1 "test/**/*.test.ts"` 为准。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 2.0.0 → 2.1.0（根 `version` 与 `packages[""].version`；依赖与锁结构零变动）。
- `README.md`、`README.en.md`：版本状态新增 v2.1.0 段（T3 两条固定路径、B29–B34、session.ts 十三模块重构、全量测试债清零），原 v2.0.0 段按先例改写为「v2.0.0 已含能力不变」；「没有旧流程机器」「旧机制已退场」版本字样 → v2.1.0；下载区当前版本 v2.1.0（2026-11-17 发布）、三个下载行链接与文件名 `v2.1.0`/`ANS-Studio-2.1.0-*`、PowerShell 示例文件名 2.1.0；SHA256 块保持「发布后回填」占位（不预填、不虚构任何哈希）；overlay/provenance/patch 链接指向 v2.1.0；details 后要点行与「部分能力尚未随发布包提供」同步 v2.1.0；「深入了解」发布准备链接指向本文件。
- README 中 `v2.0.0`/`2.0.0` 出现点处理清单（两个文件同构，行号为中文 README）：
  1. L9 版本状态：当前版本 → v2.1.0；原 v2.0.0 段改写为「v2.0.0 已含能力不变——在 v1.9.2 基础上新增…」（精简保留）。
  2. L154「没有旧流程机器」：版本字样 → v2.1.0。
  3. L179「旧机制已退场」：版本字样 → v2.1.0。
  4. L193 当前公开版本行 → v2.1.0（2026-11-17 发布）。
  5. L197–L199 下载表：URL → `releases/download/v2.1.0/`，文件名 → `ANS-Studio-2.1.0-*`，SHA256SUMS 链接同步。
  6. L201 PowerShell 示例文件名 → `ANS-Studio-2.1.0-win-x64.zip`。
  7. L204 SHA256 details 摘要 → v2.1.0（发布后回填）。
  8. L206 SHA256 占位说明 → v2.1.0（不预填）。
  9. L208 overlay/provenance/patch 链接 → v2.1.0；发布记录链接 → 本文件。
  10. L214 details 后要点行 → v2.1.0（新增重构与测试债清零；T3 与 B29–B34 保留）。
  11. L308「发布与校验」中的发布记录链接 → v2.1.0 / 本文件。
  12. L318「部分能力尚未随发布包提供」→ 不在 v2.1.0 运行包内。
  13. L324「深入了解」v2.0.0 发布准备链接 → v2.1.0 / 本文件。
- 本文件。
- 未修改 `src/common/装配/release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/**` 或任何其它文件。

## 发布计划

- prepare 合并后，annotated tag **`v2.1.0`** 打在 prepare 合并提交上（**由协调者执行**；tag 不可移动）。**`v2.0.0` tag 不复用**（tag 不可移动；v2.0.0 冻结源不含本版内容）。
- tag 后由协调者在主线上以一次小提交完成 `src/common/装配/release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml` 的 pointer 更新（`SOURCE_REF='v2.1.0'` / `SOURCE_SHA=<prepare 合并提交>` / workflow 默认与 `gh release` 引用），**避免 overlay 自引用**；overlay 只允许该 pointer 更新进入。
- 发布 workflow 由协调者 dispatch；三平台构建、Release 资产与 SHA256 回填在后续轮次完成。

## 证据边界

- 本轮只改版本字段与发布文档，**未运行全量测试**；仅以 `node -e` 校验 `package.json` 与 `package-lock.json` 的根版本字段三处一致（2.1.0），并核对 `git diff --stat` 仅 5 文件、`git diff --check` 通过、README 下载链接全部 v2.1.0。
- 验证依据引用已有证据（测试 CI run 44010606352 与 B7 收口提交 6aebf64），**本轮不重跑**。
- 本轮**未打 tag、未动 main、未触发 CI**；未新增依赖；未改角色卡边界；未读 `.env`；未占用 9222/9223/9224。
