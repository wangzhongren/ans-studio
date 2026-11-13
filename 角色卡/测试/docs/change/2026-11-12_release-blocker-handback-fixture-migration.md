# v2.0.0 发布阻断（第八批 B8）：handback-delivery / queue-visibility 的 /proj 夹具迁移 + 两处 flake 同步缺陷修复（2026-11-12 任务，2026-11-13 完成）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.0.0 发布阻断 B8——把 `test/桌面应用/handback-delivery.test.ts` 与
  `test/桌面应用/queue-visibility.test.ts` 按第七批 B7-2 同法迁出 `/proj` 夹具族；同步 overlay 与打包
  精确钉；**两项已登记非回归待批不修、不改期望、保留红色并逐名上报**。
- 工作树/分支：`.claude/worktrees/release-v2.0.0-blockers-8` / `release/v2.0.0-blockers-8`，
  基线 `e0c5e01`（PR #92 合并后 main）。
- 授权与边界：客户已授权；**只写**上述两个测试文件、`src/common/装配/release-policy.mjs`、
  `test/装配/release-packaging.test.ts` 与本角色 `角色卡/测试/` 下文件。**未改 `app/desktop/session.ts`**
  （两处产品回归由桌面窗口角色修复，其记录见
  `角色卡/桌面窗口/docs/change/2026-11-12_release-blocker-handback-regressions-product.md`）；未改其他产品
  代码；未 commit/push、未触发 CI、未打 tag、未碰 main；未运行 Electron、未占用 9224/9223/9222；未读 `.env`。

## 〇、结论摘要（先读）

1. **两个文件完成 /proj 迁移**：字面量 `/proj`（listing / open / watchdogDeliver/Snapshot / send 与
   persistenceOperation 作用域 / policy 期望）全部替换为文件级 `fs.mkdtemp` 真实项目根；每处 open 断言
   `ok === true`；显式回执/开停/持久化等待全部加 10s 上限；`after`/`try-finally` 统一清理（放夹具门 →
   有界 `stop(null)` → 逐句柄 dispose → 临时根 `fs.rm` maxRetries/retryDelay）。断言未放宽、用例未删、
   未加 skip。
2. **两处间歇失败均判定为测试同步缺陷并修复（无断言放宽）**：
   - 夹具 `events()` 迭代器按固定静默窗口（120×5ms）自行 `done`，事件稀疏的用例在慢机上会让消费循环
     永久退出，之后推入的 `settled` 永不被消费（`attempts` 永不发生）。探针 5s 静默下必现
     （`b8-probe-iterator-window-5000ms.txt`，含 `ITER-DONE` 行且失败）；改为「直到 dispose 才收口」
     后同口径 5s 静默通过（`b8-probe-fixed-iterator-5000ms.txt`）。
   - 「连续回交投递失败」在「失败系统行出现」与「重试成功」之间存在合法竞态（产品允许同一次 settle
     级联内立即重试成功，b8-06 产品探针已证）；改为在**抛错点**定格失败瞬间的送达事实，断言内容不变。
     修复后聚焦复跑 **10/10**（`b8-flakefix-stress-run1..10.txt`）。
   - 「C frozen batch retries…」的两种竞态：① 首批认领可能发生在两份回交全部入队之前（首批被拆成
     单条）；② 失败与重试同批完成时 `attempts.length === 1` 的中间态被跳过。修复：以真实队列快照
     （`watchdogSnapshot`，与 queue-visibility 同数据面）为「两份都已入队」判据后再触发 settle；计数等待
     改 `>=` 并**新增精确条数断言**。修复后聚焦压测 **30/30**（`b8-frozenfix-stress-run1..30.txt`）。
3. **最终验证（本机 Windows 11 / Node v24.22.1）**：
   - `handback-delivery` 连续 3 次均为 **16 pass / 2 fail**，失败名逐次一致且仅两项已登记待批
     （§三）；文件自然退出（有失败 ⇒ EXIT=1，非挂起，每次约 10s）。
   - `queue-visibility` 连续 3 次 **2/2、EXIT=0**。
   - 8.3 短名 TEMP（`C:\Users\51054\AppData\Local\ANS-B8~1`）下：handback 16/18（同样两项待批；
     另补 3× 同结果）、queue 2/2；`os.tmpdir()` 确认为短名路径，mkdtemp 真实根在短名下正常。
   - `npm run typecheck` **EXIT=0**；`test/装配/release-packaging.test.ts` **22/22、EXIT=0**。
