# W1 实施证据：删除全部预知式门控（运行时核心）

- 任务：`2026-11-08-remove-predictive-gates` / 批次 **W1**（派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §四）。
- 角色：运行时核心（`roleId: 运行时核心`，Section 1 写集；独立实施上下文）。
- 实施基准：方案 **P1.4** `docs/planning/2026-11-08_design_git-write-init-approval-based.md`（§3.2 A1/A2/A5/A9/C9/D6/D8/F5/R9、§3.7 drain 谓词、§4.5/§6.1 测试同步、§8 复核处置）；B1 v1 `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`；I0 冻结（派发记录 §三，I0-3/I0-7）。
- 日期：2026-11-08。状态：**已实施、已跑确定性测试与 typecheck；未 commit / 未 push / 未 stash / 未 merge / 未发布**。

## 1. 基线

| 项 | 实测 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 | `feat/plan-escalation-card` |
| HEAD | `3f249e2fee1753531d6b566eefc7a64016e863a7`（tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`） |
| 起始工作树 | `git status --short -- src app test` 输出为空（0 行；`src/app/test` 干净） |
| 并行批次说明 | 实施期间 W3a（编排，独立上下文）在同一 worktree 并行修改 `src/provider/trunk/impl/git-command.ts`、`src/provider/trunk/public/trunk-store.ts`、新增 `test/编排/git-action-authorization-sidecar.test.ts`。**上述文件不属于本证据的改动集**，本证据候选仅含 §2 表格中的文件（写集两两不相交，见团队计划 §4.5）。 |
| 参考基线（只读） | 第一变更 E3 T3 组合 4,982 / 4,753 pass / 196 fail / 1 cancelled / 32 skip（派发记录 §一）；本批只对 **runtime-core 受影响套件**做前后对照（见 §5）。 |

## 2. 改动文件与逐文件 SHA-256（前 → 后）

| 文件 | 前置（HEAD blob） | 后置（工作树） |
| --- | --- | --- |
| `src/model/runtime.ts` | `7d2eb986cb00c878d4ce9b0b328eea605f216465b55ebc3c849e6e36d24a28a3` | `b4164765c47c8917d8a46e50a07ef28883d7ac6085eb29fc45bcd80cb932ff49` |
| `src/service/runtime/session.ts` | `b054ff7b5ea46c6c0b1d790787d6f7068db07b86ce1774c3f54ddfbc05bd4b6d` | `51c9a56ec633604c6b8d9beaeda4a1c3b7d66bf69719de836d5807c2668f3cc6` |
| `test/runtime-core/git-capability-tools.test.ts` | `5690832e4b70d144d10caaa284ae543dc5f8eee73594b37438c1a132fe86a5da` | `93bb78c228dffe7ecb0637e53db0133e7540dea8a1cc57414e7def6ffb8e3481` |
| `test/runtime-core/session-lifecycle.test.ts` | `f7826e15f621919452b1f470670219b90d2cbf48f8a2a33fa7f598a1566dce4c` | `2904f4a932400065141a1768b7ed1f9239f8b7e075fd7c7a089c398207489098` |
| `test/runtime-core/drain-predicate.test.ts` | —（新增） | `62e73b75efc537bbb0ad35d745da7931a13deb5062939bdca2953886a14e8c7a` |
| `test/runtime-core/codex-native-optional.test.ts` | —（新增） | `d9d3d75b470f9b3b5549f3c01d9a0f88ae0ad2545bd0d5e14ba0511b0ce42342` |

> 后置哈希计算：`sha256sum <file>`（工作树字节）。未改动其它 `src/`、`test/`、`app/` 路径；未写 `docs/`（除本证据目录）、角色边界/YAML、方案、B1/团队计划。

## 3. 关键实现决策

### D1. `src/model/runtime.ts`：drain 纯函数（P1.4 §3.7 / I0-3 冻结）

- 新增导出 `isRuntimeSessionDrained(facts)` 与两个显式白名单集合 `DRAIN_EVIDENCE_ONLY_REASONS`、`DRAIN_NATIVE_EVIDENCE_REASONS`。
- 白名单字面量与代码实测**逐字一致**（无差异，无需列差异项）：
  - 包装层（`src/service/runtime/session.ts` `collectLifecycle` 产生）：`native-provider-not-proven-quiescent`、`native-provider-process-coverage-unavailable`。
  - `native:` 前缀 reason（包装层加前缀）取自 `src/common/pi-adapter/real-adapter.ts:1460-1465` 与 `src/provider/claude/session.ts` 的 coverage/transport-close 两条声明：
    - `native:pi-sdk-owned-process-tree-coverage-unavailable`
    - `native:pi-sdk-http-transport-close-unobservable`
    - `native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.`
    - `native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown.`
- 谓词：`providerFinished && activeTools.length===0 && processes.every(p => p.state==="exited" && (p.treeStatus==="verified" || p.kind==="background")) && reasons.every(r => allowlist.has(r))`；**未列/未知 reason 默认阻断**（含 `native:pi-sdk-idle-not-observed`、handler-running/not-terminal/mcp-process-coverage、native read failure、`real-provider-settled-not-observed`、cleanup 类、custom disposal）。
- 不要求 `status==="quiescent"` / `processCoverage==="complete"` / `native` 存在。`RuntimeCoreConstructionFacts` 增加**加法可选字段** `trustedPurePreparation?: boolean`（A9/D6「保留为可选证据字段」的公开投影；不参与判定）。

### D2. `session.ts` F5/R9：Codex native 计划仅作可选强证明

- `prepareRole`：Codex `prepareNative()` 结果仅在 `facts.status==="observed"`、`factory/transport/wire` 匹配、无 foreign MCP/native builtin/planned processes/reasons、**adapter 存在**、`isCurrent()`、appTools 一致时才投影进 `plan.native`；否则**省略 `native`**。原 `native-factory-plan-unverified/unavailable/preparation-failed` 三条创建拒绝 reason **不再产生**（证据保留在适配器 `RuntimeNativeFactoryPlanFacts.reasons`）。
- `ensureAdapter`：`nativePreparation` 存在但**无 adapter** 时**回落工厂构造**（`construction.factoryEntered=true`；entry reason 记 `legacy-bind-without-precreation-plan`），不再抛 `runtime-prepared-configuration-changed`；带 adapter 的可选强证明仍要求 `isCurrent()`。
- `bindRole`：`creationPlan.native` 存在时用导出纯判据 `matchesRuntimeNativeFactoryPlanBinding(...)` 核对：`present-but-changed` ⇒ `runtime-native-factory-plan-binding-unverified`；`absent` ⇒ 不核对、不拒绝。
- **服务级 `isCurrent()` 收窄**（F5 的必要闭环）：仅当 `nativePreparation?.adapter` 存在（即强证明被采用）时要求 `nativePreparation.isCurrent()`；无 adapter 的可选证据不阻塞准入/回落。理由：否则 responses/MCP/WebSearch/自定义传输等 native 不可用路径仍会因 `nativePreparation.isCurrent()===false` 以 `runtime-prepared-configuration-changed` 拒绝创建，与 F5/P1.2-AC-27 直接冲突；options/role 漂移仍由服务自身快照判定，工厂构造时经 `prepared ?? resolveCodexBinding(options)` 重新解析配置，fail-closed 方向不变。

### D3. `session.ts` A9/D6：`official-pure-preparation-unproven` 退役

- `construction` 闭包不再以 `trustedPurePreparation` 产生 reason；`construction.status` 只由真实边界（`factoryEntered`/`nativeBindEntered`/`pendingContinuations`/`preparedTokensRevoked`）决定。`trustedPurePreparation` 仅作为可选证据字段记录与投影（D1）。

### D4. `session.ts` C9：`stopAndInspect` 与 disposed receipt 使用中性 drain

- disposed 分支：`status==="quiescent"` 快路径，或 `isRuntimeSessionDrained(disposalReceipt)` ⇒ 返回 receipt；否则 `disposed-lifecycle-evidence-unavailable`。
- 活动排空循环：`facts.status==="quiescent"` 或 `isRuntimeSessionDrained(facts)` 即返回（不默认耗满每成员预算）；非 drain 时仍按原口径耗尽预算并如实返回 `stop-drain-budget-exhausted`。
- `refreshDisposalEvidence`：`disposed-lifecycle-evidence-unavailable` 标记改为**仅在 drain 不成立时**附加；drain 成立时保留终端事实原样（status 仍如实可为 `unknown`，不强行改写）。理由：若继续按旧口径无条件附加该标记，Claude/Pi 的 disposed receipt 会因一个非白名单 reason 永久不可 drain，W2 的 H11/disposed 检查与 B1 AC-8 无法成立。custom factory 的 `custom-provider-disposal-coverage-unverified` 等 F6 阻断项仍使 receipt 不可 drain（已有测试断言）。

### D5. D8：native lifecycle reasons 如实保留

- `collectLifecycle` 未改动：`native:` 前缀映射与全部 native reasons 继续记录（证据），仅由 drain 谓词决定是否阻断。

### D6. 未改动（契约保持）

- `inspectToolSurface` / `composeRuntimeApplicationMediation` / `RuntimeSessionToolSurfaceFacts` / `applicationMediation` 语义未改（PR #72；回归见 `test/runtime-core/application-mediation.test.ts` 全绿）。
- A1 复核：`hasUnconfinedScriptTools` 与 `required-scope-unconfined-script-tools` 在 `src/`、`app/` 零生产产生（仅存注释/测试断言）。
- A2/A5：Claude/Pi 无 native 分支不变；Codex 见 D2。A11/A4 断言保持（`test/runtime-core/git-capability-tools.test.ts` R15/R12 段未改）。

## 4. 新增/更新测试

- 新增 `test/runtime-core/drain-predicate.test.ts`（5 个用例）：I0-3 白名单逐字冻结、基础真值表、Claude/Pi 形态（status/processCoverage unknown、native absent 仍 drained）、显式白名单组合不阻断、**全部阻断 reason 清单**（含 `native:pi-sdk-idle-not-observed`、handler-running/not-terminal/mcp-process-coverage、native read failure、`real-provider-settled-not-observed`、cleanup failures、custom disposal、未知 reason 与近似串）。
- 新增 `test/runtime-core/codex-native-optional.test.ts`（4 个用例）：responses 不可用仍准入 + plan 省略 native + `ensureAdapter` 回落（spawn 打桩证明工厂边界被进入、错误非 `runtime-prepared-configuration-changed`）；WebSearch 不可用 + 受保护 + shell + 审批链成立仍准入且 plan 省略 native；native observed ⇒ plan 记录强证明、真实绑定成功、`matchesRuntimeNativeFactoryPlanBinding` 逐字段 `present-but-changed` 拒绝矩阵；A9/D6 退役与真实边界。
- `test/runtime-core/session-lifecycle.test.ts`（+3 用例）：F7 活动循环 drain 即返回（Claude/Pi 覆盖 unknown 不耗满预算；custom-factory disposed 仍按 F6 阻断）；default-production Claude 未运行会话的 disposed receipt 以中性 drain 返回且 registry lifecycle 可消费；非 idle Pi（`native:pi-sdk-idle-not-observed`）保持阻断（预算耗尽/ disposed 标记）。
- `test/runtime-core/git-capability-tools.test.ts`（R14 两阶段再改写 + R12 原生计划用例改写）：见 §6。

## 5. 命令与原始结果

### 5.1 实施前（受影响套件 = `test/runtime-core/**`）

- 首次用默认并发跑（`node --test "test/runtime-core/**/*.test.ts"`）得到 67 个失败：其中多数为跨文件共享 `process.cwd()` 宿主租约/保护范围（`runtime-protection-scope-unknown`）在并行下的相互干扰；按团队计划 §1.2/参照口径改以 **`--test-concurrency=1`** 顺序执行作为基线（默认并发日志保留作旁证，不用于对照）。
- 基线命令与结果（日志 `2026-11-08_W1_evidence/before-runtime-core-concurrency1.log`）：

