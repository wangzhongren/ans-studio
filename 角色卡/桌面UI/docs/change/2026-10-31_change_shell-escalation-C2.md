# shell 判拒后的客户确认通道 —— 桌面UI 升级卡与暂停视图（C2）变更记录

- 日期：2026-10-31｜任务：`2026-10-31-shell-deny-customer-escalation`（T3）｜节点：**C2 桌面UI**
- 状态：`implemented-unverified`（实现完成、渲染层测试/typecheck/构建通过、桌面UI 离线冒烟通过；**真实应用 E2E 验收归 D2**，本节点不声称验收）
- 依据（只读）：客户确认方案 v1.3（857 行 / SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`，重点 §4.6/§6.5(a)(e)/§7.1/§7.2/§7.3/§9）；团队计划（575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`）；实施前标准 V1（1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`，P1/P4/P8/P9/G1）；C1 桌面接线冻结报告（`角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-C1.md`，141 行 / `e970346c…`）；A1/B1 冻结报告；A3 i18n 冻结键表。
- 基线：worktree `flow-improvements-wave1` HEAD `9f670fb2c7d403baf995071055d697c50714c905`；Node v24.22.1 / npm 11.19.1 / win32 x64 / Git Bash（MINGW64_NT-10.0-26300）。
- 纪律：未 commit / 未 push；未改 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、其他角色测试目录、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML、i18n messages；未新增 skip/todo；未改断言保绿；写集外改动 = 无（详见 §七）。

## 一、写集与逐文件写前/写后哈希

哈希口径：`git hash-object`（blob，工作区字节）+ `sha256sum`（原始字节）；写前清单 `00-pre-hashes.tsv`，写后 `30-post-hashes.tsv`。`ConfirmCard.tsx` 以 LF 完整重写（worktree 既有文件为 CRLF；内容 diff 正常，Git 将在下次触摸时按 `core.autocrlf=true` 转回 CRLF），哈希按工作区原始字节记录。

| 文件 | 写前 blob / sha256 | 写后 blob / sha256 | 行数（后） |
| --- | --- | --- | --- |
| `app/renderer/src/shell/ConfirmCard.tsx` | `34b948a66f9777399de0a73d0539ea9a502cdc2b` / `ac5e5d9c1813f79b3751875dec07aee0a23c35ecd5c49e5431e87a971f2261e4` | `df7df1b20f9c39f2d877c55023dd4f53cde93e3c` / `4b59785b686a71518ce580c792dd66bb2733a56c9d3ef803b5e3cbd6c834c870` | 701 |
| `app/renderer/src/stores/confirm-store.ts` | `3a701f9ea2bc893614e6746c2d93d00141c12d0e` / `d04cc0d22603a31d96efe1246ef928cdeeb5cbb64d865d965d1e5e1da0032f92` | `b1fc08c47f572bdd09bab5a6e934cae862f5bbd5` / `db864332fab2faa399212a03089e9e0dec863152b0e31a60c157b9fa3268f2a1` | 560 |
| `app/renderer/src/chat/ipc.ts` | `88a1366efdef7e61fd98bd2eed9d00721e2ab687` / `f477db8dad167a6fbccc92b4bc99318f7c9afe51eab35a4423f3a3b524f6cb69` | `470ae6d584307e4396e3004b6da84f60bf4743f7` / `51fc14bf8f3ce697a9733806202fede127c4fe02807198e97def89654e6b410f` | 567 |
| `app/renderer/src/lib/platform.ts` | `3b400da0dfa5fcb50566dca97fd389d0537e99d4` / `33ab4c58e54d58a2a1aec9c26e39051a6ce3c9d092e3809fd0f7cb39b89ea571` | `eff38c7cce84951b4b90cadfc6219f665663d6af` / `08f0d5c417f3a61ba4100c7cb4cc819cdd43b49d66bc72e73431b2a89b6dffd4` | 256 |
| `app/renderer/src/chat/judge.ts` | `57297926e7d66fa203f976edc74ddcbebb45b193` / `c8c4e4ce6184e0e73e429059f63be377f4ebcd4c96a0be42389ea267855beff8` | `2f3b9956ab6803c641a2e9f958d89ae42904f31b` / `c42358ba50fa1fa081ebace940668bbb2901740a8b460791dfa5734db0cfee06` | 883 |
| `app/renderer/src/chat/judge-row-view.ts` | `a3c2e43ccc728c472d2876626e004a952215023a` / `e2d36d142859600cc2daacfc672b21f3cf754f5117344f980575d85a3f655205` | `aeb0530b9ef5c2fbf0671f9541e56ffdf0316d9c` / `1986f9238b15b20d7323b531a4929e34f2eef01199faac7ce37e7a1846a7a80d` | 497 |
| `app/renderer/src/shell/shell.css` | `e932d496e06f8370aeb3c9b38793d49180e92e78` / `b62f0b9a3d0dbbc78ea75f9fc3952d2f804883d748aff19ab635070dd09cf8f8` | `093e12c0b3aa3f1e550c5b5697e5cc80a5f59a26` / `e81246486c20f7b752101732155b5e18769799f7d1123eab5356c3337a3207af` | 3257 |
| `test/桌面UI/judge-row-view.test.ts` | `a4d34de42ba77f64b993343cd6aa8e64d72d23df` / `7bdf25c8c3812b2b1e9216739fdad316d51830e65bf47024e5f2c4c183f49e6d` | `52b939193513b938f721ae935b03590bb5ebf76c` / `1c1caabb89d858f13f22181c611c7d5f66dca2d0a2c8b165b5d74e9a92dfb158` | 222 |
| `test/桌面UI/shell-escalation-view.test.ts`（**新增**） | —（不存在） | `f97665ac6709267a74664f47847071a76fe436fe` / `f6390e3e26f7d02c4da5a283932edb3352159e662377e7ed2477188fb432212e` | 385 |
| `test/桌面UI/phase5a-electron-smoke.mjs` | `2672b2d24262c0cf5b2172249d9147ae9b5738ce` / `5618c949979cd96ec7d2f3dbc1cf8248e6a8e2e531ffad371a67a7653844b17e` | `4ecf2f765a9e3075edcd1f2c0b38511fe1bd7fa6` / `fb15e86c83b6534a525c2f4b26d515fa0480caa01a155006c09b16c9eaee0147` | 379 |
| `test/桌面UI/confirm-logic.test.ts` | `c6d205deeea327b6a4e5a2a9e6fd86111d1d8ad2` / `43beae7a63aa15121dcff7362c4823d532b8f92e3099efef53f03c950ce167a2` | **同左（按需评估后未改）** | 141 |
| `test/桌面UI/judge.test.ts` | `afc1f278f9400ffe3405eede2e46dcb5c9188098` / `3b2046ef3541d41eba898f0a2a28f58c9183d0f57413ccc9d20ae4e5480faf2e` | **同左（未改）** | 210 |

`git status`（本节点写入面）：上述 7 个 `app/renderer/src/**` 修改 + 2 个 `test/桌面UI/*.test.ts` 修改 + 1 个新测试 + 1 个冒烟脚本修改；暂存区空；无写集外改动（§七）。

## 二、实现要点（消费 C1 冻结 IPC/preload，不重写判定）

### 2.1 `app/renderer/src/shell/ConfirmCard.tsx`

- **保留既有审批卡/恢复卡逐字渲染与布尔回包**（`#shell-confirm`、`#recovery-confirm`、`#rc-details` DOM 契约不变；恢复卡「等待不设限/失效定格」语义不变）。
- 新增 **`#shell-escalation` 升级卡**（`kind:"escalation"`）：
  - 标题/说明/`judge 判拒说明`（reason/customerMessage/alternative）/命令**逐字原文**（`#se-command`）/cwd/argv 行（`#se-details`、`#se-cwd`、`#se-argv`）。
  - **必要性独立区块**（`#se-necessity` + `#se-necessity-note` + `#se-necessity-text`）：`necessity` 原样展示（React 文本节点转义），固定标注「由角色提供，未经验证」；不作为标题/选项来源。
  - `customerNotJudgeNote`（`#se-customer-note`）：「客户手批 ≠ judge 放行」。
  - **三按钮**：允许一次（`#se-allow-once`）/ 本会话允许该精确命令（`#se-allow-session`）/ 拒绝（`#se-reject`，默认焦点）；关闭 × 与 Esc = 拒绝（fail-closed）。
  - **页脚次要动作**「暂停本次运行自动审批」（`#se-pause`）：只调用 `setShellJudgePaused(true)`（不是第四决定项）；已暂停时显示徽标（`#se-paused-badge`）与恢复；旧桥缺省 ⇒ 禁用 + 说明。
  - 卡片按 `kind` 路由：`shellConfirmKind()`；升级卡渲染时审批卡不呈现（单槽），恢复卡仍在 DOM 中按既有优先级处理。
- **过期/未知 id**：回包 `{ok:false, expired:true}` ⇒ 收起 + composer-hint（`ui.confirm.escalation.expired`）；`session:operator-expired` ⇒ 收起 + 主进程原因（缺省升级卡文案）。重复提交由 `busy` 拦截。

### 2.2 `app/renderer/src/stores/confirm-store.ts`

- `receiveShell` 按 `shellConfirmKind(payload)` 路由；**单槽呈现**：当前卡为升级卡时忽略异类审批卡（主进程按 C1 冻结仲裁等待并重推），当前卡为审批卡时忽略迟到升级卡；同类卡片沿用既有幂等重推/替换语义。**渲染侧不会互相覆盖**。
- `respondShell` 只对审批卡发 `{id, allow}`（对升级卡直接返回）；新增 `respondEscalation(action)` 发 `{kind:"escalation", id, action}`（经 `shellEscalationRespond`），回包经 `shellEscalationResponseOutcome` 收起/提示。
- **旧主进程缺省降级**：`bridge.shellEscalationRespond` 缺席 ⇒ 不回传、不假造成功，保留卡片并如实提示 `ui.confirm.failedShell`（通道未接，fail-closed）。
- `expireShell` 同时服务两类卡；缺省原因按当前卡 `kind` 选择升级卡/审批卡过期文案。`closeStaleShell`/`dismissShell` 单槽语义不变。

### 2.3 `app/renderer/src/chat/ipc.ts` / `lib/platform.ts`

- `DesktopBridge` 增 `shellEscalationRespond?`、`setShellJudgePaused?`、`ShellJudgeState.paused?`（另导出 `ShellJudgeState`/`ShellJudgePauseReply`/`ShellEscalationAction`）；`getShellJudgeState` 返回类型收窄为 `ShellJudgeState`。
- `installChatRuntime` 调用 `installJudgePauseBridge(bridge)`：探测暂停能力、订阅 `onShellJudgeState`、读取一次 `shell:judge-get`；**旧 preload 缺方法 ⇒ `available:false`（按钮禁用 + `ui.judge.bridgeMissing` 说明）**，不显示假暂停态。
- `handleShellConfirm` 对异引擎仍写缓存；当前视图按 kind 守卫（异类卡不写缓存/不覆盖当前卡），其余行为（`noteShellId`、重放、settled 收起）不变。

### 2.4 `app/renderer/src/chat/judge.ts` / `chat/judge-row-view.ts`

- `judge.ts`（纯函数）：`shellConfirmKind`/`isShellEscalationPayload`、`shellEscalationView`（标题/说明/判拒事实/必要性/客户手批声明/三动作文案/过期文案；缺省 `argvLines` 退回 `argv`；缺省标注用 A3 固定文案）、`shellEscalationResponsePayload`/`shellEscalationResponseOutcome`、`judgePauseState`/`judgePauseReplyResult`。
- `judge-row-view.ts`：判拒结果行（`verdict==="deny"`）新增暂停控件——可暂停 → `ui.judge.pauseSession` 按钮；已暂停 → `ui.judge.pausedBadge` 徽标 + `ui.judge.resume` 恢复按钮；本节点触发成功 → `ui.judge.pauseSessionDone` 说明；失败 → 错误行；旧桥缺省 → 禁用 + 说明。allow 行不出现暂停控件；既有版本/理由/替代方案/证据/详情结构未改。
- 暂停状态为模块级单源（`useSyncExternalStore`），判拒行与升级卡页脚共享；`setShellJudgePaused` 回包以主进程为准（失败保留/采用主进程当前 `paused` 并如实报错）。

### 2.5 `app/renderer/src/shell/shell.css`

- 新增 `.sc-overlay.is-escalation`、`.sc-intro`、`.se-section`/`.se-necessity`（琥珀警示）、`.se-necessity-note`/`.se-necessity-text`、`.se-customer-note`、`.se-footer`/`.se-pause`/`.se-paused-badge`/`.se-pause-note`（含 `is-done`/`is-error`）与判拒行 `.sj-pause*` 样式；沿用既有设计令牌（`--warning*`、`--text-*`、`--radius-control`、`--font-mono` 等）。

## 三、渲染消费面声明（C1 IPC/preload 契约）

1. **`shell:confirm-request`（复用）**：审批卡缺省/`kind:"approval"` ⇒ 既有审批视图；`kind:"escalation"` ⇒ 升级卡视图。消费字段逐字对齐 C1 §三：`version/id/requestId/roleId/projectRoot/runtime/command/argv/argvLines/cwd/judgeReason?/judgeCustomerMessage?/judgeAlternative?/necessity?/necessityNote?/approvalContext?/expiresAt?/customerNotJudgeNote/actions`。`approvalContext` 本节点不额外展开（卡面已含命令/argv/cwd 与 judge 事实）；`expiresAt` 不在渲染侧计时（过期由主进程回执/推送驱动）。
2. **`shell:confirm-response`（复用）**：审批卡 `{id, allow}` 逐字不变；升级卡 `{kind:"escalation", id, action}`（恰三动作）。未知/过期/重复/非法动作 ⇒ 主进程 `{ok:false, expired:true}` ⇒ 渲染收起 + 如实提示，绝不呈现为已允许。
3. **`shell:judge-pause`（新增）**：`setShellJudgePaused(paused)` → `{version:1, ok, paused, error?}`；渲染只提交意图，以主进程回包/推送为准。
4. **`shell:judge-state`/`shell:judge-get`（扩展）**：读取可选 `paused`；旧主进程缺字段 ⇒ 忽略（不假造）。
5. **旧桥降级**：`shellEscalationRespond` 缺席 ⇒ 升级回传能力禁用（保留卡 + 如实提示）；`setShellJudgePaused` 缺席 ⇒ 暂停/恢复按钮禁用 + 说明；不新增任何 Node/文件系统能力。
6. **卡族不变量**：升级卡排他、审批卡由主进程等待；本节点在渲染侧单槽守卫，同一时刻只呈现一张 shell 卡；治理 approval 组与「替我决策」不接入（暂停只读 shell 通道）。

## 四、检查与证据（原始日志）

环境：Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；HEAD `9f670fb`。证据目录：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\C2\`（下称 `$EV`）。

| 命令 | 退出码 | 结果 | 证据（行数 / sha256） |
| --- | --- | --- | --- |
| B0：`node --test "test/桌面UI/**/*.test.ts"` | 0 | **337 / 337 pass / 0 fail / 0 skip / 0 todo** | `01-baseline-tests.log`（345 / `2d003dbe…c0a14`） |
| B0：`npm run typecheck:renderer` | 0 | 无输出 | `02-baseline-typecheck-renderer.log`（4 / `dddee1c8…26cc6`） |
| B0：`npm run build:renderer` | 0 | `✓ built` | `03-baseline-build-renderer.log`（22 / `c86a9b34…19ca7`） |
| **`node --test "test/桌面UI/**/*.test.ts"`**（终态） | **0** | **350 / 350 pass / 0 fail / 0 skip / 0 todo**（+13：升级卡视图 11 + 判拒行暂停 2） | `20-desktopui-suite.log`（358 / `1ac5bad9…05980`）；`.exit` |
| **`npm run typecheck:renderer`**（终态） | **0** | 无输出 | `21-typecheck-renderer.log`（4 / `dddee1c8…26cc6`）；`.exit` |
| `npm run typecheck`（仓库根；附加核对） | 0 | 无输出 | `22-typecheck-root.log`（4 / `2d13ff10…900435`）；`.exit` |
| **`npm run build:renderer`**（终态） | **0** | `✓ built in 334ms`（既有 chunk 警告不变） | `23-build-renderer.log`（22 / `80226780…4a49f`）；`.exit` |
| **phase5a 离线 Electron 冒烟**：`./node_modules/.bin/electron test/桌面UI/phase5a-electron-smoke.mjs app/renderer/dist/index.html "$EV/24-smoke-out"` | **0** | **47 / 47 checks / 0 failures / 7 截图**；升级卡 4 项检查全过；`no console errors`/`no CSP violations` | `24-phase5a-smoke.log`（49 / `e82c0e03…28af49`）；`24-smoke-out/report.json`（258 / `7ffff24f…47e28`） |
| 写前/写后哈希清单 | — | 11 行 / 11 行 | `00-pre-hashes.tsv`（`8c52feed…b2750`）；`30-post-hashes.tsv`（`1b8b4133…758f4c`） |
| 环境记录 | — | HEAD/Node/npm/OS | `00-pre-environment.txt`（4 / `c7710f1a…5962`） |

