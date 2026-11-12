# v2.0.0 发布阻断 B3-4：boundary-refresh G-4 文本钉 + chain-enforcement 语义对齐（2026-11-12）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.0.0 发布阻断 **B3-4**——`boundary-refresh.test.ts` G-4 接线钉的源码文本断言已过时；
  `chain-enforcement.test.ts` 6 例 legacy 直接派发夹具与 v2.0.0 文档/团队准备来源门冲突。先裁清语义，
  按「与新语义一致的最小钉法」更新测试；**不放宽任何 fail-closed 主断言、不新增 skip/force-exit、
  不改产品代码**。
- 工作树/分支：`.claude/worktrees/release-v2.0.0-blockers-5` / `release/v2.0.0-blockers-5`，
  基线 `24f2028`（B3-2c）；本批改动追加在同一分支（PR #90 更新）。
- 授权：客户已授权；**客户已接受 W1b 测试期望调整的裁定**（旧 flow 预设语义随 B3-1 调整）——本记录附注，
  不再重复论证。
- 声明：未运行 Electron、未占用 9224、未触发 CI、未打 tag、未 push main；本批只改测试/白名单/记录。

## 〇、结论摘要（先读）

1. **boundary-refresh G-4：纯测试源码文本钉过时，非产品缺陷。** 实现已把技能安装/卸载收敛为
   `const action`（`app/desktop/session.ts:4155-4158`），旧字面量 `this.applySkillChange("installed"` /
   `this.applyMcpChange("installed"` 不存在；功能仍是 install/uninstall 共用同一 handler。修复首条断言后，
   同测试隐藏的第二条陈旧文本钉（`:517` 的 `return active === undefined || active.kind === "message";`）
   也暴露出来——当前护栏实现为 `return origin !== undefined && !origin.settled && origin.kind === "message";`
   （`:11789-11793`）。两处均按**当前实现**更新，语义钉更精确（同一 action/同一 scopedInstallation 工厂；
   只放行真实客户消息轮次），断言未放宽。
2. **chain-enforcement 6 例：裁定为「harness 缺真实会话事实」，不是产品缺陷。** 这 6 例测的是
   **legacy 直接派发/审批链的裸桩夹具**（直接调用注入的 `dispatchTask`，无真实客户轮次），而 v2.0.0
   产品门明确要求「已登记项目生命周期 + 当前 accepted 客户轮次 + 真实管理会话证据」才允许文档/团队准备
   派发（`app/desktop/session.ts:9620-9656`；运营 worker 派发 `:9519-9521`）。裸夹具没有这些宿主事实；
   **伪造注册/生命周期证据会削弱门禁**，因此按新语义钉住 fail-closed：拒绝码 +
   任务账本零新增 + 目标零投递。逐条处理见 §三。
3. **判定依据（同仓先例）**：
   - B3-1（`2026-11-12_release-blocker-optional-acceptance-hang.md`）对同一门已作相同裁定：
     「原『成功派发』断言无法在裸 stub 夹具上成立（生产门要求真实注册生命周期/当前轮次/管理会话证据，
     伪造会削弱门禁），改为钉住 v2.0.0 的 fail-closed 契约」。
   - `test/桌面应用/fixed-path-routing.test.ts:390-396` 把「legacy/v1 裸夹具带 flowId」的
     `document-planning-source-unavailable` 作为**正确**的 fail-closed 结果断言。
   - 独立验收 B2 记录（`2026-11-10_B2_pre-RR_two-fixed-workflow-paths.md` D1）已把同族 star-routing/
     i-full-chain 红判为「代码基线确定性陈旧测试缺陷（测试夹具未提供注册/当前轮次）」，非产品回归。
4. **不提供「真实」注册夹具的原因**：真实注册只在原生目录选择成功后形成
   （`app/desktop/interface.ts:2550`，`source:"native-directory-selection"`），没有无 Electron 的可复用
   构造入口；在 `SessionManagerDeps` 里伪造 `getRegisteredProjectLifecycle` 正是该门要防的绕过。
   因此 6 例统一走「fail-closed + 零任务 + 零投递」的最小钉法；仍可诚实成立的账本行为（报告路由）
   用 `task.created` 账本钉保留（M9/F4）。
5. 验证：两目标文件逐条通过（boundary 14/14、chain 9/9，各连续 3 次）；`npm run typecheck` exit 0；
   三套冻结 known-red 逐名 diff 全空（runtime-core 33 / 门禁 5 / 编排 24）；装配测试 18/18。

## 一、boundary-refresh G-4

### 1.1 事实

