---
id: multi-runtime-independent-verification-t1-result
type: change
title: 三运行时独立入口验证与实际桌面重复显示问题
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [multi-runtime-independent-verification-t1, t1-actual-main-live-history-duplication]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 增加11项独立CLI/Pipeline用例和实际Electron主入口检查
  - date: "2026-10-14"
    kind: blocked
    summary: 实际入口18项中17通过，单轮历史与实时流重复显示1项失败，交原属主修复
  - date: "2026-10-14"
    kind: verified
    summary: 最终候选实际入口23、旧界面119、锚点14与全仓1225通过，源码起止不变
---

# 三运行时独立入口验证与实际桌面重复显示问题

Pi、Codex、Claude 已在真实命令行和真实桌面入口到达对应适配器，并通过实际 ANS handler 做写前判断。独立测试还证明停止后的旧“同意”不能授权下一轮。原单轮重复与旧已决卡锚点问题都已由原属主修复，并由T1保留原断言复测通过。**T1 对记录的无网络候选验证完成**：实际入口23项、旧界面119项、锚点14项全过，全仓1226总/1225通过/0失败/1既有Windows跳过，类型与diff检查0。以下原阶段结果作为历史保留，最后一节是最终候选结果。

新增测试遵循[已批准设计](../design/2026-10-14_design_multi-runtime-independent-verification.md)。只修改 `test/测试/` 和本角色文档；没有产品、peer test、配置、角色边界改动，没有提交或推送。工程法案的有效五层方向、固定角色、共享组件单一实现继续适用；草稿中未确认条目不当成新测试约束。

受测功能当前说明由各原属主维护：[运行时选择](../../../编排/docs/feature/runtime-selection.md)、[任务回交](../../../编排/docs/feature/task-handback.md)、[Core](../../../运行时核心/docs/feature/runtime-core.md)、[桌面会话](../../../桌面窗口/docs/feature/multi-runtime-desktop.md)、[界面引擎选择](../../../桌面UI/docs/feature/runtime-choice.md)。本角色不复制业务功能流程。

## 第一阶段原记录

| 路径 | 结果及证据覆盖 |
| --- | --- |
| 真实 `bin/ans.js` role run/govern × 3 runtime | 新增6/6，默认工厂 → 原适配器 → 实际 Core tool → 原 gate 拒越界写，零文件副作用、输出无假 key；[用例](../../../../test/测试/t1-real-cli.test.ts) |
| 真实 Pipeline/Service 注册工具 | 新增5/5，3 runtime 等待180ms超过100ms prompt时限仍暂停；abort原signal、旧yes后下一轮拒写、当前yes只许可列出路径、report/turnId、失败和超时单终态、ANS索引与回放隔离；[用例](../../../../test/测试/t1-pipeline-integration.test.ts) |
| 真实 Electron main/preload/renderer | [脚本](../../../../test/测试/t1-actual-main.mjs) 最初17/17；新增同轮重复断言后17通过/1失败。合法写真实落盘、越界拒绝、history/event/state三元身份、secret空串、真实组摘要、LRU容量内三句柄、1360/960布局通过。重复显示见[最小问题记录](../fix/2026-10-14_fix_actual-main-live-history-duplication.md) |
| 配置版本、环境快照与Pi安全应用；源runtime派发/回交/队列；恢复词汇映射 | 复用并独立重跑已充分的 `test/桌面应用/multi-runtime.test.ts` 等既有跨角色用例，包含在全仓门。部分用例用会话替身，不能冒充真实main所有交互的证明 |
| 全仓 Node 测试 | `node --test 'test/**/*.test.ts'`：1212总、1211通过、0失败、1既有Windows专属跳过。新独立11项全过；该总数不含单独运行的Electron脚本 |
| 静态检查 | `npm run typecheck` exit0；`git diff --check` exit0。新runtime调用 main → Interface → Pipeline → Core Service → lazy Provider，生产无测试loader导入；完整归属审计由Governance独立执行 |
| 稳定Codex原生无模型探针 | CLI0.162.1，无nativeMCP/foreign启动，只读/never/shell关闭，实际experimentalApi与dynamic request身份schema检查通过；未测在线模型 |
| Claude实际SDK本地回环探针 | SDK0.3.299/bundledCLI2.1.299，4次假Messages请求、2轮原生hook映射和updatedInput实际进入真实MCP handler；外部调用0、假key。probe关于bare allowedTools的warning属于它自己的特定fixture；不把它写成生产canUseTool调用证明 |

## 替身与版本边界

Electron执行生产 `app/main.ts`、`app/preload.cjs`、renderer和业务源文件本身。测试loader只给 Codex 原公开工厂加 `engineFactory`、Claude 原公开工厂加 `loadSdk`（替换query，真实createSdkMcpServer/MCP保留），Pi仅替换外部SDK `createAgentSession`（真实其他SDK导出/ModelRuntime/资源加载器/SessionManager保留）。它不替换selector、Core工具、门禁、Interface或IPC handlers。环境facade仅将 `resolveRepoEnvPath` 指向临时假文件，其他exports原样；目录dialog只返回临时项目。脚本没有生产测试开关。

