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

## i18n A2：下载申请 key 契约（2026-11-04，`implemented-unverified`）

依据 A2 Revision 2 提案（461 行 / `fe474a934520e117f41b08192f9701462efe253dbda0b76b18bc31884b80065f`）、P1 最终复审（611 行 / `98373dfada8b46759a96ff95096cd00523808de305e2ec7832d89e901adb734d`，`recommend approval`）与闸门 2 写集增补/V1 确认（32 行 / `000022cd6b18d9d6e084ff3e6d792f246ce70c5a8e577c1a67bfa85055270310`）。**最终合并基线**：HEAD `f0adb49058dd126b2b249cfa703993f65092f99b`（`3c88fae` A1/A2/B1 candidates + merge `origin/main` `f4c24ea`；PR #59 运行期文本去 su 中性化，不改变本 key 契约）。本批只加共享消息目录与 `test/项目管理/shared/i18n.test.ts` 契约；未改消费方、未改共享组件/allowlist/`jsonl-ledger`。

- **37 key** = `main.*` 35（`main.download.card.*` 13、`main.download.notice.*` 5、`main.download.error.*` 17）+ `ui.*` 2（`ui.directive.panel.consumer.download` / `downloadLegacyOff`）。
- 计数：`ui 1092 / main 626 / shared 62 / preferences 3 = 1783`。
- 契约要点：mechanical 仅 `scheme/publicHost/publicIps` 三项（`credentialsAbsent`/`filenameSafe` 留在 B1 facts/审计，不设 key）；`main.download.notice.completed` 无 `finalUrl`（final URL 仅在 agent-facing 工具回执）；`main.download.notice.gitignoreHint` 保留（G1 A）；不提供 `ui.directive.panel.consumer.downloadStartsNow`（G8 B 未选）；复用 `ui.judge.mode.approval`/`ui.judge.headline.autoApproved`/`ui.request.toCustomer`/`ui.request.toJudge`/`ui.directive.panel.until.*`。
- 测试：`node --test --test-concurrency=1 "test/项目管理/shared/**/*.test.ts"`（合并基线 f0adb49）→ **11 文件 / 176 tests / 171 pass / 0 fail / 5 skipped**（exit 0；B0 v3 176/171/0/5，+0 新增失败/skip）；聚焦 i18n+guard → **18/18/0/0**，`[i18n-guard] scanned=136 allowlisted=22 violations=0`。
- 静态门（合并基线 f0adb49）：`npm run typecheck` → **exit 0**；先前未合并基线时的 F6 `run-role.ts` 依赖已解除。
- 候选哈希（`git hash-object` / `sha256sum`，合并基线 f0adb49；PR #59 只改 zh/en 值、不改 key 契约）：`zh-CN.ts` `c64dfe1f…` / `2e341376…`（2231 行）；`en-US.ts` `6d55039d…` / `9e3803f7…`（2499 行）；`i18n.test.ts` `d9cbb3d5…` / `551ab060…`（832 行）。
- 状态 `implemented-unverified`：未验收、未 commit/push；详见 [A2 实施记录](docs/change/2026-11-04_download-requests-A2-implementation.md)。


## 2026-11-05 角色直接能力 C0-P1（待实现）

唯一实现合同：[C0-P1](docs/design/2026-11-05_design_direct-role-capabilities-contract.md)。本角色仅形成文档，未提供新运行时API；新类型/工具/Provider/IPC扩展均为拟议消费锚点，须由实际owner冻结签名后消费。已有 `SubmitVersionChangeFn` 与 decision judge IPC名保持。原子完整快照、run冻结读隔离、role-direct冻结校验及O→G私有I/O边为显式实现前置；来源不得伪造customer。本人未改shared/i18n或测试，详见[交接记录](docs/change/2026-11-05_change_direct-role-capabilities.md)。

P1单键适配已实施：`ui.freeze.reason.roleDirectApplied`（中：角色直接提交生效；英：Applied by direct role submission），U负责`role-direct-applied`映射。i18n 13/13；保旧键/parity/零Han/逐字断言。R/G实施后短核与首轮计数失败原日志见[本轮change](docs/change/2026-11-05_change_direct-role-capabilities.md)；G1建议通过，R收口枚举仅一项待原owner修正，未作行为/验收通过判断。

