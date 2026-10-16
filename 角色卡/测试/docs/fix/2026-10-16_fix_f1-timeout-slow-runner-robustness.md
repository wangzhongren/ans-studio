---
id: f1-timeout-slow-runner-robustness
type: fix
title: F-1 独立复验文件（f1-timeout.test.ts）慢 runner 时序健壮化（测试角色）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-ci
related: [core-kanban-shell-exec-proposal, kanban-fixes-independent-verification]
events:
  - date: "2026-10-16"
    kind: fixed
    summary: 按运行时核心 spec 同口径硬化 test/测试/kanban-fixes-verify/f1-timeout.test.ts（微小时限→2000ms、上界→8000ms、pid 消失有界轮询 ≤10s）；断言意图逐条不变（20 断言/4 用例计数不变）；本机复跑该文件 4/4×4、test/测试 270/270、全量 0 红、typecheck 0；慢 runner 消解以 CI（macos-15-intel）复跑为准
---

# F-1 独立复验文件慢 runner 时序健壮化

## 结论

- **只动一个文件**：`test/测试/kanban-fixes-verify/f1-timeout.test.ts`（本角色白名单内），按运行时核心 spec（`角色卡/运行时核心/docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md` §慢 runner 时序健壮化）**同口径**硬化——微小时限 250/350/400ms → `microMs=2000`、等待/收口上界 → `boundMs=8000`、孙进程 pid 消失改**有界轮询 ≤10s**。**断言意图逐条不变，不放松语义、不 skip**（assert 计数 20→20、用例 4→4）。
- 本机复跑：该文件 **4/4（干净 ×2 ＋ 2×CPU 竞争代理 ×2）**；`test/测试/**` **270/270**；全量 `node --test "test/**/*.test.ts"` **0 红**（0 新红）；`npm run typecheck` **0 错**。
- **慢 runner 消解最终以 CI（macos-15-intel）复跑为准**；该文件的 overlay 白名单（精确路径）列入**已由装配并行落地**（in-flight `src/common/装配/release-policy.mjs` files 集合，本角色未动该文件）。

## ① CI 实证与归因修正

**v1.2.0 发布前 CI run 38881759770（macos-15-intel runner「Regression tests」）2 红，逐字落点＝本文件**（非产品缺陷）：

| CI 日志逐字 | 归因 |
|---|---|
| `✖ F-1 env 250ms：到期终止、如实文案、execution.timedOut；轮次信号不受影响、后续命令照常 (760ms)` → `test at test/测试/kanban-fixes-verify/f1-timeout.test.ts:40:1` → `AssertionError: 超时后后续命令须可继续：run_shell 超时已终止（250 ms）…` | 同一 env=250ms 时限把**后续快命令**也收口了——该 runner 上裸 node 进程启动开销 >250ms，快命令尚未跑完即撞时限 |
| `✖ F-1 孙进程终止：超时后进程组一并收口（孙进程 pid 消失） (433ms)` → `test at …:76:1` → `ENOENT … grandchild.pid` | 400ms 时限先于父脚本「启动＋派生孙进程＋写盘」收口，pid 文件未及落盘 |

**归因修正说明**：前一轮（v1.1.0 轮）同 runner 曾绿，本轮 2 红＝**runner 速度变异性 × 计时断言余量不足**；同 run 中运行时核心的同名真实用例（`test/runtime-core/shell-exec-timeout.test.ts`）**7/7 全绿**、本机该文件也 4/4 绿——**非产品缺陷**（运行时核心 §慢 runner 时序健壮化已把修正归因写入）；mac arm64 / Windows 同 run 全绿，红只落 macos-15-intel。

## ② 改动点与断言对照（"仅值同步"清单）

新增文件头 `慢 runner 口径常量`：`microMs=2000`（命令级微小时限）、`boundMs=8000`（等待/收口上界＝2000 + SIGTERM→250→SIGKILL→1000 清理预算 + 慢 runner 抖动余量）、`pidPollStepMs=100`、`pidPollBoundMs=10_000`。逐条对照（**全部为数值同步，判据/强度逐条不变**）：

| 位置（用例） | 改前 | 改后 | 断言意图（不变） |
|---|---|---|---|
| `:40` env 250ms 用例：env 值 | `"250"` | `String(microMs)`=2000 | env 生效时限到期终止 |
| 同上：用例标题 | 「env 250ms」 | 「env 2000ms」 | 标题随值（同一条） |
| 同上：收口上界 | `wall < 5000` | `wall < boundMs`(8000) | 有限收口、近时限处返回（非挂起） |
| 同上：文案 regex | `/超时已终止（250 ms）/` | 「超时已终止（2000 ms）」**由常量构造** | 如实文案 |
| 同上：`execution.timeoutMs` | `=== 250` | `=== microMs` | 超时事实 |
| 同上：diag `shell.exec.start.timeoutMs` | `=== 250` | `=== microMs` | 解析链生效值 |
| 同上：diag `shell.exec.timeout.timeoutMs` | `=== 250` | `=== microMs` | 超时诊断 |
| `:76` 孙进程用例：`shellExecTimeoutMs` | `400` | `microMs`(2000) | 挂起照触发终止（挂起为 `setInterval` 长挂起，2000ms 预算内脚本「启动＋派生＋写盘」稳完成） |
| 同上：pid 消失轮询 | `30×100ms`=3s | `pidPollBoundMs/pidPollStepMs`×100ms=**10s 有界** | 孙进程 pid 必须消失（进程组收口） |
| `:120` SIGKILL 升级用例：`shellExecTimeoutMs` | `350` | `microMs` | SIGTERM 免疫子进程被 SIGKILL 升级收口 |
| 同上：late 写入点 | `4000` | `3200` | 检查点晚于写入点（**断言非空转**：若未被收口，late 必已落盘） |
| 同上：检查前等待 | `1200` | `2800`（检查点 ≈收口 2250ms+2800 ≈5050ms > 写入点 3200ms） | 同上 |
| `:147` 解析链用例：env 值 | `"250"` | `String(microMs)` | 显式选项优先于 env（显式 `600000` 断言未动，不受 env 值影响） |

