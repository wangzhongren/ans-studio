# 候选身份、环境与命令记录（独立验收证据）

本文件由独立验收角色在最终候选上生成；下列命令均由本角色实际执行，计数与退出码取自本机原始输出。同目录 `01`–`10` 为原始日志/探针脚本，SHA-256 见文末。

## 1. 候选身份

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD（最终候选） | `ea0fff0e4a334012a5eef02924fb5e0c3547fa66`（`ea0fff0 feat(governance): require Steward to request acceptance on completion`） |
| 基线（对比） | `182a631dde83a866416a098faf72700be5472c09`（main 合并点） |
| 提交链 | `182a631` → `c7c3f0e` → `4d415db` → `ea0fff0`（线性，无 merge） |
| 验收时工作树 | HEAD 之外仅有未跟踪 `demos/`（他任务）与本角色证据目录；无 tracked 修改 |
| 候选冻结时间 | 2026-10-26 10:34（+08:00）前后；此后工作树无 tracked 漂移 |

候选在验收期间发生过一次**范围扩展**：协调端在 10:30 追加第三笔提交 `ea0fff0`（前两笔为 `c7c3f0e`、`4d415db`）。本报告与全部原始日志均在最终 HEAD `ea0fff0` 上重新采集；`4d415db` 时点的旧日志未作为本报告证据。

## 2. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（win32 x64） |
| Node | v24.22.1（绝对路径 `C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`） |
| npm | 11.19.1 |
| 执行方式 | Git Bash；`PATH` 前缀仅含 Node 安装目录与系统目录；未使用 PowerShell |
| 工作目录 | 工作树根（未进入主仓库或其他 worktree） |

## 3. 变更范围（`git diff 182a631..HEAD`）

7 个文件，+708/−62（`--numstat` 求和；`--summary` 无重命名/模式变化，`--check` exit 0）。

| 文件 | +/− | 归属提交 |
| --- | --- | --- |
| `app/desktop/interface.ts` | +73/−35 | `4d415db` delivered 唤醒去重 |
| `src/common/编排/team-plan.ts` | +14/−6 | `c7c3f0e` V11 放宽 |
| `src/common/门禁引擎/governance-roles.ts` | +72/−10 | `c7c3f0e`（Steward/Crew 卡文本）+ `ea0fff0`（Steward request_acceptance 卡文本） |
| `test/桌面应用/acceptance-dispatch.test.ts` | +104/−4 | `4d415db` |
| `test/编排/team-plan.test.ts` | +146/−0 | `c7c3f0e` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | +155/−5 | `c7c3f0e` |
| `test/门禁引擎/governance-trio.test.ts` | +144/−2 | `c7c3f0e` + `ea0fff0` |

逐提交：`c7c3f0e` 5 文件 +375/−23；`4d415db` 2 文件 +177/−39；`ea0fff0` 2 文件 +157/−1。无产品源码之外的配置/文档/i18n 改动；无新增/删除文件。

## 4. 命令与真实计数

所有命令退出码与计数如下；原始日志见同目录对应文件。

| # | 命令 | 时间（+08:00） | 退出码 | 真实输出 | 日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 10:31 前 | 0 | 无诊断（`tsc --noEmit`） | 未保留 stdout（空） |
| 2 | `node --test "test/门禁引擎/**/*.test.ts"` | 10:31:29 | 0 | 325 tests / 324 pass / 0 fail / 1 skip | `01_gate-engine.log` |
| 3 | `node --test "test/编排/team-plan.test.ts"` | 10:31:33 | 0 | 32 tests / 32 pass / 0 fail | `02_team-plan.log` |
| 4 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | 10:32:04 | 0 | 67 tests / 67 pass / 0 fail | `03_acceptance-dispatch.log` |
| 5 | `node --test "test/桌面应用/**/*.test.ts"` | 10:33:10 | 0 | 640 tests / 640 pass / 0 fail / 0 skip | `04_desktop-full.log` |
| 6 | `node --test "test/测试/governance-e2e-auto/*.test.ts"`（第 1 次） | 10:33:27 | **1** | 155 tests / **154 pass / 1 fail** | `05a_governance-e2e-run1-flaky-fail.log` |
| 7 | `node --test "test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts"`（隔离复跑） | 10:33:41 | 0 | 10 tests / 10 pass / 0 fail | `05d_triage-e2e-isolated-pass.log` |
| 8 | 全量第 2 次（复跑） | 10:34:00 | 0 | 155 tests / 155 pass / 0 fail | `05b_governance-e2e-run2-pass.log` |
| 9 | 全量第 3 次（复跑） | 10:34:18 | 0 | 155 tests / 155 pass / 0 fail | `05c_governance-e2e-run3-pass.log` |
| 10 | `node --test "test/门禁引擎/governance-trio.test.ts"`（焦点） | 10:34:40 | 0 | 46 tests / 46 pass / 0 fail | `09_governance-trio-46.log` |
| 11 | `node --test "test/门禁引擎/governance-standard-workflow.test.ts"`（焦点） | 10:34:41 | 0 | 25 tests / 25 pass / 0 fail | `10_governance-standard-workflow-25.log` |

