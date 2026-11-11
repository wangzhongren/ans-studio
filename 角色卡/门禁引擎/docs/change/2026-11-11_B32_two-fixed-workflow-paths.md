# B32 两条固定工作流路径：A11 提交命令引号文本 + 任务级 Git argv 形状拒绝区分（门禁引擎，2026-11-11）

- 角色：ANS 固定 worker「门禁引擎」（roleId: 门禁引擎），独立上下文。
- 任务：T3「两条固定工作流路径」B32.1 + B32.2——RR27 失败修复（A11 worker 未加引号的 `git commit -m` 被 shell 写门拒绝；guard 误报「缺少 taskGitScope」）。
- 依据：RR27 记录 `角色卡/测试/docs/change/2026-11-11_RR27_two-fixed-workflow-paths.md`（A11 两次 `taskGit.scope.ready role=game-core-dev`；两次未加引号提交均因 argv 被拆多 token 而 deny；convener 复述误导文案后以环境阻塞 rejected 收口 A11）；协调方 B32 授权。
- 基线：HEAD `daf8690f99ea81236d1966ab1d7b12fd96f08e2f`（B31 提交；RR27 记录未提交、本批未触碰）。

## 一、RR27 失败事实（根因）

- worker 会话 **taskGitScope 已成功注入**（RR27 diagnostics `taskGit.scope.ready role=game-core-dev` 10:29:03.295（首派）/ 10:31:37.723（重派））。
- 失败命令未给提交消息加引号：`git commit -m feat(game-core): implement game rules state machine in src/game.js` → argv 被拆为 `["git","commit","-m","feat(game-core):","implement","game","rules","state","machine","in","src/game.js"]` → `matchTaskGit` 只接受 `rest.length === 2 && rest[0] === "-m"` 的单消息 token 形态 ⇒ 不命中；重派同样未加引号 ⇒ 再次 deny。
- `shell-write-guard.ts` 对 `git add/commit` 形状不匹配统一返回「任务级 Git 写被硬拒：需应用注入有效 taskGitScope…」——**scope 实际存在、仅 argv 形状不符时误报**；convener 据此把 A11 判成环境阻塞并 rejected。
- convener（stage-request 任务）无 taskGitScope 属设计；convener 不应代 worker 提交（B32.3 由 convener-code 角色处理，不在本角色写区）。

## 二、实施

### 2.1 `src/common/门禁引擎/classify-shell.ts`（M，+6/−0）

- `TASK_GIT_CODES` 新增稳定码 `argvShape: "task-git-argv-shape"`（单一登记表；分类器仍沿用既有细分码 `git-commit-form-forbidden` / `git-task-add-*` / `git-task-path-*` 等，行为不变）。

### 2.2 `src/common/门禁引擎/shell-write-guard.ts`（M，+30/−7）

- `git` 分支在 `matchReadonlyGit`/`matchTaskGit` 放行判定后，对拒绝区分两种事实：
  1. **scope 缺失/非法**（`taskGitScopeError(input.taskGitScope)` 命中）：保持既有文案「任务级 Git 写被硬拒：需应用注入有效 taskGitScope（taskId/workflowId/branch/writeSet）且路径 ⊆ 写集…」与 `shell-write-hard-deny` 码（逐字不变）；
  2. **scope 有效但 argv 形状不匹配**（`argv[1]` 为 `add`/`commit` 且 scope 校验通过、`matchTaskGit` 不命中）：返回 `task-git-argv-shape`，文案点明「`-m` 后必须恰一个带引号的单消息参数，含空格须整体加引号；`git add` 需字面路径且 ⊆ 任务写集，不得 `-A/--all/./glob`」，并明确「taskGitScope 已有效，不是缺少 taskGitScope」。
- 形状判定复用 `matchTaskGit`/`taskGitScopeError`（与 classify-shell 同一实现），未复制第二份规则；机械拒绝经 `makeMechanicalRejection`（owner=convener、retryable=true）生成。
- 既有行为不变：合法 `git add <literal ⊆ writeSet>` / 带引号单 token `git commit -m` 在 scope 有效时 pass；普通 Git 写（push/merge/reset/checkout…）、无 scope/非法 scope、后台入口仍 fail-closed；只读 Git 前台仍 pass。

### 2.3 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（M，+4/−4）

- **A11 段**：实现 worker 提交命令必须写成 `git commit -m "<message>"`——含空格的提交消息必须整体加引号，`-m` 后必须是单个带引号的 argv 参数；未加引号会把消息拆成多 token 而被 shell 写门拒绝（RR27 实测）。
- **Git 普通用法（实现角色）段**：`git commit -m "<msg>"` 引号/单消息参数口径写明；既有 add 字面路径、拒绝面逐字保留。
- **「A10 与 A11 的顺序」段**：A11 stage-request 任务文本必须写明提交命令形态；**返工若仅因提交命令语法（消息未加引号、argv 多 token），只纠正提交语法，不重写实现、不新增实现改动**。
- 既有 hash（应用计算/禁止 shell hash）、shell 禁令、写区绑定、卡预算（3 确认卡 + merge-main）语义逐字保留；legacy `chief-workflow.md` 未改（字节 pin 由测试断言）。

