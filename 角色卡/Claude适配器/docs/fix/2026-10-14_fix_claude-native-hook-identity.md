---
id: claude-native-hook-identity-a1v
type: fix
title: Claude 原生请求按真实输入归属执行
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [claude-governed-session-v2-a1, claude-runtime-implementation-a1]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 实际原生回环发现并修复bare与输入ID关联错误，冻结环境快照
  - date: "2026-10-14"
    kind: verified
    summary: 正式包20项、真实原生回环探针和整仓类型检查通过
---

# Claude 原生请求按真实输入归属执行

Claude 适配器最初的17项测试使用假 query，能证明真实 MCP 与治理 handlers，却没有证明原生 CLI 会执行 SDK hooks。A1V用本地假 Anthropic 服务驱动已安装的真实 bundled CLI：原配置下工具始终拒绝，原因是 `bare` 让显式 SDK hooks 也没有运行。去掉裸模式后工具可以执行，但 native prompt_id 实际不同于提供的 SDK input UUID，不能把它们直接比较，也不能把晚到 hook 随意关联到最新输入。

本修复沿已授权[本角色设计](../design/2026-10-14_design_claude-governed-session.md)实施；当前流程见[Claude会话](../feature/claude-session.md)。只改变本角色 session/private helpers/tests/docs，没有修改Model、上层入口、依赖、真实.env或Git。

## 实际修复

`src/provider/claude/session.ts::createClaudeRuntimeAdapter` 移除 `extraArgs.bare`，保留工具清空、settings来源为空、strictMcpConfig、skills/plugins为空及disable-slash-commands；使用SDK已声明且实际验证的 `settings.disableAllHooks:true` 禁用设置文件/插件hooks，显式SDKhooks继续运行。该行为同时符合实际 `Settings` 类型的字段说明；它不是根据CLI帮助文字猜测的例外。

SDKinputUUID是适配器生成的随机值；wire第一行包着该值，用户原文随后发送。UserPromptSubmit只能从第一行查到待处理的原始Turn，consume后将实际nativeprompt_id关联该Turn。晚到旧输入、未知值、缺标记及重复消费都拒绝，没有按最新活动Turn或submitting slot回退。用户文本不能选择外层标记；同一段用户文本发送两次也有不同关联值。GUI/ANS回放仍收到原文，受控事件、错误和工具消息删除标记；原生模型及原生transcript会包含wire关联信息。

PreToolUse按此nativeID取原始Turn，再发行单次工具nonce。实际MCP callback必须消费该原始上下文，并合并原始turn/hook/query和RequestHandlerExtra.signal；保留参数剥离后才调用ANS handler。两种标记都只是关联数据，不授予权限，写入/shell仍由注入的公共能力判定。

环境在构造时复制，API key、base URL、model和redaction采用同一快照。设置页保存新profile不会改变旧会话正在使用的认证，同时让旧redaction漏掉新值；新profile由上层创建新会话。

## 原生探针和正式回归

正式环境：Node24.14.0、Darwin25.6.0 arm64、TypeScript7.0.2，Agent SDK0.3.299、nativeCLI2.1.299、Zod4.6.7、MCP1.32.1、AnthropicSDK0.93.0。入口为 `test/claude-adapter/native-loopback.probe.ts`，API endpoint固定127.0.0.1，HTTP请求实际x-api-key必须等于固定假值，子进程环境隔离并关闭非必要流量；45秒上限，finally关闭SDK/HTTP并删除临时目录。探针不读真实凭据，不调用真实账号或外部模型。

原生失败证据保留：bare下2输入产生4个本地Messages请求，0个hooks、0次ANS handler；去掉bare得到4个hooks和2次handler，但直接UUID相等断言失败。又一次加入disableAllHooks的运行仍有4hooks/2handlers，证明该设置保留显式SDKcallbacks。最终probe曾错误期待仅1条system/init，实际每个流式输入各发1条，共2条；修改为逐条验证两个准确目录，不放宽工具限制。

最终 `node test/claude-adapter/native-loopback.probe.ts` **exit0**，两条相同用户原文产生4个 `/v1/messages?beta=true` 本地请求。实际关联如下，UUID都是假探针会话生成的数据：

| 轮次 | SDK发送UUID及首行标记 | 实际UserPromptSubmit/PreToolUse的native prompt_id |
| --- | --- | --- |
| 1 | 113db8fa-6042-408e-a725-e9726066fa24 | 68a89622-bd64-4e29-80d2-f75b71a9b5d3 |
| 2 | 89ec0a99-82c0-47a4-835e-762a6ae44711 | 925d3d16-785d-40ab-b849-b0e3b908d458 |

两条nativeinit的tools都准确为 `['mcp__ans__native_probe']`，servers都为 `['ans']`，没有原生或外部工具。两个PreToolUse都有 `source:'sdk'`；真实updatedInput将fixture参数由fake-response-original改为changed-by-native-hook，两个真实ANS handler均看到改写后的值，且保留nonce已剥离。toolCallIds准确为 `native-ans-turn-1:toolu_loopback_0` 与 `native-ans-turn-2:toolu_loopback_2`。SDK发出canUseTool被精确allowedTools预批准覆盖的warning属于许可层事实；真正每次调用检查在PreToolUse及ANS handler，未把canUseTool当唯一门禁。

`node --test 'test/claude-adapter/**/*.test.ts'` 正式 **20/20**，包括已有17项加同文重复发送/晚到旧UserPromptSubmit、未知/缺失/重复marker、环境快照与确切marker回显净化；旧callback、旧PreToolUse、nonce重放、停止待确认及晚到结果零副作用继续通过。`npx tsc --noEmit` **exit0**。这是当前本角色与公共依赖候选验证，不代替最终CLI/桌面及独立集成验收。

候选指纹：按路径排序，每项 `path + NUL + bytes + NUL`，3个源码+2个test/probe SHA256为 `0877d5fb32aafea9119953102d4ee0332f9037d9238ad94f732490970fe1f497`。原A1临时候选17项/peer1.29证据保留在[初次记录](../change/2026-10-14_change_claude-runtime.md)，其bare兼容与ID推断已被本证据取代。

约24.8天native MCP硬上限保持；真正账号/线上模型、持久原生重启恢复、OS全面沙箱未在本探针执行。真实nativecallbacks执行及updatedInput已证明，人工构造的晚到hook/请求用回归控制测试验证，不能称为SDK实际自行制造了这些异常时序。
