# 闸门 2 增补（第 2 号）：A 批 3 个写集外最小 shim 授权、liaison 运行期只读别名与 product 写区口径（entry-role-minimal）

- **任务 ID**：`2026-10-28-entry-role-minimal`｜**记录角色**：ANS 统筹（Steward）｜**日期**：2026-10-28
- **裁定来源**：沟通（2026-10-28）。本文件是**闸门 2 增补记录 + A 批返工授权 + 团队计划/验收标准回写指引**，不是客户确认记录、不是实施授权、不是验收结论。
- **状态**：**已由沟通裁定（2026-10-28）**；用于批次 A 返工（rework）与复审。团队计划 `docs/scheduling/2026-10-28-entry-role-minimal-team-plan.md`（710 行 / SHA-256 `089675311a383abf17d12f85f0169dba13b2adc05a89a2054cbf888f8437ade8`）、amendment-1（117 行 / `5a4dd423c8b9fc2d7ba570bef744efe0f93175d4003aaeebdbf8df0983b9d417`）、验收标准 v1.1（295 行 / `0bcfe1ea339c007d391c99d5eb245c8199667758b36092825c7df227f49a3130`）在本文件写盘时**均未修改**；其相关章节按《四、回写指引》在闸门 2 材料/标准修订时回写。**回写后哈希另行记录，闸门 2 以回写后团队计划 + amendment-1/2 为准。**
- **依据**：批次 A 独立验收报告 v1 `docs/acceptance/entry-role-minimal-a-acceptance-report-v1.md`（168 行 / SHA-256 `7cd3dfbfc8ae8220fe6c07a670e8cc904fc2972719614bdff77889de98a9a5ab`；结论 **rework**，F1–F4 阻断/F5–F7 非阻断）；A 候选 `f4aa073a7032d35afc2e964dc22b4d171f1d26dc`（父 `8fc673e`）。
- **变更性质**：**最终态不变，仅对 A 批返工做最小书面授权与口径澄清**——不改变方案 v9.2、团队计划已确认的批次/档位/验收/Delta-1~7；不重开闸门 1；不新增依赖/目录/工具/权限；F3（断言数）、F4（证据包）仍按验收报告返工，本文件不代其处置。

## 一、触发与背景

批次 A 独立验收 v1 判定 **rework**（报告见上），其中与写集/口径相关的三项：

1. **F1（阻断，A-02/P5）**：A 候选 43 路径中有 3 个不在团队计划 §4.1 的 A 批写集，也不在 amendment-1 授权内：
   - `src/service/boundary/resolve-boundary.ts`（+2 行，仅类型 re-export；团队计划 §3.2 原写「不写」）；
   - `src/pipeline/orchestration/govern-session.ts`（+30 行，`GOVERNANCE_FUNCTION_LABEL`/`governanceFunctionDiscipline` 的 chief/product 文案与类型放宽；§4.1 编排 A 原只授权 `run-role.ts`）；
   - `app/desktop/project.ts`（+5 行，trio 下把旧 `liaison` 加入 `builtInRoles` 以打开存量旧会话；§4.1 桌面窗口 A 原只授权 `session.ts`/`interface.ts`/`operator-channel.ts`）。
   三者代码均为最小、对既有角色行为基本不变，但**无书面授权**；按冻结标准 P5/§15 判 fail。
