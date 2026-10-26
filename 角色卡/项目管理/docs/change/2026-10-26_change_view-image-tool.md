# 变更记录：`view_image` 共享 i18n、变更记录与规则登记（项目管理）

- **任务**：客户新增 `view_image` 工具（角色查看项目内图片证据）——项目管理负责的共享 i18n、变更记录与规则同步
- **记录角色**：项目管理（技术架构）worker，独立角色上下文
- **日期**：2026-10-26
- **状态**：**`implemented-unverified`**（共享 i18n key、契约测试、本变更记录与工程法案规则登记完成；本角色 i18n 测试通过；`npm run typecheck` 最终复跑因其他角色在飞接线的类型漂移 exit 1，**错误均不在本批写集**（本批文件无诊断），详见 §六/§七；**`view_image` 工具实现/接线由其他角色在工作树中并发进行，本批未修改、未验证、未验收**；未做真实 Electron/全量回归）
- **授权依据**：客户要求「角色可查看项目内图片证据」（由主控任务转达）；工作树内未见对应 `docs/communication/**` 客户沟通原文，本记录以任务转达的客户要求为准，**不伪造沟通文件**
- **基线身份**：worktree `lead-governance-coordination`，HEAD `5d21fd8`（`feat/scaffold-first-governance`）；本批只做增量修改，未回退既有改动；未 commit / 未 push / 未暂存
- **环境**：Windows 11 / Git Bash（MINGW64）；Node `v24.22.1`；npm `11.19.1`；仓库根 = worktree

> **并发说明**：本批执行期间，工作树中出现**其他角色的在飞改动**（`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/common/门禁引擎/governance-roles.ts`、`app/desktop/view-image.ts`，即 `view_image` 的类型/工具实现/桌面投递与治理角色卡文本），且仍在持续写入。本批只**只读核对**这些改动用于如实记录，未修改、未运行其测试、未验证/验收；`npm run typecheck` 批次中期曾 exit 0，**最终复跑 exit 1**，错误全部来自这些在飞文件的类型漂移（详见 §六/§七），不代表对本批的验证失败，也不能据此声称其他角色实现可编译。

---

## 一、客户要求

客户要求（经主控任务转达）：**角色应当能查看项目内的图片证据**（截图、设计稿、图表等），用于 gate 复核 / 验收 / 协调时核对真实画面，而不是只凭「文件存在」下结论。

由此确定 `view_image` 工具的行为契约：

1. **只读项目内图片**：工具读取导入项目内的图片文件，不写盘、不联网、不执行命令；不读取项目外路径。
2. **两轮附件**：图片**不进入本轮工具结果**（各引擎对「工具结果附图」的支持不一致），而是排队为**同一角色下一轮用户提示的图片附件**；本轮工具结果只回「已读取并排队，下一轮以附件提供」。
3. **不得假装已看**：本轮模型并未看到图片内容，工具回执必须明确「下一轮才提供，本轮不要假装已看到」；治理角色卡同样要求「附件到达前不下画面结论」。
4. **fail-closed**：路径、类型、大小任一不合规，或读取/排队失败时，如实返回失败且**不提供图片**（不伪造、不部分排队）。
5. **能力未注入不注册**：图片查看能力未注入时不注册 `view_image` 工具（不提供假装可用的壳）。
6. **不扩权**：不新增角色、不新增 `FlowStepKind`/cardKind，不改变任何角色的文件写权。

**本批（项目管理）只做**：共享 i18n key、共享 i18n 契约测试、本变更记录、工程法案规则登记。

