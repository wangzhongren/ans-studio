# B7：session.ts 重构收口——第三段（全量套件、三套 known-red、桌面全链、打包冒烟与终检）

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b7`（分支 `refactor/session-ts-b7`，起点 `e37da80`）
- 前两段记录：
  - `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle.md`（第一段：lifecycle 迁出 / 8 builder / 首线验证）
  - `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel.md`（第二段：门面迁入 `session/index.ts` / barrel 切换）
  - 测试角色并行记录：`角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b7-operator-pins.md`（operator-channel 改读聚合读取器）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §5 B7（全量 627+ 测试文件 / 三套 known-red / 桌面全链 / 三平台 release 冒烟）
- 范围：**B7 第三段（最终验证与收口）**——本地全量套件分段执行与 B0 冻结基线失败名对照、三套冻结 known-red 逐名 diff、
  桌面全链四目标定向复跑、本地 Windows 打包冒烟、最终结构与预算终检。**未改任何代码/测试**（除本记录与证据目录）。
- 边界：不 commit / 不 push / 不触发 CI / 不 tag / 不碰 main；不读 `.env`；不占 9222/9223/9224；不启动 Electron/真实模型。
- 证据目录：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/`

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| 全量套件（15 段合并） | **5,824 tests / 5,601 pass / 188 fail / 32 skipped / 3 cancelled / 0 todo**（15/15 段有汇总；`full/merged.json`） |
| 对 B0 冻结全量基线（5,811/5,587/189/32/3，191 名） | 本段全量运行：**ADDED = 1 / REMOVED = 2**（ADDED 为 i18n 硬编码守卫，确定性、非 flake、**非 B7 本段引入**——见 §4.4；REMOVED 2 名为既有环境/时序用例转为通过，见 §4.3）。**第三段补记：i18n 守卫已按 Option A 解决**（测试角色逐文件补 allowlist 31 条，scanner/断言零改动；复跑 6/6、`test/项目管理/**` 224/219/0/5 与 B0 一致）⇒ **最终对 B0：ADDED = 0 / REMOVED = 2**（原 ADDED=1 已消解；见 §4.4 补记） |
| 三套冻结 known-red | runtime-core **604/567/33/4（33/33 逐名一致）**；门禁 **577/571/5/1（5/5）**；编排 **1,373/1,347/24/2 + git-trunk-store 13/13 = 1,386/1,360/24/2（24/24）** |
| 桌面全链定向 | fixed-path-full-chain **3/3**、queue-recovery-e2e **2/2**、network-state-e2e **6/6**、turn-watch-verify **13 tests / 12 pass / 0 fail / 1 cancelled（既有 B1 名，与基线一致）**；零新增 |
| 打包冒烟（本地 Windows） | `npm run package:local` **EXIT=0（62s）**；`release-output/local/ANS-Studio-2.0.0-win-x64.zip`，**169,268,900 B**，sha256 `47282127…542112`；zip 内含 `resources/app/app/desktop/session/index.ts` 与 `session/lifecycle/*`（见 §7） |
| 最终结构 | barrel **30 行**（≤50）、`session/index.ts` **790 行**（≤800）、`session/**` 单模块最大 **1,477**（≤1,500）；导出面 **51**（运行时 6 + 类型 45）；7 角色工具面快照全过 |
| typecheck | `npm run typecheck` **EXIT=0**；`npm run typecheck:renderer` **EXIT=0** |
| 终检 | `git status` 仅允许路径；无临时目录/junction/构建产物入库（release-output 与 app/renderer/dist 均命中 .gitignore）；对比暂存工作树已移除（见 §9） |

## 2. 环境与命令口径

