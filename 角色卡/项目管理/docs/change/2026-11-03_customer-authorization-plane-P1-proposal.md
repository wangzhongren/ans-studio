# P1 实现提案：项目管理（A2 共享 JSONL 辅助 + A3 i18n 契约）

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色**：项目管理（固定角色；本上下文只承担该角色，不切换）。**日期**：2026-11-03。
- **状态**：**P1 实现提案 Revision 2（窄修订，仅 A3 key 增补：P1-CAP-17）**。只写本提案文档；未写产品/测试代码/其他角色文档/角色卡/边界/调度/验收/沟通文档；未实施、未验收、未 commit/push（Revision 1 仅复跑既有 A2 基线测试，见 §9）。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 为空（Revision 2 实测）。
- **输入版本 [事实]**：团队计划 v1 653 行 / `37e6bd0d…`；**§十三闸门 2 增补后当前** 664 行 / `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8`（仅 C2 写集增补，不影响 A2/A3）；V1 1171 行 / `51ac0f50…`；B0 记录 239 行 / `f1c54f09…`；**P1 审核记录当前** 306 行 / `8427ff02c138562916fe8a84c5f1378a055276163bc8d4b4916b58347d92b1e0`（含 Revision 1 窄复审与 P1-CAP-15..18）；**C2 修订稿** 162 行 / `40c47efd8c4314f410064710bd8e287cdf1082d9953f781491948e159c91d52a`（§六要求 A3 纳入卡内入口 key）；沟通记录当前 **174 行 / `80b9170d909402d4363155b66af581a424ac5b7ee562b6399ff66c98b7240a3a`**（任务书快照 168 行 / `9f19821e…`，后续追加“提交/合并预授权”，不影响 A2/A3；更早快照 150 行 / `5d2858cd…`，不混用）。方案 P1.1（闸门 1 确认版）1199 行 / `7875ad6a…`（据 V1/B0 记录）；**当前磁盘为 P1.2** 1209 行 / `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`（R1/R2 编辑性收口，V1 §1.2.1 已版本注记，语义不变）。两者并引，不混用。
- **标注**：**[事实]** = 已只读核实的代码/文档行为；**[设计候选]** = 本提案提议、未实施。

## 1. A2：共享 JSONL 辅助（设计推荐 A）

### 1.1 契约形状 [设计候选]

- **文件**：`src/common/shared/jsonl-ledger.ts`（新）。纯 Node（仅 `node:fs`/`node:path`）；不依赖 Model/运行层/诊断，不读 env，不硬编码 `.ans` 路径；**渲染侧不得导入**（含 Node API）。
- **导出**（append 写 `jsonText+"\n"`；parse 返回 `ok:true|ok:false|ignore`）：

```ts
export const DEFAULT_JSONL_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_JSONL_ROTATIONS = 3;
export interface JsonlLedgerLimits { maxBytes?: number; rotations?: number }
export type JsonlAppendResult = { ok: true; path: string } | { ok: false; message: string; code?: string; cause?: unknown };
export type JsonlParseResult<T> = { ok: true; value: T } | { ok: false; message: string } | { ok: "ignore" };
export interface JsonlReadError { file: string; line: number; message: string }
export interface JsonlReadResult<T> { files: string[]; values: T[]; errors: JsonlReadError[]; badLines: number; ignoredLines: number }
export function appendJsonlLine(file: string, jsonText: string, limits?: JsonlLedgerLimits): Promise<JsonlAppendResult>;
export function readJsonlLedger<T>(file: string, parse: (raw: string) => JsonlParseResult<T>, limits?: JsonlLedgerLimits): Promise<JsonlReadResult<T>>;
export function jsonlSegmentFiles(file: string, rotations?: number): string[];
```

