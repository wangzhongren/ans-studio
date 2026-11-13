# 变更记录：B0 session.ts 重构结构骨架——session-structure.test.ts（2026-11-13）

- 任务节点：**B0（桌面窗口）**——session.ts 重构（方案
  `docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §5 B0 / §6.2 / 附录 B）结构测试骨架。
- 角色：桌面窗口（独立固定上下文；**只增测试 + 本记录/证据**，不判验收、不改生产代码）。
- 日期：2026-11-13
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\refactor-session-ts-b0`（git worktree）
- 分支/HEAD：`refactor/session-ts-b0` / **`c234e79`**（= origin/main；本批不提交）
- 写集：`test/桌面应用/session-structure.test.ts`（新，716 行）、本记录 +
  `2026-11-13_refactor-session-ts-b0-structure_evidence/`。
- 纪律：**不 commit/push、不触发 CI、不打 tag、不碰 main**；不改生产代码 `app/desktop/session.ts`；
  不改任何既有测试（含 `test/桌面应用/session-source.ts` 与 14 个源码钉子文件）；不读 `.env`；
  不启动 Electron/真实模型；不占用 9222/9223/9224；不新增依赖；无 skip/force-exit。

## 0. 结论摘要（先读）

1. 新增 `test/桌面应用/session-structure.test.ts`（8 个用例，全绿），实现方案 §6.2 的 B0 四组骨架：
   **导出面两层快照（运行时 6 值 + 类型 45）**、**导入图无环 + 分层/白名单**、**文件体量预算**、
   **openRoleSession 工具面快照脚手架（7 角色冻结基线 + 两轮稳定性）**。
2. B0 当前生效方式如实分两类：
   - **立即可失败**：运行时导出键集合（恰 6 个值）、45 个类型导入的编译期钉子、`session.ts` 行数
     上限（c234e79 冻结 13,491 行，不得增长）、7 角色工具面与冻结清单逐字比对、两轮独立捕获稳定性。
   - **vacuous（未来生效，当前必过）**：`app/desktop/session/**/*.ts` 不存在 ⇒ 导入图只有 barrel
     单节点（无内部边）、分层/白名单规则空集、单模块 ≤1,500 行空集。为防“永远空转”，测试额外自证：
     扫描器在 barrel 上确实解析到静态 import；规则引擎用合成夹具能抓**环、L0→feature、contracts
     越层、同层越界、未分类模块**五类违规。
3. 工具面冻结基线来自 **c234e79 真实全链实测**：真实 `SessionManager.open` → 真实编排
   `openRoleSession` → 运行时核心 `buildGovernedTools`（runtime=demo）；唯一替身是可脚本化 demo
   provider 工厂（记录 `options.tools` 后返回 `createDemoRuntimeAdapter` 假句柄）。7 角色计数：
   chief 22 / product 14 / rapporteur 15 / nominator 19 / convener 17 / verifier 14 / implementer 12。
4. 验证：`node --test --test-timeout=120000 "test/桌面应用/session-structure.test.ts"` **连续 3 次
   EXIT=0（8/8 通过，自然退出）**；`npm run typecheck` **EXIT=0**。证据见 `_evidence/`。

## 1. 测试文件内容（四组，只增测试）

### 1.1 导出面快照（51 = 值 6 + 类型 45；两层缺一不可）

- **运行时层**：`await import("../../app/desktop/session.ts")` 实测键集合 =
  `["CAPABILITY_INSTALL_SYSTEM_PREFIX","MAX_LIVE_SESSIONS","SessionManager",
  "desktopProjectExecutionInventory","shouldSuppressStarTaskReport","subscribeDesktopExecutionInventory"]`
  （恰 6 个，已按字典序 deepEqual）；并显式断言 `RuntimeKind`/`RunChangeMode`/`SessionEventEnvelope`/
  `SessionManagerDeps` 等**类型不得出现在运行时键集合**；对值做形状抽查（`SessionManager` 为类、
  `MAX_LIVE_SESSIONS === 3`、`CAPABILITY_INSTALL_SYSTEM_PREFIX === "[系统·安装]"`、三个函数为 function）。
- **类型层**：附录 B 的 45 个类型导出以 `import type { … }` **全量清单**导入（含 `RuntimeKind`、
  `RunChangeMode` 两个再导出）；`FrozenTypeExportSurface` 元组 + `TYPE_EXPORT_COUNT: …["length"] = 45`
  在编译期钉住“数量恰 45 且每个名字仍是类型”；由 `npm run typecheck`（test 在 tsconfig include 内）
  兜底。`PersistenceReply` 是唯一泛型导出，元组中以 `PersistenceReply<unknown>` 实例化仅为使用该导入。
- 附录 B 逐项对应：会话/事件/运行 13、持久化 9、后台任务 6、任务/终止 10、治理/安装/库存/登记 7。

