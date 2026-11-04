---
id: composer-buttons-implementation
type: change
title: 输入区按钮精简（移除发送按钮 / 停止本轮改纯图标）实施记录
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - docs/communication/2026-11-04_issue-composer-buttons.md
  - 角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/probe-composer-buttons.mjs
events:
  - date: "2026-11-04"
    kind: created
    summary: 按客户直修指令移除发送按钮（Enter 发送保留），停止本轮改为 28x28 纯图标按钮（title/aria-label 复用既有「停止本轮」文案）；typecheck 0、build 0、UI 404/404、phase4b smoke 69/69、探针 before 16/16 与 after 16/16；未 commit/push。
---

# 输入区按钮精简（移除发送按钮 / 停止本轮改纯图标）实施记录

- **任务 / 档位**：`2026-11-04_composer-buttons`（客户直修） / 渲染层最小修复（跳过调研/方案/独立复核）。
- **角色 / 节点**：桌面UI（渲染进程属主，固定角色上下文）；按统筹指令在独立 worktree 执行。
- **worktree / 分支 / 基线**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\composer-buttons-fix`（分支 `fix/composer-buttons`）；基线 `origin/main` `1e3268b1a5d5f311255e616e4e271dfd6d376008`（fetch 后最新，含 v1.9.1 合入）。
- **状态**：**`implemented-unverified`**。已实现并完成本角色自测与真实 Electron 前后证据采集；**未 commit、未 push、未验收**。

## 1. 客户直修依据与边界

- 需求记录：`docs/communication/2026-11-04_issue-composer-buttons.md`（派发侧 worktree 的未跟踪输入，本次只读）。
- 客户原话：「发送可以不需要，停止只需要一个图标就行了。」
- 统筹决定：**直接修，本轮只改渲染层**；不改变任何发送/停止行为与安全校验；**不得新增 i18n key**；其余输入区元素（附件/指令/双开关/提示行/范围/键盘提示）保持不变。
- 客户授权平面 worktree `customer-authorization-plane` 未被写入：本实现仅落在上述新 worktree。

## 2. 改动前行为 vs 改动后行为

| 场景 | 改动前（基线 `1e3268b`） | 改动后（本候选） |
| --- | --- | --- |
| 发送入口 | 「发送 ↑」主按钮 + Enter/Shift+Enter | **仅 Enter 发送；Shift+Enter 换行**；无发送按钮；发送失败提示、拒发恢复草稿、指令抑制、会话补开等 `send()` 全链路未改 |
| 停止本轮 | 文字按钮「■ 停止本轮」（h-7，含图标 + 文字） | **28×28 纯图标按钮（方块 ■）**；空闲隐藏、进行中可见、请求中禁用（`hidden={!busy}` / `disabled={halting}` 原样） |
| 可访问名称 | `title`/`aria-label` = 「停止当前轮次」（`ui.composer.stopTitle`） | `title`/`aria-label` = **「停止本轮」**（复用既有 `shared.common.stopTurn`，零新增 key） |
| 其余输入区 | 附件、指令面板、替我审批/替我决策、范围、键盘提示、提示行 | **全部保留**（探针断言 attach/directive/toggles=2/scope/keyboard） |
| 测试驱动 | `sendDisabled()` 读取 `#btn-send.disabled` | 等价改为会话/项目状态判定（与 Composer 的 `canSend` 同义），驱动契约不变 |
| 发送/停止安全校验 | — | **零改动**：主进程通道、target 形状、fail-closed 提示与既有系统行逐字保留 |

## 3. 写集与实际改动

### 3.1 修改（4）

| 路径 | 行数 | +/−（相对基线） | SHA-256（改后） | git blob（改后） | 改动 |
| --- | ---: | --- | --- | --- | --- |
| `app/renderer/src/shell/Composer.tsx` | 988 | +5 / −28 | `b64fefc913216df85c9e33265720d26b3467c3878bfd341be69651cb4fa2bdde` | `75194329b281ee42d26b72615fcc3c571290c9a2` | 移除发送按钮与 `ArrowUp`；停止按钮改 `size="icon-sm"`、无文字、`Square size={14}`；title/aria 复用 `shared.common.stopTurn` |
| `app/renderer/src/test-driver.ts` | 415 | +9 / −2 | `30e8c8399a04d4948b8c8f872a2802e54d8fcf987cf4ae39d2eede20556f59e4` | `c05a66a090affd910e277e14f7e44ddc2b9ee059` | `sendDisabled()` 改为 `sessionOpen && projectRoot` 等价判定 |
| `test/桌面UI/phase3b-electron-smoke.mjs` | 739 | +2 / −2 | `11ce5de186f39658b8c1d8e958518bf9c6e380815617f707a93acdc8804de8e6` | `9bf08018927df40f88cc38bb1b334c63134b3b0f` | 发送 ack / 拒发恢复两条改 Enter 键派发（等价强度） |
| `test/桌面UI/phase4a-electron-smoke.mjs` | 1473 | +1 / −1 | `1677b2faa411b5a1f4698109be3f87cd593d4f4cc55aea00ac9f6036cdfaa7ce` | `7251eca31b9964b1f70870290f19fd2226508385` | 成功发送改 Enter 键派发（等价强度） |

