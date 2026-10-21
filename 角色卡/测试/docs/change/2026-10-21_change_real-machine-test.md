---
id: change-real-machine-test
type: change
title: macOS 真机验证——整机 e2e、打包应用空项目、角色名修复后开发版 Pi 真实模型/镜像卡
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [change-ui-platform-phase5b-final-verification, design-ui-platform-phase5-test-plan, change-ui-platform-phase5a-final-verification]
events:
  - date: "2026-10-21"
    kind: verified
    summary: macOS 26.6.2 arm64 真机；main.mjs 真实 Electron E2E_PASS=true/397 名/17 截图；打包应用加载空项目五角色/S0/设置/工作概览/资料/队列/关闭重开/黑绿 ANS 图标；开发版 Pi 真实模型 working→idle、无 console/CSP、无写盘确认卡
  - date: "2026-10-21"
    kind: corrected
    summary: 角色显示名修复（proposal→Draft/提案、nomination→Crew/组队、schedule→Steward/统筹）重建 dist（HTML c8ad0e82/JS 050776ec）后重启开发版重跑：角色树新称、无旧称，MIRROR 8/8，真实 Pi 回复 563 字、working→idle、无写盘/确认卡；打包 zip 仍为修复前构建（旧称）
---

# macOS 真机验证

**范围**：客户要求的“真机测试”，并在角色显示名修复、`build:renderer` 重建 dist 后按要求重启开发版重跑真实模型。三部分：① 官方 `main.mjs` 整机自检；② 打包 `ANS Studio.app` 启动、空项目五角色/S0/交互/图标/关闭重开/只读；③ 开发版应用接仓库 `.env` 的 Pi 真实模型链路与 MIRROR 镜像卡（不打印任何 `.env` 值）。**未改产品/测试断言/构建配置**，只写 `角色卡/测试/`；未 commit/push。

**结论**：**真机链路可运行；角色显示名修复在开发版 dist 已验证。** 整机 e2e 两次 `E2E_PASS=true`（修复前/后各 397 名）；打包应用（修复前构建）正常启动、入口包内 `dist/index.html`、preload/CSP/五角色/S0/交互/关闭重开均正常；角色修复后开发版角色树显示 **Draft / 提案、Crew / 组队、Steward / 统筹**，旧称不再出现，MIRROR 8/8，真实 Pi `deepseek-v4-flash[1m]` 完成 working→idle 回复，Markdown 正常，无 console/CSP，无写盘工具/确认卡。**待确认**：空项目状态行实际显示“尚无治理记录…”（MIRROR 种子项目状态行检查为 true）；真实模型会话自动写 `.ans/sessions`；打包 zip 仍是修复前构建（旧称），若要包内新称需重新打包/冻结。

## 一、环境与候选身份

