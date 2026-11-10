# 真实运行记录 RR20：贪吃蛇全链（bootstrap 快照/冻结闭包修复后）——VCA applied、trunk t1 首次发布；Git 预算 9>8 在初始 workflow 前停止（2026-11-10）

- 角色：ANS 测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 轮次：**RR20（协调方授权：bootstrap 快照/冻结闭包修复后的真实运行，按 B1 建议预算）**。依据协调方 2026-11-10 书面授权原文（`round20/evidence/coordinator-authorization.txt`；要点：同一 round8 target 再次清理并运行；`.ans/sessions` 移到 `round20/evidence/pre/sessions-source/`；RR19 后账本另存后重置为空；保留 docs/`.ans/trunk` 产物/operations/git-init-process/versions/doc-freezes/init-source；核对冻结文档/init/repoId/候选 ref 未变；原 target 只读；披露「再次账本重置/会话剥离」；**RR19 残留 draft run/`s-9fbf9c81…` 保留并披露，不复用**；真实 Electron（含修复候选 W1/W2/W5）+ 真实模型 deepseek-v4-flash + 真实 UI；隔离 `round20/userData`；CDP 仅 9223；9222/其它根零触碰；1 条客户消息含 run_shell 禁令 + **4-target 标准 bootstrap VCA**（proposal v2/modules v1/roster v2/architecture v2；`expectedFromSha256` 全 null；新 operationId `…-02`；应用自动装配 9 文件；candidate/publication allowed；t1）→ stable-write 显式 approve → 初始 workflow → 团队计划（team-v2，无 base/sha/runId）→ run pin → 任命 D3 → 角色卡/激活 → 工作流 → 实现 → 出游戏或下一门；变更/门工具 blocked/failed 立即停止；预算：客户消息 1、卡 ≤4、派发 ≤8、chief ≤8、convener ≤3、product/impl ≤4、其它各 ≤3、**Git ≤8**、墙钟 ≤45 分钟；首果即停、不自动重试、不追加；严禁伪造；只取证，不改仓库代码/测试/角色卡/其它文档，不提交/推送）。
- 日期：2026-11-10（本地 05:57–06:00 +0800；UTC 2026-11-09T21:57:21–22:00:40）。
- 工作区（git worktree，真实应用入口）：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 **`feat/bootstrap-snapshot-freeze-closure`**；HEAD **`0ab25843a9b2e3e187c47a1c14ef51da187414b9`**（tree `d6c2158da0547cb9028166eeda6c4be22686babb`）；**修复候选 5 文件（2 M + 3 新）在树内，聚合 `e99f7cb4…`（见 §3）**。
- 运行根（仓库外）：`C:\Users\51054\Desktop\work\ans-snake-fullchain-run-2026-11-10\round20\`（`rr\`、隔离 `userData\`、`evidence\`）。
- 目标项目：`…\round8\target`（RR8 init 产物与原 operation 原样保留；**RR20 再次同根清理：RR19 运行态会话剥离 + 账本重置；RR19 残留 draft run/`s-9fbf9c81…` 保留者**）。
- 隔离：CDP **仅 9223** + 隔离 userData；**9222 全程 0 LISTENING**；9223 结束后释放（仅 TIME_WAIT）、无 Electron 残留。
- 纪律：未修改仓库产品/测试/角色卡/其它文档（只写本记录与 `2026-11-10_RR20_snake-full-chain-evidence/`）；未提交/推送/合并/发布；未发第 2 条客户消息；未伪造任何状态。

## 0. 结论摘要（先读；全部为事实陈述）

1. **再次清理完成（同根，非原 target）**：round8 target 由 **110 文件 / 4,711,159 B** 清理为 **95 文件 / 1,183,645 B（<16 MiB）**。`docs/`、`.ans/trunk/`（`initialization-sources` 21、`operations`（含原 operation）、`snapshots` 11（含 RR19 残留 `s-9fbf9c81…`））、`.ans/git-init-process.json`、`versions.jsonl`/`doc-freezes.json`/`version-changes.json`/stable-write 状态、`.git/`（候选 ref 1 个）**在清理时均未改写**；8 份冻结文档逐字节匹配（8/8）。
2. **会话剥离（RR19 运行态）**：`.ans/sessions` **15 文件 / 3,524,131 B 移动**到 `round20/evidence/pre/sessions-source/`（不是删除；移动前后逐文件 SHA-256 全部一致，源目录已不存在）。
3. **账本重置（第四次）**：RR19 后账本 **1 行 / 3,383 B / SHA-256 `91946bf5…`**（`t-mw9o3qct-10de2279`）先复制到 `round20/evidence/pre/source-ledger-tasks.jsonl`（字节/hash 相同），随后重置为空文件（**0 B / `e3b0c442…`**）。如实披露：**再次账本重置/会话剥离为运行前 fixture 准备**。**RR19 残留 draft run 与快照 `s-9fbf9c81…` 保留未复用**（运行前 `snapshots` 11、新运行只新增 `s-4f9b6762…`）。
4. **修复候选如实绑定**：worktree 分支 `feat/bootstrap-snapshot-freeze-closure`、HEAD `0ab2584`；`src app test` **5 文件（2 M + 3 新）**：`classify-shell.ts` `b4b98a5a…`、`apply-journal.ts` `d0a3fdf2…`、`test/编排/bootstrap-frozen-closure.test.ts` `3228020b…`、`test/门禁引擎/freeze-closure.test.ts` `9109711a…`、`test/测试/bootstrap-frozen-closure-integration.test.ts` `f949bfa4…`；**聚合 `e99f7cb47355f2f7d61a85fee6cbd9d8ab1ba977f3cbfbcacd5461575ba44490`**（路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联的 SHA-256，独立复算一致）。B1 `9b7fa81c…`、B2 `6a91eb14…`、D1 `2d88b40d…`、W1 `0ffe52c8…`、W2 `37249c42…`、W5 `66d83124…` 均与授权引用一致。
5. **VCA 首次成功（本轮关键结果）**：product 于 **21:58:56.068Z** 调用 `submit_version_change`（kind=version-upgrade、`baseTrunk:null`、**4 targets**：proposal v2 / modules v1 / roster v2 / architecture v2、**`expectedFromSha256` 全为 `null`**、operationId **`op-snake-game-trunk-bootstrap-20261110-02`**）→ **21:59:00.652Z 应用回执 `ok:true / status:"applied" / applicationId:"vc-87528873023338" / targetDigest:"30194da5531a30f6802d35514bf0353fdabbb568ffc7e89abbac5e30b82ba355"`**（journalId `j-1fbd7cabf597aa6970f1f3b4`）。
6. **首个 effective trunk t1 已发布**：`refs/ans/trunk` = **`100a6621ce8ae19c976054d1e3fb26ecdc850ef8`**（提交信息 `ANS trunk 1 30194da5…`）；trunk 快照 **`s-4f9b6762576a427420f56f676d71f54aa6ed888461a8edf9da9c3139384c789a`**（digest `aa943c3d…`，**9 文件**：versions.jsonl + 8 条 frozen 记录文件，含 intent v1 与 proposal/architecture/roster v1+v2）；manifest 原件见 §5.3（git 媒体内，1,499 B / `15253d0b…`）；`.ans/trunk/git-mode.json` 新建（231 B / `6546acae…`）；候选 ref 2 个（`83ca5888…` + 新 `fddd168d…`→`100a6621…`）。
7. **链继续到 convener 但被 Git 预算停止**：应用/chief 于 **21:59:21.015Z** 创建 convener 任务 `t-mw9t0913-460a0569`（步骤：`request_stable_write` 写 `docs/workflow.md`（stable-write 卡显式 approve）→ `complete_team_plan` 登记 team-v2 → run pin；并预警 team-v2 引用 roster-v1 的 `reference-invalid` 风险）。convener 只完成 3 次只读 `git_query`（branch-list/log/ls-tree）后，驱动于 **21:59:21.800Z** 以 **`budget-git:9>8`** 停止（Git 能力调用 9 > 预算 8）。**未到达 request_stable_write/stable-write 卡/初始 workflow/团队计划/run pin/D3/角色卡激活/工作流/实现/游戏。**
8. **Git 9 次明细**（全部只读）：chief status、product branch-list、chief log、convener branch-list、product ls-tree、convener log、product show（**blocked `git-query-evidence-unavailable`（`git-show-needs-one-literal-path`）**）、convener ls-tree、product show（同 blocked）。第 9 次后触发预算硬停止；**停止原因是预算超限，不是门拒绝**。
9. **应用侧账本/冻结更新（预期）**：VCA applied 后应用在 `versions.jsonl` 追加 4 条 `event:"frozen"` 记录（applicationId `vc-87528873023338`、reason `role-direct-applied`、origin `role-direct`、actorRoleId product、snapshotRef `s-4f9b6762…`），并重建 `doc-freezes.json`（8 条，builtAt 21:59:21.960）；`version-changes.json` 新增 applied 记录 `vc-87528873023338`。post 哈希：versions `b5d0b840…`、doc-freezes `a1957308…`、version-changes `5095766f…`。**8 份冻结文档文件本身逐字节未变（8/8）**；这些 state 变化为应用在 VCA applied 后的受支持写入，非手改。
10. **零触碰/隔离**：**原 target 114 文件 / 22,041,991 B；114/114 清单 SHA-256 与 RR16 前快照一致**；9222 全程 0 LISTENING；9223 结束后 0 LISTENING（仅 TIME_WAIT）、无 Electron；修复候选 5 文件前后聚合 `e99f7cb4…` 不变；HEAD/tree/分支不变；**run_shell 0**（强禁令保持）。
11. **模型披露**：运行窗口 assistant `message.model` 实测 **`deepseek-v4-flash` ×117**（本窗口无 `<synthetic>`）；`.env` 同名 + `ANTHROPIC_BASE_URL=https://aiproxy2.abujlb.com/deepseek`。**非 Anthropic Claude，不宣称 Claude。**
12. **目标写入（预期）**：95 → **172 文件**（added **77** / removed 0 / changed **7**），总字节 1,183,645 → **3,016,676**。added 含新 operation `fddd168d…`（authorization.jsonl `ed382d26…` / git.json `2a499cbc…`）、`git-mode.json`、快照 `s-4f9b6762…`（94,896 B）、deliveries ×3、git objects/refs/processes、三角色会话、run manifest、init-source；changed 7 为 `versions.jsonl`、`doc-freezes.json`、`version-changes.json`、`tasks.jsonl`、三角色 logs。docs 与冻结文档文件 0 变更。

