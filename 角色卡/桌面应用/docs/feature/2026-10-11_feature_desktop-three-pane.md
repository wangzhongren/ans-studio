# 功能：桌面应用三栏（项目/角色 · 会话 · 角色资料）

> 稳定说明。源码见 `app/`；接口见 [api-spec.md](../../api-spec.md)。

## 目标

把受治理会话从命令行搬到人直接可用的界面，且**不新增第二份判定**：一切路径判定与角色/边界解析仍来自
门禁引擎，Pi 调用仍经 Pi 适配器。

## 三栏

| 栏 | 内容 |
| --- | --- |
| 左 | 「导入项目」系统文件夹选择器 → 门禁引擎 `listProject` 枚举角色 → 角色树（内联 SVG 图标、hover/选中态） |
| 中 | 点角色即聊天：多轮消息直发；`tool_call` / `denied` / `accepted` / `message` / `settled` 以聊天气泡与居中状态行实时刷出 |
| 右 | 手风琴分组：角色卡正文、Section 1 边界条目表（斑马纹）、变更记录索引、`docs/` 目录索引 |

## 会话流程（客户定稿：导入项目 = 授权；点角色即开，全程无确认框）

```
用户导入项目（系统文件夹选择器 = 显式授权动作）
        │  app:list-project → 门禁引擎 listProject
        ▼
左树列出角色。用户点击一个角色 ──▶ session:open { projectRoot, roleId, runtime }   ← 一次调用，无弹窗
        │
        ▼
主进程 构造 ProjectConfig(acceptance: 导入即授权) → 编排 openRoleSession({roleId, project}, {createAdapter})  ← 只建一次
        │  scope 传 undefined（聊天无任务收窄）；事件经 session:event 持续外推
        ▼
中栏立即进入聊天：开启提示 + 多轮消息
        │
用户自由发消息 ── session:send（可反复调用）──▶ 事件继续刷出 ……
        │  越界写入被门禁照常拦截 → denied 事件内联显示在聊天流（柔红色，可展开看按根分组允许路径）
切换角色：先 dispose 旧会话再开新会话；同角色重复点击：续接（不重建）；关窗 dispose
```

## 边界来源与 acceptance（用户无感）

- 边界由门禁引擎解析（`role.boundary.boundarySource`）；**界面上不展示** writeSet、边界清单、acceptance 来源——
  用户对这些无感（边界是项目管理管的事，不是聊天的人管的事）。右栏资料分组仅作资料查阅，与授权无关。
- `acceptance` 由「导入项目 = 授权」给出：`{ accepted: true, source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）" }`；
  桌面应用内无 `accepted=false` 路径，门禁对未接受边界的 fail-closed 语义不变（**不更松**）。

## 与 CLI 的一致性

- 同一门禁引擎、同一编排（`openRoleSession`）、同一 Pi 适配器；
- 授权动作同样是人类的显式操作——CLI 的 pin 对应这里的**导入项目**（系统文件夹选择器）；
- `scope` 传 `undefined`，授权上界 = 角色边界本身，判定唯一来自门禁引擎；
- **写入语义按运行时**（设计 §3.9 更正，2026-10-11）：**demo** 路径（`chat-adapter` 未传 `writeRoot`）→ 写层 fail-closed，**只判不写（不落盘）**；
  **pi** 路径（真实适配器 `writeRoot=projectRoot`）→ **真实写入被导入项目**，仍受门禁约束（越界写在写之前被拒）。
  界面**按运行时如实**明示（输入区常驻说明随运行时切换 + 会话开启内联说明），不再一概而论「V1 桌面：只判不写」；
- 越界写入照样在**写入之前**被拦（含按根分组的允许路径），以内联消息呈现。

## 端到端自检

`test/桌面应用/e2e/main.mjs`：以真实 Electron 启动真实 preload+渲染进程，导入 `D:\work\ans-cli`、
列出角色、**点角色直接进入聊天（无确认框，4 处 NO_MODAL 检查点）**、连发两条消息、
越界写入被拒且内联展开、同角色重复点击续接、右栏四组资料，逐屏截图（4 张）并写报告。
