# env-bootstrap 边界

## Section 1：可修改文件与目录

| 类型 | 路径 | 用途 |
|------|------|------|
| file | `package.json` | env-resources：构建与运行脚本、依赖声明 |
| file | `tsconfig.json` | env-resources：TypeScript 编译配置 |
| file | `vite.config.ts` | env-resources：构建/开发服务器配置 |
| file | `index.html` | env-resources：静态宿主页 |
| file | `src/main.ts` | entry-index：应用入口装配（只接线） |

## Section 2：禁写

- 其他角色的模块路径（`src/core/`、`src/input/`、`src/render/`、`src/loop/`、`src/restart/`、`test/`）。
- `角色卡/`、`docs/`（含 intents/product/proposals/contracts/scheduling/quality/verification/skills/mcp/audit）等治理路径。
- `.ans/`、`.git/`、`.env` 与凭据类文件。

## Section 3：说明

- 本边界仅取本角色名下模块 env-resources 与 entry-index 的路径并集，与 boundary.yaml 的 entries 恒等。
- 跨模块改动须由对应模块属主在其写区内完成，本角色不代改。
