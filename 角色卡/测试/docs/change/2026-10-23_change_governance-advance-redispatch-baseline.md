# 基线记录：治理写卡推进的可重入门禁闭环（T3）实施前基线

- **任务 ID**：`2026-10-23-governance-advance-redispatch`（产品 flowId `governance-advance-redispatch`）
- **记录角色**：测试（Testing worker，独立角色上下文）
- **执行者**：测试角色（本记录及全部原始日志均由测试角色执行产生）
- **日期**：2026-10-23
- **阶段**：S2「标准 + 基线」中的基线部分（团队计划 §5.1 S2、§6.2「测试」、§6.3）
- **风险档位**：**T3（治理行为与 flow 状态变更）**
- **状态**：**基线（baseline-recorded）**；未实施、未验收；本记录只陈述实施前实测，不构成任何验收结论
- **授权依据**：
  - 客户闸门 0/1/2 与实施授权：`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`
  - 团队计划：`docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md` §1.4、§5.1 S2、§6.2、§6.3、§9
  - 人事补登边界条目：`角色卡/编排/boundary.md` 新增 `src/pipeline/orchestration/flow-state.ts` 单文件条目（Markdown/YAML 漂移校正；`角色卡/编排/changelog.md` 有记录）
- **基线身份**：分支 `main`，HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a834f31588797016d6ee2289a4ac3e97b`）
- **工作树前提**：当前工作树已包含此前变更的既有上下文——i18n B0/B1–B4 key 契约、目录 v3，以及人事补登的 `角色卡/编排/boundary.md` `flow-state.ts` 条目。**本变更的实施尚未开始**：`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts` 均与 HEAD 一致；`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`test/测试/governance-e2e-auto/*` 已带既有变更改动（见 §一）。

---

## 一、环境与工作树身份

### 1.1 环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-10-23 13:20:13 +0800 | `environment-and-target-hashes.txt` |
| OS | Windows 11 Pro 10.0.26300；`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64` | `uname -a`、`cmd /c ver` |
| Shell | Git Bash `/usr/bin/bash`，`GNU bash, version 5.3.15(2)-release` | `$BASH_VERSION` |
| 仓库 / 分支 | `C:\Users\51054\Desktop\work\ans-studio` / `main` | `pwd`、`git branch --show-current` |
| HEAD / tree | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` / `1149238a834f31588797016d6ee2289a4ac3e97b` | `git rev-parse` |
| Node PATH（默认 shell） | 不含 Node；`node`/`npm` 需显式导出 | 实测 |
| Node（执行用） | **v24.22.1**（`/c/Users/51054/AppData/Local/Programs/nodejs/node`；每条命令前 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`） | `which node`、`node --version` |
| npm | **11.19.1** | `npm --version` |
| 暂存区 | `git diff --cached --name-only` 为空 | 实测 |

### 1.2 工作树状态（基线起点）

- 已跟踪改动 42 个文件（`git diff --stat`：6,049 insertions / 312 deletions），含 i18n B0–B4、目录 v3（`src/common/编排/team-plan.ts`、`directory-conformance.ts`、门禁卡文本、运行时 core、桌面 interface/任务文案、e2e 夹具与测试）与角色文档/边界补登；**无暂存、无提交**。
- **既有上下文归属**（不纳入本变更候选）：
  - i18n：`app/desktop/preferences.ts`、`app/desktop/i18n.ts`、`app/renderer/src/i18n/`、`src/common/shared/i18n/`、`app/main.ts`、`app/preload.cjs`、渲染层设置区与对应测试等。
  - 目录 v3：`src/common/编排/team-plan.ts`、`src/common/编排/directory-conformance.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/{run-role,govern-session}.ts`、门禁卡文本、桌面 V12/任务文案、`test/{编排,测试,门禁引擎,runtime-core}/` 相关测试与夹具。
  - 人事边界校正：`角色卡/编排/boundary.md` 新增一行 `src/pipeline/orchestration/flow-state.ts`（`流程状态 YAML 契约的 Pipeline 公共出口（桌面自动验收门消费；实现同源于 src/common/编排/flow-state.ts）`），与 `boundary.yaml` 既有条目对齐；不是扩权。
- **本变更目标文件现状**：`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts` 均**未出现在 `git status` 中**，即等于 HEAD，实施未开始；`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/e2e/main.mjs`、`test/测试/governance-e2e-auto/*` 已被前序变更修改（本基线以工作区哈希为准，见 §二）。

