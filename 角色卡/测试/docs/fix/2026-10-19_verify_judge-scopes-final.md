---
id: test-verify-judge-scopes-final
type: fix
title: shell 风险审查 / 决策 judge 意图漂移 / 自动验收派发整批改动的最终独立复核
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related:
  - "角色卡/编排/docs/change/2026-10-19_change_decision-judge-intent-drift.md"
  - "角色卡/编排/docs/change/2026-10-19_change_decision-evidence-packet.md"
  - "角色卡/编排/docs/change/2026-10-19_change_shell-judge-risk-scope.md"
  - "角色卡/编排/docs/change/2026-10-19_change_shell-judge-read-discipline.md"
events:
  - date: "2026-10-19"
    kind: created
    summary: 全仓复跑并补齐决策 judge 意图漂移契约缺口；全仓 3168/3162/4/2，4 红均为 HEAD 既有；typecheck 0
---

# shell 风险审查 / 决策 judge 意图漂移 / 自动验收派发整批改动的最终独立复核

## 任务与范围

对工作树中本批未提交改动（shell judge 改系统风险审查 + 读取预算/缓存/纪律；决策 judge
改**意图漂移审查** + 证据包 v2；shell 确认卡按实际角色显示标题；自动验收派发与冷启动
runtime 解析；判断读取范围/预算）做一次独立复核：

1. 跑全仓 `node --test "test/**/*.test.ts"` 与 `npm run typecheck`，记录真实计数；
2. 逐红判定：本角色目录（`test/测试/**`）因新契约产生的红按新契约补真实夹具，**不放宽断言**；
   其他角色目录只登记；
3. 用 `git archive HEAD`（cd20701）复跑已知红，确认是否 HEAD 既有。

本上下文只写 `test/测试/**` 与 `角色卡/测试/**`；未改产品代码、未提交 git。

## 全仓与域级计数（真实输出）

| 运行 | tests | pass | fail | cancelled | skipped | exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `node --test "test/**/*.test.ts"`（修复后，最终） | **3168** | **3162** | **4** | 0 | 2 | **1** |
| `node --test "test/测试/**/*.test.ts"` | 782 | 779 | 3 | 0 | 0 | 1 |
| `npm run typecheck` | — | — | — | — | — | **0** |

- 全仓 4 红全部是 HEAD 既有红（见下表），**本批新增红 0**；2 skip 为平台条件用例（Windows 反斜杠路径）。
- 首次全仓运行（修复前）在 4 个 `governance-e2e-auto` 文件上**无限挂起**（>10 分钟、CPU 0、
  无输出），已在 1663 pass / 3 fail 处停止（当时未跑到 t29）。根因见下文「逐红判定」；
  修复后全量 30.6s 内完成，无挂起。
- 定向套件（修复后复跑）：`governance-judge-cards-verify` **43/43**、
  `governance-e2e-auto` **30/30**、`shell-judge-verify` + `su-shell-approval-verify` **72/72**。

## 逐红判定

### A. 本批新契约导致的红（已按新契约补齐，原断言零放宽）

| 套件/用例 | 修前 | 失败签名 | 判定与处理 |
| --- | --- | --- | --- |
| `governance-judge-cards-verify` 10 例（proposal、accept-quick、appointment、acceptance、acceptance 机械门槛、required-read、负向与失败路径、JSON message、三引擎、driver 单卡） | 43 计 / 33 过 / **10 红** | `intent-missing`（实际 verdict 为 manual，期望 approve / 既有 reasonCode） | 决策 judge 新契约要求意图基准（`docs/intents/<id>.md` + 账本 `customer.decision{decisionKind:"intent-confirm", accepted}`）。按契约补真实意图文件 + 账本种子；真实 driver 的 `requiredReadPaths` 变为「意图 + 提案/提名」后，假判断脚本的读取集合同步补意图路径。断言方向、期望 reasonCode、0 卡/0 结果行等判定全部保持。 |
| `governance-e2e-auto` 场景 2a/2b/3/3b/6a/6e/7c + 五角色全链路（8 项） | 30 计 / 22 过 / 2 红 / **6 cancelled（超时挂起）** | `test timed out`（自动代批不再发生，`send` 等待整轮 ⇒ 卡在原卡上）；6a 期望 `/证据不足|未完成|待派发|阻塞/` 实得 `意图文件不可读`；7c 期望 `/判断超时/` 实得 `意图文件不可读` | 同上：从中段开始的场景补「已确认意图」前置（意图文件 + intent-confirm + intent.handed-off）；6a/7c 因此回到各自要测的机械门槛/超时路径。场景断言与强度不变。 |

补夹具要点（本角色目录内）：

- `test/测试/governance-judge-cards-verify/fixture.ts`
  - 新增 `INTENT_REL = docs/intents/flow-a.md` 与 `intentDoc()`（intentId/handoffKind/goal/scope/acceptance/flowId 齐全）；
  - `seedProject` 现在同时种意图文件与账本基线（`intent-confirm accepted` + `intent.handed-off`，power 均为 `liaison`）；
  - `writeLedger` 始终保留意图基线两行；`clearLedger` 改为「只保留意图基线」；
  - 导出 `intentLedgerEntries()`，供坏行场景构造「合法意图行 + 真实坏行」的账本。
- `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts`
  - 所有决策卡假判断脚本 `reads` 补 `INTENT_REL`（与系统选定的定点抽查集对齐）；
  - 账本坏行子场景保留合法意图行、追加一条非法行 ⇒ 仍测 `ledger-unavailable`，
    而不是被新的 `intent-unconfirmed` 优先级抢先（未改期望，只补前置数据）。
