---
id: pi-runtime-outcome-diagnostics-fix
type: fix
title: 等待审核不误超时，失败工具与中止轮次如实结束
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [p02-abort-session]
events:
  - date: "2026-10-13"
    kind: created
    summary: 本地 SDK 与离线注入复现审核等待漏挂闸、工具失败丢失和结束原因丢失
  - date: "2026-10-13"
    kind: implemented
    summary: 按项目管理canonical v1和用户修复授权实施安全事件、轮次、等待与共享诊断
  - date: "2026-10-13"
    kind: verified
    summary: Pi专项185/185通过，typecheck与diff-check通过，未发真实模型请求
---

角色执行命令时，正在等人工审核也可能触发整轮 120 秒超时；工具明明返回失败，界面却会显示“执行完成”；SDK 模型错误和中止又都被概括成“会话结束”。这会使编排把没有有效报告的失败轮次误判成完成。本次修复修正适配器真实输出，供主入口准确汇总；汇总、普通操作授权和桌面白屏各由对应角色处理。

本记录关联现有[会话停止说明](../change/2026-10-13_change_p02-abort-session.md)。本角色现没有稳定 feature 文件，故不虚构功能文档链接。角色卡要求的 `2026-10-11_design_ans-cli-pi-runtime.md` 不在仓库；实际接口依据 `src/provider/pi/session.ts` 和项目管理现有 `2026-10-11_design_ans-cli-v1-prototype.md` §4。

## 已确认的原因

1. `src/provider/pi/tools.ts::makeRunShellTool` 等 `shellGate` 时只套 `withTimeout`，没有交互活动闸，也没有 `raceAbort`。只有 `askCustomer` 接入了活动闸。因此 shellGate 内的人工作答等待仍消耗外层 prompt 时限，中止后还可能等待审核直到审核超时。
2. `src/common/pi-adapter/real-adapter.ts::toPiTool` 把 `{ok,message}` 转成 Pi 结果时丢掉 `ok`，没有 `isError`，也没有安全的结果明细。Pi agent-loop 根据 `result.isError === true` 判失败，故 handler 的拒绝和超时会变成 accepted“执行完成”。
3. `wireSettledOnce` 丢掉 SDK 的 `agent_settled.aborted`；扩展 `message_end` 只抽文本，错误消息的空正文不产生失败事件。结果模型错误与中止无法被消费方辨认。
4. `makeRolePrompt` 捕获超时后先发一条普通 message，再 `await session.abort()`，最后才向上抛错。SDK 中止会先发 settled，然后才解 idle，因此编排先看到 settled 时仍可能尚未拿到 prompt 的异常。不能以 promise 最终拒绝来补救已经发出的伪成功回交。

本地 SDK 1.1.0 已核对：`pi-agent-core/dist/agent-loop.js:574` 等待工具 execute；`:647` 再发工具结束事件；`pi-coding-agent/dist/core/agent-session.js:1380-1412` 最后进入 settled；`:690-707` 发 settled 后才解 idle。`submit_report` 的 handler 先等待注入回交回执，再结束 execute；当前编排 `run-role.ts:368` 同步写报告。因此正常报告接受先于本轮 settled，未发现 SDK 在工具执行中提前 settled。真实运行里“fallback 先出现，后续真实报告到达”的跨轮原因仍需编排核对轮次状态，不能归咎于正常 submit_report 的 SDK 顺序。

## 已实施的修复

- 保留现有有限时限：prompt 120 秒有效工作时间、shell review 120 秒上限。仅 shellGate 的整个审核 await 挂活动闸，外层 prompt 暂停；审核自己的上限继续生效，超时只拒绝该命令。review 外套 `raceAbort`，中止立即 fail-closed；finally 收闸；迟到 allow 不进入 spawn。命令执行时间仍计入 prompt。
- `toPiTool.execute` 返回 `isError: !result.ok`，并生成安全 details：`{toolName,toolCallId,path?,ok}`。工具结束事件通过现有 `detail` 承载 `{toolName,toolCallId,path?,ok,status,durationMs?,errorCode?}`。目标只取参数中的 path/file_path/filePath 等既有路径字段，不携带 args、文件内容或结果正文。`SessionEvent` 冻结 kind 和顶层字段不变。
- 每次真实 prompt 开始生成 UUID `turnId`，同轮工具、回交报告、终态和诊断读取同一轮标识；公开订阅跟踪当前轮最后一条 assistant 的 stopReason 和 SDK settled，prompt Promise 结果确定后才由 `lifecycle.finish` 唯一出口发布终态。SDK finally 先发settled随后prompt抛错时也不会先发布completed；settled 在现有 detail 中带 `{turnId,outcome:completed|failed|aborted|timed_out,errorCode?}`。正常文本消息照常输出；空正文模型错误仍输出 denied 和结构化原因。prompt timeout 在请求 SDK abort 之前锁定 timed_out，终态出口先输出 denied再输出settled，保证消费者不会先收伪成功。失败路径如 SDK 未发 settled，则有界清理后由同一“本轮只发一次”出口补终态，晚到 SDK settled 不重复。
- prompt 超时后的 abort 清理加 5 秒有限等待；超限向上抛原始失败并记 CLEANUP_TIMEOUT 和 session.quarantined，不等待无限 idle，不宣称停止完成。未来仍忙的会话由上层如实处理，不绕过 SDK 并发限制。
- 诊断统一写项目管理提供的共享 logger。适配器直接消费共享入口，原 stage/trace stderr门面保留；没有新增存储或清理。记录会话构造/恢复、prompt开始/完成/超时/中止、工具start/result、审核与客户确认等待起止、submit_report接受/拒绝/中止。只记录 component、roleId、session/round/toolCallId、toolName、目标路径、状态、耗时、稳定错误码；不记录 token、prompt、源文件内容、原始 API 响应。24 小时滚动存储由共享组件唯一实现。

