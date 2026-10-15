---
id: complete-flow-core-assessment
type: design
title: 工具输入与结果阅读的运行时合同评估
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: draft
revision: 1
related: [product-desktop-complete-walkthrough-20261015, complete-flow-window-assessment, complete-flow-ui-assessment]
---

# 先保留真实诊断信息，再供桌面展开阅读

固定运行时核心，仅源码与文档只读评估；没有操作桌面、改产品或测试，没有运行新的行为测试。本建议对应[产品 P1/P2](../../../产品/docs/design/2026-10-15_design_desktop-complete-walkthrough.md)，结合[窗口评估](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-window-assessment.md)、[UI评估](../../../桌面UI/docs/design/2026-10-15_design_complete-flow-ui-assessment.md)与[UX草稿](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)。本角色[现有功能](../feature/runtime-core.md)的调用身份与 start/blocked/result 阶段保持，显示诊断不增加执行或文件读取能力。

## 真实来源与丢失点

| 信息 | 原始可信来源 | 现状与损失 |
| --- | --- | --- |
| 输入、文件、命令 | 实际 handler call.args；Pi SDK execution_start.args；Codex MCP params.arguments；Claude 去除内部context字段后的 publicArgs | Pi start 仅 path；run_shell command 未传。Codex start 有 args，Claude start 无 args。demo detail.call 有原 args。不能从附近助手文字补入 |
| 结果、失败原因 | Core `ToolResult {ok,message}`；read_file 的失败 message 含目标及真实异常；shell message 含命令、exit、stdout/stderr | Pi toPiTool 已把真实 message 放 MCP result.content，但 execution_end 只给通用“完成/失败”，丢了正文。Codex/Claude 将实际 result.message 放 event.summary，demo detail.result 有 message。因此源端保留能力并不一致 |
| exit/signal/输出 | Core `ShellExecOutcome` 真实 code/signal/stdout/stderr/error | 目前只有内部结构；公共 ToolResult 未导出这些字段。不得从本地化 message 正则反解析 exit 或 stdout/stderr；spawn失败/中止路径还可能丢弃已收集输出，需正式方案定义保留含义 |
| 时长/失败类别 | Pi toPiTool details、execution_end 的 durationMs/errorCode/ok/status | Core SessionEvent.detail 仍 unknown，Service仅补实际turn并持久化，不替换原detail；Window activity mapper仅留名称/目标/阶段/状态/身份/ok，丢时长和错误码，甚至现有 detail.path 也没有完整消费 |
| 历史 | Core replay appendReplay JSON序列化既有event | 不主动删detail，但存储没有新增统一字段、脱敏或大小约束。Window归一后再到UI，不能把native中存在内容说成ANS历史已经保存 |

具体位置：`src/model/runtime.ts::ToolResult/SessionEvent`；`src/provider/runtime/tools.ts::makeReadTool/makeRunShellTool/runShell`；Pi `real-adapter.ts::toPiTool/buildGovernanceExtension`；Codex `session.ts` MCP handler；Claude `session.ts` registerTool handler；Core `session.ts::emit/pump` 和 `session-store.ts::appendReplay`；Window `runtime-history.ts`。

## 建议最小公开展示合同（候选，尚未冻结）

优先增加可选中立展示数据，保留现有 ToolResult.ok/message 与 SessionEvent.kind/summary，不把整个SDK对象或任意 args 原样复制给UI。候选 `ToolResult.display?` 由工具结果源生成；adapter按真实call身份放入 event.detail 的约定字段，Window映射到ReplayRow可选diagnostic。名称、限额与脱敏实现待共同评审，不是当前API。

建议最小内容：可显示目标（path或command，保留其种类）、真实 resultText、可选过程结果 `{exitCode?,signal?,stdout?,stderr?,executionError?}`、时长和明确截断信息。每段长文本携带 `{text,truncated:boolean}`；字段缺席表示未提供/未保存，不等于空字符串或exit0。shell审核拒绝未启动时不生成exit；signal终止没有exitCode也要如实保留。errorCode只传已有机器事实，不将全部工具失败改称ENOENT，也不把shell stderr出现某词推成异常码。

