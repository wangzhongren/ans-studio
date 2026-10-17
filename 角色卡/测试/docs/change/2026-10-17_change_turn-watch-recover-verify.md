---
id: turn-watch-recover-verify
type: change
title: 2026-10-17 到点检查 + 1 小时兜底独立验证报告（测试角色）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: verified
revision: 2
related: [turn-watch-and-recover-review]
events:
  - date: "2026-10-17"
    kind: verified
    summary: 到点检查＋1 小时兜底独立验证完成——核心验收项全部通过（到点不中止/每轮一次/1h 兜底可区分/非整轮时限不变/设置/su 卡/role_status/恢复确认/零执行）；自建 15 例套件全绿＋同步本角色 3 个旧断言（t1/w1/scope-audit）；全量 2245/2144/99红/2skip；发现 1 项功能性偏差（非 Pi runtime 未读检查时限 env）与 2 项文案/建议偏差，均列属主、未修
  - date: "2026-10-17"
    kind: reverified
    summary: 三项偏差已由属主修复后复审——①非 Pi runtime 同读 ANS_PI_PROMPT_TIMEOUT_MS（pi/claude/codex 均 60000）；②设置 help 补齐「仍在推进则不动作」「留空＝系统默认（5 分钟）」；③turn-deadline 解除不再投「看护恢复」行（仅诊断）。本角色同步 w1 身份更替用例；独立套件 15/15、w1 14/14；全量 2246/2150/94红/2skip（桌面窗口 5 条旧红全部消失；94＝既有 93＋Codex 缺 MCP SDK 1 条环境红）；typecheck 85 不变；冻结复算 21/21
---

# 2026-10-17 到点检查 + 1 小时兜底独立验证报告（测试角色）

**验证对象**：工作树中的「整轮不设超时——到点看护检查 + 1 小时最后兜底」实现（运行时核心、Pi/Claude/Codex
适配器、服务运行时、桌面看护/`role_status`、编排看护文案、门禁 su 卡、PM 设置元数据）。
批准口径＝客户 2026-10-17「整轮不应该有超时，应该是到了时间，su 要去看下是否卡死了…」＋「保留 1 小时兜底」；
PM 评审＝[`2026-10-17_design_turn-watch-and-recover-review.md`](../../../项目管理/docs/design/2026-10-17_design_turn-watch-and-recover-review.md)。

**整体结论：通过（三项偏差已由属主修复并复审；剩余 94 红全部为既有环境红 + Codex 新用例缺 MCP SDK）。**

**复审（reverified）**：① 非 Pi runtime 同读检查 env（实测 three runtimes 均 60000）；② 设置 help 补齐
「仍在推进则不动作」「留空＝系统默认（5 分钟）」；③ `turn-deadline` 解除不再投「看护恢复」行（仅诊断）。
独立套件 15/15、本角色 w1 14/14；全量 **2246/2150/94红/2skip**（上一轮 5 条桌面窗口旧红全部消失；
94＝既有 93＋Codex 缺 MCP SDK 1 条环境红）。证据见 `reverify-*`。

独立用例＝[`test/测试/turn-watch-verify/`](../../../../test/测试/turn-watch-verify/)（**15 例** 4 个用例文件＋夹具），
**全部自建**（看护 rig/挂起 provider/SessionManager 句柄/桩恢复能力），不 import 实施方测试；
不真等 1 小时、不跑真实模型/破坏性命令。证据目录
[`2026-10-17-turn-watch-recover-verify-evidence/`](2026-10-17-turn-watch-recover-verify-evidence/)。

---

## ① 冻结绑定

- HEAD/worktree：本轮实现未 commit；冻结集 21 条目（13 实现 + 本批/同步 8 测试），
  `sha256-freeze.txt` **21/21** 逐字节一致。
- **复审绑定**：三项偏差修复后重新冻结——`reverify-sha256-freeze.txt`（21/21，2026-10-17）；
  本报告 §④/§⑤ 的复审结论绑定该冻结。

