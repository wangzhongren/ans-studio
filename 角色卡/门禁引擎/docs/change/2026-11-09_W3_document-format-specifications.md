# 门禁引擎变更记录：document-format-specifications B3 批（门禁格式规范钉住）

- **角色**：门禁引擎（独立固定上下文）
- **任务**：每个文档格式的权威说明与全员可读（T2）——B3 门禁 pin 批次
- **日期**：2026-11-09
- **基线**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/document-format-specifications`；HEAD `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`（团队计划 run 绑定已合入 main）；Node v24.22.1
- **依据**：团队计划 `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md` §三/§四；B1 v1 `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md` §2.1 T10、§3.3 AC-3、§3.17 AC-17、§4.1 TM-7/TM-10、§4.3；方案 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md` §3.3 #3、§3.4 #7、§7.1；本角色 `boundary.md`/`boundary.yaml` Section 1
- **状态**：已实施、测试通过；**未提交/未推送/未合并/未发布**

## 1. 写集与变更

本批只写入：

| 文件 | 性质 | 说明 |
| --- | --- | --- |
| `test/门禁引擎/doc-format-specs-pin.test.ts` | 新建 | 门禁侧 owner pin 测试（TM-7/TM-10）：A17/A18/A19/A21 规范 ↔ 本角色私有实现/源码文本交叉钉住；19 个用例 |
| `角色卡/门禁引擎/docs/change/2026-11-09_W3_document-format-specifications.md` | 新建 | 本记录 |
| `角色卡/门禁引擎/docs/change/2026-11-09_W3_document-format-specifications-evidence/` | 新建 | 本批证据（TAP/typecheck/候选 hash/并发快照等） |

**未修改**：`src/common/编排/doc-format-specs.ts` 及其测试（B1，只读 import）；`src/common/门禁引擎/**` 产品代码；`src/common/runtime-core/mcp-declarations.ts`（只读源码文本断言）；`src/model/**`；`角色卡/**` 的 role-card.md/boundary.md/boundary.yaml；其它角色测试/文档；parser/validator 任何实现。**未新增公共导出**（F6 方案 2 未采用；MCP 私有常量按 B1 允许的「源码文本断言」交叉钉住）。

## 2. 钉住清单

### 2.1 A17 `role-card/v1` —— 角色卡 10 章节与三文件规范路径

1. **10 章节冻结**：`ROLE_CARD_REQUIRED_SECTIONS`（`src/common/门禁引擎/governance-roles.ts`，import 真实常量）的 label 集合与顺序逐项等于 B1/任务口径：组别、工作立场、能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单；数量恰 10，每条有 `RegExp` 匹配规则。
2. **spec 字段交叉**：A17 `章节` 字段（`enforcement:"validator"`/`presence:"required"`）constraints 按序包含全部 10 个 label，并披露「任一 `#{1,6}` 空白 行」匹配口径（与 `boundary-core.ts:84-87` 实现一致）；A17 `commonErrors` 登记 `role-card-section-missing:<label>` 与 `boundary-md-yaml-mismatch`。
3. **三文件规范路径**：A17 `路径` 字段约束与 `pathPattern` 披露 `角色卡/<roleId>/role-card.md`、`boundary.md`、`boundary.yaml`；`boundary-core.ts` 源码模板 `` const canonical = `角色卡/${role.roleId}/` `` 与三个文件名后缀逐项断言（路径口径只有这一处实现）。
4. **行为钉住**：
   - 正例：A17/A18/A19 spec 样例经 `parseSnapshotRoleDocuments` 返回 `check.ok:true`、`roleId:"impl"`、`cardText` 与样例逐字相等；`validateRoleDocumentsSnapshot` 返回 `ok:true`。
   - 负例：`cardPath`/`boundaryMdPath`/`boundaryYamlPath` 任一偏离 ⇒ 稳定 code `role-document-path-mismatch`；`roleId` 为内置保留 `su` 或含 `/` ⇒ `invalid-project-role-id`。
   - 负例（逐章节）：按 `ROLE_CARD_REQUIRED_SECTIONS` 的测试规则逐章节从 A17 样卡删除标题与正文，每条断言错误消息**恰为** `role-card-section-missing:<label>`（10 次，逐 label 命中，非笼统缺章节）。
