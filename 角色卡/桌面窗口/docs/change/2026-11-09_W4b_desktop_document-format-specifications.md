# W4b：文档格式权威说明（T2）桌面注入批次实施记录

- 日期：2026-11-09；角色：ans-studio 固定 worker「桌面窗口」（roleId: 桌面窗口，独立上下文）。
- 变更：`每个文档格式的权威说明与全员可读（T2）` 的 **B4b 桌面注入批次**——桌面 `docFormat` 能力注入（6 个内置治理角色 + 项目角色全员）、静态早退数据源 `docFormatText`、恢复新建 `test/桌面应用/session.test.ts`（TM-12）。
- 团队计划：`docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`（101 行 / 15,475 bytes / SHA-256 `4d99586f6b32d884ab461307541e7f01f82cc092f0e5c9eaaeabc42f615ebdc2`）§三/§四。
- B1 v1（冻结判据）：`docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（482 行 / 69,121 bytes / SHA-256 `bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe`）；本批逐条对照 §2.1 W8/W9（文件 8/9）、§3.9 AC-9、§3.10 AC-10、§4.1 TM-12、§4.3、§9.3 G1、§9.1 R-7 / BASE-7。
- 方案 P1.2：`docs/planning/2026-11-09_design_document-format-specifications.md`（979 行 / 146,555 bytes / SHA-256 `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`）§3.1、§4.1、§4.2、§4.5、§4.6。
- 工作目录：git worktree `.claude/worktrees/trunk-amendment`；分支 `feat/document-format-specifications`；基线 HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad26d768297cb076af4f8e24316c7d71b7`）；Node **v24.22.1**。
- 前置在飞（只读消费，未修改）：B1 `src/common/编排/doc-format-specs.ts`（**SHA-256 `f141e4ba3314f3a67673f83fa70daf8a80ac5fca7270b214eb30aeeba1008871`**，与任务给定 `f141e4ba…` 一致）；B2 `src/model/runtime.ts` / `src/provider/runtime/{tools,schema}.ts` + `test/runtime-core/doc-format-specs-pin.test.ts`；B3 `test/门禁引擎/doc-format-specs-pin.test.ts`；B4a `src/pipeline/orchestration/run-role.ts`（`AdapterCapabilities.docFormat?`、`openRoleSession` 输入 `docFormat?`、两处透传）。
- 状态：**B4b 已实施（2 文件 + 本记录）；新建 `test/桌面应用/session.test.ts` 7/7 通过；`npm run typecheck` exit 0；只读回归 17/17、24/24、11/11；`test/桌面应用/chief-workflow.test.ts` diff = 0（未运行/未修改，D1 统一跑）；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。**

## 0. 写集（3 项，全部在本角色 Section 1）

| 文件 | 性质 | 改动（numstat） |
| --- | --- | --- |
| `app/desktop/session.ts` | 修改 | +32/−1 |
| `test/桌面应用/session.test.ts` | **新建（恢复已删除路径 `4c24149`）** | +588/−0 |
| `角色卡/桌面窗口/docs/change/2026-11-09_W4b_desktop_document-format-specifications.md`（本文件） | 变更记录 | — |

- **未改**：B1/B2/B3/B4a 在飞文件、`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts`（diff = 0）、`optional-acceptance.test.ts`、`app/renderer/**`、`角色卡/**` 的 role-card/boundary、`docs/**`（本记录与既有治理文档除外）、parser/validator 实现；未新增依赖/目录。
- 写集外 `src app test` 状态（本批结束实测）：`git status --porcelain -- src app test` = 本批 2 文件（`M app/desktop/session.ts`、`?? test/桌面应用/session.test.ts`）+ **开工前已在飞**的 4 个 M（`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`）与 4 个未跟踪新文件（`src/common/编排/doc-format-specs.ts`、`test/编排/doc-format-specs.test.ts`、`test/runtime-core/doc-format-specs-pin.test.ts`、`test/门禁引擎/doc-format-specs-pin.test.ts`）；本批未编辑后者（B1 文件 hash 与给定冻结标识 `f141e4ba…` 逐字一致；其余在飞文件 hash 见 §6.3）。

## 1. `app/desktop/session.ts` 实现（4 处，逐条）

