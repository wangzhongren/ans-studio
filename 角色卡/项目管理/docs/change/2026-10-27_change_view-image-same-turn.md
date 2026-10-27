# 变更记录：`view_image` 同轮工具结果附图优先、下一轮附件回退（项目管理）

- **任务**：客户 2026-10-27 要求「同轮看图修复」并已选择安排修复——项目管理负责修订生效工程法案 §二.14、共享 i18n 文案与契约测试、本变更记录
- **记录角色**：项目管理（项目协调组）；本记录只写本角色边界内文件
- **日期**：2026-10-27
- **状态**：**文档与共享 i18n 已改、未实施、未验证、未验收**。工程法案 §二.14 已就地修订；共享 i18n 新增 `main.viewImage.sameTurn` 并保留 `main.viewImage.queued` 为下一轮回退文案；i18n 契约测试与计数已同步并通过。**同轮看图本身未实现**：运行时核心/适配器/桌面窗口/门禁引擎不在本批写集，当前产品实现仍为两轮附件（`queued`）。
- **授权依据**：客户 **2026-10-27** 明确要求「同轮看图修复」，并已选择安排修复（经主控任务转达）。工作树内未见对应 `docs/communication/**` 客户沟通原文，本记录以任务转达的客户要求为准，**不伪造沟通文件**。
- **设计依据**：`角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md`（编排角色设计稿；推荐方案 A：`view_image` 工具结果同轮附图，Pi 先行，Claude/Codex/demo 探针前回退）。
- **基线身份**：worktree `lead-governance-coordination`，分支 `feat/scaffold-first-governance`，HEAD `99bbbe2`；工作树中承接了其他角色 `view_image` 的在飞改动（本批只读，未修改）
- **环境**：Windows 11 / Git Bash；Node `v24.22.1`

---

## 一、客户要求与授权

客户 2026-10-27 明确要求「**同轮看图修复**」，并已选择安排修复。问题现状（设计 §一）：

1. `view_image` 原为**两轮附件**——工具本轮只回「已排队」，图片作为**下一轮用户提示**排队；角色在本轮看不到图片。
2. 长任务中一次角色轮次内多次 `view_image` 会生成多条独立队列消息，核对画面被严重延迟。
3. 客户要求工具调用后**紧接着的下一次模型调用**就能看到图片，而不是等角色整轮结束。

由此，生效工程法案 §二.14 原「图片内容不进入本轮工具结果、排队为下一轮用户提示图片附件」的**硬规则**必须修订；本次修订即 Gate 0 的规则侧动作，**不等于实施授权本身**，也不声称同轮看图已实现。

---

## 二、规则变化（§二.14 新旧差异）

**旧标题**：图片证据-01：角色可查看项目内图片证据（`view_image`），两轮附件送达（2026-10-26，客户要求）。

**新标题**：图片证据-01：角色可查看项目内图片证据（`view_image`），**同轮工具结果附图优先、下一轮附件回退**（客户 2026-10-27）。

| 维度 | 旧规则（2026-10-26） | 新规则（2026-10-27） |
| --- | --- | --- |
| 送达方式 | **两轮附件**：图片不进入本轮工具结果，排队为下一轮用户提示的图片附件 | **同轮工具结果附图优先**：图片作为本轮工具结果的图片内容，同一模型轮次的下一次调用即可看到；不支持时回退下一轮附件 |
| 本轮工具结果 | 只回「已读取并排队（下一轮以附件提供）」 | 同轮模式回执写明「图片已随本工具结果附上（同一轮可见）」；未包含图片须如实说未看到，不得假装 |
| 队列 / 系统行 | 每图一条系统投递（现状） | 同轮模式**零队列项、零系统行、零伪客户消息**；回退模式同角色同轮多图合并为**一条** `background:true` + `kind:"system"` 投递，轮末送达，跨轮不合并 |
| 引擎策略 | 无（一律两轮） | 运行时核心**逐引擎 policy 单一来源**；初始落地四个运行时全 `next-turn`；Pi 先行（SDK 已核实、图像管线待探针），Claude/Codex 真实探针通过前保持 `next-turn`，demo/未知运行时 `next-turn`；探针失败即保持/回退 |
| fail-closed | 路径/类型/大小/读取/排队失败 → 如实失败且不提供图片 | **保留并扩展**：新增每轮预算上限、能力回执与 policy 不一致、投递失败；不得部分交付/部分排队；失败/中止/未映射不得出现「已看到」的肯定表述 |
| 审计 | 未规定 | 只记录结构化事实（项目相对路径/MIME/字节数/交付方式/原因码）；**图片字节、base64、`data:` URL 不入**日志、诊断、事件、ANS 回放；原生历史体积如实登记 |
| 注册条件 | 能力未注入不注册 | **不变**（能力未注入不注册，不提供假装可用的壳） |
| 范围 | 不新增角色、`FlowStepKind`；不改变文件写权 | **不变并明确**：不新增角色、`FlowStepKind`、cardKind；不改变任何角色文件写权；不声称同轮看图已实现或已验证 |

