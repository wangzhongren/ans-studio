# macOS file-gate `file-gate-host-facts-unproven` 调查与产品修复（W29×3 / W30×2 / Q2 P2）

- 日期：2026-11-16
- 角色：编排（roleId: 编排）
- 工作树：`.claude/worktrees/macgate`（分支 `fix/test-debt-macos-file-gate`，起点 `d1f256f` = `origin/main`）
- 来源：协调者按 R6 §6.2 owner 裁决项 #1/#5 批准的产品修复调查；证据链来自
  `角色卡/测试/docs/change/2026-11-16_test-debt-b4-followup.md`（W29/W30 定性）、
  `2026-11-16_remediation-plan-r6-update.md`（§0.7/§3.2/§5.2/§6.2）与 `_r6-evidence/`。
- 范围：只读定位 + 本记录与 `_evidence/`。**未修改任何产品代码或测试**：正确最小修复属
  `src/provider/trunk/impl/git-command.ts`（运行时核心属主），按任务约束「若修复需跨入
  `src/provider/trunk/**` … 停下报告」处理。未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；
  未占用 9222/9223/9224。
- 结论一句话：**`file-gate-host-facts-unproven` 不是根拼写问题，而是 provider 的 protection
  topology 把「目录 nlink」计入 digest；macOS/POSIX 下 `write_file` 在 canonical-read 与 final-write
  之间 mkdir 顶层父目录，使根目录 nlink 变化，final-write 复判误报「Git protection facts 不 current」。**

## 0. 摘要

1. **根因（已用本机模拟证明机制）**：`protectionTopology()` 的 `describe()` 把 `info.nlink` 纳入
   topology digest（`src/provider/trunk/impl/git-command.ts:598-611`）。POSIX（macOS APFS）目录
   `nlink = 2 + 直接子目录数`，在项目根下创建首个顶层目录（如 `docs/`）就会改变根 nlink；
   Windows NTFS 目录 nlink 恒为 1（本机实测）。`write_file` 的 `ensureParentDir` 恰在
   canonical-read 与 final-write 之间执行（`src/provider/runtime/tools.ts:707-727`），final-write 的
   `verifiedFileFacts` 重新调用 `checkGitProtectionFactsCurrent`（`src/pipeline/orchestration/run-role.ts:3728`）
   即因 topology digest 变化返回 false ⇒ `fileFactsDenied()` ⇒ 工件中的
   `write_file 写入前复核未通过：写入被拒绝：file-gate-host-facts-unproven…（未写入目标文件；可能已创建父目录）`。
2. **判别性证据（全部吻合）**：
   - macOS 4 份工件（R5 arm64/x64 + R6 x64；Mac 型号各两份）中该错误码共 **55 次，全部**是
     「写入前复核未通过」（mkdir 后 final-write 分支），lexical/canonical 阶段与其他文案 **0 次**；
     Windows 工件该错误码 **0 次**。
   - 同轮 macOS：W20×2、W21×2（首次 product 写入前**尚无 `.git`**，走 `absentProtectionTopology`，
     该分支不含 nlink）**绿**；W29×3/W30×2（先 `git_candidate init` 建 `.git`，present-repo 分支含 nlink）
     **红**；rapporteur 的 `write_file` 在 product 首次 mkdir 之后（顶层 `docs/` 已存在，根 nlink 稳定）
     **成功**；W29 document-change-missing-confirmation **绿**（该场景不断言意图卡出现）。
   - 本机 nlink 模拟（真实 provider 函数、不改产品文件）：有 `.git` 的根在签发保护事实后
     「根 nlink +1 ⇒ `checkGitProtectionFactsCurrent` false，恢复后 true」；无 `.git` 的根同动作保持 true。
   - 本机 junction 别名根（模拟 macOS `/var → /private/var`）W29/W30 6/6 绿 ⇒ 仅根拼写不触发。
