# 门禁引擎公开接口：角色协作组摘要

## 治理分工第 1/3/5 项（2026-10-22）：内置角色写权与卡文本增量

客户确认治理分工第 1/3/5 项（闸门 2 + 实施授权）后，本角色在 `governance-roles.ts` 调整内置治理角色的卡文本与注册表数据面（导出函数名、类型与签名不变）：

- `nominator`（Crew / 组队）：不再提名、不再发 appointment 卡、不写 `docs/nominations/`；改为读取客户确认后的团队计划，按任命名单写 `角色卡/**` 与工作文档。`entries` 与 `preauthorizedDirs` 移除 `docs/nominations/`，`forbiddenWritePaths` 增加 `docs/scheduling/`；第 5 项内容清单写入卡文本。
- `convener`（Steward / 统筹）：`entries` 与 `preauthorizedDirs` 增加 `docs/scheduling/`（团队计划 / readiness / 变更包）；卡文本允许 `request_choice(cardKind=appointment)`（仅此一种治理选择卡），保留 `角色卡/**` 禁写。
- `verifier`（Proof / 验收）：`entries` 与 `preauthorizedDirs` 增加 `docs/acceptance/`（实施前标准与验收报告）；`docs/verification/` 仍为详细证据附件。
- `liaison` / `rapporteur`：写权与能力不变；五张卡的治理文件命名段增加团队计划路径，`docs/nominations/` 标为 legacy（只读历史/过渡）。
- `LIAISON_WRITE_OWNER_HINTS`：增加 `docs/scheduling/`→Steward / 统筹、`docs/acceptance/`→Proof / 验收；Crew 提示移除 nominations；legacy nominations 不再指引 Crew。
- 不变：内部 id / 显示名 / `GovernanceFunction` 值、能力位、`ENGINEERING_QUALITY_BASELINE` 文本、导出函数签名、`appGovernanceBoundary` 四项。

写权前后对照、测试命令与候选哈希见[变更记录](docs/change/2026-10-22_change_governance-split-1-3-5-roles.md)；状态 `implemented-unverified`。

## D3 轻量权限修复增量（2026-10-21）

`resolveWrite(targetPath, boundary, scope, ctx): WriteDecision` 签名及公共类型不变。输入和真实目标按同一 project/skill 根的边界、条件与任务写集分别授权；真实目标拒绝附输入路径与真实相对路径，不自动补发写权。输入命中的 `matchedEntry` 保持返回；正常无链接路径及既有 F4/F6 首句保持。

`classifyShell(argv, rules)` 仍返回四态，`classifyShellDetailed` 不增加字段。两个原 allow 出口按 D3 资格收窄，新增 `ruleId` 为 `review:explicit-program` 和 `review:rg-preprocessor`。既有 deny/risky 不改判；其余只读名称及裸 `.exe` 保留。规则版本仍为 3，数据形状不变；调用方按原四态与 reason 记录/审批，不应把新的 ruleId 误当未知分类。

实现不新增环境、身份或可信程序事实，不修改 Model。使用流程见[文件写入授权](docs/feature/write-authorization.md)、[命令分类](docs/feature/shell-classification.md)，测试与范围见[本轮修复记录](docs/fix/2026-10-21_fix_lightweight-permission-repairs.md)。

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

## 治理三权分立 V1（W0+W1，2026-10-17；四角色 2026-10-18）

客户 2026-10-17 拍板：su 拆为 `rapporteur`（提案权）/`nominator`（提名权）/`convener`（编排权），
**无任何角色自动拥有最终批准权**；新项目 trio、旧项目默认 single 兼容；迁移后 su 隐藏/不可开启/
历史只读；三人基本只读 shell；账本在 `.ans/governance/ledger.jsonl`。契约全文见 PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.1–§5.6。