1. **类型导入（`:6`）**：`DocFormatFn`/`DocFormatInput` 加入既有 `import type … from "../../src/model/runtime.ts"`（形状单一来源＝运行时核心 `model/runtime.ts`；不在桌面另立第二形状）。
2. **数据源导入（`:169-172`）**：`import { docFormatIndexText, docFormatSpecText } from "../../src/common/编排/doc-format-specs.ts"`——与既有 `workflow-preconditions.ts`（`contractSchemaText`）同类的**公开只读入口**先例；桌面只渲染注册表静态文本，不复制第二份格式说明。
3. **注入（`:3889-3896` 闭包 + `:4387-4390` 输入对象属性）**：在 `openRoleSession` 输入对象中与 `contractCheck` **相邻**新增
   `const docFormat: DocFormatFn = (input: DocFormatInput) => this.docFormatText(req.projectRoot, req.roleId, input);`
   与属性 `docFormat,`——**无条件注入**，所有角色会话（6 个内置治理角色 + 项目角色，走同一条 `openRoleSession` 路径；项目角色不依赖技能安装/动态 id 登记）。另把该字段补入 `SessionManagerDeps` 内联镜像类型（`:688-689`，与既有「入参形状镜像编排当前公开输入」注释一致；B4a 已在编排侧提供该输入字段）。
4. **数据源方法（`:10431-10444`）**：`private async docFormatText(projectRoot: string, callerRoleId: string, input: DocFormatInput): Promise<string>`（与 `contractCheckText` 同型，S1），**第一条语句静态早退**：
   ```ts
   if (input.format === undefined || input.format.trim() === "") return docFormatIndexText();
   return docFormatSpecText(input.format, input.part);
   ```
   早退前不调用 `getListing`/`refreshListingNow`/任何 `readFile`/`writeFile`；不读 run/项目/角色事实；不写盘/不入队/不改会话状态；未知 id 由注册表返回纯文本（数据源不抛）；`{ok,message}` 信封与 8 KiB 防御性截断在运行时核心工具包装层（B2）统一生成。

- **不改**：`contract_check`/`customer-input.ts`/judge 路径/其它行为；未注入能力时工具不注册的既有纪律不变（本批桌面对普通角色会话恒注入；未注入场景由编排/运行时核心层测试覆盖，见 §3.2）。
- **judge / 有界 Chief 隔离（结构性）**：judge 会话（「替我审」/「替我决策」）不经过本输入对象（各自经 `createShellJudge`/`createGovernanceJudge` 构造，工具集走 `buildShellJudgeTools`/`buildGovernanceJudgeTools` 恰三只）；有界 Chief 决策会话在 `chiefDecision.execute` 中以**独立输入对象** `{ roleId:"chief", project, runtime, chiefDecisionContext, decidePendingRequest }` 调 `openObservedRoleSession`——**未加** `docFormat`（源码钉 + 真实路径测试，见 §3.2）。

## 2. `test/桌面应用/session.test.ts`（新建：恢复已删除路径）

- **路径状态**：`git cat-file -e HEAD:test/桌面应用/session.test.ts` ⇒ `fatal: path ... exists on disk, but not in 'HEAD'`（基线**不存在**）；删除提交 `4c24149`（`test(batch-D3): register D removals and evidence`，该提交对本文件 `2688 deletions`）；边界 §1 一直列为单文件（`角色卡/桌面窗口/boundary.yaml:99`、`boundary.md:39`），B1 BASE-7/R-7 按「新建（恢复已删除路径）」处置，**H1 delta = 0**。本批记录边界漂移（§5）。
- **测试夹具即真实路径**：注入矩阵用**真实 `openRoleSession`**（编排）× 官方 `createRuntimeAdapterFactory` × `providerFactories.demo`（`createDemoRuntimeAdapter`）全链；桌面数据源捕获自真实 `SessionManager.open` 注入的 `docFormat`；有界 Chief 用真实 `chiefDecision.execute` 构造点。无手写替代数据源/注册表。
- 7 个用例（全部通过）：
  1. **TM-12/AC-9 注入矩阵**：6 个内置治理角色（chief/product/rapporteur/nominator/convener/verifier）+ 1 个项目角色（implementer，真实三文件角色卡夹具）均 `open.ok`、适配器构造恰一次、工具集含 `doc_format` 且既有 `contract_check` 保持；
  2. **AC-9 注入才注册**：真实 `openRoleSession` 不注入 ⇒ 无 `doc_format`；注入 ⇒ 恰多一只 `doc_format`，其余工具（名称/描述/schema/guidelines 投影）逐字不变；
  3. **AC-10 静态早退**：索引（缺省/空串/仅空白）与详情/`part=fields|example|errors`/render 型/未知 id 输出恒等于注册表静态文本、同一输入多次同文；spy 断言 `getListing`/`refreshListing`/`fs.promises.readFile`/`fs.promises.writeFile` **0 调用**、不外推事件、会话库存不变、输出不含项目根；
  4. **AC-8/AC-10 工具层（真实会话内 demo 脚本）**：索引=注册表、`part` 三值原样透传、未知 `format` ⇒ `ok:false` 且消息与注册表未知文本**逐字一致**、非字符串 `format` ⇒ `ok:false`（“format 参数非法”）、legacy `contract_check topic=modules` 输出 = `contractSchemaText("modules")`；
  5. **AC-10/回归 legacy `contract_check` 无 topic 事实路径**：输出前缀/legacy run 行/角色行逐字保持（注入 `docFormat` 后仍可用）；
  6. **AC-9 judge/有界不变**：`buildGovernanceJudgeTools` 恰 `judge_read_file/judge_list_dir/report_governance_judgement`、`buildShellJudgeTools` 恰 `judge_read_file/judge_list_dir/report_shell_judgement`、均无 `doc_format`；真实桌面有界构造路径（open convener → 捕获 `ctx.chiefDecision` → 真实 `execute`）打开的 chief 输入**无 `docFormat` 自有键**、工具集恰 `["decide_pending_request"]`；桌面 `createShellJudge`/`createGovernanceJudge` 工厂入参无 `docFormat` 键；
  7. **AC-8 预算**：索引 5,223 B、最大详情 4,089 B（`project-roster/v3`）、均 ≤8192 B、54 个 id 全量可发现（B1 实测 pin）。