| 文件 | sha256（前 16；复审后） |
|---|---|
| `src/common/runtime-core/timeout.ts` | `50f288735c69f724`（全运行时读 env） |
| `src/service/runtime/session.ts` | `61c6b33ea535b8d6` |
| `app/desktop/watchdog.ts` | `ce6adf0a5491cde9`（turn-deadline 解除仅诊断） |
| `app/desktop/session.ts` | `0d35db1969a22e96` |
| `src/common/编排/watchdog.ts` | `e7a3cfb870c91926` |
| `src/common/门禁引擎/boundary-core.ts` | `a221a25b8382641a` |
| `src/common/shared/runtime-settings.ts` | `538be0a1622323a0`（help 补齐） |

## ② 逐项验收（PM 评审 §5）

| # | 项 | 结果 | 独立证据 |
|---|---|---|---|
| 1 | 到点**不中止** | **通过** | A1/A5：检查时限（默认 300000）到点仅投 1 条「轮次到点检查」；文案含「到点仅检查、不中止本轮」「仍在推进则不动作」「propose_recovery」「客户确认后应用执行」「最后兜底」；无「逼近超时/已超时/硬超时/剩余量」。B1：服务层注入 `promptTimeoutMs:40` + `turnLastResortMs:300`，100ms 时零 settled、provider 未被 abort |
| 2 | 每轮一次 | **通过** | A1：2× 检查时限仍 1 条；下一轮（新 turnId）独立再检查 |
| 3 | 没卡死不动作 | **通过** | D1：到点检查消息不触发任何恢复能力（能力调用 0 次）；工具文案「仍在推进则不动作」 |
| 4 | 卡死才提议 + 客户确认 | **通过** | D1：`propose_recovery` 未确认 ⇒ `ok:false`「未获执行/客户未确认」，能力未执行；确认 ⇒ `ok:true`「客户已确认…已执行」；D2：非法动作/无证据不触达能力 |
| 5 | 1 小时兜底 | **通过** | B1：`turnLastResortMs=300` 到点才中止；settled `outcome=timed_out`、摘要含「最后兜底」且不含「到点检查」；send 拒绝文案含「本轮最后兜底 超时（300ms）」；B2：确认卡挂起 2× 时限不中止，解除后到点 |
| 6 | 非整轮时限不变 | **通过** | B3：shell 600000、shell 审核/确认 120000、构造 120000 |
| 7 | 设置 | **通过（复审后）** | C2：label「看护检查时限」、档位 1/2/5/10/15/30、默认标签「系统默认（5 分钟）」、`control/range`、`integer{min:1000}`、1 小时兜底不暴露；help 含「不中止本轮 / 仍在推进则不动作 / 1 小时为最后兜底 / 留空＝系统默认（5 分钟） / 下一次开启会话时应用」 |
| 8 | 看护排除 | **通过** | A3：挂起确认卡不报、解除后按真实已耗报；A4：su 自身忙抑制 su、项目角色照报 |
| 9 | 跨运行时 | **通过（复审后）** | C1：三 runtime 默认检查 300000/兜底 3600000/构造 120000，且**均读** `ANS_PI_PROMPT_TIMEOUT_MS`（60000 → 三 runtime 均 60000）；C5：三适配器 + 服务整轮均接 `turnLastResortMs` |
| 10 | 回归 | **通过（本角色边界）** | 本角色同步 3 个旧断言后全绿（见 §③）；全量 99 红无本角色新增（详 §⑤） |
| 11 | 真机 | **未运行（客户）** | 检查时限设 1 分钟的长轮次观察由客户执行；1 小时兜底由确定性注入验证（不等 1 小时） |

补充：C3 su 卡「看护职责」含到点检查/不是超时/不会中止/仍在推进不动作/只有确认卡死才
`propose_recovery`/客户一键确认/1 小时最后兜底/唯一自动整轮上限/自身没有到点检查；无旧措辞。
C4 `role_status` 当前轮行含「看护检查时限 5 分 0 秒」「1 小时最后兜底」，无「硬超时」。