### 1.3 基线稳定性

- 全量运行前后，47 个 `src/app/test` 改动/新增文件 SHA-256 **逐字节一致**（`worktree-hashes-start.txt` vs `worktree-hashes-end.txt`，`diff` 为空）；`git status --short -- src app test` 前后相同；无并发写入混入本基线。

---

## 二、目标文件起始哈希（写前基线）

| 文件 | `git hash-object` | `sha256sum` | 大小 |
| --- | --- | --- | --- |
| `app/desktop/interface.ts` | `61e91311207c739d560d308577135c2205feffb8` | `1f580f0f5ba5431461fbd451034ab95314651f47a4b9d7a4fc3e39548c305ed4` | 275,347 B |
| `app/desktop/governance-advance.ts` | `8f90a7138a2742509c484e5c856b26497878c3e7` | `90dbfbd1cb32474b8687d11e02cbe507f1c8773f57af8e1e7bd6499975e4bb90` | 78,182 B |
| `src/common/编排/flow-service.ts` | `cdba51754e73e4d39bfbdedea7ecc788a05e76e8` | `6808144984231aa7e57f650201734c3ee00da2d9abb809682cd006344bb588b7` | 39,767 B |
| `src/pipeline/orchestration/flow-state.ts` | `2a32991ceab908ece10bbead248f4cd9849d8084` | `5d9c0bd3b4ae7bbe0b80a1eefea77017e62a22c84276eb53f88be837861652e6` | 1,405 B |
| `test/桌面应用/interface.test.ts` | `3e3b9083f646aaf0d5925d1915ab9408fd6fc842` | `45cec1f88f0a8fc3cca47443f45fea93898faf500d21bd0b1891dbf204711242` | 289,104 B |
| `test/桌面应用/acceptance-dispatch.test.ts` | `0b4a1ca63425cf6fdec3323d53add34a5234ea10` | `c87341ec7c76864c86d0be88b618c7e16d370df09041e19ab0fa3b34a9eb1149` | 110,739 B |
| `test/编排/flow-service.test.ts` | `9bdbe3de063a0cada0bae3e0158fefc719dfe38b` | `4df55487d246d626cefe5c77288c7e83467d771bef98a5dcaaa211f0d16f43f0` | 47,088 B |

> 原始输出：`2026-10-23-governance-advance-redispatch-baseline-evidence/environment-and-target-hashes.txt`。
> 候选阶段只应包含相对本表（及工作区起始哈希）变化的路径；前序 i18n/目录 v3 改动声明为「既有上下文」，不纳入本变更候选，也不为其背书。

---

## 三、类型检查

| # | 命令 | 退出码 | 错误数 | 开始/结束（本地） | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | **0**（`grep -c "error TS"` = 0） | 13:20:26 → 13:20:27 | `typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | **0**（`grep -c "error TS"` = 0） | 13:20:27 → 13:20:28 | `typecheck-renderer.log` |

---

## 四、受影响套件基线

> 命令在仓库根、按 §1.1 的 PATH/Node 执行，逐命令单独日志（含命令、起止时间、`exit_code=`）。

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | 耗时（Node 自报） | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test test/编排/flow-service.test.ts` | **0** | 24 | 24 | 0 | 0 | 0 | 553.8 ms | `directed-flow-service.log` |
| 2 | `node --test test/桌面应用/interface.test.ts` | **0** | 105 | 105 | 0 | 0 | 0 | 12,580.6 ms | `directed-desktop-interface.log` |
| 3 | `node --test test/桌面应用/acceptance-dispatch.test.ts` | **0** | 36 | 36 | 0 | 0 | 0 | 17,448.5 ms | `directed-acceptance-dispatch.log` |
| 4 | `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | **0** | 123 | 123 | 0 | 0 | 0 | 11,417.8 ms | `directed-governance-e2e-auto.log` |

**合计：288 tests / 288 pass / 0 fail / 0 skipped / 0 todo；4/4 命令退出码 0。** 无失败、无跳过、无 N/A；四个路径/目录均存在。

---

## 五、T3 串行全量基线（排除已知挂起文件）

### 5.1 命令与文件数

