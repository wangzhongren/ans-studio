---
id: boundary-write-guard-runtime-core
type: change
title: 角色 boundary.yaml 写前内容校验接管与验收
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [list-dir-tool-runtime-core]
---

# 角色 `boundary.yaml` 写前内容校验（接管验收）

## 背景

真机缺陷：Nominator 写出顶层含 `version`/`roleId`/`root` 的非法 `boundary.yaml`，应用照单写入后新角色无法枚举（边界解析失败）。编排在运行时核心文件 `src/provider/runtime/tools.ts` 中加了写前校验，本角色按协调者要求接管并验收。

## 实现与分层复核

- 落点：`write_file`/`edit_file` 的公共写盘路径（`rejectInvalidBoundaryWrite`），是**所有引擎**（Service 会话、Pi 直连会话、演示）共同的写盘咽喉；未改门禁、未改适配器。
- 分层：只 import **Service 公共出口** `src/service/boundary/resolve-boundary.ts` 的 `validateBoundaryYamlText`；该出口再导出**门禁引擎私有的同一函数引用**（单一来源，不复制解析器）。Provider **不直接 import** `common/门禁引擎/boundary-yaml.ts`。这是有意的定向例外：若改成「由注入端传入校验器」，未注入路径会 fail-open，违背「非法边界写不进去」。
- 只对 `角色卡/<id>/boundary.yaml` 生效（相对路径/`./` 前缀/项目根内绝对路径/Windows 反斜杠均识别）；`role-card.md` 与其他同名路径不校验。
- 拒绝时零副作用：`write_file` 在任何 `mkdir`/`open` 之前返回；`edit_file` 对编辑后的文本校验，拒绝时文件逐字节不变；回执含具体顶层键原因与「顶层只允许 role / entries / archived」。

## 测试

新增 `test/runtime-core/boundary-write-guard.test.ts` 5 例：

1. 非法顶层 `version`/`roleId`/`root` ⇒ `write_file` 拒写，角色目录都未创建（零文件副作用）。
2. 合法模板放行并落盘；前置 `./` 与项目根内绝对路径的非法写同样被拦截、零副作用。
3. `role-card.md` 与其他路径（`docs/notes/boundary.yaml`）不做 YAML 内容校验。
4. `edit_file` 编辑结果引入 `version: 1` ⇒ 拒绝，文件逐字节不变。
5. Windows 反斜杠路径识别（平台条件 skip）。

验证：`node --test "test/runtime-core/**/*.test.ts"` **195 计 / 192 过 / 3 红**（3 红均为既有 Windows `symlink EPERM`：session-store ×2、tools ×1）；`npx tsc --noEmit` **0 错**；全量三层 glob `node --test --test-timeout=60000 --test-force-exit "test/**/*.test.ts"` **2961 计 / 2937 过 / 20 红 / 3 跳过**——红项均为既有环境/桌面/治理在飞面，**无本批新增红**（明细见 [changelog](../changelog.md) 同日条目）。未跑真实模型/凭据/网络；未读 `.env`；未 git 提交。
