# v2.1.0 发布阻断处置：darwin-x64 显式跳过 Q2 P2（2026-11-17）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.1.0 发布阻断——按协调者裁决，在 **darwin-x64** 平台显式跳过 Q2 P2 父测试（测试侧条件 `skip`，
  不改断言），并把 `test/测试/git-role-workflows-e2e.test.ts` 精确加入 release overlay 白名单；
  528 步串行链拆分登记为发布后跟进任务。
- 工作树/分支：`.claude/worktrees/fix-q2p2-darwin-x64-skip` / `fix/q2p2-darwin-x64-skip`，
  基线 HEAD `b8813b3`（= origin/main；含 E3 预算批 `9881e2b` 与 FS 诊断合并批 `c286dea`）。
- 授权：协调者任务书（写区：本 e2e 测试、`src/common/装配/release-policy.mjs`、本文记录）。
- 声明：未改 release.yml、未 publish、未 commit/push；未改产品语义、其它测试与断言；未读 `.env`；
  未占用 9222/9223/9224。

## 一、背景与证据

- 发布 run **44039948085**（head `b8813b3`）：arm64 success、Windows success；x64（`macos-15-intel`）
  失败 1 项——`Q2 P2 first new project…` 恰 **900,098ms** 撞 E3 子进程硬上限（child 900s/父 960s），
  5,828 用例中仅此 1 项失败，纯超时（无断言失败）。
- 同一链此前在 x64 实例 **729.88s 通过**（`2026-11-17_b7-closure.md` §4.1；同表 arm64 201.56s /
  Windows 202.30s）——x64 runner 实例间耗时波动极大（729s–900s+）。
- E3 规则（`2026-11-17_r9-e3-final-budget.md`）：这是最后一次预算调整；若 x64 仍超 900s，**必须拆测试或
  转产品候选，不得再抬预算**。
- 协调者裁决（逐条落实）：① darwin-x64 显式跳过 Q2 P2（测试侧条件 skip，理由写明 runner 波动 / E3 硬上限 /
  arm64+Windows 完整覆盖 / 发布后拆分跟进；不影响其它平台、不改其它断言）；② 528 步串行链拆分列为发布后
  跟进（不阻塞发布）；③ e2e 文件精确加入 release-policy files 白名单；④ 不改 release.yml、不 publish。

## 二、skip 条件与理由（`test/测试/git-role-workflows-e2e.test.ts`）

位置 → 改动：

1. `:1333` 新增条件常量（Q2 P2 预算常量块之后）：
   ```ts
   const q2P2DarwinX64 = process.platform === "darwin" && process.arch === "x64";
   ```
2. `:1334` 新增理由常量 `q2P2DarwinX64SkipReason`，完整覆盖裁决第 1 条：darwin-x64 runner 实测 729s–900s+
   波动（run 44039948085 x64 恰 900,098ms 撞 E3 硬上限；同一链此前 729.88s 通过）；E3 规则不再抬预算
   （child 900s/父 960s）；同轮 arm64 与 Windows 已完整覆盖并通过；协调者裁决 darwin-x64 显式跳过，
   拆分链为发布后跟进、不阻塞发布。
3. `:2367` 注册父测试 options 增加 skip：
   ```ts
   test(firstNewBusinessName, { timeout: firstNewBusinessTimeoutMs(), skip: q2P2DarwinX64 ? q2P2DarwinX64SkipReason : undefined }, runFirstNewBusinessCase);
   ```
4. `:1326–1332` 注释记录裁决依据（run 44039948085 / 900,098ms；729.88s 历史通过；arm64/Windows 通过；
   E3 硬上限；发布后拆分跟进；仅该注册项在 darwin+x64 标 skipped）。

语义说明：

- node:test 的 `options.skip` 为字符串时，整例标为 **skipped** 且**不执行函数体**——不会进入 owned-child
  启动与 900s 预算，避免 x64 触顶。
- **测试名逐字不变**（`firstNewBusinessName`）、`runFirstNewBusinessCase` 未改；其它平台
  `skip: undefined`，注册与执行行为逐字不变；其它断言零改动。
- standalone / 子进程入口（`ANS_Q39_CHILD` 等）不经该注册项，未改。

## 三、release-policy 精确条目（`src/common/装配/release-policy.mjs`）

- `files` Set 追加**单文件精确路径** `'test/测试/git-role-workflows-e2e.test.ts'`（单文件不开目录；
  相似名/同目录其它测试仍 excluded；fail-closed 机制不变）。既有 FS 诊断条目
  `test/桌面应用/project-document.test.ts` 保留。