### 4.1 失败分类（对照 B0）

- B0：`test/桌面UI/**` 337/337 pass / 0 skip；`typecheck:renderer`、`build:renderer` 均 exit 0。
- C2 终态：350/350 pass；**新增确定性失败 = 0 / 新增 skip = 0 / 新增 todo = 0**；typecheck:renderer 与 build:renderer exit 0；仓库根 typecheck exit 0；phase5a 冒烟 47/47、0 failures。
- 失败分类：**无失败**。仅观察到既有 `INEFFECTIVE_DYNAMIC_IMPORT`/chunk 体积提示（B0 同样存在，非新增）。

### 4.2 既有测试的变更性质

- `test/桌面UI/judge-row-view.test.ts`：**仅新增 2 条**暂停控件测试（旧桥禁用说明 / 可暂停-已暂停-失败态），既有 6 条断言未改动、未弱化。
- `test/桌面UI/phase5a-electron-smoke.mjs`：**仅新增**升级卡 4 项检查与对应 fixture/过期收尾；既有 43 项检查与流程未改。新增检查覆盖：三按钮/命令原文/必要性标注/客户手批声明、旧 preload 暂停禁用说明、旧桥缺 `shellEscalationRespond` 时不假造、失效回执收起并提示原因。
- `test/桌面UI/confirm-logic.test.ts`、`test/桌面UI/judge.test.ts`：按需评估后**未改**（哈希同前）。

