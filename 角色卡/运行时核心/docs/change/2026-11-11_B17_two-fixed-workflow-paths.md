# 运行时核心 B17 记录：fixed activate path-only 与回执解耦（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「运行时核心」（独立固定上下文；B17 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B17**（RR12 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`d35e2de`（RR12 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未提交/未推送/未合并/未发布**；未运行真实模型/Electron。

## 一、依据

| 依据 | 路径 | 与 B17 的关系 |
| --- | --- | --- |
| RR12 真机记录 | `角色卡/测试/docs/change/2026-11-11_RR12_two-fixed-workflow-paths.md`（`c026e1d2…`） | A8 激活需 64-hex sha256；模型拿不到应用侧 hash，`activation-roster-mismatch`/bounded 停止 |
| 协调方 B17 授权 | 本轮指令 | fixed schema 允许 path-only；应用回填 hash；legacy 仍要求 sha256 |
| B2 契约测试 | `test/runtime-core/two-fixed-workflow-paths-b2.test.ts` | fixed activate schema/handler/回执 |

## 二、实现内容

### 2.1 `src/model/runtime.ts`（M）

- `FixedActivateRoleDocumentsInput.roster.documents.*.sha256` 改为**可选**（fixed 模式 path-only；应用在激活前回填）。legacy `ActivateRoleDocumentsInput` 未改。

### 2.2 `src/provider/runtime/tools.ts`（M）

- `modeShapeSchema`：fixed 模式 `activate_role_documents` 的 `roster` 与 `documents.{card,boundaryMd,boundaryYaml}` 从 `required` 中移除 `sha256`（path-only 放行）；legacy 共享 schema 原样仍要求 sha256。
- `fixedActivateReceiptResult`：**不再**把回执 `rosterSha256` 与模型入参 sha256 比较（B17：应用计算值；只校验 64-hex 形状 + workflow/role/activationKey 等）；业务失败/形状失败语义保留。
- `fixedActivateInput` 原样透传（handler/run-role 负责回填）。

## 三、测试（`test/runtime-core/two-fixed-workflow-paths-b2.test.ts`，M）

- 更新回执测试：`rosterSha256` 与模型入参不同（应用计算）⇒ **接受**；其余 workflow/role/形状不匹配仍结果未知。
- 新增 B17 test：fixed path-only 输入放行并原样调用 fixed 回调；legacy path-only ⇒ `invalid-arguments args.documents.card.sha256: required`（逐字保留）。

## 四、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `test/runtime-core/two-fixed-workflow-paths-b2.test.ts` | 含在受影响集 **109/109 pass** | `角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-02-affected.tap`（`be8bbf40…`） |
| `npm run typecheck` | exit 0 | 同目录 `b17-01-typecheck.txt`（`22d52cc9…`） |
| 确定性全链 | 3/3 pass | 同目录 `b17-03-full-chain.tap`（`2379dcd1…`） |

## 五、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/model/runtime.ts` | M | 248,960 / 4,922 | `e0f47afb75000c0f702805839bf7ea1ba818532bf0c0d95a828d9aad5585dcc8` | +5/−4 |
| `src/provider/runtime/tools.ts` | M | 346,490 / 5,627 | `438a4b42eee3593f7520d2dfd116921ac37d2595285969d10e2cea44842df402` | +25/−3 |
| `test/runtime-core/two-fixed-workflow-paths-b2.test.ts` | M | 25,301 / 408 | `c480aca5f71ad6737ce091ce34c93c39bf96a849684bb293730ad36946da8b5f` | +37/−2 |

- legacy schema/handler/回执未因 fixed 放宽（共享 schema 的 legacy required 与 legacy 校验逐字保留）；写集外改动=0。

## 六、限制与披露

- 本批只改 fixed 工具 schema/回执与类型；**未运行**真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR13。
- 模型若仍传 sha256：fixed 分支不采信，由应用回填；legacy 分支仍按原样要求/校验。