| 项 | 值 |
| --- | --- |
| OS | macOS 26.6.2（build 25G83），Darwin 25.6.0，arm64（Apple M-series） |
| Node / Electron | Node **24.14.0** / Electron **44.7.0**（Chromium 152.0.7977.130） |
| 候选 HEAD | `224cf831f7a26fd2fac8af7155790a75fa31f6b5`（branch `main`） |
| **打包应用（修复前构建）** | 入口 `app/renderer/dist/index.html`；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`；zip `ANS-Studio-1.4.0-mac-arm64.zip`，405,227,230 B，SHA-256 `8e760887…` |
| **开发版最终 dist（修复后）** | HTML **`c8ad0e82…`**、JS **`index-Oqlp-kNL.js` = `050776ec…`**、CSS `76fad7ce…`；gzip9 **289,080B ≤307,200B**，CSP 严格；role-view.ts `83608a7e…` |
| 打包版本 | `ans-cli` 1.4.0，`ANS Studio.app` CFBundleShortVersionString 1.4.0 |

**包身份观察**：既有[独立验收报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)记录 zip 为 406,507,281 B / `edeeef…`；本轮 zip 为 405,227,230 B / `8e760887…`。进一步原因已确认：本轮 zip 是**角色显示名修复前**的构建（包内 dist 为旧 JS `f568e2aa…`，角色树仍是“报告员/提名官/召集人”）；开发版重建后的 dist 为 `c8ad0e82…`/`050776ec…`。**包内若要新称，必须重新 build+package 并重新冻结**。环境记录：[environment.txt](2026-10-21-real-machine-evidence/environment.txt)、修复后 dist：[model-fix/dist-meta.txt](2026-10-21-real-machine-evidence/model-fix/dist-meta.txt)。

## 二、整机自检（官方 main.mjs）

**命令**（OUTDIR 绝对路径临时目录；不使用仓库 `.env`，不接真实模型）：

```
ANS_E2E_PROJECT=<repo> \
ANS_E2E_OUTDIR=<abs tmp> \
ANS_RENDERER_ENTRY=<repo>/app/renderer/dist/index.html \
node_modules/.bin/electron test/桌面应用/e2e/main.mjs
```

| 轮次 | dist | 结果 |
| --- | --- | --- |
| 修复前 | HTML `3c4da2a2…` / JS `f568e2aa…` | exit 0；**E2E_PASS=true**；`E2E_FAILURES=` 空；397 名；17 截图 |
| 修复后（重建） | HTML `c8ad0e82…` / JS `050776ec…` | exit 0；**E2E_PASS=true**；`E2E_FAILURES=` 空；397 名；17 截图 |

`RENDERER_ENTRY=<repo>/app/renderer/dist/index.html`、`PROJECT=<repo>`。stdout 中 `Error: 修复探针：发送异常原文` 是 e2e **故意触发的 repair 夹具异常**，不是产品错误。

证据（修复后）：[report.txt](2026-10-21-real-machine-evidence/model-fix/main-e2e/report.txt)、[stdout.log](2026-10-21-real-machine-evidence/model-fix/main-e2e/stdout.log)、[17 张截图](2026-10-21-real-machine-evidence/model-fix/main-e2e/)（含 [S0/新称](2026-10-21-real-machine-evidence/model-fix/main-e2e/05-bootstrap.png)）。修复前证据保留在 [main-e2e/](2026-10-21-real-machine-evidence/main-e2e/)。

## 三、打包应用（修复前构建）：空项目五角色 / S0 / 交互 / 图标

> **注意**：本节包为 **21:53 构建的修复前包**，角色树仍是旧称（报告员 / 提名官 / 召集人）。它验证打包启动/入口/交互/图标/只读；**不证明包内已含角色名修复**。新称验证见 §四。

### 3.1 启动与入口

```
"/tmp/ans-studio-real-20261021-220141/ANS Studio.app/Contents/MacOS/ANS Studio" \
  --user-data-dir=/tmp/ans-real-userdata --remote-debugging-port=9333
```

- 进程启动；窗口标题 **ANS 治理会话工作台**；`show:true` 可见。
- CDP 目标 URL：`file:///tmp/.../ANS Studio.app/Contents/Resources/app/app/renderer/dist/index.html` → **包内 dist/index.html**。
- preload 桥：`window.desktop` 为 object，`listProject`/`pickProject` 为 function。
- CSP meta 存在；CDP `Log`/`Runtime` 收集 **console 错误 0、CSP violation 0**；无白屏。
- 空项目目录 `/Users/wangzhongren/code/vibeingcode/ans-testbed/ui-platform-new-demo`（仅 README.md + git init），通过真实 IPC 等价通道 `window.__ansRenderer.loadProject(<abs>)` 加载；`loadProject` 返回 **18ms**，UI 角色树/S0 在 1s 内可见。

证据：[empty-project.json](2026-10-21-real-machine-evidence/packaged/empty-project.json)、[packaged-stdout.log](2026-10-21-real-machine-evidence/logs/packaged-stdout.log)。

### 3.2 五角色 / 治理 / S0（修复前包，旧称）

