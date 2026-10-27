---
id: flow-skeleton-handoff-acceptance
type: change
title: 意图交接自动创建流程骨架 + handoff 超时回执修复独立验收——A/B 逐项判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: verified-limited
related: [intent-flow-skeleton, intent-handoff-deadline, scaffold-first-governance]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 对 worktree lead-governance-coordination（分支 feat/scaffold-first-governance、HEAD 99bbbe2 + 未提交候选；101 文件 = 85 tracked +5318/−887 + 16 未跟踪，清单摘要 08e00f76…）按客户反馈两项修复 A1–A4/B1–B5/C1–C3 独立判定；A/B 确定性实现全部 PASS，独立探针 26/26、11/11、4/4（默认时限实测 45,023ms）；typecheck 0/0、桌面 696/696（首跑 695/696 为既有 gate 用例检查-读取时序竞争，隔离 95/95、复跑 696/696）、编排 1021/1019（1 既有 Windows symlink EPERM）/1 skip、runtime 354/347（3 既有 EPERM）/4 skip、门禁 347/346/0/1 skip、i18n 209/204/0/5、桌面UI 296/296；总体 pass（受限）——真实 Electron/真实模型 e2e 未跑、运行中应用仍旧代码、跨进程 check-then-rename 与骨架可被 flow 工具推进等残余已登记
---

# 意图交接自动创建流程骨架 + handoff 超时回执修复 独立验收

**总体判定：pass（受限）。** 客户反馈的两项修复在确定性实现面全部满足验收要求，未发现 needs-work；
本角色独立复跑的类型检查、全部套件与独立探针均通过（桌面首跑一例既有 gate 测试时序竞争已隔离并复跑，
如实保留）。受限项与残余风险见 §六：真实 Electron/真实模型端到端未跑、运行中的应用仍是旧代码、跨进程
check-then-rename 窗口、超时对账/晚到失败的固有限制，以及骨架被 flow 工具提前推进的行为面缺口。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写了自身 `docs/change/` 下的报告与证据，
未修改实现、测试、共享 i18n、其他角色文档或任何数据文件；未 commit/push；未重启/停止运行中的 ANS 应用。

## 一、标准与依据

本批是 2026-10-26 客户反馈后的两项修复，实施完成后补做独立验收；仓库中没有本批实施前由本角色固定的
设计/验收标准。为使判定可复核，本报告把交接口径固定为下表（**事后标准**，post-hoc criteria）：

**A. 意图交接时自动创建流程骨架**

| 编号 | 验收项 | 主要判据 |
| --- | --- | --- |
| A1 | 骨架形状与通用性 | 骨架 YAML 通过 `parseFlowStateYaml`；八步 id/kind/owner/dependsOn 与设计一致；全部 pending；不新增 `FlowStepKind`；不写项目角色/`delivery-*`/gate/`build-scaffold` |
| A2 | 幂等与安全 | 已存在任何文件（骨架/完整流程/非法 YAML）绝不覆盖；非法输入零落盘；原子写失败不破坏目标；同进程并发恰一 `created`；不写账本/客户决定/`.ans` |
| A3 | 桌面接线 | 交接投递前调用骨架创建；intent `flowId`/`qualityTier` 读取与回落合理；骨架失败只诊断、不阻断交接；桌面不越权写 `.ans`/账本 |
| A4 | 三态文案与不扩权 | 无 flow / 骨架 / 完整 flow 三态文案正确；骨架替换只一次、保留 contract-freeze 证据、去掉 `status: skeleton`；不扩权、不改 Section 1/能力位/内部 id；`STANDARD_WORKFLOW_PROMPT` 与门禁卡成对 |

**B. handoff 超时回执不误报**

| 编号 | 验收项 | 主要判据 |
| --- | --- | --- |
| B1 | 默认时限 | 总/阶段预算默认 45s；每阶段 = `min(stageMs, 剩余总预算)` |
| B2 | 有在途证据 ⇒ 成功 | send 超时后 `isRoleBusy(rapporteur) \|\| hasPendingDelivery(rapporteur)` ⇒ `ok:true` +「已交给策划（工作中）」+ 恰一条 `dispatch.accepted{trigger:"intent-handoff"}` + 恰一条系统行 |
| B3 | 无在途证据 ⇒ 如实失败 | 目标既不在跑也无排队 ⇒ `ok:false` + 如实系统行；打开超时 ⇒ `ok:false` |
| B4 | 晚到失败 | 不产生未捕获拒绝；不重复账本/系统行；已 ACK 的晚到失败只诊断；未 ACK 才补一条失败系统行 |
| B5 | 忙时语义不变 | 目标忙 ⇒ `sendBackground` 入队、`queued:true` 成功、不等待空闲、settle 后按序投递唯一一条 |

