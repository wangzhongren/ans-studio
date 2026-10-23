---
id: reasoning-wire-sample
type: change
title: 真实 Pi reasoning wire 取样——deepseek-v4-flash[1m] thinking blocks 是否带可读正文
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: sampled
related: [reasoning-display-fix]
events:
  - date: "2026-10-22"
    kind: sampled
    summary: 真实 Pi + 客户网关（deepseek-v4-flash[1m]）两轮取样；Provider 原始与 Service 投影形均 status=complete、带可读正文（原始 580 字 / 投影 335 字，未 redacted/truncated）；回答设计 §5.4 开放问题：平台提供可读 thinking 正文
---

# 2026-10-22 真实 Pi reasoning wire 取样

**问题（设计 `2026-10-22_design_reasoning-display-fix.md` §1.5/§5.4）**：`deepseek-v4-flash[1m]` 经客户网关返回的 assistant thinking blocks 是否带可读正文？

**结论：是。** 在客户网关 + 真实 Pi 适配器的两轮独立取样中，thinking blocks 均返回可读英文正文：适配器原始事实 `status:"complete"`、`reasoning.text` 为非空字符串；Service 投影形 `detail.reasoning.text.text` 同为非空可读正文，`truncated:false`、`redacted:false`。设计 R1（读取投影正文）适用于该模型；本轮样本未触发 R4 的 `omitted` 路径。

## 1. 配置与环境（脱敏）

| 项 | 值 |
| --- | --- |
| 环境文件 | `/c/Users/51054/AppData/Local/Temp/ans-reasoning-sample.env`（仅 shell `.` source；**未 cat/echo**，未写入仓库） |
| 变量存在性 | `ANS_PI_BASE_URL` / `ANS_PI_MODEL` / `ANTHROPIC_AUTH_TOKEN` / `ANS_PI_CONTEXT_WINDOW` 均为 true（只记录存在性，不记录值） |
| 模型 | `deepseek-v4-flash[1m]`（`ANS_PI_MODEL`，非敏感） |
| 平台 | Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1 |
| 项目 | 系统临时目录中的 `smoke` 角色（非 todo-demo）；`persistSession:false`；用后清理 |
| 泄漏自检 | 对证据目录全部 JSON/日志按 token 值精确匹配与 `Bearer` 模式扫描：**0 命中** |

## 2. 实际命令与结果

| 命令（cwd = 项目根） | 退出码 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| `. /c/Users/51054/AppData/Local/Temp/ans-reasoning-sample.env; node "test/测试/reasoning-wire-sample/sample-reasoning.ts"` | **0** | 一轮对话完成（`outcome:"sent"`、`settledSeen:true`、未超时），耗时 6676ms；捕获原始/投影 reasoning 各 1 条 | `…/2026-10-22-reasoning-wire-sample-evidence/reasoning-sample-final.json`；stderr 仅 Pi 加载日志 |
| `npx tsc --ignoreConfig … "test/测试/reasoning-wire-sample/sample-reasoning.ts"`（与仓库同口径选项） | **0** | 本角色脚本 0 错 | `…/typecheck-targeted.log` |
| `npm run typecheck`（全仓） | **1** | **7 条错误全部位于他人文件 `test/桌面UI/reasoning-view.test.ts`**（桌面UI 的在途改动，本角色未触碰）；本角色脚本 0 错 | `…/typecheck.log` |

时间：最终取样 `startedAt 2026-10-22T07:49:15.397Z`（本机 15:49），`elapsedMs 6676`。

## 3. 样本事实（最终运行）

### 3.1 Provider 层原始事件（Pi 适配器 `detail.reasoning.text` 为 string）

| 字段 | 值 |
| --- | --- |
| 事件数 | 1 |
| `status` | **complete** |
| `durationMs` | 893（适配器 `thinking_start`/`thinking_end` 真实信号） |
| `textKind` | string（未投影原始形） |
| `textLength` | **580 字符**（可读英文正文） |

