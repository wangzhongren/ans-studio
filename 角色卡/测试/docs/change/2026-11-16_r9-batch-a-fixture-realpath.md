# R9 批次 A：trunk 夹具根 canonicalize（`Git team plan publication` 三平台确定性失败）

- 日期：2026-11-17
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9a`（分支 `fix/test-debt-r9a`，起点 `da805ec` = `origin/main`）
- 范围：**只写 `test/编排/fixtures/trunk-project.ts` + 本记录**。未修改产品 `src/**`、`app/**`、`.github/**`、release-policy、main、其他测试或角色卡/边界；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占用 9222/9223/9224；未放宽断言、未删用例。
- 依据（权威）：
  - R9 归因与收尾方案 `2026-11-16_remediation-plan-r9-update.md` §0.5、§2 #1、§3.1、§4 批 A、§5.3、§7.3。
  - 证据 `_r9-evidence/03-error-bodies.md` §1（三平台逐字错误体/产品抛出点/夹具行号）、`10-count-reconciliation.md` §6（known-red orchestration-24 命中 1）。
  - 数据源：GitHub Actions run **43887939365**（`Test matrix (development feedback)`，`main @ 77d3505`，2026-11-16）三平台工件；原始工件在 `/tmp/r11-art`（分析工作树持有，不入库）。
- 本机环境：Windows 11 / Node v24.22.1。

## 0. 摘要

1. **残差 1 名 × 3 平台**：`Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority`（arm64 60,228.8ms / x64 111,347.3ms / Windows 62,859.6ms），错误体三平台逐字相同：`{"ok":false,"code":"trunk-item-invalid","message":"Error: git-journal-directory-invalid"}` @ `git-capabilities.test.ts:658`。
2. **定性（沿用 R9，不重开）**：测试夹具假设，**非产品缺陷**。`createTrunkProject → makeRoot()` 直接返回 `fs.mkdtemp(os.tmpdir())` 原拼写；macOS `/var/folders` → `/private/var/folders`、Windows runner 8.3 短名 `RUNNER~1` → `runneradmin`，使产品 `listGitOperationJournals` 的安全不变量 `realpath(dir) === dir`（`src/provider/trunk/impl/git-command.ts:446`）必然失败。产品校验正确，**不放宽**。
3. **改动 1 处**：`makeRoot()` 在 `fs.mkdtemp` 后追加 `fs.realpath`（`node:fs/promises`，native 语义），全夹具统一持有规范根。
4. **审计 20 个导入文件**（18 个使用 `createTrunkProject`、2 个仅用常量；其中 2 个直接导入夹具 `makeRoot`）：canonicalize 对断言/路径无破坏；既有局部 realpath 变幂等。同夹具目录其余文件无同类缺口需一并修。
5. **验证**：`git-capabilities.test.ts` 全文件 16 tests / 14 pass / 0 fail / 2 skipped（env-gated），目标名本地 136,486.7ms 通过；3 个代表性受影响文件 23/23 通过；`npm run typecheck` EXIT=0；合成 8.3 短名探针**本地复现修复前 `realpath(dir) !== dir`、修复后成立**。
6. **披露**：本机临时目录的批量清理被权限分类器拒绝（Shared Scratch Sweep），本次运行残留 55 个目录（约 4.8 MB，见 §6）；另列 1 个写区外同类潜在缺口（`doc-format-specs.test.ts` 本地 `makeRoot`），本批未改。

## 1. 根因与修法

- 失败点：`service.prepareCreatedTaskClose(nominationTaskId, "chief")`（`test/编排/git-capabilities.test.ts:658`）→ 存储层 `listOperationRecords`/`listStorageOperations` → `listGitOperationJournals(root)`。
- 产品不变量（不改）：`src/provider/trunk/impl/git-command.ts:439-446`，对 `.ans/trunk/operations/<64hex>` 目录要求 `!isSymbolicLink() && realpath(dir) === dir`——防符号链接/重定向的 fail-closed 安全校验。产品 `executeGit` 自身对根做 realpath（`git-command.ts:704-708`，B3-2b），说明**规范根是上游契约**；`git-trunk-store.ts:1159-1165` 亦注明 `fs/promises.realpath` 是 native 语义（展开 8.3 短名、解析符号链接祖先）。
- 夹具缺口（已修）：`test/编排/fixtures/trunk-project.ts:58-60`（原 58-59）`makeRoot()` 返回 mkdtemp 原拼写；CI 的 `os.tmpdir()` 前缀非规范 ⇒ 由它拼出的操作目录 `realpath(dir) !== dir` ⇒ `git-journal-directory-invalid`。kr29b 修的是旧断言；本批补上夹具根的规范拼写。
- 修法：
  ```ts
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-trunk-service-"));
  return fs.realpath(root);
  ```
  - 选 `fs/promises.realpath`（native 语义）而非普通 `fs.realpathSync`：后者是 JS 实现、**不展开** Windows 8.3 短名（本机探针实证，见 §5.4）。
  - 与既有先例一致：`test/编排/git-command.test.ts:41-43`（B6a：`await fs.realpath(await fs.mkdtemp(...))`）、`test/编排/fixtures/git-action-authorization-wiring.ts:128/248`（B3c，注释同样引用 macOS `/var` 与 Windows 8.3）。
  - 不采用“只在失败测试局部 realpath”：R9 §4 批 A 允许二选一；本夹具被 18 个文件共用，且已有两处调用方各自局部 realpath（`git-capabilities.test.ts:530/878`、`git-operation-sidecar-tolerance.test.ts:34`）正是同一缺口的局部补丁，统一到源头可消除该类重复与残留风险。选择全局 `makeRoot()` 后，上述局部调用变为幂等，无行为变化。

## 2. 改动清单

| 文件 | 改动 |
| --- | --- |
| `test/编排/fixtures/trunk-project.ts` | `makeRoot()`：`return fs.mkdtemp(...)` → `const root = await fs.mkdtemp(...); return fs.realpath(root);` + 10 行根因/API 语义/先例注释（净 +10/-1 行） |
| `角色卡/测试/docs/change/2026-11-16_r9-batch-a-fixture-realpath.md` | 本记录（新增） |

无其他代码/测试/配置改动；`git diff --stat` 仅 `trunk-project.ts`（记录为未跟踪新文件）。

## 3. 使用方审计（canonicalize 不破坏）

夹具 `makeRoot` 仅被 2 个文件直接导入（`trunk-service.test.ts:27`、`version-change-service-integration.test.ts:27`），其余均经 `createTrunkProject` 间接使用。全仓（含非 test 目录）无 test 外的使用方。

### 3.1 `createTrunkProject` 使用方（18 文件，约 56 处调用）

| 文件 | 调用点（行） | 结论 |
| --- | --- | --- |
| `test/编排/git-capabilities.test.ts` | 516、870 | 目标文件；已有局部 `fs.realpath(project.root)`（530 用于 hostInitialization 注册、878 写入 initialization source 的 `projectRoot`）——修复后与 `project.root` 相等，恒等操作；无根拼写断言 |
| `test/编排/git-operation-sidecar-tolerance.test.ts` | 30 | B6a 已局部 realpath（:34）；修复后幂等；直接演练 `listGitOperationJournals`，本批代表性验证文件 |
| `test/编排/trunk-service.test.ts` | 63/92/97/121/165/210/368 + `makeRoot()`@103 | S2 trunk service 全链；`brokenRoot` 仅用于坏 run manifest 用例，路径拼写不影响断言 |
| `test/编排/version-change-service-integration.test.ts` | 34 + `makeRoot()`@396/444 | 冻结迁移/集成；无 journal 目录依赖；路径拼写不影响断言 |
| `test/编排/direct-role-capabilities.test.ts` | 254/399/1599/1781 | 直接能力测试；1599 直接建 store；仅以 root 派生路径，无拼写比较 |
| `test/编排/doc-format-specs.test.ts` | 397/1096/1110/1494/1541/1553/1561 | 文档格式规格；只读复用项目根；其**本地** `makeRoot` 为另一函数（见 §6） |
| `test/编排/convener-module-consumption.test.ts` | 377 | 只读消费快照 |
| `test/编排/stable-write-runtime.test.ts` | 44 | runtime 夹具根 |
| `test/编排/run-manifest.test.ts` | 272/366/417/448/465 | manifest 读写；路径派生一致 |
| `test/编排/trunk-runtime.test.ts` | 40/294 | runtime 夹具根 |
| `test/编排/refactor-runtime.test.ts` | 16 | runtime 夹具根 |
| `test/编排/trunk-service-refreeze.test.ts` | 48/103/161/199 | refreeze 用例组 |
| `test/编排/trunk-upgrade-validation.test.ts` | 45/266 | 升级校验 |
| `test/编排/version-change-runtime.test.ts` | 44 | runtime 夹具根 |
| `test/桌面应用/version-change.test.ts` | 573/1226/1461/1657 | 桌面版本变更栈；路径派生一致 |
| `test/桌面应用/chief-workflow.test.ts` | 2750 | W29/W30 家族夹具根；路径派生一致 |
| `test/测试/trunk-stable-write-integration.test.ts` | 143/659/783/836/939/969/990/1007 | 稳定写集成 |
| `test/测试/version-change-integration.test.ts` | 108/1132/1163/1277/1348 | 版本变更集成 |

- 共同结论：这些文件均以 `project.root` 为唯一根变量派生全部路径（`path.join(root, ...)`、`createFsTrunkStore(root)`、`createTrunkService({projectRoot: root})` 等），不存在“期望根等于 `os.tmpdir()` 原拼写”的断言；canonicalize 只改变同一真实目录的字符串拼写，不改任何文件内容/布局/哈希。
- 已存在的局部规范根补丁（`git-capabilities.test.ts:530/878` 的 `fs.realpath(project.root)`、`git-operation-sidecar-tolerance.test.ts:34`、`git-action-authorization-wiring.ts:36-39` 的 `realpathSync(root)`）在夹具根已规范后均为恒等操作。
- 产品侧调用链核对：`git-trunk-store.listJournals` 已用 `nativeControlRoot`（native realpath）后调用 `listGitOperationJournals`；`fs-trunk-store.listStorageOperations/listOperationRecords`（`:432/:449`）直接传调用方根——即本缺口的实际暴露面。夹具根规范后两条路径口径一致，产品无需改动。

### 3.2 仅使用常量（2 文件，不受影响）

- `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（`FLOW_ID`/`PATHS`）。
- `test/测试/git-write-chain-fixture.ts`（`PATHS`）。

### 3.3 同夹具目录排查（`test/编排/fixtures/`）

| 文件 | 结论 |
| --- | --- |
| `git-action-authorization-wiring.ts` | 已有 `fs.realpath(await fs.mkdtemp(...))`（128/248），无需改 |
| `version-change-service-fixture.ts` | 不创建 mkdtemp 根 |
| `download-tls/`、`op2-write-confirm-card.json` | 静态证书/数据，无根创建 |

结论：同目录无其他同类缺口需一并修；其他测试文件里的同名 `makeRoot`（`b101/b111/b61/b71/b81/b82`、`doc-format-specs` 等）均为各文件局部 helper，与本夹具无关。

## 4. 验证（Windows 本机，定向）

调用方式与 CI 一致（`node --test --test-concurrency=1 --test-timeout=600000 <files>`；未加 `--test-force-exit`，两次 run 均自然退出）。

### 4.1 `test/编排/git-capabilities.test.ts` 全文件（含失败用例）

命令：`node --test --test-concurrency=1 --test-timeout=600000 "test/编排/git-capabilities.test.ts"`（2026-11-17T00:09:59 起）

```text
ℹ tests 16 / pass 14 / fail 0 / cancelled 0 / skipped 2 (env-gated ANS_O61_* 真实交付根) / duration_ms 154531.3
✔ Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority (136486.6906ms)
EXIT=0
```

### 4.2 代表性受影响文件（3 个）

命令：`node --test --test-concurrency=1 --test-timeout=600000 "test/编排/git-operation-sidecar-tolerance.test.ts" "test/编排/trunk-service.test.ts" "test/编排/version-change-service-integration.test.ts"`（2026-11-17T00:13:18 起）

```text
ℹ tests 23 / pass 23 / fail 0 / cancelled 0 / skipped 0 / duration_ms 14748.4
EXIT=0
```

（三文件 `test(` 声明数 6+11+6=23，与运行计数一致；覆盖夹具直接 `makeRoot` 导入方 + `listGitOperationJournals` 直接演练方。）

### 4.3 类型检查

`npm run typecheck` → `tsc --noEmit`，**EXIT=0**。

### 4.4 8.3 短名探针（本地根因复现 + API 语义）

本机 `os.tmpdir()` 前缀 `C:\Users\51054\AppData\Local\Temp` 本身无短名（用户名 `51054` 满足 8.3），故直接跑 `makeRoot` 不能复现 CI 失败（与 R9 文档“本机不可复现”一致）。探针在 Temp 下建长名目录、经 PowerShell FSO `ShortPath` 取短名（`AN535C~1`）模拟 CI 的 `os.tmpdir()` 拼写，再按产品同款 `path.join` 构造操作目录（结果摘录）：

```json
{
  "shortBaseDiffers": true,
  "syncJsExpandsShort": false,          // 普通 fs.realpathSync 不展开 8.3
  "syncNativeExpandsShort": true,       // fs.realpathSync.native 展开
  "promisesRealpathExpandsShort": true, // node:fs/promises.realpath 展开（本修法）
  "beforeFixJournalDirInvariant": false, // mkdtemp 原拼写 + realpath(dir)!==dir —— 复现 CI 失败条件
  "afterFixJournalDirInvariant": true    // realpath(mkdtemp(...)) 后不变量成立
}
```

另：修复后 `makeRoot()` 返回值与 `createTrunkProject().root` 均满足 `realpath(root) === root`（探针实测 true）。

## 5. 风险与第九轮 CI 复核点

1. **主目标**：第九轮三平台全量中 `Git team plan publication and active-only activation…` 三平台应绿（R9 为三平台确定性红）。
2. **known-red**：orchestration-24 应从 R9 的 1 → **0**（R9 known-red = 0/0/1；本批即修掉唯一命中）。
3. **零回退**：18 个 `createTrunkProject` 使用方文件在第九轮应保持 R9 绿项（尤其 `git-operation-sidecar-tolerance` 6 名、`trunk-service` 11 名、`version-change-service-integration` 6 名、`direct-role-capabilities`、`trunk-stable-write-integration`、`version-change-integration`、chief-workflow W29/W30 家族）。
4. **macOS 路径形态**：修复后夹具根为 `/private/var/folders/...`（真实根），任何诊断输出/日志中的路径拼写会随之变化；审计未见依赖 `/var/...` 原拼写的断言。
5. **验证边界**：本机无 macOS 与 8.3 前缀 TEMP 的真实 CI 形态，最终以第九轮三平台工件为准；本批证据 = 规范根不变量实证 + 8.3 合成复现 + 本机零回归。

## 6. 披露

1. **临时目录清理受阻**：本批测试在 `%TEMP%`（`C:\Users\51054\AppData\Local\Temp`）生成 55 个目录（共约 4.8 MB）：`ans-trunk-service-*` 33、`ans-git-service-*` 9、`ans-nogit-facts-*` 4、`ans-o17-protection-*` 4、`ans-global-lease-a/b-*` 各 1、`ans-o4-bootstrap-*`/`ans-o4-nested-parent-*`/`ans-init-service-*` 各 1（均为 2026-11-17T00:09 之后产生）。批量删除两次被权限分类器以 **[Shared Scratch Sweep]（共享临时目录清扫）** 拒绝，未再尝试规避；如需清理，建议由操作者按上述前缀与时间窗手动删除（不涉及仓库文件，无生成物入库）。
2. **写区外同类潜在缺口（只报不修）**：`test/编排/doc-format-specs.test.ts:105-109` 的**本地** `makeRoot` 仍返回 `fs.mkdtemp(os.tmpdir())` 原拼写。其现有用例未在“已有 journal 目录”的前提下触发 `listGitOperationJournals` 严格校验（CI 未红），且该文件不在本批写区（非 `fixtures/` 目录）；若后续该文件出现 `git-journal-directory-invalid`，按同一修法处理。其他测试文件内大量局部 mkdtemp 根同理，均未改动。
3. **未做**：未跑全量测试（按要求定向）；未 commit/push；未触发 CI；未 tag；未改 workflow/产品/产品语义。
4. **产品缺陷**：本批**未发现**产品缺陷；`listGitOperationJournals` 的 `realpath(dir) === dir` 安全不变量保持原样。

## 7. 复现命令与产物

```bash
cd .claude/worktrees/fix-test-debt-r9a
node --test --test-concurrency=1 --test-timeout=600000 "test/编排/git-capabilities.test.ts"
node --test --test-concurrency=1 --test-timeout=600000 \
  "test/编排/git-operation-sidecar-tolerance.test.ts" \
  "test/编排/trunk-service.test.ts" \
  "test/编排/version-change-service-integration.test.ts"
npm run typecheck
```

本记录不含原始截图/日志文件；本机输出见上（§4）。分析侧 R9 原始工件仍只在 `/tmp/r11-art`（不入库）。
