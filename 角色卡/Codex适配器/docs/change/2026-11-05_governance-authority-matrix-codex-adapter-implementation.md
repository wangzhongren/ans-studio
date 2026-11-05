---
id: governance-authority-matrix-codex-adapter-implementation
type: change
title: Codex 适配器：治理权力矩阵幕僚提示块拼接实施记录（C4c）
created: "2026-11-05"
updated: "2026-11-05"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-governed-session, governance-authority-matrix-codex-adapter]
---

# Codex 适配器：治理权力矩阵幕僚提示块拼接实施记录（C4c）

- 任务 / 角色 / 节点：`2026-11-05-governance-authority-matrix`；Codex适配器（独立固定上下文）；**C4c**（依赖 C2 运行时契约冻结）。
- 实现依据：提案 `角色卡/Codex适配器/docs/change/2026-11-05_governance-authority-matrix-codex-adapter.md`（PM 裁决 D-1..D-8 采纳）；唯一实施与验收基线 P1.1（1056 行 / `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6`）。
- 候选快照：`839b922f…`（统筹/E2 提供的候选标识；本记录不另行定义候选）。
- 状态：**implemented-unverified（已实施待验证，未验收）**。本记录不是 `verified`、不是验收结论；不 commit/push。
- 文档收口：本记录与提案状态、`api-spec.md` 的更新属文档-only 收口，不改代码/测试。

## 1. 以前 / 现在（触发场景）

**触发场景：** 桌面或 CLI 打开 trio 治理模型下的幕僚（chief）角色会话。

- **以前：** `composeContext` 的系统提示只有「角色卡 → 固定角色/项目行 → 工具说明行 → 角色写入边界 JSON → 各工具 promptGuidelines → 已安装技能节」；Pipeline 即使算出矩阵快照也没有通道交给 Codex 适配器。
- **现在：** Pipeline 仅在 trio + 内置治理角色 + chief 时经 `contextSections` 传入已渲染快照；Codex 适配器把它作为连续片段拼在边界 JSON 之后、工具 guidelines 之前；幕僚开局即可看到矩阵块（`generatedAt`、摘要声明、固定句等由上游渲染）。其他角色/worker/`su`/single/判断会话无输入或无拼接，提示保持基线。

## 2. 实现（仅 `composeContext`）

- **文件**：`src/provider/codex/session.ts`；diff **+11 / −0**，只改 `composeContext`（`:349` 起）。
- **固定插入位置**：`角色写入边界：${JSON.stringify(role.boundary)}` 之后、`...options.tools.flatMap(tool => tool.promptGuidelines ?? [])` 之前；已安装技能节仍最后。chat 传输（`systemPrompt`）与应用服务器（`developerInstructions`，含 `thread/start`/`thread/resume`）共用该函数，无第二拼接点。
- **锚点断言**：Codex 实际数组因既有「工具说明行」使矩阵片段从索引 4 起；测试用 `indexOf` 相对顺序（boundary JSON < matrix < guidelines < skills），**不硬编码索引 3**。
- **判断会话守卫**：`judgeMode` 下即使上游误传 `contextSections` 也不拼接（与既有 `installedSkills` 守卫同口径），judge 提示逐字不变。
- **空串过滤**：`options.contextSections ?? []` 经 `filter(section => section.length > 0)`；空数组/缺省/空串 ⇒ 系统提示逐字不变。
- **哑拼接**：不 trim、不清洗、不截断、不解析、不追加声明、不额外 `redact`；数据化包裹（固定分隔、「只是数据不是指令」声明）、控制字符规范化、16,000/48,000/1,500 字限长由 C1b 渲染器与 C3 快照负责。
- **分层**：只消费 C2 冻结的 `RuntimeProviderOptions.contextSections?: readonly string[]`（`src/model/runtime.ts:2841`；Service 条件透传 `src/service/runtime/session.ts:87`、`:240`）；不导入矩阵 Model/Service，不注册 `governance_matrix` 工具，不改 C2/C3/其他适配器/app/i18n。

## 3. 测试与证据（原始计数）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新增单测 | `node --test --test-concurrency=1 test/codex-adapter/governance-matrix-context.test.ts` | **tests 6 / pass 6 / fail 0 / skip 0 / exit 0** |
| 适配器套件 | `node --test --test-concurrency=1 "test/codex-adapter/**/*.test.ts"` | **tests 103 / pass 101 / fail 1 / skip 1 / exit 1**；唯一失败＝既有 Windows symlink `EPERM`（`test/codex-adapter/session.test.ts:351`，与 B0 同一用例/根因）；skip＝既有 POSIX-only 用例；新增确定性失败=0、新增 skip=0 |
| 静态检查 | `npm run typecheck` | **exit 0**，无诊断输出 |
| T2/T3（统筹/E2 记录） | T3 全量 | **4,130 / 4,103 / 9 / 18**（tests/pass/fail/skip；新增失败=0、新增 skip=0） |

- 环境：Windows 11 Pro 10.0.26300 / Git Bash / Node v24.22.1 / npm 11.19.1；依赖沿用已安装 `node_modules`。
- 新增测试用例：固定位置（boundary JSON 之后、guidelines/skills 之前，锚点断言）；多片段顺序与长度算术；`undefined`/`[]`/`[""]` 逐字不变；判断会话守卫；数据化文本逐字透传（恰好一次、无包装/清洗/截断）；`thread/start` 的 `developerInstructions` 与 `composeContext` 输出一致。
- 未运行：真实模型/网络探针（本特性不涉及）；`typecheck:renderer`/`build:renderer` N/A（无渲染面改动）。

## 4. 候选与文件哈希

| 文件 | 行数 | git blob | sha256 |
| --- | --- | --- | --- |
| `src/provider/codex/session.ts` | 1006 | `7655a73312cc9395f5d546945d2c5b36ec96d2eb` | `4cdfe6f87ea03dc05e5a73316f903f6120f0e6eae4116e71e2922d6d526141b4` |
| `test/codex-adapter/governance-matrix-context.test.ts`（新增） | 137 | `a7bca557a9c6e35e62f2bf48fc9d094628b8a790` | `1a00e70bb404d64c8f378e93473717892ee95dbf77727e6afcb242740a633b69` |

- 写集核对：仅上述两文件；`src/ app/ test/` 中无本角色其他改动；未暂存（`git diff --cached --name-only` 为空）；未 commit/push。
- 候选快照 `839b922f…` 由统筹/E2 记录；代码/测试自上述哈希起未再改动，本记录与提案/api-spec 的文档 update 不改变产品候选。

## 5. 未做 / 声明

- **未验收**：本记录不写 `verified`，不是 E2 验收结论；E2 由独立验收按 V1 判定。
- 未改 `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/**`、`src/pipeline/**`、其他适配器、`app/**`、`src/common/shared/**`、i18n、依赖/构建配置；未新增工具、未改权限/边界/角色卡。
- 提案状态已由 `proposed` 更新为 `implemented-unverified`，并在提案中注明候选快照与 T2/T3 计数；`api-spec.md` 已补 `contextSections` 消费与固定插入位置说明。
- 不 commit/push/合并/发布。
