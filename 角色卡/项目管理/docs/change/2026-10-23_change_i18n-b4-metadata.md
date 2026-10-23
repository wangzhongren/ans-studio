# 变更记录：i18n B4 共享设置元数据 key 化（项目管理）

- **任务**：`2026-10-23-i18n`（变更 A，风险档位 **T2**），节点 **I8（B4 共享元数据）**中的项目管理共享契约部分
- **记录角色**：项目管理（技术架构）worker，独立角色上下文
- **日期**：2026-10-23
- **状态**：**implemented-unverified**（共享元数据实现完成；本角色共享测试与 typecheck 已跑并如实分类；**未验收、未做独立测试、无真实 Electron；桌面消费方解析接线未完成**）
- **授权依据**：
  - 客户闸门 0/1/2 确认与实施授权：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`
  - 方案：`docs/planning/2026-10-23_design_i18n.md` §4.9、§7.1 B4、§9.1 B4、§11 P9
  - 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3（项目管理写集）、§5 I8、§6、§8
  - 实施前验收标准：`docs/acceptance/i18n-criteria-v1.md`（P9/P1/P3/P7）
  - 共享 key 契约：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（`shared.runtimeSettings.*` 34 + `shared.common.*` 28，B1–B4 key 批次已写盘）
- **基线身份**：`main` / HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；本批入口 `git status --short -- src test 角色卡/项目管理` 显示 i18n 目录与共享测试为前序批次未跟踪/已改文件，`runtime-settings.ts`、`runtime-shared.ts`、`runtime-settings.test.ts`、`runtime-shared.test.ts` 为 HEAD 原样；`git diff --cached --name-only` 为空。未 commit / 未 push / 未暂存。
- **环境**：Node `v24.22.1` / npm `11.19.1`；Windows 11（MINGW64 / Git Bash）；cwd 仓库根（见证据 `environment.txt`）。

---

## 一、本批交付

按任务书写集，本批只改**共享设置元数据与共享测试/登记文档**；不改 `app/**`（桌面消费方解析接线由桌面窗口 B4 完成），不改 `src/model/**`、`src/pipeline/**`、`src/provider/**`、`src/common/编排/**`、`package.json`/`tsconfig`/`vite`，不改 `docs/scheduling|acceptance|communication`。

**修改（产品代码 2 个）**：

| 文件 | 改动 |
| --- | --- |
| `src/common/shared/runtime-settings.ts` | `RuntimeSettingField` 展示文案改为目录 key：`label`→`labelKey`（必填）、`help`→`helpKey`（可选）、`choiceLabels`→`choiceLabelKeys`（与 `choices` 等长）；类型 `MessageKey`（由 zh-CN 目录推导，拼写错误/缺 key 编译失败）。14 个字段全部映射到 `shared.runtimeSettings.*`。机器语义 `key/required/secret/fallbackKeys?/choices?/control?/integer?` 原样保留。`RuntimeSettingsDefinition.label` 仍是品牌名（Pi/Codex/Claude）。 |
| `src/common/shared/runtime-shared.ts` | `RUNTIME_LABELS.demo` `"演示"`→语言中性 `"demo"`；新增 `RUNTIME_LABEL_KEYS: Readonly<Record<RuntimeKind, MessageKey \| null>>`（demo→`shared.runtimeSettings.runtime.demo`；Pi/Codex/Claude 为 `null`）。`RUNTIME_LABELS` 键集/形状不变（导出兼容）；Pi/Codex/Claude 品牌名不变。 |

**修改（共享测试/夹具 4 个）**：

| 文件 | 改动 |
| --- | --- |
| `test/项目管理/shared/runtime-settings.test.ts` | 原 11 例语义全部保留并改为经 `translate("zh-CN", key)` 断言逐字中文；新增 3 例：① B4 零变化快照（字段集/顺序/required/secret/fallbackKeys/choices/control/integer 与迁移前逐项一致）；② 逐字段 key 映射（14 字段的 label/help/choice key 解析回迁移前中文，无孤儿/无遗漏）；③ key 契约（zh-CN/en-US 均可解析、key 为 ASCII 静态标识）。14/14。 |
| `test/项目管理/shared/runtime-shared.test.ts` | 更新 `RUNTIME_LABELS` 断言为语言中性值；新增 1 例 B4（demo 无中文、`RUNTIME_LABEL_KEYS` 映射、zh「演示」/en「Demo」、品牌名与 `null` key）。8/8。 |
| `test/项目管理/shared/i18n.test.ts` | 仅改写 **B4 覆盖**断言（B0–B3 断言零改动）：不再扫描"中文是否进目录"，改为断言共享元数据只含 key、目录 34 个 `shared.runtimeSettings.*` 全部被引用且 zh/en 均可解析、`RUNTIME_LABELS.demo` 无中文。 |
| `test/项目管理/shared/i18n-guard-allowlist.ts` | 从 allowlist 移除已零中文的 `src/common/shared/runtime-settings.ts`（守卫规则要求 allowlist 条目仍含中文，B4 完成后该条目必须收紧）；注释同步 B4 状态。**未放宽守卫**，仅按守卫自身"逐批收紧"规则移除陈旧条目。 |

**文档**：

- `角色卡/项目管理/docs/architecture/shared-components.md`：更新组件 3（`RUNTIME_LABEL_KEYS`/中性 demo）、组件 8（key 字段与 14/14 测试）、变更日志。
- `角色卡/项目管理/api-spec.md`：更新 `RUNTIME_LABELS` / `RuntimeSettingField` 契约与 B4 章节（key 字段、主进程解析职责、验证与迁移窗口）。
- `角色卡/项目管理/memo.md`：追加本批事实与续接线索。

**证据目录**：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b4-metadata-evidence/`（`environment.txt`、`hashes-after.txt`、`contract-diff.txt`、`scope-proof.txt`、`line-endings.txt`、`field-semantics-and-key-mapping.log`、`test-shared.log`、`typecheck.log`、`typecheck-renderer.log`、`git-diff-cached.txt`、`git-status-after.txt`）。

---

## 二、迁移前后契约 diff（`RuntimeSettingField`）

```ts
// 迁移前（HEAD）
interface RuntimeSettingField {
  key: string;
  label: string;                    // 固定中文
  required: boolean;
  secret: boolean;
  fallbackKeys?: readonly string[];
  choices?: readonly string[];
  control?: "range";
  choiceLabels?: readonly string[]; // 固定中文，与 choices 等长
  integer?: { min?: number; max?: number };
  help?: string;                    // 固定中文
}

// 迁移后（本批）
interface RuntimeSettingField {
  key: string;
  labelKey: MessageKey;                    // 必填；目录 key
  required: boolean;
  secret: boolean;
  fallbackKeys?: readonly string[];
  choices?: readonly string[];
  control?: "range";
  choiceLabelKeys?: readonly MessageKey[]; // 与 choices 等长；目录 key
  integer?: { min?: number; max?: number };
  helpKey?: MessageKey;                    // 目录 key
}
```

- **单一来源 / 类型安全**：`MessageKey` 由 zh-CN 参考目录推导（`keys.ts`）；key 拼写错误、目录缺 key 在 `npm run typecheck` 失败。共享模块不再携带任何展示中文字面量。
- **渲染层契约不变（目标）**：主进程（桌面窗口 B4）在构造设置视图时按当前 locale 用 `translate`/`mainT` 解析 `labelKey/helpKey/choiceLabelKeys` → `label/help/choiceLabels`，经既有 IPC 推送给渲染层。本批未改 `app/**`；在该接线完成前，桌面消费方引用旧字段会编译失败（见 §五），属预期的迁移窗口。
- **`runtime-shared` 导出兼容**：`RUNTIME_LABELS` 仍是 `Readonly<Record<RuntimeKind, string>>`（键集不变）；仅 `demo` 值由 `"演示"` 改为语言中性 `"demo"`。显示方对 `RUNTIME_LABEL_KEYS[runtime] !== null` 的项用 shared `translate` 取词。渲染层不得导入 `runtime-shared.ts`（顶层 `node:os`/`node:path`），应经 facade 用同一 key。

---

## 三、字段集/必填/choices/secret/fallback 零变化证明

1. **独立基线对比脚本**：从 `git show HEAD:src/common/shared/runtime-settings.ts`（及 `runtime-shared.ts`）加载迁移前模块，与候选模块逐字段比较 `key/required/secret/fallbackKeys/choices/control/integer` 与字段顺序。输出：`IDENTICAL: 字段集/顺序/required/secret/fallbackKeys/choices/control/integer/label 零变化`（证据 `field-semantics-and-key-mapping.log` §1）。
2. **测试锁定**：`runtime-settings.test.ts` 的 "B4 零变化" 用例以迁移前快照字面量 `deepEqual` 锁定 14 个字段（pi 6 / codex 4 / claude 4）的全部机器语义与顺序；既有 required/fallback/choices/control/integer/secret 纪律测试全部保留。
3. **字段数**：pi 6、codex 4、claude 4，合计 **14**；`getRuntimeSettingsDefinition("demo") === undefined` 不变。

---

## 四、key 映射（字段数 / label / help / choice）

- 字段 **14** → `labelKey` **14**；`helpKey` **9**；`choiceLabelKeys` **28**（contextWindow 7 + promptTimeout 7 + reasoning pi 5 + codex 4 + claude 5）。
- 目录 `shared.runtimeSettings.*` 共 **34**（含 `runtime.demo`），全部被共享元数据引用：**missing = []，orphans = []**（证据 `field-semantics-and-key-mapping.log` §4）。
- zh-CN 解析值与迁移前中文**逐字一致**（证据 §2 全量列表；测试逐字段断言）；en-US 全部可解析（如 demo→"Demo"、推理强度→"Reasoning effort"）。
- 共享 key 复用：`field.apiBaseUrl.label`/`field.apiKey.label`/`field.model.label` 跨引擎共用同一 key；`reasoning.*` 三平台共用 label/help/档位 key（同一中文只维护一份）。
- **缺失 key**：无。本批未向目录新增/修改任何 key（B1–B4 key 批次已写盘 34 个 `shared.runtimeSettings.*`）。

---

## 五、测试与 typecheck（原始输出见证据）

**共享测试**：`node --test "test/项目管理/shared/**/*.test.ts"`（Node v24.22.1）

