# 跨角色共享组件目录（`src/common/shared/`）

本文件是 `src/common/shared/`（跨角色共享组件）的**现行复用目录**——与带日期的 design/change 历史分开维护。
**属主：项目管理**（`src/common/shared/` 及其专属测试 `test/项目管理/shared/` 的**唯一写入者**）。
依据：技能 `references/shared-directories.md`「Shared-Component Document」；工程法案 `docs/project-rules.md` §一.5/§一.6。

**共享组件的流转**（技能规定）：某角色报复用需求 → 项目管理写设计并确定消费方 → 客户确认文档并授权实现 →
项目管理实现并测试 `shared/` → 安排各消费方接线 → 跑受影响测试 → 更新本目录、相关功能流与项目架构。
**不保留两份独立维护的副本**：经批准的抽取完成后，**原属主须更新自己的调用方并废弃旧实现**。

**消费方硬规则**：消费方**只读导入** `src/common/shared/` 的模块，**不得复制第二份实现**；消费方
**不得写入** `src/common/shared/`（其唯一写入者是项目管理）。共享行为变更会使受影响调用方的既有证据失效。

---

## 组件 1：`.ans` 有效配置载入器（`config-loader`）

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | `.ans` 有效配置载入器。加载项目根下 `.ans/project.json`，按终态规则（设计 §3.3）做 **fail-closed** 规范化后，把 `project`（`roles` / `governanceBoundary`）与 `source`（配置来源 + 生效 acceptance + pin 路径 + 降级原因）作为**纯值**交给调用方。解决的问题：让「项目带 `.ans` 就优先加载它（pin 生效），否则回退运行期同意/内置演示」这条**判定链**只有**一份**实现，避免装配与桌面各自维护一份而分叉。 |
| **代码与公共入口** | 代码：`src/common/shared/config-loader.ts`。公共入口（导出）：`loadEffectiveConfig(opts)`（主入口，**永远返回值、不抛错**）、`enforcePinBackedAcceptance(acceptance, origin)`（终态规则纯函数）、`ansProjectPath(root, ansDirName?)`、常量 `ANS_DIR_NAME` / `ANS_PROJECT_FILE_NAME`，以及类型 `ConfigSource` / `ConfigSourceKind` / `LoadedConfig` / `LoadConfigOptions`。 |
| **属主与消费方** | **属主/维护者：项目管理**。**消费方**：**装配**（`src/index.ts`、`src/interface/cli/init.ts` 目前仍引装配私有副本，见下「变更影响」；T12 改为从本模块导入）、**桌面应用**（T13 接线：有 `.ans` 用其 pin-backed acceptance、无则回退运行期同意）。**均为只读导入**，不得复制第二份。 |
| **契约与示例** | 入参 `LoadConfigOptions = { projectRoot, skillRoot, fallback, ansDirName? }`。返回 `LoadedConfig = { project, source }`，恒返回、不抛。三分支：① 无 `.ans/project.json` → `source.kind="builtin-fallback"`，`project` **原样**等于 `fallback`（**不经**终态规则，回退路径行为不放松）；② 有且可解析 → `source.kind="ans"`，accepted:true **必须 pin-backed**（无 pin → 置未接受并**清空 source**）；③ 有但不可用（不可读/不可解析/顶层非对象）→ `source.kind="ans-invalid"`，roles 为空、治理边界未接受、**不回退**演示 acceptance。示例：<br>`const { project, source } = await loadEffectiveConfig({ projectRoot, skillRoot, fallback });`<br>`if (source.acceptance.accepted) { /* 用 project 开会话 */ }`<br>**边界（不做）**：pin **对不对**（逐文件 SHA-256 比对）不在本层——那是门禁引擎 `boundary-core.ts::verifyPins` 在其上再加一层。本层只判「有没有 pin」（存在性与形状）。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/config-loader.test.ts`（12 例）：合法 `.ans`（带 pin）→ 注入正确；`accepted:true` **无 pin** → 未接受且 source 清空；pin 与 hash 不符 → **引擎层**判未接受；`.ans` 存在但不可解析/顶层非对象 → **未接受、不回退**；**无 `.ans`** → 回退且不崩；`ansDirName` 覆盖。**变更影响**：本组件的抽取（T11）后，**装配须删除其本地重复实现**（`src/common/装配/config-loader.ts`）并改为从本模块导入——**T12**。在 **T12 完成前处于「两处并存窗口」**：两份代码**逐字相同**、行为不分叉；一旦 `shared/` 行为变更，装配本地副本即变为**陈旧第二实现**，故 T12 应先落。装配 `src/index.ts` 的 `ConfigInjection` 类型**不属本组件**（它在装配入口，引用本模块的 `ConfigSource`），随装配自身维护。 |

---

## 组件 2：共享路径原语（`path-primitives`）—— 安全相关，单一来源

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享**路径原语**：纯词法规范化（`normalizeLexical`/`compareKey`/`absRel` 等）+ 真实路径解析（`realResolve`/`realResolveAsync`）。解决的问题：**「gate 认为在根内」与「写入层认为在根内」必须一致**——写入层是最后一道纵深防御，两者语义若漂移就存在**误放行**空间（设计 §6 风险 2–3「写根与 gate 同源」）。此前两处各自维护同语义副本（门禁引擎 `paths.ts` / Pi适配器 `fs-write.ts`），本组件把**词法原语整体搬迁**为单一来源（搬迁，非 fork）。 |
| **代码与公共入口** | 代码：`src/common/shared/path-primitives.ts`。导出：`IS_WINDOWS`、`toPosix(p)`、`isAbsoluteAny(p)`、`normalizeLexical(p)`、`compareKey(p)`、`isUnderOrEqual(rel, base)`、`absRel(abs, base)`、`isWithinReal(rootReal, targetReal)`、`realResolve(abs)`（sync）、`realResolveAsync(abs)`（async）。 |
| **属主与消费方** | **属主/维护者：项目管理**。**消费方**：**Pi适配器**（`src/common/pi-adapter/fs-write.ts` 写好前的守卫/复核，T20 删本地镜像后改导入）、**门禁引擎**（`src/common/门禁引擎/paths.ts`，T25 删 `toPosix` 等副本后改导入）。**均为只读导入**，不得复制第二份。 |
| **契约与示例** | 词法原语**逐字同源**（`normalizeLexical`/`compareKey`/`absRel`/`isUnderOrEqual`/`toPosix`/`isAbsoluteAny` 全部由旧实现逐字搬迁）。`realResolve`（sync，原语 `realpathSync.native` 优先、JS `realpathSync` 兜底）与 `realResolveAsync`（async，原语 `await realpath`）**算法逐字相同**，仅 realpath 调用为 sync/async 之别；二者**对同一输入给同一答案**（含大小写、junction/symlink、不存在尾部），由测试钉死。**边界（不做）**：**治理判定**（那永远是门禁引擎 `resolveWrite` 的事）；**写入层名称安全**（Windows 保留设备名/尾点空格/ADS 等，`checkRelativePathSafe` 留在 Pi适配器——门禁无对应物，非镜像）。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/path-primitives.test.ts`（21 例）：共享原语边界（大小写、尾点/空格、`..`、绝对/相对、Windows 分隔符）；**逐字同源**核对（共享 vs 两处旧实现同输入同输出）；**要害**——门禁 `realResolve`(sync) 与 Pi适配器 `realResolveAsync`(async) 对同输入同答案；junction 逃逸解析。**变更影响**：抽取（T23）后 **Pi适配器（T20）须删 `fs-write.ts` 本地 `normalizeLexical`/`compareKey`/`absRelLexical`/`toPosix`/`isWithinReal`/`realResolveAsync` 副本并改从本模块导入**；**门禁引擎（T25）须删 `paths.ts` 的 `toPosix` 等副本并改从本模块导入**。**T20/T25 完成前处于「两处并存窗口」**：两份**逐字相同**、行为不分叉；一旦本模块行为变更，旧副本即变为**陈旧第二实现**（安全相关，须优先收敛）。 |

