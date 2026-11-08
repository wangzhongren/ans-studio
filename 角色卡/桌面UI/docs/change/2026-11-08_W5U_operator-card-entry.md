# W5-U：审批卡渲染入口（前台命令 / 后台任务）

- 日期：2026-11-08；固定角色：桌面UI；状态：已实施、已跑定向与渲染层检查；未提交、未推送、未验收。
- 候选：worktree `.claude/worktrees/trunk-amendment`，HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；环境 Windows，Node `v24.22.1`。
- 任务：W5-U（审批卡渲染 `entry`；不改变判定或既有卡结构）。依据 P1.3 §2.5.2（`docs/planning/2026-11-08_design_session-admission-approval-based.md`，855 行，SHA-256 `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`，§425-429）与 B1 标准 AC-7（`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md:68`）。设计确认：卡面显示「前台命令 / 后台任务」；`protectedScope` 仅可选展示，O7 默认不做。
- 用户可见入口：桌面 shell 审批卡（`#shell-confirm`）标题行新增入口徽标 `#sc-entry`：`entry === "start_background_task"` ⇒「后台任务」；缺省（旧主进程）/`run_shell` ⇒「前台命令」。
- I0/接口事实：`OperatorPrompt.entry?/protectedScope?` 加法字段已由运行时批次落盘（`src/model/runtime.ts:749-773`，只读引用）；桌面窗口并行批次 `ShellConfirmRequest`/presenter 透传截至实施时未落盘（`app/desktop/operator-channel.ts` 无 `entry`/`protectedScope`，只读核对）。渲染侧经既有 `shell:confirm-request` 不透明载荷（`asRecord(card.payload)`）读取 `payload.entry`，对字段到达顺序无依赖：字段未到时按缺省渲染「前台命令」，到达后自动显示「后台任务」；无第二份判定/审批逻辑，未改主进程、Model、共享 i18n。

## 写集与逐文件 SHA-256（全部在 boundary.md Section 1 内）

| 文件 | 变更 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | +16 行：新增纯映射 `shellConfirmEntryLabel(entry, locale)`（唯一入口标签来源；两态文案全部走共享 i18n 键：后台 `ui.background.title`、前台 `ui.judge.entryForeground`，D1 后不再硬编码，详下节） | 1053 | `af9af580781152c14f52359eb38f766110f448ff5132296f55c6e590f2d7aafe` |
| `app/renderer/src/shell/ConfirmCard.tsx` | +10 行：引入 `shellConfirmEntryLabel`，在标题行 su 徽标之后追加中性 `Badge id="sc-entry"`；既有卡结构、元素 id、折叠详情、提交/拒绝路径逐字不变 | 954 | `f620610f4cb54bd2614a215a601dc54b92312a7c78d936ecde2239cb7cf7a63f` |
| `test/桌面UI/judge.test.ts` | +59 行：entry 两态/缺省/en-US 纯函数断言（含 `ui.judge.entryForeground` 中英成对值核对）；卡面接线源码守卫（`#sc-entry`、单一来源、既有 13 个元素 id 与 `respond(true)/respond(false)` 路径不变） | 273 | `6ad07d2c060c53f96ecc96c28c33918ab12f5ea8165a4a692cf614bc04cfa1b4` |

`git diff --stat`：3 个文件、85 行插入、0 行删除（纯加法；D1 前后均无删除行）。未触碰 `src/`、`app/desktop/`、`app/main.ts`、其他角色目录、其他测试目录；未删除/弱化任何既有断言，未加 skip。

## 验证（实施前后对照）

| 检查 | 实施前 | 实施后 |
| --- | --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | 441 tests / 441 pass / 0 fail / 0 skipped | 443 tests / 443 pass / 0 fail / 0 skipped（+2：入口标签纯函数；卡面接线守卫） |
| `npm run typecheck:renderer` | exit 0 | exit 0 |
| `npm run build:renderer` | exit 0（仅既有大 chunk / 混合静态动态 import 提示） | exit 0（仅同类既有提示） |
| `npm run typecheck` | exit 0 | exit 0 |

