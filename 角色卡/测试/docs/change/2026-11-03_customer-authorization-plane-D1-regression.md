---
id: customer-authorization-plane-d1-regression
type: change
title: 客户授权平面 D1 跨层集成与 T3 全量回归
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - customer-authorization-plane-b0-baseline
  - customer-authorization-plane-a1-implementation
  - customer-authorization-plane-a2-implementation
  - customer-authorization-plane-a3-implementation
  - customer-authorization-plane-b1-implementation
  - customer-authorization-plane-c1-implementation
  - customer-authorization-plane-c2-implementation
events:
  - date: "2026-11-03"
    kind: created
    summary: D1 候选 52 文件逐哈希核对（0 写集外）、新增跨层集成 6/6、五组受影响套件与 i18n-guard、T3 全量 403 文件/3623/3596/9/18、双端 typecheck 与 build:renderer 均 exit 0
---

# 客户授权平面 D1：跨层集成与 T3 全量回归

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：测试（worker，固定测试角色；本上下文只承担该角色）/ 团队计划 §5.1 **D1（跨层集成与回归）**。
- **日期 / 状态**：2026-11-03；**`implemented-unverified`**。本记录只记录 D1 实际执行与证据，**不判验收、不判通过/返工**；AC 判定属独立验收 E2。
- **一句话事实**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；A1/A2/A3/allowlist/B1/C1/C2 的 **52 个候选文件逐文件 `git hash-object` + SHA-256 与实现记录一致（0 写集外、0 缺失、0 不匹配）**；D1 新增 1 个跨层集成测试（6/6 pass）；五组受影响套件 + i18n-guard 合计 **2150 tests / 2137 pass / 4 fail / 9 skipped / 0 todo**（4 项均为既有 Windows symlink EPERM）；T3 全量 **403 文件 / 3623 tests / 3596 pass / 9 fail / 18 skipped / 0 todo，exit 1**（9 失败与 18 skip 与 B0 逐项相同，**新增确定性失败 0、新增 skip 0**）；`npm run typecheck`、`typecheck:renderer`、`build:renderer` 均 **exit 0**；未 commit/push、未启动 Electron/E2E、未接触客户。

---

## 一、输入与版本（只读实测）

| 输入 | 派发引用 | D1 读取时点实测 | 说明 |
| --- | --- | --- | --- |
| 团队计划 | 675 / `4545d3a5…`（v1 653/`37e6bd0d…` + §十三/§十四） | **675 行 / `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671`** | 一致；§十三 C2 写入 `ConfirmCard.tsx`/`shell.css`，§十四 allowlist 增补均纳入核对 |
| V1 验收标准 | 1171 / `51ac0f50…` | **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`** | 一致 |
| P1 复审 | 397 / `3faef8ee…` | **397 行 / `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`** | 一致（`recommend approval`） |
| B0 基线 | 239 / `f1c54f09…` | **239 行 / `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441`** | 一致 |
| A1 实施记录 | 165 / `b659c14f…` | **165 行 / `b659c14f7139ec53d2fdb4a062d3a069ada615fba05bf7f8a0bd0b60d6bf9ebd`** | 一致 |
| A2 实施记录 | 88 / `c6fa3d2c…` | **88 行 / `c6fa3d2cc6f518d77c995c56fd38d1eb9eb628c428d72de5e71d6b487d186447`** | 一致 |
| A3 实施记录 | 135 / `51dcf2fd…` | **135 行 / `51dcf2fdc0ce9a90e9ab59c89e66a8e2223e482d6ae3f4b7babff589ccaa2367`** | 一致 |
| B1 实施记录 | 172 / `db0ecf35…` | **172 行 / `db0ecf35f4ef500158ac02d915918ab05a156f2153f3b4e400e787ef8f48e7b5`** | 一致 |
| C1 实施记录 | 208 / `966cba43…` | **208 行 / `966cba43dff59d127c86602981da6ee170e6447ab4a4b8df6f0dfbee469fefc6`** | 一致 |
| C2 实施记录 | 176 / `dc8bcca4…` | **176 行 / `dc8bcca40631985a32cfe7e7a4b9b50323c4bc4580e18432779e78b8ab1481ba`** | 一致 |
| i18n allowlist 增补记录 | 未在派发引用 | **91 行 / `a92aa7da7c2ccf95d2f931d8e7172445ca4e943b302f13703c78787dc16c3ca2`** | 按团队计划 §十四补核 |

原始观测见 `10-input-versions.txt`。

---

## 二、候选身份与写集闭合

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 分支 / HEAD | `git branch --show-current`；`git rev-parse HEAD` | `feat/customer-authorization-plane` / `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（与派发一致） |
| 产品/测试状态（D1 前） | `git status --porcelain -- src app test` | **48 个 status 条目**，展开为 **52 个文件**（`src/provider/directive/` 3 文件、`src/service/directive/` 3 文件由目录条目展开） |
| 暂存区 | `git diff --cached --name-only` | **空** |
| 写集核对 | 逐文件 `git ls-files -m -o --exclude-standard -- src app test` + `git hash-object` + SHA-256，与 A1/A2/A3/allowlist/B1/C1/C2 记录比对 | **52/52 匹配；unexpected 0 / missing 0 / mismatch 0**（`01-candidate-identity.txt`） |
| D1 新增 | `test/测试/customer-authorization-plane-integration.test.ts` | 属测试角色目录授权；D1 后总候选 **53 文件**，复查仍 **0 unexpected / 0 missing / 0 mismatch**（`07-post-run-verification.txt`） |
| 配置与锁 | `git status --porcelain -- package.json package-lock.json tsconfig.json vite.config.ts electron-builder.yml` | **空**（未改构建/依赖/入口） |
| 构建产物 | `git check-ignore -v app/renderer/dist/index.html`；`git ls-files app/renderer/dist` | `.gitignore:9:app/renderer/dist/`；`ls-files` 空 ⇒ 忽略产物、非候选 |

