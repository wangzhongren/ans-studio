---
id: invalid-governance-card-acceptance
type: design
title: 无效治理确认卡守卫 N1–N5 独立验收标准——呈现前拒绝、回执如实、合法路径零变化
version: A1
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: ready
related: [invalid-governance-card-guard, invalid-governance-card-guard-change, invalid-governance-card-receipt, change_invalid-governance-card-copy]
events:
  - date: "2026-10-22"
    kind: created
    summary: 在 N1–N5 已交付、测试角色跨角色验证进行中时，固定本轮当前候选的验收标准；只定标准，未判定实现结果，未运行测试
---

# 无效治理确认卡守卫 N1–N5 验收：先写死「怎样算做到」

客户在 todo-demo 真机上遇到一张缺 `flowId`/`cardKind` 的治理确认卡：判断链没有启动，卡片直接弹给客户手动确认。客户已选定**方案 2**并要求按**严格口径**（N1–N5）实施：这类无效卡在触达客户之前就被应用拒绝，工具回执如实告诉发起角色「卡片未发出」，要求补齐后重发；合法的治理卡、普通项目角色、`single`/`su` 与 choice 卡保持原样。

本文件是**本轮当前候选的验收标准（version A1，status: ready）**。它回答「交付什么、看到什么算成功、什么情况算失败、需要哪些证据、怎样下结论」。**本文不判定实现结果，不预告通过**；写作时测试角色的跨角色验证报告尚未交回，N1–N5 的候选也尚未冻结。

## 一、依据、授权与状态

- **客户授权**：客户 2026-10-22 确认按[无效治理确认卡守卫设计](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)的 **N1–N5 严格口径**实施；**O1–O7 均未获授权**。本文件不扩大该授权。
- **设计版本**：上述设计 `status: accepted`、`revision: 1`；本角色写作时核对的本机 SHA-256 为 `51fc3e34ac50e209c78c42b54b12c0a7a55965876c9c8fde138b8896ed708458`。设计 §4.5–§4.6、§6、§7.3（T1–T18）、§九、§十是本标准的行为依据。
- **标准定义时点晚于实现**：截至写作时，编排 N1、运行时核心 N2–N4、门禁引擎 N5 已交回变更记录，测试角色正在做跨角色验证并修复其 E2E 文件的类型错误。因此本文件**不是实施前标准，而是对已交付候选补定的判据**；它不改变客户已确认的设计与实施授权事实，不构成对实现的追认，也不代表任何一项已经满足。
- **候选尚未冻结**：写作时 `HEAD` 为 `4d944e7587f10be29b6356c42539e06219ed88fc`；工作树同时含有**本任务**与**后台任务**两组在途改动（`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts` 等文件被两组工作共同触及）。该 HEAD 只说明写作时点，**不是交付候选**；验收候选必须按 §五 E6 重新冻结并做改动归属。
- **角色独立**：本上下文只承担独立验收，只写 [boundary.md](../../boundary.md) Section 1 与任务精确范围共同覆盖的文件。不改产品代码、测试、断言、他人报告、权限或调度状态；不代跑全部测试，不派发，不把实施者自述当成观察结果。

## 二、交付与范围

### 2.1 必需项 N1–N5 的具体交付物

验收对象是设计 §6.1 的 N1–N5。五项缺一不可；只交付其中几项不能记完成。

