# 运行时派发门证据修复 + 产品内置角色代码模块化方案 P1 / P1.1 复核记录

- 复核对象：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md`（版本 P1 草案，日期 2026-11-07；92819 bytes / 944 行；SHA-256 `50a30ff864c815580596f3248dfefbf44db8d2de020ec334ccabdce9f5f511ba`；本记录按该快照只读核对）。
- 窄复核对象：同一方案 **P1.1 草案**（2026-11-07；109377 bytes / 1002 行；SHA-256 `c4a5eba4ad8b61f4d42bb697c633296449757ab9dbf2b2420015c401a6786743`；P1.1 取代 P1 `50a30ff8…`，P1 保留为历史版本；窄复核记录见文末“窄复核记录（P1 → P1.1）”）。
- 最终窄复核对象：同一方案 **P1.2 草案**（2026-11-07；125752 bytes / 1061 行；SHA-256 `e39561a3b40add58f09c27be05d9cc3db90c84727afb6f88954fb8b0c83e7abc`；P1.2 取代 P1.1 `c4a5eba4…` 与 P1 `50a30ff8…`；最终窄复核记录见文末“最终窄复核记录（P1.1 → P1.2）”）。
- 闸门 1 前最终核对对象：同一方案 **P1.3 草案**（2026-11-07；131607 bytes / 1075 行；SHA-256 `6985ff7ed4a9149228fb6e5af0993c1fcfa56318b541c00dad0cf53745ebec0b`；P1.3 取代 P1.2 `e39561a3…`、P1.1 `c4a5eba4…` 与 P1 `50a30ff8…`；核对记录见文末“闸门 1 前最终核对记录（P1.2 → P1.3）”）。
- E 路线窄复核对象（版本漂移）：通知的 P1.4 `c9c36ba2…`（1204 行）在复核期间已被作者推进为 **P1.5**（2026-11-07；**157519 bytes / 1227 行；SHA-256 `c883ce31a9da6c06aad69d26f87626001720eee8021100d1c92bde56236e8ad5`**）；P1.5 取代 P1.4 `c9c36ba2…`、P1.3 `6985ff7e…` 等。P1.4 未单独形成复核节（被 P1.5 取代）；本轮按当前 P1.5 快照复核，见文末“P1.5 窄复核记录（E 路线、死代码清理与引用，2026-11-07）”。
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：T3 风险档位；跨角色/跨模块与共享运行时契约变化；涉及治理、权限与派发边界；15 个待确认问题与 8 个选装、范围仍有待客户决定，不满足轻量条件）。
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；不继承作者对话；只读方案、闸门 0、代码、真实运行证据与既有标准；只写本复核记录）。
- 闸门 0 记录：`docs/communication/2026-11-07_intent_runtime-tool-surface-gate.md`（当前快照 68 行，SHA-256 `779a42493926cd969fa4e6bab014aeca96cb59c51fc22e26c96c1836f5c78997`；方案头部引用 `5fc39558…`，见 F1。内容确认：变更普通流程；门独立成模块；六角色模块化；共享/不重复约束；共享代码单一维护；8 个开发侧维护角色 = 6 角色模块 + 共享 + 门控；**开发团队扩张 ≠ 产品内置角色扩张**；并入当前变更。）。
- 关联记录：授权 `2026-11-07_authorization_trunk-verify-gate-fix.md`（`ae401b39…`）、`2026-11-07_authorization_claude-schema-fix.md`（`f76fd163…`，T1 独立在飞）、决定记录 `2026-11-07_decision_closeout-suspended.md`、变更包 `docs/scheduling/2026-11-07_change-package_direct-role-capabilities-closeout.md`（当前 242 行，`0c316d48…`，与方案引用一致；§10.4/§11 记录 run-2/run-3）。
- 关联标准与方案（按主检出字节复算）：P2.1 `16a346e0…`、I6 B1 `94a23460…`、P3.1 `3a0650fc…`、Git P2 `5ca20c5f…`，均与方案头部一致。
- 代码基线：worktree `trunk-amendment`，HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`；工作树含 T1（Claude schema 窄修复）未提交差异 `src/common/claude-adapter/schema.ts` 与 `test/claude-adapter/session.test.ts`，方案声明只读引用、不在其写集，属实。本文行号均按该快照核对；实施仍应以符号名与文本锚点为准。
- 复核日期：2026-11-07。
- 说明：复核只作建议，不是批准、通过、验收、客户闸门或实施授权，也不替代闸门 1/2；复核无阻断权。作者处置权与不采纳权按复核规则 §9。

## 独立核对过的关键事实（只读）

