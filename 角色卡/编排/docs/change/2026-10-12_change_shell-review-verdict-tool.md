---
id: shell-review-verdict-tool
type: change
title: shell 审读结论改由工具交回（R-1）：客户端裁定「不应该按 json 解析」+ 真机根因
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, shell-unparseable-deny, shell-gate-arming]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 真机实测：角色跑 node --test 被闸拒；su 报「(b) 审读恒不可解析」；客户裁定「不应该按照 json 解析」→ 结论改工具交回
  - date: "2026-10-12"
    kind: implemented
    summary: shellVerdict 能力 + report_shell_verdict 形状（编排侧单一来源）；pm-reviewer 注入并捕获、序列化交回；审读会话改不持久化；正文解析降为降级
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 164/164（+4，含真 openRoleSession+真实装配+夹具模型调工具的端到端）；全量 863 计/860 过（2 红=既有环境红）；本角色 1 处瞬时类型红（Pi侧 opts 待补，见跨角色）
---

# R-1：shell 审读「恒不可解析」的根因与修复（结论工具化）

> 客户裁定：「这个闸有问题啊，**不应该按照 json 解析**。」背景：角色跑 `node --test …`（只读/测试类）被闸拒；su 在真机上诊断「(b) 层审读恒为输出不可解析」。**本文的根因结论基于真机证据**（`ans-playground` 的 su 会话 JSONL 与 `docs/audit/shell-gate.jsonl`，只读核对）。

## 根因（修前为何「恒不可解析」——一句话 + 证据）

**一句话**：旧路径要求审读模型**在正文里写 JSON**；而真机上 37 个审读轮次有 **35 轮模型轮直接以网关 500 失败**（`Failed to deserialize the JSON body … unknown variant 'tool_removal'`——su 会话**历史**里含有网关不认的 `tool_removal` 块，整段重发即被拒），助手消息 `content: []`、`stopReason:"error"` ⇒ `extractMessageText` 只抽 text 块、得空串 ⇒ real-adapter 的 `text.length > 0` 守卫**不产 message 事件** ⇒ `defaultExtractReply` 取不到任何东西 ⇒ **恒「不可解析」**（M-2 后恒 `b-unparseable-deny`）。

**证据（文件位置）**：
- su 会话 JSONL（`<playground>/.ans/sessions/su/…jsonl`）：逐轮统计 **reviews=37 / errEmpty=35 / textReply=2**；错误轮如 entry 104/113/121/…：`{"content":[],"stopReason":"error","errorMessage":"500 {…unknown variant `tool_removal`…}"}`。
- 审计 `docs/audit/shell-gate.jsonl`（84 条）：`b-unparseable-deny ×24`、`b-badjson→a-allow ×9`（**M-2 前**旧构建——客户被迫按了 9 次放行，正是「不用发给我」的来源）、`b-unavailable→a-allow ×7`、`c-allow ×31`、`c-deny ×2`、`no-classifier ×9`（更早缺 (c) 的装配）。
- 对照（题外）：su 会话里一个**非审读**轮次（另一分支）正常出正文——说明 500 与该分支历史中的 `tool_removal` 相关联；此为 **Pi适配器/网关侧**问题的线索，已如实登记（见「跨角色」）。

**对 su 怀疑的核实（如实）**：「取回复拿的是 `ev.summary` 而非模型原文」——**取字段本身没有取错**：real-adapter 对**有正文**的轮次就是 `{kind:"message", summary: 模型原文}`（`real-adapter.ts` 的 `message_end` 处理，`extractMessageText` 抽 `role==="assistant"` 的 text 块）；真正的断点是**错误轮 content 为空 ⇒ 该事件根本不产生**（外加底层轮次恒 500）。su 的「恒」被证实，机制归因随之修正。

## 改在哪里（位置 → 改动；全部在编排 Section 1 内）

1. **`src/common/编排/shell-gate.ts`（形状单一来源）**：新增
   - 工具名 `SHELL_VERDICT_TOOL_NAME = "report_shell_verdict"`；
   - 载荷 `ShellVerdictPayload { verdict: "allow"|"deny"|"unsure"; reason?: string }`；
   - 注入形状 `ShellVerdictFn`；防御校验 `normalizeShellVerdict`（取值域外 → undefined）。
