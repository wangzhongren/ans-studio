# KR-29 source evidence (code / api-spec / history)

All paths relative to repo root at 5661a73. "Real semantics" = current product behavior with contract/history support; "old expectation" = frozen test assertion.

## E1 — Gate role-card / roster display drift (5 names)

- `src/common/门禁引擎/governance-roles.ts:335` `specOf()` projects `cardText: module.card.text`; role text is owned by `src/common/roles/<id>/`.
- `src/common/roles/verifier/index.ts:51` current card: `职能：独立质量核对与验收执行者——新任务仅由 Chief 创建、收报和收口；不批准、不代客户验收。`
  - Parent of `e71501c` (`git show e71501c^:src/common/门禁引擎/governance-roles.ts:258`) had `职能：可选质量核对与验收执行者——由运营发起或幕僚调度；...`.
  - The current card still contains `证据最多真实运行截图（关 DEBUG；记录 sha256/候选/命令）；不要求录屏，缺录屏不判失败。` and no mandatory-evidence strings, so the D-batch intent (optional evidence / no forced recording) is preserved; only the literal `可选质量核对` is stale.
- `src/common/roles/chief/internal/card-text.ts:20-32` current chief card: `Chief自身流程以实际注入的独立 chief-workflow.md 为准，项目实现流程由 Convener 维护。` and `项目 docs/workflow.md ... 仍由 Convener 管impl`. Old phrase `项目工作流文件 docs/workflow.md 由运营落盘维护` was removed by `e71501c` (checkpoint Chief workflow / Git role integration).
- `governance-roles.ts` `BUILT_IN_ROLE_MATRIX.chief` current display fields are about reading `chief-workflow.md`; old `工作流管理、按序派发、短报汇总` existed at `e71501c^:governance-roles.ts:161/316` and was removed in the same redesign.
- Roster count: commit `7281792` (2026-11-08, “8 个开发侧维护角色卡/边界与角色记录”) added chief-code/product-code/rapporteur-code/nominator-code/convener-code/verifier-code/shared-code/gates-code. Probe at 5661a73: `listProject` returns 24 roles, 23 non-builtin (15 + the 8 code roles). `角色卡/招募/memo.md` is a memo-only directory; the same commit’s memo states: “唯一 warning 为 `角色卡/招募：缺少 role-card.md，已跳过`——这是本备忘录目录按技能默认路径产生的预期提示，非角色卡缺陷。” Product behavior (skip + warning) is therefore intended.

## E2 — VCA customer-approval channel closed (5 AC-5 names)

- `角色卡/编排/api-spec.md:1227`: `... ordinary submit/present no longer create customer approval cards.`
- `src/pipeline/orchestration/version-change-runtime.ts:765-773`:
  - `submit()` returns `{ok:false, code:"vca-channel-unavailable", message:"Ordinary document submissions use submitDirect with a real operation, expected base and target hashes; the former customer approval channel is closed."}`
  - `present()` returns `vca-channel-unavailable` for historical records; only `approve()` still runs `checkUpgradeChain` (AC-5 schema/roster/D3/version-chain checks) for a real prior approval.
- Introduced by `3362acb` (2026-11-05, trunk/amendment model: confirm-to-freeze, VCA, amendment, lightweight refactor, stable confirm-to-write). The 5 tests still use the retired `runtime.submit({kind:"version-upgrade"})` + `runtime.present()` flow.

## E3 — Nominator direct role-card writing gated by real plan/D3 (4 names: 2 appointment + 2 section1)

- `src/pipeline/orchestration/run-role.ts:1649-1679`: task-scoped sessions derive `assignedTaskWritePaths`; `run-role.ts:1779-1781` adds a nominator-specific guard:
  `if (rel matches ^角色卡/<id>/(role-card.md|boundary.md|boundary.yaml)$) { if (!roleDraftWritePaths.includes(rel)) return { allowed:false, reason:"Role drafts require the actual completed plan and current D3 selection; no old appointment-write card can substitute" ... } }`
- `roleDraftWritePaths` is filled from the real completed plan/D3 scope (`run-role.ts:1619-1646`; commit `d3bcd86` “B16 authorize A8 role drafts from the fixed roster”, also touched by `e71501c`).
- `src/common/roles/nominator/index.ts:59` current card: `直接写卡：在真实 D3 与计划范围内，逐路径直接写 ... 不再逐角色发 appointment-write；... 名单版本/hash 漂移、未选中、无 D3 均拒绝。`
- Therefore, with no real plan/D3, an old appointment-write card's declared role-card paths are correctly probed `allowed:false`; the card is not a substitute. The two BUG-3 tests and the first section1 test encode the pre-retirement appointment-write behavior. The second section1 test still sees `allowed:false` but expects the old F4 reason string; current reason is the roleDraftWritePaths message.