- **追加/串行/轮转**：先 `mkdir(dirname,{recursive:true})`；按“当前大小 + 本次字节数 > maxBytes”在追加前轮转；`appendFile` UTF-8 `flag:"a"`；按**绝对路径**维护进程内串行 Promise 链（同文件不交错，不同账本互不阻塞；链尾清理同 `task-state.ts`）；失败**不抛**，返回结构化结果（`cause` 保留原错误供消费方记诊断）。
- **轮转（`.N` 最旧 … `.1` 最新，无后缀为当前）**：`i=N..1` 依次 `rename`——`i=1` 时当前文件移到 `.1`；`i>1` 时 `.i-1` 移到 `.i`（后移覆盖旧 `.N`）；`ENOENT` 容忍；`unlink(file.N+1)` 为**越界份防御性清理**（正常轮转不产生，仅清历史遗留，`ENOENT` 容忍）。读取顺序 `.N`→…→`.1`→当前 即旧→新。默认 5 MiB / 3 份，可由调用方传参；**env 解析留在消费方**。
- **读取**：`.N` … `.1` … 当前（旧→新）；跳过空行；`JSON.parse` 失败或 parser 拒绝 ⇒ `errors` + `badLines++`；parser 返回 `ignore` ⇒ `ignoredLines++`；文件级读失败（非 `ENOENT`）⇒ `errors`（`line=0`）后继续；`ENOENT` 跳过；`files` 为参与读取的段名（当前文件恒在列，轮转段仅存在者入列）。
- **路径参数化**：helper 只接受调用方传入的绝对 `file`；`TASKS_STATE_REL`/`CUSTOMER_DIRECTIVES_REL` 仍由消费方各自定义。防御：`jsonText` 含裸 `\r`/`\n` ⇒ `{ok:false,code:"multiline"}`（`JSON.stringify` 调用方不可达）。

### 1.2 与 `task-state.ts` 现有行为的等价点清单 [事实 + 设计候选映射]

1. 路径与 API 不变：`tasksStatePath(projectRoot)` 仍由 `task-state.ts` 计算并传入；公开函数签名不变。
2. 默认值与 env 不变：5 MiB / 3 份；`ANS_TASKS_MAX_BYTES`/`ANS_TASKS_ROTATIONS` 仍由 `task-state.ts` 的 `limits()` 解析，非法/空值回退同现状。
3. 轮转时机/顺序不变：追加前按当前大小 + 本次行字节数判定；`i=N..1` 后移（`i=1` 当前→`.1`，`i>1` `.i-1`→`.i`），**`.N` 最旧、`.1` 最新**；`unlink(file.N+1)` 仅作越界份防御性清理（`task-state.ts:253-257`，`ENOENT` 容忍），不参与正常轮转的“删除最老”语义；行仍为 `JSON.stringify(event)+"\n"`。
4. 追加方式不变：递归建目录、`appendFile` UTF-8 `flag:"a"`、行内无裸换行。
5. 串行与失败语义不变：同一路径只有一条链；`previous.then(...)`；链尾清理；失败不抛，返回 `{ok:false,message}`；`task-state.ts` 仍以原组件名/事件名 `tasks.append.failed` 记录诊断（helper 不导入 `diagnostics.ts`）。
6. 读取/坏行不变：旧→新；空行跳过；坏 JSON/字段校验失败按“basename + 1 起行号”记错；文件级读失败 `line=0` 后继续；当前文件恒入 `files`。
7. 重放语义不变：helper 只做存储读取与计数；`task-state.ts` 仍用自己的 `validateEvent`/`replayTaskEvents`；未知 kind 在 task-state 仍按错误（其 parser 不返回 `ignore`），directive Provider 才按 `ignore` 计数。
8. 副作用与公开常量不变：读取不建目录/文件、不写诊断；`tasks.read.partial` 仍由 `task-state.ts` 在 `errors.length>0` 时记录；`TASKS_STATE_REL`/默认常量/env 名保留不变。

### 1.3 `test/项目管理/shared/jsonl-ledger.test.ts` 覆盖 [设计候选]

追加（建目录、单行精确、多行有序）；串行并发（N 路全部落盘、无交错/丢失）；轮转（恰好等于上限不轮转、跨阈值轮转；**命名断言：轮转后当前→`.1`、原 `.i-1`→`.i`，`.1` 最新、`.N` 最旧**；**读取顺序断言 `.N`→…→`.1`→当前 为旧→新**；**预置 `.N+1` 后轮转被 `unlink` 清理**；`rotations=1`；轮转段缺失）；读取（空文件/不存在/仅轮转段/尾随换行/CRLF、旧→新、`files` 语义）；坏行（坏 JSON、parser 拒绝、`ignore`、文件级读失败、行号/basename）；路径参数化（两路径独立链/轮转）；limits 传参；`multiline` 防御；临时目录用后清理，不指向仓库真实 `.ans`。

### 1.4 `shared-components.md` 登记字段 [设计候选]

