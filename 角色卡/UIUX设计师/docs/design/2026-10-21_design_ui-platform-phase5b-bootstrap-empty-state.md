---
id: ui-platform-phase5b-bootstrap-empty-state
type: design
title: Phase 5B BOOTSTRAP 空态设计依据与检查重锚
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-phase5b-new-visual-audit, ui-platform-phase4b-review, ui-platform-nova, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: ruled
    summary: PM §十九 两项书面依据之一：旧「完成 bootstrap」入口条删除是有意裁定；但新渲染器同时删掉了 S0「项目尚未 bootstrap」唯一提及与「开始与主入口对话」中心 CTA，后者不属于已批准差异，桌面UI 需补回
---

# Phase 5B BOOTSTRAP 空态设计依据与检查重锚

**范围**：回答 PM §十九 第 1 项：新渲染器空态是否**有意**去掉旧「完成 bootstrap」CTA/重复提及；若是给设计依据与新区断言，若否要求桌面UI 补回。**只读评审**；未改 `app/`、`src/`、`test/`；未提交。

**结论：需要区分两件事。**

1. **旧「完成 bootstrap」入口条（`#bootstrap-action` / `.bootstrap-action`）的删除是有意裁定，不应补回。** 2026-10-12 A-5：该入口条已随「收口」删除；产物收尾由编排在 su 会话 settle 后自动完成，客户确认改由聊天流里的交互卡承担（`renderer.js::appendOperatorRequest`）。因此 `BOOTSTRAP_ACTION_REMOVED` / 左栏无 `bootstrap-notice` 的断言继续有效。
2. **新渲染器同时删掉了 S0 空态的唯一「项目尚未 bootstrap」提及与「开始与 <主入口> 对话」中心 CTA，这不是已批准差异。** 客户与 PM 的既有裁定明确保留 S0；新端当前改为「该项目下未枚举到角色 / 请确认项目包含角色卡目录与治理边界；重新导入项目后重试。」，既没有 bootstrap 的单一说明，也没有可执行的主入口 CTA，且「重新导入」对空项目的创世路径是死路。**判定：needs-work（P1），桌面UI 需补回 S0 文案与中心 CTA。**

## 一、设计依据（逐字）

| 来源 | 裁定 |
| --- | --- |
| 项目管理 §10.3（2026-10-11） | 导入空文件夹 → 左树显示主入口 + 「项目尚未 bootstrap：与 su 对话，让它创建角色」提示（据 `hasRoles===false` 派生）。 |
| 项目管理 §10.7（2026-10-11） | **主 CTA：空聊天区给一个「开始与 su 对话」的主按钮**；不必自动开会话，但一眼可见 su 是入口；`primaryRoleId` 由门禁引擎给，渲染侧不硬编码。 |
| 治理 Liaison 评审 §9.2（2026-10-18） | 优先级钉死：`hasRoles === false` → **保留 S0「项目尚未 bootstrap」与「开始与 <主入口> 对话」CTA**；Liaison 的一句话职责说明作为附加提示，不替换 S0。 |
| 旧渲染器 `renderer.js::emptyStateHtml` | S0 文案：标题「项目尚未 bootstrap」；说明「与 <主入口显示名> 对话，让它把角色建出来；左树会随之长出。」；CTA `#btn-start-primary`「开始与 <主入口显示名> 对话」。 |
| 旧 `index.html` A-5 注释（2026-10-12） | 「完成 bootstrap」**入口条**已删除；不是中心 CTA；中心 CTA 保留。 |
| Nova §10.4 | 空态诚实说明当前能做什么、为什么不能做；无项目/无角色用同版式，文案换成真实状态；主按钮（若有）可 Tab；不显示假记录。 |
| 新 `ChatStream.tsx` 当前实现 | `else if (!hasRoles \|\| roles.length === 0)` → 「该项目下未枚举到角色」+「重新导入项目后重试」；无 `showStart`，无 `#btn-start-primary`。 |

**结论**：新端把「未 bootstrap 的创世态」与「枚举失败/无角色」合并成一个死端空态，丢掉了 PM 明确要求的 S0 主路径。这不是 Nova 的新设计差异，也没有 PM/UIUX 的替代裁定；必须补回。

