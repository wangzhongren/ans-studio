# W：B17 fixed A8 激活 hash 应用回填（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B17——RR12 失败修复（A8 激活 hash 缺口）。
- 依据：RR12 记录 `角色卡/测试/docs/change/2026-11-11_RR12_two-fixed-workflow-paths.md`（`c026e1d2…`）；实现级方案 v1.3 §4.2 A8；协调方 B17 授权。
- 基线：HEAD `d35e2de`（RR12 记录提交）；工作树仅有本批改动。

## 一、RR12 失败事实

- nominator 已按 roster 写出两套角色三文件（6 文件；B16 写权生效），但 `activate_role_documents` v2 需要 roster/三文档的 64-hex sha256；模型无法取得/计算应用侧 hash（任务文本也禁止猜 hash/用 shell）。
- 第 1 次尝试 `activation-roster-mismatch`；第 2/3 次因投递「必读」块没有 roster 应用计算 sha256 而按 fail-closed 停止；0/2 `role.activated`；A9+ 未到达。

## 二、实现

### 2.1 `workflow-service.ts`（M）

- `FixedActivateRoleDocumentsToolInput` 改为模型类型 `FixedActivateRoleDocumentsInput`（roster/documents 的 sha256 可省略）。
- 新增导出 `fillFixedActivationHashes({projectRoot, input})`：读取 roster 与三文档真实字节（`readAndHash`），返回**应用计算**的完整 `{path,sha256}` 入参（覆盖模型自报；文件不可读 ⇒ `activation-document-invalid` fail-closed）。
- 服务 `activateRoleDocumentsFixed` 仍接收完整 path+sha256，继续复核 roster 与 A6 `documentRefs` 一致性与三文档字节（幂等/`role.activated`/A8 完成不变）。

### 2.2 `run-role.ts`（M）

- fixed `activate_role_documents` handler：在调用注入实现/默认服务前执行 `fillFixedActivationHashes`；失败直接返回稳定失败码；成功用回填后的输入调用。模型只传 path，应用计算 hash。

### 2.3 测试（M/新）

- 新 `test/编排/workflow-fixed-b17.test.ts`（2 tests）：path-only ⇒ 四份 hash=真实字节；模型伪造 hash 被覆盖；roster/文档缺失 ⇒ `activation-document-invalid`。
- `test/编排/run-role-fixed-b2.test.ts`：fixed activate 集成改为 path-only + 真实文件，断言应用回填的 roster hash 与文件字节一致。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b17-01-typecheck.txt`（`22d52cc9…`） |
| 受影响集（B17 + runtime-core b2 + run-role fixed + B13/B15 + nominator/chief + 桌面卡门） | **109/109 pass** | `_evidence/b17-02-affected.tap`（`be8bbf40…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b17-03-full-chain.tap`（`2379dcd1…`） |
| 桌面 fixed 定向 10 文件 | **81/81 pass** | `_evidence/b17-04-desktop-fixed.tap`（`f197b3d9…`） |
| 全量 `test/编排/*.test.ts` | 1364 tests / **1338 pass / 24 fail / 2 skip**；24 条 known-red 与 B10.2 **逐名一致**（diff 空） | `_evidence/b17-05-orchestration-suite.tap`（`0d1e1cc7…`）、`b17-05-suite-exit.txt`、`b17-05-known-red-failnames.txt`、`b17-05-known-red-diff.txt` |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/workflow-service.ts` | M | 206,870 / 4,430 | `df8490f29c8a44600b5ad8eb41b04a7447130aac566c559dfd3beae10af43307` | +46/−2 |
| `src/pipeline/orchestration/run-role.ts` | M | 304,893 / 4,706 | `2358dafadccb31c25425411ab38237ba121467fb677b1d95984a1f28ac26dfbd` | +13/−8 |
| `test/编排/workflow-fixed-b17.test.ts` | 新 | 5,264 / 114 | `1ada826c508c0871bc00a4a0dca42abe541dd91f35f8898b85e0b8f3881e1d4e` | 新 |
| `test/编排/run-role-fixed-b2.test.ts` | M | 23,670 / 464 | `8e99eebc004068796f9c42be6fee64be980b19164286c70159074c2f3b970225` | +22/−4 |

- 基线/改动状态：`_evidence/b17-00-baseline-head.txt`（`d35e2de`）、`b17-00-change-status.txt`。

## 五、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR13。
- roster 与 A6 `documentRefs` 的 hash 一致性仍由服务复核（应用回填不绕过 drift 检测）；三文档 hash 记录的是应用计算值。
