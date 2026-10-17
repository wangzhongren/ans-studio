---
id: su-shell-approval-verify
type: change
title: 2026-10-17 su 的 run_shell 审批策略独立验证报告（测试角色）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: verified
revision: 1
related: [su-shell-approval-review]
events:
  - date: "2026-10-17"
    kind: verified
    summary: su 命令审批策略独立验证完成——整体通过（0 不通过 / 6 备注）；自建 36 例闸层/装配/桌面/卡片/零执行套件全绿＋离线 Electron 卡片探针 9/9；全量 2215/2120/93红/2skip（红数 93 与组成不变）；typecheck 85 错全为既有依赖缺件；同步 2 个因并发批准变更而滞后的本角色测试值钉（Pi 面板键 5→6、角色状态「上一轮终局」措辞）
---

# 2026-10-17 su 的 run_shell 审批策略独立验证报告（测试角色）

**验证对象**：工作树中**未提交**的 su 命令审批策略实现——编排（`shell-gate.ts` 的
`operatorOnly`/`approveDeny`/分支/守卫、`shell-arming.ts::assembleOperatorShellGate`、
`run-role.ts::shellOperatorOnly` su-only 与互斥、`operator-channel.ts` CLI 模式文案）、门禁引擎
（`BUILT_IN_ROLE_CARD_TEXT` 命令纪律）、桌面窗口（`session.ts` su 注入、`operator-channel.ts`
tier/policy/plain reason）、桌面UI（SU 卡片标题/档位/原因/警告/默认拒绝）。
批准口径＝客户 2026-10-17「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」；
PM 评审＝[`2026-10-17_design_su-shell-approval-review.md`](../../../项目管理/docs/design/2026-10-17_design_su-shell-approval-review.md)。

**整体结论：通过（0 项不通过；6 项备注/未覆盖边界，均如实列明）。**

独立用例＝[`test/测试/su-shell-approval-verify/`](../../../../test/测试/su-shell-approval-verify/)
（**36 例** 5 个用例文件＋1 夹具）＋离线 Electron 卡片探针 `card-probe.mjs`（**9 项断言**）。
**独立构造**：自建临时项目/分类器/operator 桩/内存审计 sink；不 import 实施方测试；**不跑破坏性命令**
（零执行哨兵只用 `process.execPath -e` 在临时目录写哨兵文件；无 `sh -c`/`rm`）。真机看卡/批准/拒绝由
客户本人执行，本报告不代跑、不使用凭据/网络。证据目录
[`2026-10-17-su-shell-approval-verify-evidence/`](2026-10-17-su-shell-approval-verify-evidence/)。

---

## ① 冻结绑定

- HEAD＝`b64d619`（branch `main`）；本轮实现未 commit。
- 冻结集＝本轮 11 个实现文件＋4 个属主测试＋本批 6 个文件＋2 个同步测试，
  `sha256-freeze.txt` **24/24** 逐字节一致。
- 关键指纹（sha256 前 16）：

| 文件 | sha256（前 16） |
|---|---|
| `src/common/编排/shell-gate.ts` | `dcea829de09c50e9` |
| `src/pipeline/orchestration/shell-arming.ts` | `6ac2f9f5770b8110` |
| `src/pipeline/orchestration/run-role.ts` | `fbdaf57e0f075b12` |
| `src/common/门禁引擎/boundary-core.ts` | `460e88fdeabff9fd` |
| `app/desktop/session.ts` | `a29c84a00e699232` |
| `app/desktop/operator-channel.ts` | `8e99db16d1097bb7` |
| `app/renderer/renderer.js` | `9fcbf68dbc9c5a0c` |
| `app/renderer/ui-labels.js` | `270a1dcb29acc3b3` |

## ② 逐项验收（PM 评审 §5）

### 2.1 闸层判定（A 套件 18 例）