合计 **+51 / −33**（含新增测试；见 `raw/diff.patch`）。无 i18n 文案/键改动、无依赖/构建配置改动、无主进程/preload/src 改动、无 CSS 改动（复用既有 `danger-ghost` 与 Button `icon-sm`）。

### 3.2 新增（测试与证据）

- `test/桌面UI/composer-buttons.test.ts`（34 行；SHA-256 `c4b3101993dc33304668c63be196893c2f179223b5f547520c6feec887d02717`；git blob `2fe7b277fc14964c5bd5e67118a3305ead02a321`）：源码结构钉子——发送按钮移除、`ArrowUp` 不残留、Enter 发送逻辑保留；停止按钮 `icon-sm`/`<Square>`/双文案 key/无文字子节点/隐藏与禁用状态。
- `角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/probe-composer-buttons.mjs`（真实 Electron 前后探针，SHA-256 `9c79c5b4a98ebf11dccb1fa3f1a6f45ac52b6f50b8b16c5f0046a11279c6d1d8`）。
- 同目录 `before/`、`after/`、`raw/`（截图、探针结果、冒烟报告与日志、基线/候选快照、diff、哈希）。
- 本记录。

### 3.3 未写

`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`（含 i18n 文案）、`app/renderer/src/shell/*.css`、`package.json`/`tsconfig*`/`vite.config.ts`、其他角色资料、`docs/communication|scheduling|acceptance`。未 apply/pop 任何 git stash。

## 4. 实现要点

1. **发送按钮移除**：Composer 仅删除 `#btn-send` 的 JSX 与 `ArrowUp` 导入；`send()`、Enter 键处理（含输入法组合保护 `composingRef`/`isComposing`/`keyCode===229`）、失败提示/草稿恢复/指令抑制等既有逻辑零改动。
2. **停止纯图标**：仍用既有 `Button`（`variant="destructive"` + `danger-ghost`），尺寸改 `icon-sm`（28×28，与 `.cap-icon` 同高），内容仅保留 `Square size={14}`；`id="btn-halt"`、`hidden={!busy}`、`disabled={halting}`、`onClick` 全部原样。
3. **可访问名称**：`title`/`aria-label` 均复用既有 `t("shared.common.stopTurn")`（zh「停止本轮」），不新增 key；`ui.composer.stopTitle` 键保留在 i18n 表中（其他上下文仍可用）。
4. **测试驱动契约**：`window.__ansRenderer.send.disabled()` 与 `composer.state().sendDisabled` 不再依赖已删除的按钮，改由 `selectedRoleId/sessionOpenRoleId/projectRoot` 计算，语义与 Composer 的 `canSend` 一致。
5. **冒烟等价性**：phase3b/phase4a 的发送动作由点击按钮改为在 textarea 上派发 `Enter` keydown（`bubbles:true, cancelable:true`），仍覆盖 ack/clientMessageId/拒发恢复/清草稿等原断言，未放宽任何断言。
6. **零新文案**：未修改 `src/common/shared/i18n/messages/*`；停止按钮可见文字删除后，`ui.composer.send`/`ui.composer.ariaSend`/`ui.composer.stopTitle` 等 key 均保留。

## 5. 验证原始结果

环境：worktree 内 `npm ci`（exit 0）；Electron 二进制缺失时用 `node node_modules/electron/install.js` 补装（exit 0，Electron 44.7.0）。