## 五、未解决项 / 偏差披露

1. **真实应用 E2E/截图缺失**：本节点只跑渲染层单测与离线 Electron 冒烟（stub preload；无模型/网络/真实 IPC 主进程）。P1/P4/P8/G1 的真实截图、三选项、暂停/恢复、窗口重开/重启清零、卡片仲裁时序证据由 **D2** 按 V1 §4.6 场景矩阵补齐；本报告不声称验收。
2. **暂停能力的新桥路径只由单测覆盖**：phase5a 的共享 stub preload（`phase4b-smoke-preload.cjs`）未加 `setShellJudgePaused`/`shellEscalationRespond`，因此真实渲染冒烟验证的是**旧桥降级**（禁用 + 说明 + 不假造）；新桥的暂停请求/回包、升级三动作回传由 `shell-escalation-view.test.ts` 以受控 `window.desktop` 桩件覆盖。未修改共享 stub preload，避免影响 phase3b/4a/4b 冒烟。
3. **暂停不可用文案复用**：A3 i18n 键冻结，未新增「暂停能力不可用」专用键；渲染禁用说明复用 `ui.judge.bridgeMissing`（「当前版本不支持自动判断，保持手动」）。语义为「能力未接线」，不声称可暂停。
4. **暂停/恢复失败提示**：主进程返回的 `error` 原样展示；无错误串时用 `ui.judge.toggleFailed`。不新增文案。
5. **升级卡页脚额外提供「恢复」**：暂停后页脚在徽标旁提供 `ui.judge.resume`（与判拒行同一状态控制）；不改变三选项决定，也不构成第四决定项。若验收要求页脚严格只读徽标，可移除该按钮（低风险）。
6. **渲染侧单槽守卫**：异类卡到达时不覆盖当前卡（主进程按 C1 `waitForSlot`/`canPresent` 仲裁会等待或拒绝并重推）。这是对 C1 冻结仲裁的防御性配合，不是第二份判定。
7. **`expiresAt` 未在渲染侧计时**：过期以主进程回执/`session:operator-expired` 为准（与既有审批卡同口径），避免渲染侧第二时间源。
8. **行尾**：`ConfirmCard.tsx` 为 LF（原工作区 CRLF），Git `core.autocrlf=true` 下次触摸会转 CRLF；其余修改文件保持既有 CRLF。哈希按工作区原始字节记录。

