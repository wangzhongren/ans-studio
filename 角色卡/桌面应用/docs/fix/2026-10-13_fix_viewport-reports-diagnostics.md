---
id: viewport-reports-diagnostics
type: fix
title: 修复长会话空白与重复报告展示，并接入24小时统一诊断日志
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [desktop-three-pane, background-rebuild-active-session, handback-report-card]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户真实使用反馈后，仅调查桌面空白机制、重复报告路径及共享日志接线，等待项目管理统一设计
  - date: "2026-10-13"
    kind: implemented
    summary: 客户直接授权、canonical v1评审后实施视口/报告/日志/显式恢复与委托检查接线
  - date: "2026-10-13"
    kind: verified
    summary: 真实Electron可见行、异常边界、报告和恢复/mac重开全部通过；角色201/200/1保留既有目录名环境失败
---

# 用户应看到主入口的结果汇总，长会话上翻时也应有内容

桌面角色方案 v2 已按[canonical v1](../../../项目管理/docs/design/2026-10-13_design_runtime-diagnostics-and-reporting.md)评审及客户直接修复授权实施。客户真实项目测试已停止，临时真实项目已由协调方删除；本次验证只用离线窗口、demo句柄与临时日志，没有恢复真实模型造项目。

相关功能：[桌面工作台与会话](../feature/2026-10-11_feature_desktop-three-pane.md)。保留上一轮活动会话修复与既有 `refreshListing` 未提交补丁。

## 已查明与尚未查明

**长聊天区空白有具体机制。** 用户上翻长会话时，`streamShouldPin` 正确得到“不应滚底”，但 `registerRow` 的非批量路径仍用 `updateVirtualWindow(..., {preferTail:true})`。批量收尾 `flushBatchSideEffects` 同样对所有脏 pane 固定挂尾行，未考虑该角色的 `streamPin.pin=false`。因此卸载了用户视口内的行，换成巨大的空 spacer，却保留原滚动位置。轮末 Markdown 升级也会标脏而进入这条收尾。

2026-10-13 只读提取当前生产 `updateVirtualWindow` 函数做受控 Node VM 探针：300行、每行40px、scrollTop=0、视口200px。现有固定尾窗口得到 top spacer=9560px、首挂载行239、视口可见挂载行0；按当前视口更新得到 spacer=0、首挂载行0、可见行5。此证据支持聊天区空白，不等于已复现 Electron 整窗崩溃或所有客户白屏原因。历史 S-1 验证只检查“没有被拽到底”，没有检查当前位置真的有行。

**整窗加载失败/渲染进程退出尚未证实。** `main.ts` 没有 `did-fail-load`、`render-process-gone`、`unresponsive`、`preload-error` 记录，`loadFile` 没有业务层失败反馈。renderer 没有顶层 `error`/`unhandledrejection` 诊断。批量事件和回放已有 `finally` 恢复 `batchDepth`，不能把“永久批量锁死”当已查明根因；但一条事件抛错会中断当前批后续条目，且跳过末尾 flush。`appendHandback` 对非数组 evidence 直接 `.map` 是可定位的异常入口，但当前真实报告是否含这种载荷未证实，不据此虚构客户崩溃原因。回放已有同份 skip/增量 append/full 重建，不重复再造一套回放去重。

**主入口同报告双展示路径已确认。** 项目角色的 `handback` 经 `appendOneEvent` 一面给来源角色放结构化报告，一面提前镜像到 su；与此同时 `SessionManager.handleHandback` 将编排生成的文本送入现有 su 队列，真正 send 后适配器回显 `[回交]`，renderer 又显示完整注入正文。镜像会在实际投递前出现，所以 su 忙或等待 `request_choice` 时，卡片不代表 su 已处理或已汇总。

**回交投递本已存在，不能再建另一套。** `consume → handleHandback → enqueueDelivery → drainQueue` 已按编排 `handbackKey` 判重；目标 busy 时等待 settled，失败保留队首。客户所见 su 两条待办且等待选择，对应这条真实等待，不是桌面缺少汇总触发。回退报告内容/提示由编排负责，120s prompt 等待确认计入超时由 Pi 角色调查；桌面不推导“完成/阻塞”，不绕过客户选择或授予写权限。

## 实际修复

