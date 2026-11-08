# W2 实施证据：删除全部预知式门控（编排·授权门与停稳）

- 任务：`2026-11-08-remove-predictive-gates` / 批次 **W2**（派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §四）。
- 角色：编排（`roleId: 编排`，Section 1 写集；独立实施上下文）。
- 实施基准：方案 **P1.4** `docs/planning/2026-11-08_design_git-write-init-approval-based.md`（§3.2 B/C、§3.3.1–§3.3.4、§3.5、§3.6、§3.8、§4.1、§4.5、§6.1、§8）；B1 v1 `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`；I0 冻结（派发记录 §三：I0-2/I0-4/I0-5/I0-6/I0-8）。
- 日期：2026-11-08。状态：**已实施、已跑确定性测试与 typecheck；未 commit / 未 push / 未 stash / 未 merge / 未发布**。

## 1. 基线

| 项 | 实测 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 | `feat/plan-escalation-card` |
| HEAD | `3f249e2fee1753531d6b566eefc7a64016e863a7` |
| 工作树（起始） | 已含 W1（`src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/*`）与 W3a（`src/provider/trunk/impl/git-command.ts`、`src/provider/trunk/public/trunk-store.ts`、`test/编排/git-action-authorization-sidecar.test.ts`）的未提交改动——**本批只读消费，未回退/改动**。 |
| W2 写集（实际改动） | `src/pipeline/orchestration/trunk-runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/trunk/impl/apply-journal.ts`（仅 C5）、`test/编排/`（3 改 1 增）、本证据。 |
| 参照基线（只读） | 第一变更 E3 T3 组合 4,982 / 4,753 pass / 196 fail / 1 cancelled / 32 skip（派发记录 §一）；本批只对 **`test/编排/**` 受影响套件**做前后对照（§5）。 |

## 2. 改动文件与逐文件 SHA-256（前 → 后）

| 文件 | 前置（HEAD `3f249e2` 内容 sha256） | 后置（工作树） | 行数 |
| --- | --- | --- | --- |
| `src/pipeline/orchestration/trunk-runtime.ts` | `421b8621a6669cd8c699361d702cfec896646420a8cc222c6bde2dc8ea429228` | `804746efcb159b1cb52a8a718d4094419c2cef313a0b10605004491cee12fef0` | 1446 |
| `src/pipeline/orchestration/run-role.ts` | `dd873dcc6404fc9e2a2014b51371e4e261e88aa47e5f23bf2b26706722782dee` | `53459ba43c51ef4c8c9086e7c6bbfa499028de7680c3f4d4acbbc5a93b556db3` | 3649 |
| `src/service/trunk/impl/apply-journal.ts` | `b0588a979131e50f4870cdce7629abfd4395a6f435fe1459dd5d68d6916a9e82` | `5d9b18887617acbfcda897ce31435accb1b22fa7e16438ef34280809b726326f` | 3812 |
| `test/编排/trunk-dispatch-parent.test.ts` | `44b18c2e293895742f27f9cfedcfdcad933d827abdadba25a2ddc71334ba4f90` | `6c252b1ea3bdafca6720677c3039b1d70241c15602375217336d80370f4ce6d3` | 411 |
| `test/编排/rapporteur-module-consumption.test.ts` | `0fcb2577ee8f6e06e3ff13b6eb20124d2c729a3aa3675320ab556d0e30144fa3` | `1df551448b2f6eb401fa8c2f9998e467fbdc8caf0b814e93b8fea34de0ae8fce` | 494 |
| `test/编排/stable-write-runtime.test.ts` | `de4d26b2da7fffdc280e5a150ea94b271443b8ff795d8946fbfa48bcb7904c30` | `2f39b4b5d9260d7bd797b9884c24f11c0cf5dcf90aa7fc7cf96145b7556ead98` | 383 |
| `test/编排/git-action-authorization-gate.test.ts` | —（新增） | `33b932a1576a3bc2f5bb9dfe4f68dd4363f2eadd9a7bac9841920f3376b543f8` | 297 |

> 前置换算：`git show HEAD:<file> | sha256sum`；后置换算：`sha256sum <file>`（工作树字节）。未改动 W1/W3a 文件、`app/`、`test/桌面应用/`、`test/测试/`、`src/model/**`、`src/service/runtime/**`、`src/provider/trunk/**`、`docs/`、其它角色目录。