新增“组件 10：共享 JSONL 账本辅助（`jsonl-ledger`）”，按现行五栏：**名称与用途**（追加/轮转/旧→新回放/坏行计数的单一实现，消除 `task-state.ts` 与 directive Provider 的第二份轮转/原子追加）；**代码与公共入口**（上述导出）；**属主与消费方**（属主：项目管理；消费方：编排 `task-state.ts`（B1 同变更迁移）与 `src/provider/directive/`（B1），只读导入、不得复制第二份）；**契约与示例**（行为/错误/limits/路径参数化/纯 Node/渲染侧不得导入）；**测试与变更影响**（`jsonl-ledger.test.ts`；迁移后 `task-state` 等价回归由 B1 在 `test/编排/` 执行；共享行为变更使两个消费方证据失效）。追加 2026-11-03 变更条目。

### 1.5 退路 B：判定条件与披露要求 [设计候选]

- **触发条件（任一，不得以工期为由）**：A 无法在不改变 `task-state.ts` 公开行为、不弱化既有断言的前提下做到 §1.2 等价；或 helper 无法保持纯 Node/零运行层依赖；或 P1 审核要求退回 B。
- **做法**：不写 `jsonl-ledger.ts` 与其测试、不碰 `task-state.ts`；由编排在 `src/provider/directive/` 自带等价实现并写独立测试；`shared-components.md` **不登记**该组件、不声称单一来源。
- **披露**：E1 写明 A/B 实际路径、退回理由与失败证据（失败项/审核条件）、B 实现路径/测试、`task-state.ts` 零改动证明；B 的验收证据口径按 **V1 §九.6** 原文执行（Provider 独立实现/独立测试 + `task-state` 零改动证明），**不改 V1 文本/版本**；E2 记录。方案语义不变。

## 2. A3：i18n 契约

### 2.1 [事实] 现状与属主依据

- 目录唯一写入者为项目管理：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`；当前 **1642 key**（`ui` 1001 / `main` 576 / `shared` 62 / `preferences` 3）；`test/项目管理/shared/i18n.test.ts` 以分区计数 + parity + 英文零 Han + 占位符一致钉死。
- 属主依据：2026-10-23 i18n 团队计划（PM 先补 key、消费方迁移，allowlist 逐批收紧）；2026-10-31 shell 升级 A3 先例（`SHELL_ESCALATION_KEYS` 由 A3 冻结清单，C1/C2 只消费，新增/改名回 PM 并同步断言与计数）。

### 2.2 [设计候选] key 集合（语义类别；逐 key 清单在 A3 冻结）

| 类别 | key 域（示例） | 必须覆盖的文案 |
| --- | --- | --- |
| 回执 | `main.directive.receipt.*` | 四条精确模板（§2.3）+ `noConsumerSuffix`（domain/path“已记录；当前版本暂无对应审批消费点，不影响执行”） |
| 应用结果行 | `main.directive.applied.*` | 放行一次、代选推荐项、拒绝；均含 `{id}` 且写明“客户指令，不是客户本人点击” |
| 决策冲突/不匹配 | `main.directive.decision.*` | 冲突 `#d-x vs #d-y` 未代选；未匹配到唯一选项未代选 |
| 指令面板 | `ui.directive.panel.*` | 标题、审批/决策两面板、生效中/已撤销/已消费/已失效、状态、消费者（`shell-gate`/`decision-card`/`暂无消费者`）、期限三档、撤销、空态、`ledgerErrors`、`(id, createdAt)` |
| 确认面板 | `ui.directive.dialog.*` | 原文/动作/范围/资源/期限字段、高危横幅与勾选、确认/取消、未识别片段、字段无效、两开关状态、项目级范围说明 |
| 高危原因 | `ui.directive.highRisk.*` | §4.3 七类可判定原因（forever、项目级拒绝、项目级选择偏好、通配域名、宽路径、宽命令、Q7 A 下开关关闭的项目级 select-recommended） |
| 错误 | `ui.directive.error.*` / `main.directive.error.*` | 面板不可用、取消、写盘失败、带图拒绝、解析不完整、撤销不存在/已消费/已撤销/已失效/跨 target、高危未勾选、账本不可用、已有待确认面板 |
| 卡内指令入口（P1-CAP-17） | `ui.directive.cardEntry.*` | 三张 shell 卡页脚入口标签、展开/折叠、输入提示、提交/取消、打开面板、提交/确认状态、未命中/无有效目标/提交失败错误、待答 shell 卡徽标/说明；C2 按 key 消费，不硬编码 |
| 能力不可用/旧版本主进程 | `ui.directive.error.*` | `directivesEnabled` 未推送或旧 preload 缺所需方法时的入口禁用说明（“指令能力不可用/旧版本主进程”）；C2 按 key 消费，不硬编码 |
| Q9 归属 | `ui.versionDecision.decidedBy.directive` | “客户指令代选，不是客户本人点击”（en-US 对应） |

