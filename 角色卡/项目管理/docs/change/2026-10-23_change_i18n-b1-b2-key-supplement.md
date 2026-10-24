# 变更记录：i18n B1/B2 共享 key 增补（残余 9 文件缺口）

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key、测试、证据已写盘并自测通过；**未经独立验收**；未迁移任何消费方）
- 触发：B1/B2 渲染层迁移（`角色卡/桌面UI/docs/change/2026-10-23_change_i18n-b1-b2.md`，sha256 `d7e7afd2…`）完成后仍有 9 个渲染层文件含可翻译中文，但冻结目录没有逐字合适的 key（`.../2026-10-23_change_i18n-b1-b2-evidence/residual-scan.log`；B1/B2 报告 §4/§6）。
- 依据：
  - 方案 v1：`docs/planning/2026-10-23_design_i18n.md` §4.3/§4.10/§4.11/§7.4
  - 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §4.3、§5
  - B0 契约与守卫：`src/common/shared/i18n/**`、`test/项目管理/shared/i18n-guard-allowlist.ts`
  - B1–B4 冻结目录：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b4-keys.md`（1203 key）
- 证据目录：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b2-key-supplement-evidence/`。
- 未提交：不 commit、不 push。

## 1. 本批做了什么

只向共享消息目录新增 **10 个 B1/B2 `ui.*` key**（zh-CN 逐字取当前渲染层源码；en-US 自然英文），并增补共享测试：

- `src/common/shared/i18n/messages/zh-CN.ts`：新增 10 key（含 1 个复数模板）。
- `src/common/shared/i18n/messages/en-US.ts`：逐 key 英文目录（`Record<MessageKey, MessageTemplate>` 编译期强制齐全）。
- `test/项目管理/shared/i18n.test.ts`：新增 3 个「key 增补」用例（存在、zh 逐字、en/复用、插值/复数），并更新分区计数 681→**691**、总数 1203→**1213**；B0/B1/B2 的 key 值、锚点、parity/复数断言未放宽。
- 证据：`...-evidence/{key-supplement-inventory.tsv,test-i18n.log,test-shared.log,typecheck.log,typecheck-renderer.log,env.log,hashes.txt}`。

**未做（本批明确不做）**：不改 `app/renderer/**`、`app/desktop/**`、`src/model/**`、`src/pipeline/**`、`src/common/门禁引擎/**`；不改 `i18n-guard-allowlist.ts`（消费方尚未迁移这些新 key，PM allowlist 收紧另批）；不改 B0/B1/B2 既有 key 的值或名称；不新增依赖；不 commit。

## 2. 新增 key 清单（10）

| # | key | zh-CN（逐字取当前源码） | en-US | 消费文件（迁移后） |
| --- | --- | --- | --- | --- |
| 1 | `ui.chatHeader.tabWork` | 工作概览 | Work overview | `shell/ChatHeader.tsx:126,130`；`shell/QueueSubview.tsx:37` 复用 |
| 2 | `ui.chatHeader.tabCard` | 角色资料 | Role profile | `shell/ChatHeader.tsx:144,147`；`shell/QueueSubview.tsx:37` 复用 |
| 3 | `ui.settings.saveNoteNoChanges` | 已保存到 .env（改动键 无）。{tail}{application} | Saved to .env (no keys changed). {tail} {application} | `chat/runtime-config.ts:391-400` |
| 4 | `ui.runtimeConfig.unknownError` | 未知错误 | Unknown error | `chat/runtime-config.ts:367,373` |
| 5 | `ui.confirm.expiredShell` | 此确认已失效，未获放行——请让角色重新发起。 | This confirmation has expired and was not approved — ask the role to initiate it again. | `stores/confirm-store.ts:252` |
| 6 | `ui.governanceStore.stepFallback` | 治理步骤 | Governance step | `stores/governance-store.ts:432` |
| 7 | `ui.judge.roleName.liaison` | Lead / 主理 | Lead | `chat/judge.ts:51` |
| 8 | `ui.judge.roleName.verifier` | Proof / 验收 | Proof | `chat/judge.ts:55` |
| 9 | `ui.judge.headline.writeConfirmOverflow` | 确认写入 {count} 个路径（{paths} 等 {count} 个） | `{one, other}`：Confirm writing {count} path / paths ({paths}, etc.) | `chat/judge.ts:497-508` |
| 10 | `ui.reportView.savingHistory` | 正在保存历史… | Saving history… | `chat/report-view.ts:296,371` |

