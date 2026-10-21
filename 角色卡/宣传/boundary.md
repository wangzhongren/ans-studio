# 宣传边界

## Section 1：写入白名单

本节为本角色写入授权来源；[boundary.yaml](boundary.yaml) 是供现有产品解析器读取的同步副本，二者须一致，不因副本格式扩大权限。

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录 | `site/` | 项目官网静态站点源码、样式与素材 |
| 单文件 | `.github/workflows/pages.yml` | 官网构建与 GitHub Pages 发布工作流 |
| 单文件 | `角色卡/宣传/feature-map.md` | 本角色对外交付面导航 |
| 单文件 | `角色卡/宣传/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/宣传/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/宣传/functional-description.md` | 本角色职责、交接输入输出与文档位置 |
| 单文件 | `角色卡/宣传/api-spec.md` | 本角色接口说明（静态站点，预计 not-applicable） |
| 目录 | `角色卡/宣传/docs/design/` | 站点设计与内容方案记录 |
| 目录 | `角色卡/宣传/docs/feature/` | 官网稳定说明与维护文档 |
| 目录 | `角色卡/宣传/docs/change/` | 站点与发布变更记录 |
| 目录 | `角色卡/宣传/docs/fix/` | 站点问题与修复记录 |
| 目录 | `temp/宣传/` | 未通过/返工产物暂存，供审核对照 |

未列路径默认只读。不授予 `app/`、`src/`、`test/`、README、package 配置、其他角色资料或仓库设置；角色卡、边界、同步 YAML 与根 `changelog.md` 由 ANS Team Formation 维护。发布/推送/部署由客户或协调方执行，本边界不授予这些能力。