## E4 — Host-facts capability plane: `protectedGitRoots` in one-shot/session adapters (2 names: A5 + session-dir capabilities)

- `src/pipeline/orchestration/run-role.ts:579-580` (one-shot runRole): `createAdapter(gate, { protectedGitRoots: protectedGit.protectedGitRoots, ...(managed ? {fileGateProtocol, fileGateProtection} : {}) })`.
- `src/pipeline/orchestration/run-role.ts:2997` (openRoleSession capabilities): `protectedGitRoots: gitProtection.protectedGitRoots` is always present.
- `git blame` dates both to `e71501c` (2026-11-07, Git role integration). The frozen tests assert the whole capabilities object is `undefined`; the actual object is `{protectedGitRoots: [...]}`. The governance matrix itself is still not injected in one-shot mode; the A5 test name (“矩阵不注入”) remains valid, but the whole-object assertion is stale.

## E5 — Task-scoped sessions fail closed without a real assignment (handback 1 name)

- `run-role.ts:1649`: `assignedTaskWritePaths = input.taskId && role.kind !== "built-in-governance" ? [] : undefined`; refreshed from real task/trunk facts (`:1650-1679`).
- `run-role.ts:1759`: any write outside `assignedTaskWritePaths` is denied with `Target is outside the actual assigned task's frozen module/current authorization intersection`.
- The handback test opens a project role with synthetic `taskId: "T-1"` that does not exist in the task ledger, so the write in its fake script is denied and the terminal handback becomes `blocked` (a denied step + no evidence) instead of `unreported`. The fail-closed behavior is intentional (fixed-path assignment authority, B16/B26; commit `07a0912` B26 module-path scope, originally `e71501c`).

## E6 — Chat report keeps host-verified taskId independently of `required` (chat-handback 1 name)

- `角色卡/编排/api-spec.md:1458` (2026-10-14 chat-handback-scope revision 2): `RoleSessionHandle.send(text,{handback:{required,taskId?}}) now retains a host-verified taskId independently of required. ... An explicit new-chat intent {required:false} without taskId clears the constructor's old reporting identity.`
- `src/pipeline/orchestration/run-role.ts:3215-3219` implements this: `intent = { required: opts.handback.required }; if (opts.handback.taskId) intent.taskId = opts.handback.taskId;`
- The test still expects the old “chat report drops old taskId” behavior (passes `taskId:"ignored"` with `required:false`, expects `undefined`; actual is `"ignored"`).

## E7 — Team-plan publication requires original Chief work source (git-capabilities 1 name)

- `src/service/trunk/impl/apply-journal.ts:1196`: publication requires `task.from === "chief"` and `isTaskWorkSourceRef(ref)`, else `trunk-item-invalid: The actual publication task has no original Chief input source`.
- `角色卡/编排/api-spec.md:1286` / `:1667`: `TaskCreatedEvent.workSourceRef` four-field shape carries the real immutable source; missing source refuses rather than borrowing latest/init.
- The failing test records `task.created` with no `workSourceRef`; the fixture predates the source-binding requirement (introduced `e71501c`).

## E8 — Bare Git writes are hard-denied by the shell gate (P6 1 name)

- `src/common/门禁引擎/shell-write-guard.ts:581-618`: since W3-G (2026-11-08), `program === "git"` only allows the readonly whitelist and task-level `add`/`commit`; all other Git (`push/merge/reset/checkout/clean/update-ref...`) is hard-denied: `裸 Git 硬拒：... shell 批准不能覆盖 Git 角色拒绝。`
- The P6 test lists `git clean -fdx` and `git checkout -- .` in the “opaque ⇒ approval ⇒ allow” list. Current behavior is static deny, independent of approval.

## E9 — Frozen-conflict message carries path suffix (direct-role 1 name)

- `src/provider/version-change/impl/guard-freeze-registry.ts:989`: `message: ${result.reason}: ${result.path}${detail...}`; `:916` maps reason to `conflict`.
- `角色卡/编排/docs/change/2026-11-09_W2_orchestration_team-plan-run-binding.md:144` already recorded this test as baseline red: “`frozen-conflict` 文案带路径后缀 vs 旧断言”. Actual: `frozen-conflict: docs/product/demo-intent-v2.md`; expected: `frozen-conflict`.

## E10 — TM-5 schema-literal allowlist drift (1 name)

