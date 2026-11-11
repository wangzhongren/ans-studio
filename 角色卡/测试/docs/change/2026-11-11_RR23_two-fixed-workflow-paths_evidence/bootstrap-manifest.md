# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在治理会话 settle **之后**生成（治理角色不会算 hash，故 pin 只能事后算）。
> **pin 每轮治理会话 settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经治理会话）的边界改动，**下一次治理会话 settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-11-11T07:27:14.678Z
- 目标项目：C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr23-2026-11-11/target
- 授权来源：desktop-app:操作者导入空文件夹并开启 chief 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（4）：env-bootstrap、game-core、score-persist、ui-input

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/env-bootstrap/boundary.yaml | f29ea0de51071a379158591b091436ea0621e433e11db5ffe12bcfc9decfb78f |
| 角色卡/game-core/boundary.yaml | 85a0f8ba09846bf83d038d0cef2cb35cc0b3b7fb6b74ce179d87f931df7610dd |
| 角色卡/score-persist/boundary.yaml | a858583f8d5d7b7cc40f0e1d635c263dce6c8570dc06f281060dcf0be77fcbd1 |
| 角色卡/ui-input/boundary.yaml | 32148b3e09d2ad4eec41e5a67f6f6a4fbec2e52db7036cd1e6280f8c8d10bf16 |

## 实际创建路径（逐条留痕）

- 角色卡/env-bootstrap/boundary.md
- 角色卡/env-bootstrap/boundary.yaml
- 角色卡/env-bootstrap/role-card.md
- 角色卡/game-core/boundary.md
- 角色卡/game-core/boundary.yaml
- 角色卡/game-core/role-card.md
- 角色卡/score-persist/boundary.md
- 角色卡/score-persist/boundary.yaml
- 角色卡/score-persist/role-card.md
- 角色卡/ui-input/boundary.md
- 角色卡/ui-input/boundary.yaml
- 角色卡/ui-input/role-card.md
- docs/audit/shell-gate.jsonl
- docs/contracts/snake-game-architecture-v1.md
- docs/intents/snake-game.md
- docs/product/snake-game-intent-v1.md
- docs/proposals/snake-game-modules-v1.md
- docs/proposals/snake-game-proposal-v1.md
- docs/proposals/snake-game-roster-v1.md
- docs/quality/snake-game-criteria-v1.md
- docs/scheduling/snake-game-team-v1.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
