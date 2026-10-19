# 决策证据包：请求方陈述 + 系统生成的结构化证据包 + 定点抽查

- 日期：2026-10-19
- 角色：编排
- 客户反馈（原话）：「决策agent 应该是别人给摘要，他再去判断吧，不是说要所有文件给他。」

## 1. 问题

真机现象：判断 agent 被要求自己读取提案/提名/流程/6 个角色文件等全部物证；大文件撞运行时核心的
单文件 64KiB / 总量 192KiB / 8 次读取预算，6 文件写卡 preview 6.9KB 又覆盖不了实际 11.5KB 内容，
频繁 `read-truncated` / `insufficient-evidence` 回落手动。

旧实现的两个根因：

1. `governance-judge.ts::requiredReadPathsFor` 把所有规范物证 + confirm 卡中**已存在**的全部目标文件
   并入 required-read，写盘卡越多文件要求读越多；
2. `governance-judge-prompt.ts` 的 rubric 要求读 `proposalPath`/`nominationPath` 全文，
   且把卡片 preview 当作内容核对依据（自由文本，不是结构化载荷）。

## 2. 修复设计：证据包是确定性函数的输出

判断输入改为三段，**请求方陈述与系统事实分开**：

1. **请求方陈述**（`packet.requesterStatement`，标注 `trust:"untrusted"`）：卡片 title/preview/detail/
   turnText，逐字来自模型工具调用；
2. **系统事实**（`packet.declaredPaths` / `evidence` / `mechanicalFacts` / `conflicts` / `integrity`）：
   由 `governance-judge-evidence.ts::buildDecisionEvidencePacket` 从实际盘面机械生成；
3. **定点抽查**（`requiredReadPaths`）：由系统选定的 0–2 条最小集合，`judge_read_file` 只用于核对
   某个路径的某一段/哈希对应正文，不再遍历项目。

### 2.1 证据包内容（结构化、有界）

- `decision`：分组/卡种/flowId/stepId/来源角色/引擎/toolCallId/turnId；
- `requesterStatement`：卡片陈述（preview ≤4KB、detail ≤2KB、turnText ≤4KB，超限截断并标记）；
- `declaredPaths`（写盘卡）：每条路径的
  - `target`：是否存在 + sha256 + 字节数；
  - `probe`：应用 `pathProbes` 的 allowed/reason（缺失标记 `source:"missing"`）；
  - `boundary`：driver 侧可写根/禁写路径复核（含硬禁写前缀）；
  - `declaredContent`：`request_confirmation` 的**逐路径正文**（显式 `paths` + preview 标题/围栏锚点），
    新文件给完整正文、改文件给旧内容 sha256 + 行级变更摘要；`complete:false` 表示正文超有界上限，
    不得 approve；无逐路径正文 ⇒ `available:false`（不得用自由 preview 冒充精确内容）；
- `evidence`：提案/提名/流程/目标角色卡/boundary/引用契约的路径 + sha256 + 关键片段（确定性提取）：
  - 提案：frontmatter + 目标/范围/验收标准/架构方案/架构影响分析/开放问题/风险等章节；
  - 提名：推荐集声明 + 候选角色章节 + 机器解析的 `recommendedRoleIds`；
  - 流程：`parseFlowSteps` 的步骤表（id/status）；
  - 角色卡：工作立场/职责/纪律等章节；boundary：Section 1 `entries` 的 kind/path/purpose 写区；
    （写盘族附**来源角色**的 role-card/boundary；appointment-write 另附**目标角色**的同两项，均为只读可选证据）
  - 契约：引用契约的章节标题清单（只从已读物证正文中确定性提取，≤5 个）；
- `mechanicalFacts`：路径探测、目标文件事实、账本相关决定/派发记录（重读账本，≤20 条）、
  角色枚举（卡片选项/推荐集/任命名单）；
- `conflicts`：请求方陈述与系统事实的冲突（卡片 flowId/cardKind、facts.flowId、推荐集重解析、
  账本 proposalDecision/appointment/澄清计数漂移）；
- `integrity`：`complete`、`problems`、`conflicts`、`packetSha256`（对不含 integrity 的包体做 sha256）、
  `packetBytes`、`maxBytes`、`trimmed`、`requiredReadPaths`、`contentSourceOfTruth:"request_confirmation"`。

