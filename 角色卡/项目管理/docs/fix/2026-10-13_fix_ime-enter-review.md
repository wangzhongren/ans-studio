---
id: ime-enter-review
type: fix
title: 输入法确认候选不误发送的评审与验收
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [ime-enter-candidate]
events:
  - date: "2026-10-13"
    kind: created
    summary: 项目管理评审桌面角色最小输入法键盘guard，按客户直接修复请求安排实施
  - date: "2026-10-13"
    kind: verified
    summary: 同流红绿与独立精准Electron验证通过，当前用户界面已安全重载并保留项目与会话
---

# Enter要区分确认输入法候选和发送消息

客户反馈输入法英文候选需要Enter确认，此时聊天误发送。当前源码只判断Enter且非Shift，确实没有输入法状态保护。

推荐实施[桌面方案v1](../../../桌面应用/docs/fix/2026-10-13_fix_ime-enter-candidate.md)，评审时SHA-256为 `c5df29dc72e8040a7cd5d6d1efb106a0e29f3a7a2abfbafaa003b78fb61e99c1`。composition状态、isComposing和229保护在取消默认事件及发送之前；组合结束立即清状态，避免时间窗吞掉正常发送。MDN的[官方keydown说明](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event#keydown_events_with_ime)明确结束事件可能先于键盘事件，此时229仍能表明IME处理。

本次只修改桌面角色的输入绑定、精准离线行为回归及相应文档，没有IPC/下层/授权/日志接口变动。其它角色无需修改；原有工作作为基线完整保留。用户“这个需要判别一下”授权本次必要修复，不重复索要该授权。

验收依真实renderer中的事件默认行为、发送IPC、文字/附件和用户气泡结果，不以静态字符串测试代替。中文与英文候选、仅组合flag、仅isComposing、end先于229键、鼠标选词后正常Enter均需核对；普通Enter发送、Shift+Enter换行、按钮点击保持。用同一受控事件流先复现旧故障再验证修复，不运行真实模型项目。

最终产品仅输入绑定新增5行，renderer SHA-256 `0f7375509de1964a4176861be2ef204cda85be7f1e808a9d31568deb6d453f59`。桌面角色同流红绿证据显示原来候选Enter取消默认、清文字/附件、气泡和send次数各增1；修复后四类组合事件均不取消、不清内容、不发送。结束后普通Enter、鼠标确认后Enter、原生Shift+Enter换行和按钮正常。精准报告 `/private/tmp/ans-ime-enter-green-01a133d2/report.txt` 全真且E2E_DONE=1；固定测试角色独立重跑一次报告 `/private/tmp/ans-ime-enter-independent-01a133d2/report.txt` 同样通过。受控浏览器事件不冒充所有系统输入法候选窗口的真机验证。

renderer专项41/41；项目管理核对源码、红绿报告、独立报告与最终hash，类型/语法/差异检查通过。没有重跑无关全仓或真实模型项目。

完成后先观察用户窗口：输入无草稿、无附件，su空闲。通过原生View→Reload重载界面，原项目 `ssh-tool`、su会话与历史正常恢复，输入仍为空，没有发送新消息或关闭后台会话。此次修复已加载到当前界面。没有提交或发布。
