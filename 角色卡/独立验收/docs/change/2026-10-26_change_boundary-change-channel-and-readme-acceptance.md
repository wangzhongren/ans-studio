---
id: boundary-change-channel-and-readme-acceptance
type: change
title: 边界变更门禁通道（request_boundary_change）与治理优先 README 独立验收——A1–A7 逐项判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: verified-limited
related: [request-boundary-change, boundary-change-gate, governance-first-readme]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 对 HEAD 6b7ef38（对比 ea0fff0）按交接口径 A1–A7 独立判定；typecheck 0、runtime-core 工具 9/9、编排 3/3、门禁引擎 326+1skip/327、桌面全量三次 645/645、644/645、645/645（中间一次为既有重派门用例账本写入时序竞态，隔离 72/72×2）、治理 e2e 155/155×2；README 结构/链接/围栏/Mermaid 独立解析通过；纯函数探针发现 README「无通配符」与确定性校验不一致、卡文本「目录以 / 结尾」与校验器冲突；总体有条件通过，无行为性 FAIL
  - date: "2026-10-26"
    kind: verified
    summary: 补充验收 2eeeeb6（对比 6b7ef38；产品/测试 5 文件 +160/−35）：F1 通配符、F3 请求的治理敏感路径、F4 瞬时/终态票据、F5 README 恢复与结构均 PASS；typecheck 0、桌面全量 646/646、runtime-core 9/9、编排 3/3、治理 e2e 155/155×2（首跑 154/155 为既有 R2 request_acceptance 并发 flaky）；发现两项 FAIL——F3a：同一编辑移除 electron-builder.config.* 拦截；F6（高）：尾斜杠使 package.json/、.env/ 等发布根文件绕过确定性拦截且目录条目可覆盖同名文件；补充验收不通过（needs-work），两项修复后需重新补充验收
  - date: "2026-10-26"
    kind: verified
    summary: 补充验收（第三轮）fb40368（对比 2eeeeb6；产品/测试/卡文本 4 文件 +47/−7）：F3a（electron-builder.config.* 恢复拦截且 yml/yaml 仍拒）、F6（关键路径先剥一个尾斜杠，发布根/治理路径带斜杠新增与移除均 invalid-path，正常目录 config/newdir/ 保留目录语义）、统筹卡 rejected 回执语义均 PASS；typecheck 0、桌面全量 646/646、runtime-core 9/9、编排 3/3、门禁 327（326+1skip）；治理 e2e 首跑 154/155（既有 R2 flake）、复跑 155/155；F3a/F6 关闭，第三轮补充验收 PASS，整体维持有条件通过（真实模型/Electron/非 Windows 未验证）
---

# 边界变更门禁通道（request_boundary_change）与治理优先 README 独立验收

**总体结论：有条件通过。** 被验收提交 `6b7ef38` 在 A1–A7 上未发现行为性 FAIL：工具仅对统筹（convener）注入、确定性校验与 AI 门禁的分层、幂等与票据恢复、组队仍走 appointment-write、README 版本/能力分层与状态语义均与代码一致。条件与未阻断问题见 §五、§六、§七 与 §十/§十一（补充验收两轮：§十 `2eeeeb6` 不通过—F3a/F6；§十一 `fb40368` 修复后 PASS，F3a/F6 关闭）：

1. README 两语言版均声称确定性校验「无通配符」，但实际 `src/*.ts` 可通过校验（独立探针实证）；需改文档或补校验。
2. 统筹/组队卡文本要求「目录条目以 `/` 结尾」，但应用校验器明确拒绝尾斜杠（含测试断言）；需对齐二者（目录增删的表达方式）。
3. README 重写删除了原「学术来源（RFSG 论文 DOI）」与真实桌面截图；建议确认是否有意删除并恢复引用。
4. 桌面全量三次中一次出现 1 例**既有** `2026-10-23 重派门` 账本写入时序竞态（用例体未改；另两次 645/645，隔离两次 72/72 通过）；登记为 flaky。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写了自身 `docs/change/` 下的报告与证据，未修改实现、测试、角色卡产品文本或他人文档，未 commit / push。

## 一、标准与依据

本次验收对象由协调端在实施完成后交接，A1–A7 为交接时固定的**事后标准（post-hoc criteria）**，不是实施前冻结的设计标准；这一过程限制不因本次通过而消失。

| 编号 | 验收项 | 主要判据 |
| --- | --- | --- |
| A1 | 确定性校验各失败 code 与治理关键路径拒绝 | 代码 + 单测 + 独立纯函数探针 |
| A2 | AI 门禁 approve 恰一条 Crew 任务；deny/manual/超时/不可用 ⇒ rejected 零派发 | 代码顺序 + 桌面测试 + 回执文案 |
| A3 | 幂等与票据恢复（already-dispatched、重启读票据） | 桌面测试（同进程、重启、失败重试） |
| A4 | 组队仍必须 appointment-write | 卡文本 + 任务文本 + 门禁引擎测试 |
| A5 | README 中英结构一致、链接/围栏/Mermaid 可解析；状态语义表与代码一致 | 独立解析器 + 代码核对 |
| A6 | 版本/待发布标注准确（v1.7.0、main、本分支能力分层） | `git show main` + `package.json` + README 对照 |
| A7 | 未验证项如实（运行中 Electron 旧代码、AI 门禁真实模型行为、不声称未验证能力） | README 原文核对 + 本报告 §七 |

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| 验收 HEAD | `6b7ef386bb3bf773c8b3492c03cceb353f08e2d4` |
| 基线 | `ea0fff0e4a334012a5eef02924fb5e0c3547fa66`（上一轮已验收；本报告只引用其结论） |
| `main` | `182a631dde83a866416a098faf72700be5472c09` |
| 环境 | Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1（Node 绝对路径 + PATH 前缀调用） |
| 候选范围 | 22 文件，+3801/−271；`git diff --check` exit 0；无重命名/模式变化 |

