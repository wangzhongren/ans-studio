---
id: codex-tool-display-projection-change
type: change
title: Codex 真实工具展示接线与模型输入保持
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-governed-session, codex-tool-display-report-consumer]
---

# 展开工具时显示真实调用，模型继续接收原回执

客户已批准总方案 r2、A4/C2.text_policy_revision1 与本角色 consumer r2，PM 的 Codex-A-1 包由 root trusted operator 转发。本固定 Codex适配器上下文已核角色卡、boundary.yaml 与批准13文档/Core最新14文件哈希全部匹配，沿已有授权实施，没有修改批准设计或 manifest。

用户在 Codex 会话展开工具详情时，现在由 `src/provider/codex/session.ts::createCodexRuntimeAdapter` 把真实 handler-start/result 的中立 turn/call、注入 displayInputRule、同次 args 与 ToolResult.execution 传给 Core 注入投影器。异常仅另取 Error.message；非 Error 不展开对象。Codex 没有独立写前 hook，不从 ok=false 制造 blocked。投影后的事件直接入队，opaque ID 不经过旧递归 scrub；投影失败只返回固定诊断，不回退原始工具参数/摘要。未知、重复、旧轮与排队后已失效调用不造 handler 展示事实；迟到结果不在 settled 后补写。

生产 required-v1 在工厂同步检查 projector/register 两项函数，缺失时 SDK/MCP/存储准备均未启动。bindRole 从同一内存 env 快照解析 settings，随后仅登记实际选中凭据键与 Core 明确列出的键值；登记失败直接拒绝，子进程认证/PATH仍用该快照。只新增 Model 类型引用，没有导 Core 私有实现、复制目标别名/预算/脱敏器。原 legacy standalone 行为、配置隔离、权限拒绝、nonce、顺序队列、取消、懒加载和清理保持。

模型仍收到原 text 与现有 contentItems 映射，execution 只交展示投影，没有新增 SDK sidecar。Provider 不转发 inputProvenance/inputPresentation/onDeliveryProgress；Core 剥离与安全副本政策由 Core/独验负责，本角色不凭 Provider 忽略字段声称已证明 Core strip。

## 实际验证及范围

- `node --test 'test/codex-adapter/**/*.test.ts'`：22/22，通过，无 skip。保留原16项，新增 required零效果/profile快照与顺序、真实source/error/execution/opaque身份、投影失败无rawfallback、原text/image bytes、未知/重复/queued-stop/迟到隔离。
- `node --test test/测试/t1-real-cli.test.ts`：只读运行独立测试角色原用例，6/6通过，其中 Codex role/govern 两项使用真实命令入口、实际适配器和handler，外部 SDK受控。这不是固定CLI在线测试。
- `node /private/tmp/ans-codex-a-loopback.ts`：实际安装 `@openai/codex@0.162.1`、默认 nativeEngine 和真实 MCP，127.0.0.1 假 Responses SSE 服务2请求，1真实handler，start/result各1，call一致，原模型输入/回执sentinel保持，execution未进入模型请求。假凭据，外部模型调用0。首次sandbox listen EPERM；按已授权 require_escalated 自动审查批准后成功。可复跑的同字节脚本保存在证据目录。
- `npm run typecheck`：最终退出0。初轮自有新增case类型错已修复；随后桌面旧fixture11处错误由实际owner同步，root两处由root同步，本角色未跨权修复。最终共同工作树重跑通过，旧失败日志保留为 typecheck-before-window-fixtures.txt。
- `git diff --check -- src/provider/codex/session.ts test/codex-adapter/session.test.ts 角色卡/Codex适配器`：通过。生产仅一个文件，自有测试仅session.test.ts，fixtures/protocol/config未改；无依赖、.env、边界或其他owner写入。

[当前功能](../feature/codex-governed-session.md)、[批准consumer r2](../design/2026-10-15_design_tool-display-and-report-consumer.md)、[候选及依赖清单](2026-10-15-codex-tool-display-evidence/manifest.json)、[自有日志](2026-10-15-codex-tool-display-evidence/tests.txt)、[类型检查](2026-10-15-codex-tool-display-evidence/typecheck.txt)、[命令入口](2026-10-15-codex-tool-display-evidence/controlled-entry-cli.txt)、[实际CLI回环](2026-10-15-codex-tool-display-evidence/native-loopback.txt)、[回环脚本](2026-10-15-codex-tool-display-evidence/native-loopback.probe.ts)。

未验证在线Codex/真实凭据、用户桌面、Windows清理、全平台隔离或完整P1–P7最终验收；适配器自有通过与独立整合验收分开。Core dependency 若变需重测受影响caller。未提交、推送或部署。