客户 2026-10-18 拍板**「三权不变、角色四名」**：新增 `liaison`（联络官，沟通权）作为 trio 默认
主入口；`governanceModel` 值仍为 `"trio"`；旧 trio 项目自动获得 Liaison、零迁移；single/su 逐字
不变。契约全文见 `2026-10-18_design_governance-liaison-review.md` §4.1–§4.7。本角色交付门禁引擎
W6-A 部分；交接工具/镜像卡/账本/UI 属各自属主。

### 共享类型（[`src/model/role.ts`](../../src/model/role.ts)）

```ts
export type GovernanceModel = "single" | "trio";            // 缺省 "single"（旧行为逐字不变）
export type GovernanceFunction = "liaison" | "proposal" | "nomination" | "schedule";

export interface ResolvedRole { /* ... */ governanceFunction?: GovernanceFunction; }
export interface ProjectConfig { /* ... */ governanceModel?: GovernanceModel; }
```

Service 侧（[`src/service/role/resolve-role.ts`](../../src/service/role/resolve-role.ts)）：
`ProjectRoleSummary.governanceFunction?: GovernanceFunction`、
`ProjectListing.governanceModel?: GovernanceModel`。
**运行时契约**：`listProject` **恒返回** `governanceModel`；类型上标可选只为兼容其他角色在 W3 前
构造的测试夹具（读取方 `?? "single"` 即旧行为）。这是 2026-10-17 批唯一的类型级放宽，已在
changelog 登记。

### 内置注册表（[`src/common/门禁引擎/governance-roles.ts`](../../src/common/门禁引擎/governance-roles.ts)）

Service 公共出口（[`src/service/boundary/resolve-boundary.ts`](../../src/service/boundary/resolve-boundary.ts)）
以**同一绑定**再导出（不复制实现）：

```ts
export interface GovernanceCapabilities {
  customerInput: boolean;         // Liaison=false；rapporteur/nominator/convener/su=true
  handOffIntent: boolean;         // 仅 liaison
  requestClarification: boolean;  // 仅 rapporteur
  dispatchTask: boolean;          // 仅 convener（trio）/ su（single）
  roleStatus: boolean;            // 仅 convener / su
  sessionTail: boolean;           // 仅 convener / su
  proposeRecovery: boolean;       // 仅 convener / su
  installSkill: boolean;          // 仅 nominator / su
  installMcp: boolean;            // 仅 nominator / su
  shell: "none" | "readonly" | "operator-approve"; // convener=readonly；su=operator-approve；其余 none
}

export interface BuiltInGovernanceRoleSpec {
  id: "liaison" | "rapporteur" | "nominator" | "convener";
  displayName: string;
  function: GovernanceFunction;
  cardText: string;
  entries: BoundaryEntry[];              // root 恒 project
  preauthorizedDirs: readonly string[];  // 初始 writeSet 预置；预授权 ≠ 放行
  forbiddenWritePaths: readonly string[];// 先于 resolveWrite 判定（编排 gate 包装消费）
  capabilities: GovernanceCapabilities;
}

BUILT_IN_GOVERNANCE_ROLES            // 顺序：liaison → rapporteur → nominator → convener
LEGACY_GOVERNANCE_ROLE_ID            // "su"
LEGACY_SU_PREAUTHORIZED_DIRS         // docs/su, docs/contracts, docs/skills, docs/mcp
LEGACY_SU_CAPABILITIES               // 旧行为；handOffIntent/requestClarification=false
LEGACY_SU_CARD_TEXT
governanceRoleOf(id) / governanceFunctionOf(id) / governanceCapabilitiesOf(id)
isBuiltInGovernanceRoleId(id)        // 四人 + su
isTrioGovernanceRoleId(id)           // 四人（不含 su）
trioGovernanceSource(roleId)         // "<built-in:trio/<id>>"
appGovernanceEntries() / appGovernanceBoundary(acceptance)
APP_GOVERNANCE_SOURCE                // "<built-in:app-governance>"
```

