# 桌面窗口 D2 实现记录：E2 返工（AC-13 stable boundary 扩大检测 + AC-17 VCA 在途抑制）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；桌面窗口（独立固定上下文）；E2 返工 **D2**。
- **日期 / 状态**：2026-11-05；**D2 完成（派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **依据**：E2 报告 `docs/acceptance/trunk-amendment-model-report-v1.md`（151 行 / SHA-256 `c6a05025…`）§三-2/3、AC-13/AC-17。
- **S7 公共 API（只消费）**：`TrunkService.detectStableBoundaryExpansion({projectRoot, roleId, fromPath, toYamlText})` → `{expanded, expansions[]}`（`角色卡/编排/docs/change/2026-11-05_trunk-amendment-model-S7-e2-fixes.md` §二/五）。只读；预览不可解析 ⇒ fail-closed `to-yaml-invalid:`；无可比较基线 ⇒ 全部新条目视为扩大。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。
- **写集**：`app/desktop/version-change.ts`、`app/desktop/session.ts`；`test/桌面应用/version-change.test.ts`、`test/桌面应用/run-change-trigger.test.ts`；本记录。**未改 `src/**`、`app/renderer/**`、其它角色测试、角色卡/边界。**

## 一、结论

- **AC-13 已实现（stable boundary 确认预览扩大检测）**：
  - `session.ts` 在 appointment-write 卡**呈现前**（`openRoleSession.customerInput` 包装内）对 `角色卡/<roleId>/boundary.yaml` 的 preview body 调用 S7 `detectStableBoundaryExpansion`；
  - `expanded:true` ⇒ 卡面 preview 前置风险横幅（`ui.stableWrite.kind.boundary` + `main.interface.boundaryDirWiderWord` + 逐条扩大数据）并注入 `acknowledgments`（每个扩大项一条 `{id:"boundary-expansion-<n>", label, required:true}`）；客户必须逐项勾选（`respondUnsafe` 的 required 集合校验）才能确认；
  - **未勾选不得签发许可**：`afterAppointmentWriteApproved` 在签发前复核 required ack 集合；缺失 ⇒ 不调用 B-11、不签发任何许可（fail-closed 最后防线）；
  - **不可解析 ⇒ 拒绝并显示原因**：不呈现卡片、`{outcome:"declined", notPresented:true, reason}`（`main.interface.boundaryParseFailed`），不发许可；
  - 收窄/无变化 ⇒ 不注入 ack/横幅（不误报）；role-card/boundary 仍走 appointment-write（语义不变）；workflow stable 不走此分支。
- **AC-17 已实现（VCA 在途抑制自动 run-change）**：
  - `offerRunChangeOnFrozenContract` 在自动 offer 前经 `pendingVersionChangesFor` 查询当前项目 VCA；存在 `submitted`/`approved`（未 settle）⇒ **不弹 run-change 卡**、不占用 `runChangeAutoPrompted` 名额，发系统行「版本变更申请 · <applicationId> (<状态>) — 提交说明」；
  - 查询失败 ⇒ fail-closed 抑制并披露读取失败；VCA 结束（列表无在途）后下一次冻结冲突自动 offer 恢复（无死锁/无重复弹卡）；
  - **显式低层入口 `requestRunChangeDecision` 不受影响**（测试验证在途 VCA 时仍可显式呈现卡）。
- **测试 / 类型检查**：D2 专项 **39 / 39 pass**；`test/桌面应用` 全量 **599 / 599 pass / 0 fail / 0 skip**（D1b 基线 593 + 6 D2 tests）；cross-node 源码钉 + i18n **26 / 26 pass**；`npm run typecheck` **exit 0**。未改断言保绿、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | SHA-256 | git hash-object |
| --- | --- | --- | --- | --- |
| 1 | `app/desktop/version-change.ts` | 改（AC-13 风险横幅/ack 组装 + S7 栈入口） | `f766d5416037903685b8b866b67ff179a9feffe5e61f888df65b1eed4108d2a2` | `11f9c264014ba9c4c4d8c17b7300660e2b2e5fdf` |
| 2 | `app/desktop/session.ts` | 改（AC-13 预览扩大/许可防线；AC-17 在途抑制） | `7e25c3d559de612fa2bdc0b9eb5649982252f04487b53d8d1743729257f8a594` | `f8882b4f7189d14ea8495db05be2341159d215b2` |
| 3 | `test/桌面应用/version-change.test.ts` | 改（+5 AC-13 tests） | `2ab37c07224e5ce302d37d552fd9f98718ab096416774e2f1d16a5b36b66743d` | `a4a3e3826b128261633e3263a210a6adcf5fd91b` |
| 4 | `test/桌面应用/run-change-trigger.test.ts` | 改（+1 AC-17 test；harness 注入 VCA 栈/事件收集） | `e3b2aab3146f6d4e4cec4530e5c6d80a1d2dab116b154dbddd2375395831bcee` | `732f2c00b60a92590d30008e50628f9aa4e75cfe` |
| 5 | `角色卡/桌面窗口/docs/change/2026-11-05_trunk-amendment-model-D2-e2-fixes.md` | 新增（本记录） | — | — |

