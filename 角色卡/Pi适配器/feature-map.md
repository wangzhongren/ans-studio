# Pi适配器功能导航

本角色负责的 **Pi 运行时适配器系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。本角色把 Pi 的 TypeScript SDK 包成 ANS CLI 的运行时适配器，实现 `RuntimeAdapter` 接口供编排使用；判定逻辑属门禁引擎，本角色只负责把它接到 Pi 的工具与 `tool_call` 钩子上。每份功能的稳定说明（当前流程 + 流程图 + 演变历史）将按约定在验收后建立在 `docs/feature/<feature-id>.md`——**当前待补**（`docs/feature/` 尚未建立）；本表先链本角色 `docs/` 下**实际存在**的当次变更/修复记录与 changelog 条目，代码位置以 `src/provider/pi/`、`src/common/pi-adapter/` 为准。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 运行时适配器与会话生命周期 | `RuntimeAdapter`/`RoleSession` 接口与 `createAgentSession` 装配封闭（显式 resourceLoader/settingsManager/sessionManager/modelRuntime，不读写 `~/.pi`；SettingsManager.inMemory 钉住压缩缺省）；会话持久化恢复（D-1，`<项目>/.ans/sessions/<角色>/`、文件惰性落盘、目录不可写时明确报错不退化为不落盘）；`abort` 停当前轮（P0-2，可选成员）；图片 prompt 透传（K-2） | 已实现 | [session.ts](../../src/provider/pi/session.ts)、[real-adapter.ts](../../src/common/pi-adapter/real-adapter.ts)；[P0-2 变更记录](docs/change/2026-10-13_change_p02-abort-session.md)、[changelog](changelog.md)（2026-10-11、2026-10-13 条目） |
| 模型接入配置（contextWindow 与网关 500 修复） | contextWindow 解析（默认 32768，来源 explicit/env/default，非法值抛错）；模板克隆显式收窄 compat 五项（`tool_removal`/`tool_addition` 块不再生成——网关 500 根因修复）＋存量污染会话文件检测防御（跳过或如实新建，不静默） | 已实现 | [provider-config.ts](../../src/common/pi-adapter/provider-config.ts)；[changelog](changelog.md)（2026-10-11、2026-10-12 条目） |
| 冻结契约家（跨角色注入点） | Operator / CustomerInput / ReportHandback / DispatchTask / ShellVerdict / `PromptImage` 等型的单一来源——编排/桌面只按结构类型对接，禁跨角色导入私有 `common/`；`FinalizeStatus`/`FinalizeResult` 保留（编排仍消费） | 已实现 | [session.ts](../../src/provider/pi/session.ts)；[changelog](changelog.md)（2026-10-11 T20、2026-10-12 条目） |
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

- 稳定功能文档（`docs/feature/<feature-id>.md`）**待建**——本表只链**实际存在**的文件（当次变更/修复记录、changelog、代码与测试），不留失效链接；后续建好功能文档时回链本表。
- 本角色不自编编排/桌面/门禁引擎功能；跨角色事项（writeSet/F4 发行、交互卡渲染、判定规则集）不在本表重复。已删除功能的墓碑用例是本角色「不回归」的一部分（见 finalize_bootstrap 行）。
- 提供方层只实现对接口径；遗留限制与未核实事项见 [memo.md](memo.md)，本表不重复。
