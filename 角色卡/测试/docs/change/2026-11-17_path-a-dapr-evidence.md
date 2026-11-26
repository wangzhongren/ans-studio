# 路径 A 与外置流程定义 · W5 组合测试记录

以冻结的 B1 为依据，其 SHA-256 为 `252304699cf4c27ca3fd37fc0711cbd71299f78b303fa7fa43216e309e601d2f`。基线为 `7f4cf4e380f4a2b1e6f47572b5a4eeb5a3087a0e`，冻结产品候选为 `4c6efec34182563e3fa8b1ef6ef6372fe282d220`。下表保留联调所见，冻结复测与 ZIP 切换在后文记录。[B1 验收口径](../../../独立验收/docs/design/2026-11-17_path-a-dapr-b1.md)

## 环境及入口

- Windows x64（内核版本 `10.0.26300`），真实 `createDesktopInterface`、桌面项目注册、工作流及角色工具、受信客户响应通道、Dapr 1.19.1 Worker/Scheduler、SQLite 及隔离临时目录或 Git 仓。角色脚本替代模型服务，测试文件选择器替代操作系统选取动作。角色业务事实取自真实工具和账本。
- 原生联调复用历史 Windows ZIP 解包资产。历史包 SHA-256 为 `3d39ff874033e953067b024f027c84c29f39c50536621ff68c01e058f20f10a8`。`daprd.exe` 为 `4d4c6232e0ccd80400741c73f8b8f86e7272f969b2ebc5c79dd0cd5842a5f6d2`，Scheduler 为 `ac5a2fb1fc82fbca3063e1e3cc8442f3a74554da5cd0d7e4208323b73d41d9f4`。
- W4 的真实 Windows Electron、生产 preload 与受控 IPC 独立联调 3/3。日志 `release-output/path-a-dapr-w4-electron-attempt1.log` SHA-256 为 `ed646e83b767cceb00a3d11e4df51dfbe69c2dc2cf4a6d796a59c7b0fc6e9306`。同候选新 ZIP 与新旧包接续待补。

## 联调观测

| B1 | 已实际观测 | 待核对 |
| --- | --- | --- |
| T1 | 第三图经受信导入并启动 v2，真实幕僚先提交具体已跟踪文件的资格请求，真实运营及属主完成 B1 及只读终点 `inspections-delivered`。实际 `write_file` 及 Git 切分支均被拒绝，业务文件与 Git HEAD、refs、status 保持一致。九种非法图及空目录上的既有项目流程均被拒绝并保持零业务任务，错误摘要返回 `definition-digest-changed`。真实复制新版随包 B 后从项目定义执行 B1→B4、Git 合并及显式查看回执。第三图写支经合法分支准备、B2、真实独立验收、归档、客户本人批准合并及查看回执。A 从项目定版启动，外置文件失效时返回具体错误。 | 冻结候选、随包与 GUI 入口复测。 |
| T2 | A 从空目录经真实 A1–A13，含意图及方案、五份提案关联材料、提名人写入与激活、A9 `complete_team_plan`、A10 任命。A12a 标准在 A11 执行期间由独立角色回交，幕僚收口后 A12b 产生报告及绑定两份材料哈希的归档。实例 `dw-e0ebf2e4fc96fdb8c0c43c9c353948e7812b` 的 A13 客户批准 `rel-8d7123f7d102a3966f17eb7f-decision`。实盘 main 为 `c6c37d843ff6a2e998aa94244906fb58ad2d12a9`，实际差异仅限定模块文件，并有查看回执。 | 在 A12a 原待办未收口时再重开及完整反例。 |
| T3 | A3、A6 待决重开保留原卡及定版，A3 实际改坏外置 YAML 后恢复原快照。A10 强制退出专用 daprd 后仍持久保存原决定，PID 9348→14124，重开后原事实恰好消费一次。A9 的故障用例用 SQLite 触发器只拒绝真实 Git 的成功结算，main 与任务分支已指向 `70a332c53e20671a9135c664ab37620871e4d84f`；重开保持 refs，持久层仅一笔成功后呈现原任命卡。 | A9 仅 `git init` 已发生窗口、A13 两窗口冻结复测及其他超时、旧尝试、无效委托场景。 |
| T4 | A9 前及 A9 Git 已写入且持久结算未完成时，独立进程和 appData 竞争结果均为 `workflow-workspace-busy`、零调用及零任务。旧固定 A/B 与桌面会话结构 11/11，固定链用原测试会话替身和真实 Git。原生 v1 B、只读图及旧发布说明回归 10/10，显式使用冻结的旧 YAML。 | 仓库绑定后的独立 worktree、停稳、各旧入口反向竞争及新旧实包接续。 |
| T5 | 上述 W4 联调及原包历史资产可核对。 | 同候选新 Windows ZIP 双包实跑、兼容暂停和负向界面。 |