- `validParent()`（`src/pipeline/orchestration/trunk-runtime.ts:751-770`）在 L756 要求 `core.toolSurface?.status === "observed"`；`currentChiefResumeSource()`（同文件 `:671-690`，L676）有同一要求；`staleParent()`（`:771-772`）统一返回 `trunk-verify-failed` 与 “Repository initialization parent is not the actual active accepted chief dispatch turn”；`validParent` 在无 `hostInitialization` 时直接返回 true（`:752`）；`prepareRoleDispatch` 在 Service 调用前后各复检一次（`:772`、`:775`）。方案 F1/F2/F3 与 INV-11 属实。
- `inspectToolSurface()`（`src/service/runtime/session.ts:752-813`）：通用注册表/处理器检查 `:759-766`；非 demo 才读 `inner.inspectNativeToolSurface?.()` `:767-770`；native 缺失或身份不匹配 → `native-tool-registry-binding-unverified` `:772-774`；native 存在时才进入生命周期/执行覆盖/native factory/注册表一致/未中介执行检查 `:776-791`；`disposed` `:794`；`status = reasons.length ? "unknown" : "observed"` `:801`；`nativeToolRegistry` 只有在无 reasons 且有 native 时为 `application-mediated` `:799`。
- 非 Codex 的实际拒绝理由：Claude/Pi 没有 `inspectNativeToolSurface`，`native` 恒缺失，精确命中 `native-tool-registry-binding-unverified`（`:772-774`）；`native-production-tool-factory-unverified`（`:782-783`）位于 `else` 分支，仅当 native 事实存在且 runtime/factory/status/reasons 不符时出现。方案 §0.2 #2、§1.3 #1 对任务背景的更正**正确**。
- `prepareNative()`（`:498-513`）仅在 `factoryProvenance === "default-production" && options.runtime === "codex"` 时才准备 native factory（`:502`）；其它 runtime 返回 `undefined`。方案 F5 属实。
- `inspectNativeToolSurface` 全仓唯一实现为 Codex `src/common/codex-adapter/chat-transport.ts:258-272`（`grep` 全 `src/` 仅此一处实现；`src/model/runtime.ts:179` 为可选接口声明，`session.ts:544/769` 为调用点）。方案 F9 属实。
- Claude `inspectNative()`（`src/provider/claude/session.ts:514-540`）：无 active tool 时 `status: "unknown"` `:525`；`transport.kind: "unknown"` `:529`；`processCoverage: "unknown"` `:530`；reasons 说明 SDK 不暴露 PID/进程树/关闭确认 `:531-538`。Claude 有 `nativeLifecycle`（`:541-570, :944`）但没有 `inspectNativeToolSurface`。方案 F10/F11 属实。
- Pi `makeRoleSession`（`src/common/pi-adapter/real-adapter.ts:1385-1470`）：`transport.kind: "in-process"` `:1413`；`processCoverage: "unknown"` `:1415`；reasons `:1416-1421`；无 `inspectNativeToolSurface`；`customTools` `:1647`；`allowedSurface` `:1695-1697`；`noTools: "builtin"` `:1776`；`getActiveToolNames()` 超面即构造失败 `:1807-1811`。方案 F12/F13 属实。
- 包装层 `collectLifecycle()`（`src/service/runtime/session.ts:602-682`）：Claude/Pi native coverage unknown → `coverageUnknown = true` `:639`；`turnId` 来自 `latestTurn` `:675`。方案 F14 属实。
- Core 注册表把 `inspectLifecycle()` 与（active 时的）`inspectToolSurface()` 复制为证据（`src/service/runtime/session.ts:209-220`）。方案 F15 属实。
- `inspectManagedRoleSessionEvidence()`（`src/pipeline/orchestration/run-role.ts:737-743`）从本进程实际构造的 handle 取 `lifecycle` 与 `toolSurface`。方案 F16 属实。
- 桌面 host 事实：`captureChiefDispatchSource`（`app/desktop/session.ts:8798-8811`）从真实父会话 `origin`（turnId/inputAccepted/settled/kind/creatorReports）与 native-directory-selection registration 构造 `hostInitialization`，`current()` 二次校验；团队计划与文档准备各自从真实父会话构造（`:9006-9017, :9056-9077`）。方案 F17/F18 属实。
- `RepositoryInitializationContext.parent` 类型（`src/service/trunk/abstract/trunk-service.ts:248-253`）把 `inputAccepted: true; settled: false` 写成字面量；Service 层重核见 `apply-journal.ts:3508/3566/3648`。方案 F19 属实。
- `apply-journal.ts` hub 分支（`:3501-3558`）要求 `fromRoleId === "chief"`、五个目标、flowId 格式、host 注册/父来源、项目身份一致；非 hub 仓库初始化分支（`:3639-3664`）要求 native selection、`initial.state === "absent"`、应用状态存在、无父仓库/reasons。方案 F20/F21 属实。
- `inspectInitializationProtection()`（`trunk-runtime.ts:59-145`）对注册表每个 active 条目要求 lifecycle 完整（`:104-105`）且 `surface.status === "observed"`、`nativeToolRegistry === "application-mediated"`、`native.factoryPlan` 存在（`:107-111`）；被 `git_candidate` init/commit、`git_publish` delivery、文档/计划/激活发布等路径调用（主调用点 `:204,218,260,322,348`，另有 `:206,236,262,326,351` 复检与 `:448,503` 两个额外消费者，见 F10）。方案 F22 的结论与“本变更不放宽”立场属实；其“大概率”被下游拦截的表述偏保守，代码结构上 Claude/Pi 的 `processCoverage` 恒 unknown 会先命中 `git-core-creation-proof-unavailable`（`:104-106`）。
- stable-write 前置（`run-role.ts:1843-1844`）只要求 `factoryProvenance === "default-production"` 与 active `request_stable_write`，不要求 toolSurface observed。方案 F23 属实。
- run-3 真实证据：`C:\Users\51054\Desktop\work\ans-dogfood-run-2026-11-07\run-3\ui-03-body.txt`（`0914db95…`）显示 `dispatch_task 已拒绝` 与 “Repository initialization parent is not the actual active accepted chief dispatch turn”；`C:\Users\51054\Desktop\work\ans-dogfood-2026-11-07-r3\.ans\state\logs\chief.jsonl`（`63a9ed46…`）第 27 行为 `tool.call run_shell`（2026-11-07T03:38:20.075Z，turn `8a41a47f…`），同 turn 于 03:38:22.810 中止；日志证明工具**发起调用**（未记录完成结果），足以证明应用注册面包含 `run_shell`。方案 §0.2 #3/F24 的核心事实属实，措辞建议见 F10。
- 角色策略分布：`governance-roles.ts` 的 `BUILT_IN_GOVERNANCE_ROLES` 自 `:313` 起，数组实际结束于 `:572`（方案 F25 写 `313-560`，见 F10）；`run-role.ts` 的 `isTrio`/能力位、chief 专属工具（`:990-1013, :1687-1704`）、三个纯谓词（`:2336-2349`）、`TRIO_CARD_KINDS`（`:2859-2894`）均属实；`workflow-preconditions.ts:1530-1607` 有 `evaluateDispatchAuthorization`/`evaluateDispatchPreflight`/`reportTargetForTaskCreator`，`handback.ts:456` 有 `isDispatchableRoleId`。方案 F26/F28 属实；F27 的 grep 计数口径见 F10。
- 现有写集：门禁引擎拥有 `src/common/门禁引擎/`、Model boundary/role/decision、`resolveWrite`、`shell-rules`；编排拥有 `src/pipeline/orchestration/trunk-runtime.ts`、`run-role.ts` 与私有 `src/common/编排/`、`src/service/trunk/`；运行时核心拥有 `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts`、私有 `src/common/runtime-core/`；Claude/Pi 适配器分别拥有 `src/provider/claude/session.ts`、`src/common/pi-adapter/`；项目管理拥有 `src/common/shared/` 与 `角色卡/项目管理/docs/architecture/shared-components.md`。方案 F29 基本属实；`src/common/gates/` 与 `src/common/roles/` 当前**不在任何现有角色边界**（见 F5/F8）。
- 风险档位：`docs/acceptance/2026-10-22_acceptance-risk-tier-criteria.md` §4.3.3 明确治理/权限变更与 shared-abstraction change 为 T3，不得压成 T0；方案定 T3 有依据。
- I6 冻结状态：`docs/acceptance/2026-11-06_chief-hub-routing-criteria-v1.md` 第 7 行明确“I6修订标准已冻结，尚无 B2”，H01–H11 全部未判定；方案“不改 I6/旧 A/J、另立 B1”的说法在流程上成立，B1 命名与关系建议见 F11。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过 | 阶段 1 采用 A + 有界 D，逐项可追溯闸门 0 与真实 run-3 阻塞；B 被比较并否决；C 只作长期方向；无“为以后可能”新增通用引擎/DSL。F5 只影响阶段 1 写集落地，不否定最小性。 |
| OD-2 必做与选装 | 通过 | O1–O8 分节，均有收益/代价/默认状态/待确认引用；O1 标“默认建议实施”但保留 Q12 确认，未冒充批准；没有把选装写成必做。 |
| OD-3 复用 | 发现 | 复用了既有 native 证据模式、`RuntimeSessionToolSurfaceFacts`、`inspectManagedRoleSessionEvidence`、`workflow-preconditions` 共享函数与现有测试接缝，属实；但 `src/common/roles/`、`src/common/gates/` 是现行 `shared-directories.md` 未覆盖的新共享根，Q6/Q8 已披露，见 F7/F8。 |
| OD-4 非目标 | 通过 | NG1–NG9 明确不删门、不放宽写权/客户主权、不建 DSL、不改冻结标准、不把 T1 并入；8 个角色是客户方向且明确为开发侧 worker，非产品内置角色扩张。 |
| OD-5 被否决的备选 | 通过 | A/B/C/D 真实比较；B 的“按 runtime 信任”风险、C 的改动面、D 单独不修问题均记录；无编造备选。 |
| MK-1 目标 | 发现 | G1–G6 可追溯到闸门 0 与客户 8 角色方向；事实/推断分列（附录 A）总体清楚。但方案头部意图记录哈希与当前文件不一致（F1），§0.4 措辞易混（F9），Claude 的 WebSearch 事实未归入证据字段（F3）。 |
| MK-2 完整流程与失败分支 | 通过 | §4.2 调用/数据流、§4.5 错误语义、§4.7 下游门、§11/§12 负例覆盖了成功路径与主要失败分支；阶段 1 只承诺派发受理并如实报告下一门，与授权一致。 |
| MK-3 输入输出 | 发现 | 类型与字段基本可核对；`nativeBuiltinTools` 对 Claude `WebSearch` 的归类（F3）以及 `appTools`/foreign 的精确比较口径仍需明确。 |
| MK-4 契约 | 发现 | §5 事实分类/消费者/边界较完整；但 `applicationMediation` 的 fail-closed reason 集合未穷尽（F4），共享目录路径与修订权限（F7/F8）、B1 命名与 I6 关系（F11）需补。 |
| MK-5 完成标准 | 发现 | P/N、M、R、D 系列大多可核查；N13 demo 的语义/可达性未由现状保证（F2），D2 依赖图工具缺失（F6），真实运行预算/停止条件与若干负例可再具体（F12）。 |
| MK-6 风险与未决事项 | 发现 | §10/附录 A/Q1–Q15 已列风险与待确认；但 `src/common/gates/` 无现有 boundary owner 的落地方案未写进 P1（F5），意图记录版本锚点需修正（F1）。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点（事实/版本锚点） | general（一般） | 头部“依据（本检出）” | 方案引用意图记录 SHA-256 `5fc39558f65b8d8c74a1f46b434c0263c74c615f6f655a4b62b9290b75786674`，但当前 worktree 文件实际为 `779a42493926cd969fa4e6bab014aeca96cb59c51fc22e26c96c1836f5c78997`（68 行；主检出无该文件副本）。文件内容（含 8 角色方向）与方案引用一致，差异应是版本/尾部空行等编辑造成，但版本锚点已失效。 | `sha256sum docs/communication/2026-11-07_intent_runtime-tool-surface-gate.md`；方案第 8 行。 | 按当前文件重算并更新；若 `5fc39558…` 指较早快照，记录该版本与差异；闸门 1 材料应使用同一版本。 |
| F2 | 漏重点（验收口径） | general（一般） | §11.1 N13；§0.1；§4.4 Codex 路径 | N13 把“demo runtime”列入“负向（全部仍拒绝）”。但当前 `inspectToolSurface()` 对 demo 跳过 native 检查（`session.ts:767`），注册表/处理器未漂移时 `status` 可为 `"observed"`（`:801`）；`validParent()` 不排除 demo，只要求 `core.runtime === context.parent.runtime` 且 `factoryProvenance !== "custom-override"`（`:755-756`），而 demo 的 provenance 是 `"demo"`（`:423-424`）。若 demo 会话为 `default-core` 且已登记，严格路径可能通过。N13 若指“新应用中介路径拒绝 demo”，该点成立（新路径只接受 claude/pi）；若指“派发门整体仍拒绝 demo”，则需新增显式条件并说明这是行为变更，不能同时声称“严格路径逐字不变”。 | `src/service/runtime/session.ts:752-813, 423-424`；`trunk-runtime.ts:751-770`；`run-role.ts:2282-2283`。 | 明确 N13 的语义；若需整体拒绝 demo，在门模块加显式 runtime 排除并补负例/行为变更说明；B1 不应包含无法成立的负例。 |
| F3 | 漏重点（边界情形） | general（一般） | §5.2 Claude 行；§5.3；Q2/Q3 | 方案记录了 Claude 构造面 `tools: []` 或 `[WebSearch]`，但未定义 `WebSearch` 是否计入 `nativeBuiltinTools`（本路径要求为空）。`webSearchEnabled` 由 `ANS_CLAUDE_WEB_SEARCH=1/on` 打开（`provider/claude/session.ts:711-728`）；若启用，按“nativeBuiltinTools 必须为空”路径会拒绝；若适配器不报告它，又会削弱“无额外 native 通道”的证据。`start_background_task` 也无 run-3 实测（仅有 `run_shell`）。 | `src/provider/claude/session.ts:711-728`；方案 §5.2/§5.3；`chief.jsonl:27` 仅见 `run_shell`。 | 明确 WebSearch 的分类与政策（允许并精确枚举 / 计入 nativeBuiltin 并拒绝 / 仅在判断模式禁用），并给正负例；Q2 同时说明 `start_background_task` 的证据缺口。 |
| F4 | 漏重点（契约/安全不变量） | general（一般） | §4.4 包装层构造条件；§3 INV-7/INV-8；§5.3 | `inspectToolSurface()` 还会产生方案未列出的 reason，例如 `role-capability-callback-guard-unverified`（`session.ts:798`）；方案未说明该 reason 是否阻止 `applicationMediation.status: "verified"`。另外 `nativeBuiltinTools` 完全由适配器自报，包装层只能核对 appTools/foreign/身份，不能独立验证 native builtin；这一信任边界应写明。若“任何未列入白名单的 reason 一律 fail-closed”是意图，应明确列出可共存 reason（至少 `native-tool-registry-binding-unverified`）与阻断 reason。 | `src/service/runtime/session.ts:752-813, 794-799`；方案 INV-7/INV-8。 | 给出穷尽的 reason 白名单/黑名单（默认拒绝），并为 `role-capability-callback-guard-unverified`、`nativeBuiltinTools` 自报边界各加负例/适配器测试。 |
| F5 | 漏重点（可行性/写集） | general（一般） | §9 P1 行与依赖说明；Q9；§4.1 | 当前没有任何现有角色的 Section 1 包含 `src/common/gates/`（门禁引擎拥有 `src/common/门禁引擎/`，编排拥有 `src/common/编排/`，项目管理拥有 `src/common/shared/`）。P1 的“编排临时 owner”会写出编排边界；Q9 的“阶段 1 先上岗或临时 owner”需要显式的边界/写集授权（人事/闸门 2）或先完成门控角色上岗，否则 P1 无法在现有边界内启动。 | `角色卡/门禁引擎/boundary.md`、`角色卡/编排/boundary.md`、`角色卡/项目管理/boundary.md`。 | 在 §9/Q9 明确阶段 1 的合法 owner 与授权路径（新建门控角色并授权 `src/common/gates/`，或临时写集经闸门 2/人事确认）；不要只写“临时 owner”。 |
| F6 | 漏重点（验收可执行性） | general（一般） | §8.4 D2/D5；§11.4 D2 | D2 要求用 dependency-cruiser/madge 生成依赖图，但 `package.json` 未安装任一工具，也无相关脚本（仅有 `typescript` 与现有 npm scripts）。当前状态下 D2 无法执行，D5 的“门判定只在 gates/”也缺少自动核对手段。 | `package.json:15-31`；`grep dependency-cruiser/madge` 无命中。 | 指定扫描工具或仓内脚本（如 TypeScript Compiler API 小脚本），把 `package.json`/devDependency 变更纳入阶段 2 写集与 owner；或改写为可人工复核的等价清单。 |
| F7 | 漏重点（共享规则） | suggestion（建议） | §7.2、§8.2 注、§8.4-1 | 技能 `shared-directories.md` 与项目管理边界把共享组件目录定在 `角色卡/项目管理/docs/architecture/shared-components.md`；方案多处写仓库根 `docs/architecture/shared-components.md`（虽带“或等价目录”）。此外修订 `shared-directories.md` 本身是治理参考变更（维护者/客户同意/变更记录），不只是团队计划项。 | 技能 `references/shared-directories.md:21-35`；`角色卡/项目管理/boundary.md:14-15`；方案 §7.2/§8.4。 | 对齐到 PM 角色目录下的目录路径，或在方案中明确指定等价路径并说明理由；同时点名 `shared-directories.md` 的维护者与变更记录路径。 |
| F8 | 漏重点（共享规则） | suggestion（建议） | Q6/Q8；§4.1/§6.4 | 现行规则把 `common/<role-id>/` 定义为角色私有（其他角色不 import），把 `common/shared/` 定义为 PM 唯一 writer；`common/roles/<id>/` 与 `common/gates/` 是新共享根且被引擎跨角色读取，Q6 已问是否修订，但方案应明确：在修订确认前，现行规则并不授权这些根/导入；修订是治理变更。 | 技能 `shared-directories.md:5-19`；方案 Q6/Q8。 | 在 Q6/Q8 中写明“现行规则未覆盖，需先修订（含治理变更记录）”，并列出阶段 1 仅新增 `src/common/gates/` 时的临时合规说明。 |
| F9 | 漏重点（术语/客户口径） | suggestion（建议） | §0.4 第一 bullet；§1.4 G4/G5；§9/§11 标题 | “新增六个内置角色代码模块”可能被读成“新增六个内置角色”，虽紧接的口径澄清已说明产品内置六角色不扩张。其余全文（§6/§7、Q10、§11.3）区分良好。 | 方案 §0.4；闸门 0 第 55-62 行。 | 改为“为现有六个产品内置角色各新增一个代码模块”；表格标题统一使用“开发侧 worker（代码维护角色）”。 |
| F10 | 漏重点（事实锚点） | suggestion（建议） | §1.2 F22/F25/F26/F27；§4.2 mermaid；§0.2/§1.2 F24 | 小误差/口径不统一：F25 写 `governance-roles.ts:313-560`，数组实际结束于 `:572`；F26 写 `2859-2878`，§6.1 写 `2859-2894`；F22 调用点列 `204,218,260,322,348`，另有 `448,503` 两个消费者；F27 的 grep 计数按 `grep -a -o '"role"'` 与当前快照有 1–4 处差异且未注明 pattern（`app/desktop/session.ts` 含二进制字符，普通 `grep -o` 会漏计）；mermaid 写 `evaluateDispatchParent`，接口名为 `evaluateChiefDispatchParent`；§0.2/F24 说 run_shell“实际使用”，日志只记录 `tool.call` 发起、同 turn 2.7s 后中止（无完成结果）。 | `governance-roles.ts:572`；`run-role.ts:2859-2894`；`trunk-runtime.ts:448,503`；`chief.jsonl:27-29`。 | 统一行号/名称/计数口径，注明 grep 命令或标注“近似”；把“实际使用”改为“发起调用（未记录完成）”。 |
| F11 | 漏重点（标准关系） | suggestion（建议） | §4.6、NG8/Q14；§11 | 现有冻结文件 `2026-11-06_chief-hub-routing-criteria-v1.md` 本身标题就是“B1 增补 v1（I6有界修订）”；方案说“另立 B1”容易与既有 I6 B1 混淆。另需明确新 B1 不替代/不修改 H02/H03：H02 的“普通 dispatch 核真实 Chief/当前输入”会在新证据路径下重验，B1 应交叉引用而不是覆盖。 | 该标准文件第 1-8 行（I6修订已冻结、H01–H11 未判定）。 | 给新基线一个可区分的名称（如“派发门 B1”），并在 B1 中声明与 I6 B1/H02/H03 的引用/不替代关系。 |
| F12 | 漏重点（验收可检查性） | suggestion（建议） | §12.3；§11.1/§12.2；§4.4 | §12.3 只说“真实模型调用需单独预算授权”，未给 RR1 的具体上限（回合数/墙钟/费用/中止条件）；§12.2 是“最小”清单，可再补：Codex appTools 含 `run_shell`/`start_background_task` 仍 unknown/拒绝；两次 `validParent` 之间证据变化（TOCTOU）；`parent.kind` 非 message；`creatorReports` 不匹配；`applicationMediation.status verified` 但 `status === observed`（双路径歧义）；`nativeToolRegistry` 非 unknown。 | 方案 §12.3/§12.2；`validParent` 两次调用 `trunk-runtime.ts:772,775`。 | 在 B1 中写具体预算/中止条件，并补齐上述负例；RR1 证据按现有 dogfood 约束保留原件。 |
| F13 | 漏重点（防御性条件） | suggestion（建议） | §4.4 Claude/Pi 受限路径 | 受限路径未显式要求 `core.toolSurface.nativeToolRegistry === "unknown"`，也未要求 `appTools` 包含 dispatch 工具名（`dispatch_task`/`ans_dispatch_task`）。前者由 INV-1/P4 隐含；后者与 Codex 路径现状一致，但应在 B1/契约中说明为何不需要或补上。 | `RuntimeSessionToolSurfaceFacts` `src/model/runtime.ts:220-243`；方案 P4。 | 在门模块 predicate 加 `nativeToolRegistry === "unknown"`；对 `appTools` 是否必须含 dispatch 工具给出明确理由或检查。 |

