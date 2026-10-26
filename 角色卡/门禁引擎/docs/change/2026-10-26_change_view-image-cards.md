# 变更记录：view_image 图片证据两轮纪律角色卡文本（Proof 必看；Steward / Lead 简短规则）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-26
- 角色：门禁引擎（Gate Engine）
- 任务：为新增的 `view_image` 工具补角色卡使用规则（lead-governance-coordination；门禁引擎任务）
- 依据：
  - 客户 / 任务规则（经任务派发转达）：运行时新增 `view_image` 工具，**两轮附件**——工具**本轮只回「已排队」**，图片在**下一轮以附件提供**。
  - Proof / 验收：gate / 验收需要看真实截图 / 录屏时，**必须对项目内证据图片调用 `view_image`**；工具回执后**等下一轮图片附件再判断**，**不得在图片尚未提供时假装已看**；UI / 游戏截图仍要求关闭 DEBUG；看到的内容与文件哈希 / 候选一起记录；工具不可用时如实写 `insufficient evidence`，不用文件存在冒充看过。
  - Steward / 统筹、Lead / 主理（可选、简短）：需要核对画面证据时使用 `view_image`，**不得把「存在截图」说成「已核对画面」**；Lead 的「系统消息只汇报」规则不变。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `LIAISON_CARD_TEXT` / `CONVENER_CARD_TEXT` / `VERIFIER_CARD_TEXT` 产品数据文本与文件头注、`test/门禁引擎/view-image-cards.test.ts`（新）、本角色 changelog / memo / feature-map 与本变更记录。未改 `src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/pipeline/**`、`app/**`、共享 i18n、桌面 / 模型实现或 `demos/`；未 commit / push；未重启应用；未跑真实 Electron / 浏览器。

## 1. 写前核对与基线

- `git rev-parse HEAD` = `5d21fd89db7667d27e4a411a5d0a831a384990c7`（分支 `feat/scaffold-first-governance`）。
- `node --version` / `npm --version` = v24.22.1 / 11.19.1。
- 工作树已有 gate review / decision 卡改动，本批只在其上**增量**修改本角色文件，未回退任何既有批次。
- 写前基线：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **335 计 / 334 过 / 0 失败 / 1 Windows 既有 skip**。
- 写后候选哈希（`git hash-object` / `sha256sum`；后续仅改本角色文档不改变下列代码 / 测试候选）：
  - `src/common/门禁引擎/governance-roles.ts` = `e58da52863efd581b2e9b1d99b3f861c0ae0155b` / `bc7e40f4af94761d34c287670fceea17bcfb422237c4c698d9d873f28a2cb655`
  - `test/门禁引擎/view-image-cards.test.ts` = `01c41293f5a9f7997a1e1b5cd27641addccd2a47` / `67ff1aa15ec3c270f9ea3e3a9a6e90d1148b64d468a253ead6a917f86fa71183`

## 2. `VERIFIER_CARD_TEXT`（Proof / 验收）

- 新增 **「## 图片证据核对（view_image，两轮附件，必须）」** 章节（位于「Gate 复核（gate 任务，必须）」之后、`STANDARD_WORKFLOW_PRINCIPLE` 之前）：
  - **触发面**：gate 复核 / 验收需要看真实截图 / 录屏画面时，**必须对项目内证据图片调用 `view_image`**（传项目相对证据路径），不得只凭文件名 / 摘要 / 文件存在就下结论。
  - **两轮附件语义**：`view_image` **本轮只回「已排队」**，图片在**下一轮以附件提供**；收到排队回执后**等下一轮图片附件再判断**——**图片尚未提供时不得假装已看**，不得在排队回执上判 pass / fail，也不得把排队回执写成已看过图片。
  - **附件到达后才核对**：**UI / 游戏截图仍必须关闭 DEBUG 覆盖层**；DEBUG 覆盖层 / 旧候选截图 / 无法确认附件对应当前候选 ⇒ `insufficient evidence`（按 fail 处理，不通过）。
  - **记录**：把看到的内容（布局 / 像素 / 缩放 / 可读性 / 错误态等）与文件哈希（sha256）、候选版本 / flow revision、附件来源路径一起写进 gate 报告或验收报告的证据出处；只写「已看图」而不写看到什么不算核对。
  - **工具不可用 / 回执失败 / 下一轮未收到附件**：如实写 `insufficient evidence`（列出缺哪张图、由谁补），**不得用「文件存在」冒充看过图**；未看到画面不得判 pass。
