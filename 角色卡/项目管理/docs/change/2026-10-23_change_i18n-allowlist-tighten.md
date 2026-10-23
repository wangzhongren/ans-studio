# 变更记录：i18n 剩余缺 key 补齐（`dispatchModelNote`）与 allowlist 收紧

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key、测试、allowlist、证据已写盘并自测通过；**未经独立验收**；未迁移任何消费方）
- 触发：
  - B1/B2/B3 消费方迁移完成（B1/B2 192/192、B3 桌面 555/555、typecheck 0）；B3 收尾扫出最后一个用户可见缺 key：`main.session.dispatchWrongSource` 的 `{modelNote}` 片段（`session.ts:3176` 逐字中文）。
  - B0 allowlist 仍列 40+ 个已迁移零 Han 文件（陈旧），守卫失败。
- 依据：
  - 方案：`docs/planning/2026-10-23_design_i18n.md` §4.9（避免第二份文案）、§4.11（分类规则）
  - 分类：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b4-keys-evidence/non-target-and-classification.md`
  - B3 记录：`角色卡/桌面窗口/docs/change/2026-10-23_change_i18n-b3.md`、`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b3-key-supplement.md`
  - 通信备忘：`docs/communication/memo.md`（2026-10-23 B3 收尾条目）
- 证据目录：`角色卡/项目管理/docs/change/2026-10-23_change_i18n-allowlist-tighten-evidence/`
- 未提交：不 commit、不 push。

## 1. 本批做了什么

1. 新增 2 个 B3 用户可见 key：**`main.session.dispatchModelNote`**（下文）与 **`main.interface.teamPlanMissingBoundHint`**（协调方追加；zh/en、消费点与验证见 §7）。
   - zh-CN（逐字取 `app/desktop/session.ts:3176`）：`（trio：Steward（统筹）或主理 Lead）`
   - en-US（自然英文，前导空格便于拼接）：`" (trio: Steward or Lead)"`
   - 消费契约（B3 接线，非本批）：`mainT("main.session.dispatchWrongSource", { from, dispatcher, modelNote: model === "trio" ? mainT("main.session.dispatchModelNote") : "" })`。
   - 目录中无同文案 key（`dispatchNoDispatcher` 的 `trio=Steward（统筹） / single=主入口` 是不同句子），不构成重复文案；`{modelNote}` 在 en 下由 `... dispatch owner {dispatcher} (trio: Steward or Lead).` 自然成句。
2. 更新 `test/项目管理/shared/i18n.test.ts`：B3 增补清单 21→**23** key；新增 zh 逐字、en 自然英文、拼接后整句（zh/en）断言（含团队计划绑定片段）；分区计数 `main` 478→**480**、总数 1234→**1236**、`main - B0 = 473→475`。未放宽任何既有断言。
3. **收紧 `test/项目管理/shared/i18n-guard-allowlist.ts`**：62 条 → **20 条**，仅保留当前扫描仍含 Han 的文件；为每条写明不翻译理由；头部记录收紧历史与 B4 备注。移除 **42** 条已迁移为零 Han 的陈旧条目（见证据 `allowlist-diff.txt`）。

**未做（本批明确不做）**：不改 `app/desktop/**`、`app/renderer/**`；不改 B4 元数据形状（`runtime-settings.ts`/`runtime-shared.ts` 保持原样，仅留 allowlist/备注）；不新增依赖；不 commit。

## 2. allowlist 收紧（scanner 实测，非沿用旧日志）

扫描命令使用 `i18n-guard-scanner.ts` 的 `collectGuardFiles` + `findHan`（去注释；目标 = `app/renderer/src/**`、`app/desktop/**`、`src/index.ts`、`src/interface/cli/**`、`src/common/shared/runtime-settings.ts`；排除测试/`messages/`/`dist`/`node_modules`/`governance-roles.ts`），对**当前工作树**逐文件实测：

| 指标 | 收紧前（B0 allowlist） | 收紧后 |
| --- | --- | --- |
| scanned（目标文件数） | 107 | 107 |
| allowlisted | 62 | **20** |
| allowlisted 且仍含 Han | 20 | 20 |
| allowlisted 但零 Han（陈旧） | **42** | **0** |
| allowlist 外含 Han（违规） | 0 | 0 |

> 说明：任务预期移除约 40 条；实测为 **42** 条。原因是 B3 增补批的 `stale-allowlist.log`（40 条）之后，B3 收尾又完成了 `app/desktop/composer-images.ts`、`app/desktop/customer-input.ts` 的迁移，二者现已零 Han。以**当前扫描**为准。

### 2.1 移除清单（42，全部已迁移为零 Han）

完整清单见证据 `allowlist-diff.txt`。分组计数（共 42）：

- `app/desktop/**`：**6**（`composer-images.ts`、`confirm-card.ts`、`customer-input.ts`、`diagnostics.ts`、`recovery-channel.ts`、`runtime-history.ts`）
- `app/renderer/src/**`：**36**（`App.tsx`/`main.tsx`、已迁移的 `chat/*`、`shell/*`、`stores/*` 文件）
- 其他：0

（逐条以 `allowlist-diff.txt` 的 `--- REMOVED ---` 段为准。）

### 2.2 保留清单（20）及理由

条目与内核理由同时写进 `i18n-guard-allowlist.ts` 行内注释，摘要：

| # | 文件 | 保留理由（分类） |
| --- | --- | --- |
| 1 | `app/desktop/chat-adapter.ts` | demo `systemPrompt` = agent-facing 提示词（classification §4） |
| 2 | `app/desktop/governance-advance.ts` | 发给 Convener/Crew/Lead 的任务正文；flow 收口原因常量（持久化机器状态）+ 正则；技能路径「编排」 |
| 3 | `app/desktop/interface.ts` | 角色卡/团队计划 schema 词汇、`new/changed/existing` 输入别名、校验正则、agent-facing 任务正文；用户可见 issue 已走 `mainT`。**含 2 项待 B3/PM 处理的参数残余，见 §5** |
| 4 | `app/desktop/judge-reason.ts` | `判断读取被拒：`/`，已转手动确认。` 为 reason **输入解析标记**（机器匹配）；展示文本已 key 化 |
| 5 | `app/desktop/operator-channel.ts` | agent-facing deny reason（PM 分类 #12）、错误文本分类正则、技能路径「编排」 |
| 6 | `app/desktop/packaged-smoke.ts` | 中文只在 `executeJavaScript` 模板字符串内的注释（扫描器保守超集），无用户可见文本（classification §5） |
| 7 | `app/desktop/project.ts` | `source:` 授权来源审计元数据（机器/审计，classification §4） |
| 8 | `app/desktop/runtime-config.ts` | `definition?.label ?? "演示"` 属 **B4** `RUNTIME_LABELS` 范围（B3 记录 §7 / kept-non-target） |
| 9 | `app/desktop/runtime-resolution.ts` | 未注入 `t` 的逐字兜底常量（真实路径已用 `main.runtimeResolution.noRuntime`）；持久化错误仅进诊断日志（不翻译） |
| 10 | `app/desktop/session-history.ts` | legacy 历史文本解析正则（`read_file 失败：` 等，机器匹配） |
| 11 | `app/desktop/session.ts` | `[系统·…]` 协议标记、`(投递机)` 机器标识、agent-facing 治理反馈/role_status/session_tail 输出、诊断兜底、agent-facing `{action}`（PM 分类 #7）、账本 `[协调]` 前缀 |
| 12 | `app/desktop/watchdog.ts` | 技能路径「编排」+ `[watchdog] tick 失败…` stderr 日志（日志不翻译） |
| 13 | `app/renderer/src/chat/events.ts` | 历史文本解析正则、系统行/【系统通知】/[派发]/[回交] 协议标记、`USER_ECHO_PREFIX`（classification §3/§6） |
| 14 | `app/renderer/src/shell/ChatHeader.tsx` | `contextText` 的 `恢复失败：` legacy 解析正则（机器判定，非 UI 文案） |
| 15 | `app/renderer/src/shell/Sidebar.tsx` | `groupDuty === "组长"` 角色卡数据值比较（schema 词汇），非 UI 文案 |
| 16 | `app/renderer/src/test-driver.ts` | e2e 演示动作文案（测试基础设施，classification §5） |
| 17 | `src/common/shared/runtime-settings.ts` | **B4** 共享设置元数据（`shared.runtimeSettings.*` key 已进目录，消费方 B4 接线未做） |
| 18 | `src/index.ts` | CLI/装配入口，本轮不纳入（B5 第二阶段，classification §5） |
| 19 | `src/interface/cli/govern.ts` | CLI 命令输出，本轮不翻译（classification §5） |
| 20 | `src/interface/cli/run.ts` | 同上 |

补充说明：

- `src/common/shared/runtime-shared.ts` **不在扫描目标**（`GUARD_TARGETS` 只含 `runtime-settings.ts`），其 `RUNTIME_LABELS.demo = "演示"` 属 B4 待迁移，无需也无法进 allowlist；已在 allowlist 头部注释记录。

## 3. 测试、typecheck 与守卫（原始输出见证据）

环境：Windows 11 / Git Bash；Node v24.22.1（`C:\Users\51054\AppData\Local\Programs\nodejs\node.exe`，本 shell 未预置 PATH，运行时显式加入）；npm 11.19.1；cwd `C:\Users\51054\Desktop\work\ans-studio`。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约 | `node --test test/项目管理/shared/i18n.test.ts` | **34 tests / 34 pass / 0 fail**，exit 0（`test-i18n.log`） |
| 硬编码守卫 | `node --test test/项目管理/shared/i18n-guard.test.ts` | **6 tests / 6 pass / 0 fail**，exit 0；`scanned=107 allowlisted=20 violations=0`，0 陈旧（`test-guard.log`） |
| shared 套件 | `node --test "test/项目管理/shared/**/*.test.ts"` | **177 tests / 172 pass / 0 fail / 5 skipped**，exit 0（`test-shared.log`；B4 相关用例亦全绿） |
| 根类型检查 | `npm run typecheck` | exit 0，无诊断（`typecheck.log`） |

