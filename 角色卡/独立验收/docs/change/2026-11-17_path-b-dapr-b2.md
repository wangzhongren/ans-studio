# 路径 B 持久化工作流原型 · B2 独立验收报告

| 项目 | 核对结果 |
| --- | --- |
| 任务 | 2026-11-17 · W6 · ANS 独立验收 · T3。[团队计划](../../../../docs/scheduling/2026-11-17_path-b-dapr-team-plan.md) |
| 依据 | G0 v1.2 的独立分支自主研发和测试授权。策划 v1.1 SHA-256 `1b782ba822b8c2feb54b0b45e3abd7d79e114f8c9c411966259495beb994b174`，F1–F7 已完成方案复核。独立验收 B1 v1 SHA-256 `9a2250ddde9c93f7793ccf3758862453ed0b726a87391918a3c1dedc6b101c2e`。[意图授权](../../../../docs/communication/2026-11-17_intent_path-b-durable-workflow.md) · [方案](../../../../docs/planning/2026-11-17_design_path-b-dapr-workflow.md) · [B1](../design/2026-11-17_path-b-dapr-b1.md) |
| 冻结对象 | `feat/dapr-path-b-workflow` / `f70ed721b9f6d01d79fdbf63f64757b600558149`。基线 `ffe75ce623a659320e9caf1079ef7e9d81330b02`；两提交的 Git diff 涉及 67 个文件，覆盖桌面主进程、Renderer、编排及运行时、Provider、打包、YAML、测试与治理记录，`git diff --check` 通过。 |
| Windows 候选包 | 实际 ZIP 为 547,090,386 字节，独立重算 SHA-256 为 `ad4605e464599f4199046e5e890280298b5250d216aed21e781299b14c04d188`。逐哈希匹配 W5 清单中的 49 个冻结输入及 W3 从 ZIP 取出的 46 个文件。GUI、包装验证与实物 ZIP 哈希一致。[候选 ZIP](../../../../release-output/local/ANS-Studio-2.0.0-win-x64.zip) · [包与输入绑定](../../../../release-output/dapr-evidence/windows-local-zip-sha-and-inputs.json) |
| 总体结论 | **返工，原型未通过 B1。** V1 有两项可定位的契约偏差；另 11 项有部分验证或缺必需证据。候选可供隔离试用，正式合并与发布仍须有各自的授权。 |

## 已核对的实际执行

W5 Windows x64 最终原生聚焦 7/7，包含组合用例 6/6 和路径 B 热改对照 1/1。真实桌面业务入口连接原生 Dapr Runtime 1.19.1、JS SDK 3.19.0、两个 SQLite、角色工具、客户卡通道和隔离 Git。测试用固定模型脚本、方案内测试素材、目录选择及客户点击夹具，报告没有经过线上模型和实际项目运行验证。B3 写入和任务分支提交、客户卡批准后的 `main` 合并与关闭均在隔离仓生效。W5 正常链与审批重开属于真实桌面业务控制器测试。W3 从 ZIP 启动真实 Electron 与 Renderer，覆盖只读实例等待及原数据目录重开。 [W5 组合报告](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence.md) · [W5 聚焦原始 TAP](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-native-final-source.tap) · [W3 实际 GUI](../../../../release-output/dapr-evidence/windows-local-zip-runtime.json)

Windows ZIP 的检查和原生 GUI 启动均通过。两次启动 PID 为 17780、16856，复用只读实例 `dw-1c9ab4121b498be62b17bc6a18e2c4c1600d` 与固定 v1；界面就绪分别 1081 ms、1091 ms，控制面及 Worker 就绪分别 2228 ms、1636 ms，监听地址均为 `127.0.0.1`。随包 `daprd.exe` SHA-256 `4d4c6232e0ccd80400741c73f8b8f86e7272f969b2ebc5c79dd0cd5842a5f6d2`，`scheduler.exe` SHA-256 `ac5a2fb1fc82fbca3063e1e3cc8442f3a74554da5cd0d7e4208323b73d41d9f4`。W3 装配 101/101，原生控制面测试实测端口冲突保留竞争监听者、强杀 Scheduler 后旧计时器到期唤醒、宿主强退后回收子进程。原生控制面测试、W5 集成测试和 ZIP 实测各按自身入口计入覆盖。 [W3 ZIP 校验](../../../../release-output/dapr-evidence/windows-local-zip-verify.log) · [W3 原生装配](../../../../release-output/dapr-evidence/final-assembly-native-windows.log)

## 逐项判断

