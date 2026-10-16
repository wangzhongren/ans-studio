---
id: kanban-f4-governance-note-fix
type: fix
title: F-5 修复提案：su 治理笔记被 F4 硬拒——拒绝反馈不可操作 + 确认许可靠会话发行与重建的未登记交互
created: "2026-10-15"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [kanban-runtime-fixes-dispatch, kanban-fixes-pm-review, boundary-refresh, boundary-prose-silent-empty-fix]
events:
  - date: "2026-10-15"
    kind: created
    summary: 只读复现 kanban-live 真机 F-5；轮内两步核查发现「13:21:29 同路径写入曾成功、13:28:22 被 F4 拒」= 会话重建静默重置发行集（截图+replay 佐证）；出提案（必需 1 项 + 可选加固 3 项），未实施/未测试
  - date: "2026-10-16"
    kind: approved
    summary: 客户按推荐批准（含 F-5-main）；PM 评审记录 §客户批准记录：opt1 派桌面窗口/编排、opt2 派运行时核心、opt3 未勾选；本角色本任务只做 F-5-main
  - date: "2026-10-16"
    kind: implemented
    summary: F-5-main 落地（resolve-write.ts：F4 reason 追加可操作指引＋F4 分支 allowedByRoot 改「当前已发行可写集」；decision.ts 仅注释；su 卡文本补「确认制要点」段；新 f4-denial-guidance.test.ts 6 例 + su-doc 追加 1 例）；判定语义零变化；本角色套件 176 计/175 过/0 红/1 skipped；全量 1408 计/1407 过/0 红/1 skipped；typecheck 0 错；未 commit；待独立验证与真机复验
---

# F-5 修复提案：su 治理笔记被 F4 硬拒、反馈不可操作（kanban-live 真机轮）

> **状态：已实施待验证（F-5-main，2026-10-16，未 commit）。** 客户 2026-10-16 按推荐批准（PM 评审
> §客户批准记录）；本角色按 §三「最小拟改动」与 §五「测试计划」实施 F-5-main——实施摘要与测试证据
> 见文末「实施记录（2026-10-16）」；真机验证（§五.5）留待客户/独立验证上下文。可选件中 F-5-opt1
> （桌面窗口/编排）、F-5-opt2（运行时核心）派往各自属主、不在本任务；F-5-opt3 未勾选、未实施。
> 下文正文保留提案期原文（提案期原文自述：**未实施 / 未测试**、只读复现、根因分类、拟案与测试计划，
> 不含任何已生效改动；是否实施、可选加固项勾选，待客户裁定后由项目管理派发；本文件写作未改任何
> `src/` `app/` `test/` 代码，未改 kanban-live 项目与测试角色证据目录，未 commit）。

