---
id: test-uiux-v2-offline-regression
type: design
title: v2 页面独立离线回归方案
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: designed
related: [desktop-uiux-v2-implementation, ans-uiux-interaction-v1]
events:
  - date: "2026-10-13"
    kind: designed
    summary: 固定测试角色读取实现方案并准备独立离线验证，等待最终候选
---

# 失败记录不被折叠，换角色不丢输入

本方案独立验证已获客户授权的 v2 UI1–UI3，实现输入见[桌面方案](../../../桌面应用/docs/design/2026-10-13_design_uiux-v2-implementation.md)、[PM阶段释放](../../../项目管理/docs/change/2026-10-13_change_uiux-implementation-acceptance.md)与[v2交互说明](../../../UIUX设计师/docs/design/2026-10-13_design_ans-uiux-interaction-v1.md)。受测功能是[桌面会话](../../../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)。本上下文固定为测试角色；只改本角色测试与文档，不修生产代码或桌面属主测试。

当前只是准备方案。尚未执行最终候选验证；不宣称实现通过、产品验收或模型成功。项目工程法案为草稿，本次采用其中已确认的角色隔离、边界和证据规则，不将待确认条目升级为新约束。

本段与以下用例表保留设计时的计划口径；最终冻结候选已按方案完成离线执行，结果与限制见[独立回归报告](../change/2026-10-13_change_uiux-v2-offline-regression.md)。不代替产品/UIUX验收或真实模型测试。

## 输入和观察

| 受影响流程 | 独立输入 | 必须观察 |
| --- | --- | --- |
| JSONL → ReplayRow → 工具展示 | 同目标调用/结果、明确失败、缺结果字段、明确工具返回、确认请求/结论、stdout中有“成功”文字 | 调用不是完成；失败直接可见；未知保留未知；目标关联准确；正文不铺进聊天；交互锚点不变 |
| 实时与回放 | 同一组事实分别作为SessionEvent和ReplayRow | 状态一致，accepted没有可靠结果不变成成功；失败/用户/助手/未决/轮次形成分组边界 |
| 长聊天 | 150以上真实行，组在可见/离屏位置，追加与重建 | 展开/收起恢复可见内容及offset；用户展开态保留；上翻追加不贴底；未决定位按聚合后索引 |
| 角色工作与停止 | A busy+三条队列；客户消息/派发/回交；撤回成功、失败和延迟 | 一份工作列表；真位次；只有未投递客户消息可撤回；请求中与失败保留全文；停止只结束当前，不清队列/不造答复 |
| 跨角色异步输入 | A草稿/附件，B独立草稿；延迟图片/发送完成后切角色 | 结果只更新原角色；B输入附件保留；返回A恢复输入；IME组合Enter不发送、不改变附件和气泡；所有显式点角色保留U-1跳最新/未决优先 |
| 布局 | 1360×860、960×620，长路径、长输入/附件、宽表/代码 | document/body/.app无横滚；抽屉开关不改聊天列宽；输入/发送/停止可达；抽屉避开实际composer；Pi单标题/关闭 |

## 执行方法和写集

新增 `test/测试/uiux-v2-replay-regression.test.ts`，从真实 `parseSessionJsonl` 进入，再消费真实 `ANSToolRows` 和 `UiLabels.replayPlan`。独立JSONL字符串在内存生成，不写项目、会话或配置。测试校验实际输出与用户可见状态，而不是搜索函数名。

最终候选若属主 `test/桌面应用/e2e/uiux-v2.mjs` 已覆盖上述真实renderer路径，先检查其确为假IPC、隔离userData、无业务项目、无Pi工厂，再只读运行，不修改/弱化属主断言。若独立输入需补足，新增 `test/测试/uiux-v2-renderer-regression.mjs`：只启动独立Electron窗口加载真实index/preload，虚构不存在的项目标识仅作IPC快照键，所有IPC由内存替身返回，无SessionManager、模型或业务项目创建。GUI截图验收统一交PM用CUA操作，本角色不驱动用户ANS。仅在最终候选公布后执行。

拟命令：`node --test test/测试/uiux-v2-replay-regression.test.ts`；候选具备后运行属主纯离线展示组 `node --test test/桌面应用/tool-rows.test.ts test/桌面应用/markdown.test.ts test/桌面应用/renderer.test.ts`。其他属主文件先核查；例如hot-path整文件包含临时业务项目，仅可用明确的test-name-pattern执行纯push-batcher/展示用例，不能整文件运行。仅在新证据需扩大时增加用例；不跑包含真实项目/模型探针的全库测试。真实renderer脚本与IME脚本经离线核查后按PM安排执行。

运行前记录HEAD、六个app文件及相关测试SHA-256、Node/Electron/平台、具体命令与fixture。每次候选变动使受影响旧结果失效，复跑对应检查。失败记录最小输入、预期/实际与行号，交PM协调属主修复；无法运行单列“未验证”，不算失败或通过。最终报告只证明受控离线呈现与IPC回归，不能说明模型、真实网络、真实撤回服务或客户业务完成。

PM本轮精化：所有显式点角色都保留既有U-1跳最新/未决优先，包含跨角色；不能用原型内部readScroll改变导航。只有普通刷新、增量、展开/收起、回放与抽屉开关要求保留聊天阅读位置。缺实时细原因、命令或退出码采用诚实降级，不要求桌面编造或扩写src契约。

已读代码时桌面仍在开发，本方案不把中间实现缺口提前写成最终缺陷。

PM已核对并核准本方案写集后，现已准备本角色独立测试文件，共9个行为案例，所有JSONL输入在内存生成。shell用例采用Pi工具真实首行格式及明确isError/details失败，不运行命令；另用stdout中的伪exit/成功确认其不会升级未知状态。尚未运行。

后续产品B3验收指出异常首句隐藏及执行前拒绝误称执行失败，PM交属主修复。本角色据此增加第10个纯映射案例和真实renderer summary可见性检查：只读取 `.sys-denied summary`，要求已知文件不存在/ENOENT、shell exit2默认可见，执行前policy denied保留拒绝原因/未执行且不称执行失败。最终候选修复后重新执行，旧版9例通过不能代表新helper或最终B3通过。
