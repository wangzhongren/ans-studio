# 变更记录：角色根文档展示 S5 —— `ui.profile.*` i18n key（4 必需 + 3 可选副标签）

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key、测试、证据已写盘并自测通过；**未经独立验收**；消费方接线属 S4，不在本批）
- 触发：客户已授权按团队计划 v1 与 T2 标准 v1 实施 S2–S7；本角色只做 **S5（i18n key）**。
- 依据：
  - 团队计划：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md` §1.4、§3.4、§4.1（S5）、§4.3、§八.9（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`）
  - 方案 v1：`docs/planning/2026-10-23_design_role-root-docs-display.md` §5.5、§5.5.6、§6.3、§7.1（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`；Q2 A）
  - 验收标准 v1：`docs/acceptance/role-root-docs-display-criteria-v1.md` P6（i18n）、§九.4、§九.14（可选副标签非强制）
- 证据目录：`角色卡/项目管理/docs/change/2026-10-23_change_role-root-docs-display-evidence/`
- 未提交：不 commit、不 push、不暂存；不声称验收、不声称 S4 已接线。

## 1. 本批做了什么

只向共享消息目录新增方案 §5.5.6 / 团队计划 §3.4 指定的 **7 个 `ui.profile.*` key**（zh-CN/en-US 各一份），并更新 `test/项目管理/shared/i18n.test.ts` 的 key 存在/占位符/取值/语义断言；未改任何消费方。

- `src/common/shared/i18n/messages/zh-CN.ts`：+7 key（key 全集参考；含语义与“不翻译标识”注释）。
- `src/common/shared/i18n/messages/en-US.ts`：逐 key 自然英文（`satisfies Record<MessageKey, MessageTemplate>` 编译期强制齐全）。
- `test/项目管理/shared/i18n.test.ts`：
  - 新增 2 个用例：①4 必需 + 3 可选 key 在 zh/en 均存在、前缀为 `ui.profile.`、无单边、逐 key 占位符契约、`ui.profile.*` 无 memo key/开关；②zh/en 取值、分组/空态/打开标签语义、`docs/` 与文件名/`not-applicable` 不翻译、en 无中文、`openRootDoc` 插值保留文件名。
  - 分区计数显式更新：`ui` 691→**698**、总 key 数 1242→**1249**、`ui` 扣除 B0 后 686→**693**（该断言注释本就要求“漏 key 或顺手加 key 需显式更新”）。
  - 既有 parity、占位符、复数、锚点、B1–B4 断言未删除或放宽。

**未做（S5 明确不做）**：不改 `app/**`（含 S4 渲染消费方）、`src/model/**`、`src/service/**`、`src/pipeline/**`、`src/provider/**`、其他 shared 文件（`runtime-settings.ts`/`runtime-shared.ts`/`i18n/index.ts`/`i18n-guard-allowlist.ts` 等）、`test/桌面UI/**`、`test/桌面应用/**`、`test/测试/**`、`docs/**`、角色卡/边界、目标项目；不新增依赖/枚举；不改既有 key 名称/文案；不 commit/push。

## 2. 7 个 key 与取值

| # | key | zh-CN | en-US | 占位符 | 语义/使用条件 |
| --- | --- | --- | --- | --- | --- |
| 1 | `ui.profile.docsGroupRoot`（必需） | 角色根文档 | Role root documents | — | “文档”节根文档分组标题 |
| 2 | `ui.profile.docsGroupSubdir`（必需） | docs/ 目录 | docs/ directory | — | “文档”节 `docs/` 分组标题；`docs/` 是路径标识，原样保留 |
| 3 | `ui.profile.noRoleDocs`（必需） | （暂无角色文档） | (no role documents) | — | 根文档组与 docs 组都为空（含内置角色）时的整节空态 |
| 4 | `ui.profile.openRootDoc`（必需） | 只读打开 {name} | Open {name} read-only | `{name}` | 根文档行按钮的 `title`/`aria-label`；`{name}` 为原样文件名 |
| 5 | `ui.profile.rootDoc.featureMap`（可选副标签） | 功能导航 | Feature map | — | `feature-map.md` 用途副标签 |
| 6 | `ui.profile.rootDoc.functionalDescription`（可选副标签） | 模块视图与代码位置 | Module view and code locations | — | `functional-description.md` 用途副标签 |
| 7 | `ui.profile.rootDoc.apiSpec`（可选副标签） | 接口 / 实现报告 | API / implementation report | — | `api-spec.md` 用途副标签 |

- 7 个 key 与方案 §5.5.6 表、团队计划 §3.4 建议逐字一致；本批实现了全部 3 个可选副标签（不是 N/A），S4 可选择是否展示副标签，但 key 已可用。
- 既有 `ui.profile.docsTab`（文档）、`ui.profile.noDocs`（无 docs/ 目录或为空）、`ui.profile.viewListedDocs`（查看已列文档）、`ui.profile.changelogTab`、`ui.profile.noChangelog` **未改**。
- 文件名 `feature-map.md`、`functional-description.md`、`api-spec.md`、路径 `docs/`、内容值 `not-applicable` 不翻译；未新增任何 memo key/开关。
- 消费契约：S4 按 `ui.profile.openRootDoc` + 原样文件名组装按钮文案；除 `openRootDoc` 外均为无参模板。

## 3. 测试与 typecheck（原始输出见证据）

环境：Windows 11 / Git Bash（MINGW64_NT-10.0-26300 3.6.10-710e5275.x86_64）；Node **v24.22.1**（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）；npm **11.19.1**；cwd `C:\Users\51054\Desktop\work\ans-studio`；分支 `v1.7.0-work`；HEAD `6407d636b69e3f8eb12fb872e2622172bcbff583`。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 套件（必跑） | `node --test "test/项目管理/shared/**/*.test.ts"` | **186 tests / 181 pass / 0 fail / 5 skipped / 0 todo**，exit 0；2 个新用例通过 |
| 根类型检查（必跑） | `npm run typecheck`（PATH 前置 Node 目录） | `tsc --noEmit` exit 0，无诊断 |
| 硬编码守卫（同套件内） | 同上 | `[i18n-guard] scanned=107 allowlisted=18 violations=0` |

