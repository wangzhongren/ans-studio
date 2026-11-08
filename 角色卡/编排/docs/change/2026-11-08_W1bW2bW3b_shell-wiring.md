# W1b+W2b+W3b（合并一轮）证据：审批链登记/审计探针/审计失败策略/只读 Git 固定传输与注入

- **任务**：`2026-11-08-session-admission-approval`（flowId `session-admission-approval-based`）W1b+W2b+W3b 合并一轮
- **记录角色**：编排（固定 worker 上下文）
- **日期**：2026-11-08
- **检出**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；Node v24.22.1；Windows 11 Pro 10.0.26300）
- **性质**：本角色自证证据，**不是验收结论**（B2 独立验收按 B1 v1 判定）；未提交/未推送/未暂存/未合并/未发布；未运行真实模型；未修改本角色写集外任何文件。
- **自引用声明**：本文件不嵌入自身 SHA-256（落盘后由完成报告/验收复算）；其余文件 hash 均为写盘后原字节复算（`sha256sum`）。

---

## 1. 输入（本批开工时实测）

| 输入 | 路径 | 行数 / 字节 / SHA-256 |
| --- | --- | --- |
| 派发与接口评审（I0） | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` | 84 / 13909 / `28a9d762a58cf6f25c57ad3641df5636d9ab5ffc48d0f8abca23ce967492a6a3` |
| 设计 **P1.3**（实施基线） | `docs/planning/2026-11-08_design_session-admission-approval-based.md` | 855 / 130013 / `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`（与派发记录一致） |
| 复核记录（F2/F4/F5/F8/F10/R1–R5/R8） | `docs/planning/2026-11-08_review_session-admission-approval-based.md` | 193 / 53879 / `817ebc9de73f825f474b42a8f714866bd1d5ddd9b0348e14a2c6f0b3b44d122d`（一致） |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` | 185 / 29020 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`（一致） |
| W1 共享件（只读消费） | `src/common/shared/shell-approval-binding.ts` | 287 / 13627 / `8fdcda39f74a1c06a954703d20e083e46bba8f539903485e934ec7d2e395926d`（一致） |
| W1 证据 | `角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md` | 122 / 12918 / `460bef8602b0ed65c0a71fb377c175eff71b6a8e82506cfaa04ca1b0ec2a71fd` |
| W3-G 公共出口（只读消费） | `src/service/gate/shell-rules.ts` | 31 / 3207 / `0ea4729b014d25dc21a3d3196b9db253a22ce62a72607485f2d4847fc48aa3c7`（一致） |
| W3-G 证据 | `角色卡/门禁引擎/docs/change/2026-11-08_W3G_readonly-git-matcher.md` | 124 / 17182 / `c593ea51e1ebded00b61d7836c5287a546a733993a851af0539c57845a372b9e` |
| W2+W4 证据 | `角色卡/运行时核心/docs/change/2026-11-08_W2W4_session-admission-runtime.md` | 225 / 26337 / `86db4eedb7097d2dddb89f8f9e1e920beb7126b49802834de7b09f42c4347b52` |

---

## 2. 写集与逐文件 SHA-256（写盘后复算）

| # | 文件 | 类型 | 行数（前→后） | 字节 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/编排/shell-audit.ts` | 修改（探针/描述/审计字段） | 238 → 304 | 15426 | `b68cb129b7deb06bec6ca51ee25e0f06e2d5cd073524c8b9c5331a307a15a450` |
| 2 | `src/common/编排/shell-gate.ts` | 修改（登记/审计策略/只读 Git 审计/entry/OperatorPrompt 透传） | 1478 → 1630 | 95206 | `b64b83e3f7c38504e466e38bd8280e37c67857b9bbca443f5ae8dd63ef58c14e` |
| 3 | `src/pipeline/orchestration/shell-arming.ts` | 修改（`auditFailurePolicy` 透传） | 463 → 474 | 31543 | `b4a121d2631413dc40239fdb140663ae0c58dd6fdfe0642456c5433efee753f5` |
| 4 | `src/pipeline/orchestration/run-role.ts` | 修改（旧门退役/防御断言/策略/能力注入） | 3603 → 3647 | 237507 | `dd873dcc6404fc9e2a2014b51371e4e261e88aa47e5f23bf2b26706722782dee` |
| 5 | `src/provider/trunk/impl/git-command.ts` | 修改（`executeReadonlyGit` 固定传输） | 624 → 724 | 63945 | `ac723f843fe73270335f0a3f4070fb3dd76ddc1b0ae1fb6222470dd3ad9f8321` |
| 6 | `src/provider/trunk/public/trunk-store.ts` | 修改（公共出口再导出） | 55 → 58 | 3832 | `c89716b58568e9872c80d266a672a7c538fbea9b0ab5581dfd0e6d655a435d8d` |
| 7 | `test/编排/shell-risky-order.test.ts` | 修改（规则集夹具 v4） | 397 → 399 | 18514 | `f5d858f194630fecce566b7659070b57307f2d74564731f7f3aed31e91541edf` |
| 8 | `test/编排/shell-approval-wiring.test.ts` | 新增（7 例；含 W5-D 补线 prompt 透传） | 0 → 400 | 19473 | `d14d068305ef6286ad0bf90834c6d0023553186a49986ac78f23b7dfa1911f5b` |
| 9 | `test/编排/readonly-git-transport.test.ts` | 新增（5 例） | 0 → 142 | 7026 | `e8495dfffcd16201b19470df86d60c5638881ae433daf8e2bbe40a0afc7bc663` |
| 10 | `test/编排/shell-write-guard-injection.test.ts` | 新增（3 例） | 0 → 163 | 7398 | `749e86cf0238d9c854d5ce59c931c6789ae15924b805ceeb7d0d1f60a3bc809e` |
| 11 | `test/编排/run-role-admission.test.ts` | 新增（3 例） | 0 → 211 | 8031 | `c07092ed64d0332031170876865e22c619147b63d54b40b8415ed08980b65a62` |
| 12 | `角色卡/编排/docs/change/2026-11-08_W1bW2bW3b_shell-wiring.md` | 新增（本证据） | 见落盘报告 | 见落盘报告 | 见落盘报告 |