| 场景 | 结果 | 事实 |
|---|---|---|
| allow | **通过** | operator **0 次**；allowed；branch `c-allow`；by `ruleset:<id>（su 审批档）`；审计含 command 原文/argv/cwd/branch/by/`conditions:["shell-gate"]`/`execution:"未执行"` |
| risky × 批准/拒绝/不可用/超时 | **通过** | 各恰 1 次请求；批准→allowed `c-risky→a-allow`；拒绝/不可用/超时→deny，branch 对应 `a-deny`/`a-unavailable`/`a-timeout`，reason 可辨 |
| review × 四结果 | **通过** | 同上，branch `c-review→a-*` |
| deny（approveDeny=true）× 四结果 | **通过** | 同上，branch `c-deny→a-*`（原硬拒可被客户批准） |
| deny（approveDeny=false） | **通过** | 既有硬拒 `c-deny`，**0 次请求**（回归） |
| 构造守卫 | **通过** | `readonlyOnly+operatorOnly`、`approveDeny` 无 `operatorOnly`、无通道、带 `pmAsk`/`routineShellPolicy` 全部抛错（fail-closed） |
| 规则集加载失败 / 分类器抛错 | **通过** | 一律拒绝；branch `ruleset-load-failed` / `classify-error`（不因审批档放行） |
| 旧只读档回归 | **通过** | risky/review → `readonly-deny`、deny → `c-deny`；0 卡；by 仍为「（su 只读档）」 |
| `renderSuApprovalReason` | **通过** | 前缀 `su-审批档[tier]`、detail 逐字进入、写边界风险披露固定文本、无「项目角色不受影响」 |

### 2.2 装配与 run-role（B 套件 4 例）

- `assembleOperatorShellGate`：allow 0 卡；risky 出卡；审计落 sink；缺 classifier/rules → 拒绝；
  无通道 → **装配抛错**。
- `openRoleSession`：su + `shellOperatorOnly` → arm 并可按 allow 直放；**项目角色误传 → 不 arm**；
  与 `shellReadonly` 同时给出 → **不 arm**；装配失败 → 不 arm（能力缺席 = fail-closed）。
- **type 面守卫**：`AssembleOperatorShellGateOptions` 不含 `pmAsk`/`pmRoleId`/`openSession`/
  `sessionDeps`/`routineShellPolicy`（源码字面核对）——su 不自审、客户审批不可被绕过。

### 2.3 桌面注入（C 套件 2 例）

- su：收到 `shellOperatorOnly`（含同一份 `classifyShell`/`rules` + 每会话闭包 `operatorChannel`）；
  **不再收** `shellReadonly`；顶层 `shellOperatorChannel` 不并走三层链。
- 项目角色：仍收 `shellOperatorChannel` + `shellArming`，`shellOperatorOnly` 恒 undefined（三层链不变）。
- 缺 `shellArming` 或缺 `shellOperatorChannel` ⇒ su **不传** `shellOperatorOnly`（不 arm）。

### 2.4 卡片数据与渲染（D 套件 6 例＋Electron 探针 9 项）

- 档位解析只认行首 `su-审批档[tier]`；`deny` 不被后缀 `/risky/` 抢占；项目角色文案恒 `null`。
- `buildShellConfirmRequest`：`tier`/`policy` 正确；命令原文/cwd/reasonRaw 逐字；三档 plain reason
  均含「逐条客户批准」「拒绝/超时/通道不可用 = 拒绝」「可能绕过 ANS 文件写边界」，档位名分别为
  「风险命令（risky）」「未自动判定（review）」「硬拒类（deny）」。
- UI 纯映射：SU 标题「SU 命令审批」/项目标题「shell 命令请求」；未知档位不编造。
- 渲染源码：必备警告逐字在位；`$("sc-deny").focus()`（拒绝为默认焦点）；标题/档位/可见命中原因接线；
  卡片块**无**「已获准/已批准执行」正向措辞。
- **离线 Electron 探针 9/9**（真实 renderer+preload+受控 IPC）：
  SU 卡标题/`is-su-approval`/档位标签/命令原文/plain reason+可见「命中原因：reasonRaw」/
  必备警告/默认焦点＝拒绝；**Esc 回传 `allow:false`** 且卡片收起；项目角色卡保持旧标题、
  无 SU 警告、无档位标签、默认焦点仍为拒绝。
- 内置角色卡「命令纪律」段：免审批/逐条批准/不走 pm/不得说已获准/写边界披露齐备；
  不含「rm -rf 属 deny」错误表述。

### 2.5 真实 gate + 真实 run_shell 的零执行哨兵（E 套件 6 例）