第 1–13 条与第 15 条原文保留、未重排未删改；§一/§三/§四 未改。

---

## 三、共享 i18n key 契约（4 个，zh-CN/en-US 同 key、同占位符）

`zh-CN.ts` 仍是 key 全集来源；`en-US.ts` 经 `satisfies Record<MessageKey, MessageTemplate>` 编译期强制齐全。**本批新增 1 个 key、未改既有 3 个 key 文案**。

| # | key | zh-CN | en-US | 占位符 | 语义/用途 |
| --- | --- | --- | --- | --- | --- |
| 1 | `main.viewImage.sameTurn`（新增） | 已读取项目图片 {path}；图片已随本轮工具结果附图提供（同一轮可见），现在可直接查看并判断。若你的上下文未包含图片，请明确说明未看到，不要假装已看到。 | Read project image {path}; the image is attached to this turn's tool result (visible within the same turn), so you can view and judge it now. If your context does not include the image, state clearly that you have not seen it — do not pretend you have. | `{path}` | 同轮附图成功回执：同一轮内可直接查看判断；上下文未包含图片必须如实说未看到 |
| 2 | `main.viewImage.queued`（保留） | 已读取项目图片 {path} 并排队：下一轮将以图片附件提供（随下一轮用户提示送达）；本轮你尚未看到图片内容，不要假装本轮已看到。 | Read project image {path} and queued it: it will be provided as an image attachment with the next user prompt; you have not seen the image content this turn — do not pretend you have. | `{path}` | **next-turn 回退文案**（逐字未改）；回退引擎本轮未看到、不得假装 |
| 3 | `main.viewImage.failed`（保留） | 读取或排队项目图片失败（{detail}）；未提供图片。 | Failed to read or queue the project image ({detail}); no image was provided. | `{detail}` | 失败回执：fail-closed，未提供图片 |
| 4 | `ui.viewImage.attachmentLabel`（保留） | view_image 附件：{path} | view_image attachment: {path} | `{path}` | 回退路径下一轮用户提示中图片附件的展示标签 |

**消费口径**：运行时核心/桌面回执按上述 key 取词——同轮成功用 `main.viewImage.sameTurn`，回退排队用 `main.viewImage.queued`，失败用 `main.viewImage.failed`；缺参会保留占位符并产生 `i18n.missing-param` 诊断。工具直接发给模型的 agent-facing 文本仍按既有分层不入共享目录（`app/desktop/view-image.ts` 的 allowlist 条目不变）。

---

## 四、未实施事实（如实登记）