```
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"
ℹ tests 523
ℹ pass 486
ℹ fail 33
ℹ cancelled 0
ℹ skipped 4
NODE_EXIT:1
```

- 33 个失败为**既有环境性红**（例：`process.cwd()` 检出根无 `.ans/project.json` ⇒ `runtime-protection-scope-unknown` 的 R12/R8/registry 用例、既有 abort/timeout/reason 用例等）；已逐条保留于基线日志，本批不以任何方式改写这些用例。

### 5.2 实施后（同一命令、同一环境）

- **最终候选**日志 `2026-11-08_W1_evidence/after-runtime-core-final2.log`（同命令；前一版 `after-runtime-core-final.log` 仅差一个新增用例标题的措辞，保留作旁证）：

```
ℹ tests 535
ℹ pass 498
ℹ fail 33
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
ℹ duration_ms 48104.3471
NODE_EXIT:1
```

- **失败集合逐条对照**：以测试名（文件+用例名）排序后 `diff` 基线 vs 实施后 ⇒ **完全一致（33/33）**；**新增确定性失败 0、新增 skip 0**（skip 4 保持）。`NODE_EXIT:1` 由既有 33 个失败导致，非本批新增。
- 定向日志：`w1-targeted-run1.log` / `w1-targeted-run2.log` / `w1-targeted-run3.log`（迭代期，run3：`drain-predicate` + `codex-native-optional` + `session-lifecycle` 共 32/32 pass）。