- 同步指针（不只藏在新章节）：
  - 标准工作流第 4 步「真实启动/演示证据」：需要看截图 / 录屏画面时按该章节调用 `view_image`，不得只看文件存在。
  - 「Gate 复核」第 2 步「UI / 游戏视觉核对」：项目内证据图片按该章节调用 `view_image` 并**等下一轮图片附件后再判断**。
  - 「你的质量职责（Proof / 验收）」新增 `view_image` 两轮纪律条目（含不得假看、记录哈希 / 候选、工具不可用写 `insufficient evidence`、DEBUG 覆盖层口径）。
- 既有 gate 复核 / 验收 / 分诊 / DEBUG / 预授权 / 禁写规则逐字保留；`request_acceptance` 仍不在 Proof 卡。

## 3. `CONVENER_CARD_TEXT`（Steward / 统筹，简短）

- 「证据完整性与 gate 协调（必须）」新增 **「画面证据（view_image，必须）」** 段：需要核对截图 / 录屏画面时，对项目内证据图片调用 `view_image`（**两轮附件**：本轮只回「已排队」，图片在下一轮以附件提供，**附件到达前不下画面结论**）；**不得把「截图路径存在」说成「已核对画面」**——文件存在只是证据完整性，画面 / 实现质量仍只由 Proof 的 gate 复核判定。
- 既有分工逐字保留：统筹只做证据完整性检查、只判「齐不齐」、**不对画面 / 实现质量下结论**、不自审 / 不代写 gate 报告。

## 4. `LIAISON_CARD_TEXT`（Lead / 主理，简短）

- 「治理协调（Lead / 主理）」新增 **「画面证据（view_image，必须）」** 条目：需要核对截图 / 录屏画面时，对项目内证据图片调用 `view_image`（**两轮附件**：本轮只回「已排队」，图片在下一轮以附件提供，**附件到达前不下结论**）；**不得把「存在截图」说成「已核对画面」**；本条不改变「系统消息只汇报、不派任务」规则。
- 既有「系统消息只汇报、不派任务（必须）」、客户消息路径、治理协调 / 决策纪律、写权与禁写逐字保留。

## 5. 测试

- 新增 `test/门禁引擎/view-image-cards.test.ts`（5 例，全部卡文本数据面断言）：
  1. Proof 必须对项目内证据图片调用 `view_image`；两轮语义（本轮「已排队」→ 下一轮附件）；**图片尚未提供时不得假装已看**、不得据此判 pass / fail；标准工作流与 gate 复核两处指针同步。
  2. Proof 附件到达后仍须关 DEBUG；看到的内容 + 文件哈希（sha256）+ 候选 / flow revision 一起记录；工具不可用 / 未收到附件时写 `insufficient evidence`、**不得用「文件存在」冒充看过图**；另加「文件存在即视为已看图」等肯定式表述的反向断言。
  3. Steward 简短规则（两轮、不得把「截图路径存在」说成「已核对画面」、质量仍只由 Proof 判）；既有「只做证据完整性检查 / 不对画面质量下结论」保留。
  4. Lead 简短规则（两轮、不得把「存在截图」说成「已核对画面」、本条不改变系统消息规则）；「系统消息只汇报、不派任务」逐字保留。
  5. 规则只落在 Lead / Steward / Proof 三卡（Draft / Crew 卡不定义）；注册表数据面（entries / 预授权 / 能力位 / 角色顺序）零变化。
- **未修改任何既有测试文件、未删除或放宽既有断言**。

## 6. 验证结果（本批写后）

- 定向：`node --test "test/门禁引擎/view-image-cards.test.ts"` ⇒ **exit 0，5 计 / 5 过 / 0 失败 / 0 skip**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **exit 0，340 计 / 339 过 / 0 失败 / 1 Windows 既有 skip**（基线 335/334/0/1，本批 +5 例）。
- `npm run typecheck` ⇒ **exit 0，0 错**。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 7. 未做 / 依赖其他角色 / 残余风险

- **卡文本是行为约束，不是实现证据**：`view_image` 的运行时实现（排队回执、下一轮附件投递、附件与路径 / 哈希的对应）由运行时核心 / 编排 / 桌面角色实施，本批未修改、未验证；工具名 / 参数形态若与卡文本不一致，须同批回改卡文本与本批测试。
- 「本轮只回已排队、下一轮附件」是任务给定的工具语义；若实现改为同步返回图片，卡文本与测试须由属主同批更新——不能在未改工具语义时单方面弱化「不得假装已看」纪律。
- 模型是否遵从（先排队、等附件再判断、不把文件存在当看过）无机械保证；附件是否对应当前候选 / 是否关 DEBUG 仍依赖 Proof 判断与证据记录，门禁层不解析图片。
- Steward / Lead 的简短规则与其「不做实质性复核 / 系统消息只汇报」边界一致；若后续要求统筹用 `view_image` 做质量判断，须另批修改分工，不在本批范围。
- 未 commit / push、未重启应用、未触碰 `demos/`。