| 编号 | 所有者 | 主要落点 | 验收时要看到什么 |
| --- | --- | --- | --- |
| **N1** | 编排 | `src/pipeline/orchestration/run-role.ts`（`governedInput`） | 治理 confirm 卡的**呈现前守卫**：缺 `cardKind`、越权 `cardKind`、缺/非法 `flowId` 在调用原始客户通道之前被拒；confirm 卡 `cardKind` 机械兜底（`defaultGovernanceConfirmCardKind`）已删除；拒绝返回 `declined + notPresented`（新缺字段拒绝）并写 `governance.card.rejected` 诊断；choice 分支与兜底不变 |
| **N2** | 运行时核心 | `src/model/runtime.ts` | `CustomerInputOutcome` 的 `declined` 变体新增**可选** `notPresented?: true`；`CustomerInputRequest` 不变；旧生产者不置位时无行为变化 |
| **N3** | 运行时核心 | `src/provider/runtime/tools.ts` | `makeRequestConfirmationTool` 在 `declined && notPresented === true` 时返回「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意」文案，不再以「未获客户同意」开头；常规 `declined` 文案逐字不变；`request_choice` 的 `declined` 不变 |
| **N4** | 运行时核心 | `src/provider/runtime/schema.ts` | `request_confirmation` 的 `flowId`/`cardKind` 参数描述与工具说明写明：五个内置治理角色必须始终同时携带两项，缺失会被应用拒绝且不会向客户发卡；普通项目角色与 `single`/`su` 仍为可选，旧调用仍被接受 |
| **N5** | 门禁引擎 | `src/common/门禁引擎/governance-roles.ts` | 五张内置角色卡（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier`）的「治理卡参数纪律」改为「缺任何一项＝本次不发卡、不生成客户卡、未向客户呈现，应用直接退回并提示补齐重发」；不再以「被当作旧卡、判断 agent 不介入并回落手动」描述缺字段后果 |

设计 §6.2 列出的测试改动（`test/编排/governance-judge.test.ts`、`test/runtime-core/governance-flow-metadata.test.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/测试/governance-e2e-auto/`）按各角色归属核对；目录内新增文件不要求逐文件改边界，但实际改动必须落在对应角色 Section 1 内（见 E5）。

### 2.2 明确排除的可选项 O1–O7

以下均**未获授权**，本轮不得实施，也不作为通过条件；若候选里出现相关改动，按范围越权处理（见 §六）。

| 编号 | 被排除的内容 | 范围核对例子 |
| --- | --- | --- |
| O1 | 把守卫扩展到治理角色的 `request_choice` | `request_choice` 不新增缺字段拒绝；choice 卡的 `cardKind` 机械兜底（`defaultGovernanceChoiceCardKind`）保留；choice 既有拒绝/回执文案不变 |
| O2 | 保留 confirm 卡的 `cardKind` 机械兜底 | confirm 路径不得存在「缺 `cardKind` 时按路径自动补齐并通过」；`defaultGovernanceConfirmCardKind` 若仍存在且被 confirm 调用，即为 O2 被实施 |
| O3 | 桌面第二道防线 | `app/desktop/customer-input.ts`、`app/desktop/session.ts`、`app/desktop/interface.ts`、`app/desktop/operator-channel.ts` 零 diff；`planJudge` 不新增治理字段判定 |
| O4 | 把「未发卡」口径扩展到既有应用侧拒绝 | preview 不完整、Flow YAML 非法、越权 `cardKind` 等既有拒绝的 `declined` 形状与文案**逐字不变**；不给它们补 `notPresented` |
| O5 | 修正镜像/卡片标签 | `app/renderer/` 零 diff；`isMirroredGovernanceCard`、`governanceMirrorSourceLabel` 不变 |
| O6 | 拒绝时在角色聊天流落系统行 | 不新增桌面事件/呈现面/渲染标签；拒绝只经工具回执告知模型 |
| O7 | 校验 `flowId` 对应流程/意图是否存在 | 守卫不新增读盘存在性检查；格式合法但在磁盘上不存在的 `flowId` 仍进入判断链（`schedule-write` 创建流程的场景不得被误杀） |

### 2.3 必须保持不变的部分

1. **普通项目角色**的确认卡（任何形状）：原样到达客户通道，不注入 `judgeContext`，不新增拒绝或诊断。
2. **`single` 模型下的 `su`**：无 `flowId/cardKind` 的旧卡照旧；守卫按角色身份判断，`su` 不在五个内置治理角色内。
3. **合法治理卡**（`write` / `appointment-write` / `schedule-write`，带合法 `flowId` + `cardKind`）：判断 approve/deny/manual、镜像、排队、账本、回放、下一步推导语义全部不变；`stepId` 仍非必需。
4. **choice 卡**：`request_choice` 的兜底、`intent-confirm` 语义、`liaison` 内部 choice 拒绝、`request_choice` 的 `declined` 回执全部不变。
5. **通道与共享组件**：桌面/CLI 客户通道、三适配器（Pi/Codex/Claude）、`src/common/shared/diagnostics.ts` 零 diff；`src/service/runtime/session.ts` 不属于 N1–N5 设计范围（工作树中的改动若属其他在途任务，应在归属清单中分开列明，不能算作本任务交付）。
6. **无效卡的六零**：无效治理 confirm 卡不得产生任何一项副作用——**零呈现**（客户卡/presenter 不调用）、**零镜像**（主入口无镜像卡）、**零排队**（不占「一项目一卡」的 pending/queued 槽位）、**零判断**（无 `governance-judge.started`、判断 agent 不启动）、**零账本**（无 `customer.decision` 条目）、**零写集**（不发行任何声明写入路径，后续 `write_file` 仍被仓库既有写前拦截拒绝）。

### 2.4 本轮不判、不能冒充的证据边界

| 项 | 本轮是否判 | 说明 |
| --- | --- | --- |
| 真实桌面/CLI 入口 + 真实模型/凭据（设计 §九.7 真机复验） | **不判** | 需客户另行安排；本标准的通过不替代真机阶段，也不能用脚本化模型结果冒充真实模型行为 |
| 非 Windows 平台 | **不判** | 当前证据平台为 Windows 11；通过结论只覆盖实际记录平台 |
| 应用重启后的真机复验 | **不判** | 守卫无持久状态，但重启场景属真机阶段，另行安排 |
| O1–O7 | **不判** | 未授权、不实施；不能因为「顺手做了」算加分，实施即为范围越权 |
| 提交、推送、部署、发布、合并 | **不判** | 验收结论不授权任何对外操作 |

## 三、成功标准 S1–S9

每条都要有当前候选上的**可执行证据**（测试用例名、命令、退出码、原始输出）；只有代码阅读或设计论证不算动态证据。

### S1 缺字段的治理 confirm 在原始通道之前被拒，且六零成立

**必须观察到（对应 T1、T2、T3、T9、T15）**

1. `convener` 发 `cardKind=write`、无 `flowId` 的 confirm：`declined`；原始 `customerInput` 调用 **0 次**；不生成 `judgeContext`；原因含 `flowId`；无账本条目。
2. `rapporteur` 发有 `flowId`、无 `cardKind` 的 confirm：`declined`；通道 0 次；原因含 `cardKind`。**原本可从路径机械兜底为 `write`/`schedule-write`/`appointment-write` 的卡也必须被拒**（严格口径的有意行为变更）。
3. 两者都缺：`declined`；两项原因都列出；通道 0 次。
4. §2.3.6 的六零全部成立（单元层断言 + 跨角色 T15 的 `presented=0`、`judgeRows=0`、无 `governance-judge.started`、无镜像/排队行）。

**判失败**：任一无效卡触达原始通道/客户卡/镜像/队列/判断/账本/写集；缺 `cardKind` 仍被兜底通过；拒绝原因无法指导补齐。

### S2 工具回执如实：说「卡片未发出」，不谎称客户拒绝

**必须观察到（对应 T12）**

1. `declined + notPresented:true` 时工具回执 `ok:false`，文案含「治理确认卡未发出」与「未向客户呈现」，含具体缺项与「请补齐后重新调用」，并明确**未获任何同意**、不得向客户声称其拒绝或同意。
2. 该回执**不含**误导性字样「未获客户同意」（常规 `declined` 的开头文案）。
3. 常规 `declined`（客户拒绝、判断 manual 自动退回、通道不可用等**未置位** `notPresented` 的生产者）文案逐字不变：`未获客户同意（原因：…）→ 不要写盘；如实告知客户，不得假设同意。`
4. `request_choice` 的 `declined` 即使携带 `notPresented` 也逐字走原文案（O1 未授权）。

**判失败**：无效卡回执以「未获客户同意」开头或暗示客户拒绝；缺具体缺项/补齐指引；常规拒绝文案被一并改写。

### S3 补齐重发后合法卡正常判断与代批

**必须观察到（对应 T10、T16）**

1. 同一轮先发无效卡被拒，再补齐 `flowId` + `cardKind` 重发：第二次调用到达通道；生成 `judgeContext`，`flowId` 正确；**无按标题/内容去重拦截**。
2. 跨角色场景：开关全开时判断启动并自动代批；账本 `decisionEvidence.kind="judge"`；恰一条结果行（T16）。
3. 无效卡被拒不会污染重发（无残留 pending/queued/账本状态）。

**判失败**：重发被去重/被拒；判断不启动或 `judgeContext` 缺失/错误；账本出现客户决定或重复结果行。

### S4 四个可发 confirm 的治理角色合法卡仍可用

**必须观察到（对应 T4）**

1. `rapporteur` + `write`；`nominator` + `write` 与 `appointment-write`；`convener` + `write` 与 `schedule-write`；`verifier` + `write`——全部到达客户通道。
2. 每张卡的 `judgeContext.flowId` 与传入值一致；`stepId` 缺席仍合法。
3. `liaison` 的 confirm 由 S5 单独覆盖（其确认卡允许集为空）。

**判失败**：任一合法组合被拒或未注入 `judgeContext`；`stepId` 被新增为必需；把 choice 类 `cardKind` 误当 confirm 合法集。

### S5 `liaison` 的 confirm 一律拒绝

**必须观察到（对应 T5）**

1. `liaison` 发 confirm 且缺 `cardKind`：按缺字段拒绝（`notPresented`，原因注明本角色 confirm 允许集为「无」）。
2. `liaison` 发 confirm 且带显式 `cardKind`（无论该值是否在 `TRIO_CARD_KINDS` 内）：一律拒绝；原始通道 0 次；不生成客户卡。越权 `cardKind` 路径沿用既有 `治理角色 liaison 不允许 cardKind=…` 文案（是否带 `notPresented` 按 O4 口径：**不要求**，见 F3）。
3. 需求确认仍走 `request_choice` 的 `intent-confirm`，该路径行为不变。

**判失败**：任一 `liaison` confirm 到达客户；或为放行需求确认而放宽 confirm 守卫。

### S6 schema 描述更新且旧调用仍被接受

**必须观察到（对应 T13）**

1. `request_confirmation` 工具说明与 `flowId`/`cardKind` 参数描述含治理纪律：五个内置治理角色**必须同时携带** `flowId` + `cardKind`；缺失或越权会被应用拒绝且**不会向客户发卡**；普通项目角色与 `single`/`su` 仍为可选。
2. 未改字段形状、`required`、枚举值或 `additionalProperties`；Provider 仍接受不带任何治理字段的旧调用，请求与 metadata 不凭空出现字段。
3. Provider 不做角色级判定（角色白名单与呈现前守卫仍在编排）。

**判失败**：schema 未更新或把字段改成必填/改枚举；普通角色/su 被新增限制；Provider 获得角色级拒绝逻辑。

### S7 五张内置角色卡文本更新

**必须观察到（对应 T14）**

1. 五张角色卡（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier`）的「治理卡参数纪律」统一为新文案：缺任何一项＝**本次不发卡、不生成客户卡、未向客户呈现**，应用直接退回并提示补齐重发；必须补齐两项重发。
2. 该纪律段不再用「会被当作旧卡、判断 agent 不介入并回落手动」描述缺字段后果。
3. **范围澄清**：`nominator` 卡中关于「先弹任命卡会因规范物证缺失回落手动」的既有**证据门槛**语句不属参数纪律，不要求改动，也不能据此判失败（设计 §十.6 只要求更新现行参数纪律表述）。