- `test/桌面应用/boundary-refresh.test.ts:498` 断言 `SESSION_SRC.includes('this.applySkillChange("installed"')`
  与 `'this.applySkillChange("uninstalled"'`；`:500` 同款 MCP。当前实现（`app/desktop/session.ts:4155-4158`）：

  ```ts
  const action = toolName === "uninstall_skill" || toolName === "uninstall_mcp" ? "uninstalled" : "installed";
  const result = toolName === "install_skill" || toolName === "uninstall_skill"
    ? await this.applySkillChange(action, req.projectRoot, req.runtime, req.roleId, payload, stillUnmanaged)
    : await this.applyMcpChange(action, req.projectRoot, req.runtime, req.roleId, payload, stillUnmanaged);
  ```

- 功能语义未变：`scopedInstallation("install_skill"/"uninstall_skill"/"install_mcp"/"uninstall_mcp")`
  共用同一工厂；护栏（`stillUnmanaged` → `refuse`）、校验、激活、回执/系统行全在共用层。
- `:917`（原 `:517`）另有陈旧文本钉：`return active === undefined || active.kind === "message";`。
  当前实现 `isCustomerInitiatedTurn`（`:11789-11793`）为
  `if (!entry || entry.busy !== true) return false;` +
  `return origin !== undefined && !origin.settled && origin.kind === "message";`——直接 client send 与
  排队客户消息都是 `kind:"message"`，系统/派发/回交轮次拒绝。首条失败掩盖了这条失败。

### 1.2 改法（只更新过时文本，不放宽）

- 技能两工具：钉 `const action = ... ? "uninstalled" : "installed";` + `toolName === "install_skill" ||
  toolName === "uninstall_skill"` + `this.applySkillChange(action,` + 两个 `scopedInstallation(...)` 绑定
  ——证明 install/uninstall 由同一 action 判据派生、进入同一 handler/同一工厂。
- MCP 两工具：钉 `this.applyMcpChange(action,` + `scopedInstallation("install_mcp")` /
  `scopedInstallation("uninstall_mcp")`——与技能版逐字同构，未减弱。
- 护栏：钉 `if (!entry || entry.busy !== true) return false;` + 当前 `kind === "message"` 判据
  ——只放行真实客户消息轮次；原断言「直接 send/排队客户消息放行、其余拒绝」的意图逐字保留。
- 结果：14/14 pass（连续 3 次）。

## 二、chain-enforcement 语义裁定

### 2.1 这些用例测的是什么

- 文件头（`:2-7`）与 B7.1 注释（`:218-225`）明确：本套件验证 **legacy 招人链/前置校验旧行为**；
  harness（`:227-279`）桩掉 `openRoleSession`、无 `createRuntimeAdapterFactory`、无
  `getRegisteredProjectLifecycle`、无真实 running origin，测试直接调用注入的 `dispatchTask`。
- 这是「模型工具直接派发」的**应用层夹具**，不是 v2.0.0 的真实客户会话：没有 `entry.handle.sessionId`、
  没有 `origin.turnId`、没有 `origin.inputAccepted === true`、没有宿主原生选择的注册记录。
- v2.0.0 门（`app/desktop/session.ts`）：
  - `:9654-9656`：`hubPreparation || documentPlanningRole || rolePreparation` + `flowId` + 客户/匿名
    来源 ⇒ 必须 `getRegisteredProjectLifecycle(projectRoot)` 且 `sourceIsCurrent()`；
  - `:9620-9628`：`prepareDocumentScope` 复核 `handle.sessionId`、`origin.turnId`、
    `inputAccepted === true`、注册与来源 current；
  - `:9519-9521`：运营（convener）worker 派发必须来自当前真实受派任务（running origin + taskId +
    可核验父任务），否则 `worker-dispatch-source-unavailable`；
  - `:9496-9497`：运营→verifier 硬门 `chief-hub-review-owner-required`（新质检任务须由幕僚创建）。
- `prepareRoleDispatch` 还会复核原生选择身份与 Git 初始化事实
  （`src/service/trunk/impl/apply-journal.ts:3808-3835`、`:3866-3877`），不是只查一个布尔。

### 2.2 裁定

**属 harness 缺真实会话/宿主事实；v2.0.0 门是有意的 fail-closed，不应被假夹具绕过；不是产品缺陷。**
因此不修改 `app/desktop/session.ts`，只在测试侧：

- 每个用例先断言对应 fail-closed 拒绝码；
- 断言任务账本零新增、目标零投递（不伪造受理）；
- 对仍可诚实成立的账本行为（报告路由）直接登记 `task.created` 后断言，不把「成功派发」伪装成发生过。

## 三、chain-enforcement 逐条处理