**C. 横切**

| 编号 | 验收项 |
| --- | --- |
| C1 | 不弱化断言；无新增 `FlowStepKind`/治理角色/权限 |
| C2 | 显示名批次与 `request_requirement_change` 批次不回归 |
| C3 | 独立复跑计数与既有 Windows EPERM/skip 基线一致（以本角色实跑为准） |

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD | `99bbbe2cda3be0fcd7c8d1e72189b6f530e8387e`（未提交候选） |
| 候选范围 | **101 文件** = 85 tracked 改动（+5318/−887）+ 16 未跟踪批次文件（排除 `.claude/`、`demos/`、本角色目录） |
| 候选清单摘要 | `08e00f764e76c2c1a6477d36b9e2ee3a173b75a114ec356b5a1761ca7d28dce5`（逐文件 sha256 清单；测试前后复核一致） |
| 本批增量 | 12 产品/测试文件（2026-10-26 23:01–23:09）+ 4 份角色 change/fix 记录；逐文件 SHA-256 见证据索引 |
| 环境 | Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；Git Bash |

说明：工作树同时叠加同日更早的未提交批次（gate 复核、decision 卡、需求变更申请、显示名）。本报告只对
A/B 作新判定；C2/C3 对其余批次只做「不回归」复核，不重新验收它们。证据索引与复跑命令见
[`2026-10-26_flow-skeleton-handoff-acceptance-evidence/00_candidate-and-commands.md`](2026-10-26_flow-skeleton-handoff-acceptance-evidence/00_candidate-and-commands.md)。

## 三、改动范围复核

### 3.1 本批增量

| 文件 | 改动 |
| --- | --- |
| `src/common/编排/flow-service.ts` | 新增 `FLOW_SKELETON_STATUS`、`buildFlowSkeletonSteps`、`EnsureFlowSkeletonInput/Result`、`ensureFlowSkeleton`（+191 行段） |
| `src/pipeline/orchestration/govern-session.ts` | 公共出口再导出骨架 API 与 `parseIntentFrontmatter`；`STANDARD_WORKFLOW_PROMPT` 新增「流程骨架与一次性替换（2026-10-26）」一句 |
| `app/desktop/session.ts` | 新增私有 `ensureIntentFlowSkeleton`；`deliverIntentHandoff` 投递前调用；总/阶段预算默认 45s；超时对账 + 晚到失败处理；`recordAcceptedDelivery` 统一两条成功路径的审计写入与账本通知 |
| `app/desktop/interface.ts` | 只读识别 `status === FLOW_SKELETON_STATUS` 并向文案传 `flowStateSkeleton`（import 常量，不复制字面量） |
| `app/desktop/governance-advance.ts` | `BuildGovernanceAdvanceMessageOptions.flowStateSkeleton` + 提案接受后 Convener 的骨架替换文案 |
| `src/common/门禁引擎/governance-roles.ts` | 只改 `CONVENER_CARD_TEXT`（三态、一次性替换、flow 工具纪律、可写目录/确认卡/declined 同步）与文件头注 |
| 测试 6 文件 | 骨架 5 例 + 提示成对 4 条 + 桌面骨架/超时 8 例 + 三态文案/磁盘骨架 2 例 + 门禁三态 1 例 + 既有断言按新口径更新 |

未发现夹带无关改动；`src/common/编排/flow-state.ts`（`FlowStepKind` 单一来源）**零 diff**；本批 12 个
产品/测试文件 `git diff --check` exit 0（无空白错误）。

### 3.2 是否弱化测试/断言

逐文件复核：**未发现弱化**。

- `flow-service.test.ts`：仅新增 5 例骨架测试（形状/不覆盖/fail-closed/写失败/并发）与 import，无删除断言。
- `governance-session.test.ts`：既有断言数组仅把显示名从旧名换为新名（产品/运营等），并新增 4 条骨架提示
  断言；无删除、无放宽。
- `session.test.ts` / `interface.test.ts`：新增骨架与超时用例，既有用例未改弱；超时用例明确断言
  「无在途证据不得谎称成功」「系统行恰一条」「账本恰一条」「零未捕获拒绝」。