1. **修正窗口定位。** 只有显式滚底或该视图进入前就在底部才使用尾窗口。用户上翻时，新实时输出、合帧收尾、轮末 Markdown 升级按实际视口实体化，保留可见阅读内容。切角色/重复点击的 U-1 和未决卡 P-1 定位仍走显式路径；首次挂载邻近行会修正估算高度，因此卡定位在实体化后用实际卡/视口rect再校准，确保卡内容及按钮可见，不停在旧prefix位置。普通阅读不按固定scrollTop判定：独立样例同一首行文本、相对位置仅差0.0625px，虽scrollTop因总高修正变化，内容锚点未被拽动。窗口阈值、历史格式或行模型没有改。
2. **主入口只留一次报告输入与真实汇总。** 建议删除提前镜像 su 的完整报告卡，保留来源角色自己的报告供查看；su 真正收到的回交输入显示一条默认收起的详情，正文仍完整送模型。客户重点看 su 自己的结果汇总，内容由编排提示与真实助手回复产生，桌面不拼接伪造结论。排队/进行中仍沿现有快照，不把未投递标成“已汇总”。该展示选择交协调方统一裁定后实施。
3. **关键路径统一诊断。** 只消费项目管理提供的 `src/common/shared/` logger；24小时过期清理/滚动存储/时钟归其唯一实现，桌面不自建日志文件或存储。main 接加载起止/失败、renderer 进程退出、preload 异常、无响应/恢复、IPC 起止与错误；session 接 open/send/rebuild/stop、回交到达/去重/排队/目标忙/送达/失败；交互通道接请求呈现、响应校验、挂起数与关闭收口。renderer 通过受限 preload 通道上报 JS 异常及窗口化/回放动作的数量与分支，不接触文件系统。
4. **异常处理区分恢复与诊断。** 对已查明空白直接修定位。事件边界记录错误并让剩余合法条目继续、保证收尾执行；不吞掉原错误，不将 malformed 报告正常展示。main 对页面失败/renderer 退出显示明确故障页，用户点击“重新加载界面”才恢复已知项目/角色，用 list+select 续接已有会话，不关闭正常后台或重发prompt。客户/shell通道 `replayPending()` 只重推仍pending的原id，不代答、不重建定时器、不复活已结束许可。macOS关闭窗口后，自有IPC注册器准确移除该窗口成功注册的通道，再建窗不会重复注册；未移除其他通道。没有自动重启循环或通用会话取消框架。
5. **su 空闲时把连续已到达回交交给同一轮验收。** 同项目、同 su 队列的队首连续 handback 一次形成输入；遇客户 message/dispatch 立即停止，其他角色队列不合批。客户真实现象是 su 已积压两条报告：每份各开一轮会拆散同一组验收/汇总，因而本次采用这段必要合批。但不等待未来报告，不把“已到达两份”说成“所有角色完成”。正文由编排提供，不在桌面独立生成汇总或完成结论。

日志仅结构化元信息：角色/项目关联、事件名、耗时、错误代码/经共享模块处理的错误摘要、队列长度、请求关联 id、回放行数/skip-append-full、窗口首尾行/可见数量。默认不记录用户正文、报告证据全文、工具参数/输出、图片、token、环境值或完整配置，不整包 JSON dump IPC。普通已授权操作的政策由宿主对已接受配置的项目角色实际注入 `routineShellPolicy={enabled:true,projectRoot,authorizationSource:'customer-delegated-routine-checks'}`；su只读会话不传，未接受配置不传。精确命令+b允许的匹配仍由编排单一实现，桌面不加第二套批准缓存，不绕过c硬拒或危险操作确认。

## 已收到的跨角色契约

项目管理提供 `src/common/shared/diagnostics.ts`：main 先 `configureDiagnostics({directory, clock?})`，目录建议为 `path.join(app.getPath('userData'), 'ans', 'diagnostics')`，避免 Electron 共用 userData 时混入其他应用。消费方 `createDiagnosticLogger({component, projectRoot?, roleId?})` 得到 `record(event, fields?)` 与 `error(event, error, fields?)`；测试/退出用 `flushDiagnostics()/disposeDiagnostics()`。未配置 no-op；异步串行 JSONL；启动/每分钟/写入清理超过24小时条目；失败不抛业务，通过 `getDiagnosticsStatus()` 如实查目录、留存窗口与 lastError。清理与净化只保留共享实现，本角色不复制。

窄 renderer IPC 仅接有限事件名及白名单 `state/count/queueDepth/durationMs/errorType/errorCode/errorMessage/requestId/decision/reasonCode` 等元信息，经限长与共享净化后写入；不允许渲染侧传 directory、任意 component/path/对象 dump。会话内部 logger 可用 `turnId/toolName/path/outcome/reportSource/pid` 等 canonical 字段；正文与凭据禁写。全局 JS 异常捕获尽早注册，不依赖故障中的 pane 或 Markdown 构造成功。

