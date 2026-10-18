# 四角色治理全自动链路独立端到端验收（离线桩适配器）

- 日期：2026-10-18
- 角色：测试
- 受测：桌面 Interface / 编排 run-role / 门禁与确认制 / 客户交互通道 / 治理判断 driver / 运行时核心 `list_dir`
- 方式：**真实桌面接口 + 真实项目目录 + 脚本化桩适配器 + 假判断模型**；全部离线，不调真实模型、不读 `.env`、不跑凭据。
- 结论：**8 个必测场景 + 1 条四角色全自动闭环全部通过（26/26）**；未发现需要属主修复的实现缺陷。全量 `node --test "test/**/*.test.ts"` → **2938 tests / 2919 pass / 16 fail / 3 skip**，16 红全部为既有环境/他角色在途红，**本批新增红 0**；`npm run typecheck` → **0 错**。

## 1. 新增套件

`test/测试/governance-e2e-auto/`（测试角色自建，独立于实施方测试）：

| 文件 | 内容 |
| --- | --- |
| `fixture.ts` | 真实 trio 项目种子（`.ans/project.json` + pin-backed acceptance + 治理边界文档）；跨多轮脚本化适配器（逐能力位透传）；假判断会话（解析 driver 提示词、真实 `judge_read_file` 后交回 `report_governance_judgement`）；`createDesktopInterface` 测试台（真实 `listProject`/`openRoleSession`/客户通道/判断 driver/listing 刷新） |
| `a-proposal-write-auto.test.ts` | 场景 1：首次新建提案 write 卡（双开关开 ⇒ 0 卡 + `decisionEvidence.kind:"judge"`；空 preview ⇒ 手动回落） |
| `b-proposal-accept-timing.test.ts` | 场景 2：接受提案 ⇒ Convener 先写流程单，落盘后才派 Nominator；缺流程单不派、如实报错 |
| `c-appointment-timing.test.ts` | 场景 3：任命后角色未写出 ⇒ 先派 Nominator `appointment-write`；写卡并刷新 listing 后才派 Convener；始终未写出则停住 |
| `d-dispatch-listing.test.ts` | 场景 4：`role_status`/`dispatch_task` 看到新角色；未任命/未写卡被拒；写卡后受理 + 双类 `dispatch.accepted` |
| `e-switch-matrix.test.ts` | 场景 5：双开关矩阵；accept-quick 不代批；single/su 不启用 |
| `f-acceptance-gate.test.ts` | 场景 6：验收门槛（未全 done / 缺 dispatch / 阻塞 / 未结算 ⇒ manual；全满足 ⇒ 代批） |
| `g-judge-timeout.test.ts` | 场景 7：默认 60s、env 覆盖、超时回落该组原卡（审批组/决策组各一） |
| `h-list-dir.test.ts` | 场景 8：普通角色 `list_dir`；敏感项不列；越界拒绝；`read_file` 遇目录指路 |
| `i-full-chain.test.ts` | 四角色全自动闭环：Liaison 意图 → Rapporteur 提案 → 接受 → Convener 流程 → Nominator 提名 → 任命 → 写卡 → Convener 排程 → `dispatch_task` executor |

方法要点：模型会话外的所有组件都走产品真实实现；判断桩只替换「判断会话的模型」，`required-read`、逐路径机械复核、preview 门槛、验收机械门槛、超时均仍由真实 `createGovernanceJudge` driver 产生，因此「空 preview / 验收未完成 / 超时」的 manual 回落不是桩函数伪造。

## 2. 逐场景结果

