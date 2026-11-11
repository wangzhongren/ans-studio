# RR28 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B32 候选；全链 A1–A13 跑通并合并 main）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR28 = B32 修复后的真机全链复验，预算同 RR27 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `ec66232d26577d85d4b9d4f2c8745c7261b9061a`（B32：要求引号化 `git commit -m "<message>"`；shell-write-guard 区分 `task-git-argv-shape` 与缺失 scope；convener 不代提交；含 B31/B30/B29）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR28 批准（消息 1；卡 ≤4（3 确认 + merge-main；decision ≤2 单独计数）；真实任务 ≤60：chief ≤18、convener ≤18、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤10；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR28 通过（按协调方列出的通过标准逐项满足）——A1–A13 全链完成；贪吃蛇可玩产物与任务分支提交在案；merge-main 客户卡真实呈现并由驱动作答；target main 已合并（merge `152448a`）；账本无 `.ans/trunk`/`.ans/runs`/stable-write；shell 审计无审批卡**。**B32/B31/B29/B30 均获真实行使**：B32 引号提交两次 allow；B31 首次轻量验收（A12b blocked → close accepted + 逐字 note → `docs/acceptance` 归档 staffDecision=note → A12b/A12 收口 → A13 → merge-main）；B29 done 回执；B30 零 `git-config-section-unsupported`。**一处已披露接缝**：A13 面向客户的「运行期未验证」交付说明未作为独立客户消息送达——披露文本仅存在于 A12b close note 与验收归档；merge-main 卡为应用标准文案；驱动在成功信号后 4 秒即 finalize，打断了幕僚正要发送的 A13 说明回合（tester-side 时序 + 应用卡面未携带披露）。最终验收权属独立验收（B2）。**未伪造通过**。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr28-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `ec66232`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR28；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型（native transcript 记录为 **`deepseek-v4-1-flash-261017`**，实际 provider 实跑）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR27–RR1 与两旧贪吃蛇根共 **29/29 true**（所有脚本仅写入 RR28 运行根） |
| 驱动 | RR8 修正版 + decision 卡支持；预算常量：总 60、chief 18、convener 18、实现写 10 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 11:03:29.448 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 11:03:42.493 / 11:04:02.008 | `workflow.started wf-7fcce8656a9bfb7fca73f124` + A1 requested / dispatched | `workflows.jsonl` |
| 11:04:30.224 / 11:05:27.078 | A2 requested / **completed**（B19 唤醒） | `workflows.jsonl` |
| 11:05:50.305–.652 | **A3 意图卡** `req-f498257d379edd49` 客户 confirm；**`stage.completed A3` 立即写入** | `tasks.jsonl` |
| 11:05:56.847 / 11:06:05.985 | A4 requested / dispatched | `workflows.jsonl` |
| 11:06:31.114–11:09:27.940 | A5 requested（两次 delivery-rejected 重派）；**`stage.completed A5`** | `workflows.jsonl` |
| 11:09:44.396–.526 | **A6 方案卡** `req-a5ce57f0ddcd5415`（2 模块/1 实现角色）客户 accept；**`stage.completed A6`** | `tasks.jsonl` |
| 11:10:00.785 / 11:10:08.609 | A7 requested / dispatched | `workflows.jsonl` |
| 11:11:12.988 / 11:11:21.331 | A8 requested / dispatched | `workflows.jsonl` |
| 11:11:41.609–.613 | **B20 生效**：1/1 `role.activated`（game-implementer）；**`stage.completed A8`** | `workflows.jsonl` |
| 11:11:58.616–11:12:37.314 | A9 requested；**`stage.completed A9`**；`basis.recorded bas-68e8bea7efc51c6fa7533f8f`；**B29 回执 done** | `workflows.jsonl`、`basis.jsonl` |
| 11:13:12.321 / 11:13:23.171 | convener A9 报告 **done**（complete_team_plan 真实完成，basisId=bas-68e8…；重复投递幂等 done） | `tasks.jsonl` |
| 11:13:18.036–.176 | **A10 任命卡** `req-ff3c1e8da7cf2bf2`（单角色）客户确认；**`stage.completed A10`** | `tasks.jsonl` |
| 11:13:31.088 / 11:13:45.661 | A12a dispatched / **A11 requested+dispatched** | `workflows.jsonl` |
| 11:14:00.167 | `basis.verified`；**B30：diagnostics 无 `git-config-section-unsupported`（0 次）** | `basis.jsonl`、`diagnostics` |
| **11:14:16.507** | **B32 生效**：`git commit -m "feat(game-entry): implement page entry"`（argv 单消息 token）**allow** | `shell-gate.jsonl` |
| 11:14:39.437 / 11:14:40.906 | A11（首轮）completed / A12a completed | `workflows.jsonl` |
| 11:15:16.082 | A11 第二轮 requested+dispatched（剩余 game-core 模块） | `workflows.jsonl` |
| **11:16:46.863** | **B32 生效**：`git commit -m "feat(game-core): implement core game loop, input, scoring, collision and rendering"` **allow** | `shell-gate.jsonl` |
| 11:17:11.398 / 11:17:37.026 | A11 第二轮 completed / A12b dispatched | `workflows.jsonl` |
| 11:19:41.460 | verifier **A12b 报告 blocked**（`docs/quality/snake-game-report-v1.md`；运行期未验证，AC-1…AC-9 逐条） | `tasks.jsonl` |
| **11:19:58.305** | **B31 生效**：A12b 任务 close **accepted** + note 逐字「acceptanceIntensity=lightweight；运行期未验证（静态证据接受）…」；**`stage.completed A12b` + `stage.completed A12`（聚合）**；`docs/acceptance/snake-game-acceptance-v1.md` 归档（staffDecision=note） | `tasks.jsonl`、`workflows.jsonl`、`docs/acceptance/` |
| 11:19:58.499–.956 | **merge-main 卡** `merge-main-rel-732116e1e4503199e40718d1`（应用呈卡）客户 approve（驱动作答）；A13 requested | `tasks.jsonl`、`drive.jsonl`、`releases.jsonl` |
| 11:19:59.113–.449 | `release.confirmed`（by customer）→ **`release.merged`**：base `2b9ef04`、tip `5428a28`、**mergeOid `152448a5f63ca88bfba12ea274fddfd08b1baa85`**；files: index.html/src/game.js/src/styles.css | `releases.jsonl` |
| 11:19:59.452 | **`stage.completed A13` + `workflow.closed outcome:"delivered"`** | `workflows.jsonl` |
| **11:19:59.452** | 驱动 `success:release-merged-and-delivered`（4 秒后 finalize；幕僚 A13 说明回合 11:20:04.337 开始、11:20:05.307 被 finalize 打断——见披露） | `drive.jsonl`、`final-report.json`、chief replay |
| 11:20:0x | 证据落盘；Electron 关闭 | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **4**（intent-confirm / proposal / appointment / merge-main；均客户/驱动作答；decision 0；≤4）；真实任务 **21**（chief 12、convener 9；按接收：convener 10、product 2、rapporteur 3、nominator 2、verifier 2、game-implementer 2）；实现写任务 2；**Git 提交 3 + release merge 1**（≤12）；总墙钟约 **16.5 分钟**（11:03:29–11:19:59；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | **A1–A13 全部完成**（B32/B31/B29/B30/B24/B23/B20 生效）；target 含 index.html、src/game.js、src/styles.css；任务分支含实现提交 `9ecc566`、`5428a28`；merge 后 main `152448a`；**一处披露接缝：A13 客户交付说明未单独送达（见披露）** | **pass（列举标准满足；接缝已披露）** |
| **RR-03** 发布合并 | merge-main 客户卡（`merge-main-rel-732116e1e4503199e40718d1`）真实呈现、customer approve；`release.confirmed` + `release.merged`（mergeOid `152448a`）；`workflow.closed delivered`；target main 已合并；无 push/tag/发布产物 | **pass** |
| **RR-04** 账本/审计检查 | `workflows.jsonl` A1–A13 completed + closed delivered；`basis` recorded+verified；`releases.jsonl` requested/confirmed/merged；`docs/acceptance/snake-game-acceptance-v1.md` 在案；**无 `.ans/trunk`/`.ans/runs`/stable-write**；shell 审计 20 行（引号提交 allow；无审批卡）；客户卡 4（≤4） | **pass** |
| **RR-05** 失败即停 | 全程无失败；成功信号后 finalize；证据完整 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 4（≤4；decision 0≤2）；真实任务 21（≤60；chief 12≤18、convener 9≤18；product 2≤3、rapporteur 3≤4、nominator 2≤4、verifier 2≤4；实现写 2≤10）；Git 提交 3（+merge 1）≤12；墙钟约 16.5 分钟（≤90） | **within budget** |

