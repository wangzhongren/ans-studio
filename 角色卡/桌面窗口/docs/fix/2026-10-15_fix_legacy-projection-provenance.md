---
id: legacy-projection-provenance
type: fix
title: 保留旧历史投影的真实来源与元数据省略标志
created: "2026-10-15"
status: implemented
---

# 旧分类不能被显示成原生执行事实

WINDOW-A-LEGACY-PROVENANCE-FIX-1按PM预留与root可信转发实施，属于既有A4合同透传修复。UI发现Window最终mapper漏了protected tool的statusSource/target.source；root独立以真实native-only读取链留红，见[原失败证据](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/a-legacy-provenance-red.json)。不修改root测试、原红证据、批准设计或旧final manifest。

runtime-history.ts现在把Core已保护的t.statusSource原值交到ReplayRow.legacyStatusSource、t.target.source原值交到legacyTargetSource，缺来源仍缺席；template-only目标已由中立投影排除，不恢复目标或process。每条protected entry的metadataOmissions也原样透传到ReplayRow.metadataOmissions，直接引用Model的RuntimeProtectedLegacyHistoryEntryV1字段类型。包括timestamp、anchor-token、oversize-identity，Window不自己猜“为什么被省略”。statusSource类型也直接引用原Model字段。

实际源码仅runtime-history.ts及session-history.ts的ReplayRow类型；自有测试仅multi-runtime.test.ts补一条真实native fixture，经现reader→中立转换→Pipeline→Core保护→Window mapper验证：同call继承目标保same-call、实际native结果保native-result、shell旧文本分类保legacy-classifier、模板目标/process不出现；受保护时间戳和超预算身份分别携带Core的metadata省略标志。原JSONL逐字不变，临时环境只使用新造fake键值，不读取真实凭据。

专项命令 `node --test test/桌面应用/multi-runtime.test.ts test/桌面应用/session-history.test.ts` 为35/35；`npm run typecheck`退出0，`git diff --check`通过。新修复候选/日志见[叠加manifest](2026-10-15-legacy-projection-provenance-evidence/manifest.json)。上一Window-A/C-1的206项结果仍是其原候选证据，不把本次35项误计成新全仓/真实桌面验收。

不改Core/Model/renderer、raw读取范围、预算或政策；UI由独立属主消费新保留字段。真实桌面与root原断言green由测试角色另记，本角色不操作窗口。当前功能见[安全桌面数据](../feature/complete-flow-window-data.md)。