- 规则：zh-CN 为 key 全集参考；en-US `satisfies Record<MessageKey, MessageTemplate>` 强制成对；占位符一致；en-US 零 Han；key 仅小写 ASCII/数字/点/连字符；不新增别名；**A3 不写死 UI 文案**，C2/桌面窗口只经 key 取词（AC-17“无硬编码”行为证据在 C2）。回执参数只允许 `{id}`（及有界摘要），**不得传 `rawText`**。

### 2.3 [设计候选] 四条回执精确模板（AC-5）

| key | zh-CN | en-US |
| --- | --- | --- |
| `main.directive.receipt.approvalCreated` | `已记录审批指令 #{id}` | `Approval directive #{id} recorded` |
| `main.directive.receipt.decisionCreated` | `已记录决策指令 #{id}` | `Decision directive #{id} recorded` |
| `main.directive.receipt.approvalRevoked` | `已撤销审批指令 #{id}` | `Approval directive #{id} revoked` |
| `main.directive.receipt.decisionRevoked` | `已撤销决策指令 #{id}` | `Decision directive #{id} revoked` |

### 2.4 [设计候选] `i18n.test.ts` 计数更新策略

- 新增 `DIRECTIVE_KEYS`（`as const satisfies readonly MessageKey[]`），断言全部中英存在、占位符一致、en-US 零 Han；与 `SHELL_ESCALATION_KEYS`/`ACCEPTANCE_RETURN_CARD_KEYS`/`GLOBAL_TASK_STATE_KEYS` 同形。
- `DIRECTIVE_KEYS` 覆盖 §2.5 的 `ui.directive.cardEntry.*`；另设 `DIRECTIVE_CARD_ENTRY_KEYS`（14 key，同形 `as const satisfies readonly MessageKey[]`）子清单，断言家族计数 14 与统一前缀，并纳入 parity/占位符/英文零 Han 循环。
- 分区计数与总数**以 A3 实测的实际计数为准**，冻结时显式更新；不预设/猜测数字，不先改断言后补 key。本类别为 14 个 `ui.*` key；若冻结时无其他并发新增，仅作示意 `ui` 1001→1015、总数 1642→1656，**以实测为准**。
- `ui.versionDecision.decidedBy.directive` 纳入 `GLOBAL_TASK_STATE_KEYS`：97→98，`uiVersionDecision` 分组 18→19；其余分组不变。不新增旧治理 key；不添加 O1–O11 文案或 O9 禁用态分支（AC-20/AC-23）。

### 2.5 [设计候选] 卡内指令入口 key 清单（P1-CAP-17，A3 冻结前收口）

C2 的 AC-22 A2 卡内指令入口（`ConfirmCard.tsx` 三张卡页脚）只按以下 key 取词，不在 `.tsx`/store 硬编码用户可见中英文；key 归 `ui.directive.*` 同族，zh-CN 为全集参考，en-US 同 key 成对且零 Han。下表 en-US 为语义示例，精确文案在 A3 冻结时定稿。

