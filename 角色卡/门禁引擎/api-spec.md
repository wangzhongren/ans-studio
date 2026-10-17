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

## 只读 pin 证据检查（`inspectPinnedBoundaries`，2026-10-17 A1–A3）

治理记录 pin 不符的重新接受恢复所需的**只读检测**出口。契约全文见 PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md` §5.1；本角色只提供检测，
预览/写入、桌面 IPC 与 UI 属各自属主。

### 共享类型（[`src/model/boundary.ts`](../../src/model/boundary.ts)）

```ts
export type PinEvidenceFileStatus = "modified" | "missing" | "unreadable";

export interface PinEvidenceFile {
  path: string;            // pin 里的项目相对路径（posix，原样保留）
  pinned: string;          // .ans 记录的 SHA-256（小写 64 位十六进制）
  actual: string | null;   // 当前盘上 SHA-256；missing / unreadable 为 null
  status: PinEvidenceFileStatus;
}

export type PinEvidenceState = "ok" | "mismatch" | "invalid";

export interface PinEvidenceResult {
  state: PinEvidenceState;
  checked: number;         // pin 总条数（含一致项）；invalid 时 0
  files: PinEvidenceFile[]; // 仅 status !== ok 的条目，按 pin 顺序
  digest: string;          // 全部 pin 的规范化行 SHA-256；invalid 时为空串
  reason?: string;         // invalid 的原因
}
```

### 公共出口（[`src/service/boundary/resolve-boundary.ts`](../../src/service/boundary/resolve-boundary.ts)）

```ts
export { inspectPinnedBoundaries } from "../../common/门禁引擎/pin-evidence.ts";
export type { PinEvidenceFile, PinEvidenceFileStatus, PinEvidenceResult, PinEvidenceState } from "../../model/boundary.ts";

inspectPinnedBoundaries(input: {
  projectRoot: string;
  pins: PinEntry[];
  requiredPath?: string; // 治理边界项目相对路径；给出时必须被至少一条 pin 覆盖
}): Promise<PinEvidenceResult>
```

实现恒在门禁引擎私有 `src/common/门禁引擎/pin-evidence.ts`，Service 只做**同一函数引用**再导出
（沿 `buildGovernanceSeedBoundary` 先例，不复制实现）；跨角色只可经此公共出口消费。

### 返回值语义（§5.1 逐条）

- **形状**：`pins` 必须为非空数组；每项 `path` 非空字符串、`sha256` 为 64 位十六进制（大小写不敏感）。
  否则 `state:"invalid"`，`reason` 说明第几项（如 `pin[1] 的 sha256 不是 64 位十六进制`）。
- **路径安全**：绝对路径、`..` 逃逸（规范化后 `absRel` 判空）→ `invalid`。
- **覆盖**：给出 `requiredPath` 时须有一条 pin 规范化后指向同一路径；否则
  `reason:"治理边界文件未被任何 pin 覆盖：<path>"`。
- **逐文件**：`ENOENT` → `missing`；stat 其它错误 / 非普通文件 / 读失败 → `unreadable`（`actual:null`）；
  一致项不进入 `files`，非一致项按 **pin 顺序** 保留。
- **整体**：无非一致项 → `ok`；否则 `mismatch`。
- **digest**：对全部 pin（含一致项、按原顺序）拼接
  `path + "\t" + pinned + "\t" + (status ?? "ok") + "\t" + (actual ?? "") + "\n"` 求 SHA-256 小写十六进制。
  预览由编排作为 `previewDigest` 返回、写入前重算比对（G4）。
- **只读**：不写盘、不建目录、不缓存、不改变 pin 顺序；每个目标至多一次 `stat`、至多一次
  `sha256File`（复用 [`io.ts`](../../src/common/门禁引擎/io.ts)，不另写文件哈希）。

### 验证

`test/门禁引擎/pin-evidence.test.ts` 12 例（11 通过、1 例 Windows 专属权限用例跳过）；覆盖全一致、
单文件 `modified`、`missing`、`unreadable`（目录/权限）、形状非法、空 pin、路径逃逸、`requiredPath`
未覆盖/规范化覆盖、digest 公式/稳定性/变化、只读（前后目录树与 mtime 不变）及公共出口同一函数引用。
门禁引擎套件 218 计 / 217 过 / 0 红 / 1 skip。`verifyPins` 既有行为未改，本检查是独立只读入口。
