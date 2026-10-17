---
id: governance-pin-recovery-independent-verification
type: fix
title: 治理记录 pin 不符「重新接受」独立端到端验证（测试角色）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: verified
related: [governance-pin-recovery-review, existing-project-compat]
events:
  - date: "2026-10-17"
    kind: created
    summary: 按 PM 评审 §5.5/§六/§八/§九独立验证 pin 不符的重新接受链路；自建 11 例端到端夹具，修正 3 条因 pin 逐文件校验接入而失效的既有断言；AC1–AC12 逐项通过；未发现实现缺陷
---

# 治理记录 pin 不符「重新接受」独立端到端验证（测试角色）

**验证对象**：PM 评审 [2026-10-17_design_governance-pin-recovery-review.md](../../../项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md)（status approved，revision 1）已落地的门禁引擎 / 编排 / 桌面窗口 / 桌面UI 实现。
**验证范围**：只读 pin 证据检测、`pin-mismatch` 状态、两步确认（预览 → 确认写入）、G1–G8 守卫、`listProject → preview → reaccept → listProject` 端到端、零副作用与 manifest 留痕。
**纪律**：只写 `test/测试/` 与 `角色卡/测试/` 自有文档；未改 `src/`、`app/`、其他角色测试或资料；未读取 `.env`、未使用真实凭据、未启动真实模型、未 git 提交。

## 一、环境

| 项 | 值 |
| --- | --- |
| 平台 | Windows 11 Home China（win32） |
| Node | v24.11.1 |
| 基线 | `main` / `80bfa60`（工作树含本轮各角色在途改动） |
| 测试命令 | `node --test "test/**/*.test.ts"`（**三层 glob**） |
| 类型检查 | `npm run typecheck` |
| 网络/模型 | 全部离线；会话入口使用确定性桩适配器（立即 settled，不触真实模型） |

## 二、夹具

新增目录 `test/测试/governance-pin-recovery-verify/`（`fixture.ts` + `pin-recovery-e2e.test.ts`，**11 例**）。

夹具形状贴近 finalize 的创世产物，全部在系统临时目录构造、用后清理：

- `角色卡/governance-boundary.yaml`：三普通目录（`角色卡/`、`docs/`、`.ans/`）；
- 3 个项目角色 `alpha` / `beta` / `gamma`：各 `role-card.md` + `boundary.yaml`；
- `.ans/project.json`：`roles` 映射 + `governanceBoundary.path` + `acceptance{accepted:true, source, pin}`；**pin 用当刻盘上真实 SHA-256**（治理文档在前、角色边界随后，共 4 条），并含一个未知顶层字段 `fixtureNote` 用于验证「只替换 pin、其余字段保留」；
- `docs/bootstrap-manifest.md`：既有内容 + 尾随换行，用于验证「逐字节保留 + 节末追加」；
- 变体：`withAns:false`（missing）、`ansRaw`（不可解析）、删文件 / 改文件 / 坏 YAML / `entries: []`。

「零写入」一律用**完整目录树快照**（相对路径 + 类型 + 大小 + mtime + 文件内容 SHA-256）在操作前后 `deepEqual`，不只看返回码。

## 三、AC1–AC12 逐项结果

