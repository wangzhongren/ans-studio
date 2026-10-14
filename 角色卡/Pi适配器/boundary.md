# Pi 适配器边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/provider/pi/session.ts` | 会话建立与生命周期封装 |
| 单文件 | `src/provider/pi/tools.ts` | 旧工具公开路径的兼容转出；公共执行与 schema 由运行时核心维护 |
| 目录（私有） | `src/common/pi-adapter/` | 本角色私有辅助代码 |
| 目录（测试） | `test/pi-adapter/` | 本角色的单元与层契约测试及夹具 |
| 单文件 | `角色卡/Pi适配器/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/Pi适配器/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/Pi适配器/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/Pi适配器/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/Pi适配器/api-spec.md` | 实现报告 |
| 目录 | `角色卡/Pi适配器/docs/design/` | 设计记录 |
| 目录 | `角色卡/Pi适配器/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/Pi适配器/docs/change/` | 变更记录 |
| 目录 | `角色卡/Pi适配器/docs/fix/` | 修复记录 |

提供方层只实现对接口径，不承载路径判定逻辑；越界判定属门禁引擎。Pi SDK 自身的版本与依赖声明归装配角色，本角色不修改构建配置。

未列路径默认只读。超出上述文件的业务源码须先由 ANS Governance 更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
