// test/项目管理/shared/i18n-guard-allowlist.ts
// 项目管理：i18n 硬编码守卫的 allowlist（按**文件**列出尚未迁移的含中文源码）。
//
// 生成与收紧历史：
//   · 2026-10-23 B0 基线：`i18n-guard-scanner.ts` 的 `collectGuardFiles` + `findHan` 扫描全部
//     目标，收集「去除注释后仍含 Han 字符」的文件；共 103 个文件，其中 62 个命中。
//   · 2026-10-23 允许清单收紧（B1/B2/B3 消费方迁移收尾后）：重跑同一扫描器，当前 107 个文件，
//     原 62 条中 **42 条已迁移为零 Han（陈旧）并移除**，仅保留 20 条仍含中文的文件。
//     移除清单见 `角色卡/项目管理/docs/change/2026-10-23_change_i18n-allowlist-tighten.md`。
//   · 2026-10-23 B4 完成后：`src/common/shared/runtime-settings.ts`（元数据已 key 化）与
//     `app/desktop/runtime-config.ts`（`"演示"` 兜底已改用语言中性标签）均已零 Han，从清单移除；
//     当前保留 **18** 条仍含中文的文件。
//   · 2026-10-26：新增 `app/desktop/boundary-change.ts`（治理关键路径机器常量、agent-facing 校验
//     回执/任务正文、AI 门禁 judge prompt；classification §4，非用户可见 UI）——保留 **20** 条。
//   · 2026-10-26：新增 `app/desktop/view-image.ts`（下一轮用户提示的 agent-facing 图片提示文本、
//     `ViewImageFn` 投递失败回执；用户可见回执/附件标签已入共享目录 `main.viewImage.*` /
//     `ui.viewImage.attachmentLabel`；classification §4，非用户可见 UI）——保留 **21** 条。
//   · 2026-10-26：新增 `app/desktop/requirement-change.ts`（需求变更申请的载荷二次校验 detail、
//     票据 error/主理任务正文；用户可见回执/系统行已入共享目录 `main.requirementChange.*`；
//     classification §4，非用户可见 UI）——当前保留 **22** 条。
// 规则：
//   · **新增条目必须写明理由**；只允许「明确不翻译」的文件（classification §4/§5）。
//   · B1–B4 每完成一批就从本清单移除对应文件；守卫测试会拒绝
//     「allowlist 条目已无中文」（陈旧）与「allowlist 之外出现中文」（回潮）。
//   · 文件内中文只出现在注释中的，不得列入本清单（扫描器已去注释；`packaged-smoke.ts`
//     因中文注释位于 `executeJavaScript` 模板字符串内，属扫描器保守超集，仍保留）。
//   · `src/common/shared/runtime-shared.ts` 不在 `GUARD_TARGETS`（扫描目标只含
//     `runtime-settings.ts`），其显示名已按 2026-10-23 B4 改为语言中性值/i18n key；
//     `runtime-settings.ts` 在 B4 完成 key 化后已无展示中文字面量，已从本清单移除。
//
// 本文件是测试夹具，不是产品代码；路径相对仓库根、POSIX 分隔符、按字典序排列。

