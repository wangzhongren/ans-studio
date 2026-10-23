# 变更记录：i18n B1–B4 共享 key 契约（一次性）

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key 目录与测试已写盘并自测通过；**未经独立验收**，未迁移任何消费方）
- 任务：i18n T2，B1–B4 的共享 key 契约（方案 §4.3/§4.9/§4.11/§5.4/§7.1 B1–B4/§9.1 B1–B4；验收 P1/P3/P4/P7/P9）
- 依据：
  - 客户闸门 2 与实施授权：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`
  - 方案 v1：`docs/planning/2026-10-23_design_i18n.md`
  - 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3、§5 I5–I8
  - 验收标准：`docs/acceptance/i18n-criteria-v1.md`（P1/P3/P4/P7/P9）
  - B0 契约与守卫：`src/common/shared/i18n/**`、`test/项目管理/shared/i18n-guard-allowlist.ts`

## 1. 本批做了什么

一次性为 **B1/B2 渲染层、B3 主进程用户可见文本、B4 共享设置元数据** 建立 key 契约，只写共享消息目录与共享测试：

- `src/common/shared/i18n/messages/zh-CN.ts`：新增 key 全集参考（zh-CN 逐字保留现有界面措辞）。
- `src/common/shared/i18n/messages/en-US.ts`：逐 key 英文目录（`Record<MessageKey, MessageTemplate>` 编译期强制齐全）。
- `test/项目管理/shared/i18n.test.ts`：新增 B1–B4 分区计数、锚点 key、命名规范、占位符一致性、复数 `other`、B4 元数据覆盖断言；**未删除/未放宽任何 B0 断言**。
- `src/common/shared/i18n/keys.ts` **未改**：`MessageKey` 从 zh-CN 目录自动推导，无需手工维护。
- 证据：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b4-keys-evidence/`。
- `api-spec.md`、`memo.md` 追加契约摘要/备忘。

**未做（本批明确不做）**：不改 `app/**`、`src/model/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、`runtime-settings.ts`/`runtime-shared.ts` 形状、其他测试目录、其他角色卡/边界、`docs/scheduling|acceptance|communication`；不新增依赖；**不移除 allowlist 条目**（消费方尚未迁移）；不 commit。

## 2. 目录与 key 数量

目录总 key 数 **1203**（含 B0 13）。新增 **1190**：

| 分区 | 新增 key | 说明 |
| --- | --- | --- |
| B1 渲染层外壳 | **407** | `ui.*`：titlebar/app/chatHeader/role/sidebar/queue/queueSubview/work/drawer/engineSelect/composer/confirm/settings/runtimeConfig/governance/reportCard/documentView/document/profile/stores |
| B2 渲染层聊天/面板 | **269** | `ui.*`：chatRow/chatStore/chatStream/events/judge/markdown/operator/reasoning/reportView/tool |
| B3 主进程用户可见文本 | **452** | `main.*`：session/interface/governance-advance/history/composerImages/confirm/recovery/operator/customerInput/judgeReason/runtimeConfig/project/runtimeResolution/watchdog/demo/common |
| B4 共享元数据 + 跨层短词 | **62** | `shared.runtimeSettings.*`（仅 key）+ `shared.common.*`（跨层短词） |

复用规则：同一含义/同一文案只保留一个 key（同层与跨层均去重；跨层短词集中在 `shared.common.*`）。目录中**无重复 zh 文案组**（长度 ≥4 的非短词）。

## 3. key 命名与分类规则

- `<area>.<component>.<purpose>`，area = `ui | main | shared`（`preferences.*` 为 B0 既有）；ASCII、点分隔、允许 camelCase/数字/连字符（对齐任务示例 `ui.shell.titleBar.minimize`、`shared.runtimeSettings.pi.token.label`、B0 的 `saveFailed`）；禁止中文/空格/运行时拼接。
- 动态值用 `{param}`；计数文案用复数模板（en `{one, other}`，zh `{other}` 或字符串）；不把整句拆成多 key 拼接。
- 机器标识不入 key、不入目录；外部错误原文作为 `{detail}` 参数。
- 新增 key 的步骤：先改 `zh-CN.ts`（key 全集），再改 `en-US.ts`（类型强制齐全）；`keys.ts` 自动推导。

## 4. 分类与非目标

62 个 allowlist 文件的逐文件分区、已 key 化内容、保持原样项与理由，见证据：
[`non-target-and-classification.md`](2026-10-23_change_i18n-b1-b4-keys-evidence/non-target-and-classification.md)。

要点：

- **完全非目标（5）**：`app/renderer/src/test-driver.ts`（测试驱动）、`app/desktop/packaged-smoke.ts`（模板内注释）、`src/index.ts`、`src/interface/cli/govern.ts`、`src/interface/cli/run.ts`（CLI 本轮不翻译）。
- **B3 保持原样**：发给 agent 的任务文案/提示词（`governance-advance.ts` 的任务构建函数、`session.ts` 的反馈提示/`role_status`/`session_tail` 输出、demo `systemPrompt`）、外部错误原文、诊断/日志码（`[watchdog] tick …` 未进目录）、机器标识/系统行标记、legacy 历史解析正则、角色卡/团队计划 schema 词汇。
- **文本依赖**（迁移期必须改结构化判定，不在本批修改）：`SettingsPanel` 的 `startsWith("已保存到 .env")`、`governance-view` 的 `indexOf("未写入任何文件")`、`chat-store` 的 `indexOf("可读历史保留")`、`events` 的历史前缀解析。详见证据 §6。

## 5. zh-CN 逐字保留

- 方法：对 62 个 allowlist 文件逐 key 匹配 zh 值（完整字面量或按 `{param}` 切分后的静态片段）。
- 结果（`zh-verbatim-mapping.tsv`）：`exact` 837、`composed-all-chunks` 337、`composed-partial` 4、`no-literal-trace` 12、B0 不在扫描范围 13。
- 12 个 `no-literal-trace` 均为源码多段拼接/短片段组合（如 `"返回" + backText`、`"第 " + n + " 位"`、`${n} 秒`），逐条列于 `zh-verbatim-summary.txt`；消费方按本契约迁移后 zh 输出与现状逐字一致。**未改写任何中文措辞**。

## 6. en-US 质量

- 自然英文，术语统一：role / card / boundary / flow / acceptance；approval / decision delegation；dispatch / handback；governance record；Steward / Crew / Proof / Lead / Draft 保留角色名。
- 品牌名 Pi / Codex / Claude / ANS 不翻译；`roleId` 机器值不翻译。
- 复数用 `Intl.PluralRules` 模板（one/other）；占位符与 zh 逐 key 一致（测试断言 0 差异）。
- 英文长度风险留给 B1/B2 布局批次（960×620、侧栏 208、200% zoom），本批不声称布局通过。

## 7. 测试、守卫与 typecheck（原始输出见证据）

环境：Node v24.22.1 / npm 11.19.1，Windows 11，cwd `C:\Users\51054\Desktop\work\ans-studio`（PATH 已加 `C:\Users\51054\AppData\Local\Programs\nodejs`）。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| shared 套件 | `node --test "test/项目管理/shared/**/*.test.ts"` | **171 tests / 166 pass / 0 fail / 5 skipped**，exit 0（5 skip 为既有 Windows 平台按设计跳过） |
| 根类型检查 | `npm run typecheck` | exit 0 |
| 渲染层类型检查（补充） | `npm run typecheck:renderer` | exit 0 |
| 硬编码守卫 | `node --test "test/项目管理/shared/i18n-guard.test.ts"` | **scanned=107 allowlisted=62 violations=0**，6/6 pass，exit 0 |