## 1. 依据与绑定（写盘前实测）

| 项 | 实测 |
| --- | --- |
| RR20 授权 | 协调方 2026-11-10 书面授权原文：`round20/evidence/coordinator-authorization.txt`（见头部要点） |
| **RR19 记录（绑定）** | `角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`：**23,923 B / SHA-256 `a4a90ebed25102ba2bd9b3be3d3863a6980c5fc5064ce6cbc06d3665267f8820`**（前缀 `a4a90ebe` 校验通过） |
| **B1（验收标准）** | `docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`：49,013 B / **`9b7fa81cf4db2bb843691c88e929d49bd193a1f73d0944be3c329b41c6e0bc8b`** |
| **B2（判定报告）** | `docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-report-v1.md`：26,898 B / **`6a91eb14f3c3c9be173e8909c44ed193585729a77b3f29f0680e70d6562c1c98`** |
| **D1（确定性证据）** | `角色卡/测试/docs/change/2026-11-10_D1_bootstrap-snapshot-freeze-closure.md`：187 行 / 28,540 B / **`2d88b40d3848d80e9dc5a7cff3d8f695e7fcd4c96219bd2c472a18280595fa64`** |
| **W1 / W2 / W5** | `角色卡/编排/.../2026-11-10_W1_bootstrap-snapshot-freeze-closure.md` **`0ffe52c8…`**；`角色卡/门禁引擎/.../2026-11-10_W2_bootstrap-snapshot-freeze-closure.md` **`37249c42…`**；`角色卡/测试/.../2026-11-10_W5_bootstrap-snapshot-freeze-closure.md` **`66d83124…`** |
| 绑定原件 | `evidence/pre/pre-facts.json > bindingRR19/bindings/candidate`（可复算） |

