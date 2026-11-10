---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: game
    name: 贪吃蛇游戏
    purpose: 纯静态单页贪吃蛇的全部交付内容——页面结构、深色主题样式、Canvas 渲染、游戏规则、键盘输入与最高分持久化
    category: feature
    path: game/
    publicContract: docs/contracts/snake-game-contract-v1.md
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---

# 模块清单（v1）

- flowId: `snake-game`
- 本文件是模块定义的唯一权威源；名单文档中的 `modules[]` 为其派生快照，须逐项一致。

## 模块表

| id | name | category | path | publicContract | architectureSource |
| --- | --- | --- | --- | --- | --- |
| `game` | 贪吃蛇游戏 | feature | `game/`（目录） | `docs/contracts/snake-game-contract-v1.md` | `docs/contracts/snake-game-architecture-v1.md` |

## 说明

- **单一实现模块**：交付面很小（三个静态文件），拆成多个模块只会增加跨模块约定成本，且 `file://` 下跨文件 ES module 不可用，故整体作为一个交付/验收单元。
- **路径边界**：`game/` 是项目根下的普通交付目录，不落在任何治理写区（`docs/**`、`.ans/**`、`角色卡/**` 等）；与模块清单/提案/契约等文档路径互不重叠。
- **模块内部分层**（逻辑分层，非独立模块）：页面骨架 / 表现层 / 规则层 / 输入与持久化适配，详见架构文档与契约文档。
- **公开契约**：模块对外以 `docs/contracts/snake-game-contract-v1.md` 约定文件名、DOM id、函数职责与行为规则；不提供任何网络接口或外部 API。
- **属主**：由名单中角色 `game-dev` 独占（一模块一属主）。
