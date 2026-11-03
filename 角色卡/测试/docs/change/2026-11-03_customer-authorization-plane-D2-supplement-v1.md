---
id: customer-authorization-plane-d2-supplement-v1
type: change
title: 客户授权平面 D2 补证：真实运行子场景（AC-1/2/3/8/11/16）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: evidence-supplement
related:
  - customer-authorization-plane-d2-real-run
  - customer-authorization-plane-c1-implementation
  - customer-authorization-plane-c2-implementation
events:
  - date: "2026-11-03"
    kind: created
    summary: E2 补证清单第 1 项：在冻结候选（HEAD 4c3a6e4 + 54 文件）上以真实 Electron/Node 运行 7 类子场景（近失配/普通投递、空正文面板、带图拒绝、未识别片段、shell once 放行+重复回正常链+审计样例、真实重启失效、真实坏账本），140 checks/0 failures、16 张 1360x860 截图；候选前后 54/54 一致；不判验收
---

# 客户授权平面 D2 补证：真实运行子场景（AC-1/2/3/8/11/16）

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：测试（固定角色；本上下文只承担该角色）/ E2 报告 §六 补证清单第 1 项（D2 真实运行补证）。
- **日期 / 状态**：2026-11-03；**`evidence-supplement`**。本记录只记录当前候选上的真实运行与原始证据，**不判验收、不判通过/返工**；AC 判定属独立验收 E2。
- **一句话事实**：在冻结候选（HEAD `4c3a6e4` + 54 文件）上，用真实 Electron（4 个进程/阶段）与真实 B1 编排组件（2 个 Node 运行）完成 7 类补证场景：**140 checks / 140 true / 0 false / 0 failures**、**16 张 1360×860 PNG**（关闭 DEBUG、无录屏）、真实账本/审计原始 JSONL；候选开工前/完成后均 **54/54、unexpected 0 / missing 0 / mismatch 0**；未修改 `src/**`、`app/**`、`test/**`（含 D2 探针），未 commit/push。
- **候选**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（`feat/customer-authorization-plane`）+ 54 文件；冻结清单 `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt` **134 行 / `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`**。

---

## 一、输入与版本（只读实测）

