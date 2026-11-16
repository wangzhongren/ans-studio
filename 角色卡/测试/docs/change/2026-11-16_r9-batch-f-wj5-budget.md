# R9 批次 F：W-J5 per-test 预算 180s→300s

- 日期：2026-11-16（执行于 2026-11-17）
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9f`（分支 `fix/test-debt-r9f`，起点 `da805ec` = `origin/main`）
- 写区：仅 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` + 本记录。
- 依据（权威）：`角色卡/测试/docs/change/2026-11-16_remediation-plan-r9-update.md` §3.5、§4 批次 F；`_r9-evidence/09-budget-evidence.md` §1/§3；R9 run **43887939365**（`main @ 77d3505`，三平台工件）与 R8 run **43867573699** 对照。
- 约束：未 commit/push、未触发 CI、未 tag、未碰 main；未改产品 `src/**`、`app/**`、`.github/**`、release-policy；未读 `.env`；未占用 9222/9223/9224；零断言放宽、零删测试。

## 0. 摘要

W-J5/J15（judge 代批全链 e2e）在 x64 慢 runner 上 R3/R5/R6/R8/R9 连续于用例自带 180s 上限触顶，且**无任何断言失败**；而该上限是显式 `{ timeout: 180000 }`，**覆盖** CLI `--test-timeout=600000`（#137），因此 #137 不能救本用例。按 2026-11-16 R9 计划 §3.5/批次 F 的 owner 裁决，把该用例 per-test timeout 上调为 **300000**（与同类慢 e2e 预算一致：`task-restart.test.ts` 300s、Q2 P2 300s），并更新注释记录依据与「仍触顶则拆测试」的边界。本机 Windows 两次定向复跑均通过（66.9s / 67.2s）；x64 结论待第九轮三平台 CI 复跑验证（不可本机复现）。

## 1. 根因引用

1. **显式选项覆盖 CLI（Node 探针实证）**：`09-budget-evidence.md` §1——`node --test --test-timeout=5000` 下，显式 `{ timeout: 300 }` 的用例在 312.6ms 报 `test timed out after 300ms`，未继承 CLI。故 #137 的 600s 只覆盖「无显式 timeout」的用例（如 AC-4），**不覆盖 W-J5**。
2. **x64 触顶历史（R8/R9 工件）**：`09-budget-evidence.md` §3——R8 x64 180,003.4ms ✖、R9 x64 180,002.8ms ✖（`test timed out after 180000ms`，无断言体）；同轮 arm64 81,767.3ms ✔、Windows 101,995.5ms ✔（R8 65,780.2ms / 73,191.5ms ✔）。x64 从未在本口径下通过。
3. **外推**：同轮 x64/arm64 同类慢化比 AC-1 2.23×、AC-2 2.54×（R9 计划 §3.5）；按 arm64 81.8s 外推 x64 本链约 **180–210s**——300s 上限大概率通过，但**未证**（x64 无法本机复现）。
4. **计划口径**：R9 计划 §3.5「最小修复（批次 F，owner 决策）：把该用例 per-test timeout 提到 300000……由 x64 CI 复跑验证；仍触顶则拆测试。**不要**把 #137 当作 W-J5 的修复凭证。」§4 批次 F 同文；第九轮验收口径见 §5（已修名三平台绿、零回退）。

## 2. 改动（单文件）

`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`：

1. `:55` per-test timeout：`{ timeout: 180000 }` → `{ timeout: 300000 }`。
2. `:60-67`（原「不调整 180s 上限」注释按 R9 裁决改写）新增依据：
   - R8/R9 x64 180s 触顶（180,003.4ms / 180,002.8ms）且无断言失败；arm64 81.8s、Windows 102.0s；同轮慢化比 2.2–2.5×，外推 x64 约 180–210s；
   - #137 的 CLI `--test-timeout=600000` 不覆盖显式 `{ timeout }`（Node 探针实证，引用 `09-budget-evidence.md` §1）；
   - 原 misc3 §4 口径（无测试缺陷证据不抬上限）按 R8/R9 累计证据 + owner 裁决更新；
   - 300s 仍只把「真实链路超预算」变成可命名的失败，不跳过、不放宽任何断言/用例；**若第九轮 x64 仍触顶 → 拆测试，不再继续抬预算**。
