# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在治理会话 settle **之后**生成（治理角色不会算 hash，故 pin 只能事后算）。
> **pin 每轮治理会话 settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经治理会话）的边界改动，**下一次治理会话 settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-11-11T08:45:33.606Z
- 目标项目：C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr26-2026-11-11/target
- 授权来源：desktop-app:操作者导入空文件夹并开启 chief 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（2）：env-bootstrap、game-owner

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/env-bootstrap/boundary.yaml | cdd9ddc56623b6f437678cea5e963843c941fba265de0ff71725b0125f8b2403 |
| 角色卡/game-owner/boundary.yaml | 58627a86cee7f9952f99bf4ca32f56279577e52f7cd8c945f27809ed07d1fbd5 |

## 实际创建路径（逐条留痕）

- 角色卡/env-bootstrap/boundary.md
- 角色卡/env-bootstrap/boundary.yaml
- 角色卡/env-bootstrap/role-card.md
- 角色卡/game-owner/boundary.md
- 角色卡/game-owner/boundary.yaml
- 角色卡/game-owner/role-card.md
- docs/audit/shell-gate.jsonl
- docs/contracts/snake-game-architecture-v1.md
- docs/governance/nominator/snake-game-a7-intake.md
- docs/governance/nominator/snake-game-a8-activation.md
- docs/intents/snake-game-intent.md
- docs/product/snake-game-intent-v1.md
- docs/proposals/snake-game-modules-v1.md
- docs/proposals/snake-game-proposal-v1.md
- docs/proposals/snake-game-roster-v1.md
- docs/quality/snake-game-criteria-v1.md
- docs/quality/snake-game-report-v1.md
- docs/quality/snake-game-report-v2.md
- docs/scheduling/snake-game-team-v1.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