---

## 组件 3：共享运行时原语（`runtime-shared`）

2026-10-14，依据 [ANS-RUNTIME-V2 revision 1](../design/2026-10-14_design_multi-runtime-integration.md)，现行枚举扩为 `demo/pi/codex/claude`，新增 `RUNTIME_LABELS`；默认仍是 `demo`。下面原 v1 的字段来源解释保留作迁移背景，以 [本角色实际实现报告](../../api-spec.md) 为当前接口和验证状态。编排的第二枚举正由其属主 O1 收敛，不能提前宣称所有消费方已一致。

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 三类散在多处的运行时小原语的**单一来源**：① `RuntimeKind`（`"demo"｜"pi"`，原散在编排/装配/桌面 **3 处**）；② `PI_CREDENTIAL_ENV_VARS`（Pi 凭据变量名单，原散在装配/Pi适配器 **2 处**，**安全相关**：装配据此判「有没有凭据」、Pi适配器据此在 spawn 时**剥离**）；③ `resolveSkillRoot`（技能根解析，原散在装配/桌面 **2 处**）。 |
| **代码与公共入口** | 代码：`src/common/shared/runtime-shared.ts`。导出：常量 `RUNTIME_KINDS`、`DEFAULT_RUNTIME`、`RUNTIME_LABELS`、`RUNTIME_LABEL_KEYS`、`PI_CREDENTIAL_ENV_VARS`、`RUNTIME_CREDENTIAL_ENV_VARS`；类型 `RuntimeKind`；函数 `resolveSkillRoot(env = process.env)`。 |
| **属主与消费方** | **属主/维护者：项目管理**。**消费方**：**编排**（`src/common/编排/args.ts`，T21）、**装配**（`src/common/装配/runtime.ts`、`src/index.ts`，T24）、**Pi适配器**（`src/provider/pi/tools.ts`，T20）、**桌面应用**（`app/desktop/project.ts`、`app/desktop/session.ts`，T22）。**均为只读导入**，不得复制第二份。 |
| **契约与示例** | `RuntimeKind = (typeof RUNTIME_KINDS)[number]`，`RUNTIME_KINDS = ["demo","pi","codex","claude"]`，`DEFAULT_RUNTIME = "demo"`。`RUNTIME_LABELS` 为语言中性显示值（2026-10-23 i18n B4：`demo` 由 `"演示"` 改 `"demo"`；Pi/Codex/Claude 品牌名不变）；`RUNTIME_LABEL_KEYS: Record<RuntimeKind, MessageKey \| null>` 指向目录 key（demo → `shared.runtimeSettings.runtime.demo`，品牌名为 `null`），显示方对非 `null` 项用 shared `translate` 取词。`resolveSkillRoot(env)`：`env.ANS_SKILL_ROOT` 非空即用，否则 `~/.claude/skills/ans-governed-construction`（消费方 `src/index.ts` 的无参调用 `resolveSkillRoot()` 走默认参数读 `process.env`，行为不变）。`PI_CREDENTIAL_ENV_VARS`：`ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/OPENAI_API_KEY/GEMINI_API_KEY/PI_API_KEY`。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/runtime-shared.test.ts`（8 例，含 B4 +1）：三类取值与**各消费方旧副本一致**、`resolveSkillRoot` 优先/回退/空串、B4 demo 语言中性 + key 解析（zh「演示」/en「Demo」）与品牌名不变。**变更影响**：抽取（T23）后各消费方（编排 T21、装配 T24、Pi适配器 T20、桌面 T22）须**删本地副本、改从本模块导入**；**完成前处于「两处并存窗口」**（取值逐字相同、行为不分叉）。B4 导出的显示 key 由桌面窗口在设置视图解析；渲染层**不得**导入本文件（`node:os`/`node:path`）。 |

---

## 组件 4：共享 argv 原语（`argv-primitives`）—— 审计/呈现同源，单一来源

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享 **argv 规范化**原语 `normalizeArgv(argv)`：把不可信入参整理为 `string[]`（非数组归空、仅留字符串项）。解决的问题：**「落进审计的 argv」与「操作者所见到的 argv」必须同源**——编排拿它**写进审计记录**（`docs/audit/shell-gate.jsonl` 的 `argv` 字段），桌面应用拿**同一结果**展示给操作者（`describeShellCommand` 的逐项 argv 行）。审计的意义正是「**审的什么原文**」可查；两处若漂移，则「操作者所见」与「审计所记」**不是同一个**。此前两处各自维护同形副本（编排 `shell-gate.ts` ↔ 桌面 `operator-channel.ts`），本组件把函数**整体搬迁**为单一来源（搬迁，非 fork）。 |
| **代码与公共入口** | 代码：`src/common/shared/argv-primitives.ts`。导出：`normalizeArgv(argv: unknown): string[]`。 |
| **属主与消费方** | **属主/维护者：项目管理**。**消费方**：**编排**（`src/common/编排/shell-gate.ts`，原私有函数，T21 删本地改导入）、**桌面应用**（`app/desktop/operator-channel.ts`，原私有函数，T22 删本地改导入）。**均为只读导入**，不得复制第二份。 |
| **契约与示例** | 入参 `unknown`，出参 `string[]`。行为（**逐字搬迁自两处旧实现**）：非数组 → `[]`；仅保留 `typeof === "string"` 的项，其余丢弃；**不去重、不裁剪空白、不转义、保序**（含空串、含引号/空格/反斜杠的项、Windows 与 POSIX 路径原样）；**绝不抛错**。示例：<br>`normalizeArgv(["ls", 1, "-la", null]) // ["ls","-la"]`<br>`normalizeArgv(undefined) // []`<br>**边界（不做）**：**任何治理判定**——「命令是否危险」唯一由门禁引擎判、「语义是否放行」唯一由 pm 审读判，本函数只做纯值规范化，不含分类/白名单/规则逻辑。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/argv-primitives.test.ts`（12 例）：空数组、非数组入参一律归空、只留字符串项、保序、空串保留、含空格/引号逐字保留、Windows/POSIX 路径原样、**不去重**、旗标形态、Unicode、不改入参、返回新数组。**变更影响**：本组件的抽取（T23）后，**编排（T21）须删 `shell-gate.ts` 本地 `normalizeArgv` 并改从本模块导入**（3 处调用点：`decide`、`runB` 的 `PmReviewInput`、`runA` 的 `OperatorPrompt`、`audit` 的审计记录）；**桌面应用（T22）须删 `operator-channel.ts` 本地 `normalizeArgv` 并改从本模块导入**（`describeShellCommand` 调用点）。**二者完成前处于「两处并存窗口」**：两份**逐字相同**、行为不分叉；一旦本模块行为变更，旧副本即变为**陈旧第二实现**（审计/呈现同源相关，须收敛）。**注**：两处旧实现均为**私有非导出函数**，故本组测试**不**像 `path-primitives` 那样直接导入两处旧实现比对；逐字相同由本任务字节级核对确认。 |