**候选期工作树漂移（如实记录）**：验收期间工作树出现非本批的未提交渲染层改动（`Sidebar.tsx` / `shell.css` / `ui-store.ts` 修改，`sidebar-topology.ts` / `SidebarTopology.ts` 新增，时间 11:11–11:12；截至 11:17 另见未跟踪 `test/桌面UI/sidebar-topology.test.ts`）。它们不属于候选，不在本批任何测试路径中导入；漂移出现后复跑 typecheck 仍 0 错。详见证据 `00_candidate-and-commands.md` §二。

## 三、改动范围复核（`git diff ea0fff0..6b7ef38`）

### 3.1 范围与归属

| 组 | 文件 | +/− | 判断 |
| --- | --- | --- | --- |
| README | `README.md`、`README.en.md` | +565/−269 | 按治理模型重写；版本/能力分层/限制声明保留 |
| 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts` | +281 | 新增能力契约、工具注册与描述；仅「注入才注册」 |
| 编排 | `src/pipeline/orchestration/run-role.ts` | +36 | 能力位透传 + **仅 convener** 收口；无校验/派发逻辑 |
| 桌面 | `app/desktop/{boundary-change.ts,interface.ts,session.ts}` | +1295/−1 | 纯逻辑模块 + 单一装配点 + 仅 convener 注入 |
| 门禁角色卡 | `src/common/门禁引擎/governance-roles.ts` | +37/−1 | 仅卡文本（Steward/Crew 两段）；注册表/capability/写权零变化 |
| 测试 | 5 文件（2 新增、3 追加） | +1183/−0 | **纯新增**，无删除/改写/跳过 |
| 上一轮验收文档 | 独立验收报告 + 证据 4 文件 + feature-map/memo | +404 | 上一轮独立验收产物，纯文档；本角色白名单内 |

- `git diff -- test/ | grep '^-[^-]'` 为空：未弱化或删除任何既有断言。
- `package.json` 未变（无新依赖）；无权限位/可执行位变化。
- 源码/卡文本两处「−1」是 import 行扩写与 Steward 卡第 5 步原文追加一句（内容保留），不是能力删改；README 的 −269 属重写替换。

### 3.2 注入面复核（工具仅 convener）

- `app/desktop/session.ts:2177`：`governanceFunction === "schedule"`（数据驱动，convener 的注册表值，见 `governance-roles.ts:1054`）才注入；项目角色、其他内置治理角色、`su` 不注入。
- `src/pipeline/orchestration/run-role.ts:1362-1363`：再次以 `builtInGovernance && trioSpec?.id === "convener"` 收口；即使调用方误给能力位，非 convener 会话 options 不带该字段。
- `src/provider/runtime/tools.ts`：能力未注入 ⇒ `request_boundary_change` **不注册**（结构性 fail-closed）；注入后只新增这一只工具，既有工具 schema/描述/执行模式不变（测试逐项 deepEqual）。
- 角色卡纪律（`governance-roles.ts:532` Nominator、`:683` Convener）明确：不得 `dispatch_task` 派 Crew、不得自改角色卡/边界、请求 ≠ 客户批准。其他角色的卡文本不含该通道（门禁引擎测试断言）。

## 四、逐项验收结论

### A1 确定性校验 — 通过

证据：`test/桌面应用/acceptance-dispatch.test.ts:4205`（新增用例「确定性校验各失败 code」）+ 独立纯函数探针（证据 `09_…probe.txt`）。

- `invalid-role`：未知角色、内置治理角色、非 trio 模型均不派发；未知角色消息含 roleId。
- `invalid-path`：绝对路径、盘符路径、`..` 逃逸、空段/尾斜杠、治理关键路径（`.ans/**`、`角色卡/**`、`docs/flows/**`、`src/common/shared/**`）、发布根（`package.json` 等）、同增同删、空理由。
- `no-change`：新增已被现有目录条目覆盖、移除不存在、增删皆空。
- 独立探针复核：`assessBoundaryChangeRequest` 对 `.ans/governance/ledger.jsonl` 返回 `invalid-path`；对「移除被更宽目录条目覆盖的子路径」返回 `invalid-path`；对有效增删返回 `effectiveAdds/effectiveRemoves`；确定性失败时 **AI 门禁零调用、组队零派发**（测试断言 `judgeCalls===0`、`sendsByRole.get("nominator")===undefined`）。
- 说明：`flowId` 非法/多流程未指定返回 `unavailable`（不是 `invalid-path`），契约内没有 flow 专用 code；属可接受的语义映射。空 rationale 归入 `invalid-path`（契约枚举限制），文案明确。

**非阻断偏差（见 F1/F2）**：校验器**不拒绝通配符**（`src/*.ts` 通过），README 却称「无通配符」；校验器**拒绝目录尾斜杠**，而角色卡要求「目录以 `/` 结尾」。两者均不导致治理关键路径扩权（边界路径按字面比较，无 glob 展开），但需对齐文本/校验。

### A2 AI 门禁与派发 — 通过

代码顺序（`app/desktop/interface.ts:5744` `requestBoundaryChangeForProject`）：载荷/flowId → 项目角色 → 确定性校验 → 幂等/票据 → 引擎解析 → 账本事实 → 只读 AI 门禁（`createGovernanceJudge`，`DENY_ALL_GATE` 写门禁拒绝一切写）→ 通过才 `openBackground(nominator)` + `sendBackground` 恰一次。

- approve：桌面测试断言组队会话**恰 1 条**任务；任务文本含精确新增/移除路径、`ticketId`、`appointment-write` 与「未获确认不得写入」，**不含「客户批准」**（测试 `assert.equal(task.includes("客户批准"), false)`；独立探针复核为 `false`）。
- deny / manual / 引擎抛错（不可用）/ 超时（`judgeMs=60ms`，有界返回）：均 `rejected`，`sendsByRole` 无记录，票据 `status:"rejected"`（`judge.verdict` 与 `reasonCode=timeout` 如实落盘），消息含「不自动放行」「不代表客户拒绝」。
- AI 门禁请求形状：`group=decision`、`cardKind=intent-confirm`、`roleId=convener`、`flowId` 一致；证据含精确路径、角色卡摘录、当前边界条目；团队计划/流程路径作为独立物证（`artifacts.teamPlanPath/flowPath`）。事实包只复算参与比对的四个账本字段，与编排 `buildGovernanceJudgeFacts` 的映射逐一核对（proposalDecision / appointmentTargetRoleIds / unresolvedClarificationCount / ledgerErrors），未发现可导致常态 `evidence-conflict` 的偏差（8KB 截断边界见 R3）。
- 「不向客户呈现卡片、不写 `customer.decision`」：代码审查（judge 为无客户通道的判断闭包；本通道无账本写入），未发现客户决定写入点。

### A3 幂等与票据恢复 — 通过

- 同进程重复：`requestBoundaryChangeInFlight` + 已读票据 `status:"dispatched"` ⇒ `already-dispatched`，不重复派发（测试：第二次调用后组队发送仍为 1）。
- 重启恢复：新建 Interface 实例读同票据 ⇒ `already-dispatched`，**不再调用 AI、不再派发**；测试用会抛错的 judge 桩件证明未触达。
- 失败重试：打开组队失败 ⇒ `unavailable`、票据 `failed`；重试成功 ⇒ `dispatched` 且 `ticketId` 稳定；`clientMessageId` 由 ticketId 稳定派生。
- 已拒绝请求：同票据不重跑 AI（防反复试探），修改理由/路径生成新票据；行为与卡文本「修正后重交」一致。
- 票据路径与原子写：`.ans/governance/boundary-requests/<flowId>/<ticketId>.json`；证据 `dispatch.messageSha256` 记录任务摘要；重启可读。坏票据不冒充已派发（重新走门禁并覆盖写，诊断保留原错误）。

### A4 组队 appointment-write — 通过

- Crew 卡（`governance-roles.ts:532`「边界变更请求（来自应用/统筹经应用）」）：核对 `roleId`/精确增删路径/`rationale`/`flowId`；只增删列出路径、不重写整个边界、不扩大其它路径；`request_confirmation(cardKind=appointment-write)` 逐路径确认；`declined` 按原因修正重发；完成向 Steward/统筹（并汇总 Lead/主理）报告并留证；「请求来自统筹不等于客户批准」。
- Convener 卡（`:683`）：只在边界不足时走 `request_boundary_change`；不得 `dispatch_task` 派 Crew、不得自改卡；回执 `dispatched`/`already-dispatched`/`invalid-*`/`no-change`/`unavailable` 逐项纪律；变更完成前不得派实现写入该路径。
- 任务文本（`boundary-change.ts:303`）同样写死 appointment-write、逐路径确认、未获确认不得写入、请求非批准；门禁引擎测试对卡文本逐句断言，并反向确认其他角色卡不含该通道。

### A5 README 结构与语义 — 通过（文档附 F1/F3）

- 结构：中英各 25 个标题一一对应（含代码块内注释行），同序；14 个围栏成对 = 各 7 个代码块（mermaid / yaml×2 / bash×3 / text），逐块类型与位置对应；链接逐一 `ls` 核实存在（`角色卡/项目管理/docs/architecture.md`、`project-rules.md`、发布记录、分诊设计、后台任务验收、`.env.example`、`LICENSE`、`.github/workflows/release.yml` 等）。
- Mermaid：使用仓库既有 `grok-mermaid` 解析器独立检查，两图均为 `flowchart`，`parseGraph=ok`、`render=ok`、dropped warnings 为空（见 `08_readme-mermaid-check.txt` / `.mjs`）。
- 验收分诊状态语义表与代码一致：`pass` 不分诊走既有验收卡；`fail/conditional` + 可执行 `blocker/major` ⇒ 返工建议；仅 `minor/nit` ⇒ 仅汇报；结构不可执行 ⇒ 退回 Proof（`declined + notPresented`）；坏段/缺段 ⇒ 退回 Proof、不弹卡。核对 `app/desktop/interface.ts:3560-3710` 与 `src/common/编排/acceptance-triage.ts`：判断代批的「仅汇报」以 `declined` 结算、**不写 `customer.decision`**、验收步骤保持 `pending`；判断代批的「返工」只写分诊记录 + 账本 `acceptance.triage`（`interface.ts:2977`），不写客户决定。分诊记录路径 `.ans/governance/acceptance/<flowId>/triage-v1.json` 与幂等键 `flowId+reportSha256` 与 `acceptance-triage-record.ts` 一致。
- 边界变更闭环描述与代码一致：校验 → 票据 → 只读 AI 门禁（deny-all）→ 通过才派 Crew → appointment-write → 生效复核；`dispatched ≠ 边界已修改`、`rejected` 不自动放行均与文案/测试一致。
- **F1**：README 写「校验路径形状（无通配符、`..`、绝对路径）」，代码不拒绝通配符（独立探针 `src/*.ts` 通过）。**F3**：重写删除了原「学术来源（RFSG 论文 DOI）」与真实桌面截图（`git show ea0fff0:README.md` 第 23–35 行有；新 README 无）。

### A6 版本与能力分层 — 通过

- `package.json` version = `1.7.0`；README 两语言版均标注当前公开运行包 **v1.7.0（2026-10-24）**，Release 下载链接与 SHA256 数值与旧版一致（diff 未见 SHA 行改动；来源核验段落仅位置/措辞调整）。
- `git show main:src/provider/runtime/tools.ts` 含 `REQUEST_ACCEPTANCE_TOOL_NAME`（3 处），无 `REQUEST_BOUNDARY_CHANGE_TOOL_NAME`（0 处）；`main` 树含验收分诊（`acceptance-triage.ts` 等）、后台任务面板（`BackgroundTasksPanel.tsx` 等）、流程状态面板（`FlowStatusPanel.tsx`）。README 对 `main` 的描述属实。
- 本分支能力分层标注：`request_boundary_change` + 中间 AI 门禁、脚手架先行治理、统筹完成即主动提交验收均标为「本分支新增、随下次发布生效」；`scaffold-first` 明说「目前是治理规则，不是确定性硬门」，与上一轮验收结论一致。

### A7 未验证项如实 — 通过

- README 明说运行包 v1.7.0 **不含** `main` 与分支新增能力；未把本分支能力写成已发布可用。
- 明确「脚手架先行…应用尚无确定性硬拒绝」「真实模型对卡文本的遵从未在线验收」「在线桌面与代码任务以 Pi 为主；Codex/Claude 受控/离线测试不等于在线全链路验收」「运行包未签名、未公证」。
- 未发现 README 把 AI 门禁、边界变更通道或分诊的**真实模型行为**写成已验证事实。
- 本报告 §七 单列本轮未验证项（运行中 Electron 旧代码、真实模型 AI 门禁、真实 Crew 写卡链路等）。

## 五、发现（非阻断，建议修正）

| 编号 | 级别 | 描述 | 证据 | 建议归属 |
| --- | --- | --- | --- | --- |
| F1 | 文档-行为不一致（低） | README 中英均称确定性校验「无通配符」；实际 `normalizeBoundaryChangePath` 接受 `src/*.ts`，`assessBoundaryChangeRequest` 返回 ok（`effectiveAdds=["src/*.ts"]`）。边界路径按字面比较、无 glob 展开，无权限扩权；但文档过度承诺 | `09_…probe.txt` 第 1、6 行；`app/desktop/boundary-change.ts:96-105`、`:168-231` | 实现（桌面窗口）补拒绝 `*`/`?`，或 README 改为「路径为字面值，不支持通配符；应用不展开」——建议实现补校验，与卡文本「不得通配」一致 |
| F2 | 产品文本-校验冲突（中低） | Convener 卡（`:683` 附近）与 Crew 卡（`:532` 附近）都要求「目录条目以 `/` 结尾」；应用校验器明确拒绝尾斜杠（`normalizeBoundaryChangePath`，桌面测试「尾斜杠空段 ⇒ invalid-path」）。按卡文本提交目录增删会稳定收到 invalid-path；且请求载荷无 `kind` 字段，目录/文件类型只能由 Crew 猜测 | `app/desktop/boundary-change.ts:96-105`；`test/桌面应用/acceptance-dispatch.test.ts:4223`；`09_…probe.txt` 第 5、8 行 | 卡文本维护（门禁引擎）与实现（桌面窗口）对齐：允许目录条目单个尾斜杠并携带 kind，或把卡文本改为「目录也写项目相对路径，不加尾斜杠」 |
| F3 | 内容回退（低） | README 重写删除原「ANS 是什么与学术来源」段的 RFSG 论文引用（Zenodo DOI）与真实桌面截图；未见替代链接 | `git show ea0fff0:README.md` 第 23–35 行；新 README 无对应内容 | README 作者（项目管理/装配）确认是否有意；建议恢复「深入了解」中的论文引用 |
| F4 | 既有测试 flaky（低） | 桌面全量三次：645/645、644/645、645/645。失败那次为 `2026-10-23 重派门（verification 进行中）`（`acceptance-dispatch.test.ts:2708`）：内存发送与 flow 重开断言通过后，`verifierDispatches` 读账本 `dispatch.accepted{targetRoleId:"verifier",stepId:"verification"}` 得到 0（期望 1，耗时约 108ms）——发送已发生，账本写入存在时序竞态。该用例在本批之前已存在且文件 diff 纯新增（用例体未改）；另两次全量与隔离两次 72/72 均过 | `05b_desktop-full-run2.txt`；`05a_…`、`05c_…`；`06_…`、`06b_…` | 测试/桌面窗口维护者登记 flaky（建议对账本派发记录改事件驱动等待或轮询重试），不阻塞本批 |
| F5 | 过程（低） | 本批产品改动（门禁/编排/桌面/README）未附对应角色的 change 记录；与上一轮验收指出的同一过程缺口一致 | `git diff --name-status` | 各实现角色补 change 记录（非本角色写区） |

## 六、残余风险

- **R1 确定性治理关键路径清单非穷尽**：`GOVERNANCE_CRITICAL_PREFIXES` 与 `RELEASE_ROOT_PATTERNS`（`boundary-change.ts:46-69`）未覆盖 `docs/scheduling/**`、`docs/proposals/**`、`docs/acceptance/**`、`docs/governance/**`、`docs/intents/**` 等治理产物目录，也未覆盖根级 `electron-builder.yml`（本仓实际打包配置；正则只覆盖 `electron-builder.config.*`）。这些路径的增删只能靠中间 AI 门禁 + Crew 的 appointment-write 确认拦截；按设计是分层纵深，但确定性层存在盲区。建议扩展清单。
- **R2 AI 门禁真实模型行为未验证**：测试全部使用 judge 桩件。真实判断复用了 `intent-confirm` 卡种（其提示词语义是「与客户当前要求/意图摘要一致」），而边界变更的「意图基准」是角色卡/边界/团队计划/流程；目标角色卡与当前边界以**请求方 preview 文本**呈现（被标注 untrusted），团队计划/流程才是独立物证。真实模型可能偏保守（对良性请求 manual）或漏判「顺带扩权」。需真机在线验收。
- **R3 事实包 8KB 截断**：`boundaryChangeJudgeFacts`（`boundary-change.ts:490`）未复刻编排 `boundFactsSize` 的 8KB 裁剪；超长/超多账本记录时 `appointmentTargetRoleIds` 可能在重新比对时被裁剪，导致 `evidence-conflict` ⇒ `manual` ⇒ rejected（fail-closed，但可用性受损）。低概率，建议统一走编排导出的 facts helper 或复刻裁剪。
- **R4 瞬时门禁不可用的终态**：AI 超时/不可用与 deny 一样写入 `status:"rejected"`，同一请求（同 roleId/路径/理由）此后不再重跑，必须修改理由或路径生成新票据。这是刻意的防反复试探设计；对瞬时故障偏严。建议未来区分 transient（可重试）与 deny（终态）。
- **R5 坏票据 + 进程内去重**：票据损坏按「未派发」继续；若此前已实际投递且进程已重启（`clientMessageId` 去重标记仅内存，`session.ts:1080`），理论上存在重复投递窗口。极低概率。
- **R6 运行中 Electron 为旧代码**：本批未重启/未在真实桌面验证；边界变更工具与 README 描述的能力在运行包中需下次发布。真实 Crew 会话的 appointment-write 全链路（真实模型 + 真实写卡校验）未做端到端验收。
- **R7 目录/文件类型表达**：见 F2；即使对齐尾斜杠，请求仍无 `kind`，Crew 需结合团队计划推断。建议后续在请求契约中显式携带目录/文件 kind。

## 七、未验证项（如实）

1. **AI 门禁真实模型行为**：未用在线模型执行 approve/deny/manual；仅有桩件与静态形状核对。
2. **真实 Crew 写卡链路**：未让真实组队经 appointment-write 实际修改 `角色卡/<roleId>/boundary.yaml` 并跑应用边界校验。
3. **运行中的 Electron**：未重启应用，未在 UI 中确认新工具/派发/票据可见性；运行进程仍为旧代码。
4. **真实项目现场**（如 castle）复现：未接入真实项目验证 `tsconfig.node.json` 类缺口。
5. **Windows 之外平台**：本轮仅在 Windows 11 实测；macOS/Linux 未实测。
6. **AI 门禁对既有流程的兼容性**：未用真实大型流程/繁忙账本压测（关联 R3）。
7. **客户端分诊卡与边界变更的交互**：未验证两种流程在同一项目交错时的 UI 行为（代码路径互不依赖，但未实测）。

## 八、证据索引

目录：`角色卡/独立验收/docs/change/2026-10-26_boundary-change-channel-and-readme-evidence/`

| 文件 | 内容 |
| --- | --- |
| `00_candidate-and-commands.md` | 候选身份、环境、漂移、命令与结果汇总 |
| `01_typecheck.txt` | `npm run typecheck` exit 0 |
| `02_runtime-core-boundary-tool-test.txt` / `02b_…` | 运行时核心工具 9/9（完整 / 首跑尾部） |
| `03_orchestration-boundary-test.txt` / `03b_…` | 编排注入矩阵 3/3（完整 / 首跑尾部） |
| `04_gate-engine-tests.txt` | 门禁引擎 327（326 过 / 1 Windows skip）完整输出 |
| `05a_desktop-full-run1-tail.txt` | 桌面全量第 1 次 645/645 尾部 |
| `05b_desktop-full-run2.txt` | 桌面全量第 2 次 644/645（既有重派门 flaky，含失败堆栈） |
| `05c_desktop-full-run3.txt` | 桌面全量第 3 次 645/645（完整输出） |
| `06_desktop-acceptance-dispatch-rerun.txt` / `06b_…` | `acceptance-dispatch.test.ts` 隔离复跑两次，均 72/72 |
| `07_governance-e2e-rerun.txt` / `07a_…` | governance-e2e 155/155（完整复跑 / 首跑尾部） |
| `08_readme-mermaid-check.txt` / `.mjs` | 中英 README 围栏与 Mermaid 解析（grok-mermaid） |
| `09_boundary-change-pure-function-probe.txt` / `.mjs` | 独立纯函数探针（路径归一/治理路径/票据稳定/任务文本） |

## 九、结论与交接

**有条件通过。** 条件与建议返工（均不阻断本批的行为正确性）：

1. F2（优先）：对齐「目录以 `/` 结尾」的卡文本与校验器；否则目录类边界变更请求会被稳定拒绝或语义含糊。归属：门禁角色卡文本维护者 + 桌面窗口实现。
2. F1：README「无通配符」与实现二选一，建议实现补通配符拒绝。归属：桌面窗口实现 / README 作者。
3. F3：确认并恢复 RFSG 论文引用（及截图）或记录删除理由。归属：README 作者。
4. F4：登记既有 flaky 用例，非本批阻塞。归属：桌面窗口/测试维护者。
5. F5：补本批各角色 change 记录（过程项）。归属：门禁引擎/编排/桌面窗口实现角色。

本报告不授予提交、推送、合并、部署或发布；实现与测试仍以各所有者为准。建议在修复 F1/F2 文本/校验后，于下一轮独立复核中复验对应行为；真实模型 AI 门禁与真机 Electron 验证建议在下次发布前补做。

## 十、补充验收：2eeeeb6（F1–F5 修复）

**对象与范围**：`2eeeeb63ee832da9aee8d4482e120ab9a17a9902`（`fix(governance): tighten boundary-change validation and restore README references`），对比 `6b7ef38`。产品/测试范围 5 文件 **+160/−35**：README 中英 +20/−4、`app/desktop/boundary-change.ts` +56/−22、`app/desktop/interface.ts` +27/−5、`test/桌面应用/acceptance-dispatch.test.ts` +57/−4。其余 +2508（−0）为本角色上一轮验收报告/证据与导航（纯文档，随该提交入库）；**不属于产品/测试范围**。产品/测试范围 `git diff --check` exit 0；补充验收开始时工作树仅 `?? demos/`（本补充报告与 `10_`–`20_` 证据为验收后写入的未提交文件）。全量 `--check` 仅在证据原始日志报空白字符（`01_typecheck.txt` 末尾空行、`05b` 堆栈行尾空格），非产品/测试。

**实测（Node v24.22.1，Windows 11）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | `10_typecheck.txt` |
| `node --test "test/桌面应用/**/*.test.ts"` | **646/646** 通过（较上轮 +1 目录条目用例） | `11_desktop-full.txt` |
| `node --test test/runtime-core/request-boundary-change-tool.test.ts` | 9/9 | `12_runtime-core-tool-test.txt` |
| `node --test test/编排/request-boundary-change.test.ts` | 3/3 | `13_orchestration-test.txt` |
| `node --test "test/测试/governance-e2e-auto/*.test.ts"` | 首跑 154/155（既有 R2 request_acceptance 去重 flaky，疑似与桌面全量并发负载有关；上一轮已记录同类 flake）；**单独复跑两次均 155/155** | `14_governance-e2e-first.txt`、`14b_governance-e2e-rerun.txt`、`14c_governance-e2e-rerun2.txt` |
| README 结构/Mermaid | 中英各 26 标题、14 围栏；`parseGraph=ok`、`render=ok`、零 warnings；截图文件存在 | `16_readme-mermaid-check.txt`、`17_readme-structure.txt` |
| 独立纯函数探针 | 见下表明细 | `15_boundary-fix-probe.txt` / `.mjs` |