## 六、渲染侧不变量自查（对照方案 §9 / V1 P1/P4/P8/P9/G1）

- fail-closed：升级卡无答复/超时/关窗 = 拒绝；旧桥缺回传/暂停 = 禁用并说明；不呈现为已允许/已暂停。
- 硬地板与判定：渲染侧不做任何「能否执行」判定、不调用 judge、不读「替我决策」；只呈现主进程判拒事实。
- 客户唯一决定者：三动作只由客户点击（或 Esc/× = 拒绝）触发；`necessity` 明确标注不可信、原样转义展示。
- 授权最小化/审计：渲染侧不构造授权、不写审计；仅回传 `{id, action}` 与 `{paused}` 意图。
- 单槽：升级卡排他；审批卡由主进程等待；渲染不互相覆盖。
- 暂停：shell-only、应用运行期；不写偏好（渲染侧无持久化）、不波及治理 approval 组；状态只源自主进程推送/回读。

## 七、无越权改动与纪律声明

- 仅写：`app/renderer/src/shell/ConfirmCard.tsx`、`app/renderer/src/stores/confirm-store.ts`、`app/renderer/src/chat/ipc.ts`、`app/renderer/src/lib/platform.ts`、`app/renderer/src/chat/judge.ts`、`app/renderer/src/chat/judge-row-view.ts`、`app/renderer/src/shell/shell.css`、`test/桌面UI/{judge-row-view.test.ts,shell-escalation-view.test.ts,phase5a-electron-smoke.mjs}`、本报告。
- 未写 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、其他角色测试目录、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML、`package.json`/锁文件/构建/发布配方；未改 A1/A2/A3/B1/C1 冻结文件；**未改 i18n messages**（只消费 A3 键）。
- 未 commit / 未 push / 未合并 / 未发布；未使用 stash；未暂存文件；未新增 skip/todo；未改断言保绿；未伪造输出。phase5a 冒烟启动的是离线 stub Electron 窗口（真实构建产物、无模型/网络/真实主进程），不是应用验收运行。
- 写集外改动：**无**。

