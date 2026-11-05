# 变更记录：治理权力矩阵 B0 基线（2026-11-05）— 状态：已记录（实施前）

- 任务 ID：`2026-11-05-governance-authority-matrix`
- 节点：**B0 基线**（实施前；入口条件按团队计划 §1.4/§5.3：闸门 2 + 实施授权（IA）已确认，分支已更新到当时 `origin/main`）
- 角色：测试（独立固定工作上下文；按 `角色卡/测试/role-card.md` 与 `boundary.md` Section 1 工作）
- 日期：2026-11-05
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；未切换目录）
- 纪律：**只写本文件**；只跑只读/构建类命令（`git` 只读、`npm run typecheck`、`node --test`）；未 commit/push/暂存；未改代码/测试/角色卡/边界/其他文件；未启动应用、未跑 E2E。
- 性质：本文件是测试角色 B0 基线记录，不是验收结论，不授权提交/推送/合并/发布。

---

## 1. 候选与环境（全部实测）

| 项 | 实测值 |
| --- | --- |
| 分支 | `feat/governance-authority-matrix` |
| `git rev-parse HEAD` | `7ba8a331f9827122e08f6f9740f0fbc341c6df6c`（`Merge pull request #64 from wangzhongren/fix/vca-baseline-binding`） |
| 本地 `origin/main` | `7ba8a331f9827122e08f6f9740f0fbc341c6df6c`（与 HEAD 相同） |
| `git log --oneline origin/main..HEAD` | 空（分支 tip = 本地 `origin/main`，无领先提交） |
| 最近 3 个提交 | `7ba8a33` Merge PR #64；`b5b21d1` fix(trunk): 存量项目 VCA 基线绑定与决定回执；`7b48cff` Merge PR #63 feat/trunk-amendment-model |
| 包版本 | `ans-cli@1.9.2`；`engines.node >=23.6` |
| Node | `v24.22.1`（`process.platform=win32`、`process.arch=x64`） |
| npm | `11.19.1` |
| OS / Shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300`，MSYS `3.6.10`，x86_64）；Git Bash |
| `node_modules` | **已安装**：顶层 377 项，`node_modules/.package-lock.json` 存在；本轮未重新 `npm ci`（沿用现有安装；typecheck 与全部测试实际运行通过，证明依赖可加载） |
| 任务配置 | 无 `.ans/project.json`（未启用 task_ops；`.ans/sessions/` 为应用运行数据，未触碰） |
| 测试 runner | `package.json` **无 `test` 脚本**；runner 为 `node --test`（Node 24 原生 TS） |

**命令口径说明：** Node 24 的 `node --test test/<目录>` 会把目录当作模块加载并报 `MODULE_NOT_FOUND`（本轮实测，如 `test/claude-adapter`）；实际命令使用仓库既有口径：目录 **glob**（如 `"test/门禁引擎/**/*.test.ts"`）与 pi-adapter 的**显式文件清单**。

---

## 2. 工作树状态（如实披露）

### 2.1 开工快照（早于 09:43，`git status --porcelain`）

共 **39 项 = 4 个已跟踪修改 + 35 个未跟踪文件**；**属于本特性的产品/测试改动 = 0**。

已跟踪修改（4，均为角色 memo，非产品/测试）：

```text
 M docs/planning/memo.md
 M 角色卡/桌面窗口/memo.md
 M 角色卡/编排/memo.md
 M 角色卡/运行时核心/memo.md
