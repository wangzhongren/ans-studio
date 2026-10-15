---
id: core-non-tool-event-routing
type: fix
title: 保留非工具引擎失败的真实类型
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
related: [complete-flow-core-implementation]
---

# 引擎失败不能变成一次虚构的工具阻断

独立测试确认：没有toolName/call事实的普通engine denied，被Core按kind送入工具投影，生成空toolName及blocked阶段。历史读取也有同样问题。[原始独验红](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/a-non-tool-routing-red.json)保留，测试角色断言不修改。

CORE-A-NONTOOL-FIX-1派发属于已批准A“非工具不整体改写”的必要修复。仅改Core Service和自有session测试/资料，批准设计、旧final-manifest与peer测试保持不变。live/history共用真实结构分类：显式tool_call或具有非空toolName/嵌套call.name的结果走原工具投影；普通引擎/运输失败保原kind与实际身份，只保护summary并保留已知轮次/outcome，不保任意未知detail或构造工具name/phase/call。

以下记录本角色修复与实际验证；不代表消费者整体接线已验。所属[功能](../feature/runtime-core.md)；原A/C冻结候选仍保留作历史。

## 当前结果

已按上述范围实施；只有Service/runtime/session.ts和test/runtime-core/session.test.ts两份代码/测试相对原Core候选变化。工具projector、Model、Provider、peer测试和批准文档未改。live与history同用routeRuntimeDisplayEvent，不以错误name或正文判工具；普通engine/transport accepted/denied保kind和实际turn/runtime/role，summary受同凭据/格式保护，未知detail不做raw侧车。真实工具的显式投影/阶段/预算保持。

新增两项实际行为回归：受控Provider同时发普通失败/准备事实和真实read_file工具，断言Live、原ANS落盘及历史均无虚构工具身份、秘密或未知detail，真实工具result/ENOENT和真实failed终态保留；旧空toolName/blocked合成历史也不再复活，读取不改写原文件。

Node v24.14.0 / macOS arm64：session窄测18/18，root原独立命令同断言1/1转绿，Core全目录77/77；typecheck/diff exit0。原红不改，原Core final-manifest保留。新14文件组合指纹 `dd6b50518ca7504118907e996b76f8553e0f586c9837f573a5e8bfc8c897f015`，Service SHA256 `991146051f429ef26b46b21154a574086b312233047b29c99a9d522c01280f02`，原始日志及全部指纹在[新证据清单](2026-10-15-non-tool-event-routing-evidence/manifest.json)。

旧75项候选的整体指纹仅保历史，新Service依赖需独立A/C、适配器Core接线与Pipeline/Window历史消费重测；不以本77项冒称完整桌面已验。公共API、执行/权限/超时不变，未部署。
