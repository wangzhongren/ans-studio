# 渲染轮复审摘要（2026-10-17，测试角色）

## 1. 全量

| 项 | 值 |
| --- | --- |
| 命令 | `node --test "test/**/*.test.ts"` |
| 结果 | **2153 tests / 2058 pass / 93 fail / 2 skip**（exit 1） |
| 对比上轮 | 2152/2057/93/2 → **+1 测试（并发属主新落）、红数 93 不变** |
| 93 红组成 | 依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1（与上轮完全一致，无新增） |

## 2. Electron e2e `uiux-v2.mjs`

| 分支 | 结果 | 失败点 |
| --- | --- | --- |
| 当前 renderer（工作树） | exit 1 | **仅** `virtual visible nonempty`（`uiux-v2.mjs:1044`）；其前所有检查（含原失败点 `routine collapsed; failure direct; assistant untouched`，:964）**全部通过** |
| HEAD renderer 独立 A/B | exit 1 | **同点同观测**：`virtual visible nonempty`（:1044） |

**HEAD 臂构造（测试角色独立复现，不修改产品文件）**：在 `test/测试/.tmp-e2e-head-arm/` 建立隔离副本
（复制 `app/`、`src/`、`test/桌面应用/e2e/uiux-v2.mjs`），用 `git show HEAD:app/renderer/renderer.js`
替换副本中的 renderer（sha256 前 8＝**7d18858b**，与桌面UI 自报一致），以
`node_modules/.bin/electron <副本>/test/桌面应用/e2e/uiux-v2.mjs` 运行；运行后删除副本。两臂均在同一
`check` 抛 `virtual visible nonempty`，且均**已越过** :964，故该红**先于本轮渲染改动存在**，非本轮引入。
（桌面UI 的「换回 HEAD renderer.js 复跑同点仍红」证据经此独立复核：**属实**。）

## 3. 新语义抽查（独立 Electron 探针 `test/测试/render-md-ready-probe.mjs`）

`MD_READY_PROBE_PASS 6`（exit 0，report JSON 见 `renderer-round-md-probe-report.json`）：

1. 源码字面：`appendAssistant` 新建行恒 `mdReady: true`（且旧 `roleBusy` 文本分支已移除）；
2. 源码字面：`upgradeStreamingMarkdown` 仍只升级 `mdReady: false` 助手行，settled 路径仍调用它（旧行安全网在位；
   新渲染进程内无旧行，运行期不可达——如实记录）；
3. 运行期：包含 `##` 与 Markdown 表格的助手消息在 **turn 未 settled** 时即渲染为 `<h2>`/`<table>`，
   无 `is-streaming`；
4. 渲染后内容逐项保留（标题/表头/单元格文本齐全）；
5. settled 不重复插行；
6. settled 后 Markdown 不回退。

## 4. 结论

- 本轮渲染改动**未新增任何红**；原失败点已修复；剩余 `virtual visible nonempty` 经独立 A/B 证明为既有问题
  （与本轮 renderer 改动无关）。新语义按客户要求成立。
- 建议：`virtual visible nonempty`（滚动 55% 后无可见 `.msg`）由桌面UI/桌面窗口在后续轮次独立定位；
  本轮不因此判返工。
