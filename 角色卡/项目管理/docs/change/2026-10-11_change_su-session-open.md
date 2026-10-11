# 项目管理 变更记录

## 2026-10-11 — su 会话开启：ProjectConfig.builtInRoles + 编排入口闸（跨角色契约改动）

**来源**：客户需求「让内置治理角色 su 出现在桌面左树并能点开聊天」。其**呈现部分**（左树 su 条目 + 内置徽标）已落盘；**核心承诺（点 su 能开聊天）经双重确认不成立**。项目管理裁决方案并派发 门禁引擎 / 编排 / 桌面应用 三角色实施，随后独立验收。

**问题（门禁引擎的枚举设计 与 编排的守卫规则 相互矛盾）**
- `src/pipeline/orchestration/run-role.ts::setupRole` 对**未登记在 `project.roles`** 的角色一律 `EXIT_USAGE`（注释写明是 `role run` 的有意设计）。
- `app/desktop/project.ts::buildProjectConfig` **有意**不把 su 登记进 `roles`（su 无角色目录；登记会让 `resolveRole` 去读空 `cardPath` 的角色卡而报错）。
- `openRoleSession` 复用同一 `setupRole` → 点 su 报「未知角色：su（未登记在 project.roles）」，聊天打不开（真实 e2e：`SU_HAS_WELCOME=false`、`SU_SESSION_STATE=连接失败`）。

**裁决方案（问题 1）＝ 候选 (b) 数据化白名单 ＋ 一道入口闸**
- **门禁引擎（Model §2）**：`ProjectConfig` 新增**可选**字段 `builtInRoles?: string[]`——「允许**会话式入口**（openRoleSession / 桌面聊天）开启的内置治理角色 id 列表」。新增可选字段，向后兼容，不改既有字段或语义。
- **编排（Pipeline）**：`setupRole(roleId, project, policy: { allowBuiltInRoles })`；放行条件 ＝ `registered || (policy.allowBuiltInRoles && project.builtInRoles?.includes(roleId))`。`runRole` 传 `{ allowBuiltInRoles: false }`，`openRoleSession` 传 `{ allowBuiltInRoles: true }`。对外签名（`RunRoleInput` / `openRoleSession`）不变。
- **桌面应用（Interface）**：`buildProjectConfig` 由门禁引擎的枚举结果（`listing.roles[].builtIn === true`）填 `builtInRoles`，**不硬编码 `"su"`**；无内置角色时空集 `[]`。

**为何不放宽 CLI 或其它入口（本裁决的关键）**
- `runRole`（CLI `ans role run`）传 `allowBuiltInRoles:false` → **结构性**地永不接受未登记角色；即便配置里意外带了 `builtInRoles` 也不会放行（`test/编排/session-handle.test.ts` 有对照用例：`runRole` 对 `builtInRoles:["su"]` 仍返 `EXIT_USAGE`）。
- CLI 的配置（装配 `buildDemoProjectConfig`，契约 §6 配置单一来源）**不声明** `builtInRoles`。
- 可开启集合由**门禁引擎枚举**决定（`listProject` 把 su 标 `builtIn:true`）；桌面应用无法发明角色 id；`openRoleSession` 只接受 `builtInRoles` 内的 id，未知 id 一律拒。
- 结论：权限以**数据**表达（不把引擎常量 `"su"` 硬编码进编排层），且「哪个入口能开」由入口意图闸 + 「能开哪些」由配置数据双重约束。

**是否需要客户确认**：**否**。对冻结 Model 契约（设计稿 §2）而言是**新增可选字段**、向后兼容、不放松任何既有守卫；落实的是客户**已明确提出**的需求（su 要能开聊天），机制属工程细节。已同步更新设计稿 §2 与本文，留痕备 Governance 归口。

**改了哪些（各角色，均只写自身白名单内文件）**
- 门禁引擎：`src/model/role.ts`（+字段与注释）、新增 `test/门禁引擎/built-in-roles-field.test.ts`（2 例）。
- 编排：`src/pipeline/orchestration/run-role.ts`（`setupRole` 双约束守卫 + 两处调用 + 注释）、`test/编排/session-handle.test.ts`（+3 例）。
- 桌面应用：`app/desktop/project.ts`（`buildProjectConfig` 填 `builtInRoles` + 注释）、`test/桌面应用/project.test.ts`（+2 断言）。

**验证（项目管理独立执行）**
- 全量单测：`node --test test/*/*.test.ts` → **222 pass / 0 fail**。
- 真实 Electron e2e（Electron 44.7.0 / Node 24.21.0，`--runtime demo` 离线）：`SU_IS_FIRST=true`、`SU_TREE_BADGE=true`、`SU_CLICKED=true`、`SU_NO_MODAL=true`、**`SU_HAS_WELCOME=true`**、**`SU_SESSION_STATE=聊天中`**、`SU_CHAT_HEADER=su`（修复前＝`false`／「连接失败」）；既有 `NO_MODAL_AFTER_IMPORT / ROLE_CLICK / MESSAGES / RESUME` **全 `true`**；桌面应用角色聊天照常（`USER_BUBBLES=2`、`HAS_DENIED_INLINE=2`、续接提示正常、右栏 `RIGHT_BOUNDARY_ROWS=11`）。Electron 进程已按 PID 收干净。

**遗留（本变更范围外，已记入 memo 排期）**
1. su 的 id 命名（保留 `"su"` vs 正式名 slug `ans-governance`）：属客户约定，**待客户定**。
2. su 只读误导提示（`acceptance.accepted===false` → 一切写入被 F6 拒）：**做**，紧随聊天恢复之后（派桌面应用）。
3. Pi settingsManager 未封闭：**做**（低优先，派 Pi适配器）。
4. 配置项不对称（`ANS_PI_CONTEXT_WINDOW` 缺失仅告警 vs `ANS_PI_BASE_URL/ANS_PI_MODEL` 缺失硬失败）：**做**（低优先）。