| 指标 | 基线（B4 前） | 候选 |
| --- | --- | --- |
| tests | 177 | **181** |
| pass | 172 | **176** |
| fail | 0 | **0** |
| skipped | 5（既有 Windows 平台按设计跳过） | **5** |

新增 4 例（runtime-settings +3，runtime-shared +1）；i18n.test 的 B4 用例为改写不加例。`i18n-guard.test` 通过：扫描范围仍含 `runtime-settings.ts`，allowlist 收紧后无陈旧条目、无回潮。

**`npm run typecheck`**：基线退出码 0；候选退出码 1，**19 处错误全部位于消费方旧字段引用**（本批未改 `app/**`；按要求如实分类，不修改）：

| 分类 | 文件 | 错误数 | 说明 / 归属 |
| --- | --- | --- | --- |
| A. 产品消费方（桌面窗口 B4 接线） | `app/desktop/runtime-config.ts` | 5 | `field.choiceLabels`×3、`field.label`×2 —— 桌面窗口 B4 用 `mainT` 解析 key 后重建视图字段 |
| B. 桌面窗口测试（既有精确文件） | `test/桌面应用/multi-runtime.test.ts` | 2 | `choiceLabels`、对象字面量 `label` —— 随 A 同批更新 |
| C. 跨角色/回归测试（测试角色/相关批次） | `test/测试/g5-reasoning-verify/f-settings.test.ts` | 7 | `label`×1、`help`×6 —— 改读 key 或解析值 |
| C | `test/测试/t29-pi-config-roundtrip.test.ts` | 2 | `choiceLabels`、`label` |
| C | `test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` | 3 | `label`×2、`choiceLabels`×1 |

