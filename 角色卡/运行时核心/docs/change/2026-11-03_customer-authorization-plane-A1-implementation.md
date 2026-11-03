---
id: customer-authorization-plane-a1-implementation
type: change
title: 客户授权平面 A1 实施记录（Model 契约/解析器/高危谓词）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - 角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md
events:
  - date: "2026-11-03"
    kind: created
    summary: A1 Model 契约/解析器/高危谓词实施与证据；runtime-core 309/302/3E/4S；全仓 typecheck 剩 1 个 B1 写集内消费点错误
---

# 运行时核心 A1 实施记录：客户指令 Model 契约与解析器

- **任务 / 角色 / 节点**：`2026-11-03-customer-authorization-plane`（flowId `customer-authorization-plane`，T3）；运行时核心；团队计划 §5.1 **A1**（Model 契约/解析器/高危谓词）。
- **日期 / 状态**：2026-11-03；**`implemented-unverified`**。本节点不是验收、不是独立验证；未 commit/push/merge/release。
- **入口**：P1 审核（`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md`，397 行 / `3faef8ee…`）结论 `recommend approval`；客户实施授权已给。
- **冻结基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；A1 开始前 `git status --porcelain -- src app test` 为空（证据 `00b-git-baseline.txt`）。

## 1. 输入与版本（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| A1 P1 提案（Revision 1） | 172 | `f25702918d59cb1ce4b5c51f538c16edbb5c89c26b8915f8152d7e263f0cf8f4` | 最终提案；本实施按其 §2/§3/§6 |
| P1 审核记录 | 397 | `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c` | 结论 `recommend approval` |
| 团队计划（含 §十三增补） | 664 | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` | v1 653/`37e6bd0d…` + §十三 C2 写集增补；A1 写集不变 |
| 方案 P1.2（编辑性等价） | 1209 | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | 冲突以 P1.1（1199/`7875ad6a…`）为准 |
| V1 验收标准 | 1171 | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | AC-1/6/7/10/13/14/15/18/19 |
| B0 基线记录 | 239 | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | runtime-core 282/275/3/4 |
| 沟通记录（A1 期间观察值） | 182 | `03a1586b6d9f392aec329c460cd2dcafd98ea1b188e71ff88a76865fc0ec0581` | 仅追加治理记录；A1 未据其改口径 |

## 2. 写集与实际改动

| 路径 | 类型 | 行数 | git hash-object | SHA-256 |
| --- | --- | --- | --- | --- |
| `src/model/directive-marker.ts` | 新增 | 59 | `c0978df25b9431b5cec0b08a110ef19045900619` | `7e522722b93a8815430b9c77e949ca5c1543683ecced8f23b8c29c8b584351c0` |
| `src/model/directive.ts` | 新增 | 276 | `056fe6bb3f95f269514d5de4ec903d71031b9f82` | `2172bdecd3648da3d1f4bd8c1b177db8b687b1e8ac2b07119c787c44bd652699` |
| `src/model/runtime.ts` | 加法修改 | 2769 | `b92891873eb9623f828b4dd17731469db0558c53` | `911c617920e11bd2b61c851c9f39817fea4a4c59cfeab3366b640082bc4004c5` |
| `src/model/project-state.ts` | 加法修改 | 420 | `0c4582e2cc87cf5cac8975ba879f8ffd5b10ce49` | `7075d76b266699ae394062720534b277d9873f722ffe8144d86c1a07bafaa430` |
| `test/runtime-core/directive-marker.test.ts` | 新增 | 132 | `8d506c8125909f0f66f26946b660003f538264d8` | `d3d28fe9df246d5eb19d096a053ab4707c00c9824b2f00e388b928009af7658e` |
| `test/runtime-core/directive-contract.test.ts` | 新增 | 643 | `4be84c2ada93578f25f359a259535ea678dc96c4` | `f7f4db3071b11f23f6c1554dad7be73167708127cd120fc94d7f4b5e0c060e2f` |

- 产品/测试写集恰为上述六路径；自身文档与证据目录为本角色授权路径。**未写** `app/**`、`src/common/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、其他 `test/` 目录、角色卡/边界、`docs/{planning,scheduling,acceptance,communication}`。

## 3. 实现要点

### 3.1 `directive-marker.ts`（零依赖纯解析器）

- 零 import / 无 require / 无 Node 全局（静态检查 `09-static-checks.txt`；契约测试亦断言源码）。
- 规则逐条按方案 §3.1：跳过开头 JS `\s`（含全角空格 `　`/BOM）；首个非空白位置必须为半角 `@审批`/`@决策`；标记后必须为空白或文本结束；多行正文；正文中标记不二次识别；`@边界`/全角 `＠`/英文别名/近失配不命中；空正文命中且 `body === ""`。
- `body = 标记后文本.trim()`，仅作面板预填建议；审计原文由调用方保存 `rawText`。非字符串入参返回 `undefined`、不抛错。
- 带图拒绝不属于解析器（无图片入参）；契约测试以文本命中证明判定依据，C1 负责图片校验与拒绝。

### 3.2 `directive.ts`（事件/视图/facts/高危谓词/常量）

- 依赖方向：仅 `directive-marker.ts`（`DirectiveMarkerTarget` 字面集合唯一物理定义）与 `runtime.ts`（`GovernanceFlowId`、`GOVERNANCE_SLUG_PATTERN`）。`runtime.ts` 不 import 本文件；`project-state.ts` 不 import `runtime.ts`。
- 常量单一来源（P1-CAP-13）：`CUSTOMER_DIRECTIVE_SCHEMA`、`CUSTOMER_DIRECTIVES_REL`、`CUSTOMER_DIRECTIVE_ID_PATTERN`、五个字段上限；`GOVERNANCE_SLUG_PATTERN` 仍唯一来源在 `runtime.ts`，本文件不复制字面量。
- 事件：`DirectiveCreatedEventV1` 为判别联合（approval ↔ `ApprovalAction` + `scope:{}`；decision ↔ `DecisionAction` + `DirectiveScope`），`DirectiveEventV1` 含 created/consumed/revoked/expired。
- 视图：`CustomerDirectiveView` 字段按 §5.2（含 `status`、`consumer`、可选时间/高危字段）。
- Target 隔离（I-1）：`ApprovalDirectiveFact`/`DecisionDirectiveFact` 两个不兼容类型；`ApprovalDirectiveSnapshot`/`DecisionDirectiveSnapshot` 各只含本 target 的 `active` 与 `ledgerErrors`。
- 高危谓词 `directiveHighRiskReasons` 纯函数：稳定码按 `DIRECTIVE_HIGH_RISK_REASONS` 表序返回；覆盖 forever、项目级 decision reject/select-option、通配域名、宽路径（盘符根/`/`/`**`/项目根/项目根祖先）、宽命令（`; && || | > < \` $( *` 换行）、Q7 A 开关关闭时项目级 `select-recommended`。空命令不是高危（由非空约束拒绝）。

### 3.3 `runtime.ts`（Q9 A 加法）

- `ShellReviewResult` 两个分支各加可选 `directive?: { id: string; scope: "once" | "session" | "forever" }`。
- `CustomerInputOutcome.answered`/`declined` 各加可选 `directive?: { id: string; action: "select-recommended" | "select-option" | "reject" }`；`unavailable` 不加。
- `RequestResolvedEvent.by` 扩展 `"directive"` 并新增可选 `directiveId?: string`。
- `VersionDecisionEvent` 新增可选 `directiveId?: string`。
- **未改** `RequestPresentedEvent.to`（保持 `"customer" | "judge"`，W-6）、`ApprovalResolvedEvent.by`（不在本平面）、`GovernanceJudgeFacts`（O3 未实施）。

### 3.4 `project-state.ts`

- `VersionDecisionDecidedBy` 加 `"directive"`；文件保持纯类型/常量、不 import `runtime.ts`。

## 4. 验证与证据

### 4.1 定向测试

`node --test --test-concurrency=1 test/runtime-core/directive-marker.test.ts test/runtime-core/directive-contract.test.ts` → **27 tests / 27 pass / 0 fail / 0 skip**（exit 0）。覆盖 §3.1 全部示例与近失配、多行/全角/空正文、非字符串、高危真值表、target 类型隔离、Q9 形状、常量单一来源。

### 4.2 runtime-core 全目录（B0 对照）

- 命令：`node --test --test-concurrency=1 "test/runtime-core/*.test.ts"`（原始日志 `04-runtime-core-suite.log`）。
- 结果：**309 tests / 302 pass / 3 fail / 4 skipped / 0 todo，exit 1**。
- B0 基线：282 / 275 / 3 / 4。差异 **+27 tests / +27 pass**；失败与 skip 数量、条目逐名一致 ⇒ **新增确定性失败 0、新增 skip 0**。
- 3 项失败均为既有 Windows symlink `EPERM`：`file-write-safety.test.ts:97`、`session-store.test.ts:46`、`session-store.test.ts:58`。

### 4.3 Typecheck

- `npm run typecheck` → **exit 1**，唯一错误：
  `src/common/编排/version-decision.ts(435,7): error TS2322: Type '"customer" | "directive" | "judge"' is not assignable to type '"customer" | "judge"'`。
- 该文件属 B1 写集（团队计划 §4.3 B1：`version-decision.ts` 的 `decidedBy` 联合与映射加 `"directive"`；方案 §9.2 更新清单）；A1 写集明确禁止修改 `src/common/**`，故本节点未越界修改。
- A1 六文件定向 typecheck（与 tsconfig 同严格 flags，`--ignoreConfig`）：**exit 0**（`06-scoped-typecheck.log`）。
- 结论：A1 契约文件自身类型正确；全仓 typecheck 的通过依赖 B1 按其写集完成 Q9 消费点更新。**这是 A1 出口门禁的停止项，见 §6。**

### 4.4 静态检查

`09-static-checks.txt` 记录：marker 无 import/require/node；`directive.ts` 仅 3 条 marker/runtime 导入；`runtime.ts`/`project-state.ts` 无 `CUSTOMER_DIRECTIVE_*` 重复定义；`parseDirectiveMarker` 仅一份；`runtime.ts` 不 import directive；`project-state.ts` 不 import runtime；`RequestResolvedEvent.by` 含 `"directive"`，`ApprovalResolvedEvent.by` 保持 `customer|judge`；`GOVERNANCE_SLUG_PATTERN` 单一来源；无 `@边界` 字面解析。

## 5. 并发写与候选隔离披露（非本角色写入）

- A1 开始前 `git status --porcelain -- src app test` **为空**（`00b-git-baseline.txt`）。A1 实施期间，同一 worktree 出现 **A2/A3 并发写入**：
  - A2：`src/common/shared/jsonl-ledger.ts`（新）、`test/项目管理/shared/jsonl-ledger.test.ts`（新）；
  - A3：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（改）、`test/项目管理/shared/i18n.test.ts`（改）；
  - 另有 H1/治理文档与 `角色卡/项目管理/docs/architecture/shared-components.md` 等并行变更。
- 上述路径**不是运行时核心写入**，与 A1 六路径无重叠；A1 未改动、未回退他方文件。
- 影响：`git status --porcelain -- src app test` 已不可能只含 A1 六路径，候选隔离不满足团队计划 §10.1 第 14 项的理想条件。E1 汇总候选时必须按路径/所有者隔离；A1 的证据只绑定 §2 六路径哈希。若并发写入继续影响同一路径，按停止项回报统筹。
- 全量 runtime-core 套件仅覆盖 `test/runtime-core/*`，不包含 A2/A3 文件；其 309/302/3/4 结果不受 A2/A3 测试影响。`npm run typecheck` 包含并发文件，但其唯一错误仍是 B1 消费点，未出现 A2/A3 相关错误。

## 6. 停止项与待办

1. **A1 出口 typecheck（阻断）**：`src/common/编排/version-decision.ts:435` 的 `decidedBy` 局部联合需由 **B1** 在其写集内加 `"directive"`（方案 §9.2、团队计划 §4.3 B1）。A1 不得修改 `src/common/**`；因此本节点 `npm run typecheck` 不能为 exit 0。请统筹裁决：在 A1 出口前授权 B1 完成该一行消费点更新，或接受 A1 以「契约文件定向 typecheck 0 + 全仓唯一外部消费点错误」记录为 `implemented-unverified`，并在 B1 出口关闭。
2. **候选隔离（非阻断但须披露）**：A2/A3 并发写入使 `src app test` 工作区不再只含 A1 六路径；E1 必须按路径隔离候选，A1 证据不得覆盖他方改动。

## 7. 契约冻结声明（A1 输出）

```text
A1-customer-directive-model freeze v1 | baseline HEAD: 4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0 | files: src/model/directive-marker.ts c0978df25b9431b5cec0b08a110ef19045900619 7e522722b93a8815430b9c77e949ca5c1543683ecced8f23b8c29c8b584351c0 | src/model/directive.ts 056fe6bb3f95f269514d5de4ec903d71031b9f82 2172bdecd3648da3d1f4bd8c1b177db8b687b1e8ac2b07119c787c44bd652699 | src/model/runtime.ts b92891873eb9623f828b4dd17731469db0558c53 911c617920e11bd2b61c851c9f39817fea4a4c59cfeab3366b640082bc4004c5 | src/model/project-state.ts 0c4582e2cc87cf5cac8975ba879f8ffd5b10ce49 7075d76b266699ae394062720534b277d9873f722ffe8144d86c1a07bafaa430 | test/runtime-core/directive-marker.test.ts 8d506c8125909f0f66f26946b660003f538264d8 d3d28fe9df246d5eb19d096a053ab4707c00c9824b2f00e388b928009af7658e | test/runtime-core/directive-contract.test.ts 4be84c2ada93578f25f359a259535ea678dc96c4 f7f4db3071b11f23f6c1554dad7be73167708127cd120fc94d7f4b5e0c060e2f | commands: node --test --test-concurrency=1 "test/runtime-core/*.test.ts" exit 1 (309/302/3 existing Windows symlink EPERM/4 skip; B0 282/275/3/4 => +27/+27, 0 new deterministic failures, 0 new skips); npm run typecheck exit 1 (sole external consumer error src/common/编排/version-decision.ts:435, B1 write set); A1 scoped typecheck exit 0 | surface: parseDirectiveMarker / DirectiveMarkerTarget / DirectiveCreatedEventV1 / DirectiveEventV1 / CustomerDirectiveView / ApprovalDirectiveFact / DecisionDirectiveFact / ApprovalDirectiveSnapshot / DecisionDirectiveSnapshot / directiveHighRiskReasons / DIRECTIVE_HIGH_RISK_REASONS / ID-rel-and-limit constants / ShellReviewResult.directive? / CustomerInputOutcome.directive? / RequestResolvedEvent.by:"directive" + directiveId? / VersionDecisionEvent.directiveId? / VersionDecisionDecidedBy:"directive" | status: implemented-unverified | change rule: 任何形状/枚举/常量/谓词变化回运行时核心重跑 A1 并使其消费方证据失效
```

- **B1/C1/C2 只按上述冻结面消费**；`RequestPresentedEvent.to` 不扩（W-6）；`ApprovalResolvedEvent.by` 不动；`GovernanceJudgeFacts` 不新增 O3 字段。
- 冻结声明与完成记录同文；任何变更须回运行时核心并重跑受影响证据。

## 8. AC 映射（A1 直接承担/提供证据）

| AC | A1 证据 |
| --- | --- |
| AC-1 识别规则 | `directive-marker.test.ts` §3.1 全示例/近失配/多行/全角/空正文/非字符串；带图拒绝依据（文本命中 + C1 图片校验） |
| AC-6 schema 部分 | 事件/视图/facts 类型、`customer-directive/v1`、ID 模式、字段上限、seq/action/target/until 约束 |
| AC-7 类型隔离 | facts 不兼容 + `@ts-expect-error` 负例；快照只含本 target |
| AC-10 归属/枚举部分 | `RequestResolvedEvent.by/directiveId`、`VersionDecisionEvent.directiveId`、`VersionDecisionDecidedBy`、`CustomerInputOutcome.directive` |
| AC-13 谓词 | §4.3 真值表（7 项 + 非高危 + 多原因顺序 + Q7 A 开关关闭） |
| AC-14 结构部分 | `ApprovalResource` 仅 shell/domain/path；`DecisionAction` 仅选择/拒绝；无写权目标/新工具 |
| AC-15 加法兼容 | 仅可选字段/枚举扩展；旧 `request.resolved`/`version.decision` 无 `directiveId` 仍可读；JSON 往返 |
| AC-18 T3 部分 | 本记录 + 候选哈希 + 原始日志 + 冻结声明 + `implemented-unverified` |
| AC-19 支持 | 基线 HEAD/输入哈希；并发与候选隔离披露 |

## 9. 证据

证据目录：`角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence/`。

- `00a-env.txt`：Node/npm/OS/时间/cwd。
- `00b-git-baseline.txt`：A1 前 HEAD/status/diff/cached。
- `00c-hashes-before.txt`：修改前 `runtime.ts`/`project-state.ts` 的 git hash-object + sha256 + 行数。
- `03-targeted-tests.log`：定向 27/27 原始输出。
- `04-runtime-core-suite.log`：runtime-core 全目录原始输出（309/302/3/4）。
- `05-npm-run-typecheck.log`：全仓 typecheck 原始输出（exit 1，唯一 B1 写集错误）。
- `06-scoped-typecheck.log`：A1 六文件定向 typecheck（exit 0）。
- `07-candidate-hashes.txt`：六文件候选哈希/行数。
- `08-git-status.txt`：git status/diff/并发披露。
- `09-static-checks.txt`：零依赖/单一来源/依赖方向静态检查。
- `10-freeze-statement.txt`：冻结声明。
- `11-evidence-hashes.txt`：证据文件行数与 SHA-256（生成于最后）。
- `run-*.sh`：证据命令脚本（可复算）。

## 10. 声明

- 本节点只写 A1 六文件与自身文档/证据；未写其他角色路径、角色卡/边界、`docs/{planning,scheduling,acceptance,communication}`；未改断言以保绿、未新增 skip、未新增排除。
- **未 commit/push/merge/release**；不是验收结论；状态 `implemented-unverified`。
- 停止项见 §6：全仓 typecheck 依赖 B1 写集内的一行消费点更新；并发候选隔离需 E1 按路径处理。