---

## 组件 5：共享 `.env` 读写模块（`env-file`）—— 凭据落盘，单一来源

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享 **`.env` 读写模块**：**逐行**解析/合并 `.env`（`parseEnvFile` / `mergeEnvText`）、**原子写**（`atomicWriteText`，同目录 temp + `fsync` + `rename`）、**载入 env**（`loadEnvFileInto`，读 `.env` → `process.env`，补 Electron 缺失的 `--env-file`）、以及组合入口 `readEnvFile` / `saveEnvFile`。解决的问题：**桌面 Pi 配置界面 → 保存到 `.env`**（客户 2026-10-11）需**唯一一份**、**只改相关键**且**不回显凭据**的 `.env` 读写实现；`.env`（仓库根、装配 Section 1 已列、已 gitignore）**仍归装配**，本模块是它的**指定写入者**（与 `docs/scheduling/` 同形：目录归 X、内容由指定写入者写），该安排经 **Governance 记档（G-2）**。 |
| **代码与公共入口** | 代码：`src/common/shared/env-file.ts`。导出：`parseEnvFile(text)`、`mergeEnvText(original, updates)`、`atomicWriteText(filePath, text)`、`readEnvFile(envPath)`、`saveEnvFile(envPath, updates)`、`loadEnvFileInto(env, envPath?)`、`parseEnvValue(raw)`、`renderEnvValue(value)`、`PI_CONFIG_SECRET_KEYS`、`isSecretKey(key)`；类型 `EnvMap` / `EnvTarget` / `LoadEnvResult`。**设计 §11/T26 所称 `parse`/`merge`/`atomicWrite`/`loadEnvFileInto` 即对应 `parseEnvFile`/`mergeEnvText`/`atomicWriteText`/`loadEnvFileInto`**（同义名，模块抬头已注明）。 |
| **属主与消费方** | **属主/维护者：项目管理**。**消费方**：**桌面应用**（**T28**：启动 `loadEnvFileInto(process.env, …)` 补 `--env-file`；配置面板 `saveEnvFile` 存回、成功后重载；掩码用 `isSecretKey`），**测试**（**T29** 往返与写入纪律）。**均为只读导入**，不得复制第二份。 |
| **契约与示例** | `EnvMap = Record<string,string>`；`EnvTarget = Record<string,string\|undefined>`；`LoadEnvResult = { path: string; applied: string[] }`（**只含键名**，不含值）。**写入纪律（设计 §11.4，客户红线）**：① **只改相关键**——`mergeEnvText` **逐行**、只替换命中键的**值 token**（保留键/`=`/两侧空白/`export `/原引号风格/**内联注释**），未命中行（注释、空行、未知键、其它键）与**顺序**逐字节不变，缺键**追加**末尾；**绝不重写整份**；更新为空**恒等**。② **凭据不回显**——错误经 `envError` **只含动作/路径/错误码**并对传入值 `redactSecrets` 兜底；`loadEnvFileInto` **只回报键名**；`PI_CONFIG_SECRET_KEYS=["ANTHROPIC_AUTH_TOKEN"]`+`isSecretKey` 供掩码。③ **原子写**——`atomicWriteText` 同目录 temp → `fsync` → `rename`；失败清理 temp 并抛错，目标 `rename` 前不被触碰。④ **失败显式**——读写失败抛错；`loadEnvFileInto` 仅 ENOENT（无 `.env`）作无操作。示例：<br>`await loadEnvFileInto(process.env, envPath);`<br>`await saveEnvFile(envPath, { ANS_PI_MODEL: "m", ANTHROPIC_AUTH_TOKEN: token });`<br>`await loadEnvFileInto(process.env, envPath); // 重载使下一会话用新值`<br>**边界（不做）**：**不构造/不注入 Pi 适配器配置**——`createPiAdapterFactory`/`resolvePiProviderConfig` 由 Pi适配器**原样复用**（§11.3 裁定：**不扩签名**）；**不掩码/不呈现**（UI 归桌面 T28）；**不判定哪些键必填**（策略归消费方）。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/env-file.test.ts`（**30 例**）：**只改相关键**（注释/空行/未知键/无关键/顺序/`export`/两侧空白逐字节保留，`assertOnlyLineChanged` 逐行比对）；**追加 vs 就地替换**（无尾随换行/空文件/同键多行）；**特殊字符**（`=`/空格/引号/`#`/反斜杠/tab/首尾空白/空值）**写后读回逐字一致**（含保留引号风格与内联注释）；**CRLF 保留**；**原子写**（内容完整 + **无 temp 残留**）；**失败路径**（目录不存在 / 目标是目录 / 文件不存在 → 抛错且**原文件不损**）；**不回显**（哨兵值不出现在错误文本、回报不含值）；`loadEnvFileInto` 语义（不存在无操作、同名键覆盖）；机密键名单；读→改→写→读往返。全部用系统临时目录、用后清理、**不指向仓库根真实 `.env`**。**变更影响**：本组件（T26）为 **T28（桌面面板+载入保存）/T29（测试）** 的前置；消费方（桌面）**只读导入、不得复制第二份**——`.env` 的读写逻辑**全仓唯一**（此前无任何 `.env` 文件读写实现，故不存在第二份）。 |

---

## 组件 6：共享原子写原语（`atomic-write`）—— 可靠性相关，单一来源

2026-10-21 D3：现行 `AtomicWriteOptions` 包含可选 `finalMode`（0–0777 普通权限位）。POSIX 在提交前通过临时句柄 chmod 应用后再 fsync/rename，避免 umask 丢失执行位；Windows 和未传此选项的调用方保持原语义。核心负责选择已有文件权限，共享层不做角色授权或自动继承权限。接口与本次 53/53 自测见 [实现报告](../../api-spec.md#d3-轻量修复原子写普通权限位)及[实施记录](../fix/2026-10-21_fix_d3-lightweight-permission-repairs.md)。以下表中最初迁移过程与测试数量为历史信息。

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 跨角色共享**原子写**原语：同目录临时文件 → 写 → `fsync` → `rename` **覆盖目标**（`atomicWrite`），并对其中的 rename 做 Windows **瞬时 `EPERM`** 的**有界重试**（`renameReplacingExisting` / 重试核心 `retryOnTransient`）。解决的问题：本项目多处需要原子落盘（本仓至少 `env-file` 与 **Pi适配器** `fs-write.ts` 两处），而 Windows 上「rename **覆盖已存在**目标」会因**实时防护/索引器/杀软微过滤驱动短暂持有目标句柄（不含 `FILE_SHARE_DELETE`）**而**瞬时**返回 `ERROR_ACCESS_DENIED`（Node 报 `EPERM`）；若各处各自处置，这段**非平凡且可靠性强相关**的重试即成为 §6 逼出的**第二份镜像**（工程法案 §一.5「不得复制第二份」）。度量（Pi适配器实测）：覆盖**已存在**目标 → 单进程 ~3/20000、并发 ~7/20000；覆盖**不存在**目标 → **0/48000**（对照组干净 ⇒ 非逻辑 bug，是 OS 层瞬时占用）。 |
| **代码与公共入口** | 代码：`src/common/shared/atomic-write.ts`。导出：`atomicWrite(filePath, data, options?)`（`data: string \| Buffer`；`options: AtomicWriteOptions = { mode?, tmpPrefix? }`，缺省 `mode=0o666`，即 env-file 既有行为）、`renameReplacingExisting(from, to)`、`retryOnTransient(op, maxAttempts?)`；常量 `RENAME_TRANSIENT_CODES`（`EPERM`/`EBUSY`/`EACCES`）、`RENAME_MAX_ATTEMPTS`（=200，由实测尾部≈63 留 ~3x 余量，见该常量文档）；类型 `AtomicWriteOptions`。 |
| **属主与消费方** | **属主/维护者：项目管理**。**消费方**：**`env-file.ts`**（本模块消费方；`atomicWriteText` 已改为委托 `atomicWrite`）、**Pi适配器**（`src/common/pi-adapter/fs-write.ts::atomicWriteFile`，**待改导入**——见下「变更影响」）。**均为只读导入**，不得复制第二份。 |
| **契约与示例** | `atomicWrite(filePath, data, options?)`：`string` 按 UTF-8 写出、`Buffer` 按字节；同目录规避跨设备 `EXDEV`；失败**清理 temp 并抛错**，目标在 `rename` 成功前**不被触碰**（半写不可能）；`open(tmp,"wx",mode)` 独占建 temp、名含 `pid`+`randomBytes` 防撞。`renameReplacingExisting(from,to)`＝`retryOnTransient(() => rename(from,to))`。`retryOnTransient`：**仅**瞬时码重试、**有界**、次数间**仅 `setImmediate` 让出事件循环（无固定 sleep、无忙等）**、非瞬时**立即抛**、达上界**照抛**。示例：<br>`await atomicWrite("/p/.env", text);`<br>`await atomicWrite(abs, buf, { mode: 0o600 }); // Pi适配器字节语义 + 更严权限`<br>**边界（不做）**：**不做治理判定**（那是门禁引擎 `resolveWrite` 的事）、**不做写入层名称安全**（`checkRelativePathSafe` 留 Pi适配器——门禁无对应物，非镜像）、**不构造/不解析**内容（纯字节/文本落盘）。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/atomic-write.test.ts`（**13 例**）：**确定性注入**（直测 `retryOnTransient`——瞬时 `EPERM` 5 次后第 6 次成功、`EBUSY`/`EACCES` 同集合、非瞬时（`ENOENT`/`EISDIR`/`EROFS`/`EXDEV`/无 code）**立即抛不重试**、**有界**耗尽即抛、上界-1 次成功即返回、**让出事件循环**由「外部 immediate 恰插在两次尝试之间」钉死）；`atomicWrite` 写 string/Buffer、覆盖已存在目标、目录不存在即抛且不建目录、无 temp 残留；`renameReplacingExisting` 覆盖成功；**并发自争用**（8 路 × 250 轮同一目标）全部成功、无残留；且 `env-file.test.ts` **+1 例**同类并发（8 路 × 150 轮）。**变更影响**：本组件抽取后，**Pi适配器（后续任务）须删 `fs-write.ts` 私有 `renameReplacingExisting`/常量/内联 temp+rename，改 `atomicWriteFile(abs,data)` 为 `atomicWrite(abs, data, { mode: 0o600 })` 并从 `../../common/shared/atomic-write.ts` 只读导入**；**完成前处于「两处并存窗口」**（两处 rename-重试语义**逐字同源**、行为不分叉）。**注**：`env-file.ts` 的 `atomicWriteText` **保留导出**（消费方 T28 只读导入此名、`test/测试/t29-*` 亦引用），仅**实现体**改委托本原语；共享原语**未**使用 `atomicWriteText` 之名（避免与 `t29-pi-config-roundtrip.test.ts` 的「`.env` 符号只在 env-file.ts 定义」扫描冲突）。 |

---

## 组件 7：统一诊断日志（`diagnostics`）—— 滚动24小时

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 为应用、会话、工具、审核和回交提供同一条可追溯的本地诊断链，避免各角色自造存储/清理规则。 |
| **代码与公共入口** | `src/common/shared/diagnostics.ts`：`configureDiagnostics`、`createDiagnosticLogger`、`getDiagnosticsStatus`、`flushDiagnostics`、`disposeDiagnostics`；常量 `DIAGNOSTIC_RETENTION_MS=86400000`。 |
| **属主与消费方** | **项目管理**维护实现和专属测试。桌面 main 初始化目录；桌面、编排、Pi适配器只读消费 logger。消费者已接线并完成独立组合验证。 |
| **契约与示例** | `createDiagnosticLogger({component:'session',roleId:'A'}).record('send.start',{turnId:'t1'})`；未配置时 no-op。元数据（落盘白名单，2026-10-16 起含 `timeoutMs`，2026-10-27 起含 `mimeType`/`bytes` 并做字段级校验）JSONL 串行落盘，未知字段丢弃、凭据净化；命令原文/argv/prompt、图片字节/base64/`data:` URL 等正文依设计契约禁入。异常用 `.error(event,error,fields)`。IO失败通过 status.lastError 如实反馈，不让业务抛错。 |
| **留存与目录** | 桌面目录 `app.getPath('userData')/ans/diagnostics`。记录按时间滚动保留24小时，启动清理、写入检查维护期限、每分钟维护清理；扫描最多每分钟一次，避免每条记录扫描整天日志。只处理本模块诊断文件，不修改会话历史、治理审计或用户文件。维护 timer 不阻止正常退出。 |
| **测试与影响** | `test/项目管理/shared/diagnostics.test.ts` 10/10：精确过期边界、维护自动清理、有序追加、白名单元数据（`timeoutMs` 落盘、非有限数值丢弃、正文摘要 `excerpt` 不入）、`view_image` 审计字段（`mimeType`/`bytes`/`mode` 落盘，非法 MIME、负数字节、图片 base64/`data:` URL 丢弃）、敏感字段净化、IO失败及正常退出。共享接口变动需重跑桌面/编排/Pi消费方；不记录 prompt、源码、原始工具/API正文。依据[统一方案](../design/2026-10-13_design_runtime-diagnostics-and-reporting.md)。 |

## 组件 8：运行时设置目录（`runtime-settings`）

`src/common/shared/runtime-settings.ts` 由项目管理单一维护，桌面窗口通过只读导入 `RUNTIME_SETTINGS/getRuntimeSettingsDefinition` 组装掩码设置视图；renderer 接收 IPC 视图，不直接引用 Node/TypeScript 文件。字段登记真实 SDK 的机器元数据 `key/required/secret/fallbackKeys?/choices?/control?/integer?`，不包含凭据值、不推断 SDK/账户可用；**展示文案自 2026-10-23 i18n B4 起只以目录 key 表达**：`labelKey`（必填）、`helpKey?`、`choiceLabelKeys?`（与 `choices` 等长），类型 `MessageKey`，由主进程按当前 locale 解析为 `label/help/choiceLabels` 后推给渲染层（渲染层契约不变，见 [i18n 方案 §4.9](../../../../docs/planning/2026-10-23_design_i18n.md)）。`choices?`（2026-10-16 G-5 增，客户批准）：有（非空）则该字段值域即选项、应以致选择控件呈现，缺省/空＝自由文本——只描述设置、不描述控件实现。Pi、Codex、Claude 各自真实字段和默认行为见 [实现报告](../../api-spec.md)；SDK 实际支持变化须由原属主报告后更新并重测消费方。测试 `test/项目管理/shared/runtime-settings.test.ts` 14/14：验证所有 credential alias 都被秘密键目录覆盖、各引擎 required/default 语义、G-5 推理强度三字段（键/labelKey 解析/choices 值域[Codex 无 off]/helpKey 统一/choices 纪律），以及 **B4 零变化快照**（字段集/顺序/必填/secret/fallbackKeys/choices/control/integer 与迁移前逐项一致）、**key 映射**（每个 label/help/choice key 解析回迁移前中文逐字一致）、**key 契约**（zh-CN/en-US 目录均可解析、无孤儿/无遗漏）。依据 [ANS-RUNTIME-V2](../design/2026-10-14_design_multi-runtime-integration.md)。

## 组件 9：共享国际化消息目录（`i18n`）—— 单一目录与唯一翻译实现

2026-10-23 B0：客户闸门 0/1/2 已确认、实施授权已给（`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`），按 i18n 方案 v1（`docs/planning/2026-10-23_design_i18n.md` §4–§6、§9.1 B0）与团队计划（`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3、§5 I4a）实施。B0 只冻结共享 API 与消息目录；渲染层 facade/store、主进程 preferences/IPC/preload、窗口/对话框接线由桌面UI/桌面窗口在 I4b 完成，不在本组件 B0 交付内。

| 字段 | 说明 |
| --- | --- |
| **名称与用途** | 共享**国际化消息目录与唯一翻译实现**。解决的问题：用户可见文案此前散落在渲染层组件/纯逻辑、主进程系统行、窗口/对话框与设置元数据中，没有单一来源；本组件提供 `zh-CN`（key 全集参考）与 `en-US` 目录、`Locale` 白名单、`{param}` 插值、`Intl.PluralRules` 复数、缺失 key/参数的稳定回退与诊断。**机器标识不翻译**（roleId、cardKind、协议字段、事件/日志码、测试断言标识）；角色提示词/卡文本/模型输出/文档不在本轮范围。 |
| **代码与公共入口** | 代码：`src/common/shared/i18n/`。`locales.ts`：`Locale`、`SUPPORTED_LOCALES`（只读、冻结）、`DEFAULT_LOCALE`、`isLocale`、`resolveLocale`。`types.ts`：`MessageTemplate`、`MessageParams`、`Catalog`、`PluralCategory`、`CatalogOverrides`。`keys.ts`：`MessageKey`（由 zh-CN 目录推导）。`messages/zh-CN.ts`：`zhCN`（`satisfies Catalog`）；`messages/en-US.ts`：`enUS`（`satisfies Record<MessageKey, MessageTemplate>`，缺/多 key 编译失败）。`translate.ts`：`translate`、`createTranslator`、`TranslateOptions`、`TranslateDiagnostic`。`format.ts`：`formatNumber`、`formatDateTime`、`selectPluralCategory`。`index.ts` 统一再导出以上公共 API。 |
| **属主与消费方** | **属主/维护者：项目管理**（`src/common/shared/` 唯一写入者；消息目录**唯一写入者**）。**消费方**：**桌面UI**（I4b：`app/renderer/src/i18n/index.ts` facade **只再导出**本模块，组件经 facade 消费；不得复制目录或 resolver）、**桌面窗口**（I4b/B3：主进程偏好、窗口标题、对话框标题、系统行在生成点调用 `translate`/`createTranslator`）。B1/B2/B3/B4 的 `ui.*`/`main.*`/`shared.runtimeSettings.*` key 由项目管理先写入目录，消费方再迁移。**CLI 本轮不纳入**（Q3 A）。均为只读导入，不得复制第二份。 |
| **契约与示例** | `Locale = "zh-CN" \| "en-US"`；`DEFAULT_LOCALE = "zh-CN"`；`resolveLocale(value: unknown)` **精确匹配**白名单，`en`/`zh`/大小写变体/前后空白/非字符串一律回退默认（`preferences.locale.invalid` 由调用方记录）。`translate(locale, key, params?, options?): string`；`createTranslator(locale, options?): (key, params?) => string`。回退顺序：当前 locale → `zh-CN` → key 本身；en-US 缺 key → zh-CN 文案 + `i18n.missing-key`（warning）；两目录都缺 → key + `i18n.missing-key`（error）；缺参数 → 保留 `{param}` + `i18n.missing-param`（warning，同一参数每次翻译只报一次）；多余参数忽略；不做 HTML 转义。复数模板必须含 `other`；用 `Intl.PluralRules(locale).select(count)` 选变体，所选变体缺失回退 `other`，缺 `other` → key + error，缺/非数字 `count` → 回退 `other` + `i18n.missing-param`。`TranslateOptions.catalogs` 仅供测试/嵌入整体替换目录，**生产调用方不应传入**。示例：<br>`import { createTranslator, resolveLocale } from "../../common/shared/i18n/index.ts";`<br>`const locale = resolveLocale(preference.locale); // 非法值 → "zh-CN"`<br>`const t = createTranslator(locale, { onDiagnostic: (d) => log.warn(d.code, d.locale, d.key, d.param) });`<br>`t("main.window.title"); // "ANS 桌面应用（受治理会话）" / "ANS Desktop (Governed Sessions)"`<br>**边界（不做）**：不读偏好文件、不更新 `document.documentElement.lang`、不生成 UI、不做 IPC；不翻译外部错误原文（作为参数原样保留）；不把系统行协议改成 key+params（历史不追溯）。 |
| **测试与变更影响** | 测试：`test/项目管理/shared/i18n.test.ts`（22 例）覆盖 locale 解析、目录 parity、B0 key、回退矩阵、插值/缺参数、复数 0/1/2/多与缺变体/缺 `other`、诊断注入、`Intl` 封装、源码纯度；`test/项目管理/shared/i18n-guard.test.ts`（6 例）+ `i18n-guard-scanner.ts` + `i18n-guard-allowlist.ts` 实现确定性硬编码守卫（B0：扫描 103 文件、allowlist 62、违规 0；合成负例证明新文件中文被拒绝；allowlist 逐批收紧）。2026-10-23 本机 Node v24.22.1：`node --test "test/项目管理/shared/**/*.test.ts"` **165 tests / 160 pass / 0 fail / 5 skipped**（5 项为既有 Windows 平台按设计跳过）；`npm run typecheck` 退出码 0。**变更影响**：B1–B4 每批由项目管理先补 key（`ui.*`/`main.*`/`shared.runtimeSettings.*`），桌面UI/桌面窗口迁移后从守卫 allowlist 移除对应文件；B4 `runtime-settings.ts` 的 label/help/choiceLabels key 化仍由项目管理唯一写入，桌面窗口只读解析。共享目录行为变更会使消费方既有证据失效，须按 T2 重测消费者。依据：[实施记录](../change/2026-10-23_change_i18n-b0.md)、[实现报告](../../api-spec.md)。 |

