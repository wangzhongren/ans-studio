# 桌面UI边界文档

本表与运行时读取的 `boundary.yaml` 条目一一对应；两者表达同一个 Section 1，不产生额外权限。未列路径默认只读。`role-card.md`、`boundary.md`、`boundary.yaml` 仅由 ANS Governance 维护。新增目录、改动归属或增删逐条列出的路径必须交 Governance 处理并取得客户授权。

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录 | `app/renderer/` | 渲染进程前端（HTML/CSS/renderer.js 与 markdown/role-status/tool-rows/ui-labels 纯函数模块及 vendor 库） |
| 单文件 | `test/桌面应用/markdown.test.ts` | 渲染侧单测：Markdown 渲染与 vendor pin |
| 单文件 | `test/桌面应用/renderer.test.ts` | 渲染侧单测：渲染源码不变式守卫 |
| 单文件 | `test/桌面应用/tool-rows.test.ts` | 渲染侧单测：工具行/回放纯函数 |
| 单文件 | `test/桌面应用/e2e/uiux-v2.mjs` | 界面回归：UI/UX v2 交互（离线替换 IPC） |
| 单文件 | `test/桌面应用/e2e/ime-enter.mjs` | 界面回归：输入法候选 Enter 不误发送 |
| 单文件 | `test/桌面应用/e2e/bench-storm.mjs` | 界面基准台：渲染热路径 |
| 单文件 | `test/桌面应用/e2e/uiux-design-audit.mjs` | 设计对齐测量夹具（renderer 两档实测，只读） |
| 单文件 | `test/桌面应用/e2e/uiux-prototype-measure.mjs` | 设计原型测量夹具（只读载入 UIUX 原型） |
| 单文件 | `test/桌面应用/runtime-ui.test.ts` | 多引擎选择、运行时组及设置展示的渲染契约测试 |
| 单文件 | `角色卡/桌面UI/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/桌面UI/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/桌面UI/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/桌面UI/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/桌面UI/api-spec.md` | 实现报告（渲染侧导出与 DOM 契约） |
| 目录 | `角色卡/桌面UI/docs/design/` | 设计记录 |
| 目录 | `角色卡/桌面UI/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/桌面UI/docs/change/` | 变更记录 |
| 目录 | `角色卡/桌面UI/docs/fix/` | 修复记录 |

边界纪律（与 boundary.yaml 顶部注记同义）：

- 渲染进程不得直接接触 Node 或文件系统；一切能力经 preload 暴露的受限 IPC 通道（通道与主进程实现属「桌面窗口」角色）。
- 渲染进程内不得出现第二份边界判断实现——判定唯一来源是门禁引擎（经主进程）。
- `package.json`、`README.md`、`bin/`、`tsconfig.json` 属装配角色；`app/main.ts`、`app/preload.cjs`、`app/desktop/` 属「桌面窗口」角色。
- `角色卡/桌面应用/`（已拆分冻结）为只读归档，不在任何角色的写入面内。
