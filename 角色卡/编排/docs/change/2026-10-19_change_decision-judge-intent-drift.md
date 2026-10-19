# 决策判断收敛为「意图漂移」判断

- 日期：2026-10-19
- 角色：编排
- 客户反馈（原话）：「决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了。」

## 1. 定位修正

此前「替我决策」（decision 组：proposal / appointment / acceptance）的判断 agent 同时承担了：

- 提案架构门槛（「架构方案」/「架构影响分析」章节是否齐全、是否空洞）；
- 工程质量基线/证据充分性/验收逐项证据的复核；
- 以及「是否与意图一致」。

客户本次把定位收窄为**只判意图漂移**：判断该决策是否偏离客户已确认的出发点。工程质量、架构章节、
测试覆盖、证据充分性、实现细节由 Draft/Proof 的工作流与验收负责（Draft 产出、Proof 独立核对），
判断 agent 不再重复审查；也不要求它读全部文件。

新的判断问题（decision 组唯一职责）：

1. 是否超出意图范围、引入未授权的非目标；
2. 是否违反客户明确约束，或与已接受的提案/契约不一致；
3. 是否与已接受的治理决定冲突（例如未经客户改约扩写写区、改变状态机语义、增加新角色）；
4. 意图是否缺失/自相矛盾/无法核对。

无偏离 ⇒ `approve`（可代批）；有偏离/意图缺失/歧义/未经确认 ⇒ `manual`（fail-closed，原卡交回客户；
本 agent 仍从不代拒绝）。写盘族（approval 组）不在本次定位修正范围内，内容/路径核对保持不变。

## 2. 设计与实现

### 2.1 意图基准（新增 `governance-judge-intent.ts`）

- **定位意图文件**（确定性优先级）：
  1. 账本中同一 `flowId` 的 `intent.handed-off`（取最后一条；同一 flow 出现多个不同 `intentId` ⇒
     `intent-ambiguous`，不猜「最新」）；
  2. 提案 frontmatter 的 `intentId`（旧项目/未走交接时的兼容来源）；
  3. `docs/intents/<flowId>.md`（角色卡口径）。
- **解析摘要**：复用 `governance-handoff.ts::parseIntentFrontmatter`（同一实现，不另立 YAML 解析），
  取 `goal/scope/acceptance`（必需非空）+ `nonGoals`（`nonGoals|non_goals|non-goals|nonGoal|outOfScope|out_of_scope`）
  + `customerWords`（`customerWords|customer_quote` 等）+ 正文中目标/范围/验收/非目标/约束/客户原话章节摘录；
  各字段 ≤2KiB、摘录 ≤4KiB，截断标记。
- **一致性校验**：意图文件 `intentId`/`flowId` 与定位结果不一致 ⇒ `intent-ambiguous`；
  frontmatter 不可解析或 `goal/scope/acceptance` 缺失 ⇒ `intent-missing`。
- **客户确认态**：账本中**最后一条**匹配的 `customer.decision{decisionKind:"intent-confirm"}` 必须为
  `accepted`；客户先确认后改口 `revise` ⇒ `intent-unconfirmed`（与 `validateIntentHandoff` §5.1 同口径）。

### 2.2 证据包收窄（`governance-judge-evidence.ts`）

- decision 组新增 `intent` 段：`intentId/path/sha256/bytes/source/confirmed/goal/scope/acceptance/
  nonGoals/customerWords/excerpts/truncated`。这是意图漂移判断的**唯一基准**。
- 提案摘要只提取与意图相关的「目标/范围/验收/非目标/约束/开放问题/风险/契约」章节；**不再提取架构/模块/
  schema 片段**（`DECISION_EVIDENCE_ARCHITECTURE_MAX_BYTES` 删除）。角色卡/boundary 本来只对写盘族采集，
  decision 组不采集（不要求全量物证）。
- 定点抽查集：decision 组 = 意图文件 + 提案/提名摘要（≤2 条）；验收的流程步骤已在证据包内，
  不再要求通读流程单。写盘族沿用既有最小集规则。
- fail-closed：意图缺失/歧义/未确认 ⇒ builder 返回 `ok:false`，driver **不调用模型**直接 manual。
  `PROBLEM_PRIORITY` 增加 `intent-missing > intent-ambiguous > intent-unconfirmed`（`artifact-missing` 仍在最前）。
- approve 前哈希基线新增意图文件；判断期间意图文件变化/消失 ⇒ `evidence-hash-mismatch`。
- 证据包版本 `DECISION_EVIDENCE_PACKET_VERSION = 2`（结构新增 `intent`）。

### 2.3 提示词 / rubric（`governance-judge-prompt.ts`）

- 新增【定位：decision 组只判意图漂移】与【不判断（明确排除）：由 Draft/Proof 的工作流与验收负责】；
  明确「即使提案缺少架构方案/工程质量基线、验收证据看起来不完整，也不得以此为由 manual」。
- 删除旧「架构门槛」全部文案；proposal/appointment/acceptance rubric 改为范围/约束/已接受决定核对；
  输出契约的 manual 说明新增 `intent-drift/intent-missing/intent-ambiguous/intent-unconfirmed`。
- decision 请求提示新增「客户已确认的意图摘要」块（goal/scope/acceptance/非目标/客户原话/摘录），
  与证据包 JSON 同源。
- 写盘族 rubric、只读范围/硬排除、不可信数据警告、读取纪律、输出契约逐字保留。

### 2.4 裁决（`governance-judge-verdict.ts`）

- `SAFE_MANUAL_REASON_CODES` 增加四个 intent reason code（模型自报可原样入审计）。
- 机械门槛**不放宽**：proposal 只能代批 `accept`（accept-quick/revise/reject 仍 manual）、appointment
  恰等推荐集/非内置、acceptance 提案已接受/无未闭环澄清、写盘逐路径复核、required-read、账本错误拒绝。
