---
id: runtime-ui-persistence-contract-stale
type: fix
title: runtime-ui「无任何持久化」断言过期判定：HEAD 复现、renderer 只读核对与收紧口径（未越界修改）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: [runtime-ui, sidebar-persistence, desktop-ui]
events:
  - date: "2026-10-19"
    kind: verified
    summary: 干净 HEAD（144b803）复现 runtime-ui.test.ts:65 单红（12 计/11 过/1 红，exit 1）；确认 renderer 的 localStorage 仅侧栏宽度/收起两项 UI 偏好、无 sessionStorage/node:fs/require("fs")/动态 import、localStorage 邻近无凭据或审批/判断状态；判定为断言契约过期而非产品回归；因该文件属「桌面UI」白名单且角色卡禁止改他角色单元测试，本角色未修改，给出已用 7 个负向变异验证的收紧断言供属主落地。
---

# runtime-ui「无任何持久化」断言过期：HEAD 复现与收紧口径

## 结论

1. **HEAD 既有红**：`test/桌面应用/runtime-ui.test.ts` 的「renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务」在干净 HEAD `144b803` 上 **12 计 / 11 过 / 1 红 / exit 1**，失败点第 69 行 `assert.doesNotMatch(renderer, /localStorage|sessionStorage|node:fs|require\("fs"\)|import\(/)`。工作树同文件同为 **12/11/1**，失败签名逐字一致。
2. **这是测试契约过期，不是产品回归**：侧栏宽度/收起状态的 localStorage 持久化自 2026-10-17 客户反馈引入，HEAD 已存在；旧断言仍按「整文件零 localStorage」的历史契约要求，必然失败。产品行为与客户裁定一致。
3. **只读核对（HEAD 与工作树一致）**：`app/renderer/renderer.js` 仅 4 处 localStorage 实现，全部是 `SIDEBAR_WIDTH_STORAGE_KEY` / `SIDEBAR_STORAGE_KEY` 的 `getItem/setItem`；无 `sessionStorage`、`node:fs`、`require("fs")`、动态 `import(`；无 `removeItem/clear` 或下标访问；localStorage 同行/邻行无 `apiKey|token|secret|password|credential`。Pi 配置读写只走 `window.desktop` IPC，审批/判断状态只走 IPC + 内存 state。
4. **边界裁定**：`test/桌面应用/runtime-ui.test.ts` 在「桌面UI」角色的 `boundary.yaml` 白名单内（`角色卡/桌面UI/boundary.yaml` 第 36 行）；本角色边界只有 `test/测试/` 与 `角色卡/测试/`，角色卡并明确「不得修改……其他角色的私有框架或单元测试」。故**本角色未改该文件**，本记录交付判定、证据与已验证补丁，需由桌面UI 上下文落地。
5. **验证**：桌面应用全量（工作树）**633/622/11**，其中 9 红是工作树在途改动引入、非 HEAD 既有；干净 HEAD 全量 **625/623/2**（runtime-ui 与本批无关的 interface 收尾推进，均 HEAD 既有）；`npm run typecheck` **exit 0**。

## 1. 绑定与环境

