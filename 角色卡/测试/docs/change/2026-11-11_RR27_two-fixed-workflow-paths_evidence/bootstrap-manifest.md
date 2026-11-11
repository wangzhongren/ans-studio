# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在治理会话 settle **之后**生成（治理角色不会算 hash，故 pin 只能事后算）。
> **pin 每轮治理会话 settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经治理会话）的边界改动，**下一次治理会话 settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-11-11T10:33:04.296Z
- 目标项目：C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr27-2026-11-11/target
- 授权来源：desktop-app:操作者导入空文件夹并开启 chief 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（3）：env-bootstrap、game-core-dev、game-ui-dev

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/env-bootstrap/boundary.yaml | 964fb1dfcfccc67dd1197e658b77469ec7c98d849aead18e26ce64dae6f0bd64 |
| 角色卡/game-core-dev/boundary.yaml | ad4d1ba8e96ec2a362cdeede632a560f4c26a6215bfddc57c88e04141b9cc794 |
| 角色卡/game-ui-dev/boundary.yaml | e92441bc30a5aa3108815c51ec59aa53e36a5359736f4769f59b8bd89c59bca3 |

## 实际创建路径（逐条留痕）

- 角色卡/env-bootstrap/boundary.md
- 角色卡/env-bootstrap/boundary.yaml
- 角色卡/env-bootstrap/role-card.md
- 角色卡/game-core-dev/boundary.md
- 角色卡/game-core-dev/boundary.yaml
- 角色卡/game-core-dev/role-card.md
- 角色卡/game-ui-dev/boundary.md
- 角色卡/game-ui-dev/boundary.yaml
- 角色卡/game-ui-dev/role-card.md
- docs/audit/shell-gate.jsonl
- docs/contracts/snake-game-architecture-v1.md
- docs/intents/snake-game.md
- docs/product/snake-game-intent-v1.md
- docs/proposals/snake-game-modules-v1.md
- docs/proposals/snake-game-proposal-v1.md
- docs/proposals/snake-game-roster-v1.md
- docs/quality/snake-game-criteria-v1.md
- docs/scheduling/snake-game-team-v1.md
- docs/workflow.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
