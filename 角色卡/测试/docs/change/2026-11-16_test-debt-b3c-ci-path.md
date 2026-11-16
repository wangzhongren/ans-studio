# B3c（2026-11-16）：CI 路径规范形/守卫族 42 名/19 文件 — 先定性、后 harness 修复

- 角色：ANS「测试」（roleId: 测试）。
- 任务：测试债 B3c（ci-path-canonical，42 名/19 文件）——**先 CI-like 3× 定性**，区分产品回归 vs
  测试假设（假根 / 8.3 短路径 / 规范形 metadata roots / 真实会话事实缺失），再更新 harness。
- 工作树/分支：`.claude/worktrees/fix-test-debt-b3c` / `fix/test-debt-b3c`，起点 `8d6a35e`（= `origin/main`，
  含 B1b #110；对照 R3 CI 提交 `b522e0e` 仅有 B1b 测试变更，无产品差异）。
- 范围：只改测试文件/夹具 + 本记录与同名 `_evidence/`。未改产品源码/workflow/release.yml/角色卡/边界/
  其它测试；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 本机：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 24.14.0），npm 11.19.1。
- 证据：`角色卡/测试/docs/change/2026-11-16_test-debt-b3c-ci-path_evidence/`（下表与日志索引见 §附录）。

## 〇、结论摘要（先读）

1. **42 名中 41 名可在本机定性/转绿**：40 名本地转绿（multi-runtime 22、gate 3、cross 4、run-stop 1、
   session-admission 1、wiring 9），另 1 名（Q2 P2，git-role-workflows-e2e）本机 3× 绿但 CI macOS-only
   红，属**产品/宿主事实候选**（本地不可验证，未改）。
2. **未改产品代码**：所有本地可复现的失败均为**测试假设过时**，不是产品回归：
   - **18 名（wiring 9 + cross 4 + gate 3 + run-stop 1 + session-admission 1）**：夹具把 `mkdtemp`
     原拼写当作 `protectedGitRoots`，而 H12/B12 `git-file-final-guard-unproven` 用调用方根的
     **realpath 规范形**（`canonicalProjectRoot`）比对。macOS CI 的 `/var → /private/var` 符号链接
     （arm64/x64 41/41）与 Windows CI 的 8.3 短名（`RUNNER~1`）都会产生「同一真实根、不同拼写」。
     修复：夹具按真实根发布 protectedGitRoots（断言不放宽、用例不删）。
   - **initial-workflow 2 文件**（同属 wiring 9）：guard 修复后暴露第二层——trunk store 的
     workflow-source 目录校验要求 `realpath(dir) === dir`；夹具根创建即 `realpath`（真实根全程规范形）。
   - **multi-runtime 22 名 = 两组测试假设**（见 §3.3）：
     ① 8 名：e71501c 后 `desktop.sendSession` 只收 **chief 客户消息且必须显式 target**；旧用例直接向
     未打开的 `su/A` 发送（本地报 `D1 test wait expired` / 断言 false，CI 同名）。
     ② 14 名：harness 用 hardcoded `/one`、`/two` 项目根；本机恰好残留 `C:\one`/`C:\two` 才绿，干净
     CI（macOS）上 `SessionManager.open` 的库存登记失败 → `TypeError: Cannot read properties of
     undefined (reading 'input'/'handle')`。修复：真实临时根 + trio/chief 客户入口（断言不变）。
3. **未收敛 2 名（如实报告）**：
   - `Q2 P2 first new project…`（git-role-workflows-e2e）：CI macOS 子业务链 `file-gate-host-facts-unproven`
     （write_file 的 host facts/protection 不current），R3 已标 productCandidate；本机 3× 绿（176–192s/次），
     无本地可验证改法，未改。
   - `(unresolved) W48 … foreign-lease`：定位为 `test/桌面应用/chief-workflow.test.ts`（Windows-only inline、
     无错误体、CI 已取消）。语义属 e71501c/chief-workflow 漂移，不在 19 文件表内；本机 Windows 3× 绿。
4. **flake 披露**：两个 initial-workflow 文件在**测试体全绿**后偶发文件级进程不退出（≈1/12–3/20），
   与 B1b 记录 §6 的 Node 主线程自旋残余同型（无 ref'd 句柄、after-hook 计时器不触发、
   `--test-isolation=none` 也复现）。验证改用 `--test-force-exit` 3× 全绿并注明；建议 owner 决定
   `test-ci.yml` 是否加 `--test-force-exit`（B3c 不改 workflow）。
5. 验证：修改文件 junction/plain 各 3×（上述 flake 例外）；目标失败名逐名转绿；其余失败名零新增；
   `npm run typecheck` EXIT=0。

