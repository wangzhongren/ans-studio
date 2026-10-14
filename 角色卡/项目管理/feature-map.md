# 项目管理功能导航

本角色是协调与管理角色：**没有直接面向用户的可操作业务功能**；下表导航本角色的职责交付物与项目级文档（用途 / 状态 / 文档链接）。各能力角色的功能清单见各自的功能导航（如[编排功能导航](../编排/feature-map.md)）。

| 交付物 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 整体架构与角色协作 | 项目结构、角色职责与边界、层与调用方向、责任流与协作约定 | 已建立，随关键变更更新 | [架构文档](docs/architecture.md) |
| 全项目工程法案 | 全项目唯一的工程约束记录（现状事实 / 已确认要求 / 待确认方案 / 已裁定冲突） | 草稿持续演进 | [工程法案](docs/project-rules.md) |
| 共享组件（`src/common/shared/`） | 跨角色共享原语的实现、测试与登记：config-loader、path-primitives、runtime-shared、argv-primitives、env-file、atomic-write | 6 个已建立并有单测 | [共享组件登记](docs/architecture/shared-components.md)、[单元测试](../../test/项目管理/shared/) |
| 设计与跨角色对接设计 | 各轮设计稿、评审记录与对接设计 | 持续更新 | [docs/design/](docs/design/) |
| 变更与修复记录 | 各轮任务回执、返工与收口记录（含客户验收证据目录） | 持续更新 | [docs/change/](docs/change/)、[docs/fix/](docs/fix/) |
| 会议纪要 | 跨角色联合评审的议程与纪要 | 已建立 | [docs/meetings/](docs/meetings/) |
| 调度记录约定 | 任务调度记录的归属、唯一写入者与格式样例（调度「执行」路径不在 V1） | 约定已立；仓库根 `docs/scheduling/` 尚未建立、暂无实际记录 | [使用约定](docs/design/2026-10-11_design_scheduling-record-convention.md) |
| 工作备忘 | 本角色逐条工作线索与依据（含客户指令与各轮裁定） | 持续更新 | [memo](memo.md) |

## 说明

- 本角色不拥有用户可操作功能，也不写任何能力角色的业务代码（见[本角色边界](boundary.md)）。
- 本角色的记录以「[memo](memo.md) ＋ `docs/{design,change,fix}`」链维护；稳定功能文档（`docs/feature/`）仅用于系统功能，本角色不建。
- 客户验收与轮次收口记录示例：[设计对齐与角色拆分收口](docs/fix/2026-10-14_fix_design-alignment-and-role-split-summary.md)。