| # | key | zh-CN 语义 | en-US 语义（示例） | 占位符 |
| --- | --- | --- | --- | --- |
| 1 | `ui.directive.cardEntry.entryLabel` | 卡片页脚“指令入口”按钮标签 | `Directive entry` | 无 |
| 2 | `ui.directive.cardEntry.expand` | 展开卡内指令输入 | `Expand directive input` | 无 |
| 3 | `ui.directive.cardEntry.collapse` | 收起卡内指令输入 | `Collapse directive input` | 无 |
| 4 | `ui.directive.cardEntry.inputPlaceholder` | 输入 `{approvalMarker}` 或 `{decisionMarker}` 指令 | `Enter a {approvalMarker} or {decisionMarker} directive` | `approvalMarker`、`decisionMarker` |
| 5 | `ui.directive.cardEntry.submit` | 提交 | `Submit` | 无 |
| 6 | `ui.directive.cardEntry.cancel` | 取消（折叠/清空输入，不回答 shell 卡） | `Cancel` | 无 |
| 7 | `ui.directive.cardEntry.openPanel` | 打开指令面板 | `Open directive panel` | 无 |
| 8 | `ui.directive.cardEntry.status.submitting` | 正在提交… | `Submitting…` | 无 |
| 9 | `ui.directive.cardEntry.status.confirmOpened` | 确认对话框已打开；本卡仍待答 | `Confirmation dialog opened; this card is still awaiting your response` | 无 |
| 10 | `ui.directive.cardEntry.error.notDirective` | 仅接受以 `{approvalMarker}` 或 `{decisionMarker}` 开头的指令 | `Only directives beginning with {approvalMarker} or {decisionMarker} are accepted` | `approvalMarker`、`decisionMarker` |
| 11 | `ui.directive.cardEntry.error.invalidTarget` | 卡内缺少有效目标（缺失或非法），指令入口不可用；不回退当前选择 | `This card has no valid target (missing or invalid), so the directive entry is unavailable; it does not fall back to the current selection` | 无 |
| 12 | `ui.directive.cardEntry.error.submitFailed` | 指令提交失败，请重试 | `Directive submission failed. Try again.` | 无 |
| 13 | `ui.directive.cardEntry.pendingShell.badge` | shell 卡待答 | `Shell card pending` | 无 |
| 14 | `ui.directive.cardEntry.pendingShell.note` | 指令面板打开期间 shell 卡仍待答；关闭面板后可继续回答 | `The shell card stays pending while the directive panel is open; close the panel to answer it` | 无 |

- `{approvalMarker}`/`{decisionMarker}` 由 C2 传入 A1 标记常量值（按数据渲染）；模板内不写死中文标记，en-US 模板保持零 Han。
- 能力不可用/旧版本主进程复用 §2.2 的 `ui.directive.error.*` 能力不可用 key（面板入口与卡内入口同词），不在本类别建别名。
- `error.notDirective`/`error.invalidTarget`/`error.submitFailed` 为 fail-closed 行内错误：不发送未命中输入、不产生聊天气泡、不显示原始异常文本、不伪造回执。
- `pendingShell.badge`/`pendingShell.note` 用于指令面板顶部只读提示；不改变 shell 卡状态、不自动关闭/合并、不计入 `pendingCount/pendingRoles/judgingCount`。
- C2 只按上述 key（及 §2.2 其余 `ui.directive.*`）取词；缺 key 即停止回报，不硬编码或自造 key。本类别 14 key 不新增 `main.*`/`shared.*`/`preferences.*`，不新增文件/依赖/目录。

## 3. 精确写集（仅既有授权）

| 路径 | 新/改 | 授权依据 |
| --- | --- | --- |
| `src/common/shared/jsonl-ledger.ts` | 新 | Section 1 目录（私有）`src/common/shared/` |
| `test/项目管理/shared/jsonl-ledger.test.ts` | 新 | Section 1 目录（测试）`test/项目管理/shared/` |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 改 | 同上 `src/common/shared/` |
| `test/项目管理/shared/i18n.test.ts` | 改 | 同上 `test/项目管理/shared/` |
| `角色卡/项目管理/docs/architecture/shared-components.md` | 改 | Section 1 目录 `角色卡/项目管理/docs/architecture/` |
| `角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md` | 新 | Section 1 目录 `角色卡/项目管理/docs/change/` |

- **不写**：`src/model/**`、`src/common/编排/**`、`src/pipeline/**`、`src/provider/**`、`src/service/**`、`app/**`、其他 `test/` 目录、`package.json`/锁/`tsconfig*`/`vite.config.ts`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界/其他角色文档。**不新增依赖/目录；不启用 O1–O11。**

## 4. AC-1..AC-24 映射（项目管理 A2/A3 贡献与消费点）