| 项 | 值 |
| --- | --- |
| 命令（实际） | `mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"`（单次 Node 进程、串行） |
| 文件清单 | `full-regression-excluded-file-list.txt`：`find test -name '*.test.ts' ! -path 'test/pi-adapter/write-sequencing.test.ts' \| sort` → **355 个文件**（全部 `.test.ts` 356 个，排除 1 个） |
| 排除文件 | `test/pi-adapter/write-sequencing.test.ts`（3 个 `test()`） |
| 排除理由 | **已知挂起**：该文件 3 个用例打印 `✔` 后进程不退出；2026-10-22 基线、2026-10-23 首轮 T3 基线均复现（本报告为第三次基线沿用排除） |
| 运行方式 | 后台运行并轮询，未提前杀进程；本轮未再出现其他挂起 |
| 原始日志 | `full-regression-serial-excluding-write-sequencing.log`；分类/差额 `full-regression-summary.txt` |

### 5.2 结果

| 指标 | 值 |
| --- | --- |
| 退出码 | **1** |
| tests / pass / fail / skipped / todo / cancelled | **3661 / 3633 / 10 / 18 / 0 / 0** |
| 耗时 | **298 s**（Node 自报 `duration_ms` 297,688.2） |
| 开始 / 结束 | 2026-10-23 13:21:35 / 13:26:33 |

### 5.3 失败分类（10 项）

- **(A) 既有 Windows symlink `EPERM`：9 项**——与历史清单逐条一致（claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core 2、file-write-safety 1、g4-skill-verify 1、编排 `shell-authorized-routine` 1），错误均为 `EPERM: operation not permitted, symlink ...`（`errno -4048`）。本轮在当前工作树完整复验全部 9 项。
- **(B) 桌面时序偶发：1 项**——`test/桌面应用/interface.test.ts:5223`「2026-10-23 V12 v3：existing 宽边界只 warning + 迁移提示、不强制重写，仍派 readiness」：`AssertionError: readiness 派发入账`，actual 0 / expected 1（`waitForTest` 已观察到 Convener 发送，但随后立即读取账本时 `dispatch.accepted` 尚未可见）。
  - 隔离复跑：run1（`full-regression-isolation-interface-run1.log`）**104/105**，失败换为同族兄弟用例「2026-10-22 v2 团队计划：读取模块清单/v2 字段/并行组；计划写集被 boundary 覆盖 ⇒ 派 readiness…」；run2（`...-run2.log`）**105/105 全绿**。
  - **家族观察**：跨两轮基线共 4 次偶发，失败用例在 `interface.test.ts` 的 readiness/ledger 兄弟用例间随机切换（「第 5 项迁移策略」「V12 existing」「V12 v3」「v2 团队计划」），均为「已观察到 Convener 发送 → 立即断言账本计数」；整文件复跑均转绿。判定为**非确定性桌面时序偶发**，不是产品断言缺陷，也不是本变更确定性新增失败。
  - **保留提示**：`test/桌面应用/interface.test.ts` 在本变更写集内；建议桌面窗口 owner 在实施时评估把该族断言改为等待账本本身（而非仅等待发送），以稳定终验。本角色不改测试断言。
- **跳过 18 项**：与历史清单逐条一致（codex-adapter 1、pi-adapter 1、runtime-core `file-write-safety` 4、`lightweight-permission-repairs` 6、门禁引擎 `pin-evidence` 1、`test/项目管理/shared/atomic-write` 5），无新增 skip/todo。

### 5.4 与上一轮最终基线的对照

| 基线 | 文件数 | tests | pass | fail | skipped | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 上一轮最终（目录 v3 终验，团队计划 §1.4） | 355 | 3655 | 3628 | 9 | 18 | 9 项均为 Windows symlink EPERM |
| **本轮（S2 实测，B0–B4 + 目录 v3 + 人事边界补登工作树）** | **355** | **3661** | **3633** | **10** | **18** | 9 EPERM + 1 桌面时序偶发；exit 1 |

**差额核对**：文件数不变（355），tests **+6**（`3655 + 6 = 3661`）——与统筹预期的「i18n key 契约新增 6 个共享测试」完全一致，未发现其他测试新增/删除；pass **+5**（`3628 + 6 - 1` 偶发 `= 3633`）；fail 9 → 10 仅因该 1 次偶发；skip 保持 18。**除 9 项 EPERM 与 1 次桌面时序偶发外，无其他失败。**

---

## 六、基线结论（B0–B4 + 目录 v3 工作树、本变更实施前）