| 步骤 | 命令 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| 类型检查 | `npm run typecheck:renderer` | exit 0，无错误 | `raw/typecheck-renderer.log` |
| 构建 | `npm run build:renderer` | exit 0，`✓ built in 357ms` | `raw/build-renderer-final.log` |
| 单测 | `node --test "test/桌面UI/**/*.test.ts"` | **tests 404 / pass 404 / fail 0 / skipped 0**（710.9ms；基线 402 条 + 新增 2 条） | `raw/renderer-ui-tests.log` |
| 冒烟（phase4b） | `electron test/桌面UI/phase4b-electron-smoke.mjs "" raw/smoke-after` | **69 checks / 0 failures**；zero console errors / zero CSP violations | `raw/after-phase4b-smoke.log`、`raw/smoke-after/report.json` |
| 冒烟（phase3b） | `electron test/桌面UI/phase3b-electron-smoke.mjs "" raw/smoke-phase3b-final` | 全部 CHECK=true（含 SEND ack、SEND_FAILURE_RESTORES_DRAFT、HALT 三态、NO_CSP/NO_CONSOLE）；`SMOKE_DONE=1` | `raw/phase3b-smoke.log`、`raw/smoke-phase3b-final/` |
| 改前探针 | `electron .../probe-composer-buttons.mjs before .../before` | **16 checks / 0 failures**；4 张截图 | `raw/before-probe.log`、`before/probe-result.json` |
| 改后探针 | `electron .../probe-composer-buttons.mjs after .../after` | **16 checks / 0 failures**；4 张截图 | `raw/after-probe.log`、`after/probe-result.json` |
| phase4a 冒烟 | `electron test/桌面UI/phase4a-electron-smoke.mjs "" ...` | **既有失败（非本次引入）**：18 checks 后于 operator 卡断言 `SMOKE_ABORTED`；临时还原基线构建后**同样中止**（同点、同 18 checks） | `raw/smoke-phase4a-after`、`raw/smoke-phase4a-baseline` |

关键 DOM 事实（真实 Electron，无点击伪造）：

- 改前：`#btn-send` 存在且可用；空闲时 `#btn-halt` 隐藏；进行中 `#btn-halt` 可见，文字逐字「停止本轮」，尺寸 92×28；Enter 发送成功并清空输入。
- 改后：DOM 无 `#btn-send`；空闲 `#btn-halt` 隐藏；进行中 `#btn-halt` 文本为空、含 SVG、`title`/`aria-label` 逐字「停止本轮」、28×28、`tabIndex=0`、位于 `#composer-capsule` 内；`.composer-actions` 可见子元素恰为 `["btn-halt"]`。
- 改后：1200/1360 宽、空闲/进行中四态均 `overflowX=0` 且控件行无两两重叠；Enter 发送仍生效；点击停止仍向主进程发出同一 target（projectRoot/roleId/runtime）并显示「已请求停止当前轮次」。
- 改后：附件、指令、双开关（2）、范围、键盘提示（含 Enter / Shift + Enter）全部保留；零 console 错误。

## 6. 截图与证据路径

证据目录：`角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/`

- 探针：`probe-composer-buttons.mjs`（复用既有 `test/桌面UI/phase4b-smoke-preload.cjs`，未改动该 preload）。
- 改前（基线构建）：`before/composer-idle-1200-before.png`、`before/composer-idle-1360-before.png`、`before/composer-busy-1200-before.png`、`before/composer-busy-1360-before.png`、`before/probe-result.json`。
- 改后（候选构建）：`after/composer-idle-1200-after.png`、`after/composer-idle-1360-after.png`、`after/composer-busy-1200-after.png`、`after/composer-busy-1360-after.png`、`after/probe-result.json`。
- 原始输出：`raw/before-probe.log`、`raw/after-probe.log`、`raw/typecheck-renderer.log`、`raw/build-renderer-final.log`、`raw/renderer-ui-tests.log`、`raw/after-phase4b-smoke.log`、`raw/phase3b-smoke.log`、`raw/smoke-after/report.json`、`raw/smoke-after/*.png`、`raw/smoke-phase3b-final/`。
- 对照与差异：`raw/baseline/`（4 个改前文件快照）、`raw/candidate/`（4 个改后文件 + 新测试快照）、`raw/diff.patch`、`raw/diffstats.cjs`、`raw/hash-files.cjs`、`raw/candidate-hashes.txt`、`raw/baseline-hashes.txt`、`raw/smoke-phase4a-after/`、`raw/smoke-phase4a-baseline/`。

## 7. 候选哈希（改前 → 改后）

