---
id: desktop-runtime-ui-implementation
type: change
title: 桌面三引擎选择、独立会话与掩码设置
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [desktop-runtime-choice, desktop-runtime-ui-v2r1, multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: verified
    summary: 本侧渲染候选与离线 Electron 检查通过，保留首跑失败和实际截图
---

# 桌面三引擎选择、独立会话与掩码设置

原来点角色总以 Pi 开启，现在在角色名旁选择 Pi、Codex 或 Claude，开启、发送、历史、停止和撤回都使用当前项目、角色和引擎身份。切回某引擎可看到自己的记录、草稿、附件和队列；原后台任务继续运行。完整操作及失败分支见[当前功能](../feature/runtime-choice.md)，同范围方案见[设计](../design/2026-10-14_design_multi-runtime-ui.md)。

最后实际 adapter 核对发现工具行缺口：Codex 的 args/ok 与核心的 call/result 嵌套元数据未被完整消费，可能把真实路径与已知执行结果显示成未记录。必要修正只从明确字段取工具名、调用标识、路径/命令、布尔结果；无布尔结果继续未知。同 turn/call/name 的调用目标可用于补充结果行。此必要修正已通过当前58项单测和15个真实Electron运行时断言；旧完整UIUX、IME与bench按前一阶段候选保留，未重新把旧检查称为新工具映射的证明。

设置抽屉使用窗口 metadata 显示模型、地址、认证、来源、回退、缺项及应用时点。机密输入从空值开始，保存失败保留输入，成功清空机密草稿。角色组别按只读摘要显示，不改变授权。客户与 shell 请求收到窗口失效通知后不能继续同意；旧引擎确认不作答新引擎。只有窗口明确报告原生恢复成功才称模型上下文已恢复，失败重建如实显示原因。

## 候选与范围

生产变更是 `app/renderer/{index.html,styles.css,renderer.js,role-status.js,tool-rows.js,runtime-ui.js}`。测试变更是自有 `renderer.test.ts`、新 `runtime-ui.test.ts`、`e2e/uiux-v2.mjs` / `ime-enter.mjs` / `uiux-design-audit.mjs`。其余为本角色 feature/API/导航/设计/证据资料。没有写主进程、preload、desktop、共享/Model/SDK、其他属主测试、package、env 或 Git。

基线 HEAD：`906abd3ee275cba82b2f9e54ceef1cd9473c2d5c`。本侧 renderer 全部文件及实际自测输入19份的 SHA-256 组合为 `10bf4028b588a1704c46c30a8b6dbd0c2fc9982b87da5c00c43ac836c5124ee1`，[逐文件 manifest](2026-10-14-runtime-ui-evidence/candidate.json)可核对。文档写入不改变这个源码/测试候选。窗口层仍有独立开发，最终全仓组合和真实 main→preload→renderer 验收归测试角色。

## 实际验证

完整UIUX/IME/bench对应[前一阶段19文件manifest](2026-10-14-runtime-ui-evidence/candidate-uiux-previous.json)，其后只修正工具元数据展示，并对当前候选跑全部自有单测、tsc与实际Electron对应观测。

环境为 macOS，shell Node `24.14.0`，Electron `44.7.0` 内 Node `24.21.0`。Electron 用真实 renderer 与现有 preload、受控离线 IPC，读共享字段 metadata 构造假视图；不读取真实项目/env/凭据，不调用模型 API。

| 检查 | 实际结果 | 原始结果 |
| --- | --- | --- |
| `node --test test/桌面应用/{markdown,renderer,tool-rows,runtime-ui}.test.ts` | 当前候选58/58 | [当前单测](2026-10-14-runtime-ui-evidence/unit-current-58-of-58.log) |
| `npm run typecheck` | exit 0 | [当前编译](2026-10-14-runtime-ui-evidence/typecheck-current.log) |
| 当前 `ANS_RUNTIME_UI_ONLY=1` Electron `uiux-v2.mjs` | exit 0；16条记录中15个布尔断言通过，包含实际Codex args/ok与callId目标关联 | [当前运行时JSON](2026-10-14-runtime-ui-evidence/runtime-electron-current.json) |
| 前一阶段完整 `node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` | exit 0；97条记录中87个布尔断言全部通过，10条为测量/目标观测 | [完整 Electron JSON](2026-10-14-runtime-ui-evidence/uiux-electron-final.json) |
| `node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs` | exit 0；26个断言通过，`E2E_DONE=1` | [IME 原记录](2026-10-14-runtime-ui-evidence/ime-electron-final.txt) |
| `node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs` | exit 0；2000行回放19ms、41行挂载，滚到底11.1ms；300事件逐个170.1ms/批量364.5ms | [热路径原记录](2026-10-14-runtime-ui-evidence/bench-electron-final.json) |

热路径的原数值只描述本机这一次运行，没有同时测基线，不据此声称性能提升。原有批处理、虚拟窗口、记录组和锚点漂移断言继续通过。

新增真实界面检查观察三引擎 open/send/history/abort 的精确身份；同角色切换不混历史/队列/草稿；旧引擎后台消息进入自己缓存；旧项目事件丢弃；旧同意和失效shell不发回包；失败终态和原生重建说明准确；Codex回退掩码/可选Responses地址与Claude可选默认字段；失败保存保留输入、成功清空秘密草稿；两档宽度和现有阅读/滚动/输入法行为。夹具只证明窗口桥接与渲染消费，不替代真实适配器或真实主进程证明。

## 首跑失败与等价保护迁移

[首跑44/51原日志](2026-10-14-runtime-ui-evidence/unit-first-44-of-51.log)保留。七项失败来自必要接口/来源变化：客户请求失效原因从仅重启扩为中止/重建；工具detail现需读取实际outcome而正文仍禁止直插；abort传三元对象；历史位置由Main中的Pi parser转到窗口helper→Pipeline；withdraw兼容字符串并支持SessionTarget；LRU当前保护改为精确handle key；后台视图不直接刷新当前项目确认条。检查分别迁到新精确入口并保留原保护，未删除或放松“拒绝/失败不能当成功”、只读历史、旧字符串兼容、busy不淘汰、当前句柄不淘汰和无计时器要求。

迁移时有一次测试标题引号笔误，[语法失败](2026-10-14-runtime-ui-evidence/unit-second-syntax-error.log)保留，随后56/57剩一项旧abort字符串签名检查，[该失败](2026-10-14-runtime-ui-evidence/unit-third-56-of-57.log)也保留。实际签名支持 `string | SessionTarget`，修为精确联合签名后57/57。首次Electron在sandbox下以SIGABRT退出，没有当成通过；随后受管离线执行通过。首次tsc提示新增测试直接加载经典JS缺声明，改成与既有同源测试一致的URL导入后通过，未改tsconfig或放宽编译。

## 已保存实际窗口截图

图片是真实Electron窗口 `capturePage()` 原样保存，未生成或修改像素。1360×860与960×620均验证无横向溢出；设置抽屉保留独立滚动，打开时角色名旁引擎仍可见。

- [宽窗组别与旧请求](2026-10-14-runtime-ui-evidence/runtime-groups-1360.png)
- [窄窗组别与旧请求](2026-10-14-runtime-ui-evidence/runtime-groups-960.png)
- [宽窗Codex配置、掩码和来源](2026-10-14-runtime-ui-evidence/runtime-settings-1360.png)
- [窄窗Codex配置与引擎选择](2026-10-14-runtime-ui-evidence/runtime-settings-960.png)

本侧已完成并自测，独立测试角色随后核验真实主进程、preload、renderer的最终合并候选。尚未以真实账号或在线模型运行，没有提交或推送。