### 2.2 有界与 fail-closed

- 证据包序列化上限 64KiB：先删引用契约、再清角色卡/boundary 片段，仍超 ⇒
  `evidence-packet-overflow`（manual）；
- 单条待写正文上限 32KiB；超出 ⇒ `complete:false` + `insufficient-evidence`（manual）；
- 定点抽查只取**存在且 ≤32KiB** 的物证，最多 2 条；大文件由证据包片段承担，不要求读取；
- builder 返回 `ok:false` 时 driver 直接 `manual`，**不调用模型**（fail-closed）；reasonCode 优先级：
  `evidence-conflict` > `artifact-missing` > `ledger-unavailable` > `path-outside-boundary` >
  `path-unverified` > `insufficient-evidence` > `evidence-packet-overflow`；
- 证据采集不跟随符号链接、不读敏感路径：`realpath` 项目根包含性 + `O_NOFOLLOW`（POSIX）+
  与 judge 读策略同口径的敏感类别排除（`.env*`/密钥/凭据/`.ans`/`.git`/`docs/audit` 等），
  命中 ⇒ 该物证按不可读处理（必需物证 ⇒ `artifact-missing`）；
- approve 前 `verifyEvidenceHashes` 重读全部物证/已存在目标：判断期间消失或变化 ⇒
  `manual/evidence-hash-mismatch`。

### 2.3 判定规则变化

- `governance-judge-verdict.ts` 第 5 步不再把全部规范物证并入 required-read，改用 driver 传入的
  最小抽查集（直接调用者未传时保持旧口径，向后兼容）；`artifact-missing` 门槛保留。
- 系统提示改为「基于证据包判断」：写盘卡以 `declaredPaths[].declaredContent.body` 为待写内容权威，
  自由 preview 只是请求方陈述；proposal 架构门槛仍保留，但主证据从「读全文」改为「证据包架构片段 +
  必要时的定点抽查」；appointment/acceptance 以证据包中的推荐集/流程步骤/账本事实为准。
- 提案架构章节**不做** builder 级标题关键词硬门槛（章节命名有变体；由 rubric + 定点抽查判定），
  但物证路径 + sha256 + 可提取片段必须存在。

## 3. 代码改动

- **新增** `src/common/编排/governance-judge-evidence.ts`（约 1.2k 行）：证据包类型、确定性构建器、
  Markdown 片段提取、行级变更摘要、路径/边界探测、账本对账、角色枚举、有界裁剪、
  `verifyEvidenceHashes`。
- **改** `src/common/编排/confirmed-writes.ts`：新增 `declaredPathBodies`（与呈现前完整性闸共用同一份
  锚点/正文判定）；`validateConfirmPreviewCompleteness` 重构为调用它，行为逐字不变。
- **改** `src/common/编排/governance-judge.ts`：删除 `requiredReadPathsFor` / `verifyConfirmPreview`
  与全量物证 required-read；调用前构建证据包（失败直接 manual）；提示传入 packet；
  approve 前哈希复核；新增诊断 `governance-judge.evidence`。
- **改** `src/common/编排/governance-judge-prompt.ts`：系统提示改为证据包优先 + 定点抽查纪律；
  请求提示渲染 packet（compact JSON）、把卡片明确标注为请求方陈述，保留无 packet 时的旧扁平字段
  （向后兼容）。
- **改** `src/common/编排/governance-judge-verdict.ts`：required-read 收窄 + 导出
  `isHardForbiddenPath`（证据包与裁决共用同一份硬禁写前缀）。
- `src/pipeline/orchestration/run-role.ts` / `govern-session.ts` **无需改动**：`judgeContext` 形状不变，
  证据包完全由 driver 从 request + 盘面生成；桌面也只透传卡片与 `judgeContext`。

## 4. 测试与验证

新增 `test/编排/decision-evidence-packet.test.ts`（14 例）：