3. **产品修复归属（停止点）**：最小且语义完整的修复是在 `describe()` 中让**目录** nlink 不进入
   topology digest（普通文件 nlink 保留；`.git/config` 的 `nlink===1` 校验与 host-facts 目标文件
   nlink=1 防护均不变）。该文件由运行时核心按精确条目持有（`角色卡/运行时核心/boundary.md`），
   且任务明确要求跨入 `src/provider/trunk/**` 时停下报告。run-role.ts 内不存在不削弱 fail-closed 的
   替代修法（final-write 跳过 currency 检查会丢失「canonical-read 后 `.git`/config/目录身份被替换」
   的检测；复制 provider topology 计算则是第二份安全实现）。
4. **未改测试**：修复未落地，不应新增 macOS 红测试；建议的回归钉（present-repo 根 mkdir 后
   protection facts 仍 current）随运行时核心的修复同批提交（见 `_evidence/07-proposed-owner-patch.diff`）。
5. **验证**：`npm run typecheck` EXIT=0；W29/W30 目标 3×（2× 6/6，1× 5/6：W30 重启场景本机时序
   噪声，单名隔离 3× 全绿、与本错误码无关）；junction 别名 6/6；runtime-core P0 根规范化 12/12；
   write-gate-context 11/11。
6. **macOS 待复核**：运行时核心应用上述补丁后，R7 macOS x64（并 arm64，若 runner 恢复）应使
   W29×3/W30×2、Q2 P2 转绿；W34/W35 按 §5 观察（预期随 W33 写成功 + w19 清理链自愈）。

## 1. 根因证据链

### 1.1 代码链（只读；完整引用见 `_evidence/02-code-chain.md`）

| 步骤 | 位置 | 事实 |
| --- | --- | --- |
| 1 | `src/provider/runtime/tools.ts:650-674` | `beginFileInvocation`：lexical-read → canonical-read 两次 gate；canonical 阶段要求 `checkGitProtectionFactsCurrent(protection)` 为真 |
| 2 | `src/provider/runtime/tools.ts:707-727` | `writeGuarded`：先 `ensureParentDir` 建父目录，**之后**以 `final-write` 再调同一 gate；失败文案为「写入前复核未通过…（未写入目标文件；可能已创建父目录）」 |
| 3 | `src/pipeline/orchestration/run-role.ts:1754-1756, 3722-3733` | 会话 gate 调 `verifiedFileFacts`；`:3728` 的 `!checkGitProtectionFactsCurrent(protection)` 为真 ⇒ `:3719-3720` `file-gate-host-facts-unproven` |
| 4 | `src/provider/trunk/impl/git-command.ts:595-618` | `describe()` 把 `info.nlink` 纳入 `[realpath, dev, ino, birthtimeMs, isDirectory, isSymbolicLink, nlink]`；digest 覆盖 `describe(root)`/`describe(gitDir)`/`describe(config)`；`checkGitProtectionFactsCurrent` 对比签发时与当前 topology |
| 5 | `src/provider/trunk/impl/git-command.ts:573-593` | 无 `.git` 的 `absentProtectionTopology` 只记录 `[dir, dev, ino, birthtimeMs]`，**不含 nlink** |
| 6 | `src/pipeline/orchestration/run-role.ts:1543-1547, 1754-1756` | 会话打开时 `readGitProtectionFacts(input.project.projectRoot)` 签发 facts 并记录 topology；写入时复用该 facts 做 currency 复判 |

因果：macOS 上 `write_file docs/product/…` 首次 mkdir 顶层 `docs/` ⇒ 根 nlink +1 ⇒ final-write 的
`checkGitProtectionFactsCurrent` 重算 digest ≠ 签发时 digest ⇒ 拒绝；Windows 目录 nlink 恒定 ⇒ 不触发。
无 `.git` 时走不含 nlink 的 absent topology ⇒ 不受影响（W20/W21 绿的解释）。

### 1.2 工件与用例矩阵（`_evidence/01-artifact-corroboration.txt`）

