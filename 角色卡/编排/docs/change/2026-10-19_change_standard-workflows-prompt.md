# 2026-10-19 变更：治理提示注入标准工作流与 Proof 自动派发口径

## 来源

客户 2026-10-19 反馈（原话）：

- 「这个独立核准应该是标准流程，而不是我在发给他。」
- 「内置角色应该有自己的工作流。」

落点：阶段流转与独立核准都应属于应用的标准流程，内置角色按标准工作流执行，客户只做决定、
不做内部调度；应用在流程齐备后自动派发 Proof / 验收，不需要客户手动触发。

## 改动

### 1. `src/pipeline/orchestration/govern-session.ts`

- L563-586：新增 `STANDARD_WORKFLOW_PROMPT` 常量（与门禁引擎五张内置治理角色卡的「标准工作流」
  章节**成对同步**；分层禁止导入其他角色私有 common，本层复制并注明单一来源为
  `src/common/门禁引擎/governance-roles.ts` 的卡文本；注释互指）。内容：
  - **标准工作流（阶段流转由应用负责）**：内置角色按标准工作流执行——意图确认 → 提案与契约 →
    任命与角色卡 → 流程与派发 → 独立验收；trio 依次由 Lead / Draft / Crew / Steward / Proof 承担，
    single/su 由同一治理角色按同一顺序推进。
  - **客户不做内部调度**：客户不需要逐阶段手动转交或触发；只有需要客户决定的事项（提案接受、
    任命、写盘确认、验收）才经治理卡呈给客户。
  - **Proof 的标准复核流程（独立核准是标准流程，不是客户手动转交）**：① 读证据（流程单、提案/契约、
    交付与回交报告、演示证据路径）→ ② 用审批档 shell 跑测试（逐条执行提案声明的单元/集成/端到端测试，
    命令逐条提交审批并记录输出）→ ③ 真实启动演示（启动命令、可访问性、截图/录屏）→ ④ 质量/架构核对
    （工程质量基线逐项 + 实现与架构方案/影响分析一致）→ ⑤ 验收卡（证据写入
    `docs/verification/<flowId>-v1.md`，再发 `request_choice{cardKind=acceptance}`）。
  - **自动派发**：应用会在流程齐备（执行步骤全部 done 且均有 `dispatch.accepted`、无未结算决定、
    验收步骤 pending）后自动派发 Proof / 验收，不需要客户手动触发；自动派发不是验收决定——验收卡仍由
    Proof 核对后发出，由客户/判断 agent 决定。
- L613-617：`buildGovernPrompt` 文档注释补充本批来源与「与门禁引擎角色卡成对同步」。
- L641-655：single/su 分支新增 `workflow` 组合，并追加到三个返回分支
  （无目标角色可写 / 无目标角色只读 / 指定目标角色）；原有「旧文案逐字保留」的内容未动。
- L685：trio 返回在角色纪律之前追加 `STANDARD_WORKFLOW_PROMPT`；原有顺序
  （质量基线 → 架构要求 → shell 审批档）不变。
- L763-764：`verification` 角色纪律新增「独立核准是标准流程」一句：收到验收任务即按标准复核流程执行，
  不得等待客户手动转交、不得要求客户触发验收。

### 2. `src/common/编排/governance-ledger.ts`（核查结论 + 注释）

- **结论：无需新增 kind 或字段**。`GovernanceLedgerEntry` 已支持
  `dispatch.accepted{targetRoleId, stepId, trigger}`；自动派发 Proof 可直接写
  `{kind:"dispatch.accepted", actorRoleId:"app", power:"app", trigger:"settle", flowId,
  stepId:"verification", targetRoleId:"verifier"}`。
- 去重契约：`dispatch.accepted` 的去重键是 **flowId+stepId**（见
  `src/common/编排/governance-gate.ts` 的 `duplicate-dispatch` 判定），与 targetRoleId 无关；
  应用侧自动派发去重用同一谓词即可。
- L59-67：`GovernanceLedgerTrigger` 注释补充 `"settle"` 也用于流程齐备后的应用自动派发（含 Proof）。
- L84、L96：`stepId` 与 `targetRoleId` 字段注释补充去重键与 verifier 口径。
- **未改**桌面触发逻辑（`app/desktop/**` 属桌面属主）；本批只确认账本形状兼容并补注释。

### 3. 测试

- `test/编排/governance-session.test.ts` L370 新增 1 例：trio 五个 function 与 single/su 的默认提示
  均含标准工作流/客户不做内部调度/流程齐备后自动派发 Proof/不需要客户手动触发/自动派发不是验收决定/
  Proof 复核顺序（读证据 → 跑测试 → 真实启动演示 → 质量/架构核对 → 验收卡）关键字。
