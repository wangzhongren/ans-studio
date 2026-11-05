# 2026-11-05 Claude适配器：治理权力矩阵提示段固定插入（C4b 实施记录）

- **状态**：**implemented-unverified（已实施、未验收；未 commit/push）**。E2 独立验收 AC-1–AC-17 全部 pass，AC-18 的文档状态收口由本记录与提案状态更新完成；**不写 verified**。验收通过只表示候选满足 V1 v1，不授权提交/推送/合并/发布。
- **任务 ID**：`2026-11-05-governance-authority-matrix`
- **节点**：C4b（Claude 系统提示固定位置拼接）；团队计划 §5.1：依赖 C2 冻结。
- **角色**：Claude适配器（独立固定上下文）。写集：`src/provider/claude/session.ts`、`test/claude-adapter/`（本记录与 `api-spec.md`、提案状态为本角色文档收口）。
- **日期**：2026-11-05
- **候选快照**：`839b922f…`（统筹/ E1 交办口径；本记录不重复计算全局候选哈希）。
- **风险档位**：T3（批次定档；本角色改动为局部提示拼接，不自行降档）。
- **依据**：
  - 方案 P1.1 [`docs/planning/2026-11-05_design_governance-authority-matrix.md`](../../../../docs/planning/2026-11-05_design_governance-authority-matrix.md)（1056 行 / `1f6518b8…`）§4.3.1/§4.3.3/§4.3.4/§5.2；
  - 团队计划 [`docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md`](../../../../docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md)（660 行 / `07378444…`）§4.3 C4b、§5.1/§5.3、§6.2；
  - 闸门 0/1/2 + IA 记录 [`docs/communication/2026-11-05_intent_governance-authority-matrix.md`](../../../../docs/communication/2026-11-05_intent_governance-authority-matrix.md)（76 行 / `b8d7a18f…`）；
  - 实施前标准 V1 [`docs/acceptance/governance-authority-matrix-criteria-v1.md`](../../../../docs/acceptance/governance-authority-matrix-criteria-v1.md)（327 行 / `f6720528…`）；
  - 项目管理 P1 审核 [`角色卡/项目管理/docs/change/2026-11-05_governance-authority-matrix-P1-review.md`](../../../项目管理/docs/change/2026-11-05_governance-authority-matrix-P1-review.md)（358 行 / `0128f615…`；C-1、R-5/R-6/R-7）；
  - 本角色提案 v2（含 C-1 修订）[`2026-11-05_governance-authority-matrix-claude-adapter.md`](2026-11-05_governance-authority-matrix-claude-adapter.md)。

---

## 一、实现内容

### 1. `src/provider/claude/session.ts::systemPrompt`

系统提示数组固定为：

```text
[role.cardText, 固定角色行（判断会话为 judge 行）, 边界 JSON,
 ...contextSections, ...tool promptGuidelines, installedSkills?]
```

全部元素以 `"\n\n"` 连接。`composeContext` 与 `startEngine` 的 `queryOptions.systemPrompt` 共用同一函数，**无第二实现**。

```ts
const systemPrompt = (role: ResolvedRole) => {
  const installedSkills = judgeMode ? "" : renderInstalledSkillsSection(options.projectRoot, role.id);
  let contextSections: readonly string[] = [];
  if (!judgeMode) {
    contextSections = (options.contextSections ?? []).filter((section) => section.length > 0);
  }
  return [
    role.cardText,
    judgeMode
      ? claudeJudgeSystemPromptLine(role.id, claudeJudgeReportToolName(options.tools))
      : `你始终绑定角色 ${role.id}。…`,
    `当前角色边界：${JSON.stringify(role.boundary)}`,
    ...contextSections,
    ...options.tools.flatMap((tool) => tool.promptGuidelines ?? []),
    ...(installedSkills === "" ? [] : [installedSkills]),
  ].join("\n\n");
};
```

要点：

