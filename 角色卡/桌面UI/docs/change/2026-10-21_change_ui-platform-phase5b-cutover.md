# Phase 5B 原子批次 a：桌面UI 文件迁移/删除记录

- 日期：2026-10-21
- 角色：桌面UI
- 范围：5B 步骤 a（只做文件迁移/删除与 e2e 默认目标翻新；**不运行构建/测试**）
- 边界：只改 `app/renderer/`、`test/桌面应用/e2e/{uiux-v2,ime-enter,bench-storm,uiux-design-audit}.mjs`、删除四个旧测试、`角色卡/桌面UI/`；未改 `app/main.ts`/preload/package/vite/根配置；**生产入口未切换**。

## 一、前置确认

- 5A 的 178 项旧测试逐名迁移台账已关闭：`docs/change/2026-10-21_phase5a-test-migration-ledger.md`（renderer 108 + markdown 5 + tool-rows 53 + runtime-ui 12）。
- XSS/负例已迁 `test/桌面UI/`（`markdown.test.ts` 等），5A 门禁新单测 142/142、旧基线 683/683 全绿（证据 `docs/change/2026-10-21-phase5a-evidence/`）。
- 5A 门已由 PM 关闭；本步骤不再运行构建/测试：旧入口删除、Vite input 尚未由步骤 b 调整，构建会暂时失败，属预期。

## 二、删除清单（旧渲染器）

| 路径 | 大小 | SHA256 |
| --- | --- | --- |
| `app/renderer/index.html`（旧 326 行） | 25,490B | `03f493e36d9a74e76676c19c478208912b74eb3c5c4bd87dc73f9114f1968a92` |
| `app/renderer/renderer.js` | 417,023B | `1ca3837e64c8de268059e32bc5170f7dd60e33b0734198b5f777951958ef2c38` |
| `app/renderer/styles.css` | 102,345B | `f71f4783c9715ae9d398497fb1a4d8b228db6138ab41778efe185405a08a15b6` |
| `app/renderer/engine-selector.js` | 5,619B | `db7d14973461e96663a34ec9f3b0bf6332e65e587d2d7e3c196cbee497dad855` |
| `app/renderer/markdown.js` | 6,667B | `0c6e4729786efb770d78f1e573e0920b17f4ff74f178818ef0520d2c79de8921` |
| `app/renderer/role-status.js` | 11,117B | `b1d086a2edc87dc89f4177cd48db59a05c17c195fbaa59c064e1065481ce0b1c` |
| `app/renderer/runtime-ui.js` | 7,465B | `1a0ca51a1a12a21e0c103165c5e8d365801a8e187cb83132f8573e11c8d33f35` |
| `app/renderer/tool-rows.js` | 23,569B | `66fc2915bc5f04fe13e524048debae1ac26bb5b6dfaeaa64b3963205977cb794` |
| `app/renderer/ui-labels.js` | 70,305B | `6e2a67fda48bd756d0de759ca5184e72622ad72503898d0fd7556e0187d4b31d` |
| `app/renderer/vendor/README.md` | — | `6e014a3f60c664812bdf7210adef687742a028c534e3575cd634a198d229a43b` |
| `app/renderer/vendor/markdown-it.LICENSE` | — | `792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473` |
| `app/renderer/vendor/markdown-it.umd.min.js` | — | `391f2aa638e75e6c7859d0a5c5650ef0956722a45998f17e05b83bc655778e1e` |

`app/renderer/vendor/` 目录已整体删除。

## 三、移动清单（新入口源）

| 源 | 目标 | 字节 | SHA256 |
| --- | --- | --- | --- |
| `app/renderer/src/index.html` | `app/renderer/index.html` | 481B | `0785d22005c4e0ed9561009089b7acfb496572633116742527acd93a48b5311d` |

- 内容逐字移动，目标哈希与源哈希一致（见上）。
- `<script type="module" src="/src/main.tsx">` 保留；CSP meta `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:` 保留；`<html lang="zh-CN" class="dark">`、标题 `ANS 治理会话工作台` 不变。
- 步骤 b 由装配调整 Vite input 指向 `app/renderer/index.html`，构建产物目标 `app/renderer/dist/index.html`；本步骤未切生产入口。

## 四、删除的旧守卫测试（178 项台账覆盖）

| 路径 | SHA256 | 迁移去向 |
| --- | --- | --- |
| `test/桌面应用/renderer.test.ts` | `40ee24156efd537b8a44fc6f9c339393d29500e848a3ceb44fb93207fff554a8` | `test/桌面UI/*`（status/tool-summary/role-view/ui-store/source-guard 等）；逐名映射见台账 |
| `test/桌面应用/markdown.test.ts` | `f84ba99300ba88d0a62a069b3e4b3d6b1a8a70a717f841152d9d41b706649b2a` | `test/桌面UI/markdown.test.ts`（12 项，含 XSS/外链拦截） |
| `test/桌面应用/tool-rows.test.ts` | `af00ba575154d92e97e2f3854839cfac49ebeadba8e4e1d4096a451310153c40` | `test/桌面UI/tool-summary.test.ts` 等 |
| `test/桌面应用/runtime-ui.test.ts` | `e127f8565141ae649df1a7b56885dce4a65857f9b6f5e3b18afd3bb4018149cb` | `test/桌面UI/role-view.test.ts` 等 |