| # | 场景 | 结果 | 证据（本套件用例） |
| --- | --- | --- | --- |
| AC1 | pin 全部一致 | **通过** | `a`：`inspectPinnedBoundaries.state==="ok"`、`files:[]`、`checked===pinCount`；`listProject.governanceRecord.state==="present"`；`governanceActionFor(...)===null`；预览 `not-needed`；零写入 |
| AC2 | 修改 1 个被 pin 边界 | **通过** | `b`：`pin-mismatch`；明细恰 1 条 `modified`、`pinned !== actual`；预览 `ok:true`/`canConfirm:true`/`changed` 正确/`previewDigest` 64 hex；**预览前后完整目录树（含哈希与 mtime）不变**；未新建文件 |
| AC3 | 2 修改 + 1 删除 | **通过** | `e2`：`changed` 恰 3 条（2 `modified` + 1 `missing`）、`canConfirm:false`；写入 `missing-file` / `phase:"precheck"`、`wrote:[]`、零写入（哈希 + mtime） |
| AC4 | 预览后取消 | **通过** | `g`：预览后不调用写入口；完整目录树不变；再次 `listProject` 仍 `pin-mismatch`；本套件全程未开启任何会话 |
| AC5 | 正常确认接受 | **通过** | `c`：`completed` / `phase:"write"` / `wrote:[ANS,manifest]`；按内容哈希比较，**仅** `.ans/project.json` 与 `docs/bootstrap-manifest.md` 变化；pin 路径/顺序/条数不变；`roles`、`acceptance.source`、未知字段不变；未修改项哈希不变；manifest 逐字节保留旧内容并追加一条含 ISO 时间、变更数、路径、64 位旧/新哈希的记录 |
| AC6 | 接受后重新加载 | **通过** | `d`：同一 `listProject` 路径返回 `present`；`resolveRole("su")` → `accepted:true`、`parseError` 为空；确定性桩会话 `openGovernanceSession` 成功返回句柄、`acceptance.accepted===true`，不因 pin 抛错 |
| AC7 | 预览后、确认前再次修改 | **通过** | `f`：写入返回 `preview-stale` / `phase:"precheck"` / `wrote:[]`；完整目录树不变 |
| AC8 | 坏 YAML / Section 1 为空 | **通过** | `i`：两类夹具均 `ok:true` + `canConfirm:false` + blocker `unparseable-boundary` 点名 `角色卡/beta/boundary.yaml`；写入 `unparseable-boundary` / `precheck`、零写入 |
| AC9 | `.ans` 缺失 | **通过** | `h`：`listProject.governanceRecord.state==="missing"`；`governanceActionFor(...)==="establish"`（只出现「建立治理记录」）；预览 `ok:false` / `no-record`；零写入 |
| AC10 | `.ans` 不可解析 | **通过** | `h`：`invalid` + 非空 `reason`；动作谓词 `null`；预览 `ok:false` / `invalid-record`；零写入 |
| AC11 | 写入阶段人为抛错 | **未由本 E2E 覆盖** | 机制公开面无可注入的写失败缝；按评审归属由编排套件 `test/编排/governance-reaccept.test.ts` 覆盖。本套件已验证 `missing-file` / `preview-stale` / `unparseable-boundary` 三类 `precheck` 失败均零写入 |
| AC12 | 回归 | **通过（本批口径）** | 本角色两目录 **53/53**；全量 **2314 测试 / 2216 pass / 95 fail / 3 skip**，95 红**全部既有、均不在本批目录**（归类见 §四）；`npm run typecheck` 85 错全为既有依赖缺件，**改动文件 0 错** |

补充覆盖：`公共出口` 用例直接从 Pipeline 再导出调用 `previewGovernanceReacceptance` / `reacceptGovernancePins`（不经桌面），确认桌面角色不参与也能完成预览与写入，且仍只改两个文件。

## 四、全量数字与红项归类

**本批**：

- `test/测试/existing-project-compat-verify/**` + `test/测试/governance-pin-recovery-verify/**` → **53/53 pass**。
- 全量 `node --test "test/**/*.test.ts"` → **2314 tests / 2216 pass / 95 fail / 3 skip**（上一有效基线 2313/2215/95/3：本批 +1 用例且通过，红数不变）。
- **本批新增红：0**；两套件在全量运行中 0 失败。
- `npm run typecheck` → **85 错**；按路径过滤，**`governance-pin-recovery-verify` 与 `existing-project-compat-verify` 0 错**。85 错全部来自缺失依赖（`@anthropic-ai/claude-agent-sdk`、`zod`、`@modelcontextprotocol/sdk`）导致的既有类型解析失败，与本批无关；本环境 `node_modules` 中这三个包未安装，故类型门在此机器上无法做到 0 错——如实登记，未以任何方式放宽。

**既有 95 红归类**（均不属本批目录）：

