---
id: change_all-roles-shell-approval
type: change
title: 五个内置治理角色统一 shell 审批档（客户新规则：所有角色可运行 shell，但一律提交审批）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: 注册表能力矩阵 `shell`（五角色 none/readonly → operator-approve）+ 五张角色卡文本的 shell 段；判定逻辑、写权、禁写与流程零变化
events:
  - date: "2026-10-19"
    kind: implemented
    summary: 五内置治理角色 `capabilities.shell` 统一 `"operator-approve"`；`GovernanceCapabilities.shell` 注释与五卡文本改为审批档口径（只读白名单直接执行，其余含读写与任意命令逐条审批，拒绝/超时/不可用不放行，写文件仍走 write_file + 写盘确认）
  - date: "2026-10-19"
    kind: verified
    summary: 门禁引擎套件 270 计 / 269 过 / 0 红 / 1 skip；`npm run typecheck` exit 0；跨角色 3 条旧断言如期转红（桌面/编排/测试属主待更新）
---

# 五个内置治理角色统一 shell 审批档

## 客户原文（已拍板）

> 所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，
> 只不过都要提交审批，按照原有的流程审批。

## 规则

1. **五个内置治理角色一律接审批档**：`liaison` / `rapporteur` / `nominator` / `convener` /
   `verifier` 的 `capabilities.shell` 由 `"none"`（四人）与 `"readonly"`（convener）统一改为
   `"operator-approve"`（su 已在用该档，保持现状）。
2. **审批链不另造**：只读白名单命令（shell 闸 (c) 判为 `allow`）按既有规则直接执行；
   `risky` / `review` / `deny` 逐条提交客户/判断 agent 审批；拒绝、超时、通道不可用一律不放行。
3. **审批不改变职责与写边界**：治理角色的 Section 1、预授权目录、`forbiddenWritePaths` 与
   角色职责均不动；写文件仍优先 `write_file` 并经写盘确认；shell 命令的文件副作用仍不受
   ANS 文件写入门禁约束（审批卡是唯一控制，见安全边界）。
4. **不新增角色、不改其他能力**：`customerInput` / `handOffIntent` / `requestClarification` /
   `dispatchTask` / `roleStatus` / `sessionTail` / `proposeRecovery` / `installSkill` / `installMcp`
   逐位不变；`GovernanceCapabilities.shell` 类型联合保留 `"none" | "readonly" | "operator-approve"`
   仅为旧数据/兼容（新注册项不得再用）。

## 影响面（本角色边界内）

| 文件 | 变更 |
| --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | 文件头新增 2026-10-19 客户规则注记（L9-12）；`GovernanceCapabilities.shell` 注释整段重写（L59-68）；新增单一来源 `SHELL_APPROVAL_CARD_LINE`（L112-118）；五张卡文本各插入/替换 shell 段（L153、L207、L274、L336、L378）；五处 `capabilities.shell` 改 `"operator-approve"`（L427、L457、L494、L526、L561）；su 的 `LEGACY_SU_CAPABILITIES.shell` 保持 `"operator-approve"`（L589） |
| `test/门禁引擎/governance-trio.test.ts` | 能力矩阵断言（L202、L225-229）与卡文本断言（L345、L364）改为审批档；新增专项用例（L251-268）：五角色均 `operator-approve`、卡文本含「审批」「读写」语义、旧 `none`/`只读档`/`执行类 shell 留给项目角色` 表述不得残留 |
| `test/门禁引擎/liaison-role.test.ts` | 能力 deepEqual `shell: "none"` → `"operator-approve"`（用例名同步） |
| `角色卡/门禁引擎/api-spec.md` | 两处旧口径（「无 shell」「convener 只读档、其余不接 shell」）按新规则改写 |

未改动任何放行/拒绝判定、边界条目、禁写路径、预授权、应用专用边界或确认/审批实现；
未碰 `src/pipeline/**`、`app/**`、`src/common/编排/**`、其他角色文件/测试、真实项目；
不读 `.env`、不跑真实模型/凭据/网络；未 git 提交。

## 跨角色依赖（须各自属主同步，本角色未越界修改）

1. **桌面窗口（`app/desktop/session.ts`）**：`shellOperatorOnly` 目前仅 `legacyBuiltIn`（su）构造
   （L1737-1744），`shellReadonly` 仅 `governanceFunction === "schedule"`（convener，L1750-1756）。
   新规则下须把审批档从 su-only 扩到**全部内置治理角色**（`role.builtIn === true`，含五个 trio
   id），并把 convener 的只读档切换为审批档；相关注释（L1705-1707、L1731-1736、L1746-1749）
   与 `app/desktop/interface.ts`（L310-319、L402-413）同批更新。桌面测试
   `test/桌面应用/dispatch-delivery.test.ts`（L1567、L1579、L1591-1595）与
   `test/桌面应用/operator-channel.test.ts`（L221-247 源码扫描）锁定了「trio 不接审批档 /
   Convener 只读档」，须随实现同步。
