# 变更记录：客户确认 / 选择必须卡片化 + 代理开关语义 + M1 前卡（内置治理角色卡）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-27
- 角色：门禁引擎（Gate Engine）
- 注：同日截图-only 批次（`2026-10-27_change_screenshot-only-acceptance-evidence.md`）已将本记录中的 M1 示例「截图 vs 录屏」改为「截图采集范围 / 截图清单」，并禁止把录屏作为验收要求 / 选项；该批同时更新了 `governance-roles.ts` 与 `customer-card-rules.test.ts`，本记录所列哈希为当时候选，当前候选以截图-only 批次记录为准。
- 任务：客户新规则——**任何需要客户确认 / 选择的问题都必须以卡呈现，不能在聊天里让客户口头回答**；`request_confirmation` 由「替我审批」代理、`request_choice` / decision 卡由「替我决策」代理，两者都关为客户本人；代理只能按卡内唯一推荐项 / 已发选项处理，失败回落客户 fail-closed；产品 / 运营发现未决材料缺口（如提案 §5 M1 截图 vs 录屏）必须在依赖步骤前发 decision 卡（唯一推荐项），没有卡 / 客户未决不得推进；质检的 `report_artifact_ready` 是向应用汇报，不是客户确认卡（lead-governance-coordination；门禁引擎任务）。
- 依据：
  - 客户本轮新规则（经任务转达）第 1–5 点。
  - 应用现状：`request_confirmation` 由「替我审批」代理；`request_choice` / decision 卡由「替我决策」代理；两开关都关时客户本人作答。
  - 现有卡文本：五卡既有「判断代批纪律」、产品 / 运营的材料性选择 / Decision 卡章节、质检的 `report_artifact_ready` 工件就绪汇报。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts`（新增单一来源客户卡化总则并插入五卡；产品、运营、质检三卡的角色专属补充）、`test/门禁引擎/customer-card-rules.test.ts`（新增）、本角色 changelog 与本变更记录。未改 `src/model/**`、`src/provider/**`、`src/pipeline/**`、`src/common/编排/**`、`app/**`、共享 i18n、PM 文档或 `demos/`；未新增角色 / `FlowStepKind` / cardKind / 写权 / 判定逻辑；未 commit / push；未重启应用。

## 1. 写前核对与基线

- `git rev-parse --short HEAD` = `b36a971`（分支 `feat/scaffold-first-governance`，worktree `lead-governance-coordination`）。
- 本批写前（上一批 `report_artifact_ready` 卡文本完成后）本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **351 计 / 350 过 / 0 失败 / 1 Windows 既有 skip**。
- 工作树内另有运行时核心 / 编排 / 桌面角色的未提交 `report_artifact_ready` 实现（`src/model/runtime.ts`、`src/provider/runtime/**`、`src/pipeline/orchestration/run-role.ts`、`app/desktop/**` 等），不是本角色改动；本批未触碰，也不计入本角色候选。
- 写后本角色候选哈希（`git hash-object` / `sha256sum`）：
  - `src/common/门禁引擎/governance-roles.ts` = `fea3e6b9aa03607724c0f699a0c317d6296dcc36` / `400bfea3fb70f41213e8a3064b3ede8f78023a4d9c92ef781b8bf611c5617fe0`
  - `test/门禁引擎/customer-card-rules.test.ts` = `61b4233d04428833e53eba906887d329c3aaa3e7` / `1ec3dd8a2ddfebaf87fd98210763ccb3643a32c3b4c8a1dd2e7b5270e2609f21`

## 2. 单一来源：客户卡化总则（五卡复用）

新增 `CUSTOMER_CARDIFICATION_PRINCIPLE`（文件内常量，不导出、不改 API），逐字插入五张内置治理角色卡（`LIAISON_CARD_TEXT` / `RAPPORTEUR_CARD_TEXT` / `NOMINATOR_CARD_TEXT` / `CONVENER_CARD_TEXT` / `VERIFIER_CARD_TEXT`）的既有写入预授权段之后。核心语义：

1. **必须卡片化**：任何需要客户确认 / 选择的问题都必须以客户卡呈现——按本卡既有白名单使用 `request_confirmation`（确认 / 取消）或 `request_choice`（单选 / 多选 / decision 卡）；本卡可用卡型以「治理卡参数纪律」白名单为准。
2. **禁止聊天口头回答**：禁止「请回复」「请口头选」「回复 1/2」「不选默认同意」等问法；不得把沉默、未回复、默认勾选、既有做法、其他角色转述或推荐项当作客户确认 / 选择。
3. **代理开关语义**：`request_confirmation` 由客户「替我审批」开关代理；`request_choice` / decision 卡由客户「替我决策」开关代理；两个开关都关时由客户本人作答；代理只能按卡内**唯一 `recommended: true`** 的推荐项或**已发选项**处理，不得自造 / 改选项，不得把推荐项说成客户本人选择；代理开启但不可用 / 失败 / 超时 / deny ⇒ **回落客户**，fail-closed，不得按默认同意或自行推进。
4. **白名单外转交**：本卡白名单以外的确认 / 选择不得自造卡型或自行决定，交有对应权限的角色发卡（材料性选择由 运营 / Steward 发 decision 卡）。
5. **未决材料缺口卡片先行**：发现未决材料缺口（例如提案 §5 M1 的「截图 vs 录屏」证据形式）时，必须在依赖步骤前用客户卡确定（有 decision 卡权限的角色发 `request_choice` decision 卡；无权限角色交有权限角色发卡），不得自己定；没有卡 / 客户未决时不得推进该依赖步骤。

## 3. 角色专属补充

### 产品 / Lead（`LIAISON_CARD_TEXT`）

- 「治理协调」新增 **「未决材料缺口卡片先行（M1 等，必须）」**：发现未决材料缺口（如提案 §5 M1 的「截图 vs 录屏」证据形式）时，必须在依赖步骤（如 M1 实现 / 验收证据步骤）前交 运营 / Steward 发 decision 卡（`options` 真实可选、唯一推荐项）；没有卡或客户未决时不得推进该依赖步骤，不得自己定、不得在聊天里问客户、不得把推荐项 / 沉默 / 未反对当客户已选。
- 「内部决策纪律」补 **「未决材料缺口同理」**：如提案 §5 M1 截图 vs 录屏未决，必须在依赖步骤前交运营发 decision 卡；没有卡 / 客户未决不得推进该步骤。

### 运营 / Steward（`CONVENER_CARD_TEXT`）

- 「Decision 卡（材料性选择，必须）」新增 **「未决材料缺口必须先发卡（M1 等，必须）」**：必须在依赖步骤（M1 实现 / 验收证据步骤）前发 `request_choice`（`cardKind=decision`、`flowId` 必填）；`options` 真实可选、彼此可区分，恰好一个 `recommended: true`；不得自己定、不得在聊天里问客户、不得先把事做了再补卡；没有卡或客户 / 判断 agent 未决时不得推进该依赖步骤；不得把推荐项、沉默、未反对或「产品已转达」当客户已选。
- 标准工作流第 5 步（派发项目角色）补 **「派发前核对未决材料缺口（M1 等）」**：如提案 §5 M1 截图 vs 录屏未决，必须先有 decision 卡与客户 / 判断 agent 明确选择；没有卡或未决不得派发 / 推进该依赖步骤。

### 质检 / Proof（`VERIFIER_CARD_TEXT`）

- 流程工具纪律的 `report_artifact_ready` 段补：**`report_artifact_ready` 是向应用汇报工件就绪，不是客户确认 / 选择卡**，不代替客户决定；需要客户确认 / 选择时仍按本卡白名单发卡（或交有权限角色发卡），不得在聊天里请客户口头回答，不得把应用 `accepted` 当客户确认。

### 策划 / Draft、人事 / Crew

- 仅通过共享总则获得卡片化、代理开关、禁止口头回答 / 默认同意与白名单外转交语义；未新增其 cardKind、能力位或写权。Crew 卡既有「不再发 `request_choice`」白名单保持不变。

## 4. 测试

- 新增 `test/门禁引擎/customer-card-rules.test.ts`（6 例，全部卡文本 / 注册表数据面守卫）：
  1. 卡化：五卡均含客户卡化总则（请求工具、确认 / 取消、单选 / 多选 / decision）、禁止聊天口头回答、禁止「请回复 / 请口头选 / 回复 1/2 / 不选默认同意」、不得把沉默 / 未回复 / 默认勾选 / 既有做法 / 其他角色转述 / 推荐项当客户确认；反向禁止「不回复视为同意」「默认视为同意」「推荐项即客户已选」等肯定式。
  2. 代理开关：五卡均写明 `request_confirmation` ←「替我审批」、`request_choice` / decision ←「替我决策」、两开关都关为客户本人、唯一 `recommended: true` / 已发选项、不得自造 / 改选项、失败回落客户 fail-closed、不得按默认同意或自行推进。
  3. 产品 M1 前卡：提案 §5 M1「截图 vs 录屏」、交运营发 decision 卡（唯一推荐项）、依赖步骤前、没有卡 / 未决不得推进、不得自己定 / 聊天问客户 / 把推荐项当已选。
  4. 运营 M1 前卡：`request_choice`（`cardKind=decision`、`flowId` 必填）、`options` 真实可选、恰好一个 `recommended: true`、依赖步骤前、没有卡 / 客户未决不得推进、不得先做后补卡、派发前核对。
  5. 质检：`report_artifact_ready` 是向应用汇报、不是客户确认 / 选择卡、不代替客户决定、`accepted` 不是客户确认；反向禁止「report_artifact_ready 即客户确认 / 验收通过」「accepted 即客户同意 / 批准」。
  6. 数据面零变化：五角色顺序、能力位键集合、shell 档、Proof entries / 预授权 / 派发能力不变；卡文本中 `cardKind=` 值只出现既有八种（intent-confirm / proposal / appointment-write / appointment / decision / schedule-write / write / acceptance），新增 cardKind 会使测试失败。
- 未删除或放宽既有断言；原有卡文本测试全部保留。

## 5. 验证结果（本批写后）

- 定向：`node --test "test/门禁引擎/customer-card-rules.test.ts"` ⇒ **6 计 / 6 过 / 0 失败 / 0 skip，exit 0**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **357 计 / 356 过 / 0 失败 / 1 Windows 既有 skip，exit 0**（写前 351 计；新增 6 例）。
- `npm run typecheck` ⇒ **exit 0，0 诊断**（工作树同时含其他角色未提交改动；本角色未改其文件）。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 6. 未做 / 依赖其他角色 / 残余风险

- **本批只改角色卡文本与测试**：代理开关的实际判定、`request_confirmation` / `request_choice` 的代理路由与拒绝 / 超时 / 回落行为由运行时核心 / 编排 / 桌面角色实现；卡文本是行为约束，不是实现证据。
- M1 是**示例**：实际项目中的未决材料缺口必须以 decision 卡呈现；应用是否会机械拦截「无卡推进依赖步骤」取决于既有 flow / 派发门禁，本批未新增判定逻辑。
- 「请回复」「请口头选」「不选默认同意」等短语只作为**禁止示例**出现在卡文本中，不是允许的问法；模型是否遵从无机械保证，客户卡通道仍是唯一硬保证。
- 未 commit / push、未重启应用、未触碰 `demos/` 或游戏项目；未独立验收。