来源：PM 派发 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md`（F-5，P1，属主＝门禁引擎）；问题原文 `角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/problem-summary.md` §B1。

## 〇、三句话结论

1. **判定本身：设计内 fail-closed，无缺陷，不改。** F4 拒的是「未发行路径」，零副作用；su 的笔记写入本就应「先经 `request_confirmation` 呈客户确认、再写」（su 卡文本早已写明；13:21:29 正是这条流程成功工作的现场）。
2. **现象的真根因是两处「待改进」叠加（缺陷材料，非放权类放宽）：** (i) **主因**——13:21:42 结算后的自动收尾改写了 `.ans/project.json`（pin）与治理边界文档，桌面 O-1「边界陈旧 ⇒ 作废重建」在 13:21:51 前重建了 su 会话：模型上下文如实恢复（截图头部「已从本地恢复模型上下文」），但**编排侧已发行的写权集（writeSet）是内存态、随旧句柄一起丢弃**，且无任何模型可见提示——两次写入同两个文件，前次成功、后次硬拒； (ii) F4 拒绝文案**不可操作**且「允许写入的路径」列表与拒绝语义**自相矛盾**，把 su 导向了在该机制下**不可能奏效**的「请客户聊天授权」（聊天消息不进发行器）。
3. **拟案：** F-5-main（最小必需，全部落在本角色边界内，判定语义零放宽）＋ F-5-opt1/2/3（可选加固；跨角色者只写诉求与接口建议，不改他方文件）。

## 一、问题与证据（只读复现）

### 1.1 事件时间线（证据：`kanban-live/.ans/sessions/su/pi/ans/replay.jsonl`，行号即该文件行号）

| 时间（UTC） | 事件 | 证据 |
|---|---|---|
| 13:16:25 | su 会话首条消息返回；界面头部＝**「新会话」** | replay:1-4；截图 `shots/sent-su-1792070185185.png`（头部「su / 新会话」；页脚「1 个角色」） |
| 13:17:53 | su 发起 `request_confirmation`（title＝「确认创建 2 个项目角色（实现者 / 测试者）及其写权边界，随后开工实现离线中文任务看板」） | replay:22；期间 su 已查明是创世态空项目（replay:8-12） |
| 13:21:09 | 客户 **confirmed:true**（操作者：wangzhongren） | replay:23 |
| 13:21:29 | su 落盘六个治理文件，**全部 accepted**——含 `docs/su/memo.md`（replay:33-34）与 `docs/su/changelog.md`（replay:35-36）⇒ 此刻这两个路径**已发行进本会话 writeSet**（确认制下未经发行不可能通过 F4，见 §1.2） | replay:25-36 |
| 13:21:38-42 | su 汇报、`dispatch_task` 派发实现者、轮次 settle；settle 触发编排**自动收尾**（写 `.ans`(pin)+治理边界文档+manifest，`run-role.ts:709-721`） | replay:37-41 |
| 13:21:51 | 截图：su 界面头部已变为**「已从本地恢复模型上下文」**，聊天顶部可见 O-1 重建行残段「…已作废旧会话，按新边界重开；上下文恢复结果以引擎实际返回为准。」⇒ **会话已被 O-1 作废重建**（新句柄＝空 writeSet） | `shots/settled-1792070511747.png`（与 13:16:25 截图的「新会话」对照） |
| 13:22:20-13:23:10 | 下一轮：`request_choice` 被客户取消（未获同意，零写入，su 如实说明） | replay:42-48 |
| 13:27:42-13:28:22 | 回交核查轮：su 只读核查实现者产物，派发测试者（replay:64-65），随后尝试记录核查结论 | replay:50-65 |
| **13:28:22** | **两条 `write_file` 被 F4 拒**：`docs/su/memo.md`（replay:66-67）、`docs/su/changelog.md`（replay:68-69），拒绝原文见 §1.3 | replay:66-69 |
| 13:28:32 | su 如实汇报：「拒绝即零副作用，两个文件保持原样未变……若你要我把它写进 `docs/su/`，**请授权一次（列出这两个路径即可）**」 | replay:70 |
| 13:35:35 | su：「我的核查记录仍未落盘……**不重复请求同一授权**，需要你明确给一次授权我才补写」 | replay:92 |
| 轮末 | 治理记录未落盘（只留在对话里）；末轮因停止测试未补跑 | problem-summary §B1/§五 |

**关键对冲证据（本提案轮新核实）**：13:21:29 与 13:28:22 是**同两个路径**，前者 accepted、后者 F4 denied。确认制下 gate 每次求值用 `{writeSet: [...issued]}`（`run-role.ts:383-386`），而 `issued` 是 `openRoleSession` 闭包内**只增不清**的内存集合（`:379`）——同一句柄内不可能先过后拒。故两条拒绝的直接机制＝**句柄在两次之间被替换 ⇒ 发行集归零**。结合截图（头部由「新会话」变「已从本地恢复模型上下文」＋重建行残段）与 O-1 语义（`app/desktop/session.ts:675-712`；指纹含 `.ans/project.json`，pin 刷新即触发，`:964-973`），重建由 13:21:42 settle 的自动收尾触发（**注**：触发时点按截图区间推断，标「待确认」——见 §附）。**su 的两次请求「聊天授权」在该机制下都不可能奏效**：客户在聊天里点头不进发行器；唯一能重新发行的是 `request_confirmation` 的 preview 路径 + `confirmed:true`（`confirmed-writes.ts:50-70`）。

### 1.2 机制对齐（run-role.ts 确认制 + 发行器 + 桌面注入面）

- **确认制装配（编排）**：`openRoleSession` 收到 `customerInput` 即确认制（`src/pipeline/orchestration/run-role.ts:295-311` 入参语义；`:378-387` 构造 gate＝`resolveWrite(p, boundary, {writeSet:[...issued], conditions})`，`issued` 初始为空；`:391-407` 用 `createConfirmedWriteIssuer` 包装客户通道）。无 `customerInput` ⇒ 旧语义（scope 原样、不收窄）。
- **发行器（编排私有）**：仅 `req.kind==="confirm"` 且 `confirmed:true` 才发行；从 title/preview/detail **提取路径样 token**（保守正则），逐条用同一 `resolveWrite` 探测「在边界内吗」，通过才追加进 `issued`（`src/common/编排/confirmed-writes.ts:39-71`；提取器 `:79-101`）。**已登记的残余**已写明「preview 未写出具体路径 ⇒ 不发行 ⇒ 被 F4 拒」（`:19-20`）。
- **桌面注入面**：**只有内置治理角色（su）**拿到 `customerInput`（`app/desktop/session.ts:859` `role.builtIn === true`，注入处 `:940-941`）⇒ **su 是全产品唯一进入确认制的会话**；项目角色（实现者/测试者）不注入、gate 只按角色边界（不收窄）。`request_confirmation`/`request_choice` 工具「注入才注册」（`src/provider/runtime/tools.ts:931-937`）⇒ **模型能看见这两个工具 ⇔ 本会话是确认制 ⇔ 一切写入都受动态 writeSet 收窄**。
- **su 卡文本（本角色）**：早已写明「落盘前照常经 `request_confirmation` 客户确认」（`src/common/门禁引擎/boundary-core.ts:97-99`，测试 `test/门禁引擎/su-doc-surface-convention.test.ts:43` 钉住）。13:21:29 正是这条流程成功工作的现场（确认 → 发行 → 写）。

### 1.3 拒绝文案原文与门禁生成路径

真机原文（replay:67，两条同构）：

```text
写入被拒绝：路径在角色边界内，但不在任务 writeSet 内（F4）：docs/su/memo.md
允许写入的路径（按根分组）：
  skill: （无）
  project: 角色卡, docs, .ans
