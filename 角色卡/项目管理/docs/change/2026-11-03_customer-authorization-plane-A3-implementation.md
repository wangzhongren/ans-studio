---
id: customer-authorization-plane-a3-implementation
type: change
title: 客户授权平面 A3 实施记录：i18n key 契约
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related: [customer-authorization-plane]
events:
  - date: "2026-11-03"
    kind: created
    summary: 按 P1 提案 Revision 2 与审核 recommend approval 实施客户指令 i18n key 104 个（含 cardEntry 14）；更新 i18n.test.ts 实测计数/parity/占位符/零 Han 断言；采集证据
---

# 客户授权平面 A3 实施记录：i18n key 契约

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：项目管理（固定角色；本上下文只承担该角色，不切换）/ 团队计划 §5.1 **A3（i18n 契约）**。
- **状态**：**`implemented-unverified`**。实施完成、证据已采集；**未验收、未 commit/push**，不替代 D1/D2/E2。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；本节点开工时 `git status --porcelain -- src app test` **为空**（实测）。实施期间运行时核心（A1）在同一 worktree 并发写入未提交的 `src/model/**`、`test/runtime-core/directive-*.test.ts`；A3 未触碰这些路径，全仓 typecheck 的 1 项红为 A1 加法类型的下游消费方（B1 写集），见 §五。
- **输入版本 [事实]**：P1 提案 Revision 2 **215 行 / `bc630843673d1b8fd7c77e07a85874e8b86e8abd9c471eb2b40881aab637cff1`**；P1 审核记录 **397 行 / `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`**（`recommend approval`）；团队计划 **664 行 / `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8`**；方案 P1.1 **1199 行 / `7875ad6a…`**（冲突以此为准）；P1.2 **1209 行 / `1748ad2d…`**（编辑性等价）；V1 **1171 行 / `51ac0f50…`**；B0 **239 行 / `f1c54f09…`**。
- **现状基线 [事实]**：实施前目录 **1642 key**（`ui` 1001 / `main` 576 / `shared` 62 / `preferences` 3），`GLOBAL_TASK_STATE_KEYS` 97（projectState 62 / uiVersionDecision 18 / mainVersionDecision 17）。

## 一、实施内容

| 路径 | 新/改 | 行数 | 字节 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 改（追加 104 key） | **2188** | 168,874 | `7511b17bcd71b1e3a598f3fb864ba4c6ea0ea351` | `6dafeb5983fac78336063e669aaba44434eabeae06c6c6a511f537d7eb3c3b6a` |
| `src/common/shared/i18n/messages/en-US.ts` | 改（追加 104 key） | **2456** | 181,019 | `b4d352513b4db535a1de8501efa883c63b255026` | `8c0d15bd40d5bdbb629a75511dfb1b1fe284b1e7d8d8de86e3cea7e24c876602` |
| `test/项目管理/shared/i18n.test.ts` | 改（`DIRECTIVE_KEYS`/`DIRECTIVE_CARD_ENTRY_KEYS`/计数/parity） | **618** | 29,741 | `1de9f5a37e71454110384a3f74eed729bccd36c6` | `62b04e8c42bf1548606e9412c981e42baca073324980e76d23c6eff220e1a80a` |
| `角色卡/项目管理/docs/architecture/shared-components.md` | 改（组件 10 登记 + 变更条目） | **216** | 49,025 | `2d460d5031d000d9cebb75bc8aeb64c80f99d741` | `dd33fdf7805e1ca08c60cf62b804b4f20b6dd7d5c9d4632431706bbaeeca6339` |

- **写前（HEAD 内容）哈希 [事实]**：
  - `zh-CN.ts`：`git hash-object` `b5cb538ad4942d27058ac8b892998b06299f7994` / SHA-256 `38ad6072e5a082e29b9482f7ce8fba7d0a7238e8cc93c66aa40ab57687f1b07d`。
  - `en-US.ts`：`aaf3736374a058cccd40ffe1fa4f2f99f56110bc` / `8116c2a13df09efff582895efd9a8ea840679aa8f8332420b907291a27e88f1f`。
  - `i18n.test.ts`：`86b8855a9d675d0d66a5533f9e8bbf0eabfd04ad` / `4448937d7965a7bfa07972c000725b997b4e4c9715aa8580f38d3a1361ba120f`。
  - `shared-components.md`：`5e29b161b894da485dbb445db190b5eb1b3427eb` / `883081a87274941dccc027f551e115d1a9e2e827ff411f51c58b6015be74466f`。

