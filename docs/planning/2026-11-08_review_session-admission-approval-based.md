# 会话创建准入改为「按操作审批」+ Git 只读/专属命令放行方案复核记录

- 复核对象：`docs/planning/2026-11-08_design_session-admission-approval-based.md`（版本 **P1.0 草案**，日期 2026-11-08；752 行；SHA-256 `20fe82ef9b0c83674753c4f246579d52758306de040b2a7f8157ff95b59f0202`；本记录按该快照只读核对，复核期间未发现方案变化）。
- 再复核对象：同一方案 **P1.1 草案**（2026-11-08；828 行；SHA-256 `720cfbc67728376aea85f5022f7f1447c3369cc9f7d286941a16fbb28b7c676b`；取代 P1.0 `20fe82ef…`；受影响部分窄复核见文末「再复核记录（P1.0 → P1.1）」）。
- 最终核对对象：同一方案 **P1.2 草案**（2026-11-08；844 行；SHA-256 `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`；取代 P1.1 `720cfbc6…`；最终窄核对见文末「最终窄核对（P1.1 → P1.2）」）。
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：跨运行时核心/Pipeline/门禁引擎/运行时 Provider/桌面多模块；新增共享件与创建准入证据契约；涉及审批、审计、权限与角色边界语义；另有 14 个待确认问题与 12 个选装，不满足轻量条件）。
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；不继承作者对话；只读方案、闸门 0、代码、测试与已合并契约；只写本复核记录）。
- 闸门 0 记录：`docs/communication/2026-11-08_intent_session-admission-approval-based.md`（43 行，SHA-256 `51918bc90b25691659aa515bfd475c953e5facb356bc343c2e05e594d779c108`；含 2026-11-08 客户补充规格「git 命令只读放行，每个角色的专属git 命令放行」；方案引用一致）。
- 触发证据：`角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md`（213 行，SHA-256 `c47198f79572b2ab834d28fa44d5b756c6c9fa21a040d4bb5341fa16a204c06e`；方案引用一致；§6.3/§6.4 原文核对一致）。
- 已合并变更基线：PR #72 merge `c06942530f80e5cb394246dcb82e0ab3ad2d781f`（`Merge pull request #72 …`，本检出存在）；P1.6 方案 `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce`；E0.3 冻结契约 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`；冻结记录 `5439d7c35deb984862ea41204551d1f498c665e9b6f5ab84939db8104b551a07`（均按本检出复算一致）。
- 代码基线：worktree `trunk-amendment`，HEAD `a1b2f66`；工作树含 T1（Claude schema 窄修复）未提交差异（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`），方案声明只读引用、不在其写集，属实。本文行号按该快照核对；实施仍应以符号名与文本锚点为准。
- 复核日期：2026-11-08。
- 说明：复核只作**建议**，不是批准、通过、验收、客户闸门或实施授权，也不替代闸门 1/2；复核无阻断权。作者处置权与不采纳权按复核规则 §9。本记录按调用方指定位置写入 `docs/planning/`（与本仓库既有 8 份 `docs/planning/*_review_*.md` 先例一致；复核规则 §2 所列项目本地覆盖路径 `角色卡/策划/docs/design/` 在本检出不存在，见「限制」）。

## 独立核对过的关键事实（只读）

- 创建准入现状（方案 F1–F12 基本属实）：`readCoreProtectionScope`（`src/service/runtime/session.ts:230-240`，缺失/异常/非法形状 → `unknown`）；`hasUnconfinedScriptTools`（`:242`）；`ensureAdapter`（`:538-555`，`unknown` 或 `required && !nativePreparation && runtime !== "demo"` → `runtime-protected-scope-requires-verified-plan`，`:546` 再拒 shell）；`verifyScope`（`:556-562`，`:559` 再拒 shell）；`prepareNative`（`:570-585`，`:574` 仅 `default-production && codex` 且未构造 adapter 时准备，其余恒 `undefined`）；`prepareRole`（`:1156-1200`，`:1160` shell 拒因、`:1162` custom/demo 拒因、`:1163-1185` native 投影与三类 native reason、`:1187-1200` 空 reasons 才发 token）；`core.composeContext`/`core.bindRole`（`:1132-1155`，required 无 token → `runtime-protected-scope-requires-verified-plan`）；`bindPreparedRole`（`:1202-1219`，`:1214` 再拒 shell）；`bindRole` 的 native 绑定核对（`:602-630`）；`inspectToolSurface`（`:824-896`，`:855-856` shell → `unmediated-execution-registered`，`:869/881-883` strict `status` 语义）；`composeRuntimeApplicationMediation`（`:281-314`，PR #72 条件逐条核对）。
- 下游创建门（方案 F11/F12 属实）：`bindPreparedRuntimeRole`（`src/pipeline/orchestration/run-role.ts:726-747`）在 `:731-733` 对 `prepared.plan.native?.appTools` 含 shell 抛 `runtime-protected-scope-unmediated-app-execution-planned`；`:734-740` token+observed 才 bind，非 `unmanaged` 抛 `runtime-creation-admission-unproven:<reasons>`；`openRoleSession` 经它建会话并记 `session.open.failed`（`:2109-2116`）。
- shell 审批链现状（方案 A1–A13 属实）：`assembleProjectShellGate`（`src/pipeline/orchestration/shell-arming.ts:150-218`，`advisoryRuleset` 缺省 true `:216`，审计 sink 入参 `:205`）；`assembleReadonlyShellGate`（`:263-305`）；`assembleOperatorShellGate`（`:356-407`，`operatorOnly:true`+`approveDeny:true`）；arm 分派（`run-role.ts:1801-1852`，能力位 `shell:"operator-approve"` 守卫 `:1808-1811`）；能力注入（`:2093-2099, 3528-3536`）；桌面通道（`app/desktop/session.ts:3941-3992`，`app/main.ts:790-807`）；`createShellGate` 构造期互斥/通道守卫（`src/common/编排/shell-gate.ts:502-536`）；判定链（`:595-933`：classifier 缺失/规则失败拒绝 → preblock `:635-653` → writeGuard deny/script `:655-676` → classify `:679-689` → deny 指令 `:710-716` → script 分支 `:720-801` → c=allow `:803-841` → grant `:846-854` → allow 指令 `:859-869` → advisory `runA` `:873-884` → operatorOnly `runA` `:888-902` → c=deny 硬拒 `:903-910` → readonly 拒 `:911-928` → `runBA` `:929-933`）；(b) `runB`（`:990-1034`）、(a) `runA`（`:1035-1114`）；超时包装（`:1116-1132`）；审计（`:1134-1218`，审计失败不改判定，`entry` 已存在 `:1179`、`ShellAuditRecord` 字段 `src/common/编排/shell-audit.ts:103-125`、`ShellAuditSink` 仅 `append` `:133-136`、`createFileAuditSink` 的 `activeGate` 与 F-6-1 refresh `:149-222`、`createMemoryAuditSink` `:224-234`）。
- 工具注册与执行（方案 F16/F17/A13 属实）：`buildGovernedTools` 未注入 `shellGate` ⇒ `run_shell` 不存在（`src/provider/runtime/tools.ts:5065-5098`）；`run_shell` 先 gate 后 `spawn(argv[0], …)`（`:1514-1600`，`:1355-1361` 为 PATH 解析的 `spawn`；F-7 守卫 `:1551-1555`）；`start_background_task` 同链（`:1676-1760`）；`request_shell_escalation` 注入才注册（`:5079-5085`）；schema 仅 `command`（`src/provider/runtime/schema.ts:122-133`）；后台管理器仅普通受治理会话注入（`session.ts:388-390`）。
- 升级通道（方案 A11 属实）：`escalationEligibility` 仅 `run_shell` + judge 主动 deny / retry-capped，硬地板排除（`src/common/编排/shell-escalation.ts:202-235`）；后台入口不写/不清除/不消费（`:307-344, 353-356`）；`DEFAULT_SHELL_ESCALATION_MAX_REQUESTS = 5`（`:56`）；回滚开关 `ANS_SHELL_ESCALATION_DISABLED`（`:21, 54`）。
- 判拒升级硬地板与 `shell-command-guard`（`inline-too-large` 2048B/10 行/单行 1024B；`unbounded-search`）与方案 §2.4.2 描述一致（`src/common/编排/shell-command-guard.ts:1-50`）。
- 门禁引擎现状：裸 Git 硬拒位于 `classifyShellDetailed` 第 2 步、**先于** hardDeny/denyTokens/risky/readonly（`src/common/门禁引擎/classify-shell.ts:1489-1492`）；`shell-write-guard` 在程序名处硬拒 git（`src/common/门禁引擎/shell-write-guard.ts:559-561`），该守卫在 shell-gate 内**先于**分类执行（`shell-gate.ts:655-676`）；默认 `readOnly` 的 git 条目为死数据（`classify-shell.ts:1643-1652`）；`risky:git-output-write`/`risky:git-write` 亦因裸 Git 硬拒不可达（`:1758-1773`）；`SHELL_RULES_VERSION = "3"`（`:1109`），规则集 id `ans-default-v3`（`:1792`）；`validateRules` 只认常量版本（`:1177-1202`）；`matchRoutineShellCommand` 经 `src/service/gate/shell-rules.ts:17` 公共出口同一引用。
- `shell-gate` 的 `branch` 恒为常量（`BRANCH_C_ALLOW = "c-allow"`，`shell-gate.ts:201`），ruleId 只出现在 `by`（`ruleset:<ruleId|rulesId>`，`:691`）；方案 §2.4.3/§4.2 要求审计 `branch: allow:readonly:git:<id>`，按现行代码不成立（见 F10）。
- 结构化 Git 与 ACL：`checkGitPolicy` query 分支要求 argv 精确模板、`readPaths` 覆盖路径、`readableOids` 覆盖 `target/other`（`classify-shell.ts:1056-1064`）；`gitQueryBody` 10 模板（`:188-203`）；`git_candidate`/`git_publish` 深层证明与初始化保护调用（`src/pipeline/orchestration/trunk-runtime.ts:212-274`，publish 仅 `delivery` 走 convener/actor 证明 `:250-261`，`documents` 直接 `service.publish` `:251`）；`inspectInitializationProtection` 对注册表**所有 active 条目**逐一要求 strict 证据（`trunk-runtime.ts:97-151`，`:112-119` 为 `git-core-creation-proof-unavailable`/`git-native-surface-unproven`）；只读 query 不经过该门（`createGitRoleRuntime` `:162-172`）；`readableOids` 的来源与限制（`src/service/trunk/impl/git-capabilities.ts:378-410`，verifier 绑定 review OID 且拒绝 `HEAD/live/default log`，历史读需 publication proof）。
- 工具层 Git ACL：`src/provider/runtime/tools.ts:4349-4356`（su/single/judge 拒；`init/integrate/revert` 仅 convener；`publish-documents` 四角色；`delivery` 仅 convener）；桌面为角色会话注入三能力（`app/desktop/session.ts:4306-4308`）；`git_query` 模板清单（`src/model/trunk.ts:476-478`）。
- 固定 Git 传输：`GIT_EXECUTABLE` 绝对路径（`src/provider/trunk/impl/git-command.ts:13`）；12 项固定 `-c` 与 `--no-pager --no-optional-locks --literal-pathspecs` 前缀（`:16-18`）；`executeGit` 重建 env（`:370-375`）、`spawn(executable,…)`（`:420`）；`createGitQueryPort` 模板（`:491-513`，`show` → `cat-file blob` `:501`）；`gitCommandArgv` 仅 impl 导出，`public/trunk-store.ts:45` 只导出 `createGitQueryPort` 等，未导出 `gitCommandArgv`/`executeGit`（见 F5）。
- 保护范围推导：`readGitHostProtectionRequirement`（`git-command.ts:525-569`，`:561` `everRequired` 不清除）。
- 桌面真实回合/Git 绑定（方案 K10 属实）：`inspectAssignedTask` 两处（`app/desktop/session.ts:9421-9448`）、任务带 `taskId` 打开（`:9429-9430`）、`delivery-target-open-failed`（`:9432`）；git 工具真实回合/assignment 复核与 run-stop fence（`:3648-3664`）。
- PR #72 契约边界：P1.6 INV-1/INV-2/INV-6（`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md:235-240`）；P1.6 §4.7/Q5 的「仓库初始化保护的应用中介证据」另案（`:469-472, 1051`）；本方案 §2.8 声明不改 `RuntimeSessionToolSurfaceFacts`/`inspectToolSurface`/`composeRuntimeApplicationMediation`/派发父门/controller resume，只读核对未发现与之冲突的设计。
- `plan.status` 消费者复核：全仓仅 `run-role.ts:734`（`prepared.plan.status === "observed"`）读取创建计划 `status`；方案「已核对现有消费者」属实。
- 既有确定性测试（本复核实际运行，非真实模型）：`node --test test/编排/shell-readonly.test.ts` → 8 pass / 1 fail（`只读档集成…` 断言 `git status` 放行失败，`:350-365`）；`node --test test/编排/shell-gate.test.ts` → `readonly 裁定 A…` 失败（`git status` 放行断言失败，`:884-914`）；`node --test test/门禁引擎/classify-shell.test.ts test/门禁引擎/shell-write-guard.test.ts test/门禁引擎/git-shell-acl.test.ts` → 101/101 pass。即：两组断言「git status allow」的编排用例在现状是**既有红**，本方案会使其转绿；方案 §4.5 未列（见 F6）。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 通过（附注） | 每项必做可对应 G1–G5 与 P1-RR 证据；「信任任意函数」被比较并否决；新增 WeakMap 绑定、audit probe、plan 字段均为目标所必需，不是为「以后可能」新增的抽象。附注：探针排除 refresh 的严格度（F4）与 O4 的选装定位（F10）可在修订中收紧。 |
| OD-2 必做与选装 | 通过（附注） | Q1–Q14 与 O1–O12 分节，选装均有理由/成本；未把选装默认勾选冒充批准。附注：§2.4.3 称「模型命令→执行体映射必须可审计」而 O4（canonicalArgv）为选装，存在必做/选装口径张力（F10）。 |
| OD-3 复用 | 发现 | 复用既有 shell-gate/escalation/guards/audit/升级/判断链属实（A1–A13 逐条核对），且明确「不新建第二份」。但规范 Git argv 体将出现第三份并存（`gitQueryBody`/`createGitQueryPort`/新 matcher），且 matcher 放置位置两说（F5/F13）；「复用」尚不彻底。 |
| OD-4 非目标 | 发现 | 非目标清楚（不开放无审批 shell、不放宽写/发布门、不改角色卡、不建 DSL、不改 PR #72）。但客户可见摘要 §0.3 未披露 Q9 限制（受保护项目 Git 写仍被拒；且该门为注册表级），与 §6.3/Q9 的如实披露不一致（F3）；只读 Git 的读取范围变化未按「范围决定」呈现（F1）。 |
| OD-5 被否决的备选 | 通过 | Q1/Q3/Q10/§2.3.1 对「裸 Git 全拒」「通用 spawn/显示=执行」「新增回切开关」「只要 shellGate 是函数」做了真实比较并给出代价；未发现编造备选。 |
| MK-1 目标 | 发现 | 目标可追溯到意图记录与 P1-RR 证据；事实/推断/设计候选/待确认标记基本清晰，引用行号多数精确。但头部「P1.6 Q5 另案即本变更修正版」的关系陈述与 §2.8/Q9/附录 B 矛盾（F9）；K4「仅」的消费者表述不准确（F11）；客户可见摘要缺 Q9 限制（F3）。 |
| MK-2 完整流程与失败分支 | 发现 | 创建→绑定→运行期审批/审计→执行后审计的流程与失败分支总体完整，未知/超时/通道不可用/audit 失败均有落点。但裸 Git 写「不受 (a) 影响」的机制归因错误（F2），只读 Git 的执行路由缺「新增公共固定传输出口」的明确设计（F5），审计探针在边界未接受/创世过渡下的失败分支未展开（F4）。 |
| MK-3 输入输出 | 发现 | 计划字段、binding 事实、审计/卡片加法字段与升级链输入输出有定义；但只读 Git 的审计字段（branch vs by/canonicalArgv）不自洽（F10），`ShellAuditSink` 的 kind/relPath 不可由 `createShellGate` 获知（F8）。 |
| MK-4 契约 | 发现 | 新增 `RuntimeCreationPlanFacts.approvalChain?`、binding 事实（source/version）、新 reason 表、审计/卡面加法均有契约章节，消费者与「不被写/发布门消费」边界写明；`plan.status` 语义限定明确。缺口：sink 接口扩展语义（F8）、trunk 公共出口（F5）、与 P1.6 Q5 关系（F9）。 |
| MK-5 完成标准 | 发现 | 正向/负向/真实运行 AC 覆盖广（受保护建会话、只读放行、非只读审批、角色 Git、未审批拒绝、伪造身份、参数级攻击、ACL 越权、PR #72 回归、后台入口）。缺口：AC-6 的审计字段按现行代码不可判（F10）；缺 Q9 边界负向 AC 与 approval-chain-changed AC；AC-12 的「若启用 Q4」使审计失败口径依赖选装（F15）。 |
| MK-6 风险与未决事项 | 发现 | T3 定档依据成立（治理/权限/审批语义 + 门禁引擎硬地板收窄 + 跨五角色共享契约）；R1–R6 如实。缺口：只读 Git 的读取范围/历史读取（F1）、注册表级 Q9 效应的范围（F3）、审计探针与验收前置（F4）、既有红/绿基线（F6）。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点（安全不变量/客户范围） | **重要（must-fix）** | §2.4.3 白名单与执行体；§2.4.4 对照；§0.3；Q1/Q2 | 只读 shell Git 绕过结构化 `git_query` 的**读取授权**：`git_query` 要求 OID 属于 `readableOids`（受控 ref/运行 basis/已发布候选/review 绑定；verifier 读被限定为 review 候选与冻结标准 OID，且明确拒绝 `HEAD/live/default log`），历史读还需 publication proof；而 shell 白名单允许任意完整 OID（`show <oid>:<path>`、`cat-file -p <oid>`、`merge-base`、`log <oid>`），且 `git log` 无目标时规范体默认 `--all`，可枚举全部 ref 历史。方案称「不放宽角色边界」，但未把这一读范围变化列为客户决定或限制。 | `classify-shell.ts:1056-1064`；`service/trunk/impl/git-capabilities.ts:378-410`；`git-command.ts:498-503`（log 无 target → `--all`）；方案 §2.4.3 表与 §2.4.4 | 二选一并写清：(a) 在 Q1/Q2/§0.3/§6.3 明确「shell 只读 Git 不受 `readableOids`/publication-proof 约束、可读全历史」，请客户确认；(b) 收紧 matcher/执行体（`log` 默认 `HEAD` 而非 `--all`；`show`/`cat-file -p` 的 OID 仅接受可解析到受控 ref/已发布候选；或把 `git_query` 的读取策略注入 matcher）。无论哪种，均须补参数级负例（`log --all`、任意历史 OID）与 AC。 |
| F2 | 漏重点（安全不变量/事实） | **重要（must-fix）** | §2.4.4 末条；§2.4.2 第 4 点；N6；AC-14 | 方案称「裸 Git 写硬拒…不受 advisory/operatorOnly 的 (a) 影响，因为 raw-git 判定先于审批分支」——**机制归因错误**：classifier 的裸 Git `deny` 在 `shell-gate` 内并不终结：advisory 模式下 `deny` 直接交 `runA`（客户可批准），operatorOnly+`approveDeny:true` 同样交 `runA`。生产上真正的硬地板是 **writeGuard 的程序名 deny**（先于分类执行）；本变更把 writeGuard 收窄为「matcher 命中且 run_shell → pass，其余 git 仍拒」。若某装配路径未注入 writeGuard，裸 Git 写会落入 (a) 审批。 | `shell-gate.ts:655-676, 873-902`；`shell-write-guard.ts:559-561`；`run-role.ts:1814, 1844` | 修正 §2.4.4/§2.4.2 文字：明确「裸 Git 写硬拒由 writeGuard 保证，所有生产装配路径必须注入 writeGuard」为不变量；补两条回归：advisory/operator 模式下无 writeGuard 时不得声称 git 写被硬拒（或改为在 classifier 层引入 advisory 也不消费的 deny 类别）；AC-14 增加 advisory 模式下 `git commit` 负例与 writeGuard 注入断言。 |
| F3 | 漏重点（客户可见范围） | 一般（general） | §0.3；Q9；§2.4.4 | 客户可见结果 §0.3 写「Git 写/发布只走角色专属结构化能力…越权仍拒绝」，未披露 Q9：受保护项目中角色会话的 Git 写/初始化**很可能仍被既有 `inspectInitializationProtection` 拒绝**。且该门对进程内**所有 active Core 条目**逐一要求 strict `status:"observed"`+native（不只作用者自身），因此本方案放开的 Claude/Pi 会话（含无 shell 的 judge/pm）本身就会使 Git 写门在注册表层面不可满足。 | `trunk-runtime.ts:97-151`（`:112-119`）；方案 §6.3/Q9 | 在 §0.3 增加一行明确限制；Q9 补充「注册表级」效应，避免客户把闸门 1 确认读成「受保护项目 Git 写可用」。 |
| F4 | 漏重点（可行性/验收可检查性） | 一般（general） | §2.3.1 审计探针；§6.2 step 2；AC-23 | 探针刻意排除 F-6-1 `refreshGate`（初始判定失败即 fail-closed），比运行期审计路径更严：会话若在创世过渡/边界尚未接受时打开，运行期 append 本可通过 refresh 重试成功，但探针必失败 ⇒ 受保护+shell 会话不可创建，可能使 AC-23 的主场景不可达；审计边界还依赖治理边界解析（`NO_AUDIT_BOUNDARY`/single 模型下 `docs/audit/` 可写性未在方案中核对）。 | `shell-audit.ts:149-222`（refresh 重试）；`shell-arming.ts:420-431, 440-460`；方案 §2.3.1 | 在 §6.2 增加「审计门禁预检」前置并把边界接受状态记为环境事实；或允许探针使用同一 refresh 重试一次（仍是纯判定、不写盘）并说明与运行期语义一致；若维持现状，把「会话打开前边界必须已接受」列为客户可见限制与 AC-23 前置。 |
| F5 | 漏重点（复用/单一来源） | 一般（general） | §2.4.3 执行路径；§4.1 写集 | 规范 argv 体将存在三份来源：`gitQueryBody`（门禁引擎）、`createGitQueryPort`（Provider）、新 `git-readonly.ts`；且 `createGitQueryPort` 无法表达 `blame`、`--oneline`、`cat-file -t/-s/-e`，「经 `createGitQueryPort`/`gitCommandArgv` 二选一」并不等价；`gitCommandArgv`/`executeGit` 当前不在 `public/trunk-store.ts` 导出，必须新增公共固定传输入口（写集已含 `public/trunk-store.ts`，正文未明说）。 | `classify-shell.ts:188-203`；`git-command.ts:491-513`；`public/trunk-store.ts:45` | 明确执行路由为「新增固定传输只读 Git 公共入口」（导出绝对可执行+固定 config/env+预算）；三处模板以单一纯函数为源并补差分测试（同一输入 → 同一规范 argv），或逐条记录允许的分叉理由。 |
| F6 | 漏重点（既有测试同步/基线） | 一般（general） | §4.5；§4.4 | 测试同步清单不完整：两组**当前已红**且断言 `git status` 放行的编排用例（`test/编排/shell-readonly.test.ts:350-365`、`test/编排/shell-gate.test.ts:884-914`）未列；本变更会使其转绿，应在基线红/绿变化中说明。另 `test/编排/shell-risky-order.test.ts:39` 硬编码 `version:"3"`、`defaultShellRules().id = "ans-default-v3"`（`classify-shell.ts:1792`）需随 `SHELL_RULES_VERSION` "3"→"4" 同步；`test/测试/lightweight-permission-repairs.test.ts:182`（POSIX skip）亦断言 allow。 | 本复核实际运行结果（§「关键事实」末条）；`classify-shell.ts:1109, 1792` | 补全「断言变更 + 既有红转绿 + 版本/id 同步」三类清单，并在验收中区分「本变更新增红」与「既有红」。 |
| F7 | 漏重点（事实/证据纪律） | 建议（suggestion） | §2.4.3「验证事实」 | alias 劫持实验标为 [事实]，但未附命令、输出或证据哈希，无法独立复核（与 P1-RR 证据纪律不一致）。 | 方案 §2.4.3 | 附最小实验记录（临时仓库、设置的 alias、实际输出）或转为确定性测试断言「内建子命令优先于 alias」。 |
| F8 | 漏重点（契约/可行性） | 一般（general） | §2.3.1–§2.3.3；§4.4 | binding 事实含 `audit.sink`（file/custom）与 `relPath`，但 `createShellGate` 无从得知 sink 类型（`ShellAuditSink` 仅 `append`）；`CreateShellGateOptions.projectRoot` 注释为「仅诊断上下文，不参与分类授权」，新设计使其成为准入要件（需改注释/契约）；准入只要求 `probe==="ok"`，`createMemoryAuditSink` 或自报 ok 的自定义 sink 也能满足，「审计不可绕过」依赖生产装配纪律；未定义可接受的 `mode` 集合（readonly 档也能通过准入，但永远无法审批非只读操作）。 | `shell-audit.ts:133-136, 224-234`；`shell-gate.ts:369-371, 538` | 由 `buildShellGate` 把 sink kind/relPath 传入登记（或给 sink 增加显式 `kind`）；受保护准入要求 `sink==="file"`（或显式 host-durable sink）+ probe ok；定义并测试可接受 mode（建议至少 operator-approve 或 three-layer；readonly 只读档作为更严档可接受但需写明）；更新 `projectRoot` 字段注释与测试桩说明。 |
| F9 | 漏重点（与上一变更关系） | 一般（general） | 头部「依据」第 4 条 | 称 P1.6 §4.7/Q5 的「仓库初始化保护的应用中介证据」另案「本变更正是该另案的客户方向修正版」，与 §2.8/Q9/附录 B「本方案不放宽该门、需另案」矛盾；本变更修的是目标会话**创建准入**（`bindPreparedRuntimeRole`），不是 Q5 的应用中介写门。 | P1.6 `:469-472, 1051`；本方案 §2.8/附录 B | 改写为「本变更是 P1-RR §6.4 下游创建门的客户方向修正；P1.6 Q5 的写门另案仍未解决（Q9）」。 |
| F10 | 漏重点（审计可核对性） | 一般（general） | §2.4.3 审计段；§4.2；AC-6 | 方案要求 audit `branch:"allow:readonly:git:<id>"`，但现行 gate 的 `branch` 恒为 `c-allow`（ruleId 只出现在 `by`）；按现行代码 AC-6 的审计断言不可通过。另 §2.4.3 称「模型命令与执行体的映射必须可审计」，而记录实际执行体的 `canonicalArgv`/`executionPlan`（O4）为选装，与「必须」矛盾。 | `shell-gate.ts:201, 691, 1167-1198` | 明确审计字段：新增可选 `readonlyGit:{id,canonicalArgv}`（或规定 `by` 前缀断言并修正 AC-6）；把 canonicalArgv 纳入只读 Git 的必做（推荐），或降级「必须可审计」为「建议」。 |
| F11 | 漏重点（事实小误） | 建议（suggestion） | §2.2.1 K4 | K4 称适配器 tool-surface 事实「仅派发父门/controller resume 消费」，实际 strict `toolSurface` 还被 `inspectInitializationProtection`（Git 写/初始化门）消费；K4 把 `applicationMediation`（确为仅派发/controller resume）与整个 toolSurface 混为一谈。 | `trunk-runtime.ts:97-151`；P1.6 INV-2 | 改为「`applicationMediation` 仅派发父门/controller resume 消费；strict `toolSurface` 另被写/初始化门消费（本方案不改其语义）」。 |
| F12 | 漏重点（事实小误） | 建议（suggestion） | §2.4.4 注与越权样例 | 「su/single/judge 不注入 Git 工具（工具层 role-not-allowed）」自相矛盾：桌面为普通角色会话注入三能力，su/single 的工具存在但 handler 返回 `role-not-allowed`；judge 会话走判断工具集，确实不存在。另项目角色 Git 路径映射漏 `liaison` 排除。 | `tools.ts:4339-4374`；`classify-shell.ts:218` | 按事实改写（「su/single：注册但 handler 拒绝；judge：不注册」），并补 `liaison` 到「非治理路径」说明。 |
| F13 | 过度设计/复用 | 建议（suggestion） | §4.1 新共享件；§2.4.3 | matcher 放置两说（`src/common/shared/git-readonly.ts` 或门禁引擎），建议沿用既有 `matchRoutineShellCommand` 的单引用模式（门禁引擎私有纯函数 + `src/service/gate/shell-rules.ts` 公共出口），避免新增第二个共享面与漂移。 | `src/service/gate/shell-rules.ts:17`；方案 §2.4.3 自身引用该先例 | 二选一定稿：优先门禁引擎私有 + Service 公共再导出；若确需 shared，写明与 `shared-directories.md` 写集/owner 的对应关系。 |
| F14 | 漏重点（Q 覆盖） | 建议（suggestion） | Q1/Q2/Q10 | Q 未覆盖：(a) 只读 Git 白名单的**适用范围**（全部项目 vs 仅受保护项目；收窄的是全局门禁引擎硬地板）；(b) `git --version` 等日常只读形态被拒是否接受；(c) `git log` 无目标默认 `--all` 的读广度（见 F1）。 | 方案 §2.4.3 表；`classify-shell.ts:1489-1492` | 在 Q1/Q2 中明确范围与默认广度；必要时加一个 Q。 |
| F15 | 漏重点（验收） | 建议（suggestion） | §5.1/§5.2 | B1 缺：(a) Q9 边界负向 AC（受保护+shell+`git_candidate` → 既有门拒绝、无副作用）；(b) prepare→bind 间 approval-chain 变化 AC（`protected-scope-approval-chain-changed`）；(c) Q4 未采纳时「审计失败但审批放行」的验收口径。 | 方案 §2.2.4/§2.5.5/§5 | 补上述 3 条 AC；若 Q4 由客户改选 observe，明确该缺口为披露项而非通过项。 |

## 复核结论

**建议修订后提交。**

理由：方案方向与闸门 0（含 Git 补充规格）一致，对现状代码的定位（`prepareNative` 非 codex 恒 undefined、`hasUnconfinedScriptTools`、`run-role.ts:731-733` 属下游创建门、现有审批链 `shell-arming`/`shell-gate`/`operator-channel`/`shell-escalation`/`shell-audit` 的接线）经独立复算基本准确；身份绑定 WeakMap 设计沿用 `blockedRoleCapabilities` 先例，进程内可行；与 PR #72/E0 冻结契约未发现冲突。不属「暂不建议提交」。

但 F1、F2 是影响安全不变量与客户确认基础的重要发现：F1 的「只读 shell Git 绕过 `git_query` 读取授权/历史广度」需要客户明示或收紧；F2 对裸 Git 写硬地板的机制归因错误，若按文字实现/验收会漏掉 writeGuard 依赖。F3–F10 为一般发现（客户可见限制、探针前置、单一来源、测试基线、审计字段、契约细节、与 Q5 关系），建议在提交闸门 1 前修订；F11–F15 为建议。修订后建议由沟通就受影响部分（§0.3/Q1/Q2/Q9、§2.3–§2.4、§4.5/§5）启动一次窄复核，再提交闸门 1。

本结论仅是建议，不是客户确认、不是实施授权、不是验收基线，也不阻断沟通提交闸门 1。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 未运行真实模型、未启动桌面应用、未做真实运行（AC-23/24 的环境与预算未实测）；只做了 3 组确定性测试（见「关键事实」末条），未跑全量套件。
- 未逐行读完 `app/desktop/session.ts`（近万行）、`app/desktop/operator-channel.ts`（千余行）、`app/main.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/runtime/tools.ts`、`src/model/runtime.ts`；只读与 shell 审批、Git、创建准入、写门、审批卡相关的段落。未核对 `operator-channel.ts:968-1044`、`shell-escalation.ts:389-525/528-588` 的逐行内容（按方案引用抽查关键点一致）。
- 未核对全部角色边界 YAML 与 `shared-directories.md` 的逐角色写集；`src/common/shared/` 与 `src/service/gate/` 的 owner 归属需团队计划再确认。
- 未验证 `createFileAuditSink` 在 single 治理模型/创世过渡项目的实际可写性；F4 的 AC-23 可达性风险按静态分析提出，需实现/验收阶段实证。
- 未核对渲染侧卡面字段（`OperatorPrompt.entry/protectedScope`）的 IPC/渲染链路；只确认 `OperatorPrompt` 形状（`src/model/runtime.ts:705-717`）与桌面通道构造点。
- 未核对本方案是否会与 E0 8 模块的 `api-spec.md` 写集冲突（该文件尚未在本次快照中生成）；按 E0 冻结契约文本未见直接冲突。
- 未复核 `git-readonly` matcher 的每一子命令解析边界（如 `show <oid>:<path>` 的冒号/路径解析、`ls-tree` 的 `--full-tree` 与 paths 交互）；参数级攻击矩阵已按方案表核对，但实现级边界需测试补齐。

**限制与说明：**

- 复核规则 §2 所列本仓库记录路径 `角色卡/策划/docs/design/` 在本检出不存在；本记录按调用方指定并沿本仓库既有 `docs/planning/*_review_*.md` 先例写入 `docs/planning/`。
- 本记录不复制方案正文；方案在「复核处置」节应逐项链接本记录并保留双方意见。

**未解决意见：**

1. F1 的读取范围（任意 OID/历史/`log --all`）是否属于客户「git 命令只读放行」的预期范围，需客户明示；若不确认，建议收紧到与 `git_query` 读取策略一致。
2. F2 的裸 Git 写硬地板依赖 writeGuard 注入；若实现团队按方案文字理解为「分类器先于审批分支」，可能在新装配路径重复引入可审批的裸 Git 写。
3. F4 的审计探针（排除 refresh）与 AC-23 主场景的兼容性需在真实运行前用预检证实，否则可能出现「方案目标正确但验收环境不可达」。
4. F8 的受保护准入是否接受 `createMemoryAuditSink`/自定义 sink 的 `probe:ok`，涉及「审计不可绕过」的口径，建议作者明确取「file sink only」或说明为何不。
5. F10 的审计字段（`branch` 新增值 vs `by` 前缀 vs 新字段）需二选一并同步 AC-6；这影响验收判据，建议在闸门 1 前定稿。

## 再复核记录（P1.0 → P1.1，受影响部分窄复核）

- 窄复核版本：P1.1（2026-11-08；828 行；SHA-256 `720cfbc67728376aea85f5022f7f1447c3369cc9f7d286941a16fbb28b7c676b`；取代 P1.0 `20fe82ef…`）。窄复核日期：2026-11-08。
- 复核范围：F1–F15 的处置闭合性，及修订是否引入新漂移。只读页面：头部、§0.2–§0.3、§2.2.1 K4/K9、§2.2.4、§2.3、§2.4.2–§2.4.4、§4.1–§4.5、§4.6 R6、§5.4 与 AC-6/12/14、§6.1–§6.2、§7 Q1/Q2/Q5/Q9/Q12/Q15/Q16、§8、附录 A。未变化部分沿用 P1.0 复核结论，不重复全文复核。
- 方法：只读；未跑真实模型、未改方案/代码/测试。对新增断言涉及的行为按 HEAD `a1b2f66` 复核代码路径（`shell-gate.ts:655-676, 691-702, 835-840, 873-902, 903-928`；`shell-write-guard.ts:559-561`；`trunk-runtime.ts:97-151`；`public/trunk-store.ts:45`；`git-command.ts:491-513`；`classify-shell.ts:1056-1064`；`git-capabilities.ts:378-410` 等）。

### 受影响发现更新

| 发现 | 状态 | 复核依据 |
| --- | --- | --- |
| F1（must-fix） | **关闭** | §0.3（第 39 行）明确「shell 只读 Git 不套用 `git_query` 的 `readableOids`/publication-proof；可读任意完整 OID/历史」；§2.4.3 白名单表把 `log` 无目标默认 HEAD、规范体以 HEAD 为默认目标、攻击表拒绝 `--all`（第 332/344/362 行）；Q1/Q2 请客户确认读取范围与白名单；AC-29 可判（可执行断言清楚）。与 `classify-shell.ts:1056-1064`、`git-capabilities.ts:378-410`、`git-command.ts:198`（原 `log` 无目标 `--all`）一致，未再声称「读取权限未变」。备注：AC-29 首列混写「客户确认 Q1/Q2」与可执行判据，建议把确认项移出 AC（见 R7e）。 |
| F2（must-fix） | **关闭** | §2.4.2（第 317 行）与 §2.4.4（第 409 行）已更正为「classifier deny 在 advisory/operatorOnly+approveDeny 下交 (a)；真正硬地板是 writeGuard 程序名 deny（先于分类）」；N6 明确「所有生产装配路径必须注入 writeGuard」；AC-14 增补 advisory/operatorOnly 模式 `git commit` 与注入断言；AC-30 增补注入缺失即失败。与 `shell-gate.ts:655-676, 873-902`、`shell-write-guard.ts:559-561` 一致。残余口径问题见 R5。 |
| F3（一般） | **关闭** | §0.3（第 40 行）、Q9（第 732 行）、§2.4.4（第 407 行）、§4.6 R6（第 602 行）均写明「注册表级：对进程内所有 active Core 条目逐一要求 strict observed+native；本方案放开的 Claude/Pi/judge/pm 会话本身使该门不可满足、本方案不放宽」；AC-26 可判。与 `trunk-runtime.ts:97-151` 一致。 |
| F4（一般） | **关闭** | §2.3.1（第 250-255 行）探针与运行期 append 同 F-6-1 语义（初始 gate 被拒且注入 refresh ⇒ await refresh 重试一次，纯判定不写盘）；§6.2（第 696 行）增加「审计门禁预检」前置并记录环境事实；AC-12 更新；AC-23 可达性有前置说明。残余 plumbing 见 R2。 |
| F5（一般） | **关闭** | §2.4.3（第 370-378 行）matcher/规范体放门禁引擎、经 `service/gate/shell-rules.ts` 单一引用再导出；新增固定传输只读公共入口 `executeReadonlyGit(projectRoot, match, budgets)`（不接受任意 argv）；与 `gitQueryBody` 重叠模板差分测试、分叉逐条记录；§4.1 写集同步。与 `public/trunk-store.ts:45`、`git-command.ts:491-513` 事实一致。 |
| F6（一般） | **关闭** | §4.5 新增 `shell-readonly:350-365`、`shell-gate:884-914`（既有红、本变更转绿）、`shell-risky-order:39` 版本/id、`lightweight-permission-repairs:182`；§6.1 增加基线红/绿记录要求；附录 A 同步。与本次实测（两组编排用例各 1 红；门禁引擎三文件 101/101 绿）一致。 |
| F7（建议） | **关闭** | §2.4.3（第 377 行）降级为「设计期本地观察、无独立证据哈希、不作为验收证据」，并改为必做确定性测试（内建子命令优先于 repo-local alias、固定 env 禁用 system/global config）；§6.1 列入测试策略。 |
| F8（一般） | **部分关闭（残余 R1/R3）** | 已定稿：sink `describe`/`probe`、受保护准入 `file+durable+probe ok`、memory/custom 不满足、mode 可接受集合、`projectRoot` 契约注释改为准入绑定字段（§2.3.1/§2.3.3/§4.4）。残余：`finalizeShellApprovalProbe` 的 probe 结果来源（R1）、`allowNonDurableAuditForTests` 的「仅测试」执行机制（R3）。 |
| F9（一般） | **关闭** | 头部第 10 行改为「本变更是 P1-RR §6.4 下游创建门的客户方向修正；P1.6 Q5 写门仍是另案、本方案不放宽」，与 §2.8/附录 B 一致。 |
| F10（一般） | **部分关闭（残余 R4）** | 已定稿：`branch` 保持 `c-allow`、ruleId 记 `by`、`readonlyGit:{id,canonicalArgv}` 并入必做（O4 不再选装）、§4.2/§4.3/AC-6 同步。残余：`by` 在 operatorOnly/advisory/readonly 档会带既有后缀（`byTagged`，`shell-gate.ts:691-702, 835-840`），AC-6 的精确串在主要生产场景不可判（R4）。 |
| F11（建议） | **关闭** | §2.2.1 K4（第 154 行）已区分 `applicationMediation`（仅派发父门/controller resume）与 strict `toolSurface`（另被 `inspectInitializationProtection` 消费）。 |
| F12（建议） | **关闭** | §2.4.4（第 402/404 行）已按事实改写 su/single（注册但 handler 拒绝）与 judge（不注册），并补 `liaison` 排除。 |
| F13（建议） | **关闭** | §2.4.3（第 372 行）明确沿用 `matchRoutineShellCommand` 先例、不新增 `src/common/shared/git-readonly.ts`；§4.1 写集相应更新。 |
| F14（建议） | **关闭** | 新增 Q15（全局 vs 仅受保护）、Q16（`git --version`），Q1/Q2 补读取范围、`log` 默认/`--all`；Q1–Q16 编号连续。 |
| F15（建议） | **关闭（残余测试法见 R6）** | 新增 AC-26（Q9 边界）、AC-27（approval-chain-changed）、AC-28（Q4=observe 披露口径）、AC-29/AC-30；AC-12 条件化。AC-27 的触发/测试缝未定义（R6）。 |

### 剩余项（R）

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 漏重点（证据不可伪造） | 一般（general） | §2.3.2、§4.1 | `finalizeShellApprovalProbe` 若接受调用方传入的 probe 结果，`probe:"ok"` 又成为**调用方自述**——与 §2.3.1「证据不是调用方自述」及 R14 教训（任意函数可伪造）同一类；任何持有真实 gate 的测试/包装代码都能回填 ok 而不实际探测。 | `createShellGate` 返回闭包；WeakMap 先例 `session.ts:319-329` 只登记事实、不接受调用方值；方案 §2.3.1/§2.3.2 | 建议 finalize **不接收 probe 值**：由 binding 在构造时私有持有 sink 引用并自行 `await sink.probe()`（或由 `inspectShellApproval` 惰性触发一次并冻结结果）；若坚持回填，须把「仅 assemble* 可调用」变成可执行约束（私有模块/不可伪造 closure）。 |
| R2 | 漏重点（可行性/契约） | 一般（general） | §2.3.2、§4.4 | 接线未定义：`buildShellGate` 同步且只返回 gate，assemble* 拿不到 sink 引用；「构建后 `await audit.probe()`」的 sink 传递路径未写。§4.4 仍称受保护用例可经 `buildShellGate` 构造，但同步的 `buildShellGate` 无法完成异步 probe（probe 恒 unknown ⇒ 拒绝），与新增的 async 探针矛盾。 | `shell-gate.ts:1297-1342`（返回 `createShellGate(...)`）；`shell-arming.ts:185-217, 283-304, 376-406`（assemble* 只接收 gate） | 定稿接口：`buildShellGate` 返回 `{gate, audit}`（或复用既有 `onAuditSinkCreated` 捕获 sink，由 assemble* finalize）；§4.4 改为「受保护正向用例必须经 `assemble*` 或显式 finalize」。 |
| R3 | 漏重点（准入口径执行） | 一般（general） | §2.3.1、§4.4、§6.1 | `allowNonDurableAuditForTests` 声称「仅测试装配可达、生产默认不开启」，但未给执行机制；若作为普通选项暴露，任何生产装配都能设置，受保护准入的 `file+durable` 要求退回约定。 | `CreateShellGateOptions`/assemble 选项均为宿主注入（`shell-gate.ts:369-472`）；无测试上下文检测先例 | 定义执行机制（测试上下文检测、生产类型面不暴露、仅测试 fixture 独立入口之一），或明确记录为接受风险，并在生产装配测试中断言不设置。 |
| R4 | 漏重点（验收可判） | 一般（general） | §0.3、§2.4.3、§4.2、AC-6 | `by:"ruleset:allow:readonly:git:<id>"` 在 operatorOnly/advisory/readonly 档会带既有后缀：`byTagged` 对 operatorOnly 追加「（su 审批档）」、advisory 追加「（advisory 规则）」、readonly 追加「（su 只读档）」。AC-6 的精确串在主要生产场景（内置角色 operatorOnly、项目角色 advisory）**不可判**。 | `shell-gate.ts:691-702, 835-840`（c=allow 返回 `by: byTagged`） | 把 AC-6/§0.3/§2.4.3/§4.2 的 `by` 断言改为**前缀** `ruleset:allow:readonly:git:<id>`（允许既有档位后缀），或按档位列精确串；ruleId 语义不变。 |
| R5 | 漏重点（验收口径） | 建议（suggestion） | AC-30、N6、§2.4.2 | 「所有 `assemble*`/`run-role` 装配路径必须注入 writeGuard」对只读档过宽：只读档不接 (a)，classifier c=deny 在 `:903-910` 即终结，硬地板不依赖 writeGuard；强制所有路径注入会与只读档现状/测试冲突（`assembleReadonlyShellGate` 的 writeGuard 为可选）。 | `shell-gate.ts:903-928`；`shell-arming.ts:227-305` | 把不变量限定为「接 (a) 的档（项目链/审批档）必须注入 writeGuard」，只读档注明 classifier deny 即终结；AC-30 同步。 |
| R6 | 漏重点（验收可判） | 建议（suggestion） | AC-27、§2.2.4 | `protected-scope-approval-chain-changed` 在不可变 binding+单次 finalize 下几乎不可达（gate 替换会先被 `isCurrent` 拦截为 `runtime-prepared-configuration-changed`），方案 §2.2.4 自己也写「理论上不可达」；AC-27 未给触发/测试缝。 | `session.ts:508-513`（isCurrent）；方案 §2.2.4 | 定义测试缝（binding 模块级测试直接驱动）或把 AC-27 标为防御性/模块级判据，不作为端到端必过项。 |
| R7 | 漏重点（措辞/一致性） | 建议（suggestion） | §8.3、§4.1、§4.6 R4、Q9、§6.1、AC-29 | 小漂移：(a) §8.3「按客户全权委托记录该选择」暗示 F1 读取范围已获客户授权，实际是 Q1 待确认；(b) §4.1 `GovernedToolsOptions.readonlyGit`（若采用 §2.4.3 执行能力）为条件式，现已是必做；(c) §4.6 R4 仍写「边界未接受…会话被拒」，与探针含 refresh 不一致（应为 refresh 后仍拒）；(d) Q9 备选「与 Q5 独立」中 Q5 指代不明（本方案 Q5 vs P1.6 Q5）；(e) §6.1 仍称「`git-readonly` matcher」，与「不新增 shared 件」易混；(f) AC-29 首列混写客户确认与可执行判据，建议把确认项移出 AC。 | 方案对应段落 | 同批措辞修订；不影响设计或验收口径。 |

### 窄复核结论

**仍需修订（窄修）。** F1–F7、F9、F11–F15 已关闭；F8/F10 主体已定稿。剩余 R1–R4 为一般级，集中在新增证据的**归属与可伪造性**（R1：probe 结果不得由调用方提供）、**接线可行性**（R2：sink/probe 的传递与 finalize 接口）、**测试专用选项的执行机制**（R3）与**AC-6 的 `by` 断言**（R4：`byTagged` 既有后缀使精确串不可判）；R5–R7 为建议。以上均为小范围文字/接口定稿，不改变设计方向、客户可见范围或 T3 判定，也不构成新的安全方向问题。

建议作者窄修 R1–R4（建议连 R5–R7）后，由沟通就受影响部分（§2.3.2/§4.1、§4.4、AC-6/AC-30、§8.3 等）做一次只读窄核对，再提交闸门 1；若作者将 R1–R3 明确列为团队计划接口评审的待定项并在处置中说明，也可按未解决意见提交，但 R4 涉及验收基线，建议在闸门 1 前修正。

**未引入的漂移（已核对）**：与 PR #72/E0 契约无冲突（`inspectToolSurface`/`composeRuntimeApplicationMediation`/`validParent`/controller resume/`RuntimeSessionToolSurfaceFacts` 均未改动；新增均为加法字段）；Q 编号 Q1–Q16 连续；T3 未变；客户补充规格（只读 Git 放行、角色专属 Git）保持，F1 的读取范围已按 Q1 交由客户确认。

**版本登记**：方案头部引用本复核记录为「105 行 / `13f33ee1…`」，那是 **P1.0 复核快照**；追加本节后本记录行数与哈希变化（追加前 105 行 / `13f33ee11bc77a4fc8af01ddec709de727aaf269fdc836ac9179b1072776e3d5`），沟通在闸门 1 材料中应按本记录最新版本核对，必要时请作者在下次方案修订时更新引用。

## 最终窄核对（P1.1 → P1.2）

- 核对版本：P1.2（2026-11-08；844 行；SHA-256 `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`；取代 P1.1 `720cfbc6…`）。核对日期：2026-11-08。
- 核对范围：R1–R7 的处置闭合性 + 修订新漂移；重点只读 §2.3.1–§2.3.3、§4.1、§4.4、§5.1–§5.4（AC-6/AC-12/AC-14/AC-27/AC-29/AC-30）、§8（尤其 §8.3/§8.4）、§7（Q1/Q2/Q5/Q9/Q12/Q15/Q16）、头部与附录 A/B。未变化部分沿用前两轮结论，不重复全文复核。
- 方法：只读；未跑真实模型、未改方案/代码/测试。对新增/修改断言的依据按 HEAD `a1b2f66` 复核：`shell-gate.ts:201, 691-702, 835-840, 903-928, 1297-1342`；`shell-arming.ts:150-218, 263-305, 356-407`；`shell-audit.ts:133-136, 149-222, 224-234`；`public/trunk-store.ts:45` 等。

### R1–R7 处置状态

| 编号 | 状态 | 核对依据 |
| --- | --- | --- |
| R1（一般，probe 不得自报） | **关闭（含 1 处签名残留，见 R8a）** | §2.3.2 第 261 行：`probeShellApproval(gate)` **无值入参**，binding 私有保存 sink 引用并内部 `await sink.probe()`；并发共享同一 promise、结果冻结 memoize；明确「不存在 `finalizeShellApprovalProbe(value)` 这类接受结果值的 API」；§4.1/§6.1 同步。满足「证据不是调用方自述」与 R14 同类防伪要求。 |
| R2（一般，接线可行性） | **关闭** | §2.3.2 第 259/263 行：`createShellGate` 本就接收 `opts.audit`，登记时把 sink 引用交 binding；不需要 `buildShellGate` 返回 `{gate,audit}`、不需要 `onAuditSinkCreated` 捕获；`prepareRole` 惰性 await probe；§4.4 已改为「受保护正向用例可经 buildShellGate（惰性 probe）/assemble*；直接 createShellGate 需 projectRoot+sink.probe」。与 `shell-gate.ts:1297-1342`（buildShellGate 只返回 gate）与 `shell-arming.ts` assemble* 现状一致，不再需要接口改造。 |
| R3（一般，测试 Symbol 通道） | **关闭（建议补载体表述，R8b）** | §2.3.1 第 254 行：非持久 sink 测试通道改为测试 helper 私有 Symbol，不出现在 `CreateShellGateOptions` 类型面与生产公共出口；`createShellGate` 仅在该 Symbol **以非枚举属性存在**时接受非持久 sink；§4.4/§6.1 要求生产装配测试断言 `assemble*`/`buildShellGate` 从不设置该 Symbol。载体对象未写明（sink vs options），见 R8b。 |
| R4（一般，AC-6 `by` 可判） | **关闭** | `by` 已改为前缀 `ruleset:allow:readonly:git:<id>`（允许 `byTagged` 既有档位后缀「（su 审批档）/（advisory 规则）/（su 只读档）」）：§0.3（第 41 行）、§2.4.3（第 382 行）、§4.2、§4.3（第 557 行）、AC-6（第 623 行）；`branch:"c-allow"` 不变；`readonlyGit:{id,canonicalArgv}` 仍为必做。与 `shell-gate.ts:691-702, 835-840` 一致，AC-6 现在可判。 |
| R5（建议，writeGuard 口径） | **关闭** | N6（第 506 行）、AC-14、AC-30（第 662 行）、§8.4 R5 均限定为「**接 (a) 的**装配路径（项目链/审批档）必须注入 writeGuard」；只读档不接 (a)、`c=deny` 在 `:903-910` 终结，不依赖 writeGuard。与 `shell-gate.ts:903-928`、`assembleReadonlyShellGate` 的选项面一致，AC-30 可判。 |
| R6（建议，AC-27 测试法） | **关闭** | AC-27 改为「approval-chain 变化的**模块级防御判据**」：binding 单元测试直接驱动；端到端按既有 `isCurrent` → `runtime-prepared-configuration-changed` 断言，端到端非必过；§6.1 同步。与 `session.ts:508-513` 的 `isCurrent` 行为一致。 |
| R7（建议，措辞/一致性） | **关闭** | (a) §8.3 明确 F1 读取范围仍待 Q1/Q2、本版不声称已获授权；(b) §4.1 `readonlyGit` 改为必做；(c) §4.6 残余风险 4 改为「探针（含一次 refresh 重试）后审计仍不可写/边界仍未接受」；(d) Q9 备选明确「P1.6 Q5（本方案 Q5 是审批证据问题）」；(e) §6.1 命名改为 `matchReadonlyGit`/`buildReadonlyGitBody`；(f) AC-29 只保留可执行判据，客户确认移出到 Q1/Q2 注记。 |

### 新引入的残余（R8，建议级，不阻断）

| 编号 | 类别 | 严重度 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- | --- | --- |
| R8a | 漏重点（措辞一致性） | 建议（suggestion） | §2.3.1 第 234 行 vs §2.3.2 第 259 行/§4.1 | 同一 API 两处签名不一致：§2.3.1 仍写 `registerShellApproval(gate, facts)`（无 sink），§2.3.2/§4.1 为 `registerShellApproval(gate, facts, sink)`；按 R1 的设计，sink 是必填。另 §4.1 shell-arming 行仍保留「登记点如不放在 `createShellGate` 则在此登记（推荐前者）」的旧条件式，与 §2.3.2「登记在 createShellGate」定稿不符。 | 同批措辞修订：统一签名与登记点表述。 |
| R8b | 漏重点（测试通道可行性） | 建议（suggestion） | §2.3.1 第 254 行、§4.4 | 私有 Symbol 的**载体对象**未写明。若挂在 `CreateShellGateOptions` 上，`buildShellGate` 显式构造选项对象、不会转发该非枚举 Symbol，经 buildShellGate/assemble* 的 memory-sink 正向用例将无法使用该通道；若挂在 sink 对象上则可随 `opts.audit` 传递。另 Symbol 的宿主模块（`src/common/shared/shell-approval-binding.ts` 内或独立 helper）与「不被 `src/service/gate/shell-rules.ts` 等生产出口再导出」需明确，以免通道失效或被误用。 | 写明 Symbol 挂在 **sink 对象**（非枚举）+ 宿主模块与不导出约束；或明确 memory-sink 正向用例只走直接 `createShellGate`。 |
| R8c | 漏重点（失败语义精确化） | 建议（suggestion） | §2.2.3 第 185-190 行、§2.3.2 第 261/264 行 | `probeShellApproval` 对**未登记 gate**（无 binding）的返回语义未写明：§2.2.3 以 `!b` 判 `protected-scope-approval-chain-unproven`，§2.3.2 只写「无 sink/无 probe()/probe 抛错 ⇒ unavailable」。若未登记时返回带 `probe:"unavailable"` 的 facts（而非 `undefined`），reason 归因可能与设计意图不同。 | 明确「未登记 ⇒ `probeShellApproval` 返回 `undefined`（走 unproven）；已登记但 sink/probe 缺失或抛错 ⇒ 冻结 facts 且 `probe:"unavailable"`（走 audit-unavailable）」并补单测。 |

### 漂移核对（未发现阻断性漂移）

- **PR #72/E0 契约**：`inspectToolSurface`/`composeRuntimeApplicationMediation`/`validParent`/controller resume/`RuntimeSessionToolSurfaceFacts` 仍未改动；新增均为加法字段（`approvalChain`、`ShellAuditRecord.readonlyGit`、`ShellReviewRequest.roleId`、`OperatorPrompt.entry/protectedScope`、`GovernedToolsOptions.readonlyGit`）；§2.8/附录 B 声明与 P1.1 一致。
- **Q 编号**：Q1–Q16 连续（§7 标题「Q1–Q16」），O1–O12 保持（O4 仍标注并入必做）。
- **T3**：未变（头部第 5 行）。
- **客户规格**：只读 Git 放行 + 角色专属 Git 保持；F1 读取范围明确为 Q1/Q2 待确认项（§8.3 不再声称已获授权）；§0.3 客户可见限制（读取范围、Q9 注册表级、审计口径）保持。
- **小观察（非缺陷）**：`probeShellApproval` 失败结果按设计被 memoize（同一 gate 内不重试），恢复需新会话/新 gate；建议在实施说明中写明（与 §4.6 残余风险 4 一致）。

### 最终核对结论

**建议提交客户确认。** P1.2 已关闭 R1–R7：probe 由 binding 私有执行、无值入参、并发共享与冻结 memoize（R1）；`createShellGate` 持有 sink、无需改 `buildShellGate` 返回形状（R2）；测试私有 Symbol 不进入公共类型/生产出口（R3）；AC-6 的 `by` 改为前缀、`branch` 不变（R4）；writeGuard 不变量限定为接 (a) 的装配路径、AC-30 可判（R5）；AC-27 改为模块级防御判据（R6）；§8.3/Q9/§4.1/§4.6/§6.1/AC-29 措辞同步（R7）。剩余 R8a–R8c 为建议级文字/语义精确化，不改变设计方向、客户可见范围、安全不变量或验收基线，可在闸门 1 材料/团队计划/实施接口评审中处置，不构成再次修订的理由。

复核无阻断权；本结论不是客户确认、不是实施授权、不是验收基线。

**版本登记（P1.2）**：方案头部引用本复核记录为「150 行 / `e76e8ce1…`」，那是 **P1.1 窄复核快照**；追加本节后本记录行数与哈希再次变化（追加前 150 行 / `e76e8ce11321de6a2f0521d8413142c4b287b1666689dc95763067e7403d5bae`），沟通在闸门 1 材料中按本记录最新版本核对即可（如需作者在后续版本更新引用，属文字同步，不影响本结论）。