**判失败**：任一角色卡仍以旧口径描述缺字段后果；五卡口径不一致；或为消除字面「回落手动」误改了无关语义。

### S8 `notPresented` 向后兼容

**必须观察到（对应 T12、T13）**

1. `notPresented` 是**可选**字段；`CustomerInputRequest` 形状不变；旧生产者不置位时，下游行为与文案逐字不变。
2. 桌面只读该类型、无行为变更（`app/` 零 diff）。
3. 无版本号变化、无数据迁移要求；旧会话/旧回放不受影响。

**判失败**：把字段改成必填、改变既有 `declined` 变体形状、或让旧生产者产生新文案/新行为。

### S9 合法卡与既有治理语义零变化

**必须观察到（对应 T17）**

1. 五角色合法卡的判断开关矩阵、approve/deny/manual、镜像、下一步推导、账本与回放与改前一致。
2. 队列语义唯一变化是「无效卡不再占位」；合法卡的排队/一项目一卡行为不变。

**判失败**：合法路径任何可见行为变化；把无效卡的拒绝扩散到合法卡。

## 四、失败与边界标准 F1–F12

> 本文件的 F 编号只用于本标准；设计 §7.3 的 T 编号另有含义；仓库既有的「F4 写前拦截」是产品内既有闸门名称，与本文件编号无关。

