# 路径 A · T2 补充复测

冻结产品候选 `4c6efec34182563e3fa8b1ef6ef6372fe282d220`。使用实际新 Windows ZIP 已独立解包的 Dapr 资产和源码桌面控制器。每个用例使用独立临时 Git、SQLite 和受信客户响应通道，由确定性脚本替代模型服务。W5 仅补充测试。主进程与渲染层类型检查通过。[冻结主报告](../2026-11-17_path-a-dapr-evidence.md)

- 轻量验收 1/1。真实 A12b 独立角色用 `submit_report` 提交 `blocked` 并附静态证据，真实幕僚按原工具明确接受，以 `acceptanceIntensity=lightweight；运行期未验证（静态证据接受）` 写入收口。实际归档保留原措辞，交付说明绑定同一归档 SHA-256 并显示 `runtimeVerification=not-independently-verified`。客户本人批准后实际合并 `2ec43e59920c91749fafef0fa6790dc2cbfd7102`，显式查看回执时间为 `2026-11-17T07:55:30.939Z`。TAP SHA-256 `a088338bda4f31c512cad032cb2edb3360727dc214b4aa9f39d4bb2320740121`。[轻量验收与交付披露](w5-addendum-4c6efec-a-lightweight.tap)
- 旧候选反例 1/1。真实 A12b 已接受候选 `2dba59284cdf107633a603646cf5e805cc1c77b0`。在实际归档前，夹具用空 Git 提交将同一任务分支推进至 `0596af1782cf79a3307c87829d329b2b08fc8cbf`，实际独立报告 SHA-256 始终为 `8ed5696086b181f0d4de72768b3166939d7a67f2e03c8802e5d5d192b6b57745`。宿主查询停在 `archive-acceptance`，显示 `workflow-acceptance-drift`，没有归档、A13 审批卡、发布效果或 main 变化。TAP SHA-256 `e6231604982d6f255c140a8497d70c452fa2eda30de8ff6ae900ecf35748f2bf`。[已收口候选变化被拒绝](w5-addendum-4c6efec-a-old-candidate.tap)

本次测试文件 `desktop-path-a.test.ts` 的 SHA-256 为 `4d23790d0b6c3843e2fde719203a87146abefa3716f22624d8cfded1e4cd4bc9`。错误验收角色、错误基线及有界返工仍无原生组合样例。