| 项 | 值 |
| --- | --- |
| 平台 | Windows 11 Pro 10.0.26300 / Git Bash（MINGW64） |
| Node / npm / git | v24.22.1 / 11.19.1 / 2.55.0.windows.5 |
| CPU | 32 逻辑核 |
| `node_modules` | 目录联接 → 主仓 `node_modules`（工作树既有，非本段创建） |
| 测试文件总数 | **629 个 `*.test.ts`**（B0 时点 627；B7 新增 `session-source.test.ts`(5) + `session-structure.test.ts`(8) 两个文件、共 +13 tests） |
| 全量命令口径 | `node --test --test-concurrency=1 --test-timeout=120000 [--test-force-exit] <段>`；段 = `test/` 一级目录 13 段 + 2 个拆分单文件段（`测试-hangsplit`、`编排-git-trunk-store`） |
| 与 CI 权威命令的差异声明 | CI（`.github/workflows/release.yml:76`）为 `node --test --test-concurrency=1 "test/**/*.test.ts"`（单进程、无 timeout/force-exit）。本机按 B0 已登记的环境挂起（`pi-adapter/abort`、`git-trunk-store` 等）采用分段 + `--test-force-exit`（仅退出兜底，不改变用例结果）+ 段级外部 `timeout -k 30` 兜底；单进程全量挂起在本环境已有 B0 证据（`05-full-tap-before.exit.txt`），本段未再次尝试。 |
| 拆分单文件（历史登记挂起/崩溃） | `test/测试/customer-authorization-plane-integration.test.ts`（测试段拆分）、`test/编排/git-trunk-store.test.ts`（编排段拆分）；均独立进程运行 |
| 门禁段资源归一 | 运行前以 `git cat-file blob HEAD:` 临时写回 `src/common/门禁引擎/workflows/chief/chief-workflow.md` 与 `chief-workflow-v2.md`（LF），运行后 `git checkout --` 还原；还原后 `git status` 为空、两文件 CRLF 计数 61/136、LF-only 0（`full/gates-resources-status.txt`、`full/gates-resources-crlf-check.txt`） |

## 3. 全量套件分段执行

运行脚本：`segment3/tools/run-full-segments.sh`（可复现；逐段 TAP 落盘于 `segment3/full/`）。

### 3.1 分段表

| 段 | exit | 耗时 | tests | pass | fail | cancelled | skipped | 失败名数 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| gates | 0 | 2s | 29 | 29 | 0 | 0 | 0 | 0 | |
| claude-adapter | 0 | 5s | 128 | 128 | 0 | 0 | 0 | 0 | |
| codex-adapter | 0 | 10s | 123 | 122 | 0 | 0 | 1 | 0 | |
| pi-adapter | 1 | 51s | 364 | 361 | 2 | 0 | 1 | 2 | symlink storage 环境红（基线同 2 名） |
| roles | 1 | 7s | 285 | 283 | 2 | 0 | 0 | 1 | 契约冻结文件哈希（基线同 1 名） |
| runtime-core | 1 | 50s | 604 | 567 | 33 | 0 | 4 | 33 | **冻结 known-red 33/33** |
| 装配 | 1 | 6s | 99 | 87 | 12 | 0 | 0 | 12 | 缺 SDK 配置/掩码类环境红（与基线逐名一致） |
| 项目管理 | 1 | 9s | 224 | 218 | 1 | 0 | 5 | 1 | **ADDED：i18n 硬编码守卫**（见 §4.4） |
| 桌面UI | 0 | 6s | 443 | 443 | 0 | 0 | 0 | 0 | |
| 桌面应用 | 1 | 441s | 845 | 774 | 69 | 2 | 0 | 71 | +13 tests = 新增 session-source(5)+session-structure(8)；2 条 120s 取消与基线同名；REMOVED 1 名（见 §4.3） |
| 门禁引擎 | 1 | 92s | 577 | 571 | 5 | 0 | 1 | 5 | LF 归一后运行；**冻结 known-red 5/5** |
| 测试 | 1 | 613s | 711 | 652 | 40 | 1 | 18 | 41 | 118 文件（拆分 customer-authorization-plane-integration）；基线注册的原生崩溃型文件级取消（`git-action-delivery-claude-e2e.test.ts`）未复现——该文件本轮 78s 通过 → REMOVED 1 名；较基线 +1 pass / −1 fail |
| 测试-hangsplit | 0 | 1s | 6 | 6 | 0 | 0 | 0 | 0 | `customer-authorization-plane-integration.test.ts` 独立运行通过 |
| 编排 | 1 | 139s | 1,373 | 1,347 | 24 | 0 | 2 | 24 | 137 文件（拆分 git-trunk-store）；**冻结 known-red 24/24** |
| 编排-git-trunk-store | 0 | 57s | 13 | 13 | 0 | 0 | 0 | 0 | 独立运行；本环境历史挂起/原生崩溃未复现（与 B0 同款披露） |
| **合计** | — | — | **5,824** | **5,601** | **188** | **3** | **32** | **190（唯一名；+1/−2）** | 合并 JSON：`full/merged.json`；pass+fail+skipped+cancelled=5,824 ✓ |

