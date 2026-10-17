# Pi适配器功能导航

当前 Pi 功能与完整流程见 [使用 Pi 执行受治理角色任务](docs/feature/pi-runtime.md)，接口见 [api-spec](api-spec.md)。ANS-RUNTIME-V2 下中立类型、schema 与治理工具的唯一属主为运行时核心；Pi 只负责 SDK 转换、执行前工具白名单、资源封闭、原生会话与生命周期。下表保留既有功能的历史导航，生产工具执行均已迁到核心。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 运行时适配器与会话生命周期 | `RuntimeAdapter`/`RoleSession` 接口与 `createAgentSession` 装配封闭（显式 resourceLoader/settingsManager/sessionManager/modelRuntime，不读写 `~/.pi`；SettingsManager.inMemory 钉住压缩缺省）；会话持久化恢复（D-1，生产 `<项目>/.ans/sessions/<角色>/pi/native/`、旧档复制迁移、文件惰性落盘、目录不可写时明确报错不退化为不落盘）；`abort` 停当前轮（P0-2，可选成员）；图片 prompt 透传（K-2） | 已实现 | [session.ts](../../src/provider/pi/session.ts)、[real-adapter.ts](../../src/common/pi-adapter/real-adapter.ts)；[P0-2 变更记录](docs/change/2026-10-13_change_p02-abort-session.md)、[changelog](changelog.md)（2026-10-11、2026-10-13 条目） |
| 模型接入配置（contextWindow 与网关 500 修复） | contextWindow 解析（系统默认 500000——客户 2026-10-17 裁定，来源 explicit/env/default，非法值抛错）；模板克隆显式收窄 compat 五项（`tool_removal`/`tool_addition` 块不再生成——网关 500 根因修复）＋存量污染会话文件检测防御（跳过或如实新建，不静默） | 已实现 | [provider-config.ts](../../src/common/pi-adapter/provider-config.ts)；[changelog](changelog.md)（2026-10-11、2026-10-12、2026-10-17 条目） |
| 整轮时限：到点检查 + 1 小时最后兜底 | `promptTimeoutMs`/`ANS_PI_PROMPT_TIMEOUT_MS` 仅作看护到点检查、**不中止**主轮；主 prompt 与 G-5 重发用 `turnLastResortMs`（缺省 3600000，固定无 env，测试可注入），确认卡挂起期间暂停；F-3-a 截断收尾补发段仍按检查时限有界。错误面 `TURN_LAST_RESORT` 与普通超时区分；shell/确认/构造时限不变 | 已实现 | [timeout.ts](../../src/common/pi-adapter/timeout.ts)、[real-adapter.ts](../../src/common/pi-adapter/real-adapter.ts)、[turn-last-resort.test.ts](../../test/pi-adapter/turn-last-resort.test.ts)；[changelog](changelog.md)（2026-10-17 条目） |
| 中立契约旧路径兼容 | Operator / CustomerInput / ReportHandback / DispatchTask / ShellVerdict / `PromptImage` 等型的单一来源已迁到 Model；Pi 仅转出——编排/桌面按中立契约对接，禁跨角色导入私有 `common/`；`FinalizeStatus`/`FinalizeResult` 保留（编排仍消费） | 已实现 | [session.ts](../../src/provider/pi/session.ts)；[changelog](changelog.md)（2026-10-11 T20、2026-10-12 条目） |
| 受治理工具集与治理扩展 | read/write/edit 经 WriteGate 判定、写根恒等于项目根、未配置写根 fail-closed（只判定不落盘）；`run_shell` 独立 ShellGate、未注入即不注册、spawn 不经 shell 且剥离凭据环境变量、cwd 钉在项目根；扩展层 `tool_call` 钩子对 run_shell 为能力级 kill-switch | 已实现 | [tools.ts](../../src/provider/pi/tools.ts)；[changelog](changelog.md)（2026-10-11 T3/T7/T8a 条目） |
| 写类工具同批顺序化（W-1 丢写修复） | `write_file`/`edit_file` 钉 `executionMode:"sequential"`，防同批并行下 edit 抢跑 write 丢写（A/B 实测承重；含写类工具批整批转顺序） | 已实现 | [changelog](changelog.md)（2026-10-12 W-1 条目）、[write-sequencing.test.ts](../../test/pi-adapter/write-sequencing.test.ts) |
| 交互工具族 `request_confirmation`/`request_choice` | 客户确认制：未注入客户通道即不注册；等待缺省**不设超时**且不被每轮硬超时掐断（InteractionGate + withPausableTimeout，实证承重）；confirm 的 preview 必须列出将写出的具体路径（列路径 ≠ 获准，获准只认 `confirmed:true`）；同批写抢跑经 `executionMode` 端到端实测钉住 | 已实现 | [交互工具族变更记录](docs/change/2026-10-12_change_governed-interaction-tools.md)；[changelog](changelog.md)（2026-10-12 条目） |
| 交报告工具 `submit_report`（C-1） | 完成/受阻时把一句话结论＋证据交给注入的回交能力；失败措辞如实「未能交回」，绝不谎称；返回位接纳 `void`（fire-and-forget 接缝）；不写盘、不判定 | 已实现 | [changelog](changelog.md)（2026-10-12 C-1 条目）、[submit-report.test.ts](../../test/pi-adapter/submit-report.test.ts) |
| 派发任务工具 `dispatch_task`（H-1） | 只给 su：把自足任务文本交给注入的路由能力；写死「派发 ≠ 授权／任务自足／返工带证据」；roleId 语义校验归编排注入能力（本层只做非空句法校验） | 已实现（2026-10-14 测试夹具中性化为「示例角色」） | [changelog](changelog.md)（2026-10-12 H-1、2026-10-14 条目）、[dispatch-task.test.ts](../../test/pi-adapter/dispatch-task.test.ts) |
| 审读结论工具 `report_shell_verdict`（R-1） | 只给审读会话：verdict 三值枚举（allow/deny/unsure）结构化交回；「结论以本工具调用为准、正文里写不算」；不写盘、不放行任何命令 | 已实现 | [changelog](changelog.md)（2026-10-12 R-1 条目）、[shell-verdict.test.ts](../../test/pi-adapter/shell-verdict.test.ts) |
| finalize_bootstrap 收口提议工具（T36） | 只读历史：因无任何注入方成死代码，2026-10-12（A-4）**已整体删除**；「同意才落盘」现由交互工具族＋编排 writeSet/F4 承担 | **已删除**（墓碑 4 条防回归，含编译期 `@ts-expect-error`） | [墓碑用例](../../test/pi-adapter/finalize-bootstrap.test.ts)、[changelog](changelog.md)（2026-10-11 T36、2026-10-12 A-4 条目） |
| 写盘层：原子写与守卫（fs-write） | 写根守卫（realpath 前后两次复核、目标为链接/junction 一律拒绝）、Windows 名称安全、仅 UTF-8（BOM 保留、EOL 不归一）；rename 瞬时 `EPERM` 有界重试（根因：Windows 防病毒/索引器短暂持有句柄）——重试原语**已收归共享组件 6**（`src/common/shared/atomic-write.ts`，本层只委托、无第二实现） | 已实现（重试原语归共享） | [fs-write.ts](../../src/common/pi-adapter/fs-write.ts)、[共享 atomic-write.ts](../../src/common/shared/atomic-write.ts)；[changelog](changelog.md)（2026-10-11 EPERM/收归条目） |
| provider-config 与凭据红线 | 解析 baseUrl/modelId/apiKeyEnvVar/contextWindow（凭据只查**存在性**，不读取、不打印其值）；T27 红线：凭据可写入指定的本地 `.env`（已 gitignore、不入库），**绝不可写入入库文件、绝不可被打印/回显到日志或界面之外** | 已实现 | [provider-config.ts](../../src/common/pi-adapter/provider-config.ts)；[changelog](changelog.md)（2026-10-11 T27 条目） |
| 运行时结果生命周期与诊断 | 唯一 lifecycle 出口：等 promise 结果确定后再发布 completed/failed/aborted/timed_out（防 SDK「先 settled 后 reject」伪成功）；消费共享 `diagnostics.ts`、无自有 sink；模型错误只记稳定码不存 API 响应；abort 后清理超时锁定、清理失败隔离会话 | 已实现 | [修复记录](docs/fix/2026-10-13_fix_runtime-outcome-and-diagnostics.md)、[changelog](changelog.md)（2026-10-13 条目） |

## 说明

- 表中旧工具、schema 与 fs-write 记录保留为历史说明；当前生产处理器与权限保证见 [运行时核心](../运行时核心/docs/feature/runtime-core.md)。旧 `src/provider/pi/tools.ts` 是显式转出的兼容 facade，旧 fs-write 不在生产工具执行链。
- P1 当前迁移与最终验证见 [原始记录](docs/change/2026-10-14_change_pi-injected-runtime.md)。没有真实模型请求，也没有提交或推送。
- 原生恢复成功是核心 resumed；恢复失败重建是 recovered+warning。桌面旧用语须显式转换，ANS 回放不代表恢复模型上下文。

- 2026-10-15：工具与输入事件同源身份修复已实现，见[修复记录](docs/fix/2026-10-15_fix_canonical-tool-events.md)。
- 2026-10-15：Windows Release 中 shell 自终止的测试改为直接子进程事实对照，保持 POSIX 信号断言和 Windows 实际退出码，见[测试修复记录](docs/fix/2026-10-15_fix_windows-shell-termination-oracle.md)。生产行为未改。