逐写集归属（文件数）：

| 归属 | 文件数 | 对应团队计划 |
| --- | ---: | --- |
| A1（运行时核心 Model/解析器/测试） | 6 | §4.3 运行时核心写集 |
| A2（共享 JSONL 辅助 + 测试） | 2 | §4.3 项目管理写集 |
| A3（i18n zh/en + i18n 测试） | 3 | §4.3 项目管理写集 |
| allowlist 增补 | 1 | §十四 W-5 A |
| B1（Provider/Service/Pipeline/编排/Q9 + 测试） | 20 | §4.3 编排写集 |
| C1（桌面主进程/IPC/preload/decision 消费者/Q9 + 测试） | 11 | §4.3 桌面窗口写集；C1 记录为「新增 3 + 修改 8」 |
| C2（渲染 store/对话框/面板/Composer/ConfirmCard/CSS + 测试） | 9 | §4.3 桌面UI写集 + §十三 `ConfirmCard.tsx`/`shell.css` |
| **合计（D1 前）** | **52** | 全部在写集内 |

- **口径说明（事实披露）**：派发文字写「C1 10」，实际 C1 候选为 **11**（`app/desktop/directive-input.ts` + `interface.ts`/`session.ts`/`customer-input.ts`/`requirement-change.ts`/`main.ts`/`preload.cjs` + 2 个新测试 + `run-change.test.ts`/`version-decision.test.ts`），与 C1 实施记录 §2「新增 3 + 修改 8」一致，均在团队计划 §4.3 C1 写集内；未发现写集外产品/测试改动。
- 候选哈希全表（逐文件 `git hash-object` + SHA-256）见 `01-candidate-identity.txt`；D1 新增文件：`726 行 / git hash-object e60cdb64bc7984cb2113300a00429b1f4e336bea / SHA-256 57b3b9d94390f218dcb84d50f8b917bc25a55f179f7c967acb48b640f85bc899`。
- 未修改/未回退任何 A1/A2/A3/B1/C1/C2 候选；D1 只新增自身测试与证据。

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| Node / npm | `v24.22.1` / `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `5.3.15(2)-release` |
| 时区 | Asia/Shanghai（记录时间 +08:00） |
| worktree | `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane` |
| 依赖 | `node_modules` 存在（B0 已 `npm ci`）；Electron 包 44.7.0、二进制存在 |
| Electron / E2E | **未启动应用、未运行 e2e、未截图**（D2 范围） |
| `app/renderer/dist` | 存在、被忽略、非候选 |

`00-environment.txt`。

---

## 四、跨层集成测试（新增）

- **路径**：`test/测试/customer-authorization-plane-integration.test.ts`（726 行）。
- **命令**：`node --test --test-concurrency=1 test/测试/customer-authorization-plane-integration.test.ts`
- **结果**：**6 tests / 6 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo，exit 0**，test duration 465.2510 ms（wrapper 525 ms；最终候选）；原始日志 `02-integration-test.log`。
- **真实依赖**：A1 `parseDirectiveMarker`/`directiveHighRiskReasons` 类型与常量、A2 `jsonl-ledger`、B1 Provider（文件账本）、Service、Pipeline `createCustomerDirectiveRuntime`、C1 `createDirectiveInputController`（presenter 替身）、`createShellGate`（`takeDirective` 注入）、`createCustomerInputChannel`（decision 消费者）、`task-state`、`version-decision`、`run-manifest`。未启动 Electron、未触网、未写真实 userData（临时目录）。
- **覆盖与用例**：

| # | 用例 | 覆盖 |
| --- | --- | --- |
| 1 | 创建→facts 快照：审批/决策分列、target 隔离；shell 闸只消费审批、decision 卡只消费决策 | 指令创建、回执、`approvalFacts`/`decisionFacts` 快照、target 隔离、shell gate allow、`once` durable 消费、第二次回落 operator、decision 代选 |
| 2 | shell 闸：deny 先于 c=allow；allow 在既有审批链之前；撤销后回落 c=allow | 审批 deny/allow 顺序、审计 `directive:{id,scope}`、`by:"directive:<id>"`、撤销回执与列表、`once`/`session` 语义 |
| 3 | decision 消费者：拒绝结算 declined；冲突绕过默认推荐 | decision reject、冲突不消费、呈现客户卡、系统说明行、人工应答收口 |
| 4 | session 重启：新 sessionId 下 session `app-restart`、未用 once `unused-once` | 重启失效、过期视图、shell 闸不再放行 |
| 5 | 坏账本：facts 为空且 `ledgerErrors>0`；shell 回既有链、decision 走默认推荐 | 坏行 fail-safe、不伪造回执/空账本、主路径不受阻 |
| 6 | Q9 归属：`directive:<id>` 解析；task-state 与 run manifest 接受 `directive` + `directiveId` | `request.resolved.by`、`version.decision.decidedBy`、run manifest `decidedBy`、`collectResolvedWithoutExecution`、`applyRunChange` 缺 id 拒绝 |

- **过程披露**：集成用例草稿首次运行 2 个断言失败（撤销回执需传 `roleId`；Q9 未执行列表要求 `selectedOptionIds` 为版本决策动作），均为 D1 测试期望修正，不是产品缺陷；修正后 6/6。未改动任何产品代码或他人测试。

---

## 五、受影响套件（逐组 `node --test --test-concurrency=1`）

| # | 组 | 命令（glob 逐字） | 文件数 | 起止（+08:00） | tests | pass | fail | cancelled | skipped | todo | 退出码 | 对照基线 | 原始日志 |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| A | 运行时核心 | `node --test --test-concurrency=1 "test/runtime-core/*.test.ts"` | 39 | 16:38:07–16:38:59 | 309 | 302 | **3** | 0 | 4 | 0 | 1 | B0 282/275/3/4；A1 后 309/302/3/4 | `03a-suite-runtime-core.log` |
| B | 编排 | `node --test --test-concurrency=1 "test/编排/*.test.ts"` | 57 | 16:39:05–16:39:20 | 737 | 736 | **1** | 0 | 0 | 0 | 1 | B0 694/693/1/0；B1 后 737/736/1/0 | `03b-suite-orchestration.log` |
| C | 桌面应用 | `node --test --test-concurrency=1 "test/桌面应用/*.test.ts"` | 55 | 16:39:26–16:40:37 | 522 | **522** | 0 | 0 | 0 | 0 | 0 | B0 498/498；C1 后 522/522 | `03c-suite-desktop-app.log` |
| D | 桌面UI | `node --test --test-concurrency=1 "test/桌面UI/*.test.ts"` | 53 | 16:40:43–16:40:50 | 401 | **401** | 0 | 0 | 0 | 0 | 0 | B0 374/374；C2 后 401/401 | `03d-suite-desktop-ui.log` |
| E | 项目管理 shared | `node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"` | 11 | 16:40:57–16:41:05 | 175 | 170 | 0 | 0 | 5 | 0 | 0 | B0 158/153/0/5；A2/A3 后 175/170/0/5 | `03e-suite-project-shared.log` |
| F | i18n guard | `node --test --test-concurrency=1 "test/项目管理/shared/i18n-guard.test.ts"` | 1 | 16:41:10–16:41:10 | 6 | 6 | 0 | 0 | 0 | 0 | 0 | §十四 6/6（`scanned=136 allowlisted=21 violations=0`） | `03f-suite-i18n-guard.log` |
| **合计** | — | — | **216** | 16:38:07–16:41:10 | **2150** | **2137** | **4** | **0** | **9** | **0** | — | — | — |