## 3. 关键实现

### D1. `trunk-runtime.ts`：`inspectInitializationProtection` → `inspectGitActionAuthorization`（I0-4/I0-8）

- **门定位（F1）**：只做身份/根/注册表闭包与运行时中立终止/可读性（H1–H14）；**不接收** `GitPolicyFacts`、不做 `checkGitPolicy`、不持有 lease、**不返回** authorization/policyInputDigests/leaseId；ACL 策略/lease/authorization 组合仍在调用点（W3b 接线 append）。
- **输入（I0-4）**：`{ projectRoot, taskId, parentCoreSessionId, expectedActor:{roleId?,coreSessionId?}, expectedTool?, authorizationMode:"active-tool"|"host-continuation", hostContinuation?:{requesterTurnId,planId} }`。`expectedTool` 在 active-tool 模式**必填**，缺失 ⇒ `git-actor-core-binding-unproven`（S5）。
- **输出（I0-4）**：`{ ok, registryRevision, inventoryRevision, rootsDigest, actor:{entryId,coreSessionId,roleId,runtime,taskId?,runId?,turnId,projectRoot}, controls:{drain:{disposed},fileWriteProtection?,roleCapabilityGuards?}, optionalEvidence:{toolSurfaceStatus?,nativeStatus?,nativeReasons?,processCoverage?,configuredForeignMcpServers?,unknownTools?} }`；optionalEvidence **不读**应用中介字段（PR #72 零引用保持；全文件 0 次该字段名）。
- **H1–H14 落实**：
  - H1 host inventory/pending/creating·disposing·dispose-failed（保留，真实 host 事实）；
  - H2 `recheckRoleSessionOpenFailureInventory`（保留；终止条件已由 A10/C7 改 drain）；
  - H3 `unknownFactoryAttempts`/未登记 controller（保留；文案去掉 effect-scope 措辞）；
  - H4/H5 两种模式：active-tool（唯一 live inventory 记录 + Core `active` + role/project + turn + `activeTools` 含期望工具族）；host-continuation（唯一 live/disposed 记录 + active 或 disposed+drain + `requesterTurnId`）；H6 source parent（保留）；H7 根恰为 `[projectRoot/.git]`（保留）；
  - **B8/B9/B10 预知前提删除**：不再产生 `git-core-creation-proof-unavailable`/`git-native-surface-unproven`/`git-unclosed-effect-registered`；planId/reasons/`processCoverage`/strict observed/native factoryPlan/closedTools 不再作为放行前提；
  - **H13（F4）**：`preparing`/`creating`/`disposing` ⇒ `git-core-in-flight-unproven`；`prepared`/`failed` 仅 `never-started`+`preparedTokensRevoked`+`pendingContinuations===0`+未 factoryEntered/nativeBindEntered（且 `sessionId===undefined`，保持原「未产生 handle」语义）或 `failed`+`instance-bound`+`sessionId` 匹配+`isRuntimeSessionDrained` 豁免，其余 ⇒ `git-core-in-flight-unproven`；
  - **H14（R10）**：active 条目必须可读 lifecycle/toolSurface，`core-instance-inspection-failed`/缺失/`toolSurface.sessionId/roleId/runtime` 漂移 ⇒ `git-core-inspection-unavailable`（不 fail-open）；
  - **H11**：disposed 条目只要求 `isRuntimeSessionDrained(lifecycle)` ⇒ 否则 `git-old-core-programs-unproven`（消息改为「tracked processes 未证明停止（native 覆盖可为 unknown）」）；
  - **H12/B12**：`fileWriteProtection` 条件保留（有 write_file/edit_file 时）；**B11 收窄**：能力回调仍核 `source/mechanism/status/roleId/runtime/sessionId/corePlanId/registryDigest/guardedTools/unguardedTools/reasons`，native 绑定 `present`（surface.native.factoryPlan 与 guard.nativePlanId/nativeConfigDigest 均存在）时核对、缺席则略。
