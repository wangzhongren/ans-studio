---
id: ui-button-label-and-card-markdown
type: change
title: N-1 导入/切换项目按钮文案 + N-2 右栏角色卡 Markdown 渲染
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [markdown-vendored-library, shell-confirm-card]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定「导入项目之后，按钮名字变成切换项目」「右边的角色卡要有 markdown 渲染」
  - date: "2026-10-12"
    kind: implemented
    summary: ui-labels.js 纯映射（pickProjectLabel）+ renderer updatePickButton（判据 state.projectRoot）；renderRight 角色卡改走 Md.renderMarkdown（card-md 样式钩子）；样式随款
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 143 计/142 过/1 红（唯一红为既有环境红）；全量 841/838/2 红（两红均既有环境红）；typecheck 0 错
  - date: "2026-10-12"
    kind: implemented
    summary: N-4（客户「都要 markdown 化」）：变更记录/文档索引/回交卡摘要一并接同一 Md 管线（card-md 钩子通用化）；边界表格保持结构化；证据列表仍逐条 esc
---

# N-1 按钮文案 + N-2 角色卡 Markdown

**来源**：客户原话「导入项目之后，按钮名字变成切换项目」「右边的角色卡要有 markdown 渲染」。
**属本角色边界内**（只动 `app/**` + `test/桌面应用/**` + 本页）。

## N-1：导入项目按钮两态文案

- **纯函数**：新增 `app/renderer/ui-labels.js`（经典脚本 + node 双环境，先于 renderer.js 加载并挂
  `window.ANSUiLabels`）——`pickProjectLabel(hasProject)`：`true ⇒ "切换项目"`；其余（false/缺省/清空回退）
  ⇒ `"导入项目"`（**判据只认布尔转写**，非布尔真值不当「已有」）。
- **渲染侧**：`updatePickButton()`——判据 = **已有状态** `state.projectRoot`（是否为非空字符串；**不靠界面
  猜测**）；在 `applyListing`（导入/切换同一落定路径）与初始各刷新一次。按钮 id 实为 `#btn-import`
  （派工单写的 `#btn-pick-project` 与实件不符——按实件接线，见回报）。
- **文案**：`导入项目 / 切换项目`（去掉了旧静态文案的尾部省略号「…」——与客户原话逐字一致；如需保留省略号改一处纯函数即可）。

## N-2：右栏角色卡 Markdown 渲染

- **渲染**：`renderRight()` 的角色卡组由 `esc(role.cardText)` 改为 **`Md.renderMarkdown(role.cardText)`**
  ——**走既有管线**（同一个 `esc` 单一来源、`html:false` 白名单、链接 `rel` + `md-link` 类、图片=原文文本、
  表格禁用等既有定制**逐条适用**）；容器加样式钩子 `card-text card-md`。
- **样式**（`styles.css`）：`.card-text.card-md` **解除 pre-wrap**（渲染产物自带块结构），块级排版/代码块
  （`pre.md-pre`）/链接（`a.md-link`）/引用与聊天流 `.msg` 同款。
- **本轮不动**：边界条目（表）/变更记录（`esc` 纯文本）/文档索引（清单）三组**未改**。**发现并登记**：
  `renderChangelog` 与角色卡同走 `.card-text`（纯文本 + pre-wrap）——若客户希望变更记录同享 Markdown，
  改动同样是「一行换 `Md.renderMarkdown` + 复用 card-md」，**待协调方/客户裁定，未擅自扩**。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- `renderer.test.ts`：N-1（纯函数两态/回退/非布尔；判据=已有状态源码钉；applyListing 刷新钉；装载顺序；
  初始静态文案）；N-2（模块 XSS 反向用例：`<script>` 成转义文本、行内码尖括号转义、标题/粗体成白名单标签；
  角色卡经 `Md.renderMarkdown` 钉 + 不再走裸 esc 钉 + `card-md` 钩子 + esc 单一来源未破 + 三组未动反向钉 +
  样式钉）。
- e2e 增 `PROJECT_BTN_INITIAL_IMPORT`/`PROJECT_BTN_SWITCHED`/`RIGHT_CARD_MD_RENDERED`/`RIGHT_CARD_MD_NO_SCRIPT`
  探针（本机未跑，如实登记）。
- `test/桌面应用` 全套 **143 计 / 142 过 / 1 红**（唯一红=既有环境红 pi-config）；全量 **841/838 · 2 红**
  （两红均既有环境红）；`npm run typecheck` **0 错**。

## 不符之处（如实）

1. 派工单写 `#btn-pick-project`，实件按钮 id 为 `#btn-import`（沿用未改名——改名有破既有 e2e/样式锚点的
   风险；如需对齐 id 另行裁定）。
2. 初始静态文案去掉了「…」（客户原话无省略号）；纯函数一处可回改。

## N-4（同日追加；客户「**都要 markdown 化**」）：其余接入点一并 Markdown 化

**来源**：客户裁定原话「都要 markdown 化」。**属本角色边界内**。

- **右栏·变更记录**：`renderChangelog` 正文由 `esc` 纯文本改为 **`Md.renderMarkdown`**（同一 `esc` 单一来源、
  同一配置：`html:false`、链接 `rel`+`md-link`、图片=原文文本等逐条适用），容器 `card-text card-md`。
- **右栏·文档索引**：`renderDocs` 由 `<ul class="idx">` 结构化清单改为**经同一管线**：每条一行 `- <path>`
  （目录带尾 `/`），`Md.renderMarkdown` 渲染为列表；容器 `card-text card-md`。**理由**：索引项是**路径**
  （无正文），走同一管线保观感一致；CommonMark 里**词内下划线不成强调**（本项目路径均为词内下划线），
  已知边界：路径含 `*`/`` ` `` 等会触发 Markdown 语义（罕见，登记）。
- **右栏·边界条目**：**保持结构化表格**（不渲染）——理由：每条边界是**结构化数据**（root/kind/path/condition），
  表格才是正确形态；其中 purpose/condition 是短句，无 Markdown 语义价值。
- **卡片·回交摘要**：`appendHandback` 的 `hb-summary` 由 `esc` 改为 **`Md.renderMarkdown(hb.summary)`**
  （角色产出的报告文本），容器加 `card-md` 钩子。**证据列表保持逐条 `esc`**（`hb-ev`——不拼成一段 Markdown）。
- **卡片·派发投递卡**：`mi-body` **本轮前已走 `Md.renderMarkdown`**（H-1 落地即如此）——本轮**无改动**，
  如实说明（非新接入点）。
- **样式通用化**：`.card-text.card-md X` 族收敛为**通用 `.card-md X`**（角色卡/变更记录/文档索引/回交摘要
  共用同一套块级排版；`.card-text.card-md` 仅多一条解除 `pre-wrap`）。
- **测试**：`renderer.test.ts` N-4 例（三接入点各断言「经 Md」+ 旧纯文本路径退役 + XSS 反向用例三条
  〔`<script>`/`<img onerror>`/`<iframe>` 均不得成标签〕+ 证据列表仍逐条 esc + esc 单一来源未破 +
  `card-md` ≥4 处共用）；T20 既有例更新为新机制（摘要经管线仍属「模型输出禁直插」）。
- **证据**：`test/桌面应用` **149 计/148 过/1 红**（唯一红=既有环境红）；全量 **847/844 · 2 红**（两红均既有
  环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
