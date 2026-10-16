---
id: change-g4v2-mcp-preauth
type: change
title: G-4 V2 wave A——su 预授权扩列第四棵 docs/mcp（常量＋话术＋测试面同步）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [role-capability-install, kanban-fixes-pm-review, run-role, govern-session]
---

# G-4 V2 wave A（编排件）：预授权第四棵树 `docs/mcp`（客户 2026-10-16 批准 V2 分批实施）

**状态：已实施 / 待验证**（独立验证未进行；未 git 提交）。全部落点在**编排**角色 `boundary.yaml` Section 1 内：`src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts`、`test/编排/session-handle.test.ts`、`test/编排/confirmation-gated.test.ts`、本记录与 changelog/memo。

## 一、来源与权限

- 客户 2026-10-16「**按推荐批准，开始实施**」＝**G-4 V2（MCP 安装）分批实施**（PM 评审 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「客户批准（2026-10-16）：『按推荐批准，开始实施』＝V2（MCP 安装）分批实施」——四项裁定全采纳：Pi 三名 V1 不接／server 名特殊字符直接拒装／HTTP/OAuth 型 V1 只接 stdio／分期 P1 Claude→P2 Codex→P3 Pi）。
- 批准件＝产品提案 revision 2 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`（§五已按 P0 探针结论回填）。
- 本批＝**V2 wave A 的编排件**：PM 派发原文列「编排（**预授权第四棵树 `docs/mcp`**＋话术同步）」。V2 范围①（提案 §九）＝「`docs/mcp` 预授权扩列（裁定①『V2 再议』落点；同 §4.6 候选 1 机制：常量加一项＋su 卡文本同批修订＋测试面同步）」。
- **分层**：能力位透传链（`installMcp`/`uninstallMcp` 注入并点亮两工具）＝**wave B**（待运行时核心契约 `InstalledMcpServerV1`/`InstallMcpFn`/`UninstallMcpFn` 落盘）——**本批不做**，本批只做预授权常量＋话术＋测试面（与 V1 I5 同一分工形态）。
- **su 卡文本（`BUILT_IN_ROLE_CARD_TEXT`，门禁引擎）**与运行时核心/桌面UI 的 wave A 件分属各自属主（并行落盘）；本记录只报跨角色互涉点（§六）。

## 二、结论

`SU_PREAUTHORIZED_WRITE_DIRS` 三棵 → **四棵**（`"docs/mcp"` 与既有三棵并列）——su 会话的**初始 writeSet** 恒含 `docs/mcp/**`（项目根相对、含子路径），不经确认发行器、开会话/重建均生效。**语义零变化**（除多一棵树）：仍仅内置治理角色（`kind === "built-in-governance"`）、仍是初始集合的一部分、仍只放开 **F4 一环**（F6 接受门/F7 逃逸复核/边界条目匹配/条件激活逐字不变、fail-closed 不放松）；`docs/mcp2` 前缀**不覆盖**（`isUnderOrEqual` 按段比较）。

## 三、改了什么

### 3.1 `src/pipeline/orchestration/run-role.ts`

- 常量 `["docs/su", "docs/contracts", "docs/skills"]` → **`["docs/su", "docs/contracts", "docs/skills", "docs/mcp"]`**（第四棵来源：G-4 V2 客户批准＋提案 §九 V2 范围①——MCP 声明树 `docs/mcp/<name>.md`，落盘同「先落盘再激活」口径；设计 §5.1 声明文件唯一持久产物）。
- 上方裁定注释块同步改写：「（三棵）」→「（四棵）」＋新增 ④ 段（V2 批准、V1 裁定①「`docs/mcp` 未扩——V2 另议」落点、提案 §九 V2 范围①）；「**仅**这三棵目录树」→「这四棵」；背景指针补本篇。
- 文件头预授权摘要行（L19-21）同步列四棵（「以上三条」→「以上四条」）。
- `suPreauthorizedRelOf` 的 JSDoc 段比较示例补 `docs/mcp2`（与 `docs/su2` 并列——前缀负例口径不因扩列漂移）。

### 3.2 `src/pipeline/orchestration/govern-session.ts`（两处模型可见文案，与 V1 I5 先例同口径）

- `runGovernSession` 确认制说明行（transcript）：「预授权目录 docs/su/、docs/contracts/、docs/skills/ 除外」→ 并列加 `docs/mcp/`。
- `buildGovernPrompt` 的 confirmRule（发进模型的任务提示）：「`docs/su/`、`docs/contracts/`、`docs/skills/` 为预授权目录」→ 并列加 `` `docs/mcp/` ``。

### 3.3 测试面（沿 V1 I5 既有用例体格扩展）

- `test/编排/session-handle.test.ts` 五例各加 `docs/mcp` 断言（与 I5 对 docs/skills 的加法同构）：
  1. 开局免确认：`docs/mcp/echo.md`＋`docs/mcp/sub/deep.md`（含子路径）＋绝对路径同口径；标题与段头注释「四棵」逐一点名（含来源④）；
  2. 严格边界：`docs/mcp2/x.md` 前缀负例（按段比较不被覆盖）；
  3. 非 su：`docs/mcp/echo.md` 在角色 X（边界**覆盖 `docs/` 目录**——控住变量）仍被 F4 拒；
  4. 静态 scope：`docs/mcp/echo.md` 并入初始 writeSet；
  5. 重建：新开会话后 `docs/mcp/echo.md` 仍可写（第四棵同口径）。
- `test/编排/confirmation-gated.test.ts` ⑥b E2E：脚本加两笔 `docs/mcp/{echo.md,sub/deep.md}` 写入＋**真落盘**断言（客户通道仍零调用；`docs/其他.md`/`角色卡/` 仍 F4 拒、零副作用）；标题/文件头注释同步。既有断言零改动、未为变绿放松。

## 四、证据

- `node --test "test/编排/"*.test.ts` → **318/318** 全绿（本批只加断言、未增用例——批前同数；收笔时对含并行 wave A 在途件的工作树复跑，仍 318/318）。
- `npm run typecheck` → **全仓 0 错**（收笔时复跑同）。
- 全量 `node --test "test/**/*.test.ts"` 本批测量点（实施后、并行件续落前）→ **1884 计 / 1879 过 / 4 红 / 1 skipped**——4 红全在 `test/测试/`（测试角色边界的独立验证钉子，断言旧「恰三棵／docs/mcp 未预授权」态），**本角色未动**；归因与翻转清单见 §六。
- **并行实况（重要，如实登记）**：wave A 其余属主（运行时核心：`src/model/runtime.ts`＋`src/common/runtime-core/mcp-declarations.ts`；门禁引擎：`boundary-core.ts` 卡文本四棵＋MCP 安装纪律段；桌面UI）正在**同一工作树**并行落盘——全量数字是**移动快照**；收笔时复跑另见其批次自身造成的红（g1 卡文本两条＋`su-doc-surface-convention` 三条＝门禁引擎卡文本改写所致；h-scope-audit 范围②的 `install_mcp` 零命中检查＝运行时核心在途），各归各属主批次同步、本批不代跑。