P2批量短核结论均recommend approval：R收口已对齐TaskClosedOutcome，P1唯一需修关闭；O prepare/readSnapshot/CAS与同Service后继O1、R五Fn/schema/tools严格可信注入、U reason映射及W权威revision消费同合同普通实现可复用。实际签名/范围/未知设计限制见C0 §5；尚无生产实现验证/验收结论。新实质接口/来源/层边界/权限差异才最小delta复核。

P3两项差异已recommend approval（C0 §6）：规划workflow可缺，ExecutionTrunkManifest/hasExecutionWorkflow只做结构前提；真实执行必须有workflow与D3/激活/授权闭包。冻结结构唯一消费R Model isValidDocFreezeRecord，O/G只导入/纯兼容出口，历史chief物证不依赖当前开关。R3 10/10为owner证据，40条caller类型缺口原owner续修；不以宽cast/过滤undefined代执行拒绝，无新增运行时API由本人实现。

P4九个中英词条已实现：`main.customerInput.chief.{deciding,contextUnavailable,noValidDecision,revisionRequested,modeChanged,manualTakeoverRequired}`与`ui.judge.{chiefDelegated,chiefDeciding,chiefTakeover}`。精确文案见同日change P4表；唯一勾选label复用decisionOff，旧judge keys语义保持。i18n首次13/13、总1915(ui1210/main640/shared62/preferences3)，W/U实际消费另交原owner，未代写接口/源。

P5单键`ui.composer.customerEntryChiefOnly`已实现，i18n13/13、renderer类型exit0；原客户入口文案由U消费。C0 §7仅拟定三内部合同：teamplan真实机器字段与owner/写集/DAG校验；ActiveRoleEvidence与真run Frozen绑定、doc/active独立快照CAS；R真实stopAndInspect生命周期普通事实。后两DTO/方法尚未实现，未知停稳blocked，不把abort请求或close manifest当停稳。字段/生命周期具体前置已交O/统筹，不新增P运行时API。

## P6 Git角色权限合同 G-C1（待原owner实现）

[唯一短合同](docs/design/2026-11-05_design_git-role-permissions-contract.md)给R现runtime/trunk的GitQueryFn/GitCandidateFn/GitPublishFn与普通OID/结果锚点；host真实actor/task/run/revision只由注入闭包取得，工具拒自报。O Git adapter保既有compareAndSwapManifest五参/readManifestAt二参语义，单ref old/new OID为发布提交点，旧fs/newGit journal分别对账。G纯策略、O Provider/Service/Pipeline、W可信Interface边与G-T1一致，普通同对象细化复用审结；隔离/撤权临界区缺实证修改blocked，nativeLifecycle不充沙箱。本人未提供运行时API，未执行Git/模型/测试，详见[change](docs/change/2026-11-05_change_git-role-permissions-integration.md)。

## P7 当前R9 I/O收敛最短消费合同（2026-11-06；未实施）