## 2. 再次清理（同根清理；如实披露）

- **预态（只读实测）**：round8 target **110 文件 / 4,711,159 B**；`.ans/sessions` **15 文件 / 3,524,131 B**；`.ans/state/tasks.jsonl` **1 行 / 3,383 B / `91946bf5…`**；`snapshots` 11（含 RR19 残留 `s-9fbf9c81…`）、`initialization-sources` 21；runs 含 RR19 残留 draft run（保留，不复用）。
- **动作 1（复制账本）**：`evidence/pre/source-ledger-tasks.jsonl` = 3,383 B / 1 行 / `91946bf5df2711e9c43e6beb0c4535c5b32f03de9d3ed2dae07c0713e43e41b8`（与源逐字节相同）。
- **动作 2（移动会话）**：`.ans/sessions` → `evidence/pre/sessions-source/`；移动前后 **15 文件 / 3,524,131 B / 逐文件 SHA-256 全一致**；`sessions-source-manifest-before/after.json`、`sessions-source.sha256` 为可复算清单；**源目录已不存在（不是删除，未覆盖丢失）**。
- **动作 3（账本重置）**：`.ans/state/tasks.jsonl` 写入空文件；**0 B / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`**。披露：**再次账本重置为运行前 fixture 准备（非应用/角色写入）**。
- **保留未动（清理后复核逐字节一致）**：
  - 8 份冻结文档：architecture v1 `20157fa9…`、architecture v2 `5c38b0dc…`、intent v1 `ae80808b…`、modules v1 `824371eb…`、proposal v1 `3a976464…`、proposal v2 `e6d9b033…`、roster v1 `e745283f…`、roster v2 `782d6bcd…`（**8/8 match**）；
  - `.ans/state/versions.jsonl` `3e87ad9f…`（7,228 B）、`doc-freezes.json` `7df97699…`、`version-changes.json` `6f44edd0…`、`stable-writes.json` `7ffbdbba…`、`stable-write-permits.json` `37215907…`、`versions.initialized` `88b8e31a…`（清理后、运行前）；
  - `.ans/git-init-process.json` `9878db5b…`；原 operation `83ca5888…/init.json` `9ba05825…`（stage `candidate-created`、repoId `6ac15756…`）；候选 ref 仅 `83ca5888…`；
  - `.ans/trunk/initialization-sources` 21 个、`snapshots` 11 个、`operations` 仅原 operation；`.git/` HEAD `ref: refs/heads/ans-unpublished`；**无 manifest / git-mode / refs/ans/trunk**（清理后、运行前）。
- **清理后目标清单**：**95 文件 / 1,183,645 B（<16 MiB）**；`evidence/pre/target-clean-manifest.json` + `target-clean.sha256`（可复算）；空账本（0 行）⇒ 无 legacy moduleDirectory。
- **原 target 只读核对**：`…\ans-game2d-snake-2026-11-09\target` **114 文件 / 22,041,991 B**；用 RR16 `orig-target-pre.sha256` 清单逐文件复算 **114/114 match / 0 mismatch**。
- 准备脚本：`round20/rr/prepare-rr20-clean-copy.mjs`（SHA-256 `575a1323b1058c5fbe1f16e7c82848aaf8ad9788ccb123b7724ce62e53da51cc`）。

## 3. 环境与修复候选（RR-1 / BASE-4/5）

| 项 | 实测 |
| --- | --- |
| 应用入口 | 本 worktree 真实 `app/main.ts`：**83,599 B / SHA-256 `339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba`**（未改；含修复候选的 `src` 模块经真实入口加载）；仓库外 launcher 仅 `app.setPath("userData")` 后 `import()` |
| **修复候选（5 文件，2 M + 3 新）** | `src/common/门禁引擎/classify-shell.ts` `b4b98a5a…`；`src/service/trunk/impl/apply-journal.ts` `d0a3fdf2…`；`test/编排/bootstrap-frozen-closure.test.ts` `3228020b…`；`test/门禁引擎/freeze-closure.test.ts` `9109711a…`；`test/测试/bootstrap-frozen-closure-integration.test.ts` `f949bfa4…`。**聚合 `e99f7cb47355f2f7d61a85fee6cbd9d8ab1ba977f3cbfbcacd5461575ba44490`**；post 复算不变（候选稳定） |
| 分支/HEAD/tree | `feat/bootstrap-snapshot-freeze-closure` / `0ab25843a9b2e3e187c47a1c14ef51da187414b9` / `d6c2158da0547cb9028166eeda6c4be22686babb`；`src app test` 恰 5 项（2 M + 3 新），无其它改动 |
| 运行时 | Electron **44.7.0**；驱动/提取 Node **v24.22.1**；Windows 11 Pro 10.0.26300 |
| userData（隔离） | `…\round20\userData` |
| CDP | **仅 9223**（`--remote-debugging-port=9223`） |
| 模型（如实披露） | `ANS_CLAUDE_MODEL=deepseek-v4-flash`、`ANS_CLAUDE_REASONING_EFFORT=high`、`ANTHROPIC_BASE_URL=https://aiproxy2.abujlb.com/deepseek`；原生 `message.model`=`deepseek-v4-flash`（117 条）。**非 Anthropic Claude** |
| 驱动脚本 | `round20/rr/drive-rr20.mjs`（SHA-256 `226eed7f4cd4023e03af245ea016f5dec4e0c707df49894b746deb1a8fe92ab1`）；post `post-rr20.mjs`（`2f5da4f0…`）；extract `extract-rr20.mjs`（`cba61f9f…`） |