- **12 个 gate 调用点全部改用新签名**（保持「closure → policy → current → execute」与 lease 位置）：commit/integrate/revert（`git_candidate`）、init（`git_candidate`）、delivery（`git_publish`）、文档/计划/激活发布（`submit_version_change`/`complete_team_plan`/`activate_role_documents`）、initial workflow（`versioned-doc-write`）、prepareRunChange（`select_run_change`）、finalizeRunChange（host-continuation）。**本批未新增 sidecar append（W3b）**。
- **`prepareRunChange`（非 Git mutation）模式决策**：`expectedTool` 扩展为工具族并新增 `"select_run_change"` 族（`select_run_change`/`ans_select_run_change`）——保持「真实 active rapporteur 可发起 run-change」且身份 fail-closed，不要求 Git 工具。依据：B1 AC-8/P1.2-AC-25 的「不要求 active Git 工具」与 P1.4 §3.3.2 H5 的「动作来源=真实活动调用」；I0-4 的 expectedTool 类型列举以 Git 工具为上下文，本批按调用点事实扩展并在本证据显式记录。
- **另两处 expectedTool 扩展（同类解释）**：业务发布使用 `complete_team_plan`/`activate_role_documents`/`submit_version_change` 族（对应真实工具回合）；initial workflow 发布由 post-write 接缝触发，真实活动工具是刚完成写入的 `write_file`/`edit_file`（族名 `versioned-doc-write`）。
- **根身份基准（解释性决策）**：按 I0-4 的单 `projectRoot` 输入，H7 期望根 = `[input.projectRoot/.git]`；旧实现对业务发布曾用 `value.gitPlan.repo.root` 作为期望根（事实读取仍用 `input.projectRoot`）。应用内二者一致（git plan root 为项目根源）；如未来出现子目录 repo 根，需接口评审扩展输入（未擅自加字段）。

### D2. run-stop / controller-stop（C1–C4 + F2/R1 + Q8）

- **C1 `prepareRunChange`**：运行成员身份 = 真实 `default-core` Core session（role/runtime 与 host 行一致）+ **可选** native instance（不再要求 `runtime==="codex"`/native 必填）；`run-stop-member-lifecycle-unproven` 码保留、语义收窄；native present 时核 `native.roleId === member.roleId`。
- **C2 `finalizeRunChange`**：
  - 成员终态改为运行时中立 drain（`isRuntimeSessionDrained(fact.lifecycle)`）+ `disposed || stopRequested` 封口；`native absent` 允许；`present-but-changed`（`member.nativeInstanceId` 已记录且 instance/role 漂移）⇒ `run-stop-instance-unproven`；
  - **host-continuation（F2/R1）**：gate 以 `authorizationMode:"host-continuation"` 调用，接受 active 或真正 settled（disposed+drain）的 rapporteur；匹配 `requesterTurnId`/`input.taskId`（inventory 唯一 live/disposed 记录 + 调用点 `held.plan.requesterTaskId`）/`roleId`/`projectRoot`；**不要求 live member/activeTools**；gate 保持先于 host lease 的既有顺序（I0-5/R6），**不写 sidecar**；终止事实写 run transition journal（`commitPreparedRunChange`）。
- **C3 `prepareControllerStop`**：Core/role/task 身份保留；native 可选（不再 `runtime==="codex"`/native 必填）；native present 时核 `native.roleId==="convener"`；`controller-stop-target-instance-unproven` 码保留、语义收窄。
- **C4 `finalizeControllerStop`**：terminal 用 `isRuntimeSessionDrained(fact)`（不再 quiescent/processCoverage complete/reasons 空）；native 可选（absent 允许；present-but-changed instance/role ⇒ `controller-stop-terminal-unproven`）；Core/role/task/fence 身份保留。
- **Q8**：`RunChangeHostPlan.handles[].nativeInstanceId` 与 `ControllerStopHostPlan.handles[].nativeInstanceId` 改为**可选**（不新增 `identityKind`）；`app/desktop/session.ts` 现有 `!==` 比较在类型可选化后仍可编译（`npm run typecheck` exit 0；未改桌面文件）。

### D3. `run-role.ts`（A10/C7；A1/A7 残留复核）