HEAD `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c` 加当前未提交候选；Node24.14.0、Electron44.7.0内置Node24.21.0、macOS。107份生产源码/配置文件指纹为 `f85f69abb14aa2f310f80a857fd3a106eae4c9b8ed8aba3ac0dfcf100f4c4586`；该值按排序后 `path + NUL + sha256 + newline` 聚合。逐文件实际main起止清单见 `actual-main-fingerprints.json`，起止完全一致。测试loader/脚本另列，后续新增重复断言的版本见 `duplicate-repro/actual-main-fingerprints.json`，同样起止一致。native probes按源文件不变有限复跑，未重新开展SDK调研。

## 原失败与未测范围

原完整沙箱测试1210通过/1失败/1跳过，唯一失败为Pi测试 `listen EPERM 127.0.0.1`；受管完整重跑1211通过。Electron沙箱启动SIGABRT、Claude回环EPERM均如实保留，使用已授权本地受管测试后运行成功。无skip替代失败。

独立脚本初期有4类自身夹具/观察错误：未展开preload批数组、误读handback字段、未控制默认LRU3、未按工具拒绝的blocked语义写oracle，另有TS联合类型缺少显式缩窄；原输出和report均保留，修的是自己的测试，未删除有效断言或修改产品权限。实际单轮重复问题由补充断言确定，不与这些夹具错误混淆。

在线账户/真实外部模型轮次、全OS沙箱和macOS上的Windows kill tree没有测试。Claude上游MCP约24.8天上限仍不是真正无期限。SDK替身测到的是治理业务链和本地真实MCP，不代表所有原生在线运输已验收。

详细证据均在[本轮目录](2026-10-14-t1-runtime-evidence/)：`independent-11.txt`、`full-tests-sandbox.txt`、`full-tests-managed.txt`、`typecheck.txt`、`diff-check.txt`、两份native probe输出、actualmain报告/流/图片/指纹及duplicate-repro。当前等待桌面原属主修复后重新验证受影响候选。PM已定位为跨Window/UI的历史身份合同缺口并安排D1/U1各自修复：既有Core turnId透传，以及按轮次/事件合并。该结论来自管理与原属主调查，T1尚未复测修复候选。

## 修复过程中的阶段复测（历史）

原问题guard在 `final-1/actual-main-report.json` 已18/18通过。T1随后保持旧18项原断言，并用真实composer补direct/queued两次同文：`final-2/actual-main-report.json` **23/23、exit0、errors为空**，真实main/模型/loader起止指纹完全相同。原生外部query仍只为替身；界面、preload、main、实际Core同步ack与Window原投递闭包执行。

X/Claude三轮的实际终态分别为原首轮 `96d40078-2a79-4a81-b0bb-769ea4ef32bb`（原脚本未传clientID，保持匿名），直发轮 `7e1c6a52-c421-4688-a9a3-861aa44cff36` → 原client `691f0a1e-e82b-4ab8-89d3-f697264aa12f`，排队轮 `f9071748-8b4c-4008-b045-cffa7a3e8c0b` → 原client `3bdd033d-d46c-412a-a9a4-4f0c18afc3c0`。该轮历史重推后两份同文各保留一个原user气泡、三个真实turn保留三份response；原一轮重复guard仍严格通过。raw snapshots、宽/窄图片及两同文960图保存在 `final-2/`。

静态迁移与真实行为分开判断：Core在前置状态检查后创建actual UUID，在try内、persist/native前同步调用一次readonly ack；Window只由该原prompt callback注册actualturn→原client记录，事件仅读已登记映射；原clientID不进入Model/store。实际行为由上述23项和全仓Core/Window测试判断，不能用源码字符串存在代替。此次全仓首轮1226项1224通过、1失败、1既有Windows跳过；唯一失败为UI `renderer.test.ts:613` 仍匹配旧 `entry.handle.send(text, opts)` 的**源码钉子**，已交原UI属主迁移，不由T1改peer tests。类型检查和diff-check均0。目前待原owner核对该钉子后最终全仓复跑。

native probe没有重复：21项Pi/Codex/Claude生产适配器、private SDK支撑与package/lock哈希仍与原T1执行快照完全相同，见 `unchanged-native-dependencies.json`。已通过的稳定Codex无模型、Claude实际本地回环证据继续按其原有限范围有效。

旧独立UI保护也按新renderer重新运行，不能沿用旧候选119/14的结果：`final-old-ui/report.json` 在宽1360的第18项“R3 missing reliable state remains unknown”失败，`final-old-anchors/report.json` 初次180条助手+40个工具活动回放时，行模型181行但挂载DOM没有末尾collapsed组，旧首次贴底/组可见性断言失败。数据丢失尚未证明，先交UI原属主核对批量回放与首次可见窗口。两脚本没有改断言；正确绝对OUT的失败与我首次错误传relativeOUT导致Electron启动“Path must be absolute”分开保存。当前23项主要入口通过仍不覆盖这些旧保护分支，最终验收继续保留为未完成。

