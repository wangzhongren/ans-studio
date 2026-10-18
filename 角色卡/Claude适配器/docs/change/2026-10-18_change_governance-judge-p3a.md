# 2026-10-18 治理卡判断（P3a·Claude）：judge allowlist 并集 + 治理 judge 三件套

**依据**：项目管理评审 [2026-10-18_design_judge-governance-cards-review.md](../../../项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md) §六（运行时核心契约）、§十二（兼容）、§十五 P3a（适配器波次）；前置 P1 已冻结 `buildGovernanceJudgeTools` / `ALL_JUDGE_TOOL_NAMES` / `GovernedToolsOptions.governanceJudge` 与 `judgeMode` 复用。

**范围**：仅本角色边界内文件——`src/common/claude-adapter/judge.ts`、`src/provider/claude/session.ts`、`test/claude-adapter/session.test.ts`、本角色文档。未改运行时核心、pi/codex 适配器、桌面、编排；未读 `.env`、未跑真实模型/凭据/网络；未 git 提交。

## 一、实现

### 1. `src/common/claude-adapter/judge.ts`

- allowlist 单一来源改为运行时核心 `ALL_JUDGE_TOOL_NAMES` 并集（评审 §6.2/R17），导出 `CLAUDE_JUDGE_TOOL_NAMES`；适配器不再维护第二份名单。
- `assertClaudeJudgeToolSet` 从「恰三只且都在 shell 集合」改为「恰为两个冻结三件套之一」：
  - shell：`judge_read_file` / `judge_list_dir` / `report_shell_judgement`；
  - 治理：`judge_read_file` / `judge_list_dir` / `report_governance_judgement`。
  - 混合两套 report、缺项、多项、重复项（集合大小不等）一律在 SDK 加载前抛错；工厂 / `bindRole` / 新建引擎前三处校验不变。
- 新增 `claudeJudgeReportToolName(tools)`：从已校验三件套派生结论工具名。
- `claudeJudgeSystemPromptLine(roleId, reportToolName = report_shell_judgement)`：shell 调用文案逐字不变；治理会话只提示治理 report。

### 2. `src/provider/claude/session.ts`

- PreToolUse allowlist 使用并集（`CLAUDE_JUDGE_TOOL_NAMES`），放行仍要求名字确已注册在 `options.tools` 中——并集只用于 allowlist，不用于装配。
- `judgeMode` 下 `options.tools` 被原样注册：注入 `governanceJudge` 时即治理三件套；不注册写/编辑/shell/客户交互/回交/派发/外来 MCP。
- 系统提示与 PreToolUse deny 文案按实际三件套生成；shell 会话输出与改动前逐字一致。
- 以下既有收口对两类判断会话一视同仁、未改动：`tools:[]`、`strictMcpConfig` + `mcpServers` 仅 `ans`、`installedMcpServers` 强制置空、`disallowedTools` 原生工具名单、忽略 `ANS_CLAUDE_WEB_SEARCH`、不持久化/临时配置根清理、只读工具注解。
- 普通角色会话路径（`judgeMode` 缺席）逐字不变。

## 二、测试

`test/claude-adapter/session.test.ts` 新增 2 例：

1. **治理 judge 工具面**：`buildGovernanceJudgeTools` 恰三项；`allowedTools` 只有治理三只；`tools:[]`、`disallowedTools` 含原生/网络工具、MCP 仅 `ans`、`persistSession:false`、系统提示含 `report_governance_judgement` 不含 shell report；`report_governance_judgement` 原样回调（含 `pathDecisions` 等额外参数）；`report_shell_judgement` 与写/shell/交互/回交/派发工具结构性不可用；PreToolUse 对非白名单（含 shell report、外来 MCP、内置原生/网络）一律 deny；`.env` 读取被拒且不回显；即使 `ANS_CLAUDE_WEB_SEARCH=1` 与误传 `installedMcpServers` 也不生效；临时配置根 dispose 清理。
2. **三件套校验**：shell 与治理两套均可通过工厂与 `bindRole`（零 SDK 加载）；混合 report、重复项、缺项、多项（含四只并集）均抛错且 `loadCount === 0`。

既有用例保持：shell judge 工具面恰三项、误配在 SDK 加载前拒绝、判断 abort 生命周期、普通模式无 `disallowedTools` 且联网搜索照旧。

## 三、证据（本机 2026-10-18）

- `node --test "test/claude-adapter/*.test.ts"`：**55 例 / 54 过 / 1 红**；唯一红＝既有 Windows symlink EPERM（`native symlink and storage runtime mismatch` setup 阶段，环境权限所致，非本批）。
- `npx tsc --noEmit`：退出 0。
- 全量三层 glob `node --test "test/**/*.test.ts"`：**2806 计 / 2784 过 / 19 红 / 3 skip**。19 红中仅 1 条属本角色套件且为上述既有 symlink EPERM；其余 18 条均在他域——Windows symlink EPERM 6（runtime-core tools/session-store、Pi、Codex）、runtime-core `.ans` 读取口径旧钉 2、桌面/renderer 8、编排 1、vendor pin 1；本批改动文件零新增红。
- 未跑真实模型/凭据/网络、未读 `.env`、未 git 提交。
