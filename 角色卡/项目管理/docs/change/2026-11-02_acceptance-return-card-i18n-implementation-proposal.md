---
id: acceptance-return-card-i18n-implementation-proposal
type: change
title: 验收回交卡 i18n 实现提案（A1）
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: 写项目管理侧 A1 i18n 实现提案（proposal-only；14 个 ui.* key、计数/parity/占位符）
---

# 验收回交卡 i18n 实现提案（A1）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **角色 / 阶段**：项目管理（technical-architecture，`src/common/shared/` 唯一写入者）/ 团队计划 §五 **A1（i18n）**
- **性质 / 状态**：**`proposal-only, no code`**。本文只冻结 A1 的 key、精确文案、测试更新与验证计划；**未改任何产品/测试文件，未运行测试，未启动应用，未 commit/push，未接触客户，未判定验收通过**。A1 实施须待 P1 审核通过；A3 组件/CSS 须待 A1/A2 冻结。
- **一句话**：为验收报告卡与验收决定卡补 14 个 `ui.*` 文案 key（中英成对、占位符一致），同步更新 `i18n.test.ts` 的精确计数（907→921、1531→1545）与占位符断言；不改共享组件、公共导出或其他角色。

## 一、输入、基线与授权

### 1.1 冻结输入（2026-11-02 写本提案时实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 团队计划（闸门 2 确认） | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| V1 验收标准 | `docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| 方案 P1.2（唯一实施基线） | `docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 独立复核 | `docs/planning/2026-11-02_review_acceptance-return-card.md` | 143 | `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |
| 桌面UI P1 提案（消费者） | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 463 | `e2eb138e17f0090495bf4d9be3c7b45ef152f631095e90893b63be374a5e4402` |
| 桌面窗口 P1 提案（载荷提供方） | `角色卡/桌面窗口/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 426 | `8ee94a302e04eab740dcd7353bc7b8e4874363cb93db363ed6cd7c98e172360e` |

- 分支 / HEAD：`feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`；`git status --porcelain -- src app test` 为空（写本文前）。
- 方案 §4.4 是本提案 14 个 key 与文案的唯一来源；V1 AC-8 与团队计划 §4.3 A1/§5.3 A1 出口是本提案的验收约束。
- 本文不是实施记录，也不是独立验收结论；P1 审核记录中的 A1 自检披露见 `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-P1-review.md`。

### 1.2 当前 i18n 基线（只读实测）

| 项 | 实测值 | 依据/说明 |
| --- | --- | --- |
| 文件 | `src/common/shared/i18n/messages/zh-CN.ts`（1957 行）、`en-US.ts`（2223 行） | `zh-CN` 是 key 全集参考；`en-US` 用 `satisfies Record<MessageKey, MessageTemplate>` 强制齐全 |
| 分区计数 | `ui 907 / main 559 / shared 62 / preferences 3 = 1531` | `test/项目管理/shared/i18n.test.ts:101-110`；B0 §六复测一致 |
| 现有报告卡 key | `ui.reportCard.*` 位于 zh-CN.ts 602-621 / en-US.ts 639-660 | 含 `title`/`excerptLabel`/`independentAcceptance`/`notConfirmed`/`disclaimer`/`noEvidence` 等 |
| 现有决定卡 key | `ui.decisionDialog.*` 位于 zh-CN.ts 1846-1883 / en-US.ts 2112-2149 | 含 `titleFallback`/`sourceRole`/`noOptions` 等；无 `acceptanceKind`/`reportPath` |
| 通用 flags key | `shared.common.redacted`（已净化）、`shared.common.truncated`（已截断）存在 | 决定卡净化 flag 复用 `shared.common.redacted`；截断使用本提案专用 key |
| 守卫基线 | `[i18n-guard] scanned=131 allowlisted=20 violations=0` | `test/项目管理/shared/i18n-guard.test.ts`；`ReportCard.tsx`/`DecisionDialog.tsx` 不在 allowlist，新增可见文案必须走 key |
| 计数预期 | 14 个 key 全为 `ui.*` → `ui 921 / 总计 1545` | 与方案 §4.4、V1 AC-8、团队计划 §1.4 推算一致；实施时以实际测试为准 |

### 1.3 本阶段不产生的授权

- 本文不授权提交/推送/合并/发布，不授权派发 worker，不授权修改写集、边界或档位；A1 实施仍以 P1 审核通过为前提。
- 本文不新增共享组件/公共导出，不改 `src/common/shared/i18n/{keys,types,index,translate,format}.ts`，不改 `i18n-guard-allowlist.ts`。
- 若 A3 发现还需要本表之外的文案 key，**停止并回 P1/统筹**，不得由 A1 或 A3 自行补 key；若只是同一 key 的用词调整，须重开受影响的文案确认。

## 二、目标与范围

### 2.1 目标

1. 在 `zh-CN.ts` 与 `en-US.ts` 成对新增 **14 个 `ui.*` key**，供桌面UI A3 的验收报告卡与验收决定卡消费；文案、占位符与方案 §4.4 表逐字一致。
2. 更新 `test/项目管理/shared/i18n.test.ts` 的分区计数（`ui 921 / main 559 / shared 62 / preferences 3 = 1545`）、parity、英文泄漏、旧治理 key 零命中，并新增本表 key 的成对/精确文案/占位符断言。
3. `i18n-guard.test.ts` 作为回归只读通过；不修改 allowlist。A3 组件不得硬编码中文。

### 2.2 不在 A1 范围

- 不改 `ReportCard.tsx`/`DecisionDialog.tsx` 或任何 `app/renderer/**`、`app/desktop/**`、`src/model/**`、`src/service/**`、`src/pipeline/**`。
- 不新增/修改共享组件、公共入口、`MessageKey` 类型实现、i18n 运行时/格式化逻辑。
- 不新增 `shared.common.*` key；不删除/改写既有 key（`ui.reportCard.independentAcceptance`/`notConfirmed` 保留给普通报告卡）。
- 不实现 O1–O10 选装；不恢复已取消 `full-report-display` P1.3；不 commit/push/启动应用。

## 三、14 个 key 的精确文案（冻结）

> 下表逐字来自方案 §4.4；`{}` 内为唯一占位符。A3 必须按同一 key/占位符消费；不得在组件内硬编码中文或另起近似 key。

| # | Key | zh-CN | en-US | 占位符 | A3 消费点 |
| --- | --- | --- | --- | --- | --- |
| 1 | `ui.reportCard.acceptanceTitle` | 独立验收报告 | Independent acceptance report | — | `ReportBody` 验收标题（替换普通 `ui.reportCard.title`） |
| 2 | `ui.reportCard.acceptanceBadge` | 独立验收 | Independent acceptance | — | 验收报告卡文字徽标 |
| 3 | `ui.reportCard.acceptanceReportLabel` | 验收报告原文 | Acceptance report text | — | 验收正文上方 `excerpt-label` |
| 4 | `ui.reportCard.evidenceCount` | 证据（{count} 条） | Evidence ({count}) | `{count}` | 验收证据区块标题（`count = evidence.length`） |
| 5 | `ui.reportCard.acceptanceDecision` | 验收决定（如适用） | Acceptance decision (if applicable) | — | 验收事实行 `dt` |
| 6 | `ui.reportCard.acceptanceDecisionPending` | 若本次为验收任务，由客户在验收决定卡作出；报告本身不构成通过。 | If this is an acceptance task, the customer decides on the acceptance card; this report alone is not an approval. | — | 验收事实行 `dd`（条件措辞，禁止声称已通过） |
| 7 | `ui.reportCard.acceptanceDisclaimer` | 以上为质检提交的报告原文；如本次为验收任务，是否验收通过以验收决定卡为准。 | This is the verifier's report; if this is an acceptance task, approval is decided on the acceptance card. | — | 验收报告卡免责声明（替换普通 `disclaimer`） |
| 8 | `ui.decisionDialog.acceptanceKind` | 独立验收决定 | Independent acceptance decision | — | 验收决定卡本地化徽标（替换机器值 `acceptance`） |
| 9 | `ui.decisionDialog.acceptanceReportTitle` | 验收报告原文 | Acceptance report | — | 决定卡报告原文区标题/`aria-label` |
| 10 | `ui.decisionDialog.acceptanceReportFallback` | 未能读取验收报告原文；验收卡说明仍可见。 | The acceptance report text could not be read; the card preview remains visible. | — | 无报告但有 preview 的降级说明 |
| 11 | `ui.decisionDialog.acceptanceReportMissing` | 未提供验收报告原文。 | No acceptance report text is available. | — | 无报告且无 preview 的缺失说明 |
| 12 | `ui.decisionDialog.acceptanceReportTruncated` | 报告原文超出显示预算，已截断。 | The report text exceeds the display budget and is truncated. | — | 决定卡报告原文截断提示（`truncated === true`） |
| 13 | `ui.decisionDialog.acceptancePreviewLabel` | 验收卡说明 | Card preview | — | `request.preview` 上方标签（始终可见/去重时隐藏） |
| 14 | `ui.decisionDialog.reportPath` | 报告路径：{path} | Report path: {path} | `{path}` | O2 报告路径（固定约定路径） |

### 3.1 文案与占位符约束

- **中英成对**：14 个 key 必须在 `zhCN` 与 `enUS` 同时存在；`en-US` 类型会强制齐全。
- **占位符**：仅第 4 项 `{count}`、第 14 项 `{path}` 有占位符；其余 12 项必须无 `{}`。两语言同一 key 的占位符集合必须一致。
- **不得声称已通过**：第 6/7 项只能使用条件措辞；不得出现断言式「已验收通过」「验收已通过」「通过验收」等结论。第 7 项含「是否验收通过以验收决定卡为准」是条件句，不是通过声明。
- **不翻译机器值**：`path`/`flowId`/`cardKind` 等机器值保持原样；`{path}` 只代入固定约定路径。
- **复用**：决定卡 `redacted === true` 使用既有 `shared.common.redacted`，不新增 `ui.decisionDialog.acceptanceReportRedacted`；`truncated` 使用第 12 项专用 key（方案允许 `shared.common.truncated` 或专用 key，本提案选专用 key 以明确「显示预算」语义）。
- **重复值可接受**：`acceptanceBadge` 与既有 `ui.reportCard.independentAcceptance` 同为「独立验收」但语义不同（徽标 vs 普通事实行标签）；保留两个 key，不合并、不改写既有 key。
- **无 `ui.acceptance.` 前缀**：本表 key 以 `ui.reportCard.` / `ui.decisionDialog.` 开头，不触发 `i18n.test.ts` 的「旧治理 key 零命中」`ui.acceptance.` 规则。

## 四、文件落点与插入方式

### 4.1 `src/common/shared/i18n/messages/zh-CN.ts`

- 在既有 `ui.reportCard.*` 块（约 602-621 行）内、`ui.reportCard.targetTurn` 之后（或紧邻 `independentAcceptance`/`notConfirmed` 之前）插入第 1–7 项；保持现有 key 顺序不变，不重排既有行。
- 在既有 `ui.decisionDialog.*` 块（约 1846-1883 行）内、`ui.decisionDialog.destructive` 之后插入第 8–14 项；保持现有 key 顺序不变。
- 全部使用双引号字符串，值与 §三 表逐字一致；除既有风格注释外，不在源文件新增中文注释或其他展示文案。

### 4.2 `src/common/shared/i18n/messages/en-US.ts`

- 在对应 `ui.reportCard.*`（约 639-660 行）与 `ui.decisionDialog.*`（约 2112-2149 行）块插入同 key、同顺序的 14 项；`satisfies Record<MessageKey, MessageTemplate>` 会强制 key 集合与 zh-CN 一致。
- 英文值逐字使用 §三 表；不含 Han 字符；不改既有英文 key。

### 4.3 不修改的文件

- `src/common/shared/i18n/keys.ts`（`MessageKey = keyof typeof zhCN` 自动扩展）、`types.ts`、`index.ts`、`translate.ts`、`format.ts`。
- `test/项目管理/shared/i18n-guard-allowlist.ts` 与 `i18n-guard-scanner.ts`；`i18n-guard.test.ts` 仅回归运行，不修改。
- `app/renderer/**`、`app/desktop/**`、`src/model/**`、其他角色文件。

## 五、测试更新（`test/项目管理/shared/i18n.test.ts`）

### 5.1 分区计数

更新既有测试 `key 分区计数`：

```ts
test("key 分区计数：ui 921 / main 559 / shared 62 / preferences 3，总计 1545", () => {
  // ...
  assert.deepEqual(prefixes, { ui: 921, main: 559, shared: 62, preferences: 3 });
  assert.equal(keys.length, 1545);
});
```

- 当前值 907/559/62/3=1531；新增 14 个 `ui.*` 后为 921/559/62/3=1545。
- 若实际 key 集与 §三 表不一致（新增数不是 14 或出现非 `ui.*` key），**停止**并在 A1 实施记录说明；不得改计数迁就错误 key 集。
- 不删除/弱化任何既有断言（`B0_KEYS`、`D_RETAINED_KEYS`、`SHELL_ESCALATION_KEYS`、parity、英文泄漏、旧 key 零命中）。

### 5.2 新增 key 冻结清单

新增常量（与 `SHELL_ESCALATION_KEYS` 同风格）：

```ts
const ACCEPTANCE_RETURN_CARD_KEYS = [
  "ui.reportCard.acceptanceTitle",
  "ui.reportCard.acceptanceBadge",
  "ui.reportCard.acceptanceReportLabel",
  "ui.reportCard.evidenceCount",
  "ui.reportCard.acceptanceDecision",
  "ui.reportCard.acceptanceDecisionPending",
  "ui.reportCard.acceptanceDisclaimer",
  "ui.decisionDialog.acceptanceKind",
  "ui.decisionDialog.acceptanceReportTitle",
  "ui.decisionDialog.acceptanceReportFallback",
  "ui.decisionDialog.acceptanceReportMissing",
  "ui.decisionDialog.acceptanceReportTruncated",
  "ui.decisionDialog.acceptancePreviewLabel",
  "ui.decisionDialog.reportPath",
] as const satisfies readonly MessageKey[];
```

### 5.3 成对/精确文案/占位符断言

新增测试（建议名：`验收回交卡 key 契约：14 key 中英成对、精确文案与占位符一致`）：

1. 遍历 `ACCEPTANCE_RETURN_CARD_KEYS`，断言每个 key 同时存在于 `zhCN` 与 `enUS`。
2. 逐 key 断言精确值（至少冻结 §三 的 zh/en 字符串；若实现时方案文案未变，这些断言必须原样通过）。建议对 14 项全部精确断言，避免后续改写文案绕过客户确认。
3. 占位符提取并比较：
   - 复用现有 `templateTexts` 把字符串或复数模板展开为文本；
   - 用 `/\{([A-Za-z][A-Za-z0-9_]*)\}/g` 提取参数名，去重排序；
   - 断言 `placeholdersOf(zhCN[key])` 与 `placeholdersOf(enUS[key])` 深度相等；
   - 显式断言 `ui.reportCard.evidenceCount` 为 `["count"]`、`ui.decisionDialog.reportPath` 为 `["path"]`，其余 12 项为 `[]`。
4. 占位符替换 smoke（可选但建议）：用 `translate("zh-CN", "ui.reportCard.evidenceCount", { count: 3 })` 得到「证据（3 条）」；用 `translate("en-US", "ui.decisionDialog.reportPath", { path: "docs/quality/flow-a-report-v1.md" })` 含该路径文本。若 `translate` 的缺参/类型行为不适合在 A1 断言，可只在 A3/E2E 验证运行时替换。
5. 英文泄漏/parity 由既有全局测试覆盖；不重复另写第二套全目录扫描。

### 5.4 既有断言保持

- `B0_KEYS`、`D_RETAINED_KEYS`、`SHELL_ESCALATION_KEYS` 清单与断言不变。
- `locale`、`key parity`、`英文泄漏计数`、`旧治理 key 零命中`、`关键 key 清单`、`shell 升级 key 契约` 全部保留。
- 不新增 `skip`/`todo`；不删除既有 key 来凑计数。

### 5.5 `i18n-guard.test.ts` 回归（不修改）

- A1 只改消息目录与 `i18n.test.ts`；`i18n-guard.test.ts` 的扫描范围排除 `src/common/shared/i18n/messages/` 与测试文件，因此 A1 不改变 `scanned=131` 基线；`allowlisted=20`、`violations=0` 应保持。
- A3 的 `ReportCard.tsx`/`DecisionDialog.tsx` 不在 allowlist；A3 实现时所有新可见文案必须走这 14 个 key，否则守卫会在 A3/D1 失败。A1 不修改 allowlist 来「放行」任何中文。

## 六、验证计划（A1 出口）

在 A1 实施后、同一候选取证：

```bash
node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts
npm run typecheck
```

- 记录命令、cwd、时间、Node/npm/OS、退出码、tests/pass/fail/skip/todo、失败原文；逐文件 `git hash-object` + `sha256sum`。
- 预期：i18n 两文件测试全过；计数 921/559/62/3=1545；parity 全等；英文泄漏 0；旧 key 零命中；`[i18n-guard] scanned=131 allowlisted=20 violations=0`；`npm run typecheck` 退出码 0。
- A1 不运行 `typecheck:renderer`（A3 出口运行；A1 未改 renderer）。A1 不启动应用、不跑 Electron E2E。
- 若计数/parity/占位符任一失败，按实际失败修复；不得用删 key、放宽断言或改 allowlist 保绿。

## 七、依赖、风险与开放点

### 7.1 依赖

1. **P1 审核**：A1 须待 P1 审核 `recommend approval` 后开工；A1 提案与桌面UI/桌面窗口提案的 key 清单必须一致。
2. **A3 消费**：A3 的 `ReportCard.tsx`/`DecisionDialog.tsx` 消费本表 14 key；`MessageKey = keyof typeof zhCN`，A1 未落 key 前 A3 的 `typecheck:renderer` 会因 key 不存在失败。因此 **A1 先冻结，A3 后实现**；A2 纯逻辑不消费新 key，可与 A1 并行。
3. **A4 独立**：A4 的 `acceptanceReport` 载荷不依赖 A1；但 A3 消费 A4 的 path/text 形状，按团队计划 A3/A4 并行。

### 7.2 风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 1 | 新增 key 数不是 14 / 出现非 `ui.*` key | 计数 921/1545 失败，A3 可能缺文案 | 按 §三 表逐项落 key；A1 实施记录列出实际 key 清单；不静默偏离 |
| 2 | zh/en 占位符不一致（`{count}`/`{path}`） | 英文显示原文占位符或值丢失 | §5.3 占位符断言；两语言同表 |
| 3 | 文案被改写导致声称「已通过」 | F3 语义误导 | §5.3 精确文案断言；A3/E2E 再断言条件措辞 |
| 4 | A3 硬编码中文 | `i18n-guard` 失败 | A3 只消费 key；不在 allowlist 放行 |
| 5 | A3 使用近似 key/自行补 key | 类型失败或文案分叉 | 以本表 14 key 为唯一定义；A3 需要新 key 时停止回 P1 |
| 6 | 删除/改写既有 key 凑计数 | 普通报告卡回归 | 保留 `independentAcceptance`/`notConfirmed`/`disclaimer` 等；不删 key |
| 7 | 英文值含 Han 或中文标点 | 英文泄漏测试失败 | 使用 §三 表英文值；A1 只做键值插入 |
| 8 | 共享组件/公共导出被误改 | 违反 T2 与写集 | A1 写集仅 §八 三文件；不碰 `keys/types/index/translate/format` |

### 7.3 开放点

1. **`ui.reportCard.evidenceCount` 的计数语义**：本提案按 `evidence.length`（快照内实际可用条数）显示；`evidenceOmitted > 0` 的省略提示由既有 `reportFlags` 提供。若 A3 需要显示「总数（含省略）」另立文案，不在 A1 扩 key。
2. **`shared.common.truncated` 复用**：本提案对决定卡截断使用专用 `acceptanceReportTruncated`，对净化复用 `shared.common.redacted`；若 A3 希望截断也复用 `shared.common.truncated`，不得新增/删除本表 key，须在 A3 提案/审核中说明并保持 §三 表冻结。
3. **英文措辞**：§三 表英文是方案冻结值；A3 不得改写。若客户后续调整英文，按方案版本变更处理，A1 不自行优化。

## 八、写集与非目标

### 8.1 写集（A1 实施时）

| 路径 | 变更 |
| --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 新增 14 个 `ui.*` key（§三） |
| `src/common/shared/i18n/messages/en-US.ts` | 同 key、同文案的英文值 |
| `test/项目管理/shared/i18n.test.ts` | 计数 921/1545、14 key 清单、精确文案/占位符断言 |

### 8.2 明确不写

- 不写 `app/**`、`src/model/**`、`src/service/**`、`src/pipeline/**`、`src/common/shared/i18n/{keys,types,index,translate,format}.ts`、`src/common/shared/` 其他组件、其他角色测试、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。
- 不改 `i18n-guard.test.ts`/`i18n-guard-allowlist.ts`/`i18n-guard-scanner.ts`。
- 不删除/改写既有 key；不新增 `shared.*` key；不实现选装；不恢复 P1.3；不 commit/push/启动应用。

## 九、作者与审核披露

- 本提案由 **项目管理（technical-architecture）角色**撰写；与 P1 审核记录同一上下文。按 `references/proposal-review.md`，同一上下文的自检**不构成独立审核**；A1 的 key/计数/占位符已在 P1 审核记录中披露为自检，不虚构第二审核角色。
- A1 的实施不替代 V1/客户实施授权/独立验收；A3 的组件行为仍由桌面UI 测试/D1/E2E/独立验收覆盖。
- 本文件状态：`proposal-only, no code`；未实施、未测试、未验收、未提交。
