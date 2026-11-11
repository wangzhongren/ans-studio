# snake-game A7 人事受理/准备说明

- flowId：snake-game
- workflowId：wf-7fcce8656a9bfb7fca73f124
- 阶段：A7（人事受理/准备）
- A6 客户决定：decision-req-a5ce57f0ddcd5415（客户本人 accept，由运营任务事实转达；A7 仅记录，不据此写卡或激活）
- 依据文件：`docs/proposals/snake-game-roster-v1.md`（schema: project-roster/v4）、`docs/proposals/snake-game-modules-v1.md`（schema: project-modules/v2）、`docs/proposals/snake-game-proposal-v1.md`（v1）、`docs/contracts/snake-game-architecture-v1.md`（v1）、`docs/product/snake-game-intent-v1.md`（v1）

## 1. 名单可执行性确认

| 检查项 | 实际值 | 结论 |
| --- | --- | --- |
| 角色数量 | 1 个：`game-implementer`（displayName=游戏实现者） | 通过 |
| 模块数量 | 2 个：`game-entry`、`game-core` | 通过 |
| 模块路径 | `game-entry` → `index.html`（category=app，根目录文件）；`game-core` → `src/`（category=core，目录） | 通过 |
| 角色模块绑定 | `game-implementer.modules = [game-entry, game-core]` | 通过（每角色至少一模块） |
| 模块属主唯一 | topology 中 `game-entry.roleId = game-implementer`、`game-core.roleId = game-implementer`；frontmatter 绑定唯一来源 | 通过（每模块恰一属主） |
| 路径不重叠 | 根文件 `index.html` 与兄弟目录 `src/` 互不包含、互不重叠 | 通过（边界可安全取并集：`index.html` + `src/`） |
| 验收角色 | `review: false`（v4 可选字段），实现者不参与验收；验收由内置 verifier 独立执行 | 通过 |
| 团队拓扑 | `management = [convener, game-implementer]`，为含 convener 与全部项目角色的扁平数组 | 通过 |
| 引用版本链 | intent=snake-game-intent-v1、proposal=snake-game-proposal-v1、architecture=snake-game-architecture-v1、modulesDoc=snake-game-modules-v1；均为当前最新版且文件存在 | 通过 |
| roster modules 与 modules 文档一致性 | 两模块的 id/name/purpose/category/path/publicContract/architectureSource 逐项一致 | 通过（无 drift） |
| envBootstrap | `omitted: true` 且含非空 omissionReason（纯静态单页无构建/装配步骤）；未含 env/entry 保留模块 | 通过 |
| 模块路径写区 | 两个路径均不在治理写区（`.ans/`、`docs/` 等）内 | 通过 |

结论：名单可执行。1 个实现角色承担全部 2 个模块，模块属主唯一、路径不重叠，边界与写区自洽；无需增删角色或改动名单。

## 2. A8 将创建的三份文档路径草案（A7 不创建）

- `角色卡/game-implementer/role-card.md`
- `角色卡/game-implementer/boundary.md`
- `角色卡/game-implementer/boundary.yaml`

说明：以上仅为路径草案，A7 未创建任何角色卡或边界文件；建卡与激活属 A8 另派任务，不与 A7 合并。

预期边界条目（A8 按名单模块并集生成，A7 不落盘）：

- `index.html`（文件，`game-entry` 模块）
- `src/`（目录，`game-core` 模块）

不得扩大到治理目录、其他角色目录或名单外路径。

## 3. A8 激活参数草案（`activate_role_documents` v2）

- `flowId`：snake-game
- `workflowId`：wf-7fcce8656a9bfb7fca73f124
- `targetRoleId`：game-implementer
- `proposalDecisionId`：decision-req-a5ce57f0ddcd5415
- `roster`：只传 `path = docs/proposals/snake-game-roster-v1.md`（sha256 由应用在激活前按实际字节计算并回填，不手写、不转抄）
- `documents`：`card` / `boundaryMd` / `boundaryYaml` 三项均只传对应路径（分别为第 2 节三份路径；sha256 由应用按实际字节计算回填）
- 激活前应用会复核 roster 与 A6 documentRefs 一致性；失败保留旧有效卡，新角色不就绪。

## 4. 待澄清项

无待澄清项。