- 门禁两文件：`governance-standard-workflow.test.ts` 唯一「替换」是把已过时的「写流程单（仅初始创建）」单态
  断言换成「流程骨架与完整流程（仅初始创建 / 骨架一次性替换）」并新增三态用例（同时钉住 Convener
  entries/preauthorizedDirs/capabilities 不变）；`governance-trio.test.ts` 一处 schedule-write 断言按新文案
  更新（逐字匹配）。无断言删除或放宽。
- 相关 6 个测试文件无 `skip`/`only`/`todo`（全目录 skip 均为既有平台条件）。

### 3.3 权限/角色/枚举零变化

- `FLOW_STEP_KINDS` 仍为 `dispatch / customer-decision / artifact / acceptance` 四项；本批未改
  `flow-state.ts`、`model/runtime.ts`。
- `governance-roles.ts` 相对 HEAD 的数据面差异仅 `displayName` 五处（属同日显示名批次）；本批未改
  entries / preauthorizedDirs / forbiddenWritePaths / capabilities / 内部 id；`governance-trio.test.ts` 全绿。
- 桌面只经 Pipeline 公共出口消费编排能力，未新增 IPC、cardKind、账本 kind 或角色。

## 四、独立实测

完整命令、退出码与日志见证据索引 §「复跑命令与结果」。摘要：

| 套件 | 实测 | 与交接口径 |
| --- | --- | --- |
| typecheck 根 / renderer | **0 / 0** | 一致 |
| 桌面应用全目录 | 首跑 **696 计 / 695 过 / 1 失败**；隔离复跑 **95/95**；全目录复跑 **696/696** | 首跑唯一失败为既有 gate 用例检查-读取时序竞争（见证据索引），非本批；复跑与交接口径 696/696 一致 |
| 编排全目录 | **1021 计 / 1019 过 / 1 失败 / 1 skip** | 一致；唯一红＝既有 `shell-authorized-routine.test.ts:103` Windows symlink EPERM（文件零 diff） |
| runtime-core | **354 计 / 347 过 / 3 失败 / 4 skip** | 一致；3 红均为既有 Windows symlink EPERM（`file-write-safety`、`session-store` ×2，文件零 diff） |
| 门禁引擎 | **347 计 / 346 过 / 0 失败 / 1 skip** | 一致 |
| i18n shared | **209 计 / 204 过 / 0 失败 / 5 skip** | 一致 |
| 桌面UI | **296 / 296 / 0 失败** | 一致 |
| 需求变更/decision/显示名回归焦点（8 文件） | **129 / 129** | C2 不回归 |

**独立探针（不属于产品/测试代码）**：

1. **`15_probe-skeleton`（26/26）**：直接调用 `ensureFlowSkeleton`，核对 YAML 可解析、八步
   `[id, kind, owner, status, dependsOn]` 与设计逐项一致、`status: skeleton` 且所有步骤 pending；不含
   `delivery-`/`gateKind`/`build-scaffold`；不建 `.ans`；二次调用/完整流程/非法 YAML 均不覆盖；`../evil`、
   `Flow-A`、非法 qualityTier、空 root 均拒绝且零落盘；三并发恰一 `created`；骨架→完整流程替换文本可解析
   （保留 contract-freeze 证据、去掉 `status: skeleton`、含项目角色/交付步骤/gate），`validateReleaseOnlyExtension`
   不误拦（双方均非 release）；三态文案逐项命中。
2. **`16_probe-handoff-order`（11/11）**：真实 `SessionManager` + 假句柄，rapporteur `send()` 执行时
   `docs/flows/<flowId>.yaml` **已存在**（先建骨架、后投递）；回执 `ok:true`；只投递一次；账本恰一条
   `dispatch.accepted{trigger:intent-handoff}`；桌面不写 `intent.handed-off`/`customer.decision`；`.ans` 下仅
   `governance` 审计账本、无 `project.json`；已存在的完整流程在再次交接时不被覆盖。
3. **`17_probe-handoff-deadline`（4/4）**：不注入 `handOffIntentLimits` 时，send 挂起 + 目标 settled 的超时
   回执在 **45,023ms** 返回（旧 20s 会误报）且文案「约 45s」、`ok:false`；只注入 `totalMs=400` 且不注入
   `stageMs` 时约 419ms 失败，证明阶段预算缺省 = 总预算。

## 五、逐项结论