### 2.4 测试（`test/门禁引擎/`，新增 2 文件 / 10 用例）

- `test/门禁引擎/shell-write-guard-task-git-shape.test.ts`（A，5 用例）：带引号单 token commit / 字面 add ⊆ writeSet ⇒ pass；未引号多 token commit（scope 有效）⇒ deny 且 `code=task-git-argv-shape`、文案含「-m 后必须恰一个带引号」且**不得**出现缺 scope 文案/码；无 scope/非法 scope ⇒ 既有文案与 `shell-write-hard-deny` 码；add 越界/非字面/flag/治理写区 ⇒ deny 且不误报缺 scope；普通 Git 写/后台入口仍硬拒。
- `test/门禁引擎/chief-workflow-v2-git-commit-argv.test.ts`（A，5 用例）：A11 段 / A10-A11 顺序段 / Git 普通用法段的引号与单 argv 参数口径、返工只纠正语法且不重写实现、既有 hash/shell/卡预算语义保留、legacy 字节 pin 与模块 pin 不变、v2 版本行/规模/编码有界。
- 未新增 skip/force-exit；未删除/弱化既有安全断言。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b32-01-typecheck.txt`（`9960fe1b…`） |
| 受影响集（门禁目标测试 + chief v2 五个既有测试 + 两个新测试 + task-git-critical-section/shell-rules-b4/git-shell-acl + 编排 shell-task-git-gate/shell-write-guard-injection；15 文件） | **192/192 pass** | `_evidence/b32-02-affected.tap`（`40036423…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b32-03-full-chain.tap`（`63aa782e…`） |
| 全量 `test/门禁引擎/*.test.ts` | **564 pass / 5 fail / 1 skip（570 tests）**；5 条失败名与 B2/B28 冻结 known-red **逐名一致**（diff 空；pass = B31 554 + B32 新增 10） | `_evidence/b32-04-gates-knownred.txt`（`22bde6b8…`） |
| 全量 `test/编排/*.test.ts`（只读交叉运行；本角色未改 `src/common/编排/**`） | **1352 pass / 24 fail / 2 skip（1378 tests）**；24 条与 B17/B28 冻结 known-red **逐名一致**（diff 空） | `_evidence/b32-05-orchestration-knownred.txt`（`5ab40bd5…`） |

- 已知限制披露：受影响集未包含 `test/编排/shell-operator-only.test.ts`（其 P6 集成用例属 24 条冻结 known-red，已在编排全量对照中逐名核对）；不影响本批门禁目标断言。

## 四、候选（门禁引擎）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts` | M | 186,181 / 2,514 | `9f9ec9af425ba8418e6c9c60b48777b11804c5411487568160c8bd095a51bc37` | +6/−0 |
| `src/common/门禁引擎/shell-write-guard.ts` | M | 45,699 / 814 | `d9cc09e633b4822ba00f1ebb9bd719c18d7c9286eea77c1f9785d2d71803fcfb` | +30/−7 |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 28,744 / 134 | `002fe5327d409c8d9434a6600d33682b7b6f679b28db32421e96115fb2b29406` | +4/−4 |
| `test/门禁引擎/shell-write-guard-task-git-shape.test.ts` | A | 7,582 / 129 | `8e00e0d204eafd913931525167f21b1b046468c23ada75aec1aebd213c8382b7` | +129/−0 |
| `test/门禁引擎/chief-workflow-v2-git-commit-argv.test.ts` | A | 6,196 / 96 | `7e771e83d72606a42ad0b11fd04cac7c99bc18ddcfd18137773d939fff907f1e` | +96/−0 |

- 证据文件 SHA-256：`b32-00-baseline-head.txt` `cd83aa46…`、`b32-01-typecheck.txt` `9960fe1b…`、`b32-02-affected.tap` `40036423…`、`b32-03-full-chain.tap` `63aa782e…`、`b32-04-gates-knownred.txt` `22bde6b8…`、`b32-05-orchestration-knownred.txt` `5ab40bd5…`。

## 五、限制与披露

- **文本/守卫级修复**：未改 shell 白名单/写授权/工具面/卡预算；未运行 Electron/真实模型，不声称 RR27 或 B32 真机通过；真实效果待下一轮 RR 行使（A11 带引号提交 → A12b → B31 轻量验收 → A13 → merge-main）。
- **写区纪律**：本角色只改 `src/common/门禁引擎/**`、`test/门禁引擎/**`、`角色卡/门禁引擎/docs/change/**`；未改 `app/desktop/**`、`src/common/编排/**`、`src/provider/**`、`src/pipeline/**`、`src/model/**`、其他角色记录。**无跨写区需求**；B32.3（convener 指引：不得代 worker 提交）由 convener-code 角色处理。
- **共享工作树并行改动（非本角色）**：生成证据时工作树另有 convener-code 角色未提交改动（`src/common/roles/convener/index.ts`、`test/roles/convener/convener-fixed.test.ts`）。本角色未修改、未暂存这些文件；最终提交范围由调度裁定。
- 未 commit、未 push、未合并 main、未打 tag（由调度统一提交）。