1. 固定P仅定点只读；本次与O14 worker登记首因无关，不改G-C1正文，不运行测试/模型/应用/Git/OShelper，无启动PID，不写账户信息。
2. **已有O Provider**：`src/provider/version-change/public/version-change-store.ts`已导`readVersionBaselineState(root):Promise<{text:string|null;initialized:boolean}>`、`writeVersionBaselineState(root,{text,expectedSha256:string|null,initialize?,lockToken}):Promise<{ok:true}|{ok:false;reason:string}>`，实现均`impl/guard-freeze-registry.ts:27,35`。
3. 同公开口已有`acquireVersionLock(root)`/`ownsVersionLock(root,token)`/`releaseVersionLock(root,token)`、`scanVersionedDocuments`与freeze append/refresh；不再由G重造锁/FS权威。baseline原字节SHA由实际text按原UTF8字节计算，缺失为null；未知marker/坏行不静默初始化。
4. **已有字节口**：`src/provider/trunk/public/trunk-store.ts`的Store实例可选`readProjectFile(rel,{maxBytes?}):Promise<StoreRead<{bytesBase64:string;sha256:string}>>`，缺能力拒绝，missing与io/corrupt分开；真实file bytes不从模型输入取得。
5. **G原Service拟新增（未存在）**：`src/service/boundary/resolve-boundary.ts`公开`registerVersionedDocument(input:{projectRoot,relPath,recordedBy?}):Promise<boolean|undefined>`、`verifyVersionedDocuments({projectRoot}):Promise<VersionBaselineViolation[]>`、`readVersionBaselineSha({projectRoot,relPath}):Promise<BaselineShaResult>`；沿原返回含义，不新业务状态。
6. 上述G Service直接消费O Provider public；锁内read baseline→G私有纯parse/版本/冻结判定＋授权后实际文件bytes→得到nextText/violations→O write(expectedSHA,lockToken)→refresh普通snapshot→G纯install，finally释放同锁。Provider不回调G；Service不互调peer。
7. **G common拟纯化**：`src/common/门禁引擎/versioned-doc-guard.ts`原registerVersionedDocAfterWrite/verifyVersionedDocBaselines/baselineShaFor改为接普通`{baselineText,initialized,files:[{path,bytesBase64,sha256}],recordedBy?,at}`返回`{nextText?,initialize?,violations,registered?,baselineSha?}`的内部纯计算；不能保同签名包装Provider或另开FS扫描。
8. 现TOFU初始化需完整真实有权文件清单；复用O scanVersionedDocuments＋readProjectFile，不拿空数组冒完整扫描。缺/坏/预算不足/未知文件形态明确失败；冻结run路径继续已有snapshot解析，不重新导向live。
9. **O/W调用顺序**：O `run-role.ts`/原Pipeline先调用G Service新口；W `app/desktop/session.ts`3693/8430经O原Pipeline有界wrapper再G Service，W不得直调Service/Provider。O `common/编排/shell-post-audit.ts`416只接上层取得的baseline/violations普通数据，不调用G私有I/O或从common调用运行层。
10. O `common/编排/run-manifest.ts`440/645/667移出私导G append/refresh的I/O到其原Pipeline：Pipeline→G Service业务/安装或O Service业务→O Provider；common只接真实结果，Provider物理append已存在但不得从common偷调。
11. **permit现缺口**：O `fs-version-change-store.ts:18,380`默认installStableWritePermitSnapshot向上调G；Service `stable-write-service.ts:121`经permits.installSnapshot真实触发。删Provider默认G import/upcall，不能以注入回调藏同一向上调用。
12. 最小替代：原O Service公开`readStableWritePermitSnapshot():Promise<readonly StableWritePermit[]>`（拟新增，只调用现`permits.list()`）；原O Pipeline在许可创建/消费/恢复后取普通数组，再调G原Service公开纯安装wrapper，内部复用现`installStableWritePermitSnapshot`。刷新失败安装unknown/fail-closed，不谎报许可撤销或允许旧缓存。
13. `StableWritePermitStore.installSnapshot`原abstract/public类型需O原owner同步去消费者或保纯数据兼容，不再让Provider执行G callback；旧测试替身可类型迁移，不能以noop证明实际缓存已更新。
14. **同步WriteGate现口**：R `WriteGateContext`当前仅phase/edit-read、contentSha256、operation；R tools有WeakMap对象＋精确target的`isFileEditReadProbe`身份，`rejectFileHostArguments`拒模型context，`finalFileProtection`实际canonical/roots/nlink检查；这些可复用但当前尚无canonical/currentFile事实字段。
15. R原Model/runtime拟扩host-only `fileFacts:{operationId,targetPath,operation,canonical:{projectRoot,skillRoot,target,protectedRoots:readonly string[]},currentFile:{state:"missing"}|{state:"present";sha256:string}|{state:"unknown";reason:string}}`；Core发行冻结对象并在原Service公开同target/operation验证身份，模型JSON不能自报或仅靠phase冒充。
16. 两阶段：G先纯词法/角色/任务/path读探针许可→R Provider仅对已允许目标取canonical及missing/hash→同operation/path绑定context再调最终同步gate。首次无facts只准此受信读取阶段，不能放行最终写；未授权不得先read求hash。unknown/io不当missing。
17. G `src/service/gate/resolve-write.ts`消费已验身份canonical普通facts替realResolve/reloadBoundaryEntriesSync；边界快照由原上层合法refresh/解析准备，G common/Model不读FS。仅hash无对象身份不可信；新事实必需时缺facts拒绝，不回退live。
18. G `stableWriteDecision`拟加`currentFile`普通参数并移除readFileSync，保持permit/baseSha与最终contentSha判定；O run-role1115透传真实Core facts，edit-read探针只授读取不绕许可。R原tools写前最终canonical/nlink及字节复核保留，TOCTOU/事实变化拒绝，不能用旧facts替最后防护。
19. G guard/resolve-write对O `common/编排/mechanical-rejection.ts`的私有纯helper导入应移除：G在自己Service边界构造已有共享拒绝形状/原有message，或复用真正现存Model纯形状；不新造跨ownercommon出口/新服务，具体字段原G核同型。
20. **依赖顺序**：O确认现Provider端口/锁CAS→G拆纯计算＋Service业务入口→O Pipeline与W重接R9/permit→R真实绑定fileFacts/探针→G同步gate消费＋O prewrite→各原owner定向负例；单文件单writer。未知R16事实是否可安全复用由R核最小真实接缝，没证据时相关写blocked。
21. **写集差额**：G versioned-doc-guard.ts/其既有test与O guard-freeze-registry.ts已有dispatch§49/204；其余上述resolve-boundary/gate、O Pipeline/runmanifest/stableService/Provider abstract/public/fs-store、R runtime/tools/session、W session按旧T1/G-T1精确表逐项复核再派，不从§1目录自动扩权。
22. 真正需另列的潜在差额是`src/common/shared/path-primitives.ts`（P owner，当前realResolve实FS）；本节点不改它，优先G停止在同步纯gate调用realResolve，保未触及legacy共享消费者原行为；若要删其FS必须另给P源/测试精确派单，不借这三条R9授权泛改shared。
23. 本合同给拟新增签名而非宣称已支持；已有合法0链（G公开refresh→O Provider→纯install、Active/Frozen选Store→纯parse、checkGitPolicy纯）复用，不扩全仓治理/SDK调查。真实不确定仅为R host facts准备/验证接缝及个别表外caller精确写集，由统筹按owner交接。