### 3.2 Service/编排投影形（渲染层实际收到的 `detail.reasoning.text`＝DisplayTextV1）

| 字段 | 值 |
| --- | --- |
| 事件数 | 1（与 Service 层捕获同 `turnId` `cccad15f-…`，投影幂等） |
| `status` | **complete** |
| `durationMs` | 1（该轮真实信号；按设计 R2 会显示「已思考 1 秒」） |
| `textKind` | projected（`text.text` 为字符串） |
| `textLength` | **335 字符** |
| `truncated` / `redacted` | **false / false** |

正文摘要（截断、无凭据）：`The user wants a short reasoning (2-3 sentences) about why the sky is blue… Rayleigh scattering, intensity ∝ 1/λ⁴, blue light scattered much more…`。同轮 assistant 最终回答（中文）正常出现，消息流含「已思考」summary。

### 3.3 复现一致性（同一脚本的其它成功运行）

| 运行 | 原始正文长度 | 投影正文长度 | status | 说明 |
| --- | --- | --- | --- | --- |
| run1（早期版本，仅编排层） | —（该版本未做 Provider 捕获） | **1403** | complete | 首次确认可读正文 |
| run3 | 106 | 1153 | complete | Provider 捕获加入后 |
| final | 580 | 335 | complete | 最终类型检查通过版本 |

> 不同运行是**不同的真实轮次**（Provider 层与编排层各发起一次独立对话），因此正文长度与 `durationMs`（893ms vs 1ms）不能逐字对比；两层的形状差异（string vs DisplayTextV1）才是取样目标。

## 4. 对设计开放问题的回答

1. **是否带可读正文：是。** 三个成功样本的 thinking blocks 都有非空正文；`redacted:false`、`truncated:false`。
2. **是否会 `omitted`：本轮未观察到。** `status` 恒为 `complete`；若未来平台只给签名/redacted block，适配器会按既有逻辑产出 `status:"omitted"`，R4 的如实说明仍是正确兜底。
3. **适配器是否丢了 SDK 已给的正文：未发现证据。** 原始事实与投影后正文均非空且内容合理；本方案 R1 直接修复显示即可。
4. **时长信号：** 适配器确实产出真实 `durationMs`（893ms / 1ms 等，含 0–1ms 的瞬时回环）；设计 R2 的下限 1 秒文案会显示「已思考 1 秒」，符合预期。

## 5. 缺失与边界

- 只做**一轮**简单对话取样（每轮一个 assistant message）；多轮/工具调用循环中一回合多条 reasoning 事件的行为未在本轮取样（设计 R3 归组仍按计划验证）。
- 未跑真实桌面应用/UI；未重启现场应用；未触碰 todo-demo。
- 未修改产品代码；脚本仅位于本角色 `test/测试/reasoning-wire-sample/`，不参与 `node --test` 发现（非 `*.test.ts`）。
- 全仓 typecheck 当前因他人文件 `test/桌面UI/reasoning-view.test.ts` 的 7 条错误为红；本角色脚本定向 typecheck 0 错。该红与本取样无关，未修改他人文件。
- 样本正文为模型对「天空为什么是蓝色」的思考，不含凭据；证据文件已做 token/Bearer 泄漏扫描（0 命中）。

## 6. 证据路径

- 报告：`角色卡/测试/docs/change/2026-10-22-reasoning-wire-sample.md`
- 最终样本：`角色卡/测试/docs/change/2026-10-22-reasoning-wire-sample-evidence/reasoning-sample-final.json`（含原始/投影两形、长度、status、durationMs、env 存在性）
- Pi 加载日志（stderr，无正文/凭据）：`…/reasoning-sample-final.stderr.log`
- 早期运行：`reasoning-sample-run1.json`、`reasoning-sample-run3.json`（run2 为一次空输出调试记录，见脚本提交前的有界等待修复）
- 定向 typecheck：`…/typecheck-targeted.log`；全仓 typecheck：`…/typecheck.log`
- 取样脚本：`test/测试/reasoning-wire-sample/sample-reasoning.ts`