- 合计 **19**：A=5（产品代码）+ B=2 + C=14（测试）。**无** `src/**`（共享/装配/编排/运行时核心/适配器）错误；无渲染层错误。
- 补充：`npm run typecheck:renderer` 退出码 **0**（渲染层不直接消费 `RuntimeSettingField`，本批契约变化未影响渲染层；设置视图字段仍由主进程 B4 解析后经 IPC 提供）；原始输出 `typecheck-renderer.log`。
- 这是 B4 契约变更的预期迁移窗口：桌面窗口完成设置视图解析、测试角色/相关批次把断言改读 key 后消除。**本批不声称 typecheck 全绿**。

---

## 六、已知边界与未完成项

1. **桌面消费未完成（B4 下一角色）**：`app/desktop/runtime-config.ts` 仍需按当前 locale 解析 `labelKey/helpKey/choiceLabelKeys` 为 `label/help/choiceLabels`（含保存错误文案使用解析后的 label/choiceLabels）；`app/desktop/runtime-config.ts` 的 `definition?.label ?? "演示"` demo 兜底改走 `t(RUNTIME_LABEL_KEYS.demo)`。渲染层视图契约应保持不变；若实施发现必须改渲染层字段名，属契约扩大，应停止回报。
2. **渲染层 demo 标签**：渲染层不得导入 `runtime-shared.ts`；桌面UI 应经 facade `t("shared.runtimeSettings.runtime.demo")` 取词（本地 `RUNTIME_LABELS` 的 demo 文案收敛属桌面UI B4）。
3. **`runtime-shared.ts` 的消费方**：本批 `RUNTIME_LABELS.demo` 值变化；仓库内产品代码无 `RUNTIME_LABELS` 消费点（grep 证据），仅测试断言更新；若仓库外/CLI 有显示方，应改用 `RUNTIME_LABEL_KEYS` + `translate`。
4. **未验收**：本批只证明共享契约与字段零变化；P9 的"设置面板两种语言""渲染层契约不变""消费者重测"需要桌面窗口/测试角色/独立验收完成。**不声称 i18n 完整验收或已支持 i18n**。
5. **未提交**：未 commit、未 push、未暂存；候选为当前工作区文件（`hashes-after.txt`）。

---

## 七、候选哈希

见证据 [`hashes-after.txt`](2026-10-23_change_i18n-b4-metadata-evidence/hashes-after.txt)（`git hash-object` + `sha256sum`；本批全部改动文件）。关键两文件在证据生成时的候选身份：

- `src/common/shared/runtime-settings.ts`：blob `5169a7791b63802ee73f34951b66b43aed4d07a7`，SHA-256 `a5fedea2d6ae2fbfda9eaf03caf1a83493f0d5c76c37369342892615024ec6d2`
- `src/common/shared/runtime-shared.ts`：blob `d741f6b12d8a42edb150ac40eb4619bcb71e48e9`，SHA-256 `2e01eaa0d137c2e0bd84d0befdbc995d14a81d444f47225ae206d4c155167799`

（若本记录/备忘录在哈希生成后写盘，以 `hashes-after.txt` 内记录的当时候选为准；代码/测试文件在取证后未再改动。）
