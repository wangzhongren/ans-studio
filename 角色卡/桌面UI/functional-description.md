# 桌面UI 模块笔记与代码位置

## 职责与范围

本角色实现 ANS 桌面客户端的渲染前端（`app/renderer/`）：显示与交互；不做判定、不碰 Node/文件系统。主进程侧（会话、通道、判定）属「桌面窗口」。拆分背景与逐文件路由见[拆分设计](docs/design/2026-10-14_design_role-split-ui.md)。

## 代码位置

```
app/renderer/
  index.html                 视图骨架：自绘标题栏 + 两栏 + 右抽屉 #right-drawer（图标簇 #right-tabs）
  styles.css                 视觉全部（浅色、近单色、极简；UI/UX v2 设计取值）
  renderer.js                唯一主脚本（经典脚本 IIFE）：左树、聊天流、回放、虚拟窗口、交互卡、
                             抽屉/图标簇、composer、Pi 面板视图、标题栏按钮接线（经 window.desktop）
  markdown.js                Markdown 渲染封装（vendored markdown-it；esc 单一来源；挂 globalThis.ANSMarkdown）
  role-status.js             角色状态徽标七态纯映射（挂 globalThis.ANSRoleStatus）
  tool-rows.js               工具行重构与活动分类纯函数（挂 globalThis.ANSToolRows）
  ui-labels.js               回放计划/文案/队列视图纯映射（挂 globalThis.ANSUiLabels）
  runtime-ui.js              引擎/组摘要/配置来源和应用时点纯展示映射（挂 ANSRuntimeUI）
  vendor/                    markdown-it 15.0.2（UMD + LICENSE + README：版本/来源/sha256/升级步骤）
test/桌面应用/（渲染侧，路径沿用拆分前）
  markdown.test.ts           Markdown 语法/XSS 负例/vendor sha256 pin
  renderer.test.ts           渲染源码不变式守卫（含与 preload/main 通道两端交叉守卫）
  tool-rows.test.ts          工具行/回放纯函数
  runtime-ui.test.ts         三元身份、组元数据、来源/应用文案与隐私隔离约束
  e2e/uiux-v2.mjs            界面交互回归（离线替换 IPC）
  e2e/ime-enter.mjs          输入法候选 Enter 回归
  e2e/bench-storm.mjs        渲染热路径基准台
  e2e/uiux-design-audit.mjs  设计对齐两档测量夹具
  e2e/uiux-prototype-measure.mjs  原型两档测量夹具
```

## 依赖方向

`renderer.js`（视图）→ `window.desktop`（preload 白名单，属桌面窗口）→ 主进程 Interface（`app/desktop/*`）→ 门禁引擎/编排。渲染进程**只经此一扇门**；不 import 任何 `src/**` 或 `app/desktop/**`；纯函数模块（markdown/role-status/tool-rows/ui-labels）无任何 Node/electron 依赖，node 测试经 `globalThis.ANS*` 同源加载。

## 关键实现点（拆分时承接，详见归档）

- **渲染侧无第二份判定**：写资格、授权、枚举全部来自主进程；渲染只呈现（核心硬约束，逐版本有源码守卫）。
- **虚拟窗口纪律**：流内行禁用垂直 margin（行模型按「真实行高（rect）+ pane 行距（flex row-gap，实读；仅 pane 已连接时读入缓存——脱离文档读不到样式表）」计行占位——`rowFootprint`，2026-10-14 起），纵向节奏只走 gap/padding。行距量级大于取整误差：任何把行占位退回 `offsetHeight` 的改动都会让窗口构成变化位移正文（锚点漂移），`renderer.test.ts` Q-2 用例守卫。
- **事件订阅单源**：页面级多次订阅同一事件会各自回调（e2e 探针须避免叠加订阅造成观测伪影）。
- **esc 单一来源**：非 Markdown 路径的转义一律走 `Markdown.esc`；模型输出禁直插。
- **无计时器纪律**：交互卡不按时间过期；抽屉过渡纯 CSS。除既有诊断/去抖机制外不新增 setTimeout/setInterval。
- **治理决定卡镜像（W6-C）**：`opRequests[requestId]` 以 `surfaces`/`cards` 承载同一请求的多面呈现；源面沿用锚点/生命周期，镜像面（主入口 Liaison）追加末尾且不自动滚动。作答唯一入口 `submitOperatorDecision`（单点 `operatorRespond`），成功后/失效冻结全部面；排队请求不物化卡，仅主入口聚合行。渲染侧不自行判定是否镜像（只认载荷 `mirrorRoleId`），也不写账本/模型上下文。
- **双自动判断开关（2026-10-18）**：`shellJudge`=「替我审批」（shell + 写盘族）、`decisionJudge`=「替我决策」（提案/任命/验收）；主进程是两组开关的权威，`renderJudgeToggles()` 是唯一重绘点，一次性警告同一块、每组各自 `promptShown`。治理代批结果行（`session:operator-judge`）与 shell 结果行都按 `roleId` 落 pane、按 `toolCallId` 锚定；manual 用卡片 `judgeNotice`（shell `#sc-judge-notice` / 治理 `.op-judge-notice`）。渲染侧不写第二张 `cardKind→group` 映射表。
- 历史沿革（UI/UX v2、设计对齐、IME、抽屉、图片、P1 等）见冻结归档 `角色卡/桌面应用/docs/` 与[功能导航](feature-map.md)链接。

## 已知偏离 / 边界登记

V2r1 选择、设置、事件/请求/历史隔离的当前完整流程见 [runtime-choice](docs/feature/runtime-choice.md)。renderer 保存各 runtime 游离视图；当前 profile 的应用/重建、原生恢复结果、凭据来源和请求失效都由窗口层产生，本侧只消费。[原始自测与截图](docs/change/2026-10-14_change_multi-runtime-ui.md)覆盖自己的渲染候选，独立全链路验收另行记录。

- 拆分未物理移动 `test/桌面应用/`；渲染侧测试文件按 file 逐条授权（见 [boundary.yaml](boundary.yaml)）。
- `e2e/main.mjs`（桌面总自检台）归「桌面窗口」；本角色界面改动如牵动其中 DOM 断言，经项目管理协调由桌面窗口侧同步。
