# v2.1.0 发布阻断诊断：project-document B 族 arm64 UNSUPPORTED_ENVIRONMENT 文件系统诊断（2026-11-17）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.1.0 发布阻断**诊断批**——给 `test/桌面应用/project-document.test.ts` 加测试侧文件系统诊断（不改产品、
  不放宽断言），并把该文件精确加入 release overlay 白名单，供下一轮 arm64 CI 日志定位 `UNSUPPORTED_ENVIRONMENT`。
- 工作树/分支：`.claude/worktrees/fix-project-doc-fs-diagnostics` / `fix/project-doc-fs-diagnostics`，
  基线 HEAD `9881e2b`（= origin/main；含 release-prepare 普通 clone 修复与 release.yml 45→120 分钟超时修复，
  后者本批**未触碰**）。
- 授权：协调者任务书；写区为 project-document 测试、release-policy 白名单与本文记录。
  （执行中发现了任务书未列、但与白名单条目强耦合的 `test/装配/release-packaging.test.ts` 必红，见 §四披露。）
- 声明：只加测试侧诊断、不改产品语义；未改 release.yml、release-policy.d.mts、产品代码；未运行 Electron、
  未使用真实模型/凭据；未 commit/push。

## 一、背景与证据

- 发布 run **44032276465**：Windows build 全绿；**arm64 Regression 失败 27 个唯一 ✖**，全部是
  `test/桌面应用/project-document.test.ts` 的 **B 族**（B Model budget / B Provider refuses /
  B Provider detects check-open / B Service issues opaque refs / B Service fatal UTF8 / B Pipeline /
  B Provider rejects symlink parents / B Provider detects in-place growth / B refs cannot be minted /
  B failed-cancelled native imports / role-root 两条 Service 用例等）。
- 错误：`UNSUPPORTED_ENVIRONMENT`；栈在 `src/provider/project-document/impl/file-reader.ts:28`：
  ```ts
  const localTypes = new Set([26, 23, 17, 0xef53, 0x1021994, 0x794c7630, 0x9123683e, 0x58465342]);
  const stat = await fs.statfs(root);
  if (!localTypes.has(stat.type)) fail('UNSUPPORTED_ENVIRONMENT');
  ```
- 对照事实：旧 run（linked worktree）这些 B 测试为 ✔；test-ci arm64 同提交全绿 ⇒ 疑为该 runner 实例临时目录
  的文件系统类型差异（`fs.mkdtemp(os.tmpdir())` 的 statfs type 不在白名单）。
- x64 因 45 分钟作业时限被取消；协调者已在 release.yml 修 45→120（本批不得触碰）。

## 二、诊断实现（`test/桌面应用/project-document.test.ts`）

新增 helper（仅诊断、原样失败）：

- `statfsType(p)`：`statfsSync(p).type` 的十进制 + 十六进制（如 `26 (0x1a)`）；失败返回 `statfs-error:<msg>`。
- `diagnoseFs(t, root, phase)`：
  `t.diagnostic('FS_DIAGNOSTIC phase=... platform=... arch=... tmpdir=... tmpdirType=... root=... rootType=...')`。
- `resolveRootWithDiagnostics(t, provider, root)`：`try await provider.resolveRoot(root)`；catch 到
  `DocumentFileError && code==='UNSUPPORTED_ENVIRONMENT'` → `diagnoseFs(t, root, 'resolveRoot')` → **原样 rethrow**。
- `diagnoseListing(t, root, view)`：`process.platform!=='win32'` 且
  `view.documentReadUnavailable==='UNSUPPORTED_ENVIRONMENT'` → `diagnoseFs(t, root, 'updateListing')`；
  win32 为预期 fail-closed，不诊断。

接线范围：

- **期望成功的真实 `resolveRoot` 调用全部改用 wrapper**：B Model budget、B Provider refuses unsupported
  platforms、B Provider detects check/open、B Provider rejects symlink parents、B Provider detects in-place growth。
- **Service/Pipeline 路径**（内部 resolveRoot，失败被 grant 吞掉、经 `updateListing` 暴露）在每个
  `updateListing` / `reader.updateListing` 结果后检查：B Service issues opaque refs、B Service fatal UTF8、
  B Pipeline、B refs cannot be minted、B failed/cancelled native imports、B Service mints/silently-rejects
  role-root candidates（两条真实 Service 用例）。
- **未动刻意期待 `UNSUPPORTED_ENVIRONMENT` 的负例断言**（`createProjectDocumentFileReader({platform:'win32'})
  .resolveRoot`、`assertWindowsFailClosed` 全链）；未动注入 reader 的平台无关用例。