```

未跟踪文件（35）：

| 类别 | 数量 | 文件 |
| --- | --- | --- |
| 仓库根临时/PR 文件 | 14 | `.commit-msg-trunk.txt`、`.commit-msg-vca.txt`、`.pr-body-trunk.md`、`.pr-body-vca.md`、`.tmp-app-shot.jpeg`、`.tmp-app-shot2.jpeg`、`.tmp-append-b11.mjs`、`.tmp-append-g11-note.mjs`、`.tmp-append-stable-freeze-decision.mjs`、`.tmp-append-stable-write-ruling.mjs`、`.tmp-check-panel.mjs`、`.tmp-copy-gates.mjs`、`.tmp-repair-vc1-baseline.mjs`、`.tmp-shot.mjs` |
| `docs/acceptance/`（trunk 在途） | 2 | `trunk-amendment-model-criteria-v1.md`、`trunk-amendment-model-report-v1.md` |
| `docs/communication/` | 10 | `2026-11-04_authorization_trunk-amendment-ia.md`、`2026-11-04_gate1_trunk-amendment-model.md`、`2026-11-04_gate2-addendum_trunk-amendment-B5-B10.md`、`2026-11-04_gate2_trunk-amendment-model.md`、`2026-11-04_intent-change_freeze-and-refactor-ownership.md`、`2026-11-04_intent_trunk-amendment-model.md`、`2026-11-05_authorization_trunk-amendment-merge.md`、`2026-11-05_defect_vca-baseline-binding.md`、`2026-11-05_gate_closure_batch-3.5.md`、`2026-11-05_intent_governance-authority-matrix.md` |
| `docs/planning/` | 4 | `2026-11-04_design_trunk-amendment-model.md`、`2026-11-04_review_trunk-amendment-model.md`、`2026-11-04_trunk-amendment-p1.5R-consistency.md`、`2026-11-05_design_governance-authority-matrix.md` |
| `docs/scheduling/` | 5 | `2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md`、`2026-11-04_team-plan_trunk-amendment-model.md`、`2026-11-05_team-plan_governance-authority-matrix.md`、`trunk-amendment-model-change-v1.md`、`trunk-amendment-model-change-v2.md` |

以上均为**既有管理文档/在途工作产物**，`src/`、`app/`、`test/` 下无任何改动。

### 2.2 B0 期间并发落盘（其他角色，非本角色；未触碰）

B0 运行期间，其他固定角色上下文先后在**同一 worktree** 写入管理产物（均不在 `src/ app/ test/` 内，不改变代码/测试候选）：

| 时间（+08:00，mtime 实测） | 文件 | 性质 |
| --- | --- | --- |
| 09:43:07 | `角色卡/门禁引擎/changelog.md`（M，+4） | H1：B-1/B-2 边界变更记录 |
| 09:44:05–09:44:06 | `角色卡/门禁引擎/boundary.md`（M，+4/-2）、`boundary.yaml`（M，+8/-2） | H1：Section 1 新增 `src/model/governance-matrix.ts`（B-1）与 `src/service/governance-matrix/`（B-2）；职责不变、无权限扩大（diff 已只读核对） |
| 09:46:00 | `docs/acceptance/governance-authority-matrix-criteria-v1.md`（??，327 行 / `f6720528…`） | V1：内置独立验收的实施前标准 |

- 门禁引擎套件（09:44 之后）与 T3 全量（09:45:56 起）均在 **H1 落盘后**运行；H1 为治理文档变更，测试结果不受影响（门禁引擎套件 0 fail）。
- 本 B0 的代码/测试候选仍是 **HEAD `7ba8a33` 的 `src/ app/ test/` 内容**（未变）。

### 2.3 干净性实测（三次，均空）

| 时点 | `git status --porcelain -- src app test` | `git diff --cached --name-only` | HEAD |
| --- | --- | --- | --- |
| B0 开工（typecheck 前） | 空 | 空 | `7ba8a33` |
| T3 运行前 | 空 | 空 | `7ba8a33` |
| T3 运行后 | 空 | 空 | `7ba8a33` |

- 本 B0 文件写入后，工作树新增的唯一本角色文件即本文件（`角色卡/测试/docs/change/2026-11-05_governance-authority-matrix-B0-baseline.md`）。

---

## 3. 静态门

| 命令 | exit | 输出摘要 |
| --- | --- | --- |
| `npm run typecheck` | **0** | `> ans-cli@1.9.2 typecheck` → `> tsc --noEmit`；无诊断输出 |

- `typecheck:renderer` / `build:renderer`：按团队计划 §1.2，本特性不改 `app/renderer/**`，默认 **N/A（未执行）**；若实施证明触达渲染面，按计划停止回报并补测。
- typecheck 在 H1（09:44:06）之后运行，覆盖的仍是 `src/` 代码候选（H1 只改治理文档）。

---

## 4. 受影响套件基线（实施前，逐组实测）

### 4.1 命令与文件

六组目录共 **215 个 `.test.ts`**；按仓库既有口径 **排除已知挂起** `test/pi-adapter/write-sequencing.test.ts`（40 → 39），实际运行 **214 个文件**。

| 套件 | 目录内文件数 | 实际运行文件数 | 命令 |
| --- | --- | --- | --- |
| 门禁引擎 | 34 | 34 | `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"` |
| runtime-core | 47 | 47 | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` |
| 编排 | 79 | 79 | `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` |
| pi-adapter | 40 | **39** | `node --test --test-concurrency=1 <39 个显式文件>`（排除 `write-sequencing.test.ts`；清单见附录 A） |
| claude-adapter | 5 | 5 | `node --test --test-concurrency=1 "test/claude-adapter/**/*.test.ts"` |
| codex-adapter | 10 | 10 | `node --test --test-concurrency=1 "test/codex-adapter/**/*.test.ts"` |

### 4.2 结果

| 套件 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 门禁引擎 | **0** | 312 | 311 | 0 | 0 | 1 | 0 | 5,338.9 |
| runtime-core | 1 | 370 | 363 | 3 | 0 | 4 | 0 | 31,735.9 |
| 编排 | 1 | 905 | 904 | 1 | 0 | 0 | 0 | 21,298.5 |
| pi-adapter（39 文件） | 1 | 336 | 333 | 2 | 0 | 1 | 0 | 32,214.3 |
| claude-adapter | 1 | 90 | 89 | 1 | 0 | 0 | 0 | 7,817.4 |
| codex-adapter | 1 | 97 | 95 | 1 | 0 | 1 | 0 | 8,300.0 |
| **合计** | — | **2,110** | **2,095** | **8** | **0** | **7** | **0** | — |

失败 8 项（全部为既有 Windows symlink `EPERM`，分类证据见 §5.4）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

> 受影响套件在 T3 之前顺序执行；逐组起止时刻未单独记录，时长以上表 `duration_ms` 为准。

---

## 5. T3 全量基线

### 5.1 口径与文件集

- 命令：`node --test --test-concurrency=1`（串行）。
- 文件集：`find test -name "*.test.ts"` 实测 **448** 个；**排除** `test/pi-adapter/write-sequencing.test.ts`（既有已知挂起：3 个 `test()` 打印 ✔ 后进程不退出）→ **447 个**。
- 排除依据（仓库既有验收标准，本轮实读）：
  - `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98`（存在已知挂起测试，T3 全量须排除并记录可复现的排除方式，不得把挂起当通过）；
  - 同文件 `:162`、`:604`（全量命令须显式排除并记录；`skip`/`todo` 不计通过）。
  - **排除项未运行、未验证**，不得计为通过。