| 项 | 实测 |
| --- | --- |
| 角色数 | **5**（`state.roles.length=5`，`hasRoles=false`） |
| 角色（包内旧称） | 主理 / Lead、报告员 / Rapporteur、提名官 / Nominator、召集人 / Convener、验收 / Proof |
| 分组 | 主入口；治理职能（内置） |
| 状态徽标 | 各角色 `未开启`（Lead 点击后 `空闲`），内置角色副标题“内置角色：随应用发布，无角色目录” |
| 治理模型 | `state.governanceModel = "trio"` |
| 治理记录 | `state.governanceRecord = { state: "missing" }` |
| 治理状态行 | 实测文案：**“本项目有 0 个项目角色，但尚无治理记录（.ans/project.json）。项目角色可按各自边界工作；治理角色暂时无法写入。”** |
| S0 标题 | **“项目尚未 bootstrap”** |
| S0 说明 | **“与 主理 / Lead 对话，让它把角色建出来；左树会随之长出。”** |
| S0 CTA | **“开始与 主理 / Lead 对话”** |
| 提及次数 | “项目尚未 bootstrap”最内层元素 **1 次** |
| 治理 CTA | `#btn-governance-empty-action` **不存在** |
| 项目名/路径 | `ui-platform-new-demo` + `/Users/wangzhongren/code/vibeingcode/ans-testbed/ui-platform-new-demo`（sidebar 960 下路径省略号，title/状态中保留完整路径） |

**状态行观察**：空项目 `#governance-status` 为“尚无治理记录…”文案，未显示“治理模型：三权 · 五角色”；`governanceModel` 状态确为 `trio`。修复后 MIRROR 种子项目的同名检查 `W6-C status line shows 三权 · 五角色=true`，说明有治理记录时状态行成立；空项目是**缺失记录文案优先**。**空态是否也要显示模型行，待 PM/UIUX 确认。**

截图：[1360 空态](2026-10-21-real-machine-evidence/packaged/empty-1360.png)、[960 空态](2026-10-21-real-machine-evidence/packaged/empty-960.png)、[Lead 打开后 1360](2026-10-21-real-machine-evidence/packaged/lead-open-1360.png)、[960](2026-10-21-real-machine-evidence/packaged/lead-open-960.png)。

### 3.3 交互

| 动作 | 结果 |
| --- | --- |
| 点击 Lead 树项 | `sessionOpenRoleId=liaison`；聊天 pane 打开；仍显示 S0 空态；输入框可用、send 未禁用；`#runtime-config-notice` 如实提示 **“Claude 配置不完整，缺：ANTHROPIC_API_KEY。请补齐后保存。”**（打包应用无 `.env`，符合预期） |
| 设置 | `#tab-pi` 打开抽屉；标题 **Claude 配置**；显示缺 `ANTHROPIC_API_KEY`；无崩溃 |
| 工作概览 | 标题 **主理 / Lead · 工作概览**；待处理 0 / 无待处理请求；排队 **无进行中或排队消息**；最近回交 暂无 |
| 角色资料 | 标题 **主理 / Lead · 角色资料**；角色卡/边界条目/变更记录/文档/待办队列可见；队列空态 |
| Esc / 焦点 | 设置关闭后焦点回 `tab-pi`；Esc 关闭抽屉后焦点回 `tab-card`；`drawerOpen=false` |
| 关闭/重开窗口 | 点 `#win-close` 后窗口关闭、进程保留；`open "ANS Studio.app"` 后 1s 内重开；项目/五角色/S0/治理 missing 状态保持 |
| 960 布局 | `documentElement.scrollWidth=960=clientWidth`，无横向溢出；1360 同样无溢出 |

截图：[设置](2026-10-21-real-machine-evidence/packaged/settings.png)、[工作概览](2026-10-21-real-machine-evidence/packaged/work-overview.png)、[角色资料](2026-10-21-real-machine-evidence/packaged/role-profile.png)、[重开 1360](2026-10-21-real-machine-evidence/packaged/reopen-1360.png)、[重开 960](2026-10-21-real-machine-evidence/packaged/reopen-960.png)。