```

- reason 生成：`src/service/gate/resolve-write.ts:135-138`（F4 分支，`路径在角色边界内，但不在任务 writeSet 内（F4）：<rel>`）。
- 「允许写入的路径」列表生成：`resolve-write.ts:44-57`（`allowedByRootOf`——取**角色边界条目**、过滤未激活条件目录），经 `src/common/runtime-core/format-denial.ts:23-31` 与 `src/common/pi-adapter/format-denial.ts:23-31`（两份逐字相同）渲染。
- **自相矛盾**：正文说「不在 writeSet（拒）」，列表却以**「允许写入的路径」**为名列出的正是覆盖被拒路径的边界目录（`docs`）⇒ 读者无法知道「现在到底什么可写、怎么才能写」。且**全文零恢复指引**（不提 `request_confirmation`／确认制／「许可按会话生效」）。

## 二、根因与分类

### 2.1 设计内（正确，不改）

1. **F4 对未发行路径硬拒**：A-3 确认制（`角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md` §A-3；实现如上）。fail-closed 正确、零副作用。
2. **发行只经「preview 列路径 + confirmed:true」**（confirmed-writes.ts）；su 的笔记写入须先确认（su 卡文本）；13:21:29 证明流程可用。
3. **su 诚实降级**：su 未谎报、如实汇报、不重复索要授权（replay:70/:92）——行为侧无过错。
4. **「拒绝时自动触发确认卡」不做**：拒绝必须保持同步、零副作用；在拒绝里自动弹卡 = 把判定变成交互副作用（模型误写会反复刷卡、打扰客户），且跨编排/桌面两边界——不建议（见 §四）。

### 2.2 待改进（缺陷材料）

- **D1【主因；跨角色——桌面窗口 O-1 × 编排 issued】**：「边界陈旧 ⇒ 作废重建」会**静默重置已发行写权**，而模型上下文（含「客户已确认」记录与此前的成功写入）**被完整恢复**⇒ 模型与门禁认知分叉；重建如实行只进 UI、模型看不到；此后任何旧路径写入＝无预兆的 F4。该交互**未被任何文档登记**（O-1 变更记录 `角色卡/桌面应用/docs/change/2026-10-12_change_boundary-refresh.md` 无此条；A-3 设计未讨论重建）。证据链：§1.1（13:21:29 accepted → 重建截图 → 13:28:22 denied，同路径）。
- **D2【本角色文件】**：F4 拒绝**不可操作**＋「允许写入的路径」列表**自相矛盾**（§1.3）。
- **D3【跨角色——运行时核心；文案组合】**：`src/provider/runtime/schema.ts:51-63`（`request_confirmation` 描述与 promptGuidelines）含句「已接受项目边界内、已授权任务的**普通写入**和检查无需逐次确认」——该文本**只在确认制会话可见**（§1.2 注册判据），而确认制会话里**任何写入都必须先确认** ⇒ 这句在其可被读到的每个上下文里对「写入」都是**假的**（对「检查」为真）。su 卡「落盘前照常经 request_confirmation」为真但被稀释；且「**口头同意≠发行凭据**」在卡文本无着墨（工具描述里虽有「获准的唯一凭据是 confirmed:true」，但受挫时刻无人把它接到拒绝上）。13:28 su 的「请授权一次」正踩此坑。

### 2.3 一句话分类

判定＝fail-closed 设计内（保留不变）；现象＝「拒绝反馈不可操作」（D2）＋「重建×发行的未登记交互」（D1）＋「指引文案在其可见处为假」（D3）——按缺陷材料处理，**不涉及任何写权放宽**。

## 三、最小拟改动（F-5-main；保持 fail-closed 不放松）

### 3.1 文件清单（全部在本角色 `boundary.yaml` Section 1 内）

| 文件 | 改动 | 行为变化 |
|---|---|---|
| `src/service/gate/resolve-write.ts` | ① F4 分支 reason 追加可操作指引（拟文案见 3.2）；② F4 分支 `allowedByRoot` 改为「**当前已发行可写集**」——取 `scope.writeSet` 中**在边界内且条件已激活**的项（逐项用与判定同源的 `pathCovers`/`isActive` 过滤；按根分组，合同上 writeSet 为项目相对 ⇒ 归 project）；③ 同步更新 `allowedByRootOf`/F10 注释 | 仅**拒绝信息**变化：列表如实反映「此刻可写 = 已发行集」（空集即两根皆「（无）」）；**判定逻辑、放行/拒绝结果零变化** |
| `src/model/decision.ts` | **仅注释**：`AllowedPathsByRoot` 语义澄清（F4 分支＝当前已发行可写集；其余分支＝边界覆盖〔无任务收窄时即上界〕） | 零（类型形状不变） |
| `src/common/门禁引擎/boundary-core.ts` | `BUILT_IN_ROLE_CARD_TEXT` 在「docs/su 文档面」段后追加「确认制要点」段（拟文案见 3.2） | 模型可见治理文案变化（不改任何判定） |
| `test/门禁引擎/*` | 见 §五 | — |

**不动的**：`resolveWrite` 的判定顺序与分支条件、发行器、任何桌面/编排/运行时核心文件、`format-denial` 两份渲染器（内容随动、代码零改）。

### 3.2 拟文案（实施时可微调；须保留既有测试断言子串，附注于 §五）

**F4 reason 拟（保留原头「路径在角色边界内，但不在任务 writeSet 内（F4）：<rel>」逐字不动，其后追加）**：

> 如需写入该路径，请先取得写盘许可：若你的工具集中有 request_confirmation（确认制会话），把该路径逐条列入其 preview 呈客户确认——客户返回 confirmed:true 后该路径会被发行进 writeSet，再重试写入即可；任务型会话请把该路径加入任务 writeSet（或改在 writeSet 内选路径）。注意：许可按会话生效——会话重建/重开后不会自动保留，需重新确认。

**su 卡文本拟段（接在「……落盘前照常经 `request_confirmation` 客户确认。」之后）**：

> 确认制要点：把将要写出的**每个路径逐条**列入 `request_confirmation` 的 preview（如 `docs/su/memo.md`、`docs/su/changelog.md` 各占一行）；客户返回 `confirmed:true` 后这些路径才被发行、对应写入才可成功。你在对话里口头得到的同意**不是** `confirmed:true`，不能作为写盘依据。写盘许可**按会话生效**：同一会话内已确认过的路径不必重复确认；会话重建/重开后（如边界更新触发）需重新确认。

用词约束：不得引入未否定的「授权/获准/放行」小句（J-1 守卫，`test/门禁引擎/dispatch-after-landing-convention.test.ts:49-58`）；拟段已回避（用「许可」「写盘依据」）。

### 3.3 fail-closed 保持声明

- 判定语义零放宽：F4 仍拒未发行路径；发行仍只来自 `confirmed:true` + preview 路径；无自动发行、无自动弹卡、无预置 writeSet。
- 行为变化仅两类：**拒绝信息更可操作、列表更诚实**；**模型指引文本修正**。

## 四、必需项 vs 可选加固项（编号稳定；勾选待客户裁定）

- **F-5-main（必需）**：§三 全部。理由：真机已实际阻断治理记录落盘并诱发不可能奏效的「聊天授权」；成本全部在本角色边界内；判定零变化。
- **F-5-opt1（可选；建议采纳）**：**重建如实行模型可见化**——重建发生后，除 UI 行外向**模型**投递一行（如「会话已因边界更新重建；此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认」）。**属主**：桌面窗口（`app/desktop/session.ts:675-712` 重建路径）与/或 编排（模型可见消息的注入渠道）——本角色**只出诉求与接口建议，不改他方文件**。收益：直接消 D1 的认知分叉；成本：中（跨 1-2 角色、需接口共识）。
- **F-5-opt2（可选；建议采纳）**：**运行时核心修订 `schema.ts:51-63` 文案**——把「普通写入……无需逐次确认」改为与实现一致的表述（读取/检查无需；**写盘一律先经本工具确认**；保留既有的「preview 必须逐条列出路径」「confirmed:true 是唯一凭据」两句）。**属主**：运行时核心（本角色只出诉求）。收益：消除关键误导句；成本：低（纯文案）。
- **F-5-opt3（可选；默认不采纳，交客户评估）**：**「已确认写权跨重建保留」**——为 `openRoleSession` 增设「重建时恢复已发行路径集」的接口（桌面把本会话已发行集回传，编排按**新边界+条件**逐条重探测后重建 issued）。收益：重建不再丢已确认许可（客户确认未撤回、重建对客户可见，「同一对话内继续有效」说得通）；成本：高（新跨角色接口＋桌面持有发行集）；语义上把「同意」的时效边界复杂化，需客户裁定。fail-closed 不放松（仍要求原确认存在、仍逐条探测）。
- **不立**：「治理笔记写入自动触发确认卡」——见 §2.1 第 4 条（拒绝须零副作用、同步；自动弹卡=交互副作用且跨两边界）。

**候选 a/b 的跨边界评估（任务指定）**：
- 候选 a（F4 可操作指引＋措辞矛盾修正）：**不需要动编排与桌面窗口**——全部落在门禁引擎文件内（渲染器内容随动、代码零改）。若客户更偏好「保留 allowedByRoot=边界、只改渲染标签」的替代路线，则会牵动运行时核心/Pi适配器/编排三个角色的文件——本提案不取（跨面更大）。
- 候选 b（发行流程优化）：模型侧（确认模板、口头无效、按会话生效）＝不需要动他方，已并入 F-5-main；机制侧＝opt1/opt3（跨编排/桌面窗口，只出诉求）。

## 五、测试计划（`test/门禁引擎/` 内；实施时执行）

1. **F4 拒绝信息**（扩展 `resolve-write.test.ts` 或新 `f4-denial-guidance.test.ts`）：
   - 仍为拒绝（fail-closed 回归）；reason 保留原头子串 `/不在任务 writeSet 内/`（既有断言兼容：`test/编排/session-handle.test.ts:132`、`test/编排/confirmation-gated.test.ts:160`、`test/测试/boundary-matrix.test.ts:43-45` 只断言该子串/`F4`），且含指引子串（`request_confirmation`、`preview`、`confirmed`）；
   - F4 分支 `allowedByRoot`：writeSet 空 ⇒ `{skill:[],project:[]}`；非空 ⇒ 恰列出**经边界+条件过滤后**的 writeSet 项（project）；条件未激活的 writeSet 项**不计入**；
   - 非 F4 分支语义回归：既有 F5/F10/旧快照用例**不改期望**（`resolve-write.test.ts:86-94,203-209`；`stale-snapshot-hint.test.ts`）。
2. **渲染链回归**（import 先例同 `test/门禁引擎/boundary-empty-and-builtin.test.ts:37`）：经 `formatDenialMessage` 渲染 F4 决策 ⇒「允许写入的路径」下的项目恰为当前可写集；指引与 reason 同现。
3. **su 卡文本**（扩展 `su-doc-surface-convention.test.ts`）：新段含「confirmed:true」「preview」「逐条」「按会话生效」「重建/重开」「口头」等关键词；既有断言（「落盘前照常经…request_confirmation」等）保持；`dispatch-after-landing-convention.test.ts` 全绿（新增段不引入未否定的 授权/获准/放行 小句）。
4. **全量回归**：`node --test "test/**/*.test.ts"` 期望**仅 2 条既有基线红**（pi-config 检出目录名 `ans-cli` 断言、macOS `/var` 符号链接）无新红；`npm run typecheck` 0 错；不 commit。
5. **实施后真机验证（不在本提案轮，留待客户）**：确认制 su 会话经 `request_confirmation` 更新自己笔记成功；F4 拒绝后模型能依指引自行恢复；重建后拒绝信息能把模型导回确认通道。

