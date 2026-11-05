# 运行时核心 C2 实施记录：治理权力矩阵运行时契约、只读工具与提示通道（governance-authority-matrix）

- **任务 / 角色 / 阶段**：`2026-11-05-governance-authority-matrix`（T3）；运行时核心（独立固定上下文）；团队计划 **C2**（能力位 / 提示通道 / 工具表面）。
- **日期 / 状态**：2026-11-05；**`implemented-unverified`**——C2 已实施并通过本角色层与 T2/T3 检查，**尚未独立验收通过**（E2 结论 AC-1–AC-17 pass，唯一 fail 为 AC-18 文档状态收口；本记录即收口材料之一）。**未 commit/push/merge/release**。
- **候选快照**：统筹记录的候选快照 `839b922f…`（短哈希，按派发记录引用；本文件不另造完整哈希）。
- **实施依据（唯一契约基线）**：[提案](2026-11-05_governance-authority-matrix-runtime-core.md)（状态 `implemented-unverified`）、方案 P1.1（`docs/planning/2026-11-05_design_governance-authority-matrix.md`，1056 行 / `1f6518b8…b26d6`）、验收标准 V1（`docs/acceptance/governance-authority-matrix-criteria-v1.md`，327 行 / `f6720528…a2f`）、团队计划（`docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md`，660 行 / `07378444…7805`）、闸门 0/1/2 + IA 记录。PM 裁决 R1–R8 全部采纳。
- **C1a 依赖**：`GovernanceMatrixFn` 由 `src/model/governance-matrix.ts`（C1a 冻结，门禁引擎主属）单一定义；本层只 `import type`，未重定义、未复制。
- **标注约定**：**[事实]** 本记录写盘时实测或统筹记录的事实；未实测项明确标注来源；不把计划写成结果。

---

## 1. 结果摘要

C2 为运行时公共契约新增两个**可选**加法，并在 Provider 工具层登记一个**注入才注册**的只读工具：

1. `GovernedToolsOptions.governanceMatrix?: GovernanceMatrixFn`——六内置治理角色可按会话获得 `governance_matrix` 工具；未注入 ⇒ 工具不存在。
2. `RuntimeProviderOptions.contextSections?: readonly string[]` + `RuntimeSessionOptions.contextSections?`——幕僚提示块的纯展示通道；未定义 ⇒ 不下发字段、系统提示逐字不变。
3. `governance_matrix` handler 只做参数形状校验并调用注入函数，原样转达 `ok/message`；不读盘、不写盘、不写账本、不缓存、无状态事件、无第二套截断。
4. 零权限影响：不改任何角色的写权/派发/客户卡/shell 档位；不接入门禁/派发/冻结/trunk/VCA/stable-write；worker/`su`/判断会话/single 结构上看不到该工具。

## 2. 改动文件与差异（工作区实测）

| 文件 | diff（numstat） | git blob | sha256 |
| --- | --- | --- | --- |
| `src/model/runtime.ts` | +15 / -0 | `3ac2b8e0e40d5607280904d2a185af1a7b306b92` | `20af24789bcdcd4d2f2f26d3d0bb648a6a8a6ca9fab18935455e77b2a7fd99bd` |
| `src/service/runtime/session.ts` | +8 / -0 | `f6919f60dc189d297f8b5bd723082b248b21a892` | `23228c82c4e299146bfe6588c718813747460a00e8c0cc7326effb51f67ed950` |
| `src/provider/runtime/tools.ts` | +87 / -0 | `693b2562dd9ba99b9c08a7c640b7236e17e0f48d` | `5418f8ff8dcddb61b3ed1c9331cfe7e58ddc8e619261103927112aaa9ee52fca` |
| `src/provider/runtime/schema.ts` | +35 / -0 | `60df628e72e9711485c673e6a1d950b53bf6e723` | `34ae96fff8a08809f9873b42fd6006b4d270c570a91b4fa9cd7d45e467ccc52d` |
| `test/runtime-core/governance-matrix-tool.test.ts`（新） | 313 行 / 8 例 | `c4f7e9021a352819f7c9f25f9e30203c83f64e2a` | `d3bcb5b5b6ecb59d10e3b9b0c3cad03e68ca05d0ae14ff18ebccd7323f198c73` |