2. **编排（`src/pipeline/orchestration/run-role.ts`）**：行为守卫 `cap?.shell !== "operator-approve"`
   在注册表改为审批档后自然接纳五个角色，**判定代码无需改动**；但注释（L1040-1045、L1051-1053、
   L1063-1065）仍写「审批档只属于 single/su」「trio Rapporteur/Nominator 没有 shell 面」，
   须改为按能力位驱动的统一口径；`src/pipeline/orchestration/govern-session.ts`（L607）提示词
   「shell 面仅只读档」需同步。编排测试 `test/编排/governance-session.test.ts`（L389-392
   「rapporteur/nominator 不应注入 shellGate」）须更新。
3. **测试角色**：`test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`
   （L265「Liaison 无 shell 面」、L313 能力 deepEqual `shell: "none"`）与
   `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`（L175-179
   「误传 approval 也不 arm」）按新规则翻转为「审批档已 arm」。
4. **README**：L75「治理角色只读。Lead、Draft、Crew、Proof 不接 shell；Steward 只有只读档…」
   须改为五角色统一审批档、shell 可读写但逐条审批。
5. **产品/设计文档**：三权评审 §5.6 与四角色评审 §4.3 的 shell 列（历史冻结文档）不再代表
   现状，后续引用以本变更与注册表为准。

## 安全边界（如实）

- **shell 可写是本次规则的核心变化**：审批档批准的命令以当前 OS 用户权限执行，**文件副作用
  不受 ANS 文件写入门禁约束**——可写到项目外，也可写 Section 1 之外的路径。客户/判断 agent
  的逐条审批是唯一控制；拒绝、超时、通道不可用一律不执行（fail-closed）。
- **审批 ≠ 新写权**：审批只针对这一次命令，不改变 `write_file` 的 Section 1 / 预授权 / F4/F6/F7
  判定，也不改变角色的禁写路径与职责。
- **审计仍落盘**：每次 shell 判定继续写 `docs/audit/shell-gate.jsonl`（应用专用边界
  `appGovernanceBoundary` 提供写权；任何角色仍不可写该目录）。
- **判断 agent 代批不扩权**：客户开启「替我审批」时，代批回执标 `judge 代批`，不改变任何门槛；
  证据不足/判断失败回落手动确认（既有链路口径，本次未动）。

## 验证

| 命令 | 结果 |
| --- | --- |
| `node --test "test/门禁引擎/**/*.test.ts"` | exit 0；**270 计 / 269 过 / 0 红 / 1 skip**（既有 Windows 专属 skip） |
| `npm run typecheck` | exit 0（仅 npm 镜像配置提示，无 TS 错误） |
| 跨角色受影响用例（4 文件） | 40 计 / 37 过 / **3 红**，均为上述跨角色旧断言：`governance-liaison-verify/a-roles-writes-caps` L265、`governance-trio-verify/a-listing-sessions-writes` L177、`test/编排/governance-session` L389（`d-single-compat` 全绿——su 行为逐字不变） |

基线：2026-10-18 四角色批记录为 255 计 / 254 过 / 0 红 / 1 skip；本批仅新增 1 例专项用例
（工作树当前套件 270 计，其中含五角色批次期间新增但未单独记账的用例），无新增本角色红。

## 残余风险

- **审批疲劳与误批**：治理角色现在能执行任意命令，客户/判断 agent 需逐条审阅；审批卡只展示
  命令原文与规则档位，无法证明命令的间接副作用（脚本内再写盘等）。
- **判断 agent 代批依赖判断质量**：开启「替我审批」后，shell 放行由判断 agent 依既定门槛代批；
  其模型能力/可用性直接影响安全面，失败时回落手动（不变）。
- **桌面/编排未同步前的空窗**：本批只改注册表与卡文本；桌面仍只给 su 构造审批档、给 convener
  只读档，编排提示词与部分测试仍按旧口径。**真机效果要等桌面窗口把 `shellOperatorOnly` 扩到
  全部内置治理角色后才完整**；此前 convener 仍被只读档限制（更严，非放宽），其余四角色仍无
  shell（能力位已放开但桌面未注入）。
- **审计落盘前提**：shell 审计边界由编排 `assembleProjectShellGate` 装配；此前登记的
  「`pmBoundary` 取首个内置角色边界、需改用 `appGovernanceBoundary`」若未修复，审计可能落盘
  失败（与本批无因果，但会削弱可追溯性）。
- 真机端到端（五个治理角色各跑一条只读命令 + 一条需审批命令）与独立复验未进行。
