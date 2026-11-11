# input-ui-dev 边界

## Section 1：可修改文件与目录

| 类型 | 路径 | 用途 |
|------|------|------|
| directory | `src/input/` | input-control：键位→Direction 映射与反向抑制 |
| directory | `src/render/` | rendering：只读 StateSnapshot 绘制 |

## Section 2：禁写

- 其他角色的模块路径（`src/core/`、`src/loop/`、`src/restart/`、`test/`、`src/main.ts` 及其他 env 配置）。
- `角色卡/`、`docs/`（含 intents/product/proposals/contracts/scheduling/quality/verification/skills/mcp/audit）等治理路径。
- `.ans/`、`.git/`、`.env` 与凭据类文件。

## Section 3：说明

- 本边界仅取本角色名下模块 input-control、rendering 的路径并集，与 boundary.yaml 的 entries 恒等。
- 跨模块改动须由对应模块属主在其写区内完成，本角色不代改。
