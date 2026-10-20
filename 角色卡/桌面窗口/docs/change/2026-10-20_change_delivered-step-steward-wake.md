---
id: delivered-step-steward-wake
type: change
title: 步骤 delivered 后唤醒 Steward 核证（去重任务＋Lead 系统行；不伪造 done、不改 flow）
created: "2026-10-20"
status: implemented
---

# delivered 后唤醒 Steward 核证

## 真机问题

短链接项目卡在 Steward 核证：flow 的 `integration-e2e` / `verification-evidence` 已 `delivered`，但
Steward 空闲——应用没有「delivered 后唤醒核证」的触发器；同时这两步证据文件（.js/README.md）还没有
`artifact.observed`（编排正在补观察）。结果流程停在 delivered，没人叫 Steward 核证。

## 改动（`app/desktop/interface.ts`）

- 新增 `wakeStewardForDeliveredSteps(projectRoot, flowId, note, diagnostic)`，在
  `dispatchAcceptanceForFlow` 中调用（位置：**验收已 accepted 收口分支之后、verifier 去重/mtime 去重之前**
  ——settle / ledger / 导入 / verifier settle 触发的流程检查都会走到）：
  1. 读 `docs/flows/<flowId>.yaml` 并解析（无 YAML/不可读/解析失败 ⇒ 不处理，交给验收门既有 reason）；
  2. 找 `status:"delivered"` 且有 owner 的步骤；不存在 ⇒ 清除该 flow 的去重记忆（允许后续真实 delivered
     再唤醒）；
  3. **owner 有活会话/busy/队列/在途投递**（`liveSessionViews` + 跨 `RUNTIME_KINDS` 的
     `hasPendingDelivery` 只读检查）⇒ 等下一次事件，不抢跑；
  4. 去重键 `project+flow+revision(content sha256)+delivered step ids 排序`；同集合只派/提示一次；
     revision 或步骤集合变化 ⇒ 重新评估（再次派发/提示）；
  5. 向 **Steward/Convener** 后台投一条任务：逐步骤「步骤 X 已 delivered（owner=…），请核对账本/产物证据，
     用 `flow_step_update` 标 done 或退回修正；不要直接写 flow YAML」，并附核证要求（先核对证据再更新、
     未达 done 条件退回）；
  6. 向 **Lead（主入口）** 落一条去重 delivery-note：「流程 X：步骤 … 已 delivered，等待 Steward / 统筹
     核证（已投核证任务）」；
  7. 开/发失败只记诊断（`acceptance.delivered-wake.open.failed/send.failed`，不去重、下一次真实事件可再试），
     不循环。
- **不伪造 done、不自动改 flow、不弹客户卡**（Steward 收到任务后自行用 flow 工具核证）。
- 已有 `acceptance accepted` ⇒ `closeAcceptedFlow` 分支先 return（收口优先，不派核证、不派 verifier）；
  步骤 `done/superseded/blocked/failed` 或 `pending` ⇒ 不在 delivered 集合中，不提示/不派。
- 说明：上一版「僵尸步骤自检」对 delivered 步骤的 Lead 提示仍保留（兜底：可能因重启丢失）；本次新增的
  Steward 唤醒是**主路径**。两者互不替代：僵尸提示去重按 revision+stale ids，唤醒按 revision+delivered ids。

## 测试与证据（真实输出）

- `test/桌面应用/acceptance-dispatch.test.ts` 新增 3 例（共 **30/30 过**）：
  1. delivered + 无活会话 ⇒ Convener 恰一条核证任务（含步骤/owner/flow_step_update/不要直接写 flow YAML）
     + Lead 恰一条「已 delivered，等待 Steward 核证」系统行；零 verifier、零客户卡；flow 文件仍是
     delivered/pending（不伪造 done）；同 revision 重复 settle 不刷屏；revision 变化后再次评估（再派一次）；
  2. owner 有活会话 ⇒ 不抢跑（零任务、零系统行）；
  3. 已有 acceptance accepted ⇒ 收口优先（不派核证、不派 verifier、收口系统行如实）；步骤全 done 且无
     delivered ⇒ 不派核证，流程齐备照常派 verifier 一次。
- `test/桌面应用/interface.test.ts`：既有僵尸自检用例的「不自动派发」断言改为**以派发账本为准**
  （delivered 步骤现在会合法地另行走 Steward 唤醒，可能开 Convener 会话；僵尸自检本身不写账本）。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **673 计 / 673 过 / 0 红**。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **44/44 过**（一次并发运行命中已知
  `b-proposal-accept-timing` 尾部时序抖动；串行与随后并发重跑均全绿，非本改动路径）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- owner「有活会话」即视为还在推进（即使空闲）⇒ 不唤醒；若会话长期挂起且无队列，需看护/僵尸自检兜底。
- revision 用 flow 文件内容 sha256；回写但内容完全相同不会改变 revision（步骤集合相同 ⇒ 也不会重复派）。
- 唤醒失败只诊断、靠下一次真实事件重试（不循环、不去重标记）。
- rejected 流程（非 accepted）仍可能对 delivered 步骤唤醒 Steward（只有 accepted 收口会抑制）；符合
  「退回修正后继续核证」的语义。
- 同一 flow 多步骤 delivered 合并为**一条** Convener 任务/一条 Lead 系统行。