## 六、跨角色影响

### 6.1 引用方证据失效面（实施时评估）

- `resolve-write.ts` 的 **F4 分支** reason 与 `allowedByRoot` 内容变化 ⇒ 一切引用「F4 完整消息文本／其列表」的既有证据（含本轮 kanban-live 现场）在**文本**上不再逐字有效；**判定语义未动**。
- `decision.ts` **零形状变化**（仅注释）。
- 逐文件只读排查（全部为消费方/断言方，均不冲突）：`test/编排/confirmation-gated.test.ts:160`（`/writeSet/` 保留）、`test/编排/session-handle.test.ts:132`（原头保留）、`test/测试/boundary-matrix.test.ts:54`（仅形状）、`test/装配/config.test.ts:90-110`（不查文本）、`test/桌面应用/session.test.ts:70-72`（`/按根分组/` 保留）、`test/门禁引擎/stale-snapshot-hint.test.ts:145-159`（F4 分支只断言 reason 子串与不含旧快照线索——拟文案不含该词）。实施后须全量复跑确认。
- 两份 `format-denial.ts` 与编排 `output.ts`：渲染代码零改、内容随动（F4 列表从此忠实）。

### 6.2 需项目管理协调

- `src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts` 是**单一主属主敏感面**（工程法案 §一.5 明列，改动会使引用方证据失效、须先经项目管理协调）。本提案对 `decision.ts` **仅注释、零类型变化**——仍按法案走 PM 评审→客户批准后再实施。
- F-5-opt1 涉**桌面窗口**与/或**编排**；F-5-opt2 涉**运行时核心**；F-5-opt3 涉**编排＋桌面窗口**——本角色只出诉求，须 PM 协调其属主立各自提案后推进。

