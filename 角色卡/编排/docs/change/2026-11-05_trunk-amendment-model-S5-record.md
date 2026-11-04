# 编排 S5 实现记录：能力注入 + trunk 客户动作 API（Batch 3.5）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 3.5 **S5（能力注入 + trunk 客户动作 API）**。
- **日期 / 状态**：2026-11-05；**S5 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **批准记录**：`docs/communication/2026-11-05_gate_closure_batch-3.5.md`（12 行 / `43220baf…`）：C1d 三工具 + S5 能力注入/trunk API + D1b 桌面接线 + 测试角色 D-04 词面裁定；不新增闸门/边界/B-x。
- **C1d 冻结契约（只消费）**：`GovernedToolsOptions.submitVersionChange/submitRefactor/requestStableWrite`（`src/model/runtime.ts`）；工具 `submit_version_change` / `submit_refactor` / `request_stable_write`（`src/provider/runtime/{schema,tools}.ts`）：注入才注册、按 `scope.roleId` 门控、只提交不批准、回执 `{ok, applicationId|requestId, status, errorCode?}`（错误码对齐 C2c）。
- **前置节点**：S1/S2/S3/S4 记录见同目录；C1/C2b/C2c/S1–S4 冻结契约未改。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、结论

- **run-role 三能力注入（S5 核心）**：`openRoleSession` 新增可选 `submitVersionChange`/`submitRefactor`/`requestStableWrite`，按**会话解析出的角色 id**（模型不可自报）门控后经 `AdapterCapabilities` 转交适配器（C1d「注入才注册」）：
  - `product` / `rapporteur` → 仅 `submitVersionChange`（工具内再按 kind 限定唯一发起角色：upgrade=product、detail=rapporteur）；
  - `convener` → `submitRefactor` + `requestStableWrite`；
  - 其他内置治理角色、项目角色、客户/幕僚 → 一律不注入（工具不存在，结构性 fail-closed）。
  - `createRuntimeAdapterFactory` 同步把三个能力位从 `capabilities` 映射进运行时选项（形状单一来源 = C1d Model）；未注入 ⇒ 字段缺席。run-role **不包装/不调用/不批准/不发许可/不写账本**——工具层的「恰好一次调用 + 结构化回执透传」由 C1d 实现与测试保证。
- **trunk 客户动作 API（S5）**：`src/service/trunk/` 新增
  - `refreeze(input)`：完成升级/重新冻结——只更新 **stable 快照**（workflow/roleCards/boundaries），客户 decisionId + 高危二次确认，内容以磁盘字节复核；**不升 trunkVersion**；复算 digest；返回 `trunk.state(op:"refrozen")` 审计载荷（不写账本）。
  - `abandonUpgrade(input)`：放弃升级——关闭解冻窗口、**不 re-pin、不改指针**；返回 `trunk.state(op:"refrozen-cancelled")` 载荷，旧主干继续有效。
  - `history()`：trunk 历史版本列表（只读 `.ans/trunk/history/` 归档 + 当前 manifest；不虚构内容）。
  - 失败路径：缺客户确认/高危确认 ⇒ `trunk-high-risk-unacknowledged`；版本化文档/execution 变更或哈希不符 ⇒ `trunk-apply-failed` 且指针不变；manifest 损坏 ⇒ `trunk-manifest-corrupt`。