**结论**：按协调方列出的通过标准，RR-28 判定为**通过**；最终验收权属独立验收（B2）。披露接缝见第六节。

---

## 四、B32/B31/B29/B30 行使取证（只读；未改任何代码）

1. **B32（真实行使，生效）**：
   - `git commit -m "feat(game-entry): implement page entry"`（11:14:16.507，argv `["git","commit","-m","feat(game-entry): implement page entry"]`）→ **allow**（`ruleset:allow:task-git:commit`）。
   - `git commit -m "feat(game-core): implement core game loop, input, scoring, collision and rendering"`（11:16:46.863，argv 单消息 token）→ **allow**。
   - 提交落地：`9ecc566`（game-entry）、`5428a28`（game-core）；convener 未代提交。
2. **B31（首次真实行使，生效）**：verifier 的 A12b 报告以 **blocked** 交回（`docs/quality/snake-game-report-v1.md`，运行期未验证）；幕僚当回合轻量验收——任务 `t-mwc0yoho-0cb40d29` **close accepted**（11:19:58.305），note 逐字含 **「acceptanceIntensity=lightweight；运行期未验证（静态证据接受）。…」**；应用归档 `docs/acceptance/snake-game-acceptance-v1.md`（**staffDecision=note**，含同一披露）；`stage.completed A12b` + `stage.completed A12`（聚合）= 11:19:58.305；A13 经发布卡完成。
3. **B29（回归，生效）**：convener A9 任务 `t-mwc0rfdk-e15e606a` **done**（11:13:12.321；重复投递 11:13:23.171 幂等 done），complete_team_plan 真实完成（basisId `bas-68e8bea7efc51c6fa7533f8f`）；无「结果未知或回执不完整」。
4. **B30（回归，生效）**：diagnostics 中 **`git-config-section-unsupported` 出现 0 次**；只读 git 正常。
5. 其他：B24（A3 立即收口）、B23/B20/B19/B18/B28/B26/B27 均正常；三确认卡 + merge-main 卡顺序清晰；decision 0；shell 审计无审批卡；无 legacy/stable。