### 3.2 合并方式

`segment3/tools/merge-segments.mjs`（B0 同口径）：逐段抽取末尾 `ℹ tests/pass/fail/cancelled/skipped/todo` 与
`✖ name (Nms)` / `not ok N - name` 失败名，去重排序；输出 `full/merged.json` 与 `full/failnames.txt`。

## 4. 失败名对照 B0 冻结全量基线

基线：`…_evidence/segment3/full/b0-frozen-failnames-191.txt`（B0 在干净 c234e79 快照的 15 段合并，
**5,811 tests / 5,587 pass / 189 fail / 32 skipped / 3 cancelled**；`b0-frozen-merged.json` 同目录）。
逐名 diff 工具：`segment3/tools/diff-full-failnames.mjs`；输出 `full/failname-diff.json`。

### 4.1 结果

- 合并计数：**5,824 tests / 5,601 pass / 188 fail / 32 skipped / 3 cancelled / 0 todo**（15/15 段均有汇总；`full/merged.json`）。
- 与 B0 冻结基线（5,811/5,587/189/32/3，**191 唯一名**）逐名对照（`full/failname-diff.json`）：
  **共同 189 名；ADDED 1 名；REMOVED 2 名；本次唯一失败名 190**。
- 逐段对照（`full/segment-compare.json`）：其余 14 段计数与失败名集合与基线完全一致；差异仅三处：
  项目管理 **+1 fail**（i18n 守卫，§4.4）；桌面应用 **+13 tests**（新增 session-source 5 + session-structure 8，全部通过）且 **−1 fail**（§4.3）；
  测试 **−1 fail**（§4.3）。
- 恒等核对：`pass+fail+skipped+cancelled = 5,601+188+32+3 = 5,824` ✓。

### 4.2 ADDED

| # | 失败名 | 段 | 判定 |
| --- | --- | --- | --- |
| 1 | `硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）` | 项目管理 | **确定性、非 flake、非 B7 本段逻辑引入**（干净 e37da80 起点即失败）；属测试侧 allowlist 维护缺口；**合并阻断项，待裁决**（详见 §4.4）。本段未改测试、未放宽断言。 |

### 4.3 REMOVED

| # | 失败名（B0 基线） | 基线段 | 本次结果 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `test\测试\git-action-delivery-claude-e2e.test.ts`（文件级） | 测试 | 该文件本轮 **78s 正常跑完，AC-4 用例通过**（无文件级条目） | 基线为**已登记的本环境 Node 原生断言 flake**：`node::CleanupQueue::Add … Assertion failed: (insertion_info.second) == (true)`（async_hooks `destroyTracking`），在本轮未复现。属环境 flake 转为通过，如实披露（非 B7 行为变化）。 |
| 2 | `重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等` | 桌面应用 | 通过；`pending-card-restart.test.ts` 单文件复跑 **1 test / 1 pass / exit 0**（`chain/pending-card-restart-rerun.log`） | 基线时序/负载相关失败本轮转为通过；B7 无逻辑改动（纯搬运/barrel），按 REMOVED 如实披露。 |

### 4.4 ADDED 判定：i18n 硬编码守卫（唯一新增失败）

