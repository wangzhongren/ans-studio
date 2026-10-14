---
id: desktop-preserved-card-replay-anchor
type: fix
title: legacy全量回放把原确认卡放回请求与结论之间
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-live-history-merge, desktop-runtime-choice]
events:
  - date: "2026-10-14"
    kind: designed
    summary: 根据正确当前IPC夹具中的原已决卡锚点红项定位保留卡错误进入空bucket
---

# legacy全量回放把原确认卡放回请求与结论之间

已回“不同意”的确认卡遇到legacy历史前插段落后，决定仍在，但卡跑到了新历史最前面。T1在补齐当前history-get/liveviews/三元身份的正确夹具中观察到：requestIndex2、conclusionIndex3，原卡index0；原“卡在请求之后、结论之前”断言为红。这是实际渲染缺陷，与此前不完整夹具NoHandler造成的两个红项不同；本次不改首次贴底或错误读取语义。

根因在 `renderer.js::preserveUncoveredRows` 与 `appendSaved`：旧Pi行没有turn token，operator被放进空身份bucket，重建时先于全部历史插入。`appendPreservedRow`随后把位置0和新行表身份写入请求登记，优先级高过新历史的真实request/conclusion锚点。

必要最小修复只在新历史确实带同一窗口 `anchorKey` 和 `request/conclusion` 标识时，延后原operator记录。先建立canonical回放锚点，再通过原 `operatorAnchorIndex` 把原卡DOM插回请求之后或结论之前；不重建卡片、不改已决/未决状态。插入使后续行右移时，同步修正回放锚点与同表保留卡索引。缺真实锚点的记录继续原保留路径，不根据标题/正文猜位置，不丢卡。

同一保留路径还必须正确复制未知token：`registerRow`原来用 `o.replayToken || rowReplayToken`，保留记录明确传null时仍会继承正在回放的最后一条已知turn token。下一次full可能误认卡已被历史覆盖，重新物化卡。必要修正只区分“未传token属性”和“明确null”：前者沿用当前呈现token，后者保留未知，不推造权威身份。新增连续known-turn full重建后原无anchor确认DOM仍相同的断言；不扩展错误读取、首次滚动或授权语义。

写集为自有 renderer、已授权 `e2e/uiux-v2.mjs` 及资料，必要时自有精确单测；不写T1脚本、窗口、Core、SDK、权限或真实env。先跑本侧60项与受控真实Electron的legacy已决卡前插/后台重建回归，并保留原DOM、决定、锚点顺序及9项已知轮次合并保护。产品源码变化后旧实际23项不冒称当前证据，最终T1重验由项目管理安排。当前完整流程见[运行时会话](../feature/runtime-choice.md)，前一阶段见[历史合并修复](2026-10-14_fix_live-history-merge.md)。

## 本侧实际候选与验证

已按上述最小修复实施。生产只改 `app/renderer/renderer.js`：显式null token保持未知；有真实request/conclusion锚点的原operator延后复用DOM插入，同步右移后续锚点索引。测试只扩自有 `e2e/uiux-v2.mjs`，T1源及所有原断言未改。首次滚动、读取错误路径、Window/Core/SDK/权限都没有改动。

当前[60/60原有单测](2026-10-14-preserved-card-anchor-evidence/unit-60.txt)、[真实Electron12项](2026-10-14-preserved-card-anchor-evidence/electron-12.json)、[tsc exit0](2026-10-14-preserved-card-anchor-evidence/typecheck.txt)通过。12项包括原9项、legacy已决卡前插/后台重建两项和连续known-turn full保留原无anchor卡DOM一项；确认index=requestIndex+1且在conclusion之前，后续conclusionIndex正确右移，原不同意与pending状态及原DOM不丢。显式null问题先加入真实回归并观察[原红](2026-10-14-preserved-card-anchor-evidence/explicit-null-before-red.json)，修正后保持同一断言通过；新增fixture首次括号笔误[如实记录](2026-10-14-preserved-card-anchor-evidence/fixture-startup-error.txt)，未计通过。

[原正确当前契约T1卡锚点红](2026-10-14-preserved-card-anchor-evidence/independent-card-anchor-before-red.json)保留，与此前NoHandler前置问题明确区分。本侧没有改独立夹具或放宽断言。[宽窗](2026-10-14-preserved-card-anchor-evidence/merge-1360.png)、[窄窗](2026-10-14-preserved-card-anchor-evidence/merge-960.png)为真实Electron截图。

最终19文件[manifest](2026-10-14-preserved-card-anchor-evidence/candidate-final.json)为 `b4882fe2e0c674e8d3b3d1185d60a873e9768d0529b48e3bc04c6cdf97b531aa`；相对上一静态守卫候选仅renderer.js与自有e2e发生改变。**产品源码已变，因此此前独立actual23不冒称当前证据**。本侧已冻结，T1随后重跑actual23、旧UI119、锚点14、全仓与类型检查，再由PM记录最终验收。