5. **validator 锚点**：A17 validator.file/symbol = `src/common/门禁引擎/boundary-core.ts` / `validateRoleDocumentsSnapshot`，并断言该文件真实 `export function validateRoleDocumentsSnapshot(`；note 指向 `ROLE_CARD_REQUIRED_SECTIONS`。

### 2.2 A18 `boundary-md/v1` / A19 `boundary-yaml/v1` —— 边界两份恒等与严格 YAML

1. **私有常量源码字面量冻结**（`boundary-yaml.ts` 未导出，按源码文本断言）：
   - `KINDS = ["file","directory","conditional-directory"]`
   - `ROOTS = ["project","skill"]`
   - `TOP_KEYS = ["role","entries","archived"]`
   - `ENTRY_KEYS = ["kind","path","purpose","root","condition"]`
2. **spec 字段交叉**：
   - A18 `类型列` 含 file/directory/条件目录；`路径列` 披露条件目录必须给合法 condition slug。
   - A19 `entries[].kind` 逐项包含 KINDS；`entries[].root` 逐项包含 ROOTS；`entries` 字段逐项包含 ENTRY_KEYS；`未知顶层键` 错误的 cause+fix 逐项包含 TOP_KEYS；`archived 必须是布尔值` 已登记。
3. **条件目录 slug**：`CONDITION_SLUG_PATTERN.source === "^[a-z][a-z0-9-]*$"`（`src/model/boundary.ts` 导出，直接 import）；`isValidConditionSlug` 正例（`role-restructuring`、`role-restructuring-2`）/负例（`Role_Restructuring`、`1bad`、`bad_slug`）；A19 `entries[].condition` 字段 `presence:"conditional"` 且披露 condition slug。
4. **`validateBoundaryYamlText` 正负例**：
   - 正例：A19 spec example ok 且非空；条件目录条目 ok 且 `condition` 保留；`parseBoundaryYamlDoc` 对 `archived:true` 如实回传、缺省 `undefined`。
   - 负例（断言到稳定文案）：未知顶层键 `version`/`roleId`/`root`；条目未知键 `owner`；`kind` 非法；`root` 非法；`condition` 缺失/非法；`archived:"true"` 非布尔；`entries` 缺失；顶层非映射；YAML 语法错误；`path`/`purpose` 为空。
5. **boundary.md↔yaml 恒等**：
   - 正例：A18/A19 spec 样例经 `parseSnapshotRoleDocuments`/`validateRoleDocumentsSnapshot` ok；返回条目 deepEqual 严格 YAML 解析结果。
   - 负例（⇒ `boundary-md-yaml-mismatch`）：yaml 多一条、yaml 重复条目、yaml 空集、md 多一条。
6. **其它稳定 code**：`archived:true` ⇒ `frozen-role-archived`；yaml `role:` 标签与目录 roleId 不一致 ⇒ `boundary-role-mismatch`；项目角色条目为条件目录 / 路径逃逸（`../escape/`）⇒ `invalid-role-boundary-scope`（md/yaml 先恒等、后范围校验的真实顺序）。
7. **validator 锚点**：A18 → `boundary-core.ts` / `parseSnapshotRoleDocuments`；A19 → `boundary-yaml.ts` / `validateBoundaryYamlText`（均为真实导出符号）。

### 2.3 A21 `mcp-declaration/v1` —— 七键与私有常量交叉（与运行时核心 pin 分工，不重复）

