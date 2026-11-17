# v2.1.0 发布阻断硬化：R2 chief timeout 注入预算 25ms→250ms（2026-11-17）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.1.0 发布阻断硬化——按协调者裁决，把 R2 chief timeout 用例的注入预算
  `context.limits.timeoutMs` 由 25ms 扩大为 250ms（测试侧只改注入预算，不改断言/测试名），并把
  `test/runtime-core/submit-capability-tools.test.ts` 精确加入 release overlay 白名单。
- 工作树/分支：`.claude/worktrees/fix-r2-chief-timeout-budget` / `fix/r2-chief-timeout-budget`，
  基线 HEAD `3c2b844`（= origin/main，含 Q2 P2 skip 合并批与 E3 预算批）。
- 授权：协调者任务书（写区：本测试文件、`src/common/装配/release-policy.mjs`、本文记录）。
- 声明：未改 release.yml、未改产品语义、未改其它测试/断言；未 commit/push、未触发 CI、未 tag；
  未读 `.env`；未占用 9222/9223/9224。

## 一、背景与证据

- 发布 run **44052288470**（head `3c2b844`）：arm64 success、Windows success；x64 仅 **1 项失败**——
  `R2 chief timeout is finite and normal sessions still receive injected narrow capabilities`
  （`test/runtime-core/submit-capability-tools.test.ts:539`，该用例 **49ms** 失败）。
- 错误体：
  `Error [TimeoutError]: demo 建立角色会话 超时（25ms）：底层操作未在时限内返回，已中止以免无限挂起。`
  （抛自 `timeout.ts:74/99`）。
- 根因：该用例注入 `context.limits.timeoutMs = 25`，原意是在 prompt 阶段人为触发有限超时；慢 x64
  实例上 25ms **连会话建立都不够**，TimeoutError 在 `assert.rejects` 作用域外抛出（会话建立阶段即超时）。
- 同名前科：该测试名在旧 B0/B7 基线中存在（历史环境敏感族，见测试债收口记录）；本机 / test-ci
  常态通过——本次是慢 runner 实例击穿 25ms 预算，而非语义回归。
- 协调者裁决：做硬化修复（25ms→250ms），不靠重跑赌 flake。理由：decide handler 永不返回，250ms 后
  仍必然触发超时，断言/测试名不变；仅消除「慢 runner 上会话建立耗时 > 25ms」的环境敏感。

## 二、改动

### 2.1 测试文件（`test/runtime-core/submit-capability-tools.test.ts`）

1. `:542` → `:547`（上方新增 5 行注释后行号平移）：
   ```ts
   const context = chiefContext(); context.limits.timeoutMs = 250;
   ```
   （原值 `25`；全文件唯一一处预算注入，`:486` 的 `chiefContext()` 默认 `timeoutMs: 1000` 未动。）
2. `:539–543` 新增注释：记录发布 run 44052288470 x64 以「demo 建立角色会话 超时（25ms）」在
   `assert.rejects` 作用域外失败（49ms）；说明 decide handler 永不返回、250ms 后仍必然触发超时；
   仅扩大注入预算消除会话建立耗时敏感；测试名/断言/其它语义零改动。

语义说明：

- 测试名逐字不变（`R2 chief timeout is finite and normal sessions still receive injected narrow
  capabilities`）；`assert.rejects(session.prompt("Decide"), /超时|超过|到点/)` 与 `calls === 1`
  断言零改动；后半段「normal sessions still receive injected narrow capabilities」的捕获/断言未动。
- 未删除、未 skip、未放宽断言；未改产品代码。
- 生效机制：250ms 预算下 decide handler 依旧永不 settle（仅监听 abort），prompt 必在预算到点被中止并
  抛 TimeoutError，断言照常匹配。

### 2.2 release overlay 白名单（`src/common/装配/release-policy.mjs`）

- `files` Set 追加**单文件精确路径** `'test/runtime-core/submit-capability-tools.test.ts'`
  （单文件不开目录；相似名/同目录其它测试仍 excluded；fail-closed 机制不变）。既有 FS 诊断条目
  `test/桌面应用/project-document.test.ts` 与 Q2 P2 skip 条目 `test/测试/git-role-workflows-e2e.test.ts`
  保留。
- 顶部活动白名单描述更新为「**基础集 + v2.1.0 发布阻断条目（FS 诊断 + Q2 P2 darwin-x64 skip +
  R2 timeout 硬化，共 3 条）**」，并新增本条注释段（单文件精确路径、依据 run 44052288470、只改注入
  预算、断言/测试名不变）。

