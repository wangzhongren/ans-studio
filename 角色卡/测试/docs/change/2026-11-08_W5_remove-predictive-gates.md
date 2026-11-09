# W5 实施证据：删除全部预知式门控（测试 · 跨角色集成与 Q16 取代改写）

- 任务：`2026-11-08-remove-predictive-gates` / 批次 **W5**（派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §四）。
- 角色：测试（`roleId: 测试`，`角色卡/测试/boundary.md` Section 1 写集；独立实施上下文）。
- 实施基准：方案 **P1.4** `docs/planning/2026-11-08_design_git-write-init-approval-based.md`（§4.5 测试同步、§3.3/§3.4.3/§3.7/§3.8、§4.2/Q16、§5 AC、§6.1）；B1 v1 `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（AC-1–AC-24、P1.2-AC-25–31、B1-EV1–EV5、判定规则）；I0 冻结（派发记录 §三，含 I0-1–I0-12）。
- 只读输入：W1/W2/W3a/W3b/W4 各批证据（`角色卡/运行时核心/docs/change/2026-11-08_W1_*`、`角色卡/编排/docs/change/2026-11-08_W2_*`、`2026-11-08_W3a_*`、`2026-11-08_W3b_*`、`角色卡/桌面窗口/docs/change/2026-11-08_W4_*`）。
- 日期：2026-11-08。状态：**已实施、已跑实施前后对照与 typecheck；未 commit / 未 push / 未 stash / 未 merge / 未发布**。
- 证据目录：`角色卡/测试/docs/change/2026-11-08_W5_evidence/`（原始日志、逐文件 TSV、失败/skip 名单、解析脚本、诊断探针）。

## 1. 基线

| 项 | 实测 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 / HEAD | `feat/plan-escalation-card` / `3f249e2fee1753531d6b566eefc7a64016e863a7` |
| 起始工作树 | 含 W1/W2/W3a/W3b/W4 未提交改动（同一候选，本批只读消费，未回退/改动） |
| 产品哈希核对 | `trunk-runtime.ts`=`ce80e162…`（W3b final）、`git-command.ts`=`47819a19…`（W3b I0-12）、`session.ts`=`51c9a56e…`（W1）、`model/runtime.ts`=`b4164765…`（W1）、`run-role.ts`=`53459ba4…`（W2）、`apply-journal.ts`=`5d9b1888…`（W2）、`desktop/session.ts`=`0132cd4e…`（W4）、`public/trunk-store.ts`=`abf08fc8…`（W3a）——与各批证据逐字一致 |
| 参照基线（只读） | 第一变更 E3 T3 组合 4,982 / 4,753 pass / 196 fail / 1 cancelled / 32 skip（派发记录 §一）；本批只对 **`test/测试/**` 受影响套件**做逐文件前后对照 |
| 环境 | Windows 11 Pro 10.0.26300；Node v24.22.1；Git Bash；逐文件独立进程 `timeout -k 5 <TO> node --test --test-concurrency=1 <file>`；登记挂起 `customer-authorization-plane-integration.test.ts` 90s watchdog，其余 300s；**未使用 `--test-force-exit`/`--test-timeout`** |

## 2. 改动文件与逐文件 SHA-256（前 → 后）

（实施后最终哈希见 §7 复核命令输出；本节以最终工作树字节为准。）

| 文件 | 类型 | 前（HEAD `3f249e2` / 工作树起始） | 后（最终工作树） |
| --- | --- | --- | --- |
| `test/测试/session-admission-approval-q9-integration.test.ts` | 改写（Q16） | `1b2441f2148450863f948dda394574793f4f68131f368dc3731c056dc11e10a5` | `3b3e3448a68d95813b94325f956e0241b3ef65b862e209fe808d2bc463cfa352` |
| `test/测试/runtime-dispatch-gate-integration.test.ts` | 改写（N15 源码断言） | `5433911a0d02130e2c659ef45abd47a15acf623bcf1137cc6894a918ad63467a` | `3abfff69fafdbf663ee8df47372977d055fa90d14652307a8b54690ffc3cf3c8` |
| `test/测试/git-role-workflows-e2e.test.ts` | 改写（测试模型/e2e 评估） | `55e508870d76fb0b7d916bf67e466a4920c95e8603a7a8ee09641c148f47f3ea` | `27bbb12f4c573b64c1dff6d7ca8d9376df0d5301a11a2bc0c2ff251f7665efa5` |
| `test/测试/git-action-cross-runtime-fixture.ts` | 新增（夹具） | —（新增） | `4ef13f1c6e3880ed8720e05ba086e84464db8c867db3bc319992be2613ac749d` |
| `test/测试/git-action-cross-runtime-init.test.ts` | 新增 | —（新增） | `f00e2c6855f1467ac3512cf8481ad69ff7cb0d5c362b14b9ba4a4dbc2621efb0` |
| `test/测试/git-action-cross-runtime-pi-init.test.ts` | 新增 | —（新增） | `5f06cff89e6b6c6636dc6d449ec60064e061fc9d7b7f0d48d3fe47beac35c2f8` |
| `test/测试/git-action-cross-runtime-codex-init.test.ts` | 新增 | —（新增） | `9e3e21cd6dd2408c10898191ed0e0c08592addeb802848bf77ced0979b52af04` |
| `test/测试/git-action-cross-runtime-audit-failure.test.ts` | 新增 | —（新增） | `df498cfd1eccaab8489d401f01d23a2cb50d30da6385ac6d302c57b9e8b1eb53` |
| `test/测试/run-stop-host-continuation-integration.test.ts` | 新增 | —（新增） | `dd0fc949b3948fa35c2831dcbbe8b10e9df02de2f46641b65dc3f0cc343a91c1` |

> 前置换算：`git show HEAD:<file> | sha256sum`（三份既有测试在 HEAD 与工作树起始均未修改）；后置：`sha256sum <file>`。未改动 `src/`、`app/`、`test/编排/`、`test/runtime-core/`、`test/桌面应用/`、`docs/`、角色边界/YAML、其它角色目录。

## 3. 断言改写逐条清单（契约变更，禁止静默删除/放宽）

### 3.1 `test/测试/session-admission-approval-q9-integration.test.ts` —— Q16 取代（`P1.3-B1-AC-26` / B1-EV3 不再成立）

- **before（旧断言，实施前基线红）**：标题「D1-Q9 AC-26：受保护 + 真实 shell 会话（Codex）+ git_candidate init ⇒ 既有初始化保护拒绝、零副作用」；fixture 以 chief/convener 两个真实 Codex 会话（convener arm shell，strict surface `unknown`）+ 真实 host inventory + 真实 trunk 源，直接调用 `createGitRoleRuntime().gitCandidate(init)`；断言
  `result.status === "blocked"` 且 `result.code === "git-native-surface-unproven"`（注释：`inspectInitializationProtection` 注册表级要求，AC-26 允许的两个既有码之一），并断言 `.git`/操作目录/refs 零副作用。
- **after（新契约断言，绿）**：
  1. 同一进程内**真实 Codex 会话**（chief 无 shell、convener 带 shell/审批链）保持 live，strict `toolSurface.status === "unknown"`（作为**证据**如实存在）；
  2. actor 为真实 Core 回合中的 `git_candidate`（active tool），受保护 + 真实 init 源/inventory；
  3. **负例（真实身份原因）**：inventory 记录的 `taskId` 与动作 `taskId` 不符 ⇒ `git-actor-core-binding-unproven`；无 `.git`、无操作目录、无 sidecar；
  4. **正向**：同一进程内存在真实 shell/active Codex 会话时 `git_candidate init` **成功**（`status === "prepared"`）；`init.json`（`candidate-created`）与 `.git` 真实存在；sidecar `authorization.jsonl` 一行（`template:"init"`、`policyInputDigests:{init,candidate}` 双 64-hex、actor/task、无 `applicationMediation`）；
  5. 退役/旧码（`git-core-creation-proof-unavailable`、`git-native-surface-unproven`、`git-unclosed-effect-registered`、`official-pure-preparation-unproven`、`native-factory-plan-unavailable`）在正向回执 JSON 中**零命中**（`includes === false`）。
- **理由**：Q16——本变更 B1 取代第一变更 B1 v1 的 `P1.3-B1-AC-26` 与 B1-EV3「`native-factory-plan-unavailable` 仅 codex」；P1.4 §3.2 B8–B10 删除注册表级预知前提、§3.3 改为动作时授权。旧断言代表被取代的契约，不能保留；改写后的负例确保「init 的拒绝只来自真实身份/ACL/策略/根/租约等合法原因」。
- **红→绿**：实施前该用例 fail——实测 `result.code` 为 `git-actor-core-binding-unproven`（「The action source Core instance is not this role/project's actual active tool invocation」，即新门在动作时身份层拒绝；旧注册表级码 `git-native-surface-unproven` 已不产生，证明旧断言前提被取代）；实施后 pass（原始日志 `before-logs/…q9…log`、`after-logs/…q9…log`）。

### 3.2 `test/测试/runtime-dispatch-gate-integration.test.ts` —— N15 写门源码断言改写

- **before**：定位 `async function inspectInitializationProtection`；断言段内含 `surface.status !== "observed"`、`surface.nativeToolRegistry !== "application-mediated"`；零 `applicationMediation`。
- **after**：定位 `export async function inspectGitActionAuthorization`（旧名溯源注释存在，I0-8）；断言门段**不含** 4 条预知前提（strict observed / application-mediated 注册表 / native factoryPlan / closedTools 作为门）与 3 个退役码；断言新条件存在：`git-core-in-flight-unproven`（H13）、`git-core-inspection-unavailable`（H14）、`isRuntimeSessionDrained(lifecycle)`（H11）、`optionalEvidence`、`authorizationMode`（I0-4）；`closedTools` 仅作 `unknownTools` 证据快照；门段零 `applicationMediation`（PR #72 零引用保持）。
- 文件其余部分（P1-D 包装层组合/派发父门/N17/N19/P5、trunk-runtime 判定实现唯一来源守卫、`applicationMediation` 零引用）**逐字保留**。
- **理由**：P1.4 §3.2 B8–B10 删除、§3.3 H11/H13/H14、I0-8 改名；PR #72 契约不变（AC-18）。
- **红→绿**：实施前 fail（旧符号不存在）；实施后 pass（10/10）。

### 3.3 `test/测试/git-role-workflows-e2e.test.ts` —— 测试模型逻辑（e2e 评估）

- **before（`:382-386` 区，脚本模型）**：worker 首轮模型在 native/strict surface 不满足（`factoryProvenance !== "default-production"`、缺 `native`、`native.factory !== "codex-chat"`、native builtin、foreign MCP）时记录 `worker-surface-blocked` 并拒绝发射任何工具调用（旧 strict-surface 契约的测试模型镜像）；`:2184/:2190` 等待/断言该阻塞阶段从未出现。
- **after**：
  1. worker 按真实 ACL/任务绑定**直接调用**结构化工具（`write_file`/`git_query`/`git_candidate`）；surface/native 事实改记 `worker-surface-evidence`（仅证据，不再决定是否 emit 调用）；
  2. `:2184` 等待集合移除 `worker-surface-blocked`；`:2190` 断言改为「证据阶段存在且 `raw`（原始 shell 工具名）为空」（`Q14_WORKER_SURFACE_EVIDENCE_MISSING` / `Q14_WORKER_RAW_SHELL_SURFACE_EXPOSED`）——保留 N7「裸 Git 写仍硬拒/结构化写路径不暴露原始 shell」的事实观察，不再是动作门；
  3. `:1262-1265` 区（Q2 CodexChat 真实 surface 字段）**断言未改**，仅加注：这些 strict/native 字段是**证据生产**事实（PR #72 不变），不是 Git 动作门前提（P1.4 §3.5/§4.2）。
- **理由**：P1.4 §4.5「若测试模型逻辑代表旧 strict-surface 契约，改为按 ACL/任务调用；native 仅证据」。本环境该阻塞分支在基线中未触发（断言要求其缺席），改写后行为等价且语义对齐新契约。
- **计数**：文件 tests/skip 集合不变（19 tests：7 pass + 12 skip，与基线一致；见 §5）。

## 4. 新增用例表（`test/测试/`）

| 文件 | 用例 | 覆盖 |
| --- | --- | --- |
| `git-action-cross-runtime-init.test.ts` | ① P1.2-AC-27 Codex 创建期对照（responses ⇒ plan 省略 native 仍发 token；chat/off ⇒ plan 记录可选强证明；撤销后 H13 豁免） | P1.2-AC-27 创建侧（W1 同源补充） |
| 同上 | ② AC-1/AC-6/AC-7/P1.2-AC-28 Claude actor：多 active 会话（Pi product、Claude verifier、Claude judge）+ foreign MCP ⇒ init 通过；sidecar 两键 digest/actor/task/turn/leaseId/optionalEvidence；foreign MCP 只进 optionalEvidence | AC-1/AC-6/AC-7/AC-28；F8 |
| `git-action-cross-runtime-pi-init.test.ts` | Pi actor init 动作时授权通过；sidecar 两键；native 缺失不成为授权输入 | AC-2/AC-7 |
| `git-action-cross-runtime-codex-init.test.ts` | Codex actor（native 不可用桩件）init 通过；optionalEvidence 无 nativeStatus | P1.2-AC-27 动作侧 |
| `git-action-cross-runtime-audit-failure.test.ts` | AC-16 集成失败注入：`authorization.jsonl` 位置目录占位 ⇒ `git-action-audit-unavailable`；无 `.git`/`init.json`；阻断位置未被覆盖 | AC-16（write-ahead 失败即不执行） |
| `run-stop-host-continuation-integration.test.ts` | ① host-continuation：真实 rapporteur 回合结束并 dispose（disposed+drain）⇒ gate ok；taskId 不符/唯一性/turn 漂移 ⇒ `git-actor-core-binding-unproven`；无准备 plan 的 `finalizeRunChange` ⇒ `run-preparation-invalid`（边界） | P1.2-AC-25/29（授权分支） |
| 同上 | ② drain 谓词集成：Claude/Pi 形态（status/processCoverage unknown、native absent）drained；非 idle Pi/handler/mcp/read-failure/cleanup/未知 reason 阻断；native 有无不改变判定 | B1-EV3/AC-8/AC-20 终止侧 |
| 同上 | ③ run-stop/controller-stop 源码结构守卫：成员不再要求 codex/native；finalize 用 drain；native absent 允许/present-but-changed 拒绝；host fence 码保留；gate 先于 host lease；不写 sidecar；`apply-journal` C5 drain 且 `run-stop-unverified` 保留 | AC-8/AC-20（W2/W4 同构复核） |

> 夹具 `git-action-cross-runtime-fixture.ts`：真实 Core 包装层 + 桩件 provider（demo 脚本执行真实工具回合，无真实模型/SDK 请求）+ 真实 host inventory/trunk 存储/init 源；每测试文件单一项目根（H12 文件守卫要求全部 active 条目覆盖当前 `.git` 根，custom provider 会话按 I0-3 不能 drained 收口 ⇒ 会话保持 active 到进程结束）。

## 5. 命令与原始结果

### 5.1 实施前（`test/测试/**`，逐文件独立进程）

- 文件清单 `test-file-list.txt`（102 个既有 `*.test.ts`）；结果 `before-results.tsv`，日志 `before-logs/`；失败/skip 名单 `before-failures.txt` / `before-skips.txt`。
- 汇总（102 文件）：**tests 675 / pass 614 / fail 42 / cancelled 1 / skipped 18 / todo 0**；1 个登记挂起文件（`customer-authorization-plane-integration.test.ts`，90s watchdog）；其余均自然退出；总墙钟 ≈406s。
- 既有红 43 条（含 1 cancelled）；其中 2 条为 **W2 契约变更导致的预期红**（W5 改写对象）：`runtime-dispatch-gate-integration.test.ts`（N15 旧符号定位）与 `session-admission-approval-q9-integration.test.ts`（退役码 `git-native-surface-unproven`）；其余 41 条为既有环境性/跨变更红（逐条名单见 `before-failures.txt`，例：abort-cleanup 2、real-entry 5、version-change 9、t1-pipeline 3、t1-real-cli 3、trunk-stable 2、wiring 1、g4*/g5* 既有红、`customer-authorization-plane-integration` 登记挂起、`turn-watch b-last-resort` cancelled 等）。

