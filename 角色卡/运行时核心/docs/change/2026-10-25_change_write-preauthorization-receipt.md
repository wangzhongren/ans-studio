---
id: write-preauthorization-receipt-change
type: change
title: 写入预授权 system 回执：系统放行/拒绝不冒充客户确认/拒绝
created: "2026-10-25"
updated: "2026-10-25"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-25"
    kind: implemented
    summary: request_confirmation 增加 system: operatorId 回执分支；客户/judge/notPresented 既有路径逐字不变；新增 1 例测试；runtime-core 全目录 310 计/303 过/3 既有 Windows symlink 红，定向 typecheck 0 错
---

# 写入预授权 system 回执

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、相关回归与 `npm run typecheck`，见「验证」）；**未验证**（独立验收、真实桌面/模型端到端、非 Windows 平台）。

## 以前怎样、现在怎样

**以前**：桌面「写入预授权」把边界内写盘确认结算为
`{ outcome:"answered", value:{ confirmed:true }, operatorId:"system:write-preauthorization" }`，
边界外/不可写结算为 `{ outcome:"declined", operatorId:"system:write-preauthorization", reason, notPresented:true }`。
`request_confirmation` 只认 `judge:` 前缀与 `notPresented`：系统放行被回执成「客户已确认」，系统拒绝被回执成
「治理确认卡未发出……请补齐后重新调用」——前者把系统裁决误报成客户确认，后者让模型误以为「卡没发、补参数重试就能过」，
而边界外写入根本不会因重试而获准。

**现在**：`request_confirmation` 在回执构造处先按 `operatorId.startsWith("system:")` 分流：

| 结算 | 回执 |
| --- | --- |
| `answered + confirmed:true + operatorId:"system:…"` | `ok:true`：「系统预授权已直接放行（边界内写入；confirmed:true；操作者：…）——这是系统预授权，**不是客户确认**，也不是判断 agent 代批。可按已放行的内容继续……向客户汇报时说明这是系统预授权放行，不要说成客户确认。」 |
| `declined + operatorId:"system:…"`（桌面同时置 `notPresented:true`） | `ok:false`：「系统预授权拒绝（边界外或不可写；原因：…）——这是系统预授权判定，**不是客户拒绝，也不是客户未同意**。不要改写参数或重复调用本工具重试：边界外写入不会因重试而获准。请如实告知客户该写入被系统预授权拒绝……」 |

`confirmed:true` 保留为技术凭据（既有「唯一凭据」契约不变），但来源明确标注为系统预授权。

## 分流顺序（关键）

`declined` 分支的判定顺序改为：

1. `system:` 前缀 → 系统预授权拒绝回执（**先于** `notPresented`）；
2. `notPresented:true` → 既有「治理确认卡未发出」回执（真实发卡缺项：judge/编排来源，逐字不变）；
3. `judge:` 前缀 → 既有 judgeDeclined 回执（逐字不变）；
4. 其余 → 既有 `notConsented`「客户拒绝」回执（逐字不变）。

桌面系统拒绝也带 `notPresented:true`，因此必须按 `operatorId` 先识别；否则会落进「卡未发出/请补齐后重新调用」，
与「边界判定失败、重试无效」的真实原因相悖。真实「未呈现」（如治理角色缺 `flowId`/`cardKind`，来源为 judge
或无 `operatorId`）仍走第 2 步，既有语义完整保留。