| 项 | 值 |
| --- | --- |
| 仓库 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime` |
| 分支 / HEAD | `fix/shell-review-ui-polish` / **144b80392ec68b27540ebbb911ee69aca62aceec** |
| Node | v24.14.0（原生 TypeScript 类型剥离，直接 `node --test *.test.ts`） |
| 工作树快照 | 48 条状态（38 tracked 文件，+1417/−222；其余为 untracked） |
| 干净基线 | `git worktree add --detach /Users/wangzhongren/code/vibeingcode/ans-testbed/head-runtime-ui-check HEAD`（软链本仓 `node_modules` 保证解析一致；核对后已移除） |
| 本角色本批改动 | 仅本记录与 `changelog.md` 追加；未改任何测试或产品文件 |

## 2. HEAD 复现（干净 worktree）

```bash
git worktree add --detach /Users/wangzhongren/code/vibeingcode/ans-testbed/head-runtime-ui-check HEAD
cd /Users/wangzhongren/code/vibeingcode/ans-testbed/head-runtime-ui-check
node --test 'test/桌面应用/runtime-ui.test.ts'
```

结果（exit **1**）：

```
ℹ tests 12
ℹ pass 11
ℹ fail 1
✖ renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务
  at TestContext.<anonymous> (.../test/桌面应用/runtime-ui.test.ts:69:10)
  expected: /localStorage|sessionStorage|node:fs|require\("fs"\)|import\(/
```

工作树再跑同一命令：同样 **12/11/1**、同一断言行，说明与本次工作树改动无关。

## 3. 只读核对（HEAD 与工作树）

### 3.1 HEAD 版 renderer 的存储面

`git show HEAD:app/renderer/renderer.js`：

| 行 | 内容 |
| --- | --- |
| 205 | `var SIDEBAR_STORAGE_KEY = "ans.sidebar.collapsed";` |
| 208 | `var SIDEBAR_WIDTH_STORAGE_KEY = "ans.sidebar.width";` |
| 226 | `window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)` |
| 231 | `window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, …)` |
| 285 | `window.localStorage.getItem(SIDEBAR_STORAGE_KEY)` |
| 290 | `window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed === true ? "1" : "0")` |
| 109/202/2712/2795/6604 | 注释（分别说明判断开关不写 localStorage、侧栏持久化口径、initSidebar 读持久化） |

工作树同段实现无变化（工作树 `renderer.js` 相对 HEAD 只有两处 diff，位于约 2170/2196 行的工具目标文案「目标未保存」→「本次调用无文件目标 / 无文件目标」，与存储无关）。

### 3.2 全目录扫描（`app/renderer/*.js`，排除 vendor）

- `sessionStorage`：**0**
- `node:fs` / `require("fs")` / 动态 `import(`：**0**
- `document.cookie` / `indexedDB` / `openDatabase`：**0**
- localStorage 调用：**仅 4 处**（上表），无 `removeItem/clear/key/length`、无下标访问、无裸 `localStorage.`（均为 `window.localStorage.`）
- 键字面量：仅 `ans.sidebar.width`、`ans.sidebar.collapsed` 两个
- 敏感词邻域：4 处调用的**同行及前后各一行**均无 `api[_-]?key|token|secret|password|credential`，也无 `shellConfirm|recoveryConfirm|shellJudge|decisionJudge`
- 判断/审批状态：`shellJudge`/`decisionJudge` 注释明确「不写 localStorage/.env/项目文件」；开关读写走 `getShellJudgeState`/`setShellJudgeEnabled`/`getDecisionJudgeState`/`setDecisionJudgeEnabled` 等 IPC
- Pi 配置：`loadPiConfig` 走 `d.getRuntimeConfig`/`d.getPiConfig`，保存走 `d.saveRuntimeConfig`/`d.savePiConfig`；面板仅内存 `piView`，无任何本地持久化

### 3.3 同类断言排查

- `test/桌面应用/runtime-ui.test.ts`：仅第 69 行这一条「整文件无 localStorage」的旧口径。
- `test/桌面应用/renderer.test.ts`（桌面UI 属主）：P5 边界断言是**分段**检查（`SHELL_JUDGE_CODE` 段去注释后不得含 `localStorage`），不误伤侧栏持久化，当前通过；同文件另有正面的侧栏持久化契约（唯一键、读/写 try/catch、坏值回退）。
- `test/测试/governance-judge-cards-verify/f-ui.test.ts`（本角色属主）：断言是 `localStorage…judge|judge…localStorage` 的定向检查，不禁止侧栏键，当前通过。

## 4. 为何判定为契约过期

- 2026-10-17 客户反馈左栏需可收起/可拖拽，renderer 引入两项界面偏好持久化（本地存储键 `ans.sidebar.collapsed`、`ans.sidebar.width`），该实现**在 HEAD 已存在**。
- runtime-ui 用例的旧断言写于「renderer 无任何持久化」时期，用整文件正则把 localStorage 一刀切禁用；它没有区分「凭据/业务状态持久化」（安全红线）与「界面偏好持久化」（客户要求的正常功能）。
- 同属桌面UI 的 `renderer.test.ts` 早已把侧栏持久化写成正面契约；两者口径冲突，旧断言属漏改。
- 因此**不是产品回归**，也不应通过删掉持久化或放宽为 `doesNotMatch(renderer, /sessionStorage/…)` 了事；应改为白名单式收紧。

## 5. 修正后的守卫口径（拟议补丁，已验证）

替换 `test/桌面应用/runtime-ui.test.ts` 第 69 行（其余原有断言保留不动）：

```ts
  // 持久化白名单（2026-10-19 契约更新）：只允许侧栏宽度/收起两项界面偏好写 localStorage；
  // sessionStorage / Node fs / 动态 import 仍全禁；凭据与审批/判断状态不得进入 localStorage。
  assert.doesNotMatch(renderer, /sessionStorage|node:fs|require\("fs"\)|import\(/);
  const rendererCodeLines = renderer.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((raw) => raw.replace(/\/\/.*$/, ""));
  const storageLineIndexes = rendererCodeLines.map((line, i) => (line.includes("localStorage") ? i : -1)).filter((i) => i >= 0);
  assert.equal(storageLineIndexes.length, 4, "localStorage 只允许两项侧栏偏好的读/写共 4 处");
  for (const i of storageLineIndexes) {
    assert.match(rendererCodeLines[i], /window\.localStorage\.(getItem|setItem)\((SIDEBAR_WIDTH_STORAGE_KEY|SIDEBAR_STORAGE_KEY)\b/, "localStorage 只允许侧栏 UI 键的 getItem/setItem");
    const near = rendererCodeLines.slice(Math.max(0, i - 1), i + 2).join("\n");
    assert.doesNotMatch(near, /api[_-]?key|token|secret|password|credential|shellConfirm|recoveryConfirm|shellJudge|decisionJudge/i, "localStorage 邻近不得出现凭据或审批/判断状态");
  }
  assert.deepEqual(
    [...renderer.matchAll(/var (SIDEBAR_WIDTH_STORAGE_KEY|SIDEBAR_STORAGE_KEY) = "([^"]+)";/g)].map((m) => [m[1], m[2]]).sort(),
    [["SIDEBAR_STORAGE_KEY", "ans.sidebar.collapsed"], ["SIDEBAR_WIDTH_STORAGE_KEY", "ans.sidebar.width"]],
    "localStorage 仅两项侧栏 UI 键",
  );
```

保留原有 `switchBody` 不停止后台任务、`inp.value = ""; // 绝不回显值`、`onOperatorExpired`、`entry.runtime !== state.runtime` 四条断言。

**收紧而非放宽**：

- `localStorage` 从「整文件禁用」改为**白名单**：只允许两个侧栏键的 `getItem/setItem`，且**恰 4 处**（新增第三项偏好必须显式更新契约）；`removeItem/clear`、下标访问、裸 `localStorage` 都会被拒。
- 键定义必须恰为 `ans.sidebar.width` / `ans.sidebar.collapsed`。
- 凭据与审批/判断状态（含 Pi 配置对象）出现在 localStorage 邻域即失败。
- `sessionStorage`、`node:fs`、`require("fs")`、动态 `import(` 仍全禁。

**补丁自验证**（一次性脚本，置于 `/tmp`，未入仓）：同一守卫对 **HEAD renderer** 与 **工作树 renderer** 均通过；对 7 个负向变异全部捕获：`sessionStorage` 写入、`ans.apiKey` 键、`token` 值写侧栏键、`removeItem` 侧栏键、裸 `localStorage`、`state.shellConfirm` 写侧栏键、`piConfig` 写侧栏键。

## 6. 边界与交回

- `角色卡/测试/boundary.yaml` 的 Section 1 只有 `test/测试/` 与 `角色卡/测试/…`；**不含** `test/桌面应用/runtime-ui.test.ts`。
- `角色卡/桌面UI/boundary.yaml` 第 36 行明确列出 `test/桌面应用/runtime-ui.test.ts`（「本次多引擎选择、运行时组及设置展示的渲染契约测试」）。
- `角色卡/测试/role-card.md` 执行原则：「`boundary.yaml` Section 1 是唯一的写入授权。未列出的文件默认只读」「不得修改……其他角色的私有框架或单元测试」「一个上下文……只承担这一个角色；发现问题向项目管理角色报告」。
- 结论：本用例的断言更新应**排发给桌面UI 角色上下文**（或先由 ANS Governance 更新归属并经客户确认）；本角色不越界改文件。本记录第 5 节补丁可直接交付属主落地。

## 7. 验证实录

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面应用/runtime-ui.test.ts`（工作树） | **12 计 / 11 过 / 1 红 / exit 1**（仅旧持久化断言；其余 11 条含切引擎不停止后台任务、输入不回显、`onOperatorExpired`、`entry.runtime !== state.runtime` 均过） |
| `node --test 'test/桌面应用/runtime-ui.test.ts'`（干净 HEAD） | **12 计 / 11 过 / 1 红 / exit 1**，失败签名逐字相同（HEAD 既有） |
| `node --test "test/桌面应用/**/*.test.ts"`（工作树） | **633 计 / 622 过 / 11 红 / 0 skip / exit 1**（60.9s） |
| `node --test "test/桌面应用/**/*.test.ts"`（干净 HEAD） | **625 计 / 623 过 / 2 红 / 0 skip / exit 1**（15.7s） |
| `npm run typecheck` | **exit 0**（0 错） |

