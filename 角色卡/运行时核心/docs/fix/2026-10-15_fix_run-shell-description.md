---
id: runtime-core-run-shell-description-20261015
type: fix
title: 说明 run_shell 只执行一次程序调用
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: implemented-unverified
related: []
events:
  - date: "2026-10-15"
    kind: created
    summary: 真实桌面维护轮次暴露工具说明与既有 argv 执行契约不清
  - date: "2026-10-15"
    kind: implemented
    summary: 按PM统一r1及客户既有缺陷修复授权实施Core v2，属主回归通过，独立桌面验证待续
---

# run_shell 的调用方式说明

真实桌面中维护角色为检查改动调用 `git status --porcelain && git diff --stat`，收到 exit 129 和 `unknown option 'stat'`。随后拆为两次工具调用，各自 exit 0。原始结果见[测试角色证据](../../../测试/docs/change/2026-10-14-p-limit-real-code-evidence/maintenance-tool-results.json)：失败 call `call_00_44elp1UubXtVLWW7yQmj6320`，成功拆分 calls `call_00_mUPbatUen9wzUmlADiWl5461` / `call_01_MJiiJHgDxO2yxuXuTT8A4598`。这不影响已经完成的 p-limit 修复结果。

根因是[公共 schema](../../../../src/provider/runtime/schema.ts)把 command 称为 Shell command，整体描述未说明调用方式。[实际执行](../../../../src/provider/runtime/tools.ts)先 splitCommand，再经 ShellGate，最后以 `spawn(argv[0], argv.slice(1), {shell:false,...})` 启动一个程序。空白切词、单/双引号分组，不做 shell 展开；`&&` 等仍是参数。既有[当前功能说明](../feature/runtime-core.md)已记载直接执行 argv，这是说明缺口，执行契约不变。

## 修复方案 v1（历史提案，当前结果见文末）

只修改 `describeTool('run_shell')` 的工具 description 和 command 参数 description：说明每次只提供一个程序及其参数；按 argv 直接执行，不经 shell；`&&`、`;`、`|`、重定向和变量/命令替换不会按 shell 语法执行；多命令分开调用。工具描述保留 ShellGate 明确 allow 才执行的要求。参数字段、工具名、能力注册和所有 handler 不变，不新增 promptGuidelines 或 executionMode。

拟采用工具说明：

> 受治理的程序执行工具。每次调用只执行一个程序及其参数，按 argv 直接启动，不经 shell。`&&`、`;`、`|`、重定向、变量展开和命令替换不会按 shell 语法执行；多条命令请分开调用。执行前必须过 ShellGate 审核；未获明确 allow 绝不执行。

拟采用 command 参数说明：

> One program and its arguments, reviewed before execution as argv without a shell. Shell operators (&&, ;, |, redirection), variable expansion and command substitution are not interpreted. Use separate tool calls for multiple commands.

## 变更与验证范围

- 允许写：`src/provider/runtime/schema.ts` 上述两个说明字段、本记录、`角色卡/运行时核心/docs/feature/runtime-core.md`、`角色卡/运行时核心/memo.md`、`角色卡/运行时核心/changelog.md`，及本角色 docs/fix 下本次验证日志/指纹。
- 保护：splitCommand/classifier/spawn、Model、外部角色、p-limit 项目与测试文件。无权限/拒绝策略变更，无 shell:true。
- 不新增字符串镜像断言。既有 `test/runtime-core/tools.test.ts` 运行真实 handler 和子进程；`test/pi-adapter/run-shell.test.ts` 覆盖审核/真实执行/凭据剥离；既有 wiring 测试覆盖装配传递，复用它们即可。说明的清楚程度由人工 diff 审阅及独立真实桌面最终 probe 验证，不能由文字断言假装证明模型会遵守。
- 本角色回归命令：`node --test 'test/runtime-core/*.test.ts' test/pi-adapter/run-shell.test.ts test/测试/wiring.test.ts`、`npm run typecheck`、`git diff --check`。记录源码/依赖指纹、Node 版本和当前候选，测试通过后交独立测试角色复验真实桌面工具说明传递与分开执行。
- 验收：两字段准确反映既有执行、回归与类型检查通过、原桌面证据保留；真实桌面最终 probe 由测试角色提供，不能由核心单测代替。无选装内容。

提案记录时仅完成调查与方案；后续实施与验证见文末，未部署。

## 同轮重复显示只读调查（独立缺陷，不纳入本项改动）

客户随后要求核查工具及回交重复。Core `src/service/runtime/session.ts:73-77` 只包装 handler 的 signal，`:125-136` 对 inner 每条非 settled 事件转发一次，不另外生产 tool_call。`runtime/tools.ts:758` 的 report callback、`:822` 的 dispatch callback 每次 handler 各调用一次；没有额外事件 emitter。此静态证据不能独立证明真实桌面没有再次调用 handler，最终须对比实际 turnId/toolCallId 和 callback 次数。

Pi 的 `src/common/pi-adapter/real-adapter.ts:433-438` 在 tool_call hook 产生“模型请求调用”事件，只含 toolName/path，缺 toolCallId；`:475-480` 在 execution_start 又产生“开始执行”事件，含 toolCallId/turnId。两者都是 tool_call，是同次工具生命周期的双生产；缺 ID 的前一条无法安全靠 call 身份合并。Codex `src/provider/codex/session.ts:310` 与 Claude `src/provider/claude/session.ts:173` 各只在实际 handler 前生产一个 tool_call。问题已回交项目管理，Pi 生产文件属该角色，只读，不在本角色修复范围；界面与窗口角色须分别核查呈现和回交投递，不能按摘要文本猜同一次调用。

