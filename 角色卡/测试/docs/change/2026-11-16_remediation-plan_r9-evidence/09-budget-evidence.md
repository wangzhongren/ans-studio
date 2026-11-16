# 预算口径证据：#137（CLI 600s）覆盖范围核对

## 0. 结论先行

| 测试 | 显式 per-test timeout | #137（`--test-timeout=600000`）是否生效 | R9 结果 | 预算-only 判断 |
| --- | --- | --- | --- | --- |
| AC-4 | 无（`git-action-delivery-claude-e2e.test.ts:34`） | **是**（继承 CLI 默认） | x64 300,002ms 超时 | **是**（R8 x64 已以 246,302ms 通过） |
| W-J5 | **180000**（`2026-11-09_judge-delegated-effectiveness.test.ts:55`） | **否**（显式覆盖 CLI） | x64 180,002ms 超时 | 大概率是（arm64/Windows 82s/102s；x64 同类比 2.2–2.5×），但未证；需改该选项后复跑 |
| Q2 P2 | **300000**（`git-role-workflows-e2e.test.ts:2306` 经 `:1310`） | **否**（显式覆盖 CLI） | x64 300,000ms 超时 | **否**。且子进程另有硬编码 300s 绝对预算（`:1317-1319`、`:1341`），CLI 提到 600s 仍会被看门狗杀；arm64/Windows 已自然失败（见 §3） |

## 1. Node 版本与 per-test timeout 优先级（本机实证）

环境：Node **v24.22.1**（本机；CI 为 v24.14.x，语义相同）。探针（临时目录，未入库）：

```js
// t.test.mjs
import test from 'node:test';
test('explicit 300ms', { timeout: 300 }, async () => { await new Promise(r => setTimeout(r, 2000)); });
test('default', async () => { await new Promise(r => setTimeout(r, 2000)); });
```

```bash
node --test --test-timeout=5000 t.test.mjs
```

输出（节选）：

```text
✖ explicit 300ms (312.6462ms)
  'test timed out after 300ms'
✔ default (2003.6102ms)
ℹ cancelled 1
```

结论：**显式 `{ timeout }` 覆盖 CLI `--test-timeout`**。因此 #137 只能救“没有显式 timeout 的用例”（AC-4），不能救 W-J5 / Q2 P2。

## 2. AC-4 预算-only 证据

| 轮次 | arm64 | x64 | Windows |
| --- | ---: | ---: | ---: |
| R7（43859105048） | 96,441.8ms ✔ | 300,001.3ms ✖ timeout | 189,967.5ms ✔ |
| R8（43867573699） | 88,709.6ms ✔ | **246,302.4ms ✔**（300s 上限内） | 83,826.1ms ✔ |
| R9（43887939365） | 106,215.5ms ✔ | 300,002.3ms ✖ timeout | 138,943.3ms ✔ |

- R8 x64 在 300s 上限内以 246.3s **自然通过**——链在 x64 上可完成；R9 只是更慢（本轮 x64 整体变慢：AC-1 146.3s vs R8 152.5s、AC-2 166.2s vs R8 139.3s；arm64 同链 106.2s、Windows 138.9s）。
- #137 后 x64 预算 600s，按 R8 246s × 本轮相对慢化（≤1.2–1.7×）仍有充足余量。
- x64 日志无 AC-4 阶段标记（测试未打印进度），无法给出 300s 时刻的阶段位置；但“R8 同测试 x64 300s 内自然通过”即预算-only 的强证据。

## 3. W-J5 证据与边界

| 轮次 | arm64 | x64 | Windows |
| --- | ---: | ---: | ---: |
| R8 | 65,780.2ms ✔ | 180,003.4ms ✖（显式 180s） | 73,191.5ms ✔ |
| R9 | 81,767.3ms ✔ | 180,002.8ms ✖（显式 180s） | 101,995.5ms ✔ |

- x64 从未在本口径下通过（R3/R5/R6/R7/R8/R9 连续）；
- 同轮 x64/arm64 慢化比：AC-1 2.23×、AC-2 2.54×；按 arm64 W-J5 81.8s 外推 x64 约 180–210s，仍可能超过 180s；
- 显式 180s 不改，#137 对此用例无效。最小修：把该用例 per-test timeout 提到 300000（或与 owner 议定值）后由 x64 CI 验证；若仍触顶，再按“拆测试”处理（与 #137 记录的 owner 口径一致：不得静默抬预算）。

## 4. Q2 P2 预算结构（#137 不覆盖）

代码位置（da805ec / 77d3505 相同）：

- 父测试显式 timeout：`:2306` → `firstNewBusinessTimeoutMs()`；CI 返回 `300000`（`:1310` 第一分支）。
- 子进程绝对预算：`:1317-1319` `deadlineAt = Math.min(Date.now() + 300000, outerDeadlineAt - 30000)`；`:1341` 看门狗 SIGTERM。
- 阶段（bounded）预算：`git-role-workflows-driver.ts:736` → `fixtureWaitBudgetMs(timeoutMs, caseDeadlineAt, now)`（`:63-70`）= `min(阶段默认, 子进程剩余)`；first-bootstrap 驱动阶段默认 `timeoutMs=90000`（e2e `:1922`）。
- 失败标签 “actual worker required surface / scoped write” 在 `e2e:2223`，被上述 `bounded` 包裹。

因此：
1. #137 的 CLI 600s 被父测试显式 300s 覆盖；
2. 即使父测试放宽，子进程 300s 绝对预算仍会 SIGTERM（`watchdogFired=true` → `:1345` 失败）；
3. 即使子进程预算也放宽，arm64/Windows 本轮已在阶段 bounded 预算（90s / 子进程剩余）内自然失败（见 `04-q2p2-timeline.tsv`）。

Q2 P2 的最小修复必须是“预算体系 + 阶段诊断”的组合，且属于 owner 决策（#137 提交信息已写明“若 600s 仍不够则拆测试并报告 owner，不得静默抬预算”）。

## 5. W34 预算自相矛盾

- `chief-workflow.test.ts:1703`：teamPlanning 用例预算 **18000ms**；
- `:1934`：documentChange 分支（teamPlanning 属于该分支）通知等待 **20000ms**；
- 即等待预算大于用例预算。x64 W34 在 18001ms 被测试级超时打断，teardown 才打印 `:1915` primary assertion。

最小修：teamPlanning 预算至少提升到 通知等待 + 团队派发等待 + 余量（建议 ≥45–60s），并与 turn 兜底修复同批验证。