- 组成：10 个目录 glob（408 文件）+ pi-adapter 39 个显式文件 = **447**；覆盖校验（静态计数）：`5 + 10 + 47 + 57 + 59 + 95 + 79 + 11 + 34 + 11 = 408`，`408 + 39 = 447`，与 448 − 1 一致，无重复/遗漏。
- 实际命令形态（完整 pi 清单见附录 A）：

```text
node --test --test-concurrency=1 \
  "test/claude-adapter/**/*.test.ts" "test/codex-adapter/**/*.test.ts" \
  "test/runtime-core/**/*.test.ts" "test/桌面UI/**/*.test.ts" \
  "test/桌面应用/**/*.test.ts" "test/测试/**/*.test.ts" \
  "test/编排/**/*.test.ts" "test/装配/**/*.test.ts" \
  "test/门禁引擎/**/*.test.ts" "test/项目管理/**/*.test.ts" \
  <test/pi-adapter 的 39 个显式 .test.ts 文件>
```

### 5.2 运行窗口与结果

| 项 | 值 |
| --- | --- |
| 窗口（`date -Iseconds`） | **2026-11-05T09:45:56+08:00 → 2026-11-05T09:50:34+08:00**（约 4 分 38 秒） |
| `duration_ms` | 277,690.9 |
| exit | **1**（由 9 项既有环境失败解释） |
| tests | **4,033** |
| pass | **4,006** |
| fail | **9** |
| cancelled | 0 |
| skipped | **18** |
| todo | 0 |
| 文件数 | 447（448 − 1 排除） |

### 5.3 失败清单（9 项，逐名）

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

### 5.4 失败分类证据（错误码实测）

对上述 9 项所在 7 个文件单独复跑（`node --test --test-concurrency=1`，141 tests / 127 pass / 9 fail / 5 skipped，exit 1），**9/9 均输出同一类错误**：

```text
Error: EPERM: operation not permitted, symlink '<temp 源>' -> '<temp 目标>'
    errno: -4048,
    code: 'EPERM',
    syscall: 'symlink',
```

- 结论：**9 项全部为既有 Windows 环境失败（创建符号链接无权限，symlink EPERM）**，不是候选缺陷、不是确定性产品失败。
- `skipped = 18`：与最近记录的全量基线计数一致（既有平台条件跳过）；本轮未逐项重采跳过原因，作为**基线值 18** 记录；实施后不得新增 skip。

### 5.5 与最近记录的差异对照（仅作上下文，不作为本 B0 证据）

| 基线 | HEAD | 文件 | tests | pass | fail | skip |
| --- | --- | --- | --- | --- | --- | --- |
| 最近记录（trunk-amendment change-v1） | `89b1fb2` | 446 | 4,006 | 3,979 | 9 | 18 |
| **本 B0（实测）** | **`7ba8a33`** | **447** | **4,033** | **4,006** | **9** | **18** |
| 差异 | +1 提交（VCA 基线修复合并） | +1 | +27 | +27 | 0 | 0 |

差异与 `7ba8a33` 上的增量提交（`b5b21d1` VCA 基线绑定修复）一致：+1 文件 / +27 tests，失败与跳过集合不变。以上旧数值仅用于核对增量方向，**本 B0 的判据以 §5.2–§5.4 本轮实测为准**。

---

## 6. 失败分类与实施后判据

### 6.1 基线既有失败名单（实施后对照用）

**既有失败名单 = §5.3 的 9 项**，按「测试名 + 文件:行」记录；全部归类为**既有 Windows symlink EPERM（环境）**。

**基线确定性失败名单 = 空**（本轮未出现任何非 EPERM、非平台条件的失败）。

### 6.2 实施后 T3 判据

1. **新增确定性失败 = 0**：实施后 T3 全量的失败集合必须仍是上述 9 项（同名同文件；行号可因改动漂移，按测试名比对）；出现任何其它失败，或 9 项中出现非 `EPERM/symlink` 错误，均计为新增确定性失败。
2. **新增 skip = 0**：实施后 `skipped` 必须仍为 **18**（不得新增 skip/todo 掩盖问题）。
3. **`test/pi-adapter/write-sequencing.test.ts`**：继续排除、未运行、未验证；不得写为通过。
4. 受影响六套件的基线为 §4.2；实施后按同一候选重跑并对照。
5. 失败分类不得笼统归为「环境问题」：9 项须逐名对照；新增红必须停止并回报。

---

## 7. 基线口径声明与限制

1. **本 B0 是实施后 T3 对比基线**（对应团队计划 §1.4/§6.3）：实施后的 T3 全量、受影响套件与 `npm run typecheck` 均与本记录对照。
2. **基线更新须重记**：若实施前/中分支更新到更新的 `origin/main`（或其它实现提交进入候选），必须**重记 B0**并在 E1 披露；旧证据（含本文件计数）不得复用；受影响证据随候选/契约/夹具变化失效。
3. **候选身份**：本 B0 的代码/测试候选为 HEAD `7ba8a33` 的 `src/ app/ test/` 内容（开工、T3 前、T3 后三次实测均无改动）；工作树中的 H1 边界文档（B-1/B-2）与 V1 标准为并发管理产物，已披露，不影响测试结果。
4. **证据介质限制**：按本任务单文件写入授权，原始 stdout **未落盘为独立日志**；本文件记录命令、退出码、计数、逐名失败与错误码摘要，均可按 §3–§5 命令复算。未使用截图/录屏（本特性无 UI 变更，截图非必需）。
5. **不伪装通过**：9 项 EPERM 与 `write-sequencing` 排除均如实单列；分支未 commit/push。
6. 管理记录不混入产品候选；本文件不授权提交/推送/合并/发布。