**写集核对**：`git status --porcelain` 对本角色新增改动仅显示上述 6 个 `M`（src）+ 1 个 `M`（test）+ 4 个 `??`（test/编排）；工作树中其余未提交改动（T1 Claude schema、W1 binding、W3-G 门禁引擎、W2/W4 运行时核心等）属其他角色批次，本批未触碰、未修改。未修改 `app/`、其他角色目录、其他测试目录、角色卡/边界/方案/验收/沟通/调度文件。

---

## 3. 实现摘要

### 3.1 `src/common/编排/shell-audit.ts`（A）

- `ShellAuditSink` 增加可选 `probe?(): Promise<"ok"|"unavailable"|"unknown">` 与 `describe?(): {kind:"file"|"memory"|"custom"; durable:boolean; relPath?:string}`。
- `createFileAuditSink`：`describe() = {kind:"file", durable:true, relPath}`（relPath 缺省 `docs/audit/shell-gate.jsonl`）；`probe()` 与 `append` **同一 F-6-1 语义**——用当前 `activeGate` 做**纯判定**（不写盘/不建目录）；被拒且注入 `refreshGate` ⇒ await 刷新后以新 gate 重试一次（放行则切换活跃门禁）；两次都拒/刷新失败/门禁抛错 ⇒ `"unavailable"`；放行 ⇒ `"ok"`。`append` 原有路径逐字未改。
- `createMemoryAuditSink`：`describe = {kind:"memory", durable:false}`、`probe = "ok"`。
- `ShellAuditRecord` 增加**必做** `readonlyGit?: { id: string; canonicalArgv: string[] }`（仅只读 Git 放行时出现）与可选 `roleId?: string`；`branch` 语义未改。

### 3.2 `src/common/编排/shell-gate.ts`（B）

