---
id: acceptance-return-card-a1-implementation
type: change
title: 验收回交卡 A1 i18n 实施记录
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: 按 P1 审核通过的 A1 写集新增 14 个 ui.* key 并更新 i18n 计数/占位符测试
  - date: "2026-11-02"
    kind: implemented
    summary: i18n/guard 14/14 通过、typecheck exit 0；待 D1/E2 独立验证
---

# 验收回交卡 A1 i18n 实施记录

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **角色 / 阶段**：项目管理（technical-architecture，`src/common/shared/` 唯一写入者）/ 团队计划 §五 **A1（i18n）**
- **状态**：**`implemented-unverified`**。A1 的 key、测试与计数已写盘，本角色自测通过；**未 commit/push、未启动应用、未跑 Electron E2E、未接触客户、未判验收**。是否满足 AC-8 及整体验收由 D1/E2 独立判定。
- **一句话**：在 `zh-CN.ts`/`en-US.ts` 成对新增 14 个 `ui.*` key（验收报告卡 7 + 验收决定卡 7），把 `i18n.test.ts` 计数从 907/1531 更新为 921/1545，并新增精确文案/占位符断言；`i18n-guard.test.ts` 只读回归通过，未修改 allowlist。

## 一、输入与授权

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| P1 审核记录（`recommend approval`） | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-P1-review.md` | 168 | `8a114aab2d6f1fa61bc7df8a1ef09f81d65afdb17d2990bf78a4ead50ca080d2` |
| A1 i18n 提案（本角色） | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-i18n-implementation-proposal.md` | 251 | `902a36b31306ddda5d2f6ee5d5db548a549fb9deab6dbbd31b3733c09f6c81de` |
| 团队计划（闸门 2） | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| V1 验收标准 | `docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| 方案 P1.2 | `docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |

- 授权依据：调度消息「P1 已 `recommend approval`，现授权你执行 A1（项目管理 i18n 实施）」；写集严格按团队计划 §4.3 A1 + A1 提案 §八。
- 环境：Windows 11 Pro 10.0.26300；Node `v24.22.1`；npm `11.19.1`；HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`；分支 `feat/flow-improvements-wave1`。
- A1 开始时 `git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空。

## 二、实际改动

### 2.1 `src/common/shared/i18n/messages/zh-CN.ts`

在既有 `ui.reportCard.*` 块（`ui.reportCard.targetTurn` 之后）新增 7 个 key：

- `ui.reportCard.acceptanceTitle`
- `ui.reportCard.acceptanceBadge`
- `ui.reportCard.acceptanceReportLabel`
- `ui.reportCard.evidenceCount`（含 `{count}`）
- `ui.reportCard.acceptanceDecision`
- `ui.reportCard.acceptanceDecisionPending`
- `ui.reportCard.acceptanceDisclaimer`

在既有 `ui.decisionDialog.*` 块（`ui.decisionDialog.destructive` 之后）新增 7 个 key：

- `ui.decisionDialog.acceptanceKind`
- `ui.decisionDialog.acceptanceReportTitle`
- `ui.decisionDialog.acceptanceReportFallback`
- `ui.decisionDialog.acceptanceReportMissing`
- `ui.decisionDialog.acceptanceReportTruncated`
- `ui.decisionDialog.acceptancePreviewLabel`
- `ui.decisionDialog.reportPath`（含 `{path}`）

精确文案与 A1 提案 §三/方案 §4.4 表逐字一致；未改写/删除任何既有 key。

### 2.2 `src/common/shared/i18n/messages/en-US.ts`

在同一两个块新增同 key、同顺序的 14 个英文值；`satisfies Record<MessageKey, MessageTemplate>` 保持齐全；英文值逐字取自方案 §4.4，无 Han 字符。

### 2.3 `test/项目管理/shared/i18n.test.ts`

1. 分区计数更新：`ui 921 / main 559 / shared 62 / preferences 3，总计 1545`（原 907/1531；新增 14 个 `ui.*`）。
2. 新增 `ACCEPTANCE_RETURN_CARD_KEYS`（14 项）冻结清单与 `placeholdersOf` 提取函数。
3. 新增测试「验收回交卡 key 契约：14 key 中英成对、精确文案与占位符一致」：
   - 中英成对、14 项精确文案；
   - zh/en 占位符集合一致；
   - `evidenceCount` = `["count"]`，`reportPath` = `["path"]`，其余 12 项为 `[]`；
   - `translate` 运行时替换 smoke（zh/en 的 `{count}`/`{path}`）。
4. 既有 `B0_KEYS`/`D_RETAINED_KEYS`/`SHELL_ESCALATION_KEYS`、locale/parity/英文泄漏/旧 key 零命中/关键 key 清单/shell 升级 key 断言全部保留；未删除/弱化，未新增 `skip`/`todo`。

### 2.4 未修改

- `i18n-guard.test.ts`、`i18n-guard-allowlist.ts`、`i18n-guard-scanner.ts` 未修改（只读回归）。
- `src/common/shared/i18n/{keys,types,index,translate,format}.ts` 未修改。
- 未写 `app/**`、`src/model/**`、`src/common/shared/` 其他组件、其他角色测试、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。

## 三、文件前后哈希与候选