- 数据源：R6 run `43848313583`（`/tmp/r9-art/test-logs-mac-x64`；本轮 arm64 缺失）、
  R5 run `43829367008`（`/tmp/r8-art` 三平台）。
- 精确串计数：

| 工件 | `file-gate-host-facts-unproven` | 其中「写入前复核未通过」 | 其他 gate 阶段文案 | Windows |
| --- | ---: | ---: | ---: | ---: |
| R6 mac-x64 | 55 | 55 | 0 | — |
| R5 mac-arm64 | 55 | 55 | 0 | — |
| R5 mac-x64 | 55 | 55 | 0 | — |
| R5 win-x64 | 0 | 0 | 0 | 0 |

- 用例矩阵（R6 mac-x64）：W20×2 ✔、W21×2 ✔；W29 document-change / wrong-flow / source-loss ✖、
  W29 missing-confirmation ✔；W30 连续写入后 / 真实重启迁移后 ✖；W34/W35 ✖（另一码，
  `git-file-final-guard-unproven`，见 §5）。
- Q2 P2（`test/测试/git-role-workflows-e2e.test.ts:2023`）断言的 `/已获准并落盘/` 实际收到同一
  「写入前复核未通过：…file-gate-host-facts-unproven…（未写入目标文件；可能已创建父目录）」；
  该用例先初始化 `.git`，再让 product 首次写 `docs/product/…`。

### 1.3 本机机制模拟（`_evidence/03-nlink-simulation.mjs` + 输出）

用真实 provider 导出的 `readGitProtectionFacts` / `checkGitProtectionFactsCurrent` /
`initializeGitRepository`，只在进程内让某目录的 `lstatSync().nlink` 呈现 +1（POSIX mkdir 的效果），
不改任何产品文件：

```text
absent coverage: complete check: true
absent after root nlink+1 (POSIX mkdir docs/): true
present coverage: complete reasons: [] check: true
present after real mkdir docs/ on win32 : true
present after simulated POSIX root nlink+1: false
present after nlink restored: true
```

即：present-repo 分支仅 nlink 变化即可把 currency 检查翻成 false；absent-repo 分支不受影响；
Windows 真实 mkdir 不改变结果。

### 1.4 已排除项

- **根拼写**（macOS `/var` → `/private/var`、Windows 8.3 短名）：v2.0.0 P0 已在
  `src/service/runtime/session.ts:503-513` 归一 `fileGateProtection.projectRoot`，B3-2b 已统一
  native realpath；本机 junction 别名 TEMP 模拟 W29/W30 6/6 绿。
- **stage/context 身份**：工件中 `host-facts-v1 stage not inspected`、`canonical/host coverage unknown`、
  `canonical/host facts changed`、`git-protection-root-changed` 均为 0 次。
- **`recheckFileInvocation` 先报错**：其 `canonicalFileFacts` 的 basisDigest/coverage 来自签发时 facts，
  不重读仓库 topology，不会产生其他文案（`tools.ts:618-640, 675-681`）。
- **配置/仓库内容变化**：`digest(readFileSync(config))`、sentinel 缺失、`.git`/根链接检查在 mkdir
  前后均不变；唯一变化量是目录 nlink（本机模拟逐一验证）。

## 2. 产品 diff：未应用（停止报告）

### 2.1 停止理由

- 正确最小修复位于 `src/provider/trunk/impl/git-command.ts`（运行时核心精确条目，见
  `角色卡/运行时核心/boundary.md` Delta-B2930-2；本角色边界中的 `src/provider/trunk/` 目录条目与
  该精确属主冲突，按模块边界规则以属主精确条目为准）。
