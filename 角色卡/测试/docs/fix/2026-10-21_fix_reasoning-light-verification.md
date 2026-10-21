---
type: fix
title: 思考等级轻量兼容独立验证
created: "2026-10-21"
updated: "2026-10-21"
status: verified-tested-scope
---

# 不只提示兼容，要让同一任务完成

测试角色按已批准 [D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md)、后续明确批准的 [E1](../../../项目管理/docs/design/2026-10-21_design_reasoning-light-codex-addendum.md) 和独立验收 [R2](../../../独立验收/docs/design/2026-10-21_design_reasoning-light-criteria.md) 验证。D1 SHA-256 实际校验为 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09`。UI 仅意见交接，不改 UI 代码/测试，不运行 Electron。

## 本角色改动

- `test/测试/g5-reasoning-verify/c-claude.test.ts`：保留等级映射和思考事实，按 D1 检查子进程双 env 去参、同输入重试、系统提示、普通错误不误触发，以及兼容失败后恢复保存配置。
- `test/测试/g5-reasoning-verify/d-codex.test.ts`：独立 RPC fake 现在按真实 app-server 时序发 error 后 terminal；保持原参数/事实断言，新增默认档同线程、去覆盖新 native ID、失败/取消后策略恢复、已输出/工具 started 禁止重放。精确 effort 字段正例与 `param:model`、整个 reasoning 对象负例分开，不把本可兼容的字段红例重分类。
- `test/测试/g5-reasoning-verify/e-pi.test.ts`：移除已删除的整轮降级 API 消费，改测真实 HTTP 请求级兼容；原生 prompt 次数、同请求 messages、失败后下一轮恢复、普通错误和 429 不误兼容、默认与显式预算保护均保留。只使用测试进程假 token，并恢复原进程变量；不读取 `.env`。
- `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`：独立真实安装 SDK/CLI localhost 场景。Claude 确认实际 HTTP 双字段缺席及两轮完成；Codex 保留目录内 `gpt-5.5` 必须无 effort 且两轮完成的成功断言；Pi 确认工具完成后的请求兼容保留 tool_result，原生 prompt 和工具各一次。

所有服务器仅监听 127.0.0.1、假 key、隔离临时目录，无用户网关和线上模型调用。fake 只代传输/控制通知，不替代必要的真实 SDK/CLI 出站证据。测试角色不修改生产代码、其他所有者测试、依赖、保存设置或 UI。

## 准备与首红

证据目录为 [reasoning-light-evidence](2026-10-21-reasoning-light-evidence/)。消费者初次 typecheck 因本角色引入 TypeScript 参数属性不符合 `erasableSyntaxOnly` 失败，已在本角色文件改为普通属性赋值；原日志保留，之后类型检查退出 0。Claude/Codex 消费者 15/15，Pi 消费者 11/11。

独立原生首轮 1 过/2 红：[原始日志](2026-10-21-reasoning-light-evidence/independent-native-initial.log)。

1. **Codex 真实产品差异**：同一 `gpt-5.5`、同一只拒 effort 字段的普通 localhost 接口，首请求 high，去覆盖后 CLI 又补 medium，任务失败。此证据与成功断言保留，等待 E1 真正修复，不能记成 expected failure 或换目录外模型冒充。
2. **Pi 测试夹具问题**：自定义 key 变量不被已安装 provider 模板读取，未发生 HTTP。夹具改用模板实际读取的 `ANTHROPIC_AUTH_TOKEN`，始终给假值并 finally 恢复，生产未改。

修正夹具后的 [独立 Claude/Pi 真实日志](2026-10-21-reasoning-light-evidence/independent-claude-pi.log) 为 2/2：Claude low/thinking → 实际 thinking/output_config 均缺席，两轮 completed；Pi 真实请求为 enabled、enabled、无 thinking，后两次 messages 相同且保留工具结果，prompt/tool 均恰 1 次。原日志包含实际请求字段摘要，不含 key。

## 最终结果

D1/E1 在本机已执行范围通过。独立验收结论由验收角色依据 R2 给出，本报告不代签验收。

| 检查 | 实际结果 | 原始日志 |
| --- | --- | --- |
| 独立真实三运行时 localhost | **3/3**；Claude 双字段缺席且两轮完成；Codex gpt-5.5 high→无 effort→下一轮无 effort 且两轮完成；Pi prompt/tool 各一次、tool_result 保留 | [原生窄测](2026-10-21-reasoning-light-evidence/independent-native-final.log)，完整的两轮 Codex outcomes 同时在最终全量日志 |
| 首轮完整 Node 回归 | 3435 项，3408 通过、25 失败、2 跳过；Pi 回环文件挂起后经授权只终止其子进程，本轮不计通过 | [保留首红](2026-10-21-reasoning-light-evidence/full-loopback-enabled.log)、[终止记录](2026-10-21-reasoning-light-evidence/full-interruption.json) |
| 必要旧消费者修复窄测 | **20/20**；搜索/MCP/T1 CLI 原断言保留 | [窄测](2026-10-21-reasoning-light-evidence/consumer-regression-fixes.log) |
| 自足夹具修复后完整 Node 回归 | **3455 项：3453 通过、0 失败、2 跳过，退出 0**；约 36.1 秒，命令没有外部注入假 token | [最终全量](2026-10-21-reasoning-light-evidence/full-final-self-contained.log) |
| 最终 `npm run typecheck` | **退出 0** | [类型检查](2026-10-21-reasoning-light-evidence/typecheck-final-self-contained.log) |

最终命令为 `node --test "test/**/*.test.ts"`；仅为本地 loopback 监听申请运行权限，未运行 Electron 或 UI e2e 脚本。2 个跳过为既有 Windows 条件测试：runtime-core 反斜杠角色边界文件路径，以及门禁 resolve-write 大小写不敏感；它们不记通过，也不据此新增 D1 跨平台门槛。当前环境为 macOS/Darwin arm64、Node v24.14.0、TypeScript 7.0.2、yaml 2.9.0、Pi SDK/pi-ai 1.1.0、Claude SDK 0.3.299（配套 CLI 2.1.299）、Codex CLI 0.162.1。

## 首轮全量失败怎样处理

首红不能用工作者窄测声明覆盖。18 项 Pi 自有回环失败均为 `No API key found for local-compat`；所有者此前自测依赖命令外补假 token，文件自身尚未设置模板实际读取的凭据变量。随后 `arrived.promise` 等待可能不结束，整份文件不退出。Pi 所有者修正文件内假 token/恢复、到达等待与 prompt 结束竞速及有限期限；timeout 用例用现有 InteractionGate 把原 100ms 限制对准兼容请求到达后的阶段，仍验证超时及下一轮原策略，不改生产代码。最终使用所有者修复 SHA `89b7a2dec5bd4834e96c4008f55c03d4a89f6234b4f7b3676b79d058b69a0879`，由本角色无命令外假 token 全量实际复验。

另 7 项是 D1 既定行为的旧消费者契约。启动端明确扩大精确测试写集，测试角色复核 Section 1 后只修改：

- `test/测试/g3-search-verify/codex-websearch-verify.test.ts`：按 `detail.source:web-search` 筛选搜索行，避免新 system 配置提示混入；搜索内容、数量、URL 和凭据脱敏断言不变。
- `test/测试/g4v2-mcp-verify/j-pi.test.ts`：精确扩展集合包含 D1 默认思考保护，保留 MCP 工具执行、零声明无工具、拒绝旁路与 settled 断言。
- `test/测试/t1-external-engines.mjs`：Pi SDK 替身补真实已有的 `setThinkingLevel` 和状态；T1 真实 CLI 的越界拒绝、零落盘及凭据不泄露断言不变。

未删安全断言、未扩大权限、未改其他角色测试；Pi 自有文件修复由原所有者完成。所有首红、typecheck 夹具语法错误及修复结果均留档。

## 候选身份与并发工作

当前候选 HEAD 仍为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`，有未提交变更，因此用 [最终前置快照](2026-10-21-reasoning-light-evidence/candidate-final-before.json)、[生产及消费者 diff](2026-10-21-reasoning-light-evidence/reasoning-production-and-consumer.diff) 和 [最终证据清单](2026-10-21-reasoning-light-evidence/verification-manifest.json) 辨识实际内容。源码范围为 Pi real-adapter、Claude session、Codex session/protocol/reasoning-catalog；Core 两处只同步默认语义/系统消息契约注释。