| 项 | 结论 | 核心证据 |
| --- | --- | --- |
| **A1** 骨架形状与通用性 | **PASS** | `flow-service.ts:511/519/614`；探针 15 逐项断言八步 shape/dependsOn、`status: skeleton`、无项目角色/交付/gate；`parseFlowStateYaml` 通过；`FLOW_STEP_KINDS` 零 diff |
| **A2** 幂等与安全 | **PASS** | 探针 15 + `test/编排/flow-service.test.ts:3222-3302`：绝不覆盖（骨架/完整/非法）、非法输入零落盘、目录占用与 `docs/flows` 为普通文件时明确失败且不破坏现场、三并发恰一 `created`；探针确认仅写 `docs/flows/<flowId>.yaml`、无 `.ans`/账本/客户决定 |
| **A3** 桌面接线 | **PASS** | `app/desktop/session.ts:1974-2013`（intent 读取/回落、失败只诊断）、`:2040-2046`（投递前调用）；探针 16 证明 send 时骨架已存在、交接成功、账本只写既有 `dispatch.accepted`；`session.test.ts` 覆盖 frontmatter flowId/qualityTier、缺文件回落 `intentId`+`production`、非法 flowId 不落盘且不阻断 |
| **A4** 三态文案与不扩权 | **PASS** | `interface.ts:11251-11268`（只读识别骨架，常量不复制字面量）；`governance-advance.ts:1286-1291`（骨架/完整/无 flow 三分支）；探针 15 三态文案；`governance-session.ts:675` 与 `governance-roles.ts:844` 成对且各自有测试；注册表数据面零变化 |
| **B1** 默认时限 | **PASS** | `session.ts:2050-2063`（total 缺省 45,000ms；stage 缺省 = total；`min(stage, remaining)`）；探针 17 实测 45,023ms 与 419ms 两例 |
| **B2** 有在途证据 ⇒ 成功 | **PASS** | `session.ts:2151-2205`；`session.test.ts:2222-2285`（busy/在途 ⇒ ok:true、恰一条系统行、只投一次）与 `:2424-2503`（账本恰一条、零未捕获拒绝） |
| **B3** 无在途证据 ⇒ 如实失败 | **PASS** | `session.ts:2157-2159`；`session.test.ts:2377-2422`（目标已 settle 且无排队 ⇒ ok:false「目标会话无在途任务」、恰一条失败系统行、不重试）；打开超时 `:2171-2220` ok:false |
| **B4** 晚到失败 | **PASS** | `session.ts:2160-2188`：`.then/.catch` 自带 catch；未 ACK 才补「发送任务给策划失败」行；已 ACK 只诊断；不追加账本；`session.test.ts:2424-2503` 断言 2 条系统行、账本 1 条、`unhandled=[]` |
| **B5** 忙时语义不变 | **PASS** | `session.test.ts:2287-2331`：占位轮次忙时入队成功、settle 后按序投递唯一一条；`sendBackground` 未改队列语义 |
| **C1** 不弱化/无新增枚举/角色/权限 | **PASS** | §3.2/§3.3；相关测试无 skip/only；`flow-state.ts` 零 diff；注册表数据面仅显示名（他批）变化 |
| **C2** 显示名与需求变更批次不回归 | **PASS** | i18n 209/204/0/5、桌面UI 296/296、需求变更/decision 焦点 129/129；交接回执文案实测「已把意图…交给策划」 |
| **C3** 独立复跑计数 | **PASS** | §四；全部与交接口径一致（桌面首跑 flake 已如实记录并复跑通过） |

## 六、残余风险与未验证项

**未验证（不构成本批已知缺陷）**

1. **真实 Electron / 真实模型 e2e 未跑**：骨架创建→交接→提案接受→Convener 收到替换文案→schedule-write
   替换→flow 工具推进的完整真机链路未在真实 Electron/真实模型上执行；本批证据为真实产品代码路径 +
   假适配器/真实 `SessionManager`。
2. **运行中的 ANS 应用仍是旧代码**：本批与同日其它未提交批次均未重启生效；重启前客户看不到骨架创建与
   新超时行为。
3. **跨进程 check-then-rename**：存在性检查与 `atomicWrite` rename 之间的窗口只在同进程由 per-project
   串行队列消除；跨进程同时创建同一 flow 文件时，骨架 rename 仍可能覆盖（应用是骨架唯一写者、角色改用
   flow 工具，正常路径不触发；彻底解决需共享原子写原语提供 no-clobber 发布）。

**非阻断观察 / 记录项（建议属主确认）**

4. **骨架会提前进入既有自动验收检查**：`runAcceptanceCheck` 扫描 `docs/flows/*.yaml`（`interface.ts:8896`），
   交接写账本/会话 settle 后会对骨架调用 `dispatchAcceptanceForFlow`，按既有逻辑给产品落一条
   「验收门未通过：流程未完成…」系统行（`interface.ts:5401-5410`，同原因去重一次）。该行如实但比过去提前
   （以前交接后无 flow 文件、无此提示）；未在真机确认是否符合预期，未修改既有通知语义。
