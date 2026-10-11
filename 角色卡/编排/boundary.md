# 编排边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/interface/cli/run.ts` | `ans role run` 命令的解析与输出 |
| 单文件 | `src/interface/cli/govern.ts` | `ans govern` 命令的解析与输出 |
| 单文件 | `src/interface/cli/init.ts` | `ans init` 命令的解析与输出 |
| 单文件 | `src/pipeline/orchestration/run-role.ts` | 普通角色会话的编排 |
| 单文件 | `src/pipeline/orchestration/govern-session.ts` | 治理 bootstrap 会话的编排 |
| 目录（私有） | `src/common/编排/` | 本角色私有辅助代码 |
| 目录（测试） | `test/编排/` | 本角色的单元与层契约测试及夹具 |
| 单文件 | `角色卡/编排/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/编排/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/编排/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/编排/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/编排/api-spec.md` | 实现报告 |
| 目录 | `角色卡/编排/docs/design/` | 设计记录 |
| 目录 | `角色卡/编排/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/编排/docs/change/` | 变更记录 |
| 目录 | `角色卡/编排/docs/fix/` | 修复记录 |

未列路径默认只读。超出上述文件的业务源码须先由 ANS Governance 更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
