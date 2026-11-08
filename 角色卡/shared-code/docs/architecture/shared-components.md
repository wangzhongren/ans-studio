# 跨角色共享组件目录（`src/common/shared/`）—— shared-code 现行目录

- **属主 / 唯一写入者：`shared-code`（共享代码维护角色）**。本文件是 `src/common/shared/`（跨角色共享组件）及其专属测试 `test/项目管理/shared/` 的**唯一现行复用目录**，与带日期的 design/change 历史分开维护。
- **依据**：E0.3 冻结契约 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）§4.1/§4.2/§4.3/§4.4；团队计划 §4.4⑦/§5.1/§6.4（`00e1f76b…`）；冻结记录 §一/§五 Q12；技能 `references/shared-directories.md`（修订版 `80ece2c55d9392c5cdae19afc637c340b7fd7831e5fc18fadf96e8b08d946ea3`）「Shared-Component Document」。
- **迁移与单源**：本文件于 2026-11-07（E1）以 `角色卡/项目管理/docs/architecture/shared-components.md`（216 行 / `dd33fdf7805e1ca08c60cf62b804b4f20b6dd7d5c9d4632431706bbaeeca6339`）为**只读输入**迁建；**自本文件起，本文件是唯一现行目录**。旧副本由项目管理在 E1 迁移窗口按 §6.4 单写者顺序（shared-code 建新 → 评审等价 → PM 删旧）删除；删除前旧副本冻结只读，**不得再维护**，也不得作为第二事实源引用。其他角色**链接引用本文件、不复制定义**。

**共享组件的流转**（技能规定，E0 §4.4 接口评审为例外通道）：需求方（角色/门控/引擎 owner）提交共享 API 变更提案（目的、受影响 public entry、消费者、兼容性、测试、迁移/回滚）→ `shared-code` 书面评审 → 实现 + 测试 → 受影响 owner 更新调用 → 统筹排期 → 独立验收按证据判断 → 更新本目录与冻结记录；旧实现删除，不留双份。共享 API 变更须**评审记录 + 消费者影响清单 + 测试**，无记录不得合并。

