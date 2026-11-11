# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在治理会话 settle **之后**生成（治理角色不会算 hash，故 pin 只能事后算）。
> **pin 每轮治理会话 settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经治理会话）的边界改动，**下一次治理会话 settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-11-11T08:14:29.776Z
- 目标项目：C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr25-2026-11-11/target
- 授权来源：desktop-app:操作者导入空文件夹并开启 chief 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（4）：app-integrator、game-core-dev、game-ui-dev、qa-reviewer

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/app-integrator/boundary.yaml | 65c239c755471a81c1146d1381c643fac22cce0667311ce27226198b4b50cab8 |
| 角色卡/game-core-dev/boundary.yaml | dee85b515cf2de04493a406f0f252df32648dcdb952e84959a6c1037f82cb8d7 |
| 角色卡/game-ui-dev/boundary.yaml | 699200011c6943e1c510c5c50f58852ee143d0c16078dd24e3cc447229a0bebc |
| 角色卡/qa-reviewer/boundary.yaml | ff5e0135a8c263d3e690c908f87f172726b68ef176c21e9d3dcfcde9a0922837 |

## 实际创建路径（逐条留痕）

- 角色卡/app-integrator/boundary.md
- 角色卡/app-integrator/boundary.yaml
- 角色卡/app-integrator/role-card.md
- 角色卡/game-core-dev/boundary.md
- 角色卡/game-core-dev/boundary.yaml
- 角色卡/game-core-dev/role-card.md
- 角色卡/game-ui-dev/boundary.md
- 角色卡/game-ui-dev/boundary.yaml
- 角色卡/game-ui-dev/role-card.md
- 角色卡/qa-reviewer/boundary.md
- 角色卡/qa-reviewer/boundary.yaml
- 角色卡/qa-reviewer/role-card.md
- docs/audit/shell-gate.jsonl
- docs/contracts/snake-game-architecture-v1.md
- docs/intents/snake-game.md
- docs/product/snake-game-intent-v1.md
- docs/proposals/snake-game-modules-v1.md
- docs/proposals/snake-game-proposal-v1.md
- docs/proposals/snake-game-roster-v1.md
- docs/scheduling/snake-game-team-v1.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
