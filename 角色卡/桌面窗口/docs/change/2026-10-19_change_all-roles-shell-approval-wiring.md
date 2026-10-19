---
id: all-roles-shell-approval-wiring
type: change
title: 全部内置治理角色接入 shell 审批档
created: "2026-10-19"
status: implemented
---

# 全部内置治理角色接入 shell 审批档

## 客户原文（2026-10-19 新规则）

> 「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，
> 只不过都要提交审批，按照原有的流程审批。」

门禁引擎已把五个内置治理角色（liaison/rapporteur/nominator/convener/verifier）的
`capabilities.shell` 全部改为 `"operator-approve"`（su 保持）。本变更把桌面接线对齐该规则：
审批档不再只属于 single/su，而是**全部 `role.builtIn === true` 的会话**。

## 接线改动

- `app/desktop/session.ts`
  - `shellOperatorOnly`（审批档）构造判据由 `legacyBuiltIn`（仅 single/su）扩为
    **`role.builtIn === true && this.deps.shellArming && shellOperatorChannel`**：single 的 su 与
    trio 五人（liaison/rapporteur/nominator/convener/verifier）统一获得审批档。
  - 仍要求 `deps.shellArming`（(c) 规则集实件）与 `deps.shellOperatorChannel`（(a) 操作者确认通道）
    齐备；任一缺件 ⇒ **不传**该字段 ⇒ 编排不 arm（能力缺席 = fail-closed，绝不放宽）。
  - **删除 `shellReadonly` 的构造与透传**（原 trio Convener 只读档）：全部内置治理角色统一审批档，
    桌面绝不与之并存（编排对 `shellOperatorOnly` + `shellReadonly` 并存互斥拒绝、不 arm）。
    `openRoleSession` 入参里的 `shellReadonly` 类型保留，仅作其他调用方/测试的兼容面。
  - 项目角色路径（(c)/(b)/(a) 三层链）逐字未变；客户交互通道、shell/governance 判断闭包、投递机、
    重建/看护等既有语义未改。
  - `session.ts`、`interface.ts`、`operator-channel.ts`、`app/main.ts` 的注释同步新口径（旧「审批档只属于
    single/su」「trio 不接审批档」「convener 只读档」「su 不接 (b)/(a)、走只读档」表述全部更新；
    `main.ts` 仅注释改动，代码零改动）。

- 生效语义（全部内置治理角色）：`run_shell` 注册；(c)=allow 的只读白名单**直接执行、0 卡**；
  `risky`/`review`/`deny` 逐条交客户/判断 agent **审批**（deny 也可被批准；是否由判断 agent 代批
  取决于客户开关）；拒绝/超时/通道不可用一律**不放行**（fail-closed）。shell 可读写、可执行任意命令。

## 影响面

- trio：liaison/rapporteur/nominator/verifier 的 `run_shell` 由「不接入」变为「审批档」；convener 的
  「只读档」退役——risky/review/deny 不再一律拒绝，而是提交审批。
- single/su：行为不变（此前已是审批档）。
- 项目角色三层链与全部其它能力路由（派发/看护/安装/交接/澄清等）不变。
- 依赖门禁引擎能力矩阵（他人改动，已落树）：编排 `run-role.ts` 以 `capabilities.shell ===
  "operator-approve"` 才接受 `shellOperatorOnly`；五个内置角色均已满足，故本接线即接通。
- 命名沿用：编排既有的卡片原因前缀/策略名仍为 `su-审批档[…]` / `su-approval`（单一来源在编排
  `shell-arming.ts` 再导出），桌面只按该前缀解析；本次不改客户可见文案与解析语义。

## 测试

- `test/桌面应用/operator-channel.test.ts`：源码钉子更新为
  `role.builtIn === true && this.deps.shellArming && shellOperatorChannel`；新增反向钉——桌面不再构造、
  也不再透传 `shellReadonly`。既有 fail-closed、项目角色三层链、su 审批档用例全部保留。
- `test/桌面应用/dispatch-delivery.test.ts`：三权能力矩阵用例同步——rapporteur/nominator/convener
  均获 `shellOperatorOnly`（同一份 (c) 实件 + (a) 通道），convener `shellReadonly` 为 `undefined`；
  新增一例「trio 五个内置治理角色全部经 `shellOperatorOnly` 获得审批档（convener 不再走只读档）」，
  覆盖五个职能（liaison/proposal/nomination/schedule/verification）、单一来源引用同一性、无只读档、
  无三层链字段、无直接 `shellOperatorChannel` 字段。
- `test/桌面应用/session.test.ts`：既有 su 审批档用例在新判据下原样通过，未放宽任何断言。
- 真实输出：`node --test "test/桌面应用/**/*.test.ts"` ⇒ **586 计 / 585 过 / 1 红**。唯一红＝
  `test/桌面应用/runtime-ui.test.ts:69`「renderer 仅消费 IPC，机密为空且无持久化…」——断言
  `app/renderer/renderer.js` 不含 `localStorage`，而 HEAD 的 renderer.js 侧栏持久化代码含
  `localStorage`（该文件与测试在工作树中均未修改，非本变更引入；属桌面UI/渲染域，不在本角色写入面），
  如实登记、不处理。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险（如实登记）

- **shell 副作用不受文件写门禁约束**：`run_shell` 无路径参数、不进 `GOVERNED_WRITE_TOOLS`，放行的
  命令可读写项目内外任意路径——写边界只约束 `write_file` 等受治理写工具，不约束 shell 命令的副作用。
  该风险自 I-1 arm 起既有，本次因审批档扩至全部内置治理角色而**适用面更广**。
- **审批链是唯一控制**：只读白名单直接执行（无需人工看）；其余命令完全依赖客户（或客户开启的
  「替我审批」判断 agent）逐条裁决，判断 agent 本身非确定性。拒绝/超时/通道不可用一律不放行
  （fail-closed），但**放行后的命令内容与副作用不做执行后拦截**——审计留痕只是事实记录，不是事后
  防线。
- 内置治理角色（含 su）自此都可经审批执行读写与任意命令；「治理决定与命令放行分离」不再靠只读档，
  而是靠审批链逐条把关。