**消费方硬规则**：消费方**只读导入** `src/common/shared/` 的 public entry，**不得复制第二份实现**，**不得写入** `src/common/shared/`（唯一写入者 `shared-code`）。共享行为变更会使受影响调用方的既有证据失效（按 P1.6 §8.5 重取或明确标注）。共享组件不 import `src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、角色模块或门控模块；只依赖 `src/model/`。

---

## 1. 共享组件总表（12 项：E0 §4.2 默认清单 11 项 + 2026-11-08 新增 1 项）

| # | 组件 | 代码 | 主要 public entry（既有导出，不复制） | 现行消费者 | 专属测试 |
| --- | --- | --- | --- | --- | --- |
| 1 | `config-loader` | `src/common/shared/config-loader.ts` | `loadEffectiveConfig`、`readGovernanceModel`、`ansProjectPath`、`enforcePinBackedAcceptance`、`ANS_DIR_NAME`/`ANS_PROJECT_FILE_NAME`、`ConfigSource*`/`LoadedConfig`/`LoadConfigOptions`/`GovernanceModelRead` | 装配（薄转发）、编排、Pipeline、Service、桌面窗口 | `config-loader.test.ts`（24） |
| 2 | `path-primitives` | `src/common/shared/path-primitives.ts` | `IS_WINDOWS`、`toPosix`、`isAbsoluteAny`、`normalizeLexical`、`compareKey`、`isUnderOrEqual`、`absRel`、`isWithinReal`、`realResolve`、`realResolveAsync` | Pi适配器、运行时核心、编排、门禁引擎、Pipeline、Provider、桌面窗口 | `path-primitives.test.ts`（21） |
| 3 | `runtime-shared` | `src/common/shared/runtime-shared.ts` | `RUNTIME_KINDS`、`RuntimeKind`、`DEFAULT_RUNTIME`、`RUNTIME_LABELS`、`RUNTIME_LABEL_KEYS`、`PI_CREDENTIAL_ENV_VARS`、`RUNTIME_CREDENTIAL_ENV_VARS`、`resolveSkillRoot` | 编排、装配、`src/index.ts`、CLI、Codex适配器、Pipeline、Provider、Service、桌面窗口、`app/main.ts`；Model **type-only** | `runtime-shared.test.ts`（8） |
| 4 | `argv-primitives` | `src/common/shared/argv-primitives.ts` | `normalizeArgv(argv: unknown): string[]` | 编排（shell-gate/shell-escalation/shell-command-guard）、桌面窗口（operator-channel/shell-escalation） | `argv-primitives.test.ts`（12） |
| 5 | `env-file` | `src/common/shared/env-file.ts` | `parseEnvFile`、`mergeEnvText`、`atomicWriteText`、`readEnvFile`、`saveEnvFile`、`loadEnvFileInto`、`parseEnvValue`、`renderEnvValue`、`PI_CONFIG_SECRET_KEYS`、`RUNTIME_CONFIG_SECRET_KEYS`、`isSecretKey`、`EnvMap`/`EnvTarget`/`LoadEnvResult` | 桌面窗口（pi-config/runtime-config/runtime-resolution）、`app/main.ts` | `env-file.test.ts`（31） |
| 6 | `atomic-write` | `src/common/shared/atomic-write.ts` | `atomicWrite`、`renameReplacingExisting`、`retryOnTransient`、`RENAME_TRANSIENT_CODES`、`RENAME_MAX_ATTEMPTS`、`AtomicWriteOptions`（`mode`/`finalMode`/`tmpPrefix`/`signal`） | 共享内部 `env-file.ts`；Pi适配器、运行时核心、Provider（codex/download/runtime/trunk/version-change）、桌面窗口 | `atomic-write.test.ts`（22；17 pass + 5 平台跳过） |
| 7 | `diagnostics` | `src/common/shared/diagnostics.ts` | `configureDiagnostics`、`createDiagnosticLogger`、`getDiagnosticsStatus`、`flushDiagnostics`、`disposeDiagnostics`、`DIAGNOSTIC_RETENTION_MS`/`DIAGNOSTIC_MAINTENANCE_MS`、`DiagnosticContext`/`DiagnosticLogger` | 全层（编排/运行时核心/Pipeline/Provider/适配器/桌面/main）；Model **type-only** | `diagnostics.test.ts`（10） |
| 8 | `runtime-settings` | `src/common/shared/runtime-settings.ts` | `RUNTIME_SETTINGS`、`getRuntimeSettingsDefinition`、`RuntimeSettingField`/`RuntimeSettingsDefinition` | 桌面窗口（设置视图组装，只读） | `runtime-settings.test.ts`（14） |
| 9 | `i18n` | `src/common/shared/i18n/`（`index.ts` 为 public entry） | `Locale`/`SUPPORTED_LOCALES`/`DEFAULT_LOCALE`/`isLocale`/`resolveLocale`；`MessageKey`；`translate`/`createTranslator`/`TranslateOptions`/`TranslateDiagnostic`；`formatNumber`/`formatDateTime`/`selectPluralCategory`；`Catalog*`/`Message*`/`PluralCategory`；`zhCN`/`enUS` | 编排、运行时核心 `provider/runtime/tools.ts`、桌面窗口、桌面UI（facade 再导出） | `i18n.test.ts`（13）+ `i18n-guard.test.ts`（6）+ 扫描器/allowlist 夹具 |
| 10 | `jsonl-ledger` | `src/common/shared/jsonl-ledger.ts` | `appendJsonlLine`、`readJsonlLedger`、`jsonlSegmentFiles`、`DEFAULT_JSONL_MAX_BYTES`/`DEFAULT_JSONL_ROTATIONS`、`JsonlLedgerLimits`/`JsonlAppendResult`/`JsonlParseResult`/`JsonlReadError`/`JsonlReadResult` | 编排 `task-state.ts`、Provider（directive/download/version-change） | `jsonl-ledger.test.ts`（16） |
| 11 | `intent-entry-contract` | `src/common/shared/intent-entry-contract.ts` | `INTENT_ENTRY_DIR`/`INTENT_ENTRY_ID_RULE`/`INTENT_ENTRY_NAMING_RULE`/`INTENT_ENTRY_TEMPLATE`、`resolveIntentEntryReference`、`intentEntryContractText`、`intentEntryRejectionHint`、`isValidIntentId`、`intentIdFromFrontmatter`、`readIntentEntryFacts`、`IntentContractRole`/`IntentReferenceSource`/`IntentEntryResolution`/`IntentEntryFacts` | 编排（governance-judge-intent/-evidence）、门禁引擎（`governance-roles.ts`）、Pipeline（`run-role.ts`）、桌面窗口（`session.ts`） | `intent-entry-contract.test.ts`（22，E1 新增专属单测；此前只有消费方间接覆盖） |
| 12 | `shell-approval-binding` | `src/common/shared/shell-approval-binding.ts` | `registerShellApproval`、`inspectShellApproval`、`probeShellApproval`、`hasShellApprovalTestNonDurableAllowance`、`SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE`（**测试私有 Symbol**，生产公共出口不得再导出）、`ShellApprovalFacts`/`FrozenShellApprovalFacts`/`ShellApprovalAuditFacts`/`ShellApprovalProbeSink`/`ShellApprovalMode`/`ShellApprovalAuditSinkKind`/`ShellApprovalAuditProbeState` | 编排 `shell-gate.ts`（`createShellGate` 构造成功后**唯一**登记；`buildShellGate`/`assemble*` 只传 `projectRoot`/sink，不参与 probe 值传递）、运行时核心 `session.ts`（`prepareRole`/`bindPreparedRole` 读取准入事实）、测试 | `shell-approval-binding.test.ts`（19，W1 新增） |

> 测试列括号内为 `test/项目管理/shared/` 内的用例数；共享测试单源为 `node --test "test/项目管理/shared/**/*.test.ts"`。
> 上表是 E0 §4.2 的**默认公开入口清单**；新增/收敛 public entry 须在冻结记录与本目录登记并走 §4 接口评审（Q1：保持 per-component public entry，**不新增伞状 `index.ts`**）。第 12 项 `shell-approval-binding` 为 2026-11-08「会话创建准入按操作审批」变更新增（设计 P1.3 §2.3/§4.1；派发 I0-1/I0-2/I0-3/I0-9），共享 API 变更评审记录与消费者影响清单见 §4。

---

## 2. 组件逐项条目

### 2.1 `config-loader` —— `.ans` 有效配置载入器

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | `.ans` 有效配置载入器。加载项目根下 `.ans/project.json`，按终态规则（设计 §3.3）做 **fail-closed** 规范化后，把 `project`（`roles`/`governanceBoundary`）与 `source`（配置来源 + 生效 acceptance + pin 路径 + 降级原因）作为**纯值**交给调用方。解决的问题：让「项目带 `.ans` 就优先加载它（pin 生效），否则回退运行期同意/内置演示」的判定链只有**一份**实现。另含 `readGovernanceModel`（三态：`explicit`/`absent`/`unreadable`，不写盘、不猜非法值），供治理模型读取方与 `loadEffectiveConfig` 解耦，避免把运行期同意带进模型判定。 |
| **代码与 public entry** | `src/common/shared/config-loader.ts`。见总表 #1。`loadEffectiveConfig(opts)` **永远返回值、不抛错**；`enforcePinBackedAcceptance(acceptance, origin)` 为终态规则纯函数；`ansProjectPath(root, ansDirName?)` 为 `.ans/project.json` 路径单一来源。 |
| **属主与消费者** | **属主/维护者：`shared-code`**（自项目管理移交）。消费者：**装配** `src/common/装配/config-loader.ts`（T12 后为 `export *` **薄转发**，无本地逻辑）、**编排** `src/common/编排/finalize.ts`、**Pipeline** `src/pipeline/orchestration/shell-arming.ts`、**Service** `src/service/role/resolve-role.ts`、**桌面窗口** `app/desktop/{interface,project,session}.ts`。均只读导入。 |
| **契约与示例** | 入参 `LoadConfigOptions = { projectRoot, skillRoot, fallback, ansDirName? }`；返回 `LoadedConfig = { project, source }`，恒返回、不抛。三分支：① 无 `.ans/project.json` → `source.kind="builtin-fallback"`，`project` **原样**等于 `fallback`（**不经**终态规则）；② 有且可解析 → `source.kind="ans"`，`accepted:true` **必须 pin-backed**（无 pin → 置未接受并**清空 source**）；③ 有但不可用 → `source.kind="ans-invalid"`，roles 为空、治理边界未接受、**不回退**演示 acceptance。示例：<br>`const { project, source } = await loadEffectiveConfig({ projectRoot, skillRoot, fallback });`<br>`if (source.acceptance.accepted) { /* 用 project 开会话 */ }`<br>**边界（不做）**：pin **对不对**（逐文件 SHA-256 比对）不在本层——那是门禁引擎 `boundary-core.ts::verifyPins` 在其上再加一层；本层只判「有没有 pin」（存在性与形状）。 |
| **测试与变更影响** | `test/项目管理/shared/config-loader.test.ts`（24 例）：合法 `.ans`（带 pin）→ 注入正确；`accepted:true` 无 pin → 未接受且 source 清空；pin 与 hash 不符 → **引擎层**判未接受；`.ans` 存在但不可解析/顶层非对象 → 未接受、不回退；无 `.ans` → 回退且不崩；`ansDirName` 覆盖；`readGovernanceModel` 三态。**变更影响**：本组件行为变更会使装配/编排/Pipeline/Service/桌面消费方证据失效；装配侧薄转发随共享实现一并生效，**不得**再长出本地逻辑。 |

### 2.2 `path-primitives` —— 共享路径原语（安全相关，单一来源）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享路径原语：纯词法规范化（`normalizeLexical`/`compareKey`/`absRel`/`isUnderOrEqual`/`toPosix`/`isAbsoluteAny`）+ 真实路径解析（`realResolve`/`realResolveAsync`）。解决的问题：**「gate 认为在根内」与「写入层认为在根内」必须一致**——写入层是最后一道纵深防御，两者语义漂移就存在误放行空间（设计 §6 风险 2–3「写根与 gate 同源」）。 |
| **代码与 public entry** | `src/common/shared/path-primitives.ts`。见总表 #2。`realResolve`（sync）与 `realResolveAsync`（async）算法逐字相同，仅 realpath 调用同步/异步之别；**对同一输入给同一答案**（含大小写、junction/symlink、不存在尾部），由测试钉死。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**Pi适配器** `src/common/pi-adapter/fs-write.ts`、**运行时核心** `src/common/runtime-core/fs-write.ts`、**编排**（`confirmed-writes`/`finalize`/`governance-judge-facts`/`routine-shell-policy`）、**门禁引擎** `paths.ts`、**Pipeline**（`download-request`/`run-role`）、**Provider**（`download/impl/file-sink`、`runtime/tools`）、**桌面窗口**（`project`/`write-preauthorization`）。均只读导入；无第二份本地镜像。 |
| **契约与示例** | 词法原语逐字同源（搬迁，非 fork）。**边界（不做）**：**治理判定**（永远是门禁引擎 `resolveWrite` 的事）；**写入层名称安全**（Windows 保留设备名/尾点空格/ADS 等，`checkRelativePathSafe` 留 Pi适配器——门禁无对应物，非镜像）。示例：`isWithinReal(rootReal, await realResolveAsync(target))`。 |
| **测试与变更影响** | `test/项目管理/shared/path-primitives.test.ts`（21 例）：原语边界（大小写、尾点/空格、`..`、绝对/相对、Windows 分隔符）；逐字同源核对；要害——门禁 `realResolve`(sync) 与写入层 `realResolveAsync`(async) 对同输入同答案；junction 逃逸解析。**变更影响**：**安全相关**；任何行为变更须同时重跑 Pi适配器/运行时核心/门禁引擎/编排/桌面消费方证据。 |

### 2.3 `runtime-shared` —— 共享运行时原语

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 运行时小原语的单一来源：`RuntimeKind`（`demo`/`pi`/`codex`/`claude`）、显示名（`RUNTIME_LABELS` 语言中性；`RUNTIME_LABEL_KEYS` 指向 i18n 目录 key）、凭据环境变量名单（`PI_CREDENTIAL_ENV_VARS`/`RUNTIME_CREDENTIAL_ENV_VARS`，**安全相关**：装配据此判「有没有凭据」、适配器据此在 spawn 时剥离）、`resolveSkillRoot`（技能根解析）。 |
| **代码与 public entry** | `src/common/shared/runtime-shared.ts`。见总表 #3。`RuntimeKind = (typeof RUNTIME_KINDS)[number]`；`DEFAULT_RUNTIME = "demo"`；`resolveSkillRoot(env = process.env)`：`ANS_SKILL_ROOT` 非空即用，否则 `~/.claude/skills/ans-governed-construction`。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：编排（args/directive-interpreter/finalize/governance-judge/shell-judge*）、装配（`runtime.ts`）、`src/index.ts`、CLI（govern/govern 入口）、Codex适配器（`config.ts`）、Pipeline（`run-role.ts`）、Provider（claude/session、runtime/*）、Service（runtime/session）、桌面窗口（十余处）、`app/main.ts`。**渲染层不得导入**（顶层 `node:os`/`node:path`），渲染层经 i18n facade 用同一 key 取词。 |
| **契约与示例** | `RUNTIME_KINDS = ["demo","pi","codex","claude"]`；`RUNTIME_LABELS` 品牌名（Pi/Codex/Claude）原样、demo 语言中性；`RUNTIME_LABEL_KEYS` 中品牌名为 `null`，demo → `shared.runtimeSettings.runtime.demo`。凭据名单：跨引擎口令键含 Pi 旧名单与 SDK 键（逐条与旧副本一致）。示例：`if (PI_CREDENTIAL_ENV_VARS.some((k) => env[k])) { /* 有凭据 */ }`。 |
| **测试与变更影响** | `test/项目管理/shared/runtime-shared.test.ts`（8 例）：三类取值与各消费方旧副本一致、`resolveSkillRoot` 优先/回退/空串、B4 demo 语言中性 + key 解析、品牌名不变。**变更影响**：属安全相关（凭据名单）；名单或取值变更须重跑装配/适配器/桌面消费方证据。 |

### 2.4 `argv-primitives` —— 共享 argv 规范化（审计/呈现同源）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | `normalizeArgv(argv: unknown): string[]`：把不可信入参整理为 `string[]`。解决的问题：**「落进审计的 argv」与「操作者所见到的 argv」必须同源**——编排拿它写进 `docs/audit/shell-gate.jsonl`，桌面拿同一结果展示。两处漂移则审计失去意义。 |
| **代码与 public entry** | `src/common/shared/argv-primitives.ts`。见总表 #4。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**编排**（`shell-gate.ts`、`shell-escalation.ts`、`shell-command-guard.ts`）、**桌面窗口**（`operator-channel.ts`、`shell-escalation.ts`）。 |
| **契约与示例** | 非数组 → `[]`；仅保留 `typeof === "string"` 的项；**不去重、不裁剪空白、不转义、保序**（含空串、引号/空格/反斜杠、Windows 与 POSIX 路径原样）；**绝不抛错**。示例：`normalizeArgv(["ls", 1, "-la", null]) // ["ls","-la"]`。**边界（不做）**：任何治理判定——「命令是否危险」由门禁引擎判、「语义是否放行」由 pm 审读判。 |
| **测试与变更影响** | `test/项目管理/shared/argv-primitives.test.ts`（12 例）：空数组、非数组归空、只留字符串、保序、空串保留、含空格/引号逐字保留、Windows/POSIX 路径原样、不去重、旗标形态、Unicode、不改入参、返回新数组。**变更影响**：审计/呈现同源相关；行为变更须重跑编排 shell 门与桌面命令展示消费方证据。 |