## 复核结论

**建议修订后提交**（无 must-fix 级发现；无发现构成对闸门 1 的硬阻断——复核本身也无阻断权）。方案的核心事实（拒绝理由、Codex 唯一实现、run_shell 证据、下游门披露、六角色/8 角色/共享/门控范围、T3 依据、与 I6 的关系）经独立复算基本准确；阶段 1 = A + 有界 D 的推荐与安全不变量一致。F1–F6 为 general，建议在提交闸门 1 前修订，其中 F2/F3/F4 直接影响 B1 验收口径与安全不变量审计，F1 影响版本锚点，F5/F6 影响阶段 1 启动与验收可执行性；F7–F13 为建议，可在同一修订或闸门 1 材料中处置。

## 未检查事项、限制与未解决意见

- 本复核未运行任何测试、未调用真实模型、未改代码/测试/角色卡/边界、未提交/推送/合并/发布；所有代码结论均为只读静态核对。
- 未验证 Claude/Pi 实际 SDK 在真实回合中对 `WebSearch`、外来 MCP、`run_shell` 的运行时注册细节；F3 需真实/桩件证据。
- 未验证 `docs/architecture/shared-components.md` 的实际存在（当前 `docs/architecture` 不存在；PM 边界指向 `角色卡/项目管理/docs/architecture/shared-components.md`）；F7 需作者/沟通确认目标路径。
- 未验证 dependency-cruiser/madge 之外的扫描方案；F6 需实施前定工具。
- 变更包当前为 242 行 / `0c316d48…`，与方案引用一致；但决定记录 `2026-11-07_decision_closeout-suspended.md` 提到的“变更包 v2 `5caa3f57…` / 187 行”与当前文件不同。该差异不属于方案正文问题，建议沟通在闸门 1 材料中核对版本，避免同一名称多版本混用。
- 未解决/待客户决定：Q2（run_shell）、Q3（foreign MCP）、Q5（下游仓库初始化门是否另立变更）、Q6/Q8（新共享根与共享代码角色 S1/S2）、Q9（门控角色阶段 1 是否上岗）、Q11（真实运行预算/Pi 是否必测）、Q12（错误语义/诊断）、Q14（B1 与冻结标准关系）。另建议把“Codex 与 Claude/Pi 在派发门上的严格度不对称（Codex 含 shell 会给 unknown，Claude/Pi 允许）”作为客户可见的确认点，而不只写在 §5.3 的“需客户知晓”。
- 作者如修订实质内容，复核者只按受影响部分再复核并更新本记录；未变化部分不重复复核。