1. **运行时核心未改**：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts` 均未修改；`ToolResult.images` / `ViewImageDeliveryMode` / `RUNTIME_VIEW_IMAGE_POLICY` 等契约未落地，当前实现仍只回文本并走桌面排队。
2. **适配器未改**：Pi/Claude/Codex 未做工具结果图片映射；**未做任何真实端到端探针**（Pi 图像管线、Claude MCP `tool_result` 转发、Codex 0.162.1 `inputImage` data URL 均未实测）。
3. **桌面窗口未改**：`app/desktop/view-image.ts` 与 `app/desktop/session.ts` 未修改，仍为逐图排队；回退批量合并未实现。
4. **门禁引擎角色卡未改**：Proof/Steward/Lead 的「两轮附件」纪律文本未修改；同轮/回退措辞待其属主按设计 §8.1 实施。
5. **编排仅设计**：`run-role.ts` 未改（设计判断无需改透传逻辑）。
6. **不声称**：同轮看图**未实现、未验证、未验收**；本批不构成实施授权、不替代独立验收。
7. **未 commit/push**；未重启应用；未触碰 `C:/Users/51054/Downloads/pixel-roguelike` 与 `demos/`。
8. **未新增**角色、`FlowStepKind`、cardKind；未改变任何角色文件写权。

---

## 五、验证与实跑结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| i18n 契约（本批必跑） | `node --test "test/项目管理/shared/i18n.test.ts"` | **62 tests / 62 pass / 0 fail / 0 skipped**，exit 0 |
| 共享组件套件（本组） | `node --test "test/项目管理/shared/**/*.test.ts"` | **209 tests / 204 pass / 0 fail / 5 skipped**，exit 0（含 i18n 守卫；messages 目录在守卫排除前缀内） |
| 类型检查 | `npm run typecheck` | **exit 0**（全仓无诊断；`en-US.ts` key 齐全性由 `Record<MessageKey, MessageTemplate>` 编译期校验） |

**测试契约同步**：`VIEW_IMAGE_KEYS` 由 3 个扩为 4 个（`main.viewImage.*` 2→3 + `ui.viewImage.*` 1）；分区计数 `main` 529→530、总 key 1386→1387（`prefixes.main - B0 = 524→525`，ui 不变）；新增 `sameTurn` 语义断言（zh：随本轮工具结果 / 同一轮 / 可直接查看 / 不要假装；en：this turn's tool result / same turn / view and judge / do not pretend）与逐字插值断言；en-US 不含中文、占位符 zh/en 一致仍由既有循环断言覆盖。后续改词必须显式更新测试，属有意契约变更。

**未跑**：运行时/适配器/桌面/编排/门禁测试、真实 Electron e2e、真实引擎探针、全量回归、独立验收。本记录不构成验收结论。

---

## 六、本批写集

- `src/common/shared/i18n/messages/zh-CN.ts`（新增 `main.viewImage.sameTurn`；更新 `main.viewImage.*` 注释为同轮优先/回退语义）
- `src/common/shared/i18n/messages/en-US.ts`（同上，en-US 无中文）
- `test/项目管理/shared/i18n.test.ts`（4 key 契约、计数 1387、sameTurn 语义与插值断言）
- `角色卡/项目管理/docs/project-rules.md`（§二.14 就地修订 + 文末变更记录条目）
- `角色卡/项目管理/docs/change/2026-10-27_change-view-image-same-turn.md`（本文件）

未触碰：`app/**`、`src/model/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、其他角色资料、角色卡/边界、`package.json`/`tsconfig*`、`demos/`。

---

## 七、风险与后续

1. **文案先于实现**：`main.viewImage.sameTurn` 暂无产品消费方；消费方接线前，若被提前取词渲染，属正常 i18n 契约，不代表同轮已生效。
2. **引擎启用有门槛**：新规则只允许「探针通过后逐引擎翻 `tool-result`」；在 policy 全 `next-turn` 时实现仍是两轮附件，符合规则。任何引擎探针失败都保持回退，不影响其他引擎。
3. **探针环境依赖**：Claude/Codex 真实探针可能需要账号/模型调用，需客户/项目提供受控环境；无法提供时相应引擎保持回退。
4. **历史记录保留**：`docs/change/2026-10-26_change_view-image-tool.md` 及 §二.14 在 2026-10-26 的原始登记保留为历史，不回改。
5. **实施顺序**：按设计 §8.2 Gate 1–4——运行时核心契约首发（四项全 `next-turn`）→ 桌面回退批量与适配器映射并行 → 门禁角色卡文本 → 逐引擎探针翻表 → 联调/独立验收。
