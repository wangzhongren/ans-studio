# convener-code B32.3 记录：A11/B3 提交语法（`git commit -m "<message>"` 引号单参数；返工只纠语法；不得代 worker 提交）（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「convener-code」（roleId: convener-code；独立固定上下文；B32.3 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B32.3**（RR27 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`daf8690f99ea81236d1966ab1d7b12fd96f08e2f`
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未 commit / 未 push / 未合 main / 未打 tag**；
  未运行 Electron、未占用 9224。

## 一、事实（RR27 接缝）

依据：`角色卡/测试/docs/change/2026-11-11_RR27_two-fixed-workflow-paths.md`（RR27 未通过记录）。

1. A11 worker（game-core-dev）两次以**未加引号的** `git commit -m feat(game-core): implement …`
   提交，argv 被解析为 `["git","commit","-m","feat(game-core):","implement",…]`——`-m` 后多 token，
   不满足 `matchTaskGit` 的单消息形态（`rest.length===2 && rest[0]==="-m"`），被 shell 写门 deny、未执行。
   **worker 会话 taskGitScope 实际已注入**（`taskGit.scope.ready` 于两次派发均出现），失败在 argv 形状。
2. convener 随后以**带引号单参数**代 worker 提交（10:32:28.731），仍被拒——convener 为 stage-request
   会话，按设计无实现任务 taskGitScope；**convener 不应代 worker 执行提交**。
3. 期望（本批修复方向）：convener 的 A11 实现/返工任务文本明确 `git commit -m "<message>"` 引号规则
   （含空格必须整体加引号、`-m` 后必须是单个带引号的单消息参数）；返工只纠正提交语法、不重写实现；
   worker 提交失败时按真实回执（code/argv 形状）rework/re-dispatch，并在任务文本复述正确提交语法；
   运营不得自己运行 `git commit`/`git add`。

## 二、实施（`src/common/roles/convener/index.ts`，M）

1. `convener-fixed-production-line` 段新增一条（第 7 条 bullet）：

   > - A11/B3 实现与返工任务文本的提交语法（RR27 实测）：worker 提交只写 `git add <paths>` 与
   >   `git commit -m "<message>"`——**含空格的提交消息必须整体加引号**，`-m` 后必须恰一个带引号的
   >   单消息参数（未加引号会被拆成多 argv 并被 shell 写门拒绝；RR27 实测
   >   `git commit -m feat(game-core): implement …` ⇒ `["git","commit","-m","feat(game-core):","implement",…]`）；
   >   返工任务只纠正提交语法（复述正确的 `git commit -m "<message>"` 写法），**不得重写已完成的实现**；
   >   **你不得代 worker 执行 `git commit`/`git add`（不得代提交）**——convener 为 stage-request 会话，
   >   按设计无实现任务 taskGitScope，代提交必被拒（RR27 实测）；worker 提交被拒时按真实回执
   >   （code 与 argv 形状）rework/re-dispatch，并在任务文本复述正确提交语法，不得把「缺少 taskGitScope」
   >   当唯一解释。

2. 模块头注释新增 B32.3 说明（只读注释，非运行数据）。

legacy 三段、fixed 其它段、`card.text` 逐字未改；fixed-only 文案只存在于
`context({matrix:"two-fixed-paths/v1"})` 的生产线段。

## 三、测试（`test/roles/convener/convener-fixed.test.ts`，M）

新增 1 个用例（文件 15 → **16 tests**）：

`B32 fixed A11/B3 提交语法：git commit -m "<message>" 整体引号单参数；返工只纠语法；不得代 worker 提交`

断言：

- 生产线段含引号化模板 `git commit -m "<message>"`、「含空格的提交消息必须整体加引号」、
  「`-m` 后必须恰一个带引号的单消息参数」、「未加引号会被拆成多 argv」「shell 写门拒绝」「RR27 实测」，
  以及 RR27 的 argv 拆分形状 token；
- 返工只纠正提交语法（「返工任务只纠正提交语法」「不得重写已完成的实现」）、按真实回执
  （「按真实回执（code 与 argv 形状）rework/re-dispatch」）并在任务文本复述语法、不得把
  「缺少 taskGitScope」当唯一解释；
- 代提交禁令（「不得代 worker 执行」「不得代提交」、stage-request 无实现任务 taskGitScope）；
- **legacy 隔离**：legacy context 文本与 `card.text` 均不得含 `git commit -m`、代提交/返工语法等
  fixed-only token（既有 legacy 逐字冻结断言不回归；`convener-differential.test.ts` 冻结金样同批通过）；
- 纯函数：同输入同引用。

既有 B9.1/B13.2/B14/B23/B27/B28 用例与 legacy 隔离断言全部保持通过。

## 四、验证（D1）