- 失败名：`硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）`（`test/项目管理/shared/i18n-guard.test.ts`）。
- 基线状态：B0 冻结全量基线该用例**通过**（项目管理段 224/219/0/5、exit 0）。
- 本次结果：项目管理段 224/218/**1**/5、exit 1；确定性失败（非 flake）：
  - **复跑证据**：单文件在 B7 工作树连跑 3 次全部失败，violation 31 条逐条相同（`knownred/i18n-guard-b7-run1..3.log`）。
  - **干净 e37da80 对照**：`git worktree add --detach` 干净对照树（`C:/Users/51054/AppData/Local/Temp/b7-e37da80-contrast`）
    单文件运行同样失败（5/6，25 条 violation；`knownred/i18n-guard-clean-e37da80-run1.log`、`i18n-violations-clean-e37da80.txt`）。
  - **归属**：失败**并非 B7 本段新逻辑引入**——e37da80（B7 起点、B1–B6 之后）已失败；B7 仅新增 6 条同族 violation
    （`session/index.ts` + `lifecycle/{host,open-context,open,ops,send}.ts`，均为 `src/common/编排/...` import 机器路径；
    `knownred/i18n-violations-added-by-b7.txt`）。根因是 B1–B7 把中文从 allowlist 文件 `app/desktop/session.ts`
    迁入新文件 `app/desktop/session/**`，而 `test/项目管理/shared/i18n-guard-allowlist.ts` 仍只列旧文件。
  - **内容性质**：31 条 violation 全部为**机器文本**（`../../src/common/编排/...` import specifier 中的中文目录名、
    agent-facing 工具回执等），与 allowlist 既有条目（如 `version-change.ts` 的 `编排` import 路径、`requirement-change.ts`
    agent-facing detail）同类；**无用户可见 i18n 文案改动**（方案非目标「不改 i18n 文案」未违反；文案本身逐字未变）。
- **处置（按约束停手）**：本段**未改测试、未放宽断言**。该失败需在合并前获得裁决：由测试角色按既有分类清单把迁出的
  `app/desktop/session/**` 文件补入 allowlist（逐文件分类说明），或由客户/PM 裁定扫描器改为目录级规则；均超出本段写区。
  **CI 权威命令会命中该失败**（三平台回归测试跑全量 `test/**/*.test.ts`）。
- 结论：B7 行为零变化的验证**不受该失败影响**（纯测试侧 allowlist 维护缺口、确定性、非行为回归）；但它是**合并阻断项**，
  须由测试角色/客户按上述裁决解决后才能进入合并。

### 第三段补记（i18n 守卫裁决与解决）

- **裁决**：协调者 2026-11-13 裁定 **Option A**——按拆分前 `app/desktop/session.ts` 文件级覆盖口径恢复守卫状态；
  `tasks.ts:832-838` 预存应用自有升级卡中文（B0 即存在，原被 `session.ts` 文件级条目整体掩盖，**非 B7 新增**）
  显式披露并登记为后续 i18n key 化待办（key 化会改变外部文案，超出 B7「行为零变化」范围）。
- **解决**：测试角色在 `test/项目管理/shared/i18n-guard-allowlist.ts` **逐文件补登 31 条**
  （B1–B6 积累 25 + B7 新增 6：`session/index.ts` 与 `session/lifecycle/{host,open-context,open,ops,send}.ts`；
  每条带机器路径锚点/文本类别理由；纯新增 **+87 行、0 删除**）；**scanner 与测试断言零改动**，
  无目录/通配放宽（合成负例仍拒绝新文件/新子目录中文）。
- **复跑（本记录独立复核）**：`node --test "test/项目管理/shared/i18n-guard.test.ts"` → **EXIT=0，6/6，
  `scanned=191 allowlisted=56 violations=0`**；`node --test --test-concurrency=1 "test/项目管理/**/*.test.ts"`
  → **EXIT=0，224 tests / 219 pass / 0 fail / 5 skipped**（与 B0 冻结基线 224/219/0/5 一致）。
- **结论**：本记录 §4.2 的唯一 ADDED 名（`硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）`）**已转绿**；
  全量对 B0 的失败名对照为 **ADDED = 0 / REMOVED = 2**（REMOVED 见 §4.3）。上文的原判定（确定性、非 flake、
  非 B7 本段逻辑引入）与根因叙述**保留**，作为该失败的历史判定。
- **记录**：`角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b7-i18n-guard-allowlist.md`
  （裁决依据、31 条逐文件分类与理由、`tasks.ts:832-838` 预存例外披露、写前/写后验证日志与「未放宽守卫」论证）。