---

## 8. 证据位置与哈希索引

| 项 | 值 |
| --- | --- |
| 本文件 | `角色卡/测试/docs/change/2026-11-05_governance-authority-matrix-B0-baseline.md`（行数 / SHA-256 见交付回报；自引用哈希不稳定，不在文内固化） |
| 客户确认的方案 P1.1 | `docs/planning/2026-11-05_design_governance-authority-matrix.md`：**1,056 行 / `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6`**（与团队计划记录一致） |
| 团队计划 | `docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md`：**660 行 / `07378444cb62fc714a7cce0a492ce5a12b5b7d0a0868f4602edb0be134fc7805`** |
| 闸门 0/1/2 + IA 记录（当前） | `docs/communication/2026-11-05_intent_governance-authority-matrix.md`：**76 行 / `b8d7a18f38b86ae366f7ec1302f061bc2e478943025256161631758239eb3bbb`**（团队计划头引用的是闸门 2 前的 58 行快照 `8771b275…`；以当前 76 行为准） |
| 实施前验收标准 V1 | `docs/acceptance/governance-authority-matrix-criteria-v1.md`：**327 行 / `f672052882f4937eac69fed617c309bb6cc6d4ed0cc68f280fe280797a5f3a2f`**（B0 期间由内置独立验收写盘；只读引用） |
| T3 排除依据 | `docs/acceptance/acceptance-rework-routing-criteria-v1.md`：**961 行 / `4809963b3cd7da2d3093a386972010e9209b88283f2729d905461f5373a4a7ed`**；引用行 98 / 162 / 604 |

---

## 附录 A：pi-adapter 显式文件清单（39 个，T3 与受影响套件共用）

```text
test/pi-adapter/abort.test.ts
test/pi-adapter/compatibility-loopback.test.ts
test/pi-adapter/customer-input.test.ts
test/pi-adapter/customer-wait-end-to-end.test.ts
test/pi-adapter/diagnostics.test.ts
test/pi-adapter/dispatch-task.test.ts
test/pi-adapter/fake-adapter.test.ts
test/pi-adapter/finalize-bootstrap.test.ts
test/pi-adapter/governance-judge.test.ts
test/pi-adapter/injected-runtime.test.ts
test/pi-adapter/installed-mcp-servers.test.ts
test/pi-adapter/installed-skills-injection.test.ts
test/pi-adapter/interaction-gate.test.ts
test/pi-adapter/interactive-execution-mode.test.ts
test/pi-adapter/length-followup.test.ts
test/pi-adapter/log-noise.test.ts
test/pi-adapter/prompt-images.test.ts
test/pi-adapter/provider-config.test.ts
test/pi-adapter/real-adapter.smoke.test.ts
test/pi-adapter/real-adapter.timeout.test.ts
test/pi-adapter/reasoning-effort.test.ts
test/pi-adapter/run-shell.test.ts
test/pi-adapter/runtime-outcome.test.ts
test/pi-adapter/server-tools-wire.test.ts
test/pi-adapter/server-tools.test.ts
test/pi-adapter/session-persistence.test.ts
test/pi-adapter/settings.test.ts
test/pi-adapter/settled-once.test.ts
test/pi-adapter/shell-judge.test.ts
test/pi-adapter/shell-verdict.test.ts
test/pi-adapter/shell-wait-lifecycle.test.ts
test/pi-adapter/submit-report.test.ts
test/pi-adapter/timeout.test.ts
test/pi-adapter/tool-call-events.test.ts
test/pi-adapter/tool-display-projection.test.ts
test/pi-adapter/tool-result-images.test.ts
test/pi-adapter/tools.test.ts
test/pi-adapter/turn-last-resort.test.ts
test/pi-adapter/wire-compat-and-legacy.test.ts
```

排除：`test/pi-adapter/write-sequencing.test.ts`（已知挂起；未运行、未验证）。

---

## 附录 B：命令与退出码汇总