### 1.2 模块边界 / 导入图无环（B0 恒真占位、对未来目录生效）

- 扫描集合：`app/desktop/session.ts`（barrel）+ `app/desktop/session/` 目录下递归 `.ts`（不存在 → 空集；
  排除 `.d.ts`）。解析行首静态 `import` / `export … from`（value/type 同等计入；动态 import 不计）；
  相对说明符解析为扫描集合内模块（兼容 `.ts`、省略扩展名、目录 `index.ts`）。
- 文件内文档化的层次表（方案 §3.3）：L0 contracts/shared；L1 persistence/evidence/delivery-store/
  git-ports；L2 tasks/run-change/session-env/diagnostics；L3 delivery/handback/card-gateway；
  L4 dispatch/cards；L5 fixed-workflow；L6 lifecycle；L7 index；barrel。
- 规则：R-a 无环；R-b 只有 index/barrel 可导入 feature，L0 只可导入 L0，且 **contracts.ts 只可依赖
  src/model 与基础类型（不得导入 shared/feature，方案 §3.2）**；R-c feature 只可导入 L0 或
  **显式白名单下层**（lifecycle→delivery/session-env/tasks/evidence/git-ports；fixed-workflow→
  card-gateway/evidence/run-change/git-ports；cards→card-gateway/evidence；delivery→delivery/store/
  session-env/run-change；其余 feature 仅 L0），同模块内部文件拆分允许，同层不同模块/上行禁止；
  R-d 未登记模块直接失败（新增模块必须同步更新表）。
- **当前 vacuous 边界**：`session/` 目录不存在 ⇒ 图仅 barrel 一个节点、内部边 0；真实扫描用例显式断言
  “barrel 的静态 import 解析数 > 0”（防空跑）与“session/ 不存在时内部边必须为 0”。规则引擎另有合成
  夹具自测：互为导入的环、`shared/keys.ts → lifecycle/open.ts`（L0→feature）、
  `contracts.ts → shared/keys.ts`（contracts 越层）、`dispatch.ts → cards`（同层越界）、
  `lifecycle → dispatch`（非白名单）、`session/rogue/new.ts`（未分类）全部被报出；
  白名单内下层链（lifecycle→delivery/shared、cards→evidence、fixed→evidence/card-gateway）不误报。

### 1.3 文件体量预算（当前即通过、未来有意义）

- `session.ts` 冻结基线：**c234e79，`wc -l` = 13,491 行**（sha256 `e7288b2e…`），测试内常量
  `SESSION_TS_FROZEN_BASELINE_LINES = 13491`，断言“现有行数 ≤ 基线（不得增长）”；计数函数与 `wc -l`
  同口径（去尾换行后按 `\n` 计数）。当前实测 = 基线。**不要求当前就 ≤50 行**（那是 B7 目标）。
- 未来 `app/desktop/session/` 目录下单模块 ≤ `SESSION_MODULE_MAX_LINES = 1500`（方案 §6.3 R11）；
  目录不存在 ⇒ 当前 vacuous，B1 起自动生效。

### 1.4 openRoleSession 工具面快照脚手架（B7 前逐批对比用）

- **装配**（参考既有 ans-wiring / session.test / p0-halt 夹具方式）：
  - 真实 `SessionManager`（`open()` → `openInternalUnsafe` → `deps.openRoleSession` 全链）；
  - 真实编排 `openRoleSession`（run-role）+ `createRuntimeAdapterFactory`；
  - 真实工具构建：runtime=demo 的 `providerFactories.demo(options)` 收到运行时核心
    `buildGovernedTools` 产出的 `options.tools`（ToolDefinition[]，序即注册序），记录
    `options.tools.map(t => t.name)` 后返回 `createDemoRuntimeAdapter(options, [])` 作为可脚本化假句柄
    ——不发模型请求、不触网、不落盘；注入面本身由生产代码计算。
- **确定性 fixture**：`os.tmpdir()` 临时项目根 + `.ans/project.json`
  `{"workflowSchema":"legacy/v1","governanceModel":"trio"}` + 6 内置治理角色（chief/product/rapporteur/
  nominator/convener/verifier，含 governanceFunction）+ 1 项目角色 implementer（role-card/boundary 最小
  文件）；每次捕获新建 fixture 与独立 manager，结束 `stop()` + 清理。