export const I18N_GUARD_ALLOWLIST: readonly string[] = [
  // `request_boundary_change` 桌面纯逻辑：治理关键路径机器常量（`角色卡`、`docs/**`）、
  // agent-facing 校验失败回执（tool output，交治理 agent，不直接作为 UI 文案）、发给 Crew 的
  // 边界变更任务正文，以及 AI 门禁判定请求卡（title/question/options/preview 仅进 judge prompt，
  // 不是客户卡）——均为 classification §4 机器/agent-facing 文本，非用户可见 UI；
  // 用户可见系统行由调用方按 i18n key 生成（2026-10-26 分类核对）。
  "app/desktop/boundary-change.ts",
  // 演示运行时 agent-facing `systemPrompt`（demo 演示提示词，不面向客户）——classification §4。
  "app/desktop/chat-adapter.ts",
  // 发给 Convener/Crew/Lead 的任务正文/提示词（build*TaskMessage）、flow 收口原因常量
  // （持久化机器状态与解析）、正则与技能路径「编排」——classification §4。
  "app/desktop/governance-advance.ts",
  // 角色卡/团队计划 schema 词汇（组别/写集/依赖…）、`new/changed/existing` 输入别名、
  // 写卡校验正则、发给 Convener 的任务正文（`userVisibleIssue` 已走 mainT）——classification §4/§6。
  // TODO(B3/PM)：`{label}`（`Crew / 组队`、`Steward / 统筹`）仍是中文参数，被拼进用户可见的
  // `main.interface.openSessionFailed`/`sendTaskFailed`；待 B3 复用 `ui.role.governance.*.name`。
  // `{bound}` 已补 key `main.interface.teamPlanMissingBoundHint`（B3 接线待做），见变更记录 §5/§7。
  "app/desktop/interface.ts",
  // `read-denied` reason 的**输入解析标记**（`判断读取被拒：`/`，已转手动确认。`，机器匹配）；
  // 展示文本已 key 化（`main.judgeReason.*`）——classification §4。
  "app/desktop/judge-reason.ts",
  // agent-facing deny reason（PM 分类 #12）、审核错误文本分类正则、技能路径「编排」。
  "app/desktop/operator-channel.ts",
  // 中文只出现在 `executeJavaScript` 模板字符串内的注释（扫描器保守超集），无用户可见文本——classification §5。
  "app/desktop/packaged-smoke.ts",
  // `source:` 授权来源审计元数据（机器/审计，不展示给客户）——classification §4。
  "app/desktop/project.ts",
  // `request_requirement_change` 桌面纯逻辑：`assessRequirementChangeRequest` 的结构校验 detail
  // （作为 `{detail}` 参数拼进工具回执，或写入应用自有票据 `error`——tool output/审计，交治理 agent，
  // 不直接作为客户 UI 文案）、`buildRequirementChangeLeadTaskText` 发给 Lead / 主理的任务正文、
  // 票据状态/路径机器常量；均为 classification §4 agent-facing/机器文本。用户可见回执与系统行由
  // `interface.ts` 按共享 i18n `main.requirementChange.*` 生成（2026-10-26 分类核对）。
  "app/desktop/requirement-change.ts",
  // 未注入 `t` 时的逐字兜底常量（真实路径已用 `main.runtimeResolution.noRuntime`）；持久化错误文本
  // 仅进诊断日志（不翻译）——B3 记录 §7。
  "app/desktop/runtime-resolution.ts",
  // legacy 历史文本解析正则（`read_file 失败：`/`run_shell 已执行：`），机器匹配——classification §4。
  "app/desktop/session-history.ts",
  // `[系统·…]` 协议标记与 `(投递机)` 机器标识、发给 agent 的治理反馈/role_status/session_tail
  // 工具输出、诊断兜底、agent-facing `{action}`（PM 分类 #7）、账本 `[协调]` 前缀；
  // 用户可见文本已 key 化——classification §4。
  "app/desktop/session.ts",
  // `view_image` 桌面投递能力：下一轮用户提示的 agent-facing 图片提示文本（`buildViewImagePrompt`，
  // 发给模型，不是 UI 文案）与 `ViewImageFn` 投递失败/非法载荷回执（tool output，交工具层转达模型）；
  // 用户可见排队/失败回执与附件标签已入共享目录（`main.viewImage.*` / `ui.viewImage.attachmentLabel`，
  // 2026-10-26）——classification §4。
  "app/desktop/view-image.ts",
  // 技能路径「编排」+ `[watchdog] tick 失败…` stderr 日志行（日志不翻译）——classification §4。
  "app/desktop/watchdog.ts",
  // 技能路径「编排」出现在 import specifier（机器路径）——classification §4。写入预授权系统行/拒绝
  // 原因的展示文案已入共享目录（`main.customerInput.writePreauthorization.*`，2026-10-25），
  // 桌面角色接线前本文件仍含中文；接线后仅剩机器路径，继续保留在清单。
  "app/desktop/write-preauthorization.ts",
  // 历史文本解析正则、系统行/【系统通知】/[派发]/[回交] 协议标记、`USER_ECHO_PREFIX`——
  // classification §3/§6（渲染层只呈现，主进程负责翻译）。
  "app/renderer/src/chat/events.ts",
  // `contextText` 的 `恢复失败：` legacy 文本解析正则（机器判定，非 UI 文案）。
  "app/renderer/src/shell/ChatHeader.tsx",
  // `groupDuty === "组长"` 为角色卡数据值比较（schema 词汇），非 UI 文案。
  "app/renderer/src/shell/Sidebar.tsx",
  // e2e 演示动作文案（测试驱动基础设施，非正常用户可见 UI）——classification §5。
  "app/renderer/src/test-driver.ts",
  // CLI/装配入口，本轮不纳入（B5 第二阶段）——classification §5。
  "src/index.ts",
  // CLI 命令输出，本轮不翻译——classification §5。
  "src/interface/cli/govern.ts",
  "src/interface/cli/run.ts",
];