| 文件 | 改前 SHA-256 | 改后 SHA-256 | 改后 git blob |
| --- | --- | --- | --- |
| `app/renderer/src/shell/Composer.tsx` | `972b5779685b0943f7391b5aae2b2ca2a199dd7c1671bc06115b8b2fbb2aa1f8` | `b64fefc913216df85c9e33265720d26b3467c3878bfd341be69651cb4fa2bdde` | `75194329b281ee42d26b72615fcc3c571290c9a2` |
| `app/renderer/src/test-driver.ts` | `71cae5c8427531f3dc44639c4b43c48200bdcb8ae5de34627d48745cfc90f288` | `30e8c8399a04d4948b8c8f872a2802e54d8fcf987cf4ae39d2eede20556f59e4` | `c05a66a090affd910e277e14f7e44ddc2b9ee059` |
| `test/桌面UI/phase3b-electron-smoke.mjs` | `3de365a7f4c5892632fa502e499d4181b78db5a8c71e4fca2d7d6b2c77e17f18` | `11ce5de186f39658b8c1d8e958518bf9c6e380815617f707a93acdc8804de8e6` | `9bf08018927df40f88cc38bb1b334c63134b3b0f` |
| `test/桌面UI/phase4a-electron-smoke.mjs` | `ba23ac61bd221e38eace7eea37d4b666563838f2c83233dfc750c6bd640c241c` | `1677b2faa411b5a1f4698109be3f87cd593d4f4cc55aea00ac9f6036cdfaa7ce` | `7251eca31b9964b1f70870290f19fd2226508385` |
| `test/桌面UI/composer-buttons.test.ts`（新增） | — | `c4b3101993dc33304668c63be196893c2f179223b5f547520c6feec887d02717` | `2fe7b277fc14964c5bd5e67118a3305ead02a321` |
| `.../probe-composer-buttons.mjs`（新增） | — | `9c79c5b4a98ebf11dccb1fa3f1a6f45ac52b6f50b8b16c5f0046a11279c6d1d8` | `83449e0da310f4bb044d320906c0b6e49dbe3200` |

## 8. 未提交声明

**未 commit、未 push、未 merge、未发布。** 所有产品改动仅存在于 worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\composer-buttons-fix`（分支 `fix/composer-buttons`，基于 `origin/main` `1e3268b`）的工作区。会话按 worktree 隔离运行（隔离 worktree 为 `customer-authorization-plane`，本会话未写入其中）；隔离守卫禁止对该目标 worktree 执行 git 操作（`git status`/`git diff` 被拒），因此差异以改前/改后快照 + `diff -u` 生成，哈希用 Node 按 `blob <len>\0` 等价计算；`raw/diff.patch` 覆盖 4 个修改文件与新测试。

## 9. 风险与回归说明

1. **发送唯一入口为 Enter**：按钮移除后，鼠标用户需用键盘发送（客户明确要求）；输入法组合态保护、Shift+Enter 换行与空文本提示原样保留，`send()` 的失败恢复/安全校验未改。
2. **停止按钮可发现性**：纯图标（方块）依赖 title/aria-label「停止本轮」；仍仅在回合进行中显示，请求中禁用。若客户希望更醒目的填充方块，可后续微调图标 `fill`，不影响行为。
3. **文案键选择**：可访问名称从 `ui.composer.stopTitle`（停止当前轮次）改为复用 `shared.common.stopTurn`（停止本轮），以逐字贴合客户/需求措辞；未新增或删除任何 key。
4. **手工 e2e 脚本残留引用**：`test/桌面应用/e2e/*` 中仍有若干 `#btn-send` 点击（main.mjs/uiux-v2.mjs/ime-enter.mjs/uiux-design-audit.mjs/t1-actual-main.mjs 等），不在本次要求验证范围且未运行；如需继续使用需按 Enter 派发更新（后续工作，不属本次写集）。
5. **phase4a 冒烟既有失败**：在 operator 卡时序断言处中止，基线构建同样复现（`raw/smoke-phase4a-baseline`）；本次仅改该文件一行发送动作，未触达失败段，判定非本次回归。
6. **范围**：仅渲染层 Composer/测试与驱动；未改主进程、preload、i18n 表、CSS 与构建配置；未跑全仓 typecheck、`test/装配/**` 与其他 smoke（超出本角色写集）。
7. **布局**：probe 在 1200/1360、空闲/进行中四态断言无横向溢出与控件重叠；CSS 零改动，`icon-sm` 复用既有 Button 尺寸。