---

## 变更（本文件）

- 2026-10-27：组件 7 `diagnostics` 落盘白名单增列 **`mimeType`/`bytes`**（`view_image` 审计事实；运行时核心反馈二者此前被白名单丢弃，实际只落 path/ok/mode/reasonCode/turnId）。新增**字段级校验**：`mimeType` 仅接受标准 MIME token（拒绝 data URL/base64/带参数/控制字符），`bytes` 仅接受有限非负整数；图片内容（base64/`data:` URL）仍不入白名单。交付方式 `mode`（delivery）已在白名单，无需变更。测试 `test/项目管理/shared/diagnostics.test.ts` **9→10**（新增 view_image 字段落盘与泄漏防护例）；本组 210/205/0/5；`npm run typecheck` 0 错。未改运行时/适配器/桌面/门禁代码，未 commit。

- 2026-10-23：**组件 8 `runtime-settings` / 组件 3 `runtime-shared` 完成 i18n B4 key 化**（客户闸门 0/1/2 确认与实施授权；方案 §4.9/§7.1 B4、团队计划 §4.3/§5 I8）。`RuntimeSettingField` 的 `label/help/choiceLabels` → `labelKey/helpKey/choiceLabelKeys`（`MessageKey` 类型，编译期校验）；机器语义/字段集/顺序零变化（迁移前快照锁定）。`RUNTIME_LABELS.demo` `"演示"` → 语言中性 `"demo"`，新增 `RUNTIME_LABEL_KEYS`（demo → `shared.runtimeSettings.runtime.demo`，品牌名 `null`）。主进程 B4 解析职责与渲染层不变契约见 [实现报告](../../api-spec.md)。本组 181/176/0/5；`npm run typecheck` 19 处消费方旧字段错误待桌面窗口/测试角色 B4 接线消除（本批未改 `app/**`）。详见[变更记录](../change/2026-10-23_change_i18n-b4-metadata.md)。

