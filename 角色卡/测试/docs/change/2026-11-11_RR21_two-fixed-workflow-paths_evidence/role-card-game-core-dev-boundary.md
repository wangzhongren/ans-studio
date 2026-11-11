# game-core-dev 边界

## Section 1：可修改文件与目录

| 类型 | 路径 | 用途 |
|------|------|------|
| directory | `src/core/state/` | game-state：状态模型、初始状态、方向应用与 reset |
| directory | `src/core/collision/` | collision-boundary：边界与食物判定纯函数 |
| directory | `src/core/scoring/` | scoring：计分与食物再生成 |

## Section 2：禁写

- 其他角色的模块路径（`src/input/`、`src/render/`、`src/loop/`、`src/restart/`、`test/`、`src/main.ts` 及其他 env 配置）。
- `角色卡/`、`docs/`（含 intents/product/proposals/contracts/scheduling/quality/verification/skills/mcp/audit）等治理路径。
- `.ans/`、`.git/`、`.env` 与凭据类文件。

## Section 3：说明

- 本边界仅取本角色名下模块 game-state、collision-boundary、scoring 的路径并集，与 boundary.yaml 的 entries 恒等。
- 跨模块改动须由对应模块属主在其写区内完成，本角色不代改。