**本批不做**：`src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`app/**` 的任何实现或接线；不新增角色/`FlowStepKind`；不 commit/push；不重启应用；不碰 `demos/`。

---

## 二、两轮附件设计（契约）

```text
第 N 轮（工具调用）                        第 N+1 轮（同一角色）
role ── view_image(path) ──▶ 校验(path/类型/大小)
                               │
                               ├─ 失败 ──▶ 工具失败回执（未提供图片）
                               │
                               └─ 读取 bytes ──▶ 注入的 ViewImageFn 排队
                                                  │
       工具回执：已读取并排队，下一轮以附件提供 ◀──┘
       （本轮未看到图片内容，不要假装已看到）
                                                  │
       下一轮用户提示 ──▶ 图片附件（ui.viewImage.attachmentLabel）──▶ role 此时才看到图片
```

- **同一角色**：附件只为发起调用的角色排队，不跨角色、不广播。
- **本轮只确认排队**：工具结果文本不包含图片内容；模型不得据此声称已核对画面。
- **下一轮才可见**：图片随下一轮用户提示作为图片附件送达（`PromptImage`：base64 + MIME）。
- **失败语义**：能力 `ok:false`、抛错、回执缺失/非法、轮次中止导致排队未获确认时，一律按「未排队」如实转达，**不得谎报已提供**；中止时可能已受理但未确认，回执明确「不要当它已提供」。

---

## 三、fail-closed 规则（路径 / 类型 / 大小 / 注册）

| 环节 | 拒绝条件（任一命中即失败，**不调用排队能力**） | 结果 |
| --- | --- | --- |
| 路径句法 | 空串、含 NUL、绝对路径/盘符路径（含 `C:foo` 盘符相对）、含 `..` 路径段 | 工具失败：未读取、未排队 |
| 路径真实边界 | `realpath` 后落在项目读取根之外（符号链接/junction 逃逸） | 工具失败：已拒绝 |
| 文件形态 | 不存在/不可访问、是目录（指路 `list_dir`）、不是普通文件 | 工具失败：未读取、未排队 |
| 类型 | 真实扩展名不在 `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`（扩展名小写化；扩展名/声明类型不作数） | 工具失败：未读取、未排队 |
| 大小 | 超过大小上限（在飞实现：10 MB；`stat` 后先拒，读入后再按实际字节数复核，绝不超限排队） | 工具失败：未读取、未排队 |
| 读取 | 读文件失败/轮次中止 | 工具失败：未排队 |
| 排队 | 能力 `ok:false`、抛错、回执缺失/非法 | 工具失败：未排队，下一轮不会收到附件 |
| 注册 | 能力未注入 | **工具不存在**（结构性 fail-closed，沿 `dispatch_task` 先例） |

**用户可见/模型可见文本分层（i18n 口径）**：工具发给模型的失败/排队文本属 agent-facing，按既有 i18n 方案不入共享目录；本批新增的 `main.viewImage.*` 是主进程/桌面生成**用户可见回执**时的共享文案契约，`ui.viewImage.attachmentLabel` 是渲染层展示**下一轮图片附件**的可选标签。消费方必须按 §四 的 key/占位符取词，缺参会保留占位符并产生 `i18n.missing-param` 诊断。

---

## 四、共享 i18n key 契约（3 个，zh-CN/en-US 同 key、同语义）

`zh-CN.ts` 是 key 全集来源；`en-US.ts` 的 `satisfies Record<MessageKey, MessageTemplate>` 在编译期强制 key 齐全。未改任何既有 key 文案。

| # | key | zh-CN | en-US | 占位符 | 语义/用途 |
| --- | --- | --- | --- | --- | --- |
| 1 | `main.viewImage.queued` | 已读取项目图片 {path} 并排队：下一轮将以图片附件提供（随下一轮用户提示送达）；本轮你尚未看到图片内容，不要假装本轮已看到。 | Read project image {path} and queued it: it will be provided as an image attachment with the next user prompt; you have not seen the image content this turn — do not pretend you have. | `{path}` | 排队回执：**下一轮**才以附件提供；本轮未看到、不得假装。 |
| 2 | `main.viewImage.failed` | 读取或排队项目图片失败（{detail}）；未提供图片。 | Failed to read or queue the project image ({detail}); no image was provided. | `{detail}` | 失败回执：fail-closed，未提供图片；`{detail}` 用有界诊断。 |
| 3 | `ui.viewImage.attachmentLabel` | view_image 附件：{path} | view_image attachment: {path} | `{path}` | 下一轮用户提示中图片附件的可选展示标签。 |

**契约要点**：

- `queued` 逐字承载「下一轮以图片附件提供」（en: `with the next user prompt` / `image attachment`）与「本轮尚未看到、不要假装」（en: `have not seen the image content this turn` / `do not pretend`）。
- `failed` 逐字承载「未提供图片」（en: `no image was provided`），不得改写为「可能已提供」。
- 三个 key 的占位符 zh/en 一致；en-US 不含中文。
- 未新增其它 `view_image` key；模型侧工具文本不重复收录，避免双份口径。

---

## 五、规则同步（工程法案 §二.14）

在 `角色卡/项目管理/docs/project-rules.md` §二「已确认要求」末尾新增**第 14 条「图片证据-01：角色可查看项目内图片证据（`view_image`），两轮附件送达」**（客户要求）：

- **能力**：角色可通过 `view_image` 读取**项目内**图片作为查看证据；工具只读，不写文件、不执行命令、不读取项目外路径。
- **两轮附件**：图片内容不进入本轮工具结果，排队为**下一轮用户提示的图片附件**送达**同一角色**；本轮只确认「已读取并排队」，模型**不得假装本轮已看到**。
- **fail-closed**：路径不在项目内（绝对路径、`..` 逃逸、符号链接、非普通文件）、真实类型不受支持、超过大小上限、读取或排队失败时，工具如实返回失败且**不提供图片**；不得占位/伪造、不得部分排队。
- **注册条件**：图片查看能力未注入时**不注册**该工具。
- **范围**：不新增角色、不新增 `FlowStepKind`；`view_image` 是运行时公共工具，不改变任何角色的文件写权；实现/接线/验证由对应属主负责并各自验收。

第 1–13 条原文保留、未重排未删改。**架构文档未改**：本次不新增角色、`FlowStepKind` 或层结构；`view_image` 属运行时公共工具能力，规则登记在工程法案即可，`docs/architecture.md` 无需变更。

---

## 六、验证计划与实跑结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约（必跑） | `node --test "test/项目管理/shared/i18n.test.ts"` | **59 tests / 59 pass / 0 fail / 0 skipped**，exit 0（较上批 56 例新增 3 个 view_image 用例） |
| 共享测试套件（本组，最终复跑） | `node --test "test/项目管理/shared/**/*.test.ts"` | **206 tests / 201 pass / 0 fail / 5 skipped**，exit 0 |
| 硬编码中文守卫（最终复跑） | 同上（`i18n-guard.test.ts`） | `[i18n-guard] scanned=126 allowlisted=21 violations=0`；本批按分类新增 `app/desktop/view-image.ts` 条目（详见 §七.1），未改扫描器、未放宽断言 |
| 类型检查（必跑） | `npm run typecheck` | **本批写集文件无诊断**；批次中期一次全仓运行 exit 0；**最终复跑 exit 1**，错误**全部**在其他角色并发在飞的 `view_image` 接线文件（`app/desktop/interface.ts` 与 `test/桌面应用/*`、`test/测试/*` 夹具：桌面本地 `ViewImageFn` 契约 `request.images` vs `src/model/runtime.ts` 的 `ViewImageInput.image`，见 §七.1）——本批未修改这些文件，不把其失败计入本批通过 |
| 自检：zh/en key 齐全与 parity | 目录脚本 + 同一 i18n 套件 | zh 1368 / en 1368 key，无缺失、无多余、无重复；目录 parity 断言通过 |
| 自检：无重复 key | 同上 | 无重复 key；TS 对象字面量重复键会使编译失败 |
| 自检：无既有 key 误删 | `git diff --numstat` | `zh-CN.ts` +13/−0、`en-US.ts` +15/−0，**纯新增**；既有 key 未删除、文案未改 |