### 3.4 图标

- 包内 `Contents/Resources/icon.icns`，SHA-256 `843d9526…`；sips 转 1024 PNG 后目视：**黑底圆角方形 + 浅绿 ANS lettermark**，与客户新图标一致。
- macOS 屏幕截图确认 Dock 中出现同一黑绿 ANS 图标（`screencapture -x` 本机权限允许）。

证据：[icon-1024.png](2026-10-21-real-machine-evidence/icon/icon-1024.png)、[Dock 局部](2026-10-21-real-machine-evidence/icon/dock-icon-crop.png)、[整屏](2026-10-21-real-machine-evidence/icon/dock-screen.png)、[icns 信息](2026-10-21-real-machine-evidence/icon/icon-info.txt)。

### 3.5 只读确认（打包应用）

空项目加载、五角色、设置、工作概览、资料、关闭重开前后：`find` 文件 mtime/size 清单 **完全一致**；`git status --porcelain` **保持空**；未生成 `.ans`；所有应用数据在临时 `/tmp/ans-real-userdata`。**打包应用未写项目。**

证据：[pre 文件清单](2026-10-21-real-machine-evidence/pre-state/new-demo-files.stat)、[post 文件清单](2026-10-21-real-machine-evidence/post-state/new-demo-files.stat)、[pre git](2026-10-21-real-machine-evidence/pre-state/new-demo-git-status.txt)、[post git](2026-10-21-real-machine-evidence/post-state/new-demo-git-status.txt)。

## 四、角色显示名修复后：开发版 + Pi 真实模型 / 镜像卡

### 4.1 重建 dist 与重启

- 修复源码：`app/renderer/src/chat/role-view.ts`（22:10:56，SHA-256 `83608a7e…`）将 `proposal→Draft / 提案`、`nomination→Crew / 组队`、`schedule→Steward / 统筹`；liaison/verification 不变。
- 重建 dist：22:11:42，HTML **`c8ad0e82…`**、JS **`index-Oqlp-kNL.js = 050776ec…`**、CSS `76fad7ce…`；gzip9 **289,080B**、CSP 严格（[csp-gzip.txt](2026-10-21-real-machine-evidence/model-fix/csp-gzip.txt)）。
- 重启开发版（杀掉旧 Electron 进程，新临时 userData）：

```
./node_modules/.bin/electron app/main.ts \
  --user-data-dir=/tmp/ans-model-userdata-fix --remote-debugging-port=9335
```

- 入口 `app/renderer/dist/index.html`；preload 桥正常；CSP meta 存在。
- 引擎菜单：**Pi = 已配置**；Codex = 缺配置；Claude = 缺配置。`state.runtime="pi"`。
- 空项目加载：`hasRoles=false`、5 角色、`governanceModel=trio`、`governanceRecord=missing`、S0 正常。

### 4.2 角色树 / 镜像卡新称

- 角色树实测：**主理 / Lead、Draft / 提案、Crew / 组队、Steward / 统筹、验收 / Proof**。
- 旧称检查：body 中“报告员”“提名官”“召集人”均为 **false**；新称三项均为 **true**。
- 截图：[tree-1360.png](2026-10-21-real-machine-evidence/model-fix/tree-1360.png)、[tree-960.png](2026-10-21-real-machine-evidence/model-fix/tree-960.png)。
- **MIRROR 真机套件**（`ANS_MIRROR_UI_ONLY=1`，新 dist）：**MIRROR_UI_PASS 8/8**，包括：
  - `W6-C five-role tree: Liaison primary; governance display names Draft/Crew/Steward/Proof` = true
  - `W6-C status line shows 三权 · 五角色` = true
  - `W6-C mirror card rendered in Liaison with badge/source label and same request id` = true
  - 其余镜像冻结/源面/队列聚合 5 项 true