- Test `test/编排/doc-format-specs.test.ts:1312` scans `src/**/*.ts` for `"xxx/vN"` literals and requires coverage by docs specs or `SCHEMA_WHITELIST`.
- Missing literals and their real homes:
  - `ans-basis/v1`, `ans-release/v1`, `ans-workflow/v1` — `src/model/runtime.ts:1959-1961` fixed-ledger schemas, written by `src/common/编排/workflow-service.ts`.
  - `ans-task-git-shell/v1` — `src/pipeline/orchestration/run-role.ts:1037` task-Git shell matcher kind.
  - `chief-workflow/v2` — `src/pipeline/orchestration/run-role.ts:4582` resource version check.
  - `legacy/v1`, `two-fixed-paths/v1` — `src/model/role.ts:98` dispatch/workflow schema enum.
- All are internal state/matrix identifiers, not project document formats; whitelist entries with reasons are the consistent fix.

## E11 — Stable snapshot pending diagnostics (trunk-service 1 name)

- `src/service/trunk/impl/stable-snapshot.ts:104-106`: pending result is `{ applied:false, pendingReattach:true, errorCode, message }`; missing manifest yields `errorCode:"stable-manifest-unavailable"`, `message:"missing"`.
- `角色卡/编排/api-spec.md:1714` explicitly records: “trunk-runtime expected pending result now keeps actual stable-manifest-unavailable/missing diagnostic fields; original mini-repin/no version bump/no spurious event assertions remain.” The test still deep-equals only `{applied:false,pendingReattach:true}`.

## E12 — Chief/worker card text superseded by resource-driven model (3 trio-worker-report names)

- Current chief card (`src/common/roles/chief/internal/card-text.ts:20-32`) delegates process to the injected `chief-workflow.md`: `Chief自身流程以实际注入的独立 chief-workflow.md 为准...不使用卡内另一份流程副本。`
- `src/common/门禁引擎/workflows/chief/chief-workflow.md:31`: `完成本轮必要的派发后结束本轮，等待真实回报或系统巡检输入；...不要 sleep、连续轮询 role_status 或空转...` — equivalent discipline moved to the resource.
- Fixed-path resource `chief-workflow-v2.md:80`: `固定路径不发 acceptance 卡：验收 = 独立质检报告 + 你的业务决策 + 应用写 docs/acceptance/ 归档。` The current convener card says: `独立质检：...由 Chief 创建 Verifier 任务、接收报告并收口。你不派新质检、不发 acceptance 卡、不代客户验收。`
- The v4.1 card-order assertions (`主链顺序（必须）`, `①产品...`, etc.) no longer exist in the card; v1/v2 resources define the current A1–A13 / B1–B4 stages. Semantics intentionally changed; tests must target current cards/resources.

## E13 — Empty projectRoot now crashes on Git-protection discovery (product regression, 1 name)

- `src/pipeline/orchestration/run-role.ts:1543` (`openRoleSession`) and `:537` (`runRole`) call `readGitProtectionFacts(input.project.projectRoot)` unconditionally.
- `src/provider/trunk/impl/git-command.ts:624-626`: `const root = await realpath(projectRoot)` — `realpath("")` throws `ENOENT: no such file or directory, realpath ''` (local + both CI platforms).
- `git blame` dates the call to `e71501c` (2026-11-07). The frozen test explicitly covers legacy behavior (“旧行为”), and `sessionDirFor` still has an explicit empty-root guard (`run-role.ts:4466-4469`), so empty projectRoot was a supported input before the Git-protection plane was added.
- Minimal fix: short-circuit when `projectRoot.trim() === ""` to unmanaged/empty protection facts (no realpath / no host-protection probe) so session construction keeps the old no-sessionDir behavior; alternatively, owner may rule empty root unsupported and replace the test with a structured rejection (then reclassify as test assumption).

## E14 — Local Windows symlink privilege (environment/platform, 1 name)

- `test/编排/shell-authorized-routine.test.ts:184-191` calls `fs.symlinkSync` in test setup. Local machine lacks SeCreateSymbolicLinkPrivilege ⇒ `EPERM` before the assertions are reachable.
- R6 CI (macOS x64 + Windows x64) passes this test. Same machine still EPERM in the neutral root, so it is not a checkout-shape issue.
- Fix: capability probe; on win32 use a junction where semantically equivalent, or diagnostic skip; do not relax the “outside link not delegated / inside project delegated” assertions.

## E15 — Already-green frozen name (wiring guards)

- `test/编排/git-action-authorization-wiring.test.ts:69`; green locally and both CI platforms.
- Fixed by `8f6bbd2` (2026-11-16, B3c): source slice read now normalizes CRLF (`replaceAll("\r\n","\n")`) because the local checkout had CRLF while CI has LF. This was an environment/checkout-form root cause fixed after the B17 freeze; the name should be registered as REMOVED in the next baseline.
