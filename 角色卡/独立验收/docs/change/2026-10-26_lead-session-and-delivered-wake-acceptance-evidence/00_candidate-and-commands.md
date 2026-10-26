# 候选身份与本角色独立复核命令（证据索引）

- 验收报告：`../2026-10-26_lead-session-and-delivered-wake-acceptance.md`
- 复核时间：2026-10-26 16:01–16:08（Asia/Shanghai；独立复跑于 16:02–16:07）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`
- 分支：`feat/scaffold-first-governance`；HEAD：`9de56d4`（验收期间未变）
- 候选状态：未提交工作树。10 个 tracked 修改 + 2 个未跟踪文档（change 记录与证据目录）。`.claude/`、`demos/` 未跟踪但属其他任务，不在本候选范围。
- 平台：Windows 11 Pro 10.0.26300（win32 x64）；Node v24.22.1；npm 11.19.1。

## 1. 候选文件 SHA-256（复核前后一致）

| 文件 | SHA-256 |
| --- | --- |
| `app/desktop/session.ts` | `1989d051b4837143bc6b50e8e0bf095eb73f90b2a877faa8fad186ca2f840b16` |
| `app/desktop/interface.ts` | `f8d87a76c2c137817460b34762bdfa650116528af6d9e3f00482d13e18993ce9` |
| `test/桌面应用/session.test.ts` | `196df104cada61f2e74478be44fc64de5da9e61362cc2a2190f4e77aa49a0a94` |
| `test/桌面应用/queue-withdraw-lru.test.ts` | `bcf92cad4fcfb80cc40360c7d274edb9634124cac984ced266e0106dff152e88` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `fc30dde964cbe69db3d4c9d2a5014dd28a77feba97a6e2066cb897e57d160407` |
| `角色卡/桌面窗口/docs/change/2026-10-26_change_lead-session-and-delivered-wake.md` | `b1ccd583405a55e85f1a17988243e3fc288bc5ba8dc11873823aa1dc00434e2d` |

差异摘要：`git diff --stat` = 10 文件 +373/−89（含角色文档）；代码与测试 5 文件 +364/−84。
`git diff | sha256sum`（复核时快照）= `df9c2e73f0359c0cc12536021a55194385bca5a0262fa9c47a3b8a6924863395`。

## 2. 本角色独立复核命令与结果（原始输出见本目录 `*.txt`）

| # | 命令 | 退出码 | 结果 | 输出文件 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | 无诊断 | `typecheck.txt`（SHA-256 `aee16865…`） |
| 2 | `node --test "test/桌面应用/session.test.ts"` | 0 | 40/40 pass，0 fail，0 skip | `session-test.txt`（`b7734834…`） |
| 3 | `node --test "test/桌面应用/queue-withdraw-lru.test.ts"` | 0 | 5/5 pass，0 fail，0 skip | `queue-withdraw-lru-test.txt`（`c73b53ff…`） |
| 4 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | 0 | 74/74 pass，0 fail，0 skip | `acceptance-dispatch-test.txt`（`287a384b…`） |
| 5 | `node --test "test/桌面应用/interface.test.ts"` | 0 | 137/137 pass，0 fail，0 skip | `interface-test.txt`（`d14242e5…`） |

说明：按交接要求，本角色**不代跑全量测试**；上述 2–5 是为把原始证据绑定到当前源码快照（见报告 §四.2 时间戳发现）而做的**定向复跑**，不是替代实现/测试角色的批次证据。桌面全目录 `651/651` 未由本角色复跑。

## 3. 实现方原始证据（`角色卡/桌面窗口/docs/change/2026-10-26-lead-session-and-delivered-wake-evidence/`）

| 文件 | 声明结果 | SHA-256 | 本角色核对 |
| --- | --- | --- | --- |
| `typecheck.txt` | exit 0 | `aee16865…` | 文件只有 npm 横幅（无显式退出码）；独立复跑 exit 0 |
| `session-test.txt` | 40/40 | `18a5544b…` | 计数一致；生成（15:43）**早于**源码最后修改（15:48:33），见报告 §四.2 |
| `queue-withdraw-lru-test.txt` | 5/5 | `583ecb3c…` | 计数一致；同为修改前证据 |
| `acceptance-dispatch-test.txt` | 74/74 | `7aee07ea…` | 计数一致；同为修改前证据 |
| `interface-test.txt` | 137/137 | `17b245e3…` | 计数一致；生成（15:45）**早于** interface.ts 最后修改（15:48:33） |
| `desktop-suite.txt` | 651/651 | `ed87fca8…` | 计数一致；生成时间早于源码最后修改，未由本角色复跑 |
| `governance-e2e-auto.txt`（首跑） | 154/155，T2 fail | `63846388…` | 失败形态与 change 记录自述一致（actual `failed` vs expected `dispatched`） |
| `governance-e2e-auto-rerun.txt` | 155/155 | `e8fe80f5…` | 生成于源码最后修改之后（15:51 > 15:48） |