## 输入回声与确认卡身份修复方案 v2（已按统一评审实施）

工具说明小项保持 v1 两字段范围。客户另明确要求修复全部重复显示，新增以下同属 Core 的必要身份修复方案；以下保留当时方案，当前实施结果见文末。

实际 Core 每轮持久化 `kind:user` 原始输入，而 Pi `makeRolePrompt` 另外 emit `kind:message` 输入回声。Window/UI 不能仅凭“用户指令：”前缀判断这是原始输入：助手也可能说同样文字。Codex/Claude 没有同款回声，自动派发/回交投递的 live 输入也需一致展示。

拟由 Core 作为统一生产者：在实际 `prompt` 完成开始通知、原 user 持久化并检查原 signal 后，`inner.prompt` 前 emit 恰一次 `message`，detail 使用新中立类型 `PromptInputEventDetail`，内容 `{source:'prompt-input', text:原始text, imageCount?:number}`，顶层 runtime/roleId/turnId 来自该实际 Core 轮次。summary 保留原输入可读形式；imageCount 只在非空图片时携带，原图片对象继续透传，不记录图片数据。Model `SessionEvent` 的既有 kind/detail 形状不变，额外导出该 detail 类型作为可信来源约定。Core 不根据正文前缀过滤任何 inner message。

Pi 原属主已独立同意：私有 `emitPromptInput?:boolean` 默认 true，直接/旧 helper 输入回声保持原正文并附同 source/text/imageCount 与 lifecycle turn；Core 注入生产路径明确 false，避免双生产。demo 公共适配器在存在实际 `options.currentTurnId()` 时由 Core 负责回声；直接 standalone 缺实际 turn 时保留原可读输入回声并附 typed detail，不虚构 turn ID。Codex/Claude 没有旧回声，沿原 handler/SDK 流不改，由 Core 得到同样 live 输入。

Window 原始 replay user 与有 source 标记的 message 均归一为 `user-input`，只在权威同 turn 身份下表示一次输入；UI 对 direct/queued/programmatic 输入按同身份合并，同文不同 turn 均保留。旧数据没有标记时维持可读，不按前缀回填。历史 user 与 echo 仍保留原记录，属于同一轮两种记录表示，UI/Window 负责呈现一次，不删审计。

确认/选择卡需要关联实际 tool 调用。拟为 `CustomerInputMetadata` 兼容增加 `toolCallId?:string`，在两个 handler 的入口把原始 `call.toolCallId` 与已有 signal/turn/role/runtime 一起交给 callback。不产生新 ID、不读取最新轮次、不改变权限或取消判断。旧 callback 不用该字段仍有效，缺 callId 保持缺席；Window 只在实际存在原 turn/call 时映射卡，UI 不依据标题正文猜重复。

本角色追加精确写集：`src/model/runtime.ts`（detail 类型、metadata 可选 callId）、`src/service/runtime/session.ts`（单次输入事件）、`src/provider/runtime/tools.ts`（demo 生产回声与确认/选择 metadata）、`test/runtime-core/session.test.ts`、`test/runtime-core/customer-input-context.test.ts`（必要实际行为回归），以及本角色 `api-spec.md`、既有本记录/feature/memo/changelog 与 docs/fix 证据。保护 splitCommand/classifier/spawn、门禁与外部角色文件。Pi/Window/UI 由各属主各自实施；sessionInstanceId 不在 Core 写集。

新增测试必要性：本次新增可观察输入事件与 metadata，需要真实 Core/注入 Provider 证明同文两轮两组不同 actualturn、每轮一次输入、direct/queued 消费原始身份、前置拒绝无输入、onTurnStarted 抛错无输入、真实助手前缀文字保留、原图片引用继续透传；确认与选择 callback 应拿到同一个入口原 callId/signal/turn。它们不是复制字符串断言。跑全 Core 既有回归、Pi shell、wiring 与 typecheck；独立测试角色复验桌面 live/history、工具/确认/回交等全部行为。新行为生效前旧集成结果作为历史，不能提前宣称通过。

## 当前实施与属主验证

项目管理[统一 r1](../../../项目管理/docs/fix/2026-10-15_fix_duplicate-event-integration-review.md)评审后，root 按客户“核查所有重复都修”的既有缺陷修复授权派发本角色上述范围；这不是客户逐字确认本新文档。Core v2 已实施，shell 仅两字段改变；Model 新增 detail 类型与 optional toolCallId，Service 统一输入事件，demo 生产抑制自身回声，确认/选择入口捕获原 callId。新输入 detail 同时带实际 turnId，保持已有所有事件 top/detail 同源契约。

Node v24.14.0 / macOS 工作区：新增实际行为红测试先出现预期的两项 metadata 缺失和两项输入身份失败。首轮实施又被已有 Service event top/detail identity 断言查出新输入 detail.turnId 遗漏；保留原断言并补同一个 actualturn 后转绿，没有放松断言。窄 session/customer-input/tools 24/24；全 Core + Pi run-shell + wiring 57/57，npm run typecheck exit 0、git diff --check exit 0。

另通过真实 run_shell handler + allow 审核 + Node 子进程观察 && ; | > $HOME $(pwd) 全部作为字面 argv 输出，exit 0；没有 shell 展开、重定向或多命令执行，执行实现未改。此 probe 证明说明反映旧契约，不证明线上模型一定遵守说明。

原始日志与精确候选见[证据目录](2026-10-15-core-input-identity-evidence/manifest.json)。Pi/Window/UI 后续候选及独立真实桌面 probe 仍由各原属主/测试角色提供；不把 Core 本地结果当最终整合验收。未部署。