## 三、审计

### 3.1 同类 25ms 预算逐一审计（全仓 test/）

检索 `timeoutMs\s*[=:]\s*25\b|超时（25ms）|25ms`，命中 3 处（除本用例）：

1. `test/桌面应用/operator-channel.test.ts:1723`——`judge: { isEnabled: () => true, timeoutMs: 25 }`：
   该用例以 hang 住的 judge 桩断言「判断超时独立生效」，预算内无会话建立/重型初始化，仅启动计时器；
   时序断言为 `< 2000ms` 宽松上界，慢 runner 只会让实际耗时更长而仍落在上界内，结果恒为
   deny/判断超时。**非环境敏感，不改**。
2. `test/编排/shell-judge.test.ts:444/448`——`makeJudge({ silent: true, settle: false }, { timeoutMs: 25 })`，
   断言 reason 匹配 `/判断超时（>25ms）/`（reason 文本内嵌预算数值）：judge 为 silent 桩永不 settle，
   无论 runner 快慢结果都是 timeout，断言恒匹配。**非环境敏感，不改**（其断言依赖字面 25ms，若改预算
   须同步改断言，本批无此必要）。
3. `test/编排/shell-judge.test.ts:472`——同文件 env 覆盖用例设 `SHELL_JUDGE_TIMEOUT_ENV=25` 并断言
   `/判断超时（>25ms）/`：同上，silent 桩恒超时。**非环境敏感，不改**。

结论：仅 R2 用例的 25ms 预算在慢 runner 上被会话建立耗时击穿（超时发生在 `assert.rejects` 作用域外），
按同一原则只处理该处。

### 3.2 断言依赖检查

- 全仓 test/ 无断言依赖 R2 用例的 25 字面量：本文件仅 `:486` 默认 1000 与 `:547` 注入值，无
  「错误信息含 25」「reasonCode 含 25」类断言；测试名不含 25。`R2 chief timeout` 仅本文件一处。
- `test/装配/` 与 `src/` 均未引用 `test/runtime-core/submit-capability-tools.test.ts` 路径
  （检索 0 命中），白名单追加不影响任何既有断言；`release-packaging.test.ts` 22/22 全绿（见 §四）。

## 四、验证输出（Windows 本机）

- `node --test --test-concurrency=1 --test-timeout=120000 "test/runtime-core/submit-capability-tools.test.ts"`
  → **tests 25 / pass 25 / fail 0 / cancelled 0 / skipped 0 / todo 0（duration 548.4ms）**；
  `✔ R2 chief timeout is finite and normal sessions still receive injected narrow capabilities
  (275.5ms)`——预算 250ms 量级，仍如实触发超时并匹配断言。
- `node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"` → **tests 22 / pass 22 /
  fail 0 / skipped 0（duration 426.2ms）**。
- `selectOverlay(['test/runtime-core/submit-capability-tools.test.ts'])` →
  `selected = ["test/runtime-core/submit-capability-tools.test.ts"]`、`excluded = []`；相似名
  `submit-capability-tools.test.ts.bak` 与 `submit-capability-tools-extra.test.ts` 落 excluded
  （单文件不开目录）；`src/common/装配/release-policy.mjs` 经目录白名单入选。
- `npm run typecheck` → **exit 0**（tsc --noEmit，无输出）。
- `git diff --check` → exit 0；`git status --porcelain` → 2 个修改文件 + 本文记录（仅 3 文件）。

## 五、披露

1. **写区与角色边界**：`src/common/装配/release-policy.mjs` 属装配侧文件，测试角色 `boundary.md`
   Section 1 未逐条列出；本批按协调者任务书写区执行（发布阻断配套白名单条目，先例见
   `2026-11-17_change_project-document-fs-diagnostics.md`、
   `2026-11-17_change_q2p2-darwin-x64-skip.md`），特此披露，请统筹/验收知悉。
2. **平台验证范围**：本机为 win32——验证的是「250ms 下用例仍必然超时并匹配断言」；慢 x64 实例上
   会话建立耗时的实际裕量以下一轮发布 run 的 x64 日志为准（本批不触发 CI）。
3. **行号平移**：注释插入使测试声明由 `:539` 平移至 `:544`、注入行由 `:542` 平移至 `:547`；
   release-policy 注释中的 `:539` 指失败 run（head 3c2b844）时的位置，属证据引用。
4. 未改 release.yml / release-policy.d.mts / 产品代码 / 其它测试；未 commit/push、未触发 CI、未 tag；
   未读 `.env`；未占用 9222/9223/9224。