最终前后核对 **617 文件**：本任务生产/消费者、其他 Node 测试、根配置及实际安装 SDK/CLI 包 JSON/关键入口均稳定，无新增文件。唯一变化是并发 UI 工作的 `app/renderer/src/chat/ChatStream.tsx`，前后摘要已留存。它不在本任务写集，根 typecheck 已由 UI 任务排除 app/renderer；`src` 和 `test` 无 ChatStream 引用。本报告不据此声称整个 UI 候选冻结或通过，也不为该无关组件无限重跑 D1。

旧 D3、并发 UI 平台化源码、依赖、构建配置及文档列入环境快照的独立字段，均不归本任务产物。测试角色自己的写入限于上列 7 个测试/夹具文件、本报告和证据目录；未改生产、UI、真实 `.env`、模型/endpoint、依赖或 SDK，未提交 Git。

## R2 覆盖及真实证据来源

| 要求 | 观察与证据 |
| --- | --- |
| V1、V4 | 独立原生 Claude 实际 `low+thinking` 被拒后，以生产注入 `CLAUDE_CODE_EFFORT_LEVEL=unset` / `CLAUDE_CODE_DISABLE_THINKING=1` 真正删除 HTTP 字段，当前与下一轮 completed；保存 options、model、endpoint 和输入 env 未变。c-claude 消费者及全量保留鉴权/模型/普通错误/已输出负例。 |
| V2–V3 | 独立 Pi 原生 prompt 1 次、工具 1 次，兼容 HTTP 请求的 messages 与 tool_result 原样；e-pi 验证成功记忆、失败恢复、普通错误与 429 不去参，默认和显式预算合法。全量实跑所有者真实 SDK 无历史默认对照、high→清空→恢复及设置优先级、SDK 传输重试沿用去参场景。high/xhigh 实际同预算不伪造差异。 |
| V5–V7 | 独立 Codex 精确目录默认同线程、去覆盖新 native ID、失败/取消后 high、普通模型错误和 started/输出禁止重放；独立原生目录内 gpt-5.5 当前/下一轮 completed。配置/尝试/成功均 system active-prompt 消息，成功提示晚于正常结果，最终结算不重复。 |
| E1 | 最终全量实际执行所有者 helper 精确版本/格式/来源、四字段差异、未知模型、清理和失败恢复测试；独立原生保持原 gpt-5.5 成功断言并由红转绿，真实 wire 为 high→`reasoning:{}`→`reasoning:{}`，两轮 completed；不换模型/端点。 |
| V8、UI 限界 | 最终完整 Node 回归/typecheck 为当前证据。UI 仅复用 D1 意见章节和 PM 交接记录，本角色不改 UI、不跑 Electron；既有纯逻辑 UI 测试随全量运行只说明对应逻辑回归结果。 |

此外只读核对并引用所有者真实矩阵，不冒充本角色执行：

- [Claude 真实 19 直接相位＋1 接线＋6 兼容相位](../../../Claude适配器/docs/fix/2026-10-21-reasoning-light-evidence/probe.json)：双 env、旧模型限档、失败/取消/超时恢复、工具后不重放，来源与版本见其 manifest。
- [Codex 当前完整 20/20](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/native-loopback.json)：含四档/off、同线程默认保留历史、持久/非持久首轮、默认和 E1 后 500/取消/超时恢复 high、模型错误、工具后不重放、目录内字段和默认值连续拒绝。其 [manifest](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/manifest.json) 所列源码 hash 已与本次实际候选逐项匹配；早期 `/tmp/ans-codex-e1-first.json` 的旧注释版本不替代这份最终证据。

剩余边界按 D1/E1 原约定公开：整个 reasoning 对象不兼容、已有输出或工具后的整轮重放、非持久后续重建历史限制仍未承诺解决；E1 使用固定 CLI 内嵌元数据，升级须验证格式与字段，不能描述为稳定通用模型能力 API。所有实际调用均本地假网关，不代表线上网关或任意模型能力。