- 2026-10-23：登记 **组件 9 `i18n`**（共享国际化消息目录与唯一翻译实现，B0 契约）。由项目管理按客户闸门 0/1/2 确认与实施授权建立：`src/common/shared/i18n/`（`locales.ts`/`types.ts`/`keys.ts`/`translate.ts`/`format.ts`/`messages/{zh-CN,en-US}.ts`/`index.ts`）；属主项目管理，消费方桌面UI/桌面窗口只读导入。B0 只冻结 API 与 13 个初始 key，渲染层/主进程接线（语言开关、偏好、IPC、窗口/对话框）在 I4b 由对应角色完成。新增 `test/项目管理/shared/i18n.test.ts`（22 例）、`i18n-guard.test.ts`（6 例）与守卫 allowlist（扫描 103 / allowlist 62）；本组 165/160/0/5，typecheck 0。详见[变更记录](../change/2026-10-23_change_i18n-b0.md)。


- 2026-10-16：组件 8 `runtime-settings` 增可选 **`choices?: readonly string[]`**（有、非空＝值域即选项、
  应以致选择控件呈现；缺省/空＝自由文本）＋三平台「推理强度」字段（`ANS_PI_REASONING_EFFORT`
  off/low/medium/high/xhigh；`ANS_CODEX_REASONING_EFFORT` low/medium/high/xhigh，**无 off**——平台无该档、
  如实不假装；`ANS_CLAUDE_REASONING_EFFORT` off/low/medium/high/xhigh；label 逐字「推理强度」、可选、
  非机密；help 三平台逐字统一）。G-5 Wave 1 PM 切片，客户 2026-10-16 批准；测试
  `test/项目管理/shared/runtime-settings.test.ts` **2→6**；本组 114/114、全量 2002/2001/0红/1skip、
  typecheck 0；消费方（三适配器接线/桌面窗口/桌面UI）为 wave 2，落地后须重测。依据
  [变更记录](../change/2026-10-16_change_reasoning-effort-metadata.md)。