- **唯一登记**：`createShellGate` 构造成功（`gate` 函数定义完成）后调用 `registerShellApproval(gate, approvalBindingFacts(opts), opts.audit)`。
  - `baseFacts` 白名单投影：`source:"orchestration-shell-gate"`、`version:1`、`projectRoot`（`opts.projectRoot`；契约注释从「仅诊断」改为「准入绑定字段」，仍不参与分类判定）、`mode`（`readonlyOnly` ⇒ `readonly`；`operatorOnly` ⇒ `operator-approve`；`advisoryRuleset` ⇒ `rules-advisory`；否则 `three-layer`）、`classifier`/`rules`/`pmAsk`/`operatorChannel`/`takeGrant`/`takeDirective`/`routinePolicy`/`escalation`（`onReviewed` 注入即判真）。
  - `audit` 由 `opts.audit.describe?.()` 投影：缺失 ⇒ `{sink:"custom",durable:false}`；memory ⇒ memory/false；file ⇒ file/true/relPath；`probe` 恒 `"unknown"`（binding 硬校验）。
  - **测试私有 Symbol**：`hasShellApprovalTestNonDurableAllowance(opts.audit)` 为真时，仅登记事实按 `{sink:"file",durable:true,probe:"unknown",relPath:"docs/audit/shell-gate.jsonl"}` 投影（测试专用模拟；生产装配测试断言不设置）；不进入任何分类/判定路径。
- `CreateShellGateOptions.auditFailurePolicy?: "observe" | "deny-non-readonly"`（缺省 observe）：最终结论 allow 且**非 `c-allow` 只读白名单**（审批/指令/升级/委托路径）且 `audit.append` 失败 ⇒ 返回 `{allow:false, reason:"审计写入失败，已拒绝执行（fail-closed）", by:"audit:unavailable"}`，诊断 `shell.audit.deny`（`reasonCode:"audit-unavailable"`）；只读 `c-allow` 不翻转；`snapshotBefore` 仅在最终 allow 时执行。
- `writeGuard` 调用传 `entry: req.entry ?? "run_shell"`（守卫已支持可选 `entry`；判定顺序不变）。
- 审计记录：`entry` 既有；新增 `roleId`（`req.roleId` 非空）与 `readonlyGit`。
- **只读 Git 审计**：分类结果 `allow` 且 `detail.ruleId` 以 `allow:readonly:git:` 开头时；**生产四态封装只回裸串（无 ruleId）**——沿用 routine 白名单同一先例，ruleId 缺省时用 `matchReadonlyGit(req.argv)`（`src/service/gate/shell-rules.ts` 同一函数引用）按 argv 兜底判定并把 ruleId 补为 `allow:readonly:git:<id>`；记录 `readonlyGit:{id, canonicalArgv: buildReadonlyGitBody(match)}`；`by` 仍为 `ruleset:<ruleId>`（前缀口径，`byTagged` 档位后缀保留）；`branch` 保持 `c-allow`。未命中 matcher 时不写字段（不伪造规范体）；**无 matcher/规范体第二份实现**。
- `buildShellGate` 选项与透传增加 `auditFailurePolicy`。

### 3.3 `src/pipeline/orchestration/shell-arming.ts`（C）

- `AssembleShellGateOptions` 与 `AssembleOperatorShellGateOptions` 增加 `auditFailurePolicy?: "observe" | "deny-non-readonly"`，透传到 `buildShellGate`/`createShellGate`；只读档（不接 (a)）不新增该选项。

### 3.4 `src/pipeline/orchestration/run-role.ts`（C）