`answered` 分支保持 judge 代批判定在最前（系统结算不带 `judge` 字段，互不相交），随后才是 `system:` 前缀与
既有客户「客户已确认」回执。`request_choice` 不做系统分流（写入预授权只结算 `kind:"confirm"`）。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/provider/runtime/tools.ts` | 新增 `isSystemOperator`；新增 `systemPreauthorizationAccepted` / `systemPreauthorizationDeclined` 两个回执构造；`makeRequestConfirmationTool` 的 declined 分支按 system → notPresented → judge → 客户排序，answered 分支在 judge 之后加 system 放行；函数 JSDoc 补充 `system:` 语义。 |
| `src/model/runtime.ts` | `CustomerInputOutcome` 增一条 JSDoc：`operatorId` 前缀约定（`judge:` 判断代批 / `system:` 系统裁决 / 其余客户或旧通道），**无字段形状变化**。 |
| `test/runtime-core/tools.test.ts` | 新增 1 例：system 放行措辞（不是客户确认、保留 `confirmed:true`）、system 拒绝措辞（不是客户拒绝/未同意、无「卡未发出/请补齐/重新调用」、明确不因重试获准）、客户 answered/declined 逐字回归、真实 notPresented 仍走「卡未发出」。 |
| `角色卡/运行时核心/docs/feature/runtime-core.md` | 记录 system 回执行为与分流顺序。 |
| `角色卡/运行时核心/feature-map.md` | 新增导航行与证据链接。 |
| `角色卡/运行时核心/memo.md` | 追加本轮实施摘要。 |

## 明确不做 / 未覆盖

1. 不改 `app/**`（桌面的预授权结算形状已由桌面属主落地，本层只消费 `operatorId`/`notPresented`）；不改编排
   `run-role.ts` 的账本归因（该文件已由编排属主并行加入 `system-preauthorization` 证据分支）。
2. 不给 `request_choice`、`propose_recovery` 等其它回执加 `system:` 分支：本次没有系统生产者结算这些卡；
   若未来出现，需各自按同一前缀约定补回执与测试。
3. 不新增 `CustomerInputOutcome` 字段、不改 `notPresented` 类型；没有扩大任何写权或放行条件。
4. 未跑真实模型/凭据/网络，未做独立验收；本机为 Windows 11。

## 跨角色核对（只读观察，未改）

- **桌面**：`app/desktop/write-preauthorization.ts` 已定义 `WRITE_PREAUTHORIZATION_OPERATOR_ID = "system:write-preauthorization"`，
  `customer-input.ts` 的接受/拒绝结算形状与本层匹配（拒绝带 `notPresented:true`）。桌面无需要同步的文案改动；
  其 `operator.test` 已钉住结算形状。桌面若未来更换 `system:` 之外的标识，本层将回落客户语义。
- **编排**：`src/pipeline/orchestration/run-role.ts::recordCustomerDecision` 已并行实现 `system:` 分流
  （接受写 `decisionEvidence.kind:"system-preauthorization"`、不写 `decisionKind`；拒绝不写 `customer.decision`），
  `governance-ledger.ts` 已有对应最小校验。本层无需再改；两者在最终候选上应联合回归。

## 验证（同一候选；本机 Windows 11 / Git Bash）

环境：`Node v24.22.1` / `npm 11.19.1`；工作树
`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`；`HEAD=2a63414`；
未 commit、未 push；工作树同时含其它角色并行改动。

### 新增行为测试

命令（工作树根）：

```text
node --test --test-timeout=60000 --test-force-exit test/runtime-core/tools.test.ts
```

结果：**退出码 0；16 个测试，16 通过，0 失败，0 跳过**（本批新增 1 例，其余 15 例为既有回归）。

### 相关回归

```text
node --test --test-timeout=60000 --test-force-exit "test/runtime-core/**/*.test.ts"
node --test --test-timeout=60000 --test-force-exit test/pi-adapter/customer-input.test.ts
node --test --test-timeout=60000 --test-force-exit test/编排/governance-judge.test.ts
```

| 命令 | 结果 |
| --- | --- |
| runtime-core 全目录 | **310 计 / 303 过 / 3 红 / 4 skip**；3 红均为既有 Windows `symlink EPERM`（`file-write-safety`×1、`session-store`×2），无本批新增红 |
| `test/pi-adapter/customer-input.test.ts` | **21/21 通过**（含失败措辞绝不出现「客户已确认」的既有断言） |
| `test/编排/governance-judge.test.ts` | **82/82 通过**（含「judge 代批不写客户已确认、客户手批文案不变」） |

### 类型检查

```text
npm run typecheck
```

结果：**退出码 0，0 错**。