- **Liaison 逐项**：Section 1 与预授权只有 `docs/intents/`；禁写 `.ans/**`、manifest、
  `角色卡/**`、`docs/proposals|contracts|nominations|skills|mcp|flows|governance/**`、
  `docs/workflow.md`；能力为 `customerInput: true`（仅 intent-confirm）与 `handOffIntent`（沟通/交接），
  **无**派发/看护/安装/恢复；shell 按 2026-10-19 新规则统一审批档（见下）。
  卡文本写明「客户沟通 · 不拥有最终批准权」「不实现、不跑代码、不写测试」。
- **条目/预授权/禁写**按评审 §5.2/§4.2 表逐项落表；禁写路径展开为**具体前缀**（`.ans/`、
  `docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、`角色卡/<五 id>/` 等），
  按段比较、不实现 glob。
- **应用专用边界**固定四项：`角色卡/governance-boundary.yaml`（file）、`.ans/`（directory）、
  `docs/bootstrap-manifest.md`（file）、`docs/audit/`（directory，shell 命令审计由应用写）。
  只给编排在 finalize/repin/迁移与 shell 审计中使用，**不注入任何角色会话**；四角色与 su 的
  Section 1/预授权均不含 `docs/audit/`（角色仍不可写）。
  **注意**：编排 `assembleProjectShellGate` 的 `pmBoundary` 当前取首个内置角色边界，需由编排侧
  改用 `appGovernanceBoundary` 才能让该目录在真机 shell 审计中生效。
- 四人（Liaison 例外：不发卡、无 cardKind）的 `cardText` 均写明：职能与权力、
  **不拥有最终批准权**、可写目录与禁写路径、应用独占写路径、不得创建第五个治理角色、
  不得修改其他治理角色资料；Liaison 另写明 `hand_off_intent` 交接约定。三张旧卡的文本同批修订：
  Rapporteur 去掉「客户沟通主入口」、改读 `docs/intents/**` + `request_clarification`；
  Convener 的提名步骤改为「由应用后台派发」。
- **AC3 拒绝归属指引**：`resolveWrite` 对 `<built-in:trio/liaison>` 边界的「未匹配条目」拒绝
  追加 `governanceWriteOwnerGuidance` 文案（注册表单点）：`docs/proposals|contracts` → 报告员
  Rapporteur、`角色卡/|docs/nominations|skills|mcp` → 提名官 Nominator、
  `docs/flows|workflow.md` → 召集人 Convener、`.ans/|manifest|治理边界` → 只能由应用写。
  只改文案，判定/`allowedByRoot` 零变化；其他角色文案逐字不变。编排侧前置
  `forbiddenWriteDecision` 的通用文案属编排属主。

### `listProject` / `resolveRole` / `resolveGovernanceRole`

- `listProject(projectRoot)`：先扫项目角色、再读 `readGovernanceModel`（PM 属主，只读消费）。
  显式值优先；`.ans` 不可读 → single；无显式值且无 `.ans/project.json` 且无任何角色目录 →
  新空项目 trio；其余 single（不按产物目录猜模型）。内置前置：single→`su`；
  trio→四人（liaison → rapporteur → nominator → convener）；`primaryRoleId`
  single→`su`、trio→`liaison`。**旧 trio 项目零迁移**：`.ans`、pin、manifest 均不重写。
- 保留 id：`su`/`liaison`/`rapporteur`/`nominator`/`convener` 的项目目录一律跳过并警告
  「与内置治理角色 id 冲突，已跳过」；`resolveRole` 对保留 id 忽略 `project.roles` 映射。
- `resolveRole`：trio 下 `su` 抛「角色 su 已归档（当前为三权治理模型），不可开启」；
  trio id 返回 `kind:"built-in-governance"` + 注册表卡文本 + `governanceFunction`；
  single 下 su 的解析结果逐字不变。
- `resolveGovernanceRole(listing,{function?,roleId?})`：single 只认 `su`（传 function/其他 id 抛错）；
  trio 按显式 `roleId` 或 `function` 解析，非法组合明确报错、文案列四人。
  **缺省 `function` 仍是 `proposal`（→ rapporteur）**：共享解析器语义不变，CLI `ans govern`
  不提供 Liaison（无跨会话后台交接，评审 §4.5/§4.6）；桌面主入口经 `primaryRoleId` 得到 Liaison。
  `openGovernanceSession`/CLI/测试应共用本出口，不得各自枚举 `builtIn`。

### `resolveBoundarySection` 的模型分支

- `model = project.governanceModel ?? "single"`。
- **single**：`su` 与项目角色走既有四分支（**逐字未改**）；trio 四角色 id → 未接受 + parseError
  「三权角色在 single 治理模型下不可用」。`resolveWrite` 据此拒一切写。
- **trio**：`su` → 未接受 + parseError「su 已归档（当前为三权治理模型），不可写入/开启」；
  trio 四人 → `entries` 取注册表、`boundarySource="<built-in:trio/<id>>"`，接受证据＝
  项目 `governanceBoundary.path` 非空且 `accepted===true`（沿用其 acceptance），或 `path` 为空 +
  本次显式 `genesisBootstrap`（`source` 透传）；否则 fail-closed。**绝不**读取治理边界文档的
  条目作为四人写权；`path` 为空时的桌面运行期同意**不**能当 trio 接受证据。
- 项目角色在 trio 下仍走既有四分支（既有逻辑不变）。

### 写权矩阵（本角色边界求值可证部分）

| 角色 | 可写（Section 1） | 明确拒写（越界示例） |
| --- | --- | --- |
| liaison | `docs/intents/` | `角色卡/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/nominations/**`、`docs/flows/**`、`docs/skills/**`、`docs/mcp/**`、`docs/governance/**`、`docs/workflow.md`、`.ans/**`、manifest |
| rapporteur | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | `角色卡/**`、`docs/nominations/**`、`docs/flows/**`、`docs/skills/**`、`docs/mcp/**`、`.ans/**`、manifest |
| nominator | `角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | `docs/proposals/**`、`docs/flows/**`、`.ans/**`、manifest |
| convener | `docs/flows/`、`docs/workflow.md`、`docs/governance/convener/` | `角色卡/**`、`docs/proposals/**`、`docs/nominations/**`、`docs/skills/**`、`docs/mcp/**`、`.ans/**`、manifest |

`角色卡/` 内的 `角色卡/governance-boundary.yaml` 与 `角色卡/<内置治理 id>/` 属**禁写路径**，
由编排 gate 包装在 `resolveWrite` **之前**判定（本角色只提供数据；提名写卡的客户确认同样在编排
confirmed-writes，不在门禁层实现）。shell：五个内置治理角色统一 `operator-approve` 审批档
（客户 2026-10-19 新规则）——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent
审批；拒绝、超时、通道不可用一律不放行。机制侧（桌面 `shellOperatorOnly` 注入、编排提示词）待
各自属主切换，见[变更记录](docs/change/2026-10-19_change_all-roles-shell-approval.md)。

### 验证（2026-10-18 四角色批）

`test/门禁引擎/governance-trio.test.ts`（四人注册表/写权/边界/解析更新）+ 新增
`test/门禁引擎/liaison-role.test.ts`（旧 trio 零迁移、single 不变、Liaison 写权/能力/AC3 拒绝
归属文案/保留 id）；`list-project.test.ts` 四人顺序/主入口/保留 id 更新；应用边界补
`docs/audit/` 用例（应用可写、四角色与 su 拒写）。门禁引擎套件 **255 计 / 254 过 / 0 红 /
1 skip**；相关编排 shell 套件 143 计 / 142 过 / 1 红（Windows `symlinkSync` EPERM，无关）。
`npm run typecheck` 在本角色边界内零错；复跑时的 3 条全仓错误均在
他域新写的 liaison 测试（`test/编排/liaison-handoff.test.ts`、`test/测试/governance-liaison-verify/
b-intent-handoff.test.ts` 仍用被评审取代的 `"communication"` 名称），与门禁引擎交付无关，如实登记、
未越界修改。
