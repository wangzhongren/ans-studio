# 路径 B 范围审计与交付说明返工 · 独立复验

| 项目 | 记录 |
| --- | --- |
| 任务 | 2026-11-17 · W6 · ANS 独立验收 · T3。本轮复验针对原 B2 已确认的两项 V1 偏差。[返工授权](../../../../docs/communication/2026-11-17_path-b-audit-and-delivery-rework.md) · [团队计划](../../../../docs/scheduling/2026-11-17_path-b-dapr-team-plan.md) |
| 准据 | 策划 v1.1 与 B1 v1。B1 SHA-256 `9a2250ddde9c93f7793ccf3758862453ed0b726a87391918a3c1dedc6b101c2e`；原 B2 SHA-256 `6d4b96d97d8dc55525330a2dcfc64176e6ad0780ead29f82414b38915b07d70f`。[方案](../../../../docs/planning/2026-11-17_design_path-b-dapr-workflow.md) · [B1](../design/2026-11-17_path-b-dapr-b1.md) · [原 B2](2026-11-17_path-b-dapr-b2.md) |
| 候选 | `feat/dapr-path-b-workflow` · `8ac13a970f411b3123aa109c54c9c203b0bbd0d1`。相对 `66eef885f97f3a5cf7610d8bbdbef7bc646c6d12` 的变更共 23 个文件，涉及账本、业务事实和投影、桌面 IPC、Renderer、测试与本轮治理记录。`git diff --check` 通过。 |
| Windows x64 包 | 547,098,138 字节，独立重算 SHA-256 为 `3d39ff874033e953067b024f027c84c29f39c50536621ff68c01e058f20f10a8`。构建记录的当时 HEAD 为前一提交，最终 ZIP 解包的 14 个本轮产品输入与 `8ac13a97` 的工作树逐字节一致。W5 使用同一构建目录的随包原生组件。[ZIP](../../../../release-output/audit-delivery-rework-final/ANS-Studio-2.0.0-win-x64.zip) · [候选与包绑定](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-final-candidate-binding.json) |
| 结论 | **本轮两项返工均通过。整套 B1 仍为证据不足。** |

## 逐项复验