- `test/编排/governance-ledger.test.ts` L163 新增 1 例：自动派发条目
  （targetRoleId=verifier、stepId=verification、trigger=settle）可记录/读回；旧条目缺 `trigger` 仍合法
  （向后兼容）；flowId+stepId 去重谓词命中/未命中。
- 既有断言零放宽（`governance-session.test.ts` 原提示词用例的「不得写已批准/已授权」等断言保留）。

### 4. 文档

- 本变更记录；`角色卡/编排/changelog.md`；`角色卡/编排/memo.md`。

## 测试与验证（真实输出）

工作树含其他角色未提交改动（运行时核心判断链、门禁引擎、桌面等）。本批改动前先跑基线。

| 命令 | 结果 |
| --- | --- |
| 基线（改动前）`node --test "test/编排/**/*.test.ts"` | **585 计 / 585 过 / 0 红 / 0 skipped** |
| 定向 `node --test test/编排/governance-session.test.ts test/编排/governance-ledger.test.ts` | **32 计 / 32 过 / 0 红** |
| 改动后 `node --test "test/编排/**/*.test.ts"` | **587 计 / 587 过 / 0 红 / 0 skipped**（+2 例） |
| `npm run typecheck` | **exit 0**（`tsc --noEmit` 无错误；仅 npm 的 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 配置告警） |

## 跨角色依赖（未越界修改，如实登记）

1. **门禁引擎属主（`src/common/门禁引擎/governance-roles.ts`）**：五张内置治理角色卡需同批加入
   「标准工作流」章节，与本层 `STANDARD_WORKFLOW_PROMPT` 逐字对齐（阶段顺序、客户不做内部调度、
   Proof 五步复核、流程齐备后自动派发 Proof）。分层规则禁止本角色导入其私有 common，本层已复制并
   在注释中标明单一来源；门禁引擎侧注释请互指
   `src/pipeline/orchestration/govern-session.ts::STANDARD_WORKFLOW_PROMPT`。
2. **桌面属主（`app/desktop/**`）**：自动派发触发逻辑归桌面，本批未改。账本形状已就绪——若桌面为
   Proof 自动派发补记录/去重，可直接写
   `dispatch.accepted{targetRoleId:"verifier", stepId:"verification", trigger:"settle"}`；
   现有 `flowCompletionIssue` 明确验收步骤（`acceptance`/`verification`）不参与「执行步骤必须 done 且
   均有 dispatch.accepted」判定，写该条不会阻断验收触发。
3. **桌面 su 聊天**：不经 `buildGovernPrompt`（直接走 `openRoleSession` + 用户消息），标准工作流要靠
   门禁引擎角色卡文本覆盖——这也是第 1 条必须同批落地的原因。

## 残余风险

- **提示词是行为约束，不是机械门禁**：本批未新增任何自动校验「模型是否遵守标准工作流」的门禁；
  Proof 是否真的跑测试/启动演示，仍依赖其执行与核对报告证据。
- **两处文案漂移**：编排常量与门禁引擎角色卡是两份物理副本（分层禁止跨角色导入），只能靠注释与
  评审同步；建议后续由测试角色加跨文件逐字比对（本批未越界新增）。
- **single 模型的自动派发口径**：single 没有独立的 Proof / verifier 角色，桌面收尾推进对 non-trio
  项目直接返回；提示中的「single/su 按同一顺序推进」是行为要求，不是对现有桌面自动化的声明。
- **去重键复用**：`dispatch.accepted` 的去重键是 flowId+stepId，与统筹的人工派发共用。若未来流程把
  `verification` 作为执行步骤派给项目角色，会与自动派发记录冲突；当前桌面把验收步骤单列、不派统筹，
  风险可控，但流程命名需保持「验收步骤 id 不用于执行派发」。
- **桌面记录尚未落地**：账本兼容已验证，但 Proof 自动派发目前由桌面 `sendBackground` 直接投递、不写
  `dispatch.accepted`；去重仍靠桌面运行期 Set（每进程有效）。跨进程去重需桌面改为读账本，属其后续批次。

## 边界声明

只写 `src/pipeline/orchestration/govern-session.ts`、`src/common/编排/governance-ledger.ts`、
`test/编排/governance-session.test.ts`、`test/编排/governance-ledger.test.ts` 与本角色
`角色卡/编排/**` 文档；未改 `app/**`、`src/common/门禁引擎/**`、运行时核心/适配器、其他角色文件；
未执行 git 提交；未读 `.env`、未发真实模型请求。
