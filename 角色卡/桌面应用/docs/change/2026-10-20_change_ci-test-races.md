---
id: ci-test-races-v140
type: change
title: v1.4.0 CI 两处测试竞态修复（验收派发 / macOS 临时目录清理；含第二轮夹具凭据隔离）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented-unverified
related: [su-handback-acceptance, session-restore]
events:
  - date: "2026-10-20"
    kind: fixed
    summary: 修复 test/桌面应用/interface.test.ts 验收派发用例的「场景返回后提前取 verifier 数组」竞态；重复 settle 改为 400ms 有界稳定窗口观察；pending/blocked 用例改为先等收尾门阻塞系统行再断言不派
  - date: "2026-10-20"
    kind: fixed
    summary: 第二轮 CI run 39391972925 同用例转为 waitForTest 5s 超时——夹具未注入 resolveRuntimeFn，CI 无模型凭据时真实解析器如实拦住派发；在 runHandbackAcceptanceScenario 注入确定性解析（pi/credentials），不放宽断言
  - date: "2026-10-20"
    kind: fixed
    summary: test/桌面应用/runtime-resolution.test.ts 全部临时目录 teardown 改用 removeTempDirEventually（ENOTEMPTY/EBUSY/EPERM 最多 10 次、75ms 间隔的异步重试），不再直接 rmSync
  - date: "2026-10-20"
    kind: verified
    summary: 本地定向 74/74 与 13/13 连续各跑 3 次全绿；无凭据副本（排除 .env、清空相关环境变量）74/74，删除注入的控制组复现 5s 超时；typecheck 0 错；从测试文件抽取真实 helper 源码做故障注入，确认 ENOTEMPTY 重试、非重试错误直抛、重试耗尽后抛错三条路径
---

# v1.4.0 CI 两处测试竞态修复（含第二轮夹具凭据隔离）

**来源**：v1.4.0 发布 CI 首跑 `run 39389502551`（提交 `0210e2b`）两处失败，均判为桌面应用测试问题，由桌面应用属主上下文修复；
第二轮复跑 `run 39391972925`（提交 `567d3bd`，已含首轮修复）同一验收派发用例转为 5s 超时，补修夹具对宿主模型凭据的依赖。
**范围**：只改 `test/桌面应用/interface.test.ts`、`test/桌面应用/runtime-resolution.test.ts` 与本角色记录；不改产品代码、打包/编排文件，不 commit/tag/push。

## 1. 三平台共同失败：验收派发测试竞态

- **CI 事实**：`build (windows-2025, win, x64)`、`build (macos-15, mac, arm64)`、`build (macos-15-intel, mac, x64)` 均红在
  `test/桌面应用/interface.test.ts:3035` 的
  「收尾推进：回交送达 Convener 且流程全部完成 ⇒ 派 Proof / 验收 恰一次；重复 settle 不重派」，
  `AssertionError: 全部完成 ⇒ 恰一条验收汇总任务`，`actual: 0, expected: 1`。
  本地单跑该文件 74/74 通过（并发负载差异）。
- **根因（一句话）**：`runHandbackAcceptanceScenario` 的 `openRoleSessionFn` 只在 verifier 会话真正打开时才
  `sendsByRole.set("verifier", sends)`；用例在 scenario 返回后立即 `scenario.sendsByRole.get("verifier") ?? []`，
  CI 并行负载下 verifier 尚未打开，捕获的是一个与后续派发无关的空数组，之后断言永远看不到新数组。
- **修复（不削弱产品断言）**：
  - 先 `await waitForTest(() => (scenario.sendsByRole.get("verifier")?.length ?? 0) >= 1, 5000)`，
    再取当前数组 `const verifierSends = scenario.sendsByRole.get("verifier")!`；随后保留原有全部文案断言。
  - 系统行断言前增加有界等待（≤2000ms）Lead 的「已自动派发验收复核给 Proof（工作中）」；等不到仍失败。
  - 「重复 settle 不重派」：记录首次派发数，`repeatConvenerSettle()` 后用新增的 `assertNoChangeFor` 做
    **400ms 有界稳定窗口**：期间 verifier map 值被替换（重开会话）或数组长度变化（追加发送）都立即失败；
    窗口后再断言当前数组长度仍为 1。替换掉原来单靠 150ms 固定 sleep 的做法。
  - 相邻 pending/blocked 用例存在同类「提前取数组」假绿风险：改为先有界等待（≤5000ms）Lead 的
    「自动验收未派发」阻塞系统行（证明本轮收尾门检查已执行），再断言 verifier 派发数仍为 0；断言语义不变。
- **精确文件**：`test/桌面应用/interface.test.ts`（新增 `assertNoChangeFor`、`deliveryNoteSummaries` 两个测试辅助；
  修改上述两个用例；未改 `runHandbackAcceptanceScenario` 产品路径）。

### 第二轮 CI（run 39391972925）补充：夹具未隔离引擎解析

- **CI 事实**：提交 `567d3bd` 的三平台复跑中，同一用例仍红，但错误变为
  `Error: 等待测试条件超时`（约 5.2–5.4s，verifier 始终没有 send），不再是数组引用问题。
- **根因（一句话）**：`runHandbackAcceptanceScenario` 的 `createDesktopInterface` 没有注入 `resolveRuntimeFn`，
  夹具依赖宿主真实引擎解析；CI runner 没有任何模型凭据（也没有仓库根 `.env`），自动验收派发在引擎解析处
  被如实拦住、根本到不了 verifier 会话（本机仓库 `.env` 有 Pi 凭据，所以本地一直通过）。这是**夹具环境依赖**，
  不是产品变慢。