2. **F2（阻断，A-04a）**：候选给 `product` 的 Section 1/`preauthorizedDirs` 直接设为 `docs/product/`，`PRODUCT_CARD_TEXT` 写「产物写入 `docs/product/`」；`chief.forbiddenWritePaths` 相对基线 liaison 新增 `docs/product/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/`、`docs/quality/` 五项。违反 amendment-1「A 批 product 不启用目标 `docs/product/`（占位，D 生效）」；change-package §四.5 与 §二快照自相矛盾。
3. **F5（非阻断，A-03 口径）**：实现除类型 `@deprecated` 外，还允许 `governanceRoleOf("liaison")`/`resolveGovernanceRole` 运行期解析旧规格并打开旧 liaison 会话（`session.ts`/`project.ts`）；字面超出「仅编译期 deprecated alias」，但只读、不进入列表/UI/i18n。
4. **F3/F4（阻断，不在本文件处置）**：`liaison-role.test.ts` 断言数 93→91 未解释（F3）；change-package 整树哈希/commit SHA/属主记录/截图哈希/环境/标准版本引用等证据缺口（F4）。**按验收报告原样返工，本文件不改变其要求。**

## 二、沟通裁定与授权（2026-10-28）

**裁定原则：最终态不变；只对 A 批返工做最小授权与口径澄清；不扩大产品设计、不新增行为、不动其他已确认事项。**

### 2.1 授权 3 个写集外最小 shim（F1）

| 文件 | 允许的改动（仅此范围） | 禁止 | 清理批次 |
| --- | --- | --- | --- |
| `src/service/boundary/resolve-boundary.ts` | **仅类型 re-export**：`GovernanceRoleSpec`/`DeprecatedLiaisonRoleSpec`（供编排/桌面按别名规格消费） | 不得新增运行期函数/判定/行为/依赖；不得改边界解析逻辑 | **D 批**随 liaison 删除一并清理 |
| `src/pipeline/orchestration/govern-session.ts` | **仅类型/文案 shim**：`GOVERNANCE_FUNCTION_LABEL` 的 chief/product 文案、`governanceFunctionDiscipline` 的 chief/product 最小纪律、类型放宽为 `GovernanceRoleSpec` | 不得改 flow/gate/ledger/治理流程行为；不得新增派发/审批/写卡分支；旧角色文案/行为保持不变 | **D 批**随 liaison 删除/Delta-2 处置一并清理 |
| `app/desktop/project.ts` | **旧 liaison 只读别名登记**：trio 下把旧 `liaison` 加入 `builtInRoles`，仅用于打开存量旧会话 | 不得进入 `roles`/列表/UI/i18n；不得新增能力/派发/写区；不得改变新项目默认角色集 | **D 批**随 liaison 删除一并清理 |

**授权约束**：

1. 三文件**不得承载新行为**；只允许上表的最小类型/文案/只读兼容改动。超出即停止，重开闸门 2。
2. 三文件写入 A 批 change-package 的改动清单与测试差异表，并**标注授权来源**：本 amendment-2（沟通裁定 2026-10-28）+ 验收报告 F1。
3. **D 批必须清理**三处 shim（随 liaison 删除）；不得保留为长期兼容分支。
4. 本授权仅覆盖上述三个既有文件；不构成对任何其他写集外路径的先例或目录级授权。

### 2.2 F5 口径澄清：liaison 运行期只读别名

- **允许**：`GovernanceFunction`/旧会话的 `liaison` 别名可**运行期只读兼容**——`governanceRoleOf("liaison")`/显式 `resolveGovernanceRole` 可返回基线旧规格，桌面可打开存量旧 liaison 会话（不迁移、不写入）；旧项目可打开。
- **不得**：出现在注册表列表（`BUILT_IN_GOVERNANCE_ROLES`/`listProject`）、UI 角色列表、i18n key、能力矩阵；不得据此新增派发/写区/申请/审批能力；不得改变新项目默认角色集。
- **口径替换**：团队计划/验收标准/A-03/change-package 中「仅编译期 deprecated alias」统一修正为「**编译期 + 运行期只读兼容，D 删除**」；A 快照记录该别名及其只读边界。
- 本澄清不改变「liaison 退休」最终态：D 删除别名；旧项目仍按方案 §12 不迁移、需重建。

### 2.3 F2 口径澄清：product 写区与 chief 禁写清单