- `bindPreparedRuntimeRole`：删除旧门 `runtime-protected-scope-unmediated-app-execution-planned`（`:731-733`）；新增防御断言：`requirement.state === "required"` 且 `prepared.plan.native?.appTools` 含 `run_shell`/`start_background_task` 且 `prepared.plan.approvalChain === undefined` ⇒ `runtime-creation-admission-unproven:protected-scope-approval-chain-unproven`（discard 后抛错；不 bind）。保留 token/observed 与 `runtime-creation-admission-unproven:<reasons>`。
- 受保护状态传装配：`assembleOperatorShellGate`/`assembleProjectShellGate` 调用处传 `auditFailurePolicy: roleCapabilityProtection.state === "required" ? "deny-non-readonly" : "observe"`（`readGitHostProtectionRequirement` 既有导入；装配失败语义不变——缺件不 arm）。
- 只读 Git 能力注入：`const readonlyGit: ReadonlyGitCapability = { match: (argv) => matchReadonlyGit(argv), execute: (match, budgets) => executeReadonlyGit(project.projectRoot, match, budgets) }`；进入 `AdapterCapabilities.readonlyGit`（能力面）与 `createRuntimeAdapterFactory` 的 `RuntimeSessionOptions.readonlyGit`（`capabilities?.readonlyGit ?? options.readonlyGit`，桌面经同一工厂/选项透传）。`AdapterCapabilities.roleId: setup.role.id` 进入适配器能力面（官方工厂由 Service 按 `role.id` 注入工具 options；自定义工厂可读）。
- `shellWriteGuard` 闭包向 `evaluateShellWriteTargets` 传 `entry: req.entry ?? "run_shell"`（与 shell-gate 侧一致）。

### 3.5 `src/provider/trunk/impl/git-command.ts` + `public/trunk-store.ts`（D）

- 新增 `executeReadonlyGit(projectRoot, match, budgets?)`：只接受 matcher 的受限描述（结构校验：模板 ∈ 10 项、`id===template`、OID/HEAD 形态、cat-file 模式、行号范围、路径数组等——**不是第二份 matcher**，白名单解析/规范体仍唯一在门禁引擎）；内部 `buildReadonlyGitBody(match)`（经 `src/service/gate/shell-rules.ts` 导入，同一函数引用）构造规范体；**不接受任意 argv**。
- 复用 `executeGit`：`GIT_EXECUTABLE` realpath 绝对可执行、`--no-pager --no-optional-locks --literal-pathspecs` + 12 项固定 `-c`、env 重建（SystemRoot/WINDIR/TEMP/TMP、PATH=git dir、HOME/XDG、GIT_CONFIG_NOSYSTEM/GLOBAL、GIT_TERMINAL_PROMPT、GIT_OPTIONAL_LOCKS、GIT_NO_REPLACE_OBJECTS、GIT_CEILING_DIRECTORIES、GIT_ATTR_NOSYSTEM、GIT_LFS_SKIP_SMUDGE、LC_ALL/LANG/TZ）、`spawn` 绝对路径 + `shell:false`；预算沿用 `executeGit` 内 clamp（timeout 1..30000ms、输出 ≤4MiB）。
- 返回映射为运行时核心 `ReadonlyGitExecutionFacts`（exitCode/signal/stdout/stderr/error/timedOut/stdoutTruncated）。
- `public/trunk-store.ts` 经 impl 再导出（公共出口，I0-4）。

---

## 4. I0 接口约束确认（本批次适用项，偏差 = 0）

