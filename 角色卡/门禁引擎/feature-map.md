# 门禁引擎功能导航

本角色负责的**判定核心系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）：共享类型（Model 层）、
双来源角色与边界解析、`resolveWrite` 路径判定，以及 shell 命令级闸 (c) 规则集与 su 治理文案。
协作组摘要的稳定说明已建立在 `docs/feature/role-group-metadata.md`；其他功能说明尚待分别建立。
模块定位见 [functional-description.md](functional-description.md)；本页同时链接本角色
[changelog](changelog.md) 的逐条目变更记录与 `docs/` 下**实际存在**的 change / fix 记录。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 共享类型（Model 层）主属 | `src/model/boundary.ts` / `role.ts` / `decision.ts` 跨层共享类型与不变量（2026-10-14 增 `BoundarySection1.archived` 可选字段）；本角色唯一主属，改动使所有引用方证据失效 | 已实现（持续维护） | [changelog](changelog.md)（2026-10-14（二）条目）、[role-card.md](role-card.md)（「工作立场」与必读资料） |
| 双来源角色解析与项目角色枚举（`resolveRole` / `listProject`） | 按 id 解析角色（路径取自 `project.roles`，未登记下沉为内置治理角色 su）；枚举 `角色卡/`、`role-cards/` 供桌面「项目导入」，内置 su 合成恒首位、`hasRoles` / `primaryRoleId` 单一来源 | 已实现 | [changelog](changelog.md)（2026-10-11「su 补入 listProject 枚举」「T14/T15」「空项目不报警」条目） |
| 角色协作组摘要 | 角色枚举和按 id 解析从卡正文返回可选只读 `group` / `groupDuty`，供桌面呈现协作组；缺值保持旧行为、不改变门禁权限 | 已实现并自测 | [当前功能](docs/feature/role-group-metadata.md)、[公开接口](api-spec.md)、[变更与验证](docs/change/2026-10-14_change_role-group-metadata.md) |
| 归档角色约定（`archived: true`） | 边界 YAML 顶层归档键（客户 2026-10-14 指令）：枚举**静默跳过**（零警告）、按 id 开启 **fail-closed 拒绝**（「角色 X 已归档，不可开启」）、其边界一律不予采用（防御深度）；不带该键行为完全不变 | 已实现（同日治理侧恢复归档文件、闭环） | [changelog](changelog.md)（2026-10-14（二）条目）、[memo](memo.md)（2026-10-14（二）条目）、用例 [test/门禁引擎/archived-role.test.ts](../../test/门禁引擎/archived-role.test.ts) |
| 双来源边界解析（`resolveBoundary` / `resolveBoundarySection`） | 按优先级解析角色边界：项目覆盖（接受后）→ 治理边界覆盖 → 冷启动「有界创世例外」（`governance-seed.ts` 种子：空项目+操作者显式 bootstrap 时对 su 给 `角色卡/`、`docs/`、`.ans/`，pin 接受后结构性自终止）→ 内置未接受回退 | 已实现 | [changelog](changelog.md)（2026-10-11「T31」、2026-10-12「su 卡文本末段改写」条目——三分支口径） |
| 写权判定 `resolveWrite`（门禁心脏） | 目录授权 / 精确文件 / 条件目录、writeSet 收窄（F4）、路径穿越 / 大小写 / 反斜杠 / 跨根 / 符号链接防护；`parseError` 与 F6 拒写；拒写信息附「旧边界快照」盘上对照线索（mtime+size 短路缓存） | 已实现 | [changelog](changelog.md)（2026-10-12「拒写信息补旧快照线索」「旧快照线索同步读盘加缓存」条目） |
| 写权接受证据链（F6：`.ans` SHA-256 pin + acceptance） | 接受须可验证：逐文件 pin 对原始字节比对、pin 不被覆盖即无效、失败清空 source 回落未接受；无 pin 向后兼容 | 已实现 | [changelog](changelog.md)（2026-10-11「T1」条目） |
| shell 命令级闸 (c)：`classifyShell` 规则集与公开再导出 | 确定性规则引擎（程序+argv 重述、`executionModel`、硬拒 / risky 名单；四档 allow / deny / risky / review）；`src/service/gate/shell-rules.ts` 逐字公开再导出，为编排 (c) 层合法注入源（客户 2026-10-12 确认） | 已实现 | [changelog](changelog.md)（2026-10-11「T7」「T8a」「T40」、2026-10-12「shell 规则集公开再导出」条目） |
| 散文式边界「读不懂」响亮失败（A+C 修复） | 边界文件存在但解析 0 条且非 YAML → 记 parseError（拒写信息可读）；su 卡文本与治理种子写死 `boundary.yaml` 格式与最小示例 | 已修复并验证 | [修复记录](docs/fix/2026-10-12_fix_boundary-prose-silent-empty.md)、[changelog](changelog.md)（2026-10-12 同题条目） |
| su 内置卡文本与治理约定文案（单一来源） | `BUILT_IN_ROLE_CARD_TEXT` 写死：temp 暂存约定、角色文档面固定清单、J-1 确认落盘后自动派发、边界三种情形口径、su 自己的 docs/su 文档面与「`角色卡/` 下不得建 su」红线 | 已实现（文案；判定逻辑不随之改变） | [变更记录](docs/change/2026-10-12_change_su-doc-surface.md)、[changelog](changelog.md)（2026-10-12 各条目） |
| 共享路径原语与解析 IO 辅助（`src/common/门禁引擎/`） | `paths.ts` 路径原语同名转出项目管理共享单一来源（T25，行为逐字不变）；`loadBoundaryFile` / `sha256File` / `joinRoot` 等解析 IO 辅助 | 已实现 | [changelog](changelog.md)（2026-10-11「T25」条目） |

## 说明

- 本角色的逐条治理变更全文在 [changelog.md](changelog.md)；工作线索与遗留项在 [memo.md](memo.md)；
  模块定位与必读资料在 [role-card.md](role-card.md)；写入白名单以 [boundary.yaml](boundary.yaml)（Section 1）为准。
- 全部功能的单元与层契约测试在 `test/门禁引擎/`（归档约定的行为由 `archived-role.test.ts` 夹具钉死）；
  跨角色端到端与回归属测试角色，不在本表重复。
- 本角色不自编项目管理 / 测试角色功能；其余角色的消费面（桌面枚举、编排注入、装配接线）见各自功能导航。
