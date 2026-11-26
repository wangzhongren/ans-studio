# 路径 B 持久化工作流组合测试

2026-11-17 · 固定测试角色 W5 · T3。冻结对照为 `ffe75ce623a659320e9caf1079ef7e9d81330b02`，候选为 `feat/dapr-path-b-workflow` 的 `f70ed721`。组合测试以候选源和随包 Dapr 1.19.1 / SDK 3.19.0 运行。最终 Windows ZIP SHA-256 为 `ad4605e464599f4199046e5e890280298b5250d216aed21e781299b14c04d188`。验收判据以 [B1](../../../独立验收/docs/design/2026-11-17_path-b-dapr-b1.md) 为准。 [49 个产品输入的字节摘要](2026-11-17_path-b-dapr-evidence/w5-final-source-sha256.tsv) · [装配包输入比对](../../../../release-output/dapr-evidence/windows-local-zip-sha-and-inputs.json)

## 环境和复现

Windows NT `10.0.26300.0` x64，Node `v24.22.1`，Git `2.55.0.windows.5`。路径 B 经 `createDesktopInterface` 的真实项目导入、选图和显式启动，使用真实编排、Dapr `daprd`/Scheduler、两个 SQLite 存储、角色工具、客户卡通道和 Git。仅模型调用、测试项目素材、目录选择和客户点击由夹具提供。每例新建独立临时 Git 仓库与数据目录，已有治理记录使用本角色的真实文件摘要夹具。报告正文和源代码为确定性测试素材，正常角色轮提交自己的报告。用户目录、线上模型、正式项目和 RR34 原目录均未参与。

```powershell
$env:ANS_W5_DAPR_ROOT = (Resolve-Path 'release-output/dapr-assets/win-x64').Path
node --test --test-reporter=tap 'test/测试/durable-workflow/*.test.ts'
node --test --test-reporter=tap --test-concurrency=1 --test-timeout=600000 --test-force-exit 'test/**/*.test.ts'
npm run typecheck
npm run typecheck:renderer
```

原始 TAP 保留真实 Dapr Worker 日志、角色调用与回执、客户请求、SQLite 只读快照、实例 ID、Git 对象关系及各注入时间。具体实例的 `fixture` 事件给出该次临时根和初始 OID。回环与进程故障实验只针对夹具自己启动的 native Dapr。

## 逐项观测

