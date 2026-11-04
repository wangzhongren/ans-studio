# D2 报告：真实 Electron 探针与截图（2026-11-04）

**风险档位：T3｜判定依据：团队计划 §6.4；V1 `docs/acceptance/download-requests-criteria-v1.md` §4.6；B0 v3 Electron 事实；C1/C2 实施记录｜选定检查：真实 Electron 窗口 + 真实 preload/渲染器 + 真实 customer-input 通道/SessionManager + 真实 B1 下载 Pipeline/Provider（本地 HTTP 服务与 presenter 回包为替身）；8 张截图 + 63 项现场断言；候选逐文件 hash-object/sha256 + diff/status｜复用证据：T3 不重跑（D1 于同一代码候选 `1d7560f` 记录 417 文件 / 3761 / 3734 / 9 / 18；本 D2 HEAD `691846b` 相对 `1d7560f` 仅新增 D1 测试与证据提交，产品代码相同）｜消费者重测结论：D1 六组 + T3 已覆盖；D2 现场验证 UI/通道/判断/预授权/审计链路｜全量回归：已执行（D1，见 §6）｜更正记录与污染披露见 §0**

- 任务 ID：`2026-11-04-download-requests`
- 节点：D2（真实 Electron 探针与截图）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`
- 状态：**`implemented-unverified`**（D2 只报告，不判验收；E2 独立判定）
- 纪律：只新增 `test/测试/download-requests-electron-probe.mjs` 与 `角色卡/测试/docs/change/` 证据；不改产品源码、其他角色测试/文档、`test/桌面应用/e2e/`、boundary/changelog、`docs/scheduling|acceptance|communication`；不 commit/push；不启动子代理。

## 0. 更正记录与污染披露（E2 §3.5 后续）

### 0.1 更正

- E2 报告 `docs/acceptance/download-requests-report-v1.md` §3.5 指出：原 D2 报告 §4 行 1 把「截断标记」列为「11 项字段逐项断言」的一部分，但 `probe.log`/`report.json` 中 `resolvedIpsTruncated` 出现 **0 次**——属**过度陈述**。
- 本次更正：§4 行 1 改为逐项列出实际断言的 11 个字段（角色/用途/URL/主机/单一解析 IP/文件名/上限/重定向策略/协议校验/主机校验/解析 IP 校验），并明确**未断言** `resolvedIpsTruncated`/`resolvedIpsTotal`；该截断状态在本候选的真实运行证据中仍仅由单测（`test/桌面应用/download-request.test.ts`「共 12 个，仅显示前 2 个」）覆盖。
- 原报告（121 行 / SHA-256 `288ddc19ba11972505a91da391dfd51cab5b6613bbd2d1b2a7c692fa4e40c761`）保留为历史；本文件为更正版。

### 0.2 可选加固尝试与并发污染（不可作为候选证据）

- 为补 >8 IP 截断展示，探针曾增加测试解析器（`many.example.com` 返回 12 个公网 IP）与第 8b 场景（断言「共 12 个，仅显示前 8 个」、前 8 显示/后 4 不显示并截图）。
- 加固重跑期间（约 21:00–21:02），其它角色在本工作区并发写入：`src/provider/download/impl/file-sink.ts`（mtime 21:01:24）、`src/provider/download/impl/node-http.ts`（21:02:04）、`test/编排/download-provider.test.ts`（21:02:15）、`test/编排/download-pipeline.test.ts`。按 D2 规则，该次运行**不可认证**，其截图/日志不作为候选证据。该次运行观测到 77 PASS / 0 FAIL / 9 SHOT（含新增 12-IP 场景），但因混合树不得引用。
- 已处置：探针恢复为 HEAD 版本（`test/测试/download-requests-electron-probe.mjs` 与 HEAD 一致）；加固补丁保存为 `11-hardening-probe.patch`；该次运行产物隔离在 `10-contaminated-run/`（仅透明保留，不参与判定）。
- **证据损失（如实披露）**：该次重跑覆写了 Git 忽略的原证据 `probe.log` 与 8 张截图，原始字节不可恢复。原证据哈希仍记录在恢复自 HEAD 的 `report.json`（SHA-256 `668f0ca4ba9badb6b34c48d3f2bd4ea13be64e29c0bf4024e22e2dc0332a169b`）、本报告 §5 与 E2 的已核验记录中；`10-contaminated-run/` 中的图片是污染运行产物，哈希与 §5 不符，**不得引用**。
- 加固补丁建议在 B1 补证提交、工作区干净后于 D1-supplement/复判阶段重跑；届时以新运行结果替换本报告 §4/§5 与索引。（**已完成，见 §9**）

## 1. 前置核对（开工 20:29:44）

| 项 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| 工作目录 | `...\.claude\worktrees\download-requests` | 同 | 一致 |
| HEAD | `691846b6ded34d339ee2b95bc443d547a6febebf` | `691846b6ded34d339ee2b95bc443d547a6febebf` | 一致 |
| 分支 | `feat/download-requests` | `feat/download-requests` | 一致 |
| `git status --porcelain -- src app test`（开工） | 空 | 空 | 一致 |
| `git diff --cached --name-only` | 空 | 空 | 一致 |

## 2. Electron 二进制

| 项 | 值 |
| --- | --- |
| 声明/安装包 | `electron` `44.7.0`（`package.json` / `node_modules/electron/package.json`） |
| 二进制 | `node_modules/electron/dist/electron.exe` **已存在**（246,302,208 字节；`path.txt` = `electron.exe`）——开工前已由协作方安装 |
| 安装命令 | `npx --no-install install-electron` → **exit 0，1s**（幂等，无需重新下载） |
| 运行时版本 | `electron --version` → `v44.7.0`；探针内 `process.versions`：Electron 44.7.0 / Node 24.21.0 / Chrome 152.0.7977.130 |
| 依赖完整性 | `package.json` SHA-256 `51b63e73…b91400d`、`package-lock.json` `d6ee156e…8b7685`（未变化，未修改 manifest/lock） |

## 3. 探针

- 文件：`test/测试/download-requests-electron-probe.mjs`（新增，唯一产品/测试区写入）。
- 架构：Electron 主进程创建真实 `BrowserWindow`（1360×860，`show:true`，真实 `app/preload.cjs` + 真实 `app/renderer/dist/index.html`）；真实 `createCustomerInputChannel`（presenter 推 `session:operator-request`，`session:operator-response` 直连 `channel.respond`）+ 真实 `SessionManager`（`withRequestLifecycle` 写 `request.*`）+ 真实 B1 `createDownloadRequestRuntimeForTest` + 真实 Provider（Node http 传输、文件 sink、`downloads.jsonl`、G8 A epoch 文件）+ 真实 customer-directive 账本/`takeDownloadDirective`；仅**本地 HTTP 服务端**（`lookupOverride` 把物理连接钉到 127.0.0.1，逻辑主机保持 `download.test`/`other.test`，产品策略不改）、presenter 客户端回包、judge 脚本、directive 确认面板回包为替身。不启动真实模型、不触外网、无测试专用生产缝。
- 运行命令：`ANS_D2_OUTDIR=<本证据目录> node_modules/.bin/electron test/测试/download-requests-electron-probe.mjs`
- 结果：**SCENARIOS PASS=63 / FAIL=0 / SHOTS=8**；exit 0；看门狗 180s 未触发。

## 4. 场景与结果（V1 §4.6）

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 真实窗口下载确认卡字段：角色/用途/URL/主机/已解析 IP（单一）/mechanical 三项/文件名/上限/重定向策略 | **PASS**（标题「下载文件申请」、kind `download`；逐项断言：申请角色、用途、URL、主机、单一解析 IP、文件名、大小策略、重定向策略、协议校验、主机校验、解析 IP 校验——共 11 项；**未断言** `resolvedIpsTruncated`/`resolvedIpsTotal`，该状态仅单测覆盖，见 §0.1） | 截图 `01-download-card-customer.png`（原图字节已丢失，见 §0.2） |
| 2 | 客户批准 → 执行完成、文件落盘、完成回执（含路径/gitignore 提示） | **PASS**（`download/report.pdf` 内容一致；`request.created/presented/resolved` + `downloads.jsonl` by customer+requestId） | 截图 `02-download-completed-customer.png` |
| 3 | 客户拒绝 → `download-declined`、不落盘 | **PASS** | 截图 `03-download-card-declined.png` |
| 4 | 开关开 + judge approve → 不弹客户卡、judge 结果行、`presented.to:"judge"`、`downloads.jsonl` by judge（含 engine/reasonCode） | **PASS**（结果行显示「judge 代批 · 代审批」「已代批 · 流程 download」） | 截图 `04-judge-result-row.png` |
| 5 | judge manual → 原卡转客户、附 judgeNotice、`resolved.by` customer | **PASS**（notice 原文「自动代理未代批（代审批）：无法判断；已转你手动确认。」） | 截图 `05-judge-manual-customer-card.png` |
| 6 | 预授权 allow（session）→ 零客户卡、by directive+directiveId、无 requestId、无 `request.*` | **PASS**（账本与 tasks 负例断言） | `probe.log` |
| 7 | 预授权 once 第二次回审批 | **PASS**（首次 directive；第二次客户卡 → 确认） | `probe.log` |
| 8 | 预授权 deny 优先 | **PASS**（`download-denied-by-directive`，无客户卡） | `probe.log` |
| 9 | G8 A 旧指令不授权 + 面板标注 | **PASS**（旧 domain 卡片路径；面板「不作用于下载（早于下载功能启用）」；新指令「消费者：下载」） | 截图 `06-directive-panel-consumers.png` |
| 10 | 跨域重定向错误 → `download-redirect-cross-host`、不落盘、失败提示 | **PASS**（提示含跨域原因与重新申请指引） | `probe.log` |
| 11 | 跨域后对目标重新申请 → 客户批准 → 成功落盘 | **PASS** | 截图 `07-redirect-re-request-card.png` |
| 12 | 大小超限（env 16B）→ `download-too-large`、占位/临时清理（无 big/.part）、失败提示 | **PASS** | `probe.log` |
| 13 | 语言切换（AC-19）：en-US 卡片标题/字段/按钮全英文 | **PASS**（`Download request` / `Requesting role` / `Confirm` / `Reject`） | 截图 `08-card-english.png` |
| 14 | 关窗 fail-closed：卡片未决时销毁窗口 + session stop → `download-aborted`，审计无完成事件 | **PASS**（ledger 49→50，failed=download-aborted，无 completed） | `probe.log` |
| 15 | 归属如实：customer / judge / directive 三路径 | **PASS**（见 #2/#4/#6 审计断言） | `probe.log` |

**未在 D2 探针执行（如实记录，不伪造）**：

| 场景 | 原因 | 已由其他证据覆盖 |
| --- | --- | --- |
| `session/forever` 可重复（除 session 外的 forever 重复性） | D2 现场只执行 session 与 once；forever 语义已在 B1 单元/集成覆盖 | `test/编排/customer-directive.test.ts`、D1 集成第 1/2 场景 |
| 超时清理（D2 现场未触发传输超时） | 探针已覆盖超限清理；超时清理在 D1 集成与 Provider 测试中覆盖 | D1 集成「大小超限与超时」、`test/编排/download-provider.test.ts` |
| `unavailableReason` 通道防御 | D2 现场以 judge manual 路径覆盖「不可核对转客户卡」；`unavailableReason` 专项防御由 C1/D1 单测覆盖 | `test/桌面应用/download-decision.test.ts`、D1 集成第 9 场景 |
| >8 个解析结果的 `resolvedIpsTruncated/Total` 展示 | 受认证的 D2 运行只有单一 IP；该状态由单测覆盖。补截图尝试因并发污染不可认证（见 §0.2），加固补丁待干净树重跑 | `test/桌面应用/download-request.test.ts`（「共 12 个，仅显示前 2 个」） |

## 5. 截图元数据（8 张，无录屏；窗口 1360×860；未加载 DEBUG 覆盖层）

| 文件 | SHA-256 | 字节 | 说明 |
| --- | --- | --- | --- |
| `01-download-card-customer.png` | `8bbd555a60fe2d44a66fec771ea036cce307c869c64d5a12a5fff26003733891` | 90,306 | 客户下载卡（字段齐全） |
| `02-download-completed-customer.png` | `9cd3e98dee352f1d09b12913e69bad4e6c7151701f5f4ab05f9d1bfcca69e8c3` | 65,495 | 完成回执 |
| `03-download-card-declined.png` | `e0961c3fcdd3f5d731406f924a997f008a28035fc06bac7c58ffaf95e897e930` | 102,401 | 拒绝前卡片 |
| `04-judge-result-row.png` | `6aeef1ee02b366c18ada5d1cd2894a71a6ff1db374735cce0a02c629daed61b4` | 83,520 | judge 结果行 |
| `05-judge-manual-customer-card.png` | `1b45c31bbd50a76527a6630aa5a8f5f4716bfa835cea9a25542d3b2a04cdb9d7` | 106,504 | manual 转客户卡 + judgeNotice |
| `06-directive-panel-consumers.png` | `8e5f5e9eff9b167c8ad78a1afb5443c336cf797d83b340d5bf362066da79d636` | 90,992 | 指令面板消费者标注 |
| `07-redirect-re-request-card.png` | `7ab800d3fc7b91ef93f63196856bee44aa4e9352f1b0aac25623ae6e6896eeaa` | 108,075 | 跨域后重新申请卡片 |
| `08-card-english.png` | `1b0f4f307e3163d681a35a34828bf84921ba33bd369daca08ad830df9bba0860` | 128,943 | en-US 卡片与按钮 |

截图哈希与报告（`report.json`）内记录一致（该一致性由 E2 在原件存在时核验）；拍摄方式：探针内 `win.webContents.capturePage()` → PNG；窗口内容尺寸 1360×860。

> **证据可用性**：上述 8 张原始截图的字节已在 2026-11-04 21:00–21:02 的加固重跑中被覆写且不可恢复（见 §0.2）；上表哈希为原运行的历史记录（与恢复自 HEAD 的 `report.json` 一致），`10-contaminated-run/` 中的同名图片不属于本表、不得引用。

## 6. 候选与回归

- 候选口径：`f394cfb..HEAD`（`691846b`）已提交 `src app test` 改动 **83 文件**（44 A / 39 M，无删除/重命名）+ 本任务新增探针 **1 文件** = **84 文件**；逐文件 `git hash-object` + `sha256sum` 见 `09-hash-object.txt` / `09-sha256.txt` / 合并 `09-candidate-hashes.txt`（84 行）。
- 工作区（受认证运行时）：`git diff --name-only -- src app test` 空；`git status --porcelain -- src app test` 仅 `?? test/测试/download-requests-electron-probe.mjs`；`git diff --cached --name-only` 空；未 commit/push（HEAD 仍 `691846b`）。
- 更正期间（E2 后）工作区出现 B1 补证的在途修改（非本任务、非本候选，见 §0.2/§7.4）；本任务探针已恢复为 HEAD 版本。
- T3：本 D2 不重跑；D1 在 `1d7560f`（与 `691846b` 产品代码相同的候选）记录 **417 文件 / 3761 tests / 3734 pass / 9 fail（全部既有 Windows symlink EPERM）/ 18 skip / 0 cancelled / 0 todo**，新增确定性失败 0、新增 skip 0。D2 只新增探针脚本与证据，不改变产品/测试执行语义。
- 静态门（D1 记录）：`typecheck` 0 / `typecheck:renderer` 0 / `build:renderer` 0。

## 7. 限制与风险

1. 探针以本地 HTTP 服务 + Provider `lookupOverride` 测试缝替代公网；真实 Provider 的 Node http/文件 sink/账本/epoch 仍为产品实现（与 D1 同）。judge 结果为脚本化替身；真实模型调用不在 D2 范围。
2. 工具调用链路由探针直接调用会话的 `requestDownload` 能力（与 C1 注入同形），不经过真实模型的工具选择；AC-1/AC-4 的「模型可调用」由 A1 工具注册测试与 D1 集成覆盖。
3. 探针开发期间有多次调试运行；受认证证据为一次完整干净运行（63/63 PASS，无 watchdog/异常）。其原始 `probe.log`/截图字节在后续加固重跑中被覆写且不可恢复（§0.2）；加固重跑因并发写入不可认证，相关产物已隔离。
4. H1 治理文件与 `docs/planning/memo.md` 仍为未提交修改（预期、非本角色、未触碰）；更正期间工作区另出现 B1 补证的在途修改（`src/provider/download/impl/file-sink.ts`、`node-http.ts`、`test/编排/download-provider.test.ts`、`download-pipeline.test.ts`），非本任务、不属本候选（§0.2）。
5. 本报告不判验收（`implemented-unverified`）；AC-3/4/6/14/22/25/27/28 的最终判定归 E2，D2 只提供现场证据。

## 8. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 |
| --- | --- | --- | --- |
| `00-opening-state.log` | `4cbe3b01190f406ba7084e4b3639d73515cd550c016d892ee0301cce6bc4f528` | 9 | 开工状态 |
| `01-electron-install.log` | `45a2b7dfe0da537847edadce0b3cd14b0fa4e9173896838e1a036ab6fe25c03f` | 12 | Electron 版本/路径/安装 |
| `01-lockfile-hashes.txt` | `27e5677bc200c1e17a8ca98e8eb9427cac859f4d208ffab7539d4db80f01cf1d` | 2 | manifest/lock 未变 |
| `probe.log` | `c65df3ab412e36250d15d247c82bc182fcaa20654c0b988a99c38ad0bf1e4f7e` | 88 | 受认证运行原始输出（63 PASS/0 FAIL/8 SHOT）；**字节已丢失（§0.2）** |
| `report.json` | `668f0ca4ba9badb6b34c48d3f2bd4ea13be64e29c0bf4024e22e2dc0332a169b` | 656 | 结构化检查/截图/notice（已从 HEAD 恢复，哈希一致） |
| 截图 8 张 | 见 §5 | - | PNG；**字节已丢失（§0.2）** |
| `09-candidate-committed.txt` | `9d4116a273be25200cf69631ba109f35554cfa2c9a014e2100c6a12ec5c5a70a` | 84 | 已提交候选 name-status（83 文件） |
| `09-candidate-worktree.txt` | `001c1ab8d3b74b59e593b641c17117ac2483e6e69fc8e7fdb69653b958edc9bc` | 2 | 新增探针 |
| `09-candidate-diff.txt` | `d64c9195d1461f3a65b1956eac41ce44469054eec2f8ed431393d84c42d5b3b1` | 1 | `src app test` diff 空 |
| `09-candidate-files.txt` | `3a4611fa6cdb2b331ab1951ebd794e7580199a1a1388116b9c05c398f7b1bb7d` | 84 | 候选清单 |
| `09-hash-object.txt` | `02628f204668a610be583bf218f4ad64a2f5a5dd7faa74f26371b8a92515dcf8` | 84 | git hash-object |
| `09-sha256.txt` | `3807f7b6cec1f198a95f02bf3acf0ba6b301eed96ca3403d1c3bf53d3f8c35c2` | 84 | sha256sum |
| `09-candidate-hashes.txt` | `b895562adfb96b0d42379b2516e0b2de0624eef31cb49e27c625c2871602b6a5` | 84 | 合并清单 |
| `project/.ans/state/downloads.jsonl` | `40e6c43138265308378ad8c864b9f48fcece4b7c2482d4db12cff24bdb74047a` | 50 | 真实下载账本（现场运行） |
| `project/.ans/state/tasks.jsonl` | `ad1e4bd98a7d5a85d2653751f9abb428f43192f0a2abd327c7a8cc3afc492623` | 65 | `request.*` 审计（现场运行） |
| `project/.ans/state/customer-directives.jsonl` | `40f8f856247dd5314e196b77aecfc18ce09cb71fba8f7ee008dff03ce8f16d2a` | 6 | 指令账本（现场运行） |
| `project/.ans/state/download-consumer.json` | `c7328ad7f3c4d393dd069c399e03a6b978a782ec2e5f938d18b1f9910a243ca0` | 1 | G8 A epoch（现场运行） |
| `project/download/*`（8 个成功文件） | 见 `19-evidence-index.sha256` | - | 现场落盘（已从 HEAD 恢复） |
| `10-contaminated-run/`（9 PNG + probe.log） | 不进索引语义 | - | **污染运行产物，仅透明保留，不得引用**（§0.2） |
| `11-hardening-probe.patch` | 见 `19-evidence-index.sha256` | 64 | >8 IP 截断场景加固补丁（未认证，待干净树重跑） |

索引文件 `19-evidence-index.sha256` 为**更正后重新生成**：覆盖当前存在的全部证据文件（含隔离目录、加固补丁与 §9 加固重跑目录）与本报告；原 HEAD 索引曾引用已丢失的 `probe.log`/截图字节，无法再按原样校验。索引自身不入索引；其哈希见交付报告。

## 9. 加固重跑（E2 补证，2026-11-04 21:11）

- 触发：E2 `docs/acceptance/download-requests-report-v1.md` §3.5 / AC-3 / AC-25 的可选加固建议。
- 执行：在 HEAD `cb3dd23` 干净树（开工 `src app test` 空）上，将已提交补丁 `11-hardening-probe.patch` 应用于 `test/测试/download-requests-electron-probe.mjs`（`git apply --check` / `git apply` exit 0；仅测试装配），并追加 AC-22 共存场景；输出到**新目录** `hardened-run-20261104-2111/`，**未覆盖**既有证据。
- 结果：**SCENARIOS PASS=82 / FAIL=0 / SHOTS=11**，exit 0，看门狗未触发；Electron 44.7.0 / Node 24.21.0 / Chrome 152.0.7977.130；窗口 1360×860；无录屏、未加载 DEBUG 覆盖层。
- **AC-3/AC-25 截断（场景 8b）**：测试解析器 `many.example.com` 返回 12 个公网 IP；断言卡片显示前 8 个 IP + 「共 12 个，仅显示前 8 个」，后 4 个不显示；截图 `09-card-resolved-ips-truncated.png`（`93a62608085891bed6e309b9d5f6fe394103a1cb0004b4752e5c6094a3750d7d`）。该状态现已有真实运行截图证据。
- **AC-22 共存（场景 8c）**：下载卡先呈现；推入 shell 确认卡后 shell 卡可见、下载请求保持未结算（`coexistSettled=false`）；shell 卡拒绝后下载卡重新呈现并等待自身作答；无跨通道仲裁。截图 `10-shell-and-download-coexist.png`（`20446a1fe1e753d580a973553347750fc6a314771835ea51f8cd6d8999e46fbb`）、`11-download-after-shell-closed.png`（`4e7877638237cdabc0ea61126996226f14be2e490c543b0fcf684d10f5ac5cb5`）。观测：shell 卡打开时决策对话框不与其同屏（视觉优先级），但下载请求不因此被结算/取消。
- 关窗 fail-closed（场景 9）仍通过：`download-aborted`，无完成事件。
- 证据（`hardened-run-20261104-2111/`）：`report.json`（812 行，`9d89ad7d5b335f27b22ea8f7eb7e4f9ebd410114804fce0a06c132e27a044d2a`）、`probe.log`（112 行，`4e922869f5d63d7804f655b976b3f2e814c839ab08e0bad70d5b0a5b1d96facf`）、11 张截图（哈希见下表）。本次运行绑定 HEAD `cb3dd23` + 加固探针工作区改动（测试装配，未提交）。
- 说明：§0.2 所记的污染重跑与证据损失保留为历史；本节为**干净树**上的重跑，作为 AC-3/AC-25 与 AC-22 的补充证据（不替换 §4/§5 的受认证历史运行记录）。

| 截图（hardened-run） | SHA-256 |
| --- | --- |
| `01-download-card-customer.png` | `0647c941ba5f19410844928432b9d39328a8621da3cbc6202a42b0a2c11b87bf` |
| `02-download-completed-customer.png` | `2114d6e89eec01076e846506aa776d81d27f65fadf22c1ae23408ed6c7fa2692` |
| `03-download-card-declined.png` | `8fd52c41a27e59004f4e7f9404e1b165d9a56dc3f05216c6260cac00f6ac834c` |
| `04-judge-result-row.png` | `be96ad0310142d372ef60b397c5df4491feb2851cbdb85f7973fea231f2b7046` |
| `05-judge-manual-customer-card.png` | `9d97154155f95627237bdd876103fa59c2ec4855503080efe3cc06e8c8d0a278` |
| `06-directive-panel-consumers.png` | `338b9db7615a0aa1bbc272b5f6c8aefda53e021ca06d56e373f2b614bc87501c` |
| `07-redirect-re-request-card.png` | `5e6e91001502d8fbbb24967138ab9d940e3796e5dfa02788db62afb3e452db11` |
| `08-card-english.png` | `d552639cafabe387535619ada7044711113a103913797a5b67da62ecbae31f69` |
| `09-card-resolved-ips-truncated.png` | `93a62608085891bed6e309b9d5f6fe394103a1cb0004b4752e5c6094a3750d7d` |
| `10-shell-and-download-coexist.png` | `20446a1fe1e753d580a973553347750fc6a314771835ea51f8cd6d8999e46fbb` |
| `11-download-after-shell-closed.png` | `4e7877638237cdabc0ea61126996226f14be2e490c543b0fcf684d10f5ac5cb5` |