编排提供公开 helper：`renderHandbackBatchPrompt(handbacks: readonly TaskHandback[]): string`，与既有 `renderHandbackPrompt` 同模块导出，保留 `[回交]` 分类前缀。每份 status/summary/evidence/reportSource 等原值来自编排，不在桌面复算。单份继续用既有 helper，旧无 handback 对象的条目不强行转成批报告。

桌面 `DeliveryItem` 私有保存真实 handback 对象。投递前检查句柄、busy、边界，随后只取队首连续回交；合成正文成功后再一起出队，原 dedupKey 永久判重集合全保留。失败按原顺序将整个前缀放回队首，不丢任何报告、不打乱后来的消息。已有 running 视图仍为一条正在执行的输入：summary 明确列出实际来源与数量，full 为完整批正文，内部关联保留所有原条目/键；不为报告撤回新增权限，不扩张公开队列或 IPC 形状。单份回交、派发、客户消息的返回值和顺序保持。

## 拟写集与依赖

全部落在本角色 accepted `app/`、`test/桌面应用/` 及角色文档范围内。

| 拟改文件 | 用途 |
| --- | --- |
| `app/renderer/renderer.js` | 窗口定位、报告单一展示、错误边界与受限诊断上报 |
| `app/renderer/styles.css`（未改） | 已有details样式足够，未引入视觉重做 |
| `app/main.ts` | Electron 生命周期及 IPC 诊断接线与已裁定故障反馈 |
| `app/preload.cjs` | 受限结构化诊断通道，不暴露 Node/logger 对象 |
| `app/desktop/diagnostics.ts`（新） | main/离线窗口共用生命周期与自有IPC清理接线、窄诊断校验、明确故障页 |
| `app/desktop/interface.ts`（本次未改）、`session.ts` | 保留原refreshListing补丁；session消费logger，合批与委托检查政策实际接线 |
| `app/desktop/customer-input.ts` | 交互挂起、呈现、响应及关闭节点诊断 |
| `app/desktop/operator-channel.ts` | shell仍pending的同id只读重推及其诊断，不延长许可或代答 |
| `test/桌面应用/renderer.test.ts`、`hot-path.test.ts`、`handback-delivery.test.ts`、`dispatch-delivery.test.ts`、`e2e/main.mjs` | 窗口定位、报告合批/消息顺序、契约及真实离线前端验证 |
| `test/桌面应用/diagnostics.test.ts`（新） | 控制 logger 替身，验证关键分支及不含正文/敏感值 |
| `test/桌面应用/operator-channel.test.ts` | 自有窗口IPC注册器与新公开类型导入的必要静态钉更新，决定回包契约保持 |
| 本文、现有工作台 feature、feature-map/memo/changelog/api-spec | 完成后维护真实行为、诊断桥和证据 |

共享日志实现与24小时存储测试归项目管理，只读依赖；编排的报告真实性/汇总提示、Pi 的等待超时修复只读。没有跨角色源码写入；不动 package/依赖/治理边界。

## 可执行离线验收

- 真实 Electron 长聊天（超过150行），上翻到顶部与中部，收到单条、批量输出以及 settled：scrollTop 保持，并且视口内**实际挂载行数量大于0**、文字可见；在底部时继续贴底，点击角色滚底、未决卡定位保持。
- 通过既有回交事件及受控句柄，su 忙/等待时证实排队且未投递，释放 settled 后恰一次收到完整编排 prompt；主入口不会再同时出现镜像完整卡和注入完整卡。助手汇总按真实消息呈现，不由测试/前端假造验证结论。新轮同文报告、同轮重放沿编排 key 语义验证。
- 连续 A/B 报告在 su 空闲后一次输入，完整内容和原键保留；A报告→客户消息→B报告绝不跨消息合批；批投递失败恢复同序，重试成功恰一次送达且没有丢报告。进行中 summary/full 与实际批数相符；派发与客户消息的原回归保持。
- 真正加载 renderer/preload，以失败注入验证一条坏事件不丢同批其他合法行，日志捕获 JS 异常、回放/窗口分支；加载失败/渲染进程退出使用离线控制事件验证故障反馈，结果与日志相符。
- logger 替身断言加载、会话、回交、交互请求/响应关键事件及元信息；毒丸 token/用户正文/图片传入产品流程，日志不能包含这些值。共享24小时过期测试引用项目管理的实跑证据，不把接口接通当留存已验证。
- 类型检查、相关桌面单测与 Electron 本次行为断言实际运行；无真实模型、无真实客户项目、无新的数据存储副本。既有目录名环境红单独保留，不通过放松断言处理。

