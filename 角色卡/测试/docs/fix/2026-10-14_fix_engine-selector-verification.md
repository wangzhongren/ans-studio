---
id: engine-selector-independent-verification
type: fix
title: 自绘引擎选择器的独立桌面验收
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [uiux-engine-selector-v1, runtime-config-entry-independent-verification]
events:
  - date: "2026-10-14"
    kind: created
    summary: 客户确认选择器v1设计及实施范围后准备真实桌面复测
  - date: "2026-10-14"
    kind: verified
    summary: 自绘选择器候选通过真实桌面鼠标键盘禁用与缺配置入口验收
---

# 验收范围

客户确认产品与 UIUX 选择器 v1，要求桌面UI实现后在桌面验证选择、键盘、导入前禁用与缺配置入口。测试角色只操作真实界面、读取证据与更新自有报告，不修改产品源码。规范见[设计v1](../../../UIUX设计师/docs/design/2026-10-14_design_engine-selector.md)，属主实施由项目管理审核。

计划重启实际 `npm run app`：初始未导入点击不得开菜单；取消导入仍禁用；导入 p-limit 后鼠标打开三项浅色列表、确认新项及确认当前项；键盘方向键仅浏览、Home/End、Enter/Space提交、Escape/外击/Tab取消；当前值与勾不随浏览改变；选 Claude 缺配置主条继续显示，并通过设置按钮打开正确抽屉。菜单和状态不进入聊天历史，不发送模型任务，不修改凭据。

辅助证据使用属主真实renderer受控测试覆盖视口翻转、活动项滚入、迟到响应、引擎隔离及双宽。真实屏读软件与在线 Claude 连通性不包含在本轮自动验证中，不能把 AX 属性或原型测试替代它们。

## 当前候选

桌面UI新增纯展示 `app/renderer/engine-selector.js`，在 `index.html` / `styles.css` / `renderer.js` 接入104×28触发器与160px浅色listbox。业务仍走既有 selectRuntime、主进程 missingKeys 和设置入口；不修改窗口、Model、凭据协议或前轮回交修复。

独立[当前候选SHA-256](2026-10-14-engine-selector-evidence/candidate-sha256.json)与属主最终manifest一致。[前置清单](2026-10-14-engine-selector-evidence/before-sha256.json)证明 `.env` 哈希未变化，不记录秘密值。

## 实际桌面操作与结果

通过原生 macOS UI 退出空闲旧窗口后 `npm run app` 冷启动真实主进程、preload和renderer。没有注入假 IPC，没有发送模型消息，也没有填写/显示/保存凭据。

1. 初始「尚未导入项目」，AX 显示组合框 disabled，值 Pi；实际点击并按 Down 没有开层、没有改变引擎。系统导入选择器点击取消后仍 disabled。
2. 系统目录选择器导入 `/private/tmp/ans-real-p-limit-20261014` 成功；组合框解锁，当前 Pi。
3. 点击展开、End临时浏览Claude，当前名称与selected仍Pi；Escape收层并回到组合框焦点，保持Pi。
4. Down开层、Down浏览Codex、Enter确认：值和设置标签切为Codex。缺配置主条实际显示 CODEX_API_KEY、ANS_CODEX_MODEL；缺配置导致原会话开启失败也如实显示，没有伪装为可连接。
5. Space开层、End浏览Claude、Space提交：值切Claude、菜单收起，主条显示缺 ANTHROPIC_API_KEY 和「打开 Claude 设置」。
6. Enter开层、Home浏览Pi、Tab取消：当前Claude不变，焦点自然移到「打开 Claude 设置」；Shift+Tab回到触发器。再展开、Up浏览Codex，原生截图看到临时Codex灰框与当前Claude选中底/粗字/勾分开，主区仍Claude，无系统暗色菜单或亮蓝选中样式。
7. 鼠标点Pi选项实际切Pi，主区恢复Pi对应历史；再次鼠标选择当前Pi，仅关闭菜单，当前引擎与会话内容不变。鼠标选择Claude也正常切换。
8. 展开后Home临时浏览Pi，再点击层外消息输入区：菜单关闭、当前仍Claude，外部输入区获得焦点，没有强抢回触发器。
9. 在Claude再次展开、Home、Tab、Enter：取消临时Pi并打开正确的Claude设置抽屉。AX标题「Claude 配置」，安全密钥字段空值/未设置，缺项文案准确；没有对配置进行写入。

以上是正式桌面实际结果，不是原型或离线运行台替代。窗口最后停在Claude设置可供用户查看。p-limit `git diff --exit-code` 通过，未改动上游已跟踪文件。

## 回归证据与限制

| 验证 | 结果 |
| --- | --- |
| 属主单元 | 51/51 通过 |
| 实际Electron renderer选择器专项，受控主进程接口 | 25项通过：鼠标/同项no-op、键盘/Tab/ShiftTab、外击、失焦、disabled、翻转/限高/活动项可见、双宽/长名、缺配及既有引擎隔离 |
| 既有配置与多引擎renderer回归 | CONFIG 20项、RUNTIME 16项通过 |
| 全仓 `node --test "test/**/*.test.ts"`，允许既有本地回环 | 1239项中1238通过、0失败、1既有Windows跳过；[原始日志](2026-10-14-engine-selector-evidence/full-tests-managed.txt) |
| 最终 `npm run typecheck` / `git diff --check` | 通过 |

属主交付及原始报告见[UI实施记录](../../../桌面UI/docs/change/2026-10-14_change_engine-selector.md)。极矮窗口、长名称、活动项自动滚入、窗口失焦、完整草稿/附件隔离以受控实际renderer证据为准，root没有在用户正式窗口重造这些全部状态；不能称每种情况均已原生真机复测。

AX current value、焦点与组合框/列表框在正式窗口已查看，未运行实际屏幕阅读器软件。本轮未验证Claude在线连通，也未将配置字段齐备等同账号可用。所要求的设计接入与四项真实桌面测试已完成，无提交、推送或发布动作。