4. **overlay**：`release-policy.mjs` `files` 精确加入 `app/desktop/session.ts`、
   `test/桌面应用/handback-delivery.test.ts`、`test/桌面应用/queue-visibility.test.ts`（单文件不开目录），
   新增「第八批」注释段（保留既有注释不改写历史）；`release-packaging.test.ts` 新增第八批精确钉，并把
   第七批钉中已入列的 excluded 样本替换为仍 excluded 的样本、v1.8.0 钉中 `app/desktop/session.ts` 的
   fail-closed 样本替换为 `app/desktop/project.ts`（精确边界由第八批钉另行断言）。断言未放宽。
5. 三套冻结 known-red（runtime-core 33 / 门禁 5 / 编排 24）由统筹统一跑，**本角色未跑**。

## 一、/proj 夹具族核对表

根因同第七批：v2.0.0 B3-2b 起宿主库存登记以 native realpath 规范化项目根，不可解析即 fail-closed
（`git-host-project-root-unresolvable`）⇒ 会话开不起来、回合未开跑。本机遗留 `C:\proj`（2026-10-28）
使旧夹具在本地「全绿」；CI runner 无该路径（macOS 根目录下 `/proj`、Windows 当前盘符根下 `\proj`）。

| 文件 | 原 `/proj` 风险点 | 改法 | 最终 3× 结果 | 8.3 短名口径 |
| --- | --- | --- | --- | --- |
| `test/桌面应用/handback-delivery.test.ts` | listing（`listingWithSuAndA` / `trioHandbackListing`）、约 30 处 `mgr.open`、`watchdogDeliver`/`watchdogSnapshot`（含 dedupKey）、`persistenceOperation` scope、定向 `stop(scope)`、policy 期望字面量 | 文件级 `PROJECT_ROOT`（`before` mkdtemp / `after` 清理，listing/open/watchdog/持久化作用域同一根）；Harness 新增 `openOk`（有界 + `ok===true`）与 `close`（有界 stop）；管理器/句柄/夹具门注册进模块数组，`after` 放门 → 有界 stop → 逐句柄 dispose → `fs.rm(maxRetries:3,retryDelay:50)`；显式 send/定向 stop/持久化 Promise 全部 `settledWithin(…,10s)`；星形用例的临时根也补 maxRetries | **16 pass / 2 fail × 3**（失败名见 §三；EXIT=1，自然退出 ~10s） | handback **16/18**（`b8-final4-8dot3-handback.txt`；另 `b8-final-8dot3-handback-run1..3.txt` 3× 同结果） |
| `test/桌面应用/queue-visibility.test.ts` | `listing()` 的 projectRoot、2 处 open、忙态 `send` 作用域 | 同法：文件级 `PROJECT_ROOT`；Harness `openOk`/`close`；句柄注册 + `after` 有界 stop → dispose → rm；`send` 峰值等待加 10s 上限 | **2/2 × 3**（EXIT=0） | queue **2/2**（`b8-final4-8dot3-queue.txt`；另 `b8-final-8dot3-queue-run1..2.txt`） |

补充口径：

- 两文件 `events()` 夹具迭代器改为「事件流与会话同寿，直到 dispose 才 `done`」（详见 §二.1）。
  这不是无界等待产品回执：所有对产品回执/开跑的等待都有 10s 上限；迭代器只等 `after`/stop 的
  dispose，在 5ms 轮询内收口。
- 「回交合批后队列清空」随产品修复（桌面窗口角色恢复合批条件）转绿：queue-visibility 两例 3× 全过。
- 本机 `C:\proj` 不再被两文件读取；删除与否不影响测试。

## 二、flake 处置结论（测试同步缺陷；无断言放宽；均附探针证据）

### 2.1 事件消费因夹具迭代器静默窗口而永久退出（跨用例根因类）