- 任务约束明确：修复需跨入 `src/provider/trunk/**` 或语义不清时停下报告。
- run-role.ts 内替代方案均不合格：
  1. final-write 跳过 `checkGitProtectionFactsCurrent`：丢失 canonical-read→final-write 窗口内
     `.git`/config/目录身份被替换的检测，削弱 fail-closed；
  2. 在 pipeline 复制 topology 计算：第二份安全实现，违反单一属主/单一实现纪律；
  3. 调整 mkdir 与 final-write 的次序：`mkdir 后复用同一门禁复判` 是 provider 的既有安全设计，
     且属 `src/provider/runtime/tools.ts`（运行时核心写区）。

### 2.2 建议的最小补丁（属主执行；`_evidence/07-proposed-owner-patch.diff`）

`src/provider/trunk/impl/git-command.ts` `protectionTopology().describe()`：

```diff
-      return [realpathSync.native(file), info.dev, info.ino, info.birthtimeMs, info.isDirectory(), info.isSymbolicLink(), info.nlink];
+      // POSIX directory nlink = 2 + direct subdirectory count: ordinary mkdir under the root changes it.
+      // Directory identity is dev/ino/birthtime + realpath; keep nlink only for regular files
+      // (.git/config hardlink guard at :605 is separate and unchanged).
+      return [realpathSync.native(file), info.dev, info.ino, info.birthtimeMs, info.isDirectory(), info.isSymbolicLink(), info.isDirectory() ? 0 : info.nlink];
```

### 2.3 fail-closed 保持论证

- topology digest 仍覆盖：根/`.git`/config 的 `realpathSync.native`、`dev`、`ino`、`birthtimeMs`、
  是否目录、是否链接；config 内容 digest；全部 sentinel 的缺席。仅移除**目录** nlink（普通文件
  nlink 保留）。
- 目录 nlink 在 POSIX 上只是「直接子目录数」，不是身份/链接防护事实；目录不能被硬链接，
  链接替换由 `isSymbolicLink`/realpath 覆盖；硬链接攻击面（config/目标文件）由 `:605` 与
  `provider/runtime/tools.ts` 的 nlink=1 检查保留。
- 拒绝语义不变：根/`.git` 被替换、config 内容变化、sentinel 出现、根或 `.git` 变成链接、
  签发对象被复制（WeakMap 身份）仍全部 fail-closed。
- 建议同批回归钉：present-repo 根 `readGitProtectionFacts`（coverage complete）→ 根下 mkdir
  一级目录 → `checkGitProtectionFactsCurrent` 仍 true；absent-repo 同动作亦 true。

## 3. 测试改动：无

- 修复未落地，不在本工作树新增 macOS 红测试，不放宽任何既有断言。
- 建议的回归钉归运行时核心（随补丁同批提交，见 §2.3 与 `_evidence/07-proposed-owner-patch.diff`）。
- W29/W30/Q2 P2 的期望无需修改：修复后它们应在 macOS 自然转绿（W29 missing-confirmation 已经绿）。

## 4. 本机验证（Windows 11 Pro x64；Node v24.22.1，CI 为 24.14.0）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **EXIT=0** | `_evidence/04-local-runs/00-typecheck.txt` |
| W29/W30 目标 3×（`--test-name-pattern="W29 默认|W30 默认"`） | run2/run3 **6/6**；run1 5/6（W30 真实重启迁移后，`chief-workflow.test.ts:1949` 时序断言；见下） | `04-local-runs/01-w29-w30-run{1,2,3}.txt` |
| W30 真实重启迁移后 单名隔离 3× | **3/3 1/1** | `04-local-runs/02-w30-restart-isolated-run{1,2,3}.txt` |
| junction 别名 TEMP（模拟 macOS `/var` 祖先链接）W29/W30 1× | **6/6**（别名根拼写不触发） | `04-local-runs/03-junction-alias-w29-w30.txt` |
| `test/runtime-core/project-root-canonicalization.test.ts` | **12/12** | `04-local-runs/05-runtime-core-p0-canonicalization.txt` |
| `test/runtime-core/write-gate-context.test.ts` | **11/11** | `04-local-runs/06-write-gate-context.txt` |