**逐项判定（补充要求）**：

| 项 | 结论 | 核实要点 |
| --- | --- | --- |
| F1 通配符 `* ? [ ] { }` | **PASS** | `normalizeBoundaryChangePath` 对 `* ? [ ] { }` 一律返回 undefined；桌面测试新增 `src/*.ts`、`src/?.ts`、`src/[a].ts`、`src/{a,b}.ts` 四例均 `invalid-path`；独立探针复核 `src/a*.ts` 等亦拒。工具层仍会先转发到能力层，由能力层确定性拒绝并回执（与请求形状校验分层一致） |
| F2 目录尾斜杠 | **PASS** | 恰好一个末尾 `/` 被接受并在 `addPaths/removePaths` 中保留；`config//x.ts`、`config/newdir//`、`config/newdir///`、`./x`、`../x`、`x/.`、`x/..`、`/abs/`、`C:/abs/` 均拒。票据 `addPaths` 保留 `config/newdir/`；组队任务与 AI 证据均带「（目录条目）」标注（测试 + 探针）。`x` 与 `x/` 在去重、同增同删重叠、`boundaryEntryIsExact` 上按同一路径处理；覆盖判断按条目 kind 区分——既有目录条目覆盖 `x`/`x/`，既有 **file** 条目 `x` 不覆盖目录请求 `x/`（目录语义属实际扩权，不能视为 no-change）。README 中英「目录条目以 `/` 结尾；不得通配符、`..`、绝对路径」与实现一致。**但尾斜杠形状与发布根拦截组合出 F6 绕过（见下），F2 需随 F6 一并返工** |
| F3 治理敏感路径 | **PASS（请求集合）** | `docs/scheduling`、`docs/acceptance`、`docs/contracts`、`docs/governance`、`bin`、`.github`、`electron-builder.yml`（及 `.yaml`）均已加入拒绝集；**新增与移除都拒绝**（桌面测试覆盖 add 全量与 remove 两例；独立探针逐项复核 add/remove）。原有 `.ans`、`角色卡`、`docs/flows`、共享目录、发布根保持拒绝 |
| **F3a 回归（需返工）** | **FAIL（窄）** | 同一 diff 把 `electron-builder` 从 `...\.config\.[^/]+` 交替组中移除，只新增 `^electron-builder\.ya?ml$`；结果 `electron-builder.config.ts/js/mjs/yml/...` 在 `6b7ef38` 被拒、在 `2eeeeb6` 通过确定性校验（独立探针 `19_…`：`currentFunction=false`、`oldConfigPattern=true`）。这是相对基线的**边界拦截收窄**（仍受 AI 门禁 + Crew appointment-write 约束，但确定性层少拦一类发布配置）。建议恢复 `electron-builder` 到 `\.config\.` 交替组并保留 yml 模式 |
| **F6 尾斜杠绕过发布根（需返工）** | **FAIL（高）** | F2 允许单个尾斜杠后，`boundaryChangePathIsGovernanceCritical` 未先去尾斜杠再跑 `RELEASE_ROOT_PATTERNS`：`package.json/`、`package-lock.json/`、`tsconfig.node.json/`、`vite.config.ts/`、`electron-builder.yml/`、`.env/`、`index.html/` 均 `critical=false` 且 `assess` 返回 ok（`effectiveAdds` 保留尾斜杠）；而 `section1EntryCovers`（`run-role.ts:1918`）对目录条目用 `normalizeLexical`（会去掉尾斜杠）后 `isUnderOrEqual`，因此目录条目 `package.json/` 会覆盖 `package.json` 文件（独立探针 `20_…`：`covers=true`）——即确定性发布根拦截可被尾斜杠绕过，写入权仍由 AI 门禁 + Crew 确认兜底但不能依赖。建议在 critical 检查前对路径去尾斜杠（或让 release 正则接受可选 `/?$`），并补 `package.json/`、`.env/`、`vite.config.ts/`、`tsconfig.node.json/`、`electron-builder.yml/` 测试 |
| F4 瞬时 vs 终态 | **PASS** | 门禁基础设施类（引擎解析失败、账本不可读/坏行、judge 构造失败、判断抛错、超时、`judge` 返回 `timeout`/`unavailable`/`ledger-unavailable`）写票据 `status:"failed"`、回执 `rejected` 且 message 明确「可修复后重试」；重试读 `failed` 票据并**重新过门禁**（测试：unavailable 重试后 judgeCalls=2）。`deny`/`manual`（判断结论）写终态 `rejected`，同请求不重跑门禁（deny 用例断言 judgeCalls 不增；manual 同走终态路径）。两类均**零派发**；fail-closed 方向不变 |
| F5 README 恢复与结构 | **PASS** | 中英均恢复「研究与引用 / Research and citation」RFSG 论文 DOI（10.5281/zenodo.22824700）与 canonical 截图 `角色卡/桌面UI/docs/change/2026-10-20_readme-v1.4-screenshot/desktop-intent-confirm.png`（文件存在）；路径措辞与实现一致；26/26 标题、14/14 围栏、Mermaid 解析通过 |
| 测试无弱化 / 无权限扩大 | **测试：PASS；边界：FAIL（F3a + F6）** | 测试 diff +57/−4：被替换的仅「尾斜杠从拒绝改为目录允许」「治理移除用例扩展」「票据状态断言按 retryable 区分」，新增用例覆盖原语义。产品 diff 除 F3a 的发布配置拦截收窄与 F6 的尾斜杠旁路外，仅收紧校验/保留目录语义/增加治理前缀与瞬时票据状态；未改注入面（仍仅 convener）、未新增依赖/新增写权/capability，`package.json` 未动 |