## 八、E2 返工 R1 / AC-19 增量（2026-10-31）

> 来源：E2 返工 R1（升级卡渲染脚本上下文摘要）+ AC-19（判拒新措辞断言）。A3 已新增 5 个 key：`ui.confirm.escalation.contextHeader/contextPath/contextNpmScript/contextSha/contextNote`（A3 不新增其它 key）。状态行保持 `implemented-unverified`。

### 8.1 实现

- `app/renderer/src/chat/judge.ts`：`ShellEscalationView` 增 `approvalContext: ShellEscalationContextView | null`；新增 `ShellEscalationContextView`/`ShellEscalationScriptView` 与 `escalationContextView()`（从 `record.approvalContext` 只读解析，缺失/非法/空 ⇒ null；`scripts` 逐条校验，缺 path/label 或 sha256 的条目丢弃；`inWriteArea===false` 生成警示文案）。全部文案来自 i18n（5 个 A3 key；写区外警示复用既有 `main.customerInput.writePreauthorization.reason.boundary`——A3 未提供专用 key，未硬编码中文）。内容/路径/标签均视为不可信数据，纯视图不加工。
- `app/renderer/src/shell/ConfirmCard.tsx`：升级卡在 judge 区块与必要性区块之间新增独立 `#se-context`「脚本上下文」区块——`contextHeader`、`contextNote`（说明）、`contextNpmScript`（npm 脚本名）、每个脚本的 `contextPath`、label（与 path 不同时）、`contextSha`、`inWriteArea===false` 警示（`.se-context-warning`）；有界内容 `<pre class="se-context-content" data-bytes>` 原样转义展示；`approvalContext` 缺失/空 ⇒ 整块不渲染（旧卡兼容）。未改变三按钮/页脚暂停/必要性/客户手批声明语义。
- `app/renderer/src/shell/shell.css`：新增 `.se-context*` 样式（区块、note/npm/路径/sha/警示、脚本分隔、有界内容滚动；沿用既有令牌）。
- `test/桌面UI/shell-escalation-view.test.ts`：新增 2 条（脚本上下文 header/note/npm/路径/sha256/内容/写区外警示；缺失/非法/空 context ⇒ 不渲染区块 + 非法条目过滤），并扩展源码合同断言（`#se-context`、`se-context-warning`、`se-context-content`、`data-bytes`）；既有断言未弱化。
- `test/桌面UI/judge.test.ts`（AC-19）：保留旧子串 `关闭「替我审批」后重试`，新增 `retryHint.includes("可让角色申请客户确认")`（**第 68 行**）。
- `test/桌面UI/judge-row-view.test.ts`（AC-19）：保留旧子串渲染断言，新增详情行包含新措辞（**第 141 行**）。
- `test/桌面UI/phase5a-electron-smoke.mjs`：升级卡 fixture 增 `approvalContext`，新增 1 项真实构建渲染检查（路径/sha256/内容/写区外警示/说明/npm 脚本）；既有检查未改。