- 夹具 `events()` 的 `next()` 旧实现 `for (tries < 120) { …; await 5ms }` 后返回 `done`：角色流在两段
  事件之间的静默一旦超过约 0.6s（慢机/CI/8.3 路径下实际墙钟更长），`for await` 消费循环结束且不再
  重启；此后推入的 `settled` 永不被消费 ⇒ `busy` 不复位 ⇒ 投递队列冻结。
- 探针证据：`b8-probe-iterator-instrumented.txt`（900ms 静默时未见 `ITER-DONE`，测试仍过）；
  `b8-probe-iterator-window-5000ms.txt`（5s 静默：`su:message:ITER-DONE su` 出现、`settled` 无人消费、
  用例失败）。**修复后**同口径 5s 静默：`b8-probe-fixed-iterator-5000ms.txt` 通过。
- 修复：两文件迭代器改为 `while (!stopped[roleId]) { … }`（dispose 后收口）。断言与等待预算未改。

### 2.2 「连续回交投递失败：整批保留同序，重试送达一次，原报告键不丢」的观测竞态

- 失败形态：`assert.deepEqual(harness.sent.su, ["先忙"])` 失败，实际已含完整批次（37ms 内失败）。
- 判定：**测试同步缺陷**。产品允许 `delivery.failed` 后在同一次 settle 级联内立即重试成功（桌面窗口
  角色探针 `b8-06-probe-retry-timing.txt`：`delivery.claimed`→`delivery.failed`→重试 `claim` 恰一次
  成功）。旧夹具「等到失败系统行再读 `sent`」时，重试可能已完成。
- 修复：在该用例的 su 句柄包装器**抛错点**定格 `sentAtFailure`（失败尝试未送达任何批文本），并把原
  `deepEqual(harness.sent.su, ["先忙"])` 改为断言该定格快照（内容不变、观测无竞态）。其余断言逐字保留。
- 修复后聚焦循环 **10/10**（`b8-flakefix-stress-run1..10.txt`）。

### 2.3 「C frozen batch retries keep members and delivery ID while later reports stay separate」的两种竞态

- 失败形态 A（12/25 压测中出现 9 次）：首投只含 1 份报告、另一份留在队列——首次认领发生在两份回交
  全部入队之前（commitHandback 异步入队与 settle 放行有合法交错），产品按「认领时队列中连续条目」
  合批，故首批被拆成单条。诊断快照见 `b8-probec-stress-run1.txt` 等的 `PROBE-C-B8` 行。
- 失败形态 B（12/25 中出现 3 次）：`attempts.length === 1` 的中间态被跳过（失败+重试同批完成，长度
  直接到 2），等待谓词永远不成立。
- 判定：均为**测试同步缺陷**。修复：① settle 前以真实队列快照等待「su 队列有且仅有 2 条 handback」；
  ② 计数等待改 `>= 1` / `>= 2` / `>= 3`，随后保留并新增**精确条数断言**（`attempts.length === 2` /
  `=== 3`），成员/顺序/同一 deliveryId/不同 attemptId 断言逐字未改。
- 修复后聚焦压测 **30/30**（`b8-frozenfix-stress-run1..30.txt`）。

## 三、两项已登记非回归待批（本批不修、不改期望、保留红色、逐名上报）

| 用例（失败名逐字） | 实际行为 | 裁定 |
| --- | --- | --- |
| `2026-10-24 trio 回交路由：项目 worker 回交→Steward；内置来源回交→Lead；同轮 settle 不双发` | 裸回交夹具缺 v2.0.0 来源门所需的真实任务账本事实 ⇒ `delivery-child-source-invalid: The persisted child report does not belong to this original creator`（fail-closed）；期望在 `waitUntil` 超时 | **非回归**（第七批 §5.3 已登记）。夹具下一批补 `task.created`/`task.reported` 真实账本，或按来源门钉 fail-closed；需产品/编排确认。 |
| `B 星形回交：tasks.jsonl 已知 taskId ⇒ 只投幕僚、[工作结果] 固定字段、写 task.reported` | 投递已发生，正文新增 `\n\n[收口依据尚不可用] …`（或 `[应用绑定的原创建者收口依据] …`）后缀（`session.ts` `prepareCreatedTaskClose` 接入）；`waitUntil(renderWorkReportPrompt 原文全等)` 超时 | **非回归**（第七批 §5.3 已登记）。期望更新为「原文 + 收口依据后缀」留待下一批。 |