- 仅更新 proposal 分支注释（架构审查不属于 decision judge），判定逻辑未变。

### 2.5 驱动（`governance-judge.ts`）

- 证据包构建顺序不变（上下文校验 → 证据包（含意图）→ 验收机械门槛 → 模型 → 哈希复核）；
- 诊断 `governance-judge.evidence` 增加 `intentId/intentConfirmed`（可选字段）。

## 3. 测试

新增 `test/编排/decision-intent-drift.test.ts`（5 例）：

- proposal 与意图一致但**缺架构章节 ⇒ 仍可 allow**（架构由 Proof 查）；
- proposal 超范围/引入未授权非目标/与已接受决定冲突 ⇒ `manual/intent-drift`；
- appointment 任命名单/写区扩张未经意图确认 ⇒ `manual/intent-drift`；
- acceptance 验收选择与意图/已接受提案冲突 ⇒ `manual/intent-drift`；
- 系统提示明确排除工程质量/架构/测试覆盖/证据充分性，旧架构门槛已移除。

`test/编排/decision-evidence-packet.test.ts`：

- 更新 proposal/appointment/acceptance 夹具（意图文件 + intent-confirm/handoff 账本）；
- 断言 `intent` 摘要字段与 `requiredReadPaths = [意图, 提案/提名]`；
- 断言提案证据不再含架构片段；
- 新增「意图缺失/未确认/歧义（多意图、flowId 不一致）⇒ builder fail-closed」；
- 新增「提案 frontmatter `intentId` / `docs/intents/<flowId>.md` 两条兼容定位来源」。

`test/编排/governance-judge.test.ts`：

- 所有 decision 卡夹具补意图文件 + 账本（intent-confirm accepted + intent.handed-off）；
- required-read 列表改为 [意图, 提案/提名]；验收不再要求读流程单；
- 旧「架构门槛」正反例替换为意图漂移 rubric 与「缺架构仍 allow」正例；
- 既有机械门槛断言（accept-quick/推荐集/验收完成度/required-read/读取损伤/路径复核）**零放宽**。

实测（本工作树）：

- `node --test "test/编排/**/*.test.ts"` → **619 tests / 619 pass / 0 fail / 0 cancelled / 0 skipped**（exit 0）；
- `npm run typecheck` → **exit 0**（仅 npm 既有的 ELECTRON_MIRROR 配置 warning，无 TS 错误）。

## 4. 跨角色依赖

1. **运行时核心 / 桌面窗口**：无需改动。`GovernanceJudgeRequest`/`GovernanceJudgeContext`
   形状未变（`src/model/runtime.ts` 未改）；意图由 driver 从账本 + 提案 frontmatter + 盘面解析，
   桌面仍只透传卡片与 `judgeContext`。
2. **测试角色（`test/测试/governance-judge-cards-verify`）**：`b-card-kinds.test.ts` 走真实
   `createGovernanceJudge`；proposal/appointment/acceptance 夹具需补：
   - `docs/intents/<intentId>.md`（frontmatter 含 goal/scope/acceptance，建议含 nonGoals/customerWords）；
   - 账本 `customer.decision{decisionKind:"intent-confirm", customerDecision:"accepted"}` +
     `intent.handed-off{flowId, intentId}`；
   - 模型脚本的 `reads` 改为 [意图路径, 提案/提名路径]（验收不再要求读流程单）。
   上一批（决策证据包）遗留的写盘正文/账本事实夹具更新仍未完成，本次叠加意图要求。
   本工作树只读实测：该套件 **43 计 / 33 过 / 10 红**；10 红均为 decision 卡缺意图
   （断言信息「意图文件不可读：docs/intents/flow-a.md，已转手动确认」），不是 driver 判定回归。
3. **测试角色（`test/测试/governance-e2e-auto`）**：真实 driver + 决策开关的用例
   （如 `c-appointment-timing`、`i-full-chain`）同样需要意图文件与 intent-confirm/handoff 账本；
   未走 `hand_off_intent` 的旧夹具将回落 `intent-missing`（这是新定位的预期 fail-closed，不是回归）。
   该套件在本工作树运行超过 10 分钟未结束（长等待用例），本次未纳入证据；按上一批同一批夹具口径处理。
4. **产品/文档**：桌面 UI 文案「替我决策：提案接受、任命、验收由判断 agent 代批」仍成立；
   若后续要解释「只判意图漂移」，可在警告块补一句说明（桌面属主决定，本次未改 app/）。

## 5. 残余风险

- **旧项目无意图文件**：decision 卡一律 `intent-missing` 回落手动。这是客户新定位的直接结果
  （没有「客户的出发点」就无法判断偏离）；需要 Liaison 先补写 `docs/intents/<intentId>.md` 并走
  `intent-confirm`。
- **意图语义判断仍依赖模型**：builder 只保证意图可解析、已确认、字段齐全；「提案是否真的超出意图」
  是语义判断，由 rubric 引导模型。提示只能引导，确定性的兜底是意图缺失/歧义/未确认的 fail-closed。
- **同 flow 多意图从严**：账本中同一 flowId 出现多个不同 intentId 即 `intent-ambiguous`；若未来允许
  同一 flow 换意图重开，需要显式的「当前意图」标记（本次按客户要求「无法核对 ⇒ manual」从严）。
- **意图正文摘录为标题启发式**：非目标/客户原话若写在无标题散文中可能只被「客户原话」行或 frontmatter
  捕获；模型仍可经 requiredReadPaths 定点读取意图全文核对。
- **写盘族未纳入意图漂移判断**：客户本次只点名决策判断；approval 组仍按内容/路径/来源核对。
