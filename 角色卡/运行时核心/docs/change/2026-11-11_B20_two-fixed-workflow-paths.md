# 运行时核心 B20 记录：fixed activate 的 MCP inputSchema 允许 path-only（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「运行时核心」（独立固定上下文；B20 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B20**（RR15 失败修复，补齐 B17）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`4d50756`（RR15 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未提交/未推送/未合并/未发布**；未运行真实模型/Electron。

## 一、依据

| 依据 | 路径 | 与 B20 的关系 |
| --- | --- | --- |
| RR15 真机记录 | `角色卡/测试/docs/change/2026-11-11_RR15_two-fixed-workflow-paths.md`（`3ea4a113…`） | A8 nominator 按 B17 指引只传 path 调 `activate_role_documents`，被 **MCP 输入校验**拒绝：`roster/documents … sha256 expected string` |
| B17 记录 | `角色卡/运行时核心/docs/change/2026-11-11_B17_two-fixed-workflow-paths.md` | 放宽了 handler 校验（`modeShapeSchema`）与 `FixedActivateRoleDocumentsInput` 类型，但未改 `buildGovernedTools` 暴露的 `inputSchema` |
| 协调方 B20 授权 | 本轮指令 | fixed activate 注入时 MCP 可见 inputSchema 用固定模式 schema；legacy 仍共享 schema |

## 二、实施内容

### 2.1 `src/provider/runtime/tools.ts`（M）

- `buildGovernedTools` 的工具定义组装：当 `options.activateRoleDocumentsFixed !== undefined` 且工具为 `activate_role_documents` 时，`inputSchema = modeShapeSchema(name, true)`（path-only：`roster`/`documents.{card,boundaryMd,boundaryYaml}` 的 `sha256` 不 required；`path` 仍 required/受 pattern 校验）。
- legacy 注入（`activateRoleDocuments`）仍用 `describeTool(name).parameters`（嵌套 sha256 required 逐字保留）。
- handler 的 `modeShapeSchema` 校验与 B17 一致；服务层 `activateRoleDocumentsFixed` 的服务端复核、`fillFixedActivationHashes`、生产任务证据门均未改。

### 2.2 测试（`test/runtime-core/two-fixed-workflow-paths-b2.test.ts`，M）

- 新增 B20 test：`buildGovernedTools` 的 fixed activate `inputSchema` 中 roster/documents 的 `sha256` **不在 required**；legacy activate 的 documents `sha256` **仍在 required**。
- 既有 B17 handler path-only/回执测试保留。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b20-01-typecheck.txt`（`22d52cc9…`） |
| 受影响集（runtime-core b2 + 桌面 fixed 11 文件，含 b111/b101/b51/b3/b31/b21/b61/b71/b81/b82） | **106/106 pass** | `_evidence/b20-02-affected.tap`（`56f6829f…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b20-03-full-chain.tap`（`f8c7f05c…`） |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/provider/runtime/tools.ts` | M | 347,020 / 5,633 | `ac881a944e3ad89bc6c4d9b767ca26feb4e2b709cde8cb199a81f0abfe20442d` | +7/−1 |
| `test/runtime-core/two-fixed-workflow-paths-b2.test.ts` | M | 26,915 / 438 | `8fdf2394cee5ef9f8e3b347a9a82d51c136b1da6ae3bce34345553008354d33b` | +30/−0 |

- 基线/改动状态：`_evidence/b20-00-baseline-head.txt`（`4d50756`）、`b20-00-change-status.txt`。

## 五、限制与披露

- 本批只补齐 **MCP 可见 inputSchema** 的 fixed/legacy 差异；handler/服务层/生产任务证据门未改；**未运行**真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR16。
- legacy 注入面的 schema 逐字保留（nested sha256 required）；fixed 分支仅在该会话注入 fixed activate 时生效。