### 1.1 A3 冻结 key 集合（104 key）

| 类别 | key 域 | 数量 | 覆盖 |
| --- | --- | ---: | --- |
| 回执 | `main.directive.receipt.*` | 5 | 四条精确模板（见 §1.2）+ `noConsumerSuffix`（domain/path 如实状态） |
| 应用结果行 | `main.directive.applied.*` | 3 | 放行一次、代选推荐项、拒绝；均含 `{id}` 与「客户指令，不是客户本人点击」 |
| 决策冲突/不匹配 | `main.directive.decision.*` | 2 | 冲突 `{ids}` 未代选；未匹配唯一选项 `{id}` 未代选 |
| 主进程错误行 | `main.directive.error.*` | 5 | 带图拒绝、写盘失败、账本不可用、撤销失败 `{id}{reason}`、提交失败 `{reason}` |
| 指令面板 | `ui.directive.panel.*` | 22 | 标题、审批/决策两面板、生效/已撤销/已消费/已失效、历史组、消费者（shell-gate/decision-card/暂无消费者）、期限三档与失效提示、撤销、空态、`ledgerErrors`、`(id, createdAt)`、关闭 |
| 确认对话框 | `ui.directive.dialog.*` | 30 | 标题、原文/动作/范围/资源/期限/撤销目标字段、动作五项、范围三项与项目级说明、资源三项、高危横幅与勾选、未识别片段、字段无效、两开关状态、确认/取消 |
| 高危原因 | `ui.directive.highRisk.*` | 8 | §4.3 七类可判定原因 + 未知原因 `{reason}`（forever、项目级拒绝、项目级选择偏好、通配域名、宽路径、宽命令、开关关闭时项目级 `select-recommended`） |
| UI 错误 | `ui.directive.error.*` | 14 | 面板不可用、取消、写盘失败、带图拒绝、解析不完整、撤销不存在/已消费/已撤销/已失效/跨 target、高危未勾选、账本不可用、已有待确认面板、能力不可用/旧版本主进程 |
| 卡内指令入口（P1-CAP-17） | `ui.directive.cardEntry.*` | 14 | 入口/展开/折叠/占位/提交/取消/打开面板/提交中/确认已打开/未命中/无效目标/提交失败/待答徽标/待答说明 |
| Q9 归属 | `ui.versionDecision.decidedBy.directive` | 1 | 「客户指令代选，不是客户本人点击」 |
| **合计** | — | **104** | 88 `ui.directive.*` + 15 `main.directive.*` + 1 `ui.versionDecision.decidedBy.directive` |

- **规则**：zh-CN 为 key 全集参考；en-US `satisfies Record<MessageKey, MessageTemplate>` 强制成对；占位符一致；en-US 零 Han；回执参数只允许 `{id}`（及有界摘要），**不得传 `rawText`**；`{approvalMarker}`/`{decisionMarker}` 由 C2 传入 A1 标记常量值（按数据渲染），模板内不写死中文标记。
- **能力不可用/旧版本主进程**（P1-CAP-09）：`ui.directive.error.capabilityUnavailable`（面板入口与卡内入口同词，不建别名）；C2 按 key 消费。
- **卡内入口**（P1-CAP-17）：`DIRECTIVE_CARD_ENTRY_KEYS` 子清单 14 key，全部 `ui.directive.cardEntry.` 前缀，纳入 `DIRECTIVE_KEYS`/parity/占位符/零 Han 循环与家族计数。
- **Q9**：`ui.versionDecision.decidedBy.directive` 纳入 `GLOBAL_TASK_STATE_KEYS`（97→98；`uiVersionDecision` 18→19；projectState 62 / mainVersionDecision 17 不变）。

### 1.2 四条回执精确模板（AC-5）

