# R9 补批 A2：`Git team plan publication` per-test 预算 180s→300s

- 日期：2026-11-17
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9g`（分支 `fix/test-debt-r9g`，起点 `f3c8a8c` = `origin/main`，已含 R9-A…F 与 A 的 realpath 修复）
- 写区：仅 `test/编排/git-capabilities.test.ts` + 本记录。
- 依据（权威）：
  - 第九轮 CI run **43911103883**（`Test matrix (development feedback)`，`workflow_dispatch`，`main @ f3c8a8c854771eb24c6cd1de945b87e056160c77`），Windows job **133452914919**（`test (windows-2025, win, x64)`，failure，2026-11-16T16:46:05Z–17:24:28Z）。本机以 `gh api`/`gh run` **只读**核对 job 元数据与日志（原始日志 1,189,713 B，未入库）。
  - R9 归因与收尾方案 `2026-11-16_remediation-plan-r9-update.md` §3.1/§4 批 A（A 批 = 夹具根 realpath；本 A2 为其后续预算适配）。
  - KR-29 批次记录 `角色卡/编排/docs/change/2026-11-16_kr29-orchestration.md` §5（180s 由来：本机完整真实 Git 链路约 117s；per-test 显式 timeout 覆盖 CLI）。
- 本机环境：Windows 11 / Node v24.22.1。

## 0. 摘要

R9-A 的夹具根 realpath 修复已在第九轮 Windows CI 生效：该用例不再以 `git-journal-directory-invalid` 早失败（第八轮 Windows 为 62,859.6ms 断言失败），而是推进完整真实 Git 链路后在 **180,000.304ms 触顶**（`test timed out after 180000ms`），成为该 Windows job 的**唯一残差**（tests 5,828 / pass 5,795 / fail 0 / **cancelled 1** / skipped 32；唯一 `✖` 即本用例，无断言体）。本机快机实测该用例 115–136s（本次复跑 118.5s；KR-29 记录约 117s），CI Windows runner 同链路慢化 1.4–1.7×（R9 Q2 P2 阶段观测比例），180s 已无余量。按任务书把该用例 per-test timeout 上调为 **300000**（与 R9-F 的 W-J5 180→300 同类慢 runner 预算适配）；零断言改动、零删测试、零语义改动。

## 1. 第九轮 Windows 证据（GH Actions，job 日志逐字）

- run 43911103883：`Test matrix (development feedback)`，`workflow_dispatch` on `main @ f3c8a8c`（正是本工作树起点，含 R9-A…F）。写作时该 run 仍 in_progress，仅 Windows job 已完成。
- job 133452914919：`test (windows-2025, win, x64)`，conclusion **failure**，16:46:05Z–17:24:28Z（约 38m23s）。
- job 日志逐字（`test-ci-output.log` 工件内容同源）：

  ```text
  test at test\编排\git-capabilities.test.ts:515:1
  ✖ Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority (180000.304ms)
    'test timed out after 180000ms'
  ```

- job 汇总：`ℹ tests 5828 / pass 5795 / fail 0 / cancelled 1 / skipped 32 / duration_ms 2206811.9937`。即 R9-A 修复后，第九轮 Windows 仅剩本预算项；触顶失败为测试级超时（计入 cancelled），非断言失败、非产品缺陷。
- 定性：慢 runner 预算适配（与 R9-F 的 W-J5 180→300 同类），非断言问题。

## 2. KR-29 §5：180s 的由来与缺口

- 该用例在本机真实执行完整 Git 链路约 **117s**（完整真实链路，非 mock）；Node 默认 CLI 预算 120s 会把它取消（KR-29 run 1：1 cancelled），故当时单独声明 `{ timeout: 180000 }`（Node 支持的 per-test 显式 timeout；显式选项**覆盖** CLI `--test-timeout`，即 #137 的 600s **不作用于**本用例）。
- 180s = 本机 ~117s 加通道余量；但未覆盖 CI Windows runner 的同链路慢化（1.4–1.7×），第九轮 180,000.304ms 触顶即该缺口。
- 本机耗时对照：KR-29 约 117s；R9-A 全文件回归 136,486.7ms；本次定向复跑 118,504.6ms——区间 115–136s。

## 3. 改动（单文件）

`test/编排/git-capabilities.test.ts`（全文件唯一显式 per-test timeout；任务书核定仅此一处）：

1. `:515` `{ timeout: 180000 }` → `{ timeout: 300000 }`；测试名逐字未动（冻结名保持）。
2. 用例上方新增 7 行注释记录依据：第九轮 Windows CI 触顶（run/job、180,000.304ms、唯一残差）、本机 115–136s、CI 同链路慢化比（并注 W-J5 同轮 2.2–2.5× 对照），以及「若 300s 仍触顶 → 拆测试并报告 owner，不再抬预算」。
3. diff：`8 insertions(+), 1 deletion(-)`，全部为 timeout 数值与注释；零断言改动、零测试增删。

## 4. 验证（本机 Windows，定向）

命令（任务书指定；串行 + 名称过滤；CLI `--test-timeout=600000` 仅兜底，实际生效为该用例显式 300s）：

```bash
node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="Git team plan publication" "test/编排/git-capabilities.test.ts"
```

结果（1 次）：

```text
✔ Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority (118504.5539ms)
ℹ tests 1 / pass 1 / fail 0 / cancelled 0 / skipped 0 / duration_ms 120644.3267
EXIT=0（墙钟 120s）
```

- 耗时 118.5s，位于本机观测区间 115–136s（KR-29 约 117s），距 300s 余量充足；按 CI 慢化 1.4–1.7× 外推约 166–202s（以 180s 触顶实测反推至少 ≥1.52×），300s 预期可覆盖。
- `npm run typecheck`（`tsc --noEmit`）：**EXIT=0**。
- 生成物清理：运行前后对 `%TEMP%` 的 `ans-*` 快照 diff，本次新增仅 1 个目录 `ans-trunk-service-8OhcOo`，已精确删除；其余既有目录（跨会话累计，非本次产生）未动。工作树 `git status` 仅目标测试文件 + 本记录。
- 环境注记：为在本工作树运行，执行了 `npm ci`（526 packages，25s）；`node_modules/` 已被 `.gitignore` 忽略，未入库、无源码影响。

## 5. 披露与第九轮验收点

1. **x64/arm64 未定**：写作时 run 43911103883 仍 in_progress，仅 Windows job 已完成可读；x64/arm64 结果尚在收集中。本批不改任何断言/语义，剩余风险仅是 300s 在各平台是否足够。
2. **300s 仍不足的处置**：若 x64/Windows 在 300s 仍触顶 → **拆测试**并报告 owner，**不再抬预算**（与 R9-F/W-J5 同口径，不静默抬预算）。此边界已写入测试注释。
3. **#137 不覆盖**：本用例为显式 per-test timeout，`--test-timeout=600000` 不生效；300s 是该用例的实际上限，不能把 #137 当作其修复凭证（与 KR-29 §5 及 R9 计划 §3.5 同口径）。
4. **慢化比口径**：1.4–1.7× 为 R9 Q2 P2 阶段三平台观测（arm64 1.4×、Windows 1.7×、x64 1.1×）；W-J5 同轮 x64/arm64 为 2.2–2.5×。本用例与 Q2 P2 同为 Windows 同链路慢化观测，1.4–1.7× 为近似；最终以第九轮 CI 复跑为权威。
5. **预算不掩盖断言失败**：触顶失败体为 `test timed out after …ms`（无断言体）；后续若出现断言失败，与预算无关，按常规缺陷处理。
6. **约束遵守**：未 commit/push、未触发 CI、未 tag、未碰 main；未改产品 `src/**`、`app/**`、`.github/**`、release-policy、其他测试或角色卡/边界；未读 `.env`；未占用 9222/9223/9224；零断言放宽、零删测试。

## 6. 产物

- 本记录。
- 本机运行日志（`/tmp/r9g-a2-run.log`、`/tmp/r9g-a2-typecheck.log`）为临时文件，不入库；CI 原始 job 日志与工件亦未入库。
- 复现命令：

  ```bash
  cd .claude/worktrees/fix-test-debt-r9g
  node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="Git team plan publication" "test/编排/git-capabilities.test.ts"
  npm run typecheck
  ```
