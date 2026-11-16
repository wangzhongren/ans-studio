# W：B2 macOS git-config 平台族——core 白名单放行 `precomposeunicode`（运行时核心，2026-11-16）

- 角色：ANS 固定 worker「运行时核心」（roleId: 运行时核心），独立上下文。
- 任务：测试债治理第二批 B2（P0）——macOS `git init` 默认写入 repo-local `core.precomposeunicode=true`，产品 `configFormat()` 的 core 白名单没有该键，导致真实 git 夹具在 `inspectGitRepository` 阶段全部 `git-config-executable-or-unsupported`；按协调者裁定做**最小产品修复 + 测试钉 + 探针复核 + 26 文件受影响面复跑**。
- 工作树：`.claude/worktrees/fix-test-debt-b2`（分支 `fix/test-debt-b2`，起点 `ee26b44` = `origin/main`，含 R2 计划提交 `4b688ad`）。
- 依据：
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan.md` §2.1 第 1 条（macOS git-config 平台族 113 名 / 26 文件）、§4.3 B2 批次、§7.4 / §8.1（证据边界与批准请求）。
  - `…_evidence/13-precompose-probe.mjs` / `.txt`（R2 探针：`WITH_KEY=REJECTED message=git-config-executable-or-unsupported`、`WITHOUT_KEY=ACCEPTED objectFormat=sha1`）。
  - `…_evidence/10-block-codes.json`：macOS arm64/x64 各 113 个该族块，其中 113 含 `git-config-executable-or-unsupported`、21 含下游 `git-initialization-effects-pending`、22 含 `ERR_ASSERTION`、1 含 `git-config-section-unsupported`。
  - `…_evidence/07-by-file.tsv`、`…_evidence/11-families.json`（family `macos-git-config`，26 文件、113 名，逐文件计数见 `b2-17-family-files-26.tsv`）。
- 协调者裁定：**B2 产品修复批准**——`src/provider/trunk/impl/git-command.ts` 的 core 白名单加入 `precomposeunicode`（仅接受布尔 true/false；其余 section/key 与既有一切 fail-closed 逐字不变）。理由：macOS `git init` 默认写该键、真实用户必中；与 B30 `[user]` 白名单同一先例（只读语义、非执行面扩大）。

## 一、根因与产品修改（最小）

- 根因（高置信，R2 已探针复现）：`configFormat()`（`src/provider/trunk/impl/git-command.ts:509`）遍历 `.git/config` 时，`allowed.core` 不含 `precomposeunicode`，命中原第 526 行 `!allowed[section]?.includes(key)` ⇒ `git-config-executable-or-unsupported`。macOS 的 `git init` 会在 repo-local config 写入 `precomposeunicode = true`，因此 CI macOS 上所有真实 git 夹具在 inspect 阶段即被拒，产生 113 名失败（含 21 名下游 `git-initialization-effects-pending` / `ERR_ASSERTION`）。
- 产品 diff（`src/provider/trunk/impl/git-command.ts`，**+3/−1**，仅此一处）：
  - `allowed.core` 追加 `"precomposeunicode"`；
  - 新增 2 行 B2 注释说明 macOS 默认键与「只读语义、仅布尔」边界。
  - 未改：命令构造、执行面、inspect 其余校验、`[user]` B30 分支、`extensions`、任何错误码文案、任何其他 section/key。

### 1.1 解析规则（放行后实际行为，均由既有分支自然产生，无新增分支）

| 输入（追加到真实 `.git/config`） | 结果 | 错误码/说明 |
| --- | --- | --- |
| `[core] precomposeunicode = true` / `= false` | **接受** | 与 filemode/ignorecase 同分支；值统一 `toLowerCase()` 后比较，`TRUE`/`False` 等大小写按既有 git 语义被接受（既有布尔键同样行为） |
| `[core] precomposeunicode = yes` / `= 1` / `= always` | 拒绝 | `git-config-value-invalid`（同 filemode 等：本产品只接受 true/false，不认 git 的 yes/no/on/off/1/0 别名；与既有一致） |
| `[core] precomposeunicode =`（空值）/ 含非 `[a-z0-9]` 字符（如 `$(rm -rf /)`） | 拒绝 | `git-config-executable-or-unsupported`（entry 形状不匹配，与既有非布尔条目一致） |
| `[extensions] precomposeunicode = true` / `[user] precomposeunicode = true` | 拒绝 | `git-config-executable-or-unsupported`（键不在该 section 白名单） |
| `[core] autocrlf = true` / `[core] editor = vim` 等未白名单 core 键 | 拒绝 | `git-config-executable-or-unsupported`（逐字不变） |
| `core.hooksPath` / `alias` / `include` / `includeIf` / 未知 section | 拒绝 | 逐字不变（B30 既有矩阵继续覆盖） |

## 二、测试钉（`test/编排/git-command.test.ts`，+39/−0，纯新增，既有断言逐字未动）

新增 2 条测试（插在 B30 两条之后、alternates 之前）：

1. `B2 macOS core.precomposeunicode accepted: real repo-local Boolean true/false no longer block inspect or status beside existing core keys and B30 user identity`
   - 对 `true` / `false` / `TRUE` 三个真实写入值循环：用真实 Git（`git config --local`）写入 `core.precomposeunicode`，模拟 macOS `git init` 的 repo-local 默认键（Windows `git init` 不写该键）；
   - 断言 fixture 的 `.git/config` 逐字含 `precomposeunicode = <写入值>`（Git 原样写入，大写不被归一）；
   - 与 `git init` 既有 core 键（filemode/bare/logallrefupdates/symlinks/ignorecase）及 B30 `[user] name=ANS` **共存**时：`createGitQueryPort(...).inspect()` 成功（repoId 64 hex、objectFormat=sha1），`query({template:"status"})` 真实 exit 0 且输出含文件——证明修复位于共享 inspect 层、后续只读命令路径同时恢复。
2. `B2 precomposeunicode stays fail-closed: non-Boolean values, wrong sections and other unlisted core keys keep the existing rejections`
   - 9 组负例：`yes`/`1`/`always` ⇒ `git-config-value-invalid`；空值、`$(rm -rf /)`、`[extensions]`、`[user]`、`core.autocrlf`、`core.editor` ⇒ `git-config-executable-or-unsupported`；
   - 逐组断言后恢复原 config 字节，不污染后续用例。

## 三、探针复核（本机 Windows，Node v24.22.1 / git 2.55.0.windows.5）

### 3.1 R2 探针（同一脚本 `13-precompose-probe.mjs`，只读；`--repo` 指向本工作树）

修复前（`b2-01-probe-before-fix.txt`，与 R2 证据一致）：

```
--- .git/config after git config core.precomposeunicode true ---
[core]
	repositoryformatversion = 0
	filemode = false
	bare = false
	logallrefupdates = true
	symlinks = false
	ignorecase = true
	precomposeunicode = true
