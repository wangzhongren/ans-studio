# 变更记录：角色根文档展示 S2+S3（Model/Service/Interface，桌面窗口）

- **任务 ID**：`2026-10-23-role-root-docs-display`｜**产品 flowId**：`role-root-docs-display`
- **角色**：桌面窗口（Desktop Window worker，独立子代理上下文）
- **日期**：2026-10-23
- **阶段**：团队计划 S2（索引/Model/Service/候选）+ S3（桌面 Interface）
- **风险档位**：T2
- **状态**：**implemented-unverified（实现完成，未验收）**。本记录不是验收报告，不声称通过；未 commit / push / 合并 / 发布；未写目标项目。
- **客户授权**：`docs/communication/2026-10-23_intent_role-root-docs-display.md`「实施授权记录（2026-10-23）」按团队计划 v1 与 T2 标准 v1 实施 S2–S7（不含 commit/push/发布/目标写入）。
- **依据版本**：
  - 团队计划 v1：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`）
  - 方案 v1：`docs/planning/2026-10-23_design_role-root-docs-display.md`（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`）
  - 验收标准 v1：`docs/acceptance/role-root-docs-display-criteria-v1.md`（784 行；SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`）
  - S1 基线：`角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline.md`（271 行；SHA-256 `a6aa70d5…`）与上游重冻 `…-baseline-upstream-refreeze.md`（新快照 `36ae8c04…`）
- **候选**：本目录 `hashes.txt` / `candidate.patch`；分支 `v1.7.0-work`，HEAD `6407d63`。

## 一、环境

| 项 | 值 |
| --- | --- |
| OS / Shell | Windows 11 Pro 10.0.26300 / Git Bash |
| Node / npm | v24.22.1（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）/ 11.19.1（`npm.cmd`） |
| 暂存区 | `git diff --cached --name-only` 为空（未暂存） |
| 原始记录 | `environment.txt`、`diff-summary.txt` |

## 二、实际写集（7 个文件，均在授权写集内）

| 文件 | 改动 |
| --- | --- |
| `src/model/project-document.ts` | 新增 `ROLE_ROOT_DOC_FILENAMES`（`feature-map.md`、`functional-description.md`、`api-spec.md`，顺序即展示顺序）与 `RoleRootDocName`；`ProjectDocumentRoleCandidates` 增加可选 `rootDocs?: readonly { path: string; kind: "file" }[]`。不写盘、不读文件。 |
| `src/service/project-document/impl/read-project-document.ts` | `updateListing` 对每个非内置角色计算 `roleDir` 与精确期望路径集合 `roleDir + "/" + 白名单文件名`，只接受 `kind === "file"` 且精确命中的候选；合法路径追加在既有 card/changelog/docs 之后，经既有 `eligible()`/`format()`/Set 去重；非法候选静默拒绝、不铸造引用、不抛错。新增最小诊断。 |
| `app/desktop/project.ts` | 新增 `RoleRootDocEntry`/`RoleDocsIndex.rootDocs`；`readRoleDocsIndex` 先做与 Service 同口径的角色目录词法校验与 `lstat`（非目录/符号链接/缺失→空索引），再对三个白名单文件名逐个 `lstat`（仅 `isFile()` 且非符号链接；与既有 changelog/docs 读取并行启动，返回顺序由 `Promise.all` 固定），**不 readdir 角色根**、不 `lstat`/读取 `memo.md`、不读正文；`changelog`/`docs` 既有逻辑保留；`projectDocumentCandidates` 仅透传 `{ path, kind }` 元数据。 |
| `app/desktop/interface.ts` | `RoleView.rootDocs?: RoleRootDocEntry[]`；`listProject` 对非内置且 `cardPath` 非空的角色装配 `idx.rootDocs`，内置角色为 `[]`；`documents` 仍由既有 Service 生成。无新 IPC/preload。 |
| `test/桌面应用/project.test.ts` | 新增索引白名单/固定顺序/部分缺失/memo 排除/changelog 可选/docs 不回归/非法 cardPath/符号链接（POSIX）/候选透传/诊断断言。 |
| `test/桌面应用/project-document.test.ts` | 新增合法 rootDocs refs（追加且既有 `documentId` 前缀稳定）、`not-applicable` 普通文本、memo/任意根文件/`../`/绝对/反斜杠/冒号/大小写/`docs/` 前缀/重复/空 roleDir 拒绝、平台无关注入 reader 用例、Windows fail-closed（真实+模拟 win32）、诊断断言。 |
| `test/桌面应用/interface.test.ts` | 新增 `RoleView.rootDocs` 装配、`documents` 根文档 refs（POSIX 宿主）/Windows 空 refs、memo 不入载荷、内置角色空态、preload/无新通道断言；既有断言保留。 |

**未写**：`src/provider/project-document/**`（Q9 A）、`src/pipeline/project-document/**`、`src/service/project-document/{abstract,public}/**`、`app/preload.cjs`、`app/main.ts`、`app/renderer/**`、`test/桌面UI/**`、`test/测试/**`、`src/common/shared/**`、角色卡/边界、`docs/**`、目标项目、`test/桌面应用/e2e/main.mjs`（S6 再按需最小追加）。

## 三、`rootDocs` 契约与路径基准

```ts
// Model（唯一白名单来源）
export const ROLE_ROOT_DOC_FILENAMES = ['feature-map.md','functional-description.md','api-spec.md'] as const;
export type RoleRootDocName = (typeof ROLE_ROOT_DOC_FILENAMES)[number];
// 候选（additive、可选）
rootDocs?: readonly { path: string; kind: 'file' }[];
```

```ts
// 桌面索引（app/desktop/project.ts）
export interface RoleRootDocEntry { name: RoleRootDocName; path: string; kind: 'file' }
export interface RoleDocsIndex { changelog: ...; docs: DocsIndexEntry[]; rootDocs: RoleRootDocEntry[] }
```

- `rootDocs[].path` 为**项目相对**（如 `角色卡/编排/feature-map.md`），用于与 `ProjectDocumentRef.relativePath` 精确匹配；`docs[].path` 仍为**角色相对**（`docs/x.md`）。两者不混用。
- `RoleView.rootDocs?` additive；`listProject` 对有效角色总会给出数组（内置角色 `[]`），旧 renderer 忽略未知字段、旧 main 缺字段时按 `[]` 消费。
- `memo.md` 不在白名单；索引不 `lstat`/读取它，Service 即使收到候选也精确拒绝。`changelog.md` 仍在独立 `changelog` 字段，不进入 `docs`/`rootDocs`。

## 四、Service 二次校验与平台行为

- 精确期望路径：`roleDir + "/" + {feature-map.md,functional-description.md,api-spec.md}`；只接受 `kind === "file"`。
- 拒绝且不铸造：`memo.md`、任意根文件、`../feature-map.md`、绝对路径、反斜杠、冒号、大小写变体、`docs/feature-map.md`、项目外路径、空 `roleDir`；重复候选经 Set 去重为一条。
- 合法根文档 refs 追加在既有 card/changelog/docs refs 之后；既有 refs 的 `documentId` 与顺序前缀在刷新后保持不变（测试断言）。
- **Windows**：沿用既有 `UNSUPPORTED_ENVIRONMENT`——`updateListing` 在建立 scope/铸造任何 refs 之前返回；不读字节、不建立 scope、不铸造 refs。`rootDocs` 索引元数据仍可列名（不依赖读取平台）。
- **POSIX**：仍由既有 Provider 执行 `lstat`/`realpath`/`O_NOFOLLOW`/有界读/UTF-8 校验；Provider 零改动。

## 五、诊断（客户 2026-10-23 新规则）

复用共享 `createDiagnosticLogger`（`src/common/shared/diagnostics.ts`，未配置时为空操作；只落白名单元数据字段，不写正文/路径列表/密钥）。新增事件：

| 事件 | 位置 | 字段 |
| --- | --- | --- |
| `role-docs.index` | `readRoleDocsIndex` 成功 | `count`、`ok` |
| `role-docs.index.skipped` | 非法 cardPath / 角色目录缺失/非目录/符号链接 | `reasonCode` |
| `role-docs.root.skipped` | 白名单文件存在但非普通文件/符号链接 | `reasonCode`、`path`（仅文件名） |
| `role-docs.root.inspect-failed` | `lstat` 非 ENOENT 失败 | `reasonCode`、`path`（仅文件名） |
| `role-docs.index.failed` | Interface 索引异常降级 | `reasonCode` |
| `project.listing.root-docs` | `listProject` 装配摘要 | `count`、`ok` |
| `project-document.listing` / `.listing.unavailable` | Service 列举成功/不可用（含 Windows fail-closed） | `count`/`errorCode`、`ok` |
| `project-document.root.skipped` | Service 拒绝的根文档候选数量 | `count` |
| `project-document.read` / `.read.failed` | 读取成功/失败 | `count`/`errorCode`、`ok` |

行为断言：`project.test.ts` 与 `project-document.test.ts` 各有一个诊断用例，断言事件/reasonCode 出现，且日志文本不含候选路径或正文；不修改权限/边界/Provider。

## 六、测试与证据

### 6.1 目标套件（当前候选）

命令：`node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts`

- 主日志 `test-desktop-app-targets.log`（final-run3 原样副本）：**164 tests / 164 pass / 0 fail / 0 skipped / 0 todo，exit 0**。
- 最终候选连续运行：全套件 **3/3 次 164/164 pass**（`test-desktop-app-targets.final-run1.log`、`.final-run2.log`、`test-desktop-app-targets.log`）；`interface.test.ts` 单文件 **5/5 次 121/121 pass**（`interface-alone-final-run1..5.log`）。
- 明细：`project.test.ts` 23/23；`project-document.test.ts` 20/20；`interface.test.ts` 121/121。
- 预最终迭代（根文档 `lstat` 串行版）曾放大既有治理 flow/readiness/ledger 时序竞态；将三个元数据检查改为与既有 changelog/docs 读取并行后，最终候选 3/3 + 5/5 全绿。原始失败/复跑日志保留在 `pre-final-iteration/`，分类见 `flake-classification.txt`；未修改/删除/跳过任何既有断言。

### 6.2 跨层与类型

- `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/桌面应用/su-effective-boundary.test.ts test/桌面应用/genesis-bootstrap.test.ts`：13/13 pass，exit 0（`test-cross-layer-regression.log`）。
- `npm.cmd run typecheck`：exit 0，无 `error TS`（`typecheck.log`）。

### 6.3 POSIX / 真实 Electron

- 当前环境为 Windows：**POSIX 真实正文读取未执行**（不得以 Windows 列名冒充可读）；测试内含 POSIX 分支与真实 Provider 断言，留待 S6 在 macOS/Linux 运行并单独记录。
- `test/桌面应用/e2e/main.mjs` 未修改、未运行（属 S6；Windows 列名+`UNSUPPORTED_ENVIRONMENT`、POSIX 实读分开记录的要求不变）。
- 渲染层 S4（`ProfilePanel`/`drawer-store`/i18n key）不在本角色写集，本记录不声称界面已完成。

## 七、零改动与候选身份

- `git diff --stat -- src/provider/project-document app/preload.cjs app/main.ts` 为空；`src/pipeline/project-document/`、`src/service/project-document/{abstract,public}/` 哈希等于 HEAD（`zero-diff-check.txt`、`hashes.txt`）。
- 候选文件逐文件 `git hash-object` + `sha256sum` + 基线哈希见 `hashes.txt`；完整候选 diff 见 `candidate.patch`。
- 工作树中的 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 与 `test/项目管理/shared/i18n.test.ts` 改动属**其他 worker 的既有上下文**（S5 i18n key），不是本变更候选，本记录不为其背书（`external-context.txt`）。

| 文件 | 候选 blob | 候选 sha256（worktree） |
| --- | --- | --- |
| `src/model/project-document.ts` | `e501ff31112a6f6534489102af47be9250135ba9` | `0cc0827309cc66ac152a654c42e082841b5af89bc1ce29a02ef9c6d8158ab2e3` |
| `src/service/project-document/impl/read-project-document.ts` | `ef66fa6901ee720ac13efcbcc287e73825971b58` | `1895cac3bc3bff339475a49dec87cd13cf8cf861c346596610163af365e1393f` |
| `app/desktop/project.ts` | `47b41f644169e87c6f22fef87906963d6981cbc1` | `06f0480997f0954a08f258638984af90b6c4b28b10310f55c6c0878660f20438` |
| `app/desktop/interface.ts` | `b28ba1a5d16540db208e5aca123baf2eeff851a6` | `29c12b331f2412995c232811e54072e4c7c4420f0fa50c4461cc9db99c75e30b` |
| `test/桌面应用/project.test.ts` | `2f7bad44dfcbad7e9958325ce73aed56cb8b4d53` | `c476fa95f120dceda66ddf58dd434394f10dbe42a96c9efe7aaa42a672619634` |
| `test/桌面应用/project-document.test.ts` | `3699d75248361746f7a0d6fb2efb68000379a8f8` | `b1bf71888e206cab3b28ca73cb359b3c8c6e21c9888b47552042245f15745b9d` |
| `test/桌面应用/interface.test.ts` | `5715173679ca724a53e832777bf4c48c7f3fb047` | `4f5f7488ec2ff9fe2f53e6c174dc6a4678f9d30d61573169cc9ce1d8fee7c745` |

## 八、残余与后续

1. **未验收**：本记录为 `implemented-unverified`；独立验收按标准 v1 另写报告。
2. **POSIX 实读未执行**（Windows 环境）；S6 需在 macOS/Linux 验证正文/`byteLength`/mtime/`not-applicable`，并与 Windows fail-closed 分开记录。
3. **真实 Electron 未运行**：`e2e/main.mjs` 属 S6；Windows 列表+不可用提示、POSIX 实读、fixture 字节/mtime 由 S6 补充。
4. **渲染层未改**：S4 由桌面UI 实施；本契约（`RoleView.rootDocs` + refs）已冻结供其消费。
5. **时序偶发（已缓解）**：预最终迭代的串行元数据检查曾放大既有治理流程时序竞态；改为并行检查后最终候选 3/3 全套件、5/5 interface 通过。S6 仍在隔离负载下复跑，若稳定复现按 S6 流程回报；见 `flake-classification.txt`。
6. 未 commit / push / 合并 / 发布；未写 `ans-gateway`；未启用 task_ops，未伪造令牌/锁/审批/`docs/verification/`。

## 九、证据文件

目录：`角色卡/桌面窗口/docs/change/2026-10-23_change_role-root-docs-display-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 时间、OS/Shell、Node/npm、HEAD/分支、暂存为空、`git status` |
| `hashes.txt` | 7 个候选文件的基线/候选 blob + sha256 + 字节；零改动文件哈希 |
| `candidate.patch` | 7 个候选文件的完整 diff |
| `diff-summary.txt` | `--stat`/`--numstat`/`--check`/status |
| `zero-diff-check.txt` | Provider/preload/main 零 diff 与零状态 |
| `index-sample.txt` | 真实仓库角色（桌面窗口、桌面UI）的 `readRoleDocsIndex` 样例：三根文档固定顺序、memo 未列入、changelog 独立、docs 计数（含 500 上限） |
| `external-context.txt` | 外部 i18n worker 改动清单（非本候选） |
| `test-desktop-app-targets.log`、`.final-run1.log`、`.final-run2.log` | 最终候选全套件连续 3 次（164/164 pass） |
| `interface-alone-final-run{1..5}.log` | 最终候选 interface 单文件连续 5 次（121/121 pass） |
| `pre-final-iteration/*.log` | 预最终迭代（串行元数据版）的失败/复跑原始日志（非最终候选） |
| `baseline-head-archive.*.log` | HEAD 干净归档基线（152/152、120/120×2） |
| `test-cross-layer-regression.log` | 跨层/相关桌面套件 13/13 |
| `typecheck.log` | `npm run typecheck` 原始输出（exit 0） |
| `flake-classification.txt` | 失败分类与复跑说明 |
