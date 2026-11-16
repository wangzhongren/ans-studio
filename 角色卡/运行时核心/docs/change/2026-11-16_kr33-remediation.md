# KR-33 运行时核心修复记录（2026-11-16）

- 角色：运行时核心（runtime core）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\kr33fix`
- 分支：`fix/test-debt-kr33`；起点 `d1f256f` = `origin/main`
- 目标：发布门禁冻结 known-red 33 名逐名转绿。分类依据（只读，位于分析工作树 kr33ana）：
  `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\kr33ana\角色卡\测试\docs\change\2026-11-16_kr33-classification.md`
  与其 `2026-11-16_kr33-classification_evidence\`（01 逐名、04 根因探针、06 六名 CI 错误体、07 源码证据）。
- 状态：**已实现、已跑本角色验证；未 commit/push，未触发 CI，未 tag，未独立验收**

## 1. 改在哪里（位置 → 改动）

### K2（1 名，产品回归 #29）：`src/service/runtime/session.ts`

- 位置：`bindRole` 的 assertReady 失败路径（`:750-765`）。
- 以前：`constructed = inner` 后，assertReady 失败时内层 catch 先 `await inner.dispose()` 并抛出，
  外层 catch 又对同一 `constructed` `await constructed?.dispose()` ⇒ 同一 inner 被 dispose 两次
  （测试 fixture 计数 2）。内层 dispose 来自 `6e515893`，`constructed` + 外层 dispose 来自 `e71501ca`；
  测试的 `disposed=1` 早于 e71501c，属可观察清理行为回归。
- 现在：删除内层 `inner.dispose()`，由外层 catch 统一释放 `constructed`，保持失败态如实记录与
  `native=0`。`test/runtime-core/session.test.ts:439-447` 的 `disposed=1`（恰一次）断言原样保留。
- 产品 diff：[02-product-diff.patch](2026-11-16_kr33-remediation_evidence/02-product-diff.patch)。
- 用户可感知入口：无 UI/文案变化；影响的是 `bindRole` 失败时的资源清理次数与生命周期账本事实。

### K3（5 名，测试假设过时）：只改断言体，冻结测试名逐字保留

| 测试名（冻结逐字，未改） | 文件 | 以前 | 现在 |
| --- | --- | --- | --- |
| `dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行` | `test/runtime-core/dispatch-workflow-writer-copy.test.ts:10` | 断言 e71501c 前的“Section 1 预授权、直接写”“先落盘再派发”等旧句，并反断言“写盘经确认制” | 断言现行文案语义核心（运营职责内 `docs/workflow.md`、跨角色实现前准备、按地址引用/不内嵌、缺失不拒投、派发不写盘），并对旧直接写措辞保留负断言；另断言 `request_stable_write` 的客户 stable-write 确认卡路径 |
| `dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」` | 同文件 `:29` | 同上，作用于 promptGuidelines | 同口径更新 guidelines 断言；断言 `request_stable_write` 的“提交 ≠ 已写入” |
| `D3 linked workspace root remains usable; linked target itself is not replaced` | `test/runtime-core/file-write-safety.test.ts:97` | `assert.match(result.message, /符号链接/)` | 断言现行稳定码 `[file-write-protection] symbolic-link target`；保留链接未被替换、目标内容不变断言；win32 无文件符号链接权限时以 junction 等价执行并诊断 |
| `主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3）` | `test/runtime-core/trunk-contract.test.ts:80` | 期望 6 个 `TRUNK_SOURCES` | 期望 7 个，加入 `team-plan`；保留 `main-upgrade` 负例与 bootstrap/recovery/upgrade 显式断言 |
| `doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6）` | `test/runtime-core/version-change-contract.test.ts:176` | 9 类、两分区穷尽 | 10 类（含 `role-direct-applied`）、customer 5 + application 4 + direct 1 三分区互斥且并集==全集；保留 `migrated-draft` 非 reason、migration marks、baseline event kinds；judge-delegated 仍为 customer 子集 |

更新理由与代码/api-spec 证据：[03-expectation-updates.md](2026-11-16_kr33-remediation_evidence/03-expectation-updates.md)。

### K1（25 名，环境/工作树）：7 个测试文件中性与临时根

- 文件：`abort-quarantine`、`effective-timeouts`、`git-capability-tools`、
  `prompt-start-acknowledgement`、`reasoning-effort`、`session`、`submit-capability-tools` 的
  `*.test.ts`（均在 `test/runtime-core/`）。
- 以前：`projectRoot: process.cwd(), skillRoot: process.cwd()`。linked worktree 的 `.git` 是文件，
  产品按既有 fail-closed 口径判保护范围 `unknown`，`bindRole/composeContext` 抛
  `runtime-protection-scope-unknown`（25 名）。
- 现在：`test/runtime-core/fixtures.ts` 新增 `neutralProjectRoot()`（`mkdtemp`，无 `.git`），
  上述调用点改用同一中性根；断言、超时、错误期望全部不变，产品保护范围判定不放宽。
- 机制证据：分类 `_evidence/04-root-cause-probe.txt`；产品源码 `git-command.ts:971`、
  `session.ts:232/1277/1297-1298`。替代注册位置见 [03-expectation-updates.md](2026-11-16_kr33-remediation_evidence/03-expectation-updates.md)。

### K4（2 名，Windows symlink）：`test/runtime-core/session-store.test.ts`

- 以前：测试在构造阶段直接 `fs.symlink(..., "dir")`；本机无 `SeCreateSymbolicLinkPrivilege` ⇒ `EPERM`，
  断言不可达。
- 现在：新增 `directoryLink()` 能力适配——先尝试真实目录符号链接；win32 且仅 EPERM 时回退
  junction（本机实测 `lstat().isSymbolicLink() === true`、`isDirectory() === false`，
  store 的“非普通目录”拒绝语义不变）；其他错误如实抛出。断言未放宽、未 skip，
  两名测试用 `t.diagnostic` 记录 `linkKind` 与平台。
- 证据：[06-skips-and-residuals.txt](2026-11-16_kr33-remediation_evidence/06-skips-and-residuals.txt)。

## 2. 触发场景前后对比

1. linked worktree 中运行 runtime-core 测试（K1 场景）：
   以前 25 名以 `runtime-protection-scope-unknown` 失败；现在测试使用无 `.git` 的中性临时根，
   同一断言通过；产品对真实项目根的 fail-closed 保护判定未改。
2. Provider 未在首次 prompt 前注册 display profile（K2 场景）：
   以前 `bindRole` 拒绝后同一 inner 被 dispose 2 次；现在恰好 1 次、`native=0`，失败事实仍如实记录。
3. 写工具遇到链接目标（K3-D3 场景）：
   以前中文 `/符号链接/` 断言与现行英文稳定码不匹配；现在断言
   `[file-write-protection] symbolic-link target`，且链接未被替换、原文件内容不变。
4. 主力契约常量（K3 主干/doc-freeze 场景）：以前期望落后于 `team-plan` 与 `role-direct-applied`；
   现在按现行 Model 常量与 api-spec 断言。
5. 本机无符号链接权限（K4 场景）：以前构造阶段 EPERM；现在以 junction 等价执行并绿（无 skip）。

## 3. 不改什么

- 不改任何冻结测试名（33 名逐字保留；K3 历史标题在测试体内注释说明）。
- 不改产品保护范围判定、文件写保护语义、`request_stable_write` 契约、trunk/doc-freeze Model 常量。
- 不改 `session.ts` 其他失败路径（含 native-factory-plan 绑定路径的同形态 dispose，见 §6 剩余观察）。
- 不改其他角色文件、workflow、release.yml、角色卡/边界、main；不读 `.env`；不占 9222/9223/9224。

## 4. 怎样验证

- 命令（任务口径）：`node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"`
  - 修改前：EXIT=1；604 tests / 567 pass / **33 fail** / 4 skipped。
  - 修改后连续 3 次：EXIT=0；604 tests / **600 pass / 0 fail** / 4 skipped（RUN1–RUN3 一致）。
