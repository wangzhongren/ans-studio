# qa-verifier 边界

## Section 1：可修改文件与目录

| 类型 | 路径 | 用途 |
|------|------|------|
| directory | `test/` | e2e-verification：AC1–AC5 端到端脚本、夹具与验收证据 |

## Section 2：禁写

- 其他角色的模块路径（`src/` 下全部业务模块、`src/main.ts`、env 配置文件）——验证角色不修改实现。
- `角色卡/`、`docs/`（含 intents/product/proposals/contracts/scheduling/quality/verification/skills/mcp/audit）等治理路径。
- `.ans/`、`.git/`、`.env` 与凭据类文件。

## Section 3：说明

- 本边界仅取本角色名下模块 e2e-verification 的路径，与 boundary.yaml 的 entries 恒等。
- review: true 仅表示项目内验收复核职责，不扩张写区、不替代内置 verifier 的独立验收。
