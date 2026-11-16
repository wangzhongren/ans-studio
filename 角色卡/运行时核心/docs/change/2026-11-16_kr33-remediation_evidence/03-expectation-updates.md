KR-33 运行时核心：期望更新理由与适配依据（2026-11-16）

本文件回答两个问题：K3 的 5 个断言为什么按“现行产品/契约”更新（而不是产品回退），以及 K1/K2/K4 的适配为何不改变产品保护语义。所有测试名保持冻结基线逐字不变。

## K3-1 dispatch_task 文案 ×2（#4/#5）

- 当前产品：`src/provider/runtime/schema.ts:751-767`（description）与 `:768-782`（promptGuidelines）。
  现行文案包含：运营职责内的 `docs/workflow.md`、跨角色实现前准备适用契约、任务文本按地址引用且不内嵌契约全文、
  `docs/workflow.md` 缺失（旧项目过渡期）不拒投、本工具不写盘。
- 变更来源：`git show e71501c -- src/provider/runtime/schema.ts` 删除了旧句
  “工作流由运营（convener）落盘到 docs/workflow.md”“运营的 Section 1 预授权、直接写即可”“先落盘再派发”“再派发任务”。
- 现行写路径：`src/provider/runtime/schema.ts:1811-1841` 的 `request_stable_write`——
  提交完整内容，应用生成 stable-write 客户确认卡，客户批准后生成一次性许可并由写门禁写入；
  工具本身不签发许可、不批准、不直接写文件。契约依据：
  `角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1d-record.md:104`（AC-33）。
- 因此旧“直接写 / 不得声称确认制”断言与现行 stable-write 契约方向相反；本轮改为断言现行语义核心，
  并为旧直接写措辞保留负断言（不得回潮）。测试名保留历史名，测试体内注释说明。

## K3-2 D3 linked workspace（#9）

- 当前产品：`src/provider/runtime/tools.ts:597-616` `finalFileProtection`；符号链接目标返回
  `[file-write-protection] symbolic-link target`（e71501c 引入的英文稳定 reason code）。
  外层消息为 `write_file 拒绝写入：…`。
- CI 错误体（分类证据 06-real-six-ci-error-bodies.txt，R5/R6 两平台同形）：
  actual `write_file 拒绝写入：[file-write-protection] symbolic-link target`，expected `/符号链接/`。
- 同文件 D3 ENOTDIR 用例（B6a，2026-11-16）已断言英文 reason `canonical identity unavailable; no write (ENOTDIR…)`，
  证明英文 reason code 已是现行测试口径；旧 `/符号链接/` 是残留中文断言。
- 本轮断言改为 `/\[file-write-protection\] symbolic-link target/`，并保留“链接未被替换、目标内容不变”的强断言。
  本机 Windows 无文件符号链接权限（EPERM），以 junction 指向目录等价覆盖同一 lstat 符号链接守卫，
  并在 TAP 诊断记录 linkKind（见 06-skips-and-residuals.txt）。

## K3-3 主干来源（#32）

- 当前产品：`src/model/trunk.ts:36` 的 `TrunkSource` 与 `:37-45` 的 `TRUNK_SOURCES` 含第 7 个来源 `team-plan`
  （真实计划发布来源，不能伪产品 upgrade）。
- 文档：`角色卡/运行时核心/api-spec.md:217`（“TrunkSource/TRUNK_SOURCES 增 team-plan 真实计划发布来源”）。
- 本轮期望集加入 `team-plan`（7 项排序后），保留 `main-upgrade` 负例与 bootstrap/recovery/upgrade 显式断言。

## K3-4 doc-freeze reason（#33）

- 当前产品：`src/model/version-change.ts:196-206` 为 10 个 `DOC_FREEZE_REASONS`，含新增
  `role-direct-applied`；`:208-214` customer 5；`:215-220` application 4；`:235`
  `DOC_FREEZE_DIRECT_REASONS = ["role-direct-applied"]`；`:228-231` judge-delegated 仍是 customer 子集。
- 文档：`角色卡/运行时核心/api-spec.md:187` 与 `:209`（新增 `role-direct-applied` 原因及
  `DirectDocFreezeRecord` 强写入形状）。
- 本轮按 10 类、customer 5 + application 4 + direct 1 三分区互斥且并集==全集校验；
  保留 `migrated-draft` 不是 reason、migration marks、baseline event kinds 断言，并额外核对
  judge-delegated 不构成第四分区。测试名保留历史“九类”。

## K1 中性临时根（25 名）

- 机制：产品 `src/provider/trunk/impl/git-command.ts:971` 的 `readGitHostProtectionRequirement`
  对“存在且不是普通目录”的 `.git` 抛 `git-association-protection-requirement-unknown`；
  `src/service/runtime/session.ts:232` 归一为 `state:"unknown"`，`:1277`（composeContext）与
  `:1297-1298`（bindRole）抛 `runtime-protection-scope-unknown`。
- linked worktree 的 `.git` 是文件（`gitdir: …`），因此 `projectRoot: process.cwd()` 的 7 个测试文件
  在本机工作树被 fail-closed 保护范围判定拒绝；这是既有安全口径，不是产品缺陷。
- 适配：`test/runtime-core/fixtures.ts` 新增 `neutralProjectRoot()`（mkdtemp、无 `.git`），
  7 个文件把 `projectRoot/skillRoot` 从 `process.cwd()` 改为同一中性根；断言、超时、错误期望不变。
  证据：分类证据 04-root-cause-probe.txt（`.git` 文件 ⇒ unknown；无 `.git`/`.git` 普通目录 ⇒ unmanaged）
  与 R5/R6 CI 25 名 ✔、规范根对照 25 名通过。

## K2 恰一次 dispose（#29）

- 修改前 `src/service/runtime/session.ts:750-765`：
  `:751 constructed = inner;`；`:752` assertReady 失败时 `await inner.dispose()` 并抛出；
  外层 catch `:763` 又 `await constructed?.dispose()` ⇒ 同一 inner 被 dispose 两次（fixture 计数 2）。
- 历史：内层 dispose 来自 6e515893（2026-10-22）；constructed + 外层 dispose 来自 e71501ca（2026-11-07）；
  测试的 disposed=1 早于 e71501c，属于可观察清理行为回归。
- 本轮删除内层 dispose，由外层 catch 统一释放 constructed；测试 `session.test.ts:439-447` 保持
  `native=0 && disposed=1`（恰一次）断言，未放宽。产品 diff 见 02-product-diff.patch。

## K4 Windows 符号链接能力（2 名）

- 测试 `session-store.test.ts:46/:58` 原先直接 `fs.symlink(..., "dir")`；本机无
  SeCreateSymbolicLinkPrivilege ⇒ EPERM，构造阶段失败、断言不可达。
- store 的守卫 `src/provider/runtime/session-store.ts:40-50 checkDirectoryChain`：
  `stat?.isSymbolicLink() || (stat && !stat.isDirectory())` 即拒绝“非普通目录”。
- 本机探针：junction 的 `lstat().isSymbolicLink()` 为 true、`isDirectory()` 为 false。
  因此 `directoryLink()` 先尝试真实符号链接，win32 EPERM 时回退 junction；断言
  `/不是普通目录/`、外部目录零写入均不变，未 skip、未放宽。
- 若未来机器连 junction 也不支持，helper 会如实抛出（非 EPERM/非 win32 不吞错），不会把真实失败伪装为通过。
