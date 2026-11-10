# 编排批次变更记录：`run-role` 透传 `docFormat`（B4a，文档格式权威说明 T2）

- 批次：**B4a `run-role` 透传批次**（变更「每个文档格式的权威说明与全员可读（T2）」；团队计划写集 #7）
- 角色 / 上下文：编排（roleId `编排`，独立固定上下文）；写集仅 `src/pipeline/orchestration/run-role.ts` + 本角色 `docs/change/`
- 日期：2026-11-09；worktree `.claude/worktrees/trunk-amendment`，分支 `feat/document-format-specifications`，基线 HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**
- 依据：团队计划 `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md` §三/§四；B1 `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md` §2.1 W7、§3.9 AC-9、§4.1 TM-12、§9.3 G1；方案 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md` §0.5、§3.1、§4.1、§4.2、§14 G1
- 状态：**已实现，typecheck exit 0；只读回归 53/53（29+24）、run-role 直接测试 20/20 全过**；未 commit / push / merge / 发布；未运行真实模型/Electron；未占用 9222/9223。

## 1. 实施内容（唯一产品文件 `src/pipeline/orchestration/run-role.ts`，+20/−0）

1. **类型导入**（`:157`）：`import type { …, DocFormatFn, … } from "../../model/runtime.ts"`，与 `ContractCheckFn` 相邻；形状单一来源＝B2 已落地的契约家 `DocFormatFn`（元数据第二参、纯文本返回，S1 与 `ContractCheckFn` 同型）。
2. **`AdapterCapabilities`**（`:411-416`）：在 `contractCheck?: ContractCheckFn;`（`:410`）之后新增 `docFormat?: DocFormatFn;`（加法可选；注释声明「只读、注入才注册、不构成放行/授权」）。
3. **`openRoleSession` 输入**（`:883-888`）：在 `contractCheck?: ContractCheckFn;`（`:882`）之后新增 `docFormat?: DocFormatFn;`（加法可选；同注释口径；本层纯透传同一引用，不包装、不调用）。
4. **capabilities 透传（普通角色会话分支）**（`:2120-2122`）：`...(input.docFormat !== undefined ? { docFormat: input.docFormat } : {})`，与 `input.contractCheck`（`:2119`）同条件同形式。
5. **适配器工厂透传**（`:3563-3566`）：`docFormat: capabilities?.docFormat`，与 `contractCheck: capabilities?.contractCheck`（`:3562`）相邻；`RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>`，`docFormat` 由 B2 的 `GovernedToolsOptions.docFormat?`（`src/model/runtime.ts:3617`）承接。

### 未做/边界（G1 纪律）

- `RoleSessionDeps`（`:3486-3489`）**不加** `docFormat`，保持仅 `createAdapter`/`runtimeOptions`。
- 有界 Chief 决策会话分支（`chiefDecisionContext !== undefined` 的 capabilities 三元分支）不带 `docFormat`——与既有 `contractCheck` 相同：bounded 会话工具集不变（AC-9 #2 的桌面侧注入矩阵另行取证）。
- 未注入 `docFormat` 时：字段缺席 ⇒ 运行时核心不注册 `doc_format`，既有行为逐字不变（fail-closed；B2 侧「注入才注册」）。
- 不改 `contractCheck`/既有行为；不改其它角色/工具/提示词/角色卡/边界；不新增公共出口/依赖/目录。

## 2. G1 落点核对（B1 §9.3 / P1.2 §14）

| G1 要求 | 落点（最终工作树行号） | 状态 |
| --- | --- | --- |
| `openRoleSession` 输入 `docFormat?`（`contractCheck :875`） | `:883-888`（`contractCheck` 现 `:882`） | 已落地 |
| `AdapterCapabilities.docFormat?`（`:304-438`；`contractCheck :409`） | `:411-416`（`contractCheck` 现 `:410`） | 已落地 |
| 透传 `:2106` | `:2120-2122`（`contractCheck` 透传现 `:2119`） | 已落地 |
| 透传 `:3546` | `:3563-3566`（`contractCheck` 透传现 `:3562`） | 已落地 |
| `RoleSessionDeps`（`:3470`）**不加** | `:3486-3489` 仅 `createAdapter`/`runtimeOptions` | 已核对 |

行号均为本批最终工作树实测（上方 import +1 与注释插入造成位移）；后续合并/rebase 后以符号名（`AdapterCapabilities`/`openRoleSession`/`createRuntimeAdapterFactory`/`RoleSessionDeps`）与 `docFormat` 文本锚点为准。

## 3. 本批文件清单、raw SHA-256 与 numstat

| 文件 | 行数 | raw SHA-256 | numstat (+/−) |
| --- | --- | --- | --- |
| `src/pipeline/orchestration/run-role.ts` | 3669 | `d754d767298de61b956b29e6fe8873640d53359765c9dfce45abc548f6003258` | +20 / −0 |

- 仅加法（import 1 行 + 两处字段含注释 12 行 + 两处透传含注释 7 行 = 20 行）；既有语句零删除/改写。
- diff 原件 `candidate-run-role.diff`（3,622 bytes / SHA-256 `375cf1e8…`；git 的 CRLF 警告单独记于 `candidate-run-role.diff.stderr.txt`）。

## 4. 验证结果

### 4.1 typecheck

- 基线（编辑前启动，同一工作树/环境）：`npm run typecheck` **exit 0**（`typecheck-before.log`）。
- 实施后：`npm run typecheck` **exit 0**（`typecheck-after.log`）；无写集外错误。

### 4.2 只读回归（测试文件未修改）

- `test/编排/workflow-preconditions.test.ts` + `test/编排/doc-format-specs.test.ts`：**53 tests / 53 pass / 0 fail / 0 skip**（即 29/29 + 24/24；`regression-workflow-preconditions-doc-format-specs.tap`，exit 0）。
- `run-role` 直接测试（存在并运行，未修改）：`test/编排/run-role-admission.test.ts` + `test/编排/run-role-stable-write.test.ts` + `test/编排/run-role-submit-capabilities.test.ts`：**20 tests / 20 pass / 0 fail / 0 skip**（`run-role-direct.tap`，exit 0）。

### 4.3 证据哈希（SHA-256）

| 证据 | SHA-256 |
| --- | --- |
| `candidate-run-role.diff` | `375cf1e8a3ed65570d6d1abe1de5f0a75fb835595d98b4f501b422232407125c` |
| `candidate-run-role.sha256.txt` | `0e074b393ac175dda18d83b608848c9f221a4c01ee216fb238ee403947335d39` |
| `write-set-external.status.txt` | `16402f480c3cae815f88d806f3c07bf2b596099dc07554b9d421af2efa1a3f32` |
| `regression-workflow-preconditions-doc-format-specs.tap` | `89b495787f46b7d3760fdaf2d854d3a32e360c1333a26e8faae6c898c59a3b25` |
| `run-role-direct.tap` | `677b42a00f0b1fbe3f7117eeed6a07da0253f9428327ab67f618dfb8e80aef1a` |
| `typecheck-before.log` | `18fe318746f03b5150292b844384bf7bbe62335315f489493a47d81f9935a8aa` |
| `typecheck-after.log` | `d4e088834210a24934ea8a148de6f550d33472c337fc4651ae1407ef695c0388` |

## 5. 写集外 diff = 0（在飞 B1/B2/B3 未改）

实施开始与结束的 `git status --porcelain -- src app test` 集合一致（除本批 `run-role.ts` 外），在飞文件本轮前后哈希均未变：

- B1：`src/common/编排/doc-format-specs.ts` `f141e4ba3314f3a67673f83fa70daf8a80ac5fca7270b214eb30aeeba1008871`；`test/编排/doc-format-specs.test.ts` `f9abe8f35fbe920cf14c53c4fb9f2e9df5017f03741200bf2b2050753e1395c4`
- B2：`src/model/runtime.ts` `89e5fbc97b3a3f6994cf858696750fe6d3acfbe45ed1d0cf571b8a35037f4959`；`src/provider/runtime/tools.ts` `b07c3f805ab9eb88f13d4a6d4098b001d101e04b59b6162f57eda1e47a06ba79`；`src/provider/runtime/schema.ts` `fd3ee646e07e6d6beb3ba006a5f3079de5fb92c2fc08909dc6c9f4322e7a13a6`；`test/runtime-core/doc-format-specs-pin.test.ts` `f05471e38ca83f626856352ce85d914ec0ff85a1035c111eadc5e43659592003`
- B3：`test/门禁引擎/doc-format-specs-pin.test.ts` `45b1ce34ed2d06f460264b252d2d702bebd78d55bf155c2922af1b39f520d369`
- 本批新增 tracked 修改 = `src/pipeline/orchestration/run-role.ts` 仅此一项；未触碰 `app/**`、其它 `src/**`、其它 `test/**`、角色卡/边界/文档；无新依赖/目录/构建发布配置。

## 6. 限制与披露

1. 本批只做确定性实施与逐文件回归；未运行真实模型/Electron/UI；未占用 9222/9223；未做 B1 AC-9 的桌面注入矩阵/真实调用取证（属桌面窗口/测试/真实运行批次）。
2. 基线 typecheck 为编辑前后台启动、结束于首行 import 编辑之后（该编辑仅新增既有类型的 import）；最终 after 运行同为 exit 0，结论不受影响。
3. `doc_format` 是否真正注册给 6 内置 + 项目角色、judge/有界会话是否不变，取决于桌面窗口注入（`app/desktop/session.ts`）与 `buildGovernedTools`「注入才注册」；本批只证明编排透传面按 G1 落地且未注入时逐字不变（fail-closed）。
4. 未改 `contractCheck`/既有行为；未注入 `docFormat` 的 CLI/旧调用方路径行为逐字不变（字段缺席）。
5. 行号为最终工作树实测；合并/rebase 后按符号锚点复核。

## 7. 未提交声明

未 commit、未 push、未 merge、未发布/tag；工作树保留本批 `run-role.ts` 修改与在飞 B1/B2/B3，由协调方按流程处理。

## 8. 证据目录

`角色卡/编排/docs/change/2026-11-09_W4a_run-role_document-format-specifications_evidence/`：

- `candidate-run-role.diff`（git CRLF 警告另见 `candidate-run-role.diff.stderr.txt`）
- `candidate-run-role.sha256.txt`（raw SHA-256 + 行数 + numstat）
- `write-set-external.status.txt`（最终 status + `RoleSessionDeps` 未加字段核对）
- `typecheck-before.log` / `typecheck-after.log`
- `regression-workflow-preconditions-doc-format-specs.tap`
- `run-role-direct.tap`
