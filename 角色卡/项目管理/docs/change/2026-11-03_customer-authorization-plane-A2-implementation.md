---
id: customer-authorization-plane-a2-implementation
type: change
title: 客户授权平面 A2 实施记录：共享 JSONL 辅助（jsonl-ledger）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related: [customer-authorization-plane]
events:
  - date: "2026-11-03"
    kind: created
    summary: 按 P1 提案 Revision 2 与审核 recommend approval 实施 src/common/shared/jsonl-ledger.ts 与 16 例单测；登记 shared-components 组件 10；采集测试/typecheck/哈希证据
---

# 客户授权平面 A2 实施记录：共享 JSONL 辅助（`jsonl-ledger`）

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：项目管理（固定角色；本上下文只承担该角色，不切换）/ 团队计划 §5.1 **A2（共享 JSONL 辅助）**。
- **状态**：**`implemented-unverified`**。实施完成、证据已采集；**未验收、未 commit/push**，不替代 D1/D2/E2。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；本节点开工时 `git status --porcelain -- src app test` **为空**（实测）。实施期间运行时核心（A1）在同一 worktree 并发写入未提交的 `src/model/**`、`test/runtime-core/directive-*.test.ts`；不影响 A2 写集判定，但使全仓 typecheck 出现 A1 加法类型的下游消费方错误（见 §五）。
- **输入版本 [事实]**：P1 提案 Revision 2 **215 行 / `bc630843673d1b8fd7c77e07a85874e8b86e8abd9c471eb2b40881aab637cff1`**；P1 审核记录 **397 行 / `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`**（`recommend approval`）；团队计划 **664 行 / `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8`**（v1 653/`37e6bd0d…` + §十三）；方案 P1.1 **1199 行 / `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`**（冲突以此为准）；盘上 P1.2 **1209 行 / `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`**（编辑性等价）；V1 **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`**；B0 **239 行 / `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441`**。

## 一、实施内容

| 路径 | 新/改 | 行数 | 字节 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `src/common/shared/jsonl-ledger.ts` | **新** | **229** | 9,010 | `223d32c6e46bac41200406546e33e86767ac0d82` | `c9fd3066f1985c1b8ae850ab9b67845dcf320e7f38779de4121687cdcdd62e5f` |
| `test/项目管理/shared/jsonl-ledger.test.ts` | **新** | **343** | 14,361 | `f879ebb5944bc255295c263b30c8479c39a6c63b` | `3aa6154db2cd353b4ad924803113d3861cfb01fcba77acbd8050dc02972bbb8e` |
| `角色卡/项目管理/docs/architecture/shared-components.md` | 改（登记组件 10 + 变更条目） | **216** | 49,025 | `2d460d5031d000d9cebb75bc8aeb64c80f99d741` | `dd33fdf7805e1ca08c60cf62b804b4f20b6dd7d5c9d4632431706bbaeeca6339` |

- **导出（A2 冻结）**：`appendJsonlLine(file, jsonText, limits?)`、`readJsonlLedger(file, parse, limits?)`、`jsonlSegmentFiles(file, rotations?)`；常量 `DEFAULT_JSONL_MAX_BYTES = 5 * 1024 * 1024`、`DEFAULT_JSONL_ROTATIONS = 3`；类型 `JsonlLedgerLimits` / `JsonlAppendResult` / `JsonlParseResult<T>` / `JsonlReadError` / `JsonlReadResult<T>`。
- **纯 Node**：仅 `node:fs`（`promises`）与 `node:path`；不依赖 Model/运行层/诊断，不读 env，不硬编码 `.ans` 路径；文件抬头明示**渲染侧不得导入**。
- **追加**：先 `mkdir(dirname,{recursive:true})`；「当前大小 + 本次行字节数 > `maxBytes`」在追加前轮转；`appendFile` UTF-8 `flag:"a"`；按**绝对路径**（`path.resolve`）维护进程内串行 Promise 链（同文件不交错、不同账本互不阻塞、链尾清理）；失败**不抛**，返回 `{ok:false,message,code?,cause?}`；`jsonText` 含裸 `\r`/`\n` ⇒ `{ok:false,code:"multiline"}`。
- **轮转**：`.N` 最旧、`.1` 最新；`i=N..1` 依次 `rename`——`i=1` 当前→`.1`，`i>1` `.i-1`→`.i`；`ENOENT` 容忍；`unlink(file.N+1)` 仅作越界份防御性清理（`ENOENT` 容忍）。
- **读取**：`.N`→…→`.1`→当前（旧→新）；跳过空行（含 CRLF 空行）；坏 JSON / parser 拒绝 ⇒ `errors` + `badLines++`；parser 返回 `ignore` ⇒ `ignoredLines++`；文件级读失败（非 ENOENT）⇒ `errors`（`line=0`）后继续；`ENOENT` 跳过；`files` 为参与读取的段名（basename；当前文件恒在列，轮转段仅存在者入列）。
- **路径与 limits 参数化**：helper 只接受调用方传入的 `file`（内部 `path.resolve` 归一）；`maxBytes`/`rotations` 由调用方传参，非法/缺失回退默认；env 解析与 `.ans` 相对路径常量留在消费方。
- **与 `task-state.ts` 等价点**（P1 提案 §1.2；A2 **不修改** `src/common/编排/task-state.ts`，迁移属 B1）：① 路径/API 由 `task-state.ts` 计算并传入；② 默认 5 MiB/3 份与 env 解析留在 `task-state.ts::limits()`；③ 轮转时机/顺序与 `task-state.ts:233-258` 一致（`.N` 最旧、`.1` 最新、越界份清理）；④ 递归建目录 + `appendFile` UTF-8 `flag:"a"`；⑤ 同一路径单链、`previous.then`、链尾清理、失败不抛；`tasks.append.failed` 仍由 `task-state.ts` 记诊断（helper 不导入诊断）；⑥ 旧→新读取、空行跳过、坏行 basename+1 起行号、文件级失败 `line=0`、当前文件恒入 `files`；⑦ 重放/`validateEvent` 仍由 `task-state.ts` 执行；⑧ 读取不建目录/文件、不写诊断；`tasks.read.partial` 仍由 `task-state.ts` 记录，`TASKS_STATE_REL`/默认常量/env 名不变。

## 二、验证与原始结果

| # | 命令 | 结果 | 原始日志 |
| --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/项目管理/shared/jsonl-ledger.test.ts"` | **16 tests / 16 pass / 0 fail / 0 skipped / 0 todo，exit 0**（2026-11-03T14:53:43+0800，253.6046 ms） | `02-tests-jsonl-ledger.log` |
| 2 | `node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"` | **11 文件 / 175 tests / 170 pass / 0 fail / 5 skipped / 0 todo，exit 0**（7,898.8658 ms）；对照 B0 基线 10 文件 / 158 tests / 153 pass / 0 fail / 5 skip：新增本文件 16 例 + i18n 契约 1 例（A3 同节点），**新增确定性失败 0、新增 skip 0** | `03-tests-project-shared-group.log` |
| 3 | `npx tsc --noEmit --ignoreConfig <项目 compilerOptions> src/common/shared/jsonl-ledger.ts src/common/shared/i18n/index.ts test/项目管理/shared/jsonl-ledger.test.ts test/项目管理/shared/i18n.test.ts` | **exit 0**（A2/A3 写集范围内 0 类型错误） | `05-typecheck-scoped-a2a3.log` |
| 4 | `npm run typecheck`（全仓） | **exit 1**：`src/common/编排/version-decision.ts(435,7): error TS2322: Type '"customer" \| "directive" \| "judge"' is not assignable to type '"customer" \| "judge"'`。该文件**不在 A2/A3 写集**，错误由运行时核心（A1）并发未提交的 `src/model/runtime.ts` 加法（`RequestResolvedEvent.by` 增 `"directive"`）触发，须由编排（B1）在消费方（`version-decision.ts`）同变更更新；A2/A3 文件零错误（见 #3） | `04-typecheck-full.log` |