- 5 个 skipped 为 `atomic-write.test.ts` 既有 D3 `finalMode`/umask/chmod 平台条件跳过（Windows），与本批无关；日志原文见 `s5-i18n-test.log`。
- 首轮自测曾因 memo 负例断言过宽（匹配到既有 `main.interface.memoNoContinuation` 写卡校验 key）失败 1 项；已收窄为仅检查 `ui.profile.*` 命名空间，复跑全绿。此为测试自身修正，未放宽任何产品断言。
- 目录 key 数：zh-CN 与 en-US 均 **1249**，`ui.profile.*` 共 **22** 个（原 15 + 新增 7）。

## 4. 基线与候选哈希

| 文件 | 基线 `git hash-object` | 基线 sha256 | 候选 `git hash-object` | 候选 sha256 |
| --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | `c0501469ed8b8631e63ba124f419aa642a034400` | `d487a8d4…953e4e` | `5700649eccc1255a3b616073a32f42d23ebeb6cb` | `c37fc29f91b5419595e3a65171ade3cad917c389b53de456a536b6979d7d9255` |
| `src/common/shared/i18n/messages/en-US.ts` | `74ab4a7d654143b20b6614d7508f48da67c211cc` | `05089d70…7e4b373` | `183eddea3473701315b44c6f7be9754705051051` | `37e4ad6c08f8678b2bd3372dd44594f9040a88382f2f99194e363b3b5b4e4d0d` |
| `test/项目管理/shared/i18n.test.ts` | `26501c142dbd2c03bd6db6e135a0a29da8d46a3b` | `d8e75677…bebac97` | `1b8a35c5de5771b179fd66a6f2cd3d5b5b4e6d6c` | `048d2be66863b1f98e147f2111934123371df27f2d363ab3cc84fac9fd7d3c72` |

- 完整 sha256 与原始输出：`s5-candidate-hashes.txt`；`git status --short`：`s5-git-status.txt`；diff stat：`s5-diff-stat.txt`；完整 diff：`s5-candidate.diff`。
- diff stat：`zh-CN.ts +10`（7 key + 3 行注释）、`en-US.ts +11`（7 key + 4 行注释）、`i18n.test.ts +128/-3`（新增 2 用例 + 计数更新）。
- 团队计划 §1.4 记录的 HEAD 为 `ee59296…`；实际开工 HEAD 为 `6407d63…`（含“checkpoint accepted i18n…”提交），三个目标文件在开工时均为干净工作树；本批候选只含本批增量。

## 5. 写集与边界

本批写盘（产品/测试/记录 + 证据目录）：

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`
- `角色卡/项目管理/docs/change/2026-10-23_change_role-root-docs-display.md`（本文件）
- `角色卡/项目管理/docs/change/2026-10-23_change_role-root-docs-display-evidence/`（证据）

未触碰：`app/**`、`src/model/**`、`src/service/**`、`src/pipeline/**`、`src/provider/**`、`src/common/shared/` 其他文件、`test/桌面UI/**`、`test/桌面应用/**`、`test/测试/**`、`docs/**`、角色卡/边界、目标项目、`package.json`/`tsconfig*`/构建配置。未新增依赖/枚举；未 commit/push/暂存。

## 6. 残余与阻塞

- S4（桌面UI）尚未消费这些 key：渲染分组/按钮/空态属 S4 写集，本批不接线；key 契约已冻结，可供 S4 typecheck 引用。
- 无 POSIX/平台相关证据需求（本批纯消息目录与单测）。
- 未发现阻塞；未发现既有测试回归。5 个 skipped 均为既有 Windows 平台跳过。
- 本记录不构成验收结论；最终以独立验收按标准 v1 P6 判定为准。
