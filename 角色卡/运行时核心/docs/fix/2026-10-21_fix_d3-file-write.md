---
id: d3-file-write
type: fix
title: D3 写前重判与普通文件权限保留
created: "2026-10-21"
updated: "2026-10-22"
status: implemented-pending-acceptance
---

# 写到已授权目标，编辑后保留脚本执行权限

用户已批准 [D3 轻量方案](../../../项目管理/docs/design/2026-10-21_design_permission-boundary-repairs.md) 并要求实施。本记录只覆盖运行时核心 R1/R4；UI 已依最新指令排除。核心在已重新加载的 Markdown Section 1 和本次精确范围内实施，不修改门禁规则、共享原语、Model 或 shell 执行机制。当前功能入口见 [公共运行时工具](../feature/runtime-core.md)，独立完成判据见 [D3 验收标准](../../../独立验收/docs/design/2026-10-21_design_d3-acceptance-criteria.md)。

## 修复与失败路径

`src/provider/runtime/tools.ts` 的 `write_file` / `edit_file` 共用 `writeGuarded`：首次 gate 通过 → 只读守卫 → write_file 按需 mkdir → 同一个 gate 重判 → 比较真实父目录快照 → 原子写。真实目标的角色边界和 writeSet 授权由实际 `resolveWrite` 负责，核心没有复制其规则。重判拒绝/异常、中止、目录变化均不提交文件；mkdir 后失败可能保留已建目录，错误文案如实说明。

`src/common/runtime-core/fs-write.ts` 只把 lstat 的 `ENOENT` 视为新文件，其他错误返回/抛出明确失败；符号链接及非普通目标不替换。原子写前重新取已有普通文件 mode，只在 POSIX 传入 `finalMode = mode & 0777`，临时文件仍以 0600 建立。共享原语完成写入、句柄 chmod、fsync、close 后 rename；chmod 或 fsync 失败保留原内容与权限、清理临时文件。特殊位不复制，新文件维持 0600 经 umask 的旧创建规则。

这是普通复核，不是抵抗恶意并发替换的完整 TOCTOU 方案。不改 `ShellReviewRequest`、shell 参数/环境或执行身份；Windows 保留原替换行为，本机不验证其 POSIX mode 等价。

## 本次精确修改

- `src/provider/runtime/tools.ts`：仅写入路径传递 gate 和写前重判。
- `src/common/runtime-core/fs-write.ts`：真实父目录快照、严格状态错误、普通文件 mode。
- `test/runtime-core/file-write-safety.test.ts`：11 项新增回归。
- 本修复记录、`docs/feature/runtime-core.md`、`api-spec.md`、`memo.md`：同步流程、兼容及证据。

## 已运行的证据

生产者：固定角色运行时核心；时间：2026-10-21 09:34–09:37（Asia/Shanghai）。平台 Darwin arm64，Node v24.14.0。基线 HEAD `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`，未提交工作区含其他角色的并行改动；以下摘要用于识别实际候选，不以 HEAD 代替未提交版本。

| 路径 | SHA-256 |
| --- | --- |
| src/provider/runtime/tools.ts | 7229da117f6b50ab9e360d771e7dbd42b98a6132c4e5d79a1b92d84f3768c61f |
| src/common/runtime-core/fs-write.ts | 67eff321977bad8095654d741bd287e2f436f6e702de2c870e4eb52e763ba37b |
| test/runtime-core/file-write-safety.test.ts | 4361618d1aacf05987bd1eded81353625b20c45408a43a8c4517ad4fa730989b |
| src/common/shared/atomic-write.ts（只读依赖） | 8d750702a2bf66e82974c0b2e987d7ed07e9d14d2cf834d2d497e1c9f4ddadd2 |
| src/service/gate/resolve-write.ts（当前只读依赖） | e662417ad0dd331d7b818b5b4783499df3134c887541c0688059ae0f6599ca35 |