WITH_KEY=REJECTED message=git-config-executable-or-unsupported
WITHOUT_KEY=ACCEPTED objectFormat=sha1
```

修复后（`b2-08-probe-after-fix.txt`）：

```
WITH_KEY=ACCEPTED (unexpected) objectFormat=sha1
WITHOUT_KEY=ACCEPTED objectFormat=sha1
```

> 注：脚本注释与 `(unexpected)` 文案是 R2 修复前口径（预期 WITH_KEY 被拒）；修复后的判定看字面值 `WITH_KEY=ACCEPTED`、`WITHOUT_KEY=ACCEPTED`。脚本本身未修改。

### 3.2 真实临时仓库 + 受影响命令路径（`b2-09-real-repo-path-after-fix.txt`）

Windows 上 `git init` 不默认写该键，故显式模拟 macOS：临时仓库 `git init` → `git config --local core.precomposeunicode true` → 再写 B30 默认身份 `user.name=ANS / user.email=ans@local` → 经公共 API `createGitQueryPort` 跑真实只读命令路径：

```
REAL_REPO_INSPECT=ACCEPTED objectFormat=sha1 repoIdLen=64
REAL_REPO_STATUS termination=exited exitCode=0 stdoutHasFile=true
```

## 四、受影响面复跑（26 文件，Windows 本机，修改前/后同命令逐名对照）

- 命令口径：`node --test --test-timeout=120000 --test-reporter=tap <files...>`；e2e/桌面重文件组另加 `--test-force-exit`（避免 CI 已知的泄漏句柄不退出；**已披露**，该标志只影响进程退出，不影响测试断言）。
- 分组（26 文件全覆盖，逐文件归属见 `b2-17-family-files-26.tsv`）：
  - core12：git-command、git-shell-acl、git-trunk-store、git-capabilities、bootstrap-frozen-closure-integration、freeze-closure、git-operation-sidecar-tolerance、readonly-git-transport、run-role-submit-capabilities、direct-role-capabilities、project-root-canonicalization、git-capability-tools；
  - wiring6：`git-action-authorization-wiring-{document,document-audit-failure,initial-workflow,initial-workflow-audit-failure,publication,publication-audit-failure}`；
  - e2e6：git-action-commit-claude、git-action-commit-pi、git-action-delivery-claude、git-run-stop-host-continuation、git-action-activation、2026-11-09_judge-delegated-effectiveness；
  - git-role：git-role-workflows-e2e；chief：chief-workflow。
- 结果（before → after；逐名 diff 见 `b2-16-failname-compare.txt`）：

| 组 | 修改前 | 修改后 | 失败名新增 | 失败名移除 |
| --- | --- | --- | --- | --- |
| core12（12 文件） | 205 tests / 194 pass / **9 fail** / 2 skip | 207 tests / 196 pass / **9 fail** / 2 skip（+2 为新钉） | **0** | 0 |
| wiring6（6 文件） | 6/6 pass | 6/6 pass | 0 | 0 |
| e2e6（6 文件） | 6/6 pass | 6/6 pass | 0 | 0 |
| git-role-workflows-e2e | 19 tests / 5 pass / **2 fail** / 12 skip | 19 tests / 7 pass / **0 fail** / 12 skip | **0** | 2（Q30/Q74，见下） |
| chief-workflow | 66 tests / 58 pass / **8 fail** | 66 tests / 58 pass / **8 fail** | **0** | 0 |
| **合计** | **302 tests / 19 fail / 14 skip** | **304 tests / 17 fail / 14 skip** | **0** | 2 |

- 修改前后稳定出现的 17 名均为本机既有红/平台差异（与 B0/B7/KR 既有登记吻合，不是本次引入）：
  - core12 的 9 名：R8/R12 系列 7 名（runtime-core 既有红）+ `Git team plan publication and active-only activation…`（冻结 KR 跨列）+ `Chief资源正文…`（bootstrap 既有红）；
  - chief-workflow 的 8 名：W5/W10/W19/W33/W34（e71501c 语义漂移族）+ selected/commit-race/required（父子计数名），与修改前逐名一致。
- Q30/Q74 前后差异说明（**与本产品修复无关**）：修改前那次 `git-role-workflows-e2e` 是当日首次运行，`角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/` 目录不存在，Q30/Q74 在文件内先执行，`fs.writeFile` 直接 ENOENT（错误体见 `b2-05-…before.tap` 第 1–2 块）；该文件后续用例经 `git-role-workflows-driver` 的 `mkdir(path.dirname(...), {recursive:true})` 在 09:41:47 重建了该未跟踪目录，故修改后运行时 Q30/Q74 前置条件已满足而转绿。这正是 R2 计划 §4.9/§8 Q30 的既有测试债（B6 处理），产品修改不可能创建该目录。若需严格 A/B，可在清空该目录后复跑修改后代码，Q30/Q74 会再次 ENOENT（预期，不改本次结论）。
- **结论：26 文件复跑零新增失败；本机（Windows）无法复现 macOS 特有的 113 名，清零以 macOS CI 复跑为准。**

## 五、验证

| 范围 | 结果 | 证据（SHA-256） |
| --- | --- | --- |
| `npm run typecheck` | **EXIT=0** | `b2-10-typecheck.txt`（`9d1adbac…`） |
| `test/编排/git-command.test.ts`（含 2 条新钉） | **17/17 pass，EXIT=0** | `b2-07-git-command-after.tap`（`1a58edf6…`） |
| 探针修复前/后 | `WITH_KEY=REJECTED → ACCEPTED`；`WITHOUT_KEY=ACCEPTED` 不变 | `b2-01-probe-before-fix.txt` / `b2-08-probe-after-fix.txt` |
| 真实临时仓库路径 | inspect ACCEPTED + status exit 0 | `b2-09-real-repo-path-after-fix.txt` |
| 26 文件本机前后对照 | 零新增失败（17 名既有红逐名一致） | `b2-02/03/04/05/06-…-before.tap`、`b2-11/12/13/14/15-…-after.tap`、`b2-16-failname-compare.txt` |

三套冻结 known-red（runtime-core 33 / 门禁 5 / 编排 24）按协调者要求不由本批运行（统筹复核）。

## 六、产物清单

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/provider/trunk/impl/git-command.ts` | M | 91,568 / 1,083 | `f385396d5f4c07c2944a9b4e3e03da6444c1bba4a4409126c6305d49de0d2b77` | +3/−1 |
| `test/编排/git-command.test.ts` | M | 26,419 / 275 | `f5726c7cd8be79cd83ecc9450ade97aa1192307c366d538877800fd56d781b3d` | +39/−0 |
| 本记录 + `…_evidence/`（b2-00…b2-18） | 新增 | — | 逐文件见下 | — |

