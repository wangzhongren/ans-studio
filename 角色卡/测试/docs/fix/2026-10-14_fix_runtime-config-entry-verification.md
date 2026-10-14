---
id: runtime-config-entry-independent-verification
type: fix
title: 引擎选择前提与缺配置入口的独立验证
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-14"
    kind: created
    summary: 真实桌面复现未导入仍可选Claude且工作区无缺配置提示
  - date: "2026-10-14"
    kind: verified
    summary: 客户确认revision1后完成原生桌面禁选、缺项及设置按钮复测
---

# 用户要求与复现

用户要求：缺少必填配置时主界面应提醒并提供按钮打开所选引擎设置；未导入文件夹不得选择引擎，导入后才允许选择。

真实桌面复现：未导入项目时下拉框仍可从 Codex 切换 Claude，工作区没有缺配置提醒。点击右上 Claude 设置后，抽屉显示 ANTHROPIC_API_KEY 未设置以及「Claude 配置不完整」消息。未输入或保存凭据。root 保持独立测试角色，只在测试边界内记录证据。

## 已批准的验证范围

- 未导入项目时引擎选择器 disabled，不能通过控件或 change 路径改变当前引擎；导入取消/失败不得解锁。
- 成功导入目录后才允许选择，Claude 缺 ANTHROPIC_API_KEY 时主工作区出现缺配置提示与「打开 Claude 设置」按钮，点击直达既有 Claude 抽屉。
- Pi/Codex 使用相同缺项机制，缺项取既有主进程 missingKeys，不在测试或渲染侧复制第二份配置规则。
- 快速切换引擎或项目，迟到配置响应不得覆盖当前提示；配置读取失败不伪装齐备。保存后刷新状态，已齐备不继续显示缺项按钮。
- 秘密值不回显，历史/确认/回交/消息队列不受影响。

生产与属主测试由桌面UI角色按照PM审核后的 revision 1 修改，客户已确认同版实施。独立测试复用现有真实renderer运行台并操作真实桌面，没有额外新增重复的测试角色用例。

## 修复后的原生桌面验证

以当前候选的 `renderer.js`、`index.html`、`styles.css` 重启 `npm run app`，真实 Electron 主进程与 preload，不注入假 IPC。

1. 初始界面「尚未导入项目」，AX 中引擎选择器为 `(disabled)`，值为 Pi。实际点击没有展开菜单，当前引擎不变。
2. 点击导入项目，再在系统文件夹选择器点击取消；回到「已取消导入」，选择器仍 disabled。
3. 再次从系统文件夹选择器导入 `/private/tmp/ans-real-p-limit-20261014`。项目路径、su/测试/维护角色正常显示，选择器启用。
4. 展开引擎选择并点击 Claude。设置抽屉关闭时，聊天区外主条直接显示「Claude 配置不完整，缺：ANTHROPIC_API_KEY。」与可操作按钮「打开 Claude 设置」。不需要发送消息或等会话报错才出现。
5. 点击主条按钮，右抽屉标题为「Claude 配置」，密钥字段为安全输入、空值、placeholder「未设置」，抽屉内缺项提示也正确。原生截图检查主条、按钮与抽屉实际布局没有溢出；按钮不进入聊天流。没有输入密钥、点击显示或保存。

当前产品[候选 SHA-256](2026-10-14-runtime-config-entry-evidence/after-sha256.json)与属主最终 manifest 完全一致；[实施前清单](2026-10-14-runtime-config-entry-evidence/before-sha256.json)证明 `.env` SHA 未变化。p-limit 已跟踪文件 `git diff --exit-code` 通过。前轮回交修复和其它会话的图标/主进程工作未由本测试角色修改。

## 自动化与边界证据

| 验证 | 当前结果 |
| --- | --- |
| 属主 renderer/runtime UI 单测 | 50/50 通过 |
| 真实 Electron renderer 配置专项，假主进程配置响应 | 20 项通过：导入前守卫、取消/失败、空文件夹解锁、三引擎缺项、键盘设置入口、960/1360 布局、迟到响应、保存缺项/失败/补齐及读取失败 |
| 既有 renderer 多引擎回归 | 16 项通过 |
| 全仓 `node --test "test/**/*.test.ts"`，允许既有本地回环监听 | 1238 项中 1237 通过、0 失败、1 既有 Windows 跳过；[原始输出](2026-10-14-runtime-config-entry-evidence/full-tests-managed.txt) |
| `npm run typecheck` / `git diff --check` | 通过 |

属主原始报告与双宽截图在[配置专项证据](../../../桌面UI/docs/fix/2026-10-14-runtime-config-entry-evidence/config-report.json)和[多引擎回归](../../../桌面UI/docs/fix/2026-10-14-runtime-config-entry-evidence/runtime-regression-report.json)。原生桌面实际配置缺失的三个用户验收点由 root 测试角色操作证明；保存补齐、异步错误/竞态和双宽布局由真实renderer离线夹具验证，不冒充实际凭据保存或在线服务测试。

此修复仅展示必填配置缺项，不证明密钥有效或服务可连接。本轮未对 Claude 发起在线模型请求，也未改变用户真实配置。请求的修复和桌面复测已完成，无提交/发布动作。