3. **同文件其他显式 timeout 审计**：本文件仅 1 个 `test(...)`（`:55`）即本用例，无其他显式 per-test timeout；无验证超时语义的小预算用例。故无需同步调整项，也无被误动项。零断言改动、零测试增删（diff：9 insertions / 2 deletions，全部为 timeout 数值与注释）。

## 3. 验证（本机 Windows，Node v24.22.1）

仓库既有调用方式（同 `test-ci.yml` 串行口径，定向单文件 + 名称过滤；CLI 预算 600s 仅作兜底，实际生效为显式 300s）：

```bash
node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="W-J5" \
  "test/测试/2026-11-09_judge-delegated-effectiveness.test.ts"
```

| 运行 | 结果 | 用例耗时 | 总耗时 | EXIT |
| --- | --- | ---: | ---: | ---: |
| run1 | 1/1 pass（fail 0 / cancelled 0 / skipped 0） | 66,938.6ms | 68,733.5ms | 0 |
| run2 | 1/1 pass（fail 0 / cancelled 0 / skipped 0） | 67,162.4ms | 67,512.6ms | 0 |

分段预算 diagnostic（用例自带 `context.diagnostic`，证明成本全在真实跨层链、无固定 sleep）：

```text
run1 {"wj5BudgetMs":{"buildWriteChain":46564,"r9BaselineAndFallbackNegatives":46568,"fallbackNegatives":46743,
     "judgeD3AndPin":48733,"verifyReviewIntentEndToEnd":65509,"activationReplayAndIdempotency":66937,"complete":66937}}
run2 {"wj5BudgetMs":{"buildWriteChain":46746,"r9BaselineAndFallbackNegatives":46756,"fallbackNegatives":46938,
     "judgeD3AndPin":48863,"verifyReviewIntentEndToEnd":65678,"activationReplayAndIdempotency":67161,"complete":67161}}
```

- `npm run typecheck`（`tsc --noEmit`，本机 TypeScript）：**EXIT=0**。
- 本机 Windows 耗时 ~67s，与历史记录同量级（旧注释 ~61s、R9 工件 102.0s），远低于 300s；本改动对断言/行为零影响。
- 生成物清理：两次运行各产生 1 个 `%TEMP%/ans-wj5-judge-*` 夹具根（夹具不自动删根），已按运行前后快照 diff 精确删除新增的 2 个目录（`ans-wj5-judge-UKN5sx`、`ans-wj5-judge-duxXgl`），其余既有目录未动；未设置 `ANS_WJ5_EVIDENCE_DIR`，无证据文件落盘；工作树 `git status` 仅本记录 + 目标测试文件。

## 4. 披露与第九轮验收点

1. **显式选项覆盖 CLI 是本次修复的根因事实**：显式 `{ timeout: 300000 }` 优先于 `--test-timeout=600000`；本用例的实际预算就是 300s，#137 不作用于它。300s **不是**「600s 封顶」的直接结果，而是按 R8/R9 外推（180–210s）+ 与同类慢 e2e 预算一致（300s）的 owner 裁决值。
2. **x64 效果未证（本机无法证）**：x64 仅在 CI 复现。第九轮三平台验收：
   - **x64：预期转绿**（若外推成立）；若仍 180–300s 间被打断或恰好 >300s，按计划**拆测试**并报告 owner，**不继续抬预算**；
   - **arm64 / Windows：保持绿**（R8/R9 分别 81.8s/102.0s，300s 有余量；本机 Windows 67s）；
   - 计划 §5 零回退清单不含本用例语义变化（零断言/语义改动），故不引入其他验收项风险。
3. **门禁口径**：本文件是测试文件，不在 release.yml 冻结 overlay 内，发布门禁命令与合规不受影响；不做、也不能把本用例当作 #137 生效证据。
4. **超时语义边界**：抬预算是平台慢化的吸收，不掩盖断言失败——触顶失败体是 `test timed out after …ms`（无断言体）；若后续出现断言失败，与预算无关，按常规缺陷处理。

## 5. 约束遵守

只修改了 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（timeout 数值 + 注释）并写入本记录；未 commit/push、未触发 CI、未 tag、未碰 main；未改 `src/**`、`app/**`、`.github/**`、release-policy、角色卡/边界/其他测试；未读 `.env`；未占用 9222/9223/9224；零断言放宽、零删测试。