**明确未改**：`src/**`（S7 API 只消费）、`app/renderer/**`（U1）、package.json/构建配置、角色卡/边界/`docs/scheduling|acceptance|communication|planning`、其它角色测试。`interface.ts`/`main.ts`/`preload.cjs` 本节点无需改动（无新 IPC/通道）。

## 三、AC-13 修复点（stable boundary 扩大检测）

1. **检测时点/位置**：`session.ts::open()` 的 `customerInput` 包装；仅 `request.cardKind === "appointment-write"` 且 `paths` 含 `角色卡/<roleId>/boundary.yaml` 时触发；`declaredPathBodies` 提取 preview 中该路径的最终 YAML body（与呈现前完整性闸同一口径），调用 `stack.detectStableBoundaryExpansion({roleId, fromPath: "角色卡/<roleId>/boundary.yaml", toYamlText: body})`。只读、不写盘、不改 appointment-write 审批链/D3 校验/写权。
2. **扩大**：`buildStableBoundaryRisk` 生成横幅与 `acknowledgments`（逐项 required）；请求对象克隆后 `preview = 横幅 + 原 preview`、`acknowledgments = merge(原 ack, 风险 ack)`。客户确认卡上必须逐项勾选（`respondUnsafe` 对 required 集合做去重后**恰等**校验）；`acknowledgments` 结算回传 `CustomerInputOutcome.acknowledged`。
3. **未勾选防线**：`afterAppointmentWriteApproved` 在签发任何许可前检查 `request.acknowledgments` 中 `boundary-expansion-*` required 项是否全部出现在 `outcome.acknowledged`；缺失 ⇒ 系统行 + **直接返回**（不调用 B-11，不签发 role-card/boundary 许可）。真实写入仍由角色 `write_file`/`edit_file` 经 run-role gate（无许可即拒绝）；`completeWrite` 仅在许可存在时由 after-write 钩子调用。
4. **不可解析**：S7 返回 `expanded:true` + `to-yaml-invalid:<原因>` ⇒ `enrichAppointmentWriteBoundaryCard` 返回 `{kind:"reject", reason}`；包装器不呈现卡片、返回 `{outcome:"declined", notPresented:true, reason}` 并写 `request.rejected` 运行日志/系统行；不签发许可。
5. **收窄/无变化**：S7 `expanded:false` ⇒ 请求原样透传（无横幅/无 ack），正常签发许可。
6. **测试**（`version-change.test.ts`）：
   - `buildStableBoundaryRisk` 纯函数（banner/acks/`to-yaml-invalid`/空数组）；
   - 真实 SessionManager + 真实 `VersionChangeStack` + fixture `角色卡/impl/boundary.yaml`：
     - 扩大（新增 `test/` 目录）⇒ 卡面 required ack + 横幅含 `test/`；勾选后 `stablePermitOf(boundary)` 存在（许可已签发）；
     - 扩大未勾选（fake 通道绕过 `respondUnsafe`）⇒ `stablePermitOf` 不存在（最后防线）；
     - 无变化/收窄（`src/impl/`）⇒ 不注入 ack、正常签发许可；
     - 不可解析（`entries: [`）⇒ 不触达客户卡、`declined/notPresented`、无许可、原因非空。
   - 许可/写入仍经 gate+completeWrite：D1 的 `appointment-write 钩子（F16）`/`stable workflow`/`哈希不符` 测试继续通过（599/599）。

## 四、AC-17 修复点（VCA 在途抑制自动 run-change）

