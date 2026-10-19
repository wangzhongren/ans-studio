---
id: change_role-standard-workflows
type: change
title: 五张内置治理角色卡加入「标准工作流」，阶段流转由应用负责
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: 五张内置治理角色卡文本新增「标准工作流（按序执行）」章节 + 单一来源总则 `STANDARD_WORKFLOW_PRINCIPLE`；权力、Section 1、预授权、禁写、能力位、治理卡参数与判定逻辑零变化
events:
  - date: "2026-10-19"
    kind: implemented
    summary: Lead 需求→质量档位→写意图→意图确认卡→hand_off_intent；Draft 读意图→提案（架构/质量齐备才出卡）→提案卡→接受后冻结契约；Crew 读提案与流程→提名→任命卡→appointment-write 逐路径写卡→角色就绪；Steward 流程单→派发项目角色→收齐回交→登记完成→应用自动派 Proof；Proof 标准复核（真实跑测试/真实启动演示/逐条核对）→验收卡
  - date: "2026-10-19"
    kind: verified
    summary: 门禁引擎套件 280 计 / 279 过 / 0 红 / 1 skip（新增 8 例）；`npm run typecheck` exit 0；未提交 git
---

# 五张内置治理角色卡加入「标准工作流」

## 客户原始反馈（原话）

> 这个独立核准应该是标准流程，而不是我在发给他。

> 内置角色应该有自己的工作流。

客户指出：独立核准（验收）应当由应用按标准流程自动推进，而不是每次由客户手动派发给 Proof；
五个内置治理角色也应当各自带有可执行的标准工作流。本批只做**门禁引擎**属主部分——五张内置
治理角色卡文本、单一来源总则常量、测试与文档；权力、Section 1、预授权、禁写、能力位、治理卡
参数与判定逻辑零变化。

## 标准工作流总则（单一来源常量，五卡逐字复用）

`src/common/门禁引擎/governance-roles.ts` 的 `STANDARD_WORKFLOW_PRINCIPLE` 逐字如下：

```text
阶段流转由应用负责：你按本角色的标准工作流执行；客户只在需求确认、提案/任命/写卡、验收卡上做决定，不承担内部角色调度。不要等客户催办，也不要替应用推进下一阶段。
```

五张卡各新增 `## 标准工作流（按序执行）` 章节（位于「不拥有最终批准权」段之后），章节末尾
逐字复用上述总则。

## 各角色标准工作流（卡片文本）

| 角色 | 标准工作流（按序） |
| --- | --- |
| Lead / 主理（`liaison`） | ① 接收客户需求（确认目标/范围/验收标准/质量档位；客户未指定默认生产档；信息不足先问客户，不猜测、不自行降档）→ ② 记录质量档位（写入意图 acceptance）→ ③ 写意图 `docs/intents/<flowId>.md` → ④ 意图确认卡（`cardKind=intent-confirm`，confirm/revise）→ ⑤ 客户 confirm 后 `hand_off_intent`，应用后台投递给 Draft。 |
| Draft / 提案（`rapporteur`） | ① 读意图与 acceptance → ② 形成提案 `docs/proposals/<flowId>-v1.md`（必须含架构方案/架构影响分析与「质量基线与证据计划」；**缺失架构或质量章节不得出提案卡**）→ ③ 提案卡（`cardKind=proposal`，accept/accept-quick/revise/reject）→ ④ 客户接受后把跨角色契约冻结为 `docs/contracts/<name>-v1.md`（版本化、不原地改），由应用推进到组队阶段。 |
| Crew / 组队（`nominator`） | ① 读提案架构模块与流程单 → ② 提名 `docs/nominations/<flowId>-v1.md`（候选/理由/`recommended:` 推荐集；推荐集只列项目角色；**模块—写区一一对应**、禁止重叠）→ ③ 任命卡（`cardKind=appointment`；不自行任命）→ ④ 收到任命决定后 `appointment-write` 逐路径确认写卡 → ⑤ 写卡全部完成后角色才就绪，由应用推进到流程阶段。 |
| Steward / 统筹（`convener`） | ① 写流程单 `docs/flows/<flowId>.md`（stepId 第一列；含 contract-freeze、集成/端到端与 verification 步骤；引用架构模块/边界）→ ② 只向已任命且已写卡的项目角色 `dispatch_task`（stepId 一致；不派发治理角色）→ ③ 收齐回交、核对交付与证据 → ④ 登记完成（不把「已派发」写成「已完成」）→ ⑤ **流程齐备后由应用自动派 Proof**；Steward 不派发治理角色、不代替验收、不催办。 |
| Proof / 验收（`verifier`） | **标准复核不依赖客户催办**：① 读流程单/提案/契约/架构影响分析 → ② 用审批档 shell **真实跑测试**并保留输出（不得以「工具无 shell」跳过）→ ③ **真实启动应用并演示**（启动命令、访问地址、关键输出、截图或录屏）→ ④ 逐条核对质量基线（结论+证据出处）与架构声明（模块边界/依赖方向/扩展点/版本迁移；偏离列为不通过）→ ⑤ 发验收卡（`cardKind=acceptance`，accept/reject）；**架构或质量章节缺失、未真实运行、未演示时不得建议 accept**；流程齐备后应用自动派发验收，**不接受客户手动派发作为常态**。 |

## 影响面（本角色边界内）