| key | zh-CN | en-US |
| --- | --- | --- |
| `main.directive.receipt.approvalCreated` | `已记录审批指令 #{id}` | `Approval directive #{id} recorded` |
| `main.directive.receipt.decisionCreated` | `已记录决策指令 #{id}` | `Decision directive #{id} recorded` |
| `main.directive.receipt.approvalRevoked` | `已撤销审批指令 #{id}` | `Approval directive #{id} revoked` |
| `main.directive.receipt.decisionRevoked` | `已撤销决策指令 #{id}` | `Decision directive #{id} revoked` |

## 二、实测计数（以本机实际运行为准）

| 项 | 实测值 |
| --- | --- |
| 分区计数 | `ui` **1090** / `main` **591** / `shared` **62** / `preferences` **3** |
| 总计 | **1746**（基线 1642 + 104） |
| `ui.directive.*` | 88 |
| `main.directive.*` | 15 |
| `ui.directive.cardEntry.*` | 14 |
| 指令相关 key（含 `ui.versionDecision.decidedBy.directive`） | 104 |
| en-US 总数 / parity | 1746 / **true** |
| `GLOBAL_TASK_STATE_KEYS` | **98**（projectState 62 / uiVersionDecision 19 / mainVersionDecision 17） |

原始输出见 `09-key-counts.txt`。未预设示意数（P1 提案的 1001→1015/1642→1656 仅为示意，未采用）。

## 三、验证与原始结果

| # | 命令 | 结果 | 原始日志 |
| --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/项目管理/shared/i18n.test.ts"` | **11 tests / 11 pass / 0 fail / 0 skipped / 0 todo，exit 0**（2026-11-03T14:53:59+0800，102.1748 ms） | `02-tests-i18n.log` |
| 2 | `node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"` | **11 文件 / 175 tests / 170 pass / 0 fail / 5 skipped / 0 todo，exit 0**（7,898.8658 ms）；对照 B0 基线 10 文件 / 158 tests / 153 pass / 0 fail / 5 skip：新增 A2 文件 16 例 + 本文件 1 例，**新增确定性失败 0、新增 skip 0** | `03-tests-project-shared-group.log` |
| 3 | `npx tsc --noEmit --ignoreConfig <项目 compilerOptions> src/common/shared/jsonl-ledger.ts src/common/shared/i18n/index.ts test/项目管理/shared/jsonl-ledger.test.ts test/项目管理/shared/i18n.test.ts` | **exit 0**（A2/A3 写集范围内 0 类型错误） | `05-typecheck-scoped-a2a3.log` |
| 4 | `npm run typecheck`（全仓） | **exit 1**：`src/common/编排/version-decision.ts(435,7): error TS2322`（`RequestResolvedEvent.by` 的 `"directive"` 未在该消费方类型中收口）。该文件**不在 A2/A3 写集**，由运行时核心（A1）并发未提交的 `src/model/runtime.ts` 加法触发，须由编排（B1）同变更更新；A3 文件零错误 | `04-typecheck-full.log` |

- **i18n 断言**：`DIRECTIVE_KEYS` 104 key 全部中英存在、占位符一致、en-US 零 Han；四条回执精确模板与 `{id}` 唯一参数；应用结果行含 `{id}` 与「不是客户本人点击」；冲突/不匹配参数 `{ids}`/`{id}`；卡内入口 14 key 家族计数与前缀；`GLOBAL_TASK_STATE_KEYS` 98。
- **无硬编码用户可见字符串**：A3 只提供共享 key；C1/C2 按 key 消费（AC-17 行为证据由 C1/C2/D1 在实现层给出）。本节点未改 `app/**`。
- **`i18n-guard-allowlist.ts`**：本节点未新增 C1/C2 文件，未改 allowlist；若 C1/C2 实施确需新增 allowlist 条目，按 P1-CAP-09/W-5 **停止回报统筹/闸门 2**，不自行扩写集。
- **环境**：Node `v24.22.1`；npm `11.19.1`；Windows 11 Pro 10.0.26300（MINGW64/Git Bash）；worktree `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane`；时区 Asia/Shanghai。

## 四、写集与候选核对

