# 变更记录：i18n B4 桌面窗口（共享设置元数据 key → 渲染层视图解析）

- **任务**：`2026-10-23-i18n`（变更 A，风险档位 **T2**），节点 **I8（B4 共享元数据，桌面窗口部分）**
- **记录角色**：桌面窗口 worker，独立角色上下文
- **日期**：2026-10-23
- **状态**：**implemented-unverified**（实现完成；本角色精确测试与 `npm run typecheck` 已跑，原始输出见证据目录；**未独立测试/验收，未启动真实 Electron，未 commit/push**）
- **授权依据**：
  - 方案：`docs/planning/2026-10-23_design_i18n.md` §4.9（共享元数据 key 化、禁止第二份 resolver）、§7.1 B4、§9.1 B4、§11 P9
  - 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3（桌面窗口 B4 写集）、§5 I8
  - 实施前验收标准：`docs/acceptance/i18n-criteria-v1.md`（P1 / P3 / P7 / P9 为重点）
  - 共享契约（项目管理 B4，先于本批落盘）：`src/common/shared/runtime-settings.ts` 的
    `labelKey/helpKey/choiceLabelKeys`；`src/common/shared/runtime-shared.ts` 的
    `RUNTIME_LABELS.demo = "demo"` + `RUNTIME_LABEL_KEYS`；PM 记录
    `角色卡/项目管理/docs/change/2026-10-23_change_i18n-b4-metadata.md`
- **基线**：B4 前（B3 候选）`app/desktop/runtime-config.ts` = `a3896b13d11e233e9d9f412cca5b586c3777eaef`、
  `test/桌面应用/interface.test.ts` = `4b10dc1269f86230e288563581d72b045ffa2003`（见 B3 证据 `hashes.txt`）；
  `multi-runtime.test.ts` = `98c65d39…`、`pi-config.test.ts` = `178eca81…`（HEAD blob，写前未改）。
  写前基线 typecheck：**19 错**（5 处 `app/desktop/runtime-config.ts` 旧字段 + 2 处
  `multi-runtime.test.ts` 旧字段 + 12 处 `test/测试/**` 旧字段，后者属测试角色并行修复）。
- **候选哈希**：见 `2026-10-23_change_i18n-b4-desktop-evidence/hashes.txt`（`git hash-object` + `sha256sum`）。
- **未 commit / 未 push / 未发布**。

---

## 一、本批交付

### 1.1 修改文件（均在精确写集内）

| 文件 | 改动 |
| --- | --- |
| `app/desktop/runtime-config.ts` | **B4 主改动**：视图构造处把 `labelKey/helpKey/choiceLabelKeys` 用当前 locale 的 `mainT` 解析回 `label/help/choiceLabels`；`saveRuntimeConfig` 校验错误的 `{label}` 与可接受值同源解析；`demo` 显示名改走 `RUNTIME_LABEL_KEYS.demo`/`mainT`，删除硬编码 `"演示"` |
| `test/桌面应用/multi-runtime.test.ts` | 既有 zh 断言保留；合成字段由字面 `label` 改为目录 `labelKey`（见 §3.2）；新增 en-US 视图/错误/demo 契约用例 |
| `test/桌面应用/pi-config.test.ts` | 新增 en-US（视图 label/help/choiceLabels、保存错误、旧面板字段形状）＋切回 zh 逐字用例 |
| `test/桌面应用/interface.test.ts` | 新增 Interface 层 B4 用例（en-US 视图/保存错误/demo → zh 逐字；字段集/必填/choices 与注册表逐项一致、key 字段不进 IPC） |

### 1.2 验证后**不需要**改动的精确写集文件（如实记录）