## 五、未做与残余（如实登记）

- **未做**（wave A 时点口径；**同日收口件见 §八**）：① 能力位透传链（`AdapterCapabilities`/`openRoleSession` 的 `installMcp?`/`uninstallMcp?` 注入与两工具注册点亮）——**已于同日 PM 收口派发落地（§八）**；② su 卡文本 MCP 安装纪律段——门禁引擎并行落盘（其批次）；③ 运行时核心契约/声明读取器**已落盘**；桌面 handler（在途，属桌面UI批次）、三平台装配（P1-P3 各自批次）。
- **本批不改变**：声明文件解析与注入的严格面、工具面集合、桌面呈现——全部归 wave A 其余件与 wave B 各属主（提案 §5.1/§5.3）。
- **残余**：无新增机制残余（扩列只是白名单加一棵树；F4 之外全链逐字未动）。

## 六、边界声明与全量归因

只写本角色 Section 1 内文件（`run-role.ts`、`govern-session.ts`、`test/编排/**`、本记录与 changelog/memo）。**未碰** `app/**`、`src/common/门禁引擎/**`、`src/provider/**`、`src/model/**`、`test/测试/**`、`test/门禁引擎/**`。

**本批直接归因的三红**（均**非本批文件**、未处理——全在 `test/测试/`，属测试角色的独立验证钉子，沿 G-4 I5 先例「实施角色落盘新行为，测试角色的钉子按『实施后独立更新』流程随后同步」）：

1. `test/测试/g1-verify/g1-copy-and-nails.test.ts:26`——「su 预授权写目录**恰为三棵**」代码级钉子随本裁定过时（实测字面量已为 `['docs/su','docs/contracts','docs/skills','docs/mcp']`）：应改为四棵逐一点名。
2. `test/测试/g4-skill-verify/c-preauth.test.ts:113-114`——④「`docs/mcp` 未预授权」行为侧断言（现 `gate("docs/mcp/any.md").allowed === true`）：应翻转为预授权直写（沿其①体格）＋可加 `docs/mcp2` 前缀负例。
3. `test/测试/g4-skill-verify/h-scope-audit.test.ts` 范围①——「字面量恰为三棵……docs/mcp 未预授权」：应改四棵。

**V2 wave A 叠加红**（不单独归本批，随整体 wave 由测试角色验证轮翻新）：