**披露接缝（A13 客户交付说明）**：B31 的 note 与验收归档均要求「运行期未验证须在 A13 交付说明中向客户披露」，但**该客户交付说明未作为独立消息实际送达**——merge-main 卡为应用标准文案（仅说明本地合并、不 push/不 tag/不发布），不含运行期未验证披露；幕僚在 11:20:04.337 开始的 A13 说明回合被驱动 11:20:05.307 的 finalize/halt 打断（chief replay 记录 `[Request interrupted by user]`）。**原因**：驱动在 `release.merged + workflow.closed delivered` 成功信号后 4 秒即 finalize（tester-side 时序），且应用卡面未携带验收披露（app 侧接缝）。**建议**：驱动在成功信号后等待幕僚 A13 交付说明（或定义其完成标记）再停止；应用将 acceptance note 披露带入 merge-main 卡或 workflow close 摘要。**本角色如实判定：列举的通过标准全部满足；该接缝已披露，不据此伪造“客户已获运行期未验证说明”。**

---

## 五、预算实际 vs 批准（RR28）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main；decision ≤2） | **4**（intent-confirm / proposal / appointment / merge-main；decision 0） |
| 真实任务 | ≤60（chief ≤18、convener ≤18、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤10） | **21**（chief 12、convener 9；接收：convener 10、product 2、rapporteur 3、nominator 2、verifier 2、game-implementer 2；实现写 2） |
| Git add/commit | ≤12 | **3 提交 + 1 release merge**（`9ecc566`、`5428a28`、`152448a`（merge）；基线 `2b9ef04`） |
| 墙钟 | ≤90 分钟 | 约 **16.5 分钟** |
| 模型轮次 | 单独如实报告 | settled：chief **37**（35 completed/2 aborted）· convener **26** · game-implementer **2** · nominator **4** · product **4** · rapporteur **4** · verifier **4**（3/1 aborted）；native transcript：chief 176 msgs / in **230,791** / out **68,567** / cache read **12,289,792**；convener 197 / **265,107** / **96,273** / **13,757,184**；game-implementer 33 / **86,369** / **53,297** / **577,920**；nominator 51 / **149,776** / **29,861** / **1,642,368**；rapporteur 50 / **132,436** / **48,759** / **1,548,416**；verifier 56 / **230,210** / **88,827** / **2,062,976**；product 22 / **50,198** / **8,021** / **293,248**；模型 `deepseek-v4-1-flash-261017` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 62 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（success:release-merged-and-delivered） | `c1cc428a4032b761d5ab1000915d8917c89eaff239633b79ab9bf7130f88a90f` |
| `budget.json` | `77a74bc25f86dd4a4967cefcd4cdb71062be7ffd0833f81d871d4d51d1c59de4` |
| `drive.jsonl` | `6d5b30e4e27de0891035b33fa1cf5c366ccd510a40afb911d4d5a4504049786c` |
| `tasks.jsonl`（21 任务；A12b close note 全文） | `7be5b72ebf7bce3e12cd29a1dc4cc268087747c51fc4ca18d6cde2e551d2cbd4` |
| `workflows.jsonl`（A1–A13 + closed delivered） | `a79721679a11acd14470e4b5b017b44cc2111e40c8c33b568784219b9c8261b0` |
| `releases.jsonl`（requested/confirmed/merged） | `73a84854b7080acf9c28ddae946664deebb0dca9163612eb2052df8f2f3ad73a` |
| `rr28-facts.json` | `80d366fe663d38f31661509ad719fdf6b9f6493c8a4535d84b78886420eac342` |
| `root-cause-code-pointers.txt` | `e1782ff4a1fe4fc868038085bb4fc810c71feb3c54ac920dda3a6c8169d7ca0e` |
| `zero-touch.json`（29 旧根全 true） | `21af06257551f98d3b3c95f50b580315edd491389b944cc12c3d7cf47d5bc367` |
| `usage-extract.json` | `1a5197cb51ac6dded7f641f209a8c50afabb592756c020df36b6e32bbdeb7fdd` |
| `shell-gate.jsonl`（20 行；引号提交 allow，无审批卡） | `7a79b48f9a4ce74947ebefd2953f3f6a2365647d8fc656eef6f1c901e7cfb540` |
| `snake-game-criteria-v1.md`（A12a） | `b2a2d29976b5c7a111ef1b79aefa499e8cdbdb15e025ecb008813d0d300fde47` |
| `snake-game-report-v1.md`（A12b，blocked） | `deb88ab270d0a31e062a708268167467ed6d8d39be18451b830de1bcedf9e50e` |
| `snake-game-acceptance-v1.md`（B31 归档，staffDecision=note） | `82186182896b34de0bb009593ed799a359fe6cc5951b812d4c75fd94b12ba3b5` |
| `index-html.html` / `src-game.js` / `src-styles.css`（交付产物） | `c498a5e6…` / `407e54d5…` / `aaa23cf3…` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-game-implementer-transcript.jsonl` / `native-verifier-transcript.jsonl` | `3da3b35a…` / `8c98d11f…` / `4e3a8990…` / `33cfe45f…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr28-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：① A13 客户交付说明未单独送达（见第四节披露接缝；tester-side 早停 + 应用卡面 seam；不据此伪造客户已获披露）；② 驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘；③ chief 2 个、verifier 1 个 settled 为 `aborted`（成功 finalize 打断末回合）；④ 本轮无人工介入；无 tester-side 旧根触碰（29/29 零触碰）。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物（target main 仅为应用 merge-main 通道本地合并）。
- 未占用 9222/9223；未读取/打印 `.env`；未追加客户消息、未绕过任何门；本轮所有脚本仅写入 RR28 运行根。
- **RR28 按列举通过标准判定通过；A13 客户交付说明接缝已如实披露，不伪造客户已获运行期未验证说明；最终验收权属独立验收（B2）。**
