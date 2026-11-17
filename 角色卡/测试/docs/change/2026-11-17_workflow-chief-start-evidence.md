# 幕僚提议及客户本人启用 · W5 组合取证

## 修正候选 a91be6b

本轮修正冻结为 `a91be6b6a2be712bf703a13a6219cd994aaaa94b`。Windows 源码组合使用此前真实解包且已核验的同版 Dapr 资产。主进程和渲染层类型检查均通过，角色、运行时工具、门禁、会话、编排及旧固定链定向检查共 101/101。[双类型检查](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-typecheck.log) · [定向 97/97](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-focused.tap) · [卡种门禁 4/4](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-card-gates.tap)

S1–S3 实际组合 11/11。包含 A、B、导入第三图的真实幕僚工具和应用本人卡，错角色、缺可信主框、通用卡仿制及旧首派发入口被拒，实际排队输入绑定，原卡在文件漂移和项目切换时阻断，重开恢复同一卡，以及保存批准后文件删除、重开仍排程一次。[修正候选原生入口 11/11](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-chief-native.tap)

三条续启回归均通过。旧只读流程和路径 B 都在原窗口完成后从同一个 Chief 会话入口发起并走完客户卡。使用第二个已打开的控制器和隔离 appData 时，原 owner 活跃期间得到 `workflow-owner-conflict`。实际运营停稳报告按原实例入账一次，实例终态且共享占用解除后，第二个控制器从真实本人批准启用另一份保存定义，业务文件及 Git 保持一致。[冻结修正续启 3/3](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-same-window-repros.tap)

最终 Windows ZIP SHA-256 `e8ec621444eecd5b5cedc0935279e72502b319a276abd36ccca194d808760fb9`。独立解包复核最终 ZIP 的 `daprd.exe`、`scheduler.exe` 和 `DAPR-LICENSE` 与源码组合使用的同名资产逐项 SHA-256 一致。

S4 普通 Windows GUI 由 W3 用最终 ZIP 实测。普通输入经过实际 Pi 接线送至本机受控模型服务，应用发出本人卡。当 SQLite 提议为 `pending` 时实例为空。客户在 GUI 作答后，SQLite 记录唯一实例 `dw-00da56e17291ef6a776c85bf9d02094d8231`，Dapr 进入 A1，应用界面可查。[本人卡待决](../../../../release-output/workflow-chief-start-final/s4-ledger-pending.json) · [作答后实例](../../../../release-output/workflow-chief-start-final/s4-ledger-started.json) · [GUI 查询](../../../../release-output/workflow-chief-start-final/s4-ui-native-dapr-instance.png)

W3 首次关闭后旧应用和 Dapr 进程退出，同一隔离 profile 已重开到首页。桌面操作在回看实例前由 Esc 结束，GUI 重开后重选项目和查询结果待验证。[GUI 关闭后台账](../../../../release-output/workflow-chief-start-final/s4-ledger-closed.json) · [重开首页](../../../../release-output/workflow-chief-start-final/s4-ui-reopen-app-ready.png)

S4 两版真实 Windows ZIP 可执行文件接续 1/1。上一版 ZIP `3468589777c5251739b52f5c97a45aa56ee6735020002b49ad8c64ee33d8269d` 的进程以 Electron Node 测试模式加载包内生产桌面接口，使用项目安装的旧 schema 1 定义，保存 B4 待批卡后退出。最终 ZIP 的新进程加载自己的包内接口，继续同一数据目录、Git、实例 `dw-8d8b8ad7cfcdad014beba83acc240a104a04`、原卡 `rel-96710ef5a15f1e2206a70a7d-decision` 和原定版摘要。旧、新应用进程分别为 12296 和 25428，Dapr 分别为 22244 和 21476。新版继续原 B4，业务角色工作未重放，实际合并 `39f02cded42fdc319e5d850a51697bac93fb30c5`，交付说明查看回执已落盘。[最终两包接续 1/1](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-package-v1-resume.tap)

兼容回归在人工停止扩展用例前已报 23 项通过，包括路径 B 和导入图、旧定义继续及双向排他、真实分支发布和范围审计、重复回执、本人拒绝、Dapr 在回交时退出、模拟派发网络故障、A3 重开及 A9 基线恢复。网络故障使用隔离模型传输替身。其中一次 linked worktree 测试在幕僚会话启动门提前拒绝后，旧测试夹具断言该会话应已打开。[同版兼容回归原始输出](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-native-compat.tap) · [独立复现诊断](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-linked-triage.tap)

收紧测试夹具后用最终 ZIP 的 Dapr 资产单项复测 1/1。同根独立进程返回 `workflow-owner-conflict`。同一个 Git common 目录的另一检出根读到原 owner，实际会话打开门返回 `runtime-creation-admission-unproven:runtime-protection-scope-unknown,custom-provider-factory-unverified`。测试使用自定义模型工厂，真实随包模型的 linked worktree 入口待验证。独立进程零新增实例、角色轮和任务，Git refs 不变。[共同 Git 目录拒绝复测](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-linked-owner-guard.tap)

空目录路径 A 从真实幕僚提议、本人启用到 A13 审批、Git 合并和交付回执通过，A3 原卡重开也通过。两例均直接使用最终 ZIP 的独立解包 Dapr 资产。[最终包 Dapr 资产 A 回归 2/2](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-a-native-final-assets.tap)

