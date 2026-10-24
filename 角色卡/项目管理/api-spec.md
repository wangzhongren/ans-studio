# 项目管理共享组件实现报告

本角色只维护 `src/common/shared/`；业务实现由各属主交付。现行复用目录见 [共享组件目录](docs/architecture/shared-components.md)。

## D3 轻量修复：原子写普通权限位

依据已获客户实施确认的 [D3](docs/design/2026-10-21_design_permission-boundary-repairs.md)。`AtomicWriteOptions.finalMode?: number` 已实现：只接受 0–0777 整数，非法值在创建临时文件前抛错。POSIX 在临时文件写完后用句柄 chmod 准确应用权限，再 fsync、关闭并 rename；中止或 chmod/fsync 失败不提交。Windows 不调用该 POSIX 权限操作；缺省 finalMode 的其他消费者行为保持。

运行时核心负责对已有普通文件读取 `mode & 0777` 并选择传入；共享原语不自行读取目标权限、不做角色判断，不复制特殊位、owner、ACL 或 xattr。原 `mode` 仍决定临时文件创建权限并受 umask 影响，`finalMode` 是显式的提交前权限。

2026-10-21 本机 Node v24.14.0 / Darwin arm64：atomic-write 与 env-file 合计 **53/53**，其中新增 6 项覆盖非法输入零副作用、真实 mode、严格 umask 子进程、chmod/fsync 失败及 chmod 后中止；初次类型检查通过。实际核心接入、合并候选与 Windows 原生验证分别记录，不以共享单测代替。详见 [实施记录](docs/fix/2026-10-21_fix_d3-lightweight-permission-repairs.md)。

## ANS-RUNTIME-V2 revision 1

依据 [已批准的多运行时对接设计](docs/design/2026-10-14_design_multi-runtime-integration.md)。