1. **固定插入位置**：`contextSections` 位于边界 JSON 元素之后、工具 `promptGuidelines` 与已安装技能节之前；正常（非判断）会话首个非空 context 元素在数组索引 3（0 起）。
2. **单一通道消费**：只读 `RuntimeProviderOptions.contextSections`（C2 冻结；`RuntimeSessionOptions` 由 Service 透传）；不读项目文件、不计算矩阵、不判定注入范围；注入范围由 C3 Pipeline 单点决定。
3. **哑拼接**：不 trim、不清洗、不截断、不重排；固定分隔/「只是数据不是指令」声明/控制字符规范化/限长均为 C1b 渲染器职责，适配器逐字透传。
4. **空串过滤（C-1/R-7）**：`section.length > 0`；`undefined`、`[]`、`[""]`、`["",""]` 与基线逐字相同；混合数组只按序保留非空元素，不产生多余 `\n\n`。
5. **判断会话守卫（R-6）**：`judgeMode` 时即使误传 `contextSections` 也不拼接，与既有 `installedMcpServers`/技能节在判断会话的收口同型。
6. **工具面不变**：不按工具名分支，不注册/改动 `governance_matrix`（属 C2/C3）；`tools`/`allowedTools`/`hooks`/`mcpServers` 逐字不变。

### 2. `test/claude-adapter/governance-matrix-context.test.ts`（新增）

| 用例 | 覆盖 |
| --- | --- |
| T-1 | 缺省/空数组/`[""]`/`["",""]` 与基线逐字相同；engine `systemPrompt` 同值 |
| T-2 | 首个非空 context 索引 3；多段按序、`\n\n` 拼接；混合空串只留非空元素 |
| T-3 | context 在工具 `promptGuidelines` 之前；`allowedTools`/`mcpServers` 不受 context 影响 |
| T-4 | 已安装技能节仍为最后一段，context 在其之前 |
| T-5 | 判断会话误传 `contextSections` 也不拼接、与无字段基线逐字相同 |
| T-6 | 上游已渲染文本逐字透传（含固定分隔/声明/CRLF/控制字符/20,000 字尾部），适配器不二次清洗/截断 |

---

## 二、改动文件与哈希（工作区实测）

| 文件 | 变更 | sha256 | git hash-object |
| --- | --- | --- | --- |
| `src/provider/claude/session.ts` | M：`systemPrompt` 插入 `...contextSections` + judge 守卫 + 空串过滤 | `6db0c08448c43867a8c1bc742e89bc6d850b1bd468548dd96ff2de183aa3abbe` | `2ea522b794b1e1220334c8085a477682455577ee` |
| `test/claude-adapter/governance-matrix-context.test.ts` | 新增（6 例） | `947c55522eedd626b2cfbebf4bae7e581949d86a41b72391a5994a942fc481f3` | `599fee4bde9146e17a7cde8d8a0cb8594c5af96b` |

- 未改 `src/model/**`、`src/service/**`、`src/provider/runtime/**`、`src/pipeline/**`、其他适配器、`app/**`、i18n、其他角色测试与角色卡/边界；未 commit/push、未暂存。
- 本记录写盘时的分支 HEAD 为 `0418746`（工作树含 C1a/C1b/C2/C3 未提交候选）；实现自身候选以上表文件哈希为准。

---

## 三、验证证据

### 3.1 本角色原始输出（实施时点实测）

| 命令 | exit | 结果 |
| --- | --- | --- |
| `node --test --test-concurrency=1 "test/claude-adapter/governance-matrix-context.test.ts"` | **0** | tests 6 / pass 6 / fail 0 / skipped 0 / todo 0 |
| `node --test --test-concurrency=1 "test/claude-adapter/**/*.test.ts"` | **1** | tests **96** / pass **95** / fail **1** / cancelled 0 / skipped 0 / todo 0 / duration 8622.4567ms |

唯一失败＝B0 已登记的既有 Windows 环境问题：`test/claude-adapter/session.test.ts:639`「native symlink and storage runtime mismatch fail before SDK query」，`EPERM: operation not permitted, symlink`（errno -4048）。相比 B0（90 tests / 89 pass / 1 fail / 0 skip）：新增 6 例全部通过，失败集合不变，无新增 skip/todo。