### 5.2 实施后（同一口径；含新增 5 个测试文件 = 107 文件）

- 结果 `after-results.tsv`，日志 `after-logs/`；失败/skip 名单 `after-failures.txt` / `after-skips.txt`；对照输出 `after-analysis.txt`。
- 汇总（107 文件）：**tests 682 / pass 624 / fail 39 / cancelled 1 / skipped 18 / todo 0**；1 个登记挂起文件（`customer-authorization-plane-integration.test.ts`，90s watchdog，与基线一致）；其余自然退出。
  - 102 个既有文件子集：674 tests / 616 pass / 39 fail / 1 cancelled / 18 skip；5 个新增文件：**8 tests / 8 pass / 0 fail / 0 skip**（逐文件：cross-runtime-audit-failure 1/1、cross-runtime-codex-init 1/1、cross-runtime-init 2/2、cross-runtime-pi-init 1/1、run-stop-host-continuation 3/3）。
- **逐文件计数对照（102 个既有文件）**：99 个文件计数完全一致；3 个差异全部为预期/非确定性：
  1. `session-admission-approval-q9-integration.test.ts`：1 fail → 1 pass（Q16 取代改写，§3.1）；
  2. `runtime-dispatch-gate-integration.test.ts`：10 tests 9 pass/1 fail → 10/10（N15 源码断言改写，§3.2）；
  3. `g5-reasoning-verify/c-claude.test.ts`：基线为 Node v24.22.1 native runner 崩溃 `Check failed: node->IsInUse()`（6/6 断言已通过、进程崩溃；同类非确定性已在 W1/W3a/参照 E3 登记），实施后 6/6 自然通过。