### 5.3 typecheck

- `npm run typecheck`：**exit 0**（最终候选日志 `2026-11-08_W1_evidence/typecheck-final.log`；早前同结果 `typecheck-after.log`）。
- 说明（如实）：实施中期一次 typecheck 因**并行 W3a 的未完成文件** `test/编排/git-action-authorization-sidecar.test.ts(25,40) TS2339` 而 exit 1（该文件不在本角色写集）；W3a 完成后本批复跑 exit 0。本批文件自身从未引入类型错误（该次唯一报错位于写集外）。

## 6. 断言的删除/改写清单（契约变更，逐条）

1. `test/runtime-core/git-capability-tools.test.ts` —「R12 unsupported default native plan…」：
   - **before**：`assert.equal(prepared.plan.status, "unknown"); assert.equal(prepared.token, undefined);`（默认 Codex responses wire 的 native 计划不可用 ⇒ 创建准入拒绝）
   - **after**：`assert.equal(prepared.plan.status, "observed"); assert.ok(prepared.token); assert.equal("native" in prepared.plan, false); assert.equal(prepared.plan.reasons.some(r => r.startsWith("native-factory-plan-")), false);`
   - **理由**：P1.4 §3.2 A5/D1/F5 —— native factory plan 降为**可选证据**，不可用/unknown 不再阻断创建（意图记录 ②；P1.2-AC-27）。
