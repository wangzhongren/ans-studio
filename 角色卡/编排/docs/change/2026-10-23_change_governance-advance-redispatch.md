# 变更记录：治理写卡推进的可重入门禁闭环——编排 `completeRoleCardsStep`

- 任务 ID：`2026-10-23-governance-advance-redispatch`
- 产品 flowId：`governance-advance-redispatch`
- 角色：编排（S3 契约先行）
- 日期：2026-10-23
- 状态：**implemented-unverified**（已实现、定向检查与 typecheck 通过；未经独立测试/e2e/T3 全量/独立验收，不代表通过）
- 依据（客户已确认）：
  - 意图/闸门 0/1/2/实施授权：`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`
  - 策划方案 v1：`docs/planning/2026-10-23_design_governance-advance-redispatch.md`（§3 A5、§4 契约、§6、§8.2、§10）
  - 验收标准 v1：`docs/acceptance/governance-advance-redispatch-criteria-v1.md`（P4 整行不得 N/A；P8 不注册为角色工具）
  - 团队计划：`docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md`（§4.1 编排写集、§5.1 S3）
  - 实施前基线：`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md`（3661/3633/10/18；`test/编排/flow-service.test.ts` 24/24）
- 写集（实际只改这三个文件）：
  - `src/common/编排/flow-service.ts`（新增 `completeRoleCardsStep` + 内部 helper）
  - `src/pipeline/orchestration/flow-state.ts`（只再导出函数与类型）
  - `test/编排/flow-service.test.ts`（新增 14 个正/负例；既有 24 例逐字保留）
  - 本变更记录与证据目录。**未写** `app/**`、`src/model/**`、`src/common/门禁引擎/**`、`src/common/shared/**`、`test/桌面应用/**`、`test/测试/**`、`run-role.ts`、角色卡/边界（除本角色文档）、package/tsconfig/vite。

## 一、用户可见入口与定位

- **入口（应用内部，不是角色工具）**：桌面窗口在结构校验通过后调用 `completeRoleCardsStep(input)`，把 flow 的 `id:"role-cards"` 步骤标为 `done` 并按步骤 `kind` 生成可核对证据。桌面只经 `src/pipeline/orchestration/flow-state.ts` 公共出口消费。
- **成功**：flow 的 `role-cards` 变为 `done`，证据指向应用私有验证记录（artifact kind）或账本 `dispatch.accepted`（dispatch kind）；`flow.role-cards.completed` 事件写入诊断；不弹客户卡、不写客户批准。
- **失败**：明确错误码（stale/缺步骤/终态/kind 不支持/证据不足/写盘失败等），不写 flow、不覆盖终态；stale 时连记录/账本也不写。桌面可据此下次重试。
- **语义边界**：本函数只记录**确定性的结构校验结果**；`semantic:"pending"`，不表示 readiness、验收或客户批准。语义 readiness 仍由 Convener 复核。

## 二、公共契约

### 2.1 输入（`CompleteRoleCardsStepInput`）

```ts
{
  projectRoot: string;
  flowId: string;
  roleIds: readonly string[];                       // 非空、去重、合法角色 id（允许中文）
  validatedFiles: readonly { path: string; sha256: string }[]; // 仅 角色卡/<roleId>/ 六文件
  fingerprint: string;                              // 64 位小写 hex（桌面计算）
  appointmentArtifactPath?: string;                 // 可选；只记录，不读取
}
```