- `git diff --cached --name-only` 为空（未暂存）；本角色写集内仅上述 5 项；未改 i18n、`app/**`、`src/common/**`、`src/pipeline/**`、`src/provider/{pi,claude,codex}/**`、其他角色 `test/**`。
- 同一工作树内 `src/common/门禁引擎/**`、`src/service/role/resolve-role.ts`、`src/pipeline/orchestration/run-role.ts`、三适配器等改动属 C1a/C1b/C3/C4 在途文件，非本角色写入。

## 3. 行为要点

### 3.1 `src/model/runtime.ts`

- 新增 `import type { GovernanceMatrixFn } from "./governance-matrix.ts";`（Model 内部类型引用，沿 `./download.ts`/`./project-state.ts` 先例；不构成运营层依赖，无循环）。
- `GovernedToolsOptions.governanceMatrix?: GovernanceMatrixFn`：**注入才注册**；注入面由编排（C3）决定——仅 trio 六个内置治理角色；worker、`su`、判断会话、single 旧模型不注入；纯读、不写盘/账本、不产生 trunk/VCA/stable-write 事件；工具输出不是批准/验收证据。
- `RuntimeProviderOptions.contextSections?: readonly string[]`：纯展示文本段，只允许编排在会话绑定时注入；适配器按固定位置拼接、不改写/不重排/不判定；不是能力/工具/判定输入；空数组/缺省 ⇒ 系统提示逐字不变。

### 3.2 `src/service/runtime/session.ts`

- `RuntimeSessionOptions.contextSections?` 显式声明；`providerOptions` 仅在 `options.contextSections !== undefined` 时条件展开（缺省不下发字段）。
- `governanceMatrix` 不改声明、不改 `providerFor` 代码：经 `Omit<GovernedToolsOptions,…>` 继承，经既有 `buildGovernedTools(options.gate, {…options,…})` 自动到达工具层（零新增判定分支）。
- 判断会话（`shellJudge`/`governanceJudge`）只走 judge 工具集、不经过 `buildGovernedTools` ⇒ 即使误传 `governanceMatrix` 也无该工具。
- 空数组是否拼接留给 C4 适配器（"非空才拼"），本层不做判定。

### 3.3 `src/provider/runtime/tools.ts`