### 2.5 `env-file` —— 共享 `.env` 读写模块（凭据落盘）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享 `.env` 读写：逐行解析/合并（`parseEnvFile`/`mergeEnvText`）、原子写（`atomicWriteText`，委托共享 `atomic-write`）、载入 env（`loadEnvFileInto`）、组合入口 `readEnvFile`/`saveEnvFile`。解决的问题：桌面 Pi 配置界面保存 `.env` 需唯一一份、只改相关键、不回显凭据的实现。`.env`（仓库根）仍归装配；本模块是它的**指定写入者**（Governance 记档 G-2）。 |
| **代码与 public entry** | `src/common/shared/env-file.ts`。见总表 #5。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**桌面窗口**（`pi-config.ts`/`runtime-config.ts`/`runtime-resolution.ts`：启动 `loadEnvFileInto` 补 `--env-file`、配置面板 `saveEnvFile`、掩码用 `isSecretKey`）、`app/main.ts`。 |
| **契约与示例** | **只改相关键**：`mergeEnvText` 逐行、只替换命中键的值 token（保留键/`=`/空白/`export `/引号风格/内联注释），未命中行与顺序逐字节不变，缺键追加末尾；更新为空恒等。**凭据不回显**：错误只含动作/路径/错误码并 `redactSecrets` 兜底；`loadEnvFileInto` 只回报键名；`isSecretKey`/`PI_CONFIG_SECRET_KEYS`/`RUNTIME_CONFIG_SECRET_KEYS` 供掩码。**原子写**：同目录 temp → `fsync` → `rename`。**失败显式**：读写失败抛错；`loadEnvFileInto` 仅 ENOENT 作无操作。示例：<br>`await saveEnvFile(envPath, { ANS_PI_MODEL: "m", ANTHROPIC_AUTH_TOKEN: token });`<br>**边界（不做）**：不构造/不注入适配器配置、不掩码呈现（UI 归桌面）、不判定哪些键必填。 |
| **测试与变更影响** | `test/项目管理/shared/env-file.test.ts`（31 例）：只改相关键（逐字节保留）、追加 vs 就地替换、特殊字符写后读回逐字一致、CRLF、原子写无 temp 残留、失败路径原文件不损、哨兵值不出现在错误文本、`loadEnvFileInto` 语义、机密键名单、读→改→写→读往返。全部用系统临时目录，不指向仓库根真实 `.env`。**变更影响**：写入纪律是客户红线；任何 `mergeEnvText`/原子写路径变更须重跑桌面配置面板消费方证据。 |

