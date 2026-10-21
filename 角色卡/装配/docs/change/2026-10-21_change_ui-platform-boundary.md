---
id: ui-platform-assembly-boundary-20261021
type: change
title: UI 平台化的装配边界：新增渲染层 Vite 构建配置
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-round, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 装配 Section 1 新增单文件 vite.config.ts，MD/YAML 同步且条目逐条对应
  - date: "2026-10-21"
    kind: verified
    summary: 真实解析器解析 25 条、全角色 228 条白名单零重叠、新增路径唯一归属与 diff 检查通过
---

# 渲染层构建配置的装配归属

客户 2026-10-21 审阅「UI 平台化」方向后指示「开干」，接受六个推荐默认值，其中包含「**Vite 只构建渲染层、主进程保持无构建**」。产品提案见[UI 平台化提案](../../../产品/docs/design/2026-10-21_design_ui-platform-round.md)（revision 1，status: proposed）；项目管理评审见[评审与实施口径](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（status: needs-revision，方向通过），其 §四「边界缺口（交 ANS Team Formation）」第 1 条要求装配 Section 1 新增根级 `vite.config.ts`。本记录只落实治理权限，不代表 Vite 已引入、依赖已安装、构建或测试已通过。

## 授权变化

装配在其 Section 1 MD/YAML 同步新增一个精确单文件：

| 路径 | 唯一属主 | 用途 |
| --- | --- | --- |
| `vite.config.ts` | 装配 | 渲染层 Vite 构建配置（仅构建 app/renderer；主进程与 preload 保持无构建） |

只新增这一条。`package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore`、`electron-builder.yml`、`.github/workflows/release.yml` 原本已在装配 Section 1 内，本次**未重复添加、未扩大**；未放开任何目录权限，未新增角色。项目管理评审 M1（§1.1、§2.4、Q14）明确：本轮不改 `release.yml` 发布步骤，发布流水线接入属下一次冻结源/新发布轮。

桌面UI 侧的新测试目录与 `app/renderer/` 用途说明属另一份边界，见[桌面UI 治理记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-boundary.md)。

## 变更记录位置

仓库检索未发现根 `changelog.md` 或其他根治理 changelog；按本项目既往治理先例（如 2026-10-15 的边界变更），本次记入受影响角色的 `changelog.md` 与各角色 `docs/change/` 治理记录，未自行新建根治理文件。项目管理评审 §4.2 提到「在根 `changelog.md` 记治理变更」；若需要建立根治理 changelog，属单独的治理结构变更，应另行确认后再做。

## 核验

在 macOS、Node v24.14.0 上用仓库真实解析器 `parseBoundaryYamlDoc` 对落盘文件做只读核对（临时检查脚本放在仓库外，未入库）：

- 装配 `boundary.md` 与 `boundary.yaml` 均 **25 条**，kind 与 path 逐条同序一致，无重复条目；`vite.config.ts` 恰 1 条 `file` 条目，MD/YAML 用途逐字一致。
- 核对时点（2026-10-21，工作树含并行上下文改动）全部有效角色（14 个；归档 `桌面应用` 除外）共 **228 条**白名单，跨角色零重叠；`vite.config.ts` 唯一归属装配。
- 依赖边界的只读回归：`node --test test/测试/boundary-matrix.test.ts test/装配/config.test.ts` **12/12 通过**（新增条目不影响现有允许/拒绝矩阵与演示配置断言）。
- `git diff --check` 通过。本次只改两份边界、本角色 changelog 与本记录；未改应用代码、测试、依赖、构建配置或任何角色卡。

Governance 固定上下文只维护治理材料；装配的实际工具链实现按项目管理评审的派发顺序另行授权。
