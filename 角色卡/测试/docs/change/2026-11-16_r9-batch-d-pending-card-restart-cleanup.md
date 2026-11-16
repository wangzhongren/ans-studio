# R9 批次 D：pending-card-restart Windows 清理竞态（有界重试）

- 日期：2026-11-16（记录落盘 2026-11-17）
- 角色：ANS「测试」（roleId: 测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9d`（分支 `fix/test-debt-r9d`，起点 `da805ec` = `origin/main`）
- 范围：只改 `test/桌面应用/pending-card-restart.test.ts`（R9 批次 D 写区，单文件单清理点）。
- 约束遵守：零断言放宽、零删测试；**未改产品 `src/**`、`app/**`、`.github/**`、release-policy、main**；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占用 9222/9223/9224。

## 1. 根因引用（R9 已定性，不在本批重复分析）

依据 `2026-11-16_remediation-plan-r9-update.md` §3.7 与 `2026-11-16_remediation-plan_r9-evidence/03-error-bodies.md:149-158`：

- 失败用例：`test/桌面应用/pending-card-restart.test.ts:29`「重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等」，R9 Windows 149ms 失败。
- 失败点：`finally` 清理 `:87` 裸 `fs.rm(root, { recursive: true, force: true })`。
- 错误体：

```text
[Error: ENOTEMPTY: directory not empty, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\ans-pending-restart-DGo74B\.ans\state']
{ errno: -4051, code: 'ENOTEMPTY', syscall: 'rmdir', path: '...\\.ans\\state' }
```

- 竞态结构：`await mgr.stop(null)`（`:86`）返回后，SessionManager 仍有 `.ans/state` 异步落盘；递归删除遍历过该目录后、删除根目录前子项被重新写入 ⇒ Windows 上 `ENOTEMPTY`。同轮 arm64 101.4ms、x64 139.7ms 通过，Windows-only。
- 定性：测试侧清理竞态（flare，非产品缺陷）；产品代码零改动。

## 2. 改动

唯一清理点 `:87`（文件内无其他同类清理点）：

```ts
// Windows 清理竞态：mgr.stop(null) 后仍有 `.ans/state` 异步落盘，裸 rm 可能 ENOTEMPTY。
// 有界重试（Node 仅对 EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM 重试；耗尽仍如实抛错）。
await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
```

- 与计划 §3.7 最小修复逐字一致（`maxRetries: 10, retryDelay: 100`；与 misc3/p1p7 有界清理同法）。
- 语义保持：Node `fs.rm` 的 `maxRetries/retryDelay` 仅对瞬时码重试；上界 10×100ms，**耗尽仍抛错**，不把真实清理失败伪装成功。断言、用例体、并发语义零改动。
- 未采纳可选项“rm 前等待 stop/dispose 的既有有界等待”：`mgr.stop(null)` 已 `await`，其后的异步落盘发生在产品内部且无既有可等待句柄/信号；按计划取最小修复。

## 3. 本地验证（Windows 本机，定向）

- 环境：Windows 11 Pro（10.0.26300）/ Node v24.22.1（CI 为 24.14.0）。
- 调用方式（仓库既有）：`node --test --test-concurrency=1 "test/桌面应用/pending-card-restart.test.ts"`（对应 release.yml `node --test --test-concurrency=1 "test/**/*.test.ts"` 的单文件定向形态）。

### 3.1 修复后（3 次连续）

| 次 | 结果 | 用例耗时 | 进程 duration_ms |
| --- | --- | ---: | ---: |
| 1 | ✔ pass | 126.157ms | 2327.01 |
| 2 | ✔ pass | 43.4291ms | 501.70 |
| 3 | ✔ pass | 88.8651ms | 532.23 |

3/3 通过，自然退出（EXIT=0），无 ENOTEMPTY。

### 3.2 修复前基线对照（披露）

为判断本机是否复现该竞态，用补丁往返临时还原原文件（裸 `fs.rm`）连续跑 3 次后恢复改动：

| 次 | 结果 | 用例耗时 |
| --- | --- | ---: |
| 1 | ✔ pass | 106.4194ms |
| 2 | ✔ pass | 129.1878ms |
| 3 | ✔ pass | 53.3474ms |

**本机 3/3 未复现**（Windows 11 + 非短名 TEMP、无 CI 级 AV/索引压力），与 misc3 结论一致：该 flare 在本机为低概率，修复依据为 R9 CI 错误体与代码顺序，本地绿灯只证明路径执行、不构成复现证据。

## 4. CI 复核点（第九轮三平台全量）

1. **Windows（x64）应转绿**：`重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等` 零 ENOTEMPTY、零失败；若仍失败属有界重试耗尽，错误如实上抛，应保留为残差并复查落盘来源（必要时另立批次，不加长重试或吞错）。
2. **arm64 / macOS x64 保持绿**：本批不改变用例语义与并发，同文件在两平台应维持 0 失败（R9 为 101.4/139.7ms 通过）。
3. 本批只动 1 个测试文件，与批次 A/B/C/E/F 写区无重叠，可在同轮合并以节省 CI 轮次。
4. 无新增测试名、无删除测试名；known-red 计数口径不变（Windows 该名应从 known-red 转绿，三平台 known-red 目标 0/0/0）。

## 5. 披露项

1. 本机修复前基线 3/3 未复现竞态（见 §3.2）；本批转绿依据为 CI 错误体 + 修复覆盖实际栈点，非本机复现。
2. 未运行全仓库 `npm run typecheck`：改动为 `fs.rm` 标准选项对象，计划 §3.7 的验证要求为定向 3×，如合并轮需要可随 CI 复核。
3. 清理生成物：本机 `%TEMP%` 发现一个 2026-11-13 的 `ans-pending-restart-*` 残留（含 `.ans/state/versions.lock`，非本次运行产生），已删除；本次全部运行无残留（测试自清理）。
4. 未 commit/push、未触发 CI：改动停留在工作树 `git status`（仅 `M test/桌面应用/pending-card-restart.test.ts` + 本记录）。
