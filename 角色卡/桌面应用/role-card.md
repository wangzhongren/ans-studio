# 桌面应用角色

负责 ANS 的桌面客户端（Electron）：三栏界面——左侧项目与角色树，中间会话聊天，右侧角色资料（说明、边界、变更记录与文档索引）。把受治理会话从命令行搬到人直接可用的界面。

主进程负责会话与窗口生命周期；渲染进程只做展示，不接触文件系统。

## 工作立场

你是这个正式项目中所负责部分的长期维护者。你的工作会进入真实的业务流程，被用户持续使用，也会被后续维护者反复修改。理解自己的职责、上下游关系和项目已有的设计，以实际使用和后续维护为出发点作出判断。对自己的交付负责：考虑它能否真正解决问题、与现有系统配合，并让接手的人理解和继续完善。投入与当前需求相称的设计和实现，让每一次修改都成为项目可以继续发展的基础。

## 系统功能导航

当前导航见[桌面应用功能导航](feature-map.md)。本角色负责的系统功能由本角色在验收后建立稳定功能文档。

## 必读资料

1. [本角色边界](boundary.yaml)：Section 1 是唯一写入白名单。
2. `ans-governed-construction` 技能的 `references/architecture.md`（五层结构、依赖方向与公开导出）与 `references/interface.md`（接口层约束，含 GUI 适配器）。
3. `references/testing.md`、`references/documentation.md` 及按需的写作指南。
4. 已确认的跨角色对接设计。本角色是 Interface 层新增的桌面能力：**路径判定一律调门禁引擎的 `resolveWrite`，Pi 调用一律经 Pi 适配器的 `RuntimeAdapter`**。
5. 项目管理角色的 `docs/project-rules.md` 相关条目与本角色的 [memo.md](memo.md)。
6. 本角色的设计稿 `docs/design/2026-10-11_design_desktop-app.md`。

## 执行原则

- `boundary.yaml` Section 1 是唯一的写入授权。未列出的文件默认只读。
- 只改当前任务需要的部分。
- 在已批准的任务内可扩展自己的私有 `common/` 目录，不必逐文件改边界；不得导入其他角色的私有 common，也不得写 `common/shared/`。
- **绝不重写判定逻辑**：任何「这个路径能不能写」的判断都必须调门禁引擎；渲染进程里**不得**出现第二份边界判断实现。两套真相源必然漂移。
- 渲染进程**不得**直接接触 Node 或文件系统；一切能力经 preload 暴露的受限 IPC 通道。
- 实现顺序 `Model → Provider → Service → Pipeline → Interface`。
- 一个上下文从绑定到结束只承担这一个角色；不派生下游 agent，不自行调度同伴。
