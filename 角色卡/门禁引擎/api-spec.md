# 门禁引擎公开接口：角色协作组摘要

本报告记录 G1 已实现的增量契约，供桌面窗口与桌面UI消费。组别来自角色卡，属于展示信息；它不改变角色身份、文件权限、接受状态或门禁判定。现有角色/边界/写权接口继续使用已有入口，本次没有重定义它们。

## 唯一共享类型

[`src/model/role.ts`](../../src/model/role.ts) 导出 `RoleGroupMetadata`：

```ts
export interface RoleGroupMetadata {
  readonly group?: string;
  readonly groupDuty?: string;
}
```

`ResolvedRole` 与 [`ProjectRoleSummary`](../../src/service/role/resolve-role.ts) 均继承此接口。只读是 TypeScript 消费契约；没有给返回对象增加运行时冻结副作用。既有字段及函数签名保持原样：

```ts
resolveRole(roleId: string, project: ProjectConfig): Promise<ResolvedRole>
listProject(projectRoot: string): Promise<ProjectListing>
```

公开入口仍为 `src/service/role/resolve-role.ts`。`ProjectListing.roles` 中的 `ProjectRoleSummary` 直接带可选组字段；消费者不得导入私有解析器，也不得自行解析 `cardText`。

## 返回值语义

解析 `role-card.md` 的独立字段行，支持以下既有格式：

```markdown
**组别（group）：** 运行时接入组
**组内职责（groupDuty）：** 组长

**Group (`group` / 组别):** Runtime integration
**Group duty (`groupDuty` / 组内职责):** member
```

独立的 `group` / `组别`、`groupDuty` / `组内职责` 字段行也可使用普通或包含冒号的粗体标签。英文标签不区分大小写。只采纳第一条非空值，去掉值首尾空白，内部内容原样保留。

- 没有声明或仅空值：对应属性不出现，保持旧卡结果和 warnings 语义。
- 单字段：只返回该字段，不推导另一个值或默认组。
- 未知组名、职责名：返回字符串，不做枚举校验，也不改变权限。
- HTML 特殊字符：原样返回；界面以文本呈现并负责转义。
- `boundary.yaml` 不提供组别来源；已有严格顶层键约束没有修改。
- 归档角色：枚举仍静默排除，`resolveRole` 仍拒绝开启；内置/未知回退角色不继承项目组。

当前本项目的运行时核心为 `运行时接入组 / 组长`，Pi、Codex、Claude 适配器为 `运行时接入组 / 组员`。项目管理已有 `项目协调组 / 组长` 声明，也如实解析。

## 实现与验证

唯一私有实现为 [`role-card-metadata.ts`](../../src/common/门禁引擎/role-card-metadata.ts)。两处公开结果均调用它，不修改边界或 gate 源码。当前源码/测试候选 `d9bd2a97bcfd47f658974cc626564557260112e1f26495febdaec12fc61803e8` 已验证：新用例 8/8；门禁引擎 168 通过、0 失败、1 个 Windows 专属跳过；完整 `npm run typecheck` exit 0。

当前用法见[角色协作组摘要](docs/feature/role-group-metadata.md)，详细候选、环境与命令见[变更记录](docs/change/2026-10-14_change_role-group-metadata.md)。本角色测试没有证明桌面透传或实际渲染，后续由对应属主接入并验证。