2. `test/runtime-core/git-capability-tools.test.ts` —「R14 …」两阶段改写：
   - 标题改为「admit registered scripts through the approval chain; Codex native plan is optional evidence」。
   - **保留**：required + shell + 裸 gate（无审批链）⇒ `protected-scope-approval-chain-unproven`、bind/compose 拒绝、0 构造/0 请求/无 marker；scope 漂移 ⇒ `protection-scope-changed`；clean/Umanaged 行为；A11（能力回调伪造）/A4（custom/demo 受保护拒绝）断言未动。
   - **新增**：required + shell + 已登记审批链 + Codex native observed ⇒ `plan.status="observed"`、token、`plan.native.status="observed"`、绑定成功并真实执行受控 shell（marker 写入）；并断言 raw-gate 用例 reasons 不含 `native-factory-plan-*`。
   - **计数更新**（因新增 approved 段）：段内断言 `nativeConstructions/requests` 由 0/0→1/2、1/1→2/3、结尾 2/3→3/5；diagnostic 字段 `cleanAndUnmanagedNativeConstructions`→`admittedNativeConstructions`。
   - **理由**：R14 旧语义（受保护 + 含 shell 即拒绝）已由在飞变更改为审批链准入；本变更再确认 Codex native 可选、审批链成立即可绑定（P1.4 §4.5 R14 行）。