## 窄复核记录（P1 → P1.1，2026-11-07）

- 窄复核对象：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` **P1.1 草案**（2026-11-07；109377 bytes / 1002 行；SHA-256 `c4a5eba4ad8b61f4d42bb697c633296449757ab9dbf2b2420015c401a6786743`）。原复核对象 P1（`50a30ff8…`，944 行）保留为历史版本。
- 窄复核范围：只检查 P1.1 对 F1–F13 的处置是否真实落地、是否引入语义漂移；不重复全文复核，未变化部分沿用 P1 复核结论。
- 结论：**仍需修订（窄修）**。F1、F3–F9、F11、F12 已按处置落地；F2、F10、F13 有残留，另有 1 项新的安全不变量矛盾（F14）与 1 项 predicate/验收口径不一致（F15），建议作者窄修 F14–F16（F17 建议同批）后再提交闸门 1。

### 一、版本与头部自洽性

- 哈希/字节/行数与作者通知一致：`c4a5eba4…`、109377 bytes、1002 行；方案头部第 3 行写明“P1.1 取代 P1 `50a30ff8…`（944 行）”，P1 保留为历史版本；P1.1 处置复核记录链接与复核对象（P1）标注正确。
- 残留：文件标题第 1 行仍为“方案（P1）”，与版本行“P1.1”不一致（F16）；§13.1 引用的复核记录 hash/行数（`6e83da55…`、93 行）是本窄复核追加前的快照，本记录追加后已变化（F17 提醒沟通引用新 hash）。

### 二、F1–F13 处置核验

| 发现 | 处置是否落地 | 核验要点 |
| --- | --- | --- |
| F1 意图记录哈希 | **关闭** | 头部改为当前 68 行 `779a4249…`，并注明 `5fc39558…` 为已失效早期快照；与当前文件复算一致。 |
| F2 demo 口径 | **部分关闭（残留 F14）** | §4.4 新增 demo 口径、§11.1 N13 改为“新应用中介路径拒绝 demo（只接受 claude/pi）”、Q1 加 demo 备注，均正确；但 §3 INV-5 仍写“demo runtime 继续拒绝”，与 F2 处置直接矛盾（F14）。 |
| F3 WebSearch/background task | **关闭** | §5.2/§5.3 明确 WebSearch 计入 `nativeBuiltinTools`、启用即 fail-closed；Q2 分开“受控 shell”与“具名 native 例外”；§12.1 增加“实际构造面 = 报告面”测试；N22 负例；`start_background_task` 无真实证据的披露属实。 |
| F4 fail-closed reason 集/信任边界 | **关闭（有轻微表述残留）** | §4.4 新增可共存 reason 白名单（仅 `native-tool-registry-binding-unverified`）与阻断集（含 `role-capability-callback-guard-unverified` 等）、“未列即拒绝”；信任边界与适配器测试已写。轻微残留：§4.4 包装层构造条件列表（:383-390）仍只列 `core-registry-*`/`core-tool-handler-*`/`custom-provider-factory-unverified`，未回链到下方 reason 白名单（F17 建议）。 |
| F5 阶段 1 gates 写集授权 | **关闭（有轻微表述残留）** | §4.1、§7.2（第 8 行写集括注）、§9 P1 行、Q9 均写明现行无 Section 1 覆盖 `src/common/gates/`，须闸门 2/人事授权或 D-minimal；Q9 列出 (a)(b)(c) 三路径。轻微残留：§9 依赖说明（:768）仍只写“书面临时 owner/转移计划”，未回链 Q9 的边界授权要求（F17）。 |
| F6 依赖图扫描工具 | **关闭** | §8.4-2 改用仓内 TypeScript Compiler API 脚本/测试，明确 dependency-cruiser/madge 未安装、若采用须加 devDependency/脚本/owner 评审；§6.4、§11.4 D2/D5 同步。 |
| F7 shared-components 路径/规则 | **关闭** | 全文已统一为 `角色卡/项目管理/docs/architecture/shared-components.md`（grep 确认无仓库根 `docs/architecture/` 的残留引用）；Q6/Q8/O4/§7.2/§8.4 均更新；`shared-directories.md` 修订被明确为治理变更（维护者/变更记录/客户同意）。 |
| F8 新共享根未授权 | **关闭** | §4.1/§6.4/Q6/Q8 明确 `common/roles/`、`common/gates/` 是新共享根，现行规则未覆盖、修订前不获授权。 |
| F9 术语 | **关闭** | §0.4 已改为“为现有六个产品内置角色各新增一个代码模块”；grep 未发现“新增六个内置角色”残留；全文“开发侧 worker”口径一致。 |
| F10 行号/计数/措辞 | **大部分关闭（残留 F16/F17）** | F25 改 `313-572`、F26 统一 `2859-2894`、F22 补 `448,503`、F27 标注近似/非文本字节、mermaid 改 `evaluateChiefDispatchParent`、run_shell 改“发起调用（未记录完成）”。残留：§6.1 表（:483）仍写 `governance-roles.ts:313-560`（F17）。 |
| F11 B1 命名/与 I6 关系 | **关闭** | §4.6、§11 首注、Q14 均引入暂名“运行时派发门与角色模块化 B1”，声明不替代/不修改 I6 B1 与 H02/H03、仅交叉引用。 |
| F12 预算/负例 | **关闭** | §12.3 写明单条客户消息/单 chief 回合/最多 1 次 dispatch/10 分钟/无重试/超限中止；§11.1 N16–N25 与 §12.2 补 TOCTOU、parent.kind、creatorReports、双路径歧义、nativeToolRegistry、WebSearch、阻断 reason、隐藏 native builtin 等负例。 |
| F13 受限 predicate 补强 | **部分关闭（残留 F15）** | §4.4 受限路径已加 `nativeToolRegistry === "unknown"` 与 active dispatch 工具名 ∈ `applicationMediation.appTools`；§5.3、N20/N21/N25 同步。残留：N20 的“verified + observed → 拒绝”没有被 §4.4 predicate 明确实现（F15）。 |

### 三、语义漂移检查

- **Q/O 编号**：Q1–Q15、O1–O8 保持，无重编号；Q1/Q2/Q6/Q8/Q9/Q14 内容扩展到 demo、WebSearch、共享规则/写集、B1 命名。
- **范围**：A/B/C/D 选型、阶段 1 = A + 有界 D、阶段 2+ 六角色模块化、8 个开发侧 worker、产品内置六角色不扩张，均未改变。
- **T3**：§10 仍为 T3，依据不变。
- **不变量**：INV-1–INV-12 编号与主体未变；**INV-5 的“demo runtime 继续拒绝”与 F2 的新 demo 口径冲突（F14）**——这是本轮唯一的不变量语义漂移，须窄修。
- **术语**：`开发侧 worker（代码维护角色）` 与产品内置角色区分保持一致；§0.4 已修正；未发现新的混用。
- **阶段 1/2+ 划分**：§9 P1–P5 与依赖关系未变；Q15 未变。

### 四、窄复核新增发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F14 | 漏重点（安全不变量） | **must-fix** | §3 INV-5（:204） | INV-5 仍写“custom factory、disposed、stopRequested、registry/handler 漂移、demo runtime 继续拒绝”，与 §4.4 demo 口径、§11.1 N13、Q1 备注矛盾：P1.1 已明确 demo 在严格路径可保持现状通过，仅新应用中介路径拒绝 demo。若实现/验收按 INV-5，会错误地整体拒绝 demo。 | P1.1 §3 vs §4.4/§11.1 N13/Q1；原 F2。 | 将 INV-5 改为“demo 不走新应用中介路径；demo 严格路径现状不变（若客户要求整体拒绝，按 Q1 另议）”；或删除“demo runtime 继续拒绝”并交叉引用 N13。 |
| F15 | 漏重点（验收/predicate 一致性） | general | §11.1 N20；§4.4 | N20 要求“`applicationMediation.status === "verified"` 但 `toolSurface.status === "observed"` → 拒绝”，但 §4.4 的 Codex 路径条件列表未要求 `applicationMediation` 缺席、也未限定 runtime 非 claude/pi；若实现按“status observed 即走 Codex 路径”处理，凭伪造/异常证据可能出现 verified + observed 仍通过。需明确门模块的运行时分支（claude/pi → 只走受限路径；否则 → Codex 路径），或在 Codex 路径加 `applicationMediation === undefined` 条件，或把 N20 限定为受限路径不适用而非门拒绝。 | P1.1 §4.4/§11.1 N20；原 F13。 | 在 predicate/分支结构上落实 N20（或在 B1 中按实现语义改写 N20），并补对应负例。 |
| F16 | 漏重点（版本自洽） | general | 文件标题第 1 行；§13.1 | 标题仍为“方案（P1）”，版本行为 P1.1；P1.1 取代 P1 的说明在版本行，但标题未同步。 | P1.1 第 1/3 行。 | 标题改为“方案（P1.1）”；§13.1 的复核记录引用在本记录追加后更新为新 hash/行数（F17）。 |
| F17 | 漏重点（残留一致性） | suggestion | §6.1（:483）；§9（:768）；§4.4 包装层条件（:383-390）；§13.1 | 残留：§6.1 仍写 `313-560`（F10 已在 §1.2 改为 313-572）；§9 依赖说明仍只写“书面临时 owner/转移计划”，未回链 Q9 的边界/写集授权；§4.4 包装层构造条件列表未回链下方 reason 白名单；§13.1 引用的复核记录 hash/93 行在本次追加后过期。 | P1.1 对应行；本记录本次追加。 | 同批窄修：§6.1 改 313-572；§9 注加“按 Q9 取得边界/写集授权”；§4.4 列表回链 reason 白名单；沟通引用更新后的复核记录 hash。 |

### 五、窄复核结论与未解决项

- **结论：仍需修订（窄修）**。F1、F3–F9、F11、F12 已关闭；F2/F10/F13 的残留集中在 F14（must-fix，INV-5 与 demo 口径矛盾）、F15（general，N20 predicate/验收口径不一致）、F16（general，标题/版本自洽）；F17 为建议同批处理的残留一致性。完成 F14–F16（建议连 F17）后，可再按受影响部分窄复核 INV-5、N20、标题与残留引用，预计不改变 P1 的核心推荐与范围。
- 未解决/待客户决定（不变）：Q2（受控 shell/具名 native 例外）、Q3（foreign MCP）、Q5（下游仓库初始化门）、Q6/Q8（新共享根/共享规则/S1-S2/目录路径）、Q9（阶段 1 门控角色边界/写集）、Q11（预算/Pi）、Q12（错误语义）、Q14（B1 与冻结标准）、Q15（阶段顺序）；Codex/Claude-Pi 严格度不对称已提升为 Q2 相关确认点，建议保持客户可见。
- 限制：本轮只读核对 P1.1 受影响章节与 F1–F13 处置；未运行测试/真实模型；未验证 WebSearch、foreign MCP、run_shell 的运行时构造细节；F15 的结论依赖门模块最终分支实现，B1 应给出可执行负例。
- 本记录在本窄复核追加前的 SHA-256 为 `6e83da55bf24895663db153664b18cfb0e8c049dac06bcdc812d43926a9b3454`（93 行/26110 bytes，复核对象 P1）；追加后的记录 hash 由复核者在交付时复算并报告；方案 §13.1 与沟通引用应使用追加后的新 hash。

## 最终窄复核记录（P1.1 → P1.2，2026-11-07）

- 最终窄复核对象：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` **P1.2 草案**（2026-11-07；125752 bytes / 1061 行；SHA-256 `e39561a3b40add58f09c27be05d9cc3db90c84727afb6f88954fb8b0c83e7abc`）。P1.2 取代 P1.1（`c4a5eba4…`，1002 行）与 P1（`50a30ff8…`，944 行）。
- 范围：只核对窄复核 F14–F17 的关闭情况、客户三项决定的并入与语义漂移；不重复全文复核，未变化部分沿用前两轮结论。
- 结论：**仍需修订（窄修）**。F14–F17 已全部关闭；客户“受控 shell 全运行时”“阶段顺序 P1→P2→P3→P4”并入基本正确；但“Codex 新增应用中介路径”引入 2 处残留矛盾（F18 must-fix、F19 must-fix），以及 1 组验收/措辞建议（F20）。窄修 F18–F19（建议连 F20）后可再就这两处做一次窄复核，预计可转为“建议提交客户确认”。

