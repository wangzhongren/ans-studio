# 2026-10-30 — 第一波 3.2 拒绝三段式 + 契约速查（实施记录）

- 批次：第一波 **3.2 MechanicalRejection + contract_check**（方案 v3 §3.2/§8；团队计划 §4.2；P2.1–P2.5）。
- worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`（分支 `feat/flow-improvements-wave1`）。
- 基线：`e112089`（3.1 已 pass）；本地提交，不 push、不合 main。
- 性质：实施与验证记录；3.2 只做 T2 范围，不实现 3.3/3.4/3.5。

## 1. 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/common/编排/mechanical-rejection.ts`（新增） | `MechanicalRejection {code,missing,action,owner,docs,retryable,detail?,legacyCode?}`；集中 `code→owner/action/retryable` 表（run/roster/module/appointment/shell/versioned/evidence 高频点）；`formatMechanicalRejection`（模型回执含三段式+技术 code）、`humanRejection`（客户卡只人话）、`technicalRejectionCode`；旧 code 别名表（M2/M5/M6/APPOINTMENT_ROOT/PATH_OUTSIDE 等）；`docsForFlow`、`rejectionMapSnapshot`、`canonicalRejectionCode`。 |
| `src/common/编排/workflow-preconditions.ts` | `DispatchPreflightResult` 增 `rejection`；所有 `reject()` 自动结构化（missing 默认消息，owner/docs/retryable 从集中表）；`target-card-missing` missing 逐项列 D3 选中角色 id（BUG-4）；run 相关 code 映射（run-missing/run-pin-required/run-role-missing/run-legacy-readonly）。 |
| `app/desktop/session.ts` | `routeStarDispatch` fail 支持结构化 rejection：模型回执三段式，系统行只人话+短技术 code；preflight 拒绝使用 `preflight.rejection`；新增只读 `contractCheckText`（manifest/pinned docs/角色模块/写区/禁止路径/taskKind 必填/拒绝表，≤4KB）并注入所有角色会话。 |
| `src/model/runtime.ts` | `ContractCheckInput`/`ContractCheckFn`；`GovernedToolsOptions.contractCheck`。 |
| `src/pipeline/orchestration/run-role.ts` | `AdapterCapabilities.contractCheck` 透传；openRoleSession 输入与能力对象接线（未注入 ⇒ 工具不注册）。 |
| `src/provider/runtime/tools.ts` / `schema.ts` | `contract_check` 工具：只读、调用角色裁剪、参数流/role/taskKind/module、≤4KB 截断；schema/description/prompt 明示“查询不构成放行”。 |
| `src/common/编排/run-manifest.ts` | 增 `renderRunQuickref(manifest)`（可选静态快照生成器，以 manifest 为唯一来源）。 |
| `test/桌面应用/rejection-copy.test.ts`（新增） | 7 例：三段式字段/客户人话无 code；BUG-4 列缺卡 id；BUG-3 owner=app；code→owner 高频覆盖；旧 code 别名；contract_check 工具只读/角色隔离/未注入不注册/≤4KB。 |
| `test/桌面应用/run-pin.test.ts` | 增加 session contract_check 测试（legacy 明示、角色/模块/taskKind）。 |
| `test/编排/run-manifest.test.ts` | 增加 quickref 与 manifest 文档/hash 一致性测试。 |

## 2. P2 行为要点

- **P2.1**：纳入范围的派发/名单/模块/任命/run 拒绝均带 `code/missing/action/owner/docs/retryable`；默认最多 missing 5 项、docs 5 条；文案三段式，模型回执保留技术 code，系统行折叠短 code。
- **P2.2**：`target-card-missing` 的 missing 逐项列 D3 选中缺卡 id（render-dev/test-dev 等），不再出现“运营目标角色卡不存在”；`appointment-write-root-missing` owner=app，提示应用修复 allowedPathRoots/pathProbes 后重试（BUG-3 归因应用，不怪角色写卡）。
- **P2.3**：`contract_check` 只读；返回 runId/state/pinnedAt、七类文档 path+sha、角色模块/边界/写区/禁止路径、taskKind 必填、常见 code→next；无 manifest 时明示 `legacy（未冻结）`；调用角色裁剪（tool 拒绝查询其他角色）；≤4KB；未注入能力时不注册。
- **P2.4**：`renderRunQuickref(manifest)` 纯生成器逐项取 manifest 的 path/sha，测试断言一致；不手写第二份规则，未在 3.2 强制落盘静态文件（设计列为可选快照）。
- **P2.5**：§8 高频 code→owner 表集中维护并被测试覆盖；旧 code 别名（M2_ROSTER_INVALID/M5_TARGET_CARD_MISSING/M6_MODULE_OWNER_MISMATCH/APPOINTMENT_ROOT_MISSING/PATH_OUTSIDE_BOUNDARY）保留 `legacyCode`；客户卡 `humanRejection` 不含技术 code。