- **失败/skip 逐条 diff（文件+测试名）**：**新增失败 = 0**；**新 skip = 0**；skip 名单 18 条逐条一致；消失失败 3 条（即上述 3 个文件差异，均非新增断言变化）。
- 新增用例：5 文件 8 用例全部 pass（见 §4 表）。

### 5.3 PR #72 回归（只读复跑）

- `test/gates/api-contract.test.ts` 3/3、`differential-trunk-runtime.test.ts` 2/2、`dispatch-parent.test.ts` 19/19、`module-graph.test.ts` 5/5、`test/编排/trunk-dispatch-parent.test.ts` 19/19、`test/runtime-core/application-mediation.test.ts` 8/8 —— 全部 EXIT 0（日志 `pr72-regression.log`）。

### 5.4 typecheck

- `npm run typecheck`：**exit 0**（`typecheck-final.log`）。

## 6. 覆盖边界（如实，非偏差）

1. **跨角色完整 commit/delivery 效果链未在本批构造**（W3b §7.2 同一边界）：`git_candidate commit` 需 pinned run/冻结角色证据/模块任务/写作用域/process source 完整链；本批以三运行时 **init**（设计明确允许「init 按流程」）证明动作时授权/sidecar/两键 digest/optionalEvidence 与 Codex native 缺失不阻断；commit 路径的调用点顺序/digest 映射由 W3b 源码守卫覆盖，B1 AC-1 的 commit 成功证据待真实运行（RR）。
2. **完整 deferred run-stop 提交链未构造**（`prepareRunChange → resumeDeferredRunChanges → executeOwnedRunStop → finalizeRunChange` 的 pinned run + host stop fence + run transition journal）：本批做 host-continuation 授权分支正/负例（真实 disposed+drain rapporteur）+ drain 谓词 + 源码结构守卫；W2 gate 级、W4 桌面级与 B1 AC-8 真实运行另行覆盖。
3. **Codex native observed 的真实绑定/动作**未重复真实 SDK 路径：创建期 observed 对照（plan 记录可选强证明）与动作侧 native 不可用路径已由本批覆盖；真实默认 Codex 会话的 observed 绑定由 W1 `test/runtime-core/codex-native-optional.test.ts` 覆盖；B1 §6.2 只要求真实 Claude 运行。
4. **`unknownTools`（未命中 closedTools 的工具名）在确定性桩件下不可产生**（Core 包装层 appTools = 受治理工具集）；F8 以真实 foreign MCP（`docs/mcp` 声明）证明「只进 optionalEvidence、不判定、不宣称阻断」；unknown 工具分支由 W2 gate 测试的代码路径覆盖，本批如实披露。
5. 真实模型/Electron/CDP 未运行（B1 §6.2 真实运行为独立节点；本批为确定性集成）。