### 一、版本与引用自洽

- 哈希/字节/行数与通知一致：`e39561a3…`、125752 bytes、1061 行；标题为“方案（P1.2）”；版本行写明“P1.2 取代 P1.1 `c4a5eba4…`（1002 行）与 P1 `50a30ff8…`（944 行）”，P1/P1.1 保留为历史版本。
- §13.1/§14 对复核记录的引用为当前 141 行 `829a19ac9f738127e7c28a4772ff9f0bc1cd262c1bd472c7449385d9eff28fd2`（完整复核对象 P1、窄复核对象 P1.1），与通知一致；本次最终窄复核追加后该 hash/行数将再次变化，沟通与后续版本应引用新值（F20d）。

### 二、F14–F17 关闭情况

| 发现 | 状态 | 核验 |
| --- | --- | --- |
| F14 INV-5 与 demo 矛盾（must-fix） | **关闭** | §3 INV-5（:205）已改为“demo 不走新应用中介路径，demo 严格路径现状不变（整体拒绝另议 Q1，见 N13）”，删除“demo runtime 继续拒绝”；与 §4.4 demo 口径、N13、Q1 一致。grep 未发现残留“demo runtime 继续拒绝”。 |
| F15 双路径 predicate/验收不一致（general） | **关闭** | §4.4 新增运行时分支（claude/pi 只走受限；codex 先严格、严格不成立且 native 绑定才走受限；demo 只走严格；其它拒绝）；严格路径新增 `applicationMediation === undefined`（:357）；受限路径要求 `status === "unknown"` + `applicationMediation.status === "verified"` + Codex native 绑定（:370-390）；N20 与分支语义一致（observed+verified → 拒绝；包装层也只在 status !== observed 时构造）。 |
| F16 标题/版本自洽（general） | **关闭** | 标题改为“方案（P1.2）”；版本行/取代说明自洽；§13.1/§14 引用更新。 |
| F17 残留一致性（suggestion） | **关闭** | §6.1 已 `313-572`（:502）；§9 依赖说明回链 Q9（:789）；§4.4 包装层列表回链 reason 白名单（:399、:411）；§13.1/§14 hash 更新。 |

### 三、客户三项决定并入核验

| 客户决定 | 并入情况 | 核验 |
| --- | --- | --- |
| 1. 受控 shell 全运行时（含 Codex 应用中介路径、严格路径逐字不变、写/发布门仍 strict observed） | **主体并入，但不变量表残留矛盾（F18）** | §0.4/§1.4 G1/G2/G7/§2.1/§2.5/§4.4/§4.6/§5.2/§5.3/§11.1 P6/N16/§13.2 均已加入 Codex 应用中介路径：Codex 因 `appTools` 含 shell 给 unknown 时，native 事实存在且绑定、应用面事实一致则走受限路径；严格路径原条件保留；写/发布门仍只接受 `status observed`（INV-2/§4.4/§5.3/§13.2 均写明）。但 §3 INV-6 仍写“Codex 永不使用应用中介路径”且强制点为 `runtime ∈ {claude,pi}`，与上述新增路径直接矛盾（F18）。 |
| 2. 允许已配置外来 MCP（精确枚举、漂移拒绝） | **Claude/Pi 已并入；Codex 口径自相矛盾（F19）** | §4.4/§5.3/§11.1 N26 已写“已配置外来 MCP 允许，精确枚举，未枚举/隐藏/漂移拒绝”；P7 明确 Claude/Pi 非空可过。但 §5.2 Codex 行写“Codex 应用面 `foreignMcpServers: []`；配置外来 MCP 非空时与配置不一致 → 应用中介路径拒绝（Codex 当前不注册外来 MCP，fail-closed）”，而 §0.4/G7/P6/§13.2 决定 2 又写 Codex 因 shell/外来 MCP 走应用中介路径通过；§13.2 同时把“Codex foreignMcpServers 实际为空”列为待适配器测试确认。这是同一事项的双重口径（F19）。 |
| 3. 先重构后角色上岗（P1→P2→P3→P4） | **已并入，无漂移** | §9 阶段表改为 P1 派发门修复+真实重跑 → P2 代码重构（模块化，不启动角色上岗）→ P3 8 角色上岗 → P4 终验；§9 依赖说明、Q9/Q10/Q15、§11.3 R7、§13.2 决定 3 一致；P1/P2 由现有 owner 按 Q9 临时写集或 D-minimal 实施。 |

