---
id: multi-runtime-integration-v2-result
type: change
title: 同一套ANS治理接入Pi、Codex与Claude
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 三引擎与CLI/桌面已接线，独立验证发现历史/live重复后返回原属主修复
  - date: "2026-10-14"
    kind: verified
    summary: 当前候选独立23/119/14与全仓1225通过、1既有Windows跳过，源码指纹匹配；README与治理审计完成
---

# 同一套ANS治理接入Pi、Codex与Claude

用户可以在CLI的角色运行和治理入口选择Pi、Codex或Claude，也可以在桌面角色名旁切换引擎、查看对应设置。所有引擎使用同一套ANS工具与写前判定。会话、历史、待确认卡、排队和后台回交按项目/角色/引擎固定身份，切换选择器不会改变已运行任务的来源。

客户先确认运行时接入组、专属属主和并行开发，随后明确要求“可以的，你新建角色吧，然后开发吧”。本记录是该既有授权的实现验收，不是新增提案。[具体设计与阶段原证据](../design/2026-10-14_design_multi-runtime-integration.md)记录范围、契约、管理评审及实际SDK限制；[当前架构](../architecture.md)是稳定阅读入口。**最终无网络候选已验证：全仓1225通过、0失败、1既有Windows跳过；真实桌面23项、旧界面119项和锚点14项通过。**

## 交付行为

运行时核心单一维护Model契约、实际治理工具/schema、轮次、终态和ANS回放；三个Provider负责实际SDK/运输表示与原生会话。Pi的旧public API由属主保留兼容转出，生产执行没有第二套工具授权。客户端选择失败、缺配置、恢复失败、中止和未报告都如实表达，不能静默换引擎或推断任务已完成。

CLI的 `role run … --runtime pi|codex|claude` 和 `govern --runtime pi|codex|claude` 到达相应工厂。旧默认值保留：role run默认demo，govern默认Pi。桌面同时保留demo测试兼容，实际选择器提供Pi、Codex、Claude。设置按共享metadata列出真实必填字段与来源；密钥只显示是否设置，保存成功才增加profile版本。忙Pi在所有旧轮次结束后才安全应用新ambient配置，Codex/Claude使用一致快照。

会话目录为 `.ans/sessions/<role>/<runtime>/`，ANS索引/回放与native目录分开；Pi旧JSONL只作Pi兼容恢复/展示。磁盘历史不证明模型上下文已恢复；成功native恢复、失败后重建、活句柄复用明确转换为桌面状态。窗口将原确认signal或精确句柄生命周期用于失效卡，晚答不能发行下一轮写权。

运行时接入组已登记：运行时核心组长，Pi/Codex/Claude适配器组员。组字段只表达协作与界面分组，不扩张写入权限；真实角色枚举无warnings。

## 原属主验证

| 原属主 | 自有当前门槛与原报告 |
| --- | --- |
| 运行时核心 | [38/38；原33项终态/取消及5项真实轮次开始通知](../../../运行时核心/docs/fix/2026-10-14_fix_prompt-start-acknowledgement.md) |
| Pi适配器 | [199/199；原SDK、Core注入和旧API](../../../Pi适配器/docs/change/2026-10-14_change_pi-injected-runtime.md) |
| Codex适配器 | [16/16；真实MCP/动态工具身份与配置](../../../Codex适配器/docs/fix/2026-10-14_fix_blank-base-url-default.md) |
| Claude适配器 | [20/20及实际bundledCLI本地回环](../../../Claude适配器/docs/fix/2026-10-14_fix_claude-native-hook-identity.md) |
| 编排 | [238/238；runtime选择、源身份及晚yes不授写权](../../../编排/docs/change/2026-10-14_change_multi-runtime-orchestration.md) |
| 装配 | [78/78；CLI实际接线与SDK懒加载](../../../装配/docs/change/2026-10-14_change_multi-runtime-assembly.md) |
| 门禁引擎 | [168通过/0失败/1既有Windows跳过；组摘要](../../../门禁引擎/docs/change/2026-10-14_change_role-group-metadata.md) |
| 项目管理 | [共享109/109；枚举、设置、掩码和中止原子写](../../api-spec.md) |
| 桌面窗口/桌面UI | [窗口原171/171](../../../桌面窗口/docs/change/2026-10-14_change_multi-runtime-window.md)，[实际轮次来源修复101/101](../../../桌面窗口/docs/fix/2026-10-14_fix_client-message-origin.md)；[UI60/60、12项局部实际Electron与legacy卡修复](../../../桌面UI/docs/fix/2026-10-14_fix_preserved-card-replay-anchor.md) |

各自测试不能代替独立合并验收，具体candidate/hash与原失败日志取链接中的原记录。项目管理逐文件复算了窗口46项、界面19项manifest；后来修复使对应早期摘要失效时，原记录只保留历史，不冒充最新候选。

## 独立验收状态

[T1独立报告](../../../测试/docs/change/2026-10-14_change_multi-runtime-independent-verification.md)记录实际CLI六入口、Pipeline五个流程、真实Electron main/preload/renderer，以及全仓、类型检查和native探针。测试loader只替换外部engine/运输、临时env路径与目录对话框，保留原产品入口、实际Adapter、Core、MCP与gate；测试代码未被生产导入。所有写入、历史与配置夹具在临时目录，未调用真实账户或外部模型。