第二次第三图 B1 观测保留了 `docs/bootstrap-manifest.md` 自动生成引起的失败。现有运行审计把该固定路径定义为应用初始化留痕。后续指纹对比持续包含项目业务文件、工作区状态和 Git refs，单独记录该固定运行态文件的前后哈希。

原始记录见 [首次原生联调](2026-11-17_path-a-dapr-evidence/w5-native-wip-attempt1.tap)、[第二次第三图原生联调](2026-11-17_path-a-dapr-evidence/w5-native-wip-attempt2.tap)、[第三图只读完成和准入](2026-11-17_path-a-dapr-evidence/w5-native-wip-external1.tap)、[A3 与双进程占用](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-intent2.tap)、[A6 与 A8 首次实跑](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-full2.tap)、[旧链及结构](2026-11-17_path-a-dapr-evidence/w5-legacy-and-structure-wip.tap) 和 [原生旧链](2026-11-17_path-a-dapr-evidence/w5-legacy-native-wip.tap)。

- A6 待决重开后，A6 的模型发送曾因各节点尝试序号相同而阻塞 A8 的真实收口，修正后通过 A8。A9 首次消费真实请求时，阶段任务错误使用 `docs` 副作用标签，既有只读阶段请求守卫拒绝生产任务投递。修正后 A9 实际运行。保留 [A8 阻塞账本](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-full3-a8-facts.json)、[A9 任务未落账及 A8 已推进](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-full4.tap) 和 [A9 真 Git 与 A10 前置拒绝](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-full5.tap)。
- 资格匹配曾在两个空值相等时自动推进并令分支准备报 `baseline-not-open`，修正后真实资格请求绑定既有文件。保留 [资格修复后第三图分流](2026-11-17_path-a-dapr-evidence/w5-native-wip-external-qualify5.tap) 与 [新版 B 实际交付及第三图下一处等待](2026-11-17_path-a-dapr-evidence/w5-native-wip-external-writes6.tap)。
- A10 曾误入旧 fixed 工作流的前置查找。修复项目阶段入口后实跑完整 A，包括原任命决定恢复、A12 独立证据及 A13。A9 独立故障用例也已通过。[A 全链与 A10 重开](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-full6.tap) · [A9 实际 Git 回执中断](2026-11-17_path-a-dapr-evidence/w5-native-wip-a-baseline3.tap)

## 冻结候选复测

- 主进程和渲染层类型检查通过。编排、应用 Git、桌面会话结构及旧 A/B 定向回归 36/36。外置定义原生组合 5/5，覆盖第三图两支、实际预设 B 全链、九种配置拒绝和空目录资格拒绝。追加已有 Git 仓中的两个否定用例 2/2，实际幕僚发起 A1 新工作或引用不存在的既有文件均被拒绝，零范围事实、任务、Git 或业务文件变化。[类型检查](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-typecheck.log) · [定向回归](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-focused.tap) · [外置定义原生组合](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-external.tap) · [已有仓资格反例](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-existing-purpose-negative.tap)
- 空目录 A 随包预设和项目复制 YAML 各自跑通完整 A1–A13，各 1/1。A3 待决且外置 YAML 失效重开、同请求重试及请求键冲突通过。A9 的 Git 已写入但结算中断场景通过。首次合跑将 linked worktree 的 Git 准入失败与普通根目录占用拒绝断言为同一错误码，保留原始失败。独立用例使用两进程和两份 appData，查询到同一 common dir 与同一持有者，普通根目录返回 `workflow-workspace-busy`，linked worktree 返回 `workflow-git-protection-unavailable`，零第二实例、角色调用、任务及 ref 变化。[随包 A 正常全链](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a-normal.tap) · [项目 YAML A 正常全链](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a-project-full.tap) · [A3、A9 及首次 linked worktree 记录](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a.tap) · [跨进程及 worktree 核对](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a-ownership.tap)
- A12a 报告已落盘但幕僚未收口的实际恢复 1/1。A11 实作已开始，独立角色的原标准任务 `dw-595ddce1cd74f96443e3bdf6a7222fb5` 回交，且 A11、A12a 报告均持久保存。夹具关闭模型投递模拟网络不可用，停止旧桌面控制器及 daprd，重开后 PID 27216→3752，幕僚只收口原任务一次，再进入 A12b 并实际交付。[A12a 原待办重开](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a12a-reopen.tap)
- A12b 已收口报告漂移反例 1/1。真实独立验收报告和幕僚收口已提交，夹具在宿主归档前改写原报告，查询停于 `archive-acceptance` 并显示 `workflow-acceptance-drift`。无归档、A13 卡、发布作用或 main 变更。[A12b 报告漂移](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a-archive-drift.tap)
- A13 两个中断窗口 1/1。隔离 daprd PID 26120 退出后，原批准仍保存为唯一待消费事实和 outbox，main 保持基线。PID 25876 接续并执行原合并，夹具触发器只中断 Git 成功结算。PID 27608 重开后，main 仍为已实际产生的 OID `47f3146ca7b91fe88e7103c167feb9b825b58e7f`，仅一笔合并效果、发布结果和送达回执。[A13 批准及合并结算的两次中断](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-a13-isolated.tap)
- 原生 v1 及旧只读、B2 审计、B4 交付说明和恢复 10/10。旧与新执行器双向排他 2/2。独立 v2 停稳用例 1/1，真实运营尚未报告时，新 appData 启动替代定义被拒绝。真实运营报告获核验并消费唯一停稳事实后，另一定版进入新实例，原仓 Git 与业务文件保持一致。沟通角色的同候选见证另覆盖实际共享 SQLite 提交后子进程异常退出的预约间隙、旧 JSONL 先后顺序和原 ID 重放。[原生旧链](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-v1-native.tap) · [v1/v2 排他](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-cross-executor.tap) · [停稳后另行启动](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-verified-stop.tap) · [预约崩溃见证](../../../../release-output/path-a-candidate-owner-crash-witness.log) · [旧新入口见证](../../../../release-output/path-a-candidate-owner-witness.log)

