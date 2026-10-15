---
id: release-packaging-boundary
type: change
title: v1.0.0 运行包发布的精确装配边界
author: ANS Governance
created: "2026-10-15"
status: verified
---

客户已明确要求相关角色配置打包流程、基于 v1.0.0 编译 macOS 与 Windows 运行包、测试通过后上传 GitHub Release。本记录只落实所需治理权限，不代表包已构建或测试通过。关联[项目管理发布任务](../../../项目管理/docs/change/2026-10-15_change_v1-release-packaging.md)。

## 授权变化

装配提出、Governance 核对后，在其 Section 1 MD/YAML 同步新增两个精确单文件：

| 路径 | 唯一属主 | 目的 |
| --- | --- | --- |
| `.github/workflows/release.yml` | 装配 | 可审计来源的跨平台构建、包测试和 Release 流水线 |
| `electron-builder.yml` | 装配 | Electron 打包与资源白名单 |

未授予 `.github/` 或 workflows 目录权限。构建脚本与装配测试沿用现有 `src/common/装配/` 与 `test/装配/`，不扩目录。应用主进程、打包后的环境配置路径与运行期 smoke 接线仍归桌面窗口；本次未触碰该角色边界。若需新增逐条测试路径，先交回 Governance 精确授权。

MD 旧镜像遗漏 YAML 既有的 `package-lock.json`、`.env`、`.env.example`、`.gitignore` 及条件目录 `.ans/`；同步补齐其文字描述，不新增这些既有权限。`.ans/` 保持 `project-init` 条件，凭据文件仍不入库。本次未读取凭据内容。

## 核验

- Node v24.14.0 调用真实 `parseBoundaryYamlDoc` 解析全部现存边界；排除显式归档角色后，两个新增路径均仅匹配装配这一属主。
- `.github/workflows/other.yml` 不命中装配边界，证明没有放开目录。
- 对目录末尾斜杠做与解析器一致的归一化后，装配 MD/YAML 的 24 条路径镜像一致；初次临时检查因比较原始斜杠而失败，修正临时检查的路径归一化后通过，未改权限或生产代码来通过检查。
- `git diff --check` 通过。此为治理文档变更，无应用代码或测试改动，不以此代替包测试。
- 当前仓库无 `.ans/project.json`，没有需随本次修改的运行时 acceptance pin；既有设计冻结文件不改写。未来使用新边界的项目初始化仍按现有 acceptance/pin 机制执行。
- `git rev-parse 'v1.0.0^{commit}'` 为 `83445ebcf24454c6107838cb7f2221882c6638ea`。本上下文不修改 tag 或 Git refs。

验证时边界 SHA-256：

- `角色卡/装配/boundary.md`：`94761c6bf564d31524a6eaaa05e62e14a54282e767849b43928f4385babdc091`
- `角色卡/装配/boundary.yaml`：`0f5625a987dd0b40fb489748aea1c604c70034bc30ff800f46dc2cf539dfa182`

Governance 固定上下文只修改上述两份边界、装配治理 changelog 和本记录；未代装配实现、未代测试或 PM 验收。