- **修复**：在该夹具的 deps 中注入确定性解析
  `resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] })`
  （与本文件其余用例的既有用法一致）；不放宽任何断言、不改产品代码。此前的等待/稳定窗口修复全部保留。
- **验证（红→绿）**：
  - 主工作树 `node --test test/桌面应用/interface.test.ts`：**74/74**，连续 3 次全绿。
  - 无凭据副本（复制 `app/`、`src/`、`test/`、`package.json`、`tsconfig.json`，**排除 `.env`**，
    `node_modules` 软链，并 `env -u` 清空 `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`/
    `CODEX_API_KEY`/`OPENAI_API_KEY`/`ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_API_KEY`）：
    **74/74** 全绿，收尾推进用例 665ms / 518ms。
  - 同一副本删除注入行后的控制组（`--test-name-pattern="收尾推进"`）：
    `tests 2 / pass 1 / fail 1`，done 用例以 `等待测试条件超时`（5275.98ms）复现第二轮 CI 现象。
  - 临时副本已删除，无遗留。

## 2. macOS arm64：临时目录清理 ENOTEMPTY

- **CI 事实**：`build (macos-15, mac, arm64)` 红在 `test/桌面应用/runtime-resolution.test.ts:624` 用例
  「端到端（真实解析器）：冷启动仅 Pi 配置 ⇒ 自动派发选 pi（不再回退 claude）」的 teardown：
  `rmSync(root, { recursive: true, force: true })` 抛
  `ENOTEMPTY ... /T/ans-acceptance-runtime-real-KWRVcl`（`syscall: 'rm'`, `errno: 66`）。
- **根因（一句话）**：`stopSession()` 返回后仍有异步写入终于落盘，teardown 的同步递归删除撞上「目录又非空」；
  只在 arm64 出现，属时序偶发。
- **修复（只改测试清理）**：新增 `removeTempDirEventually(dir, attempts = 10, delayMs = 75)`：
  用 `node:fs/promises` 的 `rm(..., { recursive: true, force: true })` 异步删除，仅对
  `ENOTEMPTY`/`EBUSY`/`EPERM` 重试（最多 10 次、75ms 间隔），末次仍失败才抛；
  其它错误立即上抛，不掩盖产品错误；异步退避不阻塞事件循环，让待完成写入有机会收尾。
  该文件所有 `finally` teardown（含嵌套 `emptyDir`）统一改用它；测试中**语义性**删除
  `.ans/sessions/role-b` 仍保留 `rmSync`（那是用例步骤，不是清理）。
- **精确文件**：`test/桌面应用/runtime-resolution.test.ts`。

## 本地验证（真实输出）

- `node --test test/桌面应用/interface.test.ts`：`tests 74 / pass 74 / fail 0 / skipped 0 / todo 0`；
  第二轮修复（注入 `resolveRuntimeFn`）后连续 **3 次**均为 74/74。
- 无凭据环境模拟（详见 §1「第二轮 CI 补充」）：排除 `.env` 的临时副本 + 清空相关环境变量 ⇒ **74/74**；
  删除注入的控制组复现 `等待测试条件超时`（2 用例：1 pass / 1 fail）。
- `node --test test/桌面应用/runtime-resolution.test.ts`：`tests 13 / pass 13 / fail 0 / skipped 0 / todo 0`；
  连续 **3 次**均为 13/13。
- 两文件合并跑一次：`tests 87 / pass 87 / fail 0`。
- `npm run typecheck`：0 错（exit 0）。
- 清理重试机制（darwin arm64）：从本测试文件**抽取真实 `removeTempDirEventually` 源码**做故障注入——
  ① 首次 ENOTEMPTY、第二次成功 ⇒ 2 次调用后成功；
  ② 非重试错误 `EACCES` ⇒ 1 次调用后立即上抛；
  ③ 持续 ENOTEMPTY ⇒ 恰好 10 次调用后抛出带 `cause.code=ENOTEMPTY` 的错误。
  另做 8 轮真实「边写边删」竞态，本机未自然复现 ENOTEMPTY（与 CI 偶发一致），故以注入验证重试路径。
- 测试后检查 `$TMPDIR`：无 `ans-acceptance-*` / `ans-runtime-*` 遗留目录；无凭据临时副本已删除。

## 残余风险

- **第二轮 CI（run 39391972925，提交 `567d3bd`）仍是红的**；本记录只说明两轮根因与本地红→绿证据，
  **不声称 CI 已通过**。最终仍需下一次 CI 原生 runner 复验（无凭据 runner 上的真实行为）。
- 本地无法复现 CI 的原生并行负载：macOS/Windows runner 上的真实并发时序仍需 CI 复验；
  本次只证明定向文件在串行本地负载下稳定、且重试/等待逻辑在注入条件下按预期工作。
- 未跑全量 `node --test`（任务范围限定两个定向文件）；未跑 Electron e2e（本次为测试时序修复，不涉产品行为）。
- 本仓库工作树由多个角色上下文并行使用，可能同时存在其他角色/发布上下文的改动；本次只改上述桌面应用
  测试与本角色记录，未触碰其他角色文件（首轮修复已随发布提交 `567d3bd` 进入 CI）。