- `roleIds`：非空；拒绝首尾空白、`.`/`..`、`/`/`\`/NUL；**按不区分大小写去重**（Windows 目录大小写不敏感）。
- `validatedFiles` 仅允许 `角色卡/<roleId>/` 下六文件：`role-card.md`、`boundary.yaml`、`feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md`；每个目标角色六件齐全、无重复、无他人角色/`..`/绝对路径/非六文件；`sha256` 为 64 位小写 hex。
- `fingerprint`：64 位小写 hex。函数不重算指纹（其口径含团队计划，属桌面），只用于记录路径与幂等；逐文件内容通过重读 sha256 独立核对。

### 2.2 结果（`CompleteRoleCardsStepResult extends FlowToolResult`）

稳定字段：`ok`、`idempotent?`、`revision?`、`flow?`、`code?`、`error?`、`issues?`，另加：

- `evidence?: { kind: "artifact" | "dispatch"; ref: string }`（成功时实际写入 flow 的证据）；
- `recordPath?: string`（artifact kind 的记录相对路径）。

错误码：

| 码 | 含义 | 写盘 |
| --- | --- | --- |
| `invalid-input` / `invalid-role-ids` / `invalid-validated-files` / `invalid-fingerprint` / `invalid-appointment-artifact-path` | 输入非法 | 零写入 |
| `role-cards-stale` | 校验后文件内容变化/缺失（重读 sha256 不一致） | flow/账本/记录零写入 |
| `role-cards-step-missing` | flow 无 `id:"role-cards"` 步骤 | 零写入 |
| `role-cards-step-terminal` | `superseded/failed/blocked/aborted`，不覆盖终态 | 零写入 |
| `role-cards-kind-unsupported` | 步骤 kind 不是 `artifact`/`dispatch` | 零写入 |
| `ledger-unavailable` | 账本不可读/坏行 | 不写 flow |
| `ledger-write-failed` | `artifact.observed` 追加失败 | 不写 flow |
| `insufficient-evidence` | dispatch kind 缺 `dispatch.accepted{flowId, stepId:"role-cards"}`（或候选证据对账失败） | 不写 flow |
| `write-failed` | 记录或 flow 原子写失败 | 原文件不被替换 |
| `missing-flow-id` / `not-found` / `read-failed` / `invalid-flow` | 沿用 flow-service 既有读取码 | — |

幂等/终态：`role-cards` 已 `done` ⇒ `{ok:true, idempotent:true, revision, flow}`（不写盘）；其余终态 ⇒ 明确拒绝。

### 2.3 验证记录 schema（artifact kind）

路径：`.ans/governance/role-cards/<flowId>/<fingerprint>.json`（应用机器状态，不是客户文档；`OBSERVE_SKIP_SEGMENTS` 不变，`observeFlowArtifacts` 不观察它）。

```json
{
  "schema": "role-cards-gate/v1",
  "flowId": "<flowId>",
  "at": "<ISO>",
  "roleIds": ["..."],
  "appointmentArtifactPath": "<path|null>",
  "teamPlan": null,
  "fingerprint": "<64hex>",
  "files": [{ "path": "角色卡/<roleId>/<file>", "sha256": "<64hex>" }],
  "result": "structure-pass",
  "semantic": "pending",
  "disclaimer": "结构校验通过，不代表 readiness/验收/客户批准；语义 readiness 仍由 Convener 复核。"
}
```

- `roleIds`/`files` 按字典序排序，保证同输入记录内容稳定。
- **`teamPlan` 固定 `null`**：本函数输入契约不携带团队计划（桌面指纹已把团队计划内容计入 `fingerprint`）；字段保留以满足 P4 的 schema 清单，`null` 表示「未单独提供」，不是「无团队计划」。
- 幂等：同 path + 同内容复用既有记录（不重写、sha 不变），不产生第二条 `artifact.observed`；记录损坏/内容不一致时才重写（新 sha 允许新观察条目）。
- 账本条目：`artifact.observed{actorRoleId:"app", power:"app", artifactPath:记录相对路径, artifactSha256:记录文件实际 sha256, flowId}`；同 path+sha 不重复追加。**不写 `customer.decision`、不写客户批准。**

### 2.4 dispatch kind

- 要求账本已有 `dispatch.accepted{flowId, stepId:"role-cards"}`（应用派 Crew 时写入）；用 `validateFlowEvidence` 对候选 flow 对账（只过滤本步骤 issue）。
- 证据 `{kind:"dispatch", ref:"role-cards"}`；不写 `.ans` 记录、不追加账本。

## 三、改动摘要（按文件）

### 1. `src/common/编排/flow-service.ts`

- 新增 `completeRoleCardsStep`（与 `completeAcceptanceStep` 同层）及内部 helper：输入校验、路径归一化、记录复用/原子写、`artifact.observed` 幂等追加、按 kind 生成证据、`writeFlowState` 写 flow。
- 共用 per-project 串行队列（`serialize`）、候选 YAML 复核、`atomicWrite`；写 flow 事件 `flow.role-cards.completed`，view actor `app/app`。
- **未改** `completeAcceptanceStep`、`observeFlowArtifacts`、`OBSERVE_SKIP_SEGMENTS`、既有枚举/schema。
- 未复制验收门禁：不要求/不写 `customer.decision`。`FlowStepKind` 的 `acceptance` 步骤必须使用保留 id（`flow-state` 既有规则），因此 `role-cards` 的 `acceptance` kind 会在读 flow 阶段返回 `invalid-flow`；应用可完成的 kind 仅 `artifact`/`dispatch`。

### 2. `src/pipeline/orchestration/flow-state.ts`

- 再导出 `completeRoleCardsStep` 及类型 `CompleteRoleCardsStepInput` / `CompleteRoleCardsStepResult` / `CompleteRoleCardsEvidence` / `CompleteRoleCardsValidatedFile`（桌面唯一公共出口；不复制逻辑、不做二次判定）。

### 3. `test/编排/flow-service.test.ts`

- 新增 14 个用例（详见 §四）；既有 24 例未改动、逐字通过。

## 四、测试与命令（原始日志见证据目录）

- 环境：Windows 11 Pro 10.0.26300 / Git Bash；Node v24.22.1 / npm 11.19.1；HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`。
- 定向：`node --test test/编排/flow-service.test.ts` ⇒ **38 tests / 38 pass / 0 fail / 0 skipped / 0 todo**，退出码 **0**（既有 24 + 新增 14）。
  - 新增覆盖：artifact done+记录+`artifact.observed(power=app)`+无客户决定（1）；重复调用幂等 + 同 path+sha 不重复观察 + 记录复用（1）；dispatch 有/缺 `dispatch.accepted`（2）；缺步骤/已 done/四终态/未知 kind（4）；stale 内容变化与删除（1）；越界 8 类（他人角色、`../`、Windows/POSIX 绝对路径、非六文件、缺件、重复、坏哈希）（1）；roleIds/fingerprint/appointmentArtifactPath 非法（1）；原子写失败不破坏原 flow + 重试不重复记录/账本（1）；并发一完成一幂等（1）；不注册为角色工具源码断言（1）。
