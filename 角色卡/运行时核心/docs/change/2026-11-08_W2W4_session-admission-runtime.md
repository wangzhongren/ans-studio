# W2+W4（合并一轮）证据：会话创建准入按操作审批（运行时核心）+ 只读 Git 工具路由

- **任务**：W2-R + W4-R 合并一轮（任务 ID `2026-11-08-session-admission-approval`，flowId `session-admission-approval-based`）
- **记录角色**：运行时核心（固定 worker 上下文）
- **日期**：2026-11-08
- **检出**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；Node v24.22.1；Windows 11 Pro 10.0.26300）
- **性质**：本角色自证证据，**不是验收结论**（B2 独立验收按 B1 v1 判定）；未提交/未推送/未暂存/未合并/未发布；未运行真实模型；未修改本角色写集外任何文件。
- **自引用声明**：本文件不嵌入自身 SHA-256（落盘后由完成报告/验收复算）；其余文件 hash 均为写盘后原字节复算（`sha256sum`）。

---

## 1. 输入（本批开工时实测）

| 输入 | 路径 | 行数 / 字节 / SHA-256 |
| --- | --- | --- |
| 派发与接口评审（I0，当前版本） | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` | 84 / 13909 / `28a9d762a58cf6f25c57ad3641df5636d9ab5ffc48d0f8abca23ce967492a6a3`（W1 时 81 行 / `88938f29…`；此后调度追加 §五 状态记录） |
| 设计 **P1.3**（实施基线） | `docs/planning/2026-11-08_design_session-admission-approval-based.md` | 855 / 130013 / `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`（与派发记录一致） |
| 复核记录（F4/F8/F11/R1–R3/R6/R8） | `docs/planning/2026-11-08_review_session-admission-approval-based.md` | 193 / 53879 / `817ebc9de73f825f474b42a8f714866bd1d5ddd9b0348e14a2c6f0b3b44d122d`（一致） |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` | 185 / 29020 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`（一致） |
| W1 共享件（只读消费） | `src/common/shared/shell-approval-binding.ts` | 287 / 13627 / `8fdcda39f74a1c06a954703d20e083e46bba8f539903485e934ec7d2e395926d`（一致） |
| W1 证据 | `角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md` | 122 / 12918 / `460bef8602b0ed65c0a71fb377c175eff71b6a8e82506cfaa04ca1b0ec2a71fd` |
| W3-G 公共出口（只读消费） | `src/service/gate/shell-rules.ts` | 31 / 3207 / `0ea4729b014d25dc21a3d3196b9db253a22ce62a72607485f2d4847fc48aa3c7`（一致） |
| W3-G 证据 | `角色卡/门禁引擎/docs/change/2026-11-08_W3G_readonly-git-matcher.md` | 124 / 17182 / `c593ea51e1ebded00b61d7836c5287a546a733993a851af0539c57845a372b9e` |

---

## 2. 写集与逐文件 SHA-256（写盘后复算）

| # | 文件 | 类型 | 行数（前→后） | 字节 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | 加法契约（Model） | 3945 → 4046 | 203732 | `c4dae5572039f46c8f6e2b09f32d6f7d8982247ed2a44fa336f0bde02c0a0a38` |
| 2 | `src/service/runtime/session.ts` | 创建准入新语义（Service） | 1434 → 1556 | 135147 | `c46e8780176a4fe69aaec27c289b66af967b2f4e462ef1b582929cad0f82b3a9` |
| 3 | `src/provider/runtime/tools.ts` | 只读 Git 路由 + roleId 透传（Provider） | 5330 → 5387 | 330259 | `c37793ca24b88c21ede9b69c52ee3e6c26416095c187682318bf909698fbe8d8` |
| 4 | `src/provider/runtime/schema.ts` | 工具说明/指引（Provider） | 1829 → 1835 | 145438 | `e472196f6f7d836f42246137dfe7ea141e4680673c0b4652d3acfc788df636d0` |
| 5 | `test/runtime-core/git-capability-tools.test.ts` | R14 断言更新（新 reason） | 1143 → 1146 | 104442 | `5690832e4b70d144d10caaa284ae543dc5f8eee73594b37438c1a132fe86a5da` |
| 6 | `test/runtime-core/session-admission-approval.test.ts` | 新增（W2，11 例） | 0 → 327 | 22360 | `da9c80c8e6e12d4d6653b240ce99094e949ca5fc5f677d21843df025796cd332` |
| 7 | `test/runtime-core/readonly-git-routing.test.ts` | 新增（W4，10 例） | 0 → 283 | 17599 | `656e288dfb351810a49191c1f9b05ca6568d0dbdd04cf885eb94f5865d8dd77f` |

**写集核对**：`git status --porcelain` 对本角色新增改动仅显示上述 4 个 `M`（src）+ 1 个 `M`（test）+ 2 个 `??`（test）；工作树中其余未提交改动（T1 Claude schema、W1 binding、W3-G 门禁引擎等）属其他角色批次，本批未触碰、未修改。未修改 `app/`、其他角色目录、其他测试目录、角色卡/边界/方案/验收/沟通/调度文件。

---

## 3. 实现摘要

### 3.1 `src/model/runtime.ts`（加法，不改既有必填形状）

- 新增 `RuntimeApprovalChainPlanFacts`（P1.3 §2.3.3）：`source:"orchestration-shell-gate"`、`mode`（四档）、8 个通道布尔（classifier/rules/pmAsk/operatorChannel/takeGrant/takeDirective/routinePolicy/escalation）、`audit:{sink:"file";durable:true;probe:"ok";relPath?}`、`projectRoot`；`RuntimeCreationPlanFacts.approvalChain?`（可选）。
- `ShellReviewRequest.roleId?`（来自适配器 options，非模型输入）。
- `OperatorPrompt.entry?/roleId?/protectedScope?`（卡面展示字段；不参与判定）。
- 新增 `ReadonlyGitExecutionFacts`（与 `run_shell` spawn 回执同形）与 `ReadonlyGitCapability`（`match(argv): object | undefined`、`execute(match, budgets?): Promise<facts>`；`match` 对 Model 不透明——不依赖门禁引擎类型，符合 I0-9）；`GovernedToolsOptions.readonlyGit?`。
- 未修改 `RuntimeSessionToolSurfaceFacts`、`inspectToolSurface`、`composeRuntimeApplicationMediation`（PR #72 契约原样）。

### 3.2 `src/service/runtime/session.ts`（P1.3 §2.2.3/§2.2.4）

- **退役** `hasUnconfinedScriptTools` 及 5 处引用（定义 + `ensureAdapter`/`verifyScope`/`prepareRole`/`bindPreparedRole`）；生产路径**零产生** `required-scope-unconfined-script-tools`（源码仅剩退役注释，见 §5.4）。
- `prepareRole` 新算法：`unknown` 拒绝；`required` 时保留 custom/demo 拒绝（`protected-scope-default-native-plan-required`）与 `roleCapabilityGuards unknown` 拒绝；`shellTools = initialAppTools ∩ {run_shell, start_background_task}` 非空时 `await probeShellApproval(options.shellGate)`（binding 内部执行 `sink.probe()`，无值入参/memoize）：
  - 未登记 / 项目根不符（`resolve` 规范化；Windows 大小写不敏感）⇒ `protected-scope-approval-chain-unproven`；
  - `sink!=="file" || durable!==true || probe!=="ok"` ⇒ `protected-scope-audit-unavailable`；
  - 否则 `plan.approvalChain` = 稳定白名单投影（无时间戳/凭据/env）。
  - native：`custom-override` 拒绝；**仅 `runtime === "codex"`** 执行原 `prepareNative` 严格校验（原条件逐字保留）；claude/pi 不再产生 `native-factory-plan-*`；demo 仍在 required 下因 provenance≠default-production 被拒。
  - `configDigest` 输入增加 `approvalChain`；reasons 空才发 token。
- `composeContext`/`bindPreparedRole`：token 成立后 `provider.setAdmittedPlan(plan)`（校验 `isCurrent()` 与 registry `planId` 一致，否则 `runtime-prepared-configuration-changed`）并 `provider.verifyApprovalChainBinding(plan)`（重读 `inspectShellApproval`/`probeShellApproval`；存在、项目根一致、`file+durable+probe ok`、稳定投影与 `plan.approvalChain` 一致，否则 `protected-scope-approval-chain-changed`）。
- `ensureAdapter`：`unknown` 或 `required && !admittedPlan` ⇒ `runtime-protected-scope-requires-verified-plan`（原「`required && !nativePreparation && runtime!=="demo"`」按设计替换）。
- `verifyScope`：删除 unconfined 检查；`required` 时复核 `admittedPlan` 存在且审批链一致。
- `bindPreparedRole` 保留 scope revision 复核、`roleCapabilityGuards unknown` 拒绝；native 绑定核对（`bindRole` 内原样）不动。
- `inspectToolSurface`/`composeRuntimeApplicationMediation` 未触碰（PR #72 契约 §2.8）。

### 3.3 `src/provider/runtime/tools.ts` + `schema.ts`（W4）

- `run_shell`/`start_background_task` 审核请求与执行后审计均携带 `roleId`（来自 `GovernedToolsOptions.roleId`，即 Service 注入的会话角色；模型输入不能提供/覆盖）；`entry` 已有。
- gate allow 后：程序名（basename、去 `.exe/.cmd/.bat`、小写）为 `git` ⇒ 必须有 `options.readonlyGit` 且 `match(argv)` 命中，才 `await execute(match, {timeoutMs, outputLimit})`；结果映射为与 spawn 相同的工具回执（exitCode/signal/stdout/stderr/timedOut/error/stdoutTruncated/stderrTruncated），并附「经应用固定 Git 传输执行」说明。无能力/未命中 ⇒ `readonly-git-runner-unavailable`，**零执行、绝不回退通用 spawn**。非 git 维持现状 spawn。**后台入口不做只读 Git 路由**。
- 工具说明（schema/description/promptGuidelines）补充只读 Git 白名单（10 子命令）与 `git_query`/`git_candidate`/`git_publish` 指引；**run_shell 输入字段不变（仍只有 `command`）**；`start_background_task` 说明注明后台入口不接受 `git`。

---

## 4. I0 接口约束确认（本批次适用项，偏差 = 0）

| # | 结论 | 本批执行情况 |
| --- | --- | --- |
| I0-1 | `registerShellApproval(gate, facts, sink)` 签名与唯一登记点 = `createShellGate` 构造成功后 | 本层**不登记**（未 import `registerShellApproval`）；只读消费 `inspectShellApproval`/`probeShellApproval`。测试夹具直接调用 `registerShellApproval` 属**临时性**（见 §8），不改变生产登记点。 |
| I0-2 | 测试私有 Symbol 挂 sink 非枚举；不得经生产出口再导出 | 本层未引用该 Symbol；`shell-rules.ts`/`session.ts`/`tools.ts` 无该 Symbol 名。 |
| I0-3 | 未登记 ⇒ `probeShellApproval` 返回 `undefined` ⇒ unproven；已登记但无 probe/抛错 ⇒ 冻结 facts 且 `probe:"unavailable"` ⇒ audit-unavailable；并发共享/memoize；无接受 probe 值的 API | `readApprovalChainEvidence` 只传 gate（无值入参）；单测覆盖：未登记/裸函数/项目根不符 ⇒ `protected-scope-approval-chain-unproven`；无 sink/无 probe()/同步或异步抛错/`unavailable`/`unknown` ⇒ `protected-scope-audit-unavailable`。未使用任何 finalize 类 API。 |
| I0-4 | 只读 Git 路由采用注入能力对象（`GovernedToolsOptions.readonlyGit` 不透明 `match`/`execute`）；命中 ⇒ execute；无能力/未命中 ⇒ `readonly-git-runner-unavailable`；绝不回退通用 spawn；非 git 维持 spawn；不得第二份 matcher | 已按此实现；`match` 对 Model/Provider 工具层保持 `object` 不透明，未 import 门禁引擎 matcher；工具层未复制任何白名单/规范体逻辑。后台入口不做路由。 |
| I0-5 | `SHELL_RULES_VERSION` 3→4 等 | 属门禁引擎 W3-G 写集（已完成），本层只读消费其公共出口（未新增版本逻辑）。 |
| I0-6 | `auditFailurePolicy` | 属编排写集（W1b/W3b），本层未实现/未注入；跨角色待办 §10。 |
| I0-7 | 审计 `by` 前缀 / `readonlyGit:{id,canonicalArgv}` / `branch:"c-allow"` | 属编排 `shell-audit.ts`/`shell-gate.ts` 写集；本层把 `roleId`/`entry` 送入审核与执行后审计请求，不写 `branch`/`by`/`readonlyGit`（待编排落字段）。 |
| I0-8 | P1.3 勘误 E1–E4（实际路径/owner） | 本批按实际路径执行（binding=shared、shell-rules=门禁引擎公共出口、trunk owner=编排），无偏差。 |
| I0-9 | 依赖方向：binding 只依赖 model；`ReadonlyGitMatch` 由门禁引擎定义并经 shell-rules 类型再导出；model 侧 match 不透明；不得第二份定义 | `src/model/runtime.ts` 未 import binding/门禁；`session.ts` 以结构类型消费 binding（shared 公共件）；`tools.ts` 未 import 门禁引擎；`ReadonlyGitCapability.match` 为 `object`；全仓无第二份 matcher/规范体（W3-G 单一来源不动）。 |
| I0-10 | 不重开 I0；新增偏差须停止回报 | 本批**无偏差**（§9）。 |

---

## 5. 受影响套件实施前后对照

### 5.1 命令与环境

```
node --test "test/runtime-core/**/*.test.ts"
```

Node `v24.22.1`，Windows 11 Pro（10.0.26300），worktree 现状（含 W1/W3-G 与 T1 等其它角色未提交改动）。前后命令、环境一致。

### 5.2 计数

| 时点 | tests | pass | fail | cancelled | skipped | todo | 退出码 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **实施前**（本批开工时，未改本角色任何文件） | 502 | 465 | 33 | 0 | 4 | 0 | 1（既有红） |
| **实施后**（本批候选） | 523 | 486 | 33 | 0 | 4 | 0 | 1（同名同数既有红） |
| 增量 | **+21** | **+21** | **0** | 0 | **0** | 0 | — |

### 5.3 失败集合对照（同名同数）

实施前后失败测试名集合逐条 `diff` 为**空**（"FAIL-SET-IDENTICAL"）；**新增确定性失败 = 0、新增 skip = 0**；未删除/放宽任何既有断言，未加 skip/force-exit。33 个既有失败为当前工作树/环境事实（多数使用 `process.cwd()` 作项目根：worktree 的 `.git` 是文件而非目录，`readGitHostProtectionRequirement` 按设计返回 `unknown` ⇒ `runtime-protection-scope-unknown`；与 W1/W3-G 证据中标注的既有红同一环境口径，本批未改变其集合），逐条清单：

1. Core-managed binding rejects a provider that did not register its display profile before first prompt
2. D3 linked workspace root remains usable; linked target itself is not replaced
3. Pi env 300s/310s reach the Provider inspection option while the Service turn timer uses the fixed 1h last resort
4. R12 actual shell/governance judge tool modes and a direct interpretation actor all enter the Core registry
5. R12 every real Core bind shares the host lease and registry; in-progress/active/disposed actors remain visible
6. R12 interruption during async factory preparation prevents the subsequent native bind
7. R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget
8. R2 chief timeout is finite and normal sessions still receive injected narrow capabilities
9. R8 a custom factory cannot self-report the default Codex Chat production provenance
10. R8 active HTTP inference alone is not treated as an uncontrolled execution program
11. R8 native registry/instance/role/runtime/activity mismatches remain unknown
12. Service explicit Pi timing overrides env, including the legacy disabled-timer values
13. Service 三键读取注入：set ⇒ 注入 RuntimeProviderOptions.reasoningEffort（规范形）
14. abort rejection keeps quarantine when the underlying turn never settles
15. abort rejection no longer quarantines forever once the underlying turn settles later
16. acknowledged turns keep aborted/timed_out outcomes and single matching terminal
17. active and disposed prompt rejections have no turn acknowledgement
18. actual Service registry snapshots bind the instance and do not convert empty capabilities into confinement proof
19. all runtimes read the same inspection env; Service still uses the fixed 1h last resort
20. dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」
21. dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行
22. doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6）
23. normal abort without cleanup failure keeps its existing quarantine lifecycle
24. outer aborted result stays aborted and a settled underlying lifts quarantine despite failing cleanup
25. outer timeout remains timed_out when abort cleanup emits inner aborted terminals
26. quarantined prompt rejection has no acknowledgement after one stopped actual turn
27. store: native validation stays lazy and native symlink is rejected before effects
28. store: traversal, mismatched scope and symlinked runtime directories rejected
29. synchronous acknowledgement throw yields one failed terminal, zero native work, and releases the turn
30. 主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3）
31. 未设/空串 ⇒ 字段缺席（逐字现状的机读形态，而非 undefined 值）；demo 恒缺席
32. 诊断自身故障不改变执行（绝不毁会话）；跨键不串（设 claude 键对 codex 会话零影响）
33. 非法值 ⇒ 按未设处理（零参数）＋诊断如实；空串静默不诊断；绝不毁会话

### 5.4 本批新增测试

| 文件 | 用例数 | 结果 |
| --- | --- | --- |
| `test/runtime-core/session-admission-approval.test.ts` | 11 | 11 pass / 0 fail / 0 skip |
| `test/runtime-core/readonly-git-routing.test.ts` | 10 | 10 pass / 0 fail / 0 skip |

`git-capability-tools.test.ts` R14：断言从 `required-scope-unconfined-script-tools` 改为 `protected-scope-approval-chain-unproven`（并新增断言旧 reason 不再出现）；保持「不构造 native 适配器（nativeConstructions=0）、不发模型请求（requests=0）、不写 marker（ENOENT）」与 `bindRole`/`composeContext` 拒绝 `runtime-protected-scope-requires-verified-plan`。退役码检索：`grep -rn "required-scope-unconfined-script-tools" src/` 仅命中 `session.ts` 的退役注释，无代码产生点。

---

## 6. `npm run typecheck`

```
> ans-cli@1.9.2 typecheck
> tsc --noEmit
```

- 退出码 **0**，无诊断输出（覆盖 `src`/`test`/`app`，`app/renderer` 除外）。实现完成、测试新增后各复跑一次，均 0。

---

## 7. 测试覆盖矩阵（对照任务要求）

| 要求 | 覆盖用例 |
| --- | --- |
| prepareRole 真值表（required × runtime × shell × binding × sink 三态 × provenance × guards） | W2「prepareRole 真值表」：claude 无 shell（observed/无 approvalChain/无 native-factory-*）、claude shell + 裸函数（unproven）、claude shell + 已登记（observed + 完整投影）、pi 三层链（observed）、codex 有/无审批链（native 仍 prepared）、demo/custom（既有 reason 保留）、guards unknown（既有 reason 保留）；unknown scope 拒绝单独一例。 |
| mode 可接受集合 | W2「mode 可接受集合」：readonly / operator-approve / rules-advisory / three-layer 均 observed 且投影 mode 一致。 |
| sink 三态 | W2「审计三态」：memory+durable:false、file+durable:false、无 probe()、probe 抛错、probe unavailable/unknown、custom sink、已登记但无 sink ⇒ 均 `protected-scope-audit-unavailable` 且无 token/无 approvalChain；未登记/根不符 ⇒ `unproven`。 |
| ensureAdapter / verifyScope / bindPreparedRole（admittedPlan 缺失/变化、scope revision、approval-chain changed） | W2「bindPreparedRole 正向」：required + shell + 已登记 ⇒ token + bind 成功 + appTools 含 shell；「composeContext 正向」：token 成立后设 admittedPlan 并返回上下文；「无 token 拒绝」：bindRole/composeContext 均 `runtime-protected-scope-requires-verified-plan`（适配器零构造路径，R14 断言 nativeConstructions=0）；「AC-27 gate 替换」⇒ `runtime-prepared-configuration-changed`；scope revision ⇒ `git-capability-tools.test.ts` R14 drift 用例（`runtime-protection-scope-changed`，既有、未改）；approval-chain 一致判据 ⇒ 模块级 `matchesRuntimeApprovalChain` 逐字段（见 §8）。 |
| configDigest 含 approvalChain | W2「approvalChain 稳定投影且 configDigest 计入」：同一 gate/证据 ⇒ 摘要相同（planId 不入摘要）；mode 变化 ⇒ 摘要不同；plan JSON 无 `observedAt`/凭据字段。 |
| 只读 Git 路由（match→execute 且不 spawn；无能力/未命中 → `readonly-git-runner-unavailable` 且不 spawn；非 git → spawn） | W4 四例 + 「后台入口不路由」+「审核/守卫先于路由」+ Service 注入闭环（demo）——真实 `node:child_process.spawn` 计数为 0/1 的断言。 |
| roleId 透传 | W4「roleId 与 entry 透传审核与执行后审计」（含模型 args 夹带 roleId 被忽略）+「真实 Service 入口 demo 闭环」（role.id 由 Service 注入 tool options）。 |
| 工具 schema/description、输入字段不变 | W4 最后一例：run_shell `properties` 恰 `["command"]`；说明含 10 个只读子命令与 git_query/candidate/publish 指引；后台说明含 git 拒绝口径。 |

---

## 8. 临时夹具与防御性判据（如实声明）

1. **测试登记夹具（临时性）**：生产登记点唯一在 `createShellGate`（W1b 接线）。本批测试直接调用 W1 冻结 API `registerShellApproval(gate, facts, sink)` 构造「已登记 gate」夹具（`session-admission-approval.test.ts` 的 `registeredGate`），不伪造 probe 结果（`facts.audit.probe` 恒 `"unknown"`，探针由 binding 内部执行 `sink.probe()`）。W1b 完成后，编排 E2E 应用真实 `assemble*`/`buildShellGate` 装配的 gate 复跑同一准入语义；本夹具届时可替换，不构成生产路径。
2. **`protected-scope-approval-chain-changed`（AC-27/R6）**：端到端上 prepare→bind 之间替换 `shellGate` 会先被 `isCurrent()` 拦为 `runtime-prepared-configuration-changed`（W2 用例已断言）；该 reason 的判据由导出的纯函数 `matchesRuntimeApprovalChain` 在模块级逐字段覆盖（含 undefined/缺少 projection 的 fail-closed），绑定/执行期复核在异常路径抛出该 reason。与 B1 AC-27「模块级防御判据、端到端非必过」一致。
3. **`ensureAdapter`/`verifyScope` 的 `required && !admittedPlan` 分支**：仅在「core 首次 scope 读为 unmanaged、适配器层再读已变 required」的竞态窗口可达（无确定性注入缝）；本批以「无 token 的受保护会话在更早的核心层即拒绝、适配器零构造」的负例 + 源码复核覆盖该防线（R14：nativeConstructions=0 / requests=0 / marker ENOENT），不伪造竞态测试。该分支为纵深防御，不承担唯一放行判据。
4. **生产过渡状态（预期，必须披露）**：W1b 接线前，生产装配不会登记任何 gate；受保护项目 + 注册 shell 工具的会话将被 fail-closed 拒绝（`protected-scope-approval-chain-unproven`）。这是本设计的有意方向（拒绝优于伪造证据），由编排 W1b 完成后恢复准入；受保护 + 无 shell 工具会话不受影响。
5. **只读 Git 能力注入端未接线**：编排/桌面尚未注入 `readonlyGit`；在此之前，`run_shell` 的 `git` 命令即使被 gate 放行也会得到 `readonly-git-runner-unavailable`（零执行、不回退 spawn）。同属 W 批次接线后的预期行为。

---

## 9. 偏差声明

**I0 偏差 = 0；设计 P1.3 写集内语义全部落地**。无写集外文件改动；无阻塞。实施记录（非偏差）：`start_background_task` 的审核请求也携带 `roleId`（设计 §2.5.1 的 `req` 口径；任务书最低要求为 `run_shell` 必带）；工具层对只读 Git 执行事实做形状校验（非法回执按未执行处理），属 fail-closed 加固。

---

## 10. 跨角色待办（不属本写集，均未执行）

1. **编排 W1b（`shell-gate.ts`/`shell-audit.ts`/`shell-arming.ts`）**：`createShellGate` 构造成功后 `registerShellApproval(gate, baseFacts, opts.audit)`（唯一登记点）；file sink `probe()`/`describe()`（与运行期 append 同一 F-6-1 refresh、最多一次重试）；`CreateShellGateOptions.projectRoot` 契约注释改为准入绑定字段；`auditFailurePolicy`（默认 observe；受保护装配 deny-non-readonly）；`OperatorPrompt.entry/roleId/protectedScope` 与 `ShellAuditRecord.readonlyGit:{id,canonicalArgv}`/`roleId`/`by` 前缀（I0-7）落字段。
2. **编排 W2b/W3b（`run-role.ts`/`shell-arming.ts`）**：删除 `run-role.ts:731-733` 旧门 `runtime-protected-scope-unmediated-app-execution-planned`，按设计加防御断言（plan 声称注册 shell 但无 `approvalChain` ⇒ 按 unproven 处理）；受保护时向装配传保护状态与 `auditFailurePolicy`；从 `matchReadonlyGit`（经 `src/service/gate/shell-rules.ts` 同一引用）+ `executeReadonlyGit` 构造 `readonlyGit` 并注入适配器（连同 roleId 透传已由本层就绪）；`test/编排/shell-risky-order.test.ts:39` 规则集夹具同步 v4。
3. **编排（trunk Provider）**：新增固定传输只读入口 `executeReadonlyGit(projectRoot, match, budgets)`（绝对可执行 + 固定 config/env + `buildReadonlyGitBody`），经 `src/provider/trunk/public/trunk-store.ts` 导出（I0-4）。
4. **桌面（W5-D/U）**：注入 `readonlyGit`；审批卡展示 `entry`（前台/后台）与 `protectedScope` 标识；不改判定。
5. **测试（D1/E3/RR）**：跨角色集成（真实 `assemble*` 装配 gate + 本层准入）、真实运行 AC-23/AC-24、`readonlyGit.canonicalArgv` 与实际执行体对照（AC-6）、writeGuard 注入断言（AC-14/AC-30）由 D1/E3 汇总。
6. **W1b 接线后**：本角色测试的临时 `registerShellApproval` 夹具可与装配路径对齐复核（不改变断言口径）。

---

## 11. 限制（如实）

- 本批只做**受影响套件**（`test/runtime-core`）实施前后对照；全量 T3 回归由 D1/E3 按团队计划执行，不在本批范围。
- 未运行真实模型、未启动桌面应用；AC-23/AC-24 的真实运行证据不属于本批。
- 未验证 `createFileAuditSink` 的真实 probe（属编排 W1b）；本批以结构桩件覆盖 sink 三态。
- 既有 33 个失败为当前工作树/环境既有红（与 W1/W3-G 证据同类），本批未新增、未修复；未用其冒充通过项。
- 证据边界：`approvalChain` 只证明「当前进程内 gate 由应用构造并登记了这些事实/审计探针当时放行」；不证明 native 效果闭包，不覆盖其它进程或绕过（与 PR #72 `current-process-only` 同一诚实口径）。

---

## 12. 结论

W2-R + W4-R 的本角色写集实现、测试与证据完成：创建准入改为「审批链/审计真实装配 + 运行期按操作审批」（unknown/custom/demo/guards/revision 等既有拒绝保留；unconfined 退役；codex 严格路径不动）；只读 Git 走注入的固定传输能力、无能力/未命中 fail-closed 且绝不回退 spawn；`roleId` 透传审核与审计。受影响套件实施前后失败集合同名同数（新增失败 0、新 skip 0），typecheck 绿，I0 偏差 0。未 commit/push/merge/发布，未判验收。