1. **首次新建提案 write 卡**：Rapporteur 对尚不存在的 `docs/proposals/flow-a-v1.md` 发起 `cardKind:"write"` 确认；双开关开 + 判断桩 allow ⇒ presenter 0 次、judge 结果行 1 条、文件落盘；账本 `customer.decision` 带 `decisionEvidence.kind:"judge"`、`actorRoleId:"rapporteur"`、`paths:[proposal]`。空 preview 变体：driver 机械门槛回落（`path-unverified`），原卡带 `judgeNotice`，无 judge accepted 决定，客户手拒后收尾。
2. **接受提案时序**：`proposal accept` ⇒ 后台先开 Convener 并投「请先写流程单」；Convener 本轮 settle 且 `docs/flows/flow-a.md` 落盘后才开 Nominator，任务文案带「流程单已落盘于 …」；缺流程单 ⇒ 不派 Nominator、`advanceGovernanceFlow` 返回 `dispatched:true, ok:false`、系统行「自动推进停住」，不循环。当前 pane 不变（不带 target 的消息仍落 Rapporteur）。
3. **任命后时序**：`appointment`（targetRoleIds=["executor"]）时 `角色卡/executor/` 不存在 ⇒ 不派 Convener；先后台派 Nominator `appointment-write`，写卡后 listing 刷新、executor 可枚举，才派 Convener。始终未写出 ⇒ 返回「角色卡/边界仍未写出（executor 未枚举到）」，不派 Convener、只派一次写卡任务。账本：appointment / appointment-write 均为 judge 证据；app 派发顺序 nominator → convener。
4. **派发**：未任命（目标存在但无 appointment 决定）⇒ 治理门禁拒绝；未写卡 ⇒ 「不在本项目」；写卡后 `role_status` 刷新可见 executor，`dispatch_task` 受理并自动开启 executor 会话；账本同时有 `dispatch.accepted{actor:"app", power:"app", trigger:"customer-decision", target:"convener"}` 与 `dispatch.accepted{actor:"convener", power:"schedule", stepId:"impl", target:"executor"}`。
5. **双开关矩阵**：都关 = 原卡、判断 0 次；仅 approval = write/appointment-write/schedule-write 代批、decision 族原卡；仅 decision = proposal/appointment/acceptance 代批、写盘族原卡；都开 = 六类全自动且每张一条结果行；accept-quick 经真实 driver 回落原卡；`governanceModel:"single"`（su 路径）即使双开关开也不判断、不代批。
6. **验收门槛**：步骤 pending、缺 `dispatch.accepted`、步骤 blocked、存在未结算决定（`unclassified`/`customerDecision:"none"`）四种情况均 manual 原卡 + `judgeNotice`、0 结果行；全 done + 每步 dispatch.accepted + 无未结算 ⇒ 0 卡、验收决定带 judge 证据。
7. **判断超时**：`resolveGovernanceJudgeTimeoutMs` 默认 60000；env `ANS_GOVERNANCE_JUDGE_TIMEOUT_MS` 覆盖（含 trim）；0/负数/小数/非数字/空串回默认；显式选项优先。env=40ms 实测：审批组 write 卡与决策组 proposal 卡均在 ~40–70ms 回落原卡（`judgeNotice` 含「判断超时」「已转你手动确认」），0 结果行，不等待默认 60s。
8. **list_dir**：普通角色工具面含 `list_dir`；根目录列出 `docs/`、`角色卡/`、`src/`，不列 `.env`、`.git`、`.ans`、`secret.pem`、`api-key.txt`；`docs` 下不列 `audit/`；`.ans`/`..`/项目外绝对路径/文件路径/不存在路径分别如实拒绝；`read_file` 读目录提示「请改用 list_dir」；真实项目角色会话内调用成功。
9. **四角色全自动闭环**：Liaison 写意图并 `hand_off_intent` ⇒ 后台 Rapporteur 写提案 + 提案卡 judge 代批 ⇒ Convener 写流程单 ⇒ Nominator 写提名 + 任命卡 judge 代批 ⇒ 应用派 Nominator 写卡 ⇒ listing 刷新后派 Convener ⇒ Convener 更新流程并 `dispatch_task` executor。全程 presenter 0 次；打开顺序 liaison → rapporteur → convener → nominator → executor；账本可还原 intent.handed-off、proposal-accept/appointment/appointment-write（均 `decisionEvidence.kind:"judge"`）、4 条 app `dispatch.accepted`、Convener 派发；executor 可枚举、`project:changed` 触发；只有 Liaison 由客户打开（后台派发不抢活动角色）。

## 3. 旧断言同步（未放宽）

- `test/测试/g4-skill-verify/h-scope-audit.test.ts`：固定工具面清单加入运行时核心新增的只读 `list_dir`（8 项；其余断言原样）。复跑该目录 **50/51**，唯一失败为既有 Windows symlink EPERM（`b-render-double-check`），与本改动无关。
- `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts`、`e-queue-once.test.ts`：`accept` 的下一步由旧契约「nomination/Nominator」同步为现行两段式「schedule/Convener + followUp:"nomination-after-flow"」。
- `test/测试/governance-liaison-verify/d-mirror-advance.test.ts`：同上，更新 `deriveGovernanceNextStep` 的 accept 期望；其余推导/镜像/消息断言未动。

## 4. 全量结果

- 新增套件：**26/26 pass**（`node --test "test/测试/governance-e2e-auto/*.test.ts"`）。
- 受影响旧套件：judge-cards + liaison **77/77 pass**；g4-skill **50/51**（1 条 Windows symlink EPERM 既有环境红）。
- 全量：**2938 tests / 2919 pass / 16 fail / 3 skip**（对账本记录基线 2896/2877/16/3：**测试 +42、通过 +42、失败保持 16、skip 3**；新增 26 例全绿，其余 +16 为并发属主落地用例）。16 红均为既有：Windows symlink EPERM 9、shell 子进程中止时序 1、markdown vendor pin 1、桌面 renderer/runtime-ui 源码钉 5。
- `npm run typecheck`：**0 错**。

## 5. 缺陷与观察

- **未发现需要属主修复的实现缺陷。** 8 个场景与全自动闭环均按客户口径通过。
- 环境限制（非本批引入）：Windows 本机无符号链接创建权限，相关 9 条既有用例 EPERM；本批未改动、未放宽。
- 观察（非缺陷）：治理内置角色每轮 settle 后 `repinIfBootstrapped` 会重写 `.ans/project.json`；若本次写入改变了 pin/角色集（如新写 executor），下一次 `send` 会触发 O-1 会话重建并在模型输入前带一行「会话已因边界更新重建」注记。本批测试按「消息末尾仍属于目标角色」断言，不把该注记当 pane 切换。
- 观察（非缺陷）：内置治理角色 Section 1 目录是预授权写区（如 Rapporteur 的 `docs/proposals/`），write 卡不是其写盘的必要门禁；场景 1 验证的是「卡片发起后判断是否代批」，不把预授权误当第二道审批。

## 6. 复跑

```bash
node --test "test/测试/governance-e2e-auto/*.test.ts"
node --test "test/测试/g4-skill-verify/*.test.ts"
node --test "test/测试/governance-judge-cards-verify/*.test.ts" "test/测试/governance-liaison-verify/*.test.ts"
node --test "test/**/*.test.ts"
npm run typecheck
```

## 7. 边界与证据

- 只改 `test/测试/` 与 `角色卡/测试/` 自有文档；未改 `src/`、`app/`、其他角色测试（judge-cards/liaison 为本角色套件）。
- 全部夹具在系统临时目录内创建并清理；未读 `.env`、未启动真实模型、未使用真实凭据/网络。
- 未 commit / push。
