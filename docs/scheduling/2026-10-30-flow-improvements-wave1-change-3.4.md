# 2026-10-30 — 第一波 3.4 证据自洽性机器校验（实施记录）

- 批次：第一波 **3.4 evidence sidecar / P0 criteria / evidence_check**（方案 v3 §3.4；团队计划 §4.3；P4.1–P4.5；Delta-W1-3）。
- worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`（分支 `feat/flow-improvements-wave1`）。
- 基线：`2e9abd6`（3.2 已 pass）；前置契约：`docs/acceptance/2026-10-30_wave1-p0-criteria-format-v1.md`（234 行 / `4b80cf5708db2c4a9129c315bb89f57fd7a62d7a000d74da3f5f0047a7d2248f`，主检出只读）。
- 本地提交，不 push、不合 main。

## 1. 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/common/编排/evidence-check.ts`（新增） | `ans-criteria/v1` 唯一 fenced block 解析（NFKC/全半角/空白/前导零归一化、AC/P 双形态、严格字段/版本/status/flowId/重复/上限）；显式 `criteriaRef` 加载（无 ref 报 `criteria-version-unresolved`，不取 latest）；`evidence-meta/v1` sidecar/collection 解析；应用重算 artifact bytes/lines/sha256/mtime；artifact 自述（行数/pass/fail）解析并与实际/sidecar 比对；P0 缺 sidecar/mismatch/stale/acIds 缺失 fail-closed；P1/P2 缺 sidecar 标 `unverified/legacy`；`AcceptanceFact` priority 派生（criteria 唯一来源，sidecar/角色 p0 忽略并标记）。 |
| `src/common/编排/mechanical-rejection.ts` | 新增 criteria 15 类失败码（missing/format/ambiguous/parse/schema/version/ref/status/id/priority/duplicate/too-many/empty/mismatch）的 owner/action/retryable 映射，供 `evidence_check`/验收结构化拒绝复用。 |
| `src/model/runtime.ts` | `AcceptanceFact`（acId/priority/artifact/metaPath/valid/unverified/legacy/mismatch）、`CriteriaRef`、`EvidenceCheckInput/Fn`；`CustomerInputMetadata.criteriaRef/acceptanceFacts`；`GovernanceJudgeFacts.criteriaRef/acceptanceFacts/evidenceMismatch`；`GovernedToolsOptions.evidenceCheck`。 |
| `src/common/编排/governance-judge-facts.ts` | 注释并保持 `...facts` 有界透传 acceptance facts/criteriaRef/mismatch（builder 不改写 priority）。 |
| `src/provider/runtime/tools.ts` + `schema.ts` | 只读 `evidence_check` 并入既有工具文件（不新增 runtime 文件）：artifact/metaPath/acId/criteriaRef 输入；未注入不注册；≤4KB；不执行项目脚本、不授予写权。 |
| `src/pipeline/orchestration/run-role.ts` | `AdapterCapabilities.evidenceCheck` 透传（工具注入才注册）。 |
| `app/desktop/session.ts` | 全角色注入 `evidenceCheck`（`evidenceCheckText`：loadCriteria 显式 ref → checkEvidence/collection，输出 `evidence-check/v1` JSON；artifact 路径限项目内、禁 `.ans`/`.env`）；验收 enrich 读取 metadata.criteriaRef/acceptanceFacts，按 criteria 派生 priority、逐事实检查 sidecar，P0 mismatch 写入 `evidenceMismatch`/unavailableReason。 |
| `test/编排/evidence-check.test.ts`（新增） | 8 例：正例/归一化/重复/非法 priority/无多 block/draft/版本、显式 ref（无 ref/hash/draft）、P0 sidecar、AC-28 自述 223/234 与 pass 198/214、P1 未校验、stale/acIds、collection。 |
| `test/runtime-core/evidence-check-tool.test.ts`（新增） | 只读工具注册/参数/≤4KB/未注入不注册。 |
| `test/桌面应用/acceptance-evidence.test.ts`（新增） | P4.1/P4.5 priority 由 criteria 派生、p0:false 不降级、P0 缺 sidecar 不通过、P1 未校验；显式 criteriaRef。 |
| `test/桌面UI/evidence-markers.test.ts`（新增） | 验收 facts 暴露 unverified/legacy/evidenceMismatch/criteriaRef；P0 不伪造通过（静态数据结构钉）。 |
| `test/测试/evidence-sidecar-e2e.test.ts`（新增） | criteria ref → artifact/sidecar 实盘 E2E 通过。 |