- 4 项失败全部为 B0 同名同因的既有 Windows symlink `EPERM`：runtime-core 3（`file-write-safety.test.ts:97`、`session-store.test.ts:46/58`）、编排 1（`shell-authorized-routine.test.ts:184`）。新增确定性失败 **0**。
- 9 项 skip 均为既有平台项（runtime-core 4 + 项目管理 shared 5）；新增 skip **0**。
- 桌面应用 e2e 未运行；桌面UI `.mjs` 冒烟未运行（D2 范围）。

---

## 六、T3 全量回归

实际命令（`run-t3.sh` 内逐字；worktree 命令守卫拒绝交互式命令替换，按 B0 既有做法用证据脚本原样执行并在日志头打印命令）：

```
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)
```

| 项 | 实测值 |
| --- | --- |
| 文件数 | **403**（`test/**/*.test.ts` 共 404；排除 `write-sequencing.test.ts`；清单 `04-full-t3-file-list.txt`，403 行 / SHA-256 `ccabf2f3d0638068298acfb2025e6aad111e33830772eb5c59c87ca65b44a04c`） |
| 起止（+08:00） | 16:47:09–16:51:31 |
| 耗时 | **262,218.1807 ms ≈ 4 分 22 秒** |
| 退出码 | **1**（因 9 项既有环境失败；非运行错误） |
| 计数 | **tests 3623 / pass 3596 / fail 9 / cancelled 0 / skipped 18 / todo 0** |
| 失败分类 | 9 项全部既有 Windows symlink `EPERM`，file:line + 测试名与 B0 **逐条相同**；新增确定性失败 **0** |
| skip | 18 项既有平台 skip，与 B0 分类一致；新增 **0** |
| 原始日志 | `04-full-t3.log`（4,732 行 / 528,917 B）；分类 `05-failure-classification.txt` |

