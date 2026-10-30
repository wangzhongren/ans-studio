# 桌面窗口边界文档

本表与运行时读取的 `boundary.yaml` 条目一一对应；两者表达同一个 Section 1，不产生额外权限。未列路径默认只读。`role-card.md`、`boundary.md`、`boundary.yaml` 仅由 ANS Governance 维护。新增目录、改动归属或增删逐条列出的路径必须交 Governance 处理并取得客户授权。

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `app/main.ts` | Electron 主进程入口：建窗与窗口生命周期、IPC 注册、诊断与恢复接线 |
| 单文件 | `app/preload.cjs` | 受限 IPC 桥（contextBridge 白名单） |
| 目录 | `app/desktop/` | 桌面 Interface（主进程侧纯逻辑）：会话、项目装配、历史、交互、引擎配置、图片、批推与诊断 |
| 单文件 | `src/model/project-document.ts` | B 专属 Model 唯一主属：版本、文档引用、可信导入类型、请求/结果与错误类型；不含 IO |
| 单文件 | `src/pipeline/project-document/read-project-document.ts` | B Pipeline 公开入口：编排文档 reader 创建、scope 更新、读取与关闭 |
| 单文件 | `src/service/project-document/abstract/document-reader.ts` | B Service 抽象：受限文档服务接口与 Provider 所需读取条件 |
| 单文件 | `src/service/project-document/public/read-project-document.ts` | B Service 公开入口：创建/调用受限文档服务 |
| 单文件 | `src/service/project-document/impl/read-project-document.ts` | B Service 实现：唯一 scope registry、清单资格、预算/格式/编码政策与错误映射 |
| 单文件 | `src/provider/project-document/abstract/file-reader.ts` | B Provider 抽象：文件句柄事实与受限有界 IO 接口 |
| 单文件 | `src/provider/project-document/public/file-reader.ts` | B Provider 公开入口：平台文件读取能力工厂 |
| 单文件 | `src/provider/project-document/impl/file-reader.ts` | B Provider 实现：lstat/realpath/open/fstat、有界 read/close 与平台能力检查 |
| 单文件 | `test/桌面应用/ans-wiring.test.ts` | 主进程侧测试：`.ans` 生效配置接线 |
| 单文件 | `test/桌面应用/boundary-refresh.test.ts` | 主进程侧测试：边界陈旧重建 |
| 单文件 | `test/桌面应用/composer-images.test.ts` | 主进程侧测试：图片校验与 Interface 接线 |
| 单文件 | `test/桌面应用/diagnostics.test.ts` | 主进程侧测试：诊断与交互通道 |
| 单文件 | `test/桌面应用/dispatch-delivery.test.ts` | 主进程侧测试：派发投递机 |
| 单文件 | `test/桌面应用/dispatch-fresh-enum.test.ts` | 主进程侧测试：派发前新鲜枚举 |
| 单文件 | `test/桌面应用/genesis-bootstrap.test.ts` | 主进程侧测试：创世态配置 |
| 单文件 | `test/桌面应用/handback-delivery.test.ts` | 主进程侧测试：回交自动投递 |
| 单文件 | `test/桌面应用/hot-path.test.ts` | 主进程侧测试：合帧批推/状态去抖 |
| 单文件 | `test/桌面应用/interface.test.ts` | 主进程侧测试：Interface 处理器 |
| 单文件 | `test/桌面应用/message-queue.test.ts` | 主进程侧测试：消息队列与状态快照 |
| 单文件 | `test/桌面应用/operator-channel.test.ts` | 主进程侧测试：操作者确认通道与 arm 分发 |
| 单文件 | `test/桌面应用/operator-wiring.test.ts` | 主进程侧测试：交互通道与锚点键 |
| 单文件 | `test/桌面应用/p0-halt-and-images.test.ts` | 主进程侧测试：停止/图片端到端 |
| 单文件 | `test/桌面应用/pi-config.test.ts` | 主进程侧测试：Pi 配置读写纪律 |
| 单文件 | `test/桌面应用/project.test.ts` | 主进程侧测试：枚举构造 ProjectConfig |
| 单文件 | `test/桌面应用/queue-withdraw-lru.test.ts` | 主进程侧测试：撤回与 LRU |
| 单文件 | `test/桌面应用/session-history.test.ts` | 主进程侧测试：JSONL 解析与锚点 |
| 单文件 | `test/桌面应用/session-rebuild-race.test.ts` | 主进程侧测试：并发重建竞态 |
| 单文件 | `test/桌面应用/session.test.ts` | 主进程侧测试：会话开启/多轮/保活 |
| 单文件 | `test/桌面应用/su-effective-boundary.test.ts` | 主进程侧测试：su 生效边界 |
| 单文件 | `test/桌面应用/e2e/main.mjs` | 桌面端到端总自检台（真实 Electron） |
| 单文件 | `test/桌面应用/multi-runtime.test.ts` | 多引擎会话隔离、路由、设置及恢复契约测试 |
| 单文件 | `test/桌面应用/project-document.test.ts` | B 专属测试：服务/Provider 预算、编码、句柄竞态、grant/scope 与引用失效 |
| 单文件 | `test/桌面应用/acceptance-dispatch.test.ts` | 主进程侧测试——自动验收证据门、触发面与持久化去重（interface/governance-advance） |
| 单文件 | `test/桌面应用/runtime-resolution.test.ts` | 主进程侧测试——自动派发/冷启动引擎解析优先级、per-project 持久化与「无法确定时不派发」 |
| 单文件 | `test/桌面应用/task-restart.test.ts` | 主进程侧测试——任务/报告/未决申请重启恢复（`request.orphaned`/`approval.expired`；结果只通知、任务回投，不自动执行原动作） |
| 单文件 | `test/桌面应用/star-routing.test.ts` | 主进程侧测试——星形派发/汇报路由：幕僚→任意角色、任意→幕僚；角色间无工作派发/汇报、运营无 dispatch |
| 单文件 | `test/桌面应用/chief-workflow.test.ts` | 主进程侧测试——幕僚任务卡字段、短报截断/合批、项目 worker 直接汇报、系统通知 |
| 单文件 | `test/桌面应用/role-log.test.ts` | 主进程侧测试——每角色日志写入点/格式/脱敏/轮转/坏行跳过（不写密钥/完整 prompt） |
| 单文件 | `test/桌面应用/log-patrol.test.ts` | 主进程侧测试——10 分钟日志巡检 tick 计数、巡检消息、只列 working、防重入跳过与连续跳过日志 |
| 单文件 | `test/桌面应用/log-stuck.test.ts` | 主进程侧测试——最后日志慢/卡死阈值、长任务正常日志不误杀、等待态暂停、`role_activity_log` 读取 |
| 单文件 | `test/桌面应用/stuck-redispatch.test.ts` | 主进程侧测试——卡死判定→终止→任务标失败→重派（同角色/新角色）→`retryOf` 链→上限 2→应用决策升级 |
| 单文件 | `test/桌面应用/stuck-redispatch-safety.test.ts` | 主进程侧测试——终止/重派副作用安全（子进程树/幂等/部分写入） |
| 单文件 | `test/桌面应用/log-actions.test.ts` | 主进程侧测试——幕僚提醒/终止/重派/换人/上报客户；应用执行、日志、去重与风暴护栏 |
| 单文件 | `test/桌面应用/watchdog-reuse.test.ts` | 主进程侧测试——既有四信号与 `log-silence` 不重复告警、主人改为幕僚、tick 复用、自动中止默认关 |
| 单文件 | `test/桌面应用/application-line.test.ts` | 主进程侧测试——角色直接提交申请：来源角色、应用呈现/裁决、系统通知幕僚、结果回角色（幕僚不转发/不代答） |
| 单文件 | `test/桌面应用/decision-service.test.ts` | 主进程侧测试——两开关、decision 卡按唯一推荐代选、approval 卡按现有 rubric、关闭客户卡、fail-closed、judge 代批审计 |
| 单文件 | `test/桌面应用/pending-card-restart.test.ts` | 主进程侧测试——申请/审批卡快照持久化、重启回待办/对话框、无原 tool call 的结算与回投、shell/审批卡不重放、requestId/approvalId 幂等 |
| 单文件 | `test/桌面应用/write-safety.test.ts` | 主进程侧测试——边界内预授权/边界外拒绝/`.ans` 禁写、appointment-write 审批与结构校验失败不落盘、写后刷新、负例（内置 id/越界/重叠） |
| 单文件 | `test/桌面应用/optional-acceptance.test.ts` | 主进程侧测试——可选验收链路：幕僚调度→质检/交付角色直接提交→judge/客户 |
| 单文件 | `test/桌面应用/chain-enforcement.test.ts` | 招人链/前置校验（意图文档→名单→D3→交付运营）负例与顺序断言 |
| 单文件 | `test/桌面应用/run-pin.test.ts` | 主进程侧测试：run 冻结——draft→pin 同 runId、pin 前 handoff 拒绝、pin 后只读 pinned、mid-run 新版本不激活与并发 pin，含 pin/run-change 负例（session/interface） |
| 单文件 | `test/桌面应用/run-change.test.ts` | 主进程侧测试：run-change 复用 decision 卡三路径（continue-frozen/stop-and-restart/stop）与 approve/reject/cancel 映射（customer-input/session） |
| 单文件 | `test/桌面应用/rejection-copy.test.ts` | 主进程侧测试：拒绝三段式文案——code/missing/action/owner/docs/retryable、客户卡只人话、系统行折叠技术 code（session/interface/customer-input/operator-channel） |
| 单文件 | `test/桌面应用/acceptance-evidence.test.ts` | 主进程侧测试：验收证据自洽——AcceptanceFact/P0 派生、sidecar 重算、evidence_check、mismatch 负例（AC-28）与未校验标识（interface/session/customer-input） |
| 单文件 | `test/桌面应用/turn-lease.test.ts` | 主进程侧测试：turn lease——origin 不覆盖、settled 按 turnId 兜底清 busy、补 delivery.end/failed、stop 强制复位投递 origin/busy/activeDeliveries 与空闲-busy 楔死自愈（P0，session） |
| 单文件 | `test/桌面应用/queue-visibility.test.ts` | 主进程侧测试：队列可见性——ageMs/headKind/blockedReason/activeTurnId、drain/age/depth 与 role-state 队列字段（P0，session/interface） |
| 单文件 | `test/桌面应用/abort-unwedge.test.ts` | 主进程侧测试：手动停止强制解开 target-busy 楔死——abort 复位 origin/busy/activeDeliveries、队列排空且不重复投递（P0，session/interface） |
| 单文件 | `test/桌面应用/request-timeout-wiring.test.ts` | 主进程侧测试：请求超时接线——首字节/流空闲 deadline 的失败终态系统行/短报，不伪造成功（P1，session/interface） |
| 单文件 | `test/桌面应用/network-monitor.test.ts` | 主进程侧测试：网络监听——net.isOnline/5s 采样、powerMonitor suspend/resume/lock/unlock、1s 稳定窗口与连续 2 次离线判定、离线 fail-fast/安全暂停/恢复重试窗口/锁屏≠离线（P2，main/interface/session） |
| 单文件 | `test/桌面应用/replay-safe-retry.test.ts` | 主进程侧测试：仅 replay-safe 同 turn 安全重试——重试失败/终态/短报、不重复 settled/handback、取消优先（P3，session/interface） |
| 单文件 | `角色卡/桌面窗口/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/桌面窗口/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/桌面窗口/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/桌面窗口/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/桌面窗口/api-spec.md` | 实现报告（IPC 通道与导出） |
| 目录 | `角色卡/桌面窗口/docs/design/` | 设计记录 |
| 目录 | `角色卡/桌面窗口/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/桌面窗口/docs/change/` | 变更记录 |
| 目录 | `角色卡/桌面窗口/docs/fix/` | 修复记录 |

边界纪律（与 boundary.yaml 顶部注记同义）：

- 写资格判定一律调门禁引擎，Pi 调用一律经 Pi 适配器；本角色不得出现第二份写门禁。B 的阅读清单与句柄校验不授予写权。
- B 仅含上述 8 个 Model/lowerlayer 单文件与 1 个新增测试单文件；不授权整个 `src/`、各层目录或 `common/`。B 的唯一 Model 主属、各层职责和必读合同见本角色卡及 functional-description。
- preload 不暴露任何 Node 能力；通道增改须同步 `preload.cjs`、`main.ts`、渲染消费面与 api-spec。
- `package.json`、`README.md`、`bin/`、`tsconfig.json` 属装配角色；`app/renderer/` 属「桌面UI」角色。
- `角色卡/桌面应用/`（已拆分冻结）为只读归档，不在任何角色的写入面内。
