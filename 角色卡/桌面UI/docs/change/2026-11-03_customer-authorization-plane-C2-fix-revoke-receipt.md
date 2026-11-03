---
id: customer-authorization-plane-c2-fix-revoke-receipt
type: change
title: 客户授权平面 C2 窄修复：指令面板撤销回执（roleId/runtime 透传）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - customer-authorization-plane-c2-implementation
  - customer-authorization-plane-d2-real-run
  - customer-authorization-plane-c1-implementation
events:
  - date: "2026-11-03"
    kind: created
    summary: D2 唯一 false（S5_PANEL_REVOKE_RECEIPT）窄修复；面板撤销经 store 透传当前 roleId/runtime；UI 402/402、双端 typecheck 0、build 0、D2 探针 64/64 全 true（S5_PANEL_REVOKE_RECEIPT=true）
---

# 客户授权平面 C2 窄修复：指令面板撤销回执

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：桌面UI（固定角色；本上下文只承担该角色）/ D2 发现后的 **C2 窄修复**。
- **状态**：**`implemented-unverified`**。修复完成、证据已采集；**未验收、未 commit/push**，交 D2/测试角色复验、E2 判定。
- **基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（与 D1/D2 相同）；本修复只改 C2 写集 3 个产品文件 + 1 个自身测试与证据。

## 1. 触发与根因（只读核对）

D2 真实运行唯一失败检查：`S5_PANEL_REVOKE_RECEIPT=false`（D2 记录 §五.1，288 行 / `f8e1e9b1…`）。面板点“撤销”后：

- 账本追加 `directive.revoked d-1`（`S5_LEDGER_REVOKED=true`）；
- 面板行变为 `data-status="revoked"`（`S5_REVOKED_ROW_STATE=true`）；
- **没有**「已撤销审批指令 #d-1」系统行。

根因链（修复前）：

1. `app/renderer/src/stores/directive-store.ts` 的 `revoke` 只发 `{id,target,projectRoot}`，未带 `roleId/runtime`；
2. `app/desktop/directive-input.ts` 的 `revoke()`（C1，只读）从入站载荷读取可选 `roleId`，随后 `emitReceipt(projectRoot, roleId, runtime, …, "revoked", id, false)`；
3. `emitReceipt` 在 `roleId` 为空时直接 `return`（回执必须显示目标角色）。

输入式撤销正常，是因为 `submitFromInput` 路径在 C1 主进程侧持有 `input.roleId/runtime` 快照。C1 IPC 已冻结可选 `{roleId?,runtime?}`，**本次无需改 C1**。

## 2. 修复内容

### 2.1 写集与哈希

写前哈希取自 C2 候选（与 C2 实施记录逐字一致）；写后为本修复结果。

| 路径 | 行数（前→后） | 写前 SHA-256 | 写后 SHA-256 | 写后 `git hash-object` | 改动 |
| --- | --- | --- | --- | --- | --- |
| `app/renderer/src/stores/directive-store.ts` | 1067→**1080** | `5096ba6961615edd4c3caa8083f3f274510851c34a17d852876dbd28cf82e844` | **`edb7eefb9c758e1200ab8701a9df9d0cf171c3603b488257a4c0ecdf1f7e29e9`** | `4bb498cac277485dacae8353b95c7fb12d3c5bb8` | `revoke(id,target,context?)` 增加可选 `{roleId?,runtime?}`；载荷仅在有效时附加；保留 `projectRoot`（L663-667、L915-951） |
| `app/renderer/src/chat/directive-panel.tsx` | 283→**320** | `c96f6cd245a25e5b655258738a47942ad3fd01ea4dd71cdf33ba5eea016bdc4f` | **`9861abd673aa432ba0595f2b1846ea34f42b91a24fefc36f4c6872d1e2db82ba`** | `6cc87500d1820118706b576891900b69d6340f5f` | `DirectivePanel` 接收 `roleId/runtime` 并逐层传到行；撤销按钮调用 `revoke(item.id,item.target,{roleId,runtime})`（L45-117、L119-142、L144-179、L181-186、L110） |
| `app/renderer/src/shell/Composer.tsx` | 1011→**1011** | `0a19060b49fcb33e2198e5cff81604dece660acdb9b7dc47f75cec4e6439d7b6` | **`972b5779685b0943f7391b5aae2b2ca2a199dd7c1671bc06115b8b2fbb2aa1f8`** | `9b64fe998f18d6cab7a83accdd52fc14ec803e78` | L1008：`<DirectivePanel roleId={selectedRoleId} runtime={runtime} />`；其余行为不变 |
| `test/桌面UI/directive-panel.test.ts` | 441→**490** | `6ab90d2238043655d8ea19eaa443f30ba162fa662b95117ad0d13ded8def1e0a` | **`f51e232144e2dde9707ee1e95cc7d24c61d9dbc80722c3d9464b229a2fb607c0`** | `e7f72fb5c49943b73e29080b9302cdf270c00300` | 原“无上下文”用例保留断言并改名（L319）；新增“带上下文”载荷用例（L340）；面板/Composer 源码守卫补 roleId/runtime 透传断言（L475、L481） |

