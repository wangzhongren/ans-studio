# 变更记录：i18n B4 消费方迁移（测试角色 `test/测试/`）

- **任务**：`2026-10-23-i18n` 变更 A（客户端口确认与实施授权），节点 I8「B4 共享元数据」中**测试角色消费方**的断言迁移
- **记录角色**：测试（Testing）worker，独立角色上下文
- **日期**：2026-10-23
- **状态**：**implemented-unverified**（12 处旧字段断言 + 1 处渲染源码守卫已迁移到 key 契约；目标套件、同目录套件、b-establish、i-full-chain 与全量回归已跑；typecheck 全绿；**未验收、未做独立测试、无真实 Electron**；桌面窗口/桌面UI 的 app 侧迁移为并行角色、不在本记录范围内）
- **授权依据**：
  - 本 worker 任务书：精确写集 `test/测试/g5-reasoning-verify/f-settings.test.ts`、`test/测试/t29-pi-config-roundtrip.test.ts`、`test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts`，按需 `test/测试/` 内实际导入 `runtime-settings`/`runtime-shared` 的消费者套件，及本变更记录/证据目录
  - 共享契约变更记录（项目管理）：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b4-metadata.md`
  - 方案：`docs/planning/2026-10-23_design_i18n.md` §4.9、§7.1 B4、§9.1 B4、§11 P9（只引用，未编辑）
  - 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §5 I8（只引用，未编辑调度文档）
  - 验收标准：`docs/acceptance/i18n-criteria-v1.md` P9/P1/P3/P7（只引用，未编辑验收文档）
  - 共享 key 契约：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 的 `shared.runtimeSettings.*`（B1–B4 批次已写盘）
- **基线身份**：`main` / HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；本批入口 `git status` 显示 `app/**` 等为桌面窗口/桌面UI 并行角色的未提交改动；本 worker 初始三个设置测试文件在编辑前为 HEAD 原样（旧字段断言 → 12 处 typecheck 错误）；b-establish 亦为 HEAD 原样（源码守卫含旧中文字面量）；`git diff --cached --name-only` 为空。未 commit / 未 push / 未暂存。
- **环境**：Node `v24.22.1` / npm `11.19.1`（用户级安装 `C:\Users\51054\AppData\Local\Programs\nodejs`，默认 PATH 未包含，运行前显式加入；见证据 `environment.txt`）；Windows 11（MINGW64 / Git Bash）；cwd 仓库根。

---

## 一、本批交付（只改测试消费方；不改产品）

**修改（`test/测试/` 4 个文件，均为测试角色所有权；前 3 个为 B4 字段迁移，第 4 个为 B4 收口追加）**：

| 文件 | 迁移点数 | 改动 |
| --- | --- | --- |
| `test/测试/g5-reasoning-verify/f-settings.test.ts` | 7（F1 `label`×1；F2 `help`×6） | 改读 `labelKey`/`helpKey`，经 shared `translate("zh-CN", key)` 解析回**迁移前中文逐字文案**；新增 key 指向断言、`"label"/"help" in field === false` 旧字段缺席守卫、最小 en-US 断言。F3–F8 断言**零改动**（choices 拒/trim/空串清除/批量原子/读取链/pi-config 对齐原样保留）。 |
| `test/测试/t29-pi-config-roundtrip.test.ts` | 2（`choiceLabels`×1；`label`×1） | 错误文案期望改为与注册表**同源**：`choiceLabelKeys.map(translate zh-CN)` 与 `labelKey` 解析值拼出旧中文期望；新增 `choiceLabelKeys` 与 `choices` 等长断言、`"关 / 低 / 中 / 高 / 极高"` 逐字断言、最小 en-US 断言。其余 10 例（往返/适配器构造/默认值/单一来源/签名纪律）零改动。 |
| `test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` | 3（C2 `label`×1、`choiceLabels`×1、`help`×1） | C2 改读 `labelKey`/`choiceLabelKeys`/`helpKey` 并解析回旧中文（label「看护检查时限」、7 个档位标签、help 五条必须语义）；`choices`/`control: "range"`/`integer: {min:1000}`/「1 小时兜底不暴露」断言原样；新增旧字段缺席守卫与最小 en-US 断言。C1/C3/C4/C5 零改动。 |
| `test/测试/existing-project-compat-verify/b-establish.test.ts` | 1（B4 V5 渲染源码守卫） | **B4 收口追加（协调者明确授权）**：源码守卫从「`governance-store.ts` 含旧中文字面量」改为断言 cancel 路径的 keyed `translate(…, "ui.governanceStore.cancelled")` 调用；旧中文改由共享目录 `translate("zh-CN", key)` 逐字断言；保留 `cancel` 不直接调 IPC 的负向守卫，并新增 store 不含旧字面量守卫。详见 §二追加。 |

**未修改（按需排查后确认无需改动）**：

- `test/测试/helpers.ts`、`test/测试/t1-real-cli.test.ts`、`test/测试/t1-actual-main.mjs` 只导入 `runtime-shared.ts` 的凭据变量常量（`PI_CREDENTIAL_ENV_VARS`/`RUNTIME_CREDENTIAL_ENV_VARS`），B4 未改这些导出，无需迁移。
- `test/测试/retired-5b/*.retired` 为非 `.ts` 的退役文件，不参与 typecheck/测试。
- `RUNTIME_LABELS.demo` 由 `"演示"` 改语言中性 `"demo"`：`test/测试/**` 无任何套件断言该值（grep 证据），无需改动。

**不写**：`src/**`、`app/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/项目管理/shared/**`、其他角色卡/边界、`docs/scheduling|acceptance|communication`。本 worker 未新增依赖。

---

## 二、迁移明细：12 处旧字段 + 1 处渲染源码守卫

| # | 文件:行（迁移前） | 旧断言 | 新断言（语义等价、逐字保留 zh 期望） |
| --- | --- | --- | --- |
| 1 | `g5…/f-settings.test.ts:37` | `field.label === "推理强度"` | `field.labelKey === "shared.runtimeSettings.reasoning.label"` 且 `translate("zh-CN", field.labelKey) === "推理强度"`；另断言 `"label" in field === false` |
| 2–7 | `g5…/f-settings.test.ts:50–54`（6 个错误，行 50 两处） | `field.help` 在场 + 含「留空＝维持平台默认」「关/低/中/高/极高」「思考计入输出 tokens」；三平台 help 逐字同一句 | `field.helpKey` 在场且三平台同一 key；`translate("zh-CN", helpKey)` 同三条包含断言 + 三平台解析文本 `helps.size === 1`；`"help" in field === false` |
| 8 | `t29…test.ts:290` | `(reasoningField.choiceLabels ?? reasoningField.choices ?? []).join(" / ")` | `choiceLabelKeys` 在场且与 `choices` 等长；逐 key `translate("zh-CN")` 后 join；并逐字断言 `"关 / 低 / 中 / 高 / 极高"` |
| 9 | `t29…test.ts:292` | `${reasoningField.label}取值无效…` | `${translate("zh-CN", reasoningField.labelKey)}取值无效…`（同一目录、同一 key 同源拼期望） |
| 10 | `c-cross-runtime-settings.test.ts:86` | `field.label === "看护检查时限"` | `translate("zh-CN", field.labelKey) === "看护检查时限"`；`"label" in field === false` |
| 11 | `c-cross-runtime-settings.test.ts:88` | `field.choiceLabels` deepEqual 7 项中文 | `choiceLabelKeys` 在场且与 `choices` 等长；逐 key 解析后 deepEqual 迁移前 7 项中文 |
| 12 | `c-cross-runtime-settings.test.ts:101` | `field.help` 含五条语义 | `field.helpKey` 在场；`translate("zh-CN", helpKey)` 同五条包含断言；`"help" in field === false` |

**迁移方式**：直接 `import { translate } from "…/src/common/shared/i18n/index.ts"`（共享唯一翻译实现，只读消费），在测试内解析 key → zh-CN 期望值。**未**在测试中复制目录/文案映射表。所有旧中文期望值**逐字未改**。

**en-US 最小断言（按任务允许）**：g5 F1 `Reasoning effort`、g5 F2 `Thinking counts toward output tokens`、t29 `Reasoning effort`、C2 `Watchdog check limit` + `System default (5 min)`。用于证明同一 key 在英文目录可解析，不替代 zh 逐字断言。

### 2.1 追加：渲染源码守卫 key 化（B1 消费方收口）

- **文件/位置**：`test/测试/existing-project-compat-verify/b-establish.test.ts:192`（B4 V5 用例）。
- **旧断言**：读取 `app/renderer/src/stores/governance-store.ts` 源码，`assert.match(store, /已取消，未写入任何文件/)` —— 期望源码内嵌中文自由文本。
- **新断言**（三条，强度不降）：
  1. cancel 路径匹配 **keyed translate 调用**：`/cancel:\s*\(\)\s*=>\s*\{[\s\S]{0,400}?translate\(\s*currentLocale\(\s*\)\s*,\s*"ui\.governanceStore\.cancelled"\s*\)/`；
  2. store 源码**不含**旧中文字面量 `已取消，未写入任何文件`（文案单一来源＝共享目录）；
  3. 共享目录逐字：`translate("zh-CN", "ui.governanceStore.cancelled") === "已取消，未写入任何文件。"`。
- **保留**：`/cancel:[\s\S]{0,200}?bridge\./ === false` 负向守卫（cancel 不直接调 IPC）与 `cancelPreview` 面板守卫；其它用例零改动。
- **守卫敏感性**（证据 `guard-sensitivity.txt`）：keyed 正则匹配当前 store，对旧式自由文本片段不匹配；旧字面量在当前 store 不存在、在旧式片段存在——防回潮能力与迁移前等价（不再依赖中文自由文本）。
- **归属说明**：这是 B1 渲染层 key 化的消费方收口（非 `RuntimeSettingField` 字段迁移）；原任务书精确写集只列三个设置套件，本文件按协调者明确追加指令修正。

---

## 三、字段语义未放宽（对照基线断言逐项保留）

1. **机器语义断言原样保留**：字段集/顺序（`PI_PANEL_KEYS` 对齐、`RUNTIME_SETTINGS.pi` 逐键）、`required`、`secret`、`fallbackKeys`、`choices`（值域逐字；Codex 无 off）、`control: "range"`、`integer: {min}`、`getRuntimeSettingsDefinition("demo")` 行为均未改断言。
2. **行为断言零改动**：g5 F3–F8（choices 拒/trim 规范形/空串清除/批量原子/读取链/Pi 旧面板路径）逐字保留，包括 F3 的 zh 错误文案「推理强度取值无效」「关 / 低 / 中 / 高 / 极高」「codex 值域无『关』档」；t29 其余 10 例；C1/C3/C4/C5。
3. **只加不减**：新增旧字段缺席守卫（`"label"/"help" in field === false`）、`choiceLabelKeys` 与 `choices` 等长、三平台 helpKey 同一、en-US 可解析；未删除或弱化任何既有断言。
4. **产品代码零改动**：本 worker 未改 `src/**`、`app/**`；测试经真实 `runtime-config.ts` 保存链断言错误文案（同源），不 mock 产品行为。

---

## 四、测试与 typecheck（原始输出见证据）

**目标三套件**（`node --test <file>`，Node v24.22.1）：

| 套件 | tests | pass | fail | skipped | 基线对照（`2026-10-23-baseline-evidence/t2-summary.tsv`） |
| --- | --- | --- | --- | --- | --- |
| `g5-reasoning-verify/f-settings.test.ts` | **8** | **8** | 0 | 0 | 8/8/0 |
| `t29-pi-config-roundtrip.test.ts` | **11** | **11** | 0 | 0 | 11/11/0 |
| `turn-watch-verify/c-cross-runtime-settings.test.ts` | **5** | **5** | 0 | 0 | 5/5/0 |

**同目录/相邻消费者套件**（确认无交叉影响，均全绿）：

| 套件/范围 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| `g5-reasoning-verify/**/*.test.ts`（a–f + compatibility-loopback 全目录） | 61 | 61 | 0 | 0 |
| `turn-watch-verify/**/*.test.ts`（a–d 全目录） | 15 | 15 | 0 | 0 |
| `t29-write-discipline.test.ts`（同前缀相邻套件） | 14 | 14 | 0 | 0 |

**B4 收口追加套件**（协调者指令；`node --test <file>`）：

| 套件 | tests | pass | fail | skipped | 说明 |
| --- | --- | --- | --- | --- | --- |
| `existing-project-compat-verify/b-establish.test.ts` | **13** | **13** | 0 | 0 | 首轮全量中 B4 V5 源码守卫红；按 §2.1 修正后全绿 |
| `governance-e2e-auto/i-full-chain.test.ts` | **3** | **3** | 0 | 0 | 首轮全量 2 红（并行窗口）；复跑全绿（含并行新增的 v3 完整链路） |

**`test/测试/**/*.test.ts` 全量串行回归**（`node --test --test-concurrency=1`，2026-10-23 16:32:28–16:34:09，120 个测试文件）：

| tests | pass | fail | skipped | exit | 日志 |
| --- | --- | --- | --- | --- | --- |
| **814** | **804** | **4** | **6** | 1 | `test-quanliang-serial.log` / `test-quanliang-summary.txt` |

4 个失败**均不在本 worker 迁移的三个套件内、均不涉及 `runtime-settings`/`runtime-shared` 契约**，逐条分类（原文见日志）：

| # | 失败用例（文件） | 原因分类 | 基线对照 |
| --- | --- | --- | --- |
| 1 | `existing-project-compat-verify/b-establish.test.ts:172`「B4 V5：预览零写入；取消不调 IPC（渲染源码级守卫）」 | 渲染层 i18n 并行迁移：该用例读 `app/renderer` 源码断言中文字面量「已取消，未写入任何文件」，桌面UI 已把文案改为目录 key（非本 worker 写集） | 基线全量 log 为 ✔（当时渲染层未迁） |
| 2 | `g4-skill-verify/b-render-double-check.test.ts:182`「读取器入参防御（对抗）…」 | `EPERM: operation not permitted, symlink`（Windows 平台限制） | **既有红**（全仓 9 个 symlink EPERM 之一） |
| 3 | `governance-e2e-auto/i-full-chain.test.ts`「五角色全自动链路…」 | 该目录含前序批次未提交改动（mtime 12:10–14:20），且 `app/desktop/session.ts` 等被并行角色修改；失败为「会话尚未开启（点击左侧角色即可开启）」 | 基线全量 log 为 ✔；属并行迁移窗口 |
| 4 | `governance-e2e-auto/i-full-chain.test.ts:620`「v2 完整链路…」 | 同上（v2 链路的同一并行窗口） | 基线全量 log 为 ✔；属并行迁移窗口 |

即：本批新增/修改的三套件及其同目录/相邻套件全绿；全量中的 4 红为**既有平台红（1）＋并行角色迁移窗口红（3）**，按任务要求只如实报告、不修改写集外文件。

**收口后全量复跑**（同一命令，2026-10-23 16:37:22–16:39:14，日志 `test-quanliang-serial-rerun.log`）：

| tests | pass | fail | skipped | exit |
| --- | --- | --- | --- | --- |
| **814** | **806** | **2** | **6** | 1 |

- 首轮 4 红中的 3 条已收敛：`b-establish` B4 V5 随 §2.1 修正转绿；`i-full-chain` 五角色/v2 两条随并行改动收敛（该文件单独复跑 **3/3** 全绿，含并行新增 v3）。
- 剩余 2 红：
  1. `g4-skill-verify/b-render-double-check.test.ts`「读取器入参防御（对抗）…」：既有 Windows symlink EPERM（同首轮分类，非本批）。
  2. `governance-e2e-auto/i-full-chain.test.ts:1492`「v3 完整链路…」：**仅在全量串行中出现**（「会话尚未开启」）；同文件单独复跑 3/3 全绿 → 顺序/隔离相关的测试问题，属该套件所有者（并行新增 v3 的未提交改动），不在本批写集、未修改；日志保留。

**`npm run typecheck`**：

| 时点 | 退出码 | 总错误 | `test/测试/` 错误 | 说明 |
| --- | --- | --- | --- | --- |
| 迁移前（本 worker 编辑前） | 1 | **19** | **12**（g5 7 + t29 2 + c 3） | 其余：`app/desktop/runtime-config.ts` 5（桌面窗口 B4）、`test/桌面应用/multi-runtime.test.ts` 2（桌面窗口测试） |
| 迁移后（首轮取证时） | 1 | **2** | **0** | 残余仅 `test/桌面UI/runtime-config.test.ts(176,39/177,48)` TS7053（桌面UI 并行迁移，非本写集） |
| B4 收口后（最终取证，`typecheck-after.log`） | **0** | **0** | **0** | 桌面UI 的 2 处并行错误亦已由桌面UI角色修复；`npm run typecheck` 全绿 |

- 迁移后曾短暂残余 `test/桌面UI/runtime-config.test.ts(176,39/177,48)` TS7053 与（更早瞬间）`test/桌面应用/multi-runtime.test.ts` 旧字段错误，均随并行角色修复消除；**最终 `npm run typecheck` 退出码 0、零错误**（含 `test/测试/` 0）。
- `npm run typecheck:renderer` 不属本批（桌面UI 负责）。

---

## 五、跨角色依赖的如实记录

1. **桌面主进程 B4 接线是本批测试运行的前置**：本 worker 编辑期间，`app/desktop/runtime-config.ts` 仍引用旧字段（保存错误用 `field.label`/`field.choiceLabels`）；桌面窗口并行角色随后在同一会话内完成 `mainT` 解析接线（视图契约 `label/help/choiceLabels` 不变）。三套件在接线落地后全绿：F3/T29 的本地化错误文案断言依赖主进程按目录解析，若对端回退，会如实变红——这是本批**有意保留**的消费方契约断言，不是放宽。
2. **并行写集边界**：`app/**`、`test/桌面应用/**`、`test/桌面UI/**`、`src/**` 的改动均非本 worker 所为；本记录与证据只对 `test/测试/` 四个文件负责。
3. **locale 前提**：主进程 `mainT` 在未创建实例时默认 zh-CN（`DEFAULT_LOCALE`）；F3/T29 的错误文案断言在该默认下成立。测试自身对元数据 key 的解析显式传 `"zh-CN"`/`"en-US"`，不依赖进程 locale。

---

## 六、已知边界与未完成项

1. **未验收**：本批只证明测试消费方断言已迁移且通过；P9 的「设置面板两种语言」「渲染层契约不变」「消费者重测」需桌面窗口/桌面UI/独立验收完成。**不声称 i18n 完整验收**。
2. **无真实 Electron**：未启动真实窗口；本批全部为 Node `node --test` 层测试。
3. **全量回归**：`test/测试/**` 首轮 814/804/4/6（1 既有 symlink + 3 并行迁移窗口）；收口后复跑 **814/806/2/6**，剩余 2 红 = 1 个既有 Windows symlink EPERM + 1 个 `i-full-chain` v3 的串行顺序/隔离问题（单独复跑 3/3 绿，属该套件所有者）。历史全仓基线（353 文件串行）为 3591/3563/10（9 个 symlink EPERM 既有红 + 1 个既有红）——本批不声称全仓全绿，但本批四个文件与三个设置套件均无红。
4. **未提交**：未 commit、未 push、未暂存；候选为当前工作区文件。

---

## 七、候选哈希

见证据 [`hashes-after.txt`](2026-10-23_change_i18n-b4-consumers-evidence/hashes-after.txt)（`git hash-object` + `sha256sum`）。四个修改文件在取证时的候选身份：

| 文件 | blob（git hash-object） | SHA-256 |
| --- | --- | --- |
| `test/测试/g5-reasoning-verify/f-settings.test.ts` | `d37c44f88263357f71201a3ef0409cf7ccc2d755` | `a919eee53f4a25148cbce92a2853b20f7fbbe86a98d2fa330be4f7bb63355082` |
| `test/测试/t29-pi-config-roundtrip.test.ts` | `1c2cdc4a4d7d84d74f5fb380a77d4e704a594d9f` | `71842ced0d1ae05e551696468ad27dbcad2791239dfca003c170694d1611287e` |
| `test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` | `6c798ae9df308704f19aa50f7d6cffa416302156` | `10765961cafc67b19485c1606347840fdce2e95008d6645da9ad76d01eaceab8` |
| `test/测试/existing-project-compat-verify/b-establish.test.ts` | `2cbd5e5a12bfdd4975b9e7ab1ccaa19f4ff71f6f` | `9505901ba077d01b43adca00ccd53e09fb542ff40d932bac665af14f84b895f2` |

本记录自身（最终写盘后）的候选身份另记于 `hashes-after.txt`（自哈希写回会自指失效，故不在正文内嵌）。

（本记录写盘后若再有改动，以 `hashes-after.txt` 与最终 `git status` 为准。）

---

## 八、证据目录

`角色卡/测试/docs/change/2026-10-23_change_i18n-b4-consumers-evidence/`：

- `environment.txt`（Node/npm/OS/HEAD）
- `scope-proof.txt`（本 worker 实际编辑文件、mtime、前序批次既有改动的区分、未 commit）
- `hashes-after.txt`（三个测试文件 + 本记录的 blob + SHA-256）
- `line-endings.txt`（`core.autocrlf=true`；工作区 CRLF 一致、HEAD blob LF、`git diff --check` 干净）
- `typecheck-before.log`（19 处基线逐条）
- `typecheck-after.log`（残余 2 处，`test/测试` 0）
- `test-g5-f-settings.log`（8/8）
- `test-t29-pi-config-roundtrip.log`（11/11）
- `test-turn-watch-c-cross-runtime-settings.log`（5/5）
- `test-g5-folder.log`（61/61）
- `test-turn-watch-folder.log`（15/15）
- `test-t29-write-discipline.log`（14/14）
- `test-quanliang-serial.log`（`test/测试/**` 全量串行原始输出 814/804/4/6，首轮）
- `test-quanliang-summary.txt`（首轮全量计数、4 个失败原文分类与基线对照）
- `test-b-establish.log`（B4 收口：b-establish 13/13）
- `test-i-full-chain.log`（B4 收口：i-full-chain 3/3，含 v3）
- `test-quanliang-serial-rerun.log`（守卫修正后的 `test/测试/**` 全量串行复跑 814/806/2/6）
- `guard-sensitivity.txt`（b-establish 新源码守卫对旧式自由文本的敏感性验证与 zh/en 目录值）
