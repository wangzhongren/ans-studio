---
id: claude-runtime-implementation-a1
type: change
title: Claude 接入真实 ANS MCP 工具
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented-unverified
related: [claude-governed-session-v2-a1, multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 完成本角色源码与 17 项实际 SDK/MCP 临时环境测试，项目正常依赖复测待执行
---

# Claude 接入真实 ANS MCP 工具

以前没有 Claude Provider；现在核心 Service 可以选择 `src/provider/claude/session.ts::createClaudeRuntimeAdapter`，把实际治理工具交给 Claude MCP。完整过程见[当前功能](../feature/claude-session.md)，实现依据见[已授权设计](../design/2026-10-14_design_claude-governed-session.md)。只有本角色 session/private common/test/docs 被修改，公共工具、存储、共享秘密目录、构建依赖仍归原属主。

工具的真实 SDK 注册使用完整 Zod 对象，参数必需/可选、嵌套、union 与额外属性得到保留。SDK 清空原生工具，外部 config/MCP/skills/plugins 隔离，PreToolUse 校验当前轮、精确名称及 SDK server provenance。顺序 handler 先调用注入的 ANS 能力，再回交实际结果。停止捕获每次调用的旧 signal，关闭 query；确认迟到不产生 write/report。SDK 原生恢复成功和 ANS 回放分别呈现，失败输入不自动重放，下一条明确输入新建上下文。

## 当前证据及限制

生产和测试文件正常导入包名，没有临时 fallback。项目尚未安装 Claude peers，因此本轮把源码及本角色测试逐字复制到临时 harness `/private/tmp/ans-claude-offline-candidate`，仅用安装在 `/private/tmp/ans-claude-sdk-0.3.299` 的官方包验证。环境：Node 24.14.0、Darwin 25.6.0 arm64、TypeScript 7.0.2；基线 HEAD `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c` 加现有工作区并行变更。SDK0.3.299、Zod4.6.7、MCP1.29.0、Anthropic SDK0.93.0；fake query 替换运输，MCP Server/Client、schema 转换和 ANS handler 为真实实现。

`node --test 'test/claude-adapter/**/*.test.ts'` 在该复制候选最终 **17/17 通过**。覆盖懒加载/原生工具清空/config隔离/provenance、真实 schema 参数与额外值、认证与 URL、shell拒绝零marker及允许输出、gate拒绝/异常零mkdir/write、顺序写后编辑、连续轮次与图片、错误凭据净化、客户等待暂停、停止待确认/queuedwrite/report/lateanswer、timeout准确settled、真实恢复成功/失败后下条输入重建、storage symlink/runtime拒绝、核心Service真实报告/派发回执与索引/回放。测试 MCP Client 的 tool timeout 与生产 server timeout 一致。

完成15/15后，项目管理指出「旧工具callback晚到下一轮」与「handler已开始后lateanswer」不同，原先按callback到达时active捕获不能证明原始轮归属。先补nonce bridge得到17/17，随后进一步查到SDK实际types与[官方hooks](https://code.claude.com/docs/en/hooks)提供nativeprompt_id；现在UserPromptSubmit先关联原始Turn，PreToolUse同ID再发行单次nonce，MCP只能消费此原始上下文，组合其hook/turn/query/nativeextra.signal。扩充原用例加入旧PreToolUse后最终再17/17，包含真正晚到旧callback、旧PreToolUse、重放/缺失/未知nonce零effects，reservedschema冲突拒绝及additionalProperties:false保留、保留参数不进入核心。此前15/15和首次nonce17/17证据为旧候选，最终17/17也只是同版本真实MCP+fakequery，不证明nativevendor执行轮次；通用updatedInput契约适用于进程内MCP是基于官方tool-event/输入替换文档的推断。

`bare` 的本机旧CLI help概括为跳过hooks；当前[官方headless](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)更准确限定为跳过auto-discovery，并推荐SDK calls用bare。保留bare与显式SDK hooks的兼容性依据该通用配置说明推断；并无实际nativehooks模型轮次证据。若所选binary不提供nativeprompt_id/SDKhook或不应用updatedInput，适配器拒绝执行工具，不借此退回按latestturn猜测。

候选指纹（路径排序，每项 `path + NUL + bytes + NUL`）：本角色3个源码+1个测试 SHA256 `b79038ecdbe6303bf2d49c11d08710cfb8b8ee23515fab97581a86541f5987d9`；临时harness全部69份src `.ts` 快照 SHA256 `a654df8b6b0e0fca5eef198b7f0ebc1776b6b316c00b969b24e7f2cfb22120ce`。后续源码变化必须更新指纹及重测，文档状态暂不标最终verified。

首次候选 **11/12**：唯一失败是测试假设 `additionalProperties:true` 的文本表示；实际 SDK 编码为 `{}`（等价允许任何值），随后断言改为准确 `{}`，另加实际 handler 保留额外参数的验证。扩充后首次 **14/15**：SDK 将 disjoint `anyOf` 编码为 `type:['string','number']`，随后按实际等价输出检查，并保留 boolean非法/nestedrequired/额外值测试。没有删除测试或放宽工具权限。

针对本角色及其实际依赖的类型检查在临时 harness 通过，命令：`<project>/node_modules/.bin/tsc --ignoreConfig --noEmit --target esnext --module nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --typeRoots <project>/node_modules/@types --types node src/provider/claude/session.ts test/claude-adapter/session.test.ts`。实际 SDK 要求 UUID transport 字段，已用独立 randomUUID，不把任意公共 turnId 强转 UUID。初次类型检查暴露 UUID/fixture purpose/requestId，均在原属主 scope 修正后通过。

**项目 `npx tsc --noEmit` 尚未通过**：正常项目缺 SDK/Zod/MCP 类型依赖，装配安装最终共享版本后必须在项目原路径重跑本角色17项与整仓类型检查。其它角色/依赖后续变化会使此复制候选 evidence失效，不能用临时结果代替最终组合。尚未调用真实模型账号、未在线验证、未发布或提交。

项目管理保留native证明为后续A1V门槛：正常依赖装配后，用严格loopback fakeAnthropic endpoint、假凭据和bundledCLI验证bare下真实UserPromptSubmit/PreToolUse.prompt_id与SDKinputUUID关系、updatedInput进入进程内MCP。当前测试只证明本角色bridge及MCP协议；UserPromptSubmit映射仍依赖原生提交顺序，尚未证明lateUserPromptSubmit可以通过SDKinputUUID做权威对照。此前不会标最终nativeprovenance通过。该后续验证无真实外部API、无模型账号，仍须由本固定角色执行。

SDK MCP 有有限硬时限，实际 `timeout=2147483647`（约24.8天）和自动后台化关闭已实施；ANS deadline会暂停，但不承诺原生无限等待。上游时限/中止不会自动授意或伪造完成。系统级沙箱和 SDK 对执行环境的全面隔离不在本证据内。

本记录保留A1初始候选与当时限制。A1V已实际发现bare抑制显式hooks、nativeprompt_id不同SDKuuid，并完成修复、正式20项/原生回环/整仓类型验证；当前状态见[原生修复证据](../fix/2026-10-14_fix_claude-native-hook-identity.md)。