- 2026-10-16：组件 7 `diagnostics` 落盘白名单增列 **`timeoutMs`**（元数据；`shell.exec.start` /
  `shell.exec.timeout` 观测**生效**命令级执行时限，kanban-live 修复批次 F-1-d，客户 2026-10-16 批准）。
  代码：`src/common/shared/diagnostics.ts` FIELD_NAMES（数值须有限，与既有 `durationMs` 同一路径）；
  白名单新增准入注释（仅元数据可入；命令原文/argv/prompt/源内容等正文依设计契约禁入）。
  **评估不纳入 `excerpt`**（F-7 `shell.guard.blocked` 的 `command.slice(0,240)` 命令摘要）：属设计契约
  明令禁入的「命令原文」类内容，模式化 `scrub` 净化保证不了任意命令内容安全；命中 token 已经 `reasonCode`
  落盘、`excerpt` 在 record 层原样传递（注入 logger/测试可断言），差异已回报 PM 裁定。
  测试：`test/项目管理/shared/diagnostics.test.ts` **9/9**（+1 白名单例）；本组 110/110；消费方
  diagnostics 测试 7/7 与 runtime-core shell 测试 12/12 重跑通过；`npm run typecheck` 0 错。
  未 git 提交。

- 2026-10-13：新增组件7 `diagnostics`，日志存储、净化、24小时清理只有共享实现。角色接线、独立组合验收及实际应用启动日志确认完成，详见统一方案的最终证据。

