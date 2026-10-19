---
id: test-evidence-packet-budget-label-fixtures
type: fix
title: 证据包 / 读取预算 / 审批卡标题三批产品改动后的测试夹具同步
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-19"
    kind: created
    summary: 记录判断证据包、shell judge 读取预算新默认、审批卡标题 roleId 三批新契约导致的测试红与夹具同步
  - date: "2026-10-19"
    kind: verified
    summary: 受影响四套件全绿；test/测试 782/779/3/0（3 红均为 HEAD 既有）；typecheck 0
---

# 证据包 / 读取预算 / 审批卡标题三批产品改动后的测试夹具同步

## 症状：哪些用例红了

产品侧同批落了两组新契约（编排的 `DecisionEvidencePacket`、运行时核心的 shell judge 读取预算新默认），
桌面UI 又改了 shell 审批卡标题的函数签名。本角色的旧夹具仍按旧口径构造，实际跑出 9 条红：

- `test/测试/governance-judge-cards-verify`：**43 计 / 38 过 / 5 红**——appointment、写盘三卡、
  acceptance、acceptance 机械门槛、required-read；
- `test/测试/shell-judge-verify`：**36 计 / 33 过 / 3 红**——读取预算耗尽、读取截断，以及
  deny 无替代方案的合成文案；
- `test/测试/su-shell-approval-verify`：**36 计 / 35 过 / 1 红**——D4 渲染源码子串
  `UiLabels.shellConfirmTitle(payload.policy)`；
- `test/测试/governance-e2e-auto`：首次全量跑出现 **30 计 / 29 过 / 1 红**（场景 3 报
  「Crew / 组队 本轮未在时限内结束」），随后连续 3 次全绿，属一次性时序抖动（见文末残余观察），
  不是旧式写盘卡契约问题。

## 根因：新契约与旧夹具哪里对不上

1. **判断证据包（编排 `governance-judge-evidence.ts`）**在调用判断模型前，从盘面机械生成
   `DecisionEvidencePacket`，并 fail-closed 回落手动：
   - 写盘卡的每条声明路径必须在 `request_confirmation` 的 preview 中有**逐路径正文**
     （`## <路径>` 标题/围栏锚点 + 非空正文）；旧夹具只有一行路径声明 ⇒
     `insufficient-evidence`；
   - appointment 卡会**重解析提名文件**的机器可读推荐集并与请求 `recommendedRoleIds` 对账，
     不一致 ⇒ `evidence-conflict`；旧夹具提名文件固定推荐 `project-a`，请求却是 `role-x/role-y`；
   - acceptance/appointment-write 会**重读治理账本**与请求 `facts` 对账；旧夹具没有账本
     （或账本行缺少 `at/kind/actorRoleId/power` 被计为坏行）⇒ `ledger-*-drift` /
     `evidence-conflict`，且验收机械门槛直接挡住；
   - 判断的必读集收窄为系统选定的 0–2 条**定点抽查**（`requiredReadPaths`），不再要求读全部物证。
2. **shell judge 读取预算新默认**从 8 次 / 单文件 64KiB / 总量 192KiB 放宽为
   12 次 / 128KiB / 512KiB（编排 `createShellJudge` 已支持显式 `budget` 注入）。旧用例写死
   「第 9 次被拒」「70KiB 文件截断」，在新默认下自然失配。
3. **shell 审批卡标题** `UiLabels.shellConfirmTitle` 新增第二参数 `roleId`，渲染侧传
   `payload.roleId`（缺省回退当前角色）。旧源码子串断言仍按单参数匹配。
4. **shell 判断定位调整（其他角色在飞改动）**：编排把 shell 判断从「业务必要性」改为「系统风险审查」，
   deny 无替代方案的合成文案从「当前不必要或不安全」改为「存在系统风险或无法确认安全」；
   本角色按新文案同步钉点（属跨角色在飞契约变化，非本批夹具缺陷）。

## 修复后的行为（只改测试夹具/断言，产品代码零改动）

