# 变更记录：flow_step_update 的 artifact.observed 时序修复（方案 A，T2）

- 日期：2026-10-23
- 角色：编排（Orchestration worker，独立子代理上下文）
- 状态：**implemented-unverified**（已实施；定向测试与 typecheck 通过；未独立复跑、未独立验收、未 commit/push）
- 风险档位：**T2**（客户闸门 1 授权；只改 `flow-service.ts` 与其测试）
- 目标版本：v1.7.0（独立小变更，不与角色根文档展示、i18n、目录 v3、治理写卡门禁、验收返工路由合并验收）

## 一、依据

| 文档 | 版本/哈希 | 用途 |
| --- | --- | --- |
| `docs/communication/2026-10-23_intent_artifact-observation-race.md` | 2026-10-23 | 闸门 0 已确认；闸门 1 实施授权（客户原话「确认 Q1–Q5 A；按方案 A 实施，只改 flow-service 与 flow-service 测试。」） |
| `docs/planning/2026-10-23_design_artifact-observation-race.md` | 方案 v1，282 行；SHA-256 `d464fb70d7022daad61f7837f1c6cd3b7ce478cbafca55a79fb747e3b85de2c1`（实施前复核一致） | §4 方案 A、§5 不变量、§6 测试矩阵 A1–A13、§10 Q1–Q5 A |

## 二、实现摘要（方案 A）

`flow_step_update(status=done)` 对账账本前，若目标步骤 `kind: artifact`、证据 `kind: artifact` 且账本**没有**同路径的 `artifact.observed`，由应用按既有观察安全规则对**该单个 ref** 做一次观测，追加 `artifact.observed` 后重新对账；仍以 `validateFlowEvidence` 裁决是否写 flow。

关键约束与实现方式：

1. **不嵌套串行队列**：`update` 已在 per-project `serialize` 队列内，补观测 helper **不调用** `observeFlowArtifacts`/`serialize`；只调用 `appendGovernanceLedger` 自带的 append 串行链（锁方向「flow serialize → ledger append」，无反向等待）。
2. **复用而非复制安全规则**：从 `observeFlowArtifacts` 批量循环抽取模块私有 `inspectObservableArtifact`（`observeRelPath` 路径规则 → `lstat` 常规文件且非符号链接 → ≤2MiB → 读取 → `looksBinaryObserve` NUL 探测 → sha256）；批量循环改为调用它，**不改变**批量观察的幂等键（`path\0sha256`）、skipped reason、path 展示与返回形状。
3. **补观测判据**：账本已有同 path（`flowId` 缺省或相等）的 `artifact.observed` ⇒ `already-observed`（不读文件、不追加）；只追加将来能被 `validateFlowEvidence` 匹配的记录（`normalizeRelPath(ref) === rel`，不可对账的 ref 不落账）；同 path+sha 幂等。
4. **追加条目形状**：`artifact.observed{actorRoleId: step.owner, power: artifactPowerOf(step.owner), artifactPath, artifactSha256, flowId}`；**不写** `stepId`/`customer.decision`；不新增账本字段/枚举/权限/角色工具。
5. **fail-closed**：缺失/符号链接/非普通文件/项目外/`.ans`/`角色卡`/`.git`/`node_modules`/超大/二进制/ref 不可对账 ⇒ 保持 `insufficient-evidence`（不写 flow、零新 observation、不伪造 done）；账本追加失败 ⇒ 既有 `ledger-write-failed`（不写 flow）。
6. **错误文案**：`issues` 形状不变（仍为 `steps[i].evidence: …` 字符串列表）；仅在 `error` 追加「无法安全补观测（reason）」。
7. **不改**：`flow-state.ts`、`validateFlowEvidence`、`observeFlowArtifacts` 批量行为、`run-role.ts`、Provider/renderer/preload、公共出口、角色/边界/权限；不写目标项目。

## 三、改动清单（产品/测试写集恰好两文件）

### 3.1 `src/common/编排/flow-service.ts`

