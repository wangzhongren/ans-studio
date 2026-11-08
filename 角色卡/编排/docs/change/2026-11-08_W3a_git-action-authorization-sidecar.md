# W3a 变更证据：Git 动作授权 sidecar 基础设施

- 批次：**W3a**（变更「删除全部预知式门控」派发批次，见 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §四）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）；owner 目录 `src/provider/trunk/`、`test/编排/`
- 日期：2026-11-08；基线 worktree `.claude/worktrees/trunk-amendment`，HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`
- 依据：设计 P1.4 §3.4.3 / §3.8 / §4.4 / §4.5 / §6.1；I0-1（sidecar 写入契约）、I0-2（调用点 append / 公共出口 / 条件锚点默认不改）、I0-4/I0-5/I0-8（不返回 authorization、run-change 不写 sidecar、不改名）；B1 v1 `P1.2-AC-26`/`P1.2-AC-30`/AC-16 适用项
- 状态：**已实现、未提交**（本批次不 commit/push/stash/merge/发布）。**本批次纯加法**：既有 journal/replay/settlement 行为零改动；未接入调用点（W3b 负责）。

## 1. 偏差与 I0 对照

| I0 项 | 结论 | 证据 |
| --- | --- | --- |
| I0-1 路径/append/预算/容错 | **偏差=0**：路径 `<canonical projectRoot>/.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl`；单次 `O_APPEND` 写入 + fsync，短写/失败 ⇒ `git-action-audit-unavailable`；项目版本锁（或调用方 `heldLockToken`）内写入；拒绝符号链接/nlink≠1/越界/非 canonical 根；预算 **行 ≤4 KiB、最多 16 次尝试、文件 ≤64 KiB（4×16=64，自洽）**；读取允许末行截断（忽略+诊断），坏 JSON/超长行/未知字段/超预算 fail-closed；v1 白名单（无凭据/环境/`applicationMediation`）；不改 `GitRefJournal`/`GitInitializationRecord` 与 replay/settlement 身份。 | 本文件 §3–§5、§6 测试与原始日志 |
| I0-2 锚点 | **偏差=0**：只新增 Provider 能力与公共导出；`git-trunk-store.ts`/`git-capabilities.ts`/`apply-journal.ts` **零改动**；`src/provider/trunk/public/trunk-store.ts` 已新增 sidecar append/read 公共导出（潜在第 6 重叠文件，串行单写者）。调用点 append 由 W3b 接线。 | §2 文件清单；`git diff --numstat` 仅两个产品文件 |
| I0-4 gate 输出 | 不涉及（W2/W3b）；sidecar 不返回/不读取 authorization 组合。 | — |
| I0-5 run-change | sidecar 只面向结构化 Git mutation；`readGitActionAuthorizations` 不检查 lease、不参与 run-change；run-stop/controller-stop 不写 sidecar 由 W3b 调用点保证。 | §3 API |
| I0-8 改名 | 本批次不涉及 `inspectInitializationProtection`。 | — |

**设计内解释记录（非 I0 偏差）**：
1. **lease 语义**（设计 §3.4.3「复用既有 … 版本锁/lease 语义」）：append 在写前/持锁后各核验一次“记录中的 `leaseId` 正是当前持有的 `git-mutation` host lease”（`checkGitHostAction`），失败 ⇒ `git-action-audit-unavailable:authorization-lease-invalid`。这防止伪造 `leaseId` 写入审计。
2. **Windows 追加句柄限制**：`O_APPEND` 句柄在 win32 不允许 `ftruncate`（实测 EPERM）。因此读取/末行修复使用独立 `r+` 句柄，写入仍是对 `O_WRONLY|O_APPEND|O_CREAT` 句柄的**单次 write**（满足 I0-1；不改变写入语义）。
3. **末行截断修复**：读取侧按 I0-1 忽略并留诊断（`authorization-tail-truncated-ignored:<bytes>`）；append 侧在追加前把未完成的半行截断到最后完整前缀（半行只可能来自崩溃的半次 append；调用方在 append 失败时从不执行效果，因此不丢失任何已授权动作的证据）。写入失败/短写时回滚到此前完整前缀（best-effort），避免后续追加产生中间坏行。
4. **append 前置校验顺序**：行长预算先于文件创建判定（超预算不创建审计文件）；版本锁内追加前 `stat.size === 预期前缀长度`，不一致 ⇒ `authorization-file-changed`（fail-closed，绝不盲追加）。

## 2. 文件清单与 sha256（前后）

| 文件 | 类型 | 前 sha256（HEAD `3f249e2`） | 后 sha256（工作树） | 行数 | numstat |
| --- | --- | --- | --- | --- | --- |
| `src/provider/trunk/impl/git-command.ts` | 修改 | `c995303e7057f99066ed4d5ef8a980a8b89c63779ff2f6809044d956e32a5966` | `2b76eaaf5b809eae6bc6055e3f03651bb4b9eea37c955af91e4434ec77c31467` | 977 | +255 / −2（仅 2 行既有 import 增补） |
| `src/provider/trunk/public/trunk-store.ts` | 修改 | `a98a55326017a5989967e3879119d4f79e549d6c6cda47c29c4c03ae528fbf22` | `abf08fc80f9c2b22f3ea2ca80306dde4734da4704f0caee969b3b368acbe5397` | 62 | +4 / −0 |
| `test/编排/git-action-authorization-sidecar.test.ts` | 新增 | `(new file)` | `910f9dc2e6889a768bd9e7d5e4ac01b3dbcbb7c02b47bd626e8c39721cc2ad0` | 247 | +247 / −0 |
| `角色卡/编排/docs/change/2026-11-08_W3a_git-action-authorization-sidecar.md` | 新增（本证据） | — | — | — | — |
| `角色卡/编排/docs/change/2026-11-08_W3a_evidence/` | 新增（原始日志/证据输入） | — | — | — | — |

- 产品代码 diff 除两行 import 增补外**全部为新增**（`git diff` 中删除行数 = 2）；未删除/放宽任何既有行为或测试。
- 未修改：`src/provider/trunk/impl/git-trunk-store.ts`、`src/service/trunk/impl/git-capabilities.ts`、`src/pipeline/orchestration/*`、`src/service/trunk/*`、`src/model/*`、`app/*`、其它角色/文档/测试。

## 3. API 签名与字段

公共出口（`src/provider/trunk/public/trunk-store.ts`，遵循既有 re-export 风格）：

```ts
export { appendGitActionAuthorization, readGitActionAuthorizations,
  GIT_ACTION_AUTHORIZATION_MAX_LINE_BYTES, GIT_ACTION_AUTHORIZATION_MAX_ATTEMPTS, GIT_ACTION_AUTHORIZATION_MAX_FILE_BYTES,
  type GitActionAuthorizationRecord, type GitActionAuthorizationRead, type GitActionAuthorizationReadResult } from "../impl/git-command.ts";
```

实现（`src/provider/trunk/impl/git-command.ts`）：

```ts
export interface GitActionAuthorizationRecord {
  source: "git-action-authorization"; version: 1; operationId: string; template: string;
  actorRoleId: string; coreSessionId: string; taskId?: string; runId?: string; turnId: string; activeTool: string;
  projectRoot: string; rootsDigest: string; registryRevision: string | number; inventoryRevision: string | number;
  leaseId: string; policyInputDigests: { init?: string; candidate?: string; publication?: string };
  optionalEvidence: {
    toolSurfaceStatus?: string; nativeStatus?: string; nativeReasonsCount?: number; processCoverage?: string;
    configuredForeignMcpServers?: readonly string[]; unknownTools?: readonly string[];
  };
}
export interface GitActionAuthorizationRead { ok: true; records: readonly GitActionAuthorizationRecord[]; diagnostics: readonly string[] }
export type GitActionAuthorizationReadResult = GitActionAuthorizationRead | { ok: false; code: "git-action-audit-unavailable"; message: string };

export const GIT_ACTION_AUTHORIZATION_MAX_LINE_BYTES = 4 * 1024;   // 含换行的 UTF-8 字节
export const GIT_ACTION_AUTHORIZATION_MAX_ATTEMPTS = 16;           // 同一 operationId
export const GIT_ACTION_AUTHORIZATION_MAX_FILE_BYTES = 64 * 1024;  // 4 KiB × 16，自洽

export async function appendGitActionAuthorization(
  projectRoot: string, record: GitActionAuthorizationRecord, options?: { heldLockToken?: string },
): Promise<void>;  // 任何失败 ⇒ throw Error("git-action-audit-unavailable:<detail>")

export async function readGitActionAuthorizations(
  projectRoot: string, operationId: string,
): Promise<GitActionAuthorizationReadResult>;
```

字段与校验口径（写入前校验 + 读取校验共用同一白名单）：

- `source` 必须为 `git-action-authorization`，`version` 必须为 `1`；顶层/子对象未知字段一律 fail-closed（因此 `applicationMediation`、凭据、环境字段无法写入）。
- `operationId`/`template`/`actorRoleId`/`coreSessionId`/`taskId?`/`runId?`/`turnId`/`activeTool`/`leaseId`：非空有界文本（无控制字符）；`activeTool` ≤64、`template` ≤128、`leaseId` ≤128、其余 ≤256。
- `projectRoot`：必须等于 `<canonical projectRoot>`（win32 大小写不敏感），写入时投影为 canonical 根。
- `rootsDigest`、`policyInputDigests.*`：小写 64-hex；`policyInputDigests` 至少一个键，键限于 `init`/`candidate`/`publication`（R2 多 verdict 映射由调用点提供）。
- `registryRevision`/`inventoryRevision`：非负安全整数或非空 ≤128 文本。
- `optionalEvidence`：全部可选；`toolSurfaceStatus`/`nativeStatus`/`processCoverage` 非空 ≤128 文本；`nativeReasonsCount` 非负安全整数；`configuredForeignMcpServers`/`unknownTools` 为 ≤32 项、每项 ≤128 字符的字符串数组。
- 显式字段投影、固定键顺序（`source, version, operationId, template, actorRoleId, coreSessionId, taskId?, runId?, turnId, activeTool, projectRoot, rootsDigest, registryRevision, inventoryRevision, leaseId, policyInputDigests, optionalEvidence`），每行一个 `JSON.stringify` + `"\n"`。

## 4. 安全写入语义（append）

1. 记录白名单校验 → `realpath(projectRoot)` 且必须 canonical（junction/符号链接别名拒绝）→ 记录 `projectRoot` 必须等于该 canonical 根。
2. 核验 `record.leaseId` 是当前持有的 `git-mutation` host lease；获取项目版本锁（未传 `heldLockToken` 时）并复核 lease；`ownsVersionLock` 失败 ⇒ fail-closed。
3. 渐进创建/校验 `.ans`、`.ans/trunk`、`.ans/trunk/operations`、`<sha256(operationId)>`：每级必须为真实目录、非符号链接、`realpath` 等于自身（拒绝越界/链接逃逸）。
4. 文件校验：`lstat` 必须为普通文件、非符号链接、`nlink === 1`、`realpath` 等于自身、大小 ≤64 KiB；写入句柄使用 `O_WRONLY|O_APPEND|O_CREAT`（POSIX 额外 `O_NOFOLLOW`）。
5. 读取既有内容（独立 `r+` 句柄）：每完整行按含换行 UTF-8 字节 ≤4096 校验；逐行严格 JSON/白名单/`operationId`/`projectRoot` 校验；行数 ≥16 ⇒ 拒绝；`keep + 新行 > 64 KiB` ⇒ 拒绝；末行截断先修复到最后完整行。
6. 追加句柄 `stat` 复核文件身份与 `size === keep`；单次 `write`（短写 ⇒ 失败）→ `fsync`；失败/短写 best-effort 回滚到 `keep`。
7. 所有失败统一映射为 `git-action-audit-unavailable:<detail>`（调用方据此不执行；本批次不接调用点）。

## 5. 测试覆盖（`test/编排/git-action-authorization-sidecar.test.ts`，6 个用例）

1. append/read 往返、冻结路径、字段投影/键顺序、`projectRoot` canonical 化、R2 三键 digest；
2. 同一 `operationId` 两次尝试（不同 lease）追加两行、`init.json` 哈希不变、旧 journal（无 sidecar）正常读取/缺文件返回空（只读隔离断言）；
3. 路径安全：硬链接（nlink≠1）、`authorization.jsonl` 被目录占位（写入 store 阻断注入）、operation 目录 junction、operations 目录 junction、非 canonical 根（junction 别名）；
4. 预算：超长行（>4 KiB）/第 17 次尝试/文件 >64 KiB/既有超长行/既有 17 行；
5. JSONL 容错：末行截断忽略 + 诊断、append 前修复、坏 JSON 中间行、顶层未知字段、`optionalEvidence.applicationMediation` 未知字段、写入输入未知字段；
6. 失败注入与 lease/锁：无 live lease、已结束 lease、伪造 leaseId、`projectRoot` 不匹配、错误 `heldLockToken`（fencing）、真实持有 `heldLockToken` 成功。

`P1.2-AC-30` 攻击面（符号链接/nlink/越界/预算/坏 JSON/截断）与 AC-16 写入 store 失败注入（拒绝 ⇒ 不执行、无 repo 效果）在 Provider 能力层覆盖；调用点“失败 ⇒ 不执行/无 ref/对象/工作树副作用”由 W3b 接线与验收覆盖。

## 6. 命令与原始结果

环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Git `C:/Program Files/Git/cmd/git.exe`；实施前 `src app test` 干净（本批次开始时实测）。

| 步骤 | 命令 | 结果 | 原始日志 |
| --- | --- | --- | --- |
| 实施前（受影响套件） | `node --test "test/编排/git-command.test.ts" "test/编排/git-trunk-store.test.ts"` | EXIT 0；tests 26 / pass 26 / fail 0 / cancelled 0 / skipped 0 | `2026-11-08_W3a_evidence/pre-affected-suite.log` |
| 实施后（必跑范围） | `node --test "test/编排/git-command.test.ts" "test/编排/git-trunk-store.test.ts" "test/编排/git-action-authorization-sidecar.test.ts"` | **EXIT 0；tests 32 / pass 32 / fail 0 / cancelled 0 / skipped 0 / todo 0**（既有 26 + 新增 6） | `2026-11-08_W3a_evidence/post-affected-suite-required-rerun.log` |
| 实施后（首跑异常，已复跑） | 同上 | 首跑触发 Node 测试运行器原生断言崩溃（`node::CleanupQueue::Add` @ `git-trunk-store.test.ts`，非测试断言失败）；立即复跑全绿（上条）。判为 Node v24.22.1 测试运行器不稳定，已保留原始日志。 | `2026-11-08_W3a_evidence/post-affected-suite-required.log` |
| 额外回归（非必跑） | `node --test "test/编排/git-capabilities.test.ts"` | tests 15 / pass 12 / fail 1 / skipped 2；失败项 `Git team plan publication and active-only activation…`（`trunk-item-invalid: The actual publication task has no original Chief input source`）。**A/B 证明为既有失败**：以 HEAD 两个产品文件原样替换后同用例以相同错误失败；恢复后 sha256 与替换前一致（`RESTORE_OK=yes`）。2 个 skip 为该文件内既有 `# SKIP`。 | `2026-11-08_W3a_evidence/git-capabilities-alone.log`、`…/git-capabilities-baseline-AB.log` |
| 额外回归（4 文件一并） | 上述 3 + `git-capabilities.test.ts` | tests 47 / pass 44 / fail 1（同上既有失败）/ skipped 2 | `2026-11-08_W3a_evidence/post-affected-suite.log` |
| typecheck（实施中，W1 未落盘时） | `npm run typecheck` | **EXIT 0** | `2026-11-08_W3a_evidence/typecheck.log` |
| typecheck（最终工作树全量） | `npm run typecheck` | EXIT 1；**仅 2 个错误且都在 W1 本轮未跟踪在飞文件** `test/runtime-core/codex-native-optional.test.ts`（非本批次写集；该文件在实施中途出现，见 §7 并发说明）；本批次文件与既有 tracked 文件 0 错误。 | `2026-11-08_W3a_evidence/typecheck-final.log` |
| typecheck（排除仅 W1 在飞文件的同配置复跑） | `npx tsc --noEmit -p "角色卡/编排/docs/change/2026-11-08_W3a_evidence/tsconfig.w3a.json"`（extends 根配置，仅 exclude 该 W1 文件） | **EXIT 0** | `2026-11-08_W3a_evidence/typecheck-scoped.log`、`…/tsconfig.w3a.json` |

结论：**本批次新增/改动范围内 typecheck exit 0；必跑测试 32/32 全绿；无新增确定性失败、无新 skip、未删除/放宽断言、未加 skip、未 force-exit。**

## 7. 并发说明（共享 worktree）

实施期间 W1（运行时核心）在同一 worktree 开始写入其写集（`src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/*`，含未跟踪 `codex-native-optional.test.ts`、`drain-predicate.test.ts`）。本批次：

- 未读取/修改/回滚 W1 任何文件；A/B 仅临时替换本批次两个产品文件并验证 sha256 恢复一致。
- 必跑范围（`test/编排/git-command*`/`git-trunk-store`/新增 sidecar 测试）不 import W1 的运行时核心文件，32/32 结果对本批次候选有效。
- 全量 typecheck 的唯一失败来自 W1 在飞未跟踪测试文件；排除该文件的同配置复跑 exit 0（见 §6）。

## 8. 未提交与写集声明

- 本批次**未 commit / push / stash / merge / 发布**；变更仅为工作树未提交改动 + 未跟踪证据/测试文件。
- 写集内实际改动：`src/provider/trunk/impl/git-command.ts`、`src/provider/trunk/public/trunk-store.ts`、`test/编排/git-action-authorization-sidecar.test.ts`、本证据与本证据目录。
- 未触及：`src/provider/trunk/impl/git-trunk-store.ts`、`src/service/trunk/impl/git-capabilities.ts`（I0-2 默认不改）、`src/pipeline/orchestration/*`、`src/service/trunk/*`、`app/*`、`src/model/*`、运行时核心文件、其他角色/文档/测试、权限/边界/角色卡。
- 本批次只提供能力，**未接入调用点**；authorization 组合、write-ahead 调用与两阶段复检顺序由 W3b（`trunk-runtime`）实施。