**未验证 / 残余风险（F3a/F6 之外不阻断；两项需返工）**：

- 真实 AI judge 行为、真实 Crew appointment-write 写卡、运行中 Electron（旧代码）、非 Windows 仍未验证（与主报告 §七 相同）。
- 瞬时票据 `failed` 的重试只以桩件覆盖 `unavailable`；真实引擎故障/超时后的重试未实测（代码路径已审查：`failed` 不短路，重试重新过门禁）。
- 真实 judge 的 `aborted` reasonCode 不在 transient 集合，仍会记终态 `rejected`；若由外部中止触发，理论上可重试（罕见）。
- 确定性治理清单仍不含 `docs/proposals/**`、`docs/intents/**`、`docs/skills/**`、`docs/mcp/**`、`docs/verification/**`、`docs/workflow.md`（本轮只要求新增的集合；其余仍依赖 AI 门禁 + Crew 确认）。
- 瞬时路径回执 code 仍为 `rejected`（message 写「可修复后重试」），而 Convener 卡的回执处理列表未列 `rejected`（既有文本）；建议后续在卡文本中区分 transient 与 deny。
- 既有 `2026-10-23 重派门` 账本时序 flaky 仍存在（本轮桌面全量 646/646 通过，未触发）；既有 R2 request_acceptance e2e flaky 在本轮并发负载下首跑触发、两次单独复跑均通过。