- 测试只证明其实际运行内容：以上为纯函数与源码接线的 node 单测及类型/构建检查；未启动 Electron/真实模型，未做真人 UI 验收，不替代 AC-7 的卡面原件/截图取证。
- 未运行 e2e smoke（`phase*.mjs` 需 Electron 环境，非本任务要求）；`dist/` 为 `build:renderer` 产物，属本角色目录。

## 偏差与未做项

- 偏差：**0**。判定、审批链、主进程与既有卡交互路径零改动；`shellConfirmTitle` 标题文案保持逐字不变（既有断言原样通过）。
- `protectedScope`：按 O7 默认**不做视觉改动**。理由：仓库无对应 i18n key，新增 key 需改 `src/common/shared/i18n/`（`src/` 不在本角色写集，会扩大范围）；渲染侧对未知字段保持忽略（`asRecord` 自然兼容），后续如需展示可另派最小任务。
- 「前台命令」文案：初版实施时无既有 key，曾按 `judge.ts` 内既有 locale 条件文案惯例硬编码 `zh-CN`/`en-US` 两值（该记录保留于 D1 节历史）；D1 起改为共享 i18n 成对键 `ui.judge.entryForeground`（zh「前台命令」/ en "Foreground command"），不再硬编码。「后台任务」复用既有 `ui.background.title` 中英键（zh「后台任务」/ en "Background tasks"）。

## 结论

W5-U 已实施：审批卡以加法徽标展示入口两态，缺省兼容旧主进程；定向测试 443/443、`typecheck:renderer`／`build:renderer`／`typecheck` 均 exit 0。未 commit/push/合并/发布，未判验收。

## D1 修复：i18n key 化

- 触发（并行检查 D1）：`test/项目管理/shared/i18n-guard.test.ts` 确定性失败——硬编码守卫扫描 `app/renderer/src`（`judge.ts` 不在 allowlist），初版 `judge.ts:106` 的硬编码「前台命令」/ "Foreground command" 记 violations=1。初版「按 locale 条件硬编码」的偏差记录见上文，本节予以纠正。
- 修复：shared-code 已在 `src/common/shared/i18n/messages/zh-CN.ts:929`（「前台命令」）与 `en-US.ts:1010`（"Foreground command"）成对新增 `ui.judge.entryForeground`；本角色将 `shellConfirmEntryLabel` 前台分支改为 `translate(locale, "ui.judge.entryForeground")` 并删除硬编码中英文；后台分支保持 `ui.background.title`。函数语义/两态/缺省兼容不变。未修改 i18n allowlist、未改 shared 消息目录（由 shared-code 所有）。
- 测试：`test/桌面UI/judge.test.ts` 增加 `zhCN`/`enUS` 对 `ui.judge.entryForeground` 的成对值核对（「前台命令」/ "Foreground command"），既有两态/缺省/en-US 断言保留，无删断言、无 skip。
- 新哈希（D1 前 → D1 后）：`judge.ts` `9bbd0e9769c77e17fd726de7060339a30e2be26f0534019203167e261a9851a7` → `af9af580781152c14f52359eb38f766110f448ff5132296f55c6e590f2d7aafe`；`ConfirmCard.tsx` 不变 `f620610f4cb54bd2614a215a601dc54b92312a7c78d936ecde2239cb7cf7a63f`；`judge.test.ts` `a111deb3d7b7f967adeabc6745024c493bb98c42a49ef2efc8962d99d8ac3f0e` → `6ad07d2c060c53f96ecc96c28c33918ab12f5ea8165a4a692cf614bc04cfa1b4`。
- 复跑（D1 后）：`node --test "test/桌面UI/**/*.test.ts"` 443 tests / 443 pass / 0 fail / 0 skipped（计数不变，全绿）；`node --test test/项目管理/shared/i18n-guard.test.ts` 6 tests / 6 pass（硬编码守卫 violations=0，D1 的 violations=1 已消除）；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0；`npm run typecheck` exit 0。
- 偏差：初版硬编码即 D1 已纠正项；修复后本变更无残留偏差。未 commit/push/合并/发布。
