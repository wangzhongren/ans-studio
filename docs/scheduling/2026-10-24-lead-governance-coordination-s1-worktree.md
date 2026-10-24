# S1 worktree 预检：主理统一协调（lead-governance-coordination）

- 日期：2026-10-24
- Worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`
- 基线：detached HEAD `eec92ad`；`git status` 干净；主工作树未动（flow 骨架 S2/S4 未提交改动原样保留）。
- Node：v24.22.1；`node ../../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` **exit 0**。
- 未 commit/push；未写目标/演示。

## 1. 隔离结果

- 已按客户授权从 `eec92ad` 创建独立 worktree；主工作树的 flow 骨架 S2/S4 未提交改动不进入本候选。
- 本 worktree 初始干净，团队计划 §三写集不与在途改动重叠。
- 团队计划/设计/审计/沟通记录仍在主工作树（未复制进候选）；本 worktree 只写实施/测试/变更包。

## 2. P0-1 发布动作预检（阻塞）

- 在 `app/desktop/**`、`src/**` 搜索 `release`/`发布`/`publish`/`acceptance start`：没有“开始发布验收”的应用内动作/卡片/命令/trigger。
- 现有 `package.json` 的 `release:prepare`/`release:verify`、`src/common/装配/release-*.mjs` 是 **ans-studio 自身打包/发布**，不是目标项目 flow 的发布验收动作；不能作为本计划的 release 门。
- 现有 auto-Proof/verifier criteria 仍由 settle/ledger/import 触发（`app/desktop/interface.ts` 的 `dispatchAcceptanceForFlow`），flow schema 无 release 字段；没有可复用的显式发布动作。
- 团队计划 §2.4/§九.5 的停止条件成立：P0-1 同批需要新增显式发布动作（卡片/命令/trigger/UI 或 flow 字段），属闸门 2 delta，不能默认扩权。

## 3. 结论

- Worktree/S1 基线通过；**P0-1 发布门外加新入口前不能同批实施**。
- 未派发 S2–S6；未改代码/测试/角色卡/边界；未 commit/push。
- 需要客户在两种方式中选一：
  - **新增显式发布动作**（新卡片/命令/trigger，走闸门 2 delta；P0-1 同批）；
  - **P0-1 拆独立 T3**：先做 S2/S3/S4a 等不含 P0-1 的部分，变更包不得宣称验收闭环。
- 本记录只写 worktree 的 `docs/scheduling/`；主工作树的 S1 预检/沟通记录仍保留。
