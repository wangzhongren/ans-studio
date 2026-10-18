---
id: governance-judge-cards-independent-verification
type: fix
title: 「替我审批」/「替我决策」双开关与治理判断 agent 独立端到端验证（测试角色）
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: verified
related: [judge-governance-cards-review, judge-governance-cards, shell-auto-approve-review, governance-liaison]
events:
  - date: "2026-10-18"
    kind: created
    summary: 按 PM 评审 §三–§九/§十二（AC1–AC26）独立验证双开关与治理判断 agent——自建 `test/测试/governance-judge-cards-verify/` 41 例离线端到端（双开关矩阵、六卡种+accept-quick、回落矩阵、账本审计、队列/一次性/judging、UI 文案与静态接线）；修正本角色 7 条因新契约失效的旧 shell judge 断言（未放宽）；本批 41/41；全量 2893/2874 pass/16 fail/3 skip（新增红 0；既有红 16：Windows symlink EPERM 9、shell 无竞态 1、markdown vendor pin 1、桌面 renderer/runtime-ui 源码钉 5）；typecheck 0；登记 3 项观察（验收机械门槛未覆盖 flow 步骤/阻塞、operator-channel 聊天出路仍用旧名「替我审」、single/无 cardKind 按契约原卡且无 notice）
  - date: "2026-10-18"
    kind: reverified
    summary: 属主修复两项观察后复验——① 编排 acceptance 补机械门槛（流程各步 done、每步有 `dispatch.accepted`、无阻塞/未结算决定/未闭环澄清，否则 manual）；② shell 出路统一「关闭『替我审批』后重试」（编排+桌面）。本角色新增 acceptance 机械门槛 5 例（pending/缺 dispatch/blocked/无步骤表/unclassified），并把 shell 出路 `EXIT_LINE` 与 reason 断言同步为新口径；本批 **42/42**、`shell-judge-verify` 36/36；全量 **2896/2877 pass/16 fail/3 skip**（新增红 0）；typecheck 0；残余仅 single/无 cardKind 按契约无 notice 与内容漂移等已登记风险
---

# 「替我审批」/「替我决策」双开关与治理判断 agent 独立端到端验证（测试角色）

**验证对象**：PM 评审 [2026-10-18_design_judge-governance-cards-review.md](../../../项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md)（status `approved`，revision 1）已落地的运行时核心 / 编排 / 三适配器 / 桌面窗口 / 桌面UI 实现（2026-10-18 工作树）。
**验证范围**：双开关启用矩阵与独立性、判断发生点与 `judging` 状态机、六卡种 rubric 与 `accept-quick` 不代批、逐路径机械复核、required-read、负向与全部失败回落、按组回落、账本 `decisionEvidence.kind:"judge"` 审计、一项目一卡/同一 id 只答一次/`onNextStep` 恰一次、UI 两开关/警告/结果行/notice/桥缺失禁用。
**纪律**：只写 `test/测试/` 与 `角色卡/测试/` 自有文档；未改 `src/`、`app/`、其他角色测试或资料；未读取 `.env`、未使用真实凭据、未启动真实模型/网络、未 git 提交。

## 一、环境

| 项 | 值 |
| --- | --- |
| 平台 | Windows 11 Home China（win32） |
| Node | v24.11.1 |
| 基线 | `main` / 工作树含本轮各角色在途改动（双开关实现未提交） |
| 测试命令 | `node --test "test/**/*.test.ts"`（**三层 glob**） |
| 类型检查 | `npm run typecheck`（TypeScript 7.0.2） |
| 网络/模型 | 全部离线；判断 driver 用假适配器脚本（读取 → `report_governance_judgement`），会话入口用确定性假适配器（脚本化工具调用） |

## 二、夹具

新增目录 `test/测试/governance-judge-cards-verify/`（`fixture.ts` + 6 个用例文件，**41 例**），全部在系统临时目录构造、用后清理：

