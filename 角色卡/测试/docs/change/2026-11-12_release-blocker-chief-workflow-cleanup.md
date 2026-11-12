# v2.0.0 发布阻断 B3-3：chief-workflow 清理竞态有界重试（2026-11-12）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.0.0 发布阻断 **B3-3**——`test/桌面应用/chief-workflow.test.ts` 的 `fs.rm` ENOTEMPTY
  清理竞态按 blockers-1（PR #86）先例加**有界重试**（`maxRetries`/`retryDelay`）；主断言不动。
- 工作树/分支：`.claude/worktrees/release-v2.0.0-blockers-3` / `release/v2.0.0-blockers-3`（`12bef7c`）。
- 声明：未运行 Electron、未占用 9224、未触发 CI、未打 tag；本条改动随 blockers-3 分支提交。

## 一、事实与根因

- `chief-workflow.test.ts` 是 66 个测试的长链路文件（真实 SessionManager/Core/HTTP 桩）。`manager.stop(null)`
  只释放句柄，不等待后台投递链落盘；随后的 `fs.rm(root, { recursive, force })` 与仍在写入的会话目录
  竞态，Windows/macOS 上会报 `ENOTEMPTY`（`rmdir` 目录非空）。
- 该族在多份既有证据中登记为**非确定性清理族**：E3-T3（2026-11-08）记录 W29/commit-race/selected
  ENOTEMPTY/AggregateError、W19/W22/W23/W28/W47 清理期错误；E3-F（2026-11-09）记录失败集合漂移
  （63/48/15 与复跑 63/51/12）；D1（2026-11-08）记录 W29 主变体超时后的级联；B8.2（2026-11-11）
  Windows TAP 记录 W14/W22/W23/W28/W47 的 `ENOTEMPTY`。这些失败发生在测试清理期，不是产品断言失败。
- blockers-1 先例：`optional-acceptance.test.ts` 对 `fs.rm` 使用
  `{ maxRetries: 10, retryDelay: 100 }`，并在 stop 后 `tick(50)` 让后台投递落盘。本批沿用同一参数。

## 二、修复（只动清理，不动断言）

`test/桌面应用/chief-workflow.test.ts`：

- 新增统一 helper：
  ```ts
  async function rmrf(target: string): Promise<void> {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  ```
- 把所有**清理用途**的 `fs.rm(..., { recursive, force })` 替换为 `rmrf(...)`（含 W5/W10 `attempt()` 内的
  root/extraRoot、W14/W16/W17/W19/W20/W21/W27/W47 等 finally、`diagDir`、`f.root`）；原本带
  `maxRetries: 5/retryDelay: 30` 的 4 处统一为 10/100。
- **唯一保留原样**的 `fs.rm` 是 W6 用例中“删除受派 run 记录以模拟不可读”的**测试动作**（不是清理）——
  改变其重试语义会改变测试意图。
- 重试有界：10 次 × 100ms 后仍失败则如实抛错（不吞错、不改写为通过）；主断言逐字未动。

## 三、验证（同机、同工作树、产品修复在位）

| 状态 | 命令 | 结果 |
| --- | --- | --- |
| before（HEAD 版 chief-workflow，无 `rmrf`） | `node --test test/桌面应用/chief-workflow.test.ts` | **66 tests / 49 pass / 17 fail / 0 cancelled**；失败含清理族 W14、W20、W22、W28×2、`unmanaged`（ENOTEMPTY/AggregateError） |
| after（本修复） | 同上 | **66 tests / 58 pass / 8 fail / 0 cancelled**；清理族全部消失 |

merge `origin/main`（`1ac7b5c`，blockers-4 stale-parent 8.3 修复）后复跑仍为 **58 pass / 8 fail / 0 cancelled**，
失败名集合不变；merge 未改变本文件的清理行为与断言。

after 剩余 8 名（均为**既有已登记族**，非 B3-3 引入）：

- `W5 专字段真实workSourceRef…`（父）与子测试 `selected`、`commit-race`（既有非确定性/固定路径族）；
- `W10 fresh scope分流…`（父）与子测试 `required`（既有非确定性/workSourceRef 族）；
- `W19 实际Core回报与Git回调同assignment…`（产品 `closeCreatedTask` 不发通知的既有契约冲突，B2-3）；
- `W33 真实DocRun关闭通知…`、`W34 真实首文档发布…`（既有 close-notice/`run-plan-` 断言 + ENOTEMPTY，
  普通 TEMP 同形，非本批根因；调用方已披露）。

证据：

- `_evidence/chief-workflow-before-b33.txt`（before 49/17/0）
- `_evidence/chief-workflow-target.txt`（after 58/8/0）
- `_evidence/w1b-without-product-fix.txt`（W1b 与 B3-1 产品修复关系的隔离复跑证据，见 B3-1 记录）

说明：该文件的失败集合在既有证据中本就逐次漂移；before/after 的差异集中在清理族（ENOTEMPTY/
AggregateError），after 无新增确定性失败。`W20` 普通变体在 after 通过、`W29/W30/W35/W36` 在单次
after 中全绿、另一次运行中个别红绿漂移，均属已登记非确定性族。

## 四、限制

1. 本机 Windows 11；macOS 由 CI 验证（ENOTEMPTY 为跨平台清理竞态，重试对两平台同向）。
2. 有界重试不是“无限等待”：极端持续写入下 10×100ms 仍可能失败 —— 这是有意的如实失败，而不是把
   清理错误吞掉。
3. 未修 W33/W34 的断言/W19 close-notice 契约（调用方列为既有残余，非本批范围）；未碰
   `src/provider/trunk/impl/git-trunk-store.ts:1160` 的 8.3 短名 `git-control-path-unsafe`（跨写区残余）。
4. 未跑全仓；仅目标文件 + 三套冻结 known-red + 打包测试（计数见 B3-1 记录）。