## 本次调查基线与状态

HEAD `e3d9997e2918117239029d17b7db34f83b90b7a3`，package 1.0.0，Node v24.14.0 / Darwin arm64。上一轮稳定 session sha256 `32ace95d1f43fae58962ed338426a07e8f783ed2882cbe1087494ac959e30180`，renderer `e58d46e0f82a62e632cb6c8069d201902e4c20dab7ca12885ed9eca28567467c`；main `53932553d534297cb75855a79e604cb486f8ab1cb3fd06b7c93a0e72cc675ac7`，preload `9e6e1eab5c14e3524b47a069ddb7762ff9715aae995e5d0ceeababb54fb58e92`。

## 实际验证与候选

- `npm run typecheck`、`node --check test/桌面应用/e2e/main.mjs`、`git diff --check` 与原首轮寻址patch的 `git apply --reverse --check /private/tmp/ans-session-preexisting-01a133d2.patch` 均exit0。
- `node --test test/桌面应用/diagnostics.test.ts test/桌面应用/handback-delivery.test.ts` **13/13**；包括日志隐私/窄桥、窗口自有IPC关闭清理、同id请求重放与真实答复/失效不复活、连续回交合批失败保留原序、客户消息屏障、实际宿主政策注入。日志：[专项](</private/tmp/ans-runtime-diagnostics-manager.log>)。
- `node --test "test/桌面应用/**/*.test.ts"` 在最终P-1校准候选重跑，**201计/200过/1失败**，唯一仍为 `pi-config.test.ts:60` 要求 `ans-cli/.env` 而仓库名为 `ans-runtime` 的既有环境断言；未改其逻辑或断言。[角色全套日志](</private/tmp/ans-runtime-diagnostics-desktop-p1-final.log>)。renderer+hot-path最终 **45/45**，[相关日志](</private/tmp/ans-runtime-diagnostics-viewport-p1.log>)。
- 最终真实离线Electron命令：`ANS_E2E_OUTDIR=/private/tmp/ans-runtime-diagnostics-e2e-p1-final node_modules/.bin/electron test/桌面应用/e2e/main.mjs`。[报告](</private/tmp/ans-runtime-diagnostics-e2e-p1-final/report.txt>) `E2E_DONE=1`、无ERROR/WATCHDOG；三个顶部/中部可见行断言、坏事件后合法消息与flush、报告单一/默认折叠/中文状态、故障页按钮/项目角色续接/pending同id一次/旧请求可答/不代答或自动重发/已结束不复活、关键日志、mac关闭后重开全部true。追加450行冷窗口后上翻再显式同角色点击，`PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE=true` 实际检查卡全文和确认按钮rect都在视口。原SESSION_REPAIR 11项与U-1/P-1保持通过。
- 首轮Electron用例因测试局部handler注册器作用域失败；随后重开测试因close()后未等真实closed事件而先于清理注册，失败保存在旧报告。本次只修测试时序/接线，没有删弱断言；最终按真实closed→再建窗验证通过。共享滚动24小时清理由项目管理的专项7/7独立证据负责，桌面不把桥接成功当存储留存证明。
- 源码已冻结交独立验收，sha256：main `5289e3f1df80ec43d8f481231f80280e3a369ff78edb5e88e3354143362d2573`；preload `53fbb3a491845f4189df2781c3f68438f2c85681b852052514a3a022697e6f19`；diagnostics `0c783e7173f890701afb25f3672e9a70d65efe1c823dc176696344e3c2e6739f`；session `f1ef0fcb9fcdd24f6cd4c230e5adf18fe96512895cd3145f71f6b6597c1db837`；customer-input `375f4d8220b746d72a56ca37dbe531fc729900d83ccbf4f24605f6da2b86581d`；operator-channel `a45b86f7221cf18ee0bc4f83e18afaa19f4d840ac292ed2d0f21f2820a1422f5`；renderer `959740486ba447272ef30a38c634e5b77d82e3dcd1e2ef8ad7907d024d47b191`。

本次已证实的聊天区空白与报告展示问题已修复并验证；完整Electron原始崩溃/加载失败原因尚未确认，现有诊断与显式恢复路径已实测。客户运行中的应用没有重新部署，本角色未提交或发布。