### 8.2 增量写前/写后哈希

写前清单 `40-pre-e2r1-hashes.tsv`（本增量开始前 = 上一轮 C2 终态）；写后 `60-post-e2r1-hashes.tsv`。

| 文件 | 写前 blob / sha256 | 写后 blob / sha256 | 行数（后） |
| --- | --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | `2f3b9956ab6803c641a2e9f958d89ae42904f31b` / `c42358ba50fa1fa081ebace940668bbb2901740a8b460791dfa5734db0cfee06` | `705b6b3b22e56b7fd7f08b17f72244e2c7637517` / `52d0556e3ce65f57d0eab47bb37ae1619e998ca043ef357645bee4790280d938` | 991 |
| `app/renderer/src/shell/ConfirmCard.tsx` | `df7df1b20f9c39f2d877c55023dd4f53cde93e3c` / `4b59785b686a71518ce580c792dd66bb2733a56c9d3ef803b5e3cbd6c834c870` | `d3301f5c096c083b4b79a72f3e2d62ec29f2b2fd` / `e4d284000782ee9f6dbb704b13b7802d621dbb9dc72619fd87f9267a46465c44` | 741 |
| `app/renderer/src/shell/shell.css` | `093e12c0b3aa3f1e550c5b5697e5cc80a5f59a26` / `e81246486c20f7b752101732155b5e18769799f7d1123eab5356c3337a3207af` | `b2877760cf41bcb674a6b3bb0524395d794cb78a` / `60d2aa36688f2f9cd7bdc3bb2459104437766b20be93d350ec877a1d3da7d870` | 3316 |
| `test/桌面UI/shell-escalation-view.test.ts` | `f97665ac6709267a74664f47847071a76fe436fe` / `f6390e3e26f7d02c4da5a283932edb3352159e662377e7ed2477188fb432212e` | `6f22b163c04423a00659b547a8c9ccc626614530` / `01862cb7c1e4f9d1bed2742d2c2403fb206bc46c34b83b8eb6a3aaa4f9586402` | 504 |
| `test/桌面UI/judge.test.ts` | `afc1f278f9400ffe3405eede2e46dcb5c9188098` / `3b2046ef3541d41eba898f0a2a28f58c9183d0f57413ccc9d20ae4e5480faf2e` | `9304b3ef5c634031f4dda57822d10ffd6c821ede` / `4c26fe284e08d935fb2b16ee863719c31f1e272ad88da7550880367955bdc29e` | 212 |
| `test/桌面UI/judge-row-view.test.ts` | `52b939193513b938f721ae935b03590bb5ebf76c` / `1c1caabb89d858f13f22181c611c7d5f66dca2d0a2c8b165b5d74e9a92dfb158` | `73c65adb1a2176e23b43ba70e1322249240d3ff0` / `7b1c5b3fb7144501c20288a8198028167bb140979d4f741ee62debd2dbee4649` | 224 |
| `test/桌面UI/phase5a-electron-smoke.mjs` | `4ecf2f765a9e3075edcd1f2c0b38511fe1bd7fa6` / `fb15e86c83b6534a525c2f4b26d515fa0480caa01a155006c09b16c9eaee0147` | `c89712d74780f6b5785ca78707e11f1e0cbf2e12` / `c68b74836f02e0285a6304d0054cbe2ed8f42ecc93cc8cdc176506e76cf0c62d` | 406 |