## P8 host写前阶段合同（2026-11-06；仅实现层精确化，尚未接通）

1. 范围仅P7 host facts阶段，不变更G-C1/P3.1业务权限；G13三baseline Service口已存在，本合同不把旧caller/permit/gate I/O误记迁移完成。
2. host-only三阶段`lexical-read`→`canonical-read`→`final-write`；工具模型schema仍只path/content/编辑参数，禁止context/phase/operationId/roots/currentFile等host字段。阶段不是批准票。
3. R原`src/model/runtime.ts`拟`FileGateStage`及普通`FileGateFacts`；`WriteGateContext`保原字段，加`stage?/fileFacts?`可选承载；普通DTO不含I/O/回调/权威布尔safe。
4. 最小facts共用`{invocationId,operationId,targetPath,operation}`；canonical阶段另有`canonical:{projectRoot,skillRoot,target,protectedRoots,protectedRootsState:"complete"|"unknown"}`；final另有`currentFile:{state:"missing"}|{state:"present",sha256}|{state:"unknown",reason}`及真实最终`contentSha256`。
5. R原`provider/runtime/tools.ts`为每次真实write/edit生成内部invocation/operation，冻结各阶段ctx与深层普通facts，私有WeakMap绑定对象→本工具调用/target/op/stage及仍在途状态；JSON同形、旧ctx重放、另路径/操作/阶段、已结束invocation一律无效。
6. R原`service/runtime/session.ts`拟公开`inspectRuntimeFileGateContext(context:unknown,target:string,operation:WriteGateOperation,stage:FileGateStage):FileGateFacts|undefined`；实际调用原Provider发行者验证，只返普通事实，不把WeakMap/Provider能力交G；沿现isRuntimeEditReadProbe模式扩，不只验phase字符串。
7. O原`run-role.ts`的真实gate闭包先调用R该Service公开验证，再将结果作为普通输入给G Service；Pipeline→R Service及Pipeline→G Service分别合法，禁止G Service→R Service或Interface直调Service。opaque/shell/custom callback不能通过同形context伪造验证。
8. 双root已有真实来源：O`createRuntimeAdapterFactory(project,...)`明确向`createRuntimeAdapter`传`projectRoot:project.projectRoot,skillRoot:project.skillRoot`；R原Service把这两实际host配置显式映射typed Provider opts。不得以writeRoot/readRoot冒充双root，模型不给根；未知保护根不是空数组，必须state unknown拒绝相关阶段。
9. **第一阶段**：R调用G拟`resolveWriteReadPreflight(target,boundary,scope,{stage:"lexical-read",projectRoot,skillRoot,...})`，只用已接受角色边界/任务写集、条件及纯词法root/path/敏感路径规则，禁止realResolve/reloadBoundary/readFile。缺实际已接受边界即拒绝，不为得到hash越权读。
10. 第一阶段allowed只授Provider取得同target canonical元数据（realpath/最深存在祖先/链接/host roots），不授读取目标内容、更不授写入；write与edit均走这一步。generic secret路径不能借此读内容，`read_file`无gate不充授权口。
11. R复用原`canonicalProtectionPath`仅ENOENT回溯与现Provider FS检查生成canonical事实；失败unknown，其他IO错误不当missing；不经Model/common/shared获取效应，不把`finalFileProtection`的ok/reason冒完整facts。
12. **第二阶段**：R发行canonical-read ctx，O先按第6条验身份，G同一`resolveWriteReadPreflight(...stage:"canonical-read",canonicalFacts)`对真实root/target/protectedroots执行纯包含/别名/链接逃逸规则，且再核同角色/task/path读取范围。G只消费普通canonical，不再自己FS。
13. 第二阶段allowed仅授本invocation同target目标bytes读取；R经原guardWriteTarget及secret/链接/nlink规则后读精确旧Buffer求SHA。edit保BOM、原字符串替换与旧Buffer语义；write为核base也只有授权后可读。明确ENOENT为missing；权限/IO/坏形态为unknown，决策拒绝。
14. **最终阶段**：R冻结final-write ctx，绑定上述currentFile/最新canonical与真实最终contentSha256（edit来自实际合成BOM字节）；O验发行身份再调G原`resolveWrite`＋`stableWriteDecision({...currentFile,...})`同步纯判定。
15. final G必核boundary/task/role/path、canonical归属、protectedroots及permit/baseSHA/目标contentSHA；unknown/missing不匹配/事实阶段或target/op不一致拒绝。允许结果才是本次最终写门通过；preflight allowed不能跳转为最终写。
16. G原`src/service/gate/resolve-write.ts`拟公开`resolveWriteReadPreflight`，原resolveWrite的ctx扩`canonicalFacts`普通字段；原G`versioned-doc-guard.ts::stableWriteDecision`扩`currentFile`，移除同步readFileSync。新字段只从O已验host facts传入，不接受模型自报。
17. `reloadBoundaryEntriesSync`由上层现有合法refresh/解析链事先准备普通边界快照；managed同步gate不回读live。Frozen run坚持同pin snapshot，无新live权限混入；本阶段不改Active/Frozen语义。
18. R原`writeGuarded`最终仍执行原parent/roots/canonical/nlink/secret/精确字节与atomicWrite/rename检查；与已发行facts变化即拒绝或回完整阶段重取，不在末尾静默重解释。阶段协议不替代Provider最后FS保护，不宣跨检查/rename已成OS原子授权。
19. 私有ctx生命期在工具finally关闭，phase绑定调用在途、精确path/op；write有独立读取探针，旧edit WeakMap ctx→target不足以证明新write读权，应按第5条扩。Provider读取可异步，G WriteGate最终保持同步；禁止在同步gate塞Promise或缓存任意live查询。
20. 兼容仅既有非受管单参数gate保旧判定＋Provider防护；managed/要求facts的G路径缺facts、未知根、伪context、legacy readprobe或custom gate不证明host身份一律拒绝，不能回落G sharedFS/猜missing或把旧单参allow当新阶段授权。
21. 原schema须继续拒全部host字段；Provider发行校验函数只供可信Pipeline调用，模型不能直接取ctx。G无peer调用、Model/common零I/O；不新增通用FS服务/ports factory/新根/权限。
22. **原owner源落点**：R runtime.ts/tools.ts/schema.ts/service/runtime/session.ts；G resolve-write.ts/resolve-boundary.ts/versioned-doc-guard.ts（纯DTO确需共用仅原已授boundary/role Model）；O run-role.ts/trunk-runtime.ts与既有Provider public准备普通数据，W只沿Pipeline，不在本节点额外改源。
23. **必要原测试owner**：R既有writegate/submit-capability-tools与已授测试逐文件由统筹列明，15D3仅原R writegate；fileSafety保持只读。G既有versioned-doc-guard.test及原resolve-write精确套件；O既有run-role门禁消费；新测试文件/表外路径不得从§1推授权，先精确派单。
24. 最小负例为未授权零content-read、fake/跨path/op/stage/replay ctx零写、unknown roots/currentIO不当missing、canonical逃逸、permit base漂移、edit BOM/最终SHA及legacy managed拒绝；本P不运行测试，不声称负例已通过。
25. 具体剩余不确定仅R真实host绑定/调用生命期与G纯readpreflight实现尚缺；这两原owner实施后回签名/物证，未接通的managed写blocked。若实需表外源/新权限，报告精确delta，不扩SDK或OShelper调查。