## 精确写入范围

实际写集（全部在本角色边界内）：

| 路径 | 目的 |
| --- | --- |
| `src/provider/pi/session.ts` | 定义兼容的报告第二 metadata 参数，不修改冻结 SessionEvent |
| `src/provider/pi/tools.ts` | 审核等待挂闸/中止接线，报告turnId与交互诊断 |
| `src/common/pi-adapter/real-adapter.ts` | isError、安全事件明细、终态、生命周期诊断 |
| `src/common/pi-adapter/lifecycle.ts` | 私有轮次状态、唯一终态、SDK重试与清理隔离 |
| `src/common/pi-adapter/timeout.ts` | 已中止raceAbort保留拒绝观察者，避免迟到拒绝未处理 |
| `test/pi-adapter/runtime-outcome.test.ts` | 离线工具拒绝/超时/模型错误/终态与报告顺序 |
| `test/pi-adapter/shell-wait-lifecycle.test.ts` | 注入等待点验证审核暂停、中止、迟到 allow |
| `test/pi-adapter/diagnostics.test.ts` | 安全字段与生命周期关键日志 |
| 已有 `test/pi-adapter/settled-once.test.ts`、`dispatch-task.test.ts` | 更新本轮重复终态和普通操作授权文案断言 |
| 本修复文档、`memo.md`、`changelog.md` | 记录实施与实际验证结果 |

不改 `src/provider/pi/session.ts` 冻结 SessionEvent 定义、app、编排、依赖声明和共享 logger 实现。logger从真实适配器已有 projectRoot/role.id 绑定，无需增加公共工厂契约。

## 跨角色对接口径

编排可直接读 `accepted/denied.detail.turnId/toolName/path/ok` 与 `settled.detail.turnId/outcome`，不能把 settled 等同 completed。报告仍经原 `reportHandback` 能力到达，新增兼容类型 `ReportHandbackMetadata={turnId:string}`、可选第二参数 `ReportHandbackFn(report,metadata?)`；只有实际轮标识存在时传 metadata，既有单参消费者保持兼容。适配器不自行汇总或替模型造报告。普通操作授权由编排负责；工具说明已对齐：已接受项目边界内、已授权任务的普通操作无需重复确认，新建或扩张边界、治理写集仍由su请求客户确认；本层未改变gate判断。

项目管理已给共享日志契约：`src/common/shared/diagnostics.ts::createDiagnosticLogger({component,projectRoot?,roleId?})` 返回 `{record(event,fields?),error(event,error,fields?)}`；未配置 no-op，IO 异常不中断业务，保留/脱敏/落盘/24 小时清理由共享组件负责。适配器仅消费该接口。

## 验证与现状

当前只读离线探针实际得到：审核 Promise 挂起时 `interactionGateWaiting:false`，prompt 25ms 超时；handler `ok:false` 转 Pi 后 `isError:null,details:null`；空 content 错误后 aborted settled 仅产生“会话结束”。探针没有启动命令、没有真实模型请求、没有创建真实模型项目。

实际回归覆盖：

1. 审核等待长于 prompt 有效时限，收到明确 allow/deny 后才继续；审核到独立上限拒绝；中止立即返回；迟到 allow 没有 spawn。
2. 真实 faux SDK 执行 denied 工具必须发 denied，写成功结果必须带路径；同轮 submit_report接受回执在 settled 前。
3. 空 content 的 stopReason:error、用户 abort、prompt timeout 均以一个 settled结束且 outcome准确；正常轮 completed；重试后成功不得沿用前次错误。
4. 注入 abort永久不解的夹具，证明清理有界；计时测试使用 mock Date + setTimeout。
5. 安全日志字段不得包含提示、凭据、源内容、结果正文；共享 logger失败不改变原工具结果。
6. `node --test "test/pi-adapter/**/*.test.ts"` 和 `npm run typecheck`。跨角色共享依赖变化后由项目管理安排编排与测试角色验证。

源码和14条新增回归已实施。最终 `node --test "test/pi-adapter/**/*.test.ts"` 185/185通过，0失败/0跳过；`npm run typecheck` 与 `git diff --check` 通过。原有本地HTTP超时用例因sandbox禁止端口首次EPERM，经自动审查批准后完整Pi专项运行通过，仅127.0.0.1，无真实模型请求。详细临时输出 `/private/tmp/ans-pi-diagnostics-tests.log`。

用户已停止真实模型测试并删除临时项目，本次未恢复真实模型项目测试，未部署。已存在限制按项目管理裁定保留：`runShell` 已启动子进程没有接入SDK AbortSignal，不能保证中止时该子进程或进程树停止。修复保证审核等待可取消、SDK清理有界；日志明确记录prompt outcome、CLEANUP_TIMEOUT/FAILED和session.quarantined，绝不声称全部子进程已停止。
