# 变更记录：view_image 同轮附图优先 + 下一轮回退角色卡文本同步（Proof / Steward / Lead）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-27
- 角色：门禁引擎（Gate Engine）
- 任务：按设计 `角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md` 的推荐方案（工具结果同轮附图优先、下一轮附件回退），同步 Proof / Steward / Lead 的 `view_image` 角色卡文本与测试（lead-governance-coordination；门禁引擎任务）
- 依据：
  - 客户 2026-10-27 要求“同轮看图修复”：工具调用后，模型紧接着的下一次调用即可看到图片，不等角色整轮结束。
  - 设计文档推荐方案 A：`ToolResult.images` 同轮工具结果附图；Pi 先行，Claude / Codex / demo 在探针通过前 `next-turn` 回退；同轮模式不产生队列 / 系统行；回退保留下一轮附件并批量合并。
  - 运行时核心已在工作树内开始实现契约（`RUNTIME_VIEW_IMAGE_POLICY` 初始全部 `next-turn`）；本批只依据该契约更新卡文本，不改工具实现。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `LIAISON_CARD_TEXT` / `CONVENER_CARD_TEXT` / `VERIFIER_CARD_TEXT` 产品数据文本与文件头注、`test/门禁引擎/view-image-cards.test.ts`（改写）、本角色 changelog / memo / feature-map 与本变更记录。未改 `src/provider/**`、`src/model/**`、`app/desktop/**`、共享 i18n、PM 文档、`src/common/编排/**`、`src/pipeline/**` 或 `demos/`；未 commit / push；未重启应用；未跑真实 Electron / 浏览器。

## 1. 写前核对与基线

- `git rev-parse --short HEAD` = `99bbbe2`（分支 `feat/scaffold-first-governance`，worktree `lead-governance-coordination`）。
- 写前本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **347 计 / 346 过 / 0 失败 / 1 Windows 既有 skip**。
- 写前卡文本与测试均为 2026-10-26“两轮附件”绝对口径（`VERIFIER_CARD_TEXT` 章节标题与正文、标准工作流第 4 步、Gate 复核第 2 步、质量职责；Steward / Lead 的「画面证据」条目）。
- 写后候选哈希（`git hash-object` / `sha256sum`；后续仅改本角色文档不改变下列代码 / 测试候选）：
  - `src/common/门禁引擎/governance-roles.ts` = `4f94eead8009948fc7b9cc9cf6eb388230ebde79` / `607ff17d58430bf962ad63faa92687339968933cd9c673e21ca9466f84fe6d20`
  - `test/门禁引擎/view-image-cards.test.ts` = `bbb2ec663dc6160a26a1b517a80dd576240229e7` / `095eedb58e314a70794a1afdb6903186180edae7c35145a1ffb837b256cdc10d`

## 2. 新旧语义差异（三张卡共同）

| 维度 | 旧口径（2026-10-26） | 新口径（2026-10-27） |
| --- | --- | --- |
| 交付方式 | **两轮附件**：`view_image` 本轮只回「已排队」，图片下一轮才提供 | **同轮附图优先，下一轮回退**：工具结果返回图片时模型应直接查看并据此判断；引擎不支持同轮时回退为下一轮用户提示附件 |
| 排队回执 | 收到排队回执后等下一轮图片附件再判断 | **排队回执不算已看**；回退时等图片附件到达再判断 |
| 不得假看 | 图片尚未提供时不得假装已看 | **图片尚未提供 / 未返回时不得假装已看**（同轮与回退都适用） |
| 章节标题 | `## 图片证据核对（view_image，两轮附件，必须）` | `## 图片证据核对（view_image，必须）`（标题不再断言单一交付方式） |
| 保留要求 | — | 必须对项目内证据图片调用 `view_image`、不得只凭文件名 / 摘要 / 文件存在下结论、UI / 游戏截图必须关闭 DEBUG 覆盖层、看到的内容与文件哈希（sha256）/ 候选版本 / flow revision 一起记录、工具不可用 / 未收到图片时如实写 `insufficient evidence`、不得用「文件存在」冒充看过图 |

- 不新增角色、`FlowStepKind`、cardKind、能力位或写权；不改变任何判定逻辑；卡文本不写具体引擎实现承诺。
- 运行时同轮交付**尚未启用**（`RUNTIME_VIEW_IMAGE_POLICY` 初始全部 `next-turn`）；本批后客户可见行为仍是下一轮附件，卡文本提前对齐目标语义。

## 3. `VERIFIER_CARD_TEXT`（Proof / 验收）

- 章节标题改为 **「## 图片证据核对（view_image，必须）」**。
- **交付语义**改为「同轮附图优先，下一轮回退」：工具结果返回图片（同轮附图）时，模型应直接查看图片并据此判断；当前引擎不支持同轮时回退为下一轮用户提示附件；**排队回执不算已看**，图片尚未提供 / 未返回时不得假装已看，不得在排队回执上判 pass / fail，也不得把排队回执写成已看过图片；回退时等图片附件到达后再判断。
- 「图片附件到达后才核对」改为「**看到图片（同轮附图或下一轮附件）后才核对**」；DEBUG 覆盖层 / 旧候选截图 / 无法确认图片对应当前候选 ⇒ `insufficient evidence` 的口径保留。
- 记录要求保留并适配：看到的内容与文件哈希（sha256）、候选版本 / flow revision、**图片来源路径（同轮附图 / 下一轮附件）**一起记录；只写「已看图」不算核对。
- 「工具不可用 / 回执失败 / 未收到图片（同轮未返回，或回退时下一轮未收到附件）」⇒ 如实写 `insufficient evidence`；不得用「文件存在」冒充看过图。
- 同步指针：标准工作流第 4 步改为「同轮附图直接核对、回退时等附件到达」；Gate 复核第 2 步改为「同轮附图（工具结果返回图片）直接核对；回退为下一轮附件时等附件到达再判断」；质量职责条目改为「`view_image` 图片纪律（同轮附图优先、下一轮回退）」。
- 既有 gate 复核 / 验收 / 分诊 / DEBUG / 预授权 / 禁写规则逐字保留。