## 一、方法：CI-like 3× 定性与复现条件

- 命令口径同 CI：`node --test --test-concurrency=1 --test-timeout=120000 <file>`；外部墙钟 240s。
- **plain**：默认 `%LOCALAPPDATA%\Temp`。
- **junction（CI-like）**：`TEMP/TMP = …\Temp\ans-b3c-sim\junction`（junction → 真实目录）。
  这精确模拟 macOS `/var` 符号链接 / Windows 8.3 短名下的「同一真实根、不同拼写」；junction 模拟已
  验证能**逐字复现 CI 错误面**（`git-file-final-guard-unproven: Actual file/edit handlers do not carry
  the current canonical metadata roots and link guard`，见 `03-repro-*.log`）。
- 每文件 3×，记录失败名稳定性；只有稳定复现（3/3）才定性。plain 与 junction 的差异用于区分
  「环境/路径假设」与「真实测试失败」。

## 二、逐文件 3× 定性（详表：`01-characterization-3x.tsv`）

| 文件 | 族名数 | 基线（junction 3×） | 错误面 | 定性 |
| --- | ---: | --- | --- | --- |
| test/桌面应用/multi-runtime.test.ts | 22 | 8/8/8（本地子集；CI 22） | sendSession 失败/D1 wait/TypeError | 测试假设（e71501c 客户入口 + hardcoded 根），见 §3.3 |
| test/编排/git-action-authorization-gate.test.ts | 3 | 3/3/3 | git-file-final-guard-unproven | 测试假设：规范形 metadata roots |
| test/测试/git-action-cross-runtime-init.test.ts | 1 | 1/1/1 | 同上 | 同上（共享夹具） |
| test/测试/git-action-cross-runtime-audit-failure.test.ts | 1 | 1/1/1 | 同上 | 同上 |
| test/测试/git-action-cross-runtime-pi-init.test.ts | 1 | 1/1/1 | 同上 | 同上 |
| test/测试/git-action-cross-runtime-codex-init.test.ts | 1 | 1/1/1 | 同上 | 同上 |
| test/测试/run-stop-host-continuation-integration.test.ts | 1 | 1/1/1 | 同上 | 同上（本文件自有 fileGateOptions） |
| test/测试/session-admission-approval-q9-integration.test.ts | 1 | 1/1/1 | 同上 | 同上（共享夹具） |
| test/测试/git-role-workflows-e2e.test.ts | 1 | 本地 plain 3× 绿 | CI：file-gate-host-facts-unproven | CI macOS-only 产品候选，未改 |
| test/编排/git-action-authorization-wiring.test.ts | 1 | init 1/1/1；guards 1/1/1（本地 CRLF） | guard 码；本地源码切片 CRLF | 规范形 roots + 行尾归一（非目标本地红） |
| wiring-audit-failure / -document-audit-failure / -document | 各 1 | 各 1/1/1 | git-file-final-guard-unproven | 规范形 roots |
| wiring-initial-workflow-audit-failure / -initial-workflow | 各 1 | 各 1/1/1 | guard 码 → 修复后 trunk 源目录校验 | 规范形 roots + 夹具根 realpath |
| wiring-publication-audit-failure / -publication / -retry | 各 1 | 各 1/1/1 | git-file-final-guard-unproven | 规范形 roots |
| (unresolved) W48 → test/桌面应用/chief-workflow.test.ts | 1 | 本机 3× 绿 | CI Windows inline 无错误体 | 非规范形；B1b/B4 语境，未改 |

> 范围口径说明：`11-families.json` 的 ci-path-canonical 含 **9 个 wiring 文件**（含
> `git-action-authorization-wiring.test.ts`）。任务正文的 wiring 枚举漏列了该文件，本记录按证据族
> 口径纳入（其 1 名为 42 名之一）。

## 三、根因与改法

### 3.1 H12/B12 guard 的规范形 metadata roots（18 名）

- 产品事实（非缺陷）：`src/pipeline/orchestration/trunk-runtime.ts` H12/B12 对含 `write_file`/`edit_file`
  的 active Core 条目要求 `surface.fileWriteProtection.protectedGitRoots` 覆盖
  `[canonicalProjectRoot(projectRoot)/.git]`；`canonicalProjectRoot` 用 realpath（B3-2 注释：
  Windows 展开 8.3、解析符号链接祖先）。
- 夹具事实：`test/测试/git-action-cross-runtime-fixture.ts::fileGateOptions`、各测试文件内联
  `fileGateOptions`、`test/编排/fixtures/git-action-authorization-wiring.ts::w3bFileGateOptions`
  都把 `mkdtemp` 原拼写塞进 protectedGitRoots。`mkdtemp` 在 macOS 返回 `/var/...`（realpath 为
  `/private/var/...`），在 Windows CI 返回 `RUNNER~1` 短名（realpath 展开长名）⇒ 字符串比对失败。
