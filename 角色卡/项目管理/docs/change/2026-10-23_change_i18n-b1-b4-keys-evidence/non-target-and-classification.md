# i18n B1–B4 key 提取分类与非目标清单

- 日期：2026-10-23
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 范围：`test/项目管理/shared/i18n-guard-allowlist.ts` 的 62 个文件（B0 基线）
- 性质：**只建立共享 key 契约**；消费方（渲染层/主进程）迁移在 B1–B4 后续批次，本批不改任何消费方
- 相关：[变更记录](../2026-10-23_change_i18n-b1-b4-keys.md) · [key 清单](key-inventory.tsv) · [逐字映射](zh-verbatim-mapping.tsv)

## 1. 文件分区总览

| 分区 | 文件数 | 目标 | key 前缀 |
| --- | --- | --- | --- |
| B1 渲染层外壳 | 28 | 是 | `ui.*`（不含 B2 组件） |
| B2 渲染层聊天/面板 | 11 | 是 | `ui.*`（chatRow/chatStore/chatStream/document/events/judge/markdown/operator/reasoning/reportView/tool） |
| B3 主进程用户可见文本 | 17 | 是 | `main.*` |
| B4 共享设置元数据 | 1 | 是（仅加 key，不改形状） | `shared.runtimeSettings.*` |
| 测试/诊断基础设施 | 2 | **否** | 无 |
| CLI（本轮不翻译） | 3 | **否** | 无 |
| 合计 | 62 | — | — |

分区 key 数（新增，不含 B0 13 个）：**B1 = 407，B2 = 269，B3 = 452，B4/shared = 62；合计 1190**。目录总 key 数 1203（含 B0 13）。

## 2. B1 文件（28，`ui.*`）

`app/renderer/src/App.tsx`、`main.tsx`、`shell/TitleBar.tsx`、`shell/Sidebar.tsx`、`shell/ChatHeader.tsx`、`shell/Composer.tsx`、`shell/ConfirmCard.tsx`、`shell/Drawer.tsx`、`shell/EngineSelect.tsx`、`shell/SettingsPanel.tsx`、`shell/GovernancePanel.tsx`、`shell/ReportCard.tsx`、`shell/DocumentView.tsx`、`shell/ProfilePanel.tsx`、`shell/QueuePanel.tsx`、`shell/QueueSubview.tsx`、`shell/WorkOverview.tsx`、`chat/status.ts`、`chat/runtime-config.ts`、`chat/role-view.ts`、`chat/governance-view.ts`、`chat/work-view.ts`、`chat/confirm-logic.ts`、`stores/confirm-store.ts`、`stores/settings-store.ts`、`stores/drawer-store.ts`、`stores/governance-store.ts`、`stores/report-store.ts`。

- 已 key 化：静态 chrome（按钮/tab/标题/空态/占位符/aria/title）、状态徽标、保存状态、错误前缀、报告/文档/角色资料 UI 文案。
- 原样保留（不翻译）：注释；`roleId`/`cardKind`/`governanceFunction`/flow step id 等机器值；`GOVERNANCE` 映射的 `name`/`power` 之外的机器键；测试夹具文案；`stores/ui-store.ts` 等无中文文件不涉及。
- 说明：`shell/SettingsPanel.tsx` 中 `status.text.startsWith("已保存到 .env")` 与 `chat/governance-view.ts` 中 `msg.indexOf("未写入任何文件")` 是**文本判定**；迁移时必须改为结构化状态，不能依赖翻译后的文本（见 §6）。

## 3. B2 文件（11，`ui.*`）

`app/renderer/src/chat/ChatRow.tsx`、`ChatStream.tsx`、`chat-store.ts`、`document-view.ts`、`events.ts`、`judge.ts`、`markdown.ts`、`operator-view.ts`、`reasoning.ts`、`report-view.ts`、`tool-summary.ts`。

- 已 key 化：行标签、空态、工具/推理摘要、报告/文档/操作者提示、系统通知标签、判断代批行、错误提示。
- 原样保留（不翻译）：
  - `events.ts` 的**历史文本解析正则**（`/^read_file 失败：…/`、`/^run_shell 已执行：…/`、`/^\[系统·…\]/`、`/^【系统通知…】/`、`/^\[派发\]/`、`/^\[回交\]/`）与 `USER_ECHO_PREFIX = "用户指令："`：这些是**机器匹配**，不是 UI 文案；
  - `events.ts` 的系统行前缀 `[系统·…]`、`【系统通知·…】`、`[派发]`、`[回交]` 是协议标记，保持原样；
  - `chat-store.ts` 的 `contextText.indexOf("可读历史保留")` 是文本判定（迁移时改结构化状态）；
  - 模型/工具输出、历史原文、`flowId` 等机器值。
- 注意：`ui.chatStream.empty.*`、`ui.chatStore.empty*` 等空态 key 与主进程 `main.*` 文案分离；主进程生成的系统行仍由主进程翻译（B3），渲染层只呈现。

## 4. B3 文件（17，`main.*`）

`app/desktop/chat-adapter.ts`、`composer-images.ts`、`confirm-card.ts`、`customer-input.ts`、`diagnostics.ts`、`governance-advance.ts`、`interface.ts`、`judge-reason.ts`、`operator-channel.ts`、`project.ts`、`recovery-channel.ts`、`runtime-config.ts`、`runtime-history.ts`、`runtime-resolution.ts`、`session-history.ts`、`session.ts`、`watchdog.ts`。