### 6.3 跨边界发现（只读定位、回报不改）

- **D1（O-1 × A-3 交互缺口）**无单方属主：重建在桌面（`app/desktop/session.ts:675-712`），发行集在编排（`run-role.ts:379`）——建议 PM 立项协调（opt1/opt3 为其最小修补）。
- **D3** 属运行时核心（`src/provider/runtime/schema.ts:58`）。
- **观察项（待确认，本轮不动）**：`writeSetContains`（`resolve-write.ts:60-64`）按字符串精确比对、**不区分根**；`TaskScope.writeSet` 合同为「本项目相对路径」（`src/model/decision.ts:19`），而 F4 比对用的 `rel` 是**目标根相对**路径——skill 根目标（仅绝对路径可达）理论上可与同名项目 writeSet 项串线放行。真机未复现、确认制下 skill 目标亦不可发行（发行器拒绝绝对路径），但属跨根混淆家族的潜在隐患，建议另立观察项评估。

## 七、风险与回滚

- 风险：① 指引后模型更常发起确认卡（**预期即设计流程**；客户可拒，拒＝不发行，零副作用）；② F4 列表改义后，习惯旧语义的读者短暂困惑（注释与文案已声明）；③ 测试锁定新文案后，文案再调需同步测试（既有先例做法，成本低）。
- 回滚：全部改动为单角色边界内文本/内容级修改，**无类型、无判定逻辑、无数据/状态迁移**；回滚＝还原实施 commit（或逐文件 revert），F4 行为恢复原状。