- `update` 的 `done` 分支：账本读取且无坏行后、`validateFlowEvidence` 之前，新增单 ref 补观测调用（`ensureArtifactObserved`）；成功把条目加入本地 `entries` 视图再对账；`append-failed` 直接返回 `ledger-write-failed`；`skipped` 只设置 error 提示。成功时记内部诊断 `flow.artifact.observed-on-done`（不新增客户可见状态）。
- 新增模块私有符号（不导出）：
  - `type ObservableArtifactInspection`；
  - `async function inspectObservableArtifact(projectRoot, ref)`；
  - `function normalizeObservedRelPath(value)`（镜像 `flow-state.ts::normalizeRelPath` 两行归一化，不 trim）；
  - `type EnsureArtifactObservedResult`；
  - `async function ensureArtifactObserved({projectRoot, flowId, step, ref, entries})`。
- `observeFlowArtifacts` 批量循环改为复用 `inspectObservableArtifact`（逐条保持原 skipped reason、`path-invalid` 用原 ref / 其余用 rel、幂等键与返回形状不变）。

### 3.2 `test/编排/flow-service.test.ts`

- 扩展既有「artifact 证据：delivered→done 需账本 artifact.observed 对账」用例（A2）：已有 observation 时账本恰一条、不重复追加。
- 新增 A1–A13 定向用例（既有断言全部保留、未弱化）。

## 四、测试矩阵（方案 v1 §6.1 A1–A13）

| ID | 覆盖点 | 对应用例 | 结果 |
| --- | --- | --- | --- |
| A1 | 文件存在、账本无 observation ⇒ done + 恰一条 observation（owner/power/sha/flowId，无 stepId/customer.decision） | `A1（2026-10-23）done 补观测…` | pass |
| A2 | 已有同 path observation（无 sha / 不同 sha，文件缺失或内容不同）⇒ 不重复、不读文件；扩展既有用例 | `artifact 证据：delivered→done…`（扩展）+ `A2（2026-10-23）幂等…` | pass |
| A3 | 并发 `observeFlowArtifacts` + done ⇒ 不死锁、最终恰一条同 path+sha | `A3（2026-10-23）并发…` | pass |
| A4 | 文件缺失 ⇒ `insufficient-evidence`、flow 不变、零新 observation、error 带原因、issues 形状不变 | `A4（2026-10-23）文件缺失…` | pass |
| A5 | 符号链接（项目内/外）⇒ fail-closed；本机无创建权限 ⇒ skip 并记录 | `A5b（2026-10-23）符号链接…` | **skip**（平台权限） |
| A5（补强） | 非普通文件（目录）⇒ fail-closed（覆盖 `!isFile()` 分支，本机稳定可跑） | `A5（2026-10-23）非普通文件（目录）…` | pass |
| A6 | 排除段 `.ans/`、`角色卡/`、`.git/`、`node_modules/` ⇒ `insufficient-evidence`、零新 observation | `A6（2026-10-23）排除段…` | pass |
| A7 | 2 MiB + 1 B ⇒ `insufficient-evidence`、零新 observation | `A7（2026-10-23）超过 2 MiB…` | pass |
| A8 | 非图片扩展含 NUL ⇒ `insufficient-evidence`、零新 observation | `A8（2026-10-23）…二进制…` | pass |
| A9 | 账本只读 append 失败 ⇒ `ledger-write-failed`、flow 不变；恢复重试成功且恰一条 | `A9（2026-10-23）账本只读…` | pass |
| A10 | 补观测成功但 flow 写失败 ⇒ `write-failed`；重试成功且不重复追加 | `A10（2026-10-23）…flow 写失败…` | pass |
| A11 | dispatch/customer-decision/acceptance 的 done 不触发补观测、账本零新增 | `A11（2026-10-23）…` | pass |
| A12 | 既有批量观察用例不回归（`:691/:742/:809/:886` 对应用例） | 既有 `observeFlowArtifacts：…` 4 例 | pass |
| A13 | 不可对账 ref（首尾空格）⇒ `insufficient-evidence`、零新 observation；`../` 在解析阶段 `invalid-flow` | `A13（2026-10-23）不可对账 ref…` | pass |

套件汇总（原始日志见证据目录）：