**补充结论：不通过（needs-work；FAIL 2：F3a、F6）。** 请求的 F1、F3 请求集合、F4、F5 均 PASS，测试无弱化；但 F3 同一次编辑移除了 `electron-builder.config.*` 拦截（F3a），F2 的尾斜杠接受又使 `package.json/`、`.env/` 等发布根文件绕过确定性拦截（F6，高）。两项都构成相对 `6b7ef38` 的边界拦截收窄/旁路，须修复后重新补充验收。原报告 F1/F2/F3 条件在修复后关闭；F4（既有 flaky）与 F5（change 记录过程项）仍为非阻断；整体候选（`6b7ef38` + `2eeeeb6`）维持 **有条件通过**，剩余条件为 F3a/F6 修复、真实模型/Electron/非 Windows 未验证与既有 flaky/过程项。上述证据文件（`10_`–`20_`）位于同一证据目录。

## 十一、补充验收（第三轮）：fb40368（F3a/F6 修复 + rejected 卡文本）

**对象与范围**：`fb403681d4d3abfe58ebc7f3a7be4494652d160b`（`fix(governance): close trailing-slash bypass and restore electron-builder rule`），对比 `2eeeeb6`。产品/测试/卡文本 4 文件 **+47/−7**：`app/desktop/boundary-change.ts` +12/−4、`src/common/门禁引擎/governance-roles.ts` +5/−1、`test/桌面应用/acceptance-dispatch.test.ts` +22/−0、`test/门禁引擎/governance-trio.test.ts` +8/−2（注释替换 + 断言）。其余 +1449/−3 为本角色第二轮补充验收报告/证据/导航（纯文档，随该提交入库）。产品/测试/卡文本范围 `git diff --check` exit 0；补充验收开始时工作树仅 `?? demos/`（本轮补充报告与 `21_`–`28_` 证据为验收后写入的未提交文件）。