- run1 的唯一失败是本机时序噪声候选：`Actual draft product must be registered before version two is
  authored`（W30 重启场景等待注册），与本调查的 `file-gate-host-facts-unproven` 无关；该名隔离 3×
  全绿，且本机 Windows 从未出现 file-gate 拒绝。未改测试，无新增红。
- 本机不修改产品/测试，因此不存在「本机改前/改后」对照；机制验证由 §1.3 的模拟承担。

## 5. macOS 待验证项与 W34/W35 观察计划

### 5.1 修复落地后的 macOS 复核清单

1. 运行时核心按 §2.2 修复 `protectionTopology`（并加 §2.3 回归钉）后，R7 三平台全量：
   - 期望 **W29×3、W30×2、Q2 P2 转绿**；W29 document-change-missing-confirmation 保持绿。
   - 若 arm64 runner 仍 job 级 cancelled，先按 R6 §6.1 重试；两平台结论分开记录。
2. 若仍红，收集：`file-gate-host-facts-unproven` 是否仍**只在「写入前复核未通过」**；若是，
   说明 topology 还有第二个可变分量（届时按同方法核对 `describe(root)` 其余字段与 sentinels）；
   若错误码变为 canonical/coverage 类，另行定性。
3. 修复补丁的验收证据建议包含：present-repo 根 mkdir 后 `checkGitProtectionFactsCurrent` 为真
   （macOS/arm64 上实际执行；Windows 恒真）。

### 5.2 W34/W35（`git-file-final-guard-unproven`）观察计划

- 现状（b4fu §1.2）：W34/W35 在 `git_candidate init` 即被 `trunk-runtime.ts:239-243` 的
  H12/B12 守卫拒绝，原因是 W33 遗留的 active Core 条目携带**旧临时根**的 `protectedGitRoots`
  （macOS init 时 active 5/7 vs Windows 2）；W33 又因同一 file-gate 缺陷在 `:1715` 早失败，
  清理链未完全 dispose。
- 预期：本修复使 W33 的 product 写入成功 ⇒ W33 正常收口/dispose；w19 批（W33 清理修复）合入后，
  W34/W35 的 init 不再看到异根 active 条目。**无需修改 W34/W35 期望**（B4 更新的断言在失败点之后）。
- 观察点（R7 macOS）：
  1. `W52 init actual Core registry` 控制台：W34/W35 init 时 active 条目应等于 own 2；
  2. 若仍 >2，记录遗留条目的 roleId/state/providerFinished 与 `git-file-final-guard-unproven` 原文，
     按平台链候选（清理面）单独定性，不并入本修复；
  3. W34/W35 若转绿，逐名记录在 R7 证据中（预期自愈的验证）；若仍红，保留为 follow-up，不改期望。

## 6. 限制与披露

1. 本机为 Windows 11，无 macOS 环境；macOS 结论来自 4 份 CI 工件（R5 arm64/x64、R6 x64）的
   精确串统计、用例矩阵与 trace，加上对真实 provider 函数的 nlink 模拟（§1.3）证明「仅 nlink
   变化即可翻 false」；`mkdir ⇒ 根 nlink +1` 是 POSIX/APFS 语义（本机只能证明 Windows nlink 恒定）。
   最终仍需 macOS CI 复跑确认。
2. 未修改产品代码/测试；未提交/触发 CI/tag/碰 main；未读 `.env`；未占用 9222/9223/9224。
3. run1 的 W30 重启时序失败为本机观测，未做负载实验；与本缺陷无关，且单名隔离 3× 绿。
4. `protectionTopology` 的修复建议基于只读代码分析：普通文件 nlink 保留、目录 nlink 归一为 0；
   若运行时核心认为还有其它目录属性需要纳入，属其裁量范围，需保持「同一真实根/链接/替换」的
   既有拒绝语义。
5. 未在 macOS 上验证 `/private/var` 下 `lstat` 的 nlink 具体数值；结论只依赖「随子目录数变化」
   与「Windows 恒 1」两条平台语义。