| 文件 | 理由 |
| --- | --- |
| `app/desktop/pi-config.ts` | 旧面板视图 `PiConfigField` 只含 `key/secret/value/isSet`，**不读** `field.label/help/choiceLabels`，无展示文案（不复制目录）；生产面 `pi-config:*` IPC 未注入替身时委托注册表路径（`interface.ts` → `getRuntimeConfig`/`saveRuntimeConfig`），本次解析在彼处生效。文件与写前一致（hash `9b758a3e…`，`git status` 无改动） |
| `app/desktop/runtime-resolution.ts` | 只消费 `getRuntimeConfig` 的 `missingKeys`，不引用展示字段；与 B3 候选一致（hash `7bb3449d…` 等于 B3 证据值），未因 B4 改动 |

### 1.3 不改的契约面

- **渲染层 IPC 视图契约不变**：`RuntimeConfigView/RuntimeConfigField` 仍提供
  `runtime/label/path/fields/missingKeys/revision/application` 与字段
  `key/label/required/secret/fallbackKeys/choices/choiceLabels/control/integer/help/value/isSet/source/fallbackKey`
  ——与 B4 前由共享字面量直接透传的形状逐字段一致；`app/renderer/src/chat/runtime-config.ts` 的
  `ConfigField` 无需改动（桌面UI 侧自有 B4 批次）。
- **机器字段原样**：`key` 集、`required`、`choices`、`control`、`integer`、`secret`、`fallbackKeys` 与共享注册表逐项一致
  （新增用例以 `RUNTIME_SETTINGS.<runtime>.fields` 直接对比，非手抄）。
- **key 字段不进 IPC 视图**：`labelKey/helpKey/choiceLabelKeys` 在解析后被剥离（新增用例逐字段 `Object.hasOwn` 断言为 false）。
- **不新增第二份 resolver/目录**：解析只调用 `app/desktop/i18n.ts` 的 `mainT`（唯一实现在 shared）；本文件不含任何
  zh/en 文案字面量、不 import 消息目录。
- **demo 兜底**：`definition?.label ?? mainT(RUNTIME_LABEL_KEYS.demo)`（类型兜底分支回 `RUNTIME_LABELS.demo`="demo"
  的非中文语言中性值），不再硬编码 `"演示"`；Pi/Codex/Claude 仍取注册表品牌名（不翻译）。

## 二、解析实现（唯一解析点）

`app/desktop/runtime-config.ts`：

| 位置 | 行为 |
| --- | --- |
| `resolveFieldDisplay()`（`:35`） | 解构 `labelKey/helpKey/choiceLabelKeys`，机器字段原样保留；`label = mainT(labelKey)`；`helpKey` 存在才生成 `help`；`choiceLabelKeys` 存在才逐项 `map(mainT)` 生成 `choiceLabels`（不缓存、调用当刻取当前 locale） |
| `getRuntimeConfig()` 视图循环（`:117-127`） | `{...resolveFieldDisplay(field), secret: isSecretKey(key), value, isSet, source}`；`fallbackKey` 语义不变 |
| `getRuntimeConfig()` 返回（`:129-130`） | demo 显示名 `RUNTIME_LABEL_KEYS.demo` → `mainT`；品牌名用注册表 `label` |
| `saveRuntimeConfig()` 值域错误（`:168-173`） | `choiceLabelKeys` 逐项解析后，与 `choices` **等长**时作为可接受值展示，否则回退 raw `choices`（旧分支保留）；`{label}` 用 `mainT(field.labelKey)` |
| `saveRuntimeConfig()` 整数错误（`:196`） | `{label}` 同样解析；`{bound}` 仍取 `main.runtimeConfig.integerBound`（B3 既有 key，zh 逐字 ` ≥ {min} 的`） |

locale 语义：`mainT` 读取进程当前 translator（`main.ts`/`Interface` 同一实例，B0/B3 既有）；切换后**新生成**视图用新语言，
已持久化文本不追溯。`getRuntimeConfig` 每次调用都按当下 locale 重新解析（不跨调用缓存）。

## 三、zh-CN 逐字不变（P7）

### 3.1 旧字面量 → 目录 key → zh 值（代表项，全部由既有 zh 断言覆盖）