**实测（Node v24.22.1，Windows 11）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | `21_typecheck.txt` |
| `node --test "test/桌面应用/**/*.test.ts"` | **646/646** 通过 | `22_desktop-full.txt` |
| `node --test test/runtime-core/request-boundary-change-tool.test.ts` | 9/9 | `23_runtime-core-tool-test.txt` |
| `node --test test/编排/request-boundary-change.test.ts` | 3/3 | `24_orchestration-test.txt` |
| `node --test "test/门禁引擎/**/*.test.ts"` | 327（326 过 / 1 Windows 平台 skip） | `25_gate-engine-tests.txt` |
| 治理 e2e（额外 sanity） | 首跑 154/155（既有 R2 request_acceptance flake），复跑 155/155；与 fb40368 无关（未触 request_acceptance） | `28_governance-e2e-sanity-first.txt`、`28b_…` |
| 独立纯函数探针 | 见下表明细 | `26_f3a-f6-probe.txt` / `.mjs` |

**逐项判定（第三轮要求）**：

| 项 | 结论 | 核实要点 |
| --- | --- | --- |
| F3a electron-builder 规则恢复 | **PASS** | `RELEASE_ROOT_PATTERNS` 恢复 `electron-builder` 到 `...\.config\.[^/]+` 交替组，同时保留 `^electron-builder\.ya?ml$`；`electron-builder.config.ts/js/mjs` 及 `electron-builder.yml/yaml` 新增/移除均 `invalid-path`（测试新增三例 + 既有 yml 例；独立探针 `26_…` 逐项复核）。相对 `2eeeeb6` 的收窄回归已关闭 |
| F6 尾斜杠绕过修复 | **PASS** | `boundaryChangePathIsGovernanceCritical` 先 `path.endsWith("/") ? path.slice(0,-1) : path`（恰好一个），空串直接 critical；`package.json/`、`package-lock.json/`、`tsconfig.node.json/`、`vite.config.ts/`、`electron-builder.yml/`、`.env/`、`index.html/` 在新增与移除两侧均 `invalid-path`；`docs/scheduling/`、`docs/acceptance/`、`docs/contracts/`、`docs/governance/`、`角色卡/executor/`、`.ans/`、`bin/`、`.github/` 带尾斜杠也拒。桌面测试对这些路径逐一覆盖 add/remove；独立探针复核全部 `critical=true`。正常目录 `config/newdir/` 不 critical、`assess` ok，票据/任务/AI 证据保留目录语义（任务与 preview 含「（目录条目）」），ticketId 稳定。多尾斜杠 `x//` 在归一化阶段即被拒，故「恰好剥一个」足够；导出函数若被直接以未归一化 `x//` 调用不会命中，但生产调用只有 `assessBoundaryChangeRequest`（先归一化），无旁路 |
| 统筹卡 `rejected` 回执 | **PASS** | `CONVENER_CARD_TEXT` 新增 bullet：`rejected`＝AI 门禁或确定性校验拒绝/不确定，**未派发组队、不自动放行、不代表客户拒绝**；按 `message` 区分「内容被拒」（终态，修正后重提交）与「门禁不可用/超时」（可修复后重试）；不得对同一 ticket/请求原样重复提交试探。`governance-trio.test.ts` 逐句断言；头注释同步。**小提示（非阻断）**：bullet 把「确定性校验」也归入 `rejected`，而确定性失败实际使用 `invalid-role`/`invalid-path`/`no-change` 回执；语义不影响（下一 bullet 列了这些 code），但措辞可再精确 |
| 无新回归 / 无弱化 | **PASS** | 测试 diff +22/−0（新增 F3a/F6 用例）与 +8/−2（注释替换 + 断言新增）；产品 diff 仅恢复/收紧判定与卡文本；未改注入面（仍仅 convener）、未新增依赖/写权/capability；typecheck 0、桌面 646/646、runtime 9/9、编排 3/3、门禁 327 全过 |