## 附：如实登记与待确认

- 本提案轮**未实施任何改动**、未 git 提交；未改 kanban-live 项目与测试角色证据目录任何文件。
- 证据引用：replay 行号基于 kanban-live `replay.jsonl`（134 行）；截图为 `角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/shots/` 下 `sent-su-1792070185185.png`（13:16:25，头部「新会话」）与 `settled-1792070511747.png`（13:21:51，头部「已从本地恢复模型上下文」＋重建行残段）。
- **待确认（标「待确认」，如实不猜测）**：① 重建的**精确触发时点**（settle 扫描 vs 下一次 send 前检查）按截图区间推断为「13:21:42-51 之间、「su 一轮结束时」扫描」，未取得带时间戳的桌面日志佐证；② 13:17 确认卡的 **preview 原文**未入证据（replay 未记录该工具参数字段）——「六文件路径均在 preview 中被列出」由「13:21:29 六写入全部 accepted」反推；③ `app-redacted.log` 无时间戳，未用于时点判定。
- 基线：全量测试 2 条既有红（检出目录名 `ans-cli`、macOS `/var`）为基线、非回归。

## 实施记录（2026-10-16，F-5-main，本角色）

> 依据：PM 评审 §客户批准记录（客户 2026-10-16 按推荐批准）与 PM 实施派发（本角色 = F-5-main）。
> **状态：已实施待验证**（独立验证上下文复验与真机 E2E 复跑未进行；本记录不声称已验）。未 commit。