- `fixture.ts`：临时项目（提案/提名/流程单/项目角色 + `.env` 哨兵）、按卡种构造 `GovernanceJudgeRequest`（paths/pathProbes/写根/禁写/物证/推荐集/facts）、**判断会话假适配器**（真实 `buildGovernanceJudgeTools` 读文件后再交回 report）、**普通角色会话假适配器**（脚本 → 真实 `buildGovernedTools` → 事件）、双开关通道（真 `createCustomerInputChannel` + 真 `createShellJudgeSwitch`）、账本等待、真 `ui-labels.js` 装载。
- `a-switch-matrix.test.ts`（**5 例**）：两开关都关/仅 approval/仅 decision/都开/独立性与关闭恢复。
- `b-card-kinds.test.ts`（**11 例**）：proposal、accept-quick、appointment、写盘三卡、acceptance、required-read、负向与失败、message 降级、三引擎、工具集并集、夹具自检。
- `c-fallback.test.ts`（**9 例**）：证据不足/读失败/超时/引擎不可用/解析失败、无 cardKind、single/su、按组隔离、通道超时、结果行失败、判断中关开关、中止/关窗、driver busy。
- `d-audit-ledger.test.ts`（**4 例**）：proposal 账本 `kind:"judge"` 全字段、客户手答仍 `customer-input`、写盘 `judge.paths`、错组不翻转归因。
- `e-queue-once.test.ts`（**5 例**）：一项目一卡队列、judging 占卡/跨项目并行、replay 不重判、manual 卡 replay、`onNextStep` 恰一次。
- `f-ui.test.ts`（**7 例**）：复选框/标签、桥缺失/single 禁用、一次性警告、结果行、回落提示、preload 四方法、主进程分组接线与不持久化。

关键判据：

- **驱动层** = 真实 `createGovernanceJudge` + 真 `buildGovernanceJudgeTools`；模型动作由假适配器脚本表达（先 `judge_read_file` 再 `report_governance_judgement`）。
- **通道层** = 真实 `createCustomerInputChannel` + 真开关状态机；判断函数注入假件，但状态机、队列、结果行、notice 全为真实现。
- **账本审计** = 真实 `openRoleSession` + 真受治理工具 + 桌面通道桥接；账本只读 `.ans/governance/ledger.jsonl` 断言。
- **UI** = 真 `ui-labels.js` 纯函数 + `index.html`/`preload.cjs`/`main.ts`/`renderer.js` 静态契约；未启动 Electron。

## 三、逐项结果（AC1–AC26）