| AC | 项目管理贡献 | 其他角色消费/证据点 |
| --- | --- | --- |
| **AC-5** | **A3 四条回执精确模板；参数仅 `{id}`、不含原文** | C1 系统行；D1/D2 截图 |
| **AC-6** | **A2 追加/轮转/旧→新读取/坏行计数契约；A1 schema；B1 Provider/Service** | B1 单测+账本样例；D1 |
| **AC-16** | **A2 坏行/文件读失败计数、不抛、主路径继续的契约** | B1/C1 故障注入；D1/D2 |
| **AC-17** | **A3 全部新增 key 中英成对/parity/零泄漏；C2 只消费** | C2 UI 测试/截图；D1 |
| **AC-18** | **A2/A3 候选哈希、原始测试输出、冻结声明** | D1/D2/E1/E2 |
| AC-1/3/4/13/22 | A3 识别/面板/取消/高危/两面板分组与项目切换文案（AC-13 以 Q7 A 为前提，见 V1） | A1 解析器/谓词；C1 拦截/复核；C2 UI；D2 截图 |
| AC-10/11/12/15/24 | A3 `decidedBy.directive`、期限/撤销/旧读者文案；A2 提供 task-state 等价清单 | A1/B1/C1 四处归属；B1 回归；C1 面板/审计；D2 |
| AC-2/7/8/9/14 | 无共享面（i18n 仅有消费者标签） | C1/B1/A1 各自测试 |
| AC-19/20/21/23 | A2/A3 只加法、基线 `4c3a6e4`、按 Q9 A 写“客户指令”、不添加 O1–O11/O9 分支 | 统筹 E1 披露；E2 核对闸门记录与范围 |

## 5. T3 验证与冻结

- **退出检查 [设计候选]**：`node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"`（**Revision 1 复跑实测**：10 文件 / 158 tests / 153 pass / 0 fail / 5 skipped / 0 todo，exit 0；A2 新增 `jsonl-ledger.test.ts` 后预计 11 文件，新增用例数在实施/冻结时按实际运行输出记录、不预设）+ `npm run typecheck`（B0 exit 0）；记录命令、环境、退出码、pass/fail/skip/todo、失败原文。
- **候选哈希**：每文件 `git hash-object` + `sha256sum`（新增/改动/本提案）；`git status --short` 仅写集内；`git diff --cached --name-only` 为空；不 commit/push。
- **冻结声明**：A2 冻结 `jsonl-ledger` 导出/行为/错误/limits/路径参数化契约；A3 冻结 key 清单与**实测**计数。冻结后 B1/C1/C2 只消费；变更须回 PM 并重跑受影响证据。
- **`task-state` 等价回归**：由**编排（B1）在同一变更内**执行（`test/编排/` 的 task-state 系列 + T3 全量）；本角色提供 §1.2 等价清单与 `jsonl-ledger.test.ts` 基线，不写 `src/common/编排/**` 或 `test/编排/**`。失败按 §1.5 退路 B 处置并披露。
- **消费者重测**：B1（task-state + directive Provider）、C1/C2（i18n 消费）；D1 执行 T3 全量；本角色只交 A2/A3 层证据。

## 6. 边界、依赖与顺序

- **[事实]** Section 1 已覆盖上述全部路径；本任务**不需要 B-1..B-4**（属运行时核心/编排/桌面窗口）。基线 `4c3a6e4`，未启用 task_ops，不伪造令牌/锁/审批。
- **[设计候选]** 顺序：A1/A2/A3 在 P1 审核通过后并行；**A2/A3 先冻结**；B1 消费 A1+A2；C1 消费 A1+B1+A3；C2 消费 C1+A3。共享文件单写者；不并发写其他角色路径。
- 本提案不触及 Q5/Q9 结论、账本位置、target/期限/消费者优先级；不改变闸门 1 语义。

## 7. P1 审核安排

- 本提案**不写审核记录**（团队计划中的 `...-P1-review.md` 不在本次写权内）。
- 审核将在**全部角色提案完成后**由项目管理角色**单独执行**：只读审核方案/团队计划/V1/B0/各提案，按 `references/proposal-review.md`，结论三选一：`recommend approval` / `needs revision` / `not ready`。审核不写产品代码、不代改提案。

## 8. 披露与需统筹裁决事项（无阻断停止项）