首次受管全仓1212项为1211通过/0失败/1既有Windows跳过，tsc/diff通过；sandbox回环listen EPERM和Electron SIGABRT保留为原平台失败。稳定Codex0.162.1无模型native探针、Claude实际bundledCLI严格loopback均通过。随后截图复核发现同一轮history/live重复：新增独立guard真实失败，原17项窗口检查不能证明没有重复。原[问题与复现](../../../测试/docs/fix/2026-10-14_fix_actual-main-live-history-duplication.md)保留，D1/U1在原边界内透传turnId/eventKind并按可确证的同轮合并，保留不同轮相同文本、legacy、未持久live、卡片与回交；这一原红已由最终实际入口复测闭合。

该原重复guard随后由实际main重跑转绿，包含真实composer两次同文direct/queued的23项通过。Core只读onTurnStarted由原投递闭包捕获，Window已删除首次事件/FIFO猜测，不把client ID持久化或作为授权。载荷守卫迁移已独立核对：旧legacy保留原opts对象/单参；真实ack路径浅包装通知，但images数组与图片对象同引用、原opts不修改、原callback继续调用，queued固定内容不变；不再笼统声称所有路径整包同对象。

有限旧UI回归最初两红是**测试夹具前置缺口**：旧fake IPC未实现真实preload已有history-get，人工NoHandler错误改变了历史/首屏状态。测试角色补齐自身当前模拟历史与三元身份合同，保留全部原输入/推送/断言后119/119及首次贴尾/活动组/阅读保护通过；没有为此改产品或添加错误硬化。这与已证实的history/live重复修复不同。随后正确夹具发现真实legacy已决卡在full前插后被移到最前，决定状态仍在但原request/conclusion邻接丢失；U1按真实anchor恢复位置并保留原DOM/失效状态，显式未知token也不再继承新轮次。最后原锚点断言及连续重建保护均通过。

最终UI19项指纹为 `b4882fe2e0c674e8d3b3d1185d60a873e9768d0529b48e3bc04c6cdf97b531aa`。T1当前执行快照包含269代码/测试，起止无差异；项目管理再次逐文件复算269项与当前工作区全部匹配，聚合 `34788e922e83cf7aaf692df6cb457dda37bad4794f9f40fed59ae60aa26e20a5`。107份生产源码/配置聚合 `46b9529a7826a6d5258dc789853b61ebd4e03fea1a1111748f919afee8b41d2b`。正确当前证据是T1的 `current-main/` 和 `current-*`，旧 `final-3/` 等阶段结果不能代替最后候选。

最终 `node --test 'test/**/*.test.ts'` 为1226总/1225通过/0失败/0取消/1既有Windows专属跳过，`npm run typecheck` 与 `git diff --check` 均exit0；独立真实main23/23、原UI119/119、原锚点14/14通过。静态守卫迁移与实际行为分开记录；SDK21项依赖与原native探针候选不变，按原范围保留而不重复。测试角色已关闭自身进程，仅清本次生成的Electron缓存，保留所有日志、图片、指纹、原失败与native资料。[当前宽窗](../../../测试/docs/change/2026-10-14-t1-runtime-evidence/current-main/actual-main-1360.png)、[窄窗](../../../测试/docs/change/2026-10-14-t1-runtime-evidence/current-main/actual-main-960.png)与[两次同文输入](../../../测试/docs/change/2026-10-14-t1-runtime-evidence/current-main/actual-main-identical-inputs-960.png)都是离线fixture实测图。

Governance最后独立归属审计：110个src/app/test路径各有且仅有一个有效属主，无遗漏/重叠；组四成员、一组长、三组员，实际枚举warnings为空，边界镜像一致。[治理原记录](../../../运行时核心/docs/change/2026-10-14_change_runtime-group-governance.md)可追溯保护路径。装配完成[最终README事实与状态同步](../../../装配/docs/change/2026-10-14_change_readme-multi-runtime-desktop.md)，只改自身文档；最终README SHA为 `44941e78c117b14983debdc48bea8fc77c81b514c7a1f3cacc725a3e3071d0d7`。这些文档收尾没有改变上述执行候选。

## 已知验证边界

Codex的实际接入是固定 `@openai/codex@0.162.1` app-server与显式experimental dynamicTools；TypeScript SDK没有可验证的等价配置/回调能力，不声称它提供该路径。启动线程前实际核验配置，关闭全部native MCP及未治理写/shell能力，只有原turn归属的ANS代理进入真实处理器。

Claude固定Agent SDK0.3.299，原生hook/MCP输入更新已经假端点验证。原生wire包含私有输入关联标识，受控界面/ANS输入和输出会净化；它不是授权令牌。ANS确认等待期间暂停本轮硬时限；Claude上游MCP wall-clock设约24.8天，Codex上游dynamicTools期限未建立，不能承诺原生无限等待。真实账户/线上模型、完整OS沙箱与Mac上的Windows子进程清理分支未测。

没有自动git提交/推送，真实 `.env`、归档边界与vendor文件未被本次开发修改。最后Governance归属/权限审计与T1实际证据共同构成验收输入，不替代客户对业务结果的确认。