### F1 缺字段矩阵逐项成立

只缺 `flowId`（有 `cardKind`）、只缺 `cardKind`（有合法 `flowId`）、两者都缺、`flowId` 缺失但 `stepId` 存在：四种都拒绝，原始通道 0 次，原因与实际缺项一致；两者都缺时合并列出两项且其余说明句不重复。缺 `cardKind` 但此前可机械兜底的路径必须被拒，不得回退到兜底。

### F2 非法 `flowId` 格式

大写、空串、纯空白、单字符、含下划线、首尾连字符、超过 64 字符或含非法字符：无论由 Provider 形状校验还是编排守卫拦截，**都不得触达原始通道、不得发卡或产生任何副作用**；直接调用包装器时（T9）为 `declined`。不得把格式非法降级为「无 flowId 但放行」。

### F3 越权 `cardKind` 与既有拒绝口径

`rapporteur` 发 `schedule-write`（T6）：沿用既有拒绝文案 `治理角色 <id> 不允许 cardKind=<kind>；允许：<列表>。本次未向客户发卡。`；原始通道 0 次。工具级枚举之外的 `cardKind` 由 Provider 既有形状校验拒绝（既有文案），同样 0 次。**这两类既有拒绝不要求 `notPresented`**（O4 未授权）；若实现给它们补了 `notPresented` 或改写文案，按范围越权/口径变化处理。