- 改法：以上 helper 统一 `realpathSync(root)` 后构造 `protectedGitRoots`/`fileGateProtection.projectRoot`
  （`writeRoot` 保留原拼写，仅作能力开关）。断言零放宽；本地 `realpath(mkdtemp)===mkdtemp`，行为不变。

### 3.2 initial-workflow 第二层：workflow-source 目录规范形（2 名）

- guard 修复后两文件进入真实 stable-write 链，`bindInitialWorkflowSource` 在
  `src/provider/trunk/impl/git-trunk-store.ts:215` 以 `realpath(dir) === dir` 拒绝非规范目录
  （`workflow-source-directory-unsafe`）。夹具根仍是 raw 拼写 ⇒ 在 junction/macOS 下失败。
- 改法：wiring 夹具的 `createInitFixture` / `createPublicationFixture` / `createDocumentFixture`
  **创建即 realpath**（root = canonical），后续 store/service/session/inventory 全部同一真实根。
  断言不变。

### 3.3 multi-runtime 22 名（本地 8 + CI-only 14）

- **8 名（e71501c 客户入口契约）**：`desktop.sendSession` 现在要求显式
  `target: { projectRoot, roleId: "chief", runtime }` 且 chief 必须是 listing 中的角色。旧用例
  `openSession(A/su)` + `sendSession({text})` 必然失败（本地 `D1 test wait expired` / false）。
- **14 名（hardcoded 项目根）**：harness 测试用 `/one`、`/two` 作为 `manager.open` 根。桌面会话库存
  登记要求根真实存在；本机 `C:\one`、`C:\two` 是 2026-10-28 遗留目录（其中 `C:\one\.ans`），所以
  本地绿、CI macOS 红（`TypeError reading 'input'/'handle'` = `opened[0]` 从未创建）。
- 改法（断言/语义不变）：
  1) `fixture({ trio: true })`：写 `.ans/project.json {workflowSchema:"legacy/v1", governanceModel:"trio"}`
     + 保留 `角色卡/A`，使真实 `listProject` 同时给出内置 chief 与项目角色 A；客户消息按产品契约投
     chief。引擎/D1R2 用例由 `openSession(A)` 改为 `openSession(chief)`，显式 target chief；history/
     storage 角色改 chief；`assert .ans 不存在` 改为更精确的 `.ans/sessions` 不存在（trio 配置本身在 .ans）。
  2) 14 个 harness 用例改用 `projectRoots()`（真实 mkdtemp 下 one/two 子目录）并在 finally cleanup；
     发送/断言字符串同步为新根。request_choice 用例改用 `SessionManager` 层驱动同一真实 Pipeline
     （single 内置 `su` 才有客户确认制；e71501c 后 desktop 客户入口不可达 su），断言逐条保留。

### 3.4 Q2 P2（CI macOS-only，产品候选，未改）

- CI：owned business child 的真实 write_file 被 `file-gate-host-facts-unproven: genuine current stage,
  roots and Git protection basis are required` 拒绝；父进程随后在生命周期断言失败。
- 本机 plain 3×：Q2 P2 ✔（176.7s/178.5s/192.3s）。本机无法复现，且修复点位于真实 driver/business 链的
  host facts/protection currency（run-role `verifiedFileFacts`），非 18 文件 harness；按要求“产品候选 →
  停手报告”。建议下一轮 macOS 定向（B5/B6 或 R4 CI）验证 host facts 的 projectRoot/basisDigest 归一。

### 3.5 W48（unresolved，未改）

- 定位：`17-windows-names.tsv` + R3 §4 ⇒ `test/桌面应用/chief-workflow.test.ts` 的
  `stopMode="foreign-lease"` 变体；Windows CI 取消前 inline 出现、无错误体。
- 本机 Windows pattern 3×：pass=1 各次。非路径规范形问题；chief-workflow 不在 19 文件表内且 B1b 刚改过
  该文件，保留给 B1b/B4 语境。若 CI 复现需 R4 提供完整 Windows 错误体。

## 四、改动文件（6 个；含 2 个共享 helper——按要求先在此报告）

