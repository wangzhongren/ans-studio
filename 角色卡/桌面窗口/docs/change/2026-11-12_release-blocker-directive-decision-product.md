# 桌面窗口 B3-1 记录：恢复 `@决策` 指令对 decision 卡生效（v2.0.0 发布阻断产品修复）

- 日期：2026-11-12
- 角色：ANS「桌面窗口」（roleId: 桌面窗口；独立固定上下文）
- 任务：v2.0.0 发布阻断 **B3-1 产品修复**——客户已授权（「替我审批应该等同于我自己审批」在 v2.0.0 的回归修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-3`
- 分支：`release/v2.0.0-blockers-3`；基线 HEAD：`12bef7c`（基于 `origin/main`）
- 性质：产品修复 + 自检记录（不替代独立验收）；**未 commit / 未 push / 未打 tag / 未触发 CI**；未运行 Electron、未占用 9224。

## 一、事实与依据

| 依据 | 路径 / 来源 | 与 B3-1 的关系 |
| --- | --- | --- |
| 测试角色挂起复盘 | `角色卡/测试/docs/change/2026-11-12_release-blocker-directive-decision-hang_evidence/before-timeout-repro.txt` | v2.0.0 下 `test/桌面应用/directive-decision.test.ts`：2 pass / 2 fail / 4 cancelled（4 例 15s 超时） |
| 测试角色诊断探针 | 同目录 `diagnostic-product-order-probe.txt` | 临时把 `isChiefBusinessCard` 分支移到 `tryApplyDirectiveDecision` 之后（未提交、已还原）⇒ 7 pass / 1 cancelled，证明是**产品分支顺序缺陷** |
| 回归引入点 | `git log -S"isChiefBusinessCard"` ⇒ `e71501c`（2026-11-07 v2.0.0 Chief 工作流 checkpoint） | 该提交在 `presentEntryNow()` 顶部插入幕僚分支，删除了旧 `tryAutoSelectDecision`，但把 C1 指令消费者留在了分支之后 |
| 客户授权 | 本轮任务授权 | 「替我审批等同于我自己审批」；`@决策` 指令在 v2.0.0 不得退化为死代码 |

## 二、根因（已核实）

`app/desktop/customer-input.ts::presentEntryNow`（修复前 `:2202-2215`）顺序：

1. `if (isChiefBusinessCard(entry)) { if (tryChiefDecision(entry)) return; presentNow(entry); return; }`
2. `if (tryApplyDirectiveDecision(entry)) return;`
3. `planJudge` / 默认路径。

`isChiefBusinessCard`（`:1903-1907`）对**所有非主权** `appointment/acceptance/decision/proposal` 卡返回 true；`tryChiefDecision` / `presentNow` 均不消费 `opts.directive` 指令。因此 `cardKind==="decision"` 且非应用主权卡时，第 2 步永远不可达 ⇒ **`@决策` 指令是死代码**：委托关闭时直接呈现客户卡（测试夹具无人作答 ⇒ 无界等待），委托开启时被幕僚分支抢先。

对比 `e71501c^`（v1.8.x 线）的同一函数：`tryApplyDirectiveDecision` 位于最前，第二是 `tryAutoSelectDecision`，再是 `planJudge`——B1 幕僚改造改变了顺序但未同步 C1 消费者优先级。

## 三、修复（只改 1 个产品文件）

`app/desktop/customer-input.ts`（M，+10/−4）：

- 把 `tryApplyDirectiveDecision(entry)`（连同 C1 注释）**移到 `presentEntryNow()` 最前**、`isChiefBusinessCard` 分支之前；注释补充「必须位于幕僚分支之前」及 B3-1 回归说明。
- `isChiefBusinessCard` 分支内部逻辑、`tryChiefDecision`、`presentNow`、`planJudge` 路径**逐字未改**。
- `isApplicationDecisionReservedForCustomer` 的主权卡排除语义**未改**（run-change/版本/VCA/修正案/stable-write/merge-main 仍不消费指令）。
- 同文件两处既有注释（`CreateCustomerInputChannelOptions.directive`、`tryApplyDirectiveDecision` 文档）同步为「幕僚分支 + `tryAutoSelectDecision` 之前」。
- 回落链不变：指令未命中/冲突/不匹配/失败 ⇒ 按 B1 冻结规则回落（`hadApplicable` 时直接 `presentNow`；否则递归 `presentEntryNow`，`directiveEvaluated` 保证不重复消费）。

完整 diff：`_evidence/product-fix.diff`（`d1c37f31…`）。

## 四、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/typecheck.txt`（`ad68aad0…`） |
| `node --test --test-timeout=8000 test/桌面应用/directive-decision.test.ts`（修复后） | **7 pass / 1 cancelled**；用例 8「坏账本」期望过时（见 §五） | `_evidence/after-directive-decision-test.txt`（`a89788d0…`） |
| 独立行为探针（不依赖待更新测试文件）修复前 | **A 用例 3s 未结算（指令未消费；before 缺陷表现）** | `_evidence/before-behavior-probe.txt`（`9f95e7af…`） |
| 同一探针修复后 | **4/4 PASS**：A 指令命中 answered/`directive:<id>`/不呈现客户/无 judge/once 已消费；B 未命中仍走幕僚分支（`operatorId:"chief"`）；C 未命中仍回落客户卡；D 主权卡（run-change）指令不消费、仍呈现客户 | `_evidence/after-behavior-probe.txt`（`1a2b8bc1…`）、探针源码 `_evidence/behavior-probe.mjs`（`8e31e5ee…`） |
| 测试角色 before 证据（同工作树） | 2 pass / 2 fail / 4 cancelled | `角色卡/测试/.../before-timeout-repro.txt`（未跟踪目录，未改动） |

探针经真实 `createCustomerInputChannel` + 真实 B1 指令运行时（临时目录账本；`createCustomerDirectiveRuntime`）运行，不启动 Electron、不触网、不写真实 userData。

## 五、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/customer-input.ts` | M | 165,000 / 2,886 | `12374b5fac17803c9392c997e1ca27f4a9a8c2971a32fbd5ceec6a678fcf9a66` | +10/−4 |

- 写集外改动 = 0（本角色未改测试文件、`release-policy.mjs`、`test/装配/**`）。

## 六、限制与披露

- **未 commit**：由测试角色统一提交/overlay；本记录不自嵌自身 SHA。
- **未运行 Electron**、未做真机 UI 验证；不占用 9224，不触发 CI、不打 tag、不 push。
- `directive-decision.test.ts` 用例 8（「坏账本 ⇒ 既有默认推荐路径不变，`judge:demo`」）**期望过时**：v2.0.0 `e71501c` 已删除旧 `tryAutoSelectDecision`，无适用指令（含坏账本）现在按设计落入幕僚分支/客户卡，不再走 `judge:demo` 代选。该用例超时取消由测试角色统一更新，本角色未改测试文件。
- 未跑全量测试套件；未验证委托开启 + 有指令时的组合路径（代码上指令最优先，先于 `tryChiefDecision`；探针 A/B 分别覆盖两侧）。
- 工作树中其它未提交改动（B3-2b 并发修复：`src/provider/trunk/impl/git-command.ts`、`test/runtime-core/project-root-canonicalization.test.ts`）**非本角色所做**，本角色未触碰。