- 目录级：`node --test "test/编排/**/*.test.ts"` ⇒ **810 tests / 809 pass / 1 fail / 0 skipped / 0 todo**，退出码 1；唯一失败为 `test/编排/shell-authorized-routine.test.ts:103` 的既有 Windows symlink `EPERM`（与基线 9 项 EPERM 同类），非本变更引入。
- 类型检查：`npm run typecheck` ⇒ 退出码 **0**，无 `error TS`。
- 计数来源与原始输出：`...-evidence/directed-flow-service.log`、`...-evidence/orchestration-directory.log`、`...-evidence/typecheck.log`。

## 五、证据（目录 `...-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `directed-flow-service.log` | 定向 38/38 原始输出（命令、起止、exit_code） |
| `orchestration-directory.log` | `test/编排/**` 810/809/1 原始输出（含既有 EPERM 原文） |
| `typecheck.log` | `npm run typecheck` 原始输出（exit 0） |
| `environment-and-candidate-hashes.txt` | 环境、HEAD、三个候选文件 `git hash-object`+`sha256sum`+大小、基线哈希、diff stat、暂存区为空 |
| `artifact-record-and-ledger-sample.txt` | 真实调用的 flow YAML、记录 JSON 原文、`artifact.observed` 账本条目原文、成功回执 |

## 六、已知边界与未做项

1. **桌面消费属 S4**：`app/desktop/interface.ts` 的版本化去重键、指纹、账本锚、刷新探针、readiness 文案与 `completeRoleCardsStepFn` 注入未在本阶段实施；本角色未改 `app/**`。
2. **e2e/T3 全量/真实 Electron/目标项目只读复算属 S5（测试角色）**：本记录不声称 T3 全量、e2e 或真实 Electron 通过；不写 `docs/acceptance/`、`docs/scheduling/`、`docs/communication/`、`docs/planning/`。
3. **独立验收未进行**：状态为 `implemented-unverified`，不是 `verified`，不代表验收通过。
4. **记录 `teamPlan: null`** 的原因见 §2.3；若后续验收要求记录携带团队计划对象，需在 S4/方案层面补充输入契约，不在本阶段自行扩参。
5. **`role-cards` 步骤终态不可回退**：done 后再改坏文件不会自动 reopen（方案 §10.6，本轮不新增 reopen 语义）。
6. **同指纹不同文件内容**（调用方指纹计算错误）不会被本函数发现为 stale；函数依赖桌面指纹口径。逐文件 sha256 重读防的是「校验后文件又变」，不是「指纹公式错误」。
7. **候选 YAML 复核**在每次写前执行（`parseFlowStateYaml(serializeFlow(candidate))`，`writeFlowState` 内再次复核）；候选由已解析 flow 序列化生成，正常路径无法从外部构造「候选失败」，故未单列候选失败注入用例；原子写失败已覆盖「不破坏原 flow」。
8. 未提交、未暂存、未推送、未合并、未发布；`git diff --cached` 为空。

## 七、候选哈希（工作区当前内容）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/编排/flow-service.ts` | `467d0925d4f5c687fb1f19787ef8d3dcfe9dd3a5` | `82049e2bf9570e23f3af43ee77654c3f5e8b9b23468518f1d0592cfd85ee514b` |
| `src/pipeline/orchestration/flow-state.ts` | `729597beba576f710a28c819386215145b793f6b` | `78172c7a760fc5f0df8319763032a0a80175daddf7a4102507feb2850ff08a9a` |
| `test/编排/flow-service.test.ts` | `0d28dad9cf2e2daebdb8b47fb44b32163a961e57` | `28d1b9b4cbe2899a0e69202983b92532d99d84af3473f72d918e1aa01f9af680` |

> 基线（实施前）：`flow-service.ts` `cdba5175…`/`68081449…`；`flow-state.ts` `2a32991c…`/`5d9c0bd3…`；`flow-service.test.ts` `9bdbe3de…`/`4df55487…`。哈希在文档写盘后复算；若上述文件随后变化，受影响证据失效。