## 4. `CONVENER_CARD_TEXT`（Steward / 统筹，简短）

- 「画面证据（view_image，必须）」改为：需要核对截图 / 录屏画面时调用 `view_image`（**同轮附图优先**：工具结果返回图片时直接查看；**回退**为下一轮附件时，**排队回执不算已看**，**附件到达前不下画面结论**）；**不得把「截图路径存在」说成「已核对画面」**。
- 既有分工逐字保留：只做证据完整性检查、只判「齐不齐」、**不对画面 / 实现质量下结论**、不自审 / 不代写 gate 报告。

## 5. `LIAISON_CARD_TEXT`（Lead / 主理，简短）

- 「画面证据（view_image，必须）」改为：需要核对截图 / 录屏画面时调用 `view_image`（**同轮附图优先**：工具结果返回图片时直接查看并据此判断；**回退**为下一轮附件时，**排队回执不算已看**，**附件到达前不下结论**）；**不得把「存在截图」说成「已核对画面」**；本条不改变「系统消息只汇报、不派任务」规则。
- 既有「系统消息只汇报、不派任务（必须）」、客户消息路径、治理协调 / 决策纪律、写权与禁写逐字保留。

## 6. 测试

- 改写 `test/门禁引擎/view-image-cards.test.ts`（仍为 5 例，全部卡文本数据面断言）：
  1. Proof 双语义：章节标题、触发面、同轮附图直接判断、回退下一轮用户提示附件、排队回执不算已看、未提供 / 未返回不得假装已看、不得判 pass / fail；标准工作流 / Gate 复核 / 质量职责三处指针同步。
  2. Proof 安全检查保留：看到图片（同轮或回退附件）后才核对、UI / 游戏关 DEBUG、旧候选 / DEBUG 覆盖层 ⇒ `insufficient evidence`、记录内容 + 文件哈希（sha256）+ 候选 / flow revision + 图片来源路径、只写「已看图」不算核对、工具不可用 / 未收到图片写 `insufficient evidence`、不得用「文件存在」冒充；反向断言拒绝「文件存在即视为已看图」等肯定式表述。
  3. Steward 简短规则（同轮优先 / 下一轮回退、不得把「截图路径存在」说成「已核对画面」、质量仍只由 Proof 判）；分工保留。
  4. Lead 简短规则（同轮优先 / 下一轮回退、不得把「存在截图」说成「已核对画面」、系统消息规则不变）；系统消息纪律保留。
  5. 规则只落在 Lead / Steward / Proof 三卡；注册表数据面（entries / 预授权 / 能力位 / 角色顺序）零变化；并对三卡统一做旧绝对表述反向断言。
- **反向禁止**的旧绝对表述：`两轮附件`、`**本轮只回「已排队」**`、`图片在**下一轮以附件提供**`、`收到排队回执后**等下一轮图片附件再判断**`、`**两轮附件语义**`、`view_image，两轮附件`、`view_image 两轮纪律`。
- 未修改其他既有测试文件；未删除或放宽原有安全检查断言。

## 7. 验证结果（本批写后）

- 定向：`node --test "test/门禁引擎/view-image-cards.test.ts"` ⇒ **exit 0，5 计 / 5 过 / 0 失败 / 0 skip**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **exit 0，347 计 / 346 过 / 0 失败 / 1 Windows 既有 skip**（与写前同数：5 例为改写而非新增）。
- `npm run typecheck` ⇒ **exit 0，0 诊断**。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 8. 未做 / 依赖其他角色 / 残余风险

- **本批只改角色卡文本与测试，不改工具实现**：`view_image` 的同轮附图契约（`ToolResult.images` / `ViewImageReceipt.mode` / `RUNTIME_VIEW_IMAGE_POLICY`）及适配器映射由运行时核心 / Pi / Claude / Codex 适配器角色实施；运行时同轮交付尚未启用，行为仍是下一轮附件。卡文本是行为约束，不是实现证据。
- **旧“两轮”文案仍存在于本角色边界外**（本批未改、按约束只读）：`src/model/runtime.ts` 注释、`src/provider/runtime/{tools,schema}.ts` 文案与注释、`test/runtime-core/view-image-tool.test.ts`、`test/编排/view-image.test.ts`、`test/项目管理/shared/i18n.test.ts`、`角色卡/项目管理/docs/project-rules.md` §二.14、`角色卡/编排/docs/design/2026-10-26_*` 历史设计、`demos/` 文档。以上须由各自属主按设计 §8.1/§8.2 的 Gate 0–2 同步；在本角色边界内，旧 `docs/change/2026-10-26_change_view-image-cards.md` 与 changelog / memo 历史条目保留为历史记录，不覆盖。
- 模型是否遵从（同轮附图直接判断、回退时等附件、不把排队回执当已看）无机械保证；图片是否对应当前候选、是否关 DEBUG 仍依赖 Proof 判断与证据记录，门禁层不解析图片。
- 若运行时契约或工具回执文案最终变化（例如同轮模式不产生队列 / 系统行、回退批量合并），须同批回改卡文本与本批测试。
- 未 commit / push、未重启应用、未触碰 `demos/`。