4. `test/测试/g4-skill-verify/h-scope-audit.test.ts` 范围②——「MCP V2 零产品实施」：`docs/mcp` 行级过滤（本批的常量/话术行属合法产品用法）＋`install_mcp`/`uninstall_mcp` 零命中（运行时核心在途已入 `src/model/runtime.ts`）——两检查随 wave A 整体更新（其「schema 层未知工具拒绝」断言在 wave B 前仍真）。
5. **门禁引擎批次**（收笔时实测已红，归其批次自行同步——本批未动卡文本）：g1-copy-and-nails 卡文本两条（反向断言/正向短语——卡文本已由其改四棵）＋`test/门禁引擎/su-doc-surface-convention.test.ts` 三条（确认制要点/规划纪律/预授权扩列计数）。

上述各红**均为非本批文件**，本角色未改（G-4 I5 先例：四红同样留在 `test/测试/` 待测试角色同步）。

## 七、回滚

纯增量回滚：常量删第四项＋注释块/文件头回三棵＋`suPreauthorizedRelOf` 示例回单例＋govern-session 两处清单删 `docs/mcp/`＋两个测试文件删 `docs/mcp` 断言（回 V1 I5 终态）。无数据/接口/存储面影响；`docs/mcp` 此前不存在授权语义，回滚即恢复「MCP 面零实施」态。

## 八、附记（PM 收口派发，同日落）：能力位透传收口——点亮 `install_mcp`/`uninstall_mcp`（节奏同 V1 I1/I2 末环）

**来源**：运行时核心 V2 契约已落盘（`src/model/runtime.ts`：`InstalledMcpServerV1`/`InstallMcpPayload`/`InstallMcpReceipt`/`InstallMcpFn`/`UninstallMcpFn`＋`GovernedToolsOptions.installMcp?`/`uninstallMcp?`；声明读取器 `src/common/runtime-core/mcp-declarations.ts` 的 `readMcpDeclaration`/`listInstalledMcpServers`；工具 maker 与「注入才注册」在 `src/provider/runtime/tools.ts`）；PM 收口派发（镜 V1「I1/I2 工具末环」同款链条）。

**改了什么（`src/pipeline/orchestration/run-role.ts` 六处逐名）**：

1. **import type**：`+ InstallMcpFn, UninstallMcpFn`（只读导入 `model/runtime.ts`；名字逐字）。
2. **`AdapterCapabilities`**：`+ installMcp?: InstallMcpFn; uninstallMcp?: UninstallMcpFn;`（注释：只给 su＋能力级授予诚实面＋安装 ≠ 授权）。
3. **`openRoleSession` 输入型**：`+ installMcp?` / `uninstallMcp?` 两可选字段（JSDoc：只对 su 转交；工具自己不写盘；护栏=仅客户消息发起的轮次；激活/回执；安装不改变任何角色的写边界）。
4. **注入求值**：`const installMcp = suppressHandback ? input.installMcp : undefined;`（同 `uninstallMcp`——判据复用 `suppressHandback`，同技能两能力；字段名逐字＝契约家能力名）。
5. **capabilities 装配**：`...(installMcp !== undefined ? { installMcp } : {})`（同 `uninstallMcp`——两条件展开并入）。
6. **工厂 `createRuntimeAdapterFactory`**：`installMcp: capabilities?.installMcp` / `uninstallMcp: capabilities?.uninstallMcp` 逐名并入会话构造（运行时核心 `GovernedToolsOptions` 同名能力位；`undefined` ⇒ 对应工具不注册＝能力缺席最严 fail-closed）。

**测试**（`test/编排/installed-skills.test.ts` **+2**，同链同桩）：
- 桩捕获（同引用/误给不注入/未给不注入）：su 会话两能力原引用透传；项目角色即便误给也不注入；su 未给不注入。
- 端到端（真实 Service 装配、demo 假引擎）：su 会话注册 `install_mcp`/`uninstall_mcp` 两工具、handler 载荷逐字（roleId/name）直达注入实现、回执如实（成功回执含声明路径＋「未改变任何角色的写边界」＋「能力级授予」诚实面；`registration-unchanged` 回执「未执行、零副作用」如实转达）；不注入 ⇒ 两工具零注册；项目角色误给 ⇒ 零注册。

**证据**：`test/编排/installed-skills.test.ts` **20/20**（+2）；`test/编排/` 全绿（320 计）；全量对照**无本批新红**——收笔快照 1900 计/1891 过/8 红/1 skipped，8 红**全部**在 `test/测试/`：4 处＝本批 V2 行为翻转的目标钉子（g1-copy-and-nails 代码级钉子、c-preauth ④、h-scope-audit 范围①＋范围②——后者含 install_mcp 零命中，随 V2 整体翻转）、4 处＝门禁引擎卡文本批次（g1 卡文本两条＋d-card-guard 两条），各归各属主、待测试角色验证轮翻新（§六 口径不变）。typecheck：本批六处零错；工作树当前仅 `app/desktop/session.ts` 两处（`applyMcpChange` 未定义）为桌面UI批次在途态、非本批文件。

**收口状态**：编排 V2 面（wave A 预授权第四棵＋话术；wave B 透传点亮）**均落**；桌面 handler（在途）、三适配器装配（P1-P3）仍属各属主；本批未 git 提交。
