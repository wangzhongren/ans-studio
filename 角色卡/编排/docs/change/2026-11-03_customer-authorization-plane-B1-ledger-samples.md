---
id: customer-authorization-plane-b1-ledger-samples
type: change
title: 客户授权平面 E2 补证：AC-6 原始账本样例（created/consumed/revoked/expired + 坏行/轮转）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: evidence-supplement
related:
  - 角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-implementation.md
  - 角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-evidence/10-freeze-statement.txt
  - docs/acceptance/customer-authorization-plane-report-v1.md
  - docs/acceptance/customer-authorization-plane-criteria-v1.md
events:
  - date: "2026-11-03"
    kind: evidence-supplement
    summary: 用真实 B1 Provider/Service/Pipeline 生成 created/consumed/revoked/expired 全类账本样例与坏行/轮转样例（.2 最旧、.1 最新），真实读取器回放 22/22 检查通过；候选 54/54 前后一致（0/0/0）；未改 src/app/test、未 commit/push
---

# 客户授权平面 E2 补证：AC-6 原始账本样例

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：编排（固定角色，本上下文只承担该角色）/ E2 补证 —— AC-6 原始账本样例。
- **状态**：**`evidence-supplement`**。只补证据，不是验收结论；不改变 V1 标准，不改变 E2 对 pass 项的结论。**未 commit/push**。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；候选写集 `src app test` 为 **54 文件**，与 D2 冻结清单 `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt`（134 行 / `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`）逐文件一致；前后各验证一次，均为 **54/54，unexpected 0 / missing 0 / mismatch 0**。
- **触发**：E2 报告（237 行 / `b19a926c29bf474fd00c52744b6e6f629bf3d7a4267a82087bd69d7afea8690e`）AC-6 判定 `insufficient evidence`，缺口为「缺 V1 要求的 created/consumed/revoked/expired 全类 + 坏行/轮转原始样例文件」；D2 账本 9 行仅含 created/revoked。