### 四、其他语义漂移检查

- **Q/O 编号**：Q1–Q15、O1–O8 保持，无重编号；Q2/Q3/Q9/Q10/Q15 已按客户决定更新。
- **范围**：A + 有界 D、六角色模块化、8 个开发侧 worker、产品内置六角色不扩张、不建 DSL 均未变；Codex 应用中介路径是客户决定 1 带来的**显式范围新增**，已在 G7/R11/§13.2 披露，不是暗改。
- **T3**：§10 仍为 T3，依据不变。
- **不变量**：INV-1–INV-12 编号未变；INV-5 已修正；**INV-6 未随 Codex 应用中介路径更新（F18）**；INV-1 仅写 Claude/Pi（Codex 应用中介路径的 status/nativeToolRegistry 同样保持 unknown，建议补充，F20c）。
- **术语**：“开发侧 worker（代码维护角色）”与产品内置角色区分保持一致；未发现新的混用。
- **阶段 1/2+ 划分**：客户决定 3 将阶段改为 P1–P4，属于已披露的客户决定，不是未披露漂移；P1 仍只做最小门模块种子。

### 五、最终窄复核新增发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F18 | 漏重点（安全不变量/客户决定） | **must-fix** | §3 INV-6（:206）；§4.4 运行时分支（:344-348） | INV-6 仍写“Codex 严格路径逐字不变：只有 `status === "observed"` 可通过；**Codex 永不使用应用中介路径**”，强制点仍写“分支条件 `runtime ∈ {claude,pi}` 且 native 路径优先”。这与 P1.2 的客户决定 1、§4.4 的 Codex 分支（先严格、严格不成立且 native 绑定则走受限应用中介）、G7/P6/N16/§13.2 直接矛盾。若实现/验收按 INV-6，Codex 应用中介路径将不会实现或被判失败。 | P1.2 §3 vs §4.4/G7/P6/N16/§13.2；客户决定 1。 | 将 INV-6 改为：“Codex 严格路径原条件逐字保留、`status: "observed"` 定义不放宽；Codex 在严格路径不成立且 native 事实存在/绑定时可走受限应用中介路径（仅派发/controller resume），写/发布门仍只接受 strict observed”；强制点改为 §4.4 的四分支。 |
| F19 | 漏重点（客户决定/验收一致性） | **must-fix** | §5.2 Codex 行（:457）；§0.4（:40）；G7（:108）；P6（:827）；§13.2 决定 2（:1012-1014） | 外来 MCP（客户决定 2）在 Codex 上存在双重口径：§5.2 说 Codex 应用面 `foreignMcpServers: []`，配置外来 MCP 非空即与配置不一致 → 应用中介路径拒绝（Codex 当前不注册外来 MCP，fail-closed）；§0.4/G7/P6/§13.2 又说 Codex 因 shell/已配置外来 MCP 走应用中介路径通过；§13.2 同时把“Codex foreignMcpServers 实际为空”列为待适配器测试确认。P6 作为正向验收项与 §5.2 的设计直接冲突。 | P1.2 §5.2 vs §0.4/G7/P6/§13.2；客户决定 2。 | 二选一并写清：(a) 若 Codex 不支持外来 MCP，将 P6/G7/§0.4/§13.2 限定为“Codex 受控 shell；外来 MCP 仅 Claude/Pi（P7）”，Codex 配置外来 MCP 时 fail-closed，并作为客户可见限制确认；(b) 若要求 Codex 也支持，需在 Codex `inspectApplicationToolSurface` 精确枚举实际 MCP 并补 P6/N26 正负例与适配器测试，不能保留“foreignMcpServers 实际为空”的假设。 |
| F20 | 漏重点（验收/措辞一致性） | suggestion | §11.1 标题（:830）；§4.6/§13.2“严格路径逐字不变”；INV-1；§13.1/§14 | (a) §11.1 标题仍为“负向（全部仍拒绝）”，但 N16、N26 明确描述“应用中介路径可通过/精确枚举非空不拒绝”，与标题矛盾；(b) §4.6/§13.2 称严格路径“逐字不变”，但 §4.4 已新增 `applicationMediation === undefined` guard——建议表述为“原条件逐字保留 + 新字段互斥 guard（不改变诚实会话行为）”；(c) INV-1 只写 Claude/Pi，建议补 Codex 应用中介路径的 status/nativeToolRegistry 同样保持 unknown；(d) 本次追加后复核记录 hash 将变化，§13.1/§14 应在下一版或沟通材料中更新。 | P1.2 对应行；本记录本次追加。 | 将 §11.1 标题改为“负向与边界行为（非全部拒绝）”或把 N16/N26 拆到“严格路径/精确枚举边界”小节；统一“逐字不变”措辞；INV-1 补 Codex；更新复核记录引用。 |

### 六、最终窄复核结论与未解决项

- **结论：仍需修订（窄修）**。F14–F17 已全部关闭；客户决定 3（阶段顺序）无漂移；客户决定 1/2 的主体设计已并入，但 INV-6（F18）与 Codex 外来 MCP 口径（F19）是**必须窄修**的残留矛盾，否则 B1/实现会分别与客户决定 1/2 冲突。F20 为验收结构与措辞建议，建议同批处理。
- 完成 F18–F19（建议连 F20）后，只需再窄复核 INV-6、§5.2/P6/G7/§13.2 的 Codex 外来 MCP 口径与 §11.1 标题/引用，预计可转为“建议提交客户确认”；不需要重新全文复核。
- 未解决/待客户确认（P1.2 更新）：Q2 残留（Codex 应用中介路径行为新增是否接受、WebSearch 具名例外）、Q3 残留（外来 MCP 精确枚举负例；Codex 是否支持外来 MCP）、Q5（下游仓库初始化门）、Q6/Q8（新共享根/共享规则/S1-S2/目录路径）、Q9（P1/P2 临时 owner 与写集授权）、Q11（预算/Pi）、Q12（错误语义）、Q14（B1 与冻结标准）、Q15（是否接受 P1 先于 P2）。Codex/Claude-Pi 严格度不对称与 Codex 应用中介路径的行为新增应保持客户可见。
- 限制：只读核对 P1.2 受影响章节与客户决定并入；未运行测试/真实模型；未验证 Codex 是否实际支持外来 MCP（F19 取决于该事实与客户意图）；F18/F19 的修复不改变 P1.2 的核心推荐与阶段顺序。

## 闸门 1 前最终核对记录（P1.2 → P1.3，2026-11-07）