1. **七键逐项相等**：spec 字段名（用途/启动/参数/环境/适用角色/状态/安装日期）与 `src/common/runtime-core/mcp-declarations.ts` 的声明键解析正则 `(用途|启动|参数|环境|适用角色|状态|安装日期)` 提取的键集**顺序与成员逐项相等**。
2. **私有常量源码字面量冻结**（不新增公共出口）：
   - `NAME_PATTERN = /^[A-Za-z0-9_-]+$/`；spec `name-invalid` 规则包含字符类 `[A-Za-z0-9_-]+`。
   - `RESERVED_NAMES = ["ans","ans_codex"]`；两成员均出现在 spec `reserved-name` 加载检查/错误面。
   - `ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/`；spec 声明「值字面量或 `env:NAME`」，示例 `DEMO=1; TOKEN=env:DEMO_TOKEN` 的 env 名/引用名均满足该常量（运行时重建 RegExp 验证，不 import 私有实现）。
3. **路径/状态口径**：`pathPattern === "docs/mcp/<name>.md"`；源码 `MCP_REL = "docs/mcp"`、`DECLARATION_EXT = ".md"`；`状态` 字段披露 `installed/uninstalled`；`declaration-parse-failed` 加载检查存在。
4. **行为正例**：A21 spec example 写入临时项目 `docs/mcp/demo.md` 后，`readMcpDeclaration` 返回完整七键视图（`env` 原文不展开：`{DEMO:"1", TOKEN:"env:DEMO_TOKEN"}`）；`listInstalledMcpServers(root,"product")` 返回 `InstalledMcpServerV1` 三/四字段形状。
5. **行为负例**（`readMcpDeclaration` 一律 `undefined`、绝不抛错）：`bad.name`（name-invalid）、`ans`（reserved-name）、env 名 `1BAD`、env 引用 `env:DEMO-TOKEN`、env 值 `!run`、状态 `paused`、缺 `启动` 行；`listInstalledMcpServers` 诊断 reason 集合逐项对照（`name-invalid`/`reserved-name`/`declaration-parse-failed`）。
6. **validator 锚点**：A21 → `src/common/runtime-core/mcp-declarations.ts` / `readMcpDeclaration`（真实导出）。

### 2.4 既有片段（只读，不改写）

| 片段 | 断言 |
| --- | --- |
| `角色卡/编排/boundary.md` | `parseBoundarySection1` 宽松解析产出非空条目，全部 kind ∈ KINDS、root=project |
| `角色卡/产品/boundary.yaml` | `validateBoundaryYamlText` ok 且条目非空 |
| `角色卡/编排/boundary.yaml`、`角色卡/门禁引擎/boundary.yaml` | 同上 |
| `角色卡/门禁引擎/boundary.md` | 真实标记解析器产出非空条目 |
| A17 spec example（10 章节最小模板） | 经 `validateRoleDocumentsSnapshot`/`parseSnapshotRoleDocuments` 为 ok（样例即测试输入，不另写夹具副本） |

## 3. 测试与运行记录

命令均在 worktree 根执行；Node v24.22.1（`node-version.txt`）。

### 3.1 本批 pin 测试（任务指定命令）

`node --test --test-concurrency=1 test/门禁引擎/doc-format-specs-pin.test.ts`

| | tests | pass | fail | cancelled | skipped | exit |
| --- | --- | --- | --- | --- | --- | --- |
| before | —（文件不存在：`git log --all` 空、`git ls-files` 未跟踪，见证据） | — | — | — | — | — |
| after（候选） | **19** | **19** | **0** | **0** | **0** | **0** |

TAP 日志：`pin-test-post.tap.txt`（SHA-256 `43b096ca017a9b6124fc3d58d29ac6110ae2481d868ccb533fd4cfbfd12cdc5a`）。19 个用例：validator 锚点 1、A17 四例（常量/字段/路径/逐章节负例）、A18/A19 五例（私有常量/spec 交叉/正例/严格负例/slug）、恒等三例（正例/不一致负例/归档与 role 标签）、范围负例 1、A21 四例（七键常量/文本口径/正例/负例）、既有片段 1。

### 3.2 相关只读回归（不修改、计数不变）

| 套件 | 结果 | 日志 SHA-256 |
| --- | --- | --- |
| `node --test --test-concurrency=1 test/门禁引擎/boundary-yaml.test.ts` | **13 tests / 13 pass / 0 fail / 0 skip，exit 0**（全过） | `45c88818f8ab54ad969fc536ff764db53a47d505503025b71524e2c4f7caf198` |
| `node --test test/编排/doc-format-specs.test.ts`（B1） | **24 tests / 24 pass / 0 fail / 0 skip，exit 0**（与 B1 声明 24/24 一致，不变） | `2babad07643cc4158e1d3b2dd21d271955cbd37a2e0892bd8132a3eae03c2393` |