- **冻结基线（c234e79 实测，7 角色）**：
  | 角色 | 数量 | 工具名（顺序） |
  | --- | ---: | --- |
  | chief | 22 | write_file, edit_file, read_file, list_dir, view_image, dispatch_task, role_status, contract_check, doc_format, evidence_check, session_tail, role_activity_log, terminate_role_run, redispatch_task, project_state, governance_matrix, project_note, request_version_decision, close_created_task, git_query, git_candidate, git_publish |
  | product | 14 | write_file, edit_file, read_file, list_dir, view_image, submit_report, contract_check, doc_format, evidence_check, project_state, governance_matrix, git_query, git_candidate, git_publish |
  | rapporteur | 15 | product 清单 + select_run_change（位于 governance_matrix 之后、git_query 之前） |
  | nominator | 19 | write_file, edit_file, read_file, list_dir, view_image, submit_report, contract_check, doc_format, evidence_check, install_skill, uninstall_skill, install_mcp, uninstall_mcp, project_state, governance_matrix, activate_role_documents, git_query, git_candidate, git_publish |
  | convener | 17 | write_file, edit_file, read_file, list_dir, view_image, submit_report, dispatch_task, contract_check, doc_format, evidence_check, project_state, governance_matrix, complete_team_plan, close_created_task, git_query, git_candidate, git_publish |
  | verifier | 14 | 与 product 逐字相同 |
  | implementer | 12 | write_file, edit_file, read_file, list_dir, view_image, submit_report, contract_check, doc_format, evidence_check, git_query, git_candidate, git_publish |
  （完整逐字数组以测试文件 `FROZEN_TOOL_SURFACE` 为准；上表为同一基线的可读摘要。）
- **当前断言**：每角色工具名无重复；与冻结清单 `deepEqual`（含顺序）；**每角色两次独立 fixture/manager
  捕获逐字相同**（无随机顺序）。导出 helper `captureToolSurfaceForRole(roleId)` 供 B1–B7 复用。

## 2. 验证结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 结构测试 ×3 | `node --test --test-timeout=120000 "test/桌面应用/session-structure.test.ts"` | 3/3 次 **EXIT=0**；每次 `tests 8 / pass 8 / fail 0`；自然退出（duration ≈ 0.75–0.95s） |
| typecheck | `npm run typecheck`（tsc --noEmit） | **EXIT=0** |
| 基线 | `git show c234e79:app/desktop/session.ts \| wc -l` | 13,491 |
| 运行时导出 | `import(app/desktop/session.ts)` | 6 键，见 `00-basis.txt` |

证据目录 `2026-11-13_refactor-session-ts-b0-structure_evidence/`：
`00-basis.txt`（HEAD/分支/基线/sha256/运行时键/git status）、`01-run-1.txt`、`02-run-2.txt`、
`03-run-3.txt`（三次运行全文 + EXIT）、`04-typecheck.txt`、`05-hashes.txt`（测试文件与证据哈希）。

## 3. 边界、假设与遗留（如实记录）

1. **vacuous 边界**：导入图/分层/白名单与单模块 ≤1,500 行在 B0 当前为空集通过（`session/` 目录不存在）；
   测试已用“扫描器有真实输入 + 规则引擎合成违规自测”防止空转。B1 起新文件出现即自动纳入；出现未登记
   的新模块会显式失败，要求同步更新层次表/白名单（有意为之的结构闸门）。
2. **工具面 fixture 假设**：仅覆盖 runtime=demo、legacy/v1 项目、trio 治理模型、上述 7 角色；
   **未**注入 shell 审批档/客户交互通道/judge，故 `run_shell`、`request_confirmation` 等工具不在基线中；
   fixed 会话注入面（B7.1 起空 trio 默认 fixed）与 chief 有界决策会话（`chiefDecisionContext`）未覆盖，
   留待后续批次在同一 helper 上扩 fixture 再冻结。冻结的是**工具名 + 顺序**（方案 §6.2 #5 要求），
   不含 description/inputSchema/promptGuidelines 全文；若后续需要更严的逐字对比，可在同 fixture 上扩展。
3. **工具面捕获点**：`providerFactories.demo` 收到的 `options.tools` 即运行时核心为本次会话注册的
   应用中介工具（生产构建），其顺序即注册顺序；demo provider 仅记录并返回确定性适配器，不执行工具。
4. **边界/治理登记**：`角色卡/桌面窗口/boundary.yaml`（c234e79）按文件逐条列举测试写区，**尚未包含**
   `test/桌面应用/session-structure.test.ts`；本批按任务书写集执行，建议 B0 合并前由治理更新 boundary
   条目（本角色未自行改 boundary，避免越权改治理文件）。
5. 未改任何既有测试/生产代码；`test/桌面应用/session-source.ts` 与 14 个源码钉子文件未触碰（属 B0
   另一工作项/测试角色写区）。未 commit/push，未触发 CI/tag，未占用 9222/9223/9224，未读 `.env`。
6. 备注：`app/desktop/session.ts` 含 NUL 字符（`\u0000` 分隔键），`grep` 默认按二进制处理，排查时用
   `grep -a`；与本测试无关，仅记录给后续批次。