## 3. 验证（串行）

- 定向：`rejection-copy` **9/9**；`run-pin` **9/9**；桌面应用全套 **369/369**（rework 后）。
- 全量：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` → **3043 tests / 3013 pass / 12 fail / 18 skip**（基线 3034/3004/12/18；+9 新测试全过，12 红仍为 9 Windows symlink EPERM + T1×3，无新增确定性失败/新 skip）；日志 `%TEMP%\ans-wave1-32-full3.log`，sha256 `591c741bd1eee1a27639fc5edc66b527017dac1f6bd0fd6fcf8cf8e2e050bc1e`。
- `npm run typecheck`、`typecheck:renderer`、`build:renderer` exit 0（最终代码重跑）。
- 真实 Electron E2E：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG；报告 `%TEMP%\ans-e2e-wave1-32r\report.txt`，sha256 `849f0247f69adb5343d178f930dc3f07866a12f3bf48e4f3d353acc5c722e8cc`。
- phase5a：40/40 checks、failures=0、console/CSP 0；report `%TEMP%\ans-phase5a-wave1-32r\report.json`，sha256 `2840f11776566fb81c88d0e81c1c009076b7e48a82e29df0e6edc5ac2f242f04`。

## 4. 决策点 / 边界

- 静态 quickref：实现为纯生成器 `renderRunQuickref`，3.2 不强制写入项目 `docs/contracts/*-quickref-vN.md`（可选快照）；live 权威源为 `contract_check` + manifest，避免应用越权写策划文档。
- shell/versioned 高频 code 已在集中表映射；3.2 未重写 shell 工具的全部旧拒绝文案，后续调用点可按同一 `makeMechanicalRejection` 适配（不改变门禁）。
- contract_check 不构成放行/授权；只读数据源异常由工具如实回错，不编造 pin/写区。
- 不实现 3.3 asset gate / 3.4 evidence checker / 3.5 stage release；不新增 cardKind；不改 renderer；未改 manifest/任务状态数据。
- 回滚=撤销本批提交并重跑 3.2 验证；旧 code 兼容表随代码回滚。

## 5. 验收 rework（3.2 v1）

- **P2.1/P2.5 真实接线**：`shell-write-guard.ts` 的 deny 统一经 `makeMechanicalRejection`/`formatMechanicalRejection`，返回保留 `kind/targets` 旧字段并增 `code/rejection`；版本化文档 `versionedDocOverwriteDecision` 返回 `allowed:false + code + rejection + 三段式 reason`；governance judge `manualOutcome` 统一格式化三段式（reasonCode 保留）。`shell-write-outside`/`shell-write-hard-deny`/`versioned-doc-overwrite` 等 owner/action 入集中表；旧字段兼容。
- **P2.2 BUG-3 真路径**：`governance-judge-verdict.ts` 在 appointment-write 缺 allowedPathRoots 时改返回 `appointment-write-root-missing`（owner=app、检查可写根接线、可原样重试）；`rejection-copy` 用例改为构造真实 `evaluateGovernanceJudgeVerdict`，不直接调用 makeMechanicalRejection 自证。
- **P2.3 补强**：`run-pin` 增 pinned run 的 session `contract_check` 用例（runId/state=pinned、七类文档 path/hash、角色模块/写区、taskKind 必填）。
- **P2.4**：quickref 决策维持——纯生成器 `renderRunQuickref(manifest)` + 一致性测试；不强制落盘静态文件。
- shell/versioned/judge 测试：`rejection-copy` 9/9；`shell-write-guard` 9/9；`versioned-doc-guard` 12/12；governance judge 相关既有套件随全量通过。
- 全量（rework 后）：**3045 tests / 3015 pass / 12 fail / 18 skip**（+2 真实 shell/versioned 用例；12 红仍为既有环境问题）；日志 `%TEMP%\ans-wave1-32-rework-full.log`，sha256 `a26465f973886f4d2ec0feb88aa6729a942f610564ad1638407f8bfabc566c89`。