- `recheckRoleSessionOpenFailure` 的 instance-bound 终止分支：`status==="quiescent" && processCoverage==="complete" && …` → `isRuntimeSessionDrained(lifecycle)`；身份/历史检查（failureId ref、hostHandleId、projectRoot/role/runtime、processInstanceId/registryRevision、revoked/pending）逐字保留。失败打开的 Claude/Pi 形态（status/processCoverage unknown、native 覆盖不可观测）不再结构性阻塞后续 Git 动作；未知/live-work reason 默认阻断（I0-3）。
- **A1/A7 残留复核 = 0 生产产生**：`hasUnconfinedScriptTools`/`required-scope-unconfined-script-tools`/`runtime-protected-scope-unmediated-app-execution-planned` 在 `src/`、`app/` 仅存退役注释（`run-role.ts:750`、W1 `session.ts:244-245`）；无代码产生（日志 `2026-11-08_W2_evidence/a1-a7-retired-code-scan.log`）。

### D4. `apply-journal.ts`（仅 C5）

- `commitPreparedRunChange`：`evidence.instances` 的终止证据改为 `isRuntimeSessionDrained(fact)`——删除 `status==="quiescent"`/`processCoverage==="complete"`/native 必填/native quiescent 等前提；保留 Core/tracked 终止、host fence（`run-host-fence-unverified`/`hostStops`）、ledger/requester/source 校验与 `run-stop-unverified` 码（语义收窄）。
- **未变**：`selectRunChange` 的 direct-stop 治理拒绝（`if (input.mode !== "continue-frozen") … "run-stop-unverified"`）逐字保留；`commitPreparedDirect/TeamPlan/Activation/InitialWorkflow` 的 journal 语义未改；**不写 sidecar**（run-stop 不是 Git mutation；R6）。

## 4. 测试（`test/编排/`）

### 4.1 新增测试

- **`git-action-authorization-gate.test.ts`（新增，5 用例）**：
  1. active-tool 正向（真实 Core 会话 + host inventory 发布）：gate ok；输出形状只含 actor/controls/optionalEvidence + revisions/rootsDigest（无 authorization/policyInputDigests/leaseId）；F8：foreign MCP 只进 `optionalEvidence.configuredForeignMcpServers`、不参与判定；
  2. `expectedTool` 缺失 ⇒ `git-actor-core-binding-unproven`（S5）；actor Core/角色/任务不符同码；
  3. H13：未撤销的 prepared 条目 ⇒ `git-core-in-flight-unproven`；退役码零命中；撤销后（never-started+revoked+无 pending+未进入 factory/nativeBind）豁免 ok；
  4. F2/R1 host-continuation：真正 settled（disposed+drain）的 rapporteur ⇒ ok、`controls.drain.disposed===true`；taskId 不符 / 记录不唯一 / requesterTurnId 漂移 / 缺 hostContinuation ⇒ `git-actor-core-binding-unproven`（P1.2-AC-29）；
  5. C1–C4/Q8 源码结构守卫：run-stop/controller-stop 不再要求 codex/native；finalize 用 drain；present-but-changed 拒绝；两个 host plan 的 `nativeInstanceId?` 可选；finalize gate 先于 host lease；不写 sidecar。

### 4.2 断言改写清单（契约变更，逐条）

1. **`trunk-dispatch-parent.test.ts` §5（原 N15）**：
   - before：定位 `async function inspectInitializationProtection`；断言段内含 `surface.status !== "observed"` 与 `surface.nativeToolRegistry !== "application-mediated"`；零 `applicationMediation`。
   - after：定位 `export async function inspectGitActionAuthorization`；断言旧名溯源注释存在（I0-8）；4 条预知前提（strict observed/application-mediated 注册表/default-production 工厂/`!surface.native?.factoryPlan`）**不在**门段；3 个退役码在门段与全文件均零命中；新码 `git-core-in-flight-unproven`（H13）/`git-core-inspection-unavailable`（H14）/`core-instance-inspection-failed`/`isRuntimeSessionDrained(lifecycle)` 存在；`processCoverage !== "complete"` 零命中；门段零 `applicationMediation`；`authorizationMode`（I0-4）存在。
   - 理由：契约变更（P1.4 §3.2 B8-B10 删除、§3.3 H11/H13/H14、I0-8 改名）。
