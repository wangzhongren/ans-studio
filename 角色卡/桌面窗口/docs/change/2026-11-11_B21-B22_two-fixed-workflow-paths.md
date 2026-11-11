# 桌面窗口 B21/B22 记录：A11 模块写集派生 + A12 证据回退（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「桌面窗口」（独立固定上下文；B21/B22 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B21/B22**（RR16 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`364ca98`（RR16 记录提交）

## 一、依据

- RR16：A11 env-bootstrap 任务 `moduleId=env-resources` + `modulePaths=["README.md","index.html"]`（跨 entry-index）⇒ worker 写门禁 allowed project:(无)；A12a criteria 报告 evidence 无纯路径 ⇒ close-report-missing；chief 13>12。
- 协调方 B21：moduleId 权威，应用派生模块 paths；模型 modulePaths 仅断言，不匹配派发时 fail-closed。B22：verifier 纯路径 evidence + 应用按 expectedOutput/质量路径回退。

## 二、实施内容（`app/desktop/session.ts`，M）

1. **B21 派发接线**：`routeFixedPathDispatch` 在 `!isStageRequest && convener && stage=A11 && moduleId` 时加载最新 roster，调用 `deriveFixedModuleWriteSet`；失败 `module-paths-mismatch` 拒绝；成功以派生模块 paths 写 `task.created.modulePaths`（模型提供值仅断言）。
2. **B22 收口证据回退**：`findFixedReviewArtifact` 按 `docs/quality/<flowId>-{criteria|report}-vN.md` 最新文件实际字节计算 SHA-256；`buildFixedCloseEvidence` 在 A12a/A12b 报告 evidence 无可用纯路径时回退使用该 artifact；A12b 归档的 report/criteria 路径同样回退；文件缺失仍 `close-report-missing`。
3. 测试：
   - `test/桌面应用/b101-fixed-dispatch-task-binding.test.ts`（M）：B22 A12a 无纯路径 evidence ⇒ 无文件 `close-report-missing`；有文件 ⇒ accepted + `stage.completed A12a`（artifact=应用质量路径）。
   - `test/桌面应用/b21-basis-gate-desktop.test.ts`（M）：A11 basis 用例补最小 roster/modules 夹具（B21 前置），basis 一致/漂移/缺失语义不变。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `角色卡/编排/docs/change/2026-11-11_B21-B22_two-fixed-workflow-paths_evidence/b2122-01-typecheck.txt`（`22d52cc9…`） |
| 受影响集 | **221/222 pass**；唯一失败 b31 路径 B merge 批跑超时，隔离 **9/9 pass**（非本批触达路径） | 同目录 `b2122-02-affected.tap`（`3f98d4c1…`）、`b2122-04-b31-isolated.tap`（`e01d96d9…`） |
| 确定性全链 | **3/3 pass** | 同目录 `b2122-03-full-chain.tap`（`31f316d6…`） |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | M | 867,592 / 13,471 | `7f02066c4fb274f805569412d7fc970d53f274f93a4c340bcc1e336ac13e52af` | +50/−4 |
| `test/桌面应用/b101-fixed-dispatch-task-binding.test.ts` | M | 48,113 / 853 | `3a22ad117ec8d8ce26f5c09da973e75e0fd32d62d66bf089ae40fb38915512bb` | +63/−2 |
| `test/桌面应用/b21-basis-gate-desktop.test.ts` | M | 39,511 / 708 | `a6e0e3f69eec42cac0eabd0029b780dba008356826f10608c92a8f02f66c0a25` | +33/−0 |

- 本批只改 fixed 派发 A11 模块写集与 A12a/A12b 证据回退；B3/其它阶段/legacy 未改；写集外改动=0。

## 五、限制与披露

- 未运行真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR17。
- b31 路径 B merge 测试在批跑下超时、隔离 9/9：环境时序抖动，非 B21/B22 触达路径（已披露）。
- B22 回退仅在报告 evidence 无纯路径时使用真实存在的质量文件字节；不伪造文件/hash。
