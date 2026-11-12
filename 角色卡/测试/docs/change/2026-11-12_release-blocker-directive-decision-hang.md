# v2.0.0 发布阻断 B3-1 测试记录：directive-decision 无界等待 / 用例 8 语义 / authorization-plane 回归（2026-11-12）

- 角色：ANS「测试」（roleId: 测试；独立固定上下文）。
- 任务：v2.0.0 发布阻断 **B3-1 测试侧**（客户已授权本轮发布阻断修复，含产品/测试精确 overlay）：
  1) `test/桌面应用/directive-decision.test.ts` 全部 `customerInput`/结算等待有界、用例 8「坏账本」按
     v2.0.0 语义更新；2) `test/测试/customer-authorization-plane-integration.test.ts` 回归并做最小同口径修复；
  3) 测试侧 overlay 条目与记录。
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-3`
- 分支/基线：`release/v2.0.0-blockers-3`，基于 `origin/main` `12bef7c`。
- 保留并一并提交的其它角色改动：桌面窗口 `app/desktop/customer-input.ts`（B3-1 产品修复）与运行时核心
  `src/provider/trunk/impl/git-command.ts` + `test/runtime-core/project-root-canonicalization.test.ts`
  （B3-2b 8.3 根归一），以及两角色记录/证据。本角色未修改它们的代码/记录。
- 声明：未运行 Electron、未占用 9224、未触发 CI、未打 tag；本记录与证据随 blockers-3 分支提交。

## 一、CI 事实

| 项 | 值 |
| --- | --- |
| CI run / job | `43138943189` / `130920941222`（`build (macos-15, mac, arm64)`，conclusion `cancelled`） |
| 测试命令 | `.release/source` + `node --test --test-concurrency=1 "test/**/*.test.ts"`（无 `--test-timeout`） |
| 时间线 | Regression tests `02:06:35Z` 开始；最后输出 `02:11:16Z`（`test/桌面应用/decision-service.test.ts`）；之后约 39 分钟零输出，`02:50:38Z` 被取消 |
| 本文件 before 复现 | 同工作树产品修复前：`node --test --test-timeout=15000 test/桌面应用/directive-decision.test.ts` ⇒ **2 pass / 2 fail / 4 cancelled**（用例 1–3、8 各 15s 超时取消；用例 4/5 断言失败） |
| 证据 | `_evidence/before-timeout-repro.txt`（历史，保留）；`_evidence/diagnostic-product-order-probe.txt`（临时把幕僚分支移到指令消费者之后 ⇒ 7 pass / 1 cancelled，证明为产品分支顺序缺陷） |

## 二、根因链（已由桌面窗口角色修产品、本角色修测试）

1. `e71501c`（2026-11-07 v2.0.0 Chief workflow checkpoint）在
   `app/desktop/customer-input.ts::presentEntryNow()` 顶部插入幕僚分支
   `isChiefBusinessCard → tryChiefDecision/presentNow`，同时删除旧 `tryAutoSelectDecision`，但把
   C1 `tryApplyDirectiveDecision` 留在幕僚分支之后。
2. `isChiefBusinessCard` 对**所有非主权** `decision` 卡为 true；幕僚分支不消费 `opts.directive`
   ⇒ `@决策` 指令在非主权 decision 卡上是死代码（委托关闭时直接呈现客户卡；委托开启时被幕僚抢先）。
3. 测试侧后果：
   - 指令应结算的用例（1/2/3/8）落回客户卡、无人作答，`await customerInput` **无界挂起**；
   - 冲突/不匹配用例（4/5）在快速断言处失败（`pushed.length`/`notices` 与预期不符），但本身不挂；
   - CI 无 `--test-timeout`，该文件可无限挂起 ⇒ 与 triage 的“挂起后 45 分钟取消”一致。
4. 产品修复（桌面窗口角色，已在本工作树）：把 `tryApplyDirectiveDecision` 移到 `presentEntryNow()`
   最前（幕僚分支与默认推荐之前），保留 `isApplicationDecisionReservedForCustomer` 主权卡排除。
   本角色 `_evidence/diagnostic-product-order-probe.txt` 的临时顺序探针与该修复方向一致。

## 三、测试修复（`test/桌面应用/directive-decision.test.ts`）

### 3.1 全部 9 处等待有界

按 blockers-1（PR #86）同款模式新增：

- `bounded<T>(value, ms, what)`：`Promise.race` + 定时器，超时抛
  `「<挂起点>：有界等待超时（5000ms）——疑似卡片被呈现给客户而无人作答」`，定时器在 `finally` 清理；
  接受 `T | Promise<T>`（`customerInput` 的返回类型含同步值联合）。
- `waitUntil(check, 5000, what)`：有界轮询（10ms），用于等待客户卡真正呈现后再断言。

9 处对应关系：

| # | 用例 | 原等待 | 现有界等待 |
| --- | --- | --- | --- |
| 1 | select-recommended | `await customerInput` | `bounded(..., 5000, "用例 1：指令代选结算")` |
| 2 | select-option 代选 | `await customerInput` | `bounded(..., "用例 2：select-option 代选结算")` |
| 3 | 拒绝 | `await customerInput` | `bounded(..., "用例 2：拒绝指令结算")` |
| 4 | session 第一次 | `await customerInput` | `bounded(..., "用例 3：session 指令第一次应用")` |
| 5 | session 第二次 | `await customerInput` | `bounded(..., "用例 3：session 指令第二次应用")` |
| 6 | 冲突 | `pending` + `await tick()` | `waitUntil(pushed===1)` + `bounded(pending, "用例 4：冲突后客户手选结算")` |
| 7 | 不匹配 | `pending` + `await tick()` | `waitUntil(pushed===1)` + `bounded(pending, "用例 5：不匹配后客户手选结算")` |
| 8 | 可见行失败 | `pending` + `await tick()` | `waitUntil(pushed===1)` + `bounded(pending, "用例 6：可见行失败后客户手选结算")` |
| 9 | 坏账本 | `await customerInput` | `waitUntil(pushed===1)` + `bounded(pending, "用例 8：坏账本客户手选结算")` |

超时即如实失败并指出挂起点；断言未放宽、未删用例、未加 skip。

### 3.2 用例 8「坏账本」v2.0.0 语义

旧期望 `outcome.operatorId === "judge:demo"` 来自 `e71501c` 已删除的 `tryAutoSelectDecision`（decision 卡
「默认推荐 judge 代选」），v2.0.0 中 **decision 卡不再进入 judge**（`planJudge` 对 `decision` 直接
`undefined`）。坏账本（`ledgerErrors>0`）按无指令回落，本夹具未开委托 ⇒ 原卡呈现客户本人。

更新后的断言（主断言加强、不放宽）：

- 坏账本按无指令：`h.results.length === 0`（不产生指令生效行）、`outcome.directive === undefined`；
- `h.judgeResults.length === 0`（v2.0.0 无默认推荐代选；开关 `decisionEnabled:true` 也不会复活）；
- 用客户 responder 结算（`channel.respond`），`outcome.operatorId === "tester"`（不是 `directive:`/`judge:`）；
- 坏账本如实处理：`runtime.list().ledgerErrors > 0` 且 `runtime.decisionFacts().ledgerErrors > 0`。

## 四、authorization-plane 回归（`test/测试/customer-authorization-plane-integration.test.ts`）

- 产品修复后初次运行（`--test-timeout=120000`）：**5 pass / 1 cancelled**——「坏账本」用例仍按旧期望
  `judge:demo` 等待，未自动结算 ⇒ 120s 取消。其余 5 例（含指令代选/拒绝/冲突/重启/Q9）通过。
- 同口径最小修复：
  - 新增 `waitUntil`/`bounded`；4 处直接 `customerInput` 等待与 2 处 `pending` 结算全部有界；
  - 「坏账本」用例标题与期望按 v2.0.0 更新：`decision 卡按无指令交客户（v2.0.0 无默认推荐代选）`；
    断言 `results.length === 0`、`judgeResults.length === 0`、客户 responder 结算
    `operatorId === "tester"`、`outcome.directive === undefined`；approval/decision facts 与 shell 闸
    既有断言逐字保留（shell 闸仍回落 operator 拒绝）。
- 最终：**6/6 pass，exit 0**（`_evidence/authorization-plane-regression.txt`）。

## 五、另一个受产品修复影响的测试：chief-workflow W1b（如实披露）

`test/桌面应用/chief-workflow.test.ts` 的 W1b 夹具创建了一个**项目级** `@决策 选推荐项` 预设，并断言
`presetCalls === 0`、预设不被消费（标题「旧@预设不截流」）。该断言与 `e71501c` 的死代码顺序同源：产品
修复恢复 C1 优先后，匹配的预设会按客户指令代选，W1b 的旧前提不再成立（3 例确定性失败；以 HEAD 版
`customer-input.ts` 临时复跑 3/3 pass，证据 `..._chief-workflow-cleanup_evidence/w1b-without-product-fix.txt`）。

处理（最小、保留 W1b 主断言）：

- 预设 scope 改为**其他 flow**（`@决策 选推荐项 flow=legacy-preset until=once`），不再匹配 worker 的
  `focus` decision 卡；still durable active、`consumed.length === 0`；
- `presetCalls` 期望从 `0` 改为 `> 0`，说明「旧预设被指令消费者优先如实查询，但不同 flow ⇒ 不匹配/
  不截流」；W1b 的幕僚委托主断言（independentCalls、worker/chief 回执、`by:"chief-delegated"`、
  `actionSource`、选项与证据链）逐字未改。
- 匹配预设的指令优先语义由 `directive-decision.test.ts` 覆盖。

该调整属 B3-1 产品语义对齐，不是 B3-3 清理改动；B3-3 记录另附。

## 六、验证

| 项 | 结果 | 证据 |
| --- | --- | --- |
| directive-decision 连续 3 次（无 `--test-timeout`，进程自然退出） | **3 × 8/8 pass，exit 0** | `_evidence/after-3x.txt` |
| directive-decision `--test-timeout=120000` | **8/8 pass，exit 0** | `_evidence/after-timeout-120000.txt` |
| authorization-plane 集成（`--test-timeout=120000`） | **6/6 pass，exit 0** | `_evidence/authorization-plane-regression.txt` |
| `npm run typecheck` | **exit 0** | `_evidence/typecheck.txt` |
| `test/装配/release-packaging.test.ts` | **16/16 pass** | `_evidence/release-packaging.txt` |
| 冻结 known-red runtime-core | 602 tests / 565 pass / **33 fail** / 4 skipped；逐名 diff 空 | `_evidence/knownred-runtime-core.txt`、`_evidence/knownred-diffs.txt` |
| 冻结 known-red 门禁 | 577 tests / 571 pass / **5 fail** / 1 skipped；LF 归一后逐名 diff 空（运行后已还原 CRLF） | `_evidence/knownred-gates.txt`、`_evidence/knownred-diffs.txt` |
| 冻结 known-red 编排 | 1385 tests / 1359 pass / **24 fail** / 2 skipped；逐名 diff 空 | `_evidence/knownred-orchestration.txt`、`_evidence/knownred-diffs.txt` |
| chief-workflow 全文件（B3-3 目标） | **58 pass / 8 fail / 0 cancelled**；8 名均为已登记既有族（W5/W10 子、W19、W33、W34），无 B3-3 新增 | 见 B3-3 记录与 `..._chief-workflow-cleanup_evidence/` |

known-red 计数与基线一致（runtime-core 33 / 门禁 5 / 编排 24），新增确定性失败 0、新 skip 0。

## 七、overlay（`src/common/装配/release-policy.mjs`）

本批精确加入（各 1 条，单文件不开目录）：

- 生产 1：`app/desktop/customer-input.ts`——B3-1 C1 `@决策` 指令优先恢复；
- 测试 3：`test/桌面应用/directive-decision.test.ts`、`test/测试/customer-authorization-plane-integration.test.ts`、
  `test/桌面应用/chief-workflow.test.ts`——有界等待 / 过时期望 / 清理竞态，断言未放宽；
- 既有 blockers-2 条目 `src/provider/trunk/impl/git-command.ts` 与
  `test/runtime-core/project-root-canonicalization.test.ts` **已在白名单，不重复添加**；
- `test/装配/release-packaging.test.ts` 同步新增 B3-1/B3-3 精确路径入列钉 16/16；原 v1.9.1 历史用例中
  「`app/desktop/customer-input.ts` 未入列即 fail-closed」的负例改用仍未入列的 `app/desktop/interface.ts`，
  fail-closed 保证不放宽。

## 八、限制与残余（如实披露）

1. 本机为 Windows 11 / Node v24.22.1；未在本机运行 macOS，macOS arm64/x64 由 CI 验证。
2. 未运行真实 Electron / 未占用 9224；未做 UI 真机验证。
3. **残余（本批不碰，需后续授权）**：`src/provider/trunk/impl/git-trunk-store.ts:1160 assertControlPaths`
   在 8.3 短名根下把同一真实目录误判 `git-control-path-unsafe`（W29×3/W30×2 短名 TEMP）；属运行时核心
   相邻文件，待协调方授权后按同一 native realpath 规则单独修复。
4. **既有红（非本批根因）**：W33/W34 普通 TEMP 的 close-notice/`run-plan-` 断言 + `ENOTEMPTY`；W19
   `closeCreatedTask` 不通知契约；W5/W10 子测试的已知非确定性族；W36 测试 HTTP 桩 `TypeError`（漂移项）。
   本批 chief-workflow 目标运行 58/8 与 before 49/17 相比，清理族（W14/W20/W22/W28/unmanaged）已消失，
   剩余 8 名均为上述已登记族。
5. 未跑全仓 `test/**`；只跑目标文件 + 三套冻结 known-red + 打包测试。
6. 本记录不自嵌自身 SHA；文件 SHA-256 由调度/验收按工作树复核。