上述两处初期红的精确诊断已排除产品归因：`old-ui-diagnostic/report.json` 可见错误为旧夹具没有注册 `session:history-get`，人工失败历史覆盖了B模拟数据；anchor也先收到人工错误，改变了首次回放前置条件。T1仅补自己两个harness的当前只读history-get/live-views公共接口，history按projectRoot/roleId/runtime键返回该夹具最近已push的原rows，reset清空。**未no-op忽略读取、未删除错误处理或原断言**。正确夹具119/119、初次贴底与40活动组都通过，因此没有为这些假失败要求产品error硬化。

正确三元夹具继续暴露一个真实旧保护回归：`old-anchor-triple-fixture/report.json` 在原第8布尔断言失败（之前7通过），full前插后 `confirm\0独立拒绝确认` 的真实requestIndex=2、conclusionIndex=3，唯一ind-decided operator却在index0，原断言要求它在requestIndex+1。状态与原卡仍在，位置移到首行。实际可见顺序和rootDOM快照均保存。已交原UI属主限定修复legacy full锚点，不由测试角色改产品；原23通过不覆盖此路径，最终验收继续等待该修复后重跑。

## 最终候选与独立结论

当前U1候选 `b4882fe2e0c674e8d3b3d1185d60a873e9768d0529b48e3bc04c6cdf97b531aa` 的19项manifest已逐文件独立复算，全匹配（`current-ui-manifest-check.json`）。原属主修复legacy锚点与显式null token继承，保留原DOM/已决状态；T1没有修改产品或降低原保护。

| 最终检查 | 实际结果 | 本轮原证据 |
| --- | --- | --- |
| 实际main/preload/renderer | 23/23、exit0、errors为空、单轮只显示一次；direct与queued同文为不同原client/actualturn，历史刷新各保留一个user气泡 | `current-main/actual-main-report.json`、`actual-main-observed-streams.json`、逻辑1360/960宽窗PNG及双同文960图（macOS Retina图片像素为2倍） |
| 旧独立界面保护 | 119/119、exit0、consoleErrors为空、源码起止相同；日志中的“独立通道抛错”是保留的withdraw失败案例 | `current-ui-119/report.json`、`current-ui-119-output.txt` |
| 旧锚点保护 | 14/14、exit0，原已决拒绝卡requestIndex+1/不同conclusion guard严格通过，阅读/前插/开合保护均保留 | `current-anchors-14/report.json` |
| 全仓Node，包括新CLI6/Pipeline5 | 1226总/1225通过/0失败/0取消/1既有Windows专属skip | `current-full-tests.txt` |
| 类型、diff | 两项exit0 | `current-typecheck.txt`、`current-diff-check.txt` |
| 代码与测试起止一致 | 269文件，differences=[]、unchanged=true；真实main自身107生产文件与9份T1脚本也起止相同 | `current-candidate-fingerprints.json`、`current-main/actual-main-fingerprints.json` |

最新三轮X/Claude来源：匿名首轮 `35547ff3-47cc-42c3-9f0f-8f07ee4ec7ab`；direct原client `0193e082-28a0-44fa-a10b-e92eb7b9051c` → actualturn `ca4d3c1b-47b0-4a53-b456-5113cf05da74`；queued原client `15d843b9-2126-458f-9972-5c0158196def` → actualturn `63b31925-18db-495f-a0ab-f4eaf767c278`。原匿名记录未借另一个clientID，两个同文各有独立轮次，最终responseCount=3。

最终269代码/测试聚合SHA-256为 `34788e922e83cf7aaf692df6cb457dda37bad4794f9f40fed59ae60aa26e20a5`；107份生产源码/配置为 `46b9529a7826a6d5258dc789853b61ebd4e03fea1a1111748f919afee8b41d2b`；9份T1主入口/loader/独立用例为 `74cf1354c140751cafa4fbfd79b69d1ee59a55dd43f2411000dca7367c3fd381`。使用排序后的 `path + NUL + sha256 + newline` 聚合；具体文件在JSON中，未读取真实`.env`。后续README/角色报告文字更新不在这份执行代码快照内。

静态迁移与真实行为分别记录：`static-contract-review.json` 核对ack调用顺序、原closure映射、clientID不入Model/store及生产不引用test辅助；真实行为由上述有限检查证明。SDK/adapter/package21依赖与原native probe候选一致，没有重跑未改变的探针；原稳定Codex无模型和Claude实际回环证据继续只支持原来范围。真实账户、在线模型轮次、全OS沙箱与Mac上的Windows kill tree仍未测，不作扩大结论。

所有原失败（产品重复/卡锚点、旧静态guard、平台EPERM/SIGABRT、测试oracle、relative OUT与旧fixture缺handler）仍保存，且彼此区分。已退出本角色测试进程，只清理本轮各输出子目录下生成的Electron user-data缓存，未删report/图/hash/log/native资料，未碰全局或他人浏览器；清单 `test-cache-cleanup.json`。本次未提交、推送或改真实凭据。阶段全绿后不重复无变化的动态检查。