| # | 命令 | exit | 关键结果 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | `tsc --noEmit` 无诊断 |
| 2 | `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"` | 0 | 312/311/0/1 |
| 3 | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | 1 | 370/363/3/4 |
| 4 | `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | 1 | 905/904/1/0 |
| 5 | `node --test --test-concurrency=1 <39 个 pi-adapter 文件>` | 1 | 336/333/2/1 |
| 6 | `node --test --test-concurrency=1 "test/claude-adapter/**/*.test.ts"` | 1 | 90/89/1/0 |
| 7 | `node --test --test-concurrency=1 "test/codex-adapter/**/*.test.ts"` | 1 | 97/95/1/1 |
| 8 | `node --test --test-concurrency=1`（10 glob + 39 显式 pi；447 文件） | 1 | 4,033/4,006/9/18 |
| 9 | 9 项失败所在 7 文件复跑（错误码取证） | 1 | 141/127/9/5；9/9 `EPERM errno -4048 syscall symlink` |

（计数顺序：tests / pass / fail / skipped。）

---

# B0 v2（ebbc2fc）：实施入口重记基线（2026-11-05）

> 按 P1 审核要求与团队计划 §1.4/§5.3，在实施入口（HEAD `ebbc2fc`）重记。**v1（HEAD `7ba8a33`）全文保留不动，作为历史证据**；v1 的计数（4,033/9/18、typecheck 0）与失败清单**仅作历史参考**，**实施后 T2 以本 v2 节为准**。本节所有数字均为 2026-11-05 实测。

## v2-0. 记录信息

- 任务 ID：`2026-11-05-governance-authority-matrix`
- 角色：测试（独立固定工作上下文；按 `角色卡/测试/role-card.md` 与 `boundary.md` Section 1 工作）
- 日期：2026-11-05
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；未切换目录）
- 纪律：**只改本文件**；只跑只读/构建/测试类命令；未 commit/push/暂存；未改代码/测试/角色卡/边界/其他文件；未启动应用、未跑 E2E。
- 性质：实施前基线重记，不是验收结论，不授权提交/推送/合并/发布。

## v2-1. 候选与环境（实测）

| 项 | 实测值 |
| --- | --- |
| 分支 | `feat/governance-authority-matrix` |
| `git rev-parse HEAD` | `ebbc2fcffcc5cd1c2163db72bcfb1c03d599e3e6`（`Merge pull request #66 from wangzhongren/fix/roster-topology-rebind`） |
| 本地 `origin/main` | `ebbc2fcffcc5cd1c2163db72bcfb1c03d599e3e6`（与 HEAD 相同；`git rev-list --left-right --count origin/main...HEAD` = `0 0`） |
| 最近提交 | `ebbc2fc` Merge PR #66；`c3e50f5` fix(trunk): 名单升级时回绑 run rosterVersion 与内嵌 topology；`dc21fc1` Merge PR #65 `fix/vca-card-ux`；`928428a` fix(vca): 决策卡失败回显与「拒绝」语义修正 |
| 包版本 | `ans-cli@1.9.2`；`engines.node >=23.6` |
| Node / npm | `v24.22.1` / `11.19.1`（`process.platform=win32`、`process.arch=x64`） |
| OS / Shell | Windows 11 Pro 10.0.26300；Git Bash（MINGW64） |
| `node_modules` | **已安装**：顶层 377 项，`node_modules/.package-lock.json` 存在；本轮未重新 `npm ci`（typecheck 与全部测试实际运行通过，证明依赖可加载） |
| 任务配置 | 无 `.ans/project.json`（未启用 task_ops；`.ans/sessions/` 为应用运行数据，未触碰） |
| 测试文件集 | `find test -name "*.test.ts"` = **448**；排除 `test/pi-adapter/write-sequencing.test.ts` 后 **447**（与 v1 相同） |

## v2-2. 工作树状态

- **候选干净性**：运行前、T3 运行前、运行后三次 `git status --porcelain -- src app test` 均为空（0 条）；`git diff --cached --name-only` 为空（0 条）；HEAD 始终为 `ebbc2fc`。
- **全量 status 59 项** = 7 个已跟踪修改 + 52 个未跟踪；已跟踪修改均为管理文档（`docs/planning/memo.md`、3 份角色 memo、H1 的 `角色卡/门禁引擎/boundary.md`/`boundary.yaml`/`changelog.md`），全部在 `src/ app/ test/` 之外；未跟踪为在途管理文档/临时文件，不属产品候选。
- 本特性产品/测试改动 = 0；本节追加后，本角色的唯一改动仍是本文件（与既有 B0 v1 同文件）。

## v2-3. 静态门

| 命令 | exit | 输出摘要 |
| --- | --- | --- |
| `npm run typecheck` | **0** | `> ans-cli@1.9.2 typecheck` → `> tsc --noEmit`；无诊断输出 |

- `typecheck:renderer` / `build:renderer`：按团队计划 §1.2，本特性不改 `app/renderer/**`，默认 **N/A（未执行）**；若实施证明触达渲染面，按计划停止回报并补测。

## v2-4. 受影响六套件基线（v2 实测）

命令口径：`node --test --test-concurrency=1`；pi-adapter 用 39 个显式文件（排除 `write-sequencing.test.ts`）。运行窗口约 10:22:19 → 10:24:52（+08:00，按日志 mtime）。

| 套件 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 门禁引擎 | **0** | 312 | 311 | 0 | 0 | 1 | 0 | 5,272.5 |
| runtime-core | 1 | 370 | 363 | 3 | 0 | 4 | 0 | 30,473.0 |
| 编排 | 1 | 907 | 906 | 1 | 0 | 0 | 0 | 21,298.8 |
| pi-adapter（39 文件） | 1 | 336 | 333 | 2 | 0 | 1 | 0 | 33,899.1 |
| claude-adapter | 1 | 90 | 89 | 1 | 0 | 0 | 0 | 7,805.3 |
| codex-adapter | 1 | 97 | 95 | 1 | 0 | 1 | 0 | 8,050.6 |
| **合计** | — | **2,112** | **2,097** | **8** | **0** | **7** | **0** | — |

失败 8 项（逐名；全部为既有 Windows symlink `EPERM`）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

- **与 v1 的差异**：编排 +2 tests / +2 pass（来自 PR #66 的 `test/编排` 增量），其余五套件计数逐项相同；失败集合仍为 v1 的同一组 8 项既有 EPERM。六个失败文件均输出 `EPERM errno -4048 syscall symlink`。

## v2-5. T3 全量基线（v2 实测，权威运行）