### 2.6 `atomic-write` —— 共享原子写原语（可靠性相关）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 同目录临时文件 → 写 → `fsync` → `rename` 覆盖目标；对 Windows **瞬时 `EPERM`/`EBUSY`/`EACCES`** 做**有界重试**。解决的问题：多处置原子落盘时，非平凡且可靠性强相关的重试会成为第二份镜像；Windows 覆盖已存在目标时实时防护/索引器/杀软短暂持有句柄导致瞬时失败（实测 ~3/20000，对照组 0/48000）。 |
| **代码与 public entry** | `src/common/shared/atomic-write.ts`。见总表 #6。`AtomicWriteOptions = { mode?(0o666), finalMode?(0–0777，POSIX 提交前精确应用), tmpPrefix?, signal? }`。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：共享内部 `env-file.ts`；**Pi适配器** `fs-write.ts`（`atomicWrite(abs, data, { mode: 0o600 })`）、**运行时核心** `runtime-core/fs-write.ts`（含 `finalMode` 与 abort）、**Provider**（codex/session、download/file-sink、runtime/session-store、trunk/*、version-change/*）、**桌面窗口**（interface/preferences/runtime-resolution）。 |
| **契约与示例** | `string` 按 UTF-8、`Buffer` 按字节；同目录规避 `EXDEV`；失败清理 temp 并抛错，目标在 `rename` 成功前不被触碰；`open(tmp,"wx",mode)` 独占建 temp，名含 pid + randomBytes 防撞。`renameReplacingExisting` = `retryOnTransient(() => rename(...))`；`retryOnTransient` 仅瞬时码重试、**有界**（`RENAME_MAX_ATTEMPTS=200`）、次数间仅 `setImmediate` 让出、非瞬时立即抛、达上界照抛。示例：`await atomicWrite(abs, buf, { mode: 0o600 });`。**边界（不做）**：治理判定、写入层名称安全（`checkRelativePathSafe` 留 Pi适配器）、内容构造/解析。 |
| **测试与变更影响** | `test/项目管理/shared/atomic-write.test.ts`（22 例：17 pass + 5 个 Windows 平台按设计跳过）：确定性重试注入（瞬时码 5 次后成功、非瞬时立即抛、有界耗尽、上界-1 成功、让出事件循环由外部 immediate 钉死）、写 string/Buffer、覆盖已存在目标、目录不存在即抛、无 temp 残留、并发自争用。**变更影响**：可靠性相关；重试/权限语义变更须重跑 Pi适配器/运行时核心/Provider/桌面消费方证据。**已知非阻断观察**：`src/common/门禁引擎/versioned-doc-guard.ts` 仍有私有 `atomicWrite`（temp→fsync→rename、无瞬时重试），属门禁引擎 owner 的候选收敛项（见 §5）。 |

