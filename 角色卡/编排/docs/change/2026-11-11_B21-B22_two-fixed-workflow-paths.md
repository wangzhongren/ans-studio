# W：B21/B22 fixed 实现写集与 A12 证据回退（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B21/B22——RR16 失败修复（A11 派发写授权、A12a 证据缺口）。
- 依据：RR16 记录 `角色卡/测试/docs/change/2026-11-11_RR16_two-fixed-workflow-paths.md`（`20714653…`）；协调方 B21/B22 授权。
- 基线：HEAD `364ca98`（RR16 记录提交）。

## 一、RR16 失败事实

- A8 completed（4/4 role.activated，B20/B17 生效）、A9/A10 completed、A12a criteria 落盘；A11 实现派发时 env-bootstrap 任务 `moduleId=env-resources` 携带 `modulePaths=["README.md","index.html"]`（index.html 属 entry-index），worker `write_file` 被写门禁拒绝（allowed project:(无)）；game-qa 的 qa/ 同因。
- A12a criteria 报告 `evidence[]` 无可用纯路径 ⇒ `close-report-missing`，需补交。
- chief 派发 13 > 批准 12（RR17 已批准 chief ≤18/总 ≤50）。

## 二、实施

### 2.1 `workflow-preconditions.ts`（M）——B21 纯函数

- 新增导出 `deriveFixedModuleWriteSet(roster, moduleId, requestedPaths?)`：
  - `moduleId` 权威：从最新名单模块表取该模块 `paths`；
  - 模型 `modulePaths` 只作断言（必须落在模块 paths 内；文件=精确、目录=前缀）；
  - 未知 moduleId / 跨模块路径 ⇒ `{ok:false, code:"module-paths-mismatch"}`（稳定码，fail-closed）；
  - 通过 ⇒ 返回 canonical module paths（任务写集以应用派生为准）。
- 测试 `test/编排/workflow-preconditions.test.ts`：同模块/省略路径/目录内文件通过；跨模块（env-resources 带 index.html）与未知 moduleId 拒绝。

### 2.2 `app/desktop/session.ts`（M）——B21 派发接线 + B22 证据回退

- `routeFixedPathDispatch`：`!isStageRequest && convener && stage=A11 && moduleId` 时加载最新 roster 并调用 `deriveFixedModuleWriteSet`；失败 `module-paths-mismatch` 拒绝派发；成功用派生 paths 写 `task.created.modulePaths`（模型 modulePaths 仅断言）。
- `buildFixedCloseEvidence`：A12a/A12b 报告 evidence[] 无可用纯路径时，按应用质量路径回退——`findFixedReviewArtifact` 取最新 `docs/quality/<flowId>-{criteria|report}-vN.md` 的实际字节 SHA-256；文件缺失仍 `close-report-missing`。A12b 归档的 report/criteria 路径同样支持回退。
- 测试：
  - `test/桌面应用/b101-fixed-dispatch-task-binding.test.ts`：B22 A12a 无纯路径 evidence ⇒ 文件缺失 `close-report-missing`；文件存在 ⇒ accepted + `stage.completed A12a`（artifact=应用质量路径）。
  - `test/桌面应用/b21-basis-gate-desktop.test.ts`：A11 basis 测试补最小 roster/modules 夹具（B21 前置）；A11 派发使用派生模块写集，basis 门行为不变。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b2122-01-typecheck.txt`（`22d52cc9…`） |
| 受影响集（preconditions/runtime-core b2/b101/b111/b51/b3/b31/b21/b3b/b61/b71/b81/b82/verifier/convener/product/chief v2/run-role/B13.1/close-intent） | **221/222 pass**；唯一失败为 b31 路径 B merge 测试在批跑下超时（隔离复跑 **9/9 pass**，`b2122-04-b31-isolated.tap`），非 B21/B22 触达路径 | `_evidence/b2122-02-affected.tap`（`3f98d4c1…`）、`b2122-04-b31-isolated.tap`（`e01d96d9…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b2122-03-full-chain.tap`（`31f316d6…`） |

## 四、候选（编排）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/workflow-preconditions.ts` | M | 96,283 / 1,785 | `9df2d26ac598c1620d0b2f3b4cde784117ab6e659dc1382cebf5a576cfe9e157` | +32/−0 |
| `test/编排/workflow-preconditions.test.ts` | M | 67,035 / 1,355 | `caf7721dfa305a4dc404051d86ffe1fafe513965a401cc85c98d4130c8fb7450` | +24/−0 |

- 桌面会话/角色文本候选见 `角色卡/桌面窗口/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths.md` 与各角色记录；共同证据在 `角色卡/编排/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths_evidence/`。

## 五、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR17。
- B21 仅限 A11 实现派发；B3（路径 B scope 派生）与其它阶段未改。B22 回退只使用真实存在的质量文件字节，不伪造证据。