## Windows ZIP 真实接续复测

- 原版 ZIP SHA-256 为 `3d39ff874033e953067b024f027c84c29f39c50536621ff68c01e058f20f10a8`。新 ZIP SHA-256 为 `3468589777c5251739b52f5c97a45aa56ee6735020002b49ad8c64ee33d8269d`，547147777 字节。两包的 Electron 44.7.0 可执行文件与 Dapr 资产散列相同，实际导入的桌面接口和控制器模块散列各自不同。
- 两个独立解包的 `ANS Studio.exe` 均以 Electron Node 测试模式运行各自的包内生产桌面控制器、客户通道、Dapr 和 SQLite。旧进程 PID 2624 和 daprd PID 21600 退出后，新进程 PID 2008 和 daprd PID 8096 从同应用数据与仓库恢复原 v1 实例 `dw-1ca259d018fef9b5931ba8551bfb8ffcf1d4`、待批卡 `rel-b04553a4340d3cf674939cf4-decision` 及摘要 `aa1f900e158ae62254f9be075a771cbc8eab68d5a3642618b11b203377420013`。无业务角色重派。实际 main 为 `e13fcde6d5de52d1cd7a29922a4e51bcf4079e46`，仅一笔成功合并，客户查看后的送达时间为 `2026-11-17T07:41:48.553Z`。本用例的受信客户响应由隔离通道夹具提交，实际 GUI 由 W3 单独取证。[两包复测 1/1](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-v1-package-switch.tap)
- W3 同 ZIP 的普通 GUI 双次启动及恢复通过，观察到新 A 与旧只读实例的两个注册名和活动契约。随包 A/B 预设散列及未写项目预设、无效项目文件精确错误均在同一组实包材料。[普通 GUI 和 Dapr 恢复](../../../../release-output/path-a-external-workflows/windows-local-zip-runtime.json) · [36 个源输入匹配](../../../../release-output/path-a-external-workflows/windows-local-zip-sha-and-inputs.json)

## 剩余取证

- T2 的错误验收角色、错误基线、旧候选、明确轻量验收和有限返工缺少样例组合证据。
- T3 的 A9 仅完成 `git init` 的中断在定向 Git 端口测试通过，完整桌面和 Dapr 组合仅覆盖 refs 写入后账本未结算。治理卡旧快照、冲突决定、失效委托和回包恰好丢失的各窗口待独立组合验证。
- T5 的全部真实面板工作流按钮及负向 UI、故意缺所需旧注册项的实包暂停窗口仍需取证。线上模型、外网物理中断、Windows 操作系统重启、macOS 均未实测。

冻结产品候选、实际执行的测试文件以及原始输出的 SHA-256 见 [证据散列](2026-11-17_path-a-dapr-evidence/w5-candidate-4c6efec-sha256.tsv)。部分测试夹具在产品冻结后补充，包内生产源码保持该提交。
