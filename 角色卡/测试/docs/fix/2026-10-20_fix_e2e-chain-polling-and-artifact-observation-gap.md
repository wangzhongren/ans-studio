---
id: e2e-chain-polling-and-artifact-observation-gap
type: fix
title: E2E 链式轮询注入短时限（修复测试文件挂起）+ artifact 观察缺口只读复现（测试角色）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: verified
related: [governance-chain-polling, artifact-observed, flow-state-yaml]
events:
  - date: "2026-10-20"
    kind: fixed
    summary: fixture.makeHarness 注入 governanceChainOptions 短轮询（10ms/3000ms/10ms），b/c 两个文件从约 485s 挂起恢复到 0–1s 全绿；test/测试 786/786（17s）、全仓 3268/3266/0/2（30s）、typecheck 0。只读探针复现 test/ 下证据文件不产生 artifact.observed 的产品缺口并上报，未改产品。
---

# E2E 链式轮询短时限 + artifact 观察缺口复现

## 结论

- **测试文件挂起修复**：`fixture.ts` 的 `makeHarness` 现在向 `createDesktopInterface` 注入
  `governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 3000, settledGraceMs: 10 }`（可按场景覆盖）。
  `b-proposal-accept-timing` 与 `c-appointment-timing` 从「单场景通过但文件约 485s 后才失败」恢复为
  **0–1 秒完成、2/2 全绿**。
- **强断言未放宽**：Convener 恰一次、流程 YAML 落盘后才派 Nominator 等全部保留。
- `test/测试/**`：**786/786，0 红，17s**；全仓 `test/**`：**3268 计 / 3266 过 / 0 红 / 2 skip，30s**；typecheck **0**。
- **只读复现产品缺口（未改产品）**：写在 `test/evidence/...` 下的验收证据不会产生 `artifact.observed`
  （扫描只覆盖内置治理角色的 `preauthorizedDirs`）；`nomination` 若被流程作者写成 `kind: dispatch`，
  账本不会有 `dispatch.accepted stepId=nomination`，收尾门如实阻塞。

## 1. 轮询注入

### 根因

桌面 2026-10-20 把链式推进改为「有界轮询目标事实」（流程状态 YAML 落盘 / 任命角色卡出现），
缺省 `pollIntervalMs=500`、`timeoutMs=15min`、`settledGraceMs=2s`。离线 E2E 的脚本轮次在毫秒级完成，
但这些真实定时器在用例结束后仍持有等待，导致测试文件进程被拖住（实测约 485s 后才失败/退出），
而单个场景本身全部通过。

### 修复（仅测试夹具）

`test/测试/governance-e2e-auto/fixture.ts`：

- `HarnessOptions` 新增 `governanceChain?: { pollIntervalMs?; timeoutMs?; settledGraceMs? }`；
- `createDesktopInterface({ ..., governanceChainOptions: options.governanceChain ?? { pollIntervalMs: 10, timeoutMs: 3000, settledGraceMs: 10 } })`。

短时限对离线夹具足够：脚本写 YAML/角色卡在毫秒级；负向场景靠 `settledGraceMs:10` 快速如实失败；
特殊慢场景可按需传 `governanceChain` 覆盖。产品侧已有 timer `unref`，短时限进一步保证文件不被挂住。

### 复跑（真实输出）

| 命令 | 耗时 | 结果 |
| --- | --- | --- |
| `node --test test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | **0s** | 2/2 过 |
| `node --test test/测试/governance-e2e-auto/c-appointment-timing.test.ts` | **1s** | 2/2 过 |
| `node --test "test/测试/**/*.test.ts"` | **17s** | 786/786，0 红 |
| `node --test "test/**/*.test.ts"` | **30s** | 3268 计 / 3266 过 / 0 红 / 2 skip |

## 2. artifact 观察缺口（只读探针，已删除）

### 探针方法

在临时 trio 项目中打开 verifier 会话，`onPrompt` 时直接向磁盘写两个 `.md`：

- `docs/verification/probe-v1.md`（verifier 的预授权目录内）
- `test/evidence/probe/verification-v1.md`（`test/` 下）

等本轮 settle（artifact 扫描在 settle 时执行）后读账本；再用一份含
`nomination(done, kind dispatch)` 与 `verification-evidence(done, kind artifact,
ref=test/evidence/probe/verification-v1.md)` 的 Flow YAML 调 `evaluateFlowCompletion`。

### 实测输出

```
OBSERVED: ["docs/verification/probe-v1.md"]
COMPLETION: {"ready":false,"issues":[
  "步骤 nomination：账本缺少 dispatch.accepted（flowId=flow-a，stepId=nomination）（steps[1].evidence）",
  "步骤 verification-evidence：账本缺少 artifact.observed（path=test/evidence/probe/verification-v1.md）（steps[2].evidence）"
]}
```

### 结论与根因（产品缺口，未修改）

1. **artifact 扫描面**：`src/pipeline/orchestration/run-role.ts` 的 `scanPreauthorizedArtifacts` 只递归扫描
   内置治理角色的 `preauthorizedDirs`（verifier 为 `docs/verification/`、`docs/governance/verifier/`），
   且只收 `.md`。`test/evidence/...` 不在任何内置预授权目录内 ⇒ 永不产生 `artifact.observed`，
   引用该路径的 `artifact` 证据步骤永远无法完成（收尾门/验收门如实阻塞）。真机现象
   `verification-evidence done 但无 artifact.observed` 与此一致。
2. **nomination 证据类**：若流程作者把 `nomination` 步骤写成 `kind: dispatch`，按契约需要
   `dispatch.accepted{stepId:"nomination"}`；但提名由客户决定/任命流程产生，应用不派发 nomination。
   正确写法应为 `kind: customer-decision` + `evidence.ref: appointment`（或产品在迁移/校验时给出更明确的
   指引）。当前只报告，不自行改产品。
3. 探针文件为临时件，已删除；未新增断言产品 bug 的永久用例。

## 3. 改动文件与纪律

- `test/测试/governance-e2e-auto/fixture.ts`（`governanceChain` 选项 + 短轮询默认值）
- 角色记录：本文件与 `changelog.md`
- 未 git 提交；未读 `.env`；未打印凭据；未改产品源码；未放宽任何强断言；临时探针已删除。