- **测试名逐字不变；零断言放宽、零跳过、零删除。** 诊断只在原失败前多打印一行，随后原断言/原异常继续。

## 三、release-policy 精确条目（`src/common/装配/release-policy.mjs`）

- `files` Set 追加**单文件精确路径** `'test/桌面应用/project-document.test.ts'`（单文件不开目录；同目录
  相似名/其它测试仍 excluded）。
- 顶部活动白名单描述已修正：由「重置为基础集、无产品/测试 overlay 条目」改为「基础集 + 1 条 v2.1.0 发布阻断
  诊断条目」，并新增「v2.1.0 发布阻断诊断」注释段（run 号、file-reader.ts:28、诊断字段、断言未放宽）。
- 说明：v2.0.0 及更早的逐文件条目仍保留在 `files` Set 中（不移除——移除会改变发布策略，且
  `test/装配/release-packaging.test.ts` 多处 `selected` 断言钉住这些条目）；这些路径已随冻结源吸收、
  不出现在 v2.1.0 tag→overlay 差异中，本版不产生选择。注释已如实写明。

## 四、额外必要修改（披露项）

`test/装配/release-packaging.test.ts`（装配角色所属，任务书未列入写区，但**不修改则本任务验证门必红**）：

- 既有用例 `release overlay returns v1.7.0 blocking-fix entries to fail-closed or excluded` 把
  `test/桌面应用/project-document.test.ts` 钉在 **excluded** 样本中；该文件一旦入列，`selected` 与
  `excluded` 两条 deepEqual 必然失败（任务要求该套件 22/22）。
- 按同仓先例（e141112 / `2026-11-12_release-blocker-g4-chain.md` 第 147 行：加 release-policy 条目时同批更新
  该白名单测试的样本与精确路径断言）做**最小同步**：从该用例的 excluded 样本移除该文件，并在同一用例末尾
  新增「仅精确路径入选、相似名/同目录其它测试仍 excluded」断言。用例数保持 **22**，断言强度未放宽，
  测试名不变。
- 该文件属装配角色边界（`test/装配/`），本批属发布阻断配套的白名单测试同步，特此披露，请协调者/验收知悉。

## 五、验证输出（Windows 本机）

- `node --test --test-concurrency=1 --test-timeout=120000 "test/桌面应用/project-document.test.ts"`
  → **tests 20 / pass 20 / fail 0 / skipped 0**（duration 205.377ms）。
- `node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"`
  → **tests 22 / pass 22 / fail 0 / skipped 0**。
- `node -e`（`selectOverlay`）：
  ```json
  {"selected":["test/桌面应用/project-document.test.ts","src/common/装配/release-policy.mjs",
  ".github/workflows/release.yml","test/桌面应用/handback-delivery.test.ts"],
  "excluded":["test/桌面应用/project-document-extra.test.ts","test/桌面应用/decision-service.test.ts"]}
  ```
  `selected包含诊断文件: true`。
- `npm run typecheck` → **exit 0**（tsc --noEmit，无输出）。
- `git diff --check` → exit 0；`git status --porcelain` → 3 个修改文件
  （`src/common/装配/release-policy.mjs`、`test/桌面应用/project-document.test.ts`、
  `test/装配/release-packaging.test.ts`）+ 本记录。
- 本机 `statfsSync(os.tmpdir())` = `C:\Users\51054\AppData\Local\Temp` type `0 (0x0)`（Windows 走平台
  fail-closed 分支，诊断路径不触发；实际 `FS_DIAGNOSTIC` 行将首先出现在 POSIX/arm64 的 UNSUPPORTED_ENVIRONMENT 场景）。

## 六、披露与结论

1. **仅诊断，不改产品语义**：产品侧 `file-reader.ts` 的 `localTypes` 与平台判定未动；断言/测试名零放宽。
2. 下一轮 arm64 日志将带 `FS_DIAGNOSTIC`（含 `tmpdirType`/`rootType` 十进制+十六进制与 platform/arch），
   由协调者决定是扩充 `localTypes` 白名单（产品修复，需另开产品批）还是修 runner 环境。
3. release-policy 历史条目未删除（见 §三说明）；`release-policy.d.mts`、release.yml（含 45→120）、
   其它产品/测试均未改。
4. 额外必要修改（§四）超出任务书原始 3 文件写区，属白名单测试强耦合的同步；若协调者不认可，可仅回退该文件，
   但 release-packaging 套件将 21/22、发布回归必红。