| # | 结论 | 本批执行情况 |
| --- | --- | --- |
| I0-1 | `registerShellApproval(gate, facts, sink)` 签名；**唯一登记点 = `createShellGate` 构造成功后**；`buildShellGate`/`assemble*` 只传 `projectRoot`/sink | 逐字执行；`buildShellGate`/`assemble*` 无登记调用、不参与 probe 值传递（binding 无该入口） |
| I0-2 | 测试私有 Symbol 挂 **sink 对象**非枚举；不得经生产出口再导出；生产装配不得设置 | shell-gate 仅经 `hasShellApprovalTestNonDurableAllowance(opts.audit)` 只读检查并投影登记事实；`shell-arming.ts`/`run-role.ts` 不引用 Symbol/检查器（测试源码断言）；Symbol 不影响分类/判定 |
| I0-3 | 未登记 ⇒ `undefined`；已登记但 probe 缺失/抛错 ⇒ 冻结 facts 且 `probe:"unavailable"`；并发共享/memoize；无接受 probe 值的 API | 本批只在 `createShellGate` 登记，probe 由 binding 内部执行；测试经 `inspectShellApproval`/`probeShellApproval` 观察（未登记 undefined、memory probe ok、custom 缺 probe unavailable） |
| I0-4 | 只读 Git 注入能力对象；matcher 经 `shell-rules` 同一引用；`executeReadonlyGit` 经 trunk 公共出口；不得第二份 matcher/规范体 | `run-role` 构造 `{match, execute}` 注入 capabilities + 工厂 options；`executeReadonlyGit` 内部唯一经 `buildReadonlyGitBody`；测试断言 `match` 与 `matchReadonlyGit` 同一结果、执行面无第二份 spawn/模板 |
| I0-5 | 规则集 v3→v4 同步 | `test/编排/shell-risky-order.test.ts` 夹具 `version:"3"`→`"4"`（该用例注入 stub classifier，不经 `validateRules`；口径一致性） |
| I0-6 | `auditFailurePolicy` 默认 observe；受保护由 `assembleProjectShellGate`/`assembleOperatorShellGate` 启用 `deny-non-readonly`；只读 c-allow 不翻转；审批类 allow + 审计失败 ⇒ 拒绝 + `shell.audit.deny` | 已实现并测试（observe 放行 / deny 翻转 / c-allow 不翻转 / assemble 透传 / run-role 两处传入） |
| I0-7 | `ShellAuditRecord.readonlyGit:{id,canonicalArgv}`（必做）在 `shell-audit.ts`；`branch` 保持 `c-allow`；`by` 以 `ruleset:allow:readonly:git:<id>` 为**前缀**；canonicalArgv 与实际执行体一致（单一来源 `buildReadonlyGitBody`） | 已实现并测试（`git status`/`git log -5` 的 `by` 前缀、`branch:"c-allow"`、`readonlyGit.canonicalArgv` 与 `buildReadonlyGitBody` 逐字一致）；执行体由 `executeReadonlyGit` 同一函数构造 |
| I0-8 | P1.3 勘误 E1–E4（实际路径/owner） | 本批按实际路径/owner 执行（trunk owner=编排；binding=shared；shell-write-guard=门禁引擎） |
| I0-9 | 依赖方向：binding 只依赖 model；`ReadonlyGitMatch` 经 shell-rules 类型再导出；model 侧 match 不透明；不得第二份定义 | `shell-gate`/`run-role`/trunk 均经 `src/service/gate/shell-rules.ts` 消费同一函数/类型；`ReadonlyGitCapability.match` 保持 `object` 不透明；`src/model/` 未改动 |
| I0-10 | 不重开 I0；新增偏差须停止回报 | 本批**无偏差**（见 §8） |

---

## 5. 受影响套件实施前后对照

### 5.1 命令与环境

```
node --test "test/编排/**/*.test.ts"
```

Node `v24.22.1`，Windows 11 Pro（10.0.26300），worktree 现状（含 W1/W2-R/W3-G 与 T1 等其它角色未提交改动）。前后命令、环境一致。

### 5.2 计数

| 时点 | tests | pass | fail | cancelled | skipped | todo | 退出码 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **实施前**（本批开工时，未改本角色任何文件） | 1075 | 1051 | 22 | 0 | 2 | 0 | 1（既有红） |
| **实施后·第 1 次**（本批候选） | 1092 | 1067 | 23 | 0 | 2 | 0 | 1 |
| **实施后·第 2 次**（复跑，稳定确认） | 1092 | 1068 | 22 | 0 | 2 | 0 | 1（同名同数既有红） |
| **实施后·第 3 次**（最终复跑） | 1092 | 1068 | 22 | 0 | 2 | 0 | 1（失败集合逐条 diff 为空） |
| **修订后**（W5-D 补线，见 §12） | 1093 | 1069 | 22 | 0 | 2 | 0 | 1（失败集合逐条 diff 为空） |
| 增量（对修订后） | **+18** | **+18** | **0** | 0 | **0** | 0 | — |

### 5.3 失败集合对照（同名同数）

