---
id: su-readonly-shell
type: change
title: su 只读 shell——只读档（只接 (c) 白名单）的闸映射、装配与 arm
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [shell-gate-arming, governed-interaction-and-chat-ux]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 客户裁定「su 也要有 shell，但是只读」；设计口径已定——只读 = shell 闸 (c) 层确定性白名单档的直接映射，不接 (b)/(a)
  - date: "2026-10-12"
    kind: implemented
    summary: shell-gate 增可选 readonlyOnly + 常量 BRANCH_READONLY_DENY；shell-arming 增 assembleReadonlyShellGate（共用审计边界解析）；run-role 增 shellReadonly（arm，只读优先）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 174/174（+8 新用例）；typecheck 零错；全量 901 计 / 898 过 / 2 红（均既有环境红）
---

# 客户裁定：「su 也要有 shell，但是只读」

> 背景：内置治理角色 su **完全没有 shell**（`run_shell` 不注册）——su 在真机里连 `ls`/`cat` 都跑不了，诊断只能靠猜读。客户裁定给它一个**只读 shell**。

## 以前怎样 / 现在怎样

- **以前**：su 的会话没有任何 `run_shell`；
- **现在**：给 su 的会话传 `shellReadonly`（桌面/CLI 前端按角色种类决定）⇒ su 的 `run_shell` **注册**，但**只执行 (c) 确定性白名单命令**（`ls`/`cat`/`head`/`tail`/`wc`/`grep`/`rg`/`diff`/`echo`/`stat`/`git` 只读子命令/`node --version`/`npm` 读类……——即 `classifyShell` 判 `allow`、命中 `allow:readonly:*` 的那些）。**其余一律拒**：
  - `risky`（如 `rm`、`npm run`）→ **拒**（新分支 `readonly-deny`；**不**交 su 模型审读——su 自己就是审读者、不自审；**不**打扰客户）；
  - `review`（如 `node --test`——跑测试类命令**不在只读白名单**，本任务接受的现状）→ **拒**（同上）；
  - `deny`（硬拒，如 `sh -c`）→ 照旧拒（`c-deny`）；
  - 拒绝理由**写死口径**：「su 只读档：本会话仅允许只读白名单命令；该命令未命中白名单（(c) 判为 risky/review），按 su 只读策略拒绝执行——这是策略拒绝，不是环境故障。」——让模型看懂**是策略拒、不是环境坏了**，不给模型留下「多试几次/换个写法绕」的诱因。
- **项目角色的三层链逐字不变**（`shellOperatorChannel`/`shellArming` 路径未动）。

## 改在哪里（位置 → 改动）

1. **`src/common/编排/shell-gate.ts`**（判定映射）：
   - `CreateShellGateOptions` / `ShellGateBuildDeps` 增**可选** `readonlyOnly?: boolean`（`buildShellGate` 透传）——**缺省 false = 既有三层链行为逐字不变**；
   - 新增导出常量 **`BRANCH_READONLY_DENY = "readonly-deny"`**（与既有 `BRANCH_*` 同区，带注释说明语义）；
   - `readonlyOnly === true` 时 `decide`：`allow` → 既有 `c-allow` 路径（执行）；`deny` → 既有 `c-deny`；**`risky`/`review` → 在进入 `runBA` 之前返回 `readonly-deny`**（(b)/(a) 结构性不可达——即使被注入也永不调用）。三出口的 `by` **统一带「（su 只读档）」后缀**（审计档位可辨识；记录本无独立 role 字段）。fail-closed 三退路（`ruleset-load-failed` / `no-classifier` / `classify-error`）语义**逐字不动**。
2. **`src/pipeline/orchestration/shell-arming.ts`**（装配）：
   - 新增 `AssembleReadonlyShellGateOptions`（钉死形状：`project` / `classifyShell?` / `rules?` / `timeoutMs?` / `now?` / `env?` / `auditSink?`——**选项面没有 operatorChannel / pmAsk / pmRoleId / openSession / sessionDeps：type 层面即接不上 (a)/(b)**）与 `assembleReadonlyShellGate(opts)`；
   - 复用既有「内置治理角色边界 → 审计边界」解析——抽为共享私有 `resolveGovernanceBoundary(project, roleIdOverride?)`，三层链与只读档**共用同一份**（行为逐字不变），组 `buildShellGate({ readonlyOnly: true })`；
   - **不接 pmAsk、不接 operatorChannel**；`rules` 未注入 ⇒ 既有抛错加载器 ⇒ 一律拒（fail-closed）。
3. **`src/pipeline/orchestration/run-role.ts`**（arm）：
   - `openRoleSession` 入参增 `shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">`（注释：内置治理角色 su 的只读档，客户裁定 2026-10-12）；
   - arm：`input.shellReadonly !== undefined` ⇒ `assembleReadonlyShellGate({ project, ...input.shellReadonly })` 注入 `capabilities.shellGate`（与既有路径同样进 gate ⇒ Pi 适配器注册 `run_shell`）；
   - **优先级（确定行为，代码注释已写明）**：`shellReadonly` 与 `shellOperatorChannel`/`shellArming` 同时出现 ⇒ **readonly 优先**（只读档执行集严格 ⊆ 三层链执行集——更严的一档，绝不放宽）；未给 `shellReadonly` 才走既有三层链（逐字不变）；
   - 装配失败 ⇒ **不 arm**（`run_shell` 不注册），与既有一致。
   - ⚠ **与任务书字面的一处偏差（如实登记）**：任务书写 arm 条件为 `!suppressHandback && input.shellReadonly !== undefined`。`suppressHandback === true` 恰是 **su**（内置治理角色）——按字面实现只读档**永远装不到 su 头上**，与「仅内置治理角色 su 的只读档」注释、与客户裁定（su 要有只读 shell）直接矛盾。故实现为：**`shellReadonly` 给出即 arm、readonly 优先**（su 获 arm 与项目角色 readonly 优先两向均有测试钉住）。若协调方另有意图请裁定。