| 套件 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| `test/编排/flow-service.test.ts` | 63 | 62 | 0 | 1（A5b） |
| `test/编排/flow-state.test.ts` | 53 | 53 | 0 | 0 |
| `test/runtime-core/flow-tools.test.ts` | 11 | 11 | 0 | 0 |
| `test/pi-adapter/flow-tools.test.ts` | 4 | 4 | 0 | 0 |
| `npm run typecheck` | – | – | 0 错误 | – |

## 五、哈希

| 项 | `git hash-object` | `sha256sum` | 行数 |
| --- | --- | --- | --- |
| 基线（本任务动手前）`src/common/编排/flow-service.ts` | `8d783e991b885c6d72b7e269c8e9f1a012c9be1a` | 未采集（以 blob id 锁定） | – |
| 基线（本任务动手前）`test/编排/flow-service.test.ts` | `6aa7af358bc71ad4771998eac070d98a1fdf4e56` | 未采集（以 blob id 锁定） | – |
| **候选** `src/common/编排/flow-service.ts` | `1faff2c6ba1e46875fb977aae2f998d11b9e5a96` | `43511d2afa5e24cdfedfb1709e75dec83eebfed24f5efa8b01243f88365ccc1f` | 1857 |
| **候选** `test/编排/flow-service.test.ts` | `61f04d009336b87f63025c2081e6ac75bab659e4` | `42881027a5c9eca2a0c9008e72241dfc6c5880145c19410dbb1eaaaf38313d33` | 2388 |

- 证据目录：`角色卡/编排/docs/change/2026-10-23_change_artifact-observation-race-evidence/`（`commands.md`、`baseline.txt`、`candidate-hashes.txt`、`candidate.diff`、5 份原始日志）。
- `candidate.diff` 为两文件相对 HEAD 的完整工作树差异；**本任务开始前两文件已有未提交改动**（如 `completeAcceptanceStep` 最新决定、`reopenAcceptanceStepForRework`、role-cards 等既有候选），本任务增量以 §3 的函数/用例清单与基线 blob id 定位，未改动清单外内容。
- **S1 上游快照**：本修复改变 `src/common/编排/flow-service.ts` 与 `test/编排/flow-service.test.ts`，测试角色记录的角色根文档展示 S1 上游快照（`src app test` 129 文件，`af53fea6…b9328e`）会随之变化；需由测试角色后续重新冻结。本记录只报告上述新哈希，未修改该基线记录。

## 六、约束核对

- 产品/测试写集仅上述两文件；未改 `flow-state.ts`、`validateFlowEvidence`、`observeFlowArtifacts` 批量行为、`run-role.ts`、Provider/renderer/preload、公共出口、枚举/权限/角色工具。
- 未修改角色卡、边界、项目级 `docs/`（含沟通/策划文档）、其他角色资料或目标项目 `ans-gateway`（目标零写入）。
- 未 commit、未 push、未合并、未发布；未写目标账本/flow/报告。
- 未修改角色根文档展示 S1 基线记录；仅在 §五 报告新哈希。

## 七、残余与未验证（不声称验收）

1. **未独立验证**：本记录只是实施角色的定向自测；独立测试角色复跑/复算与独立验收均未进行。
2. **A5b 符号链接用例在本机 skip**（Windows 无创建 symlink 权限）：代码路径 `!isFile() || isSymbolicLink()` 已由 A5 非普通文件（目录）用例与本机可复现的 fail-closed 断言覆盖；带符号链接的环境复跑可补齐该行证据。
3. **并发残余**（方案 §4.5 已声明）：`run-role` 的 settle 扫描不经过 flow serialize，理论上仍可能在「update 读账本」与「append」之间插入同 path+sha 的 observation ⇒ 重复审计行（append-only 可接受，门禁不读重复数）；本实现不做二次读账本去重。
4. **目标现场未修复**：`change-package-v5` 仍为 `delivered`；v1.7.0 部署后需客户/Convener 对同一 `flow_step_update(done)` 重试一次，届时应用补观测并完成。不自动补历史、不写目标。
5. **已 done 步骤不补观测**：`update` 的幂等短路行为未改（设计非目标）。