### F4 重复拒绝幂等、无持久状态

同一张无效卡重复调用得到同样错误；不生成 requestId、不占 pending/queued、不写账本、不发行写集；不按标题/内容去重；会话中止/重启不需要恢复任何守卫状态。工具为 `executionMode:"sequential"`，同轮重发不存在同批并行抢跑。证据须有重复调用或等价断言，不能只靠代码阅读。

### F5 拒绝后写集未发行

无效卡被拒后：账本无 `customer.decision`；声明写入路径未发行；随后对同一路径的 `write_file` 仍被仓库既有写前拦截拒绝（T11）。不能用「卡片没发但写集已发行」的路径。

### F6 普通项目角色零变化

项目角色 confirm 无任何治理字段：原样到达通道，`judgeContext` 未注入，无新增拒绝/诊断（T7）。在 `trio` 项目里的项目角色也一样。

### F7 `single`/`su` 零变化，且角色身份优先于配置值

1. `single` + `su` 的无字段 confirm 原样到达通道（T8）。
2. 五个内置治理角色即使被开在 `single` 项目里，仍受守卫（判据是角色身份，不是 `governanceModel` 取值）——需有单元或包装器层证据。
3. `trio` 下迁移后隐藏的 `su` 不受守卫（`governanceRoleOf("su") === undefined`）。

### F8 choice 兜底与 choice 路径不变

`request_choice` 缺 `cardKind` 时按角色兜底（`defaultGovernanceChoiceCardKind`）保留；choice 卡不新增缺字段拒绝；`request_choice` 的 `declined` 回执逐字不变；`liaison` 内部 choice 拒绝（2026-10-20 行为）不变。所有既有 choice 测试通过。