表内候选均为上列 `f70ed721…`，对应 ZIP 为 `ad4605e4…`。早期定向证据只支持相同路径的局部判断，未扩大为最终 ZIP 结果。各证据代号的原始路径、产出角色及哈希见下表。

| ID | 冻结标准及所需证据 | 原始证据 | 实际结果及缺口 | 验收判断 |
| --- | --- | --- | --- | --- |
| V1 | 正常链与门禁；B1 身份及证据、B2 范围决定、B3 写集、B4 客户卡、Git、合并关闭与交付说明，及负例/回归 | E1、E6、E9，另见下方差异 | Windows 正常链证实有效 B1 任务及报告、B3 原请求校验与写集、受信客户决定、单次本地合并及 `delivered`。同向决定查原结果，反向被拒；不支持的仓库配置在建任务前拒绝。B2 记录和 B4 交付说明存在下列契约偏差。无仓库、脏基线、B1 错工具/未收口、B2 漂移/候选边界、B3 越权及 B4 缺报告的原型桌面负例矩阵未闭合。 | `fail` |
| V2 | 在三种业务窗口真实阻断远端链路，每窗双复现；回环健康、UI 本地操作、原键补投及有效次数 | E1、E3 | 两次从宿主实际网络状态入口注入离线，Dapr PID/回环不变，B3 原任务恢复送达一次；本地决定可提交。缺真实远端网络失败、待回交外网断开及每窗口双复现。 | `insufficient evidence` |
| V3 | daprd、Worker、Scheduler 分开失联；三种事务窗口与原 B2/B3 衔接；SQLite/outbox/历史和计时恢复 | E1、E4、E7、E10 | 只杀 daprd 的回交用例独立两次，原任务报告均只消费一次；样本一从注入约 1.55 秒重连、约 27.6 秒观察到可用 B4 卡及消费结果。Scheduler 单故障与 Worker/控制面重开有原生计时器证据。缺各组件、各事务边界的完整矩阵和在 B2 已提交、B3 尚未开放处杀 Worker 的实测。 | `insufficient evidence` |
| V4 | 五种窗口强退及三平台真实 OS 重启；原实例、卡、任务、历史、outbox 与已到期提醒 | E1、E7、E8 | 待决卡用例关闭并重建桌面业务控制器后恢复同卡同图；ZIP 普通进程重开保留同一只读实例。缺五个窗口的完整发行包强退双复现，三平台真实 OS 重启均缺。 | `insufficient evidence` |
| V5 | 重复与拒绝、代批、丢回包、旧卡和 Git/证据漂移；客户来源、快照/代次、回执及 Git 状态 | E1、E6、E9 | 复核了同向决定重放、反向拒绝、窗口关闭保持未决及原卡恢复。W1 真实 Git 和业务端口用例观察到 tip/main 不变而证据改动产生新代次，旧请求被拒。缺发布包的客户拒绝停办、judge 代批、回包丢失及 main/证据单独漂移全链。 | `insufficient evidence` |
| V6 | 送达、报告、收口、未知副作用及换代竞态；各实际作用门、有效次数与回执 | E1、E4、E9、E11 | B3 故障回交只出现一次有效报告，正常链见真实写入与收口。W1 账本定向覆盖早到事实待前置；运行时文件门有定向测试。缺忙/送达或执行未明、迟到旧尝试、通知未结及模型与文件作用门的实际换代竞争矩阵。 | `insufficient evidence` |
| V7 | 真实提交和合并的 Git 已改未记账等窗口；权限竞争、冲突、OID、父关系、diff 与命令计数 | E1、E6、E9 | W5 正常链有真实单次提交/合并、父节点与 diff，无额外 remote/tag；W1 真实 Git 可按原操作标记、父关系及差异重取一次合并结果。缺强退窗口、已知未开始、ref 漂移、冲突及 Git 换代竞态的候选包端到端证据。 | `insufficient evidence` |
| V8 | 原型与旧引擎唯一所有者、同仓多数据根/别名/worktree、开关与旧包隔离恢复 | E1、E6、E11 | W5 投影见 Dapr 所有者，旧 A/B 定向回归通过；W1 账本定向验证双数据根和 worktree 共享仓库独占。缺候选包双入口、恢复扫描/重派/合并争抢与关闭开关、冻结旧包、兼容候选重开的组合证据。 | `insufficient evidence` |
| V9 | Windows x64、macOS arm64、macOS x64 实际 ZIP，在干净标准账户条件下不依赖外网、本地控制面运行与恢复 | E7、E8 | Windows 隔离用户数据的解包 GUI、回环、Worker、SQLite、普通退出及原实例恢复有实测。Scheduler 提醒、端口冲突、子进程清理由原生装配验证。Windows 全程真实外网阻断证据缺失，两种 macOS 的候选包和原生证据均缺。 | `insufficient evidence` |
| V10 | 同版本应用只改 YAML，B1 阻塞对照补查；额度、退役报告、当前报告开 B2 和非法图封闭 | E1、E2 | 同一业务控制器中 v1 遇 rework 阻塞，v2 派一次真实只读补查，二次 rework 达额度上限，零业务写入、零发布卡，`main` 无变化；另见只读图非法配置拒绝。缺补查重启及重复唤醒、退役迟到报告和有效补查报告开放 B2 的组合证据；配置绕过负例仍需补齐。 | `insufficient evidence` |
| V11a | 第二种形状与路径 B 并行、幂等作用域及固定 v1/v2 重启；快照、注册名、事件和只读终态 | E1、E10、E11 | 只读图经真实只读报告和等待分支到 `completed`，改图后新实例走新的终点步骤；卡样本重开沿原定义和原决定。W1 有项目级摘要及乱序局部证据。缺双图同时运行、跨实例输入/乱序、损坏或删除外部文件后的完整冻结版重启组合。 | `insufficient evidence` |
| V11b | 缺注册或活动契约的候选先阻塞消费与补投，兼容候选重开原实例与原事件 | E10 | W1 原生 Worker 及兼容预检可见注册前阻塞和兼容重开。缺以组合桌面包运行的不兼容候选、UI、历史不推进及补投抑制原始记录。 | `insufficient evidence` |