- `runtime-shared.ts` 的 `RUNTIME_KINDS` 已扩为 `demo/pi/codex/claude`；`RuntimeKind` 从此数组派生，`DEFAULT_RUNTIME` 保持 `demo`。
- 新增 `RUNTIME_LABELS`，为每个 runtime 提供同一语言中性显示值；该表不推断 SDK 是否安装或认证是否可用。2026-10-23 i18n B4：`demo` 由 `"演示"` 改为语言中性值 `"demo"`，用户可见文案改走 `RUNTIME_LABEL_KEYS.demo = "shared.runtimeSettings.runtime.demo"`；Pi/Codex/Claude 品牌名不变（`RUNTIME_LABEL_KEYS` 为 `null`）。渲染层不得导入 `runtime-shared.ts`（顶层 `node:os`/`node:path`），应经 facade 用同一 key 取词。
- `runtime-settings.ts` 提供 `RUNTIME_SETTINGS`、`getRuntimeSettingsDefinition(runtime)`、`RuntimeSettingField` 与 `RuntimeSettingsDefinition`。每引擎的字段机器元数据 `key/required/secret/fallbackKeys?/choices?/control?/integer?` 是设置视图单一元数据，不含值或登录状态；**展示文案自 2026-10-23 i18n B4 起只以目录 key 表达**：`labelKey`（必填）、`helpKey?`、`choiceLabelKeys?`（与 `choices` 等长），类型为 `MessageKey`，由主进程按当前 locale 解析为 `label/help/choiceLabels` 后推给渲染层（渲染层契约不变）。`choices?`（2026-10-16 G-5 增，客户批准）：有、非空则该字段值域即选项、应以致选择控件呈现，缺省/空＝自由文本——描述设置、不描述控件实现。Pi 必填 token/baseURL/model；Codex key/model 必填，key 支持明确的 OPENAI_API_KEY fallback；Claude API key 必填、model/baseURL 可留空用 SDK 默认。`demo` 没有生产凭据面板。G-5 推理强度三字段（label key 解析为「推理强度」、可选、非机密）：pi `ANS_PI_REASONING_EFFORT`（off/low/medium/high/xhigh）、codex `ANS_CODEX_REASONING_EFFORT`（**无 off**——平台无该档，如实不假装）、claude `ANS_CLAUDE_REASONING_EFFORT`（off/low/medium/high/xhigh）；help key 三平台共享同一目录值（留空＝维持平台默认；档位梯 关/低/中/高/极高；思考计入输出 tokens）。2026-10-14，`runtime-settings.test.ts` 2/2：所有秘密键/alias 被同一掩码名单覆盖，required/default 与属主实际选项一致；2026-10-16（G-5）**6/6**（+4：三字段逐键/label 逐字/可选非机密；choices 值域[Codex 无 off 反向守卫]；help 逐字统一；choices 纪律）；本组 114/114、全量 2002/2001/0红/1skip（基线 1998/1997/0/1）、typecheck 0。详见 [变更记录](docs/change/2026-10-16_change_reasoning-effort-metadata.md)。
- 原 `PI_CREDENTIAL_ENV_VARS` 与 `resolveSkillRoot` 行为不变。新增 `RUNTIME_CREDENTIAL_ENV_VARS` 为 Pi 旧名单加 `CODEX_API_KEY`（Codex 属主官方文档及 `@openai/codex-sdk@0.162.1` 实际 types 证据）、`CODEX_ACCESS_TOKEN`（[Codex 官方环境变量](https://developers.openai.com/codex/environment-variables) 的 CLI/app-server automation 秘密）和 `CLAUDE_CODE_OAUTH_TOKEN`（[Claude 官方 authentication](https://code.claude.com/docs/en/authentication) 的既有环境秘密）；公共 shell 剥离使用新名单。额外 token 只作为秘密保护目录，不表示产品支持账户登录或新增 API-key fallback；Claude 产品接入使用 API key，依据 [Agent SDK 官方 overview](https://code.claude.com/docs/en/agent-sdk/overview)。
- `env-file.ts::RUNTIME_CONFIG_SECRET_KEYS` 只读引用所有 runtime 秘密键，`isSecretKey` 改用该集合，所有 API key 都掩码；旧 `PI_CONFIG_SECRET_KEYS` 继续保留原 API。2026-10-14，Node `v24.14.0`，`node --test test/项目管理/shared/env-file.test.ts` 31 pass / 0 fail，使用临时假 env，真实 `.env` 没有触碰。
- 停止契约必要迁移：`AtomicWriteOptions.signal?: AbortSignal` 与 `renameReplacingExisting(from,to,signal?)` 在 temp open/write/fsync 与每次 rename 前检查中止，失败清理 temp，旧调用兼容。2026-10-14，`node --test test/项目管理/shared/atomic-write.test.ts` 16 pass / 0 fail，覆盖 fsync 完成时实际 signal 中止后旧目标保留及 temp 清理；操作系统已完成的 rename 不声称可回滚。核心调用者需转发 signal 后重新验证。
- 2026-10-14，Node `v24.14.0` 跑 `node --test test/项目管理/shared/runtime-shared.test.ts`：5 pass / 1 fail。失败准确定位为编排 `src/common/编排/args.ts` 仍维护 `demo/pi` 第二枚举；已交编排 O1 迁移。此共享候选尚未通过消费方验收，不写已完成。

O1 迁移后共享全目录首次回归109项中108通过，runtime枚举一致性已通过；唯一旧失败为Mac临时根 `/var` 的词法测试预期未解析 `/private/var`。本角色用独立OS realpath修正自己的精确测试预期，target21/21通过，详见[原修复与验证](docs/fix/2026-10-14_fix_realpath-fixture-canonical-root.md)。生产路径模块没有变化；最终全目录/全仓组合仍待独立验证。

2026-10-14 当前共享全目录再次执行 `node --test 'test/项目管理/shared/**/*.test.ts'`，**109/109，0失败/0跳过**。包括新 runtime 枚举/设置秘密目录、原子写停止与全部旧共享行为；Pi/O1真实消费迁移后的现有等价性检查通过。全项目与桌面最终候选仍需独立 T1 验证。

实际源码主属和权限不由本报告扩张。最终验证将使用合并候选重新记录。

## i18n B0 公共契约（2026-10-23，`implemented-unverified`）

依据客户闸门 0/1/2 确认与实施授权（`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`）、i18n 方案 v1（`docs/planning/2026-10-23_design_i18n.md` §4–§6、§9.1 B0）与团队计划（`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3、§5 I4a）。**本批只冻结共享 API 与消息目录**；渲染层 facade/store、主进程 preferences/IPC/preload、窗口/对话框接线由桌面UI/桌面窗口在 B0 后段（I4b）完成。状态 `implemented-unverified`：实现完成、已跑本角色单测与 typecheck，**未验收、无真实 Electron**。

### 代码与公共出口

代码：`src/common/shared/i18n/`（唯一的消息目录与翻译实现）。`index.ts` 导出：

- locale：`Locale`（`"zh-CN" | "en-US"`）、`SUPPORTED_LOCALES`（只读、运行时冻结）、`DEFAULT_LOCALE`（`"zh-CN"`）、`isLocale`、`resolveLocale`。
- 目录类型：`MessageKey`（由 `messages/zh-CN.ts` 推导）、`MessageParams`（`Record<string, string | number>`）、`MessageTemplate`（字符串或 `Partial<Record<Intl.LDMLPluralRule, string>>`）、`Catalog`、`PluralCategory`、`CatalogOverrides`。
- 翻译：`translate(locale, key, params?, options?)`、`createTranslator(locale, options?)`、`TranslateOptions`、`TranslateDiagnostic`、`TranslateDiagnosticCode`。
- 格式化：`formatNumber`、`formatDateTime`、`selectPluralCategory`（`Intl` 薄封装）。
- 目录：`zhCN`、`enUS`（供守卫/测试与只读检查；消费方正常经 `translate`）。

### 语义（验收 P4/P7）

- `resolveLocale(value: unknown)`：只接受 `SUPPORTED_LOCALES` 的**精确值**；`en`、`zh`、大小写变体、前后空白、`undefined`、非字符串一律回退 `zh-CN`。本函数不产生诊断；偏好来源的 `preferences.locale.invalid` 由主进程记录。
- 回退：当前 locale → `zh-CN` → key 本身。en-US 缺 key 且 zh-CN 有 → zh-CN 文案 + `i18n.missing-key`（warning）；两目录都缺 → 返回 key + `i18n.missing-key`（error）；zh-CN 缺 key 时不回退 en-US。
- 插值：`{param}`，参数名 `[A-Za-z][A-Za-z0-9_]*`；缺参数保留占位符 + `i18n.missing-param`（warning；同一参数每次翻译只报一次）；多余参数忽略；不做 HTML 转义/注入。
- 复数：模板对象必须含 `other`；用 `Intl.PluralRules(locale).select(count)`；zh-CN 恒 `other`；所选变体缺失回退 `other`（无诊断）；缺 `other` → key + `i18n.missing-key`（error）；`count` 缺失或非数字 → 回退 `other` + `i18n.missing-param`（warning）。
- 诊断回调：`TranslateOptions.onDiagnostic`，异常被吞掉（观测不得中断翻译）。`TranslateOptions.catalogs` 仅供测试/嵌入整体替换目录，生产调用方不应传入。
- 目录契约：zh-CN 是 key 全集参考（`satisfies Catalog`）；`en-US satisfies Record<MessageKey, MessageTemplate>`，缺/多 key 由 TypeScript 拒绝（测试含 `@ts-expect-error` 负例）。
- 纯模块：只使用 ECMAScript/`Intl`，不 import `node:*`/`fs`/`path`/`electron`，不访问 DOM；由 `test/项目管理/shared/i18n.test.ts` 源码扫描守卫钉住。

### B0 初始 key（13 个，准确名称供桌面UI/桌面窗口消费）

`ui.settings.language.title`、`ui.settings.language.description`、`ui.settings.language.zhCN`、`ui.settings.language.enUS`、`ui.settings.language.saveFailed`、`main.window.title`、`main.dialog.importProject.title`、`main.dialog.pickImage.title`、`main.error.startup.title`、`main.error.startup.detail`、`preferences.error.invalidLocale`、`preferences.error.saveFailed`、`preferences.error.readInvalid`。

主进程 `main.*` 中文值与现有界面原文逐字一致（窗口标题/导入项目/选择图片/启动失败）；预览层 `ui.settings.language.*` 与偏好错误 `preferences.error.*` 是本批新增文案。

### 验证与边界

- 2026-10-23，Node v24.22.1：`node --test "test/项目管理/shared/**/*.test.ts"` → **165 tests / 160 pass / 0 fail / 5 skipped**（5 项为既有 Windows 平台按设计跳过）；`npm run typecheck` → exit 0。
- 硬编码守卫 `i18n-guard.test.ts`：扫描 103 个目标文件，allowlist 62 个（B0 基线），违规 0；合成负例（临时目录新文件含中文字符串/模板/JSX 文本）被拒绝，注释中文放行。
- 未做：B1–B4 文案迁移、渲染层/主进程接线、真实 Electron、布局/切换/重启验证；allowlist 当前较宽，后续逐批收紧。详见 [B0 变更记录](docs/change/2026-10-23_change_i18n-b0.md) 与 [共享组件登记](docs/architecture/shared-components.md)。

## i18n B1–B4 共享 key 契约（2026-10-23，`implemented-unverified`）

依据客户闸门 2/实施授权、i18n 方案 v1 §4.3/§4.9/§4.11/§5.4/§7.1 B1–B4、团队计划 §4.3/§5 I5–I8。**本批只建立 key 契约，不迁移消费方**；`app/**` 零改动，allowlist 仍 62 个文件。

### 目录与数量

- `messages/zh-CN.ts` 是 key 全集参考；`messages/en-US.ts` 逐 key 齐全（`Record<MessageKey, MessageTemplate>` 编译期强制）。`MessageKey` 由 zh-CN 自动推导，`keys.ts` 未改。
- 目录总 key **1203**（含 B0 13）。新增 **1190**：**B1 407**（`ui.*` 外壳）、**B2 269**（`ui.*` 聊天/面板）、**B3 452**（`main.*` 主进程用户可见文本）、**B4/shared 62**（`shared.runtimeSettings.*` + `shared.common.*`）。
- key 规范：`<area>.<component>.<purpose>`；ASCII、点分隔、允许 camelCase/数字/连字符；禁止中文/空格/运行时拼接。同一文案只保留一个 key（跨层短词在 `shared.common.*`）。
- 插值 `{param}`；计数文案用复数模板（en `one/other`，zh `other`/字符串）；zh/en 占位符逐 key 一致（测试）。

### B4 元数据 key 化（2026-10-23 B4 已实施共享形状；`implemented-unverified`）

- 目录 key（共 **34** 个 `shared.runtimeSettings.*`，另复用 28 个 `shared.common.*` 跨层短词）：`shared.runtimeSettings.pi.token.label`、`field.apiBaseUrl.label`、`field.apiKey.label`、`field.model.label`、`pi.contextWindow.*`（label/help/7 档标签）、`pi.promptTimeout.*`（label/help/7 档标签）、`reasoning.*`（label/help/5 档标签）、`codex.apiKey.help`、`codex.apiBaseUrl.help`、`claude.model.help`、`claude.apiBaseUrl.help`、`runtime.demo`。
- **共享形状（本批，2026-10-23）**：`RuntimeSettingField` 的 `label`/`help`/`choiceLabels` 改为 `labelKey`（必填）/`helpKey?`/`choiceLabelKeys?`，类型 `MessageKey`（编译期校验目录存在、拼写错误失败）；机器语义 `key/required/secret/fallbackKeys?/choices?/control?/integer?`、字段集与顺序、各引擎必填/choices/secret/fallback **零变化**（测试以迁移前快照逐项锁定）。`RuntimeSettingsDefinition.label` 仍是品牌名（Pi/Codex/Claude），不翻译。
- **`runtime-shared.ts`**：`RUNTIME_LABELS.demo` 由 `"演示"` 改为语言中性值 `"demo"`；新增 `RUNTIME_LABEL_KEYS: Record<RuntimeKind, MessageKey | null>`（demo → `shared.runtimeSettings.runtime.demo`；三个品牌名为 `null`）。导出兼容：`RUNTIME_LABELS` 键集/形状不变；显示方对 demo 改读 `RUNTIME_LABEL_KEYS` + `translate`。渲染层不得导入 `runtime-shared.ts`。
- **主进程解析职责（B4 桌面窗口接线）**：构造设置视图时用当前 locale 的 `translate`/`mainT` 把 `labelKey/helpKey/choiceLabelKeys` 解析为 `label/help/choiceLabels`，再经既有 IPC 推给渲染层；**渲染层视图契约不变**。在接线完成前，桌面消费方打开旧字段会产生编译错误（见下），属预期迁移窗口。
- **验证（2026-10-23 本机 Node v24.22.1）**：`node --test "test/项目管理/shared/**/*.test.ts"` **181 tests / 176 pass / 0 fail / 5 skipped**（基线 177/172/0/5；+4 项 B4 断言）；`npm run typecheck` 基线 0 → 候选 **19 处消费方错误**：`app/desktop/runtime-config.ts` 5、`test/桌面应用/multi-runtime.test.ts` 2、`test/测试/g5-reasoning-verify/f-settings.test.ts` 7、`test/测试/t29-pi-config-roundtrip.test.ts` 2、`test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` 3；全部为旧字段名（`label/help/choiceLabels`）引用，待桌面窗口 B4 解析接线与测试角色迁移后消除。本批未改 `app/**`，未验收。

### 非目标

- 完全非目标：`test-driver.ts`、`packaged-smoke.ts`、`src/index.ts`、`src/interface/cli/*`（CLI 本轮不翻译）。
- B3 保持原样：发给 agent 的任务文案/提示词、模型/工具输出、外部错误原文（作为 `{detail}`）、诊断/日志码、机器标识、legacy 历史解析正则、角色卡/团队计划 schema 词汇。详见 [分类证据](docs/change/2026-10-23_change_i18n-b1-b4-keys-evidence/non-target-and-classification.md)。

### 验证与边界

- 2026-10-23，Node v24.22.1：`node --test "test/项目管理/shared/**/*.test.ts"` → **171 tests / 166 pass / 0 fail / 5 skipped**；`npm run typecheck` → exit 0；`npm run typecheck:renderer`（补充）→ exit 0；守卫 `scanned=107 allowlisted=62 violations=0`（107 含 B0 后段 4 个非中文接线文件）。
- zh 逐字映射：837 exact / 337 composed-all / 4 composed-partial / 12 no-literal-trace（均为源码多段拼接，见证据）。
- 未做：消费方迁移、allowlist 收紧、B4 形状、布局/切换/重启/真实 Electron、独立验收；不声称完整 i18n 验收。详见 [B1–B4 变更记录](docs/change/2026-10-23_change_i18n-b1-b4-keys.md)。