### 2.7 `diagnostics` —— 统一诊断日志（滚动 24 小时）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 为应用、会话、工具、审核和回交提供同一条可追溯的本地诊断链，避免各角色自造存储/清理规则。只存元数据，固定滚动 24 小时。 |
| **代码与 public entry** | `src/common/shared/diagnostics.ts`。见总表 #7。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**全层只读 logger**——编排（governance-judge/handback/installed-skills/shell-gate/shell-judge/task-state/directive-interpreter）、运行时核心（mcp-declarations；`src/model/runtime.ts` **type-only**）、Pipeline（download-request/run-role）、Provider（claude/session）、适配器（pi-adapter/lifecycle、real-adapter）、桌面窗口（confirm-card/customer-input/diagnostics/…）、`app/main.ts`。桌面 main 负责初始化目录。 |
| **契约与示例** | `createDiagnosticLogger({component:'session',roleId:'A'}).record('send.start',{turnId:'t1'})`；未配置时 no-op。元数据按**落盘白名单**（含 `timeoutMs`/`mimeType`/`bytes`，字段级校验）JSONL 串行落盘；未知字段丢弃、凭据净化；命令原文/argv/prompt、图片字节/base64/`data:` URL 等正文禁入。异常用 `.error(event,error,fields)`。IO 失败经 `status.lastError` 如实反馈，不让业务抛错。留存目录 `app.getPath('userData')/ans/diagnostics`，启动清理、写入检查、每分钟维护（扫描最多每分钟一次）。 |
| **测试与变更影响** | `test/项目管理/shared/diagnostics.test.ts`（10 例）：精确过期边界、维护自动清理、有序追加、白名单元数据与字段级校验、敏感字段净化、IO 失败及正常退出。**变更影响**：共享接口变动需重跑桌面/编排/Pi 消费方；**不得**把 prompt、源码、原始工具/API 正文加入白名单。 |

### 2.8 `runtime-settings` —— 运行时设置目录

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 三引擎（Pi/Codex/Claude）设置元数据的单一来源：字段 `key/required/secret/fallbackKeys?/choices?/control?/integer?` + i18n key（`labelKey`/`helpKey?`/`choiceLabelKeys?`）。只描述设置，不描述控件实现，不含凭据值、不推断 SDK/账户可用。 |
| **代码与 public entry** | `src/common/shared/runtime-settings.ts`。见总表 #8。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**桌面窗口** `app/desktop/runtime-config.ts` 只读导入，主进程按当前 locale 解析 key → `label`/`help`/`choiceLabels` 后推给渲染层；渲染层**不直接引用**本文件。 |
| **契约与示例** | `RUNTIME_SETTINGS: Record<Exclude<RuntimeKind,"demo">, RuntimeSettingsDefinition>`；`getRuntimeSettingsDefinition(runtime)` 对 `demo` 返回 `undefined`。`choices` 非空＝值域即选项、应以致选择控件呈现；`control:"range"` 显式滑块；`integer` 为闭区间整数约束；展示文案只以目录 key 表达（2026-10-23 i18n B4）。示例：`const def = getRuntimeSettingsDefinition("pi"); def?.fields[0]?.key;` |
| **测试与变更影响** | `test/项目管理/shared/runtime-settings.test.ts`（14 例）：credential alias 全覆盖、各引擎 required/default 语义、推理强度三字段、choices/control/integer 元数据纪律、B4 零变化快照、key 映射/契约。**变更影响**：字段或 key 变更须重跑桌面设置视图消费方与 i18n parity/guard。 |

### 2.9 `i18n` —— 共享国际化消息目录与唯一翻译实现

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 共享国际化消息目录与**唯一**翻译实现：`zh-CN`（key 全集参考）与 `en-US` 目录、`Locale` 白名单、`{param}` 插值、`Intl.PluralRules` 复数、缺失 key/参数的稳定回退与诊断。**机器标识不翻译**（roleId、cardKind、协议字段、事件/日志码、测试断言标识）。 |
| **代码与 public entry** | `src/common/shared/i18n/`。`index.ts` 统一再导出 `locales.ts`（`Locale`/`SUPPORTED_LOCALES`/`DEFAULT_LOCALE`/`isLocale`/`resolveLocale`）、`types.ts`、`keys.ts`（`MessageKey` 由 zh-CN 推导）、`translate.ts`、`format.ts`、`messages/{zh-CN,en-US}.ts`。见总表 #9。 |
| **属主与消费者** | **属主/维护者：`shared-code`**（消息目录**唯一写入者**）。消费者：**编排** `run-manifest.ts`、**运行时核心** `src/provider/runtime/tools.ts`、**桌面窗口**（`i18n.ts` facade、`interface.ts`、`preferences.ts`、`customer-input.ts`）、**桌面UI**（`app/renderer/src/i18n/index.ts` facade **只再导出**本模块，组件经 facade 消费；`locale-store.ts`、`chat/*`）。 |
| **契约与示例** | `Locale = "zh-CN" \| "en-US"`；`DEFAULT_LOCALE = "zh-CN"`；`resolveLocale` **精确匹配**白名单（`en`/`zh`/大小写/空白/非字符串一律回退）。回退顺序：当前 locale → `zh-CN` → key 本身；en-US 缺 key → zh-CN 文案 + warning；两目录都缺 → key + error；缺参数 → 保留 `{param}` + warning。复数模板必须含 `other`；`count` 缺失/非数字 → 回退 `other`。示例：<br>`const t = createTranslator(resolveLocale(pref.locale)); t("main.window.title");`<br>**边界（不做）**：不读偏好文件、不更新 `document.documentElement.lang`、不生成 UI、不做 IPC；不翻译外部错误原文。 |
| **测试与变更影响** | `test/项目管理/shared/i18n.test.ts`（13 例）覆盖 locale 解析、目录 parity、key、回退矩阵、插值/缺参数、复数、诊断注入、`Intl` 封装、源码纯度；`i18n-guard.test.ts`（6 例）+ `i18n-guard-scanner.ts` + `i18n-guard-allowlist.ts` 实现确定性硬编码守卫（扫描 `app/renderer/src`、`app/desktop`、`src/index.ts`、`src/interface/cli`、`src/common/shared/runtime-settings.ts`；allowlist 逐批收紧）。**变更影响**：目录行为变更使消费方证据失效；新增 key 先改 `zh-CN.ts` 再改 `en-US.ts`（`satisfies Record<MessageKey, MessageTemplate>` 强制齐全）；渲染层不得复制目录或 resolver。 |

