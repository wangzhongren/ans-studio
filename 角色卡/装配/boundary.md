# 装配边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/index.ts` | CLI 根入口与层间接线 |
| 单文件 | `bin/ans.js` | 可执行入口脚本 |
| 单文件 | `package.json` | 包定义、依赖与脚本 |
| 单文件 | `package-lock.json` | npm install 自动生成的依赖锁定文件 |
| 单文件 | `.github/workflows/release.yml` | v1.0.0 来源可审计的跨平台构建、包测试和 Release 流水线 |
| 单文件 | `electron-builder.yml` | Electron 分发构建配置与产物资源白名单 |
| 单文件 | `tsconfig.json` | TypeScript 编译配置 |
| 单文件 | `vite.config.ts` | 渲染层 Vite 构建配置（仅构建 app/renderer；主进程与 preload 保持无构建） |
| 单文件 | `README.md` | 安装与使用说明 |
| 单文件 | `README.en.md` | README 英文版（English translation；与 README.md 同属装配） |
| 单文件 | `LICENSE` | 客户指定的项目开源许可证 |
| 单文件 | `.env` | 本地环境配置，含 Pi 凭据；不入库 |
| 单文件 | `.env.example` | 环境变量示例，只含占位符，可入库 |
| 单文件 | `.gitignore` | 忽略规则（node_modules/、.env 等） |
| 目录（私有） | `src/common/装配/` | 本角色私有辅助代码 |
| 目录（测试） | `test/装配/` | 本角色的启动冒烟与接线测试及夹具 |
| 单文件 | `角色卡/装配/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/装配/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/装配/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/装配/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/装配/api-spec.md` | 装配说明与实现报告 |
| 目录 | `角色卡/装配/docs/design/` | 设计记录 |
| 目录 | `角色卡/装配/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/装配/docs/change/` | 变更记录 |
| 目录 | `角色卡/装配/docs/fix/` | 修复记录 |
| 条件目录 | `.ans/` | 仅 `project-init` 条件：项目初始化产物（角色表、治理边界与接受证据 SHA-256 pin） |

入口只持有接口层句柄，不导入服务层或提供方层对象；不得建立导入全部层的中央工厂。装配冒烟检查不替代固定测试角色的联调与回归。

未列路径默认只读。新增构建/配置文件或改动归属须先由 ANS Governance 更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