- **命令**：见 §v2-7 第 9 条（10 个目录 glob + 39 个显式 pi-adapter 文件；`--test-concurrency=1`）。
- **文件集**：**447**（448 − 1）；覆盖校验（静态计数）：非 pi 目录 `5 + 10 + 47 + 57 + 59 + 95 + 79 + 11 + 34 + 11 = 408`，pi 显式 39 ⇒ `408 + 39 = 447`，与 `find test -name "*.test.ts"`（448）减 1 一致；11 个顶层 test 目录中，10 个由 glob 覆盖、pi-adapter 由 39 个显式文件覆盖，无重复/遗漏。
- **运行**：exit **1**；窗口约 `2026-11-05T10:25:05+08:00 → 2026-11-05T10:29:43+08:00`（以 `duration_ms` 为准）；`duration_ms` **278,025.9**。
- **计数**：**tests 4,036 / pass 4,008 / fail 10 / cancelled 0 / skipped 18 / todo 0**。
- **失败 10 项逐名与分类**：

| # | 文件:行 | 用例 | 分类 |
| --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | 既有 Windows symlink `EPERM` |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | 既有 Windows symlink `EPERM` |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | 既有 Windows symlink `EPERM` |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | 既有 Windows symlink `EPERM` |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | 既有 Windows symlink `EPERM` |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | 既有 Windows symlink `EPERM` |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | 既有 Windows symlink `EPERM` |
| 8 | `test/测试/entry-role-minimal-d.test.ts:253` | D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules） | **确定性失败（基线红）** |
| 9 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | 既有 Windows symlink `EPERM` |
| 10 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 | 既有 Windows symlink `EPERM` |

- **错误码取证**：1–7、9、10 均输出 `EPERM: operation not permitted, symlink …`（`errno: -4048`、`code: 'EPERM'`、`syscall: 'symlink'`）；#8 为 `AssertionError [ERR_ASSERTION]: D-04 撤除残留`（`deepStrictEqual` 实际命中 `src/provider/runtime/schema.ts:1486` 的 `docs/flows/` 文本，期望空数组），**非 EPERM**。单独复跑 `node --test --test-concurrency=1 "test/测试/entry-role-minimal-d.test.ts"`：6 tests / 5 pass / **1 fail** / 0 skip，复现同一断言（确定性）。
- **与 v1 的差异**：tests **4,036**（v1 4,033，+3）、pass **4,008**（+2）、fail **10**（+1）、skipped **18**（不变）。新增的 #8 确定性失败由两次合并的 VCA 工作引入（`src/provider/runtime/schema.ts` 中的 `docs/flows/` 文本命中 D-04 扫描），**不是治理权力矩阵实现产生**（本轮 `src/ app/ test/` 无任何改动）。该基线红须由对应所有者处置；治理矩阵实施不得新增其它确定性失败（见 §v2-6）。

## v2-6. 失败分类与实施后判据（v2）

1. **基线失败名单 = 本节 §v2-5 的 10 项**：9 项既有 Windows symlink `EPERM`（环境基线）+ 1 项确定性失败（D-04，基线红）。
2. **实施后新增确定性失败 = 0**：失败集合必须仍是上述 10 项（按「文件 + 测试名」逐名比对；行号可因改动漂移）；D-04 允许保持同一失败（消失属改进，不算新增）；出现任何其它失败，或既有失败形态变化（如 EPERM 变为非 EPERM），均判 T2 不通过 → 停止并回报统筹。
3. **新增 skip = 0**：`skipped` 必须仍为 **18**；`todo` 保持 0。
4. **受影响六套件**按 §v2-4 对照：8 项既有 EPERM 不变；新测试须计入实际计数（不预设总数）。
5. `test/pi-adapter/write-sequencing.test.ts` 继续**排除、未运行、未验证**，不得写为通过。
6. **风险提示**：治理矩阵 C2 会修改 `src/provider/runtime/schema.ts`；实施时不得在 `src/ app/` 新增触发 D-04 扫描的 `docs/flows/` 等字符串（否则会把 D-04 失败形态从 1 条扩大），T2 必须逐名复核该失败未变化。
7. 分类不得笼统归为「环境问题」；新增红停止并回报。

## v2-7. 命令清单与证据位置（v2）

```text
# 候选与环境
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count origin/main...HEAD
git status --porcelain -- src app test
git diff --cached --name-only
node --version && npm --version
test -d node_modules && ls node_modules | wc -l

# 1) 静态门
npm run typecheck

# 2) 门禁引擎
node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"

# 3) runtime-core
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"

# 4) 编排
node --test --test-concurrency=1 "test/编排/**/*.test.ts"

# 5) pi-adapter（39 个显式文件，排除 write-sequencing.test.ts）
node --test --test-concurrency=1 <39 个显式文件；清单与 v1 附录 A 一致>

# 6) claude-adapter
node --test --test-concurrency=1 "test/claude-adapter/**/*.test.ts"

# 7) codex-adapter
node --test --test-concurrency=1 "test/codex-adapter/**/*.test.ts"

# 8) D-04 确定性复跑
node --test --test-concurrency=1 "test/测试/entry-role-minimal-d.test.ts"

# 9) T3 全量（10 glob + 39 显式 pi）
node --test --test-concurrency=1 \
  "test/claude-adapter/**/*.test.ts" "test/codex-adapter/**/*.test.ts" \
  "test/runtime-core/**/*.test.ts" "test/桌面UI/**/*.test.ts" \
  "test/桌面应用/**/*.test.ts" "test/测试/**/*.test.ts" \
  "test/编排/**/*.test.ts" "test/装配/**/*.test.ts" \
  "test/门禁引擎/**/*.test.ts" "test/项目管理/**/*.test.ts" \
  <39 个显式 pi-adapter 文件>
```