与 B0（393 文件 / 3479 / 3452 / 9 / 18）对照：

| 指标 | B0 | D1 | 差 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 文件数 | 393 | 403 | **+10** | A1 +2、A2 +1、B1 +2、C1 +2、C2 +2、D1 +1 |
| tests | 3479 | 3623 | **+144** | A1 +27、A2/A3 +17、B1 +43、C1 +24、C2 +27、D1 +6 |
| pass | 3452 | 3596 | **+144** | 同上 |
| fail | 9 | 9 | **0** | 逐项同名同因 |
| skipped | 18 | 18 | **0** | 同类既有平台项 |

排除项（不当作通过）：`test/pi-adapter/write-sequencing.test.ts` —— 仓库既知挂起（历史记录 39+ 分钟无进展、CPU 约 2339s），排除依据 B0 记录、团队计划 §6.3 与 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`；本轮未运行、行为未验证。

---

## 七、静态/构建门

| # | 命令 | 起止（+08:00） | 耗时 | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 16:46:08–16:46:11 | 2.2 s | **0** | 0 类型错误 | `06a-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 16:46:29–16:46:30 | 0.9 s | **0** | 0 类型错误 | `06b-npm-run-typecheck-renderer.log` |
| 3 | `npm run build:renderer`（`vite build`） | 16:46:35–16:46:43 | 8.6 s（vite 自报 4.99 s） | **0** | 2799 modules transformed；仅有既有 chunk 体积/动态导入警告 | `06c-npm-run-build-renderer.log` |

- **过程披露**：首次 `npm run typecheck`（新增集成测试草稿后）exit 1，6 个错误全部在本 D1 测试文件（`reply.error` 可空、`CustomerInputOutcome` 可空实参），无产品代码错误；仅修正 D1 自身类型标注/测试辅助后复跑 **exit 0**。未改产品代码、未改他人断言、未放宽规则。
- `app/renderer/dist/` 为忽略产物：`git check-ignore` 指向 `.gitignore:9`；`git ls-files app/renderer/dist` 为空，非候选。

---

## 八、纪律与限制

