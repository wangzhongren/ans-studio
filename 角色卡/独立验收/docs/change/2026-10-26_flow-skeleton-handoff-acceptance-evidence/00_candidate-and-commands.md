# 候选身份、清单与独立复跑命令（2026-10-26 流程骨架 + 交接超时回执验收）

- 角色：独立验收
- worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`
- 分支：`feat/scaffold-first-governance`
- HEAD：`99bbbe2cda3be0fcd7c8d1e72189b6f530e8387e`（未提交候选）
- 时间：2026-10-26（Asia/Shanghai）；测试与探针全部在本工作树执行
- 环境：Windows 11 Pro 10.0.26300（win32 x64）；Node v24.22.1；npm 11.19.1；Git Bash
- 判定范围：本批 A（意图交接自动创建流程骨架）+ B（handoff 超时回执不误报）。工作树同时叠加同日
  已验收/已在验的其它未提交批次（request_gate_review、decision 卡、需求变更申请、显示名等），本报告只对
  A/B 做新判定，并对 C 段做「不回归」复核。

## 候选范围

- 候选清单：`00_candidate-manifest.sha256.txt`（101 文件 = 85 tracked 改动 +5318/−887 + 16 个未跟踪批次
  文件；排除 `.claude/`、`demos/`、本角色 `角色卡/独立验收/`）。
- 清单摘要（清单文件自身的 SHA-256，逐行 `<sha256>  <path>`）：
  `08e00f764e76c2c1a6477d36b9e2ee3a173b75a114ec356b5a1761ca7d28dce5`
- 测试前后复核：候选路径集合与逐文件哈希均未变化（本角色测试不写产品/测试文件）。

## 本批 A/B 的增量文件（12 产品/测试 + 4 角色记录）

哈希为本角色验收时的实际文件（完整清单见 `00_candidate-manifest.sha256.txt`）：

| 文件 | SHA-256 |
| --- | --- |
| `src/common/编排/flow-service.ts` | `bd4714015d6eb987714d4161afc636dc37588ec3623d3047537b924abe37d692` |
| `src/pipeline/orchestration/govern-session.ts` | `3a039840d2c7e7ac0670158887c22588103d919362f0dec76521f00feba63c29` |
| `app/desktop/session.ts` | `83e8b214c4a0d360802317c0d61e1cdc194c95a051b77f6c1a7cf9feb82e48ee` |
| `app/desktop/interface.ts` | `eafb853c216ec3a447158603608fab0f00e5a24cce08f7af810e2fc85a35aa5c` |
| `app/desktop/governance-advance.ts` | `0d2a16038670360f43abef6b3bd7bffe078171f60a4991dbf5a644f7188ad84f` |
| `src/common/门禁引擎/governance-roles.ts` | `477d92e0945ec214402e02984506f41d16bc603475f6066c4093c020335e7029`（与门禁引擎 change 记录一致） |
| `test/编排/flow-service.test.ts` | `97ed94cc02fcb512b46cddc446269ccbe8f7806d7c49fdf1e661d81c55acd855` |
| `test/编排/governance-session.test.ts` | `dc5b6c736edbecb2a5c41cd2031a8b082ebcdfd5341d0944966de6c647862729` |
| `test/桌面应用/session.test.ts` | `14801bdf1eb0eaa6f12f8241d6811b42589a0c2d0d07e5591507fb20d3b51dea` |
| `test/桌面应用/interface.test.ts` | `bbc698bde1d6117bbff9a85ece3111130f9c2c20d3f75a962e20c5429bbcb198` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `edca90379d2c00f5f82415e74768f5a8d347c2353ec90fc083eda94877f5da35`（与门禁引擎 change 记录一致） |
| `test/门禁引擎/governance-trio.test.ts` | `bfe5e812b99ecec6a0d7ae344d5995152ec5175649f2d68a0d529ccb340b9859`（与门禁引擎 change 记录一致） |

角色记录（只读引用）：`角色卡/编排/docs/change/2026-10-26_change_intent-flow-skeleton.md`、
`角色卡/桌面窗口/docs/change/2026-10-26_change_intent-flow-skeleton.md`、
`角色卡/桌面窗口/docs/fix/2026-10-26_fix_intent-handoff-deadline.md`、
`角色卡/门禁引擎/docs/change/2026-10-26_change_flow-skeleton-convener-card.md`。

说明：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`governance-roles.ts` 等文件同时
承载同日更早的显示名/需求变更批次改动；本批增量以 2026-10-26 23:01–23:09 的改动与上述 change 记录为准。

## 复跑命令与结果（均为本角色实跑，日志同目录）

| # | 命令 | 退出码 | 结果 | 日志 |
| --- | --- | --- | --- | --- |
| 01 | `npm run typecheck` | 0 | 无诊断 | `01_typecheck.log` |
| 02 | `npm run typecheck:renderer` | 0 | 无诊断 | `02_typecheck-renderer.log` |
| 03 | `node --test "test/编排/flow-service.test.ts" "test/编排/governance-session.test.ts"` | 0 | 128 计 / 127 过 / 0 失败 / 1 skip | `03_focus-orchestration.log` |
| 04 | `node --test "test/桌面应用/session.test.ts"` | 0 | 47 / 47 | `04_focus-session.log` |
| 05 | `node --test "test/桌面应用/interface.test.ts"` | 0 | 140 / 140 | `05_focus-interface.log` |
| 06 | `node --test "test/门禁引擎/governance-standard-workflow.test.ts" "test/门禁引擎/governance-trio.test.ts"` | 0 | 77 / 77 | `06_focus-gate.log` |
| 07 | `node --test "test/桌面应用/**/*.test.ts"`（首跑） | 1 | **696 计 / 695 过 / 1 失败 / 0 skip**；唯一失败为既有 gate 处置用例的检查-读取时序竞争（见下） | `07_desktop-full.log` |
| 08 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"`（失败文件隔离复跑） | 0 | 95 / 95 | `08_acceptance-dispatch-rerun1.log` |
| 09 | 桌面全目录复跑 | 0 | **696 / 696 / 0 失败 / 0 skip** | `09_desktop-full-rerun1.log` |
| 10 | `node --test "test/编排/**/*.test.ts"` | 1 | **1021 计 / 1019 过 / 1 失败 / 1 skip**；唯一红＝既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:103`，文件零 diff） | `10_orchestration-full.log` |
| 11 | `node --test "test/runtime-core/**/*.test.ts"` | 1 | **354 计 / 347 过 / 3 失败 / 4 skip**；3 红均既有 Windows symlink EPERM（`file-write-safety.test.ts:97`、`session-store.test.ts:46/58`，文件零 diff） | `11_runtime-core-full.log` |
| 12 | `node --test "test/门禁引擎/**/*.test.ts"` | 0 | **347 计 / 346 过 / 0 失败 / 1 skip** | `12_gate-engine-full.log` |
| 13 | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | **209 计 / 204 过 / 0 失败 / 5 skip** | `13_i18n-shared-full.log` |
| 14 | `node --test "test/桌面UI/**/*.test.ts"` | 0 | **296 / 296 / 0 失败** | `14_desktop-ui-full.log` |
| 18 | 需求变更/decision/显示名回归焦点（8 文件） | 0 | **129 / 129**（`request-requirement-change-tool`、`request-choice-decision-card`、`request-requirement-change`、`requirement-change-judge-guidance`、`decision-card` ×2、`requirement-change-cards`、`operator-wiring`） | `18_probe-requirement-change-regression.log` |

**桌面首跑失败记录（如实保留）**：`test/桌面应用/acceptance-dispatch.test.ts:5121`「gate 处置：报告 pass ⇒
completeGateStep + artifact.observed + gate.review(pass) + 下游放行」断言「恰一条 gate.review 审计」得到 0 条。
该用例先等待 gate 记录文件 `status === "passed"`，但 `app/desktop/interface.ts:6971` 先写 gate 记录、
`interface.ts:6976` 才追加 `gate.review` 账本——测试的等待条件早于审计写入，是**既有测试侧检查-读取时序
竞争**；单文件隔离 95/95、全目录复跑 696/696。该用例与所属文件不在本批 A/B 修改内（gate 批次既有用例），
不计为本批缺陷，建议属主把等待条件改为 gate.review 账本条目（记录项）。

## 独立探针（不属于产品/测试代码，仅本角色证据）

| # | 探针 | 结果 | 证据 |
| --- | --- | --- | --- |
| 15 | 骨架落盘形状/幂等/fail-closed/零副作用/并发 + 骨架→完整流程替换结构 + 三态文案（26 断言） | **26/26 PASS** | `15_probe-skeleton.mjs` / `15_probe-skeleton.txt` |
| 16 | 真实 SessionManager + 假句柄：send() 时骨架已存在、回执成功、账本恰一条 `dispatch.accepted{intent-handoff}`、不写 `intent.handed-off`/`customer.decision`、`.ans` 仅审计账本、完整流程不覆盖（11 断言） | **11/11 PASS** | `16_probe-handoff-order.mjs` / `16_probe-handoff-order.txt` |
| 17 | 默认时限实测：不注入 `handOffIntentLimits` 时超时回执在 **45,023ms** 返回（非旧 20s）；只注 `totalMs=400` 时阶段预算回落总预算（419ms） | **4/4 PASS** | `17_probe-handoff-deadline.mjs` / `17_probe-handoff-deadline.txt` |