- **C1 未改**：`app/desktop/directive-input.ts` 写后 SHA-256 `914868d83015e331b412fda9a6c86040fc20a6f1e5dbc22b75c706728d6f4caa` = C1 实施记录所记值（812 行）；`app/preload.cjs` `684c0d96…`、`app/main.ts` `c62da456…` 均未触碰。
- 未写 `src/**`、`test/桌面应用/**`、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication`；无新依赖/新通道/构建配置改动。
- 写前/写后完整哈希：`01-writeset-before-sha256.txt` / `08-writeset-after-sha256.txt`；状态：`09-git-status-writeset.txt`；Composer 对 HEAD 的 diff：`11-diff-composer.patch`（该 diff 含 C2 既有未提交改动，本修复增量仅为末行 `roleId={selectedRoleId} runtime={runtime}`；store/panel/test 为 C2 新增未跟踪文件，git 无基线 diff，以写前/写后 SHA-256 与行号定位为准）。

### 2.2 载荷规则（保持 C1 冻结形状）

```ts
revoke(id, target, { roleId?: string; runtime?: DirectiveRuntime })
// → bridge.revokeDirective({
//     id, target,
//     ...(projectRoot ? { projectRoot } : {}),
//     ...(roleId 非空 trim 后 ? { roleId } : {}),
//     ...(runtime 为 pi|codex|claude ? { runtime } : {}),
//   })
```

- C1 冻结载荷的**可选字段**语义未变：不传上下文时形状与 C2 初版逐字一致（`{id,target,projectRoot}`）。
- 空/空白 `roleId`、非法 `runtime` 不附加；主进程继续按既有逻辑如实处理（不会因缺字段伪造回执）。
- 渲染进程仍不判 target、不写账本、不新增 IPC。

## 3. 验证（本角色出口）

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/桌面UI/*.test.ts"`（修复前基线） | **401/401 pass**，exit 0 | `02-tests-ui-before.log` |
| 2 | 同上（修复后） | **402/402 pass**（401 + 新增 1 用例），0 fail / 0 skipped / 0 todo，exit 0，5116ms | `03-tests-ui-after.log` |
| 3 | `npm run typecheck` | **exit 0** | `04a-typecheck.log` |
| 4 | `npm run typecheck:renderer` | **exit 0** | `04b-typecheck-renderer.log` |
| 5 | `npm run build:renderer` | **exit 0**，`built in 337ms`（仅既有 chunk-size/dynamic-import 警告） | `05-build-renderer.log` |
| 6 | `node --test "test/项目管理/shared/i18n-guard.test.ts"`（补充） | **6/6 pass，exit 0**（新源码无新增 Han；C2 记录中的 C1 既有项当前已由 allowlist 收口） | `12-i18n-guard.log` |

- 未修改既有断言以保绿；未新增 skip/todo；新增用例为载荷断言与源码守卫。

## 4. D2 真实运行探针（只读复跑）