## 3. 验证（命令 / 计数 / 日志 hash）

### 3.1 本批文件（before/after）

| 文件 | before | after |
| --- | --- | --- |
| `test/桌面应用/session.test.ts` | **不存在**（`git cat-file -e HEAD:…` 失败；删除于 `4c24149`） | `node --test --test-concurrency=1 test/桌面应用/session.test.ts` ⇒ **tests 7 / pass 7 / fail 0 / cancelled 0 / skipped 0 / todo 0，exit 0**（日志 SHA-256 `3d1379546fcc35ce6455affb82aa2e179f30994da7394346c38b5776b9557c8d`，1,016 B） |

### 3.2 只读回归（未修改，确定性）

| 套件 | 计数 | exit | 日志 SHA-256 |
| --- | --- | --- | --- |
| `test/桌面应用/rejection-copy.test.ts`（contract_check 既有） | 17 / 17 pass / 0 fail / 0 skip | 0 | `419e19994d11f301f061263ef454b743e45cdef1104063001ad434c41c9ad917`（1,877 B） |
| `test/编排/doc-format-specs.test.ts`（B1） | 24 / 24 pass / 0 fail / 0 skip | 0 | `b05c9d805032874a7d80e0d56bbb565386f15f8e31bf128d59f46b173a07f8de`（2,918 B） |
| `test/runtime-core/doc-format-specs-pin.test.ts`（B2） | 11 / 11 pass / 0 fail / 0 skip | 0 | `407479683060e5b3669a19a73dfa77d5d2510aca6b799130893aff90d27f45f5`（1,567 B） |
| `test/桌面应用/chief-workflow.test.ts` | **不运行/不修改**（D1 统一跑）；`git status`/`git diff --stat` 均为空 ⇒ diff = 0 | — | — |

- `npm run typecheck` ⇒ **exit 0**（日志 SHA-256 `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`，43 B）。
- **新增确定性失败 = 0；新 skip = 0**；未删除/弱化任何既有断言（本批只新增测试文件）。

## 4. 注入矩阵（B1 AC-9；真实全链实测）

| 会话类型 | 注入 `docFormat` | 工具集（实测） | 依据 |
| --- | --- | --- | --- |
| chief / product / rapporteur / nominator / convener / verifier | **是** | 含 `doc_format`（与 `contract_check`/`evidence_check` 并存） | `SessionManager` → 真实 `openRoleSession` `capabilities.docFormat` → 适配器工具集 |
| 项目角色（implementer 夹具） | **是** | 含 `doc_format` | 同一 `openRoleSession` 路径；不依赖技能/动态 id 登记 |
| judge（「替我审」/「替我决策」） | 否 | `judge_read_file`/`judge_list_dir`/`report_shell_judgement` 或 `…/report_governance_judgement` **恰三只** | `buildShellJudgeTools`/`buildGovernanceJudgeTools`（结构性不经 `buildGovernedTools`）；桌面 judge 工厂入参无 `docFormat` 键 |
| 有界 Chief 决策会话（`chiefDecisionContext`） | 否 | **恰 `["decide_pending_request"]`**（即便调用方误在输入上给 `docFormat` 也不注册） | 真实桌面 `chiefDecision.execute` 构造点测试 + 真实 `openRoleSession` 有界分支（B4a：bounded 分支不转发 `docFormat`） |
| 未注入能力（CLI/旧调用方） | 否 | 无 `doc_format`，其余逐字不变 | 真实 `openRoleSession` 不注入对照测试 |