### 2.10 `jsonl-ledger` —— 共享 JSONL 账本辅助

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享 JSONL 账本辅助：追加一行、按大小轮转、旧→新读取、坏行与忽略行计数。解决的问题：`.ans/state/tasks.jsonl` 与 `.ans/state/customer-directives.jsonl` 等账本都需要同一套轮转/原子追加/坏行回放；若不抽取会产生第二份轮转/追加实现并漂移。本组件是**单一实现**，不承担业务判定/重放/诊断。 |
| **代码与 public entry** | `src/common/shared/jsonl-ledger.ts`。见总表 #10。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**编排** `task-state.ts`、**Provider** `directive/impl/file-store.ts`、`download/impl/jsonl-ledger.ts`、`version-change/impl/guard-freeze-registry.ts`。**渲染侧不得导入**（含 Node API）。 |
| **契约与示例** | 追加：先递归建目录；当前大小 + 本次行字节数 > `maxBytes` 时**在追加前**轮转；`appendFile` UTF-8 `flag:"a"`；按**绝对路径**维护进程内串行 Promise 链（同文件不交错、不同账本互不阻塞、链尾清理）；失败**不抛**，返回 `{ok:false,…}`；`jsonText` 含裸 `\r`/`\n` ⇒ `{ok:false,code:"multiline"}`。轮转：`.N` 最旧、`.1` 最新；`ENOENT` 容忍。读取：`.N`→…→`.1`→当前（旧→新）；坏行计入 `errors`/`badLines`；`ignore` 计入 `ignoredLines`。limits 与路径由调用方传入（env 解析留在消费方）。示例：<br>`await appendJsonlLine(abs, JSON.stringify(event), { maxBytes, rotations });`<br>**边界（不做）**：不校验事件 schema/重放、不记诊断、不读 env、不硬编码 `.ans` 路径。 |
| **测试与变更影响** | `test/项目管理/shared/jsonl-ledger.test.ts`（16 例）：追加/轮转/读取/坏行/路径参数化/limits/multiline 防御/段文件清单，含 32 路并发无交错与 20 路并发+轮转。**变更影响**：共享行为变更会使 `task-state` 与各 Provider 账本消费方证据失效，须重测；**已知非阻断观察**：`src/common/编排/role-log.ts` 自持一套轮转/读取实现（含保留天数语义），属编排 owner 的候选收敛项（见 §5）。 |

### 2.11 `intent-entry-contract` —— 意图入口契约（单一来源文本与只读解析）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 意图入口的**单一来源**契约文本与只读解析（2026-10-30 §5A）：内置角色卡（chief/product/rapporteur/nominator）的格式/命名/检查职责、`contract_check` 的按角色契约摘要与当前项目意图入口事实、判断拒绝文案（missing-frontmatter / intentId 不一致）的模板与命名规则。解决的问题：同一契约文本不得在角色卡、门禁、判断文案各写一份。 |
| **代码与 public entry** | `src/common/shared/intent-entry-contract.ts`。见总表 #11。 |
| **属主与消费者** | **属主/维护者：`shared-code`**。消费者：**编排**（`governance-judge-intent.ts`、`governance-judge-evidence.ts`）、**门禁引擎**（`governance-roles.ts` 角色卡文本）、**Pipeline**（`run-role.ts`：`contract_check` 事实）、**桌面窗口**（`session.ts`）。§4.2 记「门禁/Service/角色模块」为预期消费面；E1 现状为编排/门禁/Pipeline/桌面，**未来角色模块**（E1 六模块的静态上下文）按 public entry 只读消费。 |
| **契约与示例** | `resolveIntentEntryReference` 是**唯一意图解析器**：请求显式 `intentId`（source=request）→ 提案 frontmatter（proposal）→ 产品意图 frontmatter（product）→ flowId 回落（flow-id，证据如实标注）；显式请求与提案/产品不一致、产品与提案不一致 ⇒ fail-closed `intent-ambiguous`；任一来源非空但不符合 slug ⇒ fail-closed `intent-unconfirmed`。`intentEntryContractText(role)` = 角色职责 + 命名规则 + 模板；`intentEntryRejectionHint()` = 命名规则 + 模板；`readIntentEntryFacts` 只读解析（显式路径优先，否则 `<flowId>-intent-vN.md` / `<flowId>-proposal-vN.md` 取最新；入口固定 `docs/intents/<intentId>.md`）。**不写盘、不判语义**。示例：<br>`const r = resolveIntentEntryReference({ flowId, proposalIntentId, productIntentId });`<br>`const facts = await readIntentEntryFacts({ projectRoot, flowId });` |
| **测试与变更影响** | **E1 新增专属单测** `test/项目管理/shared/intent-entry-contract.test.ts`（22 例）：解析优先级（request/proposal/product/flow-id）、冲突/非法 slug fail-closed、空白裁剪、`isValidIntentId`、`intentIdFromFrontmatter`、四角色契约文本同源、拒绝提示、`readIntentEntryFacts` 发现/显式路径/冲突/回落/入口不一致/空 flowId（注入桩件，不触真实文件系统）。此前只有消费方间接覆盖（编排/桌面用例）。**变更影响**：契约文本与解析器被角色卡、`contract_check` 与判断文案共享；变更须同步重跑编排/门禁/Pipeline/桌面消费方证据，并检查角色卡文本引用。 |