### 实施内容（严格按 §三 最小拟改动；判定语义零放宽）

| 文件 | 改动 |
|---|---|
| `src/service/gate/resolve-write.ts` | ① F4 分支 reason 保留原头逐字、其后追加 `F4_DENIAL_GUIDANCE`（可操作指引：request_confirmation 的 preview 逐条列路径 → confirmed:true 发行 → 重试；任务型会话加任务 writeSet；许可按会话生效、重建/重开不自动保留）；② F4 分支 `allowedByRoot` 改为 `issuedByRootOf`＝**当前已发行可写集**（`scope.writeSet` 中逐项用与判定同源的 `pathCovers`/`isActive` 过滤；writeSet 合同为项目相对 ⇒ 归 project）；③ `allowedByRootOf` 注释限定为「非 F4 分支」并反指 issuedByRootOf；文件头补拒绝信息语义段 |
| `src/model/decision.ts` | **仅注释**（`AllowedPathsByRoot` 语义澄清：非 F4＝边界覆盖；F4＝当前已发行可写集）。类型形状零变化——按法案 §一.5 属单一主属主敏感面，本次经 PM 评审→客户批准后实施 |
| `src/common/门禁引擎/boundary-core.ts` | `BUILT_IN_ROLE_CARD_TEXT` 在「docs/su 文档面」段后追加「确认制要点」段（拟文案 §3.2 逐字）：每个路径逐条入 preview、confirmed:true 才发行、口头同意不算、许可按会话生效、重建/重开需重新确认；头注同步登记来源与 J-1 措辞避让（未引入未否定的「授权/获准/放行」小句） |
| `test/门禁引擎/f4-denial-guidance.test.ts` | **新增（6 例）**：F4 仍拒绝＋原头逐字＋指引子串（request_confirmation/preview/confirmed:true/任务 writeSet/按会话生效/重建）＋不含旧快照线索＋对照面放行；F4 分支 allowedByRoot 空集/恰列已发行项/条件未激活不计入；非 F4 分支（F5 缺条件、未匹配）列表仍为边界覆盖（回归）；渲染链 formatDenialMessage 项目行＝当前可写集、指引与 reason 同现 |
| `test/门禁引擎/su-doc-surface-convention.test.ts` | 追加 1 例：确认制要点段关键词与位置（在文档面段之后）；既有断言未动 |