| # | 用例（原断言点） | 新语义下的处理 | 结果 |
| --- | --- | --- | --- |
| 1 | M1/M2（`:364`） | rapporteur/nominator 的文档/人事准备派发（缺意图、文档齐备、缺名单、同文复派）全部钉 `document-planning-source-unavailable`；零任务、零投递；诊断不得出现 `tasks.dispatch.advisory`（拒绝而非受理）。 | 通过 |
| 2 | M5/M6/M7 + 交付标记（`:437`） | 幕僚→运营交付钉 `document-planning-source-unavailable`；运营→实现者钉 `worker-dispatch-source-unavailable`；运营→verifier 钉 `chief-hub-review-owner-required`；均零任务零投递。能力 `dispatchTask` 仍在场（能力在场 ≠ 授权）。 | 通过 |
| 3 | D3 卡种收口 #1（`:591`） | 保留真实 D3 + decision/intent-confirm/acceptance 污染夹具；断言这些账本事实**不能替代**真实来源——交付与运营派发均 fail-closed、零任务零投递。 | 通过 |
| 4 | D3 卡种收口 #2（`:631`） | 新格式 appointment（无名单戳）与无 cardKind/无戳旧裁决两个夹具都只到来源门；均 fail-closed、零任务零投递。 | 通过 |
| 5 | M9 报告路由（`:680`） | 交付先钉来源门；报告路由用账本内 `task.created` 行为钉：运营创建的 worker 报告**先真实登记**（不丢报告），但账本无真实子任务 parent 链 ⇒ 投递 fail-closed、不误投运营/幕僚；幕僚创建的策划任务报告按 creator 路由回幕僚 `[工作结果]`。 | 通过 |
| 6 | F4 质检报告路由（`:819`） | 交付/运营→质检两段先钉来源门；账本内两条 verifier 任务：运营创建的报告先登记但无真实子链归属 ⇒ 不误投；幕僚创建的报告按 creator 路由回幕僚。 | 通过 |

共同实现细节：

- 新增 `assertDispatchRefused(root, h, receipt, targetRoleId, code, label)`：断言
  `ok === false`、拒绝码匹配、`readTaskState(root).records.size === 0`、目标 `sent` 为空。
- 新增 `waitUntilAsync` 用于等待 `task.reported` 登记（不引入固定 sleep 判定）。
- 未新增 skip/force-exit；原 fail-closed 主断言保留并加强（从「成功受理」改为「必须拒绝且零副作用」）。

### 3.1 覆盖面变化（如实披露）

以下 session-level 正例在裸夹具上无法诚实成立，本批不再声称覆盖；纯逻辑/账本层面覆盖仍在：

- M1/M2 的 intent-missing / roster-missing / 基线漂移 advisory：纯逻辑由
  `test/编排/dispatch-advisories.test.ts` 覆盖（`intent-missing`、`roster-missing`、`d3-missing`、
  `target-not-nominated` 等逐项断言）；session 级「受理 + advisory」不再覆盖。
- M5/M6/M7 的模块字段/verifier 元数据正例：账本/服务层由 `run-pin.test.ts`、`git-capabilities.test.ts`、
  `task-state.test.ts` 等覆盖；session 级派发正例不再覆盖。
- D3 卡种过滤的 session-level 正例不再有绿色覆盖；`run-pin.test.ts` 的同族用例同样因该来源门为红
  （不在 B3-4 范围，未改）；M11 仍覆盖 D3 身份/名单版本校验。
- M9/F4 的「运营创建的任务报告回运营」正例需要真实 run/子任务 parent 链；本批不伪造该宿主事实，
  改为断言「报告已登记、投递 fail-closed、不误投」；幕僚方向的 creator 路由保持正例。

## 四、白名单（overlay）与装配钉

- `src/common/装配/release-policy.mjs`：
  - `files` 精确加入 `test/桌面应用/boundary-refresh.test.ts`、`test/桌面应用/chain-enforcement.test.ts`
    （各 1 条，单文件不开目录）；
  - 注释新增 B3-4 条目（G-4 文本钉更新理由 + chain-enforcement 语义裁定），并修正顶部
    「基础集 + 1 条」的陈旧描述为「基础集 + 各批发布阻断修复条目」；
  - 未列入任何产品代码；未列名 `app/`/`src/` 仍 fail-closed、未列名 `test/` 仍 excluded。
- `test/装配/release-packaging.test.ts`：
  - 新增 B3-4 精确路径用例（两文件入选；相似名/同目录其它测试 excluded；既有 blockers 条目仍在）；
  - 同步 v1.8.2 历史清理用例：`chain-enforcement.test.ts` 现按 B3-4 重新入选，其余 4 条仍 excluded
    （这是 overlay 重新入列的必然同步，断言未放宽）。