### 8.3 增量检查与证据

| 命令 | 退出码 | 结果 | 证据（行数 / sha256） |
| --- | --- | --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | 0 | **352 / 352 pass / 0 fail / 0 skip / 0 todo**（上轮 350 + R1 新增 2） | `50-e2r1-desktopui-suite.log`（360 / `a22bf549…97a81e`）；`.exit` |
| `npm run typecheck:renderer` | 0 | 无输出 | `51-e2r1-typecheck-renderer.log`（4 / `dddee1c8…26cc6`）；`.exit` |
| `npm run typecheck`（仓库根） | 0 | 无输出 | `52-e2r1-typecheck-root.log`（4 / `2d13ff10…900435`）；`.exit` |
| `npm run build:renderer` | 0 | 构建成功 | `53-e2r1-build-renderer.log`（22 / `4a43c25b…6cdcb3d`）；`.exit` |
| phase5a 离线 Electron 冒烟 | 0 | **48 / 48 checks / 0 failures**（新增脚本上下文检查通过）；无 console error/CSP 违规 | `54-e2r1-phase5a-smoke.log`（50 / `d14c38fe…ba1caf5`）；`54-e2r1-smoke-out/report.json`（263 / `81a94236…0082b6`） |

- AC-19 断言行号：`test/桌面UI/judge.test.ts:68`（`retryHint.includes("可让角色申请客户确认")`，旧子串断言保留于 :66）；`test/桌面UI/judge-row-view.test.ts:141`（详情行渲染新措辞，旧子串断言保留于 :139）。
- 失败分类：无失败；新增确定性失败 = 0 / 新增 skip = 0 / 新增 todo = 0。
- 写区外警示文案键说明：A3 仅新增 5 个 `context*` key、未提供写区外专用 key；渲染复用既有 `main.customerInput.writePreauthorization.reason.boundary`（「目标路径未匹配任何边界或不在可写范围内」），未新增 key、未硬编码中文。
- 未解决/偏差：`approvalContext.scriptPaths` 未单独成块展示（`scripts` 条目已含 path/内容/sha；无 `scripts` 时整块不渲染），如需展示未读取内容的路径清单需另开 A3 key；真实应用 E2E 仍归 D2。