### F9 诊断只用白名单字段，不扩 `FIELD_NAMES`

1. 新增 `governance.card.rejected` 只用 `{ state: "not-presented", reasonCode, ok: false }` 等既有白名单字段；`reasonCode` 取值可核对（`missing-card-kind` / `missing-flow-id` / `missing-card-kind-and-flow-id` / `role-not-allowed`）。
2. **不记录** `flowId`/`cardKind`；`roleId` 来自 logger 上下文，不新扩字段。
3. `src/common/shared/diagnostics.ts` 零 diff；不得为诊断扩白名单（属另一件共享组件变更）。

### F10 既有呈现前闸不变

preview 完整性校验、Flow YAML 校验的拒绝条件、文案与 `declined` 形状逐字不变；不得借守卫顺带改写（O4 未授权）。既有对应测试通过。

### F11 不做 `flowId` 存在性校验（O7）

格式合法但磁盘上不存在的 `flowId` 不被守卫拒绝；守卫不新增读盘调用；`schedule-write` 用新 `flowId` 创建流程的合法卡正常进入判断链（T4 场景）。存在性/物证问题仍由判断 agent 的证据门槛处理。

### F12 全仓 `npm run typecheck` 必须为 0

1. 同一候选上运行 `npm run typecheck`（即 `tsc --noEmit`），**退出码 0**，附原始输出尾部。
2. 测试角色正在修复的 `test/测试/background-tasks-e2e-real-model/` 3 个类型错误（写作时记录为 `e2e-background-real-model.ts`、`pi-smoke.ts`、`run-shell-comparison.ts` 的 `OrchestrationEvent`/`SessionEvent` 不兼容）必须在其 E2E 文件修复后消除；**全仓 0 错是硬条件**，不能以「定向 0 错」代替。
3. 若剩余错误来自本任务改动文件 → 返工；来自其他角色文件 → 按证据不足处理，直到该所有者交付修复后的同一候选。

## 五、必需证据 E1–E8

实施与测试角色交付时必须提供下列证据；不接受「已完成」「已测」这类自述。每条证据都要绑定**同一候选**（E6）。

| 编号 | 证据 | 通过条件 |
| --- | --- | --- |
| **E1** | **各角色变更记录** | 编排 `角色卡/编排/docs/change/2026-10-22_change_invalid-governance-card-guard.md`、运行时核心 `角色卡/运行时核心/docs/change/2026-10-22_change_invalid-governance-card-receipt.md`、门禁引擎 `角色卡/门禁引擎/docs/change/2026-10-22_change_invalid-governance-card-copy.md` 均存在；写明用户可见入口、实际代码位置、验证命令与结果、未验证项；状态与实际相符（不得把未跑的真机/跨角色写成已验证） |
| **E2** | **测试角色跨角色报告与原始输出** | `角色卡/测试/docs/change/2026-10-22_change_invalid-governance-card-verify.md`（若实际文件名不同，须给出真实路径并说明）存在，包含 T15–T17 逐条结论、实际命令、工作目录、环境、退出码与原始输出；T15 断言 `presented=0`、`judgeRows=0`、无 `governance-judge.started`、无镜像/排队行、工具回执 `ok:false` 且可操作、无账本决定；T16 断言补齐后判断启动、开关开时代批、`decisionEvidence.kind="judge"`、恰一条结果行；T17 为回归对照 |
| **E3** | **三个定向测试套件的命令与原始输出** | 同一候选上实际运行：`test/编排/governance-judge.test.ts`（写作时记录 **77 tests / 77 pass**）、`test/runtime-core/governance-flow-metadata.test.ts`（**9 tests / 9 pass**）、`test/门禁引擎/governance-trio.test.ts`（**33 tests / 33 pass**）；记录命令、cwd、退出码、原始 stdout/stderr；T1–T14 每条映射到可指名用例。计数以候选上实际输出为准；相对上述参考数减少、出现 skip 或删除断言，须逐项说明理由，且不得以减少用例达成通过 |
| **E4** | **全仓 `npm run typecheck`** | 同一候选上实际运行，退出码 **0**，附原始输出尾部；不能只写「类型检查通过」；覆盖测试角色 E2E 修复后的工作树 |
| **E5** | **改动路径清单与 Section 1 归属** | 完整 `git status --porcelain`、`git diff`（含未跟踪文件逐项列名）；逐条归属到 N1–N5、各角色测试或文档，并证明每条路径落在对应角色 `boundary.md` Section 1 内；`app/**`、三适配器、`src/common/shared/diagnostics.ts` 零 diff（O3/O5/O6/CC 白名单）；工作树中**后台任务**等其他在途任务的改动必须分开列明，不得混入 N1–N5 的交付或 O1–O7 的核对；越权改动按 §六返工处理 |
| **E6** | **候选身份与环境** | `git rev-parse HEAD` 完整 SHA + 工作树完整清单（修改/新增/删除/未跟踪）或内容摘要清单（含未跟踪文件哈希）；OS/架构、Node/npm 版本、执行时间、各命令与退出码；所有证据绑定同一候选。候选在证据生成后有任何产品代码/测试/配置变化，受影响证据失效需重跑；Windows 证据不能由其它平台结果代替 |
| **E7** | **方案与标准版本** | 设计路径、`status: accepted`、`revision: 1` 与 SHA-256 `51fc3e34…` 被引用；本文件 A1 版本与三份变更记录版本被引用；验收报告写明逐条对照所用版本 |
| **E8** | **全量测试基线与既有红** | 按设计 §九.6 实际运行 `node --test "test/**/*.test.ts"`（或仓库既有等价全量命令），记录命令、退出码、通过/失败计数与失败清单；既有环境红（如 Windows 无 symlink 权限的 `EPERM`）须指名并附证据，**不得把既有失败算作本改动通过，也不得把本改动引入的失败归为既有基线红**。未运行或无法区分基线红 → 证据不足 |