- 证据：[MIRROR report.json](2026-10-21-real-machine-evidence/model-fix/uiux-mirror/report.json)、[stdout](2026-10-21-real-machine-evidence/model-fix/uiux-mirror/stdout.log)。

### 4.3 真实模型发送与状态流转

- 点击 Lead 打开会话（`sessionOpenRoleId=liaison`），输入并发送（未发送任何写盘指令）：
  > 先用一段话说明你在这次空项目 bootstrap 中的计划与需要我确认的事项，不要写任何文件。
- 模型（非机密）：provider **ans-gateway**，`ANS_PI_MODEL` = **deepseek-v4-flash[1m]**，context window 262144，thinking level medium。
- 状态流转：**空闲 → 工作中（467ms）→ 空闲（4,574ms）**；工作态截图 [model-working-1360.png](2026-10-21-real-machine-evidence/model-fix/model-working-1360.png)。
- 时延（以会话 JSONL 用户消息为起点）：**首个模型活动 1.375s**（thinking + `list_dir`）；**最终正文 4.195s**；UI settled **4.574s**；最终正文 **563 字**（会话）/ UI 543 字。
- 工具调用：本轮仅 **`list_dir`**（只读）；**无写盘工具**；**无确认卡**（`confirmCards=0`），未点任何放行/确认。
- 回复内容：先确认目标/范围/质量档位/验收标准，再写意图记录并发需求确认卡，明确“在这之前不会创建任何文件”；Markdown 渲染 `<p>`/`<strong>`/`<code>` 正常。
- console 错误 **0**、CSP violation **0**、无白屏；960/1360 均无横向溢出。

截图：[最终 1360](2026-10-21-real-machine-evidence/model-fix/model-final-1360.png)、[最终 960](2026-10-21-real-machine-evidence/model-fix/model-final-960.png)、[工作态](2026-10-21-real-machine-evidence/model-fix/model-working-1360.png)。

### 4.4 只读确认（真实模型）

- README SHA-256 前后一致：`84388030a97a4a662f5090b1439c83a6a865a6b87dc8f1827fdc594736d42649`。
- 无源码/README/治理文件写入；未生成 `.ans/project.json`；模型无写盘工具、无确认卡。
- **app 自动写入会话历史**：`.ans/sessions/liaison/pi/` 下 3 个文件，共 **42,249 B**：
  - `ans/index.json`（251 B）
  - `ans/replay.jsonl`（5,686 B）
  - `native/2026-10-21T14-12-29-313Z_01a15ece….jsonl`（36,312 B）
- `git status` 由空变为 `?? .ans/`；未发现 `.env` 令牌/base URL 字符串写入会话（敏感键计数 0）。
- **结论**：**模型未写项目源码；app 自动持久化会话历史**。若客户要求项目目录绝对零写入，需要产品决定是否把会话历史迁到 userData 或测试时排除 `.ans/`。

证据：[model-run.json](2026-10-21-real-machine-evidence/model-fix/model-run.json)、[timings.txt](2026-10-21-real-machine-evidence/model-fix/timings.txt)、[pre/post 文件清单](2026-10-21-real-machine-evidence/post-state/model-fix-demo-files.stat)、[post git](2026-10-21-real-machine-evidence/post-state/model-fix-demo-git-status.txt)、[dev stdout](2026-10-21-real-machine-evidence/logs/model-fix-dev-stdout.log)。

> 修复前 dist 的真实模型运行（5.376s/510 字，`list_dir`+`read_file`）已被本轮取代，证据保留在 [model/](2026-10-21-real-machine-evidence/model/) 供对照。

## 五、发现与待确认