| B1 条目 | 已观察 | 证据缺口 |
| --- | --- | --- |
| V1 正常链与门禁 | B1 属主读取、真实报告和运营收口，幕僚持原 B1 分析通过 B3 `advance` 提交 B2。原型 SQLite 使用种类 `b3-advance` 与实例 `scope`，关联同一原始 B1 报告和 B3 请求。B3 实际写入和守卫 Git 提交。客户从应用真实发布卡批准，唯一 `main` 合并包含 `src/core/snake.ts`，最终 `delivered`，同向决定重放通过，反向决定拒绝。另用不支持的 repo-local `core.autocrlf=false` 试验确认 `workflow-git-protection-unavailable`，零实例、零任务、零新分支。 | B1 指明的 `change.scope-decided` 同名事件在原型权威库未见。无仓库、脏库、B1 错形状、缺收口、B2 证据漂移/越界、B3 越权和 B4 缺报告的完整桌面负例矩阵未覆盖。线上模型、运行期行为报告未覆盖。 |
| V2 外部断网 | 模拟桌面宿主收到的模型网络离线状态。两次确认 B2 已保存、B3 父任务已持久化、真实回环 Dapr 在线且模型尚未发送。恢复时原任务只送达一次；再次置离线仍经真实客户卡批准本地合并。 | 未断开实际网络接口，未运行真实远程模型。远端回交窗口的离线双复现未覆盖。 |
| V3 进程失联 | 当真实 B3 实现已提交且 `submit_report` 返回报告候选受理、B3 权威报告尚未提交时，仅强制终止该回环端口的 daprd。桌面业务进程保持，原端口重开，原任务 B3 报告恰一项且消费，输出客户卡并交付。 | 各进程和业务已提交/引擎已受理/消费已提交的矩阵未完整注入。Scheduler 定时器只由装配层实测覆盖。 |
| V4 重启 | 待决 B4 卡存在时正常关闭 Desktop 业务控制器及 Dapr 子进程，用原项目和数据根重新构造同一控制器。旧定版与原卡保持，通过真实客户动作最终交付。装配另验证真实解包 Electron 进程重启后的等待实例。 | 控制器重开样本与 Electron 冷启冒烟分开，未执行全部五个窗口的发行包强退双复现。Windows 和两种 macOS 的 OS 重启未测。 |
| V5 审批负例 | 同向重放返回成功、反向拒绝，原 `main` 只前移一次。窗口和宿主关闭期间无写入，原请求重新呈现。 | 拒绝到停办、回包丢失、判断代批、旧卡与 Git/证据单独漂移的完整实测缺失。 |
| V6 派发、回交、fencing | B3 回交中断后原属主任务与原报告只生效一次。开放 B4 观察到运营报告、产出证据和相应收口。 | 接收端忙、未知模型副作用、退休尝试迟到、作用与换代竞态等其余窗口未完整注入。 |
| V7 Git 窗口 | B3 单次实际实现提交和 B4 单次本地 merge 的 OID、父节点、实际 diff、无 remote/tag 均在正常链检查。 | 没有在 Git 已改变未记账、未开始、ref 漂移和冲突的窗口强退。 |
| V8 单一所有者 | 投影可见实际 `owner: dapr`，旧 A/B 的定向回归用例均成功。 | 别名/worktree 双目录争抢、开关关闭后隔离旧引擎和冻结旧包交替重开未实测。 |
| V9 随包运行 | W3 从最终 Windows ZIP 独立解包并在隔离用户目录启动 Electron，真实 Renderer 已挂载，原生 Scheduler/daprd 及 Worker 就绪，回环监听、SQLite、定时器、重开与端口冲突结果见其 [Windows ZIP 运行记录](../../../../release-output/dapr-evidence/windows-local-zip-runtime.json)。 | macOS arm64/x64 未构建及原生验证。未从本测试运行中断开系统网络接口。 |
| V10 外置走向 | 同一应用的两个路径 B 实例经真实工具作出相同 `rework`。默认 v1 直接阻塞。只热改 YAML 为 v2 后实际再派一次只读 B1 拟补查，第二次 `rework` 到达配置上限并停止。两个 v2 任务 ID 不同，零代码写入和零客户卡，`main` 无变化。另验证两个版本的只读图和六类拒绝。 | 补查窗口重启、多次提醒、迟到报告和补查报告可用后进入 B2 未覆盖。 |
| V11a 形状与版本固定 | 新旧只读图分别到 `completed` 和 `reviewed` 终点。B4 重开时 v1 实例保留原摘要，磁盘 v2 可校验，真实原卡授权后交付。六个坏 YAML 均零新任务与零写入。 | 跨项目/实例乱序、删除 YAML、双流程同时运行及 B1 要求的组合重启矩阵未完整覆盖。 |
| V11b 执行器兼容 | W1 的原生 Worker 层检查覆盖缺失活动兼容状态及恢复，W5 未在组合包复现该故障。 | 缺旧执行器的候选包、桌面阻塞 UI 和补投抑制测量缺失。 |

## 原始运行与异常