| 编号 | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC1 | 两个开关都关 | **通过**：写盘/提案均原卡；judge 0 次调用；无结果行；无 judgeNotice | a「两个开关都关」 |
| AC2 | 仅开 approval | **通过**：写盘族代批（0 卡/1 行/`group:"approval"`）；提案仍原卡且 judge 不参与 | a「仅开 approval」 |
| AC3 | 仅开 decision | **通过**：提案代批；写盘仍原卡且 judge 不参与 | a「仅开 decision」 |
| AC4 | 两个都开 | **通过**：两类卡都代批；结果行各一；0 卡；next-step 按卡各一次（写盘 `nextFunction:null`） | a「两个都开」 |
| AC5 | proposal accept 代批 | **通过**：读规范提案后仅 `["accept"]`；审计 group/cardKind/engine/model/reason/evidence/selected；账本 `proposal-accept/accepted/kind:"judge"`；`onNextStep` 一次派 Nominator | b proposal、d proposal |
| AC6 | proposal 回落 | **通过**：缺证据/读失败/超时/解析失败均原卡+notice；不写 judge 决定；客户手答为 `customer-input` | c、d 回落 |
| AC7 | accept-quick 不代批 | **通过**：只选 `accept-quick`、多选含快捷路径、卡片无 `accept` 均 `manual/not-recommended`；同卡选 `accept` 仍可批 | b accept-quick |
| AC8 | appointment 代批 | **通过**：按应用推荐集恰等选择；多选卡片；账本 `targetRoleIds` 由真实通道结果产生（分类照旧） | b appointment |
| AC9 | appointment 回落 | **通过**：选多/选少/重复/内置 id/无推荐集/推荐不在选项/单选多推荐均 manual | b appointment |
| AC10 | 写盘逐路径代批 | **通过**：`write`/`appointment-write`/`schedule-write` 全 probe allowed + `pathDecisions` 全覆盖 ⇒ `confirmed:true`；账本 `judge.paths` 逐路径；发行路径照旧入账 | b 写盘三卡、d 写盘 |
| AC11 | 写盘逐路径回落 | **通过**：probe 越界/缺 pathDecision/空路径/来源写区不符/未任命目标/flowId 不符 ⇒ 整卡 manual | b 写盘三卡 |
| AC12 | 验收代批 | **通过**：物证已读 + facts 已接受 + 无坏行/无未闭环澄清 + **流程各步 done 且每步有 `dispatch.accepted`、无未结算决定** ⇒ `accept` | b acceptance/机械门槛 |
| AC13 | 验收回落 | **通过**：`revise`/缺 proposalDecision/澄清未闭环/`ledgerErrors>0`/`reject`/流程 pending 或 blocked/缺 dispatch/无步骤表/unclassified 决定均 manual | b acceptance/机械门槛 |
| AC14 | 回落安全（按组） | **通过**：证据不足/读拒绝/超时/引擎不可用/解析失败/开关关闭/中止/关窗/结果行失败全部原卡+notice；另一组不受影响（双向） | c |
| AC15 | 不代拒绝 | **通过**：`revise`/`reject`/空/未知 id 一律 manual，无自动拒绝 | b 负向 |
| AC16 | 审计可区分 | **通过**：`kind:"judge"` + group/cardKind/engine/model/reason/evidence/selected/paths；客户手批 `customer-input` 且无 judge 子字段；聊天行含「judge 代批 · 代审批/代决策」不含「客户本人已批准」 | d、f |
| AC17 | 结果行失败 | **通过**：投达抛错 ⇒ `manual/row-failed` 原卡，notice 说「判断已完成」不说「未代批」，不自动结算 | c row-failed |
| AC18 | 队列/顺序/一次性 | **通过**：同项目第二张排队不呈现；judging 不计 pending/pendingRoles；跨项目可并行；replay 不重判；same id 第二次 `expired`；`onNextStep` 恰一次 | e |
| AC19 | 只读沙箱 | **通过**：judge 工具恰三只；deny-all 写门禁；`persistSession:false`；`.ans/**` 读取 app-private 拒绝；demo ⇒ `unsupported-engine` 且 0 bind | b proposal/required-read/三引擎 |
| AC20 | single/su | **通过**：decision 与写盘族均不判断（judge 0 次/无结果行/无 notice），原卡逐张 | c single/su |
| AC21 | 开关独立性/关闭/重启 | **通过**：toggle 一组不改另一组；判断中关开关 ⇒ `switch-off` 原卡；两开关各自 reset（静态接线）；renderer 不写 judge localStorage；结果行不因 replay 重复 | a、c、f |
| AC22 | required-read | **通过**：未读必读物证 ⇒ `artifact-not-read`；读敏感文件 ⇒ `read-denied`；物证缺失 ⇒ 启动会话前 `artifact-missing` | b required-read |
| AC23 | 机械逐路径 | **通过**：模型对越界路径报 `ok:true` 仍 `path-outside-boundary` | b 写盘三卡 |
| AC24 | 适配器并集 | **通过**：治理工具恰三只、shell 工具仍恰三只、`ALL_JUDGE_TOOL_NAMES` 恰四只（含两个 report）；三引擎 driver 均通过 | b 工具集/三引擎 |
| AC25 | 回执口径 | **通过**：`out.judge` 存在时 `request_choice` 回执含「判断 agent」「已代批」「这不是客户本人点击」；客户手答保持「客户已选择」 | d proposal/回落 |
| AC26 | 全量回归 | **通过（本批）**：`node --test "test/**/*.test.ts"` → 2893 总 / 2874 pass / 16 fail / 3 skip，**本批新增红 0**；`npm run typecheck` → 0 错 | 见 §五 |

**未由本批覆盖（如实登记）**：真实模型/真实引擎会话（三引擎 driver 路径用假适配器验证；适配器原生工具面由各属主单测覆盖）；Electron 真窗 e2e（UI 用纯映射 + 静态契约）；内容漂移（预览 A 写 B，评审 R3 明确 V1 不消除）；结果行跨重启回放（评审默认不做）。

## 四、旧断言修正（`test/测试/` 内，均为新契约同步，未放宽）