## 六、判定规则

### 6.1 三种结论

| 结论 | 条件 | 后续 |
| --- | --- | --- |
| **通过（pass）** | N1–N5 交付齐全且归属正确；S1–S9、F1–F12 全部满足；E1–E8 完整且绑定当前候选；无未解决失败；O1–O7 未实施；无断言被删除/放宽、无测试被 skip 以促成通过；文档与实际行为一致 | 交可信启动端/统筹记录该阶段完成。通过只覆盖「当前候选 × 实际记录平台」的 N1–N5 范围，不授权提交/推送/部署/发布/合并，不替代真机阶段 |
| **返工（needs-work）** | 已有证据表明不满足标准：例如无效卡触达原始通道/客户卡/镜像/队列/判断/账本/写集；缺 `cardKind` 仍被机械兜底；回执谎称「未获客户同意」或缺少「卡片未发出」；`liaison` confirm 放行；任一合法 confirm 角色被误伤或 `judgeContext` 错误；普通项目角色/`single`/`su`/choice 行为改变；schema 或五卡文本未更新/口径不一致；诊断扩白名单或记录 `flowId/cardKind`；既有 preview/YAML/越权拒绝文案被改写；新增 `flowId` 存在性校验；全仓 typecheck 非 0；测试断言被放宽、删除或跳过；O1–O7 被实施；改动越权 | 验收报告列出条目、原始证据、差异与应回到的所有者（编排 / 运行时核心 / 门禁引擎 / 测试，越权处还需 Team Formation 处理）；由可信启动端安排修复与复测，保留原失败记录 |
| **证据不足（missing-evidence）** | 无法判断：测试未实际运行或只给自述/截图；缺少命令、退出码或原始输出；测试角色报告缺失或 T15–T17 未运行；关键场景只有代码阅读；证据绑定旧候选/与当前工作树不符；E1–E8 任一必需项缺失；环境未记录；全量基线红无法区分；候选尚未冻结或实施未完成 | 写明缺什么、由谁补、补证后重判；**不能记通过**，也不能把「没有证明失败」当成通过 |

### 6.2 必须判「证据不足」的情形（不穷举）