## 五、e2e 默认目标翻新（步骤 b 后 `dist/index.html` 存在）

| 文件 | 默认入口 |
| --- | --- |
| `test/桌面应用/e2e/uiux-v2.mjs` | `app/renderer/dist/index.html` |
| `test/桌面应用/e2e/ime-enter.mjs` | `app/renderer/dist/index.html` |
| `test/桌面应用/e2e/bench-storm.mjs` | `${BENCH_RENDERER_DIR|app/renderer}/dist/index.html` |
| `test/桌面应用/e2e/uiux-design-audit.mjs` | `app/renderer/dist/index.html` |

- `ANS_RENDERER_ENTRY` 显式覆盖保留；显式目标不存在仍 **exit 2 / fail-fast**（四套件一致）。
- 断言未改；本步骤未运行 e2e（`dist/index.html` 待步骤 b 构建）。

## 六、目录与引用核验

- `app/renderer/` 顶层只剩：`index.html`、`src/`、`dist/`、`tsconfig.json`、`components.json`。
- `app/renderer/src/` 内**无代码 import/读取**已删文件；仅有历史注释提及旧模块名（`tool-summary.ts`/`markdown.ts`/`judge.ts`/`replay.ts`/`governance-view.ts`/`row-model.ts`/`events.ts`/`chat-store.ts`/`EngineSelect.tsx`/`phase4b.css`），供口径追溯，不影响运行。
- `test/桌面UI/` 内无对已删文件的运行引用；仅 `source-guard.test.ts`/`tool-summary.test.ts` 注释说明“替代旧文件”。
- `test/桌面应用/e2e/{four}.mjs` 已无旧入口默认；仍引用 `dist/src/index.html` 的只有桌面UI 的 4B/5A/4A/3B 冒烟默认路径（下一批切换，不属于本步骤 e2e 四套件）。

### 仍引用已删文件的非本步骤范围（步骤 b / 各属主处理）

- `test/桌面应用/hot-path.test.ts`：读取 `renderer.js`、动态 import `vendor/markdown-it.umd.min.js`/`markdown.js`。
- `test/桌面应用/message-queue.test.ts`：读取 `renderer.js`/`styles.css`、import `role-status.js`。
- `test/测试/**` 多个验证夹具（g3/g4v2/g2/governance-*/existing-project-compat/uiux-v2-replay 等）：import/read `renderer.js`/`styles.css`/`tool-rows.js`/`ui-labels.js`。
- `test/装配/verify-local-package.mjs`：require 旧 `renderer.js`/`styles.css`/`vendor/markdown-it.umd.min.js`。
- `test/桌面应用/diagnostics.test.ts`：仍以 `dist/src/index.html` 作为“built”夹具字符串（非文件存在性读取；步骤 b 后随入口口径复核）。
- 台账 `2026-10-21_phase5a-test-migration-ledger.md` 末尾已注明：`hot-path.test.ts` / `message-queue.test.ts` 旧段属桌面窗口，按测试交接表在 5B 前替换/退役，不在 178 项内。桌面UI 未改这些文件。

## 七、步骤 b 后续（2026-10-21 同日完成）

- 装配已产出 `app/renderer/dist/index.html`；桌面UI 将四个冒烟默认从 `dist/src/index.html` 切到 `dist/index.html`：`phase3b-electron-smoke.mjs`、`phase4a-electron-smoke.mjs`、`phase4b-electron-smoke.mjs`、`phase5a-electron-smoke.mjs`；四个 e2e 默认同前（`uiux-v2`/`ime-enter`/`bench-storm`/`uiux-design-audit`）。`ANS_RENDERER_ENTRY` 覆盖/fail-fast/断言均保留。
- `test/桌面UI/source-guard.test.ts` 静态入口路径从 `app/renderer/src/index.html` 改为 `app/renderer/index.html`；`phase3b-electron-smoke.mjs` 的 `session:send` 夹具补 `sessionCurrent:true`（5A 拒发不失效语义），3B 附件段恢复。
- 复跑（默认新入口，无显式 env）：5A **36/36**（21 截图）、4B **70/70**、3B **45/45**、4A **99/99**、IME **26 true/0 false**、design audit **AUDIT_DONE / 31 项 0 bad**、`test/桌面UI` **142/142**。
- 产物：`dist/index.html` SHA256 `3c4da2a2…33b301`；`assets/index-BVLfGR_D.js` `f568e2aa…08e4095`；`assets/index-DUBNk8-R.css` `76fad7ce…6ffc0f6`；gzip9 **288,530B**（268,650 + 19,480 + 400）。
- bench 默认新入口同日 4 次：stormA 中位 19.1、stormB 18.6、handlerA 0.65、handlerB 0.7、replay 11.05、scroll 15.15；均低于 5A 记录阈值（26/25/16.8/6/21.6/19.3），单次噪声见 `docs/change/2026-10-21-phase5b-evidence/gates.txt`。
- 证据目录：`docs/change/2026-10-21-phase5b-evidence/`（5a/4b/3b/4a smoke、IME、bench、design audit、gates）。
- 仍未改 `app/main.ts`/preload/package/vite/根配置；生产入口切换、packaged smoke、`hot-path`/`message-queue`/`test·测试`/装配脚本旧引用由步骤 b 装配/各属主收尾。

