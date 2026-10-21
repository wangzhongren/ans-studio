# 桌面UI 角色显示名回退修复：治理职能新称（2026-10-21）

## 一、问题

真机发现新渲染层 `app/renderer/src/chat/role-view.ts` 的 GOVERNANCE 映射仍使用旧称，与 README v1.4.0 与 `src/chat/judge.ts` 的新称不一致：

| governanceFunction | 旧称（错误） | 新称（正确） |
| --- | --- | --- |
| `proposal` | 报告员 / Rapporteur | **Draft / 提案** |
| `nomination` | 提名官 / Nominator | **Crew / 组队** |
| `schedule` | 召集人 / Convener | **Steward / 统筹** |

`liaison`「主理 / Lead」与 `verification`「验收 / Proof」保持不变（已验收显示）。

## 二、修改

- `app/renderer/src/chat/role-view.ts`：上述三项 `name` 改为新称；`power`/`builtinNote` 不变。
- `test/桌面UI/role-view.test.ts`：GOVERNANCE 名称断言改新称。
- `test/桌面UI/governance-view.test.ts`：`governanceMirrorSourceLabel("Draft / 提案")` 示例与期望改新称。
- `test/桌面UI/phase4b-electron-smoke.mjs`：镜像来源断言 `来自 Draft / 提案`。
- `test/桌面应用/e2e/uiux-v2.mjs`：W6-C 五角色树 names 断言改 `Draft / 提案`/`Crew / 组队`/`Steward / 统筹`；镜像 source 断言同步；检查标题改为 display names Draft/Crew/Steward/Proof。role id 断言仍为 `rapporteur,nominator,convener,verifier`（id 未变）。
- 未改 `judge.ts`（已是新称）、主进程、配置或其他角色文件。

## 三、测试结果（默认 `app/renderer/dist/index.html`）

| 项 | 结果 |
| --- | --- |
| `node --test test/桌面UI/role-view.test.ts test/桌面UI/governance-view.test.ts` | **15/15** |
| `node --test test/桌面UI/*.test.ts` | **142/142** |
| 4B 冒烟 | **70/70** |
| 5A 冒烟 | **36/36**（21 截图） |
| uiux-v2 MIRROR 段（`ANS_MIRROR_UI_ONLY=1`） | **MIRROR_UI_PASS 8/8**，0 bad |
| `npm run typecheck` / `typecheck:renderer` | **0 / 0** |
| `npm run build:renderer` | 成功 |

## 四、新 dist 哈希

- `app/renderer/dist/index.html` SHA256 `c8ad0e82b2740ef59329c77834f8e583a34f402654f238e073e8a35cc4fd79cd`
- `assets/index-Oqlp-kNL.js` SHA256 `050776ece38dcd700fe34b6eee8499a2247610a90c88df96e49a2ce4b609f97b`
- `assets/index-DUBNk8-R.css` SHA256 `76fad7ce7c7b449d7e3b5f61517555f7f5c9d97e169a81d504289131d6ffc0f6`
- gzip9 **288,514B**（JS 268,636 + CSS 19,480 + HTML 398）≤300KiB；CSP 严格。

## 五、边界与剩余

- 本次只改桌面UI 渲染侧显示名与对应测试；角色 id/治理函数/权限文案未改。
- 新候选 hash 已变化：UIUX/验收如已按旧 hash（`3c4da2a2…`）审计，请按新 hash 复核显示名相关场景（树/镜像/报告来源）；其余行为不变。
- `app/renderer/src/chat/judge.ts` 与 README v1.4.0 为文案依据；若后续 README 名称再变，应同步本映射与测试。

## 六、证据

- 4B/5A 冒烟输出：`/tmp/ans-phase4b-smoke`、`/tmp/ans-phase5a-smoke`（本轮运行）。
- MIRROR：`/tmp/ans-uiux-mirror-names/report.json`。
- 单测：`node --test` 输出 142/142。