- 实施前与实施后·第 2 次失败测试名集合逐条 `diff` 为**空**（22 个既有失败同名同数）；**新增确定性失败 = 0、新增 skip = 0**；未删除/放宽任何既有断言，未加 skip/force-exit。
- 既有 22 个失败为当前工作树/环境事实（角色卡文本、D3/roster、worktree `.git` 为文件导致 `readGitHostProtectionRequirement` 返回 `unknown` 等；与 W1/W3-G/W2W4 证据同一环境口径），本批未改变其集合、未修复、未以其冒充通过。
- **实施后·第 1 次的新增 1 个失败为环境/时序抖动**：`test/编排/download-provider.test.ts`「provider：空闲/总超时、连接超时、AbortSignal；服务端请求次数符合无自动重试」在并行负载下断言未落盘文件出现（`file.bin`）；单文件复跑 **14/14 pass**、全套第 2 次未复现。该用例与本批写集无调用关系（download Provider 未被修改）；如实披露、不计为确定性失败、不掩盖。
- 设计 §4.5 点名的既有红 `test/编排/shell-readonly.test.ts`、`test/编排/shell-gate.test.ts` 在实施前后均为**绿**（W3-G 已完成转绿）；本批复跑保持绿。
- **跨角色冒烟（只读运行，未修改其文件）**：`node --test "test/runtime-core/**/*.test.ts"` → **523 / 486 pass / 33 fail / 4 skip**，与 W2+W4 证据的实施后基线逐项一致（本批未新增失败、未新增 skip）；证明 shell-gate 登记/审计返回路径不影响运行时核心既有套件。

### 5.4 本批新增测试

| 文件 | 用例数 | 结果 |
| --- | --- | --- |
| `test/编排/shell-approval-wiring.test.ts` | 7 | 7 pass / 0 fail / 0 skip |
| `test/编排/readonly-git-transport.test.ts` | 5 | 5 pass / 0 fail / 0 skip |
| `test/编排/shell-write-guard-injection.test.ts` | 3 | 3 pass / 0 fail / 0 skip |
| `test/编排/run-role-admission.test.ts` | 3 | 3 pass / 0 fail / 0 skip |

覆盖要求逐项：createShellGate 登记（inspect 可见/未登记 undefined/重复登记 fail-closed/四档 mode/audit describe 投影）；file sink `describe`/`probe`（temp 项目、refresh 一次重试、两次拒/刷新失败/门禁抛错 ⇒ unavailable、纯判定不写盘）；memory describe/probe；测试私有 Symbol 投影与生产装配不设置断言；`auditFailurePolicy` observe/deny 分支与 assemble 透传；`readonlyGit` 审计字段与 `by` 前缀（`git status`/`git log -5`，含裸串与 detailed classifier 两径、roleId/entry）；writeGuard `entry` 透传与注入断言（项目链/审批档携带 writeGuard、裸 Git 写硬拒、后台入口拒绝、只读档不接 (a)）；`executeReadonlyGit` 固定传输（绝对可执行/固定 config+env 静态断言、预算截断、repo-local alias 传输前 fail-closed、不接受任意 argv、夹带 argv 被忽略、执行面不自行 spawn）；run-role 能力注入与防御断言（受保护 + shell + 无 approvalChain ⇒ unproven 且不 bind；unmanaged 不误伤）。

---

## 6. `npm run typecheck`

```
> ans-cli@1.9.2 typecheck
> tsc --noEmit
```

- 退出码 **0**，无诊断输出（覆盖 `src`/`test`/`app`，`app/renderer` 除外）。实现+测试完成后运行，最终复跑一次仍为 0。

---

## 7. 实施判定记录（非偏差）

