---
id: truthful-handback-and-authorized-shell
type: fix
title: 角色报告按真实轮次返回，主入口汇总，已授权常规检查不重复询问
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [submit-report-handback, handback-round-stable-key, shell-gate-arming, runtime-diagnostics-and-reporting]
events:
  - date: "2026-10-13"
    kind: created
    summary: 只读定位回交跨轮残留、伪完成与shell重复确认，提交候选
  - date: "2026-10-13"
    kind: designed
    summary: 项目管理评审并依据客户直接修复授权下达实施指令，统一turnId/outcome、批次输入与宿主常规检查政策
  - date: "2026-10-13"
    kind: implemented
    summary: 回交按轮隔离、真实状态、路径证据与汇总提示；宿主委托的精确检查免重复a；消费统一诊断日志
  - date: "2026-10-13"
    kind: verified
    summary: 编排222/222离线测试与全仓typecheck通过；未运行真实模型，桌面整链由其属主和项目管理验证
---

# 角色交回实际结果，主入口给客户可验收的汇总

用户在真实试跑里收到“completed / 会话结束 / write_file 执行完成×8”，无法知道做了什么、是否通过测试。同时，普通检查经pm允许之后仍反复问客户。现在编排只依据真实轮次和实际报告交回结果：无报告显示待补，失败、中止和超时不会冒充任务完成；主入口收到的输入直接要求核对已经收到的结果并向客户汇总。

当前功能见[任务报告回交](../feature/task-handback.md)与[shell审核](../feature/shell-review.md)。跨角色版本与授权依据为项目管理的[统一契约v1](../../../项目管理/docs/design/2026-10-13_design_runtime-diagnostics-and-reporting.md)。业务修改依据客户本次直接修复指令，主入口已实质评审并指示实施，没有重复索要同一授权。

## 原来错在哪里

- `buildTaskHandback` 把settled当完成，摘要优先采用结束信号；真实适配器的摘要固定为“会话结束”。泛化工具摘要被逐条照抄成证据。
- `withHandback.seen`与会话闭包中的taskReport跨轮保留；两个settled之间的事件又被误当轮次界限。晚消费事件时，可能读到下一轮报告。
- 回交输入只有“请验收”，没要求客户能理解的统一结果。派发载荷没有taskId，无法可靠判断所有角色是否收齐，不能凭到达时间制造任务图。
- c把npm检查归risky；原链规定b允许之后仍须a。只改模型措辞不会改变该链。

基线为Git `e3d9997e2918117239029d17b7db34f83b90b7a3`加已有未提交桌面修复。原refreshListing与桌面改动全部保留。角色卡引用的旧`2026-10-11_design_ans-cli-pi-runtime.md`未在当前仓库找到，本次没有把它当批准证据。

## 当前实际行为

1. Pi为每prompt提供`detail.turnId`，终局的`detail.outcome`只有completed/failed/aborted/timed_out。编排按turnId保存报告与事件，在终局取同轮有效报告、删除该轮报告和证据；重复终局只透传，不重复回交。已终局轮次的迟到报告忽略且记诊断。旧替身无metadata时仍按已知settle界限兼容，每轮清空证据与报告；它不能证明交错轮次的身份。
2. `ReportHandbackFn(report,metadata?)`直接使用Pi公共类型，metadata由运行时提供，不由模型工具参数自填。正常轮次最后一份有效报告优先，非法报告不擦掉已经收到的合法报告。没有有效正式报告不能强制completed。
3. `TaskHandback.status`是completed/blocked/unreported/failed/aborted，工具`TaskReport.status`仍为completed/blocked。无报告正常收口显示unreported；无成功产物且有拒绝时显示blocked，并明确未报告与拒绝原因。失败与超时显示failed，中止显示aborted；即使较早报告completed，终局失败也压过它，旧报告保留为“中断前报告”。
4. 未报告时只从成功写入事实提取“已写入/已编辑：路径”，去重同一动作与路径；失败工具、读取、没有路径的泛化完成摘要都不作产物证据。文件写入不能当测试通过。正式报告证据不混入推导工具事件。
5. `renderHandbackPrompt`与`renderHandbackBatchPrompt(readonly TaskHandback[])`同源。单份首行保持`[回交] 来自...`，多份首行保持`[回交] `前缀，使桌面既有注入消息识别/默认折叠继续生效。每份来源、任务关联、原摘要、完整证据保留；末尾要求主入口说明实际成果、测试、待补/返工与下一步。
6. 批次只表示“已经收到这些报告”，无taskId写“任务关联未知”，明确不宣称所有角色或整个任务完成。桌面负责仅合并同项目队首连续handback，遇客户消息/派发停止、失败保留；编排不持有全局任务图，不猜expected角色数。
7. `handbackKey`优先用真实turnId，缺metadata时降级round；不拼时间戳。相同轮次重放稳定，同文新轮次或会话重开不混淆。