| 输入 | 派发引用 | 本记录实测 | 说明 |
| --- | --- | --- | --- |
| 测试角色卡 | — | **29 行 / `452cee435b7f08c6dd6f34b1156d7b5ea5f08ba8862ad68d824d2ff44af10068`** | 只承担测试角色 |
| 测试边界 Section 1 | — | **19 行 / `9a2eba3fc842f185eb228ef49cd30dfd66ec3933c42cca0202ff2ae26c97859f`** | 仅写 `角色卡/测试/docs/change/` 与本角色文档区 |
| V1 验收标准 | 1171 / `51ac0f50…` | **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`** | 一致 |
| 团队计划（含 §十三/§十四） | 675 / `4545d3a5…` | **675 行 / `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671`** | 一致 |
| D2 记录（含 Revision 1） | 459 / `df1bebd8…` | **459 行 / `df1bebd883cf42e9d0be9aebd023e6fc3f7673f1810b19a95de571da34c1faf6`** | 一致；§六 未覆盖清单为本次补证依据 |
| E2 报告 v1 | 237 / `b19a926c…` | **237 行 / `b19a926c29bf474fd00c52744b6e6f629bf3d7a4267a82087bd69d7afea8690e`** | §六 补证清单第 1 项 |
| 候选冻结清单 | 134 / `49cfc38d…` | **134 行 / `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`** | 54/54 基准 |
| D2 探针（只读参考） | — | **954 行 / `a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427`** | 未修改；本次独立实现补证探针 |
| C1 实施记录 | 208 / `966cba43…` | **208 行 / `966cba43dff59d127c86602981da6ee170e6447ab4a4b8df6f0dfbee469fefc6`** | 一致 |
| C2 实施记录 | 176 / `dc8bcca4…` | **176 行 / `dc8bcca40631985a32cfe7e7a4b9b50323c4bc4580e18432779e78b8ab1481ba`** | 一致 |
| C2 窄修复记录 | 139 / `6157181c…` | **139 行 / `6157181cfe88aa8285081ed95c7496f25e3a6e483d2abeeeed9131127cf11b5b`** | 一致 |

---

## 二、环境与候选身份

### 2.1 环境

| 项 | 实测值 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\customer-authorization-plane` |
| HEAD / 分支 | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` / `feat/customer-authorization-plane` |
| Node / npm | `v24.22.1` / `11.19.1` |
| Electron | `v44.7.0`（`node_modules/electron/dist/electron.exe`） |
| OS / shell | Windows 11 Pro 10.0.26300 / Git Bash（MINGW64） |
| DEBUG / ANS_DEBUG / ELECTRON_ENABLE_LOGGING | 均 **unset**（`00-environment.txt`） |
| 窗口 | BrowserWindow `useContentSize` **1360×860**、`frame:false` |
| 录屏 | **不提供**；仅 PNG 截图（V1 §2.4） |
| 构建 | `npm run build:renderer` **exit 0**（2,799 modules；`app/renderer/dist/index.html` `5e58c03b…`，dist 忽略、非候选） |

### 2.2 候选身份（开工前 / 完成后各复算）

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 开工前候选 | **54 文件；unexpected 0 / missing 0 / mismatch 0** | `01-candidate-identity-before.txt` **122 行 / `78abac830377007ccb2b27b72c460a197cfafe0ae8d541fbac8f6026bd0d7bfe`** |
| 完成后候选 | **54 文件；unexpected 0 / missing 0 / mismatch 0** | `12-candidate-identity-after.txt` **122 行 / `44d4f14ba9535563a4e0c500758038eb1eefa085c659b837eaec030675e72d31`** |
| 冻结清单 | 仍 **134 行 / `49cfc38d…`**（未改） | 只读复核 |
| 逐文件比对 | 独立 Node 读字节算 SHA-256 + `git hash-object`；54/54 与冻结清单一致 | `scripts/verify-candidates.mjs` |
| 暂存区 | 空 | `git diff --cached --name-only` |
| `src`/`app`/`test` 状态条目 | **50 条**（展开 54 候选；无其它路径） | `12-candidate-identity-after.txt` 尾部 |
| 本次新增 | 仅本记录 + `2026-11-03_customer-authorization-plane-D2-supplement-v1-evidence/`（角色文档区，非候选） | `git status --porcelain` |

**候选结论**：7 类场景全部在**同一冻结候选**上运行；运行前后候选逐字一致，未修改任何 `src/**`、`app/**`、`test/**` 文件（含 `test/测试/customer-authorization-plane-d2-probe.mjs`）。

---

## 三、场景与原始证据

> 公共口径：真实 Electron 使用真实 `app/preload.cjs`（`684c0d96…`）、真实渲染 `app/renderer/dist/index.html`（`5e58c03b…`）、真实 `app/desktop/interface.ts`、`app/desktop/directive-input.ts`、`app/desktop/customer-input.ts` 与真实 B1 文件账本；无关 IPC 用无害桩。每个阶段使用证据目录内**全新** userData/夹具项目（重启阶段两进程共用同一 userData/项目）。所有截图均为 1360×860，哈希见 `10-screenshot-hashes.txt` **23 行 / `555d185cc5b9fcb3d28501cf7fa5f25fe180bb85703bff700faffb0daeb1cece`**。

### 场景 1：近失配 / 未命中普通投递（AC-1/AC-2）

**运行**：`ANS_SUPPLEMENT_PHASE=main ./node_modules/.bin/electron <evidence>/scripts/d2-supplement-probe.mjs`；日志 `05-main-run.log` **80 行 / `f30042c09b94bb17030133c726243ad28399c415ed23798fb99892ec85e7ab5d`**；report `main/report.json` **665 行 / `dd6d0b7dcf69f6331d754e189a3821b93b0c364fc18b4e14006e7df17425ebb0`**；**65 checks / 65 true / 0 false**，exit 0，11 张截图。

| 输入 | 实际观察 | 截图 |
| --- | --- | --- |
| `@审批员 你好` | 无指令面板；用户气泡出现；`session:send` 走普通路径，返回 `{ok:false,error:"会话尚未开启（点击左侧角色即可开启）。"}`（本探针未接真实模型运行时，见 §五.2）；无账本文件、无回执 | `main/S1a-near-miss-approval-clerk.png` `cd2a0684…` |
| `请把 @审批 的说明发我` | 同上（正文中的标记不命中） | `main/S1b-mid-body-marker.png` `18b87a13…` |
| `＠审批 允许 shell "npm install" once` | 同上（全角 `＠` 不命中） | `main/S1c-fullwidth-marker.png` `31bb1edd…` |
| `@边界 你好` | 同上（`@边界` 不命中、无隐藏解析） | `main/S1d-boundary-marker.png` `42ea4deaba…` |
| **对照命中** `@审批 允许 shell "npm install" once` | 面板打开（原文/范围/资源/期限 `本项目（所有角色）` / `shell 命令：npm install` / `一次性`，确认可用）；**无用户气泡**；账本仍未创建；取消后 `session:send` 返回 `{ok:false,error:"已取消；未记录。",directiveCancelled:true}`，无落账 | `main/S1e-hit-dialog-open-no-bubble.png` `d66ecfa5…` |

**判定性观察**：四条未命中输入的 `*_NO_DIRECTIVE_DIALOG`、`*_USER_BUBBLE`、`*_NORMAL_SEND_PATH`（`res.directive===undefined` 且 `res.directiveCancelled===undefined`）、`*_NO_NEW_RECEIPT`、`*_LEDGER_UNCHANGED` 全部为 true；命中对照 `S1E_NO_USER_BUBBLE`/`S1E_LEDGER_UNCHANGED`/`S1E_CANCELLED_RESULT` 为 true。

### 场景 2：空正文面板（AC-1/AC-3）

**输入**：`@审批`（无正文）。

**实际观察**（`main/report.json`）：面板打开；原文 `@审批`；范围 `本项目（所有角色）`；资源 `shell 命令：`（命令为空）；期限 `本会话`；`#directive-not-confirmable` 显示「指令解析不完整；请补齐或修改字段后再确认。」；**确认按钮 disabled=true**；无高危。

**截图**：`main/S2-empty-body-panel.png` `1b82e0c4d217cce61c1996a416df97d3fd076b1f700dbfcf31034f5137179a99`（82,910 bytes，1360×860）。取消后未落账、无回执。

### 场景 3：带图 + 标记拒绝（AC-1）

**输入**：通过真实主进程 `desktop.pickImage()`（探针注入 1×1 合法 PNG）附加图片，再输入 `@审批 允许 shell "npm install" once` 并发送。

**实际观察**（`main/report.json`）：
- `#attach-row` 显示 1 个附件 chip（`S3_ATTACH_CHIP=true`）；
- 主进程 `sendSession` 在解析命中且 `rawImages.length > 0` 时直接返回 `{ok:false,error:"指令输入不支持图片附件；请移除图片后重试。"}`；
- `#composer-demo-status` 实际显示该错误；**未打开指令面板**；**无用户气泡**；**无回执**；**账本仍不存在**；
- 原文/附件按 AC-4 路径恢复回草稿（截图可见附件 chip）。

**截图**：`main/S3a-image-attached.png` `d35d1f26…`（附加图片，发送前）、`main/S3b-image-directive-rejected.png` `3a42aba037c3c7d31e068276027d91f0bffffa46df88b8d27d2ee5d964ac765d`（错误状态可见）。

### 场景 4：未识别片段（AC-3）

**输入 A（派发示例原文）**：`@审批 允许 shell "npm install" 加急`。

**实际观察**（如实记录，不伪造期望）：面板打开；原文显示完整；资源显示 **`shell 命令："npm install" 加急`**；**未出现未识别片段提示**；**确认按钮可用**。即当前候选把 `"npm install" 加急` 整体当作 shell 命令（`unquote` 只在首尾同为引号时剥离），不产生 `unrecognized`。该行为已如实记录，交 E2 对照 V1 AC-3 判定；本角色不修改产品代码。

**输入 B（真正产生未识别片段的变体）**：`@审批 允许 加急`。

**实际观察**：面板打开；`#directive-unrecognized` 显示「未能识别的片段：加急」；资源命令为空；`#directive-not-confirmable` 显示；**确认按钮 disabled=true**（C2 策略：`confirmable=false` ⇒ 禁确认）。

**截图**：`main/S4a-exact-example-actual-behavior.png` `3d7e4da59bceee283e53ef8ab91791e90a7dc9a2eb01a62cf27e05bcf4f9720a`、`main/S4b-unrecognized-fragments-panel.png` `d9034d554bd2cbd7e7e274cb63cd4db65639ee112936fc4fa778341931926ac6`。两者均取消、未落账。

### 场景 5：shell 精确命令一次放行 + 重复回正常链 + 审计样例（AC-8）

**运行**：`node <evidence>/scripts/shell-directive-run.mjs directive`（真实 B1 `createCustomerDirectiveRuntime` + 真实 `createShellGate` + 真实文件审计 `createFileAuditSink`/`buildShellAuditGate`）；临时项目 `shell-directive/project`；日志 `03-shell-directive-run.log` **15 行 / `ae1239ef1be804ff565850b47f30997d5b8da47498c39a6ac3fcdbcd3139b4e2`**；result `shell-directive/result.json` **426 行 / `bfb0c2ac4c9bab1137129ce5a1866a9dc7f28200b3e511547cb41a6d80a5cc6c`**；**15 checks / 15 true / 0 false**，exit 0。

**执行序列**（命令 `npm install`，argv `["npm","install"]`，cwd=临时项目根）：

| 步骤 | 观察 |
| --- | --- |
| 创建 `@审批 允许 shell "npm install" once` | 真实 runtime 落账 `d-1`（target=approval、until=once、allow、shell:npm install、cwd=项目根）；`approvalFacts.active=1` |
| 硬地板闸（classify→`deny`） | `allow:false`、`by:"ruleset:supplement-ruleset"`、branch `c-deny`；**allow 指令不被消费**（facts 仍 active） |
| review 闸第一次（与硬地板同一命令） | `allow:true`、**`by:"directive:d-1"`**、`directive:{id:"d-1",scope:"once"}`；operator 通道 0 次调用；账本追加 `directive.consumed d-1 seq=2`，`via.toolCallId="supplement-directive-1"`；facts active=0 |
| review 闸第二次（同一命令） | **不按指令放行**：`allow:true`、`by:"pm:无会话 → operator:supplement-operator"`、`directive` 字段缺省；operator 通道 1 次调用（正常链）；账本**无第二次 consumed** |

**真实 shell 审计 JSONL（原始文件）**：`shell-directive/shell-gate.jsonl` **3 条 / `aef4541b0a3caa96f44bdcca17e2fa9e0ee5544cd0ba0afa6afafb307f128ebe`**，逐条：

1. 硬地板：`conclusion:"deny"`、`branch:"c-deny"`、`by:"ruleset:supplement-ruleset"`、`conditions:["shell-gate"]`、`execution:"未执行"`，无 `directive`/`judge`/`customerGrant`；
2. **指令放行**：`conclusion:"allow"`、`branch:"directive:allow"`、**`by:"directive:d-1"`**、**`directive:{"id":"d-1","scope":"once"}`**、`conditions:["shell-gate"]`、`execution:"未执行"`，**无 `judge`/`customerGrant`**（互斥可区分）；
3. 正常链回落：`conclusion:"allow"`、`branch:"b-unavailable→a-allow"`、`by:"pm:无会话 → operator:supplement-operator"`、无 `directive`/`judge`/`customerGrant`。

**真实账本 JSONL**：`shell-directive/customer-directives.jsonl` **2 条 / `a7017b7cbfb4c5a9aa2c45abc5fe00eeaf977b714a1d05d0e7a291baf76ab80a`**：`directive.created d-1`（once，rawText 含原文）与 `directive.consumed d-1`（via.toolCallId）。

**口径**：本场景不 spawn `npm install` 进程、不联网；调用的是真实 shell 授权决策点 `ShellGate`，传入的 `ShellReviewRequest`（command/argv/cwd/toolCallId）与真实 shell 工具一致；审计 `execution:"未执行"` 如实反映未执行外部命令。用于 AC-8 的「放行一次/重复回正常链/审计归属」证据，不用于证明命令实际执行结果。

### 场景 6：真实重启（AC-11）

**运行**：两个真实 Electron 进程，**同一** `restart/userData` 与 `restart/project`：
- run1 `ANS_SUPPLEMENT_PHASE=restart-create`：日志 `06-restart-create-run.log` **23 行 / `8034723eb111a51d7701d16cd14803df38c751fb8636a637cfdc229671b4e457`**；report `restart/run1/report.json` **302 行 / `226f2790b03d5ad6c321450879880ca3b71ba776b0ffafae8f4dd0955e81098e`**；**18 checks / 18 true / 0 false**，exit 0，1 张截图。
- run2 `ANS_SUPPLEMENT_PHASE=restart-verify`：日志 `07-restart-verify-run.log` **20 行 / `db89db845047700f96671d8c6e337b40535c2e8f4127042b17f40c58960238c6`**；report `restart/run2/report.json` **252 行 / `724be72669d3355e38519096f5c44a8daca5fd89fd68c1ab663abd810b0425f3`**；**15 checks / 15 true / 0 false**，exit 0，1 张截图。

**run1（创建）**：经真实 UI 创建：
- `@审批 允许 shell "npm install" until=session` → 回执「已记录审批指令 #d-1」；
- `@审批 允许 shell "npm test" once` → 回执「已记录审批指令 #d-2」；
- 面板 `#directive-row-d-1`/`#directive-row-d-2` 均 `data-status="active"`；截图 `restart/run1/R1-panel-before-restart-active.png` `8961eaf955dfa3ca83637c15abc739a1b2ec84f1fae0ab24d7207383e8ad61f9`。

**run2（重启后）**：
- 面板两行均 `data-status="expired"`；文本含「已失效」；`d-2` 行含「未使用，已失效」；审批分区无 active 行；
- `directive:list` 返回 `active:[]`、`expired:[d-1,d-2]`、`ledgerErrors:0`；
- 账本追加两条失效事件：`directive.expired d-1 reason:"app-restart"`（seq 3）、`directive.expired d-2 reason:"unused-once"`（seq 4）；无伪造回执；
- 截图 `restart/run2/R2-panel-after-restart-expired.png` `e87996ea7ae8ac17b7345eb0480d8350e84d7d75563c8c3f52aa175fbf8cc5b9`。

**账本原始文件**：`restart/project/.ans/state/customer-directives.jsonl` **4 条**（2 created + 2 expired）；快照 `restart/run1/ledger-snapshot.json` `392d0137…`、`restart/run2/ledger-snapshot.json` `cbe17e67…`。

### 场景 7：真实坏账本（AC-16）

**预置**（`scripts/seed-bad-ledger.mjs`；`08-bad-ledger-seed.log` **4 行 / `5676f217…`**）：
- `.2`（最旧）：合法 `directive.created d-1`（forever）+ `directive.revoked d-1`；
- `.1`：**截断 JSON 坏行** + 合法 `directive.created d-3` + `directive.revoked d-3`；
- 当前文件：**`not-json-at-all` 坏行** + `version:2` 事件（parser 拒绝）；
- 预置后账本 3 段（`.2`/`.1`/当前），原始文件保留在 `bad-ledger/project/.ans/state/`。

**真实 Electron**：`ANS_SUPPLEMENT_PHASE=bad-ledger`；日志 `09-bad-ledger-run.log` **27 行 / `7b3e24ff2a49d2f7bfaeedab850e6298f83ff2966f2a2f39f2b7bda42207dc9d`**；report `bad-ledger/run/report.json` **270 行 / `5f19ea439e49bc309084885b34cc955c5e633a080087b4aded6e4aed621f6f1a`**；**20 checks / 20 true / 0 false**，exit 0，3 张截图。

| 检查 | 观察 | 截图/证据 |
| --- | --- | --- |
| 面板 ledgerErrors | `#directive-panel-ledger-errors` 显示「指令账本不可用（**3 条坏行**）；客户指令未生效。」 | `bad-ledger/run/B1-panel-ledger-errors.png` `47b50c71…` |
| 消费者按无指令 | `directive:list`：`ledgerErrors=3`、`approval.active=[]`、`decision.active=[]`（历史 revoked 行仍按解析结果显示，`d-1`/`d-3` revoked） | report `directiveLists[0]` |
| 普通聊天路径 | 输入 `你好`：无指令面板、用户气泡出现、`session:send` 普通路径（`res.directive` 缺省、非 `directiveCancelled`）、无回执；账本字节不变 | `bad-ledger/run/B2-ordinary-chat-after-bad-ledger.png` `4bcd0c2c…` |
| 决策消费者 | 真实 `customerInput` 呈现客户卡（`pushed=1`），**不代选**；经通道回答 alpha，`outcome.directive` 缺省、`operatorId="d2s-probe-operator"`；不伪造 directive 回执 | `bad-ledger/run/B3-decision-card-normal-path.png` `2d23bca6…` |
| 账本不被改写 | 消费者/普通聊天前后 `lines/bytes` 一致（2 行 / 76 bytes）；未删除坏行、未追加伪事件 | `ledger-before.json` = `ledger-after.json`（`b3dd912c…`） |

**shell 主路径（Node，真实 B1）**：`node <evidence>/scripts/shell-directive-run.mjs bad-ledger`；日志 `04-bad-ledger-shell-run.log` **11 行 / `12dc55684d82b5256cd786fb7108db43aa0b50cab42577393939dfb30b0279a4`**；result `bad-ledger-shell/result.json` **240 行 / `c237a84c920c2776450a88222066066edf5ef808d93948343f56d81e1d987404`**；**7 checks / 7 true / 0 false**，exit 0。
- 真实 runtime `list()`：`ledgerErrors=3`、active 0；
- 真实 `ShellGate`（classify→review）调用精确命令：`takeDirective` 因 `ledgerErrors>0` 返回 undefined，**回落正常链**，operator 放行，`by:"pm:无会话 → operator:supplement-operator"`、`directive` 缺省；
- 审计 `bad-ledger-shell/shell-gate.jsonl` **1 条 / `cb1ec96426a08065e2fe377d3b12cf6a4cea4b74adde2f30dd43a38ba4bf9bca`**：`conclusion:"allow"`、`branch:"b-unavailable→a-allow"`、无 `directive`/`judge`/`customerGrant`；
- 账本 3 段字节不变（`LEDGER_NOT_MUTATED=true`）。

---

## 四、AC 映射（只列补证覆盖，不判验收）

| AC | 补证覆盖 | 实际证据 |
| --- | --- | --- |
| **AC-1** | 近失配 `@审批员`、正文中标记、全角 `＠`、`@边界` 普通投递；命中对照不投递；空正文面板确认禁用；带图标记明确拒绝（不投递/不落账）；未识别片段变体 | 场景 1/2/3/4；`main/report.json` 65/65；截图 S1a–S1e、S2、S3a/b、S4a/b |
| **AC-2** | 未命中普通消息经 `session:send` 普通路径、无 `directive` 结果、用户气泡出现、无回执/无账本；命中时无用户气泡、无账本、取消返回 `directiveCancelled:true` | 场景 1；`main/report.json` 的 `S1a–S1d_NORMAL_SEND_PATH`、`S1E_NO_USER_BUBBLE`、`S1E_CANCELLED_RESULT` |
| **AC-3** | 空正文：字段留空（命令空）、`confirmable=false`、确认禁用；未识别片段：列出「加急」并禁用确认；派发示例原文的实际解析行为如实记录 | 场景 2/4；`S2_EMPTY_BODY_PANEL`、`S4B_UNRECOGNIZED_FRAGMENTS`、`S4A_ACTUAL_NO_UNRECOGNIZED` |
| **AC-8** | 精确命令硬地板之后放行一次；`by:"directive:d-1"`；once durable 消费一次；第二次不按指令放行、回落正常链；真实 shell 审计 `directive:{id,scope}` 与 judge/customerGrant 互斥 | 场景 5；`shell-directive/result.json` 15/15；`shell-gate.jsonl` 3 条；`customer-directives.jsonl` 2 条 |
| **AC-11** | 真实 Electron 两次启动（同一 userData/项目）：`session` → `expired(app-restart)`、未用 `once` → `expired(unused-once)`；面板「已失效」/「未使用，已失效」；无伪造回执 | 场景 6；`restart/run1/report.json` 18/18、`restart/run2/report.json` 15/15；重启账本 4 条；截图 R1/R2 |
| **AC-16** | 真实坏账本/坏行/轮转：消费者按无指令；普通聊天与 shell 主路径不阻断；面板如实显示 3 条坏行；决策卡回落客户卡；不伪造回执；账本不被改写 | 场景 7；`bad-ledger/run/report.json` 20/20；`bad-ledger-shell/result.json` 7/7；截图 B1–B3；seed 原始三段账本 |

**附带事实（不改变 AC 判定）**：本次运行同时产生了 `directive.created`、`directive.consumed`、`directive.expired`、`directive.revoked` 四类账本原始样例与坏行/轮转样例（路径见场景 5/6/7），以及 shell 审计样例；是否满足 AC-6 的完整样例要求由 E2 判定。AC-1 的前导空白/多行/`@决策X`/`@审批-允许`/`@审批，允许` 解析真值表仍由 A1 `test/runtime-core/directive-marker.test.ts` 27/27 覆盖（E2 §三 已核），本次补证只补真实运行的近失配/普通投递与面板场景，不重复解析器单测。

---

## 五、发现、披露与限制（如实记录）

### 5.1 派发示例 `@审批 允许 shell "npm install" 加急` 的实际解析

- 派发场景 4 举例期望「面板列出未识别片段」。当前候选真实运行的**实际行为**是：`shell` 后的整段 `"npm install" 加急` 被作为命令（`unquote` 因首尾不同时引号而不剥离），面板资源显示 `shell 命令："npm install" 加急`，**无未识别片段提示、确认可用**。
- 本记录不修改产品代码、不伪造期望；另用 `@审批 允许 加急` 证明未识别片段路径（面板显示「未能识别的片段：加急」、确认禁用）。
- 该差异交 E2 对照 V1 AC-3 的口径判断；本角色只报事实。

### 5.2 普通聊天投递的探针边界

- 探针不接真实模型运行时/凭据；普通聊天发送真实进入主进程 `sendSession` → `manager.send`，返回既有「会话尚未开启」错误。该结果证明**未命中输入走普通路径而非指令路径**（`res.directive` 缺省、无账本、无回执、用户气泡出现），但不证明真实模型轮次；真实模型轮次不在本次补证范围内（D2/D1 同样未驱动模型）。

### 5.3 坏账本面板的历史行

- 坏账本项目中，`directive:list` 仍按可解析事件展示历史 revoked 行（`d-1`/`d-3`），同时 `ledgerErrors=3` 且消费者（shell/decision）按无指令；面板顶部明示「客户指令未生效」。这是当前实现的实际行为，未删除坏行、未隐藏错误；E2 可按 AC-16 口径核对。

### 5.4 其余披露

- 每个 Electron 进程日志头有 1 条 Chromium GPU 持久缓存路径告警（`persistent_cache_sandboxed_file_factory`，D2 同类同因）；report 记录 console error=0、CSP violation=0。
- 截图 16 张全部 1360×860，DEBUG/ANS_DEBUG/ELECTRON_ENABLE_LOGGING 均 unset；**未录屏**。
- 未修改既有断言、未新增 skip/todo；未修改 D2 探针；未 commit/push/merge/release；未派发其他角色。
- 运行期产物（`userData/`、夹具项目、`app/renderer/dist/`）均在证据目录或忽略路径，**不是候选**。

---

## 六、证据索引（关键项）

| 文件 | 行数/数量 | SHA-256 |
| --- | ---: | --- |
| `00-environment.txt` | 22 | `c9313023e152cbdbdb13be6034a226b30f7d1a77cb85611b6856020a91816fcc` |
| `01-candidate-identity-before.txt` | 122 | `78abac830377007ccb2b27b72c460a197cfafe0ae8d541fbac8f6026bd0d7bfe` |
| `02-build-renderer.log` | 22 | `4f2e9050aaaf1f8a1ffc4ba36dc4fb723eb365399db5a21f8f37404d23a2f4e7` |
| `03-shell-directive-run.log` | 15 | `ae1239ef1be804ff565850b47f30997d5b8da47498c39a6ac3fcdbcd3139b4e2` |
| `04-bad-ledger-shell-run.log` | 11 | `12dc55684d82b5256cd786fb7108db43aa0b50cab42577393939dfb30b0279a4` |
| `05-main-run.log` | 80 | `f30042c09b94bb17030133c726243ad28399c415ed23798fb99892ec85e7ab5d` |
| `06-restart-create-run.log` | 23 | `8034723eb111a51d7701d16cd14803df38c751fb8636a637cfdc229671b4e457` |
| `07-restart-verify-run.log` | 20 | `db89db845047700f96671d8c6e337b40535c2e8f4127042b17f40c58960238c6` |
| `08-bad-ledger-seed.log` | 4 | `5676f217af028a3d6d764164bf85e3723a2affd34192321c9fe82a2b0eaede3d` |
| `09-bad-ledger-run.log` | 27 | `7b3e24ff2a49d2f7bfaeedab850e6298f83ff2966f2a2f39f2b7bda42207dc9d` |
| `10-screenshot-hashes.txt` | 23 | `555d185cc5b9fcb3d28501cf7fa5f25fe180bb85703bff700faffb0daeb1cece` |
| `11-evidence-hashes.txt` | 44 | `d9bed526e1221ae8d10c5b27be9035e5287df6834bfd1c426e0486a437f75fd6` |
| `12-candidate-identity-after.txt` | 122 | `44d4f14ba9535563a4e0c500758038eb1eefa085c659b837eaec030675e72d31` |
| `13-commands.txt` | 53 | `7b55107d1e22a2ca4a5a4590df436611a7cb9df4850c6cc774419077fd89b7a2` |
| `main/report.json` | 665 | `dd6d0b7dcf69f6331d754e189a3821b93b0c364fc18b4e14006e7df17425ebb0` |
| `restart/run1/report.json` | 302 | `226f2790b03d5ad6c321450879880ca3b71ba776b0ffafae8f4dd0955e81098e` |
| `restart/run2/report.json` | 252 | `724be72669d3355e38519096f5c44a8daca5fd89fd68c1ab663abd810b0425f3` |
| `bad-ledger/run/report.json` | 270 | `5f19ea439e49bc309084885b34cc955c5e633a080087b4aded6e4aed621f6f1a` |
| `shell-directive/result.json` | 426 | `bfb0c2ac4c9bab1137129ce5a1866a9dc7f28200b3e511547cb41a6d80a5cc6c` |
| `bad-ledger-shell/result.json` | 240 | `c237a84c920c2776450a88222066066edf5ef808d93948343f56d81e1d987404` |
| `shell-directive/customer-directives.jsonl` | 2 | `a7017b7cbfb4c5a9aa2c45abc5fe00eeaf977b714a1d05d0e7a291baf76ab80a` |
| `shell-directive/shell-gate.jsonl` | 3 | `aef4541b0a3caa96f44bdcca17e2fa9e0ee5544cd0ba0afa6afafb307f128ebe` |
| `bad-ledger-shell/shell-gate.jsonl` | 1 | `cb1ec96426a08065e2fe377d3b12cf6a4cea4b74adde2f30dd43a38ba4bf9bca` |
| `bad-ledger-shell/customer-directives.jsonl` | 2（+ `.1`/`.2`） | `7e254c5c741e8d73713fc501b526fd6adb094eeddf2b9431534af416417084d6` |
| `main/ledger-snapshot.json` | 7 | `d40a137b76e1ef6e64eb820f039042708b77375adecf8b12fb0018a91c21f972`（账本不存在） |
| `restart/run1/ledger-snapshot.json` | 52 | `392d01376ebf178b686c19fdd893b486a30fbbea3e8a60a4897997df4f39f5d2` |
| `restart/run2/ledger-snapshot.json` | 68 | `cbe17e67640a833f99a5497f271a614bd784f9d87f913a812daa2942b8b54579` |
| `restart/project/.ans/state/customer-directives.jsonl` | 4（原始账本，项目夹具内） | `78f04d71dd57cb06858ed9e912686e7af74a47ba20d7a145366a01724f719d72` |
| `bad-ledger/project/.ans/state/customer-directives.jsonl.2` | 2（原始轮转段） | `97fc2c6fc39df842fdd15ad03ac4dcc3015cf7536e1fb821ef6ff2b16894aeb2` |
| `bad-ledger/project/.ans/state/customer-directives.jsonl.1` | 3（含 1 坏行） | `aa890de4bac2128b9969b26c900aa0eeac17c006a69b9d78f9cd0feab4c6957c` |
| `bad-ledger/project/.ans/state/customer-directives.jsonl` | 2（含 1 坏行 + version:2） | `7e254c5c741e8d73713fc501b526fd6adb094eeddf2b9431534af416417084d6` |
| `scripts/d2-supplement-probe.mjs` | 45966 bytes | `70119915cce7ed12a983ccc137f83a4b172b7407374c5c7404c2a89ed51e76c9` |
| `scripts/shell-directive-run.mjs` | 16396 bytes | `0ad2d5433df0f35fb24aa763cd5a65e19a99dec3e58aded4cdea996ceae3f1cc` |
| `scripts/seed-bad-ledger.mjs` | 2330 bytes | `8e88e19b3ad64b9dd012bb632ceb1797cf46dc98122d038f5c44a87c6f5fdb60` |
| `scripts/verify-candidates.mjs` | 4371 bytes | `304f063cd9f1146c10b94b508ce150244f4a4378cb71ce6d8dedec7ca15e0690` |

- 行数按 `11-evidence-hashes.txt` 的「逻辑行数」（无末尾换行的 JSON 比 `wc -l` 多 1）；日志/文本与 `wc -l` 一致。
- 全部 16 张截图的路径/字节/尺寸/SHA-256 见 `10-screenshot-hashes.txt`；全部非截图证据文件（脚本、日志、report、账本/审计副本；不含 `userData/` 与夹具项目树）见 `11-evidence-hashes.txt`。
- 截图清单中的 `main/S0-initial-chat.png` 与 D2 原 `00-initial-chat.png` 逐字相同（`5759371e…`），可作为同候选渲染一致性旁证。

---

## 七、写集、纪律与出口事实

| 检查 | 结果 |
| --- | --- |
| 候选 HEAD | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（未变） |
| 候选文件 | 开工前 **54/54**、完成后 **54/54**；unexpected 0 / missing 0 / mismatch 0 |
| 修改 `src/**`、`app/**`、`test/**` | **无**（含 D2 探针 `a7913e87…` 未改） |
| 暂存区 | **空** |
| 提交/推送/合并/发布 | **均未执行** |
| 其他角色资料/角色卡/边界 | 未修改 |
| `docs/scheduling` / `docs/acceptance` / `docs/communication` | 本角色未修改（本记录只在测试角色 `docs/change/`；工作区中他角色既有改动不归本次补证） |
| 断言/skip | 未修改断言；未新增 skip/todo |
| 新增写入 | `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-supplement-v1.md` + 同名 `-evidence/` 目录（脚本、截图、日志、report、账本/审计副本、临时 userData/项目） |
| 状态 | **`evidence-supplement`**；不判验收 |

**出口事实（只报事实，不判验收）**：
- 7 类补证场景全部在冻结候选上真实运行：Electron 4 阶段 **65+18+15+20 = 118 checks / 118 true / 0 false**；Node 2 运行 **15+7 = 22 checks / 22 true / 0 false**；合计 **140/140**，exit 0。
- 16 张 PNG 全部 1360×860、DEBUG 关闭、无录屏；证据哈希与候选身份均可复算。
- 场景 4 派发示例 `@审批 允许 shell "npm install" 加急` 的实际行为与派发期望不同（无未识别片段、确认可用），已如实记录并用变体覆盖未识别片段路径；交 E2 判定。**停止项：无**；7 类场景均可真实运行并已取证。
- 本记录不是验收结论；AC-1/2/3/8/11/16 的最终判定由独立验收 E2 按 V1 给出。