1. **[事实] 方案版本漂移**：任务说明引用 P1.1（1199 行 / `7875ad6a…`），当前磁盘为 P1.2（1209 行 / `1748ad2d…`，R1/R2 编辑性收口）；V1 §1.2.1 已版本注记并声明语义不变。本提案按“P1.1 确认版 + P1.2 等价映射”引用，非实质冲突。
2. **`ui.versionDecision.decidedBy.directive`** 未在团队计划 A3 示例 key 家族中逐字列出，但方案 §9.2/AC-10/AC-15 要求；属既有 i18n 目录与 `i18n.test.ts` 写权内，本提案纳入 A3，请统筹确认无异议。
3. **`test/项目管理/shared/i18n-guard-allowlist.ts`** 在团队计划 PM 写集中未逐条列出（在 Section 1 目录内但不在本任务逐项写集）。A3 冻结时确认新增 C1/C2 文件（`app/desktop/**`、`app/renderer/**`）保持零 Han，则不必改；若实施确需新增 allowlist 条目，**停止回报统筹/闸门 2，不自行扩写集**（P1-CAP-09）。
4. **P1-CAP-17（非阻断，A3 冻结前条件）** 已按 §2.5 收口：新增 `ui.directive.cardEntry.*` 类别（14 key），纳入 `DIRECTIVE_KEYS`/家族计数/parity；C2 按 key 消费。不新增写集/文件/依赖；与 P1-CAP-18 的严格 fail-closed 口径一致（`error.invalidTarget` 明确不回退当前选择），但 P1-CAP-18 本身由 C2 处置。
5. 无其他停止项：不需要计划外新文件/新依赖/新写集；未发现方案/团队计划实质冲突。

## 9. 修订记录（Revision 1）

- **依据**：P1 审核 193 行 / `65f888a6…`（`needs revision`）；团队计划 §十三（664 行 / `ecac818c…`，仅 C2 写集增补，不影响 A2/A3）；沟通记录 W-1 裁决 A（当前 168 行 / `9f19821e…`）。本修订只改本提案；未改产品/测试代码、其他角色文档、角色卡/边界/调度/验收/沟通；未 commit/push。

| 发现 | 处置位置 | 测试/证据 | 状态 |
| --- | --- | --- | --- |
| P1-CAP-02（阻断，A2） | §1.1 轮转 / §1.2 第 3 条 / §1.3 轮转用例 / §5 退出检查 | `task-state.ts:233-258`、`:650-699`；基线复跑 158/153/0/5/0，exit 0 | 已处置 |
| P1-CAP-09（非阻断，A3 冻结前条件） | §2.2 新增 key 类别 / §8 第 3 项 | C2 §五/§六/§十.4；审核 §四第 11 行 | 已处置 |
| P1-CAP-10（非阻断） | §1.5 披露 | V1 §九.6；团队计划 §10.2 | 已处置 |

- **P1-CAP-02（阻断，A2）— 已处置**：§1.1 轮转改为 **`.N` 最旧、`.1` 最新**（`i=1` 当前→`.1`；`i>1` `.i-1`→`.i`；`unlink(file.N+1)` 仅越界份防御性清理）；§1.2 第 3 条按 `task-state.ts:233-258` 实际后移/清理口径重写；§1.3 轮转用例增加命名断言（当前→`.1`、`.1` 最新、`.N` 最旧）、读取顺序 `.N`→…→`.1`→当前（旧→新）、`.N+1` 清理断言。证据：只读核对 `task-state.ts:233-258`（轮转）与 `:650-699`（`readTaskState` 按 `rotations..1` 后读当前）。复跑基线（2026-11-03，HEAD `4c3a6e4`）：10 文件 / 158 tests / 153 pass / 0 fail / 5 skipped / 0 todo，exit 0；新增测试文件计数在实施/冻结时按实测记录。
- **P1-CAP-09（非阻断，A3 冻结前条件）— 已处置**：§2.2 新增“能力不可用/旧版本主进程”类别（归 `ui.directive.error.*`），明确 C2 按 key 消费；§8 第 3 项改为“新增 C1/C2 文件零 Han 则 `i18n-guard-allowlist.ts` 不改；若确需新增条目，停止回报统筹，不自行扩写集”。
- **P1-CAP-10（非阻断）— 已处置**：§1.5 退路 B 披露改为“按 V1 §九.6 提供 Provider 独立实现/独立测试 + `task-state` 零改动证明，不改 V1 文本/版本”；E1 披露实际路径与失败证据。
- **未改项（保留已通过内容）**：共享 JSONL A 契约（§1.1/§1.2 其余条目、§1.4 登记、§3 写集）；i18n 四条回执模板（§2.3）、计数策略（§2.4）与属主依据（§2.1）；精确写集仍仅 `src/common/shared/jsonl-ledger.ts`、`test/项目管理/shared/jsonl-ledger.test.ts`、i18n messages、`i18n.test.ts`、`shared-components.md`（§3）。未新增文件/依赖/写集，未启用 O1–O11，未改 Q5/Q9。
- **输入版本说明**：任务书给定的沟通记录快照 150 行 / `5d2858cd…` 早于 P1 审核/W-1 裁决追加；当前磁盘 168 行 / `9f19821e…`，本修订以当前记录为准（非阻断）。方案 P1.1/P1.2 与 V1 版本口径不变。
- **停止项/需裁决事项**：本修订无新增停止项；P1-CAP-08/W-1 已由闸门 2 增补（团队计划 §十三，C2 写集）处置，不属 A2/A3；A2/A3 无待统筹裁决事项，建议按审核 §八 对 A2/A3 作窄复审。