## ③ 本角色旧断言同步（`test/测试/`）

| 文件 | 旧断言 | 新语义 | 结果 |
|---|---|---|---|
| `t1-pipeline-integration.test.ts` | `promptTimeoutMs` 期待整轮到期（4 条红/挂起） | 改 `turnLastResortMs: 100/30`；settled 摘要断言「最后兜底」 | **8/8 通过** |
| `g2-verify/w1-signals.test.ts` | 90%「轮次逼近超时」 | 100%「轮次到点检查」；`TURN_LIMIT=300000`、`RATIO=1.0`；断言不中止/旧措辞零命中 | **14/14 通过** |
| `g2-verify/scope-audit.test.ts` | `TURN_DEADLINE_RATIO===0.9` | **1.0**（客户 2026-10-17 到点检查） | 通过 |

## ④ 偏差与复审（全部已由属主修复）

1. **【功能性，已修复】非 Pi runtime 不读检查时限 env**。
   复审后 `resolveRuntimeTimeouts` 对所有运行时读 `ANS_PI_PROMPT_TIMEOUT_MS`：
   实测 `env={ANS_PI_PROMPT_TIMEOUT_MS:"60000"}` → pi **60000**、claude **60000**、codex **60000**
   （`reverify-cross-runtime-env.txt`）。本批 C1 已加断言。
2. **【文案，已修复】设置 help 补齐**「仍在推进则不动作」「留空＝系统默认（5 分钟）」；C2 断言通过。
   （与评审 §3.3 仍为同义表述：使用「治理角色」而非「su」、分号/「单位 ms」顺序不同——语义齐备，
   不再作为偏差。）
3. **【建议，已采纳】`turn-deadline` 解除不再投「看护恢复」行**（仅诊断 `watchdog.recovery`）；
   A1 与本角色 w1 身份更替用例断言零恢复行。
4. **【文案差异，保留】服务 settled 摘要**为「本轮超过最后兜底，已中止」（评审建议含「1 小时」）；
   与到点检查可区分，验收项满足。备注。

## ⑤ 全量与 typecheck

| 命令 | 初始验证 | 复审（三项修复后） |
|---|---|---|
| `node --test "test/**/*.test.ts"` | 2245 / 2144 pass / 99 fail / 2 skip | **2246 / 2150 pass / 94 fail / 2 skip** |
| `npm run typecheck` | 85 错 | **85 错**（本批/同步文件 0 错） |

复审后 94 红 = **既有 93**（依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）
＋ **Codex适配器新增用例 1 条**（`@modelcontextprotocol/sdk` 未安装——环境缺件）。
上一轮新增的 **5 条桌面窗口属主测试红全部消失**（属主已用显式注入同步）；
本角色边界内**无新增红**（turn-watch 15/15、t1 8/8、w1 14/14、scope-audit 通过）。

## ⑥ 复跑方式与证据

```bash
node --test "test/测试/turn-watch-verify/*.test.ts"   # 15 例
node --test "test/测试/t1-pipeline-integration.test.ts"
node --test "test/测试/g2-verify/w1-signals.test.ts"
node --test "test/**/*.test.ts"
npm run typecheck
```

证据：`verify-suite-output.txt`（15/15）、`cross-runtime-env-deviation.txt`（修复前：claude/codex 300000）、
`full-suite-summary.md`（初始 2245/2144/99/2 与红数归因）、`sha256-freeze.txt`（21/21）。

**复审（reverified）证据**：`reverify-verify-suite-output.txt`（15/15）、
`reverify-cross-runtime-env.txt`（修复后三 runtime 均 60000）、
`reverify-full-suite-counts.txt`（2246/2150/94/2；5 条桌面旧红消失）、
`reverify-summary.md`（三项修复与复审结论）、`reverify-sha256-freeze.txt`（21/21）。