计数变化：目录 key 1234→**1236**（`ui` 691、`main` 478→**480**、`shared` 62、`preferences` 3）。

## 4. 写集与边界

本批写盘（仅此 4 个产品/测试文件 + 本记录与证据目录）：

- `src/common/shared/i18n/messages/zh-CN.ts`（+1 key）
- `src/common/shared/i18n/messages/en-US.ts`（+1 key）
- `test/项目管理/shared/i18n.test.ts`（22 key 清单/断言/计数）
- `test/项目管理/shared/i18n-guard-allowlist.ts`（62→20，逐条理由）
- `角色卡/项目管理/docs/change/2026-10-23_change_i18n-allowlist-tighten.md`（本文件）
- `角色卡/项目管理/docs/change/2026-10-23_change_i18n-allowlist-tighten-evidence/`（原始日志、扫描、清单差异、哈希）

未触碰：`app/desktop/**`、`app/renderer/**`、`src/model/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、`src/common/shared/runtime-settings.ts`、`src/common/shared/runtime-shared.ts`、`package.json`、`tsconfig*`、其他角色卡/测试目录。未新增依赖；未 commit/push。

基线锚点：`i18n-guard-allowlist.ts` 改前 sha256 = `fdf9317a6fbdf0ab5f9e0b417ea97df861ae1254b067a982c67a3009bf2f0c0f`，与 B0 证据基线一致（B3 写集外证明亦引用同值），确认本批只做了收紧。

## 5. 待 B3/PM 处理：扫描发现的用户可见参数残余（未静默加入 allowlist）

收紧逐文件复核时，发现 `app/desktop/interface.ts` 有 **2 处中文参数**被拼进**已 key 化的用户可见消息**（非本批写集，未改源码、未补 key，仅登记）：

1. `interface.ts:4364`：`const targetLabel = targetRoleId === "nominator" ? "Crew / 组队" : "Steward / 统筹";`
   - 作为 `{label}` 传入 `main.interface.openSessionFailed`（"无法开启 {label} 会话：{detail}"）与 `main.interface.sendTaskFailed`（"发送任务给 {label} 失败：{detail}"），经 `fail()` → 会话系统行可见；
   - en-US 下会出现 "Could not open the Crew / 组队 session: …" 混合文案。建议复用既有 `ui.role.governance.crew.name` / `ui.role.governance.steward.name`（en 分别为 "Crew"/"Steward"），**无需新增 key**，只需 B3 接线（`interface.ts` 属 B3 写集）。
2. `interface.ts:4582`：`boundHint = "（账本 appointment 绑定 ${preferredPlan}）"`
   - 作为 `{bound}` 传入 `main.interface.teamPlanMissingBound` / `teamPlanMissingShort`，经 `emitLeadDeliveryNote` 用户可见；
   - **已由协调方决定补 key**：本批追加 `main.interface.teamPlanMissingBoundHint`（见 §7）；B3 将 `boundHint` 改为 `mainT("main.interface.teamPlanMissingBoundHint", { plan: preferredPlan })` 后即消除中文参数。

其余保留文件的 Han 均落在既有分类（agent-facing/机器/协议/诊断/schema 词汇/测试基础设施/CLI/B4），无新的用户可见缺 key。B3 报告确认的最后缺 key（`dispatchModelNote`）与本批复核发现的参数片段（`boundHint`）均已补 key；`targetLabel` 复用既有 `ui.role.governance.*.name` 即可，无需新增 key。

## 6. 哈希与证据

- 修改文件改前/改后 `git hash-object` + `sha256sum`：`hashes.txt`。
- 扫描前后对照：`scan-before.txt`（allowlist=62，stale=42，violations=0）、`scan-after.txt`（allowlist=20，stale=0，violations=0）。
- allowlist 增删清单：`allowlist-diff.txt`。
- 原始输出：`test-i18n.log`、`test-guard.log`、`test-shared.log`、`typecheck.log`。

## 7. 追加：`main.interface.teamPlanMissingBoundHint`（协调方指令，同批补 key）

- 日期：2026-10-23（同批追加）
- 状态：`implemented-unverified`
- 新增 key：
  - zh-CN（逐字）：`（账本 appointment 绑定 {plan}）`
  - en-US（前导空格供拼接）：`" (appointment ledger bound to {plan})"`
- 消费契约（B3 接线，非本批）：`interface.ts:4582` 的
  `boundHint = preferredPlan !== "" ? mainT("main.interface.teamPlanMissingBoundHint", { plan: preferredPlan }) : ""`，
  继续作为 `{bound}` 传入 `main.interface.teamPlanMissingBound` / `main.interface.teamPlanMissingShort`；
  拼接效果：
  - zh：`团队计划缺失（账本 appointment 绑定 docs/scheduling/x-team-v2.md）；未派 Crew 写卡（…）`
  - en：`Team plan missing (appointment ledger bound to docs/scheduling/x-team-v2.md); Crew card-writing not dispatched (…)`
- 测试：`i18n.test.ts` 的 B3 增补清单 22→**23**；新增存在、zh 逐字、en、`{plan}` 插值及与 `teamPlanMissingShort` 的整句拼接断言（zh/en）；分区计数 `main` 479→**480**、总数 1235→**1236**、`main - B0 = 474→475`。既有断言未改。
- allowlist：本节写作时**未改**（20 条）；B4 完成后另行收紧至 18，见 §8。`interface.ts` 因 agent-facing/schema 词汇继续保留，且源码中 `boundHint` 字面量仍在（本批不改 `app/desktop`），不会 stale。
- 验证（证据同名日志已刷新）：
  - `node --test test/项目管理/shared/i18n.test.ts`：34/34 pass，exit 0。
  - `node --test test/项目管理/shared/i18n-guard.test.ts`：6/6 pass，exit 0；`scanned=107 allowlisted=20 violations=0`，stale=0。
  - `node --test "test/项目管理/shared/**/*.test.ts"`：177 tests / 172 pass / 0 fail / 5 skipped，exit 0。
  - `npm run typecheck`：exit 0。
- 哈希（`hashes.txt` 已更新，最终值见 §8）：`zh-CN.ts` blob `b38c7664…` / sha256 `02fd1945…`；`en-US.ts` blob `15cfccc7…` / sha256 `9522a65d…`；`i18n.test.ts` 与 `i18n-guard-allowlist.ts` 的最终哈希见 §8。
- 待 B3 接线清单（最终）：`main.session.dispatchModelNote`（`session.ts:3176`）、`main.interface.teamPlanMissingBoundHint`（`interface.ts:4582`）、`targetLabel` 改用既有 `ui.role.governance.crew.name`/`steward.name`（`interface.ts:4364`，无需新 key）。

## 8. B4 完成后 allowlist 再收紧（协调方 I9 收口项）

- 日期：2026-10-23（同批收口）
- 背景：B4 完成共享元数据 key 化；`app/desktop/runtime-config.ts` 的 `definition?.label ?? "演示"` 中文兜底已消除（当前扫描零 Han），原 allowlist 条目变陈旧，guard 报失败。
- 实际基线：B4 侧同时已将 `src/common/shared/runtime-settings.ts`（B4 后零 Han）从清单移除，实物为 **19** 条（非协调方预期的 20）。本批在实物基础上移除 `app/desktop/runtime-config.ts` → **18 条**。以实际扫描为准。
- 结果：`scanned=107 allowlisted=18 allowlisted-with-han=18 stale=0 violations=0`；allowlist 无其他陈旧条目，无 guard 外违规。
- 验证（证据日志已刷新）：
  - `node --test test/项目管理/shared/i18n-guard.test.ts`：6/6 pass，exit 0。
  - `node --test "test/项目管理/shared/**/*.test.ts"`：**181 tests / 176 pass / 0 fail / 5 skipped**，exit 0。
  - `node --test test/项目管理/shared/i18n.test.ts`：34/34 pass，exit 0。
  - `npm run typecheck`：exit 0。
- 说明：`i18n.test.ts` 在收口期间被 B4/PM 侧同步编辑（最终哈希变更为 `bca8e6ad…`）；本批断言与计数（`main` 480 / 总数 1236 / B3 增补 23）保持不变且全部通过。
- 最终哈希（`hashes.txt`）：`zh-CN.ts` blob `b38c7664…` / sha256 `02fd1945…`；`en-US.ts` blob `15cfccc7…` / sha256 `9522a65d…`；`i18n.test.ts` blob `bca8e6ad…` / sha256 `af234a1b…`；`i18n-guard-allowlist.ts` blob `58f414f6…` / sha256 `29541e89…`。