| 项 | 值 |
| --- | --- |
| 探针 | `test/测试/customer-authorization-plane-d2-probe.mjs`（**未修改**；SHA-256 `a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427`，954 行） |
| 命令 | `ANS_D2_HEAD=4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0 ANS_D2_PROBE_OUT=角色卡/桌面UI/docs/change/2026-11-03_customer-authorization-plane-C2-fix-evidence/probe-run ./node_modules/.bin/electron test/测试/customer-authorization-plane-d2-probe.mjs` |
| 输出目录 | 本角色**全新** `probe-run/`；`userData`、夹具项目均在目录内，**未使用**测试角色 D2 的 `probe-run-2/userData` |
| 退出码 / 耗时 | **0**；`D2_PROBE_DONE failures=0 checks=64 screenshots=16` |
| checks | **64 / 64 true**（`report.json.failures=0`；0 console error、0 CSP violation） |
| 关键检查 | **`S5_PANEL_REVOKE_RECEIPT=true`**，receipt=`已撤销审批指令 #d-1`；`S5_REVOKED_ROW_STATE=true`；`S5_LEDGER_REVOKED=true`；`S5_TWO_LOGICAL_PANELS_AND_ROWS=true` |
| 对照回执 | `S1_RECEIPT=true`、`S2_RECEIPT=true`、`S3_RECEIPT=true`、`S4B_REVOKE_D3_RECEIPT=true`、`S4B_REVOKE_D4_RECEIPT=true`、`S7_RECEIPT=true`（输入式与卡内入口回执均未回归） |
| 截图 | **16 张 PNG**，窗口内容 **1360×860**；`07-directive-panel.png` / `08-approval-revoked.png` 哈希相对 D2 变化（新增回执行），其余 14 张与 D2 逐字相同 |
| 账本 | `probe-run/project/.ans/state/customer-directives.jsonl` **9 行 / 3,356 bytes / `6ecc1d41a0f9f987e59ea55c8b09bf64ad2d043be3825d0003e35f5f63ea3cf3`**；`d-1` 面板撤销为 seq 8 |
| report | `probe-run/report.json` **876 行 / 23,558 bytes / `f86a8c72ddb53db952e00ec6ee209d58112eef71032383cadf2ad8e0f8171b93`** |
| D2 旧证据 | `probe-run-2/report.json` `f4a95fab…`、账本 `765b8b10…` 与 D2 记录一致（未触碰） |

说明：本探针为 test-only 证据工具，不进入产品代码；本次仅**只读运行**，未修改探针、未改断言、未新增 skip。原始日志 `06-d2-probe.log`（84 行 / `6d9c65b121a7d1040af6650d532d77e03f4d17f7cac50ed78a2053659f903a7a`）。

## 5. 证据清单

目录：`角色卡/桌面UI/docs/change/2026-11-03_customer-authorization-plane-C2-fix-evidence/`

| 文件 | 说明 |
| --- | --- |
| `00-head.txt` | HEAD/branch/Node/npm |
| `01-writeset-before-sha256.txt` / `08-writeset-after-sha256.txt` | 写集写前/写后 SHA-256 |
| `02-tests-ui-before.log` | 修复前 `test/桌面UI` 401/401 |
| `03-tests-ui-after.log` | 修复后 402/402 |
| `04a-typecheck.log` / `04b-typecheck-renderer.log` | 双端 typecheck exit 0 |
| `05-build-renderer.log` | `build:renderer` exit 0 |
| `06-d2-probe.log` | 探针原始日志（exit 0 / 64 checks / 16 screenshots） |
| `07-probe-hashes.txt` | 16 张截图 + report + ledger + snapshot SHA-256 |
| `09-git-status-writeset.txt` | 写集/证据目录 git status |
| `10-probe-summary.txt` | report.json 汇总与 S5 明细 |
| `11-diff-composer.patch` | Composer 对 HEAD 的 diff（含 C2 既有改动，末行为本修复） |
| `12-i18n-guard.log` | i18n guard 6/6 |
| `14-command-exits.txt` | 各验证命令的实测退出码 |
| `15-candidate-hashes.txt` | 4 个候选文件行数 + SHA-256 + `git hash-object` |
| `13-evidence-hashes.txt` | 本目录证据文件 SHA-256 索引（不含本索引自身；`probe-run/userData/` 为运行期临时产物，不入索引） |
| `probe-run/` | 探针输出：`report.json`、`ledger-snapshot.json`、`project/.ans/state/customer-directives.jsonl`、16 张 PNG、`userData/`（transient） |

## 6. 纪律、披露与停止项

1. **未 commit/push**；未暂存；未派发其他角色、未切换角色。
2. `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**` 未写；C1 文件哈希与 C1 记录一致（`914868d8…`）。
3. 未改 C1 冻结的五通道/五方法/字段名；`directive:revoke` 仍接受可选 `{roleId?,runtime?}`，无上下文时载荷形状不变（向后兼容）。
4. 面板的 `roleId` 来自 Composer 当前 `selectedRoleId`，`runtime` 来自当前引擎；未新增第二条 target 解析路径（撤销目标仍为行自身的 `item.target`，`projectRoot` 仍由 store 当前项目提供）。
5. 探针只读：脚本哈希 `a7913e87…` 与 D2 记录一致；D2 旧证据（`probe-run-2/`）未触碰。
6. `probe-run/userData/`、夹具项目与 `app/renderer/dist/` 为运行期/构建产物，不作为入库候选。
7. **停止项：无**。若独立复验仍要求“无选中角色时也产回执”，需 C1/产品另行定义回执显示目标；本修复按派发口径只在上下文有效时透传。

**本文件状态：`implemented-unverified`；未验收、未 commit/push。**