逐 key 的源码行号与上下文见证据 `key-supplement-inventory.tsv`。

## 3. 复用 vs 新增

| 缺口 | 处理 | 理由 |
| --- | --- | --- |
| ChatHeader tab 独立标签 | 新增 1/2 | 现有 `ui.work.title`/`ui.profile.title` 含 `{roleName} ·` 前缀，不能用于纯 tab；`ui.work.overviewAria`/`ui.profile.aria` 是带计数的 aria 句。 |
| QueueSubview 可见返回文本 | **复用 1/2** | 可见文本逐字就是「工作概览/角色资料」；`ui.queueSubview.backWork/backRole` 含「返回」，与可见文本不逐字等价，继续只作 aria-label。未新增重复文案 key。 |
| runtime-config 空错误 | 新增 4 | 前缀复用既有 `ui.runtimeConfig.saveFailed`/`ui.runtimeConfig.saveException`（`{detail}`）；只有空 detail 的兜底缺 key。`shared.common.unknown`（未知）不逐字等价。 |
| runtime-config 零改动键 | 新增 3 | 非零分支复用既有 `ui.settings.saveNoteShort`（`{count}`）；尾句复用 `stillMissingCount`/`requiredReady`；应用时点复用 `application*`。`saveNoteTitle` 为「改动键：{keys}」带冒号，零分支「改动键 无」不逐字等价，故补一条完整模板（不拼接）。 |
| confirm 失效兜底 | 新增 5 | `shared.common.shellConfirmationExpired` 含「（超时或应用重启）」，与现源码「此确认已失效，未获放行——…」不逐字等价；`ui.confirm.expiredRecovery` 是恢复卡且带括号，不复用。 |
| 治理步骤兜底 | 新增 6 | 既有 `ui.governanceStore.nextStep`（下一步：{step}）可复用，缺的是 `{step}` 兜底值本身。 |
| judge 内置角色名 | **复用 3 + 新增 2** | `Draft / 提案`、`Crew / 组队`、`Steward / 统筹` 与既有 `ui.role.governance.{draft,crew,steward}.name` **逐字相同**，直接复用；`Lead / 主理`、`Proof / 验收` 与目录 `主理 / Lead`、`验收 / Proof` 顺序相反，为保 zh 逐字单列 `ui.judge.roleName.{liaison,verifier}`。未改 `roleId`/`GovernanceFunction`；en-US 仍为 Lead/Draft/Crew/Steward/Proof。 |
| judge「等 N 个」 | 新增 9 | 现有 `ui.judge.headline.writeConfirm` 通过 `{tail}` 接收运行时拼接的 `" 等 " + N + " 个"`（en 下混入中文）。新增完整模板 `writeConfirmOverflow`（`{count}`/`{paths}`），路径 > 3 时整句取词，不做字符串拼接；≤ 3 继续用 `writeConfirm`（`tail: ""`）。en 用 one/other 复数模板。 |
| 历史保存 pending | 新增 10 | 既有 `ui.reportView.savingReport` 是报告版；历史版无 key。 |

复用明细（未新增、未改动）：`ui.runtimeConfig.saveFailed/saveException`、`ui.settings.saveNoteShort/stillMissingCount/requiredReady/application*`、`ui.queueSubview.backWork/backRole`（aria）、`ui.role.governance.draft/crew/steward.name`、`ui.reportView.savingReport`。

## 4. 仍不补的协议/数据项

- `chat/events.ts`：机器匹配正则/协议前缀（`read_file 失败：`、`[系统·…]`、`[派发]`、`[回交]`、`用户指令：` 等），按方案保持原文。
- `shell/Sidebar.tsx`：`groupDuty === "组长"` 是角色数据值（排序哨兵），不是 UI 文案。
- `shell/ChatHeader.tsx`：`恢复失败：` 文本解析（`/恢复失败：(.+)）$/`）待 B3 提供结构化字段后移除；本批不加 key，不固化该解析串。
- `test-driver.ts`：完全非目标（e2e 演示动作，PM 分类文档已登记）。
- 不改 `i18n-guard-allowlist.ts`：上述文件仍会被守卫放行；收紧由 PM 在消费方迁移批次另行处理。

## 5. 消费方迁移契约（供桌面UI / B3 后续批次）

