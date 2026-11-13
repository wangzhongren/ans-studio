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
//   · 2026-11-05（trunk-amendment-model C3b / T1 返工 D3）：新增 `app/desktop/version-change.ts`
//     （D1 版本变更接线。中文只出现在：① import specifier 中既有中文目录名 `编排`/`门禁引擎`
//     的机器路径；② 三提交能力 submitVersionChange/submitRefactor/requestStableWrite 的
//     tool-result `message`——交角色 agent 的工具回执，非客户 UI 文案；用户可见文本只经
//     `mainT`/C3 key。classification §4，非用户可见 UI）——当前保留 **23** 条。
//   · 2026-11-10（T3 两条固定工作流路径 B5.1；G-B5-4 修复）：新增 `app/desktop/workflow-git.ts`、
//     `app/desktop/workflow.ts`（T3 B1/B3/B4.2 桌面固定路径新增文件。中文只出现在：① import
//     specifier 中既有中文目录名 `编排` 的机器路径；② 应用失败回执/系统行（交运营/幕僚 agent 的
//     tool-result/交付备注）与诊断 detail（含 git stderr 原文）——classification §4，非客户门/卡
//     UI 文案）——当前保留 **25** 条。
//   · 2026-11-13（session.ts 重构 B7 收尾；B7 树 i18n 守卫复跑）：`app/desktop/session.ts` 拆分后，
//     `app/desktop/session/**` 下 B1–B6 已积累 25 个、B7 新增 6 个（index.ts + lifecycle/*）含中文
//     文件；守卫为文件级判定，按拆分前 session.ts 文件级覆盖口径逐文件补登 31 条（机器路径 +
//     与 B0 session.ts 逐字同源的 agent-facing/协议/诊断文本），不新增用户可见文案覆盖；其中
//     `tasks.ts:832-838` 预存应用自有升级卡中文（B0 已被 session.ts 条目掩盖，非 B7 新增）随
//     tasks.ts 条目继续覆盖，待 i18n key 化——当前保留 **56** 条。
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
  // 演示运行时 agent-facing `systemPrompt`（demo 演示提示词，不面向客户）——classification §4。
  "app/desktop/chat-adapter.ts",
  // `mechanical-rejection` 的技能路径「编排」出现在 import specifier（机器路径，非用户可见 UI）；
  // 展示文本已 key 化——classification §4。
  "app/desktop/customer-input.ts",
  // 输入解析关键字「撤销」，非用户可见 UI；展示文案已 key 化——classification §4。
  "app/desktop/directive-input.ts",
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
  // B7 收尾（2026-11-13，session.ts 重构 B1–B7）：以下 `app/desktop/session/**` 31 个文件为从
  // `app/desktop/session.ts` 逐字搬移/拆分出的模块（B1–B6 25 个，B7 新增 6 个：index.ts 与
  // lifecycle/{host,open-context,open,ops,send}.ts）。中文只出现在两类非客户 UI 文本：
  // ① import/export specifier 中既有中文目录名 `编排`/`门禁引擎` 的机器路径（本批 94 个命中）；
  // ② 与 B0 allowlisted `session.ts` 逐字同源的 agent-facing 工具回执、`[系统·…]` 协议行、
  //    role_status/session_tail/诊断文本（classification §4）。用户可见文案零新增；唯一预存例外
  //    在 tasks.ts 条目显式披露。逐文件机器路径锚点见各行注释。
  // 路径 `编排` import specifier（:15–:17）——机器路径，非用户可见 UI；classification §4。
  "app/desktop/session/card-gateway.ts",
  // 路径 `编排`/`门禁引擎`（:23–:33）；另含验收不可用原因/缺失项标签（:85、:216–:264，
  // agent-facing judge 上下文与工具回执，B0 session.ts 逐字同源）——classification §4。
  "app/desktop/session/cards/acceptance-facts.ts",
  // 路径 `编排`（:30–:49）；另含申请系统行/机械拒绝 action/建卡校验等 agent-facing 回执
  // （B0 session.ts 逐字同源；用户可见文案已 key 化）——classification §4。
  "app/desktop/session/cards/cards.ts",
  // 路径 `编排`（:20–:37；:35 为多行 import 续行）；另含 `[系统·版本决策]`/`[系统·申请]`/
  // `[系统·审批]` 协议行与决策回执（B0 同源）；卡标题经 `mainT("ui.versionDecision.title")`
  // 已 key 化——classification §4。
  "app/desktop/session/cards/version-decisions.ts",
  // 路径 `编排` import specifier（:31）——机器路径；classification §4。
  "app/desktop/session/contracts/deps.ts",
  // 路径 `编排`（:10–:11）——机器路径；classification §4。
  "app/desktop/session/contracts/ports.ts",
  // 路径 `编排`（:9）——机器路径；classification §4。
  "app/desktop/session/contracts/session-types.ts",
  // 路径 `编排`（:7–:8）——机器路径；classification §4。
  "app/desktop/session/contracts/tasks.ts",
  // 路径 `编排`（:29–:33）；另含 `(投递机)` 机器标识与投递失败 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/delivery/queue.ts",
  // 路径 `编排`（:22）——机器路径；classification §4。
  "app/desktop/session/delivery/store.ts",
  // 路径 `编排`（:28、:33）；另含 role_status/session_tail/看护诊断工具输出（agent-facing，
  // 与 B0 `session.ts` 条目已覆盖同类）——classification §4。
  "app/desktop/session/diagnostics.ts",
  // 路径 `编排`（:26–:31）；另含派发/续接/重派 agent 工具回执与账本系统行（B0 同源）——classification §4。
  "app/desktop/session/dispatch.ts",
  // 路径 `编排`（:17–:24）；另含只读速查/证据核对工具输出（agent-facing，B0 同源）——classification §4。
  "app/desktop/session/evidence.ts",
  // 路径 `编排`（:19–:34）；另含回交/团队计划/任命卡校验 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/fixed-workflow/cards.ts",
  // 路径 `编排`（:8–:12）；另含诊断记录提示（B0 同源）——classification §4。
  "app/desktop/session/fixed-workflow/panel.ts",
  // 路径 `编排`（:19、:28）；另含发布/合并卡 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/fixed-workflow/release-merge.ts",
  // 路径 `编排`（:23–:37，含多行 import 续行）；另含生产派发/阶段路由 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/fixed-workflow/route.ts",
  // 无中文 import 路径；仅 Git 工具不可用/run-stop 栅栏的 agent-facing 回执 message（:60、:66、:69；
  // :69 逐字同源 B0 session.ts:3871，仅 receiver 由 `this.` 改为 `ctx.`）——classification §4。
  "app/desktop/session/git-ports.ts",
  // 路径 `编排`（:24–:26）；另含回交/收口 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/handback.ts",
  // B7 新增 facade barrel：路径 `编排`（:18–:36，含多行 import 续行）；无其他中文——classification §4。
  "app/desktop/session/index.ts",
  // B7 新增：路径 `编排`（:9、:10、:86；:32 为多行 import 续行）；无其他中文——classification §4。
  "app/desktop/session/lifecycle/host.ts",
  // B7 新增：路径 `编排` import specifier（:50）——机器路径；classification §4。
  "app/desktop/session/lifecycle/open-context.ts",
  // B7 新增：路径 `编排`（:32、:75；:54 为多行 import 续行）；另含会话开启/投递 agent 回执
  // （B0 session.ts 同源）——classification §4。
  "app/desktop/session/lifecycle/open.ts",
  // B7 新增：路径 `编排`（:15）；另含库存/会话处置 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/lifecycle/ops.ts",
  // B7 新增：路径 `编排`（:12）；另含投递/回交 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/lifecycle/send.ts",
  // 路径 `编排`（:19）——机器路径；classification §4。
  "app/desktop/session/persistence.ts",
  // 无中文 import 路径；仅 run-change 选择/停止计划的 agent-facing 工具回执（B0 session.ts 逐字同源）
  // ——classification §4。
  "app/desktop/session/run-change.ts",
  // 路径 `编排`（:24）；另含 `[系统·安装]` 协议前缀与安装/卸载 agent 回执（B0 同源）——classification §4。
  "app/desktop/session/session-env.ts",
  // 路径 `编排`（:12–:13）；另含任务事件摘要 `应用观察到失败`（账本/诊断，B0 同源）——classification §4。
  "app/desktop/session/shared/tasks-store.ts",
  // 路径 `编排`（:9）——机器路径；classification §4。
  "app/desktop/session/shared/text.ts",
  // 路径 `编排`（:23–:29）；另含任务账本/重派/终止/升级 agent 回执（B0 同源）。**披露**：该文件
  // 同时覆盖 `:832-838` 预存应用自有「任务升级」客户 decision 卡中文（title/question/options.label，
  // 经 `session:operator-request` 原样呈客户；原 `app/desktop/session.ts` 文件级条目已整体掩盖，
  // **非 B7 新增**），本次按拆分前覆盖口径继续覆盖，待 i18n key 化——显式登记，非 classification §4
  // 的常规豁免。
  "app/desktop/session/tasks.ts",
  // D1 版本变更/冻结/stable-write/重构桌面接线。中文只出现在两类机器文本，均非客户 UI 文案：
  // ① import specifier 中既有中文目录名的机器路径——`编排`（`../../src/common/编排/`，
  //    锚点 :25:51/:26:54）与 `门禁引擎`（`../../src/common/门禁引擎/`，:31:26/:32:67）；
  // ② 三提交能力（submitVersionChange/submitRefactor/requestStableWrite）的 tool-result `message`
  //    （:1166/:1208/:1221/:1251/:1267/:1277/:1287 等）——交角色 agent 的工具回执，不是客户可见
  //    UI 文案（同 `requirement-change.ts` 先例）；用户可见文本只经共享 i18n `mainT`/C3 key——
  //    classification §4。D3/T1 返工锚点：`version-change.ts:25:51 编排`。
  "app/desktop/version-change.ts",
  // `view_image` 桌面投递能力：下一轮用户提示的 agent-facing 图片提示文本（`buildViewImagePrompt`，
  // 发给模型，不是 UI 文案）与 `ViewImageFn` 投递失败/非法载荷回执（tool output，交工具层转达模型）；
  // 用户可见排队/失败回执与附件标签已入共享目录（`main.viewImage.*` / `ui.viewImage.attachmentLabel`，
  // 2026-10-26）——classification §4。
  "app/desktop/view-image.ts",
  // 技能路径「编排」+ `[watchdog] tick 失败…` stderr 日志行（日志不翻译）——classification §4。
  "app/desktop/watchdog.ts",
  // T3「两条固定工作流路径」B1/B3/B4.2 桌面固定路径新增文件（B5.1/G-B5-4 补登记，2026-11-10）。
  // 中文只出现在两类机器文本，均非客户门/卡 UI 文案：
  // ① import specifier 中既有中文目录名的机器路径——`编排`（`../../src/common/编排/`：
  //    workflow-git.ts :32:26/:39:26/:45:86；workflow.ts :20:49/:21:57/:22:54/:27:26）；
  // ② 应用失败回执/系统行与诊断 detail——`FixedPathStartOutcome.message`（workflow.ts:193）、
  //    `WorkflowGitFailure.message` / `WorkflowServiceFailure.message` / `ShellTaskGitCommandFacts.error`
  //    （git init/.gitignore/任务分支/merge-main（含 stderr 原文）/任务级 add·commit 运输防御），
  //    作为 tool-result/交付备注交运营/幕僚 agent，非客户可见 UI；客户卡文案由 `customer-input.ts`
  //    的卡构造生成（该文件已在本清单）——classification §4。
  "app/desktop/workflow-git.ts",
  "app/desktop/workflow.ts",
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