- 基线头：`b2-00-baseline-head.txt`（HEAD `ee26b44`，分支 `fix/test-debt-b2`；`bbc1396e…`）。
- 完整 diff 快照：`b2-18-worktree.diff`（`a74b6fea…`）。
- 证据目录：`角色卡/运行时核心/docs/change/2026-11-16_test-debt-b2-macos-git-config_evidence/`（探针前后输出、真实仓库验证、typecheck、10 个 TAP、逐名对照、26 文件表、diff 快照、基线头）。

## 七、风险与限制

1. **平台证据边界**：本机 Windows 的 `git init` 不写 `core.precomposeunicode`；修复由探针显式写入复现的 macOS 形态证明。macOS 真实 `git init` 默认写键属上游 git 行为，R2 证据亦未在 macOS runner 抓取 `.git/config` 原文。**113 名清零必须以 macOS CI 复跑（arm64/x64）确认**；若仍有残留，回 B6 逐名定性（R2 计划 §7.4）。
2. **放行面**：仅新增一个只读布尔键；`hooksPath/alias/include/includeIf`/未知 section/其余布尔键语义逐字不变（负例钉覆盖）。`configDigest` 仍绑定原始字节，Git 保护事实不受影响。
3. **`--test-force-exit` 披露**：e2e/桌面重文件组前后两轮均使用，仅用于避免 Windows 已知泄漏句柄导致不退出；测试断言与计数不受影响。core12/wiring6 未使用。
4. **测试副产物（重要）**：跑 `git-role-workflows-e2e` 会重建**未跟踪**目录 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`（本次约 **655MB / 93 文件**，即 R2 计划 §4.9/§8 Q30 的既有测试债）。该目录不属本批产物，**提交前必须清理且不得 `git add`**；建议 B6 按 Q30 条目改为测试自建临时 fixture。
5. 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224；未修改其他产品/测试/workflow/release/角色卡/边界文件。
