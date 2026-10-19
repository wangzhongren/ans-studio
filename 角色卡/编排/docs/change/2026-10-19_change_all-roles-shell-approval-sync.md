# 2026-10-19 变更：编排侧同步「所有内置治理角色统一 shell 审批档」

## 问题

客户新规则：

> 所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，
> 只不过都要提交审批，按照原有的流程审批。

门禁引擎已把五个内置治理角色（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier`）的
`capabilities.shell` 从 `"none"`（四人）与 `"readonly"`（convener）统一改为 `"operator-approve"`
（`su` 保持），见 `角色卡/门禁引擎/docs/change/2026-10-19_change_all-roles-shell-approval.md` 的
「跨角色依赖」第 2 条。

编排侧的执行守卫 `cap?.shell !== "operator-approve"` 本就按能力位判定，注册表变更后自然接纳五个角色，
**判定代码无需改动**；但注释、治理会话提示词与测试仍锁定旧口径：

- `run-role.ts`：注释写「审批档只属于 single/su」「trio Rapporteur/Nominator 没有 shell 面」；
  选项文档写「su-only 守卫：仅 `suppressHandback === true`」。
- `govern-session.ts`：Convener 纪律写「shell 面仅只读档」。
- `test/编排/`：能力矩阵断言「rapporteur/nominator/liaison 不应注入 `shellGate`」——
  注册表变更后这两个文件先红（基线 566 计 / 564 过 / 2 红），属预期旧断言。

## 规则（编排侧口径）

1. **能力位驱动，不按角色 id 硬编码**：`shell: "operator-approve"` 的内置治理角色（2026-10-19 起
   ＝五个角色＋su）传入 `shellOperatorOnly` ⇒ 装配审批档 `ShellGate`。
2. **审批链不另造**：只读白名单（(c)=allow）直接执行；`risky`/`review`/`deny` 逐条提交
   客户/判断 agent 审批；拒绝、超时、通道不可用一律不放行（既有 `assembleOperatorShellGate` 语义）。
3. **审批 ≠ 写边界扩张**：审批只针对当次命令，不改变职责与 Section 1 写边界；写文件仍优先
   `write_file` 并经写盘确认。提示词按此措辞（给模型的行为约束）。
4. **守卫不放宽**：`cap.shell !== "operator-approve"`（项目角色、旧能力位）仍拒绝 arm；
   `shellOperatorOnly` 与 `shellReadonly` 互斥仍不择一静默生效；装配失败仍不 arm。
   `shellReadonly` 保留为旧调用方/测试的兼容路径（只读档执行集严格 ⊆ 审批档，仍更严）。

## 改动文件

### 源码（仅注释/提示词，零判定变化）

- `src/pipeline/orchestration/run-role.ts`
  - `AdapterCapabilities` 的 `shellGate` 说明（约 L165-170）：改为「内置治理角色（五角色＋su）经审批档」。
  - `shellOperatorChannel` 说明（约 L528-536）：内置治理角色改走审批档、不自接三层链。
  - `shellReadonly` 说明（约 L542-554）：标注为旧兼容路径；审批档为 2026-10-19 起的统一档。
  - `shellOperatorOnly` 说明（约 L555-568）：能力位守卫改为 `cap?.shell !== "operator-approve"` 的
    真实判据（原文写 `suppressHandback`，与代码已不符）。
  - I-1 arm 块注释与两处内联注释（约 L1042-1075）：五角色统一审批档、旧能力位仅兼容；
    **判定代码逐字未动**（拒绝分支、互斥守卫、装配失败不 arm 全部保留）。
- `src/pipeline/orchestration/shell-arming.ts`（仅注释）
  - 审批档选项/函数/内联注释去掉「su 不自审」「本档只服务 single/su」等旧口径（约 L259、L285-295、
    L301-303、L327），改为能力位驱动 + trio 审计边界经 `auditBoundaryOf` 映射的现状描述。
- `src/pipeline/orchestration/govern-session.ts`
  - 新增 `SHELL_APPROVAL_PROMPT_LINE`（L507-512）：所有内置治理角色统一审批档；只读白名单直接执行，
    其余（含读写与任意需要命令的权限）逐条提交客户/判断 agent 审批；拒绝/超时/不可用不放行；
    **审批不等于写边界扩张，写文件仍优先 `write_file` 并经写盘确认**。
  - `buildGovernPrompt`：trio 分支在每个角色纪律后追加该行（L581）；single/su 分支在 `head` 后
    追加该行（L544）。提示词依旧不写「已批准/已授权」。
  - `governanceFunctionDiscipline` 的 Convener 纪律（L621）：删「shell 面仅只读档」，改为
    「内置治理角色一律拒绝（派发对象限制）；shell 审批档不改变派发对象限制」，并顺带把「四个」
    改为不限数量的「内置治理角色」（2026-10-18 起已有五个）。
  - 文档注释「四角色各自纪律」→「五角色各自纪律」（L585）。

### 测试（`test/编排/`）

- `test/编排/governance-session.test.ts`
  - 能力矩阵夹具 `shellReadonly` → `shellOperatorOnly`（含 `operatorChannel` 桩）；
    rapporteur/nominator 由「不应注入 shellGate」翻转为「应 arm 审批档 shellGate」（L388、L402）；
    convener/su 原断言保留；其余能力断言逐条保留未放宽。
  - 新增用例（L442-493）：五个内置治理角色（liaison/rapporteur/nominator/convener/verifier）
    能力位为 `operator-approve` 时均得到审批档 `shellGate`；su 同；项目角色（能力位缺席）误传
    `shellOperatorOnly` ⇒ 仍不 arm。
- `test/编排/liaison-session.test.ts`
  - 能力矩阵夹具 `shellReadonly` → `shellOperatorOnly`；Liaison/Rapporteur/Nominator 由
    「不应注入 shellGate」翻转为「应 arm 审批档 shellGate」（L287、L300、L314）；Convener/su
    原断言保留；其余能力断言逐条保留未放宽。

### 文档

- 本变更记录、`角色卡/编排/changelog.md`、`角色卡/编排/memo.md`。

## 测试与验证（真实输出）

工作树含其他角色未提交改动（门禁引擎注册表、运行中核 op-2 预览完整性闸、shell-judge 并发池等）。

| 命令 | 结果 |
| --- | --- |
| 基线（改动前）`node --test "test/编排/**/*.test.ts"` | 566 计 / 564 过 / **2 红**：`governance-session.test.ts:389`（rapporteur 不应注入 shellGate）、`liaison-session.test.ts:288`（Liaison 不应注入 shellGate）——均为注册表变更后的预期旧断言 |
| 改动后 `node --test "test/编排/**/*.test.ts"` | **567 计 / 567 过 / 0 红 / 0 skipped**（+1 为新增用例） |
| 定向 `node --test "test/编排/governance-session.test.ts" "test/编排/liaison-session.test.ts"` | 36 计 / 36 过 / 0 红 |
| `npm run typecheck` | **exit 0（tsc --noEmit 无错误）**；仅 npm 的 `ELECTRON_MIRROR` 配置告警，非类型错误 |

## 跨角色依赖（未越界修改，如实登记）

1. **桌面窗口（`app/desktop/session.ts` / `interface.ts`）**：审批档目前仅 `legacyBuiltIn`（su）构造
   （`session.ts:1737-1744`），只读档仅 `governanceFunction === "schedule"`（convener，L1750-1756）。
   新规则下须把 `shellOperatorOnly` 扩到全部 `role.builtIn === true`，并移除/退役 convener 的只读档；
   其源码扫描测试 `test/桌面应用/operator-channel.test.ts`（L221-247）与
   `test/桌面应用/dispatch-delivery.test.ts` 锁定了旧口径，须同批更新。
   **在此之前真机效果不完整**：五角色的能力位已放开，但桌面只给 su 注入审批档；convener 仍被只读档
   限制（更严，非放宽）；其余四角色仍无 `run_shell`（能力位已放开、桌面未注入）。
2. **测试角色**：`test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`（「Liaison 无 shell 面」/
   能力 deepEqual `shell:"none"`）与 `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`
   （「误传 approval 也不 arm」）须按新规则翻转。
3. **README** 与历史设计文档中的「治理角色只读 / 五角色不接 shell」口径须由属主更新（历史冻结文档
   不再代表现状，以注册表与本变更为准）。
4. **审计/卡片文案命名**：`shell-gate.ts` 的固定后缀「（su 审批档）」与
   `SU_APPROVAL_REASON_PREFIX = "su-审批档"` 仍带 `su` 字样。现在它们也用于其他四个角色，
   属于历史命名；改名会影响桌面 `operator-channel.ts` 的前缀解析（`^su-审批档\[`），须由编排 +
   桌面属主同批协调，本批未动。

## 残余风险

- **shell 可写是本次规则的核心变化**：审批档批准的命令以当前 OS 用户权限执行，文件副作用不经 ANS
  写入门禁（可写项目外/Section 1 之外）；客户/判断 agent 逐条审批是唯一控制，拒绝/超时/不可用不放行。
- **审批疲劳与误批**：五角色均可执行任意命令，审批卡只展示命令原文与档位，无法证明脚本的间接副作用。
- **CLI `ans govern` 不 arm shell**：本提示词对 CLI 会话也写明审批档纪律，但 CLI 一次性路径未注入
  `shellOperatorOnly`，`run_shell` 结构上不注册；模型即便尝试也不会执行。桌面注入后真机能力才完整。
- **旧能力位 `none`/`readonly`** 仍保留在类型联合中（兼容旧数据）；新注册项不得再用，
  `openRoleSession` 对 `none` 仍拒绝、对 `readonly` 仍按更严只读档处理。

## 边界声明

只写 `src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts`、
`src/pipeline/orchestration/shell-arming.ts`、`test/编排/{governance-session,liaison-session}.test.ts`
与本角色文档；未碰 `app/**`、门禁引擎、运行时核心/适配器、其他角色文件；未执行 git 提交；
未读 `.env`、未发真实模型请求、未真跑任何 shell 命令。