2. **`rapporteur-module-consumption.test.ts`**：既有 direct-stop 断言（迁移前 `run-stop-unverified` 语义、preflight 位置、`apply-journal` 不接角色策略、`if (input.mode !== "continue-frozen")` 逐字）**全部保留未改**；新增 1 用例（见 4.1、§4.3）断言 `commitPreparedRunChange` 段使用 `isRuntimeSessionDrained(fact)`、`processCoverage`/`fact.native`/`fact.status !== "quiescent"` 不再作为前提、`run-stop-unverified`/host fence 保留、不写 sidecar，并以 drain 真值表给出正/负例。
3. **`stable-write-runtime.test.ts`**：既有 `git-old-core-programs-unproven` 桩断言（码保留、失败透传/通知）**未改**；新增 1 用例把该码的语义收窄绑定到 drain：门段保留码且使用 `isRuntimeSessionDrained(lifecycle)`、`processCoverage` 判定零命中；Claude/Pi disposed 形态（status/processCoverage unknown、native 覆盖类 reason）drained=true；active tool/未退出进程/非 idle Pi/清理失败/未知 reason 全部阻断。

### 4.3 未删除/未放宽声明

未删除任何既有测试用例、未放宽既有断言、未新增 `skip`、未使用 `--test-force-exit`。新增用例 7 个（gate 5 + rapporteur 1 + stable-write 1）。

## 5. 命令与原始结果

### 5.1 实施前（`test/编排/**`，顺序执行）

- 日志 `2026-11-08_W2_evidence/before-pianpai-concurrency1.log`：
```
node --test --test-concurrency=1 "test/编排/**/*.test.ts"
ℹ tests 1099
ℹ pass 1075
ℹ fail 22
ℹ cancelled 0
ℹ skipped 2
NODE_EXIT:1
```
- 22 个失败为**既有环境性红**（如 `process.cwd()` 检出根无 `.ans/project.json` 的 VCA/角色卡用例、既有 `git-capabilities` team-plan 用例等）；名单 `before-failures.txt`（22 条，排除 `✖ failing tests:` 标题行）。2 个 skip 为既有环境变量 gated 用例（`Delivered Hub/legacy code provenance…`）。

### 5.2 实施后（同一命令、同一环境；**最终候选**）

- 日志 `2026-11-08_W2_evidence/after-pianpai-final.log`：
```
ℹ tests 1106
ℹ pass 1082
ℹ fail 22
ℹ cancelled 0
ℹ skipped 2
ℹ todo 0
ℹ duration_ms 128607.1838
NODE_EXIT:1
```
- **失败集合逐条对照**（文件+测试名排序 `diff`，`before-failures.txt` vs `after-failures.txt`）：**完全一致（22/22）**；**新增确定性失败 0、新增 skip 0**；skip 集合 `diff` 为空（`after-skips.txt`）。`NODE_EXIT:1` 由既有 22 个失败导致，非本批新增。
- 新增 7 个用例全部 pass（1106 = 1099 + 7；pass 1082 = 1075 + 7）。
- 中间运行 `after-pianpai-concurrency1.log`（含前 6 个新用例，5th gate 用例追加前的旁证）保留。

### 5.3 typecheck

- `npm run typecheck`：**EXIT 0**（`2026-11-08_W2_evidence/typecheck-final.log`）；`app/desktop/session.ts` 在 `nativeInstanceId?` 可选化后仍编译（未改桌面文件）。

## 6. 与 I0/B1 的对照与偏差

| I0/基准 | 结论 |
| --- | --- |
| I0-4 gate 输入/输出 | **按冻结形状实现**；expectedTool 在冻结三 Git 工具外按调用点事实扩展 4 族（见 D1「模式决策」，任务书明确允许 `select_run_change` 解释空间并须记录）；输出无 authorization/policy/lease；optionalEvidence 不读应用中介字段 |
| I0-5 finalize 顺序/宿主继续 | gate 先于 host lease；host-continuation 专项分支；不写 sidecar；native absent 允许/present-but-changed 拒绝；`nativeInstanceId?` 可选 |
| I0-6 H13/H14 | 按冻结边界实现（含 never-started 豁免保留 `sessionId===undefined` 的原文「未产生 handle」语义） |
| I0-2 sidecar | 本批**未**调用 append；`apply-journal.ts` 仅 C5；`git-trunk-store.ts`/`git-capabilities.ts` 零改动 |
| I0-8 改名 | `inspectGitActionAuthorization` + 旧名注释溯源；同步 `test/编排` 源码断言 |
| P1.4 §3.8 错误码 | 退役码零产生；新增 `git-core-in-flight-unproven`/`git-core-inspection-unavailable`；收窄码保留字面 |
| **实现偏差 = 0** | 未改 W1/W3a 文件、未改 `app/`、`test/桌面应用/`、`test/测试/`、`src/model/**`、`src/service/runtime/**`、`src/provider/trunk/**`、`docs/`、其它角色目录；未 commit/push/stash/merge/发布 |