## I5 P1.1消费同步（2026-11-06；仅文档）
- 已定点核R runtime/API与O abstract/Pipeline/API：新hub五builtin均Chief真实creator，Convener只impl；旧creator历史保留。P1.1 supersedes旧Convener quality parent，精确上位hash与H01–H10映射见G-C1 §7。
- `reviewControllerRef`独立关联convener-controller与reviewBasisRef；`resumeController`严格taskId/flowId/runId/reviewTaskId/reviewCloseOperationId，仅期望、非host票；sourceTaskId不改义，schema禁hub/parent等host自报。
- O prepareControllerResume当前Chief信封→原五字段＋convener/resumeKey/basisDigest；inspectQueuedControllerResume以同五字段/key/basis核本进程真实受理与当前live/pin/CID/criteria/Chiefaccepted/字节/授权，不要求Chief回合常驻。重启无登记拒绝；fresh prepare不是stopfacts。
- 续接原运营任务不建新任务、lease不跨drain；普通close不通用广播，effectnotify及activation publicationTask真实R9关联保留；报告/close不授effect权。仅文档同步，不判断Q54完整NEW或四链通过。

revert后继最小接缝已在G-C1 §8：R原trunk Model仅普通revertBasis(target真实commit bytes/fulltree、明确root或所选真实parent bytes/fulltree、当前codeBasis/fulltree、inverseChanges/conflicts)；O原Provider真实读取/执行、Service核当前授权/base、G原公开纯策略校全部逆差异/保留项/父关系。冲突原owner修、新CID经I5 Chief quality/accepted/显式续接再原ref CAS，不共享index/force/reset/clean或Model receipt授权。G21/no-index及O revert stub尚未支持，不称通过；无新源/角色/权限。