[修正候选的产品及证据 SHA-256 清单](2026-11-17_workflow-chief-start-evidence/w5-a91be6b-evidence-sha256.tsv)

## 初始候选 4fb0663

B1 SHA-256 `2d9c6cbb96cc1c4791373eee5cea2b58fcf786ae3ffb0cea020cf18135589789`。产品候选为 `4fb066385607d4c860beb93a2eb05561115e91ff`，上一产品为 `4c6efec34182563e3fa8b1ef6ef6372fe282d220`。类型检查覆盖主进程和渲染层，均通过。Windows x64 组合使用实际新 ZIP 的原生 Dapr 资产与隔离 Git、SQLite、桌面控制器和生产角色工具。角色模型替换为确定性脚本，宿主测试注入当前主框回调。[增量 B1](../../../独立验收/docs/design/2026-11-17_workflow-chief-start-b1.md)

| 条目 | 实际观察 | 原始证据 |
| --- | --- | --- |
| S1 | 普通幕僚实际调用 `project_state` 与启用工具，30 份定义触发目录限幅，按 ID 仍能查到完整摘要。A、B 和导入第三图都由应用本人卡启用，按各自定版到第一个实际 A1/B1 角色派发。批准在原幕僚回合未结束时只留下原待办，无实例、任务、owner 或控制面抢先启动。 | [组合 10/10](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-chief-native-zip.tap) |
| S2 | 错角色普通发送、无可信主框的启用提议、通用 Choice 仿卡、无帧和失效帧回传、直接 `enabled` 启动均被拒绝。普通直发和排队分别由真实 ACK 绑定。实际旧 A1/B1 在未提议、待决、已批准但原幕僚尚未结束、明确拒绝状态均被试过并拒绝。跨 appData 两侧活跃 v1/v2 原实例排他，零第二实例或业务任务。 | [组合 10/10](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-chief-native-zip.tap) · [附加入口反例 2/2](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-additional-source-guards.tap) · [原持有者排他 2/2](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-cross-executor-zip.tap) |
| S3 | 同一实际幕僚回合重复同内容复用提议，异内容拒绝。待决时同版本改写、删除及同字节换有效来源均使原卡失效。控制器关窗重开并模拟时钟前进 25 小时后，仍显示原卡，旧窗口回传拒绝。真实切换到另一原生选择后，原卡回传失败，重选原项目出现同一张卡，只有有效主框能撤销。批准已持久化、项目 YAML 删除且控制器重开后，使用原项目源、摘要与启动键创建及排程一次。 | [组合 10/10](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-chief-native-zip.tap) · [跨项目切换及撤销](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-additional-source-guards.tap) |
| S4 | 原版与新 ZIP 的真实解包可执行文件在 Electron Node 模式中加载各自生产桌面接口。旧版保留项目特制的 v1 定义及原待批业务卡，新版拒绝裸直启，并在同一 Git 和数据目录继续原实例到真实合并和查看回执。A 全链和 A3 重开通过。定向编排、运行时工具、角色门禁、桌面会话结构及旧固定模式 101/101。普通 GUI 业务入口由 W3 另取证。 | [实际两包接续 1/1](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-package-v1-resume.tap) · [A 原生 2/2](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-a-native-zip.tap) · [定向 101/101](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-focused.tap) · [双类型检查](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-typecheck.log) |

## 保留的失败与区分

- 联调的第二次普通发送有宿主「会话重建」前缀，测试模型起初未识别它。修正夹具后保持真实输入和宿主认证。已批准删文件重开首次复测已实际建立并排程唯一实例，测试最后因 Node SQLite 返回对象无 prototype 而失败，已用字段一致性复测通过。[初次原始日志](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-chief-native.tap) · [外置图初次原始日志](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-external-native.tap)
- 4fb 冻结候选实际出现三次后续启动失败。旧只读流程、路径 B 分支及第三图停稳用例均已完成原实例或释放原 owner。第二次普通输入已接收，已打开的幕僚会话实际工具清单缺 `request_workflow_start`。前两例在同窗口完成并重用会话，第三例为原占用期间已打开的另一控制器在释放后尝试启动。问题已交桌面窗口。修正后的外置组合其余 7/8 通过，包含 B 和第三图合法交付。[旧链失败用例 4 和 8](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-legacy-native.tap) · [外置图失败用例 6](2026-11-17_workflow-chief-start-evidence/w5-4fb0663-external-native-zip.tap)

新 ZIP SHA-256 `b4317b1dbc684ab5b0ee38f9c36eeec9b129849f79ebd836c3b15272d55714bf`，上一 ZIP SHA-256 `3468589777c5251739b52f5c97a45aa56ee6735020002b49ad8c64ee33d8269d`。模型服务、真实墙钟隔日、完整操作系统重启及其他平台均未实测。

W5 组合未单独执行后台回交伪造提议、已启用委托的裁决、与另一真实卡共同排队、故意破坏 Dapr 资产、批准后改写及换源、实例已创建而回应丢失的进程边界。批准后删除外置 YAML 并关闭控制器由 W5 实际验证，其他注入窗口另核 W1 回归覆盖。