| 旧 zh 字面量（B4 前共享元数据/桌面视图） | 目录 key | 现 zh 值 |
| --- | --- | --- |
| `演示`（demo 兜底） | `shared.runtimeSettings.runtime.demo` | `演示` |
| `访问令牌` | `shared.runtimeSettings.pi.token.label` | `访问令牌` |
| `API 地址` / `API 密钥` / `模型` | `shared.runtimeSettings.field.apiBaseUrl.label` / `.apiKey.label` / `.model.label` | 同左 |
| `上下文窗口` | `shared.runtimeSettings.pi.contextWindow.label` | `上下文窗口` |
| `拖动选择预设档位，最大 1M tokens；…` | `shared.runtimeSettings.pi.contextWindow.help` | 逐字同旧 |
| `系统默认（500k）/ 32k / 64k / 128k / 256k / 500k / 1M` | `shared.runtimeSettings.pi.contextWindow.choice.*` | 逐字同旧 |
| `看护检查时限` + help + `系统默认（5 分钟）/ 1 分钟 … 30 分钟` | `shared.runtimeSettings.pi.promptTimeout.*` | 逐字同旧 |
| `推理强度` + help + `关/低/中/高/极高` | `shared.runtimeSettings.reasoning.*` | 逐字同旧 |
| `{label}取值无效：仅接受 {accepted}（或留空维持平台默认）。` | `main.runtimeConfig.choiceInvalid`（B3 已迁移） | 逐字同旧 |
| `{label}必须是{bound}正整数。` / ` ≥ {min} 的` | `main.runtimeConfig.integerInvalid` / `.integerBound` | 逐字同旧 |

结论：B4 只换展示文案的**来源**（共享 key → 当前 locale），不换 zh 措辞；既有 zh 断言全部通过
（`multi-runtime.test.ts` 的「档位字段」「G-5 推理强度」、`pi-config.test.ts` 面板用例、`interface.test.ts` 等）。

### 3.2 唯一一处测试期望改写（如实记录，非产品文案）

`multi-runtime.test.ts` 的「无 choiceLabelKeys 字段回退 raw choices」分支使用**临时合成字段**验证：
旧测试给合成字段挂字面 `label: "测试档位"`（B4 前共享类型允许）；B4 后类型只接受 `labelKey`，该字面标签不再可能
（也不应在测试里造第二份文案）。改为复用既有 key `shared.runtimeSettings.reasoning.label`，断言随之由
`测试档位取值无效：仅接受 alpha / beta` 变为 `推理强度取值无效：仅接受 alpha / beta`。**仅此一处**；
分支覆盖（无标签 → raw choices、不回显提交值、零落盘）与其余全部旧 zh 断言逐字保留，未删除/未放宽。

## 四、en-US 新增断言（P9）

| 测试文件 | 新增用例 | 覆盖 |
| --- | --- | --- |
| `test/桌面应用/multi-runtime.test.ts` | `i18n B4：设置视图 label/help/choiceLabels 按当前 locale 从共享 key 解析（en-US）…` | pi/codex 字段 `label/help/choiceLabels`（含 `Access token`、`Context window` 长 help、7 档上下文窗口、推理 5 档）；无 key 时属性不出现；字段 key 集/必填/choices 与注册表一致；`labelKey/helpKey/choiceLabelKeys` 不泄露；`demo`="Demo"、品牌名不变；保存错误 en 全文（推理强度/看护时限）且不回显提交值；切回 zh 后视图/错误逐字 |
| `test/桌面应用/pi-config.test.ts` | `i18n B4：pi 设置视图 label/help/choiceLabels 按 en-US 解析、保存错误 en；旧面板视图无文案字段；切回 zh 逐字` | 旧面板路径：注册表视图 en 解析；`PI_PANEL_KEYS` 与视图字段逐一相等；旧 `getPiConfig` 字段形状仍只含 `key/secret/value/isSet`（不复制目录）；保存错误 en；切回 zh 逐字 |
| `test/桌面应用/interface.test.ts` | `i18n B4：getRuntimeConfig 视图按当前 locale 解析 label/help/choiceLabels…` | Interface 生成点（注入 `mainI18n: en`）en 视图/保存错误/demo；字段 `control/integer/secret` 透传；切回 zh 新建 Interface 后 zh 逐字（含 `看护检查时限取值无效…`） |

