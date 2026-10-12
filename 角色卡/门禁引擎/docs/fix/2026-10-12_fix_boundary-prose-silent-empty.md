---
id: boundary-prose-silent-empty-fix
type: fix
title: 散文式 boundary.md 静默解析出 0 条 → 角色一切写入被拒且无提示
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-12"
    kind: created
    summary: 复现并确诊：散文 boundary.md 经 legacy 解析器静默产出 0 条、parseError 为空；客户在批准范围外单独裁定修 A+C
  - date: "2026-10-12"
    kind: implemented
    summary: 实施 A（loadBoundaryFile 对「文件存在但解析 0 条且非 YAML」记 parseError，拒写信息随 reason 呈现）+ C（su 内置卡文本与治理种子 purpose 写死 boundary.yaml 格式与最小示例）
  - date: "2026-10-12"
    kind: verified
    summary: 新增 8 用例全绿；全量 726 计/723 过（2 红为既有环境红）；typecheck 0 错；ans-playground2 只读探针复核
---

# 散文式 `boundary.md` 静默解析出 0 条：角色一切写入被拒且无提示

> **状态：已实施并验证（确定性范围）。** 客户在批准范围外**单独裁定修 A+C**。真实模型端到端（su 用真实模型新建角色并写 boundary.yaml）仍需客户跑，本记录不声称已验。

## 用户会看到什么（修复前，真机实测）

su 给新建的三个角色写了**散文式 Markdown** 边界文件（`角色卡/<角色>/boundary.md`，形如「## 允许写入（白名单，仅此）」+ 反引号路径列表）。此后：

- `listProject` 对这三角色返回 `boundary.entries.length === 0` 且 **`parseError === (无)`**、`warnings === []`；
- 该角色一切写入被拒，拒绝信息只说「目标路径未匹配任何边界条目…允许路径：（无）」——**完全不提示「边界文件读不懂」**；
- 客户在 `ans-playground2` 上以只读探针实测到同样三连（实现者/测试者/规划者）。

## 根因

- 文件名白名单**接受** `boundary.md`（`src/service/role/resolve-role.ts:75` 的 `BOUNDARY_NAMES`）；
- 非 `.yaml/.yml` 文件走 legacy Markdown **表格**解析（`boundary-parse.ts`）：散文没有「Section 1」表格 ⇒ 宽松解析**静默产出 0 条**，不抛错；
- `loadBoundaryFile` 只在「解析抛错」时记 `parseError` ⇒ 0 条与「读不懂」被混为一谈，fail-closed 的拒绝信息因此说不出真原因。

## 修复（客户裁定 A+C）

### A｜响亮失败（`src/common/门禁引擎/boundary-core.ts:206`）

`loadBoundaryFile` 在读文件成功、解析后 **0 条且文件非 YAML** 时，返回 `unaccepted(...)`——即 `parseError`：

> 边界文件存在但 Section 1 为空或无法解析：`<项目相对路径>`（本加载器按 YAML 的 role + entries 结构解析边界；Markdown 散文/表格不会被解析——请把该文件改写为 boundary.yaml）

两条链自动随行，未改任何他人文件：

- **拒写信息**：`resolve-write.ts` 既有 parseError 分支产出 `边界解析失败：<原因>（拒绝一切写入）`，经 `format-denial` 渲染（其恒含 `decision.reason`）⇒ 模型与客户都看得到原因与出路，不再只列「允许路径：（无）」；
- **listProject**：既有 `if (boundary.parseError)` 分支落 warning（`…边界解析失败：…，已跳过`），既有 warnings 通道，未另开口子。

### C｜从源头防

- `BUILT_IN_ROLE_CARD_TEXT`（`boundary-core.ts:41`）：写死「边界文件必须写 `角色卡/<角色 id>/boundary.yaml`（YAML）」+ 最小可抄示例（`role:` + `entries:` + `kind/path/purpose`）+「写 Markdown 散文/表格不会被解析」；
- 治理种子（`governance-seed.ts:49`）：`角色卡/` 条目 purpose 明示 `boundary.yaml——必须 YAML：role + entries，散文 .md 不会被解析`（格式要求的单一来源在 su 卡文本，此处不另写长文案）。

### 合法空集如何区分（结论）

| 情形 | 判定 | 依据 |
| --- | --- | --- |
| **代码合成**（内置 `builtInBoundarySection()` / 治理种子 `buildGovernanceSeedBoundaryForGate()` / 未接受段 `unaccepted()`） | 不是文件解析路径，一律不误伤 | 不经 `loadBoundaryFile` |
| **YAML 显式 `entries: []`** | **合法**（作者按声明格式明确表达空集），无 parseError、角色仍可枚举 | 客户 2026-10-12 裁定的 O1 角落（`test/测试/cli-genesis-boundary.test.ts`）依赖其可枚举；结构违规在 `parseBoundaryYaml` 本就会抛错 |
| **非 YAML 且解析 0 条**（散文/无表格/表格全无效行） | **parseError** | 文件没有按加载器认得的格式表达 ⇒ 正是本次缺陷现场 |
| `.md` 带**合法 legacy 表格** | 照常解析（未加严） | 向后兼容 |
| 散文塞进 `.yaml` 后缀 | 严格 YAML 抛错（既有响亮路径） | `parseBoundaryYaml` |

## 证据

- **新用例**（本角色）：`test/门禁引擎/boundary-empty-and-builtin.test.ts`，8 例全绿——散文 md → parseError 且文案含出路；listProject 记 warning（既有通道）且不存在「0 条且无 parseError」的静默角色；闸链（`resolveBoundarySection` → `resolveWrite` → `formatDenialMessage`）呈现原因；合成边界（内置/种子/回退）不误伤；YAML 显式空集不误伤；legacy 表格兼容；su 卡文本与种子 purpose 断言。
- **全量**：`node --test "test/**/*.test.ts"` → **726 计 / 723 过 / 2 红 / 1 skipped**；两红为**既有环境红**（桌面 pi-config 目录名、pm shared macOS `/var`），不计入本次回归；723 = 基线 715 + 本次新增 8。
- **类型检查**：`npm run typecheck` → 0 错。
- **真机只读探针（ans-playground2，未改其任何文件）**：修复前三角色 `entries=0 / parseError=(无) / warnings=[]`；修复后三角色各记一条 warning（含原因与出路），并附汇总「项目根下未枚举到有效角色；仅内置治理角色 su 可用（可发起 bootstrap）」。
- **环境**：Node v24.14.0；macOS 26.6.2（Darwin 25.6.0）；HEAD `d933537`。

## 如实登记的边界与后果

- **行为后果（须知悉，非 A+C 之外的新语义）**：全角色边界都读不懂的项目（如 playground2）`hasRoles` 由 true 变 false——与既有 T14「有角色目录但全无效角色」语义一致（含「可发起 bootstrap」提示）；桌面据此会设 `genesisBootstrap`，su 因此获得**有界**修复面（仅 `角色卡/`、`docs/`、`.ans/`，绝不含 `src/`），可把散文边界改写为 boundary.yaml 完成修复。修复前的旧态则是死局：su 连自己的边界都改不了。
- **未做**：未改闸判定语义（`resolveWrite` 未动）；未动 `src/provider/**`、`src/pipeline/**`、`src/common/编排/**`、`src/common/pi-adapter/**`、`app/**`；未改他人测试；未给 `BOUNDARY_NAMES` 删 `boundary.md`（legacy 表格兼容保留）；playground2 本身未改（修复应由 su 走治理流程完成）。
- **真实模型端到端未验**：本记录未发任何真实模型请求。