| 原 B1 条目 | 所需证据与实际结果 | 原始证据及产出角色 | 判断 |
| --- | --- | --- | --- |
| V1 · B2 正式范围审计 | Windows 业务入口产生唯一 `change.scope-decided`，绑定原 B3 请求键、幕僚轮次和摘要、当前 B1 尝试及可重取报告、基线、候选来源和派生写集。审计、原 B3 事实及 outbox 同事务；强制审计入账失败时三者均回滚。相同键同内容返回原回执，异内容拒绝，越界请求零审计和零 B3。已保存的原派发在同库重开后送达一次。构造旧账库形状后，按原受理事实与可验证证据回填同一 ID；历史缺失决定时间时省略该字段。 | E1、E2，W5；编排事务及恢复逻辑见 [源码](../../../../src/service/durable-workflow/public.ts#L331)。 | `pass` |
| V1 · B4 交付说明与送达 | 受信客户批准后，原 Git 合并凭据与客户决定、批准快照及证据匹配，形成一份独立待送达说明。说明可查合并 OID、实际文件和 diff 摘要、运营报告与运行期未独立验证标记。合并已发生、SQLite 未结算时重开核回原合并；已核效果的后续入账失败可展示并以同一效果重试。终态与送达分别记录。曾在 `3d603af` 复现批准 A/B、main 已有 A、实际只合入 B 而无法收口；最终版本同例收口，说明只列实际的 B 及从 Git 复算的摘要。查看前仍待送达，Renderer 明确查看并显示后才提交回执；同键重放或重开保留首次回执及 Git reflog。错项目、错说明标识、无有效查看令牌不能改变状态；客户拒绝时零合并、零说明、零回执。 | E1、E2、E3、E4，W5 与真实 Electron Renderer 定向证据；[合并核回和失败呈现](../../../../app/desktop/session/fixed-workflow/release-merge.ts#L95) · [取实际合并范围](../../../../src/service/durable-workflow/facts.ts#L219)。 | `pass` |

复核了独立账本依据。旧记录回填依赖原业务事实与证据字节，B2 核验已消费的 B1 报告及有效收口，B4 核验客户批准、合并凭据与发布证据。实际文件必须是批准文件的非空、无重复子集。IPC 核对受信窗口主框、所选项目、实例、发布请求和查看令牌。读取说明保持待送达，成功写入首个回执才展示已送达。

## 执行范围与余项

- **W5 Windows 原生组合 10/10。** 使用真实桌面业务控制器、角色工具、客户卡业务通道、Dapr 1.19.1、JS SDK 3.19.0、SQLite 及隔离 Git。模型输出、目录选择、客户动作和离线状态由夹具控制。旧账库样本在关闭应用后仅移除两张新增表中的记录，保留实际业务事实与 Git 历史。 [W5 报告](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework.md) · [原始 TAP](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-native-final-subset-package.tap)
- **同候选的 Renderer、IPC 与包装证据。** Windows 实际 Electron 加载已构建 Renderer 与真实 preload，受控 IPC 验证共 3/3。真实 ZIP 独立解包并启动两次，PID 9100 和 7568，回环监听，复用同一 v1 只读实例并正常退出。包校验通过，原生装配 101/101。上述 GUI 分别验证实际查看路径和实包启动/恢复；B2/B4 完整业务链由 W5 同一候选的真实控制器用例取证。 [Renderer TAP](../../../../release-output/audit-delivery-rework-final/renderer-ipc-test.tap) · [实包 GUI](../../../../release-output/audit-delivery-rework-final/windows-local-zip-runtime.json)
- **受影响回归。** 同候选定向 56 项，55 通过、0 失败、1 条实际 Electron 用例按环境开关跳过，该项由上面的原生执行覆盖；主进程及 Renderer 类型检查通过。上一轮全量及同机冻结基线留作历史对照，本轮执行的是受影响复测。 [定向 TAP](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-affected-regression-subset-final.tap) · [类型检查](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-typechecks-subset-final.log)
- **整套 B1 尚有证据不足。** V1 其余门禁负例和完整故障窗口仍需补齐；真实远端链路中断、三平台同卷 OS 重启、两种 macOS 的包及原生环境、正式模型和实际项目运行验证仍缺。原 B2 的其他条目按各自的证据边界保留。

## 证据索引

| 代号 | 原始文件 | SHA-256 |
| --- | --- | --- |
| E1 | W5 最终原生组合与候选绑定。[TAP](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-native-final-subset-package.tap) · [绑定 JSON](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-final-candidate-binding.json) | `077eaa352c738705178efcb69f9013cd2304157b4da7ca749fd2ccb357e9a632` · `fe2c8e55f070cbdd74505dc0dff4677052b0d439b9cd94c820ac1501bb2c6fe2` |
| E2 | W5 最终受影响回归及类型检查。[TAP](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-affected-regression-subset-final.tap) · [类型日志](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-typechecks-subset-final.log) | `cbf71b7862e6e7414a91f0bca92348d8dbdc6fa10c0489ecdeff2bf2b76cfe17` · `8f73d6d7a1cceab4249ec27d18d0a7d2b68f2689f754ebabacb6ee32e4c3f39c` |
| E3 | W5 同一分叉场景。[前版复现](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-actual-subset-3d603af-reproduction-2.tap) · [修正源码运行](../../../测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-actual-subset-fixed-source-2.tap) | `b1164a733677e22dba57f6ca66a43830bada428d6acf8a3413162c7ac3fdcdc3` · `7408f3fda5c170c9926fe64defdae794330e881139e3d9b159821337d65fc6fe` |
| E4 | 实际 Electron Renderer、真实 preload 与受控 IPC。[TAP](../../../../release-output/audit-delivery-rework-final/renderer-ipc-test.tap) | `8476bd1b2dd456bcd7c0f9766be26aea276242fe366fc033cb26e01a2cd5de74` |
| E5 | W3 收包验证、解包运行与装配。[验证](../../../../release-output/audit-delivery-rework-final/verify.log) · [运行 JSON](../../../../release-output/audit-delivery-rework-final/windows-local-zip-runtime.json) · [装配日志](../../../../release-output/audit-delivery-rework-final/assembly-native-windows.log) | `e88ba6582e95dc0314cedcad7bd87c67144dae0cd41d04a3867bbf167a273c59` · `75c1bf4b206143690c724b14811bbdea595f78b4be74da98b15a699c242e5772` · `c39700a0cb49eca9f6dfe428abdc329fc500780931eb91dfc56b2d696e43cb1d` |