P9采纳G22本人API/memo对§8的两项needs-revision，已仅修G-C1：codeBasis补commitBytesBase64:string与target/selectedParent三套真实原字节/OID/tree同样绑定；原Model/trunk.ts须由R立唯一共享GitRawObjectPlan/RawTree纯shape，当前G与O Provider自有镜像由各owner消费替换，未声称Model已存在。观察entries完整mode/path/fullOID含120000/160000用于识别及拒不支持/未授权结果；candidate input仍bytes/executable/null/常规权限，不扩特殊写。complete/conflicts不授权，模型不接proof，无源测修改或执行。

## P10 Q67 READY CHANGE末段有界走查（2026-11-06；只读）
- 对象READY `62ABA10EA8A710044C840ECD806157BC9A76758D5153C151DAD13E6CD41A9EBD`；实读driver SHA `3F2820752F2BFF285FB190716F9D320EC917D7EA21B81667475D1E26157CC9FB`、e2e `82694D26BDED3C95B4F00C0666470C4BEF80F75D1497FDAD3628778A7BDB0F6E`，不重算/冒充全候选source聚合。
- **no-blocker（本次窄契约范围）**：e2e 1994–2008补计划请求及回执与R schema.ts complete_team_plan/activate/select字段一致；tools strict未知字段拒绝无本轮payload差异。
- e2e 1650–1716三类显式END包有200边界/真实shortenSummary核，task-state.ts:283压平并按码点截断；关键op/plan/replacement不依赖被截断长JSON。证据仅实际路径/提示，产品另list/read发现完整材料（e2e1752起），不以裁剪evidence作全清单/授权。
- 报告回流仍真实submit_report→creator报告→真实close；目标run由Service apply-journal.ts:2164 readRestartExecutionSelection/3413–3417 prepareRoleDispatch核真实报告/transition/replacement闭包，e2e2010附近再断言Task.created.runId，不由正文自报targetRun。
- driver.ts:589–596 bounded按固定caseDeadlineAt余量；publication e2e1737冻结publicationDeadlineAt，主wait remainingCase共享该deadline，连续四phase仍受同absolute case上限，SDK默认45秒不变；本P未运行计时/业务。
- worker/code/quality/delivery后半已知hardgap不在本次防机械浪费走查中冒称通过；no-blocker不是NEW/CHANGE完成、自然EXIT或B2结论。QA/production/test源零写，无test/model/app/Git运行；先消息S后短记释放。