**测试契约说明**：新增用例断言 `main.viewImage.queued` 的「下一轮 / 图片附件 / 本轮尚未看到图片内容 / 不要假装本轮已看到」、`main.viewImage.failed` 的「未提供图片」、三个 key 的占位符（`{path}` / `{detail}` / `{path}`）zh/en 一致，以及 en-US 不含中文；后续改词必须显式更新测试，属有意契约变更。

**未跑**：全量回归（全仓测试）、真实 Electron、`view_image` 工具/附件投递的集成与 e2e、独立验收。本记录不构成验收结论。

---

## 七、未做与风险

1. **工具实现/接线由其他角色并发在飞，本批未验证**：只读核对时，`src/model/runtime.ts` 已增 `PromptImage`/`ViewImageInput`/`ViewImageFn` 与 `GovernedToolsOptions.viewImage?`（未注入不注册）；`src/provider/runtime/tools.ts` 已增 `VIEW_IMAGE_TOOL_NAME`、`VIEW_IMAGE_MAX_BYTES`（10 MB）与 `makeViewImageTool`（路径句法/realpath 根内/普通文件/扩展名/大小/回读字节复核/能力回执 fail-closed）；`src/common/门禁引擎/governance-roles.ts` 已增主理/统筹/验收角色卡的 `view_image` 两轮纪律文本；`app/desktop/view-image.ts`（桌面窗口新文件）已增 `buildViewImagePrompt` 与投递能力。上述均为**其他角色未提交的在飞改动**，本批未修改、未运行其测试、未验证/验收。
   - **并发接线存在类型不一致（最终 typecheck exit 1）**：`app/desktop/view-image.ts` 的本地 `ViewImageFn` 契约用 `request.images: PromptImage[]`，而 `src/model/runtime.ts` 的 `ViewImageInput` 用单数 `image: PromptImage`，导致 `app/desktop/interface.ts` 与多个桌面/测试夹具报 `viewImage` 类型不兼容（本批文件无诊断）。这是**接线方之间的契约漂移**，须由运行时核心/桌面窗口属主按「类型从契约家只读导入、不保留第二份」收口；本批只登记、不代改。
   - **i18n 守卫分类**：`app/desktop/view-image.ts` 去除注释后仍含中文——仅为下一轮用户提示的 **agent-facing 图片提示文本**（`buildViewImagePrompt`，发给模型）与投递失败/非法载荷回执（tool output，交工具层转达模型），**无用户可见 UI 文案**（用户可见回执/附件标签已入共享目录 `main.viewImage.*` / `ui.viewImage.attachmentLabel`）。按既有分类规则（classification §4）由项目管理在 `test/项目管理/shared/i18n-guard-allowlist.ts` 登记条目并写明理由；未改扫描器、未放宽断言。若桌面属主后续移走这些中文，条目会因「已无中文」被守卫判陈旧，须由项目管理移除。