### 3.3 静态门

`npm run typecheck`（`tsc --noEmit`）：**exit 0**（`typecheck-post.txt`，SHA-256 `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`）。

## 4. 候选身份（本批）

| 项 | 值 |
| --- | --- |
| 新文件 | `test/门禁引擎/doc-format-specs-pin.test.ts` |
| 行数 / 字节 | 678 行 / 33,709 bytes（+678/−0） |
| SHA-256 | `45b1ce34ed2d06f460264b252d2d702bebd78d55bf155c2922af1b39f520d369` |
| 聚合（`path + "\0" + sha256`，按路径排序后 SHA-256；单文件） | `2e9fb006258d2401ca6d603785a77cfcc72296c67330b1d97d5b88b388d5d765` |
| 写集外改动（本批） | **0**（本批只新增上述测试文件 + 本记录 + 证据目录；未编辑任何 `src`/`app`/其它 `test` 文件） |

复算命令（记录于 `candidate-hashes.txt`）：`sha256(file)`，再 `sha256("test/门禁引擎/doc-format-specs-pin.test.ts" + "\0" + sha256)`。

## 5. 偏差、限制与披露（如实）

1. **并发写者（重要，非本批改动）**：本批运行期间，同一 worktree 出现运行时核心 B2（doc_format 工具）在飞改动：`src/model/runtime.ts`（+36）、`src/provider/runtime/schema.ts`（+26）、`src/provider/runtime/tools.ts`（+95）（`concurrent-diffstat.txt`；mtime 22:14:30–22:14:59，与本批写文件同窗口），其后 `test/runtime-core/doc-format-specs-pin.test.ts` 亦出现（mtime 22:15:38，晚于本批候选 TAP 运行；`concurrent-mtimes.txt`/`scope-status-src-app-test.txt`）。B1 的 `src/common/编排/doc-format-specs.ts`、`test/编排/doc-format-specs.test.ts` 亦为既存未跟踪文件（只读 import；本批复核 SHA-256 分别恒为 `f141e4ba…`、`f9abe8f3…`）。以上**均非本批改动、未计入本批候选**；本批 `src app test` 的自身 diff 仅新测试文件一个。`npm run typecheck` 在含 B2 在飞状态的同一工作树上 exit 0；B2 复取基线时应按 BASE-1 重取，不得把本批 before/after 当作唯一基线。
2. **MCP `ENV_NAME_PATTERN` 的 pin 方式**：A21 spec 文本未逐字写出 env 名正则（只写「值字面量或 `env:NAME`」）。本批按三层交叉钉住：(a) 源码字面量 `^[A-Za-z_][A-Za-z0-9_]*$` 冻结；(b) spec 的正例 env 名/引用名经运行时 RegExp 验证满足该常量；(c) 真实 parser 拒绝非法 env 名/引用名。**残余**：若未来要求 spec 文本直接展示 env 名字符集，需 B1 文件修订（非本批授权），本批未改 spec。
3. **既有片段口径（如实观察，未修改）**：只读探测发现仓库现状 `角色卡/编排/boundary.md` 与 `角色卡/编排/boundary.yaml` 的条目集合**并非恒等**（md 多 `src/interface/cli/init.ts`、yaml 多 `src/pipeline/orchestration/pm-reviewer.ts`，各 32 条）。该恒等约束仅由 appointment 快照校验（`validateRoleDocumentsSnapshot`）强制，运行时既有角色加载只读 YAML；本批测试按任务口径只断言这两个片段「经真实 parser 为 ok」，**未断言其相互恒等、未修改该角色边界文件**（不属本角色写集）。此观察不影响本批钉住结论；如需修复应由编排角色按其边界处理。
4. **A17 章节匹配口径差异**：校验实现（`boundary-core.ts`）按「任一 `#{1,6} 空白` 行」匹配；展示解析（`role-card-sections.ts`）忽略 fenced code block——spec A17 已如实披露该差异，本批断言跟随 spec 文本，不改变实现。
5. **未运行真实模型/Electron**：本批为确定性层（L2 门禁 pin），不占用 9222/9223，不宣称真实运行；真实运行证据属 RR 层。
6. **未新增 skip/force-exit**：19 个用例全部确定性执行，无 skip、无 todo、无 watchdogs；未删除/弱化任何既有断言（本批不改既有测试）。
7. **typecheck 与并发**：typecheck 覆盖 `src`/`test`/`app`（含 B2 在飞文件）并 exit 0；若 B2 后续改动编译面，应由 B2 按其流程重跑。

