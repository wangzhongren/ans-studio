---
id: readme-reader-flow-20261015
type: change
title: 按新用户使用顺序重写 README
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-15"
    kind: verified
    summary: README 重构完成，本地链接、命令帮助与格式核对通过；仅文档验证
---

# 按新用户使用顺序重写 README

旧 README 把新手操作、内部架构、历史验证和角色目录混在一起。客户要求由角色重写，本次以装配角色的 README 所有权执行，不修改应用行为。

[README](../../../../README.md) 现在从项目用途与真实桌面截图开始，接着给出三个架构的 v1.0.0 下载入口、五步首次使用、必要引擎配置，再解释三点角色协作约束。开发、CLI、检查与限制放在后半段。历史测试数、SDK 内部运输、重复定义和 13 角色目录表移出首页，由已有深入文档承接。[CLI 当前行为](../feature/cli-runtime-assembly.md)和[打包说明](../feature/desktop-release-packaging.md)仍是详细导航。

特别核对了先导入后选引擎、运行包与开发配置路径、秘密值保护、普通聊天与正式任务区别、派发不扩大权限、报告声明不等于验收。保留未签名/未公证、Windows 文档阅读限制、shell 无 OS 沙箱、CLI 能力差异及在线模型验证范围；说明应用自带环境并不代表项目所需 npm/Git 工具链已安装。

只做文档检查：README 的 11 个本地目标均存在；`node bin/ans.js --help` 与 `node bin/ans.js role run --help` 实际退出码为 0，选项与当前脚本、环境示例及实现一致；`git diff --check` 通过。没有重跑产品测试，没有调用模型或读取实际 `.env`，没有改动源码、测试、打包配置、既有产品路线图或 PM 评审，也没有提交或推送 Git。

## 按客户补充保留名称与学术来源

客户追加要求保留“ANS 是什么”与学术来源。在新版简介后补充 ANS Skill 与 ANS Studio 的关系、三点角色优先思想，并保留 Wang, Zhongren（2026）、完整论文名及 DOI `10.5281/zenodo.22824700` 的 Zenodo 链接。逐字核对当前 Git HEAD 的旧 README 引用，未新增论文结论或把项目实测归作论文实验。移除下方重复的 RFSG 简介，下载、首用、配置与限制未改。
