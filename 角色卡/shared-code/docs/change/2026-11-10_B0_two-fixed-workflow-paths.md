# B0（shared-code 批次）：`workflowSchema` 载入/校验

- **任务**：T3「两条固定工作流路径」**B0 基础设施/账本**之 shared-code 批次（任务 ID `2026-11-10-two-fixed-workflow-paths`）
- **角色**：`shared-code`（共享代码维护角色，固定 worker 上下文）
- **日期**：2026-11-10
- **检出**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；分支 `feat/two-fixed-workflow-paths`；开工 HEAD `ad22192`；代码基线 `10f90c7`）
- **性质**：本角色自证证据（D1 级），**不是验收结论**（B2 由独立验收按 B1 判定）；不授权/不执行提交、推送、合并、发布；未运行真实模型/Electron。
- **自引用声明**：本文件不嵌入自身 SHA-256（落盘后由完成报告/验收复算）；其余文件 hash 均为写盘后原字节复算（Windows 工作树 CRLF；同时给出 git blob oid 便于复核）。

---

## 1. 依据与范围

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 验收标准（冻结；本批按 **AC-12** 的 loader 部分取证） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| 实现方案 v1.3（冻结）§4.1（workflowSchema 默认/强制、写回归 workflow-service）、§5.2/§5.5、§9.4、§10.3 | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划 §三 B0（shared-code 写集：`src/common/shared/config-loader.ts`、`test/项目管理/shared/**`） | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 / 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |

**本批做**：`.ans/project.json` 可选 `workflowSchema`（`"two-fixed-paths/v1" | "legacy/v1"`）的**载入/校验**，作为纯值写入 `ProjectConfig.workflowSchema`；缺省不设（旧行为逐字不变）；非法值 fail-closed；保留既有键（governanceModel/roles/acceptance/pin 等）逐字不变。

**本批不做**（按派发与本角色写集）：per-flow `workflowMode` 判定（编排）、`.ans/project.json` 原子写回（编排 `workflow-service.ts`）、`.gitignore`/clean（编排/桌面）、fixed 业务与状态机；不改 `src/model/role.ts`（门禁引擎属主，只读 import）、`src/model/runtime.ts`、`src/common/编排/**`、`src/common/roles/**`、`app/**`、其它角色/文档；不新增依赖。

---

## 2. 输入（开工实测）

| 文件 | 开工时状态 / hash |
| --- | --- |
| `src/common/shared/config-loader.ts`（HEAD blob，LF 归一化） | `git show HEAD:…` = `6e5bc8d569b9ac874c04e7860c6c930e7d16ce24eb47410e9bcf01a20c4dea48`（工作树 CRLF 原字节为 `c59873fd…`） |
| `test/项目管理/shared/config-loader.test.ts`（HEAD blob） | `c86d0039181ff852c6a297c49f03952a3207f195be7e1736272795a7374b2685` |
| `src/model/role.ts`（门禁引擎并行写集；开工 blob） | `dfaffd941180bca11be1be0b55c1c56ce431e54465846b577a8ce592c9fcd0ff` |
| 环境 | Node `v24.22.1`；npm `11.19.1`；tsc `7.0.2`；Windows 11 |

**并行状态披露**：开工时 `git status --porcelain -- src app test` 为空；批次期间同一工作树有**两个并行 B0 批次**写盘：
1. **门禁引擎**：`src/model/role.ts`（新增 `ProjectConfig.workflowSchema?: "two-fixed-paths/v1" | "legacy/v1"` 及 `DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`/`RoleContextInput.matrix`）、`test/门禁引擎/role-module-contract.test.ts`、新增 `test/门禁引擎/dispatch-matrix-mode.test.ts`；
2. **运行时核心**：`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/stable-write-card-kind.test.ts`（批次后段观测到写盘中间态，一度使 `runtime.ts` 语法不可加载，详见 §4.2 与 `_evidence/08-parallel-transient-breakage.txt`）。

上述文件**非本角色改动、未触碰**；本批的 `config-loader` 按团队计划只读消费其 `ProjectConfig.workflowSchema`（值域类型单一来源）。

---

## 3. 变更（逐文件）

### 3.1 `src/common/shared/config-loader.ts`（M；+38 / −3 行）

1. **新增内部类型与守卫**（不新增公开导出）：
   - `type WorkflowSchema = NonNullable<ProjectConfig["workflowSchema"]>`——**值域类型单一来源**＝门禁引擎 `src/model/role.ts::ProjectConfig.workflowSchema`（只读导入；本文件不复制字面量，字段值域变更时赋值处由编译器校验）；
   - `isWorkflowSchema(value): value is WorkflowSchema`——只认 `"two-fixed-paths/v1"` / `"legacy/v1"`。