### 2.12 `shell-approval-binding` —— shell 审批链身份绑定与审计探针（2026-11-08 新增）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 「会话创建准入按操作审批」变更的**审批链身份证据**共享件（设计 P1.3 §2.3）：把 `createShellGate` 构造成功后的 gate 函数登记进进程内 `WeakMap`，记录模式/通道/规则注入/审计 sink 描述等**白名单事实**，并提供审计写门禁探针。用途：创建准入不再要求「预知未来命令」，改为要求「若注册了 shell 工具，则应用自己的审批链与审计在装配期已真实存在且可写」——本模块是该证据的单一来源，**不含任何策略/判定**（可接受的 mode 集合、受保护准入口径由运行时核心按事实判定）。 |
| **代码与 public entry** | `src/common/shared/shell-approval-binding.ts`。见总表 #12。`registerShellApproval(gate, facts, sink)`：仅由 `createShellGate` 在构造成功后调用；对 facts 做**白名单投影**（白名单外字段拒绝、不携带凭据/环境），`audit.probe` 必须为 `"unknown"`（**不接受调用方回填 probe 结果**），模块私有保存深度冻结副本与**私有 sink 引用**（sink 不出现在返回 facts 中）。`inspectShellApproval(gate)`：同步返回冻结基础事实或 `undefined`（未登记）。`probeShellApproval(gate)`：**无值入参**，模块内部 `await sink.probe()`；无 sink/无 `probe()`/抛错/非法返回值 ⇒ `"unavailable"`；同一 gate 并发共享同一 promise、结果冻结 memoize；**不存在接受 probe 结果值的 API**（无 finalize 类入口）。`SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE`：测试私有 Symbol（载体 = **sink 对象**的非枚举属性；`hasShellApprovalTestNonDurableAllowance` 只认非枚举自有属性）；**生产装配不得设置、生产公共出口不得再导出**。 |
| **属主与消费者** | **属主/维护者：`shared-code`**（设计 P1.3 §4.1 勘误 E3；PR #72 B-9 已移交）。消费者：**编排** `src/common/编排/shell-gate.ts`（`createShellGate` 登记；`buildShellGate`/`assemble*` 只传 `projectRoot`/sink）、**运行时核心** `src/service/runtime/session.ts`（`prepareRole`/`bindPreparedRole` 读取 `inspectShellApproval`/`probeShellApproval` 事实）、**测试** `test/项目管理/shared/shell-approval-binding.test.ts`。依赖方向：本模块**自包含（零 import）**，不引用编排/门禁引擎/角色模块/引擎层（I0-9）；sink 与事实类型为结构类型。 |
| **契约与示例** | 事实形状：`{ source:"orchestration-shell-gate", version:1, projectRoot?, mode:"readonly"\|"operator-approve"\|"rules-advisory"\|"three-layer", classifier, rules, pmAsk, operatorChannel, takeGrant, takeDirective, routinePolicy, audit:{ sink:"file"\|"memory"\|"custom", durable, probe:"ok"\|"unavailable"\|"unknown", relPath? }, escalation }`（全部 boolean 字段为通道/注入存在性）。结构性 sink：`{ probe?(): Promise<三态>; describe?(): { kind; durable; relPath? } }`（file sink 的探针/描述由编排实现，含一次 F-6-1 refresh 重试语义）。示例：<br>`registerShellApproval(gate, baseFacts, opts.audit);`<br>`const base = inspectShellApproval(gate); // 未登记 ⇒ undefined`<br>`const facts = await probeShellApproval(gate); // probe 由 binding 内部执行并 memoize`<br>**证据边界（如实）**：只证明「当前进程内该 gate 由应用 `createShellGate` 构造、登记事实与 sink 已带入、探针只能由 binding 执行」；不证明 native 效果闭包、不覆盖其它进程/绕过、不防御恶意宿主代码。 |
| **测试与变更影响** | `test/项目管理/shared/shell-approval-binding.test.ts`（19 例，W1 新增）：登记/未登记/身份隔离/重复登记拒绝；白名单投影与深度冻结（登记后再改原对象不影响副本、白名单外字段拒绝、probe 不可回填）；probe 无值入参、并发共享同一 promise、结果冻结 memoize；sink 三态（memory/custom/缺失/异步与同步抛错/非法返回值 ⇒ unavailable）；Symbol 非枚举载具与可枚举设置不认可；静态断言（Symbol 不得经 `src/service/gate/shell-rules.ts` 等生产出口导出、生产装配不得设置、模块零 import）。**变更影响**：本模块是受保护项目创建准入（`protected-scope-approval-chain-unproven`/`protected-scope-audit-unavailable`/`protected-scope-approval-chain-changed`）的事实来源；行为或形状变更须重跑运行时核心/编排消费方证据并重走 §4 接口评审。 |

---

## 3. 角色模块 / 门控 / 共享：owner 与 public entry（E0 冻结口径）

### 3.1 依赖方向（硬规则）

```
Model (src/model/)
   ↑ type-only / pure data
shared (src/common/shared/)                 ← shared-code（既有组件，per-component public entry；无伞状 index）
   ↑ public entries
{ roles (src/common/roles/<id>/), gates (src/common/gates/) }  ← 六 *-code / gates-code（唯一 public entry index.ts）
   ↑ public entry
engines (Interface/Pipeline/Service/Provider) ← 现有 owner；只读消费
```

1. **Model ← shared ← {roles, gates} ← engines**；不得反向 import（D2/D9 扫描口径；Model 内既有 type-only 边按 D9 豁免，禁止 value import 反向/环）。
2. **共享模块**不是单一新模块：`src/common/shared/` 的既有组件保留**各自 public entry**，**不新增伞状 `index.ts`**（E0 Q1）；`shared-code` 只维护/迁移既有组件。
3. 角色模块之间零 import；角色模块不 import 引擎/门控/其他角色私有 common；gates 不 import 角色；shared 不 import 门/角色/引擎各层。
4. 角色模块无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；只返回纯数据/判定，不携带权限（E0 §2 硬规则 6、§3.3）。
5. `src/common/编排/handback.ts` 与 `workflow-preconditions.ts` 是**编排的稳定公开只读入口**，默认**不迁移**到 shared（E0 §4.3/Q6）；角色模块不 import 它们。

### 3.2 owner 与 public entry 关系

| 模块 | 目录 / public entry | owner | 消费者（E0 §3.2/§5.1 冻结口径） | 测试根 | E1 状态（本目录编写时） |
| --- | --- | --- | --- | --- | --- |
| `chief` | `src/common/roles/chief/index.ts` | `chief-code` | 编排 `run-role.ts`（工具策略）、Service `apply-journal.ts`（hub 派发/报告）、桌面窗口（路由/呈现）、门禁引擎 `governance-roles.ts` 门面 | `test/roles/chief/` | greenfield，E1 并行建设中（未收敛；未判验收） |
| `product` | `src/common/roles/product/index.ts` | `product-code` | Service `version-change`/trunk、编排、桌面 | `test/roles/product/` | greenfield，E1 并行建设中（未收敛；未判验收） |
| `rapporteur` | `src/common/roles/rapporteur/index.ts` | `rapporteur-code` | Service VCA/run-change、桌面 | `test/roles/rapporteur/` | greenfield，E1 并行建设中（未收敛；未判验收） |
| `nominator` | `src/common/roles/nominator/index.ts` | `nominator-code` | Service appointment/journal、桌面、门禁引擎（D3 前置只读） | `test/roles/nominator/` | greenfield，E1 并行建设中（未收敛；未判验收） |
| `convener` | `src/common/roles/convener/index.ts` | `convener-code` | 编排（Git 能力装配）、Service apply-journal/hub、桌面 | `test/roles/convener/` | greenfield，E1 并行建设中（未收敛；未判验收） |
| `verifier` | `src/common/roles/verifier/index.ts` | `verifier-code` | Service/桌面（review/acceptance 路由） | `test/roles/verifier/` | greenfield，E1 并行建设中（未收敛；未判验收） |
| `gates` | `src/common/gates/index.ts`（`evaluateChiefDispatchParent` + 冻结输入/输出类型 + reason 闭集） | `gates-code` | 编排（`trunk-runtime.ts`）、Service | `test/gates/`（含模块图扫描） | greenfield，E1 并行建设中（未收敛；未判验收） |
| `shared` | `src/common/shared/<component>.ts`、`src/common/shared/i18n/index.ts`（**per-component，无伞状 index**） | `shared-code` | 见 §1 总表逐项；被 roles/gates/engines 只读消费 | `test/项目管理/shared/`（历史路径名，不改名） | E1 既有 11 项 + 2026-11-08 新增 1 项（`shell-approval-binding`），本目录维护 |
| Model 契约 | `src/model/role.ts`（门禁引擎 owner）、`src/model/runtime.ts`（运行时核心 owner） | 原 Model owner | roles/gates/shared type-only 引用 | 对应角色测试 | 只读契约输入（E0 D1 已落） |
| 编排公开只读入口 | `src/common/编排/handback.ts`（`isDispatchableRoleId`）、`src/common/编排/workflow-preconditions.ts`（`evaluateDispatchAuthorization`/`evaluateDispatchPreflight`/`reportTargetForTaskCreator`） | 编排（唯一 writer） | Service/桌面等现有消费者 | `test/编排/`、`test/桌面应用/` | **不迁移**（E0 §4.3/Q6）；shared 不复制 |

