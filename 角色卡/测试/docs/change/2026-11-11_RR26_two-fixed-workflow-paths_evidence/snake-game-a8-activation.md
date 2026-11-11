# snake-game A8 角色建卡与激活记录

- flowId：snake-game
- 任务：#t-mwbv0s3m-c45fd9bf（来自运营 convener，stage=A8）
- proposalDecisionId：decision-req-cc69217cbb05412e
- 依据：`docs/proposals/snake-game-roster-v1.md`（v1）、`docs/proposals/snake-game-modules-v1.md`（v1）、`docs/contracts/snake-game-architecture-v1.md`（v1）

## 1. 建卡范围（仅名单两角色，未增招）
| 角色 | 模块 | 边界条目 |
| --- | --- | --- |
| env-bootstrap | env-resources、entry-index | file `styles.css`、file `index.html` |
| game-owner | game | file `src/game.js` |

三文档路径：
- `角色卡/env-bootstrap/role-card.md` / `boundary.md` / `boundary.yaml`
- `角色卡/game-owner/role-card.md` / `boundary.md` / `boundary.yaml`

角色卡均含 10 个必填章节（组别/工作立场/能力描述/职责与功能导航/必读资料/交接输入输出/执行原则/质量职责/标准工作流/交付物清单），并写明：任务只来自运营（convener）、完成/阻塞先 submit_report 给运营、只写自己名下模块文件、不写角色卡/他人目录/治理路径、不派发/不招人/不联系客户、验收由质检执行且不自行宣告完成。boundary.md 与 boundary.yaml 条目集合（kind/path）恒等，且严格限定在各自模块路径并集内。

## 2. 激活回执（activate_role_documents v2，只传路径）
- env-bootstrap：`ok:true`，roleId=env-bootstrap，workflowId=wf-afe8ddbeba445bed145ccd1c，replay=false，stageCompleted=false；activationKey 为 `role-activation:<workflowId>:env-bootstrap:<rosterSha256>`；rosterSha256 由应用计算，与 versions 记录一致。
- game-owner：`ok:true`，roleId=game-owner，workflowId=wf-afe8ddbeba445bed145ccd1c，replay=false，stageCompleted=true；activationKey 为 `role-activation:<workflowId>:game-owner:<rosterSha256>`；rosterSha256 由应用计算，与 versions 记录一致。
- 两个角色均一次激活成功，无失败、无重放；未由应用要求额外客户确认卡，未代客户批准。

## 3. 遗留与注意
- 两角色边界均为文件级：不得创建额外文件/目录（含 README、临时脚本、资源目录）；如需扩展须名单 v2 并经客户同意。
- `src/` 目录尚不存在，game-owner 首次写 `src/game.js` 的父目录创建依赖门禁行为，若被拒须如实回报，不绕行。
