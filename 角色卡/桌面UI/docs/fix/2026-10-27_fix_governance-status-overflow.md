---
id: desktop-ui-fix-governance-status-overflow
type: fix
title: 治理状态行警告长文案不再横向溢出、不再裁掉末尾流程
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-ui-ui-components, desktop-ui-governance-panel]
events:
  - date: "2026-10-27"
    kind: created
    summary: 客户截图反馈治理状态条红色单行被裁、横向撑出中栏；警告态 nextStep 从 chip 拆到可换行 gov-detail，chip 可收缩换行，480 档保留单行裁剪，另以 title 兜底全文；补源守卫测试并重建 renderer dist
---

# 治理状态行警告长文案不再横向溢出、不再裁掉末尾流程

**客户反馈**（2026-10-27，带截图）：「你看这个样式」——聊天顶部治理状态条为红色单行，末尾「流程 pixel-roguelike」被裁掉，整条横向撑出中栏。相关功能见[渲染层组件台账](../feature/ui-components.md)中 `GovernancePanel` 一行。

## 根因

`app/renderer/src/shell/GovernancePanel.tsx` 的警告态把核心警告与 `nextStep`（含「下一步… · 角色 · 流程 …」）用 `" · "` 拼进同一个 `statusChip`：

```tsx
statusChip = core;
if (nextStep) statusChip = statusChip ? statusChip + " · " + nextStep : nextStep;
```

而 `app/renderer/src/shell/phase4b.css` 的 `.gov-chip` 基础规则是 `flex: 0 0 auto` + `white-space: nowrap`：

- `.gov-chip` 作为唯一长文本子项不收缩、不换行，按内容取宽；
- 父级 `.gov-text`（已有 `flex-wrap: wrap; min-width: 0; overflow-wrap: anywhere`）被撑到 879px，chip 仍为 1000.05px；
- `#governance-status` 实测 width 1000 / scrollWidth 1071，横向溢出 71px，末尾文字被裁。

正常模型态本来就有 `statusChip`/`statusDetail` 拆分（模型文本 chip + 流程/下一步 detail），只有警告态走了单行拼接，导致长文案溢出。

## 方案

复用组件既有语义，不改变治理状态含义、数据来源与流程：

- **组件**：警告态与正常态统一为 `statusChip = core`、`statusDetail = nextStep`；不再把 nextStep 拼进 chip。核心警告仍在红色 chip（`--danger-border` / `--danger-bg` / `--danger` token 不变），下一步/流程说明进入可换行的 `.gov-detail`。
- **完整信息兜底**：`statusText` 以 `" · "` 连接 chip/detail，作为 `.gov-text` 的 `title`；480 极窄档单行裁剪时悬停仍可看到全文。`#governance-status` 的可访问文本仍包含完整内容（拆分为两个 span，无信息丢失）。
- **CSS**：`.gov-chip` 改为 `flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere`，长 `reason`/长告警也能在 chip 内换行，状态条高度随内容自适应；正常宽度下预警核心一般仍单行。
- **窄屏不倒退**：≤720 换行、≤680 `.gov-text` 独占整行、≤480 单行裁剪的既有媒体查询全部保留；在 ≤480 档内补 `.governance-status .gov-chip, .gov-detail { white-space: nowrap; overflow: hidden }`，冲掉基础规则新增的换行，维持该档紧凑单行。

## 改动文件

- `app/renderer/src/shell/GovernancePanel.tsx`：警告态拆分 chip/detail；`statusText` 用 `" · "` 连接并挂到 `.gov-text` 的 `title`。
- `app/renderer/src/shell/phase4b.css`：`.gov-chip` 可收缩/换行；≤480 档补 chip/detail 单行裁剪覆盖。
- `test/桌面UI/source-guard.test.ts`：新增守卫「治理状态行：警告详情走可换行 gov-detail；chip 可收缩换行不撑破状态行」——禁止 nextStep 拼回 chip、禁止 chip 回到 `flex: 0 0 auto`、要求 `min-width:0`/`white-space:normal`/`overflow-wrap:anywhere`、要求 title 兜底与 480 档覆盖。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 源守卫 | `node --test "test/桌面UI/source-guard.test.ts"` | **11/11 pass**（含新增 1 项） |
| 桌面UI 套件 | `node --test "test/桌面UI/**/*.test.ts"` | **320/320 pass / 0 fail**（原 319 + 新增 1） |
| 渲染层 typecheck | `npm run typecheck:renderer` | **exit 0** |
| 渲染器构建 | `npm run build:renderer`（Vite） | **成功**，2681 modules；`dist/assets/index-CBSjKw3Y.css` 含 `.gov-chip{…min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;flex:0 auto…}`（即 `0 1 auto`）与 480 档覆盖规则；`dist/index.html` 引用新 hash `index-CA-Nb-J-.js` / `index-CBSjKw3Y.css` |

未做运行中 Electron 的实机截图核验（应用未重载，见下）。

## 运行中的应用如何看到

运行中的 Electron 实例仍加载旧 `dist`，按任务要求未重启/未关闭。需由主上下文用新 `app/renderer/dist/` 受控重载（窗口内 Ctrl+R 或重新打开/重启应用）后核验：1360 宽下警告状态条应换行且无横向溢出，末尾流程完整可见；窄屏（720/680/480 与 200%）保持既有换行/裁剪行为。

## 残余

- 未做真实 Electron 视觉截图核验（应用未重载）；布局目标由源守卫测试、构建产物与 CSS 计算规则核验。
- 未 commit/push。
