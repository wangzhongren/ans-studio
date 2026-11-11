# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在治理会话 settle **之后**生成（治理角色不会算 hash，故 pin 只能事后算）。
> **pin 每轮治理会话 settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经治理会话）的边界改动，**下一次治理会话 settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-11-11T06:17:49.354Z
- 目标项目：C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr21-2026-11-11/target
- 授权来源：desktop-app:操作者导入空文件夹并开启 chief 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）
- 角色（5）：env-bootstrap、game-core-dev、input-ui-dev、qa-verifier、runtime-dev

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/env-bootstrap/boundary.yaml | 493b2b2dd727d291d48dad4d51814b32130ccfe1fc89bfef3ba509087f3a5793 |
| 角色卡/game-core-dev/boundary.yaml | c20aea49dc8133119aa0d580b6ab020a3ed9571420a453f751f5a404eab3970e |
| 角色卡/input-ui-dev/boundary.yaml | c011292b08f0ef631affbcfc69e2f0aaa99d237ebab2a30b3917b1b21877307f |
| 角色卡/qa-verifier/boundary.yaml | f4ac6fdbad08b92d7360296d3579c0123806b1ce40f7dc82c0e75e930d37dc1c |
| 角色卡/runtime-dev/boundary.yaml | 242d913b76fced9d0fbf0a92f23c3ac18a6ec6e7bac77ec0c1cee80d68c298a0 |

## 实际创建路径（逐条留痕）

- 角色卡/env-bootstrap/boundary.md
- 角色卡/env-bootstrap/boundary.yaml
- 角色卡/env-bootstrap/role-card.md
- 角色卡/game-core-dev/boundary.md
- 角色卡/game-core-dev/boundary.yaml
- 角色卡/game-core-dev/role-card.md
- 角色卡/input-ui-dev/boundary.md
- 角色卡/input-ui-dev/boundary.yaml
- 角色卡/input-ui-dev/role-card.md
- 角色卡/qa-verifier/boundary.md
- 角色卡/qa-verifier/boundary.yaml
- 角色卡/qa-verifier/role-card.md
- 角色卡/runtime-dev/boundary.md
- 角色卡/runtime-dev/boundary.yaml
- 角色卡/runtime-dev/role-card.md
- docs/audit/shell-gate.jsonl
- docs/contracts/snake-game-architecture-v1.md
- docs/governance/rapporteur/snake-game-a4-preparation-v1.md
- docs/intents/snake-game-core.md
- docs/product/snake-game-a1-intake.md
- docs/product/snake-game-intent-v1.md
- docs/proposals/snake-game-modules-v1.md
- docs/proposals/snake-game-proposal-v1.md
- docs/proposals/snake-game-roster-v1.md
- docs/quality/snake-game-criteria-v1.md
- docs/scheduling/snake-game-team-v1.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
