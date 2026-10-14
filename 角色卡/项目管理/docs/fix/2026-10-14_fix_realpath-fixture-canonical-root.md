---
id: realpath-fixture-canonical-root
type: fix
title: 真实路径用例使用操作系统的规范目标
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: created
    summary: 多运行时共享回归109项中发现Mac临时根的旧错误预期
  - date: "2026-10-14"
    kind: verified
    summary: 独立OS realpath预期修正后本文件21项通过
---

# 真实路径用例使用操作系统的规范目标

多运行时共享回归运行 `node --test 'test/项目管理/shared/**/*.test.ts'` 得到108通过/1失败。唯一失败位于 `path-primitives.test.ts:251`：Mac的 `os.tmpdir()` 是 `/var/...`，操作系统解析出的真实路径是 `/private/var/...`，而旧断言把词法路径当真实路径。共享代码的真实路径解析符合其既有契约，错误在测试预期。

本修复属于已批准整合所需回归检查、限项目管理自有测试。用独立 Node `realpathSync.native` 对确实存在的链接目标取规范路径，再逐字比对共享解析结果；保持实际链接创建和根内判定断言，生产路径实现不改，不删测试、不弱化为包含/后缀匹配，也不扩大任何角色权限。沿用现有已授权必要验证范围，无新增选装。

已修正这一条精确预期。Node24.14.0/macOS arm64 执行 `node --test test/项目管理/shared/path-primitives.test.ts`，21/21通过；未修改生产路径实现。后续最终合并验证另记录。共享组件说明见[目录](../architecture/shared-components.md)。
