# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在治理会话 settle **之后**生成（治理角色不会算 hash，故 pin 只能事后算）。
> **pin 每轮治理会话 settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经治理会话）的边界改动，**下一次治理会话 settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-11-11T07:53:39.630Z
- 目标项目：C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr24-2026-11-11/target
- 授权来源：desktop-app:操作者导入空文件夹并开启 chief 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（5）：app-shell、env-bootstrap、game-logic、input-ctrl、ui-render

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/app-shell/boundary.yaml | 04800014e4c1a94d8002b509ff2d2afc7eedb68a2ba74488e270def028afb235 |
| 角色卡/env-bootstrap/boundary.yaml | 3ad6cf531a4e97ba9a677a56b0f8a9a891bdcf82cb390d8345ae33230f087ece |
| 角色卡/game-logic/boundary.yaml | a9130f49951cc8f7d0dc5a28192498d6cfc7d2b54078d9995fac532bb8bde957 |
| 角色卡/input-ctrl/boundary.yaml | 8a359d9a3b082660cbc40f43477b7ddcc8523165a6d645a93d66f80802315d1c |
| 角色卡/ui-render/boundary.yaml | a0da838d2b203c34e1a22505fa07a638d66ab44bc61d831d1ed789ce10d272fc |

## 实际创建路径（逐条留痕）

- 角色卡/app-shell/boundary.md
- 角色卡/app-shell/boundary.yaml
- 角色卡/app-shell/role-card.md
- 角色卡/env-bootstrap/boundary.md
- 角色卡/env-bootstrap/boundary.yaml
- 角色卡/env-bootstrap/role-card.md
- 角色卡/game-logic/boundary.md
- 角色卡/game-logic/boundary.yaml
- 角色卡/game-logic/role-card.md
- 角色卡/input-ctrl/boundary.md
- 角色卡/input-ctrl/boundary.yaml
- 角色卡/input-ctrl/role-card.md
- 角色卡/ui-render/boundary.md
- 角色卡/ui-render/boundary.yaml
- 角色卡/ui-render/role-card.md
- docs/audit/shell-gate.jsonl
- docs/contracts/snake-game-architecture-v1.md
- docs/governance/nominator/snake-game-a7-intake-v1.md
- docs/governance/nominator/snake-game-a8-activation-v1.md
- docs/governance/rapporteur/snake-game-a4-prep-v1.md
- docs/intents/snake-game.md
- docs/product/snake-game-a1-prep-v1.md
- docs/product/snake-game-intent-v1.md
- docs/proposals/snake-game-modules-v1.md
- docs/proposals/snake-game-proposal-v1.md
- docs/proposals/snake-game-roster-v1.md
- docs/quality/snake-game-criteria-v1.md
- docs/scheduling/snake-game-a1-intake-v1.md
- docs/scheduling/snake-game-team-v1.md
- docs/workflow.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