- 已 key 化（应用生成、最终显示给用户）：派发未受理/去重/投递失败系统行、写卡/验收反馈、会话历史错误、设置与图片错误、对话框/窗口标题、启动错误、看护告警、恢复回执、确认卡失效提示、判断代批原因、shell 审核块、恢复页（diagnostics.ts）。
- **明确不翻译（保持原样）**：
  - **发给 agent 的任务文案/提示词**：`governance-advance.ts` 的 `buildAcceptanceTaskMessage`、`buildNominationTaskMessage`、`buildRoleCardTaskMessage`、`buildReadinessTaskMessage` 等；`session.ts` 的治理反馈提示（“请用 1-3 句话向客户汇总…”“不要逐字转述内部报告…”）、`role_status`/`session_tail` 工具输出、能力安装/卸载中面向角色的说明；`chat-adapter.ts` 的 demo `systemPrompt`。
  - **外部错误原文**：Provider/SDK/文件系统 `err.message` 作为 `{detail}` 参数保留；不机翻。
  - **诊断/日志码**：`session.open.failed`、`session.rebuild.failed`、`governance.feedback.*`、`acceptance.flow.incomplete`、`shell-confirm.cancelled`、`[watchdog] tick 失败…`（stderr 日志）等；`main.watchdog.tickFailed` 因属日志行**未进目录**（已从初稿移除）。
  - **机器标识**：`[系统·安装]`、`[系统·恢复]`、`【系统通知】`、`[派发]`、`[回交]`、`stepId`、`cardKind`、`GovernanceFunction`、`flowId`、`IPC` 通道名、路径、环境变量名。
  - **历史文本解析/判定**：`runtime-history.ts`/`session-history.ts` 的 legacy 正则、`project.ts` 的 `source:` 授权来源元数据（机器/审计元数据）、`governance-advance.ts` 的流程收口原因片段（会被持久化/比较）。
  - **角色卡/团队计划 schema 词汇**：`interface.ts` 的「组别/工作立场/能力描述/…」章节名、表列名、`new/changed/existing` 解析别名（新增/修改/既有）——属角色卡结构词汇与输入别名，不是 UI chrome；作为数据插入错误消息，保持原样。
  - `app/desktop/diagnostics.ts` 的恢复页 HTML **是用户可见文本**，已 key 化（`main.common.recoveryPage*`、`main.common.reloadInterface`）；不因“诊断基础设施”整体豁免。

## 5. 完全非目标文件（5）

| 文件 | 理由 |
| --- | --- |
| `app/renderer/src/test-driver.ts` | 测试驱动基础设施；中文只用于 e2e 演示动作（“构建项目（演示数据）”等），不是正常用户可见 UI；为通过守卫而翻译会污染测试语义 |
| `app/desktop/packaged-smoke.ts` | 中文只出现在 `executeJavaScript` 模板字符串内的注释（扫描器保守超集命中）；无用户可见文本 |
| `src/index.ts` | CLI/装配入口；CLI 本轮不纳入（方案 Q3 A / B5 第二阶段） |
| `src/interface/cli/govern.ts` | CLI 命令输出；本轮不翻译 |
| `src/interface/cli/run.ts` | CLI 命令输出；本轮不翻译 |

## 6. 迁移期文本依赖（只记录，不在本批修改）

以下代码以**文本内容**做判定/展示；B1–B4 迁移时必须改为结构化状态或显式映射，否则切换语言会破坏行为：

1. `app/renderer/src/shell/SettingsPanel.tsx`：`status.text.startsWith("已保存到 .env")`。
2. `app/renderer/src/chat/governance-view.ts`：`msg.indexOf("未写入任何文件")`（失败视图去重）。
3. `app/renderer/src/chat/chat-store.ts`：`contextText.indexOf("可读历史保留")`。
4. `app/renderer/src/chat/events.ts`：历史文本前缀/正则（见 §3）。
5. `app/desktop/governance-advance.ts`：`FLOW_COMPLETION_TERMINAL_*` 常量与流程 YAML 原因前缀匹配（持久化机器状态，不翻译）。
6. `app/desktop/session.ts`：`[系统·安装]`/`[系统·恢复]` 前缀与系统行标记由渲染层解析，保持原样。
7. `app/desktop/interface.ts`：团队计划/角色卡校验的章节名与表列名是角色卡结构词汇，本次作为数据；若后续要英文化，需单独设计 schema 词汇表。

## 7. 证据方法

- **key 清单**：`key-inventory.tsv`（partition/key/zh/en，1203 行）。
- **zh 逐字映射**：`zh-verbatim-mapping.tsv` 对每个 key 的 zh 值在 62 个源文件中的出现做匹配：
  - `exact`：完整字符串字面量出现在源码；
  - `composed-all-chunks` / `composed-partial`：按 `{param}` 切分后，静态片段可在源码中找到（代码用拼接/多段生成）；
  - `no-literal-trace`：12 个，均为源码用多段拼接或短片段（≤1 字符）组合的模板，逐条列在 `zh-verbatim-summary.txt`；
  - `B0-out-of-scope`：13 个 B0 key（窗口标题等）不在 allowlist 扫描范围。
- **原始输出**：`test-shared.log`、`typecheck.log`、`guard.log`。
- **哈希**：`hashes.txt`。