- **证据位置**：本轮原始 stdout 存本机临时目录 `/tmp/b0v2-ebbc2fc/`（`typecheck.log`、`suite-gate.log`、`suite-runtime-core.log`、`suite-orchestration.log`、`suite-pi.log`、`suite-claude.log`、`suite-codex.log`、`t3-full.log`、`d04-rerun.log`）；临时目录不入库、不属项目候选，按上述命令可复算。
- 未使用截图/录屏（本特性无 UI 变更，截图非必需；禁止录屏规则不变）。

## v2-8. 声明与限制

1. v1 全文保留、未改写；v2 只追加。v1 计数仅历史参考，**实施后 T2 判据以 v2 为准**。
2. v2 的候选为 HEAD `ebbc2fc` 的 `src/ app/ test/` 内容（运行前后三次实测无改动）。
3. 本文件不是验收结论，不授权提交/推送/合并/发布；管理记录不混入产品候选。
4. 若实施前分支继续前进，必须再次重记 B0（重记结果覆盖本节成为比较基线）并在 E1 披露；旧证据不得复用。
5. **基线红披露**：D-04（`test/测试/entry-role-minimal-d.test.ts:253`）是 ebbc2fc 上的确定性基线失败，来源为已合并 VCA 工作对 `src/provider/runtime/schema.ts` 的描述文本；不属治理权力矩阵，须由对应所有者处理。本角色如实记录，不把它当环境失败，也不掩盖。

---

# B0 v3（0418746）：T2 判据基线（在 v2 上的基线前进；推导 + 实证）

> 按统筹指示，在 T2 前补记基线前进：HEAD 已由 B0 v2 的 `ebbc2fc` 前进到 `0418746`（PR #67）。本节**只追加**，v1/v2 全文保留；v3 是 **T2 的判据基线**。本节明确区分**实测**与**推导**：D-04 单测为实测；T3 全量计数为「v2 实测 + 单文件精确增量」的**推导**，不是重新跑全量。

## v3-0. 记录信息

- 任务 ID：`2026-11-05-governance-authority-matrix`
- 角色：测试（独立固定工作上下文）
- 日期：2026-11-05
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 纪律：本轮**只改本文件**；未 commit/push/暂存；**未 stash、未清理当前实现候选**；未跑 T2 全量（推导依据见 v3-2/v3-3）。
- 性质：实施前基线前进记录/推导，不是验收结论。

## v3-1. 候选与环境（实测）

| 项 | 实测值 |
| --- | --- |
| 分支 | `feat/governance-authority-matrix` |
| `git rev-parse HEAD` | `0418746ae9f2ed20f389c26da34ef55840febfe6`（`Merge pull request #67 from wangzhongren/fix/d04-schema-allowlist`） |
| 本地 `origin/main` | `0418746ae9f2ed20f389c26da34ef55840febfe6`（与 HEAD 相同；`git rev-list --left-right --count origin/main...HEAD` = `0 0`） |
| 最近提交 | `0418746` Merge PR #67；`4fa31c8` test(D-04): 为 VCA target kind 说明补精确语义豁免（execution 工件类别词面）；`ebbc2fc` Merge PR #66（B0 v2 基线） |
| Node / npm | `v24.22.1` / `11.19.1`（与 v2 相同，实测） |
| `node_modules` | 已安装：顶层 377 项，`node_modules/.package-lock.json` 存在（与 v2 相同，实测） |
| 工作树候选 | `git status --porcelain -- src app test` = **24 项 = 12 M + 12 ??**：12 项已跟踪修改 + 12 项未跟踪（C1a/C1b/C2/C3/C4 实现与各层测试 23 项，加本角色 T1 测试 `test/测试/governance-matrix-integration.test.ts`）。**当前工作树不是 0418746 的干净检出**，因此本轮用「提交差异推导」而非「在当前工作树重跑全量」；未清理/未 stash 候选。 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops |

## v3-2. ebbc2fc → 0418746 精确差异（实证）

命令与输出（2026-11-05 实测）：

```text
$ git diff --name-only ebbc2fc 0418746
test/测试/entry-role-minimal-d.test.ts

$ git diff --stat ebbc2fc 0418746
 test/测试/entry-role-minimal-d.test.ts | 7 +++++++
 1 file changed, 7 insertions(+)
```

- 差异**仅一个文件、7 行插入**：`test/测试/entry-role-minimal-d.test.ts` 的 `D04_ALLOWLIST` 增加一条精确语义豁免（`src/provider/runtime/schema.ts` 的 VCA target kind 描述行，`token: "docs/flows/"`，逐行正则匹配）。
- 该提交**不含任何 `src/`、`app/` 或其生产代码差异**；对其它测试文件也无差异。因此相对 v2 的 T3 计数，唯一可能的变化就是 D-04 这个测试文件从 fail（1 项）变为 pass（1 项）。

## v3-3. D-04 单测实测（实证）

```text
$ node --test --test-concurrency=1 "test/测试/entry-role-minimal-d.test.ts"
exit 0；tests 6 / pass 6 / fail 0 / cancelled 0 / skipped 0 / todo 0；duration_ms 243.967
✔ D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules） (47.0503ms)
```

- 测量时工作树含上述 24 项实现候选（未提交）；D-04 的 allowlist 匹配的是 `schema.ts` 描述行的**文本**（非行号），该行文本在候选实现中未被改写（C2 只是在 `schema.ts` 其它位置新增 `governance_matrix` 描述），因此 6/6 结果与该 allowlist 提交的语义一致。
- 对照：B0 v2 在 `ebbc2fc` 上单独复跑同一文件为 `6 tests / 5 pass / 1 fail`（见 v2-5）。故该文件在本前进中精确变化为 **fail 1 → fail 0、pass 5 → pass 6、tests/skip 不变**。

