---
id: shell-gate-arming
type: change
title: 开放 shell（I-1）：三层链装配与 arm（编排侧）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §I-1（客户裁定启用 V1 未接线的三层链；无 OS 沙箱边界如实登记）
  - date: "2026-10-12"
    kind: implemented
    summary: 编排实施——新增 shell-arming.ts（装配 (c)+(b)+(a)）；openRoleSession 收 (a) 通道对**项目角色**装配注入（su 不 arm）；工厂 caps 闸优先、cwd 钉根与凭据剥离核实为既件
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 157/157（+5）；typecheck 本角色零错；全量 800 计/797 过，仅剩 2 条既有环境红
---

# I-1 开放 shell：编排侧装配与 arm

> 依据：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §I-1（客户裁定：启用 V1 未接线的三层链）。**已知并接受的边界（设计原文，如实复述）**：V1 **无 OS 沙箱**——被放行的命令其文件写入**绕过写门禁**（靠 (c) 硬地板 + su 审读守卫）；命令逐条留痕（审计）。

## 改在哪里（位置 → 改动）

**新增 `src/pipeline/orchestration/shell-arming.ts`——`assembleProjectShellGate(opts)`（装配既有三层链，全部用既件）**
- (c) **确定性硬地板**：门禁引擎纯函数 `classifyShell` + 规则集，**注入**（`common/编排/shell-gate.ts` 既定架构：「规则集内容不属编排」）；未注入 ⇒ 产出的闸**一律拒绝**（fail-closed）。
- (b) **su 模型审读**：既有 `pm-reviewer`（`createPmReviewer`）；审读角色 = **`listProject` 枚举的内置治理角色**（缺省即 su，不硬编码）；拿不准/判读非法/不可用 → 升 (a)；判「危险」（risky）→ **必过 (a)**（§14.2 由既有闸执行）。
- (a) **操作者确认**：**前端注入**的 `operatorChannel`；关窗/不答/超时 = **不放行**（既有闸的 a-* 分支，fail-closed）。
- 审计：`buildShellGate` 内建（`docs/audit/shell-gate.jsonl`，以**治理边界** + 声明 `shell-gate` 条件；取不到治理边界 → 未接受边界 ⇒ 审计写被拒、如实 stderr、**不翻转**判定）。

**`src/pipeline/orchestration/run-role.ts`**
- `AdapterCapabilities` 增 `shellGate?: ShellGate`；`openRoleSession` 增输入 `shellOperatorChannel?`（(a) 通道，**兼 arm 开关语义**）与 `shellArming?`（高级注入：(c)/(b)/超时/审计，测试与将来装配用）。
- **arm 规则：只对项目角色**（`suppressHandback` 即 su → 不 arm；设计留白由协调方定为「su 自身不 arm」）；装配失败 ⇒ **不 arm**（能力缺席 = fail-closed，`run_shell` 不注册）。
- `createPiAdapterFactory`：`shellGate: capabilities?.shellGate ?? shellGate`（能力面优先；第二参保留兼容）；**核实并钉住既件**——cwd 钉根 = `real-adapter.ts:755` 已传 `shellCwd: opts.projectRoot`；凭据剥离 = `tools.ts::buildShellEnv` spawn 前删 `PI_CREDENTIAL_ENV_VARS`（两项均**既有**，本层未改、未另传）。

## ⚠ 跨角色依赖（如实登记，未越界自行引入）

(c) 的**实件**在门禁引擎私有 `src/common/门禁引擎/classify-shell.ts`——本角色**不导入**（§6 禁止跨角色私有 common；`shell-gate.ts` 头注明言「规则集内容不属编排」、依赖**注入**）。**合法注入源**（`shell-gate.ts:49` 预期的 `src/service/gate/` 公开再导出）**尚不存在** ⇒ 当前：测试注入**实件**（test/编排 域既有做法，多文件同）；**生产调用（桌面 arm）暂只能注入桩/缺省（缺省 ⇒ 闸一律拒绝）**。**待办**：门禁引擎经 service 公开再导出 `classifyShell`/`defaultShellRules`（一行文件，归其 Section 1），此后桌面经 `shellArming` 注入实件即全链可用——**请 pm 转达**。

## 测试与证据（全部假件，绝不真跑命令）

`test/编排/shell-arming.test.ts`（**5 例全绿**；(c) 用门禁引擎实件，(b) 用 `openSession` 桩，(a) 用桩通道）：
① 注入即注册（项目角色 + 通道 ⇒ `caps.shellGate` 存在）/ 不注入不存在 / **su 给了也不 arm**；
② (c) 硬拒（`sh -c`）→ 不执行、**不打扰 (b)/(a)**；白名单（`ls -la`）→ 直接放行；
③ review + (b) allow → **可达执行且不经 (a)**；risky + (b) allow → **必过 (a)**；(a) 拒 → 不执行；
④ (b) 判读非法（badjson）/拿不准（unsure）→ 升 (a)；(a) 不可用/超时（关窗等价）→ 不执行、理由如实；
⑤ 留痕：审计 sink 每条请求一条（command/conclusion/branch/by/条件 `shell-gate`）；事件流含 run_shell 的 tool_call 与 denied（拒绝理由如实）。

- `test/编排/` **157/157**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（引号带）**800 计 / 797 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），**全仓其余全绿**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。
- 真实执行路径（真命令、真模型 su 审读、真确认框）属**客户跑**；本层自动化只覆盖判定与接线（不 spawn 任何命令）。

## 不改什么

- `shell-gate.ts`/`shell-audit.ts`/`pm-reviewer.ts` 判定逻辑一字未动（纯装配与注入）；「注入才注册」语义未改；CLI 一次性入口不接（无确认框，`run_shell` 不注册）；桌面 `DESKTOP_SHELL_GATE_ARMED` 与其确认框接线归桌面。