## 2. P4 行为要点

- **P4.1**：`AcceptanceFact.priority` 只由 `ans-criteria/v1` 派生；P0 fact 必须有 sidecar，且应用重算 bytes/lines/sha256、metrics/自述一致才 valid；sidecar/角色 `p0:false` 只被忽略并标 `p0Ignored`，不能降级。
- **P4.2**：artifact 自述（如“下列 223 行”“pass 198”）与实际/sidecar 不一致 ⇒ `evidence-mismatch`；修正 artifact/sidecar 后正例通过；不自动改 artifact/sidecar。
- **P4.3**：artifact 修改后 sidecar hash/lines/bytes 或 generatedAt stale ⇒ mismatch；legacy 无 sidecar（P1/P2）标 `unverified/legacy`，不伪造通过。
- **P4.4**：`evidence_check` 只读、不执行项目脚本；collection sidecar 逐文件 hash/bytes/lines/acIds 检查；sidecar acIds 不含 fact.acId / AC 不在 criteria ⇒ `criteria-mismatch`。
- **P4.5**：P0 分类/priority 由 criteria 机械派生；`AcceptanceFact.priority` 由应用写入/校验，角色不能自报。

## 3. 决策点

- **criteriaRef 落点**：最小侵入——`CustomerInputMetadata.criteriaRef` + `GovernanceJudgeFacts.criteriaRef` + `evidence_check` 入参；**不扩 manifest 形状**（`documents.criteria` 属闸门 1，未做）。
- **版本规则**：只接受显式 path+sha+version；无 ref ⇒ `criteria-version-unresolved`；不取 latest、不猜草稿；sha/版本/flowId 不符 fail-closed。
- **行数口径**：UTF-8 字节；CRLF/LF 统一为 LF 后计数；无尾随换行时计最后一行为一行（测试覆盖）。
- **静态 quickref/验收 UI**：本批不改 renderer；未校验/legacy/mismatch 通过 acceptance facts 数据暴露（`unverified/legacy/evidenceMismatch`），不新增 cardKind。
- **未做**：3.3 asset gate、3.5 stage、renderer 视觉标记；`documents.criteria` manifest 扩展需重开闸门 1。
- **工具边界**：`evidence_check` 只读、不执行脚本、不改 artifact/sidecar；≤4KB；未注入不存在。

## 4. 验证（最终代码）

- 定向：evidence-check 8/8、evidence-check-tool 1/1、acceptance-evidence 2/2、evidence-markers 1/1、evidence-sidecar-e2e 1/1（13/13）；桌面应用全套 **373/373**。
- 全量：`node --test --test-concurrency=1 --test-timeout=120000 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` → **3060 tests / 3030 pass / 12 fail / 18 skip**（基线 3047/3017/12/18；+13 新测试全过，12 红仍为 9 Windows symlink EPERM + T1×3；无新增确定性失败/新 skip）；日志 `%TEMP%\ans-wave1-34-full1.log`，sha256 `66789c48a8879a9a0443a5ab972f76d667f81803252221d5d978e4c1474d8e5e`。
- `npm run typecheck`、`typecheck:renderer`、`build:renderer` exit 0（最终代码重跑）。
- 真实 Electron E2E：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；report `%TEMP%\ans-e2e-wave1-34\report.txt`，sha256 `f16c51e49280d7e27a459a883a8f8dabb0f892a4190934bbb5b8aeb9beeccb6b`。
- phase5a：40/40 checks、failures=0、console/CSP 0；report `%TEMP%\ans-phase5a-wave1-34\report.json`，sha256 `dc7c03504cbdaf3bd1e0d07f44d2212d710c23b983387a9d90804326a8f02786`。