- **project-state 文案迁移**：`:719` 多 pinned 提示由「先走 run-change/人工核对」改为「先走『版本变更申请』/『主干升级』或人工核对」；blocker id/kind/source/语义不变。
- **测试/类型检查**：S5 专项 **8 / 8 pass**；`test/编排` 全量 **897 / 896 pass / 1 fail（既有 Windows symlink EPERM）**；`npm run typecheck` **exit 0**。未改断言、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/pipeline/orchestration/run-role.ts` | 修改（S5：三能力角色门控注入 + 适配器映射） | 2618 | `a43dd7f3e835c03bacaeeb02d02adcac437c0629bb25a59848e603ec3e5087a6` |
| 2 | `src/service/trunk/abstract/trunk-service.ts` | 修改（S5：refreeze/abandon/history 类型与接口） | 360 | `4e12168319d369efc697c2f2ad227305b74d6d60ea2484de5927a4bf44441bad` |
| 3 | `src/service/trunk/impl/refreeze.ts` | 新增（S5：三 API 实现） | 194 | `1d78942e9a3d5eb4b705c16e0b5da7cae93c3e275830b8d4d9b6c8aaeab686d0` |
| 4 | `src/service/trunk/public/trunk-service.ts` | 修改（S5：组合 + 类型导出） | 271 | `0b335f43d6f396ef2223c00c45edb437ad9f0417b3a4ac4f371a8e6cbd52c457` |
| 5 | `src/common/编排/project-state.ts` | 修改（S5：文案收口） | 1156 | `39416ea351f4fcd09ecff5b947bde47de829d297fa475aecda2bdacf9c558e59` |
| 6 | `test/编排/trunk-service-refreeze.test.ts` | 新增 | 252 | `ba062667ac0140ab292758665a00e1aa12c1fbacdff859bf22bafc7615c7127a` |
| 7 | `test/编排/run-role-submit-capabilities.test.ts` | 新增 | 205 | `043f84286730e605a1ab3964c4c6d15d376440209b0b7dda3a5b61f5c7aeee23` |
| 8 | `角色卡/编排/docs/change/2026-11-05_trunk-amendment-model-S5-record.md` | 新增（本记录） | — | — |

**明确未改**：`src/model/**`（C1/C1d）、`src/provider/runtime/**`（C1d）、`src/common/门禁引擎/**`（C2b）、`src/service/version-change/**` 冻结契约（仅调用其公共 API）、`app/**`、桌面测试、其它角色测试/文档。

## 三、能力注入矩阵与回执契约

| 会话角色 | submitVersionChange | submitRefactor | requestStableWrite |
| --- | --- | --- | --- |
| product | ✅（工具内仅 version-upgrade） | — | — |
| rapporteur | ✅（工具内仅 detail-amendment） | — | — |
| convener | — | ✅ | ✅（仅 `docs/workflow.md`） |
| chief / nominator / verifier / 项目角色 | — | — | — |

- **注入语义**：`openRoleSession` 只转交**注入的同一函数引用**（不包装）；未注入或角色不匹配 ⇒ 属性缺席 ⇒ C1d 工具不注册（fail-closed）。模型自报角色不参与门控（工具从 `scope.roleId` 取会话角色）。
- **回执（C1d 工具层）**：成功仅接受 `submitted`（VCA）/`requested`（refactor/stable）；失败透传 C2c 错误码（`vca-*`/`refactor-*`/`stable-write-*`）；工具恰好调用一次、不重试、不伪造成功。**请求 ≠ 批准**：VCA 批准仍走客户卡（S4 `version-change-runtime`）；stable 写入仍需客户确认卡生成一次性许可（S4 `stable-write-runtime`）；run-role 不签发许可。
- **D1b 需注入的实现**（由桌面窗口构建，调用 S4/S2）：
  - `submitVersionChange(input)` → `versionChangeRuntime.submit({...input, baseTrunk: await trunk.current(), bootstrap, at: now})`，返回 `{ok, applicationId, status, errorCode?, message?}`；
  - `submitRefactor(input)` → `refactorRuntime.submit({...input, requestId: allocate(), at: now})`；
  - `requestStableWrite(input)` → `stableWriteRuntime.requestWorkflowWrite({roleId, content, diffPreview, requestId, at})`（客户确认卡由 presenter 呈现；工具回执 `requested`，许可在确认后签发）。

## 四、trunk 客户动作 API 形状（`src/service/trunk/`）

```ts
interface TrunkService {
  refreeze(input: {
    decisionId: string; reason: string;
    highRisk: { acknowledged: true; items?: string[] };
    target: { workflow?: {path;sha256}; roleCards?: Record<roleId,{path;sha256}>; boundaries?: Record<roleId,{path;sha256}> };
    at: string;
  }): Promise<TrunkServiceResult<{ manifest: TrunkManifest; audit: TrunkStateAuditPayload; changed: string[] }>>;
  abandonUpgrade(input: { decisionId: string; reason: string; at: string }):
    Promise<TrunkServiceResult<{ manifest?: TrunkManifest; audit: TrunkStateAuditPayload }>>;
  history(): Promise<TrunkServiceResult<{ versions: number[]; currentTrunkVersion?: number }>>;
}
```

- `refreeze`：只接受 stable 目标；每个目标 sha256 必须等于磁盘字节（内容匹配为主）；不升 `trunkVersion`、更新 `updatedAt`、复算 digest；audit `op:"refrozen"`、origin/decidedBy customer、decisionId/reason。**版本化文档/execution 不在目标面**（传了也只会因“无 stable 变更”被拒；变更须走 VCA）。
- `abandonUpgrade`：只读当前 manifest + 返回审计载荷（`op:"refrozen-cancelled"`）；不写盘、不改指针；无 manifest ⇒ `trunk-unavailable`。
- `history`：`store.listHistory()`（S1 Provider 归档列表）+ 当前版本；不读/不伪造归档内容；IO 失败 ⇒ `trunk-unavailable`。
- 审计载荷由 D1b/上层经 `appendTaskEvent` 写账本（`trunk.state`，C2a 校验：refrozen/refrozen-cancelled ⇒ customer + decisionId）。

## 五、测试与类型检查原始结果

1. **S5 专项**：`node --test test/编排/trunk-service-refreeze.test.ts test/编排/run-role-submit-capabilities.test.ts` → **tests 8 / pass 8 / fail 0 / skipped 0**。
   - run-role：矩阵（product/rapporteur → 仅 VCA；convener → refactor+stable；chief/nominator → 无）、项目角色误给也不注入、未注入字段缺席、同引用、回执形状（submitted/requested）。
   - trunk-service：refreeze 仅 stable（workflow/roleCards/boundaries 三快照 + changed + audit + 不升版本 + verify 一致）、拒绝版本化文档/哈希不符/缺客户确认且指针不变、abandon 不改指针 + audit、history 归档版本（升级后 [1] + current 2）。
2. **`test/编排` 全量**：**897 / 896 pass / 1 fail / 0 skipped**；唯一失败为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts`）。S4 基线 889/888/1，+8 S5 测试 = 897/896/1。
3. **`test/桌面应用`**：589 tests / 588 pass / 1 fail。失败为 `run-change-entry.test.ts`「跨层源码钉…」断言旧「契约变更 · 重开 run」按钮仍存在——**并行 U1/D1b 按 P1.6 §4.10 移除旧按钮的进行中状态**（S5 未改 `app/**`/渲染层；桌面测试数从 562 增至 589 亦为并行节点新增）。非 S5 引入，交 D1b/U1 与测试维护者收口。
4. **`test/测试`**：S3/S4 已分类的两处跨节点失败（Windows symlink EPERM；D-04 词面冲突）不在本节点写集，仍待测试角色裁定（批准记录已指派）。
5. **`npm run typecheck`**：`tsc --noEmit` **exit 0**。未改断言、未新增 skip。

## 六、D1b 接线清单（后续节点）

1. `session.ts` 构造三个能力实现（调用 S4 `version-change-runtime`/`refactor-runtime`/`stable-write-runtime`），传入 `openRoleSession` 顶层三字段；仅对对应角色会话调用链传参（run-role 仍二次门控）。
2. `trunk:refreeze-request`/`trunk:abandon-upgrade` IPC → `trunkRuntime`/trunk service 的 `refreeze`/`abandonUpgrade`；返回 audit 由应用侧 `appendTaskEvent` 写 `trunk.state(refrozen|refrozen-cancelled)`（客户 decisionId；高危二次确认 UI 只在 D1）。
3. `trunk:list`/面板历史：`history()` 只读展示（versions + 当前版本）；不读/不虚构归档内容。
4. 客户卡/许可：VCA 批准与 stable workflow 许可仍走 S4 presenter（D1 卡通道）；`submit_*`/`request_stable_write` 工具只提交，不批准。
5. 启动/会话：沿用 S2/S3 的迁移/冻结快照/许可快照接线（S3/S4 记录 §五）。

## 七、遗留与披露

1. **能力实现归属**：run-role 只做门控注入；D1b 负责把 S4/S2 实现接到三能力（§六-1）。C1d 工具层保证「恰好一次/回执透传/不批准」。
2. **`test/桌面应用` 旧按钮断言**：并行 U1/D1b 正在移除旧入口（P1.6 §4.10）；非 S5 范围，需 D1b/U1 更新对应测试。
3. **D-04 词面冲突**：测试角色按批准记录裁定（allowlist 或修正测试，不得一刀切放宽），非本节点。
4. **refreeze 范围**：不升 trunkVersion、只 stable 快照；版本化文档/execution 变更必须走 VCA（本节点拒绝）。
5. **history**：仅版本号 + 当前版本；归档 manifest 内容读取如未来需要，应扩展 S1 Provider 读 API（跨节点）。

## 八、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅改/新增 §二列出的文件；未改 `src/model/**`、`src/provider/runtime/**`、`src/common/门禁引擎/**`、`src/service/version-change/**` 冻结契约、`app/**`、桌面测试、其它角色测试/文档、角色卡/边界/communication/acceptance/scheduling。
- 未运行应用；**未 commit / push / merge / release**。
- 若后续需要改 C1d/冻结契约或新增 B-x，按停止项回报，不自行扩写集。