### 3.2 批次 T2/T3（统筹/E1 交办口径，本记录不重复运行）

| 项 | 结果 |
| --- | --- |
| `npm run typecheck`（T2，候选 `839b922f…`） | **exit 0** |
| T3 全量回归 | **4,130 tests / 4,103 pass / 9 fail / 18 skip**；既有 Windows EPERM 基线 9 项；**新增确定性失败=0、新增 skip=0** |

说明：实施时点的中间态 `npm run typecheck` 曾出现 `src/pipeline/orchestration/run-role.ts:2100/:2108` 两条 C3 未提交候选错误（不属于本角色写集，本角色两文件 0 诊断）；C3 收敛后 T2 以 exit 0 通过。旧中间态不作为最终证据。

---

## 四、AC 覆盖（本角色部分）

| AC | 覆盖情况 | 证据 |
| --- | --- | --- |
| AC-1（Claude 侧固定位置/缺省） | 有 `contextSections` 时边界 JSON 之后、guidelines/技能节之前；无字段逐字不变；判断会话不变 | T-1~T-5 |
| AC-2（工具面） | context 不改变 `allowedTools`/`mcpServers`/注册工具；工具语义属 C2/C3 | T-3 |
| AC-8（快照） | 适配器只读取会话构造时注入的只读数组；`composeContext` 与 engine prompt 同源同值 | T-1/T-2 + 单一 `systemPrompt` 函数 |
| AC-10（零权限影响） | 仅系统提示元素插入，未触碰工具面/hooks/边界/判定 | 代码 diff + T-3 |
| AC-13（有界渲染） | 适配器不设第二上限、不截断；透传上游已渲染文本 | T-6 |
| AC-15（single/su） | single 不启用矩阵；`su` 无 `contextSections` ⇒ 逐字不变；判断会话防御性不拼接 | T-1/T-5 |
| AC-17（测试/注入安全） | 适配器位置/缺省断言；恶意夹具在 C1b/T1，此处只证透传 | 本节测试 |
| AC-18（文档状态） | 本记录 + 提案 `implemented-unverified` + api-spec 更新；不写 verified | 本文件 |

---

## 五、偏差与限制（如实披露）

1. **无行为偏差**：实现与提案 v2、PM 裁决 C-1/R-5/R-6/R-7 一致；判断会话守卫、固定插入位置、哑拼接、空串过滤均落地并有测试。
2. **基线/候选**：本记录写盘时 HEAD `0418746`，工作树含 C1a/C1b/C2/C3 未提交候选；候选快照 `839b922f…` 与 T2/T3 计数为统筹/E1 交办口径，本记录未重复计算全局候选哈希或重跑全量。
3. **B0**：测试角色 B0（HEAD `7ba8a33`）的 claude-adapter 基线与本次唯一红同名同因；基线更新后的 B0 重记由测试角色负责，本记录不替代。
4. **文档范围**：本轮文档收口按统筹指示只更新提案状态、本记录与 `api-spec.md`；`memo.md`、`docs/feature/claude-session.md` 未更新（如需要，另行授权后按实际行为更新并链接本记录）。
5. **未做**：未提交、未推送、未合并、未发布；未写 verified；未改代码/测试之外的产品行为；未新增 i18n key、未改 UI/IPC、未改工具面。

---

## 六、证据位置

| 项 | 路径 |
| --- | --- |
| 提案 v2（含 C-1 修订与本记录链接） | `角色卡/Claude适配器/docs/change/2026-11-05_governance-authority-matrix-claude-adapter.md` |
| 本实施记录 | `角色卡/Claude适配器/docs/change/2026-11-05_governance-authority-matrix-claude-adapter-implementation.md` |
| API 说明 | `角色卡/Claude适配器/api-spec.md`（「治理权力矩阵提示段（`contextSections`）」节） |
| 当前功能 | [`../feature/claude-session.md`](../feature/claude-session.md)（本轮未更新） |