- ChatHeader：tab 可见文本与零角标 `aria-label` 用 `ui.chatHeader.tabWork/tabCard`；有角标时继续用 `ui.work.overviewAria`/`ui.profile.aria`。
- QueueSubview：`backText` 用 `ui.chatHeader.tabWork/tabCard`；`aria-label` 继续用 `ui.queueSubview.backWork/backRole`。
- runtime-config：
  - `saveFailureStatusText` → `ui.runtimeConfig.saveFailed`，空 detail 传 `ui.runtimeConfig.unknownError`；
  - `saveExceptionStatusText` → `ui.runtimeConfig.saveException`，空 detail 同上；
  - `savedStatusText`：`appliedKeys.length > 0` 用 `ui.settings.saveNoteShort`（`{count}`），否则用 `ui.settings.saveNoteNoChanges`；`tail` 用 `stillMissingCount`（`{count}`）/`requiredReady`；`application` 用 `applicationShortLabel(locale)`。
- confirm-store：无 reason 兜底 → `ui.confirm.expiredShell`。
- governance-store：`step: nextFunction || cardKind || t("ui.governanceStore.stepFallback")`。
- judge：roleId → key 固定映射为 liaison→`ui.judge.roleName.liaison`、rapporteur→`ui.role.governance.draft.name`、nominator→`ui.role.governance.crew.name`、convener→`ui.role.governance.steward.name`、verifier→`ui.judge.roleName.verifier`；路径 > 3 用 `ui.judge.headline.writeConfirmOverflow`（`{count}`、`{paths}`），否则用 `ui.judge.headline.writeConfirm`（`tail: ""`）。
- report-view：历史 pending → `ui.reportView.savingHistory`；报告 pending 仍用 `ui.reportView.savingReport`。

## 6. 测试、typecheck 与守卫（原始输出见证据）

环境：Node v24.22.1 / npm 11.19.1，Windows 11，cwd `C:\Users\51054\Desktop\work\ans-studio`（PATH 加 `C:\Users\51054\AppData\Local\Programs\nodejs`）。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约 | `node --test "test/项目管理/shared/i18n.test.ts"` | **31 tests / 31 pass / 0 fail**，exit 0（新增 3 用例） |
| shared 套件 | `node --test "test/项目管理/shared/**/*.test.ts"` | **174 tests / 168 pass / 1 fail / 5 skipped**，exit 1 |
| 根类型检查 | `npm run typecheck` | exit 0（无输出） |
| 渲染层类型检查（补充） | `npm run typecheck:renderer` | exit 0（无输出） |

**1 个失败为既有、与本批无关**：`i18n-guard.test.ts` 的「allowlist 纪律：无陈旧条目」在 `app/renderer/src/App.tsx` 失败。该失败在**改盘前基线**即存在（基线 171 tests / 165 pass / 1 fail / 5 skipped，失败项相同），原因是 B1/B2 已迁移的 30 个文件仍在 `i18n-guard-allowlist.ts`；桌面UI 报告 §6 与 `...b1-b2-evidence/i18n-guard-stale.log` 已登记。守卫本体 `scanned=107 allowlisted=62 violations=0`。本批**未改** allowlist。

计数变化：目录 1203→**1213** key（`ui` 681→**691**、`main` 457、`shared` 62、`preferences` 3）。`i18n.test.ts` 仅更新该分区计数与新增用例；B0/B1/B2 的既有 key 值、锚点、parity、占位符、复数断言均未修改或放宽。

## 7. 写集与边界

本批写盘（仅此 3 个产品/测试文件 + 本记录/证据）：

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`
- `角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b2-key-supplement.md`（本文件）及证据目录

未触碰：`app/renderer/**`、`app/desktop/**`、`src/model/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、`i18n-guard-allowlist.ts`、`package.json`、`tsconfig*`、其他角色卡/测试目录。未新增依赖；未 commit/push。

## 8. 候选与证据

- key 清单：`2026-10-23_change_i18n-b1-b2-key-supplement-evidence/key-supplement-inventory.tsv`
- 原始输出：`.../test-i18n.log`、`.../test-shared.log`、`.../typecheck.log`、`.../typecheck-renderer.log`、`.../env.log`
- 哈希：`.../hashes.txt`（`git hash-object` + `sha256sum`，写盘后复算）
- 候选文件：本文件、上述 3 个代码/测试文件、证据目录。