2. **`src/pipeline/orchestration/pm-reviewer.ts`（主路径）**：审读会话注入 `shellVerdict` 能力（「注入才注册」；Pi适配器据此注册工具）——模型**调用工具**交回结论，本函数把结论**序列化为 JSON 交回** `createShellGate`（**构造保证可解析**）。**正文文本解析降级保留**（`defaultExtractReply`+围栏剥离+取首个 `{}`）——理由：模型没调工具、只在正文写 JSON 时零成本兜底；**两手都拿不到 ⇒ M-2 直拒不变**（fail-closed，不升 (a)、不打扰客户）。提示词改写：**首选且唯一结构化通道 = 调工具**；正文 JSON 仅作「无法调工具时」的降级。
3. **审读会话不持久化（附加修复，D-1 覆盖位）**：`run-role.ts` 增输入 `persistSession?: boolean`（缺省 true 行为不变）；pm-reviewer 固定传 `false` ⇒ 审读会话 in-memory——**不恢复用户 su 会话里已被污染的坏历史**（上述 500 的诱因之一）、也**不把审核往返灌进用户的 su 聊天记录**。
4. **能力透传**：`AdapterCapabilities.shellVerdict` + `createPiAdapterFactory` 原样转发。

## 如何确认（实际结果）

- `test/编排/` **164/164**（+4）：`shell-review-chain.test.ts` 新增——① 审读者调工具 → 闸按结构化结论走（**review+allow 放行不打扰 / deny 拒 / unsure 升 (a) / risky 升 (a)** 四路；并断言审读会话 `persistSession===false`、注入了 `shellVerdict`）；② 工具参数非法 → 视同未调用 → **`b-unparseable-deny`**（不升 (a)）；③ **降级路径**：不调工具只写正文 JSON（含围栏）→ 宽松解析仍生效；`shell-arming.test.ts` 新增 **端到端**：**真 `openRoleSession` + 真实 `assembleProjectShellGate` + 夹具模型经 `shellVerdict` 交回** ⇒ review 类命令（`mysterytool --flag`）**放行且不打扰客户**，审读会话无 `sessionDir`（不持久化）。
- 全量 `node --test "test/**/*.test.ts"`（引号带）**863 计 / 860 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），**全仓其余全绿**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。
- `npm run typecheck`：**本角色 1 处瞬时红**——`run-role.ts` 向 `createPiRuntimeAdapter` 转发 `shellVerdict`，而 Pi侧 `PiRuntimeAdapterOptions` 尚未加该可选字段（见跨角色；字段落地即消解，**未用类型断言绕过**）。

## 报告必答（按派工）

- **主方案判定来源**：工具 `report_shell_verdict`，参数 `{ verdict: "allow"|"deny"|"unsure"; reason?: string }`——**闸读的是工具参数经 `shellVerdict` 能力交回的结构化结论**（不再解析模型自由文本）。
- **修后角色能否自跑 `node --test`**：编排链证据已证「review 类只读/测试命令 → 工具结论 allow → 放行、不打扰客户」；**前置条件 = Pi适配器注册该工具**（本层已把能力注入/捕获/交回全部接好）。另：真机上曾导致恒 500 的**污染历史**因审读会话不持久化而不再被恢复（新会话无 `tool_removal`）——**据此判断修复后应用户可自跑；真机复验属客户跑**（若 500 另因网关本身拒 `tool_removal`，那属 Pi适配器/网关侧，另行跟进）。
- **是否保留文本解析兜底**：**保留（降级）**——成本≈0（既有代码），覆盖「模型不调工具只写 JSON」；**不改变**「两手都无 ⇒ 直拒」的 M-2 策略。

## 跨角色（请 pm 转达）

- **Pi适配器（本修复的前置半）**：① `PiRuntimeAdapterOptions` 增可选 `shellVerdict?: ShellVerdictFn`（形状见 `common/编排/shell-gate.ts` 常量注；现有 1 处瞬时类型红即此）；② 注入时注册工具 `report_shell_verdict`（JSON schema：verdict 枚举三值必填、reason 可选字符串；`executionMode` 同交互工具先例；工具 handler 只调用注入能力并如实回执；**不**入 `GOVERNED_WRITE_TOOLS`）；③ 顺带核实网关 `tool_removal` 500 问题（其侧/网关）。
- **测试角色**：`t9-block3-pin-shell` 的旧 `b-badjson→a-*` 断言已随其自查更新（本轮全量已无该红）。
- **桌面**：无需改动（审读链路不在其内）；其确认框只会在「risky 过 (a)」或「b-unsure/超时/不可用升 (a)」时出现——不可解析类**不会**再弹（M-2 不变）。