## 10. 修订记录（Revision 2）

- **依据**：P1 审核记录当前 **306 行 / `8427ff02…`**（含 Revision 1 窄复审与 P1-CAP-15..18），其中 **P1-CAP-17（低，非阻断，A3 冻结前条件）** 由本提案处置；C2 修订稿 **162 行 / `40c47efd…`** §六要求 A3 纳入 AC-22 卡内入口 key；团队计划 §十三 **664 行 / `ecac818c…`**（仅 C2 写集，本修订不改写集）。
- **范围**：本修订**仅**做 A3 key 增补，不重写全文、不改 A2 契约。**P1 审核角色部分不在本修订范围**（审核记录另有其文件与版本，由审核 owner 维护）；P1-CAP-15（C1）、P1-CAP-16（C2）、P1-CAP-18（C2）均由各自 owner 处置，本提案不代改。未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling/`/`docs/acceptance/`/`docs/communication/`；未 commit/push。
- **输入漂移**：任务书沟通快照 168 行 / `9f19821e…`；当前磁盘 174 行 / `80b9170d…`，仅追加“提交/合并预授权”一节，不影响 A2/A3；非阻断。

| P1-CAP-17 要素 | 处置位置 | 内容 | 验证（计划） |
| --- | --- | --- | --- |
| key 类别 | §2.2 | 新增 `ui.directive.cardEntry.*`，与 `ui.directive.panel/dialog/highRisk/error.*` 同族 | 命名前缀检查 |
| 具体 key | §2.5 | 14 key：入口/展开/折叠/占位/提交/取消/打开面板/提交中/确认已打开/未命中/无效目标/提交失败/待答徽标/待答说明 | `DIRECTIVE_CARD_ENTRY_KEYS`（14） |
| 计数与 parity | §2.4 | 纳入 `DIRECTIVE_KEYS` 与通用循环；分区/总数按 A3 实测更新（14 个 `ui.*`，示意 1001→1015、1642→1656） | `i18n.test.ts` |
| C2 消费 | §2.5 | 按 key 取词、不硬编码；缺 key 停止回报；能力不可用复用 `ui.directive.error.*` | C2 AC-17/AC-22 证据 |

- **P1-CAP-17 结论**：**已处置**（A3 冻结前条件收口）；新增 14 个 `ui.*` key，不新增文件/依赖/目录，§3 精确写集不变（i18n messages 与 `i18n.test.ts` 已在写集）。
- **保留项**：Revision 1 的 A2 轮转修正（`.N` 最旧、`.1` 最新）、完整 JSONL 契约（§1.1–§1.5）、四条回执精确模板（§2.3）、§2.4 既有计数口径（实测计数、不预设数字）与 §3 精确写集均保持不变；本修订仅在 §2.4 追加 cardEntry 子清单/示意。不新增别名、不启用 O1–O11、不改 Q5/Q9。
- **停止项**：无新增停止项。`i18n-guard-allowlist.ts` 仍按“新增 C1/C2 文件零 Han 则不改；若确需新增条目，停止回报统筹/闸门 2”口径（P1-CAP-09）。

**本文件状态：P1 提案 Revision 2（只读设计；仅 A3 key 增补）；未实施、未验收、未 commit/push（Revision 1 仅复跑既有基线测试，见 §9/§10）。**