- 2026-10-11：登记 **组件 6 `atomic-write`**（跨角色共享原子写原语，Windows rename 瞬时 `EPERM` 的**单一来源**处置）。
  由本轮（pm）建：`src/common/shared/atomic-write.ts`，导出 `atomicWrite`/`renameReplacingExisting`/
  `retryOnTransient` + 常量 `RENAME_TRANSIENT_CODES`/`RENAME_MAX_ATTEMPTS` + 类型 `AtomicWriteOptions`。
  **来历**：**Pi适配器**先诊断并修复其 `fs-write.ts::atomicWriteFile` 的 rename 瞬时 `EPERM`（有界重试），
  **如实回报**本仓同源写法即 `src/common/shared/env-file.ts::atomicWriteText`（本轮全量中真捕获过一次同款红）；
  据「不得复制第二份实现」收敛为单一来源。**`env-file.ts` 已改导入**（`atomicWriteText` 实现体委托 `atomicWrite`，
  签名/行为不变）；**Pi适配器改导入为后续任务**（本任务只回报、未动其文件）。属主 pm，消费方 `env-file`/Pi适配器
  **只读导入**。测试：`test/项目管理/shared/atomic-write.test.ts`（13 例）+ `env-file.test.ts`（+1 例）；
  本组 95 pass/0 fail；全量 671 pass/0 fail；typecheck 零错。
  依据：工程法案 `docs/project-rules.md` §一.5；技能 `references/shared-directories.md`；`角色卡/Pi适配器/changelog.md`。