| 场景 | 结果 |
|---|---|
| deny（真实规则 `node -e`）批准 | **真实执行并产生哨兵**；审计 `c-deny→a-allow` |
| deny 拒绝 / 不可用 / 超时 | **哨兵不存在**；审计 `c-deny→a-deny` / `a-unavailable` / `a-timeout` |
| risky（测试分类器）批准 / 拒绝 | 批准执行产生哨兵 / 拒绝零执行；branch 对应 |
| review（不存在的程序）批准 | 判定已放行（审计 allow），**spawn 失败如实返回**（不假成功） |

全部命令均在系统临时目录、以 `process.execPath -e` 写哨兵；未使用 `sh -c`/`rm`/网络/凭据。

## ③ 全量与 typecheck

| 命令 | 上一轮（渲染轮） | 本轮终态 |
|---|---|---|
| `node --test "test/**/*.test.ts"` | 2153 / 2058 pass / 93 fail / 2 skip | **2215 / 2120 pass / 93 fail / 2 skip** |
| `npm run typecheck` | 85 错 | **85 错**（本批/同步文件 0 错） |

- **红数 93 与组成不变**：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1（详见
  `full-suite-summary.md`）。+62 测试 = 本批 36 + 并发属主 26。
- 过程中曾出现 2 条新红，均为**并发已批准变更**导致的本角色值钉滞后，已同步（非产品缺陷）：
  1. `t29-pi-config-roundtrip.test.ts`：Pi 滑块批次（`b64d619`）新增 `ANS_PI_PROMPT_TIMEOUT_MS`
     → 面板键钉 **5→6**（3 必填 + 3 可选）。
  2. `g2-verify/r1-desktop-datasource.test.ts`：桌面角色状态呈现消歧（2026-10-17 实机反馈；
     busy 时写「上一轮终局（不表示当前轮）」）→ 断言接受两种如实措辞并校验消歧句。

## ④ 未覆盖项、备注与原因

1. **真机看卡/批准/拒绝**：按口径由客户本人执行；测试角色只用桩通道与临时目录。
2. **F-7 前置拒绝不出卡**：未加引号的变量/操作符在 gate 之前被拒绝，属 argv-noshell 执行模型
   （PM 评审 §六-8 已登记）；本轮未改 F-7。
3. **deny 面可批准范围**：`sudo`/`mkfs`/LOLBin 等也在可批准面（客户明确「deny 也走客户审批」）；
   本报告如实登记，未擅自保留 `never-approve` 子集（评审 §七-2 的待确认项仍成立）。
4. **审计失败不翻转判定**：既有语义（本轮未改）；获批命令在审计落盘失败时仍执行。
5. **跨进程/多窗口**：无关本轮；审批卡按会话轮次 signal 失效（既有机制）。
6. **`ANS_PI_PROMPT_TIMEOUT_MS` 与 500k 等 Pi 变更**：属并发属主批次，本轮仅同步测试值钉；
   不改变 su 审批结论。

**未发现需要返工的真实缺陷。**

## ⑤ 权限边界审计

- 本轮实现/测试改动均在属主 `boundary.yaml` 内（编排：`shell-gate.ts`/`operator-channel.ts`/
  `shell-arming.ts`/`run-role.ts`/`test/编排/`；门禁引擎：`boundary-core.ts`/`test/门禁引擎/`；
  桌面窗口：`session.ts`/`operator-channel.ts`/`interface.ts`/`test/桌面应用/`；
  桌面UI：`app/renderer/`/`test/桌面应用/renderer.test.ts`）。
- 本角色新增/同步仅 `test/测试/` 与 `角色卡/测试/`；未改产品代码、他角色文件或客户项目。

## ⑥ 复跑方式与证据

```bash
node --test "test/测试/su-shell-approval-verify/*.test.ts"     # 36 例
node_modules/.bin/electron test/测试/su-shell-approval-verify/card-probe.mjs  # 卡片探针
node --test "test/**/*.test.ts"
npm run typecheck
```

证据：`verify-suite-output.txt`（36/36）、`card-probe-output.txt` + `card-probe-report.json`（9/9）、
`full-suite-summary.md`（2215/2120/93/2 与归因）、`sha256-freeze.txt`（24/24）。