| 文件 | 旧断言 | 新断言（依据） |
| --- | --- | --- |
| `shell-judge-verify/a-allow-flow.test.ts` | 开关标签「替我审」；警告三行且首行含「只有判断没发生」；结果行标题 `已替你放行（判断 agent）` | 「替我审批」；警告 **4 行**（approval 段 + 3 条通用：只读范围/accept-quick/模型调用）；标题 `已替你放行（判断 agent · 代审批）`（评审 §9.1/§9.2/§10.2） |
| `shell-judge-verify/b-deny-flow.test.ts` | `未放行（判断 agent）`；retryHint `关闭「替我审」后重试` | `未放行（判断 agent · 代审批）`；`关闭「替我审批」后重试`（§10.2；复审后通道 payload 的 `EXIT_LINE` 与 reason 也已统一为「替我审批」） |
| `shell-judge-verify/e-deny-tier.test.ts` | `已替你放行（判断 agent · deny 档）` / `已替你放行（判断 agent）` | `… · 代审批 · deny 档` / `… · 代审批`（§10.2） |
| `shell-judge-verify/f-readonly-sandbox.test.ts` | `.ans/sessions/x.jsonl` 断言 /敏感/；`.ans` 可列且只隐藏 sessions；未覆盖账本 | `.ans` 任何段 ⇒ /应用私有数据/（app-private）；`.ans` 列表**整体拒绝**；新增 `.ans/governance/ledger.jsonl` 拒绝且不泄露（§6.3，更严） |

修正后 `test/测试/shell-judge-verify/` 36/36 全绿。

## 五、全量与 typecheck

| 命令 | 结果 |
| --- | --- |
| `node --test "test/**/*.test.ts"` | **2896 总 / 2877 pass / 16 fail / 3 skip**（首轮 2893/2874/16/3；属主修复 acceptance/出路后本角色新增 3 例并复跑全绿；本批前基线 2852/2825/24/3；本角色旧断言修正使 7 条既有红转绿；另有 1 条基线红 `桌面应用/message-queue` 未复现，疑为并发/时序波动，不属本批） |
| `npm run typecheck` | **0 错** |

**本批新增红：0。**

**既有红 16（均不在本批范围）**：

| 类别 | 数量 | 文件 |
| --- | --- | --- |
| Windows symlink EPERM（环境权限） | 9 | `claude-adapter/session:637`、`codex-adapter/session:351`、`pi-adapter/injected-runtime:185,193`、`runtime-core/session-store:46,58`、`runtime-core/tools:111`、`编排/shell-authorized-routine:103`、`测试/g4-skill-verify/b-render-double-check:182` |
| 子进程中止时序（Windows） | 1 | `runtime-core/tools:161` |
| vendor pin 漂移 | 1 | `桌面应用/markdown:104` |
| 桌面 renderer/runtime-ui 源码钉（属主在途） | 5 | `桌面应用/renderer:1020,1527,1573,1832`、`桌面应用/runtime-ui:65` |

## 六、观察与残余（未改实现）

1. **已修复并复验**：验收机械门槛（流程 done/每步 `dispatch.accepted`/无阻塞/未结算决定/未闭环澄清）与 shell 出路口径（「替我审批」）均由属主修复；本角色新增 5 例机械门槛与出路断言复验通过。
2. **single/su 与无 cardKind 的提示**：按评审 §3.1/§3.2，这两类**永不判断**，因此原卡呈现且**无 `judgeNotice`**（提示只用于「判断发生但回落」）。任务书若期望这两种也带 notice，需回评审更新；本批按已批准契约断言。
3. **残余风险（评审已登记）**：内容漂移（预览 A/写 B）V1 不消除；判断可能误批；`judge` 证据有界但模型转述仍可能不准确。均不作为测试红。

## 七、复跑

```bash
node --test "test/测试/governance-judge-cards-verify/*.test.ts"   # 本批 42/42
node --test "test/测试/shell-judge-verify/*.test.ts"              # 旧断言同步后 36/36
node --test "test/**/*.test.ts"                                   # 三层 glob：2896/2877/16/3
npm run typecheck                                                 # 0 错
```

**结论**：双开关矩阵、六卡种（含 accept-quick 不代批）、required-read/逐路径机械复核、按组回落、账本 judge 审计、队列/一次性/judging、UI 契约均按已批准评审通过；两项观察（验收机械门槛、shell 出路口径）已由属主修复并复验。本批未发现需要判红的实现缺陷；残余仅 single/无 cardKind 按契约无 notice 与已登记风险。未 commit。