## 客户委托的常规检查

公开参数由`src/pipeline/orchestration/shell-arming.ts`导出`RoutineShellPolicy`：

```ts
{ enabled: true, projectRoot: string,
  authorizationSource: "customer-delegated-routine-checks" }
```

桌面为已导入且已获客户授权的项目角色会话传入`openRoleSession`顶层`routineShellPolicy`；编排传给同名shell装配字段。政策来自客户本次明确委托，由宿主提供；模型、派发和pm审读不能自授。su只读分支不转交政策。

仅同项目cwd、精确检查形式、b明确allow时才能免重复a。新增行为实际用于risky的`["npm","test"]`与`["npm","run","typecheck"]`。`node --test`在当前c规则本来就是review，b允许即放行，继续原行为；helper也明确约定它的窄形式：可无路径使用项目默认发现；有路径仅项目`test/`下`.test.ts/js/mts/mjs/cts/cjs`或对应glob，禁止额外flag、包装、组合、`..`与外部路径，复用共享realResolve检查存在祖先/文件的外指符号链接。

未匹配政策的命令按原c-b-a链，不把npm任意run/安装/删除当检查。c硬拒、su只读、b拒绝/不可解析/拿不准/报错/超时均不自动变成允许。当前执行层是shell:false，组合符号可能是普通argv，故本实现不声称全部组合都被c硬拒；它们不匹配委托政策。npm检查仍是本项目脚本执行，需b判允许，不能仅凭程序名保证无副作用。

早期候选的“每任务精确命令grant”未采用：现有宿主没有可靠task授权结构，单做未注入选项不能解决实用问题。客户这次直接给了宿主常规检查委托，采用已明确评审的窄项目政策，不造不可用的任务授权系统。

## 诊断与真实验证范围

只消费项目管理的`src/common/shared/diagnostics.ts`，未配置时no-op、IO失败不影响业务。已记录session open/send/abort/repin/dispose、report接收或忽略、handback生成或重复、shell review开始/结束、operator升级与routine委托来源。仅元数据，不存命令、argv、任务正文或文件内容；24h滚动清理由共享模块统一实现。

编排实际写集：`handback.ts`、`shell-gate.ts`、新增`routine-shell-policy.ts`、Pipeline `run-role.ts`/`shell-arming.ts`；测试修改`test/编排/handback.test.ts`，新增`handback-lifecycle.test.ts`/`shell-authorized-routine.test.ts`；本文、两份稳定功能说明、导航与memo。未改app、provider、Pi私有common、shared实现、门禁规则或他角色tests。

验证：Node v24.14.0 / macOS；`node --test "test/编排/**/*.test.ts"` **222/222**，包含新增34例；`npm run typecheck`零错；角色写集`git diff --check`通过。行为覆盖延迟消费、轮次交错、正式报告优先、非法/迟到报告、重复终态、异常压过completed、产物去重/无路径、批次来源证据与桌面前缀、host实际装配、policy精确边界、原审核链保护、共享诊断来源/隐私。测试中的npm/node请求只审核，不真执行shell；模型以替身提供，无真实模型请求。

最终源码与测试候选SHA-256为`f98e8b9f64da21203472332e9dea10713e0eb136d1e14fda0a0a928d31c7b734`（8个实际源码/测试路径排序，按`路径UTF-8 + NUL + 文件字节 + NUL`顺序计算）。终检证据在`/private/tmp/ans-orchestration-final-20261013.tap`与`/private/tmp/ans-orchestration-typecheck-20261013.log`；该路径是本次测试输出，不是产品诊断日志存储。

状态：编排候选已实现并完成自身离线验证；Pi依赖候选已就绪并验其公共形状。桌面整链、最终组合回归和应用部署由对应属主与主入口完成，不能用编排单测代替；未重启桌面应用。