- 单测覆盖：追加（递归建目录/单行精确/多行保序）、并发串行（32 路全部落盘、无交错/丢失）、轮转边界（恰好等于上限不轮转、跨阈值轮转）、轮转命名（当前→`.1`、`.1` 最新、`.N` 最旧）、越界份 `.N+1` 清理、`rotations=1`、旧→新读取与 `files` 语义、坏行/parser 拒绝/`ignore`/文件级失败 `line=0`/basename+行号、路径参数化（两账本独立串行/轮转）、limits 参数化、`multiline` 防御、追加失败不抛、段文件清单、20 路并发+轮转保留份数内有序。
- **环境**：Node `v24.22.1`；npm `11.19.1`；Windows 11 Pro 10.0.26300（MINGW64/Git Bash）；worktree `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane`；时区 Asia/Shanghai。

## 三、写集与候选核对

- 本节点实际写入（产品/测试/架构）：`src/common/shared/jsonl-ledger.ts`（新）、`test/项目管理/shared/jsonl-ledger.test.ts`（新）、`角色卡/项目管理/docs/architecture/shared-components.md`（登记）；另有本记录与 `2026-11-03_customer-authorization-plane-A2-evidence/`。**未写** `app/**`、`src/model/**`、`src/common/编排/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、其他 `test/` 目录、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication`。
- `git diff --cached --name-only`：**空**（无暂存、未 commit/push）。
- `git status --short` 与 `git diff --name-only` 含其他角色的既有/并发改动（A1 的 `src/model/**`、`test/runtime-core/**`、角色卡边界/变更记录、治理文档）；本节点的候选仅上表三文件（见 `06-git-diff-name-only.txt`、`07-git-status-short.txt`）。
- 写前（HEAD 内容）哈希：`shared-components.md` `git hash-object` `5e29b161b894da485dbb445db190b5eb1b3427eb` / SHA-256 `883081a87274941dccc027f551e115d1a9e2e827ff411f51c58b6015be74466f`；两个新文件在 HEAD **不存在**（ABSENT）。写后哈希见 §一。

