---
id: complete-flow-window-ac-implementation
type: change
title: A4与C2安全桌面消费接线
created: "2026-10-15"
status: implemented
---

# 可以核对工具事实与报告保存，而不重复启动模型

WINDOW-A/C-1由PM正式转发客户总方案r2/A4/B2/C2文本政策1授权。开工与收口核对13份批准文档指纹不变；不修改批准提案、manifest、治理定义、Core/编排/adapter或renderer。当前行为见[功能说明](../feature/complete-flow-window-data.md)。B2与失败导入保A修复保留，不回退。

实际源文件：app/desktop/session.ts、runtime-history.ts、session-history.ts、interface.ts、request-anchor.ts、app/main.ts、app/preload.cjs。customer-input.ts已调用同一helper，无需再改。历史保护和保存能力均消费已实现Pipeline/Model，不直接调用Service或复制保护器。主进程历史推送也改经当前DesktopInterface读取，让可信历史ID登记到该窗口，不借全局别的窗口句柄。

实际新行为包括：activity.display/目标继承、typed输入及安全flags、reports/reportErrors、内部boundary/finalreceipt的状态映射；native-only原读取/parser→中立事实→公开纯投影的兼容桥；哈希锚点两端一致。新C源事件没有raw handback，modeltext只内部，回交queue.full/running.full只安全副本/占位。五受限保存/查询/capability调用和两可取消状态通知落地，真实boundmode/原handle/已登记ID守卫，查询不构造SDK或新模型轮次。

保存状态采用单一同步归并：saved通知先于原失败业务事件时只暂存，后者到来不降低已saved；保存Promise/通知/初始事件任意顺序均await前queued，源第一次继续仅一次。目标批次原成员/顺序/文本/deliveryId固定，确定未开始且receipt允许才新attempt；后来的报告不能扩入原失败批次。可能已开始、未知或损坏不自动重prompt；target仅保存重试不启动Provider。已关闭handle的失败材料发expired并禁旧操作，既有saved历史事实不伪称丢失。

测试协议同步逐项：ans-wiring、boundary-refresh、dispatch-delivery、hot-path、message-queue的**输出信封类型**改为Desktop安全事件（源stream仍内部OrchestrationEvent）；session/interface的fake生产者提供实际safe liveReport并保role/status/task/evidence断言，另断言没有raw侧车；multi-runtime的真实Core替身显式注册empty display profile，不放松生产required；目标/锚点通过实际安全字段验证。行为新增集中于handback-delivery/multi-runtime/session-history/interface/diagnostics。未修改UI renderer.test或root独立测试。

第一次A接线阶段6项真实factory因未注册profile而失败，修正替身后转绿；第一次合并回归有2项legacy错误提示断言失败，恢复原legacy保留/原因语义，新C仍固定安全提示。原失败日志随新证据留档，不删除业务断言。后续发现saved→迟到failed的乱序风险，属主实现并新增确定性通知先到用例，不靠真实递归IPC制造条件。

最终窗口角色23个授权单测文件206/206通过；typecheck退出0，git diff --check通过。新增覆盖saved先到/Promise先到、source并发保存实际一次/入队一次、固定批次/新attempt、可能开始/未知不重发、target补存一次/Provider一次、原handle更换失效、unknown-live proxy不宣称支持、真实preload五桥两订阅取消、native-only假secret/锚点/模板不升事实及原文件不变。原始命令、初始红与最终绿、精确候选和消费依赖SHA见[证据manifest](2026-10-15-complete-flow-window-ac-evidence/manifest.json)。

root已独立运行原A/C六红同断言转绿（10/10）及chat三引擎3/3；另实际Window→Pipeline→Core source-save失败hold、两retry/订阅合流、唯一继续投递与SDK原文/IPC安全场景1/1通过，结果由root在测试角色证据记录。本角色不代签其真实桌面/在线结论。

未测：生产renderer尚未由本角色实施；真实Electron全文/焦点/返回/双宽/IME和在线模型全路径由后续UI与测试角色独立验证；其它引擎在线未配置状态不被替身测试冒称完成。原native整文件读取无界风险、未知历史秘密保护限度按A4如实保留，不宣称全DLP或跨进程exactly-once。所有目标/环境夹具仅临时假数据，本角色未操作真实桌面、真实.env或目标p-limit。