## 4. 运行时间线（UTC）

| 时刻 | 事件 |
| --- | --- |
| 21:57:21 | Electron 启动（9222/9223 预检均 0 LISTENING、无 Electron） |
| 21:57:35.307 | **1 条客户消息发送 mark**；21:57:36.895 `cleared:true`（2,812 B，`customer-message.txt`） |
| 21:57:39.348 | chief `git_query` status（observed） |
| 21:57:43.526 | chief `doc_format("version-change/v1")` |
| 21:58:33–21:58:45 | chief 两次 `dispatch_task` 参数校验失败（模型同回合修正；非驱动重试），第三次受理 |
| **21:58:45.142** | **product 任务 `t-mw9szhcm-b0c14cf4` created**（run `run-hub-f52fc1a0…`，draft） |
| **21:58:56.068** | **product 调用 `submit_version_change`**（4 targets、expectedFromSha256 全 null、operationId `…-02`） |
| **21:58:56.380** | 应用写入 trunk manifest / trunk.state switched（`vc-87528873023338`） |
| **21:58:56.399** | chief 回合 1 `settled` completed（summary「会话结束」） |
| **21:59:00.514 / 21:59:00.652** | **`refs/ans/trunk` 出现 `100a6621…`；VCA 回执 `ok:true / applied`** |
| 21:59:03–21:59:04 | chief `git_query` log 复核 trunk 提交；product 只读核对 |
| 21:59:05–21:59:17 | convener 会话打开（prompt 23,839 B / `67f3e0e1…`）并做 branch-list/log/ls-tree 只读核查 |
| **21:59:21.015** | **chief 创建 convener 任务 `t-mw9t0913-460a0569`**（初始 workflow + 团队计划 + run pin） |
| **21:59:21.800** | **驱动停止：`budget-git:9>8`**（无 gate） |
| 21:59:21.924 / 21:59:22.955 / 21:59:22.956 | chief 第二回合 / product / convener 回合 `settled`「本轮已中止」（stopSession） |
| ≈21:59:21–22:00:40 | 有界收尾：截图 → halt → stopSession → Browser.close；Electron 退出（9223 释放，仅 TIME_WAIT）；证据固化 |

