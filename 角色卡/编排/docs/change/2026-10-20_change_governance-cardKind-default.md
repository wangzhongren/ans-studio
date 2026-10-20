# 2026-10-20 变更：治理 confirm 卡缺 `cardKind` 时按角色/路径兜底

- 日期：2026-10-20
- 角色：编排
- 来源：真机 Convener 的写治理记录卡 `request_confirmation` 未带 `cardKind`，`governedInput` 不计算 `judgeContext`，桌面 `planJudge` 返回 undefined，卡片直接呈现客户；客户问「这个为啥还需要我审核呢」。
- 范围：`src/pipeline/orchestration/run-role.ts`、`test/编排/governance-judge.test.ts`、本角色文档；未改 `app/**`、运行时核心。

## 1. 问题

`run-role.ts::governedInput` 只在 `cardKind !== undefined` 时做 `TRIO_CARD_KINDS` 白名单与 `computeJudgeContext`。治理角色（尤其 Convener 写治理记录卡）若漏带 `cardKind`：

- 白名单不拦（`undefined` 放行，旧行为）；
- `judgeContext` 不生成 ⇒ 桌面 `planJudge` 无 `judgeContext` 直接返回 undefined；
- 结果：本应由「替我审批/替我决策」自动判断的卡直接呈现客户，客户被迫手批。

## 2. 修复（只对 trio + confirm + 缺 cardKind）

在 `governedInput` 内、白名单与 `judgeContext` 之前做**保守兜底**：

| 角色 | 声明路径（`declaredConfirmPaths`：显式 `paths` 优先，否则 preview 一行一路径） | 默认 cardKind |
| --- | --- | --- |
| Convener（schedule） | **全部**路径都是 `docs/flows/<flowId>.yaml|yml` | `schedule-write` |
| Convener（schedule） | 其他有路径 | `write` |
| Rapporteur（proposal） | 有路径 | `write` |
| Verifier（verification） | 有路径 | `write` |
| Nominator（nomination） | **全部**路径都在 `角色卡/<id>/` 下 | `appointment-write` |
| Nominator（nomination） | 其他有路径 | `write` |
| Liaison / 其他 | — | 不兜底 |
| 任意角色 choice 卡 | — | 不兜底 |
| 任意角色 confirm 卡但提取不到路径 | — | 不兜底 |

要点：

- **显式 `cardKind` 永远优先**；显式非法值仍走原 `TRIO_CARD_KINDS` 拒绝（不因兜底放宽）。
- 兜底后的 `cardKind` 同时写入传给桌面的 **request** 与 **metadata**（桌面 `planJudge` 读 `entry.request.cardKind ?? entry.metadata?.cardKind`），并继续走既有白名单、`validateConfirmPreviewCompleteness`、Flow YAML 写前校验、`computeJudgeContext` 与 `recordCustomerDecision`。
- 记诊断 `governance.cardKind.defaulted`（`roleId` / `cardKind` / `declaredPaths`）。
- 无路径不猜（避免把普通确认误判为写卡）；choice 卡不猜（避免把选择卡误判为写卡）。

## 3. 测试与验证（真实输出）

- 新增 3 例（`test/编排/governance-judge.test.ts`）：
  - Convener 缺 cardKind + `docs/flows/flow-a.yaml` ⇒ 默认 `schedule-write`，request/metadata 均带 cardKind，`judgeContext` 生成；
  - Convener 缺 cardKind + `docs/governance/convener/notes.md` ⇒ 默认 `write`；
  - Rapporteur 缺 cardKind ⇒ `write`；Nominator 缺 cardKind + `角色卡/alpha/role-card.md` ⇒ `appointment-write`；
  - 显式非法 `cardKind: "proposal"` ⇒ 仍拒绝且客户通道零调用；
  - choice 卡缺 cardKind ⇒ 不兜底、无 judgeContext；
  - 扩展既有 single/su 与项目角色用例：缺 cardKind 的 confirm 卡仍不兜底、不注入 judgeContext。
- `node --test "test/编排/governance-judge.test.ts"` → **63 tests / 63 pass / 0 fail / 0 skipped**
- `node --test "test/编排/**/*.test.ts"` → **678 tests / 678 pass / 0 fail / 0 skipped**
- `npm run typecheck` → **exit 0**（全仓）

## 4. 残余 / 跨角色

- 若治理角色的 confirm 卡既没有显式 `paths`、preview 也没有「一行一个路径」声明，仍不兜底（无法确认写卡类型，保持旧行为——直接呈现客户）；建议治理角色按 `request_confirmation` 指引始终给出 `paths`。
- `notConsented` 对 judge deny/manual-as-declined 的回执仍写作「客户拒绝（…）」（运行时核心 `src/provider/runtime/tools.ts`），与「判断 agent 拒绝」的语义有偏差；属运行时核心文案，本批未改。
- 本批未改 `app/**`；桌面 `planJudge` 已能消费 request/metadata 上的默认 `cardKind`。未 git 提交。