1. **查询**：`session.ts::pendingVersionChangesFor(projectRoot)` 经注入的 `getVersionChangeStack` 调 `listVersionChanges()`，过滤 `submitted`/`approved`；无栈（旧路径）⇒ 空（旧行为）；查询异常 ⇒ `{ok:false, reason}`（fail-closed 抑制）。
2. **抑制**：`offerRunChangeOnFrozenContract` 在 **per-run 去重之前**检查；有在途/查询失败 ⇒ 不调用 `requestRunChangeDecision`、**不写** `runChangeAutoPrompted`；组装 `run-change-required` 三段式（reason 含 `applicationId` 与状态；action 指向「版本变更」入口说明），并 `emitDeliveryNote` 发系统行 `[主干与版本变更] 版本变更申请 · vc-… (已提交/已批准) — 提交说明`。
3. **恢复**：无持久抑制标记；VCA 结束（applied/rejected/cancelled/superseded 或无记录）后，下一次冻结提案卡自动 offer 正常弹卡（测试验证同一 run 未被占名额）。
4. **显式入口**：`requestRunChangeDecision`（及 Interface `requestRunChange`/preload）未加 VCA 检查；在途 VCA 时仍可显式呈现 run-change 卡（测试验证）。
5. **测试**（`run-change-trigger.test.ts`）：真实 pinned run + v2 proposal + rapporteur 会话；fake 栈 `listVersionChanges`：
   - `submitted` ⇒ 提案卡 `declined/notPresented`、**0 张** run-change 卡、系统行含 `vc-1`；
   - `approved` ⇒ 同样抑制；
   - 列表清空 ⇒ 同一提案卡触发自动 run-change 卡（恢复）；
   - 重新有在途 VCA ⇒ 显式 `requestRunChangeDecision` 仍呈现卡（显式入口保留）。

## 五、测试与类型检查（原始结果）

1. D2 专项：`node --test test/桌面应用/version-change.test.ts test/桌面应用/run-change-trigger.test.ts` → **tests 39 / pass 39 / fail 0 / skipped 0**。
2. `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` → **tests 599 / pass 599 / fail 0 / skipped 0**（D1b 基线 593 + 6 D2 tests；无既有失败）。
3. cross-node：`g1-copy-and-nails` + `i18n-integration` + `项目管理/shared/i18n` → **26 / 26 pass**。
4. `npm run typecheck` → **exit 0**。未改断言保绿、未新增 skip。

## 六、U1 / T2 消费点

- **无新 IPC/通道**：AC-13 的风险横幅/ack 进入既有 appointment-write 卡 `preview`/`acknowledgments`（U1 已按对象数组渲染；`operatorRespond` 回传 `acknowledged`）；AC-17 的系统行经既有 `delivery-note` 角色流展示，无新面板。
- **T2 复跑**：稳定 boundary 确认卡探针使用一个「扩大」preview（如新增 `test/` 目录）即可看到横幅与 required 勾选；不可解析 preview 应显示拒绝（不呈现卡）。VCA 在途抑制可在报告中用系统行 + 0 卡呈现核对。
- **文案**：复用既有 key（`ui.stableWrite.kind.boundary`、`main.interface.boundaryDirWiderWord`、`main.interface.boundaryParseFailed`、`ui.versionChange.*`、`ui.trunk.panelTitle`）；未新增/改 i18n messages（C3 写集）。

## 七、遗留与披露（交 T1/T2/E1）

1. **扩大的 ack 词表**：每个扩大条目一条 `boundary-expansion-<n>`（label = S7 `root:path` / `to-yaml-invalid` 原因）；无独立 C3「边界扩大」文案 key，横幅用既有 `boundaryDirWiderWord` + 数据行；若需更精细文案由 C3 追加。
2. **检测时点**：在 D1 的 appointment-write 呈现包装内（run-role 结构校验之后、客户卡之前）；不改变 appointment-write 的 D3/审批/写权语义。S7 `fromPath` 不存在（新角色）⇒ 全部条目视为扩大（客户逐项确认）。
3. **AC-17 抑制粒度**：仅抑制**自动** run-change offer；显式低层 API/入口保留（P1.6 G11）。系统行按提案卡触发（未额外去重）；查询失败 fail-closed 抑制并披露读取失败。
4. **`draft` VCA 不抑制**（尚未提交，不是「在途 submitted/approved」）；按需求口径。
5. 未运行 Electron 截图/全量 T3/双端 renderer 构建（T1/T2）；E2 可复跑受影响套件后重判 AC-13/AC-17。

## 八、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅写 §二列出的文件；**未改 `src/**`/`app/renderer/**`/package.json/构建配置/角色卡/边界/`docs/scheduling|acceptance|communication|planning`/其它角色测试**。
- 未运行应用；**未 commit / push / merge / release**。
- 若需改 S7 API/冻结契约或新增 B-x，按停止项回报，不自行扩写集。