1. **角色显示名修复已在开发版验证**：角色树与 MIRROR 8/8 均为 Draft/Crew/Steward/Proof，旧称不再出现。**打包 zip 仍是修复前构建（旧称）**；若交付包必须含新称，需重新 `build:renderer` + `package:local` 并重新冻结/复验。
2. **空项目状态行未显示「三权 · 五角色」**：空项目 `#governance-status` 为“尚无治理记录…”；MIRROR 种子项目同名检查为 true。若空态也要求模型状态行，这是缺口；若“缺失记录优先”是设计，需在验收口径中明确。**待 PM/UIUX 确认。**
3. **真实模型会话自动写 `.ans/sessions`**：模型只读、无写盘；但 app 自动持久化会话历史，导致空项目不再“文件零变化”。需产品确认是否接受，或将测试证据范围限定为“无源码/治理写入”。
4. **包哈希与既有独立验收记录不同**：本轮 `8e760887…` / 405,227,230 B vs 既有 `edeeef…` / 406,507,281 B；原因已定位为包为修复前构建。需 PM 决定以哪个包为交付候选并重新冻结。
5. **main e2e 的 repair 异常**：stdout 的“修复探针：发送异常原文”为夹具故意触发，`E2E_PASS=true`。

## 六、未验证（missing-evidence）

- Windows 真机（含系统缩放 125%/150%/200% 以外的 DPI 组合）。
- 屏幕阅读器/辅助技术（VoiceOver 等）。
- **打包应用内**真实模型链路（本轮真实 Pi 在开发版验证；打包应用无 `.env`，未接模型）。
- **打包应用内新角色名**（包为修复前构建；需重新打包后复验）。
- 长时间稳定性、多窗口、多显示器、睡眠唤醒。
- 最终发布签名/公证/自动更新。

## 七、证据索引

| 项 | 路径 |
| --- | --- |
| 机器可读汇总 | [summary.json](2026-10-21-real-machine-evidence/summary.json) |
| 整机 e2e（修复后） | [model-fix/main-e2e/report.txt](2026-10-21-real-machine-evidence/model-fix/main-e2e/report.txt)、[stdout](2026-10-21-real-machine-evidence/model-fix/main-e2e/stdout.log)、17 张截图 |
| 整机 e2e（修复前） | [main-e2e/report.txt](2026-10-21-real-machine-evidence/main-e2e/report.txt)、`main-e2e/*.png` |
| 打包空项目（修复前包） | [packaged/empty-project.json](2026-10-21-real-machine-evidence/packaged/empty-project.json)、`packaged/*.png`、[embedded dist 哈希](2026-10-21-real-machine-evidence/packaged/embedded-dist-sha256.txt) |
| 修复后 dist/CSP | [model-fix/dist-meta.txt](2026-10-21-real-machine-evidence/model-fix/dist-meta.txt)、[model-fix/csp-gzip.txt](2026-10-21-real-machine-evidence/model-fix/csp-gzip.txt) |
| 真实模型（修复后） | [model-fix/model-run.json](2026-10-21-real-machine-evidence/model-fix/model-run.json)、[timings.txt](2026-10-21-real-machine-evidence/model-fix/timings.txt)、`model-fix/*.png` |
| MIRROR 镜像卡 | [model-fix/uiux-mirror/report.json](2026-10-21-real-machine-evidence/model-fix/uiux-mirror/report.json) |
| 真实模型（修复前对照） | [model/model-run.json](2026-10-21-real-machine-evidence/model/model-run.json)、`model/*.png` |
| 图标 | [icon-1024.png](2026-10-21-real-machine-evidence/icon/icon-1024.png)、[dock-icon-crop.png](2026-10-21-real-machine-evidence/icon/dock-icon-crop.png) |
| 只读前后 | `pre-state/`、`post-state/` 下 `new-demo-*`、`model-demo-*`、`model-fix-demo-*` |
| 复跑探针 | [probes/](2026-10-21-real-machine-evidence/probes/)（CDP eval/shot、packaged、model） |

**边界**：只写 `角色卡/测试/`；未改产品/测试断言/构建配置；未读/打印 `.env` 值；截图本地保留，未 commit/push。