**HEAD 既有红（2 条，干净 HEAD 复现）**：

1. `test/桌面应用/runtime-ui.test.ts:65` — 本记录第 1–5 节（契约过期，属桌面UI）。
2. `test/桌面应用/interface.test.ts:2347`（HEAD 版行号）— 「收尾推进：回交送达 Convener 且流程全部完成 ⇒ 派 Proof / 验收 恰一次；重复 settle 不重派」（与本任务无关，属对应属主）。

**仅工作树出现的 9 红（非 HEAD 既有，均在途改动引入）**：

- `test/桌面应用/interface.test.ts`（该文件工作树已改）：
  - W6-B 真机修复：任命决定后等 Nominator 本轮 settle 再派 Convener（写入前不派）
  - 治理自动推进：接受提案 → 后台派发提名任务给 Nominator，当前 pane 不变、只发一条任务
  - 治理自动推进：accept-quick 与 appointment 都派发给 Convener；无下一步不派发
  - 治理自动推进（真机修正）：任命后角色未写出 ⇒ 先派 Nominator 写卡，角色出现后才派 Convener
  - 治理自动推进（真机修正）：accept 先派 Convener 写流程单，落盘后才派 Nominator
  - 治理自动推进（真机修正）：Convener 未写流程单 ⇒ 不派 Nominator、如实报错、不循环
- `test/桌面应用/acceptance-dispatch.test.ts`（工作树已改）：自动验收（导入补齐）：门通过 ⇒ 自动派 Proof 一条复核任务 + 写账本；重启/重复事件不重派
- `test/桌面应用/operator-wiring.test.ts`（工作树已改）：
  - 收尾任务消息：带流程单与回交/报告路径，要求汇总并出验收卡、不自行验收
  - 收尾任务消息（客户批准）：必须真实启动应用向客户演示，证据写入 docs/verification/&lt;flowId&gt;-v1.md

以上 9 条与 `app/desktop/governance-advance.ts`、`app/desktop/interface.ts`、`src/common/编排/*` 等工作树在途改动同批出现；本角色未改任何文件，不掩盖、不归因为本任务。

## 8. 纪律

- 未 git 提交；未读 `.env`；未打印任何凭据；未修改 renderer 源码；未越界修改 `test/桌面应用/runtime-ui.test.ts`。
- 临时 HEAD worktree 已移除，仓库 worktree 列表恢复原状。