## v3-4. T3 全量计数：推导（非重跑；必须按此理解）

**推导口径**：v2 在 `ebbc2fc` 的 T3 实测为 `tests 4,036 / pass 4,008 / fail 10 / cancelled 0 / skipped 18 / todo 0`（B0 v2 §v2-5）；`ebbc2fc → 0418746` 的提交差异只有上述单文件 7 行 allowlist（v3-2），且该文件实测由 5 pass/1 fail 变为 6 pass/0 fail（v3-3）。因此：

| 项 | v2 实测（ebbc2fc） | 单文件增量 | **v3 推导（0418746）** |
| --- | --- | --- | --- |
| tests | 4,036 | 0 | **4,036** |
| pass | 4,008 | +1（D-04 fail→pass） | **4,009** |
| fail | 10 | −1（D-04 消失） | **9** |
| cancelled | 0 | 0 | **0** |
| skipped | 18 | 0 | **18** |
| todo | 0 | 0 | **0** |
| exit | 1（9 EPERM + D-04） | D-04 转绿 | **1（仅 9 项既有 Windows symlink EPERM）** |

**明确声明**：以上 T3 数字是**推导值，不是 2026-11-05 在 0418746 上重新跑全量的实测值**。推导成立的前提是「提交差异只有 v3-2 的单文件 7 行」且「D-04 单文件实测 6/6」；两项证据均已附于本节。若该前提被推翻（出现其它提交差异、D-04 复跑非 6/6），v3 推导作废，必须重测。

## v3-5. T2 判据（以 v3 为准）

1. **既有失败 = 9 项 Windows symlink `EPERM`**：即 B0 v2 §v2-5 的 10 项清单**去掉 #8 D-04**（清单 #1–#7、#9、#10）；逐名、文件:行可按 v2 表比对，行号漂移按「文件+测试名」。
2. **D-04 消失属已声明的改进**：D-04 不再失败不构成「新增失败」；若 T2 中 D-04 重新失败，按基线变化处理 → 停止并回报（可能有人回退了 allowlist 或改了 `schema.ts` 描述行）。
3. **新增确定性失败 = 0**：T2 失败集合必须仍为上述 9 项 EPERM；出现任何其它失败，或既有 EPERM 失败出现非 `EPERM/symlink` 形态，即判 T2 不通过 → 停止并回报统筹。
4. **skip = 18；新增 skip = 0**；todo 保持 0。
5. `test/pi-adapter/write-sequencing.test.ts` 继续**排除、未运行、未验证**，不得写为通过。
6. T2 必须在**最终实现候选**上运行；若实施前分支再次前进，先重记 B0（v4）再取判据；v2/v3 旧值不得冒充新候选。
7. 若统筹/E2 不接受推导、要求 0418746 的实测全量：按 v3-6 的干净工作树方法执行。

## v3-6. 若必须实测全量：干净工作树方法（未执行，供统筹选择）

当前工作树含 24 项实现候选，直接重跑全量测到的是「候选 + 实现改动」，不是 0418746 基线；且统筹明确要求不要擅自 stash/清理候选。可选的干净方法是：

1. 在仓库外/临时目录创建独立 worktree：`git worktree add <temp-dir> 0418746`（不触碰当前工作树；需从主仓库或本 worktree 执行，属只读 git 之外的新增工作树操作）；
2. 在临时 worktree 安装依赖（`npm ci`；当前机器未缓存安装包时需网络与时间，成本未测）；
3. 用与 v1/v2 §5.1 相同的 T3 命令（10 目录 glob + 39 显式 pi 文件；排除 `write-sequencing.test.ts`）运行全量（B0 v2 实测约 4 分 38 秒，加上安装时间）；
4. 记录原始输出并与 v3-4 推导表对照；完成后 `git worktree remove <temp-dir>`。
- **本轮未执行**该方法（按统筹「只写 B0 文档、不擅自清理候选」的指示）；如需执行，请统筹确认后另行派发。

## v3-7. 命令清单与证据位置（v3）

```text
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count origin/main...HEAD
git diff --name-only ebbc2fc 0418746
git diff --stat ebbc2fc 0418746
git diff ebbc2fc 0418746
node --version && npm --version
ls node_modules | wc -l
test -f node_modules/.package-lock.json
node --test --test-concurrency=1 "test/测试/entry-role-minimal-d.test.ts"
```

- 证据：`git diff`/`--name-only`/`--stat` 输出已逐字记录于 v3-2；D-04 原始 stdout 存 `/tmp/b0v2-ebbc2fc/b0v3-d04.log`（本机临时目录，不入库；按上述命令可复算）。
- 未使用截图/录屏（本特性无 UI 变更；禁止录屏规则不变）。

## v3-8. 声明与限制

1. v1/v2 全文保留、未改写；v3 只追加。v2 的 D-04 基线红已被 0418746 的 allowlist 修复，本类前进由 v3 记录。
2. **v3 的 T3 计数是推导值**（v2 实测 + 单文件精确增量），不是重新实测；推导前提与实证见 v3-2/v3-3；若前提不成立必须重测。
3. v3 的判据以「9 项既有 EPERM + skip 18」为基线；D-04 消失是已声明改进；新增确定性失败/新增 skip 均须为 0。
4. 本文件不是验收结论，不授权提交/推送/合并/发布；管理记录不混入产品候选。
5. 若统筹/E2 要求实测全量，按 v3-6 的干净工作树方法执行；本轮未执行该方法，也未 stash/清理当前候选。