1. **只读 Git 裸串分类器兜底**：生产桌面注入的 `classifyShell` 四态封装只回裸串（不带 ruleId，W3-G 与既有注释均确认）。若仅按 `detail.ruleId` 前缀判定，生产 `git status` 的审计将缺 `readonlyGit`/`by` 前缀（AC-6 不可达）。本批沿用 `matchRoutineShellCommand` 的**同一先例**：ruleId 缺省时用同一 `matchReadonlyGit` 引用按 argv 兜底并补 ruleId。未新增第二份 matcher/判定；ruleId 有值时不覆盖（仅前缀命中才记录）。
2. **repo-local alias 防线**：`executeReadonlyGit`/`executeGit` 的 `inspectGitRepository` 对 `.git/config` 采用允许清单（仅 core/extensions），含 `[alias]` 的仓库在**执行前** `git-config-section-unsupported` fail-closed——比「内建子命令优先」更强；设计要求的 alias 确定性测试按此实现并如实记录（内建行为 + 固定 env 静态断言）。
3. **测试夹具**：受保护正向场景的 `required` 保护事实用「制造合法证据观测一次 → 进程内 `everRequired` 粘滞 → 移除 `.ans`」构造，避免 `.ans/trunk` 残缺影响角色/边界解析（测试专用，不改变生产语义）。
4. **能力面 roleId**：官方工厂的 `roleId` 仍由 Service 按 `role.id` 注入工具 options（W4-R 已接线，`RuntimeSessionOptions` Omit 调用方 `roleId`）；本批把 `roleId` 加入 `AdapterCapabilities` 仅供自定义工厂/审计展示关联，不采用调用方伪造值。

---

## 8. 偏差声明

**I0 偏差 = 0；设计 P1.3 写集内语义全部落地**。无写集外文件改动；无阻塞。

---

## 9. 跨角色待办（不属本写集，均未执行）

1. **桌面（W5-D/W5-U）**：桌面注入点确认——`app/desktop/session.ts` 经同一 `createRuntimeAdapterFactory`/`openRoleSession` 透传 `readonlyGit` 与 `roleId`（本批工厂/选项路径已就绪；桌面需确认装配入口确实走该工厂并在受保护范围传 `auditFailurePolicy` 的等价保护判断）；审批卡展示 `entry`（前台/后台）与可选 `protectedScope`（W5-U 条件参与）。
2. **测试（D1/E3/RR）**：跨角色集成——真实 `assemble*` 装配 gate（file sink `probe` 含一次 refresh）与 W2-R 准入闭环；`readonlyGit.canonicalArgv` 与实际执行体对照（AC-6）；writeGuard 注入断言（AC-14/AC-30）与 `start_background_task` Git 拒绝（AC-22）；真实运行 AC-23/AC-24（RR）与全量 T3（E3）、`test/测试/lightweight-permission-repairs.test.ts` POSIX 段复核。
3. **W2-R 临时夹具对齐**：W2 证据 §8 声明的 `registerShellApproval` 临时夹具可在 D1 与本批真实装配路径对齐复核（不改变断言口径）。
4. **已识别的生产集成缺口（供 D1/E3 判定）**：生产桌面 `buildDesktopShellArming` 注入的 `classifyShell` 只回裸串；本批已用 matcher 兜底补齐 `by` 前缀与 `readonlyGit`。若后续装配改为注入 detailed classifier，本批行为不变（ruleId 有值时直接消费）。
5. **验收提醒**：`auditFailurePolicy:"deny-non-readonly"` 的受保护启用依赖 `run-role` 的 `roleCapabilityProtection.state`（每次开会话重读）；桌面若绕过 `openRoleSession` 直接 `createShellGate` 需自行传该策略（fail-closed 责任在装配方）。

---

## 10. 限制（如实）

- 本批只做**受影响套件**（`test/编排`）实施前后对照；全量 T3 回归由 D1/E3 按团队计划执行，不在本批范围。
- 未运行真实模型、未启动桌面应用；AC-23/AC-24 的真实运行证据不属于本批。
- 证据边界：审批链登记只证明「当前进程内该 gate 由 `createShellGate` 构造且审计探针当时放行」；不证明 native 效果闭包、不覆盖其它进程或绕过（与 PR #72 `current-process-only` 同一诚实口径）。
- `executeReadonlyGit` 的「不接受任意 argv」以 matcher 受限描述为契约（结构校验拒绝形状不合法的对象）；恶意宿主代码直接构造伪造对象不在威胁模型内（宿主已拥有本机执行权），与 I0-4/设计证据边界一致。