3. `test/runtime-core/session-lifecycle.test.ts` —「R13 disposal cannot promote …」：
   - **保留**原 `disposed-lifecycle-evidence-unavailable` 断言（全部 5 场景仍成立：均来自 custom factory 的 `custom-provider-disposal-coverage-unverified` 或真实未知）；
   - **新增** `assert.equal(isRuntimeSessionDrained(receipt), false, scenario)` 与说明注释（把既有语义与新谓词显式绑定；未删除/放宽任何原断言）。
4. 未删除任何测试用例、未新增 `skip`、未使用 `--test-force-exit`、未放宽任何既有断言；新增用例见 §4。

## 7. 偏差与解释性决策

- **对照 P1.4 / I0：偏差 = 0**（任务范围、写集、错误码、drain 白名单字面量、H13/H14 前置事实均按 I0 执行；未改动写集外文件；未改 provider/common/pipeline/桌面）。
- 为使 F5/C9/A9 自洽而做的**解释性决策**（已在本证据显式列出，供验收复核判定）：
  1. D2 服务级 `isCurrent()` 仅在 native 强证明被采用（有 adapter）时要求其 `isCurrent()`（否则 F5 回落路径仍被 `runtime-prepared-configuration-changed` 阻断）。
  2. D4 `disposed-lifecycle-evidence-unavailable` 仅在 drain 不成立时附加（否则 Claude/Pi disposed receipt 结构性不可 drain，C9/W2-H11/AC-8 不可达）。
  3. D1/`RuntimeCoreConstructionFacts.trustedPurePreparation?` 加法字段与 `matchesRuntimeNativeFactoryPlanBinding` 导出纯判据（A6/F5 的字段级负例测试；与既有 `matchesRuntimeApprovalChain` 同模式）。
- 若验收认为上述任一属偏差，请按 B1 复判规则记录；本批未自行扩大语义（未删除身份/ACL/审批/审计、未把 unknown 当 observed、未开放无审批 shell/Git 写）。

## 8. 未提交声明

- 未执行 `git commit` / `git push` / `git stash` / `git merge` / 发布/tag；所有改动仅存在于工作树。
- 未修改 `docs/`（除本角色 `docs/change/2026-11-08_W1_*` 证据）、角色卡/边界/YAML、方案 P1.4、B1 v1、团队计划/派发记录。
- 并行 W3a 的改动（`src/provider/trunk/impl/git-command.ts`、`src/provider/trunk/public/trunk-store.ts`、`test/编排/git-action-authorization-sidecar.test.ts`）不属于本批候选。

## 9. 证据文件索引（`2026-11-08_W1_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `before-runtime-core-concurrency1.log` | 实施前基线（顺序执行；523/486/33/0/4；node exit 1） |
| `before-runtime-core.log` | 实施前默认并发旁证（跨文件宿主租约干扰，不作对照） |
| `w1-targeted-run1.log` / `w1-targeted-run2.log` / `w1-targeted-run3.log` | 迭代期定向运行（最终 run3：32/32 pass） |
| `after-runtime-core-concurrency1.log` | 实施后第一次全量顺序运行（535/498/33/0/4） |
| `after-runtime-core-final.log` | 中间版全量运行（仅差一个新增用例标题措辞，旁证） |
| `after-runtime-core-final2.log` | **最终候选**全量顺序运行（535/498/33/0/4；见 §5.2） |
| `typecheck-after.log` | `npm run typecheck` 输出（exit 0，早前运行） |
| `typecheck-final.log` | **最终候选** `npm run typecheck` 输出（exit 0） |