- 驱动进程退出码 **13**（`unsettled top-level await` 外观问题，与 RR6b/RR7–RR19 同族；全部证据在退出前已写盘）。
- 墙钟：启动 21:57:21 → 停止 21:59:21.800 = **≈2 分 01 秒**；消息→停止 **≈1 分 46 秒**。

## 5. 关键证据（原文/原件；只记录，不判验收）

### 5.1 VCA 提交入参（`evidence/drive.jsonl` 21:58:56.068Z 原文要点）

- `kind:"version-upgrade"`、`flowId:"snake-game"`、`baseTrunk:null`、`operationId:"op-snake-game-trunk-bootstrap-20261110-02"`。
- targets（4 项，全部 `action:"add"`，**`expectedFromSha256` 全部为 `null`**）：
  1. `docs/proposals/snake-game-proposal-v2.md`
  2. `docs/proposals/snake-game-modules-v1.md`
  3. `docs/proposals/snake-game-roster-v2.md`
  4. `docs/contracts/snake-game-architecture-v2.md`
- summary 原文：「首个 trunk bootstrap：以 proposal-v2 / modules-v1 / roster-v2 / architecture-v2 四个当前版本文件建立首个有效 trunk（baseTrunk=null，无既有基线），不列 v1 历史文件；成功后由应用装配 9 文件快照。」

### 5.2 应用回执原文（`tool.result`，21:59:00.652Z）

```json
{"ok":true,"status":"applied","applicationId":"vc-87528873023338","operationId":"op-snake-game-trunk-bootstrap-20261110-02","receipt":{"operationId":"op-snake-game-trunk-bootstrap-20261110-02","baseDigest":null,"targetDigest":"30194da5531a30f6802d35514bf0353fdabbb568ffc7e89abbac5e30b82ba355","applicationId":"vc-87528873023338","journalId":"j-1fbd7cabf597aa6970f1f3b4","source":{"kind":"role-direct","action":"version-upgrade","actorRoleId":"product","operationId":"op-snake-game-trunk-bootstrap-20261110-02","applicationId":"vc-87528873023338","baseDigest":null,"targetDigest":"30194da5531a30f6802d35514bf0353fdabbb568ffc7e89abbac5e30b82ba355","at":"2026-11-09T21:58:56.380Z","journalId":"j-1fbd7cabf597aa6970f1f3b4"},"ok":true,"status":"applied"},"journalId":"j-1fbd7cabf597aa6970f1f3b4"}
```

### 5.3 trunk manifest 原件（git 媒体 `100a6621:.ans/trunk/manifest.json`；`evidence/post/trunk-manifest.json`）