| 类别 | 约数 | 主要文件 |
| --- | --- | --- |
| 依赖缺件（SDK/MCP/zod 未安装） | 74 | `test/codex-adapter/*`、`test/测试/g3-search-verify/*`、`g4v2-mcp-verify/*`、`g5-reasoning-verify/*`、`test/装配/multi-runtime.test.ts`、`test/测试/t1-real-cli.test.ts` |
| Windows 符号链接权限（EPERM） | 7 | `test/runtime-core/session-store.test.ts`、`test/runtime-core/tools.test.ts`、`test/pi-adapter/injected-runtime.test.ts`、`test/编排/shell-authorized-routine.test.ts`、`test/测试/g4-skill-verify/b-render-double-check.test.ts` |
| 其他既有漂移（与本功能无关） | 14 | `test/桌面应用/renderer.test.ts`(4)、`test/桌面应用/runtime-ui.test.ts`、`test/桌面应用/markdown.test.ts`、`test/测试/g2-verify/*`(3)、`g4v2-mcp-verify/k-scope-audit.test.ts`、`test/codex-adapter/electron-launch.test.ts`(2)、`test/runtime-core/tools.test.ts`(abort 时序)、`test/claude-adapter/session.test.ts` |

## 五、修正的既有测试（语义变更导致失效）

| 文件 | 旧断言 | 新断言 |
| --- | --- | --- |
| `test/测试/existing-project-compat-verify/a-state-preview.test.ts` A2 | 假 pin 的 `.ans` 仍为 `present` | 改用新增夹具 `writeRealPinnedAns`（真实哈希）→ `present`；并新增「列举前后目录树/mtime 不变」 |
| 同文件 A13 | 坏 pin 的 `.ans` 仍为 `present`（文档化限制） | 坏 pin → `pin-mismatch` + `pinCount`/`pinFiles` 明细；`resolveBoundarySection("su")` 仍 `accepted:false`、写入仍被拒（覆盖未删除，只改为新契约） |
| `test/测试/existing-project-compat-verify/e-contract-wiring.test.ts` E2 | 渲染侧只认 `present/missing/invalid` 三态正则 | 渲染侧 `knownGovernanceStates` 恰为四态（含 `pin-mismatch`），保留「不使用 ipcRenderer」「状态原样落 state」断言 |

未发现同目录其他受影响用例（修正前全跑：42 例中 3 红，修正后 42/42）。

## 六、未覆盖项

- **真实 Electron / 真实桌面进程**：本套件直接装配 `createDesktopInterface` 与 Pipeline 公共出口，不经 Electron 主进程、preload 与真实 IPC；渲染侧状态行/空态/预览分支由桌面UI 属主测试覆盖。
- **真实模型 / 真实 su 会话**：仅用确定性桩适配器验证「不再因 pin 抛错」；真实模型轮次与客户凭据路径按纪律不代跑。
- **跨进程并发**：V1 只有进程内互斥（与 `establishGovernanceRecord` 共用集合），无跨进程全局锁；本套件未也无法在单进程内验证多实例并发。
- **写入阶段失败注入（AC11）**：机制未暴露故障注入缝，由编排套件覆盖。
- **不可读文件 / manifest 不可读（AC17）**：Windows 非管理员下构造稳定「存在但不可读」成本高，本套件未覆盖；`missing` 与 `unparseable` 已覆盖。

## 七、缺陷与观察

- **未发现实现缺陷**。AC1–AC10 与 AC12 的端到端断言全部通过；重新接受的写入边界、pin 保序、roles/source 不变、manifest 留痕与零副作用均与评审 §5.2/§5.3/§六 一致。
- 环境观察（非产品缺陷）：本机 Windows + 中文路径下，Node `fs.rmSync(<单个文件>)` 出现「无报错且未删除」的异常行为；同一路径 `fs.unlinkSync` 正常。本套件夹具已改用 `unlinkSync` 并加注释；该行为不影响产品代码（产品写路径为 temp + rename）。
- 类型门观察：本机缺少 `@anthropic-ai/claude-agent-sdk`、`zod`、`@modelcontextprotocol/sdk`，`npm run typecheck` 的 85 错全为既有依赖缺件；本批改动文件 0 错。若需类型门 0 错，应由装配角色补装依赖后复跑，不属测试角色可改范围。

## 八、复跑

```bash
node --test "test/测试/existing-project-compat-verify/*.test.ts"
node --test "test/测试/governance-pin-recovery-verify/*.test.ts"
node --test "test/**/*.test.ts"          # 三层 glob，禁止两层
npm run typecheck
```

本批两目录 53/53；全量 2314/2216/95/3；typecheck 85（本批 0）。未 commit/push。