两例在三次最终复跑与 8.3 复跑中失败名逐次一致；未改其期望、未加 skip、未删除。

## 四、验证（本机，2026-11-13）

1. **迁移前基线**（产品修复已在工作树）：handback 16/18（`b8-baseline-handback-delivery-run1.txt`）、
   queue 2/2（`b8-baseline-queue-visibility-run1.txt`）。
2. **最终代码连续 3 次**（`node --test --test-timeout=120000`）：
   - handback：16/18 ×3，EXIT=1 ×3，失败名仅 §三 两项：`b8-final4-3x-handback-run1..3.txt`；
   - queue：2/2 ×3，EXIT=0 ×3：`b8-final-3x-queue-run1..3.txt`（该文件此后未再改动）。
   - 迭代过程中另有 b8-3x / b8-final-3x 等中间轮次（含 flake 复现）留存于证据目录，最终结论以上述
     最终字节对应的 b8-final4 / b8-final-3x 为准。
3. **flake 专项**：§二 的探针与压测证据；最终全文件连续 3 次未再复现两类 flake。
4. **8.3 短名口径**（`cmd` 取短名：对新建长名目录 `ans-b8-shortname-verification` 查询得
   `C:\Users\51054\AppData\Local\ANS-B8~1`；`node -e "require('os').tmpdir()"` 确认返回短名）：
   `TEMP=TMP=C:\Users\51054\AppData\Local\ANS-B8~1 node --test --test-timeout=120000 …`：
   - handback：16/18（仅 §三 两项）：`b8-final4-8dot3-handback.txt`；补充 3×：
     `b8-final-8dot3-handback-run1..3.txt`；
   - queue：2/2：`b8-final4-8dot3-queue.txt`；补充 2×：`b8-final-8dot3-queue-run1..2.txt`。
   - 短名目录与取短名脚本已清理。
5. **typecheck**：`npm run typecheck` → `tsc --noEmit`，**EXIT=0**（`b8-final-typecheck.txt`）。
6. **打包测试**：`node --test --test-timeout=120000 test/装配/release-packaging.test.ts` →
   **22/22 pass、EXIT=0**（`b8-final-release-packaging.txt`）。
7. 三套冻结 known-red 由统筹统一跑，本角色未跑（按分工）。

## 五、overlay 与打包精确钉

- `src/common/装配/release-policy.mjs`：
  - `files` Set 精确新增 3 条（单文件不开目录）：
    `app/desktop/session.ts`（两处产品回归修复，桌面窗口角色实现，测试角色只列名）、
    `test/桌面应用/handback-delivery.test.ts`、`test/桌面应用/queue-visibility.test.ts`。
  - 新增「第八批」注释段：两处产品回归由桌面窗口角色修复（`e71501c` 引入：单模型回交合批被改为仅
    chief——恢复回交主人分支；`handleHandback` 形状防御前置）；两测试文件完成 /proj→mkdtemp 迁移并入列；
    **如实列出两项非回归待批**（trio 裸回交来源门、星形回交 `[收口依据…]` 后缀），不谎称全绿。
    既有各批注释逐字保留。
- `test/装配/release-packaging.test.ts`：
  - 新增第八批钉：3 条精确入列 + 相似名/同目录 excluded 样本；`app/desktop/session-extra.ts` 与
    `app/desktop/interface.ts` 仍 fail-closed（单文件不开目录）；第七批 B7-1/2 与 B7-3 既有条目仍入选。
  - 第七批钉的 excluded 样本中 `handback-delivery.test.ts` / `queue-visibility.test.ts` 已被第八批入列，
    替换为仍 excluded 的 `session-rebuild-race.test.ts` / `watchdog-reuse.test.ts`（注释说明边界由第八批
    钉另行断言，断言未放宽）。
  - v1.8.0 钉中 `app/desktop/session.ts` 已重新入列，fail-closed 样本替换为 `app/desktop/project.ts`
    （注释说明）。该文件最终 **22/22 pass**。