## 五、测试与 typecheck（原始输出见证据目录）

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面应用/multi-runtime.test.ts` | **39/39 pass**，exit 0（`test-multi-runtime.log`） |
| `node --test test/桌面应用/pi-config.test.ts` | **17/17 pass**，exit 0（`test-pi-config.log`） |
| `node --test test/桌面应用/interface.test.ts` | **119/119 pass**，exit 0（`test-interface.log`） |
| `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` | **558/558 pass**，exit 0（`test-desktop-full.log`） |
| `npm run typecheck` | **exit 0，0 错**（`typecheck.log`） |

### 5.1 typecheck 分类（如实）

- **写前基线（19 错）**：5 处 `app/desktop/runtime-config.ts`（`choiceLabels`×3、`label`×2）＋
  2 处 `test/桌面应用/multi-runtime.test.ts`（`choiceLabels`、合成字段 `label`）＋
  12 处 `test/测试/**`（`g5-reasoning-verify/f-settings.test.ts` 7、`t29-pi-config-roundtrip.test.ts` 2、
  `turn-watch-verify/c-cross-runtime-settings.test.ts` 3）。
- **本候选**：上述 7 处本角色范围内错误全部消除；`test/测试/**` 12 处由**测试角色并行修复**（本角色未改这些文件）；
  期间观察到的 2 处 `test/桌面UI/runtime-config.test.ts` 错误属桌面UI 并行在写的 B4 测试（不是本候选引入），
  最终 `npm run typecheck` 已为 0。
- **一次 flaky 记录**：全量串行首跑出现 1 个失败——`2026-10-23 可重入门禁：…readiness 恰一次派发`
  `0 !== 1`（governance 时序；单独跑 `interface.test.ts` 与重跑全量均通过；B0 证据
  `interface-test-flaky-readiness.log` 亦记录过同类 readiness 时序 flake）。与本批 B4 改动无关联，重跑
  558/558 通过；如实记录，不作「从未失败」声明。

## 六、残余与移交

- **`test/测试/**` 原 12 处旧字段错误**：属测试角色写集，本角色**未改**；当前已由其并行修复，typecheck 0。
- **桌面UI B4**（`app/renderer/src/chat/runtime-config.ts` 删本地 `RUNTIME_LABELS`/locale 化）不在本角色写集；
  本角色的 IPC 视图已持续提供解析后的 `label`（含 demo），渲染层可据此消费。
- **设置面板两语言 e2e / 截图**（P9 最低证据的一部分）归桌面UI/测试的真实 Electron 证据；本角色只覆盖
  `test/桌面应用/**` 与 typecheck。
- **api-spec.md 未改**：IPC 载荷/通道形状零变化（`runtime-config:get/save` 返回字段名不变），按任务「按需」判定无需更新。
- 未新建 `test/桌面应用/` 文件；未触碰写集外产品文件；未改共享目录/`src/**`/`app/main.ts`/`app/preload.cjs`/`app/renderer/**`。

## 七、证据清单

目录：`角色卡/桌面窗口/docs/change/2026-10-23_change_i18n-b4-desktop-evidence/`

| 文件 | 内容 |
| --- | --- |
| `hashes.txt` | 候选文件 `git hash-object` + `sha256sum` + 写前基线哈希 |
| `test-multi-runtime.log` / `test-pi-config.log` / `test-interface.log` / `test-desktop-full.log` | `node --test` 原始输出与退出码（通过口径） |
| `test-desktop-full-run1-flaky.log` | 全量串行首跑的 flaky 失败原文（`readiness 恰一次派发 0 !== 1`，exit 1；见 §5.1） |
| `typecheck.log` | `npm run typecheck` 原始输出（exit 0） |