守卫说明：任务预期为「103 扫描」，实际 **107**；差异来自 B0 后段其他角色新增的 4 个非中文接线文件（`app/desktop/i18n.ts`、`app/desktop/preferences.ts`、`app/renderer/src/i18n/index.ts`、`app/renderer/src/i18n/locale-store.ts`），不是本批新增文件；**allowlist 仍为 62、未移除任何条目、违规 0**。

## 8. B4 边界（重要）

- 本批**只新增 key**；`src/common/shared/runtime-settings.ts` 与 `runtime-shared.ts` 的形状/字段/文案**未改动**，消费方解析在 B4 后续批次。
- 测试 `B4 覆盖` 断言：`RUNTIME_SETTINGS`/`RUNTIME_LABELS` 中每个含中文的 label/help/choiceLabel 都能在目录中找到对应值（当前全部覆盖）。
- `RUNTIME_LABELS.demo = "演示"` 对应 `shared.runtimeSettings.runtime.demo`；品牌名不翻译。

## 9. 已知边界与未完成项

1. **消费方迁移未做**：`app/**` 仍硬编码中文；allowlist 未收紧；守卫仍放行 62 个文件。
2. **不声称完整 i18n 验收**：本批只交付 key 契约；P1/P3/P4/P7/P9 的消费方行为、布局、切换/重启、真实 Electron 均未由本批证明。
3. **B4 形状未改**：`runtime-settings.ts` 的 `label/help/choiceLabels` 仍是字符串；key 化与主进程解析在后续批次。
4. **文本依赖**（§4）在迁移时必须同步改造，否则切换语言会破坏行为。
5. **复数/插值**：本批只定义模板并测试占位符/`other`；消费方实际调用矩阵仍由 B0 测试覆盖。
6. **未 commit、未 push、未发布**。

## 10. 候选与证据

- key 清单：`2026-10-23_change_i18n-b1-b4-keys-evidence/key-inventory.tsv`
- zh 逐字映射：`.../zh-verbatim-mapping.tsv`、`.../zh-verbatim-summary.txt`
- 分类：`.../non-target-and-classification.md`
- 原始输出：`.../test-shared.log`、`.../typecheck.log`、`.../typecheck-renderer.log`、`.../guard.log`
- 哈希：`.../hashes.txt`（`git hash-object` + `sha256sum`，写盘后复算）
- 候选文件：
  - `src/common/shared/i18n/messages/zh-CN.ts`
  - `src/common/shared/i18n/messages/en-US.ts`
  - `test/项目管理/shared/i18n.test.ts`
  - 本记录与证据目录
  - `角色卡/项目管理/api-spec.md`、`角色卡/项目管理/memo.md`（追加摘要）
