---
id: shell-confirm-card
type: change
title: M-1 美化 shell 确认框——应用内确认卡替代原生对话框
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [shell-arm]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户看截图裁定「这个太丑了」——原生 dialog 确认框（技术文本墙）改为应用内卡片
  - date: "2026-10-12"
    kind: implemented
    summary: operator-channel.ts 增 shellIntentSummary/plainReasonFor/buildShellConfirmRequest/createShellConfirmPresenter；main.ts 新 shell:confirm-request/response 通道（原生对话框退役）；renderer 应用内卡（拒绝默认焦点/Esc/关闭=不放行）；preload 两方法
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 141 计/140 过/1 红（唯一红为既有环境红）；全量 836/833/2 红（两红均既有环境红）；typecheck 0 错
---

# M-1：shell 确认框改应用内卡（客户裁定「这个太丑了」）

**来源**：客户看截图原话「这个太丑了」。**属本角色边界内**（只动 `app/**` + `test/桌面应用/**` + 本页）。
**fail-closed 逐字不变**：关闭（×）/ 取消 / Esc / 超时 / 通道不可用 → **不放行**；拒绝为**默认焦点**。

## 改在哪（文件 → 改动）

- **数据面（纯函数，`app/desktop/operator-channel.ts`）**：
  - `shellIntentSummary(command)`——白话摘要**只取命令首词**（可执行名）：`它会在项目里执行：<首词>`；
    无从概括（空命令）⇒ `null`（渲染侧隐藏该行）——**绝不编意图**；
  - `plainReasonFor(reason)`——升级原因 → **人话**：`risky` →「判定有风险，按规则必须你亲自确认」；
    超时 / 解析失败（原 non-json）/ 报错 / 不可用 / 拿不准各有专句；**未识别一律给通用 fail-closed 句**
    （不把「pm 判定 JSON 不合法」之类内部行话丢给客户，也不替审核编结论）；原始措辞只进**折叠详情**供核查；
  - `buildShellConfirmRequest(id, display)`——`{id, command(逐字), summary, reasonPlain, reasonRaw, argvLines, cwd}`；
  - `createShellConfirmPresenter({present, cleanupAfterMs?, env?})`——呈现端：推数据面 → 等回包；
    **恰 `allow:true` 才放行**（缺字段/非布尔=拒绝）；未知/已失效 id → `{ok:false, expired:true}`（**不放行**）；
    关窗 ⇒ `rejectAllPending`（全部不放行）；清理兜底（缺省 = 通道超时+5s，只做内存清理+兜底不放行，
    **判定语义以通道先到者为准**：超时仍是 `unavailable`）。
- **通道（`app/main.ts`）**：原生对话框 presenter **退役**；`shell:confirm-request`（主→渲染，数据面）+
  `shell:confirm-response`（渲染→主，决定）两端接线；推达失败（窗口已关）⇒ 抛错 ⇒ 通道 `unavailable`
  （绝不当「没人问就放行」）。arm 语义不变（两件同备才 arm；仅项目角色；su 不 arm）。
- **preload（`app/preload.cjs`）**：`onShellConfirm` / `shellConfirmRespond`（白名单两通道）。
- **卡片（`app/renderer/{index.html, renderer.js, styles.css}`）**：弹层 `#shell-confirm.sc-overlay`——
  标题「shell 命令请求」；命令**逐字**在等宽 `<pre>`（不折行、可横向滚动，`textContent` 落入无注入口）；
  白话摘要位（空则隐藏）；人话版「为什么问你」；`<details>` 技术详情**默认收起**（argv 逐项 JSON 转义 +
  「引号仅为界定符」注明 + cwd + 审核原文）；按钮 `放行执行 / 拒绝`（拒绝为默认焦点）；Esc（全局 keydown，
  仅在卡挂起时生效）/ 关闭（×）/「拒绝」一律回 `{allow:false}`；受理 ⇒ 收起；失效/回传失败 ⇒ **如实终态**
  （禁用动作键 + 「未获放行」字样——绝不呈现为已放行）。**无计时器**（G-1 纪律：卡片不按时间自我定格）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- `operator-channel.test.ts`（**23/23**）：数据面（摘要只取首词/不编；人话映射逐档断言**不含内部用语**；
  命令逐字含元字符）；presenter（恰 allow 放行 / 缺字段拒绝 / 未知 id expired / 关窗全部不放行 /
  清理兜底不放行无泄漏 / 推达抛错上抛）；**原生对话框退役**源码钉（main 无该 API、两通道两端齐备）。
- `renderer.test.ts`：卡片结构钉（命令在 `<pre>`、摘要/原因位、`<details>` 默认不含 open、按钮文案）+
  fail-closed 钉（拒绝默认焦点、Esc/关闭/拒绝=allow:false、恰 true 才放行、失效态如实）+ 样式钩子 + 命令块横滚。
- **fail-closed 三连保留**（既有：拒绝/超时/抛错 → 不放行）+ 新增 presenter 级"关窗/未知 id"两钉。
- e2e 增 `SHELL_CONFIRM_*` 探针（结构/默认焦点/详情收起/Esc→expired 如实；本机未跑，如实登记）。
- `test/桌面应用` 全套 **141 计 / 140 过 / 1 红**（唯一红=既有环境红 pi-config）；全量 **836/833 · 2 红**
  （两红均既有环境红）；`npm run typecheck` **0 错**。

## 取舍与登记

- 折叠详情里保留「审核原文（内部用语，仅供核查）」一行——人话句不含行话；原文藏折叠处供排障（若客户不想要可删一行）。
- 摘要只给**首词**（最保守、纯事实）；不解释命令参数语义（「别编」纪律）。
- 卡片允许不限期停留（无计时器）；主进程通道超时（120s）先到会判 `unavailable`（不放行），此后客户端再点
  将收到 `expired` 并按失效态呈现。