1. **基线可用**：typecheck ×2 全 0；4 个受影响套件 288/288 全绿；T3 串行全量（排除 `write-sequencing.test.ts`）3661 / 3633 / 10 / 18 / 0，确定性失败仅 9 项既有 Windows symlink `EPERM`；无本变更确定性新增失败（本变更尚未实施）。
2. **与上一轮差异已解释**：+6 tests 恰为 i18n key 契约新增共享测试；+1 fail 为 1 次桌面时序偶发（readiness/ledger 兄弟用例随机切换，整文件复跑全绿），需在终验时按同一隔离流程分类，不得记作新增红，也不得笼统归为「环境问题」。
3. **排除项**：`test/pi-adapter/write-sequencing.test.ts`（3 例）不纳入计数，理由为已知挂起（三次基线复现）；S5 终验仍按同一处置并在终验报告列明。
4. **候选隔离**：本变更目标文件起始哈希见 §二；`flow-service.ts`/`flow-state.ts`/`flow-service.test.ts` 与 HEAD 一致（未实施）；`interface.ts`/`governance-advance.ts`/`interface.test.ts`/`acceptance-dispatch.test.ts`/e2e/`governance-e2e-auto/*` 的既有改动为前序上下文，候选只应包含相对本基线的本变更 hunk。
5. **终验口径**：S5 只对「相对本基线的新增确定性失败」负责；既有 `EPERM`、18 项平台跳过、桌面时序偶发、`write-sequencing` 挂起必须分别列示。
6. 本基线不评价 i18n/目录 v3 的正确性（各自验收归其变更），也不宣布本变更或任何变更验收通过。

---

## 七、证据边界声明

- **未启用 task_ops**；不伪造任务令牌、锁、审批或机器预检记录。
- **不声称验收通过**：本记录是 S2 实施前基线，不是候选、不是验收报告。
- **未改产品/测试源码**：工作树 47 个 `src/app/test` 改动/新增文件在运行前后 SHA-256 逐字节一致；未修改任何断言；未新建 `test/桌面应用/` 文件。
- **未使用真实 `.env`/凭据**：测试使用仓库既有夹具/临时目录。
- **未 commit/push/合并/发布**；无暂存。
- **写入边界**：只写 `角色卡/测试/docs/change/`（本记录与 `2026-10-23-governance-advance-redispatch-baseline-evidence/`），符合测试角色 Section 1。
- **并发上下文**：工作树中的 i18n B0–B4、目录 v3、人事 `boundary.md`/`changelog.md` 补登均为他角色既有产物，非本角色写入，不纳入本变更候选。

---

## 八、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment-and-target-hashes.txt` | 环境事实、HEAD/tree、`git status`/`diff` 摘要、7 个目标文件 `git hash-object` + `sha256sum` + 大小 |
| `worktree-start.txt` / `worktree-end.txt` | 基线起点/终点的 `src app test` 状态快照 |
| `worktree-hashes-start.txt` / `worktree-hashes-end.txt` | 47 个改动/新增文件 SHA-256（前后逐字节一致） |
| `typecheck.log` / `typecheck-renderer.log` | 两条类型检查原始输出（含起止时间、`exit_code=`） |
| `directed-flow-service.log` | `test/编排/flow-service.test.ts` 原始输出（24/24） |
| `directed-desktop-interface.log` | `test/桌面应用/interface.test.ts` 原始输出（105/105） |
| `directed-acceptance-dispatch.log` | `test/桌面应用/acceptance-dispatch.test.ts` 原始输出（36/36） |
| `directed-governance-e2e-auto.log` | `test/测试/governance-e2e-auto/**/*.test.ts` 原始输出（123/123） |
| `full-regression-excluded-file-list.txt` | T3 全量清单（355 个文件，排除 `write-sequencing.test.ts`） |
| `full-regression-serial-excluding-write-sequencing.log` | T3 串行全量原始 stdout/stderr（3661/3633/10/18/0；exit 1；298 s） |
| `full-regression-summary.txt` | 计数、10 失败分类、18 跳过、与上一轮最终基线差额核对 |
| `full-regression-isolation-interface-run1.log` / `-run2.log` | 桌面时序偶发的整文件隔离复跑（104/105、105/105） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |

---

**状态再次声明**：本文件是实施前基线记录（baseline-recorded），不是候选、不是验收报告；不宣布验收通过；未 commit、未 push、未合并、未发布；未改产品/测试源码。