- **A 批 product**：`Section 1`/`preauthorizedDirs`/卡文本写区保持**与旧 liaison 对应的现行值**（旧 liaison 预授权 `docs/intents/` 及旧 liaison 的 Section 1 对应项）；**不设 `docs/product/`**；卡文本不得写「产物写入 `docs/product/`」的生效表述（目标态可在 A-04 快照中记录，但注明 D 生效）。
- **A 批 chief**：`Section 1`/预授权保持旧 liaison 值；`forbiddenWritePaths` **恢复基线 liaison 值**，不得提前新增 `docs/product/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/`、`docs/quality/` 等目标写区（这些属于 D 生效的写区变化）。
- **目标写区**（product→`docs/product/`、convener→`docs/scheduling/`、verifier→`docs/quality/`+`docs/verification/`、chief→`docs/intents/`（可选）等）仅记录在 A-04「目标态（D 生效）」快照；**D 批切换**。
- change-package §二快照/§四.5 与实现必须一致；测试中把 product 当前写区/chief forbidden 值钉为目标值的断言需改回 A 批现行值；A-04 只判「目标态已定义、D 生效」。
- 实施者按本条返工；本澄清与 amendment-1 §3.1 一致，不改变最终态。

## 三、受影响文件与批次

### 3.1 A 批（返工；授权/口径）