```json
{"schema":"trunk/v1","flowId":"snake-game","runId":null,"createdAt":"2026-11-09T21:58:56.380Z","digest":"30194da5531a30f6802d35514bf0353fdabbb568ffc7e89abbac5e30b82ba355","trunkVersion":1,"previous":null,"source":"upgrade","updatedAt":"2026-11-09T21:58:56.380Z","artifacts":{"documents":{"proposal":{"path":"docs/proposals/snake-game-proposal-v2.md","sha256":"e6d9b033…","version":2},"modules":{"path":"docs/proposals/snake-game-modules-v1.md","sha256":"824371eb…","version":1},"roster":{"path":"docs/proposals/snake-game-roster-v2.md","sha256":"782d6bcd…","version":2},"architecture":{"path":"docs/contracts/snake-game-architecture-v2.md","sha256":"5c38b0dc…","version":2}},"execution":{"teamPlan":null,"flow":null},"roleCards":{},"boundaries":{}},"snapshotRef":{"snapshotId":"s-4f9b6762576a427420f56f676d71f54aa6ed888461a8edf9da9c3139384c789a","digest":"aa943c3dc3f3da11ac7565ebf01e19b33d40ea22874e0d290d5fedf486d3b742"},"actionSource":{"kind":"role-direct","action":"version-upgrade","actorRoleId":"product","operationId":"op-snake-game-trunk-bootstrap-20261110-02","applicationId":"vc-87528873023338","baseDigest":null,"targetDigest":"30194da5…","at":"2026-11-09T21:58:56.380Z","journalId":"j-1fbd7cabf597aa6970f1f3b4"}}
```
- 原件：**1,499 B / SHA-256 `15253d0b30f17d01c467b8f6c55136072059ceef860de1fc93c59fc28fd2d33f`**（`git show 100a6621:.ans/trunk/manifest.json`）。注意：git 媒体下工作树 `.ans/trunk/manifest.json` **不存在**（`post-summary.json > trunkPost.manifestExists:false` 指工作树文件）；manifest 由 `refs/ans/trunk` 提交携带。
- `refs/ans/trunk` 提交：`100a6621ce8ae19c976054d1e3fb26ecdc850ef8`，message 原文 `ANS trunk 1 30194da5531a30f6802d35514bf0353fdabbb568ffc7e89abbac5e30b82ba355`；候选 refs：`83ca5888… → 2214956b…`、`fddd168d… → 100a6621…`；`.ans/trunk/git-mode.json` `6546acae…`（repoId `6ac15756…`，ref `refs/ans/trunk`，journal `…/fddd168d…/git.json`）。

### 5.4 9 文件冻结闭包快照（`evidence/extracts/vca-snapshot-files.json`）

`s-4f9b6762576a427420f56f676d71f54aa6ed888461a8edf9da9c3139384c789a`（digest `aa943c3d…`，94,896 B 快照文件）包含 **9 文件**：
`.ans/state/versions.jsonl`（`3e87ad9f…`）、`docs/contracts/snake-game-architecture-v1.md`（`20157fa9…`）、`docs/contracts/snake-game-architecture-v2.md`（`5c38b0dc…`）、`docs/product/snake-game-intent-v1.md`（`ae80808b…`）、`docs/proposals/snake-game-modules-v1.md`（`824371eb…`）、`docs/proposals/snake-game-proposal-v1.md`（`3a976464…`）、`docs/proposals/snake-game-proposal-v2.md`（`e6d9b033…`）、`docs/proposals/snake-game-roster-v1.md`（`e745283f…`）、`docs/proposals/snake-game-roster-v2.md`（`782d6bcd…`）。**8 条 frozen 记录 + versions 全部按闭包装配，修复生效。**

### 5.5 新 operation 原件（`.ans/trunk/operations/fddd168d…/`）

- `authorization.jsonl`：1,202 B / SHA-256 `ed382d26f4b2178104c0bd8d4f64a1ee4d16494d8f739c9c6b85d6d008a638dd`。
- `git.json`：3,241 B / SHA-256 `2a499cbc59e6a00756421b59f6297f16968366d7593b74c29909c79816a989dd`。
- 原件已复制到 `evidence/trunk-operations/fddd168d…/`。

### 5.6 convener 任务与停止点

- 任务 `t-mw9t0913-460a0569`（21:59:21.015Z，run `run-hub-f52fc1a0…`）文本要点：步骤 1 `request_stable_write` 写 `docs/workflow.md`（stable-write 卡显式 approve；正文按地址引用 contract-v2/architecture-v2/modules-v1/team-v2）；步骤 2 `complete_team_plan` 登记 `docs/scheduling/snake-game-team-v2.md`（**预警：team-v2 引用 roster-v1，而实际最新名单是 roster-v2；若登记被拒则逐字记录并停止**）；步骤 3 run pin；**不发任命卡、不写角色卡、不派 worker**。
- convener 实际只完成 3 次只读 `git_query`（branch-list/log/ls-tree，均 observed）；**未调用 `request_stable_write`/`complete_team_plan`**；回合被 stopSession 中止。
- 驱动停止事件原文：
  ```json
  {"type":"monitor.stop","stopCause":"budget-git:9>8","gate":null,"at":"2026-11-09T21:59:21.800Z","msgMark":"2026-11-09T21:57:35.307Z","budget":{"customerMessages":1,"cardsTotal":0,"cardsByKind":{},"dispatches":2,"turnsByRole":{"chief":1},"gitCalls":9,"runShellCalls":0,"writeEdits":0}}
  ```