2. **`buildFromAns` 载入/校验**（`loadEffectiveConfig` → `.ans` 可解析后的唯一构建点）：
   - `workflowSchema` **键缺省** ⇒ 不设字段（`hasOwnProperty` 为 false；旧项目/旧测试行为逐字不变，per-flow 判定由编排负责）；
   - 显式合法两值之一 ⇒ 赋给 `project.workflowSchema`（纯值带出，消费方直接读取）；
   - **其它任何值**（未知字面量、大小写/空串、`null`、数字/布尔、对象/数组）⇒ `invalidConfig(...)` **整个配置 fail-closed**（`source.kind === "ans-invalid"`、roles 清空、acceptance 未接受，`downgradeReason` 指名 `workflowSchema` 并含 `fail-closed`），**不得静默按缺省处理**——依据：本批派发「非法值按现有配置错误策略 fail-closed（不得静默当缺省）」；本模块既有策略即「`.ans` 存在但不可用 ⇒ 不回退、fail-closed」。
   - 校验在构造 `project` 前完成；`governanceModel`/`roles`/`governanceBoundary`/`acceptance`/pin 终态规则与降级语义逐字未动。
3. **仅载入，不写盘**：本文件不写 `.ans/project.json`；首次 fixed workflow 的原子写回（保留既有键、失败 `project-config-write-failed`）属编排 `workflow-service.ts`。
4. `readGovernanceModel`（三态）与其它既有导出/行为逐字未改（非法 `governanceModel` 仍按评审 5.5 为 `absent`，不与新字段策略混用）。
5. 更新 `LoadedConfig` 文档注释（载入面同时含治理模型与工作流模式）。

### 3.2 `test/项目管理/shared/config-loader.test.ts`（M；+149 / −0，6 例新增；既有 24 例逐字未动）

新增 §8「workflowSchema（B0）」：

| # | 用例 | 覆盖 |
| --- | --- | --- |
| 1 | `workflowSchema 缺省 ⇒ 不设字段，governanceModel/roles/acceptance 逐字保留（旧行为不变）` | 缺省不设键；合法带 pin 配置不降级；既有键逐字保留 |
| 2 | `workflowSchema 合法两值均被载入，其它键（governanceModel/roles/acceptance/pin）保留` | `"two-fixed-paths/v1"`/`"legacy/v1"` 两值；governanceModel/roles/acceptance/pin 不受影响 |
| 3 | `workflowSchema 非法值 ⇒ fail-closed（ans-invalid），不得静默当缺省` | 13 个非法值：未知字面量/大小写/空串/`null`/数字/布尔/对象/数组；断言 `ans-invalid`、roles 空、未接受、原因指名 `workflowSchema` 且 `fail-closed` |
| 4 | `workflowSchema 与既有终态规则互不影响：合法值 + accepted:true 无 pin ⇒ 仍降级且 schema 保留` | 新字段是纯值；不改变 pin 终态规则 |
| 5 | `无 .ans ⇒ 回退 fallback 原样；不凭空设置 workflowSchema` | 回退路径引用相等、不设字段 |
| 6 | `workflowSchema：ansDirName 覆盖同样生效（自定义目录载入两值）` | 载入器目录覆盖一致性 |

未新增 `skip`/`todo`/force-exit，未删除或放宽任何既有断言。

---

## 4. 测试与验证（命令可复现；原始输出见 `_evidence/`）

### 4.1 共享套件 before / after（单源）

```
node --test --test-concurrency=1 "test/项目管理/shared/**/*.test.ts"
```

| 时点 | tests | pass | fail | cancelled | skipped | todo | 退出码 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **实施前**（开工工作树，src/test/app 干净） | 218 | 213 | 0 | 0 | 5 | 0 | 0 |
| **实施后**（最终稳定树：本批 + 并行门禁引擎/运行时核心改动） | 224 | 219 | 0 | 0 | 5 | 0 | 0 |
| 增量 | **+6** | **+6** | **0** | 0 | **0** | 0 | — |

- 失败名集合 diff：**空**（前后 fail 均为 0）；新增确定性失败 = 0、新增 skip = 0。
- skipped 5 为 `atomic-write.test.ts` 既有 Windows 平台按设计跳过（D3 权限位用例），前后一致。
- 目标文件单跑：`node --test --test-concurrency=1 "test/项目管理/shared/config-loader.test.ts"` → **30 tests / 30 pass / 0 fail / 0 skip**，退出码 0（24 既有 + 6 新增）。
- 另在 12:08 组合态（门禁引擎改动已落位、运行时核心尚未写盘）复跑同计数（224/219/0/5、30/30）；最终稳定树复跑结果一致。
- 证据：`_evidence/01-shared-suite-before.txt`、`02-shared-suite-after.txt`、`03-target-config-loader-test-after.txt`。