> 角色模块/门控目录由各自 owner 在 E1 建立并维护；本单元核对时 worktree 中已出现并行建设的未收敛文件，**本目录只登记 owner–public entry–消费者关系**，不复制其模块契约、不核对其实现状态（E0 §3 为唯一冻结口径；验收由 B2 判）。

---

## 4. 共享 API 变更流程（E0 §4.4，无客户卡）

1. 需求方（角色/门控/引擎 owner）提交变更提案：目的、受影响 public entry、消费者、兼容性、测试、迁移/回滚。
2. `shared-code` 评审共享 API 变更并书面批准/拒绝；门 API → `gates-code` 评审；角色模块 public entry → 对应 `*-code` 提出、消费者 owner 确认。
3. 实现 + 测试；受影响 owner 更新调用；统筹排期；独立验收按证据判断。
4. 更新本目录/共享组件目录与冻结记录；旧实现删除，不留双份。
5. 不新造客户卡；不把内部评审伪装成客户决定。

**评审记录要求（无记录不得合并/新增）**：语义与兼容性说明、消费者影响清单、测试证据（共享单测 + 受影响消费者契约测试）、迁移路径（若破坏兼容）。E1 无新增/变更 public entry（见证据文档），故本文件不附评审记录。

**2026-11-08 新增 public entry 的评审记录（W1，`shell-approval-binding`）**：
1. 需求/接口评审（冻结结论）：`docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` §二 I0（I0-1 登记点/签名、I0-2 Symbol 挂 sink 非枚举且不得经生产出口再导出、I0-3 未登记/probe 失败语义、I0-9 依赖方向）。
2. 设计：`docs/planning/2026-11-08_design_session-admission-approval-based.md`（P1.3，855 行 / SHA-256 `2553b97a…`）§2.3.1–§2.3.4、§4.1、§4.4。
3. 设计复核：`docs/planning/2026-11-08_review_session-admission-approval-based.md` §F8、R1–R3、R8a–R8c。
4. 验收标准：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（B1 v1，`fb881126…`）§0.3、AC-12、AC-27。
5. 消费者影响清单与测试证据（W1）：`角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md`。

---

## 5. 消费者影响与已知观察（非阻断，供各 owner 后续接口评审）

1. **Model 的 type-only 只读边**：`src/model/runtime.ts`、`src/model/download.ts` 以 `import type` 引用 `src/common/shared/runtime-shared.ts`（`RuntimeKind`），`src/model/runtime.ts` 另以 type-only 引用 `diagnostics.ts`（`createDiagnosticLogger` 类型）。这是既有边（E0 D9 豁免 Model 内 type-only；禁止 value import 反向/环）；共享侧不得反向 import Model 以外的新层。
2. **i18n 内部文件直连（type-only）**：`src/provider/runtime/tools.ts`、`app/renderer/src/chat/card-meta.ts` 直接 `import type { MessageKey } from ".../i18n/keys.ts"`；`i18n/index.ts` 已再导出 `MessageKey`，消费者宜统一经 public entry（行为等价，type-only）。属运行时核心/桌面UI owner 的清理项。
3. **渲染层本地 `RuntimeKind`**：`app/renderer/src/chat/types.ts` 自持 `"pi" | "codex" | "claude"` 联合（渲染层不能导入含 `node:os`/`node:path` 的 `runtime-shared.ts`）。语义子集，属桌面UI owner；新增 runtime 时须同步（不构成 shared 实现副本）。
4. **原子写候选收敛**：`src/common/门禁引擎/versioned-doc-guard.ts` 私有 `atomicWrite`（temp→`fsync`→`rename`，**无**共享原语的 Windows 瞬时重试）与共享 `atomic-write` 部分重叠；属门禁引擎 owner，未在 E1 迁移（`src/common/shared/` 写集不含门禁引擎文件）。
5. **JSONL 轮转候选收敛**：`src/common/编排/role-log.ts` 自持轮转/读取（含保留天数与摘要规则），与共享 `jsonl-ledger` 语义不完全相同；属编排 owner，未在 E1 迁移。
6. **既有文件头注释**：多数共享组件文件头仍写「属主：项目管理（唯一写入者）」——为 2026-10-11 迁移时的历史注释；**owner 已按 H1/团队计划移交 `shared-code`，本目录为现行权威**。注释更新属纯文档清理，未在本 E1 行为零变更窗口内进行（会触及全部组件文件；列入后续维护项，不改行为）。

---

## 6. 变更（本文件）

- **2026-11-07（E1）**：建立 `角色卡/shared-code/docs/architecture/shared-components.md`（shared-code 现行唯一目录）。以 `角色卡/项目管理/docs/architecture/shared-components.md`（216 行 / `dd33fdf7…`，只读输入）迁建：登记 `src/common/shared/` 全部 **11** 个组件（含 PM 旧目录未列的 `intent-entry-contract`）的 name/用途、代码与 public entry、owner（`shared-code`）、消费者、契约/示例、测试与变更影响；新增 §3「六角色模块/门控/共享的 owner–public entry–消费者」与 §5 消费者影响观察。**未改** `src/common/shared/` 代码（E1 行为零变更）、未改 `src/common/编排/` 两文件、未迁移任何引擎行为；共享测试新增 `intent-entry-contract` 专属单测（22 例，补测试缺口）。旧副本由项目管理按团队计划 §6.4 在 E1 迁移窗口删除，删除前冻结只读。证据：`角色卡/shared-code/docs/change/2026-11-07_E1_shared-catalog-and-maintenance-evidence.md`。
- **2026-11-08（W1）**：新增第 12 项 `shell-approval-binding`（`src/common/shared/shell-approval-binding.ts`；会话创建准入按操作审批的审批链身份绑定/审计探针共享件；owner `shared-code`）。更新 §1 总表（11→12 项）、新增 §2.12、更新 §3.2 `shared` 行与 §4 评审记录；**未改**既有 11 个组件与任何引擎/门控代码。证据：`角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md`。