### 5.7 应用侧 state 更新（VCA applied 的受支持写入）

- `versions.jsonl` 追加 4 条 `event:"frozen"`（proposal v2 / modules v1 / roster v2 / architecture v2；applicationId `vc-87528873023338`；reason `role-direct-applied`；origin `role-direct`；actorRoleId `product`；snapshotRef `s-4f9b6762…`）；post **`b5d0b8406add763de97b5ab1d7ea6d28a359e6101b5cb813f6b0b889842e0e03`**（11,130 B）。
- `doc-freezes.json` 重建：8 条，builtAt `2026-11-09T21:59:21.960Z`，post **`a19573085c071efed37b66e4a83460511f7d33477e2d166ef5055c3f05ae5cf6`**（2,413 B）。
- `version-changes.json`：4 条记录，新增 `vc-87528873023338`（applied，4 targets，snapshotRef `s-4f9b6762…`，targetDigest `30194da5…`）；post **`5095766f…`**（8,767 B）。
- **8 份冻结文档文件本身 post 逐字节未变（8/8 match）**；以上 state 变化由应用在 VCA applied 后写入，非手改。

### 5.8 目标写入（预期）

- 95 → **172 文件**（added **77** / removed 0 / changed **7**），总字节 1,183,645 → **3,016,676**。
- added：新 operation `fddd168d…`（authorization/git.json）、`git-mode.json`、快照 `s-4f9b6762…`、`.ans/trunk/deliveries/` ×3、`.git/objects/` ×24、`.git/refs/ans/trunk`、`.git/refs/ans/candidates/fddd168d…`、`.git/ans/processes/` ×23、三角色会话、`run-hub-f52fc1a0…/manifest.json`、`init-source-a42d46c8…`。
- changed：`versions.jsonl`、`doc-freezes.json`、`version-changes.json`、`tasks.jsonl`（5 行：product task.created、project.note、version.change、trunk.state、convener task.created；post `edd91181d57fd0c8c1250f53446135f2c4b79146e24a069135994e88f73367be`）、`logs/chief.jsonl`、`logs/convener.jsonl`、`logs/product.jsonl`。**docs 与冻结文档文件 0 变更。**

## 6. 预算（对照 RR20 授权）

| 项 | 预算 | 实测 | 说明 |
| --- | --- | --- | --- |
| 客户消息 | 1（+1 仅合法客户决策） | **1** | 21:57:35.307Z mark（2,812 B） |
| 客户面对卡 | ≤4 | **0** | 未到达 stable-write 卡；无其它卡 |
| 应用层派发 | ≤8 | **2** | chief→product `t-mw9szhcm…`、chief→convener `t-mw9t0913…` |
| chief 回合 | ≤8 | **1 完成 + 1 中止**（停止后） | 回合 1 settled 21:58:56.399Z；回合 2 被 stopSession 中止 |
| convener 回合 | ≤3 | **1 在飞（中止）** | 3 次只读 git_query 后中止 |
| product 回合 | ≤4 | **1 完成 + 1 中止** | VCA applied；后续回合中止 |
| 其它角色各 | ≤3 | **0** | 无 |
| Git 能力调用 | **≤8** | **9（超限 → 停止）** | chief status/log；product branch-list/ls-tree/show×2（2 次 blocked）；convener branch-list/log/ls-tree |
| run_shell | 禁用 | **0** | 强禁令保持 |
| 墙钟 | ≤45 分钟 | **≈2 分 01 秒**（启动→停止） | 21:57:21Z–21:59:21.8Z |
| 首果即停 / 不重试 / 不追加 | 必须 | **遵守** | 预算硬停止后未重试、未发第 2 条消息、未继续 |
| 不触碰 9222/其它根 | 必须 | **遵守** | §7 |

**预算偏差（如实）**：Git 能力调用 **9/≤8**，为本轮停止原因；9 次均为只读 `git_query`（2 次 blocked `git-query-evidence-unavailable`，7 次 observed）。其余预算项均在限内。**本轮无门拒绝**（VCA applied；全部结算正常）。

## 7. 隔离与零改动证据（RR-5/零触碰）