| 文件 | 改前行数 | 改后行数 | 改前 `git hash-object` / SHA-256 | 改后 `git hash-object` / SHA-256 |
| --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 1957 | 1971 | `b1c63a444ef094fe38e8032dfd46d040e09da0bd` / `4a944f0e3484d1455a4f9e6caec56cd5824d0e67671a46597f4e7af9dfb48db4` | `4a556b41db0892c8acb049e140fd046d451bd817` / `2bea07fca5adba6bec5a670c99101618c9f568969b998e03340e8596dd295283` |
| `src/common/shared/i18n/messages/en-US.ts` | 2223 | 2239 | `945d47797c9a8d2948bcad749d16013e0b25e229` / `56f0706b62125945f54df0cade178318a43c68d2b42692909997f635421e66f1` | `b30efc9d48b623698fb182ad0ef8098ebeeea753` / `48e35b824161f5011cdac3696e8d06a6c4285ca5191371cd427bcaf3321b3eb3` |
| `test/项目管理/shared/i18n.test.ts` | 165 | 253 | `000111762d24c5823facabea944925bdbe1c3d1a` / `89f23673a75812ae8ed534187d3ebe2da27aba522307bda443383134d5ffba41` | `e6e99110ea923c4b4e7bd2d7c83a72d732d86ef4` / `44dba1269878500963dcea81be0c4a38b1756c1034de76e41a27de89d12e6ed1` |

- diffstat（仅本写集）：`zh-CN.ts +14`、`en-US.ts +16`、`i18n.test.ts +94/-3`（共 121 insertions / 3 deletions；英文多行字符串导致行数多于 key 数）。
- **A1 候选联合摘要**：`sha256sum` 三文件后按输出再 `sha256sum` = **`127ebc05e962527ea6ca2ad958712c97d1d8c5e320b049ce32cdcb65930e7f12`**（方法：`sha256sum <zh> <en> <test> | sha256sum`）。
- `git diff --cached --name-only` 为空；未 commit/push。

## 四、验证结果

时间：2026-11-02T15:55:07+08:00（命令均在 worktree 根目录，Windows Git Bash）。

### 4.1 i18n / guard

```bash
node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts
```

- 退出码：**0**
- `tests 14 / pass 14 / fail 0 / cancelled 0 / skipped 0 / todo 0`
- 关键通过项：
  - `key 分区计数：ui 921 / main 559 / shared 62 / preferences 3，总计 1545`
  - `验收回交卡 key 契约：14 key 中英成对、精确文案与占位符一致`
  - `key parity`、`英文泄漏计数`、`旧治理 key 零命中`、`关键 key 清单`、`shell 升级 key 契约` 全部通过
- i18n-guard：`[i18n-guard] scanned=131 allowlisted=20 violations=0`（allowlist 未改，与 B0 基线一致）。

### 4.2 typecheck

```bash
npm run typecheck
```

- 命令：`tsc --noEmit`（`ans-cli@1.8.3 typecheck`）
- 退出码：**0**；0 类型错误，无输出。
- 说明：该结果对应当时刻工作树（含并行 A2/A4 的未提交改动）；A1 三文件此后未变。若 A2/A4 后续改动使整体 typecheck 结果变化，不影响 A1 三文件自身的 i18n 结论；D1 须在同一候选整体复跑。

### 4.3 未执行

- 未运行 `typecheck:renderer`/`build:renderer`（A1 未改 renderer；A3 出口运行）。
- 未启动应用、未跑 Electron E2E、未截图、未接触客户。

## 五、写集核对与并发隔离

### 5.1 A1 自身写集

A1 本上下文只修改以下 3 个文件：

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`

未写任何其他路径；未改角色卡/边界、其他角色测试、治理/调度/验收/沟通/策划文档。

### 5.2 工作树并发观察（重要）

A1 完成时 `git status --porcelain -- src app test` 还显示以下**非 A1**修改（以 A1 完成时快照为准；并行角色后续继续修改不在本记录）：

- `app/desktop/customer-input.ts`、`app/desktop/session.ts`（**并行 A4 桌面窗口**的工作树改动）
- `app/renderer/src/chat/decision-dialog.ts`、`app/renderer/src/chat/role-view.ts`、`test/桌面UI/decision-dialog.test.ts`、`test/桌面UI/role-view.test.ts`（**并行 A2 桌面UI**的工作树改动）

这些文件**不是本 A1 上下文写入**，也不属于 A1 候选。A1 开始时该命令为空；A1 候选只包含 §三 三文件。D1/E1/独立验收须按角色/候选隔离分别列明，不得把这些文件算入 A1 证据，也不得把 A1 的三文件混入 A2/A4 候选。本上下文未修改、未回滚这些文件。

## 六、偏差、风险与状态

### 6.1 偏差

- **无实质偏差**：实际新增 14 个 `ui.*` key，计数实测 921/1545，与 A1 提案/方案 §4.4 一致；占位符仅 `{count}`/`{path}`；英文零 Han；guard `scanned=131 allowlisted=20 violations=0`。
- 英文文件行数增加 16 而非 14，是两条多行字符串（`acceptanceDecisionPending`/`acceptanceDisclaimer`）的排版，不是额外 key。

### 6.2 风险/待验证

1. **A3 消费未验证**：A1 只保证 key 存在/文案/占位符；A3 的 `ReportCard.tsx`/`DecisionDialog.tsx` 是否全部走 key、无硬编码中文，由 A3/D1/E2 验证。
2. **运行时替换**：A1 测试已用 `translate` 做 `{count}`/`{path}` smoke；真实渲染中的标签/路径显示仍由 A3/E2E 验证。
3. **并发候选**：§5.2 的 A2 文件必须在 D1/E1 中与 A1 分开；若调度要求统一候选，应由统筹在同一候选快照中整体记录，不由 A1 擅自纳入。
4. **A1 状态**：`implemented-unverified`；未 commit/push；不表示 AC-8 或整体验收通过。

### 6.3 状态

**A1 完成（自测通过），状态 `implemented-unverified`；等待 D1/E2 独立验证；未判验收。**