| 范围 | 结果 | 证据（`角色卡/convener-code/docs/change/2026-11-11_B32_two-fixed-workflow-paths_evidence/`） |
| --- | --- | --- |
| 基线/环境 | HEAD `daf8690`、branch `feat/two-fixed-workflow-paths`、node v24.22.1；写区 tracked 改动仅本记录 2 文件 | `b32-00-baseline-head.txt` |
| `npm run typecheck` | **exit 0** | `b32-01-typecheck.txt` |
| 目标套件 `test/roles/convener/convener-fixed.test.ts` | **16/16 pass**（0 fail / 0 skip） | `b32-02b-convener-fixed-only.tap` |
| 受影响集（11 文件：convener fixed/differential/module、chief fixed、门禁 fixed surface/matrix、run-role fixed b2/b121/b31、桌面 b51/b61） | **121/121 pass**（0 fail / 0 skip / 0 cancelled） | `b32-02-affected.tap` |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `b32-03-full-chain.tap` |
| 全量 `test/编排/*.test.ts` | **1378 tests / 1352 pass / 24 fail / 2 skip**；24 条与 B17 冻结 known-red **逐名一致**（排序后失败名集合与冻结文件逐字节相同，SHA-256 `f9513fb0…`；`diff -u` **exit 0、0 字节**） | `b32-04-orchestration-knownred.txt`、`b32-04-orchestration-suite.tap`、`b32-04-orchestration-knownred-diff.txt`（空） |

- known-red 对照口径：失败名集合（排序后 diff）；TAP 输出顺序随套件执行顺序变化、不具语义。
  本次 24 条失败名排序副本与 B31 冻结文件 **SHA-256 相同**（`f9513fb0e9578a260fe20ee3643d1980d5135f4c24b479fbd3b3bdd279547804`），
  added 0 / removed 0；2 skip 未变。与 B31 全量结果（1378/1352/24/2）完全一致，本批未触碰
  `src/common/编排/**`。

## 五、候选（convener-code）

| 文件 | 状态 | 字节 / 行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | 49,991 / 833 | `1a5174572cd6e34fe92c95c56274da7411199cbbf92c1c6f202df2a41acd8451` | +7/−0 |
| `test/roles/convener/convener-fixed.test.ts` | M | 24,164 / 437 | `a4078d63fc15a78e9d68aa57cf1506fb6932e7331c1886c2b5537dce06f8bcbd` | +55/−0 |

证据文件 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `b32-00-baseline-head.txt` | `71cec2ca9ce8e60df1522d773663ee55078b48cd999524abdb617bd10592d2a9` |
| `b32-01-typecheck.txt` | `9628199fd6f55b0e5c504629582c4c5c44c30125d93228bb14dd0d7a16c0c0d9` |
| `b32-02-affected.tap` | `31e5617fdae1e0bbc7ef8285426b78abf7837fdbb520e1c8373766c0d5828c9f` |
| `b32-02b-convener-fixed-only.tap` | `5a3f31b5062de93c9cea5ecff6a1a37d1d8d990ede9bd6a811f1d1578333b783` |
| `b32-03-full-chain.tap` | `9b11478fb13aa84be36920e1e814d7414ba9c836bbf2d43526dc0b554621eabe` |
| `b32-04-orchestration-knownred.txt` | `274f3bb82ad86da957bbcfe70ba4a069a611d43025dfdfbfd7e17e8694bd4073` |
| `b32-04-orchestration-suite.tap` | `c50fbe79295429fc1696c36da1114b3e82229d6786f960c586218118fae73149` |
| `b32-04-orchestration-knownred-failnames.txt` | `168827d4aa00207aae87feaa94eb8ac8156c2507106cd74a63900cead143dab1` |
| `b32-04-orchestration-knownred-failnames.sorted.txt` | `f9513fb0e9578a260fe20ee3643d1980d5135f4c24b479fbd3b3bdd279547804` |
| `b32-04-orchestration-knownred-baseline.sorted.txt` | `f9513fb0e9578a260fe20ee3643d1980d5135f4c24b479fbd3b3bdd279547804` |
| `b32-04-orchestration-knownred-diff.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`（0 字节） |

本记录文件不自嵌自身 SHA-256（由调度提交后按提交物计算）。

## 六、限制与披露

- 只改 fixed 静态文本与对应测试；**未运行真实模型/Electron**，不声称 RR28/B2 端到端通过；真实效果待下一轮 RR 行使。
- 未修改 `src/common/门禁引擎/**`（shell 写门 argv 形状错误码/文案属其他角色 B32.1 写区，本批未触碰）、
  `app/desktop/**`、`src/common/编排/**`、`src/provider/**`、`src/model/**` 及其他角色记录。
- **无跨写区需求**：convener 侧只需固定任务文本口径即可消除 RR27 的代提交/未引号提交重演；门禁侧
  可区分错误码（RR27 根因②）不属于本角色写区，也不阻塞本批完成。
- 工作树为混合状态：`src/common/门禁引擎/classify-shell.ts`、`shell-write-guard.ts`、
  `workflows/chief/chief-workflow-v2.md` 及对应 `test/门禁引擎/*` 为并行角色（B32.1）改动，
  本角色**未触碰/未还原**；本记录的 typecheck / 受影响集 / 全链 / 编排全量均为这些并行改动存在时
  的实测快照（typecheck exit 0、受影响集 121/121、全链 3/3、编排 known-red 集合与 B31 基线逐名一致）。
- 未 commit（由调度统一提交）；未 push、未合 main、未打 tag。