## 四、冻结声明（A2）

- **冻结对象**：`src/common/shared/jsonl-ledger.ts` 的导出集合与行为契约——追加一行、按大小轮转（`.N` 最旧/`.1` 最新、越界份清理）、旧→新读取、坏行与忽略行计数、按绝对路径串行、`maxBytes`/`rotations` 参数化、`multiline` 防御、失败不抛的结构化结果。
- **消费规则**：B1（`task-state.ts` 迁移 + directive Provider）、C1/C2 只读消费本契约；`task-state.ts` 迁移由 B1 在同一变更完成并执行 `test/编排/` 等价回归；A2 本身**不修改** `task-state.ts`。任何共享行为变更须回到项目管理、重跑 A2 证据并通知消费方重测；不得复制第二份轮转/原子追加实现。
- **等价口径**：以本记录 §一「与 task-state 等价点」与 P1 提案 §1.2 为准。

## 五、披露与停止项

1. **[事实] 并发写入**：实施期间运行时核心（A1）在同一 worktree 写入未提交的 `src/model/runtime.ts`、`src/model/project-state.ts`、`src/model/directive*.ts`、`test/runtime-core/directive-*.test.ts`。本节点未触碰这些路径；全仓 `npm run typecheck` 因 A1 加法类型的下游消费方（`src/common/编排/version-decision.ts`，B1 写集）而 exit 1。A2/A3 写集范围 typecheck exit 0；该红项**不是** A2 新增确定性失败。
2. **新增确定性失败 0、新增 skip 0**；本组 5 项 skip 为既有 Windows 平台项（`atomic-write` D3 finalMode），与 B0 一致。
3. **无停止项**：不需要新增文件/依赖/写集；未改断言以保绿；未启用 O1–O11；未 commit/push。

## 六、证据清单

目录：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A2-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment-and-baseline.txt` | 20 | `d81d74535e911acf2245dbe87f951c23d286ea42db40402998a1779dc2d17f7b` |
| `02-tests-jsonl-ledger.log` | 29 | `c3a6fa89e5b52f2525b951de90de3e6b28036d62c83edded517c31add0efde9b` |
| `03-tests-project-shared-group.log` | 191 | `72beafe84e6a90390bc9cc89c6dae09df6ef28881eccaad2e4502fc5ac326a20` |
| `04-typecheck-full.log` | 11 | `8637d0a87e8b1c3b63f936615445ca783102c754c4483f53542ba60f6df9635a` |
| `05-typecheck-scoped-a2a3.log` | 5 | `8d6da15f97893f1d48fb29f572c2fd90751536189c48ae11485c8d8a72bcf7e7` |
| `06-git-diff-name-only.txt` | 19 | `f5f308cee419f6ebada81153a974582c42b59b5b88af0af86671a2aa52e1a030` |
| `07-git-status-short.txt` | 39 | `6e71e7007b656f4ffdf0a9b8fe8edcbe81f5eea5a25c2f78c2db78af3b0b7c88` |
| `08-after-hashes.txt` | 7 | `d75bda7f223060719f18278325ed7076399337ed617d6d196cf30b9e59e89366` |
| `09-failure-classification.txt` | 4 | `c6317c8f3fb697a619517cda6408726d68b90703a9ccf01ff47bbb61f78045a0` |
| `run-a2-evidence.sh` | 97 | `30222a439ab85f30be5dcc545153d95e4a75c84c8342e54ead513ee3f381d381` |

**本文件状态：`implemented-unverified`；未验收、未 commit/push。**