### 4.2 `npm run typecheck`

| 时点 | 结果 |
| --- | --- |
| 实施前（开工窗口） | **exit 1**，单条诊断：`test/门禁引擎/role-module-contract.test.ts(195,3): error TS2344: Type 'false' does not satisfy the constraint 'true'.` |
| 实施后（12:08 组合态：本批 + 门禁引擎改动；运行时核心尚未写盘） | **exit 0**，无诊断输出 |
| 最终稳定树（本批 + 门禁引擎 + 运行时核心并行改动） | **exit 1**，单条**跨批次**诊断（非本批文件）：`src/pipeline/orchestration/run-role.ts(3234,7): error TS2322: … Property '"merge-main"' is missing in type '{ acceptance: …; "stable-write": string; }' but required in type 'Readonly<Record<GovernanceCardKind, string>>'` |

- **基线错误如实披露**：该文件与其比较的 `src/model/role.ts` 类型均属**门禁引擎 B0 写集**，批次期间被其并行修改；被比较的 `TrustedToolPolicyInput` 形状在 HEAD 与当前逐字相同，而组合态 typecheck 为 0——判定为并行写盘窗口的**瞬时中间快照**（非本批引入；亦不能据此判定已提交基线缺陷）。本角色未修改该文件、未为其做任何适配。
- **最终 stable 树跨文件类型错误（如实列出，不改他人文件）**：运行时核心 B0 在 `src/model/runtime.ts::GovernanceCardKind` 新增 `"merge-main"` 卡种，`src/pipeline/orchestration/run-role.ts` 的标签映射表（编排/流水线属主）尚未同步，`Record<GovernanceCardKind, string>` 穷尽性检查报缺 `"merge-main"`。本角色未触碰这两处，按纪律**不代改**；该错误不影响本批共享套件/目标测试（Node 运行期类型擦除），收口需由相应 owner 补齐后复跑 typecheck。证据：`_evidence/09-typecheck-final-stabilized.txt`。
- **并行运行时核心写盘窗口的瞬时红（如实披露）**：批次后段运行时核心修改 `src/model/runtime.ts` 期间，该文件语法中间态使共享套件 3 个文件（`config-loader`/`intent-entry-contract`/`runtime-shared`）在模块加载阶段失败（`ERR_INVALID_TYPESCRIPT_SYNTAX`，非断言失败），typecheck 报 `runtime.ts(2660,11) TS1109`。证据：`_evidence/08-parallel-transient-breakage.txt`。该状态**非本批改动**；写盘稳定后复跑共享套件/目标测试均为绿（见 §4.1）。
- **跨文件/跨批次类型依赖**：本批 `config-loader.ts` 直接赋值 `project.workflowSchema`，字段定义来自门禁引擎并行的 `src/model/role.ts`（当前工作树未提交改动，`workflowSchema?: "two-fixed-paths/v1" | "legacy/v1"`）。该字段落位后本批无跨文件类型错误；若候选不含该字段，本文件将无法通过类型检查——B0 集成时必须与门禁引擎批次同候选。
- 证据：`_evidence/04-typecheck-before.txt`、`05-typecheck-after.txt`、`08-parallel-transient-breakage.txt`、`09-typecheck-final-stabilized.txt`。

---

## 5. 候选（写盘后原字节复算）

| # | 文件 | 类型 | 行数 | 字节 | SHA-256（工作树原字节） | git blob oid（LF 归一化） |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/common/shared/config-loader.ts` | M | 374 | 17,575 | `2d6a22fd5311f67a92c1211d84177cd0e059e587583bfaf25e7de2c4cdcad425` | `65e2100e0b582985e31997c08ca46b4ca5a08565` |
| 2 | `test/项目管理/shared/config-loader.test.ts` | M | 558 | 24,837 | `07e271570692e1ab4dacd3ee7c573aa619a304ce75af0a2f3c2449eb2cb8a6ad` | `393d7159166048658da0ef50f7cdd12b74d05d12` |
| 3 | 本记录 | 新增 | 见落盘报告 | 见落盘报告 | 见完成报告（自引用不嵌入） | — |

numstat（对 HEAD `ad22192`）：`config-loader.ts` +38/−3；`config-loader.test.ts` +149/−0。**本角色写集外 diff = 0**（`src app test` 下其余改动均属门禁引擎/运行时核心并行批次，见 §2/§7；未触碰）。