## V1 已证实的差异

1. **B2 审计记录与冻结契约不同。** W5 SQLite 证实原 B3 `advance` 对本次报告和基线的校验、派生写集及原键消费。候选把范围决定存为 `kind: "b3-advance"` 的事实及实例 `scope`，同事务写入 outbox。B1 与方案约定的 `change.scope-decided` 审计记录只在旧路径出现。统筹应交编排与桌面窗口补齐同一原 B3 请求的正式范围审计记录及相应原始证据。 [桌面原型受理](../../../../app/desktop/session/fixed-workflow/route.ts#L414) · [原型范围处理](../../../../src/service/durable-workflow/facts.ts#L70) · [原子入账](../../../../src/service/durable-workflow/public.ts#L282)
2. **B4 合并关闭后缺独立的交付说明与送达状态。** W5 正常链显示 `release-merged`、`closed: true` 与实际 Git 结果。原型恢复路径提交该事实后即返回；该源码的交付通知调用只接旧路径。发布卡的通用提示不能给出本次交付的运行验证缺口或说明的送达状态。统筹应交桌面窗口、编排及桌面 UI 核对收口后交付说明的生成、可查性、送达状态，以及合并中断恢复不依赖模型补报。 [原型发布结算](../../../../app/desktop/session/fixed-workflow/release-merge.ts#L95) · [交付通知调用](../../../../app/desktop/session/fixed-workflow/release-merge.ts#L543) · [组合原始证据](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-native-final-source.tap)

## 回归与环境边界

- 主进程及 Renderer 类型检查通过，最终结构、客户入口与旧路径定向回归 15/15。早期全量曾命中 `lifecycle/open.ts` 1503 行超过仓库上限，现按最终候选的结构定向复跑结果记录已修正。早期全量与最终定向证据分开记录。 [类型检查](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-final-typecheck.log) · [W5 回归记录](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence.md) · [定向 TAP](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-final-structure-and-legacy.tap)
- 四份同环境冻结基线合计 115 条，99 通过、16 失败。三条 Windows symlink 创建报 `EPERM`，两条旧 F-7 样本无法启动 `grep` 或 `echo` 并报告 `ENOENT`。其余十一条涉及 Windows CRLF 检出的冻结文档摘要、Chief 资源前缀或 JSON 示例匹配，与首轮全量所见同名失败相符。 [冻结基线一](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-regression.log) · [额外 symlink](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-symlink-extra.tap) · [F-7](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-posix-commands.tap) · [Chief 资源](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-chief-resource.tap)
- 结构修复前启动的 Windows T3 全量共 5,855 项，5,796 通过、17 失败、42 跳过，退出码 1。16 条失败在同机冻结基线逐例复现，唯一新增的结构超行在最终候选定向复跑中闭合。最终候选另有聚焦 7/7、结构及旧路径 15/15 和类型检查通过，未取得从结构修复后同一提交起跑的完整全量结果。 [首轮全量记录](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-full-regression.log) · [失败逐条差分](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-regression-difference.tsv)
- 本轮可用 Windows x64 桌面与本地构建环境；未实际核证 Windows 同卷 OS 重启、真实外网中断或 macOS 任一架构的构建及原生桌面重启。B1 的恢复时限只能在已记录的样本上比较。测试角色需按 B1 补齐平台与故障矩阵，统筹收集当前候选相应原始记录。

## 原始证据索引

| 代号 | 产出角色与证据 | SHA-256 或哈希清单 |
| --- | --- | --- |
| E1 | W5 最终 6 条原生桌面业务用例及源输入。[TAP](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-native-final-source.tap) · [49 输入](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-final-source-sha256.tsv) | `93f5e4ae47ecd33d9b03954f8fe22accca99dfef1f2974b373716c8636cd7615` · `3848bec6a991abf4eb09cb38eb2b9ea711c53c3377dee956dbe3fde90787eeb7` |
| E2 | W5 路径 B 热改及两次补查处置。[TAP](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-path-b-followup.tap) | `93379b51190bd82336b4a72dacd8ab4d5d7731a72c5bfc4f5d60a01df4c6bb42` |
| E3 | W5 宿主模拟离线派发两次。[第一次](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-dispatch-offline-1.tap) · [第二次](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-dispatch-offline-2.tap) | `30c1397689b1fbcc5fb7d496f5ded06b0ef07213c7892d2625b59a46d9de8725` · `284e844fd09627ef575e86cb6fb79715957a6c047b728b9df77e92df1af0f401` |
| E4 | W5 B3 回交期间强杀 daprd 两次。[第一次](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-handback-daprd-1.tap) · [第二次](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-handback-daprd-2.tap) | `5f858e39326a2cd7232ecf342ed6a3aef0ac7ef791e37550079c49eae743a86e` · `45742b6e0c36454605303f80b1f5854389e7093ed2d74730e99502c5d1aa54c2` |
| E5 | W5 四份同机冻结对照。[原始基线](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-regression.log) · [额外 symlink](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-symlink-extra.tap) · [F-7](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-posix-commands.tap) · [Chief 资源](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-frozen-chief-resource.tap) | `c0ee7124817e5155dcd5e800f7c839e53944e13ba17a89166f8de0bec2d9b307` · `fcb885d3dac96762fe373ac740f92cd5543322b21dfd6da2ae7ccc668628cf1d` · `6f54bc1e9bbf8e9c099d07e6f49e7d18beb1a51433df7a54a7b7be585aa36bb0` · `bc082deafc0f1a3f2bda3739ecf6de6dd70138b3c05dc55cd480884f57da15bb` |
| E6 | W5 桌面结构、客户卡入口及旧 A/B 回归。[TAP](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-final-structure-and-legacy.tap) | `3b1344e47362fa898550093e6593434c3833561fd00ba2c9dd8ef85556ddff1b` |
| E7 | W3 控制面装配 101/101，Scheduler 强杀、计时与进程。[日志](../../../../release-output/dapr-evidence/final-assembly-native-windows.log) | `0ba58a9397c34f28d018dfe62a6034803649069335e46b3dcf3a199b279a5e4c` |
| E8 | W3 Windows ZIP 输入清单、原生 GUI 与两次启动。[清单](../../../../release-output/dapr-evidence/windows-local-zip-sha-and-inputs.json) · [JSON](../../../../release-output/dapr-evidence/windows-local-zip-runtime.json) | `0c9da99a186e45953a79cea0792b497b7a1e300360c56c596053661de979e4de` · `2ea471966a22537e0d4e3be6356118642a04eb4768fe38af08d6c3ba677913bf` |
| E9 | W1 真实 Git 作用与回执定向。[日志](../../../../release-output/w1-authority-git.log) | `ce64608d8833013b3f3b2083479ae1504428636a9a5f07326170ad261668b2bd` |
| E10 | W1 原生 Worker、控制面进程更换与超期计时。[日志](../../../../release-output/w1-real-worker.log) | `e262fa2c39fe26f02c40f9108b12b8272741a9e220799359209226cabd8a82aa` |
| E11 | W1 同仓独占、项目快照及早到事实定向。[日志](../../../../release-output/w1-git-eligibility.log) | `ee96b2e184086c300a1bcac3d068e054782b7dec55ce6d897b103d6081f21ecb` |
| E12 | W5 首轮全量及与同机冻结基线的逐项失败差分。[原始日志](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-full-regression.log) · [差分 TSV](../../../测试/docs/change/2026-11-17_path-b-dapr-evidence/w5-regression-difference.tsv) | `352ac764876b09b4090c74cc82be9066d95314524e069510adfb93672a66da5f` · `73999accdca58664c1645432ea57d9ac1069d35f8885b4188eefabb03c711f0a` |