- 新增 `GOVERNANCE_MATRIX_TOOL_NAME = "governance_matrix"`、参数键集合与 section 枚举常量、`makeGovernanceMatrixTool`，并在 `buildGovernedTools` 以 `options.governanceMatrix !== undefined` 为唯一注册条件。
- 参数矩阵：未知参数 ⇒ `ok:false`；`roleId` 非字符串/空串/纯空白 ⇒ `ok:false`；合法字符串 trim 后交注入函数做**精确匹配**；`section` 缺省不带字段（由注入函数按 `all`），非法值/非字符串 ⇒ `ok:false` 并列出三值；以上拒绝均**不调用**注入函数。
- 回执：`ok` 非布尔/`message` 非非空字符串/非对象 ⇒ `ok:false` 诚实失败（"不要据此判断权限"）；注入函数抛错或调用中止 ⇒ `ok:false`（"矩阵读取未完成"）；合法回执 `ok:true`/`ok:false` 均**原样转达**（`ok:false` = 矩阵不可用，不是没有权限）。
- 只读性：handler 不读项目文件、不写盘、不写账本、不缓存、不产生状态事件；不新增 `ToolResult` 字段；不做第二套截断（48,000 字工具文本上限归 C1b 渲染器）。
- 分层：只 `import type` 自 `model/governance-matrix.ts`；不 import `src/service/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、冻结/trunk/VCA/stable-write 模块；不硬编码角色 id。

### 3.4 `src/provider/runtime/schema.ts`

- `describeTool("governance_matrix")`：`required: []`、`additionalProperties: false`；`roleId` 可选 string；`section` 可选 string、enum `["all","roles","routing"]`。
- 描述/guidelines 钉住：只读非权威（不新增/不改变权限，权威在注册表/角色卡/边界/门禁）、`unknown（原因）` 不等于允许/禁止、强制力分层与「宿主未注入 ≠ 角色无权」、刷新语义（每次现算、`generatedAt`、启动块是快照）、`ok:false` = 矩阵不可用、非批准/非验收证据，并要求 `roleId` 使用矩阵中精确 id。
- **D-04 词面核查**：新增文案经 `grep` 核查，不含 `docs/flows/`、`team-plan`、`teamPlan` 等撤除残留词（文件中命中的同名词面仅存在于既有 VCA/stable-write 工具文案，非本次新增）。

### 3.5 `test/runtime-core/governance-matrix-tool.test.ts`（313 行 / 8 例）

覆盖：注入才注册 + 只新增一只 + 既有工具 schema/描述/显示规则零变化 + 构造不调用注入函数；schema 形状与文案纪律；参数矩阵（合法 trim 透传、7 类非法前置拒绝、`null` 视为缺省）；原样转达与 4 类畸形回执 fail-closed；工具结果只含 `ok/message`；预先中止不触达注入函数；临时目录前后快照一致（无写盘/账本）；Service 透传（注入/未注入两态、`contextSections` 有/无、治理与 shell 判断会话结构性无该工具）。

## 4. 验证证据

| 检查 | 命令 / 来源 | 结果 |
| --- | --- | --- |
| 新增测试（本角色） | `node --test --test-concurrency=1 test/runtime-core/governance-matrix-tool.test.ts` | **tests 8 / pass 8 / fail 0 / skipped 0，exit 0** |
| runtime-core 全目录（本角色层，候选工作区） | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | **tests 378 / pass 371 / fail 3 / skipped 4 / todo 0，exit 1**；3 个失败均为既有 Windows 环境 symlink EPERM：`test/runtime-core/file-write-safety.test.ts:97`、`test/runtime-core/session-store.test.ts:46`/`:58`（与角色 memo 基线一致）；无新增红、无新增 skip |
| 静态检查（T2） | `npm run typecheck`（最终候选） | **exit 0，0 error**（实施期间 C1b 在途 `src/service/governance-matrix/impl/builder.ts` 的跨角色类型错误已由其属主修正；当前最终态 0 错） |
| T3 全量回归（T2 节点，统筹记录） | 全量 `node --test`（`--test-concurrency=1`） | **4,130 tests / 4,103 pass / 9 fail（既有环境失败）/ 18 skip**；**新增确定性失败 0、新增 skip 0**（本角色 runtime-core 子集为本记录上表实测） |
| 写集隔离 | `git status --porcelain -- src app test`、`git diff --cached --name-only` | 本角色仅 5 项（4 源码 + 1 新测试）；暂存区为空 |
| D-04 | `grep` 于本角色改动/新增文件 | 无新增 `docs/flows/`、`team-plan`、`teamPlan` 词面 |

候选快照 `839b922f…` 为统筹记录值；E1 变更包应以其为准复算。本记录不声称独立验收通过。

## 5. 与提案/裁决的偏差

1. **中止文案（包装差异，无契约变化）**：预先已中止的调用由 `buildGovernedTools` 统一包装返回「会话已中止，未执行」，而非本工具 handler 的「矩阵读取未完成」；两者均 `ok:false` 且不触达注入函数。测试同时接受两种文案，只钉「未触达 + 如实失败」。这是既有通用中止包装的行为，未新增分支。
2. **`RuntimeSessionOptions` 未重复声明 `governanceMatrix`**：按提案与团队计划经 `Omit` 继承 + `{…options}` 透传（与 `shellEscalation`/`projectState`/`requestDownload` 同款）。
3. **`contextSections` 空数组**：按 R6，本层只做「未定义不下发」；空数组是否拼接由 C4 适配器保证（"非空才拼"）。
4. **文档更新**：本次文档收口仅按 E2 要求更新提案状态、本实施记录与本角色 `api-spec.md`；`docs/feature/runtime-core.md` 的当前行为/历史更新与 `memo.md` 一行记录仍按文档纪律在后续文档批次处理（不改变本记录与验收证据）。

## 6. 边界与未完成事项

- **未独立验收通过**：本记录与候选状态为 `implemented-unverified`；E2 复判由独立验收按 V1 进行，本记录不代替 B2。
- **未 commit/push/merge/release**；提交/推送/合并/发布另需客户授权。
- **跨角色接线**：C3（`run-role.ts` 注入/取数/提示块）与 C4a/b/c（三适配器固定位置拼接）为各自角色在途写集；本记录只证明本层契约与工具表面，不证明端到端注入行为（由 C3/C4/T1 证据覆盖）。
- **本层未验证项**：真实模型会话中的工具调用体验、`generatedAt`/截断/unknown 文本的最终措辞（C1b 渲染器与 T1 集成证据覆盖）；本层只保证原样转达与无第二套语义。