1. 声称测试通过但没有实际运行记录、退出码或原始输出。
2. 测试输出对应的候选与当前工作树不一致（HEAD、工作树或未跟踪文件哈希不符）。
3. 关键标准只有代码阅读/设计论证，没有动态证据（尤其是 S1 的 raw 0 次、S2 的回执文案、S3 的重发代批、F4 的幂等、F5 的写集未发行）。
4. 测试角色报告缺失，或 T15–T17 只有计划没有执行记录。
5. `npm run typecheck` 未在同一候选运行，或只提供定向 typecheck 结果。
6. 全量测试未运行或既有红与新增红无法区分（E8）。
7. 平台/环境未记录，或只提供其他平台证据却宣称本平台行为。
8. 改动归属清单缺失，无法判断 N1–N5 与后台任务等其他在途工作的边界。

### 6.3 证据失效与不降低标准

- 产品代码、测试、断言、配置或依赖在证据生成后变化 → 受影响证据失效，需在新候选上重跑受影响门；不能拼接不同候选的输出。
- 同一候选同一范围已有有效结论可复用；设计/标准实质修订后，按原确认流程更新并重判受影响项。
- 验收不为了通过而放宽标准：不接受自述代替原始输出、代码阅读代替行为测试、定向 typecheck 代替全仓 typecheck、单元测试代替跨角色 T15–T17、脚本化模型结果冒充真机、其他平台结果代替 Windows。
- 验收报告至少包含：任务/阶段、设计与本标准版本（含设计 SHA-256）、候选身份、实际改动范围与归属、逐条 S/F 结论、原始证据链接、剩余问题与理由。

## 七、未判范围与未决问题

### 7.1 本轮不判

1. **真机阶段（设计 §九.7）**：真实桌面/CLI + 真实模型/凭据下「无效卡不出现、无 `governance-judge.started`、角色收到可操作错误并能补齐重发；合法卡仍按开关代批」——需客户另行安排；本轮通过不替代。
2. **非 Windows 平台**：不判；通过结论只覆盖实际记录平台。
3. **应用重启后的真机复验**：不判。
4. **O1–O7**：未授权、不判；若发现实施，按范围越权交回，不因「行为更好」而算通过。

### 7.2 未决与需交接确认

1. **候选尚未冻结**：写作时工作树同时含本任务与后台任务两组在途改动，且 `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts` 被共同触及。验收前必须由可信启动端给出**候选冻结时点**与**改动归属清单**（E5/E6）；否则只能判证据不足。
2. **测试角色报告文件名**：本文件按 `角色卡/测试/docs/change/2026-10-22_change_invalid-governance-card-verify.md` 预期；若实际文件名不同，以真实路径为准并在报告中说明。
3. **测试角色 E2E 类型错误的修复归属**：写作时全仓 typecheck 的 3 条错误位于测试角色未跟踪目录 `test/测试/background-tasks-e2e-real-model/`。该修复属测试角色边界；本任务的全仓 typecheck 0 以修复后的同一候选为准。
4. **全量测试基线红**：设计 §九.6 要求记录基线红且不得把既有失败算作本改动通过。写作时已知的 Windows symlink `EPERM` 等环境红需在全量运行中逐条指名；若全量运行无法执行，按证据不足处理并说明原因。
5. **真机阶段的安排**：是否需要客户在本轮之外执行 §九.7，由可信启动端与客户确认；本文件不自行推定。

## 八、标准状态与后续

- 本文件是**验收标准（version A1，status: ready）**，不是实施、测试、验收报告或发布记录。截至写作时，测试角色跨角色报告尚未交回，候选未冻结；本文件不对任何候选给出通过/返工/证据不足结论。
- 交付方按 §五 提交证据后，本角色将在自身 `docs/change/` 撰写独立验收报告，逐条对照 S1–S9、F1–F12 与 E1–E8，附原始证据链接和候选摘要；结论只写通过、返工或证据不足三态之一（可分项）。
- 标准若因授权、候选或契约变化需要修订，先记录依据并按原确认流程处理；实施后不得为了通过而放宽本文件。
- 验收通过不授予提交、推送、部署、发布或合并权限。