**解释性决策（已在 D1/D2 显式记录，供验收复核判定；均非 I0 行为偏离）**：
1. expectedTool 工具族扩展（`select_run_change`/`complete_team_plan`/`activate_role_documents`/`submit_version_change`/`versioned-doc-write`）——调用点真实活动工具即动作来源；不改变 Git 身份/ACL/策略/lease 语义。
2. H7 期望根按 I0-4 单 `projectRoot`（详细见 D1 根身份基准）。
3. H13 never-started 豁免保留 `entry.sessionId === undefined`（原实现语义；更严格方向）。
4. optionalEvidence：`toolSurfaceStatus/nativeStatus/nativeReasons/processCoverage` 取 actor 条目；`configuredForeignMcpServers/unknownTools` 为**跨 active 条目并集**（F8/AC-28 的「其它 active 会话」可记录），只记录不判定。
5. B11 能力回调的 core plan 绑定要求 `guard.corePlanId` 为非空字符串且等于 `entry.planId`（fail-closed；native 绑定「有则核、无则略」）。

**覆盖边界（如实，非 I0 偏差）**：
- **`finalizeRunChange` 的完整 deferred 提交链（真实 pinned run + host stop fence + run transition journal 落盘）未在 `test/编排` 内端到端构造**（需要完整派发/冻结/host 停稳夹具）；本批以 gate 级 host-continuation 正/负例 + 源码结构守卫覆盖 W2 变更点。跨角色集成与源码断言改写由 W5（`test/测试/`）按派发计划执行；B1 AC-8 的最终判定需其证据。
- `prepareRunChange`/`prepareControllerStop` 的 C1/C3 成员接受行为同样需要完整 pinned-run/host 夹具，本批以源码结构守卫覆盖（§4.1-5）。
- 已知跨角色待同步（W5 写集，非本批）：`test/测试/runtime-dispatch-gate-integration.test.ts`（旧符号定位）与 `test/测试/session-admission-approval-q9-integration.test.ts`（Q9 期望 `git-native-surface-unproven`，该码按 P1.4 §3.8 退役）在 W2 后会在 W5 改写前失败；此为 Q9/`P1.3-B1-AC-26` 显式取代关系（B1 §0）的一部分，W5 负责同步。

## 7. 未提交声明

- 未执行 `git commit` / `git push` / `git stash` / `git merge` / 发布/tag；所有改动仅存在于工作树。
- 未修改 `docs/`（除本角色 `docs/change/2026-11-08_W2_*` 证据）、角色卡/边界/YAML、方案 P1.4、B1 v1、团队计划/派发记录。
- W1/W3a 的未提交改动不属于本批候选，未读取改写。

## 8. 证据文件索引（`2026-11-08_W2_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `before-pianpai-concurrency1.log` | 实施前基线（顺序执行；1099/1075/22/0/2；node exit 1） |
| `before-failures.txt` | 实施前失败名单（22 条，排序） |
| `after-pianpai-concurrency1.log` | 实施中间全量（含前 6 个新用例；1105/1081/22/0/2） |
| `after-pianpai-final.log` | **最终候选**全量顺序运行（1106/1082/22/0/2） |
| `after-failures.txt` | 实施后失败名单（与 before 完全一致） |
| `before-skips.txt` | 实施前 skip 名单 |
| `after-skips.txt` | 实施后 skip 名单（与 before 完全一致） |
| `a1-a7-retired-code-scan.log` | A1/A7 残留与退役码产生点扫描（仅退役注释，0 生产） |
| `typecheck-final.log` | `npm run typecheck`（EXIT 0） |