| 文件 | 改动 |
| --- | --- |
| `test/测试/governance-judge-cards-verify/fixture.ts` | 提名默认推荐集改为 `role-x/role-y`；新增 `confirmPreview`（逐路径 `## 路径` + 正文）、`defaultWritePaths`、`writeLedger/clearLedger`；`requestFor` 先定声明路径再生成 preview，保证「路径 ↔ 正文」对齐 |
| `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts` | appointment 各负向子场景把提名文件改成与请求推荐集一致（内置 id / 无推荐集 / 不在选项）；写盘卡与 acceptance 各子场景按声称的 facts 种真实账本（proposal-accept、dispatch.accepted、appointment、clarification）；账本坏行对照改为「真实坏行 + facts 同步」；required-read 的账本行补全必填形状 |
| `test/测试/governance-e2e-auto/fixture.ts` | `cardFor` 的写盘 preview 从「多路径共用一段 `# 正文`」改为逐路径 `## 路径` + 正文（与呈现前完整性闸/证据包同口径） |
| `test/测试/shell-judge-verify/fixture.ts` | `makeJudge` 增加可选 `budget` 并透传给真实 `createShellJudge` |
| `test/测试/shell-judge-verify/c-manual-flow.test.ts` | 预算耗尽用例显式注入 `{ maxCalls: 8 }`（保留「第 9 次被拒 → manual/budget」）；截断用例显式注入 `{ maxFileBytes: 64KiB }`（保留 70KiB → manual/read-truncated）；语义断言零放宽 |
| `test/测试/shell-judge-verify/b-deny-flow.test.ts` | deny 无替代方案的合成文案钉点同步为「存在系统风险或无法确认安全」（仍要求同一句话说明风险与标准出路） |
| `test/测试/su-shell-approval-verify/d-card-data.test.ts` | D4 源码断言同步新签名 `shellConfirmTitle(payload.policy, confirmRoleId)`，并新增 `confirmRoleId` 取值/回退守卫（比原来更严） |

断言强度说明：全部改动是**输入夹具与文案/签名钉点同步**；没有删除用例、没有放宽判据
（写盘正文缺失、推荐集冲突、账本漂移、预算耗尽、截断、卡片标题语义均保持原判定方向）。

## 回归验证（本机真实输出，macOS arm64 / Node v24.14.0）

- `node --test "test/测试/governance-judge-cards-verify/*.test.ts"` → **43 计 / 43 过 / 0 红**；
- `node --test "test/测试/governance-e2e-auto/*.test.ts"` → **30 计 / 30 过 / 0 红**
  （夹具修改后复跑；此前连续 3 次 30/30）；
- `node --test "test/测试/shell-judge-verify/*.test.ts"` → **36 计 / 36 过 / 0 红**；
- `node --test "test/测试/su-shell-approval-verify/*.test.ts"` → **36 计 / 36 过 / 0 红**；
- `node --test "test/测试/**/*.test.ts"` → **782 计 / 779 过 / 3 红 / 0 skip**；
  3 红均为任务书列明的 HEAD 既有：`g2-verify/u1-renderer.test.ts:96`、
  `g5-reasoning-verify/g-desktop.test.ts:65`、`t29-pi-config-roundtrip.test.ts:273`，
  本批新增红 **0**；
- `npm run typecheck` → **exit 0（0 错）**。

## 没做 / 限制 / 残余观察

- 未改任何产品代码，未 git 提交；全部离线（无真实模型/凭据/网络）。
- `governance-e2e-auto` 首跑场景 3 的一次性失败（`waitForRoleIdle` 会话条目消失导致
  「本轮未在时限内结束」）在后续 4 次运行（含夹具修改后）均未复现；未改该用例断言。
  若后续复现，需按「后台会话被释放/LRU 竞争」方向排查产品侧时序，而不是放宽断言。
- 本批未覆盖真实 Electron/真机审批卡标题的视觉复核（桌面UI 的纯映射与接线守卫已绿）。