- **写集新增（授权）**：`src/service/boundary/resolve-boundary.ts`（仅类型 re-export）、`src/pipeline/orchestration/govern-session.ts`（仅 label/discipline/type shim）、`app/desktop/project.ts`（旧 liaison 只读别名）。
- **F2 返工**：`src/common/门禁引擎/governance-roles.ts`（product Section 1/预授权/卡文本写区改回旧 liaison 现行值；chief forbiddenWritePaths 恢复基线）；相关 A 快照/测试断言同步。
- **F5 记录**：`src/model/role.ts`/`src/service/role/resolve-role.ts`/`app/desktop/session.ts` 的只读别名路径在 change-package 说明；A-03 措辞按 amendment-2 修正。
- **change-package**：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md` 更新（三文件授权来源、F2/F5 口径、测试差异表、整树哈希/commit SHA/属主记录/截图哈希/环境/标准版本引用按 F4 补齐）；F3 断言数按验收报告补回/解释。
- **验证**：A 批全部验证重跑（全量 + 双 typecheck + build + Electron `E2E_PASS`；A-07 断言数前后对照；A-08 证据包补齐）；重新提交独立验收复审。

### 3.2 D 批（清理/切换）

- 删除 `resolve-boundary.ts` 的 deprecated 类型 re-export、`govern-session.ts` 的 chief/product 临时 label/discipline/type shim、`app/desktop/project.ts` 的旧 liaison `builtInRoles` 登记；删除 `GovernanceFunction`/旧会话 `liaison` 别名。
- 生效目标写区（product→`docs/product/`、convener→`docs/scheduling/`、verifier→`docs/quality/`+`docs/verification/` 等；chief forbiddenWritePaths 按目标写区更新）；convener 去 dispatch 仍在 D（amendment-1）。
- `ans govern`/Delta-2 处置不变；`govern-session.ts` 的最终去留按 Delta-2。

### 3.3 B/C/E/F 与 Delta-1~7（不变）

- B（chief dispatch/role_status/session_tail 新增、convener 保留至 D）、C（申请/决策）、E（对话框）、F（验收收尾）不变；Delta-1~7 不变；不新增 Delta。总写集仍按方案 §16 约 181–201（A 的 3 文件为既有文件受权增补，不新增文件/目录/依赖）。

## 四、回写指引（团队计划/验收标准/A change-package）

### 4.1 团队计划

1. **§3.2（门禁引擎）**：注明 A 批 product/chief 写区按旧 liaison 现行值（product 不设 `docs/product/`、chief forbiddenWritePaths 不提前扩张）；目标写区 D 生效。
2. **§3.3（编排）**：在 A 批写集注明 `govern-session.ts` **仅** label/discipline/type shim（受权 amendment-2），不改流程行为；D 随 liaison 删除/Delta-2 清理。
3. **§3.5（桌面窗口）**：在 A 批写集注明 `app/desktop/project.ts` **仅**旧 liaison 只读别名登记（不进入列表/UI/i18n/能力矩阵；D 清理）。
4. **§4.1（A）**：精确写集加入上述 3 文件（标注「受权 amendment-2」）；目标句/快照口径按 amendment-1 + 本件：A 只做身份层、F5 运行期只读别名允许、product/chief 写区保持旧值、目标写区 D 生效。
5. **§4.4（D）**：加入 3 处 shim 清理与目标写区切换（product/convener/verifier 等）、liaison 别名删除。
6. **§4.7/§八**：change-package 需标注 3 文件的授权来源（amendment-2 + 验收报告 F1）；闸门 2 摘要注明「A 批受权 shim 3 文件，非新 Delta；最终态不变」。
7. 其余章节（§4.2 B、§4.3 C、§4.5 E、§4.6 F、Delta-1~7、档位/顺序/隔离）不变。

### 4.2 验收标准

- criteria v1.1 的 **A-02** 写集核对加入 3 个受权文件（仅限 §2.1 范围）；**A-03**「仅编译期 deprecated alias」改为「编译期 + 运行期只读兼容，D 删除」；**A-04a** 明确 product/chief 写区按旧 liaison 现行值、`docs/product/` 等目标写区 D 生效；**A-08/F3/F4** 仍按 A 验收报告返工（本件不豁免/不改变）。
- 标准如需修订，按 criteria §16 记录版本（不删除/弱化已确认项）；团队计划回写后更新引用哈希。

### 4.3 A change-package

- 改动清单加入 3 文件并标授权来源；F2 写区修正与 F5 别名口径写入 §二快照/§四.5；测试差异表补 3 文件与 F3 断言数前后对照；F4 证据包补齐（整树哈希重算、commit SHA、属主 change 记录、截图 sha256/窗口尺寸、环境、标准 v1.1 引用）。
- 重新提交独立验收；复审通过前 A 批不得放行。

## 五、边界、写集、档位与回退

- **写集**：仅授权 3 个既有文件（无新文件/目录/依赖）；A 批总写集为原 43 路径（含 3 文件）+ F2/F3/F4 返工，不新增范围；D 清理/切换已在本程序计划内。总写集仍按方案 §16，不新增 Delta。
- **档位**：A/D 仍 **T3**，不降档。
- **闸门**：不重开闸门 1；本件为闸门 2 增补（沟通裁定），与 amendment-1 并行适用；最终态不变。
- **回退**：A 批回退仍为 `git revert` 批次提交/恢复文件并重跑 A 验证；3 个 shim 随 A 回退消失；D 批最终清理前，任何含 shim 的候选不是最终态/不可发布；无数据/schema 迁移。
- **隔离**：不变（只从 `8fc673e` 的 `feat/entry-role-minimal`；不复用/修改/合并 refactor-b1 与 gate-review-flow-busy；不吸收主检出未提交改动）。

## 六、状态与下一步

- **本文件已写盘**：`docs/scheduling/2026-10-28-entry-role-minimal-gate2-amendment-2.md`（当前实施 worktree `.claude/worktrees/entry-role-minimal`；未改代码/测试/角色卡/边界；未 commit/push）。
- **待办**：A 批按本件返工（3 文件授权、F2 写区修正、F5 口径、F3/F4 按验收报告补齐）；更新 change-A.md 并重跑 A 全部验证；重新提交独立验收复审。团队计划/验收标准按《四》回写（回写后记录哈希）。
- **性质**：本件是沟通裁定记录与闸门 2 增补授权，**不是客户确认、不是实施授权、不是验收结论**；A 批复审通过前不得放行；最终以客户闸门 2 确认与实施授权为准。