2. **新 key 尚无消费方**：本批结束时 `app/**`/`src/**` 产品代码未引用 `main.viewImage.queued` / `main.viewImage.failed` / `ui.viewImage.attachmentLabel`（预期）。消费方（主进程回执、渲染层附件标签）接线前，缺参会保留占位符并产生 `i18n.missing-param`。
3. **附件投递机制未验证**：`ViewImageFn` 的排队实现（下一轮用户提示附图）由运行时/会话属主实现；若同一轮就展示图片、或下一轮未送达附件，即违反两轮设计。本批只冻结文案与行为规则，无法验证投递链路。
4. **具体限额不在本批契约内**：在飞实现取 10 MB 与 `.png/.jpg/.jpeg/.webp/.gif`；本批规则只要求「大小上限、真实类型 fail-closed」，具体数值由实现属主决定与验证；若实现漏掉 realpath 根内复核或回读字节复核，即违反第 14 条。
5. **并发工作树**：本批与其他角色的 `view_image` 在飞改动共享同一工作树；批次中期曾一次 `npm run typecheck` exit 0，但**最终复跑为 exit 1**，错误全部来自接线方之间的契约漂移（`app/desktop/view-image.ts` 的 `request.images` vs `src/model/runtime.ts` 的 `ViewImageInput.image`）及其引用的 `app/desktop/interface.ts`/测试夹具；本批写集文件无诊断。不能据此声称其他角色实现可编译/可运行，最终验证必须在属主完成后的候选上复跑。
6. **授权沟通原文不在工作树**：见文首说明；若独立验收要求原始客户沟通文件，需由主控/治理补齐，本记录不以任务转达冒充客户沟通原文。
7. **未 commit/push/重启**：工作区改动保留未提交；应用未重启；`demos/` 未触碰。

---

## 八、本批写集

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`（本角色边界 Section 1 授权的共享组件测试目录；分区计数 786/514/1365 → 787/516/1368，新增 3 个 view_image 契约用例）
- `test/项目管理/shared/i18n-guard-allowlist.ts`（新增 `app/desktop/view-image.ts` 分类条目：agent-facing 提示/回执，非用户可见 UI；未改扫描器）
- `角色卡/项目管理/docs/change/2026-10-26_change_view-image-tool.md`（本文件）
- `角色卡/项目管理/docs/project-rules.md`

未触碰：`app/**`、`src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、边界/角色卡、其他角色资料、`package.json`/`tsconfig*`、`demos/`（其中 `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/common/门禁引擎/governance-roles.ts` 的在飞改动属其他角色，本批只读）。
