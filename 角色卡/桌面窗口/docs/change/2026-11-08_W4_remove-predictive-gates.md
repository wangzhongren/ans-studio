# W4 实施证据：删除全部预知式门控（桌面窗口 · run-stop drain / native 可选）

- 任务：`2026-11-08-remove-predictive-gates` / 批次 **W4**（派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §三 I0-5/Q8、§四）。
- 角色：桌面窗口（`roleId: 桌面窗口`，`角色卡/桌面窗口/boundary.md` Section 1 写集；独立实施上下文）。
- 实施基准：方案 **P1.4** `docs/planning/2026-11-08_design_git-write-init-approval-based.md`（§3.2 C8、§3.7 drain 谓词/F7、§3.8 码语义收窄、§3.5、§4.1、§4.5、§6.1；§3.3.2 H13/H14 仅背景）；B1 v1 `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（AC-8、AC-20、P1.2-AC-25、B1-EV3；§4.5 测试同步 `test/桌面应用/chief-workflow.test.ts:2146`、`:2187-2188`）；I0 冻结（I0-3/I0-5）。
- 日期：2026-11-08。状态：**已实施、已跑确定性测试与 typecheck；未 commit / 未 push / 未 stash / 未 merge / 未发布**。

## 1. 基线

| 项 | 实测 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 | `feat/plan-escalation-card` |
| HEAD | `3f249e2fee1753531d6b566eefc7a64016e863a7` |
| 起始工作树 | 含 W1（`src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/*`）、W2（`src/pipeline/orchestration/trunk-runtime.ts`、`run-role.ts`、`apply-journal.ts`、`test/编排/*`）、W3a/W3b（`src/provider/trunk/impl/git-command.ts`、`public/trunk-store.ts`、`test/编排/*`）的未提交改动——**本批只读消费，未回退/改动**。本批起始时 `app/desktop/session.ts`、`test/桌面应用/chief-workflow.test.ts` 相对 HEAD 无改动（`git status --porcelain -- app/desktop test/桌面应用` 为空）。 |
| 并行批次 | 实施期间 W3b（编排，独立上下文）仍在同一 worktree 修改 `src/pipeline/orchestration/trunk-runtime.ts`、`src/provider/trunk/impl/git-command.ts`（未触碰本批文件）；本批 typecheck 与测试在 W3b 当前工作树状态下通过（见 §5.3/§5.4），未因写集外瞬时错误判定失败。 |
| 只读消费 | `src/model/runtime.ts` 导出 `isRuntimeSessionDrained(facts)`（W1 单一来源）；`RunChangeHostPlan.handles[].nativeInstanceId` 已可选（W2/Q8）；W2 finalize/controller-stop 的 native 可选与 host-continuation 已实现。**本批未修改 W1/W2 文件**。 |
| 参照基线（只读） | 第一变更 E3 T3 组合 4,982 / 4,753 pass / 196 fail / 1 cancelled / 32 skip（派发记录 §一）；本批只对 `test/桌面应用/chief-workflow.test.ts` 受影响套件做前后对照（§5）。 |

## 2. 改动文件与逐文件 SHA-256（前 → 后）

| 文件 | 前置（HEAD `3f249e2` 内容 / 工作树起始值） | 后置（工作树） |
| --- | --- | --- |
| `app/desktop/session.ts` | `b92ac8fef31e2e8c3622e05a8430f0bc89c907c88440f518919a44d79a8841cf` | `0132cd4e935ccd7f5eae05344991b818e072cf090f783d589c5541b13924cae5` |
| `test/桌面应用/chief-workflow.test.ts` | `01c97535f63bf2fe6b3fa74dbcdd1da139a308913e3ae41c9a9abd69880e674a` | `457214b54c9fe0dc0d5ebc354079a7e2fbfb1b5374e33c5866fce44826270866` |

> 前置哈希在本批编辑前以 `sha256sum` 实测（此时两文件相对 HEAD 无改动，等价于 HEAD 内容）；后置哈希为最终候选取证后实测。未改动其它 `src/`、`app/`、`test/`、`docs/`、角色边界/YAML、方案/B1/团队计划；未新建 `test/桌面应用/` 文件（`git status --porcelain -- test/桌面应用` 的未跟踪项 = 0）。

## 3. 关键实现

### D1. `ownedRunStopMembers`：native instance 可选（P1.4 §3.2 C8 / I0-5 / Q8）

- 旧：`lifecycle.native?.instanceId !== member.nativeInstanceId` 作为成员校验的一部分（native 必填比对；`member.nativeInstanceId` 在 Q8 后已可选）。
- 新：仅当 **两侧都存在且变化** 时拒绝：
  `lifecycle.native !== undefined && member.nativeInstanceId !== undefined && (lifecycle.native.instanceId !== member.nativeInstanceId || lifecycle.native.roleId !== member.roleId)`
  ⇒ `run-stop-host-instance-unproven`（既有码，语义收窄）；**`absent` ⇒ 允许**（与 W2 `finalizeRunChange`/`finalizeControllerStop` 的 present-but-changed 判据一致）。
- **逐字保留**（未放宽身份/fence）：唯一宿主查找（`owners.length !== 1`）、`observed.handle.stopAndInspect` 存在、`observed.handle.sessionId === member.coreSessionId`、`fact.taskId/roleId/projectRoot` 匹配、`fact.phase ∈ {live, disposed}`、`lifecycle.sessionId === member.coreSessionId`、`manager.deliveryStoreArmed && openChains.size === 0`（队列持久化/宿主就绪）。

### D2. `executeOwnedRunStop`：终止判定改用运行时中立 drain（P1.4 §3.2 C8 / §3.7）

- 旧：`stopped.status !== "quiescent" || !stopped.providerFinished || stopped.activeTools.length` ⇒ `run-stop-lifecycle-unproven`。
- 新：`!isRuntimeSessionDrained(stopped)`（从 `../../src/model/runtime.ts` 导入 W1 单一来源纯函数）；`status`/`processCoverage`/`native` 仅证据，不再作为前提。
- native 可选比对与 D1 同构：`stopped.native !== undefined && member.nativeInstanceId !== undefined && (instanceId/roleId 漂移)` ⇒ 拒绝。
- **保留**：`stopped.sessionId !== member.coreSessionId` 身份核对；`stopAndInspect({ ..., timeoutMs: 5000 }, signal)` 作为**上限**（W1 已 drain 即返回，不把逐成员 5s 当默认成本）；`run-stop-lifecycle-unproven` 码保留、语义收窄；其后的 dispose/事件消费/投递认领/持久化 cutoff/host fence/`finalizeRunChange` 顺序与检查逐字未动。

### D3. 未改动（契约保持）

- 未改 `app/main.ts`、`app/renderer/`、审批卡、Git 能力注入（`gitQuery/gitCandidate/gitPublish` 接线未动）、`selectRunChangeForHandle` 的其它分支、`deferredRunChanges`/`resumeDeferredRunChanges`（W2 宿主继续语义原样消费）。
- 未新增客户卡；未改错误码字面；未改 Core/身份/fence/投递/持久化语义；未改 PR #72/`applicationMediation` 任何契约（本批不读取它）。

## 4. 测试（仅既有 `test/桌面应用/chief-workflow.test.ts`）

### 4.1 新增用例（1 个）

**`W4 桌面run-stop：Claude/Pi drain 可推进；native absent 允许、present-but-changed 拒绝`**——直接驱动 `SessionManager` 的私有 host 边界（真实 manager 实例 + 受控 `observedHandles`/handle 事实；不伪造 Core 会话、不冒充真实 turn）：

1. **Claude/Pi 正向**：`status:"unknown"`、`processCoverage:"unknown"`、`native` absent，但 `isRuntimeSessionDrained` 为真 ⇒ `ownedRunStopMembers` 通过、`executeOwnedRunStop` **不再以 quiescent 拒绝**（推进到 finalize 边界；该边界在本用例未注册真实 prepared run 时以 `run-preparation-invalid` 拒绝——只作边界观测，不是本批语义）。
2. **native absent 允许**：plan 曾记录 `nativeInstanceId`，当前 lifecycle/停止回执均 absent ⇒ 不阻断。
3. **native present-but-changed（成员校验）**：instance 漂移 / role 漂移 ⇒ `run-stop-host-instance-unproven`，不提交。
4. **native present-but-changed（停止回执）**：成员校验通过、回执 instance/role 漂移 ⇒ `run-stop-lifecycle-unproven`，不提交（未到达 finalize）。
5. **drain 不成立**：非 idle Pi（`native:pi-sdk-idle-not-observed` 未列白名单，默认阻断）⇒ `run-stop-lifecycle-unproven`，不提交。
6. **契约守卫（源码段）**：`executeOwnedRunStop` 使用 `isRuntimeSessionDrained(stopped)`、不再含 `stopped.status !== "quiescent"`/`!stopped.providerFinished`/`stopped.activeTools.length`；`ownedRunStopMembers` 仅 present-but-changed 拒绝、不再必填 native 比对；Core/任务/角色/项目身份、队列持久化/宿主就绪、host fence/持久化检查与既有错误码仍在。

### 4.2 断言改写清单（契约变更，逐条）

1. **`W48 默认Core精确controller停止`（Codex 停止成功断言，原 `:2187-2188`）**：
   - **before**：`assert.equal(stopped?.phase, "disposed"); assert.equal(stopped?.lifecycle?.status, "quiescent"); assert.equal(stopped.lifecycle.native?.instanceId, targetBefore.lifecycle.native.instanceId); assert.equal(stopped.lifecycle.processCoverage, "complete");`
   - **after**：拆为三行并**新增** `assert.equal(isRuntimeSessionDrained(stopped.lifecycle!), true, "停止成功=运行时中立 drain")`；**保留** `status === "quiescent"`、native instance 相等、`processCoverage === "complete"` 三条原断言，并注明它们仅是 Codex 本路径的**真实运行时证据**（不是门的前提）。
   - **理由**：P1.4 §3.2 C8/§3.7 / B1 §4.5——停止成功的契约判据从 quiescent/processCoverage 改为运行时中立 drain。保留原断言不构成放宽（本路径 Codex 实际事实仍如实为 quiescent/complete，`W48` 四种 stopMode 在前后运行中均通过）。
2. **`controller-stop-target-instance-unproven` 断言（原 `:2146`）**：**未改动**（B1 §4.5 要求保留 Core 身份码）。
3. **本批未删除任何既有测试用例、未放宽既有断言、未新增 `skip`、未使用 `--test-force-exit`**；新增 1 个用例（59 = 58 + 1）。`test/桌面应用/` **未新建文件**（条件 H1 未触发）。

## 5. 命令与原始结果

### 5.1 实施前（`test/桌面应用/chief-workflow.test.ts`，顺序执行）

- 日志 `2026-11-08_W4_evidence/before-chief-workflow.log`：

```
node --test --test-concurrency=1 "test/桌面应用/chief-workflow.test.ts"
ℹ tests 58
ℹ pass 47
ℹ fail 11
ℹ cancelled 0
ℹ skipped 0
NODE_EXIT:1
```

- 11 个失败均为**既有环境性红**（Windows 临时目录清理竞态 `ENOTEMPTY` / 依赖时序的既有断言），名单：`W14`、`W19`、`W22`、`W23`、`W28 stop`、`W28 stop-and-restart`、`W30 连续写入后`、`W33`、`W34`、`W47 select`、`W47 revise`。0 skip。`W48` 四种 stopMode 全部通过（含原 `:2187-2188` quiescent/complete 断言）。

### 5.2 实施后（同一命令、同一环境；两次全量）

- 日志 `after-chief-workflow.log`（第一次）：

```
ℹ tests 59
ℹ pass 43
ℹ fail 16
ℹ cancelled 0
ℹ skipped 0
NODE_EXIT:1
```

- 日志 `after-chief-workflow-rerun2.log`（第二次，同一命令）：

```
ℹ tests 59
ℹ pass 45
ℹ fail 14
ℹ cancelled 0
ℹ skipped 0
NODE_EXIT:1
```

- **新用例在两次全量与定向运行中均 pass**（`w4-targeted-run1.log`：1/1 pass；两次全量日志第 166 行均 `✔ W4 桌面run-stop…`）。
- **新增确定性失败 = 0、新增 skip = 0**。失败集合逐条对照（文件 + 测试名）：
  - 两次实施后运行与基线的**交集失败**（既有环境性红，原因与基线同类）：`W14`、`W19`、`W22`、`W23`、`W28 ×2`、`W33`、`W34`、`W47`（两/一次）。
  - **仅实施后运行出现**：`W5 selected/commit-race`、`W10 unmanaged`、`W29 document-change`——经核对全部为 `ENOTEMPTY` 临时目录清理竞态或既有 waitFor 时序断言；**非确定性证明**：同一命令隔离复跑 `w5-w10-targeted.log`（12 测试 4 fail）vs `w5-w10-targeted-rerun.log`（12 测试 2 fail，仅 `commit-race`），失败集合每次都不同；`W29`/`W30`/`W47-revise` 在两/三次运行间交替转红转绿；基线运行中同样出现 11 个同类环境性红。上述测试均不触达 run-stop/native/drain 代码路径（W4 改动仅位于 `ownedRunStopMembers`/`executeOwnedRunStop` 两个私有方法，桌面普通 `stop()`/controller-stop 走各自既有路径）。
  - **仅基线出现、实施后转绿**：`W30 连续写入后`（环境性时序）。
- `NODE_EXIT:1` 由上述既有/环境性失败导致，非本批新增；未拼接历史日志、未以 force-exit 冒充自然结束。

### 5.3 typecheck

- `npm run typecheck`：**EXIT 0**（`2026-11-08_W4_evidence/typecheck-after.log`；最终候选，含 W3b 当前工作树状态与 `nativeInstanceId?` 可选化后的桌面消费）。

### 5.4 定向运行

- `node --test --test-concurrency=1 --test-name-pattern "W4 桌面run-stop" "test/桌面应用/chief-workflow.test.ts"`：1/1 pass（`w4-targeted-run1.log`）。
- `test/桌面应用/session.test.ts` **未运行**：本批未改其覆盖的开启/多轮/保活路径；`app/desktop/session.ts` 的改动仅限 run-stop 私有方法且由定向用例直接覆盖，typecheck exit 0。如需验收复核可补跑（不在本批结论内）。

## 6. 与 P1.4 / I0 / B1 的对照与偏差

| 基准 | 结论 |
| --- | --- |
| P1.4 §3.2 C8 | 按「drain 谓词 + native optional」实现；`run-stop-lifecycle-unproven` 保留、语义收窄 |
| P1.4 §3.7 / I0-3 | 只读消费 `isRuntimeSessionDrained` 单一来源；未复制第二份白名单/谓词；drain 即返回由 W1 保证，本层 5s 仅上限 |
| I0-5 / Q8 / AC-8 / AC-20 | `native absent ⇒ 允许`、`present-but-changed ⇒ run-stop-host-instance-unproven`/`run-stop-lifecycle-unproven`；与 W2 `finalizeRunChange` 的判据逐字段同构；Core 身份/任务/角色/项目/宿主就绪/队列持久化/host fence 未放宽 |
| B1 §4.5 测试同步 | `:2146` 码保留；`:2187-2188` 按 drain 语义同步（新增 drain 断言、保留原证据断言，见 §4.2）；未新建 `test/桌面应用/` 文件 |
| 写集 | 仅 `app/desktop/session.ts`、`test/桌面应用/chief-workflow.test.ts`、本证据目录；未改 `app/main.ts`/`app/renderer/`/审批卡/Git 注入 |
| **实现偏差 = 0** | 未偏离 P1.4/I0；未触碰 W1/W2/W3a/W3b 文件；未 commit/push/stash/merge/发布 |

**解释性决策（供验收复核判定，非 I0 行为偏离）**：
1. 「可提交」观测方式：本用例直接驱动私有 host 边界，drain 通过后的下一站是 `finalizeRunChange`；因未注册真实 prepared run 而以 `run-preparation-invalid` 拒绝。该码仅用于证明「已越过旧 quiescent 门」，不宣称完成真实 run 提交；真实 prepared-run 端到端提交链属 W2/W5 覆盖范围（B1 AC-8 / P1.2-AC-25）。
2. 成员校验的 native 判据与 W2 `finalizeRunChange` 完全一致（两侧都 present 才比对 instance/role）；`member.nativeInstanceId` 缺失但当前 native 存在时不视为 changed（absent 语义）。

## 7. 未提交声明

- 未执行 `git commit` / `git push` / `git stash` / `git merge` / 发布/tag；所有改动仅存在于工作树。
- 未修改 `docs/`（除本角色 `docs/change/2026-11-08_W4_*` 证据）、角色卡/边界/YAML、方案 P1.4、B1 v1、团队计划/派发记录。
- W1/W2/W3a/W3b 的未提交改动不属于本批候选，未读取改写。

## 8. 证据文件索引（`2026-11-08_W4_evidence/`）

| 文件 | SHA-256 | 内容 |
| --- | --- | --- |
| `before-chief-workflow.log` | `eb857fc146424a64fe9023e9a574ab8a7550b5039d412fce6bd9ed0c5e3224f8` | 实施前全量（58/47/11/0/0；node exit 1） |
| `after-chief-workflow.log` | `e1996207fc9ed70733a9191d042c8f1384a30d40b9743e3c6f805b6cd199b300` | 实施后全量第一次（59/43/16/0/0；W4 新用例 pass） |
| `after-chief-workflow-rerun2.log` | `c4f41dc82f5c943385b6bd16a6b06c62997711ea6cc9040b9482c50309ea00ef` | 实施后全量第二次（59/45/14/0/0；W4 新用例 pass） |
| `w4-targeted-run1.log` | `51cc9d5f91ac57cbf895079ebb349916f1d5827dbc0479a0205af0bea474866a` | W4 定向（1/1 pass） |
| `w4-targeted-final.log` | `5ad22f2114eebba3406eee007698d6609ccd9e0161fd976bde78ff5ebc41bca0` | 最终候选 W4 定向复跑（1/1 pass；与 §5.3 同代码 SHA-256） |
| `w5-w10-targeted.log` | `f2a509ded35d8ce9e86719bd24a93b825cb0156cf61885d2a919e7163a7e99de` | W5/W10 隔离复跑 #1（12 测试 4 fail；全为 ENOTEMPTY 清理） |
| `w5-w10-targeted-rerun.log` | `34bebeba9bc0ecc12d01822f3ff82d63a14171ea65bfb1494e912e6ba8db83f5` | W5/W10 隔离复跑 #2（12 测试 2 fail；证明非确定性环境红） |
| `typecheck-after.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | `npm run typecheck`（EXIT 0） |

> `.log` 文件受仓库既有 `.gitignore`（`*.log`）忽略，仅作为本角色证据保留在工作树；不属产品/测试候选。