- 顶部活动白名单描述更新为「**基础集 + v2.1.0 发布阻断条目（FS 诊断 + Q2 P2 darwin-x64 skip，共 2 条）**」，
  并新增本条注释段（run 号、900,098ms / 729.88s 证据、skip 条件与理由、不改断言/其它平台、发布后拆分跟进）。
- 说明：v2.0.0 及更早的历史逐文件条目仍保留（移除会改变发布策略且被 `test/装配/release-packaging.test.ts`
  钉住），对应文件已随冻结源吸收、不出现在 v2.1.0 tag→overlay 差异中。

## 四、发布后跟进（记录在案，不阻塞 v2.1.0）

- **任务：拆分 Q2 P2 的 528 步串行链**（发布后批次，独立设计与验收）。目标：把单条串行的
  owned-child 链拆为可分段/可定位的多个测试，使 darwin-x64 在 E3 硬上限内稳定完整执行，并在拆分落地后
  **移除本 skip**、恢复三平台全量覆盖。
- 状态：未开工；本记录即登记位置。拆分前 darwin-x64 的 Q2 P2 覆盖缺口如实登记：arm64/Windows 仍全量执行，
  x64 跳过原因与替代覆盖见 §二。

## 五、验证输出（Windows 本机）

- skip 条件静态检查（`node -e`，复现条件分支，不伪造 platform 跑整文件）：
  `darwin+x64 => true`；`darwin+arm64 => false`；`win32+x64 => false`；`win32+arm64 => false`；
  `linux+x64 => false`（全部 OK）。
- `selectOverlay(['test/测试/git-role-workflows-e2e.test.ts', 'test/测试/git-role-workflows-e2e-extra.test.ts',
  'src/common/装配/release-policy.mjs', 'package.json'])`：
  `selected = ["test/测试/git-role-workflows-e2e.test.ts","src/common/装配/release-policy.mjs","package.json"]`，
  相似名 `git-role-workflows-e2e-extra.test.ts` 落 `excluded`——精确路径入选、单文件不开目录。
- `node --test --test-concurrency=1 --test-timeout=1200000 --test-name-pattern="Q2 P2" "test/测试/git-role-workflows-e2e.test.ts"`
  （win32 不应被 skip）→ **✔ Q2 P2 first new project… (434,902.1ms)；tests 1 / pass 1 / fail 0 / cancelled 0 /
  skipped 0（duration 438,931.7ms；后台退出码 0）**。本机同链 E3 时为 199.2s，本次 434.9s（仍 < child 900s）
  ——再次印证该链对 runner 实例性能高度敏感（波动依据见 §一）。
- `node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"` → **tests 22 / pass 22 / fail 0 /
  skipped 0**（duration 541.2ms）。
- `npm run typecheck` → **exit 0**（tsc --noEmit，无输出）。
- `git diff --check` → exit 0；`git status --porcelain` → 2 个修改文件 + 本文记录
  （e2e 运行产生的证据目录与本次 fixture 临时根已清理，见 §六.5）。

## 六、披露

1. **写区与角色边界**：`src/common/装配/release-policy.mjs` 属装配侧文件，测试角色 `boundary.md` Section 1
   未逐条列出；本批按协调者任务书写区执行（发布阻断配套白名单条目，先例见
   `2026-11-17_change_project-document-fs-diagnostics.md` §四），特此披露，请统筹/验收知悉；
   如需边界文档同步由人事按流程更新。
2. **test/装配 审计**：全仓检索确认 `test/装配/`、`src/common/装配/` 均未引用
   `git-role-workflows-e2e.test.ts`，无需同步白名单测试断言；`release-packaging.test.ts` 22/22 全绿。
3. **平台验证范围**：本机为 win32——验证的是「非 darwin-x64 平台不被 skip、Q2 P2 照常执行」；
   darwin-x64 的实际 `skipped` 结果以下一轮发布 run 的 x64 日志为准（本批不触发 CI）。
4. 未改 release.yml / release-policy.d.mts / 产品代码 / 其它测试；未 commit/push、未 publish、未 tag。
5. **生成物清理**：本次 e2e 运行产生的 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`
   （运行前不存在，全部为测试自写证据）与本次 fixture 临时根（`q2-git-first-bootstrap-YbT1t7`）已精确删除；
   未触碰其它历史临时目录。