**未动（逐字保留）**：轮次信号 `aborted===false`、后续命令 `ok===true`＋`still-alive`、`timedOut===true`、pid 消失 `gone===true`、late 不出现、快命令 `ok===true`＋`timedOut===undefined`、显式 `timeoutMs===600000`。**计数稳定**：`assert.` 20→20、`test(` 4→4；无 skip、无删用例、无断言反向。唯一改动 diff 存档：`2026-10-16-f1-timeout-slow-runner-evidence/raw-f1-diff.txt`。

## ③ 复跑计数（本机 macOS arm64 / Node v24.14.0）

| 命令 | 计数 | 原始输出 |
|---|---|---|
| `node --test test/测试/kanban-fixes-verify/f1-timeout.test.ts`×2（干净） | **4/4，4/4**（exit 0） | `raw-f1-file-run1.txt` / `raw-f1-file-run2.txt` |
| 同上 ×2（**竞争代理**：2×ncpu=20 个 `yes` 忙循环并发存活期间） | **4/4，4/4**（exit 0） | `raw-f1-file-contention1.txt` / `raw-f1-file-contention2.txt` |
| `node --test "test/测试/**/*.test.ts"` | **270/270/0/0**（exit 0） | `raw-tests-scope-after.txt` |
| `node --test "test/**/*.test.ts"`（全量，改后） | **1722 计 / 1721 过 / 0 红 / 1 skip**（exit 0） | `raw-full-after.txt` |
| 全量（改前基线，同工作树） | **1682 计 / 1681 过 / 0 红 / 1 skip** | `raw-full-before.txt` |
| `npm run typecheck` | **0 错**（exit 0） | `raw-typecheck-after.txt` |

- **0 新红**：改后全量 0 红。计数差 +40（1682→1722）归因：**并行他角色在两次全量之间新增测试文件**（`test/codex-adapter/web-search.test.ts` 19:25:27、`test/pi-adapter/server-tools.test.ts` 19:28:44、`server-tools-wire.test.ts` 19:29:26 等，均在两轮之间新建）；本文件用例数 4→4 未变。1 skip 两轮同为既有 Windows-only（「规范化：Windows 大小写不敏感（仅 win32）」）。
- **竞争代理的性质如实标注**：2×ncpu 个忙循环的**代理**负载（非慢 runner 真环境；且当时本机另有他方会话的全量套件并行，load 一度 ~46-81，时间放大被稀释）——仅作「2000ms 级微时限 + 10s 轮询在 ≥2×CPU 饱和下不红」的余量旁证，不替代 CI。

## ④ 未验边界（如实）

1. **慢 runner 消解以 CI（macos-15-intel）复跑为准**——本机为快机（该文件干净复跑 9.2s），无法直证慢 runner 现场；spec 的现场实测（250ms 不及进程启动开销）来自该 CI runner。
2. 竞争代理 ≠ 慢 runner（见上）；极端事件循环延迟下 `:120` 用例的检查点算术（收口 ≈2250ms+2800ms > 写入点 3200ms，余量 ≈950ms−子进程启动开销）理论上可翻转——本机代理负载未触发，如实登记。
3. 本文件**无信号名断言**（与 `test/runtime-core/shell-exec-timeout.test.ts` 的 `assertKillSignal` 平台分支不同），故无平台分支改动；该文件在 run 38881759770 的 Windows / mac arm64 两 runner 同 run 全绿，但**硬化后**在其上的复绿同样以 CI 复跑为准。
4. overlay 列入已由装配并行落地（`release-policy.mjs` files 集合含本文件精确路径，**in-flight、本角色未动**）；对打包产物的构建树级验证不在本记录面内。

## 证据索引

目录 `角色卡/测试/docs/fix/2026-10-16-f1-timeout-slow-runner-evidence/`（均为原始输出）：

- `raw-f1-diff.txt`——唯一改动（旧→新 130 行 diff，全部为上述数值同步＋注释/常量）。
- `raw-f1-file-run1.txt` / `raw-f1-file-run2.txt`——干净复跑 ×2。
- `raw-f1-file-contention1.txt` / `raw-f1-file-contention2.txt`——竞争代理复跑 ×2（20 个 `yes` 并发存活）。
- `raw-tests-scope-after.txt`——`test/测试/**/*.test.ts` 270/270。
- `raw-full-before.txt`（19:22 基线 1682/1681/0/1）/ `raw-full-after.txt`（19:31 改后 1722/1721/0/1）。
- `raw-typecheck-after.txt`——typecheck 0 错。

## 边界与状态声明

只写 `test/测试/` 与本角色 `docs/fix/`（本记录＋证据）＋ memo 一行；**未改**任何 src/app/他角色文件（`release-policy.mjs` 只读引用）；**未 git 提交**；未碰 `/private/tmp` 与他方在飞改动。全量计数含他方并行在飞新增（已逐项归因）；本记录结论绑定当刻工作树。**慢 runner 消解最终以 CI（macos-15-intel）复跑为准。**