| 文件 | 改动 |
| --- | --- |
| test/测试/git-action-cross-runtime-fixture.ts | `fileGateOptions` 用 `realpathSync` 规范 protectedGitRoots/projectRoot（共享 helper，另有 6 个范围外使用方，见 §六） |
| test/编排/fixtures/git-action-authorization-wiring.ts | `w3bFileGateOptions` 规范根；publication 的 workflow 写会话 fileGateProtection 用 canonical；三类 fixture 根创建即 realpath（共享 helper，仅 9 个 wiring 文件使用） |
| test/编排/git-action-authorization-gate.test.ts | 本文件 `fileGateOptions` 规范根 |
| test/测试/run-stop-host-continuation-integration.test.ts | 本文件 `fileGateOptions` 规范根 |
| test/桌面应用/multi-runtime.test.ts | trio fixture + chief 客户入口（8 名）；14 个 harness 用例真实临时根 + cleanup；request_choice 改 SessionManager 层驱动 |
| test/编排/git-action-authorization-wiring.test.ts | 源码切片读取后 `replaceAll("\r\n","\n")`（本机 core.autocrlf 与 CI LF 差异；非目标本地红） |

未改：产品源码、workflow、release.yml、角色卡、边界、其它测试；未删除/放宽任何断言、未加 skip
（`--test-force-exit` 仅用于两个 flake 文件的验证，并已注明）。

## 五、验证

- **junction（CI-like）3×**：18 文件全部 P P P；例外：initial-workflow 一文件在一次 18 文件批次中
  测试体通过但进程退出被 240s 墙钟截断（flake，见 §六），单独 3× 自然退出曾 P P P，`--test-force-exit`
  3× P P P。
- **plain 3×**：16 个非 flake 文件全部 P P P；两个 initial-workflow 文件用 force-exit P P P。
- **目标失败名**：所有 40 个本地可复现名逐名转绿；Q2 P2/W48 见 §3.4/§3.5。
- **零新增**：修改文件与基线失败名对比，无新增失败名；wiring.test.ts 的本地 CRLF 非目标红同时转绿。
- **typecheck**：`npm run typecheck`（tsc --noEmit）EXIT=0（`07-typecheck.log`）。
- 范围外共享 helper 使用方抽查：activation/commit-pi/run-stop-host-continuation e2e 绿；
  commit-claude 测试体绿、文件级退出受既有 custom-provider 退出风格影响（`09-*.txt`）。

## 六、剩余项 / 产品候选 / flake 披露

1. **Q2 P2**：CI macOS-only `file-gate-host-facts-unproven`；本机 3× 绿；产品候选，未改，建议 macOS 定向
   定性（host facts 的 projectRoot/basisDigest 归一）。
2. **W48 foreign-lease**：Windows CI inline-only、无错误体；本机 3× 绿；非规范形，未改。
3. **initial-workflow 退出 flake**：测试体全绿后偶发进程不退出（junction 3/20、plain 1/12、
   `--test-isolation=none` 2/8）；无 ref'd 句柄、after 计时器不触发，与 B1b §6 Node 主线程自旋残余同型。
   B3c 未引入该自旋；修复使两文件首次走完真实链，暴露概率上升。建议 owner 决定 CI 是否加
   `--test-force-exit`（B3b/B1b 已提出同一建议）。详见 `08-flake-disclosure.md`。
4. **范围外使用方**：cross-runtime 共享夹具另有 judge-delegated-effectiveness、git-action delivery/
   activation/commit、run-stop e2e、git-write-chain 等使用方；本地 `realpath==raw`，夹具输出逐字不变；
   CI 上该改动只会把同类规范形问题一并修好（不会放宽）。
5. **平台边界**：本地为 Windows；macOS `/var` 用 junction 模拟（已验证能逐字复现 CI 错误码），但
   macOS 真机的 CI 行为仍需下一轮 CI 复核（尤其 Q2 P2）。

## 附录：证据索引（`…_evidence/`）

| 文件 | 内容 |
| --- | --- |
| 01-characterization-3x.tsv | 逐文件 baseline/final × plain/junction 3× 表与定性 |
| 02-target-42-names-by-file.txt | 42 名按文件分组（含 errorFirst/codes） |
| 03-repro-junction-cross-runtime-init.log / 03-repro-junction-wiring-publication.log | junction 下逐字复现 CI guard 错误 |
| 04-multi-runtime-baseline-{plain,junction}.log | multi-runtime 本地基线 8 名（plain=junction） |
| 05-final-3x-matrix.txt | 最终 junction/plain 3× 矩阵与目标名增量 |
| 06-q2p2-and-w48-local-3x.txt | Q2 P2 本机 3×、W48 本机 3× 证据 |
| 07-typecheck.log | `npm run typecheck` EXIT=0 |
| 08-flake-disclosure.md + 08-flake-*.log / 08-force-exit-*.log | initial-workflow 退出 flake 披露与 force-exit 验证 |
| 09-out-of-scope-fixture-users.txt | 共享 helper 范围外使用方抽查 |