## 5. 边界漂移记录（B1 BASE-7 / R-7）

- `test/桌面应用/session.test.ts` 于提交 **`4c24149`**（`test(batch-D3): register D removals and evidence`）被删除（本文件 2,688 行删除），但 `角色卡/桌面窗口/boundary.yaml:99` 与 `boundary.md:39` 始终列为本角色 Section 1 单文件；`docs/acceptance/2026-11-08_session-admission-approval-report-v1.md:153` 已记录「确为 `4c24149` 删除、边界仍列；未恢复/未新建，交人事/治理」。
- 本批按 B1 BASE-7（恢复已删除路径）**新建**该文件：**不新增目录、不改边界文件、H1 delta = 0**；本记录即交付回执中的边界漂移登记（删除提交 / 边界仍列 / 本批恢复）。

## 6. 候选身份（仅写集 2 文件）

### 6.1 逐文件 raw SHA-256 / numstat / 行数

| 路径（仓库相对） | SHA-256 | bytes | 行数 | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | `df5bf7b0315410791e4c58a6c3e3caaac6f1d4312ff4751957d454e7a569fe14` | 728,423 | 11,225 | +32 / −1 |
| `test/桌面应用/session.test.ts` | `23bc19a723ef6c3c0c19259fee58179e779578ed6fbd726e6b094f1d8ef9085e` | 26,853 | 588 | +588 / −0（新文件） |

### 6.2 聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）

`266f526da1226ac1eed56394a618e5d4abd68f1efbf99c7e309d0cd9402a4219`

### 6.3 写集外 `src app test`（开工前已在飞；本批未编辑，记录当前 hash 供协调方对账）

| 文件 | SHA-256 | 说明 |
| --- | --- | --- |
| `src/common/编排/doc-format-specs.ts` | `f141e4ba3314f3a67673f83fa70daf8a80ac5fca7270b214eb30aeeba1008871` | B1 冻结标识一致 |
| `src/model/runtime.ts` | `89e5fbc97b3a3f6994cf858696750fe6d3acfbe45ed1d0cf571b8a35037f4959` | B2 在飞 |
| `src/provider/runtime/tools.ts` | `b07c3f805ab9eb88f13d4a6d4098b001d101e04b59b6162f57eda1e47a06ba79` | B2 在飞 |
| `src/provider/runtime/schema.ts` | `fd3ee646e07e6d6beb3ba006a5f3079de5fb92c2fc08909dc6c9f4322e7a13a6` | B2 在飞 |
| `src/pipeline/orchestration/run-role.ts` | `d754d767298de61b956b29e6fe8873640d53359765c9dfce45abc548f6003258` | B4a 在飞 |
| `test/编排/doc-format-specs.test.ts` | `f9abe8f35fbe920cf14c53c4fb9f2e9df5017f03741200bf2b2050753e1395c4` | B1 在飞 |
| `test/runtime-core/doc-format-specs-pin.test.ts` | `f05471e38ca83f626856352ce85d914ec0ff85a1035c111eadc5e43659592003` | B2 在飞 |
| `test/门禁引擎/doc-format-specs-pin.test.ts` | `45b1ce34ed2d06f460264b252d2d702bebd78d55bf155c2922af1b39f520d369` | B3 在飞 |
| `test/桌面应用/chief-workflow.test.ts` | `87983bde4a21387d6b2e1b7a26c430efba73a3ccc92fe01d30cb3182c03ac494` | **diff = 0（未修改）** |

## 7. 限制与披露（如实）

1. 本批**未运行真实模型/Electron**，未占用 9222/9223；真实读取（AC-12/RR）不在 B4b 范围，由 D1/RR 统一执行。
2. **注册 ≠ 真实读取**：本批只证明 6 内置 + 项目角色会话**注册/可调用** `doc_format` 且数据源可返回静态文本；Pi/Codex 真实模型行为不作承诺（确定性覆盖，披露同 B1 R-5）。
3. 索引 5,223 B、最大详情 4,089 B 为**当前 B1 注册表实测值**（本批 pin 于测试）；若注册表后续升级，测试与记录须同步更新（specRevision 语义见 P1.2 §3.5）。
4. `docFormatText` 的 `projectRoot`/`callerRoleId` 参数按契约签名保留但**不使用**（静态公开文本、无角色差异/无项目事实）；这是 AC-10「零磁盘 I/O、不读事实」的直接体现，不是遗漏。
5. 本批只写上述 3 项；**未提交/未推送/未合并/未发布**；发布/tag 未授权。
6. 写集外无 diff（相对开工基线）；在飞 B1/B2/B3/B4a 未被本批编辑（§6.3 hash 供对账）。

**（完）**
