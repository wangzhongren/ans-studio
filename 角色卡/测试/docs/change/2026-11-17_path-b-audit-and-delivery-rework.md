# 路径 B 范围审计与交付说明返工验证

2026-11-17 · W5 测试 · T3。候选 `8ac13a970f411b3123aa109c54c9c203b0bbd0d1`，复验冻版 [B1](../../../独立验收/docs/design/2026-11-17_path-b-dapr-b1.md) V1 的两项具体偏差。采用实际 `createDesktopInterface` 项目入口、角色工具、受信客户卡业务通道、Windows 原生 Dapr 1.19.1、SDK 3.19.0、SQLite 与独立 Git 仓库。角色输出、目录选择、客户动作与等待派发时的网络状态由测试夹具控制。真实 Renderer 的查看动作由桌面 UI 验证，装配另实测最终解包应用启动。

## 观察结果

| 返工目标 | Windows 业务层观察 |
| --- | --- |
| B2 范围审计 | 越界候选 `src/unowned.ts` 被真实角色工具拒绝，零 `b3-advance`、零 `scope_decision`。原 B3 受理后同内容重放成功，换内容同键拒绝。模拟模型离线使 B3 阶段任务已保存而未送达。关停后以同库、同项目重开，Dapr 恢复且只收到原任务，范围审计仍只有一行。审计绑定实际幕僚轮次、请求摘要、本次 B1 尝试和可按哈希读取的报告、`main` 基线及任务分支、`requestedEvidence` 来源与派生 `worker → src/core/snake.ts` 写集。 |
| B4 合并与待送达 | 真实客户卡批准后，本地 Git 合并先发生。临时 SQLite 触发器只阻断该实例 `release-merge` 作用结算，观察到 Git `main` 已前移，效果行保持 `claimed`，没有 `release-merged` 或交付说明。关停后移除触发器，重开按现场核对原合并并补记一次闭环和一份独立待送达说明。Git reflog 全部相同，合并具有真实基线和任务分支双父，变更仅有授权文件。 |
| 存量补齐 | 使用上述实际产生的实例和 Git 记录，将应用关停后只删除两张新增记录 `scope_decision`、`delivery_note`。既有 B3、B4 事实、证据、Git、Dapr 历史保持原样，收件回执行数原本就是零。重开按原事实补出相同稳定 ID 的审计与说明，仍待送达，Git reflog 保持。该样本通过移除新增记录构造历史账库形状。 |
| 查看与回执 | 错项目、无有效查看令牌或标识错配无法送达。读取说明可见原合并 OID、授权文件、Git diff 摘要、运营报告哈希及运行期尚无独立验证的标记。读取本身仍待送达。明确查看后的回执写入一次，同令牌重放和重开后重新获取令牌都返回首次 `deliveredAt`，重开前令牌失效。 |
| 客户拒绝 | 独立实例经真实客户卡拒绝后停止。无说明、无效果认领、无合并结果；`main`、reflog 保持原状；拒绝重放成功，事后反向批准拒绝。 |
| 批准文件与实际合并差异 | B3 在任务分支提交 A `src/core/snake.ts`、B `src/core/w5-companion.ts`。真实 B4 预览形成前，隔离仓的 `main` 独立提交同值 A，再回任务分支。客户经真实卡批准 A/B；卡绑定当时的 `main`。原提交 `3d603af` 实测只合入 B，健康 B4 等待 60 秒仍缺闭环及说明。修正版保存实盘仅 B、独立从 Git 计算的该差分 SHA、真实双父合并 OID，并在查看后写一次回执；重开保持首次时间和同一 reflog。 |

旧返工候选 `3d603af` 在合法子集检查加入前用当时随包资源执行 9 项原生用例，9/9。加入子集用例后，在独立检出的旧源码中，用相同夹具与原生资产复现真实失败。该用例的首次准备运行受 Windows Git 系统换行配置影响，未进入 B4；补验仅对夹具的独立 `main` Git 命令设定 LF，并通过应用实际工作区检查确认干净。系统及仓库持久配置未改。 [首轮真实 Windows TAP，2/2](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-audit-delivery-first.tap) · [旧返工包原生，9/9](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-native-packaged-assets-final.tap) · [旧候选子集缺说明复现](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-actual-subset-3d603af-reproduction-2.tap) · [修正版先导子集，1/1](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-actual-subset-fixed-source-2.tap)

## 最终包与复现

Windows x64 ZIP 为 `ANS-Studio-2.0.0-win-x64.zip`，547,098,138 字节，SHA-256 `3d39ff874033e953067b024f027c84c29f39c50536621ff68c01e058f20f10a8`。W5 比对了最终源码与同包 14 个改动产品输入、实际测试所用的 3 个包内原生资产及 ZIP 摘要。业务组合从该候选源码启动 Desktop Interface，使用同构建随包资源。 [W5 候选绑定](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-final-candidate-binding.json) · [W3 ZIP 输入校验](../../../../release-output/audit-delivery-rework-final/windows-local-zip-sha-and-inputs.json)

```powershell
$env:ANS_W5_DAPR_ROOT = (Resolve-Path 'release-output/audit-delivery-rework-final/win-unpacked/resources').Path
node --test --test-reporter=tap --test-concurrency=2 'test/测试/durable-workflow/*.test.ts'
npm run typecheck
npm run typecheck:renderer
```

最终同构建 Windows 原生用例 10/10，包含本轮新增 3 项以及旧路径正常链、审批重开、回交中断、模拟离线派发、Git 配置防护和两项 YAML 验证。最终提交的主进程和 Renderer 类型检查均通过。定向回归共 56 项，55 通过、1 跳过、0 失败。跳过项是普通 Node 测试入口未配置真实 Electron 的旧任务抽屉场景。真实 Renderer 与 preload 的同版 Electron 测试另为 3/3。最终 ZIP 另经独立解包，在 Windows 前后两次实际启动并恢复 Dapr 等待实例。 [最终原生 TAP](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-native-final-subset-package.tap) · [类型检查](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-typechecks-subset-final.log) · [最终定向回归](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-affected-regression-subset-final.tap) · [真实 Renderer 和 preload](../../../../release-output/audit-delivery-rework-final/renderer-ipc-test.tap) · [最终 ZIP 运行](../../../../release-output/audit-delivery-rework-final/windows-local-zip-runtime.json) · [原始证据 SHA-256](2026-11-17_path-b-audit-and-delivery-rework-evidence/w5-raw-sha256.tsv)

## 范围

新证据针对上述 Windows 两项修复。保留原 B1 关于完整故障矩阵、真实 OS 重启、macOS 两种架构和线上模型的证据缺口。沿用原轮全量及冻结对照，返工执行受影响定向验证。 [上一轮 W5 报告](2026-11-17_path-b-dapr-evidence.md)