证据目录 `角色卡/shared-code/docs/change/2026-11-10_B0_two-fixed-workflow-paths_evidence/`（10 文件 / 632 行 / 52,683 B）：

| 证据 | SHA-256 |
| --- | --- |
| `00-inputs-and-environment.txt` | `286e7e9f8d9f2ce9a34e8ef2073408d5dc22a362bed916da0e76a6deabb6d8d5` |
| `01-shared-suite-before.txt` | `7c97762ad66b71aa26f61b63e6a091315a043f85651262707ef2e82deb4ff817` |
| `02-shared-suite-after.txt` | `daec6f28f13c268092def766726065fd27bcbf739426ac50c78bbe7c1bb440a8` |
| `03-target-config-loader-test-after.txt` | `92b44481c8e8b3a37bac4d9b849a2248344281cb44cbbdf0473caf9f89726626` |
| `04-typecheck-before.txt` | `c84ea08f482dd51be9200867db20b3595db422062bccceabed3644eafdf64cd5` |
| `05-typecheck-after.txt` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| `06-write-set-stats.txt` | `e2095f7d94767ae9be00e78081ceef796c7e0c082e65da1813642ed76df94973` |
| `07-worktree-status.txt` | `8e2d5b8c900737f06f6eb03ebbd23a9f345b6539a18c54097653f2e7980bdbe7` |
| `08-parallel-transient-breakage.txt` | `6f7e899f275b9fb81946d9be6941f4a23083562f40d6950a6a3293c020672d01` |
| `09-typecheck-final-stabilized.txt` | `1312fc352fa004f5f3598029d91a10856f0dd71cecfdc39924537982ee9ca64f` |

**候选聚合（本角色 2 文件 raw sha256 排序后聚合）**：`622484f0f115e122edc55a7b63acc6f73966456f4abc1654bfb059a0a4e76e24`。

---

## 6. 限制与未提交

- **未提交/未推送/未合并/未发布/未打 tag**；所有改动仅在本 worktree 工作树。
- 本批只证明**载入/校验**语义（缺省不设、两值载入、非法 fail-closed、既有键逐字保留）；**不证明** per-flow `workflowMode` 默认/强制行为（编排 B0/B1 的 `workflow-mode` 用例）、`.ans/project.json` 原子写回（`project-config-write-failed`）、`.gitignore`/dirty/分支语义（编排/桌面/基线批次）。
- 未运行真实模型/Electron/真机全链；未占用 9222/9223；未新增依赖。
- `src/model/role.ts::ProjectConfig.workflowSchema` 为**门禁引擎 B0 写集**（并行落位）；本批只读 import，未修改其文件。
- **B0 集成收口待办（非本角色写集）**：最终稳定树 `npm run typecheck` 剩余唯一诊断是运行时核心 `GovernanceCardKind` 新增 `"merge-main"` 与 `src/pipeline/orchestration/run-role.ts` 标签映射未同步的**跨批次类型错误**；本角色未改他人文件，收口需由相应 owner 补齐后复跑 `npm run typecheck`（共享套件/目标测试不受影响，见 §4.1）。
- 共享组件目录 `角色卡/shared-code/docs/architecture/shared-components.md` §1 #1/§2.1 的 public entry 说明与测试计数（24）**未更新**（不在本批写集）：本批不新增公开导出，但 `loadEffectiveConfig` 行为增量与测试计数（24→30）建议目录维护批次同步。
- 证据边界：非法值 fail-closed 使**整个** `LoadedConfig` 变为 `ans-invalid`（与 `.ans` 不可解析同一错误面），这是按本批派发「不得静默当缺省」的有意选择；消费方须按 `source.kind` 既有约定处理，不在本批另造新错误类型。

---

## 7. 后续衔接（编排/集成）

1. **`workflowMode(projectRoot, flowId)`**（编排 `workflow-service.ts`，B0/B1）：读取 `ProjectConfig.workflowSchema`（可经 `loadEffectiveConfig`）作**默认/强制值**；`"legacy/v1"` 强制 legacy、`"two-fixed-paths/v1"` 新 flow 默认 fixed、缺省按活动 legacy run/trunk per-flow 自动判定（v1.3 §4.1/§9.4，MF-5）。混合项目测试（T-05）由编排承担。
2. **写回**：首次 fixed workflow 启动由 `workflow-service.ts` 原子写 `workflowSchema:"two-fixed-paths/v1"`，保留既有键；显式 `"legacy/v1"` 不覆盖；失败 `project-config-write-failed` fail-closed、不弹卡。
3. **G-IR 接口评审**（团队计划 §四）不涉及本批新公开接口（无新导出）；`ProjectConfig.workflowSchema` 字段语义见门禁引擎接口评审记录。