| 命令 | 结果 | 原始日志 |
| --- | --- | --- |
| `node --test test/runtime-core/file-write-safety.test.ts test/runtime-core/tools.test.ts` | 22/22 通过 | [/tmp/ans-d3-core-targeted.log](/tmp/ans-d3-core-targeted.log) |
| `node --test 'test/runtime-core/**/*.test.ts'` | 251 项：250 通过、1 平台条件跳过、0 失败；退出码 0 | [/tmp/ans-d3-core-suite.log](/tmp/ans-d3-core-suite.log) |
| 同一窄测命令，门禁依赖变化后复测 | 22/22 通过；退出码 0 | [/tmp/ans-d3-core-targeted-current.log](/tmp/ans-d3-core-targeted-current.log) |
| `npm run typecheck` | 退出码 0 | [/tmp/ans-d3-core-typecheck.log](/tmp/ans-d3-core-typecheck.log) |
| `git diff --check -- src/provider/runtime/tools.ts src/common/runtime-core/fs-write.ts test/runtime-core/file-write-safety.test.ts` | 退出码 0 | 无错误输出 |

核心全套运行时的门禁摘要为 `0d9fc6ea56264078ec9ec4d23990bcb2619b666d09fcc833c1d6151835b4dbc1`；并行门禁收口后变为表中当前摘要，已重新运行 22 项针对写入、真实门禁及公共工具的窄测，未重跑不受影响的整个核心套件。

11 项新增用例使用真实公共 handler 和真实临时文件：双路径授权拒绝/完全授权后成功；二次门禁拒绝、异常和中止（各覆盖写与编辑）；父目录变为根内链接仍拒绝；合法链接项目根和目标文件链接拒绝；ENOTDIR 不回退新文件；0755/0644/0600 与特殊位；独立子进程严格 umask；真实 FileHandle 的 chmod/fsync 注入失败通过 handler 返回且原文件/权限不变。核心全套的唯一跳过项是已有“Windows 反斜杠路径也识别为角色边界文件”条件用例；跳过不算 Windows 通过。

共享原语 rename/abort 的更底层故障证据由 PM 提供，独立测试角色还需在合并候选验证完整链路。没有运行全仓测试、UI测试或真实线上模型；没有提交、推送或发布。Windows junction、原生替换及其他平台证据不足，完整验收交独立验收角色判定。

日志位于本机临时目录，不随 Git 分发；可由测试角色用已固化用例重新执行。相关依赖变化后须重新验证受影响路径。

## 2026-10-22 Windows CI 平台断言修正（仅测试）

v1.5.0 发布 CI（run [39702128045](https://github.com/wangzhongren/ans-studio/actions/runs/39702128045)，windows-2025 / Node 24）在本文件新增的「D3 lstat ENOTDIR is a status error, never a new-file fallback」失败，实际 handler 文案为：

```text
write_file 写入失败（建目录）：file.txt/child.txt（EEXIST: file already exists, mkdir 'C:\Users\RUNNER~1\AppData\Local\Temp\ans-core-d3-sClXM4\file.txt'）
```

根因是平台错误码映射，不是产品放行：Windows 对「中间路径段是普通文件」返回 `ERROR_PATH_NOT_FOUND`→`ENOENT`（而非 POSIX 的 `ENOTDIR`），`fs-write.existingTarget` 因此把该目标当新文件放行；随后 `ensureParentDir` 对已存在的普通文件 `file.txt` 执行 mkdir 得到 `EEXIST`，handler 在任何落盘之前拒绝。可观察语义仍是失败关闭：`ok:false`、未创建任何新文件、原文件内容不变（`edit_file` 更早停在 `readFile` 的 ENOENT）。因此不改产品，只把断言做成平台感知：

- POSIX：仍严格匹配 `/无法读取目标状态.*ENOTDIR/`；
- Windows：接受守卫拒绝文案（若 Node/Windows 将来改报 ENOTDIR），或本次实测的 `/写入失败（建目录）：file\.txt\/child\.txt.*EEXIST.*file\.txt/`；两条都要求具体状态错误，不 skip、不无条件通过。
- `assert.equal(result.ok, false)` 与「目录仅剩 file.txt、原内容不变」的无副作用断言原样保留。

证据：Darwin arm64 / Node v24.14.0，`node --test test/runtime-core/file-write-safety.test.ts` **11/11 通过、0 失败、0 跳过**；同一正则在本地对上述 CI 原文匹配为 true。Windows 侧由下一次 CI 复跑确认，不把本机结果当 Windows 验收。