- 证据包确定性（同一请求 + 同一盘面 ⇒ 同一 `packetSha256`）；
- 写盘卡新文件完整正文 / 改文件旧哈希 + 变更摘要；自由 preview 无逐路径正文 ⇒ 不完整；
- 提案 sha256 + 架构/验收片段；最小抽查集；
- 提名推荐集进入角色枚举；与应用推荐集不一致 ⇒ `evidence-conflict`；
- 验收流程步骤 + 账本记录；facts 与重读账本漂移 ⇒ `evidence-conflict`；
- 卡片 flowId 与请求 flowId 冲突；路径探测失败/缺失；
- 关键物证缺失 ⇒ 模型不调用；判断期间哈希漂移 ⇒ `manual/evidence-hash-mismatch`；
- 6 个已存在写目标仍只要求 ≤2 条定点抽查；超大正文截断 ⇒ manual；
- 证据包不跟随符号链接（指向项目外的物证 ⇒ `artifact-missing`，不泄露外部内容）；
- 证据包不读敏感路径（`.env`/凭据/密钥/`.ans`/`.git`/`docs/audit` 等 ⇒ `artifact-missing`，不泄露凭据）。

更新 `test/编排/governance-judge.test.ts` 既有夹具：写盘卡补逐路径正文、物证补真实文件与架构章节、
验收/任命补账本事实（与新证据包对账口径一致）；断言未放宽，只按新契约调整 reason 文案与夹具。

实测（本工作树）：

- `node --test "test/编排/**/*.test.ts"` → **589 tests / 589 pass / 0 fail / 0 skipped**（exit 0）；
- `npm run typecheck` → **exit 0**（0 错误）。

## 5. 跨角色依赖

1. **运行时核心/桌面**：无需改动。`GovernanceJudgeRequest`/`judgeContext` 形状未变；桌面仍只透传
   卡片 + `judgeContext`；`judge_read_file` 工具面不变。若后续希望 judge 直接核对哈希，可考虑让
   `judge_read_file` 返回 `sha256`（本次未要求，driver 已在系统侧复核）。
2. **测试角色（`test/测试/governance-judge-cards-verify`）**：5 个用例需要按新契约更新夹具（本次只读
   运行、未修改）：
   - `b-card-kinds` appointment：nomination 文件推荐集是 `project-a`，而 request 传
     `role-x/role-y`——真实 run-role 从同一文件解析，这属于应被拦下的冲突；
   - `b-card-kinds` 写盘三卡：preview 只有路径声明、没有逐路径正文——按 run-role 的呈现前完整性闸
     这类卡本就不应发出；夹具需补 `## <路径>` + 正文；
   - `b-card-kinds` acceptance 两例：facts 声称提案已接受，但夹具没有账本文件——需补
     `customer.decision(proposal-accept)` 与 `dispatch.accepted`；
   - `required-read` 用例：同一账本缺失问题。
   失败原因均为上述夹具口径，不是 driver 判定回归（其余 38 例通过）。
3. **测试角色（`test/测试/governance-e2e-auto`）**：沿用旧式写盘预览/无账本事实的夹具预计同类失败，
   需属主按 `2026-10-19_change_write-confirm-preview-completeness.md` §6 的同一批补正文/账本。

## 6. 残余风险

- **内容漂移（O-A1）**：证据包的待写内容是 `request_confirmation` 的结构化载荷（preview 逐路径正文），
  不是 `write_file` 实际字节；客户 2026-10-12 已裁定不采纳写时内容哈希比对，本包只保证「声明内容
  可核对」，不保证「写出内容 = 声明内容」。驱动已明确标注 `contentSourceOfTruth`。
- **账本漂移冲突可能偏严**：`facts` 与重读账本在 proposalDecision/appointment/澄清计数上不一致时
  直接 `evidence-conflict`。run-role 在发卡前刷新账本，正常情况下一致；若本地未落盘决定恰好落在
  判断窗口，可能多一次 manual（fail-closed 方向）。
- **定点抽查依赖文件 ≤32KiB**：更大的文件只靠证据包片段（架构章节片段上限 12KiB）；若关键信息在
  片段之外，模型可能 manual。这是「有界」与「完整」的权衡，方向是 fail-closed。
- **片段提取是标题启发式**：章节标题变体（如 `## 设计`）可能不被归入架构片段；rubric 允许经
  requiredReadPaths 定点抽查核对 proposalPath，仍不合格才 manual。
- **证据包上限 64KiB**：极端多文件写卡会先裁剪契约/角色卡片段；仍超则 manual。