| 文件 | 变更 |
| --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | 文件头新增 2026-10-19 客户反馈注记（L21-27）；新增单一来源常量 `STANDARD_WORKFLOW_PRINCIPLE`（JSDoc L157-161，常量 L162-163）；五卡各插入标准工作流章节：Lead（L176-183）、Draft（L247-253）、Crew（L306-313）、Steward（L398-405）、Proof（L461-469） |
| `test/门禁引擎/governance-standard-workflow.test.ts` | 新增 8 例：五卡各恰有一个标准工作流章节与总则；五角色关键步骤逐条断言（含 Lead「信息不足先问客户/不自行降档」、Draft「缺失架构或质量章节不得出提案卡」、Crew「模块—写区一一对应/不自行任命」、Steward「应用自动派 Proof/不派发治理角色/不代替验收/不催办」、Proof「真实跑测试/真实启动应用并演示/验收卡/不接受客户手动派发作为常态」）；既有 shell 审批档、质量基线、写区/禁写、判断代批与治理卡参数逐字保留；注册表 Section 1、预授权、禁写与 shell 档保持原值 |
| `角色卡/门禁引擎/docs/change/2026-10-19_change_role-standard-workflows.md` | 本变更记录（新） |
| `角色卡/门禁引擎/changelog.md` | 顶部新增本批记录 |
| `角色卡/门禁引擎/memo.md` | 顶部新增本批备忘与续接线索 |

**未改动**任何放行/拒绝判定、Section 1 条目、预授权目录、`forbiddenWritePaths`、能力矩阵
（`shell` 等能力位一位未动）、应用专用治理边界、治理卡参数或确认/审批实现。未碰 `app/**`、
`src/pipeline/**`、`src/common/编排/**`、`src/service/**`、其他角色文件/测试、真实项目；
不读 `.env`、不跑真实模型/凭据/网络；未 git 提交。

## 既有内容逐字保留

五张卡的以下段落一字未动：shell 审批档单一来源行、`ENGINEERING_QUALITY_BASELINE` 全文、
「不拥有最终批准权」、判断代批纪律、治理卡参数纪律（`flowId` + `cardKind` 白名单）、治理文件
命名规则、可写目录（Section 1）、禁写路径与应用独占路径、各角色「你的质量职责」。新增内容只
追加章节，不覆盖、不改写任何既有句子。

## 跨角色依赖（须各自属主决定是否同步，本角色未越界修改）

1. **编排（`src/pipeline/orchestration/govern-session.ts:563-586`）**：已存在配对的
   `STANDARD_WORKFLOW_PROMPT`，其注释明记「与门禁引擎五张内置治理角色卡（Lead / Draft / Crew /
   Steward / Proof）的「标准工作流」章节**成对同步**：单一来源在
   `src/common/门禁引擎/governance-roles.ts` 的角色卡文案……任一侧改文案必须同批同步」。
   本批实现后，两侧语义一致（阶段流转由应用负责、客户不做内部调度、Proof 标准复核五步、流程
   齐备后应用自动派发 Proof）；今后改文案须两处同批。该文件属编排，本角色未改。
2. **桌面（`app/desktop/interface.ts:811-874`）**：已实现「流程齐备后自动派 Proof / 验收」——
   `dispatchAcceptanceAfterHandback` 在回交 settle 后检查流程完成度（全部步骤 done 且均有
   `dispatch.accepted`、无未结算决定），满足后后台开启 `verifier` 会话并投递验收任务；不自动
   验收、不代批。本卡文本「应用自动派 Proof」与该实现一致；桌面属主无需为本批改动。
3. **编排 / 判断 agent（`src/common/编排/governance-judge.ts`）**：验收卡的机械门槛仍只核对
   流程完成度；「未真实运行/未演示/架构缺失不得建议 accept」仍是卡片行为约束。若要做成机械
   硬门槛，需编排属主扩展验收物证检查。
4. **运行时核心 / 装配（`src/provider/runtime/**`）**：`dispatch_task` 对内置治理角色的拒绝与
   Steward「不派发治理角色」已有机械守卫；「不代替验收、不催办」仍是行为约束。
5. **README / 产品文档**：角色职责与标准流程概览如逐项列出，由文档属主同步。

## 残余风险

- **工作流主要是行为约束**：门禁层不解析 Markdown；Lead 是否先问客户、Draft 是否真的因缺章节
  不出卡、Crew 是否逐路径写卡，最终依赖模型执行卡片文本与客户/判断 agent 审查。
- **自动派发的触发条件由应用实现**：卡文本声明「流程齐备后由应用自动派 Proof」，实际触发门在
  桌面/编排；若流程单或账本口径变化，卡文本与运行时可能漂移（两侧须同批同步）。
- **客户手动派发仍可能发生**：卡片只是声明「不接受客户手动派发作为常态」，无法阻止客户在应用
  之外主动打开 Proof 会话。
- **卡片继续变长**：每张卡新增约 7-8 行工作流，提示词 token 成本上升；未做长度预算评估。
- **「真实跑测试/真实启动演示」不可机验**：启动命令、地址、截图/录屏是物证，本角色不做真实性
  核验；最终判断在客户/判断 agent。
- 真机端到端（需求→提案→任命→流程→自动派 Proof→标准复核→验收卡）与独立复验未进行。

## 验证（真实输出）

| 命令 | 结果 |
| --- | --- |
| `node --test "test/门禁引擎/**/*.test.ts"` | exit 0；**tests 280 / pass 279 / fail 0 / skipped 1 / todo 0**（skip 为既有 Windows 专属用例；本批新增 8 例，基线 272 计 / 271 过 / 1 skip） |
| `npm run typecheck` | exit 0（仅 npm 对 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 用户配置的弃用提示，无 TS 错误） |

既有断言未放宽、未改动：五卡 shell 审批档、审批/读写语义、工程质量基线逐字包含、无最终批准权、
可写/禁写、应用独占路径、judge 代批纪律、flowId/cardKind 参数、文件名推导、角色专属 cardKind
白名单、禁写矩阵、能力矩阵、边界与写权用例全部保持原样并通过。
