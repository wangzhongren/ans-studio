---
id: ui-platform-renderer-test-boundary-20261021
type: change
title: UI 平台化的桌面UI边界：新渲染层测试目录与 app/renderer 用途说明
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-round, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 桌面UI Section 1 新增目录 test/桌面UI/，并在 app/renderer/ 用途中补充 React 源码与构建产物说明（目录整体授权不变）
  - date: "2026-10-21"
    kind: verified
    summary: 真实解析器解析 20 条、全角色 228 条白名单零重叠、新目录唯一归属与 diff 检查通过
---

# 新渲染器的测试目录与渲染层目录说明

客户 2026-10-21 审阅「UI 平台化」方向后指示「开干」，接受六个推荐默认值，其中包含「**Vite 只构建渲染层、主进程保持无构建**」。产品提案见[UI 平台化提案](../../../产品/docs/design/2026-10-21_design_ui-platform-round.md)（revision 1，status: proposed）；项目管理评审见[评审与实施口径](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（status: needs-revision，方向通过），其 §四「边界缺口（交 ANS Team Formation）」第 3、4 条要求：`app/renderer/` 的目录授权已覆盖 `components.json`、`tsconfig.json`、`src/`、`dist/`；新渲染器测试需要独立目录。本记录只落实治理权限，不代表新渲染器、测试或构建已实现。

## 授权变化

桌面UI 在其 Section 1 MD/YAML 同步做两处：

1. 新增目录条目 `test/桌面UI/`，用途「渲染层 React 组件与设计系统守卫测试（独立目录，与桌面窗口的 test/桌面应用/ 精确文件授权互不重叠）」。该目录与 `test/桌面应用/` 下现有逐文件授权不交叉；未改任何既有 `test/桌面应用/` 条目。
2. 在既有目录条目 `app/renderer/` 的用途说明中补充「包含渲染层 React 源码（src/）、样式、组件、渲染层 tsconfig/components.json 与构建产物（dist/）」。**权限范围仍是目录整体授权**，未新增逐文件条目；`dist/` 为构建生成物，由装配的 `build:renderer` 写出。

未新增其他路径、未新增角色、未改 `package.json`/`tsconfig.json` 等装配文件归属。装配侧的根级 `vite.config.ts` 属另一份边界，见[装配治理记录](../../../装配/docs/change/2026-10-21_change_ui-platform-boundary.md)。

## 核验

在 macOS、Node v24.14.0 上用仓库真实解析器 `parseBoundaryYamlDoc` 对落盘文件做只读核对（临时检查脚本放在仓库外，未入库）：

- 桌面UI `boundary.md` 与 `boundary.yaml` 均 **20 条**，kind 与 path 逐条同序一致，无重复条目；`test/桌面UI/` 恰 1 条 `directory` 条目，MD/YAML 用途逐字一致；`app/renderer/` 两份用途均含新增说明且未新增其下逐文件条目。
- 核对时点（2026-10-21，工作树含并行上下文改动）全部有效角色（14 个；归档 `桌面应用` 除外）共 **228 条**白名单，跨角色零重叠；`test/桌面UI/` 唯一归属桌面UI。
- `git diff --check` 通过。本次只改两份边界、本角色 changelog 与本记录；未改应用代码、测试、依赖、构建配置或任何角色卡。

Governance 固定上下文只维护治理材料；渲染层实现与测试按项目管理评审的派发顺序另行授权。
