# 02 — 代码链与根因（只读分析，工作树 macgate @ d1f256f）

## 判定链（一次 `write_file`）

1. `src/provider/runtime/tools.ts:650-674` `beginFileInvocation`
   - `lexical-read` gate → `canonical-read` gate → 读取前 `finalFileProtection`/`guardWriteTarget`。
   - `canonical-read` 时 `verifiedFileFacts` 需 `checkGitProtectionFactsCurrent(protection)` 为真。
2. `src/provider/runtime/tools.ts:684-727` `writeGuarded`
   - 步骤 2：`ensureParentDir(guarded.target.parentAbs)`（`write_file` 需要；`edit_file` 不需要）。
   - 步骤 3：`stagedFileGate(..., "final-write", data)` **mkdir 之后**再次调用同一个写入门禁。
   - 失败文案在 `:726`：`${name} 写入前复核未通过：${result.message}（未写入目标文件；可能已创建父目录）`。
3. `src/pipeline/orchestration/run-role.ts:1754-1756`（会话门禁）→ `:3722-3733` `verifiedFileFacts`
   - `:3728` 条件 `!checkGitProtectionFactsCurrent(protection)` 为真即 `undefined` → `:3719-3720` `fileFactsDenied()`
     （`file-gate-host-facts-unproven: genuine current stage, roots and Git protection basis are required`）。
4. `src/provider/trunk/impl/git-command.ts:595-612` `protectionTopology(root)`
   - `:601` `describe()` 返回 `[realpathSync.native(file), dev, ino, birthtimeMs, isDirectory(), isSymbolicLink(), nlink]`；
   - `:611` digest 包含 `describe(root)`、`describe(gitDir)`、`describe(config)`、config 内容 digest 与 sentinels。
   - `:614-618` `checkGitProtectionFactsCurrent` 比较**签发时**记录的 topology 与**调用时**重算的 topology。
   - `:573-593` `absentProtectionTopology`（无 `.git` 分支）只记录 `[dir, dev, ino, birthtimeMs]`——**不含 nlink**。

## macOS 为何误判

- POSIX/APFS：目录 `nlink = 2 + 直接子目录数`；在项目根下创建任何**一级目录**（如首个
  `docs/`、`src/`）都会把根目录 nlink +1，创建 `.git/refs/ans` 等也会改 `.git` 的 nlink。
- Windows（NTFS）：目录 `nlink` 恒为 1（本机实测：新建两个子目录前后均为 1），同一代码在 Windows CI 不会变化。
- `write_file` 的 `ensureParentDir` 恰好发生在 canonical-read 与 final-write 之间：
  - 首次写 `docs/product/...` 时 mkdir 创建顶层 `docs/` ⇒ 根 nlink 变化；
  - final-write 重新 `verifiedFileFacts` ⇒ `checkGitProtectionFactsCurrent` 重算 topology ⇒ digest 不同 ⇒ 拒绝。
- 只在**项目已有 `.git`** 时出现（present-repo 分支把 nlink 纳入 digest）；无仓库时走
  `absentProtectionTopology`（不含 nlink），mkdir 不影响判定。这与工件矩阵完全一致：
  - W20×2 / W21×2（首次 product 写入前无 `.git`）macOS 绿；
  - W29×3 / W30×2 / Q2 P2（先 `git_candidate init` 建 `.git`，再 product 首次写入）macOS 红；
  - rapporteur 的写入在 product 首次 mkdir 之后，顶层 `docs/` 已存在 ⇒ 根 nlink 稳定 ⇒ 成功。

## 已排除的其他分支（工件与代码共同排除）

- `host-facts-v1 stage not inspected`、`canonical/host coverage unknown`、`canonical/host facts changed`、
  `git-protection-root-changed`：4 份 macOS 工件均为 0 次；唯一出现的包裹文案是「写入前复核未通过」。
- 根拼写（`/var` → `/private/var`、Windows 8.3 短名）：已由 v2.0.0 P0（`session.ts:503-513` 归一，
  runtime-core 记录 `2026-11-12_release-blocker-macos-root.md`）与 B3-2b 处理；
  本机 junction 别名 TEMP 模拟 W29/W30 6/6 绿（`04-local-runs/03-junction-alias-w29-w30.txt`），
  说明「仅符号链接祖先/别名拼写」不触发本缺陷。
- `recheckFileInvocation`（`tools.ts:675-681`）只重算 `canonicalFileFacts`（basisDigest/coverage/
  protectedRoots 均来自签发时 facts，不重读仓库 topology），不会先一步产生其他文案。

## 修复归属

- 正确最小修复位于 `src/provider/trunk/impl/git-command.ts` 的 `describe()`：目录 `nlink` 不参与
  protection topology（文件 nlink 保留；`.git/config` 的 `nlink===1` 校验在 `:605` 原样保留；
  `src/provider/runtime/tools.ts` 中目标文件 nlink=1 防护不在本链上，也不改动）。
- `src/provider/trunk/impl/git-command.ts` 在当前 main 由「运行时核心」角色按精确文件条目持有
  （`角色卡/运行时核心/boundary.md` Delta-B2930-2）；本任务约束明确：需要跨入 `src/provider/trunk/**`
  时停下报告。因此本角色未修改产品代码。
- run-role.ts 内没有不削弱 fail-closed 的替代修法：final-write 若跳过 `checkGitProtectionFactsCurrent`，
  会丢掉「canonical-read 之后 `.git`/config/目录身份被替换」的窗口检测；在 pipeline 复制 provider 的
  topology 计算会形成第二份安全实现。两者均违反单一属主与 fail-closed 约束。