## 6. 证据

目录：`角色卡/门禁引擎/docs/change/2026-11-09_W3_document-format-specifications-evidence/`

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `pin-test-post.tap.txt` | 候选 pin TAP（19/19/0/0/0，exit 0） | `43b096ca017a9b6124fc3d58d29ac6110ae2481d868ccb533fd4cfbfd12cdc5a` |
| `boundary-yaml-regression.tap.txt` | 只读回归（13/13/0/0，exit 0） | `45c88818f8ab54ad969fc536ff764db53a47d505503025b71524e2c4f7caf198` |
| `b1-registry-post.tap.txt` | B1 注册表测试（24/24/0/0，exit 0） | `2babad07643cc4158e1d3b2dd21d271955cbd37a2e0892bd8132a3eae03c2393` |
| `typecheck-post.txt` | `npm run typecheck` 输出（exit 0） | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| `baseline-head.txt` | HEAD `3cd55dc…` + 分支 `feat/document-format-specifications` | `cc0f2d403705ac26b3af8a25aa71e2a95f5ec9ec156241788dfb570b46c3a4f0` |
| `node-version.txt` | Node v24.22.1 | `b8a527ca60b496131eccd1fcbeccf289ebc0a7e63be57e4b4c6f8f67648bcc07` |
| `candidate-hashes.txt` | 候选文件 SHA-256 + 聚合 | `1bfcb63d38aa258f7c81e7ff00b5b31ee333bdc9f78048c480e86e9887676ff7` |
| `candidate-numstat.txt` | 678 行 / 33,709 bytes | `7e840606a419eca0fe7d8ba9d400d41bce174b7a3d67d97aeb7fb30e5f744210` |
| `scope-status-src-app-test.txt` | `git status --porcelain -- src app test`（含 B2 在飞文件，见 §5.1） | `664cea2f7462fd3883402d59aa1244ad1e9e8fdd0fb7315bda5e723277f3727d` |
| `new-file-status.txt` | 新测试文件状态（`??` 未跟踪） | `cc750441c23231cc145d27b9d097a68041317ae12417504533f9c803ca7c4cd0` |
| `new-file-tracked-before.txt` | `git ls-files --error-unmatch` 失败（从未跟踪） | `736a56c1b4e7116cfa0bd666b4ec30d1bebb29e740d979c4ade76e10694d9ccb` |
| `new-file-never-committed.txt` | `git log --all` 空（任何提交都不存在该路径） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`（空文件） |
| `concurrent-diffstat.txt` | B2 在飞三文件 diffstat（+157，非本批） | `4e462732e35685fda5f6f6515abf6e1e1f4749cfc6db91d0d2d142d9336fed96` |
| `concurrent-mtimes.txt` | 并发写者与本批文件 mtime | `094239e36e5c68a2c32c167dfc9f2d0d2e3749f130053bfd9fbc9e6c28835ec1` |
| `write-set.txt` | 本批写集清单 | `39e90f89aa48c6c29f3a9d1729246a1ee71b745141d5f47a617d533b251ed83d` |

## 7. 未提交声明

本批**未提交、未推送、未合并、未发布、未打 tag**；未运行真实模型/Electron；未占用端口 9222/9223；未修改方案/B1/团队计划/其它角色资料或产品代码；未新增依赖/目录/构建配置。