跳过的 1 例（`01_gate-engine.log` 第 240 行）：`unreadable（权限）：文件不可读 → status=unreadable、actual=null`，属 Windows 下 chmod/权限语义不可用的平台跳过，非本批改动。

### 4.1 首跑 flaky 记录（必须保留）

第 1 次全量 e2e 唯一失败：`acceptance-triage-e2e.test.ts` 的
`R2 request_acceptance：pending 标准步骤收口为 done（artifact 证据）；首次 dispatched、重复 already-dispatched`
首请求返回 `code=already-dispatched`（“该流程当前版本已派发验收复核（运行期去重）”），而断言期望 `code=dispatched`。

判定为 **flaky，与本批三笔提交无关**：
- 该文件隔离复跑 10/10 通过；全量复跑 2 次均 155/155 通过；
- 该用例走的是 main `bda65f4` 已合入的 `request_acceptance` 应用通道，本批三笔提交未改 `app/desktop/interface.ts` 的该路径（第三笔只改角色卡文本与卡文本测试）；
- 失败形态是测试内“应用自动验收门先于显式请求派发”的时序竞争，属测试并发负载下的既有脆点。
保留原始失败日志，未用作通过证据；本报告 e2e 结论按隔离 + 两次全量复跑判定，并单列此 flaky。

## 5. 独立探针

| 探针 | 结果 | 文件 |
| --- | --- | --- |
| V11 行为 6 例：含/不含 build-scaffold、未知 id、缺 contract-freeze、漏依赖角色、可选不强制 | 6/6 断言通过，exit 0 | `06_v11-probe.mjs` |
| 注册表结构对比（基线 `182a631` vs HEAD）：id 列表、displayName、function、entries、preauthorizedDirs、forbiddenWritePaths、capabilities 全等；具名常量全等；仅 nominator/convener cardText 变化 | 全等断言通过，exit 0 | `07_governance-registry-compare.mjs` |
| A8 卡文本与冻结回执枚举：9 个 code 与 `tools.ts` 的 `REQUEST_ACCEPTANCE_CODES` 一致；既有自动验收门语句逐字保留；仅 Steward 卡定义该通道 | 全部通过，exit 0 | `08_a8-request-acceptance-probe.mjs` |

`07` 的基线模块取自 `git archive 182a631 src package.json` 解包到临时目录（并复制 `node_modules/yaml` 供其解析依赖），不属于产品工作树。

## 6. 证据文件 SHA-256

```
2c3745e88f29c212c84a8bb5f379fac8d79b011ca0a322dcf8834720cb416e93  01_gate-engine.log
e6ca8036436e188403a7048b78532103c490b9e1a8440caf6b6a2b1ef0d76618  02_team-plan.log
249852b41be6e9701e814cbf31557444a844277b068b5f9c517b0c67d5bd6ec3  03_acceptance-dispatch.log
b076522762aec460320fc92ec5acf283307882a5b096f375648bcad36607685f  04_desktop-full.log
a3dac0779b254dd39756a42fa27f09b75e8eff900ee808596c1cc9035027bd56  05a_governance-e2e-run1-flaky-fail.log
f1d5c9a418e11237ba0cc621db081955880b88128ab16f3c131a3e1a5f694656  05b_governance-e2e-run2-pass.log
95420969a95af1cc63386fc11bd059128673c2cb58e5bae90b1ff84abb989bb4  05c_governance-e2e-run3-pass.log
e47015795a8f6ebe6eab139be49eb96b3d013498207bf0c4aa78a83e7e0bfc53  05d_triage-e2e-isolated-pass.log
4b0f0368b0a7c5f1201683b4f383d36c09d06d67ec2fc916d6ba8a31401d8316  06_v11-probe.mjs
67f71d24313f41d6acdff065b1768a81a81f325429217aaabe4cfea9c40c0485  07_governance-registry-compare.mjs
a286ec961fd262e005edb0bd5dcb1618e6f38611f27a4727299670e9e7f49f99  08_a8-request-acceptance-probe.mjs
e928ea5911d4b77077a1d9fa78d4465b33639ec8c479da72e444a17ee37a335b  09_governance-trio-46.log
90e6c8ab6a3d1d638330fb259aaaa95c8050d30d544e3fdd01d9af96b085e11e  10_governance-standard-workflow-25.log
```