## 六、文件指纹（sha256，最终字节）

| 文件 | sha256 |
| --- | --- |
| `test/桌面应用/handback-delivery.test.ts` | `b187e209809efb0e89082e74fc7c03b0b3a9fa7326c71bd50b96e96e98b6ba85` |
| `test/桌面应用/queue-visibility.test.ts` | `626ad287f35df080dc328a1ca8b94d0604ef1cea4372942056202ae39090ae7d` |
| `src/common/装配/release-policy.mjs` | `c9605f5521de6c26fec2d03c800ae4b575092548f292b303de0d876c67e935a6` |
| `test/装配/release-packaging.test.ts` | `37d5d3ab1fef3f00b209206be9009ace3f12fcd4d6deba1187375222dcbdd3af` |

（`app/desktop/session.ts` 属桌面窗口角色写集，本角色未触碰；其 raw sha256 见对方记录。）

## 七、限制与披露

1. 本机 Windows 11 / Node v24.22.1；macOS 平台由发布流水线最终确认。本批**未触发 CI、未打 tag、
   未 commit/push**。
2. 本机遗留 `C:\proj` 使迁移前基线在本地「全绿」的假象成立；迁移后两文件不再依赖该路径。
3. 本工作树为链接 worktree（`.git` 为文件）；两文件的项目根为 mkdtemp 临时目录、不涉及仓库保护根判定，
   故本地（链接 worktree 内）即可全绿/稳定复现，无需 clean checkout。
4. 两处 flake 的修复是夹具同步口径调整（迭代器寿命、队列入队判据、失败瞬间定格），**未改产品代码、
   未放宽任何主断言**；另新增两条精确条数断言（只增不减）。
5. 两项非回归待批保持红色且逐名上报；其期望更新/夹具补账本按统筹安排留待下一批。

## 八、证据索引（`角色卡/测试/docs/change/_evidence/`）

| 组 | 文件 |
| --- | --- |
| 基线 | `b8-baseline-handback-delivery-run1.txt`、`b8-baseline-queue-visibility-run1.txt` |
| 最终 3×（handback） | `b8-final4-3x-handback-run1.txt`、`-run2.txt`、`-run3.txt` |
| 最终 3×（queue） | `b8-final-3x-queue-run1.txt`、`-run2.txt`、`-run3.txt` |
| 8.3 短名（最终字节） | `b8-final4-8dot3-handback.txt`、`b8-final4-8dot3-queue.txt` |
| 8.3 短名（补充 3×/2×） | `b8-final-8dot3-handback-run1..3.txt`、`b8-final-8dot3-queue-run1..2.txt` |
| flake 探针 | `b8-probe-iterator-instrumented.txt`、`b8-probe-iterator-window-5000ms.txt`、`b8-probe-fixed-iterator-5000ms.txt` |
| flake 压测 | `b8-flakefix-stress-run1..10.txt`（10/10）、`b8-frozenfix-stress-run1..30.txt`（30/30）、`b8-probec-stress-run1..25.txt`（修复前诊断） |
| 中间轮次（含 flake 复现） | `b8-3x-*`、`b8-final-3x-handback-*`、`b8-final2-3x-handback-*`、`b8-final3-3x-handback-*`、`b8-migrated-*` 等 |
| typecheck / 打包 | `b8-final-typecheck.txt`、`b8-final-release-packaging.txt`、`b8-final2-release-packaging.txt`（最终字节复核，22/22） |

## 九、复现命令

```powershell
cd C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-8
node --test --test-timeout=120000 "test/桌面应用/handback-delivery.test.ts"   # 16 pass / 2 已登记待批 fail
node --test --test-timeout=120000 "test/桌面应用/queue-visibility.test.ts"    # 2/2
node --test --test-timeout=120000 "test/装配/release-packaging.test.ts"       # 22/22
npm run typecheck                                                              # EXIT=0

# 8.3 短名口径（示例）：
#   新建长名目录后取短名：cmd -> for %I in ("<长名目录>") do @echo %~sI
#   设 TEMP/TMP 为短名路径，再跑上面两个测试文件。
```