**未验证 / 残余风险（不阻断本轮 PASS）**：

- 真实 AI judge 行为、真实 Crew appointment-write 写卡、运行中 Electron（旧代码）、非 Windows 仍未验证（与主报告 §七 相同）。
- 瞬时票据 `failed` 的重试仍只以桩件覆盖 `unavailable`；真实引擎故障/超时后的重试未实测。
- 真实 judge 的 `aborted` reasonCode 不在 transient 集合，仍记终态 `rejected`（罕见）。
- 确定性治理清单仍不含 `docs/proposals/**`、`docs/intents/**`、`docs/skills/**`、`docs/mcp/**`、`docs/verification/**`、`docs/workflow.md`（本轮只要求新增集合；其余依赖 AI 门禁 + Crew 确认）。
- 瞬时路径回执 code 仍为 `rejected`（message 写「可修复后重试」）；卡文本已补 `rejected` 语义，但「内容被拒 vs 可重试」依赖 message 文本区分，不排除真实模型误判。
- 既有 `2026-10-23 重派门` 账本时序 flaky 与 R2 request_acceptance e2e flaky 仍存在（后者本轮首跑 154/155、复跑 155/155；与 fb40368 无关）。

**补充结论（第三轮）：PASS；FAIL：无。** F3a/F6 两项关闭；请求的卡文本 `rejected` 语义已落地；测试无弱化、无新权限/边界扩大。整体候选（`6b7ef38` + `2eeeeb6` + `fb40368`）维持 **有条件通过**，剩余条件为真实模型/Electron/非 Windows 未验证与既有 flaky/过程项（F4/F5）。上述证据文件（`21_`–`28_`）位于同一证据目录。