| 项 | 运行前 | 运行中 | 运行后 |
| --- | --- | --- | --- |
| 9222 | 0 LISTENING | **0 LISTENING** | 0 LISTENING |
| 9223 | 空闲 | 本 RR20 Electron LISTENING | **0 LISTENING（仅 1 条 TIME_WAIT）**；无 Electron 残留 |
| **原 target（只读源）** | 114 文件 / 22,041,991 B | — | **114 文件 / 22,041,991 B；114/114 SHA-256 match，0 mismatch** |
| 修复候选/仓库 | 5 文件（2 M + 3 新）/ 聚合 `e99f7cb4…`；HEAD/tree/分支不变 | — | **5 文件 / 聚合 `e99f7cb4…` / HEAD/tree/分支不变**；`src app test` 仍恰 5 项；未提交/推送/合并/发布 |
| 仓库唯一写入 | — | — | 本记录 + `2026-11-10_RR20_snake-full-chain-evidence/`（按授权） |

- 目标为**同根清理副本**（非原 target）；清理只涉及 `.ans/sessions` 移动与 `.ans/state/tasks.jsonl` 重置；其余 docs/trunk/versions/freeze/init/.git 在清理时未见改写（§2 逐字节核对）；运行中的 trunk/state 写入为应用受支持路径（§5）。
- 运行后目标已有 trunk t1、三角色运行态会话（22 文件）、三角色 logs 与 2 个任务；后续轮次如继续使用同一目标，需再次按本流程清理（本记录不预判）。

## 8. 模型与工具面披露（如实）

1. 真实模型调用（无桩）；运行窗口 assistant `message.model`：**`deepseek-v4-flash` ×117**（无 `<synthetic>`）。**非 Anthropic Claude**。
2. 原生工具面（chief + product + convener，共 76 次调用）：`read_file`×25、`list_dir`×22、`git_query`×9、`project_state`×5、`dispatch_task`×4（2 次参数校验失败 + 2 次受理）、`contract_check`×3、`doc_format`×2、`project_note`×2、`role_status`×1、`session_tail`×1、`role_activity_log`×1、`submit_version_change`×1。**无 `run_shell`、无写入工具。**
3. `prompt_snapshot`：chief 47,845 B / `d245c3cd1f1a8d9b803b26754390afb16f77875dacdbd4e838bb314dbab1ace8`；product 14,420 B / `7041137d…`；convener 23,839 B / `67f3e0e1…`（原件在 native 转录与 `drive.jsonl`）。

## 9. 限制与未覆盖（如实）

1. **Git 预算停止先于初始 workflow**：Git 9>8，`request_stable_write`/stable-write 卡/初始 workflow 发布/团队计划/run pin/D3/角色卡激活/工作流/实现/游戏均**未发生**；convener 任务 `t-mw9t0913…` 仍在飞（中止），2 个任务未收口。
2. **team plan 风险已知未证**：convener 任务文本已预警 team-v2 引用 roster-v1（最新为 roster-v2）可能导致 `reference-invalid`；本轮未到达该步，**未验证**。
3. **单次运行、不自动重试、不追加**：停止后未重试、未继续；无游戏产物。
4. **trunk manifest 的存放位置**：git 媒体下工作树无 `.ans/trunk/manifest.json`，manifest 由 `refs/ans/trunk`（`100a6621…`）提交携带；本记录以 `git show` 原件绑定（`15253d0b…`）。
5. 本记录只陈述事实与偏差，不判任何验收条目通过/失败；不与其它 RR 记录互相替代；未提交/推送/合并/发布。

## 10. 状态

- **RR20 取证完成（按授权范围）：round8 target 第四次同根清理（sessions 15 文件 / 3,524,131 B 移出、ledger 3,383 B/1 行 → 0 B；8/8 冻结文档、repoId `6ac15756…`、原 init operation `9ba05825…`、候选 `83ca5888…` 原样保留；RR19 残留 run/`s-9fbf9c81…` 保留未复用）；真实 Electron（含修复候选 W1/W2/W5，5 文件聚合 `e99f7cb4…`）+ 真实 UI + 真实模型（deepseek-v4-flash）单次运行；1 条客户消息 → chief 派发 product → **product 4-target 标准 bootstrap VCA（expectedFromSha256:null、op -02）→ 应用 `applied`（vc-87528873023338、targetDigest 30194da5…）→ 首个 effective trunk t1 发布（refs/ans/trunk 100a6621…；9 文件快照 s-4f9b6762…；manifest 30194da5…）** → chief 派发 convener（初始 workflow + 团队计划 + run pin）→ convener 只读核查后被 **Git 预算 9>8** 停止。trunk 已发布、VCA 已 applied；workflow/团队计划/run pin/任命/实现/游戏未发生。原 target 114/114 逐字节未动；9222 零占用、9223 已释放无残留；修复候选/仓库边界稳定；run_shell 0；无伪造。** 未提交/推送/合并/发布；未改仓库产品/测试/角色卡/其它文档；本记录之外只写 `2026-11-10_RR20_snake-full-chain-evidence/` 与仓库外运行根 `…\ans-snake-fullchain-run-2026-11-10\round20\`。

**（完）**