## 5. 三套冻结 known-red 逐名 diff

| 套件 | 本次结果 | 冻结名单 | diff |
| --- | --- | --- | --- |
| runtime-core | 604 / 567 / **33** / 4 | 33 名（`knownred/runtime-core-33.txt`） | **空**（`knownred/runtime-core-diff.json`） |
| 门禁引擎 | 577 / 571 / **5** / 1（LF 归一；CRLF 已还原） | 5 名（`knownred/gates-5.txt`） | **空**（`knownred/gates-diff.json`） |
| 编排 | 1,373 / 1,347 / **24** / 2（+ git-trunk-store 13/13 → 合计 1,386 / 1,360 / 24 / 2） | 24 名（`knownred/orchestration-24.txt`） | **空**（`knownred/orchestration-diff.json`） |

## 6. 桌面全链定向复跑

独立进程、口径同全量分段（`segment3/tools/run-chain-targeted.sh`；日志 `segment3/chain/`）。基线 = B7 第二段（barrel 切换后，与 e37da80 首线验证一致；`chain/baseline-second-segment.txt`）。

| 目标 | 本次 exit / 耗时 | 结果 | 基线 | 结论 |
| --- | --- | --- | --- | --- |
| `test/测试/fixed-path-full-chain.test.ts` | 0 / 4s | **3/3** | 3/3 | NO_DIFF |
| `test/测试/queue-recovery-e2e.test.ts` | 0 / 1s | **2/2** | 2/2 | NO_DIFF |
| `test/测试/network-state-e2e.test.ts` | 0 / 2s | **6/6** | 6/6 | NO_DIFF |
| `test/测试/turn-watch-verify/`（a/b/c 三文件） | 1 / 12s | **13 tests / 12 pass / 0 fail / 1 cancelled** | 同（1 条 B1 既有取消） | NO_DIFF；唯一非通过为既有「B1 检查时限到点不中止；turnLastResortMs 到点才中止…」 |

**零新增失败/取消**（与基线逐名一致）。

## 7. 打包冒烟（本地 Windows）与三平台替代说明

### 7.1 本地 Windows 打包冒烟

| 项 | 值 |
| --- | --- |
| 命令 | `npm run package:local`（= `npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local`）；**不发布、不上传** |
| 结果 | **EXIT=0，62s**（`package/package-local.log`、`package/package-summary.txt`） |
| 产物 | `release-output/local/ANS-Studio-2.0.0-win-x64.zip` — **169,268,900 字节（161.4 MiB）**；sha256 **`4728212793e7eab0447d55a42e2f9437b18638f0a3d02a5ca63a365910542112`**（`package/sha256sums.txt`） |
| 产物内容核验 | zip 2,565 条目；含 `resources/app/app/desktop/session.ts`（barrel，2,396 B）、`resources/app/app/desktop/session/index.ts`（148,902 B）与 `app/desktop/session/lifecycle/` **11 条目**（`package/zip-listing.txt`）——即打包树包含重构后的真实代码 |
| 构建产物不入 git | `git check-ignore -v`：`release-output/local` 命中 `.gitignore:8 release-output/`；`app/renderer/dist` 命中 `.gitignore:9 app/renderer/dist/`；打包前后 `git status --porcelain` 均无这两类条目（`package/git-status-after-package.txt`） |
| 日志说明 | electron-builder 输出的 `author is missed`（package.json 既有）、`asar usage is disabled`（`electron-builder.yml` 既有配置 `asar: false`）、`cannot find path for dependency …undefined`（依赖搜索噪声）均为既有打包日志特征；EXIT=0、zip 正常产出 |

### 7.2 三平台 release 冒烟替代说明（写入记录）