start 阶段需可用command/path：优先让各adapter从其真实已捕获输入按中立allowlist映射，有正式统一的展示投影规则后再实施。输入预览只选当前工具需要的字段；write/edit不默认保存完整文件内容、old/new文本，确认请求不默认再复制全文preview，图片和内部opaque上下文不进入诊断。generic read_file 成功返回全文同样需要展示预算，不能直接无限追加。

P1可以先复用既有可信 path、errorCode、durationMs 和已有原 result.message，修mapper丢失；但“所有引擎完整命令/结构输出/exit”的P2仍需要源端新增字段，不能宣称只改UI便完成。Pi result.content原文属于真实来源，但同样应经展示投影与处理，不应直接裸搬所有content。旧native自动补读不是本方案，若要做需另定读取边界、可靠call关联与属主。

## 大小与敏感内容前置

当前shell每流约1MiB收集阈值只在 data 到达前检查已收长度，再push整个chunk；最后chunk可越阈值，且没有明确truncated标志。这不是精确1MiB保证。read_file也未设展示大小上限。本次设计必须将“原工具返回给模型的既有语义”和“送事件/历史/界面的有界诊断”分开；若修收集器精确字节上限属于Core工具行为变更，需单独纳入确认范围，不借UI设计暗改执行输出。

建议为诊断文本设精确UTF-8预算及总事件预算（具体数值未确认），只截取已捕获数据，保留明确截断标记；未知原始总长度不编造originalBytes，不因展示而重跑命令/读文件。UTF-8跨chunk、首尾截断与多字段总量必须定规则再写代码。

env剥离只阻止子进程继承已列凭据，不等于command、文件或输出已经脱敏。Codex现有emit递归scrub detail并redact summary；Claude只对summary及结果message作当前profile脱敏，未来新增detail若裸放字符串会绕过它；Pi当前无通用展示脱敏保证。不能宣称过滤已知secret或正则即可覆盖所有任意文件秘密。

建议由Core主属定义并生成有界allowlist展示投影，读取当前已授权的凭据值快照时仅用于内存替换、绝不写快照/env到事件；跨adapter统一处理能力由PM确定复用位置及注入合同，其他角色不能导入Core私有common。适配器仍保留各自既有的原生标记净化与profile保护。脱敏应在进入ANS持久化/IPC前完成，Window/UI只消费标记明确的数据并安全文本渲染，不在UI以显示后替换充当全部保护。未知内容是否允许进入展开诊断及具体隐藏字段须客户/PM确认；本评估不擅自宣布新读取/隐私政策。

## 属主与验证

- Core：中立 optional 类型、工具真实shell结构结果、展示投影约定与自己的工具/Service/store验证；不改gate、argv执行或新读文件能力。
- Pi/Codex/Claude各自：实际start输入及result映射、phase/call身份保真、已有redaction/opaque标记保护；当前不能免去Codex/Claude影响评估而承诺四源一致。
- Window：历史活动保真归一及可选诊断，不从SDK私有历史旁路补数据；UI：同scope/actualturn/call聚合start/blocked/result、展开阅读与“未保存/已截断”，失败事实不被成功摘要覆盖。
- PM：冻结字段/UTF-8预算/敏感内容和复用归属、协调各原属主范围；测试角色独立真实桌面核输入、结果与实际副作用次数。

必要回归：真实read_file ENOENT；shell exit0/非0/spawn错误/signal/中止/审核拒绝；stdout/stderr各空/多字节/超预算/单超大chunk；带假凭据输入及输出在进入replay和IPC前脱敏；write/edit/确认preview不意外复制全文；四源start/result/blocked与异常；同文不同call/turn、缺字段旧历史、晚结果、原request卡与阅读锚点。对旧缺字段显示未保存，不能复写旧日志伪造命令或exit。

结论：支持P1/P2方向，但具体中立展示API、大小与敏感规则、适配器映射尚未冻结，是实施前置。本轮只有本设计评估新增，未实施、未测试、未部署；上一轮重复修复证据不证明本次诊断阅读能力。