- 2026-10-11：登记 **组件 5 `env-file`**（`.env` 读写模块，设计 **§11**）。
  由 **T26** 建：`src/common/shared/env-file.ts`，导出 `parseEnvFile`/`mergeEnvText`/`atomicWriteText`/
  `readEnvFile`/`saveEnvFile`/`loadEnvFileInto`（= 设计 §11 的 `parse`/`merge`/`atomicWrite`/`loadEnvFileInto`）
  及 `PI_CONFIG_SECRET_KEYS`/`isSecretKey`。**正当形式**：`.env` 仍归**装配**（Section 1 不变），
  本模块是**指定写入者**（同 `docs/scheduling/` 模式），经 **Governance 记档 G-2**。**写入纪律**
  （设计 §11.4 客户红线）：**只改相关键**（逐行、逐字节保留其余）、**凭据不回显**（只记键名/路径）、
  **原子写**（同目录 temp+`rename`）、**失败显式**。属主 pm，消费方**桌面应用**（T28/T29）**只读导入**；
  `.env` 读写逻辑**全仓唯一**（此前无任何此实现，不存在第二份）。测试：
  `test/项目管理/shared/env-file.test.ts`（30 例）；本组 81 pass/0 fail；全量 522 pass/0 fail。
  依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §11；技能
  `references/shared-directories.md`；工程法案 `docs/project-rules.md` §一.5。

- 2026-10-11：登记 **组件 4 `argv-primitives`**（设计 §3.11 **行 7**，全仓**最后一处**跨角色镜像）。
  由 **T23** 建：`normalizeArgv` 由**编排** `src/common/编排/shell-gate.ts` 与**桌面**
  `app/desktop/operator-channel.ts` 两处**逐字相同**的私有副本**整体搬迁**（搬迁非 fork）。
  **风险**：审计记录内容（编排构造）与操作者所见（桌面展示）须同源，否则
  `docs/audit/shell-gate.jsonl` 的 argv ≠ 操作者看到的 argv。属主 pm，消费方编排/桌面**只读导入**；
  **T21/T22 完成前处「两处并存窗口」**（旧副本逐字相同、行为不分叉）。测试：
  `test/项目管理/shared/argv-primitives.test.ts`（12 例）；本组 51 pass/0 fail；全量 460 pass/0 fail。
  依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 行 7；
  技能 `references/shared-directories.md`；工程法案 `docs/project-rules.md` §一.5。

- 2026-10-11：登记 **组件 2 `path-primitives`（安全相关）** 与 **组件 3 `runtime-shared`**，
  由 **T23** 建（设计稿 §3.11 全仓盘点：§6 禁令逼出的跨角色镜像一并收敛）。`path-primitives` 由
  门禁引擎 `src/common/门禁引擎/paths.ts` 与 Pi适配器 `src/common/pi-adapter/fs-write.ts` 两处**逐字同源**
  的词法原语**整体搬迁**（搬迁非 fork）；`realResolve`(sync)/`realResolveAsync`(async) 两者**对同输入同答案**
  由测试钉死。`runtime-shared` 收 `RuntimeKind`/`PI_CREDENTIAL_ENV_VARS`/`resolveSkillRoot`。属主 pm，
  消费方 Pi适配器/门禁引擎/编排/装配/桌面**只读导入**。**T20/T21/T22/T24/T25 完成前处「两处并存窗口」**
  （旧副本逐字相同、行为不分叉）。测试：`test/项目管理/shared/path-primitives.test.ts`（21 例）、
  `test/项目管理/shared/runtime-shared.test.ts`（6 例）；全量 432 pass/0 fail。
  依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11；技能 `references/shared-directories.md`；
  工程法案 `docs/project-rules.md` §一.5。

- 2026-10-11：建立。登记本项目**首个**共享组件 `config-loader`（`src/common/shared/config-loader.ts`），
  由 T11 从装配私有 `src/common/装配/config-loader.ts` **整体搬迁**而来（搬迁非 fork，单一实现）；
  属主 pm，消费方装配 / 桌面应用。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md`
  §3.10；技能 `references/shared-directories.md`；工程法案 `docs/project-rules.md` §一.5。