方案 §5 B7 门槛原文要求三平台 release 冒烟。发布 recipe（`.github/workflows/release.yml` → `src/common/装配/release-prepare.mjs`）以**冻结源 tag `v2.0.0`**（`src/common/装配/release-policy.mjs`: `SOURCE_REF = 'v2.0.0'`、`SOURCE_SHA = 752953cf…`）+ **显式 overlay** 为唯一构建源；同文件 `selectOverlay()` 对未列入白名单的 `app/`/`src/` 变更直接抛
`Unreviewed production overlay: <path>`（**fail-closed**）。B7 新增的 `app/desktop/session/index.ts`、`app/desktop/session/lifecycle/**` 不在 overlay 白名单（基础集 + 各批按精确路径列名），因此以本分支触发 release workflow 会在 prepare 阶段 fail-closed——**这是发布策略的正确行为，不是 B7 缺陷**。

因此本轮以**本地 Windows 打包冒烟**为替代（§7.1，EXIT=0 且产物包含重构后代码）；macOS/三平台验证在重构完成后以**新 tag 的正式发布 CI**（三平台 native runner + `release-verify.mjs` + 三 zip 校验）完成。

## 8. 最终结构与预算

终检证据：`segment3/final-check/final-checks.txt`（`wc -l` / sha256 / 预算常量 / git status / 构建产物 / check-ignore）。

| 项 | 实测 | 预算 | 结论 |
| --- | ---: | ---: | --- |
| `app/desktop/session.ts`（barrel） | **30 行** | ≤50 | ✅ |
| `app/desktop/session/index.ts`（门面） | **790 行** | ≤800 | ✅ |
| `app/desktop/session/**/*.ts` 单模块最大 | **1,477 行**（`cards/cards.ts`；其次 `lifecycle/open.ts` 1,430） | ≤1,500 | ✅ |
| 导出面 | **51 = 运行时 6 + 类型 45**（全量运行中结构测试「导出面·运行时层/类型层」✔） | 51 逐字不变 | ✅ |
| 7 角色工具面快照 | **全过**（`chief 22 / product 14 / rapporteur 15 / nominator 19 / convener 17 / verifier 14 / implementer 12`，工具名+顺序与冻结清单逐字一致；另「捕获稳定」用例两次独立捕获逐字相同） | R7 | ✅ |
| 导入图 | 无环 + 分层/白名单（结构测试「模块边界·真实扫描」「规则引擎自测」✔） | 无环 | ✅ |
| sha256 | `session.ts` `120921f7…c130f4`；`session/index.ts` `308ab5c8…cb2374`（全文见 `final-check/final-checks.txt`） | — | — |

