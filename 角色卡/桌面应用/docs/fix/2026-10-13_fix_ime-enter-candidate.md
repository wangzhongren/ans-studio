---
id: ime-enter-candidate
type: fix
title: 输入法确认候选的Enter不发送消息
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [desktop-three-pane]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户反馈输入法候选Enter误发送，桌面角色准备最小键盘guard方案待协调评审
  - date: "2026-10-13"
    kind: implemented
    summary: v1评审及客户直接授权后，仅加入组合事件绑定和三个早返回条件
  - date: "2026-10-13"
    kind: verified
    summary: 精准真实Electron同流红转绿，候选Enter保留原生默认/输入附件气泡，正常发送和ShiftEnter保持
---

# 先确认输入法候选，再由下一次Enter发送

方案v1已按客户直接修复授权及[项目管理评审](../../../项目管理/docs/fix/2026-10-13_fix_ime-enter-review.md)实施并验证，不重复申请确认。所属功能见[桌面会话](../feature/2026-10-11_feature_desktop-three-pane.md)。

修复前 `renderer.js` 聊天输入框keydown在 `Enter && !shiftKey` 时直接preventDefault并调用onSend，没有识别组合输入。中文候选以及输入法中的英文候选确认也会产生Enter，于是尚在选词的内容被追加用户气泡、清空输入并送出。

## 必要最小修复

聊天输入框监听compositionstart/end，维护仅在当前组合期间有效的布尔状态。keydown首先检查 `inputCompositionActive || event.isComposing || event.keyCode === 229`；命中就直接return，位置在preventDefault/onSend之前。这样候选确认由输入法正常处理，应用不取消事件、不追加气泡、不清文字/附件、不调用send IPC。

compositionend立即清除状态；结束后的下一次正常Enter仍走原发送逻辑，恰一次发送。Shift+Enter保持原换行逻辑，发送按钮保持现有明确点击行为。无计时器、无“下一次Enter一律吞掉”的标记，不让鼠标确认候选后正常Enter被永久抑制。

229兼容保护是必要部分：compositionend可能先于候选确认的最后keydown，使isComposing已为false，但IME处理的keydown仍可带229。MDN官方说明直接推荐双判：[keydown与IME](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event#keydown_events_with_ime)、[isComposing定义](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing)。不据事件结束时间猜测发送意图。

只改输入边界，不改onSend、消息队列、IPC、附件或授权政策；没有选装项。

## 精确写集

- `app/renderer/renderer.js`：聊天输入框组合状态与keydown早返回。
- `test/桌面应用/e2e/ime-enter.mjs`（新）：独立、短的离线Electron行为回归；真实renderer/preload，受控IPC替身记录发送。
- 本文、现有工作台feature、feature-map/memo/changelog：实施验证后更新实际行为与证据。

既有全harness、其它角色源码、main/preload/session、全部未提交历史修复和refreshListing补丁保持。新脚本在本角色已接受测试目录内，不引入生产helper或接口。

## 精准离线验证

新脚本加载真实Electron页面并直接驱动输入框事件：

1. compositionstart→Enter（即使该键isComposing=false/keyCode13），仍组合中：defaultPrevented=false，输入/图片附件/气泡行数原样，send次数0。
2. 键自身isComposing=true的中文与英文组合输入：同样不取消事件、不发送。
3. compositionend→keydown（isComposing=false/keyCode229）确认候选：不发送；随后正常Enter13恰一次发送，实际IPC收到完成后的文字及附件。
4. 鼠标确认所对应的compositionend后，无229的下一次正常Enter立即发送；无任意时间窗或永久吞键。
5. 正常键盘Enter恰一次发送；原Shift+Enter保留换行/不发送（用原生键盘输入验证），发送按钮行为保持。

检查真实可观察效果，包括事件是否取消、输入/附件是否仍在、用户气泡和IPC调用次数；静态字符串钉不能替代。事件流为可控浏览器事件，不冒充操作系统输入法候选窗口的真机验收。脚本只操作自有临时窗口/替身，不操作正在运行的用户ANS，不调用真实模型。

## 实际证据

精准脚本先揭示旧故障：[红报告](</private/tmp/ans-ime-enter-red-01a133d2/report.txt>)候选Enter被取消，文字“候选中文”→空，附件1→0，气泡0→1，send IPC0→1，exit1。修复后相同事件流：[绿报告](</private/tmp/ans-ime-enter-green-01a133d2/report.txt>)所有flag为true、E2E_DONE=1、无ERROR/WATCHDOG，exit0。

真实Electron44.7.0/Node24.21.0页面中三个忽略分支均保留附件1及原文字/气泡，send IPC0；结束后的Enter实际送出完成文字和附件一次。229事件实际值229且isComposing=false；鼠标结束后下一Enter不必等待；Shift+Enter经原生sendInputEvent产生换行且不发送；明确按钮在组合状态中仍保持原行为。组合事件为受控流，不冒充操作系统候选窗真机验收。

实际命令：`ANS_IME_OUTDIR=/private/tmp/ans-ime-enter-red-01a133d2 node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs`（改前红）；同入口 `ANS_IME_OUTDIR=/private/tmp/ans-ime-enter-green-01a133d2`（改后绿）；`npm run typecheck`、两个文件的 `node --check`、`git diff --check`和原patch逆向保持检查均exit0；`node --test test/桌面应用/renderer.test.ts` **41/41**，[日志](</private/tmp/ans-ime-enter-renderer-tests-01a133d2.log>)。没有重跑全harness或无关全仓。

基线：HEAD `e3d9997e2918117239029d17b7db34f83b90b7a3`，renderer sha256 `959740486ba447272ef30a38c634e5b77d82e3dcd1e2ef8ad7907d024d47b191`；桌面boundary sha256 `f357d53a605e5f68cc8fd47f672765ce532407e723d3c14aea13304eafe56ae4`。最终renderer sha256 `0f7375509de1964a4176861be2ef204cda85be7f1e808a9d31568deb6d453f59`。产品只增加输入绑定5行，onSend/main/preload/session等其余桌面源哈希保持；历史未提交工作与refreshListing补丁完整保留，逆向校验通过。未操作用户正在运行的ANS，加载方式交协调方决定。