- 核对对象：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` **P1.3 草案**（2026-11-07；131607 bytes / 1075 行；SHA-256 `6985ff7ed4a9149228fb6e5af0993c1fcfa56318b541c00dad0cf53745ebec0b`）。P1.3 取代 P1.2（`e39561a3…`，1061 行）、P1.1（`c4a5eba4…`，1002 行）与 P1（`50a30ff8…`，944 行）。
- 范围：只核对 F18–F20 的关闭情况、Codex 外来 MCP 事实与全文口径、标题/引用；不重复全文复核，未变化部分沿用前三轮结论。
- 结论：**建议提交客户确认**。F18–F20 均已关闭；仅余 3 项不影响客户决策/验收实质的文档精度项（F21–F23，均 suggestion），建议随闸门 1 材料一并修正，不构成再次修订的阻断。

### 一、版本与引用

- 哈希/字节/行数与通知一致：`6985ff7e…`、131607 bytes、1075 行；标题为“方案（P1.3）”；版本行写明 P1.3 取代 P1.2/P1.1/P1，历史版本保留。
- §13.1/§13.2/§14 对复核记录的引用为当前 194 行 / `a9e7952d73b16ee7c6948477dc9adddf0cc66b3a5bb6ed3ad0d52fb6d52400ee`（完整复核 P1、窄复核 P1.1、最终窄复核 P1.2），与通知一致；本次核对追加后该 hash/行数将变化（F23 提醒沟通引用新值）。

### 二、F18–F20 关闭情况

| 发现 | 状态 | 核验 |
| --- | --- | --- |
| F18 INV-6 与新 Codex 路径矛盾（must-fix） | **关闭** | §3 INV-6（:206）已改为“Codex 严格路径原条件逐字保留、`status: "observed"` 定义不放宽；严格路径不成立且 native 事实存在/绑定时可走受限应用中介路径（仅派发/controller resume）；写/发布门仍只接受 strict observed”；强制点改为“§4.4 运行时四分支（claude/pi/codex/demo）+ 严格路径 `applicationMediation === undefined`”；INV-1（:201）已补“Claude/Pi 及 Codex 应用中介路径的 status/nativeToolRegistry 永远保持 unknown”。与 §4.4/G7/P6/N16/§13.2 一致。 |
| F19 Codex 外来 MCP 双重口径（must-fix） | **关闭（结论正确；1 处行号引用待修）** | 只读核实三组代码事实：`provider/codex/session.ts:546` 在 `wireApi === "chat"` 分支对非空 `installedServers` 构造期抛 “Codex chat transport does not support installed MCP servers”（精确）；`prepareCodexRuntimeAdapter` 对非空 MCP 置 `native-plan-mcp-unproven`（实际 `:430`，方案 §4.6/§13.2/§13.3 写作 `:432`，见 F21）并封存 `installedMcpServers: []`（`:437`，精确）；`chat-transport.ts:18` 注释“不实现原生 MCP…”与 `:267` “There is no MCP connection…”（精确）。结论“Codex chat 传输不支持外来 MCP、配置即 fail-closed”成立；默认 app-server 路径虽可配置 MCP，但无 `inspectNativeToolSurface`，不属于本证据路径。全文已统一：§0.4/G1/G2/G7/§4.4 分支/§4.6/§5.2/§5.3/§11.1 P6/P7/N26/N28/§13.2/Q3 均限定“Codex 受控 shell；外来 MCP 仅 Claude/Pi，Codex 配置即 fail-closed（N28）”。 |
| F20 验收/措辞/引用（suggestion） | **关闭** | 标题“方案（P1.3）”；§11.1 标题改为“负向与边界（拒绝项；N16/N26 的通过例外见 P6/P7，勿把‘允许情形’误读为拒绝）”；“严格路径逐字不变”统一为“原条件逐字保留 + 新字段互斥 guard”（§0.4/G2/§4.6/§5.3/INV-6/P3）；INV-1 补 Codex 应用中介路径 unknown；§13.1/§13.2/§14 引用 194 行 / `a9e7952d…`。 |

### 三、Codex 外来 MCP 事实核验（独立复算）

| 项 | 方案引用 | 实际核对 | 结论 |
| --- | --- | --- | --- |
| chat 传输构造期抛错 | `provider/codex/session.ts:546` | `:546` `if (installedServers.length > 0) throw new Error("Codex chat transport does not support installed MCP servers")`；位于 `:545` `if (config.wireApi === "chat")` 内 | 精确 |
| native plan 标记 MCP 未证明 | `prepareCodexRuntimeAdapter:432` | 函数自 `:406` 起；`:430` `if (resolved.installedServers.length) reasons.push("native-plan-mcp-unproven")`；`:432` 是 `native-plan-custom-transport-unproven` | 结论正确；行号应为 `:430`（F21） |
| 封存空 MCP 列表 | `:437` | `:437` `...(options.contextSections ? ... : {}), installedMcpServers: []` | 精确 |
| chat 传输无 MCP 连接 | `chat-transport.ts:18/267` | `:18` 注释“不实现原生 MCP、联网搜索、线程恢复与思考等级…chat 模式下结构性缺席”；`:267` “There is no MCP connection, native command dispatcher or fallback in runToolCall” | 精确 |

### 四、语义漂移检查

- Q1–Q15 / O1–O8 编号未变；T3 未变；A + 有界 D、六角色模块化、8 个开发侧 worker、产品内置六角色不扩张、不建 DSL 未变；术语“开发侧 worker ≠ 产品内置角色”一致。
- 阶段顺序 P1→P2→P3→P4（客户决定 3）在 §9/Q15/§13.2/§13.3/§11.3 R7 一致；P1/P2 由现有 owner 按 Q9 临时写集或 D-minimal 实施；无新漂移。
- 不变量：INV-1 已补 Codex 应用中介路径 unknown；INV-5 demo 口径保持；INV-6 已按客户决定 1 更新；INV-2 写/发布门 strict observed 保持。未发现新的不变量矛盾。
- 客户决定 1（shell 全运行时）：Codex 仅在严格路径不成立且 native 事实存在/绑定时走受限应用中介路径；严格路径原条件保留 + 新 guard；写/发布门仍 strict observed——并入正确。客户决定 2（外来 MCP）：Claude/Pi 精确枚举；Codex chat 不支持、配置即 fail-closed——并入正确。客户决定 3（先重构后角色上岗）：并入正确。

### 五、剩余项（均不阻断“建议提交客户确认”）

| 编号 | 严重度 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| F21 | suggestion | §4.6/§13.2/§13.3 的 `prepareCodexRuntimeAdapter:432` | 实际 `native-plan-mcp-unproven` 在 `:430`；`:432` 是 `native-plan-custom-transport-unproven`。结论不受影响，但行号引用不精确。 | 将 `:432` 改为 `:430`（或改为“函数 `:406` 起，`:430` 置 reason”）。 |
| F22 | suggestion | §4.4 shell/外来 MCP 政策 bullet（约 :417） | 该 bullet 写“已配置外来 MCP 允许”，未在句内限定 Claude/Pi；同节分支（:346）、§4.6、§5.2、§5.3、§11/N26/N28、§13.2 已明确 Codex fail-closed，设计不矛盾，但句内口径可更精确。 | 改为“Claude/Pi 允许已配置外来 MCP；Codex chat 传输不支持，配置即 fail-closed（N28）”。 |
| F23 | suggestion（协调） | §13.1/§13.2/§14；复核记录 | 本次核对追加后复核记录 hash/行数变化；方案当前引用 194 行 / `a9e7952d…` 为追加前快照。 | 下一版或闸门 1 材料引用本次追加后的新 hash（由复核者交付时报告）；不改变方案实质。 |

### 六、最终核对结论

- **建议提交客户确认**。F1–F20 的实质发现均已关闭或在当前版本解决；F21–F23 为文档精度/引用协调项，不影响客户决策、验收基线或安全不变量，建议随闸门 1 材料一并修正。方案核心推荐（A + 有界 D、六角色模块化、8 个开发侧 worker、产品内置角色不扩张、T3、写/发布门不放宽）与客户决定 1/2/3 的并入一致。
- 仍需客户在闸门 1 确认的事项（不变）：Q2 残留（Codex 应用中介路径行为新增是否接受、WebSearch 具名例外）、Q3 残留（Claude/Pi 外来 MCP 精确枚举负例、Codex 外来 MCP fail-closed 限制是否接受）、Q5（下游仓库初始化门是否另立变更）、Q6/Q8（新共享根/共享规则/S1-S2/目录路径）、Q9（P1/P2 临时 owner 与写集授权）、Q11（真实运行预算/Pi 是否必测）、Q12（错误语义/诊断）、Q14（B1 与冻结标准）、Q15（确认 P1 先于 P2；替代顺序）。Codex/Claude-Pi 严格度不对称与 Codex 应用中介路径的行为新增应保持客户可见。
- 限制：本轮只读核对 P1.3 受影响章节、Codex 外来 MCP 代码事实与全文口径；未运行测试/真实模型；未验证默认 app-server 路径的 MCP 运行时行为（其不属于本证据路径）。复核只作建议，不是批准、验收、客户闸门或实施授权。

## P1.5 窄复核记录（E 路线、死代码清理与引用，2026-11-07）

- 复核对象：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` **P1.5 草案**（2026-11-07；157519 bytes / 1227 行；SHA-256 `c883ce31a9da6c06aad69d26f87626001720eee8021100d1c92bde56236e8ad5`）。通知中的 P1.4 `c9c36ba2…`（1204 行）在复核期间已被 P1.5 取代；P1.4 未单独形成复核节，其 E 骨架与 F21–F23 内容并入 P1.5 一并核对。
- 范围：E' 路线（E0 契约冻结 → E1 并行开发 → E2 双轨/增量切换 → E3 测试贯穿）与死代码清理要求的自洽性/可执行性；Q16/Q17/Q18、D9/E-A10；清理边界防误删；既有不变量与客户决定无漂移；版本/引用自洽。
- 结论：**建议提交客户确认**。E' 路线与死代码清理主体自洽、可执行；无 must-fix；仅余 1 项 general 措辞澄清（F25）与 3 项 suggestion（F24/F26/F27），均不改变设计、验收基线或安全不变量，建议随闸门 1 材料/团队计划一并修正。

### 一、E' 路线自洽性与可执行性