- `test/测试/governance-e2e-auto/fixture.ts`
  - 导出 `INTENT_REL`；`intentDoc(intentId, flowId)` 支持显式 flowId；`proposalDoc` 可选第三参
    `intentId`（写进 frontmatter，兼容定位来源）；
  - 新增 `seedConfirmedIntent(root, {intentId, flowId})`：写意图文件并向账本追加
    `intent-confirm accepted` + `intent.handed-off`（真实 `appendGovernanceLedger`）。
- `test/测试/governance-e2e-auto/{b-proposal-accept-timing,c-appointment-timing,f-acceptance-gate}.test.ts`：
  场景前置调用 `seedConfirmedIntent`（从中段直接出现提案/任命/验收卡，之前没有 Liaison 交接）。
- `test/测试/governance-e2e-auto/g-judge-timeout.test.ts`（7c）：先种意图，保证测到「判断超时」
  而不是意图定位 fail-closed。
- `test/测试/governance-e2e-auto/i-full-chain.test.ts`：提案 frontmatter 写 `intentId: intent-a`
  （契约明确支持的兼容定位来源），其余流程、账本断言、唯一手答卡断言逐字不变。原因见「残余风险」1。

### B. HEAD 既有红（非本批；`git archive HEAD` 干净基线复跑失败签名逐字相同）

| 文件:行（测试声明） | 失败签名 | HEAD（cd20701）复跑 |
| --- | --- | --- |
| `test/桌面应用/runtime-ui.test.ts:65`（其他角色目录，只登记） | renderer 源码含 `localStorage/import(` 等禁用原语 | **同样失败**（4 红中 1） |
| `test/测试/g2-verify/u1-renderer.test.ts:96` | 「来源恒空 ⇒ 无『来自 X』」 | **同样失败** |
| `test/测试/g5-reasoning-verify/g-desktop.test.ts:65` | 「值域逐项成选项（esc）」 | **同样失败** |
| `test/测试/t29-pi-config-roundtrip.test.ts:273` | 错误须列出合法值域（推理强度文案） | **同样失败** |

HEAD 基线复跑：4 文件 **33 计 / 29 过 / 4 红**，失败断言与工作树一致；判定为既有红，
本批未改这些文件、未放宽其断言。

### C. 其他角色域红

除上表 `test/桌面应用/runtime-ui.test.ts:65` 外，全仓无其他失败。`test/编排`、`test/桌面应用`、
`test/runtime-core`、`test/运行时核心` 等其他角色目录在本批全绿（其夹具已由对应属主同步）。

## shell / 自动派发契约核对

- `shell-judge-verify` 36/36、`su-shell-approval-verify` 36/36（修复前后均全绿）：系统风险口径、
  读取预算显式注入、确认卡标题按实际角色显示等新契约已被既有夹具覆盖，无需本批再改。
- `governance-e2e-auto` 覆盖自动验收派发（场景 4/6）、两段式推进（场景 2）、任命后写卡
  （场景 3）、冷启动/开关矩阵（场景 5/7/8）与五角色全链路，修复后 30/30。

## 跨角色遗留与残余风险

1. **意图交接的账本写入时序（跨角色：编排 + 桌面）**：`run-role` 的 `hand_off_intent` 包装器
   按「先投递成功、后写账本」执行，而桌面的 `deliverIntentHandoff` 会 `await sendBackground`
   （即等待 Rapporteur 整轮结束），`intent.handed-off` 只在这之后才入账。若 Draft 的提案
   frontmatter 不带 `intentId`，且意图文件又不叫 `docs/intents/<flowId>.md`，则首次提案卡的
   决策判断在账本里看不到 handoff，只能回落到 flowId 路径 → `intent-missing` → 原卡手动，
   且提示原因是「意图文件不可读」而客户其实已确认意图。客户手答后整轮结束、账本补写，因此
   **不是死锁**，但会产生一次误导性的手动卡。本角色在 `i-full-chain` 用提案 frontmatter
   `intentId`（契约明确支持的第三级兼容来源）保证夹具确定性，并在此登记，建议编排/桌面属主
   评估：把 handoff 账本写在投递前，或让意图定位在 handoff 尚未落账时回落到「同 flow 的
   intent-confirm 决定 + 意图文件」。
2. **e2e 等待语义**：决策卡若真实回落手动，`send` 会等客户作答；没有作答的用例会以超时
   （`test timed out`）而不是断言失败暴露问题。本批已在受影响用例补前置意图，建议后续新增
   e2e 用例对「预期 0 卡」路径保持有界等待，避免挂起型失败。
3. **HEAD 既有 4 红**：属其他上下文/既有提交，未在本批修改；其中 3 红位于本角色目录
   （u1-renderer、g-desktop、t29），本批只确认其非本批引入，未越权改断言。
4. **意图正文摘录/多意图从严**等编排侧已知残余，不在测试域复述；见编排变更记录。

## 结论

- 本批改动在测试面的契约缺口已全部补齐：全仓 **3168 / 3162 pass / 4 fail / 2 skip**，
  4 红均为 `git archive HEAD` 复现的既有红；**新增红 0**；typecheck **0 错**。
- 未修改任何产品代码、未放宽断言、未提交 git。测试通过只代表已覆盖场景通过，不代表客户业务确认。