## 1. 输入与版本（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| 编排角色卡 | 30 | `0c40e330cd99b77b9b2aa520cfdb6ac0529dc51e2a36d99a3f367c07e4f9fd9e` | 固定角色与执行原则 |
| 编排边界（Section 1） | 29 | `891ff6dd26de49b2425d9cd89aadc45b2f09b3422d2899d5239bce5f2cd2fbf3` | 写权：`角色卡/编排/docs/change/` |
| B1 实施记录 | 172 | `db0ecf35f4ef500158ac02d915918ab05a156f2153f3b4e400e787ef8f48e7b5` | Provider/Service/Pipeline 冻结实现 |
| B1 冻结声明 | 70 | `8e2d9c7648d2313a4c7e9ed1b717855c98525eca7e245375e0ee7e2edc67e49a` | 公共句柄与常量单一来源 |
| 方案 P1.1（确认基线） | 1199 | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` | §5 账本 schema；§10.2 AC-6 证据要求 |
| 方案 P1.2（盘上编辑性等价） | 1209 | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | 本次只读的盘上版本；与 P1.1 编辑性等价（E2 K8） |
| V1 实施前标准 | 1171 | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | AC-6 原文与最低证据 |
| E2 独立验收报告 v1 | 237 | `b19a926c29bf474fd00c52744b6e6f629bf3d7a4267a82087bd69d7afea8690e` | AC-6 缺口来源 |
| 团队计划 | 675 | `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671` | B1 节点与证据路径 |
| A1 `src/model/directive.ts` | 276 | `2172bdecd3648da3d1f4bd8c1b177db8b687b1e8ac2b07119c787c44bd652699` | 事件 schema / ID / 路径 / 高危谓词 |
| A2 `src/common/shared/jsonl-ledger.ts` | 229 | `c9fd3066f1985c1b8ae850ab9b67845dcf320e7f38779de4121687cdcdd62e5f` | 追加/轮转/旧→新读取/坏行计数 |
| B1 `src/pipeline/orchestration/customer-directive.ts` | 705 | `601cf960932a841282cc187008fd68b8f8e3e64a336db1d99c5ddd4b7321aeb8` | Pipeline 公共句柄 |
| D2 账本样例 | 9 | `9e582f1fb3fa968fc18211b07120766f574ce3b3be95c6b32830a992a0d90696` | 对照：仅 created/revoked |
| B1 单测 `test/编排/customer-directive.test.ts` | 1181 | `70da2871cf0ad5cce91b2852217908852b955bc188ea993a1a7e014b3b9b0889` | 夹具/构造方式只读参考，未修改 |

## 2. 生成方法（真实模块，不重写逻辑）

证据目录：`角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples-evidence/`。

脚本 `01-generate-ledger-samples.mjs` 直接 import 当前候选的真实冻结模块（Node 24 原生 TypeScript type-stripping）：

- `src/pipeline/orchestration/customer-directive.ts` 的 `createCustomerDirectiveRuntime`：创建/消费/撤销/换 session 触发失效；
- `src/service/directive/**` 的 `createDirectiveService`（坏行/轮转样例）；
- `src/provider/directive/**` 的 `createDirectiveFileStore` / `customerDirectiveLedgerPath`；
- `src/model/directive.ts` 的 `CUSTOMER_DIRECTIVES_REL`；
- `src/common/shared/jsonl-ledger.ts` 的 `readJsonlLedger`（回放脚本直接记录 `badLines/ignoredLines/errors`）。

未复制 Provider/Service/Pipeline 的业务逻辑，未修改 `src/**`、`app/**`、`test/**`。脚本使用**确定性时钟**（`2026-11-03T12:00:00.000Z` 起每调用 +1s），样例可复现；实际生成时间另记于日志。

**运行命令与结果**

```
# 仓库根 = C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\customer-authorization-plane
bash "角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples-evidence/run-ledger-samples.sh"
```

- 运行时间：`2026-11-03T19:28:02+08:00`（开始）→ `19:28:05+08:00`（哈希生成完成）；生成脚本本身 `2026-11-03T11:28:03.626Z` → `11:28:03.700Z`，回放脚本 `11:28:03.772Z` → `11:28:03.818Z`。
- 环境：Node `v24.22.1`、npm `11.19.1`、Windows 11 Pro 10.0.26300（MINGW64/Git Bash）、时区 Asia/Shanghai；cwd 与 HEAD 见 `00-environment.txt`。
- 退出码：候选前 `0`、生成 `0`（19/19 检查通过）、回放 `0`（22/22 检查通过）、候选后 `0`；总脚本 `0`。见 `05-run-summary.txt`。

**主样例操作序列**（全部经 Pipeline 公共句柄；`takeDirective` / `revoke` 均为真实消费者路径）：

1. `submitFromInput` approval allow shell `npm install` `once` → `d-1`；
2. `submitFromInput` decision `select-recommended` `session`（`decisionGroupEnabled=false` + 已确认）→ `d-2`（highRisk `switch-off-project-recommended`）；
3. `submitFromInput` approval allow shell `npm test` `session` → `d-3`；
4. `submitFromInput` approval allow shell `npm run build` `forever`（已确认）→ `d-4`（highRisk `forever`）；
5. `takeDirective({command:"npm install", cwd, toolCallId:"sample-tool-1"})` → 返回 `{action:"allow", id:"d-1", scope:"once"}` 并落 `directive.consumed`；
6. `revoke("d-3","approval")` → 落 `directive.revoked`；
7. `submitFromInput` approval allow shell `npm run lint` `session` → `d-7`；
8. `submitFromInput` approval allow shell `npm run format` `once` → `d-8`；
9. 以新 `sessionId`（`b1-ledger-sample-session-B`）创建第二个 runtime 并 `list()`；Service 加载时按真实规则追加：`d-2`/`d-7` → `expired(app-restart)`，`d-8` → `expired(unused-once)`，`d-4`（forever）保留 active。

## 3. 主样例：created/consumed/revoked/expired 全类

| 项 | 值 |
| --- | --- |
| 原始账本路径 | `角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples-evidence/02-ledger-sample/project/.ans/state/customer-directives.jsonl` |
| 相对项目根路径 | `.ans/state/customer-directives.jsonl`（A1 常量，连字符） |
| 行数 / 字节 | **11 行 / 4,133 bytes** |
| SHA-256 | **`fbf56b487d1774c5b3b558a9d87beebdf7dbe65c0825c732e08685ab6ae30dbf`** |

**事件清单（逐行）**

| 行 | seq | kind | id | target / until | 关键字段 |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | `directive.created` | `d-1` | approval / once | `action.kind=allow`、`resource.type=shell`、`command=npm install`、`sessionId=b1-ledger-sample-session-A` |
| 2 | 2 | `directive.created` | `d-2` | decision / session | `action.kind=select-recommended`、`highRisk.reasons=["switch-off-project-recommended"]`、`acknowledged=true` |
| 3 | 3 | `directive.created` | `d-3` | approval / session | `command=npm test` |
| 4 | 4 | `directive.created` | `d-4` | approval / forever | `command=npm run build`、`highRisk.reasons=["forever"]` |
| 5 | 5 | `directive.consumed` | `d-1` | — | `via.toolCallId=sample-tool-1`（`takeDirective` 的 once 原子消费） |
| 6 | 6 | `directive.revoked` | `d-3` | — | `by=customer`（同 target active 撤销） |
| 7 | 7 | `directive.created` | `d-7` | approval / session | `command=npm run lint` |
| 8 | 8 | `directive.created` | `d-8` | approval / once | `command=npm run format` |
| 9 | 9 | `directive.expired` | `d-2` | — | `reason=app-restart` |
| 10 | 10 | `directive.expired` | `d-7` | — | `reason=app-restart` |
| 11 | 11 | `directive.expired` | `d-8` | — | `reason=unused-once` |

**生成脚本自检（`01-generate-log.txt`，19/19 通过）**：11 条事件；四类 kind 齐全；created 覆盖 approval + decision 两个 target；`version` 全为 1；`seq` 严格单调 1..11；created 的 `id === d-<seq>`；created 均带 `sessionId`；highRisk 同时覆盖 `forever` 与 `switch-off-project-recommended`。

**真实读取器回放（`02-replay-log.txt`，22/22 通过；新进程只读）**

- Provider `replay()`：`files=["customer-directives.jsonl"]`、`lines=11`、`errors=0`。
- 视图（`runtime.list()`）：approval `active=[d-4]`、`consumed=[d-1]`、`revoked=[d-3]`、`expired=[d-7(app-restart), d-8(unused-once)]`；decision `expired=[d-2(app-restart)]`；`ledgerErrors=0`。
- 消费者：`approvalFacts()={ledgerErrors:0, active:[d-4(forever)]}`；`decisionFacts()={ledgerErrors:0, active:[]}`。
- `takeDirective`：`npm install`（已消费）、`npm test`（已撤销）、`npm run lint`/`npm run format`（已失效）均返回 `undefined`；`npm run build`（forever）连续两次返回 `{action:"allow", id:"d-4", scope:"forever"}`。
- 状态机结论：`created→active`；`once` 被消费 → `consumed`；同 target active 撤销 → `revoked`；新应用运行 `sessionId` 不一致 → `session` 记 `app-restart`、未使用 `once` 记 `unused-once`；`forever` 跨重启保留。

## 4. 坏行/轮转样例

| 项 | 值 |
| --- | --- |
| 目录 | `...-B1-ledger-samples-evidence/03-bad-rotation-sample/project/.ans/state/` |
| `.2`（最旧） | 155 bytes / 1 行：未知 kind `directive.future`（合法 JSON，未来加法事件） |
| `.1`（最新轮转段） | 41 bytes / 1 行：坏 JSON（截断行 `{"version":1,"kind":"directive.created",`） |
| 当前文件 | 611 bytes / 1 行：合法 `directive.created` `d-3`（approval / session / `npm run build`） |
| 轮转来源 | 真实 Provider `createDirectiveFileStore(root, { maxBytes: 1, rotations: 2 })`；每次 `append` 前按 A2 规则轮转（`.N` 最旧、`.1` 最新）；未知 kind 与坏行经同一 Provider `append` 注入，模拟未来事件与部分写 |
| `.2` SHA-256 | `faa2e8a065dfc767a26c550b1431d31e65b2a5b38fe3cd01756d579cb389fe0a` |
| `.1` SHA-256 | `60a8042ffcdc43c19b09f8952f972d3d74ff0d04469e1d64f170faaa0f12d3da` |
| 当前文件 SHA-256 | `0dec859a2127cef1887c6c1a724bfcf85712dd2441eac59895c9fbfba41d14c8` |

**真实读取器输出（`02-replay-log.txt`）**

- Provider `replay()`：`files=["customer-directives.jsonl.2","customer-directives.jsonl.1","customer-directives.jsonl"]`（**旧→新**）、`lines=2`、`errors=1`。
- A2 `readJsonlLedger`：同一 **旧→新** 顺序；`values=1`、**`badLines=1`**、**`ignoredLines=1`**、`errors=1` —— `{"file":"customer-directives.jsonl.1","line":1,"message":"JSON 坏行：Expected double-quoted property name in JSON at position 40 (line 1 column 41)"}`。
- Service/Pipeline：`list()` → `ok:true`、`ledgerErrors=1`，可解析的 `d-3` 仍以 active 视图显示（面板如实显示错误，不伪造空）；`approvalFacts()={ledgerErrors:1, active:[]}`；`takeDirective("npm run build")` → `undefined`（消费者按无指令处理，回落既有路径，不抛错、不阻塞主路径）。
- 判读：`ledgerErrors=1` 只来自坏 JSON 行；未知 kind 行计入 `ignoredLines=1` 而不计错误，证明「未知事件忽略、坏行计数」同时成立。`badLines`/`ignoredLines` 由 A2 共享读取器直接记录；其中 `ignoredLines` 的分类回调是证据侧最小分类（未知 kind ⇒ ignore），与冻结 Service 规则同义，未改产品代码。Service 内部 `unknownEvents` 计数器未公开，故以 A2 输出 + `ledgerErrors=1`（不含未知 kind）交叉证明。

## 5. 候选 54/54 前后一致证明

- 冻结清单：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt`，134 行 / `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`。
- 验证命令（证据脚本 `verify-candidates.mjs`）：`git -c core.quotepath=false ls-files -z -m -o --exclude-standard -- src app test` + `git hash-object` + 逐文件 SHA-256。
- **生成前**：`00b-candidate-identity-before.txt`（135 行 / `25f3f972b6e0f205ea553bf71a2e9b88b864fcb904e08c8a4df7a0b7a7cd5ac8`；日志 137 行 / `67637a0829017a6d6729881972bcc56ce91651471d6abc0c6d4509140c6d62ec`）——`candidates=54 expected=54 unexpected=0 missing=0 mismatch=0`，54 条 `OK` 行。
- **生成后**：`03-candidate-identity-after.txt`（135 行 / `d7dd2dd84ca921174396e34efaa3ba9d53a583785ccff83822d7d87b79b78488`；日志 137 行 / `55b2d379058c2eb44980c5ed3ef36cfed80472f2f8861d3ecac7a30b7a1e7019`）——同样 `54/54/0/0/0`，54 条 `OK` 行。
- HEAD 仍 `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git diff --cached --name-only` 为空；`src app test` 状态条目数 50（`git status --porcelain` 折叠未跟踪目录，实际文件仍 54，与 `ls-files -m -o` 一致）。
- 本轮只新增证据目录与本文档；**未修改任何候选文件**。

## 6. 证据清单（行数 / SHA-256）

| 证据文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment.txt` | 9 | `fdd5d9bb199ee6d6d5e9ef016219d15f4d794a6ad91a7fdaa2a00642bc9f3e88` |
| `00b-candidate-identity-before.txt` | 135 | `25f3f972b6e0f205ea553bf71a2e9b88b864fcb904e08c8a4df7a0b7a7cd5ac8` |
| `00b-candidate-identity-before.log` | 137 | `67637a0829017a6d6729881972bcc56ce91651471d6abc0c6d4509140c6d62ec` |
| `01-generate-ledger-samples.mjs` | 276 | `4afb0fffd32425f1f80a84f4ee00f41e1ad87f0ed307dc3234637f75932e8b4f` |
| `01-generate-log.txt` | 40 | `9b38a28e39b4aa9d801d8c7f23ce0fe48f245ea4ed80e1428b5051f4c935023f` |
| `02-ledger-sample/.../customer-directives.jsonl` | 11 | `fbf56b487d1774c5b3b558a9d87beebdf7dbe65c0825c732e08685ab6ae30dbf` |
| `02-replay-ledgers.mjs` | 214 | `d88320c771e00fd595a61de9d18584dacab88cb65d49d606ef40d954598501a3` |
| `02-replay-log.txt` | 81 | `f1c1c08f49960f4e0372c98ed0bdbde8829828204dad73d11964cbd248a28909` |
| `03-bad-rotation-sample/.../customer-directives.jsonl` | 1 | `0dec859a2127cef1887c6c1a724bfcf85712dd2441eac59895c9fbfba41d14c8` |
| `03-bad-rotation-sample/.../customer-directives.jsonl.1` | 1 | `60a8042ffcdc43c19b09f8952f972d3d74ff0d04469e1d64f170faaa0f12d3da` |
| `03-bad-rotation-sample/.../customer-directives.jsonl.2` | 1 | `faa2e8a065dfc767a26c550b1431d31e65b2a5b38fe3cd01756d579cb389fe0a` |
| `03-candidate-identity-after.txt` | 135 | `d7dd2dd84ca921174396e34efaa3ba9d53a583785ccff83822d7d87b79b78488` |
| `03-candidate-identity-after.log` | 137 | `55b2d379058c2eb44980c5ed3ef36cfed80472f2f8861d3ecac7a30b7a1e7019` |
| `04-evidence-hashes.txt` | 27 | `f2871091ff7338548b7cd986a27c10ade3de623d6ae52d82d28f100d23745ccd` |
| `05-run-summary.txt` | 11 | `05a61c6dcc4caac693524a339c01a68353cc83a4ada891e4a642f5a30cd37982` |
| `run-ledger-samples.sh` | 91 | `b2e39bd3602b75c5ec50be06244647988adef0e2b037706bb7f7fb5af7163639` |
| `verify-candidates.mjs` | 136 | `5de2f7ccb6942656201b01a5a542ce5a0f2cf6a3803b5e11b4b22693cdad7831` |

完整哈希清单（含排序与 ledger 行数/字节）见 `04-evidence-hashes.txt`。

## 7. AC-6 映射（本补证）

| AC-6 要求（V1 §3.6） | 本补证证据 |
| --- | --- |
| 账本路径 `.ans/state/customer-directives.jsonl`（连字符） | 主样例/坏行样例均位于项目根 `.ans/state/customer-directives.jsonl`；`CUSTOMER_DIRECTIVES_REL` 打印于 `01-generate-log.txt` / `02-replay-log.txt` |
| created/consumed/revoked/expired 全类 | 主样例 11 行：created ×6、consumed ×1、revoked ×1、expired ×3 |
| `d-<seq>`、seq 单调、version 1 | 生成自检：seq 1..11 严格单调；created `id===d-<seq>`；`version===1` 全部事件 |
| target（至少 2 条不同 target） | approval（d-1/d-3/d-4/d-7/d-8）与 decision（d-2）；`decisionFacts`/`approvalFacts` 互不含 |
| `sessionId` | created 全部带 sessionId；A→B 两值驱动失效 |
| `highRisk` | d-2 `switch-off-project-recommended`、d-4 `forever`（均 `acknowledged:true`） |
| 坏行计数 | `badLines=1`、`errors=1`（A2 读取器） |
| 未知事件忽略 | `ignoredLines=1`（未知 kind `directive.future`），不计 ledgerErrors |
| 轮转（`.N` 最旧、`.1` 最新、旧→新读取） | `.2`（未知 kind）→ `.1`（坏行）→ 当前（d-3）；Provider/A2 `files` 顺序一致 |
| 消费者按无指令、主路径不阻塞 | 坏行样例 `approvalFacts={ledgerErrors:1, active:[]}`、`takeDirective → undefined`；`list()` 仍 `ok:true` 并显示错误数 |
| 样例来自当前候选 | 候选前后 54/54 一致（0/0/0），HEAD `4c3a6e4` |

## 8. 披露、限制与未覆盖项

1. **样例为证据夹具，不是产品数据**：主样例的 `cwd` 指向本证据目录内的临时项目根；`rawText`/`command` 为固定夹具文本；确定性时钟让账本可复现。真实运行路径不变。
2. **`ignoredLines` 的记录方式**：A2 `readJsonlLedger` 直接给出 `badLines/errors`；`ignoredLines` 使用证据脚本内的最小分类回调（「kind 不在四个冻结值 ⇒ ignore」）触发，与 Service 冻结规则同义；未修改产品代码。Service 内部 `unknownEvents` 未公开，故以 `ledgerErrors=1`（只含坏 JSON）+ `ignoredLines=1` 交叉证明。
3. **`ttl` 未生成**：B1 当前重启扫描只产生 `app-restart` 与 `unused-once`；schema 接受 `ttl` 但无调用路径。V1 AC-6 要求的两类 `reason` 已覆盖；如需 `ttl` 原始样例，需产品路径新增触发点（不在本次补证范围）。
4. **hostname/path/domain 指令未生成**：`consumer:"none"`，与 AC-6 的 created/target/until 覆盖无关；B1 单测已覆盖其校验，本补证不扩写。
5. **候选冻结**：本轮未修改 `src/**`、`app/**`、`test/**`；未新增/修改测试断言、未新增 skip；未 commit/push/merge/release。
6. **证据复用边界**：E2 需按 V1 §4.7 判定；本补证只关闭「原始样例缺失」，不改变其他 AC 的 pass/insufficient 结论。若候选变化，本样例与哈希失效。
7. **无停止项**：未发现需扩写集、新依赖、新路径或产品代码变更的事项。

## 9. 状态

**`evidence-supplement`**（2026-11-03）。未验收、未 commit/push；供 E2 在同一独立验收主上下文按 V1 复判 AC-6。