## 不改什么（范围）

- **不接 (b) su 模型审读、不接 (a) 客户确认**；**不弹任何对话框**（选项面没有 (a) 通道即是结构保证；测试用「一调用即抛错」的桩反向钉死）。
- **不改规则集内容**（`src/common/门禁引擎/**` 未动）——「跑测试类命令（`node --test`）不在只读白名单」是**本任务接受的现状**；是否另开规则由协调方后续裁定（届时门禁引擎改规则、本档自动跟随）。
- **不改** `src/provider/pi/**`（Pi 适配器）、`app/**`（桌面应用，协调方另派）；CLI 出口未动。
- 审计口径不变：仍落 `docs/audit/shell-gate.jsonl`，`execution` 恒「未执行」、命令逐字原文、分支如实；只读档记录的 `by` 带「（su 只读档）」后缀使档位可辨识（记录本无独立 role 字段）。

## 顺带核查：`run_shell` 工具描述文案（只报告、未改）

`src/common/pi-adapter/real-adapter.ts::describeTool`（`toPiTool` 一段；381-391 行）对 `run_shell` 的文案：
- 描述：**「受治理的 shell 命令工具。执行前必须过 ShellGate 审核；未获明确 allow 绝不执行。」**
- 参数描述：`Shell command to review and (only if allowed) execute`。

**核查结论：未把三层审核说死**——文案是通用「过 ShellGate 审核、未获明确 allow 绝不执行」，对 su 只读档（ShellGate = 只读档）与项目角色三层链**同样成立**，无需按本任务改动。**但有一处如实指出**：su 的会话界面/系统提示若未来要引导模型「只发只读命令」，该引导不在本文案内（现文案未提示「只读」二字）——模型会经**拒绝理由**（本档口径）学到边界；是否需要为 su 会话补一句角色侧的只读说明，归协调方决定（涉及 `src/provider/pi/**`，非本角色边界）。

## 如何确认（实际证据）

- 新增 `test/编排/shell-readonly.test.ts` **8 例**（全部仅做闸判定、绝不真跑命令）：
  ① 四档映射：allow→执行（`c-allow`）/ risky→`readonly-deny`（reason 写明命中档 + 「不是环境故障」）/ review→`readonly-deny` / deny→`c-deny`；
  ② **(b)/(a) 从未被调用**：`createShellGate({ readonlyOnly:true, pmAsk:(一调用即抛错), operatorChannel:(一调用即抛错) })` 四档全覆盖，计数 0 + 分支全非升级链；
  ③ **fail-closed**：`rules` 未注入 ⇒ 一律拒（`ruleset-load-failed`）；`classifyShell` 未注入 ⇒ 一律拒（`no-classifier`）；
  ④ **真实落盘 `docs/audit/shell-gate.jsonl`**（默认文件 sink、治理边界 + 声明 `shell-gate` 条件）：逐字命令 / branch（`c-allow` / `readonly-deny` / `c-deny`）/ `execution` 恒「未执行」/ conditions / cwd；
  ⑤ 集成（门禁引擎实件 `classifyShellDetailed` + `defaultShellRules`）：`ls`/`cat`/`git status`/`node --version` 放行；`rm`→`readonly-deny`；`node --test`→`readonly-deny`（现状）；`sh -c`→`c-deny`；
  ⑥ run-role：**su 给 `shellReadonly` ⇒ gate 到达 adapter**（`run_shell` 注册；ls 放行 / rm、node --test 拒）；**su 不给 ⇒ 不 arm**（既有行为不变）；
  ⑦ run-role：`shellReadonly` 与三层链同给 ⇒ **readonly 优先**（review 类命令拒；(a) 通道 0 调用、(b) 会话 0 打开——若三层链赢则该命令会放行）；
  ⑧ run-role 端到端（假适配器事件流）：su 的 `run_shell`（`rm`）→ `tool_call` + `denied`（理由含「su 只读档」、消息「未执行」），无 `accepted`。
- `node --test "test/编排/**/*.test.ts"`（引号带）：**174/174 全绿**（166 + 8）。
- `npm run typecheck`：**全仓零错**。
- 全量 `node --test "test/**/*.test.ts"`（引号带）：**901 计 / 898 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（`test/桌面应用/pi-config.test.ts` 目录名断言、`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），**无新红**。环境：Node v24.14.0、Darwin 25.6.0。

## 跨角色（请 pm 转达）

- **桌面应用**：su 会话若要开只读 shell，在 `openRoleSession` 输入里传 `shellReadonly`（至少给 `classifyShell` + `rules`——(c) 的合法注入源待门禁引擎经 `src/service/gate/` 公开再导出，既有 I-1 待办未变）；**不要**给 su 配 `shellOperatorChannel`（三层链对 su 恒不 arm；两者同给时 readonly 优先生效）。
- **门禁引擎**：规则集内容本任务未动；`node --test` 一类是否进只读白名单由协调方后续裁定。
- **Pi 适配器**：无需改动（`run_shell` 描述文案核查见上；`shellGate` 注入即注册机制未变）。
