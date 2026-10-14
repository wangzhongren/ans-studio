---
id: t1-actual-main-live-history-duplication
type: fix
title: 实际桌面单轮回复在历史回推后显示两份
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [multi-runtime-independent-verification-t1]
events:
  - date: "2026-10-14"
    kind: blocked
    summary: T1 保存实际 main/preload/renderer 的单轮重复显示证据，交项目管理安排原属主定位
  - date: "2026-10-14"
    kind: verified
    summary: 原属主修复后独立实际入口23及旧119/14保护全通过，原红保留
---

# 实际桌面单轮回复在历史回推后显示两份

用户发出一条消息后，界面应只展示该轮的一份回复。T1最初用真实 Electron 主入口、preload、renderer 和全部治理业务执行一轮 Claude 输入，截图出现两份相同 `T1 claude response` 和两处拒绝信息。该问题已由原属主补齐历史/实时身份合并及原client来源，T1保持红断言复测关闭；测试角色没有修改产品代码。以下保留发现期事实及修复过程，最终结果在末段。

复现入口是 `test/测试/t1-actual-main.mjs`：临时项目的 X 角色依次选择 Pi/Codex/Claude，各发一次合法写及一次越界写。结束后精确关闭自动回交的 su；在默认 LRU=3 下重新打开三种 X 句柄，最后查看 Claude 并打开设置。**最后只有 openSession，没有再次 sendSession。** 外部 query/engine 为无网络替身，实际 Claude adapter、真实 MCP、Core handler 与 gate 均执行；未读真实 `.env`。

```sh
ANS_T1_OUTPUT='角色卡/测试/docs/change/2026-10-14-t1-runtime-evidence' ./node_modules/.bin/electron test/测试/t1-actual-main.mjs
```

原证据目录为 [T1 证据](../change/2026-10-14-t1-runtime-evidence/)。`main-engine-trace.jsonl` 只有一条 Claude 的该 T1 输入；`actual-main-observed-streams.json` 对 X/Claude 只有一个 `settled` 和一个 `handback`，轮次 ID 为 `f3cd00d1-60d9-43db-bef5-9a78b103564b`。`rowModelDebug(X).count=11`。宽/窄 [1360 截图](../change/2026-10-14-t1-runtime-evidence/actual-main-1360.png)、[960 截图](../change/2026-10-14-t1-runtime-evidence/actual-main-960.png) 均可见相同回复两次。生产和测试起止指纹相同，见 `actual-main-fingerprints.json`。

初版脚本的17项检查验证运行时选择、门禁、身份、隔离历史、掩码设置、组与宽窄布局，没有检查同轮渲染重复。因此17/17不能证明这个分支通过。全仓1212项中1211通过、0失败、1既有Windows专属跳过及SDK本地兼容门仍成立，但也没有覆盖此实际IPC组合。后续应由桌面原属主核对 `project:changed` 回推的 ANS 历史与已在流中的实时轮次如何合并，并回报修复版本；T1再用同一入口复测。

已补独立断言“one actual Claude input renders one assistant response after live/history merge”；[duplicate-repro](../change/2026-10-14-t1-runtime-evidence/duplicate-repro/)实际18项中17通过/1失败，进程exit1。该轮生产107文件指纹仍为 `f85f69abb14aa2f310f80a857fd3a106eae4c9b8ed8aba3ac0dfcf100f4c4586`，测试9文件聚合为 `81aa0aecb571c35074ba30135e7df28951883e0a0f92a6d64a2370cf765452e4`，起止不变。Claude trace带原生私有输入前缀，因此按是否包含`T1:`统计，该角色指令只有1条；末尾未再次send。

PM和原属主已确认跨层原因：Window runtime-history映射丢掉Core已有turnId，且缺eventKind；UI缺身份便无法安全区别同轮历史重放和两次文字相同的独立输入。PM冻结optional ReplayRow turnId/eventKind合同，D1透传、U1按身份合并，各自只在自身范围修复。T1保持当前红断言，等待同固定角色续接复测。此处尚未写“已修复”。

2026-10-14 当前原重复分支已独立通过：`final-1`原18/18；`final-2`保留该18项并增加真实composer direct/queued两个同文原clientID/actualturn及两个气泡，共23/23。原红与原指纹仍保存。该修复不自动证明旧历史可见性不退化：已有独立旧UI脚本的两处回归红见[当前报告](../change/2026-10-14_change_multi-runtime-independent-verification.md)末尾，继续由UI原属主核对，不由测试角色修改产品。

最终结论：原属主补齐权威turn/client来源及legacy keptcard锚点/显式null来源保留后，T1在最终U1 `b4882fe2e0c674e8d3b3d1185d60a873e9768d0529b48e3bc04c6cdf97b531aa` 候选保持全部原断言，`current-main` 23/23、`current-ui-119`119/119、`current-anchors-14`14/14全部通过；原单轮重复guard及已决拒绝卡request+1位置守卫均已转绿。全仓1226总/1225通过/0失败/1既有Windows跳过，types/diff0，269代码/测试起止不变。具体哈希/IDs/原错误区分/限制见[最终报告](../change/2026-10-14_change_multi-runtime-independent-verification.md#最终候选与独立结论)。本问题按已测范围关闭，不代表真实在线模型已验证。