## 二、补回规格（桌面UI 执行）

### 2.1 分支与优先级

```
!projectRoot
  → 「尚未导入项目」+ 导入引导（无 S0 CTA）
projectRoot && hasRoles === false   // 空项目：服务仍返回内置治理角色
  → S0「项目尚未 bootstrap」+ 说明 + 主入口 CTA
projectRoot && roles.length === 0   // 异常：连内置角色都没有
  → 「该项目下未枚举到角色」+ 排查/重新导入（无 S0 CTA）
!selectedRoleId
  → 「选择角色开始聊天」
rowCount === 0 && recordState === pin-mismatch / missing / invalid
  → 4B 治理记录空态 + 治理 CTA
rowCount === 0 && governanceHint !== ""
  → 治理角色空态（Liaison 等），不带自指 CTA
rowCount === 0
  → 会话未开：「开始与 <角色> 对话」+ CTA；已开：「会话已开启…」
```

**关键**：不得再用 `!hasRoles || roles.length === 0` 合并 S0 与异常态；`hasRoles===false` 时 `roles` 通常含 5 个内置治理角色（本审计 `BOOTSTRAP_ROLE_COUNT=5`、`primaryRoleId=liaison`），必须走 S0。

### 2.2 逐字文案（动态主入口，不硬编码 id）

- 标题：`项目尚未 bootstrap`
- 说明：`与 ${primaryDisplayName} 对话，让它把角色建出来；左树会随之长出。`
- 附加提示（仅 Liaison 等治理入口有 `governanceRoleEmptyHint` 时）：作为 `.empty-hint` 追加，不替换标题/说明/CTA。
- CTA：`开始与 ${primaryDisplayName} 对话`，元素 `#chat .chat-empty #btn-start-primary`，shadcn `Button`（高 32、primary 实底），Tab 可达，Enter/Space 触发。
- 行为：点击 CTA 才 `selectRole(primaryRoleId)` 开启会话；**导入/加载后不自动开会话**。
- 单一提及：整页「项目尚未 bootstrap」只在中心 `.chat-empty .empty-title` 出现一次；左栏无 `bootstrap-notice`，也不重复「该项目下未枚举到角色」这句（该句只用于 `roles.length===0` 的异常态）；`#composer-hint` 保持空（写入语义仍在 `.compose-note #runtime-note`）。
- S0 不显示治理记录 CTA（`#btn-governance-empty-action`），因为 `hasRoles===false` 时建立治理记录的流程尚未到达；治理 CTA 只在有角色但记录缺失/失效时出现。

### 2.3 新区空态应断言什么

保留旧检查名（行为名仍准确），并补具体元素/文案/行为断言：

| 检查名 | 断言 |
| --- | --- |
| `BOOTSTRAP_CENTER_CTA_PRESENT`（保留） | `#chat .chat-empty #btn-start-primary` 存在，`tagName=BUTTON`，`disabled=false`。 |
| `BOOTSTRAP_MENTION_COUNT`（保留） | 整页「项目尚未 bootstrap」最内层匹配元素数 === 1。 |
| `BOOTSTRAP_MENTION_IN_CENTER_EMPTY`（保留） | 上述唯一元素的 class 含 `empty-title`，且位于 `#chat .chat-empty`。 |
| `BOOTSTRAP_S0_TITLE`（新） | `.chat-empty .empty-title.textContent.trim() === "项目尚未 bootstrap"`。 |
| `BOOTSTRAP_S0_SUB`（新） | `.chat-empty .empty-sub` 包含「对话，让它把角色建出来；左树会随之长出。」且包含主入口显示名。 |
| `BOOTSTRAP_S0_CTA_TEXT`（新） | `#btn-start-primary.textContent.trim() === "开始与 " + primaryDisplayName + " 对话"`；`primaryDisplayName` 取 `primaryRoleId` 对应显示名，不硬编码 su/liaison。 |
| `BOOTSTRAP_S0_CTA_STARTS_SESSION`（新） | 点击前 `sessionOpenRoleId === null`；点击后 `sessionOpenRoleId === primaryRoleId`，且只调用一次 `session:open`。 |
| `BOOTSTRAP_S0_CTA_KEYBOARD`（新） | Tab 可聚焦 CTA，`outline` 为 2px `--ring`；Enter/Space 触发同上。 |
| `BOOTSTRAP_S0_NO_GOVERNANCE_CTA`（新） | `hasRoles===false` 时 `#btn-governance-empty-action` 为 null。 |
| `BOOTSTRAP_ACTION_REMOVED`（保留） | `#bootstrap-action === null`；**不要**因补回中心 CTA 而恢复旧入口条。 |
| `BOOTSTRAP_LEFT_NOTICE_ABSENT` / `BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT`（保留） | 左栏无 `bootstrap-notice` 元素/类。 |
| `BOOTSTRAP_HINT_EMPTY`（保留） | `#composer-hint` 为空；`.compose-note #runtime-note` 仍含写入语义。 |
| `NORMAL_PROJECT_NO_BOOTSTRAP_MENTION`（保留） | 正常有角色项目整页不含「项目尚未 bootstrap」。 |