## 7. 偏差与未提交声明

- **对照 P1.4/I0/B1：实现偏差 = 0**；未改产品源码、`test/编排/`、`test/runtime-core/`、`test/桌面应用/`、`docs/`、角色边界/YAML、其它角色目录；未删除测试/放宽断言/加 skip/force-exit。
- 解释性事项（供验收复核判定，非 I0 偏差）：
  1. Q16 改写后的正向 fixture 使用「真实 Codex shell 会话（证据）+ 桩件 provider 驱动的真实 Core `git_candidate` 回合」；真实模型不可在确定性测试中驱动工具回合。
  2. e2e 测试模型的「原始 shell 工具名」检查改为事实断言（不是动作门），保留 N7 观察。
  3. 新增夹具文件使用每测试文件单项目根（H12 全条目文件守卫 + custom provider 不可 drain 的既有约束）。
- **未提交声明**：未执行 `git commit` / `git push` / `git stash` / `git merge` / 发布/tag；改动仅存在于工作树。
- **最终哈希（`final-hashes.txt`，工作树字节）**：
  - `test/测试/session-admission-approval-q9-integration.test.ts` `3b3e3448a68d95813b94325f956e0241b3ef65b862e209fe808d2bc463cfa352`
  - `test/测试/runtime-dispatch-gate-integration.test.ts` `3abfff69fafdbf663ee8df47372977d055fa90d14652307a8b54690ffc3cf3c8`
  - `test/测试/git-role-workflows-e2e.test.ts` `27bbb12f4c573b64c1dff6d7ca8d9376df0d5301a11a2bc0c2ff251f7665efa5`
  - `test/测试/git-action-cross-runtime-fixture.ts` `4ef13f1c6e3880ed8720e05ba086e84464db8c867db3bc319992be2613ac749d`
  - `test/测试/git-action-cross-runtime-init.test.ts` `f00e2c6855f1467ac3512cf8481ad69ff7cb0d5c362b14b9ba4a4dbc2621efb0`
  - `test/测试/git-action-cross-runtime-pi-init.test.ts` `5f06cff89e6b6c6636dc6d449ec60064e061fc9d7b7f0d48d3fe47beac35c2f8`
  - `test/测试/git-action-cross-runtime-codex-init.test.ts` `9e3e21cd6dd2408c10898191ed0e0c08592addeb802848bf77ced0979b52af04`
  - `test/测试/git-action-cross-runtime-audit-failure.test.ts` `df498cfd1eccaab8489d401f01d23a2cb50d30da6385ac6d302c57b9e8b1eb53`
  - `test/测试/run-stop-host-continuation-integration.test.ts` `dd0fc949b3948fa35c2831dcbbe8b10e9df02de2f46641b65dc3f0cc343a91c1`

## 8. 证据文件索引（`2026-11-08_W5_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `run-w5-per-file.sh` | 逐文件自然运行 harness（登记挂起 90s；其余 300s；无 force-exit） |
| `test-file-list.txt` / `after-file-list.txt` | 实施前 102 文件 / 实施后 107 文件清单 |
| `before-results.tsv` / `after-results.tsv` | 逐文件计数（ec/killed/summary/tests/pass/fail/cancelled/skipped/todo/duration/wall） |
| `before-logs/` / `after-logs/` | 逐文件原始输出 |
| `before-failures.txt` / `after-failures.txt` / `before-skips.txt` / `after-skips.txt` | 失败（文件+测试名）/skip 名单 |
| `parse-results.py` | 失败/skip 名解析（node 末段 `✖ failing tests:` 口径） |
| `pr72-regression.log` | PR #72 全套回归原始输出 |
| `typecheck-final.log` | `npm run typecheck`（exit 0） |
| `e2e-after-edit.log` | e2e 改写后的定向运行原始输出 |
| `probe-surface.mjs` / `probe-gate.mjs` | 诊断探针（surface 组成 / gate 通过性；仅证据，不入候选） |