---

## 11. 结论

W1b+W2b+W3b 的本角色写集实现、测试与证据完成：审批链在 `createShellGate` 构造成功后唯一登记（四档 mode/审计 describe 投影、测试私有 Symbol 仅测试模拟）；file sink 审计探针与 append 同一 F-6-1 语义（含一次 refresh 重试）；`auditFailurePolicy` 受保护启用时审批类放行 + 审计失败 fail-closed（只读 c-allow 不翻转）；只读 Git 审计字段 `readonlyGit.canonicalArgv` 与 `by` 前缀口径落地（同一 matcher/规范体引用）；旧创建门退役并加防御断言；只读 Git 固定传输 `executeReadonlyGit`（绝对可执行/固定 config+env/预算/不接受任意 argv）经 trunk 公共出口导出并注入运行时适配器能力面。受影响套件实施前后失败集合同名同数（新增确定性失败 0、新 skip 0），typecheck 绿，I0 偏差 0。未 commit/push/merge/发布，未判验收。

---

## 12. Amendment-1（W5-D 只读核对补线，2026-11-08）

### 12.1 缺口（W5-D 桌面窗口只读核对发现）

`src/common/编排/shell-gate.ts` 的 `runA` 构造 `OperatorPrompt` 时未拷贝 `req.entry`/`req.roleId`——桌面审批卡收不到审核入口（前台/后台；`roleId` 现靠 metadata 兜底）。P1.3 §2.5.2 明确 `OperatorPrompt.entry?/roleId?` 为卡面展示加法字段。

### 12.2 修订内容（仅本角色写集）

- `src/common/编排/shell-gate.ts` `runA` 的 prompt 加法透传（**只拷贝、不默认；不参与判定**）：
  `...(req.entry !== undefined ? { entry: req.entry } : {})`、
  `...(req.roleId !== undefined ? { roleId: req.roleId } : {})`。
- `test/编排/shell-approval-wiring.test.ts` 新增 1 例「OperatorPrompt 透传」：审批档路径捕获 operator channel 收到的 prompt，断言 `entry:"start_background_task"`、`roleId:"product"` 原样携带；缺省请求不默认 entry/roleId；既有断言未改动、未放宽。
- **protectedScope 处置**：O7（审批卡「受保护项目」标识）为设计 §7.2 **选装项**、闸门 1 未选择实施；本批**不新增** `CreateShellGateOptions.protectedScope` 生产者（避免未授权实现选装项），如实记录：「`protectedScope` 当前无生产者，O7 默认不做」。`OperatorPrompt.protectedScope` 类型字段（W2-R 加法）保留未用。
- I0 偏差仍为 **0**（本修订只补 §2.5.2 的展示字段透传，不改变任何判定/审计/权限语义）。

### 12.3 修订后哈希与计数（写盘后复算）

| 文件 | 行数 / 字节 | SHA-256 |
| --- | --- | --- |
| `src/common/编排/shell-gate.ts` | 1630 / 95206 | `b64b83e3f7c38504e466e38bd8280e37c67857b9bbca443f5ae8dd63ef58c14e` |
| `test/编排/shell-approval-wiring.test.ts`（7 例） | 400 / 19473 | `d14d068305ef6286ad0bf90834c6d0023553186a49986ac78f23b7dfa1911f5b` |

- 受影响测试（修订后）：`node --test test/编排/shell-gate.test.ts test/编排/shell-approval-wiring.test.ts test/编排/readonly-git-transport.test.ts test/编排/shell-write-guard-injection.test.ts test/编排/run-role-admission.test.ts` → **53 / 53 pass / 0 fail / 0 skip**（shell-gate 35 + approval-wiring 7 + transport 5 + write-guard 3 + admission 3）。
- 编排套件（修订后复跑）：**1093 tests / 1069 pass / 22 fail / 2 skip**；失败集合与实施前逐条 diff **为空**（FAIL-SET-IDENTICAL；新增确定性失败 0、新 skip 0）。
- `npm run typecheck`：退出码 **0**，无诊断输出。