全量运行中 `session-structure.test.ts` **8/8 全绿**（逐名：导出面运行时层、导出面类型层、模块边界真实扫描、模块边界规则引擎自测、体量预算 barrel、体量预算 session/**+index、工具面快照·与冻结清单一致、工具面快照·捕获稳定）；
`session-source.test.ts` **5/5 全绿**（含 `readSessionModule("lifecycle/send")` 顺序钉的聚合读取基础）。

## 9. 终检

- **结构预算**：barrel **30**（≤50）、`session/index.ts` **790**（≤800）、`session/**` 单模块最大 **1,477**（≤1,500）——`final-check/final-checks.txt`。
- **导出面/工具面**：**51 导出**（运行时 6 + 类型 45）与 **7 角色工具面快照**在**全量运行**的 `session-structure.test.ts` **8/8** 通过（含运行时键集合、类型元组、无环/分层、预算、工具面×2）；`session-source.test.ts` 5/5。
- **类型**：`npm run typecheck` **EXIT=0**；`npm run typecheck:renderer` **EXIT=0**（`final-check/typecheck.log`、`typecheck-renderer.log`）。
- **git status（最终，`final-check/final-checks.txt`）**：仅允许路径——
  修改：`app/desktop/session.ts`、`app/desktop/session/contracts/ports.ts`、`test/桌面应用/operator-channel.test.ts`、`test/桌面应用/session-structure.test.ts`；
  新增：`app/desktop/session/index.ts`、`app/desktop/session/lifecycle/`，以及三方记录/证据（桌面窗口三份记录 + 两份 evidence 目录；测试角色 operator-pins 记录）。
  **无**临时目录、junction、构建产物落入 git。
- **第三段补记（i18n 解决后）**：测试角色写区新增 `test/项目管理/shared/i18n-guard-allowlist.ts`
  （+87 纯新增；scanner/断言零改动）与 `角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b7-i18n-guard-allowlist.md`；
  其余路径不变（仍无临时目录/junction/构建产物入库）。
- **测试产物清理**：全量运行期间 `git-role-workflows-e2e` 写入仓库的
  `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`（197→329 MB 测试产物，运行前不存在）已在运行后删除，清理后 `git status` 复核如上。
- **对比工作树移除**：干净 e37da80 detached 对照树（`C:/Users/51054/AppData/Local/Temp/b7-e37da80-contrast`，用于 i18n 守卫对照）已 `git worktree remove`；`git worktree list` 不再列出、目录 absent。
- **环境约束**：未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；9222/9223/9224 无监听（netstat 复核）；未启动 Electron/真实模型（打包仅构建；所有测试均为 demo/假运行时、无真实模型请求）。

## 10. 偏差与披露

- 全量口径：分段 + `--test-force-exit`（仅退出兜底）+ 拆分两个历史登记挂起文件（与 B0/B8 同口径，如实披露；CI 权威命令不变）。
- 门禁段 CRLF/LF 归一及还原（口径同 B0）；还原后状态/CRLF 复核为空/正确。
- 桌面应用段 2 条 120s 取消（`关闭全部与双角色刷新扫描交接…`、`C-04 decision 开关开启…`）与基线同名；属本环境既有耗时行为。
- 测试/编排段的现场披露：测试段 711/652/40/1/18（基线 711/651/41/1/18）——基线中 `git-action-delivery-claude-e2e.test.ts`
  的**文件级原生断言取消未复现**（该文件本轮 78s 正常通过），为唯一计数差异来源（§4.3）；编排段 139s 与 B0 完全相同，
  `git-trunk-store` 独立 57s/13/13（本环境历史挂起/原生崩溃未复现，与 B0 同款披露）。
- i18n 守卫 ADDED：见 §4.4（含「第三段补记（i18n 守卫裁决与解决）」——**Option A 已解决，对 B0 ADDED 归零**；
  本段运行期未改测试，补记阶段的 allowlist 修改属测试角色写区）。

## 11. 证据索引（`…_facade-barrel_evidence/segment3/`）

| 路径 | 内容 |
| --- | --- |
| `full/segments-summary.txt` / `full/segment-*.tap` | 15 段逐段汇总与原始 TAP |
| `full/merged.json` / `full/failnames.txt` | 全量合并计数与唯一失败名 |
| `full/b0-frozen-failnames-191.txt` / `full/b0-frozen-merged.json` / `full/b0-frozen-name-to-segment.tsv` | B0 冻结基线（名单/分段统计/名→段映射） |
| `full/failname-diff.json` | 本次 vs B0 基线逐名 diff（ADDED/REMOVED/both） |
| `full/segment-compare.json` | 逐段计数与失败名对照 |
| `full/git-status-before.txt` / `full/git-status-after-run.txt` | 全量运行前后 `git status --porcelain`（最终态另见 `final-check/final-checks.txt`） |
| `full/gates-resources-status.txt` / `full/gates-resources-crlf-check.txt` | 门禁资源还原状态与 CRLF 复核 |
| `knownred/*-33/5/24.txt` / `knownred/*-diff.json` | 三套冻结名单与逐名 diff |
| `knownred/i18n-guard-*.log` / `knownred/i18n-violations-*.txt` | i18n 守卫 ADDED 判定证据（3 次复跑、e37da80 对照、violation 清单与差集） |
| `chain/*.log` / `chain/chain-summary.txt` / `chain/baseline-second-segment.txt` | 桌面全链四目标定向复跑与基线 |
| `package/package-local.log` / `package/artifact-listing.txt` / `package/sha256sums.txt` / `package/zip-listing.txt` | 打包冒烟命令输出、产物清单、哈希与 zip 内容核验 |
| `final-check/final-checks.txt` / `final-check/typecheck*.log` | 终检（行数/哈希/预算/git status/构建产物/类型） |
| `tools/*.sh` / `tools/*.mjs` | 可复现脚本（分段执行、合并、known-red diff、全量 diff、逐段对照、终检） |