## 附录 A：证据索引（`角色卡/编排/docs/change/2026-11-16_macos-file-gate-host-facts_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-artifact-corroboration.txt` | 4 份工件精确串计数、W20/W21/W29/W30/W34/W35 矩阵、W29 trace 行、rapporteur 成功对照、Q2 P2 原文 |
| `02-code-chain.md` | 判定链 file:line、macOS 误判推导、已排除项、修复归属与替代方案否决 |
| `03-nlink-simulation.mjs` / `03-nlink-simulation-output.txt` | 真实 provider 函数上的 nlink 机制模拟（present/absent 两分支、Windows 真实 mkdir 对照） |
| `04-local-runs/` | typecheck、W29/W30 3×、W30 单名隔离 3×、junction 别名 1×、runtime-core P0 与 write-gate-context 原始日志与 README |
| `07-proposed-owner-patch.diff` | 建议的最小 provider 补丁（未应用）与同批回归钉说明 |

## 附录 B：复现命令

```bash
# 工件（原始只读，不入库）
# /tmp/r9-art/test-logs-mac-x64/test-ci-output.log
# /tmp/r8-art/test-logs-mac-{arm64,x64}/test-ci-output.log

# 本机目标 3×
node --test --test-timeout=120000 --test-force-exit \
  --test-name-pattern="W29 默认|W30 默认" "test/桌面应用/chief-workflow.test.ts"

# 别名根模拟（Windows directory junction）
cmd //c "mklink /J C:\Users\51054\Desktop\work\ans-temp-alias C:\Users\51054\AppData\Local\Temp"
TEMP='C:\Users\51054\Desktop\work\ans-temp-alias' TMP='C:\Users\51054\Desktop\work\ans-temp-alias' \
  node --test --test-timeout=120000 --test-force-exit \
  --test-name-pattern="W29 默认|W30 默认" "test/桌面应用/chief-workflow.test.ts"

# 机制模拟（不改产品文件）
node 角色卡/编排/docs/change/2026-11-16_macos-file-gate-host-facts_evidence/03-nlink-simulation.mjs

# 相关套件
node --test --test-timeout=120000 --test-force-exit "test/runtime-core/project-root-canonicalization.test.ts"
node --test --test-timeout=120000 --test-force-exit "test/runtime-core/write-gate-context.test.ts"
npm run typecheck
```

## 附录 C：关键结论速览

- **定性**：macOS 产品缺陷；根因 = `protectionTopology` 把目录 nlink 纳入 digest，`write_file`
  在 canonical-read 与 final-write 之间 mkdir 一级目录使根 nlink 变化 ⇒ final-write 误判
  Git protection facts 不 current ⇒ `file-gate-host-facts-unproven`。非根拼写问题（P0/B3-2b 已修）。
- **证据**：macOS 4 份工件 55/55 均为 mkdir 后复判；W20/W21（无 `.git`）绿、W29/W30（有 `.git`）红；
  nlink 模拟 flip；junction 别名绿。
- **产品 diff**：未应用（属主运行时核心；任务约束停止报告）；建议补丁见 `_evidence/07`。
- **fail-closed**：仅移除目录 nlink（POSIX 子目录计数，非身份事实）；文件 nlink、config nlink、
  realpath/dev/ino/birthtime、config 内容 digest、sentinels、WeakMap 签发身份全部保留。
- **验证**：typecheck EXIT=0；本机 W29/W30 3×（2× 全绿 + 1 个无关时序 flake，单名隔离 3× 绿）；
  junction 6/6；P0 12/12；write-gate-context 11/11。
- **macOS 待复核**：运行时核心修复后 R7 macOS x64/arm64：W29×3/W30×2/Q2 P2 预期转绿；W34/W35 按
  §5.2 观察（预期随 W33 写成功 + w19 清理链自愈，无需改期望）。