- 本节点实际写入（产品/测试/架构）：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`test/项目管理/shared/i18n.test.ts`、`角色卡/项目管理/docs/architecture/shared-components.md`；另有本记录与 `2026-11-03_customer-authorization-plane-A3-evidence/`。**未写** `app/**`、`src/model/**`、`src/common/编排/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、其他 `test/` 目录、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication`。
- `git diff --cached --name-only`：**空**（无暂存、未 commit/push）。
- `git status --short` 与 `git diff --name-only` 含其他角色的既有/并发改动（A1 的 `src/model/**`、`test/runtime-core/**`、角色卡边界/变更记录、治理文档）；本节点的候选仅上表四文件（见 `06-git-diff-name-only.txt`、`07-git-status-short.txt`）。

## 五、冻结声明（A3）

- **冻结对象**：本记录 §1.1 的 104 个 key 集合（含 14 个 `ui.directive.cardEntry.*`）与 §2 的**实测计数**：`ui` 1090 / `main` 591 / `shared` 62 / `preferences` 3 / 总计 1746；`GLOBAL_TASK_STATE_KEYS` 98（62/19/17）。
- **消费规则**：C1/C2 只按冻结 key 取词，不硬编码、不自造 key；缺 key 即停止回报统筹/项目管理，不以硬编码或别名绕过。新增/改名/删除须回到项目管理，并同步更新 `i18n.test.ts` 断言与分区计数、重跑证据。
- **性质**：冻结的是 key 集合与计数契约，不是验收结论；AC-17 的“无硬编码”行为证据在 C2，AC-5 回执可见性在 C1/C2/D2。

## 六、披露与停止项

1. **[事实] 并发写入**：实施期间运行时核心（A1）在同一 worktree 写入未提交的 `src/model/**` 与 `test/runtime-core/**`。本节点未触碰这些路径；全仓 `npm run typecheck` 因 A1 加法类型的下游消费方（`src/common/编排/version-decision.ts`，B1 写集）而 exit 1；A2/A3 写集范围 typecheck exit 0。
2. **新增确定性失败 0、新增 skip 0**；5 项 skip 为既有 Windows 平台项，与 B0 一致。
3. **无停止项**：不需要新增文件/依赖/写集；未改断言以保绿；未启用 O1–O11；未 commit/push。

## 七、证据清单

目录：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A3-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment-and-baseline.txt` | 20 | `bf5b976656ae82e5a119337964a16b2550bd1be200e9eeef2d2f06b10fc2fcbd` |
| `02-tests-i18n.log` | 24 | `8e61e11f63674b2cac1e16caba1da913c7ecaf7dce9170a81c1a242b0ce6168b` |
| `03-tests-project-shared-group.log` | 191 | `284d8d2eecbd98947b1ed7698a691e5adf4f372aacc37042f2caf766cd4a8dff` |
| `04-typecheck-full.log` | 11 | `fbfe3273af4b033e32ef65ec7764f157630c28b2cf1ab5e95aadce561248fff4` |
| `05-typecheck-scoped-a2a3.log` | 5 | `156170c79f1beb7005ab87a62a41de5b4a203c07771ee591f78a820d880090a6` |
| `06-git-diff-name-only.txt` | 19 | `f5f308cee419f6ebada81153a974582c42b59b5b88af0af86671a2aa52e1a030` |
| `07-git-status-short.txt` | 39 | `6e71e7007b656f4ffdf0a9b8fe8edcbe81f5eea5a25c2f78c2db78af3b0b7c88` |
| `08-after-hashes.txt` | 7 | `d75bda7f223060719f18278325ed7076399337ed617d6d196cf30b9e59e89366` |
| `09-key-counts.txt` | 17 | `1d2df85e32645631364359c44b21eaf01eda2aa3c176f1f34981dee5898d23af` |
| `10-failure-classification.txt` | 4 | `ee9526b73f648db067d406f31c8c41f080af89adcf1eae7e17c6f087d4afe001` |
| `run-a3-evidence.sh` | 104 | `427211e9bcc512ba08c682fc94121d8ded626634f87a3ed87bb33be25931107a` |

**本文件状态：`implemented-unverified`；未验收、未 commit/push。**