**判定口径**：三项旧检查 `CENTER_CTA_PRESENT / MENTION_COUNT / MENTION_IN_CENTER_EMPTY` 在新端**不是有意差异**，必须转 true；不接受把 `MENTION_COUNT` 降为 0 或以「该项目下未枚举到角色」替代。若未来要改 S0 文案，须 PM/UIUX 书面裁定并同步更新 Nova §10.4 与本表；本角色不建议改，因为「项目尚未 bootstrap」是客户逐字保留的创世态用语。

## 三、证据与状态

- 新端当前 `ChatStream.tsx` 分支（`!hasRoles || roles.length === 0`）与截图 `2026-10-21-phase5b-new-visual-evidence/raw-main/05-bootstrap.png` 均显示「该项目下未枚举到角色」，无 S0 提及/CTA。
- 旧 e2e 新端值：`BOOTSTRAP_MENTION_COUNT=0`、`BOOTSTRAP_MENTION_IN_CENTER_EMPTY=false`、`BOOTSTRAP_CENTER_CTA_PRESENT=false`；`BOOTSTRAP_ACTION_REMOVED=true`、`BOOTSTRAP_LEFT_NOTICE_ABSENT=true`、`BOOTSTRAP_HINT_EMPTY=true`（`raw-main/report.txt`）。
- 状态：**needs-work（P1）**；属主桌面UI；复测按 §2.3 全组断言 + 1360/960/200% 截图。
- 本文件只作设计裁定，不代替测试/独立验收。

## 四、边界

只写 `角色卡/UIUX设计师/`；未改 `app/`、`src/`、`test/`、其他角色资料或历史设计文档；未提交。UIUX 结论只作设计对齐证据，不代替测试独立验证、PM 门或独立验收。

## 五、冻结候选复测（2026-10-21 20:25）

候选 `c9d13918/f568e2aa/57d9575c` 已补回 S0：测试 final2 `s0/report.json` 与 5A 冒烟 24/24 均显示标题「项目尚未 bootstrap」、说明「与 主理 / Lead 对话，让它把角色建出来；左树会随之长出。」、CTA「开始与 主理 / Lead 对话」、单一提及、无治理 CTA、点击/键盘开会话；1360/960 与 680 CSS 200% CTA 可见。**480 CSS 200%** 下 CTA 在首屏下（bottom 398.6 > 310，需滚动，P2），与 composer/提示条遮挡同源；待 200% 紧凑布局修复后复测。

**最终候选更新（2026-10-21 20:45）**：`f372e111/f568e2aa/b52cfca1` 的 5A 36/36 中，480/680 S0 CTA 遮挡门均 `bottom <= composer.top`（480：CTA 180.6–212.6，composer top 215）；1360/960/680 标题/说明/CTA/单一提及/无治理 CTA/点击+键盘均过。S0 目标截图 `15-s0-480css.png` 标题/说明/CTA 完整可见；480 初始滚动位仍需滚动（P2）。