5. **骨架可被 flow 工具提前推进**：顶层 `status` 仅供人读、不参与机器判定；若模型不按卡先替换而直接用
   `flow_step_update` 把通用步骤标 done（role-cards/appointment 由应用收口除外），流程完成度判定不要求
   `delivery-*`，理论上可能在未替换骨架的情况下走到验收。属模型遵守卡文本的行为面风险，无机械上限；
   需要在真机/真实模型验收中观察。
6. **超时对账的固有限制（属主已在 fix 记录登记）**：目标可能正忙于**无关**任务而本次投递尚未进入直发，
   极端竞态会按在途回 ok:true；在途对账即写 `dispatch.accepted`，若晚到失败揭示输入从未被接受，账本
   无法回滚；未 ACK 的晚到失败会补第二条系统行（新事实，非重复）。
7. **桌面首跑 flake**：`acceptance-dispatch.test.ts:5121` 等待 gate 记录 passed 后立即断言 `gate.review`
   账本，而实现先写记录（`interface.ts:6971`）后追加审计（`:6976`）；建议属主把等待条件改为审计条目。
8. **遗留 `followUp:"nomination-after-flow"` 迁移路径**不识别骨架，遇已存在骨架仍可能提示初始创建；新事件
   已不产生该路径，仅迁移兼容（桌面 change 记录已登记）。
9. **intent 文件 TOCTOU**：若 payload 未带 flowId 且编排校验后、桌面读盘前意图文件被改动，桌面可能按新
   flowId 创建骨架（Liaison 是唯一写者，窗口极窄）；未观察到。
10. **骨架替换「只一次」是文本纪律**：无机械次数上限；重复 schedule-write 由既有写卡门/schema 校验兜底，
    不阻止一次合法重写（gate 引擎 change 记录已登记）；完整流程落盘后不得把整文件重写当日常状态更新。
11. **本地 flake 基线**：本机无法创建 symlink 的既有 EPERM 红（编排 1、runtime 3）与平台 skip 与既往一致，
    不代表产品失败；非 Windows 平台未验证。
12. **骨架写盘失败分支未做原子写故障注入**：A2 的失败安全由共享 `atomicWrite`（tmp+fsync+rename，失败不
    替换目标）语义保证；本批测试覆盖「目标被目录占用」「`docs/flows` 是普通文件」两类写前/检查失败，未注入
    「rename 阶段失败」的专门用例。
13. **文档小瑕疵（非阻断）**：编排 change 记录 §四.1 仍提示「桌面用字面量 `status === "skeleton"`、建议改
    导入常量」；桌面实现已按建议从 `govern-session.ts` 导入 `FLOW_SKELETON_STATUS`（本报告 A4 已核），
    编排记录未回改该段。

## 七、最终判定

**pass（受限）**。A1–A4、B1–B5、C1–C3 的确定性实现与独立复跑全部 PASS，未发现 needs-work；A/B 的行为
在真实产品代码路径（含真实 `SessionManager` 与 45s 实测）上成立。受限项为 §六 的未验证真机/真实模型链路、
运行中应用旧代码与已登记残余风险；其中第 4/5 条属行为面观察，建议在重启后的真机验收和后续批次中确认。
本判定不授予提交、推送、合并、部署或发布。

## 八、证据索引

- 候选清单 / 复跑命令 / 探针说明：[`2026-10-26_flow-skeleton-handoff-acceptance-evidence/00_candidate-and-commands.md`](2026-10-26_flow-skeleton-handoff-acceptance-evidence/00_candidate-and-commands.md)
- 逐文件 SHA-256：同目录 `00_candidate-manifest.sha256.txt`（101 行；清单摘要 `08e00f76…`）
- 定向与全量日志：同目录 `01`–`14`、`18` 号 `.log`
- 独立探针：同目录 `15_probe-skeleton.mjs/.txt`、`16_probe-handoff-order.mjs/.txt`、`17_probe-handoff-deadline.mjs/.txt`
- 角色变更记录：编排 `2026-10-26_change_intent-flow-skeleton.md`；桌面窗口 `2026-10-26_change_intent-flow-skeleton.md`、
  `2026-10-26_fix_intent-handoff-deadline.md`；门禁引擎 `2026-10-26_change_flow-skeleton-convener-card.md`