- 装配测试 18/18 pass。

## 五、验证（Windows 11 / Node v24.22.1，同一工作树）

| 项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| boundary-refresh | `node --test --test-concurrency=1 "test/桌面应用/boundary-refresh.test.ts"` | **14/14 pass**，0 fail/skip/cancelled；连续 3 次 | `_evidence/after-boundary-refresh.txt` |
| chain-enforcement | `node --test --test-concurrency=1 "test/桌面应用/chain-enforcement.test.ts"` | **9/9 pass**，0 fail/skip/cancelled；连续 3 次 | `_evidence/after-chain-enforcement.txt` |
| 类型 | `npm run typecheck` | **exit 0** | `_evidence/typecheck.txt` |
| 装配 | `node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"` | **18/18 pass** | `_evidence/release-packaging.txt` |
| 冻结 known-red runtime-core | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | 604 tests / 567 pass / **33 fail** / 4 skipped；逐名 diff 空 | `_evidence/knownred-runtime-core.txt` |
| 冻结 known-red 门禁 | 同上 `"test/门禁引擎/**/*.test.ts"`（运行前 LF 归一、运行后还原） | 577 tests / 571 pass / **5 fail** / 1 skipped；逐名 diff 空 | `_evidence/knownred-gates.txt` |
| 冻结 known-red 编排 | 同上 `"test/编排/**/*.test.ts"` | 1386 tests / 1360 pass / **24 fail** / 2 skipped；逐名 diff 空 | `_evidence/knownred-orchestration.txt` |

known-red 口径：

- runtime-core 基线 = `角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-provider_evidence/14b-knownred-runtime-core.tap`
  （与 WJ1 冻结集逐名 diff 为空；排除 reporter 汇总头 `failing tests:`）。
- 门禁基线 = `.../2026-11-10_B2_two-fixed-workflow-paths-evidence/07-gates-failure-names.txt`（5）。
- 编排基线 = `.../2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-05-known-red-failnames.txt`（24）。
- 门禁资源 LF 归一按既有做法：运行前 `git cat-file blob HEAD:<path>` 临时写回
  `src/common/门禁引擎/workflows/chief/*.md`，运行后 `git checkout --` 还原；还原后 `file` 确认为 CRLF、
  `git status` 干净。未做归一首次运行会多出 9 条 legacy 字节 SHA（检出换行差异，非产品回归）。
- 三套 `new-red: []` / `missing: []`，见 `_evidence/knownred-diffs.txt`。

## 六、文件与 SHA-256（提交前工作树）

| 文件 | SHA-256 |
| --- | --- |
| `test/桌面应用/boundary-refresh.test.ts` | `304fd4dc33a519f46be5cf64561d49eca586614d2f088a550f44acf13e07a076` |
| `test/桌面应用/chain-enforcement.test.ts` | `ddf2878948f88b969b008cb67e24c9a9622c9b486ce00dd94d50f84d0d6773ad` |
| `src/common/装配/release-policy.mjs` | `694d168fb581d26ed6b57d3b10d3d53ab27799a8530a441a8156980e284d6184` |
| `test/装配/release-packaging.test.ts` | `ba6b356c97fc9ee1ed943d9930553249d0d047bf7b2c0a1cd3138f7fb7d35da7` |

## 七、限制与披露

1. 本机为 Windows 11；macOS arm64/x64 的最终确认由发布流水线执行（本批未触发 CI）。
2. 未改产品代码。若后续认为「legacy 项目允许无真实客户轮次的直接派发」应为受支持语义，那是产品决策，
   应另立变更并同时调整 v2.0.0 来源门与正向夹具，不应在本测试修订单里夹带。
3. 覆盖面变化已在 §3.1 逐项披露；未删除用例、未新增 skip、未放宽 fail-closed 主断言。
4. W1b 裁定附注：客户已接受 W1b 测试期望调整（旧 flow 预设语义随 B3-1 调整）；本批不涉及 W1b 行为。
5. 未运行 Electron、未占用 9224；未打 tag；未 push main；仅提交/推送 `release/v2.0.0-blockers-5`
   （PR #90 更新）。

## 八、复现命令

```powershell
cd C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-5
node --test --test-concurrency=1 "test/桌面应用/boundary-refresh.test.ts"
node --test --test-concurrency=1 "test/桌面应用/chain-enforcement.test.ts"
node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"
npm run typecheck

# known-red（门禁需先 LF 归一、运行后还原）
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"
node --test --test-concurrency=1 "test/编排/**/*.test.ts"
```