- [最终产品源码聚焦](2026-11-17_path-b-dapr-evidence/w5-native-final-source.tap) 6/6，通过正常链、待决审批重开、daprd 强杀回交、离线注入派发、不支持的 Git 配置和 YAML/只读版本测试。加上 [最终路径 B 补查对照](2026-11-17_path-b-dapr-evidence/w5-path-b-followup.tap)，合计 7/7。 [原始文件 SHA-256](2026-11-17_path-b-dapr-evidence/w5-raw-sha256.tsv)
- [正常及待决审批重启](2026-11-17_path-b-dapr-evidence/w5-chain-pinned-git.tap) 2/2。正常样本 `dw-7f8b0b3baf71e8cb64b8bfbcecaba184aacf` 通过 `rel-a1171c955e3dff5d4fa98310-decision`；另一样本关停并重开后约 1.2 秒呈现原卡 `rel-df0dbdf3900d694b8ecca52a-decision`。随后 [组合复跑](2026-11-17_path-b-dapr-evidence/w5-native-final-1.tap) 再次覆盖同一卡恢复窗口，记录不同 sidecar PID。
- [强制关闭 sidecar 的回交样本](2026-11-17_path-b-dapr-evidence/w5-handback-daprd-1.tap) 1/1。实例 `dw-b4fa77b4ca86b1eda946a9afcc2cc85a4090`，同一应用 PID `19636`，daprd `6940 → 13604`，保留回环端口 `60770`。Worker 从注入到重新连接约 1.55 s，约 27.6 s 观察到 B4 卡和原任务恰一报告已消费。
- [模拟模型离线派发样本一](2026-11-17_path-b-dapr-evidence/w5-dispatch-offline-1.tap) 与 [样本二](2026-11-17_path-b-dapr-evidence/w5-dispatch-offline-2.tap) 各 1/1。样本一 B3 父任务 `dw-a6e77c00d22638fe389a61638f611542` 持久化后等待，监听端口和 daprd `14316` 全程不变，同一父任务恢复后送达，接着在模拟离线中提交客户决定。
- [强制关闭 sidecar 的回交样本二](2026-11-17_path-b-dapr-evidence/w5-handback-daprd-2.tap) 1/1，额外断言了唯一的任务提交、合并父节点和最终角色轮次。
- [路径 B 热改实测](2026-11-17_path-b-dapr-evidence/w5-path-b-followup.tap) 1/1。v1 实例 `dw-d9223b8fde39d80edeb3c7ea928a6bad9162` 停在尝试 1，v2 实例 `dw-d008c1d2de8dc66df526056cdfde8ed51a8c` 启动一次补查，停在尝试 2。证据保留两个 YAML、摘要、两个实际只读任务及 Git 状态。
- [外置配置和只读链](2026-11-17_path-b-dapr-evidence/w5-config-attempt-1.tap) 1/1。六个被拒配置分别涉及未知角色、未知活动、缺分支、非法循环、前置跳过和 shell 字段。同一应用实例继续跑完旧 v1，并按新的 v2 转向 `reviewed`。
- [首轮缺少 host facts](2026-11-17_path-b-dapr-evidence/w5-chain-attempt-2.tap) 复现产品接线缺陷。W1 增加真实 host facts 及保护预检后通过。保留 [非白名单 Git 配置旧表现](2026-11-17_path-b-dapr-evidence/w5-chain-after-host-facts.tap) 与 [无真实接受记录时 F6 的预期拒绝](2026-11-17_path-b-dapr-evidence/w5-chain-standard-git.tap)。首次 [治理模式夹具不足](2026-11-17_path-b-dapr-evidence/w5-chain-attempt-1.tap) 和 [故障点计数断言误含既有 B1 报告](2026-11-17_path-b-dapr-evidence/w5-native-final-1.tap) 为测试准备阶段问题，两项均已修正。

## 回归对照

Windows 串行全量执行了 5,855 项，5,796 通过、17 失败、42 跳过，退出码 1。此次执行在桌面结构调整前启动。失败中，`session/lifecycle/open.ts` 的 1503 行超出 1500 行上限，归位调整后在最终候选的结构与旧路径定向复跑 15/15；最终候选主进程与 Renderer 类型检查均通过。其余 16 条失败在同机冻结基线逐例复现。冻结对照定向共 115 条，99 通过、16 失败，包含三条 Windows symlink `EPERM`、两条 F-7 `grep` 和 `echo` `ENOENT`、两条冻结文档摘要差异，以及九条旧 Chief 资源的模板或字节断言。资源的 Git 索引是 LF，两个工作树检出为 CRLF。 [全量 TAP](2026-11-17_path-b-dapr-evidence/w5-full-regression.log) · [逐条差分](2026-11-17_path-b-dapr-evidence/w5-regression-difference.tsv) · [最终结构和旧路径](2026-11-17_path-b-dapr-evidence/w5-final-structure-and-legacy.tap) · [类型检查](2026-11-17_path-b-dapr-evidence/w5-final-typecheck.log)

冻结对照提供可重取的原始失败。W5 实际运行的 Dapr 资产与最终随包目录字节一致。旧套件自动生成的临时大型业务快照已移出候选工作树，相关原始 TAP 保留在本报告目录。 [基础冻结对照](2026-11-17_path-b-dapr-evidence/w5-frozen-regression.log) · [额外 symlink 对照](2026-11-17_path-b-dapr-evidence/w5-frozen-symlink-extra.tap) · [F-7 对照](2026-11-17_path-b-dapr-evidence/w5-frozen-posix-commands.tap) · [Chief 资源对照](2026-11-17_path-b-dapr-evidence/w5-frozen-chief-resource.tap) · [Dapr 资产摘要](2026-11-17_path-b-dapr-evidence/w5-native-assets-sha256.tsv)