| 要求 | 方案位置 | 核验 |
| --- | --- | --- |
| E0 契约冻结 | §9.1（:824-839）、§13.4、Q17 | 覆盖 8 模块边界/public API（六角色+共享+门控）、§6.2 角色契约细化、共享/门控契约、错误语义、依赖方向、写集/owner、行为/测试基线、冻结记录（路径/版本/sha256/评审/消费者）；E0 出口 = 契约冻结评审 + B1（契约）可判；未冻结不得 E1。可执行。 |
| E1 8 角色并行 greenfield | §9.2（:841-845）、§13.4 | 契约冻结后角色上岗；旧代码只修阻断缺陷、不新增行为；新逻辑只进新模块；共享/门控单一 owner；角色模块间零 import；接口变更走 E0 评审。与 INV-12/行为不变一致。 |
| E2 影子/双轨 + 增量切换 | §9.3（:847-851）、§8.6、E-A3/A4 | 按模块/门逐个切换；桥接/feature flag + 旧/新双跑差分 + 切换 gate + 回滚开关；切换前等价证明；旧代码在切换成功且回滚演练通过前保持可用；禁止一次性替换；切换后删除旧实现。可执行。 |
| E3 测试贯穿/终验 | §9.3、§12.5、E-A5/A8 | 契约测试、模块单测、差分双跑、集成、真实运行按里程碑；终验全量回归 + 门禁负例 + D1–D9 + 真实运行证据；不把测试留到替换后。可执行。 |
| E' 验收 | §11.6（:984-999） | E-A1（契约冻结）、E-A2（并行/写集/零 import/旧代码冻结）、E-A3（等价）、E-A4（增量切换/回滚/删除旧实现）、E-A5（测试贯穿）、E-A6（8 角色边界）、E-A7（P1 关系）、E-A8（终验 D1–D9）、E-A9（拒绝一次性替换）、E-A10（死代码清理）齐备。 |
| P1 与 E' 关系 | §9.3（P1 关系）、§9.5、Q15/Q16 | P1 派发门修复为真实闭环可验证的最小前置；两种衔接 (a) P1 先修 → E0/E1/E2/E3；(b) E0 门控契约 + P1 作为 E1 首个门控切片；真实重跑早于大规模切换。与 Q15/Q16 一致。 |

### 二、死代码清理要求的自洽性与可执行性

| 要求 | 方案位置 | 核验 |
| --- | --- | --- |
| E2 切换即删除 | §8.6（:815）、E-A4 | 每模块切换成功并验证（等价 + 回滚演练）后立即删除被替换旧实现/门面/符号；切换前保留旧实现用于回切；不得长期双份。 |
| E3 终验清理 | §8.6（:817）、§9.3、§12.5、E-A8/A10 | TS Compiler API 使用/导出扫描 + 构建 + 全量测试，证明旧实现不存在、零未使用导出、零重复实现；被删除文件/符号清单入变更包；Git 历史保留。 |
| 清理边界防误删 | §8.6（:816）、Q18（:1063）、D9（:980）、E-A10（:999）、R16 | 只清理本变更导致不再使用的代码；与本变更无关的历史功能/依赖不删；动态加载/字符串引用/外部入口/跨仓引用等不确定项列「待确认」并报告，不盲删；Git 历史保留旧实现。边界完整，防误删设计成立。 |
| 验收与选装 | §11.4 D9、§11.6 E-A10、Q18、O12 | D9/E-A10 为验收失败条件；O12 为扫描脚本选装（默认建议 E3 实施）；Q18 待客户确认边界。可执行。 |

### 三、Q/O 编号与可执行性

- Q1–Q18、O1–O12 连续，无重号/缺号；Q16（E' vs 一次性替换）、Q17（契约冻结产物/审批）、Q18（死代码清理边界）、O9（冻结记录模板）、O10（双跑/开关/回滚基建）、O11（分模块影子期）、O12（死代码/使用扫描脚本）均在 §13；与 §9/§11.6/§12.5 交叉引用一致。
- Q9（E0/E1 写集与临时 owner）、Q10（角色 E0 后上岗）、Q15（E0→E1→E2→E3 与 P1 并行/前置）已按 E 骨架更新；Q16/Q17/Q18 为新增待确认项。

### 四、既有决定与不变量无漂移

- 受控 shell 全运行时（含 Codex 受限应用中介路径）：§4.4/§11 P6/N16/§13.2 未变；写/发布门仍 strict observed。
- 外来 MCP 精确枚举 + Codex fail-closed：§4.4/§5.3/N26/N28/§13.2 未变；F22 已将 §4.4 policy bullet 限定为“Claude/Pi 允许…Codex fail-closed”。
- 契约冻结后并行开发（E 骨架）、开发侧 worker ≠ 产品内置角色、T3：§3/§9/§10/§7 未变；E' 是实施策略变化，已在 §2.6/§9/§13.4 披露。
- INV-1–INV-12 编号与主体未变；E-A3/E2 差分/全量回归支撑 INV-12；未发现新的不变量矛盾。

### 五、版本与引用

- P1.5 版本行自洽：标题“方案（P1.5）”；取代 P1.4 `c9c36ba2…`（1204 行）、P1.3 `6985ff7e…`（1075 行）、P1.2 `e39561a3…`（1061 行）、P1.1 `c4a5eba4…`（1002 行）与 P1 `50a30ff8…`（944 行）；版本历史表 P1–P1.5 连贯。
- 复核记录引用：方案第 3 行、§13.1（:1082）、§14（:1193）已更新为当前 244 行 / `9e455086…`；§13.2（:1119）与 §13.3（:1148）仍写“244 行 / **47334 bytes**”，而当前 244 行记录实际为 **55941 bytes**（hash/行数正确，byte 数陈旧）——F24。
- 方案第 3 行已预留“若复核者追加复核节，以最新 hash 为准”；本次追加后记录 hash 再次变化，闸门 1 材料应引用最新值（F24/交付回报）。

### 六、P1.5 剩余项

| 编号 | 严重度 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| F24 | suggestion | §13.2（:1119）、§13.3（:1148）、§14（:1193） | 复核记录引用为“244 行 / 47334 bytes / `9e455086…`”；行数/hash 正确，但 byte 数 47334 对应旧 194 行记录，当前 244 行记录为 55941 bytes。 | 改为 244 行 / 55941 bytes / `9e455086…`（或统一写“当前复核记录，hash 以沟通留痕为准”）；本次追加后再更新为最新 hash。 |
| F25 | general（措辞澄清） | §9.4（:857） | “E 与 P1→P2→P3→P4 是实施策略二选一，不同时执行”与 E' 主计划包含 P1（§9.3/§9.5/Q15/Q16：P1 为共同前置或 E1 首个门控切片）不一致；字面可被读成 E 不含 P1。 | 改为“E 与 P2→P3→P4（模块化部分）二选一；P1 为两者共同前置/E1 切片，不与 E 互斥”。 |
| F26 | suggestion | §9.2（:843）、§13.4、§2.6 | E1 称“8 个角色并行开发新模块（greenfield）”，但第 7 位共享角色维护的 `src/common/shared/` 是既有模块（i18n/ledger/path 等），不是 greenfield；其 E1 工作更接近契约迁移/既有共享代码维护，E2/D9 同样适用。 | 明确“六角色模块 + 门控模块为 greenfield；共享模块角色在既有 `src/common/shared/` 上按 E0 契约维护/迁移，遵循 E2 增量切换与 D9 清理规则”。 |
| F27 | suggestion | D9（:980）、E-A10（:999）、§12.5 | D9/E-A10 要求“扫描零未使用导出”，未在验收句中限定扫描范围；Q18/E-A10 的边界是“只清理本变更导致不再使用的代码”，但全仓“零未使用导出”可能误报与本变更无关的历史导出。 | 在 D9/E-A10 明确扫描范围为“被替换旧实现/本变更导致不再使用的代码”；无关历史导出列为「待确认」不删，避免误删。 |

### 七、结论与未解决项

- **建议提交客户确认**。E' 路线（E0 契约冻结 → E1 并行 greenfield → E2 双轨/增量切换 → E3 测试贯穿）与死代码清理（D9/E-A10/Q18/O12）主体自洽、可执行，清理边界防误删设计成立；既有 shell/外来 MCP/Codex 严格路径/写发布门/T3/术语/开发侧 worker 口径无漂移。F25 为 general 措辞澄清（§9.4 二选一表述），建议在闸门 1 材料/团队计划前修正；F24/F26/F27 为 suggestion。无 must-fix，不构成再次修订的阻断。
- 版本/过程：通知的 P1.4 `c9c36ba2…` 在复核期间被 P1.5 `c883ce31…` 取代；P1.4 未单独形成复核节，本 P1.5 节覆盖其 E 骨架与 F21–F23。若作者再修改 P1.5（含 F24–F27 或新增内容），应按受影响部分再核对，并以最终候选 hash 作为闸门 1 材料。
- 未解决/待客户确认（不变）：Q2 残留（Codex 应用中介路径、WebSearch 例外）、Q3 残留（外来 MCP 精确枚举负例、Codex fail-closed 限制）、Q5、Q6/Q8、Q9、Q11、Q12、Q14、Q15、Q16、Q17、Q18。预授权/全权委托记录在沟通侧，本复核不改变其边界；复核只作建议，不是批准/验收/客户闸门/实施授权。
- 限制：只读核对 P1.5 受影响章节、E'/清理/Q/O/引用；未运行测试/真实模型；未验证 TS Compiler API 扫描脚本的实际实现（O12）与全仓扫描误报率；F25/F27 为文本/验收口径层面，需作者裁量。

---

本记录只作建议，不是批准、通过、验收、客户闸门或实施授权；不替代闸门 1/2，不构成验收基线。