- 冻结 33 名逐名对照：**✔ 33 / ✖ 0 / ﹣ 0 / MISSING 0**；新增失败 0。
- 定向 12 文件：157 tests / 153 pass / 0 fail / 4 skipped（既有 win32 skip）。
- `npm run typecheck`（`tsc --noEmit`）：**EXIT=0**。
- 调用方冒烟（6 个 adapter 文件）：124 / 122 pass / 2 fail；2 个失败均为既有 Windows 文件符号链接
  EPERM，基线 `d1f256f` 同文件同样 2 失败，非本轮引入（[07-adapter-smoke.txt](2026-11-16_kr33-remediation_evidence/07-adapter-smoke.txt)）。
- 证据汇总：[00-run-metadata.txt](2026-11-16_kr33-remediation_evidence/00-run-metadata.txt)、
  [01-kr33-dispositions.tsv](2026-11-16_kr33-remediation_evidence/01-kr33-dispositions.tsv)、
  [04-test-counts.txt](2026-11-16_kr33-remediation_evidence/04-test-counts.txt)、
  [05-frozen-33-after.txt](2026-11-16_kr33-remediation_evidence/05-frozen-33-after.txt)、
  [08-baseline-failing-names.txt](2026-11-16_kr33-remediation_evidence/08-baseline-failing-names.txt)。

## 5. 改动文件与哈希

见 [04-changed-file-sha256.txt](2026-11-16_kr33-remediation_evidence/04-changed-file-sha256.txt) 与
[02b-diff-stat.txt](2026-11-16_kr33-remediation_evidence/02b-diff-stat.txt)。共 14 个文件：
`src/service/runtime/session.ts` + `test/runtime-core/` 下 13 个测试/夹具文件（含新增 helper 所在 `fixtures.ts`）。
未新增其他目录级权限；`test/runtime-core/` 与 `docs/change/` 均在角色卡 Section 1 授权内。

## 6. 剩余与披露

- 修改后 604 集的 4 个 skip 均为**既有 win32 chmod/umask D3 用例**，非冻结 33 名；K4 两名未 skip。
- 无剩余冻结 known-red；本轮未触碰 gates 5 / 编排 24 两套 known-red 集合。
- 范围外观察（未改、未被本轮测试覆盖）：`src/service/runtime/session.ts` 的 native-factory-plan
  绑定失败路径（`:758` 附近）在 try 内 dispose 后仍会由外层 catch 再 dispose；与 K2 同形态，
  建议后续按 owner 评估是否纳入清理契约。本轮按任务仅处理 assertReady 路径。
- 风险档位建议：T1（单角色产品失败路径最小修复 + 同边界测试）；最终档位与验收由调度/独立验收核对。
- 候选状态：**implemented-unverified**；未 commit/push、未触发 CI、未 tag、未碰 main。