## 八、步骤 a 当时的待办（已由 §七 完成，保留追溯）

1. **步骤 a 未构建、未测试**（Vite input 待装配）；步骤 b 已产出 `dist/index.html` 并完成 §七 复跑。
2. 装配步骤 b：Vite input/main.ts/main.mjs/packaged smoke/生产入口切换；本记录只确认 `dist/index.html` 产出与桌面UI 默认切换。
3. 桌面UI 四个冒烟默认已切 `dist/index.html` 并复跑（§七）。
4. 测试/桌面窗口：退役/替换 `hot-path.test.ts`/`message-queue.test.ts` 旧段；其他角色验证夹具按各自属主更新。
5. 本记录不是最终验收；生产入口仍未切换（桌面UI 未改 main/package/vite），旧文件已删。

## 八、证据

- 本记录 + 删除/移动哈希（上表）。
- 5A 门禁与迁移台账：`docs/change/2026-10-21_phase5a-test-migration-ledger.md`、`docs/change/2026-10-21-phase5a-evidence/gates.txt`。
- 目录核验命令与输出可在执行日志复现：`find app/renderer -maxdepth 1 -mindepth 1`、`shasum -a 256 app/renderer/index.html`。

## 九、5B 收尾文档最终化（AC8，2026-10-21）

- `docs/feature/ui-contract-surface.md`：status 改为 `implemented`；生产入口唯一 `app/renderer/dist/index.html`（renderer-entry 解析，packaged smoke 完成）；移除 `dist/src/index.html`、旧 `app/renderer/index.html` 生产入口、旧守卫测试作为现行契约的表述；套件总表与 §3.1–3.4 入口全部改 `dist/index.html`；§3.5 改为「旧守卫测试（已退役）」并指向 `test/桌面UI` 142/142；三态表 #1/#22/#24–#28 更新，新增 #34–#39（生产入口切换、旧渲染器删除、vendor 删除、e2e/冒烟默认翻转、DOM 例外保持、驱动面最终）。
- `api-spec.md`：顶部新增「最终口径」新渲染器模块表（markdown/status/tool-summary/replay/events/report-view/operator-view/governance-view/chat-store/test-driver）；装配说明改 Vite 输入 `app/renderer/index.html`、产物 `dist/index.html`、CSP；合规守卫改 `test/桌面UI`；Phase 2/3A–4B 历史段标注「历史实现记录，旧文件已删除」。
- DOM 例外保持：`DEFER_TOOL_ROWS_WHEN_CLOSED=40` 与失效 operator 卡动作隐藏（PM §10.4/§十三），未新增。
- 死 CSS：检查确认 `app/renderer/src/shell/shell.css` 的 `.ti-badge` 无 TSX/DOM 引用；为保持 UIUX 已审计的冻结候选 hash（`3c4da2a2…/f568e2aa…/76fad7ce…`）不重建，**本批不删除**，留待下一构建批次清理（契约面选择器附录已移除该历史项）。
- 未改 main/preload/package/vite/根配置；生产入口仍由装配已切换为 `dist/index.html`。

## 十、后续候选（角色显示名修复，2026-10-21）

- 真机发现治理职能显示名回退：`role-view.ts` 的 proposal/nomination/schedule 旧称改为 **Draft / 提案、Crew / 组队、Steward / 统筹**；liaison/verification 不变。详见 [role-display-names 记录](2026-10-21_change_ui-platform-role-display-names.md)。
- 新候选：`dist/index.html` `c8ad0e82…79cd`、JS `050776ec…f97b`、CSS `76fad7ce…c0f6`；gzip **288,514B**。本文件 §七 的 `3c4da2a2…/288,530B` 为步骤 b 时点记录，已被本候选取代。
- 复跑：单测 142/142、role/governance 15/15、4B 70/70、5A 36/36、MIRROR 8/8、typecheck 0/0、build 成功。