1. **未 commit / 未 push / 未 merge / 未 release**；`git diff --cached --name-only` 为空。
2. D1 只写 `test/测试/customer-authorization-plane-integration.test.ts` 与 `角色卡/测试/docs/change/` 证据；**未修改任何产品代码、其他角色测试/文档、构建配置、角色卡或边界**。
3. 未修改断言以保绿、未新增 skip、未删除测试；既有 9 项 symlink EPERM 与 18 项 skip 按 B0 分类，不当作通过、不计为新增。
4. **未运行 D2**：未启动真实 Electron、未跑 `test/桌面应用/e2e/main.mjs`、未截图；D2 真实运行证据不在 D1 范围。
5. T3 在最终候选上重跑（集成测试类型收口后）；`04-full-t3.log` 为最终候选结果。
6. 本记录不是验收结论；最终 AC 判定由独立验收 E2 按 V1 给出。
7. 证据目录 `2026-11-03_customer-authorization-plane-D1-evidence/` 共 **28 个文件**；`08-evidence-hashes.txt`（32 行 / SHA-256 `97418fbbe67cbdcf1e5b74d1b8837f89210f383580625fea5b0f2accf74f6da6`）逐文件记录行数、字节与 SHA-256。

---

## 九、证据清单（关键项）

| 文件 | 行数 | SHA-256 | 用途 |
| --- | ---: | --- | --- |
| `00-environment.txt` | 13 | `ef7b0429…` | Node/npm/OS/Shell/HEAD/Electron 事实 |
| `01-candidate-identity.txt` | 126 | `530ea2c6…` | D1 前 52 候选逐文件哈希与写集闭合 |
| `02-integration-test.log` | 21 | `56cdd857…` | 跨层集成 6/6 原始输出（含命令/耗时/退出码） |
| `03a-suite-runtime-core.log` | 375 | `4cd23a27…` | 309/302/3/4 |
| `03b-suite-orchestration.log` | 1320 | `668878e9…` | 737/736/1/0 |
| `03c-suite-desktop-app.log` | 550 | `e61e01ea…` | 522/522 |
| `03d-suite-desktop-ui.log` | 416 | `36a79884…` | 401/401 |
| `03e-suite-project-shared.log` | 193 | `ff21c5df…` | 175/170/0/5 |
| `03f-suite-i18n-guard.log` | 22 | `f2fa92af…` | 6/6，`allowlisted=21 violations=0` |
| `04-full-t3-file-list.txt` | 403 | `ccabf2f3…` | T3 文件清单 |
| `04-full-t3.log` | 4732 | `12afa68f…` | T3 原始日志 |
| `05-failure-classification.txt` | 85 | `92e47903…` | 9 失败 / 18 skip / 排除项 |
| `06a-npm-run-typecheck.log` | 12 | `92a56afa…` | exit 0 |
| `06b-npm-run-typecheck-renderer.log` | 12 | `31b3f3ea…` | exit 0 |
| `06c-npm-run-build-renderer.log` | 30 | `0e0c0969…` | exit 0 |
| `07-post-run-verification.txt` | 129 | `c484e6e2…` | D1 后 53 候选复查（0/0/0） |
| `09-static-scope.txt` | 96 | `914fc23a…` | staged 空、配置未变、dist 忽略 |
| `10-input-versions.txt` | 15 | `fcd22688…` | 输入文档版本 |

完整哈希索引见 `08-evidence-hashes.txt`。

---

## 十、D1 出口事实（只报事实，不判验收）

- 候选身份与写集：**52/52 精确匹配、0 写集外**；D1 后 53 文件复查仍 0/0/0（§二）。
- 跨层集成：**6/6 pass，exit 0**（§四）。
- 受影响套件：**2150 tests / 2137 pass / 4 fail / 9 skip**；4 项均为既有 Windows symlink EPERM；新增确定性失败 0、新增 skip 0（§五）。
- T3 全量：**403 文件 / 3623 tests / 3596 pass / 9 fail / 18 skip / 0 todo，exit 1**；失败与 skip 与 B0 逐项一致；新增确定性失败 0、新增 skip 0（§六）。
- 静态/构建：`typecheck` / `typecheck:renderer` / `build:renderer` 均 **exit 0**（§七）。
- 未 commit/push；未跑 D2；本记录不判验收。
- **记录版本**：本记录最终 **231 行**（`wc -l`，含本行）；SHA-256（不含本行，可复算：`head -n -1 <本文件> | sha256sum`）：`e56bf33655c1704a28878eb4cfda0615b8c12ceda0afbe27ad84b2876c53034f`。