**不动的**（复核确认）：`resolveWrite` 判定顺序与分支条件、发行器、`format-denial` 两份渲染器（代码零改、内容随动）、任何桌面/编排/运行时核心文件。零判定变化对照证据：`f4-denial-guidance.test.ts` 内「同路径在 writeSet 内照常放行」断言 + 全量回归。

### 测试证据（实跑，2026-10-16）

- `node --test 'test/门禁引擎/**/*.test.ts'` → **176 计 / 175 过 / 0 红 / 1 skipped**（Windows 专用用例 skip；较实施前 169 + 新 7：f4-denial-guidance 6 + su-doc 1）。
- `node --test 'test/门禁引擎/f4-denial-guidance.test.ts'` → **6/6 过**。
- `npm run typecheck` → **0 错**。
- 全量 `node --test "test/**/*.test.ts"` → **1408 计 / 1407 过 / 0 红 / 1 skipped**。**如实登记**：派发/提案所载「2 条基线红（`test/桌面应用/pi-config.test.ts` 检出目录名、`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接）」在当前 HEAD **未复现**（这两个文件单独跑 36/36 全过；两域均不 import 本次改动模块，不可能由本次改动翻绿）——基线红应已在提案轮与本实施轮之间的既有提交中修复；本次**零新红**。
- 跨角色断言兼容复核（只读）：`test/编排/session-handle.test.ts:132`（`/不在任务 writeSet 内/`）、`test/编排/confirmation-gated.test.ts:160`（`/writeSet/`）、`test/测试/boundary-matrix.test.ts`（`/F4/`＋形状）、`test/桌面应用/session.test.ts`（`/按根分组/`）所依赖的原头/标题子串均逐字保留；全量复跑证实无跨边界红。

### 未做 / 待验证（如实分列）

- **未做**：F-5-opt1（重建可见化——桌面窗口/编排属主）、F-5-opt2（schema.ts 文案——运行时核心属主）、F-5-opt3（未勾选）。
- **待验证**：独立验证上下文复验；§五.5 真机验证三项（su 经 request_confirmation 更新自己笔记成功；F4 拒绝后模型能依指引自行恢复；重建后拒绝信息能把模型导回确认通道）。
- **跨边界发现（回报，未改）**：F4 拒绝信息语义变化后，任何**逐字引用旧 F4 完整消息文本**的既有证据（含 kanban-live 现场）在文本上不再逐字有效（判定语义未动）——已知在案（§六.1），实测各断言方均按子串兼容；`writeSetContains` 跨根字符串比对观察项维持「登记观察、不动」（PM 评审 §四.3）。
